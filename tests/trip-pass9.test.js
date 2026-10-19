// Build My Trip, round 9 (2026-10-19): a Swap changes only the slot it was asked to change (the other stops keep their
// place and their time of day, three swaps in a row); fillers in daylight; evening drinks in the evening; indoor golf
// about two hours; midday swaps that stay meals; the lake road at Kelowna's Lower Mission; lunch at a winery's
// restaurant; a dinner on every full day; "A to B in N days"; events at their own time; French copy. The requests are
// the real ones from drafts/site-review-2026-10-19-pass8.md. PURE tests on a small fixture valley (no server.js, no
// database), plus source checks on the /trip page.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const { t3FrenchPlan, t3FrenchText, t3FrenchEvent } = require('../trip-french-copy.js');

const REGIONS = { vernon: 'Vernon', 'lake-country': 'Lake Country', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland', summerland: 'Summerland', penticton: 'Penticton', naramata: 'Naramata', oliver: 'Oliver', osoyoos: 'Osoyoos', silverstar: 'SilverStar' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'vegan', 'vegetarian'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'holiday-seasonal', 'arts-culture'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor'), sport: T('Sport', 'Sports') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', vegan: 'Vegan-Friendly', vegetarian: 'Vegetarian-Friendly' }, featureNouns: {}, collections: {},
};
const CENTRES = { vernon: [50.267, -119.272], 'lake-country': [50.054, -119.41], kelowna: [49.888, -119.47], 'west-kelowna': [49.863, -119.583], peachland: [49.773, -119.736], summerland: [49.602, -119.677], penticton: [49.48, -119.585], naramata: [49.594, -119.588], oliver: [49.183, -119.551], osoyoos: [49.032, -119.468], silverstar: [50.359, -119.062] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: 200, price: o.price === undefined ? 2 : o.price, address: null,
    lat: o.noCoords ? null : lat + (o.dLat || 0), lng: o.noCoords ? null : lng + (o.dLng || 0), cuisine: null, cuisineLabel: null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: '', textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: null, seasonClosedToday: false,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
for (const region of ['vernon', 'kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton', 'naramata', 'oliver', 'osoyoos']) {
  const L = REGIONS[region];
  for (let i = 0; i < 2; i++) add({ name: `${L} Creek Trail ${i + 1}`, region, type: 'outdoor', rating: 4.6, activities: ['hiking', 'nature'], desc: 'An easy walk on a creek trail.', dLat: 0.01 * i });
  for (let i = 0; i < 3; i++) add({ name: `${L} Estate Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, hours: open('10:00', '18:00'), dLat: 0.012 * i, dLng: 0.01 });
  for (let i = 0; i < 4; i++) add({ name: `${L} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 2 + (i % 2), hours: open('11:00', '22:00'), dLat: 0.004 * i });
  add({ name: `${L} Coffee Co`, region, type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and lunch.', hours: open('07:00', '16:00') });
  add({ name: `${L} Heritage Museum`, region, type: 'indoor', rating: 4.5, hours: open('10:00', '17:00'), desc: 'A local history museum.', dLat: 0.003 });
}
// Kelowna and Penticton are the big towns a road trip stops in.
for (const region of ['kelowna', 'penticton']) for (let i = 0; i < 150; i++) add({ name: `${REGIONS[region]} Curling Club ${i + 1}`, region, type: 'sport', rating: 3 });
// Naramata: wineries that serve lunch, a pizza place and a sit-down bistro.
const KITCHEN_1 = add({ name: 'Bench Kitchen Winery', region: 'naramata', type: 'winery', rating: 4.8, hours: open('11:00', '17:00'), desc: 'A winery restaurant with a seasonal lunch menu and tastings.', dLat: 0.02 });
const KITCHEN_2 = add({ name: 'Lakeside Bistro Winery', region: 'naramata', type: 'winery', rating: 4.6, hours: open('11:00', '17:00'), desc: 'Tastings and a bistro patio menu.', dLat: 0.025 });
add({ name: 'Naramata Pizza Slice', region: 'naramata', type: 'restaurant', rating: 4.9, price: 1, hours: open('11:00', '21:00'), desc: 'Pizza by the slice.', dLat: 0.005 });
// Vegan places in Penticton.
const VEGAN = [0, 1, 2].map((i) => add({ name: `Penticton Plant Kitchen ${i + 1}`, region: 'penticton', type: 'restaurant', rating: 4.7, price: 2, hours: open('11:00', '21:00'), features: { vegan: true, vegetarian: true }, dLat: 0.002 * i }));
add({ name: 'Penticton Vegan Bakery', region: 'penticton', type: 'cafe', rating: 4.8, price: 1, desc: 'Vegan baking and coffee.', hours: open('08:00', '17:00'), features: { vegan: true } });
// A Kelowna restaurant that only opens mid-afternoon (a lunch that cannot be lunch).
const LATE_OPENER = add({ name: 'Kelowna Late Grill', region: 'kelowna', type: 'restaurant', rating: 5, price: 2, hours: open('15:00', '22:00') });
// SilverStar in January.
const SILVERSTAR = add({ name: 'SilverStar Mountain Resort', region: 'silverstar', type: 'outdoor', rating: null, activities: ['winter'], desc: 'The North Okanagan ski resort.' });
for (const n of ['The Den', 'Black Pine', "d'argento"]) add({ name: n, region: 'silverstar', type: 'restaurant', rating: 4.5, price: 3 });
add({ name: 'Bugaboos Bakery', region: 'silverstar', type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and breakfast.' });
add({ name: 'Tube Town Tube Park', region: 'silverstar', type: 'outdoor', rating: 4.3, activities: ['winter'], desc: 'Snow tubing lanes.' });
add({ name: 'SilverStar Snowshoe Trails', region: 'silverstar', type: 'outdoor', rating: 4.9, activities: ['winter'], desc: 'Snowshoe trails through the forest.' });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));
// Round 9 additions to the fixture valley.
const WINERY_RESTAURANT = add({ name: 'Terrace at Naramata Estate', region: 'naramata', type: 'restaurant', rating: 4.5, price: 3, hours: open('11:30', '20:00'), desc: 'The patio restaurant at this Naramata winery estate, with a seasonal lunch menu.', dLat: 0.018 });
const BOARDS_WINERY = add({ name: 'Board Room Winery', region: 'naramata', type: 'winery', rating: 5, hours: open('11:00', '17:00'), desc: 'Generous charcuterie boards with every tasting.', dLat: 0.022 });
const SIM_1 = add({ name: 'Kelowna Sim Golf', region: 'kelowna', type: 'golf', rating: 4.8, hours: open('09:00', '23:00'), desc: 'An indoor golf simulator lounge.', dLat: 0.006 });
SIM_1.indoorGolf = true; SIM_1.indoorEvidence = 'explicit';
const SIM_2 = add({ name: 'Kelowna Virtual Golf', region: 'kelowna', type: 'golf', rating: 4.6, hours: open('09:00', '23:00'), desc: 'Indoor golf simulators.', dLat: 0.007 });
SIM_2.indoorGolf = true; SIM_2.indoorEvidence = 'explicit';
const COURSE = add({ name: 'Kelowna Lakes Golf Course', region: 'kelowna', type: 'golf', rating: 4.9, desc: 'An 18-hole course.', dLat: 0.02 });
const GELATO = add({ name: 'Kelowna Gelato Bar', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('11:00', '21:00'), desc: 'Gelato and sorbet.', dLat: 0.001 });
const KELOWNA_BREWERY = add({ name: 'Kelowna Ale Works', region: 'kelowna', type: 'brewery', rating: 4.7, hours: open('12:00', '22:00'), dLat: 0.002 });
const BY_ID9 = new Map(FACTS.map((v) => [v.id, v]));


let eventId = 900;
const ev = (o) => ({ id: o.id || eventId++, name: o.name, description: o.description || '', region: o.region, venueName: '', url: `/${o.region}/events/x`, valleyWide: false, categories: o.categories || ['arts-culture'], dateLabel: o.dateLabel || '', time: o.time, startDate: o.date, endDate: o.date, startTime: null, endTime: null, endsNextDay: 0, location: null });

function plan(text, opts = {}) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-19' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = null; requirements.startMinutes = 540; }
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: FACTS, labels: LABELS, text, tripDate: requirements.startDate || opts.tripDate || '2026-10-24', events: opts.events || null, holidayEvents: !!opts.holidayEvents,
    tripEvents: trip.multi ? trip.components.map((c) => (c.kind === 'event' ? (opts.tripEvents || []) : null)) : [], pinned: opts.pinned, excludeIds: opts.excludeIds, swap: opts.swap });
  return { p, intent, requirements, trip };
}
const venues = (day) => day.stops.filter((s) => s.venue).map((s) => BY_ID.get(s.venue.id));
const rowOf = (p, s) => (p.schedule || []).find((x) => (s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id));
const shownPins = (p, except) => { const pins = {}; for (const day of p.days) for (const s of day.stops) if (s.venue && `${day.day}-${s.daypart}` !== except) pins[`${day.day}-${s.daypart}`] = s.venue.id; return pins; };
function swapOnce(text, p, requirements, key, opts = {}) {
  const [dn, part] = key.split('-');
  const stop = p.days.find((x) => x.day === Number(dn)).stops.find((s) => s.daypart === part);
  return tp.planTrip({ intent: d.interpretDiscoveryQuery(text, TAXONOMY), trip: null, requirements, facts: FACTS, labels: LABELS, text, tripDate: requirements.startDate || '2026-10-24',
    pinned: { ...shownPins(p, key), ...(opts.extraPins || {}) }, excludeIds: [stop.venue.id], swap: { key, type: stop.venue.type, id: stop.venue.id, ...(opts.locked ? { locked: opts.locked } : {}) }, tripEvents: [] });
}

