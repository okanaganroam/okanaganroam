'use strict';
// Build My Trip: "Where to stay" (step 2, 2026-11-20). Picks a base for a plan of two or more days (or any plan whose
// trip dates span a night) from the places to stay (type 'stay', places-to-stay.js) and their stay_info facts.
// Behind TRIP_STAYS (off by default) or a /trip?stays=1 preview; see server.js (tripStaysEnabledFor, withTripStays).
//
// Deterministic: no randomness and no AI. Pure functions only; server.js reads the stays and their facts and passes
// them in. A stay is never a plan stop: the planner's facts still leave every stay out (type != 'stay').
//
// Hard filters drop a stay only when its data says it fails. Unknown (null, missing, [] open_months) never drops it:
//   open_months includes every month of the trip's nights; max_guests >= adults + kids; not adults_only with kids;
//   pets not "no" on a dog trip; min_nights <= the trip's nights.
// Ranking (lower score is better, in km): straight-line distance from the centre of the plan's stops, plus a little for
// a stay outside the town with the most stops; minus small bonuses for a known good match (family-friendly with kids,
// pets welcome with a dog, the price band the request asked for, a kitchen for 4+ nights), confidence and a photo; plus
// a small penalty for an unknown max_guests when the party is 5 or more. Ties go to the lower venue id.

const MAX_NIGHTS = 30;
const MAX_ADULTS = 16;
const MAX_KIDS = 12;
const { MAX_ROOMS, stayRoomsFor } = require('./stay-booking-links');

