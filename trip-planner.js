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
const ITIN_TYPE_DAYPART = { cafe: 'morning', golf: 'morning', outdoor: 'morning', beach: 'afternoon', winery: 'afternoon', brewery: 'afternoon', distillery: 'afternoon', restaurant: 'evening', pub: 'evening', cocktail: 'evening' };
const ITIN_DAYPART_RANK = { morning: 0, midday: 1, afternoon: 2, evening: 3 };
// "Live music" with no listed event falls back to places whose verified
// Live Music badge is set -- only venue types that carry that badge.
const LIVE_MUSIC_VENUE_TYPES = ['pub', 'cocktail', 'brewery', 'restaurant', 'winery'];
const ITIN_VENUE_NOUN = { cafe: 'coffee', restaurant: 'a meal', beach: 'some time on the beach', winery: 'a wine tasting', brewery: 'a craft beer', pub: 'a pub stop', cocktail: 'cocktails', distillery: 'a distillery tasting', outdoor: 'some time outdoors', golf: 'a round of golf' };
// One visitor-facing phrase per stop, from what that stop actually is.
const ITIN_TYPE_VERB = {
  cafe: 'stop for coffee', restaurant: 'sit down for a meal', beach: 'spend some time on the beach', winery: 'enjoy a wine tasting',
  brewery: 'try a local craft beer', pub: 'stop in at a pub', cocktail: 'settle in for cocktails', distillery: 'enjoy a distillery tasting',
  outdoor: 'spend some time outdoors', golf: 'play a round of golf',
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
function weekdayOfDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}
function componentLabel(c, ctx) {
  if (c.kind === 'event') return c.event.noun;
  if (c.liveMusicFallback) return 'live music';
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
  if (stop.component.liveMusicFallback) return 'some live music';
  if (stop.component.meal) return stop.component.meal;
  const act = stopActivity(stop);
  if (act) return ITIN_ACTIVITY_NOUN[act];
  return ITIN_VENUE_NOUN[stop.venue.type] || 'a stop';
}
function venueVerb(stop) {
  if (stop.component.liveMusicFallback) return 'catch some live music';
  if (stop.component.meal) return ITIN_MEAL_VERB[stop.component.meal] || 'sit down for a meal';
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
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
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
        timing = time ? `${W.short} starts at ${time}, so there’s time to enjoy ${meal.component.meal || 'the meal'} first.` : `Start times vary, so check the event page before you settle on a ${mealWord} time.`;
      } else {
        const daytime = before.every((s) => s.daypart !== 'evening');
        const lead = before.length === 1 ? `${cap(expVerb(before[0]))}${family}${daytime ? ' during the day' : ''}` : `${cap(expVerbList(before))}${family}`;
        const next = moveTo ? `head to ${moveTo} for ${W.evening}` : eTown && prevTown ? `stay in ${eTown} for ${W.evening}` : `finish with ${W.evening}`;
        flow = `${lead}, then ${next}.`;
        timing = time ? `${W.short} starts at ${time}, so the day flows easily into the evening.` : 'Times vary, so check the event page for the schedule.';
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
  if (oneTown) {
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
  if (kind !== 'concert' && kind !== 'live-music') return true;
  const name = normalizeText(e.name || '');
  const cats = e.categories || [];
  if (NOT_MUSIC_NAME_RE.test(name)) return false;
  if (cats.includes('family-kids') && cats.includes('arts-culture')) return false;
  return MUSIC_NAME_RE.test(name) || (cats.length === 1 && cats[0] === 'live-music');
}
// A stated start fits a requested time of day: the evening is 17:00 on (and
// the small hours); the daytime is 05:00-17:00.
function startFitsPart(start, part) {
  if (!part) return true;
  if (part === 'evening') return start >= 17 * 60 || start < 5 * 60;
  return start >= 5 * 60 && start < 17 * 60;
}
// First suitable event, soonest first: a stated start in the requested time of
// day; failing that, one whose start is not listed (never assumed to fit, and
// flagged); never one whose stated start contradicts the request.
function chooseTripEvent(candidates, kind, part) {
  const suitable = candidates.filter((e) => eventSuitsKind(e, kind));
  const known = suitable.find((e) => { const st = parseEventStart(e.time); return st != null && startFitsPart(st, part); });
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
function advisoryFit(v, c, season) {
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
  for (const place of trip.unknownPlaces || []) result.warnings.push(`“${place}” isn’t a place Okanagan Roam covers, so it wasn’t used for the route.`);
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
    const choice = chooseTripEvent(tripEvents[p.i] || [], p.c.event.kind, wantPart);
    const e = choice.event;
    if (e) {
      const start = parseEventStart(e.time);
      const daypart = start == null ? (['hockey', 'concert', 'live-music'].includes(p.c.event.kind) ? 'evening' : (p.c.daypart || null)) : start < 12 * 60 ? 'morning' : start < 17 * 60 ? 'afternoon' : 'evening';
      const stop = {
        kind: 'event', component: p.c, index: p.i, label: p.c.event.noun.replace(/^./, (x) => x.toUpperCase()), daypart: wantPart && start == null ? wantPart : daypart,
        event: { ...e, regionLabel: regionLabel(baseCtx, e.region) }, timeKnown: start != null, start,
        caveats: start != null ? [] : [wantPart ? `Its start time isn’t listed, so it may not be in the ${wantPart === 'evening' ? 'evening' : 'daytime'} — check the event page` : 'Start times vary — check the event page before you plan around it'],
      };
      stops.push(stop);
      if (!anchor) anchor = { region: e.valleyWide ? null : e.region, weekday: weekdayOfDate(e.startDate), daypart, date: e.startDate || null };
    } else if (p.c.event.venueFeature) {
      // No listed event: the verified venue badge stands in, when places have it.
      p.c = { ...p.c, kind: 'venue', types: LIVE_MUSIC_VENUE_TYPES.slice(), features: [p.c.event.venueFeature], activities: [], collections: [], cuisines: [], liveMusicFallback: true };
      result.notes.push('No live-music event is listed for those dates, so places with a verified Live Music badge are suggested instead.');
    } else {
      const when = wantPart === 'evening' ? ' for the evening' : wantPart ? ' for the daytime' : '';
      result.warnings.push(`No ${p.c.event.noun} is listed on What’s On${when} for those dates, so the rest of the plan is shown.`);
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
  for (const p of parts) {
    const c = p.c;
    if (c.kind !== 'venue') continue;
    const pairWithEvent = anchor && (c.meal === 'dinner' || c.meal === 'supper' || (!c.daypart && c.types.includes('restaurant')) || c.daypart === 'evening');
    const daypart = pairWithEvent ? 'evening' : (c.daypart || null);
    const when = pairWithEvent ? { daypart: 'evening' } : trip.when ? { ...trip.when, ...(daypart ? { daypart } : {}) } : daypart ? { daypart } : null;
    const ci = {
      regions, types: c.types, activities: c.activities || [], collections: c.collections || [], features: c.features || [],
      foodTerms: (c.cuisines || []).map((q) => ({ term: q, cuisine: q })), party: { dog: !!c.dog, kids: !!c.kids },
      occasion: null, when, superlative: false,
    };
    const ctx = buildContext(ci, labels, { ...input, startWeekday: pairWithEvent && anchor.weekday ? anchor.weekday : input.startWeekday });
    const scored = [];
    const closedByAdvisory = [];
    for (const v of facts) {
      if (used.has(v.id) || !regionOk(v, ctx) || !eligible(v, ctx, true)) continue;
      if (c.generic && !c.types.includes(v.type)) continue;
      const s = scoreVenue(v, ctx);
      const t = requestedTimeFit(v, ctx);
      if (t && t.skip) continue;
      const adv = advisoryFit(v, c, season);
      if (adv && adv.skip) { closedByAdvisory.push({ v, score: s.score }); continue; }
      const sf = seasonFit(v, c, season, ctx);
      if (sf.score) seasonRanked = true;
      let score = s.score + (t ? t.score : 0) + sf.score + (adv ? adv.score : 0);
      const reasons = s.reasons.concat(t ? t.reasons : [], sf.reasons);
      if (pairWithEvent && anchor.region && v.region === anchor.region) { score += 12; reasons.push({ code: 'near_event', text: `In ${regionLabel(ctx, v.region)}, where the event is`, weight: 12 }); }
      if (c.liveMusicFallback) reasons.push({ code: 'live_music', text: 'Has the verified Live Music badge', weight: 8 });
      const dogCaveat = dogSeasonCaveat(v, c);
      const caveats = (t ? t.caveats : []).concat(sf.caveats, adv ? [adv.caveat] : [], dogCaveat ? [dogCaveat] : []);
      scored.push({ v, score, base: s.score, reasons, caveats, seasonFlags: sf.flags, advisory: !!adv });
    }
    scored.sort(compareScored);
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
    const pick = pool[0];
    // Say so when a place that would otherwise have ranked first was left
    // out because its advisory says it is closed or under an evacuation order.
    const bestClosed = closedByAdvisory
      .filter((x) => (pool === scored || x.v.region === community.region) && (!pick || x.score > pick.base))
      .sort((x, y) => y.score - x.score)[0];
    const closedNote = bestClosed ? `${bestClosed.v.name} was left out: its current advisory on Okanagan Roam says it isn’t available.` : null;
    if (closedNote && !result.notes.includes(closedNote)) result.notes.push(closedNote);
    if (!pick) {
      result.warnings.push(`No ${c.dog && !/dog/.test(label) ? 'dog-friendly ' : ''}${label} matched ${whereText}, so the rest of the plan is shown.`);
      continue;
    }
    used.add(pick.v.id);
    if (!explicitGeography && !community) community = { region: pick.v.region, from: 'stop' };
    const extra = route ? [{ code: 'route', text: `In ${regionLabel(ctx, pick.v.region)}, on the way`, weight: 1 }] : regionReason(pick.v, ctx);
    const alternates = pool.slice(1).filter((s) => !used.has(s.v.id)).slice(0, 2);
    for (const a of alternates) used.add(a.v.id);
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
  result.experience = buildExperience(stops, trip, route, { ...baseCtx, regions }, season);
  result.season = season ? { date: season.date, season: season.season, month: season.monthName } : null;
  if (season && (seasonRanked || stops.some((s) => s.seasonFlags && Object.keys(s.seasonFlags).length))) {
    result.notes.push(`Planned for ${season.monthName} (Okanagan time): seasonal activities such as swimming, paddling, skiing, camping and outdoor golf are ranked for the time of year, and nothing is left out for the season alone.`);
  }

  // Summary + overview, from what was asked.
  const partLabels = trip.components.map((c) => {
    const l = componentLabel(c, baseCtx);
    return c.kind === 'event' && l !== 'live music' ? article(l) : l;
  });
  const allDog = trip.components.filter((c) => c.kind === 'venue').every((c) => c.dog) && trip.components.some((c) => c.kind === 'venue' && c.dog);
  const listed = listText(partLabels);
  const where = route && route.from && route.to ? ` from ${regionLabel(baseCtx, route.from)} to ${regionLabel(baseCtx, route.to)}` : route && route.to ? ` on the way to ${regionLabel(baseCtx, route.to)}` : regions.length ? ` in ${listText(regions.map((r) => regionLabel(baseCtx, r)))}` : '';
  const when = trip.when && trip.when.preset === 'this-weekend' ? ' this weekend' : '';
  result.summary = `${allDog ? 'Dog-friendly ' : ''}${allDog ? listed : listed.replace(/^./, (x) => x.toUpperCase())}${where}${when}.`.replace(/^Dog-friendly (.)/, (m, c) => `Dog-friendly ${c.toLowerCase()}`);
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
  eventSuitsKind,
  chooseTripEvent,
  routeRegions,
  routeDirection,
  parseEventStart,
};