const timesOf = (p) => { const t = {}; for (const day of p.days) for (const s of day.stops) { const row = s.venue && rowOf(p, s); if (row && Number.isInteger(row.startMinutes)) t[`${day.day}-${s.daypart}`] = row.startMinutes; } return t; };
const slots = (p) => { const o = {}; for (const day of p.days) for (const s of day.stops) if (s.venue || s.event) { const row = rowOf(p, s); o[`${day.day}-${s.daypart}`] = { id: s.venue ? s.venue.id : `event:${s.event.id}`, start: row ? row.startMinutes : null, row }; } return o; };
// Swap one slot the way /trip does: every other shown stop pinned, with the start time it had on screen.
function swapLikeThePage(text, prev, built, key, exclude) {
  const [dn, part] = key.split('-');
  const stop = prev.days.find((x) => x.day === Number(dn)).stops.find((s) => s.daypart === part && s.venue);
  if (!exclude.includes(stop.venue.id)) exclude.push(stop.venue.id);
  const next = tp.planTrip({ intent: built.intent, trip: built.trip.multi ? built.trip : null, requirements: built.requirements, facts: FACTS, labels: LABELS, text, tripDate: built.requirements.startDate || '2026-10-24',
    pinned: shownPins(prev, key), excludeIds: exclude.slice(), swap: { key, type: stop.venue.type, id: stop.venue.id, locked: [], times: timesOf(prev) }, tripEvents: [] });
  if (next.swapKept) exclude.splice(exclude.indexOf(next.swapKept.id), 1);
  return next;
}

