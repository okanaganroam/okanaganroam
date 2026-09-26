// Build My Trip itineraries: seasonal relevance and the "What to expect"
// description (2026-09-26). PURE tests: no server.js, no database. The trip
// date is passed in as the server resolves it (the Okanagan calendar date);
// the Vancouver-time resolution itself is covered in server.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');
const REGIONS = { vernon: 'Vernon', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', penticton: 'Penticton', silverstar: 'SilverStar' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor'],
  features: ['dog_friendly', 'kid_friendly', 'live_music'], collections: ['hidden_gem', 'local_favorite', 'dog_friendly'],
  activities: ['hiking', 'cycling', 'winter', 'camping', 'nature', 'water', 'viewpoints', 'adventure', 'fishing'],
  cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'],
  eventCategories: ['events-festivals', 'markets-fairs', 'live-music', 'sports-recreation', 'family-kids'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'),
    cocktail: T('Cocktail Lounge', 'Cocktail Lounges'), distillery: T('Distillery', 'Distilleries'), golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations') },
  activities: { hiking: 'Hiking & Trails', nature: 'Nature & Wildlife', viewpoints: 'Viewpoints', winter: 'Winter Activities', water: 'Water Activities', camping: 'Camping', fishing: 'Fishing' },
  features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', live_music: 'Live Music' }, featureNouns: {},
  collections: { hidden_gem: 'Hidden Gems', local_favorite: 'Local Favourites', dog_friendly: 'dog-friendly beaches' },
};
const CENTRES = { vernon: [50.27, -119.27], kelowna: [49.88, -119.49], 'west-kelowna': [49.86, -119.58], penticton: [49.49, -119.59], silverstar: [50.36, -119.06] };
let nextId = 1;
function fact(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  return {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.4 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: null, address: null, lat, lng,
    cuisine: null, cuisineLabel: null, textName: d.normalizeDiscoveryText(o.name), textCuisine: '', textDesc: d.normalizeDiscoveryText(o.desc || ''),
    features: Object.fromEntries((o.features || []).map((f) => [f, true])), collections: o.collections || [], activities: o.activities || [], fdTypes: [],
    indoorGolf: !!o.indoorGolf, hours: null, advisory: o.advisory || null, dogNote: o.dogNote || null, golfSeasons: o.golfSeasons || [],
  };
}
const FACTS = [
  // Kelowna beaches: a top-rated swimming beach, and a lower-rated lakeside park also listed for nature and viewpoints.
  fact({ name: 'Kelowna Swim Beach', region: 'kelowna', type: 'beach', activities: ['water'], rating: 4.9 }),
  fact({ name: 'Kelowna Lakeside Park', region: 'kelowna', type: 'beach', activities: ['nature', 'viewpoints'], rating: 4.2 }),
  // A beach with a current swimming advisory (the best-rated beach in West Kelowna).
  fact({ name: 'West Kelowna Advisory Beach', region: 'west-kelowna', type: 'beach', rating: 4.9,
    advisory: { note: 'Swimming advisory currently in effect for this beach. Check the official source before swimming. https://example.com/advisory', addedAt: '2026-08-01 10:00:00' } }),
  fact({ name: 'West Kelowna Quiet Beach', region: 'west-kelowna', type: 'beach', rating: 4.1 }),
  // Penticton: a dog beach whose own access rule is seasonal.
  fact({ name: 'Penticton Dog Beach', region: 'penticton', type: 'beach', collections: ['dog_friendly'], dogNote: 'Fenced off-leash dog beach; main beach is no-dogs in season (off-leash approx. Oct–Apr)' }),
  fact({ name: 'Penticton Dog Cafe', region: 'penticton', type: 'cafe', features: ['dog_friendly'] }),
  // Water, winter, camping and mixed outdoor places.
  fact({ name: 'Kelowna Paddle Rentals', region: 'kelowna', type: 'outdoor', activities: ['water'], rating: 4.9 }),
  fact({ name: 'Kelowna Paddle and Trail Park', region: 'kelowna', type: 'outdoor', activities: ['water', 'hiking'], rating: 4.1 }),
  fact({ name: 'Vernon Ski Hill', region: 'vernon', type: 'outdoor', activities: ['winter'], rating: 4.6 }),
  fact({ name: 'Vernon Lake Paddling', region: 'vernon', type: 'outdoor', activities: ['water'], rating: 4.9 }),
  fact({ name: 'Vernon Mountain Park', region: 'vernon', type: 'outdoor', activities: ['hiking', 'winter'], rating: 4.5 }),
  fact({ name: 'Vernon Valley Trail', region: 'vernon', type: 'outdoor', activities: ['hiking'], rating: 4.3 }),
  fact({ name: 'Vernon Lakeside Campground', region: 'vernon', type: 'outdoor', activities: ['camping'], rating: 4.5 }),
  fact({ name: 'Vernon Fishing Dock', region: 'vernon', type: 'outdoor', activities: ['fishing'], rating: 4.3 }),
  // Golf: a course with a published rate window, and an indoor simulator.
  fact({ name: 'Vernon Valley Golf', region: 'vernon', type: 'golf', rating: 4.7, golfSeasons: [{ label: 'peak season', from: '04-17', to: '10-12' }] }),
  fact({ name: 'Vernon Sim Lounge', region: 'vernon', type: 'golf', indoorGolf: true, rating: 4.3 }),
  // Food and drink.
  fact({ name: 'Kelowna Bistro', region: 'kelowna', type: 'restaurant', rating: 4.6 }),
  fact({ name: 'Kelowna Cafe', region: 'kelowna', type: 'cafe', rating: 4.5 }),
  fact({ name: 'Vernon Dinner House', region: 'vernon', type: 'restaurant', rating: 4.5 }),
  fact({ name: 'Vernon Dog Cafe', region: 'vernon', type: 'cafe', features: ['dog_friendly'], rating: 4.6 }),
  fact({ name: 'Vernon Dog Winery', region: 'vernon', type: 'winery', features: ['dog_friendly'], rating: 4.4 }),
  fact({ name: 'Vernon Grand Winery', region: 'vernon', type: 'winery', rating: 4.9 }),
  fact({ name: 'West Kelowna Evacuated Winery', region: 'west-kelowna', type: 'winery', rating: 5.0,
    advisory: { note: 'Wildfire evacuation order: the district lists this address as still under an evacuation order. https://example.com/eo', addedAt: '2026-09-18 09:00:00' } }),
  fact({ name: 'West Kelowna Estate Winery', region: 'west-kelowna', type: 'winery', rating: 4.3 }),
];
const byName = new Map(FACTS.map((v) => [v.name, v]));
const ev = (o) => ({ valleyWide: false, dateLabel: '', url: `/events/${o.id}`, categories: [], ...o });
const EVENTS = {
  hockeyJan: ev({ id: 801, name: 'Vernon Vipers Home Game', region: 'vernon', categories: ['sports-recreation'], time: '7 pm', startDate: '2027-01-15' }),
  concertJul: ev({ id: 802, name: 'Kelowna Summer Concert', region: 'kelowna', categories: ['live-music'], time: '8 pm', startDate: '2027-07-16' }),
  concertJan: ev({ id: 803, name: 'Kelowna Winter Concert', region: 'kelowna', categories: ['live-music'], time: '8 pm', startDate: '2027-01-16' }),
  festivalJan: ev({ id: 804, name: 'Vernon Winter Carnival', region: 'vernon', categories: ['events-festivals'], time: '11 am', startDate: '2027-01-30' }),
  familyFair: ev({ id: 805, name: 'Kelowna Family Fair', region: 'kelowna', categories: ['family-kids'], time: '10 am', startDate: '2027-07-17' }),
  festivalDec: ev({ id: 806, name: 'Kelowna Lights Festival', region: 'kelowna', categories: ['events-festivals'], time: '6 pm', startDate: '2026-12-05' }),
};
function run(q, { date, events = {} } = {}) {
  const intent = d.interpretDiscoveryQuery(q, TAXONOMY);
  const trip = d.interpretTripComponents(q, TAXONOMY, intent);
  const tripEvents = trip.components.map((c) => (c.kind === 'event' ? (events[c.event.kind] || []) : null));
  return { trip, plan: tp.planTrip({ intent, trip, tripEvents, facts: FACTS, labels: LABELS, tripDate: date }) };
}
const stops = (p) => p.itinerary.stops;
const venueStops = (p) => stops(p).filter((s) => s.kind === 'venue');
const names = (p) => stops(p).map((s) => (s.venue ? s.venue.name : s.event.name));
const sentences = (t) => (t.match(/[.!?](\s|$)/g) || []).length;
const allCaveats = (p) => stops(p).flatMap((s) => s.caveats || []);
const JAN = '2027-01-15', JUL = '2027-07-15';

