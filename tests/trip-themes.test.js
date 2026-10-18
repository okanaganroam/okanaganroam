// Build My Trip: wine trips, ski trips, budget requests, filler words, lunch and day maps (2026-10-18).
// The requests are the real ones from the site review (drafts/site-review-2026-10-18.md). PURE tests: the
// planner functions are called directly on a small fixture valley; no server.js, no database.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const v3 = require('../trip-planner-v3-page.js');

const REGIONS = { oliver: 'Oliver', osoyoos: 'Osoyoos', penticton: 'Penticton', naramata: 'Naramata', kelowna: 'Kelowna', 'big-white': 'Big White' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor', 'tour', 'indoor'],
  features: ['dog_friendly', 'kid_friendly'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: [], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    distillery: T('Distillery', 'Distilleries'), golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: {}, featureNouns: {}, collections: {},
};
const CENTRES = { oliver: [49.18, -119.55], osoyoos: [49.03, -119.47], penticton: [49.49, -119.59], naramata: [49.59, -119.59], kelowna: [49.88, -119.49], 'big-white': [49.72, -118.93] };
let nextId = 1;
function fact(o) {
  const id = o.id || nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.4 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: o.price === undefined ? null : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: o.cuisine || null, cuisineLabel: o.cuisine || null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: d.normalizeDiscoveryText(o.cuisine || ''), textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: {}, collections: [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: o.seasonClosed || null, seasonClosedToday: !!o.seasonClosedToday, seasonReopens: o.seasonReopens,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  return v;
}
const open = (from, to) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k) => [k, [[from, to]]]));
const FACTS = [];
const add = (o) => { const v = fact(o); FACTS.push(v); return v; };
// Oliver: eight wineries a few km apart, good restaurants, and the padding the review saw (a coffee chain, fast food, a pub).
for (let i = 0; i < 8; i++) add({ name: `Oliver Estate Winery ${i + 1}`, region: 'oliver', type: 'winery', rating: 4.9 - i * 0.05, dLat: (i % 4) * 0.01, dLng: Math.floor(i / 4) * 0.01, hours: open('10:00', '18:00') });
const CLOSED_SAT = add({ name: 'Oliver Saturday Closed Winery', region: 'oliver', type: 'winery', rating: 5, reviews: 900, hours: { ...open('10:00', '18:00'), sat: [] } });
add({ name: 'Blenz Coffee', region: 'oliver', type: 'cafe', rating: 4.8, price: 2, desc: 'Coffee and espresso.' });
add({ name: 'Pizza 64 (Oliver)', region: 'oliver', type: 'restaurant', rating: 4.8, price: 1 });
add({ name: 'Oliver Burger Counter', region: 'oliver', type: 'restaurant', rating: 4.7, price: 1, desc: 'A smash burger counter.' });
add({ name: 'Oliver Pub', region: 'oliver', type: 'pub', rating: 4.5, price: 2 });
for (let i = 0; i < 4; i++) add({ name: `Oliver Bistro ${i + 1}`, region: 'oliver', type: 'restaurant', rating: 4.6 - i * 0.05, price: i % 2 ? 2 : 3, dLat: 0.01 * i, hours: open('11:00', '22:00') });
add({ name: 'Oliver Low Rated Diner', region: 'oliver', type: 'restaurant', rating: 3.2, price: 2 });
// Osoyoos: wineries, tour companies, restaurants.
for (let i = 0; i < 4; i++) add({ name: `Osoyoos Desert Winery ${i + 1}`, region: 'osoyoos', type: 'winery', rating: 4.7 - i * 0.05, dLat: 0.01 * i });
for (const n of ['Desert Country Wine Tours', 'Corks & Cactus Tours']) add({ name: n, region: 'osoyoos', type: 'tour', rating: null, desc: 'Guided wine tours with a driver.' });
add({ name: 'DeVino Wine Tours', region: 'oliver', type: 'tour', rating: null, desc: 'Wine tours of the Golden Mile.' });
for (let i = 0; i < 3; i++) add({ name: `Osoyoos Grill ${i + 1}`, region: 'osoyoos', type: 'restaurant', rating: 4.5, price: 2 + (i % 2), dLat: 0.01 * i });
// Penticton and Naramata.
for (const region of ['penticton', 'naramata']) {
  for (let i = 0; i < 6; i++) add({ name: `${REGIONS[region]} Bench Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, dLat: 0.01 * (i % 3), dLng: 0.01 * Math.floor(i / 3) });
  for (let i = 0; i < 5; i++) add({ name: `${REGIONS[region]} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 3 - (i % 2), dLat: 0.01 * i });
  add({ name: `${REGIONS[region]} Coffee`, region, type: 'cafe', rating: 4.7, price: 1, desc: 'Coffee and pastries.' });
}
const SUSHI = add({ name: 'Penticton Sushi Bar', region: 'penticton', type: 'restaurant', rating: 4.9, reviews: 800, price: 2, cuisine: 'Sushi' });
const CHEAP = [add({ name: 'Penticton Noodle Shop', region: 'penticton', type: 'restaurant', rating: 4.3, price: 1 }), add({ name: 'Penticton Taco Stand', region: 'penticton', type: 'restaurant', rating: 4.2, price: 1 })];
// Kelowna: a hike, a winery, restaurants and cafes.
add({ name: 'Kelowna Ridge Trail', region: 'kelowna', type: 'outdoor', rating: null, activities: ['hiking'], desc: 'A hiking trail with lookouts.' });
add({ name: 'Kelowna Canyon Trail', region: 'kelowna', type: 'outdoor', rating: null, activities: ['hiking'], dLat: 0.02, desc: 'A hiking trail.' });
add({ name: 'Kelowna Hill Winery', region: 'kelowna', type: 'winery', rating: 4.8 });
add({ name: 'Kelowna Lake Winery', region: 'kelowna', type: 'winery', rating: 4.7, dLat: 0.01 });
for (let i = 0; i < 5; i++) add({ name: `Kelowna Eatery ${i + 1}`, region: 'kelowna', type: 'restaurant', rating: 4.7 - i * 0.05, price: 2 + (i % 2), dLat: 0.005 * i });
add({ name: 'Kelowna Roasters', region: 'kelowna', type: 'cafe', rating: 4.8, price: 1, desc: 'Coffee roastery and cafe.' });
// Big White: the resort (closed today, reopening Nov 26), winter extras and the village's dining.
const RESORT = add({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'The Okanagan big mountain ski resort with skiing on 2,800 acres.', seasonClosed: { from: '2026-10-15', to: '2026-11-25' }, seasonClosedToday: true, seasonReopens: '2026-11-26' });
add({ name: 'Big White Nordic Trails', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Cross country skiing and snowshoe trails.' });
add({ name: 'Big White Tube Park', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Snow tubing lanes.' });
add({ name: 'Happy Valley Skating Rink', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'An outdoor skating rink.' });
add({ name: 'Big White Sleigh Rides', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Horse-drawn sleigh rides.' });
for (const [n, type, rating, price] of [['Snowshoe Sams', 'pub', 4.4, 2], ['The Woods', 'restaurant', 4.2, 2], ['Kettle Valley Steakhouse', 'restaurant', 4.6, 4], ['Fat Marmot', 'restaurant', 4.5, 2], ['Sopra Italian', 'restaurant', 4.7, 3], ['Toasty', 'cafe', 4.7, 1], ['Village Coffee', 'cafe', 4.3, 1]]) add({ name: n, region: 'big-white', type, rating, price, desc: type === 'cafe' ? 'Coffee and breakfast.' : '' });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

function plan(text, opts = {}) {
  const planText = opts.fr ? fr.tripPlannerText(text, TAXONOMY) : text;
  const intent = d.interpretDiscoveryQuery(planText, TAXONOMY);
  const trip = d.interpretTripComponents(planText, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text: planText, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-18' });
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: FACTS, labels: LABELS, text: planText, tripDate: requirements.startDate || '2026-10-18', tripEvents: [] });
  return { p, intent, requirements, planText };
}
const dayStops = (day) => day.stops.filter((s) => s.venue).map((s) => ({ ...s, fact: BY_ID.get(s.venue.id) }));
const allStops = (p) => p.days.flatMap(dayStops);
const km = (a, b) => tp.haversineKm(a.lat, a.lng, b.lat, b.lng);

test('Wine trips: "wineries in Oliver for 2 days" plans two wineries a day, lunch near them and a sit-down dinner, no coffee chain or fast food', () => {
  const { p } = plan('wineries in Oliver for 2 days');
  assert.equal(p.days.length, 2);
  for (const day of p.days) {
    const s = dayStops(day);
    const wineries = s.filter((x) => x.fact.type === 'winery');
    assert.ok(wineries.length >= 2, `day ${day.day}: ${wineries.length} wineries`);
    assert.ok(km(wineries[0].fact, wineries[1].fact) < 15, 'the two wineries are close together');
    const lunch = s.find((x) => x.daypart === 'midday');
    assert.ok(lunch && ['restaurant', 'cafe'].includes(lunch.fact.type), `day ${day.day} has lunch`);
    const dinner = s.find((x) => x.daypart === 'evening');
    assert.equal(dinner && dinner.fact.type, 'restaurant', `day ${day.day} ends at a restaurant`);
    assert.ok(dinner.fact.rating >= 3.8, 'a rated sit-down dinner');
    for (const x of s) assert.ok(!tp.fastFood(x.fact) && !/blenz|pizza 64|burger counter/i.test(x.fact.name), `${x.fact.name} is not a chain or a counter`);
    assert.ok(s.every((x) => x.fact.region === 'oliver'));
  }
  assert.equal(new Set(allStops(p).map((x) => x.fact.id)).size, allStops(p).length, 'no place repeats');
});

test('Wine trips: "wine tour Oliver Osoyoos 2 days" means wineries, not tour companies or a pub', () => {
  const { p, intent } = plan('wine tour Oliver Osoyoos 2 days');
  assert.ok(intent.types.includes('winery') || tp.wineTourMeansWineries('wine tour Oliver Osoyoos 2 days'));
  assert.deepEqual(p.days.map((day) => day.region), ['oliver', 'osoyoos']);
  for (const day of p.days) {
    const s = dayStops(day);
    assert.ok(s.filter((x) => x.fact.type === 'winery').length >= 2, `day ${day.day} visits wineries`);
    assert.ok(!s.some((x) => ['tour', 'pub'].includes(x.fact.type)), s.map((x) => x.fact.name).join(', '));
  }
  assert.ok(!p.requirementResults.some((i) => i.status === 'unmet'), 'nothing reported as missed');
});

test('Wine trips: a tour company, shuttle or driver asked for keeps the tour operators', () => {
  for (const q of ['a wine tour company in Kelowna', 'wine tour with a shuttle in Oliver', 'guided wine tour Kelowna', 'wine tour with a driver']) assert.equal(tp.wineTourMeansWineries(q), false, q);
  for (const q of ['wine tour Oliver Osoyoos 2 days', 'a wine tour in Naramata', 'winery tour this weekend']) assert.equal(tp.wineTourMeansWineries(q), true, q);
  const { p } = plan('wine tour with a shuttle in Oliver');
  assert.ok(!(p.days || []).length || allStops(p).some((x) => x.fact.type === 'tour') || (p.recommendations || []).some((s) => s.venue.type === 'tour'));
});

test('Wine trips: "3-day wine weekend in Penticton and Naramata ... a nice dinner each night" is three days with dinner every night', () => {
  const { p, intent, requirements } = plan('3-day wine weekend in Penticton and Naramata, with great food and a nice dinner each night');
  assert.equal(intent.days, 3, 'a counted length wins over "weekend"');
  assert.equal(requirements.explicitMealCount, null, '"each night" is not one dinner');
  assert.equal(p.days.length, 3);
  for (const day of p.days) {
    const s = dayStops(day);
    assert.ok(s.filter((x) => x.fact.type === 'winery').length >= 2, `day ${day.day}`);
    assert.equal(s.find((x) => x.daypart === 'evening')?.fact.type, 'restaurant', `dinner on day ${day.day}`);
    assert.ok(s.some((x) => x.daypart === 'midday'), `lunch on day ${day.day}`);
  }
});

test('Wine trips: a winery whose listed hours show it closed that day is not planned', () => {
  // October 24, 2026 is a Saturday; the best-rated winery lists Saturday as closed (it is open on Sunday).
  const { p } = plan('wineries in Oliver for 2 days from October 24, 2026');
  assert.ok(dayStops(p.days[0]).filter((x) => x.fact.type === 'winery').length >= 2);
  assert.ok(!dayStops(p.days[0]).some((x) => x.fact.id === CLOSED_SAT.id), 'not on the Saturday');
  assert.ok(dayStops(p.days[1]).some((x) => x.fact.id === CLOSED_SAT.id), 'it can be on the Sunday');
});

test('Wine trips: "one dinner" is still one dinner, and "a winery" is still the general planner', () => {
  const one = plan('A relaxed weekend in Oliver with wineries and one dinner').p;
  assert.equal(allStops(one).filter((x) => x.daypart === 'evening' && x.fact.type === 'restaurant').length, 1);
  assert.equal(tp.tripTheme(tp.buildContext(d.interpretDiscoveryQuery('Plan one day in Kelowna with a winery visit and dinner', TAXONOMY), LABELS, { text: 'Plan one day in Kelowna with a winery visit and dinner' })), null);
});

test('Ski trips: "ski Big White 3 days in January" skis at the resort every day, with lunch and dinner at the hill', () => {
  const { p } = plan('ski Big White 3 days in January');
  assert.equal(p.days.length, 3);
  for (const day of p.days) {
    const s = dayStops(day);
    assert.equal(s.find((x) => x.daypart === 'morning')?.fact.id, RESORT.id, `day ${day.day} is a ski day`);
    assert.ok(s.every((x) => x.fact.region === 'big-white'));
    assert.ok(['restaurant', 'pub'].includes(s.find((x) => x.daypart === 'evening')?.fact.type), 'après and dinner at the hill');
    assert.ok(s.some((x) => x.daypart === 'midday'));
  }
  const extras = allStops(p).filter((x) => x.daypart === 'afternoon').map((x) => x.fact.name);
  assert.ok(extras.some((n) => /tube|skating|sleigh/i.test(n)), extras.join(', '));
  assert.ok(!p.warnings.some((w) => /opens for the season/.test(w)), 'January is after the opening date');
});

test('Ski trips: the resort is planned even while closed today, with a warning when the dates are before it opens', () => {
  const now = plan('ski trip Big White').p;
  assert.equal(dayStops(now.days[0])[0].fact.id, RESORT.id);
  assert.ok(now.warnings.some((w) => /closed for the season right now and opens for the season on November 26/.test(w)), now.warnings.join(' | '));
  const dated = plan('ski Big White November 20 to 22, 2026').p;
  assert.ok(dated.days.every((day) => dayStops(day)[0].fact.id === RESORT.id));
  assert.ok(dated.warnings.some((w) => /opens for the season on November 26 — your dates are before it opens/.test(w)), dated.warnings.join(' | '));
  const nov = plan('ski weekend at Big White in November').p;
  assert.ok(nov.warnings.some((w) => /November is before the season starts/.test(w)), nov.warnings.join(' | '));
  const kelowna = plan('ski trip from Kelowna for 2 days').p;
  assert.ok(kelowna.days.every((day) => day.region === 'big-white'), 'the nearest resort for a Kelowna ski trip');
});

test('Ski trips: a French request reaches the same ski plan', () => {
  const { p } = plan('Un voyage de ski à Big White pendant 2 jours en janvier', { fr: true });
  assert.equal(p.days.length, 2);
  assert.ok(p.days.every((day) => dayStops(day)[0].fact.id === RESORT.id));
});

test('Budget: "cheap eats Penticton" lists food places only, $ first, no winery', () => {
  const { p, intent } = plan('cheap eats Penticton');
  assert.equal(intent.budget, 'budget');
  const recs = p.recommendations.map((s) => BY_ID.get(s.venue.id));
  assert.ok(recs.length >= 2);
  assert.ok(recs.every((v) => ['restaurant', 'cafe', 'pub'].includes(v.type)), recs.map((v) => v.type).join(','));
  assert.equal(recs[0].price, 1, `${recs[0].name} first`);
  assert.ok(recs.findIndex((v) => v.id === SUSHI.id) === -1 || recs.findIndex((v) => v.id === SUSHI.id) > recs.findIndex((v) => CHEAP.some((c) => c.id === v.id)), '$$ sushi after the $ places');
  assert.ok(d.interpretDiscoveryQuery('$ restaurants in Penticton', TAXONOMY).budget === 'budget');
  assert.ok(d.interpretDiscoveryQuery('budget Penticton', TAXONOMY).budget === 'budget');
});

test('Parsing: filler words like "each" never become a request', () => {
  for (const text of ['3-day wine weekend in Penticton with a nice dinner each night', 'every morning coffee in Kelowna', 'some good wineries for both of us']) {
    const i = d.interpretDiscoveryQuery(text, TAXONOMY);
    const words = [...(i.textTerms || []), ...(i.foodTerms || []).map((f) => f.term)];
    for (const w of ['each', 'every', 'nice', 'good', 'great', 'some', 'with', 'for', 'a', 'the', 'both']) assert.ok(!words.includes(w), `${text}: ${words.join(', ')}`);
  }
});

test('Lunch: a full day with a hike, a winery and great food has a lunch stop', () => {
  const { p } = plan('Plan 2 days in Kelowna with a hike, a winery and great food');
  for (const day of p.days) {
    const lunch = dayStops(day).find((x) => x.daypart === 'midday');
    assert.ok(lunch && ['restaurant', 'cafe', 'pub'].includes(lunch.fact.type), `day ${day.day}: ${dayStops(day).map((x) => x.daypart + ' ' + x.fact.name).join(', ')}`);
    assert.deepEqual(day.stops.map((s) => s.daypart), ['morning', 'midday', 'afternoon', 'evening']);
  }
});

test('Day maps: stops close together go on the header picture as numbered pins; a wider day gets a fitted map', () => {
  const assets = { desktop: { z: 12, view: [49.18, -119.55] }, narrow: { z: 12, view: [49.18, -119.55] } };
  const near = v3.t3DayPinLayout([{ n: 1, lat: 49.18, lng: -119.55 }, { n: 2, lat: 49.181, lng: -119.548 }, { n: 3, lat: 49.179, lng: -119.552 }], assets);
  assert.equal(near.fits, true);
  assert.equal(near.pins.length, 3);
  assert.deepEqual(near.pins[0].d, { dx: 0, dy: 0 });
  const wide = v3.t3DayPinLayout([{ n: 1, lat: 49.18, lng: -119.55 }, { n: 2, lat: 49.03, lng: -119.47 }], assets);
  assert.equal(wide.fits, false, 'a 20 km day does not fit the town picture');
  assert.equal(v3.t3DayPinLayout([], assets).fits, false);
  assert.equal(v3.t3DayPinLayout([{ n: 1, lat: 49.18, lng: -119.55 }], { desktop: {}, narrow: {} }).fits, false, 'no zoom data: the old town ring stays');
});

test('The /trip page: phones get an Edit request bar, plan days are saved for My Trip, My Trip holds 30', () => {
  const src = require('node:fs').readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
  for (const marker of ['id="t3EditBar"', 'id="t3EditBtn"', 'is-compact', 'Modifier la demande', "okanaganTripDays", 'function rememberDays', 'data-t3-fit-day', 'var TRIP_MAX_STOPS = 30;']) assert.ok(src.includes(marker), `missing ${marker}`);
  const appJs = require('node:fs').readFileSync(require.resolve('../public/scripts/app.js'), 'utf8');
  assert.match(appJs, /var MAX_STOPS = 30;/);
});

test('The /trip page script parses (a regex slip inside the page template once stopped every plan from loading)', () => {
  const html = v3.renderTripPlannerV3Page({ esc: (s) => String(s), title: 't', description: 'd', canonical: '/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const src of scripts) assert.doesNotThrow(() => new Function(src));
  assert.match(html, /\? '\/fr\/trip' : '\/trip'/, 'the French page keeps /fr/trip in its address');
});