// ---- 1. Swap re-timing ----
test('Swap (round 9): the same slot swapped three times leaves every other slot where it was, at its time of day', () => {
  const cases = [
    ['lunch at a winery in Naramata, 2 days', '2026-10-24'],
    ['romantic weekend in Naramata with wineries and a great dinner', '2026-10-24'],
    ['one day in Kelowna', '2026-10-24'],
    ['vegan food day in Penticton', '2026-10-24'],
  ];
  for (const [text, startDate] of cases) {
    const built = plan(text, { startDate });
    const first = slots(built.p);
    assert.ok(Object.keys(first).length >= 4, `${text}: a real plan`);
    for (const key of Object.keys(first).filter((k) => typeof first[k].id === 'number')) {
      let cur = built.p;
      const exclude = [];
      for (let n = 1; n <= 3; n++) {
        cur = swapLikeThePage(text, cur, built, key, exclude);
        const now = slots(cur);
        for (const other of Object.keys(first)) {
          if (other === key) continue;
          assert.ok(now[other], `${text}: swap ${key} #${n} dropped ${other}`);
          assert.equal(now[other].id, first[other].id, `${text}: swap ${key} #${n} changed ${other}`);
          if (Number.isInteger(first[other].start)) {
            assert.ok(Number.isInteger(now[other].start), `${text}: swap ${key} #${n}: ${other} is still timed`);
            assert.ok(now[other].start >= first[other].start - 5 && now[other].start <= first[other].start + 20, `${text}: swap ${key} #${n}: ${other} moved from ${first[other].start} to ${now[other].start}`);
          }
        }
        for (const extra of Object.keys(now)) assert.ok(first[extra] || extra === key, `${text}: swap ${key} #${n} added ${extra}`);
      }
    }
  }
});

