// Build My Trip V4 (2026-11-20): a Kelowna fixture shaped like the live listings for
// "3 days in Kelowna with my partner, wineries, a nice dinner and a hike": trails, eight wineries with listed hours,
// sit-down restaurants (two $$$), a sports bar and a pub that serve dinner, and cafés. PURE (no server, no database).
'use strict';
const d = require('../../discovery-intent.js');
const r = require('../../trip-requirements.js');
const tp = require('../../trip-planner.js');

const REGIONS = { kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', 'lake-country': 'Lake Country', penticton: 'Penticton' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'great_groups', 'lake_view'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: [], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor') },
  activities: { hiking: 'Hiking & Trails', viewpoints: 'Viewpoints', nature: 'Nature' },
  features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', great_groups: 'Great for Groups', patio: 'Patio', lake_view: 'Lake View' }, featureNouns: {}, collections: {},
};
const CENTRES = { kelowna: [49.888, -119.496], 'west-kelowna': [49.863, -119.564], 'lake-country': [50.053, -119.414], penticton: [49.491, -119.589] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to, closed = []) => Object.fromEntries(WEEK.map((k) => [k, closed.includes(k) ? [] : [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: 300, price: o.price === undefined ? null : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: o.cuisine || null, cuisineLabel: o.cuisine || null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: d.normalizeDiscoveryText(o.cuisine || ''), textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: [], fdTypes: o.fdTypes || [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: null, seasonClosedToday: false, seasonReopens: undefined,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
for (let i = 0; i < 4; i++) add({ name: `Kelowna Ridge Trail ${i + 1}`, region: 'kelowna', type: 'outdoor', rating: 4.7 - i * 0.05, activities: ['hiking', 'viewpoints'], desc: 'A 6 km loop hiking trail to a lake viewpoint.', dLat: 0.02 * i, dLng: -0.01 * i });
for (let i = 0; i < 8; i++) add({ name: `Mission Hill Estate Winery ${i + 1}`.replace('Mission Hill', ['Summit', 'Cedar', 'Quail', 'Tantalus', 'Ancient', 'Vibrant', 'Martin', 'Hubertus'][i]), region: 'kelowna', type: 'winery', rating: 4.8 - i * 0.03, hours: open('10:30', '17:30'), dLat: -0.03 + 0.008 * i, dLng: 0.02 });
const SPORTS_BAR = add({ name: 'Hey Hey Bar & Grill', region: 'kelowna', type: 'restaurant', rating: 4.6, price: 2, cuisine: 'Sports bar', desc: 'A sports bar and grill with wings, burgers and the game on every screen.', hours: open('11:00', '23:00'), features: { sports_tv: true, great_groups: true, kid_friendly: true } });
const PUB = add({ name: "Kelly O'Bryan's", region: 'kelowna', type: 'pub', rating: 4.5, price: 2, desc: 'An Irish pub with a full kitchen.', hours: open('11:00', '23:00'), features: { great_groups: true } });
const FINE = [
  add({ name: 'Wildling', region: 'kelowna', type: 'restaurant', rating: 4.7, price: 3, cuisine: 'Modern Canadian', desc: 'Seasonal menu and a long wine list.', hours: open('17:00', '22:00', ['mon']), dLat: 0.003 }),
  add({ name: 'Bouchons Bistro', region: 'kelowna', type: 'restaurant', rating: 4.6, price: 3, cuisine: 'French', desc: 'A French bistro with a prix fixe menu.', hours: open('17:00', '22:00'), dLat: 0.004 }),
];
const SITDOWN = [
  add({ name: 'Salt & Brick', region: 'kelowna', type: 'restaurant', rating: 4.6, price: 2, cuisine: 'Small plates', desc: 'Small plates and cocktails downtown.', hours: open('16:00', '22:00'), dLat: 0.002 }),
  add({ name: 'Krafty Kitchen', region: 'kelowna', type: 'restaurant', rating: 4.6, price: 2, cuisine: 'Canadian', desc: 'Brunch, lunch and dinner from scratch.', hours: open('10:00', '21:00'), dLat: 0.001 }),
];
const LUNCH = [
  add({ name: 'Kelowna Lunch Kitchen', region: 'kelowna', type: 'restaurant', rating: 4.5, price: 2, cuisine: 'Cafe', desc: 'Sandwiches, salads and soups for lunch.', hours: open('10:00', '16:00'), dLat: -0.01 }),
  add({ name: 'Orchard Table', region: 'kelowna', type: 'restaurant', rating: 4.5, price: 2, cuisine: 'Farm to table', desc: 'Lunch on the patio.', hours: open('11:00', '15:00'), dLat: -0.02, dLng: 0.02 }),
];
const CAFES = [0, 1].map((i) => add({ name: `Bench Coffee ${i + 1}`, region: 'kelowna', type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee, pastries and lunch.', hours: open('07:00', '16:00'), dLat: 0.005 * i }));
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

function plan(text, opts = {}) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: opts.today || '2026-11-21' });
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: opts.facts || FACTS, labels: LABELS, text, tripDate: requirements.startDate || opts.today || '2026-11-21', events: null, tripEvents: trip.multi ? trip.components.map((c) => (c.kind === 'event' ? [] : null)) : [], clock: opts.clock, startWeekday: opts.startWeekday, ...(opts.extra || {}) });
  return p;
}
module.exports = { plan, FACTS, BY_ID, SPORTS_BAR, PUB, FINE, SITDOWN, LUNCH, CAFES, add, open, REGIONS, LABELS, TAXONOMY };
