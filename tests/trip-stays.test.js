'use strict';
// Build My Trip "Where to stay" (step 2, 2026-11-20): trip-stays.js on its own -- the trip inputs, the hard filters
// (unknown never drops a stay), the ranking and the card. PURE: no server, no database.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('../trip-stays');

// Downtown Kelowna stops; a stay at the same spot is 0 km away, each 0.009 degrees of latitude about 1 km.
const LAT = 49.886, LNG = -119.496;
const stop = (region, dLat = 0, extra = {}) => ({ venue: { id: Math.round(1000 + dLat * 1e4), region, latitude: LAT + dLat, longitude: LNG, ...extra } });
const plan = (o = {}) => ({
  kind: 'multi_day',
  days: o.days || [{ day: 1, stops: [stop('kelowna'), stop('kelowna', 0.002)] }, { day: 2, stops: [stop('kelowna', -0.002)] }],
  schedule: [{ day: 1, date: o.date || '2026-07-10' }],
  intent: { features: o.features || [], budget: o.budget || null },
  understood: { party: o.party || [] },
});
let nextId = 1;
const stay = (o = {}) => ({ id: o.id || nextId++, name: o.name || `Stay ${nextId}`, region: o.region || 'kelowna', regionLabel: o.regionLabel || 'Kelowna',
  kind: 'Hotel', kindFr: 'Hôtel', latitude: LAT + (o.km || 0) * 0.009, longitude: LNG, photo: o.photo === undefined ? null : o.photo,
  url: `/${o.region || 'kelowna'}/stays/s${nextId}`, urlFr: `/fr/${o.region || 'kelowna'}/stays/s${nextId}`, info: o.info === undefined ? null : o.info });
const ctxOf = (p, input, today = '2026-07-01') => ts.tripStayContext(p, input, today);

test('parseTripStayInput: dates, party size and every refusal', () => {
  assert.deepEqual(ts.parseTripStayInput(undefined), { value: null });
  assert.deepEqual(ts.parseTripStayInput({}), { value: null });
  assert.deepEqual(ts.parseTripStayInput({ arrive: '', leave: '', adults: null }), { value: null });
  assert.deepEqual(ts.parseTripStayInput({ arrive: '2026-12-18', leave: '2026-12-21', adults: 2, kids: 0 }), { value: { arrive: '2026-12-18', leave: '2026-12-21', adults: 2, kids: 0 } });
  assert.deepEqual(ts.parseTripStayInput({ arrive: '2026-12-18' }), { value: { arrive: '2026-12-18' } });
  assert.deepEqual(ts.parseTripStayInput({ adults: 16, kids: 12 }), { value: { adults: 16, kids: 12 } });
  const bad = [
    ['x', /object/], [[], /object/], [{ nights: 3 }, /only contain/],
    [{ arrive: '2026-02-30' }, /arrive/], [{ arrive: '18/12/2026' }, /arrive/], [{ arrive: 20261218 }, /arrive/],
    [{ leave: '2026-12-21' }, /needs stay.arrive/],
    [{ arrive: '2026-12-21', leave: '2026-12-21' }, /after/], [{ arrive: '2026-12-21', leave: '2026-12-18' }, /after/],
    [{ arrive: '2026-12-01', leave: '2027-01-01' }, /at most 30 nights/],
    [{ adults: 0 }, /adults/], [{ adults: 17 }, /adults/], [{ adults: 2.5 }, /adults/], [{ adults: '2' }, /adults/],
    [{ kids: -1 }, /kids/], [{ kids: 13 }, /kids/],
  ];
  for (const [raw, re] of bad) assert.match(ts.parseTripStayInput(raw).error || '', re, JSON.stringify(raw));
  assert.equal(ts.parseTripStayInput({ arrive: '2026-12-01', leave: '2026-12-31' }).error, undefined, '30 nights is allowed');
});

