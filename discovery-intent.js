// Shared discovery-intent interpreter (Phase 1, 2026-09-25).
//
// Turns a visitor's natural-language request ("restaurants in Kelowna",
// "plan 3 days in Penticton with kids", "events this weekend") into a
// validated DiscoveryIntent: a plain object whose every value is drawn from
// Okanagan Roam's EXISTING taxonomy -- the region slugs, venue types, the
// twelve badge features, the live collection kinds, the outdoor activities,
// the cuisines already in the database, the What's On presets and event
// categories. Hero Search and Build My Trip will both consume this object in
// later phases; nothing consumes it yet.
//
// This module is deliberately PURE: no database, no network, no server
// state. The caller passes in the taxonomy (see buildDiscoveryTaxonomy() in
// server.js), so the module can be tested in isolation and can never reach
// past the values it was given. It never produces a venue id, name, URL,
// price, rating or event -- the only venue it can ever name is an exact
// name match against the taxonomy's own venue list (itself read from the
// database), and it returns that venue's id/region/type/slug, never a URL.
//
// Deterministic by design. A future, optional AI interpreter may produce a
// CANDIDATE intent for requests this parser cannot resolve; that candidate
// must go through validateDiscoveryIntent() below, the same strict local
// validation, before anything trusts it. No AI is called from here.

'use strict';

const DISCOVERY_INTENT_VERSION = 1;
const DISCOVERY_MAX_TEXT_LENGTH = 500;
const DISCOVERY_MODES = ['find', 'recommend', 'plan', 'events', 'navigate', 'unknown'];
const DISCOVERY_OCCASIONS = ['date_night', 'romantic', 'rainy_day', 'family', 'celebration', 'group_getaway', 'relaxing', 'adventure', 'adults'];
const DISCOVERY_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DISCOVERY_DAYPARTS = ['morning', 'afternoon', 'evening'];
const DISCOVERY_MAX_DAYS = 7;
// Editorial collections a visitor can ask for by name. Operational kinds
// (advisory) and structural ones (activity_*, fd_*) are reached through
// other fields (activities, types), never as a "collection" request.
const DISCOVERY_COLLECTION_KINDS = ['hidden_gem', 'local_favorite', 'dog_friendly'];

// Occasions are HEURISTICS, never verified venue attributes: no database
// column says a venue is romantic or indoor. Each one carries the note the
// UI must show so a heuristic is never presented as a fact.
const DISCOVERY_OCCASION_NOTES = {
  date_night: 'Heuristic: ranked for a date night from existing venue types, features and descriptions -- not a verified venue attribute.',
  romantic: 'Heuristic: ranked as romantic from existing venue types, features and descriptions -- not a verified venue attribute.',
  rainy_day: 'Heuristic: favours indoor venue types. Okanagan Roam does not track weather or verify that a venue is indoors.',
  family: 'Heuristic: favours family-oriented places. Only the kid_friendly badge is a verified venue attribute.',
  celebration: 'Heuristic: favours restaurants, lounges, wineries and group-friendly places for a celebration -- not a verified venue attribute.',
  group_getaway: 'Heuristic: favours wineries, breweries, lounges and group-friendly places for a group trip -- not a verified venue attribute.',
  relaxing: 'Heuristic: favours a slower pace with wineries, cafes, beaches and scenic outdoor stops -- not a verified venue attribute.',
  adventure: 'Heuristic: favours active outdoor stops (adventure, hiking, cycling, water) -- not a verified venue attribute.',
  adults: 'Heuristic: an adults-only trip; wineries, breweries and lounges are welcome -- not a verified venue attribute.',
};

// ---------- text normalization ----------