// ---- Rooms, as the visitor says them (2026-11-22) ----
// "3 rooms", "two rooms", "2 rooms for the 6 of us", « 3 chambres » -> { rooms: n }; "a room each", "separate rooms",
// "our own rooms", « une chambre chacun » -> { each: true } (one room per adult); "one room", "share a room", "we'll
// share" (the chat only) -> { rooms: 1 }. Never "2 bedrooms" (a kind of unit) or "room for two". -> null when not said.
const ROOM_NUM = { a: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, un: 1, une: 1, seule: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8 };
const foldRooms = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const ROOMS_EACH_RE = /\b(?:a|one|1|une|un)\s+(?:room|chambre)\s+(?:each|apiece|per person|per adult|chacune?|par personne|par adulte)\b|\b(?:separate|individual|our own|their own|own)\s+(?:hotel\s+)?rooms\b|\bchambres\s+(?:separees|individuelles)\b|\bchacune?\s+(?:sa|leur)\s+(?:propre\s+)?chambre\b|\beach\s+(?:want|wants|need|needs|get|gets|have|has)\s+(?:a|our|their|his|her)\s+(?:own\s+)?room\b/;
const ROOMS_ONE_RE = /\b(?:shar(?:e|ing)|partage(?:r|ra|rons|ons)?)\b[^.,;]{0,24}\b(?:a|one|1|the same|une|la meme)\s+(?:room|chambre)\b|\b(?:all|everyone|tous|toutes)\s+(?:in|dans)\s+(?:one|1|the same|une|la meme)\s+(?:room|chambre)\b|\b(?:just|only|seulement|juste)\s+(?:need\s+)?(?:one|1|a|une)\s+(?:room|chambre)\b/;
const ROOMS_N_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|un|une|deux|trois|quatre|cinq|six|sept|huit)\s+(?:(?:separate|hotel|double|twin|queen|king|standard)\s+)?(?:rooms?|chambres?)\b(?!\s+(?:condo|suite|apartment|appartement|house|cabin|chalet))/;
const ROOMS_SHARE_ONLY_RE = /^(?:(?:no|non|nope),?\s+)?(?:we(?:'ll| will| can)?\s+(?:all\s+)?share|we're sharing|on partage|on va partager|nous partagerons)[.!]*$/;
function roomsInText(text, opts = {}) {
  const t = foldRooms(text);
  if (!t || !/\b(?:rooms?|chambres?|share|sharing|partage)\b/.test(t)) return null;
  if (ROOMS_EACH_RE.test(t)) return { each: true };
  if (ROOMS_ONE_RE.test(t)) return { rooms: 1 };
  const m = ROOMS_N_RE.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ROOM_NUM[m[1]];
    if (Number.isInteger(n) && n >= 1) return { rooms: Math.min(MAX_ROOMS, n) };
  }
  if (/\b(?:a|une)\s+single\s+room\b|\bune\s+seule\s+chambre\b/.test(t)) return { rooms: 1 };
  if (opts.chat && ROOMS_SHARE_ONLY_RE.test(t)) return { rooms: 1 };
  return null;
}
// The chat: a short message about the rooms and nothing else. -> { ask: true } ("how many rooms did you assume?"),
// { rooms: n }, { each: true } or null (the other chat rules read the message).
const ROOMS_ASK_RE = /\bhow many (?:hotel )?rooms\b|\bcombien de chambres\b|\b(?:what|which) (?:number of )?rooms? (?:did|do|have) you\b|\brooms? (?:did|do|have) you (?:assume|pick|book|plan|count)\b/;
function roomsChat(message) {
  const t = foldRooms(message);
  if (!t || t.length > 90) return null;
  if (ROOMS_ASK_RE.test(t) && !/\b\d+\s+(?:rooms?|chambres?)\b/.test(t)) return { ask: true };
  // A question about something else ("does the hotel have rooms with a kitchen?") is not a change.
  if (/\?\s*$/.test(t) && !/^(?:can|could|peux|pouvez|peut-on)\b/.test(t)) return null;
  if (/\b(?:kitchen|pool|view|vue|cuisine|piscine|balcon\w*|accessible|pet|dog|chien)\b/.test(t)) return null;
  return roomsInText(t, { chat: true });
}
// ---- The stay's dates, said in the chat (2026-11-23) ----
// Only on a trip whose dates the visitor gave (ctx.given): "what dates is the hotel for?" -> { ask: true };
// "yes, book those nights", "use those dates" -> { confirm: true }; "we arrive Friday the 4th", "check out Monday",
// "arrive the night before", "stay an extra night" -> { arrive, leave } (worked out against the trip's days), or
// { error: 'past' | 'apart' | 'order' }. null: not about the stay's dates (the other chat rules read the message).
//   ctx: { given, tripStart, tripEnd, arrive, leave, today }  (arrive / leave: the stay's dates now, confirmed or proposed)
const SD_ASK_RE = /\b(?:what|which) (?:dates?|nights?|days?) (?:is|are|did you (?:book|pick|use) for) (?:the |our |my )?(?:hotel|stay|rooms?|booking|accommodation)\b|\b(?:hotel|stay|room|booking)\b[^.?!]{0,30}\bfor (?:what|which) (?:dates?|nights?)\b|\bwhen (?:do|would|will|are) we check(?:ing)?[- ]?(?:in|out)\b|\bwhat(?:'s| is| are) (?:the |our )?(?:hotel|stay|check[- ]?in|check[- ]?out|booking) dates?\b|\bquelles? (?:dates?|nuits?)\b[^.?!]{0,30}\b(?:hotel|sejour|hebergement|chambre)\b|\b(?:hotel|sejour|hebergement)\b[^.?!]{0,30}\bquelles? (?:dates?|nuits?)\b/;
const SD_CONFIRM_RE = /\b(?:book|use|confirm|keep|go with|reserve|take)\b[^.?!]{0,20}\b(?:those|these|the proposed|the suggested|the same) (?:nights?|dates?|stay dates?)\b|\b(?:those|these|the) (?:stay )?(?:dates?|nights?) (?:are|look|work|is|sound)s? (?:right|good|fine|correct|ok|okay|great)\b|\b(?:utilise[rz]?|confirme[rz]?|reserve[rz]?|garde[rz]?|prends|prenez)\b[^.?!]{0,20}\bces (?:dates?|nuits?)\b|\bces (?:dates?|nuits?) (?:sont bonnes|conviennent|me vont|nous vont)\b/;
const SD_ARRIVE_RE = /\b(?:arriv\w*|check(?:ing)?[- ]?in|get(?:ting)? (?:in|there)|com(?:e|ing) (?:in|up))\b/;
const SD_LEAVE_RE = /\b(?:check(?:ing)?[- ]?out|leav\w*|depart\w*|(?:head|go|driv)(?:ing)? (?:back )?home|part(?:ons|ir|ira|irons)?|repart\w*|quitt\w*)\b/;
const SD_WD = ['sun(?:day)?|dimanche', 'mon(?:day)?|lundi', 'tues?(?:day)?|mardi', 'wed(?:nesday)?|mercredi', 'thu(?:rs?(?:day)?)?|jeudi', 'fri(?:day)?|vendredi', 'sat(?:urday)?|samedi'];
const SD_MONTHS = ['jan(?:uary|vier)?', 'feb(?:ruary)?|fev(?:rier)?', 'mar(?:ch|s)?', 'apr(?:il)?|avr(?:il)?', 'may|mai', 'june?|juin', 'july?|juil(?:let)?', 'aug(?:ust)?|aout', 'sep(?:t|tember|tembre)?', 'oct(?:ober|obre)?', 'nov(?:ember|embre)?', 'dec(?:ember|embre)?'];
// The date a clause names, for the stay's start ('arrive') or end ('leave'), near the trip's own days. -> ISO or null.
function stayDateIn(clause, role, ctx) {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(clause);
  if (iso && validDate(iso[1])) return iso[1];
  const anchor = role === 'arrive' ? ctx.tripStart : ctx.tripEnd;
  const y = Number(anchor.slice(0, 4)), mo = Number(anchor.slice(5, 7));
  const real = (yy, mm, dd) => { const v = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; return validDate(v) && new Date(`${v}T12:00:00Z`).getUTCDate() === dd ? v : null; };
  for (let m = 0; m < 12; m++) {
    const a = new RegExp(`\\b(?:${SD_MONTHS[m]})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(clause) || new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er)?\\s+(?:of\\s+)?(?:${SD_MONTHS[m]})\\b`).exec(clause);
    if (a) return real(m + 1 < mo - 6 ? y + 1 : y, m + 1, Number(a[1]));
  }
  const nth = /\b(?:the|le)\s+(\d{1,2})(?:st|nd|rd|th|er)?\b(?!\s*(?:h\b|:|am\b|pm\b|heures?\b))/.exec(clause) || /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(clause);
  if (nth) { const d = real(y, mo, Number(nth[1])); if (d) return d; }
  if (role === 'arrive' && /\b(?:(?:the )?(?:night|day|evening) before|a (?:day|night) (?:early|earlier)|la veille|un jour plus tot|une nuit plus tot)\b/.test(clause)) return addDays(ctx.tripStart, -1);
  if (role === 'leave' && /\b(?:(?:the|a|one) (?:day|night) (?:after|later)|(?:the )?next (?:day|morning)|le lendemain|un jour plus tard)\b/.test(clause)) return addDays(ctx.leave || ctx.tripEnd, 1);
  for (let w = 0; w < 7; w++) {
    if (!new RegExp(`\\b(?:${SD_WD[w]})\\b`).test(clause)) continue;
    const wd = new Date(`${anchor}T12:00:00Z`).getUTCDay();
    return role === 'arrive' ? addDays(anchor, -((wd - w + 7) % 7)) : addDays(anchor, (w - wd + 7) % 7);
  }
  return null;
}
function stayDatesChat(message, ctx) {
  const t = foldRooms(message), c = ctx || {};
  if (!t || t.length > 140 || !c.given || !validDate(c.tripStart) || !validDate(c.tripEnd)) return null;
  if (SD_ASK_RE.test(t)) return { ask: true };
  const check = (arrive, leave) => {
    if (!validDate(arrive) || !validDate(leave)) return { error: 'order' };
    if (validDate(c.today) && arrive < c.today) return { error: 'past' };
    if (arrive > c.tripEnd || leave < c.tripStart) return { error: 'apart' };
    if (leave <= arrive || daysBetween(arrive, leave) > MAX_NIGHTS) return { error: 'order' };
    return { arrive, leave };
  };
  if (SD_CONFIRM_RE.test(t)) return validDate(c.arrive) && validDate(c.leave) ? { confirm: true, ...check(c.arrive, c.leave) } : null;
  // "stay an extra night", "add a night": one more night at the end.
  if (/\b(?:stay|add|book)\b[^.?!]{0,16}\b(?:an?|one) (?:extra|more|additional) night\b|\b(?:une|1) nuit de plus\b|\b(?:an?|one) (?:extra|more) night\b/.test(t) && validDate(c.arrive) && validDate(c.leave)) return check(c.arrive, addDays(c.leave, 1));
  // A time of day is not a date ("we arrive at 3 pm" belongs to the planner).
  const hasA = SD_ARRIVE_RE.test(t), hasL = SD_LEAVE_RE.test(t);
  if (!hasA && !hasL) return null;
  let a = null, l = null;
  if (hasA && hasL) {
    const ia = t.search(SD_ARRIVE_RE), il = t.search(SD_LEAVE_RE);
    const first = t.slice(0, Math.max(ia, il)), second = t.slice(Math.max(ia, il));
    a = stayDateIn(ia < il ? first : second, 'arrive', c); l = stayDateIn(ia < il ? second : first, 'leave', { ...c, leave: null });
  } else if (hasA) a = stayDateIn(t, 'arrive', c);
  else l = stayDateIn(t, 'leave', { ...c, leave: null });
  if (!a && !l) return null;
  const base = validDate(c.arrive) && validDate(c.leave) ? c : { arrive: c.tripStart, leave: c.tripEnd > c.tripStart ? c.tripEnd : addDays(c.tripStart, 1) };
  return check(a || base.arrive, l || base.leave);
}
// Other towns' stays join only when the plan's own towns give fewer than this many, and only within NEAR_KM.
const MIN_IN_TOWN = 3;
const NEAR_KM = 35;
const CLOSE_KM = 12;
const PLAN_KINDS = ['multi_day', 'day_plan', 'outing', 'itinerary'];

// Stay type fit (2026-11-20, Dayton): a campground or RV park is not a base for "wineries, easy walks and great food".
// A camping stay is the kind 'campground' (places-to-stay.js stayKind) or one whose units are all sites (unit_types).
// Unless the request asks for camping, camping stays join only when nothing else fits in the plan's towns or nearby;
// when it does, they come first.
const CAMP_UNITS = ['rv_site', 'tent_site'];
const CAMPING_RE = /(?:^|[^\p{L}])(?:camp(?:ing|ground|grounds|site|sites|er|ers)|rv|r\.v\.|rvs|motorhomes?|campervans?|trailers?|tents?|glamping|caravans?|vr|tentes?|pr[êe]t-[àa]-camper|roulottes?|campings?|caravan(?:e|es))(?=$|[^\p{L}])/iu;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) { return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000); }

