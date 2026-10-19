// Build My Trip, round 8 (2026-10-19): Swap that never gives a false "locked stop" error, never repeats a stop and keeps
// the slot's purpose; "X day" and per-town, per-time-of-day one-day plans; lunch and free time in short plans; ski days
// from 9 to 3:30; 60-90 minute fillers before dusk; a fitting alternative on a timing conflict; road trips that stop on
// the way; Halloween and comedy events; and the French copy. The requests are the real ones from
// drafts/site-review-2026-10-19-pass7.md. PURE tests on a small fixture valley (no server.js, no database), plus a few
// source checks on the /trip page.
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

// ---- 1. Swap ----
test('Swap (round 8): only the stops the visitor locked must stay; the others give way instead of a 409', () => {
  assert.deepEqual([...tp.swapSoftPins({ swap: { key: '1-midday', locked: ['1-evening'] }, pinned: { '1-morning': 1, '1-evening': 2 } })], ['1-morning']);
  assert.equal(tp.swapSoftPins({ pinned: { '1-morning': 1 } }).size, 0, 'no swap: every pin is a lock');
  const text = 'Naramata wine day';
  const { p, requirements } = plan(text, { startDate: '2026-10-24' });
  // A shown stop that cannot be kept where it was (a tasting room in the night slot).
  const winery = FACTS.find((v) => v.name === 'Naramata Estate Winery 3');
  assert.doesNotThrow(() => swapOnce(text, p, requirements, '1-afternoon', { extraPins: { '1-night': winery.id } }));
  assert.throws(() => swapOnce(text, p, requirements, '1-afternoon', { extraPins: { '1-night': winery.id }, locked: ['1-night'] }), (e) => e.code === 'TRIP_CONFLICT' && /Naramata Estate Winery 3 on day 1/.test(e.message));
});

test('Swap (round 8): never offers a place already in the plan, a kept late-afternoon stop included', () => {
  const k = (n) => FACTS.find((v) => v.name === `Naramata Estate Winery ${n}`);
  const fake = { theme: 'wine', days: [{ day: 1, region: 'naramata', stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: k(1).id, type: 'winery', name: k(1).name } },
    { daypart: 'afternoon', label: 'Afternoon', venue: { id: k(1).id, type: 'winery', name: k(1).name } },
  ] }] };
  tp.applySwapPreference(fake, { swap: { key: '1-afternoon', type: 'winery', id: k(1).id }, pinned: { '1-morning': k(1).id, '1-late': k(2).id }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('Naramata wineries', TAXONOMY), tripDate: '2026-10-24', excludeIds: [k(1).id] });
  const now = fake.days[0].stops[1].venue;
  assert.equal(now.type, 'winery');
  assert.ok(![k(1).id, k(2).id].includes(now.id), `${now.name} is not the kept late-afternoon tasting`);
});

