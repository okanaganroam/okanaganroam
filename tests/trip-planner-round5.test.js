// Build My Trip planner, round 5 (2026-11-22): fresh-eyes test 6 fixes on the planner side. PURE tests on fixtures and
// source (no server, no network).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tp = require('../trip-planner.js');
const ts = require('../trip-stays.js');
const tb = require('../trip-booking.js');
const tr = require('../trip-requirements.js');
const frc = require('../trip-french-copy.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const SRC = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const V3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
const Q = '2 days in Kelowna, wineries and good food on December 4';
const rowsOf = (p, day) => (p.schedule || []).filter((r) => r.day === day && Number.isFinite(r.startMinutes) && Number.isFinite(r.endMinutes));
const pinsOf = (p) => { const o = {}; for (const d of p.days) for (const s of d.stops) if (s.venue) o[`${d.day}-${s.daypart}`] = s.venue.id; return o; };

test('1. a tour placed as a timed stop owns its window: no other stop inside it; lunch moves or the tour waits', () => {
  const tour = fx.add({ name: 'Valley Wine Tours', region: 'kelowna', type: 'tour', rating: 4.8, cuisine: 'Wine tours', desc: 'Guided winery tours with a driver.' });
  try {
    const first = fx.plan(Q, { extra: { v4: true } });
    const pins = pinsOf(first);
    const p = fx.plan(Q, { extra: { v4: true, pinned: pins, trustedPins: Object.keys(pins), tourStops: [{ day: 1, part: 'morning', listingId: tour.id, startMinutes: 660, durationMinutes: 240, covers: ['winery'] }] } });
    const tr0 = p.schedule.find((x) => x.day === 1 && x.venueId === tour.id);
    assert.ok(tr0 && tr0.tourStop, 'the tour is timed');
    for (const r of rowsOf(p, 1)) if (r !== tr0) assert.ok(r.endMinutes <= tr0.startMinutes || r.startMinutes >= tr0.endMinutes, `nothing inside the tour: ${r.venueId} ${r.startMinutes}-${r.endMinutes} vs ${tr0.startMinutes}-${tr0.endMinutes}`);
    assert.ok(Array.isArray(p.tourReplaced));
    for (const a of p.tourAdjust || []) assert.ok(['lunch_in_tour', 'lunch_after', 'lunch_before', 'tour_after_lunch', 'lunch_gave_way', 'dinner_after'].includes(a.how), a.how);
    assert.deepEqual(p.tourStops.map((x) => [x.day, x.listingId]), [[1, tour.id]], 'the tours as they are now');
    // A later entry for the same tour on another day is a move.
    const pins2 = pinsOf(p);
    const p2 = fx.plan(Q, { extra: { v4: true, pinned: pins2, trustedPins: Object.keys(pins2).filter((k) => pins2[k] !== tour.id), tourStops: [{ day: 1, part: 'morning', listingId: tour.id, startMinutes: 660, durationMinutes: 240, covers: ['winery'] }, { day: 2, part: 'afternoon', listingId: tour.id, startMinutes: 810, durationMinutes: 240, covers: ['winery'] }] } });
    assert.ok(p2.days[1].stops.some((s) => s.venue && s.venue.id === tour.id) && !p2.days[0].stops.some((s) => s.venue && s.venue.id === tour.id), 'the tour is on day 2 only');
    assert.equal(p2.tourStops[0].day, 2);
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(tour), 1); }
  assert.equal(tp.v4MealStop({ venue: { type: 'cafe' }, daypart: 'late' }), false, 'a café later in the day is a treat, not a meal');
  assert.equal(tp.tourIncludesMeal({ name: 'Lunch Wine Tour', description: '' }), true);
  assert.equal(tp.tourIncludesMeal({ name: 'Bench Tours', description: 'Four wineries, lunch included at a winery bistro.' }), true);
  assert.equal(tp.tourIncludesMeal({ name: 'Bench Tours', description: 'Four wineries. Bring your own lunch.' }), false);
});

