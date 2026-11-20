'use strict';
// Build My Trip, step 4 (2026-11-20): an AI request reader, a test switch the public never sees.
//
// The one rule (drafts/trip-ai/plan-2026-11-18.md): AI only READS the request into a fixed structure. The existing
// planner still picks every place, checks hours and seasons and builds the day. The model is never shown a venue, a
// price or an hour, and nothing it returns can name a stop: every field is checked here against enums built from the
// planner's own taxonomy (towns, kinds of places, activities, badges), and the one free-text field, a place name the
// visitor typed, is kept only when those exact words are in the request, and is then resolved (or not) by the
// planner's own name matcher like any typed request.
//
// readTripRequest(text, opts) -> { ok: true, intent, usage, costUsd, ms } | { ok: false, reason, ms, usage?, costUsd? }
// renderTripRequest(intent, ctx) -> { text, overrides, stay, dropped }: the structure turned back into the planner's own
// plain request words (the same words its rules already read) plus its existing validated overrides.
//
// Any error, refusal, invalid or "unsure" answer, a timeout (~2 s) or the daily spend cap -> { ok: false }, and the
// caller plans with today's rules, exactly as without AI.

const MODEL = 'claude-haiku-5-5';
// Claude Haiku 5.5 list price (claude-api skill, cached 2026-10-06): $0.10 per million input tokens and $0.50 per million
// output tokens for prompts up to 100K tokens (ours are ~2K). Thinking is off here, so there are no thinking tokens.
const PRICE_PER_TOKEN = { input: 0.10 / 1e6, output: 0.50 / 1e6 };
const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_DAILY_USD = 1;
const MAX_TEXT = 600;