function normalizeDiscoveryText(text) {
  if (typeof text !== 'string') return '';
  return text
    .slice(0, DISCOVERY_MAX_TEXT_LENGTH)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // café -> cafe
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/'s\b/g, 's') // "what's" -> "whats", "joe's" -> "joes"
    .replace(/[-–—_/]/g, ' ') // "dog-friendly" == "dog friendly", "3-day" == "3 day"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- vocabulary ----------
// Every table below maps phrases onto values that must ALSO exist in the
// supplied taxonomy -- buildPhraseTable() drops any entry whose target value
// the taxonomy does not contain, so this file can never introduce a value
// the site does not have.

const REGION_EXTRA_ALIASES = {
  'west-kelowna': ['westbank', 'westside', 'the westside', 'west kelowna'],
  'okanagan-falls': ['ok falls', 'okanagan falls'],
  silverstar: ['silver star', 'silverstar', 'silver star mountain'],
  'big-white': ['big white', 'big white mountain'],
  'lake-country': ['lake country', 'winfield', 'oyama', 'okanagan centre', 'okanagan center', 'carrs landing'],
  apex: ['apex', 'apex mountain'],
  baldy: ['baldy', 'mount baldy', 'baldy mountain'],
};
// Valley-wide scope: understood, and deliberately means "no region filter".
const VALLEY_WIDE_PHRASES = ['okanagan', 'the okanagan', 'okanagan valley', 'the valley', 'anywhere', 'valley wide', 'bc', 'british columbia', 'okanagan lake'];

const TYPE_ALIASES = {
  restaurant: ['restaurant', 'restaurants', 'dining', 'dinner', 'lunch', 'eat', 'eating', 'eats', 'food', 'place to eat', 'places to eat', 'somewhere to eat', 'bistro', 'bistros', 'eatery', 'eateries'],
  cafe: ['cafe', 'cafes', 'coffee', 'coffee shop', 'coffee shops', 'espresso'],
  pub: ['pub', 'pubs', 'bar', 'bars', 'gastropub'],
  cocktail: ['cocktail', 'cocktails', 'cocktail bar', 'cocktail bars', 'cocktail lounge', 'cocktail lounges', 'lounge', 'lounges'],
  brewery: ['brewery', 'breweries', 'beer', 'beers', 'craft beer', 'taproom', 'taprooms', 'brewpub', 'brew pub'],
  distillery: ['distillery', 'distilleries', 'spirits', 'gin', 'whisky', 'whiskey', 'vodka', 'craft spirits'],
  winery: ['wine', 'wines', 'winery', 'wineries', 'vineyard', 'vineyards', 'wine tasting', 'wine tastings', 'tasting room', 'tasting rooms', 'wine tour', 'wine tours', 'wine country'],
  golf: ['golf', 'golfing', 'golf course', 'golf courses', 'tee time', 'tee times', 'driving range', 'mini golf', 'round of golf'],
  beach: ['beach', 'beaches', 'swim', 'swimming', 'swimming spot', 'swimming spots', 'swim spot', 'lake day', 'dog beach', 'dog beaches'],
  outdoor: ['outdoors', 'outdoor', 'park', 'parks', 'outside', 'outdoor activities', 'things to do outside', 'provincial park', 'regional park'],
};

const FEATURE_ALIASES = {
  dog_friendly: ['dog friendly', 'dog', 'dogs', 'my dog', 'with my dog', 'with the dog', 'pet friendly', 'pets', 'dogs allowed', 'dog welcome', 'dogs welcome', 'pup', 'puppy', 'dog beach', 'dog beaches'],
  kid_friendly: ['kid friendly', 'kids', 'kid', 'with kids', 'with my kids', 'with the kids', 'children', 'child', 'toddler', 'toddlers', 'family friendly'],
  vegan: ['vegan', 'vegan friendly', 'vegan options', 'plant based'],
  vegetarian: ['vegetarian', 'vegetarian friendly', 'vegetarian options', 'veggie'],
  gluten_free: ['gluten free', 'gf', 'celiac', 'coeliac'],
  patio: ['patio', 'patios', 'outdoor seating', 'outdoor patio'],
  lake_view: ['lake view', 'lake views', 'lakeview', 'view of the lake', 'views of the lake', 'lakeside view'],
  nonalcoholic: ['non alcoholic', 'nonalcoholic', 'alcohol free', 'mocktail', 'mocktails', 'zero proof'],
  sports_tv: ['sports tv', 'watch the game', 'watch sports', 'watch the hockey', 'sports bar', 'sports bars'],
  live_music: ['live music', 'live band', 'live bands', 'live entertainment'],
  great_groups: ['great for groups', 'good for groups', 'large group', 'large groups', 'big group', 'big groups', 'group dinner', 'groups'],
  happy_hour: ['happy hour', 'happy hours', 'drink specials'],
};

const COLLECTION_ALIASES = {
  hidden_gem: ['hidden gem', 'hidden gems', 'secret spot', 'secret spots', 'off the beaten path', 'local secret', 'local secrets', 'lesser known', 'lesser known places', 'hidden places', 'underrated'],
  local_favorite: ['local favourite', 'local favourites', 'local favorite', 'local favorites', 'where locals go', 'locals favourite', 'locals favorite', 'local spots'],
};

const ACTIVITY_ALIASES = {
  hiking: ['hike', 'hikes', 'hiking', 'trail', 'trails', 'walking trail', 'walking trails', 'nature walk', 'nature walks'],
  cycling: ['bike', 'bikes', 'biking', 'cycling', 'mountain biking', 'bike trail', 'bike trails', 'bike ride'],
  winter: ['ski', 'skiing', 'snowshoe', 'snowshoeing', 'cross country skiing', 'skating', 'ice skating', 'tubing', 'winter activities'],
  camping: ['camp', 'camping', 'campground', 'campgrounds', 'campsite', 'campsites'],
  nature: ['nature', 'birding', 'bird watching', 'birdwatching', 'wildlife', 'wetland', 'wetlands'],
  water: ['paddle', 'paddling', 'paddleboard', 'paddleboarding', 'paddle board', 'sup', 'kayak', 'kayaking', 'canoe', 'canoeing', 'boating', 'boat rental', 'boat rentals'],
  viewpoints: ['viewpoint', 'viewpoints', 'lookout', 'lookouts', 'scenic view', 'scenic views', 'view point'],
  adventure: ['zipline', 'ziplining', 'zip line', 'zip lining', 'adventure', 'adventures', 'ropes course'],
  fishing: ['fish', 'fishing'],
};

// Synonyms that point at a cuisine value ONLY if that value is really in
// the database's cuisine list; the cuisine values themselves are added
// verbatim from the taxonomy.
const CUISINE_SYNONYMS = {
  japanese: ['sushi', 'ramen'],
  bbq: ['barbecue', 'bbq'],
  dessert: ['desserts', 'ice cream', 'gelato'],
  steakhouse: ['steak', 'steaks'],
  'bubble tea': ['boba'],
  seafood: ['fish and chips'],
};

const BUDGET_ALIASES = {
  budget: ['cheap', 'inexpensive', 'affordable', 'on a budget', 'low cost', 'budget friendly', 'cheap eats'],
  moderate: ['mid range', 'reasonable', 'reasonably priced', 'moderately priced'],
  upscale: ['upscale', 'high end', 'higher end', 'luxury', 'luxurious', 'splurge', 'premium', 'fancy', 'fine dining', 'expensive'],
};

const PACE_ALIASES = {
  relaxed: ['relaxed', 'relaxing', 'easygoing', 'easy going', 'slow', 'slower', 'slow paced', 'slower pace', 'leisurely', 'laid back', 'chill', 'take it easy', 'unhurried', 'easy days', 'easy day'],
  standard: ['balanced', 'moderate pace', 'normal pace', 'standard pace'],
  packed: ['packed', 'action packed', 'jam packed', 'busy', 'full on', 'see as much as possible', 'as much as possible'],
};

const OCCASION_ALIASES = {
  date_night: ['date night', 'date', 'a date', 'date idea', 'date ideas', 'dinner date'],
  romantic: ['romantic', 'romance', 'anniversary', 'honeymoon', 'couples', 'for two'],
  rainy_day: ['rain', 'rains', 'raining', 'rainy', 'rainy day', 'rainy days', 'wet weather', 'indoor', 'indoors', 'inside'],
  family: ['family', 'families', 'with the family', 'family trip', 'family day'],
  celebration: ['birthday', 'birthday dinner', 'birthday weekend', 'celebrate', 'celebration', 'celebrating'],
  group_getaway: ['girls weekend', 'girls trip', 'girls getaway', 'guys weekend', 'guys trip', 'bachelorette', 'bachelor party', 'with friends', 'friends weekend', 'group of friends'],
  relaxing: ['relaxing getaway', 'relaxing weekend', 'relaxing trip', 'unwind'],
  adventure: ['adventure weekend', 'adventure trip', 'adventurous', 'thrill', 'thrills'],
  adults: ['two adults', 'for two adults', 'adults only', 'just adults', 'no kids', 'couple', 'a couple', 'just the two of us'],
};
// Occasion phrases that also carry a trip length or pace.
const OCCASION_EXTRAS = {
  'girls weekend': [['length', 2]], 'guys weekend': [['length', 2]], 'friends weekend': [['length', 2]], 'birthday weekend': [['length', 2]],
  'relaxing weekend': [['length', 2], ['pace', 'relaxed']], 'relaxing getaway': [['pace', 'relaxed']], 'relaxing trip': [['pace', 'relaxed']],
  'adventure weekend': [['length', 2]],
  'birthday dinner': [['type', 'restaurant']],
};

// Event nouns switch the request to mode 'events'. Category words are only
// honoured once the request is about events.
const EVENT_PHRASES = ['event', 'events', 'whats on', 'what is on', 'happening', 'happenings', 'going on', 'things happening', 'festival', 'festivals', 'concert', 'concerts', 'gig', 'gigs', 'live show', 'live shows'];
const EVENT_CATEGORY_ALIASES = {
  'events-festivals': ['festival', 'festivals'],
  'live-music': ['concert', 'concerts', 'gig', 'gigs', 'live music'],
  'markets-fairs': ['market', 'markets', 'farmers market', 'farmers markets', 'fair', 'fairs'],
  'family-kids': ['kids', 'family', 'families', 'children'],
  nightlife: ['nightlife'],
  'wineries-wine-events': ['wine', 'wine event', 'wine events', 'wine festival'],
  'food-drink-events': ['food festival', 'food event', 'food events'],
  'arts-culture': ['art', 'arts', 'theatre', 'theater', 'gallery', 'galleries'],
  'sports-recreation': ['race', 'races', 'tournament', 'tournaments'],
  'holiday-seasonal': ['christmas', 'halloween', 'holiday', 'holidays', 'thanksgiving', 'easter'],
  'workshops-classes': ['workshop', 'workshops', 'class', 'classes'],
  'community-events': ['community event', 'community events'],
};

const WHEN_ALIASES = {
  today: ['today', 'this afternoon', 'this morning'],
  tonight: ['tonight', 'this evening'],
  now: ['right now'],
  tomorrow: ['tomorrow'],
  'this-weekend': ['this weekend', 'this coming weekend', 'on the weekend this week'],
  'this-week': ['this week'],
  'this-month': ['this month'],
};
// A time of day said alongside a day ("tomorrow morning", "Friday night",
// "Saturday afternoon"). Only kept when a day was also given; consumed
// either way so the words never become search terms.
const DAYPART_ALIASES = {
  morning: ['morning', 'in the morning'],
  afternoon: ['afternoon', 'in the afternoon'],
  evening: ['evening', 'in the evening', 'night'],
};
const WHEN_PHRASE_DAYPART = { 'this morning': 'morning', 'this afternoon': 'afternoon', tonight: 'evening', 'this evening': 'evening' };
// Which of those resolve onto an existing What's On preset (the rest are
// recorded as-is and resolved by the server in a later phase).
const WHEN_TO_PRESET = { today: 'today', tonight: 'today', now: 'today', 'this-weekend': 'this-weekend', 'this-week': 'this-week', 'this-month': 'this-month' };

// Understood as "the visitor wants suggestions of anything" -- consumed so
// they do not become text terms, but they map to no filter.
const SCOPE_PHRASES = ['things to do', 'something to do', 'what to do', 'stuff to do', 'fun things', 'activities', 'activity', 'attractions', 'places to go', 'places to visit', 'somewhere to go', 'what should i do', 'what can we do', 'what can i do', 'what to see', 'things to see', 'sights', 'sightseeing'];

const PLAN_PHRASES = ['plan', 'planning', 'itinerary', 'trip', 'getaway', 'vacation', 'road trip', 'schedule', 'weekend away'];
const RECOMMEND_PHRASES = ['recommend', 'recommendation', 'recommendations', 'suggest', 'suggestion', 'suggestions', 'find me', 'where can i', 'where can we', 'where should i', 'where should we', 'where to get', 'where to find'];
const SUPERLATIVE_PHRASES = ['best', 'top', 'greatest', 'great', 'nicest', 'favourite', 'favorite', 'must see', 'must try', 'top rated', 'highest rated'];

// Travel-related concepts Okanagan Roam knowingly cannot satisfy today.
const UNSUPPORTED_PHRASES = [
  'wheelchair', 'wheelchair accessible', 'wheelchair access', 'accessible', 'accessibility', 'mobility',
  'open now', 'open late', 'open 24 hours', 'late night', 'reservation', 'reservations', 'book a table', 'booking',
  'hotel', 'hotels', 'accommodation', 'accommodations', 'lodging', 'airbnb', 'where to stay', 'place to stay',
  'car rental', 'rental car', 'taxi', 'uber', 'shuttle', 'weather', 'forecast',
  'helicopter', 'helicopter tour', 'private jet', 'michelin', 'michelin star',
  'next weekend', 'next week', 'next month', 'last weekend',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
];

const DAY_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1 };
const LENGTH_PHRASES = [
  { phrase: 'long weekend', days: 3 },
  { phrase: 'weekend', days: 2 },
  { phrase: 'day trip', days: 1 },
  { phrase: 'a week', days: 7 },
  { phrase: 'one week', days: 7 },
  { phrase: 'week long', days: 7 },
];
const DAYS_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|a)\s+(?:(?:relaxed|relaxing|easy|packed|busy|full|fun|lazy|leisurely|great|amazing|chill)\s+)?days?\b/g;
const DAYS_NIGHTS_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven)\s+nights?\b/g;

