// Build My Trip planning logic (2026-10-28, Dayton's review): never the same winery estate twice on a trip (CedarCreek's
// tasting room and lunch at Home Block at CedarCreek), "cozy" is not a sports bar, a date night's drink is a lounge or a
// winery before a pub, and a long day hike is timed and ranked as one.
// PURE, like tests/trip-golden.test.js: the production snapshot in tests/fixtures/trip-golden-inputs.json.gz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');

const { facts: FACTS, taxonomy: TAXONOMY, labels: LABELS } = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'trip-golden-inputs.json.gz'))).toString('utf8'));
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));
const CLOCK = { weekday: 'tue', minutes: 12 * 60 };
function plan(text, seed = 0) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const w = intent.when || {};
  const startWeekday = w.weekday ? w.weekday.slice(0, 3) : ({ 'this-weekend': 'sat', today: 'tue' }[w.preset] || null);
  const common = { intent, facts: FACTS, labels: LABELS, seed, clock: CLOCK, startWeekday };
  return trip.multi ? tp.planTrip({ ...common, trip, tripEvents: trip.components.map(() => []), tripDate: '2026-09-29' }) : tp.planTrip({ ...common, events: null });
}
const stops = (p) => [...(p.days || []).flatMap((x) => x.stops), ...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || [])].filter((s) => s.venue);

test('One winery estate once a trip: no tasting room and its own restaurant in the same plan', () => {
  const g = tp.withSameEstates(FACTS, new Set([FACTS.find((v) => v.name === 'CedarCreek Estate Winery').id]));
  assert.ok(g.has(FACTS.find((v) => v.name === 'Home Block at CedarCreek Estate Winery').id), 'Home Block belongs to CedarCreek');
  for (const text of ['a fall weekend in Kelowna with wineries, a cozy dinner and a hike', 'a weekend in Kelowna with wineries and good food', '3 days in Kelowna wineries and restaurants']) {
    for (const seed of [0, 1, 2]) {
      const ids = stops(plan(text, seed)).map((s) => s.venue.id);
      for (const id of ids) {
        const twins = [...tp.withSameEstates(FACTS, new Set([id]))].filter((x) => x !== id && ids.includes(x));
        assert.deepEqual(twins.map((x) => BY_ID.get(x).name), [], `${text} (seed ${seed}): ${BY_ID.get(id).name} and its estate twin`);
      }
    }
  }
});

test('"Cozy" is not a sports bar: a cozy dinner skips sports-TV restaurants when others match', () => {
  for (const text of ['a fall weekend in Kelowna with wineries, a cozy dinner and a hike', 'a cozy dinner and wineries in Kelowna this weekend']) {
    for (const seed of [0, 1, 2]) {
      const dinners = stops(plan(text, seed)).filter((s) => s.daypart === 'evening' && s.venue.type === 'restaurant');
      assert.ok(dinners.length, text);
      for (const s of dinners) assert.ok(!BY_ID.get(s.venue.id).features.sports_tv, `${text} (seed ${seed}): ${s.venue.name} has the Sports TV badge`);
    }
  }
});

test('A date night\'s drink is a lounge or a winery before a pub, where one is open', () => {
  const p = plan('date night in Kelowna');
  assert.equal(p.kind, 'outing');
  const drink = p.outing.stops[0].venue;
  assert.ok(['cocktail', 'winery'].includes(drink.type), JSON.stringify(drink));
});

test('A long day hike: ranked below shorter hikes unless asked for, and timed as most of a day', () => {
  const long = { type: 'outdoor', description: 'A long day hike up the creek valley past sub-alpine ponds to the lake.' };
  const black = { type: 'outdoor', description: 'A 29 km return, 1,740 m day hike or overnight from the trailhead to the viewpoint.' };
  const short = { type: 'outdoor', description: 'A 2.5 km loop through the forest.' };
  assert.equal(tp.longDayHike(long), true);
  assert.equal(tp.longDayHike(short), false);
  assert.equal(tp.longDayHikeMinutes(long), 300);
  assert.equal(tp.longDayHikeMinutes(black), 600);
  assert.equal(tp.longDayHikeMinutes(short), null);
});