test('Swap (round 8): the slot keeps its purpose -- a winery lunch, a vegan lunch, a sit-down romantic dinner, its town', () => {
  // Lunch at a winery that serves food stays lunch at a winery that serves food.
  const lunchDay = { theme: 'wine', days: [{ day: 1, region: 'naramata', stops: [{ daypart: 'midday', label: 'Midday', wineryLunch: true, venue: { id: KITCHEN_1.id, type: 'winery', name: KITCHEN_1.name } }] }] };
  tp.applySwapPreference(lunchDay, { swap: { key: '1-midday', type: 'winery', id: KITCHEN_1.id }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('lunch at a winery in Naramata', TAXONOMY), text: 'lunch at a winery in Naramata', tripDate: '2026-10-24', excludeIds: [KITCHEN_1.id] });
  assert.equal(lunchDay.days[0].stops[0].venue.id, KITCHEN_2.id, 'the other winery with a kitchen, not a tasting room');
  assert.equal(lunchDay.days[0].stops[0].wineryLunch, true);
  // A vegan day keeps vegan.
  const text = 'vegan food day in Penticton';
  const { p, requirements } = plan(text, { startDate: '2026-10-24' });
  const lunch = p.days[0].stops.find((s) => s.daypart === 'midday' && s.venue && s.venue.type === 'restaurant');
  assert.ok(lunch && BY_ID.get(lunch.venue.id).features.vegan, 'the plan has a vegan lunch');
  const after = swapOnce(text, p, requirements, '1-midday');
  const swapped = after.days[0].stops.find((s) => s.daypart === 'midday');
  assert.ok(swapped && swapped.venue && BY_ID.get(swapped.venue.id).features.vegan && swapped.venue.id !== lunch.venue.id, swapped && swapped.venue && swapped.venue.name);
  // A romantic dinner is never swapped for pizza by the slice.
  const dinner = { days: [{ day: 1, region: 'naramata', stops: [{ daypart: 'evening', label: 'Evening', venue: { id: FACTS.find((v) => v.name === 'Naramata Kitchen 1').id, type: 'restaurant', name: 'Naramata Kitchen 1' } }] }] };
  const ex = FACTS.filter((v) => v.region === 'naramata' && v.type === 'restaurant' && v.name !== 'Naramata Pizza Slice').map((v) => v.id);
  tp.applySwapPreference(dinner, { swap: { key: '1-evening', type: 'restaurant', id: ex[0] }, facts: FACTS, labels: LABELS, intent: { ...d.interpretDiscoveryQuery('romantic evening in Naramata', TAXONOMY), occasion: 'romantic' }, tripDate: '2026-10-24', excludeIds: ex });
  assert.notEqual(dinner.days[0].stops[0].venue.name, 'Naramata Pizza Slice');
});

test('Swap (round 8): a swapped day is re-timed and never has two meals back to back', () => {
  for (const text of ['vegan food day in Penticton', 'Peachland and Summerland day trip, dinner in Naramata', 'one day in Kelowna']) {
    const { p, requirements } = plan(text, { startDate: '2026-10-24' });
    for (const key of p.days[0].stops.filter((s) => s.venue).map((s) => `1-${s.daypart}`)) {
      const after = swapOnce(text, p, requirements, key);
      const stops = after.days[0].stops.filter((s) => s.venue);
      for (let k = 1; k < stops.length; k++) {
        const meal = (s) => ['restaurant', 'pub'].includes(s.venue.type) && s.daypart !== 'evening';
        assert.ok(!(meal(stops[k - 1]) && meal(stops[k])), `${text}, swap ${key}: ${stops[k - 1].venue.name} then ${stops[k].venue.name}`);
      }
      assert.ok(stops.every((s) => rowOf(after, s)), `${text}, swap ${key}: every stop is timed again`);
    }
  }
});

// ---- 2. One-day requests ----
test('One day (round 8): "X day" is a one-day plan, never a list', () => {
  for (const text of ['vegan food day in Penticton', 'Naramata wine day', 'rainy day in Penticton']) {
    const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
    assert.equal(intent.days, 1, text);
    const { p } = plan(text, { startDate: '2026-10-24' });
    assert.ok(['day_plan', 'multi_day'].includes(p.kind) && p.days.length === 1, `${text}: ${p.kind}`);
    assert.ok(p.days[0].stops.filter((s) => s.venue).length >= 3, `${text}: a real day`);
  }
  // Unchanged: the weather on an outing, a rainy-day list, a spa day search.
  assert.equal(d.interpretDiscoveryQuery('coffee and dinner on a rainy day in Kelowna', TAXONOMY).days ?? null, null);
  assert.equal(d.interpretDiscoveryQuery('rainy day ideas in Kelowna', TAXONOMY).days ?? null, null);
});