// The optional trip inputs of POST /api/trip/plan: { arrive, leave, adults, kids, dog }, every key optional (dog: true
// when the visitor ticked "Bringing a dog", false when they left it unticked; absent = the request's own words decide).
// -> { value } (null when nothing was given) or { error }.
function parseTripStayInput(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (!isObj(raw)) return { error: 'stay must be an object with arrive, leave, adults, kids and dog.' };
  const extra = Object.keys(raw).filter((k) => !['arrive', 'leave', 'adults', 'kids', 'dog', 'pref', 'force', 'none', 'kidAges', 'rooms', 'via'].includes(k));
  if (extra.length) return { error: `stay may only contain arrive, leave, adults, kids and dog (not ${extra.join(', ')}).` };
  const out = {};
  for (const k of ['arrive', 'leave']) {
    if (raw[k] === undefined || raw[k] === null || raw[k] === '') continue;
    if (!validDate(raw[k])) return { error: `stay.${k} must be a date like 2026-12-18.` };
    out[k] = raw[k];
  }
  if (out.leave && !out.arrive) return { error: 'stay.leave needs stay.arrive.' };
  // Trip dates (2026-11-23): how the dates were given ('chat': said in the chat; else picked in a date field).
  if (raw.via !== undefined && raw.via !== null && raw.via !== '') {
    if (raw.via !== 'chat' && raw.via !== 'picked') return { error: 'stay.via must be "chat" or "picked".' };
    if (out.arrive) out.via = raw.via;
  }
  if (out.arrive && out.leave) {
    const nights = daysBetween(out.arrive, out.leave);
    if (nights < 1) return { error: 'stay.leave must be after stay.arrive.' };
    if (nights > MAX_NIGHTS) return { error: `A stay can be at most ${MAX_NIGHTS} nights.` };
  }
  if (raw.adults !== undefined && raw.adults !== null) {
    if (!intIn(raw.adults, 1, MAX_ADULTS)) return { error: `stay.adults must be a whole number from 1 to ${MAX_ADULTS}.` };
    out.adults = raw.adults;
  }
  if (raw.kids !== undefined && raw.kids !== null) {
    if (!intIn(raw.kids, 0, MAX_KIDS)) return { error: `stay.kids must be a whole number from 0 to ${MAX_KIDS}.` };
    out.kids = raw.kids;
  }
  // Rooms (2026-11-22): the number the visitor picked or said; absent = the labelled assumption (stay-booking-links.js).
  if (raw.rooms !== undefined && raw.rooms !== null) {
    if (!intIn(raw.rooms, 1, MAX_ROOMS)) return { error: `stay.rooms must be a whole number from 1 to ${MAX_ROOMS}.` };
    out.rooms = raw.rooms;
  }
  if (raw.dog !== undefined && raw.dog !== null) {
    if (typeof raw.dog !== 'boolean') return { error: 'stay.dog must be true or false.' };
    if (raw.dog) out.dog = true;
  }
  // Agent hooks (2026-11-22): stay.force asks for a place to stay on a plan with no night (a one-day plan, an evening):
  // one night from stay.arrive (or the plan's day); stay.none says the visitor wants no stay at all.
  for (const k of ['force', 'none']) {
    if (raw[k] === undefined || raw[k] === null) continue;
    if (typeof raw[k] !== 'boolean') return { error: `stay.${k} must be true or false.` };
    if (raw[k]) out[k] = true;
  }
  if (raw.kidAges !== undefined && raw.kidAges !== null) {
    if (!Array.isArray(raw.kidAges) || raw.kidAges.length > MAX_KIDS || !raw.kidAges.every((a) => intIn(a, 0, 17))) return { error: 'stay.kidAges must list ages from 0 to 17.' };
    out.kidAges = raw.kidAges.slice();
  }
  // Travel agent chat (2026-11-22, trip-chat.js): what the visitor said about the place to stay ("somewhere cheaper",
  // "a hotel with a pool", "stay in Naramata", "we already have a place"). Only these keys and values.
  if (raw.pref !== undefined && raw.pref !== null) {
    const p = parseStayPref(raw.pref);
    if (p.error) return p;
    if (p.value) out.pref = p.value;
  }
  return { value: Object.keys(out).length ? out : null };
}