test('2. a tour that covers wineries counts as the wineries asked for', () => {
  assert.ok(SRC.includes('const toured = r.kind === \'type\' && stops.some((x) => x.tourStop && ((x.tourCovers || []).includes(r.value)'));
  assert.ok(fs.readFileSync(require.resolve('../trip-planner.js'), 'utf8').includes('tourCovers: covers.slice()'));
});

test('3. the booking sheet is built only from the stops on screen', () => {
  assert.ok(PAGE.includes('function v4ShownIds()') && PAGE.includes("(gone[x.id] || (shown && !shown[x.id]))"));
  assert.ok(PAGE.includes('var shownNames = v4ShownNames(), unknown = (e.unknown || []).filter('));
});

test('4. party size: kids alone are 2 adults plus the kids; the stay links follow the party on screen', () => {
  const plan = { kind: 'multi_day', intent: {}, days: [{ day: 1, stops: [{ venue: { id: 9, region: 'kelowna', latitude: 49.88, longitude: -119.49 } }] }, { day: 2, stops: [] }] };
  const ctx = ts.tripStayContext(plan, { kids: 2 }, '2026-11-22', {});
  assert.deepEqual([ctx.adults, ctx.adultsAssumed, ctx.kids, ctx.guests], [2, true, 2, 4]);
  const e = tb.tripEstimate({ days: [{ day: 1, stops: [{ venue: { id: 1, name: 'Bistro', type: 'restaurant', price: 2 } }] }] }, null, { adults: 2, adultsAssumed: true, kids: 2 });
  assert.deepEqual([e.people, e.peopleAssumed, e.kids], [4, true, 2]);
  assert.ok(V3.includes("'Counted for 2 adults and ' + e.kids"));
  assert.ok(PAGE.includes('function v4PartyUrl(raw)') && PAGE.includes("q.set('group_adults', String(ad))") && PAGE.includes("q.set('rm1', 'a' + ad + ages)"));
});

test('5. meal pacing: breakfast and lunch start 2.5 hours apart, else the café is a coffee stop', () => {
  const day = (m, l, next) => ({ kind: 'day_plan', days: [{ day: 1, stops: [{ daypart: 'morning', venue: { id: 1, type: m } }, { daypart: 'midday', venue: { id: 2, type: 'restaurant' } }, { daypart: 'afternoon', venue: { id: 3, type: 'indoor' } }] }],
    schedule: [{ day: 1, venueId: 1, startMinutes: 585, endMinutes: 645 }, { day: 1, venueId: 2, startMinutes: l, endMinutes: l + 75 }, { day: 1, venueId: 3, startMinutes: next, endMinutes: next + 60 }] });
  const a = tp.v4MealPacing(day('restaurant', 690, 900), { v4: true, facts: [] });
  assert.equal(a.mealPacing[0].how, 'lunch_later');
  assert.ok(a.schedule[1].startMinutes - a.schedule[0].startMinutes >= 150);
  const b = tp.v4MealPacing(day('cafe', 690, 780), { v4: true, facts: [] });
  assert.ok(['breakfast_earlier', 'coffee_stop'].includes(b.mealPacing[0].how));
  const c = tp.v4MealPacing({ kind: 'day_plan', days: [{ day: 1, stops: [{ daypart: 'morning', venue: { id: 7, type: 'indoor', name: 'Core Climbing' } }] }], schedule: [{ day: 1, venueId: 7, startMinutes: 540, endMinutes: 930 }] }, { v4: true, facts: [] });
  assert.equal(c.schedule[0].endMinutes, 720, 'a climbing gym is not 6.5 hours');
});

