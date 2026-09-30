// Phase 1 (2026-09-25): the shared discovery-intent interpreter.
//
// PURE tests: this file never requires server.js or db.js (the server test
// file owns the throwaway okanagan.db, and node --test runs files in
// parallel). The taxonomy below mirrors the production values -- the same
// 20 regions, 10 types, 12 features, collection kinds, 9 activities, What's
// On presets/categories -- plus a handful of cuisines and venues, so every
// expectation here is about the interpreter, not about live data.

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');

const REGION_LABELS = {
  kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland', summerland: 'Summerland',
  penticton: 'Penticton', naramata: 'Naramata', 'lake-country': 'Lake Country', 'okanagan-falls': 'Okanagan Falls',
  oliver: 'Oliver', osoyoos: 'Osoyoos', vernon: 'Vernon', armstrong: 'Armstrong', coldstream: 'Coldstream',
  lumby: 'Lumby', enderby: 'Enderby', kaleden: 'Kaleden', apex: 'Apex', 'big-white': 'Big White',
  silverstar: 'SilverStar', baldy: 'Baldy',
};
const TAXONOMY = {
  regions: Object.keys(REGION_LABELS),
  regionLabels: REGION_LABELS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor'],
  features: ['dog_friendly', 'vegan', 'vegetarian', 'patio', 'kid_friendly', 'gluten_free', 'lake_view', 'nonalcoholic', 'sports_tv', 'live_music', 'great_groups', 'happy_hour'],
  collections: ['hidden_gem', 'local_favorite', 'dog_friendly', 'advisory', 'activity_hiking', 'fd_cafes'],
  activities: ['hiking', 'cycling', 'winter', 'camping', 'nature', 'water', 'viewpoints', 'adventure', 'fishing'],
  cuisines: ['italian', 'japanese', 'indian', 'mexican', 'pub', 'bbq', 'dessert', 'bubble tea', 'seafood', 'steakhouse'],
  budgets: ['budget', 'moderate', 'upscale'],
  paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'],
  eventCategories: ['events-festivals', 'live-music', 'sports-recreation', 'arts-culture', 'food-drink-events', 'markets-fairs', 'family-kids', 'nightlife', 'wineries-wine-events', 'holiday-seasonal', 'workshops-classes', 'community-events'],
  venues: [
    { id: 26, name: 'Antico Pizza Napoletana', region: 'kelowna', type: 'restaurant', slug: 'antico-pizza-napoletana' },
    { id: 1180, name: 'Rotary Beach Park', region: 'kelowna', type: 'beach', slug: 'rotary-beach-park' },
    { id: 1181, name: 'Rotary Beach Park', region: 'west-kelowna', type: 'beach', slug: 'rotary-beach-park' },
    { id: 1182, name: 'Rotary Beach Park', region: 'oliver', type: 'beach', slug: 'rotary-beach-park' },
    { id: 1267, name: 'Naramata Creek Park Waterfall Trail', region: 'naramata', type: 'outdoor', slug: 'naramata-creek-park-waterfall-trail' },
    { id: 891, name: 'Cactus Club Café', region: 'kelowna', type: 'restaurant', slug: 'cactus-club-cafe' },
  ],
};
const I = (text) => d.interpretDiscoveryQuery(text, TAXONOMY);

// Compare only the fields an expectation names; everything else is free.
function expectIntent(text, expected) {
  const got = I(text);
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'partyKids') assert.equal(got.party.kids, value, `${text}: party.kids`);
    else if (key === 'partyDog') assert.equal(got.party.dog, value, `${text}: party.dog`);
    else assert.deepEqual(got[key], value, `${text}: ${key}`);
  }
  return got;
}

// ---- the 8 Build My Trip prompts ---------------------------------------
test('Build My Trip example prompts: each maps to the approved intent', () => {
  expectIntent('Plan a relaxed 3-day trip around Kelowna with wine and hidden gems.', { mode: 'plan', regions: ['kelowna'], types: ['winery'], collections: ['hidden_gem'], days: 3, pace: 'relaxed', confidence: 'high', needs: [] });
  expectIntent('Find me a great date night in Kelowna.', { mode: 'recommend', regions: ['kelowna'], occasion: 'date_night', superlative: true, confidence: 'high' });
  expectIntent('Where can I get the best poutine in the Okanagan?', { mode: 'recommend', regions: [], textTerms: ['poutine'], superlative: true, confidence: 'medium' });
  expectIntent('Plan 3 days in Penticton with kids.', { mode: 'plan', regions: ['penticton'], days: 3, features: ['kid_friendly'], partyKids: true, confidence: 'high' });
  expectIntent('What should I do in Vernon with my dog?', { mode: 'find', regions: ['vernon'], features: ['dog_friendly'], partyDog: true, confidence: 'high' });
  expectIntent('Find me a romantic winery and dinner.', {
    mode: 'recommend', types: ['winery', 'restaurant'], occasion: 'romantic',
    structure: [{ types: ['winery'], daypart: 'afternoon' }, { types: ['restaurant'], daypart: 'evening' }],
    needs: ['region'], confidence: 'medium',
  });
  expectIntent('What can we do around Penticton if it rains?', { mode: 'find', regions: ['penticton'], occasion: 'rainy_day', confidence: 'high' });
  expectIntent('Plan a golf weekend around Kelowna.', { mode: 'plan', regions: ['kelowna'], types: ['golf'], days: 2, confidence: 'high' });
});

// ---- the 9 Hero Search queries ------------------------------------------
test('Hero Search example queries: each maps to the approved intent', () => {
  expectIntent('restaurants in Kelowna', { mode: 'find', regions: ['kelowna'], types: ['restaurant'], confidence: 'high' });
  expectIntent('dog friendly', { mode: 'find', features: ['dog_friendly'], confidence: 'high' });
  expectIntent('beaches in Penticton', { mode: 'find', regions: ['penticton'], types: ['beach'], confidence: 'high' });
  expectIntent('golf Kelowna', { mode: 'find', regions: ['kelowna'], types: ['golf'], confidence: 'high' });
  expectIntent('wineries in Naramata', { mode: 'find', regions: ['naramata'], types: ['winery'], confidence: 'high' });
  expectIntent('poutine', { mode: 'find', textTerms: ['poutine'], confidence: 'medium' });
  expectIntent('hidden gems', { mode: 'find', collections: ['hidden_gem'], confidence: 'high' });
  expectIntent('things to do with kids in Penticton', { mode: 'find', regions: ['penticton'], features: ['kid_friendly'], textTerms: [], confidence: 'high' });
  expectIntent('events this weekend', { mode: 'events', when: { preset: 'this-weekend' }, types: [], confidence: 'high' });
});

// ---- regions --------------------------------------------------------------
test('regions: every region label and slug is recognised', () => {
  for (const [slug, label] of Object.entries(REGION_LABELS)) {
    assert.deepEqual(I(`restaurants in ${label}`).regions, [slug], label);
    assert.deepEqual(I(`restaurants in ${slug.replace(/-/g, ' ')}`).regions, [slug], slug);
  }
});
test('regions: longest match wins, extra names and valley-wide scope', () => {
  assert.deepEqual(I('cafes in West Kelowna').regions, ['west-kelowna']);
  assert.deepEqual(I('wineries in westbank').regions, ['west-kelowna']);
  assert.deepEqual(I('ok falls beaches').regions, ['okanagan-falls']);
  assert.deepEqual(I('Okanagan Falls wineries').regions, ['okanagan-falls']);
  assert.deepEqual(I('silver star skiing').regions, ['silverstar']);
  assert.deepEqual(I('oyama cafes').regions, ['lake-country']);
  const valley = I('wineries in the Okanagan valley');
  assert.deepEqual(valley.regions, []);
  assert.ok(valley.matched.some((m) => m.field === 'scope' && m.value === 'valley'));
  assert.deepEqual(I('Kelowna or Penticton restaurants').regions, ['kelowna', 'penticton']);
});