// ---- seasonal behaviour ------------------------------------------------------

test('season 1: a winter swimming request does not pick the summer-style swimming beach when a year-round lakeside beach exists', () => {
  const winter = run('swimming and lunch in Kelowna', { date: JAN }).plan;
  const beach = venueStops(winter).find((s) => s.venue.type === 'beach');
  assert.equal(beach.venue.name, 'Kelowna Lakeside Park', 'listed for nature and viewpoints, so it suits January');
  assert.ok(!names(winter).includes('Kelowna Swim Beach'));
  assert.ok(beach.why.some((w) => /Also listed for Nature & Wildlife and Viewpoints — a good fit for January/.test(w)));
  assert.ok(beach.caveats.some((c) => /Lake swimming here is a summer activity, so in January/.test(c)));
  assert.ok(winter.notes.some((n) => /^Planned for January \(Okanagan time\)/.test(n)));
  assert.equal(winter.season.month, 'January');
  // Paddling in January: the paddling place also listed for hiking, over a better-rated paddle-only one.
  const paddle = run('paddleboarding and lunch in Kelowna', { date: JAN }).plan;
  const p = venueStops(paddle).find((s) => s.venue.type === 'outdoor');
  assert.equal(p.venue.name, 'Kelowna Paddle and Trail Park');
  assert.ok(p.caveats.some((c) => /Water activities here are mostly a summer activity/.test(c)));
  // A general "things to do" part in January never lands on a water-only place.
  const things = run('things to do and dinner in Vernon', { date: JAN }).plan;
  assert.ok(!names(things).includes('Vernon Lake Paddling'));
});

