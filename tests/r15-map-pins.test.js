// Round 15 (2026-10-20), Roam Now (/map) event pins: a host whose listing has another name ("<Place> at <Host>", the
// same street address), new host points from OpenStreetMap, vague places left unpinned, and a private home never
// pinned. Runs on a throwaway, fixture-seeded database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');
const { mapEventPin, mapPlaceIsPrivate, mapStreetKey } = require('../map-event-pins.js');

// Listings as the map reads them (id, name, region, address, latitude, longitude, redirect_to).
const L = (id, name, region, address, lat, lng) => ({ id, name, region, address, latitude: lat, longitude: lng, redirect_to: null });
const OLIVER = [L(1, 'Manzil Indian Restaurant at Kismet Estate Winery', 'oliver', '3170 BC-97, Oliver, BC V0H 1T1', 49.18367, -119.55469)];
const KELOWNA = [
  L(2, 'Eldorado Yacht Club', 'kelowna', 'Eldorado Resort, 500 Cook Rd, Kelowna, BC', 49.8469, -119.49008),
  L(3, 'Lakeside Dining Room', 'kelowna', '500 Cook Rd Unit 2, Kelowna, BC V1W 3G9', 49.84564, -119.4892),
  L(4, 'Okanagan Lake Boat Rentals', 'kelowna', '1354 Water St, Kelowna, BC (second location at 600 Cook Rd)', 49.891, -119.4989),
  L(5, 'Twinkle Tours at Kelowna', 'kelowna', '1 Test St, Kelowna', 49.9, -119.4),
];
const BIG_WHITE = [L(6, 'Candle Creek Kennels – Dog Sled Tours at Big White', 'big-white', 'Happy Valley, Big White', 49.71817, -118.91899)];
const pin = (text, region, venues = [], town = []) => mapEventPin({ venue_name_text: text, region }, venues, town);
const near = (p, lat, lng) => p && Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lng - lng) < 0.0005;

test('map-event-pins: street addresses are read either way, unit numbers and "(...)" notes dropped', () => {
  assert.equal(mapStreetKey('106-1641 Dartmouth Rd'), '1641 dartmouth rd');
  assert.equal(mapStreetKey('#106 1475 Fairview Road (Cannery Trade Centre)'), '1475 fairview rd');
  assert.equal(mapStreetKey('500 Cook Rd Unit 2'), '500 cook rd');
  assert.equal(mapStreetKey('3310 37th Avenue'), mapStreetKey('3310 37 Ave'));
  assert.equal(mapStreetKey('BC (second location at 500 Cook Rd)'), null);
  assert.equal(mapStreetKey('near Kelowna'), null);
});

test('map-event-pins: a host whose listing has another name gets that listing\'s pin', () => {
  // "<Place> at <Host>": the restaurant inside the winery.
  assert.ok(near(pin('Kismet Estate Winery, 316 Road 20, Oliver', 'oliver', OLIVER, ['Oliver']), 49.18367, -119.55469));
  // The same street address: the listings at 500 Cook Rd (within 250 m of each other).
  const eld = pin('Hotel Eldorado Ballroom, 500 Cook Road, Kelowna', 'kelowna', KELOWNA, ['Kelowna']);
  assert.ok(near(eld, 49.8469, -119.49008) || near(eld, 49.84564, -119.4892), JSON.stringify(eld));
  // Another town never; a "(second location at ...)" note never.
  assert.equal(pin('Kismet Estate Winery, 316 Road 20', 'osoyoos', OLIVER, ['Osoyoos']), null);
  assert.equal(pin('Lakefront Gala, 600 Cook Rd, Kelowna', 'kelowna', KELOWNA, ['Kelowna']), null);
  // Listings at one address that are far apart are not one place.
  const apart = [L(7, 'A', 'kelowna', '9 Long Rd, Kelowna', 49.80, -119.40), L(8, 'B', 'kelowna', '9 Long Road, Kelowna', 49.83, -119.40)];
  assert.equal(pin('Harvest Hall, 9 Long Rd', 'kelowna', apart, ['Kelowna']), null);
});

test('map-event-pins: new host points from OpenStreetMap, in their own town only', () => {
  assert.ok(near(pin('Summerland Community Centre, 9710 Brown Street, Summerland', 'summerland', [], ['Summerland']), 49.59959, -119.67984));
  assert.ok(near(pin('Vernon Public Library, 2800 30th Ave, Vernon', 'vernon', [], ['Vernon']), 50.26339, -119.26818));
  assert.ok(near(pin('Delta Hotels by Marriott Grand Okanagan Resort, Kelowna', 'kelowna', [], ['Kelowna']), 49.89161, -119.4977));
  assert.ok(near(pin('Rutland Centennial Hall, 215 Shepherd Rd, Kelowna', 'kelowna', [], ['Kelowna']), 49.89021, -119.38898));
  assert.equal(pin('Vernon Public Library', 'kelowna', [], ['Kelowna']), null);
  for (const p of require('../data/event-map-points.json').points) {
    assert.ok(p.lat > 48.95 && p.lat < 50.8 && p.lng > -120.2 && p.lng < -118.25, JSON.stringify(p));
    assert.ok(p.names.length && p.source, JSON.stringify(p));
  }
});