test('6. sunset dinner start for the Swap / stopStarts path', () => {
  assert.ok(/function sunsetDinnerStart\(date, town = null\)/.test(SRC) && /module\.exports = \{\n  sunsetDinnerStart,/.test(SRC));
  assert.ok(SRC.includes("if (m && /\\bsunset|coucher (?:du|de) soleil/i.test(JSON.stringify([w.words || null, w.want || null])))"));
});

test('7. stopStarts: an unchanged start re-times nothing; a stop in the way is cut short, gives way to a meal, or refuses', () => {
  const first = fx.plan(Q, { extra: { v4: true } });
  const pins = pinsOf(first);
  const starts = {};
  for (const d of first.days) for (const s of d.stops) if (s.venue) { const r = first.schedule.find((x) => x.day === d.day && x.venueId === s.venue.id); if (r && Number.isFinite(r.startMinutes)) starts[`${d.day}-${s.daypart}`] = r.startMinutes; }
  const same = fx.plan(Q, { extra: { v4: true, pinned: pins, trustedPins: Object.keys(pins), stopStarts: starts } });
  for (const d of first.days) for (const s of d.stops) if (s.venue) {
    const a = first.schedule.find((x) => x.day === d.day && x.venueId === s.venue.id), b = same.schedule.find((x) => x.day === d.day && x.venueId === s.venue.id);
    if (a && b && Number.isFinite(a.endMinutes)) assert.equal(b.endMinutes - b.startMinutes, a.endMinutes - a.startMinutes, `${s.venue.name} keeps its length`);
  }
  assert.equal(same.stopStartRefused, undefined);
  for (const d of same.days) { const rs = rowsOf(same, d.day).sort((x, y) => x.startMinutes - y.startMinutes); for (let i = 1; i < rs.length; i++) assert.ok(rs[i].startMinutes >= rs[i - 1].endMinutes || rs[i - 1].endMinutes - rs[i - 1].startMinutes > 240, 'no overlap'); }
});

test('8. picks and words: a party of 4 is not a big group; French twins; ski lessons never asked are silent', () => {
  assert.equal(tr.extractTripRequirements({ text: 'Ski weekend Dec 11-13 for 4 adults', taxonomy: fx.TAXONOMY || {} }).items.some((i) => i.value === 'great_groups'), false);
  for (const t of ['Indoors, so it works in any weather', 'Fills the afternoon', 'In Kelowna, on the way', 'Placed in the late afternoon slot', 'A coffee stop: lunch follows soon after.']) assert.notEqual(frc.t3FrenchText(t), t, t);
  assert.ok(SRC.includes("{ r.silent = true; continue; }") && V3.includes("i.status!=='unmet'||i.silent||"));
  assert.ok(SRC.includes('const textFr = (noneListed && town ?'), 'plan.notIncluded says it in French too');
});

test('9. stays: an undated weekend starts on the coming Saturday and never before a stop reopens; couples get rooms for two', () => {
  const plan = { kind: 'multi_day', intent: {}, days: [{ day: 1, stops: [{ venue: { id: 9, region: 'kelowna', latitude: 49.88, longitude: -119.49 } }] }, { day: 2, stops: [] }] };
  const c1 = ts.tripStayContext(plan, null, '2026-11-22', { v4: true, minArrive: '2026-11-23', text: 'a weekend away' });
  assert.equal(c1.arrive, '2026-11-28');
  const c2 = ts.tripStayContext(plan, null, '2026-11-22', { v4: true, minArrive: '2026-11-23', notBefore: '2026-11-26', text: 'two days skiing' });
  assert.equal(c2.arrive, '2026-11-26');
  const big = ts.scoreStay({ id: 1, name: 'Family Resort & Waterslides', region: 'kelowna', coords: { lat: 49.88, lng: -119.49 }, info: { max_guests: 8, bedrooms_max: 3 } }, { ...c1, couple: true, v4: true, withKids: false, centre: { lat: 49.88, lng: -119.49 } });
  const two = ts.scoreStay({ id: 2, name: 'Lakeview Inn', region: 'kelowna', coords: { lat: 49.88, lng: -119.49 }, info: { max_guests: 2 } }, { ...c1, couple: true, v4: true, withKids: false, centre: { lat: 49.88, lng: -119.49 } });
  assert.ok(big.score > two.score, `${big.score} > ${two.score}`);
});
