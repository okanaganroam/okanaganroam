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

const PLAN_DAYPARTS = {
  relaxed: ['morning', 'afternoon', 'evening'],
  standard: ['morning', 'afternoon', 'evening'],
  packed: ['morning', 'midday', 'afternoon', 'evening'],
};
const PLAN_DAYPART_LABELS = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', evening: 'Evening' };
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
  morning: { cafe: 3, outdoor: 3, golf: 3, beach: 1 },
  midday: { restaurant: 3, cafe: 2, winery: 2, beach: 2, brewery: 1, outdoor: 1 },
  afternoon: { winery: 3, beach: 3, outdoor: 2, brewery: 2, golf: 2, distillery: 2, cafe: 1, restaurant: 1 },
  evening: { restaurant: 3, cocktail: 3, pub: 3, brewery: 2, winery: 1 },
};
// Types on which the Food & Drink badge columns are meaningful.
const BADGE_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'];
const DINING_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery'];
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
function textHas(normalized, term) { return !!normalized && ` ${normalized} `.indexOf(` ${term} `) !== -1; }
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
  // A pre-dinner drink needs the listing to run to at least 18:30, and
  // dinner to at least 20:00 -- a 17:00 or 19:00 close is not enough.
  drinks: { from: 17 * 60, to: 19 * 60, need: 90, label: 'early evening' },
  evening: { from: 18 * 60, to: 21 * 60, need: 120, label: 'evening' },
};
// Types that are expected to list hours (the Food & Drink / winery badge
// types). Beaches, parks and golf courses rarely do, so a missing value
// there is not flagged as a caveat.
const HOURS_EXPECTED_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'];

function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  // Closing times may be written past midnight as "25:00" or "26:30" (22
  // venues do); opening times must be a real clock time (checked below).
  return h > 47 || mi > 59 ? null : h * 60 + mi;
}
// -> { known, days: { mon: { status: 'open', ranges: [[from, to]] } | { status: 'closed' } | { status: 'unknown' } } }
function parseVenueHours(raw) {
  const unknown = { known: false, days: Object.fromEntries(WEEKDAYS.map((d) => [d, { status: 'unknown' }])) };
  if (typeof raw !== 'string' || !raw.trim()) return unknown;
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { return unknown; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return unknown;
  const days = {};
  let anyKnown = false;
  for (const d of WEEKDAYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, d)) { days[d] = { status: 'unknown' }; continue; }
    const v = obj[d];
    if (v === null || (Array.isArray(v) && v.length === 0)) { days[d] = { status: 'closed' }; anyKnown = true; continue; }
    if (!Array.isArray(v)) { days[d] = { status: 'unknown' }; continue; }
    const ranges = [];
    let ok = true;
    for (const r of v) {
      if (!Array.isArray(r) || r.length !== 2) { ok = false; break; }
      const a = toMinutes(r[0]);
      let b = toMinutes(r[1]);
      if (a === null || b === null || a >= 24 * 60) { ok = false; break; }
      if (b === 0) b = 24 * 60; // closes at midnight
      else if (b <= a) b += 24 * 60; // runs past midnight
      ranges.push([a, b]);
    }
    days[d] = ok && ranges.length ? { status: 'open', ranges } : { status: 'unknown' };
    if (ok && ranges.length) anyKnown = true;
  }
  return { known: anyKnown, days };
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
function rangesText(day) { return day.ranges.map(([a, b]) => `${clockText(a)}\u2013${clockText(b)}`).join(', '); }
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
  const occasion = intent.occasion || null;
  const pace = intent.pace || (occasion && OCCASION_DEFAULT_PACE[occasion]) || 'standard';
  return {
    intent,
    labels: labels || {},
    regions: intent.regions || [],
    types: new Set(intent.types || []),
    activities: new Set(intent.activities || []),
    collections: new Set(intent.collections || []),
    features: (intent.features || []).slice(),
    foodTerms: (intent.foodTerms || []).slice(),
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
    avoid: new Set(opts.avoidIds || []),
    // The weekday of day 1 when the request named a date ("tonight", "this
    // weekend", "Saturday"); null otherwise, so hours are judged across the week.
    startWeekday: WEEKDAYS.includes(opts.startWeekday) ? opts.startWeekday : null,
    // The time of day the visitor named ("tonight", "Saturday afternoon").
    when: intent.when || null,
    clock: opts.clock && WEEKDAYS.includes(opts.clock.weekday) && Number.isInteger(opts.clock.minutes) && opts.clock.minutes >= 0 && opts.clock.minutes < 1440 ? { weekday: opts.clock.weekday, minutes: opts.clock.minutes } : null,
    whenDaypart: intent.when && SLOT_WINDOWS[intent.when.daypart] ? intent.when.daypart : null,
  };
}
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
  'lunch counter', 'poke counter', 'shake counter', 'perogy counter', 'sandwich counter', 'mall counter'];
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
function eligible(v, ctx, strict) {
  if (ctx.exclude.has(v.id)) return false;
  if (ctx.rainy) {
    if (v.type === 'beach' || v.type === 'outdoor') return false;
    if (v.type === 'golf' && !v.indoorGolf) return false;
  }
  if (ctx.kids) {
    if (KIDS_EXCLUDED_TYPES.includes(v.type)) return false;
    if (v.type === 'brewery' && !v.features.kid_friendly) return false;
  }
  if (ctx.dog && !(v.features.dog_friendly || v.collections.includes('dog_friendly'))) return false;
  for (const f of ctx.features) {
    if (f === 'dog_friendly') continue; // handled above
    if (f === 'kid_friendly') {
      if (BADGE_TYPES.includes(v.type) && !v.features.kid_friendly) return false;
      continue; // outdoor/beach/golf: family heuristic, never claimed as a badge
    }
    if (BADGE_TYPES.includes(v.type)) { if (!v.features[f]) return false; } else if (strict) return false;
  }
  if (strict) {
    if (ctx.types.size && !ctx.types.has(v.type) && !(v.fdTypes || []).some((t) => ctx.types.has(t))) return false;
    if (ctx.activities.size && !v.activities.some((a) => ctx.activities.has(a))) return false;
    for (const c of ctx.collections) if (!v.collections.includes(c)) return false;
    for (const ft of ctx.foodTerms) if (!foodMatch(v, ft)) return false;
  }
  return true;
}

