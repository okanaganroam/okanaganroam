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

const CONTRACTION_WORDS = { d: 'would', re: 'are', ve: 'have', ll: 'will', m: 'am' };
function normalizeDiscoveryText(text) {
  if (typeof text !== 'string') return '';
  return text
    .slice(0, DISCOVERY_MAX_TEXT_LENGTH)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // café -> cafe
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    // Step 1 (2026-09-29): pronoun contractions and negations are expanded
    // before apostrophes are dropped, so "we'd" never reads as "wed"
    // (Wednesday). Only after a pronoun / auxiliary, so venue names such as
    // "Bless'd" or "Press'd" normalize exactly as before.
    .replace(/\b(i|we|you|they|he|she|it|that|there|who|what)'(d|re|ve|ll|m)\b/g, (m, w, c) => `${w} ${CONTRACTION_WORDS[c]}`)
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bcan't\b/g, 'can not')
    .replace(/\b(do|does|did|is|are|was|were|could|would|should|have|has|had)n't\b/g, '$1 not')
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
const SCOPE_PHRASES = ['things to do', 'something to do', 'what to do', 'stuff to do', 'fun things', 'activities', 'activity', 'attractions', 'places to go', 'places to visit', 'somewhere to go', 'what should i do', 'what can we do', 'what can i do', 'what to see', 'things to see', 'sights', 'sightseeing',
  // Step 1 (2026-09-29): wanting to explore is wanting things to do.
  'explore', 'exploring', 'to explore', 'places to explore', 'somewhere to explore'];

const PLAN_PHRASES = ['plan', 'planning', 'itinerary', 'trip', 'getaway', 'vacation', 'road trip', 'schedule', 'weekend away'];
const RECOMMEND_PHRASES = ['recommend', 'recommendation', 'recommendations', 'suggest', 'suggestion', 'suggestions', 'find me', 'where can i', 'where can we', 'where should i', 'where should we', 'where to get', 'where to find'];
const SUPERLATIVE_PHRASES = ['best', 'top', 'greatest', 'great', 'nicest', 'favourite', 'favorite', 'must see', 'must try', 'top rated', 'highest rated',
  // Step 1 (2026-09-29): "can't miss" / "don't miss" (after contraction expansion).
  'can not miss', 'cannot miss', 'do not miss'];

// Travel-related concepts Okanagan Roam knowingly cannot satisfy today.
const UNSUPPORTED_PHRASES = [
  'wheelchair', 'wheelchair accessible', 'wheelchair access', 'accessible', 'accessibility', 'mobility',
  'open now', 'open late', 'open 24 hours', 'late night', 'reservation', 'reservations', 'book a table', 'booking',
  'hotel', 'hotels', 'accommodation', 'accommodations', 'lodging', 'airbnb', 'where to stay', 'place to stay',
  'car rental', 'rental car', 'taxi', 'uber', 'shuttle', 'weather', 'forecast',
  'helicopter', 'helicopter tour', 'private jet', 'michelin', 'michelin star',
  'next weekend', 'next week', 'next month', 'last weekend',
];

// Step 1 (2026-09-29): a month or season is understood for TRIP PLANNING
// (plan / recommend requests): the planner uses it for its existing seasonal
// rules and hedged "check before you go" notes. Nothing else can filter by
// month, so for any other request the words are still reported as not
// applied, exactly as before. "may" alone is too ambiguous; only "in may".
const MONTH_ALIASES = {
  1: ['january', 'in january'], 2: ['february', 'in february'], 3: ['march', 'in march'], 4: ['april', 'in april'],
  5: ['in may', 'during may'], 6: ['june', 'in june'], 7: ['july', 'in july'], 8: ['august', 'in august'],
  9: ['september', 'sept', 'in september'], 10: ['october', 'in october'], 11: ['november', 'in november'], 12: ['december', 'in december'],
};
const SEASON_ALIASES = {
  winter: ['winter', 'in winter', 'in the winter', 'this winter', 'wintertime'],
  spring: ['spring', 'in spring', 'in the spring', 'this spring', 'springtime', 'spring break'],
  summer: ['summer', 'in summer', 'in the summer', 'this summer', 'summertime'],
  fall: ['fall', 'in the fall', 'this fall', 'autumn', 'in autumn', 'in the autumn', 'this autumn'],
  off: ['off season', 'offseason', 'off peak', 'shoulder season', 'quiet season'],
};
const MONTH_SEASON = [null, 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
// Amounts, never occasions: "a couple of hidden gems" is not "a couple".
const QUANTITY_PHRASES = ['a couple of', 'couple of', 'a few', 'a bunch of', 'a handful of'];
// Plan/recommend requests only: lake words are a request for lake time (the
// Lake View badge, beaches and water activities), not food or text terms.
const LAKE_WORDS = ['lake', 'lakes', 'lakeside', 'lakefront', 'waterfront', 'water'];
// Pace words inside a one-day theme ("one relaxed day").
const THEME_PACE_WORDS = { relaxed: 'relaxed', relaxing: 'relaxed', easy: 'relaxed', lazy: 'relaxed', leisurely: 'relaxed', chill: 'relaxed', packed: 'packed', busy: 'packed', full: 'packed' };
// Stage 3.5 (2026-09-29): pace words inside the trip's own length phrase ("3
// relaxed days", "a busy day"). "full" is left out: "a full day" usually
// means a whole day, not a packed one.
const LENGTH_PACE_WORDS = { relaxed: 'relaxed', relaxing: 'relaxed', easy: 'relaxed', lazy: 'relaxed', leisurely: 'relaxed', chill: 'relaxed', packed: 'packed', busy: 'packed' };

const DAY_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1 };
const LENGTH_PHRASES = [
  { phrase: 'long weekend', days: 3 },
  { phrase: 'weekend', days: 2 },
  // Stage 3.5 D3 (2026-09-30): "weekend away" is also a plan phrase, which
  // claimed "weekend" before its length was read; it is a 2-day trip like
  // "weekend getaway" and "weekend trip" already are.
  { phrase: 'weekend away', days: 2 },
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
  + 'whats wanna gonna ive id nearby close near '
  // Step 1 (2026-09-29): verbs, pronouns and filler that were reaching the
  // planner as "food" searches ("Nothing matching explore").
  + 'not have has had coming come them they their explore exploring experience experiences anything everything nothing easy '
  // Stage 3.1 (2026-09-29): conversational filler that reached the planner as
  // unmatched search words ("spend time on the lake", "a mix of activities").
  + 'spend mix '
  // 2026-10-06: "restaurants are fine" and "don't include wineries" -- filler, not search words.
  + 'fine include includes including').split(/\s+/));

// ---------- polarity (Stage 3.1, 2026-09-29) ----------
// A negation word that no phrase claims ("not", "no", "nothing", "without",
// "except", "excluding", "other than", "anything but") negates what follows it
// in its own clause: every phrase and every leftover word up to the first
// clause break ("but", "and", "plus", ...), the next negation, the first
// unrecognised word (itself negated -- "not too far from Kelowna" negates only
// "far", never Kelowna), or NEGATION_MAX_SPAN words. "or"/"nor" continue the
// list ("no breweries or pubs"). "not only" / "not just" is not a negation.
// Phrases that contain a negation word are matched first and keep their own
// meaning ("no kids", "can't miss" -> "can not miss", "non alcoholic").
const NEGATION_TRIGGERS = [['anything', 'but'], ['other', 'than'], ['not'], ['no'], ['nothing'], ['without'], ['except'], ['excluding']];
const NEGATION_SKIP_AFTER = new Set(['only', 'just']);
const NEGATION_CONTINUE = new Set(['or', 'nor']);
const NEGATION_BREAKS = new Set(['but', 'and', 'plus', 'also', 'then', 'though', 'however', 'yet', 'so', 'because', 'while', 'instead', 'rather']);
const NEGATION_MAX_SPAN = 6;
// Words left out when a negated clause is reported back to the visitor.
const NEGATION_DISPLAY_FILLER = new Set(['want', 'wants', 'wanted', 'need', 'needs', 'like', 'looking', 'anything', 'something', 'any', 'really', 'too', 'very', 'do', 'does', 'did', 'have', 'has', 'had', 'the', 'a', 'an']);
// Fields a negated phrase is recorded under in intent.excluded.
const EXCLUDED_LIST_FIELDS = { region: 'regions', type: 'types', feature: 'features', collection: 'collections', activity: 'activities', cuisine: 'cuisines' };

// Excluded CONCEPTS (2026-10-06). Some things a visitor rules out are not a
// category, a feature or a place name: "we don't drink alcohol", "no booze",
// "we're sober". The phrases below carry the refusal themselves (they are
// matched, longest first, before any bare negation word can claim them), and
// each records a concept id in intent.excluded.concepts. discovery-search.js
// CONCEPT_PRIMARY_TYPES says which venues a concept rules out; the planner and
// /search both read it through exclusionPlan(). Words are written the way
// normalizeDiscoveryText() leaves them ("don't" -> "do not").
const CONCEPT_ALIASES = {
  alcohol: [
    'do not drink alcohol', 'does not drink alcohol', 'dont drink alcohol', 'doesnt drink alcohol',
    'do not drink', 'does not drink', 'dont drink', 'doesnt drink', 'none of us drink', 'no one drinks', 'nobody drinks',
    'not drinking alcohol', 'not drinking', 'no drinking', 'no alcohol', 'no booze', 'no liquor',
    'without alcohol', 'without booze', 'without drinking', 'avoid alcohol', 'avoid drinking', 'skip alcohol', 'skip the alcohol',
    'not interested in alcohol', 'not interested in drinking', 'no interest in alcohol', 'not into drinking', 'not a drinker',
    'non drinker', 'non drinkers', 'nondrinker', 'nondrinkers', 'sober', 'teetotal', 'teetotaler', 'teetotalers', 'teetotaller', 'teetotallers',
    // "alcohol free" alone is the badge ("alcohol free restaurants"); said about
    // the trip itself it is a refusal.
    'alcohol free activities', 'alcohol free activity', 'alcohol free trip', 'alcohol free day', 'alcohol free weekend',
    'alcohol free itinerary', 'alcohol free vacation', 'alcohol free getaway', 'alcohol free things to do', 'alcohol free fun',
    'alcohol free experiences', 'non alcoholic activities', 'non alcoholic trip',
    // Other ways of saying it (2026-10-06, follow-up).
    'alcohol is not our thing', 'alcohol is not my thing', 'alcohol is not for us', 'alcohol is not for me',
    'nobody wants alcohol', 'no one wants alcohol', 'nobody wants to drink', 'no one wants to drink',
    'do not want alcohol', 'does not want alcohol', 'do not want any alcohol', 'do not want booze', 'do not need alcohol',
    'do not want to drink', 'does not want to drink',
    'not into alcohol', 'not into booze',
    'no wine or beer', 'no beer or wine', 'no wine and beer', 'no beer and wine',
    'no wine beer or spirits', 'no wine or beer or spirits', 'no beer wine or spirits',
  ],
};
// "alcohol free" is a venue badge ("alcohol free restaurants") unless it is
// said about the trip itself ("alcohol free, Kelowna"). It is the badge when a
// venue or drink word sits right after it or shortly before it.
const ALCOHOL_FREE_BADGE_AFTER = new Set(['restaurant', 'restaurants', 'cafe', 'cafes', 'bar', 'bars', 'pub', 'pubs', 'lounge', 'lounges', 'place', 'places', 'spot', 'spots',
  'venue', 'venues', 'patio', 'patios', 'eatery', 'eateries', 'bistro', 'bistros', 'dining', 'food', 'menu', 'menus', 'option', 'options', 'drink', 'drinks', 'beverage', 'beverages',
  'beer', 'beers', 'wine', 'wines', 'cocktail', 'cocktails', 'mocktail', 'mocktails', 'spirits', 'coffee', 'tea']);
const ALCOHOL_FREE_BADGE_BEFORE = new Set(['restaurant', 'restaurants', 'cafe', 'cafes', 'bar', 'bars', 'pub', 'pubs', 'lounge', 'lounges', 'place', 'places', 'spot', 'spots',
  'venue', 'venues', 'patio', 'patios', 'eatery', 'eateries', 'bistro', 'bistros', 'menu', 'menus']);
function isTripLevelAlcoholFree(hit, tokens) {
  if (hit.phrase !== 'alcohol free') return false;
  if (ALCOHOL_FREE_BADGE_AFTER.has(tokens[hit.end])) return false;
  for (let k = Math.max(0, hit.start - 6); k < hit.start; k++) if (ALCOHOL_FREE_BADGE_BEFORE.has(tokens[k])) return false;
  return true;
}
// Words that stand for an excluded concept itself: with the refusal recorded,
// none may remain as a positive search term (see the guard at the end of
// interpretDiscoveryQuery). discovery-search.js keeps the same list for the
// planner; a test pins the two together.
const CONCEPT_STRAY_WORDS = Object.freeze({
  alcohol: Object.freeze(['alcohol', 'alcohols', 'alcoholic', 'booze', 'boozy', 'liquor', 'liquors', 'drink', 'drinks', 'drinking', 'drinker', 'drinkers', 'nobody']),
});
function withoutConceptStrays(terms, excluded) {
  const concepts = excluded && Array.isArray(excluded.concepts) ? excluded.concepts : [];
  if (!concepts.length) return terms;
  const strays = new Set(concepts.flatMap((c) => CONCEPT_STRAY_WORDS[c] || []));
  return terms.filter((t) => (typeof t === 'string' ? !strays.has(t) : !!t.cuisine || !strays.has(t.term)));
}
// "we don't drink coffee" is not a refusal of alcohol.
const NON_ALCOHOLIC_DRINK_WORDS = new Set(['coffee', 'coffees', 'tea', 'teas', 'water', 'milk', 'soda', 'sodas', 'pop', 'juice', 'juices', 'smoothie', 'smoothies', 'caffeine', 'coke']);

function emptyExcluded() {
  return { regions: [], types: [], features: [], collections: [], activities: [], cuisines: [], textTerms: [], budget: null, phrases: [] };
}

// tokens: the (masked) token list; accepted/claimed: matchPhrases() output.
// -> { negatedHits: Set<hit>, negatedTokens: Set<index> (unrecognised words),
//      triggerTokens: Set<index>, clauses: [{ start, end }] }
function findNegations(tokens, accepted, claimed) {
  const hitAt = new Map();
  for (const h of accepted) for (let k = h.start; k < h.end; k++) hitAt.set(k, h);
  const triggerAt = (i) => {
    for (const words of NEGATION_TRIGGERS) {
      let ok = i + words.length <= tokens.length;
      for (let j = 0; ok && j < words.length; j++) if (tokens[i + j] !== words[j] || claimed[i + j]) ok = false;
      if (ok) return words.length;
    }
    return 0;
  };
  const out = { negatedHits: new Set(), negatedTokens: new Set(), triggerTokens: new Set(), clauses: [] };
  for (let i = 0; i < tokens.length; i++) {
    const n = triggerAt(i);
    if (!n || NEGATION_SKIP_AFTER.has(tokens[i + n])) continue;
    let k = i + n;
    let last = -1;
    // After the first negated item the clause only continues across an
    // explicit "or"/"nor" list ("no breweries or pubs"); "no golf, relaxed
    // pace" keeps the pace.
    let listOpen = true;
    while (k < tokens.length && k - (i + n) < NEGATION_MAX_SPAN) {
      const tok = tokens[k];
      if (tok === '\u0000' || NEGATION_BREAKS.has(tok) || triggerAt(k)) break;
      if (NEGATION_CONTINUE.has(tok)) { listOpen = true; k++; continue; }
      if (claimed[k]) {
        const hit = hitAt.get(k);
        // "don't recommend wineries": the verb is not what is ruled out, the
        // thing after it is. (Other claimed words keep the rule below.)
        if (hit.assign.length && hit.assign.every((a) => a.field === 'recommend')) { k = hit.end; continue; }
        if (!listOpen) break;
        out.negatedHits.add(hit);
        last = hit.end - 1;
        listOpen = false;
        k = hit.end;
        continue;
      }
      if (STOPWORDS.has(tok) || /^\d+$/.test(tok) || tok.length < 2) { k++; continue; }
      if (listOpen) { out.negatedTokens.add(k); last = k; }
      break;
    }
    if (last < 0) continue;
    for (let j = i; j < i + n; j++) out.triggerTokens.add(j);
    out.clauses.push({ start: i, end: last + 1 });
    i = last;
  }
  return out;
}

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
  for (const [concept, phrases] of Object.entries(CONCEPT_ALIASES)) for (const p of phrases) add(p, 'concept', concept);
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
  for (const [month, phrases] of Object.entries(MONTH_ALIASES)) for (const p of phrases) add(p, 'month', Number(month));
  for (const [season, phrases] of Object.entries(SEASON_ALIASES)) for (const p of phrases) add(p, 'season', season);
  for (const p of QUANTITY_PHRASES) add(p, 'quantity', true);
  // Combined phrases that carry two meanings at once.
  if (t.types.includes('pub') && t.features.includes('sports_tv')) { add('sports bar', 'type', 'pub'); add('sports bars', 'type', 'pub'); }
  if (t.types.includes('beach')) { add('dog beach', 'type', 'beach'); add('dog beaches', 'type', 'beach'); }
  if (t.types.includes('restaurant')) { add('dinner date', 'type', 'restaurant'); }
  // "food and drink" is the whole Food & Drink family; "drinks" the bar side of it.
  for (const type of ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery']) if (t.types.includes(type)) { add('food and drink', 'type', type); add('food and drinks', 'type', type); }
  for (const type of ['pub', 'cocktail']) if (t.types.includes(type)) { add('drinks', 'type', type); add('a drink', 'type', type); }

  // Stage 3.1 (2026-09-29): plural-tolerant aliases. A single-word alias for a
  // type, feature, collection, activity or cuisine also matches its plural
  // ("dinner" -> "dinners", "pizza" -> "pizzas", "lunch" -> "lunches") --
  // never the other way round, never a multi-word phrase, and never a word
  // that is already a phrase with its own meaning.
  for (const [phrase, assign] of Array.from(entries.entries())) {
    const plural = pluralOf(phrase);
    if (!plural || entries.has(plural) || !assign.every((a) => PLURAL_FIELDS.has(a.field))) continue;
    if (assign.some((a) => a.field === 'cuisine') && !PLURAL_CUISINE_NOUNS.has(phrase)) continue;
    entries.set(plural, assign.map((a) => ({ ...a })));
  }
  // Stage 3.2 (2026-09-29): possessive place names. Normalization turns
  // "Kelowna's" into "kelownas"; it means the region itself. Only for phrases
  // that mean a region and nothing else, never over an existing phrase; a
  // name already ending in s ("Osoyoos'") normalizes to itself.
  for (const [phrase, assign] of Array.from(entries.entries())) {
    if (phrase.endsWith('s') || !assign.length || !assign.every((a) => a.field === 'region')) continue;
    if (!entries.has(`${phrase}s`)) entries.set(`${phrase}s`, assign.map((a) => ({ ...a })));
  }

  return Array.from(entries.entries()).map(([phrase, assign]) => ({ phrase, words: phrase.split(' '), assign }));
}

const PLURAL_FIELDS = new Set(['type', 'feature', 'collection', 'activity', 'cuisine']);
// Cuisine values are mostly adjectives whose plural is a nationality
// ("italians", "americans") -- never a food request -- so only these food
// nouns get a plural. Each must still exist in the taxonomy to be matched.
const PLURAL_CUISINE_NOUNS = new Set(['pizza', 'soup', 'gelato', 'boba', 'ramen', 'sushi', 'burger', 'taco', 'noodle', 'sandwich', 'dumpling', 'crepe', 'bagel', 'donut', 'waffle', 'pie']);
// The plural of a single normalized word, or null when it is not a safe
// candidate (several words, already ends in s, an -ing word, very short, or
// has digits).
function pluralOf(word) {
  if (!/^[a-z]{3,}$/.test(word) || word.endsWith('s') || word.endsWith('ing')) return null;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/.test(word)) return `${word}es`;
  return `${word}s`;
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
// ("rotary beach park oliver"), or (Stage 3.2) a unique name core ("quails gate").
// Never a fuzzy match.
function matchExactVenue(normalized, t, index) {
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
  // Stage 3.2: the name without its generic ending ("quails gate" for
  // "Quails' Gate Winery"). Only after the full name, only a name core of
  // two or more words that exactly one venue has, that is not also a phrase
  // with its own meaning, and that no other venue's name contains (a brand
  // family such as "50th parallel" is never narrowed to one of its venues).
  // Anything else is left exactly as before: no match, no ambiguity.
  const coreId = index ? index.cores.get(q) : undefined;
  const core = coreId === undefined ? null : t.venues.find((v) => v && v.id === coreId);
  if (core) return pick([core], q);
  return { venue: null, ambiguity: null };
}

// ---------- Stage 3.2 (2026-09-29): closed-vocabulary corrections ----------
//
// A misspelled word is corrected ONLY onto a word of the site's own closed
// vocabulary -- a region name or a single-word type / feature / collection /
// activity / cuisine alias -- and only when the correction is small, unique
// and not a real word:
//   - words under 5 letters, and every word the interpreter already knows (a
//     phrase word, stopword, negation or trip word, a word in a venue name)
//     are never corrected: exact always wins;
//   - the first letter must match;
//   - 5-7 letters: one inserted, dropped or swapped (adjacent) letter, never
//     a substituted one -- substitutions turn real words into other real
//     words ("chile" -> "child", "steam" -> "steak", "parts" -> "parks");
//   - 8+ letters: up to two such edits, where a substitution may only swap
//     one vowel for another ("vegeterian", "distillary");
//   - never the plural/singular of a non-region target: Stage 3.1's plural
//     policy decides those ("italians" is not a cuisine);
//   - never a word on the reviewed NEVER_CORRECT list below;
//   - never when the closest targets mean different things.
// Venue-name words and description text are never correction targets.
// Corrections run after exact venue matching and before phrase matching and
// polarity, so "not wineris" is an excluded winery exactly like "not
// wineries". Each one is reported in intent.corrections as { from, to,
// field }; the visitor's own text is kept by every caller.

const CORRECTION_FIELDS = new Set(['region', 'type', 'feature', 'collection', 'activity', 'cuisine']);
const CORRECTION_VOWELS = 'aeiouy';
const CORRECTION_MIN_LENGTH = 5;
// Real words within reach of a target, reviewed in the Stage 3.2 preflight
// against a 228k-word English dictionary and the site's own venue and event
// text: never corrected.
const NEVER_CORRECT = new Set([
  // dictionary words a visitor could plausibly type
  'america', 'americana', 'indiana', 'piazza', 'bleach', 'breach', 'breeches', 'brewer', 'campaign', 'composite',
  'flashing', 'flushing', 'koran', 'lunge', 'longe', 'lounger', 'outsider', 'padding', 'streak', 'tumbling', 'whisk',
  'toddle', 'germane', 'germanic', 'polis', 'celia', 'blinking', 'circling', 'skidding', 'skinning', 'boasting',
  'bloating', 'exacting', 'easting', 'divining', 'bridging', 'westland',
  // real words used in the site's own venue / event text
  'badly', 'drinking', 'eater', 'finishing', 'olive', 'outsized', 'polished', 'skipping', 'skirting', 'trial',
  // implementation review of the site's own text: a correction would change
  // the meaning ("trailers" are RVs, not hiking trails)
  'americas', 'boosting', 'defining', 'trailers',
  // final safety review: a food, another cuisine, a name -- never a gluten-free
  // filter, Japanese food or the town of Oliver
  'celeriac', 'javanese', 'olivier',
]);
// Venue-name endings that are generic, not part of the name ("Winery").
const NAME_CORE_GENERIC = new Set(['winery', 'wineries', 'wines', 'wine', 'estate', 'estates', 'vineyard', 'vineyards', 'cellars', 'cellar',
  'restaurant', 'cafe', 'coffee', 'brewing', 'brewery', 'company', 'co', 'distillery', 'distilling', 'distillers', 'pub', 'bar', 'grill',
  'kitchen', 'and', 'the', 'ltd', 'inc', 'bistro', 'eatery', 'lounge', 'taproom', 'tasting', 'room', 'family', 'farm', 'farms']);

// Edit distance with adjacent transpositions; a substitution costs 1 only
// between two vowels when allowed, otherwise it is not an option. Stops as
// soon as the distance must exceed `max`.
function correctionDistance(a, b, max, vowelSubstitution) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const x = a[i - 1], y = b[j - 1];
      const sub = x === y ? 0 : (vowelSubstitution && CORRECTION_VOWELS.includes(x) && CORRECTION_VOWELS.includes(y) ? 1 : Infinity);
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + sub);
      if (prev2 && i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

// The single-word aliases written in this file's tables, plus the taxonomy's
// own region and cuisine names: the only possible correction targets
// (generated plurals and possessives are exact aliases, never targets).
function correctionSourceWords(t) {
  const words = new Set();
  const addWords = (list) => { for (const p of list) { const n = normalizeDiscoveryText(p); if (n && !n.includes(' ')) words.add(n); } };
  for (const table of [TYPE_ALIASES, FEATURE_ALIASES, COLLECTION_ALIASES, ACTIVITY_ALIASES, CUISINE_SYNONYMS, REGION_EXTRA_ALIASES]) addWords(Object.values(table).flat());
  addWords(VALLEY_WIDE_PHRASES);
  addWords(t.regions.map((r) => r.replace(/-/g, ' ')));
  addWords(Object.values(t.regionLabels));
  addWords(t.cuisines);
  return words;
}

// Everything derived from the taxonomy that correction and name-core
// matching need, built once per distinct taxonomy (the server rebuilds an
// identical taxonomy on every request) and kept for the next call.
const DISCOVERY_INDEX_CACHE = [];
const DISCOVERY_INDEX_CACHE_SIZE = 4;
const validVenue = (v) => v && Number.isInteger(v.id) && typeof v.name === 'string';
// The index depends only on the vocabulary lists and on each venue's id and
// name, so a cached index is reused only when those are exactly the same (a
// direct comparison, no copy of the venue list). Region, type and slug are
// always read from the current taxonomy, never from the cache.
function discoveryIndex(taxonomy, t) {
  const vocabKey = JSON.stringify([t.regions, t.regionLabels, t.types, t.features, t.collections, t.activities, t.cuisines, t.budgets, t.paces, t.datePresets, t.eventCategories]);
  for (let k = 0; k < DISCOVERY_INDEX_CACHE.length; k++) {
    const e = DISCOVERY_INDEX_CACHE[k];
    if (e.vocabKey !== vocabKey) continue;
    let j = 0, same = true;
    for (const v of t.venues) {
      if (!validVenue(v)) continue;
      if (j >= e.ids.length || e.ids[j] !== v.id || e.names[j] !== v.name) { same = false; break; }
      j++;
    }
    if (same && j === e.ids.length) return e.value;
  }
  const venues = t.venues.filter(validVenue);
  const value = buildDiscoveryIndex(taxonomy, t, venues);
  DISCOVERY_INDEX_CACHE.unshift({ vocabKey, ids: venues.map((v) => v.id), names: venues.map((v) => v.name), value });
  DISCOVERY_INDEX_CACHE.length = Math.min(DISCOVERY_INDEX_CACHE.length, DISCOVERY_INDEX_CACHE_SIZE);
  return value;
}

function buildDiscoveryIndex(taxonomy, t, venues) {
  const table = buildPhraseTable(taxonomy);
  const phrases = new Set(table.map((e) => e.phrase));
  // Words the interpreter already understands or the site already uses in a
  // venue name: never corrected.
  const known = new Set(STOPWORDS);
  for (const e of table) for (const w of e.words) known.add(w);
  const addKnown = (list) => { for (const p of list) for (const w of normalizeDiscoveryText(String(p)).split(' ')) if (w) known.add(w); };
  addKnown(NEGATION_TRIGGERS.flat());
  addKnown([...NEGATION_SKIP_AFTER, ...NEGATION_CONTINUE, ...NEGATION_BREAKS, ...NEGATION_DISPLAY_FILLER]);
  addKnown(LAKE_WORDS);
  addKnown(Object.keys(THEME_PACE_WORDS));
  addKnown(Object.keys(DAY_WORDS));
  addKnown(TRIP_EVENT_KINDS.flatMap((k) => k.phrases));
  addKnown(Object.keys(TRIP_MEALS));
  addKnown(Object.values(TRIP_DAYPARTS).flat());
  addKnown([...TRIP_DOG_PARTY, ...TRIP_KID_PARTY, ...TRIP_LIST_JOINERS, ...TRIP_DETERMINERS, ...TRIP_CLAUSE_BREAKS, ...TRIP_ROUTE_FILLER]);
  const strip = (s) => s.replace(/^the /, '');
  const fullNames = venues.map((v) => ({ v, name: strip(normalizeDiscoveryText(v.name)) })).filter((x) => x.name);
  for (const { name } of fullNames) for (const w of name.split(' ')) known.add(w);

  // Correction targets.
  const sources = correctionSourceWords(t);
  const targets = new Map();
  for (const e of table) {
    if (e.words.length !== 1 || e.phrase.length < CORRECTION_MIN_LENGTH || !sources.has(e.phrase)) continue;
    if (!e.assign.every((a) => CORRECTION_FIELDS.has(a.field) || (a.field === 'scope' && a.value === 'valley'))) continue;
    targets.set(e.phrase, {
      key: e.assign.map((a) => `${a.field}:${a.value}`).sort().join('|'),
      field: uniq(e.assign.map((a) => a.field)).join('+'),
      region: e.assign.every((a) => a.field === 'region' || a.field === 'scope'),
    });
  }

  // Name cores eligible for an exact match (see matchExactVenue).
  const coreOf = (name) => { const w = name.split(' '); while (w.length > 1 && NAME_CORE_GENERIC.has(w[w.length - 1])) w.pop(); return w.join(' '); };
  const byCore = new Map();
  for (const x of fullNames) { const c = coreOf(x.name); if (!byCore.has(c)) byCore.set(c, []); byCore.get(c).push(x); }
  const byWord = new Map();
  for (const x of fullNames) for (const w of new Set(x.name.split(' '))) { if (!byWord.has(w)) byWord.set(w, []); byWord.get(w).push(x); }
  const cores = new Map();
  for (const [c, list] of byCore) {
    if (list.length !== 1 || !c.includes(' ') || c === list[0].name || phrases.has(c)) continue;
    const padded = ` ${c} `;
    if ((byWord.get(c.split(' ')[0]) || []).some((x) => x !== list[0] && ` ${x.name} `.includes(padded))) continue;
    cores.set(c, list[0].v.id);
  }
  return { targets, known, cores };
}

// Corrects each word it can; returns the words (corrected in place) and
// the corrections made, in order.
function correctDiscoveryTokens(tokens, index) {
  const corrections = [];
  const out = tokens.map((w) => {
    if (w.length < CORRECTION_MIN_LENGTH || !/^[a-z]+$/.test(w) || index.known.has(w) || index.targets.has(w) || NEVER_CORRECT.has(w)) return w;
    const short = w.length <= 7;
    const max = short ? 1 : 2;
    let best = max + 1;
    let hits = [];
    for (const [target, meta] of index.targets) {
      if (target[0] !== w[0]) continue;
      if (!meta.region && (pluralOf(target) === w || pluralOf(w) === target)) continue;
      const d = correctionDistance(w, target, max, !short);
      if (d > max) continue;
      if (d < best) { best = d; hits = [[target, meta]]; } else if (d === best) hits.push([target, meta]);
    }
    if (!hits.length || new Set(hits.map((h) => h[1].key)).size > 1) return w;
    hits.sort((a, b) => a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));
    corrections.push({ from: w, to: hits[0][0], field: hits[0][1].field });
    return hits[0][0];
  });
  return { tokens: out, corrections };
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
    // Step 1 (2026-09-29), trip planning only: the month (1-12) and season the
    // visitor named, per-day themes ("one relaxed day with a lake
    // experience") and a request for lake time. Additive fields.
    month: null,
    season: null,
    dayThemes: [],
    lake: false,
    // Stage 3.1 (2026-09-29): what the visitor said they do NOT want
    // ("not wineries", "not in Kelowna", "nothing fancy" -> budget
    // 'upscale'). Additive; never also present in the positive fields. Not
    // yet applied by search, routing or the planner, so each clause is also
    // listed in `unsupported` (reported as not applied, never dropped).
    excluded: emptyExcluded(),
    // Stage 3.2 (2026-09-29): misspellings corrected onto the site's closed
    // vocabulary, as { from, to, field } -- "osoyos" -> "osoyoos" (region).
    // Additive; the request text itself is never changed.
    corrections: [],
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

  // 1. An exact venue name wins outright (the full name, then a unique
  // name core); always before any correction.
  const index = discoveryIndex(taxonomy, t);
  const exact = matchExactVenue(normalized, t, index);
  if (exact.venue) {
    intent.exactVenue = exact.venue;
    intent.mode = 'navigate';
    intent.matched.push({ phrase: normalized, field: 'exactVenue', value: exact.venue.id });
    return finalizeIntent(intent, t);
  }
  if (exact.ambiguity) intent.ambiguities.push(exact.ambiguity);

  // 1b. Stage 3.2: closed-vocabulary corrections ("osoyos" -> "osoyoos").
  // Everything below reads the corrected words; the corrections are listed.
  const fixed = correctDiscoveryTokens(normalized.split(' '), index);
  intent.corrections = fixed.corrections;
  const tokens = fixed.tokens;
  // 2. Trip lengths claim their tokens first ("3 relaxed days").
  const lengths = findLengths(tokens.join(' '));
  const preClaimed = new Array(tokens.length).fill(false);
  for (const l of lengths) for (let k = l.start; k < l.end && k < tokens.length; k++) preClaimed[k] = true;
  // 3. Phrase matching over the remaining tokens.
  const masked = tokens.map((tok, i) => (preClaimed[i] ? '\u0000' : tok));
  const { accepted, claimed } = matchPhrases(masked, table);
  // 3b. Stage 3.1: polarity. Negated phrases and words go to intent.excluded,
  // never to the positive fields below.
  const neg = findNegations(masked, accepted, claimed);
  const isNegated = (hit) => neg.negatedHits.has(hit);

  const flags = { event: false, plan: false, recommend: false, scopeAnything: false };
  const lengthMentions = lengths.map((l) => ({ days: l.days, phrase: l.phrase, start: l.start }));
  const budgetMentions = [], paceMentions = [], occasionMentions = [], whenMentions = [], daypartMentions = [], conceptMentions = [];
  const monthMentions = [], seasonMentions = [];
  const eventCats = [];
  const orderedTypes = [];

  for (const hit of accepted) {
    if (isNegated(hit)) {
      for (const { field, value } of hit.assign) {
        if (EXCLUDED_LIST_FIELDS[field]) intent.excluded[EXCLUDED_LIST_FIELDS[field]].push(value);
        else if (field === 'budget') intent.excluded.budget = value;
        // Any other negated meaning (an occasion, a date, a pace...) is simply
        // not applied; its clause is still reported below.
      }
      continue;
    }
    for (const { field, value } of hit.assign) {
      switch (field) {
        case 'region': intent.regions.push(value); break;
        case 'type': intent.types.push(value); orderedTypes.push({ type: value, start: hit.start }); break;
        case 'feature':
          // "alcohol free, Kelowna" is the visitor's trip, not a venue badge.
          if (value === 'nonalcoholic' && isTripLevelAlcoholFree(hit, tokens)) { conceptMentions.push({ value: 'alcohol', end: hit.end, phrase: hit.phrase }); continue; }
          intent.features.push(value); break;
        case 'collection': intent.collections.push(value); break;
        case 'activity': intent.activities.push(value); break;
        case 'cuisine': intent.cuisines.push(value); break;
        case 'concept': conceptMentions.push({ value, end: hit.end, phrase: hit.phrase }); break;
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
        case 'month': monthMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'season': seasonMentions.push({ value, start: hit.start, phrase: hit.phrase }); break;
        case 'quantity': break; // "a couple of": an amount, never an occasion
        case 'unsupported': intent.unsupported.push(value); break;
        default: break;
      }
      intent.matched.push({ phrase: hit.phrase, field, value });
    }
  }
  for (const l of lengths) intent.matched.push({ phrase: l.phrase, field: 'days', value: l.days });
  // Stage 3.5: the length phrase claims its pace word ("3 relaxed days"), so
  // the word is read here as a pace mention. A one-day theme inside a longer
  // trip ("one relaxed day") starts a theme window below, so its mention is
  // left to that day exactly as before.
  for (const l of lengths) {
    const word = l.phrase.split(' ').find((x) => LENGTH_PACE_WORDS[x]);
    if (word && t.paces.includes(LENGTH_PACE_WORDS[word])) paceMentions.push({ value: LENGTH_PACE_WORDS[word], start: l.start, phrase: l.phrase });
  }

  // 4. Leftover meaningful words become text terms (e.g. "poutine"). They
  // are the visitor's own words, searched later against venue text; never
  // generated here.
  for (let i = 0; i < tokens.length; i++) {
    if (preClaimed[i] || claimed[i] || neg.triggerTokens.has(i)) continue;
    const w = tokens[i];
    if (STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 2) continue;
    if (neg.negatedTokens.has(i)) intent.excluded.textTerms.push(w);
    else intent.textTerms.push(w);
  }

  // 5. Single-valued fields: the last mention wins; disagreements are
  // recorded as conflicts rather than silently resolved.
  const lastOf = (field, mentions) => {
    const values = uniq(mentions.map((m) => m.value));
    if (values.length > 1) intent.conflicts.push({ field, values });
    return mentions.length ? mentions.slice().sort((a, b) => a.start - b.start)[mentions.length - 1].value : null;
  };
  // Step 1 (2026-09-29): a one-day mention inside a longer trip ("a 3-day
  // trip ... one relaxed day with a nice lake experience", "plan 2 days, one
  // of them on the lake") is a DAY THEME, never the trip length. Its window
  // runs from the mention to the next theme (at most 8 words), and what is
  // said inside it (pace, types, activities, lake) belongs to that day.
  const longest = lengthMentions.reduce((m, l) => Math.max(m, l.days), 0);
  const themeAnchors = [];
  if (longest > 1) {
    for (const l of lengths) if (l.days === 1 && /^(one|a)\b/.test(l.phrase)) themeAnchors.push({ start: l.start, end: l.end, phrase: l.phrase });
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i] === 'one' && tokens[i + 1] === 'of' && ['them', 'those', 'the'].includes(tokens[i + 2])) {
        const end = tokens[i + 2] === 'the' && tokens[i + 3] === 'days' ? i + 4 : i + 3;
        themeAnchors.push({ start: i, end, phrase: tokens.slice(i, end).join(' ') });
      }
    }
    themeAnchors.sort((a, b) => a.start - b.start);
  }
  const themeWindows = themeAnchors.map((a, k) => ({ ...a, to: Math.min(a.end + 8, k + 1 < themeAnchors.length ? themeAnchors[k + 1].start : tokens.length, tokens.length) }));
  const inTheme = (start) => themeWindows.find((w) => start >= w.start && start < w.to) || null;
  for (const w of themeWindows) {
    const theme = { phrase: w.phrase, pace: null, types: [], activities: [], features: [], lake: false };
    const adjective = w.phrase.split(' ').find((x) => THEME_PACE_WORDS[x]);
    if (adjective && t.paces.includes(THEME_PACE_WORDS[adjective])) theme.pace = THEME_PACE_WORDS[adjective];
    for (const hit of accepted) {
      if (hit.start < w.end || hit.start >= w.to || isNegated(hit)) continue;
      for (const { field, value } of hit.assign) {
        if (field === 'pace' && !theme.pace) theme.pace = value;
        else if (field === 'type' && !theme.types.includes(value)) theme.types.push(value);
        else if (field === 'activity' && !theme.activities.includes(value)) theme.activities.push(value);
        else if (field === 'feature' && !theme.features.includes(value)) theme.features.push(value);
      }
    }
    for (let k = w.end; k < w.to; k++) if (LAKE_WORDS.includes(tokens[k]) && !claimed[k] && !neg.negatedTokens.has(k)) theme.lake = true;
    if (theme.features.includes('lake_view')) theme.lake = true;
    intent.dayThemes.push(theme);
  }
  // A type named ONLY inside day themes ("one day of golf") belongs to those
  // days; named anywhere else too, it is a whole-trip interest as before.
  for (const theme of intent.dayThemes) {
    theme.scopedTypes = theme.types.filter((ty) => !accepted.some((hit) => !isNegated(hit) && !inTheme(hit.start) && hit.assign.some((a) => a.field === 'type' && a.value === ty)));
  }
  const themedPace = (m) => !inTheme(m.start);

  intent.budget = lastOf('budget', budgetMentions);
  intent.pace = lastOf('pace', paceMentions.filter(themedPace));
  // "a romantic weekend for two ... a couple of hidden gems": adults is the
  // weakest occasion, so any other named occasion wins over it.
  const occasionPool = occasionMentions.some((m) => m.value !== 'adults') ? occasionMentions.filter((m) => m.value !== 'adults') : occasionMentions;
  const occasion = lastOf('occasion', occasionPool);
  intent.occasion = occasion;
  const anchorStarts = new Set(themeAnchors.map((a) => a.start));
  const lengthDays = lastOf('days', lengthMentions.filter((l) => !anchorStarts.has(l.start)).map((l) => ({ value: l.days, start: l.start })));
  const month = lastOf('month', monthMentions);
  const season = lastOf('season', seasonMentions);
  if (month) intent.month = month;
  if (season || month) intent.season = season || MONTH_SEASON[month];
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

  // 6a. Stage 3.1: exclusions. A value is never both wanted and excluded: if
  // the visitor said both ("wineries ... but not wineries") it is a conflict
  // and the positive reading is dropped. Each negated clause is reported as
  // not applied (unsupported) until search, routing and the planner apply
  // exclusions -- so nothing is silently ignored and no page is offered that
  // would show what the visitor ruled out.
  const ex = intent.excluded;
  for (const key of ['regions', 'types', 'features', 'collections', 'activities', 'cuisines', 'textTerms']) {
    ex[key] = uniq(ex[key]);
    const both = intent[key].filter((v) => ex[key].includes(v));
    if (both.length) {
      intent.conflicts.push({ field: `excluded.${key}`, values: both });
      intent[key] = intent[key].filter((v) => !both.includes(v));
    }
  }
  if (ex.budget && intent.budget === ex.budget) {
    intent.conflicts.push({ field: 'excluded.budget', values: [ex.budget] });
    intent.budget = null;
  }
  // 6a'. Excluded concepts ("we don't drink alcohol"). Recorded only when
  // present, so every other intent keeps exactly the excluded shape it had.
  for (const m of conceptMentions) {
    if (NON_ALCOHOLIC_DRINK_WORDS.has(tokens[m.end])) continue;
    if (!ex.concepts) ex.concepts = [];
    if (!ex.concepts.includes(m.value)) ex.concepts.push(m.value);
    intent.matched.push({ phrase: m.phrase, field: 'excluded.concept', value: m.value });
  }
  for (const c of neg.clauses) {
    // The visitor's own words, minus verb filler: "don't want anything
    // fancy" is reported as "not fancy", "wineries but not in Kelowna" as
    // "not in kelowna".
    const phrase = masked.slice(c.start, c.end).filter((w, k) => w !== '\u0000' && (k === 0 || !NEGATION_DISPLAY_FILLER.has(w))).join(' ');
    if (!phrase) continue;
    if (!ex.phrases.includes(phrase)) ex.phrases.push(phrase);
    if (!intent.unsupported.includes(phrase)) intent.unsupported.push(phrase);
  }

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
    || intent.budget || intent.when || intent.pace || (intent.excluded.concepts && intent.excluded.concepts.length)) {
    intent.mode = 'find';
  }
  // Outside an events request, event category words are just words; inside
  // one, venue fields are dropped -- events never select venues.
  if (intent.mode !== 'events') intent.eventCategories = [];
  else clearVenueFields(intent);

  // 8b. Step 1 (2026-09-29): what only trip planning can use. For a plan or
  // recommendation, lake words ask for lake time and a month/season shapes
  // the seasonal notes. For anything else nothing can apply them, so they
  // stay listed as not applied (a month exactly as before) and the lake
  // words stay the visitor's own search words.
  const planning = intent.mode === 'plan' || intent.mode === 'recommend';
  if (planning) {
    const lakeTerms = intent.textTerms.filter((w) => LAKE_WORDS.includes(w));
    if (lakeTerms.length) {
      for (let i = 0; i < tokens.length; i++) if (LAKE_WORDS.includes(tokens[i]) && !claimed[i] && !preClaimed[i] && !inTheme(i) && !neg.negatedTokens.has(i)) intent.lake = true;
      intent.textTerms = intent.textTerms.filter((w) => !LAKE_WORDS.includes(w));
      intent.foodTerms = intent.foodTerms.filter((f) => f.cuisine || !LAKE_WORDS.includes(f.term));
    }
  } else if (monthMentions.length || seasonMentions.length) {
    // Exactly the previous reading for everything else: a month name
    // (except "may") is reported as not applied; "in may" and season words
    // are the visitor's own words again, in their original order.
    const PREVIOUSLY_UNSUPPORTED_MONTHS = ['january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const released = new Set();
    for (const hit of accepted) {
      if (isNegated(hit) || !hit.assign.some((a) => a.field === 'month' || a.field === 'season')) continue;
      const monthWord = hit.phrase.split(' ').find((w) => PREVIOUSLY_UNSUPPORTED_MONTHS.includes(w));
      if (monthWord) { if (!intent.unsupported.includes(monthWord)) intent.unsupported.push(monthWord); continue; }
      for (let k = hit.start; k < hit.end; k++) released.add(k);
    }
    if (released.size) {
      const terms = [];
      for (let i = 0; i < tokens.length; i++) {
        if (preClaimed[i] || (claimed[i] && !released.has(i)) || neg.triggerTokens.has(i) || neg.negatedTokens.has(i)) continue;
        const w = tokens[i];
        if (STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 2) continue;
        terms.push(w);
      }
      intent.textTerms = uniq(terms).filter((w) => !intent.excluded.textTerms.includes(w));
      intent.foodTerms = intent.foodTerms.filter((f) => f.cuisine);
      for (const w of intent.textTerms) if (!intent.foodTerms.some((f) => f.term === w)) intent.foodTerms.push({ term: w, cuisine: null });
    }
    intent.month = null;
    intent.season = null;
    intent.dayThemes = [];
  } else {
    intent.dayThemes = [];
  }
  if (!intent.dayThemes.length) intent.dayThemes = [];

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

  // Structural guard (2026-10-06, follow-up): an excluded concept wins over
  // anything the parser left behind. However the refusal was worded, the words
  // that stand for the thing refused never remain as positive search terms.
  intent.textTerms = withoutConceptStrays(intent.textTerms, intent.excluded);
  intent.foodTerms = withoutConceptStrays(intent.foodTerms, intent.excluded);
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
  // Step 1 (2026-09-29): a month/season needs its own words in the text; day
  // themes and lake time come only from the deterministic reading.
  if (candidate.month != null) {
    const m = candidate.month;
    if (Number.isInteger(m) && MONTH_ALIASES[m] && MONTH_ALIASES[m].some(hasPhrase)) out.month = m;
    else rejected.push({ field: 'month', value: m, reason: 'not_in_text' });
  }
  if (candidate.season != null) {
    const s = candidate.season;
    if (typeof s === 'string' && SEASON_ALIASES[s] && SEASON_ALIASES[s].some(hasPhrase)) out.season = s;
    else if (out.month && s === MONTH_SEASON[out.month]) out.season = s;
    else rejected.push({ field: 'season', value: s, reason: 'not_in_text' });
  }
  if (out.month && !out.season) out.season = MONTH_SEASON[out.month];
  if (Array.isArray(candidate.dayThemes) && candidate.dayThemes.length) rejected.push({ field: 'dayThemes', reason: 'deterministic_only' });
  // Stage 3.1: exclusions come only from the deterministic reading.
  if (candidate.excluded && typeof candidate.excluded === 'object'
    && Object.values(candidate.excluded).some((v) => (Array.isArray(v) ? v.length : v != null))) rejected.push({ field: 'excluded', reason: 'deterministic_only' });
  if (candidate.lake === true) rejected.push({ field: 'lake', reason: 'deterministic_only' });
  if (Array.isArray(candidate.corrections) && candidate.corrections.length) rejected.push({ field: 'corrections', reason: 'deterministic_only' });
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
  for (const meal of Object.keys(TRIP_MEALS)) if (TRIP_MEALS[meal].types.every((ty) => t.types.includes(ty))) {
    add(meal, 'tripMeal', meal);
    // Stage 3.1: "nice dinners", "two lunches" are the same meal parts.
    add(pluralOf(meal), 'tripMeal', meal);
  }
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
  // Step 1 (2026-09-29): a comma or semicolon separates parts like "and"
  // does ("coffee, a beach afternoon, a winery and dinner"). Normalization
  // drops punctuation, so the separator is made a word first.
  const normalized = normalizeDiscoveryText(typeof text === 'string' ? text.replace(/\s*[,;]\s*/g, ' and ') : text);
  if (!normalized || base.exactVenue || !['find', 'events'].includes(base.mode)) return out;
  // Stage 3.2: the same corrections as the base request, word for word.
  const tokens = correctDiscoveryTokens(normalized.split(' '), discoveryIndex(taxonomy, t)).tokens;
  const table = tripPhraseTable(taxonomy);
  const regionPhrase = new Map();
  for (const e of table) for (const a of e.assign) if (a.field === 'region' && !regionPhrase.has(e.phrase)) regionPhrase.set(e.phrase, a.value);

  const route = findTripRoute(tokens, regionPhrase);
  if (route) out.unknownPlaces = route.unknown.slice();
  const masked = tokens.map((tok, i) => (route && i >= route.start && i < route.end ? '\u0000' : tok));
  const { accepted: allAccepted, claimed: tripClaimed } = matchPhrases(masked, table);
  // Stage 3.1: a negated part ("a winery, no breweries, and dinner") is never
  // a trip component; the base intent already reports its clause.
  const negT = findNegations(masked, allAccepted, tripClaimed);
  const accepted = allAccepted.filter((hit) => !negT.negatedHits.has(hit));
  // Step 1 (2026-09-29): the visitor's own words no part could use ("a lake
  // walk"), so the planner can name them instead of dropping them silently.
  out.leftoverTerms = uniq(tokens.filter((w, i) => masked[i] !== '\u0000' && !tripClaimed[i] && !negT.triggerTokens.has(i) && !negT.negatedTokens.has(i) && !STOPWORDS.has(w)
    && !TRIP_ROUTE_FILLER.has(w) && !TRIP_LIST_JOINERS.has(w) && !/^\d+$/.test(w) && w.length >= 2));
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
  let pendingCuisines = null; // Stage 3.5 D4: "italian" waiting for its "dinner"
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
    if (meal) {
      const c = newComp(hit, { types: TRIP_MEALS[meal].types.filter((ty) => t.types.includes(ty)), meal, daypart: TRIP_MEALS[meal].daypart });
      if (pendingCuisines) { for (const q of pendingCuisines) if (!c.cuisines.includes(q)) c.cuisines.push(q); pendingCuisines = null; }
      continue;
    }
    if (types.length) {
      const c = newComp(hit, { types: uniq(types) });
      if (features.includes('dog_friendly')) c.dog = true; // "dog beach"
      continue;
    }
    const activities = fieldsOf(hit, 'activity');
    if (activities.length) { newComp(hit, { types: ['outdoor'], activities: uniq(activities) }); continue; }
    const cuisines = fieldsOf(hit, 'cuisine');
    if (cuisines.length) {
      // Stage 3.5 D4 (2026-09-30): a cuisine right before a restaurant meal
      // ("italian dinner", "mexican lunch") is that one meal, not a second
      // restaurant part. Only lunch and dinner, and only when the two words
      // are adjacent; breakfast, brunch and supper (which a one-part request
      // would search for as a word) and forms like "sushi for dinner" are
      // unchanged.
      const next = accepted[h + 1];
      const nextMeal = next && next.start === hit.end ? (fieldsOf(next, 'tripMeal')[0] || (TRIP_MEALS[next.phrase] ? next.phrase : null)) : null;
      if (nextMeal === 'lunch' || nextMeal === 'dinner') { pendingCuisines = uniq(cuisines); continue; }
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
  DISCOVERY_NEVER_CORRECT: Object.freeze(Array.from(NEVER_CORRECT)),
  DISCOVERY_MAX_TEXT_LENGTH,
  DISCOVERY_MODES,
  DISCOVERY_OCCASIONS,
  DISCOVERY_OCCASION_NOTES,
  DISCOVERY_COLLECTION_KINDS,
  DISCOVERY_CONCEPT_STRAY_WORDS: CONCEPT_STRAY_WORDS,
  normalizeDiscoveryText,
  buildPhraseTable,
  interpretDiscoveryQuery,
  validateDiscoveryIntent,
  interpretTripComponents,
};
