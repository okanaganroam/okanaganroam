'use strict';
// Build My Trip QA pass (2026-10-25): live requests that came back wrong.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tp = require('../trip-planner');
const d = require('../discovery-intent.js');

const TAXONOMY = {
  regions: ['kelowna', 'west-kelowna', 'vernon', 'penticton'],
  regionLabels: { kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', vernon: 'Vernon', penticton: 'Penticton' },
  types: ['restaurant', 'cafe', 'winery', 'brewery', 'pub', 'cocktail', 'distillery', 'beach', 'outdoor', 'golf', 'indoor', 'tour', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'lake_view'],
  collections: [],
  activities: ['hiking', 'nature', 'viewpoints', 'water', 'winter', 'cycling'],
  budgets: ['budget', 'splurge'],
  cuisines: [],
  eventCategories: [],
};

test('"cheap eats and a hike" keeps the food part (it was read only as a budget)', () => {
  const text = 'cheap eats and a hike in West Kelowna';
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const parts = d.interpretTripComponents(text, TAXONOMY, intent).components;
  assert.ok(parts.some((p) => p.types.includes('restaurant')), JSON.stringify(parts));
  assert.ok(parts.some((p) => p.activities.includes('hiking')), JSON.stringify(parts));
  assert.equal(intent.budget, 'budget', 'the budget still applies');
});

test('an outdoor skating rink is off season in October in every step, and back in January', () => {
  const rink = { id: 1, type: 'outdoor', name: 'Stuart Park Outdoor Rink', textName: 'stuart park outdoor rink', features: {}, collections: [], activities: ['winter'] };
  const ctx = { exclude: new Set(), exclusions: { applied: [] }, tripDate: '2026-10-25', types: new Set(), activities: new Set(), features: [], plannerKinds: [], collections: [], foodTerms: [] };
  assert.equal(tp.eligible(rink, ctx, false), false);
  assert.equal(tp.eligible(rink, { ...ctx, tripDate: '2027-01-15' }, false), true);
  assert.equal(tp.eligible(rink, { ...ctx, activities: new Set(['winter']), skiOffSeason: false, tripDate: '2027-01-15' }, false), true);
});

test('the plain planning path keeps one round of golf a day', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  const plainLine = src.split('\n').find((l) => l.includes('const plain = planTripCore(plainInput)'));
  assert.ok(plainLine && plainLine.includes('oneRoundADay(plain)'), 'oneRoundADay runs on the plain path too');
});

test('Server: a drinks stop asked for after dinner comes after it; a stop before dinner leads up to it', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const at = (p, id) => (p.schedule || []).find((r) => r.venueId === id) || {};
  for (const text of ['a brewery after dinner in Kelowna', 'dinner then a brewery in Kelowna']) {
    const p = app.runTripPlan({ text });
    const stops = p.itinerary.stops.filter((s) => s.venue);
    const dinner = stops.find((s) => /dinner/i.test(s.label)), brewery = stops.find((s) => s.venue.type === 'brewery');
    assert.ok(dinner && brewery, text);
    assert.ok(at(p, brewery.venue.id).startMinutes > at(p, dinner.venue.id).startMinutes, `${text}: ${JSON.stringify(p.schedule)}`);
  }
  const p = app.runTripPlan({ text: 'a winery then dinner in Kelowna' });
  const stops = p.itinerary.stops.filter((s) => s.venue);
  const winery = stops.find((s) => s.venue.type === 'winery'), dinner = stops.find((s) => /dinner/i.test(s.label));
  const gap = at(p, dinner.venue.id).startMinutes - at(p, winery.venue.id).endMinutes;
  assert.ok(gap <= 90, `the winery ends ${gap} minutes before dinner`);
});

test('Build My Trip keeps a month for every kind of request (search still reports it as not applied)', () => {
  const trip = d.interpretDiscoveryQuery('wineries in Kelowna in August', TAXONOMY, { tripPlanner: true });
  assert.equal(trip.month, 8);
  assert.ok(!trip.unsupported.includes('august'));
  const search = d.interpretDiscoveryQuery('wineries in Kelowna in August', TAXONOMY);
  assert.ok(search.unsupported.includes('august'), 'site search is unchanged');
});

test('a golf simulator nobody asked for is planned once a trip', () => {
  const stop = (id, sim) => ({ venue: { id, type: sim ? 'golf' : 'indoor', indoorGolf: sim }, alternates: [{ venue: { id: id + 100, type: 'indoor' } }] });
  const plan = { days: [{ stops: [stop(1, true)] }, { stops: [stop(2, true)] }] };
  tp.oneSimulatorATrip(plan, { types: [] });
  assert.deepEqual(plan.days.map((x) => x.stops[0].venue.id), [1, 102]);
  const golf = { days: [{ stops: [stop(1, true)] }, { stops: [stop(2, true)] }] };
  tp.oneSimulatorATrip(golf, { types: ['golf'] });
  assert.deepEqual(golf.days.map((x) => x.stops[0].venue.id), [1, 2]);
});

