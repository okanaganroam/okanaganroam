'use strict';
// Build My Trip review fixes (2026-10-21): "no hiking", a walk by the lake, one estate once, beaches off season,
// dog-only beaches, and summer-only places in October.
const test = require('node:test');
const assert = require('node:assert/strict');
const req = require('../trip-requirements');
const tp = require('../trip-planner');

const items = (text) => req.extractTripRequirements({ text, intent: { days: 2 }, taxonomy: { regions: ['penticton'], regionLabels: { penticton: 'Penticton' } } }).items;

test('"no hiking" rules out trail networks, not a garden or a lakeside walk', () => {
  const it = items('A weekend in Penticton, wineries, a nice lake walk, no hiking');
  const no = it.find((i) => i.kind === 'excluded_activity' && i.value === 'hiking');
  assert.ok(no, JSON.stringify(it));
  const trails = { id: 1, type: 'outdoor', name: 'Three Blind Mice Trail Network', description: 'A mountain biking and hiking trail network above Penticton with lake views.' };
  const garden = { id: 2, type: 'outdoor', name: 'Penticton Ikeda Japanese Garden', description: "A quiet Japanese garden on Penticton's Okanagan Lake waterfront, with a short walking path." };
  assert.equal(req.venueAllowed(trails, { items: it }, 1, null), false);
  assert.equal(req.venueAllowed(garden, { items: it }, 1, null), true);
  assert.equal(items('wineries and hiking in Penticton').some((i) => i.kind === 'excluded_activity'), false);
});

test('"a nice lake walk" wants a walk by the lake', () => {
  const walk = items('a nice lake walk and dinner').find((i) => i.kind === 'venue_kind' && i.value === 'walk');
  assert.equal(walk.lakeside, true);
  const beach = { id: 3, type: 'beach', name: 'Okanagan Beach', description: 'Okanagan Beach runs nearly a kilometre along Lakeshore Drive.' };
  const rental = { id: 4, type: 'outdoor', name: 'Pier Water Sports', description: 'A lakefront rental counter on Okanagan Beach; walk-up paddleboard rentals.' };
  const hill = { id: 5, type: 'outdoor', name: 'Munson Mountain', description: 'A short walking trail to the top, with views of the lake.' };
  assert.equal(req.matches(beach, walk), true);
  assert.equal(req.matches(rental, walk), false);
  assert.equal(req.matches(hill, walk), false);
});

test('one estate once: a winery restaurant blocks its winery, two wineries are never linked', () => {
  const facts = [
    { id: 10, type: 'winery', name: 'Poplar Grove Winery' },
    { id: 11, type: 'restaurant', name: 'The Restaurant at Poplar Grove', description: 'Dinner at the winery.' },
    { id: 12, type: 'winery', name: 'Black Widow Winery' },
    { id: 13, type: 'winery', name: 'Black Hills Estate Winery' },
    { id: 14, type: 'restaurant', name: 'Kitchen @ Da Silva Winery' },
    { id: 15, type: 'winery', name: 'Da Silva Vineyards and Winery' },
  ];
  assert.ok(tp.withSameEstates(facts, [11]).has(10));
  assert.ok(tp.withSameEstates(facts, [14]).has(15));
  assert.ok(!tp.withSameEstates(facts, [12]).has(13));
});

test('off season: beaches once a day, no dog-only beach without a dog, no water park or speedway in October', () => {
  assert.equal(tp.coolBeachMonth('2026-10-24'), true);
  assert.equal(tp.coolBeachMonth('2026-07-10'), false);
  assert.equal(tp.dogOnlyPlace({ type: 'beach', name: 'Poplar Point Dog Beach (Sutherland Bay Park)' }), true);
  assert.equal(tp.dogOnlyPlace({ type: 'beach', name: 'Boyce-Gyro Beach Park' }), false);
  const ctx = { tripDate: '2026-10-24', types: new Set(), activities: new Set(), requirements: { text: '2 days in Penticton with the kids' } };
  assert.equal(tp.offSeasonSkip({ type: 'outdoor', name: 'Penticton Speedway', textName: 'penticton speedway' }, ctx), true);
  assert.equal(tp.offSeasonSkip({ type: 'outdoor', name: 'Splash BC Floating Water Park', textName: 'splash bc floating water park' }, ctx), true);
  assert.equal(tp.offSeasonSkip({ type: 'outdoor', name: 'Penticton Speedway', textName: 'penticton speedway' }, { ...ctx, tripDate: '2026-07-10' }), false);
});