// What a visitor can ask of a place to stay, and what its stay_info must say for a yes (drafts/stays-2026-11/
// stay-info-schema.md): pool, hot_tub, accessible are true / false / null; kitchen is all | some | none; pets is yes | some
// | no; parking is free | paid | none. Unknown (null, missing) is never a yes (2026-11-22: "a hotel with a pool" picked a
// stay with no word about why, and kitchen, an "all / some" fact, never matched).
const STAY_AMENITIES = ['pool', 'hot_tub', 'kitchen', 'pets', 'parking', 'accessible'];
const AMENITY_YES = {
  pool: (f) => f.pool === true, hot_tub: (f) => f.hot_tub === true, accessible: (f) => f.accessible === true,
  kitchen: (f) => f.kitchen === 'all' || f.kitchen === 'some' || f.kitchen === true,
  pets: (f) => f.pets === 'yes' || f.pets === 'some' || f.pets === true,
  parking: (f) => f.parking === 'free',
};
const AMENITY_NO = {
  pool: (f) => f.pool === false, hot_tub: (f) => f.hot_tub === false, accessible: (f) => f.accessible === false,
  kitchen: (f) => f.kitchen === 'none' || f.kitchen === false, pets: (f) => f.pets === 'no' || f.pets === false,
  parking: (f) => f.parking === 'paid' || f.parking === 'none',
};
const stayHas = (stay, key) => !!(AMENITY_YES[key] && AMENITY_YES[key](isObj(stay && stay.info) ? stay.info : {}));
const stayHasNot = (stay, key) => !!(AMENITY_NO[key] && AMENITY_NO[key](isObj(stay && stay.info) ? stay.info : {}));
// The amenities a preference asks for (at most two): pref.amenities, or the older single pref.amenity.
function prefAmenities(pref) {
  if (!pref) return [];
  const list = Array.isArray(pref.amenities) ? pref.amenities : pref.amenity ? [pref.amenity] : [];
  return [...new Set(list.filter((a) => STAY_AMENITIES.includes(a)))].slice(0, 2);
}
// "a hotel": hotels and resorts first when one fits (a motel only when none does); the reply says which it is.
const STAY_KIND_SETS = { hotel: ['hotel', 'resort'] };
const stayKindKey = (stay) => String((stay && (stay.kindKey || stay.kind)) || '').trim().toLowerCase();
function parseStayPref(raw) {
  if (!isObj(raw) || Object.keys(raw).some((k) => !['none', 'maxPrice', 'minPrice', 'amenity', 'amenities', 'kind', 'region'].includes(k))) return { error: 'stay.pref may only contain none, maxPrice, minPrice, amenity and region.' };
  const out = {};
  if (raw.none !== undefined) { if (raw.none !== true) return { error: 'stay.pref.none must be true.' }; out.none = true; }
  for (const k of ['maxPrice', 'minPrice']) if (raw[k] !== undefined) { if (!intIn(raw[k], 1, 4)) return { error: `stay.pref.${k} must be 1 to 4.` }; out[k] = raw[k]; }
  if (raw.amenity !== undefined) { if (!STAY_AMENITIES.includes(raw.amenity)) return { error: 'stay.pref.amenity is not known.' }; out.amenity = raw.amenity; }
  if (raw.amenities !== undefined) {
    if (!Array.isArray(raw.amenities) || raw.amenities.length < 1 || raw.amenities.length > 2 || !raw.amenities.every((a) => STAY_AMENITIES.includes(a)) || new Set(raw.amenities).size !== raw.amenities.length) return { error: 'stay.pref.amenities must list one or two known amenities.' };
    out.amenities = raw.amenities.slice();
  }
  if (raw.kind !== undefined) { if (!Object.prototype.hasOwnProperty.call(STAY_KIND_SETS, raw.kind)) return { error: 'stay.pref.kind is not known.' }; out.kind = raw.kind; }
  if (raw.region !== undefined) { if (typeof raw.region !== 'string' || !/^[a-z-]{2,24}$/.test(raw.region)) return { error: 'stay.pref.region must be a town.' }; out.region = raw.region; }
  return { value: Object.keys(out).length ? out : null };
}
// The stays a preference leaves (the price band, an amenity, a town). Unknown facts never pass a stated preference.
function staysForPref(stays, pref) {
  if (!pref || !Array.isArray(stays)) return stays;
  return stays.filter((st) => {
    const f = isObj(st.info) ? st.info : {};
    if (pref.maxPrice && !(intIn(f.price_level, 1, 4) && f.price_level <= pref.maxPrice)) return false;
    if (pref.minPrice && !(intIn(f.price_level, 1, 4) && f.price_level >= pref.minPrice)) return false;
    if (!prefAmenities(pref).every((a) => stayHas(st, a))) return false;
    if (pref.region && st.region !== pref.region) return false;
    return true;
  });
}

// Straight-line distance in km.
function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const coords = (lat, lng) => {
  const a = Number(lat), b = Number(lng);
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined && Number.isFinite(a) && Number.isFinite(b) && (a || b) ? { lat: a, lng: b } : null;
};