test('an outdoor rink is off season in early November too (a weekend from Oct 31 has its Sunday on Nov 1)', () => {
  const rink = { type: 'outdoor', name: 'Stuart Park Outdoor Rink', textName: 'stuart park outdoor rink' };
  const ctx = (tripDate) => ({ tripDate, types: new Set(), activities: new Set(), requirements: { text: '' } });
  assert.equal(tp.offSeasonSkip(rink, ctx('2026-11-01')), true);
  assert.equal(tp.offSeasonSkip(rink, ctx('2026-12-10')), false);
});

test('seasonal outdoor places: a description season ("July to September") and winter tours (snowcats)', () => {
  const c = (tripDate) => ({ tripDate, types: new Set(), activities: new Set(), requirements: { text: 'a day in lumby' } });
  const trail = { type: 'outdoor', name: 'Spectrum Lake Trail', textName: 'spectrum lake trail monashees', textDesc: 'access is by a forest road high clearance vehicle july to september' };
  const park = { type: 'outdoor', name: 'Kal Park', textName: 'kal park', textDesc: 'the beach is busiest from june to august' };
  const cat = { type: 'tour', name: 'Monashee Powder Snowcats', textName: 'monashee powder snowcats', textDesc: '' };
  assert.equal(tp.offSeasonSkip(trail, c('2026-10-25')), true);
  assert.equal(tp.offSeasonSkip(trail, c('2027-08-01')), false);
  assert.equal(tp.offSeasonSkip(park, c('2026-10-25')), false, 'a month range that is not a season is ignored');
  assert.equal(tp.offSeasonSkip(cat, c('2026-10-25')), true);
});

test('a lookout with the Lake View badge is a sunset spot (no Penticton listing says "sunset")', () => {
  const req = require('../trip-requirements');
  assert.ok(req.inferPlannerKinds({ type: 'outdoor', name: 'Munson Mountain', description: 'A short climb to views over Penticton.', lake_view: 1, activities: ['viewpoints'] }).includes('sunset'));
  assert.ok(!req.inferPlannerKinds({ type: 'outdoor', name: 'Forest Loop', description: 'A shady forest loop.', activities: ['hiking'] }).includes('sunset'));
});

test('a week in the Okanagan visits the big towns, and its extra days go to them (not alphabetical, not northernmost)', () => {
  const towns = { 'lake-country': [50.05, 45], kelowna: [49.88, 300], naramata: [49.59, 60], penticton: [49.49, 200], vernon: [50.26, 180], oliver: [49.18, 90], osoyoos: [49.03, 80], 'west-kelowna': [49.86, 120] };
  const facts = []; let id = 1;
  for (const [r, [lat, n]] of Object.entries(towns)) for (let i = 0; i < n; i++) facts.push({ id: id++, region: r, type: 'restaurant', features: {}, collections: [], activities: [], lat, lng: -119.5 });
  const centroids = Object.fromEntries(Object.entries(towns).map(([r, [lat]]) => [r, { lat, lng: -119.5 }]));
  const ctx = { regions: [], exclude: new Set(), exclusions: { applied: [] }, types: new Set(), activities: new Set(), features: [], plannerKinds: [], collections: [], foodTerms: [], tripDate: '2026-10-25' };
  const week = tp.chooseDayRegions(facts, ctx, 7, centroids);
  for (const town of ['kelowna', 'penticton', 'vernon']) assert.ok(week.includes(town), week.join(' > '));
  assert.equal(week.filter((r) => r === 'kelowna').length, 2, week.join(' > '));
});

test('a trail named after its park is the same place as the park (one per trip)', () => {
  const key = (name) => tp.placeKey({ type: 'outdoor', name });
  assert.equal(key('Gillies Creek Trails (Skaha Bluffs Provincial Park)'), key('Skaha Bluffs Provincial Park'));
  assert.equal(key('Boulder Trail (Okanagan Mountain Park)'), key('Okanagan Mountain Provincial Park'));
  assert.notEqual(key('Lions Park (Oliver)'), key('Oliver Community Park'));
});

test('an outdoor place that needs a permit shows its permit sentence', () => {
  const req = require('../trip-requirements');
  const nkwala = { type: 'outdoor', plannerDescription: 'A former fire-lookout mountain above Penticton. The mountain is on Penticton Indian Band land, and the band requires a free paper permit from its administration office on Westhills Drive. Bears are common.' };
  assert.equal(req.listedAccessNotes(nkwala).length, 1);
  assert.match(req.listedAccessNotes(nkwala)[0], /free paper permit/);
  assert.equal(req.listedAccessNotes({ type: 'outdoor', plannerDescription: 'A nice park. No permit needed for picnics.' }).length, 0);
});