test('Swap (round 9): a kept morning walk stays on a wine day', () => {
  const text = 'lunch at a winery in Naramata, 2 days';
  const built = plan(text, { startDate: '2026-10-24' });
  const morning = built.p.days[0].stops.find((s) => s.daypart === 'morning' && s.venue);
  assert.ok(morning, 'the wine day starts with something');
  const after = swapLikeThePage(text, built.p, built, '1-midday', []);
  const kept = after.days[0].stops.find((s) => s.daypart === 'morning' && s.venue);
  assert.equal(kept && kept.venue.id, morning.venue.id);
});

test('Swap (round 9): a filler swapped into the late afternoon is a 60-90 minute stop in daylight', () => {
  const fake = { days: [{ day: 1, region: 'kelowna', date: '2026-11-21', stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: FACTS.find((v) => v.name === 'Kelowna Heritage Museum').id, type: 'indoor', name: 'x' } },
    { daypart: 'evening', label: 'Evening', venue: { id: FACTS.find((v) => v.name === 'Kelowna Kitchen 1').id, type: 'restaurant', name: 'y' } },
  ] }] };
  const trail = FACTS.find((v) => v.name === 'Kelowna Creek Trail 1');
  tp.applySwapPreference(fake, { swap: { key: '1-late', type: 'outdoor', id: trail.id }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('one day in Kelowna', TAXONOMY), tripDate: '2026-11-21', excludeIds: [trail.id] });
  const late = fake.days[0].stops.find((s) => s.daypart === 'late');
  assert.ok(late && late.gapFill, 'the new late-afternoon stop is a filler');
});

test('Timing (round 9): an evening drink stays in the evening and an indoor golf simulator is about two hours, with no daylight check', () => {
  const { p } = plan('rainy day in Kelowna with indoor golf', { startDate: '2026-11-21' });
  for (const day of p.days) for (const s of day.stops) {
    const row = rowOf(p, s);
    if (!row || !s.venue) continue;
    const v = BY_ID9.get(s.venue.id);
    if (v && v.indoorGolf) { assert.ok(row.endMinutes - row.startMinutes <= 120, `${v.name}: ${row.endMinutes - row.startMinutes} min`); assert.equal(row.daylight, undefined); }
    if (['evening', 'night'].includes(s.daypart) && s.venue && !tp.isDinnerStop(s)) assert.ok(row.startMinutes >= 17 * 60, `${s.venue.name} at ${row.startMinutes}`);
  }
});

