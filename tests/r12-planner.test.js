// Build My Trip, round 12 (2026-10-20): evening / weekend windows ("tonight in Kelowna", "Friday night", "this weekend
// with kids"), past windows roll to tomorrow, French planner copy and parsing (« 1er », « à travers », « ou », « et »,
// « un dernier verre »), untimed markets in the daytime, outfitters and appointment-only wineries out of walk-in slots,
// events named in multi-day summaries, less repetition, and the smaller fixes from
// drafts/site-review-2026-10-20-pass11.md. PURE tests on a small fixture valley (copied from r11-planner.test.js),
// plus the page's serialized helpers run in a vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const { t3FrenchText, t3FrenchPlan, t3FrenchStory } = require('../trip-french-copy.js');

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

// ---- Round 11 fixture additions (copied) ----
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


// ---- 1. Windows ----
test('Windows (round 12): "tonight", "Friday night", « ce soir », « vendredi soir » are evening plans in the town', () => {
  const cases = [
    ['tonight in Kelowna', '2026-10-19', false],
    ['Friday night in Kelowna', '2026-10-23', false],
    ['Saturday night in Penticton', '2026-10-24', false],
    ['ce soir à Kelowna', '2026-10-19', true],
    ['vendredi soir à Kelowna', '2026-10-23', true],
  ];
  for (const [q, date, french] of cases) {
    const b = build(q, { french });
    assert.equal(b.requirements.timeWindow, 'evening', q);
    assert.equal(b.requirements.startDate, date, q);
    assert.equal(b.requirements.startMinutes, 17 * 60, q);
    const p = run(b);
    assert.equal(p.kind, 'itinerary', q);
    const town = b.intent.regions[0];
    const stops = shortStops(p).filter((s) => s.venue);
    assert.ok(stops.length >= 2, q);
    for (const s of stops) {
      assert.equal(s.venue.region, town, `${q}: ${s.venue.name}`);
      const row = rowFor(p, 1, s);
      assert.ok(row && row.startMinutes >= 17 * 60, `${q}: ${s.venue.name} at ${row && row.startMinutes}`);
    }
  }
  // "tonight at 7 pm" keeps the Ideas list, timed by the clock.
  assert.equal(build('tonight at 7 pm in Kelowna').requirements.timeWindow, undefined);
});

test('Windows (round 12): "this weekend in X with kids / with the family" keeps the weekend window', () => {
  for (const q of ['this weekend in Kelowna with kids', 'this weekend in Kelowna with the family', 'this weekend in Penticton with family']) {
    const b = build(q);
    assert.equal(b.requirements.startDate, '2026-10-24', q);
    assert.equal(b.requirements.items.find((i) => i.kind === 'days').value, 2, q);
    const p = run(b);
    assert.equal(p.kind, 'multi_day', q);
    assert.deepEqual(p.days.map((x) => x.date), ['2026-10-24', '2026-10-25'], q);
  }
});

test('Windows (round 12): an undated window already over today rolls to tomorrow', () => {
  const at = (q, minutes) => { const b = build(q); const moved = r.rollPastTimeWindow(b.requirements, { date: '2026-10-19', minutes }); return [moved, b.requirements.startDate]; };
  assert.deepEqual(at('an afternoon in Kelowna', 18 * 60 + 45), [true, '2026-10-20']);
  assert.deepEqual(at('an afternoon in Kelowna', 14 * 60), [false, null]);
  assert.deepEqual(at('morning in Peachland', 13 * 60), [true, '2026-10-20']);
  assert.deepEqual(at('one evening in Kelowna', 20 * 60), [false, null]);
  assert.deepEqual(at('one evening in Kelowna', 23 * 60), [true, '2026-10-20']);
  // A dated window is left alone.
  assert.deepEqual(at('Saturday evening in Penticton', 23 * 60), [false, '2026-10-24']);
});

