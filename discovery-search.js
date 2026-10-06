'use strict';
// Shared discovery retrieval (Stage 3.3, 2026-09-29).
//
// ONE implementation of venue retrieval for /api/discover and of the word
// matching Build My Trip uses. Pure and deterministic: venue records in, the
// matching venues out -- no database, no network, no AI, nothing written.
//
// Retrieval is grounded in stored venue fields only. A request selects venues
// by the structured values it names (region, type, badge features, curated
// lists, activities, stored cuisine) and by the visitor's own words found,
// whole-word, in a venue's name, cuisine or description. Nothing here infers
// a type, a feature or any other fact from a word: every result says exactly
// why it matched in `matchedOn`.
//
// Venue records (built by the server from the database) carry:
//   id, name, region, type, cuisine (lower-case stored cuisine or ''),
//   textName / textCuisine / textDesc (normalized with the interpreter's
//   normalizeDiscoveryText), features { badge: true }, collections [kinds],
//   activities [slugs], fdTypes [secondary Food & Drink types], rating,
//   reviews, price (as stored).

// Whole-word match of a term inside already-normalized text.
function textHas(normalized, term) {
  return !!normalized && ` ${normalized} `.indexOf(` ${term} `) !== -1;
}

// Where a word appears in a venue's name, cuisine and description, or null.
function termMatch(v, term) {
  const inName = textHas(v.textName, term), inCui = textHas(v.textCuisine, term), inDesc = textHas(v.textDesc, term);
  return inName || inCui || inDesc ? { inName, inCui, inDesc } : null;
}
const termWeight = (m) => (m.inName ? 3 : 0) + (m.inCui ? 2 : 0) + (m.inDesc ? 1 : 0);
const termWhere = (m) => [m.inName && 'name', m.inCui && 'cuisine', m.inDesc && 'description'].filter(Boolean).join('+');

// Build My Trip's food rule (unchanged): the stored cuisine, or the
// visitor's own word in the venue's name, cuisine or description.
function foodMatch(v, ft) {
  if (ft.cuisine && v.cuisine === ft.cuisine) return { cuisine: true };
  return termMatch(v, ft.term);
}

// Food words that name a dish. For these ONLY, a venue whose stored cuisine
// is different but whose own name, cuisine or description says the word
// also matches a cuisine request ("pizza": Pizza 64, listed as Italian).
// Nationality and style words ("french", "polish", "farm to table") never
// match by mention -- descriptions use them for other things ("authenticity
// over polish", "French Door", "Spanish guitar") -- so they match the stored
// cuisine only. A plural matches its singular too.
const DISH_WORDS = {
  pizza: ['pizza'], pizzas: ['pizzas', 'pizza'],
  soup: ['soup'], soups: ['soups', 'soup'],
  dessert: ['dessert'], desserts: ['desserts', 'dessert'],
  seafood: ['seafood'], 'fish and chips': ['fish and chips'],
  bbq: ['bbq'], barbecue: ['barbecue'],
  tapas: ['tapas'],
  'bubble tea': ['bubble tea'], boba: ['boba'], bobas: ['bobas', 'boba'],
  steakhouse: ['steakhouse'], steak: ['steak'], steaks: ['steaks', 'steak'],
  sushi: ['sushi'], sushis: ['sushis', 'sushi'],
  ramen: ['ramen'], ramens: ['ramens', 'ramen'],
  gelato: ['gelato'], gelatos: ['gelatos', 'gelato'],
  'ice cream': ['ice cream'],
};

const hasType = (v, types) => types.includes(v.type) || (v.fdTypes || []).some((t) => types.includes(t));
const hasFeature = (v, f) => !!(v.features && v.features[f]) || (f === 'dog_friendly' && v.collections.includes('dog_friendly'));
const UPSCALE_PRICE = 4;

// Excluded CONCEPTS (2026-10-06). A visitor can rule out a whole kind of
// place without naming a category ("we don't drink alcohol", "we're sober").
// discovery-intent.js recognises the concept and records its id in
// excluded.concepts; this table says which venues it rules out. The test is
// the venue's PRIMARY type only: a venue is left out when alcohol is the
// reason to visit (a winery, brewery, distillery, pub or cocktail lounge), and
// a restaurant or cafe that merely serves it stays, even when it also carries
// a secondary Food & Drink category such as "pub".
const CONCEPT_PRIMARY_TYPES = Object.freeze({
  alcohol: Object.freeze(['winery', 'brewery', 'distillery', 'pub', 'cocktail']),
});

