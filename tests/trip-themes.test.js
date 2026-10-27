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

const REGIONS = { oliver: 'Oliver', osoyoos: 'Osoyoos', penticton: 'Penticton', naramata: 'Naramata', kelowna: 'Kelowna', 'big-white': 'Big White', vernon: 'Vernon', silverstar: 'SilverStar' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor', 'tour', 'indoor'],
  features: ['dog_friendly', 'kid_friendly', 'patio'], collections: ['hidden_gem', 'local_favorite'],
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
const CENTRES = { oliver: [49.18, -119.55], osoyoos: [49.03, -119.47], penticton: [49.49, -119.59], naramata: [49.59, -119.59], kelowna: [49.88, -119.49], 'big-white': [49.72, -118.93], vernon: [50.27, -119.27], silverstar: [50.36, -119.06] };
let nextId = 1;
function fact(o) {
  const id = o.id || nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.4 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: o.price === undefined ? null : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: o.cuisine || null, cuisineLabel: o.cuisine || null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: d.normalizeDiscoveryText(o.cuisine || ''), textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: [], fdTypes: o.fdTypes || [], hours: o.hours ? JSON.stringify(o.hours) : null,
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

// ---- The live review's gaps (2026-10-18): a second fixture valley with the real shapes that went wrong ----
// Kept apart from FACTS so the tests above plan exactly as before.
const EXTRA = [];
const ex = (o) => { const v = fact(o); EXTRA.push(v); return v; };
// Naramata as it is listed: most tasting rooms open at 11:00 or 12:00 (Mocojo 12:00-17:00), a few at 10:00; the
// one $$ dinner spot with the best rating is a takeout pizza place.
const MOCOJO = ex({ name: 'Mocojo Winery', region: 'naramata', type: 'winery', rating: 5, reviews: 400, hours: open('12:00', '17:00'), desc: 'A family-run Naramata Bench winery.' });
const NOON = [MOCOJO];
for (let i = 0; i < 5; i++) NOON.push(ex({ name: `Naramata Noon Winery ${i + 1}`, region: 'naramata', type: 'winery', rating: 4.9 - i * 0.04, hours: open(i % 2 ? '11:00' : '12:00', '17:30'), dLat: 0.004 * i, dLng: 0.003 * (i % 3) }));
const EARLY = [0, 1, 2].map((i) => ex({ name: `Naramata Early Winery ${i + 1}`, region: 'naramata', type: 'winery', rating: 4.6 - i * 0.05, hours: open('10:00', '18:00'), dLat: 0.003 * i }));
const ROCKYS = ex({ name: "Rocky's Real Things Pizza Naramata", region: 'naramata', type: 'restaurant', rating: 4.9, reviews: 600, price: 2, cuisine: 'Italian', hours: open('16:30', '20:30'), desc: 'Takeout and delivery only, and still a village staple.' });
const FINE = [0, 1, 2].map((i) => ex({ name: `Naramata Fine Table ${i + 1}`, region: 'naramata', type: 'restaurant', rating: 4.5 - i * 0.05, price: 3, hours: open('11:30', '22:00'), dLat: 0.002 * i }));
const NARAMATA_CASUAL = [0, 1, 2].map((i) => ex({ name: `Naramata Bistro ${i + 1}`, region: 'naramata', type: 'restaurant', rating: 4.6, price: 2, hours: open('11:00', '21:00'), dLat: 0.003 * i }));
ex({ name: 'Naramata Falls Walk', region: 'naramata', type: 'outdoor', rating: null, activities: ['hiking', 'nature'], desc: 'A short walk to a waterfall.' });
// SilverStar: closed for the season today, reopening not announced (seasonReopens null), as live since Oct 18.
const SILVERSTAR = ex({ name: 'SilverStar Mountain Resort', region: 'silverstar', type: 'outdoor', rating: null, activities: ['winter'], desc: 'The North Okanagan ski resort.', seasonClosed: { from: '2026-10-18', to: '2027-05-05' }, seasonClosedToday: true, seasonReopens: null });
for (const [n, type, price] of [['SilverStar Bistro', 'restaurant', 3], ['Long John Pub', 'pub', 2], ['Bugaboos Bakery', 'cafe', 1], ['SilverStar Grill', 'restaurant', 2]]) ex({ name: n, region: 'silverstar', type, rating: 4.5, price, desc: type === 'cafe' ? 'Coffee and breakfast.' : '' });
ex({ name: 'SilverStar Tube Park', region: 'silverstar', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Snow tubing lanes.' });
// Penticton with kids: a climbing park, a BBQ restaurant that is also listed as a cocktail bar, family places.
const SKAHA = ex({ name: 'Skaha Bluffs Provincial Park', region: 'penticton', type: 'outdoor', rating: 4.9, reviews: 900, activities: ['hiking'], desc: "The South Okanagan's rock-climbing destination: sun-warmed cliffs above Skaha Lake." });
const ANTLER = ex({ name: 'The Black Antler', region: 'penticton', type: 'restaurant', rating: 4.9, reviews: 900, price: 2, fdTypes: ['cocktail'], hours: open('11:00', '22:00'), desc: 'BBQ and burgers with patio seating.', features: { kid_friendly: true } });
for (let i = 0; i < 4; i++) ex({ name: `Penticton Family Diner ${i + 1}`, region: 'penticton', type: 'restaurant', rating: 4.4 - i * 0.05, price: 2, hours: open('08:00', '21:00'), dLat: 0.004 * i, features: { kid_friendly: true } });
for (const [n, type] of [['Penticton Museum', 'indoor'], ['Penticton Aquatic Centre', 'indoor'], ['Penticton Lakeside Park', 'outdoor'], ['Penticton Mini Golf', 'indoor']]) ex({ name: n, region: 'penticton', type, rating: 4.4, hours: type === 'indoor' ? open('09:00', '18:00') : null, desc: type === 'indoor' ? 'Indoor fun for families.' : 'A lakeside park with a playground.', features: { kid_friendly: true }, activities: type === 'outdoor' ? ['nature'] : [] });
for (let i = 0; i < 2; i++) ex({ name: `Penticton Patio Cafe ${i + 1}`, region: 'penticton', type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee on a patio.', features: { dog_friendly: true, patio: true }, hours: open('07:00', '17:00') });
ex({ name: 'Penticton Dog Patio Bistro', region: 'penticton', type: 'restaurant', rating: 4.5, price: 2, desc: 'A bistro with a big patio.', features: { dog_friendly: true, patio: true }, hours: open('11:00', '22:00') });
// Vernon in late October: a beach (Kekuli Bay), indoor and year-round places, restaurants.
const KEKULI = ex({ name: 'Kekuli Bay Provincial Park', region: 'vernon', type: 'beach', rating: 4.8, reviews: 700, desc: 'A Kalamalka Lake beach with a playground.', features: { kid_friendly: true } });
for (const [n, type] of [['Vernon Science Centre', 'indoor'], ['Vernon Museum', 'indoor'], ['Vernon Bowling Lanes', 'indoor']]) ex({ name: n, region: 'vernon', type, rating: 4.4, hours: open('09:00', '18:00'), desc: 'Indoor fun for families.', features: { kid_friendly: true } });
ex({ name: 'Vernon Ridge Park', region: 'vernon', type: 'outdoor', rating: 4.5, activities: ['nature', 'viewpoints'], desc: 'A small park with a 360-degree view.', features: { kid_friendly: true } });
for (let i = 0; i < 5; i++) ex({ name: `Vernon Family Kitchen ${i + 1}`, region: 'vernon', type: 'restaurant', rating: 4.5 - i * 0.05, price: 2, hours: open('09:00', '21:00'), dLat: 0.004 * i, features: { kid_friendly: true } });
ex({ name: 'Vernon Coffee House', region: 'vernon', type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and pastries.', hours: open('07:00', '17:00') });
// Kelowna: two parks along the same creek.
const MC_PARK = ex({ name: 'Mission Creek Regional Park', region: 'kelowna', type: 'outdoor', rating: 4.8, reviews: 800, activities: ['hiking', 'nature'], desc: 'Trails, creek and cottonwoods.' });
const MC_GREENWAY = ex({ name: 'Mission Creek Greenway Regional Park', region: 'kelowna', type: 'outdoor', rating: 4.8, reviews: 790, activities: ['hiking', 'nature'], dLat: 0.01, desc: 'A linear park and trail along Mission Creek.' });
ex({ name: 'Kelowna Knox Lookout', region: 'kelowna', type: 'outdoor', rating: 4.6, activities: ['hiking', 'viewpoints'], dLat: 0.02, desc: 'A hike to a lookout.' });
const EXTRA_BY_ID = new Map(EXTRA.map((v) => [v.id, v]));
const FACTS2 = FACTS.concat(EXTRA);
const plan2 = (text, opts = {}) => plan(text, { ...opts, facts: FACTS2 });
const wineriesOn = (day) => dayStops(day).filter((x) => x.fact.type === 'winery');
const morningOpen = (v) => { const h = JSON.parse(v.hours || 'null'); return !h || h.mon[0][0] <= '10:30'; };

function plan(text, opts = {}) {
  const facts = opts.facts || FACTS;
  const planText = opts.fr ? fr.tripPlannerText(text, TAXONOMY) : text;
  const intent = d.interpretDiscoveryQuery(planText, TAXONOMY);
  const trip = d.interpretTripComponents(planText, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text: planText, intent, trip, taxonomy: TAXONOMY, referenceDate: opts.today || '2026-10-18' });
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts, labels: LABELS, text: planText, tripDate: requirements.startDate || opts.today || '2026-10-18', tripEvents: [] });
  return { p, intent, requirements, planText };
}
const dayStops = (day) => day.stops.filter((s) => s.venue).map((s) => ({ ...s, fact: BY_ID.get(s.venue.id) || EXTRA_BY_ID.get(s.venue.id) }));
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
  // Audit fix (2026-10-27): dates before the resort's own opening day are not ski days; the plan says when it opens.
  const dated = plan('ski Big White November 20 to 22, 2026').p;
  assert.ok(!dated.days.some((day) => dayStops(day).some((s) => s.fact && s.fact.id === RESORT.id)));
  assert.ok(dated.notes.includes('Big White Ski Resort opens for the season on November 26, so skiing isn’t part of this November plan.'), dated.notes.join(' | '));
  const open = plan('ski Big White November 27 to 28, 2026').p;
  assert.ok(open.days.every((day) => dayStops(day)[0].fact.id === RESORT.id), 'from the opening day on, it is a ski trip');
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
    // Round 15b (2026-10-20): a suggested day may also get the late-afternoon stop (or Free time card) a dated day gets.
    assert.deepEqual(day.stops.filter((s) => s.daypart !== 'late').map((s) => s.daypart), ['morning', 'midday', 'afternoon', 'evening']);
    for (const s of day.stops.filter((x) => x.daypart === 'late')) assert.ok(s.gapFill || s.freeTime, JSON.stringify(s.label));
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

// ---------- The live review's remaining gaps (2026-10-18) ----------

test('Counted wine days: "3 wineries a day with lunch" plans three tastings every day, lunch and dinner, and nothing "Not included"', () => {
  const q = 'A wine weekend in Naramata for 2 days, 3 wineries a day with lunch';
  const { p, requirements, intent } = plan2(q);
  assert.equal(intent.days, 2, '"a day" is not a trip length');
  assert.ok(requirements.items.some((i) => i.kind === 'type_count' && i.value === 'winery' && i.count === 3 && i.perDay));
  assert.equal(p.theme, 'wine');
  assert.equal(p.days.length, 2);
  for (const day of p.days) {
    const s = dayStops(day);
    assert.equal(wineriesOn(day).length, 3, `day ${day.day}: ${s.map((x) => x.daypart + ' ' + x.fact.name).join(', ')}`);
    assert.ok(s.some((x) => x.daypart === 'midday' && ['restaurant', 'cafe', 'winery'].includes(x.fact.type)), 'lunch');
    assert.equal(s.find((x) => x.daypart === 'evening')?.fact.type, 'restaurant', 'dinner');
    assert.ok(!s.some((x) => x.fact.type === 'outdoor'), 'no waterfall walk padding a counted wine day');
    assert.deepEqual(day.stops.map((x) => x.daypart), [...new Set(day.stops.map((x) => x.daypart))], 'one stop per slot key');
  }
  const wine = p.requirementResults.find((i) => i.kind === 'type_count');
  assert.equal(wine.status, 'satisfied', wine.reason);
  assert.ok(!p.requirementResults.some((i) => i.status === 'unmet'), JSON.stringify(p.requirementResults.filter((i) => i.status === 'unmet')));
  assert.equal(v3.t3PlanNextSteps(p).filter((x) => x.kind === 'missing').length, 0, 'no "winery — Not included"');
  assert.ok(!p.requirementResults.some((i) => (i.optionalAlternatives || []).length), 'no wineries offered only as optional ideas');
  // The plain request still gets two a day; "two breweries a day" and "4 a day" parse; more than 4 is capped.
  assert.equal(plan2('Wine weekend in Naramata').p.days.every((day) => wineriesOn(day).length === 2), true);
  const parse = (t) => r.extractTripRequirements({ text: t, intent: d.interpretDiscoveryQuery(t, TAXONOMY), trip: {}, taxonomy: TAXONOMY, referenceDate: '2026-10-18' }).items.filter((i) => i.kind === 'type_count');
  assert.deepEqual(parse('two breweries a day in Kelowna for 2 days').map((i) => [i.value, i.count, i.perDay]), [['brewery', 2, true]]);
  assert.deepEqual(parse('4 wineries per day in Oliver').map((i) => [i.value, i.count, i.perDay]), [['winery', 4, true]]);
  assert.deepEqual(parse('6 wineries a day in Oliver').map((i) => [i.count, i.requestedCount]), [[4, 6]]);
  assert.deepEqual(parse('3 wineries in Oliver').map((i) => [i.count, !!i.perDay]), [[3, false]]);
  const four = plan('4 wineries a day in Oliver for 2 days').p;
  assert.ok(four.days.every((day) => wineriesOn(day).length >= 3), 'four a day: at least the three tasting slots');
  const capped = plan('6 wineries a day in Oliver for 2 days').p;
  assert.ok(capped.warnings.some((w) => /Up to 4 winery visits fit in one day/.test(w)), capped.warnings.join(' | '));
});

test('Counted wine days: a tasting is in the morning only when the winery opens by about 10:30', () => {
  for (const q of ['A wine weekend in Naramata for 2 days, 3 wineries a day with lunch', 'Wine weekend in Naramata', 'wineries in Naramata for 3 days']) {
    const { p } = plan2(q);
    for (const day of p.days) {
      const m = dayStops(day).find((x) => x.daypart === 'morning');
      if (m && m.fact.type === 'winery') assert.ok(morningOpen(m.fact), `${q}, day ${day.day}: ${m.fact.name} opens ${JSON.parse(m.fact.hours).mon[0][0]}`);
    }
    assert.ok(!allStops(p).some((x) => x.daypart === 'morning' && x.fact.id === MOCOJO.id), 'Mocojo (12:00) is never a morning stop');
  }
});

test('French: "Un week-end vinicole de 2 jours à Naramata" plans wineries like the English request', () => {
  const { p, planText } = plan2('Un week-end vinicole de 2 jours à Naramata, 3 vignobles par jour avec dîner', { fr: true });
  assert.match(planText, /wine weekend/);
  assert.equal(p.days.length, 2);
  assert.ok(p.days.every((day) => wineriesOn(day).length === 3), p.days.map((day) => wineriesOn(day).length).join(','));
  const plain = plan2('Un week-end vinicole de 2 jours à Naramata', { fr: true }).p;
  assert.ok(plain.days.every((day) => wineriesOn(day).length >= 2));
  assert.ok(!plain.warnings.some((w) => /vinicole/.test(w)), plain.warnings.join(' | '));
  for (const [frq, en] of [['dégustation de vins à Naramata', /wine tasting/], ['une journée de pluie à Kelowna', /rainy day/], ['restos pas chers à Penticton', /cheap/], ['restos abordables à Penticton', /affordable/], ['Week-end de ski à SilverStar', /ski weekend/]]) assert.match(fr.tripPlannerText(frq, TAXONOMY), en, frq);
});

test('French: "Terrasse où les chiens sont acceptés à Penticton" finds dog-friendly patios, and every message is French', () => {
  const { p, planText, intent } = plan2('Terrasse où les chiens sont acceptés à Penticton', { fr: true });
  assert.ok(!/\bor\b|acceptes/.test(planText), planText);
  assert.ok(intent.features.includes('dog_friendly') && intent.features.includes('patio'), JSON.stringify(intent.features));
  const recs = p.recommendations.map((x) => EXTRA_BY_ID.get(x.venue.id) || BY_ID.get(x.venue.id));
  assert.ok(recs.length >= 1 && recs.every((v) => v.features.dog_friendly), recs.map((v) => v.name).join(', '));
  const frPlan = v3.t3FrenchPlan ? v3.t3FrenchPlan(p) : require('../trip-french-copy.js').t3FrenchPlan(p);
  for (const w of frPlan.warnings.concat(frPlan.notes, [frPlan.headline || ''])) assert.ok(!/\b(?:Places that mention|No Okanagan Roam listings|Nothing matching|the Okanagan)\b/.test(w), w);
  // A request nothing matches: the failure and the summary are French too.
  const none = require('../trip-french-copy.js').t3FrenchPlan(plan2('Terrasse avec licornes à Oliver', { fr: true }).p);
  for (const w of none.warnings.concat([none.headline || ''])) assert.ok(!/\b(?:Places that mention|No Okanagan Roam listings match|Ideas for|Nothing matching)\b/.test(w), w);
  const copy = require('../trip-french-copy.js').t3FrenchText;
  assert.equal(copy('No Okanagan Roam listings match every part of that request.'), 'Aucune fiche d’Okanagan Roam ne correspond à toutes les parties de cette demande.');
  assert.equal(copy('Places that mention “acceptes” in Penticton.'), 'Lieux qui mentionnent « acceptes » à Penticton.');
  assert.equal(copy('Requested 3 winery stops a day; scheduled 3, 2 (day by day).'), 'Demandé : 3 vignobles par jour; prévu : 3, 2 (jour par jour).');
  assert.equal(copy('Late afternoon'), 'Fin d’après-midi');
});

test('Nice dinners: "a nice dinner each night" is $$$ or fine dining, never a $$ takeout pizza place', () => {
  for (const q of ['3-day wine weekend in Penticton and Naramata, with great food and a nice dinner each night', 'A romantic weekend in Naramata with wineries', 'Wine weekend in Naramata for our anniversary']) {
    const { p } = plan2(q);
    const dinners = allStops(p).filter((x) => x.daypart === 'evening');
    assert.ok(dinners.length >= 2, q);
    for (const x of dinners) {
      assert.notEqual(x.fact.id, ROCKYS.id, `${q}: ${x.fact.name}`);
      assert.ok(!/pizza|burger/i.test(x.fact.name), `${q}: ${x.fact.name}`);
      assert.ok(x.fact.price >= 3 || x.caveats.some((c) => /No \$\$\$ or fine-dining/.test(c)), `${q}: ${x.fact.name} ($${x.fact.price})`);
    }
  }
  // A town with no $$$ or fine-dining place: the best sit-down dinner left, with a note, still never the pizza place.
  const plain = plan('A romantic wine weekend in Naramata', { facts: FACTS2.filter((v) => !(v.region === 'naramata' && v.price >= 3)) }).p;
  for (const x of allStops(plain).filter((y) => y.daypart === 'evening')) {
    assert.notEqual(x.fact.id, ROCKYS.id);
    assert.ok(x.caveats.some((c) => /No \$\$\$ or fine-dining/.test(c)), x.fact.name);
  }
  // Takeout-and-delivery-only is never "a sit-down dinner", special words or not.
  assert.ok(!allStops(plan2('Wine weekend in Naramata').p).some((x) => x.fact.id === ROCKYS.id && x.daypart === 'evening'));
  assert.ok(tp.specialDinner && tp.casualDinner && tp.casualDinner(ROCKYS) && !tp.specialDinner(ROCKYS) && tp.specialDinner(FINE[0]));
});

test('Ski season: SilverStar (closed, reopening not announced) warns in English and French', () => {
  const msg = 'SilverStar Mountain Resort hasn’t announced its opening day yet; ski season usually starts in late November or December, so check before you book.';
  const { p } = plan2('Ski weekend at SilverStar');
  assert.ok(p.days.length >= 1 && p.days.every((day) => dayStops(day)[0].fact.id === SILVERSTAR.id));
  assert.ok(p.warnings.includes(msg), p.warnings.join(' | '));
  assert.ok(dayStops(p.days[0])[0].caveats.includes(msg));
  const frp = plan2('Week-end de ski à SilverStar', { fr: true }).p;
  assert.ok(frp.days.every((day) => dayStops(day)[0].fact.id === SILVERSTAR.id));
  const frWarn = require('../trip-french-copy.js').t3FrenchPlan(frp).warnings;
  assert.ok(frWarn.some((w) => /^SilverStar Mountain Resort n’a pas encore annoncé sa date d’ouverture; la saison de ski commence habituellement à la fin novembre ou en décembre/.test(w)), frWarn.join(' | '));
  assert.ok(plan2('ski SilverStar December 5 to 6, 2026').p.warnings.includes(msg), 'dated before any opening');
  // Big White, with its date, keeps its own wording.
  assert.ok(plan('ski trip Big White').p.warnings.some((w) => /opens for the season on November 26/.test(w)));
});

test('Family trips: no cocktail-bar or pub meals and no technical climbing; no beach in late October; lunch is midday', () => {
  const pen = plan2('2 days in Penticton with kids').p;
  const s = allStops(pen);
  assert.ok(!s.some((x) => x.fact.id === SKAHA.id), 'no Skaha Bluffs climbing for kids');
  assert.ok(!s.some((x) => x.fact.id === ANTLER.id), 'no cocktail-bar meal for kids');
  const ver = plan2('2 days in Vernon with the kids').p;
  for (const day of ver.days) {
    const st = dayStops(day);
    assert.ok(!st.some((x) => x.fact.id === KEKULI.id), `day ${day.day}: no beach in late October`);
    const meals = st.filter((x) => ['restaurant', 'pub'].includes(x.fact.type) && x.daypart !== 'evening');
    for (const m of meals) assert.equal(m.daypart, 'midday', `day ${day.day}: ${m.fact.name} is lunch, at midday`);
  }
  // In July the beach is back.
  const summer = plan2('2 days in Vernon with the kids', { today: '2026-07-10' }).p;
  assert.ok(allStops(summer).some((x) => x.fact.id === KEKULI.id), 'summer keeps the beach');
});

test('Near-duplicates: two parks on the same creek are not both planned', () => {
  const { p } = plan2('3 days of hiking and nature in Kelowna');
  const ids = allStops(p).map((x) => x.fact.id);
  assert.ok(!(ids.includes(MC_PARK.id) && ids.includes(MC_GREENWAY.id)), allStops(p).map((x) => `${x.day || ''} ${x.fact.name}`).join(', '));
  assert.equal(tp.placeKey(MC_PARK), tp.placeKey(MC_GREENWAY));
  // A restaurant the day ended up with in the afternoon slot is its lunch, at midday, and the afternoon gets an activity.
  for (const day of p.days) for (const x of dayStops(day)) assert.ok(!(x.daypart === 'afternoon' && ['restaurant', 'pub'].includes(x.fact.type)), `day ${day.day}: ${x.fact.name} in the afternoon`);
  assert.ok(p.days.some((day) => dayStops(day).some((x) => x.daypart === 'midday') && dayStops(day).some((x) => x.daypart === 'afternoon' && x.fact.type === 'outdoor')));
});

test('Day headers: every day shows "N stops · km" and its own map, not only the first day in a town', () => {
  const src = require('node:fs').readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
  assert.ok(src.includes('function dayMeta(d)'));
  assert.ok(src.includes('var head = MAP_HEADERS[d.region] && MAP_HEADERS[d.region].assets ? mapHeadHtml('));
  assert.ok(!src.includes('firstInRegion'));
  // Late-afternoon tastings round-trip in share links and pins.
  const q = v3.t3StateToQuery({ text: 'x', locks: { '1-late': 5, '1-morning': 4 }, removed: { '2-late': true } });
  assert.match(q, /keep=1-morning%3A4%2C1-late%3A5/);
  const back = v3.t3QueryToState(q, []);
  assert.deepEqual(back.locks, { '1-morning': 4, '1-late': 5 });
  assert.deepEqual(back.removed, ['2-late']);
  assert.equal(back.invalid, false);
});
