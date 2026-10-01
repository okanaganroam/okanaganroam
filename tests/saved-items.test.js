'use strict';

// Stage 4.3 (2026-10-01): saved-item identity -- the pure rules (saved-items.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../saved-items');

// A tiny in-memory stand-in for the server's read-only lookups.
function fakeDeps() {
  const venues = {
    1: { id: 1, name: 'Rotary Beach Park', region: 'kelowna', type: 'beach', slug: 'rotary-beach-park', redirect_to: null },
    2: { id: 2, name: 'Rotary Beach Park', region: 'west-kelowna', type: 'beach', slug: 'rotary-beach-park', redirect_to: null },
    3: { id: 3, name: 'Old Duplicate Winery', region: 'kelowna', type: 'winery', slug: 'old-duplicate-winery', redirect_to: 4 },
    4: { id: 4, name: 'Canonical Winery', region: 'kelowna', type: 'winery', slug: 'canonical-winery', redirect_to: null },
    5: { id: 5, name: 'Loop A', region: 'kelowna', type: 'cafe', slug: 'loop-a', redirect_to: 6 },
    6: { id: 6, name: 'Loop B', region: 'kelowna', type: 'cafe', slug: 'loop-b', redirect_to: 5 },
    7: { id: 7, name: 'Solo Cafe', region: 'vernon', type: 'cafe', slug: 'solo-cafe', redirect_to: null },
  };
  const events = { 10: { id: 10, name: 'Harvest Long Table', region: 'oliver', slug: 'harvest-long-table' }, 11: { id: 11, name: 'Other Event', region: 'kelowna', slug: 'other-event' } };
  const occ = {
    100: { id: 100, event_id: 10, start_date: '2026-10-17', end_date: '2026-10-17', start_time: '18:00', status: 'scheduled' },
    101: { id: 101, event_id: 10, start_date: '2026-09-12', end_date: '2026-09-12', start_time: null, status: 'scheduled' },
    102: { id: 102, event_id: 10, start_date: '2026-10-24', end_date: '2026-10-24', start_time: '18:00', status: 'cancelled' },
    103: { id: 103, event_id: 10, start_date: '2026-10-31', end_date: '2026-10-31', start_time: '18:00', status: 'postponed' },
    104: { id: 104, event_id: 11, start_date: '2026-11-01', end_date: '2026-11-01', start_time: null, status: 'scheduled' },
  };
  const slugs = { beach: 'beaches', winery: 'wineries', cafe: 'cafes' };
  return {
    today: '2026-10-01',
    getVenue: (id) => venues[id] || null,
    getEvent: (id) => events[id] || null,
    getOccurrence: (id) => occ[id] || null,
    findVenuesByName: (name) => Object.values(venues).filter((v) => v.name === name && !v.redirect_to),
    findEventsByName: (name) => Object.values(events).filter((e) => e.name === name),
    venueUrl: (v) => `/${v.region}/${slugs[v.type]}/${v.slug}`,
    eventUrl: (e) => `/${e.region}/events/${e.slug}`,
  };
}
const resolve = (input) => S.resolveSavedItems(input, fakeDeps());

test('Stage 4.3 ids: typed refs parse and format strictly; anything else is rejected', () => {
  assert.deepEqual(S.parseRef('venue:571'), { k: 'venue', id: 571 });
  assert.deepEqual(S.parseRef('event:256@466'), { k: 'event', id: 256, occ: 466 });
  assert.deepEqual(S.parseRef('event:256'), { k: 'event', id: 256, occ: null });
  for (const bad of ['', 'venue:', 'venue:0', 'venue:01', 'venue:5@6', 'event:@4', 'event:1@0', 'Venue:5', 'place:5', 'venue:5 ', 'venue:12345678901', 'event-5']) {
    assert.equal(S.parseRef(bad), null, bad);
  }
  assert.equal(S.formatRef({ k: 'venue', id: 9 }), 'venue:9');
  assert.equal(S.formatRef({ k: 'event', id: 9, occ: 3 }), 'event:9@3');
  assert.equal(S.formatRef({ k: 'event', id: 9, occ: null }), 'event:9');
});

test('Stage 4.3 bounds: at most 100 items and 100 names of at most 120 characters; one bad item rejects the request', () => {
  assert.equal(S.validateResolveInput({ items: Array.from({ length: 100 }, (_, i) => `venue:${i + 1}`) }).ok, true);
  assert.equal(S.validateResolveInput({ items: Array.from({ length: 101 }, (_, i) => `venue:${i + 1}`) }).ok, false);
  assert.equal(S.validateResolveInput({ names: Array.from({ length: 101 }, () => 'x') }).ok, false);
  assert.equal(S.validateResolveInput({ names: ['x'.repeat(120)] }).ok, true);
  assert.equal(S.validateResolveInput({ names: ['x'.repeat(121)] }).ok, false);
  assert.match(S.validateResolveInput({ items: ['venue:1', 'nope'] }).error, /invalid item/);
  assert.deepEqual(resolve({}), { ok: true, items: [], names: [] });
});

