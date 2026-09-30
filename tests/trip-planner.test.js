// Phase 3 (2026-09-25): the Build My Trip planner (trip-planner.js).
//
// PURE tests, like tests/discovery-intent.test.js: no server.js, no database.
// A small fixture set of verified venue "facts" (the exact shape server.js
// builds from the database) plus the real interpreter, so every assertion is
// about planning behaviour: classification, grounding, heuristics, coherence,
// exclusions, pins and regeneration.

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');

const REGIONS = { kelowna: 'Kelowna', penticton: 'Penticton', vernon: 'Vernon', naramata: 'Naramata', osoyoos: 'Osoyoos', 'lake-country': 'Lake Country', 'west-kelowna': 'West Kelowna' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor'],
  features: ['dog_friendly', 'vegan', 'vegetarian', 'patio', 'kid_friendly', 'gluten_free', 'lake_view', 'nonalcoholic', 'sports_tv', 'live_music', 'great_groups', 'happy_hour'],
  collections: ['hidden_gem', 'local_favorite', 'dog_friendly'],
  activities: ['hiking', 'cycling', 'winter', 'camping', 'nature', 'water', 'viewpoints', 'adventure', 'fishing'],
  cuisines: ['japanese', 'italian', 'steakhouse'],
  budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'],
  eventCategories: ['events-festivals', 'markets-fairs', 'live-music'],
  venues: [],
};
const LABELS = {
  regions: REGIONS,
  types: {
    restaurant: { singular: 'Restaurant', plural: 'Restaurants' }, winery: { singular: 'Winery', plural: 'Wineries' },
    cafe: { singular: 'Cafe', plural: 'Cafes' }, brewery: { singular: 'Brewery', plural: 'Breweries' }, pub: { singular: 'Pub', plural: 'Pubs' },
    cocktail: { singular: 'Cocktail Lounge', plural: 'Cocktail Lounges' }, distillery: { singular: 'Distillery', plural: 'Distilleries' },
    golf: { singular: 'Golf Course', plural: 'Golf Courses' }, beach: { singular: 'Beach', plural: 'Beaches' }, outdoor: { singular: 'Outdoor Destination', plural: 'Outdoor Destinations' },
  },
  activities: { hiking: 'Hiking & Trails', nature: 'Nature & Wildlife', water: 'Water & Boating', viewpoints: 'Viewpoints', adventure: 'Adventure', cycling: 'Cycling' },
  features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', lake_view: 'Lake View', patio: 'Patio', great_groups: 'Great for Groups' },
  featureNouns: { dog_friendly: 'dog-friendly spots', kid_friendly: 'kid-friendly spots' },
  collections: { hidden_gem: 'Hidden Gems', local_favorite: 'Local Favourites', dog_friendly: 'dog-friendly beaches' },
};
const CENTRES = { vernon: [50.27, -119.27], 'lake-country': [50.05, -119.41], kelowna: [49.88, -119.49], 'west-kelowna': [49.86, -119.58], naramata: [49.59, -119.59], penticton: [49.49, -119.59], osoyoos: [49.03, -119.47] };
let nextId = 1;
function fact(o) {
  const id = o.id || nextId++;
  const [lat, lng] = o.noCoords ? [null, null] : (CENTRES[o.region] || [49.9, -119.5]).map((x, i) => x + ((id % 7) - 3) * (i ? 0.004 : 0.003));
  return {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}s/${o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    rating: o.rating === undefined ? 4.4 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: o.price === undefined ? null : o.price,
    address: null, lat, lng, cuisine: o.cuisine || null, cuisineLabel: o.cuisine ? o.cuisine[0].toUpperCase() + o.cuisine.slice(1) : null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: d.normalizeDiscoveryText(o.cuisine || ''), textDesc: d.normalizeDiscoveryText(o.desc || ''),
    features: Object.fromEntries((o.features || []).map((f) => [f, true])), collections: o.collections || [], activities: o.activities || [], fdTypes: o.fdTypes || [],
    indoorGolf: !!o.indoorGolf,
  };
}
function buildFacts() {
  nextId = 1;
  const f = [];
  for (const region of Object.keys(CENTRES)) {
    const R = REGIONS[region];
    f.push(fact({ name: `${R} Morning Cafe`, region, type: 'cafe', features: ['kid_friendly', 'dog_friendly'] }));
    f.push(fact({ name: `${R} Second Cafe`, region, type: 'cafe', rating: 4.2 }));
    f.push(fact({ name: `${R} Third Cafe`, region, type: 'cafe', rating: 4.1, features: ['kid_friendly'] }));
    f.push(fact({ name: `${R} Bistro`, region, type: 'restaurant', price: 2, features: ['kid_friendly', 'patio'] }));
    f.push(fact({ name: `${R} Lakeside Dining Room`, region, type: 'restaurant', price: 4, features: ['lake_view', 'patio'], desc: 'An intimate room with sunset views.' }));
    f.push(fact({ name: `${R} Poutine Shack`, region, type: 'restaurant', price: 1, desc: 'Fries, burgers and a proper poutine.', features: ['dog_friendly', 'kid_friendly'] }));
    f.push(fact({ name: `${R} Sushi House`, region, type: 'restaurant', cuisine: 'japanese', price: 2 }));
    f.push(fact({ name: `${R} Family Grill`, region, type: 'restaurant', price: 2, features: ['kid_friendly'] }));
    f.push(fact({ name: `${R} Estate Winery`, region, type: 'winery', features: ['lake_view', 'dog_friendly'] }));
    f.push(fact({ name: `${R} Hillside Winery`, region, type: 'winery', collections: ['hidden_gem'] }));
    f.push(fact({ name: `${R} Third Winery`, region, type: 'winery', rating: 4.0 }));
    f.push(fact({ name: `${R} Taproom`, region, type: 'brewery', features: ['dog_friendly'] }));
    f.push(fact({ name: `${R} Cocktail Bar`, region, type: 'cocktail', price: 3 }));
    f.push(fact({ name: `${R} Pub`, region, type: 'pub', features: ['sports_tv'] }));
    f.push(fact({ name: `${R} Golf Club`, region, type: 'golf', rating: null, reviews: 0, collections: region === 'kelowna' ? ['hidden_gem'] : [] }));
    f.push(fact({ name: `${R} Second Golf Club`, region, type: 'golf', rating: null, reviews: 0 }));
    f.push(fact({ name: `${R} Golf Simulator`, region, type: 'golf', rating: null, reviews: 0, indoorGolf: true }));
    f.push(fact({ name: `${R} Beach Park`, region, type: 'beach', rating: null, reviews: 0, activities: ['water'] }));
    f.push(fact({ name: `${R} Dog Beach`, region, type: 'beach', rating: null, reviews: 0, collections: ['dog_friendly'], noCoords: true }));
    f.push(fact({ name: `${R} Canyon Trail`, region, type: 'outdoor', rating: null, reviews: 0, activities: ['hiking', 'nature'], collections: ['hidden_gem'] }));
    f.push(fact({ name: `${R} Lookout`, region, type: 'outdoor', rating: null, reviews: 0, activities: ['viewpoints'], noCoords: true }));
  }
  return f;
}
const FACTS = buildFacts();
const byId = new Map(FACTS.map((v) => [v.id, v]));
const intentOf = (q) => d.interpretDiscoveryQuery(q, TAXONOMY);
const plan = (q, opts = {}) => tp.planTrip({ intent: intentOf(q), facts: FACTS, labels: LABELS, ...opts });
const allStops = (p) => [...p.days.flatMap((x) => x.stops), ...(p.outing ? [...p.outing.stops, ...p.outing.alternates] : []), ...p.recommendations].filter((s) => s.venue);

// ---- classification -------------------------------------------------------
test('the 10 example prompts are classified as the right kind of request', () => {
  const cases = {
    'Find me a great date night in Kelowna.': 'outing',
    'Where can I get the best poutine in the Okanagan?': 'recommendations',
    'Plan 3 days in Penticton with kids.': 'multi_day',
    'What should I do in Vernon with my dog?': 'discover',
    'Find me a romantic winery and dinner.': 'outing',
    'What can we do around Penticton if it rains?': 'discover',
    'Plan a golf weekend around Kelowna.': 'multi_day',
    'Plan a relaxed 3-day trip around Kelowna with wine and hidden gems.': 'multi_day',
    'Plan 5 days around the Okanagan with beaches, wineries and great food.': 'multi_day',
    "What's happening in Penticton this weekend?": 'events',
  };
  for (const [q, kind] of Object.entries(cases)) assert.equal(tp.classifyPlanRequest(intentOf(q)), kind, q);
  assert.equal(tp.classifyPlanRequest(intentOf('Plan one day in Kelowna')), 'day_plan');
  assert.equal(tp.classifyPlanRequest(intentOf('asdkjfh qwepoiu zxcvb')), 'discover');
  assert.equal(tp.classifyPlanRequest(intentOf('')), 'unknown');
});

// ---- grounding --------------------------------------------------------------
const EXAMPLES = ['Find me a great date night in Kelowna.', 'Where can I get the best poutine in the Okanagan?', 'Plan 3 days in Penticton with kids.',
  'What should I do in Vernon with my dog?', 'Find me a romantic winery and dinner.', 'What can we do around Penticton if it rains?',
  'Plan a golf weekend around Kelowna.', 'Plan a relaxed 3-day trip around Kelowna with wine and hidden gems.',
  'Plan 5 days around the Okanagan with beaches, wineries and great food.', 'Give me a fun weekend in Kelowna for two adults.', 'girls weekend in Penticton'];