test('season 2: winter activities are chosen in winter, and an explicit ski request is kept (with a caveat) out of season', () => {
  const things = run('things to do and dinner in Vernon', { date: JAN }).plan;
  const pick = venueStops(things).find((s) => s.venue.type !== 'restaurant');
  assert.equal(pick.venue.name, 'Vernon Ski Hill');
  assert.ok(pick.why.some((w) => /Listed for Winter Activities — in season in January/.test(w)));
  const ski = run('skiing and dinner in Vernon', { date: JAN }).plan;
  assert.equal(venueStops(ski)[0].venue.name, 'Vernon Ski Hill');
  assert.deepEqual(venueStops(ski)[0].caveats, []);
  const july = run('skiing and dinner in Vernon', { date: JUL }).plan;
  assert.equal(venueStops(july)[0].venue.name, 'Vernon Ski Hill', 'the visitor asked for it: kept, not swapped');
  assert.ok(venueStops(july)[0].caveats.some((c) => /Snow activities here run in winter — check what’s operating in July/.test(c)));
  // In July a general request does not pick the winter-only hill.
  assert.ok(!names(run('things to do and dinner in Vernon', { date: JUL }).plan).includes('Vernon Ski Hill'));
});

test('season 3: a beach stays in the plan for a walk in winter, described as a lakeside walk', () => {
  const { plan } = run('beach and coffee in Kelowna', { date: JAN });
  const beach = venueStops(plan).find((s) => s.venue.type === 'beach');
  assert.ok(beach, 'a beach is still chosen in January');
  assert.equal(beach.venue.name, 'Kelowna Lakeside Park');
  assert.match(plan.experience.text, /take a walk along the beach/);
  assert.match(plan.experience.text, /In January the beach is a lakeside walk rather than a swim\./);
  assert.ok(!allCaveats(plan).some((c) => /swimming/i.test(c)), 'a walk is not warned about swimming');
});