// Every venue stop of a plan: [{ lat, lng, region }] (lat/lng null when the place has no map location).
function planStops(plan) {
  if (!plan) return [];
  const list = Array.isArray(plan.days) && plan.days.length ? plan.days.flatMap((d) => (d && d.stops) || [])
    : ((plan.itinerary && plan.itinerary.stops) || (plan.outing && plan.outing.stops) || []);
  const out = [];
  for (const s of list) {
    const v = s && s.venue;
    if (!v || !v.region) continue;
    out.push({ ...(coords(v.latitude, v.longitude) || { lat: null, lng: null }), region: v.region });
  }
  return out;
}
// Who is coming, from the plan the API returns: its intent's features (kid_friendly, dog_friendly) and the "understood"
// party labels ("with kids", "with a dog").
function partyOf(plan) {
  const features = (plan.intent && Array.isArray(plan.intent.features)) ? plan.intent.features : [];
  const party = (plan.understood && Array.isArray(plan.understood.party)) ? plan.understood.party.join(' ') : '';
  const own = (plan.intent && plan.intent.party) || {};
  return {
    kids: !!own.kids || features.includes('kid_friendly') || /\b(?:kids?|children|family|toddlers?|teens?)\b/i.test(party),
    dog: !!own.dog || features.includes('dog_friendly') || /\b(?:dogs?|pets?|pup)\b/i.test(party),
  };
}
function budgetOf(intent) {
  const b = intent && intent.budget;
  const list = Array.isArray(b) ? b : b ? [b] : [];
  return ['budget', 'upscale', 'moderate'].find((x) => list.includes(x)) || null;
}

// Trip dates and lodging dates are two things (2026-11-23, Dayton: the days said Dec 5 and 6, the stay said "Dates not
// set" and its link had no dates). The trip's dates (opts.tripDates: { start, end, source, assumed? }, server.js
// tripDatesOf) are what the visitor gave for the days. The lodging dates are the check-in and check-out:
//   stayStatus 'confirmed'  the visitor entered or confirmed them (stay.arrive + stay.leave): the only dates a booking
//                           link ever carries;
//   stayStatus 'proposed'   the trip has given dates and the stay is worked out from them (day 1 to the last day), shown
//                           for a yes before any provider gets a date;
//   none                    no dates given, or only dates the planner assumed ("a weekend", a month): "Dates not set".
// A date already past (before `today`, the site's own day) is never sent: datesPast.
function stayDateState(i, arrive, leave, tripDates, today) {
  const td = tripDates && validDate(tripDates.start) ? tripDates : null;
  const out = {};
  if (td) { out.tripStart = td.start; out.tripEnd = validDate(td.end) && td.end >= td.start ? td.end : td.start; out.tripSource = td.assumed ? 'assumed' : td.source || 'request'; }
  const confirmed = !!(i.arrive && i.leave);
  const past = validDate(today) && (confirmed ? validDate(arrive) && arrive < today : !!td && td.start < today);
  if (confirmed) { out.stayStatus = 'confirmed'; if (past) out.datesPast = true; }
  else if (td && !td.assumed) { if (past) out.datesPast = true; else out.stayStatus = 'proposed'; }
  return out;
}

// What the plan and the inputs say about the trip, or null when no base is needed (a plan of one day with no night, a
// plan with no venue stops, or not a plan at all). centre: the middle of the stops that have a map location (null when
// none has one; the stays are then ranked without distance, in the plan's towns only).
//   plan: the planner's result; input: parseTripStayInput's value (or null); today: 'YYYY-MM-DD'.
// opts (Build My Trip V4 only, 2026-11-21; without opts.v4 nothing below changes):
//   minArrive: the earliest arrival for a trip with no dates given (today before noon in the site's time, else
//   tomorrow), so the stay is never booked for a day already past; text: the request, for the stay type fit.
function tripStayContext(plan, input, today, opts = {}) {
  if (!plan || !PLAN_KINDS.includes(plan.kind)) return null;
  const stops = planStops(plan);
  if (!stops.length) return null;
  const i = input || {};
  const planDays = Array.isArray(plan.days) && plan.days.length ? plan.days.length : 1;
  const firstDate = ((plan.schedule || []).find((r) => r && validDate(r.date)) || {}).date || (validDate(plan.listDate) ? plan.listDate : null);
  let arrive = i.arrive || firstDate || (validDate(today) ? today : null);
  if (opts.v4 && !i.arrive && validDate(opts.minArrive) && (!arrive || arrive < opts.minArrive)) arrive = opts.minArrive;
  // Round 5 (2026-11-22): no dates given -- never before a stop reopens for the season (opts.notBefore), and a
  // "weekend" starts on the coming Saturday (Friday for a 3-day weekend).
  if (opts.v4 && !i.arrive && !firstDate) {
    if (validDate(opts.notBefore) && (!arrive || arrive < opts.notBefore)) arrive = opts.notBefore;
    if (arrive && /\b(?:week-?ends?|fin de semaine|fins de semaine)\b/i.test(String(opts.text || ''))) {
      const want = planDays >= 3 ? 5 : 6; // 5 = Friday, 6 = Saturday (getUTCDay)
      const wd = new Date(`${arrive}T12:00:00Z`).getUTCDay();
      arrive = addDays(arrive, (want - wd + 7) % 7);
    }
  }
  const nights = i.arrive && i.leave ? daysBetween(i.arrive, i.leave) : Math.max(planDays - 1, i.force ? 1 : 0);
  if (!(nights >= 1) || !arrive) return null;
  const leave = i.leave || addDays(arrive, nights);
  const months = [];
  for (let n = 0; n < nights; n++) { const m = Number(addDays(arrive, n).slice(5, 7)); if (!months.includes(m)) months.push(m); }
  // The town with the most stops (ties: the one reached first), then the plan's other towns.
  const counts = new Map();
  for (const s of stops) counts.set(s.region, (counts.get(s.region) || 0) + 1);
  const regions = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const located = stops.filter((s) => s.lat !== null);
  const centre = located.length ? { lat: located.reduce((t, s) => t + s.lat, 0) / located.length, lng: located.reduce((t, s) => t + s.lng, 0) / located.length } : null;
  const party = partyOf(plan);
  const kids = Number.isInteger(i.kids) ? i.kids : null;
  // Round 5 (2026-11-22: "two kids" showed "2 kids" with no adults): kids with no adult count are 2 adults plus the kids,
  // said as "2 adults, 2 kids" (adultsAssumed: the visitor can change it under Dates and guests).
  const adultsAssumed = !Number.isInteger(i.adults) && kids > 0;
  const adults = Number.isInteger(i.adults) ? i.adults : adultsAssumed ? 2 : null;
  // Kids: the party size when given, else the request's own words ("with kids").
  const withKids = kids !== null ? kids > 0 : !!party.kids;
  const guests = adults !== null ? adults + (kids || 0) : null;
  return {
    arrive, leave, nights, months, adults, ...(adultsAssumed ? { adultsAssumed: true } : {}), kids, guests, withKids, dog: i.dog === true || !!party.dog, budget: budgetOf(plan.intent),
    centre, primaryRegion: regions[0], regions, datesGiven: !!(i.arrive && i.leave), camping: wantsCamping(plan),
    ...stayDateState(i, arrive, leave, opts.tripDates, today),
    ...(opts.v4 ? { v4: true, couple: V4_COUPLE_RE.test(v4Words(plan, opts.text)), budgetStay: V4_BUDGET_STAY_RE.test(v4Words(plan, opts.text)) } : {}),
  };
}

