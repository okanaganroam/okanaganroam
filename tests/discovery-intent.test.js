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
