'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const st = require('../search-terms');
const va = require('../venue-activity');

const NOW = new Date('2026-11-06T20:00:00Z');
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '') => ({ headers: { 'user-agent': ua, cookie } });
const memDb = () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE search_term_counts (day TEXT NOT NULL, source TEXT NOT NULL, term TEXT NOT NULL, found INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, source, term, found));`);
  return d;
};

test('clean keeps ordinary words and drops anything that could identify a person', () => {
  assert.equal(st.clean('  Dog   Friendly PATIO '), 'dog friendly patio');
  assert.equal(st.clean('Joe’s Pizza & Pasta!'), "joe's pizza & pasta");
  assert.equal(st.clean('terrasse près du lac'), 'terrasse près du lac');
  assert.equal(st.clean('email me at a@b.com'), '');
  assert.equal(st.clean('visit www.example.com'), '');
  assert.equal(st.clean('call 250-555-1234'), '');
  assert.equal(st.clean('x'), '');
  assert.equal(st.clean('a '.repeat(12)), '');
  assert.equal(st.clean('z'.repeat(81)), '');
  assert.equal(st.clean('<script>alert(1)</script>'), 'script alert 1 script');
});

test('records searches; bots, internal visits and unreadable text are ignored; found and not found are counted apart', () => {
  const db = memDb(); const c = st.createSearchTermCounter(db);
  assert.equal(c.record(req(), 'site', 'Brewery', true, '2.2.2.2', NOW), true);
  assert.equal(c.record(req(), 'site', 'brewery', true, '2.2.2.2', NOW), true);
  assert.equal(c.record(req(), 'site', 'axe throwing', false, '2.2.2.2', NOW), true);
  assert.equal(c.record(req(), 'trip', 'weekend in kelowna with my dog', true, '2.2.2.2', NOW), true);
  assert.equal(c.record(req('Googlebot/2.1'), 'site', 'brewery', true, '3.3.3.3', NOW), false);
  assert.equal(c.record(req(undefined, 'roam_internal=1'), 'site', 'brewery', true, '3.3.3.3', NOW), false);
  assert.equal(c.record(req(), 'site', 'me@x.com', true, '3.3.3.3', NOW), false);
  assert.equal(c.record(req(), 'other', 'brewery', true, '3.3.3.3', NOW), false);
  const r = c.report(30, 100, NOW);
  assert.equal(r.totals.site, 3); assert.equal(r.totals.trip, 1); assert.equal(r.totals.none, 1);
  assert.deepEqual(r.top.map((x) => [x.term, x.n, x.none]), [['brewery', 2, 0], ['axe throwing', 1, 1]]);
  assert.deepEqual(r.missing.map((x) => x.term), ['axe throwing']);
  assert.equal(r.trip[0].term, 'weekend in kelowna with my dog');
  assert.equal(r.per_day.length, 30);
  assert.equal(r.per_day[29].n, 4);
});

test('outbound: ranks businesses by clicks out and sums website, booking, phone, directions, menu, social', () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE venue_event_counts (day TEXT NOT NULL, venue_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, venue_id, name));
  CREATE TABLE event_click_counts (day TEXT NOT NULL, event_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event_id, name));
  CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, region TEXT, start_datetime TEXT);
  INSERT INTO venues (id, name, region, type) VALUES (1, 'Alpha', 'Kelowna', 'brewery'), (2, 'Beta', 'Vernon', 'cafe'), (3, 'Quiet', 'Kelowna', 'cafe');
  INSERT INTO venue_event_counts VALUES
   ('2026-11-06', 1, 'venue_view', 50), ('2026-11-06', 1, 'click:website', 5), ('2026-11-06', 1, 'click:call_button', 2), ('2026-11-06', 1, 'click:phone_number', 1), ('2026-11-06', 1, 'click:directions', 2),
   ('2026-11-06', 2, 'venue_view', 10), ('2026-11-06', 2, 'click:booking', 4), ('2026-11-06', 2, 'click:full_menu', 3), ('2026-11-06', 2, 'click:other_link', 9),
   ('2026-11-06', 3, 'venue_view', 99), ('2026-10-01', 2, 'click:website', 40);`);
  const o = va.createCounter(d).outbound(30, 100, NOW);
  assert.deepEqual(o.businesses.map((b) => [b.name, b.total]), [['Alpha', 10], ['Beta', 7]]);
  assert.equal(o.businesses[0].phone, 3); assert.equal(o.businesses[1].menu, 3);
  assert.equal(o.businesses[0].rate, 20); assert.equal(o.totals.total, 17); assert.equal(o.with_clicks, 2);
  assert.equal(va.createCounter(d).outbound(90, 1, NOW).businesses.length, 1);
});

test('the new pages render both sites and a missing site shows its message', () => {
  const { renderSearchTermsPage } = require('../search-terms-page');
  const { renderOutboundPage } = require('../outbound-page');
  const db = memDb(); const c = st.createSearchTermCounter(db);
  c.record(req(), 'site', 'axe throwing', false, '4.4.4.4', NOW);
  const html = renderSearchTermsPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.report(30, 100, NOW) }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }] });
  assert.match(html, /axe throwing/); assert.match(html, /Not connected yet/); assert.match(html, /Found nothing/);
  const html2 = renderOutboundPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: { totals: { total: 1, website: 1, booking: 0, phone: 0, directions: 0 }, businesses: [{ id: 1, name: 'Alpha <b>', region: 'Kelowna', views: 5, total: 1, rate: 20, website: 1, booking: 0, phone: 0, directions: 0, menu: 0, social: 0 }], with_clicks: 1, counting_since: '2026-11-05' } }] });
  assert.match(html2, /Alpha &lt;b&gt;/); assert.doesNotMatch(html2, /Alpha <b>/);
});
