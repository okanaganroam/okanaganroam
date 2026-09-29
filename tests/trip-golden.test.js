// Build My Trip Step 1 (2026-09-29): golden scenarios + the fact guard.
//
// PURE, like tests/trip-planner.test.js: no server.js, no database. The inputs
// are a snapshot of the real production venue facts, taxonomy and labels
// (tests/fixtures/trip-golden-inputs.json.gz -- see its _comment), so every
// scenario is judged on the data visitors actually see. plan() below mirrors
// runTripPlan() in server.js for these requests (no What's On events).
//
// The FACT GUARD checks every stop and every sentence of a plan against the
// stored facts: stop ids, names, regions, types, URLs, ratings, review counts,
// prices, addresses and coordinates must equal the record; any badge,
// collection, rating or listed-hours statement must be true of that venue;
// distances are only claimed between stops with stored coordinates; the
// "What to expect" Lake View count must match; and no other venue's name may
// appear in a plan's text.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');

const INPUTS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'trip-golden-inputs.json.gz'))).toString('utf8'));
const { facts: FACTS, taxonomy: TAXONOMY, labels: LABELS } = INPUTS;
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));
// Tuesday 2026-09-29, 12:00 in the Okanagan -- fixed, so hours/date logic is deterministic.
const CLOCK = { weekday: 'tue', minutes: 12 * 60 };
const TRIP_DATE = '2026-09-29';
const START_FOR = { 'this-weekend': 'sat', today: 'tue' };

function plan(text, seed = 0) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const w = intent.when || {};
  const startWeekday = w.weekday ? w.weekday.slice(0, 3) : (START_FOR[w.preset] || (w.relative === 'tomorrow' ? 'wed' : null));
  const common = { intent, facts: FACTS, labels: LABELS, seed, clock: CLOCK, startWeekday };
  const p = trip.multi
    ? tp.planTrip({ ...common, trip, tripEvents: trip.components.map(() => []), tripDate: TRIP_DATE })
    : tp.planTrip({ ...common, events: null });
  return { intent, p };
}
const dayStops = (p) => (p.days || []).flatMap((x) => x.stops).filter((s) => s.venue);
function allStops(p) {
  return [
    ...(p.days || []).flatMap((x) => x.stops),
    ...(p.outing ? [...p.outing.stops, ...(p.outing.alternates || [])] : []),
    ...(p.itinerary ? [...(p.itinerary.stops || []), ...(p.itinerary.stops || []).flatMap((s) => s.alternates || [])] : []),
    ...(p.recommendations || []),
  ].filter((s) => s && s.venue);
}
const vOf = (s) => BY_ID.get(s.venue.id);

