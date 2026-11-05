'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const va = require('../venue-activity');
const { renderBusinessPage } = require('../venue-activity-page');

const NOW = new Date('2026-11-05T20:00:00Z');
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '') => ({ headers: { 'user-agent': ua, cookie } });
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE venue_event_counts (day TEXT NOT NULL, venue_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, venue_id, name));
  CREATE TABLE trip_demand_events (day TEXT, visitor TEXT, venue_id INTEGER, kind TEXT, created_at TEXT);
  INSERT INTO venues (id, name, region, type) VALUES (1, 'Rustic Reel Brewing', 'Kelowna', 'brewery'), (2, 'Reel Deal 100% Tacos', 'Kelowna', 'restaurant'), (3, 'Old Name', 'Kelowna', 'cafe');
  UPDATE venues SET redirect_to = 1 WHERE id = 3;`);
  return d;
}

test('counts views and link clicks per business; bad names, bots, internal and unknown businesses are ignored', () => {
  const db = memDb(); const c = va.createCounter(db);
  assert.equal(c.record(req(), 1, 'venue_view', '1.1.1.1', NOW), true);
  assert.equal(c.record(req(), 1, 'venue_view', '1.1.1.1', NOW), true);
  assert.equal(c.record(req(), 1, 'outbound_click:website', '1.1.1.1', NOW), true);
  assert.equal(c.record(req(), 1, 'outbound_click:Website<x>', '1.1.1.1', NOW), false);
  assert.equal(c.record(req(), 1, 'something_else', '1.1.1.1', NOW), false);
  assert.equal(c.record(req(), 999, 'venue_view', '1.1.1.1', NOW), false);
  assert.equal(c.record(req(), 3, 'venue_view', '1.1.1.1', NOW), false, 'redirected business is not counted');
  assert.equal(c.record(req('Googlebot/2.1'), 1, 'venue_view', '1.1.1.1', NOW), false);
  assert.equal(c.record(req(undefined, 'roam_internal=1'), 1, 'venue_view', '1.1.1.1', NOW), false);
  const d = c.detail(1, 30, NOW);
  assert.equal(d.views, 2); assert.equal(d.clicks_total, 1); assert.deepEqual(d.clicks, [{ type: 'website', n: 1 }]);
  assert.equal(d.views_per_day.at(-1).n, 2);
});

test('detail includes Build My Trip demand for that business', () => {
  const db = memDb(); const c = va.createCounter(db);
  db.exec("INSERT INTO trip_demand_events VALUES ('2026-11-05','a',1,'shown',''),('2026-11-05','a',1,'add',''),('2026-11-05','b',1,'add',''),('2026-11-05','b',2,'add','')");
  const d = c.detail(1, 7, NOW);
  assert.deepEqual(d.demand, { shown: 1, added: 2, removed: 0, adders: 2 });
});

test('search matches by name, treats % and _ literally, and needs two letters', () => {
  const c = va.createCounter(memDb());
  assert.deepEqual(c.search('reel').map((m) => m.id).sort(), [1, 2]);
  assert.equal(c.search('rustic')[0].id, 1);
  assert.equal(c.search('100%').length, 1);
  assert.equal(c.search('%%').length, 0);
  assert.equal(c.search('r').length, 0);
  assert.equal(c.search('old name').length, 0, 'redirected business is hidden');
});

test('one address cannot inflate the counts past the hourly cap', () => {
  const c = va.createCounter(memDb());
  let ok = 0;
  for (let i = 0; i < va.RATE_PER_HOUR + 40; i += 1) if (c.record(req(), 1, 'venue_view', '9.9.9.9', NOW)) ok += 1;
  assert.equal(ok, va.RATE_PER_HOUR);
});

test('page: escapes names, shows results for both sites and the detail card', () => {
  const html = renderBusinessPage({ q: '<b>x', days: 30, searched: true, results: [
    { key: 'okanagan', name: 'Okanagan Roam', matches: [{ id: 1, name: '<img src=x onerror=1>', region: 'Kelowna', type: 'brewery' }], error: null },
    { key: 'whistler', name: 'Whistler Roam', matches: [], error: 'Couldn’t reach Whistler Roam right now.' },
  ] });
  assert.ok(!html.includes('<img src=x')); assert.match(html, /Couldn’t reach Whistler/);
  const d = memDb(); const c = va.createCounter(d); c.record(req(), 1, 'outbound_click:phone', '1.1.1.1', NOW);
  const page = renderBusinessPage({ q: 'rustic', days: 30, detail: { key: 'okanagan', name: 'Okanagan Roam', data: c.detail(1, 30, NOW), error: null }, results: [] });
  assert.match(page, /Rustic Reel Brewing/); assert.match(page, /Phone/);
});