const TIMES = ['any', 'early', 'morning', 'midday', 'afternoon', 'evening', 'night'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const OCCASIONS = ['romantic', 'family', 'friends', 'parents', 'solo', 'birthday'];
const PACES = ['relaxed', 'standard', 'packed'];
const BUDGETS = ['budget', 'moderate', 'upscale'];

// The planner's own words for each kind of stop. Keys are what the model may answer; the phrase is what the planner's
// rules already read. Types and activities are only offered when the planner's taxonomy has them (buildAllowed).
const TYPE_PHRASES = {
  restaurant: 'restaurants', winery: 'wineries', cafe: 'cafes', brewery: 'breweries', pub: 'pubs', cocktail: 'cocktail lounges',
  distillery: 'distilleries', golf: 'golf', beach: 'a beach', outdoor: 'outdoors', indoor: 'indoor fun', tour: 'a tour',
};
const ACTIVITY_PHRASES = {
  hiking: 'a hike', cycling: 'a bike ride', winter: 'winter activities', camping: 'camping', nature: 'nature and wildlife',
  water: 'paddling', viewpoints: 'a viewpoint', adventure: 'adventure', fishing: 'fishing',
};
// Moments of a day the planner reads by name (meals, après, a ski day...). Always offered.
const MOMENT_PHRASES = {
  coffee: 'coffee', breakfast: 'breakfast', brunch: 'brunch', lunch: 'lunch', dinner: 'dinner', drinks: 'drinks',
  apres: 'après drinks', happy_hour: 'happy hour', ice_cream: 'ice cream', ski: 'a ski day', hot_tub: 'hot tub', spa: 'spa',
  sunset: 'sunset', swim: 'a swim', wine_tasting: 'wine tasting', cidery: 'cideries', live_music: 'live music', museum: 'a museum',
  gallery: 'an art gallery', bowling: 'bowling', escape_room: 'an escape room', climbing_gym: 'a climbing gym',
  playground: 'a playground', farmers_market: 'farmers market', cheap_eats: 'cheap eats',
};
// Moments whose time of day is already in the word: no "evening dinner".
const TIMED_MOMENTS = new Set(['breakfast', 'brunch', 'lunch', 'dinner', 'apres', 'happy_hour', 'sunset']);
const FEATURE_PHRASES = {
  dog_friendly: 'dog-friendly', vegan: 'vegan', vegetarian: 'vegetarian', patio: 'with a patio', kid_friendly: 'kid-friendly',
  gluten_free: 'gluten-free', lake_view: 'with a lake view', nonalcoholic: 'non-alcoholic drinks', live_music: 'live music',
  great_groups: 'good for groups', happy_hour: 'happy hour', free_entry: 'free', arts_culture: 'arts and culture',
  open_early: 'open early', open_late: 'open late',
  // Not a badge: the planner says honestly that it cannot check access (trip-requirements.js "accessibility").
  accessible: 'wheelchair accessible',
};
const AVOID_EXTRA = { alcohol: 'no alcohol' };

// The enums offered to the model, from the planner's taxonomy (server.js buildTripPlannerTaxonomy()).
function buildAllowed(taxonomy = {}) {
  const regions = (taxonomy.regions || []).filter((r) => taxonomy.regionLabels && taxonomy.regionLabels[r]);
  const types = (taxonomy.types || []).filter((t) => TYPE_PHRASES[t]);
  const activities = (taxonomy.activities || []).filter((a) => ACTIVITY_PHRASES[a]);
  const kinds = [...new Set([...types, ...activities, ...Object.keys(MOMENT_PHRASES)])];
  const features = [...(taxonomy.features || []).filter((f) => FEATURE_PHRASES[f]), 'accessible'];
  return {
    regions, regionLabels: { ...(taxonomy.regionLabels || {}) }, kinds, features,
    avoid: [...kinds, ...Object.keys(AVOID_EXTRA)],
    paces: (taxonomy.paces || PACES).filter((p) => PACES.includes(p)),
    budgets: (taxonomy.budgets || BUDGETS).filter((b) => BUDGETS.includes(b)),
  };
}

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const enumOf = (values) => ({ type: 'string', enum: values.slice() });
// Kinds served with alcohol, for the negation-scope check ("designated driver" is not "no alcohol").
const DRINK_KINDS = new Set(['winery', 'wine_tasting', 'brewery', 'cidery', 'distillery', 'pub', 'cocktail', 'drinks', 'apres', 'happy_hour']);
const WHEN_VALUES = [...WEEKDAYS, ...MONTHS, ...SEASONS];

// The wire format: what the model writes.
// Round 2 made every key but two optional (20 optional parameters) so the model could leave empty keys out. The live
// API spent 14-30 s compiling that grammar and then answered 400 "Schema is too complex": each optional parameter
// roughly doubles part of the grammar's state space, and they compound. Round 3 (2026-11-20): EVERY key is required and
// there are NO union types (no nullable anyOf, no type arrays) and NO formats. "Not said" is a fixed empty value instead:
// "" for text, 0 for numbers, [] for lists, and the yes/no facts are one list of flags (only the ones that apply).
// Short keys keep the answer small (a typical answer is ~150-200 characters, ~50-70 tokens; round 1 wrote ~420
// characters with long names and nested nulls). The value lists (towns, kinds, badges) stay as enums: round 1 had the
// same enums and compiled fine (p50 1.3 s), so they are not the problem, and they stop invented values at the source.
// schemaComplexity() below counts all of this, and a unit test holds it to the documented limits.
//   t towns, i interests [{k kind, t time of day, s start "HH:MM" or "", p typed place or ""}], f flags, sd start date
//   or "", d days, n nights, a adults, k kids (0 = not said), ka kids' ages, w weekday/month/season or "", o occasion
//   or "", pc pace or "", b budget or "", mh must-haves, ma must-avoids.
const WIRE_KEYS = ['t', 'i', 'f', 'sd', 'd', 'n', 'a', 'k', 'ka', 'w', 'o', 'pc', 'b', 'mh', 'ma'];
const WIRE_REQUIRED = WIRE_KEYS.slice();
const FLAGS = ['unsure', 'valley', 'dog', 'rain', 'driver'];
// Structured-outputs limits (platform.claude.com/docs/en/build-with-claude/structured-outputs, "Schema complexity
// limits"): at most 24 optional parameters and 16 union-typed parameters per request, plus internal grammar-size limits.
// We stay at 0 and 0.
const SCHEMA_LIMITS = { optional: 24, unions: 16 };
function wireSchema(allowed) {
  const str = { type: 'string' };
  const int = { type: 'integer' };
  const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
  return obj({
    t: { type: 'array', items: enumOf(allowed.regions) },
    i: { type: 'array', items: obj({ k: enumOf(allowed.kinds), t: enumOf(TIMES), s: str, p: str }) },
    f: { type: 'array', items: enumOf(FLAGS) },
    sd: str,
    d: int,
    n: int,
    a: int,
    k: int,
    ka: { type: 'array', items: int },
    w: enumOf(['', ...WHEN_VALUES]),
    o: enumOf(['', ...OCCASIONS]),
    pc: enumOf(['', ...allowed.paces]),
    b: enumOf(['', ...allowed.budgets]),
    mh: { type: 'array', items: enumOf(allowed.features) },
    ma: { type: 'array', items: enumOf(allowed.avoid) },
  });
}
// Kept for callers of the first version: the schema the model answers in.
const intentSchema = wireSchema;
// Counts what drives grammar size: optional parameters (properties not in "required"), union-typed parameters (anyOf /
// oneOf / type arrays), format strings, enum values, nesting depth.
function schemaComplexity(schema) {
  const out = { optional: 0, unions: 0, formats: 0, enums: 0, enumValues: 0, largestEnum: 0, properties: 0, depth: 0 };
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object') return;
    out.depth = Math.max(out.depth, depth);
    if (node.anyOf || node.oneOf || Array.isArray(node.type)) out.unions += 1;
    if (node.format) out.formats += 1;
    if (Array.isArray(node.enum)) { out.enums += 1; out.enumValues += node.enum.length; out.largestEnum = Math.max(out.largestEnum, node.enum.length); }
    if (node.properties) {
      const req = new Set(node.required || []);
      for (const [k, v] of Object.entries(node.properties)) { out.properties += 1; if (!req.has(k)) out.optional += 1; walk(v, depth + 1); }
    }
    if (node.items) walk(node.items, depth + 1);
    for (const u of [...(node.anyOf || []), ...(node.oneOf || [])]) walk(u, depth + 1);
  };
  walk(schema, 0);
  return out;
}
const LONG_KEYS = ['unsure', 'towns', 'valley_wide', 'start_date', 'days', 'nights', 'weekday', 'month', 'season', 'party', 'occasion',
  'rainy_day', 'interests', 'pace', 'budget', 'must_have', 'must_avoid'];

