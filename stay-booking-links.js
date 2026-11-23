'use strict';
// Build My Trip "Where to stay", step 3 (2026-11-20): the booking buttons for a stay, pre-filled with the trip's dates
// and party. Pure functions; server.js passes in the stay (venue fields + stay_info) and the trip.
//
// Up to three buttons, in this order: Booking.com, Expedia (the two that can earn a commission), then the place's own
// site, each the page of THIS place (never a search or a map: Dayton, 2026-11-21). A stay with none of the three gets
// one "Check rates" button to its own website (places-to-stay.js's stayRatesLink), or no button.
//
// Commission switch (env only, no code change), from places-to-stay.js's affiliateConfig:
//   STAY_AFFILIATE_PROVIDER=stay22 + STAY_AFFILIATE_ID  -> the Booking.com and Expedia buttons go through Stay22 Allez;
//   STAY_AFFILIATE_PROVIDER=booking + id                 -> the Booking.com button gets aid= (and label=);
//   STAY_AFFILIATE_PROVIDER=expedia + id                 -> the Expedia button gets affcid= (and afflid=);
//   none / no id                                          -> plain links, affiliate: false.
// The own-site button is never an affiliate link, and an owner's or admin's own booking link (venue_links.booking_url)
// always is the own-site button.
//
// Privacy: the only things added to a URL are the dates and head counts (never names, emails or the request's words).
// Every URL must be https on the expected host before anything is added to it; otherwise that button is skipped.

const placesToStay = require('./places-to-stay');

// ---- URL formats (one place each, so a format change is one edit) ----
//
// Booking.com property page: https://www.booking.com/hotel/<cc>/<slug>.html
//   checkin=YYYY-MM-DD, checkout=YYYY-MM-DD, group_adults=N, no_rooms=1, and aid= (affiliate id). Source: Booking.com's
//   own Demand API docs, whose search results return property URLs in this exact form, e.g.
//   ".../hotel/nl/demand-api-test-1.html?aid=956509&checkin=2026-08-10&checkout=2026-08-12&no_rooms=1&group_adults=2"
//   (https://developers.booking.com/demand/docs/accommodations/search-examples, checked 2026-11-20).
//   group_children=K: the same family of parameters, as Booking.com's own search form writes it in its URLs (observed,
//   not in that doc). Booking.com asks for each child's age with age=<n> per child; we never know the ages, so we send
//   no age= and the site asks the visitor (never invent ages).
//   Pets: Booking.com has a "pets allowed" filter for its search results (nflt=hotelfacility%3D4, observed on
//   searchresults.html), but no documented or observed parameter for a single property's page. None is sent; the card
//   shows "Pets in some rooms -- check when booking" instead where that matters.
//   label= carries the campaign with aid= (Booking.com affiliate links; see places-to-stay.js).
const BOOKING_HOSTS = ['booking.com'];
// Expedia property page: https://www.expedia.ca/<Town>-Hotels-<Name>.h<id>.Hotel-Information
//   chkin=YYYY-MM-DD, chkout=YYYY-MM-DD, rm1=a<adults>. Source: Expedia Group's Lodging Listings API, whose
//   WebDetails links are Hotel-Information URLs of this form (sample "...Hotel-Information?...&rm1=a2...&chkin=
//   2027-11-01&chkout=2027-11-03"; https://developers.expediagroup.com/xap-apis/api/shopping-apis/lodging-listings,
//   checked 2026-11-20). Children go in the same value with their ages (rm1=a2:c8:c10); we never know the ages, so the
//   link carries the adults only and the visitor adds the kids on Expedia.
//   affcid= / afflid=: the Expedia Group affiliate ids (TODO: confirm in the affiliate dashboard once the account exists;
//   it may issue its own tracked links instead).
const EXPEDIA_HOSTS = ['expedia.ca', 'expedia.com'];
// Stay22 Allez: https://www.stay22.com/allez/{provider}?aid=...&link=<URL-encoded Booking.com or Expedia property URL>.
//   Sources (checked 2026-11-20): https://dev.stay22.com/docs/allez/quick-start ("link=" takes a direct OTA property URL,
//   example /allez/booking?aid=<AID>&link=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fca%2F...html) and
//   https://dev.stay22.com/docs/allez/parameters (checkin / checkout YYYY-MM-DD, adults, children, campaign with
//   underscores, lang) and https://dev.stay22.com/docs/allez/providers (/allez/booking, /allez/expedia).
//   The docs don't say whether the dates inside link= are kept, so the dates and head counts go both inside the wrapped
//   URL and as Allez's own parameters.
//   Rooms (2026-11-22): the docs list no rooms parameter, but Allez reads rooms=N (seen in its redirects, 2026-11-22):
//   Booking.com gets no_rooms=N, Expedia gets numRoom=N with the adults split by Stay22 itself (6 adults, rooms=3 ->
//   adults=2,2,2; rooms=2 -> 3,3). Allez builds the provider URL from its OWN parameters and drops the party inside
//   link= (no_rooms inside link= was dropped; with no rooms= Expedia got 2 adults a room), so rooms= goes on the
//   wrapper as well as inside the wrapped URL. childrenAges=6,9 is documented (one age per child; without it Stay22
//   fills in an age of its own).
const STAY22_HOSTS = ['stay22.com'];
const STAY22_ALLEZ = 'https://www.stay22.com/allez/';

