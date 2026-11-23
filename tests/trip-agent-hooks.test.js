// Build My Trip travel agent hooks (2026-11-22): optional planner inputs the chat uses to act like a travel agent.
// All are inactive unless sent. PURE tests on fixtures and source (no server, no network).
//   stay.force / stay.none · tourStops · trustedPins · keepOnDateChange · overrides.stopStarts · moves · swap.features
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tp = require('../trip-planner.js');
const ts = require('../trip-stays.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const SRC = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const Q = '2 days in Kelowna, wineries and good food on December 4';
const at = (p, key) => { const [d, part] = key.split('-'); const day = p.days.find((x) => x.day === Number(d)); return day ? day.stops.find((s) => s.daypart === part && (s.venue || s.event)) || null : null; };
const row = (p, key) => { const s = at(p, key); const [d] = key.split('-'); return s && s.venue ? (p.schedule || []).find((r) => r.day === Number(d) && r.venueId === s.venue.id) || null : null; };
const pinsOf = (p) => { const o = {}; for (const d of p.days) for (const s of d.stops) if (s.venue) o[`${d.day}-${s.daypart}`] = s.venue.id; return o; };

test('1. stay.force gives a place to stay for a plan with no night; stay.none gives none', () => {
  assert.deepEqual(ts.parseTripStayInput({ force: true, arrive: '2026-12-04' }).value, { arrive: '2026-12-04', force: true });
  assert.deepEqual(ts.parseTripStayInput({ none: true }).value, { none: true });
  assert.ok(ts.parseTripStayInput({ force: 'yes' }).error);
  const centre = { lat: 49.888, lng: -119.496 };
  const stays = [{ id: 1, name: 'Lakeshore Hotel', kind: 'Hotel', kindKey: 'hotel', region: 'kelowna', regionLabel: 'Kelowna', latitude: centre.lat, longitude: centre.lng, url: '/kelowna/stay/1', info: null }];
  const dayPlan = { kind: 'day_plan', query: 'a day in Kelowna', intent: {}, understood: {}, days: [{ day: 1, stops: [{ venue: { region: 'kelowna', latitude: centre.lat, longitude: centre.lng } }] }] };
  assert.equal(ts.whereToStay(dayPlan, null, stays, '2026-11-22', { v4: true, text: 'a day in Kelowna', minArrive: '2026-11-23' }), null, 'a day plan has no stay by itself');
  const w = ts.whereToStay(dayPlan, { force: true, arrive: '2026-12-04' }, stays, '2026-11-22', { v4: true, text: 'a day in Kelowna', minArrive: '2026-11-23' });
  assert.equal(w.pick.id, 1);
  assert.deepEqual([w.trip.arrive, w.trip.leave, w.trip.nights], ['2026-12-04', '2026-12-05', 1]);
  const two = { ...dayPlan, kind: 'multi_day', days: [dayPlan.days[0], { day: 2, stops: dayPlan.days[0].stops }] };
  assert.ok(ts.whereToStay(two, null, stays, '2026-11-22', { v4: true, text: 'x', minArrive: '2026-11-23' }));
  assert.equal(ts.whereToStay(two, { none: true }, stays, '2026-11-22', { v4: true, text: 'x', minArrive: '2026-11-23' }), null, 'stay.none: no stay block');
  assert.ok(/!stay\.force && \(\['multi_day', 'day_plan'\]\.includes\(plan\.kind\) \|\| v4Nights\)/.test(SRC), 'a forced stay does not stretch the plan to more days');
});

test('2. tourStops: a tour is a timed stop; the covered stops inside its window give way (tourReplaced)', () => {
  const tour = fx.add({ name: 'Bench Wine Tours', region: 'kelowna', type: 'tour', rating: 4.8, cuisine: 'Wine tours', desc: 'Guided winery tours with a driver.' });
  try {
    const first = fx.plan(Q, { extra: { v4: true } });
    const wineries = first.days[0].stops.filter((s) => s.venue && s.venue.type === 'winery').map((s) => s.venue.id);
    assert.ok(wineries.length >= 1, 'day 1 has wineries');
    const p = fx.plan(Q, { extra: { v4: true, tourStops: [{ day: 1, part: 'morning', listingId: tour.id, startMinutes: 630, durationMinutes: 360, covers: ['winery'] }] } });
    const stop = p.days[0].stops.find((s) => s.venue && s.venue.id === tour.id);
    assert.ok(stop && stop.tourStop && stop.daypart === 'morning', 'the tour is a stop on day 1');
    const r = p.schedule.find((x) => x.day === 1 && x.venueId === tour.id);
    assert.deepEqual([r.startMinutes, r.endMinutes, r.tourStop], [630, 990, true]);
    assert.ok(!p.days[0].stops.some((s) => s.venue && s.venue.type === 'winery'), 'day 1 wineries inside the tour give way');
    assert.ok(wineries.every((id) => p.tourReplaced.includes(id)), `tourReplaced lists them: ${p.tourReplaced}`);
    assert.ok(p.days[1].stops.some((s) => s.venue && s.venue.type === 'winery'), 'day 2 keeps its wineries');
    assert.ok(p.days[0].stops.some((s) => s.daypart === 'evening' && s.venue), 'dinner stays');
    const bad = fx.plan(Q, { extra: { v4: true, tourStops: [{ day: 1, part: 'morning', listingId: 999999 }] } });
    assert.deepEqual(bad.tourStopErrors, [{ listingId: 999999, reason: 'not_listed' }]);
    assert.equal(fx.plan(Q, { extra: { v4: true } }).tourReplaced, undefined, 'inactive unless sent');
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(tour), 1); }
  assert.ok(/function v4TourStopLinks\(plan\)/.test(SRC) && SRC.includes("if (link) s.bookingLink = link;"), 'the stop carries its exact stored link (Viator match, else the operator\'s booking page)');
});