test('map-event-pins: vague places stay unpinned', () => {
  for (const [text, region, venues, town] of [
    ['Various wineries throughout Okanagan Falls & Skaha region', 'okanagan-falls', [], ['Okanagan Falls']],
    ['Participating Naramata Bench wineries', 'naramata', [], ['Naramata']],
    ['Downtown Vernon', 'vernon', [], ['Vernon']],
    ['Main Street, Osoyoos', 'osoyoos', [], ['Osoyoos']],
    ['30th Avenue between 30th and 34th Street, Downtown Vernon', 'vernon', [], ['Vernon']],
    ['Westside Wine Trail wineries, West Kelowna', 'west-kelowna', [], ['West Kelowna']],
    ['Big White, near Kelowna', 'big-white', BIG_WHITE, ['Big White']],
    ['Big White', 'big-white', BIG_WHITE, ['Big White']],
    ['Okanagan Symphony Orchestra, Kelowna', 'kelowna', KELOWNA, ['Kelowna']],
    ['Watermark Beach Resort and Main Street, Osoyoos', 'osoyoos', [], ['Osoyoos']],
    ['Kelowna', 'kelowna', KELOWNA, ['Kelowna']],
  ]) assert.equal(pin(text, region, venues, town), null, text);
});

test('map-event-pins: a private home never gets a pin or a street point', () => {
  const home = [L(9, 'Lakeview Bakery', 'kelowna', '1169 Bellagio Ave, Kelowna', 49.85, -119.45)];
  for (const text of ['Private home in Kelowna (address on Eventbrite)', '1169 Bellagio Ave, Kelowna (private home)', 'Private Residence, 1169 Bellagio Ave', 'Hotel Eldorado (private home nearby), 500 Cook Rd']) {
    assert.ok(mapPlaceIsPrivate(text), text);
    assert.equal(pin(text, 'kelowna', KELOWNA.concat(home), ['Kelowna']), null, text);
  }
  // A bare street address is never read as a host either (it may be a home).
  assert.equal(pin('1169 Bellagio Ave, Kelowna', 'kelowna', home, ['Kelowna']), null);
});

// ---------- /map end to end ----------

const DAY = app.addLocalDays(app.todayLocal(), 1);
const VENUES = [
  { name: 'R15 Bistro at R15 Hilltop Estate Winery', region: 'oliver', address: '3170 Test Hwy, Oliver', latitude: 49.18, longitude: -119.55 },
  { name: 'R15 Harbour Grill', region: 'kelowna', address: '77 R15 Quay Rd, Kelowna', latitude: 49.85, longitude: -119.49 },
  // A listing literally named like a private-home event: the map must still not pin the event by its text.
  { name: 'Private home in Kelowna (address on Eventbrite)', region: 'kelowna', address: '1 Test St', latitude: 49.87, longitude: -119.47 },
];
const EVENTS = [
  ['R15 Vineyard Supper', 'R15 Hilltop Estate Winery, 12 Road 9, Oliver', 'oliver'],
  ['R15 Harbour Gala', 'R15 Harbour Hotel, 77 R15 Quay Road, Kelowna', 'kelowna'],
  ['R15 Library Talk', 'Vernon Public Library, 2800 30th Ave, Vernon', 'vernon'],
  ['R15 Wine Walk', 'Participating Naramata Bench wineries', 'naramata'],
  ['R15 Merry Little Market', 'Private home in Kelowna (address on Eventbrite)', 'kelowna'],
];
for (const v of VENUES) {
  const r = { type: 'restaurant', ...v, slug: app.slugify(v.name) };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO venues (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => r[c]));
}
for (const [name, venue, region] of EVENTS) {
  const eid = db.prepare('INSERT INTO events (name, slug, region, description, start_datetime, venue_name_text) VALUES (?, ?, ?, ?, ?, ?)').run(name, app.slugify(name), region, 'A test event.', `${DAY} 19:00:00`, venue).lastInsertRowid;
  db.prepare('INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(eid, DAY, DAY, '19:00', '21:00');
  db.prepare('INSERT INTO event_categories (event_id, category_key, position) VALUES (?, ?, ?)').run(eid, 'community-events', 0);
}

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  srv.closeAllConnections();
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});

test('/map: a fuzzy host match and a new host point get pins; a vague place and a private home do not', async () => {
  const res = await fetch(`${base}/map/data.json`);
  assert.equal(res.status, 200);
  const data = await res.json();
  const ev = (n) => data.e.find((e) => e[0] === n);
  const at = (e, lat, lng) => e && Math.abs(e[4] - lat) < 0.001 && Math.abs(e[5] - lng) < 0.001;
  assert.ok(at(ev('R15 Vineyard Supper'), 49.18, -119.55), JSON.stringify(ev('R15 Vineyard Supper')));
  assert.ok(at(ev('R15 Harbour Gala'), 49.85, -119.49), JSON.stringify(ev('R15 Harbour Gala')));
  assert.ok(at(ev('R15 Library Talk'), 50.26339, -119.26818), JSON.stringify(ev('R15 Library Talk')));
  assert.equal(ev('R15 Wine Walk')[4], null);
  const home = ev('R15 Merry Little Market');
  assert.ok(home, 'listed');
  assert.equal(home[4], null, 'a private home is listed without a pin');
  assert.equal(home[5], null);
});