// Words that carry no meaning of their own -- never become text terms.
const STOPWORDS = new Set(('a an the and or but of to in on at around near by for from with without into about over under up down out '
  + 'i im me my we us our you your it its is are be was were been being am do does did done doing can could should would will shall may might must '
  + 'want wants wanted like love need needs looking look find finding show give get getting go going going visit visiting see some any somewhere something '
  + 'please thanks thank plan planning where what which who whom how when why there here this that these those just really very so too also '
  + 'good nice fun place places spot spots area areas town city day days night nights time trip trips weekend lets let us okay ok hi hey '
  + 'if then than else only one ones all more most much many few little lot lots kind sort type types option options idea ideas '
  + 'around tonight today tomorrow while during after before next last then take takes taking bring bringing stay staying '
  + 'whats wanna gonna ive id nearby close near').split(/\s+/));

// ---------- table construction ----------

function uniq(list) { return Array.from(new Set(list)); }

// [{ phrase, assign: [{ field, value }] }] -- every value checked against the
// taxonomy, every phrase normalized the same way as the input.
function buildPhraseTable(taxonomy) {
  const t = normalizeTaxonomy(taxonomy);
  const entries = new Map();
  const add = (phrase, field, value) => {
    const p = normalizeDiscoveryText(phrase);
    if (!p) return;
    if (!entries.has(p)) entries.set(p, []);
    const list = entries.get(p);
    if (!list.some((a) => a.field === field && a.value === value)) list.push({ field, value });
  };

  for (const slug of t.regions) {
    add(slug.replace(/-/g, ' '), 'region', slug);
    if (t.regionLabels[slug]) add(t.regionLabels[slug], 'region', slug);
    for (const extra of REGION_EXTRA_ALIASES[slug] || []) add(extra, 'region', slug);
  }
  for (const p of VALLEY_WIDE_PHRASES) add(p, 'scope', 'valley');
  for (const [type, phrases] of Object.entries(TYPE_ALIASES)) if (t.types.includes(type)) for (const p of phrases) add(p, 'type', type);
  for (const [feature, phrases] of Object.entries(FEATURE_ALIASES)) if (t.features.includes(feature)) for (const p of phrases) add(p, 'feature', feature);
  for (const [kind, phrases] of Object.entries(COLLECTION_ALIASES)) if (t.collections.includes(kind)) for (const p of phrases) add(p, 'collection', kind);
  for (const [slug, phrases] of Object.entries(ACTIVITY_ALIASES)) if (t.activities.includes(slug)) for (const p of phrases) add(p, 'activity', slug);
  const typeWords = new Set(Object.values(TYPE_ALIASES).flat().map(normalizeDiscoveryText));
  for (const cuisine of t.cuisines) if (!typeWords.has(normalizeDiscoveryText(cuisine))) add(cuisine, 'cuisine', cuisine);
  for (const [cuisine, phrases] of Object.entries(CUISINE_SYNONYMS)) if (t.cuisines.includes(cuisine)) for (const p of phrases) add(p, 'cuisine', cuisine);
  for (const [budget, phrases] of Object.entries(BUDGET_ALIASES)) if (t.budgets.includes(budget)) for (const p of phrases) add(p, 'budget', budget);
  if (t.types.includes('restaurant')) add('fine dining', 'type', 'restaurant');
  for (const [pace, phrases] of Object.entries(PACE_ALIASES)) if (t.paces.includes(pace)) for (const p of phrases) add(p, 'pace', pace);
  for (const [occasion, phrases] of Object.entries(OCCASION_ALIASES)) for (const p of phrases) add(p, 'occasion', occasion);
  for (const [phrase, extras] of Object.entries(OCCASION_EXTRAS)) for (const [field, value] of extras) {
    if (field === 'pace' && !t.paces.includes(value)) continue;
    if (field === 'type' && !t.types.includes(value)) continue;
    add(phrase, field, value);
  }
  for (const p of EVENT_PHRASES) add(p, 'event', true);
  for (const [cat, phrases] of Object.entries(EVENT_CATEGORY_ALIASES)) if (t.eventCategories.includes(cat)) for (const p of phrases) {
    add(p, 'eventCategory', cat);
    // "wine events", "food festival", "farmers market": the category phrase is
    // itself an event request (markets and fairs exist only as What's On events,
    // never as a venue type).
    if (/\b(events?|festivals?|concerts?|gigs?|markets?|fairs?)\b/.test(p)) add(p, 'event', true);
  }
  for (const [when, phrases] of Object.entries(WHEN_ALIASES)) for (const p of phrases) add(p, 'when', when);
  for (const day of DISCOVERY_WEEKDAYS) add(day, 'when', day);
  for (const [part, phrases] of Object.entries(DAYPART_ALIASES)) for (const p of phrases) add(p, 'daypart', part);
  for (const p of SCOPE_PHRASES) add(p, 'scope', 'anything');
  for (const p of PLAN_PHRASES) add(p, 'plan', true);
  for (const p of RECOMMEND_PHRASES) add(p, 'recommend', true);
  for (const p of SUPERLATIVE_PHRASES) add(p, 'superlative', true);
  for (const p of UNSUPPORTED_PHRASES) add(p, 'unsupported', p);
  for (const { phrase, days } of LENGTH_PHRASES) add(phrase, 'length', days);
  // Combined phrases that carry two meanings at once.
  if (t.types.includes('pub') && t.features.includes('sports_tv')) { add('sports bar', 'type', 'pub'); add('sports bars', 'type', 'pub'); }
  if (t.types.includes('beach')) { add('dog beach', 'type', 'beach'); add('dog beaches', 'type', 'beach'); }
  if (t.types.includes('restaurant')) { add('dinner date', 'type', 'restaurant'); }
  // "food and drink" is the whole Food & Drink family; "drinks" the bar side of it.
  for (const type of ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery']) if (t.types.includes(type)) { add('food and drink', 'type', type); add('food and drinks', 'type', type); }
  for (const type of ['pub', 'cocktail']) if (t.types.includes(type)) { add('drinks', 'type', type); add('a drink', 'type', type); }

  return Array.from(entries.entries()).map(([phrase, assign]) => ({ phrase, words: phrase.split(' '), assign }));
}

function normalizeTaxonomy(taxonomy) {
  const t = taxonomy || {};
  const regionLabels = t.regionLabels || {};
  const regions = Array.isArray(t.regions) ? t.regions.slice() : Object.keys(regionLabels);
  return {
    regions,
    regionLabels,
    types: Array.isArray(t.types) ? t.types.slice() : [],
    features: Array.isArray(t.features) ? t.features.slice() : [],
    collections: (Array.isArray(t.collections) ? t.collections : []).filter((k) => DISCOVERY_COLLECTION_KINDS.includes(k)),
    activities: Array.isArray(t.activities) ? t.activities.slice() : [],
    cuisines: (Array.isArray(t.cuisines) ? t.cuisines : []).map((c) => String(c).toLowerCase().trim()).filter(Boolean),
    budgets: Array.isArray(t.budgets) ? t.budgets.slice() : [],
    paces: Array.isArray(t.paces) ? t.paces.slice() : [],
    datePresets: Array.isArray(t.datePresets) ? t.datePresets.slice() : [],
    eventCategories: Array.isArray(t.eventCategories) ? t.eventCategories.slice() : [],
    venues: Array.isArray(t.venues) ? t.venues : [],
  };
}

// ---------- matching ----------

// All phrase occurrences over the token list, then a greedy longest-first
// selection so "west kelowna" wins over "kelowna" and "this weekend" wins
// over "weekend"; no token is claimed by two phrases.
function matchPhrases(tokens, table) {
  const hits = [];
  for (const entry of table) {
    const n = entry.words.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) if (tokens[i + j] !== entry.words[j]) { ok = false; break; }
      if (ok) hits.push({ start: i, end: i + n, phrase: entry.phrase, assign: entry.assign });
    }
  }
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const claimed = new Array(tokens.length).fill(false);
  const accepted = [];
  for (const h of hits) {
    let free = true;
    for (let k = h.start; k < h.end; k++) if (claimed[k]) { free = false; break; }
    if (!free) continue;
    for (let k = h.start; k < h.end; k++) claimed[k] = true;
    accepted.push(h);
  }
  accepted.sort((a, b) => a.start - b.start);
  return { accepted, claimed };
}