test('context: a base only for 2+ days or dates that span a night; nights, months and the town with most stops', () => {
  assert.equal(ctxOf({ kind: 'day_plan', days: [{ day: 1, stops: [stop('kelowna')] }] }, null), null, 'one day, no dates: no base');
  assert.equal(ctxOf({ kind: 'recommendations', recommendations: [stop('kelowna')] }, { arrive: '2026-07-10', leave: '2026-07-12' }), null, 'a list is not a plan');
  assert.equal(ctxOf({ kind: 'multi_day', days: [{ day: 1, stops: [] }, { day: 2, stops: [] }] }, null), null, 'no stops');
  const oneDay = ctxOf({ kind: 'day_plan', days: [{ day: 1, stops: [stop('kelowna')] }] }, { arrive: '2026-07-10', leave: '2026-07-11' });
  assert.equal(oneDay.nights, 1);
  const c = ctxOf(plan({ date: '2026-10-30', days: [{ day: 1, stops: [stop('west-kelowna'), stop('kelowna')] }, { day: 2, stops: [stop('kelowna')] }, { day: 3, stops: [stop('kelowna')] }] }), null);
  assert.equal(c.nights, 2);
  assert.equal(c.arrive, '2026-10-30');
  assert.equal(c.leave, '2026-11-01');
  assert.deepEqual(c.months, [10], 'the nights of Oct 30 and 31');
  assert.equal(c.primaryRegion, 'kelowna');
  assert.deepEqual(c.regions, ['kelowna', 'west-kelowna']);
  // The dates given win over the plan's own.
  const d = ctxOf(plan(), { arrive: '2026-11-29', leave: '2026-12-02', adults: 2, kids: 1 });
  assert.deepEqual([d.arrive, d.leave, d.nights, d.guests, d.withKids], ['2026-11-29', '2026-12-02', 3, 3, true]);
  assert.deepEqual(d.months, [11, 12]);
  // No date anywhere: today.
  const t = ctxOf({ ...plan(), schedule: [] }, null, '2026-08-05');
  assert.equal(t.arrive, '2026-08-05');
  // The request's own words: kids, a dog, a budget.
  const w = ctxOf(plan({ party: ['with kids', 'with a dog'], budget: 'budget' }), null);
  assert.deepEqual([w.withKids, w.dog, w.budget], [true, true, 'budget']);
  assert.equal(ctxOf(plan({ features: ['dog_friendly'] }), null).dog, true);
  // kids: 0 in the party size wins over "with kids" in the words.
  assert.equal(ctxOf(plan({ party: ['with kids'] }), { adults: 2, kids: 0 }).withKids, false);
});

test('filters: each drops a stay only when its data says so; null, missing and [] open_months never drop it', () => {
  const c = ctxOf(plan({ party: ['with a dog'] }), { arrive: '2026-12-30', leave: '2027-01-02', adults: 3, kids: 2 });
  assert.equal(ts.stayFails(null, c), null);
  assert.equal(ts.stayFails({}, c), null);
  const allNull = { max_guests: null, open_months: [], adults_only: null, pets: null, min_nights: null };
  assert.equal(ts.stayFails(allNull, c), null);
  assert.equal(ts.stayFails({ open_months: [5, 6, 7, 8, 9] }, c), 'open_months');
  assert.equal(ts.stayFails({ open_months: [12] }, c), 'open_months', 'the trip runs into January');
  assert.equal(ts.stayFails({ open_months: [12, 1] }, c), null);
  assert.equal(ts.stayFails({ max_guests: 4 }, c), 'max_guests');
  assert.equal(ts.stayFails({ max_guests: 5 }, c), null);
  assert.equal(ts.stayFails({ adults_only: true }, c), 'adults_only');
  assert.equal(ts.stayFails({ adults_only: false }, c), null);
  assert.equal(ts.stayFails({ pets: 'no' }, c), 'pets');
  assert.equal(ts.stayFails({ pets: 'some' }, c), null);
  assert.equal(ts.stayFails({ min_nights: 4 }, c), 'min_nights');
  assert.equal(ts.stayFails({ min_nights: 3 }, c), null);
  // No kids, no dog, no party size: those filters do not apply.
  const plain = ctxOf(plan(), { arrive: '2026-07-10', leave: '2026-07-12' });
  assert.equal(ts.stayFails({ adults_only: true, pets: 'no', max_guests: 1 }, plain), null);
});