test('5/6. trustedPins survive a re-plan that no longer fits them; keepOnDateChange drops only a stop closed on the new date', () => {
  const winery = fx.FACTS.find((v) => v.type === 'winery');
  // A winery added by the chat, then "we have kids with us, no alcohol": the request no longer fits it.
  const q = "2 days in Kelowna with kids 6 and 9, we don't drink, on December 4";
  const plain = fx.plan(q, { extra: { v4: true } });
  assert.ok(!plain.days.some((d) => d.stops.some((s) => s.venue && s.venue.id === winery.id)));
  const p = fx.plan(q, { extra: { v4: true, pinned: { '1-afternoon': winery.id }, trustedPins: ['1-afternoon'] } });
  assert.equal(at(p, '1-afternoon').venue.id, winery.id, 'the trusted pin is in its slot');
  assert.ok(Number.isFinite((row(p, '1-afternoon') || {}).startMinutes), 'with a time');
  assert.deepEqual(p.droppedPins, []);
  // Dates change: every stop pinned; one is closed on the new Sunday.
  const closed = fx.add({ name: 'Weekday Only Winery', region: 'kelowna', type: 'winery', rating: 4.9, hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ['sat', 'sun'].includes(d) ? [] : [['10:00', '15:00']]])), dLat: 0.01 });
  try {
    const first = fx.plan('2 days in Kelowna, wineries and good food on December 3', { extra: { v4: true } }); // Thu-Fri
    const pins = pinsOf(first);
    pins['2-morning'] = closed.id;
    const moved = fx.plan('2 days in Kelowna, wineries and good food on December 5', { extra: { v4: true, pinned: pins, keepOnDateChange: true } }); // Sat-Sun
    assert.deepEqual(moved.droppedPins, [{ key: '1-morning', id: pins['1-morning'], reason: 'closed' }, { key: '2-morning', id: closed.id, reason: 'closed' }].filter((x) => x.id === closed.id), 'only the stop closed on the new date is dropped');
    for (const [k, id] of Object.entries(pins)) if (id !== closed.id) assert.equal((at(moved, k) || { venue: {} }).venue.id, id, `${k} is kept`);
    assert.ok(!moved.days.some((d) => d.stops.some((s) => s.venue && s.venue.id === closed.id)));
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(closed), 1); }
});