// Wire answer -> the long intent ("" / 0 / missing flag -> not said). Shape only; validateIntent checks every value.
// -> { ok, intent } | { ok: false, reason }
function expandWire(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return { ok: false, reason: 'invalid:not_object' };
  const extra = Object.keys(w).filter((k) => !WIRE_KEYS.includes(k));
  if (extra.length) return { ok: false, reason: `invalid:extra_${extra[0]}` };
  for (const k of WIRE_REQUIRED) if (!(k in w)) return { ok: false, reason: `invalid:missing_${k}` };
  if (!Array.isArray(w.f) || !w.f.every((x) => FLAGS.includes(x))) return { ok: false, reason: 'invalid:flags' };
  for (const k of ['sd', 'w', 'o', 'pc', 'b']) if (typeof w[k] !== 'string') return { ok: false, reason: `invalid:${k}` };
  for (const k of ['d', 'n', 'a', 'k']) if (!Number.isInteger(w[k]) || w[k] < 0) return { ok: false, reason: `invalid:${k}` };
  if (w.w !== '' && !inEnum(w.w, WHEN_VALUES)) return { ok: false, reason: 'invalid:when' };
  if (!Array.isArray(w.i)) return { ok: false, reason: 'invalid:interests' };
  for (const it of w.i) {
    if (!it || typeof it !== 'object' || Array.isArray(it) || ['k', 't', 's', 'p'].some((k) => !(k in it)) || Object.keys(it).some((k) => !['k', 't', 's', 'p'].includes(k))
      || typeof it.s !== 'string' || typeof it.p !== 'string') return { ok: false, reason: 'invalid:interest' };
  }
  const flag = (x) => w.f.includes(x);
  const text = (x) => (x === '' ? null : x);
  const num = (x) => (x === 0 ? null : x);
  return {
    ok: true,
    intent: {
      unsure: flag('unsure'), towns: w.t, valley_wide: flag('valley'), start_date: text(w.sd), days: num(w.d), nights: num(w.n),
      weekday: WEEKDAYS.includes(w.w) ? w.w : null, month: MONTHS.includes(w.w) ? w.w : null, season: SEASONS.includes(w.w) ? w.w : null,
      party: { adults: num(w.a), kids: num(w.k), kid_ages: w.ka, dog: flag('dog') }, occasion: text(w.o),
      rainy_day: flag('rain'), driver: flag('driver'),
      interests: w.i.map((it) => ({ kind: it.k, time_of_day: it.t, start_time: text(it.s), place: text(it.p) })),
      pace: text(w.pc), budget: text(w.b), must_have: w.mh, must_avoid: w.ma,
    },
  };
}
// The long intent -> the wire format (for fixtures and tests).
function toWire(x) {
  const p = x.party || {};
  const f = [];
  if (x.unsure) f.push('unsure');
  if (x.valley_wide) f.push('valley');
  if (p.dog) f.push('dog');
  if (x.rainy_day) f.push('rain');
  if (x.driver) f.push('driver');
  return {
    t: x.towns || [],
    i: (x.interests || []).map((it) => ({ k: it.kind, t: it.time_of_day || 'any', s: it.start_time || '', p: it.place || '' })),
    f, sd: x.start_date || '', d: x.days || 0, n: x.nights || 0, a: p.adults || 0, k: p.kids || 0, ka: p.kid_ages || [],
    w: x.weekday || x.month || x.season || '', o: x.occasion || '', pc: x.pace || '', b: x.budget || '', mh: x.must_have || [], ma: x.must_avoid || [],
  };
}

