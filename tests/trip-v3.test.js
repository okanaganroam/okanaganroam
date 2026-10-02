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
  assert.deepEqual(v3.t3QueryToState(qs, ['penticton', 'kelowna']), { text: s.text, seed: 4, overrides: s.overrides, locks: { '1-morning': 12 }, exclude: [7, 8], pinned: null, avoid: [], removed: [], invalid: false });
  assert.equal(v3.t3QueryToState('', []), null);
  assert.equal(v3.t3QueryToState('?seed=3', []), null, 'no request, no plan');
  const junk = v3.t3QueryToState('?q=hi&seed=-1&days=12&pace=fast&base=seattle&keep=1-morning:abc,2-evening:5&skip=1,x,2', ['kelowna']);
  assert.deepEqual(junk, { text: 'hi', seed: 0, overrides: {}, locks: { '2-evening': 5 }, exclude: [1, 2], pinned: null, avoid: [], removed: [], invalid: true });
  assert.equal(v3.t3QueryToState('?q=' + 'a'.repeat(900), []).text.length, 500);
});

// ---- Stage 5A (F09, 2026-10-01): the link replays the request behind the plan on screen ----

// What the V3 page sends for a request, and what it rebuilds from a link --
// the same rules as renderScript() (request(), syncUrl(), the restore block).
const pageBody = (st, extra) => {
  const body = { text: st.text, seed: st.seed, excludeVenueIds: st.exclude.slice(-200) };
  const ov = {};
  ['days', 'pace', 'baseRegion'].forEach((k) => { if (st.overrides[k] !== undefined) ov[k] = st.overrides[k]; });
  if (Object.keys(ov).length) body.overrides = ov;
  return Object.assign(body, extra);
};
const linkFor = (st, body, removed = {}) => v3.t3StateToQuery({ text: st.text, seed: body.seed, overrides: body.overrides || {}, locks: st.locks, exclude: body.excludeVenueIds, pinned: body.pinned || null, avoid: body.avoidVenueIds || [], removed });
const replayBody = (qs, regions) => {
  const r = v3.t3QueryToState(qs, regions);
  const extra = {};
  if (r.pinned) extra.pinned = r.pinned; else if (Object.keys(r.locks).length) extra.pinned = r.locks;
  if (r.avoid.length) extra.avoidVenueIds = r.avoid;
  return pageBody({ text: r.text, seed: r.seed, overrides: r.overrides, exclude: r.exclude }, extra);
};
const planFor = (body) => {
  const intent = d.interpretDiscoveryQuery(body.text, T);
  if (body.overrides && body.overrides.days) intent.days = body.overrides.days;
  if (body.overrides && body.overrides.pace) intent.pace = body.overrides.pace;
  return tp.planTrip({ intent, facts: FACTS, labels: LABELS, seed: body.seed, excludeIds: body.excludeVenueIds, avoidIds: body.avoidVenueIds || [], pinned: body.pinned || null, clock: { weekday: 'tue', minutes: 720 } });
};
const slotIds = (p) => (p.days || []).map((x) => x.stops.map((s) => x.day + '-' + s.daypart + ':' + (s.venue ? s.venue.id : '-')).join(' ')).join(' | ');
const pinsOf = (p, except) => { const o = {}; (p.days || []).forEach((x) => x.stops.forEach((s) => { const k = x.day + '-' + s.daypart; if (s.venue && k !== except) o[k] = s.venue.id; })); return o; };