const LABELS = {
  booking_com: { en: 'Book on Booking.com', fr: 'Réserver sur Booking.com', short: 'Booking.com', shortFr: 'Booking.com' },
  expedia: { en: 'Book on Expedia', fr: 'Réserver sur Expedia', short: 'Expedia', shortFr: 'Expedia' },
  own: { en: 'Hotel’s own site', fr: 'Site de l’hôtel', short: 'Hotel’s own site', shortFr: 'Site de l’hôtel' },
  search: { en: placesToStay.CHECK_RATES.en, fr: placesToStay.CHECK_RATES.fr, short: placesToStay.CHECK_RATES.en, shortFr: placesToStay.CHECK_RATES.fr },
};
const REL_AFFILIATE = 'sponsored nofollow noopener';
const REL_PLAIN = 'nofollow noopener';

// ---- Rooms (2026-11-22, Dayton: six adults were sent to Booking.com as one room and nobody was asked) ----
// The rule, in one place (these four functions are also sent to the page as they are, so they stay plain ES5):
//   said or picked rooms win (1 to MAX_ROOMS, never more rooms than adults: each room needs an adult);
//   else an ASSUMED number, always labelled: 1 room for 1 or 2 adults (with or without kids); for 3 or more adults one
//   room for every two adults, rounded up (3-4 -> 2, 5-6 -> 3, 7-8 -> 4...). Kids travel with the adults and add no room.
//   A party with no adult count has no rooms value.
// The question is shown when it matters: 3 or more adults, or more than 4 people to a room.
var MAX_ROOMS = 8;
function stayDefaultRooms(adults) {
  if (!(adults >= 1)) return null;
  return adults <= 2 ? 1 : Math.min(8, Math.ceil(adults / 2));
}
// -> { rooms, assumed } or null. given: the rooms said or picked (or null).
function stayRoomsFor(adults, given) {
  var a = adults >= 1 ? adults : null;
  if (given >= 1 && given <= 8 && Math.floor(given) === given) return { rooms: a ? Math.min(given, a) : given, assumed: false };
  return a ? { rooms: stayDefaultRooms(a), assumed: true } : null;
}
function stayRoomsMatter(adults, kids, rooms) {
  var a = adults >= 1 ? adults : 0, k = kids >= 1 ? kids : 0;
  return a >= 3 || (a + k) > 4 * (rooms >= 1 ? rooms : 1);
}
// The adults (and the children, by age) spread over the rooms, evenly and always the same way: the first rooms get the
// extra adult; the children go one at a time to room 1, 2, 3... -> [{ adults, ages: [] }, ...]
function stayRoomSplit(adults, kidAges, rooms) {
  var n = Math.max(1, Math.min(rooms || 1, adults || 1)), out = [], i;
  for (i = 0; i < n; i++) out.push({ adults: Math.floor(adults / n) + (i < adults % n ? 1 : 0), ages: [] });
  for (i = 0; i < (kidAges || []).length; i++) out[i % n].ages.push(kidAges[i]);
  return out;
}
// The four functions as browser text (trip-planner-v4-page.js builds the same links when the visitor changes the party).
const ROOMS_CLIENT_SRC = [stayDefaultRooms, stayRoomsFor, stayRoomsMatter, stayRoomSplit].map((f) => '  ' + f.toString()).join('\n');

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const count = (n, lo, hi) => (Number.isInteger(n) && n >= lo && n <= hi ? n : null);

