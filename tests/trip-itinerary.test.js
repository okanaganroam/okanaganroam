// Build My Trip multi-part itineraries (2026-09-26): interpretTripComponents()
// in discovery-intent.js + planItinerary() in trip-planner.js.
//
// PURE tests: no server.js, no database. A Highway 97 fixture (Kelowna to
// Penticton) of verified venue facts, plus What's On events passed in exactly
// as the server hands them to the planner. The single-request planner and the
// discovery interpreter are covered, unchanged, by their own test files; the
// last tests here prove those paths are not taken over.

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');

const REGIONS = {
  vernon: 'Vernon', 'lake-country': 'Lake Country', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland',
  summerland: 'Summerland', penticton: 'Penticton', naramata: 'Naramata', osoyoos: 'Osoyoos',
};
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor'],
  features: ['dog_friendly', 'vegan', 'vegetarian', 'patio', 'kid_friendly', 'gluten_free', 'lake_view', 'nonalcoholic', 'sports_tv', 'live_music', 'great_groups', 'happy_hour'],
  collections: ['hidden_gem', 'local_favorite', 'dog_friendly'],
  activities: ['hiking', 'cycling', 'winter', 'camping', 'nature', 'water', 'viewpoints', 'adventure', 'fishing'],
  cuisines: ['japanese', 'italian'],
  budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'],
  eventCategories: ['events-festivals', 'markets-fairs', 'live-music', 'sports-recreation', 'family-kids'],
  venues: [],
};
const LABELS = {
  regions: REGIONS,
  types: {
    restaurant: { singular: 'Restaurant', plural: 'Restaurants' }, winery: { singular: 'Winery', plural: 'Wineries' },
    cafe: { singular: 'Cafe', plural: 'Cafes' }, brewery: { singular: 'Brewery', plural: 'Breweries' }, pub: { singular: 'Pub', plural: 'Pubs' },
    cocktail: { singular: 'Cocktail Lounge', plural: 'Cocktail Lounges' }, distillery: { singular: 'Distillery', plural: 'Distilleries' },
    golf: { singular: 'Golf Course', plural: 'Golf Courses' }, beach: { singular: 'Beach', plural: 'Beaches' }, outdoor: { singular: 'Outdoor Destination', plural: 'Outdoor Destinations' },
  },
  activities: { hiking: 'Hiking & Trails', nature: 'Nature & Wildlife', viewpoints: 'Viewpoints' },
  features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', live_music: 'Live Music' },
  featureNouns: { dog_friendly: 'dog-friendly spots' },
  collections: { hidden_gem: 'Hidden Gems', local_favorite: 'Local Favourites', dog_friendly: 'dog-friendly beaches' },
};
const CENTRES = {
  vernon: [50.27, -119.27], 'lake-country': [50.05, -119.41], kelowna: [49.88, -119.49], 'west-kelowna': [49.86, -119.58],
  peachland: [49.77, -119.73], summerland: [49.60, -119.67], penticton: [49.49, -119.59], naramata: [49.59, -119.59], osoyoos: [49.03, -119.47],
};
let nextId = 1;
function fact(o) {
  const id = nextId++;
  const [lat, lng] = o.noCoords ? [null, null] : CENTRES[o.region];
  return {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.4 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: null, address: null, lat, lng,
    cuisine: null, cuisineLabel: null, textName: d.normalizeDiscoveryText(o.name), textCuisine: '', textDesc: d.normalizeDiscoveryText(o.desc || ''),
    features: Object.fromEntries((o.features || []).map((f) => [f, true])), collections: o.collections || [], activities: o.activities || [], fdTypes: [],
    indoorGolf: false, hours: o.hours || null,
  };
}
const FACTS = [
  // Dog-friendly cafes along Highway 97, and a better-rated cafe that is not.
  fact({ name: 'Kelowna Dog Cafe', region: 'kelowna', type: 'cafe', features: ['dog_friendly'], rating: 4.5 }),
  fact({ name: 'Kelowna Top Cafe', region: 'kelowna', type: 'cafe', rating: 4.9 }),
  fact({ name: 'Summerland Dog Cafe', region: 'summerland', type: 'cafe', features: ['dog_friendly'], rating: 4.6 }),
  fact({ name: 'Vernon Dog Cafe', region: 'vernon', type: 'cafe', features: ['dog_friendly'], rating: 5.0 }),
  fact({ name: 'Naramata Dog Cafe', region: 'naramata', type: 'cafe', features: ['dog_friendly'], rating: 4.8 }),
  // Beaches: dog access is the dog_friendly collection (no badge, no coordinates).
  fact({ name: 'Peachland Dog Beach', region: 'peachland', type: 'beach', collections: ['dog_friendly'], rating: null, reviews: 0, noCoords: true }),
  fact({ name: 'Penticton Swim Beach', region: 'penticton', type: 'beach', rating: null, reviews: 0 }),
  fact({ name: 'Osoyoos Dog Beach', region: 'osoyoos', type: 'beach', collections: ['dog_friendly'], rating: null, reviews: 0 }),
  // Dinner: the best-rated room is in Kelowna; the event is in Summerland.
  fact({ name: 'Kelowna Fine Dining', region: 'kelowna', type: 'restaurant', rating: 4.9, reviews: 900 }),
  fact({ name: 'Summerland Bistro', region: 'summerland', type: 'restaurant', rating: 4.3 }),
  // Wineries: the top one is NOT dog friendly.
  fact({ name: 'Kelowna Grand Winery', region: 'kelowna', type: 'winery', rating: 4.9 }),
  fact({ name: 'Kelowna Dog Winery', region: 'kelowna', type: 'winery', features: ['dog_friendly'], rating: 4.2 }),
  // Live Music badge (for the no-event fallback) -- on a pub, never on the winery.
  fact({ name: 'Kelowna Music Pub', region: 'kelowna', type: 'pub', features: ['live_music'] }),
  // A second community with a dog-friendly winery (Vernon's cafe is the best-rated dog-friendly cafe).
  fact({ name: 'Vernon Dog Winery', region: 'vernon', type: 'winery', features: ['dog_friendly'], rating: 4.0 }),
  // Golf only in Kelowna (for the fallback test).
  fact({ name: 'Kelowna Golf Club', region: 'kelowna', type: 'golf', rating: 4.5 }),
  // Peachland outdoor activities.
  fact({ name: 'Peachland Hilltop Trail', region: 'peachland', type: 'outdoor', activities: ['hiking'], rating: null, reviews: 0 }),
  fact({ name: 'Peachland Fishing Pier', region: 'peachland', type: 'outdoor', activities: ['fishing'], rating: null, reviews: 0 }),
  // Family places.
  fact({ name: 'Kelowna Family Park', region: 'kelowna', type: 'outdoor', activities: ['nature'], rating: null, reviews: 0 }),
  fact({ name: 'Kelowna Sunny Beach', region: 'kelowna', type: 'beach', activities: ['water'], rating: null, reviews: 0 }),
];
const byId = new Map(FACTS.map((v) => [v.id, v]));
const HOCKEY_7PM = { id: 901, name: 'Summerland Jets Home Games', region: 'summerland', url: '/summerland/events/jets', valleyWide: false, categories: ['sports-recreation'], dateLabel: 'next Fri Oct 2', time: '7 pm', startDate: '2026-10-02' };
const HOCKEY_VARY = { ...HOCKEY_7PM, id: 902, name: 'Osoyoos Coyotes Home Games', region: 'osoyoos', url: '/osoyoos/events/coyotes', time: 'Times vary' };
const CONCERT = { id: 903, name: 'Lakeside Concert', region: 'kelowna', url: '/kelowna/events/concert', valleyWide: false, categories: ['live-music'], dateLabel: 'Sat Oct 3', time: '8 pm', startDate: '2026-10-03' };
const FAMILY_EVENT = { id: 904, name: 'Harvest Family Fair', region: 'kelowna', url: '/kelowna/events/fair', valleyWide: false, categories: ['family-kids'], dateLabel: 'Sat Oct 3', time: '10 am', startDate: '2026-10-03' };