// ---- 3. Untimed markets, outfitters, appointment-only wineries ----
const HOODOO = add({ name: 'Penticton Adventure Company', region: 'penticton', type: 'outdoor', rating: 5, desc: 'Penticton’s outdoor-adventure outfitter for guided tours and rentals. Book a guide or grab the gear.', dLat: 0.002 });
for (let i = 4; i <= 5; i++) add({ name: `Kelowna Ridge Winery ${i}`, region: 'kelowna', type: 'winery', rating: 4.6, hours: open('10:00', '18:00'), dLat: 0.012 * i, dLng: 0.01 });
const LANE = add({ name: 'Kelowna Lane Winery', region: 'kelowna', type: 'winery', rating: 5, hours: open('10:00', '17:00'), desc: 'A gravity-flow winery on the hillside. Tastings are $200 per person, by appointment only.', dLat: 0.013, dLng: 0.01 });
test('Untimed markets (round 12): a market with no listed time is a daytime visit, never after dinner; outfitters are not fillers', () => {
  const events = [
    { ...located({ id: 7601, name: 'West Bench Holiday Market', region: 'penticton', time: '10 am', date: '2026-12-12', categories: ['markets-fairs'] }) },
    { ...located({ id: 7602, name: 'The Last Chance Holiday Market', region: 'penticton', time: undefined, date: '2026-12-13', categories: ['markets-fairs'] }) },
  ];
  const b = build('Christmas in Penticton, 2 days', { startDate: '2026-12-12' });
  const p = tp.planTrip({ intent: b.intent, trip: null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: '2026-12-12', events, holidayEvents: true });
  const last = allStops(p).find((s) => s.event && s.event.id === 7602);
  assert.ok(last, p.days.map((x) => x.stops.map((s) => (s.event || s.venue || {}).name).join(', ')).join(' / '));
  assert.ok(['morning', 'afternoon'].includes(last.daypart), `the untimed market is in the ${last.daypart}`);
  const day2 = p.days[1].stops;
  const dinnerAt = day2.findIndex((s) => s.daypart === 'evening' && s.venue);
  assert.ok(dinnerAt < 0 || day2.indexOf(last) < dinnerAt, 'before dinner');
  assert.ok(!allStops(p).some((s) => s.venue && s.venue.id === HOODOO.id), 'no outfitter as a filler');
  assert.equal(tp.daytimeEvent({ name: 'Night Market' }), false);
  assert.equal(tp.daytimeEvent({ name: 'Craft Culture Holiday Market' }), true);
});

test('Appointment only (round 12): a by-appointment winery is not a walk-in tasting; its own notice is shown', () => {
  assert.equal(tp.appointmentOnly(LANE), true);
  assert.equal(tp.appointmentNotice(LANE), 'Tastings are $200 per person, by appointment only.');
  assert.equal(tp.appointmentOnly({ type: 'winery', description: 'Walk-ins welcome; groups by appointment.' }), false);
  assert.equal(tp.appointmentOnly({ type: 'winery', advisory: { note: 'Tastings are by appointment. https://x.example' }, description: '' }), true);
  for (const q of ['a day of wine tasting in Kelowna', '2 days in Kelowna with wineries']) {
    const p = run(build(q, { startDate: '2026-10-24' }));
    assert.ok(!allStops(p).some((s) => s.venue && s.venue.id === LANE.id), `${q}: ${allStops(p).map((s) => (s.venue || s.event || {}).name).join(', ')}`);
  }
  const stop = tp.planTrip({ intent: d.interpretDiscoveryQuery('Kelowna Lane Winery', TAXONOMY), requirements: null, facts: [LANE], labels: LABELS, text: 'Kelowna Lane Winery' });
  const caveats = (stop.recommendations || []).flatMap((s) => s.caveats || []);
  const c = caveats.find((x) => /^By appointment/.test(x));
  assert.ok(c, JSON.stringify(caveats));
  assert.equal(t3FrenchText(c), 'Sur rendez-vous, selon la fiche (texte original) : « Tastings are $200 per person, by appointment only. » Réservez à l’avance.');
});

