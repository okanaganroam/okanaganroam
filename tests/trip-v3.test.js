// Build My Trip V3 (Step 2, 2026-09-29): the page module's pure helpers and
// the planner's additive V3 output (stored facts on stops, "understood").
// PURE: no server, no database; the real production-snapshot inputs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');
const v3 = require('../trip-planner-v3-page.js');

const INPUTS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'trip-golden-inputs.json.gz'))).toString('utf8'));
const { facts: FACTS, taxonomy: T, labels: LABELS } = INPUTS;
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));
const plan = (text) => tp.planTrip({ intent: d.interpretDiscoveryQuery(text, T), facts: FACTS, labels: LABELS, seed: 0, clock: { weekday: 'tue', minutes: 720 } });
const stops = (p) => (p.days || []).flatMap((x) => x.stops).filter((s) => s.venue);

test('V3 helpers: straight-line distance only from two stored coordinates, worded as straight line', () => {
  assert.equal(v3.t3Km({ latitude: 49.88, longitude: -119.49 }, { latitude: null, longitude: -119.5 }), null);
  assert.equal(v3.t3Km({ latitude: 49.88 }, { latitude: 49.9, longitude: -119.5 }), null);
  const km = v3.t3Km({ latitude: 49.8880, longitude: -119.4960 }, { latitude: 49.4991, longitude: -119.5937 });
  assert.ok(km > 43 && km < 44, `Kelowna to Penticton about 43.7 km, got ${km}`);
  assert.equal(v3.t3KmText(0.4), 'Under 1 km apart (straight line)');
  assert.equal(v3.t3KmText(3.456), 'About 3.5 km (straight line)');
  assert.equal(v3.t3KmText(43.7), 'About 44 km (straight line)');
  assert.equal(v3.t3KmText(null), null);
});

test('V3 helpers: a shared link carries only the request, seed, edits, kept and skipped stops -- and rejects anything else', () => {
  const s = { text: 'Plan 3 days in Kelowna & wine', seed: 4, overrides: { days: 3, pace: 'relaxed', baseRegion: 'penticton' }, locks: { '1-morning': 12, '9-night': 5 }, exclude: [7, 8] };
  const qs = v3.t3StateToQuery(s);
  assert.ok(!qs.includes('9-night'), 'invalid lock keys are not written');
  assert.deepEqual(v3.t3QueryToState(qs, ['penticton', 'kelowna']), { text: s.text, seed: 4, overrides: s.overrides, locks: { '1-morning': 12 }, exclude: [7, 8] });
  assert.equal(v3.t3QueryToState('', []), null);
  assert.equal(v3.t3QueryToState('?seed=3', []), null, 'no request, no plan');
  const junk = v3.t3QueryToState('?q=hi&seed=-1&days=12&pace=fast&base=seattle&keep=1-morning:abc,2-evening:5&skip=1,x,2', ['kelowna']);
  assert.deepEqual(junk, { text: 'hi', seed: 0, overrides: {}, locks: { '2-evening': 5 }, exclude: [1, 2] });
  assert.equal(v3.t3QueryToState('?q=' + 'a'.repeat(900), []).text.length, 500);
});

test('V3 helpers: "Map this day" uses the stops\' own stored name + address, in order', () => {
  assert.equal(v3.t3MapsUrl([]), null);
  assert.equal(v3.t3MapsUrl(['A, 1 Main St']), 'https://www.google.com/maps/search/?api=1&query=A%2C%201%20Main%20St');
  const u = v3.t3MapsUrl(['A', 'B', 'C']);
  assert.ok(u.startsWith('https://www.google.com/maps/dir/?api=1&origin=A&destination=C&waypoints=B'));
});

test('V3 planner output: badges, collections and listed hours on a stop are the stored ones, never more', () => {
  for (const text of ['Plan a 2-day golf trip around Kelowna', 'Plan 3 days in Penticton with kids', 'A dog-friendly weekend in Vernon with my dog', 'Wine and food weekend in Naramata and Penticton']) {
    for (const s of stops(plan(text))) {
      const v = BY_ID.get(s.venue.id);
      for (const b of s.venue.badges) assert.ok(v.features[b.key], `${v.name}: ${b.key}`);
      if (['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'].includes(v.type)) {
        assert.deepEqual(s.venue.badges.map((b) => b.key).sort(), Object.keys(v.features).filter((f) => v.features[f]).sort(), `${v.name}: every set badge is shown`);
      } else assert.deepEqual(s.venue.badges, [], `${v.name}: badge columns are not shown on ${v.type}`);
      for (const c of s.venue.collections) {
        assert.ok(v.collections.includes(c.key), `${v.name}: ${c.key}`);
        if (c.key === 'dog_friendly') assert.ok(['beach', 'outdoor', 'golf'].includes(v.type), 'official dog access is only named on outside places');
      }
      if (v.hours) assert.ok(s.venue.listedHours === null || /^Listed hours/.test(s.venue.listedHours));
      else assert.equal(s.venue.listedHours, null, `${v.name}: no hours stored, none shown`);
    }
  }
});