const EVENING_EVENT = { id: 905, name: 'Autumn Lantern Walk', region: 'kelowna', url: '/kelowna/events/lanterns', valleyWide: false, categories: ['community-events'], dateLabel: 'Fri Oct 2', time: '7 pm', startDate: '2026-10-02' };
const VARY_EVENT = { id: 906, name: 'Night Market Series', region: 'kelowna', url: '/kelowna/events/market', valleyWide: false, categories: ['markets-fairs'], dateLabel: 'Fridays in October', time: 'Times vary', startDate: '2026-10-02' };

const split = (q) => d.interpretTripComponents(q, TAXONOMY, d.interpretDiscoveryQuery(q, TAXONOMY));
function run(q, events = {}) {
  const intent = d.interpretDiscoveryQuery(q, TAXONOMY);
  const trip = d.interpretTripComponents(q, TAXONOMY, intent);
  const tripEvents = trip.components.map((c) => (c.kind === 'event' ? (events[c.event.kind] || []) : null));
  return { trip, plan: tp.planTrip({ intent, trip, tripEvents, facts: FACTS, labels: LABELS }) };
}
const venueStops = (p) => p.itinerary.stops.filter((s) => s.kind === 'venue');
const sentences = (t) => (t.match(/[.!?](\s|$)/g) || []).length;
const NO_MATCH_ALL = 'No Okanagan Roam listings match every part of that request.';

