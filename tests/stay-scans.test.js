'use strict';
// Places to stay scans (2026-11-11): QR code scans and email link opens per hotel or rental, on the dashboard.
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createStayScanCounter } = require('../stay-scans');
const { renderStaysPage } = require('../stay-scans-page');
const { NAV } = require('../dashboard-layout');

const NOW = new Date('2026-11-11T20:00:00Z');
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '', lang = 'en-CA') => ({ headers: { 'user-agent': ua, cookie, ...(lang ? { 'accept-language': lang } : {}) } });
const memDb = () => { const d = new DatabaseSync(':memory:'); d.exec('CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name))'); return d; };
const PLACES = [
  { slug: 'sandy-beach-suites', name: 'Sandy Beach Suites', region: 'osoyoos' },
  { slug: 'hotel-eldorado', name: 'Hotel Eldorado', region: 'kelowna' },
  { slug: 'lifty-life-kelowna', name: 'Lifty Life', region: 'kelowna', kind: 'rental' },
];
let ipN = 0;
const ip = () => `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`;

test('a QR scan and an email link open are counted per place; bots, our own visits, scanners and bad slugs are not', () => {
  const db = memDb(); const c = createStayScanCounter(db);
  assert.equal(c.record(req(), 'q', 'sandy-beach-suites', ip(), NOW), true);
  assert.equal(c.record(req(), 'q', 'sandy-beach-suites', ip(), NOW), true);
  assert.equal(c.record(req(), 'guests', 'sandy-beach-suites', ip(), NOW), true);
  assert.equal(c.record(req('Googlebot/2.1'), 'q', 'sandy-beach-suites', ip(), NOW), false, 'bot');
  assert.equal(c.record(req(undefined, 'roam_internal=1'), 'q', 'sandy-beach-suites', ip(), NOW), false, 'our own visit');
  assert.equal(c.record(req(undefined, '', ''), 'guests', 'sandy-beach-suites', ip(), NOW), false, 'email scanner (no Accept-Language)');
  assert.equal(c.record(req(), 'q', 'Bad Slug!', ip(), NOW), false);
  assert.equal(c.record(req(), 'near', 'sandy-beach-suites', ip(), NOW), false);
  const rows = db.prepare('SELECT name, n FROM site_event_counts ORDER BY name').all().map((r) => [r.name, r.n]);
  assert.deepEqual(rows, [['stay_email:sandy-beach-suites', 1], ['stay_qr:sandy-beach-suites', 2]]);
});

test('report: places by scans, with places that have no scans yet listed too, totals and a daily series', () => {
  const db = memDb(); const c = createStayScanCounter(db);
  const day = (k) => new Date(NOW.getTime() - k * 86400000);
  c.record(req(), 'q', 'hotel-eldorado', ip(), day(2));
  c.record(req(), 'q', 'hotel-eldorado', ip(), day(1));
  c.record(req(), 'q', 'hotel-eldorado', ip(), NOW);
  c.record(req(), 'q', 'sandy-beach-suites', ip(), NOW);
  c.record(req(), 'guests', 'sandy-beach-suites', ip(), day(40));
  const r = c.report(30, PLACES, NOW);
  assert.equal(r.days, 30);
  assert.equal(r.total_qr, 4);
  assert.equal(r.total_email, 0, 'the 40-day-old open is outside 30 days');
  assert.equal(r.places_scanned, 2);
  assert.deepEqual(r.places.map((p) => [p.slug, p.qr]), [['hotel-eldorado', 3], ['sandy-beach-suites', 1], ['lifty-life-kelowna', 0]]);
  assert.equal(r.places[0].name, 'Hotel Eldorado');
  assert.ok(r.places[0].last_qr);
  assert.equal(r.qr_per_day.length, 30);
  assert.equal(r.qr_per_day.reduce((a, d) => a + d.n, 0), 4);
  assert.equal(c.report(90, PLACES, NOW).total_email, 1);
  assert.equal(c.report(12, PLACES, NOW).days, 30, 'only 7, 30 or 90');
});

test('the dashboard page lists both sites, the places with scans and the ones still waiting, and is in the menu', () => {
  const db = memDb(); const c = createStayScanCounter(db);
  c.record(req(), 'q', 'hotel-eldorado', ip(), NOW);
  const html = renderStaysPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.report(30, PLACES, NOW) }, { key: 'whistler', name: 'Whistler Roam', error: 'Whistler Roam doesn’t count scans yet.' }] });
  assert.match(html, /Places to stay/);
  assert.match(html, /QR code scans/);
  assert.match(html, /Hotel Eldorado/);
  assert.match(html, /2 other places with a card: no scans or opens yet/);
  assert.match(html, /Whistler Roam doesn’t count scans yet/);
  assert.ok(NAV.some((g) => g.items.some((i) => i.key === 'stays' && i.href === '/admin/dashboard/stays')));
});
