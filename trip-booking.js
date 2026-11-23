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
    p.low += pp.low * people;
    p.high += pp.high * people;
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
    if (stay.rooms > 1) notes.push({ key: 'rooms', text: `${stay.rooms} rooms or units for ${people} people (sleeps ${card.sleeps} each).`, textFr: `${stay.rooms} chambres ou unités pour ${people} personnes (${card.sleeps} pers. chacune).` });
    else if (stay.roomsUnknown && people > 2) notes.push({ key: 'rooms', text: `Priced for one room or unit; ${people} people may need more.`, textFr: `Prix pour une chambre ou unité; ${people} personnes pourraient en avoir besoin de plus.` });
  }
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
    out.push({ kind: 'stay', id: card.id, name: card.name, label: first.label, labelFr: first.labelFr, url: first.url, affiliate: !!first.affiliate, rel: first.rel || 'nofollow noopener', link: first.key });
    urls.add(urlKey(first.url));
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