test('season 4: summer swimming and beach requests rank as before', () => {
  const swim = run('swimming and lunch in Kelowna', { date: JUL }).plan;
  assert.ok(names(swim).includes('Kelowna Swim Beach'), 'the best-rated swimming beach');
  assert.deepEqual(allCaveats(swim).filter((c) => /summer|season/i.test(c)), []);
  assert.equal(swim.experience.text, 'Stop for lunch first, then spend some time on the beach. Both stops are in Kelowna, keeping the outing simple.');
  assert.ok(!swim.notes.some((n) => /^Planned for/.test(n)), 'nothing was re-ranked for the season');
  // Undated (no trip date): no seasonal layer at all -- identical to today.
  const undated = run('swimming and lunch in Kelowna').plan;
  assert.equal(undated.season, null);
  assert.deepEqual(names(undated), names(swim));
  // Water activities in summer rank on their own merits.
  assert.equal(venueStops(run('paddleboarding and lunch in Kelowna', { date: JUL }).plan)[0].venue.name, 'Kelowna Paddle Rentals');
});

test('season 5: shoulder seasons keep golf, hiking, camping and water available', () => {
  // October 5: inside the course's published peak-season window.
  const oct = run('golf and dinner in Vernon', { date: '2026-10-05' }).plan;
  const golf = venueStops(oct).find((s) => s.venue.type === 'golf');
  assert.equal(golf.venue.name, 'Vernon Valley Golf');
  assert.ok(golf.why.some((w) => w === 'Its published peak season rates run Apr 17 – Oct 12'));
  assert.deepEqual(golf.caveats, []);
  // November: outside the window, still chosen, with a check-before-you-go caveat.
  const nov = run('golf and dinner in Vernon', { date: '2026-11-05' }).plan;
  assert.equal(venueStops(nov).find((s) => s.venue.type === 'golf').venue.name, 'Vernon Valley Golf');
  assert.ok(allCaveats(nov).some((c) => /Outdoor golf here is seasonal — check the course is open in November/.test(c)));
  // Deep winter: the indoor simulator is preferred.
  const jan = run('golf and dinner in Vernon', { date: JAN }).plan;
  assert.equal(venueStops(jan).find((s) => s.venue.type === 'golf').venue.name, 'Vernon Sim Lounge');
  // Camping in April and hiking in November are planned normally.
  const camp = run('camping and dinner in Vernon', { date: '2027-04-10' }).plan;
  assert.equal(venueStops(camp)[0].venue.name, 'Vernon Lakeside Campground');
  assert.deepEqual(venueStops(camp)[0].caveats, []);
  assert.equal(venueStops(run('hiking and dinner in Vernon', { date: '2026-11-10' }).plan)[0].venue.name, 'Vernon Mountain Park');
  // Paddling in October (shoulder): no penalty, no caveat.
  const paddle = venueStops(run('paddleboarding and lunch in Kelowna', { date: '2026-10-05' }).plan)[0];
  assert.equal(paddle.venue.name, 'Kelowna Paddle Rentals');
  assert.deepEqual(paddle.caveats, []);
  // Mixed categories: a park in the winter AND hiking collections is a July hike.
  const hike = venueStops(run('hiking and dinner in Vernon', { date: JUL }).plan)[0];
  assert.equal(hike.venue.name, 'Vernon Mountain Park', 'not treated as winter-only');
  assert.deepEqual(hike.caveats, []);
});

test('season 6: a dated event is chosen whatever the season, and its own date sets the season', () => {
  const carnival = run('festival and dinner', { date: '2027-01-30', events: { festival: [EVENTS.festivalJan] } }).plan;
  assert.equal(stops(carnival)[0].event.name, 'Vernon Winter Carnival');
  const hockey = run('dinner and a hockey game', { date: JAN, events: { hockey: [EVENTS.hockeyJan] } }).plan;
  assert.ok(names(hockey).includes('Vernon Vipers Home Game'));
  // Planned on a September day around a December festival: the beach is planned for December.
  const dec = run('beach during the day and a festival', { date: '2026-09-26', events: { festival: [EVENTS.festivalDec] } }).plan;
  assert.equal(dec.season.month, 'December');
  assert.ok(names(dec).includes('Kelowna Lights Festival'));
  assert.match(dec.experience.text, /Take a walk along the beach during the day, then stay in Kelowna for the Kelowna Lights Festival in the evening\./);
});

