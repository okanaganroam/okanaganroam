'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const inv = require('../page-inventory');
const va = require('../venue-activity');
const { renderBusinessPage } = require('../venue-activity-page');

const PAGE = `<!doctype html><html><head><script>var x = '<a href="/nope">no</a>';</script><style>a{color:red}</style></head><body>
<header><a href="/">Okanagan Roam</a><button class="nav-link-label">Discover</button></header>
<main><nav class="breadcrumb"><a href="/">Home</a><a href="/kelowna">Kelowna</a></nav>
<div class="venue-cta-row">
  <a class="cta" href="/map?directions=x" data-roam-directions>Get Directions</a>
  <a class="cta secondary" href="https://x.test/" data-track="website">Website ↗</a>
  <a class="cta secondary" href="https://tickets.x.test" data-track="booking">Buy tickets</a>
  <a class="cta secondary" href="https://res.x.test">Reserve a table</a>
  <button class="card-action fav-btn">Favorite</button><button class="card-action trip-btn">Add to trip</button>
</div>
<ul class="nearby-list"><li class="nearby-card"><a class="nearby-link" href="/a">Place A</a><button class="trip-btn">Add to trip</button></li>
<li class="nearby-card"><a class="nearby-link" href="/b">Place B</a><button class="trip-btn">Add to trip</button></li></ul>
<br><img src="x.png"><a href="/kelowna/indoor">Back &amp; more</a>
</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;

test('inventory lists what the page really has, with counts and the names of buttons', () => {
  const list = inv.inventory(PAGE, 'venue');
  const by = Object.fromEntries(list.map((i) => [i.key, i]));
  assert.equal(by.directions.on_page, 1); assert.equal(by.website.on_page, 1);
  assert.deepEqual(by.booking.examples, ['Buy tickets']);
  assert.deepEqual(by.cta_other.examples, ['Reserve a table']);
  assert.equal(by.nearby_place.on_page, 2); assert.equal(by.nearby_add_to_trip.on_page, 2);
  assert.equal(by.favorite.on_page, 1); assert.equal(by.add_to_trip.on_page, 1);
  assert.equal(by.breadcrumb.on_page, 2); assert.equal(by.footer_link.on_page, 1); assert.equal(by.menu_nav.on_page, 2);
  assert.equal(by.other_link.on_page, 1);
  assert.deepEqual(by.other_link.examples, ['Back & more']);
  // Things this page does not have are not listed, and links inside <script> are not clickable.
  for (const k of ['see_hours', 'full_menu', 'photo_gallery', 'see_deals', 'phone_number', 'social_link']) assert.ok(!by[k], k);
  assert.ok(!list.some((i) => i.examples.includes('no')));
});

test('the matcher handles the selector forms click-labels.js uses', () => {
  const root = inv.parse('<div id="tripTray"><button>x</button></div><nav class="breadcrumb"><a href="/">h</a></nav><nav><a href="/">m</a></nav><a href="/x/y.ics">c</a>');
  const all = []; (function w(n) { for (const k of n.kids) { all.push(k); w(k); } })(root);
  const m = (sel, tag, text) => all.filter((n) => n.tag === tag && inv.matches(n, inv.parseSelector(sel))).length;
  assert.equal(m('#tripTray button', 'button'), 1);
  assert.equal(m('nav:not(.breadcrumb) a', 'a'), 1);
  assert.equal(m('a[href$=".ics"]', 'a'), 1);
  assert.equal(m('.breadcrumb a', 'a'), 1);
});

test('events: an event page lists its own items', () => {
  const html = '<main><div class="event-cta-row"><a class="cta event-cta-primary" href="https://t.test">Tickets &amp; info</a><a class="cta secondary" data-gcal href="https://calendar.google.com/x">Add to Google Calendar</a></div></main>';
  const keys = inv.inventory(html, 'event').map((i) => i.key);
  assert.deepEqual(keys, ['tickets_info', 'add_to_google_calendar']);
});

function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE venue_event_counts (day TEXT NOT NULL, venue_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, venue_id, name));
  CREATE TABLE event_click_counts (day TEXT NOT NULL, event_id INTEGER NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event_id, name));
  CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, region TEXT, start_datetime TEXT);
  CREATE TABLE trip_demand_events (day TEXT, visitor TEXT, venue_id INTEGER, kind TEXT, created_at TEXT);
  INSERT INTO venues (id, name, region, type) VALUES (1, 'Actors Studio', 'Kelowna', 'indoor');`);
  return d;
}
const req = () => ({ headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari', cookie: '' } });
const NOW = new Date('2026-11-05T20:00:00Z');

test('the sheet follows the page: its items, its counts, and a clicked item that left the page is kept and marked', () => {
  const c = va.createCounter(memDb());
  c.record(req(), 1, 'click:booking', '7.7.7.7', NOW); c.record(req(), 1, 'click:booking', '7.7.7.7', NOW);
  c.record(req(), 1, 'click:full_menu', '7.7.7.7', NOW);
  const d = va.applyInventory(c.detail(1, 30, NOW), 'venue', inv.inventory(PAGE, 'venue'));
  const by = Object.fromEntries(d.sheet.map((r) => [r.key, r]));
  assert.equal(by.booking.n, 2); assert.equal(by.booking.on_page, 1);
  assert.equal(by.full_menu.on_page, 0, 'clicked once but the page has no menu button now');
  assert.ok(!by.photo_gallery && !by.see_deals, 'items the page does not have are not listed');
  assert.equal(d.sheet_from_page, true);
  const html = renderBusinessPage({ q: 'a', days: 30, detail: { key: 'okanagan', name: 'Okanagan Roam', data: d } });
  assert.match(html, /Buy tickets/); assert.match(html, /Reserve a table/); assert.match(html, /no longer on this page/);
});

test('if the page cannot be read the sheet falls back to the general list and says so', () => {
  const c = va.createCounter(memDb());
  const d = va.applyInventory(c.detail(1, 30, NOW), 'venue', null);
  assert.equal(d.sheet_from_page, false); assert.ok(d.sheet.length > 20);
  assert.match(renderBusinessPage({ q: 'a', days: 30, detail: { key: 'okanagan', name: 'Okanagan Roam', data: d } }), /general list/);
});
