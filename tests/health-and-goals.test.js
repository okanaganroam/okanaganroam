'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const health = require('../health');
const goals = require('../seo-goals');

const NOW = new Date('2026-11-20T20:00:00Z'); // yesterday = 2026-11-19
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE venue_event_counts (day TEXT NOT NULL, venue_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, venue_id, name));
  CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));
  CREATE TABLE referral_counts (day TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, source, page));`);
  return d;
}
const dayBefore = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
const fill = (db, from, to, fn) => { for (let i = from; i >= to; i -= 1) fn(dayBefore(i)); };

test('health: a counter that was active and recorded nothing yesterday is silent; a big drop is low; normal is ok', () => {
  const db = memDb();
  fill(db, 13, 2, (day) => { db.prepare("INSERT INTO venue_event_counts VALUES (?, 1, 'venue_view', 40)").run(day); db.prepare('INSERT INTO site_event_counts VALUES (?, ?, 30)').run(day, 'open_map'); db.prepare("INSERT INTO referral_counts VALUES (?, 'crawl', 'x', '', 50)").run(day); });
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, 2)').run(dayBefore(1), 'open_map');            // drops to 2 (normal 30)
  db.prepare("INSERT INTO referral_counts VALUES (?, 'crawl', 'x', '', 45)").run(dayBefore(1));           // normal
  const h = health.check(db, NOW);
  const st = Object.fromEntries(h.counters.map((c) => [c.key, c.status]));
  assert.deepEqual(st, { venue_view: 'silent', site_events: 'low', crawls: 'ok' });
  assert.deepEqual(h.silent, ['venue_view']);
  assert.equal(h.problems.length, 2); assert.match(h.problems[0], /Business page views recorded nothing yesterday/);
});

test('health: too little history is learning, and a quiet counter is never flagged', () => {
  const db = memDb();
  fill(db, 3, 1, (day) => db.prepare("INSERT INTO venue_event_counts VALUES (?, 1, 'venue_view', 100)").run(day)); // 3 days of history
  fill(db, 13, 1, (day) => db.prepare('INSERT INTO site_event_counts VALUES (?, ?, 2)').run(day, 'open_map'));       // normal 2 a day: too quiet to judge
  const h = health.check(db, NOW);
  const st = Object.fromEntries(h.counters.map((c) => [c.key, c.status]));
  assert.equal(st.venue_view, 'learning'); assert.equal(st.site_events, 'ok');
  assert.deepEqual(h.problems, []);
});

test('goals: progress along baseline to target against time elapsed, with a grace margin', () => {
  const g = { baseline: 55, target: 300 };
  assert.deepEqual(goals.progress(g, 56, '2026-11-03', '2027-01-31', new Date('2026-11-06T12:00:00Z')).status, 'on track');
  assert.equal(goals.progress(g, 300, '2026-11-03', '2027-01-31', NOW).status, 'reached');
  assert.equal(goals.progress(g, 40, '2026-11-03', '2027-01-31', new Date('2026-12-20T12:00:00Z')).status, 'below the starting point');
  assert.equal(goals.progress(g, 100, '2026-11-03', '2027-01-31', new Date('2027-01-15T12:00:00Z')).status, 'behind');
  assert.equal(goals.progress(g, null, '2026-11-03', '2027-01-31', NOW).status, 'not measured');
  assert.equal(goals.progress(g, 177.5, '2026-11-03', '2027-01-31', NOW).progress, 50);
});

test('goals: the data file is valid and evaluate mixes live and typed-in numbers', () => {
  const cfg = goals.load();
  assert.ok(cfg && cfg.goals.length === 5);
  const ev = goals.evaluate(cfg, { gsc_nonbrand: { per_day: 56.1, last7_per_day: 11.4, start: '2026-10-08', end: '2026-11-04' }, ga_chatgpt: { sessions: 83 } }, new Date('2026-11-06T12:00:00Z'));
  const by = Object.fromEntries(ev.goals.map((x) => [x.key, x]));
  assert.equal(by.nonbrand_impressions.current, 56.1); assert.match(by.nonbrand_impressions.extra, /11.4/);
  assert.equal(by.chatgpt_sessions.current, 83); assert.equal(by.chatgpt_sessions.status, 'below the starting point');
  assert.equal(by.linking_sites.current, 12); assert.match(by.linking_sites.measured, /2026-10-23/);
  const off = goals.evaluate(cfg, {}, NOW);
  assert.equal(off.goals[0].current, null); assert.match(off.goals[0].note, /not connected/);
  assert.equal(goals.load('/nonexistent.json'), null);
});

test('renderers: the health lines, the goals card and the email show them, and escape text', () => {
  const wcp = require('../whats-changed-page'); const wc = require('../whats-changed');
  const db = memDb();
  fill(db, 13, 2, (day) => db.prepare("INSERT INTO venue_event_counts VALUES (?, 1, 'venue_view', 40)").run(day));
  const data = { ...wc.summarize(db, NOW), health: health.check(db, NOW), connections: { google_search: 'bad <i>news' } };
  const g = goals.evaluate(goals.load(), { gsc_nonbrand: { per_day: 56, last7_per_day: 11, start: 'a', end: 'b' }, ga_chatgpt: { sessions: 83 } }, new Date('2026-11-06T12:00:00Z'));
  const sites = [{ key: 'okanagan', name: 'Okanagan Roam', data }];
  const html = wcp.cardHtml(sites, { goals: g }); const text = wcp.emailText(sites, { goals: g }); const mail = wcp.emailHtml(sites, { goals: g });
  assert.match(html, /recorded nothing yesterday/); assert.match(html, /Goals for 2027-01-31/); assert.match(html, /below the starting point/);
  assert.match(text, /!! Business page views recorded nothing/); assert.match(text, /Goals for 2027-01-31/); assert.match(mail, /Goals for 2027-01-31/);
  for (const out of [html, mail]) assert.doesNotMatch(out, /<i>news/);
});