test('Stage 5A F09: after Swap, Regenerate and Regenerate day the recipient gets the identical request -- and the identical plan', () => {
  const text = 'Plan me a 3-day September trip with wine, great food and golf, with one relaxed day by the lake';
  const st = { text, seed: 0, overrides: {}, locks: {}, exclude: [] };
  // 1. first plan
  let body = pageBody(st, {});
  let shown = planFor(body);
  assert.ok(shown.days.length === 3 && stops(shown).length >= 9, 'a real 3-day plan');
  const check = (label, removed) => {
    const qs = linkFor(st, body, removed);
    assert.deepEqual(replayBody(qs, []), body, `${label}: the link rebuilds the exact request`);
    assert.equal(slotIds(planFor(replayBody(qs, []))), slotIds(shown), `${label}: the recipient's plan is the sender's`);
    assert.equal(v3.t3StateToQuery(Object.assign(v3.t3QueryToState(qs, []), { locks: v3.t3QueryToState(qs, []).locks, removed: Object.fromEntries(v3.t3QueryToState(qs, []).removed.map((k) => [k, 1])) })), qs, `${label}: re-encoding a decoded link gives the same link`);
    return qs;
  };
  check('initial');
  // 2. Keep one stop, then Swap another (pins every other stop, skips the swapped one)
  const keepKey = Object.keys(pinsOf(shown))[0];
  st.locks[keepKey] = pinsOf(shown)[keepKey];
  const swapKey = Object.keys(pinsOf(shown))[2];
  st.exclude.push(pinsOf(shown)[swapKey]);
  body = pageBody(st, { pinned: pinsOf(shown, swapKey) });
  const before = slotIds(shown);
  shown = planFor(body);
  assert.notEqual(slotIds(shown), before, 'the swap changed the plan');
  check('after swap');
  // 3. Regenerate the whole plan (seed + 1, avoid what was shown except kept stops)
  st.seed += 1;
  const kept = Object.values(st.locks);
  body = pageBody(st, { pinned: Object.assign({}, st.locks), avoidVenueIds: stops(shown).map((s) => s.venue.id).filter((x) => !kept.includes(x)) });
  shown = planFor(body);
  check('after regenerate');
  // 4. Regenerate day 2 (pins the other days, avoids day 2's stops)
  const pins = pinsOf(shown);
  Object.keys(pins).forEach((k) => { if (k[0] === '2' && st.locks[k] !== pins[k]) delete pins[k]; });
  st.seed += 1;
  body = pageBody(st, { pinned: pins, avoidVenueIds: shown.days[1].stops.filter((s) => s.venue).map((s) => s.venue.id) });
  shown = planFor(body);
  check('after regenerate day');
  // 5. A removed stop travels as its slot key (rm=), never as a name.
  const rmKey = Object.keys(pinsOf(shown)).slice(-1)[0];
  const qs = check('with a removed stop', { [rmKey]: 1 });
  assert.deepEqual(v3.t3QueryToState(qs, []).removed, [rmKey]);
});

test('Stage 5A F09: Swap on every stop of a plan -- the link always reproduces it; the pre-5A link (no pin) does not', () => {
  let legacyMisses = 0, swaps = 0;
  for (const text of ['Plan me a 3-day September trip with wine, great food and golf, with one relaxed day by the lake', '2 days in Penticton with the kids — beaches, parks and easy food', 'Coffee, a hike, a winery and dinner in Kelowna']) {
    const st0 = { text, seed: 0, overrides: {}, locks: {}, exclude: [] };
    const first = planFor(pageBody(st0, {}));
    for (const key of Object.keys(pinsOf(first))) {
      const st = { text, seed: 0, overrides: {}, locks: {}, exclude: [pinsOf(first)[key]] };
      const body = pageBody(st, { pinned: pinsOf(first, key) });
      const shown = planFor(body);
      const qs = linkFor(st, body);
      assert.equal(slotIds(planFor(replayBody(qs, []))), slotIds(shown), `${text} / swap ${key}`);
      if (slotIds(planFor(replayBody(qs.replace(/&pin=[^&]*/, ''), []))) !== slotIds(shown)) legacyMisses += 1;
      swaps += 1;
    }
  }
  assert.ok(swaps >= 10, `${swaps} swaps checked`);
  assert.ok(legacyMisses > 0, `the F09 defect is real: ${legacyMisses} of ${swaps} swaps were not reproduced by a pre-5A link`);
});

test('Stage 5A F09: a link holds only the request text, settings, slot keys and venue ids -- never a name or a fact', () => {
  const st = { text: 'A romantic weekend in Naramata with wineries and a great dinner', seed: 2, overrides: { pace: 'relaxed' }, locks: {}, exclude: [] };
  const body = pageBody(st, {});
  const shown = planFor(body);
  const qs = linkFor(st, Object.assign({}, body, { pinned: pinsOf(shown) }), {});
  const params = qs.slice(1).split('&').map((x) => x.split('=')[0]);
  assert.deepEqual(params, ['q', 'seed', 'pace', 'pin']);
  const rest = qs.replace(/^\?q=[^&]*/, '');
  for (const s of stops(shown)) assert.ok(!rest.includes(encodeURIComponent(s.venue.name)) && !rest.includes(s.venue.name), `no venue name (${s.venue.name})`);
  assert.match(decodeURIComponent(rest), /^&seed=2&pace=relaxed&pin=([1-7]-(morning|midday|afternoon|evening):\d+,?)+$/);
});