// V4 stay type fit (2026-11-21, Dayton: a college residence was the base for a couple's wine trip). A room for students,
// conferences or shared dorms (a college or university residence, a hostel, a dorm) is a base only when the request asks
// for a budget, a hostel or student housing, or nothing else fits. A couple's trip (partner, romantic, honeymoon,
// anniversary...) puts B&Bs, inns, resorts, hotels and lodges first, then the rest. Judged from the stay's kind, name and
// unit types only.
const V4_DORM_RE = /\b(?:residences?|dorms?|dormitor(?:y|ies)|hostels?|college|university|campus|students?|conference cent(?:re|er)|backpackers?|bunkhouse)\b/i;
const V4_DORM_UNITS = ['dorm', 'dorm_bed', 'shared_room', 'bunk'];
const V4_BUDGET_STAY_RE = /\b(?:budget|cheap|cheapest|inexpensive|affordable|low cost|hostels?|backpack(?:er|ers|ing)?|students?|dorms?|petit budget|auberge de jeunesse)\b/i;
const V4_COUPLE_RE = /\b(?:partner|partners|romantic|romance|couples?|honeymoon|anniversary|wife|husband|girlfriend|boyfriend|fianc[eé]e?|spouse|date night|getaway for two|for two|en amoureux|romantique|lune de miel|anniversaire de mariage|conjointe?|ma blonde|mon chum)\b/i;
const V4_COUPLE_KINDS = ['b&b', 'inn', 'resort', 'hotel', 'lodge'];
function v4Words(plan, text) { return [text, plan && plan.query, ...(((plan && plan.understood) || {}).occasion ? [plan.understood.occasion] : [])].filter((x) => typeof x === 'string').join(' '); }
function v4DormStay(stay) {
  const units = isObj(stay.info) && Array.isArray(stay.info.unit_types) ? stay.info.unit_types : [];
  return V4_DORM_RE.test(`${stay.name || ''} ${stay.kind || ''}`) || (units.length > 0 && units.some((u) => V4_DORM_UNITS.includes(u)));
}
function v4StayKindKey(stay) { return String(stay.kindKey || stay.kind || '').trim().toLowerCase(); }
// The request asks for camping: its own words, or the interpreter's interests / activities.
function wantsCamping(plan) {
  if (!plan) return false;
  const words = [plan.query, ...(((plan.understood || {}).interests) || []), ...(((plan.intent || {}).activities) || [])].filter((x) => typeof x === 'string').join(' ');
  return CAMPING_RE.test(words);
}
function isCampingStay(stay) {
  const kind = String(stay.kindKey || stay.kind || '').trim().toLowerCase();
  if (kind === 'campground' || kind === 'camping') return true;
  const units = isObj(stay.info) && Array.isArray(stay.info.unit_types) ? stay.info.unit_types : [];
  return units.length > 0 && units.every((u) => CAMP_UNITS.includes(u) || u === 'glamping');
}

// -> the reason a stay is dropped ('open_months', 'max_guests', 'adults_only', 'pets', 'min_nights') or null.
function stayFails(info, ctx) {
  const f = isObj(info) ? info : {};
  if (Array.isArray(f.open_months) && f.open_months.length && ctx.months.some((m) => !f.open_months.includes(m))) return 'open_months';
  if (ctx.guests !== null && intIn(f.max_guests, 1, 1000) && f.max_guests < ctx.guests) return 'max_guests';
  if (ctx.withKids && f.adults_only === true) return 'adults_only';
  if (ctx.dog && f.pets === 'no') return 'pets';
  if (intIn(f.min_nights, 1, 1000) && f.min_nights > ctx.nights) return 'min_nights';
  return null;
}

const PRICE_FITS = { budget: [1, 2], moderate: [2, 3], upscale: [3, 4] };
const PRICE_REASON = {
  budget: { text: 'Fits a budget', textFr: 'Adapté à un petit budget' },
  moderate: { text: 'Mid-range price', textFr: 'Prix moyen' },
  upscale: { text: 'Upscale', textFr: 'Haut de gamme' },
};
function distanceReason(d) {
  if (d < 1) return { key: 'distance', text: 'Under 1 km from your stops', textFr: 'À moins de 1 km de vos arrêts' };
  const n = d < 10 ? Math.round(d * 10) / 10 : Math.round(d);
  return { key: 'distance', text: `${n} km from your stops`, textFr: `À ${String(n).replace('.', ',')} km de vos arrêts` };
}