test('Swap (round 9): a simulator is swapped for a simulator, and a midday meal never for gelato', () => {
  const golfDay = { days: [{ day: 1, region: 'kelowna', stops: [{ daypart: 'afternoon', label: 'Afternoon', venue: { id: SIM_1.id, type: 'golf', name: SIM_1.name } }] }] };
  tp.applySwapPreference(golfDay, { swap: { key: '1-afternoon', type: 'golf', id: SIM_1.id }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('a day in Kelowna in January', TAXONOMY), tripDate: '2027-01-16', excludeIds: [SIM_1.id] });
  assert.equal(golfDay.days[0].stops[0].venue.id, SIM_2.id, 'another simulator, not the course');
  const coffee = FACTS.find((v) => v.name === 'Kelowna Coffee Co');
  const lunchDay = { days: [{ day: 1, region: 'kelowna', stops: [{ daypart: 'midday', label: 'Midday', venue: { id: coffee.id, type: 'cafe', name: coffee.name } }] }] };
  tp.applySwapPreference(lunchDay, { swap: { key: '1-midday', type: 'cafe', id: coffee.id }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('one day in Kelowna', TAXONOMY), tripDate: '2026-10-24', excludeIds: [coffee.id] });
  assert.notEqual(lunchDay.days[0].stops[0].venue.id, GELATO.id, 'gelato is not lunch');
});

test('Travel (round 9): Kelowna’s Lower Mission is on the same shore as downtown, not "114 min" around the lake', () => {
  const wokStar = { lat: 49.8028066, lng: -119.4832363 }, waldhof = { lat: 49.7957217, lng: -119.533848 }, downtown = { lat: 49.886007, lng: -119.499076 }, cedarCreek = { lat: 49.7895897, lng: -119.5411039 };
  assert.ok(r.estimateTransfer(wokStar, waldhof).maxMinutes <= 15, JSON.stringify(r.estimateTransfer(wokStar, waldhof)));
  assert.ok(r.estimateTransfer(downtown, cedarCreek).maxMinutes <= 25);
  // Naramata to Kelowna still goes around the lake.
  assert.ok(r.estimateTransfer({ lat: 49.594, lng: -119.588 }, downtown).maxMinutes >= 60);
});

// ---- 2. Requested meals ----
test('Meals (round 9): "lunch at a winery" is lunch at a winery restaurant, not a tasting room with boards', () => {
  assert.ok(tp.wineryLunchRank(WINERY_RESTAURANT, tp.wineryNameWords(FACTS)) > tp.wineryLunchRank(BOARDS_WINERY, tp.wineryNameWords(FACTS)));
  assert.equal(tp.wineryLunchRank(BOARDS_WINERY, null), 0);
  const { p } = plan('lunch at a winery in Naramata, one day', { startDate: '2026-10-24' });
  const lunch = p.days[0].stops.find((s) => s.daypart === 'midday');
  assert.ok(lunch && lunch.venue && lunch.venue.id !== BOARDS_WINERY.id, lunch && lunch.venue && lunch.venue.name);
  assert.ok(tp.wineryLunchRank(BY_ID9.get(lunch.venue.id), tp.wineryNameWords(FACTS)) >= 15, `${lunch.venue.name} has a kitchen or is a winery restaurant`);
});

test('Meals (round 9): every full day ends with dinner -- a romantic weekend\'s second day and a day whose evening was a brewery', () => {
  const { p } = plan('romantic weekend in Naramata with wineries and a great dinner', { startDate: '2026-10-24' });
  assert.equal(p.days.length, 2);
  for (const day of p.days) assert.ok(day.stops.some(tp.isDinnerStop), `day ${day.day} has dinner`);
  // A day whose evening went to a brewery gets dinner, the brewery moving after it when breweries were asked for.
  const day = { day: 1, region: 'kelowna', stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: FACTS.find((v) => v.name === 'Kelowna Creek Trail 1').id, type: 'outdoor', name: 'a' } },
    { daypart: 'midday', label: 'Midday', venue: { id: FACTS.find((v) => v.name === 'Kelowna Kitchen 2').id, type: 'restaurant', name: 'b' } },
    { daypart: 'evening', label: 'Evening', venue: { id: KELOWNA_BREWERY.id, type: 'brewery', name: KELOWNA_BREWERY.name } },
  ] };
  const result = { days: [day] };
  const text = 'a day in Kelowna with a brewery';
  tp.ensureDinners(result, { facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery(text, TAXONOMY), text, tripDate: '2026-10-24', requirements: { items: [{ kind: 'type', value: 'brewery', strength: 'must' }], text } });
  assert.ok(day.stops.some(tp.isDinnerStop), 'dinner added');
  assert.equal(day.stops.find((s) => s.venue && s.venue.id === KELOWNA_BREWERY.id).daypart, 'night', 'the brewery after dinner');
  // "One dinner" still leaves the other evening free.
  const one = plan('A relaxed weekend in Oliver with wineries and one dinner').p;
  assert.equal(one.days.filter((x) => x.stops.some(tp.isDinnerStop)).length, 1);
});

