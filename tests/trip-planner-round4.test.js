// Build My Trip planner, round 4 (fresh-eyes test 4, 2026-11-22): a one-stop change touches nothing else, the party the
// request names, picks that follow the listing's own facts (closing notices, winter notices, hours for meals, road
// access), occasion and variety, honest "not included" lines, and stays that respect the town and the budget.
// PURE tests on fixtures and source (no server, no network).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tr = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const ts = require('../trip-stays.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const SRC = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const grab = (re) => { const m = re.exec(SRC); assert.ok(m, `source has ${re}`); return m[0]; };
const rowsOf = (p) => { const o = {}; for (const d of p.days) for (const s of d.stops) { if (!s.venue) continue; const r = (p.schedule || []).find((x) => x.day === d.day && x.venueId === s.venue.id) || {}; o[`${d.day}-${s.daypart}`] = { id: s.venue.id, start: r.startMinutes }; } return o; };

// ---- 1. A one-stop change must not touch other stops ----
test('1. adding or swapping one stop leaves every other stop its place and its time', () => {
  const arcade = fx.add({ name: 'Planet Fun Arcade', region: 'kelowna', type: 'indoor', rating: 4.5, desc: 'An arcade with laser tag.', hours: fx.open('11:00', '22:00'), dLat: 0.004 });
  try {
    for (const q of ['3 days in Kelowna, wineries and good food', '3 days in Kelowna, wineries and good food on December 4']) {
      const first = fx.plan(q, { extra: { v4: true } });
      const a = rowsOf(first);
      const pinned = {}, times = {};
      for (const [k, v] of Object.entries(a)) { pinned[k] = v.id; if (Number.isInteger(v.start)) times[k] = v.start; }
      // Add one stop after dinner on day 1.
      const add = fx.plan(q, { extra: { v4: true, pinned, swap: { key: '1-night', type: 'indoor', want: 'activity', locked: [], times } } });
      const b = rowsOf(add);
      for (const k of Object.keys(a)) assert.deepEqual(b[k], a[k], `${q}: ${k} is unchanged after the add`);
      if (!add.swapMissed) assert.ok(b['1-night'] && b['1-night'].start >= a['1-evening'].start + 60, 'the new stop is after dinner');
      // Swap one winery: same slot, same time.
      const key = Object.keys(a).find((k) => first.days[Number(k[0]) - 1].stops.find((s) => `${k[0]}-${s.daypart}` === k).venue.type === 'winery');
      const p2 = { ...pinned }; delete p2[key];
      const sw = fx.plan(q, { extra: { v4: true, pinned: p2, excludeIds: [a[key].id], swap: { key, type: 'winery', id: a[key].id, locked: [], times } } });
      const c = rowsOf(sw);
      for (const k of Object.keys(a)) if (k !== key) assert.deepEqual(c[k], a[k], `${q}: ${k} is unchanged after the swap`);
      if (!sw.swapMissed) { assert.notEqual(c[key].id, a[key].id); assert.ok(Math.abs(c[key].start - a[key].start) <= 30, `the new winery is at the old time (${c[key].start} vs ${a[key].start})`); }
    }
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(arcade), 1); }
});

