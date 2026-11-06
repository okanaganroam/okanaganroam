'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const es = require('../email-stats');

const NOW = new Date('2026-11-06T20:00:00Z');
const db = () => {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE referral_counts (day TEXT, kind TEXT, source TEXT, page TEXT, n INTEGER, PRIMARY KEY (day, kind, source, page));');
  const put = d.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)');
  put.run('2026-11-05', 'visit', 'email:claim-follow-up', '/a', 4); put.run('2026-11-05', 'visit', 'email:claim-follow-up', '/b', 1);
  put.run('2026-11-05', 'visit', 'search:google', '/a', 9); put.run('2026-08-01', 'visit', 'email:old', '/a', 7);
  return d;
};
const AGG = { requests: 200, delivered: 180, hardBounces: 12, softBounces: 3, blocked: 2, invalid: 1, spamReports: 1, uniqueOpens: 90, uniqueClicks: 9, unsubscribed: 2 };
const fake = (calls, status = 200) => async (url, o) => {
  calls.push({ url, key: o.headers['api-key'] });
  if (status !== 200) return { ok: false, status };
  return { ok: true, json: async () => (url.includes('aggregatedReport') ? AGG : { reports: [{ date: '2026-11-05', requests: 7 }] }) };
};

test('rates and warnings: bounces and complaints are shares of mail sent; small batches do not warn', () => {
  const t = es.shape(AGG);
  assert.deepEqual([t.delivered_rate, t.bounce_rate, t.complaint_rate, t.open_rate, t.click_rate], [90, 7.5, 0.5, 50, 5]);
  const w = es.warnings(t);
  assert.equal(w.length, 2); assert.match(w[0], /Bounces are 7\.5%/); assert.match(w[1], /Spam complaints/);
  assert.deepEqual(es.warnings(es.shape({ requests: 10, hardBounces: 9 })), []);
  assert.equal(es.shape({}).bounce_rate, null);
});

test('reads Brevo once per half hour and adds email link visits from our own counts', async () => {
  const calls = []; const s = es.createEmailStats(db(), { key: () => 'k', fetch: fake(calls) });
  const r = await s.report(30, NOW);
  assert.equal(r.connected, true); assert.equal(r.totals.sent, 200);
  assert.deepEqual(r.per_day, [{ day: '2026-11-05', n: 7 }]);
  assert.deepEqual(r.campaigns, [{ campaign: 'claim-follow-up', visits: 5 }]);
  assert.equal(calls.length, 2); assert.ok(calls.every((c) => c.key === 'k'));
  await s.report(30, new Date(NOW.getTime() + 60000));
  assert.equal(calls.length, 2);
  await s.report(30, new Date(NOW.getTime() + 31 * 60000));
  assert.equal(calls.length, 4);
});

test('no key or a Brevo error shows a plain message, keeps link visits, and never shows the key', async () => {
  const off = await es.createEmailStats(db(), { key: () => '' }).report(30, NOW);
  assert.equal(off.connected, false); assert.match(off.error, /BREVO_API_KEY/); assert.equal(off.campaigns.length, 1);
  const bad = await es.createEmailStats(db(), { key: () => 'secret-key', fetch: fake([], 401) }).report(30, NOW);
  assert.equal(bad.connected, false); assert.match(bad.error, /Brevo answered 401/);
  assert.doesNotMatch(JSON.stringify(bad), /secret-key/);
  const down = await es.createEmailStats(db(), { key: () => 'k', fetch: async () => { throw new Error('boom secret'); } }).report(30, NOW);
  assert.match(down.error, /Couldn’t reach Brevo/);
});

test('the email page draws connected, not connected, and with a site that cannot be reached', async () => {
  const { renderEmailPage } = require('../pages-page');
  const on = await es.createEmailStats(db(), { key: () => 'k', fetch: fake([]) }).report(30, NOW);
  const off = await es.createEmailStats(db(), { key: () => '' }).report(30, NOW);
  const html = renderEmailPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: on }, { key: 'whistler', name: 'Whistler Roam', data: off }, { key: 'x', name: 'X', error: 'Not connected yet.' }] });
  assert.match(html, /Email results/); assert.match(html, /claim-follow-up/); assert.match(html, /Bounces are 7\.5%/); assert.match(html, /BREVO_API_KEY/); assert.match(html, /Not connected yet/);
  assert.match(html, /Nobody can see inbox or spam placement/);
});