test("New Year's Eve and Valentine's Day are holiday events, not search words", () => {
  const tax = { ...TAXONOMY, eventCategories: ['holiday-seasonal', 'markets-fairs'] };
  for (const q of ["New Year's Eve in Kelowna", 'NYE in Kelowna', "Valentine's Day in Kelowna"]) {
    const i = d.interpretDiscoveryQuery(q, tax);
    assert.equal(i.mode, 'events', q);
    assert.deepEqual(i.textTerms, [], q);
  }
});

test('a rough-access trail carries a road warning', () => {
  const ctx = { regions: [], labels: { regions: {}, types: {} } };
  const trail = { id: 9, type: 'outdoor', region: 'naramata', name: 'Southern Viewpoint Trail', textName: 'southern viewpoint trail', textDesc: 'the 2 km access road off chute lake road needs a high clearance vehicle', features: {}, collections: [], activities: ['viewpoints'] };
  assert.ok(tp.roughAccess(trail));
  assert.ok(!tp.roughAccess({ type: 'outdoor', textDesc: 'a paved lakeside path' }));
});

test('a floating sauna or wellness studio is a spa; a pool with a sauna is not', () => {
  const req = require('../trip-requirements');
  assert.ok(req.inferPlannerKinds({ type: 'indoor', name: 'Shelter Floating Sauna', description: 'A wood-fired sauna floating on Skaha Lake.' }).includes('spa'));
  assert.ok(!req.inferPlannerKinds({ type: 'indoor', name: 'Kelowna Family YMCA', description: 'Pool, gym and sauna.' }).includes('spa'));
});

test('French: « promenade » and « balade » are a walk, and « balade à vélo » is still a bike ride', () => {
  const fr = require('../trip-planner-fr.js');
  const tax = { regions: ['kelowna', 'penticton'], regionLabels: { kelowna: 'Kelowna', penticton: 'Penticton' } };
  assert.match(fr.tripPlannerText('un brunch puis une promenade à Kelowna', tax), /\bwalk\b/);
  assert.match(fr.tripPlannerText('une balade et un café à Penticton', tax), /\bwalk\b/);
  assert.match(fr.tripPlannerText('une balade à vélo à Kelowna', tax), /bike ride/);
});

test('Server: an events request naming a month is that month', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'concerts in Vernon in November' }, new Date('2026-10-25T18:00:00Z'));
  assert.equal(p.kind, 'events');
  assert.equal(p.eventWindow.from, '2026-11-01');
  assert.equal(p.eventWindow.to, '2026-11-30');
});

test('trail rides are horseback riding; a waterfall search finds "Falls"', () => {
  const req = require('../trip-requirements');
  assert.ok(req.inferPlannerKinds({ type: 'outdoor', name: 'Okanagan Stables', description: 'Guided trail rides through the hills above Lake Country.' }).includes('horseback'));
  const ds = require('../discovery-search.js');
  const v = { id: 1, name: 'BX Creek Trail & BX Falls', textName: 'bx creek trail bx falls', textCuisine: '', textDesc: 'a creek trail to a canyon', region: 'vernon', type: 'outdoor', collections: [], activities: [], features: {} };
  const res = ds.searchVenues({ mode: 'find', regions: ['vernon'], types: [], features: [], collections: [], activities: [], cuisines: [], textTerms: ['waterfall'], foodTerms: [], excluded: {} }, [v]);
  assert.equal(res.total, 1);
});

test('Server: a "near" request that finds nothing in the town looks in the towns around it', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'breweries near Lumby' });
  assert.ok((p.recommendations || []).length, p.summary);
  assert.match((p.notes || [])[0] || '', /^Nothing in Lumby itself matched, so this includes Coldstream and Vernon nearby\.$/);
  const k = app.runTripPlan({ text: 'wineries in Kelowna' });
  assert.ok(!(k.notes || []).some((n) => /itself matched/.test(n)), 'a request with results is unchanged');
});

test('Server: "the Okanagan in spring" gives ideas, not "couldn\'t work out a plan"', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'the Okanagan in spring' });
  assert.notEqual(p.kind, 'unknown');
  assert.equal(p.query, 'the Okanagan in spring');
});

test('Build My Trip: clock times are not search words ("dinner at 7pm", "lunch at noon")', () => {
  const i = d.interpretDiscoveryQuery('dinner at 7pm in Kelowna', TAXONOMY, { tripPlanner: true });
  assert.ok(!i.textTerms.includes('7pm') && !i.unsupported.includes('7pm'), JSON.stringify(i.textTerms));
  const j = d.interpretDiscoveryQuery('dinner at 7 pm in Kelowna', TAXONOMY, { tripPlanner: true });
  assert.ok(!j.textTerms.includes('pm') && !j.unsupported.includes('pm'));
});
