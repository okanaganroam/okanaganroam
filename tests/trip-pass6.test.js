// Build My Trip, sixth review pass (2026-10-19): meal times in dated plans, lunch at a winery's restaurant, Swap on ski
// and wine plans, "no driving after X" applied, My Trip keeping repeats, drive legs and dates, small reading fixes,
// French reason lines and the plan's accessibility. The requests are the real ones from
// drafts/site-review-2026-10-19-pass5.md. PURE tests on the pass-5 fixture valley (copied, so each file stands alone).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const v3 = require('../trip-planner-v3-page.js');
const fr = require('../trip-planner-fr.js');
const { t3FrenchPlan, t3FrenchText } = require('../trip-french-copy.js');

const REGIONS = { vernon: 'Vernon', 'lake-country': 'Lake Country', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', penticton: 'Penticton', naramata: 'Naramata', oliver: 'Oliver', osoyoos: 'Osoyoos', silverstar: 'SilverStar', 'big-white': 'Big White' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor'],
  features: ['dog_friendly', 'kid_friendly', 'patio'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'nightlife'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly' }, featureNouns: {}, collections: {},
};
// Town centres roughly where they are, so road times between them are realistic (Naramata ~15 min from Penticton).
const CENTRES = { vernon: [50.267, -119.272], 'lake-country': [50.053, -119.414], kelowna: [49.888, -119.496], 'west-kelowna': [49.863, -119.564], penticton: [49.491, -119.589], naramata: [49.596, -119.592], oliver: [49.183, -119.551], osoyoos: [49.032, -119.468], silverstar: [50.359, -119.062], 'big-white': [49.722, -118.929] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to, closed = []) => Object.fromEntries(WEEK.map((k) => [k, closed.includes(k) ? [] : [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: 200, price: o.price === undefined ? null : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: null, cuisineLabel: null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: '', textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: o.seasonClosed || null, seasonClosedToday: !!o.seasonClosedToday, seasonReopens: o.seasonReopens,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
// Every valley town on the road trip: an easy walk, two wineries with listed hours, cafés and restaurants.
for (const region of ['vernon', 'kelowna', 'penticton', 'oliver', 'osoyoos']) {
  const L = REGIONS[region];
  for (let i = 0; i < 2; i++) add({ name: `${L} Lakeshore Walk ${i + 1}`, region, type: 'outdoor', rating: 4.6, activities: ['hiking', 'nature'], desc: 'An easy walk on a flat lakeshore trail.', dLat: 0.01 * i });
  for (let i = 0; i < (region === 'kelowna' ? 5 : 3); i++) add({ name: `${L} Estate Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, hours: open('11:00', '17:00'), dLat: 0.012 * i, dLng: 0.01 });
  for (let i = 0; i < 4; i++) add({ name: `${L} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 2 + (i % 2), hours: open('11:00', '22:00'), dLat: 0.004 * i, features: { kid_friendly: true } });
  add({ name: `${L} Coffee Co`, region, type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and lunch.', hours: open('07:00', '16:00') });
}
// Naramata as listed: tasting rooms without hours, three restaurants closed on Sundays.
const NARAMATA_WINERIES = [0, 1, 2, 3, 4].map((i) => add({ name: `Naramata Bench Winery ${i + 1}`, region: 'naramata', type: 'winery', rating: 4.9 - i * 0.05, dLat: 0.012 * i, dLng: 0.01 * (i % 2) }));
for (let i = 0; i < 3; i++) add({ name: `Naramata Bistro ${i + 1}`, region: 'naramata', type: 'restaurant', rating: 4.7, price: 3, hours: open('11:30', '21:00', ['sun']), dLat: 0.005 * i });
// Vernon family places, an indoor attraction and a gelato stop.
add({ name: 'Vernon Science Centre', region: 'vernon', type: 'indoor', rating: 4.5, hours: open('10:00', '17:00'), desc: 'Hands-on science for kids.', features: { kid_friendly: true } });
add({ name: 'Vernon Bowling Lanes', region: 'vernon', type: 'indoor', rating: 4.4, hours: open('10:00', '22:00'), desc: 'Ten-pin bowling for families.', features: { kid_friendly: true } });
add({ name: 'Vernon Gelato', region: 'vernon', type: 'cafe', rating: 4.8, price: 1, desc: 'Gelato and ice cream.', hours: open('11:00', '21:00'), features: { kid_friendly: true } });
// Penticton budget traps and free places.
const SPA = add({ name: 'Tality Wellness Penticton', region: 'penticton', type: 'indoor', rating: 4.9, reviews: 900, desc: 'A social bathhouse with sauna and cold plunge.', hours: open('09:00', '21:00') });
const OUTFITTER = add({ name: 'Hoodoo Adventure Company', region: 'penticton', type: 'outdoor', rating: 4.9, desc: 'Guided tours and rentals.' });
const TOUR = add({ name: 'Penticton Wine Tours', region: 'penticton', type: 'tour', rating: 4.9, desc: 'Guided wine tours.' });
add({ name: 'Penticton Farmers Market', region: 'penticton', type: 'outdoor', rating: 4.7, desc: 'A free Saturday market downtown.' });
add({ name: 'Okanagan Lake Park', region: 'penticton', type: 'outdoor', rating: 4.6, desc: 'A free waterfront park and promenade.', activities: ['nature'] });
// Kelowna for "tonight": a golf course, a daytime tour, evening places.
const GOLF = add({ name: 'Kelowna Golf Club', region: 'kelowna', type: 'golf', rating: 4.9 });
const DAY_TOUR = add({ name: 'Kelowna Bike Tours', region: 'kelowna', type: 'tour', rating: 4.9, desc: 'Guided daytime rides.' });
add({ name: 'Kelowna Escape Rooms', region: 'kelowna', type: 'indoor', rating: 4.7, hours: open('12:00', '23:00'), desc: 'Escape rooms.' });
add({ name: 'Kelowna Taproom', region: 'kelowna', type: 'pub', rating: 4.5, price: 2, hours: open('11:00', '24:00') });
// SilverStar: the resort and its winter extras.
add({ name: 'SilverStar Mountain Resort', region: 'silverstar', type: 'outdoor', rating: null, activities: ['winter'], desc: 'The North Okanagan ski resort.' });
const SNOWMOBILE = add({ name: 'Vernon Snowmobile Association Trails', region: 'silverstar', type: 'outdoor', rating: 4.9, activities: ['winter'], desc: 'Snowmobile trails.' });
const TUBES = add({ name: 'Tube Town Tube Park', region: 'silverstar', type: 'outdoor', rating: 4.2, activities: ['winter'], desc: 'Snow tubing lanes.' });
add({ name: 'SilverStar Snowshoe Trails', region: 'silverstar', type: 'outdoor', rating: 4.3, activities: ['winter'], desc: 'Snowshoe trails.' });
for (const [n, type, price] of [['The Red Antler', 'restaurant', 2], ['The Den', 'restaurant', 2], ['Bugaboos Bakery', 'cafe', 1]]) add({ name: n, region: 'silverstar', type, rating: 4.5, price, desc: type === 'cafe' ? 'Coffee and breakfast.' : '', features: { kid_friendly: true } });
// Big White: closed for the season today; its fine dining is closed until the lifts open.
add({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Big mountain skiing.', seasonClosed: { from: '2026-10-15', to: '2026-11-25' }, seasonClosedToday: true, seasonReopens: '2026-11-26' });
const STEAKHOUSE = add({ name: 'Kettle Valley Steakhouse', region: 'big-white', type: 'restaurant', rating: 4.6, price: 4, seasonClosed: { from: '2026-10-15', to: '2026-11-25' }, seasonClosedToday: true, seasonReopens: '2026-11-26' });
add({ name: 'The Woods', region: 'big-white', type: 'restaurant', rating: 4.3, price: 2 });
add({ name: 'Snowshoe Sams', region: 'big-white', type: 'pub', rating: 4.4, price: 2 });
add({ name: 'Big White Cafe', region: 'big-white', type: 'cafe', rating: 4.4, price: 1, desc: 'Coffee and breakfast.' });
// Penticton brewery crawl with a dog.
for (let i = 0; i < 4; i++) add({ name: `Penticton Brewing ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.6, price: 2, hours: open('12:00', '22:00'), features: { dog_friendly: true }, dLat: 0.002 * i });
// Listing counts like the live towns (a road trip only stops in towns with 25+ listings): sports clubs nobody asks for.
for (const region of ['kelowna', 'penticton', 'oliver']) for (let i = 0; i < (region === 'kelowna' ? 40 : 20); i++) add({ name: `${REGIONS[region]} Curling Club ${i + 1}`, region, type: 'sport', rating: 3 });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

// What's On, as server.js passes it to the planner: one item per occurrence (tripEventOccurrenceItems).
let eventId = 900;
const ev = (o) => ({ id: o.id || eventId++, name: o.name, description: '', region: o.region, venueName: o.venueName || '', url: `/${o.region}/events/x`, valleyWide: false, categories: o.categories, dateLabel: '', time: o.time, startDate: o.date, endDate: o.date, startTime: o.startTime || null, endTime: o.endTime || null, endsNextDay: 0, location: null });
const ROAD_EVENTS = [
  ev({ name: "Hungry for Laughs Comedy Tour", region: 'vernon', categories: ['live-music', 'nightlife'], date: '2026-10-23', time: '7:30 pm' }),
  ev({ name: 'Live Music: Eric Kane at The Hub', region: 'penticton', categories: ['live-music'], date: '2026-10-23', time: '7 pm' }),
  ev({ name: 'GEDfest YLW', region: 'kelowna', categories: ['live-music'], date: '2026-10-24', time: '7:30 pm' }),
  ev({ name: 'Coverboy', region: 'west-kelowna', categories: ['live-music'], date: '2026-10-23', time: '9 pm' }),
];
const OKEEFE_ID = 1025;
const FAMILY_EVENTS = ['2026-10-24', '2026-10-25'].map((date) => ev({ id: OKEEFE_ID, name: "Fall Weekends at O'Keefe Ranch: Corn Maze, Kids Haunted House & Haunted Mini Golf", region: 'vernon', categories: ['family-kids', 'holiday-seasonal'], date, time: '10 am', startTime: '10:00', endTime: '16:00' }))
  .concat(ev({ name: 'Boos and Booze Ghost Tour', region: 'vernon', categories: ['nightlife', 'family-kids'], date: '2026-10-24', time: '8 pm' }));

function plan(text, opts = {}) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-18' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = opts.endDate || null; }
  if (opts.startMinutes != null) requirements.startMinutes = opts.startMinutes;
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: FACTS, labels: LABELS, text, tripDate: requirements.startDate || opts.today || '2026-10-18', events: opts.events || null, familyEvents: !!opts.familyEvents, tripEvents: trip.multi ? trip.components.map((c) => (c.kind === 'event' ? [] : null)) : [], clock: opts.clock, startWeekday: opts.startWeekday, pinned: opts.pinned, excludeIds: opts.excludeIds, swap: opts.swap });
  return { p, intent, requirements };
}
const stopsOf = (day) => day.stops.filter((s) => s.venue).map((s) => ({ ...s, fact: BY_ID.get(s.venue.id) }));
const rows = (p, day) => (p.schedule || []).filter((x) => x.day === day);

const I = (text) => d.interpretDiscoveryQuery(text, TAXONOMY);
const NIGHTS = [
  ev({ name: 'Live Music: The Kelowna Set', region: 'kelowna', categories: ['live-music'], date: '2026-10-24', time: '7:30 pm' }),
  ev({ name: 'Live Music: Penticton Hall Night', region: 'penticton', categories: ['live-music'], date: '2026-10-25', time: '8 pm' }),
  ev({ name: 'Live Music: Oliver Saloon', region: 'oliver', categories: ['live-music'], date: '2026-10-26', time: '7 pm' }),
];

const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const isMeal = (s) => s.venue && ['restaurant', 'pub', 'cafe'].includes(s.venue.type);
const rowOf = (p, day, s) => (p.schedule || []).find((x) => x.day === day && s.venue && x.venueId === s.venue.id);
function withFacts(list, fn) {
  const added = list.map((o) => { const v = add(o); BY_ID.set(v.id, v); return v; });
  try { return fn(added); } finally { for (const v of added) { FACTS.splice(FACTS.indexOf(v), 1); BY_ID.delete(v.id); } }
}

test('Meal times: with a 9:00 start, lunch is 11:30–13:30, dinner from 18:00, and the gaps are free time', () => {
  for (const text of ['3 wineries a day in Oliver, 2 days', '2 days Naramata wineries', 'romantic weekend in Kelowna', '2 days in Penticton on a budget, students', 'A 3-day road trip from Kelowna to Osoyoos'])
    for (const startMinutes of [undefined, 540]) {
      const { p } = plan(text, { startDate: '2026-10-24', startMinutes });
      for (const day of p.days) {
        for (const s of day.stops.filter((x) => x.venue)) {
          const row = rowOf(p, day.day, s);
          assert.ok(row && Number.isFinite(row.startMinutes), `${text} day ${day.day}: ${s.venue.name} is timed`);
          if (s.daypart === 'midday' && isMeal(s)) assert.ok(row.startMinutes >= 690 && row.startMinutes <= 810, `${text}: lunch at ${clock(row.startMinutes)}`);
          if (['evening', 'night'].includes(s.daypart) && ['restaurant', 'pub'].includes(s.venue.type)) assert.ok(row.startMinutes >= 1050, `${text}: dinner at ${clock(row.startMinutes)}`);
        }
      }
    }
  // The reported Oliver plan: dinner no longer at 3:45 PM, the day no longer ends at 5 PM.
  const { p } = plan('3 wineries a day in Oliver, 2 days', { startDate: '2026-10-24', startMinutes: 540 });
  const day1 = rows(p, 1).filter((x) => x.venueId);
  assert.ok(day1[day1.length - 1].endMinutes >= 19 * 60, clock(day1[day1.length - 1].endMinutes));
});

test('Meal times: a dinner before an evening show starts no earlier than 16:30', () => {
  const show = [ev({ name: 'Live Music: Early Set', region: 'kelowna', categories: ['live-music'], date: '2026-10-24', time: '6:30 pm' })];
  const { p } = plan('2 days in Kelowna with live music in the evenings', { startDate: '2026-10-24', events: show });
  for (const day of p.days) for (const s of day.stops.filter((x) => x.venue && ['evening', 'night'].includes(x.daypart) && x.venue.type === 'restaurant')) {
    const row = rowOf(p, day.day, s);
    if (row && Number.isFinite(row.startMinutes)) assert.ok(row.startMinutes >= 990, `dinner at ${clock(row.startMinutes)}`);
  }
  assert.ok(tp.isDinnerStop({ daypart: 'evening', venue: { type: 'restaurant' } }) && !tp.isDinnerStop({ daypart: 'afternoon', venue: { type: 'restaurant' } }) && tp.isDinnerStop({ daypart: 'afternoon', label: 'Dinner', venue: { type: 'restaurant' } }));
});

test('Meals: every full day has a lunch and a dinner, and never two cafés in a row', () => {
  for (const text of ['3 wineries a day in Oliver, 2 days', '2 days Naramata wineries', 'romantic weekend in Kelowna', 'a relaxed weekend in Penticton', '2 days in Vernon with kids', 'live music every evening Kelowna 2 days'])
    for (const startMinutes of [undefined, 540]) {
      const { p } = plan(text, { startDate: '2026-10-24', startMinutes, events: /live music/.test(text) ? NIGHTS.map((e) => ({ ...e, region: 'kelowna' })) : null });
      for (const day of p.days) {
        const vs = day.stops.filter((s) => s.venue);
        assert.ok(vs.some((s) => s.daypart === 'midday' && isMeal(s)), `${text} day ${day.day}: lunch (${vs.map((s) => `${s.daypart}:${s.venue.name}`).join(', ')})`);
        assert.ok(vs.some((s) => ['evening', 'night'].includes(s.daypart) && isMeal(s)), `${text} day ${day.day}: dinner`);
        for (let i = 1; i < vs.length; i++) assert.ok(!(vs[i].venue.type === 'cafe' && vs[i - 1].venue.type === 'cafe'), `${text} day ${day.day}: two cafés in a row`);
      }
    }
  // A café next to a café is never the lunch.
  withFacts([{ name: 'Penticton Espresso Bar', region: 'penticton', type: 'cafe', rating: 5, reviews: 3000, price: 1, desc: 'Coffee and lunch, sandwiches.', hours: open('07:00', '17:00') }], () => {
    for (const text of ['2 days in Penticton on a budget', 'a weekend in Penticton']) {
      const { p } = plan(text, { startDate: '2026-10-24' });
      for (const day of p.days) { const vs = day.stops.filter((s) => s.venue); for (let i = 1; i < vs.length; i++) assert.ok(!(vs[i].venue.type === 'cafe' && vs[i - 1].venue.type === 'cafe'), `${text} day ${day.day}: ${vs.map((s) => s.venue.name).join(', ')}`); }
    }
  });
});

test('Meals: a dinner-only kitchen is never the lunch, and a pub is not dinner unless asked', () => {
  withFacts([{ name: 'Kelowna Supper House', region: 'kelowna', type: 'restaurant', rating: 5, reviews: 3000, price: 3, desc: 'Dinner only, a tasting menu from 5 pm.' }], ([supper]) => {
    for (const text of ['romantic weekend in Kelowna', '3 days in Kelowna', 'a weekend in Kelowna with wineries']) {
      const { p } = plan(text, { startDate: '2026-10-24' });
      assert.ok(!p.days.some((day) => day.stops.some((s) => s.daypart !== 'evening' && s.venue && s.venue.id === supper.id)), text);
    }
  });
  withFacts([{ name: 'SilverStar Village Pub', region: 'silverstar', type: 'pub', rating: 5, reviews: 3000, price: 2 }], ([pub]) => {
    const { p } = plan('ski SilverStar 2 days');
    assert.ok(!p.days.some((day) => day.stops.some((s) => s.daypart === 'evening' && s.venue && s.venue.id === pub.id)), 'restaurants first');
    const asked = plan('ski SilverStar 2 days with apres at the pub').p;
    assert.ok(asked.days.length === 2);
  });
});

test('Lunch at a winery: a winery’s own restaurant is the lunch, from the next town when needed', () => {
  withFacts([
    { name: 'Hillside Winery', region: 'naramata', type: 'winery', rating: 4.6, hours: open('10:00', '18:00') },
    { name: 'The Bistro at Hillside Winery', region: 'naramata', type: 'restaurant', rating: 4.5, price: 3, desc: 'The restaurant at Hillside Winery, with a patio over the vineyard.', hours: open('11:30', '20:00') },
  ], ([, bistro]) => {
    for (const text of ['lunch at a winery Naramata, 1 day', 'lunch at a winery in Penticton, 1 day', '2 days in Naramata wineries, lunch at a winery']) {
      const { p } = plan(text, { startDate: '2026-10-24' });
      assert.equal(p.theme, 'wine', text);
      const lunch = p.days[0].stops.find((s) => s.daypart === 'midday');
      assert.equal(lunch && lunch.venue && lunch.venue.id, bistro.id, `${text}: ${p.days[0].stops.map((s) => `${s.daypart}:${s.venue && s.venue.name}`).join(', ')}`);
      assert.ok(p.days[0].stops.filter((s) => s.venue && s.venue.type === 'winery').length >= 2, text);
    }
    const penticton = plan('lunch at a winery in Penticton, 1 day', { startDate: '2026-10-24' }).p.days[0].stops.find((s) => s.daypart === 'midday');
    assert.ok(penticton.caveats.some((c) => /^In Naramata, about \d+ minutes’ drive/.test(c)), JSON.stringify(penticton.caveats));
  });
  const names = tp.wineryNameWords([{ type: 'winery', name: 'Hester Creek Estate Winery' }, { type: 'winery', name: 'Gray Monk Estate Winery' }]);
  const rest = (name, desc = '') => tp.wineryRestaurant({ type: 'restaurant', name, textName: d.normalizeDiscoveryText(name), textDesc: d.normalizeDiscoveryText(desc) }, names);
  assert.ok(rest('Terrafina at Hester Creek'));
  assert.ok(rest('The Patio At Lake Breeze', 'The restaurant side of Lake Breeze Vineyards, a beautiful patio.'));
  assert.ok(rest('Home Block at CedarCreek Estate Winery'));
  assert.ok(!rest('THYME at Ellison Lake', 'A family restaurant near Ellison Lake Park.'));
  assert.ok(!rest('Masa’s Grill at The Harvest Golf Club', 'A golf club restaurant.'));
});

test('Swap: ski plans never 409 on a repeated stop, the resort has no Swap, and the message names the place', () => {
  for (const text of ['ski Big White 3 days in January', 'ski SilverStar 2 days']) {
    const first = plan(text);
    const all = {};
    for (const day of first.p.days) for (const s of day.stops) if (s.venue) all[`${day.day}-${s.daypart}`] = s.venue.id;
    for (const day of first.p.days) { const resort = day.stops.find((s) => s.daypart === 'morning'); assert.ok(resort.noSwap, `${text}: the resort is not swapped`); }
    for (const key of Object.keys(all)) {
      const pinned = { ...all };
      const out = pinned[key];
      delete pinned[key];
      assert.doesNotThrow(() => tp.planTrip({ intent: I(text), trip: null, requirements: first.requirements, facts: FACTS, labels: LABELS, text, tripDate: first.requirements.startDate || '2026-10-18', pinned, excludeIds: [out], tripEvents: [] }), `${text}: swap ${key}`);
    }
  }
  // A pin that truly cannot be kept says which place and day, never "(2-morning)".
  const p = plan('2 days Naramata wineries');
  const winery = p.p.days[0].stops.find((s) => s.venue && s.venue.type === 'winery');
  assert.throws(() => tp.planTrip({ intent: I('2 days Naramata wineries'), trip: null, requirements: p.requirements, facts: FACTS, labels: LABELS, text: '2 days Naramata wineries', tripDate: '2026-10-18', pinned: { '1-night': winery.venue.id }, tripEvents: [] }),
    (e) => e.code === 'TRIP_CONFLICT' && /^A locked stop cannot be kept: .+ on day 1 no longer fits this plan\./.test(e.message) && !/\d-(?:morning|evening)/.test(e.message));
});

test('Swap: the new stop is the same kind of place', () => {
  const text = '2 days Naramata wineries';
  const first = plan(text, { startDate: '2026-10-24' });
  const day = first.p.days[0];
  const tasting = day.stops.find((s) => s.daypart === 'afternoon' && s.venue && s.venue.type === 'winery');
  const pinned = {};
  for (const dd of first.p.days) for (const s of dd.stops) if (s.venue && !(dd.day === 1 && s.daypart === 'afternoon')) pinned[`${dd.day}-${s.daypart}`] = s.venue.id;
  // A waterfall is near; the swap still gives a winery.
  withFacts([{ name: 'Naramata Creek Falls', region: 'naramata', type: 'outdoor', rating: 5, reviews: 4000, activities: ['hiking', 'nature', 'viewpoints'], desc: 'A waterfall walk.' }], () => {
    const again = tp.planTrip({ intent: I(text), trip: null, requirements: first.requirements, facts: FACTS, labels: LABELS, text, tripDate: '2026-10-24', pinned, excludeIds: [tasting.venue.id], swap: { key: '1-afternoon', type: 'winery' }, tripEvents: [] });
    const now = again.days[0].stops.find((s) => s.daypart === 'afternoon');
    assert.equal(now.venue.type, 'winery');
    assert.notEqual(now.venue.id, tasting.venue.id);
  });
  // Unit: a swapped-in stop of another kind is replaced by one of the kind asked for.
  const fake = { days: [{ day: 1, region: 'naramata', stops: [{ daypart: 'afternoon', label: 'Afternoon', venue: { id: -1, type: 'outdoor', name: 'X' } }] }] };
  tp.applySwapPreference(fake, { swap: { key: '1-afternoon', type: 'winery' }, facts: FACTS, labels: LABELS, intent: I(text), tripDate: '2026-10-24' });
  assert.equal(fake.days[0].stops[0].venue.type, 'winery');
  assert.equal(fake.days[0].stops[0].daypart, 'afternoon');
});

test('No driving after X: dinner is a walk from the last stop where one is listed; otherwise the plan says so', () => {
  // Day 1 in Naramata: a bistro within walking distance of the last tasting is chosen.
  const { p } = plan('2 days Naramata wineries, no driving after 7pm', { startDate: '2026-10-24' });
  const d1 = p.days[0].stops.filter((s) => s.venue), dinner = d1[d1.length - 1], before = d1[d1.length - 2];
  const km = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  assert.ok(km(before.venue, dinner.venue) <= 1.5, `${before.venue.name} -> ${dinner.venue.name}`);
  assert.ok(!(p.unsupported || []).some((u) => /driv/.test(u)));
  assert.ok(p.notes.some((n) => /^No driving after 19:00: dinner is a short walk from the day’s last stop/.test(n)), p.notes.join(' | '));
  // An early cut-off that the listings cannot meet (Naramata's bistros are closed on Sunday) is said, day by day.
  const early = plan('2 days Naramata wineries, no driving after 5pm', { startDate: '2026-10-24' }).p;
  const rule = early.requirementResults.find((i) => i.kind === 'evening_walk');
  assert.equal(rule.status, 'unverified');
  assert.match(rule.reason, /^The drive to dinner comes after 17:00 on day 2: no listed dinner spot is within walking distance of the day’s last stop\.$/);
  assert.equal(t3FrenchText(rule.reason), 'Le trajet pour le souper se fait après 17:00 le jour 2 : aucun restaurant répertorié n’est à distance de marche du dernier arrêt de la journée.');
  assert.match(t3FrenchText('About 0.8 km on foot from Naramata Bench Winery 2, so the evening needs no car'), /^Environ 0,8 km à pied de Naramata Bench Winery 2/);
});

test('Dates: a dated plan with nothing else to check is timed and keeps its dates (romantic weekend in Kelowna)', () => {
  const { p } = plan('romantic weekend in Kelowna', { startDate: '2026-10-24', startMinutes: 540 });
  assert.deepEqual(p.days.map((day) => day.date), ['2026-10-24', '2026-10-25']);
  assert.ok(p.schedule.length >= 6 && p.schedule.every((x) => x.date && Number.isFinite(x.startMinutes)), JSON.stringify(p.schedule.map((x) => [x.date, x.startMinutes])));
  // English shows dates, never ISO.
  const shown = v3.t3LocalTimes(p, 'en');
  const text = [...shown.notes, ...shown.warnings, ...shown.days.flatMap((day) => day.stops.flatMap((s) => [...(s.why || []), ...(s.caveats || []), s.scheduleNote || '']))].join(' | ');
  assert.ok(!/\b20\d\d-\d\d-\d\d\b/.test(text), text.match(/.{0,40}20\d\d-\d\d-\d\d.{0,20}/));
  assert.ok(shown.notes.includes('Trip starts on Sat, Oct 24, 2026 (Okanagan calendar date).'), shown.notes.join(' | '));
  assert.equal(shown.days[0].date, '2026-10-24', 'data fields stay as they are');
});

test('Timing: a stop with no visit estimate gets a provisional time, so later stops are never "Timing unverified"', () => {
  const { p } = plan('2 days in Penticton on a budget, students', { startDate: '2026-10-24', startMinutes: 540 });
  assert.ok(p.schedule.length >= 6);
  assert.ok(p.schedule.every((x) => x.status !== 'unverified' && Number.isFinite(x.startMinutes)), JSON.stringify(p.schedule.map((x) => x.status)));
});

test('Events: a comedian is not live music, and a comedy show finds a comedian’s own show', () => {
  const bhoy = { name: 'Danny Bhoy Live', categories: ['live-music'], description: 'Scottish comedian Danny Bhoy returns on his ninth cross-Canada tour.' };
  assert.equal(tp.eventSuitsKind(bhoy, 'live-music'), false);
  assert.equal(tp.eventSuitsKind(bhoy, 'comedy'), true);
  assert.equal(tp.eventSuitsKind({ name: 'Live Music: Eric Kane', categories: ['live-music'], description: 'Acoustic covers.' }, 'live-music'), true);
  assert.equal(r.eventMatches(bhoy, { kind: 'event', value: 'live-music' }), false);
  assert.equal(r.eventMatches({ name: 'Eric Kane', categories: ['live-music'], description: 'Acoustic covers.' }, { kind: 'event', value: 'live-music' }), true);
  const comedy = r.extractTripRequirements({ text: 'comedy show Kelowna this week', intent: {}, trip: {}, taxonomy: TAXONOMY }).items.find((i) => i.kind === 'event');
  assert.ok(r.eventMatches(bhoy, comedy));
  const music = plan('live music every evening Kelowna 2 days', { startDate: '2026-10-21', events: [ev({ name: 'Danny Bhoy Live', region: 'kelowna', categories: ['live-music'], date: '2026-10-21', time: '7:30 pm' }), ev({ name: 'Live Music: Wednesday Blues', region: 'kelowna', categories: ['live-music'], date: '2026-10-21', time: '8 pm' })].map((e) => (e.name === 'Danny Bhoy Live' ? { ...e, description: bhoy.description } : e)) }).p;
  assert.ok(!music.days.some((day) => day.stops.some((s) => s.event && /Bhoy/.test(s.event.name))), 'not a live-music evening');
});

test('French: reason lines, the map credit, the category word and the length prompt', () => {
  assert.equal(t3FrenchText('Has the Lake View badge'), 'Possède le badge Vue sur le lac');
  assert.equal(t3FrenchText('A restaurant suits a romantic outing'), 'Un restaurant convient à une sortie romantique');
  assert.equal(t3FrenchText('An outdoor destination suits a family trip'), 'Un lieu de plein air convient à un voyage en famille');
  assert.equal(t3FrenchText('Its description mentions “cozy”'), 'Sa description mentionne « chaleureux »');
  assert.equal(t3FrenchText('Its description mentions “intimate”'), 'Sa description mentionne « intime »');
  assert.equal(t3FrenchText('Lunch at a winery’s restaurant'), 'Dîner au restaurant d’un vignoble');
  const { p } = plan('romantic weekend in Kelowna', { startDate: '2026-10-24' });
  const f = v3.t3LocalTimes(t3FrenchPlan(p), 'fr');
  const why = f.days.flatMap((day) => day.stops.flatMap((s) => s.why || []));
  assert.deepEqual(why.filter((w) => /\b(?:Has the|suits a|mentions)\b/.test(w)), []);
  const steps = v3.t3PlanNextSteps({ requirementResults: [{ kind: 'event', value: 'any', eventKind: 'comedy', status: 'unmet' }, { kind: 'event', value: 'nightlife', status: 'unmet', id: 'x' }, { kind: 'type', value: 'winery', status: 'unmet' }] });
  assert.deepEqual(steps.map((s) => [s.label, s.labelFr]), [['comedy show', 'spectacle d’humour'], ['event', 'événement'], ['winery', 'vignoble']]);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(src.includes("geo: 'Fourni par Geoapify'"));
  assert.ok(src.includes("if (editBtn) { editBtn.textContent = editText('edit');"), 'the edit bar is in the page language from the start');
  assert.ok(src.includes("u.lengthAsked === false"), 'a request with no length asks for one');
  assert.ok(src.includes("'✓ Your request matched a listing'"), 'one request is not "All 1"');
});

test('Accessibility: Favorite buttons are named and pressed, the Pace select is 32px, day sections and chips are steady', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(src.includes(`'<button type="button" class="card-action fav-btn" data-fav-name="' + esc(v.name) + '" aria-pressed="false" aria-label="' + esc(lang() === 'fr' ? 'Ajouter ' + v.name + ' aux favoris' : 'Favorite ' + v.name) + '">Favorite</button>'`));
  assert.match(src, /\.t3-chip select \{[^}]*min-height: 32px;/);
  assert.ok(src.includes(`'<section class="t3-day" id="t3-day-' + d.day + '" aria-label="' + esc(tx('tripv3.day', { n: d.day }) + ' \\u00b7 ' + (d.regionLabel || tx('tripv3.theOkanagan'))) + '">'`));
  assert.match(src, /\.t3-examples \{ min-height: 120px; align-content: flex-start; \}/);
  assert.match(src, /html\[lang="fr"\] \.t3-examples \{ min-height: 260px; \}/);
  assert.ok(src.includes("html += (stop.noSwap ? '' : '<button type=\"button\" class=\"t3-act\" data-t3-swap="), 'the resort has no Swap');
  const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  assert.ok(app.includes("if (pressedNow != null && pressedNow !== String(isFav)) btn.setAttribute('aria-pressed', String(isFav));"));
});

test('Swap on the page: a failed edit restores the exclusions, and the swap sends the kind of place', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(src.includes("if (['replace','regenerate','regenerate_day'].indexOf(requestType) !== -1 && state.lastReq) state.exclude = (state.lastReq.exclude || []).slice();"));
  assert.ok(src.includes("swap: { key: sk, type: ss.venue.type, id: ss.venue.id, locked: ")); // id since round 7: kept when nothing else fits; locked since round 8
});

// ---- My Trip: the tray keeps a repeated place as its own stop ----
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const TRAY_JS = APP_JS.slice(APP_JS.indexOf('/* ---------- Trip planner: build a multi-stop route across saved venues ---------- */'), APP_JS.indexOf('/* ---------- Build My Trip, Stage 2: /trip planner page'));
function trayBoot(buttons, saved) {
  const store = new Map(saved ? [['okanaganTrip', JSON.stringify(saved)]] : []);
  const mk = (id) => ({ id, dataset: {}, style: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, contains: () => false, setAttribute() {}, getAttribute: () => null, querySelector: () => null });
  const els = Object.fromEntries(['tripTrayToggle', 'tripTrayPanel', 'tripTrayList', 'tripTrayCount', 'tripRouteBtn', 'tripClearBtn', 'tripTrayMessage'].map((id) => [id, mk(id)]));
  let docClick = null;
  const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, trackEvent() {}, CARD_REGION_LABEL: {}, open() {} };
  const document = { getElementById: (id) => els[id] || null, querySelectorAll: (sel) => (sel === '.trip-btn' ? buttons : []), addEventListener: (type, fn) => { if (type === 'click') docClick = fn; } };
  const ctx = { window, document, t: (k) => k, setTimeout, clearTimeout, parseInt, JSON, String, Array, Object, Math };
  vm.createContext(ctx);
  vm.runInContext(TRAY_JS, ctx);
  return { click: (b) => docClick({ target: b }), stored: () => JSON.parse(store.get('okanaganTrip') || '[]') };
}
function planBtn(name, ref, slot) {
  const classes = new Set(['trip-btn']);
  const b = { dataset: { tripName: name, tripRegion: 'big-white', tripQuery: name, tripRef: ref }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) }, closest: (sel) => (sel === '.trip-btn' ? b : null) };
  if (slot) b.dataset.tripSlot = String(slot);
  Object.defineProperty(b, 'textContent', { set() {}, get: () => '' });
  return b;
}

test('My Trip: the same place on another day is its own stop; an old saved trip is read as before', () => {
  const d1 = planBtn('Big White Ski Resort', 'venue:7'), d2 = planBtn('Big White Ski Resort', 'venue:7', 2), d3 = planBtn('Big White Ski Resort', 'venue:7', 3);
  const t = trayBoot([d1, d2, d3]);
  t.click(d1); t.click(d2); t.click(d3);
  assert.deepEqual(t.stored().map((x) => [x.ref, x.key || null]), [['venue:7', null], ['venue:7', 'venue:7@2'], ['venue:7', 'venue:7@3']]);
  assert.ok(d1.classList.contains('in-trip') && d2.classList.contains('in-trip') && d3.classList.contains('in-trip'));
  t.click(d2);
  assert.deepEqual(t.stored().map((x) => x.key || x.ref), ['venue:7', 'venue:7@3'], 'removing day 2 leaves day 1 and day 3');
  // A malformed or mismatched key is dropped; the stop stays.
  const old = trayBoot([], [{ name: 'A', ref: 'venue:1', key: 'venue:2@2' }, { name: 'B', ref: 'venue:3', key: 'venue:3@4' }]);
  old.click({ closest: () => null, dataset: {} });
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page.includes("(opts.planStop && key && v.id && repeatDay(v.id, Number(key.split('-')[0])) ? ' data-trip-slot=\"' + esc(key.split('-')[0]) + '\"' : '')"));
  assert.ok(page.includes("localStorage.setItem('okanaganTripDrives', JSON.stringify(driveMap));"), 'drive legs go to My Trip');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(server.includes("function keyOf(t){ return (t && t.key) || (t && t.ref) || null; }") && server.includes('<li class="mt-drive">'), '/my-trip reads repeat keys and shows drive rows');
});