test('season 7: advisories -- an evacuation order excludes, a swimming advisory lowers a swim stop, the note is quoted, stale ones do not dominate', () => {
  const swim = run('swimming and a winery in West Kelowna', { date: JUL }).plan;
  assert.ok(!names(swim).includes('West Kelowna Evacuated Winery'), 'an evacuation order takes it out');
  assert.ok(swim.notes.includes('West Kelowna Evacuated Winery was left out: its current advisory on Okanagan Roam says it isn’t available.'));
  assert.ok(names(swim).includes('West Kelowna Quiet Beach'), 'a swim stop avoids the beach under a swimming advisory');
  // A beach visit (not a swim) can still use it, with the advisory's own first sentence.
  const walk = run('beach and a winery in West Kelowna', { date: JUL }).plan;
  const b = venueStops(walk).find((s) => s.venue.type === 'beach');
  assert.equal(b.venue.name, 'West Kelowna Advisory Beach');
  assert.ok(b.caveats.includes('Advisory on Okanagan Roam: Swimming advisory currently in effect for this beach.'));
  assert.ok(!b.caveats.some((c) => /https?:/.test(c)), 'no URL pasted in');
  assert.match(walk.experience.text, /West Kelowna Advisory Beach has a current advisory on Okanagan Roam/);
  // A stale advisory (added over a year before the trip) no longer lowers the swim stop.
  const stale = tp.planTrip({ ...(() => { const q = 'swimming and a winery in West Kelowna'; const intent = d.interpretDiscoveryQuery(q, TAXONOMY); return { intent, trip: d.interpretTripComponents(q, TAXONOMY, intent) }; })(),
    facts: FACTS.map((v) => (v.advisory && /Swimming/.test(v.advisory.note) ? { ...v, advisory: { ...v.advisory, addedAt: '2025-06-01 00:00:00' } } : v)), labels: LABELS, tripDate: JUL, tripEvents: [null, null] });
  assert.ok(stale.itinerary.stops.some((s) => s.venue && s.venue.name === 'West Kelowna Advisory Beach'));
  // A dog beach's own seasonal access rule is shown verbatim on a dog trip.
  const dog = run('dog friendly beach and cafe in Penticton', { date: JUL }).plan;
  assert.ok(allCaveats(dog).includes('Dog access: Fenced off-leash dog beach; main beach is no-dogs in season (off-leash approx. Oct–Apr)'));
});

test('season 8: the season comes from the Okanagan calendar date it is given, never a UTC month', () => {
  // The server resolves 2026-12-01T05:00Z to the Okanagan date 2026-11-30
  // (server.test.js). Given that date, the plan is a November plan.
  const nov = run('golf and dinner in Vernon', { date: '2026-11-30' }).plan;
  assert.equal(nov.season.month, 'November');
  assert.equal(venueStops(nov).find((s) => s.venue.type === 'golf').venue.name, 'Vernon Valley Golf', 'November is a shoulder month: kept');
  const dec = run('golf and dinner in Vernon', { date: '2026-12-01' }).plan;
  assert.equal(dec.season.month, 'December');
  assert.equal(venueStops(dec).find((s) => s.venue.type === 'golf').venue.name, 'Vernon Sim Lounge');
  assert.equal(run('golf and dinner in Vernon', { date: 'not-a-date' }).plan.season, null);
});

// ---- "What to expect" --------------------------------------------------------

const EXAMPLES = [
  ['beach during the day and a concert at night', { date: '2027-07-16', events: { concert: [EVENTS.concertJul] } },
    'Spend some time on the beach during the day, then stay in Kelowna for an evening concert. The concert starts at 8 pm, so the day flows easily into the evening.'],
  ['dinner and a hockey game', { date: JAN, events: { hockey: [EVENTS.hockeyJan] } },
    'Start with a relaxed dinner in Vernon, then head to the rink for the hockey game. The game starts at 7 pm, so there’s time to enjoy dinner first.'],
  ['hiking and fishing in Vernon', { date: JUL },
    'Enjoy a scenic hike first, then spend some time fishing. Both stops are in Vernon, keeping the outing simple.'],
  ['dog friendly cafe and winery in Vernon', { date: JUL },
    'Stop for coffee first, then enjoy a wine tasting. Both stops are in Vernon, keeping the outing simple. Every place on the plan is listed as dog friendly, so your dog can come along.'],
  ['family activities and an event', { date: '2027-07-17', events: { event: [EVENTS.familyFair] } },
    'Start the day at the Kelowna Family Fair (10 am), then get out on the water with the family. Both stops are in Kelowna, so the day stays easy to manage.'],
];