test('One day (round 8): each part of the day goes to the town asked for', () => {
  assert.deepEqual(tp.dayPartRegions('Summerland in the morning and Naramata wineries in the afternoon', ['summerland', 'naramata'], REGIONS).parts, { morning: 'summerland', afternoon: 'naramata', late: 'naramata', midday: 'summerland', evening: 'naramata' });
  assert.equal(tp.dayPartRegions('West Kelowna wineries then dinner in Kelowna', ['west-kelowna', 'kelowna'], REGIONS).parts.evening, 'kelowna');
  assert.equal(tp.dayPartRegions('West Kelowna wineries then dinner in Kelowna', ['west-kelowna', 'kelowna'], REGIONS).parts.afternoon, 'west-kelowna');
  assert.equal(tp.dayPartRegions('Peachland and Summerland day trip, dinner in Naramata', ['peachland', 'summerland', 'naramata'], REGIONS).parts.evening, 'naramata');
  assert.equal(tp.dayPartRegions('one day in Oliver and Osoyoos', ['oliver', 'osoyoos'], REGIONS), null, 'two towns with no time of day stay a shared day');
  const town = (p, part) => { const s = p.days[0].stops.find((x) => x.daypart === part && x.venue); return s && s.venue.region; };
  let p = plan('Summerland in the morning and Naramata wineries in the afternoon', { startDate: '2026-10-24' }).p;
  assert.equal(p.days.length, 1);
  assert.equal(town(p, 'morning'), 'summerland');
  assert.equal(town(p, 'afternoon'), 'naramata');
  assert.equal(town(p, 'evening'), 'naramata');
  p = plan('West Kelowna wineries then dinner in Kelowna', { startDate: '2026-10-24' }).p;
  assert.equal(p.kind, 'day_plan');
  assert.equal(town(p, 'evening'), 'kelowna');
  assert.ok(p.days[0].stops.filter((s) => s.venue && s.venue.type === 'winery').every((s) => s.venue.region === 'west-kelowna'));
  assert.ok(p.days[0].stops.filter((s) => s.venue && s.venue.type === 'winery').length >= 2, 'wineries, plural');
  p = plan('Peachland and Summerland day trip, dinner in Naramata', { startDate: '2026-10-24' }).p;
  assert.equal(town(p, 'morning'), 'peachland');
  assert.equal(town(p, 'evening'), 'naramata');
});

test('French (round 8): « spectacle » is a show, not only a concert', () => {
  const text = fr.tripPlannerText('soirée spectacle et souper à Kelowna', TAXONOMY);
  assert.match(text, /\ba show\b/);
  assert.doesNotMatch(text, /live show/);
  assert.match(fr.tripPlannerText('spectacle musical et souper à Kelowna', TAXONOMY), /concert/);
});

// ---- 3. Short plans ----
test('Short plans (round 8): a long gap gets lunch, one more stop or a Free time card', () => {
  const { p } = plan('one day in Kelowna: coffee, an easy hike, a winery and dinner', { startDate: '2026-10-23' });
  assert.equal(p.kind, 'itinerary');
  const stops = p.itinerary.stops;
  assert.ok(stops.some((s) => s.label === 'Lunch' && s.venue), stops.map((s) => s.label).join(', '));
  assert.equal(stops.filter((s) => s.venue && s.venue.type === 'winery').length, 1, '"a winery" stays one winery');
  const timed = stops.filter((s) => s.venue || s.event).map((s) => rowOf(p, s));
  for (let k = 1; k < timed.length; k++) {
    const gap = timed[k].startMinutes - timed[k - 1].endMinutes;
    const free = stops.slice(stops.indexOf(stops.filter((s) => s.venue || s.event)[k - 1]), stops.indexOf(stops.filter((s) => s.venue || s.event)[k])).some((s) => s.freeTime);
    assert.ok(gap < 150 || free, `a ${gap}-minute gap with nothing in it`);
  }
});

