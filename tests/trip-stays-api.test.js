'use strict';
// Build My Trip "Where to stay" (step 2, 2026-11-20) through POST /api/trip/plan and /trip: TRIP_STAYS off (the default)
// ignores the new fields and returns the same plan, byte for byte; TRIP_STAYS on and the ?stays=1 preview add the trip
// inputs and the whereToStay block; the body validator; a stay is never a plan stop; /trip's indexability is unchanged.
// Uses the repo's seed database plus a few fixture stays, removed again at the end.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

delete process.env.TRIP_STAYS;
process.env.TRIP_PLANNER_V3 = 'on';
const app = require('../server.js');
const db = require('../db.js');

const made = [];
let base, srv;
test.before(async () => {
  let n = 0;
  const mk = (o) => { const v = app.createVenue({ region: 'kelowna', type: 'stay', cuisine: 'hotel', address: `${100 + (++n)} Water Street, Kelowna, BC`, latitude: 49.886 + n / 1000, longitude: -119.496, description: 'A fixture used only by the trip stays tests.', ...o }); made.push(v.id); return v; };
  const family = mk({ slug: 'trip-stays-test-family-inn', name: 'Trip Stays Test Family Inn', image_url: '/images/trip-v3/hero.webp' });
  const adults = mk({ slug: 'trip-stays-test-adults-lodge', name: 'Trip Stays Test Adults Lodge' });
  const pets = mk({ slug: 'trip-stays-test-pet-motel', name: 'Trip Stays Test Pet Motel', cuisine: 'motel' });
  const ins = db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)');
  ins.run(family.id, JSON.stringify({ kid_friendly: true, max_guests: 6, price_level: 2, confidence: 'high' }), '2026-11-20T00:00:00Z', 'test');
  ins.run(adults.id, JSON.stringify({ adults_only: true, max_guests: 2, price_level: 4 }), '2026-11-20T00:00:00Z', 'test');
  ins.run(pets.id, JSON.stringify({ pets: 'yes', min_nights: 1 }), '2026-11-20T00:00:00Z', 'test');
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  for (const id of made) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  delete process.env.TRIP_STAYS;
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const post = async (body, qs = '') => {
  const r = await fetch(`${base}/api/trip/plan${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const TEXT = '3 days in Kelowna with kids';
const STAY = { arrive: '2027-07-09', leave: '2027-07-12', adults: 2, kids: 2 };
const stopIds = (p) => (p.days || []).flatMap((d) => d.stops || []).map((s) => s.venue && s.venue.id).filter(Boolean);

test('flag off (default): the stay field is ignored and the plan is byte-identical; no whereToStay; no inputs on /trip', async () => {
  delete process.env.TRIP_STAYS;
  assert.equal(app.isTripStaysEnabled(), false);
  const plain = await post({ text: TEXT });
  const withStay = await post({ text: TEXT, stay: STAY });
  const withBadStay = await post({ text: TEXT, stay: { arrive: 'not a date', adults: 99 } });
  assert.equal(plain.status, 200);
  assert.equal(withStay.text, plain.text);
  assert.equal(withBadStay.text, plain.text, 'an invalid stay is ignored too, not an error');
  assert.equal(JSON.parse(plain.text).whereToStay, undefined);
  assert.doesNotMatch(plain.text, /whereToStay/);
  // The same plan the planner gives directly (what the route returned before this change).
  const direct = JSON.parse(plain.text);
  assert.equal(direct.kind, 'multi_day');
  const page = await (await fetch(`${base}/trip`)).text();
  assert.doesNotMatch(page, /t3Arrive|t3StayIn|Where to stay|stays=1/);
  assert.doesNotMatch(page.split('</head>')[0], /<meta name="robots"/, '/trip stays indexable');
  // ?stays=0 or any other value is not the preview.
  assert.equal((await post({ text: TEXT, stay: STAY }, '?stays=0')).text, plain.text);
});

test('flag on: whereToStay with the trip dates, party and chosen stay; the dates set the plan; a stay is never a stop', async () => {
  process.env.TRIP_STAYS = 'on';
  try {
    const r = await post({ text: TEXT, stay: STAY });
    assert.equal(r.status, 200);
    const p = JSON.parse(r.text);
    const w = p.whereToStay;
    assert.ok(w, 'a base for a 3-night family trip');
    assert.deepEqual(w.trip, { arrive: '2027-07-09', leave: '2027-07-12', nights: 3, adults: 2, kids: 2, datesGiven: true });
    assert.equal(w.stayId, w.pick.id);
    assert.ok(made.includes(w.pick.id));
    const shown = [w.pick, ...w.alternatives].map((s) => s.name);
    assert.ok(!shown.includes('Trip Stays Test Adults Lodge'), 'adults only is dropped with kids');
    assert.equal(w.pick.name, 'Trip Stays Test Family Inn');
    assert.equal(w.pick.sleeps, 6);
    assert.equal(w.pick.priceBand, '$$');
    assert.equal(w.pick.url, '/kelowna/stays/trip-stays-test-family-inn');
    assert.equal(w.pick.urlFr, '/fr/kelowna/stays/trip-stays-test-family-inn');
    assert.ok(w.pick.reasons.some((x) => x.text === 'Family-friendly'));
    // The dates: 3 nights -> a 4-day plan from July 9.
    assert.equal(p.days.length, 4);
    assert.equal(((p.schedule || []).find((x) => x.date) || {}).date, '2027-07-09');
    for (const id of stopIds(p)) assert.ok(!made.includes(id), 'a stay is never a plan stop');
    // Bad input is refused with a reason.
    for (const bad of [{ arrive: '2027-07-12', leave: '2027-07-09' }, { adults: 0 }, { kids: 13 }, { arrive: '2027-01-01', leave: '2027-03-01' }, { guests: 3 }]) {
      const e = await post({ text: TEXT, stay: bad });
      assert.equal(e.status, 400, JSON.stringify(bad));
      assert.match(JSON.parse(e.text).error, /stay|night/);
    }
    // No inputs: the plan's own length and dates; still a base for a 3-day plan.
    const own = JSON.parse((await post({ text: TEXT })).text);
    assert.equal(own.days.length, 3);
    assert.ok(own.whereToStay);
    assert.equal(own.whereToStay.trip.nights, 2);
    // One day, no dates: no card.
    const day = JSON.parse((await post({ text: 'dinner in Kelowna tonight' })).text);
    assert.equal(day.whereToStay, undefined);
    // The page shows the Dates and Guests row (noindex is unchanged: /trip with no query has none).
    const page = await (await fetch(`${base}/trip`)).text();
    assert.match(page, /id="t3Arrive"/);
    assert.doesNotMatch(page, /'\/api\/trip\/plan\?stays=1'/);
    assert.doesNotMatch(page.split('</head>')[0], /<meta name="robots"/);
  } finally { delete process.env.TRIP_STAYS; }
});

test('?stays=1 preview with the flag off: the API and /trip?stays=1 behave as with the flag on, for that request only', async () => {
  delete process.env.TRIP_STAYS;
  const r = await post({ text: '2 days in Kelowna with our dog', stay: { adults: 2 } }, '?stays=1');
  assert.equal(r.status, 200);
  const w = JSON.parse(r.text).whereToStay;
  assert.ok(w);
  assert.equal(w.pick.name, 'Trip Stays Test Pet Motel');
  assert.equal(w.pick.reasons[1].text, 'Pets welcome');
  assert.equal(w.trip.adults, 2);
  assert.equal((await post({ text: TEXT, stay: { adults: 0 } }, '?stays=1')).status, 400);
  // The next request without the parameter is back to normal.
  assert.doesNotMatch((await post({ text: TEXT, stay: STAY })).text, /whereToStay/);
  const page = await (await fetch(`${base}/trip?stays=1`)).text();
  assert.match(page, /id="t3StayIn"/);
  assert.match(page, /'\/api\/trip\/plan\?stays=1'/);
  assert.match(page.split('</head>')[0], /<meta name="robots" content="noindex, follow">/, 'a /trip URL with a query is noindex, as before');
  assert.match(page, /<span class="t3-fr" lang="fr">Dates et voyageurs<\/span>/);
});

test('parseTripPlanBody: the stay field is validated only when stays are on', () => {
  const on = (stay) => app.parseTripPlanBody({ text: 'x', stay }, { stays: true });
  const off = (stay) => app.parseTripPlanBody({ text: 'x', stay });
  assert.deepEqual(on({ arrive: '2027-07-09', leave: '2027-07-10' }).value.stay, { arrive: '2027-07-09', leave: '2027-07-10' });
  assert.equal(on({}).value.stay, undefined);
  assert.match(on({ arrive: '2027-07-09', leave: '2027-08-20' }).error, /30 nights/);
  assert.match(on('x').error, /stay must be an object/);
  assert.equal(off({ adults: 99 }).error, undefined);
  assert.equal(off({ adults: 99 }).value.stay, undefined);
  assert.deepEqual(off({ adults: 2 }).value, app.parseTripPlanBody({ text: 'x' }).value);
  // Other fields are checked exactly as before.
  assert.match(app.parseTripPlanBody({ text: 'x', stays: 1 }, { stays: true }).error, /Unexpected field/);
});