test('experience 1-5: beach + concert, dinner + hockey, hiking + fishing, dog cafe + winery, family activities + event', () => {
  for (const [q, o, text] of EXAMPLES) {
    const { plan } = run(q, o);
    assert.equal(plan.experience.title, 'What to expect', q);
    assert.equal(plan.experience.text, text, q);
  }
});

test('experience 6: a missing part is never described; the rest of the plan is', () => {
  const { plan } = run('coffee and hiking and a hockey game in Vernon', { date: JUL });
  assert.ok(plan.warnings.some((w) => /No hockey game is listed/.test(w)));
  assert.equal(plan.experience.text, 'Stop for coffee first, then enjoy a scenic hike. Both stops are in Vernon, keeping the outing simple.');
  assert.ok(!/hockey|rink|game/.test(plan.experience.text));
  // Only one stop left: no combination to describe.
  assert.equal(run('dinner and a hockey game in Vernon', { date: JUL }).plan.experience, null);
});

test('experience 7: a one-part road trip is an itinerary and gets a description; a plain single request keeps the old path', () => {
  const { trip, plan } = run('cafes from Kelowna to Penticton', { date: JUL });
  assert.equal(trip.multi, true);
  assert.equal(plan.kind, 'itinerary');
  assert.match(plan.experience.text, /^Enjoy an easygoing drive south from Kelowna to Penticton, stopping for coffee along the way\./);
  const single = run('cafes in Kelowna', { date: JUL });
  assert.equal(single.trip.multi, false);
  assert.notEqual(single.plan.kind, 'itinerary');
  assert.equal(single.plan.experience, undefined, 'the single-request planner is unchanged');
});

const REQUESTS = [
  ...EXAMPLES.map(([q, o]) => [q, o]),
  ['swimming and lunch in Kelowna', { date: JAN }], ['swimming and lunch in Kelowna', { date: JUL }], ['beach and coffee in Kelowna', { date: JAN }],
  ['paddleboarding and lunch in Kelowna', { date: JAN }], ['things to do and dinner in Vernon', { date: JAN }], ['skiing and dinner in Vernon', { date: JUL }],
  ['golf and dinner in Vernon', { date: '2026-11-05' }], ['camping and dinner in Vernon', { date: '2027-01-10' }], ['beach and a winery in West Kelowna', { date: JUL }],
  ['dog friendly beach and cafe in Penticton', { date: JUL }], ['coffee and hiking and a hockey game in Vernon', { date: JUL }], ['cafes from Kelowna to Penticton', { date: JUL }],
  ['beach during the day and a festival', { date: '2026-09-26', events: { festival: [EVENTS.festivalDec] } }], ['festival and dinner', { date: '2027-01-30', events: { festival: [EVENTS.festivalJan] } }],
];

test('experience 8: every description is one to three sentences', () => {
  for (const [q, o] of REQUESTS) {
    const { plan } = run(q, o);
    if (!plan.experience) continue;
    const n = sentences(plan.experience.text);
    assert.ok(n >= 1 && n <= 3, `${q}: ${n} sentences: ${plan.experience.text}`);
  }
});

// Words that would describe a kind of stop; each may appear only when a stop of that kind was chosen.
const KIND_WORDS = [
  [/\bwine\b/, (s) => s.venue && s.venue.type === 'winery'], [/\bcoffee\b/, (s) => s.venue && s.venue.type === 'cafe'],
  [/\bbeach\b|\blake\b/, (s) => s.venue && s.venue.type === 'beach'], [/\bgolf\b/, (s) => s.venue && s.venue.type === 'golf'],
  [/\bhike\b/, (s) => s.venue && s.venue.type === 'outdoor'], [/\bfishing\b/, (s) => s.venue && s.venue.type === 'outdoor'],
  [/\bsnow\b|\bski/, (s) => (s.venue && s.venue.type === 'outdoor') || false], [/\bcampground/, (s) => s.venue && s.venue.type === 'outdoor'],
  [/\bdinner\b|\blunch\b|\bmeal\b/, (s) => s.venue && s.venue.type === 'restaurant'],
  [/\bhockey\b|\brink\b/, (s) => s.kind === 'event'], [/\bconcert\b|\bmusic\b/, (s) => s.kind === 'event'],
];

