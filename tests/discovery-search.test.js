// Stage 3.3 (2026-09-29): the shared discovery retrieval (discovery-search.js).
//
// PURE tests: venue records are built here, requests are interpreted by the
// real interpreter over a small taxonomy; no server.js, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../discovery-search.js');
const d = require('../discovery-intent.js');

const norm = d.normalizeDiscoveryText;
function venue(id, name, region, type, extra = {}) {
  const cuisine = extra.cuisine || '';
  return {
    id, name, region, type, cuisine: cuisine.toLowerCase(),
    textName: norm(name), textCuisine: norm(cuisine), textDesc: norm(extra.description || ''),
    features: extra.features || {}, collections: extra.collections || [], activities: extra.activities || [], fdTypes: extra.fdTypes || [],
    rating: extra.rating == null ? null : extra.rating, reviews: extra.reviews == null ? null : extra.reviews, price: extra.price == null ? null : extra.price,
  };
}
const V = [
  venue(1, 'Pizza Garden', 'penticton', 'restaurant', { cuisine: 'Italian', description: 'Wood-fired pizza by the slice.', rating: 4.5, reviews: 300, price: 2 }),
  venue(2, 'Mamma Pizzeria', 'kelowna', 'restaurant', { cuisine: 'Pizza', description: 'Neapolitan pies.', rating: 4.8, reviews: 50, price: 2 }),
  venue(3, 'Slice House', 'kelowna', 'restaurant', { cuisine: 'Pizza', description: 'Thin crust.', rating: 4.2, reviews: 900, price: 1 }),
  venue(4, 'Lakeside Grill', 'kelowna', 'restaurant', { cuisine: 'American', description: 'A lake view patio and burgers; North American comfort food.', features: { patio: true, lake_view: true }, rating: 4.4, reviews: 120, price: 4 }),
  venue(5, 'Chez Nous', 'kelowna', 'restaurant', { cuisine: 'French', description: 'Classic bistro.', rating: 4.6, reviews: 80, price: 3 }),
  venue(6, 'French Door Estate Winery', 'naramata', 'winery', { description: 'Authenticity over polish; live Spanish guitar on Fridays.', features: { patio: true }, rating: 4.7, reviews: 200 }),
  venue(7, 'Hoppy Days Brewing', 'penticton', 'brewery', { description: 'Taproom with pizza on Fridays.', features: { dog_friendly: true }, collections: ['local_favorite'], rating: 4.5, reviews: 400, price: 2 }),
  venue(8, 'Harvest Table', 'kelowna', 'restaurant', { description: 'A farm to table kitchen with house-made soup.', fdTypes: ['brewery'], rating: 4.1, reviews: 60 }),
  venue(9, 'Okanagan Lake Beach', 'kelowna', 'beach', { description: 'A sandy lake beach.', collections: ['dog_friendly', 'hidden_gem'], rating: 4.3 }),
  venue(10, 'Knox Mountain Trail', 'kelowna', 'outdoor', { description: 'Views over the lake.', activities: ['hiking', 'viewpoints'], rating: 4.9, reviews: 1000 }),
  venue(11, 'Sushi Kaiso', 'kelowna', 'restaurant', { cuisine: 'Japanese', description: 'Sushi and ramen.', rating: 4.4, reviews: 150, price: 3 }),
  venue(12, 'Kimbap & Sushi', 'kelowna', 'restaurant', { cuisine: 'Korean', description: 'Korean rolls.', rating: 4.9, reviews: 20 }),
];
const TAXONOMY = {
  regions: ['kelowna', 'penticton', 'naramata'],
  regionLabels: { kelowna: 'Kelowna', penticton: 'Penticton', naramata: 'Naramata' },
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'lake_view', 'vegan'],
  collections: ['hidden_gem', 'local_favorite', 'dog_friendly'],
  activities: ['hiking', 'viewpoints', 'water'],
  cuisines: ['italian', 'pizza', 'american', 'french', 'japanese', 'korean', 'soup', 'farm-to-table', 'polish', 'spanish'],
  budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'], datePresets: ['today'], eventCategories: [],
  venues: [],
};
const find = (text) => s.searchVenues(d.interpretDiscoveryQuery(text, TAXONOMY), V);
const ids = (text) => find(text).items.map((x) => x.venue.id);

test('Stage 3.3 whole-word matching and the planner food rule are the shared, unchanged functions', () => {
  assert.equal(s.textHas('wood fired pizza by the slice', 'pizza'), true);
  assert.equal(s.textHas('pizzeria', 'pizza'), false, 'whole words only');
  assert.equal(s.textHas('', 'pizza'), false);
  assert.deepEqual(s.termMatch(V[0], 'pizza'), { inName: true, inCui: false, inDesc: true });
  assert.equal(s.termMatch(V[0], 'sushi'), null);
  // Build My Trip's rule, exactly as before: the stored cuisine, or the word.
  assert.deepEqual(s.foodMatch(V[4], { term: 'french', cuisine: 'french' }), { cuisine: true });
  assert.deepEqual(s.foodMatch(V[5], { term: 'french', cuisine: 'french' }), { inName: true, inCui: false, inDesc: false });
  assert.equal(s.foodMatch(V[2], { term: 'sushi', cuisine: 'japanese' }), null);
});