test('V3 "understood": the request in visitor words, no venue named', () => {
  const text = 'Plan me a 3-day September trip with wine, great food and golf, with one relaxed day by the lake';
  const intent = d.interpretDiscoveryQuery(text, T);
  const u = tp.buildUnderstood(intent, d.interpretTripComponents(text, T, intent), LABELS, { kind: 'multi_day', days: 3 });
  assert.equal(u.days, 3);
  assert.equal(u.valleyWide, true);
  assert.deepEqual(u.season, { label: 'September', named: 'month' });
  assert.deepEqual(u.themes, ['relaxed day and lake time']);
  assert.ok(u.interests.includes('wineries') && u.interests.includes('golf courses'));
  assert.deepEqual(u.notUsed, []);
  const names = FACTS.filter((v) => v.name.length >= 8).map((v) => v.name);
  assert.ok(!names.some((n) => JSON.stringify(u).includes(n)), 'no venue name in the understood block');
  const kids = d.interpretDiscoveryQuery('Plan 3 days in Penticton with kids and my dog', T);
  const uk = tp.buildUnderstood(kids, d.interpretTripComponents('Plan 3 days in Penticton with kids and my dog', T, kids), LABELS, {});
  assert.deepEqual(uk.party, ['with kids', 'with a dog']);
  assert.deepEqual(uk.base.map((b) => b.slug), ['penticton']);
  const walk = 'brewery, pizza and a lake walk in Vernon';
  const wi = d.interpretDiscoveryQuery(walk, T);
  assert.deepEqual(tp.buildUnderstood(wi, d.interpretTripComponents(walk, T, wi), LABELS, {}).notUsed, ['lake', 'walk']);
});

test('V3 page: every example chip is a request the planner turns into real stops', () => {
  for (const text of v3.T3_EXAMPLES) {
    const intent = d.interpretDiscoveryQuery(text, T);
    const trip = d.interpretTripComponents(text, T, intent);
    const p = trip.multi ? tp.planTrip({ intent, trip, tripEvents: trip.components.map(() => []), facts: FACTS, labels: LABELS, seed: 0, clock: { weekday: 'tue', minutes: 720 }, tripDate: '2026-09-29' }) : plan(text);
    const all = [...(p.days || []).flatMap((x) => x.stops), ...(p.outing ? p.outing.stops : []), ...(p.itinerary ? p.itinerary.stops : []), ...(p.recommendations || [])].filter((s) => s && s.venue);
    assert.ok(all.length >= 2, `${text}: ${p.kind} with ${all.length} stops`);
    assert.ok(all.every((s) => BY_ID.has(s.venue.id)), text);
  }
});

// ---- V3 image-quality fix (2026-09-29): full-size day headers and hero ----
// Reads a WebP file's pixel size from its header (VP8 / VP8L / VP8X).
function webpSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`unknown WebP chunk ${chunk}`);
}
const IMG = path.join(__dirname, '..', 'public', 'images');

test('V3 images: the full-size day-header photos and hero exist at their native sizes; the homepage images are the same files as before', () => {
  const wide = { kelowna: [1648, 640], 'lake-country': [1648, 640], naramata: [1648, 640], penticton: [1648, 640], vernon: [1648, 640], 'west-kelowna': [1648, 640], oliver: [1376, 768], osoyoos: [928, 521], summerland: [928, 521] };
  for (const [slug, size] of Object.entries(wide)) assert.deepEqual(webpSize(path.join(IMG, 'regions', 'wide', `${slug}.webp`)), size, slug);
  assert.deepEqual(webpSize(path.join(IMG, 'trip-v3', 'hero.webp')), [1600, 656]);
  // Untouched: the homepage's 640px region thumbnails and its trip-cta photo.
  for (const slug of ['kelowna', 'lake-country', 'naramata', 'penticton', 'vernon', 'west-kelowna']) assert.deepEqual(webpSize(path.join(IMG, 'regions', `${slug}.webp`)), [640, 249], `${slug} thumbnail`);
  assert.deepEqual(webpSize(path.join(IMG, 'trip-cta.webp')), [1600, 656]);
  assert.equal(fs.statSync(path.join(IMG, 'trip-cta.webp')).size, 95206, 'trip-cta.webp is the same file');
});

test('V3 images: the page uses the V3 hero; day headers declare srcset widths that match the files', () => {
  const html = v3.renderTripPlannerV3Page({ esc: (s) => String(s), title: 't', description: 'd', canonical: 'https://okanaganroam.com/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  assert.ok(html.includes('<img class="t3-hero-img" src="/images/trip-v3/hero.webp" width="1600" height="656"'));
  assert.doesNotMatch(html, /trip-cta\.webp/, 'the homepage photo file is not used by V3');
  assert.ok(html.includes('object-position: center 40%; opacity: 0.55;'), 'hero crop and darkening unchanged');
  assert.ok(html.includes("srcset=\"' + esc(img.srcset) + '\" sizes=\"(max-width: 640px) calc(100vw - 32px), (max-width: 1180px) calc(100vw - 64px), 1116px\""));
});
