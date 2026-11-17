'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const se = require('../site-events');
const { collect } = require('../dashboard-data');

const NOW = new Date('2026-11-05T20:00:00Z');
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '') => ({ headers: { 'user-agent': ua, cookie } });
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));`);
  return d;
}

test('counts allowed events per day; unknown names, bots and internal visitors are ignored', () => {
  const db = memDb(); const c = se.createCounter(db);
  assert.equal(c.record(req(), 'map_near_me', '1.1.1.1', NOW), true);
  assert.equal(c.record(req(), 'map_near_me', '1.1.1.1', NOW), true);
  assert.equal(c.record(req(), 'page_view:map', '1.1.1.1', NOW), true);
  assert.equal(c.record(req(), 'not_a_real_event', '1.1.1.1', NOW), false);
  assert.equal(c.record(req('Googlebot/2.1'), 'map_near_me', '1.1.1.1', NOW), false);
  assert.equal(c.record(req(undefined, 'roam_internal=1'), 'map_near_me', '1.1.1.1', NOW), false);
  const t = c.summary(30, NOW).totals;
  assert.equal(t.map_near_me, 2);
  assert.equal(t['page_view:map'], 1);
});

test('one address cannot inflate the counts past the hourly cap', () => {
  const db = memDb(); const c = se.createCounter(db);
  let ok = 0;
  for (let i = 0; i < se.RATE_PER_HOUR + 50; i += 1) if (c.record(req(), 'map_filter', '9.9.9.9', NOW)) ok += 1;
  assert.equal(ok, se.RATE_PER_HOUR);
});

test('stores nothing but day, name and a number', () => {
  const db = memDb(); const c = se.createCounter(db);
  c.record(req(), 'map_search', '2.2.2.2', NOW);
  const cols = db.prepare('PRAGMA table_info(site_event_counts)').all().map((r) => r.name);
  assert.deepEqual(cols, ['day', 'name', 'n']);
});

test('dashboard: Roam Now and Build My Trip numbers come from the counts', () => {
  const db = memDb(); const c = se.createCounter(db);
  for (let i = 0; i < 3; i += 1) c.record(req(), 'page_view:map', `3.3.3.${i}`, NOW);
  c.record(req(), 'map_near_me', '3.3.3.9', NOW);
  c.record(req(), 'trip_plan_complete', '3.3.3.9', NOW);
  const e = collect(db, { site: 'okanagan', days: 7, now: NOW }).events;
  assert.equal(e.roam_now.opens, 3);
  assert.equal(e.roam_now.near_me, 1);
  assert.equal(e.trip.plans_completed, 1);
  assert.equal(e.roam_now_per_day.at(-1).n, 3);
});

test('the homepage wrapper lists exactly the same events as the server', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'okanagan.html'), 'utf8');
  const m = /var ROAM_EV = (\[[^\]]*\]);/.exec(html);
  assert.ok(m, 'ROAM_EV is in okanagan.html');
  const fromPage = JSON.parse(m[1]).sort();
  const fromServer = [...se.EVENTS].filter((n) => !n.startsWith('page_view:') && !n.startsWith('map_filter:')).sort();
  assert.deepEqual(fromPage, fromServer);
  assert.match(html, /\/api\/trip\/signal/, 'the homepage reports adds and removes to the demand log');
});
