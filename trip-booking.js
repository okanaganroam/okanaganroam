'use strict';
// Build My Trip "Book your trip" (2026-11-20): the trip's estimated total and the "Book my trip" step-through, behind the
// same TRIP_STAYS / ?stays=1 switch as "Where to stay" (server.js withTripStays). Pure functions: no database, no network.
//
// estimate: { low, high, currency: 'CAD', people, peopleAssumed, kids, showTotal, openLow, openHigh, parts, unknown, notes }
//   Built only from prices we already have, in whole dollars, before tax:
//   - stay: the stay's price_level band (trip-site.js tripEstimate.stayNight) x nights x rooms. Rooms = party / Sleeps,
//     rounded up (one unit when Sleeps is unknown, with a note for a party over 2). A band with no edge (under $150,
//     $400+) leaves that end open: the total then reads "Up to" / "From", never a made-up edge.
//   - tastings / drinks / activities: a stop's own listed price per person (stop.venue.cost: tasting fees, flights,
//     cocktails, tour and admission prices, researched stopPrices) x people. Free (free tasting, free entry, free tour,
//     by donation) counts as $0.
//   - meals: a restaurant, pub or café stop's own listed price per person when it has one, else its $-$$$$ level mapped
//     to a per-person range (trip-site.js tripEstimate.mealPerPerson; source documented there) x people.
//   - anything else (no price, a price per room/lane/boat) is named in `unknown` and NOT counted.
//   showTotal: false when too little is known (no stay price, or more unpriced paid-type stops than priced ones); the box
//   then shows the known parts only.
//
// bookingSteps: [{ kind: 'stay' | 'venue', id, name, label, labelFr, url, affiliate, rel, link }] -- the stay's main
//   booking link first, then the plan's stops that have a booking/reservation link, in plan order, once each (by venue
//   id and by URL).

const SITE = require('./trip-site.js');
const tripBudget = require('./trip-budget.js');
const tripLate = require('./trip-late-arrival');

const CONFIG = SITE.tripEstimate;
const TASTING_TYPES = ['winery', 'brewery', 'distillery'];
const MEAL_TYPES = ['restaurant', 'pub', 'cafe'];
// Public outdoor places: an unpriced one is still listed as "price not listed", but it does not stop the total showing.
const OUTDOOR_TYPES = ['outdoor', 'beach'];
const PARTS = {
  stay: { label: 'Stay', labelFr: 'Hébergement' },
  tastings: { label: 'Tastings', labelFr: 'Dégustations' },
  drinks: { label: 'Drinks', labelFr: 'Consommations' },
  activities: { label: 'Activities', labelFr: 'Activités' },
  meals: { label: 'Meals', labelFr: 'Repas' },
};
const ORDER = ['stay', 'tastings', 'drinks', 'activities', 'meals'];

const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function planStopList(plan) {
  if (!plan) return [];
  return Array.isArray(plan.days) && plan.days.length ? plan.days.flatMap((d) => (d && d.stops) || [])
    : ((plan.itinerary && plan.itinerary.stops) || (plan.outing && plan.outing.stops) || []);
}

