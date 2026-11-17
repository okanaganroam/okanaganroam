'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { collect, dayList } = require('../dashboard-data');
const { renderDashboardPage } = require('../dashboard-page');

const NOW = new Date('2026-11-05T20:00:00Z');
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  INSERT INTO venues VALUES (1,'Alpha Winery','kelowna','winery',NULL),(2,'Beta <b>Cafe</b>','vernon','cafe',NULL),(3,'Gone','vernon','cafe',9);
  CREATE TABLE trip_demand_events (day TEXT, visitor TEXT, venue_id INTEGER, kind TEXT, created_at TEXT, PRIMARY KEY (day, visitor, venue_id, kind));
  CREATE TABLE venue_submissions (id INTEGER PRIMARY KEY, status TEXT, submitted_at TEXT);`);
  const ins = d.prepare('INSERT INTO trip_demand_events (day, visitor, venue_id, kind) VALUES (?,?,?,?)');
  for (let i = 0; i < 12; i += 1) ins.run('2026-11-05', `v${i}`, 1, 'add');
  ins.run('2026-11-05', 'v0', 1, 'shown'); ins.run('2026-11-04', 'v1', 2, 'shown');
  d.exec("INSERT INTO venue_submissions VALUES (1,'pending','2026-11-04 10:00:00'),(2,'approved','2026-10-01 10:00:00')");
  return d;
}

test('dayList gives one Pacific day per slot, oldest first', () => {
  const l = dayList(3, NOW);
  assert.deepEqual(l, ['2026-11-03', '2026-11-04', '2026-11-05']);
});

test('collect: demand totals, top venues and the ready flag', () => {
  const o = collect(db(), { site: 'okanagan', days: 7, now: NOW });
  assert.equal(o.demand.added, 12);
  assert.equal(o.demand.shown, 2);
  assert.equal(o.demand.ready_to_contact, 1);
  assert.equal(o.demand.top_venues[0].name, 'Alpha Winery');
  assert.equal(o.demand.visitors_per_day.length, 7);
  assert.equal(o.demand.visitors_per_day.at(-1).n, 12);
});

test('collect: missing tables become null, not errors; redirected venues are not counted', () => {
  const o = collect(db(), { site: 'whistler', days: 30, now: NOW });
  assert.equal(o.plans, null);
  assert.equal(o.inbox.venue_submissions_pending, 1);
  assert.equal(o.inbox.claims_pending, null);
  assert.equal(o.listings.venues, 2);
});

test('page: escapes names, shows both columns and an error column without breaking', () => {
  const data = collect(db(), { site: 'okanagan', days: 30, now: NOW });
  const html = renderDashboardPage({ sites: [{ key: 'okanagan', name: 'Okanagan Roam', data }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }], days: 30, site: 'both', clarityId: 'abc123' });
  assert.match(html, /Okanagan Roam/);
  assert.match(html, /Not connected yet/);
  assert.match(html, /Beta &lt;b&gt;Cafe&lt;\/b&gt;/);
  assert.ok(!html.includes('<b>Cafe</b>'));
  assert.match(html, /noindex/);
  assert.match(html, /clarity\.microsoft\.com\/projects\/view\/abc123/);
});

test('page: a single-site view hides the other column', () => {
  const data = collect(db(), { site: 'okanagan', days: 30, now: NOW });
  const html = renderDashboardPage({ sites: [{ key: 'okanagan', name: 'Okanagan Roam', data }, { key: 'whistler', name: 'Whistler Roam', error: 'x' }], days: 7, site: 'okanagan' });
  assert.ok(!html.includes('<section class="col"><h2>Whistler Roam'));
});

test('collect: portal links sent, opened ever and opened in the period', () => {
  const d = db();
  d.exec(`CREATE TABLE venue_owner_links (venue_id INTEGER PRIMARY KEY, first_opened_at TEXT, last_opened_at TEXT, open_count INTEGER NOT NULL DEFAULT 0);
  INSERT INTO venue_owner_links VALUES (1,'2026-11-04 09:00:00','2026-11-05 10:00:00',3),(2,'2026-09-01 09:00:00','2026-09-02 10:00:00',1),(3,NULL,NULL,0);`);
  const o = collect(d, { site: 'okanagan', days: 7, now: NOW });
  assert.equal(o.inbox.portal_links, 3);
  assert.equal(o.inbox.portal_links_opened, 2);
  assert.equal(o.inbox.portal_opens_in_window, 1);
  const html = renderDashboardPage({ sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: o }], days: 7, site: 'okanagan' });
  assert.match(html, /links sent/);
  assert.match(html, /opened in this period/);
});
