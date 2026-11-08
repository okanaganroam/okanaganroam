'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const td = require('../trip-demand');

function memDb() {
  let Database;
  try { Database = require('better-sqlite3'); const d = new Database(':memory:'); return d; } catch (e) { /* fall through */ }
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(':memory:');
  d.exec('');
  return d;
}
const db = memDb();
db.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT);
INSERT INTO venues VALUES (1,'Alpha Winery','kelowna','winery'),(2,'Beta Cafe','vernon','cafe');
CREATE TABLE trip_demand_events (day TEXT NOT NULL, visitor TEXT NOT NULL, venue_id INTEGER NOT NULL, kind TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (day, visitor, venue_id, kind));`);
const log = td.createLogger(db);
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', ip = '1.2.3.4', cookie = '') => ({ headers: { 'user-agent': ua, cookie }, __ip: ip });

test('collectVenueIds finds venue ids in nested plans', () => {
  const ids = td.collectVenueIds({ days: [{ stops: [{ venue: { id: 3 } }, { ref: 'venue:7' }, { venue_id: 9 }] }], x: 'a' });
  assert.deepEqual([...ids].sort(), [3, 7, 9]);
});

test('records once per visitor/day/venue/kind and ignores unknown venues', () => {
  assert.equal(log.record(req(), 'shown', [1, 2, 999]), 2);
  assert.equal(log.record(req(), 'shown', [1, 2]), 0);
  assert.equal(log.record(req('Mozilla/5.0 other', '5.6.7.8'), 'add', [1]), 1);
});

test('bots, internal visitors and bad kinds are not logged', () => {
  assert.equal(log.record(req('Googlebot/2.1'), 'add', [2]), 0);
  assert.equal(log.record(req(undefined, '9.9.9.9', 'roam_internal=1'), 'add', [2]), 0);
  assert.equal(log.record(req(undefined, '8.8.8.8'), 'nonsense', [2]), 0);
});

test('visitor key rotates daily and holds no raw ip', () => {
  const a = td.visitorKey('1.2.3.4', 'ua', '2026-11-05'), b = td.visitorKey('1.2.3.4', 'ua', '2026-11-06');
  assert.notEqual(a, b);
  assert.ok(!a.includes('1.2.3.4'));
});

test('report ranks by adds and flags the threshold', () => {
  const rows = log.report(30, 1);
  const alpha = rows.find((r) => r.id === 1);
  assert.equal(alpha.added, 1);
  assert.equal(alpha.shown, 1);
  assert.equal(alpha.ready_to_contact, true);
  assert.equal(log.report(30, 5).find((r) => r.id === 1).ready_to_contact, false);
});

test('TRIP_DEMAND_LOG=off disables logging', () => {
  process.env.TRIP_DEMAND_LOG = 'off';
  try { assert.equal(log.record(req('Mozilla/5.0 x', '4.4.4.4'), 'shown', [2]), 0); } finally { delete process.env.TRIP_DEMAND_LOG; }
});

test('crawlers on cloud-hosting networks are bots even with a normal Chrome user agent', () => {
  const { isBot, fromCloudCrawlerNetwork } = require('../trip-demand');
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
  for (const ip of ['49.51.201.148', '43.153.24.205', '170.106.111.68', '43.173.75.254']) assert.equal(isBot({ headers: { 'user-agent': chrome, 'x-real-ip': ip } }), true, ip);
  for (const ip of ['70.36.61.197', '24.69.10.5', '']) assert.equal(isBot({ headers: { 'user-agent': chrome, 'x-real-ip': ip } }), false, ip);
  assert.equal(fromCloudCrawlerNetwork({ headers: { 'x-real-ip': '8.209.4.4' } }, { BOT_IP_PREFIXES: '8.209., 47.88.' }), true);
  assert.equal(fromCloudCrawlerNetwork({ headers: { 'x-real-ip': '8.209.4.4' } }, {}), false);
});