function wordToNumber(word) {
  if (/^\d+$/.test(word)) return parseInt(word, 10);
  return Object.prototype.hasOwnProperty.call(DAY_WORDS, word) ? DAY_WORDS[word] : null;
}

// Trip length. "3 days", "three relaxed days", "a 3 day trip", "2 nights"
// (nights + 1 days). Returns every length mention with its token span.
function findLengths(normalized) {
  const out = [];
  const tokenStart = (charIndex) => (normalized.slice(0, charIndex).match(/\S+/g) || []).length;
  let m;
  DAYS_RE.lastIndex = 0;
  while ((m = DAYS_RE.exec(normalized)) !== null) {
    const n = wordToNumber(m[1]);
    if (n === null) continue;
    const start = tokenStart(m.index);
    out.push({ start, end: start + m[0].split(' ').length, days: n, phrase: m[0] });
  }
  DAYS_NIGHTS_RE.lastIndex = 0;
  while ((m = DAYS_NIGHTS_RE.exec(normalized)) !== null) {
    const n = wordToNumber(m[1]);
    if (n === null) continue;
    const start = tokenStart(m.index);
    out.push({ start, end: start + m[0].split(' ').length, days: n + 1, phrase: m[0] });
  }
  return out;
}

// Exact venue-name match against the taxonomy's own venue list: the WHOLE
// request is a venue name, optionally with a region word before or after it
// ("rotary beach park oliver"). Never a partial/fuzzy match.
function matchExactVenue(normalized, t) {
  if (!t.venues.length || !normalized) return { venue: null, ambiguity: null };
  const strip = (s) => s.replace(/^the /, '');
  const byName = new Map();
  for (const v of t.venues) {
    if (!v || !Number.isInteger(v.id) || typeof v.name !== 'string') continue;
    const key = strip(normalizeDiscoveryText(v.name));
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(v);
  }
  const q = strip(normalized);
  const pick = (list, phrase) => (list.length === 1
    ? { venue: { id: list[0].id, region: list[0].region, type: list[0].type, slug: list[0].slug }, ambiguity: null }
    : { venue: null, ambiguity: { phrase, field: 'exactVenue', options: list.map((v) => v.id) } });
  if (byName.has(q)) return pick(byName.get(q), q);
  // name + region (either order) narrows a chain / repeated park name.
  for (const slug of t.regions) {
    const labels = uniq([slug.replace(/-/g, ' '), normalizeDiscoveryText(t.regionLabels[slug] || '')].filter(Boolean));
    for (const label of labels) {
      for (const candidate of [q.endsWith(` ${label}`) ? q.slice(0, -label.length - 1) : null, q.startsWith(`${label} `) ? q.slice(label.length + 1) : null]) {
        if (!candidate) continue;
        const list = (byName.get(strip(candidate)) || []).filter((v) => v.region === slug);
        if (list.length) return pick(list, q);
      }
    }
  }
  return { venue: null, ambiguity: null };
}

// ---------- the interpreter ----------

function clearVenueFields(intent) {
  intent.types = [];
  intent.features = [];
  intent.collections = [];
  intent.activities = [];
  intent.cuisines = [];
  intent.party = { kids: false, dog: false };
  intent.structure = null;
}

function emptyIntent() {
  return {
    version: DISCOVERY_INTENT_VERSION,
    mode: 'unknown',
    regions: [],
    types: [],
    features: [],
    collections: [],
    activities: [],
    cuisines: [],
    textTerms: [],
    budget: null,
    when: null,
    days: null,
    pace: null,
    party: { kids: false, dog: false },
    occasion: null,
    eventCategories: [],
    structure: null,
    superlative: false,
    exactVenue: null,
    foodTerms: [],
    eventPlanning: false,
    matched: [],
    unsupported: [],
    ambiguities: [],
    conflicts: [],
    heuristics: [],
    needs: [],
    confidence: 'low',
    source: 'deterministic',
  };
}

// Type -> the daypart it naturally belongs to, for ordered multi-part
// requests ("a romantic winery and dinner").
const TYPE_DAYPART = { cafe: 'morning', winery: 'afternoon', golf: 'morning', beach: 'afternoon', outdoor: 'morning', brewery: 'afternoon', distillery: 'afternoon', restaurant: 'evening', pub: 'evening', cocktail: 'evening' };