// ---- request 1: the dog-friendly road trip ---------------------------------
test('request 1: Kelowna -> Penticton with a dog: a dog-friendly cafe AND a dog-friendly beach, on the corridor, north to south', () => {
  const q = "I'm driving from Kelowna to Penticton with my dog, I want cafes and beaches that are dog friendly.";
  const { trip, plan } = run(q);
  assert.equal(trip.multi, true);
  assert.deepEqual(trip.route, { from: 'kelowna', to: 'penticton', via: 'from_to' });
  assert.deepEqual(trip.components.map((c) => [c.kind, c.types, c.dog]), [['venue', ['cafe'], true], ['venue', ['beach'], true]]);
  assert.equal(plan.kind, 'itinerary');
  const corridor = ['kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton'];
  assert.deepEqual(plan.itinerary.route.regions.map((r) => r.slug), corridor);
  const stops = venueStops(plan);
  const types = stops.map((s) => s.venue.type);
  assert.ok(types.includes('cafe') && types.includes('beach'), `both parts filled: ${types}`);
  for (const s of stops) {
    const v = byId.get(s.venue.id);
    assert.ok(corridor.includes(v.region), `${v.name} is on the corridor`);
    assert.ok(v.features.dog_friendly || v.collections.includes('dog_friendly'), `${v.name} is dog friendly`);
  }
  // North to south along the corridor (Peachland's beach before Summerland's cafe).
  const order = stops.map((s) => corridor.indexOf(s.venue.region));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.ok(!stops.some((s) => s.venue.name === 'Kelowna Top Cafe'), 'the better-rated cafe is not dog friendly');
  assert.ok(!stops.some((s) => ['Vernon Dog Cafe', 'Naramata Dog Cafe', 'Osoyoos Dog Beach'].includes(s.venue.name)), 'off-corridor places are not used');
  assert.ok(!plan.warnings.includes(NO_MATCH_ALL));
  assert.ok(!JSON.stringify(plan.itinerary).includes('driving'), '"driving" is never a search term');
  assert.equal(plan.experience.title, 'What to expect');
  assert.match(plan.experience.text, /^Enjoy an easygoing drive south from Kelowna to Penticton with your dog, stopping for some time on the beach and coffee along the way\./, 'stops are named in travel order: Peachland beach, then Summerland cafe');
  assert.ok(sentences(plan.experience.text) <= 3);
  assert.equal(plan.summary, 'Dog-friendly cafes and beaches from Kelowna to Penticton.');
});

// ---- request 2: dinner and a hockey game -----------------------------------
test('request 2: dinner and a hockey game: dinner in the event’s region, before a 7 pm game', () => {
  const { trip, plan } = run('I want to go for dinner and a hockey game.', { hockey: [HOCKEY_7PM] });
  assert.equal(trip.multi, true);
  assert.deepEqual(trip.components.map((c) => c.kind), ['venue', 'event']);
  const [first, second] = plan.itinerary.stops;
  assert.equal(first.kind, 'venue');
  assert.equal(first.venue.name, 'Summerland Bistro', 'dinner is in Summerland, where the game is, over a better-rated Kelowna room');
  assert.equal(first.daypart, 'evening');
  assert.equal(second.kind, 'event');
  assert.equal(second.event.id, HOCKEY_7PM.id);
  assert.equal(second.timeKnown, true);
  assert.deepEqual(second.caveats, []);
  assert.deepEqual(plan.warnings, []);
  assert.equal(plan.experience.title, 'What to expect');
  assert.equal(plan.experience.text, 'Start with a relaxed dinner in Summerland, then head to the rink for the hockey game. The game starts at 7 pm, so there’s time to enjoy dinner first.');
  assert.equal(plan.summary, 'Dinner and a hockey game.');
});

test('events: a "Times vary" game keeps the uncertainty -- no invented start time', () => {
  const { plan } = run('dinner and a hockey game', { hockey: [HOCKEY_VARY] });
  const ev = plan.itinerary.stops.find((s) => s.kind === 'event');
  assert.equal(ev.timeKnown, false);
  assert.match(ev.caveats[0], /Start times vary/);
  assert.equal(plan.itinerary.stops[0].venue.name, 'Kelowna Fine Dining', 'no restaurant where the game is, so the best dinner anywhere');
  assert.match(plan.experience.text, /Start times vary, so check the event page/);
  assert.ok(!/\d\s?(am|pm)/.test(plan.experience.text), 'no time is stated');
});

