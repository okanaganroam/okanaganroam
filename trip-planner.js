// Build My Trip planner (Phase 3, 2026-09-25).
//
// Turns a validated DiscoveryIntent (discovery-intent.js) plus the site's
// verified venue facts into either a focused set of recommendations or a
// coherent day-by-day plan, with a "why this fits" explanation for every stop.
//
// PURE, like the interpreter: no database, no network, no AI. server.js reads
// the venues, collections and events from the database and passes them in
// (see buildTripPlannerFacts); every venue this module can return is one of
// those records, identified by its id and canonical URL. Every explanation is
// assembled from (a) what the visitor asked for and (b) a verified field on
// that record -- a badge column, a collection membership, an activity
// membership, the cuisine, words that really appear in its name/description,
// its rating and review count, its price level, or the straight-line distance
// between two stored coordinates. Occasions (date night, rainy day, family...)
// are heuristics and are always labelled as such. Nothing about opening
// hours, travel times, weather, atmosphere or awards is ever claimed.

'use strict';

const hoursModule = require('./hours.js');
const tripRequirements = require('./trip-requirements');
const tripStory = require('./trip-story');

const PLAN_DAYPARTS = {
  relaxed: ['morning', 'afternoon', 'evening'],
  standard: ['morning', 'afternoon', 'evening'],
  packed: ['morning', 'midday', 'afternoon', 'evening'],
};
// 'late' (late afternoon) is used only by a wine day with three or more tastings (2026-10-18: "3 wineries a day").
// 'night' (2026-10-18) holds a What's On event on an evening that also has dinner: after dinner, or before it (labelled
// "Early evening") when the event starts before 7 PM.
const PLAN_DAYPART_LABELS = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', late: 'Late afternoon', evening: 'Evening', night: 'Night' };
// Events (2026-10-18): a day in one town also gets events in towns about this many minutes' drive away (West Kelowna
// for Kelowna, Penticton for Naramata), and a meal with nothing left in town falls back to a town this close.
const EVENT_NEARBY_MINUTES = 30;
const MEAL_NEARBY_MINUTES = 20;
// A family event that runs most of the day (a ranch's 10-4 fall weekend) is a drop-in visit of this length.
const DROP_IN_MINUTES = 150;
// Straight-line distance budget between consecutive stops, and the score
// cost per km, by pace. Straight-line only: no travel-time claims.
const PLAN_MAX_HOP_KM = { relaxed: 15, standard: 30, packed: 50 };
const PLAN_KM_PENALTY = { relaxed: 1.2, standard: 0.7, packed: 0.4 };
const OUTING_KM_PENALTY = 2;
const PLAN_MAX_DAYS = 7;
const RECOMMENDATION_COUNT = 8;
const RECOMMENDATION_PER_TYPE = 3;

// How well a venue type suits each part of the day (0 = never placed there).
const SLOT_AFFINITY = {
  morning: { cafe: 3, outdoor: 3, golf: 3, beach: 1, indoor: 2, tour: 2, sport: 2 },
  midday: { restaurant: 3, cafe: 2, winery: 2, beach: 2, brewery: 1, outdoor: 1, indoor: 2, tour: 2, sport: 2 },
  afternoon: { winery: 3, beach: 3, outdoor: 2, brewery: 2, golf: 2, distillery: 2, cafe: 1, restaurant: 1, indoor: 3, tour: 3, sport: 3 },
  // 2026-10-14: no winery in the evening slot. Tasting rooms close around 5-6 pm, and a winery there left day plans
  // without dinner ("Evening: Sperling Vineyards", no hours listed). A winery with a restaurant is a restaurant listing.
  evening: { restaurant: 3, cocktail: 3, pub: 3, brewery: 2, indoor: 2, tour: 1, sport: 1 },
};
// Types on which the Food & Drink badge columns are meaningful.
const BADGE_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'];
const DINING_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery'];
const MEAL_FILL_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail'];
const OUTSIDE_TYPES = ['beach', 'outdoor', 'golf'];

// Occasion heuristics: which types suit the occasion, and which outdoor
// activities (verified memberships) suit it. Never stored, never claimed as fact.
const OCCASION_TYPES = {
  date_night: ['restaurant', 'cocktail', 'winery'],
  romantic: ['restaurant', 'cocktail', 'winery'],
  family: ['beach', 'outdoor', 'restaurant', 'cafe'],
  rainy_day: ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'],
  celebration: ['restaurant', 'cocktail', 'winery', 'brewery'],
  group_getaway: ['winery', 'brewery', 'cocktail', 'restaurant', 'pub', 'golf'],
  relaxing: ['winery', 'cafe', 'beach', 'outdoor', 'restaurant'],
  adventure: ['outdoor', 'beach', 'brewery', 'restaurant'],
  adults: ['winery', 'brewery', 'cocktail', 'restaurant', 'distillery'],
};
const OCCASION_ACTIVITIES = {
  family: ['nature', 'viewpoints', 'water', 'hiking', 'adventure'],
  relaxing: ['viewpoints', 'nature'],
  adventure: ['adventure', 'hiking', 'cycling', 'water'],
};
const OCCASION_LABELS = {
  date_night: 'date night', romantic: 'romantic outing', family: 'family trip', rainy_day: 'rainy day',
  celebration: 'celebration', group_getaway: 'group getaway', relaxing: 'relaxing getaway', adventure: 'adventure', adults: 'adults-only trip',
};
const OCCASION_DEFAULT_PACE = { relaxing: 'relaxed', adventure: 'packed' };
// Visitor-facing notes for an occasion (Batch B, 2026-09-27). The discovery
// module's own notes (intent.heuristics, also returned by /api/discover) are
// written for developers ("Heuristic: ..."); plans show these instead. Same
// honesty: each says what the picks are based on, and which badge is the
// one Okanagan Roam verifies, without implementation words.
const OCCASION_VISITOR_NOTES = {
  date_night: 'Picked with a date night in mind, based on each place\u2019s type, badges and description.',
  romantic: 'Picked with romance in mind, based on each place\u2019s type, badges and description.',
  rainy_day: 'Indoor kinds of places come first. Okanagan Roam doesn\u2019t track the weather or confirm that a place is indoors, so check before you go.',
  family: 'Family-friendly places come first. Kid-Friendly is the badge Okanagan Roam verifies.',
  celebration: 'Restaurants, lounges, wineries and group-friendly places come first for a celebration.',
  group_getaway: 'Wineries, breweries, lounges and group-friendly places come first for a group trip.',
  relaxing: 'A slower pace, with wineries, cafes, beaches and scenic outdoor stops first.',
  adventure: 'Active outdoor stops come first: adventure, hiking, cycling and water.',
  adults: 'An adults-only trip, so wineries, breweries and lounges are welcome.',
};
function visitorNote(h) {
  return (h && h.field === 'occasion' && OCCASION_VISITOR_NOTES[h.value]) || h.note;
}
const KIDS_EXCLUDED_TYPES = ['cocktail', 'pub', 'distillery'];
const ROMANCE_WORDS = ['romantic', 'intimate', 'candlelit', 'candle lit', 'date night', 'sunset', 'cozy', 'cosy'];

// ---------- small helpers ----------

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function hasCoords(v) { return v && Number.isFinite(v.lat) && Number.isFinite(v.lng); }
// Round 7 (2026-10-19): places on opposite shores of Okanagan Lake are as far apart as the way around it.
function kmBetween(a, b) { return hasCoords(a) && hasCoords(b) ? tripRequirements.travelKm(a, b) : null; }
// Stage 3.3: whole-word matching and the food rule come from the shared
// retrieval module (discovery-search.js) -- the same functions, unchanged.
// Stage 3.5 (2026-09-29): so do the visitor's exclusions ("not in Kelowna",
// "no wineries", "nothing fancy"), applied exactly as /search applies them.
const { OUTSIDE_PLACE_NAMES } = require('./discovery-intent.js');
const { textHas, foodMatch, exclusionPlan, isExcluded, CONCEPT_PRIMARY_TYPES, withoutConceptStrays } = require('./discovery-search.js');
// Deterministic per-(seed, venue) jitter in [0, 1): regeneration variety
// without randomness.
function jitter(seed, id) {
  if (!seed) return 0;
  let h = (Math.imul(id | 0, 2654435761) ^ Math.imul(seed | 0, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return (h % 1000) / 1000;
}
function listText(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
function priceText(p) { return '$'.repeat(p); }
function article(phrase, capital) {
  const a = /^[aeiou]/i.test(phrase) ? 'an' : 'a';
  return `${capital ? a.charAt(0).toUpperCase() + a.slice(1) : a} ${phrase}`;
}
function budgetFits(budget, price) {
  if (!budget || price == null) return null;
  if (budget === 'budget') return price <= 2;
  if (budget === 'moderate') return price >= 1 && price <= 3;
  if (budget === 'upscale') return price >= 3;
  return null;
}

// ---------- opening hours (Phase 3.5) ----------
//
// venues.hours is the site's own structured JSON (every non-empty value in
// production parses): {"mon": [["16:30","20:30"]], "tue": null, "wed": [], ...}.
// The venue page already shows null and [] as "Closed", so a day listed that
// way is treated as a verified closure; a range is open time; a MISSING day
// key, an unparseable value or no hours at all is UNKNOWN -- never assumed
// open, never assumed closed. Times may be "7:00" or "07:00"; "00:00" as a
// closing time means midnight, and a close before the open (17:00-01:00)
// runs past midnight. Nothing here is ever written back.
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const WEEKDAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
// The time each part of the day stands for, and the minimum listed-open
// overlap needed to schedule a stop there. "drinks" is the pre-dinner slot
// of a date night.
const SLOT_WINDOWS = {
  morning: { from: 9 * 60, to: 11 * 60 + 30, need: 60, label: 'morning' },
  midday: { from: 11 * 60 + 30, to: 14 * 60, need: 60, label: 'midday' },
  afternoon: { from: 13 * 60, to: 17 * 60, need: 90, label: 'afternoon' },
  late: { from: 15 * 60 + 30, to: 18 * 60, need: 60, label: 'late afternoon' },
  // A pre-dinner drink needs the listing to run to at least 18:30, and
  // dinner to at least 20:00 -- a 17:00 or 19:00 close is not enough.
  drinks: { from: 17 * 60, to: 19 * 60, need: 90, label: 'early evening' },
  evening: { from: 18 * 60, to: 21 * 60, need: 120, label: 'evening' },
};
// Types that are expected to list hours (the Food & Drink / winery badge
// types). Beaches, parks and golf courses rarely do, so a missing value
// there is not flagged as a caveat.
const HOURS_EXPECTED_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery', 'indoor', 'tour'];

// -> { known, days: { mon: { status: 'open', ranges: [[from, to]] } | { status: 'closed' } | { status: 'unknown' } } }
// Stage 2 (2026-09-29): the site's one hours reading (hours.js) -- the same
// open / closed / unknown days, past-midnight closes ("02:00", "26:00") and
// 24-hour days as the venue page, structured data and Open Now. Only a
// non-string value is refused here, as before.
function parseVenueHours(raw) {
  if (typeof raw !== 'string') return hoursModule.parseHours(null);
  return hoursModule.parseHours(raw);
}
function windowOverlap(day, win) {
  if (!day || day.status !== 'open') return 0;
  let overlap = 0;
  for (const [a, b] of day.ranges) overlap += Math.max(0, Math.min(b, win.to) - Math.max(a, win.from));
  return overlap;
}
function coversWindow(day, win) {
  return !!day && day.status === 'open' && windowOverlap(day, win) >= Math.min(win.need, win.to - win.from);
}
// Proven closed for the whole window on that day: listed as closed, or open
// only at other times. Unknown days are never "proven closed".
function provenClosed(day, win) {
  return !!day && (day.status === 'closed' || (day.status === 'open' && windowOverlap(day, win) === 0));
}
function dayListText(list) {
  if (list.length === 7) return 'every day';
  const idx = list.map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b);
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i; else runs.push([i, i]);
  }
  return runs.map(([a, b]) => (a === b ? WEEKDAY_LABELS[WEEKDAYS[a]] : `${WEEKDAY_LABELS[WEEKDAYS[a]]}\u2013${WEEKDAY_LABELS[WEEKDAYS[b]]}`)).join(', ');
}
// Does a venue's listed hours fit a slot?
//   verified -- the listed hours cover the slot (on that weekday, or on every day)
//   partial  -- they cover it on some days (no specific day known)
//   closed   -- the listed hours PROVE it is not open then (incompatible)
//   unknown  -- no usable hours for that time: no claim either way
function hoursFit(v, windowKey, weekday) {
  const win = typeof windowKey === 'object' ? windowKey : SLOT_WINDOWS[windowKey];
  const parsed = v._hours || (v._hours = parseVenueHours(v.hours));
  if (!win || !parsed.known) return { status: 'unknown' };
  if (weekday) {
    const day = parsed.days[weekday];
    if (day.status === 'unknown') return { status: 'unknown' };
    return coversWindow(day, win) ? { status: 'verified', days: [weekday] } : { status: 'closed' };
  }
  const covered = WEEKDAYS.filter((d) => coversWindow(parsed.days[d], win));
  const unknownDays = WEEKDAYS.filter((d) => parsed.days[d].status === 'unknown');
  if (covered.length === 7) return { status: 'verified', days: covered };
  if (covered.length) return { status: 'partial', days: covered };
  return unknownDays.length ? { status: 'unknown' } : { status: 'closed' };
}

// The stored hours, stated as stored: "Listed hours: 11:00–18:00 daily",
// "Listed hours Friday: 16:00–23:00". Never "covers" or "open" -- only
// what the listing says, so the visitor can judge it for themselves.
function clockText(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
// Periods as the venue page lists them (hours.js formatRange): a past-midnight
// close as the next morning's time, an all-day day as 00:00\u201323:59.
function rangesText(day) { return day.ranges.map(hoursModule.formatRange).join(', '); }
function listedHoursText(v, weekday, days) {
  const parsed = v._hours || (v._hours = parseVenueHours(v.hours));
  if (!parsed.known) return null;
  if (weekday) {
    const day = parsed.days[weekday];
    return day.status === 'open' ? `Listed hours ${WEEKDAY_NAMES[weekday]}: ${rangesText(day)}` : null;
  }
  const groups = [];
  for (const d of days || WEEKDAYS) {
    const day = parsed.days[d];
    if (day.status !== 'open') continue;
    const text = rangesText(day);
    const g = groups.find((x) => x.text === text);
    if (g) g.days.push(d); else groups.push({ text, days: [d] });
  }
  if (!groups.length) return null;
  if (groups.length === 1 && groups[0].days.length === 7) return `Listed hours: ${groups[0].text} daily`;
  if (groups.length > 3) return 'Listed hours vary by day \u2014 see the venue page';
  return `Listed hours: ${groups.map((g) => `${g.text} ${dayListText(g.days)}`).join('; ')}`;
}

// ---------- cafe roles (Phase 3.5) ----------
//
// The 'cafe' type is a catch-all in the data: coffee houses, but also ice
// cream and gelato counters, bubble tea, bakeries and delis, a juice
// trailer, a sub shop and two grocery stores. Without changing any data,
// the planner reads each cafe's role from its existing cuisine, name and
// description so a morning slot prefers somewhere that is actually a
// cafe/bakery, a treat shop is saved for the afternoon, and a juice bar,
// sub shop or grocery store is ranked down (never excluded -- someone who
// asks for "juice" or "subs" still finds them through the text match).
const CAFE_TREAT_WORDS = ['ice cream', 'gelato', 'bubble tea', 'boba', 'shake', 'shakes', 'frozen yogurt', 'rolled ice cream', 'ice cream rolls'];
const CAFE_OTHER_WORDS = ['juice', 'smoothie', 'smoothies', 'subs', 'sub shop', 'grocery', 'grocer', 'market', 'poke'];
const CAFE_COFFEE_WORDS = ['coffee', 'espresso', 'latte', 'cafe', 'bakery', 'pastry', 'pastries', 'breakfast', 'brunch', 'croissant', 'croissants', 'scones', 'roaster', 'roastery'];
function cafeRole(v) {
  if (v.type !== 'cafe') return null;
  if (v._cafeRole) return v._cafeRole;
  const cuisine = v.cuisine || '';
  const has = (words) => words.some((w) => textHas(v.textName, w) || textHas(v.textDesc, w));
  let role;
  if (cuisine === 'dessert' || cuisine === 'bubble tea' || words(v.textName, CAFE_TREAT_WORDS)) role = 'treat';
  else if (words(v.textName, CAFE_OTHER_WORDS) && !words(v.textName, CAFE_COFFEE_WORDS)) role = 'other';
  else if (has(CAFE_COFFEE_WORDS)) role = 'coffee';
  else role = 'unclear';
  v._cafeRole = role;
  return role;
}
function words(text, list) { return list.some((w) => textHas(text, w)); }
// Score adjustment for a cafe in a given slot (a planning preference only).
const CAFE_SLOT_ADJUST = {
  coffee: { morning: 6, midday: 2, afternoon: 0 },
  unclear: { morning: 0, midday: 0, afternoon: 0 },
  treat: { morning: -10, midday: 0, afternoon: 4 },
  other: { morning: -12, midday: -8, afternoon: -8 },
};

// ---------- context ----------

function buildContext(intent, labels, options) {
  const opts = options || {};
  // 2026-10-06: an excluded concept ("we don't drink alcohol") rules out venues
  // in eligible() through ctx.exclusions. Types it rules out are also dropped
  // from what the visitor is asking for, so "we love wine country but we don't
  // drink" is read as the rest of the request, never as a wish for wineries.
  const ruledOutTypes = new Set(((intent.excluded && intent.excluded.concepts) || []).flatMap((c) => CONCEPT_PRIMARY_TYPES[c] || []));
  const occasion = intent.occasion || null;
  const pace = intent.pace || (occasion && OCCASION_DEFAULT_PACE[occasion]) || 'standard';
  return {
    intent,
    labels: labels || {},
    regions: intent.regions || [],
    types: new Set((intent.types || []).filter((t) => !ruledOutTypes.has(t))),
    alcoholFree: !!(intent.excluded && Array.isArray(intent.excluded.concepts) && intent.excluded.concepts.includes('alcohol')),
    activities: new Set(intent.activities || []),
    collections: new Set(intent.collections || []),
    features: (intent.features || []).slice(),
    // A refused concept's own words are never a search focus, whatever produced them.
    foodTerms: withoutConceptStrays((intent.foodTerms || []).slice(), intent.excluded),
    occasion,
    // Mentioning kids applies the family heuristic to ranking (labelled as a
    // heuristic in the notes) without claiming the visitor chose "family".
    scoringOccasion: occasion || ((intent.party && intent.party.kids) ? 'family' : null),
    kids: !!(intent.party && intent.party.kids) || occasion === 'family',
    dog: !!(intent.party && intent.party.dog),
    rainy: occasion === 'rainy_day',
    budget: intent.budget || null,
    superlative: !!intent.superlative,
    pace,
    seed: Number.isInteger(opts.seed) ? opts.seed : 0,
    exclude: new Set(opts.excludeIds || []),
    // Round 14: places the visitor kept on the plan (Swap pins the other stops), so an appointment-only place they kept stays.
    pinnedIds: new Set(Object.values(opts.pinned || {}).filter((x) => Number.isInteger(x))),
    // Stage 3.5: what the visitor ruled out, split into what is applied and
    // what is not (discovery-search.js exclusionPlan -- the /search rules).
    exclusions: exclusionPlan(intent.excluded),
    avoid: new Set(opts.avoidIds || []),
    // The weekday of day 1 when the request named a date ("tonight", "this
    // weekend", "Saturday"); null otherwise, so hours are judged across the week.
    startWeekday: WEEKDAYS.includes(opts.startWeekday) ? opts.startWeekday : null,
    // The time of day the visitor named ("tonight", "Saturday afternoon").
    when: intent.when || null,
    clock: opts.clock && WEEKDAYS.includes(opts.clock.weekday) && Number.isInteger(opts.clock.minutes) && opts.clock.minutes >= 0 && opts.clock.minutes < 1440 ? { weekday: opts.clock.weekday, minutes: opts.clock.minutes } : null,
    whenDaypart: intent.when && SLOT_WINDOWS[intent.when.daypart] ? intent.when.daypart : null,
    // Step 1 (2026-09-29): the month/season the visitor named (drives the
    // same soft seasonal rules as itineraries), per-day themes and lake time.
    itinerary: !!(opts.trip && opts.trip.multi),
    seasonInfo: requestSeason(intent),
    dayThemes: Array.isArray(intent.dayThemes) ? intent.dayThemes : [],
    lake: intent.lake === true,
    plannerKinds: opts.requirements ? opts.requirements.items.filter(i => i.kind === 'venue_kind' && i.strength === 'must').map(i => i.value) : intent.plannerKinds || [],
    requirements: opts.requirements || null,
    queryText: normWords(opts.text || ''),
    // Round 12 (2026-10-20): what the request means, not its wording, seeds the rotation of top picks, so a French request
    // plans the same stops as the English one (« 3 jours à Kelowna avec des vignobles » = "3 days in Kelowna with vineyards").
    rotationKey: [(intent.regions || []).join(','), [...(intent.types || [])].sort().join(','), [...(intent.activities || [])].sort().join(','), [...(intent.features || [])].sort().join(','), [...(intent.collections || [])].sort().join(','),
      intent.occasion || '', intent.budget || '', intent.party && intent.party.kids ? 'kids' : '', intent.party && intent.party.dog ? 'dog' : '', intent.pace || '', intent.days || '', intent.month || '', intent.season || '', intent.lake ? 'lake' : '',
      (intent.foodTerms || []).map((f) => f.cuisine || f.term).sort().join(','), opts.tripDate || '', opts.requirements ? (opts.requirements.items || []).map((i) => `${i.kind}:${i.value}`).sort().join(',') : '', opts.trip && opts.trip.route ? `${opts.trip.route.from}>${opts.trip.route.to}` : ''].join('|'),
    tripDate: opts.tripDate || null,
    events: opts.events || [],
    familyEvents: !!opts.familyEvents, // family events from What's On for a family trip (2026-10-18)
    holidayEvents: !!opts.holidayEvents, // round 8: the named holiday's events from What's On (Halloween)
    skiOffSeason: opts.skiOffSeason || null, // skiing asked for in a month with no lifts running (round 7)
    skiOpening: opts.skiOpening || null, // audit fix (2026-10-27): the resort's own opening day, for that note
    softPins: swapSoftPins(opts), // round 8: Swap's keep-in-place pins, which may give way
    partRegions: opts.partRegions ? opts.partRegions.parts : null, // round 8: the town for each part of a one-day plan
    partRegionOrder: opts.partRegions ? opts.partRegions.order : null,
  };
}

// The month or season named in the request as a season object (tripSeason
// shape). A season alone stands for a representative month for the seasonal
// windows, and is worded as the season itself ("in winter"), never as a month.
const SEASON_REP_MONTH = { winter: 1, spring: 4, summer: 7, fall: 10, off: 11 };
const SEASON_WORDS = { winter: 'winter', spring: 'spring', summer: 'summer', fall: 'the fall', off: 'the off-season' };
function requestSeason(intent) {
  const month = Number.isInteger(intent.month) && intent.month >= 1 && intent.month <= 12 ? intent.month : null;
  const m = month || (intent.season && SEASON_REP_MONTH[intent.season]) || null;
  if (!m) return null;
  const s = tripSeason(`2000-${String(m).padStart(2, '0')}-15`);
  if (!s) return null;
  if (!month) s.monthName = SEASON_WORDS[intent.season];
  s.named = month ? 'month' : 'season';
  return s;
}
// Lake time: the verified Lake View badge, a beach, or a curated water activity.
function lakeTest(v) {
  return v.type === 'beach' || !!(v.features && v.features.lake_view) || (v.activities || []).includes('water');
}
// Occasions that should not pull in these types unless the visitor asked for them.
// (A date-night OUTING may still start with a drink at a pub -- approved
// behaviour; only a romantic trip leaves pubs out.)
const OCCASION_EXCLUDED_TYPES = { romantic: ['golf', 'pub'], date_night: ['golf'] };
const ROMANTIC_EVENING_OCCASIONS = ['romantic', 'date_night'];
function weekdayFor(ctx, dayIndex) {
  if (!ctx.startWeekday) return null;
  return WEEKDAYS[(WEEKDAYS.indexOf(ctx.startWeekday) + dayIndex) % 7];
}

// Hours + cafe-role fit of a venue for one slot. Returns { ok: false } only
// when the listed hours prove the venue is closed then.
const UNKNOWN_HOURS_CAVEAT = 'No usable hours listed on Okanagan Roam \u2014 check before you go';

// ---------- the current Okanagan time ("tonight", "right now") ----------
//
// ctx.clock is the Okanagan wall clock supplied by the caller
// ({ weekday: 'thu', minutes: 1266 } = Thursday 21:06, America/Vancouver);
// the planner never reads a clock itself, so it stays deterministic.
// Before 05:00 the night still belongs to the previous day: 00:30 on Friday
// is Thursday night at minute 1470, where a 17:00-01:00 listing reaches.
const NIGHT_ENDS_AT = 5 * 60;
function isLiveRequest(ctx) {
  const w = ctx.when;
  return !!(ctx.clock && w && w.preset === 'today' && (w.now || w.daypart === 'evening'));
}
function serviceClock(ctx) {
  const { weekday, minutes } = ctx.clock;
  if (minutes >= NIGHT_ENDS_AT) return { weekday, now: minutes };
  return { weekday: WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7], now: minutes + 1440 };
}
// The part of a slot that is still ahead: "tonight" at 21:06 is 21:06-22:06,
// not the whole evening; "right now" is the coming hour.
function liveWindow(ctx, windowKey) {
  if (!isLiveRequest(ctx)) return null;
  const { weekday, now } = serviceClock(ctx);
  if (ctx.when.now) return { weekday, win: { from: now, to: now + 60, need: 1, label: 'next hour' }, now };
  const base = SLOT_WINDOWS[windowKey] || SLOT_WINDOWS.evening;
  if (now <= base.from) return { weekday, win: base, now };
  const from = now, to = Math.max(base.to, now + 60);
  return { weekday, win: { from, to, need: Math.min(base.need, 60), label: base.label }, now };
}
// The latest listed closing time that falls inside a live window.
function closesWithin(v, weekday, win) {
  const parsed = v._hours || (v._hours = parseVenueHours(v.hours));
  const day = parsed.days[weekday];
  if (!day || day.status !== 'open') return null;
  let end = null;
  for (const [a, b] of day.ranges) if (b > win.from && a < win.to && b < win.to) end = Math.max(end || 0, b);
  return end;
}
// Quick-service wording in a restaurant's own name or description. At
// dinner time these rank below sit-down options (never excluded, never
// described to the visitor as "quick service" -- it only moves the order).
const QUICK_SERVICE_PHRASES = ['food truck', 'food trucks', 'food trailer', 'by the slice', 'takeout only', 'take out only', 'takeout counter', 'take out counter', 'food court', 'drive thru', 'drive through', 'counter service', 'grab and go',
  // A venue describing itself as a walk-up "<food> counter" ("a smash burger
  // and taco counter"). Deliberately not "sushi counter" or a bare "the
  // counter", which also describe sit-down bars.
  'burger counter', 'burgers counter', 'taco counter', 'tacos counter', 'pizza counter', 'slice counter', 'donair counter', 'poutine counter',
  'lunch counter', 'poke counter', 'shake counter', 'perogy counter', 'sandwich counter', 'mall counter',
  // 2026-10-18: "takeout and delivery only" (a pizza place planned as a sit-down dinner).
  'takeout and delivery only', 'take out and delivery only', 'delivery only'];
function quickService(v) {
  return v.type === 'restaurant' && QUICK_SERVICE_PHRASES.some((p) => textHas(v.textName, p) || textHas(v.textDesc, p));
}
function dinnerAdjust(v) { return quickService(v) ? -12 : 0; }
function slotFit(v, ctx, windowKey, dayIndex, daypart) {
  const live = dayIndex === 0 && (windowKey === 'evening' || windowKey === 'drinks') ? liveWindow(ctx, windowKey) : null;
  const weekday = live ? live.weekday : weekdayFor(ctx, dayIndex);
  const fit = hoursFit(v, live ? live.win : windowKey, weekday);
  if (fit.status === 'closed') return { ok: false };
  const label = SLOT_WINDOWS[windowKey].label;
  if (live && fit.status === 'verified') {
    const end = closesWithin(v, weekday, live.win);
    if (end != null) {
      const caveats = [`Its listed hours end at ${clockText(end)} \u2014 check before you go`];
      const text = listedHoursText(v, weekday);
      return { ok: true, score: 2 + ((daypart === 'evening' || windowKey === 'evening') ? dinnerAdjust(v) : 0), reasons: text ? [{ code: 'hours', text, weight: 2 }] : [], caveats };
    }
  }
  const reasons = [];
  const caveats = [];
  let score = 0;
  if (fit.status === 'verified') {
    score += 6;
    const text = listedHoursText(v, weekday, fit.days);
    if (text) reasons.push({ code: 'hours', text, weight: 6 });
  } else if (fit.status === 'partial') {
    score += 2;
    const text = listedHoursText(v, null, fit.days);
    if (text) reasons.push({ code: 'hours', text, weight: 2 });
    caveats.push(`Its listed hours only fit the ${label} on ${dayListText(fit.days)} \u2014 check the day you go`);
    // 2026-10-25: a plan with no date is timed from a Saturday, so a place closed that day (a winery open Mon-Fri on
    // day 1, a Tue-Sat sushi lunch on day 2, a Sunday) comes after places that are open.
    // Day 1 of an undated plan is a Saturday, day 2 a Sunday, and so on.
    if (!weekday && Array.isArray(fit.days) && fit.days.length && !fit.days.includes(WEEKDAYS[(5 + (dayIndex || 0)) % 7])) score -= 8;
  } else if (HOURS_EXPECTED_TYPES.includes(v.type)) {
    score -= 2;
    caveats.push(UNKNOWN_HOURS_CAVEAT);
  }
  if (daypart === 'evening' || windowKey === 'evening') score += dinnerAdjust(v);
  const role = cafeRole(v);
  if (role && daypart && CAFE_SLOT_ADJUST[role]) {
    let adj = CAFE_SLOT_ADJUST[role][daypart] || 0;
    if (role === 'treat' && daypart === 'afternoon' && !ctx.kids) adj = 0; // an ice-cream stop is a family-trip bonus
    score += adj;
  }
  return { ok: true, score, reasons, caveats };
}


// Round 15c (2026-10-20): an indoor request asked for as galleries or museums says so ("art galleries in Kelowna on
// Saturday" read "Indoor & rainy day spots in Kelowna on Saturday"). A rainy-day or indoor request keeps the type's own label.
function indoorAskedLabel(text, form) {
  const q = String(text || '');
  if (!q || /\b(?:rain|rainy|raining|wet|indoor|indoors|inside)\b/.test(q)) return null;
  const gallery = /\b(?:galleries|gallery|art)\b/.test(q), museum = /\bmuseums?\b/.test(q);
  if (gallery && museum) return form === 'singular' ? 'Museum or Gallery' : 'Museums & Galleries';
  if (gallery) return form === 'singular' ? 'Art Gallery' : 'Art Galleries';
  if (museum) return form === 'singular' ? 'Museum' : 'Museums';
  return null;
}
function typeLabel(ctx, type, form = 'plural') {
  if (type === 'indoor') { const asked = indoorAskedLabel(ctx.queryText, form); if (asked) return asked; }
  const l = ctx.labels.types && ctx.labels.types[type];
  return l ? l[form] : type;
}
function regionLabel(ctx, r) { return (ctx.labels.regions && ctx.labels.regions[r]) || r; }
function activityLabel(ctx, a) { return (ctx.labels.activities && ctx.labels.activities[a]) || a; }
function featureLabel(ctx, f) { return (ctx.labels.features && ctx.labels.features[f]) || f; }
function collectionLabel(ctx, c) { return (ctx.labels.collections && ctx.labels.collections[c]) || c; }

// ---------- eligibility (hard rules) ----------
//
// strict = the visitor asked to FIND something specific (find/recommend):
// every named type, activity, collection, feature and food word must hold.
// Otherwise (plans) those are focus preferences handled by scoring/quotas,
// and only the safety rules below are hard.
const BUDGET_SKIPPED_TYPES = ['winery', 'distillery'];
// A budget trip (2026-10-18) skips the paid extras nobody asked for -- spas and wellness, guided or rental tours,
// adventure outfitters, golf -- and leans on free parks, walks, beaches and markets.
const BUDGET_PAID_RE = /\b(?:spa|spas|wellness|massage|massages|facials?|float(?:ing)? (?:spa|tank|centre|center)|sauna|esthetics?|day spa|adventure company|adventures? (?:co|inc|ltd)|rentals?|zip ?lines?|ziplining|charters?|guided|resort|yurts?|campground|rv park)\b/;
const FREE_PLACE_RE = /\b(?:park|parks|trail|trails|walkway|boardwalk|greenway|beach|beaches|lookout|viewpoint|market|markets|promenade|waterfront|nature reserve|free)\b/;
function budgetPaid(v) {
  if (v.type === 'tour' || v.type === 'golf') return true;
  if ((v.plannerKinds || []).includes('spa')) return true;
  return ['indoor', 'outdoor', 'sport'].includes(v.type) && BUDGET_PAID_RE.test(`${v.textName || ''} ${v.type === 'indoor' ? v.textDesc || '' : ''}`);
}
const BUDGET_FOOD_TYPES = ['restaurant', 'cafe', 'pub'];
// 2026-10-21: October to April a beach is a lakeside stroll, not a beach day: at most one a day (a late-October family
// trip had six beaches in three days). A fenced dog beach or off-leash park is only for trips with a dog.
const COOL_BEACH_MONTHS = [10, 11, 12, 1, 2, 3, 4];
function coolBeachMonth(date) { const m = Number(String(date || '').slice(5, 7)); return !!m && COOL_BEACH_MONTHS.includes(m); }
// Weekly audit (2026-10-25): a dog swimming area too (Goodman Park Dog Swimming Area led an Osoyoos beach day with no dog).
const DOG_ONLY_RE = /\b(?:dog beach|dog park|dog swimming|dog swim area|off[- ]?leash)\b/;
function dogOnlyPlace(v) { return ['beach', 'outdoor'].includes(v.type) && DOG_ONLY_RE.test(normWords(v.name || '')); }
// ---------- weekly nights and specials (audit fix, 2026-10-27) ----------
//
// server.js passes each venue's shown weekly nights (facts[].nights: kind, days, frequency, start, end) and food
// specials (facts[].specials: days, title, deal). "Trivia night in Kelowna on Tuesday" was matched only on the word
// "trivia" in descriptions, so the pub whose trivia is on Wednesday came first and the lounge with Tuesday trivia was
// missing. A night word in the request is matched on the nights a place hosts on the plan's day (on the Okanagan
// calendar, honouring the frequency); a place whose listed night of that kind is on another day ranks below.
const NIGHT_ASK_TERMS = [[/^(?:trivia|trivia nights?|quiz|quizzes|quiz nights?|pub quiz)$/, 'trivia'], [/^(?:karaoke|karaoke nights?)$/, 'karaoke'], [/^(?:bingo|bingo nights?|singo)$/, 'bingo'],
  [/^(?:open mic|open mics|open mike|open mic nights?)$/, 'open_mic'], [/^(?:comedy nights?|stand up|standup)$/, 'comedy'], [/^(?:run club|running club|run clubs)$/, 'run_club'],
  [/^(?:games? nights?|board games|cribbage|darts)$/, 'games'], [/^(?:paint nights?|paint and sip)$/, 'paint']];
const NIGHT_KIND_WORDS = { trivia: 'trivia', karaoke: 'karaoke', bingo: 'bingo', open_mic: 'open mic', comedy: 'comedy', run_club: 'run club', games: 'games night', paint: 'paint night', live_music: 'live music' };
function nightKindOfTerm(term) { const t = normWords(term || ''); const hit = NIGHT_ASK_TERMS.find(([re]) => re.test(t)); return hit ? hit[1] : null; }
// The plan's own day ('YYYY-MM-DD') when the request named one ("tonight", "Tuesday", "tomorrow"); null otherwise.
function ctxPlanDate(ctx) {
  if (!ctx || !WEEKDAYS.includes(ctx.startWeekday) || !/^\d{4}-\d{2}-\d{2}$/.test(ctx.tripDate || '')) return null;
  const sunFirst = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const wd = new Date(`${ctx.tripDate}T12:00:00Z`).getUTCDay(), want = sunFirst.indexOf(ctx.startWeekday);
  return new Date(Date.parse(`${ctx.tripDate}T12:00:00Z`) + ((want - wd + 7) % 7) * 86400000).toISOString().slice(0, 10);
}
// The same frequency rules as server.js nightOnDate(): weekly and every other week on the day; set weeks of the month.
function nightOnPlanDate(n, date) {
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T12:00:00Z`).getUTCDay()];
  if (!n || !(n.days || []).includes(weekday)) return false;
  const dom = Number(date.slice(8, 10)), week = Math.ceil(dom / 7);
  const monthDays = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  switch (n.frequency || 'weekly') {
    case 'monthly-1st': return week === 1;
    case 'monthly-last': return dom + 7 > monthDays;
    case 'monthly-1st-3rd': return week === 1 || week === 3;
    case 'monthly-2nd-4th': return week === 2 || week === 4;
    default: return true;
  }
}
// -> { on: night on the plan's day | null, other: a listed night of that kind on another day | null } or null when the
// place lists no night of that kind.
function venueNight(v, kind, date) {
  const list = ((v && v.nights) || []).filter((n) => n && n.kind === kind);
  if (!list.length) return null;
  const on = date ? list.find((n) => nightOnPlanDate(n, date)) || null : null;
  return { on, other: on ? null : list[0] };
}
function nightClock(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]), mm = Number(m[2]);
  return `${h % 12 || 12}${mm ? `:${m[2]}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
// A food word in one of the place's specials on the plan's day (any day when undated): "tacos" in "Taco Tuesday".
function specialFoodMatch(v, ft, date) {
  const list = (v && v.specials) || [];
  if (!list.length || !ft || ft.cuisine || nightKindOfTerm(ft.term)) return null;
  const weekday = date ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T12:00:00Z`).getUTCDay()] : null;
  const md = date ? date.slice(5) : null;
  const term = normWords(ft.term), stem = term.replace(/(?:es|s)$/, '');
  return list.find((s) => {
    if (weekday && !(s.days || []).includes(weekday)) return false;
    if (md && s.season_from && s.season_to && !(s.season_from <= s.season_to ? md >= s.season_from && md <= s.season_to : md >= s.season_from || md <= s.season_to)) return false;
    const t = normWords(`${s.title || ''} ${s.deal || ''}`);
    return textHas(t, term) || (stem.length >= 3 && textHas(t, stem));
  }) || null;
}
// A request word met by the listing's own nights or specials (for eligibility; scoreVenue ranks them).
function listedMatch(v, ft, ctx) {
  const kind = nightKindOfTerm(ft && ft.term);
  const date = ctxPlanDate(ctx);
  if (kind) { const m = venueNight(v, kind, date); return !!(m && (m.on || !date)); }
  return !!specialFoodMatch(v, ft, date);
}
function eligible(v, ctx, strict) {
  if (ctx.exclude.has(v.id)) return false;
  // Stage 3.5: an applied exclusion is a hard rule in every kind of plan.
  // Only the kinds /search applies (types, regions, stored cuisines, curated
  // lists, activities, and "nothing fancy" = a stored price of 4); "without
  // kids", "no alcohol" and the like stay unapplied and are reported.
  if (ctx.exclusions.applied.length && isExcluded(v, ctx.exclusions)) return false;
  if (dogOnlyPlace(v) && !isDogTrip(ctx)) return false;
  // Step 1 (2026-09-29): a current advisory that says the place is closed or
  // under an evacuation order takes it out of every plan (itineraries
  // already did this; day plans, outings and recommendations now do too).
  // Multi-part itineraries keep their own handling, which also names the
  // place that was left out.
  if (!ctx.itinerary && v.advisory && advisoryUnavailable(v.advisory.note)) return false;
  // A venue closed for the season today is left out the same way (dated
  // itineraries check the trip's own date in advisoryFit instead).
  // Round 7 (2026-10-19): a trip for a named month or season ("in January") is judged on that month's date.
  if (!ctx.ignoreSeason && !ctx.itinerary && !ctx.requirements && (ctx.seasonInfo && ctx.tripDate ? seasonClosedOnTrip(v, { date: ctx.tripDate }) : v.seasonClosedToday)) return false;
  if (!ctx.itinerary && !ctx.requirements && v.ownerClosures && seasonClosedOnTrip({ ownerClosures: v.ownerClosures }, null)) return false;
  // 2026-10-25: the off-season rules (no outdoor rink in October, no water park in April, no beach in November unless
  // asked for) apply in every step that picks a place, not only the main day builder; a late-afternoon filler put
  // Stuart Park's skating rink (opens in December) into an October romantic weekend.
  if (!ctx.ignoreSeason && ctx.tripDate && ctx.activities && ctx.types && offSeasonSkip(v, ctx)) return false;
  // Round 14 (2026-10-20): a place visited only by appointment or reservation (Martin's Lane, a $200 private tour) is
  // booked ahead, so it is never a default stop or a Swap pick unless the request names it or asks for a booked visit.
  if (appointmentOnly(v) && !appointmentKept(v, ctx)) return false;
  // A budget request (cheap, budget, affordable) is about food, not wine tastings (2026-10-18).
  if (ctx.budget === 'budget' && BUDGET_SKIPPED_TYPES.includes(v.type) && !ctx.types.has(v.type)) return false;
  if (ctx.budget === 'budget' && !ctx.types.has(v.type) && !ctx.plannerKinds.length && budgetPaid(v)) return false;
  const occasionExcluded = OCCASION_EXCLUDED_TYPES[ctx.occasion];
  if (occasionExcluded && occasionExcluded.includes(v.type) && !ctx.types.has(v.type)) return false;
  if (ctx.rainy) {
    if (v.type === 'beach' || v.type === 'outdoor') return false;
    if (v.type === 'golf' && !v.indoorGolf) return false;
  }
  if (ctx.kids) {
    if (KIDS_EXCLUDED_TYPES.includes(v.type)) return false;
    if (v.type === 'brewery' && !v.features.kid_friendly) return false;
  }
  // Teenagers can't go to bars (2026-10-14).
  if (['pub', 'cocktail', 'distillery'].includes(v.type) && /\b(?:teens?|teenagers?|tweens?|adolescents)\b/.test(ctx.queryText || '') && !ctx.types.has(v.type)) return false;
  if (ctx.dog && !(v.features.dog_friendly || v.collections.includes('dog_friendly'))) return false;
  for (const f of ctx.features) {
    if (ctx.requirements?.items.some(i => i.kind === 'feature' && i.value === f) && !DINING_TYPES.includes(v.type) && ['vegetarian','vegan','gluten_free'].includes(f)) continue;
    if (f === 'dog_friendly') continue; // handled above
    // Audit fix (2026-10-27): a live music night the place lists on the plan's day counts like the badge.
    if (f === 'live_music' && ((venueNight(v, 'live_music', ctxPlanDate(ctx)) || {}).on)) continue;
    if (f === 'kid_friendly') {
      if (BADGE_TYPES.includes(v.type) && !v.features.kid_friendly) return false;
      continue; // outdoor/beach/golf: family heuristic, never claimed as a badge
    }
    if (BADGE_TYPES.includes(v.type)) { if (!v.features[f]) return false; } else if (strict) return false;
  }
  if (ctx.plannerKinds.length && ['indoor', 'tour', 'sport'].includes(v.type) && !ctx.plannerKinds.some(k => (v.plannerKinds || tripRequirements.inferPlannerKinds(v)).includes(k))) return false;
  if (strict) {
    const kindMatch = ctx.plannerKinds.some(k => (v.plannerKinds || []).includes(k));
    if (ctx.plannerKinds.length && (!ctx.types.size || ['indoor','tour','outdoor','sport'].some(t=>ctx.types.has(t))) && !kindMatch) return false;
    if (ctx.types.size && !ctx.types.has(v.type) && !(v.fdTypes || []).some((t) => ctx.types.has(t)) && !(ctx.requirements && kindMatch && [...ctx.types].every(t=>['tour','indoor','outdoor','sport'].includes(t)))) return false;
    if (ctx.activities.size && !v.activities.some((a) => ctx.activities.has(a))) return false;
    if (!ctx.itinerary && ctx.requirements?.items.some(i=>i.kind==='activity'&&i.strength==='must'&&!tripRequirements.requirementDay(i,ctx.tripDate)&&!tripRequirements.matches(v,i))) return false;
    for (const c of ctx.collections) if (!v.collections.includes(c)) return false;
    // Audit fix (2026-10-27): a night or special the place lists counts like the word in its description.
    for (const ft of ctx.foodTerms) if (!foodMatch(v, ft) && !listedMatch(v, ft, ctx)) return false;
  }
  return true;
}


// ---------- scoring ----------
//
// Returns { score, reasons } where each reason is { code, text, weight } and
// every text is built from the request and a verified field. Transparent
// and deterministic; the seed only adds a small bounded jitter so
// "Regenerate" can surface other valid options.
// Mood words (2026-10-28): "cozy", "intimate", "quiet" describe the setting; with a meal word next to them ("a cozy
// dinner") they describe the meal.
const VIBE_TERM_RE = /^(?:cozy|cosy|intimate|quiet|romantic|candlelit|candle lit)$/;
const VIBE_MEAL_RE = /\b(?:cozy|cosy|intimate|quiet|romantic|candlelit)(?: [a-z]+)? (?:dinners?|lunch(?:es)?|meals?|restaurants?|brunch|breakfast|supper|dining)\b/;
function vibeMealAsked(ctx) { return VIBE_MEAL_RE.test(normWords(ctx.queryText || '')); }
function scoreVenue(v, ctx) {
  const reasons = [];
  let score = 0;
  const add = (code, weight, text) => { score += weight; if (text) reasons.push({ code, text, weight }); };

  if (ctx.types.has(v.type) || (v.fdTypes || []).some((t) => ctx.types.has(t))) {
    const t = ctx.types.has(v.type) ? v.type : (v.fdTypes || []).find((x) => ctx.types.has(x));
    add('type', 30, `Matches your request for ${typeLabel(ctx, t).toLowerCase()}`);
  }
  const acts = v.activities.filter((a) => ctx.activities.has(a));
  if (acts.length) add('activity', 25, `Listed on Okanagan Roam for ${listText(acts.map((a) => activityLabel(ctx, a)))}`);
  for (const c of v.collections) {
    if (ctx.collections.has(c)) add('collection', 22, c === 'hidden_gem' ? 'One of Okanagan Roam’s Hidden Gems' : `On Okanagan Roam’s ${collectionLabel(ctx, c)} list`);
  }
  if (!ctx.collections.has('hidden_gem') && v.collections.includes('hidden_gem')) add('collection_bonus', 3, 'One of Okanagan Roam’s Hidden Gems');
  if (!ctx.collections.has('local_favorite') && v.collections.includes('local_favorite')) add('collection_bonus', 3, 'An Okanagan Roam Local Favourite');
  for (const f of ctx.features) {
    if (f === 'dog_friendly') {
      if (v.features.dog_friendly) add('feature', 8, 'Has the Dog-Friendly badge');
      else if (v.collections.includes('dog_friendly')) add('feature', 8, 'Listed as an official dog-friendly beach area');
    } else if (v.features[f]) add('feature', 8, `Has the ${featureLabel(ctx, f)} badge`);
    if (f === 'live_music') {
      const nm = venueNight(v, 'live_music', ctxPlanDate(ctx));
      if (nm && nm.on) { const t = nightClock(nm.on.start); add('night', 30, `Live music on ${WEEKDAY_NAMES[WEEKDAYS[(new Date(`${ctxPlanDate(ctx)}T12:00:00Z`).getUTCDay() + 6) % 7]]}${t ? ` from ${t}` : ''}, from its listing`); }
    }
  }
  // Audit fix (2026-10-27): a weekly night asked for ("trivia", "karaoke", "bingo") on the plan's day comes first; one the
  // place lists on another day ranks below a description mention; a special on the day is a dish it serves then.
  const planDate = ctxPlanDate(ctx);
  for (const ft of ctx.foodTerms) {
    const nk = nightKindOfTerm(ft.term);
    const nm = nk ? venueNight(v, nk, planDate) : null;
    if (nm && nm.on) { const t = nightClock(nm.on.start); add('night', 45, `${NIGHT_KIND_WORDS[nk].replace(/^./, (c) => c.toUpperCase())} on ${WEEKDAY_NAMES[WEEKDAYS[(new Date(`${planDate}T12:00:00Z`).getUTCDay() + 6) % 7]]}${t ? ` from ${t}` : ''}, from its listing`); continue; }
    if (nm && planDate) add('night_other_day', -30, null);
    else if (nm) add('night', 25, `Hosts ${NIGHT_KIND_WORDS[nk]} on ${listText(nm.other.days.map((d) => `${WEEKDAY_NAMES[d]}s`))}, from its listing`);
    const sp = !nk && !foodMatch(v, ft) ? specialFoodMatch(v, ft, planDate) : null;
    if (sp) { add('food', 14, `${planDate ? `${WEEKDAY_NAMES[WEEKDAYS[(new Date(`${planDate}T12:00:00Z`).getUTCDay() + 6) % 7]]} special` : 'Weekly special'}: ${sp.title}`); continue; }
    const m = foodMatch(v, ft);
    if (!m) continue;
    if (m.cuisine) add('food', 18, `Listed cuisine: ${v.cuisineLabel || ft.cuisine} — matches “${ft.term}”`);
    else {
      const where = [m.inName && 'name', m.inCui && 'cuisine', m.inDesc && 'description'].filter(Boolean);
      // A loose word in a restaurant's description ("desert", "quiet") counts for less than a dish it serves.
      // 2026-10-28: "a cozy dinner" is about the meal, so a cozy restaurant counts in full, not as a loose word.
      const loose = DINING_TYPES.includes(v.type) && !m.inName && !m.inCui && !DISH_WORDS_RE.test(ft.term) && !/^(?:brunch|breakfast)$/.test(ft.term) && !(VIBE_TERM_RE.test(ft.term) && vibeMealAsked(ctx));
      add('food', (m.inName ? 15 : 0) + (m.inCui ? 10 : 0) + (m.inDesc ? (loose ? 3 : 7) : 0), `Mentions “${ft.term}” in its ${listText(where)}`);
    }
  }
  // 2026-10-28: a cozy or intimate request is not a sports bar (Montana's and King Taps for "a cozy dinner").
  if (v.features.sports_tv && !ctx.features.includes('sports_tv') && ctx.foodTerms.some((ft) => VIBE_TERM_RE.test(ft.term))) add('vibe_miss', -15, null);
  if (vibeMealAsked(ctx) && v.type === 'restaurant' && ctx.foodTerms.some((ft) => VIBE_TERM_RE.test(ft.term) && foodMatch(v, ft))) add('vibe_meal', 8, null);
  occasionScore(v, ctx, add); // adds through `add`; must not be `score += ...` (that would drop them)
  const fit = budgetFits(ctx.budget, v.price);
  // 2026-10-25: a place reached by a rough road ("needs a high-clearance vehicle", a forest service road, 4x4) is a
  // backcountry outing, not an everyday stop ("a day in Naramata" opened with the Mountain Goat Trail).
  // 2026-10-28: "a hike" on a trip with other plans is a hike of a few hours; a long day climb (Rainbow Lake, Singing
  // Pass) takes the whole day, so it ranks below the others unless a big or full-day hike is asked for or it is named.
  if (v.type === 'outdoor' && longDayHike(v)) {
    if (BIG_HIKE_ASKED_RE.test(ctx.queryText || '')) add('long_hike_asked', 15, 'A full-day hike, as asked');
    else if (!namedInRequest(v, ctx)) add('long_hike', -18, null);
  }
  // 2026-10-28: "a spa" puts a destination spa (hot pools, saunas, thermal baths) ahead of a treatment room or a massage
  // studio.
  if (SPA_ASKED_RE.test(ctx.queryText || '') && spaPlace(v)) {
    if (SPA_DESTINATION_RE.test(`${v.textName || ''} ${v.textDesc || normWords(v.plannerDescription || v.description || '')}`)) add('spa_destination', 12, 'A spa with hot pools, saunas and cold plunges');
    else if (/\bmassage\b/.test(v.textName || normWords(v.name || ''))) add('spa_massage', -6, null);
  }
  if (v.type === 'outdoor' && roughAccess(v) && !normWords(ctx.queryText || '').includes((v.textName || '').split(' ').slice(0, 2).join(' '))) add('rough_access', -10, null);
  // 2026-10-25: "a day on the lake in Kelowna in July" was Knox Mountain, a winery and chocolate -- the lake asked for was
  // met by a lake view. From June to September a lake day puts the beaches and water activities first.
  if (ctx.lake && [6, 7, 8, 9].includes(Number(String(ctx.tripDate || '').slice(5, 7))) && (v.type === 'beach' || (v.activities || []).includes('water'))) add('lake_day', 12, 'On the water');
  // 2026-10-25: "dog beach in Kelowna" led with Cedar Creek Park; a dog beach or off-leash park asked for comes first.
  if (/\b(?:dog beach|dog beaches|dog park|dog parks|dog swimming|off leash)\b/.test(normWords(ctx.queryText || '')) && dogOnlyPlace(v)) add('dog_place', 15, 'A dog beach or off-leash area');
  // 2026-10-25: "skating in Kelowna in December" listed hiking parks (skating is read as the Winter activity): a request
  // that says skating puts the rinks first.
  if (/\b(?:skating|skate|rink|rinks)\b/.test(normWords(ctx.queryText || '')) && /\b(?:rink|rinks|skating|skate)\b/.test(`${v.textName || ''}`)) add('skating', 20, 'A skating rink');
  // "Cheap eats" (2026-10-18): $ places first, $$ after, pricier ones last (it once led with $$ sushi).
  if (ctx.budget === 'budget' && v.price != null) {
    if (v.price === 1) add('budget', 14, `Price level ${priceText(v.price)} fits your budget preference`);
    else if (v.price === 2) add('budget', 3, `Price level ${priceText(v.price)} fits your budget preference`);
    else add('budget_miss', -14, null);
  } else if (ctx.budget === 'upscale' && v.price != null) {
    // 2026-10-25: "a splurge weekend in Kelowna" lunched at a café and stopped for ice cream; a splurge leads with the
    // pricier places, as "cheap eats" leads with the cheap ones.
    if (v.price >= 3) add('budget', 12, `Price level ${priceText(v.price)} fits your budget preference`);
    else if (v.price === 1) add('budget_miss', -12, null);
  } else if (fit === true) add('budget', 5, `Price level ${priceText(v.price)} fits your budget preference`);
  else if (fit === false) add('budget_miss', -6, null);
  if (v.rating != null) {
    const conf = v.reviews > 0 ? Math.min(1, Math.log10(v.reviews + 1) / 2.5) : 0.35;
    const q = (v.rating - 4.0) * 10 * conf * (ctx.superlative ? 1.6 : 1);
    add('rating', q, v.rating >= 4.3 ? (v.reviews > 0 ? `Rated ${v.rating} from ${v.reviews.toLocaleString('en-CA')} reviews` : `Rated ${v.rating}`) : null);
  }
  if (v.indoorGolf && !ctx.rainy) add('indoor_golf', -8, null); // a real course first, unless it rains
  indoorAppeal(v, ctx, add);
  // "Things to do" / "something fun" without a kind of place: activities before food and drink (2026-10-14: "something
  // fun to do in Kelowna" listed cafes and restaurants first).
  const q = ctx.queryText || '';
  if (!ctx.types.size && !ctx.foodTerms.length && THINGS_TO_DO_RE.test(q)) {
    if (DINING_TYPES.includes(v.type)) add('things_to_do_food', -15, null);
    else if (['indoor', 'outdoor', 'beach', 'tour', 'sport', 'golf'].includes(v.type)) add('things_to_do', 5, null);
  }
  // Round 10 (2026-10-19): a tour company is booked ahead, so a plan that did not ask for a tour prefers a walk-in stop.
  if (v.type === 'tour' && !ctx.types.has('tour') && !(ctx.plannerKinds || []).length) add('tour_unasked', -10, null);
  // Teenagers: the fun indoor and adventure places first, no bars.
  if (/\b(?:teens?|teenagers?|tweens?|adolescents)\b/.test(q)) {
    if (TEEN_FUN_WORDS.some((w) => textHas(v.textName, w) || textHas(v.textDesc, w))) add('teen_fun', 12, 'A fun pick for teenagers');
    if (['brewery', 'winery'].includes(v.type)) add('teen_bar', -25, null);
  }
  // On a rainy day the places people actually visit indoors come first; clubs, companies and studios last.
  if (ctx.rainy && v.type === 'indoor') {
    if (RAIN_BACKUP_GOOD_WORDS.some((w) => textHas(v.textName, w))) add('rainy_attraction', 5, 'A good rainy-day pick');
    if (RAIN_BACKUP_NICHE_WORDS.some((w) => textHas(v.textName, w))) add('rainy_niche', -10, null);
  }
  // "A hike with a view": a trail with the Lake View badge before one without.
  if (ctx.lake && ctx.activities.has('hiking') && v.type === 'outdoor' && v.features.lake_view && (v.activities || []).includes('hiking')) add('hike_view', 15, 'A trail with a lake view');
  // "Good restaurants", "fine dining", or a couple's trip: a proper dinner spot before a quick or budget one.
  if (v.type === 'restaurant' && !ctx.budget && /\b(?:good|great|nice|best|fine|excellent|amazing|special) (?:restaurants?|food|dinners?|dining|meals?)\b|\bfine dining\b|\bfoodies?\b|\bcouple\b/.test(q)) {
    if (v.price != null && v.price >= 3) add('good_dinner', 6, null);
    else if (v.price === 1) add('good_dinner_miss', -5, null);
  }
  // A place our own advisory says may not be operating (receivership, for sale, "check it is open") is kept as an
  // option but never put ahead of places that are open as usual (2026-10-14: an Osoyoos dog weekend picked a winery
  // in court-ordered receivership).
  if (v.advisory && v.advisory.note && ADVISORY_UNCERTAIN_RE.test(v.advisory.note)) add('advisory_uncertain', -30, null);
  // A campground or RV park is somewhere to stay, not a stop, unless camping was asked for.
  if (/\b(?:campground|campsite|rv park|rv resort|camping)\b/.test(v.textName || '') && !/\bcamp(?:ing|ground|site)?s?\b/.test(ctx.queryText || '')) add('campground', -25, null);
  // A vegetarian trip puts an all-vegetarian or vegan kitchen ahead of a menu that only has options.
  const vegAsked = (ctx.requirements?.items || []).some((i) => i.kind === 'feature' && ['vegetarian', 'vegan'].includes(i.value)) || ctx.features.some((f) => ['vegetarian', 'vegan'].includes(f));
  if (vegAsked && DINING_TYPES.includes(v.type) && /\b(?:vegetarian|vegan|plant based)\b/.test(`${v.textName || ''} ${v.textCuisine || ''}`)) add('veg_kitchen', 8, 'An all-vegetarian or vegan kitchen');
  // A "food tour" day is a food-tour operator and good food, not a fruit farm and a pub (2026-10-14).
  if (/\bfood(?:ie)? tours?\b|\bculinary tours?\b/.test(ctx.queryText || '')) {
    if (v.type === 'tour') { const ft = textHas(v.textName, 'food') || textHas(v.textName, 'culinary') || textHas(v.textDesc, 'food tour'); add('food_tour', ft ? 25 : -15, ft ? 'A guided food tour' : null); }
    if (['pub', 'brewery', 'cocktail', 'distillery'].includes(v.type)) add('food_tour_bar', -12, null);
  }
  // A dog trip is walks, trails and beaches first, then patios (2026-10-14: a dog weekend was a distillery, a bike park
  // and a brewery).
  if (isDogTrip(ctx)) {
    if (['outdoor', 'beach'].includes(v.type)) { const bad = /\bbike park\b|\bbmx\b|\bskate ?park\b|\bcampground\b/.test(v.textName || ''); add('dog_outdoors', bad ? -12 : 12, bad ? null : 'A good walk with your dog'); }
    if (v.type === 'distillery') add('dog_distillery', -10, null);
  }
  // Kids are not taken to a meadery, cidery or casino on a rainy day, nor to indoor golf unless golf was asked for.
  if (ctx.kids && v.type === 'indoor' && KIDS_ADULT_WORDS.some((w) => textHas(v.textName, w) || textHas(v.textDesc, w))) add('kids_adult_setting', -40, null);
  if (ctx.kids && v.type === 'golf' && !ctx.types.has('golf')) add('kids_golf', -15, null);
  // Round 14 (2026-10-20): an indoor playground for small children is not an afternoon out for adults (Play Area Kelowna
  // was day 2 of a plain Kelowna weekend).
  if (!ctx.kids && v.type === 'indoor' && KIDS_ONLY_RE.test(`${v.textName || ''} ${v.textDesc || normWords(v.plannerDescription || v.description || '')}`)) add('kids_only', -30, null);
  if (ctx.kids && v.type === 'indoor' && RAIN_BACKUP_KIDS_WORDS.some((w) => textHas(v.textName, w) || textHas(v.textDesc, w))) add('kids_indoor_fun', 8, 'Indoor fun for kids');
  if (ctx.rainy && v.type === 'indoor' && /\b(?:ranch|farm|garden|gardens|orchard)\b/.test(v.textName || '')) add('rainy_mostly_outdoors', -8, null);
  // A party that doesn't drink is not sent to a winery or brewery restaurant for dinner (2026-10-14).
  if (ctx.alcoholFree && DINING_TYPES.includes(v.type) && ALCOHOL_SETTING_WORDS.some((w) => textHas(v.textName, w) || textHas(v.textDesc, w))) add('alcohol_setting', -12, null);
  if (ctx.avoid.has(v.id)) add('avoid', -20, null);
  add('jitter', jitter(ctx.seed, v.id) * 8, null);
  return { score, reasons };
}

// Indoor attractions (2026-10-14): with no rating to rank them, "what can we do if it rains" listed a casino, a
// recording studio and a parkour gym first, alphabetically. Visitor attractions (museums, galleries, cinemas, bowling,
// arcades, climbing) come first; venues for members or adults (casinos, gyms, studios) only when asked for by name.
// Dishes and cuisines ("pizza", "sushi", "tacos") are capped per day; words like "quiet" or "local" are not.
const DISH_WORDS_RE = /^(?:pizzas?|burgers?|sushi|tacos?|ramen|pho|bbq|barbecue|steaks?|steakhouse|seafood|fish and chips|wings|poutine|noodles?|dumplings?|curry|indian|thai|mexican|italian|chinese|japanese|korean|greek|vietnamese|french|middle eastern|lebanese|sandwich(?:es)?|ice cream|gelato|donuts?|doughnuts?|crepes?|waffles?|pancakes?|pasta|tapas|dim sum|shawarma|kebabs?|fried chicken|hot dogs?)$/;
const BRUNCH_FOOD_RE = /\b(?:brunch|breakfast|breakfasts|eggs benedict|benny|bennies|pancakes?|waffles?|omelett?es?|french toast|hash browns?|diner)\b/;
const KIDS_ONLY_RE = /\b(?:indoor playground|indoor play (?:centre|center|area|space)|play area|playhouse cafe|ball pit|play structures|for (?:young|little|small) (?:kids|children|ones)|toddlers?|preschoolers?)\b/;
const THINGS_TO_DO_RE = /\b(?:things? to do|something (?:fun )?to do|stuff to do|what to do|what can we do|activities|something fun|fun things|have fun)\b/;
const TEEN_FUN_WORDS = ['escape', 'arcade', 'laser tag', 'go kart', 'go karts', 'karting', 'climbing', 'bouldering', 'trampoline', 'mini golf', 'bowling', 'zipline', 'zip line', 'axe throwing', 'paintball', 'virtual reality', 'vr', 'waterslide', 'water park', 'bike park', 'skate park'];
const SOFT_FEATURES = ['patio', 'lake_view', 'happy_hour', 'live_music', 'great_groups', 'sports_tv', 'open_late', 'open_early'];
const KIDS_ADULT_WORDS = ['meadery', 'cidery', 'winery', 'brewery', 'distillery', 'casino', 'lounge', 'nightclub', 'cannabis', 'tasting room'];
const ALCOHOL_SETTING_WORDS = ['winery', 'vineyard', 'vineyards', 'brewery', 'brewpub', 'taproom', 'wine bar', 'tasting room', 'estate winery'];
const INDOOR_VISITOR_KINDS = ['museum', 'gallery', 'theatre', 'bowling', 'arcade', 'climbing', 'escape'];
const INDOOR_NICHE_WORDS = ['casino', 'gaming', 'fitness', 'gym', 'yoga', 'pilates', 'dance studio', 'martial arts', 'parkour', 'recording studio', 'studios', 'crossfit'];
// The category photo for a stop card: by type, refined by what the place is listed for (2026-10-14).
function stopPhoto(v) {
  const kinds = v.plannerKinds || tripRequirements.inferPlannerKinds(v);
  const acts = v.activities || [];
  const name = `${v.textName || ''} ${v.textDesc || ''}`;
  let key = v.type;
  if (v.type === 'outdoor') {
    key = /\bski\b|ski resort|mountain resort|snowshoe/.test(name) ? 'ski' : acts.includes('winter') ? 'winter' : acts.includes('hiking') ? 'hiking'
      : acts.includes('viewpoints') ? 'viewpoints' : acts.includes('water') || /\b(?:kayak|paddle|boat|sup)\b/.test(name) ? 'water'
      : acts.includes('cycling') ? 'cycling' : acts.includes('adventure') ? 'adventure' : 'outdoor';
  } else if (v.type === 'indoor') {
    key = kinds.includes('spa') ? 'spa' : kinds.some((k) => ['museum', 'gallery'].includes(k)) ? 'arts' : kinds.includes('theatre') ? 'theatre'
      : kinds.some((k) => ['bowling', 'arcade', 'escape', 'climbing'].includes(k)) ? 'games' : /\b(?:kids|children|family|play)\b/.test(name) ? 'family' : 'indoor';
  } else if (v.type === 'tour') {
    key = kinds.includes('wine_tour') || /\bwine\b/.test(name) ? 'tour-wine' : kinds.includes('boat_tour') || /\b(?:boat|cruise|lake)\b/.test(name) ? 'tour-lake'
      : /\b(?:farm|orchard|u pick|fruit)\b/.test(name) ? 'tour-farm' : /\b(?:bike|cycling|e bike)\b/.test(name) ? 'tour-bike' : 'tour';
  }
  if (v.type === 'restaurant' && /\b(?:ramen|pho|noodles?|udon)\b/.test(`${name} ${v.textCuisine || ''}`)) key = 'restaurant-noodle';
  return STOP_PHOTO_KEYS.has(key) ? `/images/trip-v3/stops/stop-${key}-480.jpg` : null;
}
function ownStopPhoto(v) {
  const own = String(v.imageUrl || '').trim();
  return /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(own) ? own : null;
}
const STOP_PHOTO_KEYS = new Set(['restaurant', 'cafe', 'pub', 'brewery', 'cocktail', 'distillery', 'winery', 'beach', 'golf', 'outdoor', 'hiking', 'viewpoints', 'water', 'cycling', 'adventure', 'winter', 'indoor', 'arts', 'family', 'games', 'spa', 'theatre', 'tour', 'tour-wine', 'tour-lake', 'tour-farm', 'tour-bike', 'sport', 'ski', 'restaurant-noodle']);
function isDogTrip(ctx) { return !!(ctx.dog || ctx.features.includes('dog_friendly') || (ctx.requirements?.items || []).some((i) => i.kind === 'feature' && i.value === 'dog_friendly')); }
function indoorAppeal(v, ctx, add) {
  if (v.type !== 'indoor') return;
  const kinds = v.plannerKinds || tripRequirements.inferPlannerKinds(v);
  if (kinds.some((k) => INDOOR_VISITOR_KINDS.includes(k))) add('indoor_attraction', ctx.kids && kinds.some((k) => ['bowling', 'arcade', 'climbing', 'museum'].includes(k)) ? 10 : 7, null);
  const asked = (ctx.foodTerms || []).map((f) => f.term);
  const niche = INDOOR_NICHE_WORDS.find((w) => (textHas(v.textName, w) || textHas(v.textDesc, w)) && !asked.some((a) => w.includes(a) || a.includes(w)));
  if (niche && !kinds.some((k) => INDOOR_VISITOR_KINDS.includes(k))) add('indoor_niche', -9, null);
}

function occasionScore(v, ctx, add) {
  const o = ctx.scoringOccasion;
  if (!o) return;
  const label = OCCASION_LABELS[o];
  // Batch B: no implementation label on the visitor-facing reason; the plan's
  // note says what the occasion ranking is based on.
  const tag = '';
  if (o !== 'rainy_day' && (OCCASION_TYPES[o] || []).includes(v.type)) add('occasion', 10, `${article(typeLabel(ctx, v.type, 'singular').toLowerCase(), true)} suits ${article(label)}${tag}`);
  if (o === 'date_night' || o === 'romantic') {
    if (v.features.lake_view) add('occasion', 10, 'Has the Lake View badge');
    if (v.features.patio) add('occasion', 3, 'Has the Patio badge');
    if (v.price != null && v.price >= 3) add('occasion', 10, `Price level ${priceText(v.price)}`);
    else if (v.price === 1 && v.type === 'restaurant') add('occasion_miss', -8, null);
    const word = ROMANCE_WORDS.find((w) => textHas(v.textDesc, w));
    if (word) add('occasion', 14, `Its description mentions “${word}”`);
    // 2026-10-25: a romantic weekend's afternoon was CRAFT Beer Market (a sports-TV beer hall): screens and beer halls
    // are not a couple's stop unless asked for.
    if (v.features.sports_tv) add('occasion_miss', -10, null);
    if (v.type === 'brewery' && !ctx.types.has('brewery')) add('occasion_miss', -6, null);
  } else if (o === 'family') {
    if (v.features.kid_friendly && !ctx.features.includes('kid_friendly')) add('occasion', 8, 'Has the Kid-Friendly badge');
    if (v.type === 'winery' || v.type === 'brewery') add('occasion_miss', -12, null);
    if (v.type === 'beach' || v.type === 'outdoor') add('occasion_family_outdoor', 8, null);
    const acts = v.activities.filter((a) => OCCASION_ACTIVITIES.family.includes(a));
    if (acts.length) add('occasion', 6, `Listed for ${listText(acts.map((a) => activityLabel(ctx, a)))}${tag}`);
  } else if (o === 'rainy_day') {
    if (v.indoorGolf) add('occasion', 8, 'Described as an indoor golf / simulator venue');
    else if (v.indoorEvidence === 'explicit' || v.type === 'indoor') add('occasion', 10, 'Listed as an indoor venue');
    else if (DINING_TYPES.includes(v.type)) add('occasion', 3, 'Meal option; indoor seating is not confirmed');
    else add('occasion', 6, 'Indoor suitability is not confirmed');
  } else if (o === 'celebration' || o === 'group_getaway') {
    if (v.features.great_groups) add('occasion', 8, 'Has the Great for Groups badge');
    if (v.features.live_music) add('occasion', 4, 'Has the Live Music badge');
  } else if (o === 'relaxing') {
    if (v.features.lake_view) add('occasion', 4, 'Has the Lake View badge');
    const acts = v.activities.filter((a) => OCCASION_ACTIVITIES.relaxing.includes(a));
    if (acts.length) add('occasion', 4, `Listed for ${listText(acts.map((a) => activityLabel(ctx, a)))}${tag}`);
  } else if (o === 'adventure') {
    const acts = v.activities.filter((a) => OCCASION_ACTIVITIES.adventure.includes(a));
    if (acts.length) add('occasion', 10, `Listed for ${listText(acts.map((a) => activityLabel(ctx, a)))}${tag}`);
  }
  return 0;
}

function why(reasons) {
  const sorted = reasons.filter((r) => r.text).slice().sort((a, b) => b.weight - a.weight);
  return sorted.slice(0, 3).map((r) => r.text);
}

// Collections a stop card may name, and how (Build My Trip V3).
const PUBLIC_COLLECTION_LABELS = { hidden_gem: 'Hidden Gem', local_favorite: 'Local Favourite', dog_friendly: 'Dogs allowed (official)' };
function publicVenue(v, ctx) {
  return {
    id: v.id, name: v.name, region: v.region, type: v.type, url: v.url,
    regionLabel: ctx ? regionLabel(ctx, v.region) : v.region, typeLabel: v.indoorGolf ? 'Indoor golf' : ctx ? typeLabel(ctx, v.type, 'singular') : v.type,
    ...(v.indoorGolf ? { indoorGolf: true } : {}),
    rating: v.rating, reviews: v.reviews, price: v.price, address: v.address || null,
    // The venue's own photo when it has one (2026-10-17); otherwise a photo of
    // the kind of place (Okanagan Roam's category photos), labelled as an example.
    photo: ownStopPhoto(v) || stopPhoto(v),
    ownPhoto: !!ownStopPhoto(v),
    latitude: hasCoords(v) ? v.lat : null, longitude: hasCoords(v) ? v.lng : null,
    // Build My Trip V3 (Step 2, 2026-09-29), additive: stored facts a stop
    // card can show as they are -- the verified badge columns that are set
    // (only on the Food & Drink / winery types, where the badges exist),
    // the curated collections, and the stored weekly hours as listed.
    badges: BADGE_TYPES.includes(v.type) ? Object.keys(v.features || {}).filter((f) => v.features[f]).map((f) => ({ key: f, label: ctx ? featureLabel(ctx, f) : f })) : [],
    // 'dog_friendly' is the official dog-access list for beaches and outdoor
    // places; on dining venues the Dog-Friendly badge above says it.
    collections: (v.collections || []).filter((c) => PUBLIC_COLLECTION_LABELS[c] && (c !== 'dog_friendly' || OUTSIDE_TYPES.includes(v.type))).map((c) => ({ key: c, label: PUBLIC_COLLECTION_LABELS[c] })),
    listedHours: v.hours ? listedHoursText(v, null, null) : null,
    // Round 12 (2026-10-20): the venue's own French notice for its "Advisory on Okanagan Roam" caveat, used on /fr/trip.
    ...(v.advisory && v.advisory.note && v.advisory.noteFr ? { advisoryFr: { en: `Advisory on Okanagan Roam: ${advisoryExcerpt(v.advisory.note)}`, fr: `Avis d’Okanagan Roam : ${advisoryExcerpt(v.advisory.noteFr)}` } } : {}),
  };
}

// "Here's what we understood" (Build My Trip V3, Step 2): the request as the
// planner read it, in visitor words, for the editable chips on /trip. Built
// only from the interpreted request and the site's own labels -- it names no
// venue and states no venue fact.
// Stage 3.5 D5 (2026-09-30): a multi-part plan does not apply an occasion to
// its parts (family does apply, through the kids rules), so the occasion is
// reported as not used instead of shown as understood. The visitor's own
// phrase is used -- the first of the parser's matched phrases for it.
function unappliedItineraryOccasion(intent, trip) {
  if (!intent || !intent.occasion || intent.occasion === 'family' || trip?.outingOccasion === intent.occasion) return null;
  const m = (intent.matched || []).find((x) => x.field === 'occasion' && x.value === intent.occasion);
  return m ? m.phrase : null;
}
// Stage 3.5 D6 (2026-09-30): the named places a day plan does not use (it
// keeps at most one place per day), given the places its days use.
function unusedPlanRegions(regions, dayRegions) {
  if (!Array.isArray(dayRegions) || !dayRegions.length || regions.length < 2) return [];
  return regions.filter((r) => !dayRegions.includes(r));
}
function buildUnderstood(intent, trip, labels, extras) {
  const i = intent || {};
  const x = extras || {};
  const ctx = buildContext(i, labels || {}, { text: x.text || '' });
  const party = [];
  if (ctx.kids) party.push('with kids');
  if (ctx.dog) party.push('with a dog');
  if (ctx.alcoholFree) party.push('alcohol-free');
  const regions = (trip && trip.multi && trip.regions && trip.regions.length ? trip.regions : ctx.regions);
  // Stage 3.5: an exclusion the plan applied is no longer "not used".
  const applied = new Set(x.appliedExclusions || []);
  const notUsed = (i.unsupported || []).filter((u) => !applied.has(u));
  if (trip && trip.multi) for (const w of trip.leftoverTerms || []) if (!notUsed.includes(w)) notUsed.push(w);
  // Stage 3.5 D6: a named place the day plan did not use.
  for (const r of unusedPlanRegions(ctx.regions, x.dayRegions)) { const l = regionLabel(ctx, r); if (!notUsed.includes(l)) notUsed.push(l); }
  const occasionNotUsed = trip && trip.multi ? unappliedItineraryOccasion(i, trip) : null;
  if (occasionNotUsed && !notUsed.includes(occasionNotUsed)) notUsed.push(occasionNotUsed);
  return {
    kind: x.kind || null,
    days: Number.isInteger(x.days) ? x.days : (i.days || null),
    pace: ctx.pace || null,
    base: regions.map((r) => ({ slug: r, label: regionLabel(ctx, r) })),
    valleyWide: !regions.length,
    route: trip && trip.route ? { from: trip.route.from, to: trip.route.to } : null,
    when: whenText(ctx) || null,
    season: ctx.seasonInfo ? { label: ctx.seasonInfo.named === 'month' ? ctx.seasonInfo.monthName : ctx.seasonInfo.monthName.replace(/^the /, ''), named: ctx.seasonInfo.named } : null,
    interests: interestsText(ctx).concat(ctx.lake ? ['lake time'] : []),
    party,
    occasion: ctx.occasion && !occasionNotUsed ? OCCASION_LABELS[ctx.occasion] : null,
    // 2026-10-19: a budget trip says so ("on a budget" was applied but never shown).
    budget: ctx.budget || null,
    themes: (ctx.dayThemes || []).map((th) => themeLabel(ctx, th)).filter(Boolean),
    notUsed,
  };
}
// Ice cream and gelato (round 10, 2026-10-19) are summer treats: never a filler from November to March.
const ICE_CREAM_RE = /\b(?:ice cream|gelato|gelateria|frozen yogurt|froyo|soft serve|creamery)\b/;
function coldMonthIceCream(v, date) {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(date || ''));
  if (!m || !v || v.type !== 'cafe') return false;
  const month = Number(m[1]);
  return (month >= 11 || month <= 3) && ICE_CREAM_RE.test(`${v.textName || normWords(v.name)} ${v.textCuisine || ''}`);
}
const TOUR_BOOKING_NOTE = 'Tours run at set times: book ahead with the operator and plan the day around the time you get.';
// Round 11 (2026-10-20): an outfitter or charter listed as an outdoor place (Hoodoo Adventure Company, Al-ways Fishing
// Charters) is booked too, not a walk-in stop: it gets the booking note and is not a first pick for an open slot.
const OUTFITTER_NAME_RE = /\b(?:adventures?|adventure company|charters?|outfitters?|rentals?|guided|guides?|tours?|expeditions?)\b/;
const OUTFITTER_DESC_RE = /\b(?:outfitter|guided tours?|charters?|book a guide|book (?:a|your) (?:trip|tour|charter|spot)|tours and rentals|rentals and tours|by reservation|reservations? (?:are )?required)\b/;
// Round 11 (2026-10-20): a comedy club, nightclub, music venue or theatre is a place for its evening shows, never a
// daytime attraction (The Dream and the Kelowna Comedy Club were offered at 1 PM).
const EVENING_VENUE_RE = /\b(?:comedy club|comedy|night ?club|music venue|live music venue|concert (?:hall|venue)|cabaret|dance club|karaoke|theatre|theater|playhouse|performing arts)\b/;
function eveningOnlyVenue(v) {
  return !!v && v.type === 'indoor' && EVENING_VENUE_RE.test(v.textName || normWords(v.name || ''));
}
// Round 11 (2026-10-20): variety across requests. Among eating and drinking places that score about the same, each
// request leans a little differently (a fixed 0-4 point nudge from the request's words and the place), so the same
// restaurant is not in most Kelowna plans (Frankie We Salute You! was in about 8). The same request always gets the same
// nudge, so a plan and its Swaps stay steady.
function varietyNudge(v, ctx) {
  if (!v || !DINING_TYPES.includes(v.type) || !ctx || !ctx.queryText) return 0;
  let h = 2166136261;
  const key = `${ctx.queryText}|${v.id}`;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h % 1000) / 250;
}
function openKind(v) {
  if (v.type !== 'outdoor') return v.type;
  return (v.activities || []).some((a) => ['hiking', 'viewpoints'].includes(a)) || /\b(?:mountain|trail|trails|peak|ridge|bluffs?|canyon|lookout)\b/.test(v.textName || '') ? 'outdoor:trail' : 'outdoor';
}
function daytimePart(part) { return ['morning', 'midday', 'afternoon', 'late'].includes(part); }
function bookedOutfitter(v) {
  if (!v || v.type === 'tour') return !!v;
  if (!['outdoor', 'sport', 'beach'].includes(v.type)) return false;
  return OUTFITTER_NAME_RE.test(v.textName || normWords(v.name || '')) && OUTFITTER_DESC_RE.test(v.textDesc || normWords(v.plannerDescription || v.description || ''));
}
// Round 12 (2026-10-20): a dessert counter, mini-donut stand or concession is a treat, not lunch or dinner (Ogopogo
// Concessions, a fair stand listed as Dessert, was a Vernon dinner).
const NOT_A_MEAL_RE = /\b(?:concessions?|concession stand|mini donuts?|donuts?|doughnuts?|ice cream|gelato|gelateria|creamery|dessert|desserts|candy|fudge|chocolates?|chocolatier|popcorn|cotton candy|shaved ice|frozen yogurt|froyo)\b/;
function notAMeal(v) {
  if (!v || !['restaurant', 'cafe'].includes(v.type)) return false;
  const cuisine = normWords(`${v.textCuisine || ''} ${v.cuisineLabel || ''} ${v.cuisine || ''}`);
  if (/\bdesserts?\b/.test(cuisine) && !/\b(?:restaurant|bistro|kitchen|grill|cafe|diner|eatery)\b/.test(cuisine)) return true;
  return NOT_A_MEAL_RE.test(v.textName || normWords(v.name || ''));
}
// Round 12: a winery (or any stop) whose own listing or notice says it is by appointment only is booked ahead, so it
// is not a walk-in first tasting or a filler (Martin's Lane, $200 by appointment). Returns the venue's own sentence.
const APPOINTMENT_RE = /\b(?:by appointment(?: only)?|appointment only|appointments? (?:required|necessary|only)|reservations? (?:required|only)|booking required|private tastings? only)\b/i;
// Round 14 (2026-10-20): a sentence that limits appointments to part of the year ("in winter, visits are by appointment
// only", "by appointment after December 14") does not make the place appointment-only now.
const APPOINTMENT_SEASONAL_RE = /\b(?:in (?:the )?winter|winter months|off[- ]season|after (?:the )?(?:season|harvest|thanksgiving|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|from (?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|until (?:spring|may|april|june)|outside (?:of )?(?:the )?season|unless)\b/i;
function appointmentNotice(v) {
  if (!v) return null;
  const sources = [v.advisory && v.advisory.note, v.plannerDescription || v.description].filter(Boolean).map(String);
  for (const text of sources) {
    const sentence = text.replace(/https?:\/\/\S+/g, '').split(/(?<=[.!?])\s+/).find((x) => APPOINTMENT_RE.test(x) && !APPOINTMENT_SEASONAL_RE.test(x));
    if (sentence) return sentence.trim();
  }
  return null;
}
// "A private tasting", "by appointment": the visitor asked for a booked visit, so appointment-only places can be stops.
const APPOINTMENT_ASKED_RE = /\b(?:by appointment|appointments?|private (?:tours?|tastings?|visits?)|book(?:ed)? (?:a )?(?:private )?(?:tour|tasting))\b/;
function appointmentKept(v, ctx) {
  const q = (ctx && ctx.queryText) || '', own = v && (v.textName || normWords(v.name || ''));
  return namedInRequest(v, ctx) || !!(ctx && ctx.pinnedIds && ctx.pinnedIds.has(v.id)) || APPOINTMENT_ASKED_RE.test(q) || !!(own && own.length >= 4 && q.includes(own));
}
function appointmentOnly(v) { return !!appointmentNotice(v) && !/\b(?:walk[- ]?ins? (?:are )?(?:welcome|available)|no appointments? (?:needed|necessary|required)|appointments? (?:are )?not required)\b/i.test(`${v.plannerDescription || v.description || ''}`); }
function namedInRequest(v, ctx) { return !!(ctx && ctx.requirements && (ctx.requirements.items || []).some((i) => i.kind === 'venue' && i.value === v.id)); }
// Round 12 (2026-10-20): repetition. The same Kelowna day (Knox Mountain, Frankie We Salute You!, Hidden Vines) was in
// five plans. A small, fixed nudge per request (seeded by what it asks for: towns, kinds, dates) rotates the top few picks of every
// kind; it is at most 4 points (3 for places to eat, which also get varietyNudge), under half a star at full confidence, so
// a weak place never beats a strong one.
function rotationNudge(v, ctx) {
  const seed = ctx && (ctx.rotationKey || ctx.queryText);
  if (!v || !seed) return 0;
  let h = 2166136261;
  const key = `r12|${seed}|${v.id}`;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h % 1000) / 1000 * (DINING_TYPES.includes(v.type) ? 3 : 4);
}
// The pick for a slot from candidates sorted best first: the best, or another good place of the SAME kind whose rotation
// nudge lifts it higher. The kind of stop (a pub or a restaurant, a beach or a café) and every hard rule (open then, in
// season, in the town asked for) are decided before this, so rotation only chooses among near-equal places of one kind.
// Round 14 (2026-10-20): the rotation was so narrow that Knox Mountain, Frankie We Salute You! and Rosalinda's were in
// 7-8 of 60 plans. It now picks among up to ROTATE_TOP good places within ROTATE_MARGIN points, seeded by what the request
// means, its date and the slot (day and time of day), and the town's default (the best place) gives way a little more for
// the first stop of a day and for lunch. A place that is farther than ROTATE_MAX_KM from the default, an outfitter or an
// appointment-only place never rotates in, and neither does one missing a reason the default was chosen for (a badge or
// cuisine asked for, the season, a theme).
const ROTATE_MARGIN = 6;
const ROTATE_TOP = 8;
const ROTATE_MAX_KM = 12;
const ROTATE_DEFAULT_GIVE = 2.5;
// Round 15d (2026-10-21): a quarter, down from a third (Dayton), so a town's top places repeat less across plans.
const ROTATE_KEEP_BEST = 0.25;
const ROTATE_SPREAD = 1.5;
// A rental base, tour, charter or lesson is booked ahead, so it never rotates in as a walk-in stop.
const ROTATE_BOOKED_NAME_RE = /\b(?:ballooning|balloon|sports cent(?:re|er)|watersports|water sports|marina|boat club|ski school)\b/;
const ROTATE_BOOKED_DESC_RE = /\b(?:rental base|rentals? (?:shop|base|company|outlet)|grab a boat|balloon (?:tours?|rides?|flights?)|hot air balloon|guided (?:tours?|trips?|rides?|hikes?)|tour (?:company|operator)|adventure tour|book (?:a|your) (?:tour|trip|ride|spot|flight|seat))\b/;
function rotateBooked(v) {
  if (!v || DINING_TYPES.includes(v.type) || v.type === 'winery') return false;
  const name = v.textName || normWords(v.name || ''), desc = v.textDesc || normWords(v.plannerDescription || v.description || '');
  return bookedOutfitter(v) || OUTFITTER_NAME_RE.test(name) || ROTATE_BOOKED_NAME_RE.test(name) || OUTFITTER_DESC_RE.test(desc) || ROTATE_BOOKED_DESC_RE.test(desc)
    || /\bbook (?:a|an|your)\b.{0,60}\b(?:sessions?|tours?|class(?:es)?|slots?|times?|seats?|spots?)\b|\bwalk ins? (?:aren t|are not|isn t|not) guaranteed\b/.test(desc)
    // A remote forest-road campsite is a trip of its own, not a stand-in for the town's own park (Lambly Lake for a West Kelowna morning).
    || /\b(?:recreation site|campground|campsites?|rv park|forest (?:service )?road|backcountry|4x4)\b/.test(`${name} ${desc}`);
}
function rotationSlotNudge(v, ctx, slot) {
  const seed = ctx && (ctx.rotationKey || ctx.queryText);
  if (!v || !seed) return 0;
  let h = 2166136261;
  const key = `r14|${seed}|${slot || ''}|${v.id}`;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  // murmur3's finalizer, so requests that differ by a word or two don't favour the same place.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rotateWithinType(cands, ctx, score = (c) => c.score, opts = {}) {
  const best = cands && cands[0];
  if (!best || !ctx || !(ctx.rotationKey || ctx.queryText)) return best || null;
  // A reason the best place has beyond its rating and distance (in season, the Lake View badge, a feature or food asked
  // for) must be one the other place has too. Being a Local Favourite or Hidden Gem is a small bonus, not a reason.
  const ROUTINE = ['rating', 'nearby', 'hours', 'jitter', 'region', 'community', 'meal', 'complement', 'gap', 'theme', 'collection_bonus', 'daypart'];
  const special = (x) => new Set((x.reasons || []).filter((r) => (r.weight == null || r.weight > 0) && !ROUTINE.includes(r.code)).map((r) => `${r.code}:${r.code === 'feature' || r.code === 'season' || r.code === 'activity' ? r.text : ''}`));
  const need = special(best);
  // A pick led by the season the visitor named (a ski hill in January) keeps its best match.
  if ([...need].some((k) => k.startsWith('season:'))) return best;
  // A ski hill is a destination of its own; another winter park is not a stand-in for it.
  if (/\bski\b/.test(best.v.textName || normWords(best.v.name || ''))) return best;
  // The Local Favourite / Hidden Gem bonus (3 points) breaks ties for the best place; it is left out when places rotate.
  const bonus = (x) => (x.reasons || []).filter((r) => r.code === 'collection_bonus').reduce((n, r) => n + (r.weight || 0), 0);
  const plain = (x) => score(x) - bonus(x);
  const pool = [best];
  for (const c of cands) {
    if (pool.length >= ROTATE_TOP) break;
    if (c === best || !c.v || c.v.type !== best.v.type || plain(best) - plain(c) > ROTATE_MARGIN || score(best) - score(c) > ROTATE_MARGIN + 3) continue;
    if (need.size) { const has = special(c); if ([...need].some((k) => !has.has(k))) continue; }
    if (!!c.v.price !== !!best.v.price || (c.v.price && best.v.price && Math.abs(c.v.price - best.v.price) > 1)) continue; // same price band
    if (c.v.rating != null && best.v.rating != null && best.v.rating - c.v.rating > 0.4) continue; // never a clearly weaker place
    if (DINING_TYPES.includes(c.v.type)) {
      // Dinner never rotates down to a $ place (unless the best one is $), and no meal to a fast-food counter.
      if (opts.dinner && best.v.price >= 2 && c.v.price != null && c.v.price < 2) continue;
      if (fastFood(c.v) && !fastFood(best.v)) continue;
    }
    if (rotateBooked(c.v) && !rotateBooked(best.v)) continue;
    if (appointmentOnly(c.v) && !appointmentOnly(best.v)) continue;
    const km = kmOrNull(best.v, c.v);
    if (km != null && km > ROTATE_MAX_KM) continue;
    pool.push(c);
  }
  if (process.env.ROTDBG) console.error('ROT', opts.slot, best.v.name, score(best).toFixed(1), '=>', pool.map((c) => c.v.name + ' ' + score(c).toFixed(1)).join(' | '), 'need', [...need].join(','));
  if (pool.length < 2) return best;
  // Round 15 (2026-10-20): the town's best place still wins some of the time (ROTATE_KEEP_BEST, a quarter since round
  // 15d; seeded, so one request always gets the same plan); after round 14 Knox Mountain, Frankie We Salute You! and
  // Rosalinda's were in no plan at all.
  if (rotationSlotNudge({ id: 0 }, ctx, `${opts.slot || ''}|keep`) < ROTATE_KEEP_BEST) return best;
  let pick = best, top = -Infinity;
  for (const c of pool) {
    // Round 15d (2026-10-21): the seeded nudge spans 1.5x the pool's margin (it was 1x), so the close choices share the
    // slot more evenly: LOCAL Public Eatery, third or fourth of about eight close Penticton dinners, won 7 of 59 plans.
    let t = plain(c) + rotationSlotNudge(c.v, ctx, opts.slot) * ROTATE_MARGIN * ROTATE_SPREAD;
    if (c === best) t -= opts.opening || opts.lunch ? ROTATE_DEFAULT_GIVE : ROTATE_DEFAULT_GIVE / 2;
    if (t > top) { pick = c; top = t; }
  }
  if (process.env.ROTDBG) console.error('  PICK', pick.v.name);
  return pick;
}
// 2026-10-21: an outdoor or indoor stop says why it is there in the visitor's terms ("Matches your request for a walk by
// the lake", "Right by the lake", "Free to visit") rather than "Placed in the morning slot".
function placeReasons(v, ctx) {
  const out = [];
  for (const i of (ctx && ctx.requirements && ctx.requirements.items) || []) {
    if (!['venue_kind', 'activity'].includes(i.kind) || i.strength === 'prefer' || !tripRequirements.matches(v, i)) continue;
    const label = i.lakeside ? 'a walk by the lake' : (tripRequirements.LABELS && tripRequirements.LABELS[i.value]) || String(i.value).replace(/_/g, ' ');
    const text = `Matches your request for ${/^(?:a|an) /.test(label) || /s$/.test(label) ? label : `a ${label}`}`;
    if (!out.some((r) => r.text === text)) out.push({ code: 'request', text, weight: 30 });
  }
  if (!['outdoor', 'beach', 'indoor', 'tour', 'sport'].includes(v.type)) return out;
  if (v.type === 'indoor' || v.indoorEvidence === 'explicit') out.push({ code: 'place', text: 'Indoors, so it works in any weather', weight: 6 });
  else if (tripRequirements.lakesidePlace && tripRequirements.lakesidePlace(v)) out.push({ code: 'place', text: 'Right by the lake', weight: 6 });
  if (v.features && v.features.free_entry) out.push({ code: 'place', text: 'Free to visit', weight: 5 });
  if (ctx && ctx.kids && v.features && v.features.kid_friendly) out.push({ code: 'place', text: 'Has the Kid-Friendly badge', weight: 5 });
  return out;
}
function stopFrom(v, scored, extra, ctx) {
  let reasons = scored.reasons.concat(extra || []);
  const own = placeReasons(v, ctx || {});
  if (own.length) {
    // "Matches your request for a museum" and "... for museums" are one reason; the existing line stays.
    const root = (t) => normWords(String(t).replace(/^Matches your request for (?:an? )?/, '')).slice(0, 4);
    const asked = reasons.filter((r) => /^Matches your request for /.test(r.text || '')).map((r) => root(r.text));
    const mine = own.filter((o) => o.code !== 'request' || !asked.includes(root(o.text)));
    reasons = reasons.filter((r) => !mine.some((o) => o.text === r.text));
    reasons = mine.concat(reasons);
    // The filler lines go once there is something real to say.
    if (reasons.filter((r) => r.text && !['daypart', 'region'].includes(r.code)).length >= 2) reasons = reasons.filter((r) => !['daypart', 'region'].includes(r.code));
  }
  const caveats = [...new Set([...(scored.caveats || []), ...tripRequirements.listedAccessNotes(v)])];
  // Round 10 (2026-10-19): a tour company runs at set times; it is booked, not dropped in on.
  if (bookedOutfitter(v) && !caveats.includes(TOUR_BOOKING_NOTE)) caveats.push(TOUR_BOOKING_NOTE);
  if (v.type === 'outdoor' && roughAccess(v) && !caveats.includes(ROUGH_ACCESS_NOTE)) caveats.push(ROUGH_ACCESS_NOTE);
  // Round 12: an appointment-only place says so in its own words (unless its advisory, shown below, already does).
  const appt = appointmentOnly(v) ? appointmentNotice(v) : null;
  if (appt && !(v.advisory && v.advisory.note && APPOINTMENT_RE.test(v.advisory.note))) { const note = `By appointment, from the listing: “${appt}” Book ahead.`; if (!caveats.includes(note)) caveats.push(note); }
  // Step 1 (2026-09-29): a place's current advisory is shown on every stop,
  // in the note's own words (itineraries already did this).
  if (v.advisory && v.advisory.note) {
    const note = `Advisory on Okanagan Roam: ${advisoryExcerpt(v.advisory.note)}`;
    if (!caveats.includes(note)) caveats.push(note);
  }
  return {
    venue: publicVenue(v, ctx),
    reasons: reasons.filter((r) => r.text).map((r) => ({ code: r.code, text: r.text })),
    why: why(reasons),
    caveats,
  };
}
function compareScored(a, b) {
  return b.score - a.score || (b.v.rating || 0) - (a.v.rating || 0) || (b.v.reviews || 0) - (a.v.reviews || 0) || String(a.v.name).localeCompare(String(b.v.name)) || a.v.id - b.v.id;
}

// ---------- classification ----------

function classifyPlanRequest(intent) {
  if (!intent) return 'unknown';
  if (intent.mode === 'navigate') return 'navigate';
  if (intent.mode === 'events') return 'events';
  if (intent.mode === 'plan') return intent.days && intent.days > 1 ? 'multi_day' : 'day_plan';
  if (intent.mode === 'recommend') {
    if ((intent.structure && intent.structure.length >= 2) || intent.occasion === 'date_night' || intent.occasion === 'romantic') return 'outing';
    return 'recommendations';
  }
  if (intent.mode === 'find') return 'discover';
  return 'unknown';
}

// ---------- recommendations ----------

// A named time ("tonight", "Saturday afternoon") checked against listed
// hours: { skip } when the listing proves the venue closed then, otherwise
// a grounded reason (the stored hours) or an unknown-hours caveat.
function requestedTimeFit(v, ctx) {
  const live = liveWindow(ctx, 'evening');
  const weekday = live ? live.weekday : ctx.startWeekday;
  const part = live && ctx.when.now ? null : ctx.whenDaypart;
  if (!weekday && !part) return null;
  const parsed = v._hours || (v._hours = parseVenueHours(v.hours));
  let score = 0;
  const reasons = [], caveats = [];
  if (live) {
    // Dropped only when its listing proves it closed for the rest of the
    // time asked about (it already closed, or it does not open again).
    const day = parsed.days[weekday];
    if (parsed.known && provenClosed(day, live.win)) return { skip: true };
    const typePart = part || (live.now >= 17 * 60 ? 'evening' : live.now >= 13 * 60 ? 'afternoon' : live.now >= 11 * 60 + 30 ? 'midday' : 'morning');
    score += ((SLOT_AFFINITY[typePart] || {})[v.type] || 0) * 4;
    if (typePart === 'evening') score += dinnerAdjust(v);
    const role = cafeRole(v);
    if (role && CAFE_SLOT_ADJUST[role]) score += CAFE_SLOT_ADJUST[role][typePart] || 0;
    if (day.status === 'open') {
      score += 6;
      reasons.push({ code: 'hours', text: listedHoursText(v, weekday), weight: 6 });
      const end = closesWithin(v, weekday, live.win);
      if (end != null) { score -= 3; caveats.push(`Its listed hours end at ${clockText(end)} \u2014 check before you go`); }
    } else { score -= 2; caveats.push(UNKNOWN_HOURS_CAVEAT); }
    return { skip: false, score, reasons, caveats };
  }
  if (part) {
    const win = SLOT_WINDOWS[part];
    const days = weekday ? [weekday] : WEEKDAYS;
    // A recommendation is only dropped when the listing proves it closed for
    // the whole time asked about (every relevant day, when no day is known).
    if (parsed.known && days.every((d) => provenClosed(parsed.days[d], win))) return { skip: true };
    let fit = hoursFit(v, part, weekday);
    if (fit.status === 'closed') fit = { status: 'short', days };
    score += ((SLOT_AFFINITY[part] || {})[v.type] || 0) * 4;
    if (part === 'evening') score += dinnerAdjust(v);
    const role = cafeRole(v);
    if (role && CAFE_SLOT_ADJUST[role]) score += CAFE_SLOT_ADJUST[role][part] || 0;
    if (fit.status === 'verified') { score += 6; const t = listedHoursText(v, weekday, fit.days); if (t) reasons.push({ code: 'hours', text: t, weight: 6 }); }
    else if (fit.status === 'partial') { score += 2; const t = listedHoursText(v, null, fit.days); if (t) reasons.push({ code: 'hours', text: t, weight: 2 }); caveats.push(`Its listed hours only fit the ${SLOT_WINDOWS[part].label} on ${dayListText(fit.days)} \u2014 check the day you go`); }
    else if (fit.status === 'short') { score -= 3; const t = listedHoursText(v, weekday); if (t) reasons.push({ code: 'hours', text: t, weight: 1 }); caveats.push(`Its listed hours only overlap part of the ${SLOT_WINDOWS[part].label} \u2014 check before you go`); }
    else { score -= 2; caveats.push(UNKNOWN_HOURS_CAVEAT); }
  } else {
    const day = parsed.days[weekday];
    if (parsed.known && day.status === 'closed') return { skip: true };
    if (day.status === 'open') { score += 4; reasons.push({ code: 'hours', text: listedHoursText(v, weekday), weight: 4 }); }
    else { score -= 2; caveats.push(UNKNOWN_HOURS_CAVEAT); }
  }
  return { skip: false, score, reasons, caveats };
}

// "What can we do in Kelowna tonight" (2026-10-18): no golf course, beach or daytime tour for an evening, and no
// outdoor stop in the dark months, unless that type was asked for or the listing is an evening outing.
const EVENING_OUTING_RE = /\b(?:night|nights|evening|evenings|sunset|ghost|dinner|after dark|moonlight|stargazing|twilight|lantern|lights)\b/;
function eveningOutOfSeason(v, ctx) {
  const live = liveWindow(ctx, 'evening');
  const evening = ctx.whenDaypart === 'evening' || (live && live.win.from >= 17 * 60);
  if (!evening || ctx.types.has(v.type)) return false;
  const text = `${v.textName || ''} ${v.textDesc || ''}`;
  if (v.type === 'golf' && !v.indoorGolf) return true;
  if (v.type === 'tour') return !EVENING_OUTING_RE.test(text);
  const date = (ctx.clock && ctx.clock.date) || ctx.tripDate || '';
  const month = Number(date.slice(5, 7));
  const dark = !month || month >= 9 || month <= 4;
  if ((v.type === 'beach' || v.type === 'outdoor') && dark) return !EVENING_OUTING_RE.test(v.textName || '');
  return false;
}
function buildRecommendations(facts, ctx, count = RECOMMENDATION_COUNT) {
  const strict = true;
  const scored = [];
  // "Cheap eats Penticton" (2026-10-18): food places only when nothing else was asked for, $ first.
  const budgetFood = ctx.budget === 'budget' && [...ctx.types].every((t) => DINING_TYPES.includes(t)) && !ctx.activities.size && !ctx.plannerKinds.length;
  for (const v of facts) {
    if (budgetFood && !BUDGET_FOOD_TYPES.includes(v.type) && !(v.fdTypes || []).some((t) => BUDGET_FOOD_TYPES.includes(t)) && !ctx.types.has(v.type)) continue;
    if (!regionOk(v, ctx) || !eligible(v, ctx, strict) || !tripRequirements.venueAllowed(v, ctx.requirements, 1, ctx.tripDate) || !ctx.ignoreSeason && ctx.requirements && seasonClosedOnTrip(v, { date:ctx.tripDate })) continue;
    if (!ctx.ignoreSeason && eveningOutOfSeason(v, ctx)) continue;
    const s = scoreVenue(v, ctx);
    const t = requestedTimeFit(v, ctx);
    if (t && t.skip) continue; // listed hours prove it is closed at the time asked for
    scored.push(t ? { v, score: s.score + t.score, reasons: s.reasons.concat(t.reasons), caveats: t.caveats } : { v, ...s });
  }
  const priceRank = (v) => (v.price === 1 ? 0 : v.price == null || v.price === 2 ? 1 : 2);
  scored.sort(ctx.budget === 'budget' ? (a, b) => priceRank(a.v) - priceRank(b.v) || compareScored(a, b) : compareScored);
  const out = [];
  const perType = {};
  for (const s of scored) {
    if (out.length >= count) break;
    if ((perType[s.v.type] || 0) >= RECOMMENDATION_PER_TYPE && !(ctx.types.size === 1 && ctx.types.has(s.v.type))) continue;
    perType[s.v.type] = (perType[s.v.type] || 0) + 1;
    out.push(stopFrom(s.v, s, regionReason(s.v, ctx), ctx));
  }
  return { items: out, total: scored.length };
}
function regionOk(v, ctx) { return !ctx.regions.length || ctx.regions.includes(v.region); }
function regionReason(v, ctx) {
  return ctx.regions.length ? [{ code: 'region', text: `In ${regionLabel(ctx, v.region)}, where you asked to go`, weight: 1 }] : [];
}

// ---------- outings (date night, "a romantic winery and dinner") ----------

function outingSteps(ctx) {
  const structure = ctx.intent.structure;
  if (structure && structure.length >= 2) {
    return structure.map((s) => ({
      types: s.types, daypart: s.daypart, window: SLOT_WINDOWS[s.daypart] ? s.daypart : 'evening',
      label: s.types.map((t) => typeLabel(ctx, t, 'singular')).join(' or '), prefer: {},
    }));
  }
  // 2026-10-28: a date night's drink is a lounge or a winery before a pub (Vernon's date night opened at 1516 Pub & Grill).
  // Default date-night shape (a heuristic): a drink in the early evening,
  // then dinner. Lounges first, then pubs and breweries, then wineries --
  // wineries stay in, but only where their listed hours reach the early
  // evening (or their hours are unknown, which is flagged, never assumed).
  return [
    { types: ['cocktail', 'pub', 'brewery', 'winery'], daypart: 'evening', window: 'drinks', label: 'A drink first', prefer: ['romantic', 'celebration', 'date_night'].includes(ctx.occasion) ? { cocktail: 10, winery: 8, pub: 0, brewery: -4 } : { cocktail: 8, pub: 5, brewery: 5, winery: 4 } },
    { types: ['restaurant'], daypart: 'evening', window: 'evening', label: 'Dinner', prefer: {} },
  ];
}

// Distance between two stops: measured only when BOTH have stored
// coordinates. Otherwise it is unknown -- never estimated -- and costs a
// fixed, neutral amount (half the pace's distance budget), so a stop with no
// map location is neither rewarded for it nor ruled out by it.
function distanceTerm(prev, v, kmCost, maxHop) {
  if (!prev) return { score: 0, reasons: [], caveats: [] };
  const km = kmBetween(prev, v);
  if (km == null) {
    return { score: -0.5 * maxHop * kmCost, reasons: [], caveats: ['No map location on file for this stop or the one before it, so the distance between them isn’t known'] };
  }
  return {
    score: -km * kmCost - (km > maxHop ? 35 : 0),
    reasons: [{ code: 'nearby', text: `About ${km < 1 ? '<1' : Math.round(km)} km (straight line) from the previous stop`, weight: km <= maxHop ? 5 : 0 }],
    caveats: [],
  };
}

function buildOuting(facts, ctx) {
  const steps = outingSteps(ctx);
  const base = facts.filter((v) => regionOk(v, ctx) && eligible(v, ctx, false) && tripRequirements.venueAllowed(v, ctx.requirements, 1, ctx.tripDate) && (!ctx.requirements || !seasonClosedOnTrip(v, { date:ctx.tripDate })));
  // One evening, so distance matters more than on a day plan: 2 points a km.
  const kmCost = OUTING_KM_PENALTY, maxHop = PLAN_MAX_HOP_KM.relaxed;
  const candidatesFor = (step, prev, used) => {
    const cands = [];
    for (const v of base) {
      if (used.has(v.id) || !step.types.includes(v.type)) continue;
      if (prev && v.region !== prev.region) continue; // one community per outing
      const fit = slotFit(v, ctx, step.window, 0, null);
      if (!fit.ok) continue; // listed hours prove it is closed then
      const s = scoreVenue(v, ctx);
      const dist = distanceTerm(prev, v, kmCost, maxHop);
      const score = s.score + 20 + (step.prefer[v.type] || 0) + fit.score + dist.score;
      const extra = [{ code: 'step', text: `Chosen for the “${step.label}” part of your outing`, weight: 20 }].concat(fit.reasons, dist.reasons);
      cands.push({ v, score, reasons: s.reasons.concat(extra), caveats: fit.caveats.concat(dist.caveats) });
    }
    return cands.sort(compareScored);
  };
  // Choose the stops together: each of the strongest first stops is paired
  // with its best follow-on (which pays for measured distance, or a neutral
  // cost when either location is missing), and the best pair wins. A drink
  // 11 km from dinner no longer beats one next door on its own score alone.
  let picks = [];
  if (steps.length === 2) {
    const pairs = [];
    for (const first of candidatesFor(steps[0], null, new Set()).slice(0, 12)) {
      const second = candidatesFor(steps[1], first.v, new Set([first.v.id]))[0];
      const total = first.score + (second ? second.score : -60);
      pairs.push({ v: first.v, score: total, reasons: first.reasons, pair: [first, second || null] });
    }
    // Round 14 (2026-10-20): near-equal drink-and-dinner pairs rotate by request (every Kelowna date night was the same
    // two places); the pair's first stop must be the same kind as the best pair's, and its dinner must exist.
    pairs.sort((a, b) => b.score - a.score || compareScored({ score: 0, v: a.v }, { score: 0, v: b.v }));
    const chosen = pairs.length ? rotateWithinType(pairs.filter((x, i) => i === 0 || x.pair[1]), ctx, undefined, { slot: 'outing', dinner: true }) : null;
    picks = chosen ? chosen.pair : [null, null];
  } else {
    const used = new Set();
    let prev = null;
    for (const step of steps) {
      const pick = candidatesFor(step, prev, used)[0] || null;
      picks.push(pick);
      if (pick) { used.add(pick.v.id); prev = pick.v; }
    }
  }
  const used = new Set();
  const stops = steps.map((step, i) => {
    const pick = picks[i];
    if (!pick) return { label: step.label, daypart: step.daypart, venue: null, reasons: [], why: [], caveats: [] };
    used.add(pick.v.id);
    return { label: step.label, daypart: step.daypart, ...stopFrom(pick.v, pick, regionReason(pick.v, ctx), ctx) };
  });
  // Alternates: other strong options for the same outing, not already used,
  // judged against the hours of the step their type belongs to.
  const altCtx = { ...ctx, exclude: new Set([...ctx.exclude, ...used]) };
  const alternates = [];
  for (const v of base) {
    if (used.has(v.id)) continue;
    const step = steps.find((st) => st.types.includes(v.type));
    if (!step) continue;
    const fit = slotFit(v, altCtx, step.window, 0, null);
    if (!fit.ok) continue;
    const s = scoreVenue(v, altCtx);
    alternates.push({ v, score: s.score + (step.prefer[v.type] || 0) + fit.score, reasons: s.reasons.concat(fit.reasons), caveats: fit.caveats });
  }
  alternates.sort(compareScored);
  return { stops, alternates: alternates.slice(0, 6).map((a) => stopFrom(a.v, a, regionReason(a.v, ctx), ctx)) };
}

// ---------- multi-day plans ----------

// Minutes' drive between two towns' centres (the road model in trip-requirements.js); Infinity when unknown.
function regionMinutes(centroids, a, b) {
  if (a === b) return 0;
  const t = centroids && centroids[a] && centroids[b] ? tripRequirements.estimateTransfer(centroids[a], centroids[b]) : null;
  return t ? t.maxMinutes : Infinity;
}
// Towns other than regionList whose centres are within maxMinutes of one of them.
function townsNear(centroids, regionList, maxMinutes) {
  return Object.keys(centroids || {}).filter((r) => !regionList.includes(r) && regionList.some((x) => regionMinutes(centroids, x, r) <= maxMinutes));
}
function regionCentroids(facts) {
  const acc = {};
  for (const v of facts) {
    if (!hasCoords(v)) continue;
    const a = acc[v.region] || (acc[v.region] = { lat: 0, lng: 0, n: 0 });
    a.lat += v.lat; a.lng += v.lng; a.n += 1;
  }
  const out = {};
  for (const [r, a] of Object.entries(acc)) out[r] = { lat: a.lat / a.n, lng: a.lng / a.n };
  return out;
}

// The requested focuses a day should try to cover: each named type, each
// named activity, each named collection and each food word.
function focusList(ctx) {
  const f = [];
  for (const k of ctx.plannerKinds) f.push({ key: `kind:${k}`, test: v => (v.plannerKinds || tripRequirements.inferPlannerKinds(v)).includes(k) });
  for (const t of ctx.types) f.push({ key: `type:${t}`, test: (v) => v.type === t || (v.fdTypes || []).includes(t) });
  for (const a of ctx.activities) f.push({ key: `activity:${a}`, test: (v) => v.activities.includes(a) });
  for (const c of ctx.collections) f.push({ key: `collection:${c}`, test: (v) => v.collections.includes(c) });
  for (const ft of ctx.foodTerms) f.push({ key: `food:${ft.term}`, test: (v) => !!foodMatch(v, ft) || listedMatch(v, ft, ctx) });
  if (ctx.lake) f.push({ key: 'lake:lake', test: lakeTest });
  return f;
}

// Types that may fill a slot: the visitor's focus types (and, for activities,
// outdoor places), plus dining to round out the day. With no stated focus,
// the occasion's types (or everything) are allowed.
// Verified venue types that sensibly share a day with a focus type: after a
// round of golf, a winery, brewery or distillery afternoon.
const FOCUS_COMPANION_TYPES = { golf: ['winery', 'brewery', 'distillery'] };
function allowedTypes(ctx) {
  const focusTypes = new Set(ctx.types);
  if (ctx.activities.size) focusTypes.add('outdoor');
  for (const t of ctx.types) for (const c of FOCUS_COMPANION_TYPES[t] || []) focusTypes.add(c);
  // Step 1 (2026-09-29): day themes bring their own types; lake time brings
  // beaches and water-activity places (lake-view venues are already dining).
  const themes = ctx.dayThemes || [];
  for (const th of themes) {
    for (const t of th.types || []) focusTypes.add(t);
    if ((th.activities || []).length) focusTypes.add('outdoor');
  }
  const lake = ctx.lake || themes.some((th) => th.lake);
  const hasFocus = focusTypes.size || ctx.collections.size || ctx.foodTerms.length;
  if (!hasFocus) {
    if (!ctx.occasion) return null;
    const base = new Set([...OCCASION_TYPES[ctx.occasion], ...DINING_TYPES]);
    if (lake) { base.add('beach'); base.add('outdoor'); }
    // Families in the off-season (October to April, 2026-10-18): attractions and indoor places too, not only parks and
    // snack stops.
    const month = Number((ctx.tripDate || '').slice(5, 7));
    if (ctx.occasion === 'family' && month && (month >= 10 || month <= 4)) base.add('indoor');
    return base;
  }
  if (lake) { focusTypes.add('beach'); focusTypes.add('outdoor'); }
  // 2026-10-21: a family trip from October to April with things asked for ("they love the beach") gets indoor
  // attractions too, so the afternoon after a beach walk is not a second beach or a second treat stop.
  {
    const month = Number((ctx.tripDate || '').slice(5, 7));
    if ((ctx.occasion === 'family' || ctx.kids) && month && (month >= 10 || month <= 4)) { focusTypes.add('indoor'); focusTypes.add('outdoor'); }
  }
  // A dog trip can include dog-friendly patios at wineries and breweries, and dog beaches (2026-10-14: an Osoyoos dog
  // weekend had empty afternoons and evenings).
  if (isDogTrip(ctx)) {
    const drinksAsked = ['winery', 'brewery', 'pub', 'cocktail', 'distillery'].some((t) => focusTypes.has(t));
    for (const t of drinksAsked ? ['beach', 'outdoor'] : ['winery', 'brewery', 'beach', 'outdoor']) focusTypes.add(t);
  }
  // Breweries are valid when requested, but a winery/dinner itinerary should
  // not quietly turn into a brewery crawl just because a brewery is open in
  // the afternoon. Keep only meal/lounge stops as generic companions.
  return new Set([...focusTypes, ...MEAL_FILL_TYPES]);
}
// One day's theme as a focus test, or null.
function themeTest(th) {
  if (!th) return null;
  const tests = [];
  if (th.lake) tests.push(lakeTest);
  for (const t of th.types || []) tests.push((v) => v.type === t || (v.fdTypes || []).includes(t));
  for (const a of th.activities || []) tests.push((v) => (v.activities || []).includes(a));
  return tests.length ? (v) => tests.some((f) => f(v)) : null;
}
function themeLabel(ctx, th) {
  const parts = [];
  if (th.pace === 'relaxed') parts.push('relaxed day');
  else if (th.pace === 'packed') parts.push('full day');
  if (th.lake) parts.push('lake time');
  for (const t of th.types || []) parts.push(typeLabel(ctx, t).toLowerCase());
  for (const a of th.activities || []) parts.push(activityLabel(ctx, a));
  return parts.length ? listText(parts) : null;
}

function chooseDayRegions(facts, ctx, days, centroids) {
  const pool = facts.filter((v) => eligible(v, ctx, false));
  const byRegion = {};
  for (const v of pool) (byRegion[v.region] = byRegion[v.region] || []).push(v);
  const lat = (r) => (centroids[r] ? centroids[r].lat : 0);
  let regions;
  if (ctx.regions.length) {
    regions = ctx.regions.slice();
  } else {
    const focuses = focusList(ctx);
    const strength = (r) => {
      const vs = byRegion[r] || [];
      let s = Math.min(vs.length, 40);
      for (const f of focuses) s += Math.min(vs.filter(f.test).length, 5) * 10;
      return s;
    };
    const k = days <= 2 ? 1 : Math.min(days, Math.ceil(days / 2) + 1);
    // 2026-10-25: most towns cap out at the same strength, and the tie went alphabetically ("a week in the Okanagan"
    // had Lake Country and Naramata but not Penticton or Vernon); a tie now goes to the town with more to do.
    regions = Object.keys(byRegion).filter((r) => centroids[r] && (byRegion[r] || []).length >= 6)
      .sort((a, b) => strength(b) - strength(a) || (byRegion[b] || []).length - (byRegion[a] || []).length || a.localeCompare(b)).slice(0, k);
  }
  // North to south, so a multi-region trip never doubles back.
  const size = (r) => (byRegion[r] || []).length;
  regions.sort((a, b) => lat(b) - lat(a) || a.localeCompare(b));
  if (!regions.length) return [];
  if (ctx.regions.length || days <= regions.length) return Array.from({ length: days }, (_, i) => regions[Math.floor((i * regions.length) / days)]);
  // The extra days of a valley trip go to the towns with the most to do, not the northernmost ones.
  const nights = Object.fromEntries(regions.map((r) => [r, 1]));
  const bySize = regions.slice().sort((a, b) => size(b) - size(a) || a.localeCompare(b));
  for (let left = days - regions.length, i = 0; left > 0; left--, i++) nights[bySize[i % bySize.length]] += 1;
  return regions.flatMap((r) => Array(nights[r]).fill(r));
}

// Review fixes (2026-10-18):
//  - near-duplicate places: "Mission Creek Regional Park" and "Mission Creek Greenway" (the same creek's parks) on
//    consecutive days. Outdoor places and beaches share a key when their names share the first two words left after
//    the generic ones (park, regional, trail ...); a trip uses one place per key.
//  - family trips: no meal at a pub or cocktail bar (a cocktail-bar lunch in Penticton) and no technical climbing
//    (Skaha Bluffs).
//  - the off-season: no beach from October to April and no golf from October to March, unless asked for.
const PLACE_GENERIC_WORDS = new Set(['park', 'parks', 'regional', 'provincial', 'greenway', 'trail', 'trails', 'beach', 'beaches', 'the', 'and', 'of', 'at', 'area', 'conservation', 'protected', 'ecological', 'reserve', 'city', 'municipal', 'loop', 'recreation', 'site', 'day', 'use']);
function placeKey(v) {
  if (!v || !['outdoor', 'beach'].includes(v.type)) return null;
  // 2026-10-25: a trail named after its park ("Gillies Creek Trails (Skaha Bluffs Provincial Park)") is that park; a
  // dog trip had Skaha Bluffs Provincial Park in the morning and the Gillies Creek Trails in the afternoon.
  const inPark = /\(([^)]*\b(?:park|provincial|regional|reserve|protected area)\b[^)]*)\)/i.exec(String(v.name || ''));
  if (inPark) {
    const pw = normWords(inPark[1]).split(' ').filter((x) => x && !PLACE_GENERIC_WORDS.has(x));
    if (pw.length >= 2) return pw.slice(0, 2).join(' ');
  }
  const w = normWords(v.name).split(' ').filter((x) => x && !PLACE_GENERIC_WORDS.has(x));
  return w.length >= 2 ? w.slice(0, 2).join(' ') : null;
}
const FAMILY_BAR_NAME_RE = /\b(?:pub|taphouse|tap house|taproom|tap room|lounge|cocktail|cocktails|speakeasy|nightclub|saloon|brewpub)\b/;
const TECHNICAL_CLIMB_RE = /\b(?:rock climbing|climbing destination|climbing routes|sport climbing|trad climbing|via ferrata|bouldering|bluffs)\b/;
function familyAvoid(v) {
  if (!v) return null;
  if (MEAL_FILL_TYPES.includes(v.type) && ((v.fdTypes || []).some((t) => t === 'cocktail' || t === 'pub') || FAMILY_BAR_NAME_RE.test(v.textName || ''))) return 'bar';
  if (v.type === 'outdoor' && TECHNICAL_CLIMB_RE.test(`${v.textName || ''} ${v.textDesc || ''}`)) return 'climb';
  return null;
}
const OFF_SEASON_MONTHS = { beach: [10, 11, 12, 1, 2, 3, 4], golf: [10, 11, 12, 1, 2, 3] };
// Snow-only outings (2026-10-19, round 7): a July Big White plan had snowshoe tours, dog sledding and a sleigh ride.
const WINTER_ONLY_RE = /\b(?:snowshoe|snowshoes|snowshoeing|dog sled|dog sledding|sleigh|sleighs|tube park|tubing|snowmobiles?|snowmobiling|snowcats?|cat skiing|heli skiing|fat bike trails?|fat biking|skating|rink|cross country ski|nordic|ski trails|twinkling|winter)\b/; // 2026-10-25: plurals ("Monashee Powder Snowcats" was planned in October)
function winterOnly(v) { return ['outdoor', 'tour'].includes(v.type) && WINTER_ONLY_RE.test(v.textName || normWords(v.name)); }
// Warm-weather outings (round 9, 2026-10-19): ice cream in January and the Speedway or a beach in November were picked.
// From November to March they are only planned when the request names them.
const SUMMER_ONLY_RE = /\b(?:ice cream|gelato|frozen yogurt|froyo|creamery|speedway|go karts?|gokarts?|waterslides?|water ?park|splash ?pad|mini golf|minigolf|beach|beaches|paddle ?boards?|paddle (?:centre|center|club)|sup|kayak rentals?|boat rentals?|parasail|parasailing|wakeboard|cable park|bumper boats?)\b/;
const COLD_MONTHS = [11, 12, 1, 2, 3];
// 2026-10-21: water parks, speedways, go-karts and rentals on the water close after Labour Day and open in May, so
// October and April trips leave them out too (a late-October family plan had Splash BC and Penticton Speedway).
const SHOULDER_MONTHS = [10, 4];
const SHOULDER_CLOSED_RE = /\b(?:speedway|channel float|river float|tubing|go karts?|gokarts?|waterslides?|water ?park|splash ?pad|floating water park|paddle ?boards?|paddle (?:centre|center|club)|kayak rentals?|boat rentals?|parasail|parasailing|wakeboard|cable park|bumper boats?)\b/;
function summerOnly(v, ctx) {
  const words = SUMMER_ONLY_RE.exec(`${v.textName || normWords(v.name)}`);
  if (!words) return false;
  const asked = normWords((ctx.requirements && ctx.requirements.text) || ctx.queryText || '');
  return !asked.includes(words[0].split(' ')[0]);
}
const ROUGH_ACCESS_RE = /\b(?:high clearance|4x4|four wheel drive|4wd|rough road|very rough|forest service road|fsr)\b/;
function roughAccess(v) { return ROUGH_ACCESS_RE.test(v.textDesc || ''); }
const ROUGH_ACCESS_NOTE = 'Rough access road — the listing says to check your vehicle can make it';
const DESC_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DESC_SEASON_CUE_RE = /\b(?:open|opens|opening|access|accessible|road|roads|vehicle|clearance|season|seasonal|operates|operating|run|runs|snow free|snow-free|trail is|hikeable)\b/;
const DESC_SEASON_RE = new RegExp(`\\b(?:(?:early|mid|late) )?(${DESC_MONTHS.join('|')}) (?:to|through|until|thru) (?:(?:early|mid|late) )?(${DESC_MONTHS.join('|')})\\b`);
function offSeasonSkip(v, ctx) {
  const month = Number((ctx.tripDate || '').slice(5, 7));
  // 2026-10-25: most of November is off too -- outdoor rinks open in December and the ski hills in late November; a
  // weekend plan dated Oct 31 put Stuart Park's rink on its Sunday, November 1.
  const earlyNovember = month === 11 && Number((ctx.tripDate || '').slice(8, 10)) < 25;
  if (month && (SKI_OFF_MONTHS.includes(month) || earlyNovember) && winterOnly(v) && (ctx.skiOffSeason || !ctx.activities.has('winter'))) return true;
  if (month && SHOULDER_MONTHS.includes(month)) {
    const w = SHOULDER_CLOSED_RE.exec(v.textName || normWords(v.name));
    if (w && !normWords((ctx.requirements && ctx.requirements.text) || ctx.queryText || '').includes(w[0].split(' ')[0])) return true;
  }
  // Audit fix (2026-10-27): "golf and dinner in Kelowna tomorrow" (Oct 28) teed off at a course whose own listing says
  // its "golf season runs from early April to mid-October". An outdoor course whose description or advisory gives its
  // season is not planned outside it (to the half month: "mid-October" ends on the 15th), nor after an advisory that
  // says the season has ended, unless the request names the course.
  if (month && v.type === 'golf' && !v.indoorGolf) {
    const text = `${v.textDesc || ''} ${normWords((v.advisory && v.advisory.note) || '')}`;
    const named = normWords((ctx.requirements && ctx.requirements.text) || ctx.queryText || '').includes((v.textName || '').split(' ').slice(0, 2).join(' '));
    if (!named && [10, 11, 12, 1, 2, 3].includes(month) && /\b(?:season (?:has )?(?:ended|is over|is done|wrapped up)|closed for the (?:season|year|winter)|end of (?:the )?season)\b/.test(text)) return true;
    const g = new RegExp(`\\b(?:(early|mid|late) )?(${DESC_MONTHS.join('|')}) (?:to|through|until|thru) (?:(early|mid|late) )?(${DESC_MONTHS.join('|')})\\b`).exec(text);
    if (!named && g && /\b(?:season|open|opens|runs|operates|operating)\b/.test(text.slice(Math.max(0, g.index - 40), g.index + g[0].length + 10))) {
      const md = (ctx.tripDate || '').slice(5);
      const from = `${String(DESC_MONTHS.indexOf(g[2]) + 1).padStart(2, '0')}-${({ early: '01', mid: '15', late: '20' })[g[1]] || '01'}`;
      const to = `${String(DESC_MONTHS.indexOf(g[4]) + 1).padStart(2, '0')}-${({ early: '10', mid: '15', late: '31' })[g[3]] || '31'}`;
      if (md && from < to && (md < from || md > to)) return true;
    }
  }
  // 2026-10-25: an outdoor place or tour whose description gives its season ("high-clearance vehicle, July to
  // September" for a Monashee backcountry trail) is not planned outside it unless the request names it.
  if (month && ['outdoor', 'tour'].includes(v.type)) {
    const desc = v.textDesc || '';
    const w = DESC_SEASON_RE.exec(desc);
    if (w && DESC_SEASON_CUE_RE.test(desc.slice(Math.max(0, w.index - 70), w.index + w[0].length + 25))) {
      const a = DESC_MONTHS.indexOf(w[1]) + 1, b = DESC_MONTHS.indexOf(w[2]) + 1;
      const inside = a <= b ? month >= a && month <= b : month >= a || month <= b;
      const named = normWords((ctx.requirements && ctx.requirements.text) || ctx.queryText || '').includes((v.textName || '').split(' ').slice(0, 2).join(' '));
      if (!inside && !named && a !== b) return true;
    }
  }
  if (month && COLD_MONTHS.includes(month) && !v.indoorGolf && (v.indoorEvidence !== 'explicit' || ['cafe', 'restaurant'].includes(v.type)) && summerOnly(v, ctx)) return true;
  if (!month || ctx.types.has(v.type) || (v.type === 'beach' && ctx.lake) || (v.type === 'golf' && v.indoorGolf)) return false;
  return (OFF_SEASON_MONTHS[v.type] || []).includes(month);
}

// The day's lunch near `near` (2026-10-18, from buildDays): a restaurant, pub or a café that serves lunch, open at
// midday, in the day's town -- or, when nothing there fits, in a town about 20 minutes away, with a note.
// 2026-10-19: neighbours are the stops either side of the lunch; a café next to a café is two coffees in a row, so the
// lunch is then a restaurant. A dinner-only kitchen is never the lunch.
function pickLunchNear(pool, ctx, d, info, near, used, reserved, base, focuses, onceTerms, onceEvening, tripCuisines, centroids, neighbours) {
  const nextToCafe = (neighbours || []).some((st) => st && st.venue && st.venue.type === 'cafe');
  const afterGolf = (neighbours || []).some((st) => st && st.venue && st.venue.type === 'golf' && !st.venue.indoorGolf);
  // 2026-10-28: lunch is placed after the day's other stops, so it also skips their estates (Home Block at CedarCreek
  // for lunch next to a CedarCreek tasting).
  const estateTaken = withSameEstates(pool, used);
  const pick = (towns, far) => {
    let cands = [];
    for (const v of pool) {
      if (used.has(v.id) || reserved.has(v.id) || estateTaken.has(v.id)) continue;
      if (!(v.type === 'restaurant' || v.type === 'pub' || (v.type === 'cafe' && ['coffee', 'unclear'].includes(cafeRole(v))))) continue;
      if (v.type === 'cafe' && nextToCafe) continue;
      if (dinnerOnly(v) || notAMeal(v)) continue; // round 12: not a dessert stand or concession either
      if (towns.length && !towns.includes(v.region)) continue;
      if (!partOk(ctx, d, 'midday', v)) continue;
      if ((ctx.requirements && seasonClosedOnTrip(v, { date: info.actualDate })) || !tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
      if (info.foodAsked && fastFood(v)) continue;
      if (ctx.kids && familyAvoid(v)) continue;
      // "Pizza one night" stays a dinner; a dish asked for is not also lunch.
      if (focuses.some((f) => f.key.startsWith('food:') && f.test(v) && (onceTerms.has(f.key.slice(5)) || onceEvening.has(f.key.slice(5)) || DISH_WORDS_RE.test(f.key.slice(5))))) continue;
      const fit = slotFit(v, ctx, 'midday', d - 1, 'midday');
      if (!fit.ok) continue;
      // 2026-10-25: after a morning round of golf (9 AM to 1 PM) lunch starts after 1, so a lunch place that closes
      // at 2:30 (Rosalinda's in Vernon) could not be timed; it must be open 1 to 3 PM.
      if (afterGolf && hoursFit(v, { from: 780, to: 900, need: 120, label: 'lunch' }, weekdayFor(ctx, d - 1)).status === 'closed') continue;
      const km = kmOrNull(near, v);
      let score = base.get(v.id).score + fit.score + (v.type === 'restaurant' ? 4 : 0) - (km == null ? 6 : km * 1.2 + (km > 15 ? 25 : 0));
      if (v.type === 'restaurant' && v.textCuisine && tripCuisines.has(v.textCuisine)) score -= 4;
      if (ctx.budget === 'budget' && v.price != null) score += v.price === 1 ? 6 : v.price >= 3 ? -8 : 0;
      const extra = [{ code: 'meal', text: 'A lunch stop between the morning and afternoon', weight: 3 }];
      if (km != null) extra.push({ code: 'nearby', text: `About ${km < 1 ? '<1' : Math.round(km)} km (straight line) from the morning and afternoon stops`, weight: 5 });
      cands.push({ v, score, reasons: base.get(v.id).reasons.concat(fit.reasons, extra), caveats: fit.caveats.concat(far ? [nearbyTownCaveat(ctx, centroids, info.regionList, v.region, 'lunch')] : []) });
    }
    cands.sort(compareScored);
    // Round 14: a pub is lunch only when no restaurant or café fits (the midday slot has no pub affinity).
    // When only a pub is left in town, a restaurant in a town nearby is tried first.
    if (cands.some((c) => c.v.type !== 'pub')) cands = cands.filter((c) => c.v.type !== 'pub');
    else if (cands.length && !far && info.regionList.length) return null;
    return rotateWithinType(cands, ctx, undefined, { slot: `${d}-lunch`, lunch: true }); // near-equal lunches rotate by request
  };
  const here = pick(info.regionList, false);
  if (here || !info.regionList.length) return here;
  const towns = townsNear(centroids, info.regionList, MEAL_NEARBY_MINUTES);
  return towns.length ? pick(towns, true) : null;
}
// "In Penticton, about 15 minutes' drive — nothing in Naramata fits that evening" (2026-10-18).
function nearbyTownCaveat(ctx, centroids, regionList, town, meal) {
  const from = regionList[0];
  const mins = regionMinutes(centroids, from, town);
  return `In ${regionLabel(ctx, town)}, about ${mins} minutes’ drive: nothing in ${listText(regionList.map((r) => regionLabel(ctx, r)))} fits ${meal === 'lunch' ? 'lunch' : 'dinner'} that day`;
}

// An event asked for on every evening of a trip (2026-10-19): "in the evenings", "each night", "every evening", "nightly",
// or plural shows ("concerts", "shows"). "Some live music", "a concert" and "2 nights" are not.
const EVERY_EVENING_RE = /\b(?:evenings|each (?:night|evening)|every (?:night|evening)|nightly|all weekend|concerts|shows|gigs)\b|(?<!\b(?:\d+|one|two|three|four|five|six|seven|a few|couple of) )\bnights\b(?! (?:in|at|away|stay))/;
function eventsEachEvening(text) { return EVERY_EVENING_RE.test(normWords(text)); }
function buildDays(facts, ctx, days, pinned) {
  const centroids = regionCentroids(facts);
  const dayRegions = ctx.dayRegionPlan || chooseDayRegions(facts, ctx, days, centroids);
  const dayparts = PLAN_DAYPARTS[ctx.pace] || PLAN_DAYPARTS.standard;
  const maxHop = PLAN_MAX_HOP_KM[ctx.pace] || PLAN_MAX_HOP_KM.standard;
  const kmCost = PLAN_KM_PENALTY[ctx.pace] || PLAN_KM_PENALTY.standard;
  const allowed = allowedTypes(ctx);
  const focuses = focusList(ctx);
  const coffeeRequested = ctx.types.has('cafe') || (ctx.requirements?.items || []).some(i => i.strength === 'must' && i.kind === 'type' && ['cafe', 'breakfast'].includes(i.value));
  const wineAndDiningTrip = days > 1 && ctx.types.has('winery') && ctx.types.has('restaurant') && !coffeeRequested;
  // A venue that satisfies a requested focus (a Hidden Gem park, a hiking
  // trail, a place mentioning "poutine") is welcome whatever its type.
  // A wine-and-dinner weekend starts with a scenic morning (a lookout, trail or nature spot) rather than an empty slot;
  // cafes stay out, as before (2026-10-14: romantic Naramata weekends had no morning stop on any day).
  const scenicMorning = (v) => (wineAndDiningTrip || ROMANTIC_EVENING_OCCASIONS.includes(ctx.occasion) && days > 1) && v.type === 'outdoor' && (v.activities || []).some((a) => ['viewpoints', 'hiking', 'nature'].includes(a));
  const pool = facts.filter((v) => eligible(v, ctx, false) && !(wineAndDiningTrip && v.type === 'cafe') && (scenicMorning(v) || (!allowed || allowed.has(v.type) || focuses.some((f) => f.test(v)) || ctx.requirements?.items.some(i=>['rainy','venue_kind','activity','venue'].includes(i.kind)&&i.strength==='must'&&tripRequirements.matches(v,i)))));
  const byId = new Map(facts.map((v) => [v.id, v]));
  const base = new Map(pool.map((v) => [v.id, scoreVenue(v, ctx)]));
  const used = new Set();
  const covered = new Set();
  // Pinned stops are reserved up front, so refilling one removed slot can
  // never take a venue that another kept slot is holding.
  const reserved = new Set(pinned ? Object.values(pinned) : []);
  const tripTypeCount = {};
  const onceInfo = ctx.requirements ? ctx.requirements : tripRequirements.onceFoods(ctx.queryText);
  const onceTerms = new Set(onceInfo.onceTerms || []);
  const onceUsed = new Set();
  const onceEvening = new Set(onceInfo.onceEvening || []);
  const tripFoodCount = {};
  const tripCuisines = new Set();
  const usedPlaces = new Set();
  const strictNice = requestsSpecialDinner(ctx.requirements?.text || ctx.queryText || '');
  const oneHike = days > 1 && /\b(?:one|a single|1) (?:easy |short |good |great |scenic |little |nice )?(?:hike|walk|trail)\b/.test(ctx.requirements?.text || ctx.queryText || '');
  let tripHikes = 0;
  const warnings = [];
  const out = [];
  // Step 1 (2026-09-29): day themes ("one relaxed day with a lake
  // experience") go on the LAST days of the trip, in the order they were
  // said; a theme the trip is too short for is dropped.
  const themes = (ctx.dayThemes || []).slice(0, days);
  const themeByDay = {};
  themes.forEach((th, k) => { themeByDay[days - themes.length + 1 + k] = th; });
  // Types asked for only as a day theme ("one day of golf") stay on that day.
  const scopedTypes = new Set(themes.flatMap((th) => th.scopedTypes || []));

  // Protect one requested activity per remaining day before filling extra
  // slots. Work backwards so a Sunday-open venue survives Saturday's picks.
  const activityDay = new Map();
  // A rainy-day backup ("indoors if it rains") is one option for the trip, not an indoor stop protected on every day.
  const sharedActivities=(ctx.requirements?.items || []).filter(i=>i.strength==='must'&&['venue_kind','activity','rainy'].includes(i.kind)&&!(i.kind==='rainy'&&i.activityOnly)&&!tripRequirements.requirementDay(i,ctx.tripDate));
  if(days>1&&sharedActivities.length){
    const available=new Map();
    for(const v of pool){
      if(DINING_TYPES.includes(v.type)||reserved.has(v.id)||!sharedActivities.some(i=>tripRequirements.matches(v,i)))continue;
      const fitDays=[];
      for(let day=1;day<=days;day++){
        const regionList=[].concat(dayRegions[day-1]||[]);
        const date=ctx.tripDate?new Date(new Date(ctx.tripDate+'T12:00:00Z').getTime()+(day-1)*86400000).toISOString().slice(0,10):null;
        if(regionList.length&&!regionList.includes(v.region)||seasonClosedOnTrip(v,{date})||!tripRequirements.venueAllowed(v,ctx.requirements,day,ctx.tripDate))continue;
        if(['morning','afternoon'].some(part=>slotFit(v,ctx,part,day-1,part).ok))fitDays.push(day);
      }
      available.set(v.id,fitDays);
    }
    for(let day=days;day>=1;day--){
      if(Object.entries(pinned || {}).some(([key,id])=>Number(key.split('-')[0])===day&&pool.some(v=>v.id===id&&!DINING_TYPES.includes(v.type)&&sharedActivities.some(i=>tripRequirements.matches(v,i)))))continue;
      const choices=pool.filter(v=>!activityDay.has(v.id)&&available.get(v.id)?.includes(day));
      choices.sort((a,b)=>available.get(a.id).length-available.get(b.id).length||compareScored({...base.get(a.id),v:a},{...base.get(b.id),v:b}));
      const remainingCount=[...available].filter(([id,fit])=>!activityDay.has(id)&&fit.some(d=>d<=day)).length;
      if(choices.length&&remainingCount>=day)activityDay.set(choices[0].id,day);
    }
  }

  // 2026-10-18: a trip-wide event request ("some live music") goes on the day with the best match -- one in that day's
  // own town at a dinner-friendly time -- rather than whichever day comes first.
  const eventDay = new Map();
  const everyEvening = days > 1 && eventsEachEvening(ctx.requirements?.text || ctx.queryText || '');
  if (ctx.requirements && days > 1 && (ctx.events || []).length) {
    for (const i of ctx.requirements.items.filter((x) => x.kind === 'event' && !tripRequirements.requirementDay(x, ctx.tripDate))) {
      let best = null;
      for (let day = 1; day <= days; day++) {
        const towns = [].concat(dayRegions[day - 1] || []);
        const date = ctx.tripDate ? new Date(new Date(`${ctx.tripDate}T12:00:00Z`).getTime() + (day - 1) * 86400000).toISOString().slice(0, 10) : null;
        for (const e of ctx.events) {
          if (eventAttendanceDate(e, date) !== date || !tripRequirements.eventMatches(e, i) || !eventSuitsKind(e, i.eventKind)) continue;
          const own = !towns.length || e.valleyWide || towns.includes(e.region);
          if (!own && !towns.some((r) => regionMinutes(centroids, r, e.region) <= EVENT_NEARBY_MINUTES)) continue;
          const st = parseEventStart(e.time);
          const rank = (own ? 0 : 10) + (st == null ? 2 : st >= 18 * 60 + 30 && st <= 21 * 60 + 30 ? 0 : 1);
          if (!best || rank < best.rank) best = { rank, day };
        }
      }
      if (best) eventDay.set(i.id, best.day);
    }
  }
  for (let d = 1; d <= days; d++) {
    // A day can cover two neighbouring towns ("one day in Oliver and Osoyoos").
    const regionList = [].concat(dayRegions[d - 1] || []);
    const region = regionList[0] || null;
    const actualDate = ctx.tripDate ? new Date(new Date(`${ctx.tripDate}T12:00:00Z`).getTime() + (d - 1) * 86400000).toISOString().slice(0, 10) : null;
    const dayPool = pool.filter((v) => {
      if (ctx.requirements && seasonClosedOnTrip(v, { date: actualDate })) return false;
      if(regionList.length && !regionList.includes(v.region))return false;
      const activities=(ctx.requirements?.items||[]).filter(i=>i.kind==='activity'&&i.strength==='must'&&(!tripRequirements.requirementDay(i,ctx.tripDate)||tripRequirements.requirementDay(i,ctx.tripDate)===d));
      const specificWinter=activities.some(i=>['skiing','snowshoeing'].includes(i.value));
      const outdoorNeeds=[...activities.filter(i=>i.value!=='winter'||!specificWinter),...(ctx.requirements?.items||[]).filter(i=>i.kind==='venue_kind'&&['park','sunset','horseback','walk','easy_walk','challenging_hike'].includes(i.value)&&i.strength==='must'&&(!tripRequirements.requirementDay(i,ctx.tripDate)||tripRequirements.requirementDay(i,ctx.tripDate)===d))];
      if(v.type==='outdoor'&&outdoorNeeds.length&&!outdoorNeeds.some(i=>tripRequirements.matches(v,i)))return false;
      const scoped=(ctx.requirements?.items||[]).filter(i=>['venue_kind','venue'].includes(i.kind)&&tripRequirements.matches(v,i));
      return !scoped.length||scoped.some(i=>!tripRequirements.requirementDay(i,ctx.tripDate)||tripRequirements.requirementDay(i,ctx.tripDate)===d);
    });
    const met = new Set();
    const dailyCovered = new Set();
    const activityMorning = (ctx.requirements?.items || []).some(i => i.strength === 'must' && ['venue_kind','rainy'].includes(i.kind) && !(i.kind === 'rainy' && i.activityOnly) && (!tripRequirements.requirementDay(i,ctx.tripDate) || tripRequirements.requirementDay(i,ctx.tripDate) === d)) && !(ctx.requirements?.items || []).some(i=>i.kind==='type'&&['breakfast','cafe'].includes(i.value));
    const dayTypes = {};
    const capped = v => (v.type === 'beach' && coolBeachMonth(actualDate || ctx.tripDate) && (dayTypes.beach || 0) >= 1) || (ctx.requirements?.items || []).some(i => i.kind === 'type_count' && i.strength === 'must' && i.value === v.type && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d) && (tripRequirements.requirementDay(i, ctx.tripDate) ? dayTypes[v.type] || 0 : tripTypeCount[v.type] || 0) >= i.count) || (v.type === 'restaurant' && Number.isInteger(ctx.requirements?.explicitMealCount) && (tripTypeCount.restaurant || 0) >= ctx.requirements.explicitMealCount);
    const stops = [];
    let prev = null;
    const theme = themeByDay[d] || null;
    const dayPace = (theme && theme.pace) || ctx.pace;
    const scopedRequests = (ctx.requirements?.items || []).filter(i => i.strength === 'must' && ['type','venue_kind','venue','activity','rainy'].includes(i.kind) && tripRequirements.requirementDay(i,ctx.tripDate) === d);
    const applicableRequests = scopedRequests.concat((ctx.requirements?.items || []).filter(i => i.strength === 'must' && ['type','venue_kind','venue','activity','rainy'].includes(i.kind) && !tripRequirements.requirementDay(i,ctx.tripDate)));
    const mealRequests = applicableRequests.filter(i => i.kind === 'type' && i.value === 'restaurant');
    const dayRequestAllows = (v, part) => !scopedRequests.length || applicableRequests.some(i => tripRequirements.matches(v,i)) && !(v.type === 'restaurant' && part !== 'evening' && mealRequests.length && mealRequests.every(i => /\b(?:dinner|supper)\b/.test(i.sourceText) && !/\b(?:lunch|meals?|food)\b/.test(i.sourceText)));
    const dayDayparts = (PLAN_DAYPARTS[dayPace] || dayparts).filter(part => !scopedRequests.length || part !== 'evening' || (ctx.requirements?.items || []).some(i => i.kind === 'event' && i.strength === 'must' && (!tripRequirements.requirementDay(i,ctx.tripDate) || tripRequirements.requirementDay(i,ctx.tripDate) === d)) || dayPool.some(v => dayRequestAllows(v,part) && (SLOT_AFFINITY[part]?.[v.type] || 0) > 0));
    // Lunch asked for ("lunch with a view", "good lunches") gets its own midday stop, so the afternoon stays free for
    // the winery or walk and dinner stays dinner (2026-10-14).
    const lunchAsked = /\blunch(?:es)?\b/.test(ctx.requirements?.text || ctx.queryText || '') && !/\b(?:no|skip|without) lunch\b/.test(ctx.requirements?.text || ctx.queryText || '');
    if (lunchAsked && ([...ctx.types].some((t) => !DINING_TYPES.includes(t)) || ctx.activities.size) && dayDayparts.includes('morning') && dayDayparts.includes('afternoon') && !dayDayparts.includes('midday')) dayDayparts.splice(dayDayparts.indexOf('morning') + 1, 0, 'midday');
    // Every full day gets lunch (2026-10-18): plans had a walk, a winery and dinner and nothing to eat at midday, even
    // for "great food". Not for a relaxed pace unless food was mentioned, a part-day request, or "no lunch".
    const reqText = ctx.requirements?.text || ctx.queryText || '';
    const foodAsked = /\b(?:food|foods|eat|eats|eating|foodie|foodies|lunch(?:es)?|restaurants?|meals?|dining|culinary)\b/i.test(reqText);
    // "Live music every evening" on a 3-day trip is about the evenings' shows, not a part-day plan (2026-10-19).
    const everyEvening = days > 1 && eventsEachEvening(ctx.requirements?.text || ctx.queryText || '');
    const partDay = !!((ctx.requirements?.daypart && !everyEvening) || ctx.requirements?.onlyRequested || (ctx.requirements?.items || []).some((i) => i.kind === 'duration') || (ctx.whenDaypart && !everyEvening))
      || (ctx.requirements?.dayStartMinutes?.[d] ?? ctx.requirements?.startMinutes) >= 11 * 60 // a late start
      || Number.isInteger(ctx.requirements?.explicitMealCount); // the visitor counted the meals ("one dinner")
    // 2026-10-18: an evening event no longer costs the day its lunch (a 4-day road trip with live music had none).
    // Every full day has a lunch (2026-10-19), a relaxed one too.
    const fullDayLunchBase = !lunchAsked && !/\b(?:no|skip|without) lunch\b/i.test(reqText) && !partDay && dayDayparts.includes('morning') && dayDayparts.includes('afternoon') && dayDayparts.includes('evening') && !dayDayparts.includes('midday');
    const dayMaxHop = PLAN_MAX_HOP_KM[dayPace] || maxHop;
    const dayKmCost = PLAN_KM_PENALTY[dayPace] || kmCost;
    const thTest = themeTest(theme);
    const thLabel = theme ? themeLabel(ctx, theme) : null;
    let themeMet = false;
    const walking = (ctx.requirements?.items || []).some(i => i.kind === 'transport' && (!tripRequirements.requirementDay(i,ctx.tripDate) || tripRequirements.requirementDay(i,ctx.tripDate) === d));
    const distanceLimit = (ctx.requirements?.items || []).filter(i => ['distance','transport'].includes(i.kind) && i.strength === 'must' && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d)).reduce((n,i) => Math.min(n,i.kind === 'transport' ? i.limitKm : i.value), Infinity);
    // What's On events (2026-10-18): in the day's town or one about 30 minutes away (a road trip's Kelowna day can
    // take a show in West Kelowna), on that date. A family trip with no event asked for still gets a family event.
    const eventNear = (e) => !regionList.length || e.valleyWide || regionList.includes(e.region) || regionList.some((r) => regionMinutes(centroids, r, e.region) <= EVENT_NEARBY_MINUTES);
    const anchors = (ctx.requirements || ctx.familyEvents || ctx.holidayEvents) ? (ctx.events || []).filter(e => {
      const visit=eventAttendanceDate(e,actualDate),start=parseEventStart(e.time);return visit===actualDate&&eventNear(e)&& (start==null||startFitsPart(start,ctx.requirements?.daypart,true));
    }) : [];
    // "Live music in the evenings", "a show every night" (2026-10-19): a trip-wide event request is one event each
    // evening that has one, not only the first; "some live music" stays one show on the best day.
    // Round 11 (2026-10-20): "Christmas markets ... 2 days" is a market each day that has one, not one for the trip.
    const repeatEvent = (i) => (everyEvening || (days > 1 && i.eventKind === 'market' && /\bmarkets\b/.test(i.sourceText || ''))) && !tripRequirements.requirementDay(i, ctx.tripDate);
    const requestedEvents = (ctx.requirements?.items || []).filter(i => i.kind === 'event' && (!covered.has(i.id) || repeatEvent(i)) && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d) && (repeatEvent(i) || !eventDay.has(i.id) || eventDay.get(i.id) === d));
    const familyItem = ctx.familyEvents && ctx.kids && !(ctx.requirements?.items || []).some((i) => i.kind === 'event') ? FAMILY_EVENT_ITEM : null;
    if (familyItem) requestedEvents.push(familyItem);
    // Round 8: a Halloween trip has a Halloween event each day there is one (the list holds only those events).
    if (ctx.holidayEvents && !familyItem && !(ctx.requirements?.items || []).some((i) => i.kind === 'event')) requestedEvents.push(HOLIDAY_EVENT_ITEM);
    // Best first: the day's own town, then an evening show at a dinner-friendly time (a family event in the daytime);
    // otherwise What's On order (soonest first).
    const holiday = holidayTheme(ctx.requirements?.text || ctx.queryText || '');
    const anchorRank = (e) => {
      const st = parseEventStart(e.time), fam = familyItem && tripRequirements.eventMatches(e, familyItem);
      const when = fam ? (st != null && st >= 9 * 60 && st < 17 * 60 ? 0 : st == null ? 1 : 2) : st == null ? 2 : st >= 18 * 60 + 30 && st <= 21 * 60 + 30 ? 0 : 1;
      // Round 7: "Halloween weekend" puts a Halloween event first (a treat trail before a musical).
      const comedy = requestedEvents.some((i) => i.eventKind === 'comedy') ? comedyRank(e) * 3 : 0; // round 8: stand-up first
      // Round 10: "shows" are comedy, theatre, concerts and dance first.
      const stage = requestedEvents.some((i) => ['show', 'performance'].includes(i.eventKind)) ? showRank(e) * 3 : 0;
      return (regionList.length && !regionList.includes(e.region) ? 10 : 0) + when + comedy + stage - (holiday && holiday.re.test(normWords(e.name || '')) ? 5 : 0);
    };
    const anchor = anchors.filter(e => requestedEvents.some(i => tripRequirements.eventMatches(e,i) && eventSuitsKind(e,i.eventKind) && !(i === familyItem && familyEventUnsuitable(e))) && !used.has(`event:${e.id}`)).sort((a, b) => anchorRank(a) - anchorRank(b))[0];
    const start = anchor ? parseEventStart(anchor.time) : null;
    const end = anchor ? eventEndMinutes(anchor, start) : null;
    // A family event open most of the day is a drop-in visit, not a whole-day booking.
    // Round 7: a show is at its listed time (Bunnicula the musical at 10 AM, not "1:35 PM" as a drop-in).
    const dropIn = !!(anchor && familyItem && tripRequirements.eventMatches(anchor, familyItem) && start != null && end != null && end - start > 240 && !eventIsShow(anchor));
    const lateStart = (ctx.requirements?.dayStartMinutes?.[d] ?? ctx.requirements?.startMinutes) >= 840;
    const hasExplicitMeals = /\b(?:lunch|meals|breakfast)\b/.test(ctx.requirements?.text || '') || ctx.requirements?.items.some(i => i.kind === 'type_count' && i.value === 'restaurant' && i.count > 1);
    const optionalAfternoonMeal = s => lateStart && !hasExplicitMeals && s?.daypart === 'afternoon' && s.venue?.type === 'restaurant' && !reserved.has(s.venue.id) && !ctx.requirements?.items.some(i => i.kind === 'venue' && i.value === s.venue.id);
    // Look ahead to a feasible dinner, rather than choosing an isolated
    // activity on its own rating. Pins and named dinner requests remain anchors.
    const dinnerPin = byId.get(pinned?.[`${d}-evening`]);
    const namedDinners = applicableRequests.filter(i => i.kind === 'venue' && byId.get(i.value)?.type === 'restaurant');
    const dinnerCandidates = !anchor && mealRequests.length ? dayPool.filter(v =>
      v.type === 'restaurant' && !used.has(v.id) && (!reserved.has(v.id) || v.id === dinnerPin?.id) && !capped(v) &&
      (!dinnerPin || v.id === dinnerPin.id) && (!namedDinners.length || namedDinners.some(i => i.value === v.id)) &&
      dayRequestAllows(v, 'evening') && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate) && slotFit(v, ctx, 'evening', d - 1, 'evening').ok
    ) : [];

    // "Good restaurants" is met by dinner; it does not also turn the afternoon into a second meal (2026-10-14: a wine
    // weekend's first day had lunch and dinner and no winery).
    const dinnerWillMeet = (v, part) => v.type === 'restaurant' && part !== 'evening' && dayDayparts.includes('evening') && !hasExplicitMeals && !anchor;
    // 2026-10-19: a family event with no listed time (a pop culture convention) is a daytime visit, not a night stop
    // after dinner.
    // Round 12 (2026-10-20): so is a market, fair or craft sale with no listed time (Christmas in Penticton put the Last
    // Chance Holiday Market at night after dinner while the afternoon was empty).
    const untimedFamily = !!(anchor && start == null && dayDayparts.includes('afternoon') && (familyItem && tripRequirements.eventMatches(anchor, familyItem) || daytimeEvent(anchor)));
    let eventPart = anchor ? (untimedFamily ? 'afternoon' : start == null ? 'evening' : start < 12 * 60 ? 'morning' : start < 17 * 60 ? 'afternoon' : 'evening') : null;
    if (dropIn) eventPart = start <= 13 * 60 + 30 && end >= 15 * 60 + 30 && dayDayparts.includes('afternoon') ? 'afternoon' : eventPart;
    // An evening event keeps dinner (2026-10-18): it goes in the 'night' slot after dinner, or before dinner when it
    // starts before 7 PM.
    const eventFirst = eventPart === 'evening' && start != null && start < 19 * 60;
    if (eventPart === 'evening' && dayDayparts.includes('evening')) { eventPart = 'night'; dayDayparts.splice(dayDayparts.indexOf('evening') + 1, 0, 'night'); }
    // Round 7: a daytime event costs the day its lunch only when it runs over lunchtime (a 10 AM musical ends by noon;
    // a family day had a morning show, a park and no lunch).
    const eventEnds = end != null ? end : start != null && anchor ? start + eventAllowanceMinutes(anchor) : null;
    const eventAtLunch = anchor && !dropIn && !untimedFamily && ['morning', 'midday', 'afternoon'].includes(eventPart) && (start == null || (start < 13 * 60 && eventEnds > 13 * 60 + 30));
    const fullDayLunch = fullDayLunchBase && !eventAtLunch;
    for (const daypart of dayDayparts) {
      const pin = pinned && pinned[`${d}-${daypart}`];
      const occupied=anchor && (daypart===eventPart || !dropIn && eventPart!=='night' && start!=null && end!=null && SLOT_WINDOWS[daypart] && start<SLOT_WINDOWS[daypart].to && end>SLOT_WINDOWS[daypart].from);
      if(occupied && pin && !(ctx.softPins && ctx.softPins.has(`${d}-${daypart}`))) { const error=new Error(`The event conflicts with a locked stop on day ${d}. Unlock it or choose another event.`); error.code='TRIP_CONFLICT'; throw error; }
      if(anchor && daypart === eventPart) {
        const evStop = { kind:'event', daypart, label: daypart === 'night' && eventFirst ? 'Early evening' : PLAN_DAYPART_LABELS[daypart], event:eventOnDay(anchor, actualDate), timeKnown:start!=null, why: eventWhy(anchor, requestedEvents.find((i) => tripRequirements.eventMatches(anchor, i)) || null, holiday), caveats:[start==null?'Event start time is not listed; confirm before visiting.':dropIn?`Open ${clockText(start)}–${clockText(end)}; plan on about ${DROP_IN_MINUTES / 60} hours there.`:'Confirm the event duration and allow time around its listed start.'] };
        if (dropIn) { evStop.dropIn = true; evStop.visitMinutes = DROP_IN_MINUTES; }
        if (untimedFamily) { evStop.untimedVisit = true; evStop.visitMinutes = DROP_IN_MINUTES; evStop.caveats = [`Event hours are not listed; this plans about ${DROP_IN_MINUTES / 60} hours in the afternoon. Check the times before you go.`]; }
        if (regionList.length && !regionList.includes(anchor.region) && !anchor.valleyWide) evStop.caveats.push(`In ${regionLabel(ctx, anchor.region)}, about ${regionMinutes(centroids, region, anchor.region)} minutes’ drive from ${regionLabel(ctx, region)}`);
        // Before dinner: the event comes first in the day's order.
        if (eventFirst && stops.length && stops[stops.length - 1].daypart === 'evening') stops.splice(stops.length - 1, 0, evStop); else stops.push(evStop);
        used.add(`event:${anchor.id}`);
        for (const i of requestedEvents) if (tripRequirements.eventMatches(anchor,i)) covered.add(i.id);
        continue;
      }
      if(occupied) { stops.push({daypart,label:PLAN_DAYPART_LABELS[daypart],venue:null,why:[],reasons:[],caveats:['Reserved for the listed event time.']}); warnings.push(`${PLAN_DAYPART_LABELS[daypart]} on day ${d} is kept free for the event’s listed duration.`); continue; }
      // An afternoon meal removed from a late-start plan must not become
      // the geographic anchor used to choose its actual dinner.
      if (daypart === 'evening' && optionalAfternoonMeal(stops[stops.length - 1])) {
        prev = [...stops.slice(0, -1)].reverse().find(s => s.venue)?.venue || null;
      }
      const activityGap = activityMorning && daypart === 'afternoon' && !stops.some(s => s.venue && !DINING_TYPES.includes(s.venue.type)) && !stops.some(s=>s.event) && !anchor && mealRequests.length && mealRequests.every(i=>/\b(?:dinner|supper)\b/.test(i.sourceText)&&!/\b(?:lunch|meals?|food)\b/.test(i.sourceText));
      let chosen = null;
      // A kept stop borrowed from a nearby town (dinner in Penticton on a Naramata Sunday, a show's town) stays kept
      // (2026-10-19: Swap failed with "A locked stop cannot be kept (1-evening)").
      const pinNearby = pin && byId.has(pin) && regionList.length && !regionList.includes(byId.get(pin).region) && townsNear(centroids, regionList, EVENT_NEARBY_MINUTES).includes(byId.get(pin).region);
      if (pin && byId.has(pin) && (!ctx.requirements || pinNearby || regionOk(byId.get(pin),ctx) && (!region || regionList.includes(byId.get(pin).region))) && !capped(byId.get(pin)) && !used.has(pin) && eligible(byId.get(pin), ctx, false) && tripRequirements.venueAllowed(byId.get(pin), ctx.requirements, d, ctx.tripDate) && (!ctx.requirements || !seasonClosedOnTrip(byId.get(pin), { date: actualDate }))) {
        const v = byId.get(pin);
        const fit = slotFit(v, ctx, daypart, d - 1, daypart);
        const dist = distanceTerm(prev, v, dayKmCost, dayMaxHop);
        if (dayRequestAllows(v,daypart) && (fit.ok || !ctx.requirements) && (!prev || (kmBetween(prev,v) == null ? !walking : kmBetween(prev,v) <= distanceLimit))) chosen = { v, score: 0, reasons: (base.get(v.id) || scoreVenue(v, ctx)).reasons.concat(fit.ok ? fit.reasons : [], dist.reasons), caveats: (fit.ok ? fit.caveats : []).concat(dist.caveats) };
      }
      if (!chosen) {
        const cands = [];
        // Dinner before a show in a nearby town can be in that town (2026-10-18).
        const showLoc = daypart === 'evening' && anchor && eventPart === 'night' && anchor.location && hasCoords(anchor.location) ? anchor.location : null;
        const showTown = showLoc && regionList.length && !regionList.includes(anchor.region) ? anchor.region : null;
        const slotPool = showTown ? dayPool.concat(pool.filter((v) => v.region === showTown && v.type === 'restaurant' && (!ctx.requirements || !seasonClosedOnTrip(v, { date: actualDate })))) : dayPool;
        // 2026-10-28: one estate once per trip in the main day builder too (a fall weekend had CedarCreek's tasting room
        // in the afternoon and Home Block at CedarCreek for dinner).
        const estateTaken = withSameEstates(facts, used);
        for (const v of slotPool) {
          if (estateTaken.has(v.id) && !used.has(v.id)) continue;
          if (activityDay.has(v.id)&&activityDay.get(v.id)>d&&!(ctx.requirements?.items || []).some(i=>i.strength==='must'&&tripRequirements.requirementDay(i,ctx.tripDate)===d&&tripRequirements.matches(v,i)))continue;
          if (used.has(v.id) || reserved.has(v.id) || capped(v) || !tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
          if (!partOk(ctx, d, daypart, v)) continue; // round 8: the town asked for at this time of day
          // Preserve scarce activities for later explicit day requests once
          // today's matching requirement has already been fulfilled.
          const futureKinds = (ctx.requirements?.items || []).filter(i => i.strength === 'must' && i.kind === 'venue_kind' && tripRequirements.matches(v, i) && tripRequirements.requirementDay(i, ctx.tripDate) > d);
          if (futureKinds.some(i => {
            const currentMet = ctx.requirements.items.some(j => j.kind === i.kind && j.value === i.value && covered.has(j.id) && tripRequirements.requirementDay(j, ctx.tripDate) === d);
            const needed = new Set(futureKinds.filter(j => j.value === i.value).map(j => tripRequirements.requirementDay(j, ctx.tripDate))).size;
            const remaining = pool.filter(o => !used.has(o.id) && !reserved.has(o.id) && tripRequirements.matches(o, i)).length;
            return currentMet && remaining <= needed;
          })) continue;
          if (!dayRequestAllows(v,daypart)) continue;
          if (prev && (kmBetween(prev,v) == null ? walking : kmBetween(prev,v) > distanceLimit)) continue;
          if (walking) {
            const futureParts=dayDayparts.slice(dayDayparts.indexOf(daypart)+1);
            const nextPin=futureParts.map(part=>byId.get(pinned?.[`${d}-${part}`])).find(Boolean);
            if (nextPin && (kmBetween(v,nextPin)==null || kmBetween(v,nextPin)>distanceLimit)) continue;
          }
          if (daypart === 'morning' && activityMorning && DINING_TYPES.includes(v.type)) continue;
          if (daypart !== 'evening' && daypart !== 'night' && DINING_TYPES.includes(v.type) && dinnerOnly(v)) continue;
          // "A nice dinner" (one meal asked for) is the evening; it is never spent on lunch.
          if (ctx.requirements?.explicitMealCount === 1 && !hasExplicitMeals && v.type === 'restaurant' && daypart !== 'evening' && dayDayparts.includes('evening')) continue;
          if (lunchAsked && daypart === 'midday' && v.type !== 'restaurant') continue;
          if (lunchAsked && daypart === 'afternoon' && v.type === 'restaurant' && dayDayparts.includes('midday')) continue;
          if (scenicMorning(v) && daypart !== 'morning' && !focuses.some((f) => f.test(v))) continue;
          if (activityGap && DINING_TYPES.includes(v.type)) continue;
          if (daytimePart(daypart) && eveningOnlyVenue(v)) continue; // round 11: no comedy club at 1 PM
          if (notAMeal(v) && (daypart === 'midday' || daypart === 'evening')) continue; // round 12: a dessert stand is not a meal
          const aff = (SLOT_AFFINITY[daypart] || {})[v.type] || (daypart === 'morning' && v.type === 'winery' && days === 1 && ctx.types.has('winery') && dayDayparts.includes('midday') ? 2 : 0);
          if (!aff) continue;
          if (offSeasonSkip(v, ctx)) continue;
          if (placeKey(v) && usedPlaces.has(placeKey(v)) && !(ctx.requirements?.items || []).some((i) => i.kind === 'venue' && i.value === v.id)) continue;
          const avoid = ctx.kids ? familyAvoid(v) : null;
          if (avoid === 'climb') continue;
          // One stop of each kind per day (one round of golf, one winery...);
          // only restaurants may appear twice, as lunch and dinner.
          // A one-day wine trip ("wineries and lunch") can visit two wineries.
          if (dayTypes[v.type] && !['restaurant', 'indoor', 'tour'].includes(v.type) && !(v.type === 'winery' && days === 1 && ctx.types.has('winery') && dayTypes.winery < 2)) continue;
          const fit = slotFit(v, ctx, daypart, d - 1, daypart);
          if (!fit.ok) continue; // listed hours prove it is closed then
          const s = base.get(v.id);
          let score = s.score + aff * 6 + fit.score + tripRequirements.requirementScore(v, ctx.requirements, d, ctx.tripDate, new Set([...covered].filter(id => { const req=ctx.requirements?.items.find(i=>i.id===id); return !req || !['venue_kind','rainy'].includes(req.kind) || (req.kind === 'rainy' && req.activityOnly) || tripRequirements.requirementDay(req,ctx.tripDate) || dailyCovered.has(id); }).concat(dinnerWillMeet(v, daypart) ? mealRequests.map((i) => i.id) : [])));
          // Prefer an additional requested activity over meal padding, while
          // reserving scarce unscoped activities for the remaining days.
          if (ctx.requirements && daypart === 'afternoon' && !DINING_TYPES.includes(v.type)) {
            const requested = ctx.requirements.items.filter(i => i.strength === 'must' && ['venue_kind','activity','rainy'].includes(i.kind) && !(i.kind === 'rainy' && i.activityOnly && covered.has(i.id)) && tripRequirements.matches(v,i) && (!tripRequirements.requirementDay(i,ctx.tripDate) || tripRequirements.requirementDay(i,ctx.tripDate) === d));
            if (requested.some(i => tripRequirements.requirementDay(i,ctx.tripDate) === d || dayPool.filter(o => !used.has(o.id) && !reserved.has(o.id) && tripRequirements.matches(o,i)).length > days - d)) score += 100;
          }
          const extra = fit.reasons.slice();
          const vFocus = focuses.filter((f) => f.test(v));
          // A loose word found in a description ("desert", "quiet") is a light nudge, not a reason to pick a weaker place.
          const strongFocus = vFocus.filter((f) => !f.key.startsWith('food:') || DISH_WORDS_RE.test(f.key.slice(5)) || /^(?:brunch|breakfast|lunch|dinner)$/.test(f.key.slice(5)));
          if (vFocus.length) score += strongFocus.some((f) => !met.has(f.key)) ? 20 : vFocus.some((f) => !met.has(f.key)) ? (DINING_TYPES.includes(v.type) ? 0 : 8) : (DINING_TYPES.includes(v.type) ? 0 : 6);
          else if (focuses.length) extra.push({ code: 'complement', text: 'Optional suggestion: Extra stop added to round out the day', weight: 2 });
          if (dayTypes[v.type]) score -= 18;
          // Round 15 (2026-10-20): two days of one trip don't open with the same kind of stop (a hike, then another
          // hike) when another good kind of place is open.
          if (daypart === dayDayparts[0] && out.length) { const pf = ((out[out.length - 1].stops || []).find((x) => x.venue) || {}).venue; const pv = pf && byId.get(pf.id); if (pv && openKind(pv) === openKind(v) && !(ctx.activities.has('hiking') && v.type === 'outdoor') && !ctx.types.has(v.type)) score -= 10; }
          score += varietyNudge(v, ctx);
          // Round 11: an outfitter or charter is booked ahead; it is not a walk-in pick unless tours were asked for.
          if (v.type !== 'tour' && !ctx.types.has('tour') && !ctx.plannerKinds.length && bookedOutfitter(v)) score -= 20;
          // Round 15: a rental base, guided-tour company or forest-road campsite is not a stand-in day opener either.
          else if (v.type !== 'tour' && !ctx.types.has('tour') && !ctx.plannerKinds.length && rotateBooked(v)) score -= 20;
          // Round 12: appointment-only places are booked, not walk-ins.
          if (appointmentOnly(v) && !namedInRequest(v, ctx)) score -= 25;
          // Round 12: no café straight after lunch (a $ lunch, then a café five minutes later).
          if (daypart === 'afternoon' && v.type === 'cafe' && !ctx.types.has('cafe')) { const last = [...stops].reverse().find((x) => x.venue); if (last && last.daypart === 'midday' && DINING_TYPES.includes(last.venue.type)) score -= 25; }
          // Variety: a second meal of the same cuisine on one trip (two Indian dinners) ranks lower.
          if (v.type === 'restaurant' && v.textCuisine && tripCuisines.has(v.textCuisine) && !vFocus.length) score -= 6;
          // A two-town day moves along the valley: the first town early, the second later.
          if (regionList.length > 1 && v.region === regionList[Math.round(dayDayparts.indexOf(daypart) * (regionList.length - 1) / Math.max(1, dayDayparts.length - 1))]) score += 15;
          // "One easy hike" on a longer trip is one hike; other mornings go to something else (2026-10-14).
          if (oneHike && tripHikes >= 1 && v.type === 'outdoor' && (v.activities || []).includes('hiking')) score -= 40;
          // A family's evening is dinner, not a brewery or a show (2026-10-14).
          if (daypart === 'evening' && ctx.kids && v.type !== 'restaurant' && !vFocus.some((f) => !f.key.startsWith('food:'))) score -= 40;
          // A trip with nothing particular asked for ("first time, show us the best") opens each day with a sight, a
          // lookout or a favourite park rather than another coffee.
          if (!ctx.types.size && !ctx.foodTerms.length && !ctx.activities.size && daypart === 'morning' && v.type === 'outdoor' && (v.features.lake_view || v.collections.includes('local_favorite')) && !/\blodge\b|\bcampground\b/.test(v.textName || '') && dayPace !== 'relaxed') score += 18;
          // "Nothing too active": no hikes unless they were asked for.
          if (dayPace === 'relaxed' && v.type === 'outdoor' && !ctx.activities.has('hiking') && ((v.activities || []).includes('hiking') || /\bmountain\b/.test(v.textName || ''))) score -= 12;
          if (!ctx.types.size && !ctx.foodTerms.length && !ctx.activities.size && !ctx.kids && dayPace !== 'relaxed' && daypart === 'morning' && v.type === 'cafe' && dayDayparts.length >= 3) score -= 15;
          if (dayPace === 'relaxed' && v.type === 'golf' && !ctx.types.has('golf')) continue; // a relaxed day is not a round of golf
          // Ski trips: the ski hill first; a dinner tour is not a morning stop.
          if (/\bski(?:ing|ers?)?\b/.test(ctx.queryText || ctx.requirements?.text || '') && v.type === 'outdoor') {
            if (/\b(?:ski|mountain resort|ski hill|ski area)\b/.test(v.textName || '') && daypart === 'morning') score += 25;
            if (/\bdinner\b/.test(v.textName || '') && daypart !== 'evening') score -= 30;
          }
          // A day with nothing particular asked for keeps its afternoon for something to do; lunch is not a stop unless asked.
          if (!ctx.types.size && !ctx.foodTerms.length && daypart === 'afternoon' && v.type === 'restaurant' && !hasExplicitMeals && dayDayparts.includes('evening')) score -= 12;
          if (avoid === 'bar') score -= 40;
          // A nice, romantic or special dinner: $$$ or fine dining first, never pizza, burgers or fast casual.
          if (strictNice && daypart === 'evening' && v.type === 'restaurant') score += casualDinner(v) ? -60 : specialDinner(v) ? 20 : -4;
          // Dinner, not a bar, ends the day unless bars were asked for.
          // 2026-10-19: a cocktail bar is not dinner either, and a bar only wins the evening when no restaurant is close
          // (a road trip's Kelowna night was "Evening: Kelowna Taproom").
          if (daypart === 'evening' && ['pub', 'brewery', 'cocktail'].includes(v.type) && !ctx.types.has(v.type) && !vFocus.length && !ROMANTIC_EVENING_OCCASIONS.includes(ctx.occasion)) score -= v.type === 'pub' && /\b(?:restaurant|kitchen|grill|bistro|eatery)\b/.test(v.textName || '') ? 14 : 28;
          // "Pizza one night" is a dinner, not lunch.
          if (daypart !== 'evening' && dayDayparts.includes('evening') && vFocus.some((f) => f.key.startsWith('food:') && onceEvening.has(f.key.slice(5)))) continue;
          // A food asked for without a count ("beach and pizza") is one meal a day at most, and on about half the days.
          if (DINING_TYPES.includes(v.type) && vFocus.length && vFocus.every((f) => f.key.startsWith('food:') && DISH_WORDS_RE.test(f.key.slice(5)) && (met.has(f.key) || (tripFoodCount[f.key] || 0) >= Math.ceil(days / 2)))) score -= 60;
          // A food asked for once ("pizza one night") is planned once.
          if (onceTerms.size && vFocus.some((f) => f.key.startsWith('food:') && onceTerms.has(f.key.slice(5)) && onceUsed.has(f.key))) continue;
          score -= (tripTypeCount[v.type] || 0) * 3;
          // Step 1 (2026-09-29): this day's theme. A place that fits it comes
          // first until the theme is met; a relaxed day keeps golf and active
          // outdoor mornings off it unless that is what the theme asked for.
          if (thTest && thTest(v)) {
            score += themeMet ? 6 : 26;
            if (thLabel) extra.push({ code: 'theme', text: `Chosen for your ${thLabel}`, weight: 4 });
          }
          if (scopedTypes.has(v.type) && !DINING_TYPES.includes(v.type) && !(theme && (theme.scopedTypes || []).includes(v.type))) continue;
          if (theme && theme.pace === 'relaxed' && !(theme.types || []).includes(v.type)) {
            if (v.type === 'golf') continue; // a relaxed day is not a round of golf unless it asked for one
            if (v.type === 'outdoor' && daypart === 'morning' && !(thTest && thTest(v))) score -= 10;
          }
          // Romantic plans end the day at dinner or a lounge.
          if (daypart === 'evening' && ROMANTIC_EVENING_OCCASIONS.includes(ctx.occasion) && !['restaurant', 'cocktail'].includes(v.type)) continue;
          const seasonal = ctx.seasonInfo
            ? seasonFit(v, { types: [v.type], activities: [], phrase: (theme && theme.lake) || ctx.lake ? 'lake day' : '' }, ctx.seasonInfo, ctx)
            : null;
          if (seasonal) { score += seasonal.score; extra.push(...seasonal.reasons); }
          // Keep dinner possible: an earlier slot never takes the last
          // restaurant that could still serve the evening.
          if (v.type === 'restaurant' && daypart !== 'evening' && dayDayparts.includes('evening')) {
            const spare = dayPool.some((o) => o.id !== v.id && o.type === 'restaurant' && !used.has(o.id) && !reserved.has(o.id) && slotFit(o, ctx, 'evening', d - 1, 'evening').ok);
            if (!spare) continue;
          }
          if (showLoc && DINING_TYPES.includes(v.type)) { const k = kmBetween(v, showLoc); if (k != null) score -= k * 1.5; }
          // Families (2026-10-18): the afternoon is something to do (a park, an attraction, somewhere indoors), not another
          // snack stop; budget trips: free parks, walks, beaches and markets over cafés.
          if ((ctx.kids || ctx.budget === 'budget') && ['morning', 'afternoon'].includes(daypart) && DINING_TYPES.includes(v.type) && !vFocus.some((f) => f.key.startsWith('food:')) && !ctx.types.has(v.type)) score -= ctx.kids ? 22 : 12;
          if (ctx.budget === 'budget' && ['outdoor', 'beach'].includes(v.type) && FREE_PLACE_RE.test(`${v.textName || ''} ${v.textDesc || ''}`)) score += 10;
          if (ctx.kids && ['morning', 'afternoon'].includes(daypart) && (v.type === 'indoor' || v.type === 'outdoor') && (v.features.kid_friendly || RAIN_BACKUP_KIDS_WORDS.some((w) => textHas(v.textName, w)))) score += 6;
          const dinnerJourney = daypart === 'evening' && v.type === 'restaurant' && mealRequests.length;
          // Round 8: the drive to the next town asked for ("dinner in Naramata") is part of the plan, not a hop to avoid.
          const townChange = !!(partsFor(ctx, d) && prev && prev.region !== v.region);
          if (townChange && !hasCoords(v)) continue; // the drive into the next town is timed from a mapped place
          const dist = townChange ? { score: 0, reasons: [], caveats: [] } : distanceTerm(prev, v, dinnerJourney ? OUTING_KM_PENALTY : dayKmCost, dinnerJourney ? PLAN_MAX_HOP_KM.relaxed : dayMaxHop);
          score += dist.score;
          // Only advanced day plans with requested dinner use this lookahead;
          // missing coordinates retain a neutral cost, never a proximity claim.
          if (daypart !== 'evening' && !DINING_TYPES.includes(v.type) && dinnerCandidates.length) {
            const followOn = dinnerCandidates.filter(o => o.id !== v.id && !used.has(o.id));
            if (followOn.length) score += Math.max(...followOn.map(o => (base.get(o.id)?.score || 0) + distanceTerm(v, o, OUTING_KM_PENALTY, PLAN_MAX_HOP_KM.relaxed).score));
          }
          extra.push(...dist.reasons);
          extra.push({ code: 'daypart', text: `Placed in the ${PLAN_DAYPART_LABELS[daypart].toLowerCase()} slot`, weight: 1 });
          cands.push({ v, score, reasons: s.reasons.concat(extra), caveats: fit.caveats.concat(seasonal ? seasonal.caveats : [], dist.caveats) });
        }
        cands.sort(compareScored);
        chosen = rotateWithinType(cands, ctx, undefined, { slot: `${d}-${daypart}`, opening: daypart === dayDayparts[0], lunch: daypart === 'midday' && DINING_TYPES.includes((cands[0] || {}).v?.type), dinner: daypart === 'evening' || daypart === 'night' }); // near-equal places of the chosen kind rotate by request
      }
      // A nice-to-have badge (patio, lake view, happy hour) that leaves an afternoon or evening empty is relaxed for that
      // slot, and the stop says which badge it lacks (2026-10-14: an Osoyoos dog weekend had no second dinner).
      const softAsked = [...new Set(ctx.features.concat((ctx.requirements?.items || []).filter((i) => i.kind === 'feature').map((i) => i.value)))].filter((f) => SOFT_FEATURES.includes(f));
      if (!chosen && softAsked.length && ['afternoon', 'evening'].includes(daypart)) {
        const loose = { ...ctx, features: ctx.features.filter((f) => !softAsked.includes(f)) };
        const want = daypart === 'evening' ? ['restaurant'] : ['restaurant', 'cafe', 'winery', 'brewery'];
        const alt = facts.filter((v) => want.includes(v.type) && (!regionList.length || regionList.includes(v.region)) && !used.has(v.id) && !reserved.has(v.id) && eligible(v, loose, false) && tripRequirements.venueAllowed(v, ctx.requirements && { ...ctx.requirements, items: ctx.requirements.items.filter((i) => !(i.kind === 'feature' && softAsked.includes(i.value))) }, d, ctx.tripDate) && slotFit(v, ctx, daypart, d - 1, daypart).ok)
          .map((v) => ({ v, ...scoreVenue(v, loose) })).sort(compareScored)[0];
        if (alt) chosen = { v: alt.v, score: alt.score, reasons: alt.reasons, caveats: [`Doesn’t list ${listText(softAsked.map((f) => `the ${featureLabel(ctx, f)} badge`))}; the best match left for this time`] };
      }
      // Nothing in town for dinner (2026-10-18: Naramata on a Sunday): a sit-down dinner in a town about 20 minutes away.
      if (!chosen && daypart === 'evening' && regionList.length && !(Number.isInteger(ctx.requirements?.explicitMealCount) && (tripTypeCount.restaurant || 0) >= ctx.requirements.explicitMealCount)) {
        const towns = townsNear(centroids, regionList, MEAL_NEARBY_MINUTES);
        const alt = pool.filter((v) => towns.includes(v.region) && v.type === 'restaurant' && !used.has(v.id) && !reserved.has(v.id) && !casualDinner(v) && !capped(v)
          && (!ctx.requirements || !seasonClosedOnTrip(v, { date: actualDate })) && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate) && !(ctx.kids && familyAvoid(v)))
          .map((v) => ({ v, fit: slotFit(v, ctx, 'evening', d - 1, 'evening') })).filter((x) => x.fit.ok)
          .map(({ v, fit }) => { const km = kmOrNull(prev, v); return { v, score: base.get(v.id).score + fit.score - (km == null ? 6 : km * 0.6), reasons: base.get(v.id).reasons.concat(fit.reasons), caveats: fit.caveats.concat([nearbyTownCaveat(ctx, centroids, regionList, v.region, 'dinner')]) }; })
          .sort(compareScored)[0];
        if (alt) chosen = alt;
      }
      if (!chosen) {
        stops.push({ daypart, label: PLAN_DAYPART_LABELS[daypart], venue: null, reasons: [], why: [], caveats: [] });
        if(activityGap){stops.activityGap=true;}
        if(activityGap)warnings.push(`Day ${d} has no additional matching activity available. The optional afternoon meal was left out; dinner remains. Consider a different activity or a shorter trip.`);
        if (walking && prev) warnings.push(`No nearby stop with verified coordinates fits the car-free plan within ${distanceLimit} km straight-line of ${prev.name} on day ${d}.`);
        // One dinner was asked for and it is already planned: the other evenings are free by request, not a failure.
        const dinnerCapped = daypart === 'evening' && Number.isInteger(ctx.requirements?.explicitMealCount) && (tripTypeCount.restaurant || 0) >= ctx.requirements.explicitMealCount;
        if (dinnerCapped) {
          if (!warnings.some((w) => w.startsWith('You asked for one dinner'))) warnings.push('You asked for one dinner, so it is planned once and the other evenings are left free.');
          // The free evening still names a couple of dinner spots nearby, in case they'd like to eat out (2026-10-14).
          const ideas = dayPool.filter((v) => v.type === 'restaurant' && !used.has(v.id) && !reserved.has(v.id) && slotFit(v, ctx, 'evening', d - 1, 'evening').ok)
            .map((v) => ({ v, ...base.get(v.id) })).sort(compareScored).slice(0, 2);
          if (ideas.length) stops[stops.length - 1].freeEvening = ideas.map((x) => ({ id: x.v.id, name: x.v.name, url: x.v.url }));
        }
        else warnings.push(daypart === 'morning' && activityMorning ? `No matching activity fits the morning on day ${d}; that time is left free rather than adding a meal.` : `No suitable ${PLAN_DAYPART_LABELS[daypart].toLowerCase()} stop was found for day ${d}${region ? ` in ${regionLabel(ctx, region)}` : ''}.`);
        continue;
      }
      const v = chosen.v;
      used.add(v.id);
      for (const i of ctx.requirements?.items || []) if (tripRequirements.matches(v, i) && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d)) { covered.add(i.id); if(i.kind!=='rainy'||!DINING_TYPES.includes(v.type))dailyCovered.add(i.id); }
      dayTypes[v.type] = (dayTypes[v.type] || 0) + 1;
      tripTypeCount[v.type] = (tripTypeCount[v.type] || 0) + 1;
      for (const f of focuses) if (f.test(v) && f.key.startsWith('food:') && !met.has(f.key)) tripFoodCount[f.key] = (tripFoodCount[f.key] || 0) + 1;
      if (v.type === 'restaurant' && v.textCuisine) tripCuisines.add(v.textCuisine);
      if (v.type === 'outdoor' && (v.activities || []).includes('hiking')) tripHikes += 1;
      if (placeKey(v)) usedPlaces.add(placeKey(v));
      for (const f of focuses) if (f.test(v)) { met.add(f.key); if (f.key.startsWith('food:') && onceTerms.has(f.key.slice(5))) onceUsed.add(f.key); }
      if (thTest && thTest(v)) themeMet = true;
      stops.push({ daypart, label: PLAN_DAYPART_LABELS[daypart], ...stopFrom(v, chosen, regionReason(v, ctx), ctx) });
      prev = v;
    }
    const missing = focuses.filter((f) => !met.has(f.key)).map((f) => f.key);
    const day = { ...(stops.activityGap?{activityGap:true}:{}), day: d, region, regionLabel: region ? listText(regionList.map((r) => regionLabel(ctx, r))) : null, ...(regionList.length > 1 ? { regions: regionList } : {}), stops, missingFocus: missing };
    // Step 1: the day's theme, stated only as what was asked for; a theme
    // nothing on Okanagan Roam could meet is reported, never faked.
    if (theme) {
      day.theme = { label: thLabel, pace: theme.pace || null, lake: !!theme.lake, met: thTest ? themeMet : true };
      if (thTest && !themeMet) warnings.push(`No stop matching your ${thLabel} was found for day ${d}${region ? ` in ${regionLabel(ctx, region)}` : ''}.`);
    }
    const req=ctx.requirements,departure=req?.dayStartMinutes?.[d]??req?.startMinutes;
    const explicitMeals=/\b(?:lunch|meals|breakfast)\b/.test(req?.text||'')||req?.items.some(i=>i.kind==='type_count'&&i.value==='restaurant'&&i.count>1);
    if(departure>=840&&!explicitMeals&&day.stops.some(s=>s.daypart==='evening'&&s.venue?.type==='restaurant')){
      day.stops=day.stops.filter(s=>{
        if(s.daypart!=='afternoon'||s.venue?.type!=='restaurant'||Object.values(pinned||{}).includes(s.venue.id)||req?.items.some(i=>i.kind==='venue'&&i.value===s.venue.id))return true;
        used.delete(s.venue.id);tripTypeCount.restaurant--;day.mealNote=`Day ${d}: omitted the optional afternoon meal for your late start; dinner remains in the plan.`;return false;
      });
    }
    if (fullDayLunch) day._lunch = { regionList, actualDate, foodAsked };
    out.push(day);
  }
  // Something to do in the afternoon, near lunch (2026-10-18), for a day whose afternoon meal became its lunch.
  const afternoonActivity = (day, info, lunchV, first) => {
    const d = day.day;
    const regionList = info ? info.regionList : [].concat(day.regions || (day.region ? [day.region] : []));
    const actualDate = info ? info.actualDate : dayDate(ctx, d);
    const taken = new Set(out.flatMap((x) => x.stops.map((st) => st.venue && placeKey(byId.get(st.venue.id))).filter(Boolean)));
    const types = new Set(day.stops.map((st) => st.venue && st.venue.type).filter(Boolean));
    const acts = [];
    for (const v of pool) {
      if (used.has(v.id) || reserved.has(v.id) || DINING_TYPES.includes(v.type) || !((SLOT_AFFINITY.afternoon || {})[v.type])) continue;
      if (regionList.length && !regionList.includes(v.region)) continue;
      if ((ctx.requirements && seasonClosedOnTrip(v, { date: actualDate })) || !tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
      if (offSeasonSkip(v, ctx) || (placeKey(v) && taken.has(placeKey(v))) || (ctx.kids && familyAvoid(v))) continue;
      if (ctx.pace === 'relaxed' && v.type === 'golf') continue;
      if (v.type === 'beach' && types.has('beach') && coolBeachMonth(actualDate || ctx.tripDate)) continue; // one beach a day off season
      const fit = slotFit(v, ctx, 'afternoon', d - 1, 'afternoon');
      if (!fit.ok) continue;
      const km = kmOrNull(lunchV, v);
      const score = base.get(v.id).score + fit.score + (SLOT_AFFINITY.afternoon[v.type] || 0) * 3 - (types.has(v.type) ? 10 : 0) - (km == null ? 6 : km * 1.2 + (km > 20 ? 25 : 0)) - (first && kmOrNull(first, v) != null && kmOrNull(first, v) < 0.3 ? 20 : 0);
      const extra = km != null ? [{ code: 'nearby', text: `About ${km < 1 ? '<1' : Math.round(km)} km (straight line) from the previous stop`, weight: 5 }] : [];
      acts.push({ v, score, reasons: base.get(v.id).reasons.concat(fit.reasons, extra), caveats: fit.caveats });
    }
    acts.sort(compareScored);
    if (!acts[0]) return null;
    used.add(acts[0].v.id);
    return { daypart: 'afternoon', label: PLAN_DAYPART_LABELS.afternoon, ...stopFrom(acts[0].v, acts[0], regionReason(acts[0].v, ctx), ctx) };
  };
  // Lunch on every full day (2026-10-18), chosen after the days are planned so it never takes a stop a later slot
  // needed: a restaurant (or a café that serves lunch) near the morning and afternoon stops, open at midday.
  for (const day of out) {
    const info = day._lunch;
    delete day._lunch;
    const at = (part) => day.stops.find((s) => s.daypart === part);
    // A kept lunch (Regenerate / Swap send every shown stop as a pin) stays the lunch.
    const midPin = pinned && byId.get(pinned[`${day.day}-midday`]);
    if (midPin && !at('midday')) {
      const next = at('afternoon') || at('late') || at('evening');
      const stop = { daypart: 'midday', label: PLAN_DAYPART_LABELS.midday, ...stopFrom(midPin, { reasons: (base.get(midPin.id) || scoreVenue(midPin, ctx)).reasons, caveats: [] }, regionReason(midPin, ctx), ctx) };
      if (next) day.stops.splice(day.stops.indexOf(next), 0, stop); else day.stops.push(stop);
      used.add(midPin.id);
      // Round 8 (2026-10-19): never two meals back to back. A swapped day whose kept lunch is now followed by an
      // afternoon restaurant gets something to do there instead (or loses that second lunch).
      const aft = at('afternoon');
      if (aft && aft.venue && ['restaurant', 'pub'].includes(aft.venue.type) && ['restaurant', 'pub', 'cafe'].includes(midPin.type) && !(pinned && pinned[`${day.day}-afternoon`] && !(ctx.softPins && ctx.softPins.has(`${day.day}-afternoon`)))) {
        used.delete(aft.venue.id);
        day.stops.splice(day.stops.indexOf(aft), 1);
        const act = afternoonActivity(day, null, midPin, at('morning') && at('morning').venue ? byId.get(at('morning').venue.id) : null);
        if (act) { const ev = at('late') || at('evening') || at('night'); if (ev) day.stops.splice(day.stops.indexOf(ev), 0, act); else day.stops.push(act); }
      }
      continue;
    }
    if (!info) continue;
    const morning = at('morning'), afternoon = at('afternoon'), evening = at('evening');
    // A morning show, then lunch near the afternoon stop (round 7).
    if (morning && morning.event && !morning.venue && afternoon?.venue && evening?.venue && !at('midday')) {
      const a1 = byId.get(afternoon.venue.id), loc = morning.event.location;
      const lunch = pickLunchNear(pool, ctx, day.day, info, midpoint(loc && hasCoords(loc) ? loc : null, a1) || a1, used, reserved, base, focuses, onceTerms, onceEvening, tripCuisines, centroids, [afternoon]);
      if (lunch) { used.add(lunch.v.id); day.stops.splice(day.stops.indexOf(afternoon), 0, { daypart: 'midday', label: PLAN_DAYPART_LABELS.midday, ...stopFrom(lunch.v, lunch, regionReason(lunch.v, ctx), ctx) }); }
      continue;
    }
    // 2026-10-18: a drop-in family event can be the afternoon; a family day holds at most three food stops.
    if (!morning?.venue || !(afternoon?.venue || afternoon?.event) || !evening?.venue || at('midday')) continue;
    if (ctx.kids && day.stops.filter((st) => st.venue && DINING_TYPES.includes(st.venue.type)).length >= 3) continue;
    if (!afternoon.venue) {
      const a0 = byId.get(morning.venue.id), loc = afternoon.event.location;
      const lunch = pickLunchNear(pool, ctx, day.day, info, midpoint(a0, loc && hasCoords(loc) ? loc : null) || a0, used, reserved, base, focuses, onceTerms, onceEvening, tripCuisines, centroids, [morning]);
      if (lunch) { used.add(lunch.v.id); day.stops.splice(day.stops.indexOf(afternoon), 0, { daypart: 'midday', label: PLAN_DAYPART_LABELS.midday, ...stopFrom(lunch.v, lunch, regionReason(lunch.v, ctx), ctx) }); }
      continue;
    }
    // A meal in the afternoon slot is the day's lunch (2026-10-18: Vernon day 2 had "Afternoon: <restaurant>" and no
    // midday stop): it moves to midday, and the afternoon gets something to do when one fits.
    if (['restaurant', 'pub'].includes(afternoon.venue.type) && !['restaurant', 'pub'].includes(morning.venue.type) && !(pinned && pinned[`${day.day}-afternoon`])) {
      // 2026-10-19: only when it serves lunch. A place that opens at 3:30 PM (Theo's in Penticton) became a 3:30 PM
      // "lunch"; it gives way to a lunch spot near the morning stop instead.
      const lateMeal = byId.get(afternoon.venue.id);
      if (!slotFit(lateMeal, ctx, 'midday', day.day - 1, 'midday').ok) {
        const swap = pickLunchNear(pool, ctx, day.day, info, byId.get(morning.venue.id), used, reserved, base, focuses, onceTerms, onceEvening, tripCuisines, centroids, [morning]);
        if (!swap) continue;
        used.delete(lateMeal.id); used.add(swap.v.id);
        if (swap.v.type === 'restaurant' && swap.v.textCuisine) tripCuisines.add(swap.v.textCuisine);
        Object.keys(afternoon).forEach((k) => { delete afternoon[k]; });
        Object.assign(afternoon, stopFrom(swap.v, swap, regionReason(swap.v, ctx), ctx));
      }
      afternoon.daypart = 'midday';
      afternoon.label = PLAN_DAYPART_LABELS.midday;
      const act = afternoonActivity(day, info, byId.get(afternoon.venue.id), byId.get(morning.venue.id));
      if (act) day.stops.splice(day.stops.indexOf(evening), 0, act);
      continue;
    }
    if ([morning, afternoon].some((s) => ['restaurant', 'pub'].includes(s.venue.type))) continue; // already a meal
    const a = byId.get(morning.venue.id), b = byId.get(afternoon.venue.id);
    const lunch = pickLunchNear(pool, ctx, day.day, info, midpoint(a, b), used, reserved, base, focuses, onceTerms, onceEvening, tripCuisines, centroids, [morning, afternoon]);
    if (!lunch) continue;
    used.add(lunch.v.id);
    if (lunch.v.type === 'restaurant' && lunch.v.textCuisine) tripCuisines.add(lunch.v.textCuisine);
    day.stops.splice(day.stops.indexOf(afternoon), 0, { daypart: 'midday', label: PLAN_DAYPART_LABELS.midday, ...stopFrom(lunch.v, lunch, regionReason(lunch.v, ctx), ctx) });
    // Round 12 (2026-10-20): a café five minutes after lunch is a second meal stop in a row (Midtown Bistro, then Fig
    // Bistro); the afternoon gets something to do instead, when one fits and the café was not kept or asked for.
    if (afternoon.venue.type === 'cafe' && !(pinned && pinned[`${day.day}-afternoon`]) && !ctx.types.has('cafe')) {
      const act = afternoonActivity(day, info, lunch.v, a);
      if (act) { used.delete(afternoon.venue.id); day.stops.splice(day.stops.indexOf(afternoon), 1, act); }
    }
  }
  // A focus that never appeared anywhere in the trip is reported honestly.
  for (const f of focuses) {
    if (out.some((day) => day.stops.some((s) => s.venue && f.test(byId.get(s.venue.id))))) continue;
    // 2026-10-21: when the place for it in town is closed for the season on the trip's dates (Kangaroo Creek Farm after
    // Thanksgiving), say so rather than "nothing is listed".
    const closedHere = ctx.regions.length && ctx.tripDate ? facts.filter((v) => ctx.regions.includes(v.region) && f.test(v) && seasonClosedOnTrip(v, { date: ctx.tripDate })).sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0] : null;
    if (closedHere) { warnings.push(`${closedHere.name} is closed for the season on your dates, so ${focusText(ctx, f.key)} is not in this plan.`); continue; }
    // 2026-10-14: name the closest place that has it, one or two towns along the valley, instead of only saying no.
    const near = nearbyFocusVenue(facts, ctx, f);
    if (near) warnings.push(`Nothing matching ${focusText(ctx, f.key)} is listed in ${listText(ctx.regions.map((r) => regionLabel(ctx, r)))}; the closest is ${near.name} in ${regionLabel(ctx, near.region)}.`);
    else warnings.push(`Nothing matching ${focusText(ctx, f.key)} was available${ctx.regions.length ? ` in ${listText(ctx.regions.map((r) => regionLabel(ctx, r)))}` : ''}.`);
  }
  return { days: out, warnings, dayparts };
}

// ---------- themed trips: wine country and ski days (2026-10-18) ----------
//
// The site review's real requests: "wine tour Oliver Osoyoos 2 days" gave tour
// companies and a pub; "wineries in Oliver for 2 days" one winery a day padded
// with a coffee chain and fast food; "ski Big White 3 days in January" never
// included the ski resort. A request that is about wine (or skiing) and nothing
// else is planned by the day builders below; every other request keeps
// buildDays(). Same stop shape, same hours checks (slotFit), same eligibility.
const TOUR_COMPANY_RE = /\b(?:tour (?:company|companies|operators?|guides?)|wine (?:shuttles?|bus|buses|limos?)|shuttles?|limos?|limousines?|chauffeur(?:ed)?|designated driver|driven|driver|guided (?:wine |winery )?tours?|bus tours?|bike tours?|cycling tours?|tour operators?)\b/;
// Chains and counters that are never "a proper sit-down dinner" (or a lunch on a food trip).
const FAST_FOOD_NAME_RE = /\b(?:mcdonald'?s|a ?& ?w|wendy'?s|burger king|subway|dairy queen|kfc|kentucky fried|taco bell|tim hortons?|starbucks|blenz|pizza hut|domino'?s|little caesars|panago|pizza 64|pizza pizza|freshii|mary brown'?s|popeyes|quesada|booster juice|mucho burrito|chipotle|opa!?|triple o'?s|5 guys|five guys|harvey'?s|church'?s chicken|chicken ?on ?the ?way|fatburger|carl'?s jr|jugo juice|second cup|good earth|waves coffee|bean scene|coffee ?culture|krispy kreme|cinnabon|edo japan|thai express|manchu wok|a and w|dq grill)\b/;
function fastFood(v) { return FAST_FOOD_NAME_RE.test(String(v.name || '').toLowerCase()) || quickService(v); }
// "Wine tour" is wineries unless a tour company, shuttle or driver was asked for.
function wineTourMeansWineries(text) {
  const t = normWords(text || '');
  if (/\btours? (?:company|companies|operators?|guides?)\b|\bguided (?:wine |winery )?tours?\b/.test(t)) return false;
  return /\b(?:wine|winery|vineyard) tours?\b/.test(t) && !TOUR_COMPANY_RE.test(t.replace(/\b(?:wine|winery|vineyard) tours?\b/g, ' '));
}
// Rewrites a "wine tour" request (requirements + intent) so it asks for wineries. Idempotent.
function applyWineTourMeaning(text, intent, requirements) {
  if (!wineTourMeansWineries(text)) return false;
  if (intent) {
    intent.types = [...new Set((intent.types || []).filter((t) => t !== 'tour').concat('winery'))];
    intent.plannerKinds = (intent.plannerKinds || []).filter((k) => k !== 'wine_tour');
  }
  if (requirements && Array.isArray(requirements.items)) {
    const wasTour = (i) => (i.kind === 'venue_kind' && i.value === 'wine_tour') || (i.kind === 'type' && i.value === 'tour' && /\b(?:wine|winery|vineyard) tours?\b/.test(normWords(i.sourceText || '')));
    const dropped = requirements.items.filter(wasTour);
    if (dropped.length) {
      requirements.items = requirements.items.filter((i) => !wasTour(i));
      if (!requirements.items.some((i) => i.kind === 'type' && i.value === 'winery' && !i.dayIndex)) {
        requirements.items.push({ id: 'wine-tour-wineries', kind: 'type', value: 'winery', strength: 'must', sourceText: dropped[0].sourceText || 'wine tour', dayIndex: null, weekday: null });
      }
    }
  }
  return true;
}

// "Vegan food tour", "a food crawl" (2026-10-19, round 7) mean eating your way round town -- cafés, lunch and dinner --
// not a tour company, unless a guided tour or a tour company is asked for.
const FOOD_TOUR_RE = /\b(?:food|foodie|eating|culinary|brunch|dessert|bakery) (?:tours?|crawls?|trails?|hops?|days?)\b/;
function foodTourMeansFood(text) {
  const t = normWords(text || '');
  return FOOD_TOUR_RE.test(t) && !/\btours? (?:company|companies|operators?|guides?)\b|\bguided (?:food |culinary )?tours?\b|\bbook (?:a|the) (?:food )?tour\b/.test(t);
}
function applyFoodTourMeaning(text, intent, requirements) {
  if (!foodTourMeansFood(text)) return false;
  if (intent) intent.types = [...new Set((intent.types || []).filter((t) => t !== 'tour').concat('restaurant', 'cafe'))];
  if (requirements && Array.isArray(requirements.items)) {
    const wasTour = (i) => i.kind === 'type' && i.value === 'tour';
    const dropped = requirements.items.filter(wasTour);
    if (dropped.length) {
      requirements.items = requirements.items.filter((i) => !wasTour(i));
      if (!requirements.items.some((i) => i.kind === 'type' && i.value === 'restaurant' && !i.dayIndex)) requirements.items.push({ id: 'food-tour-restaurants', kind: 'type', value: 'restaurant', strength: 'must', sourceText: dropped[0].sourceText || 'food tour', dayIndex: null, weekday: null });
    }
  }
  return true;
}

const WINE_TRIP_RE = /\b(?:wineries|vineyards|wine (?:tours?|trips?|weekends?|getaways?|country|tastings?|crawls?|lovers?|routes?|days?|holiday|vacation|escape|region)|winery (?:tours?|hopping|crawl)|tastings|wine)\b/;
const SKI_RESORT_NAME_RE = /\b(?:ski resort|mountain resort|ski hill|ski area)\b/;
const SKI_WORDS_RE = /\b(?:ski|skis|skiing|skier|skiers|snowboard|snowboarding|snowboarders?|ski trip|ski weekend|ski holiday|ski vacation|ski hill|ski resort|on the slopes|hit the slopes)\b/;
// Town -> its nearest downhill resort's region, for "ski trip from Kelowna".
const SKI_REGION_FOR_TOWN = { kelowna: 'big-white', 'west-kelowna': 'big-white', 'lake-country': 'big-white', peachland: 'big-white', vernon: 'silverstar', coldstream: 'silverstar', armstrong: 'silverstar', lumby: 'silverstar', enderby: 'silverstar', 'spallumcheen': 'silverstar', penticton: 'apex', summerland: 'apex', naramata: 'apex', kaleden: 'apex', keremeos: 'apex', 'okanagan-falls': 'apex', oliver: 'baldy', osoyoos: 'baldy' };
// Winter things to add after skiing: tube park, skating, sleigh rides, dog sleds, snowshoes, lights trails.
// Ski season at the Okanagan's hills (2026-10-19, round 7): the resort regions, and the months the lifts usually run.
const SKI_HILL_REGIONS = ['big-white', 'silverstar', 'apex', 'baldy'];
const SKI_SEASON_MONTHS = [12, 1, 2, 3];
// Months with no skiing at all (lifts close in early April and open in late November or December).
const SKI_OFF_MONTHS = [5, 6, 7, 8, 9, 10];
const SKI_LIT_RE = /\b(?:tube|tubing|skating|rink|sleigh|twinkling)\b/; // after-ski activities that run after dark (round 8)
const SKI_EXTRA_RE = /\b(?:tube|tubing|skating|rink|sleigh|dog sled|sled tours?|snowmobile|snowshoe|twinkling|fat bike|snowcat)\b/;
const FOOD_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery'];

function requestHasDinner(text) { return /\b(?:dinners?|suppers?|dine|dining|evening meals?)\b/.test(text); }
// "A nice dinner each night", romantic, special, fine dining, upscale, an anniversary (2026-10-18: a nice-dinner wine
// weekend got a $$ takeout pizza place): dinner is $$$ or more, or a fine-dining or wine-dinner listing, and never a
// pizza, burger or fast-casual place. specialDinner() and casualDinner() judge a listing from its stored facts only.
const SPECIAL_DINNER_RE = /\b(?:romantic|romance|anniversary|honeymoon|fine dining|upscale|fancy|elegant|splurge|special occasion|date night)\b|\b(?:nice|special|lovely|proper|memorable)\s+(?:\w+\s+)?(?:dinners?|suppers?|meals?|restaurants?|dining)\b/;
function requestsSpecialDinner(text) { return SPECIAL_DINNER_RE.test(normWords(text || '')); }
const CASUAL_DINNER_RE = /\b(?:pizza|pizzas|pizzeria|burger|burgers|fast casual|food truck|takeout|take out|delivery|sandwich|sandwiches|subs|wings|fish and chips|hot dogs?|diner|drive in|poutine|shawarma|taco stand|counter|deli|bbq|barbecue|smokehouse)\b/;
const FINE_DINNER_RE = /\b(?:fine dining|tasting menu|chef s tasting|wine pairings?|wine dinners?|winery restaurant|farm to table|seasonal menu|prix fixe|multi course)\b/;
// "Dinner only", "open for dinner", "evenings only" (2026-10-19): never planned as a lunch.
const DINNER_ONLY_RE = /\b(?:dinner only|dinners only|open for dinner|dinner service only|evenings only|open evenings|dinner from \d|supper club)\b/;
function dinnerOnly(v) { return DINNER_ONLY_RE.test(`${v.textName || ''} ${v.textDesc || ''}`); }
function casualDinner(v) { return fastFood(v) || CASUAL_DINNER_RE.test(`${v.textName || ''} ${v.textCuisine || ''}`) || /\b(?:takeout and delivery only|takeout only|take out only|delivery only)\b/.test(v.textDesc || ''); }
function specialDinner(v) { return !casualDinner(v) && ((v.price != null && v.price >= 3) || FINE_DINNER_RE.test(`${v.textName || ''} ${v.textDesc || ''}`)); }
function requestsNiceDinner(text) { return /\b(?:nice|good|great|fine|special|proper|lovely|fancy|romantic|excellent|amazing|best|sit down|upscale)\s+(?:\w+\s+)?(?:dinners?|suppers?|dining|restaurants?|meals?|food)\b|\bfine dining\b|\bfoodies?\b/.test(text); }

// Which themed builder fits, or null. Wine: wineries asked for and nothing
// else to do (dining words are fine). Ski: skiing asked for (not cross-country only).
function tripTheme(ctx) {
  const text = ctx.requirements?.text ? normWords(ctx.requirements.text) : ctx.queryText || '';
  const items = ctx.requirements?.items || [];
  if (ctx.dayThemes && ctx.dayThemes.length) return null;
  if (items.some((i) => ['event', 'venue', 'rainy', 'transport', 'day_trip'].includes(i.kind) && i.strength !== 'prefer')) return null;
  // Kids on a ski trip are fine; a wine trip with kids (or that doesn't drink) keeps the general planner.
  const skiAsked = items.some((i) => i.kind === 'activity' && i.value === 'skiing' && i.strength === 'must') || SKI_WORDS_RE.test(text);
  if (skiAsked && !ctx.skiOffSeason && !/\b(?:cross country|nordic|x c)\b/.test(text) && !/\b(?:water ?ski|jet ?ski)/.test(text)) return 'ski';
  const wine = (ctx.types.has('winery') || items.some((i) => i.kind === 'type' && i.value === 'winery' && i.strength === 'must')) && !ctx.alcoholFree && !ctx.kids;
  // A wine trip, not "a winery visit": wineries, vineyards, wine tours, a wine weekend or wine tastings.
  // "Lunch at a winery" is where to eat, not "a winery visit" (2026-10-19: it turned "3 wineries a day" into one).
  const visitText = text.replace(WINERY_LUNCH_ASK_RE, ' ');
  // A day planned around "lunch at a winery" is a wine day too (2026-10-19: it gave a plain lunch spot).
  if (!wine || !(WINE_TRIP_RE.test(text) || asksWineryLunch(text)) || /\b(?:a|one|1|single) (?:winery|vineyard|wine tasting)\b/.test(visitText)) return null;
  // A dish asked for ("wineries and pizza") is the general planner's job.
  if ((ctx.foodTerms || []).some((f) => f.cuisine || DISH_WORDS_RE.test(f.term))) return null;
  const otherTypes = [...ctx.types].filter((t) => t !== 'winery' && !FOOD_TYPES.includes(t) && !(t === 'tour' && wineTourMeansWineries(text)));
  const otherItems = items.filter((i) => i.strength === 'must' && ((i.kind === 'type' && !['winery', 'restaurant', 'cafe', 'breakfast', 'pub', 'cocktail'].includes(i.value)) || ['activity', 'venue_kind'].includes(i.kind) || (i.kind === 'type_count' && !['winery', 'restaurant', 'cafe'].includes(i.value))) && !(i.kind === 'venue_kind' && i.value === 'wine_tour' && wineTourMeansWineries(text)));
  if (otherTypes.length || otherItems.length || ctx.activities.size || ctx.collections.size || ctx.lake || ctx.plannerKinds.some((k) => k !== 'wine_tour')) return null;
  return 'wine';
}

function dayDate(ctx, d) { return ctx.tripDate ? new Date(new Date(`${ctx.tripDate}T12:00:00Z`).getTime() + (d - 1) * 86400000).toISOString().slice(0, 10) : null; }
// Round 15c (2026-10-20): the late-afternoon filler rotated over the good choices near the day's last stop (seeded by
// the request, so a request always gets the same plan) instead of always the top one: La Carraia Gelateria filled 7 of
// 59 plans. The best still wins some of the time (ROTATE_KEEP_BEST), and nothing more than 6 points behind it is used.
const FILLER_MARGIN = 6;
function rotateFillerPick(cands, ctx, slot) {
  const best = themePick(cands);
  if (!best || !ctx || !(ctx.rotationKey || ctx.queryText)) return best;
  // The Local Favourite / Hidden Gem bonus breaks ties for the best place but is left out when places rotate, as in
  // rotateWithinType (La Carraia Gelateria, a Local Favourite, stayed the only choice in every Vernon plan).
  const plain = (c) => c.score - (c.bonus || 0);
  const pool = cands.filter((c) => plain(best) - plain(c) <= FILLER_MARGIN && !(c.v.rating != null && best.v.rating != null && best.v.rating - c.v.rating > 0.4)).slice(0, ROTATE_TOP);
  if (pool.length < 2 || rotationSlotNudge({ id: 0 }, ctx, `${slot}|keep`) < ROTATE_KEEP_BEST) return best;
  let pick = best, top = -Infinity;
  for (const c of pool) { const t = plain(c) + rotationSlotNudge(c.v, ctx, slot) * FILLER_MARGIN * ROTATE_SPREAD; if (t > top) { top = t; pick = c; } }
  return pick;
}
function themePick(cands) { cands.sort((a, b) => b.score - a.score || (b.v.rating || 0) - (a.v.rating || 0) || String(a.v.name).localeCompare(String(b.v.name)) || a.v.id - b.v.id); return cands[0] || null; }
function themeStop(ctx, daypart, v, scored, fit, extraReasons, extraCaveats) {
  const s = stopFrom(v, { reasons: scored.reasons.concat(fit && fit.reasons || [], extraReasons || []), caveats: (fit && fit.caveats || []).concat(extraCaveats || []) }, regionReason(v, ctx), ctx);
  return { daypart, label: PLAN_DAYPART_LABELS[daypart], ...s };
}
// Where the day's dining is judged from: the two stops' midpoint, or one stop.
function midpoint(a, b) { return hasCoords(a) && hasCoords(b) ? { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 } : (hasCoords(a) ? a : hasCoords(b) ? b : null); }
function kmOrNull(a, b) { return a && b ? kmBetween(a, b) : null; }

// A meal stop near `near`: lunch (midday) or dinner (evening). Dinner is a
// sit-down restaurant: rated places first, never a fast-food or coffee chain.
function pickMeal(pool, ctx, d, daypart, near, used, opts) {
  const text = opts.text;
  const nice = opts.nice;
  let cands = [];
  for (const v of pool) {
    if (used.has(v.id)) continue;
    const isLunch = daypart === 'midday';
    if (!(v.type === 'restaurant' || (isLunch && v.type === 'cafe' && !['treat', 'other'].includes(cafeRole(v))) || (!isLunch && opts.apres && ['pub', 'cocktail'].includes(v.type)))) continue;
    if (opts.cafeOnly && v.type !== 'cafe') continue;
    if (!partOk(ctx, d, daypart, v)) continue;
    if (isLunch && dinnerOnly(v)) continue;
    if (fastFood(v) && !(isLunch && ctx.budget === 'budget')) continue;
    if (!isLunch && v.rating != null && v.rating < 3.8) continue;
    if (!isLunch && /\b(?:cafeteria|food court|deli|takeout|take out|concessions?)\b/.test(v.textName || '')) continue;
    if (notAMeal(v)) continue; // round 12: dessert counters and concession stands are not meals
    if (!tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
    const fit = slotFit(v, ctx, daypart, d - 1, daypart);
    if (!fit.ok) continue;
    const base = opts.base(v);
    let score = base.score + fit.score;
    const km = kmOrNull(near, v);
    if (km != null) score -= km * (isLunch ? 1.2 : 0.6) + (km > (isLunch ? 15 : 30) ? 25 : 0);
    else score -= 6;
    if (v.rating == null) score -= isLunch ? 2 : 6;
    else if (v.rating < 4) score -= isLunch ? 6 : 3;
    if (!isLunch) {
      if (v.price != null) score += v.price >= 3 ? (nice ? 10 : 4) : v.price === 2 ? 2 : (nice ? -8 : -3);
      // 2026-10-19: a pub is dinner only when pubs (or après) were asked for, or nothing else is open.
      if (v.type !== 'restaurant') score -= /\b(?:pubs?|bars?|apres|après|taps?|taprooms?)\b/.test(text || '') ? 6 : 20;
    } else if (v.type === 'cafe') score -= opts.wine ? 8 : 3;
    // On a wine day, lunch at a winery's own restaurant is a third winery visit.
    if (opts.wine && /\b(?:winery|vineyards?|estate|wines)\b/.test(`${v.textName || ''}`)) score += isLunch ? 9 : 4;
    if (opts.apres && /\b(?:apres|après|slopeside|ski in|village)\b/.test(`${v.textName || ''} ${v.textDesc || ''}`)) score += 4;
    if (ctx.budget === 'budget' && v.price != null) score += v.price === 1 ? 10 : v.price === 2 ? 2 : -10;
    const reasons = [];
    if (km != null) reasons.push({ code: 'nearby', text: `About ${km < 1 ? '<1' : Math.round(km)} km (straight line) from ${opts.nearName || 'the previous stop'}`, weight: 5 });
    reasons.push({ code: 'meal', text: isLunch ? (opts.wine ? 'Lunch between the wineries' : opts.apres ? 'Lunch at the hill' : 'A lunch stop for the day') : (opts.apres ? 'Après-ski and dinner at the hill' : 'A sit-down dinner to end the day'), weight: 3 });
    cands.push({ v, score, reasons: base.reasons.concat(reasons), fit });
  }
  // 2026-10-19: dinner is a restaurant whenever one is open; a pub or bar only when asked for or when nothing else is.
  if (!isLunchPart(daypart) && !/\b(?:pubs?|bars?|apres|après|taps?|taprooms?)\b/.test(text || '') && cands.some((c) => c.v.type === 'restaurant')) cands = cands.filter((c) => c.v.type === 'restaurant');
  if (!isLunchPart(daypart) && opts.strictNice && cands.length) {
    const fine = cands.filter((c) => specialDinner(c.v));
    if (fine.length) return themePick(fine);
    const sitDown = cands.filter((c) => !casualDinner(c.v));
    const pick = themePick(sitDown.length ? sitDown : cands);
    return { ...pick, caveats: ['No $$$ or fine-dining restaurant open that evening is listed nearby on Okanagan Roam, so this is the best sit-down dinner left'] };
  }
  themePick(cands); // sorts best first
  return rotateWithinType(cands, ctx, undefined, { slot: `${d}-${daypart}-meal`, lunch: daypart === 'midday', dinner: daypart !== 'midday' }); // near-equal meals of one kind rotate by request
}
function isLunchPart(daypart) { return daypart === 'midday'; }

function buildThemedDays(theme, facts, ctx, days, pinned) {
  return theme === 'ski' ? buildSkiDays(facts, ctx, days, pinned) : buildWineDays(facts, ctx, days, pinned);
}

// How many wineries each day visits (2026-10-18): "3 wineries a day" is that many every day (at most
// WINE_PER_DAY_MAX), "5 wineries" over two days is 3 then 2, and a plain wine trip is two a day.
const WINE_PER_DAY_MAX = 4;
function wineTargets(ctx, days) {
  const items = (ctx.requirements?.items || []).filter((i) => i.kind === 'type_count' && i.value === 'winery' && !i.dayIndex && !i.weekday);
  const per = items.find((i) => i.perDay);
  if (per) return { targets: Array(days).fill(Math.max(1, Math.min(WINE_PER_DAY_MAX, per.count))), asked: true, requested: per.requestedCount || null };
  const total = items.find((i) => !i.perDay);
  if (total) return { targets: Array.from({ length: days }, (_, k) => Math.max(1, Math.min(WINE_PER_DAY_MAX, Math.floor(total.count / days) + (k < total.count % days ? 1 : 0)))), asked: true, requested: null };
  // A single wine day has room for three tastings (2026-10-18); a longer trip keeps two a day.
  return { targets: Array(days).fill(days === 1 ? 3 : 2), asked: false, requested: null };
}
// The tasting slots for a day of n wineries, best first. A tasting is only placed in the morning when the winery's
// listed hours cover the morning (open by about 10:30); otherwise the tastings move to the afternoon and late
// afternoon (2026-10-18: Mocojo, which opens at 12:00, was the morning stop).
function wineSlotPlans(n) {
  if (n <= 1) return [['afternoon']];
  if (n === 2) return [['morning', 'afternoon'], ['afternoon', 'late']];
  return [['morning', 'afternoon', 'late'], ['afternoon', 'late']];
}
// A winery listing that serves lunch (its own restaurant or kitchen): on a day of three or more tastings it can be
// the lunch stop and count as a tasting.
const WINERY_LUNCH_RE = /\b(?:restaurant|kitchen|bistro|eatery|dining|lunch|lunches|cafe|patio menu|food menu|wood fired|charcuterie boards?)\b/;
// "Lunch at a winery", "lunch at a winery restaurant", "eat lunch at the vineyard" (2026-10-19).
const WINERY_LUNCH_ASK_RE = /\b(?:lunch(?:es)?|eat|meal) (?:at|in) (?:a |an |one |the )?(?:winery|wineries|vineyard|vineyards|estate)(?: restaurants?| kitchens?| bistros?| patios?)?\b/g;
function asksWineryLunch(text) { WINERY_LUNCH_ASK_RE.lastIndex = 0; const t = normWords(text || ''); const hit = WINERY_LUNCH_ASK_RE.test(t) || /\b(?:winery|vineyard) lunch(?:es)?\b/.test(t); WINERY_LUNCH_ASK_RE.lastIndex = 0; return hit; }
// A place to have lunch at a winery (round 7): a winery listing with its own kitchen or food menu (Chain Reaction's
// wood-fired pizza), or a restaurant at a winery (Terrafina at Hester Creek, The Bistro at Hillside).
function wineryLunchSpot(v, nameWords) { return wineryServesLunch(v) || wineryRestaurant(v, nameWords); }
// Round 9 (2026-10-19): "picnic lunches are welcome" (Oak & Sparrow) is not a kitchen.
function wineryServesLunch(v) { return v.type === 'winery' && WINERY_LUNCH_RE.test(`${v.textName || ''} ${(v.textDesc || '').replace(/\b(?:picnic|bring your own|byo) (?:lunch|lunches|food)\b/g, '')}`); }
// How much of a lunch a winery lunch spot is (round 9): a restaurant at a winery first (Terrafina at Hester Creek), then
// a winery with its own restaurant or kitchen, then a tasting room with boards (charcuterie only).
function wineryLunchRank(v, nameWords) {
  if (wineryRestaurant(v, nameWords)) return 30;
  return /\b(?:restaurant|kitchen|bistro|eatery|dining|lunch|lunches|food menu|wood fired)\b/.test(`${v.textName || ''} ${(v.textDesc || '').replace(/\b(?:picnic|bring your own|byo) (?:lunch|lunches|food)\b/g, '')}`) ? 15 : 0;
}
// A restaurant at a winery (2026-10-19): "The Bistro at Hillside Winery", "Terrafina at Hester Creek", "The restaurant
// side of Lake Breeze Vineyards". Its name or description names a winery, or "<restaurant> at <X>" where X starts a
// listed winery's name.
const WINERY_NAME_STOP = new Set(['the', 'a', 'estate', 'estates', 'winery', 'wines', 'wine', 'vineyard', 'vineyards', 'cellars', 'family', 'co', 'company', 'and', 'of', 'okanagan', 'lake']);
function wineryNameWords(facts) {
  const out = new Set();
  for (const v of facts) if (v.type === 'winery') { const w = normWords(v.name).split(' ').find((x) => x && !WINERY_NAME_STOP.has(x)); if (w) out.add(w); }
  return out;
}
function wineryRestaurant(v, nameWords) {
  if (v.type !== 'restaurant') return false;
  const name = v.textName || normWords(v.name), desc = v.textDesc || '';
  if (/\b(?:winery|vineyards?|estate wines?)\b/.test(name)) return true;
  if (/\b(?:winery|vineyard) (?:restaurant|bistro|kitchen)\b|\b(?:restaurant|bistro|kitchen|patio|dining room|side) (?:at|of) (?:the )?(?:[a-z']+ ){0,4}(?:estate )?(?:winery|vineyards?|wines)\b/.test(desc)) return true;
  const at = / at (?:the )?([a-z']+)/.exec(name);
  if (at && nameWords && nameWords.has(at[1])) return true;
  // Round 10 (2026-10-19): "Sonora Room Restaurant sits at Burrowing Owl Estate Winery", "the restaurant at Nk'Mip
  // Cellars", "the fine-dining room at Tinhorn Creek Vineyards".
  return /\b(?:restaurant|bistro|kitchen|dining room|patio)\b(?: [a-z]+){0,3} (?:sits |is |set |located |nestled )?(?:at|inside|on the grounds of) (?:the )?(?:[a-z']+ ){1,4}(?:estate )?(?:winery|vineyards?|cellars|estate)\b/.test(`${name} ${desc.slice(0, 200)}`);
}
// The winery estate a winery or winery restaurant belongs to (round 10): "hester" for Hester Creek Estate Winery and for
// Terrafina at Hester Creek, "tinhorn" for Tinhorn Creek Vineyards and Miradoro (the fine-dining room at Tinhorn Creek).
const ESTATE_AT_RE = /\b(?:at|to|inside|of) (?:the )?([a-z0-9]+)/g;
function estateKey(v, nameWords) {
  if (!v) return null;
  if (v.type === 'winery') return normWords(v.name).split(' ').find((x) => x && !WINERY_NAME_STOP.has(x)) || null;
  if (v.type !== 'restaurant' || !wineryRestaurant(v, nameWords)) return null;
  const text = `${v.textName || normWords(v.name)} ${(v.textDesc || normWords(v.description || '')).slice(0, 200)}`;
  for (const m of text.matchAll(ESTATE_AT_RE)) if (nameWords && nameWords.has(m[1])) return m[1];
  return null;
}
// 2026-10-21: one estate once per trip. "The Restaurant at Poplar Grove" for dinner and Poplar Grove Winery the next
// day, or "Kitchen @ Da Silva Winery" and Da Silva's tasting room, read as the same place twice.
const ESTATE_GROUPS_CACHE = new WeakMap();
function estateGroups(facts) {
  if (ESTATE_GROUPS_CACHE.has(facts)) return ESTATE_GROUPS_CACHE.get(facts);
  const words = wineryNameWords(facts), of = new Map(), ids = new Map();
  for (const v of facts) {
    if (!['winery', 'restaurant'].includes(v.type)) continue;
    let k = estateKey(v, words);
    if (!k && v.type === 'restaurant' && /@/.test(v.name || '')) k = normWords(String(v.name).split('@')[1]).split(' ').find((x) => words.has(x)) || null;
    if (!k) continue;
    of.set(v.id, k);
    if (!ids.has(k)) ids.set(k, []);
    ids.get(k).push(v);
  }
  const out = { of, ids };
  ESTATE_GROUPS_CACHE.set(facts, out);
  return out;
}
// `used` plus the other half of each used estate: a used winery-restaurant blocks its winery and a used winery blocks
// its restaurant. Two wineries are never linked (estate keys are a first name word: Black Widow and Black Hills).
function withSameEstates(facts, used) {
  const g = estateGroups(facts), out = new Set(used), byId = new Map(facts.map((v) => [v.id, v]));
  for (const id of used) {
    const k = g.of.get(id), v = byId.get(id);
    if (!k || !v) continue;
    for (const o of g.ids.get(k) || []) if (o.type !== v.type) out.add(o.id);
  }
  return out;
}
// A winery whose restaurant has its own listing (Hester Creek next to Terrafina) is the tasting room: lunch there is the
// restaurant listing, not the tasting bar.
const ESTATE_KITCHEN_CACHE = new WeakMap();
function estateKitchens(facts) {
  let out = ESTATE_KITCHEN_CACHE.get(facts);
  if (!out) {
    const words = wineryNameWords(facts);
    out = { words, keys: new Set() };
    for (const r of facts) if (r.type === 'restaurant') { const k = estateKey(r, words); if (k) out.keys.add(`${r.region}|${k}`); }
    ESTATE_KITCHEN_CACHE.set(facts, out);
  }
  return out;
}
function tastingRoomWithRestaurant(v, facts) { if (!v || v.type !== 'winery' || !Array.isArray(facts)) return false; const k = estateKey(v); return !!k && estateKitchens(facts).keys.has(`${v.region}|${k}`); }

function buildWineDays(facts, ctx, days, pinned) {
  const text = ctx.requirements?.text ? normWords(ctx.requirements.text) : ctx.queryText || '';
  const centroids = regionCentroids(facts);
  const dayRegions = ctx.dayRegionPlan || chooseDayRegions(facts, ctx, days, centroids);
  const pool = facts.filter((v) => eligible(v, ctx, false));
  const byId = new Map(facts.map((v) => [v.id, v]));
  const baseCache = new Map();
  const base = (v) => { if (!baseCache.has(v.id)) baseCache.set(v.id, scoreVenue(v, ctx)); return baseCache.get(v.id); };
  const used = new Set(pinned ? Object.values(pinned) : []);
  const nice = requestsNiceDinner(text) || requestHasDinner(text);
  const strictNice = requestsSpecialDinner(text);
  // "One dinner": that many sit-down dinners, the other evenings free (with ideas), lunches at cafés.
  const mealCap = Number.isInteger(ctx.requirements?.explicitMealCount) ? ctx.requirements.explicitMealCount : Infinity;
  const { targets, asked, requested } = wineTargets(ctx, days);
  const wineryLunchAsked = asksWineryLunch(text);
  const wineryWords = wineryLunchAsked ? wineryNameWords(facts) : null;
  // Round 10: a tasting room whose restaurant has its own listing is not the lunch stop (the restaurant is).
  // A charcuterie board or a café feel is not lunch when lunch at a winery was asked for (wineryLunchRank 15+).
  const wineryKitchen = (v) => (wineryServesLunch(v) && !(wineryLunchAsked && (tastingRoomWithRestaurant(v, facts) || wineryLunchRank(v, wineryWords) < 15))) || (wineryLunchAsked && wineryRestaurant(v, wineryWords));
  let dinners = 0;
  const warnings = [];
  if (requested) warnings.push(`Up to ${WINE_PER_DAY_MAX} winery visits fit in one day, so each day has ${WINE_PER_DAY_MAX} rather than ${requested}.`);
  const out = [];
  const dayparts = ['morning', 'midday', 'afternoon', 'late', 'evening'];
  const empty = (daypart) => ({ daypart, label: PLAN_DAYPART_LABELS[daypart], venue: null, reasons: [], why: [], caveats: [] });
  const TASTING_TEXT = ['First tasting of the day', 'Second tasting of the day', 'Third tasting of the day', 'Fourth tasting of the day'];
  for (let d = 1; d <= days; d++) {
    const regionList = [].concat(dayRegions[d - 1] || []);
    const region = regionList[0] || null;
    const where = region ? ` in ${listText(regionList.map((r) => regionLabel(ctx, r)))}` : '';
    const date = dayDate(ctx, d);
    const inDay = (v) => (!regionList.length || regionList.includes(v.region)) && !seasonClosedOnTrip(v, { date }) && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate);
    const dayPool = pool.filter(inDay);
    // A kept stop wins over the Swap exclusion (2026-10-19): the same place on another day (the ski resort, a repeated
    // village dinner) is still kept when one copy of it is swapped.
    const pin = (part) => { const id = pinned && pinned[`${d}-${part}`]; const v = id && byId.get(id); return v || null; };
    const want = targets[d - 1];
    const fitCache = new Map();
    const fitOf = (v, part) => { const k = `${v.id}:${part}`; if (!fitCache.has(k)) fitCache.set(k, slotFit(v, ctx, part, d - 1, part)); return fitCache.get(k); };
    // "Lunch at a winery" (2026-10-19): the best winery with its own kitchen is kept for lunch first, and counts as one
    // of the day's wineries.
    let wineryLunch = null;
    // Round 8: a kept winery lunch (Swap keeps every other shown stop) still counts as one of the day's tastings, so a
    // swap elsewhere never adds a morning tasting to this day.
    if (pin('midday') && pin('midday').type === 'winery' && wineryKitchen(pin('midday'))) wineryLunch = { v: pin('midday'), score: 0, reasons: base(pin('midday')).reasons, fit: null };
    if (wineryLunchAsked && !pin('midday')) {
      // Round 10: never lunch at an estate already in the plan (Nature's Table at Summerhill after a Summerhill tasting).
      const usedEstates = new Set([...used].map((id) => estateKey(byId.get(id), wineryWords)).filter(Boolean));
      const kitchenPick = (list, far) => themePick(list.filter((v) => wineryKitchen(v) && !used.has(v.id) && !usedEstates.has(estateKey(v, wineryWords)) && partOk(ctx, d, 'midday', v)).map((v) => ({ v, fit: fitOf(v, 'midday') })).filter((x) => x.fit.ok)
        .map((x) => ({ ...x, score: base(x.v).score + (x.v.rating || 4) * 2 + wineryLunchRank(x.v, wineryWords), caveats: far ? [nearbyTownCaveat(ctx, centroids, regionList, x.v.region, 'lunch')] : [], reasons: base(x.v).reasons.concat({ code: 'meal', text: x.v.type === 'winery' ? 'Lunch at a winery’s own kitchen, so it is a tasting too' : 'Lunch at a winery’s restaurant', weight: 4 }) })));
      // Nothing in town: a winery restaurant in a town about 20 minutes away (The Bistro at Hillside for Penticton).
      wineryLunch = kitchenPick(dayPool, false) || (regionList.length ? kitchenPick(pool.filter((v) => townsNear(centroids, regionList, MEAL_NEARBY_MINUTES).includes(v.region) && !seasonClosedOnTrip(v, { date }) && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)), true) : null);
      if (wineryLunch) used.add(wineryLunch.v.id);
    }
    // A winery's own kitchen is a tasting too; a restaurant at a winery is lunch, and the tastings stay as asked.
    const tastingWant = wineryLunch && wineryLunch.v.type === 'winery' ? Math.max(1, want - 1) : want;
    // The best set of wineries for the day's tasting slots: each open at its time of day, close together.
    const estateUsed = withSameEstates(facts, used);
    const wineries = dayPool.filter((v) => v.type === 'winery' && !estateUsed.has(v.id));
    // Round 12: appointment-only wineries are not walk-in tastings unless named; the top picks rotate by request.
    const top = wineries.map((v) => ({ v, s: base(v).score + (v.rating || 4) * 2 + rotationNudge(v, ctx) - (appointmentOnly(v) && !namedInRequest(v, ctx) ? 30 : 0) })).sort((a, b) => b.s - a.s || a.v.id - b.v.id).slice(0, ctx.partRegions ? 40 : want > 2 ? 14 : 18);
    const LOCKED = { ok: true, score: 0, reasons: [], caveats: [] };
    let best = null;
    for (const slots of wineSlotPlans(tastingWant)) {
      // A kept (pinned) stop in a slot this plan does not use rules the plan out.
      if (['morning', 'afternoon', 'late'].some((p) => !slots.includes(p) && pin(p) && pin(p).type === 'winery')) continue;
      const choices = slots.map((p) => (pin(p) ? [{ v: pin(p), s: base(pin(p)).score, locked: true }] : top));
      const pick = [];
      let planBest = null;
      const walk = (k, score) => {
        if (k === slots.length) { if (!planBest || score > planBest.score) planBest = { score, picks: pick.slice() }; return; }
        for (const c of choices[k]) {
          if (pick.some((x) => x.v.id === c.v.id)) continue;
          if (!c.locked && !partOk(ctx, d, slots[k], c.v)) continue;
          const fit = c.locked ? LOCKED : fitOf(c.v, slots[k]);
          if (!fit.ok) continue;
          const prev = pick[k - 1];
          const km = prev ? kmBetween(prev.v, c.v) : null;
          const hop = prev ? (km == null ? 8 : km * 1.5 + (km > 25 ? 40 : 0)) : 0;
          pick.push({ v: c.v, fit, part: slots[k], km });
          walk(k + 1, score + c.s + fit.score - hop);
          pick.pop();
        }
      };
      walk(0, 0);
      // Fewer slots filled is worse than any full set; try a shorter set when the full one is impossible.
      if (!planBest) {
        for (let n = slots.length - 1; n >= 1 && !planBest; n--) {
          const sub = slots.slice(slots.length - n);
          const subChoices = sub.map((p) => (pin(p) ? [{ v: pin(p), s: base(pin(p)).score, locked: true }] : top));
          const walkSub = (k, score) => {
            if (k === sub.length) { if (!planBest || score > planBest.score) planBest = { score, picks: pick.slice() }; return; }
            for (const c of subChoices[k]) {
              if (pick.some((x) => x.v.id === c.v.id)) continue;
              if (!c.locked && !partOk(ctx, d, sub[k], c.v)) continue;
              const fit = c.locked ? LOCKED : fitOf(c.v, sub[k]);
              if (!fit.ok) continue;
              const prev = pick[k - 1];
              const km = prev ? kmBetween(prev.v, c.v) : null;
              pick.push({ v: c.v, fit, part: sub[k], km });
              walkSub(k + 1, score + c.s + fit.score - (prev ? (km == null ? 8 : km * 1.5 + (km > 25 ? 40 : 0)) : 0));
              pick.pop();
            }
          };
          walkSub(0, 0);
        }
      }
      if (planBest && (!best || planBest.picks.length > best.picks.length || (planBest.picks.length === best.picks.length && planBest.score > best.score))) best = planBest;
      if (best && best.picks.length >= Math.min(tastingWant, 3)) break; // the first plan that holds the day wins
    }
    const picks = best ? best.picks : [];
    for (const x of picks) used.add(x.v.id);
    const stops = [];
    const tastings = picks.map((x, k) => {
      const reasons = [{ code: 'theme', text: TASTING_TEXT[k] || 'Another tasting', weight: 4 }];
      if (k > 0 && x.km != null) reasons.push({ code: 'nearby', text: `About ${x.km < 1 ? '<1' : Math.round(x.km)} km (straight line) from ${picks[k - 1].v.name}`, weight: 5 });
      return themeStop(ctx, x.part, x.v, base(x.v), x.fit, reasons);
    });
    // Lunch between the tastings; on a day that still needs a tasting, a winery with its own kitchen first.
    const near = picks.length ? midpoint(picks[0].v, picks[picks.length - 1].v) || picks[0].v : null;
    const lunchPin = pin('midday');
    const needMore = picks.length < tastingWant;
    let lunch = lunchPin ? { v: lunchPin, score: 0, reasons: base(lunchPin).reasons, fit: null } : wineryLunch;
    // 2026-10-28: lunch is picked after the tastings, so it skips their estates (CedarCreek's tasting room, then lunch at
    // Home Block at CedarCreek).
    const lunchUsed = withSameEstates(facts, used);
    if (!lunch && (wineryLunchAsked || (needMore && want >= 3))) {
      const wl = themePick(dayPool.filter((v) => wineryKitchen(v) && !lunchUsed.has(v.id) && partOk(ctx, d, 'midday', v)).map((v) => ({ v, fit: fitOf(v, 'midday') })).filter((x) => x.fit.ok)
        .map((x) => ({ ...x, score: base(x.v).score - (kmOrNull(near, x.v) || 6) * 1.2, reasons: base(x.v).reasons.concat({ code: 'meal', text: 'Lunch at a winery’s own kitchen, so it is a tasting too', weight: 4 }) })));
      if (wl) lunch = wl;
    }
    if (!lunch && wineryLunchAsked) warnings.push(`No winery with its own kitchen fits lunch on day ${d}${where}, so lunch is at a restaurant near the wineries.`);
    if (!lunch) lunch = pickMeal(dayPool, ctx, d, 'midday', near, lunchUsed, { base, wine: true, text, nearName: 'the wineries', cafeOnly: mealCap !== Infinity });
    // Nothing open in town (2026-10-18): a town about 20 minutes away.
    const nearPool = () => (regionList.length ? pool.filter((v) => townsNear(centroids, regionList, MEAL_NEARBY_MINUTES).includes(v.region) && !seasonClosedOnTrip(v, { date }) && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) : []);
    if (!lunch && regionList.length) { const far = pickMeal(nearPool(), ctx, d, 'midday', near, lunchUsed, { base, wine: true, text, nearName: 'the wineries', cafeOnly: mealCap !== Infinity }); if (far) lunch = { ...far, caveats: (far.caveats || []).concat(nearbyTownCaveat(ctx, centroids, regionList, far.v.region, 'lunch')) }; }
    // Round 8: a winery lunch is timed as lunch (from 11:30), not as a 10 AM tasting.
    if (lunch) { used.add(lunch.v.id); stops.push({ ...themeStop(ctx, 'midday', lunch.v, { reasons: lunch.reasons }, lunch.fit, [], lunch.caveats || []), ...(lunch.v.type === 'winery' ? { wineryLunch: true } : {}) }); }
    const wineCount = picks.length + (lunch && lunch.v.type === 'winery' ? 1 : 0);
    // The morning: the first tasting, or (on a plain wine trip whose wineries open later) a viewpoint or walk near them.
    // Round 9 (2026-10-19): a kept morning walk stays when another stop is swapped. It was re-picked, but the walk was
    // already "used" by its own pin, so the morning went empty and "Add whole trip" saved the shorter plan.
    const morningPin = pin('morning');
    if (morningPin && morningPin.type !== 'winery' && !picks.some((x) => x.part === 'morning')) stops.push(themeStop(ctx, 'morning', morningPin, base(morningPin), null, [{ code: 'theme', text: 'A viewpoint or walk before the tastings', weight: 3 }]));
    else if (!picks.some((x) => x.part === 'morning')) {
      const scenic = asked ? null : themePick(dayPool.filter((v) => v.type === 'outdoor' && !used.has(v.id) && partOk(ctx, d, 'morning', v) && (v.activities || []).some((a) => ['viewpoints', 'nature', 'hiking'].includes(a))).map((v) => ({ v, score: base(v).score - (kmOrNull(near, v) || 10) })));
      if (scenic) { used.add(scenic.v.id); stops.push(themeStop(ctx, 'morning', scenic.v, base(scenic.v), null, [{ code: 'theme', text: 'A viewpoint or walk before the tastings', weight: 3 }])); }
      else stops.push(empty('morning'));
    }
    stops.push(...tastings);
    if (!picks.length) {
      stops.push(empty('afternoon'));
      warnings.push(`No winery open in the afternoon was found for day ${d}${region ? ` in ${regionLabel(ctx, region)}` : ''}.`);
    } else if (wineCount < want) {
      warnings.push(wineCount === 1 && want === 2 ? `Only one winery${where} fits day ${d}; its listed hours or the plan's other days left no second one.` : `Only ${wineCount} of the ${want} wineries you asked for${where} fit day ${d}; their listed hours or the plan's other days left no more.`);
    }
    const last = picks.length ? picks[picks.length - 1].v : null;
    const dinnerPin = pin('evening');
    const capped = !dinnerPin && dinners >= mealCap;
    const dinnerOpts = { base, wine: true, nice, strictNice, text, nearName: last ? last.name : 'the wineries' };
    let dinner = capped ? null : dinnerPin ? { v: dinnerPin, score: 0, reasons: base(dinnerPin).reasons, fit: null } : pickMeal(dayPool, ctx, d, 'evening', last || near, withSameEstates(facts, used), dinnerOpts);
    if (!dinner && !capped && regionList.length) { const far = pickMeal(nearPool(), ctx, d, 'evening', last || near, withSameEstates(facts, used), dinnerOpts); if (far) dinner = { ...far, caveats: (far.caveats || []).concat(nearbyTownCaveat(ctx, centroids, regionList, far.v.region, 'dinner')) }; }
    if (capped) {
      const free = empty('evening');
      const ideas = [];
      const seen = new Set(used);
      for (let k = 0; k < 2; k++) { const x = pickMeal(dayPool, ctx, d, 'evening', last || near, seen, { base, wine: true, nice, text }); if (!x) break; seen.add(x.v.id); ideas.push({ id: x.v.id, name: x.v.name, url: x.v.url }); }
      if (ideas.length) free.freeEvening = ideas;
      stops.push(free);
      if (!warnings.some((w) => w.startsWith('You asked for one dinner'))) warnings.push(mealCap === 1 ? 'You asked for one dinner, so it is planned once and the other evenings are left free.' : `You asked for ${mealCap} dinners, so the other evenings are left free.`);
    } else if (dinner) { used.add(dinner.v.id); dinners += 1; stops.push(themeStop(ctx, 'evening', dinner.v, { reasons: dinner.reasons }, dinner.fit, [], dinner.caveats || [])); }
    else { stops.push(empty('evening')); warnings.push(`No sit-down dinner open that evening was found for day ${d}${region ? ` in ${regionLabel(ctx, region)}` : ''}.`); }
    out.push({ day: d, region, regionLabel: region ? listText(regionList.map((r) => regionLabel(ctx, r))) : null, ...(regionList.length > 1 ? { regions: regionList } : {}), stops: stops.sort((x, y) => dayparts.indexOf(x.daypart) - dayparts.indexOf(y.daypart)), missingFocus: [] });
  }
  return { days: out, warnings, dayparts, themed: 'wine' };
}

// The ski resort for each day: the named resort town(s), or the resort nearest the named town.
function skiResorts(facts) { return facts.filter((v) => v.type === 'outdoor' && SKI_RESORT_NAME_RE.test(v.textName || normWords(v.name))); }
function skiDayRegions(facts, ctx, days) {
  const resorts = skiResorts(facts);
  const resortRegions = [...new Set(resorts.map((v) => v.region))];
  let regions = ctx.regions.filter((r) => resortRegions.includes(r));
  if (!regions.length) regions = [...new Set(ctx.regions.map((r) => SKI_REGION_FOR_TOWN[r]).filter((r) => resortRegions.includes(r)))];
  if (!regions.length) regions = resortRegions.includes('big-white') ? ['big-white'] : resortRegions.slice(0, 1);
  return Array.from({ length: days }, (_, i) => regions[Math.floor((i * regions.length) / days)] || null);
}
function monthDate(month, from) {
  // The next date in that month on or after the season row's own date (the 15th).
  const y = Number(String(from).slice(0, 4)), m = Number(String(from).slice(5, 7));
  const year = month < m ? y + 1 : y;
  return `${year}-${String(month).padStart(2, '0')}-15`;
}
// The season row's reopening date: seasonReopens from server.js (null = not announced), or the day after the closed range.
function seasonReopening(v) {
  if (typeof v.seasonReopens === 'string') return v.seasonReopens;
  if (v.seasonReopens === null && v.seasonClosed) return null;
  return v.seasonClosed && v.seasonClosed.to ? new Date(new Date(`${v.seasonClosed.to}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : null;
}
function skiSeasonNote(resort, ctx, firstDate) {
  const s = resort.seasonClosed;
  if (!s && !resort.seasonClosedToday) return null;
  const reopen = seasonReopening(resort);
  const nice = (iso) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  // No opening day announced yet (2026-10-18: SilverStar, Apex and Baldy): say so, and when ski season usually starts.
  const unannounced = `${resort.name} hasn’t announced its opening day yet; ski season usually starts in late November or December, so check before you book.`;
  if (firstDate) {
    if (s && firstDate >= s.from && firstDate <= s.to) return reopen ? `${resort.name} opens for the season on ${nice(reopen)} — your dates are before it opens, so check before you book.` : unannounced;
    return null;
  }
  const month = ctx.seasonInfo && ctx.seasonInfo.named === 'month' ? ctx.seasonInfo.month : null;
  if (month && s) {
    const md = monthDate(month, s.from);
    if (md >= s.from && md <= s.to) return reopen ? `${resort.name} opens for the season on ${nice(reopen)}, so ${ctx.seasonInfo.monthName} is before the season starts — check before you book.` : unannounced;
    return null;
  }
  if (resort.seasonClosedToday) return reopen ? `${resort.name} is closed for the season right now and opens for the season on ${nice(reopen)}. This plan is for when the lifts are running.` : unannounced;
  return null;
}
// The month name when skiing was asked for on a date (or in a named month or season) with no lifts running, else null.
// Audit fix (2026-10-27): the day the request named ("this Saturday", "tomorrow") counts like a date, and a date before
// the resort's own opening day (Big White opens Nov 26) is off season too, with that day in the note.
function skiOpeningFor(facts, regions, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const resorts = skiResorts(facts || []);
  const wanted = new Set((regions || []).flatMap((r) => [r, SKI_REGION_FOR_TOWN[r]]).filter(Boolean));
  const list = resorts.filter((v) => !wanted.size || wanted.has(v.region)).sort((a, b) => a.id - b.id);
  const r = list.find((v) => v.seasonClosed && date >= v.seasonClosed.from && date <= v.seasonClosed.to);
  const opens = r && seasonReopening(r);
  return r && opens && opens > date ? { name: r.name, date: opens } : null;
}
function skiOffSeasonMonth(text, intent, requirements, tripDate, namedDate, opening) {
  const t = normWords(text);
  if (!SKI_WORDS_RE.test(t) || /\b(?:water ?ski|jet ?ski)/.test(t)) return null;
  const day = requirements && /^\d{4}-\d{2}-\d{2}$/.test(requirements.startDate || '') ? requirements.startDate : /^\d{4}-\d{2}-\d{2}$/.test(namedDate || '') ? namedDate : null;
  if (day && opening && opening.date > day) return MONTH_NAMES[Number(day.slice(5, 7)) - 1];
  // The visitor's dates, else the month or season they named; an undated ski trip is for when the lifts run.
  const month = day ? Number(day.slice(5, 7))
    : intent && Number.isInteger(intent.month) ? intent.month
    : intent && SEASON_REP_MONTH[intent.season] && intent.season !== 'off' ? (/^\d{4}-\d{2}-\d{2}$/.test(tripDate || '') && SEASON_BY_MONTH[Number(tripDate.slice(5, 7))] === intent.season ? Number(tripDate.slice(5, 7)) : SEASON_REP_MONTH[intent.season])
    : null;
  return month && SKI_OFF_MONTHS.includes(month) ? MONTH_NAMES[month - 1] : null;
}
function skiOffSeasonNote(month, opening) {
  if (opening && /^\d{4}-\d{2}-\d{2}$/.test(opening.date || '')) return `${opening.name} opens for the season on ${MONTH_NAMES[Number(opening.date.slice(5, 7)) - 1]} ${Number(opening.date.slice(8, 10))}, so skiing isn’t part of this ${month} plan.`;
  return `The Okanagan’s ski hills usually run from December to early April, so skiing isn’t part of this ${month} plan.`;
}
function buildSkiDays(facts, ctx, days, pinned) {
  const text = ctx.requirements?.text ? normWords(ctx.requirements.text) : ctx.queryText || '';
  const dayRegions = skiDayRegions(facts, ctx, days);
  const resorts = skiResorts(facts);
  const byId = new Map(facts.map((v) => [v.id, v]));
  const baseCache = new Map();
  const base = (v) => { if (!baseCache.has(v.id)) baseCache.set(v.id, scoreVenue(v, ctx)); return baseCache.get(v.id); };
  // The resort itself is planned even while it is closed today (the warning says when it opens);
  // everything else follows the usual rules, with seasonal closures judged on the ski dates below.
  const seasonCtx = ctx.requirements ? ctx : { ...ctx, requirements: { items: [] } };
  const pool = facts.filter((v) => eligible(v, seasonCtx, false));
  const used = new Set(pinned ? Object.values(pinned) : []);
  const warnings = [];
  const notes = [];
  const out = [];
  const dayparts = ['morning', 'midday', 'afternoon', 'evening'];
  // Village dining is judged for the ski season (2026-10-18): an undated ski trip is "for when the lifts are running",
  // so a restaurant that is closed until the resort opens still counts; a named month is judged in that month.
  const plusDays = (iso, n) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
  const firstResort = resorts.find((v) => v.region === dayRegions[0]);
  const datedTrip = !!(ctx.requirements && ctx.requirements.startDate);
  const seasonStart = datedTrip || !ctx.tripDate ? null
    : ctx.seasonInfo && ctx.seasonInfo.named === 'month' ? monthDate(ctx.seasonInfo.month, ctx.tripDate)
    : firstResort && firstResort.seasonClosedToday ? (seasonReopening(firstResort) || `${ctx.tripDate.slice(0, 4)}-12-15`) : null;
  for (let d = 1; d <= days; d++) {
    const region = dayRegions[d - 1];
    const date = seasonStart ? plusDays(seasonStart, d - 1) : dayDate(ctx, d);
    // A kept stop wins over the Swap exclusion (2026-10-19): the same place on another day (the ski resort, a repeated
    // village dinner) is still kept when one copy of it is swapped.
    const pin = (part) => { const id = pinned && pinned[`${d}-${part}`]; const v = id && byId.get(id); return v || null; };
    const resort = pin('morning') || resorts.filter((v) => v.region === region && !ctx.exclude.has(v.id)).sort((a, b) => a.id - b.id)[0] || null;
    const stops = [];
    if (resort) {
      // Only a date the visitor gave counts as "your dates" (ctx.tripDate is today when none was given).
      const note = skiSeasonNote(resort, ctx, ctx.requirements && ctx.requirements.startDate ? date : null);
      if (note && !notes.includes(note)) notes.push(note);
      // The resort is the point of a ski day (2026-10-19): it has no Swap (Swap on it returned a 409).
      // Round 8 (2026-10-19): the ski day runs about 9 to 3:30 (skiDay), with lunch on the hill in the middle of it.
      stops.push({ ...themeStop(ctx, 'morning', resort, base(resort), null, [{ code: 'theme', text: `A ski day at ${resort.name}`, weight: 6 }], note ? [note] : []), noSwap: true, skiDay: true });
    } else {
      stops.push({ daypart: 'morning', label: PLAN_DAYPART_LABELS.morning, venue: null, reasons: [], why: [], caveats: [] });
      warnings.push(`No ski resort is listed on Okanagan Roam${region ? ` in ${regionLabel(ctx, region)}` : ''}.`);
    }
    // Round 7 (2026-10-19): a village place closed for the off-season today lists its off-season hours (or none); on a
    // ski-season date those hours say nothing about when it is open, so they are not used to rule it out.
    const skiDate = date && SKI_SEASON_MONTHS.includes(Number(date.slice(5, 7)));
    const dayPool = pool.filter((v) => v.region === region && v.id !== (resort && resort.id) && !seasonClosedOnTrip(v, { date }) && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate))
      .map((v) => (skiDate && v.seasonClosedToday && SKI_HILL_REGIONS.includes(v.region) && v.hours ? { ...v, hours: null, _hours: undefined } : v));
    // "A nice dinner" is $$$ or fine dining at the hill where there is one, and says so when there isn't (2026-10-18).
    const dinnerOpts = { base, apres: true, nice: requestsNiceDinner(text), strictNice: requestsSpecialDinner(text) || requestsNiceDinner(text), text, nearName: resort ? resort.name : null };
    // That dinner is kept for the evening, not spent on lunch.
    // Round 12 (2026-10-20): every day's dinner is set aside first, so lunch never takes the hill's last unused dinner spot.
    const niceDinner = !pin('evening') ? pickMeal(dayPool, ctx, d, 'evening', resort, used, dinnerOpts) : null;
    const lunchPin = pin('midday');
    const lunchOpts = { base, apres: true, text, nearName: resort ? resort.name : null };
    // A village with only enough dinner spots for the nights left keeps them for dinner; lunch is a café or the like.
    const dinnerSpots = dayPool.filter((v) => v.type === 'restaurant' && !used.has(v.id)).map((v) => v.id);
    const keepForDinner = dinnerSpots.length <= days - d + 1 ? dinnerSpots : [];
    let lunch = lunchPin ? { v: lunchPin, reasons: base(lunchPin).reasons, fit: null } : (keepForDinner.length ? pickMeal(dayPool, ctx, d, 'midday', resort, new Set([...used, ...keepForDinner, ...(niceDinner ? [niceDinner.v.id] : [])]), lunchOpts) : null) || pickMeal(dayPool, ctx, d, 'midday', resort, niceDinner ? new Set([...used, niceDinner.v.id]) : used, lunchOpts);
    // A small village: an earlier day's lunch spot again, rather than this evening's dinner or no lunch.
    let lunchRepeat = false;
    if (!lunch && !lunchPin) {
      const again = new Set([...stops.map((x) => x.venue && x.venue.id).filter(Boolean), ...(niceDinner ? [niceDinner.v.id] : []), ...[...used].filter((id) => { const v = byId.get(id); return !v || !['restaurant', 'cafe', 'pub'].includes(v.type); })]);
      lunch = pickMeal(dayPool, ctx, d, 'midday', resort, again, { ...lunchOpts, cafeOnly: true }) || pickMeal(dayPool, ctx, d, 'midday', resort, again, lunchOpts); lunchRepeat = !!lunch;
    }
    if (lunch) { used.add(lunch.v.id); stops.push({ ...themeStop(ctx, 'midday', lunch.v, { reasons: lunch.reasons }, lunch.fit, resort ? [{ code: 'meal', text: 'Lunch on the hill, between runs', weight: 3 }] : [], lunchRepeat ? ['Also planned on an earlier day — few lunch spots at the hill are listed on Okanagan Roam'] : []), ...(resort ? { onHill: true } : {}) }); }
    // An optional winter activity after skiing: tube park, skating, a sleigh ride (one each day, never repeated).
    const extraPin = pin('afternoon');
    // With kids (2026-10-18): the tube park, skating or snowshoe trails, never a snowmobile club, fat bikes or a snowcat.
    const kidsSkip = (v) => ctx.kids && /\b(?:snowmobile|snowmobiling|fat bike|snowcat|backcountry|cat skiing|heli)\b/.test(`${v.textName || ''}`);
    // Round 8: after the lifts close (about 3:30), a short winter day leaves only the lit evening activities -- the tube
    // park, skating, a sleigh ride -- not a snowshoe trail in the dark.
    const light = date && resort ? tripRequirements.estimateDaylight(date, resort) : null;
    const darkAfterSki = !!(light && light.sunsetMinutes < SKI_DAY_END + 90);
    const extra = extraPin ? { v: extraPin } : themePick(dayPool.filter((v) => ['outdoor', 'tour'].includes(v.type) && !used.has(v.id) && SKI_EXTRA_RE.test(`${v.textName || ''}`) && !/\bdinner\b/.test(v.textName || '') && !kidsSkip(v) && (!darkAfterSki || SKI_LIT_RE.test(v.textName || ''))).map((v) => ({ v, score: base(v).score + (/\b(?:tube|tubing|skating|rink|sleigh)\b/.test(v.textName || '') ? 6 : 0) + (ctx.kids && /\b(?:tube|tubing|skating|rink|snowshoe|sleigh)\b/.test(v.textName || '') ? 10 : 0) })));
    if (extra) { used.add(extra.v.id); stops.push({ ...themeStop(ctx, 'afternoon', extra.v, base(extra.v), null, [{ code: 'theme', text: 'Optional: something different after the lifts close', weight: 2 }], ['Optional — skip it to keep skiing']), afterSki: true, ...(SKI_LIT_RE.test(extra.v.textName || '') ? { lit: true } : {}) }); }
    const dinnerPin = pin('evening');
    let dinner = dinnerPin ? { v: dinnerPin, reasons: base(dinnerPin).reasons, fit: null } : pickMeal(dayPool, ctx, d, 'evening', resort, used, dinnerOpts);
    let repeat = false;
    // A small village with few dinner spots listed: an earlier night's spot again, rather than no dinner.
    if (!dinner) { dinner = pickMeal(dayPool, ctx, d, 'evening', resort, new Set(stops.map((x) => x.venue && x.venue.id).filter(Boolean)), dinnerOpts); repeat = !!dinner; }
    // 2026-10-19: an earlier night's restaurant again, rather than a pub nobody asked for.
    if (dinner && dinner.v.type !== 'restaurant' && !dinnerPin && !/\b(?:pubs?|bars?|apres|après|taps?|taprooms?)\b/.test(text)) {
      const again = pickMeal(dayPool, ctx, d, 'evening', resort, new Set(stops.map((x) => x.venue && x.venue.id).filter(Boolean)), dinnerOpts);
      if (again && again.v.type === 'restaurant') { dinner = again; repeat = true; }
    }
    if (dinner) { used.add(dinner.v.id); stops.push(themeStop(ctx, 'evening', dinner.v, { reasons: dinner.reasons }, dinner.fit, [], (dinner.caveats || []).concat(repeat ? ['Also planned on an earlier evening — few dinner spots at the hill are listed on Okanagan Roam'] : []))); }
    else { stops.push({ daypart: 'evening', label: PLAN_DAYPART_LABELS.evening, venue: null, reasons: [], why: [], caveats: [] }); warnings.push(`No dinner spot open that evening was found at the hill for day ${d}.`); }
    out.push({ day: d, region, regionLabel: region ? regionLabel(ctx, region) : null, stops: stops.sort((x, y) => dayparts.indexOf(x.daypart) - dayparts.indexOf(y.daypart)), missingFocus: [] });
  }
  return { days: out, warnings, dayparts, themed: 'ski', notes };
}

function nearbyFocusVenue(facts, ctx, f) {
  if (!ctx.regions.length || !f.key.startsWith('food:')) return null;
  const at = (r) => ROUTE_CORRIDOR.indexOf(ROUTE_CORRIDOR.includes(r) ? r : ROUTE_OFF_CORRIDOR[r]);
  const here = ctx.regions.map(at).filter((i) => i >= 0);
  if (!here.length) return null;
  const gap = (v) => Math.min(...here.map((i) => Math.abs(at(v.region) - i)));
  const term = f.key.slice(5), dish = DISH_WORDS_RE.test(term);
  // How well it matches: in its name or cuisine beats a passing mention in its description.
  const fit = (v) => { const m = foodMatch(v, { term, cuisine: null }) || {}; return (m.inName ? 3 : 0) + (m.inCui || m.cuisine ? 2 : 0) + (m.inDesc ? 1 : 0); };
  const options = facts.filter((v) => !ctx.regions.includes(v.region) && at(v.region) >= 0 && gap(v) <= 3 && f.test(v) && (!dish || (['cafe', 'restaurant'].includes(v.type) && fit(v) >= 2)) && eligible(v, { ...ctx, regions: [] }, false));
  options.sort((a, b) => gap(a) - gap(b) || fit(b) - fit(a) || (Number(b.rating) || 0) - (Number(a.rating) || 0));
  return options[0] || null;
}
// How a searched word reads in a summary (2026-10-28, Dayton: 'focused on wineries and “cozy”' looked broken): its
// label from data/vocabulary/shared.json ("cozy spots"), nothing for a word with an empty label ("south" once the
// area is understood), otherwise the word as typed, in quotes.
const TERM_LABELS = require('./vocabulary.js').sharedTable('termLabels');
function termText(term) {
  const l = TERM_LABELS[term];
  if (l && typeof l.en === 'string') return l.en;
  return `“${term}”`; // a dish or word the visitor typed, shown as typed
}
function focusText(ctx, key) {
  if (key.startsWith('kind:')) return tripRequirements.LABELS[key.slice(5)] || key.slice(5);
  const [kind, value] = key.split(':');
  if (kind === 'type') return typeLabel(ctx, value).toLowerCase();
  if (kind === 'activity') return activityLabel(ctx, value);
  if (kind === 'collection') return collectionLabel(ctx, value);
  if (kind === 'food') return termText(value) || value;
  if (kind === 'lake') return 'a lake-view, beach or water stop';
  return value;
}

// ---------- summary ----------

function interestsText(ctx) {
  const items = [];
  for (const t of ctx.types) items.push(typeLabel(ctx, t).toLowerCase());
  for (const a of ctx.activities) items.push(activityLabel(ctx, a));
  for (const c of ctx.collections) items.push(collectionLabel(ctx, c));
  for (const ft of ctx.foodTerms) { const t = termText(ft.term); if (t) items.push(t); }
  for (const f of ctx.features) items.push((ctx.labels.featureNouns && ctx.labels.featureNouns[f]) || featureLabel(ctx, f).toLowerCase());
  return items;
}
function whereText(ctx) {
  return ctx.regions.length ? listText(ctx.regions.map((r) => regionLabel(ctx, r))) : 'the Okanagan';
}

// The time the visitor asked about, in their terms: "tonight",
// "tomorrow morning", "on Saturday afternoon".
function whenText(ctx) {
  const w = ctx.when;
  if (!w) return '';
  const part = ctx.whenDaypart;
  if (w.preset === 'today' && w.now) return 'right now';
  if (w.preset === 'today') return part === 'evening' ? 'tonight' : part ? `this ${part}` : 'today';
  if (w.relative === 'tomorrow') return part ? `tomorrow ${part}` : 'tomorrow';
  if (w.weekday) return `on ${w.weekday[0].toUpperCase()}${w.weekday.slice(1)}${part ? ` ${part}` : ''}`;
  if (w.preset === 'this-weekend') return 'this weekend';
  return '';
}
function buildSummary(kind, ctx, days) {
  const interests = interestsText(ctx);
  const when = whenText(ctx);
  const at = when ? ` ${when}` : '';
  const focus = interests.length ? `, focused on ${listText(interests)}` : '';
  const occ = ctx.occasion ? OCCASION_LABELS[ctx.occasion] : null;
  let text;
  if (kind === 'multi_day' || kind === 'day_plan') {
    const n = days === 1 ? 'A one-day plan' : `${days} ${ctx.pace === 'standard' ? '' : `${ctx.pace} `}days`;
    text = `${n} around ${whereText(ctx)}${focus}${occ ? ` — planned as ${article(occ)}` : ''}.`;
  } else if (kind === 'outing') {
    text = `${occ ? article(occ, true) : 'An outing'} in ${whereText(ctx)}${at}${focus}.`;
  } else if (kind === 'recommendations' || kind === 'discover') {
    if (ctx.foodTerms.length && !ctx.types.size) text = `Places that mention ${listText(ctx.foodTerms.map((f) => `“${f.term}”`))} in ${whereText(ctx)}${at}${ctx.superlative ? ', ranked by how closely they match and by their ratings' : ''}.`;
    else text = `${interests.length ? `${listText(interests).replace(/^./, (c) => c.toUpperCase())} in ${whereText(ctx)}` : `Ideas for ${whereText(ctx)}`}${at}${occ ? ` for ${article(occ)}` : ''}.`;
  } else if (kind === 'events') {
    text = `What’s on in ${whereText(ctx)}.`;
  } else {
    text = 'We couldn’t work out a plan from that request yet.';
  }
  return text;
}

function buildOverview(kind, ctx, days) {
  return {
    where: whereText(ctx),
    regions: ctx.regions.map((r) => ({ slug: r, label: regionLabel(ctx, r) })),
    days: kind === 'multi_day' || kind === 'day_plan' ? days : null,
    pace: kind === 'multi_day' || kind === 'day_plan' ? ctx.pace : null,
    interests: interestsText(ctx),
    occasion: ctx.occasion ? { value: ctx.occasion, label: OCCASION_LABELS[ctx.occasion] } : null,
    budget: ctx.budget,
    // Step 1 (2026-09-29), additive: the month or season named, as said.
    season: ctx.seasonInfo ? { label: ctx.seasonInfo.named === 'month' ? ctx.seasonInfo.monthName : ctx.seasonInfo.monthName.replace(/^the /, ''), named: ctx.seasonInfo.named } : null,
  };
}

// Step 1 (2026-09-29): what a named month/season changed, and the honest
// limit of the hours data (current listed hours only, never seasonal ones).
function seasonNotes(result, ctx) {
  const s = ctx.seasonInfo;
  if (!s) return;
  result.notes.push(`Planned for ${s.monthName}: seasonal places such as beaches, water activities, ski areas, campgrounds and outdoor golf are ranked for that time of year, and nothing is left out for the season alone.`);
  result.notes.push(`Hours shown are each place’s current listed hours on Okanagan Roam and can change by season, so check them before you go in ${s.monthName}.`);
}

// ---------- trip overview for day plans and outings (2026-09-27) ----------
//
// `headline`: a short name for the generated plan ("A relaxed 2-day Kelowna
// golf getaway"). `experience`: { title: 'What to expect', text } -- one or two
// sentences about what the plan holds. Built ONLY from facts already in the
// plan: the chosen stops' types, regions and parts of the day, the Lake View
// and dog-friendly facts on those venues, and the visitor's own words (days,
// pace, occasion, kids, dog). No adjectives about quality, no seasonal,
// distance, weather or opening claims. Multi-part itineraries keep their own
// "What to expect" (buildExperience) unchanged.
// Theme word for the headline when a requested or dominant stop type has one.
const OVERVIEW_THEME = { golf: 'golf', winery: 'wine', brewery: 'craft beer', distillery: 'distillery', beach: 'beach', outdoor: 'outdoors', cafe: 'cafe', cocktail: 'cocktail' };
// [one, many] noun phrases per stop type; restaurants are named by meal.
const OVERVIEW_NOUNS = {
  golf: ['a round of golf', 'rounds of golf'], winery: ['a winery visit', 'winery visits'], cafe: ['a coffee stop', 'coffee stops'],
  brewery: ['a craft brewery', 'craft breweries'], pub: ['a pub stop', 'pub stops'], cocktail: ['a cocktail bar', 'cocktail bars'],
  distillery: ['a distillery tasting', 'distillery tastings'], beach: ['a beach stop', 'beach stops'], outdoor: ['an outdoor stop', 'outdoor stops'],
  indoor: ['an indoor attraction', 'indoor attractions'], tour: ['a tour', 'tours'], sport: ['a game or match', 'games or matches'],
};
// Outing and multi-day nouns for an occasion the visitor named.
const OVERVIEW_OUTING_NOUN = { date_night: 'date night', romantic: 'romantic evening', celebration: 'celebration', group_getaway: 'group night out', adults: 'adults-only evening' };
const OVERVIEW_TRIP_NOUN = { relaxing: 'getaway', romantic: 'romantic getaway', celebration: 'celebration', group_getaway: 'group getaway', adventure: 'adventure trip', adults: 'adults-only trip' };
// "A one-day ..." (the article helper would say "an" before any vowel).
const overviewArticle = (phrase) => (/^one\b/i.test(phrase) ? `A ${phrase}` : article(phrase, true));
const OVERVIEW_MEALS = { morning: ['breakfast', 'breakfasts'], midday: ['a lunch', 'lunches'], afternoon: ['a lunch', 'lunches'], evening: ['a dinner', 'dinners'] };
function overviewStops(result) {
  if (result.outing) return result.outing.stops.filter((s) => s.venue);
  return result.days.flatMap((d) => d.stops.filter((s) => s.venue));
}
function overviewCount(n, [one, many]) {
  if (n === 1) return one;
  return `${COUNT_WORDS[n] || n} ${many}`;
}
function buildPlanOverview(kind, result, ctx, facts) {
  const stops = overviewStops(result);
  if (!stops.length) return { headline: null, experience: null };
  const byId = new Map(facts.map((v) => [v.id, v]));
  const factOf = (s) => byId.get(s.venue.id) || null;
  const towns = Array.from(new Set(stops.map((s) => s.venue.regionLabel).filter(Boolean)));
  const where = towns.length === 1 ? towns[0] : towns.length === 2 ? `${towns[0]} and ${towns[1]}` : 'Okanagan';
  // Theme: a requested type the plan actually includes, else a non-food type
  // that makes up at least half of the stops.
  const counts = {};
  for (const s of stops) counts[s.venue.type] = (counts[s.venue.type] || 0) + 1;
  const requested = Object.keys(OVERVIEW_THEME).filter((t) => ctx.types.has(t) && counts[t]);
  const dominant = Object.keys(OVERVIEW_THEME).filter((t) => t !== 'cafe' && counts[t] * 2 >= stops.length).sort((a, b) => counts[b] - counts[a]);
  const themeType = requested.length === 1 ? requested[0] : (requested.length === 0 && dominant.length ? dominant[0] : null);
  const theme = themeType ? OVERVIEW_THEME[themeType] : (ctx.activities.has('hiking') && (counts.outdoor || 0) * 2 >= stops.length - (counts.restaurant || 0) - (counts.cafe || 0) && counts.outdoor ? 'hiking' : null);
  const roadTrip = kind !== 'outing' && ctx.dayRegionPlan && /^Planned as a road trip/.test(ctx.dayRegionPlan.note || '') && result.days.length > 1;
  const pace = ctx.pace === 'relaxed' ? 'relaxed' : ctx.pace === 'packed' ? 'full' : null;
  const party = ctx.kids ? ' with the family' : isDogTrip(ctx) ? ' with your dog' : '';
  // Round 7: a vegan (vegetarian, gluten-free) food day and a Halloween weekend say so.
  const dietWord = { vegan: 'vegan', vegetarian: 'vegetarian', gluten_free: 'gluten-free' };
  const diet = Object.keys(dietWord).find((f) => ctx.features.includes(f) || (ctx.requirements?.items || []).some((i) => i.kind === 'feature' && i.value === f && i.strength === 'must'));
  const dining = stops.filter((s) => DINING_TYPES.includes(s.venue.type));
  const dietTheme = diet && dining.length >= 2 && (counts.restaurant || 0) + (counts.cafe || 0) >= stops.length / 2 ? `${dietWord[diet]} food` : null;
  const holiday = holidayTheme(ctx.requirements?.text || ctx.queryText || '');
  const holidayHit = holiday && (result.days || []).some((d) => d.stops.some((s) => s.event && holiday.re.test(normWords(s.event.name || ''))));
  let headline;
  if (kind === 'outing') {
    const noun = (ctx.occasion && OVERVIEW_OUTING_NOUN[ctx.occasion]) || 'outing';
    headline = `${overviewArticle(noun)} in ${where}${party}`;
  } else {
    const days = result.days.length;
    const length = days === 1 ? 'one-day' : `${days}-day`;
    const noun = roadTrip ? 'road trip' : theme && days > 1 ? 'getaway' : ((ctx.occasion && OVERVIEW_TRIP_NOUN[ctx.occasion]) || 'trip');
    const place = roadTrip ? `${result.days[0].regionLabel || towns[0]} to ${result.days[days - 1].regionLabel || towns[towns.length - 1]}` : where;
    const shownTheme = roadTrip ? null : holidayHit ? holiday.label : dietTheme || theme;
    headline = `${overviewArticle([pace, length, place, shownTheme, noun].filter(Boolean).join(' '))}${party}`;
  }
  // What the plan holds, counted from the stops: restaurants by meal, the
  // rest by type, in order of first appearance.
  const phrases = new Map();
  for (const s of stops) {
    let key, forms;
    if (s.venue.type === 'restaurant') { const meal = OVERVIEW_MEALS[s.daypart] || ['a meal', 'meals']; key = `meal:${meal[1]}`; forms = meal; }
    // Round 10 (2026-10-19): a golf simulator is an indoor golf session, never "a round of golf".
    else if (s.venue.indoorGolf) { key = 'indoor_golf'; forms = ['an indoor golf session', 'indoor golf sessions']; }
    else { key = s.venue.type; forms = OVERVIEW_NOUNS[s.venue.type] || ['a stop', 'stops']; }
    if (!phrases.has(key)) phrases.set(key, { forms, n: 0 });
    phrases.get(key).n += 1;
  }
  const list = Array.from(phrases.values()).map((p) => overviewCount(p.n, p.forms));
  // Round 12 (2026-10-20): the events in the plan are named, with their own towns ("all in Vernon" was wrong when the
  // Garth Brooks tribute is in Lake Country, and the market plans never said they had markets).
  const eventStops = [];
  for (const d of result.days || []) for (const st of d.stops || []) if (st.event && st.event.name && !eventStops.some((x) => x.event.id === st.event.id)) eventStops.push(st);
  const eventTown = (e) => (e.valleyWide || !e.region ? null : regionLabel(ctx, e.region));
  const allTowns = towns.concat(eventStops.map((st) => eventTown(st.event)).filter((t) => t && !towns.includes(t)).filter((t, i, a) => a.indexOf(t) === i));
  const placeText = allTowns.length === 1 ? `, all in ${allTowns[0]}` : allTowns.length > 1 ? `, across ${listText(allTowns)}` : '';
  const sentences = [`${cap(listText(list))}${placeText}.`];
  if (eventStops.length) {
    const shown = eventStops.slice(0, 3);
    const byTown = [];
    for (const st of shown) { const t = eventTown(st.event); let g = byTown.find((x) => x.town === t); if (!g) byTown.push(g = { town: t, names: [] }); g.names.push(theName(st.event.name)); }
    const parts = byTown.map((g) => `${listText(g.names)}${g.town ? `${g.names.length > 1 ? ',' : ''} in ${g.town}` : ''}`);
    const more = eventStops.length - shown.length;
    sentences.push(`It includes ${parts.length > 1 ? `${parts.slice(0, -1).join('; ')} and ${parts[parts.length - 1]}` : parts[0]}${more ? `, and ${more} more event${more > 1 ? 's' : ''}` : ''}.`.replace(/([^.])\.\.$/, '$1.'));
  }
  // One optional second sentence, from facts on the chosen venues.
  const venues = stops.map(factOf).filter(Boolean);
  const dogOk = (v) => v.features.dog_friendly || v.collections.includes('dog_friendly');
  const lake = stops.filter((s) => { const v = factOf(s); return v && v.features.lake_view; }).map((s) => s.venue.name);
  const dietOk = (v) => !!(v && v.features && v.features[diet]);
  if (dietTheme && dining.every((s) => dietOk(factOf(s)))) sentences.push(`Every place to eat has the ${diet === 'gluten_free' ? 'Gluten-Free-Friendly' : diet === 'vegan' ? 'Vegan-Friendly' : 'Vegetarian-Friendly'} badge.`);
  else if (isDogTrip(ctx) && venues.length === stops.length && venues.every(dogOk)) sentences.push(stops.length > 1 ? 'Every stop is listed as dog friendly, so your dog can come along.' : 'It’s listed as dog friendly, so your dog can come along.');
  else if (lake.length === 1) sentences.push(`${lake[0]} has the Lake View badge.`);
  else if (lake.length > 1) sentences.push(`${lake.length === stops.length ? 'Every stop has' : `${cap(COUNT_WORDS[lake.length] || String(lake.length))} of the stops have`} the Lake View badge.`);
  return { headline, experience: { title: EXPERIENCE_TITLE, text: sentences.join(' ') } };
}

// ---------- entry point ----------
//
// planTrip({ intent, facts, labels, seed, excludeIds, avoidIds, pinned, events })
//   facts:  verified venue facts from the database (see server.js)
//   events: already-selected What's On items for an events request (or [])
//   pinned: { "<day>-<daypart>": venueId } -- stops to keep when one stop is
//           removed and replaced
// Offer a bounded, conservative subset of an existing single-day plan.
// Unknown timings never count as zero; named/locked priorities cannot be dropped.
function fitTimeBudget(result, input, requirements) {
  const duration = requirements.items.find(i => i.kind === 'duration');
  if (!duration || result.days.length > 1) return result;
  const facts = input.facts || [];
  const estimate = p => tripRequirements.estimateTripTiming({plan:p,facts,requirements,tripDate:input.tripDate})[0];
  const full = estimate(result);
  if (!full || full.complete && full.maxMinutes <= duration.value) return result;
  const original = tripRequirements.selectedStops(result).filter(s=>s.venue || s.event);
  const filtered = ids => {
    const p = JSON.parse(JSON.stringify(result));
    const keep = s => s.venue && ids.has(s.venue.id);
    if (p.days.length) p.days.forEach(d=>{d.stops=d.stops.filter(keep);});
    if (p.itinerary) p.itinerary.stops=p.itinerary.stops.filter(keep);
    if (p.outing) {p.outing.stops=p.outing.stops.filter(keep);p.outing.alternates=[];}
    p.events=[];
    scheduleTripByHours(p,input,requirements);
    return p;
  };
  const venues = original.filter(s=>s.venue);
  const protectedIds = new Set([...Object.values(input.pinned || {}),...requirements.items.filter(i=>i.kind==='venue').map(i=>i.value)]);
  const priorityItems = requirements.items.filter(i=>/\b(?:must|priority|most important|do not skip)\b/.test(i.sourceText||'') && ['type','venue_kind','activity'].includes(i.kind));
  let best = null;
  if (venues.length <= 12 && !original.some(s=>s.event)) {
    for (let mask=1;mask<(1<<venues.length);mask++) {
      const ids=new Set(venues.filter((s,n)=>mask&(1<<n)).map(s=>s.venue.id));
      if ([...protectedIds].some(id=>!ids.has(id))) continue;
      const p=filtered(ids), t=estimate(p);
      if (!t?.complete || t.maxMinutes>duration.value || p.schedule?.some(s=>s.status!=='estimated')) continue;
      const checks=tripRequirements.evaluateTripRequirements({requirements,plan:p,facts,tripDate:input.tripDate});
      if(priorityItems.some(i=>!checks.some(c=>c.id===i.id&&c.status==='satisfied')))continue;
      const score=checks.filter(i=>['type','venue_kind','activity','rainy','type_count'].includes(i.kind)&&i.status==='satisfied').length*100+ids.size;
      if (!best || score>best.score) best={p,t,ids,score};
    }
  }
  const omitted=best?original.filter(s=>!s.venue||!best.ids.has(s.venue.id)).map(s=>s.venue?.name||s.event?.name):[];
  const budget={minutes:duration.value,extensionMinutes:full.complete&&!result.schedule?.some(s=>s.status!=='estimated')?Math.ceil(full.maxMinutes/15)*15:null,shorter:best?{estimate:best.t,omitted,stops:tripRequirements.selectedStops(best.p).filter(s=>s.venue).map(s=>s.venue.name)}:null,selected:input.budgetMode==='shorter'&&!!best};
  if (!budget.selected) {result.timeBudget=budget;return result;}
  const p=best.p;
  p.summary='Shorter itinerary for your time budget';p.headline=p.summary;
  p.experience={title:'A shorter outing',text:'Selected stops: '+budget.shorter.stops.join(', ')+'. Left out to fit your estimated time budget: '+omitted.join(', ')+'.'};
  p.warnings=[...(p.warnings||[]),'Left out to fit your estimated time budget: '+omitted.join(', ')+'. Actual routes and opening-hour sequencing still need confirmation.'];
  p.timeBudget=budget;
  return p;
}

function scheduleTripByHours(plan, input, requirements, options = {}) {
  if ((!requirements.startDate && requirements.startMinutes == null) || ['recommendations','discover','events'].includes(plan.kind)) return;
  plan.notes=(plan.notes||[]).filter(n=>!n.startsWith('A later assumed start reduces waiting'));
  const baseDate=requirements.startDate||input.tripDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(baseDate||'')||!Number.isFinite(Date.parse(baseDate+'T12:00:00Z')))return;
  const facts=input.facts||[],byId=new Map(facts.map(v=>[v.id,v]));
  const softPins=swapSoftPins(input);
  const groups=plan.days.length?plan.days.map(d=>({day:d.day,date:d.date,stops:d.stops})):[{day:1,stops:plan.itinerary?.stops||plan.outing?.stops||[]}];
  const clock=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  plan.warnings=(plan.warnings||[]).filter(w=>!(plan.scheduleWarnings||[]).includes(w));
  plan.scheduleWarnings=[];plan.schedule=[];
  for(const group of groups)for(const s of group.stops){s.caveats=(s.caveats||[]).filter(c=>c!==s.scheduleNote);delete s.waitMinutes;}
  for(const group of groups){
    const date=group.date||new Date(new Date((requirements.startDate||input.tripDate)+'T12:00:00Z').getTime()+(group.day-1)*86400000).toISOString().slice(0,10);
    const weekday=['sun','mon','tue','wed','thu','fri','sat'][new Date(date+'T12:00:00Z').getUTCDay()];
    const first=group.stops.find(s=>s.venue||s.event);
    const dayStart=requirements.dayStartMinutes?.[group.day];
    const assumed=dayStart==null&&requirements.startMinutes==null;
    let dayToConfirm=false;
    let skiWindow=null;
    let cursor=dayStart??options.startMinutes??requirements.startMinutes??({morning:540,midday:720,afternoon:780,evening:1080}[first?.daypart]||({morning:540,afternoon:780,evening:1080}[requirements.daypart])||540),previous=null,provisional=false;
    // Round 7 (2026-10-19): a road trip's day that opens with a long drive leaves around 9 AM and starts its first stop
    // after the drive ("leave about 6:33 AM" for a 9 AM hike in Osoyoos after Vernon).
    const driveIn=plan.days.find(d=>d.day===group.day)?.driveIn;
    if(driveIn&&driveIn.maxMinutes>=30&&dayStart==null&&cursor<=600)cursor=Math.ceil((Math.max(cursor,540)+driveIn.maxMinutes)/15)*15;
    if(assumed&&first?.venue&&/\b(?:dinner|supper)\b/i.test(first.label||'')){
      const anchor=group.stops.find(s=>s.event),start=anchor&&parseEventStart(anchor.event.time);
      if(start!=null&&start>=1020)cursor=Math.min(cursor,900);
    }
    // 2026-10-19: lunch right before an event that starts at lunchtime (a noon Halloween trail) cannot fit before it
    // with travel and the arrival allowance, so it was a "Timing conflict"; lunch moves to after the event instead.
    for(let i=0;i<group.stops.length-1;i++){
      const lunch=group.stops[i],next=group.stops.slice(i+1).find(s=>s.venue||s.event);
      if(!isLunchStop(lunch)||!next?.event||next.dropIn)continue;
      const start=parseEventStart(next.event.time);
      if(start==null||start<660||start>780)continue;
      const j=group.stops.indexOf(next);
      if(/^(?:midday|afternoon)$/i.test(lunch.label||'')&&/^(?:midday|afternoon)$/i.test(next.label||''))[lunch.label,next.label]=[next.label,lunch.label];
      group.stops.splice(j,1);group.stops.splice(i,0,next);i++;
    }
    for(const stop of group.stops){
      if(!stop.venue&&!stop.event)continue;
      // Listed event times are fixed anchors, never estimated visit lengths.
      // Event-to-venue travel is not inferred from a region or venue name.
      if(stop.event){
        let start=parseEventStart(stop.event.time),end=eventEndMinutes(stop.event,start),assumedEnd=false;
        // Round 7: no listed end time -> an allowance for the kind of event, so the rest of the day can be timed.
        if(start!=null&&end==null&&!stop.dropIn){end=start+eventAllowanceMinutes(stop.event);assumedEnd=true;}
        const walking=requirements.items.some(i=>i.kind==='transport'&&(!tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)||tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)===group.day));
        const location=stop.event.location,transfer=previous?tripRequirements.estimateTransfer(previous,location,walking):null;
        const locationKnown=tripRequirements.estimateTransfer(location,location)!=null;
        // A drop-in family event (open 10-4) starts when the day reaches it and lasts about 2.5 hours (2026-10-18).
        const listedStart=start,listedEnd0=end;
        // An untimed family event (2026-10-19) gets the afternoon planning window, marked provisional, so the rest of the
        // day is still timed.
        if(stop.untimedVisit&&start==null&&cursor!=null){start=Math.max(780,Math.ceil((cursor+(transfer?.maxMinutes||20))/5)*5);end=start+(stop.visitMinutes||150);assumedEnd=true;}
        if(stop.dropIn&&start!=null&&end!=null){const listedEnd=end;start=Math.max(start,cursor!=null?cursor+(transfer?.maxMinutes||0):stop.daypart==='afternoon'?780:start);end=Math.min(listedEnd,start+(stop.visitMinutes||150));if(end-start<60){start=parseEventStart(stop.event.time);end=listedEnd;}}
        const late=!stop.dropIn&&!stop.untimedVisit&&start!=null&&previous&&cursor!=null&&cursor+(transfer?.maxMinutes||0)+30>start;
        const verified=start!=null&&end!=null&&!assumedEnd&&locationKnown&&(!previous||transfer)&&cursor!=null&&!provisional;
        // A listed start with an assumed length or an unmapped place is provisional, not "Timing unverified".
        const item={day:group.day,date,eventId:stop.event.id,status:late?'unmet':verified?'estimated':start!=null?'provisional':'unverified',assumedStart:false};
        if(start!=null)item.startMinutes=start;
        if(end!=null)item.endMinutes=end;
        if(assumedEnd)item.assumedEnd=true;
        if(transfer)Object.assign(item,{transferMinutes:transfer.maxMinutes,arrivalAllowanceMinutes:30});
        // 2026-10-19: a drop-in says when it is open and when the plan arrives ("Listed event start 13:35" read as if the
        // event began then).
        let note=start==null?'Event start time is not listed; confirm it before following this sequence.':stop.untimedVisit&&listedStart==null?`Event hours are not listed; planned visit about ${clock(start)}–${clock(end)} on ${date}. Check the times before you go.`:stop.dropIn&&listedStart!=null&&listedEnd0!=null?`Open ${clock(listedStart)}–${clock(listedEnd0)} on ${date}; planned arrival about ${clock(start)}, staying until about ${clock(end)}.`:`Listed event start ${clock(start)} on ${date}${assumedEnd?`; its end time isn’t listed, so about ${Math.round((end-start)/30)/2} hours are allowed`:end!=null?`; listed end ${clock(end)}`:'; event duration is not listed'}.`;
        if(late)note+=' The preceding visit and arrival allowance cannot fit before the listed start. Choose an earlier meal or move it after the event.';
        if(transfer||verified)note+=` Estimated ${transfer?.mode||'driving assumed'} travel${transfer?`: ${transfer.minMinutes===transfer.maxMinutes?`about ${transfer.maxMinutes}`:`${transfer.minMinutes}–${transfer.maxMinutes}`} minutes`:''}; allow 30 minutes for arrival. This is a planning estimate, not a verified road route.`;
        else if(start!=null&&end!=null)note+=' Event travel time is unverified; confirm the route and allow arrival time before the event. Later visits are timed from the end shown here.';
        else note+=` Event travel time is unverified; confirm the route and allow arrival time before the event. Visits after the event remain unverified until ${end!=null?'travel time is':'its duration and travel time are'} confirmed.`;
        stop.scheduleNote=note;stop.caveats=[...(stop.caveats||[]),note];plan.schedule.push(item);
        if(item.status==='unmet'){const warning=`${stop.event.name||'Event'}: ${note}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);}else if(item.status!=='estimated')dayToConfirm=true;
        // Round 7: the day carries on from the event's (listed or allowed) end; an unmapped event place is its town's centre.
        if(verified&&!late){cursor=end;previous=location;}
        else if(start!=null&&end!=null&&!late){cursor=end;previous=locationKnown?location:townCentre(facts,stop.event.region);provisional=true;}
        else {cursor=null;previous=null;}
        continue;
      }
      const nextEvent=group.stops.slice(group.stops.indexOf(stop)+1).find(s=>s.event);
      // Round 9 (2026-10-19): a drop-in event (open 10-4) has no fixed start, so the morning and lunch before it are not
      // squeezed in before its opening time ("Timing conflict" on lunch before O'Keefe Fall Weekends, 10 AM).
      const eventStart=nextEvent&&!nextEvent.dropIn?parseEventStart(nextEvent.event.time):null;
      // Round 7: a stop before a show always ends in time for it, with a start time chosen or not (dinner was booked
      // 18:00–19:30 on top of a 19:00 show when the Dates & start time control was set).
      const beforeEvent=eventStart!=null;
      let v=stop.venue&&byId.get(stop.venue.id);
      const fit=candidate=>{
        if(!candidate||cursor==null)return null;
        const one=tripRequirements.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:candidate.id}}]}},facts,requirements})[0];
        const storedHours=(candidate._hours||parseVenueHours(candidate.hours)).days[weekday];
        const listed = tripRequirements.listedOutdoorTiming(candidate);
        const textHours = (!storedHours || storedHours.status === 'unknown') && listed.hoursRange;
        const hours = textHours ? {status:'open', ranges:[listed.hoursRange]} : storedHours;
        const hiking=(candidate.activities||[]).includes('hiking');
        // 2026-10-19: a stop with no estimated visit length (a market, a garden) gets a planning allowance and is marked
        // provisional, rather than leaving it and every later stop of the day "Timing unverified".
        const guessed=!one?.complete&&!hiking;
        // Round 8: a late-afternoon filler is 60-90 minutes (a hike there is a shorter walk, not a three-hour climb).
        // Round 9: an indoor golf simulator is about two hours, not a four-hour round (and needs no daylight).
        // Round 10: a trail whose listing gives its length is timed by it (a 2.5 km round trip is about an hour, not 3 h).
        // Round 11 (2026-10-20): a trail's own length wins over the generic 90-180 minute hiking allowance (Grey Canal
        // and Naramata Creek were given 3 hours); a time the listing states still wins over both.
        // Round 12 (2026-10-20): any outdoor stop whose listing gives a trail length, not only those listed for hiking
        // (Naramata Creek's 2.5 km waterfall walk and Giant's Head with kids were still given 3 hours).
        const trailTime=(hiking||candidate.type==='outdoor')&&one?.visits?.[0]?.durationSource!=='listing'?trailMinutes(candidate):null;
        // 2026-10-28: a long day hike is timed as one (Rainbow Lake was 8-11 AM, then lunch at 11:30).
        const longHike=!trailTime&&one?.visits?.[0]?.durationSource!=='listing'?longDayHikeMinutes(candidate):null;
        let duration=Math.min(candidate.indoorGolf?120:1440,stop.gapFill||stop.afterSki?gapFillMinutes(candidate):trailTime||longHike||(one?.complete?one.maxMinutes:hiking?180:(VISIT_ALLOWANCE[candidate.type]||60)));
        // Round 14 (2026-10-20): a café that is the brunch or lunch stop is a meal (60-75 minutes), not a 40-minute coffee.
        if(candidate.type==='cafe'&&!stop.gapFill&&!stop.afterSki){if(/\b(?:brunch|breakfast)\b/i.test(stop.label||''))duration=Math.max(duration,75);else if(isLunchStop(stop))duration=Math.max(duration,60);}
        // Weekly audit (2026-10-25): "a drink first" is about an hour, not a 90-minute pub meal (date night in Vernon: a drink
        // 6-7:30 left no room for dinner at Gerni's, which closes at 9).
        // Weekly audit (2026-10-25): outside summer a beach is a walk by the water, about an hour, not a two-hour beach
        // morning (an Osoyoos beach day in late October ran 9 to 11, then waited for lunch).
        if(candidate.type==='beach'&&!stop.gapFill&&date&&!SEASON_WINDOWS.water.in.includes(Number(date.slice(5,7))))duration=Math.min(duration,60);
        if(/\bdrinks?\b/i.test(stop.label||'')&&['pub','cocktail','brewery','winery','distillery'].includes(candidate.type)&&!stop.gapFill&&!stop.afterSki)duration=Math.min(duration,60);
        // Round 11: before a fixed-time show, a walk or a visit leaves room for the meals between it and the show (lunch
        // before a 2 PM show was a "Timing conflict" after a three-hour morning trail).
        if(beforeEvent&&cursor!=null&&!isLunchStop(stop)&&!isDinnerStop(stop)&&SWAP_FLEX_TYPES.includes(candidate.type)){
          const between=group.stops.slice(group.stops.indexOf(stop)+1,group.stops.indexOf(nextEvent)).filter(s=>s.venue&&!s.event);
          const meals=between.filter(s=>isLunchStop(s)||isDinnerStop(s)).length;
          if(meals){
            const travel=tripRequirements.estimateTransfer(candidate,nextEvent.event.location)?.maxMinutes||20;
            const room=eventStart-30-travel-meals*75-(between.length-meals)*45-cursor-15;
            if(room>=45&&room<duration)duration=Math.floor(room/15)*15;
          }
        }
        const unknownHours=!hours||hours.status==='unknown';
        // A tasting room with no listed hours is timed from 11:00, never 09:00 (2026-10-18).
        const ranges=unknownHours?[[candidate.type==='winery'?660:0,1440]]:hours.ranges;
        if(hours?.status==='closed')return {bad:true};
        let transfer=0,guessedTransfer=false;
        if(previous){
          const walking=requirements.items.some(i=>i.kind==='transport'&&(!tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)||tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)===group.day));
          const journey=tripRequirements.estimateTransfer(previous,candidate,walking);
          // No stored location: a 20-minute allowance, provisional (2026-10-19), not an untimed rest of the day.
          transfer=journey?journey.maxMinutes:20;
          if(!journey)guessedTransfer=true;
        }
        const earliest=cursor+transfer;
        const eventTravel=beforeEvent?tripRequirements.estimateTransfer(candidate,nextEvent.event.location,requirements.items.some(i=>i.kind==='transport')):null;
        // Meal times (2026-10-19): with a start time given, the stops still run back to back, but lunch never starts
        // before 11:30 and dinner (an evening restaurant, labelled or not) never before 18:00 -- the gap is free time.
        // A dinner before an evening show starts early enough to make it, never before 16:30 (2026-10-18).
        // A dinner the visitor asked for before an early show ("dinner and the 6 pm game") may still start from 15:00.
        const dinnerFloor=beforeEvent?Math.max(plan.kind==='itinerary'&&/\b(?:dinner|supper)\b/i.test(stop.label||'')?900:990,Math.min(1080,Math.floor((eventStart-30-(eventTravel?.maxMinutes||0)-duration)/15)*15)):1080;
        // Round 9 (2026-10-19): an evening or night stop that is not dinner (a brewery, a lounge) stays in the evening,
        // from 5 PM; with a start time it was run back to back and moved to 1:35 PM.
        const partStart0=dayStart!=null || requirements.startMinutes!=null || plan.kind==='itinerary' ? (isDinnerStop(stop)?dinnerFloor:isLunchStop(stop)?(/\blunch\b/i.test(stop.label||'')?720:690):plan.kind!=='itinerary'&&['evening','night'].includes(stop.daypart)&&!beforeEvent?1020:0)
          : stop.daypart==='evening'&&beforeEvent ? dinnerFloor
          : ({midday:720,afternoon:780,late:930,evening:1080,night:1080}[stop.daypart]||0);
        // Round 10 (2026-10-19): a dinner after a long empty afternoon is moved earlier (from 5 PM), see pullDinnersForward.
        // A dinner kept through a Swap keeps the earlier time it had on screen.
        const earlyDinner=Math.min(Number.isFinite(stop.dinnerFrom)?stop.dinnerFrom:Infinity,Number.isFinite(stop.keepStart)&&stop.keepStart>=DINNER_EARLIEST?stop.keepStart:Infinity);
        const partStart=isDinnerStop(stop)&&!beforeEvent&&earlyDinner<partStart0?earlyDinner:partStart0;
        // Round 9: a stop kept through a Swap starts no earlier than it did (keepStart, from the plan on screen).
        // Round 11 (2026-10-20): the swapped stop before a show is timed by the show, not by the old stop's start (a second
        // dinner Swap before a 7:30 PM show left no dinner: the new place was a little further and could not start at 5:15).
        const fillStart=Math.max(stop.gapFill&&Number.isFinite(stop.fillStart)?stop.fillStart:0,Number.isFinite(stop.keepStart)&&!(beforeEvent&&stop.swapSlot)?stop.keepStart:0);
        let range=ranges.find(([a,b])=>Math.max(a,earliest,partStart,fillStart)+duration<=Math.min(b,1440,beforeEvent?eventStart-30-(eventTravel?.maxMinutes||0):1440));
        // Round 9: before a fixed-time event (a 2 PM escape room), lunch or a walk is shortened to fit -- an hour for a
        // meal, 45 minutes for a visit -- rather than a "Timing conflict".
        let squeezed=null;
        if(!range&&beforeEvent&&!isDinnerStop(stop)&&!/\b(?:dinner|supper)\b/i.test(stop.label||'')&&(isLunchStop(stop)||SWAP_FLEX_TYPES.includes(candidate.type))){
          const least=['restaurant','pub'].includes(candidate.type)?60:45,limit=eventStart-30-(eventTravel?.maxMinutes||0);
          range=ranges.find(([a,b])=>Math.max(a,earliest,partStart,fillStart)+least<=Math.min(b,1440,limit));
          if(range)squeezed=Math.floor((Math.min(range[1],1440,limit)-Math.max(range[0],earliest,partStart,fillStart))/15)*15;
          if(squeezed!=null&&squeezed<least)range=null;
        }
        if(!range)return {bad:true};
        let start=Math.max(range[0],earliest,partStart,fillStart);
        // Round 9 (2026-10-19): an outdoor filler (one swapped in too) starts early enough to end 30 minutes before sunset.
        if(stop.gapFill&&['outdoor','beach'].includes(candidate.type)&&!candidate.indoorGolf){const light=tripRequirements.estimateDaylight(date,candidate);if(light&&start+duration>light.sunsetMinutes-30)start=Math.max(range[0],earliest,Math.floor((light.sunsetMinutes-30-duration)/5)*5);}
        // Lunch is lunch (2026-10-19): it starts by about 13:30 unless the morning itself runs later; a place that only
        // opens mid-afternoon is not a lunch stop.
        if(isLunchStop(stop)&&start>Math.max(810,earliest))return {bad:true,lateLunch:start};
        // Round 9: the stop swapped in fits the time its slot had -- a three-hour trail swapped in for a short walk is
        // a shorter visit, so lunch and the afternoon keep their times.
        let visit=squeezed!=null?Math.min(duration,squeezed):duration;
        const nextKept=stop.swapSlot?group.stops.slice(group.stops.indexOf(stop)+1).find(s=>s.venue&&!s.event&&Number.isFinite(s.keepStart)):null;
        const lunchFlex=isLunchStop(stop)&&['restaurant','pub','cafe'].includes(candidate.type);
        if(nextKept&&(SWAP_FLEX_TYPES.includes(candidate.type)||lunchFlex)){const onward=tripRequirements.estimateTransfer(candidate,byId.get(nextKept.venue.id)||{});const room=nextKept.keepStart-start-(onward?onward.maxMinutes:10);if(room<visit&&room>=45)visit=Math.floor(room/15)*15;}
        // Round 9: an outdoor stop swapped in (or a filler) is a shorter visit rather than one that runs past dusk.
        if((stop.swapSlot||stop.gapFill)&&['outdoor','beach'].includes(candidate.type)&&!candidate.indoorGolf){const light=tripRequirements.estimateDaylight(date,candidate);if(light&&start+visit>light.sunsetMinutes-30){const room=Math.floor((light.sunsetMinutes-30-start)/15)*15;if(room>=45)visit=Math.min(visit,room);}}
        return {start,end:start+visit,wait:start-earliest,transfer,unknownHours, textHours:!!textHours,provisional:unknownHours||hiking||!!textHours||!one?.complete||guessed||guessedTransfer,listingTiming:!!textHours||one?.visits?.[0]?.durationSource==='listing'};
      };
      let timed=fit(v);
      // Round 8 (2026-10-19): a ski day is on the hill from about 9 AM to 3:30 PM; lunch is a break on the hill inside
      // it (it does not move the day on), and the optional activity comes after the lifts.
      let skiResume=null;
      if(stop.skiDay&&v&&cursor!=null){const start=Math.max(cursor,540);timed={start,end:Math.max(start+120,SKI_DAY_END),wait:0,transfer:0,provisional:true};skiWindow={start:timed.start,end:timed.end,v};}
      else if(stop.onHill&&v&&skiWindow&&cursor!=null){const start=Math.max(skiWindow.start+150,720);timed={start,end:start+SKI_LUNCH_MINUTES,wait:0,transfer:0,provisional:true};skiResume=skiWindow;}
      // Round 8: Swap's keep-in-place pins are not locks, so a kept stop that no longer fits can still give way.
      const protectedStop=Object.entries(input.pinned||{}).some(([k,id])=>id===v?.id&&!softPins.has(k))||requirements.items.some(i=>i.kind==='venue'&&i.value===v?.id)||stop.skiDay||stop.onHill;
      if(v && (timed?.bad || timed?.provisional || !timed && cursor!=null) && !protectedStop){
        const matched=requirements.items.filter(i=>['type','type_count','venue_kind','activity','feature'].includes(i.kind)&&tripRequirements.matches(v,i));
        // Round 9: a stop kept through a Swap is only replaced when it cannot fit at all, never for a better-verified one.
        const softKept=Object.entries(input.pinned||{}).some(([k,id])=>id===v?.id&&softPins.has(k));
        for(const alt of softKept?[]:stop.alternates||[]){
          const candidate=byId.get(alt.venue?.id), alternative=candidate&&fit(candidate);
          if(!alternative||alternative.bad||alternative.provisional||!matched.every(i=>tripRequirements.matches(candidate,i))||group.stops.some(s=>s.venue?.id===candidate.id))continue;
          if(candidate.type==='golf'&&!candidate.indoorGolf&&group.stops.some(s=>s!==stop&&s.venue&&s.venue.type==='golf'))continue; // round 11: one round a day
          const old=v.name, unknownTiming=!timed;swapVerb(plan,v,candidate);Object.assign(stop,alt);v=candidate;timed=alternative;
          stop.alternates=(stop.alternates||[]).filter(a=>a.venue?.id!==candidate.id);
          stop.caveats=[...(stop.caveats||[]),`Used instead of ${old} because ${unknownTiming?'its timing could not be verified':'its listed hours do not fit the estimated sequence'}.`];break;
        }
        // Round 8 (2026-10-19): a stop whose listed hours do not fit (lunch that cannot start before 3 PM, a place that
        // closes first) is replaced by a nearby place of the same kind that does fit, rather than leaving a timing
        // conflict and the rest of the day untimed.
        if(timed?.bad&&!options.probe&&!stop.event){
          const inPlan=new Set(groups.flatMap(g=>g.stops.map(s=>s.venue&&s.venue.id).filter(Boolean)));
          const exclude=new Set([...(input.excludeIds||[]),...(input.avoidIds||[])]);
          const matched=requirements.items.filter(i=>['type','venue_kind','feature'].includes(i.kind)&&i.strength!=='prefer'&&tripRequirements.matches(v,i));
          const altCtx=buildContext(input.intent||{},input.labels||{},input);
          // Round 11 (2026-10-20): a meal before a show can also be in the show's town, nearest the show first (dinner in
          // Vernon could not fit before a 7 PM show in Lake Country).
          const eventTown=beforeEvent&&(isDinnerStop(stop)||isLunchStop(stop))&&nextEvent.event.region&&nextEvent.event.region!==v.region?nextEvent.event.region:null;
          const eventPlace=eventTown&&nextEvent.event.location&&hasCoords(nextEvent.event.location)?nextEvent.event.location:null;
          const near=eventPlace||previous||v;
          const options2=facts.filter(o=>o.type===v.type&&o.id!==v.id&&!inPlan.has(o.id)&&!exclude.has(o.id)&&(o.region===v.region||o.region===eventTown)&&hasCoords(o)&&matched.every(i=>tripRequirements.matches(o,i))
            &&eligible(o,altCtx,false)&&!(date&&seasonClosedOnTrip(o,{date}))&&!advisoryUnavailable(o.advisory&&o.advisory.note)&&tripRequirements.venueAllowed(o,requirements,group.day,input.tripDate)&&!(isDinnerStop(stop)&&casualDinner(o)&&!casualDinner(v))&&!(isLunchStop(stop)&&dinnerOnly(o)))
            .map(o=>({o,km:kmBetween(near,o)})).sort((a,b)=>(a.km??99)-(b.km??99)||(b.o.rating||0)-(a.o.rating||0)).slice(0,12);
          for(const {o} of options2){
            const alternative=fit(o);
            if(!alternative||alternative.bad)continue;
            const old=v.name;
            swapVerb(plan,v,o);
            const keep={label:stop.label,daypart:stop.daypart,kind:stop.kind,component:stop.component,...(stop.gapFill?{gapFill:true,fillStart:stop.fillStart}:{}),...(stop.wineryLunch?{wineryLunch:true}:{})};
            Object.keys(stop).forEach(k=>{delete stop[k];});
            Object.assign(stop,keep,stopFrom(o,{reasons:scoreVenue(o,altCtx).reasons,caveats:[`Used instead of ${old} because its listed hours do not fit the estimated sequence.`]},regionReason(o,altCtx),altCtx));
            if(plan.kind==='itinerary')stop.alternates=[];
            v=o;timed=alternative;break;
          }
        }
      }
      const item={day:group.day,date,venueId:v?.id,status:timed?.bad?'unmet':timed?(timed.provisional||provisional?'provisional':'estimated'):'unverified',assumedStart:assumed};
      let note;
      if(timed&&!timed.bad){
        Object.assign(item,{startMinutes:timed.start,endMinutes:timed.end,waitMinutes:timed.wait,transferMinutes:timed.transfer});
        if((requirements.shortWalkVenueIds||[]).includes(v.id))item.shortWalkSelected=true;
        const precedingProvisional=provisional;
        if(timed.provisional||precedingProvisional)item.confirmationReasons=[...(timed.unknownHours?['hours']:timed.textHours?['listing_hours']:[]),...(precedingProvisional?['prior_timing']:[]),...(v.type==='sport'?['sport_access']:[]),'visit_duration','travel'];
        stop.waitMinutes=timed.wait;cursor=timed.end;previous=v;provisional=provisional||timed.provisional;
        if(skiResume){cursor=skiResume.end;previous=skiResume.v;item.onHill=true;}
        note=`Estimated visit ${clock(timed.start)}–${clock(timed.end)} on ${date}, within listed hours${assumed?'; uses an assumed start time':''}. Visit length and transfers are estimates; confirm before visiting.${beforeEvent?' Leaves a 30-minute arrival allowance before the event; event travel time still needs confirmation.':''}`;
        if(provisional){const certainty=(timed.unknownHours?'This stop’s opening hours are not verified.':timed.textHours?'Opening hours are taken from listing text and remain provisional.':'This visit fits the listed opening hours.')+(precedingProvisional?' Timing remains provisional because a preceding stop is provisional.':'');note=`Provisional visit ${clock(timed.start)}–${clock(timed.end)} on ${date}. ${certainty} Uses planning allowances for visit length and travel. Trail duration is not verified. Confirm trail duration, opening hours and the route before relying on this schedule.`;if((requirements.shortWalkVenueIds||[]).includes(v.id))note+=' Short easy walk selected; 30–60-minute planning allowance, not a verified trail duration.';if(v.type==='sport')note=note.replace(' Trail duration is not verified.','').replace('Confirm trail duration, opening hours and the route before relying on this schedule.','Sports visit length is a planning allowance, not a verified session or booking; confirm access, opening hours and the route with the operator.');if(v.type!=='sport'&&!(v.activities||[]).includes('hiking')&&!(v.plannerKinds||[]).includes('guided_hike'))note=note.replace(' Trail duration is not verified.','').replace('Confirm trail duration, opening hours and the route before relying on this schedule.','Confirm visit duration, opening hours and travel before relying on this schedule.');if(timed.listingTiming)note+=' Uses timing from listing text; confirm the chosen trail and any temporary closures.';
          // Round 14 (2026-10-20): a ski day runs on lift hours (about 9 to 3:30), not a trail's length.
          if(stop.skiDay)note=`Provisional ski day ${clock(timed.start)}–${clock(timed.end)} on ${date}, about lift opening to closing; lunch is on the hill. Confirm lift hours, conditions and tickets before you go.`;
          dayToConfirm=true;}
      }else{
        // Round 8: a stop that cannot fit keeps the day's clock where it was, so the stops after it are still timed.
        if(!timed?.bad)cursor=null;
        note=timed?.lateLunch!=null?`Lunch here could not start until ${clock(timed.lateLunch)} on ${date} under its listed hours, so it does not fit a midday meal. Choose another lunch spot nearby.`:timed?.bad?(beforeEvent?'This visit cannot fit before the event with the arrival allowance and listed opening hours. Choose an earlier start or move the meal after the event.':'This visit cannot fit before the listed closing time in the estimated sequence. Change the start time or choose another stop.'):'Visit timing is unverified: hours, duration, transfer or the preceding stop could not be timed. Confirm before following this sequence.';
        const prior=group.stops[group.stops.indexOf(stop)-1];
        if(!timed&&v&&prior?.event&&/\b(?:dinner|supper)\b/i.test(stop.label||'')){
          const end=eventEndMinutes(prior.event,parseEventStart(prior.event.time));
          const hours=(v._hours||parseVenueHours(v.hours)).days[weekday];
          const duration=tripRequirements.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:v.id}}]}},facts,requirements})[0];
          if(Number.isFinite(end)&&hours?.status==='open'&&duration?.complete){
            const minutes=duration.maxMinutes;
            const range=hours.ranges.find(([a,b])=>Math.max(a,end,1080)+minutes<=Math.min(b,1440));
            if(range){
              item.mealWindow={earliestStartMinutes:Math.max(range[0],end,1080),latestStartMinutes:Math.min(range[1],1440)-minutes,visitMinutes:minutes};
              item.confirmationReasons=['event_travel','visit_duration'];
              note=`Possible dinner arrival window ${clock(item.mealWindow.earliestStartMinutes)}–${clock(item.mealWindow.latestStartMinutes)}, if travel permits. Allows ${minutes} minutes for dinner within listed opening hours. This is not a scheduled visit: confirm the event-to-restaurant journey and kitchen service before booking.`;
            }
          }
        }
        // A stop that cannot fit is a warning of its own; a stop that simply could not be timed is covered by the day's
        // one "Confirm times before you go" note (2026-10-18), not a warning per stop.
        if(timed?.bad||item.mealWindow){const warning=`${v?.name||stop.event?.name||'Stop'}: ${note}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);}else dayToConfirm=true;
      }
      // Round 14: a ski day is timed by lift hours, so it carries no daylight or sunset margin ("Margin before sunset 30 min").
      if(v && !stop.lit && !stop.skiDay && !v.indoorGolf && (['outdoor','beach','golf'].includes(v.type)||tripRequirements.isOutdoorSport(v)||(v.plannerKinds||[]).includes('guided_hike'))){
        const light=tripRequirements.estimateDaylight(date,v),hiking=(v.activities||[]).includes('hiking'),margin=(hiking||tripRequirements.isOutdoorSport(v))?30:0;
        const known=light&&Number.isFinite(item.startMinutes)&&Number.isFinite(item.endMinutes);
        const conflict=known&&(item.startMinutes<light.sunriseMinutes||item.endMinutes>light.sunsetMinutes-margin);
        item.daylight={...(light||{}),marginMinutes:margin,status:known?(conflict?'conflict':'estimated'):'unverified'};
        const daylightNote=known?`Estimated daylight ${clock(light.sunriseMinutes)}–${clock(light.sunsetMinutes)}; ${margin}-minute margin before sunset. Terrain and weather can reduce usable light.${conflict?' This outdoor visit falls outside the estimated daylight window. Start earlier or choose a shorter activity.':''}`:'Daylight timing is unverified: confirm the date, location and visit duration before planning this outdoor stop.';
        note+=' '+daylightNote;
        if(conflict){const warning=`${v.name}: ${daylightNote}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);}else if(!known)dayToConfirm=true;
      }
      // The timing note stays on the stop (scheduleNote) and in the timeline; it is not repeated on every card.
      stop.scheduleNote=note;plan.schedule.push(item);
    }
    // One "Confirm times before you go" note per day (2026-10-18), instead of a provisional-timing line per stop.
    const dayRow=plan.days.find(d=>d.day===group.day);
    if(dayRow)delete dayRow.confirmNote;
    if(dayToConfirm){
      const confirm=`Day ${group.day}: Confirm times before you go. Opening hours, visit lengths and drive times are estimates.`;
      if(dayRow)dayRow.confirmNote=confirm;
      plan.warnings.push(confirm);plan.scheduleWarnings.push(confirm);
    }
  }
  // Single-day, flexible outings only. Keep the same stops and their order;
  // unknown timings and explicit starts cannot be shifted into a false fit.
  if (!options.probe && plan.kind==='itinerary' && requirements.startMinutes==null && !requirements.daypart && plan.schedule.length && !plan.schedule.some(s=>s.eventId!=null) && plan.schedule.every(s=>s.status==='estimated')) {
    const idle=p=>p.schedule.reduce((n,s)=>n+s.waitMinutes,0);
    const ids=plan.schedule.map(s=>s.venueId).join(',');
    const firstStart=plan.schedule[0].startMinutes;
    let best=plan,score=idle(plan);
    if(score>60)for(let start=firstStart+15;start<=Math.min(firstStart+480,1080);start+=15){
      const probe=JSON.parse(JSON.stringify(plan));
      scheduleTripByHours(probe,input,requirements,{probe:true,startMinutes:start});
      if(!probe.schedule.every(s=>s.status==='estimated'&&(!s.daylight||s.daylight.status==='estimated'))||probe.schedule.map(s=>s.venueId).join(',')!==ids)continue;
      const candidate=idle(probe);
      if(candidate<score){best=probe;score=candidate;}
      if(score===0)break;
    }
    if(best!==plan){
      Object.assign(plan,best);
      plan.notes.push(`A later assumed start reduces waiting while keeping the same stops and listed opening hours. Estimated first visit: ${clock(plan.schedule[0].startMinutes)}. Change your request to specify a start time.`);
    }
  }
  // Offer a checked alternative; never silently change an explicit departure.
  delete plan.shortWalkRepairs;
  if (!options.probe && groups.length > 1 && !requirements.items.some(i => i.value === 'challenging_hike' && i.strength === 'must')) {
    const repairs = [];
    for (const row of plan.schedule.filter(s => s.daylight?.status === 'conflict')) {
      const v = byId.get(row.venueId), current = plan.schedule.filter(s => s.day === row.day);
      if (!v || current.some(s => s.eventId != null) || !(v.plannerKinds || tripRequirements.inferPlannerKinds(v)).includes('easy_walk') || (requirements.shortWalkVenueIds || []).includes(v.id)) continue;
      const probe = JSON.parse(JSON.stringify(plan));
      scheduleTripByHours(probe, input, {...requirements, shortWalkVenueIds:[...(requirements.shortWalkVenueIds || []), v.id]}, {probe:true});
      const candidate = probe.schedule.filter(s => s.day === row.day), target = candidate.find(s => s.venueId === v.id);
      if (!target || target.startMinutes !== row.startMinutes || target.endMinutes >= row.endMinutes || candidate.map(s => s.venueId).join(',') !== current.map(s => s.venueId).join(',') || !candidate.every(s => ['estimated','provisional'].includes(s.status) && Number.isFinite(s.endMinutes) && s.endMinutes <= 1440 && (!s.daylight || s.daylight.status === 'estimated'))) continue;
      repairs.push({day:row.day, venueId:v.id, name:v.name});
    }
    if (repairs.length) plan.shortWalkRepairs = repairs;
  }
  delete plan.dayDepartureRepairs;
  if(!options.probe && groups.length>1){
    const repairs=[];
    for(const group of groups){
      const current=plan.schedule.filter(s=>s.day===group.day),first=current[0]?.startMinutes;
      if(!Number.isFinite(first)||current.some(s=>s.eventId!=null)||!current.some(s=>s.daylight?.status==='conflict'))continue;
      const ids=current.map(s=>s.venueId).join(',');
      for(let start=first-30;start>=0;start-=30){
        const probe=JSON.parse(JSON.stringify(plan));
        scheduleTripByHours(probe,input,{...requirements,dayStartMinutes:{...(requirements.dayStartMinutes||{}),[group.day]:start}},{probe:true});
        const candidate=probe.schedule.filter(s=>s.day===group.day);
        if(candidate.map(s=>s.venueId).join(',')!==ids || !candidate.every(s=>['estimated','provisional'].includes(s.status)&&Number.isFinite(s.endMinutes)&&s.endMinutes<=1440&&(!s.daylight||s.daylight.status==='estimated'))||candidate[0]?.startMinutes>=first)continue;
        repairs.push({day:group.day,startMinutes:start,provisional:candidate.some(s=>s.status==='provisional')});break;
      }
    }
    if(repairs.length)plan.dayDepartureRepairs=repairs;
  }
  delete plan.earlierDeparture;
  if(!options.probe && groups.length===1 && plan.kind==='itinerary' && !plan.schedule.some(s=>s.eventId!=null) && plan.schedule.some(s=>s.daylight?.status==='conflict')){
    const first=plan.schedule[0]?.startMinutes,ids=plan.schedule.map(s=>s.venueId).join(',');
    if(Number.isFinite(first))for(let start=first-30;start>=0;start-=30){
      const probe=JSON.parse(JSON.stringify(plan));
      scheduleTripByHours(probe,input,{...requirements,startMinutes:start},{probe:true,startMinutes:start});
      if(probe.schedule.map(s=>s.venueId).join(',')!==ids || !probe.schedule.every(s=>['estimated','provisional'].includes(s.status)&&Number.isFinite(s.endMinutes)&&s.endMinutes<=1440&&(!s.daylight||s.daylight.status==='estimated')))continue;
      if(probe.schedule[0].startMinutes>=first)continue;
      plan.earlierDeparture={startMinutes:start,provisional:probe.schedule.some(s=>s.status==='provisional')};break;
    }
  }
  delete plan.laterDeparture;
  if(!options.probe && groups.length===1 && plan.kind==='itinerary' && plan.schedule.length>1 && !plan.schedule.some(s=>s.eventId!=null) && plan.schedule.every(s=>['estimated','provisional'].includes(s.status)&&Number.isFinite(s.endMinutes))){
    // Round 10 (2026-10-19): only the waits between stops count -- waiting for the first place to open is not a gap.
    const idle=p=>p.schedule.slice(1).reduce((n,s)=>n+(s.waitMinutes||0),0);
    const initial=idle(plan),first=plan.schedule[0].startMinutes,ids=plan.schedule.map(s=>s.venueId).join(',');
    let best=null,bestIdle=initial;
    if(initial>=90)for(let start=first+30;start<=Math.min(first+480,1080);start+=30){
      const probe=JSON.parse(JSON.stringify(plan));
      scheduleTripByHours(probe,input,{...requirements,startMinutes:start},{probe:true,startMinutes:start});
      if(probe.schedule.map(s=>s.venueId).join(',')!==ids || !probe.schedule.every(s=>['estimated','provisional'].includes(s.status)&&Number.isFinite(s.endMinutes)&&s.endMinutes<=1440&&(!s.daylight||s.daylight.status==='estimated')))continue;
      const waiting=idle(probe);
      if(waiting<bestIdle){best=probe;bestIdle=waiting;}
      if(waiting===0)break;
    }
    if(best && initial-bestIdle>=60)plan.laterDeparture={startMinutes:best.schedule[0].startMinutes,savedMinutes:initial-bestIdle,provisional:best.schedule.some(s=>s.status==='provisional')};
  }

}

// Thin afternoons (2026-10-19, round 7): 2.5-4 hours of "free interval" before dinner. The gap gets one more stop near
// the day's last one -- open then, the kind of place the trip is about (a family activity with kids, a tasting on a
// wine day unless the day's count is reached), never one already planned -- or, when none fits, a stop row that says
// "Free time" so the wait is on purpose. Returns true when a stop was added (the day is then re-timed).
const GAP_MINUTES = 150;
const DINNER_GAP_MINUTES = 90;
// A gap-filling stop sits in the middle of the free time, on a quarter hour, so the wait is split either side of it.
const SKI_DAY_END = 930; // 3:30 PM, when the lifts wind down
const SKI_LUNCH_MINUTES = 60;
const SWAP_FLEX_TYPES = ['outdoor', 'beach', 'indoor', 'tour', 'sport', 'winery', 'brewery', 'distillery', 'golf'];
function gapFillMinutes(v) { return Math.min(90, Math.max(60, VISIT_ALLOWANCE[v.type] || 60)); }
function gapFillStart(arrive, spare) { return arrive + Math.max(0, Math.floor(spare / 2 / 15) * 15); }
// Round 10 (2026-10-19): no tour company (Hoodoo Adventures, Full Cyrcle) as a walk-in filler; tours are booked.
const GAP_FILL_TYPES = ['outdoor', 'indoor', 'beach', 'winery', 'brewery', 'distillery', 'cafe'];
const GAP_ALCOHOL_TYPES = ['winery', 'brewery', 'distillery'];
const GAP_KIDS_RE = /\b(?:kids?|children|family|families|play|playground|science|museum|aquarium|zoo|farm|petting|mini golf|bowling|arcade|trampoline|climbing|pool|splash|park|beach|gelato|ice cream)\b/;
function fillDinnerGaps(result, input, requirements) {
  if (!result || !(result.days || []).length || !(result.schedule || []).length) return false;
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const used = new Set(result.days.flatMap((d) => d.stops.map((s) => s.venue && s.venue.id).filter(Boolean)));
  // Round 15b (2026-10-20): a filler is never the same place under another name (Mission Creek Greenway after Mission
  // Creek Regional Park) and never somewhere a family trip avoids (Skaha Bluffs climbing), like the day's other stops.
  const usedPlaces = new Set([...used].map((id) => byId.get(id)).filter(Boolean).map(placeKey).filter(Boolean));
  const caps = (requirements.items || []).filter((i) => i.kind === 'type_count' && i.strength === 'must');
  const walk = (requirements.items || []).find((i) => i.kind === 'evening_walk');
  let changed = false;
  for (const day of result.days) {
    const k = day.stops.findIndex(isDinnerStop);
    // Round 9 (2026-10-19): a filler swapped in (a new late-afternoon stop with no start of its own yet) is timed here
    // like any other filler: in the middle of the free time before dinner, ending 30 minutes before sunset outdoors.
    const lateStop = day.stops.find((s) => s.daypart === 'late');
    const refit = !!(lateStop && lateStop.gapFill && lateStop.venue && !Number.isFinite(lateStop.fillStart) && k > 0 && day.stops.indexOf(lateStop) === k - 1);
    if (k < 1 || (lateStop && !refit)) continue;
    const dinner = day.stops[k], row = result.schedule.find((x) => x.day === day.day && x.venueId === dinner.venue.id);
    // Round 8: a kept late stop already placed elsewhere in the plan is never repeated (The View Winery twice).
    const pinnedLateRaw = input.pinned && byId.get(input.pinned[`${day.day}-late`]);
    const pinnedLate = refit ? byId.get(lateStop.venue.id) : pinnedLateRaw && !used.has(pinnedLateRaw.id) ? pinnedLateRaw : null;
    // Round 9: a Swap elsewhere never adds a stop to a slot that had none.
    if (!pinnedLate && input.swap && input.pinned) continue;
    // A shorter wait (90-150 minutes) before a dinner that leads into an evening show is left alone: the show sets dinner.
    if (!pinnedLate && row && row.waitMinutes < GAP_MINUTES && day.stops.slice(k + 1).some((s) => s.event)) continue;
    const lateFloor = requirements.startMinutes == null && !(requirements.dayStartMinutes && requirements.dayStartMinutes[day.day] != null) ? 930 : 0;
    // Round 9 (2026-10-19): 90 minutes or more of waiting before dinner gets a stop too (1.5-3 hour gaps were left);
    // only a gap of GAP_MINUTES or more becomes a "Free time" card when nothing fits.
    if (!pinnedLate && !(row && Number.isFinite(row.waitMinutes) && row.waitMinutes >= DINNER_GAP_MINUTES && Number.isFinite(row.startMinutes))) continue;
    const before = day.stops.slice(0, refit ? k - 1 : k).reverse().find((s) => s.venue || s.event);
    const prevRow = before && result.schedule.find((x) => x.day === day.day && ((before.venue && x.venueId === before.venue.id) || (before.event && x.eventId === before.event.id)));
    const from = before && before.venue ? byId.get(before.venue.id) : before && before.event && before.event.location && hasCoords(before.event.location) ? before.event.location : null;
    const to = byId.get(dinner.venue.id);
    const gapStart = prevRow && Number.isFinite(prevRow.endMinutes) ? prevRow.endMinutes : row ? row.startMinutes - row.waitMinutes : 900;
    const gapEnd = row && Number.isFinite(row.startMinutes) ? row.startMinutes : 1080;
    const date = day.date || row?.date || null;
    const weekday = date ? WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : null;
    const dayCtx = { ...ctx, tripDate: date || ctx.tripDate };
    const dayTypes = {};
    for (const st of day.stops) if (st.venue) dayTypes[st.venue.type] = (dayTypes[st.venue.type] || 0) + 1;
    const capped = (t) => (t === 'beach' && coolBeachMonth(date || ctx.tripDate) && (dayTypes.beach || 0) >= 1) || caps.some((i) => i.value === t && (dayTypes[t] || 0) >= i.count);
    const regions = ctx.partRegions ? [ctx.partRegions.late || ctx.partRegions.evening] : day.regions || (day.region ? [day.region] : []);
    const gapStarts = new Map();
    const fits = (v) => {
      const t1 = from ? tripRequirements.estimateTransfer(from, v) : null, t2 = to ? tripRequirements.estimateTransfer(v, to) : null;
      // Round 8: before dinner in the next town asked for, the drive there can be longer.
      const onward = ctx.partRegions && to && v.region !== to.region ? 50 : 20;
      if ((from && !t1) || (t1 && t1.maxMinutes > 20) || (t2 && t2.maxMinutes > onward)) return false;
      if (walk && to && kmBetween(v, to) > walk.limitKm * 2) return false;
      // Round 8 (2026-10-19): a late-afternoon filler is a 60-90 minute stop, and an outdoor one ends half an hour
      // before sunset (a three-hour hike from 3:25 PM ran past dusk).
      const duration = gapFillMinutes(v);
      // Round 9: without a start time the scheduler starts a late-afternoon stop from 3:30 PM at the earliest.
      const arrive = Math.max(gapStart + (t1 ? t1.maxMinutes : 10), lateFloor), spare = gapEnd - arrive - duration - (t2 ? t2.maxMinutes : 10);
      let startAt = gapFillStart(arrive, spare);
      const outside = ['outdoor', 'beach'].includes(v.type);
      const light = outside && date ? tripRequirements.estimateDaylight(date, v) : null;
      if (light && startAt + duration > light.sunsetMinutes - 30) startAt = Math.max(arrive, Math.floor((light.sunsetMinutes - 30 - duration) / 5) * 5);
      const endAt = startAt + duration;
      gapStarts.set(v.id, startAt);
      if (endAt + (t2 ? t2.maxMinutes : 10) > gapEnd) return false;
      if (light && endAt > light.sunsetMinutes - 30) return false;
      const hours = (v._hours || parseVenueHours(v.hours)).days[weekday || 'sat'];
      if (hours && hours.status === 'open') return hours.ranges.some(([a, b]) => a <= startAt && b >= endAt);
      if (hours && hours.status === 'closed') return false;
      // No listed hours: only an outdoor place, in daylight.
      return outside;
    };
    let pick = null;
    const estateUsed = withSameEstates(facts, used);
    if (pinnedLate) { pick = { v: pinnedLate }; fits(pinnedLate); }
    else {
      const cands = [];
      for (const v of facts) {
        if (estateUsed.has(v.id) || ctx.exclude.has(v.id) || ctx.avoid.has(v.id) || !GAP_FILL_TYPES.includes(v.type) || !hasCoords(v)) continue;
        if ((placeKey(v) && usedPlaces.has(placeKey(v))) || (ctx.kids && familyAvoid(v))) continue;
        if (regions.length && !regions.includes(v.region)) continue;
        // Round 11 (2026-10-20): a round of golf is never a filler before dinner (a second round ran 2:54-6:54 PM, past
        // sunset), and a day has one round.
        if (capped(v.type) || (dayTypes[v.type] || 0) >= 2 || (v.type === 'golf' && !v.indoorGolf) || eveningOnlyVenue(v)) continue;
        // Round 12 (2026-10-20): an outfitter, a tour or an appointment-only winery is booked ahead, never a filler
        // (Hoodoo Adventure Company filled a December afternoon in Penticton).
        if (bookedOutfitter(v) || appointmentOnly(v)) continue;
        // Round 15b (2026-10-20): nor a balloon company, rental base or forest-road campsite (rotateBooked), and never a
        // kids-only playground for adults.
        if (rotateBooked(v) || (!ctx.kids && KIDS_ONLY_RE.test(`${v.textName || ''} ${v.textDesc || ''}`))) continue;
        // 2026-10-25: a group trip (bachelor/bachelorette, girls' or guys' weekend) may fill the late afternoon with a
        // brewery or pub; a bachelor party's afternoon was a bubble-tea café.
        if (GAP_ALCOHOL_TYPES.includes(v.type) && !ctx.types.has(v.type) && result.theme !== 'wine' && !['group_getaway', 'celebration'].includes(ctx.occasion)) continue;
        if (v.type === 'cafe' && ['treat'].indexOf(cafeRole(v)) === -1 && !ctx.kids) continue; // a coffee right before dinner is not a stop
        if (coldMonthIceCream(v, date || ctx.tripDate)) continue; // round 10: no gelato filler in November
        if (!eligible(v, dayCtx, false) || offSeasonSkip(v, dayCtx) || (date && seasonClosedOnTrip(v, { date })) || advisoryUnavailable(v.advisory && v.advisory.note)) continue;
        if (!tripRequirements.venueAllowed(v, requirements, day.day, input.tripDate) || !fits(v)) continue;
        if (ctx.kids && !(v.features && v.features.kid_friendly) && !GAP_KIDS_RE.test(`${v.textName || ''} ${v.textDesc || ''}`)) continue;
        const km = from ? kmBetween(from, v) : 3;
        const sv = scoreVenue(v, ctx);
        let score = sv.score - (km || 0) * 1.5;
        if (ctx.types.has(v.type)) score += 8;
        if (result.theme === 'wine' && v.type === 'winery') score += 10;
        if (ctx.kids && v.features && v.features.kid_friendly) score += 6;
        cands.push({ v, score, bonus: (sv.reasons || []).filter((r) => r.code === 'collection_bonus').reduce((n, r) => n + (r.weight || 0), 0) });
      }
      pick = rotateFillerPick(cands, dayCtx, `late|${day.day}`);
    }
    const stop = pick
      ? { daypart: 'late', label: PLAN_DAYPART_LABELS.late, gapFill: true, ...(gapStarts.has(pick.v.id) ? { fillStart: gapStarts.get(pick.v.id) } : {}), ...stopFrom(pick.v, { reasons: scoreVenue(pick.v, ctx).reasons.concat({ code: 'gap', text: 'Fills the free time before dinner', weight: 2 }), caveats: [] }, regionReason(pick.v, ctx), ctx) }
      : { daypart: 'late', label: PLAN_DAYPART_LABELS.late, venue: null, reasons: [], why: [], caveats: [], freeTime: { minutes: Math.round((gapEnd - gapStart) / 15) * 15, fromMinutes: gapStart, toMinutes: gapEnd } };
    // Round 9: a kept filler keeps the start it had (when it still fits after the stop before it).
    const keptLate = input.swap && input.swap.times && input.swap.key !== `${day.day}-late` ? input.swap.times[`${day.day}-late`] : null;
    if (pick && pinnedLate && Number.isInteger(keptLate) && gapStarts.has(pick.v.id) && keptLate >= gapStart && keptLate + gapFillMinutes(pick.v) <= gapEnd) { gapStarts.set(pick.v.id, keptLate); stop.fillStart = keptLate; }
    if (!pick && !pinnedLate && row && row.waitMinutes < GAP_MINUTES) continue;
    if (refit) { if (gapStarts.has(pick.v.id)) { lateStop.fillStart = gapStarts.get(pick.v.id); changed = true; } continue; }
    day.stops.splice(k, 0, stop);
    if (pick) { used.add(pick.v.id); changed = true; }
  }
  return changed;
}
// Round 15b (2026-10-20): a day that starts at 9 with a short first stop (a 45-minute lookout) and then waits two hours
// for lunch starts later instead, when no start time was asked for. Each day's start moves to the time with the least
// waiting before lunch, as long as every stop keeps its time and order.
function morningWaitOf(rows) {
  let n = 0;
  const lunchAt = rows.findIndex((r, i) => i > 0 && Number.isFinite(r.startMinutes) && r.startMinutes >= 690 && r.startMinutes <= 840);
  for (let i = 1; i <= lunchAt; i++) n += rows[i].waitMinutes || 0;
  return n;
}
// 2026-10-25: "hike then dinner in Vernon" ran the hike at 9 AM and dinner at 6 PM. A one-day outing whose only meal is
// dinner starts later, so its last stop ends about half an hour before dinner (never past daylight for an outdoor stop).
function leadUpToDinner(result, input, requirements) {
  if (!result || !result.itinerary || (result.days || []).length !== 1 || !(result.schedule || []).length || input.swap || !requirements) return false;
  if (requirements.startMinutes != null || requirements.windowClock || requirements.windowToday || (requirements.dayStartMinutes && requirements.dayStartMinutes[1] != null)) return false;
  const when = (input.intent && input.intent.when) || {};
  if (when.daypart) return false;
  const stops = result.itinerary.stops || [];
  const meals = stops.map((s) => s.kind === 'venue' && s.component && s.component.meal).filter(Boolean);
  if (!meals.length || meals.some((m) => !['dinner', 'supper'].includes(m)) || stops.some((s) => s.kind === 'event' || (s.venue && s.venue.type === 'golf'))) return false;
  const rows = result.schedule.filter((r) => r.day === 1);
  const dinnerAt = rows.findIndex((r) => stops.some((s) => s.venue && s.venue.id === r.venueId && s.component && ['dinner', 'supper'].includes(s.component.meal)));
  if (dinnerAt < 1 || !rows.slice(0, dinnerAt + 1).every((r) => Number.isFinite(r.startMinutes) && Number.isFinite(r.endMinutes))) return false;
  const gap = rows[dinnerAt].startMinutes - rows[dinnerAt - 1].endMinutes - (rows[dinnerAt].transferMinutes || 0);
  if (gap <= 90) return false;
  const ids = rows.map((r) => r.venueId).join(',');
  for (let shift = gap - 30; shift >= 60; shift -= 30) {
    const m = rows[0].startMinutes + shift;
    const probe = JSON.parse(JSON.stringify(result));
    scheduleTripByHours(probe, input, { ...requirements, dayStartMinutes: { ...(requirements.dayStartMinutes || {}), 1: m } }, { probe: true });
    const cand = (probe.schedule || []).filter((r) => r.day === 1);
    if (cand.map((r) => r.venueId).join(',') !== ids || cand.some((r) => !Number.isFinite(r.startMinutes) || (r.daylight && r.daylight.status === 'conflict') || r.status === 'closed')) continue;
    if (cand[dinnerAt].startMinutes > rows[dinnerAt].startMinutes) continue;
    requirements.dayStartMinutes = { ...(requirements.dayStartMinutes || {}), 1: m };
    scheduleTripByHours(result, input, requirements);
    return true;
  }
  return false;
}
function startLaterOnMorningGaps(result, input, requirements) {
  if (!result || !(result.days || []).length || !(result.schedule || []).length || input.swap || !requirements) return false;
  if (requirements.startMinutes != null || requirements.windowClock || requirements.windowToday) return false;
  const when = (input.intent && input.intent.when) || {};
  if (when.daypart || when.preset === 'today') return false;
  let changed = false;
  for (const day of result.days) {
    if (requirements.dayStartMinutes && requirements.dayStartMinutes[day.day] != null) continue;
    const rows = result.schedule.filter((r) => r.day === day.day);
    if (rows.length < 2 || rows.some((r) => r.eventId != null) || day.stops.some((s) => s.skiDay)) continue;
    const first = rows[0].startMinutes, wait0 = morningWaitOf(rows);
    if (!Number.isFinite(first) || wait0 < 60) continue;
    const ids = rows.map((r) => r.venueId).join(','), timed = rows.filter((r) => Number.isFinite(r.startMinutes)).length;
    let pick = null;
    for (let m = first + 15; m <= Math.min(first + 180, 690); m += 15) {
      const probe = JSON.parse(JSON.stringify(result));
      scheduleTripByHours(probe, input, { ...requirements, dayStartMinutes: { ...(requirements.dayStartMinutes || {}), [day.day]: m } }, { probe: true });
      const cand = (probe.schedule || []).filter((r) => r.day === day.day);
      if (cand.map((r) => r.venueId).join(',') !== ids || cand.filter((r) => Number.isFinite(r.startMinutes)).length < timed) continue;
      if (cand.some((r) => r.daylight && r.daylight.status === 'conflict')) continue;
      const w = morningWaitOf(cand);
      if (w <= wait0 - 30 && (!pick || w < pick.w)) pick = { m, w };
      if (w === 0) break;
    }
    if (pick) { requirements.dayStartMinutes = { ...(requirements.dayStartMinutes || {}), [day.day]: pick.m }; changed = true; }
  }
  if (changed) scheduleTripByHours(result, input, requirements);
  return changed;
}
// Round 10 (2026-10-19): 90 minutes or more of nothing before dinner (a tasting ending at 3:30, dinner at 6) moves
// dinner earlier, to 5:30 PM at the soonest; a wait still left after that gets a Free
// time card, so the gap is on purpose. Days with an evening event, ski days and dinners kept through a Swap are left.
const DINNER_EARLIEST = 17 * 60 + 30;
function dinnerGapStops(result) {
  return (result.days || []).length ? result.days.map((d) => ({ day: d.day, stops: d.stops })) : [{ day: 1, stops: (result.itinerary && result.itinerary.stops) || (result.outing && result.outing.stops) || [] }];
}
function dinnerGapRow(result, g) {
  const k = g.stops.findIndex(isDinnerStop);
  if (k < 1 || g.stops.some((s) => s.skiDay) || g.stops.slice(k + 1).some((s) => s.event) || (g.stops[k - 1] && g.stops[k - 1].freeTime)) return null;
  const dinner = g.stops[k];
  const row = (result.schedule || []).find((x) => x.day === g.day && x.venueId === dinner.venue.id);
  if (!row || !Number.isFinite(row.waitMinutes) || !Number.isFinite(row.startMinutes) || row.waitMinutes < DINNER_GAP_MINUTES) return null;
  return { k, dinner, row };
}
function pullDinnersForward(result, input, requirements) {
  if (!result || !(result.schedule || []).length) return false;
  let changed = false;
  for (const g of dinnerGapStops(result)) {
    const hit = dinnerGapRow(result, g);
    if (!hit || Number.isFinite(hit.dinner.keepStart) || Number.isFinite(hit.dinner.dinnerFrom)) continue;
    const earliest = hit.row.startMinutes - hit.row.waitMinutes;
    const target = Math.max(DINNER_EARLIEST, Math.ceil((earliest + 15) / 15) * 15);
    if (target >= hit.row.startMinutes) continue;
    hit.dinner.dinnerFrom = target;
    changed = true;
  }
  if (changed) scheduleTripByHours(result, input, requirements);
  // What is still a long wait gets a Free time card before dinner.
  for (const g of dinnerGapStops(result)) {
    const hit = dinnerGapRow(result, g);
    // Round 15b (2026-10-20): never a second late-afternoon slot (a wine day's fourth tasting and a Free time card both
    // in "late"); the page keys each stop by day and slot.
    if (!hit || g.stops.some((s) => s.daypart === 'late')) continue;
    const from = hit.row.startMinutes - hit.row.waitMinutes, to = hit.row.startMinutes;
    g.stops.splice(hit.k, 0, { kind: 'free', daypart: 'late', label: PLAN_DAYPART_LABELS.late, venue: null, reasons: [], why: [], caveats: [], freeTime: { minutes: Math.round((to - from) / 15) * 15, fromMinutes: from, toMinutes: to } });
    changed = true;
  }
  return changed;
}
// Short plans (round 8, 2026-10-19): a one-day itinerary ("coffee, an easy hike, a winery and dinner"; "wineries then
// dinner") often ended at 12:15 PM with nothing until dinner at 6. A long gap gets lunch when the day has none, then one
// more stop of the kind asked for (or something to do) near the last one, and, when nothing fits, a Free time card.
// Each addition is checked against listed hours by re-timing the day; one that cannot be timed is taken out again.
const SINGULAR_WORD = { winery: '(?:winery|wine tasting|vineyard)', brewery: 'brewery', distillery: 'distillery', beach: 'beach', outdoor: '(?:\\w+ )?(?:hike|walk|trail|park)', indoor: '(?:museum|gallery)', tour: 'tour' };
function fillItineraryGaps(result, input, requirements) {
  if (!result || result.kind !== 'itinerary' || !result.itinerary || !(result.schedule || []).length) return false;
  if (requirements.items.some((i) => i.kind === 'duration' || i.kind === 'deadline') || requirements.daypart) return false;
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const stops = result.itinerary.stops;
  // The extra stop is anything that suits the trip, not only the kinds of place each part asked for.
  const ctx = { ...buildContext(input.intent || {}, input.labels || {}, input), plannerKinds: [] };
  const rowOf = (s) => result.schedule.find((x) => (s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id));
  const date = result.schedule[0].date || input.tripDate;
  const weekday = date ? WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : null;
  const regions = new Set(stops.map((s) => s.venue && s.venue.region).filter(Boolean));
  const asked = new Set((input.intent?.types || []).concat(requirements.items.filter((i) => i.kind === 'type').map((i) => i.value)));
  let changed = false;
  const gapAt = () => {
    for (let k = 1; k < stops.length; k++) {
      const a = stops[k - 1], b = stops[k], ra = rowOf(a), rb = rowOf(b);
      if (!a.venue || !ra || !rb || !Number.isFinite(ra.endMinutes) || !Number.isFinite(rb.startMinutes) || b.event) continue;
      if (rb.startMinutes - ra.endMinutes >= GAP_MINUTES) return { k, a, b, from: ra.endMinutes, to: rb.startMinutes };
    }
    return null;
  };
  const used = () => new Set(stops.map((s) => s.venue && s.venue.id).filter(Boolean));
  const tryInsert = (gap, v, stop) => {
    stops.splice(gap.k, 0, stop);
    scheduleTripByHours(result, input, requirements);
    const row = rowOf(stop);
    if (row && Number.isFinite(row.startMinutes) && row.status !== 'unmet' && row.status !== 'unverified') { changed = true; return true; }
    stops.splice(stops.indexOf(stop), 1);
    scheduleTripByHours(result, input, requirements);
    return false;
  };
  const near = (from, list, part) => list.filter((v) => !used().has(v.id) && !ctx.exclude.has(v.id) && hasCoords(v) && (!regions.size || regions.has(v.region))
    && eligible(v, ctx, false) && hoursFit(v, part, weekday).status !== 'closed' && !(date && seasonClosedOnTrip(v, { date })) && !advisoryUnavailable(v.advisory && v.advisory.note)
    && tripRequirements.venueAllowed(v, requirements, 1, input.tripDate) && !offSeasonSkip(v, ctx))
    .map((v) => { const km = kmBetween(from, v); return { v, score: scoreVenue(v, ctx).score - (km == null ? 8 : km * 1.5) }; })
    .sort((x, y) => y.score - x.score || x.v.id - y.v.id);
  let extras = 0;
  const freeCard = (gap) => ({ kind: 'free', label: 'Free time', daypart: 'late', venue: null, reasons: [], why: [], caveats: [], freeTime: { minutes: Math.round((gap.to - gap.from) / 15) * 15, fromMinutes: gap.from, toMinutes: gap.to } });
  // Round 10: after a Swap the stops on screen stay as they are; a long wait before dinner only gets its Free time card.
  const swapping = isItinerarySwap(input);
  for (let guard = 0; guard < 3; guard++) {
    const gap = gapAt();
    if (!gap) break;
    if (swapping) { if (isDinnerStop(gap.b) || /\b(?:dinner|supper)\b/i.test(gap.b.label || '')) { stops.splice(gap.k, 0, freeCard(gap)); changed = true; } break; }
    const from = byId.get(gap.a.venue.id);
    const hasLunch = stops.some((s) => isLunchStop(s) || (s.venue && ['restaurant', 'pub'].includes(s.venue.type) && rowOf(s) && rowOf(s).startMinutes < 15 * 60));
    let done = false;
    if (!hasLunch && !Number.isInteger(requirements.explicitMealCount) && !/\b(?:no|skip|without) lunch\b/.test(normWords(input.text || '')) && gap.from <= 13 * 60 + 30 && gap.to >= 13 * 60) {
      for (const c of near(from, facts.filter((v) => (v.type === 'restaurant' || (v.type === 'cafe' && ['coffee', 'unclear'].includes(cafeRole(v)))) && !dinnerOnly(v) && !fastFood(v)), 'midday').slice(0, 4)) {
        const stop = { kind: 'venue', label: 'Lunch', daypart: 'midday', component: null, gapFill: true, ...stopFrom(c.v, { reasons: scoreVenue(c.v, ctx).reasons.concat({ code: 'meal', text: 'A lunch stop, so the day doesn’t skip a meal', weight: 3 }), caveats: [] }, regionReason(c.v, ctx), ctx), alternates: [] };
        if (tryInsert(gap, c.v, stop)) { done = true; break; }
      }
      if (done) continue;
    }
    // Something more of what was asked for (a second winery on a wine day), or else something to do nearby.
    if (extras >= 1) {
      if (isDinnerStop(gap.b) || /\b(?:dinner|supper)\b/i.test(gap.b.label || '')) { stops.splice(gap.k, 0, freeCard(gap)); changed = true; }
      break;
    }
    // "A winery" is one winery: a type asked for in the singular is not added again.
    const text = normWords(input.text || requirements.text || '');
    const single = (t) => stops.some((st) => st.venue && st.venue.type === t) && new RegExp(`\\b(?:a|an|one|1) ${SINGULAR_WORD[t] || t}\\b`).test(text);
    const kinds = GAP_FILL_TYPES.filter((t) => asked.has(t) || !GAP_ALCOHOL_TYPES.includes(t)).filter((t) => t !== 'cafe' && !single(t));
    // Planner (2026-10-27): never a booked outfitter or tour base as a walk-in stop (Hoodoo Adventure Company sat in the
    // middle of a Penticton pub crawl), as in fillDinnerGaps.
    const pool = facts.filter((v) => kinds.includes(v.type) && !(ctx.kids && familyAvoid(v)) && !eveningOnlyVenue(v) && !bookedOutfitter(v) && !appointmentOnly(v) && !rotateBooked(v));
    const ranked = near(from, pool, 'afternoon').map((c) => ({ ...c, score: c.score + (asked.has(c.v.type) ? 12 : 0) })).sort((x, y) => y.score - x.score || x.v.id - y.v.id);
    for (const c of ranked.slice(0, 5)) {
      const stop = { kind: 'venue', label: PLAN_DAYPART_LABELS.afternoon, daypart: 'afternoon', component: null, gapFill: true, ...stopFrom(c.v, { reasons: scoreVenue(c.v, ctx).reasons.concat({ code: 'gap', text: 'Fills the free time in the afternoon', weight: 2 }), caveats: [] }, regionReason(c.v, ctx), ctx), alternates: [] };
      if (tryInsert(gap, c.v, stop)) { done = true; extras += 1; break; }
    }
    if (done) continue;
    if (isDinnerStop(gap.b) || /\b(?:dinner|supper)\b/i.test(gap.b.label || '')) { stops.splice(gap.k, 0, freeCard(gap)); changed = true; }
    break;
  }
  return changed;
}
// Planner (2026-10-27): long idle gaps (drafts/site-audit/2026-10-27-trip.md, bug 13). A dated beach day in Kelowna had
// 2 h 49 min with nothing between lunch and a late-afternoon stop, an Osoyoos beach day 110 min, golf and dinner 107 min,
// and a Penticton pub crawl waited from 3:36 to 6 PM. After the plan is timed, any wait of more than IDLE_GAP_LIMIT
// minutes between two stops is closed, in this order: a fitting stop nearby (open then, the trip's kind of place, never
// one already planned, within a short hop of both stops); dinner earlier (from 5:30 PM); a short outing starting later;
// and when nothing fits, a "Free time" card that says what to do with it (a walk at the town's waterfront or park when
// the town has one, in daylight). Plans where the visitor named times are left as they were.
const IDLE_GAP_LIMIT = 90;
const IDLE_PART_ORDER = ['morning', 'midday', 'afternoon', 'late', 'evening', 'night'];
function partAt(min) { return min < 690 ? 'morning' : min < 810 ? 'midday' : min < 930 ? 'afternoon' : min < 1020 ? 'late' : min < 1260 ? 'evening' : 'night'; }
// Times the visitor gave ("at 4 pm", "until 3", "for 3 hours", "this afternoon", the start-time control): kept as they are.
function userNamedTimes(requirements) {
  const r = requirements || {};
  return !!(r.startMinutes != null || r.windowClock || r.daypart || (r.dayStartMinutes && Object.keys(r.dayStartMinutes).length)
    || (r.items || []).some((i) => ['duration', 'deadline'].includes(i.kind)));
}
function idleGapGroups(result) {
  return (result.days || []).length ? result.days.map((d) => ({ day: d.day, date: d.date || null, stops: d.stops, days: true, regions: d.regions || (d.region ? [d.region] : []) }))
    : [{ day: 1, date: null, stops: (result.itinerary && result.itinerary.stops) || (result.outing && result.outing.stops) || [], days: false, regions: [] }];
}
function idleGapAt(result, explained) {
  for (const g of idleGapGroups(result)) {
    if (g.stops.some((s) => s.skiDay)) continue;
    const rowOf = (s) => (result.schedule || []).find((x) => x.day === g.day && ((s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id)));
    const timed = g.stops.filter((s) => s.venue || s.event);
    for (let i = 1; i < timed.length; i++) {
      const prev = timed[i - 1], next = timed[i], pr = rowOf(prev), nr = rowOf(next);
      if (!pr || !nr || !Number.isFinite(pr.endMinutes) || !Number.isFinite(nr.startMinutes) || next.event) continue;
      const travel = Number.isFinite(nr.transferMinutes) ? nr.transferMinutes : 0;
      const idle = nr.startMinutes - pr.endMinutes - travel;
      const key = `${g.day}|${prev.venue ? prev.venue.id : 'e' + prev.event.id}|${next.venue ? next.venue.id : 'e' + next.event.id}`;
      if (idle <= IDLE_GAP_LIMIT || explained.has(key)) continue;
      const between = g.stops.slice(g.stops.indexOf(prev) + 1, g.stops.indexOf(next));
      return { ...g, prev, next, pr, nr, idle, travel, key, card: between.find((s) => s.freeTime) || null };
    }
  }
  return null;
}
// The day's slot for a new stop or card: its own time's part when free, else a free part between its neighbours (a day
// plan's page keys each stop by day and part, so a part is never used twice there).
function idleGapPart(g, atMinutes) {
  if (!g.days) return partAt(atMinutes);
  const taken = new Set(g.stops.filter((s) => s !== g.card).map((s) => s.daypart));
  const want = partAt(atMinutes);
  if (!taken.has(want)) return want;
  const lo = Math.max(0, IDLE_PART_ORDER.indexOf(g.prev.daypart)), hi = IDLE_PART_ORDER.indexOf(g.next.daypart);
  return IDLE_PART_ORDER.slice(lo + 1, hi < 0 ? IDLE_PART_ORDER.length : hi).find((p) => !taken.has(p)) || null;
}
function idleGapCandidates(result, input, requirements, g) {
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const all = idleGapGroups(result).flatMap((x) => x.stops);
  const used = new Set(all.map((s) => s.venue && s.venue.id).filter(Boolean));
  const usedPlaces = new Set([...used].map((id) => byId.get(id)).filter(Boolean).map(placeKey).filter(Boolean));
  const estateUsed = withSameEstates(facts, used);
  const from = g.prev.venue ? byId.get(g.prev.venue.id) : g.prev.event && g.prev.event.location && hasCoords(g.prev.event.location) ? g.prev.event.location : null;
  const to = g.next.venue ? byId.get(g.next.venue.id) : null;
  const date = g.date || g.pr.date || g.nr.date || input.tripDate || null;
  const weekday = date ? WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : (input.startWeekday || 'sat');
  const dayCtx = { ...ctx, tripDate: date || ctx.tripDate };
  const season = tripSeason(date || ctx.tripDate);
  const dayTypes = {};
  for (const st of g.stops) if (st.venue) dayTypes[st.venue.type] = (dayTypes[st.venue.type] || 0) + 1;
  const caps = (requirements.items || []).filter((i) => i.kind === 'type_count' && i.strength === 'must');
  const capped = (t) => (t === 'beach' && coolBeachMonth(date || ctx.tripDate) && (dayTypes.beach || 0) >= 1) || caps.some((i) => i.value === t && (dayTypes[t] || 0) >= i.count);
  const regions = g.regions.length ? g.regions : [...new Set(g.stops.map((s) => s.venue && s.venue.region).filter(Boolean))];
  // A crawl (every stop a bar, brewery, winery or distillery) is filled with one more of its own kind, never a hike.
  const venueTypes = g.stops.filter((s) => s.venue).map((s) => s.venue.type);
  const crawl = venueTypes.length >= 2 && venueTypes.every((t) => CRAWL_TYPES.includes(t) || t === 'pub');
  const kinds = crawl ? [...new Set(venueTypes)] : GAP_FILL_TYPES;
  const start0 = g.pr.endMinutes, end0 = g.nr.startMinutes;
  const out = [];
  for (const v of facts) {
    if (!kinds.includes(v.type) || used.has(v.id) || estateUsed.has(v.id) || ctx.exclude.has(v.id) || ctx.avoid.has(v.id) || !hasCoords(v)) continue;
    if ((placeKey(v) && usedPlaces.has(placeKey(v))) || (ctx.kids && familyAvoid(v)) || (regions.length && !regions.includes(v.region))) continue;
    if (capped(v.type) || (dayTypes[v.type] || 0) >= (crawl ? 4 : 2) || (eveningOnlyVenue(v) && end0 < 1020)) continue;
    if (bookedOutfitter(v) || appointmentOnly(v) || rotateBooked(v) || (!ctx.kids && KIDS_ONLY_RE.test(`${v.textName || ''} ${v.textDesc || ''}`))) continue;
    if (!crawl && GAP_ALCOHOL_TYPES.includes(v.type) && !ctx.types.has(v.type) && result.theme !== 'wine' && !['group_getaway', 'celebration'].includes(ctx.occasion)) continue;
    if (v.type === 'cafe' && cafeRole(v) !== 'treat' && !ctx.kids) continue;
    if (coldMonthIceCream(v, date || ctx.tripDate)) continue;
    if (!eligible(v, dayCtx, false) || offSeasonSkip(v, dayCtx) || (date && seasonClosedOnTrip(v, { date })) || advisoryUnavailable(v.advisory && v.advisory.note)) continue;
    // Out of its season (a paddling place in January, a ski run in July) it is not a filler.
    if (season && seasonFit(v, { kind: 'venue', types: [v.type], activities: [] }, season, dayCtx).score < 0) continue;
    if (!tripRequirements.venueAllowed(v, requirements, g.day, input.tripDate)) continue;
    if (ctx.kids && !(v.features && v.features.kid_friendly) && !GAP_KIDS_RE.test(`${v.textName || ''} ${v.textDesc || ''}`)) continue;
    const t1 = from ? tripRequirements.estimateTransfer(from, v) : null, t2 = to ? tripRequirements.estimateTransfer(v, to) : null;
    if ((from && !t1) || (t1 && t1.maxMinutes > 20) || (t2 && t2.maxMinutes > 20)) continue;
    const duration = gapFillMinutes(v);
    const arrive = Math.ceil((start0 + (t1 ? t1.maxMinutes : 10)) / 5) * 5;
    const back = t2 ? t2.maxMinutes : 10;
    const latest = end0 - back - duration;
    if (latest < arrive) continue;
    // Late enough that the wait after it is not long, when the wait before it then is not long either; otherwise right
    // after the stop before it (the rest of the wait is filled or named next).
    const balanced = Math.floor((end0 - IDLE_GAP_LIMIT - duration - back) / 5) * 5;
    let startAt = balanced > arrive && balanced <= arrive + IDLE_GAP_LIMIT ? Math.min(latest, balanced) : arrive;
    const outside = ['outdoor', 'beach'].includes(v.type);
    const light = outside && date ? tripRequirements.estimateDaylight(date, v) : null;
    if (light && startAt + duration > light.sunsetMinutes - 30) startAt = Math.max(arrive, Math.floor((light.sunsetMinutes - 30 - duration) / 5) * 5);
    if (light && startAt + duration > light.sunsetMinutes - 30) continue;
    const hours = (v._hours || parseVenueHours(v.hours)).days[weekday];
    if (hours && hours.status === 'closed') continue;
    if (hours && hours.status === 'open') {
      const r = hours.ranges.find(([a, b]) => Math.max(a, startAt) + duration <= Math.min(b, latest + duration));
      if (!r) continue;
      startAt = Math.max(startAt, Math.ceil(r[0] / 5) * 5);
    } else if (!outside) continue; // no listed hours: only an outdoor place, in daylight
    const km = from ? kmBetween(from, v) : 3;
    const sv = scoreVenue(v, ctx);
    let score = sv.score - (km || 0) * 1.5;
    if (ctx.types.has(v.type)) score += 8;
    if (result.theme === 'wine' && v.type === 'winery') score += 10;
    if (ctx.kids && v.features && v.features.kid_friendly) score += 6;
    out.push({ v, score, startAt });
  }
  return { cands: out.sort((a, b) => b.score - a.score || a.v.id - b.v.id), ctx: dayCtx };
}
function idleGapReschedule(result, input, requirements, opts) { scheduleTripByHours(result, input, requirements, opts.probe ? { probe: true } : {}); }
function idleGapUntimed(result) { return (result.schedule || []).filter((r) => !Number.isFinite(r.startMinutes) || r.status === 'unmet').length; }
// A walk for a Free time card: the closest waterfront, park or easy walk in the town, while it is light.
const IDLE_WALK_RE = /\b(?:waterfront|boardwalk|promenade|walkway|lakeshore|lakefront|beach|park|stroll|easy walk|walking path|greenway)\b/;
function idleGapWalk(input, g, fromMinutes) {
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const from = g.prev.venue ? byId.get(g.prev.venue.id) : null;
  const date = g.date || g.pr.date || input.tripDate || null;
  const regions = g.regions.length ? g.regions : [...new Set(g.stops.map((s) => s.venue && s.venue.region).filter(Boolean))];
  const used = new Set(g.stops.map((s) => s.venue && s.venue.id).filter(Boolean));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const picks = facts.filter((v) => ['outdoor', 'beach'].includes(v.type) && !used.has(v.id) && hasCoords(v) && (!regions.length || regions.includes(v.region))
    && (IDLE_WALK_RE.test(`${v.textName || ''} ${v.textDesc || ''}`) || (v.plannerKinds || []).some((k) => ['walk', 'easy_walk', 'park'].includes(k)))
    && !roughAccess(v) && !dogOnlyPlace(v) && !bookedOutfitter(v) && !winterOnly(v) && !SHOULDER_CLOSED_RE.test(v.textName || normWords(v.name)) && !ctx.exclude.has(v.id)
    && !(date && seasonClosedOnTrip(v, { date })) && !advisoryUnavailable(v.advisory && v.advisory.note))
    .map((v) => ({ v, km: from ? kmBetween(from, v) : null }))
    .filter((x) => x.km == null || x.km <= 5)
    .filter((x) => { const light = date ? tripRequirements.estimateDaylight(date, x.v) : null; return !light || fromMinutes + 45 <= light.sunsetMinutes; })
    .sort((a, b) => (a.km == null ? 99 : a.km) - (b.km == null ? 99 : b.km) || (b.v.rating || 0) - (a.v.rating || 0) || a.v.id - b.v.id);
  return picks[0] ? picks[0].v : null;
}
function idleGapCard(result, input, g) {
  const from = g.pr.endMinutes, to = g.nr.startMinutes - g.travel;
  const part = (g.card && g.card.daypart) || idleGapPart(g, from);
  if (!part) return false;
  const walk = idleGapWalk(input, g, from);
  const hours = Math.round((to - from) / 30) / 2;
  const len = `${hours} ${hours === 1 ? 'hour' : 'hours'}`, lenFr = `${String(hours).replace('.', ',')} h`;
  const dinner = isDinnerStop(g.next);
  const note = walk ? `Free time: about ${len}${dinner ? ' before dinner' : ''} to take a walk at ${walk.name}, or rest.` : `Free time: about ${len}${dinner ? ' before dinner' : ''} to rest or go back to a favourite spot.`;
  const noteFr = walk ? `Temps libre : environ ${lenFr}${dinner ? ' avant le souper' : ''} pour une promenade à ${walk.name}, ou une pause.` : `Temps libre : environ ${lenFr}${dinner ? ' avant le souper' : ''} pour une pause ou un retour à un endroit préféré.`;
  const card = g.card || { kind: 'free', daypart: part, label: g.days ? PLAN_DAYPART_LABELS[part] : 'Free time', venue: null, reasons: [], why: [], caveats: [] };
  card.freeTime = { minutes: Math.round((to - from) / 15) * 15, fromMinutes: from, toMinutes: to, note, noteFr, ...(walk ? { walk: { id: walk.id, name: walk.name, url: walk.url } } : {}) };
  if (!g.card) g.stops.splice(g.stops.indexOf(g.next), 0, card);
  return true;
}
function closeIdleGaps(result, input, requirements, opts = {}) {
  if (!result || !(result.schedule || []).length || input.swap || isItinerarySwap(input) || opts.userTimed) return false;
  if (!['day_plan', 'multi_day', 'itinerary', 'outing'].includes(result.kind)) return false;
  const explained = new Set();
  let changed = false;
  for (let guard = 0; guard < 8; guard++) {
    const g = idleGapAt(result, explained);
    if (!g) break;
    const untimed0 = idleGapUntimed(result);
    const snapshot = JSON.stringify({ d: (result.days || []).map((d) => d.stops), i: result.itinerary ? result.itinerary.stops : null, o: result.outing ? result.outing.stops : null, r: requirements.dayStartMinutes || null });
    const undo = () => {
      const s = JSON.parse(snapshot);
      (result.days || []).forEach((d, i) => { d.stops = s.d[i]; });
      if (result.itinerary && s.i) result.itinerary.stops = s.i;
      if (result.outing && s.o) result.outing.stops = s.o;
      if (s.r) requirements.dayStartMinutes = s.r; else delete requirements.dayStartMinutes;
      idleGapReschedule(result, input, requirements, opts);
    };
    // A change is kept when no stop loses its time and this wait is gone or shorter.
    const better = () => { const h = idleGapAt(result, new Set()); return idleGapUntimed(result) <= untimed0 && (!h || h.key !== g.key || h.idle < g.idle); };
    // 1. A fitting stop nearby.
    const { cands, ctx } = idleGapCandidates(result, input, requirements, g);    let done = false;
    for (const c of cands.slice(0, 3)) {
      const cur = idleGapAt(result, explained);
      if (!cur || cur.key !== g.key) break;
      const part = idleGapPart(cur, c.startAt);
      if (!part) break;
      const stop = { kind: 'venue', daypart: part, label: PLAN_DAYPART_LABELS[part], component: null, gapFill: true, fillStart: c.startAt,
        ...stopFrom(c.v, { reasons: scoreVenue(c.v, ctx).reasons.concat({ code: 'gap', text: 'Fills the free time between stops', weight: 2 }), caveats: [] }, regionReason(c.v, ctx), ctx), alternates: [] };
      if (cur.card) cur.stops.splice(cur.stops.indexOf(cur.card), 1);
      cur.stops.splice(cur.stops.indexOf(cur.next), 0, stop);
      idleGapReschedule(result, input, requirements, opts);
      const row = (result.schedule || []).find((x) => x.day === g.day && x.venueId === c.v.id);
      if (row && Number.isFinite(row.startMinutes) && !['unmet', 'unverified'].includes(row.status) && better()) { done = true; break; }
      undo();
    }
    if (done) { changed = true; continue; }
    const fresh = idleGapAt(result, explained);
    if (!fresh || fresh.key !== g.key) continue;
    // 2. Dinner earlier, from 5:30 PM.
    if (isDinnerStop(fresh.next) && !Number.isFinite(fresh.next.keepStart) && !fresh.next.idlePulled) {
      const target = Math.max(DINNER_EARLIEST, Math.ceil((fresh.pr.endMinutes + fresh.travel + 15) / 15) * 15);
      if (target < fresh.nr.startMinutes) {
        fresh.next.dinnerFrom = Math.min(Number.isFinite(fresh.next.dinnerFrom) ? fresh.next.dinnerFrom : Infinity, target);
        fresh.next.idlePulled = true;
        idleGapReschedule(result, input, requirements, opts);
        if (better()) { changed = true; continue; }
        undo();
      }
    }
    // 3. A short outing (no meal or event before the wait) starts later, every stop keeping its time and order.
    const g3 = idleGapAt(result, explained) || fresh;
    const beforeGap = g3.stops.slice(0, g3.stops.indexOf(g3.next)).filter((s) => s.venue || s.event);
    // (A day's morning coffee is never pushed up against lunch: the morning-wait rules above own that wait.)
    if (!(g3.days && isLunchStop(g3.next)) && !beforeGap.some((s) => s.event || isLunchStop(s) || isDinnerStop(s) || /\b(?:brunch|breakfast|lunch)\b/i.test(s.label || '')) && !(requirements.dayStartMinutes && requirements.dayStartMinutes[g3.day] != null)) {
      const rows = (result.schedule || []).filter((r) => r.day === g3.day);
      const first = rows[0] && rows[0].startMinutes, ids = rows.map((r) => r.venueId).join(',');
      let ok = false;
      const shifts = [...new Set([g3.idle - 30, g3.idle - 60, (g3.idle - 30) / 2].map((m) => Math.floor(m / 15) * 15).filter((m) => m >= 30))];
      for (const shift of shifts) {
        if (!Number.isFinite(first) || ok) break;
        requirements.dayStartMinutes = { ...(requirements.dayStartMinutes || {}), [g3.day]: first + shift };
        idleGapReschedule(result, input, requirements, opts);
        const cand = (result.schedule || []).filter((r) => r.day === g3.day);
        if (cand.map((r) => r.venueId).join(',') === ids && !cand.some((r) => !Number.isFinite(r.startMinutes) || r.status === 'unmet' || (r.daylight && r.daylight.status === 'conflict')) && better()) ok = true;
        else undo();
      }
      if (ok) { changed = true; continue; }
    }
    // 4. Nothing fits: the wait is named, with something to do in it.
    const g4 = idleGapAt(result, explained);
    if (g4 && idleGapCard(result, input, g4)) changed = true;
    explained.add((g4 || g3).key);
  }
  return changed;
}
// Round 9 (2026-10-19): a brewery (or distillery, tasting) crawl gets something to eat in the middle -- three breweries
// from 11 to 2 had no food. Skipped when one of the stops is a brewpub or kitchen by name, or a meal is already planned.
const CRAWL_TYPES = ['brewery', 'distillery', 'winery', 'cocktail'];
function feedDrinkCrawl(result, input, requirements) {
  if (!result || result.kind !== 'itinerary' || !result.itinerary || isItinerarySwap(input)) return false;
  const timed = (result.schedule || []).length > 0;
  if (/\b(?:no|skip|without) (?:food|lunch|dinner|meals?)\b/.test(normWords(input.text || ''))) return false;
  const stops = result.itinerary.stops;
  const venues = stops.filter((s) => s.venue && !s.event);
  if (venues.length < 2 || venues.some((s) => !CRAWL_TYPES.includes(s.venue.type))) return false;
  const kitchen = venues.find((s) => /\b(?:brew ?pub|pub|kitchen|eatery|bistro|grill|restaurant|pizzeria|taphouse)\b/.test(normWords(s.venue.name || '')));
  if (kitchen) {
    // Round 10 (2026-10-19): the crawl's food is said, on the stop that serves it (Barley Mill Brew Pub).
    const text = 'Serves food, so this is the crawl’s meal stop';
    if (!(kitchen.reasons || []).some((r) => r.text === text)) { kitchen.reasons = [{ code: 'meal', text }].concat(kitchen.reasons || []); kitchen.why = [text].concat(kitchen.why || []).slice(0, 3); }
    return false;
  }
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const ctx = { ...buildContext(input.intent || {}, input.labels || {}, input), plannerKinds: [] };
  const rowOf = (s) => (result.schedule || []).find((x) => (s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id));
  // Round 15b (2026-10-20): a wine-tasting day starts when the wineries open, with lunch after the first tasting (three
  // tastings from 1 PM left lunch unscheduled at 3:40 PM, after the second).
  const wineDay = venues.every((s) => s.venue.type === 'winery') && !(requirements && Number.isFinite(requirements.startMinutes)) && !(input.intent && input.intent.when && input.intent.when.daypart);
  if (wineDay && ['afternoon', 'late', 'midday'].includes(venues[0].daypart)) { venues[0].daypart = 'morning'; if (timed) scheduleTripByHours(result, input, requirements); }
  // An afternoon of tastings asked for ("winery hopping in Oliver this afternoon") ends with dinner instead: the wineries
  // close at 5, and a lunch squeezed in at 3:40 PM could not be timed.
  const wineAfternoon = !wineDay && venues.every((s) => s.venue.type === 'winery');
  const k = wineDay ? 1 : wineAfternoon ? venues.length : Math.min(2, venues.length - 1), after = venues[k - 1];
  const at = wineAfternoon ? stops.indexOf(after) + 1 : stops.indexOf(venues[k]);
  const from = byId.get(after.venue.id), row = rowOf(after);
  const date = (timed && result.schedule[0].date) || input.tripDate;
  const weekday = date ? WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : null;
  const part = wineAfternoon || (row && Number.isFinite(row.endMinutes) && row.endMinutes >= 16 * 60) ? 'evening' : 'midday';
  if (!from) return false;
  const used = new Set(stops.map((s) => s.venue && s.venue.id).filter(Boolean));
  const cands = facts.filter((v) => ['restaurant', 'pub'].includes(v.type) && !used.has(v.id) && !ctx.exclude.has(v.id) && hasCoords(v) && v.region === from.region && !fastFood(v) && !(part === 'midday' && dinnerOnly(v))
    && eligible(v, ctx, false) && hoursFit(v, part, weekday).status !== 'closed' && !(date && seasonClosedOnTrip(v, { date })) && !advisoryUnavailable(v.advisory && v.advisory.note) && tripRequirements.venueAllowed(v, requirements, 1, input.tripDate))
    .map((v) => { const km = kmBetween(from, v); return { v, score: scoreVenue(v, ctx).score - (km == null ? 8 : km * 3) }; })
    .sort((x, y) => y.score - x.score || x.v.id - y.v.id).slice(0, 4);
  for (const c of cands) {
    const stop = { kind: 'venue', label: part === 'midday' ? 'Lunch' : 'Dinner', daypart: part, component: null, ...stopFrom(c.v, { reasons: scoreVenue(c.v, ctx).reasons.concat({ code: 'meal', text: 'Something to eat between the tastings', weight: 3 }), caveats: [] }, regionReason(c.v, ctx), ctx), alternates: [] };
    stops.splice(at, 0, stop);
    if (!timed) { crawlMealExperience(result, venues, stop); return true; }
    scheduleTripByHours(result, input, requirements);
    const r = rowOf(stop);
    if (r && Number.isFinite(r.startMinutes) && r.status !== 'unmet' && r.status !== 'unverified') { crawlMealExperience(result, venues, stop); return true; }
    stops.splice(stops.indexOf(stop), 1);
    scheduleTripByHours(result, input, requirements);
  }
  return false;
}
// Round 14 (2026-10-20): the crawl's summary counts the meal it gained and says where it is (the Vernon crawl said
// "Try a local craft beer first, then try a local craft beer. Both stops are in Vernon" with a lunch between them).
function crawlMealExperience(result, crawl, meal) {
  if (!result.experience || !crawl.length || !meal || !meal.venue) return;
  const noun = { brewery: 'craft breweries', winery: 'wineries', cocktail: 'cocktail bars', distillery: 'distilleries' }[crawl[0].venue.type];
  if (!noun || !crawl.every((s) => s.venue.type === crawl[0].venue.type)) return;
  const all = crawl.concat(meal), towns = [...new Set(all.map(townOf).filter(Boolean))];
  const n = all.length, family = crawl.some((s) => s.component && s.component.kids) ? ' with the family' : '';
  // Round 15b (2026-10-20): dinner after the last tasting is "then dinner at", not "in between".
  const mealLast = crawl.every((s) => (result.itinerary.stops || []).indexOf(s) < (result.itinerary.stops || []).indexOf(meal));
  const flow = mealLast
    ? `Work your way through ${COUNT_WORDS[crawl.length] || crawl.length} ${noun}${family}, then have ${meal.label === 'Dinner' ? 'dinner' : 'lunch'} at ${meal.venue.name}.`
    : `Work your way through ${COUNT_WORDS[crawl.length] || crawl.length} ${noun}, with ${meal.label === 'Dinner' ? 'dinner' : 'lunch'} at ${meal.venue.name} in between${family}.`;
  const geo = towns.length === 1 ? `All ${COUNT_WORDS[n] || n} stops are in ${towns[0]}, so there’s no need to move between towns. Plan a safe ride home.` : 'Plan a safe ride home.';
  result.experience = composeExperience(result.experience.title || EXPERIENCE_TITLE, flow, '', geo, all, crawl, null);
}
// A holiday the visitor named (round 7): its events are preferred and the plan is called a Halloween trip.
const HOLIDAY_THEMES = [
  { key: 'halloween', label: 'Halloween', ask: /\b(?:halloween|hallowe en|spooky|trick or treat\w*)\b/, re: /\b(?:halloween|hallowe en|haunted|haunt|spooky|spooktacular|trick or treat|treat trail|pumpkin|pumpkins|boo|boos|costume|ghost|ghosts|hallowine)\b/ },
  // Round 11 (2026-10-20): holiday markets are Christmas events (Penticton's Last Chance and West Bench Holiday Markets).
  { key: 'christmas', label: 'Christmas', ask: /\b(?:christmas|xmas|holiday lights|festive season|festive|holiday markets?|holiday season)\b/, re: /\b(?:christmas|xmas|santa|holiday lights|carol|carols|festive|winter wonderland|light up|lights|holiday markets?|holiday craft|christkindl\w*|noel|yuletide)\b/ },
];
function holidayTheme(text) { const t = normWords(text || ''); return HOLIDAY_THEMES.find((h) => h.ask.test(t)) || null; }
// The centre of a town's listings, for an event with no mapped place (round 7).
function townCentre(facts, region) {
  let lat = 0, lng = 0, n = 0;
  for (const v of facts) if (v.region === region && hasCoords(v)) { lat += v.lat; lng += v.lng; n++; }
  return n ? { lat: lat / n, lng: lng / n, region } : null;
}
// A trail's walking time from the length its listing gives (round 10): "a 2.5 km round trip", "the 4 km loop", "6 km
// return"; about 20 minutes a kilometre plus a quarter hour at the top, 45 minutes to 4 hours. One-way lengths
// ("each way", "one way") are doubled. Null when the listing gives no single length.
const TRAIL_KM_RE = /\b(\d{1,2}(?:\.\d)?)[ -]?(?:km|kilometres?|kilometers?)(?:[ -](?:round[ -]trip|loop|return|out[ -]and[ -]back|trail|walk|hike|route))\b|\b(?:round[ -]trip|loop|return) of (?:about |roughly )?(\d{1,2}(?:\.\d)?) ?(?:km|kilometres?)\b/gi;
function trailMinutes(v) {
  const text = String(v && (v.plannerDescription || v.description || v.trailText) || '');
  const hits = [...text.matchAll(TRAIL_KM_RE)];
  // Round 11 (2026-10-20): a park or trail network with several routes to choose from ("walk it in pieces", "a series
  // of sections", Giant's Head's "ways to the top") is planned as one walk of about 90 minutes, not a 3-hour hike.
  const distances = (text.match(/\b\d{1,2}(?:\.\d)?[ -]?(?:km|kilometres?|kilometers?)\b|\b\d{3,4}[ -]?(?:metres?|meters?|m)[ -](?:trail|loop|walk|section|route)\b/gi) || []).length;
  if (hits.length !== 1 && distances >= 2 && /\b(?:in pieces|sections?|series of|ways to the top|several (?:trails|routes|loops)|choose (?:a|your) (?:route|trail|view))\b/i.test(text)) return 90;
  if (hits.length !== 1) return null;
  let km = Number(hits[0][1] || hits[0][2]);
  if (!(km > 0 && km <= 25)) return null;
  if (/\b(?:each way|one way)\b/i.test(text.slice(hits[0].index, hits[0].index + hits[0][0].length + 20))) km *= 2;
  return Math.max(45, Math.min(240, Math.round((km * 20 + 15) / 15) * 15));
}
// A hike that takes most of a day (2026-10-28, from Whistler Roam): its listing says so ("a long day hike", "a long
// climb", "full-day"), or its stated length is about four hours or more. Timed at five hours when the listing gives no
// length past trailMinutes' 25 km.
const LONG_DAY_HIKE_RE = /\b(?:long day hike|full[- ]day|all[- ]day|day[- ]long|long climb|multi[- ]day|overnight)\b/i;
const BIG_HIKE_ASKED_RE = /\b(?:long|big|full[- ]day|all[- ]day|day long|epic|challenging|strenuous|hard|difficult|serious|tough)\s+(?:day\s+)?(?:hikes?|hiking|treks?|climbs?)\b|\b(?:hike|hiking) all day\b|\bbackpacking\b/;
const LONG_DAY_HIKE_MINUTES = 300;
function longDayHike(v) {
  if (!v || v.type !== 'outdoor') return false;
  return LONG_DAY_HIKE_RE.test(String(v.trailText || v.plannerDescription || v.description || '')) || (trailMinutes(v) || 0) >= 240;
}
function longDayHikeMinutes(v) {
  if (!longDayHike(v)) return null;
  const m = /\b(\d{2}(?:\.\d)?) ?(?:km|kilometres?)(?: |-)(?:return|round[ -]trip|loop)\b/i.exec(String(v.trailText || v.plannerDescription || v.description || ''));
  const km = m ? Number(m[1]) : 0;
  return km > 25 ? Math.min(600, Math.round((km * 20 + 15) / 15) * 15) : LONG_DAY_HIKE_MINUTES;
}
// Spas (2026-10-28, from Whistler Roam): a request that says spa, and the places that are one.
const SPA_ASKED_RE = /\b(?:spa|spas|sauna|saunas|massage|massages|wellness|hot tubs?|thermal|nordic spa)\b/;
const SPA_DESTINATION_RE = /\b(?:nordic|thermal|hot pools?|baths|hydrotherapy|cold plunges?|hot springs|outdoor pools|mineral pools?)\b/;
function spaPlace(v) { return !!v && v.type === 'indoor' && /\b(?:spa|spas|sauna|massage|thermal)\b/.test(`${v.textName || normWords(v.name || '')} ${normWords(v.cuisine || '')}`); }
// Planning allowances (minutes) for a visit with no estimate of its own (2026-10-19).
const VISIT_ALLOWANCE = { outdoor: 90, beach: 120, indoor: 90, tour: 120, sport: 90, golf: 240, cafe: 40, restaurant: 90, pub: 90, brewery: 60, winery: 75, distillery: 60, cocktail: 60 };
// An evening meal (2026-10-19): a stop labelled dinner, or a restaurant or pub in the evening slot. Its time is never
// pulled forward into the afternoon.
function isDinnerStop(stop){return !!stop&&!stop.event&&!!stop.venue&&(/\b(?:dinner|supper)\b/i.test(stop.label||'')||['evening','night'].includes(stop.daypart)&&['restaurant','pub'].includes(stop.venue.type));}
function isLunchStop(stop){return !!stop&&(stop.daypart==='midday'||/\blunch\b/i.test(stop.label||''))&&!stop.event&&(stop.wineryLunch||!['winery','outdoor','beach','indoor','tour','golf','sport'].includes(stop.venue?.type));}
function clarifyEventMealConflict(plan,input={}){
  if(!plan?.experience||!plan.schedule?.length)return;
  const stops=plan.days?.length?plan.days.flatMap(d=>d.stops||[]):plan.itinerary?.stops||plan.outing?.stops||[];
  for(let i=0;i<stops.length;i++){
    const eventStop=stops[i];
    if(!eventStop.event)continue;
    const eventRow=plan.schedule.find(row=>row.eventId===eventStop.event.id);
    if(!eventRow)continue;
    const meal=stops.slice(0,i).reverse().find(stop=>stop.venue?.type==='restaurant'&&/\b(?:dinner|supper|lunch)\b/i.test(stop.label||''));
    if(!meal)continue;
    const mealRow=plan.schedule.find(row=>row.venueId===meal.venue.id&&row.day===eventRow.day);
    if(mealRow?.status!=='unmet')continue;
    const start=Number.isFinite(eventRow.startMinutes)?`${String(Math.floor(eventRow.startMinutes/60)%24).padStart(2,'0')}:${String(eventRow.startMinutes%60).padStart(2,'0')}`:null;
    const eventName=eventStop.event.name||'the event',mealName=meal.venue.name||'the selected restaurant';
    const locked=Object.values(input.pinned||{}).includes(meal.venue.id)||(input.requirements?.items||[]).some(i=>i.kind==='venue'&&i.value===meal.venue.id);
    const message=locked
      ?`Timing conflict: Your requested restaurant, ${mealName}, is not scheduled because it cannot fit before ${eventName}${start?` starts at ${start}`:''} with the listed hours and a 30-minute arrival allowance.${eventRow.endMinutes==null||eventRow.assumedEnd?' Its end time is not listed, so dinner after the event cannot be timed.':' Confirm event-to-restaurant travel and opening hours before scheduling dinner afterward.'}`
      :`Timing conflict: Dinner is not scheduled because no listed restaurant can fit before ${eventName}${start?` starts at ${start}`:''} with the listed hours and a 30-minute arrival allowance.${eventRow.endMinutes==null||eventRow.assumedEnd?' Its end time is not listed, so dinner after the event cannot be timed.':' Confirm event-to-restaurant travel and opening hours before scheduling dinner afterward.'} Try an earlier-opening restaurant or another date.`;
    if(!locked){
      meal.unscheduledMeal=true;
      meal.unscheduledReason='No listed restaurant fits before the event and arrival allowance.';
      delete meal.venue;
      meal.alternates=[];
      meal.caveats=[...(meal.caveats||[]),meal.unscheduledReason];
    }
    mealRow.notScheduledMeal=true;
    mealRow.daypart=meal.daypart;
    mealRow.name='Dinner';
    delete mealRow.venueId;
    plan.scheduleWarnings=(plan.scheduleWarnings||[]).filter(w=>!w.startsWith(mealName+':'));
    plan.scheduleWarnings.push(message);
    plan.warnings=(plan.warnings||[]).filter(w=>!w.startsWith(mealName+':'));
    plan.warnings.push(message);
    for(const result of plan.requirementResults||[])if(result.kind==='type'&&result.value==='restaurant'&&result.status==='satisfied'){
      result.status='unmet';result.reason='Dinner was requested but no feasible pre-event restaurant stop could be scheduled.';
    }
    plan.experience.text=message;
    return;
  }
}

// Swap keeps the kind of place (2026-10-19): a winery is swapped for a winery, a lunch for a lunch, never a waterfall
// in a wine plan. input.swap = { key: "<day>-<daypart>", type }; the planner's own pick stays when it is that kind.
// Swap (2026-10-19, round 7): the slot always ends up with a different place of the same kind that is not already in
// the plan, or -- when there is none -- keeps the place that was there (swap.id) with a friendly note. It used to drop
// the ski day's optional activity silently, or offer a place already planned on another day.
const SWAP_ORDER = ['morning', 'midday', 'afternoon', 'late', 'evening', 'night'];
const SWAP_TYPE_WORDS = { restaurant: 'restaurant', cafe: 'café', pub: 'pub', cocktail: 'lounge', brewery: 'brewery', distillery: 'distillery', winery: 'winery', beach: 'beach', golf: 'golf course', outdoor: 'outdoor stop', indoor: 'indoor attraction', tour: 'tour', sport: 'activity' };
// Round 8 (2026-10-19): the slot keeps its purpose. A winery lunch is swapped for another winery that serves food, a
// vegan lunch for another vegan spot, a romantic dinner for another sit-down dinner (never pizza), dinner "in Naramata"
// for another Naramata dinner; and nothing already in the plan -- including a kept stop placed later in the day -- is
// ever offered.
function swapPurposeTest(original, stop, part, result, input, ctx, regions) {
  const reqItems = (input.requirements?.items || []).filter((i) => ['type', 'venue_kind', 'feature'].includes(i.kind) && i.strength !== 'prefer');
  const kept = original ? reqItems.filter((i) => tripRequirements.matches(original, i) && !(i.kind === 'type' && i.value === original.type)) : [];
  const features = original ? (ctx.features || []).filter((f) => original.features && original.features[f]) : [];
  const text = normWords(input.requirements?.text || input.text || '');
  const nameWords = original && ['winery', 'restaurant'].includes(original.type) && part === 'midday' ? wineryNameWords(input.facts || []) : null;
  // Round 9 (2026-10-19): lunch at a winery's restaurant (Miradoro at Tinhorn Creek) is swapped for another winery
  // restaurant when "lunch at a winery" was asked for, not for a barbecue joint.
  const wineryLunch = !!(original && original.type === 'winery' && (stop?.wineryLunch || (part === 'midday' && (result.theme === 'wine' || asksWineryLunch(text))) && wineryLunchSpot(original, nameWords)))
    || !!(original && original.type === 'restaurant' && part === 'midday' && asksWineryLunch(text) && wineryRestaurant(original, nameWords));
  const romantic = ROMANTIC_EVENING_OCCASIONS.includes(ctx.occasion) || requestsSpecialDinner(text);
  const dinner = ['evening', 'night'].includes(part) && original && ['restaurant', 'pub'].includes(original.type);
  const home = original && regions.includes(original.region) ? original.region : null;
  return {
    wineryLunch, romantic: romantic && dinner, home,
    ok: (v) => (!wineryLunch || wineryLunchSpot(v, nameWords)) && kept.every((i) => tripRequirements.matches(v, i)) && features.every((f) => v.features && v.features[f]) && !(romantic && dinner && casualDinner(v)),
    bonus: (v) => (romantic && dinner && specialDinner(v) ? 8 : 0) + (home && v.region === home ? 10 : 0) + (wineryLunch ? wineryLunchRank(v, nameWords) / 2 : 0),
  };
}
// The pins a Swap request sent only to keep the plan steady (every shown stop but the visitor's locks): soft.
function swapSoftPins(input) {
  const swap = input && input.swap;
  if (!swap || !input.pinned) return new Set();
  const locked = new Set(Array.isArray(swap.locked) ? swap.locked : []);
  return new Set(Object.keys(input.pinned).filter((k) => !locked.has(k)));
}
function applySwapPreference(result, input) {
  const swap = input && input.swap;
  if (!swap || !result || !(result.days || []).length) return;
  const [dayN, part] = String(swap.key).split('-');
  const day = result.days.find((d) => d.day === Number(dayN));
  if (!day) return;
  const stop = day.stops.find((s) => s.daypart === part && !s.event);
  if (stop && stop.noSwap) return;
  swapSlotStop(result, input, day, stop, part, result.days.flatMap((d) => d.stops));
}
// The one-slot swap itself (shared by day plans and, from round 10, short itineraries): `stop` is the slot's stop in
// `day` (or null for an empty slot), `allStops` every stop in the plan.
function swapSlotStop(result, input, day, stop, part, allStops) {
  const swap = input.swap;
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  // Round 8: the kept stops the planner places later (a late-afternoon tasting) count as already in the plan too.
  const others = new Set(allStops.filter((s) => s !== stop).map((s) => s.venue && s.venue.id).filter(Boolean));
  for (const [k, id] of Object.entries(input.pinned || {})) if (k !== swap.key) others.add(id);
  const dup = !!(stop && stop.venue && others.has(stop.venue.id));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const regions = day.regions || (day.region ? [day.region] : []);
  const original = swap.id ? byId.get(swap.id) : null;
  const purpose = swapPurposeTest(original, stop, part, result, input, ctx, regions);
  const corePick = stop && stop.venue && byId.get(stop.venue.id);
  if (corePick && corePick.type === swap.type && !dup && corePick.id !== swap.id && purpose.ok(corePick) && (!purpose.home || corePick.region === purpose.home)) return;
  const k = stop ? day.stops.indexOf(stop) : day.stops.findIndex((s) => SWAP_ORDER.indexOf(s.daypart) > SWAP_ORDER.indexOf(part));
  const at = k < 0 ? day.stops.length : k;
  const neighbours = [day.stops.slice(0, at).reverse().find((s) => s.venue && s !== stop), day.stops.slice(at).find((s) => s.venue && s !== stop)].filter(Boolean).map((s) => byId.get(s.venue.id)).filter(Boolean);
  const date = day.date || (input.tripDate ? new Date(new Date(`${input.tripDate}T12:00:00Z`).getTime() + (day.day - 1) * 86400000).toISOString().slice(0, 10) : null);
  const weekday = date ? WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : (input.startWeekday || null);
  const win = SLOT_WINDOWS[part] ? part : part === 'night' ? 'evening' : 'afternoon';
  // The ski day's optional activity is swapped for another after-ski activity (tube park, skating, a sleigh ride).
  const skiExtra = result.theme === 'ski' && part === 'afternoon';
  const skiResort = skiExtra && day.stops.find((s) => s.skiDay && s.venue) ? byId.get(day.stops.find((s) => s.skiDay && s.venue).venue.id) : null;
  const skiLight = skiResort && date ? tripRequirements.estimateDaylight(date, skiResort) : null;
  const skiDark = !!(skiLight && skiLight.sunsetMinutes < SKI_DAY_END + 90);
  // A stop borrowed from a nearby town (dinner in Penticton on a Naramata day) can be swapped within that town too.
  const towns = original && original.region && !regions.includes(original.region) ? regions.concat(original.region) : regions;
  // Round 9 (2026-10-19): a midday swap only offers somewhere to eat (gelato or a juice bar is not lunch), and an outdoor
  // stop swapped into the late afternoon or evening must leave an hour of daylight before the 30-minute margin.
  const middayMeal = part === 'midday' && !!original && (['restaurant', 'pub'].includes(original.type) || (original.type === 'cafe' && !['treat', 'other'].includes(cafeRole(original))));
  const mealOk = (v) => !middayMeal || ['restaurant', 'pub'].includes(v.type) || (v.type === 'cafe' && !['treat', 'other'].includes(cafeRole(v))) || wineryLunchSpot(v, null);
  const daylightOk = (v) => {
    if (!['late', 'evening', 'night'].includes(part) || !['outdoor', 'beach'].includes(v.type) || !date || v.indoorGolf) return true;
    const light = tripRequirements.estimateDaylight(date, v);
    return !light || light.sunsetMinutes - 30 - 60 >= (part === 'late' ? 900 : 1080);
  };
  // An indoor golf simulator is swapped for another simulator (never a course in January), a course for a course.
  const golfOk = (v) => v.type !== 'golf' || !original || !!v.indoorGolf === !!original.indoorGolf;
  // The kept start of this slot (round 9): a place already open then is preferred, so the rest of the day keeps its times.
  const keptStart = swap.times && Number.isInteger(swap.times[swap.key]) ? swap.times[swap.key] : null;
  const openAtKept = (v) => {
    if (keptStart == null || !weekday) return 0;
    const h = (v._hours || parseVenueHours(v.hours)).days[weekday];
    if (!h || h.status !== 'open') return 0;
    if (h.ranges.some(([a, b]) => a <= keptStart + 15 && b > keptStart + 45)) return 6;
    return h.ranges.some(([a, b]) => a <= keptStart + 45 && b > keptStart + 75) ? -8 : -30;
  };
  // A place whose listed hours leave no 45 minutes around the slot's kept time cannot take it (it was "Timing conflict").
  const fitsKept = (v) => {
    if (keptStart == null || !weekday) return true;
    const h = (v._hours || parseVenueHours(v.hours)).days[weekday];
    if (!h || h.status !== 'open') return !h || h.status !== 'closed';
    return h.ranges.some(([a, b]) => Math.max(a, keptStart) + 45 <= b && a <= keptStart + 120);
  };
  // Round 10 (2026-10-19): a winery lunch is swapped for another winery restaurant (or a winery with its own kitchen),
  // never a tasting room whose restaurant is listed, and never another part of an estate already in the plan (Miradoro
  // became Hester Creek's tasting room with Terrafina at Hester Creek for dinner).
  const estateWords = estateKitchens(facts).words;
  const planEstates = new Set([...others].map((id) => estateKey(byId.get(id), estateWords)).filter(Boolean));
  const estateOk = (v) => { const k = ['winery', 'restaurant'].includes(v.type) ? estateKey(v, estateWords) : null; return !k || !planEstates.has(k); };
  const typeOk = (v) => v.type === swap.type || (purpose.wineryLunch && ['winery', 'restaurant'].includes(v.type));
  const cands = facts.filter((v) => typeOk(v) && estateOk(v) && !(daytimePart(part) && eveningOnlyVenue(v)) && !(purpose.wineryLunch && (tastingRoomWithRestaurant(v, facts) || wineryLunchRank(v, estateWords) < 15)) && !others.has(v.id) && v.id !== swap.id && !ctx.exclude.has(v.id) && (!towns.length || towns.includes(v.region)) && mealOk(v) && daylightOk(v) && golfOk(v) && fitsKept(v) && !offSeasonSkip(v, { ...ctx, tripDate: date || ctx.tripDate })
    && (!skiExtra || (SKI_EXTRA_RE.test(v.textName || '') && (!skiDark || SKI_LIT_RE.test(v.textName || '')))) && purpose.ok(v)
    && eligible(v, ctx, false) && hoursFit(v, win, weekday).status !== 'closed' && !(date && seasonClosedOnTrip(v, { date })) && tripRequirements.venueAllowed(v, input.requirements, day.day, input.tripDate))
    .map((v) => { const km = neighbours.map((n) => kmBetween(n, v)).filter((x) => x != null); return { v, score: scoreVenue(v, ctx).score + purpose.bonus(v) + openAtKept(v) - (km.length ? Math.min(...km) * 1.5 : 6) }; });
  const pick = themePick(cands);
  const keepStop = corePick && !dup && corePick.id !== swap.id && !(purpose.wineryLunch && !(purpose.ok(corePick) && estateOk(corePick))) && !(DINING_TYPES.includes(corePick.type) && neighbours.some((n) => DINING_TYPES.includes(n.type) && n.type !== 'cafe'));
  if (!pick && keepStop) return; // the planner found another kind of place for the slot; that is still a swap
  const chosen = pick ? pick.v : original;
  if (!chosen) return;
  // Round 9: a late-afternoon slot made here is the day's filler before dinner, timed as one (60-90 minutes, in the
  // middle of the free time and in daylight), not a full visit that runs into the evening.
  if (!stop) { stop = { daypart: part, ...(part === 'late' ? { gapFill: true } : {}) }; day.stops.splice(at, 0, stop); }
  const extraCaveats = skiExtra ? ['Optional — skip it to keep skiing'] : [];
  // The slot's timing role stays with it (lunch on the hill, the after-ski extra, a late-afternoon filler).
  const roles = {};
  for (const key of ['onHill', 'afterSki', 'gapFill', 'fillStart', 'kind', 'component']) if (stop[key] !== undefined) roles[key] = stop[key];
  // Round 9: a lit trail or rink on a ski trip is lit whichever slot it is swapped into (no false daylight conflict).
  if ((roles.afterSki || result.theme === 'ski') && SKI_LIT_RE.test(chosen.textName || '')) roles.lit = true;
  const keep = { daypart: stop.daypart, label: stop.label || PLAN_DAYPART_LABELS[part] || part, ...roles, ...(purpose.wineryLunch ? { wineryLunch: true } : {}) };
  Object.keys(stop).forEach((key) => { delete stop[key]; });
  const purposeReasons = purpose.wineryLunch && chosen.type === 'winery' ? [{ code: 'meal', text: 'Lunch at a winery that serves food, so it is a tasting too', weight: 4 }] : [];
  Object.assign(stop, keep, stopFrom(chosen, { reasons: purposeReasons.concat(scoreVenue(chosen, ctx).reasons), caveats: extraCaveats }, regionReason(chosen, ctx), ctx));
  if (!pick) {
    const word = skiExtra ? 'after-ski activity' : purpose.wineryLunch ? 'winery that serves lunch' : SWAP_TYPE_WORDS[swap.type] || 'place';
    result.swapKept = { key: swap.key, id: chosen.id, name: chosen.name };
    result.swapNote = `No other ${word} nearby fits this part of the day, so ${chosen.name} stays in your plan.`;
  }
}
// Round 10 (2026-10-19): Swap on a short plan (a brewery crawl, an escape room and lunch, dinner and a show) is the same
// one-slot swap as on a day plan. The page sends the stops it shows, in order (swap.key "it-<n>", swap.stops
// [{ ref: "venue:53", label, daypart, component }]); the plan comes back with those stops, only stop n changed, and
// nothing added or taken away (it used to re-plan: a 3-stop crawl came back with 4 stops and a café).
function isItinerarySwap(input) { const swap = input && input.swap; return !!(swap && /^it-\d+$/.test(String(swap.key || '')) && Array.isArray(swap.stops)); }
function applyItinerarySwap(result, input) {
  if (!isItinerarySwap(input) || !result) return false;
  const holder = result.itinerary || result.outing;
  if (!holder || !Array.isArray(holder.stops)) return false;
  const swap = input.swap, n = Number(swap.key.slice(3));
  const shown = swap.stops.slice(0, 12).map((x) => (x && typeof x === 'object' ? x : {}));
  const refOf = (st) => (st.venue && st.venue.id ? `venue:${st.venue.id}` : st.event && st.event.id ? `event:${st.event.id}` : null);
  if (!shown[n] || shown[n].ref !== `venue:${swap.id}`) return false;
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const original = byId.get(swap.id);
  if (!original) return false;
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const fresh = holder.stops.slice();
  const take = (ref) => { const k = fresh.findIndex((st) => refOf(st) === ref); return k < 0 ? null : fresh.splice(k, 1)[0]; };
  const slotFields = (x) => {
    const o = { kind: 'venue', label: typeof x.label === 'string' ? x.label.slice(0, 60) : 'Stop', daypart: SWAP_ORDER.includes(x.daypart) ? x.daypart : 'afternoon', component: Number.isInteger(x.component) ? x.component : null };
    if (x.gapFill === true) o.gapFill = true;
    if (x.wineryLunch === true) o.wineryLunch = true;
    return o;
  };
  const stops = [];
  let slot = null;
  shown.forEach((x, j) => {
    const ref = typeof x.ref === 'string' ? x.ref : null;
    if (!ref) return; // a Free time card is worked out again from the new times
    const id = Number(ref.split(':')[1]);
    if (j === n) {
      // The planner's own stop for this part carries its roles (a winery lunch); the place is still the old one here.
      const same = fresh.find((st) => Number.isInteger(x.component) && st.component === x.component && !st.event);
      slot = { ...slotFields(x), ...(same && same.wineryLunch ? { wineryLunch: true } : {}), ...stopFrom(original, { reasons: scoreVenue(original, ctx).reasons, caveats: [] }, regionReason(original, ctx), ctx), alternates: same ? (same.alternates || []) : [] };
      stops.push(slot);
      return;
    }
    let st = take(ref);
    if (!st && ref.startsWith('venue:') && byId.get(id)) { const v = byId.get(id); st = { ...slotFields(x), ...stopFrom(v, { reasons: scoreVenue(v, ctx).reasons, caveats: [] }, regionReason(v, ctx), ctx), alternates: [] }; }
    if (!st && ref.startsWith('event:')) st = holder.stops.find((e) => e.event && Number.isInteger(x.component) && e.component === x.component) || null;
    if (!st) return;
    if (swap.times && Number.isInteger(swap.times[`it-${j}`]) && st.venue && !st.gapFill) st.keepStart = swap.times[`it-${j}`]; else delete st.keepStart;
    stops.push(st);
  });
  if (!slot) return false;
  const day = { day: 1, stops, regions: [original.region], date: input.tripDate || null };
  const before = slot.venue.id;
  swapSlotStop(result, input, day, slot, slot.daypart, stops);
  if (Number.isInteger(swap.times && swap.times[swap.key])) slot.keepStart = swap.times[swap.key];
  slot.swapSlot = true;
  if (slot.venue && slot.venue.id !== before) slot.alternates = (slot.alternates || []).filter((a) => a.venue && a.venue.id !== slot.venue.id && !stops.some((st) => st !== slot && st.venue && st.venue.id === a.venue.id));
  holder.stops = stops;
  return true;
}
// Round 9 (2026-10-19): Swap changes the one slot it was asked to change. Every other shown stop comes back in its own
// slot (a planner that re-picks a day used to drop the morning walk, or move a kept tasting), and a slot that was empty
// stays empty. A kept late-afternoon filler is put back by fillDinnerGaps, which also restores its timing.
function holdSwapPins(result, input) {
  const swap = input && input.swap;
  if (!swap || !input.pinned || !result || !(result.days || []).length) return;
  const pins = input.pinned;
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const order = (p) => { const k = SWAP_ORDER.indexOf(p); return k < 0 ? SWAP_ORDER.length : k; };
  // Each stop keeps its time of day (the start the visitor saw): the scheduler starts it no earlier than that, so a
  // shorter stop swapped in leaves free time rather than pulling lunch and the tastings forward.
  const times = swap.times && typeof swap.times === 'object' ? swap.times : {};
  const keepTime = (stop, key) => { if (Number.isInteger(times[key]) && !stop.gapFill) stop.keepStart = times[key]; else delete stop.keepStart; };
  const locked = new Set(Array.isArray(swap.locked) ? swap.locked : []);
  const swapPartOf = (day) => (Number(swap.key.split('-')[0]) === day.day ? swap.key.slice(swap.key.indexOf('-') + 1) : null);
  for (const day of result.days) {
    const keys = Object.keys(pins).filter((k) => Number(k.split('-')[0]) === day.day);
    if (!keys.length) continue;
    const pinnedIds = new Set(keys.map((k) => pins[k]));
    for (const key of keys) {
      // Locked stops are the core planner's to keep (or to report as no longer fitting); a tasting room is never put
      // back into an evening or night slot.
      if (key === swap.key || locked.has(key)) continue;
      const part = key.slice(key.indexOf('-') + 1), v = byId.get(pins[key]);
      if (!v || (['evening', 'night'].includes(part) && v.type === 'winery')) continue;
      let stop = day.stops.find((s) => s.daypart === part && !s.event);
      if (stop && stop.venue && stop.venue.id === v.id) { if (part === 'late' && !stop.gapFill && GAP_FILL_TYPES.includes(v.type) && !GAP_ALCOHOL_TYPES.includes(v.type)) { stop.gapFill = true; delete stop.fillStart; } keepTime(stop, key); continue; }
      // The same place moved to another slot of the day is taken out there.
      for (let k = day.stops.length - 1; k >= 0; k--) { const s = day.stops[k]; if (s !== stop && s.venue && s.venue.id === v.id && !s.event) day.stops.splice(k, 1); }
      if (part === 'late' && !stop) continue;
      if (!stop) {
        stop = { daypart: part };
        const at = day.stops.findIndex((s) => order(s.daypart) > order(part));
        day.stops.splice(at < 0 ? day.stops.length : at, 0, stop);
      }
      const keep = { daypart: part, label: stop.label || PLAN_DAYPART_LABELS[part] || part };
      for (const role of ['onHill', 'afterSki', 'skiDay', 'gapFill', 'fillStart', 'wineryLunch', 'lit', 'noSwap']) if (stop[role] !== undefined) keep[role] = stop[role];
      // A walk or museum kept in the late afternoon is the filler it was (60-90 minutes), not a full visit.
      if (part === 'late' && !keep.gapFill && GAP_FILL_TYPES.includes(v.type) && !GAP_ALCOHOL_TYPES.includes(v.type)) { keep.gapFill = true; delete keep.fillStart; }
      Object.keys(stop).forEach((k) => { delete stop[k]; });
      Object.assign(stop, keep, stopFrom(v, { reasons: scoreVenue(v, ctx).reasons, caveats: [] }, regionReason(v, ctx), ctx));
      keepTime(stop, key);
    }
    if (swapPartOf(day)) { const s = day.stops.find((x) => x.daypart === swapPartOf(day) && !x.event && x.venue); if (s) { keepTime(s, swap.key); s.swapSlot = true; } }
    // A place the planner added to a slot that had nothing (or that the visitor removed) is taken out again.
    const swapPart = swapPartOf(day);
    for (let k = day.stops.length - 1; k >= 0; k--) {
      const s = day.stops[k];
      if (!s.venue || s.event || s.daypart === swapPart || pinnedIds.has(s.venue.id)) continue;
      if (keys.includes(`${day.day}-${s.daypart}`)) continue;
      day.stops.splice(k, 1);
    }
  }
}
// Round 9 (2026-10-19): every full day ends with dinner. A day whose evening went to a brewery (the vegan day) or was
// left empty (the romantic weekend's Day 2) gets a sit-down dinner in its town, or in a town about 20-35 minutes away,
// with the evening drink moved after it. Days the visitor kept free ("one dinner"), half days, days with a show in the
// evening slot and requests with no dinner are left as they are.
function ensureDinners(result, input) {
  if (!result || !(result.days || []).length) return;
  const req = input.requirements || {};
  const text = normWords(req.text || input.text || '');
  if (/\b(?:no|skip|without|not) (?:a )?(?:dinners?|suppers?)\b|\bdinner (?:is )?(?:at home|on our own)\b/.test(text)) return;
  if (['morning', 'afternoon'].includes(req.daypart) || req.outingScope === 'short') return;
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const centroids = regionCentroids(facts);
  const used = new Set(result.days.flatMap((d) => d.stops.map((s) => s.venue && s.venue.id).filter(Boolean)));
  const cap = Number.isInteger(req.explicitMealCount) ? req.explicitMealCount : Infinity;
  let dinners = result.days.filter((d) => d.stops.some(isDinnerStop)).length;
  const baseCache = new Map();
  const base = (v) => { if (!baseCache.has(v.id)) baseCache.set(v.id, scoreVenue(v, ctx)); return baseCache.get(v.id); };
  // "Pizza one night": that dish is not repeated as the added dinner.
  const onceWords = (req.onceTerms || []).filter(Boolean);
  const once = (v) => onceWords.some((w) => `${v.textName || ''} ${v.textCuisine || ''}`.includes(w.slice(0, Math.max(4, w.length - 1))));
  const asked = new Set([...(ctx.types || []), ...(req.items || []).filter((i) => i.kind === 'type').map((i) => i.value)]);
  const opts = { base, nice: requestsNiceDinner(text) || ROMANTIC_EVENING_OCCASIONS.includes(ctx.occasion), strictNice: requestsSpecialDinner(text), text, wine: result.theme === 'wine' };
  for (const day of result.days) {
    if (dinners >= cap) return;
    const stops = day.stops;
    if (stops.some(isDinnerStop) || stops.some((s) => s.freeEvening) || stops.some((s) => s.event && s.daypart === 'evening')) continue;
    if (stops.some((s) => s.skiDay)) continue;
    // A day the visitor described on its own ("Day 2 coffee and an easy walk") has only what was asked for.
    if ((req.items || []).some((i) => i.dayIndex === day.day || (i.weekday && tripRequirements.requirementDay(i, input.tripDate) === day.day))) continue;
    const venues = stops.filter((s) => s.venue && !s.event);
    if (venues.length < 2) continue;
    const regions = day.regions || (day.region ? [day.region] : []);
    if (!regions.length) continue;
    const date = day.date || (input.tripDate ? new Date(new Date(`${input.tripDate}T12:00:00Z`).getTime() + (day.day - 1) * 86400000).toISOString().slice(0, 10) : null);
    const ok = (v) => !ctx.exclude.has(v.id) && !ctx.avoid.has(v.id) && eligible(v, ctx, false) && !(date && seasonClosedOnTrip(v, { date })) && !advisoryUnavailable(v.advisory && v.advisory.note);
    const last = venues.filter((s) => s.daypart !== 'evening' && s.daypart !== 'night').slice(-1)[0];
    const near = last ? byId.get(last.venue.id) : null;
    let pick = pickMeal(facts.filter((v) => regions.includes(v.region) && ok(v) && !once(v)), ctx, day.day, 'evening', near, used, { ...opts, nearName: near ? near.name : null });
    let far = null;
    for (const minutes of [MEAL_NEARBY_MINUTES, 35]) {
      if (pick) break;
      const towns = townsNear(centroids, regions, minutes);
      pick = pickMeal(facts.filter((v) => towns.includes(v.region) && ok(v) && !once(v)), ctx, day.day, 'evening', near, used, { ...opts, nearName: near ? near.name : null });
      if (pick) far = pick.v.region;
    }
    if (!pick) continue;
    // The evening drink (a brewery, a lounge) moves after dinner when that kind of place was asked for; otherwise
    // dinner takes its place.
    const evening = stops.find((s) => s.daypart === 'evening' && !s.event);
    if (evening && evening.venue && asked.has(evening.venue.type)) {
      if (!stops.some((s) => s.daypart === 'night')) { evening.daypart = 'night'; evening.label = PLAN_DAYPART_LABELS.night; }
      else continue;
    } else if (evening) { stops.splice(stops.indexOf(evening), 1); if (evening.venue) used.delete(evening.venue.id); }
    const caveats = far ? [nearbyTownCaveat(ctx, centroids, regions, far, 'dinner')] : [];
    const stop = { daypart: 'evening', label: PLAN_DAYPART_LABELS.evening, ...stopFrom(pick.v, { reasons: pick.reasons, caveats: (pick.caveats || []).concat(caveats) }, regionReason(pick.v, ctx), ctx) };
    const at = stops.findIndex((s) => SWAP_ORDER.indexOf(s.daypart) > SWAP_ORDER.indexOf('evening'));
    stops.splice(at < 0 ? stops.length : at, 0, stop);
    used.add(pick.v.id);
    dinners += 1;
  }
}
// "No driving after 7pm" (2026-10-19): dinner is a short walk from the day's last stop where a listed restaurant
// allows it; otherwise the drive to dinner has to end by the cut-off. Kept and pinned dinners stay.
function eveningDinnerStart(day, result, cutoff) {
  const row = (result.schedule || []).find((x) => x.day === day.day && x.venueId === day.stops.find(isDinnerStop)?.venue?.id);
  return row && Number.isFinite(row.startMinutes) ? row.startMinutes : 1080;
}
function applyEveningWalk(result, input, item) {
  const facts = input.facts || [], byId = new Map(facts.map((v) => [v.id, v]));
  const ctx = buildContext(input.intent || {}, input.labels || {}, input);
  const used = new Set(result.days.flatMap((d) => d.stops.map((s) => s.venue && s.venue.id).filter(Boolean)));
  const pinnedIds = new Set(Object.values(input.pinned || {}));
  const reqItems = (input.requirements?.items || []).filter((i) => ['type', 'venue_kind', 'feature'].includes(i.kind));
  for (const day of result.days) {
    const k = day.stops.findIndex(isDinnerStop);
    if (k < 0) continue;
    const dinner = day.stops[k], prevStop = day.stops.slice(0, k).reverse().find((s) => s.venue);
    const from = prevStop && byId.get(prevStop.venue.id), to = byId.get(dinner.venue.id);
    if (!from || !to || pinnedIds.has(to.id) || !hasCoords(from)) continue;
    const km = kmBetween(from, to);
    if (km != null && km <= item.limitKm) continue;
    const date = day.date || (input.tripDate ? new Date(new Date(`${input.tripDate}T12:00:00Z`).getTime() + (day.day - 1) * 86400000).toISOString().slice(0, 10) : null);
    const weekday = date ? WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] : null;
    const kept = reqItems.filter((i) => tripRequirements.matches(to, i));
    const ok = (v) => v.type === 'restaurant' && !used.has(v.id) && !ctx.exclude.has(v.id) && hasCoords(v)
      && hoursFit(v, 'evening', weekday).status !== 'closed' && !(v.rating != null && v.rating < 3.8) && !fastFood(v) && !(date && seasonClosedOnTrip(v, { date }))
      && !advisoryUnavailable(v.advisory && v.advisory.note) && tripRequirements.venueAllowed(v, input.requirements, day.day, input.tripDate) && kept.every((i) => tripRequirements.matches(v, i));
    const score = (v) => (v.rating || 4) * 4 + (v.price >= 2 ? 2 : 0) - kmBetween(from, v) * 2 + (hoursFit(v, 'evening', weekday).status === 'verified' ? 3 : 0);
    let pick = themePick(facts.filter((v) => ok(v) && kmBetween(from, v) <= item.limitKm).map((v) => ({ v, score: score(v) })));
    // Round 7 (2026-10-19): with nothing on foot, dinner is still in the same town or a short drive away -- never
    // across the lake (Naramata to Summerland is about 40 minutes round the south end).
    const shortDrive = (v) => { const t = tripRequirements.estimateTransfer(from, v); return !!t && t.maxMinutes <= EVENING_SHORT_DRIVE_MINUTES; };
    if (!pick && !shortDrive(to)) pick = themePick(facts.filter((v) => ok(v) && (v.region === from.region || shortDrive(v)) && shortDrive(v)).map((v) => ({ v, score: score(v) })));
    if (!pick) continue;
    const walk = kmBetween(from, pick.v);
    const onFoot = walk <= item.limitKm;
    used.delete(to.id); used.add(pick.v.id);
    const keepPart = { daypart: dinner.daypart, label: dinner.label };
    Object.keys(dinner).forEach((key) => { delete dinner[key]; });
    Object.assign(dinner, keepPart, stopFrom(pick.v, { reasons: scoreVenue(pick.v, ctx).reasons.concat(onFoot ? { code: 'nearby', text: `${walk < 1 ? 'Under 1 km' : `About ${Math.round(walk * 10) / 10} km`} on foot from ${from.name}, so the evening needs no car`, weight: 6 } : { code: 'nearby', text: `A short drive from ${from.name}, so the evening stays close`, weight: 6 }), caveats: [] }, [], ctx));
  }
}
const EVENING_SHORT_DRIVE_MINUTES = 12;
function eveningWalkLateDrives(result, item) {
  const out = [];
  for (const day of result.days) {
    const k = day.stops.findIndex(isDinnerStop);
    if (k < 0) continue;
    const dinner = day.stops[k], prevStop = day.stops.slice(0, k).reverse().find((s) => s.venue);
    if (!prevStop) continue;
    const a = { lat: prevStop.venue.latitude, lng: prevStop.venue.longitude }, b = { lat: dinner.venue.latitude, lng: dinner.venue.longitude };
    const km = kmBetween(a, b);
    if (km == null || km <= item.limitKm) continue;
    if (eveningDinnerStart(day, result, item.value) <= item.value) continue;
    out.push({ day: day.day, fromName: prevStop.venue.name, toName: dinner.venue.name, km });
  }
  return out;
}
// Round 8 (2026-10-19): a one-day request that gives each part of the day its own town is a one-day plan with those
// towns, not a list or a single stop. A request built around an event keeps its itinerary.
// Round 12 (2026-10-20): a longer trip with the same split ("wine tasting in West Kelowna then dinner in Kelowna, 3
// days") keeps that order every day (it planned two Kelowna days, then a West Kelowna day with its own dinner).
function withDayPartRegions(input, intent) {
  const many = Math.max(intent.days || 1, ...(input?.requirements?.items || []).filter((i) => i.kind === 'days').map((i) => i.value));
  if (!input || many > 7) return input;
  if (input.trip?.route || (input.trip?.components || []).some((c) => c.kind === 'event') || ['events', 'navigate', 'unknown'].includes(intent.mode)) return input;
  const plan = dayPartRegions(input.text || input.requirements?.text || '', intent.regions || [], (input.labels || {}).regions); // the raw text keeps its commas
  if (!plan) return input;
  if (many > 1 && !(plan.parts && plan.parts.evening && Object.values(plan.parts).some((r) => r !== plan.parts.evening))) return input;
  intent.mode = 'plan'; intent.days = many;
  intent.regions = plan.order.slice();
  return { ...input, trip: null, tripEvents: [], partRegions: plan };
}
// Round 14 (2026-10-20): "Other options" never repeat a stop that is already in the plan (a brewery crawl offered its
// own second and third breweries as options for the first).
function withoutRepeatedAlternates(result) {
  if (!result || typeof result !== 'object') return result;
  const stops = (result.days || []).flatMap((d) => d.stops || []).concat((result.itinerary && result.itinerary.stops) || [], (result.outing && result.outing.stops) || []);
  const ids = new Set(stops.filter((s) => s && s.venue).map((s) => s.venue.id));
  const keep = (list) => (list || []).filter((a) => !(a && a.venue && ids.has(a.venue.id)));
  for (const s of stops) if (s && Array.isArray(s.alternates)) s.alternates = keep(s.alternates);
  if (result.outing && Array.isArray(result.outing.alternates)) result.outing.alternates = keep(result.outing.alternates);
  return result;
}
// Round 15 (2026-10-20): every plan has clock times. A plan with no date or start time is timed as a suggested schedule
// for a typical day (the named weekday, else the coming Saturday), with the same hours, visit
// lengths and drive times a dated plan uses; the rows carry no date (My Trip keeps the times, not a date) and are
// marked suggested. The plan's stops, notes and warnings are not changed.
const SUGGESTED_TIMES_NOTE = 'Times are a suggested schedule for a typical day; check each place’s hours before you go.';
function typicalDate(input, result, wantDay) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(input.tripDate || '') ? input.tripDate : null;
  if (!base) return null;
  const at = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const wd = new Date(`${base}T12:00:00Z`).getUTCDay();
  const want = WEEKDAYS.includes(input.startWeekday) ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(input.startWeekday)
    : wantDay != null ? wantDay : 6; // a Saturday: the day most places are open, and when most visitors go
  return want == null ? base : at(base, (want - wd + 7) % 7);
}
function addSuggestedTimes(result, input) {
  if (!result || !['day_plan', 'multi_day', 'itinerary', 'outing'].includes(result.kind) || (result.schedule || []).length) return result;
  const stops = (result.days || []).flatMap((d) => d.stops || []).concat((result.itinerary && result.itinerary.stops) || [], (result.outing && result.outing.stops) || []);
  if (!stops.some((s) => s.venue || s.event)) return result;
  if (!typicalDate(input, result)) return result;
  const req = input.requirements || { items: [], conflicts: [] };
  // "tonight" / « ce soir » keep today and the window's start (the late-window rules), not a typical Saturday.
  const windowed = !!(req.windowClock || req.windowToday || (input.intent && input.intent.when && input.intent.when.preset === 'today'));
  const fixedDate = windowed && /^\d{4}-\d{2}-\d{2}$/.test(req.startDate || input.tripDate || '') ? (req.startDate || input.tripDate) : null;
  const partStart = { morning: 540, afternoon: 780, evening: 1020, night: 1140 }[input.intent && input.intent.when && input.intent.when.daypart] || null;
  const fixedStart = windowed && req.windowClock && Number.isFinite(req.windowClock.start) ? req.windowClock.start
    : windowed && fixedDate && input.clock && Number.isInteger(input.clock.minutes) && fixedDate === input.tripDate ? Math.max(Math.ceil(input.clock.minutes / 15) * 15, partStart || 0) : null;
  const run = (startMinutes, date = fixedDate || typicalDate(input, result)) => {
    if (startMinutes == null && fixedStart != null) startMinutes = fixedStart;
    const probe = JSON.parse(JSON.stringify(result));
    probe.days = probe.days || [];
    try { scheduleTripByHours(probe, input, { ...req, items: req.items || [], conflicts: [], startDate: date, endDate: null, ...(startMinutes != null ? { startMinutes } : {}) }, { probe: true }); } catch (e) { return null; }
    const rows = probe.schedule || [];
    return { probe, rows, date, startMinutes, untimed: rows.filter((r) => !Number.isFinite(r.startMinutes)).length, timed: rows.filter((r) => Number.isFinite(r.startMinutes)).length };
  };
  // The usual start for the plan's first stop first; then a few other starts, kept only when they time more stops
  // (an evening outing whose first stop closes at 5 PM starts earlier).
  let best = run(null);
  const first = stops.find((x) => x.venue || x.event);
  const tries = ['evening', 'night'].includes(first && first.daypart) ? [1020, 960, 900, 1110] : ['afternoon', 'late'].includes(first && first.daypart) ? [720, 840, 900] : [600, 660, 720, 480];
  for (const m of tries) { if (!best || !best.untimed) break; if (fixedStart != null && m < fixedStart) continue; const t = run(m); if (t && t.untimed < best.untimed) best = t; }
  // With no weekday named, a Friday or Thursday is tried when a stop is closed on the Saturday (or the Sunday after).
  if (best && best.untimed && !fixedDate && !WEEKDAYS.includes(input.startWeekday)) for (const wd of [5, 4]) { const t = run(null, typicalDate(input, result, wd)); if (t && t.untimed < best.untimed) best = t; if (!best.untimed) break; }
  // A crawl's lunch that falls after the first tasting (a brewery that opens at 4 PM) is its dinner.
  if (best && best.untimed && result.kind === 'itinerary' && result.itinerary) {
    const list = result.itinerary.stops || [];
    let changed = false;
    for (const st of list) {
      if (!st.venue || st.label !== 'Lunch' || st.component != null) continue;
      const row = best.rows.find((r) => r.venueId === st.venue.id);
      const before = best.rows.filter((r) => Number.isFinite(r.endMinutes) && list.findIndex((x) => x.venue && x.venue.id === r.venueId) < list.indexOf(st));
      if (row && !Number.isFinite(row.startMinutes) && before.some((r) => r.endMinutes >= 870)) {
        // A dinner place near the last tasting, open in the evening (the lunch place may close at 2:30).
        const facts = input.facts || [], prevStop = [...list.slice(0, list.indexOf(st))].reverse().find((x) => x.venue), from = prevStop && facts.find((v) => v.id === prevStop.venue.id);
        const used = new Set(list.filter((x) => x.venue).map((x) => x.venue.id));
        const ctx = buildContext(input.intent || {}, input.labels || {}, input);
        const pick = from && facts.filter((v) => v.type === 'restaurant' && !used.has(v.id) && v.region === from.region && hasCoords(v) && eligible(v, ctx, false) && !fastFood(v) && hoursFit(v, 'evening', 'sat').status === 'verified')
          .map((v) => ({ v, score: scoreVenue(v, ctx).score - (kmBetween(from, v) || 8) * 3 })).sort((a, b) => b.score - a.score || a.v.id - b.v.id)[0];
        if (pick) { const at = list.indexOf(st); list[at] = { kind: 'venue', label: 'Dinner', daypart: 'evening', component: null, ...stopFrom(pick.v, { reasons: scoreVenue(pick.v, ctx).reasons.concat({ code: 'meal', text: 'Something to eat between the tastings', weight: 3 }), caveats: [] }, regionReason(pick.v, ctx), ctx), alternates: [] }; changed = true; }
      }
    }
    if (changed) { const t = run(null); if (t && t.untimed < best.untimed) best = t; }
  }
  // Round 15b: a crawl whose stops cannot all be timed tries its other orders (see orderCrawlByHours).
  if (best && best.untimed && result.kind === 'itinerary' && result.itinerary && !input.swap) {
    const original = result.itinerary.stops;
    const bestOf = () => { let b = run(null); for (const m of [720, 780, 840, 900]) { if (!b || !b.untimed) break; const t = run(m); if (t && t.untimed < b.untimed) b = t; } return b; };
    const times = new Map();
    const reordered = orderCrawlByHours(result, (order) => { result.itinerary.stops = order; const t = bestOf(); result.itinerary.stops = original; times.set(order, t); return t ? t.rows : [{}]; });
    if (reordered && times.get(reordered) && times.get(reordered).untimed < best.untimed) { result.itinerary.stops = reordered; best = times.get(reordered); }
  }
  // Weekly audit (2026-10-25): a stop that still cannot fit before it closes was kept with no time, only a small
  // "Timing conflict" tag and no warning (Origin Wines after three Naramata tastings on a Saturday). It is taken out
  // with a note saying why, when the plan keeps at least two stops and the visitor did not name the place; otherwise
  // the plan says so in its warnings.
  if (best && best.untimed && !input.swap) {
    const named = new Set((req.items || []).filter((i) => i.kind === 'venue').map((i) => i.value));
    const factsById = new Map((input.facts || []).map((v) => [v.id, v]));
    const listOf = (row) => (result.days || []).length ? ((result.days.find((d) => d.day === row.day) || {}).stops || null) : ((result.itinerary && result.itinerary.stops) || (result.outing && result.outing.stops) || null);
    const closesAt = (v, date) => {
      const day = v && date ? (v._hours || parseVenueHours(v.hours)).days[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T12:00:00Z`).getUTCDay()]] : null;
      return day && day.status === 'open' && day.ranges.length ? clockText(Math.min(day.ranges[day.ranges.length - 1][1], 1439)) : null;
    };
    const warned = new Set();
    for (let guard = 0; guard < 4 && best && best.untimed; guard++) {
      const row = best.rows.find((r) => r.status === 'unmet' && r.venueId && !named.has(r.venueId) && !warned.has(`${r.day}|${r.venueId}`));
      const list = row && listOf(row);
      const at = list ? list.findIndex((st) => st.venue && st.venue.id === row.venueId) : -1;
      if (at < 0) break;
      const v = factsById.get(row.venueId) || list[at].venue, close = closesAt(factsById.get(row.venueId), best.date);
      // A meal is never taken out (a ski day's dinner); it, and a two-stop outing, get the warning instead.
      if (list.filter((st) => st.venue || st.event).length <= 2 || isDinnerStop(list[at]) || isLunchStop(list[at])) {
        warned.add(`${row.day}|${row.venueId}`);
        result.warnings = [...(result.warnings || []), `${v.name}: ${close ? `it closes at ${close}, so` : 'its listed hours mean'} it may not fit after the stop before it. Start earlier or swap it for another place.`];
        continue;
      }
      const removed = list.splice(at, 1)[0];
      const t = run(best.startMinutes, best.date);
      if (!t || t.untimed >= best.untimed) { list.splice(at, 0, removed); break; }
      best = t;
      // Planner (2026-10-27): a second tasting the planner added ("wine and dinner") goes quietly.
      const comp = typeof removed.component === 'number' ? ((input.trip && input.trip.components) || [])[removed.component] : removed.component;
      if (comp && comp.extraTasting) continue;
      result.notes = [...(result.notes || []), `${v.name} was left out: ${close ? `it closes at ${close},` : 'its listed hours end'} before the plan would get there.`];
    }
  }
  // Round 15b (2026-10-20): a suggested day that starts at 9 with a 45-minute walk and then waits until lunch at noon
  // starts later instead (the walk at 10:45, lunch at noon): the start with the least waiting between stops is kept,
  // when every stop is still timed. Waiting for dinner is left to the late-afternoon filler below.
  if (best && best.timed && !best.untimed && fixedStart == null && !input.swap) {
    const firstWait = (t) => { const byDay = new Map(); for (const r of t.rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); }
      let n = 0; for (const rs of byDay.values()) { const lunchAt = rs.findIndex((r, i) => i > 0 && Number.isFinite(r.startMinutes) && r.startMinutes >= 690 && r.startMinutes <= 840); for (let i = 1; i <= lunchAt; i++) n += rs[i].waitMinutes || 0; } return n; };
    const start0 = best.rows.length && Number.isFinite(best.rows[0].startMinutes) ? best.rows[0].startMinutes : null;
    const wait0 = firstWait(best);
    if (start0 != null && wait0 >= 60) {
      let pick = null;
      // 2026-10-25: a morning coffee is not pushed up against lunch (coffee at 10:45, lunch at 11:30 on a relaxed
      // Summerland day and a Penticton girls' weekend): the two start at least two hours apart.
      const typeOfId = new Map(stops.filter((x) => x.venue).map((x) => [x.venue.id, x.venue.type]));
      const coffeeIntoLunch = (t) => { const byDay = new Map(); for (const r of t.rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); }
        for (const rs of byDay.values()) { const [a, b] = rs; if (a && b && typeOfId.get(a.venueId) === 'cafe' && ['restaurant', 'pub', 'cafe'].includes(typeOfId.get(b.venueId)) && Number.isFinite(a.startMinutes) && Number.isFinite(b.startMinutes) && b.startMinutes - a.startMinutes < 120) return true; }
        return false; };
      for (let m = start0 + 15; m <= Math.min(start0 + 180, 690); m += 15) {
        const t = run(m);
        if (!t || t.untimed > best.untimed || t.rows.length !== best.rows.length) continue;
        if (coffeeIntoLunch(t) && !coffeeIntoLunch(best)) continue;
        const w = firstWait(t);
        if (w < wait0 - 30 && (!pick || w < pick.w)) pick = { t, w };
        if (w === 0) break;
      }
      if (pick) best = pick.t;
    }
  }
  // 2026-10-25: an outing whose only meal is dinner ("hike then dinner in Vernon": the hike at 9 AM, dinner at 6 PM)
  // starts later, so its last stop ends about half an hour before dinner -- every stop still timed, in the same order,
  // and no outdoor stop past daylight.
  if (best && best.timed && !best.untimed && fixedStart == null && !input.swap && result.kind === 'itinerary' && result.itinerary) {
    const list = result.itinerary.stops || [];
    // A stop's component is the part object while planning and its index once the plan is built.
    const mealOfStop = (x) => { const c = typeof x.component === 'number' ? ((input.trip && input.trip.components) || [])[x.component] : x.component; return x.kind === 'venue' && c ? c.meal || null : null; };
    const meals = list.map(mealOfStop).filter(Boolean);
    const dinner = list.find((x) => x.venue && ['dinner', 'supper'].includes(mealOfStop(x)));
    if (dinner && meals.every((m) => ['dinner', 'supper'].includes(m)) && !list.some((x) => x.kind === 'event' || (x.venue && x.venue.type === 'golf'))) {
      const gapOf = (t) => { const i = t.rows.findIndex((r) => r.venueId === dinner.venue.id); return i > 0 ? t.rows[i].startMinutes - t.rows[i - 1].endMinutes : 0; };
      const dinnerStart = (t) => (t.rows.find((r) => r.venueId === dinner.venue.id) || {}).startMinutes;
      const order = (t) => t.rows.map((r) => r.venueId).join(',');
      const gap0 = gapOf(best), start0 = best.rows[0] && best.rows[0].startMinutes;
      if (gap0 > 90 && Number.isFinite(start0)) {
        for (let m = start0 + Math.floor((gap0 - 30) / 15) * 15; m > start0; m -= 15) {
          const t = run(m);
          if (!t || t.untimed || order(t) !== order(best) || dinnerStart(t) > dinnerStart(best) || t.rows.some((r) => r.daylight && r.daylight.status === 'conflict')) continue;
          if (gapOf(t) < gap0) { best = t; break; }
        }
      }
    }
  }
  if (!best || !best.timed) return result;
  // Round 15b (2026-10-20): a suggested schedule's long wait before dinner (2:50 to 6 PM, shown as a 195-minute free
  // interval) gets the same nearby stop, or "Free time" card, a dated plan gets (day plans only: a short outing
  // keeps the stops asked for). The filled plan's stops are then the plan's stops.
  let filled = false;
  // 2026-10-21: on a Swap only the kept late-afternoon stops come back (fillDinnerGaps never adds a new one then); before,
  // a Swap on an undated plan dropped every kept late tasting (10 stops became 8).
  if ((best.probe.days || []).length) {
    const reqD = { ...req, items: req.items || [], conflicts: [], startDate: best.date, endDate: null, ...(best.startMinutes != null ? { startMinutes: best.startMinutes } : {}) };
    const fillInput = { ...input, intent: input.intent || {}, tripDate: best.date || input.tripDate };
    const snap = (x) => JSON.stringify(x.days.map((d) => (d.stops || []).map((st) => [st.venue && st.venue.id, st.event && st.event.id, !!st.freeTime, st.dinnerFrom || null])));
    const before = snap(best.probe);
    try {
      if (fillDinnerGaps(best.probe, fillInput, reqD)) scheduleTripByHours(best.probe, input, reqD, { probe: true });
      if (!input.swap) pullDinnersForward(best.probe, fillInput, reqD);
      scheduleTripByHours(best.probe, input, reqD, { probe: true });
      filled = snap(best.probe) !== before;
    } catch (e) { filled = false; }
    if (filled) {
      const rows = best.probe.schedule || [];
      if (rows.some((r) => !Number.isFinite(r.startMinutes)) && rows.filter((r) => !Number.isFinite(r.startMinutes)).length > best.untimed) filled = false;
      else best = { ...best, rows, timed: rows.filter((r) => Number.isFinite(r.startMinutes)).length, untimed: rows.filter((r) => !Number.isFinite(r.startMinutes)).length };
    }
  }
  // 2026-10-25: "breakfast, a winery and dinner in Kelowna" left 11 AM to 6 PM empty with no lunch: a short outing on
  // this path gets the same lunch, extra stop or Free time card (fillItineraryGaps) as an outing with requirements.
  if (!filled && !input.swap && result.kind === 'itinerary' && result.itinerary && best && best.timed && !best.untimed) {
    try {
      const reqI = { ...req, items: req.items || [], conflicts: [], startDate: best.date, endDate: null, ...(best.startMinutes != null ? { startMinutes: best.startMinutes } : {}) };
      const probe = JSON.parse(JSON.stringify(best.probe));
      const before = JSON.stringify(probe.itinerary.stops.map((st) => [st.venue && st.venue.id, !!st.freeTime]));
      if (fillItineraryGaps(probe, { ...input, intent: input.intent || {}, tripDate: best.date || input.tripDate }, reqI)) {
        scheduleTripByHours(probe, input, reqI, { probe: true });
        const rows = probe.schedule || [];
        if (JSON.stringify(probe.itinerary.stops.map((st) => [st.venue && st.venue.id, !!st.freeTime])) !== before && !rows.some((r) => !Number.isFinite(r.startMinutes))) {
          result.itinerary.stops = probe.itinerary.stops;
          best = { ...best, probe, rows, timed: rows.length, untimed: 0 };
        }
      }
    } catch (e) { /* keep the plan as it was */ }
  }
  // Planner (2026-10-27): the same long-wait pass as a dated plan (closeIdleGaps) on the suggested times: "a day at the
  // beach in Osoyoos" waited 110 minutes after lunch, a Penticton pub crawl from 3:36 to 6 PM.
  if (best && best.timed && !input.swap && fixedStart == null && !userNamedTimes(req)) {
    try {
      const reqG = { ...req, items: req.items || [], conflicts: [], startDate: best.date, endDate: null, ...(best.startMinutes != null ? { startMinutes: best.startMinutes } : {}) };
      const probe = JSON.parse(JSON.stringify(best.probe));
      if (closeIdleGaps(probe, { ...input, intent: input.intent || {}, tripDate: best.date || input.tripDate }, reqG, { probe: true })) {
        const rows = probe.schedule || [];
        const untimed = rows.filter((r) => !Number.isFinite(r.startMinutes)).length;
        if (untimed <= best.untimed) {
          if ((probe.days || []).length) filled = true;
          else if (result.itinerary && probe.itinerary) result.itinerary.stops = probe.itinerary.stops;
          else if (result.outing && probe.outing) result.outing.stops = probe.outing.stops;
          best = { ...best, probe, rows, timed: rows.length - untimed, untimed };
        }
      }
    } catch (e) { /* keep the plan as it was */ }
  }
  // 2026-10-25: a Penticton family trip said "Nothing matching “ice cream” was available" although the free time
  // before dinner was then filled with a shake shop: a food word a filled-in stop now matches is not reported missing.
  if (filled && Array.isArray(result.warnings)) {
    const factsById = new Map((input.facts || []).map((v) => [v.id, v]));
    const planned = (best.probe.days || []).flatMap((d) => (d.stops || []).map((st) => st.venue && factsById.get(st.venue.id)).filter(Boolean));
    result.warnings = result.warnings.filter((w) => {
      const m = /^Nothing matching “(.+?)” was available/.exec(String(w || ''));
      const ft = m && (((input.intent && input.intent.foodTerms) || []).find((f) => normWords(f.term) === normWords(m[1])) || { term: normWords(m[1]), cuisine: null });
      return !m || !planned.some((v) => foodMatch(v, ft));
    });
  }
  if (filled) {
    const clean = (st) => { if (!st) return st; const { scheduleNote, ...rest } = st; return { ...rest, caveats: (rest.caveats || []).filter((c) => c !== scheduleNote && !/\b20\d\d-\d\d-\d\d\b/.test(c)) }; };
    result.days = best.probe.days.map((d, i) => { const { date: _date, ...rest } = d; return { ...(result.days[i] || {}), ...rest, stops: (d.stops || []).map(clean) }; });
    if (best.probe.experience) result.experience = best.probe.experience;
  }
  // A stop the timing replaced because its hours did not fit (with its own "Used instead of" note) is replaced here too.
  const lists = (x) => ((x.days || []).length ? x.days.map((d) => d.stops || []) : [(x.itinerary && x.itinerary.stops) || (x.outing && x.outing.stops) || []]);
  const mine = lists(result), theirs = lists(best.probe);
  if (!filled) mine.forEach((list, i) => list.forEach((st, j) => {
    const o = theirs[i] && theirs[i][j];
    if (st && st.venue && o && o.venue && o.venue.id !== st.venue.id) {
      const { scheduleNote, ...rest } = o;
      list[j] = { ...rest, caveats: (rest.caveats || []).filter((c) => c !== scheduleNote && !/\b20\d\d-\d\d-\d\d\b/.test(c)) };
    }
  }));
  // Audit fix (2026-10-27): a plan for a real day ("tonight", "tomorrow", "on Tuesday", "this Saturday", « samedi »)
  // keeps that date on its rows, so the trip API's happy hour, specials and weekly-nights lines (which read
  // schedule[].date) reach the visitor, and it is not called "a typical day". Only a truly undated plan (timed from a
  // typical Saturday) drops the date.
  const realDay = !!(best.date && (fixedDate || WEEKDAYS.includes(input.startWeekday)));
  result.schedule = best.rows.map(({ date: d, ...r }) => (realDay && d ? { ...r, date: d, suggested: true } : { ...r, suggested: true }));
  result.suggestedTimes = true;
  if (realDay) result.notes = (result.notes || []).filter((x) => x !== SUGGESTED_TIMES_NOTE);
  else if (!(result.notes || []).includes(SUGGESTED_TIMES_NOTE)) result.notes = [...(result.notes || []), SUGGESTED_TIMES_NOTE];
  return result;
}
// Round 15: the summary in plain words, naming each place in order (trip-story.js), in English and French.
function addStory(result, input) {
  if (!result || !['day_plan', 'multi_day', 'itinerary', 'outing'].includes(result.kind)) return result;
  const intent = input.intent || {};
  const story = tripStory.buildStory(result, input.facts || [], { kids: !!(intent.party && intent.party.kids) || intent.occasion === 'family', dog: !!(intent.party && intent.party.dog) });
  if (story) result.story = story;
  return result;
}
// Round 15b (2026-10-20): a crawl whose last stop could not be timed (Abandoned Rail closes at 7 PM, but the crawl started
// at BNA, which opens at 4, so it came after dinner) tries its drink stops in the other orders, the meal keeping its
// place, and keeps the order that times the most stops with the least waiting. Returns the stops to use, or null.
const CRAWL_DRINK_TYPES = ['brewery', 'winery', 'distillery', 'cocktail', 'pub'];
function crawlOrders(stops) {
  const at = stops.map((s, i) => (s.venue && !s.event && CRAWL_DRINK_TYPES.includes(s.venue.type) && s.label !== 'Dinner' && s.label !== 'Lunch' && s.label !== 'Late lunch' ? i : -1)).filter((i) => i >= 0);
  if (at.length < 2 || at.length > 4 || new Set(at.map((i) => stops[i].venue.type)).size !== 1) return [];
  const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms(xs.slice(0, i).concat(xs.slice(i + 1))).map((p) => [x].concat(p))));
  return perms(at.map((i) => stops[i])).slice(1).map((order) => { const out = stops.slice(); at.forEach((i, n) => { out[i] = order[n]; }); return out; });
}
function crawlScore(rows) {
  return { untimed: rows.filter((r) => !Number.isFinite(r.startMinutes)).length, wait: rows.slice(1).reduce((n, r) => n + (r.waitMinutes || 0), 0) };
}
function orderCrawlByHours(result, timeIt) {
  if (!result || result.kind !== 'itinerary' || !result.itinerary || !(result.itinerary.stops || []).length) return null;
  const stops = result.itinerary.stops;
  const orders = crawlOrders(stops);
  if (!orders.length) return null;
  let best = { stops, ...crawlScore(timeIt(stops)) };
  if (!best.untimed) return null;
  for (const order of orders) {
    const sc = crawlScore(timeIt(order));
    if (sc.untimed < best.untimed || (sc.untimed === best.untimed && sc.wait < best.wait)) best = { stops: order, ...sc };
  }
  return best.stops === stops ? null : best.stops;
}
// Round 15b (2026-10-20): a crawl's meal that starts at 2:30 PM or later (lunch between the second and third brewery at
// 3:10 PM) is labelled a late lunch, not "Lunch".
const LATE_LUNCH_FROM = 14 * 60 + 30;
const DINNER_FROM = 17 * 60;
function labelLateLunches(result) {
  if (!result || !(result.schedule || []).length) return result;
  const lists = (result.days || []).length ? result.days.map((d) => ({ day: d.day, stops: d.stops || [] })) : [{ day: 1, stops: (result.itinerary && result.itinerary.stops) || (result.outing && result.outing.stops) || [] }];
  for (const g of lists) for (const st of g.stops) {
    // A crawl's meal (no component of its own) put before 5 PM by the crawl's order is lunch again.
    const crawlMeal = result.kind === 'itinerary' && st.component == null && (st.reasons || []).some((r) => r.code === 'meal');
    if (!st.venue || !(st.label === 'Lunch' || (crawlMeal && st.label === 'Dinner'))) continue;
    const row = result.schedule.find((r) => (r.day == null || r.day === g.day) && r.venueId === st.venue.id);
    if (crawlMeal && st.label === 'Dinner' && row && Number.isFinite(row.startMinutes) && row.startMinutes < DINNER_FROM) {
      st.label = row.startMinutes >= LATE_LUNCH_FROM ? 'Late lunch' : 'Lunch'; st.daypart = 'midday';
      if (result.experience && typeof result.experience.text === 'string') result.experience.text = result.experience.text.replace(`with dinner at ${st.venue.name}`, `with ${st.label === 'Lunch' ? 'lunch' : 'a late lunch'} at ${st.venue.name}`);
      continue;
    }
    if (!row || !Number.isFinite(row.startMinutes) || row.startMinutes < LATE_LUNCH_FROM) continue;
    // From 5 PM it is dinner (a Penticton crawl that starts when BNA opens at 4 had its "Late lunch" at 6:10 PM).
    const dinner = row.startMinutes >= DINNER_FROM;
    st.label = dinner ? 'Dinner' : 'Late lunch';
    if (dinner) st.daypart = 'evening';
    if (result.experience && typeof result.experience.text === 'string') result.experience.text = result.experience.text.replace(`with lunch at ${st.venue.name}`, `with ${dinner ? 'dinner' : 'a late lunch'} at ${st.venue.name}`);
  }
  return result;
}
// 2026-10-21: a note added twice by a timing pass ("Because you mentioned kids ...") is shown once.
function dedupeNotes(result) { for (const k of ['notes', 'warnings', 'contextNotes']) if (result && Array.isArray(result[k])) result[k] = result[k].filter((n, i, a) => typeof n !== 'string' || a.indexOf(n) === i); return result; }
// Weekly audit follow-up (2026-10-25): the cold-water line was only added when the request named a month, so "a day at
// the beach in Osoyoos" in late October still read like a swim. Every beach stop on a trip date outside June to
// September says the lake is cold, whatever the request said.
function addBeachSeasonNotes(result, input) {
  if (!result) return result;
  const req = input.requirements || {};
  const date = [req.startDate, input.tripDate].find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ''));
  const season = date && tripSeason(date);
  if (!season || season.water === 'in') return result;
  const note = SEASON_CAVEATS.coolWater(season.monthName);
  // Audit fix (2026-10-27): an Ideas list of beaches ("beach and swimming day in Penticton" in late October) gets the
  // cold-water line too; it only read plan stops.
  const stops = (result.days || []).flatMap((d) => d.stops || []).concat((result.itinerary && result.itinerary.stops) || [], (result.outing && result.outing.stops) || [], Array.isArray(result.recommendations) ? result.recommendations : []);
  for (const st of stops) {
    if (!st || !st.venue || st.venue.type !== 'beach' || st.gapFill) continue;
    const cav = st.caveats || [];
    if (cav.some((c) => /too cold for a swim|Lake swimming here is a summer activity/.test(typeof c === 'string' ? c : (c && c.text) || ''))) continue;
    st.caveats = [...cav, note];
  }
  return result;
}
function planTripOnce(input) { const result = dedupeNotes(withoutRepeatedAlternates(planTripUnchecked(input))); addSuggestedTimes(result, input || {}); labelLateLunches(result); relabelDayparts(result, input || {}); addBeachSeasonNotes(result, input || {}); return addStory(result, input || {}); }
// Planner (2026-10-27): a short outing's stop is called by the part of the day it is timed in (the audit saw Railside
// Brewing at 7:45 PM as "afternoon", Barley Mill at 11 AM as "late" and CedarCreek at noon as "morning"). Itineraries and
// outings only (a day plan's parts are its slots); meal stops keep theirs, and a label that was the old part's name
// becomes the new one's.
// A part's stops may start in this window (minutes) before they are called by another part.
const DAYPART_START_WINDOWS = { morning: [0, 719], midday: [630, 869], afternoon: [720, 1049], late: [840, 1109], evening: [960, 1439], night: [1140, 1439] };
function relabelDayparts(result, input = {}) {
  if (!result || !['itinerary', 'outing'].includes(result.kind) || !(result.schedule || []).length) return result;
  // A part of the day the visitor asked for ("this afternoon", "in the morning") is kept.
  const req = input.requirements || {};
  if ((input.intent && input.intent.when && input.intent.when.daypart) || req.daypart || req.timeWindow) return result;
  const stops = (result.itinerary && result.itinerary.stops) || (result.outing && result.outing.stops) || [];
  for (const st of stops) {
    if (!st || !st.venue || st.event || isLunchStop(st) || /\b(?:lunch|dinner|supper|brunch|breakfast)\b/i.test(st.label || '')) continue;
    const row = result.schedule.find((r) => r.venueId === st.venue.id && Number.isFinite(r.startMinutes));
    if (!row) continue;
    const start = row.startMinutes % 1440, win = DAYPART_START_WINDOWS[st.daypart];
    if (win && start >= win[0] && start <= win[1]) continue;
    const part = partAt(start);
    if (part === st.daypart) continue;
    if (st.label && st.label === PLAN_DAYPART_LABELS[st.daypart]) st.label = PLAN_DAYPART_LABELS[part];
    st.daypart = part;
  }
  return result;
}
// Audit fix (2026-10-27): "tonight" asked between midnight and 5 AM was planned for the night that is ending ("Hours were
// checked for Monday night, from 01:57"): every place with real hours was closed, so a date night came back with both
// stops empty and no warning, or with the only no-hours places timed at 5 PM "Monday". A plan with stops (an outing, a
// day, an itinerary) is now for the coming evening, with a note; an Ideas list keeps the night still running (a bar open
// to 2 AM) and moves to the coming evening only when nothing is open.
function afterMidnightTonight(input) {
  const c = input && input.clock, w = input && input.intent && input.intent.when;
  return !!(c && WEEKDAYS.includes(c.weekday) && Number.isInteger(c.minutes) && c.minutes >= 0 && c.minutes < NIGHT_ENDS_AT && w && w.preset === 'today' && !w.now && w.daypart === 'evening');
}
function afterMidnightNote(weekday) { return `It’s after midnight, so this plan is for ${WEEKDAY_NAMES[weekday]} evening.`; }
function planStopsOf(result) { return (result.days || []).flatMap((d) => d.stops || []).concat((result.itinerary && result.itinerary.stops) || [], (result.outing && result.outing.stops) || []); }
function planTrip(input) {
  let result = planTripOnce(input);
  if (afterMidnightTonight(input) && result) {
    const list = result.kind === 'discover' || result.kind === 'recommendations';
    if (!list || !(result.recommendations || []).length) {
      const weekday = input.clock.weekday;
      let evening = null;
      try { evening = planTripOnce({ ...input, clock: null, startWeekday: weekday }); } catch (e) { evening = null; }
      const filled = (p) => (p ? planStopsOf(p).filter((s) => s.venue || s.event).length + (p.recommendations || []).length : 0);
      if (evening && filled(evening) >= filled(result)) {
        const note = afterMidnightNote(weekday);
        evening.notes = [note].concat((evening.notes || []).filter((n) => n !== note));
        evening.contextNotes = [note].concat((evening.contextNotes || []).filter((n) => n !== note));
        result = evening;
      }
    }
  }
  // Audit fix (2026-10-27): a plan whose stops are all empty is never shown without a word of why.
  const stops = result ? planStopsOf(result) : [];
  if (stops.length && !stops.some((s) => s.venue || s.event) && !(result.warnings || []).length) result.warnings = ['No Okanagan Roam listings match every part of that request.'];
  return result;
}
function planTripUnchecked(input) {
  // A dated plan with nothing else to check is still timed and dated (2026-10-18: a family weekend matched to What's On).
  // 2026-10-19: any start date or start time (the Dates & start time control) is timed too: "romantic weekend in
  // Kelowna" with a date lost its timeline and its dates in My Trip.
  if (!input?.requirements?.items?.length && !input?.requirements?.conflicts?.length && !input?.requirements?.startDate && input?.requirements?.startMinutes == null) {
    const plainIntent = { ...(input?.intent || {}) };
    let plainInput = withDayPartRegions(input ? { ...input, intent: plainIntent } : input, plainIntent);
    // Audit fix (2026-10-27): "ski day at Big White this Saturday" before the resort opens planned skiing "for when the
    // lifts are running" on a Saturday it is closed; a named day is checked like a date (the requirements path below).
    if (plainInput && !plainInput.skiOffSeason) {
      const namedDay = ctxPlanDate({ startWeekday: plainInput.startWeekday, tripDate: plainInput.tripDate });
      const opening = namedDay ? skiOpeningFor(plainInput.facts, plainIntent.regions, namedDay) : null;
      const off = namedDay ? skiOffSeasonMonth(plainInput.text || '', plainIntent, null, plainInput.tripDate, namedDay, opening) : null;
      if (off) { plainIntent.activities = (plainIntent.activities || []).filter((a) => !['winter', 'skiing'].includes(a)); plainInput = { ...plainInput, skiOffSeason: off, ...(opening ? { skiOpening: opening } : {}) }; }
    }
    const plain = planTripCore(plainInput); applyItinerarySwap(plain, plainInput); applySwapPreference(plain, plainInput); holdSwapPins(plain, plainInput); ensureDinners(plain, plainInput); oneRoundADay(plain); oneSimulatorATrip(plain, plainIntent); feedDrinkCrawl(plain, plainInput, plainInput.requirements || { items: [] }); refreshPlanCounts(plain, plainInput); return plain;
  }
  let requirements = input.requirements;
  // "Something indoors if it rains" (2026-10-14): the days are planned for good weather and the plan names indoor
  // backups, rather than swapping a sunny stop for whatever indoor listing fits (it once chose a hockey arena).
  const rainBackupItem = requirements.items.find(i => i.kind === 'rainy' && i.conditional);
  if (rainBackupItem) { requirements = { ...requirements, items: requirements.items.filter(i => i !== rainBackupItem) }; input = { ...input, requirements }; }
  if ((requirements.shortWalkVenueIds || []).some(id => {
    const v = input.facts.find(v => v.id === id);
    return !v || !(v.plannerKinds || tripRequirements.inferPlannerKinds(v)).includes('easy_walk') || requirements.items.some(i => i.value === 'challenging_hike' && i.strength === 'must');
  })) { const error = new Error('A short walk needs an easy walking route in the listing and cannot replace a challenging hike.'); error.code = 'TRIP_CONFLICT'; throw error; }
  if (requirements.conflicts?.some(c=>/^The calendar date/.test(c))) {const error=new Error(requirements.conflicts.find(c=>/^The calendar date/.test(c)));error.code='TRIP_CONFLICT';throw error;}
  if (requirements.conflicts?.some(c=>c.startsWith('Dinner conflicts with'))) {const error=new Error(requirements.conflicts.find(c=>c.startsWith('Dinner conflicts with')));error.code='TRIP_CONFLICT';throw error;}
  const intent = { ...(input.intent || {}) };
  // "Wine tour" means wineries unless a tour company or shuttle was asked for (2026-10-18).
  if (wineTourMeansWineries(requirements.text || input.text || '')) {
    requirements = { ...requirements, items: requirements.items.slice() };
    applyWineTourMeaning(requirements.text || input.text || '', intent, requirements);
    const trip = input.trip && input.trip.components ? { ...input.trip, components: input.trip.components.map((c) => (c.types || []).includes('tour') && ((c.plannerKinds || []).includes('wine_tour') || /wine/.test(c.phrase || '')) ? { ...c, types: ['winery'], plannerKinds: [], phrase: 'wineries' } : c) } : input.trip;
    input = { ...input, requirements, trip };
  }
  if (foodTourMeansFood(requirements.text || input.text || '')) {
    requirements = { ...requirements, items: requirements.items.slice() };
    applyFoodTourMeaning(requirements.text || input.text || '', intent, requirements);
    input = { ...input, requirements };
  }
  if (requirements.startDate && /next weekend/i.test(requirements.dateSource || '')) intent.unsupported = (intent.unsupported || []).filter((u) => String(u).toLowerCase() !== 'next weekend');
  const consumed = tripRequirements.consumedTerms(requirements);
  if (requirements.items.some(i=>i.kind==='transport')) intent.unsupported = (intent.unsupported || []).filter(u=>!['no car','car free','without a car','on foot','walkable'].includes(String(u).toLowerCase()));
  // "No driving after 6pm" is an evening rule the plan applies (2026-10-18), not something it ignores; a request with
  // it is a day plan even without a length ("wine tour in Naramata, no driving after 6pm").
  const eveningWalk = requirements.items.find(i=>i.kind==='evening_walk');
  if (eveningWalk) {
    intent.unsupported = (intent.unsupported || []).filter(u=>!/\b(?:driv\w*|car)\b/i.test(String(u)));
    if (intent.mode === 'recommend' || intent.mode === 'find') { intent.mode = 'plan'; intent.days = intent.days || 1; }
  }
  intent.foodTerms = (intent.foodTerms || []).filter(f => f.cuisine || !consumed.has(f.term));
  intent.textTerms = (intent.textTerms || []).filter(t=>!consumed.has(t));
  const length = requirements.items.find(i => i.kind === 'days');
  if (length) { intent.days = length.value; if (intent.mode !== 'events') intent.mode = 'plan'; }

  input = { ...input, tripDate: requirements.startDate || input.tripDate, ...(requirements.startDate ? {startWeekday:WEEKDAYS[(new Date(`${requirements.startDate}T12:00:00Z`).getUTCDay()+6)%7]} : {}) };
  // Skiing out of season (2026-10-19, round 7): a July ski request is said in one line and planned on its other
  // interests, never as three days at a closed ski hill.
  const namedDay = ctxPlanDate({ startWeekday: input.startWeekday, tripDate: input.tripDate });
  const skiOpening = skiOpeningFor(input.facts, intent.regions, requirements.startDate || namedDay);
  const skiOff = skiOffSeasonMonth(requirements.text || input.text || '', intent, requirements, input.tripDate, namedDay, skiOpening);
  if (skiOff && skiOpening) input = { ...input, skiOpening };
  if (skiOff) {
    const kept = (i) => !(i.kind === 'activity' && ['skiing', 'winter', 'snowshoeing'].includes(i.value)) && !(i.kind === 'venue_kind' && i.value === 'snow_tour') && !(i.kind === 'type' && i.value === 'outdoor' && !(intent.types || []).includes('outdoor'));
    requirements = { ...requirements, items: requirements.items.filter(kept) };
    intent.activities = (intent.activities || []).filter((a) => !['winter', 'skiing'].includes(a));
    input = { ...input, requirements, skiOffSeason: skiOff };
  }
  if (input.trip?.explicitStops && length?.value > 1) input.trip = null;
  if (intent.mode === 'events' && length && (!input.trip?.multi || length.value > 1)) {
    intent.mode = 'plan'; intent.days = requirements.items.find(i => i.kind === 'days').value;
    intent.types = requirements.items.filter(i => i.kind === 'type').map(i => i.value);
    if(requirements.items.some(i=>i.kind==='venue_kind'&&!i.value.includes('tour'))) intent.types.push('indoor');
    intent.plannerKinds = requirements.items.filter(i=>i.kind==='venue_kind').map(i=>i.value);
    input.trip = null;
  }
  if (!input.trip?.multi && !length && requirements.items.some(i=>i.kind==='event') && !requirements.items.some(i=>['venue_kind','venue','type'].includes(i.kind))) intent.mode='events';
  if (intent.mode==='find') intent.activities = [...new Set([...(intent.activities||[]),...requirements.items.filter(i=>i.kind==='activity'&&i.strength==='must').map(i=>i.value)])];
  // A single rainy day ("rainy Sunday in Kelowna") is about indoor places; the weekday is just when it is.
  if (intent.mode==='find' && !intent.types?.length && requirements.items.some(i=>i.kind==='rainy'&&i.strength==='must'&&!i.dayIndex)) intent.types=['indoor'];
  const requestedKinds = requirements.items.filter(i=>i.kind==='venue_kind'&&i.strength==='must');
  if (!intent.types?.length && requestedKinds.length) intent.types = [...new Set(requestedKinds.map(i=>tripRequirements.isSportKind(i.value)?'sport':['horseback','sunset','park','walk','easy_walk','challenging_hike'].includes(i.value)?'outdoor':['wine_tour','boat_tour','guided_hike','cooking','snow_tour'].includes(i.value)?'tour':'indoor'))];
  {
    const trip = tripRequirements.expandTripComponents(input.trip || {regions:intent.regions||[],party:intent.party||{},when:intent.when}, requirements);
    const tripEvents = (input.tripEvents || []).slice();
    while (trip?.multi && tripEvents.length < trip.components.length) tripEvents.push(null);
    input = {...input,trip:trip?.multi?trip:null,tripEvents};
  }
  // "Lunch at a winery" (2026-10-19, round 7) is one stop -- lunch at a winery that serves food -- not a lunch spot
  // and a separate tasting room.
  if (input.trip?.multi && asksWineryLunch(requirements.text || input.text || '')) {
    const comps = input.trip.components;
    const li = comps.findIndex((c) => c.kind === 'venue' && c.meal === 'lunch');
    const wi = comps.findIndex((c) => c.kind === 'venue' && !c.meal && (c.types || []).length === 1 && c.types[0] === 'winery');
    if (li >= 0 && wi >= 0) {
      const merged = { ...comps[li], types: ['winery', 'restaurant'], wineryLunch: true, phrase: 'lunch at a winery' };
      const keep = (_, k) => k !== wi;
      input = { ...input, trip: { ...input.trip, components: comps.map((c, k) => (k === li ? merged : c)).filter(keep) }, tripEvents: (input.tripEvents || []).filter(keep) };
    }
  }
  if (rainBackupItem || requirements.items.some(i=>i.kind==='rainy'&&i.activityOnly)) { intent.occasion=null; intent.heuristics=(intent.heuristics||[]).filter(h=>!(h.field==='occasion'&&h.value==='rainy_day')); }
  const scopedRain = requirements.items.some(i => i.kind === 'rainy' && (i.dayIndex || i.weekday && intent.mode !== 'find'));
  if (scopedRain && intent.occasion === 'rainy_day') intent.occasion = null;
  const base = requirements.items.find(i => i.kind === 'base');
  const dayTripTo = requirements.items.find(i => i.kind === 'day_trip');
  if (base && !input.trip?.route) intent.regions = dayTripTo && dayTripTo.value !== base.value ? [base.value, dayTripTo.value] : [base.value];
  const named = requirements.items.filter(i => i.kind === 'venue').map(i => (input.facts || []).find(v => v.id === i.value)).filter(Boolean);
  intent.types = [...new Set([...(intent.types || []), ...named.map(v => v.type)])];
  intent.features = (intent.features || []).filter(f => !requirements.items.some(i => i.kind === 'feature' && i.value === f));
  if(requirements.items.some(i=>i.kind==='feature'&&i.value==='dog_friendly')) intent.party = { ...intent.party, dog:false };
  if(requirements.items.some(i=>i.kind==='excluded_kind')) {
    const kinds=requirements.items.filter(i=>i.kind==='excluded_kind').map(i=>i.value);
    const categories=new Set(kinds.map(k=>['park','sunset','horseback','walk','easy_walk','challenging_hike'].includes(k)?'outdoor':['wine_tour','boat_tour','guided_hike','cooking','snow_tour'].includes(k)?'tour':'indoor'));
    intent.excluded={...intent.excluded,types:(intent.excluded?.types||[]).filter(t=>!categories.has(t))};
  }
  if(input.trip?.explicitStops && ['date_night','romantic'].includes(intent.occasion))input.trip={...input.trip,outingOccasion:intent.occasion};
  input = withDayPartRegions(input, intent);
  let result = planTripCore({ ...input, intent });
  applyItinerarySwap(result, { ...input, intent });
  applySwapPreference(result, { ...input, intent });
  holdSwapPins(result, { ...input, intent });
  ensureDinners(result, { ...input, intent });
  if (eveningWalk && result.days.length) applyEveningWalk(result, { ...input, intent }, eveningWalk);
  for(const day of result.days)if(day.mealNote)result.notes.push(day.mealNote);
  // 2026-10-19: a Halloween trip says which day has no Halloween event nearby (Sun Nov 1 near Penticton), rather than
  // leaving a family event that looks like one.
  const holidayTrip=(input.familyEvents||input.holidayEvents)&&result.days.length>1?holidayTheme(requirements?.text||input.text||''):null;
  if(holidayTrip){
    const themed=day=>day.stops.some(s=>s.event&&holidayTrip.re.test(normWords(s.event.name||'')));
    if(result.days.some(themed))for(const day of result.days.filter(d=>!themed(d))){
      const town=input.labels?.regions?.[day.regions?.[0]];
      result.notes.push(`No ${holidayTrip.label} events are listed${town?` near ${town}`:''} on day ${day.day}, so ${day.stops.some(s=>s.event)?'it has another family event instead':'it is a regular day out'}.`);
    }
  }
  oneRoundADay(result);
  oneSimulatorATrip(result, intent);
  // Planner (2026-10-27): times the visitor named are read before the planner moves any start below.
  const namedTimes = userNamedTimes(requirements);
  scheduleTripByHours(result, input, requirements);
  result = fitTimeBudget(result, input, requirements);
  if(result.timeBudget?.selected)scheduleTripByHours(result,input,requirements);
  clarifyEventMealConflict(result,input);
  // Round 7: a long wait before dinner gets a nearby stop, or a labelled free-time block.
  if (fillDinnerGaps(result, { ...input, intent }, requirements)) scheduleTripByHours(result, input, requirements);
  // Round 8: a short one-day itinerary gets lunch, another stop or a Free time card in a long gap.
  if (fillItineraryGaps(result, { ...input, intent }, requirements)) scheduleTripByHours(result, input, requirements);
  feedDrinkCrawl(result, { ...input, intent }, requirements);
  if ((result.schedule || []).length) {
    const reordered = orderCrawlByHours(result, (order) => { const probe = JSON.parse(JSON.stringify(result)); probe.itinerary.stops = JSON.parse(JSON.stringify(order)); scheduleTripByHours(probe, input, requirements, { probe: true }); return probe.schedule || []; });
    if (reordered) { result.itinerary.stops = reordered; scheduleTripByHours(result, input, requirements); }
  }
  pullDinnersForward(result, { ...input, intent }, requirements);
  startLaterOnMorningGaps(result, { ...input, intent }, requirements);
  leadUpToDinner(result, { ...input, intent }, requirements);
  // Planner (2026-10-27): no wait of more than 90 minutes between stops is left unexplained (see closeIdleGaps).
  closeIdleGaps(result, { ...input, intent }, requirements, { userTimed: namedTimes });
  if (eveningWalk && result.days.length) {
    // 2026-10-19: the rule is applied, not only stated. A dinner reached by car after the cut-off is said, day by day.
    const late = eveningWalkLateDrives(result, eveningWalk);
    result.eveningWalkLate = late;
    // Round 7: said up front with the plan (it was only in the closed "How this plan was made" list).
    const walkNote = late.length === result.days.filter((d) => d.stops.some(isDinnerStop)).length ? `No driving after ${clockText(eveningWalk.value)}: we could not keep the evenings car-free with the places listed, so dinner is the closest good spot to the day’s last stop.` : `No driving after ${clockText(eveningWalk.value)}: dinner is a short walk from the day’s last stop${late.length ? ' on the other days' : ''}, or the drive to it ends by then.`;
    result.notes.push(walkNote);
    result.contextNotes = (result.contextNotes || []).concat(walkNote);
  }
  // Round 11 (2026-10-20): a trip planned around shows names them ("3 days around Vernon, with Moontricks and Miigis.").
  if (result.days.length && requirements.items.some(i => i.kind === 'event') && typeof result.summary === 'string') {
    const shows = [...new Set(result.days.flatMap(d => (d.stops || []).filter(s => s.event && s.event.name).map(s => s.event.name)))];
    if (shows.length) result.summary = `${result.summary.replace(/\.$/, '')}, with ${listText(shows.slice(0, 3))}${shows.length > 3 ? ` and ${shows.length - 3} more` : ''}.`;
  }
  if (requirements.startDate && result.days.length) { result.notes.push(`Trip starts on ${requirements.startDate} (Okanagan calendar date).`); result.days.forEach(day => { day.date = new Date(new Date(`${requirements.startDate}T12:00:00Z`).getTime() + (day.day - 1) * 86400000).toISOString().slice(0,10); }); }
  const restricted = requirements.daypart==='morning' ? (input.facts || []).filter(v=> (!intent.regions?.length||intent.regions.includes(v.region)) && requirements.items.some(i=>i.strength==='must'&&['venue','venue_kind','type'].includes(i.kind)&&tripRequirements.matches(v,i)) && tripRequirements.listedAccessConflict(v,requirements,1,input.tripDate)) : [];
  if(restricted.length){
    const context=buildContext({...intent,types:['sport'],foodTerms:[],activities:[]},input.labels,input);
    result.accessConflicts=restricted.slice(0,3).map(v=>{
      const conflict=tripRequirements.listedAccessConflict(v,requirements,1,input.tripDate),kinds=v.plannerKinds||tripRequirements.inferPlannerKinds(v);
      const alternatives=(input.facts||[]).filter(a=>a.id!==v.id&&a.region===v.region&&a.type===v.type&&kinds.some(k=>(a.plannerKinds||tripRequirements.inferPlannerKinds(a)).includes(k))&&eligible(a,{...context,types:new Set([v.type]),plannerKinds:kinds},true)&&!advisoryFit(a,{types:[a.type]},tripSeason(input.tripDate))?.skip&&tripRequirements.venueAllowed(a,requirements,1,input.tripDate)&&!requestedTimeFit(a,context)?.skip).slice(0,2).map(a=>({id:a.id,name:a.name,url:a.url}));
      return {name:v.name,url:v.url,source:conflict.source,afterMinutes:conflict.afterMinutes,alternatives};
    });
  }
  result.requirementResults = tripRequirements.evaluateTripRequirements({ requirements, plan: result, facts: input.facts || [], tripDate: input.tripDate });
  result.requirementResults = addOptionalRequirementAlternatives(result.requirementResults, result, requirements, input);
  // Round 8 (2026-10-19): "theatre night" is met by a stage show on What's On (a musical theatre cabaret), not only by
  // a theatre listed as a place.
  const showStop = (result.itinerary?.stops || result.days.flatMap((d) => d.stops)).find((st) => st.event && eventIsShow(st.event) && !/\b(?:film|films|movie|movies|screening)\b/.test(normWords(st.event.name || '')));
  if (showStop) result.requirementResults = result.requirementResults.map((i) => i.kind === 'venue_kind' && i.value === 'theatre' && i.status !== 'satisfied' ? { ...i, status: 'satisfied', reason: `${showStop.event.name} is a show on What’s On.` } : i);
  // Round 7: lunch at a winery that serves food answers both "lunch" and "a winery".
  const wineryLunchStop = (result.itinerary?.stops || []).find((st) => st.wineryLunch && st.venue);
  if (wineryLunchStop) result.requirementResults = result.requirementResults.map((i) => i.kind === 'type' && ['winery', 'restaurant'].includes(i.value) && i.status !== 'satisfied' ? { ...i, status: 'satisfied', reason: `Lunch at ${wineryLunchStop.venue.name}, ${wineryLunchStop.venue.type === 'winery' ? 'a winery that serves food' : 'a winery’s restaurant'}.` } : i);
  if (result.eveningWalkLate?.length) result.requirementResults = result.requirementResults.map((i) => i.kind !== 'evening_walk' ? i : { ...i, status: 'unverified', reason: `The drive to dinner comes after ${clockText(i.value)} on day ${listText(result.eveningWalkLate.map((x) => String(x.day)))}: no listed dinner spot is within walking distance of the day’s last stop.` });
  // Every evening asked for (2026-10-19): an evening without a listed event is said, not hidden behind "matched".
  if (result.days.length > 1 && eventsEachEvening(requirements.text || input.text || '')) {
    result.requirementResults = result.requirementResults.map((i) => {
      if (i.kind !== 'event' || i.status !== 'satisfied' || tripRequirements.requirementDay(i, input.tripDate)) return i;
      const without = result.days.filter((day) => !day.stops.some((st) => st.event && tripRequirements.eventMatches(st.event, i))).map((day) => day.day);
      return without.length ? { ...i, status: 'unverified', missingDays: without, reason: `Found for ${result.days.length - without.length} of ${result.days.length} evenings; nothing matching is listed on What’s On for day ${listText(without.map(String))}.` } : i;
    });
  }
  if (rainBackupItem) {
    const backups = rainBackups(result, input, intent);
    if (backups.length) {
      result.rainBackup = backups.map((v) => ({ id: v.id, name: v.name, url: v.url, regionLabel: (input.labels || {})[v.region] || v.region }));
      result.notes.unshift(`If it rains: ${listText(backups.map((v) => v.name))} ${backups.length > 1 ? 'are' : 'is'} indoors nearby, so swap ${backups.length > 1 ? 'one' : 'it'} in for a beach or outdoor stop.`);
    }
    result.requirementResults.push({ ...rainBackupItem, status: backups.length ? 'satisfied' : 'unmet', reason: backups.length ? 'Indoor backups are named for a rainy day.' : 'No indoor backup was found nearby.' });
  }
  result.warnings = [...new Set([...(result.warnings || []), ...requirements.conflicts, ...result.requirementResults.filter(i => i.status !== 'satisfied').map(requirementWarning).filter(Boolean)])];
  // Round 8 (2026-10-19): Swap sends every shown stop as a pin so the rest of the plan stays put, but only the stops the
  // visitor locked must stay. A shown stop that no longer fits after the swap (dinner moved, a day re-timed) gives way
  // to the planner's pick instead of a false "A locked stop cannot be kept" error.
  const softPins = swapSoftPins(input);
  for (const [key, id] of Object.entries(input.pinned || {})) {
    const [day,part]=key.split('-');
    if (softPins.has(key)) continue;
    if (!result.days.find(d=>d.day===Number(day))?.stops.some(s=>s.daypart===part&&s.venue?.id===id)) {
      // 2026-10-19: said in visitor words ("Big White Ski Resort on day 2"), never the slot id ("2-morning").
      const name=(input.facts||[]).find(v=>v.id===id)?.name||'A kept stop';
      const error=new Error(`A locked stop cannot be kept: ${name} on day ${day} no longer fits this plan. Unlock it, or change the request.`); error.code='TRIP_CONFLICT'; throw error;
    }
  }
  refreshPlanCounts(result, { ...input, intent });
  return result;
}
// Round 9 (2026-10-19): the "Two outdoor stops, four winery visits and two dinners" line is counted again from the final
// stops, after dinners, fillers and swaps changed them (it said "two dinners" for a day that had one).
function refreshPlanCounts(result, input) {
  if (!result || !(result.days || []).length || !result.experience || result.experience.title !== EXPERIENCE_TITLE || (result.timeBudget && result.timeBudget.selected)) return;
  try {
    const ctx = buildContext(input.intent || {}, input.labels || {}, input);
    const fresh = buildPlanOverview(result.kind === 'outing' ? 'outing' : 'trip', result, ctx, input.facts || []);
    if (fresh && fresh.experience && fresh.experience.text) result.experience = { ...result.experience, text: fresh.experience.text };
  } catch (e) { /* keep the first summary */ }
}

// Up to three indoor places near the plan for a rainy day: attractions people visit (museums, galleries, bowling,
// climbing, cinemas, pools) first; clubs, gyms and studios last; nothing the party could not go to.
const RAIN_BACKUP_DRINK_TYPES = ['winery', 'brewery', 'pub', 'cocktail', 'distillery'];
const RAIN_BACKUP_GOOD_WORDS = ['museum', 'gallery', 'cinema', 'cinemas', 'movies', 'theatre', 'bowling', 'arcade', 'climbing', 'escape', 'aquatic', 'pool', 'science', 'trampoline', 'mini golf', 'heritage', 'fun centre', 'fun center', 'indoor playground'];
const RAIN_BACKUP_KIDS_WORDS = ['pool', 'lazy river', 'waterslide', 'fun centre', 'fun center', 'bowling', 'arcade', 'trampoline', 'science', 'climbing', 'mini golf', 'indoor playground', 'play centre', 'laser tag', 'go kart'];
const RAIN_BACKUP_NICHE_WORDS = INDOOR_NICHE_WORDS.concat(['community theatre', 'theatre company', 'club', 'curling', 'arena', 'company', 'society', 'association', 'church', 'school', 'academy']);
function rainBackups(result, input, intent) {
  const stops = result.days?.length ? result.days.flatMap((d) => d.stops) : (result.itinerary?.stops || result.outing?.stops || []);
  const used = new Set(stops.map((s) => s.venue?.id).filter(Boolean));
  const regions = new Set(stops.map((s) => s.venue?.region).filter(Boolean));
  if (!regions.size) for (const r of intent.regions || []) regions.add(r);
  const party = intent.party || {};
  const noDrink = (intent.excluded?.concepts || []).includes('alcohol') || (intent.excluded?.types || []).some((t) => RAIN_BACKUP_DRINK_TYPES.includes(t)) || /\b(?:don t drink|dont drink|no alcohol|alcohol free|sober|non drinkers?)\b/.test(input.requirements?.text || '');
  const text = (v) => `${v.textName || ''} ${v.textDesc || ''}`;
  const scored = (input.facts || []).filter((v) => regions.has(v.region) && !used.has(v.id) && tripRequirements.matches(v, { kind: 'rainy' }) && !['restaurant', 'cafe'].includes(v.type)
    && !(v.advisory && advisoryUnavailable(v.advisory.note))
    && !(party.kids && (KIDS_EXCLUDED_TYPES.includes(v.type) || /\bcasino\b/.test(text(v))))
    && !(noDrink && RAIN_BACKUP_DRINK_TYPES.includes(v.type))
    && !(party.dog && !(v.features.dog_friendly || v.collections.includes('dog_friendly'))))
    .map((v) => {
      let score = (v.rating || 4) * 2;
      if (RAIN_BACKUP_GOOD_WORDS.some((w) => textHas(v.textName, w))) score += 12; else if (RAIN_BACKUP_GOOD_WORDS.some((w) => textHas(v.textDesc, w))) score += 6;
      if (RAIN_BACKUP_NICHE_WORDS.some((w) => textHas(v.textName, w))) score -= 15;
      if (party.kids && v.features.kid_friendly) score += 5;
      if (party.kids && RAIN_BACKUP_KIDS_WORDS.some((w) => textHas(v.textName, w) || textHas(v.textDesc, w))) score += 10;
      if (v.collections.includes('indoor_also') || v.collections.includes('local_favorite') || v.collections.includes('hidden_gem')) score += 3;
      return { v, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.v.name.localeCompare(b.v.name));
  return scored.slice(0, regions.size > 1 ? 3 : 2).map((x) => x.v);
}

// A checked request the plan could not meet or verify, in the visitor's language (2026-10-14). It used to quote the
// lower-cased request back ("Not met: beach if it s nice — No selected stop meets beach if it s nice", "Not verified: 3
// days in penticton with our two kids 6 and 9 — ..."). Events keep their "Not met: <event>" form, which the page and
// the French copy key on.
const REQUIREMENT_TYPE_WORDS = { beach: 'beach', winery: 'winery', restaurant: 'restaurant', cafe: 'café', breakfast: 'breakfast or brunch spot', golf: 'golf course', outdoor: 'outdoor stop', tour: 'tour', brewery: 'brewery', pub: 'pub', cocktail: 'cocktail lounge', distillery: 'distillery', indoor: 'indoor attraction' };
const REQUIREMENT_ACTIVITY_WORDS = { hiking: 'hike or walk', skiing: 'ski hill', snowshoeing: 'snowshoe trail', winter: 'winter activity', viewpoints: 'viewpoint' };
const REQUIREMENT_FEATURE_WORDS = { dog_friendly: 'dog friendly', kid_friendly: 'kid friendly', vegetarian: 'vegetarian friendly', vegan: 'vegan friendly', gluten_free: 'gluten-free friendly' };
function requirementWarning(i) {
  if (i.kind === 'event') {
    const label = ({hockey:'hockey game','live-music':'live music',festival:'festival',market:'market',show:'show',comedy:'comedy show'}[i.eventKind] || (i.value === 'sports-recreation' ? 'sports event' : 'event'));
    return `${i.status === 'unmet' ? 'Not met' : 'Not verified'}: ${label} — ${i.reason}`;
  }
  if (i.kind === 'base') return null; // the base is used; accommodation was never part of a plan
  if (i.kind === 'unsupported') {
    if (i.value === 'accessibility') return 'Wheelchair access isn’t listed on Okanagan Roam, so check with each place before you go.';
    if (i.value === 'party size') return 'Group seating isn’t listed on Okanagan Roam, so book ahead for a large group.';
    if (i.value === 'exact budget') return 'Exact costs aren’t listed on Okanagan Roam; the plan favours lower price levels where they are known.';
    return `Okanagan Roam can’t check ${i.value} from its listings, so confirm it before you go.`;
  }
  if (i.kind === 'price_limit') return 'Places with higher listed prices are left out; not every place lists a price, so check before you go.';
  if (i.kind === 'rainy') return i.activityOnly ? 'No indoor backup could be fitted into this plan.' : null; // the rainy-day note already says to check
  if (i.kind === 'feature') return `Not every stop is listed as ${REQUIREMENT_FEATURE_WORDS[i.value] || String(i.value).replace(/_/g, ' ')}.`;
  if (['type', 'venue_kind', 'activity', 'venue'].includes(i.kind) && i.status === 'unmet') {
    const word = i.kind === 'type' ? REQUIREMENT_TYPE_WORDS[i.value] : i.kind === 'activity' ? REQUIREMENT_ACTIVITY_WORDS[i.value] : i.kind === 'venue_kind' ? tripRequirements.LABELS?.[i.value] : null;
    if (word) return `No ${word} could be fitted into this plan.`;
  }
  return i.reason || null;
}

// Offer grounded ways to adapt an unmet request without marking an option as
// a match or inserting it into the itinerary.
function addOptionalRequirementAlternatives(results, plan, requirements, input) {
  const adjacentKinds = {
    museum: ['gallery'], gallery: ['museum'],
    easy_walk: ['walk'], walk: ['easy_walk'],
    skiing: ['snowshoeing', 'tubing'], snowshoeing: ['skiing', 'tubing'], tubing: ['skiing', 'snowshoeing'],
    hiking: ['easy_walk', 'walk'], viewpoints: ['sunset'],
  };
  const selected = new Set(tripRequirements.selectedStops(plan).filter(s => s.venue).map(s => s.venue.id));
  const baseRegion = requirements.items.find(i => i.kind === 'base')?.value;
  const requestedRegions = input.intent?.regions?.length ? input.intent.regions : baseRegion ? [baseRegion] : [];
  const daypart = requirements.daypart || input.intent?.daypart || null;
  const visitDate = requirements.startDate || input.tripDate;
  return results.map(item => {
    if (item.status !== 'unmet' || !['type', 'type_count', 'venue_kind', 'venue', 'activity', 'feature', 'rainy'].includes(item.kind)) return item;
    let weekday = input.startWeekday || null;
    if (daypart && visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
      const firstDay = new Date(`${visitDate}T12:00:00Z`).getUTCDay();
      weekday = WEEKDAYS[(firstDay + 6 + Math.max(0, (item.dayIndex || 1) - 1)) % 7];
    } else if (daypart && weekday && item.dayIndex > 1) {
      const firstDay = WEEKDAYS.indexOf(String(weekday).toLowerCase().slice(0, 3));
      if (firstDay >= 0) weekday = WEEKDAYS[(firstDay + item.dayIndex - 1) % 7];
    }
    const adjacent = adjacentKinds[item.value] || [];
    const candidates = [];
    for (const venue of input.facts || []) {
      if (selected.has(venue.id) || !venue.url || !/^\/(?!\/)/.test(venue.url)) continue;
      if (!tripRequirements.venueAllowed(venue, requirements, item.dayIndex || 1, visitDate)) continue;
      // Audit fix (2026-10-27): a place closed for the season or under a closed advisory is never offered under "Not
      // included" (the closed Terrace Restaurant was offered as its own alternative).
      if (seasonClosedOnTrip(venue, { date: /^\d{4}-\d{2}-\d{2}$/.test(visitDate || '') ? visitDate : null }) || (venue.seasonClosedToday && !visitDate) || (venue.advisory && advisoryUnavailable(venue.advisory.note))) continue;
      const exact = tripRequirements.matches(venue, item);
      const kinds = venue.plannerKinds || tripRequirements.inferPlannerKinds(venue);
      const related = !exact && adjacent.some(k => kinds.includes(k) || (venue.activities || []).includes(k));
      if (!exact && !related) continue;
      const local = !requestedRegions.length || requestedRegions.includes(venue.region);
      const timeFit = daypart ? hoursFit(venue, daypart, weekday) : null;
      let reasonCode = related ? 'similar_activity' : !local ? 'different_region' : 'another_listing';
      if (!related && local && timeFit?.status === 'closed') reasonCode = 'different_time';
      else if (!related && local && timeFit && ['unknown', 'partial'].includes(timeFit.status)) reasonCode = 'confirm_hours';
      candidates.push({
        id: venue.id, name: venue.name, url: venue.url, region: venue.region, type: venue.type,
        reasonCode, _exact: exact, _local: local, _rating: Number(venue.rating) || 0,
        _reviews: Number(venue.reviews) || 0,
        _timeRank: daypart ? ({ verified: 0, short: 1, partial: 2, unknown: 3, closed: 4 }[timeFit.status] ?? 3) : 0,
      });
    }
    candidates.sort((a, b) => Number(b._exact) - Number(a._exact) || Number(b._local) - Number(a._local) || a._timeRank - b._timeRank || b._rating - a._rating || b._reviews - a._reviews || String(a.name).localeCompare(String(b.name)));
    const optionalAlternatives = candidates.slice(0, 3).map(({ _exact, _local, _timeRank, _rating, _reviews, ...candidate }) => candidate);
    return optionalAlternatives.length ? { ...item, optionalAlternatives } : item;
  });
}

// Drive legs between towns (2026-10-19): a road trip's next day starts with the drive from the last town (day.driveIn),
// and a stop in another town than the one before it says so (stop.driveFrom). Estimates from the same road model as the
// timeline (estimateTransfer), from the stops' own coordinates or, without them, the towns' centres.
function addDriveLegs(result, facts, ctx) {
  const byId = new Map(facts.map((v) => [v.id, v]));
  const centroids = regionCentroids(facts);
  const placeOf = (s) => { const v = s && s.venue && byId.get(s.venue.id); if (v && hasCoords(v)) return v; const loc = s && s.event && s.event.location; return loc && hasCoords(loc) ? { ...loc, region: s.event.region } : null; };
  const regionOf = (s) => (s && s.venue ? s.venue.region : s && s.event ? s.event.region : null);
  const leg = (fromStop, toStop) => {
    const a = regionOf(fromStop), b = regionOf(toStop);
    if (!a || !b || a === b) return null;
    const t = tripRequirements.estimateTransfer(placeOf(fromStop) || centroids[a], placeOf(toStop) || centroids[b]);
    if (!t) return null;
    return { from: a, fromLabel: regionLabel(ctx, a), to: b, toLabel: regionLabel(ctx, b), minMinutes: t.minMinutes, maxMinutes: t.maxMinutes, ...(t.aroundLake ? { aroundLake: true } : {}) };
  };
  let last = null;
  // Round 11 (2026-10-20): a stay in one town ("3 days in Vernon") starts each day from that town, not from where the
  // night before ended (Day 3 opened "Drive from Lake Country" after a show there). Road trips keep the last town.
  const roadTrip = ctx && ctx.dayRegionPlan && /^Planned as a road trip/.test(ctx.dayRegionPlan.note || '');
  const homes = [...new Set((result.days || []).map((d) => d.region).filter(Boolean))];
  const home = !roadTrip && homes.length === 1 && (result.days || []).length > 1 ? { venue: { id: null, region: homes[0] } } : null;
  for (const day of result.days || []) {
    const stops = (day.stops || []).filter((s) => s.venue || s.event);
    delete day.driveIn;
    if (last && stops[0]) { const l = leg(last, stops[0]); if (l && l.maxMinutes >= 15) day.driveIn = l; }
    for (let k = 1; k < stops.length; k++) { delete stops[k].driveFrom; const l = leg(stops[k - 1], stops[k]); if (l) stops[k].driveFrom = l; }
    if (stops.length) last = home || stops[stops.length - 1];
  }
}
// Round 11 (2026-10-20): one round of golf a day. A second outdoor round (2:54-6:54 PM on a "golf weekend in Vernon",
// past sunset) becomes the best other kind of place offered for that slot, or free time.
// Round 11 (2026-10-20): an event on several dates shows the date of the day it is planned on ("Sat Nov 7"), not its
// first date and "+ 1 more date" (Garth Brooks on Day 2 said FRI NOV 6).
function eventOnDay(e, date) {
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return e;
  const several = /\+\s*\d+\s+more dates?/.test(e.dateLabel || '') || (e.startDate && e.endDate && e.startDate !== e.endDate);
  if (!several) return e;
  const d = new Date(`${date}T12:00:00Z`);
  const label = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}`;
  return { ...e, dateLabel: label, plannedDate: date };
}
// 2026-10-25: "2 days in Vernon in December" had a golf simulator on both days, though golf was never asked for. Unless
// golf is asked for, an indoor golf session is planned once a trip; a later one becomes the best other kind of place
// offered for that slot.
function oneSimulatorATrip(result, intent) {
  if ((intent && (intent.types || []).includes('golf')) || !(result.days || []).length) return;
  const inPlan = new Set((result.days || []).flatMap((d) => (d.stops || []).map((s) => s.venue && s.venue.id).filter(Boolean)));
  const sims = (result.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue && s.venue.type === 'golf' && s.venue.indoorGolf));
  for (const extra of sims.slice(1)) {
    const alt = (extra.alternates || []).find((a) => a && a.venue && a.venue.type !== 'golf' && !inPlan.has(a.venue.id));
    if (!alt) continue;
    const keep = { daypart: extra.daypart, label: extra.label };
    inPlan.delete(extra.venue.id);
    Object.keys(extra).forEach((k) => { delete extra[k]; });
    Object.assign(extra, alt, keep); extra.alternates = []; inPlan.add(alt.venue.id);
  }
}
function oneRoundADay(result) {
  const inPlan = new Set((result.days || []).flatMap((d) => (d.stops || []).map((s) => s.venue && s.venue.id).filter(Boolean)));
  for (const day of result.days || []) {
    const rounds = (day.stops || []).filter((s) => s.venue && s.venue.type === 'golf' && !s.venue.indoorGolf);
    for (const extra of rounds.slice(1)) {
      const alt = (extra.alternates || []).find((a) => a && a.venue && a.venue.type !== 'golf' && !inPlan.has(a.venue.id));
      const keep = { daypart: extra.daypart, label: extra.label };
      inPlan.delete(extra.venue.id);
      Object.keys(extra).forEach((k) => { delete extra[k]; });
      if (alt) { Object.assign(extra, alt, keep); extra.alternates = []; inPlan.add(alt.venue.id); }
      else Object.assign(extra, keep, { venue: null, why: [], reasons: [], caveats: ['Free time: one round of golf a day leaves this part of the day open.'] });
    }
  }
}
function planTripCore(input) {
  // Multi-part requests (input.trip from interpretTripComponents) get the
  // itinerary path; every other request is planned exactly as before.
  if (input && input.trip && input.trip.multi) return planItinerary(input);
  const { intent, facts = [], labels = {}, events = null } = input || {};
  const ctx = buildContext(intent || {}, labels, input);
  let kind = classifyPlanRequest(intent);
  // "Ski with the kids at SilverStar" (2026-10-18) is a ski day at that hill, not a list of every winter listing there
  // (the snowmobile club among them). "Ski resorts near Kelowna" stays a list.
  if (['recommendations', 'discover'].includes(kind) && ctx.regions.length && tripTheme(ctx) === 'ski' && !/\b(?:resorts|hills|areas|mountains|options|ideas|places)\b/.test(ctx.queryText || '')) kind = 'day_plan';
  const heuristics = (intent && intent.heuristics) || [];
  const result = {
    kind,
    summary: '',
    overview: null,
    days: [],
    recommendations: [],
    outing: null,
    events: [],
    notes: heuristics.map(visitorNote),
    warnings: [],
    unsupported: (intent && intent.unsupported) || [],
    needs: (intent && intent.needs) || [],
  };
  // A place outside the Okanagan is said plainly, up front (2026-10-14: "a weekend in Vancouver" quietly became Kelowna).
  const outside = (result.unsupported || []).filter((u) => OUTSIDE_PLACE_NAMES.includes(u));
  const outsideNote = outside.length ? `Okanagan Roam only covers the Okanagan Valley, so ${listText(outside)} ${outside.length > 1 ? 'aren’t' : 'isn’t'} included. Here are ideas in the Okanagan instead; name a town such as Kelowna, Penticton or Vernon to choose where.` : null;
  if (outsideNote) result.notes.unshift(outsideNote);
  if (ctx.skiOffSeason) { const n = skiOffSeasonNote(ctx.skiOffSeason, ctx.skiOpening); result.notes.unshift(n); result.skiOffSeasonNote = n; }
  if (ctx.kids && !ctx.occasion) result.notes.push(ctx.requirements ? 'Because you mentioned kids, kid-friendly places come first. Check ages and bookings with each place.' : 'Because you mentioned kids, kid-friendly places, parks and beaches come first. Kid-Friendly is the badge Okanagan Roam verifies.');
  // Build My Trip Phase 2 (2026-09-27): the notes about what the visitor asked
  // for (occasion, kids) that /trip shows up front; every other note is
  // secondary detail. The same strings stay in `notes`.
  result.contextNotes = (outsideNote ? [outsideNote] : []).concat(result.skiOffSeasonNote ? [result.skiOffSeasonNote] : []).concat(heuristics.filter((h) => h.field === 'occasion').map(visitorNote))
    .concat(ctx.kids && !ctx.occasion ? [result.notes[result.notes.length - 1]] : []);
  if (kind === 'unknown' || kind === 'navigate') {
    result.summary = buildSummary('unknown', ctx, null);
    return result;
  }
  if (kind === 'events') {
    result.events = events || [];
    result.summary = buildSummary('events', ctx, null);
    if (intent.eventPlanning) result.notes.push('Building an itinerary around specific event times is not supported yet; here is what is on, and you can add events to your plans from their pages.');
    result.overview = buildOverview(kind, ctx, null);
    return result;
  }
  if (kind === 'multi_day' || kind === 'day_plan') {
    let days = intent.days || 1;
    // Round 10 (2026-10-19): "Kelowna to Osoyoos road trip" with no length is a road trip, not a day in Kelowna: one day
    // for a short drive, two for a long one.
    const ends = !intent.days ? roadTripEnds(ctx) : null;
    // Round 11: the whole valley (Vernon to Osoyoos, 11 towns) is three days.
    if (ends && ends.roadTrip && roadTripTowns(ends) > ROAD_TRIP_ONE_DAY_TOWNS) { days = roadTripTowns(ends) > ROAD_TRIP_TWO_DAY_TOWNS ? 3 : 2; kind = 'multi_day'; result.kind = kind; }
    else if (!intent.days) result.notes.push('No trip length was given, so this is a one-day plan.');
    days = Math.max(1, Math.min(PLAN_MAX_DAYS, days));
    ctx.dayRegionPlan = planDayGeography(facts, ctx, days);
    // Themed trips (2026-10-18): a wine-only or ski request gets its own day builder.
    const theme = tripTheme(ctx);
    const plan = theme ? buildThemedDays(theme, facts, ctx, days, input.pinned || null) : buildDays(facts, ctx, days, input.pinned || null);
    if (plan.themed) result.theme = plan.themed;
    for (const n of plan.notes || []) if (!result.warnings.includes(n)) result.warnings.push(n);
    result.days = plan.days;
    result.warnings = [...new Set(result.warnings.concat(plan.warnings))];
    if (ctx.dayRegionPlan && ctx.dayRegionPlan.note) result.notes.push(ctx.dayRegionPlan.note);
    // Stage 3.5 D6 (2026-09-30): a named place no day uses (more places than
    // days) is reported as not used, and the summary names only the places
    // the plan uses. The days and stops are unchanged.
    const unusedRegions = unusedPlanRegions(ctx.regions, plan.days.flatMap((d) => d.regions || [d.region]));
    if (unusedRegions.length) result.unsupported = result.unsupported.concat(unusedRegions.map((r) => regionLabel(ctx, r)).filter((l) => !result.unsupported.includes(l)));
    const shownCtx = unusedRegions.length ? { ...ctx, regions: ctx.regions.filter((r) => !unusedRegions.includes(r)) } : ctx;
    result.summary = buildSummary(kind, shownCtx, days);
    result.overview = buildOverview(kind, shownCtx, days);
    // Only described as a north-to-south route when there is one to describe.
    const routeRegions = uniqRegions(plan.days);
    if (!ctx.regions.length && routeRegions.length > 1) result.notes.push(`No single region was given, so the plan moves through ${listText(routeRegions.map((r) => regionLabel(ctx, r)))} from north to south.`);
    for (const day of plan.days) if (day.theme && day.theme.label) result.notes.push(`Day ${day.day} is planned around your ${day.theme.label}.`);
    scheduleNotes(result, ctx);
    seasonNotes(result, ctx);
    addDriveLegs(result, facts, ctx);
    Object.assign(result, buildPlanOverview(kind, result, ctx, facts));
    return result;
  }
  if (kind === 'outing') {
    result.outing = buildOuting(facts, ctx);
    result.summary = buildSummary('outing', ctx, null);
    result.overview = buildOverview(kind, ctx, null);
    if (!ctx.regions.length) result.notes.push('No region was given, so these stops were chosen in the same community, anywhere in the valley.');
    scheduleNotes(result, ctx);
    seasonNotes(result, ctx);
    Object.assign(result, buildPlanOverview(kind, result, ctx, facts));
    return result;
  }
  let rec = buildRecommendations(facts, ctx);
  // A descriptive word no listing mentions ("cafes with wifi") is reported rather than emptying the list (2026-10-14).
  const looseTerms = ctx.foodTerms.filter((f) => !f.cuisine && !DISH_WORDS_RE.test(f.term));
  if (!rec.items.length && looseTerms.length && (ctx.types.size || ctx.foodTerms.length > looseTerms.length)) {
    const looser = buildRecommendations(facts, { ...ctx, foodTerms: ctx.foodTerms.filter((f) => !looseTerms.includes(f)) });
    if (looser.items.length) {
      rec = looser;
      const words = looseTerms.map((f) => `“${f.term}”`);
      result.notes.push(`Okanagan Roam doesn’t list ${listText(words)} for these places, so they’re matched on the rest of your request; check with each place.`);
      for (const f of looseTerms) if (!result.unsupported.includes(f.term)) result.unsupported = result.unsupported.concat(f.term);
    }
  }
  result.recommendations = rec.items;
  result.totalMatches = rec.total;
  // Audit fix (2026-10-27): the list's own day, when the request named one, so the trip API can add that day's weekly
  // nights and happy hour to each place ("Tonight: Trivia 7:30–9 PM").
  { const listDate = ctxPlanDate(ctx); if (listDate) result.listDate = listDate; }
  result.summary = buildSummary(kind, ctx, null);
  result.overview = buildOverview(kind, ctx, null);
  // 2026-10-25: when the only matches are closed for the season ("boat rental in Penticton" in October), say so and
  // name them, rather than "no listings match".
  const offSeason = !rec.items.length ? buildRecommendations(facts, { ...ctx, ignoreSeason: true }, 3).items.filter((s) => s.venue) : [];
  if (offSeason.length) {
    const names = offSeason.map((s) => s.venue.name);
    const reopen = offSeason.map((s) => facts.find((f) => f.id === s.venue.id)).find((f) => f && f.seasonReopens);
    const when = ctx.tripDate ? `in ${MONTH_NAMES[Number(ctx.tripDate.slice(5, 7)) - 1]}` : 'right now';
    const reopens = reopen ? ` ${names.length === 1 ? 'It' : reopen.name} reopens ${MONTH_NAMES[Number(reopen.seasonReopens.slice(5, 7)) - 1]} ${Number(reopen.seasonReopens.slice(8, 10))}.` : '';
    result.warnings.push(names.length === 1
      ? `${names[0]} matches but is closed for the season ${when}.${reopens} Ask again with a date in its season to plan it.`
      : `These places match but are closed for the season ${when}: ${listText(names)}.${reopens} Ask again with a date in their season to plan them.`);
    result.closedForSeason = offSeason;
  } else if (!rec.items.length) result.warnings.push('No Okanagan Roam listings match every part of that request.');
  if (ctx.whenDaypart || ctx.startWeekday) {
    const when = whenText(ctx);
    result.notes.push(`Checked against each venue\u2019s listed hours on Okanagan Roam${when ? ` for ${when.replace(/^on /, '')}` : ''}: places whose listed hours show them closed then are left out, and places without usable hours are marked. Hours can change, so check before you go.`);
    const live = liveWindow(ctx, 'evening');
    if (live) result.notes.push(liveNote(live));
    else if (ctx.startWeekday && (ctx.when?.preset === 'today' || ctx.when?.relative === 'tomorrow')) result.notes.push(`Hours were checked for ${WEEKDAY_NAMES[ctx.startWeekday]} (Okanagan time).`);
  }
  seasonNotes(result, ctx);
  return result;
}
// Where each day goes when the request says more than "these towns" (2026-10-14):
//  - "staying in Kelowna, one day trip to Penticton": the base every day, the day-trip town on one middle day;
//  - "road trip from Vernon to Osoyoos over 4 days": towns along the valley between them, in order (it used to spend
//    two days at each end and skip everything between);
//  - "one day in Oliver and Osoyoos": both towns on the same day (it used to plan Oliver only).
// Returns an array of region slugs (or arrays of slugs for a shared day), or null to keep chooseDayRegions().
// The two ends of a road trip the request names, in its direction: "from Kelowna to Osoyoos", "road trip Osoyoos to
// Vernon", "Osoyoos to Vernon in 2 days". Null when the request names no such pair.
function roadTripEnds(ctx) {
  if (!ctx || (ctx.regions || []).length !== 2) return null;
  const req = ctx.requirements || { items: [] };
  const text = req.text || ctx.queryText || '';
  const label = (r) => normWords(regionLabel(ctx, r));
  const named = (phrase) => ctx.regions.find((r) => phrase.startsWith(label(r)));
  let road = /\bfrom ([a-z ]+?) (?:to|down to|up to|through to) ([a-z ]+)/.exec(text);
  // Round 7 (2026-10-19): "road trip Osoyoos to Vernon" (no "from") is a road trip in that direction too; it used to
  // be read as two towns and planned north to south.
  if (!road) {
    for (const [a, b] of [ctx.regions, ctx.regions.slice().reverse()]) {
      const m = new RegExp(`\\b(${label(a)}) (?:to|down to|up to|through to|and on to) (${label(b)})\\b`).exec(text);
      // Round 9 (2026-10-19): "Osoyoos to Vernon in 2 days" needs no "road trip" either -- two towns joined by "to" on a
      // trip of two or more days are a drive from one to the other (it was planned Vernon first, then Osoyoos).
      if (m) { road = [m[0], m[1], m[2]]; break; }
    }
  }
  // Round 11: an open road trip runs the regions in the order the interpreter gave them (Vernon, then Osoyoos).
  if (!road && ctx.intent && ctx.intent.openRoadTrip) road = [null, label(ctx.regions[0]), label(ctx.regions[1])];
  if (!road) return null;
  const from = named(road[1]), to = named(road[2]);
  return from && to && from !== to ? { from, to, roadTrip: /\b(?:road ?trips?|drive|driving|by car)\b|\bfrom\b/.test(text) || !!(ctx.intent && ctx.intent.roadTrip) } : null;
}
// A road trip with no length (round 10): up to this many towns along the way is a one-day drive; a longer one (Kelowna
// to Osoyoos, about two hours) is two days.
const ROAD_TRIP_ONE_DAY_TOWNS = 6;
const ROAD_TRIP_TWO_DAY_TOWNS = 10;
function roadTripTowns(ends) { return routeRegions(ends.from, ends.to).length; }
function planDayGeography(facts, ctx, days) {
  if (!ctx.regions.length) return null;
  if (ctx.partRegions && ctx.partRegionOrder) return Array.from({ length: days }, () => ctx.partRegionOrder.slice());
  const req = ctx.requirements || { items: [] };
  const text = req.text || ctx.queryText || '';
  const label = (r) => normWords(regionLabel(ctx, r));
  const named = (phrase) => ctx.regions.find((r) => phrase.startsWith(label(r)));
  const dayTrip = (req.items || []).find((i) => i.kind === 'day_trip' && ctx.regions.includes(i.value));
  if (dayTrip && days >= 2) {
    const base = ctx.regions.filter((r) => r !== dayTrip.value);
    if (base.length === 1) {
      const plan = Array.from({ length: days }, () => base[0]);
      plan[days >= 3 ? Math.ceil(days / 2) : days - 1] = dayTrip.value; // a middle day, never the arrival day
      plan.note = `Based in ${regionLabel(ctx, base[0])}, with day ${plan.indexOf(dayTrip.value) + 1} as your day trip to ${regionLabel(ctx, dayTrip.value)}.`;
      return plan;
    }
  }
  const ends = roadTripEnds(ctx);
  // Round 10 (2026-10-19): a one-day drive between two towns ("Kelowna to Penticton road trip") stops in both, in order.
  if (ends && days === 1 && ctx.regions.length === 2 && routeRegions(ends.from, ends.to).length <= ROAD_TRIP_ONE_DAY_TOWNS) {
    const plan = [[ends.from, ends.to]];
    plan.parts = { 1: { morning: ends.from, midday: ends.from, afternoon: ends.to, late: ends.to, evening: ends.to } };
    plan.note = `Planned as a one-day drive from ${regionLabel(ctx, ends.from)} to ${regionLabel(ctx, ends.to)}.`;
    return plan;
  }
  if (ends && days >= 2 && ctx.regions.length === 2) {
    const from = ends.from, to = ends.to;
    if (from && to && from !== to) {
      const counts = {};
      for (const v of facts) counts[v.region] = (counts[v.region] || 0) + 1; // towns with too few listings are driven through
      const towns = routeRegions(from, to).filter((r, k, all) => k === 0 || k === all.length - 1 || (counts[r] || 0) >= 25);
      if (towns.length > 2) {
        // Evenly spaced along the valley, nudged to the better-listed neighbour (Kelowna rather than West Kelowna).
        const plan = [];
        for (let k = 0; k < days; k++) {
          const at = Math.round((k * (towns.length - 1)) / (days - 1));
          const options = (k === 0 || k === days - 1) ? [at] : [at - 1, at, at + 1].filter((x) => x > 0 && x < towns.length - 1 && !plan.includes(towns[x]));
          plan.push(towns[options.sort((a, b) => (counts[towns[b]] || 0) - (counts[towns[a]] || 0) || Math.abs(a - at) - Math.abs(b - at))[0] ?? at]);
        }
        const parts = {};
        // Round 8 (2026-10-19): a day that drives past several towns stops on the way -- Osoyoos to Vernon in two days
        // has a morning and lunch in Kelowna (or Penticton) before Vernon, not two and a half hours in the car.
        for (let k = 1; k < plan.length; k++) {
          const a = towns.indexOf([].concat(plan[k - 1]).slice(-1)[0]), b = towns.indexOf(plan[k]);
          if (a < 0 || b < 0 || Math.abs(b - a) < 3) continue;
          const lo = Math.min(a, b), hi = Math.max(a, b), mid = (a + b) / 2;
          const inside = towns.slice(lo + 1, hi);
          const big = inside.filter((r) => (counts[r] || 0) >= 150);
          const between = big.length ? big : inside.filter((r) => (counts[r] || 0) >= 60);
          const choice = between.sort((x, y) => Math.abs(towns.indexOf(x) - mid) - Math.abs(towns.indexOf(y) - mid) || (counts[y] || 0) - (counts[x] || 0))[0];
          if (!choice) continue;
          // The stop on the way is the morning and lunch; the afternoon and the night are in the day's own town.
          parts[k + 1] = { morning: choice, midday: choice, afternoon: plan[k], late: plan[k], evening: plan[k] };
          plan[k] = [choice, plan[k]];
        }
        if (Object.keys(parts).length) plan.parts = parts;
        plan.note = `Planned as a road trip from ${regionLabel(ctx, from)} to ${regionLabel(ctx, to)}, one stretch of the valley each day${plan.some(Array.isArray) ? ', with a stop on the way' : ''}.`;
        return plan;
      }
    }
  }
  if (days === 1 && ctx.regions.length >= 2 && ctx.regions.length <= 3) {
    const along = (r) => { const i = ROUTE_CORRIDOR.indexOf(ROUTE_CORRIDOR.includes(r) ? r : ROUTE_OFF_CORRIDOR[r]); return i < 0 ? 99 : i; };
    const sorted = ctx.regions.slice().sort((a, b) => along(a) - along(b)); // north to south
    // Only neighbouring towns share a day (Oliver and Osoyoos); farther pairs keep one town, as before.
    if (along(sorted[sorted.length - 1]) - along(sorted[0]) <= 3) return [sorted];
  }
  return null;
}
// Per-town, per-time-of-day requests (round 8, 2026-10-19): "Summerland in the morning and Naramata wineries in the
// afternoon", "West Kelowna wineries then dinner in Kelowna", "Peachland and Summerland day trip, dinner in Naramata".
// Returns { parts: { morning: region, midday, afternoon, late, evening }, order: [regions in the day's order] } for a
// one-day request that names two or more towns for different parts of the day, or null. The clauses are read in
// order; a clause with a time of day ("in the afternoon", "dinner") takes those parts, a clause without one takes the
// next free parts before them, and any part left over follows the part before it.
const PART_ORDER = ['morning', 'midday', 'afternoon', 'late', 'evening'];
const PART_WORDS = [
  [/\b(?:morning|mornings|breakfast|brunch|am)\b/, ['morning']],
  [/\b(?:lunch|lunches|midday|noon)\b/, ['midday']],
  [/\b(?:afternoon|afternoons)\b/, ['afternoon', 'late']],
  [/\b(?:evening|evenings|dinner|dinners|supper|night|tonight)\b/, ['evening']],
];
function dayPartRegions(text, regions, labels) {
  if (!Array.isArray(regions) || regions.length < 2) return null;
  const t = normWords(text || '');
  const names = regions.map((r) => ({ r, label: normWords((labels && labels[r]) || r.replace(/-/g, ' ')) })).sort((a, b) => b.label.length - a.label.length);
  // Commas split clauses too, so they are read before normWords drops them.
  const pieces = String(text || '').split(/[,;:]+/).map(normWords).flatMap((c) => c.split(/\s*(?:\bthen\b|\bafter that\b|\bfollowed by\b|\band\b)\s*/));
  const clauses = pieces.filter(Boolean).map((c) => {
    let rest = ` ${c} `;
    const found = [];
    for (const n of names) { const k = rest.indexOf(` ${n.label} `); if (k >= 0) { found.push(n.r); rest = rest.slice(0, k) + ' # ' + rest.slice(k + n.label.length + 2); } }
    const parts = [];
    for (const [re, ps] of PART_WORDS) if (re.test(c)) parts.push(...ps);
    return { regions: found, parts };
  });
  const scoped = clauses.filter((c) => c.regions.length === 1);
  if (new Set(scoped.map((c) => c.regions[0])).size < 2 || !clauses.some((c) => c.parts.length) && !/\bthen\b/.test(t)) return null;
  const out = {};
  // Clauses with a time of day first.
  for (const c of scoped) for (const p of c.parts) if (!out[p]) out[p] = c.regions[0];
  // Then clauses without one, in order, sharing the free parts before the next part that is taken.
  const loose = scoped.filter((c) => !c.parts.length);
  if (loose.length) {
    const free = PART_ORDER.filter((p) => !out[p]);
    const firstTaken = PART_ORDER.findIndex((p) => out[p]);
    const before = firstTaken < 0 ? free : free.filter((p) => PART_ORDER.indexOf(p) < PART_ORDER.indexOf(PART_ORDER.slice(firstTaken).find((q) => out[q]) || 'evening') || PART_ORDER.indexOf(p) < firstTaken);
    const slots = before.length ? before : free;
    slots.forEach((p, k) => { out[p] = loose[Math.min(loose.length - 1, Math.floor((k * loose.length) / slots.length))].regions[0]; });
  }
  let last = null;
  for (const p of PART_ORDER) { if (out[p]) last = out[p]; else if (last) out[p] = last; }
  const firstRegion = PART_ORDER.map((p) => out[p]).find(Boolean);
  for (const p of PART_ORDER) if (!out[p]) out[p] = firstRegion;
  const order = [...new Set(PART_ORDER.map((p) => out[p]))];
  if (order.length < 2) return null;
  return { parts: out, order };
}
// Whether a place fits the town asked for at that part of a one-day plan (round 8).
function partsFor(ctx, d) { return (ctx && (ctx.partRegions ? ctx.partRegions : ctx.dayRegionPlan && ctx.dayRegionPlan.parts ? ctx.dayRegionPlan.parts[d] : null)) || null; }
function partOk(ctx, d, part, v) {
  const pr = partsFor(ctx, d);
  if (!pr || !v) return true;
  const r = pr[part === 'night' ? 'evening' : part];
  return !r || v.region === r;
}
function normWords(s) { return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function uniqRegions(days) { return Array.from(new Set(days.map((d) => d.region).filter(Boolean))); }

// ---------- multi-part itineraries (2026-09-26) ----------
//
// input.trip comes from discovery-intent.js interpretTripComponents(): a
// request split into parts ("cafes and beaches", "dinner and a hockey game").
// Each part is matched ON ITS OWN with the same eligible()/scoreVenue()/
// requestedTimeFit() rules as a single request -- one listing is never asked
// to satisfy two parts -- then the picks are ordered into one itinerary.
// A part with no match is reported as missing; the other parts are kept.
//
// Routes use the Highway 97 order of the regions (north to south). Regions
// off the highway join the route through the corridor region they are
// reached from; no map service, and every stop is chosen by its region, so a
// venue without stored coordinates is never excluded for that.
const ROUTE_CORRIDOR = ['enderby', 'armstrong', 'vernon', 'lake-country', 'kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton', 'kaleden', 'okanagan-falls', 'oliver', 'osoyoos'];
const ROUTE_OFF_CORRIDOR = { coldstream: 'vernon', lumby: 'vernon', silverstar: 'vernon', 'big-white': 'kelowna', naramata: 'penticton', apex: 'penticton', baldy: 'oliver' };
function routeRegions(from, to) {
  if (!from && !to) return [];
  if (!from || !to || from === to) return [to || from];
  const anchor = (r) => (ROUTE_CORRIDOR.includes(r) ? r : ROUTE_OFF_CORRIDOR[r]);
  const a = anchor(from), b = anchor(to);
  if (!a || !b) return Array.from(new Set([from, to]));
  const ia = ROUTE_CORRIDOR.indexOf(a), ib = ROUTE_CORRIDOR.indexOf(b), step = ia <= ib ? 1 : -1;
  const mid = [];
  for (let i = ia; i !== ib + step; i += step) mid.push(ROUTE_CORRIDOR[i]);
  return Array.from(new Set([from, ...mid, to]));
}
function routeDirection(from, to) {
  const anchor = (r) => ROUTE_CORRIDOR.indexOf(ROUTE_CORRIDOR.includes(r) ? r : ROUTE_OFF_CORRIDOR[r]);
  if (!from || !to) return null;
  const a = anchor(from), b = anchor(to);
  if (a === -1 || b === -1 || a === b) return null;
  return a < b ? 'south' : 'north';
}
// When a part happens, if the request did not say.
const ITIN_TYPE_DAYPART = { cafe: 'morning', golf: 'morning', outdoor: 'morning', beach: 'afternoon', winery: 'afternoon', brewery: 'afternoon', distillery: 'afternoon', restaurant: 'evening', pub: 'evening', cocktail: 'evening', indoor: 'afternoon', tour: 'afternoon', sport: 'afternoon' };
const ITIN_DAYPART_RANK = { morning: 0, midday: 1, afternoon: 2, late: 2.5, evening: 3 };
// "Live music" with no listed event falls back to places whose verified
// Live Music badge is set -- only venue types that carry that badge.
const LIVE_MUSIC_VENUE_TYPES = ['pub', 'cocktail', 'brewery', 'restaurant', 'winery'];
const ITIN_VENUE_NOUN = { cafe: 'coffee', restaurant: 'a meal', beach: 'some time on the beach', winery: 'a wine tasting', brewery: 'a craft beer', pub: 'a pub stop', cocktail: 'cocktails', distillery: 'a distillery tasting', outdoor: 'some time outdoors', golf: 'a round of golf', indoor: 'an indoor visit', tour: 'a tour' };
// One visitor-facing phrase per stop, from what that stop actually is.
const ITIN_TYPE_VERB = {
  cafe: 'stop for coffee', restaurant: 'sit down for a meal', beach: 'spend some time on the beach', winery: 'enjoy a wine tasting',
  brewery: 'try a local craft beer', pub: 'stop in at a pub', cocktail: 'settle in for cocktails', distillery: 'enjoy a distillery tasting',
  outdoor: 'spend some time outdoors', golf: 'play a round of golf', indoor: 'head indoors for a visit', tour: 'join a tour',
};
const ITIN_MEAL_VERB = { breakfast: 'enjoy breakfast', brunch: 'enjoy brunch', lunch: 'stop for lunch', dinner: 'sit down for dinner', supper: 'sit down for supper' };
const ITIN_ACTIVITY_VERB = {
  hiking: 'enjoy a scenic hike', fishing: 'spend some time fishing', cycling: 'go for a bike ride', water: 'get out on the water',
  viewpoints: 'take in the views from a lookout', nature: 'spend some time in nature', winter: 'enjoy some time in the snow',
  camping: 'settle in at a campground', adventure: 'try something adventurous',
};
const ITIN_ACTIVITY_NOUN = {
  hiking: 'a scenic hike', fishing: 'some fishing', cycling: 'a bike ride', water: 'time on the water', viewpoints: 'a lookout',
  nature: 'time in nature', winter: 'time in the snow', camping: 'a campground stop', adventure: 'some adventure',
};
function parseEventStart(timeLabel) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(String(timeLabel || '').trim());
  if (!m) return null;
  const h = Number(m[1]) % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return h * 60 + Number(m[2] || 0);
}
function eventEndMinutes(e,start) {
  if(start==null)return null;
  let end=null;
  if(/^\d{2}:\d{2}$/.test(e.endTime||'')) {const [h,m]=e.endTime.split(':').map(Number);end=h*60+m;}
  else {const range=String(e.time||'').split(/\s*[–—-]\s*/);if(range.length>1)end=parseEventStart(range[range.length-1]);}
  if(end!=null&&(e.endsNextDay||end<start))end+=1440;
  return end;
}
// How long to allow for an event whose end time is not listed (2026-10-19, round 7), by the kind of event: a show or
// a concert about 2 hours, a game 2.5, a fair, market or festival visit 2.5, a talk, tour or class 1.5. The plan then
// carries on from there (provisional) instead of marking every later stop "Timing unverified".
const SHOW_EVENT_RE = /\b(?:musical|musicals|theatre|theater|play|plays|concert|concerts|show|shows|performance|performances|ballet|opera|symphony|orchestra|comedy|comedian|recital|cabaret|improv|panto|pantomime|film|films|screening|movie|movies|gig|tour live|live)\b/;
function eventAllowanceMinutes(e) {
  const t = normWords(`${e.name || ''}`), cats = e.categories || [];
  if (/\b(?:hockey|basketball|football|soccer|baseball|game|games|match|tournament|rodeo)\b/.test(t) || cats.includes('sports-recreation')) return 150;
  if (/\b(?:talk|lecture|class|workshop|story ?time|storytime|haunted house)\b/.test(t)) return 90;
  if (/\b(?:fair|festival|fest|market|markets|expo|show and sale|craft fair|maze|pumpkin patch|corn)\b/.test(t)) return 150;
  if (SHOW_EVENT_RE.test(t) || cats.includes('live-music') || cats.includes('nightlife')) return 120;
  if (/\b(?:tour|walk|trail|tasting)\b/.test(t)) return 90;
  return 120;
}
// A performance with a set start (a musical, a concert) is never a drop-in visit, whatever its listed hours.
// Round 12 (2026-10-20): events people visit in the daytime: markets, fairs, craft sales, bazaars, maze and pumpkin patches.
const DAYTIME_EVENT_RE = /\b(?:market|markets|marche|fair|fairs|bazaar|bazaars|craft sale|craft show|artisan sale|show and sale|expo|maze|pumpkin patch|u pick|farm day)\b/;
function daytimeEvent(e) { const t = normWords(e && e.name || ''); return DAYTIME_EVENT_RE.test(t) && !/\b(?:night market|night|evening|after dark|moonlight)\b/.test(t); }
function eventIsShow(e) { return SHOW_EVENT_RE.test(normWords(e.name || '')) && !/\b(?:fair|festival|market|maze|trail)\b/.test(normWords(e.name || '')); }
function weekdayOfDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}
function componentLabel(c, ctx) {
  if (c.kind === 'event') return c.event.noun;
  if (c.liveMusicFallback) return 'live music';
  if (c.rainyOption) return 'indoor activity';
  if (c.lake) return 'lakeside walk';
  if (c.wineryLunch) return 'lunch at a winery';
  if (!c.meal && /\bcheap eats?\b/.test(c.phrase || '')) return 'cheap eats';
  if (c.plannerKinds?.length) return listText(c.plannerKinds.map(k => tripRequirements.LABELS[k] || k));
  if (c.meal) return c.meal;
  if (c.generic) return c.kids ? 'family activities' : 'activities';
  if (c.cuisines && c.cuisines.length) return `${c.cuisines[0]} restaurants`;
  if (c.activities && c.activities.length) return listText(c.activities.map((a) => activityLabel(ctx, a)));
  return listText(c.types.map((t) => typeLabel(ctx, t).toLowerCase())).replace(/ and /, ' or ');
}
// The activity a stop was chosen for: the part's own activity, else (for an
// outdoor place) one the venue is verifiably listed for; or null.
function stopActivity(stop) {
  return stop.activity && ITIN_ACTIVITY_VERB[stop.activity] ? stop.activity : null;
}
// Noun form, for the road-trip sentence ("stopping for coffee and ...").
function venueNoun(stop) {
  if (stop.component.plannerKinds?.includes('easy_walk')) return 'an easy walk';
  if (stop.component.plannerKinds?.includes('walk')) return 'a walk';
  if (stop.component.liveMusicFallback) return 'some live music';
  if (stop.component.meal) return stop.component.meal;
  const act = stopActivity(stop);
  if (act) return ITIN_ACTIVITY_NOUN[act];
  if (stop.venue.indoorGolf) return 'an indoor golf session';
  return ITIN_VENUE_NOUN[stop.venue.type] || 'a stop';
}
function venueVerb(stop) {
  if (stop.component.lake) return 'take a walk by the lake';
  if (stop.component.plannerKinds?.includes('easy_walk')) return 'enjoy an easy walk';
  if (stop.component.plannerKinds?.includes('walk')) return 'go for a walk';
  if (stop.component.liveMusicFallback) return 'catch some live music';
  if (stop.component.meal) return ITIN_MEAL_VERB[stop.component.meal] || 'sit down for a meal';
  if ((stop.component.cuisines || []).some((q) => ['ice cream', 'gelato', 'dessert', 'desserts'].includes(q))) return 'grab an ice cream or a treat';
  const act = stopActivity(stop);
  if (act) return ITIN_ACTIVITY_VERB[act];
  if (stop.venue.indoorGolf) return 'play a session on an indoor golf simulator';
  return ITIN_TYPE_VERB[stop.venue.type] || 'make a stop';
}
const cap = (t) => t.replace(/^./, (x) => x.toUpperCase());
// Round 12 (2026-10-20): when the scheduler swaps a stop for one of another kind (a brewery that is closed then, for
// Sandhill Wines), the short plan's summary says what the stop now is ("Try a local craft beer" sat over a winery).
function swapVerb(plan, from, to) {
  if (!plan || plan.kind !== 'itinerary' || !plan.experience || typeof plan.experience.text !== 'string' || !from || !to || from.type === to.type) return;
  const a = ITIN_TYPE_VERB[from.type], b = ITIN_TYPE_VERB[to.type];
  if (!a || !b) return;
  const text = plan.experience.text;
  const k = text.toLowerCase().indexOf(a);
  if (k < 0) return;
  const repl = text[k] === text[k].toUpperCase() ? cap(b) : b;
  plan.experience = { ...plan.experience, text: text.slice(0, k) + repl + text.slice(k + a.length) };
}
// "the Harvest Family Fair", "the Autumn Lantern Walk" -- but a title that is
// not a kind of event ("Skillful") keeps its name bare.
const EVENT_NOUN_RE = /\b(fair|festival|market|walk|series|show|concert|parade|tournament|night|games?|tour|exhibition|celebration|fest|expo|gala|party|jam|classic)\b/i;
const theName = (name) => (/^the\s/i.test(name) || !EVENT_NOUN_RE.test(name) ? name : `the ${name}`);
// "What to expect" (2026-09-26): one to three sentences, built only from the
// stops that were chosen -- their kinds and order, the part of the day, their
// towns, the event's own listed name and stated start time, the visitor's dog
// and kids words, a stop's current advisory, and the season when it changed
// the plan. No distances, travel times, weather, opening status or detail the
// stops do not carry; a part that found no match is never described.
const EXPERIENCE_TITLE = 'What to expect';
const EXPERIENCE_MAX_SENTENCES = 3;
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function townOf(s) {
  if (s.kind === 'venue') return s.venue.regionLabel || null;
  return s.event.valleyWide ? null : (s.event.regionLabel || null);
}
// Event wording: `go` (from the previous stop), `to` (after "head to <town>
// for"), `evening` (after daytime stops), `first` (opening the plan with it),
// `short` (subject of "... starts at 7 pm").
function eventWords(e) {
  const kind = e.component.event.kind;
  if (kind === 'hockey') return { go: 'head to the rink for the hockey game', to: 'the hockey game', evening: 'an evening hockey game', first: 'Start at the rink with the hockey game', short: 'The game' };
  if (kind === 'concert') return { go: 'head out for the concert', to: 'the concert', evening: 'an evening concert', first: 'Start with the concert', short: 'The concert' };
  if (kind === 'live-music') return { go: 'catch some live music', to: 'some live music', evening: 'some live music in the evening', first: 'Start with some live music', short: 'The music' };
  const n = theName(e.event.name);
  return { generic: true, name: n, go: `head to ${n}`, to: n, evening: `${n} in the evening`, first: `Start at ${n}`, short: 'It' };
}
// A beach out of the swimming season is described as the lakeside stop it is.
function expVerb(s) {
  const f = s.seasonFlags || {};
  if (s.venue.type === 'beach' && !stopActivity(s) && f.beachOff) return s.swimPart ? 'spend some time by the lake' : 'take a walk along the beach';
  return venueVerb(s);
}
function expVerbList(list) {
  const phrases = [];
  for (const s of list) { const v = expVerb(s); if (!phrases.includes(v)) phrases.push(v); }
  if (phrases.length <= 1) return phrases.join('');
  if (phrases.length === 2) return `${phrases[0]}, then ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', then ')}, and ${phrases[phrases.length - 1]}`;
}
// "then head to Penticton to ..." only when the next stops move town.
function thenClause(list, fromTown) {
  const t = townOf(list[0]);
  const same = list.every((s) => townOf(s) === t);
  return same && t && fromTown && t !== fromTown ? `then head to ${t} to ${expVerbList(list)}` : `then ${expVerbList(list)}`;
}
// The one seasonal sentence, only when the season changed the plan.
function seasonLine(stops, season) {
  if (!season) return '';
  const m = season.monthName;
  const has = (k) => stops.some((s) => s.seasonFlags && s.seasonFlags[k]);
  if (has('swimOff')) return `Lake swimming here is a summer activity, so in ${m} the beach is planned as a lakeside stop rather than a swim.`;
  if (has('waterOff')) return `Water activities here are mostly a summer activity, so check with the operator before you plan around it in ${m}.`;
  if (has('snowOff')) return `Snow activities here run in winter, so check what’s operating in ${m} before you go.`;
  if (has('golfCheck')) return `Outdoor golf here is seasonal, so check the course is open in ${m} before you go.`;
  if (has('campingOff')) return `Many campgrounds here are seasonal, so check it’s open in ${m} before you go.`;
  if (has('beachOff')) return `In ${m} the beach is a lakeside walk rather than a swim.`;
  if (has('snowIn')) return `It’s ${m}, so the plan leans into the winter season.`;
  return '';
}
// Sentences by priority -- the flow, a stated start time, then an advisory,
// the season and the dog -- kept to three, then read back in plan order.
function composeExperience(title, flow, timing, geo, stops, venues, season) {
  const adv = venues.find((s) => s.advisory);
  const dog = venues.length > 0 && venues.every((s) => s.component.dog);
  const candidates = [
    { rank: 0, text: flow },
    { rank: 1, text: timing },
    { rank: 2, text: adv ? `${adv.venue.name} has a current advisory on Okanagan Roam, so read the note on its card before you go.` : '' },
    { rank: 3, text: seasonLine(stops, season) },
    { rank: 4, text: dog ? (venues.length > 1 ? 'Every place on the plan is listed as dog friendly, so your dog can come along.' : 'It’s listed as dog friendly, so your dog can come along.') : '' },
    { rank: 5, text: geo },
  ].filter((x) => x.text);
  const kept = candidates.slice(0, EXPERIENCE_MAX_SENTENCES);
  const order = [0, 5, 1, 2, 3, 4];
  kept.sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
  return { title, text: kept.map((x) => x.text).join(' ') };
}
function buildExperience(stops, trip, route, ctx, season) {
  if (!stops.length) return null;
  const venues = stops.filter((s) => s.kind === 'venue');
  const events = stops.filter((s) => s.kind === 'event');
  const family = venues.some((s) => s.component.kids) ? ' with the family' : '';
  const towns = Array.from(new Set(stops.map(townOf)));
  const oneTown = towns.length === 1 && towns[0] ? towns[0] : null;
  const together = (n) => (n === 2 ? 'Both stops are' : `All ${COUNT_WORDS[n] || n} stops are`);
  if (route && venues.length) {
    const nouns = [];
    for (const s of venues) { const n = expVerb(s) !== venueVerb(s) ? expVerb(s).replace(/^(spend|take) /, '') : venueNoun(s); if (!nouns.includes(n)) nouns.push(n); }
    const to = route.to ? regionLabel(ctx, route.to) : null;
    const from = route.from ? regionLabel(ctx, route.from) : null;
    const where = from && to ? `drive ${route.direction ? `${route.direction} ` : ''}from ${from} to ${to}` : `trip to ${to}`;
    const dog = venues.every((s) => s.component.dog);
    const flow = `Enjoy an easygoing ${where}${dog ? ' with your dog' : ''}, stopping for ${listText(nouns)} along the way.`;
    const geo = venues.length > 1 && towns.length > 1 ? `The stops follow the road in order, from ${towns[0]} to ${towns[towns.length - 1]}.` : '';
    return composeExperience(EXPERIENCE_TITLE, flow, '', geo, stops, venues, season);
  }
  if (events.length) {
    const e = events[0];
    const idx = stops.indexOf(e);
    const W = eventWords(e);
    const time = e.timeKnown ? e.event.time : null;
    const eTown = townOf(e);
    const before = venues.filter((s) => stops.indexOf(s) < idx);
    const after = venues.filter((s) => stops.indexOf(s) > idx);
    const lastAndEvening = idx === stops.length - 1 && e.daypart === 'evening';
    const title = EXPERIENCE_TITLE;
    let flow, timing = '', geo = '';
    if (lastAndEvening && before.length) {
      const prevTown = townOf(before[before.length - 1]);
      const moveTo = eTown && prevTown && eTown !== prevTown ? eTown : null;
      const meal = before.length === 1 && (before[0].component.meal || before[0].venue.type === 'restaurant') ? before[0] : null;
      if (meal) {
        const mealWord = meal.component.meal || 'meal';
        flow = `Start with a relaxed ${mealWord}${prevTown ? ` in ${prevTown}` : ''}, then ${moveTo ? `head to ${moveTo} for ${W.to}` : W.go}.`;
        timing = time ? (ctx.requirements ? `${W.short} starts at ${time}. Check the meal timing and travel before committing to this order.` : `${W.short} starts at ${time}, so there’s time to enjoy ${meal.component.meal || 'the meal'} first.`) : `Start times vary, so check the event page before you settle on a ${mealWord} time.`;
      } else {
        const daytime = before.every((s) => s.daypart !== 'evening');
        const lead = before.length === 1 ? `${cap(expVerb(before[0]))}${family}${daytime ? ' during the day' : ''}` : `${cap(expVerbList(before))}${family}`;
        const next = moveTo ? `head to ${moveTo} for ${W.evening}` : eTown && prevTown ? `stay in ${eTown} for ${W.evening}` : `finish with ${W.evening}`;
        flow = `${lead}, then ${next}.`;
        timing = time ? (ctx.requirements ? `${W.short} starts at ${time}. Confirm that earlier stops and travel fit before its listed start.` : `${W.short} starts at ${time}, so the day flows easily into the evening.`) : 'Times vary, so check the event page for the schedule.';
      }
    } else if (!before.length) {
      const at = time ? (W.generic ? ` (${time})` : ` at ${time}`) : '';
      const start = W.generic ? `Start ${e.daypart === 'morning' ? 'the day ' : ''}at ${W.name}${at}` : `${W.first}${at}`;
      flow = after.length ? `${start}${!oneTown && eTown ? ` in ${eTown}` : ''}, ${thenClause(after, eTown)}${family}.` : `${start}${eTown ? ` in ${eTown}` : ''}.`;
      if (!time) timing = 'Times vary, so check the event page for the schedule.';
      if (oneTown && after.length) geo = `${together(stops.length)} in ${oneTown}, so the day stays easy to manage.`;
    } else {
      const prevTown = townOf(before[before.length - 1]);
      const moveTo = eTown && prevTown && eTown !== prevTown ? eTown : null;
      const go = moveTo ? `head to ${moveTo} for ${W.to}` : W.go;
      flow = `${cap(expVerbList(before))}${family}, then ${go}${time ? ` at ${time}` : ''}${after.length ? `, and ${expVerbList(after)} afterwards` : ''}.`;
      if (!time) timing = 'Times vary, so check the event page for the schedule.';
      if (oneTown) geo = `${together(stops.length)} in ${oneTown}, keeping the day simple.`;
    }
    return composeExperience(title, flow, timing, geo, stops, venues, season);
  }
  if (venues.length < 2) return null; // a description is for a combination
  let flow, geo = '';
  const CRAWL_NOUNS = { brewery: 'craft breweries', pub: 'pubs', winery: 'wineries', cocktail: 'cocktail bars', distillery: 'distilleries', cafe: 'cafés' };
  // Round 14 (2026-10-20): two of one kind is a crawl too ("Try a local craft beer first, then try a local craft beer").
  const crawlType = venues.length >= 2 && venues.every((s) => s.venue.type === venues[0].venue.type) ? CRAWL_NOUNS[venues[0].venue.type] : null;
  if (oneTown && crawlType) {
    flow = `Work your way through ${COUNT_WORDS[venues.length] || venues.length} ${crawlType}, one after another${family}.`;
    geo = `${together(venues.length)} in ${oneTown}, so there’s no need to move between towns.${venues[0].venue.type === 'cafe' ? '' : ' Plan a safe ride home.'}`;
  } else if (oneTown) {
    flow = venues.length === 2 ? `${cap(expVerb(venues[0]))} first, then ${expVerb(venues[1])}${family}.` : `${cap(expVerbList(venues))}${family}.`;
    geo = venues.length === 2 ? `${together(2)} in ${oneTown}, keeping the outing simple.` : `${together(venues.length)} in ${oneTown}, so there’s no need to move between towns.`;
  } else {
    const parts = [];
    let prev = null;
    venues.forEach((s, i) => {
      const t = townOf(s);
      if (i === 0) parts.push(`${cap(expVerb(s))}${t ? ` in ${t}` : ''}`);
      else parts.push(t && t !== prev ? `head to ${t} to ${expVerb(s)}` : expVerb(s));
      prev = t || prev;
    });
    flow = `${parts.join(', then ')}${family}.`;
  }
  return composeExperience(EXPERIENCE_TITLE, flow, '', geo, stops, venues, season);
}

// Which listed events can stand for an event part. What's On categories are
// broad (a children's musical, a museum tour or a hockey game can all carry
// "live-music"), so a concert / live-music part also reads the event's NAME:
// a clear music performance, or a listing filed only under live music,
// qualifies; a musical, theatre, comedy, talk, workshop, film, tour of a
// place, a "vs" game, or a family-kids arts listing does not.
const MUSIC_NAME_RE = /\b(live music|live band|concert|concerts|band|quartet|trio|duo|jazz|symphony|orchestra|orchestral|choir|chamber music|tribute|singer|songwriter|acoustic|open mic|jam|gig|dj|sessions?|unplugged|recital|live)\b/;
const COMEDY_TEXT_RE = /\b(?:comedian|comedians|stand up comedy|standup comedy|stand up comedian|comedy tour|comedy show|comedy night)\b/;
const NOT_MUSIC_NAME_RE = /\b(musical|theatre|theater|play|comedy|comedian|talks?|workshop|film|films|movie|acrobatics|burlesque|ghost tours?|architecture|lecture|vs|versus|hockey|tours? of|canal tour|trail tour)\b/;
function normalizeText(t) {
  return String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Family trips (2026-10-18): a family event on What's On in the trip's dates (O'Keefe Ranch's fall weekends, a corn
// maze, a kids' haunted house), even when no event was asked for. Not a bar night or a late show.
// Why an event is in the plan (round 8, 2026-10-19): event cards had an empty "why this fits".
const EVENT_WHY_NOUNS = { comedy: 'a comedy show', show: 'a show', performance: 'a show', concert: 'a concert', 'live-music': 'live music', hockey: 'a hockey game', festival: 'a festival', market: 'a market' };
function eventWhy(e, item, holiday) {
  const out = [];
  if (item && item.id === 'holiday-events' && holiday) out.push(`A ${holiday.label} event on your dates`);
  else if (item && item.id === 'family-events') out.push(holiday && holiday.re.test(normWords(e.name || '')) ? `A family ${holiday.label} event on your dates` : 'A family event on What’s On that day');
  else if (item) out.push(`Matches your request for ${EVENT_WHY_NOUNS[item.eventKind] || (item.value === 'live-music' ? 'live music' : 'an event')}`);
  else if (holiday && holiday.re.test(normWords(e.name || ''))) out.push(`A ${holiday.label} event on your dates`);
  out.push(e.time ? 'Listed on What’s On, with its start time' : 'Listed on What’s On for that day');
  return out;
}
const HOLIDAY_EVENT_ITEM = Object.freeze({ id: 'holiday-events', kind: 'event', value: 'any', eventKind: null, strength: 'prefer' });
const FAMILY_EVENT_ITEM = Object.freeze({ id: 'family-events', kind: 'event', value: 'family-kids', eventKind: null, strength: 'prefer' });
function familyEventUnsuitable(e) {
  const start = parseEventStart(e.time);
  return (e.categories || []).includes('nightlife') || /\b(?:19\+|adults? only|beer|cocktails?|booze|wine tasting)\b/i.test(`${e.name || ''}`) || (start != null && start >= 19 * 60 + 30);
}
// Round 9 (2026-10-19): an evening show with no meal asked for (« soirée spectacle à Kelowna samedi », "a show on Saturday
// night") is planned as dinner and a show, like "dinner and a show"; it used to be a list of everything on that day.
function showEveningText(text) {
  const t = normWords(text || '');
  if (!/\b(?:a show|the show|shows?|comedy shows?|comedy night|stand ?up|theatre|theater|a play|performance|spectacle)\b/.test(t)) return text;
  if (!/\b(?:evening|night|tonight|night out|date night|soiree)\b/.test(t)) return text;
  if (/\b(?:dinner|dinners|supper|lunch|brunch|breakfast|eat|eating|restaurants?|food|drinks?|events|what s on|whats on|list|ideas)\b/.test(t)) return text;
  return `dinner and ${text}`;
}
// A show (round 9): a haunted attraction, corn maze or exhibition is not "a show" -- comedy, theatre and concerts are.
// Round 10 (2026-10-19): nor is a coffee social, a networking mixer, a boutique shopping night or a winemaker dinner.
const NOT_A_SHOW_RE = /\b(?:haunted|haunt|scream|screams|fright|frights|terror|maze|corn|pumpkin|patch|trail|hayride|exhibitions?|exhibits?|tours?|workshops?|classes|class|lectures?|talks?|markets?|museum|gallery|fair|art show|art shows|members show|juried|curiosities|vcac|socials?|sociale|networking|mixer|meetups?|boutiques?|shopping|sale|sales|brunch|breakfast|winemakers?|tastings?|coffee)\b/;
function showRank(e) {
  const name = normalizeText(e.name || ''), text = normalizeText(`${e.name || ''} ${e.description || ''}`);
  if (/\b(?:comedy|comedian|comedians|stand up|standup|improv|laughs?)\b/.test(name) || STAGE_PLAY_RE.test(name) || /\b(?:concert|symphony|orchestra|tribute|musical)\b/.test(name)) return 0;
  if (eventIsShow(e) || (e.categories || []).includes('live-music') || /\b(?:comedy|theatre|theater|concert|stage)\b/.test(text)) return 1;
  return 2;
}
function eventSuitsKind(e, kind) {
  const name = normalizeText(`${e.name || ''} ${e.description || ''}`);
  const cats = e.categories || [];
  if (kind === 'festival') return cats.includes('events-festivals') || /\bfestivals?\b/.test(name);
  if (kind === 'market') return cats.includes('markets-fairs') || /\b(markets?|farmers market|fairs?)\b/.test(name);
  // A show is a performance listing; comedy says comedy (2026-10-19).
  if (kind === 'comedy') return /\b(?:comedy|comedian|comedians|comedic|improv|stand up|standup|laughs?)\b/.test(name);
  // Round 8: a museum tour or an exhibition listed under Arts & Culture is not "a show".
  // Round 10: a nightlife listing alone is not a show (a coffee social, a boutique night); its words must say show.
  if (kind === 'performance' || kind === 'show') return !NOT_A_SHOW_RE.test(normalizeText(e.name || '')) && (cats.some((c) => ['arts-culture', 'live-music'].includes(c)) || /\b(?:show|shows|comedy|comedian|concert|theatre|theater|performance|musical|play|tribute|dance|ballet|opera|symphony|band|improv|cabaret|drag)\b/.test(name));
  if (kind !== 'concert' && kind !== 'live-music') return true;
  const title = normalizeText(e.name || '');
  if (NOT_MUSIC_NAME_RE.test(title)) return false;
  // A comedian is not live music, even when listed under it (2026-10-19: "Danny Bhoy Live", a Scottish comedian).
  if (COMEDY_TEXT_RE.test(name)) return false;
  if (cats.includes('family-kids') && cats.includes('arts-culture')) return false;
  return MUSIC_NAME_RE.test(title) || cats.includes('live-music');
}
// A stated start fits a requested time of day: the evening is 17:00 on (and
// the small hours); the daytime is 05:00-17:00.
function startFitsPart(start, part, strict = false) {
  if (!part) return true;
  if (part === 'evening') return start >= 17 * 60 || (!strict && start < 5 * 60);
  if(strict&&part==='morning')return start>=5*60&&start<12*60;
  if(strict&&part==='afternoon')return start>=12*60&&start<17*60;
  return start >= 5 * 60 && start < 17 * 60;
}
// First suitable event, soonest first: a stated start in the requested time of
// day; failing that, one whose start is not listed (never assumed to fit, and
// flagged); never one whose stated start contradicts the request.
// "A comedy show" (round 8, 2026-10-19) is stand-up first: a comedian or comedy night by name, then an event whose
// description says comedy, and only then a musical or play that is billed as a comedy (Little Shop of Horrors).
const STAGE_PLAY_RE = /\b(?:musical|musicals|theatre|theater|play|plays|opera|ballet|panto|pantomime)\b/;
function comedyRank(e) {
  const name = normalizeText(e.name || ''), text = normalizeText(`${e.name || ''} ${e.description || ''}`);
  if (STAGE_PLAY_RE.test(name) || /\bmusical\b/.test(text)) return 2;
  return /\b(?:comedy|comedian|comedians|stand up|standup|improv|laughs?)\b/.test(name) ? 0 : 1;
}
function chooseTripEvent(candidates, kind, part, strict = false, terms = []) {
  const suitable = candidates.filter((e) => eventSuitsKind(e, kind) && terms.every(term => {
    const words = normalizeText(`${e.name || ''} ${e.description || ''}`).split(' ');
    return normalizeText(term).split(' ').every(word => words.includes(word));
  }));
  // Stable: What's On order (soonest first) within each rank.
  if (kind === 'comedy') suitable.sort((a, b) => comedyRank(a) - comedyRank(b));
  if (kind === 'performance' || kind === 'show') suitable.sort((a, b) => showRank(a) - showRank(b));
  const known = suitable.find((e) => { const st = parseEventStart(e.time); return st != null && startFitsPart(st, part, strict); });
  if (known) return { event: known };
  const unknown = suitable.find((e) => parseEventStart(e.time) == null);
  return { event: unknown || null };
}

// ---------- seasons and advisories (itineraries only, 2026-09-26) ----------
//
// input.tripDate is the Okanagan calendar date of the trip ('YYYY-MM-DD'),
// resolved by the server in America/Vancouver -- never UTC -- or, when the
// plan is built around a listed event, that event's own date. Every seasonal
// rule is SOFT: it moves the ranking and adds a hedged "check before you go"
// caveat; nothing is left out for the season alone. Rules are keyed on the
// venue TYPE and its curated activity memberships, never on its name, and a
// place listed for a year-round activity (hiking, nature, viewpoints) is
// never treated as seasonal-only because it is also in a winter or water
// collection. Golf uses each course's own published rate windows. Only a
// current advisory that states an evacuation order or a closure takes a
// place out. The single-request planner above never sees any of this.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASON_BY_MONTH = [null, 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
// In season / shoulder by month (anything else is off season).
const SEASON_WINDOWS = {
  water: { in: [6, 7, 8, 9], shoulder: [5, 10] }, // swimming, paddling, beach days
  snow: { in: [12, 1, 2, 3], shoulder: [11, 4] }, // skiing, snowshoeing, skating
  golf: { in: [5, 6, 7, 8, 9], shoulder: [3, 4, 10, 11] },
  camping: { in: [5, 6, 7, 8, 9], shoulder: [4, 10] },
};
const YEAR_ROUND_ACTIVITIES = ['hiking', 'nature', 'viewpoints'];
// Beach words that ask for the water itself, not just the shore.
const SWIM_PHRASES = ['swim', 'swimming', 'swimming spot', 'swimming spots', 'swim spot', 'lake day'];
// An advisory note that clearly says a place is unavailable.
const ADVISORY_UNCERTAIN_RE = /\b(?:receivership|for sale|check (?:that )?it is open|may be closed|may not be open|ownership change|uncertain)\b/i;
const ADVISORY_CLOSED_RE = /\b(evacuation order|temporarily closed|closed until|closed for the season|is closed|are closed)\b/i;
// Advisory venues (2026-10-19): a written advisory that says the place is not operating, or may not be (court-ordered
// receivership, for sale, "the tasting room is closed", "Closed for wildfire recovery"), takes it out of every plan;
// before, a receivership note only cost -30 and "Closed for ..." was missed. A partial closure ("the northern portion
// remains closed") is not this. server.js keeps the same rule (ADVISORY_NOT_OPERATING_RE) to list these places last.
const ADVISORY_NOT_OPERATING_RE = /\b(?:receivership|for sale|not operating|no longer operating|temporarily closed|permanently closed|closed until|(?:is|are) (?:now |currently |temporarily |permanently )?closed|check (?:that )?it is open|may be closed|may not be open|ownership change|uncertain)\b|\bclosed for (?!the season\b)/i;
function advisoryNotOperating(note) {
  const t = String(note || '');
  return !!t && !/\bpartial(?:ly)?\b/i.test(t) && ADVISORY_NOT_OPERATING_RE.test(t);
}
// The advisory takes the place out of a plan: an evacuation order or a closure, or a place that is not operating.
function advisoryUnavailable(note) { return !!note && (ADVISORY_CLOSED_RE.test(note) || advisoryNotOperating(note)); }
const ADVISORY_MAX_AGE_DAYS = 365;
const DOG_NOTE_SEASONAL_RE = /\b(season|seasonal|seasonally|summer|winter|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i;

function seasonStatus(cat, month) {
  const w = SEASON_WINDOWS[cat];
  return w.in.includes(month) ? 'in' : w.shoulder.includes(month) ? 'shoulder' : 'off';
}
function tripSeason(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return {
    date: dateStr, month, md: `${m[2]}-${m[3]}`, monthName: MONTH_NAMES[month - 1], season: SEASON_BY_MONTH[month],
    water: seasonStatus('water', month), snow: seasonStatus('snow', month), golf: seasonStatus('golf', month), camping: seasonStatus('camping', month),
  };
}
// What a part asks for, seasonally.
function partSeasonIntent(c) {
  const acts = c.activities || [];
  const types = c.types || [];
  return {
    swim: types.includes('beach') && SWIM_PHRASES.includes(c.phrase),
    water: acts.includes('water'),
    snow: acts.includes('winter'),
    camping: acts.includes('camping'),
    // "things to do", or an outdoor part with no named activity: the season picks.
    open: !!c.generic || (types.includes('outdoor') && !acts.length),
  };
}
function yearRoundBasis(v, ctx) {
  const acts = (v.activities || []).filter((a) => YEAR_ROUND_ACTIVITIES.includes(a));
  if (acts.length) return `Also listed for ${listText(acts.map((a) => activityLabel(ctx, a)))}`;
  if (textHas(v.textDesc, 'year round')) return 'Its description mentions “year-round”';
  return null;
}
function mdInWindow(md, from, to) { return from <= to ? md >= from && md <= to : md >= from || md <= to; }
function mdText(md) {
  const [mm, dd] = md.split('-').map(Number);
  return `${MONTH_NAMES[mm - 1].slice(0, 3)} ${dd}`;
}
const SEASON_CAVEATS = {
  swim: (m) => `Lake swimming here is a summer activity, so in ${m} this is suggested as a lakeside stop`,
  water: (m) => `Water activities here are mostly a summer activity — check with the operator before you plan around it in ${m}`,
  snow: (m) => `Snow activities here run in winter — check what’s operating in ${m} before you go`,
  camping: (m) => `Many campgrounds here are seasonal — check it’s open in ${m} before you go`,
  golf: (m) => `Outdoor golf here is seasonal — check the course is open in ${m} before you go`,
  coolWater: (m) => `The lake is usually too cold for a swim in ${m}, so this is suggested as a beach walk or lakeside stop`,
};
// Seasonal relevance of venue v for part c: { score, reasons, caveats, flags }.
function seasonFit(v, c, season, ctx) {
  const out = { score: 0, reasons: [], caveats: [], flags: {} };
  if (!season) return out;
  const it = partSeasonIntent(c);
  const acts = v.activities || [];
  const m = season.monthName;
  const add = (w, text) => { out.score += w; if (text) out.reasons.push({ code: 'season', text, weight: Math.max(w, 1) }); };
  const waterPlace = v.type === 'beach' || acts.includes('water');
  if (waterPlace && season.water === 'off') {
    const basis = yearRoundBasis(v, ctx);
    if (basis) add(6, `${basis} — a good fit for ${m}`);
    else if (it.open) add(-12, null);
    else if (it.swim || it.water) add(-8, null);
    else add(-2, null);
    if (it.swim && v.type === 'beach') { out.caveats.push(SEASON_CAVEATS.swim(m)); out.flags.swimOff = true; }
    if (it.water && acts.includes('water')) { out.caveats.push(SEASON_CAVEATS.water(m)); out.flags.waterOff = true; }
    if (v.type === 'beach') out.flags.beachOff = true;
  }
  // Weekly audit (2026-10-25): a beach day asked for outside summer ("a day at the beach in Osoyoos" in late October)
  // says the water is cold, as a swim request already did.
  if (v.type === 'beach' && season.water !== 'in' && (c.types || []).includes('beach') && !out.flags.swimOff) { out.caveats.push(SEASON_CAVEATS.coolWater(m)); out.flags.coolWater = true; }
  // 2026-10-25: "a day in Penticton in July" had no beach -- off-season beaches lost points but in-season ones gained
  // none (snow places already gain in winter). In June to September a beach suits an open day.
  if (v.type === 'beach' && season.water === 'in' && ctx && !ctx.itinerary && !(ctx.types && ctx.types.size && !ctx.types.has('beach'))) add(8, `A beach day suits ${m}`);
  if (acts.includes('winter')) {
    const snowOnly = acts.every((a) => a === 'winter');
    if (season.snow === 'in' && it.open) { add(8, `Listed for ${activityLabel(ctx, 'winter')} — in season in ${m}`); out.flags.snowIn = true; }
    if (season.snow === 'off') {
      if (it.snow) { out.caveats.push(SEASON_CAVEATS.snow(m)); out.flags.snowOff = true; } else if (snowOnly) add(-12, null);
    }
  }
  if (acts.includes('camping') && season.camping === 'off') {
    if (it.camping) { out.caveats.push(SEASON_CAVEATS.camping(m)); out.flags.campingOff = true; } else if (acts.every((a) => a === 'camping')) add(-8, null);
  }
  if (v.type === 'golf') {
    if (v.indoorGolf) {
      if (season.golf === 'off') add(16, `An indoor golf / simulator venue — suits a ${m} round`);
    } else {
      const windows = v.golfSeasons || [];
      const covered = windows.find((w) => mdInWindow(season.md, w.from, w.to));
      if (covered) add(6, `Its published ${covered.label ? `${covered.label} ` : ''}rates run ${mdText(covered.from)} – ${mdText(covered.to)}`);
      else {
        if (season.golf === 'off') add(-12, null);
        else if (season.golf === 'shoulder' && windows.length) add(-4, null);
        if (season.golf !== 'in') { out.caveats.push(SEASON_CAVEATS.golf(m)); out.flags.golfCheck = true; }
      }
    }
  }
  return out;
}
// A current advisory (the curated 'advisory' collection note) for venue v:
// { skip } when the note says it is under an evacuation order or closed;
// otherwise the note itself as a caveat, and a ranking cost only when the
// advisory bears on this part (a swimming advisory on a swim part) and is
// not stale. The wording is the note's own first sentence, never reworded.
function advisoryExcerpt(note) {
  const clean = String(note || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const first = (clean.match(/^.*?[.!?](\s|$)/) || [clean])[0].trim();
  return first.length > 200 ? `${first.slice(0, 197).replace(/\s+\S*$/, '')}…` : first;
}
// Closed for the season on the trip's date (the venue's own dated range), or
// today when the plan has no date.
// Today on the Okanagan calendar (America/Vancouver), for owner closures on plans with no date.
function ownerClosureToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const OPERATING_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const OPERATING_PERIOD_RE = new RegExp(`\\b(?:opens?|operates?|runs?)\\s+(?:daily\\s+)?(?:from\\s+)?(${OPERATING_MONTHS.join('|')})\\s+(?:to|through|until|into)\\s+(?:(?:early|mid|late)\\s+)?(${OPERATING_MONTHS.join('|')})\\b`);
function seasonClosedOnTrip(v, season) {
  const d = season && season.date;
  // An owner's special closure (2026-10-18): closed on those dates, or today when the plan has no date.
  if (v.ownerClosures && v.ownerClosures.some((c) => (d || ownerClosureToday()) >= c.from && (d || ownerClosureToday()) <= c.to)) return true;
  // An owner's yearly season ("open May to October") is judged on the trip's own date (2026-10-19, round 7), not on
  // whether it is in season today.
  if (d && v.openMonths) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(v.openMonths));
    if (m) { const mon = Number(d.slice(5, 7)), a = Number(m[1]), b = Number(m[2]); return a <= b ? mon < a || mon > b : mon < a && mon > b; }
  }
  if (v.seasonClosed) {
    if (!d) return !!v.seasonClosedToday;
    // Round 7 (2026-10-19): a ski-hill village place closed for the off-season with no reopening date announced opens
    // with the lifts, so a ski-season date (December to March) is not judged closed by the 200-day placeholder.
    if (v.seasonReopens === null && SKI_HILL_REGIONS.includes(v.region) && SKI_SEASON_MONTHS.includes(Number(d.slice(5, 7))) && !SKI_SEASON_MONTHS.includes(Number(String(v.seasonClosed.from).slice(5, 7)))) return false;
    return d >= v.seasonClosed.from && d <= v.seasonClosed.to;
  }
  // Only explicit operating ranges in the stored description establish a
  // closure. Generic seasonal mentions never establish dates or availability.
  if (!d || !['outdoor','tour'].includes(v.type)) return false;
  const clauses=String(v.plannerDescription || v.textDesc || '').split(/[.!?;]/).map(normalizeText);
  const period=clauses.map(clause=>{
    const match=OPERATING_PERIOD_RE.exec(clause);
    if (!match) return null;
    const subject=clause.slice(0,match.index).trim();
    const venueSubject=/^(?:(?:the|this) )?(?:park|venue|attraction|resort|centre|center|operator|business|it)$/.test(subject)||subject===normalizeText(v.name||'');
    const tourSubject=v.type==='tour'&&/^(?:the )?tours?$/.test(subject);
    return !subject||venueSubject||tourSubject?match:null;
  }).find(Boolean);
  if (!period) return false;
  const month = Number(d.slice(5,7))-1, from = OPERATING_MONTHS.indexOf(period[1]), to = OPERATING_MONTHS.indexOf(period[2]);
  return from<=to ? month<from || month>to : month<from && month>to;
}
function advisoryFit(v, c, season) {
  if (seasonClosedOnTrip(v, season)) return { skip: true };
  const a = v.advisory;
  if (!a || !a.note) return null;
  if (advisoryUnavailable(a.note)) return { skip: true };
  let stale = false;
  if (season && /^\d{4}-\d{2}-\d{2}/.test(a.addedAt || '')) {
    const age = (Date.parse(season.date) - Date.parse(a.addedAt.slice(0, 10))) / 86400000;
    stale = age > ADVISORY_MAX_AGE_DAYS;
  }
  const it = partSeasonIntent(c);
  let score = 0;
  if (!stale && /\bswim/i.test(a.note) && v.type === 'beach') score = it.swim ? -15 : -3;
  return { skip: false, score, caveat: `Advisory on Okanagan Roam: ${advisoryExcerpt(a.note)}` };
}
// A dog-beach's own seasonal access rule, verbatim, for a dog part.
function dogSeasonCaveat(v, c) {
  if (!c.dog || !v.dogNote || !(v.collections || []).includes('dog_friendly')) return null;
  return DOG_NOTE_SEASONAL_RE.test(v.dogNote) ? `Dog access: ${String(v.dogNote).trim()}` : null;
}

// The day the visitor attends an event: the later of the trip date and the
// listing's first day, never past its last day. A multi-day run that began
// last week is attended on the trip date; a Friday-only listing picked for
// "this weekend" (trip date Saturday) is attended on the Friday. With no trip
// date, the listing's first day, as before.
function eventAttendanceDate(e, tripDate) {
  const iso = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? x : null);
  const start = iso(e.startDate);
  const end = iso(e.endDate);
  const trip = iso(tripDate);
  if (!start) return null;
  let date = trip && trip > start ? trip : start;
  if (end && date > end) date = end;
  return date;
}

function firstEvent0(stops) { return stops.some((s) => s.kind === 'event'); }
function planItinerary(input) {
  const { intent = {}, facts = [], labels = {}, trip, tripEvents = [] } = input;
  const baseCtx = buildContext({ ...intent, regions: [] }, labels, input);
  const route = trip.route ? { from: trip.route.from, to: trip.route.to, direction: routeDirection(trip.route.from, trip.route.to) } : null;
  const regions = route ? routeRegions(route.from, route.to) : (trip.regions || []).slice();
  const routeIndex = new Map(regions.map((r, i) => [r, i]));
  const result = {
    kind: 'itinerary', summary: '', overview: null, days: [], recommendations: [], outing: null, events: [],
    itinerary: null, experience: null, notes: [], warnings: [], unsupported: intent.unsupported || [], needs: [],
  };
  // Stage 3.5 D5: an occasion the parts do not use is reported, not dropped.
  const occasionNotUsed = unappliedItineraryOccasion(intent, trip);
  if (occasionNotUsed && !result.unsupported.includes(occasionNotUsed)) result.unsupported = result.unsupported.concat(occasionNotUsed);
  for (const place of trip.unknownPlaces || []) result.warnings.push(`“${place}” isn’t a place Okanagan Roam covers, so it wasn’t used for the route.`);
  // Step 1 (2026-09-29): the visitor's own words that no part of the plan
  // used are named, never silently dropped ("a lake walk").
  // 2026-10-25: a clock time ("lunch at noon", "at 7pm") is read as the time, never reported as a leftover word.
  const leftover = (trip.leftoverTerms || []).filter((w) => !(trip.unknownPlaces || []).some((p) => p.split(' ').includes(w)) && !/^\d{1,2}(?::?[0-5]\d)?(?:am|pm)$|^(?:am|pm|noon|midday|midnight)$/.test(String(w)));
  if (leftover.length) result.warnings.push(`Not part of this plan: ${listText(leftover.map((w) => `“${w}”`))} — Okanagan Roam couldn’t match ${leftover.length > 1 ? 'those words' : 'that word'} to a kind of place it lists.`);
  if (route && !route.from && route.to) result.notes.push(`No starting point was given, so the stops are in ${regionLabel(baseCtx, route.to)}.`);
  const whereText = route && route.from && route.to
    ? `along the way from ${regionLabel(baseCtx, route.from)} to ${regionLabel(baseCtx, route.to)}`
    : regions.length ? `in ${listText(regions.map((r) => regionLabel(baseCtx, r)))}` : 'in the Okanagan';

  // Events first: the event anchors when and where the rest of the evening happens.
  const parts = trip.components.map((c, i) => ({ c: { ...c }, i }));
  const stops = [];
  let anchor = null;
  for (const p of parts) {
    if (p.c.kind !== 'event') continue;
    const wantPart = p.c.daypart || (trip.when && trip.when.daypart) || null;
    const deadline = input.requirements?.items.find(i=>i.kind==='deadline');
    const candidates = (tripEvents[p.i] || []).filter(e=>!deadline || parseEventStart(e.time)==null || parseEventStart(e.time)<deadline.value);
    // Round 8: "dinner and a show" is an evening show when there is one (a 2 PM museum tour was the "show").
    const withDinner = !wantPart && !input.requirements?.daypart && parts.some((q) => q.c.kind === 'venue' && ['dinner', 'supper'].includes(q.c.meal));
    let choice = withDinner ? chooseTripEvent(candidates, p.c.event.kind, 'evening', true, p.c.event.nameTerms) : { event: null };
    if (!choice.event || parseEventStart(choice.event.time) == null) { const any = chooseTripEvent(candidates, p.c.event.kind, wantPart || input.requirements?.daypart, !!input.requirements, p.c.event.nameTerms); if (any.event && (!choice.event || parseEventStart(any.event.time) != null)) choice = any; }
    const e = choice.event;
    if (e) {
      const start = parseEventStart(e.time);
      const daypart = start == null ? (['hockey', 'concert', 'live-music'].includes(p.c.event.kind) ? 'evening' : (p.c.daypart || null)) : start < 12 * 60 ? 'morning' : start < 17 * 60 ? 'afternoon' : 'evening';
      const stop = {
        kind: 'event', component: p.c, index: p.i, label: p.c.event.noun.replace(/^./, (x) => x.toUpperCase()), daypart: wantPart && start == null ? wantPart : daypart,
        event: { ...e, regionLabel: regionLabel(baseCtx, e.region) }, timeKnown: start != null, start,
        caveats: start != null ? [] : [wantPart ? `Its start time isn’t listed, so it may not be in the ${wantPart === 'evening' ? 'evening' : 'daytime'} — check the event page` : 'Start times vary — check the event page before you plan around it'],
      };
      if (input.requirements && start != null && eventEndMinutes(e,start)==null) stop.caveats.push('The event’s end time is not listed; check that any later stop fits before making plans.');
      stops.push(stop);
      if (!anchor) {
        const date = eventAttendanceDate(e, input.tripDate);
        anchor = { region: e.valleyWide ? null : e.region, weekday: weekdayOfDate(date), daypart, date, start, location:e.location };
      }
    } else if (p.c.event.venueFeature) {
      // No listed event: the verified venue badge stands in, when places have it.
      p.c = { ...p.c, kind: 'venue', types: LIVE_MUSIC_VENUE_TYPES.slice(), features: [p.c.event.venueFeature], activities: [], collections: [], cuisines: [], liveMusicFallback: true };
      result.notes.push('No live-music event is listed for those dates, so places with a verified Live Music badge are suggested instead.');
    } else {
      const when = wantPart === 'evening' ? ' for the evening' : wantPart ? ' for the daytime' : '';
      const trackedByRequirement = input.requirements?.items?.some(i =>
        i.kind === 'event' && i.eventKind === p.c.event.kind &&
        (!tripRequirements.requirementDay(i, input.tripDate) || tripRequirements.requirementDay(i, input.tripDate) === p.i + 1)
      );
      if (!trackedByRequirement) result.warnings.push(`No ${p.c.event.noun} is listed on What’s On${when} for those dates, so the rest of the plan is shown.`);
    }
  }

  // The season of the trip: the chosen event's own date, else the trip date.
  const season = tripSeason((anchor && anchor.date) || input.tripDate);
  let seasonRanked = false;

  // One community per outing (as buildOuting does) when the request named no
  // town and no route: later parts prefer the community of the event, or of
  // the first stop chosen, and fall back to the valley only when that
  // community has no match for them. Explicit geography is never overridden.
  const explicitGeography = !!route || regions.length > 0;
  let community = !explicitGeography && anchor && anchor.region ? { region: anchor.region, from: 'event' } : null;
  const used = new Set();
  const walking = input.requirements?.items.some(i => i.kind === 'transport' && i.value === 'walking');
  const walkingLimit = walking ? input.requirements.items.filter(i => ['transport','distance'].includes(i.kind)).reduce((n,i) => Math.min(n,i.kind === 'transport' ? i.limitKm : i.value), 1.5) : Infinity;
  if (walking) parts.sort((a,b)=>(SLOT_WINDOWS[a.c.daypart || ITIN_TYPE_DAYPART[a.c.types?.[0]] || 'afternoon']?.from || 0)-(SLOT_WINDOWS[b.c.daypart || ITIN_TYPE_DAYPART[b.c.types?.[0]] || 'afternoon']?.from || 0) || a.i-b.i);
  let previousVenue = null;
  let wineryWords = null;
  for (const p of parts) {
    const c = p.c;
    if (c.kind !== 'venue') continue;
    const pairWithEvent = anchor && (c.meal === 'dinner' || c.meal === 'supper' || (!c.daypart && c.types.includes('restaurant')) || c.daypart === 'evening');
    const daypart = pairWithEvent ? 'evening' : (c.daypart || (input.requirements && anchor ? ITIN_TYPE_DAYPART[c.types[0]] || 'afternoon' : null));
    const when = pairWithEvent ? { daypart: 'evening' } : trip.when ? { ...trip.when, ...(daypart ? { daypart } : {}) } : daypart ? { daypart } : null;
    const ci = {
      // A walk by the lake can be a lakeside park, promenade or beach path that is listed as a walk (2026-10-14).
      // 2026-10-25: a lunch may be a café that serves lunch when no restaurant fits ("wine, lunch and dinner in Naramata"
      // in late October: every Naramata lunch restaurant was closed for the season, so the lunch was dropped).
      regions, types: c.lake ? [...new Set([...c.types, 'outdoor', 'beach'])] : c.meal === 'lunch' && !c.venueId && !(c.cuisines || []).length && c.types.includes('restaurant') ? [...new Set([...c.types, 'cafe'])] : c.types, activities: c.lake ? [] : c.activities || [], collections: c.collections || [], features: c.features || [],
      foodTerms: (c.cuisines || []).map((q) => ({ term: q, cuisine: q })), party: { dog: !!c.dog, kids: !!c.kids },
      occasion: ['dinner','supper'].includes(c.meal) ? trip.outingOccasion || null : null, when, superlative: false,
      // Stage 3.5: the request's exclusions hold for every part.
      excluded: intent.excluded,
      // Stage 3.5 D5: so does its budget -- the same soft ranking as a
      // single plan (a known price that fits ranks up, one that misses ranks
      // down, a place without a price is never excluded).
      budget: intent.budget || null,
    };
    const ctx = buildContext(ci, labels, { ...input, tripDate: input.requirements && anchor ? anchor.date : input.tripDate, startWeekday: (pairWithEvent || input.requirements) && anchor?.weekday ? anchor.weekday : input.startWeekday });
    if (c.plannerKinds || c.activities?.length || trip.explicitStops) ctx.plannerKinds = c.plannerKinds || [];
    if (c.lake) ctx.plannerKinds = [...new Set([...(ctx.plannerKinds || []), 'walk', 'easy_walk'])];
    const scored = [];
    const closedByAdvisory = [];
    for (const v of facts) {
      if (used.has(v.id) || !regionOk(v, ctx) || !eligible(v, ctx, true) || !tripRequirements.venueAllowed(v, input.requirements, 1, input.tripDate)) continue;
      if (walking && previousVenue && (v.region !== previousVenue.region || kmBetween(previousVenue,v) == null || kmBetween(previousVenue,v) > walkingLimit)) continue;
      if (c.venueId && c.venueId !== v.id) continue;
      // A generic rainy-day suggestion should fit the travelling party.
      // Preserve an explicitly requested venue and family playground requests.
      if (input.requirements && c.rainyOption && !c.kids && !c.venueId && /\b(?:indoor playground|young kids|toddlers|ball pit|play structures)\b/i.test(v.plannerDescription || v.textDesc || v.description || '')) continue;
      if (c.generic && !c.types.includes(v.type)) continue;
      if ((!daypart || daytimePart(daypart)) && eveningOnlyVenue(v) && !c.venueId && !EVENING_VENUE_RE.test(normWords(c.phrase || ''))) continue; // round 11
      if (c.wineryLunch && !wineryLunchSpot(v, wineryWords || (wineryWords = wineryNameWords(facts)))) continue;
      if (c.meal && !c.venueId && notAMeal(v) && !(c.cuisines || []).length) continue; // round 12: a dessert stand is not dinner
      // Round 14 (2026-10-20): a café hop is coffee houses and bakeries, not a sub shop, juice bar or ice-cream counter.
      if (trip.crawl && v.type === 'cafe' && !c.venueId && !['coffee', 'unclear'].includes(cafeRole(v))) continue;
      const lunchCafe = c.meal === 'lunch' && v.type === 'cafe' && !c.types.includes('cafe');
      if (lunchCafe && !['coffee', 'unclear'].includes(cafeRole(v))) continue; // a lunch café serves food, not just treats
      const s = scoreVenue(v, ctx);
      if (lunchCafe) s.score -= 6; // a restaurant first when one fits
      const t = requestedTimeFit(v, ctx);
      if (t && t.skip) continue;
      if (input.requirements && anchor?.start != null && daypart && SLOT_WINDOWS[daypart]?.from < anchor.start) {
        const parsed = v._hours || (v._hours = parseVenueHours(v.hours));
        if (parsed.known && anchor.weekday && provenClosed(parsed.days[anchor.weekday], {from:SLOT_WINDOWS[daypart].from,to:Math.min(SLOT_WINDOWS[daypart].to,anchor.start)})) continue;
      }
      const deadline = input.requirements?.items.find(i=>i.kind==='deadline');
      if (deadline) {
        const parsed = v._hours || (v._hours = parseVenueHours(v.hours));
        const weekday = anchor?.weekday || ctx.startWeekday;
        const window = {from: daypart && SLOT_WINDOWS[daypart] ? Math.min(SLOT_WINDOWS[daypart].from,deadline.value) : 0, to:deadline.value};
        const days = weekday ? [parsed.days[weekday]] : Object.values(parsed.days);
        if (parsed.known && days.length && days.every(day=>provenClosed(day,window))) continue;
      }
      const adv = advisoryFit(v, c, season);
      if (adv && adv.skip) { closedByAdvisory.push({ v, score: s.score }); continue; }
      const sf = seasonFit(v, c, season, ctx);
      if (sf.score) seasonRanked = true;
      let score = s.score + (t ? t.score : 0) + sf.score + (adv ? adv.score : 0) + varietyNudge(v, ctx);
      // Round 12: an appointment-only winery is booked, not a walk-in "drinks" or "tasting" stop, unless it was named.
      if (!c.venueId && appointmentOnly(v)) score -= 25;
      // Round 14 (2026-10-20): brunch or breakfast is a place that serves it, not a 40-minute coffee house or bakery
      // ("brunch and a walk in Kelowna" was brunch at Pulp Fiction Coffee).
      const brunchPart = ['brunch', 'breakfast'].includes(c.meal) && !c.venueId;
      if (brunchPart && BRUNCH_FOOD_RE.test(`${v.textName || ''} ${v.textCuisine || ''} ${v.textDesc || ''}`)) score += 14;
      else if (brunchPart && v.type === 'cafe') score -= 14;
      const nearby = input.requirements && !route ? distanceTerm(previousVenue, v, 4, input.requirements.items.some(i => i.kind === 'duration' && i.value <= 120) ? 3 : 15) : {score:0,reasons:[],caveats:[]};
      score += nearby.score;
      // Round 12 (2026-10-20): a time-window stop was not asked for by kind ("Matches your request for breweries" on
      // "an evening in West Kelowna"), so it does not say so.
      const reasons = (c.windowStop ? s.reasons.filter((x) => x.code !== 'type') : s.reasons).concat(t ? t.reasons : [], sf.reasons, nearby.reasons);
      if (pairWithEvent && anchor.region && v.region === anchor.region) { score += 12; reasons.push({ code: 'near_event', text: `In ${regionLabel(ctx, v.region)}, where the event is`, weight: 12 }); }
      if(input.requirements&&pairWithEvent&&!route&&anchor.location){
        const travel=tripRequirements.estimateTransfer(v,anchor.location,walking);
        if(travel){
          const penalty=Math.min(60,travel.maxMinutes*0.8);score-=penalty;
          reasons.push({code:'event_travel',text:`Estimated ${travel.mode} travel to the event: ${travel.minMinutes}–${travel.maxMinutes} minutes; shorter transfers are preferred. Confirm the route.`,weight:-penalty});
        }else score-=12;
      }
      if (c.lake && /\b(?:rentals?|water sports|rink|adventure company|tours?|charters?|golf)\b/.test(v.textName || '')) continue; // a business, not a walk
      if (c.lake) {
        // On the shore (by name or description) beats a lookout with a lake view.
        const SHORE = /\b(?:lakeshore|lakeside|lakefront|beach|waterfront|promenade|by the water|along the lake)\b/;
        const onShore = v.type === 'beach' || SHORE.test(v.textName || ''), shore = onShore || SHORE.test(v.textDesc || '');
        const w = onShore ? 45 : shore ? 25 : v.features.lake_view ? 10 : 0;
        if (w) { score += w; reasons.push({ code: 'lake', text: shore ? 'By the lake' : 'Has the Lake View badge', weight: w }); }
      }
      if (c.liveMusicFallback) reasons.push({ code: 'live_music', text: 'Has the verified Live Music badge', weight: 8 });
      const dogCaveat = dogSeasonCaveat(v, c);
      const caveats = (t ? t.caveats : []).concat(sf.caveats, nearby.caveats, adv ? [adv.caveat] : [], dogCaveat ? [dogCaveat] : []);
      scored.push({ v, score, base: s.score, reasons, caveats, seasonFlags: sf.flags, advisory: !!adv });
    }
    scored.sort(compareScored);
    // A walk by the lake is on the shore when the town has one listed.
    if (c.lake) { const shore = scored.filter((x) => x.reasons.some((r) => r.code === 'lake' && r.text === 'By the lake')); if (shore.length) scored.splice(0, scored.length, ...shore); }
    const label = componentLabel(c, ctx);
    let pool = scored;
    if (community) {
      const inTown = scored.filter((x) => x.v.region === community.region);
      if (inTown.length) {
        pool = inTown;
        for (const x of inTown) {
          if (!x.reasons.some((r) => r.code === 'near_event')) {
            x.reasons.push({ code: 'community', text: community.from === 'event' ? `In ${regionLabel(ctx, x.v.region)}, where the event is` : `In ${regionLabel(ctx, x.v.region)}, close to your other stops`, weight: 3 });
          }
        }
      } else if (scored.length) {
        result.notes.push(`No ${label} matched in ${regionLabel(ctx, community.region)}, so that stop is in ${regionLabel(ctx, scored[0].v.region)}.`);
      }
    }
    // Only car-free requests need this lookahead. Prefer a first stop that
    // can be paired with the next requested activity, rather than an isolated
    // top-rated venue. Proximity is not a verified pedestrian route.
    if (walking) {
      const remaining = parts.slice(parts.indexOf(p)+1).filter(x => x.c.kind === 'venue');
      if (remaining.length) {
        const futurePools = remaining.map(part => {
          const next=part.c;
        const nextCtx = buildContext({...ci,types:next.types,activities:next.activities || [],collections:next.collections || [],features:next.features || [],foodTerms:(next.cuisines || []).map(q=>({term:q,cuisine:q})),party:{dog:!!next.dog,kids:!!next.kids},when:{...(trip.when || {}),daypart:next.daypart || ITIN_TYPE_DAYPART[next.types[0]] || 'afternoon'}},labels,input);
        nextCtx.plannerKinds = next.plannerKinds || [];
        const candidates = facts.filter(v => !used.has(v.id) && regionOk(v,nextCtx) && eligible(v,nextCtx,true) && (!next.venueId || next.venueId===v.id) && (!next.generic || next.types.includes(v.type)) && tripRequirements.venueAllowed(v,input.requirements,1,input.tripDate) && !requestedTimeFit(v,nextCtx)?.skip && !advisoryFit(v,next,season)?.skip && !seasonClosedOnTrip(v,season)).filter(v=>{
          const deadline=input.requirements.items.find(i=>i.kind==='deadline');
          if (!deadline) return true;
          const parsed=v._hours || (v._hours=parseVenueHours(v.hours));
          const part=next.daypart || ITIN_TYPE_DAYPART[next.types[0]] || 'afternoon';
          const weekday=anchor?.weekday || nextCtx.startWeekday;
          const days=weekday ? [parsed.days[weekday]] : Object.values(parsed.days);
          return !parsed.known || !days.length || !days.every(day=>provenClosed(day,{from:Math.min(SLOT_WINDOWS[part].from,deadline.value),to:deadline.value}));
        });
          return candidates;
        });
        // Bound search work. An exhausted search is unknown, never proof
        // that a chain is impossible; only proven complete chains outrank it.
        let checks=0;
        function completes(previous,index,seen) {
          if(index===futurePools.length)return true;
          if(++checks>10000)return null;
          let unknown=false;
          for(const v of futurePools[index]) {
            if(seen.has(v.id)||v.region!==previous.region||kmBetween(previous,v)==null||kmBetween(previous,v)>walkingLimit)continue;
            const nextSeen=new Set(seen);nextSeen.add(v.id);
            const fit=completes(v,index+1,nextSeen);
            if(fit===true)return true;
            if(fit===null)unknown=true;
          }
          return unknown?null:false;
        }
        const compatible=pool.filter(x=>completes(x.v,0,new Set([...used,x.v.id]))===true);
        if(compatible.length)pool=compatible;
      }
    }

    // Round 12 (2026-10-20): near-equal places of the best one's kind rotate by request (a walk-only plan keeps its order).
    // Round 14: a part with a particular ask (a hike, a cuisine, a kind of place) rotates too, among places that match it
    // as well as the best one does (rotateWithinType keeps the reasons the best one was chosen for); a named place, a
    // walk-only plan and a lake day keep their best match.
    const pick = walking || c.venueId || c.lake ? pool[0] : rotateWithinType(pool, ctx, undefined, { slot: `it-${parts.indexOf(p)}`, opening: parts.indexOf(p) === 0, lunch: !!(c.meal && /lunch|brunch/.test(String(c.meal))), dinner: !!(c.meal && /dinner|supper/.test(String(c.meal))) });
    // Say so when a place that would otherwise have ranked first was left
    // out because its advisory says it is closed or under an evacuation order.
    const bestClosed = closedByAdvisory
      .filter((x) => (!community || x.v.region === community.region) && (!pick || x.score > pick.base))
      .sort((x, y) => y.score - x.score)[0];
    const closedNote = !bestClosed ? null : seasonClosedOnTrip(bestClosed.v, season)
      ? `${bestClosed.v.name} was left out: it is closed for the season on that date.`
      : `${bestClosed.v.name} was left out: its current advisory on Okanagan Roam says it isn’t available.`;
    if (closedNote && !result.notes.includes(closedNote)) result.notes.push(closedNote);
    if (!pick) {
      if (walking && previousVenue) result.warnings.push(`No nearby ${label} with verified coordinates fits the car-free plan within ${walkingLimit} km straight-line of ${previousVenue.name}; the requested stop is left unfilled.`);
      // Round 11 (2026-10-20): a time-window plan ("an evening in West Kelowna") just has fewer stops.
      else if (c.windowStop) result.notes.push(`Nothing for ${c.phrase} is open ${whereText} in that window, so the plan has fewer stops.`);
      else if (trip.crawl && stops.some((s) => s.kind === 'venue' && s.component && s.component.types && (c.types || []).every((t) => s.component.types.includes(t)))) {
        // Round 14 (2026-10-20): a crawl with fewer places than asked says how many it has ("No breweries matched in
        // Vernon" was shown under a crawl with two Vernon breweries).
        const have = stops.filter((s) => s.kind === 'venue' && s.component && s.component.types && (c.types || []).every((t) => s.component.types.includes(t))).length;
        const note = `${label.replace(/^./, (x) => x.toUpperCase())} ${whereText}: only ${COUNT_WORDS[have] || have} ${have === 1 ? 'fits' : 'fit'} the plan, so the crawl has ${have === 1 ? 'that one' : `those ${COUNT_WORDS[have] || have}`}.`;
        if (!result.notes.includes(note)) result.notes.push(note);
      }
      // Audit fix (2026-10-27): "pub dinner and drinks in Osoyoos" started at The Sage Pub and still warned "No pubs or
      // cocktail lounges matched in Osoyoos": a part whose kinds an earlier stop already covers is not missing.
      else if (stops.some((s) => s.kind === 'venue' && s.venue && (c.types || []).includes(s.venue.type))) continue;
      else result.warnings.push(`No ${c.dog && !/dog/.test(label) ? 'dog-friendly ' : ''}${label} matched ${whereText}, so the rest of the plan is shown.`);
      continue;
    }
    used.add(pick.v.id);
    previousVenue = pick.v;
    if (!explicitGeography && !community) community = { region: pick.v.region, from: 'stop' };
    const extra = route ? [{ code: 'route', text: `In ${regionLabel(ctx, pick.v.region)}, on the way`, weight: 1 }] : regionReason(pick.v, ctx);
    const alternates = pool.filter((s) => s !== pick && !used.has(s.v.id)).slice(0, 2);
    // A crawl's later stops are the same kind, so its alternates are not held back from them.
    // Planner (2026-10-27): so is a second tasting ("wine and dinner", extraTasting).
    if (!walking && !trip.crawl && !parts.some((x) => x.c && x.c.extraTasting) && !(trip.explicitStops && parts.some(p => (p.c.plannerKinds || []).some(k => tripRequirements.isSportKind(k))))) for (const a of alternates) used.add(a.v.id);
    if (c.wineryLunch) pick.reasons = pick.reasons.concat({ code: 'meal', text: pick.v.type === 'winery' ? 'A winery that serves lunch' : 'Lunch at a winery’s restaurant', weight: 8 });
    stops.push({
      kind: 'venue', component: c, index: p.i, label: c.wineryLunch ? 'Lunch at a winery' : label.replace(/^./, (x) => x.toUpperCase()), daypart: daypart || (pick.v.type === 'cafe' && cafeRole(pick.v) === 'treat' ? 'afternoon' : ITIN_TYPE_DAYPART[pick.v.type]) || 'afternoon', timed: !!daypart, ...(c.wineryLunch ? { wineryLunch: true } : {}),
      activity: (c.activities || []).find((a) => (pick.v.activities || []).includes(a))
        || (pick.v.type === 'outdoor' ? (pick.v.activities || []).find((a) => ITIN_ACTIVITY_VERB[a]) : null) || null,
      ...stopFrom(pick.v, pick, extra, ctx),
      alternates: alternates.map((a) => stopFrom(a.v, a, [], ctx)),
      seasonFlags: pick.seasonFlags || {}, advisory: pick.advisory, swimPart: partSeasonIntent(c).swim,
    });
  }

  // 2026-10-25: "hike then dinner in Vernon" had the hike at 9 AM and dinner at 6 PM, nine hours apart. When the only
  // meal is dinner and no time was given, the other stops lead up to it: the afternoon, and the late afternoon from April
  // to September (outdoor stops stay in the afternoon in the short-daylight months). A round of golf keeps its morning.
  const mealOf = (s) => s.kind === 'venue' && s.component && s.component.meal;
  // "dinner then a brewery", "a pub after dinner": a drinks stop asked for after dinner goes after it (it was put at
  // 1 PM, before dinner).
  const askedText = normWords((input.requirements && input.requirements.text) || input.text || '');
  const dinnerStop = stops.find((s) => ['dinner', 'supper'].includes(mealOf(s)));
  if (dinnerStop && !firstEvent0(stops)) {
    const afterDinnerWords = /\b(?:dinner|supper)\b.*\b(?:then|afterwards?|followed by|after that|later)\b/.test(askedText);
    for (const s of stops) {
      if (s === dinnerStop || s.kind !== 'venue' || s.timed || mealOf(s) || !s.venue || !['brewery', 'pub', 'cocktail', 'distillery'].includes(s.venue.type)) continue;
      const named = s.component && s.component.phrase ? normWords(s.component.phrase) : '';
      const afterThis = named && new RegExp(`\\b${named}\\b.*\\bafter (?:dinner|supper)\\b`).test(askedText);
      if (afterThis || (afterDinnerWords && stops.indexOf(s) > stops.indexOf(dinnerStop))) { s.daypart = 'evening'; s.afterDinner = true; }
    }
    // Same evening slot: the stops keep the asked order, so an after-dinner stop named first moves behind dinner.
    for (const s of stops.filter((x) => x.afterDinner && stops.indexOf(x) < stops.indexOf(dinnerStop))) { stops.splice(stops.indexOf(s), 1); stops.splice(stops.indexOf(dinnerStop) + 1, 0, s); }
  }
  if (!firstEvent0(stops) && stops.some((s) => ['dinner', 'supper'].includes(mealOf(s))) && !stops.some((s) => ['breakfast', 'brunch', 'lunch'].includes(mealOf(s)))) {
    const free = stops.filter((s) => s.kind === 'venue' && !s.timed && !mealOf(s) && !s.afterDinner && s.venue && s.venue.type !== 'golf' && ['morning', 'afternoon'].includes(s.daypart));
    const month = Number(String(input.tripDate || '').slice(5, 7));
    const longDays = month >= 4 && month <= 9;
    if (free.length === 1) free[0].daypart = longDays || !OUTSIDE_TYPES.includes(free[0].venue.type) ? 'late' : 'afternoon';
    else if (free.length === 2) { free[0].daypart = 'afternoon'; free[1].daypart = longDays || !OUTSIDE_TYPES.includes(free[1].venue.type) ? 'late' : 'afternoon'; }
  }

  // Order: along the route for a road trip; otherwise by clock time. An
  // event with a stated start is placed at that time; a stop the visitor gave
  // no time for goes before an evening event and after a daytime one; a venue
  // goes before an event at the same time, then parts stay as asked.
  const lat = (s) => (s.venue && s.venue.latitude != null ? s.venue.latitude : null);
  const firstEvent = stops.find((s) => s.kind === 'event' && s.start != null);
  const windowStart = (part) => (SLOT_WINDOWS[part] ? SLOT_WINDOWS[part].from : 13 * 60);
  const clockOf = (s) => {
    if (s.kind === 'event') return s.start != null ? s.start : s.daypart ? windowStart(s.daypart) : 24 * 60;
    if (s.afterDinner) return windowStart('evening') + 1;
    if (s.timed || !firstEvent) return windowStart(s.daypart);
    return firstEvent.start >= 17 * 60 ? firstEvent.start - 1 : firstEvent.start + 1;
  };
  stops.sort((a, b) => {
    if (route && a.kind === 'venue' && b.kind === 'venue') {
      const ra = routeIndex.get(a.venue.region) ?? 99, rb = routeIndex.get(b.venue.region) ?? 99;
      if (ra !== rb) return ra - rb;
      const la = lat(a), lb = lat(b);
      if (la != null && lb != null && la !== lb) return route.direction === 'north' ? la - lb : lb - la;
      return a.index - b.index;
    }
    const ta = clockOf(a), tb = clockOf(b);
    if (ta !== tb) return ta - tb;
    if (a.kind !== b.kind) return a.kind === 'venue' ? -1 : 1;
    return a.index - b.index;
  });

  if (walking) {
    const selectedIds=new Set(stops.filter(s=>s.venue).map(s=>s.venue.id));
    for (let i=0;i<stops.length;i++) {
      const s=stops[i];
      if (!s.venue) continue;
      const neighbours=[stops[i-1],stops[i+1]].filter(Boolean);
      s.alternates=(s.alternates || []).filter(a=>!selectedIds.has(a.venue.id) && neighbours.every(n=>{
        const av=facts.find(v=>v.id===a.venue.id),nv=n.venue && facts.find(v=>v.id===n.venue.id);
        return nv && av && av.region===nv.region && kmBetween(av,nv)!=null && kmBetween(av,nv)<=walkingLimit;
      }));
    }
    for (let i=1;i<stops.length;i++) {
      const a=stops[i-1], b=stops[i];
      const av=a.venue && facts.find(v=>v.id===a.venue.id), bv=b.venue && facts.find(v=>v.id===b.venue.id);
      if (!av || !bv || kmBetween(av,bv)==null || kmBetween(av,bv)>walkingLimit) result.warnings.push('This sequence includes a transfer whose walking proximity is not verified; confirm the route before following the plan.');
    }
  }
  const publicStop = (s) => {
    const base = { kind: s.kind, label: s.label, daypart: s.daypart, component: s.index, ...(s.wineryLunch ? { wineryLunch: true } : {}) };
    if (s.kind === 'event') return { ...base, event: s.event, timeKnown: s.timeKnown, caveats: s.caveats, why: eventWhy(s.event, { id: 'part', eventKind: s.component && s.component.event ? s.component.event.kind : null, value: s.component && s.component.event && s.component.event.kind === 'live-music' ? 'live-music' : 'any' }, holidayTheme(input.text || input.requirements?.text || '')) };
    // (timed / start are internal ordering hints and stay server-side.)
    return { ...base, venue: s.venue, reasons: s.reasons, why: s.why, caveats: s.caveats, alternates: s.alternates };
  };
  result.itinerary = {
    stops: stops.map(publicStop),
    route: route ? { ...route, fromLabel: route.from ? regionLabel(baseCtx, route.from) : null, toLabel: route.to ? regionLabel(baseCtx, route.to) : null, regions: regions.map((r) => ({ slug: r, label: regionLabel(baseCtx, r) })) } : null,
  };
  result.events = stops.filter((s) => s.kind === 'event').map((s) => s.event);
  if (input.requirements && stops.some(s => s.kind === 'event') && stops.some(s => s.component?.plannerKinds?.includes('sunset'))) {
    result.warnings.push('Sunset timing is not verified against the event duration, travel time or local sunset time; confirm these before following this sequence.');
  }
  result.experience = buildExperience(stops, trip, route, { ...baseCtx, regions }, season);
  result.season = season ? { date: season.date, season: season.season, month: season.monthName } : null;
  if (season && (seasonRanked || stops.some((s) => s.seasonFlags && Object.keys(s.seasonFlags).length))) {
    result.notes.push(`Planned for ${season.monthName} (Okanagan time): seasonal activities such as swimming, paddling, skiing, camping and outdoor golf are ranked for the time of year, and nothing is left out for the season alone.`);
  }

  // Summary + overview, from what was asked.
  const representedParts = new Set(stops.filter(s => s.kind === 'event' || s.venue).map(s => s.index));
  const partLabels = trip.components.map((c, i) => ({ c, i })).filter(({ i }) => representedParts.has(i)).map(({ c }) => {
    const l = componentLabel(c, baseCtx);
    // Activity labels are Title Case ("Hiking & Trails"); in this sentence
    // they read like the other parts ("Cafes, hiking & trails and dinner").
    const activityPart = c.kind !== 'event' && c.activities && c.activities.length && l === listText(c.activities.map((a) => activityLabel(baseCtx, a)));
    return c.kind === 'event' && l !== 'live music' ? article(l) : activityPart ? l.toLowerCase() : l;
  });
  const allDog = trip.components.filter((c) => c.kind === 'venue').every((c) => c.dog) && trip.components.some((c) => c.kind === 'venue' && c.dog);
  // One label once (2026-10-18: "Dog-friendly breweries, breweries and breweries in Penticton").
  const listed = listText([...new Set(partLabels)]);
  const where = route && route.from && route.to ? ` from ${regionLabel(baseCtx, route.from)} to ${regionLabel(baseCtx, route.to)}` : route && route.to ? ` on the way to ${regionLabel(baseCtx, route.to)}` : regions.length ? ` in ${listText(regions.map((r) => regionLabel(baseCtx, r)))}` : '';
  const when = trip.when && trip.when.preset === 'this-weekend' ? ' this weekend' : '';
  const occasionPrefix = trip.outingOccasion === 'date_night' || baseCtx.occasion === 'date_night' ? 'Date night: ' : '';
  result.summary = `${occasionPrefix}${allDog ? 'Dog-friendly ' : ''}${allDog ? listed : listed.replace(/^./, (x) => x.toUpperCase())}${where}${when}.`.replace(/^Dog-friendly (.)/, (m, c) => `Dog-friendly ${c.toLowerCase()}`);
  // Round 11 (2026-10-20): "Saturday evening in Penticton: drinks, dinner and a nightcap."
  if (trip.timeWindow) {
    const day = trip.when && trip.when.weekday ? String(trip.when.weekday).replace(/^./, (x) => x.toUpperCase()) : trip.when && trip.when.relative === 'tomorrow' ? 'Tomorrow' : trip.when && trip.when.preset === 'today' ? 'This' : '';
    const head = day === 'This' ? `This ${trip.timeWindow}` : day ? `${day} ${trip.timeWindow}` : `${trip.timeWindow === 'afternoon' || trip.timeWindow === 'evening' ? 'An' : 'A'} ${trip.timeWindow}`;
    const phrases = [...new Set(trip.components.map((c, i) => ({ c, i })).filter(({ i }) => representedParts.has(i)).map(({ c }) => c.phrase))];
    result.summary = `${head}${where}${phrases.length ? `: ${listText(phrases)}` : ''}.`;
    result.timeWindow = trip.timeWindow;
  }
  result.overview = {
    where: route && route.from && route.to ? `${regionLabel(baseCtx, route.from)} → ${regionLabel(baseCtx, route.to)}` : regions.length ? listText(regions.map((r) => regionLabel(baseCtx, r))) : 'the Okanagan',
    regions: regions.map((r) => ({ slug: r, label: regionLabel(baseCtx, r) })),
    // 2026-10-28: a crawl's three pub stops are one interest ("pubs", not "pubs, pubs, pubs").
    days: null, pace: null, interests: [...new Set(partLabels)], occasion: null, budget: null,
  };
  if (trip.party && trip.party.dog && stops.some((s) => s.kind === 'event')) result.notes.push('Events aren’t checked for dogs; the dog-friendly requirement applies to the places.');
  if (stops.some((s) => s.kind === 'venue')) result.notes.push('Stops are checked against each venue’s listed hours on Okanagan Roam where it has them; hours can change, so check before you go.');
  return result;
}

function liveNote(live) {
  const day = WEEKDAY_NAMES[live.weekday];
  const when = live.win.from >= 1440 ? `${day} night, from ${clockText(live.win.from)}` : `${day} from ${clockText(live.win.from)}`;
  return `Hours were checked for ${when} Okanagan time; places whose listed hours have already ended (or do not start again) are left out.`;
}
// Plan-level honesty notes, added once for any scheduled plan or outing.
function scheduleNotes(result, ctx) {
  const stops = [...result.days.flatMap((d) => d.stops), ...(result.outing ? result.outing.stops : [])].filter((s) => s.venue);
  if (!stops.length) return;
  result.notes.push('Stops are timed against each venue\u2019s listed hours on Okanagan Roam where it has them; hours can change, so check before you go.');
  const live = liveWindow(ctx, 'evening');
  if (live) result.notes.push(liveNote(live));
  else if (ctx.startWeekday) result.notes.push(`Day 1 is planned as a ${WEEKDAY_NAMES[ctx.startWeekday]}.`);
  if (stops.some((s) => (s.caveats || []).some((c) => /No map location/.test(c)))) {
    result.notes.push('Some stops have no map location on file; they were chosen within the same community, but their distance from the other stops isn\u2019t measured.');
  }
}

module.exports = {
  // Planner (2026-10-27): long idle gaps and daypart labels
  closeIdleGaps,
  IDLE_GAP_LIMIT,
  userNamedTimes,
  partAt,
  relabelDayparts,
  // Build My Trip audit fixes (2026-10-27)
  ctxPlanDate, nightKindOfTerm, venueNight, listedMatch, specialFoodMatch, afterMidnightTonight, skiOpeningFor,
  withSameEstates, longDayHike, longDayHikeMinutes,
  coolBeachMonth,
  dogOnlyPlace,
  offSeasonSkip,
  tripTheme,
  // Build My Trip round 15 (2026-10-20)
  addSuggestedTimes, addStory, SUGGESTED_TIMES_NOTE,
  // Build My Trip round 14 (2026-10-20)
  rotateWithinType, rotateBooked, withoutRepeatedAlternates, ROTATE_KEEP_BEST, ROTATE_SPREAD, appointmentKept, KIDS_ONLY_RE, BRUNCH_FOOD_RE,
  // Build My Trip round 12 (2026-10-20)
  notAMeal, appointmentOnly, appointmentNotice, rotationNudge, daytimeEvent, swapVerb,
  // Build My Trip round 10 (2026-10-19)
  bookedOutfitter, oneRoundADay, eventOnDay, eveningOnlyVenue, varietyNudge,
  applyItinerarySwap, isItinerarySwap, estateKey, tastingRoomWithRestaurant, trailMinutes, coldMonthIceCream, roadTripEnds, pullDinnersForward, scheduleTripByHours,
  // Build My Trip round 9 (2026-10-19)
  holdSwapPins, ensureDinners, showEveningText, showRank, wineryLunchRank, offSeasonSkip,
  // Build My Trip round 8 (2026-10-19)
  dayPartRegions, swapSoftPins, gapFillMinutes,
  // Build My Trip round 7 (2026-10-19)
  applyFoodTourMeaning, foodTourMeansFood, fillDinnerGaps, eventAllowanceMinutes, skiOffSeasonMonth, asksWineryLunch, wineryLunchSpot, holidayTheme,
  // Build My Trip pass 6 (2026-10-19)
  isDinnerStop,
  wineryNameWords,
  wineryRestaurant,
  applySwapPreference,
  dinnerOnly,
  // Search ranking (2026-10-18): /search ranks date-night and special-dinner requests with the planner's own occasion
  // scoring (server.js smartRomanceScore), so the two never disagree.
  occasionScore,
  specialDinner,
  casualDinner,
  requestsSpecialDinner,
  placeKey,
  familyAvoid,
  wineTargets,
  wineTourMeansWineries,
  applyWineTourMeaning,
  fastFood,
  publicVenue,
  parseVenueHours,
  hoursFit,
  listedHoursText,
  cafeRole,
  SLOT_WINDOWS,
  PLAN_DAYPARTS,
  PLAN_MAX_HOP_KM,
  SLOT_AFFINITY,
  OCCASION_TYPES,
  classifyPlanRequest,
  eligible,
  oneSimulatorATrip,
  roughAccess,
  advisoryFit,
  advisoryNotOperating,
  // Round 7 (2026-10-19): server.js's legacy /api/trip/generate uses the same rule.
  advisoryUnavailable,
  ADVISORY_NOT_OPERATING_RE,
  seasonClosedOnTrip,
  scoreVenue,
  buildContext,
  chooseDayRegions,
  regionCentroids,
  planTrip,
  haversineKm,
  eventSuitsKind,
  eventsEachEvening,
  chooseTripEvent,
  routeRegions,
  routeDirection,
  parseEventStart,
  buildUnderstood,
};
