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

const PLAN_DAYPARTS = {
  relaxed: ['morning', 'afternoon', 'evening'],
  standard: ['morning', 'afternoon', 'evening'],
  packed: ['morning', 'midday', 'afternoon', 'evening'],
};
// 'late' (late afternoon) is used only by a wine day with three or more tastings (2026-10-18: "3 wineries a day").
const PLAN_DAYPART_LABELS = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', late: 'Late afternoon', evening: 'Evening' };
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
function kmBetween(a, b) { return hasCoords(a) && hasCoords(b) ? haversineKm(a.lat, a.lng, b.lat, b.lng) : null; }
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
    tripDate: opts.tripDate || null,
    events: opts.events || [],
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


function typeLabel(ctx, type, form = 'plural') {
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
const BUDGET_FOOD_TYPES = ['restaurant', 'cafe', 'pub'];
function eligible(v, ctx, strict) {
  if (ctx.exclude.has(v.id)) return false;
  // Stage 3.5: an applied exclusion is a hard rule in every kind of plan.
  // Only the kinds /search applies (types, regions, stored cuisines, curated
  // lists, activities, and "nothing fancy" = a stored price of 4); "without
  // kids", "no alcohol" and the like stay unapplied and are reported.
  if (ctx.exclusions.applied.length && isExcluded(v, ctx.exclusions)) return false;
  // Step 1 (2026-09-29): a current advisory that says the place is closed or
  // under an evacuation order takes it out of every plan (itineraries
  // already did this; day plans, outings and recommendations now do too).
  // Multi-part itineraries keep their own handling, which also names the
  // place that was left out.
  if (!ctx.itinerary && v.advisory && v.advisory.note && ADVISORY_CLOSED_RE.test(v.advisory.note)) return false;
  // A venue closed for the season today is left out the same way (dated
  // itineraries check the trip's own date in advisoryFit instead).
  if (!ctx.itinerary && !ctx.requirements && v.seasonClosedToday) return false;
  // A budget request (cheap, budget, affordable) is about food, not wine tastings (2026-10-18).
  if (ctx.budget === 'budget' && BUDGET_SKIPPED_TYPES.includes(v.type) && !ctx.types.has(v.type)) return false;
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
    for (const ft of ctx.foodTerms) if (!foodMatch(v, ft)) return false;
  }
  return true;
}