// ---- 6. Meals ----
const DONUTS = add({ name: 'Vernon Fair Concessions', region: 'vernon', type: 'restaurant', rating: 5, price: 3, hours: open('10:00', '22:00'), desc: 'Mini donuts at the fair.' });
DONUTS.cuisineLabel = 'Dessert'; DONUTS.textCuisine = 'dessert';
test('Meals (round 12): a dessert stand or concession is never lunch or dinner', () => {
  assert.equal(tp.notAMeal(DONUTS), true);
  assert.equal(tp.notAMeal({ type: 'restaurant', name: 'Ogopogo Concessions', textName: 'ogopogo concessions' }), true);
  assert.equal(tp.notAMeal({ type: 'restaurant', name: 'Vernon Kitchen 1', textName: 'vernon kitchen 1', cuisineLabel: 'Canadian' }), false);
  for (const q of ['2 days in Vernon', 'a day in Vernon', 'one evening in Vernon']) {
    const p = run(build(q, { startDate: '2026-11-07' }));
    assert.ok(!allStops(p).some((s) => s.venue && s.venue.id === DONUTS.id), `${q}: ${allStops(p).map((s) => (s.venue || s.event || {}).name).join(', ')}`);
  }
});

// ---- 4. Multi-day summaries name the events ----
test('Summaries (round 12): a multi-day summary names its events and their real towns', () => {
  const shows = [
    located({ id: 7701, name: 'Moontricks', region: 'kelowna', time: '7:30 pm', date: '2026-11-06', categories: ['live-music'] }),
    { ...located({ id: 7702, name: 'The Legend of Garth Brooks Tribute', region: 'west-kelowna', time: '7 pm', date: '2026-11-07', categories: ['live-music'] }), location: { lat: 49.863, lng: -119.583 } },
  ];
  const b = build('2 days in Kelowna in November with shows and live music', { startDate: '2026-11-06' });
  const p = tp.planTrip({ intent: b.intent, trip: null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: '2026-11-06', events: shows });
  const text = p.experience.text;
  const planned = allStops(p).filter((s) => s.event).map((s) => s.event.id);
  assert.ok(planned.includes(7702), JSON.stringify(planned));
  assert.match(text, /It includes Moontricks in Kelowna and The Legend of Garth Brooks Tribute in West Kelowna\./, text);
  assert.doesNotMatch(text, /all in Kelowna/, text);
  const mk = (id, name, date, time) => ({ ...located({ id, name, region: 'kelowna', time, date, categories: ['markets-fairs'] }), endDate: date });
  const events = [mk(7711, 'Christkindl Holiday Market', '2026-12-05', '2 pm'), mk(7712, 'Craft Culture Holiday Market', '2026-12-06', '1 pm')];
  const m = build('Christmas markets in Kelowna in December, 2 days', { startDate: '2026-12-05' });
  const mp = tp.planTrip({ intent: m.intent, trip: null, requirements: m.requirements, facts: FACTS, labels: LABELS, text: m.text, tripDate: '2026-12-05', events });
  assert.match(mp.experience.text, /It includes the Christkindl Holiday Market and the Craft Culture Holiday Market, in Kelowna\./, mp.experience.text);
});

// ---- 5. Repetition ----
test('Repetition (round 12): the top picks rotate by request, within a small fixed nudge', () => {
  const qs = ['weekend in Kelowna', '2 days in Kelowna', '3 days in Kelowna', 'weekend in Kelowna in March', 'a day in Kelowna', 'first time in Kelowna, 2 days'];
  const days = qs.map((q) => { const p = run(build(q, { startDate: '2026-10-24' })); return (p.days && p.days[0] ? p.days[0].stops : shortStops(p)).filter((s) => s.venue).map((s) => s.venue.id).join('>'); });
  assert.ok(new Set(days).size >= 3, days.join('\n'));
  const k = FACTS.find((v) => v.name === 'Kelowna Ridge Winery 1');
  const n = tp.rotationNudge(k, { queryText: 'weekend in kelowna' });
  assert.ok(n >= 0 && n < 4);
  assert.equal(tp.rotationNudge(k, { queryText: 'weekend in kelowna' }), n, 'fixed for a request');
  assert.ok(tp.rotationNudge(FACTS.find((v) => v.name === 'Kelowna Kitchen 1'), { queryText: 'x' }) < 3);
  assert.equal(tp.rotationNudge(k, {}), 0);
});