function foodMatch(v, ft) {
  if (ft.cuisine && v.cuisine === ft.cuisine) return { cuisine: true };
  const inName = textHas(v.textName, ft.term), inCui = textHas(v.textCuisine, ft.term), inDesc = textHas(v.textDesc, ft.term);
  return inName || inCui || inDesc ? { inName, inCui, inDesc } : null;
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
      add('food', (m.inName ? 15 : 0) + (m.inCui ? 10 : 0) + (m.inDesc ? 7 : 0), `Mentions “${ft.term}” in its ${listText(where)}`);
    }
  }
  occasionScore(v, ctx, add); // adds through `add`; must not be `score += ...` (that would drop them)
  const fit = budgetFits(ctx.budget, v.price);
  if (fit === true) add('budget', 5, `Price level ${priceText(v.price)} fits your budget preference`);
  else if (fit === false) add('budget_miss', -6, null);
  if (v.rating != null) {
    const conf = v.reviews > 0 ? Math.min(1, Math.log10(v.reviews + 1) / 2.5) : 0.35;
    const q = (v.rating - 4.0) * 10 * conf * (ctx.superlative ? 1.6 : 1);
    add('rating', q, v.rating >= 4.3 ? (v.reviews > 0 ? `Rated ${v.rating} from ${v.reviews.toLocaleString('en-CA')} reviews` : `Rated ${v.rating}`) : null);
  }
  if (v.indoorGolf && !ctx.rainy) add('indoor_golf', -8, null); // a real course first, unless it rains
  if (ctx.avoid.has(v.id)) add('avoid', -20, null);
  add('jitter', jitter(ctx.seed, v.id) * 8, null);
  return { score, reasons };
}