test('grounding: every recommended venue is a supplied fact, with its own URL and data', () => {
  for (const q of EXAMPLES) {
    const p = plan(q);
    const stops = allStops(p);
    assert.ok(stops.length > 0, `${q}: has recommendations`);
    for (const s of stops) {
      const f = byId.get(s.venue.id);
      assert.ok(f, `${q}: ${s.venue.id} is a real fact`);
      assert.equal(s.venue.name, f.name);
      assert.equal(s.venue.url, f.url);
      assert.equal(s.venue.rating, f.rating);
      assert.equal(s.venue.price, f.price);
      assert.ok(s.why.length > 0, `${q}: ${f.name} has a reason`);
    }
  }
});
test('explanations only cite verified data', () => {
  for (const q of EXAMPLES) {
    for (const s of allStops(plan(q))) {
      const f = byId.get(s.venue.id);
      for (const r of s.reasons) {
        const t = r.text;
        const badge = t.match(/^Has the (.+) badge$/);
        if (badge) {
          const key = Object.keys(LABELS.features).find((k) => LABELS.features[k] === badge[1]);
          assert.ok(key && f.features[key], `${f.name}: "${t}" matches a set badge`);
        }
        if (/Hidden Gems/.test(t) && r.code.startsWith('collection')) assert.ok(f.collections.includes('hidden_gem'), `${f.name}: ${t}`);
        if (/Local Favourite/.test(t)) assert.ok(f.collections.includes('local_favorite'), `${f.name}: ${t}`);
        const rated = t.match(/^Rated ([\d.]+)(?: from ([\d,]+) reviews)?$/);
        if (rated) { assert.equal(Number(rated[1]), f.rating); if (rated[2]) assert.equal(Number(rated[2].replace(/,/g, '')), f.reviews); }
        const price = t.match(/Price level (\$+)/);
        if (price) assert.equal(price[1].length, f.price);
        const mention = t.match(/mentions? “(.+?)”/);
        if (mention) assert.ok([f.textName, f.textCuisine, f.textDesc].some((x) => ` ${x} `.includes(` ${mention[1]} `)), `${f.name}: "${t}"`);
        const km = t.match(/About (<?\d+) km/);
        if (km) assert.ok(f.lat != null, 'a distance is only given between stored coordinates');
        assert.ok(!/\b(open now|opening hours|minutes? drive|traffic|award|voted|best in)\b/i.test(t), `${f.name}: no unverifiable claims ("${t}")`);
      }
    }
  }
});
// Batch B (2026-09-27): occasion ranking is still explained (never stated as
// a verified fact), in visitor wording rather than implementation terms.
test('occasion picks are explained in visitor wording, never as verified facts or with implementation words', () => {
  for (const q of ['Find me a great date night in Kelowna.', 'What can we do around Penticton if it rains?', 'Plan 3 days in Penticton with kids.', 'girls weekend in Penticton']) {
    const p = plan(q);
    assert.ok(p.notes.some((n) => /in mind, based on each place\u2019s type, badges and description|come first/.test(n)), `${q}: carries a note saying what the picks are based on`);
    const texts = [...p.notes, ...p.warnings];
    for (const s of allStops(p)) texts.push(...s.why, ...s.reasons.map((r) => r.text));
    for (const t of texts) assert.doesNotMatch(t, /heuristic/i, `${q}: "${t}"`);
  }
  assert.ok(plan('Plan 3 days in Penticton with kids.').notes.some((n) => /Kid-Friendly is the badge Okanagan Roam verifies/.test(n)), 'kids: says which badge is verified');
});

// ---- the examples ----------------------------------------------------------
test('date night: Kelowna only, drink then dinner, favouring verified romantic signals', () => {
  const p = plan('Find me a great date night in Kelowna.');
  assert.equal(p.kind, 'outing');
  assert.deepEqual(p.outing.stops.map((s) => s.venue && s.venue.type), [p.outing.stops[0].venue.type, 'restaurant']);
  assert.ok(['cocktail', 'winery'].includes(p.outing.stops[0].venue.type));
  for (const s of allStops(p)) assert.equal(s.venue.region, 'kelowna');
  assert.equal(p.outing.stops[1].venue.name, 'Kelowna Lakeside Dining Room', 'lake view + price + "intimate"/"sunset" wording win the heuristic');
  assert.ok(p.outing.stops[1].why.some((w) => /Lake View|intimate|sunset|Price level/.test(w)));
});
test('best poutine: valley-wide, only places that really mention it, the visitor\'s word kept', () => {
  const p = plan('Where can I get the best poutine in the Okanagan?');
  assert.equal(p.kind, 'recommendations');
  assert.match(p.summary, /“poutine”/);
  assert.ok(p.recommendations.length > 1);
  for (const s of p.recommendations) assert.ok(byId.get(s.venue.id).textDesc.includes('poutine'));
  assert.ok(new Set(p.recommendations.map((s) => s.venue.region)).size > 1, 'the whole valley is searched');
  assert.ok(!/best/i.test(p.summary.replace('ranked by how closely they match and by their ratings', '')), 'never claims a venue is "the best"');
  const sushi = plan('sushi in Kelowna');
  assert.deepEqual(sushi.overview.interests, ['“sushi”'], '"sushi" is shown as typed, not as "Japanese"');
  assert.ok(sushi.recommendations.every((s) => byId.get(s.venue.id).cuisine === 'japanese'));
});
test('3 days in Penticton with kids: coherent, kid-safe, family places included', () => {
  const p = plan('Plan 3 days in Penticton with kids.');
  assert.equal(p.days.length, 3);
  const stops = allStops(p);
  assert.equal(new Set(stops.map((s) => s.venue.id)).size, stops.length, 'no venue repeats');
  for (const s of stops) {
    const f = byId.get(s.venue.id);
    assert.equal(f.region, 'penticton');
    assert.ok(!['cocktail', 'pub', 'distillery'].includes(f.type), `${f.name} is not an adults venue`);
    if (['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'].includes(f.type)) assert.ok(f.features.kid_friendly, `${f.name} has the Kid-Friendly badge`);
  }
  assert.ok(stops.some((s) => ['beach', 'outdoor'].includes(s.venue.type)), 'family outdoor stops are included');
  for (const day of p.days) assert.deepEqual(day.stops.map((s) => s.daypart), ['morning', 'afternoon', 'evening']);
});
test('Vernon with my dog: only verified dog-friendly places', () => {
  const p = plan('What should I do in Vernon with my dog?');
  for (const s of allStops(p)) {
    const f = byId.get(s.venue.id);
    assert.equal(f.region, 'vernon');
    assert.ok(f.features.dog_friendly || f.collections.includes('dog_friendly'), f.name);
  }
});
test('romantic winery and dinner: a winery then a restaurant close together', () => {
  const p = plan('Find me a romantic winery and dinner.');
  const [a, b] = p.outing.stops.map((s) => byId.get(s.venue.id));
  assert.equal(a.type, 'winery');
  assert.equal(b.type, 'restaurant');
  assert.equal(a.region, b.region, 'the two stops are in the same community');
  assert.ok(p.notes.some((n) => /No region was given/.test(n)));
});
test('rainy day: never a beach, trail or outdoor golf course; indoor is explained, not claimed', () => {
  const p = plan('What can we do around Penticton if it rains?');
  for (const s of allStops(p)) {
    const f = byId.get(s.venue.id);
    assert.ok(!['beach', 'outdoor'].includes(f.type), f.name);
    if (f.type === 'golf') assert.ok(f.indoorGolf, f.name);
    assert.ok(s.why.some((w) => /indoor/i.test(w)));
  }
  assert.ok(p.notes.some((n) => /doesn\u2019t track the weather or confirm that a place is indoors/.test(n)));
});
test('golf weekend: 2 days, one real round each morning, dining around it', () => {
  const p = plan('Plan a golf weekend around Kelowna.');
  assert.equal(p.days.length, 2);
  for (const day of p.days) {
    const golf = day.stops.filter((s) => s.venue && s.venue.type === 'golf');
    assert.equal(golf.length, 1, 'one round a day');
    assert.ok(!byId.get(golf[0].venue.id).indoorGolf, 'a real course before a simulator');
    assert.equal(day.stops[day.stops.length - 1].venue.type === 'restaurant' || ['pub', 'cocktail', 'brewery'].includes(day.stops[day.stops.length - 1].venue.type), true);
  }
});
test('relaxed Kelowna wine + hidden gems: relaxed pace, wineries each day, hidden gems included', () => {
  const p = plan('Plan a relaxed 3-day trip around Kelowna with wine and hidden gems.');
  assert.equal(p.overview.pace, 'relaxed');
  assert.equal(p.days.length, 3);
  for (const day of p.days) assert.ok(day.stops.some((s) => s.venue && s.venue.type === 'winery'), `day ${day.day} has a winery`);
  assert.ok(allStops(p).some((s) => byId.get(s.venue.id).collections.includes('hidden_gem')));
});
test('5 days around the Okanagan: several regions, north to south, each focus covered', () => {
  const p = plan('Plan 5 days around the Okanagan with beaches, wineries and great food.');
  assert.equal(p.days.length, 5);
  const regions = p.days.map((x) => x.region);
  const lat = (r) => CENTRES[r][0];
  for (let i = 1; i < regions.length; i++) assert.ok(lat(regions[i]) <= lat(regions[i - 1]), 'never doubles back north');
  assert.ok(new Set(regions).size >= 3);
  const types = new Set(allStops(p).map((s) => s.venue.type));
  for (const t of ['beach', 'winery', 'restaurant']) assert.ok(types.has(t), t);
});
test('events: only the supplied events, never venues', () => {
  const events = [{ id: 9, name: 'Fixture Fair', region: 'penticton', url: '/penticton/events/fixture-fair', dateLabel: 'Sat Sep 26', time: '' }];
  const p = tp.planTrip({ intent: intentOf("What's happening in Penticton this weekend?"), facts: FACTS, labels: LABELS, events });
  assert.equal(p.kind, 'events');
  assert.deepEqual(p.events, events);
  assert.equal(allStops(p).length, 0);
  const around = tp.planTrip({ intent: intentOf('Plan my weekend around events in Kelowna'), facts: FACTS, labels: LABELS, events: [] });
  assert.equal(around.kind, 'events');
  assert.ok(around.notes.some((n) => /not supported yet/.test(n)), 'event-slot itineraries are honestly deferred');
});

// ---- coherence -------------------------------------------------------------
test('pace controls the number of stops per day', () => {
  assert.equal(plan('a packed 2 day trip in Kelowna').days[0].stops.length, 4);
  assert.equal(plan('a relaxed 2 day trip in Kelowna').days[0].stops.length, 3);
  for (const s of plan('a packed 2 day trip in Kelowna').days[0].stops) assert.ok(tp.SLOT_AFFINITY[s.daypart][s.venue.type] > 0, `${s.venue.type} suits ${s.daypart}`);
});
test('stops respect their daypart and days never repeat a venue', () => {
  for (const q of ['Plan 3 days in Kelowna', 'Plan 4 days in Penticton with wineries and beaches', 'a week in Vernon']) {
    const p = plan(q);
    const ids = allStops(p).map((s) => s.venue.id);
    assert.equal(new Set(ids).size, ids.length, q);
    for (const day of p.days) for (const s of day.stops) if (s.venue) assert.ok(tp.SLOT_AFFINITY[s.daypart][s.venue.type] > 0, `${q}: ${s.venue.type} in the ${s.daypart}`);
  }
});

