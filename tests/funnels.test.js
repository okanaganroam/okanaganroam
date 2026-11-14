'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const r = require('../referrals');
const { createFunnels } = require('../funnels');

const NOW = new Date('2026-11-06T20:00:00Z');
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE referral_counts (day TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, source, page));
  CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));
  CREATE TABLE trip_demand_events (day TEXT, visitor TEXT, venue_id INTEGER, kind TEXT);
  CREATE TABLE venue_claims (id INTEGER PRIMARY KEY, status TEXT, submitted_at TEXT, reviewed_at TEXT);
  CREATE TABLE owner_accounts (id INTEGER PRIMARY KEY, created_at TEXT, last_login_at TEXT);
  CREATE TABLE owner_change_requests (id INTEGER PRIMARY KEY, status TEXT, submitted_at TEXT, reviewed_at TEXT);`);
  return d;
}
function hit(c, url, { referer, code = 200, ip = '9.9.9.9' } = {}) {
  const req = { method: 'GET', url, headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari', referer, cookie: '' } };
  const res = new EventEmitter(); res.statusCode = code; res.getHeader = () => 'text/html; charset=utf-8'; res._header = '';
  c.watch(req, res, ip, () => NOW); res.emit('finish');
}

test('classifyVisit: a link in our own email counts by campaign, with or without a referrer', () => {
  assert.deepEqual(r.classifyVisit(undefined, 'venue_outreach', 'email', '2026-10-claim-follow-up'), { group: 'email', source: '2026-10-claim-follow-up' });
  assert.deepEqual(r.classifyVisit('https://mail.google.com/', 'venue_outreach', 'EMAIL', 'Wave 7!'), { group: 'email', source: 'wave7' });
  assert.deepEqual(r.classifyVisit(undefined, 'x', 'email'), { group: 'email', source: 'x' });
  assert.equal(r.classifyVisit(undefined, 'newsletter', 'social'), null);
  assert.deepEqual(r.classifyVisit('https://www.google.com/'), { group: 'search', source: 'google' });
});

test('email visits are counted, including to a private edit link without keeping its secret', () => {
  const db = memDb(); const c = r.createReferralCounter(db);
  hit(c, '/west-kelowna/wineries/rollingdale-winery?utm_source=venue_outreach&utm_medium=email&utm_campaign=2026-10-claim-follow-up');
  hit(c, '/owner/AbCdEfGhIjKlMnOpQrSt1234?utm_source=venue_outreach&utm_medium=email&utm_campaign=2026-10-claim-follow-up');
  hit(c, '/claim/some-venue?utm_medium=email&utm_campaign=2026-10-claim-follow-up');
  hit(c, '/owner/AbCdEfGhIjKlMnOpQrSt1234'); // no email tag: private pages stay uncounted
  const rep = r.createReferralCounter(db).report(30, NOW);
  assert.equal(rep.totals.email, 3);
  assert.deepEqual(rep.landing_email.map((x) => x.page).sort(), ['/claim/(claim page)', '/owner/(emailed edit link)', '/west-kelowna/wineries/rollingdale-winery'].sort());
  assert.ok(!JSON.stringify(rep).includes('AbCdEf'));
  assert.equal(rep.email_per_day[29].n, 3);
});

test('funnels: trip steps with drop-off, people view, claim steps, campaigns and exact records', () => {
  const db = memDb();
  const ins = db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)');
  for (const [n, v] of [['page_view:trip', 100], ['trip_plan_start', 40], ['trip_plan_complete', 30], ['add_whole_trip', 6], ['add_to_trip', 50], ['open_my_trip', 20], ['trip_share', 2], ['portal:edit_link_view', 12], ['portal:edit_link_send', 3], ['portal:login_success', 5], ['portal_claim_click', 4], ['portal_login_click_menu', 6]]) ins.run('2026-11-06', n, v);
  ins.run('2026-09-01', 'page_view:trip', 999);
  const td = db.prepare('INSERT INTO trip_demand_events VALUES (?, ?, ?, ?)');
  td.run('2026-11-06', 'a', 1, 'shown'); td.run('2026-11-06', 'a', 1, 'add'); td.run('2026-11-06', 'b', 1, 'shown'); td.run('2026-11-06', 'c', 2, 'add');
  db.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)').run('2026-11-06', 'visit', 'email:2026-10-claim-follow-up', '/x', 8);
  db.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)').run('2026-11-06', 'visit', 'search:google', '/y', 5);
  db.exec(`INSERT INTO venue_claims VALUES (1, 'approved', '2026-11-05 10:00:00', '2026-11-05 12:00:00'), (2, 'pending', '2026-11-06 09:00:00', NULL), (3, 'approved', '2026-08-01 09:00:00', '2026-08-02 09:00:00');
  INSERT INTO owner_accounts VALUES (1, '2026-11-05 11:00:00', '2026-11-06 08:00:00'), (2, '2026-07-01 11:00:00', NULL);
  INSERT INTO owner_change_requests VALUES (1, 'approved', '2026-11-06 10:00:00', '2026-11-06 11:00:00');`);
  const f = createFunnels(db).report(30, NOW);
  assert.deepEqual(f.trip.planner.map((s) => s.n), [100, 40, 30, 6]);
  assert.deepEqual(f.trip.planner.map((s) => s.of_previous), [null, 40, 75, 20]);
  assert.equal(f.trip.my_trip[1].of_previous, 40);
  assert.deepEqual(f.trip.people, { shown: 2, added: 2, removed: 0, shown_then_added: 1 });
  assert.equal(f.claims.login_clicks, 10);
  assert.equal(f.claims.steps.find((s) => s.key === 'edit_link_view').n, 12);
  assert.deepEqual(f.claims.campaigns, [{ name: '2026-10-claim-follow-up', n: 8 }]);
  assert.deepEqual(f.claims.records, { claims_submitted: 2, claims_approved: 1, claims_waiting: 1, accounts_created: 1, owners_signed_in: 1, accounts_total: 2, changes_sent: 1, changes_approved: 1 });
  assert.equal(f.claims.claims_per_day[29].n, 1);
});

test('the funnels page renders both sites and escapes names', () => {
  const { renderFunnelsPage } = require('../funnels-page');
  const db = memDb();
  db.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)').run('2026-11-06', 'visit', 'email:<b>x', '/p', 2);
  const html = renderFunnelsPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: createFunnels(db).report(30, NOW) }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }] });
  assert.match(html, /Planner path/); assert.match(html, /Business claims and the portal/); assert.match(html, /Not connected yet/);
  assert.doesNotMatch(html, /<b>x/);
});
