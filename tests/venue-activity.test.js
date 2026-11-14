'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const va = require('../venue-activity');
const labels = require('../click-labels');
const { renderBusinessPage } = require('../venue-activity-page');

const NOW = new Date('2026-11-05T20:00:00Z');
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '') => ({ headers: { 'user-agent': ua, cookie } });
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE venue_event_counts (day TEXT NOT NULL, venue_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, venue_id, name));
  CREATE TABLE event_click_counts (day TEXT NOT NULL, event_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event_id, name));
  CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, region TEXT, start_datetime TEXT);
  INSERT INTO events VALUES (7, 'Friday Trivia Night', 'kelowna', '2026-11-06T19:00');
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

test('click sheet: only known items are counted; the sheet lists every item with zeros', () => {
  const c = va.createCounter(memDb());
  assert.equal(c.record(req(), 1, 'click:see_hours', '2.2.2.2', NOW), true);
  assert.equal(c.record(req(), 1, 'click:see_hours', '2.2.2.2', NOW), true);
  assert.equal(c.record(req(), 1, 'click:full_menu', '2.2.2.2', NOW), true);
  assert.equal(c.record(req(), 1, 'click:made_up_item', '2.2.2.2', NOW), false);
  assert.equal(c.record(req(), 1, 'click:See<b>', '2.2.2.2', NOW), false);
  const d = c.detail(1, 30, NOW);
  assert.equal(d.sheet_total, 3);
  const by = Object.fromEntries(d.sheet.map((r) => [r.key, r.n]));
  assert.equal(by.see_hours, 2); assert.equal(by.full_menu, 1); assert.equal(by.website, 0);
  assert.ok(d.sheet.length === labels.labelsFor('venue').length && d.sheet.every((r) => r.text && r.group));
  assert.equal(d.clicks_total, 0, 'old link-click counting is unchanged by sheet clicks');
  assert.ok(!d.sheet.some((r) => r.key === 'tickets_info'), 'event-only items are not on a business sheet');
});

test('events: views and clicks are counted per event, search finds events, unknown events are ignored', () => {
  const c = va.createCounter(memDb());
  assert.equal(c.recordEvent(req(), 7, 'event_view', '3.3.3.3', NOW), true);
  assert.equal(c.recordEvent(req(), 7, 'click:tickets_info', '3.3.3.3', NOW), true);
  assert.equal(c.recordEvent(req(), 7, 'click:full_menu', '3.3.3.3', NOW), true, 'valid key, counted as given (sheet only shows event items)');
  assert.equal(c.recordEvent(req(), 7, 'venue_view', '3.3.3.3', NOW), false);
  assert.equal(c.recordEvent(req(), 99, 'event_view', '3.3.3.3', NOW), false);
  assert.equal(c.recordEvent(req('Googlebot/2.1'), 7, 'event_view', '3.3.3.3', NOW), false);
  const d = c.detailEvent(7, 30, NOW);
  assert.equal(d.views, 1);
  const by = Object.fromEntries(d.sheet.map((r) => [r.key, r.n]));
  assert.equal(by.tickets_info, 1); assert.equal(by.add_to_calendar, 0);
  assert.ok(!d.sheet.some((r) => r.key === 'see_hours'));
  assert.deepEqual(c.searchEvents('trivia').map((m) => [m.id, m.type]), [[7, 'event']]);
  assert.equal(c.detailEvent(99), null);
});

test('click items: keys are unique, lowercase, and each has a selector; the browser classifier ships them all', () => {
  const keys = labels.LABELS.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((k) => /^[a-z_]{1,32}$/.test(k)));
  assert.ok(labels.LABELS.every((l) => l.sel && l.pages.length));
  const js = labels.clientClassifierJs();
  for (const k of keys) assert.ok(js.includes(`"${k}"`), k);
  // The fallbacks come last so a specific item always wins.
  assert.equal(keys.at(-1), 'other_button'); assert.equal(keys.at(-2), 'other_link');
});

test('page: the click sheet shows every item and event results link with kind=event', () => {
  const c = va.createCounter(memDb());
  c.record(req(), 1, 'click:see_hours', '4.4.4.4', NOW);
  const html = renderBusinessPage({ q: 'x', days: 30, detail: { key: 'okanagan', name: 'Okanagan Roam', data: c.detail(1, 30, NOW) } });
  assert.match(html, /Everything clickable on this page/); assert.match(html, /See hours/); assert.match(html, /Add to trip/);
  const res = renderBusinessPage({ q: 'triv', days: 30, results: [{ key: 'okanagan', name: 'Okanagan Roam', matches: c.searchEvents('trivia') }], searched: true });
  assert.match(res, /kind=event/);
});

test('most viewed: businesses ranked by page views in the window, with clicks; zero-view and redirected ones left out', () => {
  const db = memDb(); const c = va.createCounter(db);
  for (let i = 0; i < 3; i += 1) c.record(req(), 1, 'venue_view', '8.8.8.8', NOW);
  c.record(req(), 2, 'venue_view', '8.8.8.8', NOW);
  c.record(req(), 2, 'click:website', '8.8.8.8', NOW); c.record(req(), 2, 'click:directions', '8.8.8.8', NOW);
  c.record(req(), 1, 'click:website', '8.8.8.8', NOW);
  db.exec("INSERT INTO venue_event_counts VALUES ('2026-11-05', 3, 'venue_view', 99)");
  db.exec("INSERT INTO venue_event_counts VALUES ('2026-08-01', 2, 'venue_view', 500)");
  c.recordEvent(req(), 7, 'event_view', '8.8.8.8', NOW);
  const t = c.top(30, 100, NOW);
  assert.deepEqual(t.businesses.map((b) => [b.id, b.views, b.clicks]), [[1, 3, 1], [2, 1, 2]]);
  assert.deepEqual(t.events.map((e) => [e.id, e.views]), [[7, 1]]);
  assert.equal(c.top(30, 1, NOW).businesses.length, 1);
});

test('page: the landing view lists the most viewed businesses for each site, linking to their sheets', () => {
  const c = va.createCounter(memDb());
  c.record(req(), 1, 'venue_view', '8.8.8.8', NOW);
  const html = renderBusinessPage({ q: '', days: 30, tops: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.top(30, 100, NOW) }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }] });
  assert.match(html, /most viewed, last 30 days/); assert.match(html, /Rustic Reel Brewing/); assert.match(html, /site=okanagan&id=1/); assert.match(html, /Not connected yet/);
});