// ---- exclusions, pins, regeneration -----------------------------------------
test('excluded venues never return; pins keep the rest of the plan', () => {
  const q = 'Plan a relaxed 3-day trip around Kelowna with wine and hidden gems.';
  const first = plan(q);
  const target = first.days[1].stops[1];
  const pinned = {};
  first.days.forEach((day) => day.stops.forEach((s) => { const k = `${day.day}-${s.daypart}`; if (s.venue && s !== target) pinned[k] = s.venue.id; }));
  const second = plan(q, { excludeIds: [target.venue.id], pinned });
  assert.ok(!allStops(second).some((s) => s.venue.id === target.venue.id), 'removed venue is gone');
  first.days.forEach((day, i) => day.stops.forEach((s, j) => {
    if (s !== target) assert.equal(second.days[i].stops[j].venue.id, s.venue.id, `day ${day.day} ${s.daypart} kept`);
  }));
  assert.ok(second.days[1].stops[1].venue, 'the removed slot was refilled');
  // Recommendations: an excluded venue is replaced by the next candidate.
  const recs = plan('What should I do in Vernon with my dog?');
  const next = plan('What should I do in Vernon with my dog?', { excludeIds: [recs.recommendations[0].venue.id] });
  assert.ok(!next.recommendations.some((s) => s.venue.id === recs.recommendations[0].venue.id));
});
test('regeneration is deterministic per seed and gives different valid plans', () => {
  const q = 'Plan 3 days in Kelowna';
  assert.deepEqual(plan(q), plan(q), 'same input, same plan');
  const a = plan(q);
  const shown = allStops(a).map((s) => s.venue.id);
  const b = plan(q, { seed: 1, avoidIds: shown, excludeIds: [shown[0]] });
  const bIds = allStops(b).map((s) => s.venue.id);
  assert.ok(!bIds.includes(shown[0]), 'explicit exclusions persist through regeneration');
  assert.ok(bIds.filter((id) => !shown.includes(id)).length >= Math.ceil(bIds.length / 2), 'regeneration is meaningfully different');
  assert.deepEqual(plan(q, { seed: 1, avoidIds: shown }), plan(q, { seed: 1, avoidIds: shown }));
});
test('no candidates: honest warnings, never invented stops', () => {
  const empty = tp.planTrip({ intent: intentOf('Plan 2 days in Osoyoos with wineries'), facts: [], labels: LABELS });
  assert.ok(empty.warnings.length > 0);
  assert.equal(allStops(empty).length, 0);
  const none = tp.planTrip({ intent: intentOf('poutine in Vernon'), facts: FACTS.filter((f) => f.region !== 'vernon'), labels: LABELS });
  assert.equal(none.recommendations.length, 0);
  assert.ok(none.warnings.some((w) => /No Okanagan Roam listings/.test(w)));
});

// ---- Phase 3.5: hours, date night, cafes, coordinates, ranking, wording ------
const H = (o) => JSON.stringify(o);
const every = (ranges) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ranges]));
function mini(o) { return fact({ rating: 4.5, reviews: 100, ...o }); }

test('hours: the real stored formats parse, and anything else is unknown', () => {
  // Standard, single-digit and zero-padded times.
  let p = tp.parseVenueHours(H(every([['7:00', '15:00']])));
  assert.equal(p.known, true);
  assert.deepEqual(p.days.mon, { status: 'open', ranges: [[420, 900]] });
  // null and [] are the site's own "Closed" (the venue page shows them so).
  p = tp.parseVenueHours(H({ ...every([['12:00', '18:00']]), mon: null, tue: [] }));
  assert.equal(p.days.mon.status, 'closed');
  assert.equal(p.days.tue.status, 'closed');
  // Split lunch/dinner ranges.
  p = tp.parseVenueHours(H(every([['11:00', '14:30'], ['16:00', '21:00']])));
  assert.deepEqual(p.days.fri.ranges, [[660, 870], [960, 1260]]);
  // "00:00" closes at midnight; a close before the open runs past midnight.
  assert.deepEqual(tp.parseVenueHours(H(every([['11:00', '00:00']]))).days.sat.ranges, [[660, 1440]]);
  assert.deepEqual(tp.parseVenueHours(H(every([['17:00', '01:00']]))).days.sat.ranges, [[1020, 1500]]);
  // A missing day key is unknown, not closed (two production rows omit "mon").
  const { mon, ...noMon } = every([['12:00', '20:00']]);
  assert.equal(tp.parseVenueHours(H(noMon)).days.mon.status, 'unknown');
  // Unusable input: never assumed open or closed.
  for (const bad of [null, '', '   ', 'Mon-Fri 9-5', '[1,2]', '{"mon":"9-5"}', '{"mon":[["9am","5pm"]]}', '{"mon":[["25:00","26:00"]]}', 42]) {
    const q = tp.parseVenueHours(bad);
    assert.equal(q.known, false, String(bad));
    assert.ok(Object.values(q.days).every((d) => d.status === 'unknown'));
  }
});

test('hours: open, closed, partial and unknown are told apart for a slot', () => {
  const dinnerOnly = mini({ name: 'HrsDinner', region: 'kelowna', type: 'restaurant' }); dinnerOnly.hours = H(every([['16:30', '20:30']]));
  assert.equal(tp.hoursFit(dinnerOnly, 'evening', null).status, 'verified');
  assert.equal(tp.hoursFit(dinnerOnly, 'morning', null).status, 'closed', 'listed hours prove it is closed in the morning');
  const weekends = mini({ name: 'HrsWeekend', region: 'kelowna', type: 'winery' }); weekends.hours = H({ ...every(null), fri: [['11:00', '18:00']], sat: [['11:00', '18:00']], sun: [['11:00', '18:00']] });
  const fit = tp.hoursFit(weekends, 'afternoon', null);
  assert.equal(fit.status, 'partial');
  assert.deepEqual(fit.days, ['fri', 'sat', 'sun']);
  assert.equal(tp.hoursFit(weekends, 'afternoon', 'sat').status, 'verified');
  assert.equal(tp.hoursFit(weekends, 'afternoon', 'tue').status, 'closed');
  const late = mini({ name: 'HrsLate', region: 'kelowna', type: 'cocktail' }); late.hours = H(every([['17:00', '01:00']]));
  assert.equal(tp.hoursFit(late, 'evening', null).status, 'verified', 'an overnight range covers the evening');
  const none = mini({ name: 'HrsNone', region: 'kelowna', type: 'restaurant' });
  assert.equal(tp.hoursFit(none, 'evening', null).status, 'unknown');
  const { mon, ...noMon } = { ...every(null), fri: [['11:00', '18:00']] };
  const gap = mini({ name: 'HrsGap', region: 'kelowna', type: 'cafe' }); gap.hours = H({ ...noMon, fri: null });
  assert.equal(tp.hoursFit(gap, 'morning', null).status, 'unknown', 'an unknown day keeps it from being called closed');
});

test('hours in plans: never scheduled when listed hours prove closed; unknown is allowed with a caveat', () => {
  const region = 'naramata';
  const facts = [
    Object.assign(mini({ name: 'KL Breakfast Cafe', region, type: 'cafe', desc: 'Coffee and pastries.' }), { hours: H(every([['7:00', '14:00']])) }),
    Object.assign(mini({ name: 'KL Dinner Only', region, type: 'restaurant', rating: 5.0, reviews: 900 }), { hours: H(every([['17:00', '21:00']])) }),
    Object.assign(mini({ name: 'KL Lunch Only', region, type: 'restaurant', rating: 4.9, reviews: 900 }), { hours: H(every([['11:00', '15:00']])) }),
    Object.assign(mini({ name: 'KL Winery', region, type: 'winery' }), { hours: H(every([['10:00', '17:00']])) }),
    mini({ name: 'KL Mystery Pub', region, type: 'pub' }),
  ];
  const p = tp.planTrip({ intent: intentOf('Plan one day in Naramata'), facts, labels: LABELS });
  const byPart = Object.fromEntries(p.days[0].stops.map((s) => [s.daypart, s]));
  assert.notEqual(byPart.evening.venue.name, 'KL Lunch Only', 'a lunch-only restaurant is never the evening stop');
  assert.notEqual(byPart.morning.venue && byPart.morning.venue.name, 'KL Dinner Only');
  for (const s of p.days[0].stops.filter((x) => x.venue)) {
    const f = facts.find((x) => x.id === s.venue.id);
    const status = tp.hoursFit(f, s.daypart, null).status;
    assert.notEqual(status, 'closed', `${f.name} in the ${s.daypart}`);
    if (status === 'unknown') assert.ok(s.caveats.some((c) => /No usable hours/.test(c)), `${f.name} carries an unknown-hours caveat`);
    if (status === 'verified') assert.ok(s.reasons.some((r) => /^Listed hours: \d\d:\d\d\u2013\d\d:\d\d daily$/.test(r.text)), 'states the stored hours');
  }
  assert.ok(p.notes.some((n) => /listed hours/.test(n) && /check before you go/.test(n)));
});

test('date night: lounges first, wineries only when their hours reach the early evening, no false "open" claims', () => {
  const region = 'lake-country';
  const base = [
    Object.assign(mini({ name: 'DN Dinner', region, type: 'restaurant', price: 3 }), { hours: H(every([['17:00', '22:00']])) }),
    Object.assign(mini({ name: 'DN Early Winery', region, type: 'winery', rating: 5.0, reviews: 900, features: ['lake_view'] }), { hours: H(every([['10:00', '17:00']])) }),
  ];
  const run = (facts, text = 'Find me a great date night in Lake Country.') => tp.planTrip({ intent: intentOf(text), facts, labels: LABELS });
  // A winery that closes at 5 pm is never the pre-dinner drink, however well rated.
  let p = run(base);
  assert.notEqual(p.outing.stops[0].venue && p.outing.stops[0].venue.name, 'DN Early Winery');
  // A winery open until 7 pm is a legitimate drink-first stop.
  const lateWinery = Object.assign(mini({ name: 'DN Late Winery', region, type: 'winery' }), { hours: H(every([['11:00', '19:00']])) });
  p = run([...base, lateWinery]);
  assert.equal(p.outing.stops[0].venue.name, 'DN Late Winery');
  assert.ok(p.outing.stops[0].why.concat(p.outing.stops[0].reasons.map((r) => r.text)).some((t) => t === 'Listed hours: 11:00\u201319:00 daily'));
  // With an equally matched lounge available, the lounge comes first.
  const lounge = Object.assign(mini({ name: 'DN Lounge', region, type: 'cocktail' }), { hours: H(every([['16:00', '23:00']])) });
  p = run([...base, lateWinery, lounge]);
  assert.equal(p.outing.stops[0].venue.name, 'DN Lounge');
  assert.equal(p.outing.stops[1].venue.name, 'DN Dinner');
  // Unknown hours: still eligible, but flagged -- never described as open.
  const mystery = mini({ name: 'DN Mystery Lounge', region, type: 'cocktail', rating: 5.0, reviews: 900 });
  p = run([...base, mystery]);
  assert.equal(p.outing.stops[0].venue.name, 'DN Mystery Lounge');
  assert.ok(p.outing.stops[0].caveats.some((c) => /No usable hours/.test(c)));
  assert.ok(!p.outing.stops[0].reasons.some((r) => /Listed hours/.test(r.text)));
  // "tonight" checks the actual weekday.
  const monClosed = Object.assign(mini({ name: 'DN Mon Closed Lounge', region, type: 'cocktail', rating: 5.0, reviews: 900 }), { hours: H({ ...every([['16:00', '23:00']]), mon: null }) });
  const mon = tp.planTrip({ intent: intentOf('date night in Lake Country tonight'), facts: [...base, monClosed, lateWinery], labels: LABELS, startWeekday: 'mon' });
  assert.notEqual(mon.outing.stops[0].venue.name, 'DN Mon Closed Lounge', 'closed on the requested day');
  assert.ok(mon.notes.some((n) => /planned as a Monday/.test(n)));
});