test('experience 9: a description names only kinds of stop that were chosen, and only their towns', () => {
  const allTowns = Object.values(REGIONS);
  for (const [q, o] of REQUESTS) {
    const { plan } = run(q, o);
    if (!plan.experience) continue;
    const text = plan.experience.text;
    const ss = stops(plan);
    for (const [re, ok] of KIND_WORDS) if (re.test(text.replace(/stop|Winter Carnival|Lights Festival|Family Fair/g, ''))) assert.ok(ss.some(ok), `${q}: "${re}" without such a stop: ${text}`);
    const stopTowns = new Set(ss.map((s) => (s.venue ? s.venue.regionLabel : s.event.regionLabel)));
    for (const t of allTowns) if (new RegExp(`\\b(in|to|from|for) ${t}\\b`).test(text) && !/drive/.test(text)) assert.ok(stopTowns.has(t), `${q}: names ${t}: ${text}`);
  }
});

test('experience 10: no invented facts -- no distances, drive times, weather, opening status, and only stated start times', () => {
  const INVENTED = /\bkm\b|kilomet|\bmiles?\b|\bminutes?\b|\bhours?\b(?! of)|\bmins?\b|sunny|\brain\b|snowfall|forecast|weather|\bwarm\b|\bcold\b|open now|\bopen until\b|\bcloses\b|award|famous|best in/i;
  for (const [q, o] of REQUESTS) {
    const { plan } = run(q, o);
    if (!plan.experience) continue;
    const text = plan.experience.text;
    assert.ok(!INVENTED.test(text), `${q}: ${text}`);
    const times = text.match(/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/g) || [];
    const stated = stops(plan).filter((s) => s.kind === 'event' && s.timeKnown).map((s) => s.event.time);
    for (const t of times) assert.ok(stated.includes(t), `${q}: time ${t} is not a stated event start`);
    for (const s of stops(plan).filter((x) => x.kind === 'event' && !x.timeKnown)) assert.equal(times.length, 0, q);
  }
});

// ---- multi-day events: the attendance date (2026-09-26) ----------------------
// A multi-day listing carries its run's first day (startDate) and last day
// (endDate). Season and the paired dinner's hours use the day the visitor
// attends: the later of the trip date and the first day, capped at the last.
// Local fixtures only; the shared FACTS above are unchanged.
const closedAllWeek = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
const SAT_SUPPER = { ...fact({ name: 'Vernon Saturday Supper Club', region: 'vernon', type: 'restaurant', rating: 4.8 }), hours: JSON.stringify({ ...closedAllWeek, sat: [['17:00', '22:00']] }) };
const FRI_FISH = { ...fact({ name: 'Vernon Friday Fish House', region: 'vernon', type: 'restaurant', rating: 4.7 }), hours: JSON.stringify({ ...closedAllWeek, fri: [['17:00', '22:00']] }) };
const TUE_GRILL = { ...fact({ name: 'Vernon Tuesday Grill', region: 'vernon', type: 'restaurant', rating: 4.6 }), hours: JSON.stringify({ ...closedAllWeek, tue: [['17:00', '22:00']] }) };
const MULTI_FACTS = FACTS.concat([SAT_SUPPER, FRI_FISH, TUE_GRILL]);
function runMulti(q, date, events) {
  const intent = d.interpretDiscoveryQuery(q, TAXONOMY);
  const trip = d.interpretTripComponents(q, TAXONOMY, intent);
  const tripEvents = trip.components.map((c) => (c.kind === 'event' ? (events[c.event.kind] || []) : null));
  return tp.planTrip({ intent, trip, tripEvents, facts: MULTI_FACTS, labels: LABELS, tripDate: date });
}
const dinnerOf = (p) => venueStops(p).find((s) => s.venue.type === 'restaurant');