test('Stage 3.3 hard filters: region, type (incl. secondary Food & Drink type), features, curated lists, activities', () => {
  assert.deepEqual(ids('restaurants in penticton'), [1]);
  assert.deepEqual(ids('breweries'), [7, 8], 'a secondary Food & Drink type counts, as before');
  assert.deepEqual(ids('patio'), [6, 4]);
  assert.deepEqual(ids('dog friendly'), [7, 9], 'the badge or the official dog-friendly list');
  assert.deepEqual(ids('hidden gems'), [9]);
  assert.deepEqual(ids('local favourites'), [7]);
  assert.deepEqual(ids('hiking'), [10]);
  assert.deepEqual(find('dog friendly').items.map((x) => x.matchedOn), [['feature:dog_friendly'], ['feature:dog_friendly']]);
});

test('Stage 3.3 cuisine: the stored cuisine first, in the previous order; dish words also match by mention, after', () => {
  const r = find('pizza');
  // Stored cuisine "pizza" first (score 2, then rating), exactly the previous result...
  assert.deepEqual(r.items.slice(0, 2).map((x) => x.venue.id), [2, 3]);
  assert.deepEqual(r.items.slice(0, 2).map((x) => x.matchedOn), [['cuisine:pizza'], ['cuisine:pizza']]);
  // ...then venues whose own name/description says "pizza", best-placed mention first.
  assert.deepEqual(r.items.slice(2).map((x) => x.venue.id), [1, 7]);
  assert.deepEqual(r.items.slice(2).map((x) => x.matchedOn), [['pizza:name+description'], ['pizza:description']]);
  assert.deepEqual(ids('pizzas'), [2, 3, 1, 7], 'a plural dish word matches its singular too');
  assert.deepEqual(ids('sushi'), [11, 12], 'stored Japanese first, then a venue named for sushi');
  assert.deepEqual(ids('soup'), [8], 'a dish word in a description');
  // Nationality and style words match the STORED cuisine only -- never
  // "French Door", "authenticity over polish", "Spanish guitar", "North American".
  assert.deepEqual(ids('french'), [5]);
  assert.deepEqual(ids('polish'), []);
  assert.deepEqual(ids('spanish'), []);
  assert.deepEqual(ids('american'), [4]);
  assert.deepEqual(ids('farm to table'), [], 'a style, never a mention');
  // Several named cuisines: any of them (as before).
  assert.deepEqual(ids('french or japanese'), [5, 11]);
});

test('Stage 3.3 exclusions: types, regions, cuisines, curated lists, activities and upscale (price 4) are applied; features and free text are not', () => {
  assert.deepEqual(ids('restaurants but not in kelowna'), [1]);
  assert.deepEqual(ids('patio not in naramata'), [4]);
  assert.deepEqual(ids('dog friendly, no beaches'), [7]);
  assert.deepEqual(ids('dog friendly, no breweries'), [9]);
  assert.deepEqual(ids('restaurants in kelowna other than pizza'), [12, 5, 11, 4, 8], 'stored pizza cuisine removed; rating order kept');
  assert.deepEqual(ids('dog friendly but not hidden gems'), [7]);
  assert.deepEqual(ids('kelowna but no hiking'), ids('kelowna').filter((id) => id !== 10));
  // "nothing fancy" = excluded upscale = a stored price of 4 only.
  const nf = find('restaurants in kelowna, nothing fancy');
  assert.ok(!nf.items.some((x) => x.venue.id === 4), 'price 4 excluded');
  assert.ok(nf.items.some((x) => x.venue.id === 5) && nf.items.some((x) => x.venue.id === 11), 'price 3 kept');
  assert.ok(nf.items.some((x) => x.venue.id === 12), 'no stored price: never excluded');
  assert.deepEqual(nf.exclusions.applied, [{ field: 'budget', value: 'upscale' }]);
  // Not applied, and reported as not applied.
  const kids = find('restaurants in kelowna without kids');
  assert.deepEqual(kids.items.map((x) => x.venue.id), ids('restaurants in kelowna'));
  assert.deepEqual(kids.exclusions, { applied: [], notApplied: [{ field: 'feature', value: 'kid_friendly' }] });
  const text = s.searchVenues({ ...d.interpretDiscoveryQuery('restaurants in kelowna', TAXONOMY), excluded: { ...d.interpretDiscoveryQuery('x', TAXONOMY).excluded, textTerms: ['spicy'] } }, V);
  assert.deepEqual(text.exclusions.notApplied, [{ field: 'text', value: 'spicy' }]);
  assert.deepEqual(s.exclusionPlan({ budget: 'budget' }).notApplied, [{ field: 'budget', value: 'budget' }]);
});

