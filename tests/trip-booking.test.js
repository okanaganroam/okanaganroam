'use strict';
// Build My Trip "Book your trip" (2026-11-20, trip-booking.js): the estimate maths and the "Book my trip" steps. Pure
// functions: no server, no database.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const tb = require('../trip-booking.js');
const SITE = require('../trip-site.js');

const venue = (id, name, type, extra = {}) => ({ venue: { id, name, type, ...extra } });
const plan = (...days) => ({ kind: 'multi_day', days: days.map((stops, i) => ({ day: i + 1, stops })) });
const TRIP = { arrive: '2027-07-09', leave: '2027-07-11', nights: 2, adults: 2, kids: 0, dog: false, datesGiven: true };
const CARD = { id: 900, name: 'Lakeside Inn', priceLevel: 2, sleeps: 4 };
const part = (e, key) => e.parts.find((p) => p.key === key);

test('stay: band x nights for one unit; party over Sleeps needs more rooms; unknown Sleeps is one unit with a note', () => {
  const e = tb.tripEstimate(plan([]), CARD, TRIP);
  assert.deepEqual(part(e, 'stay'), { key: 'stay', label: 'Stay', labelFr: 'Hébergement', low: 300, high: 500, count: 2, nights: 2, rooms: 1, roomsUnknown: false });
  assert.equal(e.currency, 'CAD');
  // 6 people, sleeps 4: two rooms.
  const six = tb.tripEstimate(plan([]), CARD, { ...TRIP, adults: 4, kids: 2 });
  assert.equal(part(six, 'stay').rooms, 2);
  assert.equal(part(six, 'stay').low, 600);
  assert.equal(part(six, 'stay').high, 1000);
  assert.ok(six.notes.some((n) => n.key === 'rooms' && /2 rooms or units for 6 people \(sleeps 4 each\)/.test(n.text) && /2 chambres/.test(n.textFr)));
  const unknownSleeps = tb.tripEstimate(plan([]), { ...CARD, sleeps: null }, { ...TRIP, adults: 5 });
  assert.equal(part(unknownSleeps, 'stay').rooms, 1);
  assert.ok(unknownSleeps.notes.some((n) => n.key === 'rooms' && /may need more/.test(n.text)));
  // Level 3 and 4 bands; 4 has no top, 1 has no bottom: never a made-up edge.
  assert.deepEqual([part(tb.tripEstimate(plan([]), { ...CARD, priceLevel: 3 }, TRIP), 'stay').low, part(tb.tripEstimate(plan([]), { ...CARD, priceLevel: 3 }, TRIP), 'stay').high], [500, 800]);
  const lux = tb.tripEstimate(plan([]), { ...CARD, priceLevel: 4 }, TRIP);
  assert.equal(part(lux, 'stay').high, null);
  assert.equal(lux.openHigh, true);
  assert.equal(lux.high, null);
  assert.equal(lux.low, 800);
  const cheap = tb.tripEstimate(plan([]), { ...CARD, priceLevel: 1 }, TRIP);
  assert.equal(part(cheap, 'stay').low, null);
  assert.equal(cheap.openLow, true);
  assert.equal(cheap.high, 300);
  // No band: no stay part, and no total.
  const none = tb.tripEstimate(plan([venue(1, 'Bistro', 'restaurant', { price: 2 })]), { ...CARD, priceLevel: null }, TRIP);
  assert.equal(part(none, 'stay'), undefined);
  assert.equal(none.showTotal, false);
});

test('per-person stop prices x party: tastings, tours, admission; free counts $0; per-group and unpriced are not counted', () => {
  const p = plan(
    [venue(1, 'Hill Winery', 'winery', { cost: { cents: 1500, label: 'Tasting' } }), venue(2, 'Free Winery', 'winery', { freeTasting: true }), venue(3, 'Lake Tours', 'tour', { cost: { cents: 8900, label: 'Tour' } })],
    [venue(4, 'Escape Rooms', 'indoor', { cost: { cents: 12000, label: 'Admission', perGroup: 'room', unit: 'From $120 per room' } }), venue(5, 'Canoe Hire', 'tour', { cost: { cents: 4500, label: 'Rental', unit: '$45 per boat per hour' } }), venue(6, 'Quiet Winery', 'winery'), venue(7, 'Gallery', 'indoor', { freeEntry: true }), venue(8, 'Ask Bar', 'cocktail', { cost: { cents: 1600, label: 'Cocktail' } })],
  );
  const e = tb.tripEstimate(p, CARD, { ...TRIP, adults: 3 });
  assert.equal(e.people, 3);
  assert.equal(e.peopleAssumed, false);
  assert.deepEqual([part(e, 'tastings').low, part(e, 'tastings').high, part(e, 'tastings').count], [45, 45, 2]);
  assert.deepEqual([part(e, 'activities').low, part(e, 'activities').high, part(e, 'activities').count], [267, 267, 2]);
  assert.deepEqual([part(e, 'drinks').low, part(e, 'drinks').high], [48, 48]);
  assert.deepEqual(e.unknown, ['Escape Rooms', 'Canoe Hire', 'Quiet Winery']);
  // Total: stay (3 people, sleeps 4: one unit) + the known parts, rounded out to $10.
  assert.equal(e.low, Math.floor((300 + 45 + 267 + 48) / 10) * 10);
  assert.equal(e.high, Math.ceil((500 + 45 + 267 + 48) / 10) * 10);
});

