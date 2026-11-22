// Build My Trip planner, round 3 (fresh-eyes test 3, 2026-11-22, 6/10): "no car" in the first plan, vague and out-of-area
// requests kept on the plan screen, a closed stop replaced once dates are set, thin towns filled, family and party fit,
// and the booking sheet's small lies. PURE tests on fixtures and source (no server, no network).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tr = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const tb = require('../trip-booking.js');
const TRIP_SITE = require('../trip-site.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const SRC = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const rowOf = (p, day, s) => (p.schedule || []).find((r) => r.day === day.day && ((s.venue && r.venueId === s.venue.id) || (s.event && r.eventId === s.event.id)));
const isMeal = (s, part) => s.venue && ['restaurant', 'pub'].includes(s.venue.type) && s.daypart === part;
const grab = (re) => { const m = re.exec(SRC); assert.ok(m, `source has ${re}`); return m[0]; };

// ---- 1. No car ----
test('1. no car: every stop is near the middle of its town, and the rental car is not offered', () => {
  const v = (id, type, dLat, extra = {}) => ({ id, type, region: 'vernon', lat: dLat == null ? null : 50.2627 + dLat, lng: dLat == null ? null : -119.2752, name: `P${id}`, ...extra });
  const facts = [v(1, 'restaurant', 0), v(2, 'restaurant', 0.002), v(3, 'cafe', -0.002), v(4, 'outdoor', 0.01), v(5, 'outdoor', 0.15), v(6, 'outdoor', null), v(7, 'restaurant', null), v(8, 'indoor', 0.05)];
  const near = tp.v4NoCarFacts(facts, null).map((x) => x.id);
  assert.deepEqual(near, [1, 2, 3, 4, 7], 'a trail 16 km out, a trail with no map location and a place 5 km out are left out');
  assert.ok(tp.v4NoCarFacts(facts, { '1-morning': 5 }).some((x) => x.id === 5), 'a kept stop stays');
  assert.ok(tp.V4_NO_CAR_CORE_KM <= 3);
  // The request's words: "no car", "coming by bus".
  const re = new Function(`${grab(/const TRIP_NO_CAR_RE = .+;/)}; return TRIP_NO_CAR_RE;`)(); // eslint-disable-line no-new-func
  for (const q of ['3 days in Vernon, no car, on a budget', '3 days in Whistler, coming by bus from Vancouver', 'we don’t have a car', 'sans voiture']) assert.ok(re.test(q), q);
  for (const q of ['3 days in Vernon', 'a car show in Vernon', 'no driving after wineries']) assert.ok(!re.test(q), q);
  assert.ok(tr.extractTripRequirements({ text: '3 days in whistler coming by bus from vancouver', taxonomy: fx.TAXONOMY }).items.some((i) => i.kind === 'transport'), 'by bus is no car for the planner too');
  assert.ok(/if \(v4 && gettingHere\.enabled\(\) && !drivingIn && !noCarTrip\) gettingHere\.withTripStep\(plan, stay\);/.test(SRC), 'no "Rent a car" step');
  assert.ok(/if \(gh && noCarTrip\) \{ gh\.noCar = true; gh\.car = null; gh\.carLabel = null; \}/.test(SRC), 'no rental on the Getting here card');
  const p = fx.plan('3 days in Kelowna, good food, no car', { extra: { v4: true } });
  assert.equal(p.notes[0], 'No car: every stop is in town, a walk or a short taxi or bus ride apart.');
});

// ---- 2. Vague, impossible and out-of-area requests ----
test('2. what we do not cover and what is out of season are said up front (plan.notIncluded), with the sister site', () => {
  const body = grab(/function v4UpFront\(plan\) \{[\s\S]*?\n\}/);
  const upFront = new Function('TRIP_SITE', `${body}; return v4UpFront;`)(TRIP_SITE); // eslint-disable-line no-new-func
  const sisterPlace = TRIP_SITE.sister.places[0];
  const plan = { notes: [`${TRIP_SITE.brand} only covers ${TRIP_SITE.coverage}, so ${sisterPlace} isn’t included. Here are ideas in ${TRIP_SITE.area} instead; name a town.`, 'The ski hills usually run from December to early April, so skiing isn’t part of this July plan.', 'Times are a suggested schedule.'], notIncluded: [{ kind: 'spa', text: 'x' }] };
  upFront(plan);
  assert.deepEqual(plan.notes, ['Times are a suggested schedule.']);
  assert.equal(plan.notIncluded.length, 3);
  assert.equal(plan.notIncluded[0].reason, 'not_covered');
  assert.equal(plan.notIncluded[0].text, `We only cover ${TRIP_SITE.coverage}, so ${sisterPlace} isn’t in this plan. For ${sisterPlace}, see ${TRIP_SITE.sister.host}.`);
  assert.ok(plan.notIncluded[0].textFr.includes(TRIP_SITE.sister.host));
  assert.equal(plan.notIncluded[1].reason, 'out_of_season');
  assert.match(plan.notIncluded[1].text, /skiing isn’t part of this July plan\.$/);
  const other = { notes: [`${TRIP_SITE.brand} only covers ${TRIP_SITE.coverage}, so Toronto isn’t included. Here are ideas.`] };
  upFront(other);
  assert.equal(other.notIncluded[0].text, `We only cover ${TRIP_SITE.coverage}, so Toronto isn’t in this plan.`);
  // The page shows them above the plan, and a vague request becomes a one-day plan instead of the old list page.
  assert.ok(PAGE.includes("(p.notIncluded || []).slice(0, 3).map(function(x){ var t = (fr && x.textFr) || x.text;"));
  assert.ok(/const vague = !listAsked \? 1 : 0;/.test(SRC) && /\(want \|\| vague\) && !\(focus && listAsked\)/.test(SRC));
  assert.ok(/if \(TRIP_OUTSIDE_WORDS\.has\(w\)\) continue;/.test(SRC), '"a trip to Vancouver" is never Vancouver Pizza Kitchen');
});

test('2/4. "one day in …" is a day plan, an evening stays an outing', () => {
  const day = new Function(`${grab(/const V4_DAY_ASKED_RE = .+;/)}; return V4_DAY_ASKED_RE;`)(); // eslint-disable-line no-new-func
  const part = new Function(`${grab(/const V4_PART_OF_DAY_RE = .+;/)}; return V4_PART_OF_DAY_RE;`)(); // eslint-disable-line no-new-func
  for (const q of ['One day in Osoyoos with a spa and a nice dinner', 'One day in Squamish next Saturday, hiking and a brewery', 'a day in Kelowna', 'une journée à Vernon']) assert.ok(day.test(q) && !part.test(q), q);
  for (const q of ['dinner and a show in Kelowna tonight', 'a day trip from Kelowna', '3 days in Vernon', 'a one-day pass at Big White']) assert.ok(!day.test(q) || part.test(q), q);
  const p = fx.plan('One day in Kelowna, a hike and a winery', { extra: { v4: true, v4DayPlan: true } });
  assert.equal(p.kind, 'day_plan');
  const stops = p.days[0].stops.filter((s) => s.venue);
  assert.ok(stops.some((s) => isMeal(s, 'midday')) && stops.some((s) => isMeal(s, 'evening')), 'lunch and dinner too');
  assert.ok(stops.some((s) => s.venue.type === 'winery') && stops.some((s) => s.venue.type === 'outdoor'), 'with what was asked in it');
  assert.ok(/const v4Nights = /.test(SRC), 'dates over a night make a short outing a day-by-day plan');
});

// ---- 3. A stop closed on its dated day ----
test('3. a kept stop that is closed on its dated day gives way to an open place of the same kind; every stop has a time', () => {
  const closed = fx.add({ name: 'Weekday Only Winery', region: 'kelowna', type: 'winery', rating: 4.9, hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ['sat', 'sun'].includes(d) ? [] : [['10:00', '15:00']]])), dLat: 0.01 });
  try {
    const q = 'wine weekend in Kelowna for two on November 28';
    const p = fx.plan(q, { extra: { v4: true, pinned: { '2-morning': closed.id } } });
    const all = p.days.flatMap((d) => d.stops.filter((s) => s.venue).map((s) => ({ d, s })));
    assert.ok(!all.some((x) => x.s.venue.id === closed.id), 'not on Sunday, when it is closed');
    for (const { d, s } of all) assert.ok(Number.isFinite((rowOf(p, d, s) || {}).startMinutes), `${s.venue.name} has a time`);
    const sunday = p.days[1].stops.find((s) => s.daypart === 'morning');
    assert.ok(sunday && sunday.venue && sunday.venue.type === 'winery', 'another winery takes the slot');
    assert.ok(p.notes.some((n) => /^Weekday Only Winery is closed that day, so .+ takes its place\.$/.test(n)));
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(closed), 1); }
  assert.ok(PAGE.includes("clockLabel(r.startMinutes) + ' · ' : '') + (lang() === 'fr' ? 'départ à réserver' : 'book a departure time')"), 'a tour shows its planned time and that the departure is booked');
});