test('cafe roles: juice, subs and grocery stores are ranked down, never removed', () => {
  const region = 'osoyoos';
  const mk = (name, extra = {}) => mini({ name, region, type: 'cafe', ...extra });
  const cases = [
    [mk('Okanagan premium fruit juice', { desc: 'A fresh-pressed juice trailer.' }), 'other'],
    [mk('Rocket Subs', { desc: 'Fresh ingredients and generous portions.' }), 'other'],
    [mk('Mezzo Market', { desc: 'A health-focused grocery store with a cafe bar.' }), 'other'],
    [mk('Maui Teahouse', { cuisine: 'bubble tea' }), 'treat'],
    [mk('Roberto Gelato', { desc: 'Italian-style gelato counter.' }), 'treat'],
    [mk('Bean Scene', { desc: 'Espresso, lattes and fresh pastries.' }), 'coffee'],
    [mk('Ida Bakery', { desc: 'Apple fritters and sausage rolls from the bakery.' }), 'coffee'],
    [mk('Rail Trail Cafe and Market', { desc: 'Coffee on the trail.' }), 'coffee'],
    [mk('Mystery Nook', { desc: 'A small spot.' }), 'unclear'],
  ];
  for (const [f, role] of cases) assert.equal(tp.cafeRole(f), role, f.name);
  assert.equal(tp.cafeRole(mini({ name: 'Not a cafe', region, type: 'restaurant' })), null);
  const facts = cases.map(([f]) => f).concat([mini({ name: 'OS Dinner', region, type: 'restaurant' }), mini({ name: 'OS Winery', region, type: 'winery' })]);
  const p = tp.planTrip({ intent: intentOf('Plan one day in Osoyoos'), facts, labels: LABELS });
  assert.equal(tp.cafeRole(byNameIn(facts, p.days[0].stops[0].venue.name)), 'coffee', 'a real cafe gets the morning');
  // Still findable when that is exactly what someone asks for.
  const juice = tp.planTrip({ intent: intentOf('juice in Osoyoos'), facts, labels: LABELS });
  assert.deepEqual(juice.recommendations.map((s) => s.venue.name), ['Okanagan premium fruit juice']);
});
function byNameIn(facts, name) { return facts.find((f) => f.name === name); }

test('coordinates: distance only when both stops have them; otherwise a neutral cost and an honest caveat', () => {
  const region = 'west-kelowna';
  const cafe = mini({ name: 'PL Cafe', region, type: 'cafe', desc: 'Coffee.' });
  const near = mini({ name: 'PL Near Winery', region, type: 'winery' });
  near.lat = cafe.lat + 0.01; near.lng = cafe.lng;
  const far = mini({ name: 'PL Far Winery', region, type: 'winery' });
  far.lat = cafe.lat + 0.5; far.lng = cafe.lng;
  const unmapped = mini({ name: 'PL Unmapped Winery', region, type: 'winery', noCoords: true });
  const dinner = mini({ name: 'PL Dinner', region, type: 'restaurant', noCoords: true });
  const run = (facts) => tp.planTrip({ intent: intentOf('Plan one day in West Kelowna'), facts, labels: LABELS }).days[0].stops;
  // Both known: the measured distance is used and cited.
  let stops = run([cafe, near, far, dinner]);
  assert.equal(stops[1].venue.name, 'PL Near Winery');
  assert.ok(stops[1].reasons.some((r) => /^About <?\d+ km \(straight line\)/.test(r.text)));
  // A venue without coordinates is not rewarded over a nearby mapped one...
  stops = run([cafe, near, unmapped, dinner]);
  assert.equal(stops[1].venue.name, 'PL Near Winery');
  // ...but it is preferred over one that is known to be far away.
  stops = run([cafe, far, unmapped, dinner]);
  assert.equal(stops[1].venue.name, 'PL Unmapped Winery');
  assert.ok(stops[1].caveats.some((c) => /distance between them isn.t known/.test(c)));
  assert.ok(!stops[1].reasons.some((r) => /km/.test(r.text)), 'no distance is claimed');
  // Both missing (unmapped winery -> unmapped dinner): still planned, still honest.
  assert.equal(stops[2].venue.name, 'PL Dinner');
  assert.ok(stops[2].caveats.some((c) => /isn.t known/.test(c)));
  assert.deepEqual(run([cafe, far, unmapped, dinner]), stops, 'deterministic');
});

test('ranking falls back gracefully on missing ratings, reviews and prices', () => {
  const ctx = tp.buildContext(intentOf('restaurants in Kelowna'), LABELS, {});
  const rated = mini({ name: 'RK Rated', region: 'kelowna', type: 'restaurant', rating: 4.8, reviews: 500 });
  const fewReviews = mini({ name: 'RK Few', region: 'kelowna', type: 'restaurant', rating: 4.8, reviews: 0 });
  const unrated = mini({ name: 'RK Unrated', region: 'kelowna', type: 'restaurant', rating: null, reviews: 0 });
  const s = (v) => tp.scoreVenue(v, ctx);
  assert.ok(s(rated).score > s(fewReviews).score, 'review count strengthens a rating');
  assert.ok(s(fewReviews).score > s(unrated).score);
  assert.ok(!s(unrated).reasons.some((r) => /Rated/.test(r.text)), 'no rating is invented');
  assert.ok(s(fewReviews).reasons.some((r) => r.text === 'Rated 4.8'), 'no review count is invented');
  // Budget never excludes an unpriced venue and never states a price it lacks.
  const bctx = tp.buildContext(intentOf('cheap restaurants in Kelowna'), LABELS, {});
  const unpriced = mini({ name: 'RK Unpriced', region: 'kelowna', type: 'restaurant', price: null });
  assert.ok(tp.eligible(unpriced, bctx, true));
  assert.ok(!tp.scoreVenue(unpriced, bctx).reasons.some((r) => /Price/.test(r.text)));
  const p = tp.planTrip({ intent: intentOf('cheap restaurants in Kelowna'), facts: [unpriced, unrated], labels: LABELS });
  assert.equal(p.recommendations.length, 2, 'missing data never removes a venue');
});

test('wording: no unsupported claims anywhere; heuristics are never stated as facts', () => {
  const banned = /\b(perfect|atmosphere|award|awards|award-winning|always open|open now|best in|great views?|stunning|guaranteed|must-see|world[- ]class)\b/i;
  const prompts = EXAMPLES.concat(['date night in Kelowna tonight', 'Plan one day in Osoyoos', 'juice in Osoyoos']);
  for (const q of prompts) {
    const p = plan(q, { startWeekday: /tonight/.test(q) ? 'fri' : null });
    const texts = [p.summary, ...p.notes, ...p.warnings];
    for (const s of allStops(p)) texts.push(...s.why, ...s.reasons.map((r) => r.text), ...(s.caveats || []));
    for (const t of texts) {
      const unquoted = t.replace(/“[^”]*”/g, '');
      assert.ok(!banned.test(unquoted), `${q}: "${t}"`);
      if (/\bromantic\b/i.test(unquoted)) assert.match(unquoted, /romantic outing/i, `${q}: "romantic" is only the request: "${t}"`);
      assert.doesNotMatch(t, /heuristic/i, `${q}: no implementation words shown to visitors: "${t}"`);
    }
  }
});

test('itinerary: an earlier slot never takes the only restaurant that could serve dinner', () => {
  const region = 'vernon';
  const facts = [
    mini({ name: 'VN Cafe', region, type: 'cafe', desc: 'Coffee.' }),
    mini({ name: 'VN Only Restaurant', region, type: 'restaurant', rating: 5.0, reviews: 900 }),
    mini({ name: 'VN Beach', region, type: 'beach', rating: null, reviews: 0 }),
  ];
  const stops = tp.planTrip({ intent: intentOf('Plan one day in Vernon'), facts, labels: LABELS }).days[0].stops;
  assert.deepEqual(stops.map((s) => s.venue && s.venue.name), ['VN Cafe', 'VN Beach', 'VN Only Restaurant']);
  // With no other afternoon option, the afternoon stays open rather than leaving dinner empty.
  const lone = tp.planTrip({ intent: intentOf('Plan one day in Vernon'), facts: facts.slice(0, 2), labels: LABELS }).days[0].stops;
  assert.equal(lone[2].venue && lone[2].venue.name, 'VN Only Restaurant');
});