// ---- 4. Ski days and fillers ----
test('Ski (round 8): the ski day runs about 9 to 3:30 with lunch on the hill, and the extra comes after', () => {
  const { p } = plan('SilverStar ski weekend', { startDate: '2027-01-09' });
  assert.equal(p.theme, 'ski');
  for (const day of p.days) {
    const ski = day.stops.find((s) => s.skiDay), lunch = day.stops.find((s) => s.onHill), extra = day.stops.find((s) => s.afterSki);
    assert.ok(ski && lunch, `day ${day.day}`);
    const rs = rowOf(p, ski), rl = rowOf(p, lunch);
    assert.equal(rs.startMinutes, 540);
    assert.equal(rs.endMinutes, 930);
    assert.ok(rl.startMinutes >= 690 && rl.endMinutes <= 870, 'lunch is a break inside the ski day');
    if (extra) {
      assert.ok(rowOf(p, extra).startMinutes >= 930, 'after the lifts');
      assert.match(extra.venue.name, /Tube/, 'in January, only an activity that runs after dark');
    }
  }
});

test('Fillers (round 8): a late-afternoon filler is 60-90 minutes and ends half an hour before sunset', () => {
  for (const type of ['outdoor', 'beach', 'indoor', 'winery', 'cafe', 'tour', 'brewery']) { const m = tp.gapFillMinutes({ type }); assert.ok(m >= 60 && m <= 90, `${type}: ${m}`); }
  const { p } = plan('one day in Penticton with a walk', { startDate: '2026-11-21' });
  for (const day of p.days) for (const s of day.stops.filter((x) => x.gapFill && x.venue && ['outdoor', 'beach'].includes(x.venue.type))) {
    const row = rowOf(p, s);
    const light = r.estimateDaylight(day.date, BY_ID.get(s.venue.id));
    assert.ok(row.endMinutes - row.startMinutes <= 90);
    assert.ok(row.endMinutes <= light.sunsetMinutes - 30, `${s.venue.name} ends at ${row.endMinutes}, sunset ${light.sunsetMinutes}`);
  }
});

// ---- 5. Timing conflicts and road trips ----
test('Timing (round 8): a stop whose hours do not fit gives way to one that does, and the day stays timed', () => {
  const text = 'one day in Kelowna';
  const { p, requirements } = plan(text, { startDate: '2026-10-24' });
  const lunch = p.days[0].stops.find((s) => s.daypart === 'midday' && s.venue && s.venue.type === 'restaurant');
  assert.ok(lunch);
  // Lock the late opener in as lunch's neighbour: re-plan with it pinned as the midday stop, unlocked.
  const pinned = shownPins(p, null);
  pinned['1-midday'] = LATE_OPENER.id;
  const again = tp.planTrip({ intent: d.interpretDiscoveryQuery(text, TAXONOMY), trip: null, requirements, facts: FACTS, labels: LABELS, text, tripDate: '2026-10-24', pinned, swap: { key: '1-afternoon', type: 'outdoor' }, tripEvents: [] });
  const rows = again.schedule.filter((x) => x.day === 1);
  assert.ok(!rows.some((x) => x.status === 'unmet'), JSON.stringify(rows));
  assert.ok(rows.every((x) => Number.isFinite(x.startMinutes)), 'every later stop is still timed');
});

test('Road trips (round 8): Osoyoos to Vernon in two days stops in Kelowna or Penticton on the way', () => {
  const { p } = plan('road trip from Osoyoos to Vernon over 2 days', { startDate: '2026-10-22' });
  assert.equal(p.days.length, 2);
  const day2 = p.days[1];
  assert.ok(day2.regions && ['kelowna', 'penticton'].includes(day2.regions[0]) && day2.regions[1] === 'vernon', JSON.stringify(day2.regions));
  assert.ok(['kelowna', 'penticton'].includes(day2.stops.find((s) => s.venue).venue.region), 'the morning is on the way');
  assert.equal(day2.stops.filter((s) => s.venue).slice(-1)[0].venue.region, 'vernon', 'the night is in Vernon');
});