// ---- 4. Thin towns / honest matches ----
test('4. a request counts as matched only when a stop of that kind is in the plan; none listed is said with the nearest', () => {
  const body = grab(/const V4_TYPE_WORDS = [\s\S]*?\nfunction v4NotIncluded\(plan\) \{[\s\S]*?\n\}/);
  const venues = { 1: { id: 1, name: 'Day Spa', type: 'indoor', description: 'A spa with massages.' }, 2: { id: 2, name: 'Lounge', type: 'cocktail', description: 'Cocktails.' }, 9: { id: 9, name: 'Burger Co.', type: 'restaurant', description: 'Burgers by the sleigh rides.' } };
  const fn = new Function('require', 'REGION_LABELS', 'getVenue', 'venueIndoorInfo', 'venueTourInfo', `${body}; return v4NotIncluded;`)((m) => (m === './trip-requirements' ? tr : require(m)), { kelowna: 'Kelowna', 'big-white': 'Big White' }, (id) => venues[id] || null, () => ({}), () => ({})); // eslint-disable-line no-new-func
  const plan = { kind: 'multi_day', overview: { regions: [{ label: 'Kelowna' }] }, warnings: [],
    days: [{ day: 1, stops: [{ venue: { id: 1, type: 'indoor' } }, { venue: { id: 2, type: 'cocktail' } }] }],
    requirementResults: [
      { kind: 'venue_kind', value: 'spa', strength: 'must', status: 'satisfied' },
      { kind: 'type', value: 'cocktail', strength: 'must', status: 'satisfied' },
      { kind: 'venue_kind', value: 'shopping', strength: 'must', status: 'satisfied' },
    ] };
  fn(plan);
  assert.deepEqual(plan.requirementResults.map((r) => r.status), ['satisfied', 'satisfied', 'unmet'], 'no shop in the plan: not a match');
  assert.deepEqual(plan.notIncluded.map((n) => n.text), ['I couldn’t fit shopping into this plan.']);
  // "No spa matched in Osoyoos" is none listed (never "on these dates"); the nearest is a place of that kind by its own facts.
  const thin = { kind: 'day_plan', overview: { regions: [{ label: 'Osoyoos' }] }, warnings: ['No spa matched in Osoyoos, so the rest of the plan is shown.'], days: [],
    requirementResults: [{ kind: 'venue_kind', value: 'spa', strength: 'must', status: 'unmet', optionalAlternatives: [{ id: 9, name: 'Burger Co.', region: 'big-white', reasonCode: 'different_region' }, { id: 1, name: 'Day Spa', region: 'kelowna', url: '/x', reasonCode: 'different_region' }] }] };
  fn(thin);
  assert.equal(thin.notIncluded[0].reason, 'none_listed');
  assert.equal(thin.notIncluded[0].text, 'There’s no spa listed in Osoyoos, so this plan has none. The nearest is Day Spa in Kelowna.');
});