// The system prompt is the same for every request (towns, rules), so it is sent as one cached block; the date and the
// request go in the user message after it. Claude Haiku 5.5 caches prefixes from 512 tokens; this prompt plus the
// schema is ~2K tokens, so it qualifies. The value lists live in the schema (also stable; the API compiles it once and
// keeps it for 24 h from last use).
function systemPrompt(allowed) {
  const towns = allowed.regions.map((r) => `${r} (${allowed.regionLabels[r] || r})`).join(', ');
  return [
    'You read one visitor request for an Okanagan Valley (BC) trip planner into the JSON schema. You do not plan anything.',
    'Only read what the request says. Never add a place, business, price, opening hour or booking. Do not infer needs or avoidances (kids do not mean "no alcohol").',
    'Every key is always present. When the request does not say it: "" for text, 0 for numbers, [] for lists.',
    'Keys: t towns, i interests, f flags, sd start date, d days, n nights, a adults, k kids, ka kids\' ages, w weekday/month/season, o occasion, pc pace, b budget, mh must-haves, ma must-avoids.',
    'f: only the flags that apply: unsure (not a trip request or too vague to read; still fill what you can), valley (the whole valley: "Okanagan", "the valley", towns across it), dog (a dog comes), rain (rain or a rainy day), driver (a designated driver, "someone is driving", "no driving").',
    `t: only these slugs: ${towns}. A ski hill (Big White, SilverStar, Apex, Baldy) is its slug. "Naramata Bench" is naramata.`,
    'sd: only for a calendar date ("this Saturday", "tomorrow", "Dec 5"), resolved from today\'s date below as YYYY-MM-DD, never past. Otherwise w = weekday, month or season.',
    'd: days asked ("a weekend" = 2, "a day" = 1). n: only when nights are counted. a, k: only when counted; ka only when ages are given ("toddlers" = [2], "teens" = [15]).',
    'i: one entry per stop they want, IN THE ORDER THEY WILL HAPPEN, which is not always the order of the words:',
    '  "a brewery after dinner" -> dinner, brewery. "before dinner, a winery" -> winery, dinner. "X then Y", "X followed by Y", "start with X", "end with Y" -> X, Y.',
    '  One entry per stop: "a sunset dinner" = dinner; "lunch with a view" = lunch plus mh lake_view; "a winery tour" = winery; "après after skiing" = ski, apres (no extra drinks).',
    '  "a day on the mountain/slopes" in winter = ski. "cheap eats" = cheap_eats. "wine tasting" = wine_tasting.',
    '  Each interest: k kind; t time of day only when said or obvious ("morning coffee" = morning), else "any"; s "HH:MM" 24h only for a clock time ("coffee at 10" = "10:00"); p only a business name the visitor typed for that stop, copied exactly. Never suggest one.',
    'o: romantic (anniversary, date, couples, honeymoon), family, friends (girls, bachelor), parents (seniors, grandparents), solo, birthday.',
    'pc: relaxed for chill/slow/easy; packed for busy/as much as possible. b: budget for cheap; upscale for fancy/luxury.',
    'mh: needs such as vegan, gluten_free, kid_friendly, dog_friendly, accessible (wheelchair, mobility).',
    'ma: only what they say to avoid or exclude, scoped to exactly what the "no"/"not"/"without" applies to. "we don\'t drink" / "sober" / "alcohol-free" -> alcohol. A designated driver means they DO drink: flag driver, never alcohol. Never put a kind in ma that is also in i.',
    'The request may be in French; read it the same way.',
  ].join('\n');
}

