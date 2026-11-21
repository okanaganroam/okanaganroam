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
// Other towns' stays join only when the plan's own towns give fewer than this many, and only within NEAR_KM.
const MIN_IN_TOWN = 3;
const NEAR_KM = 35;
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
  const extra = Object.keys(raw).filter((k) => !['arrive', 'leave', 'adults', 'kids', 'dog'].includes(k));
  if (extra.length) return { error: `stay may only contain arrive, leave, adults, kids and dog (not ${extra.join(', ')}).` };
  const out = {};
  for (const k of ['arrive', 'leave']) {
    if (raw[k] === undefined || raw[k] === null || raw[k] === '') continue;
    if (!validDate(raw[k])) return { error: `stay.${k} must be a date like 2026-12-18.` };
    out[k] = raw[k];
  }
  if (out.leave && !out.arrive) return { error: 'stay.leave needs stay.arrive.' };
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
  if (raw.dog !== undefined && raw.dog !== null) {
    if (typeof raw.dog !== 'boolean') return { error: 'stay.dog must be true or false.' };
    if (raw.dog) out.dog = true;
  }
  return { value: Object.keys(out).length ? out : null };
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
  const nights = i.arrive && i.leave ? daysBetween(i.arrive, i.leave) : planDays - 1;
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
  const adults = Number.isInteger(i.adults) ? i.adults : null;
  const kids = Number.isInteger(i.kids) ? i.kids : null;
  // Kids: the party size when given, else the request's own words ("with kids").
  const withKids = kids !== null ? kids > 0 : !!party.kids;
  const guests = adults !== null ? adults + (kids || 0) : null;
  return {
    arrive, leave, nights, months, adults, kids, guests, withKids, dog: i.dog === true || !!party.dog, budget: budgetOf(plan.intent),
    centre, primaryRegion: regions[0], regions, datesGiven: !!(i.arrive && i.leave), camping: wantsCamping(plan),
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
    if (pool.length < MIN_IN_TOWN && ctx.centre) pool = pool.concat(list.filter((s) => !ctx.regions.includes(s.region) && km(ctx.centre, s.coords) <= NEAR_KM));
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

// The plan's "whereToStay" block, or null. The trip's dates and party (for booking links later) and the chosen stay.
function whereToStay(plan, input, stays, today, opts = {}) {
  const ctx = tripStayContext(plan, input, today, opts);
  if (!ctx) return null;
  const picked = pickTripStays(ctx, stays);
  if (!picked) return null;
  return {
    stayId: picked.pick.id,
    trip: { arrive: ctx.arrive, leave: ctx.leave, nights: ctx.nights, adults: ctx.adults, kids: ctx.kids, dog: !!ctx.dog, datesGiven: ctx.datesGiven },
    pick: picked.pick,
    alternatives: picked.alternatives,
  };
}

module.exports = {
  MAX_NIGHTS, MAX_ADULTS, MAX_KIDS, NEAR_KM, MIN_IN_TOWN,
  parseTripStayInput, tripStayContext, partyOf, stayFails, scoreStay, pickTripStays, whereToStay, planStops, km, addDays, daysBetween,
  wantsCamping, isCampingStay, CAMPING_RE,
  v4DormStay, V4_COUPLE_RE, V4_BUDGET_STAY_RE,
};