// ---- the other multi-part requests -----------------------------------------
test('wine tasting and live music: a winery + a live-music event; neither is asked to be both', () => {
  const withEvent = run('wine tasting and live music', { 'live-music': [CONCERT] }).plan;
  assert.deepEqual(withEvent.itinerary.stops.map((s) => s.kind).sort(), ['event', 'venue']);
  assert.equal(venueStops(withEvent)[0].venue.type, 'winery');
  assert.equal(venueStops(withEvent)[0].venue.name, 'Kelowna Grand Winery', 'the winery needs no live-music badge');
  // No event: the verified Live Music badge stands in, on a separate stop.
  const noEvent = run('wine tasting and live music').plan;
  const vs = venueStops(noEvent);
  assert.equal(vs.length, 2);
  assert.equal(vs.find((s) => s.venue.type === 'winery').venue.name, 'Kelowna Grand Winery');
  assert.equal(vs.find((s) => s.label === 'Live music').venue.name, 'Kelowna Music Pub');
  assert.ok(noEvent.notes.some((n) => /verified Live Music badge/.test(n)));
});

test('beach during the day and a concert at night: a daytime beach, then the evening concert', () => {
  const { trip, plan } = run('beach during the day and a concert at night', { concert: [CONCERT] });
  assert.deepEqual(trip.components.map((c) => [c.kind, c.daypart || null]), [['venue', 'afternoon'], ['event', 'evening']], '"at night" belongs to the concert');
  const [a, b] = plan.itinerary.stops;
  assert.equal(a.venue.type, 'beach');
  assert.equal(b.kind, 'event');
  assert.equal(b.daypart, 'evening', '8 pm');
  assert.equal(plan.experience.text, 'Spend some time on the beach during the day, then stay in Kelowna for an evening concert. The concert starts at 8 pm, so the day flows easily into the evening.');
});

test('family activities and an event this weekend: the family preference applies to the activity, the event keeps the weekend', () => {
  const { trip, plan } = run('family activities and an event this weekend', { event: [FAMILY_EVENT] });
  assert.equal(trip.party.kids, true);
  const activity = trip.components.find((c) => c.kind === 'venue');
  assert.equal(activity.kids, true);
  assert.deepEqual(activity.types, ['beach', 'outdoor']);
  assert.deepEqual(trip.when, { preset: 'this-weekend' });
  const v = venueStops(plan)[0];
  assert.ok(['beach', 'outdoor'].includes(v.venue.type));
  assert.ok(plan.itinerary.stops.some((s) => s.kind === 'event' && s.event.id === FAMILY_EVENT.id));
  assert.match(plan.summary, /this weekend\.$/);
});

test('cafe and beach: two parts, never one listing that is both', () => {
  const { trip, plan } = run('cafe and beach in Kelowna');
  assert.deepEqual(trip.components.map((c) => c.types), [['cafe'], ['beach']]);
  const types = venueStops(plan).map((s) => s.venue.type).sort();
  assert.deepEqual(types, ['beach', 'cafe']);
  assert.equal(plan.experience.text, 'Stop for coffee first, then spend some time on the beach. Both stops are in Kelowna, keeping the outing simple.');
});

test('a part with no match is reported on its own; the rest of the itinerary is kept', () => {
  const { plan } = run('dog friendly cafes and a distillery in Summerland');
  assert.equal(venueStops(plan).length, 1);
  assert.equal(venueStops(plan)[0].venue.name, 'Summerland Dog Cafe');
  assert.deepEqual(plan.warnings, ['No distilleries matched in Summerland, so the rest of the plan is shown.']);
  assert.ok(!plan.warnings.includes(NO_MATCH_ALL));
  const noGame = run('dinner and a hockey game').plan;
  assert.equal(noGame.itinerary.stops.length, 1);
  assert.match(noGame.warnings[0], /No hockey game is listed on What’s On/);
});