test('multi-day 1: a run already in progress is attended on the trip date (season and the dinner’s weekday)', () => {
  // Harvest Festival runs Tue Sep 22 – Wed Sep 30; the visitor plans for Saturday Sep 26.
  const fest = ev({ id: 811, name: 'Vernon Harvest Festival', region: 'vernon', categories: ['events-festivals'], dateLabel: 'Sep 22 – 30', time: '6 pm', startDate: '2026-09-22', endDate: '2026-09-30' });
  const p = runMulti('dinner and a festival in Vernon', '2026-09-26', { festival: [fest] });
  assert.equal(p.season.date, '2026-09-26', 'not the run’s first day (Sep 22)');
  assert.equal(dinnerOf(p).venue.name, 'Vernon Saturday Supper Club', 'dinner is checked against Saturday hours');
  assert.ok(dinnerOf(p).reasons.some((r) => r.text === 'Listed hours Saturday: 17:00–22:00'));
  assert.ok(!names(p).includes('Vernon Tuesday Grill'), 'the run’s first weekday (Tuesday) is not used');
  assert.ok(names(p).includes('Vernon Harvest Festival'));
  // Undated planning is today's Okanagan date; a run that starts later is attended on its first day.
  const later = ev({ ...fest, id: 812, startDate: '2026-10-06', endDate: '2026-10-10' }); // Tue Oct 6 – Sat Oct 10
  const q = runMulti('dinner and a festival in Vernon', '2026-09-26', { festival: [later] });
  assert.equal(q.season.date, '2026-10-06');
  assert.equal(dinnerOf(q).venue.name, 'Vernon Tuesday Grill');
  // No trip date at all: the first day, exactly as before.
  assert.equal(runMulti('dinner and a festival in Vernon', undefined, { festival: [fest] }).season.date, '2026-09-22');
});

test('multi-day 2: a run crossing a season boundary uses the season of the visit, in ranking and wording', () => {
  // Holiday Lights run Fri Nov 20 – Tue Jan 5; the visit is Saturday Dec 19.
  const lights = ev({ id: 813, name: 'Vernon Holiday Lights', region: 'vernon', categories: ['events-festivals'], dateLabel: 'Nov 20 – Jan 5', time: '5 pm', startDate: '2026-11-20', endDate: '2027-01-05' });
  const golf = runMulti('golf and a festival in Vernon', '2026-12-19', { festival: [lights] });
  assert.equal(golf.season.month, 'December', 'not November, the run’s first month');
  assert.equal(venueStops(golf).find((s) => s.venue.type === 'golf').venue.name, 'Vernon Sim Lounge', 'deep winter prefers indoor golf');
  assert.ok(!/November/.test(golf.experience.text) && !golf.notes.some((n) => /November/.test(n)));
  const things = runMulti('things to do and a festival in Vernon', '2026-12-19', { festival: [lights] });
  assert.match(things.experience.text, /It’s December, so the plan leans into the winter season\./);
  // Planned for after the run ends: capped to its last day (January).
  assert.equal(runMulti('golf and a festival in Vernon', '2027-01-20', { festival: [lights] }).season.date, '2027-01-05');
});

test('multi-day 3: a Friday-only listing picked for "this weekend" is attended on the Friday', () => {
  // The server resolves "this weekend" to Saturday Oct 3; the listing is Friday Oct 2 only.
  const fri = ev({ id: 814, name: 'Vernon Friday Night Market', region: 'vernon', categories: ['events-festivals'], dateLabel: 'Fri Oct 2', time: '5 pm', startDate: '2026-10-02', endDate: '2026-10-02' });
  const p = runMulti('dinner and a festival this weekend', '2026-10-03', { festival: [fri] });
  assert.equal(p.season.date, '2026-10-02', 'capped to the day it runs');
  assert.equal(dinnerOf(p).venue.name, 'Vernon Friday Fish House', 'dinner is checked against Friday hours');
  assert.ok(!names(p).includes('Vernon Saturday Supper Club'));
  assert.match(p.experience.text, /The Vernon Friday Night Market|Vernon Friday Night Market/);
});