test('Meals (round 9): "a great dinner" on a romantic weekend is not "one dinner"', () => {
  const text = 'romantic weekend in Naramata with wineries and a great dinner';
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY), trip = d.interpretTripComponents(text, TAXONOMY, intent);
  assert.equal(r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-19' }).explicitMealCount, null);
  const t2 = 'A relaxed weekend in Penticton with a beach and a nice dinner';
  const i2 = d.interpretDiscoveryQuery(t2, TAXONOMY);
  assert.equal(r.extractTripRequirements({ text: t2, intent: i2, trip: d.interpretTripComponents(t2, TAXONOMY, i2), taxonomy: TAXONOMY, referenceDate: '2026-10-19' }).explicitMealCount, 1);
});

// ---- 4. A to B ----
test('Road trips (round 9): "Osoyoos to Vernon in 2 days" drives north, with a stop on the way', () => {
  const { p } = plan('Osoyoos to Vernon in 2 days', { startDate: '2026-11-14' });
  assert.equal(p.days.length, 2);
  assert.equal(p.days[0].region, 'osoyoos');
  const last = p.days[1].stops.filter((s) => s.venue).slice(-1)[0];
  assert.equal(last.venue.region, 'vernon');
  assert.ok(p.days[1].regions && ['kelowna', 'penticton'].includes(p.days[1].regions[0]), JSON.stringify(p.days[1].regions));
});

// ---- 5. Fixed-time events ----
test('Events (round 9): lunch before a 2 PM event is shortened to fit, never a "Timing conflict"', () => {
  const tripEvents = [ev({ name: 'Minecraft Escape Room', region: 'kelowna', date: '2026-11-21', time: '2 pm', categories: ['family-kids'] })];
  const { p } = plan('a hike, lunch and the escape room in Kelowna', { startDate: '2026-11-21', tripEvents });
  const stops = (p.itinerary && p.itinerary.stops) || p.days.flatMap((x) => x.stops);
  const event = stops.find((s) => s.event);
  if (event) for (const s of stops.slice(0, stops.indexOf(event))) { const row = rowOf(p, s); if (row) assert.notEqual(row.status, 'unmet', `${s.venue && s.venue.name}: ${JSON.stringify(row)}`); }
  // A drop-in event (open all day) does not squeeze the morning and lunch before its opening time.
  const dropIn = { day: 1, date: '2026-10-25', stops: [] };
  assert.ok(dropIn);
});