test('Stage 5A F09: keys are written in day / daypart order, so the same state is always the same link', () => {
  const a = v3.t3StateToQuery({ text: 'x', pinned: { '2-evening': 5, '1-midday': 4, '1-morning': 3 }, locks: { '2-morning': 9, '1-evening': 8 }, removed: { '3-afternoon': 1, '1-morning': 1 } });
  const b = v3.t3StateToQuery({ text: 'x', pinned: { '1-morning': 3, '2-evening': 5, '1-midday': 4 }, locks: { '1-evening': 8, '2-morning': 9 }, removed: { '1-morning': 1, '3-afternoon': 1 } });
  assert.equal(a, b);
  assert.equal(decodeURIComponent(a), '?q=x&keep=1-evening:8,2-morning:9&pin=1-morning:3,1-midday:4,2-evening:5&rm=1-morning,3-afternoon');
});

test('Stage 5A F09: malformed links fail safe -- bad parts are dropped and flagged, never guessed; no request text means no plan', () => {
  const R = (qs) => v3.t3QueryToState(qs, ['kelowna']);
  assert.equal(R('?pin=1-morning:5&rm=1-morning'), null, 'no q: a plain /trip');
  assert.equal(R('?q=%20%20'), null);
  assert.doesNotThrow(() => R('?q=hi&pin=%E0%A4%A'));
  assert.equal(R('?q=hi&pin=%E0%A4%A').invalid, true, 'a broken escape is flagged, not thrown');
  assert.equal(R('?q=hi&seed=1000001').seed, 0, 'seed above the server limit is dropped');
  assert.equal(R('?q=hi&seed=1000001').invalid, true);
  assert.equal(R('?q=hi&seed=1000000').seed, 1000000);
  const bad = R('?q=hi&pin=1-morning:0,2-noon:5,1-evening:7&avoid=0,3,-1&skip=4,abc&rm=1-evening,9-morning&keep=1-midday:x');
  assert.deepEqual(bad.pinned, { '1-evening': 7 }, 'zero ids and unknown slots dropped');
  assert.deepEqual(bad.avoid, [3]);
  assert.deepEqual(bad.exclude, [4]);
  assert.deepEqual(bad.removed, ['1-evening']);
  assert.deepEqual(bad.locks, {});
  assert.equal(bad.invalid, true);
  const clean = R('?q=hi&pin=1-evening:7&avoid=3&skip=4&rm=1-evening');
  assert.equal(clean.invalid, false);
  assert.equal(R('?q=hi&pin=').pinned, null, 'an empty pin is no pin');
  // Bounds the API enforces: at most 28 pins, at most 200 ids per list.
  const many = Array.from({ length: 7 }, (_, i) => ['morning', 'midday', 'afternoon', 'evening'].map((p, j) => `${i + 1}-${p}:${i * 4 + j + 1}`)).flat();
  assert.equal(Object.keys(R('?q=hi&pin=' + many.join(',')).pinned).length, 28);
  assert.equal(R('?q=hi&pin=' + many.join(',')).invalid, false);
  const ids = Array.from({ length: 250 }, (_, i) => i + 1).join(',');
  assert.equal(R('?q=hi&avoid=' + ids).avoid.length, 200);
  assert.equal(R('?q=hi&avoid=' + ids).invalid, true);
  assert.deepEqual(R('?q=hi&skip=' + ids).exclude.slice(0, 2), [51, 52], 'skip keeps the most recent 200, as the page sends');
});