// An https URL on one of the hosts (the host itself or a subdomain; any real domain when hosts is null), with no
// user:password and -- unless keepTags -- no affiliate or tracking tags already in it (a stored Booking.com or Expedia
// listing must be plain, so we never add our tags on top of someone else's). -> URL or null.
function httpsOn(raw, hosts, keepTags = false) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 800) return null;
  let u;
  try { u = new URL(raw.trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (hosts && !hosts.some((d) => h === d || h.endsWith(`.${d}`))) return null;
  if (!hosts && !h.includes('.')) return null;
  if (!keepTags && placesToStay.hasTrackingParams(u)) return null;
  return u;
}

// The trip as the links use it: dates only when both are real and in order; head counts only when known.
function tripParams(trip) {
  const t = trip || {};
  const dates = isDate(t.arrive) && isDate(t.leave) && t.leave > t.arrive ? { arrive: t.arrive, leave: t.leave } : null;
  const kids = count(t.kids, 0, 12);
  // Fix round (2026-11-22): the children's ages, when the visitor typed them ("kids 6 and 9"); never guessed.
  const kidAges = kids && Array.isArray(t.kidAges) && t.kidAges.length === kids && t.kidAges.every((a) => Number.isInteger(a) && a >= 0 && a <= 17) ? t.kidAges.slice() : null;
  const adults = count(t.adults, 1, 16);
  // rooms: said or picked, else the labelled assumption for this many adults; null when the party is not known.
  // roomsLegacy: a shared trip link made before rooms existed (no rm=): it opens exactly as it did then.
  const rm = t.roomsLegacy === true ? null : stayRoomsFor(adults, count(t.rooms, 1, MAX_ROOMS));
  return { dates, adults, kids, kidAges, rooms: rm ? rm.rooms : null };
}

function bookingComUrl(raw, p) {
  const u = httpsOn(raw, BOOKING_HOSTS);
  if (!u || !/^\/hotel\//.test(u.pathname)) return null;
  const q = u.searchParams;
  if (p.dates) { q.set('checkin', p.dates.arrive); q.set('checkout', p.dates.leave); }
  if (p.adults !== null) q.set('group_adults', String(p.adults));
  if (p.kids !== null) q.set('group_children', String(p.kids));
  if (p.kidAges) for (const a of p.kidAges) q.append('age', String(a));
  // no_rooms with group_adults is the whole party over that many rooms (Booking.com shows "6 adults · 0 children ·
  // 3 rooms" and offers a mix of rooms; seen on its pages 2026-11-22). A party we do not know: 1, as before.
  q.set('no_rooms', String(p.rooms || 1));
  return u;
}
function expediaUrl(raw, p) {
  const u = httpsOn(raw, EXPEDIA_HOSTS);
  if (!u || !/\.h\d+\.Hotel-Information$/i.test(u.pathname)) return null;
  const q = u.searchParams;
  if (p.dates) { q.set('chkin', p.dates.arrive); q.set('chkout', p.dates.leave); }
  // Children need their ages (rm1=a2:c8:c10): only when the visitor typed them. Kids with no adult count: 2 adults (the
  // room needs one; Expedia's own default), so a family of four is not booked as two travellers.
  // Rooms (2026-11-22): one rmN per room (rm1=a2&rm2=a2&rm3=a2), the adults and the children split by stayRoomSplit.
  const adults = p.adults !== null ? p.adults : p.kidAges ? 2 : null;
  if (adults !== null) {
    for (const k of [...q.keys()]) if (/^rm\d+$/.test(k)) q.delete(k);
    stayRoomSplit(adults, p.kidAges || [], p.rooms || 1).forEach((r, i) => q.set(`rm${i + 1}`, `a${r.adults}${r.ages.map((a) => `:c${a}`).join('')}`));
  }
  return u;
}
// Stay22 Allez around a Booking.com or Expedia property URL.
function stay22Wrap(provider, target, p, cfg) {
  const q = new URLSearchParams();
  q.set('aid', cfg.id);
  q.set('link', target);
  if (p.dates) { q.set('checkin', p.dates.arrive); q.set('checkout', p.dates.leave); }
  if (p.adults !== null) q.set('adults', String(p.adults));
  if (p.kids !== null) q.set('children', String(p.kids));
  if (p.kidAges && p.kidAges.length) q.set('childrenAges', p.kidAges.join(','));
  if (p.rooms !== null && p.rooms !== undefined) q.set('rooms', String(p.rooms));
  if (cfg.campaign) q.set('campaign', cfg.campaign.replace(/-/g, '_'));
  const u = httpsOn(`${STAY22_ALLEZ}${provider}?${q.toString()}`, STAY22_HOSTS, true);
  return u ? u.toString() : null;
}

const button = (key, url, affiliate) => ({
  key, label: LABELS[key].en, labelFr: LABELS[key].fr, short: LABELS[key].short, shortFr: LABELS[key].shortFr,
  url, affiliate: !!affiliate, rel: affiliate ? REL_AFFILIATE : REL_PLAIN,
});

// The "Check rates" fallback (a stay with no Booking.com, Expedia or own link): places-to-stay.js's stayRatesLink
// (the place's own website since 2026-11-21; it used to be the affiliate partner's name search). The Stay22 and
// Booking.com branches below only apply if stayRatesLink ever returns one of those again.
function fallbackButton(venue, p, opts) {
  const link = placesToStay.stayRatesLink({ ...venue, type: placesToStay.STAY_TYPE }, { env: opts.env, regionLabel: opts.regionLabel, links: {} });
  if (!link) return null;
  const u = httpsOn(link.url, link.source === 'stay22' ? STAY22_HOSTS : link.source === 'booking' ? BOOKING_HOSTS : link.source === 'expedia' ? EXPEDIA_HOSTS : null, true);
  if (!u) return null;
  if (link.source === 'stay22') {
    if (p.dates) { u.searchParams.set('checkin', p.dates.arrive); u.searchParams.set('checkout', p.dates.leave); }
    if (p.adults !== null) u.searchParams.set('adults', String(p.adults));
    if (p.kids !== null) u.searchParams.set('children', String(p.kids));
    if (p.kidAges && p.kidAges.length) u.searchParams.set('childrenAges', p.kidAges.join(','));
    if (p.rooms !== null) u.searchParams.set('rooms', String(p.rooms));
  } else if (link.source === 'booking') {
    if (p.dates) { u.searchParams.set('checkin', p.dates.arrive); u.searchParams.set('checkout', p.dates.leave); }
    if (p.adults !== null) u.searchParams.set('group_adults', String(p.adults));
    if (p.kids !== null) u.searchParams.set('group_children', String(p.kids));
    u.searchParams.set('no_rooms', String(p.rooms || 1));
  }
  return button('search', u.toString(), link.affiliate);
}

// stay: { id, name, address, latitude, longitude, website, info (stay_info), ownerBookingUrl (venue_links.booking_url) }
// trip: { arrive, leave, adults, kids, dog }   opts: { env, regionLabel }
// -> [{ key, label, labelFr, short, shortFr, url, affiliate, rel }] (0 to 3).
function exactStayLinks(stay, trip, opts = {}) {
  if (!stay || typeof stay !== 'object') return [];
  const env = opts.env || process.env;
  const cfg = placesToStay.affiliateConfig(env);
  const p = tripParams(trip);
  const b = (stay.info && stay.info.booking && typeof stay.info.booking === 'object') ? stay.info.booking : {};
  const out = [];
  const bc = bookingComUrl(b.booking_com, p);
  if (bc) {
    if (cfg.provider === 'stay22') { const w = stay22Wrap('booking', bc.toString(), p, cfg); if (w) out.push(button('booking_com', w, true)); }
    else if (cfg.provider === 'booking') {
      bc.searchParams.set('aid', cfg.id);
      if (cfg.campaign) bc.searchParams.set('label', cfg.campaign);
      out.push(button('booking_com', bc.toString(), true));
    } else out.push(button('booking_com', bc.toString(), false));
  }
  const ex = expediaUrl(b.expedia, p);
  if (ex) {
    if (cfg.provider === 'stay22') { const w = stay22Wrap('expedia', ex.toString(), p, cfg); if (w) out.push(button('expedia', w, true)); }
    else if (cfg.provider === 'expedia') {
      ex.searchParams.set('affcid', cfg.id);
      if (cfg.campaign) ex.searchParams.set('afflid', cfg.campaign);
      out.push(button('expedia', ex.toString(), true));
    } else out.push(button('expedia', ex.toString(), false));
  }
  // The owner's / admin's booking link wins over the researched one; as-is (we can't pre-fill unknown engines).
  // The owner's link is theirs to tag as they like (kept as-is); the researched one must be plain.
  const own = httpsOn(stay.ownerBookingUrl, null, true) || httpsOn(b.own, null);
  if (own) out.push(button('own', own.toString(), false));
  return out.slice(0, 3);
}
// The booking buttons for Build My Trip: the exact pages above, else the place's own website (fallbackButton).
function stayBookingLinks(stay, trip, opts = {}) {
  const out = exactStayLinks(stay, trip, opts);
  if (out.length) return out;
  const f = fallbackButton(stay, tripParams(trip), { env: opts.env || process.env, regionLabel: opts.regionLabel });
  return f ? [f] : [];
}

// "See live prices" (2026-11-20): Stay22's Maps embed for the trip's dates, around the chosen stay.
//   Source: https://dev.stay22.com/docs/maps/parameters (checked 2026-11-20): https://www.stay22.com/embed/gm with aid,
//   address or lat/lng, checkin/checkout, adults/children, priceper=nightly, currency, campaign, ljs (language),
//   nelat/nelng/swlat/swlng (a bounding box), poi (our own pins, a URL-encoded JSON array) and onlyhcids (Booking.com
//   hotel ids only).
//   One hotel only (onlyhcids) needs the Booking.com hotel id, which we don't have and can't get the honest way (the
//   Booking.com page answers a plain request with a bot check; Stay22's id lookup is its keyed Direct Travel API). So the
//   map is the stay's own block instead: the town as the address ("Oliver, British Columbia, Canada": Stay22 answers "404" for "Oliver, BC" and for many exact coordinates, seen
//   2026-11-20), a box about 650 m across around the stay, and a star pin with the stay's name (poi). Other places nearby
//   show too, with their nightly prices.
//   Shown only with STAY_AFFILIATE_PROVIDER=stay22 + STAY_AFFILIATE_ID, and only for stays listed as loading in
//   data/stay22-maps.json (scripts/stay22-map-check.js); a stay that isn't checked gets no button.
const STAY22_MAP = 'https://www.stay22.com/embed/gm';
const MAP_BOX = { lat: 0.003, lng: 0.005 };
let mapChecks = null;
function stay22MapChecks() {
  if (mapChecks) return mapChecks;
  try { mapChecks = require('./data/stay22-maps.json').stays || {}; } catch (e) { mapChecks = {}; }
  return mapChecks;
}
// stay: { id, name, latitude, longitude, regionLabel }; trip as above; opts: { env, checks, province }.
// -> { url, urlFr } or null.
function stay22MapUrl(stay, trip, opts = {}) {
  const env = opts.env || process.env;
  const cfg = placesToStay.affiliateConfig(env);
  if (cfg.provider !== 'stay22' || !stay || !Number.isInteger(stay.id)) return null;
  const checks = opts.checks || stay22MapChecks();
  const c = checks[String(stay.id)];
  if (!c || c.ok !== true) return null;
  const lat = Number(stay.latitude), lng = Number(stay.longitude);
  const town = String(stay.regionLabel || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng) || !town) return null;
  const p = tripParams(trip);
  const r6 = (n) => String(Math.round(n * 1e6) / 1e6);
  const q = new URLSearchParams();
  q.set('aid', cfg.id);
  q.set('address', `${town}, ${opts.province || 'British Columbia, Canada'}`);
  q.set('nelat', r6(lat + MAP_BOX.lat)); q.set('nelng', r6(lng + MAP_BOX.lng));
  q.set('swlat', r6(lat - MAP_BOX.lat)); q.set('swlng', r6(lng - MAP_BOX.lng));
  q.set('poi', JSON.stringify([{ lat: Number(r6(lat)), lng: Number(r6(lng)), name: String(stay.name || '').slice(0, 80) }]));
  if (p.dates) { q.set('checkin', p.dates.arrive); q.set('checkout', p.dates.leave); }
  if (p.adults !== null) q.set('adults', String(p.adults));
  if (p.kids !== null && p.kids > 0) q.set('children', String(p.kids));
  q.set('priceper', 'nightly');
  q.set('currency', 'CAD');
  if (cfg.campaign) q.set('campaign', cfg.campaign.replace(/-/g, '_'));
  const url = `${STAY22_MAP}?${q.toString()}`;
  if (!httpsOn(url, STAY22_HOSTS, true)) return null;
  return { url, urlFr: `${url}&ljs=fr` };
}

// "Pets in some rooms -- check when booking": a dog trip and a stay whose pets answer is "some".
function stayPetsNote(info, trip) {
  return !!(trip && trip.dog && info && info.pets === 'some');
}

// Adds bookingLinks (and petsSome) to the whereToStay block's pick and alternatives. byId: Map(id -> stay as above).
function withBookingLinks(block, byId, opts = {}) {
  if (!block || !block.pick) return block;
  const add = (card) => {
    const stay = byId.get(card.id);
    if (!stay) return { ...card, bookingLinks: [] };
    // Group-preferences round (2026-11-22; a hotel link carried Nov 23-25 though no dates were given): dates the visitor
    // did not give are never sent to a booking site. The link opens the place's own page with the party only; the dates
    // go in once the visitor picks them (block.trip.datesGiven).
    // Trip dates (2026-11-23): nor a date already past (block.trip.datesPast), nor a stay only proposed from the trip's
    // dates (datesGiven is false until the visitor confirms the check-in and check-out).
    const linkTrip = block.trip && (block.trip.datesGiven === false || block.trip.datesPast) ? { ...block.trip, arrive: null, leave: null } : block.trip;
    const out = { ...card, bookingLinks: stayBookingLinks(stay, linkTrip, { env: opts.env, regionLabel: card.regionLabel }) };
    // "See live prices" (Stay22's map of the stay's block) is off since 2026-11-21: it showed other places too, and
    // every booking button must open this place's own page (Dayton). stay22MapUrl stays for the check script.
    if (stayPetsNote(stay.info, block.trip)) out.petsSome = true;
    return out;
  };
  return { ...block, pick: add(block.pick), alternatives: (block.alternatives || []).map(add) };
}

module.exports = {
  BOOKING_HOSTS, EXPEDIA_HOSTS, STAY22_HOSTS, STAY22_ALLEZ, LABELS, REL_AFFILIATE, REL_PLAIN,
  httpsOn, tripParams, bookingComUrl, expediaUrl, stay22Wrap, exactStayLinks, stayBookingLinks, stayPetsNote, withBookingLinks,
  STAY22_MAP, MAP_BOX, stay22MapUrl,
  MAX_ROOMS, stayDefaultRooms, stayRoomsFor, stayRoomsMatter, stayRoomSplit, ROOMS_CLIENT_SRC,
};