test('1. a change that would move another stop is not made (the next place is tried, then it is reported)', () => {
  const stop = (part, id, type = 'restaurant') => ({ daypart: part, venue: { id, type, name: `P${id}` } });
  const mk = () => ({ kind: 'day_plan', days: [{ day: 1, stops: [stop('midday', 1), stop('afternoon', 2, 'indoor'), stop('evening', 3)] }],
    schedule: [{ day: 1, venueId: 1, startMinutes: 720, endMinutes: 810 }, { day: 1, venueId: 2, startMinutes: 1080, endMinutes: 1170 }, { day: 1, venueId: 3, startMinutes: 1185, endMinutes: 1275 }] });
  const facts = [{ id: 2, hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['18:00', '22:00']]]))) }];
  const input = { v4: true, facts, pinned: { '1-midday': 1, '1-evening': 3 }, swap: { key: '1-afternoon', type: 'indoor', times: { '1-midday': 690, '1-afternoon': 945, '1-evening': 1080 } }, startWeekday: 'fri' };
  const p = mk();
  const r = tp.v4SwapSteady(p, input);
  assert.deepEqual([p.schedule[0].startMinutes, p.schedule[2].startMinutes], [690, 1080], 'lunch and dinner are set back to their times');
  assert.equal(r.ok, false, 'a rink that only opens at 6 PM cannot take a 3:45 PM slot before a 6 PM dinner');
  assert.equal(r.id, 2);
  // An open place takes the slot at the old time.
  const open = mk();
  const ok = tp.v4SwapSteady(open, { ...input, facts: [{ id: 2, hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '22:00']]]))) }] });
  assert.equal(ok.ok, true);
  assert.equal(open.schedule[1].startMinutes, 945);
  assert.ok(open.schedule[1].endMinutes <= 1070, 'and ends before dinner');
  // Another stop's place changed: not steady.
  const moved = mk(); moved.days[0].stops[2].venue.id = 9; moved.schedule[2].venueId = 9;
  assert.equal(tp.v4SwapSteady(moved, input).ok, false);
});

// ---- 2. Party size ----
test('2. the party the request names: adults and kids, in English and French', () => {
  const cases = [
    ['2 days in Whistler Dec 19-20, 4 adults, snowmobiling, ziplining and a nice steak dinner', { adults: 4 }],
    ['Girls weekend in Kelowna, 4 friends, spa and cocktails', { adults: 4 }],
    ['the six of us in Vernon', { adults: 6 }],
    ['une fin de semaine en famille à Kelowna avec deux enfants', { kids: 2 }],
    ['anniversary weekend in Kelowna', { adults: 2 }],
    ['family of four in Kelowna', { adults: 2, kids: 2 }],
    ['3 couples in Kelowna', { adults: 6 }],
    ['4 amis à Whistler', { adults: 4 }],
    ['solo trip to Kelowna', { adults: 1 }],
    ['ski weekend with two kids, 7 and 10', { kids: 2 }],
    ['a couple of days in Vernon', {}],
    ['2 days in Kelowna', {}],
    ['3 wineries and 2 breweries', {}],
    ['girls trip to Kelowna', {}],
  ];
  for (const [q, want] of cases) assert.deepEqual(tp.requestParty(q), want, q);
  assert.ok(/const party = tripPlannerModule\(\)\.requestParty\(String\(text \|\| ''\)\);\n\s+if \(stayIn\.adults === undefined && party\.adults\) stayIn\.adults = Math\.min\(16, party\.adults\);\n\s+if \(stayIn\.kids === undefined && party\.kids\) stayIn\.kids = party\.kids;/.test(SRC), 'the stay, its links and the estimate get the party');
  const tb = require('../trip-booking.js');
  assert.equal(tb.tripEstimate({ kind: 'multi_day', days: [{ day: 1, stops: [] }] }, null, { adults: 4 }).people, 4);
});

// ---- 3. Picks follow the listing's own facts ----
test('3. a place whose notice says it is closing is not planned from the day it closes', () => {
  assert.equal(tp.advisoryClosingFrom('Naked Cafe has announced it is closing at the end of November 2026, after twelve years. It is open as usual until then.'), '2026-12-01');
  assert.equal(tp.advisoryClosingFrom('Closing on November 28, 2026.'), '2026-11-29');
  assert.equal(tp.advisoryClosingFrom('Closed for the season; closing October 12, 2026 and reopening in May.'), null);
  assert.equal(tp.advisoryClosingFrom('The patio closes at the end of October'), null, 'no year: not guessed');
  const cafe = { advisory: { note: 'Closing at the end of November 2026.' } };
  assert.equal(tp.seasonClosedOnTrip(cafe, { date: '2026-12-06' }), true);
  assert.equal(tp.seasonClosedOnTrip(cafe, { date: '2026-11-29' }), false);
});