test('4. a full day with an empty afternoon gets one stop there', () => {
  const p = fx.plan('One day in Kelowna with a nice dinner', { extra: { v4: true, v4DayPlan: true } });
  const stops = p.days[0].stops.filter((s) => s.venue);
  assert.ok(stops.some((s) => s.daypart === 'afternoon'), stops.map((s) => `${s.daypart}:${s.venue.name}`).join(' | '));
  const dinner = stops.find((s) => isMeal(s, 'evening'));
  assert.ok(dinner && dinner.venue.type === 'restaurant' && ![fx.SPORTS_BAR.id, fx.PUB.id].includes(dinner.venue.id), 'a nice dinner is not a pub');
});

// ---- 5. Family and party fit ----
test('5. the last day is light, meal windows hold without dates, and dinner with kids starts by 6:30', () => {
  const p = fx.plan('3 days in Kelowna, wineries and good food', { extra: { v4: true } });
  assert.equal(p.days.length, 3);
  const last = p.days[2].stops.filter((s) => s.venue || s.event);
  assert.ok(last.length >= 1 && last.length <= 3 && last.every((s) => ['early', 'morning', 'midday', 'afternoon'].includes(s.daypart)), last.map((s) => s.daypart).join(','));
  for (const day of p.days) for (const s of day.stops) {
    if (!s.venue) continue;
    const r = rowOf(p, day, s);
    assert.ok(r && Number.isFinite(r.startMinutes), `${s.venue.name} has a time`);
    if (isMeal(s, 'midday')) assert.ok(r.startMinutes >= 690 && r.startMinutes <= 810, `undated lunch at ${r.startMinutes}`);
    if (isMeal(s, 'evening')) assert.ok(r.startMinutes >= 1020 && r.startMinutes <= 1200, `undated dinner at ${r.startMinutes}`);
  }
  const fam = fx.plan('3 days in Kelowna with kids 7 and 10 on December 11', { extra: { v4: true } });
  for (const day of fam.days) for (const s of day.stops) if (isMeal(s, 'evening')) assert.ok(rowOf(fam, day, s).startMinutes <= 1110, `kids' dinner at ${rowOf(fam, day, s).startMinutes}`);
});