// Which of the request's exclusions retrieval applies, and which it does not.
// Applied: excluded types (a venue's type or its secondary Food & Drink
// type), regions, stored cuisines, curated lists, activities, and an excluded
// upscale budget (a stored price of 4; a venue without a price is never
// excluded), and excluded concepts (CONCEPT_PRIMARY_TYPES, by primary type).
// Not applied: excluded badge features -- "without kids" / "no
// dogs" usually describe the visitor's party, not the venue -- excluded free
// text, and any other excluded budget.
function exclusionPlan(excluded) {
  const ex = excluded || {};
  const list = (k) => (Array.isArray(ex[k]) ? ex[k] : []);
  const applied = [], notApplied = [];
  for (const [field, key] of [['type', 'types'], ['region', 'regions'], ['cuisine', 'cuisines'], ['collection', 'collections'], ['activity', 'activities']]) {
    for (const value of list(key)) applied.push({ field, value });
  }
  for (const concept of list('concepts')) {
    for (const value of CONCEPT_PRIMARY_TYPES[concept] || []) applied.push({ field: 'primary_type', value });
  }
  if (ex.budget === 'upscale') applied.push({ field: 'budget', value: 'upscale' });
  else if (ex.budget) notApplied.push({ field: 'budget', value: ex.budget });
  for (const value of list('features')) notApplied.push({ field: 'feature', value });
  for (const value of list('textTerms')) notApplied.push({ field: 'text', value });
  return { applied, notApplied };
}
function isExcluded(v, plan) {
  for (const { field, value } of plan.applied) {
    if (field === 'type' && hasType(v, [value])) return true;
    if (field === 'primary_type' && v.type === value) return true;
    if (field === 'region' && v.region === value) return true;
    if (field === 'cuisine' && v.cuisine === value) return true;
    if (field === 'collection' && v.collections.includes(value)) return true;
    if (field === 'activity' && v.activities.includes(value)) return true;
    if (field === 'budget' && v.price != null && Number(v.price) === UPSCALE_PRICE) return true;
  }
  return false;
}

// The venues matching an interpreted request, ranked deterministically.
// Hard filters: region, type (incl. secondary Food & Drink types), every
// badge feature, every curated list, any activity, the stored cuisine (or,
// for a dish word, the word itself), every free-text word, and the applied
// exclusions. Ranking, as before Stage 3.3: venues matching a named cuisine
// by their STORED cuisine come first, in exactly the previous order; venues
// matching a dish word only by mention follow. Within each: text relevance
// (name 3, cuisine 2, description 1 per word; 2 for a stored cuisine), then
// rating, review count, name and id. Heuristics (occasion, budget, dates)
// are not applied here. An intent with nothing to filter on matches nothing.
function searchVenues(intent, venues) {
  const empty = { total: 0, items: [], exclusions: { applied: [], notApplied: [] } };
  if (!intent || intent.mode === 'events' || intent.mode === 'unknown') return empty;
  const R = intent.regions || [], T = intent.types || [], F = intent.features || [], C = intent.collections || [], A = intent.activities || [];
  const cuisines = intent.cuisines || [], terms = intent.textTerms || [];
  if (!R.length && !T.length && !F.length && !C.length && !A.length && !cuisines.length && !terms.length) return empty;
  const plan = exclusionPlan(intent.excluded);
  const dishWords = [];
  if (cuisines.length) {
    for (const ft of intent.foodTerms || []) {
      if (ft.cuisine && cuisines.includes(ft.cuisine) && DISH_WORDS[ft.term]) dishWords.push({ term: ft.term, words: DISH_WORDS[ft.term] });
    }
  }

  const scored = [];
  for (const v of venues) {
    if (R.length && !R.includes(v.region)) continue;
    if (T.length && !hasType(v, T)) continue;
    if (!F.every((f) => hasFeature(v, f))) continue;
    if (!C.every((c) => v.collections.includes(c))) continue;
    if (A.length && !A.some((a) => v.activities.includes(a))) continue;
    let score = 0;
    let tier = 0;
    let cuisineOn = null;
    if (cuisines.length) {
      if (cuisines.includes(v.cuisine)) { score += 2; cuisineOn = `cuisine:${v.cuisine}`; } else {
        // A dish word the venue itself uses: the best-placed mention wins.
        let best = null;
        for (const d of dishWords) {
          for (const w of d.words) {
            const m = termMatch(v, w);
            if (m && (!best || termWeight(m) > termWeight(best.m))) best = { m, term: d.term };
          }
        }
        if (!best) continue;
        tier = 1;
        score += termWeight(best.m);
        cuisineOn = `${best.term}:${termWhere(best.m)}`;
      }
    }
    const matchedOn = [];
    let ok = true;
    for (const term of terms) {
      const m = termMatch(v, term);
      if (!m) { ok = false; break; }
      score += termWeight(m);
      matchedOn.push(`${term}:${termWhere(m)}`);
    }
    if (!ok) continue;
    if (plan.applied.length && isExcluded(v, plan)) continue;
    for (const f of F) matchedOn.push(`feature:${f}`);
    for (const c of C) matchedOn.push(`collection:${c}`);
    if (cuisineOn) matchedOn.push(cuisineOn);
    scored.push({ venue: v, tier, score, matchedOn });
  }
  scored.sort((a, b) => a.tier - b.tier
    || b.score - a.score
    || (Number(b.venue.rating) || 0) - (Number(a.venue.rating) || 0)
    || (Number(b.venue.reviews) || 0) - (Number(a.venue.reviews) || 0)
    || String(a.venue.name).localeCompare(String(b.venue.name))
    || a.venue.id - b.venue.id);
  return { total: scored.length, items: scored.map(({ venue, matchedOn }) => ({ venue, matchedOn })), exclusions: plan };
}

module.exports = { textHas, termMatch, foodMatch, searchVenues, exclusionPlan, isExcluded, CONCEPT_PRIMARY_TYPES, DISH_WORDS: Object.freeze({ ...DISH_WORDS }) };