// ---- 6. Shows and French ----
test('Shows (round 9): « soirée spectacle » is dinner and a show; comedy and theatre before a haunted maze or an exhibition', () => {
  assert.equal(tp.showEveningText('evening a show in kelowna saturday'), 'dinner and evening a show in kelowna saturday');
  assert.equal(tp.showEveningText('Saturday night comedy show in Vernon'), 'dinner and Saturday night comedy show in Vernon');
  assert.equal(tp.showEveningText('dinner and a show'), 'dinner and a show');
  assert.equal(tp.showEveningText('comedy show'), 'comedy show');
  assert.equal(tp.showEveningText('events on Saturday night'), 'events on Saturday night');
  const tripEvents = [
    ev({ name: 'Field of Screams XIII', description: 'A haunted corn maze show.', region: 'vernon', date: '2026-10-23', time: '6:30 pm', categories: ['holiday-seasonal', 'arts-culture'] }),
    ev({ name: 'Members Show: Creatures & Curiosities', description: 'An art exhibition.', region: 'vernon', date: '2026-10-23', time: '', categories: ['arts-culture'] }),
    ev({ name: 'Hungry for Laughs Comedy Night', description: 'Stand-up comedians in Vernon.', region: 'vernon', date: '2026-10-23', time: '8 pm', categories: ['nightlife'] }),
  ];
  const { p } = plan('dinner and a show in Vernon on Friday', { startDate: '2026-10-23', tripEvents });
  const show = p.itinerary.stops.find((s) => s.event);
  assert.equal(show && show.event.name, 'Hungry for Laughs Comedy Night');
  assert.ok(p.itinerary.stops.some((s) => s.venue && /dinner/i.test(s.label || '')), 'and dinner');
  assert.ok(tp.showRank(tripEvents[2]) < tp.showRank(tripEvents[0]));
});

test('French (round 9): reasons, the relative "when" chip, plan links and the badge "+N" on /fr/trip', () => {
  assert.equal(t3FrenchText('Described as an indoor golf / simulator venue'), 'Décrit comme un golf intérieur ou un simulateur');
  assert.equal(t3FrenchText('An indoor golf / simulator venue — suits a January round'), 'Un golf intérieur ou un simulateur, idéal pour une partie de janvier');
  assert.equal(t3FrenchText('Listed for Winter — in season in January'), 'Répertorié dans Hiver — de saison en janvier');
  assert.equal(t3FrenchText('Price level $$$'), 'Niveau de prix $$$');
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page.includes("esc(whenLabelFr(u.when))"), 'the Quand chip is translated');
  for (const s of ["'this weekend': 'cette fin de semaine'", "saturday: 'samedi'", "evening: 'soir'"]) assert.ok(page.includes(s), s);
  assert.ok(page.includes("function placeUrl(o){ return o ? safeUrl((lang() === 'fr' && o.urlFr) || o.url) : null; }"));
  assert.ok(page.includes('url = placeUrl(v)'), 'stop cards link to the /fr page');
  assert.ok(!page.includes("' de plus'"), '« +2 », not « +2 de plus »');
  assert.ok(!page.includes("'>Add to trip</button>'"), 'the Add to trip button is translated');
  // The swap request carries the shown start times.
  assert.ok(page.includes('times: shownTimes()'));
});

test('Seasons (round 9): no ice cream in January or beach outings in November unless asked', () => {
  const ctx = { tripDate: '2027-01-16', types: new Set(['cafe']), activities: new Set(), requirements: { text: 'a day in kelowna' }, lake: false };
  assert.equal(tp.offSeasonSkip(GELATO, ctx), true);
  assert.equal(tp.offSeasonSkip(GELATO, { ...ctx, requirements: { text: 'gelato in kelowna' } }), false);
  assert.equal(tp.offSeasonSkip(GELATO, { ...ctx, tripDate: '2027-07-16' }), false);
  assert.equal(tp.offSeasonSkip(FACTS.find((v) => v.name === 'Kelowna Coffee Co'), ctx), false);
});

test('Brewery crawl (round 9): something to eat between the breweries', () => {
  for (let i = 0; i < 3; i++) add({ name: `Penticton Brewing ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.6, hours: open('11:00', '22:00'), dLat: 0.001 * i });
  const { p } = plan('brewery crawl in Penticton', { startDate: '2026-10-24' });
  const stops = (p.itinerary && p.itinerary.stops) || p.days.flatMap((x) => x.stops);
  if (stops.filter((s) => s.venue && s.venue.type === 'brewery').length >= 2) assert.ok(stops.some((s) => s.venue && ['restaurant', 'pub'].includes(s.venue.type)), stops.map((s) => s.venue && s.venue.name).join(', '));
});