function interpretDiscoveryQuery(text, taxonomy, options) {
  const opts = options || {};
  const t = normalizeTaxonomy(taxonomy);
  const table = opts.phraseTable || buildPhraseTable(taxonomy);
  const intent = emptyIntent();
  const normalized = normalizeDiscoveryText(text);
  if (!normalized) return finalizeIntent(intent, t);

  // 1. An exact venue name wins outright.
  const exact = matchExactVenue(normalized, t);
  if (exact.venue) {
    intent.exactVenue = exact.venue;
    intent.mode = 'navigate';
    intent.matched.push({ phrase: normalized, field: 'exactVenue', value: exact.venue.id });
    return finalizeIntent(intent, t);
  }
  if (exact.ambiguity) intent.ambiguities.push(exact.ambiguity);

  const tokens = normalized.split(' ');
  // 2. Trip lengths claim their tokens first ("3 relaxed days").
  const lengths = findLengths(normalized);
  const preClaimed = new Array(tokens.length).fill(false);
  for (const l of lengths) for (let k = l.start; k < l.end && k < tokens.length; k++) preClaimed[k] = true;
  // 3. Phrase matching over the remaining tokens.
  const masked = tokens.map((tok, i) => (preClaimed[i] ? '\u0000' : tok));
  const { accepted, claimed } = matchPhrases(masked, table);

  const flags = { event: false, plan: false, recommend: false, scopeAnything: false };
  const lengthMentions = lengths.map((l) => ({ days: l.days, phrase: l.phrase, start: l.start }));
  const budgetMentions = [], paceMentions = [], occasionMentions = [], whenMentions = [], daypartMentions = [];
  const eventCats = [];
  const orderedTypes = [];

  for (const hit of accepted) {
    for (const { field, value } of hit.assign) {
      switch (field) {
        case 'region': intent.regions.push(value); break;
        case 'type': intent.types.push(value); orderedTypes.push({ type: value, start: hit.start }); break;
        case 'feature': intent.features.push(value); break;
        case 'collection': intent.collections.push(value); break;
        case 'activity': intent.activities.push(value); break;
        case 'cuisine': intent.cuisines.push(value); break;
        case 'budget': budgetMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'pace': paceMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'occasion': occasionMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'when': whenMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'daypart': daypartMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'event': flags.event = true; break;
        case 'eventCategory': eventCats.push(value); break;
        case 'plan': flags.plan = true; break;
        case 'recommend': flags.recommend = true; break;
        case 'superlative': intent.superlative = true; break;
        case 'scope': if (value === 'anything') flags.scopeAnything = true; break;
        case 'length': lengthMentions.push({ days: value, phrase: hit.phrase, start: hit.start }); break;
        case 'unsupported': intent.unsupported.push(value); break;
        default: break;
      }
      intent.matched.push({ phrase: hit.phrase, field, value });
    }
  }
  for (const l of lengths) intent.matched.push({ phrase: l.phrase, field: 'days', value: l.days });

  // 4. Leftover meaningful words become text terms (e.g. "poutine"). They
  // are the visitor's own words, searched later against venue text; never
  // generated here.
  for (let i = 0; i < tokens.length; i++) {
    if (preClaimed[i] || claimed[i]) continue;
    const w = tokens[i];
    if (STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 2) continue;
    intent.textTerms.push(w);
  }

  // 5. Single-valued fields: the last mention wins; disagreements are
  // recorded as conflicts rather than silently resolved.
  const lastOf = (field, mentions) => {
    const values = uniq(mentions.map((m) => m.value));
    if (values.length > 1) intent.conflicts.push({ field, values });
    return mentions.length ? mentions.slice().sort((a, b) => a.start - b.start)[mentions.length - 1].value : null;
  };
  intent.budget = lastOf('budget', budgetMentions);
  intent.pace = lastOf('pace', paceMentions);
  const occasion = lastOf('occasion', occasionMentions);
  intent.occasion = occasion;
  const lengthDays = lastOf('days', lengthMentions.map((l) => ({ value: l.days, start: l.start })));
  if (lengthDays !== null) {
    if (lengthDays >= 1 && lengthDays <= DISCOVERY_MAX_DAYS) intent.days = lengthDays;
    else intent.unsupported.push(`${lengthDays} days (the planner covers 1-${DISCOVERY_MAX_DAYS})`);
  }
  const whenValue = lastOf('when', whenMentions);
  if (whenValue) {
    if (DISCOVERY_WEEKDAYS.includes(whenValue)) intent.when = { weekday: whenValue };
    else if (WHEN_TO_PRESET[whenValue] && t.datePresets.includes(WHEN_TO_PRESET[whenValue])) {
      intent.when = { preset: WHEN_TO_PRESET[whenValue] };
      if (whenValue === 'tonight') intent.when.daypart = 'evening';
      if (whenValue === 'now') intent.when.now = true; // "right now": the current Okanagan time
    } else if (whenValue === 'tomorrow') intent.when = { relative: 'tomorrow' };
    else intent.unsupported.push(whenValue);
  }
  // The time of day: from the day phrase itself ("this afternoon") or a
  // separate word next to it ("Friday night"). Never guessed without a day.
  if (intent.when) {
    const lastWhen = whenMentions.slice().sort((a, b) => a.start - b.start)[whenMentions.length - 1];
    const fromPhrase = lastWhen && WHEN_PHRASE_DAYPART[lastWhen.phrase];
    const part = fromPhrase || lastOf('daypart', daypartMentions);
    if (part && DISCOVERY_DAYPARTS.includes(part) && !intent.when.now) intent.when.daypart = part;
  }

  // 6. Deduplicate multi-valued fields, preserving first-mention order.
  for (const key of ['regions', 'types', 'features', 'collections', 'activities', 'cuisines', 'textTerms', 'unsupported']) intent[key] = uniq(intent[key]);

  // 6b. The visitor's own food words, kept for display: "sushi" stays
  // "sushi" even though it matches the Japanese cuisine internally.
  for (const m of intent.matched) if (m.field === 'cuisine' && !intent.foodTerms.some((f) => f.term === m.phrase)) intent.foodTerms.push({ term: m.phrase, cuisine: m.value });
  for (const w of intent.textTerms) if (!intent.foodTerms.some((f) => f.term === w)) intent.foodTerms.push({ term: w, cuisine: null });

  // 7. Party + collection combinations derived from what was actually said.
  intent.party.kids = intent.features.includes('kid_friendly');
  intent.party.dog = intent.features.includes('dog_friendly');
  if (intent.party.dog && intent.types.includes('beach') && t.collections.includes('dog_friendly') && !intent.collections.includes('dog_friendly')) {
    intent.collections.push('dog_friendly');
  }

  // 8. Mode.
  if (flags.event) {
    intent.mode = 'events';
    intent.eventCategories = uniq(eventCats);
    intent.eventPlanning = flags.plan;
  } else if (flags.plan || lengthMentions.length > 0) {
    intent.mode = 'plan';
  } else if (flags.recommend || intent.superlative || occasion === 'date_night' || occasion === 'romantic') {
    intent.mode = 'recommend';
  } else if (intent.regions.length || intent.types.length || intent.features.length || intent.collections.length
    || intent.activities.length || intent.cuisines.length || intent.textTerms.length || occasion || flags.scopeAnything
    || intent.budget || intent.when || intent.pace) {
    intent.mode = 'find';
  }
  // Outside an events request, event category words are just words; inside
  // one, venue fields are dropped -- events never select venues.
  if (intent.mode !== 'events') intent.eventCategories = [];
  else clearVenueFields(intent);

  // 9. Ordered multi-part request ("a romantic winery and dinner").
  if (intent.mode === 'recommend' && orderedTypes.length >= 2) {
    const seen = new Set();
    intent.structure = orderedTypes
      .filter((o) => (seen.has(o.type) ? false : seen.add(o.type)))
      .map((o) => ({ types: [o.type], daypart: TYPE_DAYPART[o.type] || 'afternoon' }));
  }

  // 10. Heuristic notes -- occasions are never verified attributes.
  if (occasion && DISCOVERY_OCCASION_NOTES[occasion]) intent.heuristics.push({ field: 'occasion', value: occasion, note: DISCOVERY_OCCASION_NOTES[occasion] });
  if (intent.budget) intent.heuristics.push({ field: 'budget', value: intent.budget, note: 'Budget ranks venues with a known price; venues without price data are never excluded and their price is never inferred.' });

  return finalizeIntent(intent, t);
}

// Needs + confidence, recomputed locally for every intent (including any
// future AI candidate): never taken on trust.
function finalizeIntent(intent, t) {
  intent.needs = [];
  const valleyWide = intent.matched.some((m) => m.field === 'scope' && m.value === 'valley');
  if (intent.mode === 'plan') {
    // "the Okanagan" is an explicit, valley-wide answer to "where?".
    if (!intent.regions.length && !valleyWide) intent.needs.push('region');
    if (intent.days === null) intent.needs.push('days');
  }
  if (intent.mode === 'recommend' && intent.structure && intent.structure.length >= 2 && !intent.regions.length) intent.needs.push('region');

  const structured = intent.regions.length + intent.types.length + intent.features.length + intent.collections.length
    + intent.activities.length + intent.cuisines.length + intent.eventCategories.length
    + (intent.occasion ? 1 : 0) + (intent.when ? 1 : 0) + (intent.days !== null ? 1 : 0) + (intent.pace ? 1 : 0)
    + (intent.budget ? 1 : 0) + (intent.exactVenue ? 1 : 0) + (intent.mode === 'events' ? 1 : 0)
    + (intent.matched.some((m) => m.field === 'scope') ? 1 : 0);
  const issues = intent.needs.length + intent.ambiguities.length + intent.conflicts.length + intent.unsupported.length;

  if (intent.mode === 'unknown' || (!structured && intent.textTerms.length === 0)) intent.confidence = 'low';
  else if (intent.textTerms.length > 2) intent.confidence = 'low';
  else if (issues > 0 || intent.textTerms.length > 0) intent.confidence = 'medium';
  else intent.confidence = 'high';
  return intent;
}

// ---------- validation (the future AI boundary) ----------
//
// Accepts an UNTRUSTED candidate intent -- e.g. from a future AI parser --
// and returns only what the local taxonomy and the visitor's own text
// support. Anything else is dropped and listed in `rejected`:
//   - keys outside the schema (ids, urls, prices, ratings, venues, events...)
//   - enum values outside the taxonomy
//   - regions / text terms / cuisines with no supporting words in the text
//   - exactVenue (only the deterministic name match may ever set it)
// Mode is kept only if it is a known mode; confidence, needs and
// heuristics are recomputed locally.
const INTENT_KEYS = new Set(Object.keys(emptyIntent()));