test('meals: a listed price per person first, else the $ level mapped per trip-site.js; unknown level is not counted', () => {
  const map = SITE.tripEstimate.mealPerPerson;
  assert.deepEqual(map.restaurant[2], [25, 40]);
  const p = plan([venue(1, 'Wildling', 'restaurant', { price: 3, cost: { cents: 6900, label: 'Sample dinner' } }), venue(2, 'Diner', 'restaurant', { price: 2 }), venue(3, 'Bean Cafe', 'cafe', { price: 1 }), venue(4, 'Mystery Grill', 'restaurant'), venue(5, 'The Pub', 'pub', { price: 2 })]);
  const e = tb.tripEstimate(p, CARD, TRIP);
  const m = part(e, 'meals');
  assert.equal(m.count, 4);
  assert.equal(m.low, 2 * (69 + map.restaurant[2][0] + map.cafe[1][0] + map.pub[2][0]));
  assert.equal(m.high, 2 * (69 + map.restaurant[2][1] + map.cafe[1][1] + map.pub[2][1]));
  assert.equal(m.fromPriceLevel, 3);
  assert.deepEqual(e.unknown, ['Mystery Grill']);
});

test('party not given: counted for 2 people and said so; kids count at adult prices with a note', () => {
  const p = plan([venue(1, 'Hill Winery', 'winery', { cost: { cents: 1500, label: 'Tasting' } })]);
  const e = tb.tripEstimate(p, CARD, { ...TRIP, adults: null, kids: null });
  assert.equal(e.people, 2);
  assert.equal(e.peopleAssumed, true);
  assert.equal(part(e, 'tastings').low, 30);
  const k = tb.tripEstimate(p, CARD, { ...TRIP, adults: 2, kids: 2 });
  assert.equal(part(k, 'tastings').low, 60);
  assert.ok(k.notes.some((n) => n.key === 'kids'));
});

test('showTotal: hidden when more paid-type stops are unpriced than priced; outdoor places never block it', () => {
  const unpriced = plan([venue(1, 'A', 'winery'), venue(2, 'B', 'winery'), venue(3, 'C', 'winery', { cost: { cents: 1000, label: 'Tasting' } })]);
  assert.equal(tb.tripEstimate(unpriced, CARD, TRIP).showTotal, false);
  const outdoors = plan([venue(1, 'Knox Mountain', 'outdoor'), venue(2, 'City Beach', 'beach'), venue(3, 'C', 'winery', { cost: { cents: 1000, label: 'Tasting' } })]);
  const e = tb.tripEstimate(outdoors, CARD, TRIP);
  assert.equal(e.showTotal, true);
  assert.deepEqual(e.unknown, ['Knox Mountain', 'City Beach'], 'still listed as price not listed');
  // A stop that appears twice is counted once.
  const twice = plan([venue(3, 'C', 'winery', { cost: { cents: 1000, label: 'Tasting' } })], [venue(3, 'C', 'winery', { cost: { cents: 1000, label: 'Tasting' } })]);
  assert.equal(part(tb.tripEstimate(twice, CARD, TRIP), 'tastings').count, 1);
});

test('band note: Okanagan bands are a summer weekend; a November trip gets the "often lower" note, July does not', () => {
  assert.deepEqual(SITE.tripEstimate.stayBandMonths, [6, 7, 8, 9]);
  assert.ok(!tb.tripEstimate(plan([]), CARD, TRIP).notes.some((n) => n.key === 'band'));
  const nov = tb.tripEstimate(plan([]), CARD, { ...TRIP, arrive: '2026-11-20', leave: '2026-11-22' });
  const n = nov.notes.find((x) => x.key === 'band');
  assert.ok(n);
  assert.match(n.text, /summer weekend night; other dates are often lower/);
  assert.match(n.textFr, /fin de semaine en été/);
  assert.deepEqual(tb.nightMonths({ arrive: '2026-11-30', nights: 2 }), [11, 12]);
});

