// Build My Trip Step 1 (2026-09-29): one test per accuracy fix in
// discovery-intent.js (B1) and trip-planner.js (B2). PURE: the real taxonomy,
// labels and venue facts from tests/fixtures/trip-golden-inputs.json.gz; no
// server, no database. Advisory rules use copies of real facts with a
// synthetic advisory note (no advisory was public when the snapshot was taken).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');

const INPUTS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'trip-golden-inputs.json.gz'))).toString('utf8'));
const { facts: FACTS, taxonomy: T, labels: LABELS } = INPUTS;
const I = (text) => d.interpretDiscoveryQuery(text, T);
const CLOCK = { weekday: 'tue', minutes: 720 };
const plan = (text, facts = FACTS) => tp.planTrip({ intent: I(text), facts, labels: LABELS, seed: 0, clock: CLOCK });
const stops = (p) => [...(p.days || []).flatMap((x) => x.stops), ...(p.outing ? p.outing.stops : []), ...(p.recommendations || [])].filter((s) => s.venue);

// ---------- B1: parser ----------
test('B1 contractions: "we\'d" is never Wednesday; names with apostrophes normalize exactly as before', () => {
  assert.equal(d.normalizeDiscoveryText("we'd like one relaxed day"), 'we would like one relaxed day');
  assert.equal(d.normalizeDiscoveryText("we're, I'm, they'll, you've, don't, can't, won't"), 'we are i am they will you have do not can not will not');
  assert.equal(d.normalizeDiscoveryText("Bless'd Sips & Slices"), 'blessd sips and slices');
  assert.equal(d.normalizeDiscoveryText("Press'd Sandwich Shop"), 'pressd sandwich shop');
  assert.equal(d.normalizeDiscoveryText("O'Flannigan's Pub"), 'oflannigans pub');
  const i = I("We'd love a wine day in Oliver");
  assert.equal(i.when, null, 'no weekday from "we\'d"');
  assert.ok(!i.textTerms.includes('wed'));
  assert.ok(I('dinner on wednesday in Penticton').when, 'a real weekday still counts');
});

test('B1 length: an explicit N-day trip wins over "one ... day", which becomes a day theme', () => {
  const u1 = I("Plan me a 3-day trip to the Okanagan in September. We love wine, good food and golf, and we'd like one relaxed day with a nice lake experience.");
  assert.equal(u1.days, 3);
  assert.equal(u1.pace, null, 'the relaxed pace belongs to one day, not the trip');
  assert.equal(u1.dayThemes.length, 1);
  assert.equal(u1.dayThemes[0].pace, 'relaxed');
  assert.equal(u1.dayThemes[0].lake, true);
  const two = I('Three days in Kelowna, one day of golf and one day of wineries');
  assert.equal(two.days, 3);
  assert.deepEqual(two.dayThemes.map((t) => t.scopedTypes), [['golf'], ['winery']]);
  assert.equal(I('plan 2 days, one of them on the lake').dayThemes[0].lake, true);
  const single = I('one day in Vernon');
  assert.equal(single.days, 1);
  assert.deepEqual(single.dayThemes, [], 'a lone one-day trip is not a theme');
  assert.equal(I('Plan a 3 day trip with wine').days, 3);
});

test('B1 months and seasons: understood for trip planning; still "not applied" for search, exactly as before', () => {
  const p = I('Plan 2 days in Kelowna in January');
  assert.equal(p.month, 1);
  assert.equal(p.season, 'winter');
  assert.deepEqual(p.unsupported, []);
  assert.equal(I('Plan a trip in October').month, 10);
  assert.equal(I('off season trip to Kelowna').season, 'off');
  assert.equal(I('fall wine weekend in Naramata').season, 'fall');
  // Search requests: identical to the previous reading.
  const f = I('things to do in December in Kelowna');
  assert.equal(f.mode, 'find');
  assert.deepEqual(f.unsupported, ['december']);
  assert.equal(f.month, null);
  const may = I('wine tour in May');
  assert.deepEqual(may.unsupported, [], '"may" was never unsupported');
  assert.equal(may.month, null);
  assert.deepEqual(I('festivals in September').unsupported, ['september'], 'events still report the month as not applied');
});

test('B1 occasions: "a couple of" is an amount; romantic wins over adults', () => {
  assert.equal(I('Plan a romantic weekend for two with wineries, great restaurants and a couple of hidden gems.').occasion, 'romantic');
  assert.equal(I('a romantic trip, just the two of us').occasion, 'romantic');
  assert.equal(I("we're a couple who likes craft beer").occasion, 'adults', 'a couple is still the adults occasion');
  assert.deepEqual(I('a couple of wineries in Oliver').collections, []);
  assert.equal(I('a couple of wineries in Oliver').occasion, null);
});

test('B1 lake and filler words: lake time for plans, search words for search; filler never becomes a search', () => {
  const p = I('We have 3 days and want one day on the water');
  assert.equal(p.days, 3);
  assert.ok(!p.foodTerms.some((x) => ['have', 'water'].includes(x.term)));
  assert.equal(I('plan a lake day and dinner, 2 days').mode, 'plan');
  assert.equal(I('Plan 2 days in Penticton by the lake').lake, true);
  assert.deepEqual(I('nice lake experience').textTerms, ['lake'], 'a search keeps "lake" as the visitor\'s word');
  for (const w of ['explore', 'coming', 'them', 'have', 'experience']) assert.ok(!I(`Plan 2 days in Vernon, ${w}`).foodTerms.some((x) => x.term === w), w);
  assert.equal(I('somewhere fun to explore').mode, 'find', 'wanting to explore is wanting things to do');
  assert.ok(I("can't miss wineries in Naramata").superlative);
});

