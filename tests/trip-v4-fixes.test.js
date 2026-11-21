// Build My Trip V4 fixes (2026-11-21, Dayton, from the live /trip?v=4 test of "3 days in Kelowna with my partner, wineries,
// a nice dinner and a hike"): the stay fits the trip (no college residence for a couple), free time is never filled with a
// bowling club on an adult trip, and a stay with no dates never starts on a day already past. V4 only: the current page's
// plans and stays are unchanged. PURE tests on fixtures (no server, no database).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const tp = require('../trip-planner.js');
const ts = require('../trip-stays.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const Q = '3 days in Kelowna with my partner, wineries, a nice dinner and a hike';

// ---- 1. Stay type fit ----
const centre = { lat: 49.888, lng: -119.496 };
const stay = (id, name, kind, dKm, info) => ({ id, name, kind, kindKey: kind.toLowerCase(), region: 'kelowna', regionLabel: 'Kelowna', latitude: centre.lat + dKm / 111, longitude: centre.lng, url: `/kelowna/stay/${id}`, info: info || null });
const STAYS = [
  stay(1, 'Residence & Conference Centre - Kelowna (Okanagan College)', 'Guest house', 0.2),
  stay(2, 'Downtown Backpackers Hostel', 'Guest house', 0.4),
  stay(3, 'Lakeview Motel', 'Motel', 0.6),
  stay(4, 'Vineyard View B&B', 'B&B', 2.5),
  stay(5, 'Lakeshore Hotel', 'Hotel', 1.2),
];
const plan3 = () => ({ kind: 'multi_day', query: Q, intent: {}, understood: {}, days: [1, 2, 3].map((day) => ({ day, stops: [{ venue: { region: 'kelowna', latitude: centre.lat, longitude: centre.lng } }] })) });

test('Stay (V4): a couple\'s trip never gets a college residence, hostel or dorm; B&Bs, inns, resorts and hotels come first', () => {
  const w = ts.whereToStay(plan3(), null, STAYS, '2026-11-21', { v4: true, text: Q, minArrive: '2026-11-22' });
  assert.equal(w.pick.name, 'Lakeshore Hotel', 'the closest room of a couple kind (the residence and motel are closer)');
  for (const s of [w.pick].concat(w.alternatives)) assert.ok(![1, 2].includes(s.id), `${s.name} is shown`);
  assert.deepEqual([w.pick].concat(w.alternatives).map((s) => s.id), [5, 4, 3], 'hotel, then the B&B, then the motel');
});

test('Stay (V4): any trip puts student residences and hostels last; a budget or hostel request may still get one', () => {
  const plain = plan3(); plain.query = '3 days in Kelowna, wineries and a hike';
  const w = ts.whereToStay(plain, null, STAYS, '2026-11-21', { v4: true, text: plain.query, minArrive: '2026-11-22' });
  assert.ok(![1, 2].includes(w.pick.id), w.pick.name);
  const cheap = plan3(); cheap.query = '3 days in Kelowna on a budget, a hostel is fine';
  const wc = ts.whereToStay(cheap, null, STAYS, '2026-11-21', { v4: true, text: cheap.query, minArrive: '2026-11-22' });
  assert.ok([wc.pick].concat(wc.alternatives).some((s) => [1, 2].includes(s.id)), 'asked for: allowed');
  // Only a residence in town: it is still offered rather than nothing.
  const only = ts.whereToStay(plan3(), null, [STAYS[0]], '2026-11-21', { v4: true, text: Q, minArrive: '2026-11-22' });
  assert.equal(only.pick.id, 1);
  assert.equal(ts.v4DormStay({ name: 'Lakeview Motel', kind: 'Motel' }), false);
  assert.equal(ts.v4DormStay({ name: 'UBCO Summer Suites', kind: 'Hotel', info: { unit_types: ['dorm'] } }), true);
});

test('Stay: without V4 the pick is exactly as before (the nearest)', () => {
  const w = ts.whereToStay(plan3(), null, STAYS, '2026-11-21');
  assert.equal(w.pick.id, 1);
  assert.equal(w.trip.arrive, '2026-11-21');
});

// ---- 3. Stay dates ----
test('Stay dates (V4): with no dates the stay starts at the earliest arrival (today before noon, else tomorrow), never a past day', () => {
  const w = ts.whereToStay(plan3(), null, STAYS, '2026-11-21', { v4: true, text: Q, minArrive: '2026-11-22' });
  assert.equal(w.trip.arrive, '2026-11-22');
  assert.equal(w.trip.leave, '2026-11-24');
  assert.equal(w.trip.nights, 2);
  // A plan dated in the past (a typical day before today) moves up too.
  const past = plan3(); past.schedule = [{ day: 1, date: '2026-11-20' }];
  assert.equal(ts.whereToStay(past, null, STAYS, '2026-11-21', { v4: true, minArrive: '2026-11-21' }).trip.arrive, '2026-11-21');
  // Dates the visitor gave are kept.
  const given = ts.whereToStay(plan3(), { arrive: '2026-12-04', leave: '2026-12-07' }, STAYS, '2026-11-21', { v4: true, minArrive: '2026-11-22' });
  assert.equal(given.trip.arrive, '2026-12-04');
  assert.equal(given.trip.nights, 3);
});

test('Stay dates: the server passes today before noon and tomorrow after it (America/Vancouver)', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /minArrive: okanaganClock\(now\)\.minutes < 720 \? todayLocal\(now\) : addLocalDays\(todayLocal\(now\), 1\)/);
});

// ---- 2. Fillers ----
test('Filler (V4): free time on an adult wine trip is never filled with a bowling club, arcade or sports place (unless asked)', () => {
  const facts = fx.FACTS.slice();
  const bowl = fx.add({ name: 'Okanagan Bowling Club', region: 'kelowna', type: 'indoor', cuisine: 'Lawn bowling club', rating: 4.9, desc: 'Lawn bowling and indoor lanes; drop-in welcome.', hours: fx.open('09:00', '21:00'), dLat: 0.001 });
  facts.push(bowl);
  const names = (p) => p.days.flatMap((d) => d.stops.filter((s) => s.venue).map((s) => s.venue.id));
  const v3 = fx.plan(Q, { facts });
  const v4 = fx.plan(Q, { facts, extra: { v4: true } });
  assert.ok(names(v3).includes(bowl.id), 'the current page fills the gap with it (the bug this guards against)');
  assert.ok(!names(v4).includes(bowl.id), 'V4 never does');
  // Asked for by name: allowed.
  assert.equal(tp.v4FillerSkip(bowl, { v4: true, queryText: 'wineries and lawn bowling' }), false);
  assert.equal(tp.v4FillerSkip(bowl, { v4: true, queryText: 'wineries' }), true);
  assert.equal(tp.v4FillerSkip(bowl, { v4: true, kids: true, queryText: 'wineries' }), false, 'kids trips keep family fillers');
  assert.equal(tp.v4FillerSkip({ name: 'Kelowna Art Gallery', type: 'indoor', textName: 'kelowna art gallery', textCuisine: 'gallery' }, { v4: true, queryText: '' }), false);
  assert.equal(tp.v4FillerSkip({ name: 'Ridge Trail', type: 'outdoor', textName: 'ridge trail', textCuisine: '' }, { v4: true, queryText: '' }), false);
});
