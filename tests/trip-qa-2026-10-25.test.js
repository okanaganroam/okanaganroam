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