test('Stage 5A F09: the largest realistic link (7 days x 4 stops, 200 skipped, 200 avoided, every stop kept or removed) stays a few KB', () => {
  const pinned = {}; const locks = {}; const removed = {};
  for (let day = 1; day <= 7; day++) ['morning', 'midday', 'afternoon', 'evening'].forEach((p, j) => { pinned[`${day}-${p}`] = 100000 + day * 10 + j; if (j % 2) locks[`${day}-${p}`] = pinned[`${day}-${p}`]; else removed[`${day}-${p}`] = 1; });
  const ids = Array.from({ length: 200 }, (_, i) => 100000 + i);
  const qs = v3.t3StateToQuery({ text: 'x'.repeat(500), seed: 1000000, overrides: { days: 7, pace: 'packed', baseRegion: 'kelowna' }, locks, exclude: ids, pinned, avoid: ids, removed });
  const url = 'https://okanaganroam.com/trip' + qs;
  assert.ok(url.length < 8000, `link length ${url.length}`);
  const back = v3.t3QueryToState(qs, ['kelowna']);
  assert.equal(back.invalid, false);
  assert.equal(Object.keys(back.pinned).length, 28);
  assert.equal(back.exclude.length, 200);
  assert.equal(back.avoid.length, 200);
  assert.equal(back.removed.length, 14);
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

// Stage 5C (2026-10-01): the Trip tray identifies stops by ref. In V3 that only
// adds data-trip-ref to the stop buttons, counts one stop per ref, and removes
// the obsolete same-name notice -- the share link (Stage 5A) is unchanged.
test('Stage 5C: V3 same-name notice removed; stop buttons carry refs; the Stage 5A share link is byte-for-byte unchanged', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(!src.includes('t3-samename') && !src.includes('My Trip lists places by name'), 'no same-name notice or its style');
  assert.ok(src.includes(`(v.id ? ' data-trip-ref="venue:' + esc(v.id) + '"' : '')`) && src.includes(`(e.id ? ' data-trip-ref="event:' + esc(e.id) + '"' : '')`));
  assert.ok(src.includes("var n = b.getAttribute('data-trip-ref') || b.getAttribute('data-trip-name');"), 'Add whole trip / Add day: one stop per ref');
  // A fixed state -> the same link as before (keep / skip / pin / avoid / rm, order and encoding).
  const qs = v3.t3StateToQuery({ text: 'Plan 2 days in Kelowna', seed: 3, overrides: { days: 2, pace: 'relaxed' }, locks: { '2-morning': 9, '1-evening': 8 }, exclude: [4, 5], pinned: { '1-morning': 3, '1-midday': 4 }, avoid: [7], removed: { '2-evening': 1 } });
  assert.equal(qs, '?q=Plan%202%20days%20in%20Kelowna&seed=3&days=2&pace=relaxed&keep=1-evening%3A8%2C2-morning%3A9&skip=4%2C5&pin=1-morning%3A3%2C1-midday%3A4&avoid=7&rm=2-evening');
  assert.deepEqual(v3.t3QueryToState(qs, ['kelowna']), { text: 'Plan 2 days in Kelowna', seed: 3, overrides: { days: 2, pace: 'relaxed' }, locks: { '1-evening': 8, '2-morning': 9 }, exclude: [4, 5], pinned: { '1-morning': 3, '1-midday': 4 }, avoid: [7], removed: ['2-evening'], invalid: false });
});

// Stage 5G (2026-10-02): the whole-trip map's points -- per day, in plan
// order, numbered among each day's shown stops; only stored locations inside
// the Okanagan box; removed stops and empty slots neither numbered nor counted.
const shownStops = (d) => d.stops.filter((s) => s.venue || (s.kind === 'event' && s.event));
test('Stage 5G map: one-day, multi-day and multi-region plans -- every point is a shown stop, in day order, with its stored coordinates', () => {
  const cases = [
    ['A day in Penticton with a winery and lunch', 'day_plan', 1],
    ['Plan me a 2-day trip in Kelowna with wineries and restaurants', 'multi_day', 2],
    ['3 days: Kelowna, Penticton and Osoyoos with wineries', 'multi_day', 3],
    ['A packed 4 day trip around the whole Okanagan', 'multi_day', 4],
  ];
  for (const [text, kind, dayCount] of cases) {
    const p = plan(text);
    assert.equal(p.kind, kind, text);
    assert.equal(p.days.length, dayCount, text);
    const m = v3.t3MapPoints(p.days, {});
    const shown = p.days.reduce((n, d) => n + shownStops(d).length, 0);
    assert.equal(m.count + m.skipped, shown, `${text}: every shown stop is either on the map or counted as not on it`);
    assert.ok(m.count > 0, text);
    assert.deepEqual(m.days.map((d) => d.day), p.days.filter((d) => m.days.some((x) => x.day === d.day)).map((d) => d.day), 'days in plan order');
    for (const md of m.days) {
      const day = p.days.find((d) => d.day === md.day);
      const shownDay = shownStops(day);
      for (const pt of md.points) {
        const s = shownDay[pt.n - 1];
        assert.ok(s && s.venue, `${text}: point ${md.day}/${pt.n} is that day's ${pt.n}th shown stop`);
        assert.equal(pt.key, `${md.day}-${s.daypart}`);
        assert.equal(pt.name, s.venue.name);
        assert.equal(pt.label, s.label);
        const v = BY_ID.get(s.venue.id);
        assert.equal(pt.lat, v.lat); assert.equal(pt.lng, v.lng);
        assert.deepEqual(Object.keys(pt).sort(), ['key', 'label', 'lat', 'lng', 'n', 'name'], 'a point carries nothing else');
      }
      assert.deepEqual(md.points.map((x) => x.n), md.points.map((x) => x.n).slice().sort((a, b) => a - b), 'numbers rise along the day');
    }
  }
  const multi = plan('3 days: Kelowna, Penticton and Osoyoos with wineries');
  assert.deepEqual(multi.days.map((d) => d.region), ['kelowna', 'penticton', 'osoyoos'], 'multi-region: one region a day');
  assert.deepEqual(v3.t3MapPoints(multi.days, {}).days.map((d) => d.day), [1, 2, 3]);
});

test('Stage 5G map: partial coordinates -- stops without a stored location are counted, not placed, and keep their numbers', () => {
  const p = plan('2 days in Vernon with golf, cafes and pubs');
  const m = v3.t3MapPoints(p.days, {});
  const missing = p.days.flatMap(shownStops).filter((s) => !Number.isFinite(BY_ID.get(s.venue.id).lat));
  assert.ok(missing.length > 0, 'this plan has stops without a stored location');
  assert.equal(m.skipped, missing.length);
  for (const md of m.days) {
    const shownDay = shownStops(p.days.find((d) => d.day === md.day));
    for (const pt of md.points) assert.equal(shownDay[pt.n - 1].venue.name, pt.name, 'a number is the stop\'s place in the day, gaps included');
  }
});

test('Stage 5G map: a removed stop leaves the map and the count; Undo (no longer removed) brings it back', () => {
  const p = plan('Plan me a 2-day trip in Kelowna with wineries and restaurants');
  const all = v3.t3MapPoints(p.days, {});
  const target = all.days[0].points[0];
  const removed = { [target.key]: 123 };
  const less = v3.t3MapPoints(p.days, removed);
  assert.equal(less.count, all.count - 1);
  assert.equal(less.skipped, all.skipped);
  assert.ok(!less.days.flatMap((d) => d.points).some((x) => x.key === target.key));
  assert.deepEqual(less.days[0].points.map((x) => x.n), all.days[0].points.slice(1).map((x) => x.n - 1), 'the day renumbers from 1');
  assert.deepEqual(v3.t3MapPoints(p.days, {}), all, 'undo: the same points as before');
});

test('Stage 5G map: no locations, bad locations, events, empty slots, shared locations and the largest plan', () => {
  const at = (lat, lng, name = 'P') => ({ name, latitude: lat, longitude: lng });
  const day = (n, stops) => ({ day: n, stops });
  // No stored locations at all: nothing to map, every stop counted.
  const none = v3.t3MapPoints([day(1, [{ daypart: 'morning', label: 'Morning', venue: at(null, null) }, { daypart: 'evening', label: 'Evening', venue: { name: 'Q' } }])], {});
  assert.deepEqual(none, { days: [], count: 0, skipped: 2 });
  // Bad values are "no location": NaN, strings, 0/0, outside the Okanagan box.
  const bad = [at(NaN, -119.5), at('49.8', -119.5), at(0, 0), at(49.8, 119.5), at(53.5, -119.5), at(49.8, Infinity)];
  assert.deepEqual(v3.t3MapPoints([day(1, bad.map((v, i) => ({ daypart: 'd' + i, label: 'x', venue: v })))], {}), { days: [], count: 0, skipped: 6 });
  // Events have no stored location: shown, numbered, counted, never placed. Empty slots are not stops.
  const mixed = v3.t3MapPoints([day(1, [
    { daypart: 'morning', label: 'Morning', venue: null },
    { daypart: 'afternoon', label: 'Hockey game', kind: 'event', event: { name: 'Game' } },
    { daypart: 'evening', label: 'Evening', venue: at(49.88, -119.49, 'Dinner') },
  ])], {});
  assert.deepEqual(mixed, { days: [{ day: 1, points: [{ n: 2, key: '1-evening', label: 'Evening', name: 'Dinner', lat: 49.88, lng: -119.49 }] }], count: 1, skipped: 1 });
  // Two places at the same stored location are two points.
  const twin = v3.t3MapPoints([day(1, [{ daypart: 'morning', label: 'M', venue: at(49.5, -119.6, 'A') }, { daypart: 'midday', label: 'L', venue: at(49.5, -119.6, 'B') }])], {});
  assert.deepEqual(twin.days[0].points.map((x) => x.name), ['A', 'B']);
  // 7 days x 4 stops: 28 points, 4 a day, numbered 1-4.
  const PARTS = ['morning', 'midday', 'afternoon', 'evening'];
  const big = v3.t3MapPoints(Array.from({ length: 7 }, (_, i) => day(i + 1, PARTS.map((dp, j) => ({ daypart: dp, label: dp, venue: at(49 + i * 0.2, -119.9 + j * 0.1) })))), {});
  assert.equal(big.count, 28);
  assert.ok(big.days.every((d) => d.points.map((x) => x.n).join() === '1,2,3,4'));
  // Nothing to read: no days.
  assert.deepEqual(v3.t3MapPoints(undefined, undefined), { days: [], count: 0, skipped: 0 });
});
