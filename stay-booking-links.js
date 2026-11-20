'use strict';
// Build My Trip "Where to stay", step 3 (2026-11-20): the booking buttons for a stay, pre-filled with the trip's dates
// and party. Pure functions; server.js passes in the stay (venue fields + stay_info) and the trip.
//
// Up to three buttons, in this order: Booking.com, Expedia (the two that can earn a commission), then the place's own
// site. A stay with none of the three gets one "Check rates" button from places-to-stay.js's stayRatesLink.
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
  return { dates, adults: count(t.adults, 1, 16), kids: count(t.kids, 0, 12) };
}

function bookingComUrl(raw, p) {
  const u = httpsOn(raw, BOOKING_HOSTS);
  if (!u || !/^\/hotel\//.test(u.pathname)) return null;
  const q = u.searchParams;
  if (p.dates) { q.set('checkin', p.dates.arrive); q.set('checkout', p.dates.leave); }
  if (p.adults !== null) q.set('group_adults', String(p.adults));
  if (p.kids !== null) q.set('group_children', String(p.kids));
  q.set('no_rooms', '1');
  return u;
}
function expediaUrl(raw, p) {
  const u = httpsOn(raw, EXPEDIA_HOSTS);
  if (!u || !/\.h\d+\.Hotel-Information$/i.test(u.pathname)) return null;
  const q = u.searchParams;
  if (p.dates) { q.set('chkin', p.dates.arrive); q.set('chkout', p.dates.leave); }
  // Adults only: children need their ages (rm1=a2:c8:c10), which we don't have.
  if (p.adults !== null) q.set('rm1', `a${p.adults}`);
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
  if (cfg.campaign) q.set('campaign', cfg.campaign.replace(/-/g, '_'));
  const u = httpsOn(`${STAY22_ALLEZ}${provider}?${q.toString()}`, STAY22_HOSTS, true);
  return u ? u.toString() : null;
}

const button = (key, url, affiliate) => ({
  key, label: LABELS[key].en, labelFr: LABELS[key].fr, short: LABELS[key].short, shortFr: LABELS[key].shortFr,
  url, affiliate: !!affiliate, rel: affiliate ? REL_AFFILIATE : REL_PLAIN,
});

// The "Check rates" fallback (a stay with no Booking.com, Expedia or own link): places-to-stay.js's stayRatesLink
// (the affiliate partner's search for the place, else the place's website), with the dates and party added when that
// target takes them (Stay22 Allez and Booking.com search do; a website and Expedia's search are left as they are).
function fallbackButton(venue, p, opts) {
  const link = placesToStay.stayRatesLink({ ...venue, type: placesToStay.STAY_TYPE }, { env: opts.env, regionLabel: opts.regionLabel, links: {} });
  if (!link) return null;
  const u = httpsOn(link.url, link.source === 'stay22' ? STAY22_HOSTS : link.source === 'booking' ? BOOKING_HOSTS : link.source === 'expedia' ? EXPEDIA_HOSTS : null, true);
  if (!u) return null;
  if (link.source === 'stay22') {
    if (p.dates) { u.searchParams.set('checkin', p.dates.arrive); u.searchParams.set('checkout', p.dates.leave); }
    if (p.adults !== null) u.searchParams.set('adults', String(p.adults));
    if (p.kids !== null) u.searchParams.set('children', String(p.kids));
  } else if (link.source === 'booking') {
    if (p.dates) { u.searchParams.set('checkin', p.dates.arrive); u.searchParams.set('checkout', p.dates.leave); }
    if (p.adults !== null) u.searchParams.set('group_adults', String(p.adults));
    if (p.kids !== null) u.searchParams.set('group_children', String(p.kids));
    u.searchParams.set('no_rooms', '1');
  }
  return button('search', u.toString(), link.affiliate);
}

// stay: { id, name, address, latitude, longitude, website, info (stay_info), ownerBookingUrl (venue_links.booking_url) }
// trip: { arrive, leave, adults, kids, dog }   opts: { env, regionLabel }
// -> [{ key, label, labelFr, short, shortFr, url, affiliate, rel }] (0 to 3).
function stayBookingLinks(stay, trip, opts = {}) {
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
  if (!out.length) {
    const f = fallbackButton(stay, p, { env, regionLabel: opts.regionLabel });
    if (f) out.push(f);
  }
  return out.slice(0, 3);
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
    const out = { ...card, bookingLinks: stayBookingLinks(stay, block.trip, { env: opts.env, regionLabel: card.regionLabel }) };
    if (stayPetsNote(stay.info, block.trip)) out.petsSome = true;
    return out;
  };
  return { ...block, pick: add(block.pick), alternatives: (block.alternatives || []).map(add) };
}

module.exports = {
  BOOKING_HOSTS, EXPEDIA_HOSTS, STAY22_HOSTS, STAY22_ALLEZ, LABELS, REL_AFFILIATE, REL_PLAIN,
  httpsOn, tripParams, bookingComUrl, expediaUrl, stay22Wrap, stayBookingLinks, stayPetsNote, withBookingLinks,
};