// ---- 2. French copy and parsing ----
test('French (round 12): « 1er » dates, « à travers », slot labels with « ou », day tabs with « et », « un dernier verre »', () => {
  assert.equal(fr.tripPlannerText('Kelowna le 1er novembre', TAXONOMY), 'kelowna the 1 november');
  assert.equal(r.tripCalendar(fr.tripPlannerText('Kelowna le 1er novembre', TAXONOMY), '2026-10-19').startDate, '2026-11-01');
  const trip = build('road trip à travers l’Okanagan', { french: true });
  assert.deepEqual(trip.intent.textTerms, []);
  assert.equal(t3FrenchText('wineries, breweries or cocktail lounges'), 'vignobles, microbrasseries ou bars à cocktails');
  assert.equal(t3FrenchText('Cocktail lounges, pubs or breweries'), 'Bars à cocktails, pubs ou microbrasseries');
  assert.equal(t3FrenchText('outdoor destinations or indoor & rainy day spots'), 'lieux de plein air ou lieux intérieurs et jours de pluie');
  assert.equal(t3FrenchText('wineries or breweries'), 'vignobles ou microbrasseries');
  assert.equal(t3FrenchText('Something to eat between the tastings'), 'De quoi manger entre les dégustations');
  assert.equal(t3FrenchText('Its listed hours only overlap part of the evening — check before you go'), 'Ses horaires indiqués ne couvrent qu’une partie de la soirée — vérifiez avant de partir');
  assert.equal(t3FrenchText('A Christmas event on your dates'), 'Un événement de Noël à vos dates');
  assert.match(t3FrenchText('Advisory on Okanagan Roam: Tastings are by appointment.'), /^Avis d’Okanagan Roam : Visites ou dégustations sur rendez-vous seulement\./);
  assert.doesNotMatch(t3FrenchText('Advisory on Okanagan Roam: The road to the summit is closed for paving.'), /[Tt]he road/);
  // The venue's own French notice wins.
  const plan = t3FrenchPlan({ kind: 'itinerary', summary: 'x', itinerary: { stops: [
    { daypart: 'evening', label: 'wineries, breweries or cocktail lounges', venue: { id: 1, name: 'Daydreamer', type: 'winery', advisoryFr: { en: 'Advisory on Okanagan Roam: Tastings are by appointment.', fr: 'Avis d’Okanagan Roam : Dégustations sur rendez-vous.' } }, caveats: ['Advisory on Okanagan Roam: Tastings are by appointment.'] },
    { daypart: 'evening', label: 'Dinner', venue: { id: 2, name: 'Old Vines', type: 'restaurant' } },
    { daypart: 'evening', label: 'cocktail lounges, pubs or breweries', venue: { id: 3, name: 'Cannery Brewing Co.', type: 'pub' } },
  ] }, experience: { text: 'x' } });
  assert.equal(plan.itinerary.stops[0].caveats[0], 'Avis d’Okanagan Roam : Dégustations sur rendez-vous.');
  assert.equal(plan.itinerary.stops[0].label, 'vignobles, microbrasseries ou bars à cocktails');
  assert.match(plan.experience.text, /puis un souper à Old Vines, et se termine par un dernier verre à Cannery Brewing Co\. Les horaires/);
  assert.doesNotMatch(plan.experience.text, /Co\.\./);
  // The stop carries the French notice for the page.
  const adv = add({ name: 'Kelowna Appointment Cellars', region: 'kelowna', type: 'winery', rating: 3.5, hours: open('10:00', '17:00') });
  adv.advisory = { note: 'Tastings are by appointment. https://example.com/x', noteFr: 'Dégustations sur rendez-vous.' };
  const rec = tp.planTrip({ intent: d.interpretDiscoveryQuery('Kelowna Appointment Cellars', TAXONOMY), requirements: null, facts: [adv], labels: LABELS, text: 'Kelowna Appointment Cellars' });
  assert.deepEqual(rec.recommendations[0].venue.advisoryFr, { en: 'Advisory on Okanagan Roam: Tastings are by appointment.', fr: 'Avis d’Okanagan Roam : Dégustations sur rendez-vous.' });
});