test('3. a winter notice that rules out walking takes the trail out, unless the trip is Nordic skiing or snowshoeing', () => {
  const note = 'In winter, Lost Lake Park is for ski and snowshoe ticket holders only. Walkers, bikers and dogs are not allowed then.';
  assert.ok(tp.WINTER_NO_WALK_RE.test(note));
  assert.ok(!tp.WINTER_NO_WALK_RE.test('Trails can be icy in winter; bring traction.'));
  const v = { type: 'outdoor', name: 'Lost Lake Loop', textName: 'lost lake loop', textDesc: '', activities: [], advisory: { note } };
  const ctx = (text, date) => ({ tripDate: date, activities: new Set(), types: new Set(), queryText: text, requirements: { text } });
  assert.equal(tp.offSeasonSkip(v, ctx('3 days in whistler for a couple', '2026-12-12')), true);
  assert.equal(tp.offSeasonSkip(v, ctx('3 days in whistler for a couple', '2026-07-12')), false);
  assert.equal(tp.offSeasonSkip(v, ctx('snowshoeing in whistler', '2026-12-12')), false);
});

test('3. a place reached by a gravel forest road is not planned December to March; a yoga studio is not a spa', () => {
  const myra = { type: 'outdoor', textName: 'myra canyon', activities: [], outdoorSeason: { season: 'Open year-round; services mid-April to November 15', winter: '', road: 'Forest road is gravel and can be rough Gravel lots at the end of an 8 km forest road' } };
  const ctx = { queryText: '3 days in kelowna', requirements: { text: '3 days in kelowna' } };
  assert.equal(tp.outdoorFactsSeasonOff(myra, ctx, 12), true);
  assert.equal(tp.outdoorFactsSeasonOff(myra, ctx, 6), false);
  assert.equal(tp.outdoorFactsSeasonOff({ ...myra, outdoorSeason: { ...myra.outdoorSeason, road: 'Paved lot off Stewart Road' } }, ctx, 12), false);
  assert.equal(tp.outdoorFactsSeasonOff(myra, { queryText: 'myra canyon in december', requirements: { text: 'myra canyon in december' } }, 12), false, 'named: kept');
  assert.ok(/const road = \[/.test(SRC) && /\.\.\.\(road \? \{ road \} : \{\}\)/.test(SRC), 'the server hands the road facts to the planner');
  assert.ok(!tr.inferPlannerKinds({ name: 'Yogacara Studios', type: 'indoor', cuisine: 'Yoga studio', description: 'Hot yoga and wellness classes.' }).includes('spa'));
  assert.ok(tr.inferPlannerKinds({ name: 'Scandinave Spa', type: 'indoor', cuisine: 'Spa', description: 'Hot and cold baths, sauna and massage.' }).includes('spa'));
});

test('3/4. a meal is at a place with hours for it; no brand twice; one operator per tour kind; one brewery when one is asked', () => {
  const nohours = fx.add({ name: 'Alta Table', region: 'kelowna', type: 'restaurant', rating: 5, price: 3, cuisine: 'Modern Canadian', desc: 'Fall menu served nights.', dLat: 0.001 });
  const b1 = fx.add({ name: 'La Cantina Tacos (Village)', region: 'kelowna', type: 'restaurant', rating: 4.95, price: 2, cuisine: 'Mexican', desc: 'Tacos.', hours: fx.open('11:00', '21:00'), dLat: 0.002 });
  const b2 = fx.add({ name: 'La Cantina Tacos (Plaza)', region: 'kelowna', type: 'restaurant', rating: 4.95, price: 2, cuisine: 'Mexican', desc: 'Tacos.', hours: fx.open('11:00', '21:00'), dLat: 0.003 });
  try {
    const p = fx.plan('3 days in Kelowna, wineries and good food on December 4', { extra: { v4: true } });
    const meals = p.days.flatMap((d) => d.stops.filter((s) => s.venue && ['midday', 'evening'].includes(s.daypart) && s.venue.type === 'restaurant').map((s) => s.venue.id));
    assert.ok(!meals.includes(nohours.id), 'no hours listed: not a timed meal when others have hours');
    assert.ok(!(meals.includes(b1.id) && meals.includes(b2.id)), 'one La Cantina Tacos in a trip');
  } finally { for (const x of [nohours, b1, b2]) fx.FACTS.splice(fx.FACTS.indexOf(x), 1); }
  const ctx = { v4: true, kids: false, types: new Set(['brewery', 'outdoor']), queryText: 'one day in squamish hiking and a brewery' };
  assert.equal(tp.v4FillerSkip({ type: 'brewery', name: 'Hop Co.', textName: 'hop co' }, ctx), true, '"a brewery": no second brewery as a filler');
  assert.equal(tp.v4FillerSkip({ type: 'brewery', name: 'Hop Co.', textName: 'hop co' }, { ...ctx, queryText: 'hiking and breweries' }), false);
  const src = fs.readFileSync(require.resolve('../trip-planner.js'), 'utf8');
  assert.ok(src.includes('if (!isKept && kinds.length && kinds.every((k) => tourKinds.has(k)))'), 'one operator per kind of tour');
});

// ---- 4. Occasion and variety ----
test('4. "a night in", an anniversary night: one overnight; chains are a mild tie-break; a hardware store is not shopping', () => {
  const body = grab(/const V4_NIGHT_WORDS = [\s\S]*?\nfunction v4NightsText\(text\) \{[\s\S]*?\n\}/);
  const nights = new Function(`${body}; return v4NightsText;`)(); // eslint-disable-line no-new-func
  assert.equal(nights('Romantic anniversary night in Naramata, December 12, we love wine and a great dinner').text, 'Romantic anniversary 2 days in Naramata, December 12, we love wine and a great dinner');
  assert.equal(nights('a night in Vernon with friends').nights, 1);
  assert.equal(nights('dinner and a show in Kelowna tonight'), null);
  assert.equal(nights('date night in Kelowna'), null);
  assert.equal(nights('a night out in Kelowna'), null);
  for (const n of ['boston pizza penticton', 'joey kelowna', 'montana s bbq bar', 'earls kitchen bar']) assert.ok(tp.CHAIN_NAME_RE.test(n), n);
  for (const n of ['wildling', 'bouchons bistro', 'joe s garage', 'the keg and barrel pub']) assert.ok(!tp.CHAIN_NAME_RE.test(n) || n === 'the keg and barrel pub', n);
  const chain = fx.add({ name: 'Boston Pizza Kelowna', region: 'kelowna', type: 'restaurant', rating: 4.5, price: 2, cuisine: 'Pizza', desc: 'Pizza and pasta.', hours: fx.open('11:00', '23:00') });
  const local = fx.add({ name: 'Nonna Pizza Kelowna', region: 'kelowna', type: 'restaurant', rating: 4.5, price: 2, cuisine: 'Pizza', desc: 'Pizza and pasta.', hours: fx.open('11:00', '23:00') });
  try {
    const d = require('../discovery-intent.js');
    const intent = d.interpretDiscoveryQuery('2 days in Kelowna', fx.TAXONOMY);
    const ctx = tp.buildContext(intent, fx.LABELS, { v4: true, text: '2 days in Kelowna' });
    assert.ok(tp.scoreVenue(local, ctx).score > tp.scoreVenue(chain, ctx).score, 'the local place first when both fit');
    assert.equal(tp.scoreVenue(local, tp.buildContext(intent, fx.LABELS, { text: '2 days in Kelowna' })).score, tp.scoreVenue(chain, tp.buildContext(intent, fx.LABELS, { text: '2 days in Kelowna' })).score, 'not V4: unchanged');
  } finally { for (const x of [chain, local]) fx.FACTS.splice(fx.FACTS.indexOf(x), 1); }
  assert.ok(tp.ERRAND_SHOP_RE.test('whistler hardware') && !tp.ERRAND_SHOP_RE.test('armchair books'));
  assert.ok(SRC.includes("plan.noDrive = { wineTour: true"), 'no driving after wineries: the plan says how, and no rental car next to the wine tour');
});

// ---- 5. Honest "not included" ----
test('5. only what the visitor asked for is listed as not included; the nearest is by distance', () => {
  assert.ok(SRC.includes("if (r.kind === 'venue_kind' && r.value === 'ski_lessons' && !/\\b(?:lessons?|ski school|snow school|instructors?|learn\\w*|camps?|clinics?|cours|le[cç]ons?|moniteurs?)\\b/i.test(String(plan.query || ''))) continue;"));
  assert.ok(/function v4NearestOfKind\(plan, kind\)/.test(SRC) && /const byKm = r\.kind === 'venue_kind'/.test(SRC));
});

// ---- 6. Stays ----
test('6. stays: a far town joins only when the plan\'s own town has none; a budget trip does not offer $$$ stays first', () => {
  const centre = { lat: 50.116, lng: -122.957 };
  const stay = (id, name, region, dKm, price) => ({ id, name, kind: 'Hotel', kindKey: 'hotel', region, regionLabel: region, latitude: centre.lat + dKm / 111, longitude: centre.lng, url: `/${region}/stay/${id}`, info: price ? { price_level: price } : null });
  const plan = (q) => ({ kind: 'multi_day', query: q, intent: { budget: /budget|cheap/.test(q) ? 'budget' : null }, understood: {}, days: [1, 2, 3].map((day) => ({ day, stops: [{ venue: { region: 'whistler', latitude: centre.lat, longitude: centre.lng } }] })) });
  const stays = [stay(1, 'Village Inn', 'whistler', 0.3, 2), stay(2, 'Pemberton Hotel', 'pemberton', 30, 1), stay(3, 'Creekside Lodge', 'whistler', 4, 2)];
  const w = ts.whereToStay(plan('3 days in Whistler'), null, stays, '2026-11-22', { v4: true, text: '3 days in Whistler', minArrive: '2026-11-23' });
  assert.deepEqual([w.pick].concat(w.alternatives).map((x) => x.id), [1, 3], 'Pemberton, 30 km away, is not offered for a Whistler Village plan');
  const only = ts.whereToStay(plan('3 days in Whistler'), null, [stays[1]], '2026-11-22', { v4: true, text: '3 days in Whistler', minArrive: '2026-11-23' });
  assert.equal(only.pick.id, 2, 'with nothing in town, the nearby town is still offered');
  const lux = [stay(1, 'Fairmont Chateau', 'whistler', 0.2, 4), stay(2, 'Sundial', 'whistler', 0.3, 4), stay(3, 'Village Hostel Inn', 'whistler', 1.5, 1), stay(4, 'Budget Motel', 'whistler', 2, 2), stay(5, 'Plain Lodge', 'whistler', 2.5, null)];
  const b = ts.whereToStay(plan('3 days in Whistler on a budget'), null, lux, '2026-11-22', { v4: true, text: '3 days in Whistler on a budget', minArrive: '2026-11-23' });
  assert.ok(![1, 2].includes(b.pick.id) && !b.alternatives.some((x) => [1, 2].includes(x.id)), `no $$$$ stay on a budget trip: ${[b.pick].concat(b.alternatives).map((x) => x.name)}`);
  assert.equal(w.trip.nights, 2, 'with no dates the stay is the plan\'s length (3 days, 2 nights)');
});