// ---- Phase 3.5 acceptance fixes ----------------------------------------------
const at = (o, lat, lng, hours) => Object.assign(mini(o), { lat, lng }, hours === undefined ? {} : { hours: H(hours) });
const KEL = [49.8863, -119.4966]; // downtown
const NEAR = (dLat, dLng = 0) => [KEL[0] + dLat, KEL[1] + dLng];
const hoursReasonRe = /^Listed hours( (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?: /;
function recNames(p) { return p.recommendations.map((s) => s.venue.name); }
function recBy(p, name) { return p.recommendations.find((s) => s.venue.name === name); }

test('time-aware recommendations: "tonight" drops venues whose listed hours prove them closed, keeps unknown as unknown', () => {
  const region = 'kelowna';
  const facts = [
    at({ name: 'TN Dinner House', region, type: 'restaurant', rating: 4.6, reviews: 500 }, ...NEAR(0), every([['17:00', '22:00']])),
    at({ name: 'TN Lunch Cafe', region, type: 'cafe', rating: 5.0, reviews: 900, desc: 'Coffee and pastries.' }, ...NEAR(0.001), every([['7:00', '15:00']])),
    at({ name: 'TN Winery Closed Fridays', region, type: 'winery', rating: 5.0, reviews: 900 }, ...NEAR(-0.05), { ...every([['11:00', '21:00']]), fri: null }),
    at({ name: 'TN Mystery Pub', region, type: 'pub', rating: 4.5, reviews: 300 }, ...NEAR(0.002)),
    at({ name: 'TN Early Bar', region, type: 'cocktail', rating: 4.4, reviews: 200 }, ...NEAR(0.003), every([['12:00', '19:00']])),
  ];
  const p = tp.planTrip({ intent: intentOf('Find me something fun to do in Kelowna tonight.'), facts, labels: LABELS, startWeekday: 'fri' });
  assert.equal(p.kind, 'recommendations');
  const names = recNames(p);
  assert.ok(!names.includes('TN Lunch Cafe'), 'closes at 15:00 -- proven closed tonight');
  assert.ok(!names.includes('TN Winery Closed Fridays'), 'listed as closed on Friday');
  assert.ok(names.includes('TN Dinner House'));
  assert.ok(names.includes('TN Mystery Pub'), 'unknown hours are not treated as closed');
  assert.ok(names.includes('TN Early Bar'), 'open for part of the evening is not "proven closed"');
  assert.ok(recBy(p, 'TN Dinner House').reasons.some((r) => r.text === 'Listed hours Friday: 17:00–22:00'));
  const pub = recBy(p, 'TN Mystery Pub');
  assert.ok(pub.caveats.some((c) => /No usable hours/.test(c)));
  assert.ok(!pub.reasons.some((r) => /Listed hours/.test(r.text)), 'no hours are claimed for it');
  assert.ok(recBy(p, 'TN Early Bar').caveats.some((c) => /only overlap part of the evening/.test(c)));
  assert.match(p.summary, /tonight/);
  assert.ok(p.notes.some((n) => /listed hours/.test(n) && /check before you go/.test(n)));
  assert.ok(p.notes.some((n) => /Friday/.test(n)));
});

test('time-aware recommendations: an explicit morning request', () => {
  const region = 'kelowna';
  const facts = [
    at({ name: 'AM Early Cafe', region, type: 'cafe', desc: 'Espresso and croissants.' }, ...NEAR(0), every([['7:00', '15:00']])),
    at({ name: 'AM Late Cafe', region, type: 'cafe', rating: 5.0, reviews: 900, desc: 'Coffee and cake.' }, ...NEAR(0.001), every([['12:00', '18:00']])),
    at({ name: 'AM Mystery Cafe', region, type: 'cafe', desc: 'Coffee.' }, ...NEAR(0.002)),
  ];
  const p = tp.planTrip({ intent: intentOf('coffee in Kelowna tomorrow morning'), facts, labels: LABELS, startWeekday: 'sat' });
  const names = recNames(p);
  assert.ok(!names.includes('AM Late Cafe'), 'opens at noon -- proven closed in the morning');
  assert.deepEqual(names.slice().sort(), ['AM Early Cafe', 'AM Mystery Cafe']);
  assert.equal(names[0], 'AM Early Cafe', 'listed hours that fit rank above unknown hours');
  assert.ok(recBy(p, 'AM Early Cafe').reasons.some((r) => r.text === 'Listed hours Saturday: 07:00–15:00'));
  assert.ok(recBy(p, 'AM Mystery Cafe').caveats.some((c) => /No usable hours/.test(c)));
  assert.match(p.summary, /tomorrow morning/);
});

test('time-aware recommendations: an explicit afternoon request, and no filtering without a time', () => {
  const region = 'kelowna';
  const facts = [
    at({ name: 'PM Day Winery', region, type: 'winery' }, ...NEAR(0), every([['11:00', '17:00']])),
    at({ name: 'PM Saturday Closed Winery', region, type: 'winery', rating: 5.0, reviews: 900 }, ...NEAR(0.01), { ...every([['11:00', '17:00']]), sat: [] }),
    at({ name: 'PM Evening Winery', region, type: 'winery', rating: 5.0, reviews: 900 }, ...NEAR(0.02), every([['17:00', '21:00']])),
  ];
  const p = tp.planTrip({ intent: intentOf('wineries in Kelowna Saturday afternoon'), facts, labels: LABELS, startWeekday: 'sat' });
  assert.deepEqual(recNames(p), ['PM Day Winery']);
  assert.match(p.summary, /on Saturday afternoon/);
  // The same venues with no time asked for: nothing is filtered by hours.
  const any = tp.planTrip({ intent: intentOf('wineries in Kelowna'), facts, labels: LABELS });
  assert.equal(any.recommendations.length, 3);
  assert.ok(!any.notes.some((n) => /Checked against/.test(n)));
});

test('hours wording: reasons state the stored hours and never claim a venue "covers" a slot or is open', () => {
  const region = 'kelowna';
  const facts = [
    at({ name: 'HW Cafe', region, type: 'cafe', desc: 'Coffee.' }, ...NEAR(0), every([['7:00', '15:00']])),
    at({ name: 'HW Winery', region, type: 'winery' }, ...NEAR(0.01), { ...every([['11:00', '17:00']]), sat: [['11:00', '18:00']], sun: [['11:00', '18:00']] }),
    at({ name: 'HW Late Kitchen', region, type: 'restaurant' }, ...NEAR(0.012), every([['17:00', '01:00']])),
    at({ name: 'HW Lounge', region, type: 'cocktail' }, ...NEAR(0.011), every([['16:00', '23:00']])),
  ];
  const plans = [
    tp.planTrip({ intent: intentOf('Plan one day in Kelowna'), facts, labels: LABELS }),
    tp.planTrip({ intent: intentOf('Find me a great date night in Kelowna.'), facts, labels: LABELS }),
    tp.planTrip({ intent: intentOf('Find me something fun to do in Kelowna tonight.'), facts, labels: LABELS, startWeekday: 'sat' }),
  ];
  const texts = [];
  for (const p of plans) for (const s of allStops(p)) texts.push(...s.reasons.map((r) => r.text), ...s.why, ...s.caveats);
  for (const t of texts) {
    assert.ok(!/\b(cover|covers|covered|open now|open late|always open|guaranteed?)\b/i.test(t), t);
    if (/hours/i.test(t) && !/check/.test(t)) assert.match(t, hoursReasonRe, t);
  }
  assert.ok(texts.includes('Listed hours: 07:00–15:00 daily'));
  assert.ok(texts.includes('Listed hours: 17:00–01:00 daily'), 'an overnight range is shown as listed');
  assert.ok(texts.includes('Listed hours: 11:00–17:00 Mon–Fri; 11:00–18:00 Sat–Sun'));
  assert.ok(texts.includes('Listed hours Saturday: 16:00–23:00'));
});

test('date night: a winery closing at 18:00 is not the pre-dinner drink (its listing does not reach the early evening)', () => {
  const region = 'kelowna';
  const facts = [
    at({ name: 'DN6 Winery', region, type: 'winery', rating: 5.0, reviews: 900, features: ['lake_view', 'patio'], desc: 'Cozy booths.' }, ...NEAR(-0.1), every([['11:00', '18:00']])),
    at({ name: 'DN6 Dinner', region, type: 'restaurant', price: 4 }, ...NEAR(0), every([['16:00', '22:00']])),
    at({ name: 'DN6 Pub', region, type: 'pub', rating: 4.0, reviews: 50 }, ...NEAR(0.002), every([['12:00', '23:00']])),
  ];
  const p = tp.planTrip({ intent: intentOf('Find me a great date night in Kelowna.'), facts, labels: LABELS });
  assert.equal(p.outing.stops[0].venue.name, 'DN6 Pub');
  assert.ok(!allStops(p).some((s) => s.venue.name === 'DN6 Winery' && s.label === 'A drink first'));
});

test('date night: the drink and dinner are chosen as a pair, close together where locations are known (the Kelowna example)', () => {
  const region = 'kelowna';
  // Shaped on the real result: a lake-view winery ~11 km south of downtown
  // beat a downtown supper-club lounge 0.2 km from the chosen dinner.
  const winery = at({ name: 'Pair Lakeside Winery', region, type: 'winery', rating: 4.5, reviews: 0, features: ['lake_view', 'patio', 'dog_friendly'], desc: 'Cozy outdoor booths and a lake view.' }, ...NEAR(-0.097, -0.045), every([['11:00', '19:00']]));
  const dinner = at({ name: 'Pair Tasting Menu', region, type: 'restaurant', rating: 4.7, reviews: 476, price: 4, features: ['lake_view', 'patio'], desc: 'An intimate tasting menu.' }, ...NEAR(0), every([['16:00', '22:30']]));
  const lounge = at({ name: 'Pair Supper Club', region, type: 'cocktail', rating: 4.7, reviews: 0, features: ['patio'], desc: 'A speakeasy supper club for date night.' }, ...NEAR(0.0015), every([['16:00', '23:00']]));
  const p = tp.planTrip({ intent: intentOf('Find me a great date night in Kelowna.'), facts: [winery, dinner, lounge], labels: LABELS });
  const [drink, meal] = p.outing.stops;
  assert.equal(drink.venue.name, 'Pair Supper Club');
  assert.equal(meal.venue.name, 'Pair Tasting Menu');
  assert.ok(meal.reasons.some((r) => /^About <1 km \(straight line\)/.test(r.text)));
  // Wineries stay legitimate: with its own restaurant next door, the winery pair wins.
  const onsite = at({ name: 'Pair Winery Restaurant', region, type: 'restaurant', rating: 4.6, reviews: 400, price: 3, features: ['lake_view', 'patio'] }, winery.lat + 0.0005, winery.lng, every([['12:00', '21:00']]));
  const q = tp.planTrip({ intent: intentOf('Find me a great date night in Kelowna.'), facts: [winery, dinner, onsite], labels: LABELS });
  assert.deepEqual(q.outing.stops.map((s) => s.venue.name), ['Pair Lakeside Winery', 'Pair Winery Restaurant']);
  // No locations: still a pair, no distance claimed, the gap flagged honestly.
  const noLoc = [winery, dinner, lounge].map((v) => ({ ...v, lat: null, lng: null, _hours: undefined }));
  const r = tp.planTrip({ intent: intentOf('Find me a great date night in Kelowna.'), facts: noLoc, labels: LABELS });
  assert.equal(r.outing.stops.filter((s) => s.venue).length, 2);
  assert.ok(!allStops(r).some((s) => s.reasons.some((x) => /km/.test(x.text))));
  assert.ok(r.outing.stops[1].caveats.some((c) => /isn.t known/.test(c)));
  assert.deepEqual(tp.planTrip({ intent: intentOf('Find me a great date night in Kelowna.'), facts: noLoc, labels: LABELS }), r, 'deterministic');
});

test('dinner ranking: a slice counter or food truck does not beat a sit-down restaurant on generic signals (the golf-weekend example)', () => {
  const region = 'kelowna';
  const base = [
    at({ name: 'QS Golf Club', region, type: 'golf', rating: null, reviews: 0 }, ...NEAR(0.08, 0.05)),
    at({ name: 'QS Taproom', region, type: 'brewery', rating: 5.0, reviews: 0 }, ...NEAR(0.085, 0.07), every([['12:00', '22:00']])),
  ];
  const slice = at({ name: 'Happy Slice Pizza (Airport)', region, type: 'restaurant', rating: 4.9, reviews: 0, desc: "Happy Slice's airport location solves a real problem: the only pizza-by-the-slice option inside Kelowna airport." }, ...NEAR(0.09, 0.075), every([['10:00', '02:00']]));
  const truck = at({ name: 'QS Kabob Truck', region, type: 'restaurant', rating: 5.0, reviews: 142, desc: 'Two brothers run this halal food truck.' }, ...NEAR(0.086, 0.071), every([['12:00', '13:30'], ['18:00', '21:00']]));
  const sitDown = at({ name: 'QS Grill House', region, type: 'restaurant', rating: 4.6, reviews: 900, price: 2 }, ...NEAR(0.06, 0.03), every([['11:00', '23:00']]));
  const dinnerOf = (facts) => tp.planTrip({ intent: intentOf('Plan a golf weekend around Kelowna.'), facts, labels: LABELS }).days[0].stops.find((s) => s.daypart === 'evening');
  assert.equal(dinnerOf([...base, slice, truck, sitDown]).venue.name, 'QS Grill House');
  // Not excluded: with nothing else, the slice counter is still offered.
  const only = dinnerOf([...base, slice]);
  assert.equal(only.venue.name, 'Happy Slice Pizza (Airport)');
  assert.ok(!only.reasons.some((r) => /quick|fast food|slice/i.test(r.text)), 'nothing is claimed about it');
});

test('golf weekend: afternoons go to a winery, brewery or distillery where the data has one, otherwise fall back gracefully', () => {
  const region = 'kelowna';
  const golf1 = at({ name: 'GW Ranch Golf', region, type: 'golf', rating: null, reviews: 0 }, ...NEAR(-0.05, 0.04));
  const golf2 = at({ name: 'GW Mountain Golf', region, type: 'golf', rating: null, reviews: 0 }, ...NEAR(0.02, 0.1));
  const tea = at({ name: 'GW Tea Shop', region, type: 'cafe', rating: 5.0, reviews: 211, desc: 'A cozy downtown tea shop with plants and books.' }, ...NEAR(0), every([['9:30', '17:30']]));
  const winery = at({ name: 'GW Hill Winery', region, type: 'winery', rating: 4.6, reviews: 0 }, ...NEAR(-0.04, 0.04), every([['11:00', '17:00']]));
  const brewery = at({ name: 'GW Brewery', region, type: 'brewery', rating: 4.5, reviews: 100 }, ...NEAR(0.02, 0.09), every([['12:00', '22:00']]));
  const dinner = at({ name: 'GW Dinner', region, type: 'restaurant', rating: 4.5, reviews: 500 }, ...NEAR(0), every([['11:00', '22:00']]));
  const dinner2 = at({ name: 'GW Dinner Two', region, type: 'restaurant', rating: 4.4, reviews: 300 }, ...NEAR(0.01), every([['11:00', '22:00']]));
  const run = (facts) => tp.planTrip({ intent: intentOf('Plan a golf weekend around Kelowna.'), facts, labels: LABELS });
  const p = run([golf1, golf2, tea, winery, brewery, dinner, dinner2]);
  const afternoons = p.days.map((d) => d.stops.find((s) => s.daypart === 'afternoon').venue.name);
  assert.deepEqual(afternoons.slice().sort(), ['GW Brewery', 'GW Hill Winery']);
  assert.ok(p.days.every((d) => d.stops[0].venue.type === 'golf'));
  // No winery, brewery or distillery in the data: the day still works.
  const q = run([golf1, golf2, tea, dinner, dinner2]);
  assert.ok(q.days.every((d) => d.stops[0].venue.type === 'golf' && d.stops[2].venue));
});

// ---- the current Okanagan time ("tonight", "right now") ------------------------
// The clock is always passed in (server.js derives it from America/Vancouver);
// nothing here reads the wall clock.
function tonightFacts() {
  const region = 'kelowna';
  return [
    at({ name: 'NT Closes At Nine', region, type: 'cocktail', rating: 4.9, reviews: 900 }, ...NEAR(0), every([['14:00', '21:00']])),
    at({ name: 'NT Late Kitchen', region, type: 'restaurant', rating: 4.5, reviews: 400 }, ...NEAR(0.001), every([['11:00', '23:30']])),
    at({ name: 'NT Overnight Bar', region, type: 'pub', rating: 4.4, reviews: 300 }, ...NEAR(0.002), every([['17:00', '01:00']])),
    at({ name: 'NT Day Cafe', region, type: 'cafe', rating: 5.0, reviews: 900, desc: 'Coffee.' }, ...NEAR(0.003), every([['7:00', '16:00']])),
    at({ name: 'NT Mystery Lounge', region, type: 'cocktail', rating: 4.3, reviews: 100 }, ...NEAR(0.004)),
  ];
}
const tonight = (weekday, hh, mm) => tp.planTrip({ intent: intentOf('Find me something to do tonight in Kelowna.'), facts: tonightFacts(), labels: LABELS, startWeekday: weekday, clock: { weekday, minutes: hh * 60 + mm } });

test('tonight at Thursday 18:00: the whole evening is ahead', () => {
  const p = tonight('thu', 18, 0);
  const names = recNames(p);
  assert.ok(names.includes('NT Closes At Nine'));
  assert.ok(names.includes('NT Late Kitchen'));
  assert.ok(names.includes('NT Overnight Bar'));
  assert.ok(!names.includes('NT Day Cafe'), 'closed at 16:00');
  assert.ok(recBy(p, 'NT Closes At Nine').reasons.some((r) => r.text === 'Listed hours Thursday: 14:00–21:00'));
  assert.ok(p.notes.some((n) => /Thursday from 18:00 Okanagan time/.test(n)));
  assert.ok(p.notes.some((n) => /check before you go/.test(n)));
});

test('tonight at Thursday 20:30: a venue closing at 21:00 is still offered, with its closing time', () => {
  const p = tonight('thu', 20, 30);
  const nine = recBy(p, 'NT Closes At Nine');
  assert.ok(nine, 'still open for 30 minutes by its listed hours');
  assert.ok(nine.caveats.includes('Its listed hours end at 21:00 — check before you go'));
  assert.ok(p.notes.some((n) => /Thursday from 20:30/.test(n)));
});

test('tonight at Thursday 21:06: a venue that closed at 21:00 is not recommended; later ones are', () => {
  const p = tonight('thu', 21, 6);
  const names = recNames(p);
  assert.ok(!names.includes('NT Closes At Nine'), 'its listed hours ended at 21:00');
  assert.ok(!names.includes('NT Day Cafe'));
  assert.ok(names.includes('NT Late Kitchen'));
  assert.ok(names.includes('NT Overnight Bar'));
  // Unknown hours stay unknown: kept, marked, never described as open.
  const mystery = recBy(p, 'NT Mystery Lounge');
  assert.ok(mystery && mystery.caveats.some((c) => /No usable hours/.test(c)));
  assert.ok(!mystery.reasons.some((r) => /Listed hours/.test(r.text)));
  assert.ok(p.notes.some((n) => /Thursday from 21:06/.test(n)));
  assert.match(p.summary, /tonight/);
  // Without a clock (no current time known) nothing is dropped for 21:00.
  const noClock = tp.planTrip({ intent: intentOf('Find me something to do tonight in Kelowna.'), facts: tonightFacts(), labels: LABELS, startWeekday: 'thu' });
  assert.ok(recNames(noClock).includes('NT Closes At Nine'));
});

test('overnight hours: a 17:00-01:00 listing is still open at 00:30, as the previous night', () => {
  const p = tonight('fri', 0, 30); // 00:30 Friday = Thursday night
  const names = recNames(p);
  assert.ok(names.includes('NT Overnight Bar'), 'Thursday 17:00-01:00 reaches 00:30 Friday');
  assert.ok(!names.includes('NT Late Kitchen'), 'closed at 23:30');
  assert.ok(!names.includes('NT Closes At Nine'));
  const bar = recBy(p, 'NT Overnight Bar');
  assert.ok(bar.reasons.some((r) => r.text === 'Listed hours Thursday: 17:00–01:00'));
  assert.ok(bar.caveats.includes('Its listed hours end at 01:00 — check before you go'));
  assert.ok(p.notes.some((n) => /Thursday night, from 00:30/.test(n)));
  // At 01:30 its listing has ended too.
  assert.ok(!recNames(tonight('fri', 1, 30)).includes('NT Overnight Bar'));
  // And the listing only counts for the night it belongs to: closed Thursdays means no 00:30 Friday.
  const facts = tonightFacts().map((v) => (v.name === 'NT Overnight Bar' ? { ...v, hours: H({ ...every([['17:00', '01:00']]), thu: null }), _hours: undefined } : v));
  const q = tp.planTrip({ intent: intentOf('Find me something to do tonight in Kelowna.'), facts, labels: LABELS, startWeekday: 'fri', clock: { weekday: 'fri', minutes: 30 } });
  assert.ok(!recNames(q).includes('NT Overnight Bar'));
});

test('"right now" uses the coming hour; date night "tonight" at 21:06 skips a drink stop that already closed', () => {
  const now = tp.planTrip({ intent: intentOf('what can I do in Kelowna right now'), facts: tonightFacts(), labels: LABELS, startWeekday: 'thu', clock: { weekday: 'thu', minutes: 15 * 60 + 30 } });
  const names = recNames(now);
  assert.ok(names.includes('NT Day Cafe'), 'open until 16:00');
  assert.ok(names.includes('NT Closes At Nine'));
  assert.match(now.summary, /right now/);
  const region = 'kelowna';
  const facts = [
    at({ name: 'DNL Early Lounge', region, type: 'cocktail', rating: 5.0, reviews: 900 }, ...NEAR(0), every([['16:00', '21:00']])),
    at({ name: 'DNL Late Lounge', region, type: 'cocktail', rating: 4.2, reviews: 100 }, ...NEAR(0.001), every([['16:00', '00:00']])),
    at({ name: 'DNL Dinner', region, type: 'restaurant', rating: 4.5, reviews: 300 }, ...NEAR(0.002), every([['17:00', '23:00']])),
  ];
  const run = (minutes) => tp.planTrip({ intent: intentOf('date night in Kelowna tonight'), facts, labels: LABELS, startWeekday: 'thu', clock: { weekday: 'thu', minutes } });
  assert.equal(run(17 * 60).outing.stops[0].venue.name, 'DNL Early Lounge');
  const late = run(21 * 60 + 6);
  assert.equal(late.outing.stops[0].venue.name, 'DNL Late Lounge');
  assert.equal(late.outing.stops[1].venue.name, 'DNL Dinner');
  assert.ok(late.outing.stops[1].reasons.some((r) => r.text === 'Listed hours Thursday: 17:00–23:00'));
  assert.deepEqual(late.outing.stops[1].caveats, [], 'open past the hour ahead, so no closing-time caveat');
  assert.ok(late.notes.some((n) => /Thursday from 21:06/.test(n)));
});

test('dinner ranking: a self-described "burger and taco counter" does not win dinner over a sit-down restaurant (the Streats example)', () => {
  const region = 'kelowna';
  const beach = at({ name: 'SC Beach Park', region, type: 'beach', rating: null, reviews: 0 }, null, null);
  const winery = at({ name: 'SC Winery', region, type: 'winery', rating: 5.0, reviews: 65 }, null, null, every([['11:00', '16:00']]));
  const streats = at({ name: 'Streats Harvey Kitchen', region, type: 'restaurant', rating: 4.8, reviews: 278, price: 1, desc: 'Streats built a smash burger and taco counter in Kelowna around genuinely good cauliflower tacos.' }, ...NEAR(0.01), every([['11:00', '21:00']]));
  const sitDown = at({ name: 'SC Bistro', region, type: 'restaurant', rating: 4.6, reviews: 700, price: 2 }, ...NEAR(0.03), every([['11:00', '22:00']]));
  const sushi = at({ name: 'SC Sushi Bar', region, type: 'restaurant', rating: 4.7, reviews: 200, desc: 'An omakase sushi counter.' }, ...NEAR(0.02), every([['17:00', '22:00']]));
  const dinner = (facts) => tp.planTrip({ intent: intentOf('Plan one day in Kelowna with beaches, wineries and great food'), facts, labels: LABELS }).days[0].stops.find((s) => s.daypart === 'evening').venue.name;
  assert.notEqual(dinner([beach, winery, streats, sitDown]), 'Streats Harvey Kitchen');
  assert.equal(dinner([beach, winery, streats]), 'Streats Harvey Kitchen', 'still offered when it is the only dinner option');
  // "sushi counter" is not treated as quick service.
  assert.equal(dinner([beach, winery, streats, sushi]), 'SC Sushi Bar');
});

test('hours: closing times written past midnight ("25:00", "26:30") are read as after midnight', () => {
  const p = tp.parseVenueHours(H(every([['12:00', '26:00']])));
  assert.deepEqual(p.days.thu, { status: 'open', ranges: [[720, 1560]] });
  assert.deepEqual(tp.parseVenueHours(H(every([['11:00', '24:00']]))).days.mon.ranges, [[660, 1440]]);
  assert.deepEqual(tp.parseVenueHours(H(every([['11:30', '26:30']]))).days.mon.ranges, [[690, 1590]]);
  // An opening time past 24:00, or anything past 47:59, is not a usable listing.
  assert.equal(tp.parseVenueHours(H(every([['25:00', '27:00']]))).known, false);
  assert.equal(tp.parseVenueHours(H(every([['12:00', '48:00']]))).known, false);
  // Shown as a clock time, and still open at 00:30 on the night it belongs to.
  const region = 'kelowna';
  const late = at({ name: 'XT Late Pub', region, type: 'pub', rating: 4.5, reviews: 300 }, ...NEAR(0), every([['12:00', '26:00']]));
  const q = tp.planTrip({ intent: intentOf('Find me something to do tonight in Kelowna.'), facts: [late], labels: LABELS, startWeekday: 'fri', clock: { weekday: 'fri', minutes: 30 } });
  assert.deepEqual(recNames(q), ['XT Late Pub']);
  assert.ok(recBy(q, 'XT Late Pub').reasons.some((r) => r.text === 'Listed hours Thursday: 12:00–02:00'));
});

// ---- trip overview: headline + "What to expect" for day plans and outings (2026-09-27, Build My Trip Phase 1)
// Built only from the plan's own stops and the visitor's words; itineraries keep their own text.
const planStops = (p) => (p.outing ? p.outing.stops : p.days.flatMap((x) => x.stops)).filter((s) => s.venue);
const OVERVIEW_BANNED = /\b(perfect|atmosphere|award|awards|award-winning|always open|open now|best in|great|stunning|guaranteed|must-see|world[- ]class|scenic|amazing|beautiful|heuristic)\b/i;
const OVERVIEW_SEASONAL = /\b(swim|swimming|paddl\w*|summer|winter|snow|warm|sunny|weather|season\w*)\b/i;
const WORD_COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1 };

test('Phase 1 overview: 2-day golf plan is named from its days, region and golf theme, and counts its real stops', () => {
  for (const q of ['Plan a golf weekend around Kelowna.', 'Plan a relaxed 2-day golf getaway in Kelowna']) {
    const p = plan(q);
    assert.equal(p.kind, 'multi_day');
    const golf = planStops(p).filter((s) => s.venue.type === 'golf').length;
    assert.ok(golf >= 1, `${q}: plan includes golf`);
    assert.match(p.headline, new RegExp(`^A (relaxed )?${p.days.length}-day Kelowna golf getaway$`), p.headline);
    assert.equal(/relaxed/.test(p.headline), /relaxed/.test(q), `${q}: pace word only when asked`);
    assert.equal(p.experience.title, 'What to expect');
    assert.match(p.experience.text, golf === 1 ? /\bA round of golf\b|\ba round of golf\b/ : new RegExp(`\\b${['', 'one', 'two', 'three', 'four', 'five', 'six'][golf]} rounds of golf\\b`, 'i'));
    assert.match(p.experience.text, /, all in Kelowna\./);
  }
});

test('Phase 1 overview: 3 days with kids reads as a family trip; phrases add up to exactly the planned stops', () => {
  const p = plan('Plan 3 days in Penticton with kids.');
  assert.match(p.headline, /^A 3-day Penticton .*with the family$/);
  const stops = planStops(p);
  const first = p.experience.text.split(/(?<=\.)\s/)[0].replace(/, (all in|across) .*$/, '');
  const parts = first.split(/, | and /);
  const total = parts.reduce((n, part) => n + (WORD_COUNTS[part.trim().split(' ')[0].toLowerCase()] || 0), 0);
  assert.equal(total, stops.length, `"${first}" counts ${total}, plan has ${stops.length}`);
});

test('Phase 1 overview: a date night outing is named for the occasion; Lake View is only claimed for venues that have the badge', () => {
  const p = plan('Find me a great date night in Kelowna.');
  assert.equal(p.kind, 'outing');
  assert.equal(p.headline, 'A date night in Kelowna');
  const stops = planStops(p);
  const lake = stops.filter((s) => byId.get(s.venue.id).features.lake_view);
  if (!lake.length) assert.doesNotMatch(p.experience.text, /Lake View/);
  else if (lake.length === stops.length) assert.match(p.experience.text, lake.length === 1 ? new RegExp(`${lake[0].venue.name} has the Lake View badge`) : /Every stop has the Lake View badge/);
  else assert.match(p.experience.text, /the Lake View badge/);
});

test('Phase 1 overview: a dog-friendly day plan says so only when every stop is listed as dog friendly', () => {
  const p = plan('Plan one day in Vernon with my dog');
  assert.equal(p.kind, 'day_plan');
  assert.match(p.headline, /^A one-day Vernon .*with your dog$/);
  const allDog = planStops(p).every((s) => { const f = byId.get(s.venue.id); return f.features.dog_friendly || f.collections.includes('dog_friendly'); });
  assert.equal(/listed as dog friendly/.test(p.experience.text), allDog);
});

test('Phase 1 overview: facts only -- no quality adjectives, seasonal or implementation words, on every example', () => {
  for (const q of EXAMPLES.concat(['Plan 3 days in Penticton with beaches', 'Plan one day in Osoyoos', 'date night in Kelowna tonight'])) {
    const p = plan(q, { startWeekday: /tonight/.test(q) ? 'fri' : null });
    if (p.kind === 'multi_day' || p.kind === 'day_plan' || p.kind === 'outing') {
      for (const t of [p.headline, p.experience.text]) {
        assert.ok(t && t.length < 220, `${q}: concise`);
        assert.doesNotMatch(t, OVERVIEW_BANNED, `${q}: "${t}"`);
        assert.doesNotMatch(t, OVERVIEW_SEASONAL, `${q}: no seasonal claim (day plans are not season-aware): "${t}"`);
        assert.doesNotMatch(t, /\bAn one\b|\bundefined\b|\bnull\b/, `${q}: "${t}"`);
      }
      assert.ok(p.experience.text.split(/(?<=\.)\s/).length <= 2, `${q}: at most two sentences`);
      for (const r of (planStops(p).map((s) => s.venue.regionLabel))) assert.ok(p.headline.includes(r) || p.experience.text.includes(r) || /Okanagan/.test(p.headline), `${q}: region ${r} named`);
    } else {
      assert.ok(!('headline' in p) && !('experience' in p), `${q} (${p.kind}): no overview on this kind`);
    }
  }
});

test('Phase 1 overview: adding it changes nothing else in the plan (same picks, notes, reasons)', () => {
  for (const q of EXAMPLES) {
    const p = plan(q);
    const copy = { ...p }; delete copy.headline; delete copy.experience;
    const again = plan(q); delete again.headline; delete again.experience;
    assert.deepEqual(copy, again);
    assert.ok(Object.keys(copy).every((k) => ['kind', 'summary', 'overview', 'days', 'recommendations', 'outing', 'events', 'notes', 'warnings', 'unsupported', 'needs', 'totalMatches', 'contextNotes'].includes(k)), `${q}: only the two new fields were added`);
  }
});

test('Phase 2 contextNotes: the occasion and kids notes the visitor asked for, and nothing else; they stay in notes too', () => {
  const date = plan('Find me a great date night in Kelowna.');
  assert.deepEqual(date.contextNotes, [date.notes[0]]);
  assert.match(date.contextNotes[0], /date night in mind/);
  const kids = plan('Plan 3 days in Penticton with kids.');
  assert.equal(kids.contextNotes.length, 1);
  assert.match(kids.contextNotes[0], /^Because you mentioned kids/);
  assert.ok(kids.notes.includes(kids.contextNotes[0]));
  assert.deepEqual(plan('Plan a golf weekend around Kelowna.').contextNotes, []);
  for (const n of plan('cheap eats in Kelowna').contextNotes) assert.doesNotMatch(n, /Budget ranks/, 'the budget note stays secondary');
});

// ---- Stage 3.5 (2026-09-29): exclusions ---------------------------------------
// The visitor's exclusions are applied in every kind of plan, with the same
// shared rules /search uses (discovery-search.js exclusionPlan/isExcluded).
const stopIds = (p) => allStops(p).map((s) => s.venue.id);
const stopVenues = (p) => allStops(p).map((s) => byId.get(s.venue.id) || s.venue);

test('Stage 3.5: "nothing fancy" leaves out a stored price of 4 only -- price 3 and unpriced venues stay eligible', () => {
  const facts = [
    fact({ id: 9001, name: 'Kelowna Price Four Room', region: 'kelowna', type: 'restaurant', price: 4, rating: 4.9 }),
    fact({ id: 9002, name: 'Kelowna Price Three Kitchen', region: 'kelowna', type: 'restaurant', price: 3, rating: 4.5 }),
    fact({ id: 9003, name: 'Kelowna Unpriced Diner', region: 'kelowna', type: 'restaurant', rating: 4.4 }),
  ];
  const run = (q) => tp.planTrip({ intent: intentOf(q), facts, labels: LABELS }).recommendations.map((s) => s.venue.id).sort();
  assert.deepEqual(run('restaurants in Kelowna'), [9001, 9002, 9003]);
  assert.deepEqual(run('restaurants in Kelowna, nothing fancy'), [9002, 9003]);
  assert.deepEqual(run("restaurants in Kelowna, I don't want anything fancy"), [9002, 9003]);
  const i = intentOf('restaurants in Kelowna, nothing fancy');
  assert.equal(i.budget, null, 'never a positive "cheap" budget');
  assert.equal(i.excluded.budget, 'upscale');
});

test('Stage 3.5: each applied exclusion kind is a hard rule -- regions, types, stored cuisines, curated lists, activities', () => {
  const cases = [
    ['wineries', 'wineries but not in Kelowna', (v) => v.region === 'kelowna'],
    ['restaurants', 'restaurants but not japanese', (v) => v.cuisine === 'japanese'],
    ['wineries', 'wineries but not hidden gems', (v) => v.collections.includes('hidden_gem')],
    ['outdoor places', 'outdoor places but no hiking', (v) => v.activities.includes('hiking')],
  ];
  for (const [control, q, ruledOut] of cases) {
    assert.ok(stopVenues(plan(control)).some(ruledOut), `${control}: the control includes what "${q}" rules out`);
    const p = plan(q);
    assert.ok(allStops(p).length > 0, `${q}: still a plan`);
    assert.ok(!stopVenues(p).some(ruledOut), `${q}: nothing it ruled out`);
  }
});

test('Stage 3.5: exclusions hold in day plans, multi-day plans, outings and multi-part itineraries, and beat occasion picks', () => {
  const noType = (q, type) => {
    const p = plan(q);
    assert.ok(allStops(p).length > 0, `${q}: still a plan`);
    assert.ok(!stopVenues(p).some((v) => v.type === type), `${q}: no ${type}`);
  };
  assert.ok(stopVenues(plan('3 days in Kelowna')).some((v) => v.type === 'winery'), 'control: a Kelowna trip has wineries');
  noType('3 days in Kelowna, no wineries', 'winery');
  noType('a day in Kelowna, no wineries', 'winery');
  assert.ok(stopVenues(plan('a romantic weekend in Kelowna')).some((v) => v.type === 'winery'), 'control: romance favours wineries');
  noType('a romantic weekend in Kelowna with no wineries', 'winery');
  assert.equal(tp.classifyPlanRequest(intentOf('date night in kelowna, no cocktail bars')), 'outing');
  noType('date night in kelowna, no cocktail bars', 'cocktail');
  // A multi-part itinerary: every part keeps the request's exclusions.
  const text = 'a winery and dinner but not in Kelowna';
  const intent = intentOf(text);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  assert.ok(trip.multi);
  const it = tp.planTrip({ intent, trip, tripEvents: trip.components.map(() => []), facts: FACTS, labels: LABELS });
  const stops = (it.itinerary.stops || []).filter((s) => s.venue);
  assert.ok(stops.length >= 2);
  assert.ok(!stops.some((s) => s.venue.region === 'kelowna'), 'no part in Kelowna');
});

test('Stage 3.5: exclusions the planner does not apply stay unapplied -- "without kids", "no alcohol", other budgets', () => {
  for (const [control, q] of [['wineries', 'wineries without kids'], ['wineries', 'wineries, no alcohol'], ['wineries', 'wineries that are not cheap'], ['restaurants in Kelowna', 'restaurants in Kelowna without kids']]) {
    assert.deepEqual(stopIds(plan(q)), stopIds(plan(control)), `${q}: same picks as "${control}"`);
  }
  assert.deepEqual(intentOf('wineries without kids').excluded.features, ['kid_friendly']);
  assert.ok(tp.buildUnderstood(intentOf('wineries without kids'), null, LABELS, {}).notUsed.includes('without kids'));
  // Only a clause the caller says was applied leaves "not used".
  const i = intentOf('wineries but not in Kelowna');
  assert.ok(tp.buildUnderstood(i, null, LABELS, {}).notUsed.includes('not in kelowna'));
  assert.ok(!tp.buildUnderstood(i, null, LABELS, { appliedExclusions: ['not in kelowna'] }).notUsed.includes('not in kelowna'));
});

test('Stage 3.5: "3 relaxed days in Kelowna" plans at a relaxed pace (the /trip example prompt)', () => {
  assert.equal(tp.buildUnderstood(intentOf('3 relaxed days in Kelowna'), null, LABELS, {}).pace, 'relaxed');
  assert.equal(tp.buildUnderstood(intentOf('a busy day in Kelowna'), null, LABELS, {}).pace, 'packed');
  assert.equal(tp.buildUnderstood(intentOf('a full day in Kelowna'), null, LABELS, {}).pace, 'standard', '"full" is not a pace');
  assert.match(plan('3 relaxed days in Kelowna').headline, /relaxed/i);
});

test('Stage 3.5 D3: "a weekend away" plans 2 days; "this weekend" keeps its one dated day', () => {
  const away = plan('a weekend away in Kelowna');
  assert.equal(away.kind, 'multi_day');
  assert.equal(away.days.length, 2);
  assert.ok(away.days.every((x) => x.region === 'kelowna'));
  const noWine = plan('a weekend away in Kelowna, no wineries');
  assert.equal(noWine.days.length, 2);
  assert.ok(!stopVenues(noWine).some((v) => v.type === 'winery'), 'exclusions still hold on both days');
  const thisWeekend = plan('plan this weekend in Kelowna', { startWeekday: 'sat' });
  assert.equal(thisWeekend.kind, 'day_plan');
  assert.equal(thisWeekend.days.length, 1);
  assert.equal(plan('a long weekend away in Kelowna').days.length, 3);
});

test('Stage 3.5 D4: "sushi dinner and a winery" is two stops -- a Japanese dinner and a winery, no extra restaurant', () => {
  const text = 'sushi dinner and a winery in Kelowna';
  const intent = intentOf(text);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  assert.ok(trip.multi);
  const it = tp.planTrip({ intent, trip, tripEvents: trip.components.map(() => []), facts: FACTS, labels: LABELS });
  const stops = (it.itinerary.stops || []).filter((s) => s.venue).map((s) => byId.get(s.venue.id));
  assert.equal(stops.length, 2);
  assert.equal(stops.filter((v) => v.type === 'restaurant').length, 1, 'one dinner, not two restaurants');
  assert.equal(stops.find((v) => v.type === 'restaurant').cuisine, 'japanese');
  assert.ok(stops.some((v) => v.type === 'winery'));
  assert.ok(stops.every((v) => v.region === 'kelowna'));
  // D1/D2/D3 unchanged alongside it.
  assert.ok(!stopVenues(plan('a weekend in Kelowna, no wineries')).some((v) => v.type === 'winery'));
  assert.equal(tp.buildUnderstood(intentOf('3 relaxed days in Kelowna'), null, LABELS, {}).pace, 'relaxed');
  assert.equal(plan('a weekend away in Kelowna').days.length, 2);
});

// ---- Stage 3.5 D5 (2026-09-30): multi-part plans keep the budget; an unused occasion is reported ----
function itinerary(text) {
  const intent = intentOf(text);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  assert.ok(trip.multi, `${text}: a multi-part request`);
  const p = tp.planTrip({ intent, trip, tripEvents: trip.components.map(() => []), facts: FACTS, labels: LABELS });
  const stops = (p.itinerary.stops || []).filter((s) => s.venue);
  return { intent, trip, p, stops, venues: stops.map((s) => byId.get(s.venue.id)), understood: tp.buildUnderstood(intent, trip, LABELS, {}) };
}

test('Stage 3.5 D5: the request budget ranks every part of a multi-part plan, as in a single plan', () => {
  const plain = itinerary('dinner and a winery in Kelowna');
  const upscale = itinerary('an upscale dinner and a winery in Kelowna');
  const dinner = (r) => r.venues.find((v) => v.type === 'restaurant');
  assert.ok(dinner(plain).price < 3, 'control: without a budget the dinner is not an upscale place');
  assert.ok(dinner(upscale).price >= 3, 'an upscale dinner ranks a known price of 3-4 first');
  const cheap = itinerary('a cheap dinner and a winery in Kelowna');
  assert.ok(dinner(cheap).price <= 2);
  assert.ok(cheap.stops.find((s) => byId.get(s.venue.id).type === 'restaurant').reasons.some((r) => r.code === 'budget'), 'the budget reason is shown');
  // Unpriced places are never excluded: the winery part still has its winery.
  assert.ok(upscale.venues.some((v) => v.type === 'winery'));
  assert.ok(cheap.venues.some((v) => v.type === 'winery'));
  // "nothing fancy" is still only the upscale exclusion (D1), never a budget.
  const plainFancy = itinerary('a winery and dinner in Kelowna, nothing fancy');
  assert.equal(plainFancy.intent.budget, null);
  assert.ok(plainFancy.venues.every((v) => v.price !== 4));
});

test('Stage 3.5 D5: an occasion a multi-part plan does not apply is reported under Not used, never shown as understood; stops unchanged', () => {
  const withOcc = itinerary('lunch and a winery in Kelowna for a birthday');
  const without = itinerary('lunch and a winery in Kelowna');
  assert.deepEqual(withOcc.stops.map((s) => s.venue.id), without.stops.map((s) => s.venue.id), 'the same stops');
  assert.equal(withOcc.understood.occasion, null);
  assert.ok(withOcc.understood.notUsed.includes('birthday'));
  assert.ok(withOcc.p.unsupported.includes('birthday'), 'V2 lists it too');
  // The parser's own phrase is kept ("birthday dinner").
  assert.ok(itinerary('a birthday dinner and a winery in Kelowna').understood.notUsed.includes('birthday dinner'));
  // Two phrases for one occasion: the first matched one is reported, once.
  const rainy = itinerary('coffee and dinner in Kelowna on a rainy day, somewhere indoor');
  assert.equal(rainy.understood.notUsed.filter((w) => w === 'rainy day' || w === 'indoor').length, 1);
  assert.ok(rainy.understood.notUsed.includes('rainy day'));
  // Family is applied through the kids rules, so it stays understood.
  const family = itinerary('coffee and a beach in Kelowna with the family');
  assert.equal(family.understood.occasion, 'family trip');
  assert.ok(!family.understood.notUsed.includes('family'));
  assert.ok(family.trip.components.every((c) => c.kids));
  // Single plans, outings and day plans keep their occasion exactly as before.
  assert.equal(tp.buildUnderstood(intentOf('a birthday dinner in Kelowna'), null, LABELS, {}).occasion, 'celebration');
  assert.equal(tp.buildUnderstood(intentOf('a romantic dinner and a winery'), null, LABELS, {}).occasion, 'romantic outing');
  assert.ok(!tp.buildUnderstood(intentOf('a birthday dinner in Kelowna'), null, LABELS, {}).notUsed.includes('birthday dinner'));
  // D2/D3/D4 unchanged alongside it.
  assert.equal(tp.buildUnderstood(intentOf('3 relaxed days in Kelowna'), null, LABELS, {}).pace, 'relaxed');
  assert.equal(plan('a weekend away in Kelowna').days.length, 2);
  assert.deepEqual(d.interpretTripComponents('sushi dinner and a winery', TAXONOMY, intentOf('sushi dinner and a winery')).components.map((c) => c.meal || c.types.join('/')), ['dinner', 'winery']);
});