// ---------- the fact guard ----------
const FEATURE_LABELS = LABELS.features || {};
const NAME_INDEX = FACTS.filter((v) => v.name && v.name.length >= 10).map((v) => ({ id: v.id, name: v.name }));
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function storedMinutes(v) {
  const set = new Set();
  let obj = null;
  try { obj = JSON.parse(v.hours || 'null'); } catch (e) { obj = null; }
  if (!obj) return set;
  for (const k of Object.keys(obj)) for (const p of Array.isArray(obj[k]) ? obj[k] : []) for (const t of p || []) { const m = toMin(String(t)); if (m !== null) { set.add(m % 1440); if (m === 1439) set.add(0); } }
  return set;
}
function factGuard(p, label) {
  const problems = [];
  const bad = (msg) => problems.push(`${label}: ${msg}`);
  const planIds = new Set(allStops(p).map((s) => s.venue.id));
  for (const s of allStops(p)) {
    const v = vOf(s);
    if (!v) { bad(`stop id ${s.venue.id} is not a real venue`); continue; }
    const pv = s.venue;
    for (const [k, fk] of [['name', 'name'], ['region', 'region'], ['type', 'type'], ['url', 'url'], ['rating', 'rating'], ['reviews', 'reviews'], ['price', 'price'], ['address', 'address']]) {
      if (JSON.stringify(pv[k] === undefined ? null : pv[k]) !== JSON.stringify(v[fk] === undefined ? null : v[fk])) bad(`${v.name}: ${k} ${JSON.stringify(pv[k])} != stored ${JSON.stringify(v[fk])}`);
    }
    if (pv.latitude != null && (pv.latitude !== v.lat || pv.longitude !== v.lng)) bad(`${v.name}: coordinates differ from the record`);
    // Build My Trip V3 (Step 2): the stored facts a stop card shows.
    for (const b of pv.badges || []) if (!v.features[b.key]) bad(`${v.name}: shows the ${b.label} badge, which is not set`);
    for (const c of pv.collections || []) if (!(v.collections || []).includes(c.key)) bad(`${v.name}: shows ${c.label}, not a member`);
    const texts = [...(s.why || []), ...(s.reasons || []).map((r) => r.text), ...(s.caveats || []), pv.listedHours || ''];
    for (const t of texts) {
      for (const [f, lab] of Object.entries(FEATURE_LABELS)) if (t.includes(`${lab} badge`) && !v.features[f]) bad(`${v.name}: claims the ${lab} badge it does not have ("${t}")`);
      if (/Hidden Gems/.test(t) && !v.collections.includes('hidden_gem')) bad(`${v.name}: claims Hidden Gems ("${t}")`);
      if (/Local Favourites/.test(t) && !v.collections.includes('local_favorite')) bad(`${v.name}: claims Local Favourites ("${t}")`);
      const r = /Rated (\d(?:\.\d)?)(?: from ([\d,]+) reviews)?/.exec(t);
      if (r && (Number(r[1]) !== v.rating || (r[2] && Number(r[2].replace(/,/g, '')) !== v.reviews))) bad(`${v.name}: rating statement "${t}" does not match ${v.rating}/${v.reviews}`);
      if (/km/.test(t) && !/isn.t known/.test(t) && (v.lat == null || v.lng == null)) bad(`${v.name}: claims a distance without stored coordinates ("${t}")`);
      if (/[Ll]isted hours|hours only fit|open until|closes/i.test(t)) {
        const stored = storedMinutes(v);
        for (const m of t.match(/\b\d{1,2}:\d{2}\b/g) || []) if (!stored.has(toMin(m) % 1440)) bad(`${v.name}: hours text "${t}" mentions ${m}, not in its stored hours`);
      }
      for (const n of NAME_INDEX) if (!planIds.has(n.id) && n.name !== v.name && t.includes(n.name) && !planIds.has(n.id)) bad(`${v.name}: text names another venue not in the plan ("${n.name}")`);
    }
  }
  // Whole-plan text: headline, "What to expect", notes, warnings.
  const planTexts = [p.headline || '', p.summary || '', p.experience ? p.experience.text : '', ...(p.notes || []), ...(p.contextNotes || []), ...(p.warnings || [])];
  for (const t of planTexts) for (const n of NAME_INDEX) if (!planIds.has(n.id) && t.includes(n.name)) bad(`plan text names a venue not in the plan ("${n.name}")`);
  if (p.experience && p.experience.text) {
    // "What to expect" describes the plan's own stops: day stops, the outing's
    // stops or the itinerary's stops -- never the "other good options".
    const stops = dayStops(p).length ? dayStops(p)
      : p.outing ? p.outing.stops.filter((s) => s.venue)
        : p.itinerary ? (p.itinerary.stops || []).filter((s) => s.venue) : allStops(p);
    const lakeCount = stops.filter((s) => vOf(s) && vOf(s).features.lake_view).length;
    const words = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const m = /(\w+) of the stops have the Lake View badge/.exec(p.experience.text);
    if (m && (words[m[1].toLowerCase()] || Number(m[1])) !== lakeCount) bad(`"What to expect" says ${m[1]} Lake View stops; the plan has ${lakeCount}`);
    if (/Every stop has the Lake View badge/.test(p.experience.text) && lakeCount !== stops.length) bad('"Every stop has the Lake View badge" is not true');
  }
  return problems;
}
const assertFacts = (p, label) => assert.deepEqual(factGuard(p, label), [], `${label}: fact guard`);
const noNothingMatchingFiller = (p) => (p.warnings || []).filter((w) => /Nothing matching “(wed|have|explore|them|coming|fall|summer|winter|well|cant|miss)”/.test(w));