// Score one stay that passed the filters. -> { score, distanceKm, matches: [reason] }
function scoreStay(stay, ctx) {
  const f = isObj(stay.info) ? stay.info : {};
  const d = ctx.centre ? km(ctx.centre, stay.coords) : null;
  let score = d === null ? 0 : d;
  const matches = [];
  if (stay.region !== ctx.primaryRegion) score += ctx.regions.includes(stay.region) ? 1 : 3;
  if (ctx.dog && (f.pets === 'yes' || f.pets === 'some')) {
    score -= f.pets === 'yes' ? 1.5 : 1;
    matches.push(f.pets === 'yes' ? { key: 'pets', text: 'Pets welcome', textFr: 'Animaux acceptés' } : { key: 'pets', text: 'Pets welcome in some units', textFr: 'Animaux acceptés dans certaines unités' });
  }
  if (ctx.withKids && f.kid_friendly === true) { score -= 1.5; matches.push({ key: 'kids', text: 'Family-friendly', textFr: 'Pour les familles' }); }
  if (ctx.budget && intIn(f.price_level, 1, 4)) {
    if (PRICE_FITS[ctx.budget].includes(f.price_level)) { score -= 1.5; matches.push({ key: 'price', ...PRICE_REASON[ctx.budget] }); }
    else if (Math.abs(f.price_level - PRICE_FITS[ctx.budget][0]) >= 2 && Math.abs(f.price_level - PRICE_FITS[ctx.budget][1]) >= 2) score += 2;
    // Planner round 4 (a budget trip's "See 2 more" were the Fairmont Chateau and the Sundial): on a budget trip a $$$ or
    // $$$$ stay comes after every stay that fits the budget or has no price on file.
    if (ctx.budget === 'budget' && f.price_level >= 3) score += 30;
  }
  if (ctx.nights >= 4 && (f.kitchen === 'all' || f.kitchen === 'some')) {
    score -= f.kitchen === 'all' ? 1 : 0.5;
    matches.push(f.kitchen === 'all' ? { key: 'kitchen', text: 'Kitchen', textFr: 'Cuisine' } : { key: 'kitchen', text: 'Kitchen in some units', textFr: 'Cuisine dans certaines unités' });
  }
  if (ctx.guests !== null && ctx.guests >= 5 && !intIn(f.max_guests, 1, 1000)) score += 1.5;
  if (f.confidence === 'high') score -= 0.5;
  else if (f.confidence === 'medium') score -= 0.25;
  if (stay.photo) score -= 0.75;
  if (ctx.v4) {
    // Rooms for students or conferences, and dorms: last unless a budget, hostel or student stay was asked for.
    if (!ctx.budgetStay && v4DormStay(stay)) score += 40;
    // A couple's trip: a B&B, inn, resort, hotel or lodge before a motel, guest house or cabin.
    if (ctx.couple) {
      const k = v4StayKindKey(stay);
      if (V4_COUPLE_KINDS.includes(k)) { score -= k === 'b&b' || k === 'inn' || k === 'resort' ? 3 : 2; }
      else score += 3;
      // Round 5 (2026-11-22: a couple's Penticton wine weekend got Tiki Shores, "Sleeps 8"): a family resort and big
      // multi-bedroom suites come after the places made for two, unless kids are coming.
      if (!ctx.withKids) {
        const words = `${stay.name || ''} ${stay.description || ''}`.toLowerCase();
        if (/\b(?:family|families|kids?|children|waterslides?|water ?park|playground|mini golf|arcade)\b/.test(words)) score += 3;
        if ((intIn(f.max_guests, 6, 1000)) || intIn(f.bedrooms_max, 3, 100)) score += 2.5;
      }
    }
  }
  // A camping trip: campgrounds and RV parks first.
  if (ctx.camping) {
    if (stay.camping) { score -= 5; matches.unshift({ key: 'camping', text: 'Camping', textFr: 'Camping' }); } else score += 5;
  }
  return { score, distanceKm: d, matches };
}

// The card's view of a stay.
function stayCard(stay, scored) {
  const f = isObj(stay.info) ? stay.info : {};
  const reasons = [scored.distanceKm === null ? { key: 'town', text: `In ${stay.regionLabel || stay.region}`, textFr: `À ${stay.regionLabel || stay.region}` } : distanceReason(scored.distanceKm)];
  if (scored.matches.length) reasons.push(scored.matches[0]);
  return {
    id: stay.id, name: stay.name, region: stay.region, regionLabel: stay.regionLabel || stay.region,
    kind: stay.kind || null, kindFr: stay.kindFr || null, photo: stay.photo || null, url: stay.url, urlFr: stay.urlFr || null,
    sleeps: intIn(f.max_guests, 1, 1000) ? f.max_guests : null,
    priceLevel: intIn(f.price_level, 1, 4) ? f.price_level : null,
    priceBand: intIn(f.price_level, 1, 4) ? '$'.repeat(f.price_level) : null,
    distanceKm: scored.distanceKm === null ? null : Math.round(scored.distanceKm * 10) / 10,
    reasons,
  };
}

// stays: [{ id, name, region, regionLabel, kind, kindFr, latitude, longitude, photo, url, urlFr, info }].
// -> { pick, alternatives } (up to 2 alternatives) or null when no stay fits.
function pickTripStays(ctx, stays) {
  if (!ctx || !Array.isArray(stays)) return null;
  const usable = stays.map((s) => ({ ...s, coords: coords(s.latitude, s.longitude), camping: isCampingStay(s) })).filter((s) => s.coords && Number.isInteger(s.id) && s.url && !stayFails(s.info, ctx));
  const poolOf = (list) => {
    let pool = list.filter((s) => ctx.regions.includes(s.region));
    // Planner round 4 (2026-11-22; "a cheaper hotel" for a Whistler Village plan was the Pemberton Hotel, 30 km away): a
    // stay in another town joins only when it is close (CLOSE_KM), or when the plan's own towns have none that fit.
    if (pool.length < MIN_IN_TOWN && ctx.centre) pool = pool.concat(list.filter((s) => !ctx.regions.includes(s.region) && km(ctx.centre, s.coords) <= (pool.length ? CLOSE_KM : NEAR_KM)));
    return pool;
  };
  // Not a camping trip: rooms first; camping stays only when no other stay fits the plan's towns or nearby.
  let pool = ctx.camping ? poolOf(usable) : poolOf(usable.filter((s) => !s.camping));
  if (!pool.length && !ctx.camping) pool = poolOf(usable);
  // V4: no student residence, hostel or dorm among the three shown when other stays fit (unless asked for).
  if (ctx.v4 && !ctx.budgetStay && pool.some((s) => !v4DormStay(s))) pool = pool.filter((s) => !v4DormStay(s));
  if (!pool.length) return null;
  const ranked = pool.map((s) => ({ s, r: scoreStay(s, ctx) })).sort((a, b) => a.r.score - b.r.score || a.s.id - b.s.id).slice(0, 3);
  const cards = ranked.map(({ s, r }) => stayCard(s, r));
  return { pick: cards[0], alternatives: cards.slice(1) };
}