function occasionScore(v, ctx, add) {
  const o = ctx.scoringOccasion;
  if (!o) return;
  const label = OCCASION_LABELS[o];
  const tag = ` (${label} heuristic)`;
  if ((OCCASION_TYPES[o] || []).includes(v.type)) add('occasion', 10, `${article(typeLabel(ctx, v.type, 'singular').toLowerCase(), true)} suits ${article(label)}${tag}`);
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
    else add('occasion', 6, 'An indoor venue type (rainy-day heuristic — not verified as indoors)');
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

function publicVenue(v, ctx) {
  return {
    id: v.id, name: v.name, region: v.region, type: v.type, url: v.url,
    regionLabel: ctx ? regionLabel(ctx, v.region) : v.region, typeLabel: ctx ? typeLabel(ctx, v.type, 'singular') : v.type,
    rating: v.rating, reviews: v.reviews, price: v.price, address: v.address || null,
    latitude: hasCoords(v) ? v.lat : null, longitude: hasCoords(v) ? v.lng : null,
  };
}
function stopFrom(v, scored, extra, ctx) {
  const reasons = scored.reasons.concat(extra || []);
  return {
    venue: publicVenue(v, ctx),
    reasons: reasons.filter((r) => r.text).map((r) => ({ code: r.code, text: r.text })),
    why: why(reasons),
    caveats: (scored.caveats || []).slice(),
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
  for (const v of facts) {
    if (!regionOk(v, ctx) || !eligible(v, ctx, strict)) continue;
    const s = scoreVenue(v, ctx);
    const t = requestedTimeFit(v, ctx);
    if (t && t.skip) continue; // listed hours prove it is closed at the time asked for
    scored.push(t ? { v, score: s.score + t.score, reasons: s.reasons.concat(t.reasons), caveats: t.caveats } : { v, ...s });
  }
  scored.sort(compareScored);
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
    { types: ['cocktail', 'pub', 'brewery', 'winery'], daypart: 'evening', window: 'drinks', label: 'A drink first', prefer: { cocktail: 8, pub: 5, brewery: 5, winery: 4 } },
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
  const base = facts.filter((v) => regionOk(v, ctx) && eligible(v, ctx, false));
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
  for (const t of ctx.types) f.push({ key: `type:${t}`, test: (v) => v.type === t || (v.fdTypes || []).includes(t) });
  for (const a of ctx.activities) f.push({ key: `activity:${a}`, test: (v) => v.activities.includes(a) });
  for (const c of ctx.collections) f.push({ key: `collection:${c}`, test: (v) => v.collections.includes(c) });
  for (const ft of ctx.foodTerms) f.push({ key: `food:${ft.term}`, test: (v) => !!foodMatch(v, ft) });
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
  const hasFocus = focusTypes.size || ctx.collections.size || ctx.foodTerms.length;
  if (!hasFocus) return ctx.occasion ? new Set([...OCCASION_TYPES[ctx.occasion], ...DINING_TYPES]) : null;
  return new Set([...focusTypes, ...DINING_TYPES]);
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

function buildDays(facts, ctx, days, pinned) {
  const centroids = regionCentroids(facts);
  const dayRegions = chooseDayRegions(facts, ctx, days, centroids);
  const dayparts = PLAN_DAYPARTS[ctx.pace] || PLAN_DAYPARTS.standard;
  const maxHop = PLAN_MAX_HOP_KM[ctx.pace] || PLAN_MAX_HOP_KM.standard;
  const kmCost = PLAN_KM_PENALTY[ctx.pace] || PLAN_KM_PENALTY.standard;
  const allowed = allowedTypes(ctx);
  const focuses = focusList(ctx);
  // A venue that satisfies a requested focus (a Hidden Gem park, a hiking
  // trail, a place mentioning "poutine") is welcome whatever its type.
  const pool = facts.filter((v) => eligible(v, ctx, false) && (!allowed || allowed.has(v.type) || focuses.some((f) => f.test(v))));
  const byId = new Map(facts.map((v) => [v.id, v]));
  const base = new Map(pool.map((v) => [v.id, scoreVenue(v, ctx)]));
  const used = new Set();
  // Pinned stops are reserved up front, so refilling one removed slot can
  // never take a venue that another kept slot is holding.
  const reserved = new Set(pinned ? Object.values(pinned) : []);
  const tripTypeCount = {};
  const warnings = [];
  const out = [];

  for (let d = 1; d <= days; d++) {
    const region = dayRegions[d - 1] || null;
    const dayPool = pool.filter((v) => !region || v.region === region);
    const met = new Set();
    const dayTypes = {};
    const stops = [];
    let prev = null;
    for (const daypart of dayparts) {
      const pin = pinned && pinned[`${d}-${daypart}`];
      let chosen = null;
      if (pin && byId.has(pin) && !ctx.exclude.has(pin) && !used.has(pin) && eligible(byId.get(pin), ctx, false)) {
        const v = byId.get(pin);
        const fit = slotFit(v, ctx, daypart, d - 1, daypart);
        const dist = distanceTerm(prev, v, kmCost, maxHop);
        chosen = { v, score: 0, reasons: (base.get(v.id) || scoreVenue(v, ctx)).reasons.concat(fit.ok ? fit.reasons : [], dist.reasons), caveats: (fit.ok ? fit.caveats : []).concat(dist.caveats) };
      } else {
        const cands = [];
        for (const v of dayPool) {
          if (used.has(v.id) || reserved.has(v.id)) continue;
          const aff = (SLOT_AFFINITY[daypart] || {})[v.type] || 0;
          if (!aff) continue;
          // One stop of each kind per day (one round of golf, one winery...);
          // only restaurants may appear twice, as lunch and dinner.
          if (dayTypes[v.type] && v.type !== 'restaurant') continue;
          const fit = slotFit(v, ctx, daypart, d - 1, daypart);
          if (!fit.ok) continue; // listed hours prove it is closed then
          const s = base.get(v.id);
          let score = s.score + aff * 6 + fit.score;
          const extra = fit.reasons.slice();
          const vFocus = focuses.filter((f) => f.test(v));
          if (vFocus.length) score += vFocus.some((f) => !met.has(f.key)) ? 20 : 6;
          else if (focuses.length) extra.push({ code: 'complement', text: `Added to round out the day with ${article(typeLabel(ctx, v.type, 'singular').toLowerCase())} stop`, weight: 2 });
          if (dayTypes[v.type]) score -= 18;
          score -= (tripTypeCount[v.type] || 0) * 3;
          // Keep dinner possible: an earlier slot never takes the last
          // restaurant that could still serve the evening.
          if (v.type === 'restaurant' && daypart !== 'evening' && dayparts.includes('evening')) {
            const spare = dayPool.some((o) => o.id !== v.id && o.type === 'restaurant' && !used.has(o.id) && !reserved.has(o.id) && slotFit(o, ctx, 'evening', d - 1, 'evening').ok);
            if (!spare) continue;
          }
          const dist = distanceTerm(prev, v, kmCost, maxHop);
          score += dist.score;
          extra.push(...dist.reasons);
          extra.push({ code: 'daypart', text: `Placed in the ${PLAN_DAYPART_LABELS[daypart].toLowerCase()} slot`, weight: 1 });
          cands.push({ v, score, reasons: s.reasons.concat(extra), caveats: fit.caveats.concat(dist.caveats) });
        }
        cands.sort(compareScored);
        chosen = cands[0] || null;
      }
      if (!chosen) {
        stops.push({ daypart, label: PLAN_DAYPART_LABELS[daypart], venue: null, reasons: [], why: [], caveats: [] });
        warnings.push(`No suitable ${PLAN_DAYPART_LABELS[daypart].toLowerCase()} stop was found for day ${d}${region ? ` in ${regionLabel(ctx, region)}` : ''}.`);
        continue;
      }
      const v = chosen.v;
      used.add(v.id);
      dayTypes[v.type] = (dayTypes[v.type] || 0) + 1;
      tripTypeCount[v.type] = (tripTypeCount[v.type] || 0) + 1;
      for (const f of focuses) if (f.test(v)) met.add(f.key);
      stops.push({ daypart, label: PLAN_DAYPART_LABELS[daypart], ...stopFrom(v, chosen, regionReason(v, ctx), ctx) });
      prev = v;
    }
    const missing = focuses.filter((f) => !met.has(f.key)).map((f) => f.key);
    out.push({ day: d, region, regionLabel: region ? regionLabel(ctx, region) : null, stops, missingFocus: missing });
  }
  // A focus that never appeared anywhere in the trip is reported honestly.
  for (const f of focuses) {
    if (!out.some((day) => day.stops.some((s) => s.venue && f.test(byId.get(s.venue.id))))) warnings.push(`Nothing matching ${focusText(ctx, f.key)} was available${ctx.regions.length ? ` in ${listText(ctx.regions.map((r) => regionLabel(ctx, r)))}` : ''}.`);
  }
  return { days: out, warnings, dayparts };
}

function focusText(ctx, key) {
  const [kind, value] = key.split(':');
  if (kind === 'type') return typeLabel(ctx, value).toLowerCase();
  if (kind === 'activity') return activityLabel(ctx, value);
  if (kind === 'collection') return collectionLabel(ctx, value);
  if (kind === 'food') return `“${value}”`;
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
  };
}

// ---------- entry point ----------
//
// planTrip({ intent, facts, labels, seed, excludeIds, avoidIds, pinned, events })
//   facts:  verified venue facts from the database (see server.js)
//   events: already-selected What's On items for an events request (or [])
//   pinned: { "<day>-<daypart>": venueId } -- stops to keep when one stop is
//           removed and replaced
function planTrip(input) {
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
    notes: heuristics.map((h) => h.note),
    warnings: [],
    unsupported: (intent && intent.unsupported) || [],
    needs: (intent && intent.needs) || [],
  };
  if (ctx.kids && !ctx.occasion) result.notes.push('Heuristic: because you mentioned kids, family-oriented places (beaches and parks listed for nature, viewpoints, water, hiking or adventure) are favoured. Only the Kid-Friendly badge is a verified venue attribute.');
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
    const plan = buildDays(facts, ctx, days, input.pinned || null);
    result.days = plan.days;
    result.warnings = plan.warnings;
    result.summary = buildSummary(kind, ctx, days);
    result.overview = buildOverview(kind, ctx, days);
    // Only described as a north-to-south route when there is one to describe.
    const routeRegions = uniqRegions(plan.days);
    if (!ctx.regions.length && routeRegions.length > 1) result.notes.push(`No single region was given, so the plan moves through ${listText(routeRegions.map((r) => regionLabel(ctx, r)))} from north to south.`);
    scheduleNotes(result, ctx);
    return result;
  }
  if (kind === 'outing') {
    result.outing = buildOuting(facts, ctx);
    result.summary = buildSummary('outing', ctx, null);
    result.overview = buildOverview(kind, ctx, null);
    if (!ctx.regions.length) result.notes.push('No region was given, so these stops were chosen in the same community, anywhere in the valley.');
    scheduleNotes(result, ctx);
    return result;
  }
  const rec = buildRecommendations(facts, ctx);
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
    else if (ctx.startWeekday && (ctx.when.preset === 'today' || ctx.when.relative === 'tomorrow')) result.notes.push(`Hours were checked for ${WEEKDAY_NAMES[ctx.startWeekday]} (Okanagan time).`);
  }
  return result;
}
function uniqRegions(days) { return Array.from(new Set(days.map((d) => d.region).filter(Boolean))); }

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
  parseVenueHours,
  hoursFit,
  cafeRole,
  SLOT_WINDOWS,
  PLAN_DAYPARTS,
  PLAN_MAX_HOP_KM,
  SLOT_AFFINITY,
  OCCASION_TYPES,
  classifyPlanRequest,
  eligible,
  scoreVenue,
  buildContext,
  chooseDayRegions,
  regionCentroids,
  planTrip,
  haversineKm,
};