// ---- dog scoping ----------------------------------------------------------
test('dog scoping: an adjective distributes over a bare list, stops at a determiner; a dog in the party applies everywhere', () => {
  assert.deepEqual(split('dog friendly cafes and beaches').components.map((c) => c.dog), [true, true]);
  assert.deepEqual(split('dog friendly cafes and a winery').components.map((c) => c.dog), [true, false]);
  assert.deepEqual(split("I'm going with my dog, find cafes and a winery").components.map((c) => c.dog), [true, true]);
  assert.deepEqual(split('cafes and beaches that are dog friendly').components.map((c) => c.dog), [true, true]);
  // Planning honours it: the winery is the best one, not the dog-friendly one...
  const scoped = run('dog friendly cafes and a winery in Kelowna').plan;
  assert.equal(venueStops(scoped).find((s) => s.venue.type === 'winery').venue.name, 'Kelowna Grand Winery');
  assert.equal(venueStops(scoped).find((s) => s.venue.type === 'cafe').venue.name, 'Kelowna Dog Cafe');
  // ...unless the dog is coming along.
  const party = run("I'm going with my dog, find cafes and a winery in Kelowna").plan;
  assert.equal(venueStops(party).find((s) => s.venue.type === 'winery').venue.name, 'Kelowna Dog Winery');
  // A with-phrase belongs to the nearest part only.
  assert.deepEqual(split('cafes and a winery with live music').components.map((c) => c.features), [[], ['live_music']]);
});

// ---- routes ---------------------------------------------------------------
test('routes: from/to, between/and, on the way to, unknown towns, direction', () => {
  assert.deepEqual(split('cafes from Kelowna to Penticton').route, { from: 'kelowna', to: 'penticton', via: 'from_to' });
  assert.deepEqual(split('cafes between Kelowna and Penticton').route, { from: 'kelowna', to: 'penticton', via: 'between' });
  assert.deepEqual(split('cafes on the way to Penticton').route, { from: null, to: 'penticton', via: 'way_to' });
  const unknown = split('cafes from Smalltown to Penticton');
  assert.deepEqual(unknown.route, { from: null, to: 'penticton', via: 'from_to' });
  assert.deepEqual(unknown.unknownPlaces, ['smalltown']);
  const up = run('cafes from Smalltown to Penticton').plan;
  assert.ok(up.warnings.some((w) => /“smalltown” isn’t a place Okanagan Roam covers/.test(w)));
  assert.ok(up.notes.some((n) => /No starting point was given/.test(n)));
  assert.deepEqual(tp.routeRegions('kelowna', 'penticton'), ['kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton']);
  assert.deepEqual(tp.routeRegions('penticton', 'kelowna'), ['penticton', 'summerland', 'peachland', 'west-kelowna', 'kelowna']);
  assert.deepEqual(tp.routeRegions('naramata', 'kelowna'), ['naramata', 'penticton', 'summerland', 'peachland', 'west-kelowna', 'kelowna'], 'off-highway regions join through their corridor region');
  assert.equal(tp.routeDirection('kelowna', 'penticton'), 'south');
  assert.equal(tp.routeDirection('penticton', 'kelowna'), 'north');
  // Northbound: the order reverses.
  const north = run('dog friendly cafes and beaches from Penticton to Kelowna').plan;
  const idx = venueStops(north).map((s) => tp.routeRegions('penticton', 'kelowna').indexOf(s.venue.region));
  assert.deepEqual(idx, idx.slice().sort((a, b) => a - b));
  assert.match(north.experience.text, /drive north from Penticton to Kelowna/);
  // "between meals" is not a route.
  assert.equal(split('coffee between meals and a beach').route, null);
});

test('event start times: parsed only from a stated clock time', () => {
  assert.equal(tp.parseEventStart('7 pm'), 19 * 60);
  assert.equal(tp.parseEventStart('7:30 pm'), 19 * 60 + 30);
  assert.equal(tp.parseEventStart('10 am'), 10 * 60);
  assert.equal(tp.parseEventStart('12 pm'), 12 * 60);
  assert.equal(tp.parseEventStart('Times vary'), null);
  assert.equal(tp.parseEventStart(''), null);
});

// ---- the experience description --------------------------------------------
test('experience: at most three sentences, only the chosen parts, and none for a single stop', () => {
  for (const [q, ev] of [['dinner and a hockey game', { hockey: [HOCKEY_7PM] }], ['cafe and beach in Kelowna', {}], ['wine tasting and live music', { 'live-music': [CONCERT] }]]) {
    const { plan } = run(q, ev);
    assert.ok(plan.experience && sentences(plan.experience.text) <= 3, q);
  }
  const { plan } = run('dog friendly cafes and a distillery in Summerland');
  assert.equal(plan.experience, null, 'one stop is not a combination');
  const missingGame = run('dinner and a hockey game').plan;
  assert.ok(!missingGame.experience || !/hockey|rink|game/.test(missingGame.experience.text), 'never mentions a part that was not chosen');
});