// Emails, web addresses and phone numbers are removed before the text leaves the server. Nothing else about the visitor
// is sent (no IP, no id, no cookie).
function stripPII(text) {
  return String(text || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ca|net|org|io|co|info|biz)(?:\/\S*)?\b/gi, '[link]')
    .replace(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

// ---------- Daily spend cap (in memory) ----------
// Counted from each answer's usage numbers at the list price above. Kept in memory, per Pacific day: a restart starts the
// day at $0 again, which is acceptable for an admin-only test (no new table, nothing written to the database).
const spend = { day: null, usd: 0, calls: 0 };
function pacificDay(now = new Date()) { return new Date(now.getTime() - 8 * 3600000).toISOString().slice(0, 10); }
function dailyCapUsd(env = process.env) {
  const n = Number(String(env.TRIP_AI_DAILY_USD || '').trim());
  return Number.isFinite(n) && n >= 0 && String(env.TRIP_AI_DAILY_USD || '').trim() !== '' ? n : DEFAULT_DAILY_USD;
}
function spentToday(now = new Date()) {
  const day = pacificDay(now);
  if (spend.day !== day) { spend.day = day; spend.usd = 0; spend.calls = 0; }
  return spend.usd;
}
function addSpend(usd, now = new Date()) { spentToday(now); spend.usd += usd; spend.calls += 1; }
function resetSpend() { spend.day = null; spend.usd = 0; spend.calls = 0; }
function costOf(usage) {
  if (!usage) return 0;
  return (Number(usage.input_tokens) || 0) * PRICE_PER_TOKEN.input + (Number(usage.output_tokens) || 0) * PRICE_PER_TOKEN.output
    + (Number(usage.cache_creation_input_tokens) || 0) * PRICE_PER_TOKEN.input * 2 + (Number(usage.cache_read_input_tokens) || 0) * PRICE_PER_TOKEN.input * 0.1;
}

function enabled(env = process.env) { return /^(1|on|true|yes)$/i.test(String(env.TRIP_AI || '').trim()); }
function apiKey(env = process.env) { return String(env.ANTHROPIC_API_KEY || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim(); }

// ---------- Validation ----------
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const inEnum = (v, list) => typeof v === 'string' && list.includes(v);
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function addDays(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// Checks the model's answer against the schema and the allowed values, in code. Anything off -> { ok: false, reason }.
// originalText: a typed place name is kept only when its words are in the request.
function validateIntent(raw, allowed, { originalText = '', today = null } = {}) {
  const bad = (reason) => ({ ok: false, reason: `invalid:${reason}` });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('not_object');
  const extra = Object.keys(raw).filter((k) => !LONG_KEYS.includes(k) && k !== 'driver');
  if (extra.length) return bad(`extra_${extra[0]}`);
  for (const k of LONG_KEYS) if (!(k in raw)) return bad(`missing_${k}`);
  if (typeof raw.unsure !== 'boolean' || typeof raw.valley_wide !== 'boolean' || typeof raw.rainy_day !== 'boolean') return bad('boolean');
  // driver (round 2): optional, false when absent.
  if (raw.driver !== undefined && typeof raw.driver !== 'boolean') return bad('driver');
  if (!Array.isArray(raw.towns) || raw.towns.length > 8 || !raw.towns.every((t) => inEnum(t, allowed.regions))) return bad('towns');
  if (raw.start_date !== null && !validDate(raw.start_date)) return bad('start_date');
  if (raw.start_date && today && (raw.start_date < today || raw.start_date > addDays(today, 400))) return bad('start_date_range');
  if (raw.days !== null && !isInt(raw.days, 1, 14)) return bad('days');
  if (raw.nights !== null && !isInt(raw.nights, 1, 30)) return bad('nights');
  if (raw.weekday !== null && !inEnum(raw.weekday, WEEKDAYS)) return bad('weekday');
  if (raw.month !== null && !inEnum(raw.month, MONTHS)) return bad('month');
  if (raw.season !== null && !inEnum(raw.season, SEASONS)) return bad('season');
  const p = raw.party;
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some((k) => !['adults', 'kids', 'kid_ages', 'dog'].includes(k))) return bad('party');
  if (p.adults !== null && !isInt(p.adults, 1, 20)) return bad('party_adults');
  if (p.kids !== null && !isInt(p.kids, 0, 12)) return bad('party_kids');
  if (!Array.isArray(p.kid_ages) || p.kid_ages.length > 12 || !p.kid_ages.every((a) => isInt(a, 0, 17))) return bad('party_kid_ages');
  if (typeof p.dog !== 'boolean') return bad('party_dog');
  if (raw.occasion !== null && !inEnum(raw.occasion, OCCASIONS)) return bad('occasion');
  if (!Array.isArray(raw.interests) || raw.interests.length > 12) return bad('interests');
  const folded = fold(originalText);
  const dropped = [];
  const interests = [];
  for (const it of raw.interests) {
    if (!it || typeof it !== 'object' || Array.isArray(it) || Object.keys(it).some((k) => !['kind', 'time_of_day', 'start_time', 'place', 'sunset'].includes(k))) return bad('interest');
    if (it.sunset !== undefined && it.sunset !== true) return bad('interest_sunset');
    if (!inEnum(it.kind, allowed.kinds)) return bad('interest_kind');
    if (!inEnum(it.time_of_day, TIMES)) return bad('interest_time');
    if (it.start_time !== null && !(typeof it.start_time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(it.start_time))) return bad('interest_start_time');
    if (it.place !== null && typeof it.place !== 'string') return bad('interest_place');
    let place = it.place === null ? null : String(it.place).replace(/\s+/g, ' ').trim().slice(0, 80);
    // The visitor's own words only: a name the request does not contain is dropped (never a suggestion from the model).
    if (place && (place.length < 3 || !folded.includes(fold(place)))) { dropped.push(`place:${place}`); place = null; }
    const prev = interests[interests.length - 1];
    // One stop asked once: the same kind twice in a row, or après followed by "drinks", is one stop (the first answer
    // read "après drinks after skiing" as après then drinks; "2 days of golf" as golf, golf).
    if (prev && !place && !prev.place && (prev.kind === it.kind || (prev.kind === 'apres' && it.kind === 'drinks'))) { dropped.push(`repeat:${it.kind}`); continue; }
    // "a sunset dinner" is one dinner at sunset, not a sunset stop plus a dinner.
    if (prev && prev.kind === 'sunset' && it.kind === 'dinner' && !prev.place) { interests.pop(); dropped.push('repeat:sunset'); }
    const sunset = it.sunset === true || !!(prev && prev.kind === 'sunset' && it.kind === 'dinner' && !prev.place);
    interests.push({ kind: it.kind, time_of_day: it.time_of_day, start_time: it.start_time, place: place || null, ...(sunset ? { sunset: true } : {}) });
  }
  if (raw.pace !== null && !inEnum(raw.pace, allowed.paces)) return bad('pace');
  if (raw.budget !== null && !inEnum(raw.budget, allowed.budgets)) return bad('budget');
  if (!Array.isArray(raw.must_have) || raw.must_have.length > 10 || !raw.must_have.every((f) => inEnum(f, allowed.features))) return bad('must_have');
  if (!Array.isArray(raw.must_avoid) || raw.must_avoid.length > 10 || !raw.must_avoid.every((f) => inEnum(f, allowed.avoid))) return bad('must_avoid');
  // Negation scope (round 2): an avoidance can't cancel what was asked for. A kind that is also an interest is not
  // avoided, and "no alcohol" can't stand next to a winery, brewery or drinks stop, or a designated driver ("wine tasting
  // with a designated driver" means they drink and someone else drives; the first answer read it as "no alcohol").
  const asked = new Set(interests.map((x) => x.kind));
  const drinksAsked = interests.some((x) => DRINK_KINDS.has(x.kind));
  const avoid = [...new Set(raw.must_avoid)].filter((k) => {
    const conflict = asked.has(k) || (k === 'alcohol' && (drinksAsked || raw.driver === true));
    if (conflict) dropped.push(`avoid:${k}`);
    return !conflict;
  });
  const intent = {
    unsure: raw.unsure, towns: [...new Set(raw.towns)], valley_wide: raw.valley_wide, start_date: raw.start_date, days: raw.days, nights: raw.nights,
    weekday: raw.weekday, month: raw.month, season: raw.season,
    party: { adults: p.adults, kids: p.kids, kid_ages: p.kid_ages.slice(), dog: p.dog },
    occasion: raw.occasion, rainy_day: raw.rainy_day, driver: raw.driver === true, interests, pace: raw.pace, budget: raw.budget,
    must_have: [...new Set(raw.must_have)], must_avoid: avoid,
  };
  return { ok: true, intent, dropped };
}

// ---------- The call ----------
// opts: { today: 'YYYY-MM-DD', lang, timeoutMs, fetchImpl, taxonomy | allowed, env, now }
async function readTripRequest(text, opts = {}) {
  const started = Date.now();
  const env = opts.env || process.env;
  const now = opts.now || new Date();
  const ms = () => Date.now() - started;
  const allowed = opts.allowed || buildAllowed(opts.taxonomy || {});
  const key = opts.apiKey !== undefined ? opts.apiKey : apiKey(env);
  if (!key) return { ok: false, reason: 'no_api_key', ms: ms() };
  if (!allowed.regions.length || !allowed.kinds.length) return { ok: false, reason: 'no_taxonomy', ms: ms() };
  const cap = dailyCapUsd(env);
  if (spentToday(now) >= cap) return { ok: false, reason: 'over_daily_cap', ms: ms() };
  const clean = stripPII(text);
  if (!clean) return { ok: false, reason: 'empty', ms: ms() };
  const today = opts.today || pacificDay(now);
  const weekday = WEEKDAYS[(new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7];
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : (Number(env.TRIP_AI_TIMEOUT_MS) > 0 ? Number(env.TRIP_AI_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS);
  const fetchImpl = opts.fetchImpl || fetch;
  const body = {
    model: MODEL,
    // The wire answer is ~60-120 tokens; 400 leaves room without letting a runaway answer eat the time budget.
    max_tokens: 400,
    // A short extraction: thinking off at low effort keeps it fast and cheap (Claude Haiku 5.5 accepts "disabled" at
    // effort high or below).
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: wireSchema(allowed) } },
    // Identical on every request, so it is cached. A one-hour cache, because test reads on the live site are minutes
    // apart (a 5-minute cache would mostly miss); a hit skips re-reading ~1.7K tokens and bills them at 0.1x, a write
    // costs 2x on those tokens (well under a cent a day).
    system: [{ type: 'text', text: systemPrompt(allowed), cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: `Today is ${cap1(weekday)} ${today}.${opts.lang === 'fr' ? ' The visitor is on the French page.' : ''}\nRequest: ${clean}` }],
  };
  const controller = new AbortController();
  let timer;
  let res, j;
  try {
    const call = (async () => {
      const r = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let parsed = null;
      try { parsed = await r.json(); } catch (e) { parsed = null; }
      return [r, parsed];
    })();
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })); }, timeoutMs); });
    [res, j] = await Promise.race([call, timeout]);
  } catch (err) {
    return { ok: false, reason: err && (err.code === 'TIMEOUT' || err.name === 'AbortError' || err.name === 'TimeoutError') ? 'timeout' : 'network', ms: ms() };
  } finally { clearTimeout(timer); }
  const usage = j && j.usage ? {
    input_tokens: j.usage.input_tokens || 0, output_tokens: j.usage.output_tokens || 0,
    cache_read_input_tokens: j.usage.cache_read_input_tokens || 0, cache_creation_input_tokens: j.usage.cache_creation_input_tokens || 0,
  } : null;
  const costUsd = costOf(j && j.usage);
  if (costUsd) addSpend(costUsd, now);
  if (!res || !res.ok || !j) return { ok: false, reason: `api_${res ? res.status : 0}`, error: (j && j.error && String(j.error.message || j.error.type || '').slice(0, 300)) || null, usage, costUsd, ms: ms() };
  if (j.stop_reason === 'refusal') return { ok: false, reason: 'refused', usage, costUsd, ms: ms() };
  if (j.stop_reason === 'max_tokens') return { ok: false, reason: 'too_long', usage, costUsd, ms: ms() };
  const out = (j.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  let wire;
  try { wire = JSON.parse(out); } catch (e) { return { ok: false, reason: 'bad_json', usage, costUsd, ms: ms() }; }
  const x = expandWire(wire);
  if (!x.ok) return { ok: false, reason: x.reason, usage, costUsd, ms: ms() };
  const v = validateIntent(x.intent, allowed, { originalText: text, today });
  if (!v.ok) return { ok: false, reason: v.reason, usage, costUsd, ms: ms() };
  if (v.intent.unsure) return { ok: false, reason: 'unsure', intent: v.intent, usage, costUsd, ms: ms() };
  return { ok: true, intent: v.intent, dropped: v.dropped, usage, costUsd, ms: ms(), model: j.model || MODEL };
}