test('Stage 3.3 a negated value never becomes a positive retrieval term', () => {
  for (const q of ['not wineries', 'no breweries', 'not in kelowna', 'nothing fancy', "don't want anything fancy", 'no pizza', 'without hiking']) {
    const i = d.interpretDiscoveryQuery(q, TAXONOMY);
    assert.deepEqual(s.searchVenues(i, V).items, [], `${q}: an exclusion alone retrieves nothing`);
  }
  for (const q of ['restaurants but not in kelowna', 'dog friendly, no breweries', 'restaurants in kelowna other than pizza']) {
    const i = d.interpretDiscoveryQuery(q, TAXONOMY);
    for (const x of s.searchVenues(i, V).items) {
      assert.ok(!i.excluded.regions.includes(x.venue.region), q);
      assert.ok(!i.excluded.types.includes(x.venue.type) && !x.venue.fdTypes.some((t) => i.excluded.types.includes(t)), q);
      assert.ok(!i.excluded.cuisines.includes(x.venue.cuisine), q);
    }
  }
});

test('Stage 3.3 retrieval is grounded in stored fields: no type or fact is inferred from a word', () => {
  // "lake" is the visitor's own word: only venues whose own text says it, each explained.
  const lake = find('lake');
  assert.deepEqual(lake.items.map((x) => x.venue.id).sort((a, b) => a - b), [4, 9, 10]);
  for (const x of lake.items) assert.match(x.matchedOn.join(), /^lake:/);
  // "pizza" is never every restaurant: only stored pizza cuisine or the word itself.
  for (const x of find('pizza').items) assert.ok(x.venue.cuisine === 'pizza' || s.termMatch(x.venue, 'pizza'));
  assert.equal(find('pizza').items.length, 4);
  // Results are the stored records, never modified.
  const before = JSON.stringify(V);
  for (const q of ['pizza', 'lake', 'restaurants but not in kelowna', 'sushi', 'dog friendly']) find(q);
  assert.equal(JSON.stringify(V), before);
  for (const x of find('pizza').items) assert.equal(x.venue, V.find((v) => v.id === x.venue.id));
});

test('Stage 3.3 ranking: deterministic, the pre-3.3 order (score, rating, reviews, name, id); nothing to filter on matches nothing', () => {
  const r = find('kelowna');
  const ordered = r.items.map((x) => x.venue);
  for (let k = 1; k < ordered.length; k++) {
    const a = ordered[k - 1], b = ordered[k];
    assert.ok((a.rating || 0) > (b.rating || 0) || ((a.rating || 0) === (b.rating || 0) && ((a.reviews || 0) >= (b.reviews || 0))), `${a.name} before ${b.name}`);
  }
  assert.deepEqual(ids('kelowna'), ids('kelowna'), 'the same request always ranks the same way');
  assert.deepEqual(s.searchVenues(d.interpretDiscoveryQuery('events this weekend', TAXONOMY), V).items, []);
  assert.deepEqual(s.searchVenues(d.interpretDiscoveryQuery('date night', TAXONOMY), V).items, []);
  assert.deepEqual(s.searchVenues(null, V).items, []);
  // Ties: equal score, rating and reviews -> name, then id.
  const tie = [venue(21, 'B', 'kelowna', 'cafe', { rating: 4 }), venue(20, 'A', 'kelowna', 'cafe', { rating: 4 }), venue(19, 'A', 'kelowna', 'cafe', { rating: 4 })];
  assert.deepEqual(s.searchVenues(d.interpretDiscoveryQuery('cafes', TAXONOMY), tie).items.map((x) => x.venue.id), [19, 20, 21]);
});


// ---- excluded concepts (2026-10-06) -----------------------------------------------
test('an excluded alcohol concept rules out venues whose PRIMARY type is alcohol, and nothing else', () => {
  const plan = s.exclusionPlan({ concepts: ['alcohol'] });
  assert.deepEqual(plan.applied.map((a) => `${a.field}:${a.value}`), s.CONCEPT_PRIMARY_TYPES.alcohol.map((t) => `primary_type:${t}`));
  assert.deepEqual(plan.notApplied, []);
  const v = (type, fdTypes = []) => ({ type, fdTypes });
  for (const t of ['winery', 'brewery', 'distillery', 'pub', 'cocktail']) assert.ok(s.isExcluded(v(t), plan), t);
  for (const t of ['restaurant', 'cafe', 'golf', 'beach', 'outdoor']) assert.ok(!s.isExcluded(v(t), plan), t);
  assert.ok(!s.isExcluded(v('restaurant', ['pub', 'brewery']), plan), 'a restaurant that is also filed as a pub is not alcohol-first');
  assert.deepEqual(s.exclusionPlan({ concepts: ['unknown'] }).applied, []);
  assert.deepEqual(s.exclusionPlan({}).applied, []);
});