test('5. adult venues are never a stop with kids; a drink place of another kind is not a filler; the light-up is not missed', () => {
  for (const n of ['train wreck comedy club', 'the blue lounge', 'liquid nightclub', 'lake city casino']) assert.ok(tp.ADULT_VENUE_RE.test(n), n);
  for (const n of ['kelowna art gallery', 'okanagan science centre', 'lincoln lanes']) assert.ok(!tp.ADULT_VENUE_RE.test(n), n);
  const club = fx.add({ name: 'Dakoda’s Comedy Lounge', region: 'kelowna', type: 'indoor', rating: 4.9, desc: 'Stand-up comedy nights.', hours: fx.open('11:00', '23:00') });
  try {
    const p = fx.plan('3 days in Kelowna with kids 6 and 9', { extra: { v4: true } });
    assert.ok(!p.days.some((d) => d.stops.some((s) => s.venue && s.venue.id === club.id)));
    const pins = {}; for (const d of p.days) for (const s of d.stops) if (s.venue) pins[`${d.day}-${s.daypart}`] = s.venue.id;
    const slot = '1-afternoon'; delete pins[slot];
    const sw = fx.plan('3 days in Kelowna with kids 6 and 9', { extra: { v4: true, pinned: pins, swap: { key: slot, type: 'indoor', want: 'indoor' } } });
    assert.ok(!sw.days.some((d) => d.stops.some((s) => s.venue && s.venue.id === club.id)), 'not in a Swap either');
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(club), 1); }
  const ctx = { v4: true, kids: false, types: new Set(['cocktail', 'indoor']), queryText: 'spa cocktails shopping' };
  assert.equal(tp.v4FillerSkip({ type: 'brewery', name: 'Hop Co.', textName: 'hop co' }, ctx), true, 'cocktails asked: no brewery filler');
  assert.equal(tp.v4FillerSkip({ type: 'cocktail', name: 'Bar', textName: 'bar' }, ctx), false);
  assert.equal(tp.eventKeyMoment({ description: 'A vendor market through the afternoon, then the park’s lights are switched on at 5:30 pm.' }), 1050);
  assert.equal(tp.eventKeyMoment({ description: 'The tree lighting happens around 4:15 pm.' }), 975);
  assert.equal(tp.eventKeyMoment({ description: 'A market from 10 am to 4 pm.' }), null);
});