test('ranking: nearest first; known good matches lift a stay; deterministic ties by id', () => {
  const near = stay({ id: 10, km: 0.5 }), far = stay({ id: 11, km: 4 }), mid = stay({ id: 12, km: 2 });
  const r = ts.pickTripStays(ctxOf(plan(), null), [far, mid, near]);
  assert.deepEqual([r.pick.id, ...r.alternatives.map((x) => x.id)], [10, 12, 11]);
  assert.match(r.pick.reasons[0].text, /^Under 1 km from your stops$/);
  assert.match(r.alternatives[0].reasons[0].text, /^\d(\.\d)? km from your stops$/);
  // Equal stays: the lower id, every time.
  const a = stay({ id: 21, km: 1 }), b = stay({ id: 20, km: 1 });
  assert.equal(ts.pickTripStays(ctxOf(plan(), null), [a, b]).pick.id, 20);
  assert.deepEqual(ts.pickTripStays(ctxOf(plan(), null), [a, b]), ts.pickTripStays(ctxOf(plan(), null), [b, a]));
  // Kids: family-friendly wins a close race, and says so.
  const kidsCtx = ctxOf(plan(), { adults: 2, kids: 2 });
  const fam = stay({ id: 30, km: 1.5, info: { kid_friendly: true } }), plainNear = stay({ id: 31, km: 1 });
  const k = ts.pickTripStays(kidsCtx, [plainNear, fam]);
  assert.equal(k.pick.id, 30);
  assert.equal(k.pick.reasons[1].text, 'Family-friendly');
  assert.equal(k.pick.reasons[1].textFr, 'Pour les familles');
  // A dog: pets welcome.
  const dogCtx = ctxOf(plan({ party: ['with a dog'] }), null);
  const pets = stay({ id: 40, km: 1.5, info: { pets: 'yes' } }), noPets = stay({ id: 41, km: 0.2, info: { pets: 'no' } }), unknownPets = stay({ id: 42, km: 1.2 });
  const dg = ts.pickTripStays(dogCtx, [noPets, unknownPets, pets]);
  assert.equal(dg.pick.id, 40);
  assert.equal(dg.pick.reasons[1].text, 'Pets welcome');
  assert.ok(![dg.pick, ...dg.alternatives].some((x) => x.id === 41), 'pets: no is dropped on a dog trip');
  // Budget words: the price band asked for.
  const cheapCtx = ctxOf(plan({ budget: 'budget' }), null);
  const cheap = stay({ id: 50, km: 2, info: { price_level: 1 } }), posh = stay({ id: 51, km: 1, info: { price_level: 4 } });
  assert.equal(ts.pickTripStays(cheapCtx, [posh, cheap]).pick.id, 50);
  assert.equal(ts.pickTripStays(ctxOf(plan({ budget: 'upscale' }), null), [posh, cheap]).pick.id, 51);
  // Kitchen counts only for 4+ nights.
  const kitchen = stay({ id: 60, km: 1.6, info: { kitchen: 'all' } }), noKitchen = stay({ id: 61, km: 1 });
  assert.equal(ts.pickTripStays(ctxOf(plan(), { arrive: '2026-07-10', leave: '2026-07-12' }), [noKitchen, kitchen]).pick.id, 61);
  const long = ts.pickTripStays(ctxOf(plan(), { arrive: '2026-07-10', leave: '2026-07-15' }), [noKitchen, kitchen]);
  assert.equal(long.pick.id, 60);
  assert.equal(long.pick.reasons[1].text, 'Kitchen');
  // A party of 5+: an unknown max_guests is a small minus.
  const big = ctxOf(plan(), { adults: 4, kids: 2 });
  const sleeps8 = stay({ id: 70, km: 1.8, info: { max_guests: 8 } }), unknownSize = stay({ id: 71, km: 1 });
  assert.equal(ts.pickTripStays(big, [unknownSize, sleeps8]).pick.id, 70);
  assert.equal(ts.pickTripStays(ctxOf(plan(), { adults: 2 }), [unknownSize, sleeps8]).pick.id, 71);
  // Confidence and a photo break near-ties.
  const photo = stay({ id: 80, km: 1.5, photo: '/images/venues/x.jpg' }), noPhoto = stay({ id: 81, km: 1 });
  assert.equal(ts.pickTripStays(ctxOf(plan(), null), [noPhoto, photo]).pick.id, 80);
  const sure = stay({ id: 90, km: 1.4, info: { confidence: 'high' } }), unsure = stay({ id: 91, km: 1, info: { confidence: 'low' } });
  assert.equal(ts.pickTripStays(ctxOf(plan(), null), [unsure, sure]).pick.id, 90);
});

