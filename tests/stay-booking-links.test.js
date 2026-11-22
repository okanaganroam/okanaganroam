'use strict';
// Build My Trip "Where to stay", step 3 (2026-11-20): the booking buttons (stay-booking-links.js) for every affiliate
// setting (none / stay22 / booking / expedia), the dates and head counts, kids without ages, no pets parameter, host
// checks, the order, the owner's link never affiliate, and the "Check rates" fallback. Pure functions, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../stay-booking-links');

const BC = 'https://www.booking.com/hotel/ca/comfort-suites-kelowna.html';
const EX = 'https://www.expedia.ca/Kelowna-Hotels-Hampton-Inn-Suites-Kelowna.h42574398.Hotel-Information';
const OWN = 'https://www.example-hotel.ca/book';
const stay = (booking, extra = {}) => ({ id: 7, name: 'Test Inn', address: '1 Water St, Kelowna, BC', latitude: 49.88, longitude: -119.49, website: 'https://www.example-hotel.ca', info: { booking }, ...extra });
const TRIP = { arrive: '2026-12-18', leave: '2026-12-21', adults: 2, kids: 2, dog: true };
const NONE = { env: {} };
const S22 = { env: { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'test123', STAY_AFFILIATE_CAMPAIGN: 'trip-plan' } };
const BKG = { env: { STAY_AFFILIATE_PROVIDER: 'booking', STAY_AFFILIATE_ID: '424242', STAY_AFFILIATE_CAMPAIGN: 'trip' } };
const EXP = { env: { STAY_AFFILIATE_PROVIDER: 'expedia', STAY_AFFILIATE_ID: 'CA.DIRECT.X', STAY_AFFILIATE_CAMPAIGN: 'trip' } };
const q = (u) => Object.fromEntries(new URL(u).searchParams);

test('no affiliate: plain property links with dates and party, in order Booking.com, Expedia, own site', () => {
  const r = L.stayBookingLinks(stay({ booking_com: BC, expedia: EX, own: OWN }), TRIP, NONE);
  assert.deepEqual(r.map((x) => x.key), ['booking_com', 'expedia', 'own']);
  assert.ok(r.every((x) => x.affiliate === false && x.rel === 'nofollow noopener'));
  assert.equal(r[0].url, `${BC}?checkin=2026-12-18&checkout=2026-12-21&group_adults=2&group_children=2&no_rooms=1`);
  assert.equal(r[1].url, `${EX}?chkin=2026-12-18&chkout=2026-12-21&rm1=a2`, 'Expedia: adults only (children need ages)');
  assert.equal(r[2].url, OWN, 'own site as-is');
  assert.equal(r[0].label, 'Book on Booking.com');
  assert.equal(r[0].labelFr, 'Réserver sur Booking.com');
  assert.equal(r[2].label, 'Hotel’s own site');
  assert.equal(r[2].labelFr, 'Site de l’hôtel');
  // Kids without ages: no age= is invented; the dog adds no parameter anywhere.
  for (const x of r) { assert.doesNotMatch(x.url, /[?&]age=|pet|nflt|c\d/i); }
});

test('unknown party and dates: only what is known is added; Booking.com keeps no_rooms=1', () => {
  const r = L.stayBookingLinks(stay({ booking_com: BC, expedia: EX }), { arrive: '2026-12-18' }, NONE);
  assert.equal(r[0].url, `${BC}?no_rooms=1`);
  assert.equal(r[1].url, EX);
  const r2 = L.stayBookingLinks(stay({ booking_com: BC }), { arrive: '2026-12-21', leave: '2026-12-18', adults: 3, kids: 0 }, NONE);
  assert.deepEqual(q(r2[0].url), { group_adults: '3', group_children: '0', no_rooms: '1' }, 'dates out of order are left off');
});

test('stay22: Booking.com and Expedia go through Allez with link= (the pre-filled property URL) and the trip params; own site never', () => {
  const r = L.stayBookingLinks(stay({ booking_com: BC, expedia: EX, own: OWN }), TRIP, S22);
  assert.deepEqual(r.map((x) => [x.key, x.affiliate, x.rel]), [['booking_com', true, 'sponsored nofollow noopener'], ['expedia', true, 'sponsored nofollow noopener'], ['own', false, 'nofollow noopener']]);
  const b = new URL(r[0].url);
  assert.equal(`${b.origin}${b.pathname}`, 'https://www.stay22.com/allez/booking');
  assert.deepEqual(q(r[0].url), { aid: 'test123', link: `${BC}?checkin=2026-12-18&checkout=2026-12-21&group_adults=2&group_children=2&no_rooms=1`, checkin: '2026-12-18', checkout: '2026-12-21', adults: '2', children: '2', campaign: 'trip_plan' });
  assert.equal(new URL(r[1].url).pathname, '/allez/expedia');
  assert.equal(q(r[1].url).link, `${EX}?chkin=2026-12-18&chkout=2026-12-21&rm1=a2`);
  assert.equal(r[2].url, OWN);
  // The provider without an id is the same as none.
  assert.ok(L.stayBookingLinks(stay({ booking_com: BC }), TRIP, { env: { STAY_AFFILIATE_PROVIDER: 'stay22' } }).every((x) => !x.affiliate));
});