// ---- types -----------------------------------------------------------------
test('types: all 10 categories, singular/plural and natural words', () => {
  const cases = {
    restaurant: ['restaurants', 'restaurant', 'dinner', 'lunch', 'places to eat'],
    cafe: ['cafe', 'cafes', 'café', 'coffee'],
    pub: ['pubs', 'bar'],
    cocktail: ['cocktail bars', 'cocktails', 'lounge'],
    brewery: ['breweries', 'craft beer', 'taproom'],
    distillery: ['distilleries', 'gin'],
    winery: ['wineries', 'wine', 'vineyards', 'wine tasting'],
    golf: ['golf', 'golf courses', 'tee times'],
    beach: ['beaches', 'swimming', 'beach'],
    outdoor: ['parks', 'outdoors'],
  };
  for (const [type, phrases] of Object.entries(cases)) for (const p of phrases) assert.deepEqual(I(p).types, [type], p);
  assert.deepEqual(I('food and drink in Naramata').types, ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery']);
});

// ---- features ----------------------------------------------------------------
test('features: all 12 badge features, including hyphen/space variants', () => {
  const cases = {
    dog_friendly: ['dog-friendly', 'dog friendly', 'pet friendly', 'with my dog'],
    kid_friendly: ['kid friendly', 'with kids', 'family friendly', 'children'],
    vegan: ['vegan', 'plant based'],
    vegetarian: ['vegetarian'],
    gluten_free: ['gluten-free', 'gluten free', 'celiac'],
    patio: ['patio', 'outdoor seating'],
    lake_view: ['lake view', 'lakeview'],
    nonalcoholic: ['non-alcoholic', 'mocktails'],
    sports_tv: ['watch the game', 'sports tv'],
    live_music: ['live music', 'live band'],
    great_groups: ['great for groups', 'large groups'],
    happy_hour: ['happy hour'],
  };
  for (const [feature, phrases] of Object.entries(cases)) for (const p of phrases) assert.ok(I(p).features.includes(feature), `${p} -> ${feature}`);
  const sportsBar = I('sports bar in Vernon');
  assert.deepEqual(sportsBar.types, ['pub']);
  assert.deepEqual(sportsBar.features, ['sports_tv']);
});

// ---- collections -------------------------------------------------------------
test('collections: editorial kinds only, never operational or structural kinds', () => {
  assert.deepEqual(I('hidden gems in Kelowna').collections, ['hidden_gem']);
  assert.deepEqual(I('secret spots').collections, ['hidden_gem']);
  assert.deepEqual(I('off the beaten path').collections, ['hidden_gem']);
  assert.deepEqual(I('local favourites in Vernon').collections, ['local_favorite']);
  assert.deepEqual(I('local favorites').collections, ['local_favorite']);
  // The dog-beach collection only when a dog AND beaches are both asked for.
  assert.deepEqual(I('dog beaches').collections, ['dog_friendly']);
  assert.deepEqual(I('beaches for my dog in Kelowna').collections, ['dog_friendly']);
  assert.deepEqual(I('dog friendly restaurants').collections, []);
  for (const q of ['advisory', 'fd cafes', 'activity hiking']) assert.ok(!I(q).collections.some((k) => !['hidden_gem', 'local_favorite', 'dog_friendly'].includes(k)), q);
  // A collection that does not exist live is never produced.
  const noGems = d.interpretDiscoveryQuery('hidden gems', { ...TAXONOMY, collections: ['local_favorite'] });
  assert.deepEqual(noGems.collections, []);
});

// ---- cuisine + text terms ------------------------------------------------------
test('cuisine: only real cuisine values; dishes stay as the visitor\'s own words', () => {
  assert.deepEqual(I('italian restaurants in Kelowna').cuisines, ['italian']);
  assert.deepEqual(I('sushi').cuisines, ['japanese']);
  assert.deepEqual(I('ice cream in Penticton').cuisines, ['dessert']);
  assert.deepEqual(I('bubble tea').cuisines, ['bubble tea']);
  // "pub" is a cuisine value AND a venue type: it is only ever the type.
  const pub = I('pub in Vernon');
  assert.deepEqual(pub.types, ['pub']);
  assert.deepEqual(pub.cuisines, []);
  // Not a cuisine in the data -> a text term, never an invented cuisine.
  for (const [q, term] of [['poutine', 'poutine'], ['best tacos in Oliver', 'tacos'], ['ramen', null]]) {
    const i = I(q);
    if (term) { assert.deepEqual(i.textTerms, [term], q); assert.deepEqual(i.cuisines, [], q); }
  }
  const ramenWithoutJapanese = d.interpretDiscoveryQuery('ramen', { ...TAXONOMY, cuisines: ['italian'] });
  assert.deepEqual(ramenWithoutJapanese.cuisines, []);
  assert.deepEqual(ramenWithoutJapanese.textTerms, ['ramen']);
});

// ---- budget --------------------------------------------------------------------
test('budget: mapped, conflicting mentions recorded, and always a ranking hint', () => {
  assert.equal(I('cheap eats in Kelowna').budget, 'budget');
  assert.equal(I('mid-range dinner').budget, 'moderate');
  const fancy = I('fine dining in Kelowna');
  assert.equal(fancy.budget, 'upscale');
  assert.deepEqual(fancy.types, ['restaurant']);
  assert.ok(fancy.heuristics.some((h) => h.field === 'budget' && /never excluded/.test(h.note)));
  const conflict = I('cheap fine dining');
  assert.equal(conflict.budget, 'upscale', 'the last mention wins');
  assert.deepEqual(conflict.conflicts, [{ field: 'budget', values: ['budget', 'upscale'] }]);
  assert.equal(conflict.confidence, 'medium');
});

// ---- trip length -----------------------------------------------------------------
test('trip length: digits, words, adjectives, weekends, weeks and out-of-range', () => {
  const cases = [['3 days in Kelowna', 3], ['three days in Kelowna', 3], ['a 3-day Kelowna trip', 3], ['3 relaxed days in Kelowna', 3],
    ['a weekend in Kelowna', 2], ['a long weekend in Penticton', 3], ['a week in Vernon', 7], ['one day in Kelowna', 1], ['2 nights in Osoyoos', 3]];
  for (const [q, days] of cases) { const i = I(q); assert.equal(i.days, days, q); assert.equal(i.mode, 'plan', q); }
  const tooLong = I('10 days in Kelowna');
  assert.equal(tooLong.days, null);
  assert.equal(tooLong.mode, 'plan');
  assert.deepEqual(tooLong.needs, ['days']);
  assert.ok(tooLong.unsupported.some((u) => /10 days/.test(u)));
  assert.equal(I('I ate 3 apples that day').days, null, 'a number near "day" is not a trip length');
});

// ---- pace ---------------------------------------------------------------------------
test('pace: relaxed / standard / packed, with conflicts recorded', () => {
  assert.equal(I('a relaxed trip to Kelowna').pace, 'relaxed');
  assert.equal(I('a slower pace in Penticton').pace, 'relaxed');
  assert.equal(I('a moderate pace trip').pace, 'standard');
  assert.equal(I('a packed 2 day trip in Vernon').pace, 'packed');
  assert.deepEqual(I('relaxed but packed days').conflicts, [{ field: 'pace', values: ['relaxed', 'packed'] }]);
});

// ---- dates -----------------------------------------------------------------------------
test('dates: presets, tonight, tomorrow and weekdays; unsupported date phrases reported', () => {
  assert.deepEqual(I('events this weekend').when, { preset: 'this-weekend' });
  assert.deepEqual(I('what is happening today').when, { preset: 'today' });
  assert.deepEqual(I('live music tonight in Kelowna').when, { preset: 'today', daypart: 'evening' });
  assert.deepEqual(I('concerts this week').when, { preset: 'this-week' });
  assert.deepEqual(I('festivals this month').when, { preset: 'this-month' });
  assert.deepEqual(I('events tomorrow').when, { relative: 'tomorrow' });
  assert.deepEqual(I('something happening Saturday night in Kelowna').when, { weekday: 'saturday', daypart: 'evening' });
  for (const q of ['events next weekend', 'festivals in July']) assert.ok(I(q).unsupported.length > 0, q);
  // "this weekend" is a date; "a weekend" is a trip length.
  assert.equal(I('events this weekend').days, null);
  assert.equal(I('a weekend in Kelowna').when, null);
});

// ---- outdoor activities ------------------------------------------------------------------
test('outdoor activities: all 9, only when the activity exists', () => {
  const cases = { hiking: 'hiking in Vernon', cycling: 'mountain biking', winter: 'snowshoeing at Apex', camping: 'camping near Lumby',
    nature: 'bird watching', water: 'kayaking on Skaha', viewpoints: 'scenic viewpoints', adventure: 'ziplining', fishing: 'fishing in Peachland' };
  for (const [slug, q] of Object.entries(cases)) assert.deepEqual(I(q).activities, [slug], q);
  assert.deepEqual(d.interpretDiscoveryQuery('hiking', { ...TAXONOMY, activities: ['cycling'] }).activities, []);
});

// ---- occasions (heuristics) ----------------------------------------------------------------
test('occasions: date night, romantic, rainy day and family are flagged as heuristics', () => {
  for (const [q, occasion] of [['date night in Kelowna', 'date_night'], ['a romantic dinner', 'romantic'], ['anniversary dinner in Naramata', 'romantic'],
    ['rainy day in Vernon', 'rainy_day'], ['indoor things to do in Penticton', 'rainy_day'], ['family day in Summerland', 'family']]) {
    const i = I(q);
    assert.equal(i.occasion, occasion, q);
    const note = i.heuristics.find((h) => h.field === 'occasion');
    assert.ok(note && /Heuristic/.test(note.note), `${q} carries a heuristic note`);
  }
  // Family is a heuristic; only an explicit kid phrase sets the verified badge filter.
  const family = I('family day in Summerland');
  assert.deepEqual(family.features, []);
  assert.equal(family.party.kids, false);
  assert.ok(/does not track weather/.test(I('rainy day in Vernon').heuristics[0].note));
});

// ---- events -------------------------------------------------------------------------------
test('events: routed as events, with categories, and never selecting venues', () => {
  const wine = expectIntent('wine events this weekend in Penticton', { mode: 'events', regions: ['penticton'], eventCategories: ['wineries-wine-events'], types: [], when: { preset: 'this-weekend' } });
  assert.equal(wine.confidence, 'high');
  expectIntent('food festival', { mode: 'events', eventCategories: ['food-drink-events'] });
  expectIntent("what's on in Kelowna", { mode: 'events', regions: ['kelowna'] });
  expectIntent('kids events in Vernon', { mode: 'events', eventCategories: ['family-kids'], features: [], partyKids: false });
  expectIntent('farmers markets this weekend', { mode: 'events', eventCategories: ['markets-fairs'] });
  // Outside an events request, event words never leak into event categories.
  expectIntent('live music bars in Kelowna', { mode: 'find', features: ['live_music'], eventCategories: [] });
  // "show me" is a verb, not an event.
  expectIntent('show me cafes in West Kelowna', { mode: 'find', types: ['cafe'], regions: ['west-kelowna'] });
});

// ---- navigation to an exact venue ----------------------------------------------------------
test('exact venue names: whole-query match only, ambiguity reported, region narrows', () => {
  expectIntent('Antico Pizza Napoletana', { mode: 'navigate', exactVenue: { id: 26, region: 'kelowna', type: 'restaurant', slug: 'antico-pizza-napoletana' }, confidence: 'high' });
  expectIntent('cactus club cafe', { mode: 'navigate', exactVenue: { id: 891, region: 'kelowna', type: 'restaurant', slug: 'cactus-club-cafe' } });
  const rotary = I('Rotary Beach Park');
  assert.equal(rotary.exactVenue, null);
  assert.deepEqual(rotary.ambiguities[0].options, [1180, 1181, 1182]);
  assert.notEqual(rotary.confidence, 'high');
  expectIntent('rotary beach park oliver', { mode: 'navigate', exactVenue: { id: 1182, region: 'oliver', type: 'beach', slug: 'rotary-beach-park' } });
  expectIntent('West Kelowna Rotary Beach Park', { mode: 'navigate', exactVenue: { id: 1181, region: 'west-kelowna', type: 'beach', slug: 'rotary-beach-park' } });
  // A venue whose name contains a region word is still that venue, not a region query.
  expectIntent('Naramata Creek Park Waterfall Trail', { mode: 'navigate', regions: [] });
  // A partial name is not a navigation.
  assert.equal(I('antico').exactVenue, null);
  // The interpreter never returns a URL for the venue.
  assert.ok(!JSON.stringify(I('Antico Pizza Napoletana')).includes('http'));
});

// ---- unsupported / ambiguous / conflicting ----------------------------------------------------
test('unsupported concepts are reported, never approximated', () => {
  for (const [q, term] of [['wheelchair accessible wineries', 'wheelchair accessible'], ['a helicopter tour', 'helicopter tour'],
    ['restaurants open now', 'open now'], ['hotels in Kelowna', 'hotels'], ['michelin star dinner', 'michelin star']]) {
    const i = I(q);
    assert.ok(i.unsupported.includes(term), `${q} -> ${term}`);
    assert.notEqual(i.confidence, 'high', q);
  }
  const wine = I('wheelchair accessible wineries');
  assert.deepEqual(wine.types, ['winery'], 'the supported part is still understood');
});
test('gibberish and empty input are low confidence with no invented values', () => {
  for (const q of ['', '   ', '???', 'asdkjfh qwepoiu zxcvb']) {
    const i = I(q);
    assert.equal(i.confidence, 'low', JSON.stringify(q));
    assert.deepEqual([i.regions, i.types, i.features, i.collections, i.activities, i.cuisines], [[], [], [], [], [], []], q);
  }
  assert.equal(I('').mode, 'unknown');
  assert.equal(I(42).mode, 'unknown');
});
test('multi-intent requests keep every part in order', () => {
  const i = I('Find me a romantic winery and dinner.');
  assert.deepEqual(i.structure.map((s) => s.types[0]), ['winery', 'restaurant']);
  const combo = I('patio restaurants and craft beer in Penticton with my dog');
  assert.deepEqual(combo.types, ['restaurant', 'brewery']);
  assert.deepEqual(combo.features.sort(), ['dog_friendly', 'patio']);
});

// ---- grounding: nothing outside the taxonomy, ever ------------------------------------------------
const ALL_QUERIES = [
  'Plan a relaxed 3-day trip around Kelowna with wine and hidden gems.', 'Find me a great date night in Kelowna.',
  'Where can I get the best poutine in the Okanagan?', 'Plan 3 days in Penticton with kids.', 'What should I do in Vernon with my dog?',
  'Find me a romantic winery and dinner.', 'What can we do around Penticton if it rains?', 'Plan a golf weekend around Kelowna.',
  'restaurants in Kelowna', 'dog friendly', 'beaches in Penticton', 'golf Kelowna', 'wineries in Naramata', 'poutine', 'hidden gems',
  'things to do with kids in Penticton', 'events this weekend', 'cheap fine dining', 'Rotary Beach Park', 'wine events this weekend in Penticton',
  'hiking and fishing near Peachland', 'sushi in West Kelowna with a patio', 'a helicopter tour', 'asdkjfh qwepoiu zxcvb',
];
test('grounding: every produced value comes from the taxonomy or the visitor\'s own words', () => {
  for (const q of ALL_QUERIES) {
    const i = I(q);
    const tokens = new Set(d.normalizeDiscoveryText(q).split(' '));
    assert.ok(d.DISCOVERY_MODES.includes(i.mode), q);
    for (const r of i.regions) assert.ok(TAXONOMY.regions.includes(r), `${q}: region ${r}`);
    for (const x of i.types) assert.ok(TAXONOMY.types.includes(x), `${q}: type ${x}`);
    for (const x of i.features) assert.ok(TAXONOMY.features.includes(x), `${q}: feature ${x}`);
    for (const x of i.collections) assert.ok(d.DISCOVERY_COLLECTION_KINDS.includes(x) && TAXONOMY.collections.includes(x), `${q}: collection ${x}`);
    for (const x of i.activities) assert.ok(TAXONOMY.activities.includes(x), `${q}: activity ${x}`);
    for (const x of i.cuisines) assert.ok(TAXONOMY.cuisines.includes(x), `${q}: cuisine ${x}`);
    for (const x of i.eventCategories) assert.ok(TAXONOMY.eventCategories.includes(x), `${q}: event category ${x}`);
    for (const x of i.textTerms) assert.ok(tokens.has(x), `${q}: text term ${x} is the visitor's word`);
    if (i.exactVenue) assert.ok(TAXONOMY.venues.some((v) => v.id === i.exactVenue.id), `${q}: venue id from the taxonomy`);
    assert.ok(!/https?:|\/\w+\/\w+\//.test(JSON.stringify(i)), `${q}: no URLs`);
    for (const forbidden of ['url', 'price', 'rating', 'events', 'venues', 'name', 'id']) assert.ok(!(forbidden in i), `${q}: no ${forbidden} field`);
  }
});
test('the interpreter is deterministic', () => {
  for (const q of ALL_QUERIES) assert.deepEqual(I(q), I(q), q);
});

// ---- validation: the future AI boundary --------------------------------------------------------------
test('validation keeps a well-formed candidate that the text supports', () => {
  const text = 'a relaxed weekend of wine in Kelowna';
  const { intent, rejected } = d.validateDiscoveryIntent({ mode: 'plan', regions: ['kelowna'], types: ['winery'], days: 2, pace: 'relaxed' }, TAXONOMY, text);
  assert.deepEqual(rejected, []);
  assert.equal(intent.mode, 'plan');
  assert.deepEqual(intent.regions, ['kelowna']);
  assert.deepEqual(intent.types, ['winery']);
  assert.equal(intent.days, 2);
  assert.equal(intent.source, 'ai');
});
test('validation rejects invented enum values', () => {
  const { intent, rejected } = d.validateDiscoveryIntent({
    mode: 'teleport', regions: ['vancouver'], types: ['museum', 'winery'], features: ['wheelchair'], collections: ['michelin'],
    activities: ['surfing'], cuisines: ['martian'], budget: 'free', pace: 'warp', occasion: 'wedding', eventCategories: ['raves'], days: 12,
    when: { preset: 'next-year' },
  }, TAXONOMY, 'wine');
  assert.equal(intent.mode, 'unknown');
  assert.deepEqual([intent.regions, intent.features, intent.collections, intent.activities, intent.cuisines, intent.eventCategories], [[], [], [], [], [], []]);
  assert.deepEqual(intent.types, ['winery']);
  assert.equal(intent.budget, null);
  assert.equal(intent.pace, null);
  assert.equal(intent.occasion, null);
  assert.equal(intent.days, null);
  assert.equal(intent.when, null);
  for (const field of ['mode', 'regions', 'types', 'features', 'collections', 'activities', 'cuisines', 'budget', 'pace', 'occasion', 'days', 'when']) {
    assert.ok(rejected.some((r) => r.field === field), `${field} rejection recorded`);
  }
});
test('validation rejects invented ids, urls, prices, ratings, venues and events', () => {
  const { intent, rejected } = d.validateDiscoveryIntent({
    mode: 'recommend', types: ['restaurant'],
    venueIds: [26, 999999], urls: ['https://example.com/best-poutine'], price: 2, rating: 4.9,
    venues: [{ name: 'Invented Bistro' }], events: [{ name: 'Fake Fest' }], exactVenue: { id: 26 }, id: 7,
  }, TAXONOMY, 'restaurant');
  for (const field of ['venueIds', 'urls', 'price', 'rating', 'venues', 'events', 'id']) assert.ok(rejected.some((r) => r.field === field && r.reason === 'unknown_field'), field);
  assert.ok(rejected.some((r) => r.field === 'exactVenue' && r.reason === 'only_deterministic_name_match'));
  assert.equal(intent.exactVenue, null);
  const json = JSON.stringify(intent);
  for (const s of ['Invented Bistro', 'Fake Fest', 'example.com', '999999', '4.9']) assert.ok(!json.includes(s), s);
});
test('validation removes values the visitor never said', () => {
  const text = 'somewhere nice for dinner';
  const { intent, rejected } = d.validateDiscoveryIntent({
    mode: 'recommend', regions: ['kelowna'], types: ['restaurant'], cuisines: ['italian'], textTerms: ['poutine', 'dinner'],
    unsupported: ['helicopter'], party: { kids: true, dog: true },
  }, TAXONOMY, text);
  assert.deepEqual(intent.regions, [], 'a region the visitor never mentioned is dropped');
  assert.deepEqual(intent.cuisines, [], 'a cuisine the visitor never mentioned is dropped');
  assert.deepEqual(intent.textTerms, ['dinner'], 'only text terms that are the visitor\'s words survive');
  assert.deepEqual(intent.unsupported, [], 'unsupported echoes must also be the visitor\'s words');
  assert.equal(intent.party.kids, false);
  assert.equal(intent.party.dog, false);
  for (const field of ['regions', 'cuisines', 'textTerms', 'unsupported']) assert.ok(rejected.some((r) => r.field === field && r.reason === 'not_in_text'), field);
});
test('validation: events candidates never carry venue selection; confidence is recomputed locally', () => {
  const { intent, rejected } = d.validateDiscoveryIntent({ mode: 'events', types: ['winery'], eventCategories: ['wineries-wine-events'], confidence: 'high', needs: [] }, TAXONOMY, 'wine events');
  assert.deepEqual(intent.types, []);
  assert.deepEqual(intent.eventCategories, ['wineries-wine-events']);
  assert.ok(rejected.some((r) => r.reason === 'events_never_select_venues'));
  const plan = d.validateDiscoveryIntent({ mode: 'plan', confidence: 'high' }, TAXONOMY, 'plan a trip').intent;
  assert.deepEqual(plan.needs, ['region', 'days']);
  assert.notEqual(plan.confidence, 'high', 'a candidate cannot vouch for its own confidence');
  assert.deepEqual(d.validateDiscoveryIntent(null, TAXONOMY, 'x').rejected[0], { field: '*', reason: 'not_an_object' });
  assert.deepEqual(d.validateDiscoveryIntent([], TAXONOMY, 'x').rejected[0], { field: '*', reason: 'not_an_object' });
});

// ---- input safety -------------------------------------------------------------------------------------
test('input normalisation: case, punctuation, accents, hyphens and length cap', () => {
  assert.equal(d.normalizeDiscoveryText('  Dog-Friendly CAFÉS!!  in   West-Kelowna? '), 'dog friendly cafes in west kelowna');
  assert.equal(d.normalizeDiscoveryText("What's on"), 'whats on');
  assert.equal(d.normalizeDiscoveryText('Fish & chips'), 'fish and chips');
  assert.ok(d.normalizeDiscoveryText('a'.repeat(5000)).length <= d.DISCOVERY_MAX_TEXT_LENGTH);
  assert.equal(d.normalizeDiscoveryText(null), '');
  assert.doesNotThrow(() => I('<script>alert(1)</script> wineries'));
  assert.deepEqual(I('<script>alert(1)</script> wineries').types, ['winery']);
});

test('times of day: "tomorrow morning", "Friday night", "Saturday afternoon", "this morning"; never a search term', () => {
  assert.deepEqual(I('coffee in Kelowna tomorrow morning').when, { relative: 'tomorrow', daypart: 'morning' });
  assert.deepEqual(I('dinner in Kelowna Friday night').when, { weekday: 'friday', daypart: 'evening' });
  assert.deepEqual(I('wineries in Kelowna Saturday afternoon').when, { weekday: 'saturday', daypart: 'afternoon' });
  assert.deepEqual(I('restaurants in Kelowna this morning').when, { preset: 'today', daypart: 'morning' });
  assert.deepEqual(I('cafes in Kelowna this afternoon').when, { preset: 'today', daypart: 'afternoon' });
  assert.deepEqual(I('pubs in Kelowna this evening').when, { preset: 'today', daypart: 'evening' });
  for (const q of ['coffee in Kelowna tomorrow morning', 'wineries Saturday afternoon', 'drinks tomorrow evening']) {
    const i = I(q);
    assert.deepEqual(i.textTerms, [], q);
    assert.deepEqual(i.foodTerms, [], q);
  }
  // A time of day with no day is not turned into a date.
  assert.equal(I('a morning hike in Vernon').when, null);
  assert.equal(I('date night in Kelowna').when, null);
  assert.equal(I('date night in Kelowna').occasion, 'date_night');
  assert.equal(I('2 nights in Kelowna').days, 3);
});

test('"right now" is the current time today; "open now" stays unsupported', () => {
  assert.deepEqual(I('what can I do in Kelowna right now').when, { preset: 'today', now: true });
  assert.deepEqual(I('what can I do in Kelowna right now').textTerms, []);
  assert.ok(I('restaurants open now in Kelowna').unsupported.includes('open now'));
});

// ==== Stage 3.1 (2026-09-29): polarity, filler words, plural-tolerant aliases ====
const EMPTY_EXCLUDED = { regions: [], types: [], features: [], collections: [], activities: [], cuisines: [], textTerms: [], budget: null, phrases: [] };
const WITH_PIZZA = { ...TAXONOMY, cuisines: [...TAXONOMY.cuisines, 'pizza'] };
const LIST_FIELDS = ['regions', 'types', 'features', 'collections', 'activities', 'cuisines', 'textTerms'];
// A negated value is never also a positive one.
function assertDisjoint(intent, text) {
  for (const f of LIST_FIELDS) {
    const both = intent[f].filter((v) => intent.excluded[f].includes(v));
    assert.deepEqual(both, [], `${text}: ${f} both wanted and excluded`);
  }
  if (intent.excluded.budget) assert.notEqual(intent.budget, intent.excluded.budget, `${text}: budget both wanted and excluded`);
}

test('Stage 3.1 contract: intent.excluded is additive, always present, and empty for a positive request', () => {
  const i = I('wineries in Kelowna');
  assert.deepEqual(i.excluded, EMPTY_EXCLUDED);
  assert.deepEqual(i.types, ['winery']);
  assert.deepEqual(i.regions, ['kelowna']);
  assert.deepEqual(i.unsupported, []);
  assert.deepEqual(I('').excluded, EMPTY_EXCLUDED);
  assert.equal(i.version, 1, 'additive change: the intent version is unchanged');
});

test('Stage 3.1 negation: "not wineries" excludes wineries and wants nothing', () => {
  const i = I('not wineries');
  assert.deepEqual(i.excluded, { ...EMPTY_EXCLUDED, types: ['winery'], phrases: ['not wineries'] });
  assert.deepEqual(i.types, []);
  assert.equal(i.mode, 'unknown');
  assert.deepEqual(i.unsupported, ['not wineries'], 'reported as not applied until exclusions are applied downstream');
});

test('Stage 3.1 negation: "no breweries" (and "no breweries or pubs") exclude those types; "no" is never a search word', () => {
  const i = I('no breweries');
  assert.deepEqual(i.excluded.types, ['brewery']);
  assert.deepEqual(i.types, []);
  assert.deepEqual(i.textTerms, []);
  assert.deepEqual(i.excluded.phrases, ['no breweries']);
  const j = I('no breweries or pubs');
  assert.deepEqual(j.excluded.types, ['brewery', 'pub']);
  assert.deepEqual(j.types, []);
});

test('Stage 3.1 negation: "wineries but not in kelowna" keeps wineries and excludes only Kelowna', () => {
  const i = I('wineries but not in kelowna');
  assert.deepEqual(i.types, ['winery']);
  assert.deepEqual(i.regions, []);
  assert.deepEqual(i.excluded, { ...EMPTY_EXCLUDED, regions: ['kelowna'], phrases: ['not in kelowna'] });
  assert.equal(i.mode, 'find');
});

test('Stage 3.1 "nothing fancy" / "don\'t want anything fancy" mean only excluded.budget = upscale -- never a positive budget', () => {
  for (const text of ['nothing fancy', "don't want anything fancy", 'We do not want anything fancy', 'not fancy']) {
    const i = I(text);
    assert.equal(i.budget, null, `${text}: no positive budget is invented`);
    assert.deepEqual({ ...i.excluded, phrases: [] }, { ...EMPTY_EXCLUDED, budget: 'upscale' }, `${text}: only upscale is excluded`);
    assert.ok(!i.heuristics.some((h) => h.field === 'budget'), `${text}: no budget ranking hint`);
  }
  assert.deepEqual(I("don't want anything fancy").excluded.phrases, ['not fancy']);
  // The approved planner prompt keeps its wineries and superlative reading.
  const p = I("We don't want anything fancy and can't miss the wineries.");
  assert.deepEqual(p.types, ['winery']);
  assert.equal(p.mode, 'recommend');
  assert.equal(p.budget, null);
  assert.equal(p.excluded.budget, 'upscale');
  // A budget the visitor did ask for is kept alongside the exclusion.
  const c = I('cheap eats but nothing fancy');
  assert.equal(c.budget, 'budget');
  assert.equal(c.excluded.budget, 'upscale');
  assert.deepEqual(c.conflicts, [], 'wanting cheap and excluding upscale is not a conflict');
});

test('Stage 3.1 negation scope: unrelated positive terms survive; the clause ends at a break, an unrecognised word or a new item', () => {
  const a = I('3 days in Kelowna, no golf, relaxed pace');
  assert.deepEqual(a.excluded.types, ['golf']);
  assert.deepEqual(a.regions, ['kelowna']);
  assert.equal(a.pace, 'relaxed', 'the pace after the negated item is kept');
  assert.equal(a.days, 3);
  const b = I('not too far from Kelowna');
  assert.deepEqual(b.regions, ['kelowna'], '"not too far from X" never excludes X');
  assert.deepEqual(b.excluded.regions, []);
  const c = I('a winery, no breweries, and dinner in Kelowna');
  assert.deepEqual(c.types, ['winery', 'restaurant']);
  assert.deepEqual(c.excluded.types, ['brewery']);
  const parts = d.interpretTripComponents('a winery, no breweries, and dinner in Kelowna', TAXONOMY, c).components;
  assert.ok(!parts.some((p) => (p.types || []).includes('brewery')), 'a negated part is never a trip stop');
  assert.ok(parts.some((p) => (p.types || []).includes('winery')) && parts.some((p) => p.meal === 'dinner'));
  const e = I('wineries without kids');
  assert.deepEqual(e.types, ['winery']);
  assert.deepEqual(e.features, []);
  assert.deepEqual(e.excluded.features, ['kid_friendly']);
  assert.equal(e.party.kids, false);
  const g = d.interpretDiscoveryQuery('restaurants other than pizza', WITH_PIZZA);
  assert.deepEqual(g.types, ['restaurant']);
  assert.deepEqual(g.cuisines, []);
  assert.deepEqual(g.excluded.cuisines, ['pizza']);
  assert.deepEqual(I('anything but golf').excluded.types, ['golf']);
});

test('Stage 3.1 phrases that contain a negation word keep their own meaning', () => {
  assert.equal(I('no kids').occasion, 'adults');
  assert.deepEqual(I('no kids').excluded, EMPTY_EXCLUDED);
  const miss = I("can't miss the wineries");
  assert.deepEqual(miss.types, ['winery']);
  assert.equal(miss.superlative, true);
  assert.deepEqual(miss.excluded, EMPTY_EXCLUDED);
  assert.deepEqual(I('non alcoholic drinks in Kelowna').features, ['nonalcoholic']);
  assert.deepEqual(I('non alcoholic drinks in Kelowna').excluded, EMPTY_EXCLUDED);
  const both = I('not only wineries but also breweries');
  assert.deepEqual(both.types, ['winery', 'brewery'], '"not only" is not a negation');
  assert.deepEqual(both.excluded, EMPTY_EXCLUDED);
});

test('Stage 3.1 a value said both ways is a conflict and never stays positive; every negative example is disjoint', () => {
  const i = I('wineries but not wineries');
  assert.deepEqual(i.types, []);
  assert.deepEqual(i.excluded.types, ['winery']);
  assert.deepEqual(i.conflicts, [{ field: 'excluded.types', values: ['winery'] }]);
  for (const text of ['not wineries', 'no breweries', 'wineries but not in kelowna', "don't want anything fancy", 'nothing fancy', 'no breweries or pubs',
    'wineries without kids', 'anything but golf', 'a winery, no breweries, and dinner in Kelowna', '3 days in Kelowna, no golf, relaxed pace', 'not too far from Kelowna',
    'wineries but not wineries', 'cheap eats but nothing fancy', 'no dogs please, just a patio in Penticton']) {
    const x = I(text);
    assertDisjoint(x, text);
    for (const p of x.excluded.phrases) assert.ok(x.unsupported.includes(p), `${text}: "${p}" is reported as not applied`);
  }
});

test('Stage 3.1 validation: exclusions come only from the deterministic reading', () => {
  const { intent, rejected } = d.validateDiscoveryIntent({ types: ['winery'], excluded: { types: ['brewery'] } }, TAXONOMY, 'wineries');
  assert.deepEqual(intent.excluded, EMPTY_EXCLUDED);
  assert.ok(rejected.some((r) => r.field === 'excluded' && r.reason === 'deterministic_only'));
});

test('Stage 3.1 filler words: "spend" and "mix" are never searched for', () => {
  const lake = I('We have one day and want to spend time on the lake.');
  assert.deepEqual(lake.textTerms, []);
  assert.equal(lake.lake, true);
  assert.equal(lake.days, 1);
  const kids = I('We have 3 days with kids and want a mix of activities and food.');
  assert.deepEqual(kids.textTerms, []);
  assert.deepEqual(kids.types, ['restaurant']);
  assert.deepEqual(kids.features, ['kid_friendly']);
  assert.equal(kids.days, 3);
  const left = d.interpretTripComponents('a mix of cafes and beaches in Penticton', TAXONOMY, I('a mix of cafes and beaches in Penticton')).leftoverTerms || [];
  assert.ok(!left.includes('mix'));
});

test('Stage 3.1 plural-tolerant aliases: dinner/dinners, lunch/lunches, pizza/pizzas -- and no unrelated word changes', () => {
  const r = I('Plan a romantic weekend with nice dinners and wineries.');
  assert.deepEqual(r.types, ['restaurant', 'winery']);
  assert.deepEqual(r.textTerms, []);
  assert.deepEqual(I('dinners in Kelowna').types, I('dinner in Kelowna').types);
  assert.deepEqual(I('lunches in Penticton').types, ['restaurant']);
  const meals = d.interpretTripComponents('two lunches and a winery in Kelowna', TAXONOMY, I('two lunches and a winery in Kelowna')).components;
  assert.ok(meals.some((c) => c.meal === 'lunch'), 'a plural meal is still that meal part');
  assert.deepEqual(d.interpretDiscoveryQuery('pizzas', WITH_PIZZA).cuisines, ['pizza']);
  // Plurals are generated only from single-word aliases, never singularised,
  // never for nationality adjectives, and never over an existing phrase.
  assert.deepEqual(I('italians').cuisines, [], 'a nationality plural is not a cuisine request');
  assert.deepEqual(I('spirit').types, [], '"spirits" is not singularised');
  assert.deepEqual(I('bars in Kelowna').types, ['pub']);
  assert.deepEqual(I('drinks in Kelowna').types, ['pub', 'cocktail']);
  assert.deepEqual(I('golf courses').types, ['golf']);
  assert.deepEqual(I('wines').types, ['winery']);
  assert.deepEqual(I('parks').types, ['outdoor']);
  assert.deepEqual(I('kids').features, ['kid_friendly']);
  // A generated plural carries exactly its singular's meaning.
  const table = new Map(d.buildPhraseTable(TAXONOMY).map((e) => [e.phrase, e.assign]));
  assert.deepEqual(table.get('dinners'), table.get('dinner'));
  assert.deepEqual(table.get('lunches'), table.get('lunch'));
  assert.equal(table.has('italians'), false);
  assert.equal(table.has('spirit'), false);
});

// ---- Stage 3.2 (2026-09-29): closed-vocabulary corrections -------------
const corr = (text, taxonomy = TAXONOMY) => d.interpretDiscoveryQuery(text, taxonomy).corrections.map((c) => `${c.from}>${c.to}:${c.field}`);

test('Stage 3.2 contract: corrections is additive, empty by default, deterministic only', () => {
  const i = I('restaurants in Kelowna');
  assert.deepEqual(i.corrections, []);
  assert.equal(i.version, 1);
  assert.deepEqual(I('').corrections, []);
  const v = d.validateDiscoveryIntent({ mode: 'find', regions: ['osoyoos'], corrections: [{ from: 'osoyos', to: 'osoyoos', field: 'region' }] }, TAXONOMY, 'osoyos');
  assert.deepEqual(v.intent.corrections, []);
  assert.ok(v.rejected.some((r) => r.field === 'corrections' && r.reason === 'deterministic_only'));
});

test('Stage 3.2: the known misspellings are corrected onto the closed vocabulary and read like the correct spelling', () => {
  expectIntent('osoyos', { regions: ['osoyoos'], textTerms: [], corrections: [{ from: 'osoyos', to: 'osoyoos', field: 'region' }] });
  expectIntent('naramatta', { regions: ['naramata'], textTerms: [], corrections: [{ from: 'naramatta', to: 'naramata', field: 'region' }] });
  expectIntent('pentiction beach', { regions: ['penticton'], types: ['beach'], textTerms: [] });
  expectIntent('wineris kelona', { regions: ['kelowna'], types: ['winery'], textTerms: [], corrections: [{ from: 'wineris', to: 'wineries', field: 'type' }, { from: 'kelona', to: 'kelowna', field: 'region' }] });
  expectIntent('naramatta winery', { regions: ['naramata'], types: ['winery'], textTerms: [] });
  expectIntent('beache', { types: ['beach'], textTerms: [], corrections: [{ from: 'beache', to: 'beach', field: 'type' }] });
  // A corrected request is interpreted exactly like the correct spelling.
  for (const [typo, right] of [['wineris kelona', 'wineries kelowna'], ['kayaking osoyos', 'kayaking osoyoos'], ['3 days in pentiction with kids', '3 days in penticton with kids']]) {
    const a = I(typo), b = I(right);
    assert.deepEqual({ ...a, corrections: [], matched: [] }, { ...b, corrections: [], matched: [] }, typo);
  }
});

test('Stage 3.2: every correction class -- regions, types, activities, features, cuisines, valley scope', () => {
  const cases = {
    kelownaa: 'kelownaa>kelowna:region', summerlnd: 'summerlnd>summerland:region', westbnk: 'westbnk>westbank:region', osoyoo: 'osoyoo>osoyoos:region',
    penticon: 'penticon>penticton:region', coldstrem: 'coldstrem>coldstream:region', armstong: 'armstong>armstrong:region', enderbey: 'enderbey>enderby:region',
    restaraunt: 'restaraunt>restaurant:type', breweires: 'breweires>breweries:type', distillary: 'distillary>distillery:type', vinyard: 'vinyard>vineyard:type',
    cocktials: 'cocktials>cocktails:type', cofee: 'cofee>coffee:type', coffe: 'coffe>coffee:type', expresso: 'expresso>espresso:type', dinnner: 'dinnner>dinner:type',
    hikng: 'hikng>hiking:activity', bikng: 'bikng>biking:activity', campng: 'campng>camping:activity', kayakng: 'kayakng>kayaking:activity',
    paddelboarding: 'paddelboarding>paddleboarding:activity', snowshoing: 'snowshoing>snowshoeing:activity', viewpont: 'viewpont>viewpoint:activity', fishng: 'fishng>fishing:activity',
    vegeterian: 'vegeterian>vegetarian:feature', patoi: 'patoi>patio:feature', lakeveiw: 'lakeveiw>lakeview:feature', mocktials: 'mocktials>mocktails:feature',
    italain: 'italain>italian:cuisine', mexcian: 'mexcian>mexican:cuisine', japaneese: 'japaneese>japanese:cuisine', sushii: 'sushii>sushi:cuisine',
    seafod: 'seafod>seafood:cuisine', steakhose: 'steakhose>steakhouse:cuisine', okanagen: 'okanagen>okanagan:scope',
  };
  for (const [typo, expected] of Object.entries(cases)) assert.deepEqual(corr(typo), [expected], typo);
  assert.deepEqual(I('hikng trails in vernnon').activities, ['hiking']);
  assert.deepEqual(I('hikng trails in vernnon').regions, ['vernon']);
  assert.deepEqual(I('sushii').cuisines, ['japanese']);
  assert.deepEqual(I('okanagen').regions, [], 'the valley-wide word stays valley-wide');
});

test('Stage 3.2: region possessives ("Kelowna\'s") are exact aliases of the region -- all 32, no collisions', () => {
  expectIntent("Kelowna's best wineries", { regions: ['kelowna'], types: ['winery'], textTerms: [], corrections: [] });
  expectIntent('Penticton’s beaches', { regions: ['penticton'], types: ['beach'], textTerms: [] });
  expectIntent("West Kelowna's wineries", { regions: ['west-kelowna'], types: ['winery'] });
  expectIntent("Lake Country's cafes", { regions: ['lake-country'], types: ['cafe'] });
  expectIntent("Osoyoos' wineries", { regions: ['osoyoos'], types: ['winery'] });
  const table = new Map(d.buildPhraseTable(TAXONOMY).map((e) => [e.phrase, e.assign]));
  const regionOnly = Array.from(table).filter(([p, a]) => a.length && a.every((x) => x.field === 'region') && !/s$/.test(p) && !table.has(p.slice(0, -1)));
  const forms = regionOnly.map(([p]) => `${p}s`);
  assert.equal(forms.length, 32);
  for (const [p, a] of regionOnly) assert.deepEqual(table.get(`${p}s`), a, `${p}s means exactly ${p}`);
  // Never over an existing phrase: no possessive form is also a plural, a
  // cuisine or any other meaning.
  for (const f of forms) assert.ok(table.get(f).every((x) => x.field === 'region'), f);
});

test('Stage 3.2: corrections never bypass polarity -- a negated typo stays an exclusion', () => {
  const a = I('not wineris');
  assert.deepEqual(a.types, []);
  assert.deepEqual(a.excluded, { ...EMPTY_EXCLUDED, types: ['winery'], phrases: ['not wineries'] });
  assert.deepEqual(a.corrections, [{ from: 'wineris', to: 'wineries', field: 'type' }]);
  assert.ok(a.unsupported.includes('not wineries'), 'reported as not applied, in the corrected words');
  const b = I('no breweris');
  assert.deepEqual(b.types, []);
  assert.deepEqual(b.excluded.types, ['brewery']);
  const c = I('wineris but not in kelona');
  assert.deepEqual(c.types, ['winery']);
  assert.deepEqual(c.regions, []);
  assert.deepEqual(c.excluded.regions, ['kelowna']);
  assert.deepEqual(c.corrections.map((x) => x.to), ['wineries', 'kelowna']);
  const e = I('restaurants not in pentiction');
  assert.deepEqual(e.regions, []);
  assert.deepEqual(e.excluded.regions, ['penticton']);
  // Build My Trip never turns a negated typo into a part.
  const trip = d.interpretTripComponents('a cafe, no breweris, and dinner in pentiction', TAXONOMY);
  assert.ok(!trip.components.some((p) => p.types.includes('brewery')));
  assert.deepEqual(trip.regions, ['penticton']);
});

test('Stage 3.2: Build My Trip parts read the corrected words', () => {
  const t = d.interpretTripComponents('coffee and a beache in pentiction', TAXONOMY);
  assert.equal(t.multi, true);
  assert.deepEqual(t.components.map((p) => p.types), [['cafe'], ['beach']]);
  assert.deepEqual(t.regions, ['penticton']);
  const r = d.interpretTripComponents('wineris from kelona to pentiction', TAXONOMY);
  assert.deepEqual(r.route && [r.route.from, r.route.to], ['kelowna', 'penticton']);
  assert.deepEqual(r.leftoverTerms, []);
});

test('Stage 3.2: real words near the vocabulary are never corrected (reviewed list is explicit)', () => {
  for (const w of ['chile', 'steam', 'trains', 'wintry', 'parts', 'italians', 'viewport', 'bench', 'olive', 'wires', 'poppy', 'capes', 'raven', 'greed', 'lumpy', 'canon', 'beech', 'lynch', 'swinging', 'vegetation', 'bikini', 'olives', 'campus', 'county']) {
    const i = I(w);
    assert.deepEqual(i.corrections, [], w);
    assert.deepEqual(i.textTerms, [w], `${w} stays the visitor's own word`);
  }
  // The reviewed never-correct list, exactly: any change must be deliberate.
  assert.deepEqual(d.DISCOVERY_NEVER_CORRECT.slice().sort(), [
    'america', 'americana', 'americas', 'badly', 'bleach', 'blinking', 'bloating', 'boasting', 'boosting', 'breach', 'breeches', 'brewer', 'bridging',
    'campaign', 'celeriac', 'celia', 'circling', 'composite', 'defining', 'divining', 'drinking', 'easting', 'eater', 'exacting', 'finishing', 'flashing', 'flushing',
    'germane', 'germanic', 'indiana', 'javanese', 'koran', 'longe', 'lounger', 'lunge', 'olive', 'olivier', 'outsider', 'outsized', 'padding', 'piazza', 'polis', 'polished',
    'skidding', 'skinning', 'skipping', 'skirting', 'streak', 'toddle', 'trailers', 'trial', 'tumbling', 'westland', 'whisk',
  ]);
  for (const w of d.DISCOVERY_NEVER_CORRECT) assert.deepEqual(I(w).corrections, [], w);
  // Final safety review: each is a real food, cuisine or name one edit from a target.
  assert.deepEqual(I('celeriac soup').features, [], 'celeriac is a vegetable, never gluten-free');
  assert.deepEqual(I('javanese food').cuisines, [], 'Javanese is not Japanese');
  assert.deepEqual(I('olivier salad').regions, [], 'Olivier is not the town of Oliver');
  assert.deepEqual(corr('winer'), ['winer>winery:type'], 'a plain misspelling is still corrected');
  assert.deepEqual(I('not winer').excluded.types, ['winery']);
  assert.deepEqual(I('not winer').types, []);
  const w = I('winer but not in kelona');
  assert.deepEqual([w.types, w.excluded.regions, w.regions], [['winery'], ['kelowna'], []]);
  // Short words, digits and words the interpreter already knows are never corrected.
  for (const w of ['golff', 'bars', 'kelownas', 'dinners', 'hikers2', 'tonight', 'weekend', 'festivel']) assert.ok(!I(w).corrections.some((c) => c.from === w), w);
  // Ties between different meanings are left alone.
  assert.deepEqual(corr('hikes'), []);
});

// Venues for name matching: a unique name core, a brand family, a shared
// core, a core that is also a category phrase, and a single-word name.
const NAMES = { ...TAXONOMY, venues: [...TAXONOMY.venues,
  { id: 530, name: "Quails' Gate Winery", region: 'west-kelowna', type: 'winery', slug: 'quails-gate-winery' },
  { id: 930, name: 'Old Vines Restaurant', region: 'west-kelowna', type: 'restaurant', slug: 'old-vines-restaurant' },
  { id: 19, name: '50th Parallel Estate Winery - Tasting Room', region: 'lake-country', type: 'winery', slug: '50th-parallel-estate-winery-tasting-room' },
  { id: 20, name: '50th Parallel Estate Winery - Block One Restaurant', region: 'lake-country', type: 'restaurant', slug: '50th-parallel-block-one' },
  { id: 41, name: 'Barn Owl Brewing', region: 'vernon', type: 'brewery', slug: 'barn-owl-brewing' },
  { id: 42, name: 'Barn Owl Winery', region: 'summerland', type: 'winery', slug: 'barn-owl-winery' },
  { id: 77, name: 'Happy Hour Bar', region: 'kelowna', type: 'pub', slug: 'happy-hour-bar' },
  { id: 571, name: 'Sandhill Wines', region: 'kelowna', type: 'winery', slug: 'sandhill-wines' },
] };
const N = (text) => d.interpretDiscoveryQuery(text, NAMES);

test('Stage 3.2 name cores: a unique multi-word core navigates; brand families, shared cores and phrases never do', () => {
  for (const q of ['quails gate', "Quail's Gate", "Quails' Gate", 'the quails gate']) {
    const i = N(q);
    assert.equal(i.mode, 'navigate', q);
    assert.deepEqual(i.exactVenue, { id: 530, region: 'west-kelowna', type: 'winery', slug: 'quails-gate-winery' }, q);
    assert.deepEqual(i.corrections, []);
  }
  assert.equal(N("Quails' Gate Winery").exactVenue.id, 530, 'the full name still matches first');
  assert.equal(N('Old Vines Restaurant').exactVenue.id, 930);
  // Brand family: "50th parallel" is in two venue names -- never narrowed to one.
  assert.equal(N('50th parallel').exactVenue, null);
  assert.deepEqual(N('50th parallel').ambiguities, []);
  // Shared core: two venues are "barn owl" -- left exactly as before (no match, no ambiguity).
  assert.equal(N('barn owl').exactVenue, null);
  assert.deepEqual(N('barn owl').ambiguities, []);
  assert.deepEqual(N('barn owl').textTerms, I('barn owl').textTerms);
  // A core that is also a phrase keeps the phrase's meaning.
  assert.equal(N('happy hour').exactVenue, null);
  assert.deepEqual(N('happy hour').features, ['happy_hour']);
  // Never a partial name, never a single-word core, never a fuzzy name.
  assert.equal(N('quails').exactVenue, null);
  assert.equal(N('sandhill').exactVenue, null);
  const s = N('sandhil');
  assert.equal(s.exactVenue, null);
  assert.deepEqual(s.corrections, [], 'venue-name words are never correction targets');
  assert.deepEqual(s.textTerms, ['sandhil']);
  assert.equal(N('quails gat').exactVenue, null);
});

test('Stage 3.2: a word in a venue name is never corrected, and an exact name is matched before any correction', () => {
  const T2 = { ...TAXONOMY, venues: [...TAXONOMY.venues, { id: 901, name: 'Kelona Kitchen', region: 'kelowna', type: 'restaurant', slug: 'kelona-kitchen' }] };
  const i = d.interpretDiscoveryQuery('kelona kitchen', T2);
  assert.equal(i.exactVenue.id, 901);
  assert.deepEqual(i.corrections, []);
  assert.deepEqual(d.interpretDiscoveryQuery('kelona', T2).corrections, [], 'the site uses the word in a name');
  assert.deepEqual(corr('kelona'), ['kelona>kelowna:region']);
});

test('Stage 3.2: every real venue name (the 812-name seed corpus) still matches exactly as before, with no correction', () => {
  const seed = require('../venues.json');
  const list = (Array.isArray(seed) ? seed : seed.venues).filter((v) => TAXONOMY.regions.includes(v.region));
  const venues = list.map((v, k) => ({ id: 10000 + k, name: v.name, region: v.region, type: v.type, slug: `v-${k}` }));
  const T3 = { ...TAXONOMY, venues };
  const key = (s) => d.normalizeDiscoveryText(s).replace(/^the /, '');
  const byName = new Map();
  for (const v of venues) { const k = key(v.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(v); }
  let checked = 0;
  for (const v of venues) {
    const i = d.interpretDiscoveryQuery(v.name, T3);
    const same = byName.get(key(v.name));
    assert.deepEqual(i.corrections, [], v.name);
    if (same.length === 1) assert.equal(i.exactVenue && i.exactVenue.id, v.id, v.name);
    else {
      assert.equal(i.exactVenue, null, v.name);
      assert.deepEqual(i.ambiguities[0].options.slice().sort(), same.map((x) => x.id).sort(), v.name);
    }
    const withRegion = d.interpretDiscoveryQuery(`${v.name} ${TAXONOMY.regionLabels[v.region]}`, T3);
    assert.deepEqual(withRegion.corrections, [], `${v.name} + region`);
    // The existing order: a full name that already includes the region
    // ("TacoRiendo Mexican Cantina Kelowna") wins, then name + region.
    const whole = byName.get(key(`${v.name} ${TAXONOMY.regionLabels[v.region]}`));
    const expected = whole || same.filter((x) => x.region === v.region);
    if (expected.length === 1) assert.equal(withRegion.exactVenue && withRegion.exactVenue.id, expected[0].id, `${v.name} + region`);
    checked++;
  }
  assert.ok(checked > 700, `${checked} venue names checked`);
});

// ---- Stage 3.5 (2026-09-29): pace inside a trip-length phrase ---------------------
test('Stage 3.5: a pace word inside the trip length is the trip pace ("3 relaxed days"); "full" is not a pace; day themes unchanged', () => {
  for (const [q, days, pace] of [
    ['3 relaxed days in Kelowna', 3, 'relaxed'], ['3 relaxed days in Kelowna with wine and hidden gems', 3, 'relaxed'],
    ['a relaxing day in Kelowna', 1, 'relaxed'], ['a chill day in Penticton', 1, 'relaxed'], ['2 easy days around Vernon', 2, 'relaxed'],
    ['a lazy day in Naramata', 1, 'relaxed'], ['two leisurely days in Penticton', 2, 'relaxed'],
    ['three packed days of golf', 3, 'packed'], ['a busy day in Kelowna', 1, 'packed'],
  ]) {
    const i = I(q);
    assert.equal(i.days, days, q);
    assert.equal(i.pace, pace, q);
  }
  // "full" usually means a whole day; other adjectives are not paces.
  for (const q of ['a full day in Kelowna', 'three full days in Kelowna', 'a fun day in Kelowna', '3 amazing days in Kelowna']) assert.equal(I(q).pace, null, q);
  // A one-day theme inside a longer trip stays that day's theme, not the trip pace.
  const themed = I('Plan a 3 day golf trip to Kelowna with one relaxed day');
  assert.equal(themed.days, 3);
  assert.equal(themed.pace, null);
  assert.equal(themed.dayThemes.length, 1);
  assert.equal(themed.dayThemes[0].pace, 'relaxed');
  // Pace words elsewhere keep working exactly as before.
  assert.equal(I('a relaxed trip to Kelowna').pace, 'relaxed');
  assert.equal(I('a packed 2 day trip in Vernon').pace, 'packed');
  assert.deepEqual(I('relaxed but packed days').conflicts, [{ field: 'pace', values: ['relaxed', 'packed'] }]);
});

// ---- Stage 3.5 D3 (2026-09-30): "weekend away" is a 2-day trip -------------------
test('Stage 3.5 D3: "weekend away" is a 2-day trip; "this weekend" stays a date, "next weekend" unsupported, "long weekend away" 3 days', () => {
  for (const q of ['weekend away', 'a weekend away', 'a quiet weekend away', 'weekend away in Kelowna', 'a romantic weekend away', 'weekend away with the kids']) {
    const i = I(q);
    assert.equal(i.mode, 'plan', q);
    assert.equal(i.days, 2, q);
    assert.ok(!i.needs.includes('days'), `${q}: no longer needs a length`);
  }
  assert.equal(I('a relaxed weekend away').pace, 'relaxed');
  assert.equal(I('a busy weekend away').pace, 'packed');
  assert.deepEqual(I('weekend away with no wineries').excluded.types, ['winery']);
  // Unchanged: phrases that were already 2 days, and "long weekend".
  for (const [q, days] of [['weekend getaway', 2], ['a weekend trip', 2], ['weekend', 2], ['a weekend in Kelowna', 2], ['winter weekend', 2], ['weekend with kids', 2], ['relaxed weekend in Kelowna', 2], ['relaxing weekend', 2], ['a long weekend away', 3], ['a long weekend in Penticton', 3]]) {
    assert.equal(I(q).days, days, q);
  }
  // "this weekend" is a date, never a length.
  for (const q of ['this weekend', 'wineries this weekend', 'plan this weekend in Kelowna']) {
    const i = I(q);
    assert.deepEqual(i.when, { preset: 'this-weekend' }, q);
    assert.equal(i.days, null, q);
  }
  // "next weekend" stays unsupported: no date, no length.
  for (const q of ['next weekend', 'plan a trip next weekend']) {
    const i = I(q);
    assert.ok(i.unsupported.includes('next weekend'), q);
    assert.equal(i.when, null, q);
    assert.equal(i.days, null, q);
  }
});

// ---- Stage 3.5 D4 (2026-09-30): an adjacent cuisine + restaurant meal is one part ----
test('Stage 3.5 D4: "italian dinner" / "italian lunch" are one cuisine meal; supper, brunch and other forms unchanged', () => {
  const parts = (q) => d.interpretTripComponents(q, TAXONOMY, I(q)).components.map((c) => `${c.meal || c.types.join('/')}${c.cuisines.length ? `(${c.cuisines.join(',')})` : ''}`);
  // One part: a single request, planned as the existing cuisine list.
  for (const [q, want] of [['italian dinner in kelowna', 'dinner(italian)'], ['italian lunch in kelowna', 'lunch(italian)']]) {
    const trip = d.interpretTripComponents(q, TAXONOMY, I(q));
    assert.deepEqual(parts(q), [want], q);
    assert.equal(trip.multi, false, `${q}: one part, not a multi-part itinerary`);
  }
  // Multi-part: the cuisine goes to its own meal, never to a neighbour.
  assert.deepEqual(parts('italian dinner and a winery'), ['dinner(italian)', 'winery']);
  assert.deepEqual(parts('a winery then italian dinner'), ['winery', 'dinner(italian)']);
  assert.deepEqual(parts('mexican lunch and italian dinner'), ['lunch(mexican)', 'dinner(italian)']);
  assert.deepEqual(parts('lunch and an italian dinner'), ['lunch', 'dinner(italian)']);
  // Unchanged: brunch/breakfast, non-adjacent and structurally different forms.
  assert.deepEqual(parts('italian brunch'), ['restaurant(italian)', 'brunch']);
  assert.deepEqual(parts('italian supper in kelowna'), ['restaurant(italian)', 'supper']);
  assert.deepEqual(parts('a winery and italian supper'), ['winery', 'restaurant(italian)', 'supper']);
  assert.deepEqual(parts('italian food for dinner'), ['restaurant(italian)', 'dinner']);
  assert.deepEqual(parts('sushi for dinner'), ['restaurant(japanese)', 'dinner']);
  assert.deepEqual(parts('italian restaurant dinner'), ['restaurant(italian)', 'dinner']);
  assert.equal(d.interpretTripComponents('dinner italian', TAXONOMY, I('dinner italian')).multi, false);
  // Everything else about the request is unchanged.
  const ex = I('italian dinner but not in kelowna');
  assert.deepEqual(ex.excluded.regions, ['kelowna']);
  assert.deepEqual(ex.cuisines, ['italian']);
});