test('kids, dogs, adults-only, open months and minimum nights together; nothing fits -> null (no empty card)', () => {
  const c = ctxOf(plan({ party: ['with a dog'] }), { arrive: '2026-01-09', leave: '2026-01-11', adults: 2, kids: 1 });
  const stays = [
    stay({ id: 1, km: 0.1, info: { adults_only: true } }),
    stay({ id: 2, km: 0.2, info: { pets: 'no' } }),
    stay({ id: 3, km: 0.3, info: { open_months: [5, 6, 7, 8, 9] } }),
    stay({ id: 4, km: 0.4, info: { min_nights: 3 } }),
    stay({ id: 5, km: 0.5, info: { max_guests: 2 } }),
  ];
  assert.equal(ts.pickTripStays(c, stays), null);
  assert.equal(ts.whereToStay(plan({ party: ['with a dog'] }), { arrive: '2026-01-09', leave: '2026-01-11', adults: 2, kids: 1 }, stays, '2026-01-01'), null);
  const ok = stay({ id: 6, km: 3, info: { open_months: [1, 2, 3, 12], min_nights: 2, max_guests: 4, pets: 'some', adults_only: false, kid_friendly: true } });
  const r = ts.pickTripStays(c, stays.concat(ok));
  assert.equal(r.pick.id, 6);
  assert.deepEqual(r.alternatives, []);
});

test('towns: the plan\'s towns first; nearby towns only to fill up, within 35 km; never a stay without a map location', () => {
  const c = ctxOf(plan(), null);
  const inTown = stay({ id: 1, km: 3 }), westK = stay({ id: 2, region: 'west-kelowna', regionLabel: 'West Kelowna', km: 2.5 });
  const farTown = stay({ id: 3, region: 'penticton', km: 50 }), noMap = { ...stay({ id: 4 }), latitude: null, longitude: null };
  const r = ts.pickTripStays(c, [farTown, westK, inTown, noMap]);
  assert.deepEqual([r.pick.id, ...r.alternatives.map((x) => x.id)], [1, 2], 'another town 2.5 km away still trails the town of the stops (3 km)');
  // Three or more in the plan's towns: other towns stay out.
  const three = [1, 2, 3].map((i) => stay({ id: 10 + i, km: 4 + i }));
  const r2 = ts.pickTripStays(c, three.concat(westK));
  assert.ok(![r2.pick, ...r2.alternatives].some((x) => x.id === 2));
});

test('stops with no map location: the town\'s stays, worded "In <town>", no distance', () => {
  const p = plan({ days: [{ day: 1, stops: [{ venue: { id: 1, region: 'penticton', latitude: null, longitude: null } }] }, { day: 2, stops: [{ venue: { id: 2, region: 'penticton' } }] }] });
  const c = ctxOf(p, null);
  assert.equal(c.centre, null);
  const r = ts.pickTripStays(c, [stay({ id: 5, region: 'penticton', regionLabel: 'Penticton' }), stay({ id: 6, region: 'kelowna' })]);
  assert.equal(r.pick.id, 5);
  assert.equal(r.pick.distanceKm, null);
  assert.deepEqual([r.pick.reasons[0].text, r.pick.reasons[0].textFr], ['In Penticton', 'À Penticton']);
  assert.deepEqual(r.alternatives, []);
});

test('the card: sleeps, price band, links, reasons in English and French; whereToStay carries the trip for booking later', () => {
  const s = stay({ id: 7, km: 2.14, photo: '/images/venues/a.jpg', info: { max_guests: 6, price_level: 3, kid_friendly: true } });
  const w = ts.whereToStay(plan(), { arrive: '2026-07-10', leave: '2026-07-13', adults: 2, kids: 2 }, [s], '2026-07-01');
  assert.equal(w.stayId, 7);
  assert.deepEqual(w.trip, { arrive: '2026-07-10', leave: '2026-07-13', nights: 3, adults: 2, kids: 2, datesGiven: true });
  assert.equal(w.pick.sleeps, 6);
  assert.equal(w.pick.priceBand, '$$$');
  assert.equal(w.pick.photo, '/images/venues/a.jpg');
  assert.equal(w.pick.url, s.url);
  assert.equal(w.pick.urlFr, s.urlFr);
  assert.ok(w.pick.reasons.length >= 1 && w.pick.reasons.length <= 2);
  assert.match(w.pick.reasons[0].text, /^2(\.\d)? km from your stops$/);
  assert.match(w.pick.reasons[0].textFr, /^À 2(,\d)? km de vos arrêts$/);
  assert.equal(JSON.stringify(w).includes('booking'), false, 'no booking links yet (step 3)');
  // Unknown facts stay unknown on the card.
  const bare = ts.whereToStay(plan(), null, [stay({ id: 8, km: 1 })], '2026-07-01');
  assert.deepEqual([bare.pick.sleeps, bare.pick.priceBand, bare.trip.adults, bare.trip.kids, bare.trip.datesGiven], [null, null, null, null, false]);
});