// ---------- scoring ----------
//
// Returns { score, reasons } where each reason is { code, text, weight } and
// every text is built from the request and a verified field. Transparent
// and deterministic; the seed only adds a small bounded jitter so
// "Regenerate" can surface other valid options.
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
  }
  for (const ft of ctx.foodTerms) {
    const m = foodMatch(v, ft);
    if (!m) continue;
    if (m.cuisine) add('food', 18, `Listed cuisine: ${v.cuisineLabel || ft.cuisine} — matches “${ft.term}”`);
    else {
      const where = [m.inName && 'name', m.inCui && 'cuisine', m.inDesc && 'description'].filter(Boolean);
      // A loose word in a restaurant's description ("desert", "quiet") counts for less than a dish it serves.
      const loose = DINING_TYPES.includes(v.type) && !m.inName && !m.inCui && !DISH_WORDS_RE.test(ft.term) && !/^(?:brunch|breakfast)$/.test(ft.term);
      add('food', (m.inName ? 15 : 0) + (m.inCui ? 10 : 0) + (m.inDesc ? (loose ? 3 : 7) : 0), `Mentions “${ft.term}” in its ${listText(where)}`);
    }
  }
  occasionScore(v, ctx, add); // adds through `add`; must not be `score += ...` (that would drop them)
  const fit = budgetFits(ctx.budget, v.price);
  // "Cheap eats" (2026-10-18): $ places first, $$ after, pricier ones last (it once led with $$ sushi).
  if (ctx.budget === 'budget' && v.price != null) {
    if (v.price === 1) add('budget', 14, `Price level ${priceText(v.price)} fits your budget preference`);
    else if (v.price === 2) add('budget', 3, `Price level ${priceText(v.price)} fits your budget preference`);
    else add('budget_miss', -14, null);
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
    regionLabel: ctx ? regionLabel(ctx, v.region) : v.region, typeLabel: ctx ? typeLabel(ctx, v.type, 'singular') : v.type,
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
  const ctx = buildContext(i, labels || {}, {});
  const x = extras || {};
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
    themes: (ctx.dayThemes || []).map((th) => themeLabel(ctx, th)).filter(Boolean),
    notUsed,
  };
}
function stopFrom(v, scored, extra, ctx) {
  const reasons = scored.reasons.concat(extra || []);
  const caveats = [...new Set([...(scored.caveats || []), ...tripRequirements.listedAccessNotes(v)])];
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

function buildRecommendations(facts, ctx, count = RECOMMENDATION_COUNT) {
  const strict = true;
  const scored = [];
  // "Cheap eats Penticton" (2026-10-18): food places only when nothing else was asked for, $ first.
  const budgetFood = ctx.budget === 'budget' && [...ctx.types].every((t) => DINING_TYPES.includes(t)) && !ctx.activities.size && !ctx.plannerKinds.length;
  for (const v of facts) {
    if (budgetFood && !BUDGET_FOOD_TYPES.includes(v.type) && !(v.fdTypes || []).some((t) => BUDGET_FOOD_TYPES.includes(t)) && !ctx.types.has(v.type)) continue;
    if (!regionOk(v, ctx) || !eligible(v, ctx, strict) || !tripRequirements.venueAllowed(v, ctx.requirements, 1, ctx.tripDate) || ctx.requirements && seasonClosedOnTrip(v, { date:ctx.tripDate })) continue;
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
  // Default date-night shape (a heuristic): a drink in the early evening,
  // then dinner. Lounges first, then pubs and breweries, then wineries --
  // wineries stay in, but only where their listed hours reach the early
  // evening (or their hours are unknown, which is flagged, never assumed).
  return [
    { types: ['cocktail', 'pub', 'brewery', 'winery'], daypart: 'evening', window: 'drinks', label: 'A drink first', prefer: ['romantic', 'celebration'].includes(ctx.occasion) ? { cocktail: 10, winery: 8, pub: 0, brewery: -4 } : { cocktail: 8, pub: 5, brewery: 5, winery: 4 } },
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
    let best = null;
    for (const first of candidatesFor(steps[0], null, new Set()).slice(0, 12)) {
      const second = candidatesFor(steps[1], first.v, new Set([first.v.id]))[0];
      const total = first.score + (second ? second.score : -60);
      if (!best || total > best.total + 1e-9) best = { total, pair: [first, second || null] };
    }
    picks = best ? best.pair : [null, null];
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
  for (const ft of ctx.foodTerms) f.push({ key: `food:${ft.term}`, test: (v) => !!foodMatch(v, ft) });
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
    return base;
  }
  if (lake) { focusTypes.add('beach'); focusTypes.add('outdoor'); }
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
    regions = Object.keys(byRegion).filter((r) => centroids[r] && (byRegion[r] || []).length >= 6)
      .sort((a, b) => strength(b) - strength(a) || a.localeCompare(b)).slice(0, k);
  }
  // North to south, so a multi-region trip never doubles back.
  regions.sort((a, b) => lat(b) - lat(a) || a.localeCompare(b));
  if (!regions.length) return [];
  return Array.from({ length: days }, (_, i) => regions[Math.floor((i * regions.length) / days)]);
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
function offSeasonSkip(v, ctx) {
  const month = Number((ctx.tripDate || '').slice(5, 7));
  if (!month || ctx.types.has(v.type) || (v.type === 'beach' && ctx.lake) || (v.type === 'golf' && v.indoorGolf)) return false;
  return (OFF_SEASON_MONTHS[v.type] || []).includes(month);
}

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
    const capped = v => (ctx.requirements?.items || []).some(i => i.kind === 'type_count' && i.strength === 'must' && i.value === v.type && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d) && (tripRequirements.requirementDay(i, ctx.tripDate) ? dayTypes[v.type] || 0 : tripTypeCount[v.type] || 0) >= i.count) || (v.type === 'restaurant' && Number.isInteger(ctx.requirements?.explicitMealCount) && (tripTypeCount.restaurant || 0) >= ctx.requirements.explicitMealCount);
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
    const partDay = !!(ctx.requirements?.daypart || ctx.requirements?.onlyRequested || (ctx.requirements?.items || []).some((i) => i.kind === 'duration') || ctx.whenDaypart)
      || (ctx.requirements?.dayStartMinutes?.[d] ?? ctx.requirements?.startMinutes) >= 11 * 60 // a late start
      || Number.isInteger(ctx.requirements?.explicitMealCount); // the visitor counted the meals ("one dinner")
    const fullDayLunch = !lunchAsked && !/\b(?:no|skip|without) lunch\b/i.test(reqText) && !partDay && (dayPace !== 'relaxed' || foodAsked) && dayDayparts.includes('morning') && dayDayparts.includes('afternoon') && dayDayparts.includes('evening') && !dayDayparts.includes('midday') && !(ctx.requirements?.items || []).some((i) => i.kind === 'event');
    const dayMaxHop = PLAN_MAX_HOP_KM[dayPace] || maxHop;
    const dayKmCost = PLAN_KM_PENALTY[dayPace] || kmCost;
    const thTest = themeTest(theme);
    const thLabel = theme ? themeLabel(ctx, theme) : null;
    let themeMet = false;
    const walking = (ctx.requirements?.items || []).some(i => i.kind === 'transport' && (!tripRequirements.requirementDay(i,ctx.tripDate) || tripRequirements.requirementDay(i,ctx.tripDate) === d));
    const distanceLimit = (ctx.requirements?.items || []).filter(i => ['distance','transport'].includes(i.kind) && i.strength === 'must' && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d)).reduce((n,i) => Math.min(n,i.kind === 'transport' ? i.limitKm : i.value), Infinity);
    const anchors = ctx.requirements ? (ctx.events || []).filter(e => {
      const visit=eventAttendanceDate(e,actualDate),start=parseEventStart(e.time);return visit===actualDate&&(!regionList.length||regionList.includes(e.region))&& (start==null||startFitsPart(start,ctx.requirements?.daypart,true));
    }) : [];
    const requestedEvents = (ctx.requirements?.items || []).filter(i => i.kind === 'event' && !covered.has(i.id) && (!tripRequirements.requirementDay(i, ctx.tripDate) || tripRequirements.requirementDay(i, ctx.tripDate) === d));
    const anchor = anchors.find(e => requestedEvents.some(i => tripRequirements.eventMatches(e,i) && eventSuitsKind(e,i.eventKind)) && !used.has(`event:${e.id}`));
    const start = anchor ? parseEventStart(anchor.time) : null;
    const end = anchor ? eventEndMinutes(anchor, start) : null;
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
    const eventPart = anchor ? (start == null ? 'evening' : start < 12 * 60 ? 'morning' : start < 17 * 60 ? 'afternoon' : 'evening') : null;
    for (const daypart of dayDayparts) {
      const pin = pinned && pinned[`${d}-${daypart}`];
      const occupied=anchor && (daypart===eventPart || start!=null && end!=null && start<SLOT_WINDOWS[daypart].to && end>SLOT_WINDOWS[daypart].from);
      if(occupied && pin) { const error=new Error(`The event conflicts with a locked stop on day ${d}. Unlock it or choose another event.`); error.code='TRIP_CONFLICT'; throw error; }
      if(anchor && daypart === eventPart) {
        stops.push({ kind:'event', daypart, label: PLAN_DAYPART_LABELS[daypart], event:anchor, timeKnown:start!=null, caveats:[start==null?'Event start time is not listed; confirm before visiting.':'Confirm the event duration and allow time around its listed start.'] });
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
      if (pin && byId.has(pin) && (!ctx.requirements || regionOk(byId.get(pin),ctx) && (!region || byId.get(pin).region === region)) && !capped(byId.get(pin)) && !ctx.exclude.has(pin) && !used.has(pin) && eligible(byId.get(pin), ctx, false) && tripRequirements.venueAllowed(byId.get(pin), ctx.requirements, d, ctx.tripDate) && (!ctx.requirements || !seasonClosedOnTrip(byId.get(pin), { date: actualDate }))) {
        const v = byId.get(pin);
        const fit = slotFit(v, ctx, daypart, d - 1, daypart);
        const dist = distanceTerm(prev, v, dayKmCost, dayMaxHop);
        if (dayRequestAllows(v,daypart) && (fit.ok || !ctx.requirements) && (!prev || (kmBetween(prev,v) == null ? !walking : kmBetween(prev,v) <= distanceLimit))) chosen = { v, score: 0, reasons: (base.get(v.id) || scoreVenue(v, ctx)).reasons.concat(fit.ok ? fit.reasons : [], dist.reasons), caveats: (fit.ok ? fit.caveats : []).concat(dist.caveats) };
      }
      if (!chosen) {
        const cands = [];
        for (const v of dayPool) {
          if (activityDay.has(v.id)&&activityDay.get(v.id)>d&&!(ctx.requirements?.items || []).some(i=>i.strength==='must'&&tripRequirements.requirementDay(i,ctx.tripDate)===d&&tripRequirements.matches(v,i)))continue;
          if (used.has(v.id) || reserved.has(v.id) || capped(v) || !tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
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
          // "A nice dinner" (one meal asked for) is the evening; it is never spent on lunch.
          if (ctx.requirements?.explicitMealCount === 1 && !hasExplicitMeals && v.type === 'restaurant' && daypart !== 'evening' && dayDayparts.includes('evening')) continue;
          if (lunchAsked && daypart === 'midday' && v.type !== 'restaurant') continue;
          if (lunchAsked && daypart === 'afternoon' && v.type === 'restaurant' && dayDayparts.includes('midday')) continue;
          if (scenicMorning(v) && daypart !== 'morning' && !focuses.some((f) => f.test(v))) continue;
          if (activityGap && DINING_TYPES.includes(v.type)) continue;
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
          if (daypart === 'evening' && ['pub', 'brewery'].includes(v.type) && !ctx.types.has(v.type) && !vFocus.length) score -= 14;
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
          const dinnerJourney = daypart === 'evening' && v.type === 'restaurant' && mealRequests.length;
          const dist = distanceTerm(prev, v, dinnerJourney ? OUTING_KM_PENALTY : dayKmCost, dinnerJourney ? PLAN_MAX_HOP_KM.relaxed : dayMaxHop);
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
        chosen = cands[0] || null;
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
      continue;
    }
    if (!info) continue;
    const morning = at('morning'), afternoon = at('afternoon'), evening = at('evening');
    if (!morning?.venue || !afternoon?.venue || !evening?.venue || at('midday')) continue;
    // A meal in the afternoon slot is the day's lunch (2026-10-18: Vernon day 2 had "Afternoon: <restaurant>" and no
    // midday stop): it moves to midday, and the afternoon gets something to do when one fits.
    if (['restaurant', 'pub'].includes(afternoon.venue.type) && !['restaurant', 'pub'].includes(morning.venue.type) && !(pinned && pinned[`${day.day}-afternoon`])) {
      afternoon.daypart = 'midday';
      afternoon.label = PLAN_DAYPART_LABELS.midday;
      const d = day.day, lunchV = byId.get(afternoon.venue.id), first = byId.get(morning.venue.id);
      const taken = new Set(out.flatMap((x) => x.stops.map((st) => st.venue && placeKey(byId.get(st.venue.id))).filter(Boolean)));
      const types = new Set(day.stops.map((st) => st.venue && st.venue.type).filter(Boolean));
      const acts = [];
      for (const v of pool) {
        if (used.has(v.id) || reserved.has(v.id) || DINING_TYPES.includes(v.type) || !((SLOT_AFFINITY.afternoon || {})[v.type])) continue;
        if (info.regionList.length && !info.regionList.includes(v.region)) continue;
        if ((ctx.requirements && seasonClosedOnTrip(v, { date: info.actualDate })) || !tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
        if (offSeasonSkip(v, ctx) || (placeKey(v) && taken.has(placeKey(v))) || (ctx.kids && familyAvoid(v))) continue;
        if (ctx.pace === 'relaxed' && v.type === 'golf') continue;
        const fit = slotFit(v, ctx, 'afternoon', d - 1, 'afternoon');
        if (!fit.ok) continue;
        const km = kmOrNull(lunchV, v);
        const score = base.get(v.id).score + fit.score + (SLOT_AFFINITY.afternoon[v.type] || 0) * 3 - (types.has(v.type) ? 10 : 0) - (km == null ? 6 : km * 1.2 + (km > 20 ? 25 : 0)) - (kmOrNull(first, v) != null && kmOrNull(first, v) < 0.3 ? 20 : 0);
        const extra = km != null ? [{ code: 'nearby', text: `About ${km < 1 ? '<1' : Math.round(km)} km (straight line) from the previous stop`, weight: 5 }] : [];
        acts.push({ v, score, reasons: base.get(v.id).reasons.concat(fit.reasons, extra), caveats: fit.caveats });
      }
      acts.sort(compareScored);
      if (acts[0]) {
        used.add(acts[0].v.id);
        day.stops.splice(day.stops.indexOf(evening), 0, { daypart: 'afternoon', label: PLAN_DAYPART_LABELS.afternoon, ...stopFrom(acts[0].v, acts[0], regionReason(acts[0].v, ctx), ctx) });
      }
      continue;
    }
    if ([morning, afternoon].some((s) => ['restaurant', 'pub'].includes(s.venue.type))) continue; // already a meal
    const a = byId.get(morning.venue.id), b = byId.get(afternoon.venue.id);
    const near = midpoint(a, b);
    const d = day.day;
    const cands = [];
    for (const v of pool) {
      if (used.has(v.id) || reserved.has(v.id)) continue;
      if (!(v.type === 'restaurant' || v.type === 'pub' || (v.type === 'cafe' && ['coffee', 'unclear'].includes(cafeRole(v))))) continue;
      if (info.regionList.length && !info.regionList.includes(v.region)) continue;
      if ((ctx.requirements && seasonClosedOnTrip(v, { date: info.actualDate })) || !tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate)) continue;
      if (info.foodAsked && fastFood(v)) continue;
      if (ctx.kids && familyAvoid(v)) continue;
      // "Pizza one night" stays a dinner; a dish asked for is not also lunch.
      if (focuses.some((f) => f.key.startsWith('food:') && f.test(v) && (onceTerms.has(f.key.slice(5)) || onceEvening.has(f.key.slice(5)) || DISH_WORDS_RE.test(f.key.slice(5))))) continue;
      const fit = slotFit(v, ctx, 'midday', d - 1, 'midday');
      if (!fit.ok) continue;
      const km = kmOrNull(near, v);
      let score = base.get(v.id).score + fit.score + (v.type === 'restaurant' ? 4 : 0) - (km == null ? 6 : km * 1.2 + (km > 15 ? 25 : 0));
      if (v.type === 'restaurant' && v.textCuisine && tripCuisines.has(v.textCuisine)) score -= 4;
      const extra = [{ code: 'meal', text: 'A lunch stop between the morning and afternoon', weight: 3 }];
      if (km != null) extra.push({ code: 'nearby', text: `About ${km < 1 ? '<1' : Math.round(km)} km (straight line) from the morning and afternoon stops`, weight: 5 });
      cands.push({ v, score, reasons: base.get(v.id).reasons.concat(fit.reasons, extra), caveats: fit.caveats });
    }
    cands.sort(compareScored);
    const lunch = cands[0];
    if (!lunch) continue;
    used.add(lunch.v.id);
    if (lunch.v.type === 'restaurant' && lunch.v.textCuisine) tripCuisines.add(lunch.v.textCuisine);
    day.stops.splice(day.stops.indexOf(afternoon), 0, { daypart: 'midday', label: PLAN_DAYPART_LABELS.midday, ...stopFrom(lunch.v, lunch, regionReason(lunch.v, ctx), ctx) });
  }
  // A focus that never appeared anywhere in the trip is reported honestly.
  for (const f of focuses) {
    if (out.some((day) => day.stops.some((s) => s.venue && f.test(byId.get(s.venue.id))))) continue;
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

const WINE_TRIP_RE = /\b(?:wineries|vineyards|wine (?:tours?|trips?|weekends?|getaways?|country|tastings?|crawls?|lovers?|routes?|days?|holiday|vacation|escape|region)|winery (?:tours?|hopping|crawl)|tastings|wine)\b/;
const SKI_RESORT_NAME_RE = /\b(?:ski resort|mountain resort|ski hill|ski area)\b/;
const SKI_WORDS_RE = /\b(?:ski|skis|skiing|skier|skiers|snowboard|snowboarding|snowboarders?|ski trip|ski weekend|ski holiday|ski vacation|ski hill|ski resort|on the slopes|hit the slopes)\b/;
// Town -> its nearest downhill resort's region, for "ski trip from Kelowna".
const SKI_REGION_FOR_TOWN = { kelowna: 'big-white', 'west-kelowna': 'big-white', 'lake-country': 'big-white', peachland: 'big-white', vernon: 'silverstar', coldstream: 'silverstar', armstrong: 'silverstar', lumby: 'silverstar', enderby: 'silverstar', 'spallumcheen': 'silverstar', penticton: 'apex', summerland: 'apex', naramata: 'apex', kaleden: 'apex', keremeos: 'apex', 'okanagan-falls': 'apex', oliver: 'baldy', osoyoos: 'baldy' };
// Winter things to add after skiing: tube park, skating, sleigh rides, dog sleds, snowshoes, lights trails.
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
  if (skiAsked && !/\b(?:cross country|nordic|x c)\b/.test(text) && !/\b(?:water ?ski|jet ?ski)/.test(text)) return 'ski';
  const wine = (ctx.types.has('winery') || items.some((i) => i.kind === 'type' && i.value === 'winery' && i.strength === 'must')) && !ctx.alcoholFree && !ctx.kids;
  // A wine trip, not "a winery visit": wineries, vineyards, wine tours, a wine weekend or wine tastings.
  if (!wine || !WINE_TRIP_RE.test(text) || /\b(?:a|one|1|single) (?:winery|vineyard|wine tasting)\b/.test(text)) return null;
  // A dish asked for ("wineries and pizza") is the general planner's job.
  if ((ctx.foodTerms || []).some((f) => f.cuisine || DISH_WORDS_RE.test(f.term))) return null;
  const otherTypes = [...ctx.types].filter((t) => t !== 'winery' && !FOOD_TYPES.includes(t) && !(t === 'tour' && wineTourMeansWineries(text)));
  const otherItems = items.filter((i) => i.strength === 'must' && ((i.kind === 'type' && !['winery', 'restaurant', 'cafe', 'breakfast', 'pub', 'cocktail'].includes(i.value)) || ['activity', 'venue_kind'].includes(i.kind) || (i.kind === 'type_count' && !['winery', 'restaurant', 'cafe'].includes(i.value))) && !(i.kind === 'venue_kind' && i.value === 'wine_tour' && wineTourMeansWineries(text)));
  if (otherTypes.length || otherItems.length || ctx.activities.size || ctx.collections.size || ctx.lake || ctx.plannerKinds.some((k) => k !== 'wine_tour')) return null;
  return 'wine';
}

function dayDate(ctx, d) { return ctx.tripDate ? new Date(new Date(`${ctx.tripDate}T12:00:00Z`).getTime() + (d - 1) * 86400000).toISOString().slice(0, 10) : null; }
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
  const cands = [];
  for (const v of pool) {
    if (used.has(v.id)) continue;
    const isLunch = daypart === 'midday';
    if (!(v.type === 'restaurant' || (isLunch && v.type === 'cafe' && !['treat', 'other'].includes(cafeRole(v))) || (!isLunch && opts.apres && ['pub', 'cocktail'].includes(v.type)))) continue;
    if (opts.cafeOnly && v.type !== 'cafe') continue;
    if (fastFood(v) && !(isLunch && ctx.budget === 'budget')) continue;
    if (!isLunch && v.rating != null && v.rating < 3.8) continue;
    if (!isLunch && /\b(?:cafeteria|food court|deli|takeout|take out|concession)\b/.test(v.textName || '')) continue;
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
      if (v.type !== 'restaurant') score -= 6;
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
  if (!isLunchPart(daypart) && opts.strictNice && cands.length) {
    const fine = cands.filter((c) => specialDinner(c.v));
    if (fine.length) return themePick(fine);
    const sitDown = cands.filter((c) => !casualDinner(c.v));
    const pick = themePick(sitDown.length ? sitDown : cands);
    return { ...pick, caveats: ['No $$$ or fine-dining restaurant open that evening is listed nearby on Okanagan Roam, so this is the best sit-down dinner left'] };
  }
  return themePick(cands);
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
  return { targets: Array(days).fill(2), asked: false, requested: null };
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
function wineryServesLunch(v) { return v.type === 'winery' && WINERY_LUNCH_RE.test(`${v.textName || ''} ${v.textDesc || ''}`); }

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
    const pin = (part) => { const id = pinned && pinned[`${d}-${part}`]; const v = id && byId.get(id); return v && !ctx.exclude.has(v.id) ? v : null; };
    const want = targets[d - 1];
    // The best set of wineries for the day's tasting slots: each open at its time of day, close together.
    const wineries = dayPool.filter((v) => v.type === 'winery' && !used.has(v.id));
    const top = wineries.map((v) => ({ v, s: base(v).score + (v.rating || 4) * 2 })).sort((a, b) => b.s - a.s || a.v.id - b.v.id).slice(0, want > 2 ? 14 : 18);
    const fitCache = new Map();
    const fitOf = (v, part) => { const k = `${v.id}:${part}`; if (!fitCache.has(k)) fitCache.set(k, slotFit(v, ctx, part, d - 1, part)); return fitCache.get(k); };
    const LOCKED = { ok: true, score: 0, reasons: [], caveats: [] };
    let best = null;
    for (const slots of wineSlotPlans(want)) {
      // A kept (pinned) stop in a slot this plan does not use rules the plan out.
      if (['morning', 'afternoon', 'late'].some((p) => !slots.includes(p) && pin(p) && pin(p).type === 'winery')) continue;
      const choices = slots.map((p) => (pin(p) ? [{ v: pin(p), s: base(pin(p)).score, locked: true }] : top));
      const pick = [];
      let planBest = null;
      const walk = (k, score) => {
        if (k === slots.length) { if (!planBest || score > planBest.score) planBest = { score, picks: pick.slice() }; return; }
        for (const c of choices[k]) {
          if (pick.some((x) => x.v.id === c.v.id)) continue;
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
      if (best && best.picks.length >= Math.min(want, 3)) break; // the first plan that holds the day wins
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
    const needMore = picks.length < want;
    let lunch = lunchPin ? { v: lunchPin, score: 0, reasons: base(lunchPin).reasons, fit: null } : null;
    if (!lunch && needMore && want >= 3) {
      const wl = themePick(dayPool.filter((v) => wineryServesLunch(v) && !used.has(v.id)).map((v) => ({ v, fit: fitOf(v, 'midday') })).filter((x) => x.fit.ok)
        .map((x) => ({ ...x, score: base(x.v).score - (kmOrNull(near, x.v) || 6) * 1.2, reasons: base(x.v).reasons.concat({ code: 'meal', text: 'Lunch at a winery’s own kitchen, so it is a tasting too', weight: 4 }) })));
      if (wl) lunch = wl;
    }
    if (!lunch) lunch = pickMeal(dayPool, ctx, d, 'midday', near, used, { base, wine: true, text, nearName: 'the wineries', cafeOnly: mealCap !== Infinity });
    if (lunch) { used.add(lunch.v.id); stops.push(themeStop(ctx, 'midday', lunch.v, { reasons: lunch.reasons }, lunch.fit)); }
    const wineCount = picks.length + (lunch && lunch.v.type === 'winery' ? 1 : 0);
    // The morning: the first tasting, or (on a plain wine trip whose wineries open later) a viewpoint or walk near them.
    if (!picks.some((x) => x.part === 'morning')) {
      const scenic = asked ? null : themePick(dayPool.filter((v) => v.type === 'outdoor' && !used.has(v.id) && (v.activities || []).some((a) => ['viewpoints', 'nature', 'hiking'].includes(a))).map((v) => ({ v, score: base(v).score - (kmOrNull(near, v) || 10) })));
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
    const dinner = capped ? null : dinnerPin ? { v: dinnerPin, score: 0, reasons: base(dinnerPin).reasons, fit: null } : pickMeal(dayPool, ctx, d, 'evening', last || near, used, dinnerOpts);
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
function buildSkiDays(facts, ctx, days, pinned) {
  const text = ctx.requirements?.text ? normWords(ctx.requirements.text) : ctx.queryText || '';
  const dayRegions = skiDayRegions(facts, ctx, days);
  const resorts = skiResorts(facts);
  const byId = new Map(facts.map((v) => [v.id, v]));
  const baseCache = new Map();
  const base = (v) => { if (!baseCache.has(v.id)) baseCache.set(v.id, scoreVenue(v, ctx)); return baseCache.get(v.id); };
  // The resort itself is planned even while it is closed today (the warning says when it opens);
  // everything else follows the usual rules.
  const pool = facts.filter((v) => eligible(v, ctx, false));
  const used = new Set(pinned ? Object.values(pinned) : []);
  const warnings = [];
  const notes = [];
  const out = [];
  const dayparts = ['morning', 'midday', 'afternoon', 'evening'];
  for (let d = 1; d <= days; d++) {
    const region = dayRegions[d - 1];
    const date = dayDate(ctx, d);
    const pin = (part) => { const id = pinned && pinned[`${d}-${part}`]; const v = id && byId.get(id); return v && !ctx.exclude.has(v.id) ? v : null; };
    const resort = pin('morning') || resorts.filter((v) => v.region === region && !ctx.exclude.has(v.id)).sort((a, b) => a.id - b.id)[0] || null;
    const stops = [];
    if (resort) {
      // Only a date the visitor gave counts as "your dates" (ctx.tripDate is today when none was given).
      const note = skiSeasonNote(resort, ctx, ctx.requirements && ctx.requirements.startDate ? date : null);
      if (note && !notes.includes(note)) notes.push(note);
      stops.push(themeStop(ctx, 'morning', resort, base(resort), null, [{ code: 'theme', text: `A ski day at ${resort.name}`, weight: 6 }], note ? [note] : []));
    } else {
      stops.push({ daypart: 'morning', label: PLAN_DAYPART_LABELS.morning, venue: null, reasons: [], why: [], caveats: [] });
      warnings.push(`No ski resort is listed on Okanagan Roam${region ? ` in ${regionLabel(ctx, region)}` : ''}.`);
    }
    const dayPool = pool.filter((v) => v.region === region && v.id !== (resort && resort.id) && !seasonClosedOnTrip(v, { date }) && tripRequirements.venueAllowed(v, ctx.requirements, d, ctx.tripDate));
    const lunchPin = pin('midday');
    const lunch = lunchPin ? { v: lunchPin, reasons: base(lunchPin).reasons, fit: null } : pickMeal(dayPool, ctx, d, 'midday', resort, used, { base, apres: true, text, nearName: resort ? resort.name : null });
    if (lunch) { used.add(lunch.v.id); stops.push(themeStop(ctx, 'midday', lunch.v, { reasons: lunch.reasons }, lunch.fit)); }
    // An optional winter activity after skiing: tube park, skating, a sleigh ride (one each day, never repeated).
    const extraPin = pin('afternoon');
    const extra = extraPin ? { v: extraPin } : themePick(dayPool.filter((v) => ['outdoor', 'tour'].includes(v.type) && !used.has(v.id) && SKI_EXTRA_RE.test(`${v.textName || ''}`) && !/\bdinner\b/.test(v.textName || '')).map((v) => ({ v, score: base(v).score + (/\b(?:tube|tubing|skating|rink|sleigh)\b/.test(v.textName || '') ? 6 : 0) })));
    if (extra) { used.add(extra.v.id); stops.push(themeStop(ctx, 'afternoon', extra.v, base(extra.v), null, [{ code: 'theme', text: 'Optional: something different after the lifts close', weight: 2 }], ['Optional — skip it to keep skiing'])); }
    const dinnerPin = pin('evening');
    const dinnerOpts = { base, apres: true, nice: requestsNiceDinner(text), text, nearName: resort ? resort.name : null };
    let dinner = dinnerPin ? { v: dinnerPin, reasons: base(dinnerPin).reasons, fit: null } : pickMeal(dayPool, ctx, d, 'evening', resort, used, dinnerOpts);
    let repeat = false;
    // A small village with few dinner spots listed: an earlier night's spot again, rather than no dinner.
    if (!dinner) { dinner = pickMeal(dayPool, ctx, d, 'evening', resort, new Set(stops.map((x) => x.venue && x.venue.id).filter(Boolean)), dinnerOpts); repeat = !!dinner; }
    if (dinner) { used.add(dinner.v.id); stops.push(themeStop(ctx, 'evening', dinner.v, { reasons: dinner.reasons }, dinner.fit, [], repeat ? ['Also planned on an earlier evening — few dinner spots at the hill are listed on Okanagan Roam'] : [])); }
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
function focusText(ctx, key) {
  if (key.startsWith('kind:')) return tripRequirements.LABELS[key.slice(5)] || key.slice(5);
  const [kind, value] = key.split(':');
  if (kind === 'type') return typeLabel(ctx, value).toLowerCase();
  if (kind === 'activity') return activityLabel(ctx, value);
  if (kind === 'collection') return collectionLabel(ctx, value);
  if (kind === 'food') return `“${value}”`;
  if (kind === 'lake') return 'a lake-view, beach or water stop';
  return value;
}

// ---------- summary ----------

function interestsText(ctx) {
  const items = [];
  for (const t of ctx.types) items.push(typeLabel(ctx, t).toLowerCase());
  for (const a of ctx.activities) items.push(activityLabel(ctx, a));
  for (const c of ctx.collections) items.push(collectionLabel(ctx, c));
  for (const ft of ctx.foodTerms) items.push(`“${ft.term}”`);
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
  let headline;
  if (kind === 'outing') {
    const noun = (ctx.occasion && OVERVIEW_OUTING_NOUN[ctx.occasion]) || 'outing';
    headline = `${overviewArticle(noun)} in ${where}${party}`;
  } else {
    const days = result.days.length;
    const length = days === 1 ? 'one-day' : `${days}-day`;
    const noun = roadTrip ? 'road trip' : theme && days > 1 ? 'getaway' : ((ctx.occasion && OVERVIEW_TRIP_NOUN[ctx.occasion]) || 'trip');
    const place = roadTrip ? `${result.days[0].regionLabel || towns[0]} to ${result.days[days - 1].regionLabel || towns[towns.length - 1]}` : where;
    headline = `${overviewArticle([pace, length, place, roadTrip ? null : theme, noun].filter(Boolean).join(' '))}${party}`;
  }
  // What the plan holds, counted from the stops: restaurants by meal, the
  // rest by type, in order of first appearance.
  const phrases = new Map();
  for (const s of stops) {
    let key, forms;
    if (s.venue.type === 'restaurant') { const meal = OVERVIEW_MEALS[s.daypart] || ['a meal', 'meals']; key = `meal:${meal[1]}`; forms = meal; }
    else { key = s.venue.type; forms = OVERVIEW_NOUNS[s.venue.type] || ['a stop', 'stops']; }
    if (!phrases.has(key)) phrases.set(key, { forms, n: 0 });
    phrases.get(key).n += 1;
  }
  const list = Array.from(phrases.values()).map((p) => overviewCount(p.n, p.forms));
  const placeText = towns.length === 1 ? `, all in ${towns[0]}` : towns.length > 1 ? `, across ${listText(towns)}` : '';
  const sentences = [`${cap(listText(list))}${placeText}.`];
  // One optional second sentence, from facts on the chosen venues.
  const venues = stops.map(factOf).filter(Boolean);
  const dogOk = (v) => v.features.dog_friendly || v.collections.includes('dog_friendly');
  const lake = stops.filter((s) => { const v = factOf(s); return v && v.features.lake_view; }).map((s) => s.venue.name);
  if (isDogTrip(ctx) && venues.length === stops.length && venues.every(dogOk)) sentences.push(stops.length > 1 ? 'Every stop is listed as dog friendly, so your dog can come along.' : 'It’s listed as dog friendly, so your dog can come along.');
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
    let cursor=dayStart??options.startMinutes??requirements.startMinutes??({morning:540,midday:720,afternoon:780,evening:1080}[first?.daypart]||({morning:540,afternoon:780,evening:1080}[requirements.daypart])||540),previous=null,provisional=false;
    if(assumed&&first?.venue&&/\b(?:dinner|supper)\b/i.test(first.label||'')){
      const anchor=group.stops.find(s=>s.event),start=anchor&&parseEventStart(anchor.event.time);
      if(start!=null&&start>=1020)cursor=Math.min(cursor,900);
    }
    for(const stop of group.stops){
      if(!stop.venue&&!stop.event)continue;
      // Listed event times are fixed anchors, never estimated visit lengths.
      // Event-to-venue travel is not inferred from a region or venue name.
      if(stop.event){
        const start=parseEventStart(stop.event.time),end=eventEndMinutes(stop.event,start);
        const walking=requirements.items.some(i=>i.kind==='transport'&&(!tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)||tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)===group.day));
        const location=stop.event.location,transfer=previous?tripRequirements.estimateTransfer(previous,location,walking):null;
        const locationKnown=tripRequirements.estimateTransfer(location,location)!=null;
        const late=start!=null&&previous&&cursor!=null&&cursor+(transfer?.maxMinutes||0)+30>start;
        const verified=start!=null&&end!=null&&locationKnown&&(!previous||transfer)&&cursor!=null&&!provisional;
        const item={day:group.day,date,eventId:stop.event.id,status:late?'unmet':verified?'estimated':'unverified',assumedStart:false};
        if(start!=null)item.startMinutes=start;
        if(end!=null)item.endMinutes=end;
        if(transfer)Object.assign(item,{transferMinutes:transfer.maxMinutes,arrivalAllowanceMinutes:30});
        let note=start==null?'Event start time is not listed; confirm it before following this sequence.':`Listed event start ${clock(start)} on ${date}${end!=null?`; listed end ${clock(end)}`:'; event duration is not listed'}.`;
        if(late)note+=' The preceding visit and arrival allowance cannot fit before the listed start. Choose an earlier meal or move it after the event.';
        if(transfer||verified)note+=` Estimated ${transfer?.mode||'driving assumed'} travel${transfer?`: ${transfer.minMinutes}–${transfer.maxMinutes} minutes`:''}; allow 30 minutes for arrival. This is a planning estimate, not a verified road route.`;
        else note+=` Event travel time is unverified; confirm the route and allow arrival time before the event. Visits after the event remain unverified until ${end!=null?'travel time is':'its duration and travel time are'} confirmed.`;
        stop.scheduleNote=note;stop.caveats=[...(stop.caveats||[]),note];plan.schedule.push(item);
        if(item.status!=='estimated'){const warning=`${stop.event.name||'Event'}: ${note}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);}
        cursor=verified&&!late?end:null;previous=cursor!=null?location:null;continue;
      }
      const nextEvent=group.stops.slice(group.stops.indexOf(stop)+1).find(s=>s.event);
      const eventStart=nextEvent?parseEventStart(nextEvent.event.time):null;
      const beforeEvent=eventStart!=null&&requirements.startMinutes==null&&dayStart==null;
      let v=stop.venue&&byId.get(stop.venue.id);
      const fit=candidate=>{
        if(!candidate||cursor==null)return null;
        const one=tripRequirements.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:candidate.id}}]}},facts,requirements})[0];
        const storedHours=(candidate._hours||parseVenueHours(candidate.hours)).days[weekday];
        const listed = tripRequirements.listedOutdoorTiming(candidate);
        const textHours = (!storedHours || storedHours.status === 'unknown') && listed.hoursRange;
        const hours = textHours ? {status:'open', ranges:[listed.hoursRange]} : storedHours;
        const hiking=(candidate.activities||[]).includes('hiking');
        const duration=one?.complete?one.maxMinutes:hiking?180:null;
        if(duration==null)return null;
        const unknownHours=!hours||hours.status==='unknown';
        const ranges=unknownHours?[[0,1440]]:hours.ranges;
        if(hours?.status==='closed')return {bad:true};
        let transfer=0;
        if(previous){
          const walking=requirements.items.some(i=>i.kind==='transport'&&(!tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)||tripRequirements.requirementDay(i,requirements.startDate||input.tripDate)===group.day));
          const journey=tripRequirements.estimateTransfer(previous,candidate,walking);
          if(!journey)return null;
          transfer=journey.maxMinutes;
        }
        const earliest=cursor+transfer;
        const eventTravel=beforeEvent?tripRequirements.estimateTransfer(candidate,nextEvent.event.location,requirements.items.some(i=>i.kind==='transport')):null;
        const partStart=dayStart!=null || requirements.startMinutes!=null || plan.kind==='itinerary' ? (/\b(?:dinner|supper)\b/i.test(stop.label||'')?(beforeEvent?Math.max(900,Math.min(1020,eventStart-30-(eventTravel?.maxMinutes||0)-duration)):1080):/\blunch\b/i.test(stop.label||'')?720:0) : ({midday:720,afternoon:780,late:930,evening:1080}[stop.daypart]||0);
        const range=ranges.find(([a,b])=>Math.max(a,earliest,partStart)+duration<=Math.min(b,1440,beforeEvent?eventStart-30-(eventTravel?.maxMinutes||0):1440));
        if(!range)return {bad:true};
        const start=Math.max(range[0],earliest,partStart);
        return {start,end:start+duration,wait:start-earliest,transfer,unknownHours, textHours:!!textHours,provisional:unknownHours||hiking||!!textHours||!one?.complete,listingTiming:!!textHours||one?.visits?.[0]?.durationSource==='listing'};
      };
      let timed=fit(v);
      const protectedStop=Object.values(input.pinned||{}).includes(v?.id)||requirements.items.some(i=>i.kind==='venue'&&i.value===v?.id);
      if(v && (timed?.bad || timed?.provisional || !timed && cursor!=null) && !protectedStop){
        const matched=requirements.items.filter(i=>['type','type_count','venue_kind','activity','feature'].includes(i.kind)&&tripRequirements.matches(v,i));
        for(const alt of stop.alternates||[]){
          const candidate=byId.get(alt.venue?.id), alternative=candidate&&fit(candidate);
          if(!alternative||alternative.bad||alternative.provisional||!matched.every(i=>tripRequirements.matches(candidate,i))||group.stops.some(s=>s.venue?.id===candidate.id))continue;
          const old=v.name, unknownTiming=!timed;Object.assign(stop,alt);v=candidate;timed=alternative;
          stop.alternates=(stop.alternates||[]).filter(a=>a.venue?.id!==candidate.id);
          stop.caveats=[...(stop.caveats||[]),`Used instead of ${old} because ${unknownTiming?'its timing could not be verified':'its listed hours do not fit the estimated sequence'}.`];break;
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
        note=`Estimated visit ${clock(timed.start)}–${clock(timed.end)} on ${date}, within listed hours${timed.wait?`; includes ${timed.wait} minutes waiting for the scheduled slot or opening`:''}${assumed?'; uses an assumed start time':''}. Visit length and transfers are estimates; confirm before visiting.${beforeEvent?' Leaves a 30-minute arrival allowance before the event; event travel time still needs confirmation.':''}`;
        if(provisional){const certainty=(timed.unknownHours?'This stop’s opening hours are not verified.':timed.textHours?'Opening hours are taken from listing text and remain provisional.':'This visit fits the listed opening hours.')+(precedingProvisional?' Timing remains provisional because a preceding stop is provisional.':'');note=`Provisional visit ${clock(timed.start)}–${clock(timed.end)} on ${date}. ${certainty} Uses planning allowances for visit length and travel. Trail duration is not verified. Confirm trail duration, opening hours and the route before relying on this schedule.`;if((requirements.shortWalkVenueIds||[]).includes(v.id))note+=' Short easy walk selected; 30–60-minute planning allowance, not a verified trail duration.';if(v.type==='sport')note=note.replace(' Trail duration is not verified.','').replace('Confirm trail duration, opening hours and the route before relying on this schedule.','Sports visit length is a planning allowance, not a verified session or booking; confirm access, opening hours and the route with the operator.');if(v.type!=='sport'&&!(v.activities||[]).includes('hiking')&&!(v.plannerKinds||[]).includes('guided_hike'))note=note.replace(' Trail duration is not verified.','').replace('Confirm trail duration, opening hours and the route before relying on this schedule.','Confirm visit duration, opening hours and travel before relying on this schedule.');if(timed.listingTiming)note+=' Uses timing from listing text; confirm the chosen trail and any temporary closures.';const warning=`${v?.name||'Stop'}: ${note}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);}
      }else{
        cursor=null;
        note=timed?.bad?(beforeEvent?'This visit cannot fit before the event with the arrival allowance and listed opening hours. Choose an earlier start or move the meal after the event.':'This visit cannot fit before the listed closing time in the estimated sequence. Change the start time or choose another stop.'):'Visit timing is unverified: hours, duration, transfer or the preceding stop could not be timed. Confirm before following this sequence.';
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
        const warning=`${v?.name||stop.event?.name||'Stop'}: ${note}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);
      }
      if(v && (['outdoor','beach','golf'].includes(v.type)||tripRequirements.isOutdoorSport(v)||(v.plannerKinds||[]).includes('guided_hike'))){
        const light=tripRequirements.estimateDaylight(date,v),hiking=(v.activities||[]).includes('hiking'),margin=(hiking||tripRequirements.isOutdoorSport(v))?30:0;
        const known=light&&Number.isFinite(item.startMinutes)&&Number.isFinite(item.endMinutes);
        const conflict=known&&(item.startMinutes<light.sunriseMinutes||item.endMinutes>light.sunsetMinutes-margin);
        item.daylight={...(light||{}),marginMinutes:margin,status:known?(conflict?'conflict':'estimated'):'unverified'};
        const daylightNote=known?`Estimated daylight ${clock(light.sunriseMinutes)}–${clock(light.sunsetMinutes)}; ${margin}-minute margin before sunset. Terrain and weather can reduce usable light.${conflict?' This outdoor visit falls outside the estimated daylight window. Start earlier or choose a shorter activity.':''}`:'Daylight timing is unverified: confirm the date, location and visit duration before planning this outdoor stop.';
        note+=' '+daylightNote;
        if(conflict||!known){const warning=`${v.name}: ${daylightNote}`;plan.warnings.push(warning);plan.scheduleWarnings.push(warning);}
      }
      stop.scheduleNote=note;stop.caveats=[...(stop.caveats||[]),note];plan.schedule.push(item);
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
    const idle=p=>p.schedule.reduce((n,s)=>n+(s.waitMinutes||0),0);
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
      ?`Timing conflict: Your requested restaurant, ${mealName}, is not scheduled because it cannot fit before ${eventName}${start?` starts at ${start}`:''} with the listed hours and a 30-minute arrival allowance.${eventRow.endMinutes==null?' Its end time is not listed, so dinner after the event cannot be timed.':' Confirm event-to-restaurant travel and opening hours before scheduling dinner afterward.'}`
      :`Timing conflict: Dinner is not scheduled because no listed restaurant can fit before ${eventName}${start?` starts at ${start}`:''} with the listed hours and a 30-minute arrival allowance.${eventRow.endMinutes==null?' Its end time is not listed, so dinner after the event cannot be timed.':' Confirm event-to-restaurant travel and opening hours before scheduling dinner afterward.'} Try an earlier-opening restaurant or another date.`;
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

function planTrip(input) {
  if (!input?.requirements?.items?.length && !input?.requirements?.conflicts?.length) return planTripCore(input);
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
  if (requirements.startDate && /next weekend/i.test(requirements.dateSource || '')) intent.unsupported = (intent.unsupported || []).filter((u) => String(u).toLowerCase() !== 'next weekend');
  const consumed = tripRequirements.consumedTerms(requirements);
  if (requirements.items.some(i=>i.kind==='transport')) intent.unsupported = (intent.unsupported || []).filter(u=>!['no car','car free','without a car','on foot','walkable'].includes(String(u).toLowerCase()));
  intent.foodTerms = (intent.foodTerms || []).filter(f => f.cuisine || !consumed.has(f.term));
  intent.textTerms = (intent.textTerms || []).filter(t=>!consumed.has(t));
  const length = requirements.items.find(i => i.kind === 'days');
  if (length) { intent.days = length.value; if (intent.mode !== 'events') intent.mode = 'plan'; }

  input = { ...input, tripDate: requirements.startDate || input.tripDate, ...(requirements.startDate ? {startWeekday:WEEKDAYS[(new Date(`${requirements.startDate}T12:00:00Z`).getUTCDay()+6)%7]} : {}) };
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
  let result = planTripCore({ ...input, intent });
  for(const day of result.days)if(day.mealNote)result.notes.push(day.mealNote);
  scheduleTripByHours(result, input, requirements);
  result = fitTimeBudget(result, input, requirements);
  if(result.timeBudget?.selected)scheduleTripByHours(result,input,requirements);
  clarifyEventMealConflict(result,input);
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
  if (rainBackupItem) {
    const backups = rainBackups(result, input, intent);
    if (backups.length) {
      result.rainBackup = backups.map((v) => ({ id: v.id, name: v.name, url: v.url, regionLabel: (input.labels || {})[v.region] || v.region }));
      result.notes.unshift(`If it rains: ${listText(backups.map((v) => v.name))} ${backups.length > 1 ? 'are' : 'is'} indoors nearby, so swap ${backups.length > 1 ? 'one' : 'it'} in for a beach or outdoor stop.`);
    }
    result.requirementResults.push({ ...rainBackupItem, status: backups.length ? 'satisfied' : 'unmet', reason: backups.length ? 'Indoor backups are named for a rainy day.' : 'No indoor backup was found nearby.' });
  }
  result.warnings = [...new Set([...(result.warnings || []), ...requirements.conflicts, ...result.requirementResults.filter(i => i.status !== 'satisfied').map(requirementWarning).filter(Boolean)])];
  for (const [key, id] of Object.entries(input.pinned || {})) {
    const [day,part]=key.split('-');
    if (!result.days.find(d=>d.day===Number(day))?.stops.some(s=>s.daypart===part&&s.venue?.id===id)) { const error=new Error(`A locked stop cannot be kept (${key}). Unlock it or adjust the conflicting requirement.`); error.code='TRIP_CONFLICT'; throw error; }
  }
  return result;
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
    && !(v.advisory && v.advisory.note && ADVISORY_CLOSED_RE.test(v.advisory.note))
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
    const label = ({hockey:'hockey game','live-music':'live music',festival:'festival',market:'market'}[i.eventKind] || (i.value === 'sports-recreation' ? 'sports event' : 'event'));
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

function planTripCore(input) {
  // Multi-part requests (input.trip from interpretTripComponents) get the
  // itinerary path; every other request is planned exactly as before.
  if (input && input.trip && input.trip.multi) return planItinerary(input);
  const { intent, facts = [], labels = {}, events = null } = input || {};
  const ctx = buildContext(intent || {}, labels, input);
  const kind = classifyPlanRequest(intent);
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
  if (ctx.kids && !ctx.occasion) result.notes.push(ctx.requirements ? 'Because you mentioned kids, kid-friendly places come first. Check ages and bookings with each place.' : 'Because you mentioned kids, kid-friendly places, parks and beaches come first. Kid-Friendly is the badge Okanagan Roam verifies.');
  // Build My Trip Phase 2 (2026-09-27): the notes about what the visitor asked
  // for (occasion, kids) that /trip shows up front; every other note is
  // secondary detail. The same strings stay in `notes`.
  result.contextNotes = (outsideNote ? [outsideNote] : []).concat(heuristics.filter((h) => h.field === 'occasion').map(visitorNote))
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
    if (!intent.days) result.notes.push('No trip length was given, so this is a one-day plan.');
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
  result.summary = buildSummary(kind, ctx, null);
  result.overview = buildOverview(kind, ctx, null);
  if (!rec.items.length) result.warnings.push('No Okanagan Roam listings match every part of that request.');
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
function planDayGeography(facts, ctx, days) {
  if (!ctx.regions.length) return null;
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
  const road = /\bfrom ([a-z ]+?) (?:to|down to|up to|through to) ([a-z ]+)/.exec(text);
  if (road && days >= 2 && ctx.regions.length === 2) {
    const from = named(road[1]), to = named(road[2]);
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
        plan.note = `Planned as a road trip from ${regionLabel(ctx, from)} to ${regionLabel(ctx, to)}, one stretch of the valley each day.`;
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
  return ITIN_TYPE_VERB[stop.venue.type] || 'make a stop';
}
const cap = (t) => t.replace(/^./, (x) => x.toUpperCase());
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
  const CRAWL_NOUNS = { brewery: 'craft breweries', pub: 'pubs', winery: 'wineries', cocktail: 'cocktail bars', distillery: 'distilleries' };
  const crawlType = venues.length >= 3 && venues.every((s) => s.venue.type === venues[0].venue.type) ? CRAWL_NOUNS[venues[0].venue.type] : null;
  if (oneTown && crawlType) {
    flow = `Work your way through ${COUNT_WORDS[venues.length] || venues.length} ${crawlType}, one after another${family}.`;
    geo = `${together(venues.length)} in ${oneTown}, so there’s no need to move between towns. Plan a safe ride home.`;
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
const NOT_MUSIC_NAME_RE = /\b(musical|theatre|theater|play|comedy|comedian|talks?|workshop|film|films|movie|acrobatics|burlesque|ghost tours?|architecture|lecture|vs|versus|hockey|tours? of|canal tour|trail tour)\b/;
function normalizeText(t) {
  return String(t).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function eventSuitsKind(e, kind) {
  const name = normalizeText(`${e.name || ''} ${e.description || ''}`);
  const cats = e.categories || [];
  if (kind === 'festival') return cats.includes('events-festivals') || /\bfestivals?\b/.test(name);
  if (kind === 'market') return cats.includes('markets-fairs') || /\b(markets?|farmers market|fairs?)\b/.test(name);
  if (kind !== 'concert' && kind !== 'live-music') return true;
  const title = normalizeText(e.name || '');
  if (NOT_MUSIC_NAME_RE.test(title)) return false;
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
function chooseTripEvent(candidates, kind, part, strict = false, terms = []) {
  const suitable = candidates.filter((e) => eventSuitsKind(e, kind) && terms.every(term => {
    const words = normalizeText(`${e.name || ''} ${e.description || ''}`).split(' ');
    return normalizeText(term).split(' ').every(word => words.includes(word));
  }));
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
const OPERATING_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const OPERATING_PERIOD_RE = new RegExp(`\\b(?:opens?|operates?|runs?)\\s+(?:daily\\s+)?(?:from\\s+)?(${OPERATING_MONTHS.join('|')})\\s+(?:to|through|until|into)\\s+(?:(?:early|mid|late)\\s+)?(${OPERATING_MONTHS.join('|')})\\b`);
function seasonClosedOnTrip(v, season) {
  const d = season && season.date;
  if (v.seasonClosed) {
    if (!d) return !!v.seasonClosedToday;
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
  if (ADVISORY_CLOSED_RE.test(a.note)) return { skip: true };
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
  const leftover = (trip.leftoverTerms || []).filter((w) => !(trip.unknownPlaces || []).some((p) => p.split(' ').includes(w)));
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
    const choice = chooseTripEvent(candidates, p.c.event.kind, wantPart || input.requirements?.daypart, !!input.requirements, p.c.event.nameTerms);
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
  for (const p of parts) {
    const c = p.c;
    if (c.kind !== 'venue') continue;
    const pairWithEvent = anchor && (c.meal === 'dinner' || c.meal === 'supper' || (!c.daypart && c.types.includes('restaurant')) || c.daypart === 'evening');
    const daypart = pairWithEvent ? 'evening' : (c.daypart || (input.requirements && anchor ? ITIN_TYPE_DAYPART[c.types[0]] || 'afternoon' : null));
    const when = pairWithEvent ? { daypart: 'evening' } : trip.when ? { ...trip.when, ...(daypart ? { daypart } : {}) } : daypart ? { daypart } : null;
    const ci = {
      // A walk by the lake can be a lakeside park, promenade or beach path that is listed as a walk (2026-10-14).
      regions, types: c.lake ? [...new Set([...c.types, 'outdoor', 'beach'])] : c.types, activities: c.lake ? [] : c.activities || [], collections: c.collections || [], features: c.features || [],
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
      const s = scoreVenue(v, ctx);
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
      let score = s.score + (t ? t.score : 0) + sf.score + (adv ? adv.score : 0);
      const nearby = input.requirements && !route ? distanceTerm(previousVenue, v, 4, input.requirements.items.some(i => i.kind === 'duration' && i.value <= 120) ? 3 : 15) : {score:0,reasons:[],caveats:[]};
      score += nearby.score;
      const reasons = s.reasons.concat(t ? t.reasons : [], sf.reasons, nearby.reasons);
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

    const pick = pool[0];
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
      else result.warnings.push(`No ${c.dog && !/dog/.test(label) ? 'dog-friendly ' : ''}${label} matched ${whereText}, so the rest of the plan is shown.`);
      continue;
    }
    used.add(pick.v.id);
    previousVenue = pick.v;
    if (!explicitGeography && !community) community = { region: pick.v.region, from: 'stop' };
    const extra = route ? [{ code: 'route', text: `In ${regionLabel(ctx, pick.v.region)}, on the way`, weight: 1 }] : regionReason(pick.v, ctx);
    const alternates = pool.slice(1).filter((s) => !used.has(s.v.id)).slice(0, 2);
    // A crawl's later stops are the same kind, so its alternates are not held back from them.
    if (!walking && !trip.crawl && !(trip.explicitStops && parts.some(p => (p.c.plannerKinds || []).some(k => tripRequirements.isSportKind(k))))) for (const a of alternates) used.add(a.v.id);
    stops.push({
      kind: 'venue', component: c, index: p.i, label: label.replace(/^./, (x) => x.toUpperCase()), daypart: daypart || ITIN_TYPE_DAYPART[pick.v.type] || 'afternoon', timed: !!daypart,
      activity: (c.activities || []).find((a) => (pick.v.activities || []).includes(a))
        || (pick.v.type === 'outdoor' ? (pick.v.activities || []).find((a) => ITIN_ACTIVITY_VERB[a]) : null) || null,
      ...stopFrom(pick.v, pick, extra, ctx),
      alternates: alternates.map((a) => stopFrom(a.v, a, [], ctx)),
      seasonFlags: pick.seasonFlags || {}, advisory: pick.advisory, swimPart: partSeasonIntent(c).swim,
    });
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
    const base = { kind: s.kind, label: s.label, daypart: s.daypart, component: s.index };
    if (s.kind === 'event') return { ...base, event: s.event, timeKnown: s.timeKnown, caveats: s.caveats };
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
    return c.kind === 'event' && l !== 'live music' ? article(l) : l;
  });
  const allDog = trip.components.filter((c) => c.kind === 'venue').every((c) => c.dog) && trip.components.some((c) => c.kind === 'venue' && c.dog);
  const listed = listText(partLabels);
  const where = route && route.from && route.to ? ` from ${regionLabel(baseCtx, route.from)} to ${regionLabel(baseCtx, route.to)}` : route && route.to ? ` on the way to ${regionLabel(baseCtx, route.to)}` : regions.length ? ` in ${listText(regions.map((r) => regionLabel(baseCtx, r)))}` : '';
  const when = trip.when && trip.when.preset === 'this-weekend' ? ' this weekend' : '';
  const occasionPrefix = trip.outingOccasion === 'date_night' || baseCtx.occasion === 'date_night' ? 'Date night: ' : '';
  result.summary = `${occasionPrefix}${allDog ? 'Dog-friendly ' : ''}${allDog ? listed : listed.replace(/^./, (x) => x.toUpperCase())}${where}${when}.`.replace(/^Dog-friendly (.)/, (m, c) => `Dog-friendly ${c.toLowerCase()}`);
  result.overview = {
    where: route && route.from && route.to ? `${regionLabel(baseCtx, route.from)} → ${regionLabel(baseCtx, route.to)}` : regions.length ? listText(regions.map((r) => regionLabel(baseCtx, r))) : 'the Okanagan',
    regions: regions.map((r) => ({ slug: r, label: regionLabel(baseCtx, r) })),
    days: null, pace: null, interests: partLabels, occasion: null, budget: null,
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
  tripTheme,
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
  advisoryFit,
  seasonClosedOnTrip,
  scoreVenue,
  buildContext,
  chooseDayRegions,
  regionCentroids,
  planTrip,
  haversineKm,
  eventSuitsKind,
  chooseTripEvent,
  routeRegions,
  routeDirection,
  parseEventStart,
  buildUnderstood,
};