test('booking / expedia programs: the id goes on the matching link only', () => {
  const b = L.stayBookingLinks(stay({ booking_com: BC, expedia: EX }), TRIP, BKG);
  assert.equal(b[0].affiliate, true);
  assert.equal(q(b[0].url).aid, '424242');
  assert.equal(q(b[0].url).label, 'trip');
  assert.equal(q(b[0].url).checkin, '2026-12-18');
  assert.equal(b[1].affiliate, false);
  assert.equal(b[1].url, `${EX}?chkin=2026-12-18&chkout=2026-12-21&rm1=a2`);
  const e = L.stayBookingLinks(stay({ booking_com: BC, expedia: EX }), TRIP, EXP);
  assert.equal(e[0].affiliate, false);
  assert.doesNotMatch(e[0].url, /aid=/);
  assert.equal(e[1].affiliate, true);
  assert.deepEqual([q(e[1].url).affcid, q(e[1].url).afflid, q(e[1].url).rm1], ['CA.DIRECT.X', 'trip', 'a2']);
});

test('host and format checks: wrong host, http, credentials, tracking tags or a non-property page drop that button', () => {
  const bad = [
    { booking_com: 'http://www.booking.com/hotel/ca/x.html' },
    { booking_com: 'https://www.booking.com.evil.example/hotel/ca/x.html' },
    { booking_com: 'https://evilbooking.com/hotel/ca/x.html' },
    { booking_com: 'https://www.booking.com/searchresults.html?ss=x' },
    { booking_com: 'https://www.booking.com/hotel/ca/x.html?aid=999' },
    { booking_com: 'https://user:pw@www.booking.com/hotel/ca/x.html' },
    { expedia: 'https://www.expedia.co.uk/X.h1.Hotel-Information' },
    { expedia: 'https://www.expedia.ca/Kelowna-Hotels.d123.Travel-Guide-Hotels' },
    { expedia: 'https://www.expedia.ca/X.h1.Hotel-Information?utm_source=x' },
    { own: 'http://www.example-hotel.ca/book' },
    { own: 'javascript:alert(1)' },
  ];
  for (const booking of bad) {
    const r = L.stayBookingLinks(stay(booking, { website: null, latitude: null, longitude: null, address: null }), TRIP, NONE);
    assert.deepEqual(r, [], JSON.stringify(booking));
  }
  // expedia.com and a booking.com subdomain are fine.
  assert.equal(L.stayBookingLinks(stay({ expedia: 'https://www.expedia.com/X.h1094373.Hotel-Information' }), TRIP, NONE)[0].key, 'expedia');
  assert.equal(L.stayBookingLinks(stay({ booking_com: 'https://secure.booking.com/hotel/ca/x.html' }), TRIP, NONE)[0].key, 'booking_com');
});

test('the owner\'s own booking link is the own-site button, never affiliate, and wins over the researched one', () => {
  const owner = 'https://reservations.example.com/inn?ref=owner';
  for (const opts of [NONE, S22, BKG, EXP]) {
    const r = L.stayBookingLinks(stay({ own: OWN }, { ownerBookingUrl: owner }), TRIP, opts);
    assert.deepEqual(r.map((x) => [x.key, x.url, x.affiliate]), [['own', owner, false]]);
  }
  // Even with no researched links at all (no fallback then).
  assert.deepEqual(L.stayBookingLinks(stay(undefined, { ownerBookingUrl: owner, info: null }), TRIP, S22).map((x) => x.key), ['own']);
});

test('fallback: with none of the three, one "Check rates" button to the place\'s own website, never a search (2026-11-21)', () => {
  const s = stay(undefined, { info: null });
  for (const opts of [NONE, S22, BKG, EXP]) {
    const r = L.stayBookingLinks(s, TRIP, opts);
    assert.deepEqual(r.map((x) => [x.key, x.url, x.affiliate]), [['search', 'https://www.example-hotel.ca/', false]], 'the website, no dates, no affiliate search');
    assert.equal(r[0].label, 'Check rates');
    assert.equal(r[0].labelFr, 'Voir les tarifs');
    assert.ok(!/allez\/roam|searchresults|Hotel-Search/.test(r[0].url));
  }
  // Nothing at all: no button.
  assert.deepEqual(L.stayBookingLinks(stay(undefined, { info: null, website: null }), TRIP, S22), []);
  // exactStayLinks never falls back.
  assert.deepEqual(L.exactStayLinks(s, TRIP, S22), []);
});

