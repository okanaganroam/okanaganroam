'use strict';
// Build My Trip fixes (2026-11-18), found while making promo reels: winter-safe examples, morning starts, a stale hours
// caveat (Sandhill Wines), ski days asked as "a day on the mountain", lake-walk and spa labels, après in the headline,
// and advisories that say a place hasn't opened yet.
const test = require('node:test');
const assert = require('node:assert/strict');
const tp = require('../trip-planner.js');
const tr = require('../trip-requirements.js');
const d = require('../discovery-intent.js');
const fr = require('../trip-french-copy.js');
const site = require('../trip-site.js');

const TAXONOMY = {
  regions: ['kelowna', 'west-kelowna', 'whistler'],
  regionLabels: { kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', whistler: 'Whistler' },
  types: ['restaurant', 'cafe', 'winery', 'brewery', 'pub', 'cocktail', 'distillery', 'beach', 'outdoor', 'golf', 'indoor', 'tour', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'lake_view'],
  collections: [],
  activities: ['hiking', 'nature', 'viewpoints', 'water', 'winter', 'cycling'],
  budgets: ['budget', 'moderate', 'upscale'],
  // Whistler lists "Lake" as a kind of place, so "lake" reads as a cuisine word there.
  cuisines: ['lake', 'sushi'],
  eventCategories: [],
};
const req = (text) => tr.extractTripRequirements({ text, intent: {}, trip: {}, referenceDate: '2026-11-18' });

test('1. the /trip placeholder and examples name no season and no Naramata wine weekend', () => {
  const p = site.page;
  assert.doesNotMatch(p.placeholder, /autumn|fall|summer|winter|spring/i);
  assert.doesNotMatch(p.townExamples.placeholderEn + p.townExamples.placeholderFr, /autumn|automne/);
  assert.ok(!p.examples.some((e) => /Naramata/.test(e)), p.examples.join(' | '));
  assert.ok(p.examples.includes('A romantic weekend in Kelowna'));
});

test('2. a request that opens with coffee or names a morning time starts in the morning', () => {
  assert.equal(req('Coffee, a winter walk, a winery tasting and dinner in Kelowna').morningStart, 540);
  assert.equal(req('Morning coffee and a ski day at Big White').morningStart, 540);
  assert.equal(req('Start with coffee at 10, then a walk, après and dinner in Whistler').startMinutes, 600);
  assert.equal(req('breakfast at 8am then a hike in Kelowna').startMinutes, 480);
  assert.equal(req('brunch, then wineries in Kelowna').morningStart, 600);
  // "Morning coffee" with later parts of the day is the first stop, not a morning-only plan.
  assert.equal(req('Morning coffee, a walk, lunch and dinner in Kelowna').daypart, null);
  assert.equal(req('a morning in Kelowna').daypart, 'morning');
  // Other plans keep their usual start.
  for (const text of ['a walk, a winery and dinner in Kelowna', 'A romantic weekend in Kelowna', 'dinner at 7 then drinks', 'start at 6 with drinks']) {
    const r = req(text);
    assert.equal(r.morningStart, undefined, text);
    assert.ok(r.startMinutes == null || r.startMinutes >= 720, `${text}: ${r.startMinutes}`);
  }
});

test('2. Server: "Coffee, a winery and dinner" starts with the coffee in the morning (it was 2:15 PM)', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'Coffee, a winery and dinner in Kelowna' }, new Date('2026-11-18T17:00:00Z'));
  const stops = ((p.itinerary && p.itinerary.stops) || []).filter((s) => s.venue);
  const at = (s) => (p.schedule || []).find((r) => r.venueId === s.venue.id) || {};
  assert.equal(stops[0].venue.type, 'cafe', JSON.stringify(stops.map((s) => s.venue.name)));
  assert.ok(at(stops[0]).startMinutes <= 600, `coffee at ${at(stops[0]).startMinutes}`);
  // Without coffee first the plan still leads up to dinner, as before.
  const q = app.runTripPlan({ text: 'a winery and dinner in Kelowna' }, new Date('2026-11-18T17:00:00Z'));
  const first = (q.schedule || [])[0];
  assert.ok(first && first.startMinutes >= 720, JSON.stringify(q.schedule));
});

test('3. an hours caveat is checked against the stop\'s own scheduled time (Sandhill Wines at 4 PM)', () => {
  const hours = JSON.stringify({ mon: [['12:00', '18:00']], tue: [['12:00', '18:00']], wed: [['12:00', '18:00']], thu: [['12:00', '18:00']], fri: [['11:00', '19:00']], sat: [['11:00', '19:00']], sun: [['11:00', '18:00']] });
  const v = { id: 571, name: 'Sandhill Wines', type: 'winery', hours };
  const stale = 'Its listed hours only overlap part of the morning — check before you go';
  const plan = (start, end, startDate) => {
    const result = { kind: 'itinerary', days: [], itinerary: { stops: [{ kind: 'venue', venue: { id: 571 }, caveats: [stale, 'Book ahead'] }] }, schedule: [{ day: 1, venueId: 571, startMinutes: start, endMinutes: end }] };
    tp.retimeSlotCaveats(result, { facts: [v] }, startDate ? { startDate } : null);
    return result.itinerary.stops[0].caveats;
  };
  assert.deepEqual(plan(960, 1035), ['Book ahead'], 'inside its hours at 4 PM: no caveat');
  assert.deepEqual(plan(540, 615, '2026-11-18'), ['Its listed hours only overlap part of this time — check before you go', 'Book ahead'], 'a Wednesday at 9 AM is before it opens');
  assert.equal(fr.t3FrenchText('Its listed hours only overlap part of this time — check before you go'), 'Ses horaires indiqués ne couvrent qu’une partie de ce moment — vérifiez avant de partir');
  assert.match(fr.t3FrenchText('Its listed hours only cover this time on Wed–Sun — check the day you go'), /^Selon ses horaires indiqués, ce moment ne convient que les mer\.–dim\./);
});