function validateDiscoveryIntent(candidate, taxonomy, text) {
  const t = normalizeTaxonomy(taxonomy);
  const rejected = [];
  const out = emptyIntent();
  out.source = 'ai';
  const normalized = normalizeDiscoveryText(text || '');
  const tokens = new Set(normalized.split(' ').filter(Boolean));
  const hasPhrase = (phrase) => { const p = normalizeDiscoveryText(phrase); return !!p && ` ${normalized} `.indexOf(` ${p} `) !== -1; };

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    rejected.push({ field: '*', reason: 'not_an_object' });
    return { intent: finalizeIntent(out, t), rejected };
  }
  for (const key of Object.keys(candidate)) if (!INTENT_KEYS.has(key)) rejected.push({ field: key, reason: 'unknown_field' });

  const list = (v) => (Array.isArray(v) ? v : []);
  const keepEnum = (field, values, allowed) => {
    const kept = [];
    for (const v of list(values)) {
      if (typeof v === 'string' && allowed.includes(v)) { if (!kept.includes(v)) kept.push(v); } else rejected.push({ field, value: v, reason: 'not_in_taxonomy' });
    }
    return kept;
  };

  if (typeof candidate.mode === 'string' && DISCOVERY_MODES.includes(candidate.mode) && candidate.mode !== 'navigate') out.mode = candidate.mode;
  else if (candidate.mode !== undefined) rejected.push({ field: 'mode', value: candidate.mode, reason: 'not_allowed' });

  // Regions need textual evidence: a region the visitor never mentioned is
  // exactly the kind of hallucination this boundary exists to stop.
  for (const r of keepEnum('regions', candidate.regions, t.regions)) {
    const aliases = [r.replace(/-/g, ' '), t.regionLabels[r] || '', ...(REGION_EXTRA_ALIASES[r] || [])].filter(Boolean);
    if (aliases.some(hasPhrase)) out.regions.push(r); else rejected.push({ field: 'regions', value: r, reason: 'not_in_text' });
  }
  out.types = keepEnum('types', candidate.types, t.types);
  out.features = keepEnum('features', candidate.features, t.features);
  out.collections = keepEnum('collections', candidate.collections, t.collections);
  out.activities = keepEnum('activities', candidate.activities, t.activities);
  for (const c of keepEnum('cuisines', candidate.cuisines, t.cuisines)) {
    const words = [c, ...(CUISINE_SYNONYMS[c] || [])];
    if (words.some(hasPhrase)) out.cuisines.push(c); else rejected.push({ field: 'cuisines', value: c, reason: 'not_in_text' });
  }
  for (const term of list(candidate.textTerms)) {
    const n = typeof term === 'string' ? normalizeDiscoveryText(term) : '';
    if (n && n.split(' ').every((w) => tokens.has(w))) { if (!out.textTerms.includes(n)) out.textTerms.push(n); } else rejected.push({ field: 'textTerms', value: term, reason: 'not_in_text' });
  }
  out.eventCategories = keepEnum('eventCategories', candidate.eventCategories, t.eventCategories);
  if (candidate.budget != null) { if (t.budgets.includes(candidate.budget)) out.budget = candidate.budget; else rejected.push({ field: 'budget', value: candidate.budget, reason: 'not_in_taxonomy' }); }
  if (candidate.pace != null) { if (t.paces.includes(candidate.pace)) out.pace = candidate.pace; else rejected.push({ field: 'pace', value: candidate.pace, reason: 'not_in_taxonomy' }); }
  if (candidate.occasion != null) { if (DISCOVERY_OCCASIONS.includes(candidate.occasion)) out.occasion = candidate.occasion; else rejected.push({ field: 'occasion', value: candidate.occasion, reason: 'not_in_taxonomy' }); }
  if (candidate.days != null) {
    if (Number.isInteger(candidate.days) && candidate.days >= 1 && candidate.days <= DISCOVERY_MAX_DAYS) out.days = candidate.days;
    else rejected.push({ field: 'days', value: candidate.days, reason: 'out_of_range' });
  }
  if (candidate.when != null) {
    const w = candidate.when;
    const ok = w && typeof w === 'object' && !Array.isArray(w) && Object.keys(w).every((k) => ['preset', 'weekday', 'relative', 'daypart', 'now'].includes(k))
      && (w.now === undefined || (w.now === true && w.preset === 'today'))
      && (w.preset === undefined || t.datePresets.includes(w.preset))
      && (w.weekday === undefined || DISCOVERY_WEEKDAYS.includes(w.weekday))
      && (w.relative === undefined || w.relative === 'tomorrow')
      && (w.daypart === undefined || DISCOVERY_DAYPARTS.includes(w.daypart))
      && (w.preset !== undefined || w.weekday !== undefined || w.relative !== undefined);
    if (ok) out.when = { ...w }; else rejected.push({ field: 'when', value: w, reason: 'invalid' });
  }
  if (candidate.party && typeof candidate.party === 'object') {
    out.party.kids = candidate.party.kids === true && out.features.includes('kid_friendly');
    out.party.dog = candidate.party.dog === true && out.features.includes('dog_friendly');
  }
  out.superlative = candidate.superlative === true;
  if (Array.isArray(candidate.structure)) {
    const steps = [];
    for (const step of candidate.structure) {
      const types = step && Array.isArray(step.types) ? step.types.filter((x) => out.types.includes(x)) : [];
      if (types.length && DISCOVERY_DAYPARTS.includes(step.daypart)) steps.push({ types, daypart: step.daypart }); else rejected.push({ field: 'structure', value: step, reason: 'invalid' });
    }
    out.structure = steps.length ? steps : null;
  }
  if (candidate.exactVenue != null) rejected.push({ field: 'exactVenue', value: candidate.exactVenue, reason: 'only_deterministic_name_match' });
  for (const u of list(candidate.unsupported)) {
    const n = typeof u === 'string' ? normalizeDiscoveryText(u) : '';
    if (n && n.split(' ').every((w) => tokens.has(w))) { if (out.unsupported.length < 10 && !out.unsupported.includes(n)) out.unsupported.push(n); } else rejected.push({ field: 'unsupported', value: u, reason: 'not_in_text' });
  }
  if (out.mode === 'events') {
    for (const key of ['types', 'features', 'collections', 'activities', 'cuisines']) if (out[key].length) rejected.push({ field: key, value: out[key], reason: 'events_never_select_venues' });
    clearVenueFields(out);
  } else out.eventCategories = [];
  if (out.occasion && DISCOVERY_OCCASION_NOTES[out.occasion]) out.heuristics.push({ field: 'occasion', value: out.occasion, note: DISCOVERY_OCCASION_NOTES[out.occasion] });
  if (out.budget) out.heuristics.push({ field: 'budget', value: out.budget, note: 'Budget ranks venues with a known price; venues without price data are never excluded and their price is never inferred.' });
  // Display food words only from validated, visitor-supported values.
  out.foodTerms = [...out.cuisines.map((c) => ({ term: c, cuisine: c })), ...out.textTerms.map((w) => ({ term: w, cuisine: null }))];
  if (candidate.foodTerms !== undefined && !Array.isArray(candidate.foodTerms)) rejected.push({ field: 'foodTerms', reason: 'invalid' });
  return { intent: finalizeIntent(out, t), rejected };
}

