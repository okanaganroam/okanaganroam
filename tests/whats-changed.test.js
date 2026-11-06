'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const wc = require('../whats-changed');

const NOW = new Date('2026-11-09T16:00:00Z'); // Monday 8 AM Pacific
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE venue_event_counts (day TEXT NOT NULL, venue_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, venue_id, name));
  CREATE TABLE referral_counts (day TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, source, page));
  CREATE TABLE search_term_counts (day TEXT NOT NULL, source TEXT NOT NULL, term TEXT NOT NULL, found INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, source, term, found));
  CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));
  CREATE TABLE not_found_counts (day TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, ref TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, path, ref));
  CREATE TABLE venue_claims (id INTEGER PRIMARY KEY, status TEXT, submitted_at TEXT, reviewed_at TEXT);
  INSERT INTO venues (id, name, region, type) VALUES (1, 'Alpha Brewing', 'Kelowna', 'brewery'), (2, 'Beta Cafe', 'Vernon', 'cafe'), (3, 'Old Name', 'Kelowna', 'cafe');
  UPDATE venues SET redirect_to = 1 WHERE id = 3;`);
  return d;
}

test('windows: the 7 complete days ending yesterday, and the 7 before', () => {
  const w = wc.windows(NOW);
  assert.deepEqual(w.cur, { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(w.prev, { start: '2026-10-26', end: '2026-11-01' });
});

test('headlines: only real moves; small numbers are not news; biggest first', () => {
  const h = wc.headlines([
    { label: 'A', cur: 12, prev: 5 }, { label: 'B', cur: 2, prev: 0 }, { label: 'C', cur: 100, prev: 95 }, { label: 'D', cur: 0, prev: 20 }, { label: 'E', cur: 9, prev: 0 },
  ]);
  assert.deepEqual(h, ['D: 0, down from 20', 'E: 9 (none the week before)', 'A: 12, up from 5']);
});

test('summarize: metrics and lists for this week against the week before', () => {
  const db = memDb();
  const v = db.prepare('INSERT INTO venue_event_counts VALUES (?, ?, ?, ?)');
  v.run('2026-11-03', 1, 'venue_view', 30); v.run('2026-10-28', 1, 'venue_view', 10); v.run('2026-11-04', 2, 'venue_view', 8); v.run('2026-11-04', 3, 'venue_view', 50);
  v.run('2026-11-05', 1, 'click:website', 4); v.run('2026-11-05', 1, 'click:other_link', 99); v.run('2026-11-08', 2, 'click:directions', 2);
  const r = db.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)');
  r.run('2026-11-03', 'visit', 'ai:chatgpt', '/x', 6); r.run('2026-10-28', 'visit', 'ai:chatgpt', '/x', 2); r.run('2026-11-03', 'visit', 'email:2026-10-claim-follow-up', '/y', 4); r.run('2026-11-03', 'ai_fetch', 'chatgpt', '/x', 50);
  const s = db.prepare('INSERT INTO search_term_counts VALUES (?, ?, ?, ?, ?)');
  s.run('2026-11-04', 'site', 'axe throwing', 0, 3); s.run('2026-11-04', 'site', 'brewery', 1, 5); s.run('2026-10-28', 'site', 'brewery', 1, 2); s.run('2026-11-04', 'trip', 'weekend trip', 1, 9);
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)').run('2026-11-05', 'trip_plan_start', 7);
  const n = db.prepare('INSERT INTO not_found_counts VALUES (?, ?, ?, ?, ?)');
  n.run('2026-11-05', 'visitor', '/gone', '', 3); n.run('2026-10-28', 'visitor', '/older', '', 2); n.run('2026-11-05', 'crawler', '/bot', '', 40); n.run('2026-11-05', 'visitor', '/older', '', 1);
  db.exec("INSERT INTO venue_claims VALUES (1, 'approved', '2026-11-04 10:00:00', '2026-11-05 10:00:00'), (2, 'pending', '2026-10-20 10:00:00', NULL)");
  const d = wc.summarize(db, NOW);
  const m = Object.fromEntries(d.metrics.map((x) => [x.key, [x.cur, x.prev]]));
  assert.deepEqual(m.views, [88, 10]);       // the total counts every page view, including the redirected venue 3
  assert.deepEqual(m.outbound, [6, 0]);      // other_link is not an outbound click
  assert.deepEqual(m.visits_ai, [6, 2]); assert.deepEqual(m.visits_email, [4, 0]);
  assert.deepEqual(m.searches, [8, 2]); assert.deepEqual(m.searches_none, [3, 0]);
  assert.deepEqual(m.trip_plan_start, [7, 0]); assert.deepEqual(m.claims, [1, 0]); assert.deepEqual(m.claims_approved, [1, 0]);
  assert.deepEqual(m.broken, [4, 2]);
  assert.deepEqual(d.lists.top_businesses.map((b) => [b.name, b.views, b.prev]), [['Alpha Brewing', 30, 10], ['Beta Cafe', 8, 0]]);
  assert.deepEqual(d.lists.rising_businesses.map((b) => b.name), ['Alpha Brewing', 'Beta Cafe']);
  assert.deepEqual(d.lists.top_outbound.map((b) => [b.name, b.clicks]), [['Alpha Brewing', 4], ['Beta Cafe', 2]]);
  assert.deepEqual(d.lists.top_searches.map((x) => x.term), ['brewery', 'axe throwing']);
  assert.deepEqual(d.lists.new_searches.map((x) => x.term), ['axe throwing']);
  assert.deepEqual(d.lists.no_results.map((x) => x.term), ['axe throwing']);
  assert.deepEqual(d.lists.broken_pages, [{ path: '/gone', n: 3, is_new: true }, { path: '/older', n: 1, is_new: false }]);
  assert.ok(d.headlines.length > 0);
});

test('summarize copes with a database that lacks the newer tables', () => {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER)');
  const out = wc.summarize(d, NOW);
  assert.deepEqual(out.metrics, []); assert.deepEqual(out.headlines, []);
});

test('renderers: the card and the email escape text and show both sites', () => {
  const page = require('../whats-changed-page');
  const db = memDb(); db.prepare('INSERT INTO venue_event_counts VALUES (?, ?, ?, ?)').run('2026-11-03', 1, 'venue_view', 30);
  db.prepare('UPDATE venues SET name = ? WHERE id = 1').run('Alpha <b>Brewing</b>');
  const data = wc.summarize(db, NOW);
  data.google = wc.googleSection({ trends: { current: { start: '2026-10-30', end: '2026-11-05', clicks: 5, impressions: 50 }, previous: { clicks: 9, impressions: 90 }, queries: { rising: [{ key: 'a <i>', clicks: 1, d_clicks: 1, d_impressions: 5 }], falling: [] } } });
  const sites = [{ key: 'okanagan', name: 'Okanagan Roam', data }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }];
  const html = page.cardHtml(sites, { notice: 'Sent.' }); const mail = page.emailHtml(sites); const text = page.emailText(sites);
  for (const out of [html, mail]) { assert.match(out, /Okanagan Roam/); assert.match(out, /Not connected yet/); assert.doesNotMatch(out, /<b>Brewing/); assert.doesNotMatch(out, /<i>/); }
  assert.match(html, /digest-send/); assert.match(text, /OKANAGAN ROAM/); assert.match(text, /Alpha <b>Brewing<\/b>/);
  assert.match(text, /Google/);
});