// ---- 6. Booking sheet ----
test('6. the estimate counts the kids, the ages note goes when the link has them, no adult product or waiver as a booking', () => {
  const plan = { kind: 'multi_day', days: [{ day: 1, stops: [] }] };
  assert.equal(tb.tripEstimate(plan, null, { kids: 2 }).people, 4, 'two kids named, adults not: 2 adults + 2 kids');
  assert.equal(tb.tripEstimate(plan, null, { adults: 2, kids: 2 }).people, 4);
  assert.equal(tb.tripEstimate(plan, null, {}).people, 2);
  const v3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes('if (prefilled && t.kids && !(t.kidAges && t.kidAges.length === t.kids)) bits.push('));
  assert.ok(/const adultProduct = !!\(vm && \/\\badults\?\\b\/i\.test/.test(SRC) && /if \(!url && \(adultProduct \|\| !viator\.venueBooking\(id\)\)\) continue;/.test(SRC));
  assert.ok(/\\b\(\?:waivers\?\|d\[ée\]charge\)\\b/.test(SRC), 'a waiver link is not a booking step');
  assert.equal(typeof require('../viator.js').venueMatch, 'function');
  // Events carry their own photo; the headline has no trailing full stop; each town is named once.
  assert.ok(/function tripEventPhoto\(e\)/.test(SRC) && PAGE.includes('v4Thumb(e.photo ? { photo: e.photo } : null)'));
  assert.ok(PAGE.includes("String(p.headline || p.summary || vt('yourPlan')).replace(/\\.$/, '')"));
  assert.ok(PAGE.includes("split(/, | and | et /)"));
});

test('6. the headline is made from the stops the plan ends up with', () => {
  const p = fx.plan('3 days in Kelowna, wineries and good food', { extra: { v4: true } });
  assert.match(p.headline, /Kelowna/);
  for (const d of p.days) d.stops = d.stops.filter((s) => !s.venue || s.venue.type !== 'winery');
  tp.v4DayTownLabels(p, { v4: true, intent: p.intent || {}, labels: fx.LABELS, facts: fx.FACTS, text: '3 days in Kelowna, wineries and good food' });
  assert.ok(!/wine/i.test(p.headline), `no wine in the headline once no winery is left: ${p.headline}`);
});

test('5. an easy or beginner hike never gets a trail whose own words say hard, steep or a river crossing', () => {
  for (const q of ['an easy hike in squamish', 'hiking for beginners', 'easy trails with the kids', 'a gentle walk', 'randonnee facile']) assert.ok(tp.EASY_HIKE_ASK_RE.test(q), q);
  for (const q of ['hiking and a brewery', 'a hard hike', 'easy dinner then a hike tomorrow. hiking']) assert.ok(!tp.EASY_HIKE_ASK_RE.test(q) || /easy/.test(q), q);
  assert.ok(tp.HARD_TRAIL_RE.test('hard 7 km round trip gaining nearly 900 m reaching the trailhead means paddling across the squamish river'));
  assert.ok(tp.HARD_TRAIL_RE.test('steep long hike starting across the highway'));
  assert.ok(!tp.HARD_TRAIL_RE.test('a flat 2 km loop around the lake with benches'));
  const hard = fx.add({ name: 'Echo Ridge Trail', region: 'kelowna', type: 'outdoor', rating: 5, activities: ['hiking', 'viewpoints'], desc: 'Hard 7 km round trip gaining nearly 900 m, with a river crossing.', dLat: 0.01 });
  try {
    const easy = fx.plan('2 days in Kelowna, an easy hike and good food', { extra: { v4: true } });
    assert.ok(!easy.days.some((d) => d.stops.some((s) => s.venue && s.venue.id === hard.id)), 'not on an easy-hike trip');
    assert.ok(easy.days.some((d) => d.stops.some((s) => s.venue && s.venue.type === 'outdoor')), 'another trail is planned');
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(hard), 1); }
});