// ---------- Build My Trip: multi-part requests (2026-09-26) ----------
//
// interpretTripComponents(text, taxonomy, baseIntent) splits a request into
// itinerary COMPONENTS for the trip planner only -- interpretDiscoveryQuery()
// and everything /api/discover returns are unchanged. "cafes and beaches" is a
// cafe part and a beach part; "dinner and a hockey game" is a dinner part and
// an event part. No part is ever required to satisfy another part.
//
// Constraint scoping, deterministic:
//   - party words ("with my dog", "with the kids", "family") apply to every
//     venue part (events are never checked for dogs or kids);
//   - an adjective before a list ("dog friendly cafes and beaches") applies to
//     each bare noun joined by and/or, and stops at a determiner ("dog
//     friendly cafes and a winery" -> the cafes only);
//   - an adjective after a list ("cafes and beaches that are dog friendly")
//     applies to the venue parts of that list.
// Routes: "from X to Y", "between X and Y", "on the way to Y". Places that are
// not Okanagan Roam regions are reported as unknown, never guessed.
//
// Returns { multi, components, route, regions, party, when, unknownPlaces }.
// multi is true only for a find/events request with two or more parts, or a
// route with at least one part; everything else keeps today's planner path.
const TRIP_EVENT_KINDS = [
  { kind: 'hockey', phrases: ['hockey game', 'hockey games', 'hockey match', 'hockey night', 'junior hockey', 'hockey'], category: 'sports-recreation', terms: ['hockey'], noun: 'hockey game' },
  { kind: 'concert', phrases: ['concert', 'concerts', 'gig', 'gigs', 'live show', 'live shows'], category: 'live-music', terms: [], noun: 'concert' },
  { kind: 'live-music', phrases: ['live music', 'live band', 'live bands'], category: 'live-music', terms: [], noun: 'live music', venueFeature: 'live_music' },
  { kind: 'festival', phrases: ['festival', 'festivals'], category: 'events-festivals', terms: [], noun: 'festival' },
  { kind: 'market', phrases: ['farmers market', 'farmers markets', 'market', 'markets'], category: 'markets-fairs', terms: [], noun: 'market' },
  { kind: 'show', phrases: ['theatre', 'theater', 'theatre show', 'play'], category: 'arts-culture', terms: [], noun: 'show' },
  { kind: 'event', phrases: ['event', 'events', 'whats on', 'something happening', 'something on'], category: null, terms: [], noun: 'event' },
];
const TRIP_MEALS = {
  breakfast: { types: ['cafe', 'restaurant'], daypart: 'morning' },
  brunch: { types: ['cafe', 'restaurant'], daypart: 'morning' },
  lunch: { types: ['restaurant'], daypart: 'midday' },
  dinner: { types: ['restaurant'], daypart: 'evening' },
  supper: { types: ['restaurant'], daypart: 'evening' },
};
const TRIP_DAYPARTS = {
  morning: ['in the morning', 'this morning', 'morning'],
  afternoon: ['during the day', 'in the day', 'daytime', 'in the daytime', 'by day', 'in the afternoon', 'this afternoon', 'afternoon'],
  evening: ['at night', 'in the evening', 'this evening', 'evening', 'night', 'tonight'],
};
const TRIP_DOG_PARTY = ['dog', 'dogs', 'my dog', 'with my dog', 'with the dog', 'pup', 'puppy', 'pets'];
const TRIP_KID_PARTY = ['kids', 'kid', 'with kids', 'with my kids', 'with the kids', 'children', 'child', 'toddler', 'toddlers'];
const TRIP_LIST_JOINERS = new Set(['and', 'or']);
const TRIP_DETERMINERS = new Set(['a', 'an', 'the', 'some', 'one']);
const TRIP_CLAUSE_BREAKS = new Set(['then', 'after', 'afterwards', 'before', 'later', 'also', 'plus', 'followed']);
const TRIP_ROUTE_FILLER = new Set(['driving', 'drive', 'heading', 'head', 'going', 'travelling', 'traveling', 'down', 'up', 'south', 'north', 'and', 'then', 'all', 'the', 'way', 'road', 'trip', 'on', 'over']);
// The generic "activities" part: family-oriented places for a family request.
const TRIP_ACTIVITY_TYPES = { family: ['beach', 'outdoor'], any: ['outdoor', 'beach'] };

function tripPhraseTable(taxonomy) {
  const t = normalizeTaxonomy(taxonomy);
  const byPhrase = new Map(buildPhraseTable(taxonomy).map((e) => [e.phrase, { phrase: e.phrase, words: e.words, assign: e.assign.slice() }]));
  const add = (phrase, field, value) => {
    const p = normalizeDiscoveryText(phrase);
    if (!p) return;
    if (!byPhrase.has(p)) byPhrase.set(p, { phrase: p, words: p.split(' '), assign: [] });
    const e = byPhrase.get(p);
    if (!e.assign.some((a) => a.field === field && a.value === value)) e.assign.push({ field, value });
  };
  for (const k of TRIP_EVENT_KINDS) for (const p of k.phrases) add(p, 'tripEvent', k.kind);
  for (const meal of Object.keys(TRIP_MEALS)) if (TRIP_MEALS[meal].types.every((ty) => t.types.includes(ty))) add(meal, 'tripMeal', meal);
  for (const [part, phrases] of Object.entries(TRIP_DAYPARTS)) for (const p of phrases) add(p, 'tripDaypart', part);
  return Array.from(byPhrase.values());
}

function findTripRoute(tokens, regionPhrase) {
  const place = (words) => {
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const p = words.slice(0, n).join(' ');
      if (regionPhrase.has(p)) return { slug: regionPhrase.get(p), used: n };
    }
    return null;
  };
  const unknownWord = (words) => {
    const w = words.filter((x) => !STOPWORDS.has(x) && !TRIP_ROUTE_FILLER.has(x));
    return w.length ? w.slice(0, 2).join(' ') : null;
  };
  const toTarget = (at) => {
    const hit = place(tokens.slice(at, at + 3));
    if (hit) return { slug: hit.slug, end: at + hit.used, unknown: null };
    const u = unknownWord(tokens.slice(at, at + 2));
    return { slug: null, end: at + (u ? u.split(' ').length : 0), unknown: u };
  };
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (w === 'from' || w === 'between') {
      const joiner = w === 'from' ? 'to' : 'and';
      const origin = place(tokens.slice(i + 1, i + 4));
      let j = -1;
      const scanFrom = i + 1 + (origin ? origin.used : 1);
      for (let k = scanFrom; k < Math.min(tokens.length, scanFrom + 4); k++) {
        if (tokens[k] === joiner) { j = k; break; }
        if (!TRIP_ROUTE_FILLER.has(tokens[k])) break;
      }
      if (j === -1) continue;
      const originUnknown = origin ? null : unknownWord(tokens.slice(i + 1, j));
      const target = toTarget(j + 1);
      if (!origin && !target.slug) continue; // e.g. "between meals and ..." -- not a route
      return { from: origin ? origin.slug : null, to: target.slug, unknown: [originUnknown, target.unknown].filter(Boolean), start: i, end: Math.max(target.end, j + 1), via: w === 'from' ? 'from_to' : 'between' };
    }
    if (w === 'way' && tokens[i + 1] === 'to' && ['the', 'our', 'my', 'your'].includes(tokens[i - 1]) && ['on', 'along'].includes(tokens[i - 2])) {
      const target = toTarget(i + 2);
      return { from: null, to: target.slug, unknown: target.unknown ? [target.unknown] : [], start: i - 2, end: Math.max(target.end, i + 2), via: 'way_to' };
    }
  }
  return null;
}