// The trip's months (one per night).
function nightMonths(trip) {
  if (!trip || !isDate(trip.arrive) || !intIn(trip.nights, 1, 60)) return [];
  const out = [];
  for (let n = 0; n < trip.nights; n++) {
    const d = new Date(`${trip.arrive}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    const m = d.getUTCMonth() + 1;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

// One stop's price per person in whole-cent terms: { low, high } in cents, { free: true }, or null (not known).
function stopPerPerson(venue, cfg) {
  const v = venue || {};
  const c = v.cost;
  if (c && Number.isSafeInteger(c.cents) && c.cents > 0) {
    // A price for a room, a lane, a group or a boat is not a price per person: never multiplied, never counted.
    if (c.perGroup || (c.label === 'Rental' && c.unit)) return null;
    return { low: c.cents, high: c.cents };
  }
  if (v.freeTasting || v.freeTour || v.byDonation || v.freeEntry) return { free: true };
  if (MEAL_TYPES.includes(v.type) && intIn(v.price, 1, 4)) {
    const r = ((cfg.mealPerPerson || {})[v.type] || {})[v.price];
    if (Array.isArray(r) && r.length === 2) return { low: r[0] * 100, high: r[1] * 100, mapped: true };
  }
  return null;
}
function partKey(type, cost) {
  if (MEAL_TYPES.includes(type)) return 'meals';
  if (TASTING_TYPES.includes(type)) return 'tastings';
  if (type === 'cocktail' || (cost && cost.label === 'Cocktail')) return 'drinks';
  return 'activities';
}

// The stay part for one stay card ({ priceLevel, sleeps }) and the trip. -> part or null (no price band).
function stayPart(card, trip, people, cfg = CONFIG) {
  const level = card && intIn(card.priceLevel, 1, 4) ? card.priceLevel : null;
  const nights = trip && intIn(trip.nights, 1, 60) ? trip.nights : null;
  if (!level || !nights) return null;
  const band = cfg.stayNight[level];
  const sleeps = intIn(card.sleeps, 1, 1000) ? card.sleeps : null;
  // A split stay (2026-11-23, trip-late-arrival.js): each booking's own rooms for its own nights (1 room x 2 nights +
  // 1 room x 1 night), by the same Sleeps rule. Said in the estimate's notes.
  const sp = trip.split && trip.split.mode === 'split' && Array.isArray(trip.split.parts) && trip.split.parts.length === 2 ? trip.split.parts : null;
  if (sp && sp.every((p) => intIn(p.nights, 1, 60) && intIn(p.adults, 1, 16))) {
    const each = sp.map((p) => ({ nights: p.nights, rooms: sleeps ? Math.max(1, Math.ceil((p.adults + (p.kids || 0)) / sleeps)) : 1 }));
    const rn = each.reduce((t, x) => t + x.nights * x.rooms, 0);
    return { key: 'stay', ...PARTS.stay, low: band[0] === null ? null : band[0] * rn, high: band[1] === null ? null : band[1] * rn, count: nights, nights, rooms: Math.max(...each.map((x) => x.rooms)), roomsUnknown: !sleeps, split: each };
  }
  const rooms = sleeps ? Math.max(1, Math.ceil(people / sleeps)) : 1;
  return {
    key: 'stay', ...PARTS.stay,
    low: band[0] === null ? null : band[0] * nights * rooms,
    high: band[1] === null ? null : band[1] * nights * rooms,
    count: nights, nights, rooms, roomsUnknown: !sleeps,
  };
}

const roundDown = (n) => Math.floor(n / 10) * 10;
const roundUp = (n) => Math.ceil(n / 10) * 10;

// plan: the planner's result; card: the stay card (or null); trip: whereToStay.trip.
function tripEstimate(plan, card, trip, cfg = CONFIG) {
  const t = trip || {};
  const known = Number.isInteger(t.adults) && t.adults > 0 && !t.adultsAssumed;
  const kids = Number.isInteger(t.kids) && t.kids > 0 ? t.kids : 0;
  // Party not given: two people, said on the box ("for 2 people") -- the same default the booking sites use.
  // Round 3: kids named with no adult count ("two kids, 7 and 10") are 2 adults plus the kids, never "for 2 people".
  const people = known ? t.adults + kids : 2 + kids;
  const sums = {};
  const unknown = [];
  let pricedPaid = 0, unpricedPaid = 0;
  const seen = new Set();
  // A later arrival (2026-11-23, trip-late-arrival.js: t.late): each day's stops are counted for the people there that
  // day (Day 1 for 2, from Day 2 for 3). Without it every stop is for the whole party, as before.
  const late = t.late && !t.late.unresolved && Number.isInteger(t.late.day) && Array.isArray(plan && plan.days) ? t.late : null;
  const dayOf = new Map();
  if (late) for (const d of plan.days) for (const s of (d && d.stops) || []) if (s && !dayOf.has(s)) dayOf.set(s, d.day);
  // (2026-11-24) On the day they arrive, with the time known: a stop that starts before the arrival (after a departure)
  // is counted for the ones there. With no time, or no start time, that day's stops are counted for everyone, as before.
  const lateWin = late && late.at ? tripLate.atWindow(late.at) : null;
  const startOf = (s) => { const r = lateWin && s && s.venue ? ((plan && plan.schedule) || []).find((x) => x && x.day === dayOf.get(s) && x.venueId === s.venue.id && typeof x.startMinutes === 'number') : null; return r ? Math.round(r.startMinutes) : null; };
  let lateFew = 0;
  const peopleFor = (s) => { if (!late || !dayOf.has(s)) return people; const there = late.kind === 'join' ? dayOf.get(s) >= late.day : dayOf.get(s) <= late.day;
    if (there && lateWin && dayOf.get(s) === late.day && tripLate.lateStopState(lateWin, late.kind, startOf(s)) === 'few') { lateFew++; return Math.max(1, people - late.n); }
    return there ? people : Math.max(1, people - late.n); };
  for (const s of planStopList(plan)) {
    const v = s && s.venue;
    if (!v || !v.name) continue;
    const id = Number.isInteger(v.id) ? `v${v.id}` : `n${v.name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pp = stopPerPerson(v, cfg);
    const outdoor = OUTDOOR_TYPES.includes(v.type);
    if (!pp) {
      unknown.push(v.name);
      if (!outdoor) unpricedPaid++;
      continue;
    }
    if (!outdoor) pricedPaid++;
    const key = partKey(v.type, v.cost);
    const p = sums[key] || (sums[key] = { low: 0, high: 0, count: 0, mapped: 0 });
    p.count++;
    if (pp.free) continue;
    p.low += pp.low * peopleFor(s);
    p.high += pp.high * peopleFor(s);
    if (pp.mapped) p.mapped++;
  }
  const parts = [];
  const stay = card ? stayPart(card, t, people, cfg) : null;
  if (stay) parts.push(stay);
  for (const key of ORDER.slice(1)) {
    const p = sums[key];
    if (!p) continue;
    parts.push({ key, ...PARTS[key], low: Math.floor(p.low / 100), high: Math.ceil(p.high / 100), count: p.count, ...(p.mapped ? { fromPriceLevel: p.mapped } : {}) });
  }
  const openLow = parts.some((p) => p.low === null);
  const openHigh = parts.some((p) => p.high === null);
  const low = openLow ? null : parts.reduce((n, p) => n + p.low, 0);
  const high = openHigh ? null : parts.reduce((n, p) => n + p.high, 0);
  const notes = [];
  if (stay && t.nights) {
    const months = nightMonths(t);
    if (months.length && months.some((m) => !cfg.stayBandMonths.includes(m))) notes.push({ key: 'band', text: cfg.stayBandNote.en, textFr: cfg.stayBandNote.fr });
    if (stay.split) notes.push({ key: 'rooms', text: `Stay counted as ${stay.split.map((x) => `${x.rooms} room${x.rooms > 1 ? 's' : ''} × ${x.nights} night${x.nights > 1 ? 's' : ''}`).join(' + ')} (two bookings).`, textFr: `Hébergement compté : ${stay.split.map((x) => `${x.rooms} chambre${x.rooms > 1 ? 's' : ''} × ${x.nights} nuit${x.nights > 1 ? 's' : ''}`).join(' + ')} (deux réservations).` });
    else if (stay.rooms > 1) notes.push({ key: 'rooms', text: `${stay.rooms} rooms or units for ${people} people (sleeps ${card.sleeps} each).`, textFr: `${stay.rooms} chambres ou unités pour ${people} personnes (${card.sleeps} pers. chacune).` });
    else if (stay.roomsUnknown && people > 2) notes.push({ key: 'rooms', text: `Priced for one room or unit; ${people} people may need more.`, textFr: `Prix pour une chambre ou unité; ${people} personnes pourraient en avoir besoin de plus.` });
  }
  if (late && parts.some((p) => p.key !== 'stay')) { const few = Math.max(1, people - late.n), a = late.kind === 'join' ? [1, late.day - 1] : [late.day + 1, plan.days.length]; const dl = a[0] === a[1] ? `${a[0]}` : `${a[0]}–${a[1]}`; const tagE = lateFew ? tripLate.atTag(late.at, false) : '', tagF = lateFew ? tripLate.atTag(late.at, true) : '', arrE = late.kind === 'join' ? `before the ${tagE} arrival` : `after the ${tagE} departure`, arrF = late.kind === 'join' ? `avant l’arrivée (${tagF})` : `après le départ (${tagF})`;
    notes.push({ key: 'late', text: lateFew ? `Day${a[0] === a[1] ? '' : 's'} ${dl} and Day ${late.day} stops ${arrE} counted for ${few}, the rest for ${people}.` : `Day${a[0] === a[1] ? '' : 's'} ${dl} counted for ${few}, the other days for ${people}.`, textFr: lateFew ? `Jour${a[0] === a[1] ? '' : 's'} ${dl} et arrêts du jour ${late.day} ${arrF} comptés pour ${few}, le reste pour ${people}.` : `Jour${a[0] === a[1] ? '' : 's'} ${dl} compté${a[0] === a[1] ? '' : 's'} pour ${few}, les autres pour ${people}.` }); }
  if (kids && parts.some((p) => p.key !== 'stay')) notes.push({ key: 'kids', text: 'Kids are counted at adult prices; theirs are often lower.', textFr: 'Les enfants sont comptés au prix adulte; le leur est souvent plus bas.' });
  return {
    low: low === null ? null : roundDown(low), high: high === null ? null : roundUp(high), currency: 'CAD',
    people, peopleAssumed: !known, kids,
    showTotal: !!stay && parts.length > 0 && !(openLow && openHigh) && unpricedPaid <= pricedPaid,
    openLow, openHigh, parts, unknown, notes,
  };
}

const httpsUrl = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u);
const urlKey = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#]+$/, '');

// card: the stay card with bookingLinks (stay-booking-links.js); checklist: [{ venueId, name, url, label, labelFr }].
function tripBookingSteps(card, checklist) {
  const out = [], ids = new Set(), urls = new Set();
  const first = card && Array.isArray(card.bookingLinks) ? card.bookingLinks.find((l) => l && httpsUrl(l.url)) : null;
  if (first) {
    // A split stay (2026-11-23, trip-late-arrival.js): two bookings, each a step with its own link, when each link
    // carries its own booking (card.split.distinct). Otherwise one step, and the page says the two bookings beside it.
    const sp = card.split && card.split.distinct && Array.isArray(card.bookingLinks2) ? card.split : null;
    const second = sp ? (card.bookingLinks2.find((l) => l && l.key === first.key && httpsUrl(l.url)) || card.bookingLinks2.find((l) => l && httpsUrl(l.url))) : null;
    out.push({ kind: 'stay', id: card.id, name: card.name, label: first.label, labelFr: first.labelFr, url: first.url, affiliate: !!first.affiliate, rel: first.rel || 'nofollow noopener', link: first.key, ...(second ? { part: 1, sub: sp.text.parts[0], subFr: sp.textFr.parts[0], btn: (sp.text.btn || [])[0] || '', btnFr: (sp.textFr.btn || [])[0] || '' } : {}) });
    urls.add(urlKey(first.url));
    if (second) { out.push({ kind: 'stay', id: card.id, name: card.name, label: second.label, labelFr: second.labelFr, url: second.url, affiliate: !!second.affiliate, rel: second.rel || 'nofollow noopener', link: second.key, part: 2, sub: sp.text.parts[1], subFr: sp.textFr.parts[1], btn: (sp.text.btn || [])[1] || '', btnFr: (sp.textFr.btn || [])[1] || '' }); urls.add(urlKey(second.url)); }
  }
  for (const c of Array.isArray(checklist) ? checklist : []) {
    if (!c || !Number.isInteger(c.venueId) || !httpsUrl(c.url) || ids.has(c.venueId) || urls.has(urlKey(c.url))) continue;
    if (card && c.venueId === card.id) continue;
    ids.add(c.venueId);
    urls.add(urlKey(c.url));
    // A venue with an approved Viator match (2026-11-20) carries its affiliate link, rel and 'viator' (viator.checklistItem).
    out.push({ kind: 'venue', id: c.venueId, name: c.name, label: c.label, labelFr: c.labelFr, url: c.url, affiliate: !!c.affiliate, rel: c.affiliate ? (c.rel || 'sponsored nofollow noopener') : 'nofollow noopener', link: c.link === 'viator' ? 'viator' : 'booking' });
  }
  return out;
}

// Adds estimate and bookingSteps to the whereToStay block (for the pick) and to every card (so the box can follow a
// Change of stay without any maths in the browser).
// budget (2026-11-23, trip-budget.js readBudget): the traveller's own limit, set beside each card's estimate (the same
// numbers), so the sheet, the summary and the shared copy say one thing. No budget: nothing is added.
function withTripBooking(block, plan, budget = null) {
  if (!block || !block.pick) return block;
  const add = (card) => {
    const estimate = tripEstimate(plan, card, block.trip);
    const b = budget ? tripBudget.worded(tripBudget.facts(estimate, budget, { hasStay: true, stayName: card.name })) : null;
    return { ...card, estimate, ...(b ? { budget: b } : {}), bookingSteps: tripBookingSteps(card, block.checklist) };
  };
  const pick = add(block.pick);
  return { ...block, pick, alternatives: (block.alternatives || []).map(add), estimate: pick.estimate, ...(pick.budget ? { budget: pick.budget } : {}), bookingSteps: pick.bookingSteps };
}

module.exports = { PARTS, tripEstimate, tripBookingSteps, withTripBooking, stayPart, stopPerPerson, nightMonths };