test('B1 comma lists: each part is its own component; unused words are reported', () => {
  const text = 'Coffee, a beach afternoon, a winery and a nice dinner in Summerland';
  const trip = d.interpretTripComponents(text, T, I(text));
  assert.equal(trip.multi, true);
  assert.deepEqual(trip.components.map((c) => c.types), [['cafe'], ['beach'], ['winery'], ['restaurant']]);
  const walk = d.interpretTripComponents('brewery, pizza and a lake walk in Vernon', T);
  assert.deepEqual(walk.leftoverTerms, ['lake', 'walk']);
  assert.deepEqual(d.interpretTripComponents('rotary beach park oliver and a winery', T).components.length, 2, 'a multi-word place is still one part');
});

test('B1 validator: a month/season needs its words in the text; themes and lake time are deterministic only', () => {
  const ok = d.validateDiscoveryIntent({ mode: 'plan', month: 9, season: 'fall' }, T, 'a trip in September');
  assert.equal(ok.intent.month, 9);
  assert.equal(ok.intent.season, 'fall');
  const no = d.validateDiscoveryIntent({ mode: 'plan', month: 7, season: 'winter', dayThemes: [{ pace: 'relaxed' }], lake: true }, T, 'a trip in September');
  assert.equal(no.intent.month, null);
  assert.equal(no.intent.season, null);
  assert.deepEqual(no.intent.dayThemes, []);
  assert.equal(no.intent.lake, false);
  assert.deepEqual(no.rejected.map((r) => r.field).sort(), ['dayThemes', 'lake', 'month', 'season']);
});

// ---------- B2: planner ----------
test('B2 advisories: a closed/evacuation advisory takes a place out of day plans; any other advisory is quoted on the stop', () => {
  const base = plan('Plan a 2-day golf trip around Kelowna');
  const firstGolf = stops(base).find((s) => s.venue.type === 'golf');
  const closed = FACTS.map((v) => (v.id === firstGolf.venue.id ? { ...v, advisory: { note: 'Temporarily closed for renovations. Reopens in spring.', addedAt: '2026-09-01' } } : v));
  assert.ok(!stops(plan('Plan a 2-day golf trip around Kelowna', closed)).some((s) => s.venue.id === firstGolf.venue.id));
  const note = FACTS.map((v) => (v.id === firstGolf.venue.id ? { ...v, advisory: { note: 'Cart path only after heavy rain. Call ahead.', addedAt: '2026-09-01' } } : v));
  const kept = stops(plan('Plan a 2-day golf trip around Kelowna', note)).find((s) => s.venue.id === firstGolf.venue.id);
  assert.ok(kept, 'a non-closing advisory does not remove the place');
  assert.ok(kept.caveats.includes('Advisory on Okanagan Roam: Cart path only after heavy rain.'));
});

test('B2 occasions: a romantic trip leaves golf and pubs out unless asked, and ends each day at dinner or a lounge', () => {
  const p = plan('Plan a romantic weekend in Kelowna');
  assert.ok(!stops(p).some((s) => ['golf', 'pub'].includes(s.venue.type)));
  for (const x of p.days) assert.ok(['restaurant', 'cocktail'].includes(x.stops.find((s) => s.daypart === 'evening').venue.type));
  assert.ok(stops(plan('Plan a romantic golf weekend in Kelowna')).some((s) => s.venue.type === 'golf'), 'asked-for golf stays');
  // Approved behaviour kept: a date-night outing may still start at a pub.
  const dn = plan('Find me a great date night in Kelowna');
  assert.ok(!stops(dn).some((s) => s.venue.type === 'golf'));
});

test('B2 seasons: named months drive the existing soft seasonal rules and two honest notes; nothing is left out for the season alone', () => {
  const jan = plan('Plan a 2-day golf trip around Kelowna in January');
  const golf = stops(jan).filter((s) => s.venue.type === 'golf');
  assert.ok(golf.length >= 1, 'golf is still planned when asked for');
  for (const s of golf) if (!FACTS.find((v) => v.id === s.venue.id).indoorGolf) assert.ok(s.caveats.some((c) => /seasonal — check the course is open in January/.test(c)) || s.reasons.some((r) => /published/.test(r.text)));
  assert.ok(jan.notes.some((n) => n.startsWith('Planned for January')));
  assert.ok(jan.notes.some((n) => /current listed hours on Okanagan Roam and can change by season/.test(n)));
  assert.deepEqual(jan.overview.season, { label: 'January', named: 'month' });
  assert.ok(!plan('Plan a 2-day golf trip around Kelowna').notes.some((n) => /Planned for/.test(n)), 'no season, no season note');
});

test('B2 day themes: themed days go last; a relaxed day has no golf; a theme nothing can meet is reported', () => {
  const p = plan('Plan a 3 day golf trip to Kelowna with one relaxed day');
  assert.equal(p.days.length, 3);
  assert.ok(p.days[2].theme && p.days[2].theme.pace === 'relaxed');
  assert.ok(!p.days[2].stops.some((s) => s.venue && s.venue.type === 'golf'));
  assert.ok(p.notes.includes('Day 3 is planned around your relaxed day.'));
  const noLake = FACTS.map((v) => ({ ...v, features: { ...v.features, lake_view: false }, activities: (v.activities || []).filter((a) => a !== 'water') })).filter((v) => v.type !== 'beach');
  const q = plan('plan 2 days in Kelowna, one of them on the lake', noLake);
  assert.ok(q.warnings.some((w) => /No stop matching your lake time was found for day 2/.test(w)));
  assert.equal(q.days[1].theme.met, false);
});