function interpretTripComponents(text, taxonomy, baseIntent) {
  const t = normalizeTaxonomy(taxonomy);
  const base = baseIntent || interpretDiscoveryQuery(text, taxonomy);
  const out = { multi: false, components: [], route: null, regions: [], party: { dog: false, kids: false }, when: base.when || null, unknownPlaces: [] };
  const normalized = normalizeDiscoveryText(text);
  if (!normalized || base.exactVenue || !['find', 'events'].includes(base.mode)) return out;
  const tokens = normalized.split(' ');
  const table = tripPhraseTable(taxonomy);
  const regionPhrase = new Map();
  for (const e of table) for (const a of e.assign) if (a.field === 'region' && !regionPhrase.has(e.phrase)) regionPhrase.set(e.phrase, a.value);

  const route = findTripRoute(tokens, regionPhrase);
  if (route) out.unknownPlaces = route.unknown.slice();
  const masked = tokens.map((tok, i) => (route && i >= route.start && i < route.end ? '\u0000' : tok));
  const { accepted } = matchPhrases(masked, table);
  const eventKinds = Object.fromEntries(TRIP_EVENT_KINDS.map((k) => [k.kind, k]));
  const fieldsOf = (hit, f) => hit.assign.filter((a) => a.field === f).map((a) => a.value);
  const createsComponent = (hit) => ['type', 'activity', 'tripEvent', 'tripMeal', 'cuisine'].some((f) => fieldsOf(hit, f).length)
    || fieldsOf(hit, 'scope').includes('anything');
  const between = (a, b) => tokens.slice(a, b).filter((x) => x !== '\u0000');

  const comps = [];
  let pending = [];          // pre-modifiers waiting for the next part
  let distribute = null;     // pre-modifiers that continue across a bare and/or list
  let listStart = 0;         // first part of the current coordinated list
  let lastEnd = -1;
  let pendingDaypart = null;
  const applyMod = (c, m) => {
    if (c.kind !== 'venue') return;
    if (m.field === 'dog') c.dog = true;
    else if (m.field === 'feature' && !c.features.includes(m.value)) c.features.push(m.value);
    else if (m.field === 'collection' && !c.collections.includes(m.value)) c.collections.push(m.value);
  };
  const newComp = (hit, spec) => {
    const gap = lastEnd < 0 ? [] : between(lastEnd, hit.start);
    // A new part needs an and/or/then between it and the previous one;
    // "rotary beach park" or "creek park waterfall trail" is ONE place.
    const prev = comps[comps.length - 1];
    if (prev && prev.kind === 'venue' && (spec.kind || 'venue') === 'venue' && !prev.meal && !spec.meal && !prev.generic && !spec.generic
      && !gap.some((x) => TRIP_LIST_JOINERS.has(x) || TRIP_CLAUSE_BREAKS.has(x))) {
      for (const ty of spec.types || []) if (!prev.types.includes(ty)) prev.types.push(ty);
      for (const a of spec.activities || []) if (!prev.activities.includes(a)) prev.activities.push(a);
      for (const q of spec.cuisines || []) if (!prev.cuisines.includes(q)) prev.cuisines.push(q);
      lastEnd = hit.end;
      return prev;
    }
    const c = { kind: 'venue', types: [], activities: [], features: [], collections: [], cuisines: [], dog: false, kids: false, meal: null, daypart: null, event: null, generic: false, phrase: hit.phrase, ...spec };
    if (gap.some((x) => TRIP_CLAUSE_BREAKS.has(x)) || gap.some((x) => !TRIP_LIST_JOINERS.has(x) && !TRIP_DETERMINERS.has(x) && !STOPWORDS.has(x))) listStart = comps.length;
    if (pending.length) { for (const m of pending) applyMod(c, m); distribute = pending; pending = []; }
    else if (distribute && gap.length && gap.every((x) => TRIP_LIST_JOINERS.has(x))) { for (const m of distribute) applyMod(c, m); }
    else distribute = null;
    if (pendingDaypart && !c.daypart) { c.daypart = pendingDaypart; pendingDaypart = null; }
    comps.push(c);
    lastEnd = hit.end;
    return c;
  };
  const modifier = (hitIndex, m) => {
    const hit = accepted[hitIndex];
    const next = accepted.slice(hitIndex + 1).find(createsComponent);
    if (next && between(hit.end, next.start).every((x) => !TRIP_LIST_JOINERS.has(x) && !TRIP_CLAUSE_BREAKS.has(x) && !['that', 'which', 'are', 'is'].includes(x))) { pending.push(m); return; }
    // "a winery with live music": a with/has phrase belongs to the nearest
    // part; "cafes and beaches that are dog friendly" to the whole list.
    const venueList = comps.slice(listStart).filter((c) => c.kind === 'venue');
    const list = ['with', 'has', 'have', 'featuring', 'offering'].includes(tokens[hit.start - 1]) ? venueList.slice(-1) : venueList;
    if (list.length) for (const c of list) applyMod(c, m);
    else pending.push(m);
  };

  for (let h = 0; h < accepted.length; h++) {
    const hit = accepted[h];
    const tripEvent = fieldsOf(hit, 'tripEvent')[0];
    const meal = fieldsOf(hit, 'tripMeal')[0] || (TRIP_MEALS[hit.phrase] ? hit.phrase : null);
    const types = fieldsOf(hit, 'type');
    const features = fieldsOf(hit, 'feature');
    const regions = fieldsOf(hit, 'region');
    if (regions.length) { out.regions.push(...regions); continue; }
    if (fieldsOf(hit, 'occasion').includes('family')) out.party.kids = true;
    if (tripEvent) {
      const k = eventKinds[tripEvent];
      const prevWord = tokens[hit.start - 1];
      const nextHit = accepted[h + 1];
      const beforeVenue = nextHit && nextHit.start === hit.end && fieldsOf(nextHit, 'type').length; // "live music bars"
      if (k.venueFeature && (beforeVenue || (['with', 'has', 'have', 'featuring'].includes(prevWord) && comps.some((c) => c.kind === 'venue')))) {
        modifier(h, { field: 'feature', value: k.venueFeature });
        continue;
      }
      newComp(hit, { kind: 'event', event: { kind: k.kind, category: k.category && t.eventCategories.includes(k.category) ? k.category : null, terms: k.terms.slice(), noun: k.noun, venueFeature: k.venueFeature || null } });
      continue;
    }
    if (meal) { newComp(hit, { types: TRIP_MEALS[meal].types.filter((ty) => t.types.includes(ty)), meal, daypart: TRIP_MEALS[meal].daypart }); continue; }
    if (types.length) {
      const c = newComp(hit, { types: uniq(types) });
      if (features.includes('dog_friendly')) c.dog = true; // "dog beach"
      continue;
    }
    const activities = fieldsOf(hit, 'activity');
    if (activities.length) { newComp(hit, { types: ['outdoor'], activities: uniq(activities) }); continue; }
    const cuisines = fieldsOf(hit, 'cuisine');
    if (cuisines.length) {
      const prev = comps[comps.length - 1];
      if (prev && prev.kind === 'venue' && prev.types.includes('restaurant') && between(lastEnd, hit.start).length <= 1) { prev.cuisines.push(...cuisines); continue; }
      newComp(hit, { types: ['restaurant'], cuisines: uniq(cuisines) });
      continue;
    }
    if (fieldsOf(hit, 'scope').includes('anything')) { newComp(hit, { types: [], generic: true }); continue; }
    const daypart = fieldsOf(hit, 'tripDaypart')[0] || fieldsOf(hit, 'daypart')[0];
    if (daypart && !fieldsOf(hit, 'when').length) {
      const prev = comps[comps.length - 1];
      if (prev && !prev.daypartFromText) { prev.daypart = daypart; prev.daypartFromText = true; } else pendingDaypart = daypart;
      continue;
    }
    if (features.length) {
      for (const f of features) {
        if (f === 'dog_friendly') { if (TRIP_DOG_PARTY.includes(hit.phrase)) out.party.dog = true; else modifier(h, { field: 'dog' }); }
        else if (f === 'kid_friendly') { if (TRIP_KID_PARTY.includes(hit.phrase)) out.party.kids = true; else modifier(h, { field: 'feature', value: 'kid_friendly' }); }
        else modifier(h, { field: 'feature', value: f });
      }
      continue;
    }
    for (const c of fieldsOf(hit, 'collection')) modifier(h, { field: 'collection', value: c });
  }

  // "things to do" alone is not a part; with another part it is the
  // (family-oriented, when a family was mentioned) activities part.
  let parts = comps.filter((c) => !c.generic || comps.some((o) => !o.generic));
  for (const c of parts) if (c.generic) c.types = out.party.kids ? TRIP_ACTIVITY_TYPES.family.filter((ty) => t.types.includes(ty)) : TRIP_ACTIVITY_TYPES.any.filter((ty) => t.types.includes(ty));
  // One part per venue type group: "coffee and a cafe" is one cafe part.
  const seen = new Map();
  parts = parts.filter((c) => {
    if (c.kind !== 'venue' || c.generic || c.meal || c.activities.length || c.cuisines.length) return true;
    const key = c.types.slice().sort().join(',');
    if (!seen.has(key)) { seen.set(key, c); return true; }
    const keep = seen.get(key);
    keep.dog = keep.dog || c.dog;
    for (const f of c.features) if (!keep.features.includes(f)) keep.features.push(f);
    for (const k of c.collections) if (!keep.collections.includes(k)) keep.collections.push(k);
    return false;
  });
  for (const c of parts) {
    if (c.kind !== 'venue') continue;
    if (out.party.dog) c.dog = true;
    if (out.party.kids) c.kids = true;
  }
  for (const c of parts) delete c.daypartFromText;
  out.components = parts;
  out.regions = uniq(out.regions);
  if (route && (route.from || route.to)) out.route = { from: route.from, to: route.to, via: route.via };
  const venueParts = parts.filter((c) => c.kind === 'venue').length;
  if (base.mode === 'events' && venueParts === 0) return { ...out, multi: false };
  out.multi = out.route ? parts.length >= 1 : parts.length >= 2;
  return out;
}

module.exports = {
  DISCOVERY_INTENT_VERSION,
  DISCOVERY_MAX_TEXT_LENGTH,
  DISCOVERY_MODES,
  DISCOVERY_OCCASIONS,
  DISCOVERY_OCCASION_NOTES,
  DISCOVERY_COLLECTION_KINDS,
  normalizeDiscoveryText,
  buildPhraseTable,
  interpretDiscoveryQuery,
  validateDiscoveryIntent,
  interpretTripComponents,
};