test('withBookingLinks: pick and alternatives get their buttons; petsSome only on a dog trip with pets "some"', () => {
  const block = { stayId: 1, trip: { ...TRIP }, pick: { id: 1, name: 'A', regionLabel: 'Kelowna' }, alternatives: [{ id: 2, name: 'B' }, { id: 3, name: 'C' }] };
  const byId = new Map([
    [1, stay({ booking_com: BC }, { id: 1, info: { pets: 'some', booking: { booking_com: BC } } })],
    [2, stay({ expedia: EX }, { id: 2, info: { pets: 'yes', booking: { expedia: EX } } })],
  ]);
  const out = L.withBookingLinks(block, byId, NONE);
  assert.equal(out.pick.bookingLinks[0].key, 'booking_com');
  assert.equal(out.pick.petsSome, true);
  assert.equal(out.alternatives[0].bookingLinks[0].key, 'expedia');
  assert.equal(out.alternatives[0].petsSome, undefined);
  assert.deepEqual(out.alternatives[1].bookingLinks, []);
  assert.equal(block.pick.bookingLinks, undefined, 'the input block is not changed');
  const noDog = L.withBookingLinks({ ...block, trip: { ...TRIP, dog: false } }, byId, NONE);
  assert.equal(noDog.pick.petsSome, undefined);
});

// "See live prices" (2026-11-20): the Stay22 Maps embed around the stay, only with Stay22 and a checked stay.
test('stay22MapUrl: Stay22 only, checked stays only; town + box + star pin + dates, nightly CAD, French', () => {
  const sbl = require('../stay-booking-links');
  const stay = { id: 1994, name: 'Delta Grand & Spa', regionLabel: 'Kelowna', latitude: 49.891494, longitude: -119.49763 };
  const trip = { arrive: '2026-12-18', leave: '2026-12-20', adults: 2, kids: 1 };
  const env = { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', STAY_AFFILIATE_CAMPAIGN: 'trip-box' };
  const checks = { 1994: { ok: true }, 5: { ok: false } };
  const r = sbl.stay22MapUrl(stay, trip, { env, checks });
  const u = new URL(r.url);
  assert.equal(`${u.origin}${u.pathname}`, 'https://www.stay22.com/embed/gm');
  const q = Object.fromEntries(u.searchParams);
  assert.deepEqual(q, {
    aid: 'okanaganroam', address: 'Kelowna, British Columbia, Canada', nelat: '49.894494', nelng: '-119.49263', swlat: '49.888494', swlng: '-119.50263',
    poi: JSON.stringify([{ lat: 49.891494, lng: -119.49763, name: 'Delta Grand & Spa' }]),
    checkin: '2026-12-18', checkout: '2026-12-20', adults: '2', children: '1', priceper: 'nightly', currency: 'CAD', campaign: 'trip_box',
  });
  assert.equal(r.urlFr, `${r.url}&ljs=fr`);
  // No dates or party: none sent (the map asks).
  const bare = new URL(sbl.stay22MapUrl(stay, null, { env, checks }).url).searchParams;
  assert.equal(bare.get('checkin'), null);
  assert.equal(bare.get('adults'), null);
  // Not Stay22, no id, not checked, checked as not loading, or no town: no button.
  assert.equal(sbl.stay22MapUrl(stay, trip, { env: { STAY_AFFILIATE_PROVIDER: 'booking', STAY_AFFILIATE_ID: 'x' }, checks }), null);
  assert.equal(sbl.stay22MapUrl(stay, trip, { env: { STAY_AFFILIATE_PROVIDER: 'stay22' }, checks }), null);
  assert.equal(sbl.stay22MapUrl(stay, trip, { env: {}, checks }), null);
  assert.equal(sbl.stay22MapUrl({ ...stay, id: 7 }, trip, { env, checks }), null);
  assert.equal(sbl.stay22MapUrl({ ...stay, id: 5 }, trip, { env, checks }), null);
  assert.equal(sbl.stay22MapUrl({ ...stay, regionLabel: '' }, trip, { env, checks }), null);
  // Since 2026-11-21 withBookingLinks no longer adds it (it showed other places too: Dayton wants the place's own page).
  const block = sbl.withBookingLinks({ trip, pick: { id: 1994, regionLabel: 'Kelowna' }, alternatives: [] }, new Map([[1994, { ...stay, info: {} }]]), { env, mapChecks: checks });
  assert.equal(block.pick.livePrices, undefined);
});