// ---------- the guard guards ----------
test('fact guard: catches an altered rating, an invented badge, a foreign venue name and a fake stop', () => {
  const { p } = plan('Plan a 2-day golf trip around Kelowna');
  assert.deepEqual(factGuard(p, 'clean'), []);
  const stop = dayStops(p)[0];
  const other = FACTS.find((v) => v.name.length >= 12 && !allStops(p).some((s) => s.venue.id === v.id));
  const tampered = JSON.parse(JSON.stringify(p));
  const ts = dayStops(tampered)[0];
  ts.venue.rating = 1.1;
  const noLake = FACTS.find((v) => v.id === stop.venue.id).features.lake_view ? 'Patio' : 'Lake View';
  ts.why = [...(ts.why || []), `Has the ${noLake} badge`];
  tampered.notes = [...tampered.notes, `Try ${other.name} as well.`];
  dayStops(tampered)[1].venue.id = 99999999;
  const problems = factGuard(tampered, 'tampered');
  assert.ok(problems.some((x) => /rating/.test(x)), 'rating caught');
  assert.ok(problems.some((x) => /is not a real venue/.test(x)), 'fake id caught');
  assert.ok(problems.some((x) => new RegExp(other.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(x)), 'foreign venue name caught');
  if (!FACTS.find((v) => v.id === stop.venue.id).features[noLake === 'Patio' ? 'patio' : 'lake_view']) assert.ok(problems.some((x) => /claims the/.test(x)), 'invented badge caught');
});

// ---------- the three example requests ----------
test('golden U1: "3-day trip ... in September ... wine, good food and golf ... one relaxed day with a nice lake experience"', () => {
  const text = "Plan me a 3-day trip to the Okanagan in September. We love wine, good food and golf, and we'd like one relaxed day with a nice lake experience.";
  const { intent, p } = plan(text);
  assert.equal(intent.days, 3);
  assert.equal(intent.month, 9);
  assert.deepEqual(intent.unsupported, []);
  assert.ok(!intent.foodTerms.some((f) => ['wed', 'lake', 'experience'].includes(f.term)), 'no stray words as searches');
  assert.equal(p.kind, 'multi_day');
  assert.equal(p.days.length, 3);
  assert.deepEqual(p.warnings, []);
  const themed = p.days.filter((x) => x.theme);
  assert.equal(themed.length, 1, 'one themed day');
  assert.equal(themed[0].theme.pace, 'relaxed');
  assert.ok(themed[0].theme.lake && themed[0].theme.met, 'the lake theme is met by a real lake-view, beach or water stop');
  assert.ok(!themed[0].stops.some((s) => s.venue && s.venue.type === 'golf'), 'no round of golf on the relaxed day');
  const types = new Set(dayStops(p).map((s) => s.venue.type));
  for (const t of ['golf', 'winery', 'restaurant']) assert.ok(types.has(t), `the plan includes ${t}`);
  assert.ok(p.notes.some((n) => /^Planned for September/.test(n)) && p.notes.some((n) => /current listed hours .* September/.test(n)));
  assertFacts(p, 'U1');
});

test('golden U2: "2 days with our kids ... outdoor activities, good casual food and somewhere fun to explore"', () => {
  const { intent, p } = plan("We're coming for 2 days with our kids and want outdoor activities, good casual food and somewhere fun to explore.");
  assert.equal(intent.days, 2);
  assert.equal(p.kind, 'multi_day');
  assert.deepEqual(noNothingMatchingFiller(p), []);
  assert.ok(!(p.warnings || []).some((w) => /explore/.test(w)));
  for (const s of dayStops(p)) assert.ok(!['pub', 'cocktail', 'distillery'].includes(s.venue.type), `${s.venue.name} is not a kids-excluded type`);
  assert.ok(dayStops(p).some((s) => ['outdoor', 'beach'].includes(s.venue.type)), 'outdoor stops');
  assertFacts(p, 'U2');
});

test('golden U3: "romantic weekend for two with wineries, great restaurants and a couple of hidden gems"', () => {
  const { intent, p } = plan('Plan a romantic weekend for two with wineries, great restaurants and a couple of hidden gems.');
  assert.equal(intent.occasion, 'romantic', '"a couple of" is an amount, not the adults occasion');
  assert.deepEqual(intent.collections, ['hidden_gem']);
  assert.equal(p.days.length, 2);
  for (const s of dayStops(p)) assert.ok(!['golf', 'pub'].includes(s.venue.type), `${s.venue.name}: no golf or pubs on a romantic trip that did not ask for them`);
  for (const x of p.days) { const ev = x.stops.find((s) => s.daypart === 'evening'); assert.ok(ev && ev.venue && ['restaurant', 'cocktail'].includes(ev.venue.type), `day ${x.day} ends at dinner or a lounge`); }
  assert.ok(dayStops(p).some((s) => s.venue.type === 'winery'));
  assert.ok(dayStops(p).some((s) => vOf(s).collections.includes('hidden_gem')), 'a Hidden Gem is included');
  assertFacts(p, 'U3');
});

// ---------- the ten scenarios ----------
test('golden S1: 2-day golf trip', () => {
  const { p } = plan('Plan a 2-day golf trip around Kelowna');
  assert.equal(p.kind, 'multi_day');
  assert.equal(p.days.length, 2);
  assert.ok(dayStops(p).filter((s) => s.venue.type === 'golf').length >= 1);
  assert.ok(dayStops(p).every((s) => s.venue.region === 'kelowna'));
  assertFacts(p, 'S1');
});

test('golden S2: 3 days with kids', () => {
  const { p } = plan('Plan 3 days in Penticton with kids');
  assert.equal(p.days.length, 3);
  for (const s of dayStops(p)) assert.ok(!['pub', 'cocktail', 'distillery'].includes(s.venue.type));
  assert.ok(dayStops(p).some((s) => ['outdoor', 'beach'].includes(s.venue.type)));
  assertFacts(p, 'S2');
});

test('golden S3: romantic / date night', () => {
  const { p } = plan('Find me a great date night in Kelowna');
  assert.equal(p.kind, 'outing');
  assert.equal(p.outing.stops.filter((s) => s.venue).length, 2);
  assert.ok(p.outing.stops.every((s) => !s.venue || s.venue.region === 'kelowna'));
  assert.ok(!allStops(p).some((s) => s.venue.type === 'golf'));
  assertFacts(p, 'S3');
});

test('golden S4: dog-friendly trip', () => {
  const { p } = plan('Plan a dog-friendly weekend in Vernon with my dog');
  assert.equal(p.days.length, 2);
  for (const s of dayStops(p)) { const v = vOf(s); assert.ok(v.features.dog_friendly || v.collections.includes('dog_friendly'), `${v.name} is listed as dog friendly`); }
  assertFacts(p, 'S4');
});

test('golden S5: off-season trip (January)', () => {
  const { intent, p } = plan('Plan 2 days in Kelowna in January');
  assert.equal(intent.month, 1);
  assert.deepEqual(p.unsupported, []);
  assert.ok(p.notes.some((n) => /^Planned for January/.test(n)));
  for (const s of dayStops(p)) if (s.venue.type === 'golf' && !vOf(s).indoorGolf) assert.ok(s.caveats.some((c) => /seasonal/.test(c)), `${s.venue.name}: outdoor golf in January carries the seasonal caveat`);
  assertFacts(p, 'S5');
  const off = plan('off season trip to Kelowna');
  assert.equal(off.intent.season, 'off');
  assert.ok(off.p.notes.some((n) => /the off-season/.test(n)));
  assertFacts(off.p, 'S5-off');
});

test('golden S6: wine + food weekend', () => {
  const { p } = plan('Wine and food weekend in Naramata and Penticton');
  assert.equal(p.days.length, 2);
  for (const x of p.days) assert.ok(x.stops.some((s) => s.venue && s.venue.type === 'winery'), `day ${x.day} has a winery`);
  assert.ok(dayStops(p).every((s) => ['naramata', 'penticton'].includes(s.venue.region)));
  assertFacts(p, 'S6');
});

test('golden S7: outdoor / adventure trip', () => {
  const { p } = plan('Plan an adventure weekend with hiking and outdoor activities near Kelowna');
  assert.ok(dayStops(p).filter((s) => s.venue.type === 'outdoor').length >= 2);
  assertFacts(p, 'S7');
});

test('golden S8: mixed interests as a comma list', () => {
  const { p } = plan('Coffee, a beach afternoon, a winery and a nice dinner in Summerland');
  assert.equal(p.kind, 'itinerary');
  const types = p.itinerary.stops.filter((s) => s.venue).map((s) => s.venue.type);
  assert.deepEqual(types, ['cafe', 'beach', 'winery', 'restaurant'], 'every listed part is its own stop, in order');
  assert.ok(p.itinerary.stops.every((s) => !s.venue || s.venue.region === 'summerland'));
  assertFacts(p, 'S8');
});

test('golden S9: vague natural-language requests', () => {
  for (const text of ['something fun this weekend', 'somewhere fun to explore', 'surprise me']) {
    const { p } = plan(text);
    assert.deepEqual(noNothingMatchingFiller(p), [], text);
    assertFacts(p, `S9 ${text}`);
  }
  const { p } = plan('somewhere fun to explore');
  assert.ok((p.recommendations || []).length > 0, 'wanting to explore gets ideas, not a dead end');
});

test('golden S10: dates + occasion ("anniversary ... this weekend ... 2 nights")', () => {
  const { intent, p } = plan('Anniversary trip for two this weekend in Osoyoos, 2 nights');
  assert.equal(intent.occasion, 'romantic');
  assert.equal(p.days.length, 3);
  for (const s of dayStops(p)) assert.ok(!['golf', 'pub'].includes(s.venue.type), `${s.venue.name}`);
  for (const x of p.days) { const ev = x.stops.find((s) => s.daypart === 'evening'); assert.ok(ev && ev.venue && ['restaurant', 'cocktail'].includes(ev.venue.type)); }
  assert.ok(p.notes.some((n) => /Saturday/.test(n)), 'planned from the weekend date');
  assertFacts(p, 'S10');
});

// ---------- day themes, determinism, and the guard over a wider set ----------
test('golden: day themes keep one-day interests on their own day', () => {
  const { p } = plan('Three days in Kelowna, one day of golf and one day of wineries');
  assert.equal(p.days.length, 3);
  const golfDays = p.days.filter((x) => x.stops.some((s) => s.venue && s.venue.type === 'golf')).map((x) => x.day);
  const wineDays = p.days.filter((x) => x.stops.some((s) => s.venue && s.venue.type === 'winery')).map((x) => x.day);
  assert.deepEqual(golfDays, [2]);
  assert.deepEqual(wineDays, [3]);
  assertFacts(p, 'themes');
});

test('golden: deterministic for the same request and seed; Regenerate (seed) still only uses real venues', () => {
  for (const text of ['Plan a 2-day golf trip around Kelowna', 'Plan 3 days in Penticton with kids']) {
    assert.deepEqual(plan(text, 0).p, plan(text, 0).p);
    const again = plan(text, 3).p;
    assertFacts(again, `${text} seed 3`);
  }
});

test('golden: the fact guard holds across a wider request set', () => {
  const texts = [
    'Plan 3 days in July with beaches', 'girls weekend in Kelowna with wine and brunch', 'Plan a winter weekend in Big White',
    'rainy day ideas in Kelowna', 'a winery, a distillery and a nice dinner in Oliver', 'fall wine weekend in Naramata',
    'kid friendly restaurants in Penticton', 'best pizza in Kelowna', 'Take me to Lake Country for three days. I have my dog and want a leisurely trip.',
    'Plan a 4 day trip with one lazy day at the beach', 'plan 2 days, one of them on the lake', 'brewery, pizza and a lake walk in Vernon',
  ];
  for (const text of texts) assertFacts(plan(text).p, text);
});