// ---- single requests keep today's path --------------------------------------
test('single requests are not taken over: multi is false and planTrip is byte-identical to before', () => {
  const singles = ['dinner', 'dog friendly beaches', 'hockey events', 'Find me a great date night in Kelowna.', 'Find me a romantic winery and dinner.',
    'Plan 3 days in Penticton with kids.', 'Plan 5 days around the Okanagan with beaches, wineries and great food.', "What's happening in Penticton this weekend?",
    'What should I do in Vernon with my dog?', 'wine and hidden gems', 'hiking in Kelowna', 'live music this weekend', 'the best poutine',
    // Place names and modifiers are not two parts.
    'Rotary Beach Park', 'Naramata Creek Park Waterfall Trail', 'rotary beach park oliver', 'live music bars in Kelowna'];
  for (const q of singles) {
    const intent = d.interpretDiscoveryQuery(q, TAXONOMY);
    const trip = d.interpretTripComponents(q, TAXONOMY, intent);
    assert.equal(trip.multi, false, q);
    assert.deepEqual(tp.planTrip({ intent, trip, facts: FACTS, labels: LABELS }), tp.planTrip({ intent, facts: FACTS, labels: LABELS }), q);
  }
  // "hiking and fishing" is two activities joined by "and": two parts by design.
  assert.deepEqual(split('hiking and fishing near Peachland').components.map((c) => c.activities), [['hiking'], ['fishing']]);
  // The discovery intent itself carries no new keys.
  const keys = Object.keys(d.interpretDiscoveryQuery('dog friendly cafes and beaches', TAXONOMY)).sort();
  assert.ok(!keys.includes('components') && !keys.includes('route'));
});

// ---- follow-up fixes (2026-09-26) ------------------------------------------
test('fix 1: with no town, later parts stay in the first stop’s community', () => {
  // The best dog-friendly cafe is in Vernon, so the winery comes from Vernon too.
  const party = run("I'm going with my dog, find cafes and a winery.").plan;
  const stops = venueStops(party);
  assert.deepEqual(stops.map((s) => s.venue.name), ['Vernon Dog Cafe', 'Vernon Dog Winery']);
  assert.ok(stops[1].why.some((w) => /close to your other stops/.test(w)));
  // Scoped dog: the winery need not be dog friendly, but it is still the Vernon one.
  const scoped = run('dog friendly cafes and a winery').plan;
  assert.deepEqual(venueStops(scoped).map((s) => s.venue.region), ['vernon', 'vernon']);
  assert.ok(!scoped.notes.some((n) => /matched in/.test(n)));
});

test('fix 1: a part with no match in that community falls back to the valley, with a note -- the itinerary is kept', () => {
  const { plan } = run('dog friendly cafes and a golf course');
  const stops = venueStops(plan);
  assert.deepEqual(stops.map((s) => [s.venue.name, s.venue.region]), [['Vernon Dog Cafe', 'vernon'], ['Kelowna Golf Club', 'kelowna']]);
  assert.ok(plan.notes.includes('No golf courses matched in Vernon, so that stop is in Kelowna.'));
  assert.deepEqual(plan.warnings, []);
});

test('fix 1: explicit geography wins -- a route or a named town is never replaced by the community rule', () => {
  const route = run("I'm driving from Kelowna to Penticton with my dog, I want cafes and beaches that are dog friendly.").plan;
  assert.deepEqual(venueStops(route).map((s) => s.venue.region), ['peachland', 'summerland'], 'route stops in two towns along the way');
  assert.ok(!route.notes.some((n) => /matched in/.test(n)));
  const town = run('dog friendly cafes and a winery in Kelowna').plan;
  assert.deepEqual(venueStops(town).map((s) => s.venue.region), ['kelowna', 'kelowna']);
  // An event's town anchors the rest of the evening.
  const game = run('dinner and a hockey game', { hockey: [HOCKEY_7PM] }).plan;
  assert.equal(game.itinerary.stops[0].venue.region, 'summerland');
});