// ---------- Back into the planner's own input ----------
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function joinAnd(list, word = 'and') { return list.length <= 1 ? (list[0] || '') : `${list.slice(0, -1).join(', ')} ${word} ${list[list.length - 1]}`; }
function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
function interestPhrase(it, kinds) {
  let phrase = TYPE_PHRASES[it.kind] && kinds.types.has(it.kind) ? TYPE_PHRASES[it.kind]
    : ACTIVITY_PHRASES[it.kind] && kinds.activities.has(it.kind) ? ACTIVITY_PHRASES[it.kind] : MOMENT_PHRASES[it.kind];
  if (!phrase) return null;
  if (it.kind === 'dinner' && it.sunset) phrase = 'a sunset dinner';
  const tod = it.time_of_day;
  // Drinks are an evening thing anyway: "night breweries" read worse than "breweries" after the dinner they follow.
  if (tod && tod !== 'any' && !TIMED_MOMENTS.has(it.kind) && !(DRINK_KINDS.has(it.kind) && (tod === 'evening' || tod === 'night'))) {
    // "a hike" in the afternoon -> "an afternoon hike"; "coffee" in the morning -> "morning coffee".
    const bare = phrase.replace(/^(?:a|an) /, '');
    phrase = bare === phrase ? `${tod} ${phrase}` : `${/^[aeiou]/.test(tod) ? 'an' : 'a'} ${tod} ${bare}`;
  }
  if (it.place) phrase = `${phrase} at ${it.place}`;
  return phrase;
}

