// Build My Trip, round 15b (2026-10-20): from a live check of /trip. "Wine tasting in Oliver on Sunday" is a tasting day
// (not an Ideas list) that starts when the wineries open with lunch after the first tasting; plans with suggested times
// (no date) get the same late-afternoon stop or "Free time" card a dated plan gets; a short first stop followed by a
// wait for lunch starts the day later; summaries say "visit A, then B" (not "then at B"); the timeline says "Free time
// before this stop: about 3 hr 15 min", not "Provisional free interval: 195 min". PURE tests on a small fixture valley,
// like r14-planner.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const v3 = require('../trip-planner-v3-page.js');
const { t3FrenchStory, t3FrenchPlan } = require('../trip-french-copy.js');
const { resolveEventLocation } = require('../trip-event-location.js');

const REGIONS = { vernon: 'Vernon', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', penticton: 'Penticton', oliver: 'Oliver', 'big-white': 'Big White' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'vegan', 'vegetarian', 'lake_view'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'holiday-seasonal', 'arts-culture', 'markets-fairs', 'nightlife', 'community-events'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor'), sport: T('Sport', 'Sports') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', lake_view: 'Lake View' }, featureNouns: {}, collections: {},
};
const CENTRES = { vernon: [50.267, -119.272], kelowna: [49.888, -119.47], 'west-kelowna': [49.863, -119.583], penticton: [49.48, -119.585], oliver: [49.183, -119.551], 'big-white': [49.72, -118.93] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: o.price === undefined ? 2 : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: o.cuisine || null, cuisineLabel: o.cuisine || null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: d.normalizeDiscoveryText(o.cuisine || ''), textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: o.collections || [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: null, seasonClosedToday: false, advisory: o.advisory ? { note: o.advisory, addedAt: '2026-10-01' } : null, ownerClosures: o.ownerClosures,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
// Kelowna: six lake-view parks a few km apart (no ratings, as on the real site), a balloon company and a far-off
// forest-road campsite with the same badge, restaurants, wineries (one by appointment only), cafés, an indoor playground.
const PARKS = ['Knoll Mountain Park', 'Mission Flats Park', 'Dillon Ridge Park', 'McKenzie Bluffs Park', 'Lakeshore Loop Park', 'Pine Point Park']
  .map((name, i) => add({ name, region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, activities: ['hiking', 'viewpoints'], desc: 'A city park with trails and a lookout over the lake.', dLat: 0.012 * i, dLng: 0.01 * (i % 2), collections: i === 0 ? ['local_favorite'] : [] }));
const BALLOON = add({ name: 'Kelowna Sky Ballooning', region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, desc: 'Hot air balloon flights at sunrise over the lake.', dLat: 0.02 });
const FAR_SITE = add({ name: 'Upland Lake Recreation Site', region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, desc: 'Free campsites on a forest service road lake, forty minutes up the hill.', dLat: 0.3, dLng: 0.2 });
const KITCHENS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => add({ name: `Kelowna Kitchen ${i + 1}`, region: 'kelowna', type: 'restaurant', rating: 4.6 - (i % 3) * 0.05, price: 2, hours: open('11:00', '22:00'), dLat: 0.003 * i, dLng: 0.002 * (i % 3) }));
const WINERIES = [0, 1, 2, 3].map((i) => add({ name: `Kelowna Bench Winery ${i + 1}`, region: 'kelowna', type: 'winery', rating: 4.7 - i * 0.05, price: null, hours: open('10:00', '18:00'), dLat: 0.01 * i, dLng: 0.02 }));
const PRIVATE_WINERY = add({ name: 'Kelowna Lane Winery', region: 'kelowna', type: 'winery', rating: 4.9, price: null, hours: open('10:00', '18:00'), dLat: 0.015, dLng: 0.02,
  advisory: 'Visits are by appointment only: a private tour and tasting ($200 per person) that you request ahead.' });
const BRUNCH_HOUSE = add({ name: 'Kelowna Morning Table', region: 'kelowna', type: 'restaurant', rating: 4.5, price: 2, hours: open('08:00', '14:00'), desc: 'Brunch every day: eggs benedict, pancakes and good coffee.', dLat: 0.002 });
const ROASTERS = [0, 1, 2, 3].map((i) => add({ name: `Kelowna Roasters ${i + 1}`, region: 'kelowna', type: 'cafe', rating: 4.8, price: 1, hours: open('07:00', '17:00'), desc: 'A small coffee roastery with espresso drinks.', dLat: 0.002 * i }));
const SUBS = add({ name: 'Kelowna Subs', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('10:00', '20:00'), desc: 'Subs and sandwiches.' });
const CLOSED_CAFE = add({ name: 'Kelowna Bakeshop', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('07:00', '16:00'), desc: 'A bakery and coffee shop.', ownerClosures: [{ from: '2026-10-20', to: '2026-11-03' }] });
const PLAY = add({ name: 'Kelowna Play Area', region: 'kelowna', type: 'indoor', rating: null, hours: open('09:00', '17:00'), desc: 'Indoor playground for young kids with a ball pit and play structures.' });
const MUSEUM = add({ name: 'Kelowna History Museum', region: 'kelowna', type: 'indoor', rating: null, hours: open('10:00', '17:00'), desc: 'A local history museum.' });
// Vernon: two breweries (a crawl of three can only have two) and lunch places.
const VERNON_BREWS = [0, 1].map((i) => add({ name: `Vernon Hop Works ${i + 1}`, region: 'vernon', type: 'brewery', rating: 4.6, hours: open('11:00', '22:00'), dLat: 0.003 * i }));
for (let i = 0; i < 3; i++) add({ name: `Vernon Diner ${i + 1}`, region: 'vernon', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
// Penticton: five breweries for a full crawl.
for (let i = 0; i < 5; i++) add({ name: `Penticton Ale Works ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.7 - i * 0.05, hours: open('11:00', '22:00'), dLat: 0.003 * i });
for (let i = 0; i < 3; i++) add({ name: `Penticton Grill ${i + 1}`, region: 'penticton', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
for (let i = 0; i < 2; i++) add({ name: `Penticton Pub ${i + 1}`, region: 'penticton', type: 'pub', rating: 4.5, price: 2, hours: open('11:00', '23:59'), dLat: 0.002 * i });
// Oliver: wineries and their restaurants.
for (let i = 0; i < 4; i++) add({ name: `Oliver Estate Winery ${i + 1}`, region: 'oliver', type: 'winery', rating: 4.7 - i * 0.05, price: null, hours: open('10:00', '17:00'), dLat: 0.01 * i });
for (let i = 0; i < 3; i++) add({ name: `Oliver Bistro ${i + 1}`, region: 'oliver', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
add({ name: 'Oliver Bakery', region: 'oliver', type: 'cafe', rating: 4.8, price: 1, hours: open('07:00', '15:00'), desc: 'Coffee and pastries.' });
// Penticton: a short lookout and a gallery (round 15b).
const LOOKOUT = add({ name: 'Penticton Lookout', region: 'penticton', type: 'outdoor', rating: null, features: { lake_view: true }, activities: ['viewpoints'], desc: 'A short walk up to a lookout over the lake.' });
add({ name: 'Penticton Gallery', region: 'penticton', type: 'indoor', rating: null, hours: open('10:00', '17:00'), desc: 'A public art gallery.' });
// Big White: the hill and a lunch and dinner on it.
const HILL = add({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Ski resort with 119 runs and the lifts open 8:30 to 3:30.' });
add({ name: 'Big White Lodge Grill', region: 'big-white', type: 'restaurant', rating: 4.4, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 });
add({ name: 'Big White Village Bistro', region: 'big-white', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.003 });

function build(text, opts = {}) {
  const t = opts.french ? fr.tripPlannerText(text, TAXONOMY) : text;
  const intent = d.interpretDiscoveryQuery(t, TAXONOMY);
  let trip = d.interpretTripComponents(t, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text: t, intent, trip, taxonomy: TAXONOMY, referenceDate: opts.today || '2026-10-20' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = null; requirements.startMinutes = 540; }
  const used = requirements.startDate || requirements.daypart || requirements.items.some((i) => !['days', 'base', 'type'].includes(i.kind)) ? requirements : null;
  if (used) trip = r.expandTripComponents(trip.multi ? trip : { ...trip, regions: intent.regions || [], party: intent.party || trip.party, when: intent.when || trip.when }, used);
  return { text: t, intent, trip, requirements: used, opts };
}
function run(b, extra = {}) {
  return tp.planTrip({ intent: b.intent, trip: b.trip.multi ? b.trip : null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text,
    tripDate: (b.requirements && b.requirements.startDate) || b.opts.tripDate || '2026-10-24', tripEvents: b.trip.multi ? b.trip.components.map(() => []) : [], ...extra });
}
const plan = (text, opts) => run(build(text, opts || {}));
const allStops = (p) => ((p.days && p.days.length) ? p.days.flatMap((x) => x.stops) : ((p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [])).filter((s) => s.venue || s.event);
const names = (p) => allStops(p).filter((s) => s.venue).map((s) => s.venue.name);

const tripStory = require('../trip-story.js');
const fs = require('fs');
const path = require('path');
const rowOf = (p, id) => (p.schedule || []).find((r) => r.venueId === id);
const dinnerWait = (p, day = 1) => { const rows = (p.schedule || []).filter((r) => r.day === day); return rows.length ? rows[rows.length - 1].waitMinutes : null; };

test('Tasting day (round 15b): "wine tasting in Oliver" and its dated form are a plan of wineries with lunch, not Ideas', () => {
  for (const q of ['wine tasting in Oliver', 'wine tasting in Oliver on October 25']) {
    const p = plan(q);
    assert.equal(p.kind, 'itinerary', q);
    const stops = allStops(p).filter((s) => s.venue);
    assert.ok(stops.filter((s) => s.venue.type === 'winery').length >= 2, `${q}: ${names(p).join(', ')}`);
    const lunch = stops.find((s) => s.label === 'Lunch');
    assert.ok(lunch, `${q}: no lunch`);
    // Lunch comes after the first tasting, and every stop has a time (it was "unmet" at 3:40 PM).
    assert.equal(stops.indexOf(lunch), 1, `${q}: ${names(p).join(', ')}`);
    for (const r of p.schedule) assert.ok(Number.isFinite(r.startMinutes), `${q}: ${JSON.stringify(r)}`);
    const first = p.schedule[0];
    assert.ok(first.startMinutes <= 11 * 60, `${q}: first tasting at ${first.startMinutes}`);
    assert.ok(rowOf(p, lunch.venue.id).startMinutes <= 13 * 60 + 30, `${q}: lunch at ${rowOf(p, lunch.venue.id).startMinutes}`);
  }
  // A brewery crawl is unchanged: an afternoon, with food after the second brewery.
  const b = plan('brewery crawl in Penticton');
  assert.match(allStops(b).filter((s) => s.venue)[2].label, /^(?:Late )?lunch$/i);
  assert.ok(b.schedule[0].startMinutes >= 12 * 60);
});

test('Suggested times (round 15b): an undated day gets the same afternoon stop or Free time card as a dated one', () => {
  const undated = plan('a day in Kelowna'), dated = plan('a day in Kelowna on October 24');
  assert.ok(undated.suggestedTimes, 'undated plans are timed as a suggested schedule');
  assert.ok(undated.days[0].stops.some((s) => s.gapFill), names(undated).join(', '));
  assert.ok(dinnerWait(undated) < 90, `wait before dinner ${dinnerWait(undated)}`);
  assert.ok(dated.days[0].stops.some((s) => s.gapFill));
  // With nothing to add (a rainy day: indoor places only), the wait is a labelled Free time block.
  const rainy = plan('rainy day in Kelowna');
  assert.ok(rainy.days[0].stops.some((s) => s.gapFill || s.freeTime), JSON.stringify(rainy.days[0].stops.map((s) => s.label)));
  // The rows still carry no date (My Trip keeps the times, not a date) and the filled plan's story names the new stop.
  for (const r of undated.schedule) assert.equal(r.date, undefined);
  const fill = undated.days[0].stops.find((s) => s.gapFill);
  assert.match(undated.story.text, new RegExp(fill.venue.name));
});

test('Morning gaps (round 15b): a short first stop then a wait for lunch starts the day later, dated or not', () => {
  for (const q of ['a day in Penticton', 'a day in Penticton on October 24']) {
    const p = plan(q);
    const rows = p.schedule.filter((r) => r.day === 1);
    const lunchRow = rows.find((r, i) => i > 0 && r.startMinutes >= 690 && r.startMinutes <= 840);
    assert.ok(lunchRow, `${q}: ${JSON.stringify(rows)}`);
    const waitBeforeLunch = rows.slice(1, rows.indexOf(lunchRow) + 1).reduce((n, r) => n + (r.waitMinutes || 0), 0);
    assert.ok(waitBeforeLunch < 60, `${q}: ${waitBeforeLunch} minutes of waiting before lunch`);
    assert.ok(rows[0].startMinutes > 540, `${q}: still starts at ${rows[0].startMinutes}`);
  }
});

test('Story (round 15b): a second stop of the same kind keeps the verb\'s own word ("visit A, then B")', () => {
  const facts = [
    { id: 1, name: 'Science Centre', type: 'indoor', features: {}, collections: [], activities: [], plannerKinds: [] },
    { id: 2, name: 'VR Arcade', type: 'indoor', features: {}, collections: [], activities: [], plannerKinds: [] },
    { id: 3, name: 'Bench Winery', type: 'winery', features: {}, collections: [], activities: [], plannerKinds: [] },
    { id: 4, name: 'Lake Winery', type: 'winery', features: {}, collections: [], activities: [], plannerKinds: [] },
  ];
  const stop = (id, daypart) => ({ kind: 'venue', daypart, label: 'Afternoon', venue: { id, name: facts[id - 1].name, type: facts[id - 1].type, regionLabel: 'Vernon' } });
  const s = tripStory.buildStory({ kind: 'day_plan', days: [{ day: 1, stops: [stop(1, 'afternoon'), stop(2, 'afternoon'), stop(3, 'afternoon'), stop(4, 'afternoon')] }], schedule: [] }, facts, {});
  assert.ok(s && s.text, JSON.stringify(s));
  assert.doesNotMatch(s.text, /then at VR Arcade/);
  assert.match(s.text, /Visit Science Centre, then VR Arcade/);
  assert.match(s.text, /then at Lake Winery/);
  assert.doesNotMatch(s.textFr, /puis à VR Arcade/);
  assert.match(s.textFr, /puis à Lake Winery/);
});

test('Timeline (round 15b): the wait before a stop is "Free time … about 3 hr 15 min", never "Provisional free interval"', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.doesNotMatch(src, /Provisional free interval|Intervalle libre provisoire/);
  assert.match(src, /Free time before this stop: /);
  assert.match(src, /Temps libre avant cet arrêt : /);
});

test('Afternoon tastings (round 15b): "winery hopping in Oliver this afternoon" is three wineries, then dinner', () => {
  for (const q of ['winery hopping in Oliver this afternoon', 'wine tasting in Oliver this afternoon']) {
    const p = plan(q);
    assert.equal(p.kind, 'itinerary', q);
    const stops = allStops(p).filter((s) => s.venue);
    assert.equal(stops.filter((s) => s.venue.type === 'winery').length, 3, `${q}: ${names(p).join(', ')}`);
    assert.equal(stops[stops.length - 1].label, 'Dinner', `${q}: ${stops.map((s) => s.label).join(', ')}`);
    for (const r of p.schedule) assert.ok(Number.isFinite(r.startMinutes), `${q}: ${JSON.stringify(r)}`);
    assert.ok(p.schedule[0].startMinutes >= 12 * 60, `${q}: an afternoon starts after noon`);
    assert.doesNotMatch(p.experience.text, /in between/);
    assert.doesNotMatch(p.story.text, /In the afternoon/, 'all of it is the afternoon');
  }
});

test('Late lunch (round 15b): a crawl meal at 2:30 PM or later is a late lunch, in the label and the summary (EN + FR)', () => {
  const p = plan('brewery crawl in Penticton');
  const meal = allStops(p).find((s) => s.venue && ['restaurant', 'pub'].includes(s.venue.type));
  const row = p.schedule.find((r) => r.venueId === meal.venue.id);
  assert.ok(row.startMinutes >= 14 * 60 + 30, `meal at ${row.startMinutes}`);
  assert.equal(meal.label, 'Late lunch');
  assert.match(p.story.text, /have a late lunch at/);
  assert.match(p.story.textFr, /prenez un dîner tardif à/);
  assert.match(p.experience.text, /with a late lunch at/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-french-copy.js'), 'utf8'), /'Late lunch':'Dîner tardif'/);
  // A real midday lunch keeps its label.
  const wine = plan('wine tasting in Oliver');
  assert.ok(allStops(wine).some((s) => s.label === 'Lunch'), allStops(wine).map((s) => s.label).join(', '));
});
