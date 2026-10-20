// Build My Trip, round 11 (2026-10-20): time windows ("this weekend in Penticton", "Saturday evening in Penticton"),
// shows at fixed times (meals before them in the show's town, the home base kept, the shows named), themes that pull
// events, French requests and links, impossible stops and the smaller fixes from
// drafts/site-review-2026-10-19-pass10.md. PURE tests on a small fixture valley (no server.js, no database), plus the
// page's serialized helpers run in a vm.
// fixture valley (no server.js, no database), plus the page's serialized helpers run in a vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const { t3FrenchText } = require('../trip-french-copy.js');

const REGIONS = { vernon: 'Vernon', 'lake-country': 'Lake Country', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland', summerland: 'Summerland', penticton: 'Penticton', naramata: 'Naramata', kaleden: 'Kaleden', 'okanagan-falls': 'Okanagan Falls', oliver: 'Oliver', osoyoos: 'Osoyoos' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'vegan', 'vegetarian'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'holiday-seasonal', 'arts-culture', 'markets-fairs', 'nightlife', 'community-events'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor'), sport: T('Sport', 'Sports') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', vegan: 'Vegan-Friendly', vegetarian: 'Vegetarian-Friendly' }, featureNouns: {}, collections: {},
};
const CENTRES = { vernon: [50.267, -119.272], 'lake-country': [50.054, -119.41], kelowna: [49.888, -119.47], 'west-kelowna': [49.863, -119.583], peachland: [49.773, -119.736], summerland: [49.602, -119.677], penticton: [49.48, -119.585], naramata: [49.594, -119.588], kaleden: [49.39, -119.6], 'okanagan-falls': [49.34, -119.57], oliver: [49.183, -119.551], osoyoos: [49.032, -119.468] };
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
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: null, cuisineLabel: null,
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
  for (let i = 0; i < 3; i++) add({ name: `${L} Ridge Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, hours: open('10:00', '18:00'), dLat: 0.012 * i, dLng: 0.01 });
  for (let i = 0; i < 4; i++) add({ name: `${L} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 2 + (i % 2), hours: open('11:00', '22:00'), dLat: 0.004 * i });
  add({ name: `${L} Coffee Co`, region, type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and lunch.', hours: open('07:00', '16:00') });
  add({ name: `${L} Heritage Museum`, region, type: 'indoor', rating: 4.5, hours: open('10:00', '17:00'), desc: 'A local history museum.', dLat: 0.003 });
}
for (const region of ['kelowna', 'penticton']) for (let i = 0; i < 150; i++) add({ name: `${REGIONS[region]} Curling Club ${i + 1}`, region, type: 'sport', rating: 3 });
// Penticton breweries (a crawl), none a brewpub by name.
const BREWERIES = [0, 1, 2, 3, 4].map((i) => add({ name: `Penticton Ale House Brewing ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.7 - i * 0.05, hours: open('11:00', '22:00'), dLat: 0.003 * i }));
// Oliver: winery estates and their restaurants (Hester Creek / Terrafina, Tinhorn / Miradoro, Burrowing Owl / Sonora).
const HESTER = add({ name: 'Hester Creek Estate Winery', region: 'oliver', type: 'winery', rating: 4.7, hours: open('10:00', '17:00'), desc: 'Hester Creek pairs its wines with a gorgeous patio restaurant.', dLat: 0.02 });
const TERRAFINA = add({ name: 'Terrafina at Hester Creek', region: 'oliver', type: 'restaurant', rating: 4.5, price: 3, hours: open('11:30', '20:00'), desc: 'Terrafina at Hester Creek is the patio restaurant at this Oliver winery estate.', dLat: 0.021 });
const TINHORN = add({ name: 'Tinhorn Creek Vineyards', region: 'oliver', type: 'winery', rating: 4.6, hours: open('11:00', '17:00'), desc: 'Tinhorn Creek Vineyards has a restaurant and tasting room with a patio.', dLat: 0.03 });
const MIRADORO = add({ name: 'Miradoro Restaurant', region: 'oliver', type: 'restaurant', rating: 4.5, price: 3, hours: open('11:30', '21:00'), desc: 'Miradoro Restaurant is the fine-dining room at Tinhorn Creek Vineyards in Oliver.', dLat: 0.031 });
const OWL = add({ name: 'Burrowing Owl Estate Winery', region: 'oliver', type: 'winery', rating: 4.7, hours: open('10:00', '17:00'), desc: 'Burrowing Owl does triple duty as restaurant, inn and winery.', dLat: 0.04 });
const SONORA = add({ name: 'Sonora Room Restaurant', region: 'oliver', type: 'restaurant', rating: 4.6, price: 3, hours: open('11:30', '20:00'), desc: 'Sonora Room Restaurant sits at Burrowing Owl Estate Winery in Oliver, with a balcony over the vineyards.', dLat: 0.041 });
const BOARDS = add({ name: 'Vasanti Estate Winery', region: 'oliver', type: 'winery', rating: 5, hours: open('10:00', '17:00'), desc: 'The charcuterie boards are generous.', dLat: 0.05 });
// Trails, a golf simulator, a tour company and a gelato bar.
const FALLS = add({ name: 'Naramata Creek Park Waterfall Trail', region: 'naramata', type: 'outdoor', rating: 4.7, activities: ['hiking'], desc: 'Naramata Creek Park is the village’s waterfall walk: a 2.5 km round trip on a packed trail up the creek.' });
const SIM = add({ name: 'Kelowna Sim Golf', region: 'kelowna', type: 'golf', rating: 4.8, hours: open('09:00', '23:00'), desc: 'An indoor golf simulator lounge.' });
SIM.indoorGolf = true; SIM.indoorEvidence = 'explicit';
const TOUR = add({ name: 'Kelowna Adventure Tours', region: 'kelowna', type: 'tour', rating: 4.9, hours: open('09:00', '17:00'), desc: 'Guided e-bike tours.' });
const GELATO = add({ name: 'Kelowna Gelato Bar', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('11:00', '21:00'), desc: 'Gelato and sorbet.' });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

let eventId = 900;
const ev = (o) => ({ id: o.id || eventId++, name: o.name, description: o.description || '', region: o.region, venueName: '', url: `/${o.region}/events/x`, valleyWide: false, categories: o.categories || ['arts-culture'], dateLabel: '', time: o.time, startDate: o.date, endDate: o.date, startTime: null, endTime: null, endsNextDay: 0, location: null });

function build(text, opts = {}) {
  const t = opts.french ? fr.tripPlannerText(text, TAXONOMY) : text;
  const intent = d.interpretDiscoveryQuery(t, TAXONOMY);
  const trip = d.interpretTripComponents(t, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text: t, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-19' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = null; requirements.startMinutes = 540; }
  return { text: t, intent, trip, requirements, opts };
}
function run(b, extra = {}) {
  return tp.planTrip({ intent: b.intent, trip: b.trip.multi ? b.trip : null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: b.requirements.startDate || '2026-10-24',
    tripEvents: b.trip.multi ? b.trip.components.map((c) => (c.kind === 'event' ? (b.opts.tripEvents || []) : null)) : [], ...extra });
}
const shortStops = (p) => (p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [];
const rowOf = (p, s) => (p.schedule || []).find((x) => (s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id));
const refOf = (s) => (s.kind !== 'event' && s.venue ? `venue:${s.venue.id}` : s.event ? `event:${s.event.id}` : null);
// What /trip sends for a short-plan Swap: the stops on screen in order, and their starts.
function swapShort(b, prev, n, exclude) {
  const list = shortStops(prev), st = list[n];
  if (!exclude.includes(st.venue.id)) exclude.push(st.venue.id);
  const stops = list.map((s) => ({ ref: refOf(s), label: s.label, daypart: s.daypart, component: s.component, ...(s.gapFill ? { gapFill: true } : {}) }));
  const times = {};
  list.forEach((s, j) => { const row = rowOf(prev, s); if (row && Number.isInteger(row.startMinutes)) times[`it-${j}`] = row.startMinutes; });
  const next = run(b, { excludeIds: exclude.slice(), swap: { key: `it-${n}`, type: st.venue.type, id: st.venue.id, stops, times } });
  if (next.swapKept) exclude.splice(exclude.indexOf(next.swapKept.id), 1);
  return next;
}

// ---- Round 11 fixture additions ----
const LC = (o) => add({ region: 'lake-country', ...o });
const LC_BISTRO = LC({ name: 'Lake Country Bistro', type: 'restaurant', rating: 4.3, hours: open('11:00', '21:00') });
const EARLY_CLOSER = add({ name: 'Kelowna Lunch Counter', region: 'kelowna', type: 'restaurant', rating: 5, price: 2, hours: open('11:00', '17:00') });
const GREY = add({ name: 'Grey Canal Trail', region: 'vernon', type: 'outdoor', rating: 4.6, activities: ['hiking'], desc: 'It is not one trailhead but a series of sections that ring the valley, so you can walk it in pieces. Turtle Mountain is 3.5 km and Coldstream 4.2 km, with the 2.7 km Foothills loop moderate.' });
const KELOWNA_BREWERY = add({ name: 'Kelowna Night Brewing', region: 'kelowna', type: 'brewery', rating: 4.6, hours: open('12:00', '23:00') });
const KELOWNA_LOUNGE = add({ name: 'Kelowna Late Lounge', region: 'kelowna', type: 'cocktail', rating: 4.6, hours: open('16:00', '23:59') });
const PLACE = { vernon: { lat: 50.267, lng: -119.272 }, 'lake-country': { lat: 50.054, lng: -119.41 }, kelowna: { lat: 49.888, lng: -119.47 }, penticton: { lat: 49.48, lng: -119.585 } };
const located = (o) => ({ ...ev(o), location: PLACE[o.region] || null });
const byIdAll = (id) => FACTS.find((v) => v.id === id);
const allStops = (p) => (p.days && p.days.length ? p.days.flatMap((x) => x.stops) : shortStops(p));
const rowFor = (p, day, s) => (p.schedule || []).find((x) => (x.day || 1) === day && ((s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id)));

// ---- 1. Time windows ----
test('Time windows (round 11): "this weekend in Penticton" is a 2-day plan on the coming Saturday and Sunday in Penticton', () => {
  const b = build('this weekend in Penticton');
  assert.equal(b.requirements.startDate, '2026-10-24');
  assert.equal(b.requirements.items.find((i) => i.kind === 'days').value, 2);
  const p = run(b);
  assert.equal(p.kind, 'multi_day');
  assert.deepEqual(p.days.map((x) => x.date), ['2026-10-24', '2026-10-25']);
  for (const day of p.days) for (const s of day.stops.filter((x) => x.venue)) assert.equal(s.venue.region, 'penticton', s.venue.name);
  // On a Sunday "this weekend" is just today.
  const sun = r.extractTripRequirements({ text: 'this weekend in Penticton', intent: b.intent, trip: b.trip, taxonomy: TAXONOMY, referenceDate: '2026-10-25' });
  assert.equal(sun.startDate, '2026-10-25');
  assert.equal(sun.items.find((i) => i.kind === 'days').value, 1);
  // A kind of place keeps the Ideas list ("wineries this weekend in Penticton").
  const wine = build('wineries this weekend in Penticton');
  assert.equal(wine.requirements.startDate, null);
  assert.ok(!wine.requirements.items.some((i) => i.kind === 'days'));
});

test('Time windows (round 11): an evening, an afternoon or a morning in a town is a short plan for that window, in that town', () => {
  const cases = [
    ['Saturday evening in Penticton', 'penticton', 'evening', 17 * 60, 24 * 60, '2026-10-24', /^Saturday evening in Penticton: /],
    ['one evening in Kelowna', 'kelowna', 'evening', 17 * 60, 24 * 60, null, /^An evening in Kelowna: /],
    ['an afternoon in Kelowna', 'kelowna', 'afternoon', 13 * 60, 19 * 60, null, /^An afternoon in Kelowna: /],
    ['morning in Peachland', 'peachland', 'morning', 9 * 60, 14 * 60, null, /^A morning in Peachland: coffee/],
  ];
  for (const [q, town, window, from, to, date, summary] of cases) {
    const b = build(q);
    assert.equal(b.requirements.timeWindow, window, q);
    assert.equal(b.requirements.startDate, date, q);
    const p = run(b);
    assert.equal(p.kind, 'itinerary', q);
    assert.match(p.summary, summary, q);
    const stops = shortStops(p).filter((s) => s.venue);
    assert.ok(stops.length >= 2, `${q}: at least two stops`);
    for (const s of stops) {
      assert.equal(s.venue.region, town, `${q}: ${s.venue.name}`);
      const row = rowFor(p, 1, s);
      assert.ok(row && row.startMinutes >= from && row.endMinutes <= to, `${q}: ${s.venue.name} at ${row && row.startMinutes}`);
      assert.notEqual(row.status, 'unmet', `${q}: ${s.venue.name} fits its hours`);
    }
    // Only places open in the window: the best-rated lunch counter closes at 5 PM, so it is never the evening's dinner.
    if (window === 'evening' && town === 'kelowna') assert.ok(!stops.some((s) => s.venue.id === EARLY_CLOSER.id));
  }
  assert.equal(t3FrenchText('Saturday evening in Penticton: drinks, dinner and a nightcap.'), 'Samedi soir à Penticton : un verre, un souper et un dernier verre.');
  assert.equal(t3FrenchText('An afternoon in Kelowna: a walk or a sight, a tasting and coffee or a treat.'), 'Un après-midi à Kelowna : une promenade ou une visite, une dégustation et un café ou une gâterie.');
  assert.match(fr.tripPlannerText('samedi soir à Penticton', TAXONOMY), /^saturday evening in penticton$/);
});

// ---- 2. Shows at fixed times ----
test('Shows (round 11): a dinner that cannot fit before a show in another town moves to the show’s town', () => {
  const vernonDinner = FACTS.find((v) => v.name === 'Vernon Kitchen 1');
  const show = located({ id: 7001, name: 'The Legend of Garth Brooks Tribute', region: 'lake-country', time: '7 pm', date: '2026-11-07', categories: ['live-music'] });
  const p = { kind: 'multi_day', days: [{ day: 1, region: 'vernon', date: '2026-11-07', stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: GREY.id, type: 'outdoor', name: GREY.name, region: 'vernon' } },
    { daypart: 'afternoon', label: 'Afternoon', venue: { id: FACTS.find((v) => v.name === 'Vernon Ridge Winery 1').id, type: 'winery', name: 'Winery', region: 'vernon' } },
    { daypart: 'evening', label: 'Evening', venue: { id: vernonDinner.id, type: 'restaurant', name: vernonDinner.name, region: 'vernon' } },
    { daypart: 'night', label: 'Night', kind: 'event', event: show },
  ] }], notes: [], warnings: [] };
  const input = { facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('3 days in Vernon', TAXONOMY), tripDate: '2026-11-07' };
  tp.scheduleTripByHours(p, input, { items: [], conflicts: [], startDate: '2026-11-07', startMinutes: 540 });
  const dinner = p.days[0].stops[2];
  const row = rowFor(p, 1, dinner);
  assert.notEqual(row.status, 'unmet', 'dinner fits before the show');
  assert.ok(row.endMinutes <= 19 * 60 - 30, 'and ends before the arrival allowance');
  assert.ok(!p.warnings.some((w) => /cannot fit before the event/.test(w)), p.warnings.join(' | '));
});

test('Shows (round 11): lunch before a 2 PM show fits after a morning trail; trails are timed by their length', () => {
  const show = located({ id: 7002, name: 'Miigis – Red Sky Performance', region: 'vernon', time: '2 pm', date: '2026-11-08' });
  const lunch = FACTS.find((v) => v.name === 'Vernon Kitchen 2');
  const p = { kind: 'multi_day', days: [{ day: 1, region: 'vernon', date: '2026-11-08', stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: FACTS.find((v) => v.name === 'Vernon Creek Trail 1').id, type: 'outdoor', name: 'Trail', region: 'vernon' } },
    { daypart: 'midday', label: 'Midday', venue: { id: lunch.id, type: 'restaurant', name: lunch.name, region: 'vernon' } },
    { daypart: 'afternoon', label: 'Afternoon', kind: 'event', event: show },
  ] }], notes: [], warnings: [] };
  const input = { facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('3 days in Vernon', TAXONOMY), tripDate: '2026-11-08' };
  tp.scheduleTripByHours(p, input, { items: [], conflicts: [], startDate: '2026-11-08', startMinutes: 585 });
  const row = rowFor(p, 1, p.days[0].stops[1]);
  assert.notEqual(row.status, 'unmet', p.warnings.join(' | '));
  assert.ok(row.endMinutes <= 14 * 60 - 30);
  assert.ok(!p.warnings.some((w) => /cannot fit before the event/.test(w)), p.warnings.join(' | '));
  assert.equal(tp.trailMinutes(GREY), 90, 'a trail network walked in sections is about 90 minutes');
  assert.equal(tp.trailMinutes(FALLS), 60);
});

test('Shows (round 11): a stay in one town starts each day there, and the summary names the shows', () => {
  const shows = [
    located({ id: 7101, name: 'Moontricks', region: 'vernon', time: '7:30 pm', date: '2026-11-06', categories: ['live-music'] }),
    { ...located({ id: 7102, name: 'The Legend of Garth Brooks Tribute', region: 'lake-country', time: '7 pm', date: '2026-11-07', categories: ['live-music'] }) },
    located({ id: 7103, name: 'Miigis – Red Sky Performance', region: 'vernon', time: '2 pm', date: '2026-11-08', description: 'A dance theatre show.' }),
  ];
  const b = build('3 days in Vernon in November with shows and live music', { startDate: '2026-11-06' });
  const p = tp.planTrip({ intent: b.intent, trip: null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: '2026-11-06', events: shows });
  assert.equal(p.days.length, 3);
  for (const day of p.days.slice(1)) assert.ok(!day.driveIn || day.driveIn.from === 'vernon', `day ${day.day} starts in Vernon (${JSON.stringify(day.driveIn)})`);
  const named = allStops(p).filter((s) => s.event).map((s) => s.event.name);
  assert.ok(named.length >= 2);
  for (const n of named) assert.ok(p.summary.includes(n), `${p.summary} names ${n}`);
  assert.ok(!p.warnings.some((w) => /cannot fit before the event/.test(w)), p.warnings.join(' | '));
});

// ---- 3. Themes pull events ----
test('Christmas (round 11): "Christmas markets in Kelowna in December, 2 days" has a market each day that has one', () => {
  const mk = (id, name, date, time = '10 am') => ({ ...located({ id, name, region: 'kelowna', time, date, categories: ['markets-fairs'] }), endDate: date });
  const events = [mk(7201, 'East Kelowna Christmas in the Country Market', '2026-12-05'), mk(7202, 'Christkindl Holiday Market', '2026-12-05', '2 pm'), mk(7202, 'Christkindl Holiday Market', '2026-12-06', '2 pm'), mk(7203, 'Craft Culture Holiday Market', '2026-12-06', '1 pm')];
  const b = build('Christmas markets in Kelowna in December, 2 days', { startDate: '2026-12-05' });
  const p = tp.planTrip({ intent: b.intent, trip: null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: '2026-12-05', events });
  assert.equal(p.days.length, 2);
  for (const day of p.days) assert.ok(day.stops.some((s) => s.event && /Market/.test(s.event.name)), `day ${day.day} has a market: ${day.stops.map((s) => (s.event || s.venue || {}).name).join(', ')}`);
  assert.equal(r.eventMatches({ name: 'Kelowna Christkindl Market', categories: ['markets-fairs'] }, b.requirements.items.find((i) => i.kind === 'event')), true);
});

test('Christmas (round 11): "Christmas in Penticton" plans the holiday markets on its dates', () => {
  const events = [
    { ...located({ id: 7301, name: 'Last Chance Holiday Market', region: 'penticton', time: '10 am', date: '2026-12-12', categories: ['markets-fairs'] }) },
    { ...located({ id: 7302, name: 'West Bench Holiday Market', region: 'penticton', time: '11 am', date: '2026-12-13', categories: ['markets-fairs'] }) },
  ];
  const theme = tp.holidayTheme('christmas in penticton');
  assert.equal(theme.key, 'christmas');
  assert.ok(events.every((e) => theme.re.test(d.normalizeDiscoveryText(e.name))));
  const b = build('Christmas in Penticton, 2 days', { startDate: '2026-12-12' });
  const p = tp.planTrip({ intent: b.intent, trip: null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: '2026-12-12', events, holidayEvents: true });
  const planned = allStops(p).filter((s) => s.event).map((s) => s.event.id);
  assert.deepEqual([...new Set(planned)].sort(), [7301, 7302]);
});

// ---- 4. French ----
test('French (round 11): « tournée des brasseries », « crawl de brasseries », « route des bières » are a brewery crawl', () => {
  for (const q of ['tournée des brasseries à Penticton', 'crawl de brasseries à Penticton', 'route des bières à Penticton']) {
    assert.equal(fr.tripPlannerText(q, TAXONOMY), 'brewery crawl in penticton', q);
    const p = run(build(q, { french: true, startDate: '2026-10-24' }));
    const breweries = shortStops(p).filter((s) => s.venue && s.venue.type === 'brewery');
    assert.ok(breweries.length >= 2, `${q}: ${shortStops(p).map((s) => (s.venue || {}).name).join(', ')}`);
  }
});

test('French (round 11): « de Kelowna à Osoyoos (en voiture) » and "Kelowna to Osoyoos" are a 2-day road trip south', () => {
  assert.equal(fr.tripPlannerText('de Kelowna à Osoyoos (en voiture)', TAXONOMY), 'from kelowna to osoyoos by car');
  for (const [q, french] of [['de Kelowna à Osoyoos (en voiture)', true], ['Kelowna to Osoyoos', false], ['from Kelowna to Osoyoos by car', false]]) {
    const b = build(q, { french, startDate: '2026-10-31' });
    assert.equal(b.intent.mode, 'plan', q);
    assert.ok(!(b.intent.textTerms || []).length, `${q}: no leftover words (${b.intent.textTerms})`);
    const p = run(b);
    assert.equal(p.days.length, 2, q);
    assert.equal([].concat(p.days[0].regions || p.days[0].region)[0], 'kelowna', q);
    assert.equal([].concat(p.days[1].regions || p.days[1].region).slice(-1)[0], 'osoyoos', q);
  }
  // Two towns with something else asked for keep their old reading.
  assert.notEqual(d.interpretDiscoveryQuery('wineries Kelowna to Osoyoos', TAXONOMY).roadTrip, true);
});

test('French (round 11): plan links on /fr/trip go to French pages', () => {
  const page = require('../trip-planner-v3-page.js');
  assert.equal(page.t3FrenchHref('/penticton/breweries/bad-tattoo'), '/fr/penticton/breweries/bad-tattoo');
  assert.equal(page.t3FrenchHref('/penticton/breweries/x', '/fr/penticton/breweries/x'), '/fr/penticton/breweries/x');
  assert.equal(page.t3FrenchHref('/whats-on?regions=kelowna&categories=markets-fairs'), '/fr/whats-on?regions=kelowna&categories=markets-fairs');
  assert.equal(page.t3FrenchHref('/browse?q=brewery'), '/fr/browse?q=brewery');
  assert.equal(page.t3FrenchHref('/fr/kelowna'), '/fr/kelowna');
  assert.equal(page.t3FrenchHref('/api/trip/plan'), '/api/trip/plan');
  assert.equal(page.t3FrenchHref('#t3-day-2'), '#t3-day-2');
  const steps = page.t3PlanNextSteps({ days: [{ day: 1, stops: [{ venue: { id: 5, name: 'Lake Country Bistro', url: '/lake-country/restaurants/x', urlFr: '/fr/lake-country/restaurants/x' } }] }], schedule: [{ venueId: 5, status: 'provisional', confirmationReasons: ['hours'] }] });
  assert.equal(steps[0].urlFr, '/fr/lake-country/restaurants/x');
  const html = page.renderTripPlannerV3Page({ esc: (s) => String(s == null ? '' : s), title: 't', description: 'd', canonical: '/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const s of scripts) new vm.Script(s);
  const main = scripts.find((s) => s.includes('function shortShown('));
  assert.match(main, /function t3FrenchHref\(/, 'the helper ships with the page');
  assert.match(main, /if \(lang\(\) === 'fr'\) Array\.prototype\.forEach\.call\(resultEl\.querySelectorAll\('a\[href\^="\/"\]'\)/);
  assert.match(main, /hrefAttr\(nextFr\?t3FrenchHref\(step\.url,step\.urlFr\):step\.url\)/, '« Voir la fiche »');
});

test('French (round 11): day titles use « et »; dates, routes and colons follow French typography', () => {
  const { t3FrenchPlan, t3FrenchEvent, t3FrenchStory } = require('../trip-french-copy.js');
  const plan = t3FrenchPlan({ kind: 'multi_day', summary: 'x', days: [{ day: 1, region: 'penticton', regions: ['penticton', 'vernon'], regionLabel: 'Penticton and Vernon', stops: [] }] });
  assert.equal(plan.days[0].regionLabel, 'Penticton et Vernon');
  assert.equal(t3FrenchEvent({ dateLabel: 'Sat Oct 31 – Sun Nov 1' }).dateLabel, 'sam. 31 oct. – dim. 1er nov.');
  assert.equal(t3FrenchText('Planned as a road trip from Osoyoos to Penticton, one stretch of the valley each day.'), 'Planifié comme un road trip d’Osoyoos à Penticton, une portion de la vallée chaque jour.');
  assert.match(t3FrenchText('Estimated driving assumed travel: 28–34 minutes; allow 30 minutes for arrival'), /\(mode supposé\) : 28–34/);
  assert.match(t3FrenchText('About 2 km (straight line) from Okanagan Spirits Craft Distillery'), /d’Okanagan Spirits/);
  const page = require('../trip-planner-v3-page.js');
  assert.equal(page.t3DriveText({ fromLabel: 'Osoyoos', toLabel: 'Penticton', minMinutes: 40, maxMinutes: 45 }, 'fr'), 'Trajet d’Osoyoos à Penticton : environ 40 à 45 min (estimation)');
  const four = { days: [1, 2, 3, 4].map((n) => ({ day: n, regionLabel: 'Kelowna', stops: [{ venue: { name: `Stop ${n}`, type: 'cafe' }, daypart: 'morning' }] })) };
  assert.match(t3FrenchStory(four), /Le jour 4 : Stop 4\.$/);
  assert.doesNotMatch(t3FrenchStory(four), /Ensuite/);
});

// ---- 5. Impossible stops ----
test('Impossible stops (round 11): a Saturday-only market with no stored hours is planned only on a Saturday in its season', () => {
  const market = add({ name: 'Penticton Farmers’ Market', region: 'penticton', type: 'outdoor', rating: 5, desc: 'The Penticton Farmers’ Market fills the 100 block of Main Street every Saturday morning from mid-April to the end of October.' });
  assert.deepEqual([...r.listedWeekdays(market).days], [6]);
  assert.deepEqual(r.listedWeekdays(market).months, [4, 10]);
  assert.equal(r.venueAllowed(market, null, 1, '2026-10-24'), true, 'Saturday Oct 24');
  assert.equal(r.venueAllowed(market, null, 2, '2026-10-24'), false, 'Sunday Oct 25');
  assert.equal(r.venueAllowed(market, null, 1, '2026-11-07'), false, 'a November Saturday');
  // A restaurant's "live music every Friday" is not its only day; stored hours always win.
  assert.equal(r.listedWeekdays({ type: 'restaurant', description: 'Live music every Friday.' }), null);
  assert.equal(r.listedWeekdays({ type: 'outdoor', hours: JSON.stringify(open('08:00', '12:00')), description: 'Every Saturday.' }), null);
  const p = run(build('this weekend in Penticton'));
  for (const day of p.days) for (const s of day.stops) if (s.venue && s.venue.id === market.id) assert.equal(day.date, '2026-10-24', 'the market only on the Saturday');
});

test('Impossible stops (round 11): one round of golf a day; outfitters are booked, not walk-ins', () => {
  const g1 = { daypart: 'morning', label: 'Morning', venue: { id: 9001, type: 'golf', name: 'Course A' } };
  const g2 = { daypart: 'afternoon', label: 'Afternoon', venue: { id: 9002, type: 'golf', name: 'Course B' }, alternates: [{ venue: { id: 9003, type: 'golf', name: 'Course C' } }, { venue: { id: 9004, type: 'distillery', name: 'Distillery' }, why: ['x'] }] };
  const result = { days: [{ day: 1, stops: [g1, { daypart: 'midday', venue: { id: 9005, type: 'restaurant' } }, g2] }] };
  tp.oneRoundADay(result);
  assert.equal(result.days[0].stops[2].venue.type, 'distillery');
  assert.equal(result.days[0].stops[2].daypart, 'afternoon');
  const result2 = { days: [{ day: 1, stops: [{ ...g1 }, { daypart: 'afternoon', label: 'Afternoon', venue: { id: 9002, type: 'golf', name: 'B' } }] }] };
  tp.oneRoundADay(result2);
  assert.equal(result2.days[0].stops[1].venue, null, 'free time when nothing else was offered');
  const hoodoo = { type: 'outdoor', name: 'Hoodoo Adventure Company', description: 'Penticton’s outdoor-adventure outfitter for guided tours and rentals. Book a guide or grab the gear.' };
  assert.equal(tp.bookedOutfitter(hoodoo), true);
  assert.equal(tp.bookedOutfitter({ type: 'outdoor', name: 'Al-ways Fishing Charters', description: 'Fishing charters on Okanagan Lake.' }), true);
  assert.equal(tp.bookedOutfitter({ type: 'outdoor', name: 'Skaha Bluffs', description: 'Rock climbing and hiking trails.' }), false);
});

test('Impossible stops (round 11): "road trip through the Okanagan" is a 3-day drive north to south; "through" is not an interest', () => {
  const b = build('road trip through the Okanagan Valley');
  assert.deepEqual(b.intent.textTerms, []);
  assert.deepEqual(b.intent.regions, ['vernon', 'osoyoos']);
  const p = run(b);
  assert.equal(p.days.length, 3);
  assert.equal([].concat(p.days[0].regions || p.days[0].region)[0], 'vernon');
  assert.equal([].concat(p.days[2].regions || p.days[2].region).slice(-1)[0], 'osoyoos');
  assert.doesNotMatch(p.summary, /through|valley/);
  // The round 10 lengths are unchanged.
  assert.equal(run(build('Kelowna to Osoyoos road trip', { startDate: '2026-10-31' })).days.length, 2);
});

// ---- 6. Smaller fixes ----
test('Smaller (round 11): a multi-date event shows the date of its own day; evening venues are not daytime stops', () => {
  const e = { id: 1, name: 'Garth Brooks Tribute', dateLabel: 'Fri Nov 6 + 1 more date', startDate: '2026-11-07', endDate: '2026-11-07' };
  assert.equal(tp.eventOnDay(e, '2026-11-07').dateLabel, 'Sat Nov 7');
  const single = { id: 2, name: 'Moontricks', dateLabel: 'Fri Nov 6', startDate: '2026-11-06', endDate: '2026-11-06' };
  assert.equal(tp.eventOnDay(single, '2026-11-06'), single);
  const show = located({ id: 7401, name: 'Garth Brooks Tribute', region: 'vernon', time: '7 pm', date: '2026-11-07', categories: ['live-music'] });
  show.dateLabel = 'Fri Nov 6 + 1 more date';
  const b = build('2 days in Vernon with live music', { startDate: '2026-11-06' });
  const p = tp.planTrip({ intent: b.intent, trip: null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: '2026-11-06', events: [show] });
  const stop = allStops(p).find((s) => s.event && s.event.id === 7401);
  if (stop) assert.equal(stop.event.dateLabel, 'Sat Nov 7');
  assert.equal(tp.eveningOnlyVenue({ type: 'indoor', name: 'Kelowna Comedy Club' }), true);
  assert.equal(tp.eveningOnlyVenue({ type: 'indoor', name: 'The Dream Theatre' }), true);
  assert.equal(tp.eveningOnlyVenue({ type: 'indoor', name: 'Kelowna Heritage Museum' }), false);
  const club = add({ name: 'Kelowna Comedy Club', region: 'kelowna', type: 'indoor', rating: 5, hours: open('10:00', '23:00') });
  const day = run(build('a day in Kelowna', { startDate: '2026-10-24' }));
  for (const s of allStops(day)) if (s.venue && s.venue.id === club.id) assert.ok(['evening', 'night'].includes(s.daypart), `comedy club in the ${s.daypart}`);
});

test('Smaller (round 11): a dinner before a show can be swapped again and again', () => {
  const far = add({ name: 'Kelowna Far Bistro', region: 'kelowna', type: 'restaurant', rating: 4.9, hours: open('16:00', '22:00'), dLat: 0.09 });
  const show = located({ id: 7501, name: 'Comedy at the Hall', region: 'kelowna', time: '7:30 pm', date: '2026-10-24', description: 'Stand-up comedy.' });
  const p = { kind: 'itinerary', days: [], itinerary: { stops: [
    { kind: 'venue', daypart: 'evening', label: 'Dinner', venue: { id: far.id, type: 'restaurant', name: far.name, region: 'kelowna' }, keepStart: 1035, swapSlot: true },
    { kind: 'event', daypart: 'evening', label: 'Show', event: show },
  ] }, notes: [], warnings: [] };
  const input = { facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('dinner and a show in Kelowna', TAXONOMY), tripDate: '2026-10-24' };
  tp.scheduleTripByHours(p, input, { items: [], conflicts: [], startDate: '2026-10-24', startMinutes: null });
  const row = p.schedule.find((x) => x.venueId != null);
  assert.notEqual(row.status, 'unmet', p.warnings.join(' | '));
  assert.ok(row.endMinutes <= 19 * 60, 'ends in time for the show');
  // Variety: the nudge is small, fixed for a request, and only for places to eat and drink.
  const k1 = FACTS.find((v) => v.name === 'Kelowna Kitchen 1');
  const n1 = tp.varietyNudge(k1, { queryText: 'a day in kelowna' });
  assert.ok(n1 >= 0 && n1 < 4);
  assert.equal(tp.varietyNudge(k1, { queryText: 'a day in kelowna' }), n1);
  assert.equal(tp.varietyNudge(FACTS.find((v) => v.type === 'winery'), { queryText: 'a day in kelowna' }), 0);
});

test('Smaller (round 11): the page: day tabs clear the sticky bars, one status line, one full stop, no wrong area tag', () => {
  const page = require('../trip-planner-v3-page.js');
  const html = page.renderTripPlannerV3Page({ esc: (s) => String(s == null ? '' : s), title: 't', description: 'd', canonical: '/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  assert.match(html, /\.t3-day \{ margin: 0 0 30px; scroll-margin-top: 140px; \}/);
  const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('function shortShown('));
  assert.match(main, /var planStatus = document\.getElementById\('t3PlanStatus'\); if \(planStatus\) planStatus\.textContent = '';/);
  assert.match(main, /var stopped = function\(t\)\{ return \/\[\.!\?…\]\$\/\.test\(t\) \? t : t \+ '\.'; \};/);
  assert.match(main, /stopped\('Swapped ' \+ oldName \+ ' for ' \+ ns\.venue\.name\)/);
  assert.match(main, /h\.group\.key !== mh\.group\.key/);
});

// ---- Server: runTripPlan on a throwaway fixture database (run `git checkout -q okanagan.db` afterwards) ----
const SRV = (() => {
  let app = null;
  return () => {
    if (app) return app;
    const fs = require('node:fs');
    const DB_FILE = require('node:path').join(__dirname, '..', 'okanagan.db');
    if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
    process.env.TRIP_PLANNER_V3 = 'on';
    app = require('../server.js');
    const hours = JSON.stringify(open('11:00', '22:00'));
    let n = 0;
    const mk = (o) => app.createVenue({ slug: `r11-fixture-${++n}`, description: 'A fixture place used only by the round 11 tests.', hours, ...o });
    for (const [region, lat, lng] of [['kelowna', 49.888, -119.496], ['penticton', 49.49, -119.59]]) {
      for (let i = 0; i < 4; i++) mk({ name: `R11 ${region} Kitchen ${i + 1}`, region, type: 'restaurant', latitude: lat + i / 500, longitude: lng, rating: 4.5 });
      mk({ name: `R11 ${region} Brewing`, region, type: 'brewery', latitude: lat + 0.003, longitude: lng, rating: 4.6 });
      mk({ name: `R11 ${region} Lounge`, region, type: 'cocktail', latitude: lat + 0.004, longitude: lng, rating: 4.6, hours: JSON.stringify(open('16:00', '23:59')) });
      mk({ name: `R11 ${region} Museum`, region, type: 'indoor', latitude: lat + 0.005, longitude: lng, rating: 4.5, hours: JSON.stringify(open('10:00', '17:00')) });
      mk({ name: `R11 ${region} Cafe`, region, type: 'cafe', latitude: lat + 0.006, longitude: lng, rating: 4.5, hours: JSON.stringify(open('07:00', '16:00')), description: 'Coffee and pastries.' });
      mk({ name: `R11 ${region} Winery`, region, type: 'winery', latitude: lat + 0.007, longitude: lng, rating: 4.7, hours: JSON.stringify(open('10:00', '18:00')) });
    }
    return app;
  };
})();
const event = (app, o) => {
  const r = app.createEvent({ region: o.region, description: o.description || 'A round 11 fixture event.', source_type: 'official_venue', source_name: `${o.name} Hall`, source_url: `https://example.com/r11-${encodeURIComponent(o.name)}`, venue_name_text: `${o.name} Hall`, categories: o.categories, name: o.name, occurrences: o.occurrences }, { reason: 'round 11 planner fixture', batch_id: 'test-r11-planner' });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.event.id;
};
const MONDAY = new Date('2030-10-14T19:00:00Z');

test('Server (round 11): time windows and this weekend keep the town and are dated', () => {
  const app = SRV();
  const wk = app.runTripPlan({ text: 'this weekend in Penticton' }, MONDAY);
  assert.equal(wk.kind, 'multi_day');
  assert.deepEqual(wk.days.map((x) => x.date), ['2030-10-19', '2030-10-20']);
  assert.deepEqual(wk.understood.base.map((b) => b.slug), ['penticton']);
  const eve = app.runTripPlan({ text: 'Saturday evening in Penticton' }, MONDAY);
  assert.equal(eve.kind, 'itinerary');
  assert.match(eve.summary, /^Saturday evening in Penticton: /);
  assert.deepEqual(eve.understood.base.map((b) => b.slug), ['penticton']);
  for (const row of eve.schedule.filter((x) => x.venueId)) assert.ok(row.startMinutes >= 17 * 60, `${row.venueId} at ${row.startMinutes}`);
});

test('Server (round 11): a comedy request finds a comedian listed under Live Music; with kids, family events come first', () => {
  const app = SRV();
  const ron = event(app, { name: 'R11 The Noise Between Our Ears', region: 'kelowna', categories: ['live-music'], description: "Canada's #1 stand-up road warrior, making sense of the world in the language of laughs.", occurrences: [{ start_date: '2030-10-30', start_time: '19:30', end_time: '21:30' }] });
  const p = app.runTripPlan({ text: 'comedy night in Kelowna on Oct 30' }, MONDAY);
  const ids = JSON.stringify(p).match(/"id":\d+/g) || [];
  assert.ok(ids.includes(`"id":${ron}`), `${p.kind}: ${p.summary} ${JSON.stringify(p.warnings)}`);
  const flight = event(app, { name: 'R11 Halloween Cocktail Flight at the Brewery', region: 'kelowna', categories: ['food-drink-events', 'holiday-seasonal'], occurrences: [{ start_date: '2030-10-25', start_time: '17:00' }] });
  const bash = event(app, { name: 'R11 Family Halloween Bash', region: 'kelowna', categories: ['family-kids', 'holiday-seasonal'], occurrences: [{ start_date: '2030-10-26', start_time: '13:00' }] });
  const fam = app.runTripPlan({ text: 'Halloween en famille à Kelowna' }, MONDAY);
  const list = (fam.events || []).map((e) => e.id);
  assert.ok(list.includes(bash), JSON.stringify(fam.events));
  assert.ok(!list.includes(flight), 'a cocktail flight is not a family event');
});

test('Server (round 11): "Christmas in Penticton" plans the holiday markets on its dates', () => {
  const app = SRV();
  const a = event(app, { name: 'R11 Last Chance Holiday Market', region: 'penticton', categories: ['markets-fairs'], occurrences: [{ start_date: '2030-12-14', start_time: '10:00', end_time: '15:00' }] });
  const b = event(app, { name: 'R11 Bench Santa Craft Sale', region: 'penticton', categories: ['markets-fairs'], occurrences: [{ start_date: '2030-12-15', start_time: '11:00', end_time: '15:00' }] });
  const p = app.runTripPlan({ text: 'Christmas in Penticton Dec 14-15' }, MONDAY);
  const planned = p.days.flatMap((x) => x.stops).filter((s) => s.event).map((s) => s.event.id);
  assert.ok(planned.includes(a) && planned.includes(b), `${p.summary} ${JSON.stringify(planned)}`);
});