test('bookingSteps: the stay first, then stops in plan order, only with links, no duplicates by id or URL', () => {
  const card = { id: 900, name: 'Lakeside Inn', bookingLinks: [
    { key: 'booking_com', label: 'Book on Booking.com', labelFr: 'Réserver sur Booking.com', url: 'https://www.stay22.com/allez/booking?aid=x', affiliate: true, rel: 'sponsored nofollow noopener' },
    { key: 'own', label: 'Hotel’s own site', labelFr: 'Site de l’hôtel', url: 'https://inn.example.com/book', affiliate: false, rel: 'nofollow noopener' }] };
  const checklist = [
    { venueId: 11, name: 'Hill Winery', url: 'https://hill.example.com/book', label: 'Book a tasting', labelFr: 'Réserver une dégustation' },
    { venueId: 12, name: 'Wildling', url: 'https://wildling.example.com/reserve', label: 'Reserve a table', labelFr: 'Réserver une table' },
    { venueId: 11, name: 'Hill Winery', url: 'https://hill.example.com/other', label: 'Book a tasting', labelFr: 'Réserver une dégustation' },
    { venueId: 13, name: 'Same Engine', url: 'https://WWW.hill.example.com/book/', label: 'Book', labelFr: 'Réserver' },
    { venueId: 14, name: 'Bad Link', url: 'javascript:alert(1)', label: 'Book', labelFr: 'Réserver' },
    { venueId: 15, name: 'No Link', url: null, label: 'Book', labelFr: 'Réserver' },
    { venueId: 900, name: 'Lakeside Inn', url: 'https://inn.example.com/other', label: 'Book', labelFr: 'Réserver' },
  ];
  const steps = tb.tripBookingSteps(card, checklist);
  assert.deepEqual(steps.map((s) => [s.kind, s.id]), [['stay', 900], ['venue', 11], ['venue', 12]]);
  assert.deepEqual(steps[0], { kind: 'stay', id: 900, name: 'Lakeside Inn', label: 'Book on Booking.com', labelFr: 'Réserver sur Booking.com', url: 'https://www.stay22.com/allez/booking?aid=x', affiliate: true, rel: 'sponsored nofollow noopener', link: 'booking_com' });
  assert.deepEqual(steps[1], { kind: 'venue', id: 11, name: 'Hill Winery', label: 'Book a tasting', labelFr: 'Réserver une dégustation', url: 'https://hill.example.com/book', affiliate: false, rel: 'nofollow noopener', link: 'booking' });
  // No stay link: the stops only. Nothing at all: [].
  assert.deepEqual(tb.tripBookingSteps({ id: 900, bookingLinks: [] }, checklist.slice(0, 2)).map((s) => s.id), [11, 12]);
  assert.deepEqual(tb.tripBookingSteps(null, null), []);
});

test('withTripBooking: every stay card gets its own estimate and steps; the block carries the pick\'s', () => {
  const block = { stayId: 900, trip: TRIP, pick: { ...CARD, bookingLinks: [{ key: 'own', label: 'Own', labelFr: 'Own', url: 'https://inn.example.com/', affiliate: false }] },
    alternatives: [{ id: 901, name: 'Big Lodge', priceLevel: 3, sleeps: 2, bookingLinks: [] }], checklist: [{ venueId: 11, name: 'Hill Winery', url: 'https://hill.example.com/book', label: 'Book a tasting', labelFr: 'Réserver une dégustation' }] };
  const out = tb.withTripBooking(block, plan([venue(11, 'Hill Winery', 'winery', { cost: { cents: 1500, label: 'Tasting' } })]));
  assert.equal(out.estimate, out.pick.estimate);
  assert.equal(out.bookingSteps, out.pick.bookingSteps);
  assert.deepEqual(out.bookingSteps.map((s) => s.kind), ['stay', 'venue']);
  assert.equal(part(out.alternatives[0].estimate, 'stay').low, 500);
  assert.deepEqual(out.alternatives[0].bookingSteps.map((s) => s.kind), ['venue']);
  assert.equal(tb.withTripBooking(null, {}), null);
});