// The trip's rooms: { rooms, roomsAssumed? } (said or picked, else the labelled assumption), {} when no adult count.
function tripRooms(adults, given) {
  const r = stayRoomsFor(Number.isInteger(adults) ? adults : null, Number.isInteger(given) ? given : null);
  return r ? { rooms: r.rooms, ...(r.assumed ? { roomsAssumed: true } : {}) } : {};
}
// The plan's "whereToStay" block, or null. The trip's dates and party (for booking links later) and the chosen stay.
function whereToStay(plan, input, stays, today, opts = {}) {
  const ctx = tripStayContext(plan, input, today, opts);
  if (!ctx) return null;
  // Chat preference (input.pref): "we already have a place" -> no stay; else only the stays it leaves, and "stay in
  // Naramata" makes that town the base (other towns' stays still join only within NEAR_KM when it has too few).
  if (input && input.none) return null; // agent hooks: "no stay"
  const pref = input && input.pref;
  if (pref && pref.none) return null;
  const askedTown = ctx.primaryRegion;
  if (pref && pref.region) { ctx.regions = [pref.region]; ctx.primaryRegion = pref.region; }
  const ams = prefAmenities(pref);
  const kindSet = pref && pref.kind ? STAY_KIND_SETS[pref.kind] : null;
  // "a hotel": only hotels and resorts when one of the plan's towns has one that fits; else every kind.
  const withKind = (list) => {
    if (!kindSet) return list;
    const ok = list.filter((x) => kindSet.includes(stayKindKey(x)));
    return ok.some((x) => ctx.regions.includes(x.region)) ? ok : list;
  };
  let picked = pickTripStays(ctx, withKind(pref ? staysForPref(stays, pref) : stays));
  // An amenity asked for (2026-11-22): only stays whose facts say yes. None in the plan's towns (or just outside them):
  // the nearest town that has one (elsewhere); none there either: the closest stay that does not say no, marked "not
  // confirmed". Never a stay passed off as having it.
  let amenity = null;
  if (ams.length) {
    amenity = { keys: ams, confirmed: !!picked, town: pref && pref.region ? pref.region : askedTown };
    if (!picked) {
      const rest = { ...pref }; delete rest.region; delete rest.area; delete rest.amenity; delete rest.amenities;
      const yesAll = staysForPref(stays, { ...rest, amenities: ams });
      // "Near" is measured from the plan's stops; when none has a map location, from the middle of the asked town's stays.
      const townStays = stays.filter((x) => x.region === amenity.town).map((x) => coords(x.latitude, x.longitude)).filter(Boolean);
      const from = ctx.centre || (townStays.length ? { lat: townStays.reduce((t, c) => t + c.lat, 0) / townStays.length, lng: townStays.reduce((t, c) => t + c.lng, 0) / townStays.length } : null);
      const near = from ? yesAll.map((x) => ({ x, c: coords(x.latitude, x.longitude) })).filter((o) => o.c && km(from, o.c) <= ELSEWHERE_KM).sort((a, b) => km(from, a.c) - km(from, b.c))[0] : null;
      if (near) {
        const ctx2 = { ...ctx, regions: [near.x.region], primaryRegion: near.x.region };
        picked = pickTripStays(ctx2, withKind(yesAll.filter((x) => x.region === near.x.region)));
        if (picked) { amenity.confirmed = true; amenity.elsewhere = true; }
      }
      if (!picked) {
        const loose = { ...pref }; delete loose.amenity; delete loose.amenities;
        const maybe = staysForPref(stays, loose).filter((x) => !ams.some((a) => stayHasNot(x, a)));
        picked = pickTripStays(ctx, withKind(maybe)) || pickTripStays(ctx, withKind(staysForPref(stays, loose)));
        amenity.confirmed = false;
      }
    }
  }
  if (!picked) return null;
  // Each card says which of the asked amenities it has (the card's chips), and the block which kind was asked for.
  const byId = new Map(stays.map((x) => [x.id, x]));
  const tag = (card) => ({ ...card, kindKey: stayKindKey(byId.get(card.id)) || null, ...(ams.length ? { has: ams.filter((a) => stayHas(byId.get(card.id), a)) } : {}) });
  const pick = tag(picked.pick);
  return {
    stayId: picked.pick.id,
    trip: { arrive: ctx.arrive, leave: ctx.leave, nights: ctx.nights, adults: ctx.adults, ...(ctx.adultsAssumed ? { adultsAssumed: true } : {}), kids: ctx.kids, ...(input && Array.isArray(input.kidAges) && input.kidAges.length === ctx.kids ? { kidAges: input.kidAges.slice() } : {}), ...tripRooms(ctx.adults, input && input.rooms), dog: !!ctx.dog, datesGiven: ctx.datesGiven,
      ...(ctx.stayStatus ? { stayStatus: ctx.stayStatus } : {}), ...(ctx.datesPast ? { datesPast: true } : {}), ...(ctx.tripStart ? { tripStart: ctx.tripStart, tripEnd: ctx.tripEnd, tripSource: ctx.tripSource } : {}) },
    pick,
    alternatives: picked.alternatives.map(tag),
    ...(amenity ? { amenity } : {}),
    ...(kindSet ? { kindAsked: pref.kind, kindMatched: kindSet.includes(pick.kindKey) } : {}),
  };
}
// How far the "nearest town with one" may be from the plan's stops.
const ELSEWHERE_KM = 60;

module.exports = {
  MAX_NIGHTS, MAX_ADULTS, MAX_KIDS, NEAR_KM, MIN_IN_TOWN,
  roomsInText, roomsChat, tripRooms, MAX_ROOMS,
  stayDatesChat, stayDateState,
  parseTripStayInput, parseStayPref, staysForPref, STAY_AMENITIES, stayHas, stayHasNot, prefAmenities, STAY_KIND_SETS, tripStayContext, partyOf, stayFails, scoreStay, pickTripStays, whereToStay, planStops, km, addDays, daysBetween,
  wantsCamping, isCampingStay, CAMPING_RE,
  v4DormStay, V4_COUPLE_RE, V4_BUDGET_STAY_RE,
};
