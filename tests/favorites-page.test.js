'use strict';

// Stage 4.4 (2026-10-01): /favorites page rules (favorites-page.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { favoritesCore } = require('../favorites-page');
const C = favoritesCore();
const NOW = '2026-10-01T04:00:00.000Z';

const venue = (id, name, region = 'kelowna', type = 'winery', slugName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) => ({ ref: `venue:${id}`, name, region, type, url: `/${region}/${type}s/${slugName}` });
const ev = (id, name, region = 'kelowna') => ({ ref: `event:${id}`, name, region, url: `/${region}/events/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });

test('Stage 4.4 storage: either key missing or corrupt is read as empty; names are de-duplicated; invalid saved items are ignored', () => {
  assert.deepEqual(C.readLegacy(null), []);
  assert.deepEqual(C.readLegacy('{bad'), []);
  assert.deepEqual(C.readLegacy('"x"'), []);
  assert.deepEqual(C.readLegacy('["A","",null,"A","B"]'), ['A', 'B']);
  assert.deepEqual(C.readSaved(null), { v: 1, items: [] });
  assert.deepEqual(C.readSaved('{"v":2,"items":[{"k":"venue","id":1}]}'), { v: 1, items: [] });
  assert.deepEqual(C.readSaved('{"v":1,"items":[{"k":"venue","id":1},{"k":"place","id":2},{"k":"venue","id":0},{"k":"event","id":3,"occ":4},null]}').items.map(C.refOf), ['venue:1', 'event:3@4']);
});

test('Stage 4.4 plan: saved refs plus legacy names no saved item carries; batches of at most 100 items and 100 names', () => {
  const saved = { v: 1, items: [{ k: 'venue', id: 1, name: 'Ailm Estate' }, { k: 'event', id: 9, occ: 7, name: 'Wine Night' }, { k: 'event', id: 9, occ: 8, name: 'Wine Night' }] };
  assert.deepEqual(C.plan(['Ailm Estate', 'Wine Night', 'Solo Cafe'], saved), { refs: ['venue:1', 'event:9@7', 'event:9@8'], names: ['Solo Cafe'] });
  const big = C.batches({ refs: Array.from({ length: 150 }, (_, i) => `venue:${i + 1}`), names: Array.from({ length: 230 }, (_, i) => `n${i}`) });
  assert.deepEqual(big.map((b) => [b.items.length, b.names.length]), [[100, 100], [50, 100], [0, 30]]);
  assert.deepEqual(C.batches({ refs: [], names: [] }), []);
});

test('Stage 4.4 legacy-only: one match adopts its id, several wait for a choice, none is "no longer listed"', () => {
  const legacy = ['Ailm Estate', 'Rotary Beach Park', 'Gone Cafe', 'Harvest Night'];
  const resolved = { items: [], names: [
    { name: 'Ailm Estate', status: 'resolved', candidates: [{ kind: 'venue', ...venue(1420, 'Ailm Estate') }] },
    { name: 'Rotary Beach Park', status: 'ambiguous', candidates: [{ kind: 'venue', ...venue(1180, 'Rotary Beach Park', 'kelowna', 'beach') }, { kind: 'venue', ...venue(1181, 'Rotary Beach Park', 'west-kelowna', 'beach') }] },
    { name: 'Gone Cafe', status: 'missing', candidates: [] },
    { name: 'Harvest Night', status: 'resolved', candidates: [{ kind: 'event', ...ev(55, 'Harvest Night', 'oliver') }] },
  ] };
  const a = C.apply(legacy, { v: 1, items: [] }, resolved, NOW);
  assert.equal(a.changed, true);
  assert.deepEqual(a.saved.items, [
    { k: 'venue', id: 1420, name: 'Ailm Estate', savedAt: NOW, adopted: true },
    { k: 'event', id: 55, occ: null, date: null, time: null, name: 'Harvest Night', savedAt: NOW, adopted: true },
  ]);
  assert.deepEqual(a.view.places.map((p) => [p.ref, p.region, p.type]), [['venue:1420', 'kelowna', 'winery']]);
  assert.deepEqual(a.view.events.map((e) => [e.ref, e.status]), [['event:55', 'undated']], 'a name-only event: "No date saved", never a guessed date');
  assert.deepEqual(a.view.choose.map((c) => [c.name, c.candidates.map((x) => x.ref)]), [['Rotary Beach Park', ['venue:1180', 'venue:1181']]], 'same-name venues are never guessed');
  assert.deepEqual(a.view.gone, [{ name: 'Gone Cafe', nameOnly: true }]);
});

test('Stage 4.4 id-only: active venues show; a redirected venue becomes its canonical id (merged when already saved); missing items stay listed', () => {
  const saved = { v: 1, items: [
    { k: 'venue', id: 38, name: 'BNA Brewing Vernon' },
    { k: 'venue', id: 999, name: 'Closed Place' },
    { k: 'venue', id: 7, name: 'Solo Cafe' },
    { k: 'venue', id: 40, name: 'BNA Brewing Vernon' },
  ] };
  const resolved = { names: [], items: [
    { ref: 'venue:38', status: 'redirected', canonical: 'venue:40', venue: venue(40, 'BNA Brewing Vernon', 'vernon', 'brewery') },
    { ref: 'venue:999', status: 'missing' },
    { ref: 'venue:7', status: 'active', venue: venue(7, 'Solo Cafe', 'vernon', 'cafe') },
    { ref: 'venue:40', status: 'active', venue: venue(40, 'BNA Brewing Vernon', 'vernon', 'brewery') },
  ] };
  const a = C.apply(['BNA Brewing Vernon', 'Closed Place', 'Solo Cafe'], saved, resolved, NOW);
  assert.equal(a.changed, true);
  assert.deepEqual(a.saved.items, [
    { k: 'venue', id: 40, name: 'BNA Brewing Vernon', redirectedFrom: 38 },
    { k: 'venue', id: 999, name: 'Closed Place' },
    { k: 'venue', id: 7, name: 'Solo Cafe' },
  ]);
  assert.deepEqual(a.view.places.map((p) => p.ref), ['venue:40', 'venue:7']);
  assert.deepEqual(a.view.gone, [{ ref: 'venue:999', name: 'Closed Place' }], 'missing: shown with its saved name, never deleted or swapped');
  // Nothing to change: not changed.
  assert.equal(C.apply(['Solo Cafe'], { v: 1, items: [{ k: 'venue', id: 7, name: 'Solo Cafe' }] }, { names: [], items: [resolved.items[2]] }, NOW).changed, false);
});

test('Stage 4.4 events: every occurrence state; grouped upcoming (by date, cancelled/postponed included), no date saved, and past (newest first)', () => {
  const E = ev(256, 'BC Wine Night', 'penticton');
  const occ = (id, date, time, status) => ({ ref: `event:256@${id}`, status, event: E, occurrence: { id, date, endDate: date, time } });
  const items = [
    { k: 'event', id: 256, occ: 467, name: 'BC Wine Night' }, { k: 'event', id: 256, occ: 465, name: 'BC Wine Night' },
    { k: 'event', id: 256, occ: 400, name: 'BC Wine Night' }, { k: 'event', id: 256, occ: 300, name: 'BC Wine Night' },
    { k: 'event', id: 256, occ: 466, name: 'BC Wine Night' }, { k: 'event', id: 256, occ: 470, name: 'BC Wine Night' },
    { k: 'event', id: 256, occ: null, name: 'BC Wine Night' }, { k: 'event', id: 256, occ: 999, name: 'BC Wine Night' },
    { k: 'event', id: 404, occ: 1, name: 'Deleted Event' },
  ];
  const resolved = { names: [], items: [
    occ(467, '2026-11-30', '13:00', 'upcoming'), occ(465, '2026-09-30', '13:00', 'upcoming'), occ(400, '2026-08-01', null, 'past'), occ(300, '2026-07-01', null, 'past'),
    occ(466, '2026-10-30', '13:00', 'cancelled'), occ(470, '2026-12-30', '13:00', 'postponed'),
    { ref: 'event:256', status: 'undated', event: E }, { ref: 'event:256@999', status: 'missing_occurrence', event: E },
    { ref: 'event:404@1', status: 'missing' },
  ] };
  const a = C.apply(['BC Wine Night', 'Deleted Event'], { v: 1, items }, resolved, NOW);
  assert.equal(a.changed, false);
  const g = C.eventGroups(a.view.events);
  assert.deepEqual(g.upcoming.map((e) => [e.ref, e.status]), [['event:256@465', 'upcoming'], ['event:256@466', 'cancelled'], ['event:256@467', 'upcoming'], ['event:256@470', 'postponed']]);
  assert.deepEqual(g.undated.map((e) => [e.ref, e.status]), [['event:256', 'undated'], ['event:256@999', 'missing_occurrence']]);
  assert.deepEqual(g.past.map((e) => e.ref), ['event:256@400', 'event:256@300']);
  assert.deepEqual(a.view.gone, [{ ref: 'event:404@1', name: 'Deleted Event' }]);
});

test('Stage 4.4 mixed: a legacy name already carried by a saved item is not looked up again', () => {
  const saved = { v: 1, items: [{ k: 'venue', id: 1180, name: 'Rotary Beach Park' }] };
  assert.deepEqual(C.plan(['Rotary Beach Park', 'Ailm Estate'], saved).names, ['Ailm Estate']);
});

test('Stage 4.4 remove: drops the item, and the legacy name only when no other saved item still carries it', () => {
  const legacy = ['BC Wine Night', 'Ailm Estate', 'Gone Cafe'];
  const saved = { v: 1, items: [{ k: 'event', id: 256, occ: 465, name: 'BC Wine Night' }, { k: 'event', id: 256, occ: 466, name: 'BC Wine Night' }, { k: 'venue', id: 1420, name: 'Ailm Estate' }] };
  const one = C.remove(legacy, saved, { ref: 'event:256@465' });
  assert.deepEqual(one.saved.items.map(C.refOf), ['event:256@466', 'venue:1420']);
  assert.deepEqual(one.legacy, legacy, 'another date of the same event is still saved: the name stays');
  const two = C.remove(one.legacy, one.saved, { ref: 'event:256@466' });
  assert.deepEqual(two.legacy, ['Ailm Estate', 'Gone Cafe'], 'last one: the legacy name goes too, so its Favorite buttons unpress');
  const three = C.remove(two.legacy, two.saved, { name: 'Gone Cafe' });
  assert.deepEqual(three.legacy, ['Ailm Estate']);
  assert.deepEqual(three.saved.items.map(C.refOf), ['venue:1420']);
});

test('Stage 4.4 choose: saves the chosen listing by id (an event as "No date saved"); never twice', () => {
  const s1 = C.choose({ v: 1, items: [] }, 'Rotary Beach Park', 'venue:1181', NOW);
  assert.deepEqual(s1.items, [{ k: 'venue', id: 1181, name: 'Rotary Beach Park', savedAt: NOW, chosen: true }]);
  assert.equal(C.choose(s1, 'Rotary Beach Park', 'venue:1181', NOW), s1, 'already saved: unchanged');
  const s2 = C.choose(s1, 'Harvest Night', 'event:55', NOW);
  assert.deepEqual(s2.items[1], { k: 'event', id: 55, occ: null, date: null, time: null, name: 'Harvest Night', savedAt: NOW, chosen: true });
  assert.equal(C.choose(s1, 'x', 'nope', NOW), s1);
});