test('Stage 4.3 venues: active, redirected to the canonical venue, missing, and a redirect loop is missing (never another venue)', () => {
  const r = resolve({ items: ['venue:1', 'venue:3', 'venue:999', 'venue:5'] });
  assert.equal(r.ok, true);
  const [active, redirected, missing, loop] = r.items;
  assert.deepEqual(active, { ref: 'venue:1', status: 'active', venue: { ref: 'venue:1', name: 'Rotary Beach Park', region: 'kelowna', type: 'beach', url: '/kelowna/beaches/rotary-beach-park' } });
  assert.equal(redirected.status, 'redirected');
  assert.equal(redirected.canonical, 'venue:4');
  assert.equal(redirected.venue.url, '/kelowna/wineries/canonical-winery');
  assert.deepEqual(missing, { ref: 'venue:999', status: 'missing' });
  assert.deepEqual(loop, { ref: 'venue:5', status: 'missing' });
});

test('Stage 4.3 events: one specific occurrence -- upcoming, past, cancelled, postponed; undated when saved without one; never another event\'s occurrence', () => {
  const r = resolve({ items: ['event:10@100', 'event:10@101', 'event:10@102', 'event:10@103', 'event:10', 'event:10@104', 'event:10@999', 'event:404@100'] });
  const st = r.items.map((x) => x.status);
  assert.deepEqual(st, ['upcoming', 'past', 'cancelled', 'postponed', 'undated', 'missing_occurrence', 'missing_occurrence', 'missing']);
  assert.deepEqual(r.items[0].occurrence, { id: 100, date: '2026-10-17', endDate: '2026-10-17', time: '18:00' });
  assert.deepEqual(r.items[0].event, { ref: 'event:10', name: 'Harvest Long Table', region: 'oliver', url: '/oliver/events/harvest-long-table' });
  assert.equal(r.items[4].occurrence, undefined, 'no occurrence is invented for an undated save');
});

test('Stage 4.3 legacy names: one exact match resolves; same-name venues are ambiguous and never guessed; unknown names are missing', () => {
  const r = resolve({ names: ['Solo Cafe', 'Rotary Beach Park', 'solo cafe', 'Old Duplicate Winery', 'Harvest Long Table'] });
  const [solo, rotary, lower, retired, event] = r.names;
  assert.equal(solo.status, 'resolved');
  assert.deepEqual(solo.candidates.map((c) => c.ref), ['venue:7']);
  assert.equal(rotary.status, 'ambiguous');
  assert.deepEqual(rotary.candidates.map((c) => c.ref), ['venue:1', 'venue:2']);
  assert.equal(lower.status, 'missing', 'names match exactly, as saved');
  assert.equal(retired.status, 'missing', 'a retired duplicate is not offered as a candidate');
  assert.equal(event.status, 'resolved');
  assert.equal(event.candidates[0].kind, 'event');
});

test('Stage 4.3 reconcile: redirected venue ids become the canonical id; nothing distinct is dropped; missing items stay', () => {
  const sidecar = { v: 1, items: [
    { k: 'venue', id: 3, name: 'Old Duplicate Winery' },
    { k: 'venue', id: 999, name: 'Gone' },
    { k: 'event', id: 10, occ: 100, name: 'Harvest Long Table' },
    { k: 'venue', id: 7, name: 'Solo Cafe' },
  ] };
  const resolved = resolve({ items: sidecar.items.map(S.formatRef) }).items;
  const { sidecar: out, changed } = S.reconcileSidecar(sidecar, resolved);
  assert.equal(changed, true);
  assert.deepEqual(out.items, [
    { k: 'venue', id: 4, name: 'Old Duplicate Winery', redirectedFrom: 3 },
    { k: 'venue', id: 999, name: 'Gone' },
    { k: 'event', id: 10, occ: 100, name: 'Harvest Long Table' },
    { k: 'venue', id: 7, name: 'Solo Cafe' },
  ]);
  assert.deepEqual(sidecar.items[0], { k: 'venue', id: 3, name: 'Old Duplicate Winery' }, 'input not mutated');
  // The canonical venue was already saved: the two merge into one saved venue.
  const merged = S.reconcileSidecar({ v: 1, items: [{ k: 'venue', id: 4, name: 'Canonical Winery' }, { k: 'venue', id: 3, name: 'Old Duplicate Winery' }] }, resolve({ items: ['venue:4', 'venue:3'] }).items).sidecar;
  assert.deepEqual(merged.items, [{ k: 'venue', id: 4, name: 'Canonical Winery' }]);
  // Nothing to rewrite: unchanged.
  const same = S.reconcileSidecar({ v: 1, items: [{ k: 'venue', id: 7 }] }, resolve({ items: ['venue:7'] }).items);
  assert.equal(same.changed, false);
  assert.deepEqual(S.reconcileSidecar(null, []).sidecar, { v: 1, items: [] });
});