test('fix 2: every selected activity is named -- hiking + fishing, cafe + beach, dinner + hockey, winery + live music', () => {
  assert.equal(run('hiking and fishing near Peachland').plan.experience.text, 'Enjoy a scenic hike first, then spend some time fishing. Both stops are in Peachland, keeping the outing simple.');
  assert.equal(run('cafe and beach in Kelowna').plan.experience.text, 'Stop for coffee first, then spend some time on the beach. Both stops are in Kelowna, keeping the outing simple.');
  assert.equal(run('dinner and a hockey game', { hockey: [HOCKEY_7PM] }).plan.experience.text,
    'Start with a relaxed dinner in Summerland, then head to the rink for the hockey game. The game starts at 7 pm, so there’s time to enjoy dinner first.');
  assert.equal(run('wine tasting and live music', { 'live-music': [CONCERT] }).plan.experience.text,
    'Enjoy a wine tasting during the day, then stay in Kelowna for some live music in the evening. The music starts at 8 pm, so the day flows easily into the evening.');
  // Without an event, the live-music stop is named for what it is.
  assert.equal(run('wine tasting and live music').plan.experience.text, 'Enjoy a wine tasting first, then catch some live music. Both stops are in Kelowna, keeping the outing simple.');
});

test('fix 3: a generic event is named, placed at its real time, and only "finished with" when it is the evening close', () => {
  // Morning event (10 am): it comes first; no "finish with".
  const morning = run('family activities and an event this weekend', { event: [FAMILY_EVENT] }).plan;
  assert.deepEqual(morning.itinerary.stops.map((s) => s.kind), ['event', 'venue']);
  assert.equal(morning.experience.text, 'Start the day at the Harvest Family Fair (10 am), then spend some time in nature with the family. Both stops are in Kelowna, so the day stays easy to manage.');
  assert.ok(!/finish/i.test(morning.experience.text));
  // Evening event (7 pm): the day's stop first, the named event as the close.
  const evening = run('cafes and an event', { event: [EVENING_EVENT] }).plan;
  assert.deepEqual(evening.itinerary.stops.map((s) => s.kind), ['venue', 'event']);
  assert.equal(evening.experience.text, 'Stop for coffee during the day, then stay in Kelowna for the Autumn Lantern Walk in the evening. It starts at 7 pm, so the day flows easily into the evening.');
  assert.equal(evening.experience.title, 'What to expect');
  // "Times vary": named, no time stated, no "finish with".
  const vary = run('cafes and an event', { event: [VARY_EVENT] }).plan;
  assert.equal(vary.experience.text, 'Stop for coffee, then head to the Night Market Series. Both stops are in Kelowna, keeping the day simple. Times vary, so check the event page for the schedule.');
  assert.ok(!/finish/i.test(vary.experience.text) && !/\d\s?(am|pm)/.test(vary.experience.text));
  for (const p of [morning, evening, vary]) assert.ok(sentences(p.experience.text) <= 3);
});

// ---- event intent fix (2026-09-26): event kind + requested time of day -------
// Fixtures modelled on real What's On listings: the live-music category also
// holds a children's musical, a museum tour and a hockey game.
const JUNIE = { id: 911, name: 'Junie B. Jones The Musical', region: 'kelowna', url: '/kelowna/events/junie', valleyWide: false, categories: ['live-music', 'arts-culture', 'family-kids'], dateLabel: 'Sat Sep 26 + 3 more dates', time: '10 am', startDate: '2026-09-26' };
const TOUR = { id: 912, name: 'Culture Days - Architecture through the Ages: Downtown Vernon Tour', region: 'vernon', url: '/vernon/events/tour', valleyWide: false, categories: ['live-music', 'arts-culture'], dateLabel: 'Sat Sep 26', time: '1 pm', startDate: '2026-09-26' };
const HOCKEY_VS = { id: 913, name: 'Kelowna Chiefs vs Sicamous Eagles', region: 'kelowna', url: '/kelowna/events/chiefs', valleyWide: false, categories: ['sports-recreation', 'live-music'], dateLabel: 'Sat Sep 26', time: '7 pm', startDate: '2026-09-26' };
const DAY_SET = { id: 914, name: 'Jeff Piattelli Live', region: 'kelowna', url: '/kelowna/events/piattelli', valleyWide: false, categories: ['live-music', 'wineries-wine-events'], dateLabel: 'Sun Sep 27', time: '3 pm', startDate: '2026-09-27' };
const NIGHT_SET = { id: 915, name: 'Live Music: Papa Wheely @The Hub on Martin', region: 'penticton', url: '/penticton/events/papa-wheely', valleyWide: false, categories: ['live-music'], dateLabel: 'Sat Sep 26', time: '9 pm', startDate: '2026-09-26' };
const UNKNOWN_SET = { id: 916, name: 'Friday Jazz Nights', region: 'kelowna', url: '/kelowna/events/jazz', valleyWide: false, categories: ['live-music'], dateLabel: 'Fridays in October', time: 'Times vary', startDate: '2026-10-02' };
const MUSIC_POOL = [JUNIE, TOUR, HOCKEY_VS, DAY_SET, NIGHT_SET]; // soonest first, as the server passes them