// intent + { allowed, taxonomy, args (the parsed POST body), staysOn } -> { text, overrides, stay, dropped }.
// The text uses only words the rules read today; dates, pace and a clock start go into the planner's existing,
// validated overrides (only when the visitor did not set them); party, dates and dog fill the step 2-3 stay inputs.
function renderTripRequest(intent, ctx = {}) {
  const allowed = ctx.allowed || buildAllowed(ctx.taxonomy || {});
  const labels = allowed.regionLabels || {};
  const kinds = { types: new Set((ctx.taxonomy && ctx.taxonomy.types) || Object.keys(TYPE_PHRASES)), activities: new Set((ctx.taxonomy && ctx.taxonomy.activities) || Object.keys(ACTIVITY_PHRASES)) };
  const args = ctx.args || {};
  const dropped = [];
  const ints = intent.interests.map((it) => ({ it, phrase: interestPhrase(it, kinds) })).filter((x) => x.phrase || (dropped.push(`kind:${x.it.kind}`), false));
  const days = intent.days || (intent.nights ? Math.min(7, intent.nights + 1) : null);
  const multi = days && days > 1;
  const towns = intent.towns.filter((t) => labels[t]).map((t) => labels[t]);
  const where = intent.valley_wide && towns.length !== 1 ? 'in the Okanagan' : towns.length ? `in ${joinAnd(towns)}` : '';
  const party = [];
  const p = intent.party;
  const ages = p.kid_ages.slice().sort((a, b) => a - b);
  if (ages.length) party.push(joinAnd(ages.map((a) => (a <= 1 ? 'a baby' : `a ${a}-year-old`))));
  else if (p.kids) party.push(p.kids === 1 ? 'a kid' : `${p.kids} kids`);
  if (p.dog) party.push('our dog');
  if (intent.occasion === 'friends') party.push('friends');
  if (intent.occasion === 'parents') party.push('my parents');
  const lead = [];
  if (intent.occasion === 'romantic') lead.push('romantic');
  if (intent.occasion === 'family' && !ages.length && !p.kids) lead.push('family');
  if (intent.occasion === 'birthday') lead.push('birthday');
  if (intent.occasion === 'solo') lead.push('solo');
  if (intent.budget === 'upscale') lead.push('upscale');
  let head;
  const list = multi ? [...new Set(ints.map((x) => x.phrase))] : ints.map((x) => x.phrase);
  if (multi) head = `${lead.length ? `a ${lead.join(' ')} ` : ''}${days} days${where ? ` ${where}` : ''}${list.length ? ` with ${joinAnd(list)}` : ''}`;
  else if (list.length) head = `${lead.length ? `${lead.join(' ')} ` : ''}${list.join(' then ')}${where ? ` ${where}` : ''}`;
  else head = `a ${lead.length ? `${lead.join(' ')} ` : ''}day${where ? ` ${where}` : ''}`;
  const tail = [];
  if (party.length) tail.push(`with ${joinAnd(party)}`);
  if (intent.driver) tail.push('with a designated driver');
  if (intent.rainy_day) tail.push('on a rainy day');
  if (!intent.start_date) {
    if (intent.weekday && !multi) tail.push(`on ${cap1(intent.weekday)}`);
    if (intent.month) tail.push(`in ${cap1(intent.month)}`);
    else if (intent.season) tail.push(`in ${intent.season}`);
  }
  if (intent.budget === 'budget' && !intent.interests.some((i) => i.kind === 'cheap_eats')) tail.push('on a budget');
  const needs = intent.must_have.map((f) => FEATURE_PHRASES[f]).filter(Boolean);
  if (needs.length) tail.push(joinAnd(needs));
  // "No alcohol" already covers every drinks kind: one clear phrase, not a list of ten.
  const avoidKinds = intent.must_avoid.includes('alcohol') ? intent.must_avoid.filter((k) => k === 'alcohol' || !DRINK_KINDS.has(k)) : intent.must_avoid;
  const avoid = avoidKinds.map((k) => AVOID_EXTRA[k] || `no ${TYPE_PHRASES[k] || ACTIVITY_PHRASES[k] || MOMENT_PHRASES[k] || k}`.replace(/^no (a|an) /, 'no '));
  if (avoid.length) tail.push(joinAnd(avoid));
  const text = [head, ...tail].join(', ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  // Overrides: only what the visitor did not set themselves; all are the planner's existing, validated chips.
  const given = args.overrides || {};
  const overrides = { ...given };
  if (intent.start_date && given.startDate === undefined) overrides.startDate = intent.start_date;
  if (intent.pace && given.pace === undefined) overrides.pace = intent.pace;
  const first = ints[0] && ints[0].it.start_time;
  if (first && !multi && given.startMinutes === undefined && given.dayStartMinutes === undefined) {
    const [h, m] = first.split(':').map(Number);
    overrides.startMinutes = h * 60 + m;
  }
  // Later clock times stay in the text ("dinner at 7 PM"), as a visitor would type them.
  const timedText = ints.slice(1).filter((x) => x.it.start_time).map((x) => `${x.phrase.replace(/ at .*$/, '')} at ${clock(x.it.start_time)}`);
  const finalText = timedText.length ? `${text}, ${joinAnd(timedText)}`.slice(0, MAX_TEXT) : text;
  // Steps 2-3 stay inputs: only with stays on, and only the fields the visitor left empty.
  let stay = args.stay ? { ...args.stay } : null;
  if (ctx.staysOn) {
    const st = { ...(stay || {}) };
    const arrive = intent.start_date;
    if (!st.arrive && arrive) {
      st.arrive = arrive;
      const nights = intent.nights || (intent.days && intent.days > 1 ? intent.days - 1 : null);
      if (!st.leave && nights) st.leave = addDays(arrive, Math.min(nights, 30));
    }
    if (st.adults === undefined && p.adults) st.adults = Math.min(p.adults, 20);
    if (st.kids === undefined && (p.kids || ages.length)) st.kids = Math.min(p.kids || ages.length, 12);
    if (st.dog === undefined && p.dog) st.dog = true;
    stay = Object.keys(st).length ? st : null;
  }
  return { text: finalText, overrides: Object.keys(overrides).length ? overrides : null, stay, dropped };
}

module.exports = {
  MODEL, PRICE_PER_TOKEN, DEFAULT_TIMEOUT_MS, DEFAULT_DAILY_USD, TIMES, MONTHS, SEASONS, OCCASIONS,
  TYPE_PHRASES, ACTIVITY_PHRASES, MOMENT_PHRASES, FEATURE_PHRASES,
  enabled, apiKey, buildAllowed, intentSchema, wireSchema, expandWire, toWire, WIRE_KEYS, WIRE_REQUIRED, FLAGS, SCHEMA_LIMITS, schemaComplexity, DRINK_KINDS, systemPrompt, stripPII, validateIntent, readTripRequest, renderTripRequest,
  costOf, dailyCapUsd, spentToday, addSpend, resetSpend, pacificDay,
};