test('3/7. overrides.stopStarts: one stop\'s start is honoured without moving the rest; refused when the place is closed then', () => {
  const first = fx.plan(Q, { extra: { v4: true } });
  const dinner = at(first, '1-evening');
  const before = Object.fromEntries(first.schedule.map((r) => [`${r.day}:${r.venueId}`, r.startMinutes]));
  const p = fx.plan(Q, { extra: { v4: true, pinned: pinsOf(first), stopStarts: { '1-evening': 1110 } } });
  assert.equal(at(p, '1-evening').venue.id, dinner.venue.id);
  assert.equal(row(p, '1-evening').startMinutes, 1110, 'dinner at 6:30');
  for (const r of p.schedule) if (!(r.day === 1 && r.venueId === dinner.venue.id)) assert.equal(r.startMinutes, before[`${r.day}:${r.venueId}`], 'nothing else is re-timed');
  assert.equal(p.stopStartRefused, undefined);
  const lunch = at(first, '1-midday');
  const fv = fx.FACTS.find((v) => v.id === lunch.venue.id);
  const closes = Math.max(...JSON.parse(fv.hours).fri.map(([, b]) => Number(b.slice(0, 2)) * 60 + Number(b.slice(3))));
  const late = fx.plan(Q, { extra: { v4: true, pinned: pinsOf(first), stopStarts: { '1-midday': closes + 60 } } });
  if (closes + 60 < 1440) {
    assert.equal(late.stopStartRefused[0].key, '1-midday');
    assert.equal(late.stopStartRefused[0].reason, 'closed');
    assert.equal(row(late, '1-midday').startMinutes, before[`1:${lunch.venue.id}`], 'the stop keeps its time');
  }
});

test('4. moves: a stop moves to another day; a stop already there changes places with it', () => {
  const first = fx.plan(Q, { extra: { v4: true } });
  const a = at(first, '1-afternoon'), b = at(first, '2-morning');
  assert.ok(a && b);
  const p = fx.plan(Q, { extra: { v4: true, pinned: pinsOf(first), trustedPins: Object.keys(pinsOf(first)).filter((k) => !['1-afternoon', '2-morning'].includes(k)), moves: [{ from: '1-afternoon', to: '2-morning' }] } });
  assert.deepEqual(p.moved, [{ from: '1-afternoon', to: '2-morning', id: a.venue.id }]);
  assert.equal(at(p, '2-morning').venue.id, a.venue.id);
  assert.equal(at(p, '1-afternoon').venue.id, b.venue.id);
  const none = fx.plan(Q, { extra: { v4: true, moves: [{ from: '1-night', to: '2-night' }] } });
  assert.deepEqual(none.moveConflicts, [{ from: '1-night', to: '2-night', reason: 'no_stop' }]);
});

test('8. a Swap takes several constraints at once: badges, the listing\'s words and a price bound', () => {
  const v = { type: 'restaurant', name: 'Patio Thai', price: 2, features: { patio: true, vegetarian: true }, description: 'Thai curries and noodles on a lakeside patio.', textDesc: 'thai curries and noodles on a lakeside patio' };
  assert.equal(tp.swapWantOk(v, { features: ['patio', 'vegetarian'], priceMax: 2 }), true);
  assert.equal(tp.swapWantOk(v, { features: ['patio', 'live_music'], priceMax: 2 }), false);
  assert.equal(tp.swapWantOk(v, { features: ['patio'], priceMax: 1 }), false);
  assert.equal(tp.swapWantOk(v, { want: 'patio', features: ['vegetarian'], priceMax: 3 }), true);
  assert.ok(SRC.includes("'want', 'priceMax', 'priceMin', 'features', 'words', 'types', 'wide'"), 'the plan API accepts them together');
});

test('9. the request body accepts the hooks, and a removed stop is not a booking step', () => {
  assert.ok(SRC.includes("const allowed = ['text', 'seed', 'excludeVenueIds', 'avoidVenueIds', 'pinned', 'overrides', 'swap', 'tourStops', 'moves', 'trustedPins', 'keepOnDateChange'];"));
  assert.ok(SRC.includes("'eventId', 'stopStarts'].includes(k))"));
  assert.ok(SRC.includes('...(tourStops ? { tourStops } : {}), ...(moves ? { moves } : {}), ...(trustedPins ? { trustedPins } : {}), ...(keepOnDateChange ? { keepOnDateChange: true } : {}), ...(overrides && overrides.stopStarts ? { stopStarts: overrides.stopStarts } : {})'));
  assert.ok(PAGE.includes('function v4RemovedIds()') && PAGE.includes("return t3BookStepsAll().filter(function(x){ return !(x && x.kind === \\'venue\\' && (gone[x.id] || (shown && !shown[x.id]))); });"));
  const plain = fx.plan(Q, { extra: { v4: true } });
  for (const k of ['moved', 'moveConflicts', 'droppedPins', 'tourReplaced', 'tourStopErrors', 'stopStartRefused']) assert.equal(plain[k], undefined, `${k} only when asked`);
});