// ---- 6. Themes, events and wording ----
test('Halloween (round 8): a Halloween trip has the Halloween event on its dates, with a reason', () => {
  const events = [ev({ name: 'Downtown Halloween Spooktacular', region: 'kelowna', date: '2026-10-31', time: '7 pm', categories: ['holiday-seasonal'] })];
  const { p } = plan('Halloween weekend in Kelowna', { startDate: '2026-10-31', events, holidayEvents: true });
  const stop = p.days[0].stops.find((s) => s.event);
  assert.ok(stop, 'the event is in the plan');
  assert.deepEqual(stop.why, ['A Halloween event on your dates', 'Listed on What’s On, with its start time']);
  assert.match(t3FrenchText(stop.why[0]), /Halloween/);
});

test('Comedy (round 8): "a comedy show" is stand-up before a musical billed as a comedy', () => {
  const tripEvents = [
    ev({ name: 'Little Shop of Horrors', description: 'A musical comedy.', region: 'kelowna', date: '2026-10-24', time: '7 pm' }),
    ev({ name: 'Next Stop Comedy Night', description: 'Stand-up comedians.', region: 'kelowna', date: '2026-10-24', time: '7:30 pm' }),
  ];
  const { p } = plan('dinner and a comedy show in Kelowna', { startDate: '2026-10-24', tripEvents });
  const show = p.itinerary.stops.find((s) => s.event);
  assert.equal(show.event.name, 'Next Stop Comedy Night');
  assert.equal(show.why[0], 'Matches your request for a comedy show');
  assert.equal(t3FrenchText(show.why[0]), 'Correspond à votre demande de spectacle d’humour');
});

test('Wording (round 8): "2 days: X one day, Y the next" is a 2-day trip with no length warning', () => {
  const text = '2 days: West Kelowna wineries one day, Naramata wineries the next';
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY), trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const req = r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-19' });
  assert.deepEqual(req.items.filter((i) => i.kind === 'days').map((i) => i.value), [2]);
  assert.ok(!req.conflicts.some((c) => /trip lengths/.test(c)));
  const { p } = plan(text, { startDate: '2026-10-24' });
  assert.ok(!(p.warnings || []).some((w) => /trip length/.test(w)), p.warnings.join(' | '));
});

test('French (round 8): Comedy, "+ 1 more date" and a written summary rather than a list of names', () => {
  assert.equal(t3FrenchText('Comedy show'), 'Spectacle d’humour');
  assert.equal(t3FrenchText('Comedy'), 'Humour');
  assert.equal(t3FrenchEvent({ dateLabel: 'Sat Oct 24 + 1 more date' }).dateLabel, 'sam. 24 oct. + 1 autre date');
  assert.equal(t3FrenchEvent({ dateLabel: 'Sat Oct 24 + 3 more dates' }).dateLabel, 'sam. 24 oct. + 3 autres dates');
  const { p } = plan('Naramata wine day', { startDate: '2026-10-24' });
  p.understood = { interests: ['“comedy”'] };
  const f = t3FrenchPlan(p);
  assert.deepEqual(f.understood.interests, ['humour']);
  assert.match(f.experience.text, /^Votre journée à Naramata commence par .+, et se termine par un souper à .+\./);
  assert.ok(!f.experience.text.includes('→'));
  // The page ships the summary's helpers with t3FrenchPlan (a missing one crashed /fr/trip in round 7).
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  for (const s of ['${t3FrenchStory.toString()}', '${t3FrenchStopText.toString()}', 'var FR_STOP_NOUN = ${JSON.stringify(FR_STOP_NOUN)};']) assert.ok(page.includes(s), s);
});

test('Events (round 8): every event stop says why it is in the plan', () => {
  const tripEvents = [ev({ name: 'Kelowna Fall Concert', region: 'kelowna', date: '2026-10-24', time: '8 pm', categories: ['live-music'] })];
  const { p } = plan('dinner and a concert in Kelowna', { startDate: '2026-10-24', tripEvents });
  const show = p.itinerary.stops.find((s) => s.event);
  assert.ok(show && show.why.length >= 1 && show.why.every(Boolean), JSON.stringify(show && show.why));
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page.includes("((s.why || []).length ? '<ul class=\"t3-why\""), 'the event card shows it');
});