test('4. "a day on the mountain / on the slopes" in the ski months is a ski day; in summer it is left alone', () => {
  assert.equal(tp.mountainDayText('Coffee, a day on the mountain, après and dinner in Whistler', 11), 'Coffee, a ski day, après and dinner in Whistler');
  assert.equal(tp.mountainDayText('a day on the slopes at Big White', 1), 'a ski day at Big White');
  assert.equal(tp.mountainDayText('a mountain day in Whistler', 2), 'a ski day in Whistler');
  assert.equal(tp.mountainDayText('a day on the mountain in Whistler', 7), 'a day on the mountain in Whistler');
  assert.equal(tp.mountainDayText('a day on the mountain biking in Whistler', 12), 'a day on the mountain biking in Whistler');
  assert.ok(tp.skiWordsAsked(tp.mountainDayText('a day on the mountain', 12).toLowerCase()));
});

test('5. a lake walk is a walk by the lake, never "Lake restaurants"', () => {
  const text = 'Coffee, a lake walk, après and dinner in Whistler';
  const parts = d.interpretTripComponents(text, TAXONOMY, d.interpretDiscoveryQuery(text, TAXONOMY, { tripPlanner: true })).components;
  const walk = parts.find((c) => c.lake);
  assert.ok(walk, JSON.stringify(parts));
  assert.deepEqual(walk.cuisines, []);
  assert.ok(!walk.types.includes('restaurant'), JSON.stringify(walk.types));
  const ctx = { labels: { types: {}, activities: { hiking: 'Hiking & Trails' } } };
  assert.equal(tp.componentLabel(walk, ctx), 'lakeside walk');
  // Any outdoor part with a food word reads as the outdoor part.
  assert.equal(tp.componentLabel({ kind: 'venue', types: ['outdoor'], activities: ['hiking'], cuisines: ['lake'] }, ctx), 'Hiking & Trails');
  assert.equal(tp.componentLabel({ kind: 'venue', types: ['restaurant'], activities: [], cuisines: ['sushi'] }, ctx), 'sushi restaurants');
});

test('6. an indoor stop is labelled what it is: a museum on a spa request is not a "Spa"', () => {
  const ctx = { queryText: 'a spa afternoon and dinner in whistler', labels: { types: { indoor: { singular: 'Indoor Attraction', plural: 'Indoor & Rainy Day Spots' } } } };
  const museum = { id: 1, type: 'indoor', name: 'Whistler Museum', textName: 'whistler museum', cuisine: 'Museum' };
  const spa = { id: 2, type: 'indoor', name: 'Scandinave Spa Whistler', textName: 'scandinave spa whistler', cuisine: 'Day spa' };
  assert.equal(tp.indoorVenueLabel(ctx, museum, 'singular'), 'Museum');
  assert.equal(tp.indoorVenueLabel(ctx, spa, 'singular'), 'Spa');
  assert.equal(tp.indoorVenueLabel({ ...ctx, queryText: 'museums in whistler' }, museum, 'singular'), 'Museum');
  assert.equal(tp.indoorVenueLabel(ctx, { ...museum, cuisine: null }, 'singular'), 'Indoor Attraction');
  assert.equal(tp.indoorAskedFits('Art Galleries', museum), false);
});

test('7. après reads as après in the headline and the stop label, not every kind of bar it looked in', () => {
  const ctx = { labels: { types: { pub: { plural: 'Pubs' }, cocktail: { plural: 'Cocktail lounges' }, distillery: { plural: 'Distilleries' } } } };
  for (const phrase of ['apres', 'après', 'apres drinks', 'après ski', 'apres-ski']) {
    assert.equal(tp.componentLabel({ kind: 'venue', types: ['pub', 'cocktail', 'distillery'], activities: [], cuisines: [], phrase }, ctx), 'après', phrase);
  }
  assert.equal(fr.t3FrenchText('Après'), 'Après-ski');
});

test('8. an advisory that says the place hasn\'t opened for the season takes it out of the plan', () => {
  assert.ok(tp.advisoryUnavailable('Not open yet. Opening depends on snow, typically mid-December (checked November 7, 2026).'));
  assert.ok(tp.advisoryUnavailable('The trails have not opened yet this season.'));
  assert.ok(tp.advisoryUnavailable('Seasonally closed; reopens in spring.'));
  assert.ok(!tp.advisoryUnavailable('Open for the season until December 14. In winter, Lost Lake Park is for ski and snowshoe ticket holders only during Nordic operations.'));
  const trail = { id: 9, type: 'outdoor', name: 'Lost Lake Nordic Trails', textName: 'lost lake nordic trails', features: {}, collections: [], activities: ['winter'], advisory: { note: 'Not open yet. Opening depends on snow, typically mid-December.' } };
  const ctx = { exclude: new Set(), exclusions: { applied: [] }, tripDate: '2026-11-18', types: new Set(['outdoor']), activities: new Set(), features: [], plannerKinds: [], collections: [], foodTerms: [] };
  assert.equal(tp.eligible(trail, ctx, false), false);
});