test('Page (round 12): French day tabs use « et », labels wrap, no tiny free intervals, the sunset margin only near sunset', () => {
  const page = require('../trip-planner-v3-page.js');
  const html = page.renderTripPlannerV3Page({ esc: (s) => String(s == null ? '' : s), title: 't', description: 'd', canonical: '/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const s of scripts) new vm.Script(s);
  const main = scripts.find((s) => s.includes('function shortShown('));
  assert.match(main, /String\(d\.regionLabel\)\.replace\(\/ and \/g, ' et '\)/);
  assert.match(html, /\.t3-card-top > span \{ min-width: 0; max-width: 100%; overflow-wrap: anywhere; \}/);
  assert.match(main, /if\(row\.gapMinutes>=10\)detail\.push/);
  assert.match(main, /row\.daylight\.sunsetMinutes-row\.endMinutes>120/);
  // The double full stop regex survives the template literal.
  assert.match(main, /replace\(\/\(\[\^\.\]\)\\\.\\\.\(\?=\\s\|\$\)\/g, '\$1\.'\)/);
  const re = /([^.])\.\.(?=\s|$)/g;
  assert.equal('at Cannery Brewing Co.. Next'.replace(re, '$1.'), 'at Cannery Brewing Co. Next');
  assert.equal('Wait...'.replace(re, '$1.'), 'Wait...');
  // The serialized French helpers run in the page.
  const ctx = vm.createContext({});
  // Round 15c: t3FrenchText calls t3FrenchHeading, which ships with its lookups (as the page does).
  const frc = require('../trip-french-copy.js');
  const headingSrc = ['FR_HEADING_NAMES', 'FR_HEADING_DAYS', 'FR_HEADING_PARTS', 'FR_HEADING_OCCASIONS', 'FR_HEADING_WHEN_RE'].map((k) => `var ${k} = ${JSON.stringify(frc[k])};`).join('\n') + `\n${frc.frHeadingWhen.toString()}\n${frc.frHeadingWhere.toString()}\n${frc.t3FrenchHeading.toString()}\n`;
  vm.runInContext(`${headingSrc}${t3FrenchText.toString()}; var out = t3FrenchText('wineries, breweries or cocktail lounges');`, ctx);
  assert.equal(ctx.out, 'vignobles, microbrasseries ou bars à cocktails');
});

// ---- 6. Smaller ----
test('Smaller (round 12): trails are timed by length without planner text; a swapped stop keeps its summary true; beaches', () => {
  const desc = 'Naramata Creek Park is the village’s waterfall walk: a 2.5 km round trip on an unpaved, packed trail up the forested creek.';
  assert.equal(tp.trailMinutes({ type: 'outdoor', plannerDescription: null, trailText: desc }), 60);
  const plan = { kind: 'itinerary', experience: { title: 'What to expect', text: 'Head indoors for a visit, then try a local craft beer, and stop for coffee.' } };
  tp.swapVerb(plan, { type: 'brewery' }, { type: 'winery' });
  assert.equal(plan.experience.text, 'Head indoors for a visit, then enjoy a wine tasting, and stop for coffee.');
  const first = { kind: 'itinerary', experience: { text: 'Try a local craft beer, then sit down for dinner.' } };
  tp.swapVerb(first, { type: 'brewery' }, { type: 'winery' });
  assert.equal(first.experience.text, 'Enjoy a wine tasting, then sit down for dinner.');
  // A time-window stop does not claim it was asked for by kind.
  const p = run(build('Saturday evening in Penticton'));
  for (const s of shortStops(p)) assert.ok(!(s.why || []).some((w) => /^Matches your request for/.test(w)), JSON.stringify(s.why));
  // August beach day: more than one beach, and no café right after lunch.
  ['Gyro', 'Rotary', 'Strathcona'].forEach((n, i) => add({ name: `${n} Beach Park`, region: 'kelowna', type: 'beach', rating: 4.55 - i * 0.05, desc: 'A sandy beach on Okanagan Lake with swimming.', dLat: 0.006 * (i + 1) }));
  const beach = run(build('beach day in Kelowna in August'), { tripDate: '2026-08-15' });
  const stops = beach.days[0].stops.filter((s) => s.venue);
  assert.ok(stops.filter((s) => s.venue.type === 'beach').length >= 2, stops.map((s) => s.venue.name).join(', '));
  const lunch = stops.findIndex((s) => s.daypart === 'midday');
  if (lunch >= 0 && stops[lunch + 1]) assert.notEqual(stops[lunch + 1].venue.type, 'cafe');
  // "wine tasting in West Kelowna then dinner in Kelowna, 3 days": wineries in West Kelowna, dinner in Kelowna, every day.
  const wk = run(build('wine tasting in West Kelowna then dinner in Kelowna, 3 days', { startDate: '2026-11-06' }));
  assert.equal(wk.days.length, 3);
  for (const day of wk.days) {
    const dinner = day.stops.find((s) => s.daypart === 'evening' && s.venue);
    assert.equal(dinner && dinner.venue.region, 'kelowna', `day ${day.day} dinner`);
    for (const s of day.stops.filter((x) => x.venue && x.venue.type === 'winery')) assert.equal(s.venue.region, 'west-kelowna', `day ${day.day}: ${s.venue.name}`);
  }
});

// ---- Server: runTripPlan / My Trip on a throwaway fixture database (run `git checkout -q okanagan.db` afterwards) ----
const SRV = (() => {
  let app = null;
  return () => {
    if (app) return app;
    const fs = require('node:fs');
    const DB_FILE = require('node:path').join(__dirname, '..', 'okanagan.db');
    if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
    process.env.TRIP_PLANNER_V3 = 'on';
    app = require('../server.js');
    let n = 0;
    const mk = (o) => app.createVenue({ slug: `r12-fixture-${++n}`, description: 'A fixture place used only by the round 12 tests.', hours: JSON.stringify(open('11:00', '22:00')), ...o });
    for (const [region, lat, lng] of [['kelowna', 49.888, -119.496], ['penticton', 49.49, -119.59]]) {
      for (let i = 0; i < 4; i++) mk({ name: `R12 ${region} Kitchen ${i + 1}`, region, type: 'restaurant', latitude: lat + i / 500, longitude: lng, rating: 4.5, features: { kid_friendly: true } });
      mk({ name: `R12 ${region} Brewing`, region, type: 'brewery', latitude: lat + 0.003, longitude: lng, rating: 4.6 });
      mk({ name: `R12 ${region} Lounge`, region, type: 'cocktail', latitude: lat + 0.004, longitude: lng, rating: 4.6, hours: JSON.stringify(open('16:00', '23:59')) });
      mk({ name: `R12 ${region} Museum`, region, type: 'indoor', latitude: lat + 0.005, longitude: lng, rating: 4.5, hours: JSON.stringify(open('10:00', '17:00')) });
      mk({ name: `R12 ${region} Cafe`, region, type: 'cafe', latitude: lat + 0.006, longitude: lng, rating: 4.5, hours: JSON.stringify(open('07:00', '16:00')), description: 'Coffee and pastries.' });
      mk({ name: `R12 ${region} Winery`, region, type: 'winery', latitude: lat + 0.007, longitude: lng, rating: 4.7, hours: JSON.stringify(open('10:00', '18:00')) });
      mk({ name: `R12 ${region} Park`, region, type: 'outdoor', latitude: lat + 0.008, longitude: lng, rating: 4.6, hours: null, description: 'A lakeside park with an easy 2 km loop trail.' });
    }
    return app;
  };
})();
const MONDAY_NOON = new Date('2030-10-14T19:00:00Z'); // 12:00 PM Pacific (UTC−7 from Nov 2026)

test('Server (round 12): "tonight", "Friday night" and « ce soir » are evening plans; a past afternoon rolls to tomorrow', () => {
  const app = SRV();
  for (const [q, date] of [['tonight in Kelowna', '2030-10-14'], ['Friday night in Kelowna', '2030-10-18'], ['ce soir à Kelowna', '2030-10-14']]) {
    const p = app.runTripPlan({ text: q }, MONDAY_NOON);
    assert.equal(p.kind, 'itinerary', `${q}: ${p.kind}`);
    const rows = p.schedule.filter((x) => x.venueId);
    assert.ok(rows.length >= 2, q);
    for (const row of rows) { assert.equal(row.date, date, q); assert.ok(row.startMinutes >= 17 * 60, `${q}: ${row.startMinutes}`); }
  }
  // The page's default 9 AM start does not pull an evening back to the morning.
  const eve = app.runTripPlan({ text: 'one evening in Kelowna', overrides: { startDate: '2030-10-18', startMinutes: 540 } }, MONDAY_NOON);
  for (const row of eve.schedule.filter((x) => x.venueId)) assert.ok(row.startMinutes >= 17 * 60, `${row.venueId} at ${row.startMinutes}`);
  const late = app.runTripPlan({ text: 'an afternoon in Kelowna' }, new Date('2030-10-15T01:45:00Z')); // 6:45 PM Pacific
  assert.equal(late.kind, 'itinerary');
  for (const row of late.schedule.filter((x) => x.venueId)) assert.equal(row.date, '2030-10-15');
  const wk = app.runTripPlan({ text: 'this weekend in Kelowna with kids' }, MONDAY_NOON);
  assert.equal(wk.kind, 'multi_day');
  assert.deepEqual(wk.days.map((x) => x.date), ['2030-10-19', '2030-10-20']);
});

test('Server (round 12): My Trip dates a ski hill by its opening-day event on What’s On', () => {
  const app = SRV();
  const db = require('../db.js');
  const hill = app.createVenue({ slug: 'r12-ski-village-grill', name: 'R12 Ski Village Grill', region: 'big-white', type: 'restaurant', description: 'A fixture restaurant at the hill.', latitude: 49.72, longitude: -118.93, rating: 4.4 });
  db.prepare('INSERT INTO venue_seasons (venue_id, status, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?)').run(hill.id, 'closed', null, 'https://example.com/r12', '2030-10-01');
  const r1 = app.createEvent({ region: 'big-white', description: 'The lifts open for the season.', source_type: 'official_venue', source_name: 'Big White', source_url: 'https://example.com/r12-opening', venue_name_text: 'Big White Ski Resort', categories: ['sports-recreation'], name: 'R12 Big White Opening Day', occurrences: [{ start_date: '2030-11-26', start_time: '08:30', end_time: '15:30' }] }, { reason: 'round 12 planner fixture', batch_id: 'test-r12-planner' });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(app.tripOpeningDayFor('big-white', MONDAY_NOON), { date: '2030-11-26', name: 'R12 Big White Opening Day' });
  assert.equal(app.tripOpeningDayFor('kelowna', MONDAY_NOON), null);
  const on = (d) => app.tripStopsFor([`venue:${hill.id}`], MONDAY_NOON, { [`venue:${hill.id}`]: d })[0].notice;
  // Round 14 (2026-10-20): a January date is in the open season, so there is nothing to warn about (it said
  // "Seasonal — the season opens Nov 26").
  assert.equal(on('2031-01-16'), null);
  const before = on('2030-11-20');
  assert.equal(before.kind, 'closed');
  assert.match(before.text, /Opens Nov 26/);
});