test('event kind: a children’s musical, a museum tour or a "vs" game is never "live music" or a "concert"', () => {
  for (const e of [JUNIE, TOUR, HOCKEY_VS]) {
    assert.equal(tp.eventSuitsKind(e, 'live-music'), false, e.name);
    assert.equal(tp.eventSuitsKind(e, 'concert'), false, e.name);
  }
  for (const e of [DAY_SET, NIGHT_SET, UNKNOWN_SET, CONCERT, { name: 'Orchestral Rock Odyssey', categories: ['live-music'] }, { name: 'Coverboy', categories: ['live-music'] }]) {
    assert.equal(tp.eventSuitsKind(e, 'live-music'), true, e.name);
  }
  assert.equal(tp.eventSuitsKind({ name: 'Comedy Night: Henry Sir', categories: ['live-music', 'arts-culture', 'nightlife'] }, 'live-music'), false);
  assert.equal(tp.eventSuitsKind(HOCKEY_VS, 'hockey'), true, 'other event kinds are unaffected');
});

test('"Wine tasting and live music": a real music performance, never the musical; natural wording', () => {
  const { plan } = run('Wine tasting and live music.', { 'live-music': MUSIC_POOL });
  const ev = plan.itinerary.stops.find((s) => s.kind === 'event');
  assert.equal(ev.event.name, 'Jeff Piattelli Live');
  assert.ok(!plan.itinerary.stops.some((s) => s.kind === 'event' && /Junie/.test(s.event.name)));
  assert.equal(venueStops(plan)[0].venue.type, 'winery');
  assert.equal(plan.experience.text, 'Start with some live music at 3 pm, then enjoy a wine tasting. Both stops are in Kelowna, so the day stays easy to manage.');
  assert.ok(!/at the music/.test(plan.experience.text));
});

test('"Beach during the day and a concert at night": the concert is an evening one, after the beach; a 10 am musical never qualifies', () => {
  const { plan } = run('Beach during the day and a concert at night.', { concert: MUSIC_POOL });
  const kinds = plan.itinerary.stops.map((s) => s.kind);
  assert.deepEqual(kinds, ['venue', 'event'], 'beach by day, then the concert');
  const ev = plan.itinerary.stops[1];
  assert.equal(ev.event.name, 'Live Music: Papa Wheely @The Hub on Martin');
  assert.equal(ev.daypart, 'evening');
  assert.equal(plan.experience.text, 'Spend some time on the beach during the day, then stay in Penticton for an evening concert. The concert starts at 9 pm, so the day flows easily into the evening.');
  // Only daytime music on offer: reported honestly, the beach is kept.
  const noNight = run('Beach during the day and a concert at night.', { concert: [JUNIE, DAY_SET] }).plan;
  assert.deepEqual(noNight.itinerary.stops.map((s) => s.kind), ['venue']);
  assert.deepEqual(noNight.warnings, ['No concert is listed on What’s On for the evening for those dates, so the rest of the plan is shown.']);
  // A listing without a stated start is a last resort, flagged, with no time invented.
  const unknown = run('Beach during the day and a concert at night.', { concert: [JUNIE, DAY_SET, UNKNOWN_SET] }).plan;
  const u = unknown.itinerary.stops.find((s) => s.kind === 'event');
  assert.equal(u.event.name, 'Friday Jazz Nights');
  assert.equal(u.timeKnown, false);
  assert.match(u.caveats[0], /start time isn’t listed, so it may not be in the evening/);
  assert.ok(!/\d\s?(am|pm)/.test(unknown.experience.text));
});

test('"tonight" also asks for an evening event; daytime language asks for a daytime one', () => {
  const tonight = run('dinner and a concert tonight', { concert: MUSIC_POOL }).plan;
  assert.equal(tonight.itinerary.stops.find((s) => s.kind === 'event').event.name, 'Live Music: Papa Wheely @The Hub on Martin');
  const daytime = run('cafes and a concert during the day', { concert: [NIGHT_SET, DAY_SET] }).plan;
  assert.equal(daytime.itinerary.stops.find((s) => s.kind === 'event').event.name, 'Jeff Piattelli Live');
});

test('event names read naturally: "the" only before names that are a kind of event', () => {
  const skill = { ...FAMILY_EVENT, id: 917, name: 'Skillful', time: 'Times vary', dateLabel: 'Jun 13 – Oct 25' };
  const { plan } = run('family activities and an event this weekend', { event: [skill] });
  assert.match(plan.experience.text, /head to Skillful\./);
  assert.ok(!/the Skillful/.test(plan.experience.text));
});
