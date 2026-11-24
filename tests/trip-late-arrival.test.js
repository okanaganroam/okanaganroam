'use strict';
// Build My Trip: one of the party arrives later than the others (2026-11-23). The owner's request, at 390px:
//   "Plan a 3-day girls getaway in Naramata for three adults from October 8 to October 10, 2027. We want wineries, a
//    sunset dinner and a lakeside hotel. Our friend arrives only on October 9 and needs a separate room for one night."
// then in the chat: "Our friend joins only on October 9 and needs her own room that night. Please make sure the hotel
// booking reflects this, and only include her for activities from October 9."
// Main showed three adults and two assumed rooms for both nights, the booking link carried 3 adults / 2 rooms / Oct
// 8–10, the shared copy said nothing, and the chat added an unrelated activity ("include" + "activities").
// Now (trip-late-arrival.js): the arrangement is read, kept apart (2 adults both nights + 1 from Oct 9, own room, one
// night), said on every surface, and booked as what it is: two separate bookings, each link built for its own dates,
// adults and rooms; never a 3-adults / 2-rooms / both-nights link shown as the arrangement. The chat answers once and
// changes no stop. A plan without it is untouched.
// Parts 1-9 are pure; parts 10-14 run the planner and the chat on the repo's seed database (word rules, no AI).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const LA = require('../trip-late-arrival.js');
const SBL = require('../stay-booking-links.js');
const TB = require('../trip-booking.js');
const H = require('../trip-honest-plan.js');
const L = require('../trip-workspace-layout.js');
const TS = require('../trip-stays.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const TOWN = WR ? 'Whistler' : 'Naramata';
const V3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHATPAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');

const BASE = `Plan a 3-day girls getaway in ${TOWN} for three adults from October 8 to October 10, 2027. We want wineries, a sunset dinner and a lakeside hotel.`;
const LATE = 'Our friend arrives only on October 9 and needs a separate room for one night.';
const OWNER = `${BASE} ${LATE}`;
const FOLLOW = 'Our friend joins only on October 9 and needs her own room that night. Please make sure the hotel booking reflects this, and only include her for activities from October 9.';
const DATES = ['2027-10-08', '2027-10-09', '2027-10-10'];
const CTX = { days: 3, dayDates: DATES, dated: true, adults: 3, kids: 0, roomsGiven: null };
const shape = (n) => (n ? [n.kind, n.n, n.when, n.ownRoom] : null);
// Never said by any wording here: that a room is available, or that anything is booked or reserved.
const CLAIM_RE = /\bavailable\b|\bavailability is\b|\bconfirmed for you\b|\bis booked\b|\bwe(?:'ve| have) (?:booked|reserved)\b|\bdisponible\b|\best réservé\b/i;

test('1. the statement is read from the request: who, which day, a room of their own; English and French', () => {
  assert.deepEqual(shape(LA.readLate(OWNER)), ['join', 1, { md: [10, 9] }, true]);
  const cases = [
    ['Our friend joins only on October 9 and needs her own room that night.', ['join', 1, { md: [10, 9] }, true]],
    ['my sister leaves a day early', ['leave', 1, { early: 1 }, false]],
    ['two friends join us on day 2', ['join', 2, { day: 2 }, false]],
    ['One of us is arriving Saturday', ['join', 1, { wd: 6 }, false]],
    ['our friend Sarah arrives Oct. 9 and wants her own room', ['join', 1, { md: [10, 9] }, true]],
    ['she’ll skip day 1', ['join', 1, { late: 1 }, false]],
    ['A friend is joining us for the last night', ['join', 1, { lastNight: true }, false]],
    ['my brother can only come on the second day', ['join', 1, { day: 2 }, false]],
    ['our friend won’t arrive until the 9th', ['join', 1, { dom: 9 }, false]],
    ['my mom has to leave on October 9', ['leave', 1, { md: [10, 9] }, false]],
    ['one of us arrives a day late. She needs her own room.', ['join', 1, { late: 1 }, true]],
    ['our friend is only with us from Saturday', ['join', 1, { wd: 6 }, false]],
    ['my dad stays only the first night', ['leave', 1, { night: 1 }, false]],
    ['one friend misses the first two days', ['join', 1, { late: 2 }, false]],
    ['he arrives on 2027-10-09', ['join', 1, { iso: '2027-10-09' }, false]],
    ['Notre amie arrive seulement le 9 octobre et a besoin d’une chambre séparée pour une nuit.', ['join', 1, { md: [10, 9] }, true]],
    ['Ma sœur part un jour plus tôt', ['leave', 1, { early: 1 }, false]],
    ['deux amis nous rejoignent le jour 2', ['join', 2, { day: 2 }, false]],
    ['Une amie ne nous rejoint que le samedi', ['join', 1, { wd: 6 }, false]],
  ];
  for (const [t, want] of cases) assert.deepEqual(shape(LA.readLate(`Three days in ${TOWN} for 3 adults. ${t}`)), want, t);
  // Conservative: the trip's own dates, everyone's arrival, a flight, an event, a wish for rooms, a friend who simply
  // comes along -- none of these is someone arriving later.
  for (const t of [BASE, 'We arrive on October 9 and leave October 11', 'my husband and I arrive on Friday', 'a trip with my friend, arriving Friday', 'Santa arrives on December 5',
    'our flight arrives at 3 pm on October 8', 'we need two separate rooms', 'my sister loves wine', 'our friends are joining us for dinner', 'a friend recommended day 2 at the winery', 'my friend joins us',
    'the train arrives on Saturday', 'Dinner on October 9 for my sister’s birthday', 'we leave a day early', 'Nous arrivons le 9 octobre', 'my friend wants a separate room', 'one of us does not drink',
    'our friend is coming with us', 'my wife and I are arriving Saturday', 'one person has a severe peanut allergy', '']) {
    assert.equal(LA.readLate(t), null, t);
    assert.equal(LA.stripLate(t), t, t);
  }
});

test('2. its sentence is taken out of what the planner reads; the rest of the request is left as typed', () => {
  assert.equal(LA.stripLate(OWNER), BASE);
  assert.equal(LA.stripLate(`3 days in ${TOWN}. Our friend arrives on October 9, 2027, and needs her own room. We love wine.`), `3 days in ${TOWN}. We love wine.`);
  assert.equal(LA.stripLate(`3 days in ${TOWN} for three adults, wineries and a hotel, one of us arrives on Oct 9 and needs a separate room, no car`), `3 days in ${TOWN} for three adults, wineries and a hotel, no car.`);
  assert.equal(LA.stripLate(`A weekend in ${TOWN} and my sister leaves a day early`), `A weekend in ${TOWN}.`);
  assert.equal(LA.stripLate('One of us arrives a day late. She needs her own room. Wineries please.'), 'Wineries please.');
  // "a day early" / "1 day late" are about one person, never the trip's length or dates.
  for (const t of [OWNER, `${BASE} My sister leaves a day early.`, `${BASE} One of us arrives 1 day late.`]) assert.ok(!/friend|sister|one of us|day early|day late|October 9\b/.test(LA.stripLate(t)), LA.stripLate(t));
  // A room said for the one who comes later is not the trip's number of rooms.
  assert.equal(TS.roomsInText(LA.stripLate(`${BASE} Our friend arrives October 9 and needs one separate room.`)), null);
  assert.deepEqual(TS.roomsInText(LA.stripLate(`${BASE} We need two rooms. Our friend arrives October 9.`)), { rooms: 2 });
});

test('3. worked out against the trip: 2 travellers both nights + 1 joining Oct 9 for one night in a room of their own', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX);
  assert.deepEqual([a.kind, a.n, a.day, a.base, a.mode, a.rooms, a.nightsA, a.nightsB, a.date], ['join', 1, 2, 2, 'split', { a: 1, b: 1, aAssumed: false }, 2, 1, '2027-10-09']);
  assert.deepEqual([1, 2, 3].map((d) => LA.peopleOn(a, d)), [2, 3, 3]);
  const r = (t, ctx = {}) => LA.resolve(LA.readLate(t), { ...CTX, ...ctx });
  // The same arrangement said other ways.
  for (const t of ['Our friend arrives on day 2 and needs her own room', 'our friend arrives Saturday and needs her own room', 'she’ll skip day 1. She needs her own room.', 'our friend arrives a day late and needs a separate room', 'our friend joins for the last night and needs her own room', 'our friend arrives on the 9th and needs her own room'])
    assert.deepEqual([r(t).day, r(t).mode, r(t).nightsB], [2, 'split', 1], t);
  // Leaving early: there for the first night only.
  const lv = r('my sister leaves a day early and has her own room');
  assert.deepEqual([lv.kind, lv.day, lv.mode, lv.nightsB], ['leave', 2, 'split', 1]);
  assert.deepEqual([1, 2, 3].map((d) => LA.peopleOn(lv, d)), [3, 3, 2]);
  // Two who come later are counted within the party said ("for three adults"): 1 + 2.
  const two = r('two friends join us on day 2');
  assert.deepEqual([two.n, two.base, two.mode, two.rooms.b, two.rooms.bAssumed], [2, 1, 'split', 1, true]);
  // The explicit room count still wins: "two rooms" is two on the night everyone is there, one before.
  assert.deepEqual(r('Our friend arrives October 9 and needs her own room', { roomsGiven: 2 }).rooms, { a: 1, b: 1, aAssumed: false });
  assert.deepEqual(r('Our friend arrives October 9 and needs her own room', { roomsGiven: 3 }).rooms, { a: 2, b: 1, aAssumed: false });
  // No room said: the labelled assumption (3 adults -> 2 rooms) gives the later arrival the second room, marked assumed.
  assert.deepEqual([r('Our friend arrives October 9').mode, r('Our friend arrives October 9').rooms], ['split', { a: 1, b: 1, aAssumed: false, bAssumed: true }]);
  // A number of rooms said and no room of their own: they join the others' rooms (one booking, said as such).
  assert.equal(r('Our friend arrives October 9', { roomsGiven: 1 }).mode, 'shared');
  assert.equal(r('Our friend arrives October 9', { adults: 4 }).mode, 'shared'); // 4 adults: 2 rooms with or without them
  // Joining on the last day: no night at all.
  assert.equal(r('Our friend arrives October 10').mode, 'day');
  // Nothing staggered, or not placeable: said, never guessed.
  assert.equal(r('Our friend arrives October 8'), null);
  assert.equal(r('my sister leaves on October 10'), null);
  assert.equal(r('Our friend arrives October 12').unresolved, 'outside');
  assert.equal(r('Our friend arrives October 9', { dayDates: null }).unresolved, 'no_dates');
  assert.equal(r('Our friend arrives October 9', { adults: null }).unresolved, 'party');
  assert.equal(r('our friends arrive on day 2').unresolved, 'party'); // how many is not said
  assert.equal(r('Our friend arrives October 9', { adults: 1 }).unresolved, 'party');
  assert.equal(r('Our friend arrives on day 2', { days: 1, dayDates: ['2027-10-08'] }).unresolved, 'one_day');
  // "arrives October 9" and "skips day 1" are the same thing on this trip.
  assert.equal(LA.sameOnTrip(LA.readLate(OWNER), LA.readLate('she’ll skip day 1'), 3, DATES), true);
  assert.equal(LA.sameOnTrip(LA.readLate(OWNER), LA.readLate('our friend arrives on day 3'), 3, DATES), false);
});

test('4. the words: who is there which nights, each day’s head count; English and French; nothing claims a room is available', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX), w = LA.words(a, false), f = LA.words(a, true);
  assert.equal(w.line, '2 adults Oct 8–10 · 1 more from Oct 9 (time not set), own room, 1 night');
  assert.equal(f.line, '2 adultes 8–10 oct. · 1 de plus dès le 9 oct. (heure à préciser), chambre à part, 1 nuit');
  assert.equal(w.who, '2 adults + 1 from Oct 9');
  assert.equal(f.who, '2 adultes + 1 dès le 9 oct.');
  assert.deepEqual(w.days, { 1: 'for 2', 2: 'for 2 + 1 arriving', 3: 'for all 3' });
  assert.deepEqual(f.days, { 1: 'pour 2', 2: 'pour 2 + 1 qui arrive', 3: 'pour les 3' });
  assert.equal(w.act, 'Day 1 is planned for 2. Oct 9 (Day 2): for 2 until they arrive (time not set). All 3 from Day 3.');
  assert.equal(f.act, 'Le jour 1 est prévu pour 2. 9 oct. (jour 2) : pour 2 jusqu’à son arrivée (heure à préciser). Les 3 dès le jour 3.');
  // Without the visitor's own dates the days are named, never a date.
  const u = LA.words(LA.resolve(LA.readLate('our friend arrives on day 2 and needs her own room'), { ...CTX, dated: false }), false);
  assert.equal(u.line, '2 adults, all 3 days · 1 more from day 2 (time not set), own room, 1 night');
  // Leaving early, and the assumed room.
  assert.equal(LA.words(LA.resolve(LA.readLate('my sister leaves a day early'), CTX), false).line, '2 adults Oct 8–10 · 1 more until Oct 9 (time not set), own room (assumed), 1 night');
  const e = LA.entry(a, null);
  assert.deepEqual([e.ask, e.status, e.short, e.share], ['late_arrival', 'partial', w.line, 'j1d2o']);
  for (const s of [w.line, f.line, w.act, f.act, e.text, e.textFr, LA.CANT.en, LA.CANT.fr, LA.CONFIRM.en, LA.CONFIRM.fr]) assert.ok(!CLAIM_RE.test(s), s);
  // A statement that cannot be placed asks; it never changes who the stay is for.
  for (const why of ['no_dates', 'outside', 'party', 'one_day']) { const x = LA.entry({ key: 'late_arrival', unresolved: why }); assert.equal(x.status, 'unknown'); assert.ok(x.text && x.textFr); }
});

// A stay as the link builder takes it: one with Booking.com, Expedia and its own site; one with its own site only.
const HOTEL = { id: 9101, name: 'Split Fixture Hotel', info: { booking: { booking_com: 'https://www.booking.com/hotel/ca/split-fixture-hotel.html', expedia: 'https://www.expedia.ca/Town-Hotels-Split-Fixture-Hotel.h9101.Hotel-Information', own: 'https://split-fixture-hotel.example.com/book' } } };
const MOTEL = { id: 9102, name: 'Split Fixture Motel', info: { booking: { own: 'https://split-fixture-motel.example.com/reserve' } } };
const TRIP = (o = {}) => ({ arrive: '2027-10-08', leave: '2027-10-10', nights: 2, adults: 3, kids: null, rooms: 2, roomsAssumed: true, dog: false, datesGiven: true, stayStatus: 'confirmed', tripStart: '2027-10-08', tripEnd: '2027-10-10', tripSource: 'request', ...o });
const wrap = (url) => new URL(url).searchParams;
const inner = (url) => new URL(wrap(url).get('link')).searchParams;

test('5. the stay is two separate bookings, each link built for its own dates, adults and rooms; never 3 adults / 2 rooms / both nights', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX);
  assert.deepEqual(LA.stayParts(a, TRIP()), [
    { n: 1, adults: 2, kids: 0, rooms: 1, arrive: '2027-10-08', leave: '2027-10-10', nights: 2 },
    { n: 2, adults: 1, kids: 0, rooms: 1, arrive: '2027-10-09', leave: '2027-10-10', nights: 1 },
  ]);
  // Dates confirmed: Booking.com and Expedia (through Stay22) each open with the booking's own values.
  const s = LA.cardSplit(HOTEL, TRIP(), a, {});
  assert.equal(s.distinct, true);
  assert.deepEqual(s.links.map((l) => l.key), ['booking_com', 'expedia', 'own']);
  const want = [[s.links, '2027-10-08', '2027-10-10', '2', 'a2'], [s.links2, '2027-10-09', '2027-10-10', '1', 'a1']];
  for (const [links, cin, cout, ad, rm1] of want) {
    const b = links.find((l) => l.key === 'booking_com'), x = links.find((l) => l.key === 'expedia');
    assert.deepEqual(['checkin', 'checkout', 'adults', 'rooms'].map((k) => wrap(b.url).get(k)), [cin, cout, ad, '1']);
    assert.deepEqual(['checkin', 'checkout', 'group_adults', 'no_rooms'].map((k) => inner(b.url).get(k)), [cin, cout, ad, '1']);
    assert.deepEqual(['checkin', 'checkout', 'adults', 'rooms'].map((k) => wrap(x.url).get(k)), [cin, cout, ad, '1']);
    assert.deepEqual(['chkin', 'chkout', 'rm1', 'rm2'].map((k) => inner(x.url).get(k)), [cin, cout, rm1, null]);
    // What each link is read to carry (the handoff's own reader): its dates, adults and rooms.
    for (const l of [b, x]) { const c = SBL.stayLinkCarries(l.key, l.url); assert.deepEqual([c.dates, c.adults, c.rooms], [true, true, true], l.key); }
  }
  // No link anywhere is for three adults, or for two rooms.
  for (const l of [...s.links, ...s.links2]) assert.ok(!/(?:adults|group_adults)=3\b|(?:rooms|no_rooms)=2\b|rm2=|rm1=a3/.test(decodeURIComponent(l.url)), l.url);
  assert.equal(s.text.note, 'One booking link can’t hold different dates per room, so these are two separate bookings. Booking 1: 2 adults, 1 room, Oct 8–10. Booking 2: 1 adult, 1 room, Oct 9–10. Each link opens with its own dates, guests and rooms.');
  assert.equal(s.text.card, 'Two bookings, since one link can’t hold both. 1: 2 adults, 1 room, Oct 8–10. 2: 1 adult, 1 room, Oct 9–10.');
  assert.deepEqual(s.text.btn, ['2 adults · Oct 8–10', '1 adult · Oct 9–10']);
  assert.equal(s.textFr.card, 'Deux réservations, car un lien ne peut pas contenir les deux. 1 : 2 adultes, 1 chambre, 8–10 oct. 2 : 1 adulte, 1 chambre, 9–10 oct.');
  assert.deepEqual(s.textFr.btn, ['2 adultes · 8–10 oct.', '1 adulte · 9–10 oct.']);
  // Dates not confirmed yet (proposed from the trip's dates): no link carries a date, as for every stay link.
  const p = LA.cardSplit(HOTEL, TRIP({ datesGiven: false, stayStatus: 'proposed' }), a, {});
  for (const l of [...p.links, ...p.links2]) assert.ok(!/2027-10/.test(decodeURIComponent(l.url)), l.url);
  assert.equal(wrap(p.links[0].url).get('adults'), '2');
  assert.equal(wrap(p.links2[0].url).get('adults'), '1');
  assert.equal(p.distinct, true); // Booking.com takes the guests without dates: still a button for each
  // Expedia alone shows guests only with dates: until they are confirmed, ONE button and the way to get two.
  const xOnly = { ...HOTEL, info: { booking: { expedia: HOTEL.info.booking.expedia } } };
  const px = LA.cardSplit(xOnly, TRIP({ datesGiven: false, stayStatus: 'proposed' }), a, {});
  assert.equal(px.distinct, false);
  assert.match(px.text.card, /Confirm the dates to get a link for each booking\.$/);
  assert.equal(LA.cardSplit(xOnly, TRIP(), a, {}).distinct, true);
  // A hotel's own site can't be pre-filled: ONE button, and the two bookings said beside it.
  const m = LA.cardSplit(MOTEL, TRIP(), a, {});
  assert.equal(m.distinct, false);
  assert.deepEqual(m.links.map((l) => l.url), ['https://split-fixture-motel.example.com/reserve']);
  assert.deepEqual(m.text.btn, []);
  assert.equal(m.text.card, 'Two bookings, since one link can’t hold both. 1: 2 adults, 1 room, Oct 8–10. 2: 1 adult, 1 room, Oct 9–10. Make both on the hotel’s own site.');
  assert.match(m.text.note, /This link can’t be pre-filled: make both bookings there\.$/);
  // Its handoff note is booking 1's own (2 adults, 1 room), never the whole party's.
  assert.match(m.handoff[0].note, /2 adults and 1 room/);
  assert.match(m.handoff2[0].note, /1 adult and 1 room/);
  for (const t of [s.text, s.textFr, m.text, m.textFr, px.text]) for (const v of [t.note, t.card, t.chat, t.confirm]) assert.ok(!CLAIM_RE.test(v), v);
  // On the block: the trip's split, each card's links (booking 1's), the second booking's links, the card's own words.
  const block = LA.applyToStay({ trip: TRIP(), pick: { id: 9101, name: HOTEL.name, bookingLinks: [] }, alternatives: [{ id: 9102, name: MOTEL.name, bookingLinks: [] }] }, a, new Map([[9101, HOTEL], [9102, MOTEL]]), {});
  assert.equal(block.trip.split.line, '2 adults Oct 8–10 · 1 more from Oct 9 (time not set), own room, 1 night');
  assert.equal(block.trip.split.who, '2 adults + 1 from Oct 9');
  assert.equal(block.pick.split.distinct, true);
  assert.equal(block.pick.bookingLinks2.length, 3);
  assert.equal(block.alternatives[0].split.distinct, false);
  // Book my trip: a step for each booking when each has its link; one step otherwise.
  const steps = TB.tripBookingSteps(block.pick, []).filter((x) => x.kind === 'stay');
  assert.deepEqual(steps.map((x) => [x.part, x.sub, x.subFr]), [[1, '2 adults, 1 room, Oct 8–10', '2 adultes, 1 chambre, 8–10 oct.'], [2, '1 adult, 1 room, Oct 9–10', '1 adulte, 1 chambre, 9–10 oct.']]);
  assert.equal(wrap(steps[0].url).get('adults'), '2');
  assert.equal(wrap(steps[1].url).get('checkin'), '2027-10-09');
  assert.deepEqual(TB.tripBookingSteps(block.alternatives[0], []).filter((x) => x.kind === 'stay').map((x) => x.part), [undefined]);
  // The other arrangements: one booking, said for what the link is.
  const sh = LA.cardSplit(HOTEL, TRIP({ adults: 4 }), LA.resolve(LA.readLate('Our friend arrives October 9'), { ...CTX, adults: 4 }), {});
  assert.equal(sh.links2.length, 0);
  assert.equal(wrap(sh.links[0].url).get('adults'), '4');
  assert.match(sh.text.note, /^This link is for the fullest night: 4 adults, 2 rooms \(assumed\), Oct 8–10\. 1 arrives Oct 9: tell the hotel, a booking link can’t change guests from night to night\.$/);
});

test('6. the estimate: the stay as 1 room × 2 nights + 1 room × 1 night; each day’s stops for the people there that day', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX);
  const parts = LA.stayParts(a, TRIP());
  const card = { id: 1, name: 'X', priceLevel: 2, sleeps: 2 };
  const band = SITE.tripEstimate.stayNight[2];
  const stay = TB.stayPart(card, { ...TRIP(), split: { mode: 'split', parts } }, 3);
  assert.equal(stay.low, band[0] === null ? null : band[0] * 3);
  assert.equal(stay.high, band[1] === null ? null : band[1] * 3);
  assert.deepEqual(stay.split, [{ nights: 2, rooms: 1 }, { nights: 1, rooms: 1 }]);
  // (Main priced it as two rooms for both nights: 4 room-nights.)
  const plain = TB.stayPart(card, TRIP(), 3);
  assert.equal(plain.low, band[0] === null ? null : band[0] * 4);
  const stop = (id, day) => ({ daypart: 'midday', venue: { id, name: `Tasting ${id}`, type: 'winery', cost: { cents: 1000, label: 'Tasting' } } });
  const plan = { kind: 'multi_day', days: [{ day: 1, stops: [stop(1, 1)] }, { day: 2, stops: [stop(2, 2)] }, { day: 3, stops: [stop(3, 3)] }] };
  const est = TB.tripEstimate(plan, card, { ...TRIP(), split: { mode: 'split', parts }, late: a });
  assert.equal(est.parts.find((p) => p.key === 'tastings').low, 10 * 2 + 10 * 3 + 10 * 3);
  assert.deepEqual(est.notes.filter((n) => ['rooms', 'late'].includes(n.key)).map((n) => n.text), ['Stay counted as 1 room × 2 nights + 1 room × 1 night (two bookings).', 'Day 1 counted for 2, the other days for 3.']);
  assert.equal(TB.tripEstimate(plan, card, TRIP()).parts.find((p) => p.key === 'tastings').low, 90); // without it: everyone, every day
  assert.ok(!est.notes.some((n) => /within|under budget/i.test(n.text)));
});

test('7. sharing: la= carries known values only and reads back; an older link is untouched', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX);
  assert.equal(LA.toShare(a), 'j1d2o');
  assert.deepEqual(shape(LA.fromShare('j1d2o')), ['join', 1, { day: 2 }, true]);
  assert.deepEqual(shape(LA.fromShare('l2d3x')), ['leave', 2, { day: 3 }, false]);
  for (const bad of ['', 'j1d2', 'x1d2o', 'j0d2o', 'j1d0o', 'j1d2o&x', 'our friend arrives', 'j1d99o', undefined]) assert.equal(LA.fromShare(bad), null, String(bad));
  const c = H.parseShareContext({ stops: 'venue:1', ad: '3', rm: '2', ra: '1', la: 'j1d2o' });
  assert.equal(c.late.kind, 'join');
  assert.match(H.shareContextQuery(c), /(?:^|&)la=j1d2o(?:&|$)/);
  const old = H.parseShareContext({ stops: 'venue:1', ad: '3', rm: '2', ra: '1' });
  assert.equal(old.late, undefined);
  assert.ok(!/la=/.test(H.shareContextQuery(old)));
  assert.equal(H.parseShareContext({ ad: '3', la: 'Our friend Sarah' }).late, undefined); // no free text
  // The page: the link gains la= only from the plan's own entry, and the copied text says its sentence.
  assert.ok(V4.includes("if (laOn && /^[jl][1-9]d[1-9][0-9]?[ox](?:\\.(?:t[0-2][0-9][0-5][0-9]|w[a-z]{1,2}))?$/.test(laOn.share || '')) out += '&la=' + laOn.share;"));
  assert.ok(V4.includes("if (laT && (laT.copy || laT.text)) lines.push((fr && (laT.copyFr || laT.textFr)) || laT.copy || laT.text);"));
});

const STOPS = [{ key: '1-morning', id: 11, name: 'Manitou Park', type: 'beach', day: 1 }, { key: '1-midday', id: 12, name: 'Lake Bistro', type: 'restaurant', day: 1 }, { key: '2-late', id: 13, name: 'Paddle Shop', type: 'outdoor', day: 2 }, { key: '3-afternoon', id: 14, name: 'Hill Winery', type: 'winery', day: 3 }];
const rules = (m, request = OWNER) => tc.rulesRead(m, STOPS, { request, days: 3 });
const opsOf = (r) => (r && r.ops ? r.ops.map((o) => o.o) : []);

test('8. the chat’s word rules (no AI): one answer, never a stop added; "include her for activities" is about a person', () => {
  const r = rules(FOLLOW);
  assert.deepEqual(opsOf(r), ['late']);
  assert.equal(r.access, true); // fixed rules: the AI's reading never stands in for them
  assert.deepEqual([r.ops[0].late, r.ops[0].said, r.ops[0].room, r.ops[0].book, r.ops[0].part], [null, true, true, true, true]); // restated: nothing new to record
  // On a plan that did not have it: the statement is what gets recorded, with the room.
  const fresh = rules(FOLLOW, BASE);
  assert.deepEqual(opsOf(fresh), ['late']);
  assert.deepEqual(shape(fresh.ops[0].late), ['join', 1, { md: [10, 9] }, true]);
  // Each part alone, and nearby phrasings: an answer about the arrangement, never an add, a removal or a shorter trip.
  for (const m of ['only include her for activities from October 9', 'Please make sure the hotel booking reflects this, and only include her for activities from October 9.', 'include her in the activities from Saturday',
    'she’ll skip day 1', 'Please make sure the hotel booking reflects this', 'count her in from day 2', 'plan the activities without her on day 1', 'day 1 is just the two of us',
    'Inclure notre amie dans les activités à partir du 9 octobre', 'Notre amie nous rejoint seulement le 9 octobre et a besoin de sa propre chambre']) {
    for (const req of [OWNER, BASE]) {
      const x = rules(m, req);
      assert.ok(!opsOf(x).some((o) => ['add', 'remove', 'replace', 'days', 'date', 'stay', 'party'].includes(o)), `${m} -> ${JSON.stringify(opsOf(x))}`);
      if (req === OWNER || !/make sure the hotel booking reflects this$/.test(m)) assert.deepEqual(opsOf(x), ['late'], `${m} (${req === OWNER ? 'with' : 'without'})`);
    }
  }
  // The cause on main, narrowly: "include her / him / them" is not "include a <kind of stop>".
  assert.match(fs.readFileSync(require.resolve('../trip-chat.js'), 'utf8'), /include\(\?! \(\?:her\|him\|them\)\\b\)/);
  // An unrelated part of the same message is still done; an ordinary add is still an add.
  const both = rules('Our friend arrives October 9 and needs her own room. Add a winery on day 3.', BASE);
  assert.deepEqual(opsOf(both).sort(), ['add', 'late']);
  assert.deepEqual(opsOf(rules('include a brewery on day 2')), ['add']);
  assert.deepEqual(opsOf(rules('add some activities on day 2')), ['add']);
  // A stop asked for one person is a stop to add, as before; a person added to what is planned is not.
  for (const m of ['add a spa for her on day 2', 'add a dinner for her birthday on day 2', 'include some activities for her on day 2']) assert.deepEqual(opsOf(rules(m)), ['add'], m);
  for (const m of ['add her to the dinner on day 2', 'leave her out of day 1', 'make sure the booking takes her into account', 'Assurez-vous que la réservation en tient compte et incluez-la dans les activités à partir du 9 octobre.']) assert.deepEqual(opsOf(rules(m)), ['late'], m);
  // Not about this at all: read by the usual rules.
  for (const m of ['swap the day 1 dinner', 'we are 4 adults', 'make it 2 rooms', 'we arrive Friday night', 'a hotel with a pool']) assert.ok(!opsOf(rules(m, BASE)).includes('late'), m);
});

test('9. the chat’s reply: one short answer -- the stay’s bookings, why they are separate, each day’s head count', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX);
  const hotel = { split: (({ text, textFr }) => ({ text, textFr }))(LA.cardSplit(HOTEL, TRIP(), a, {})) };
  const motel = { split: (({ text, textFr }) => ({ text, textFr }))(LA.cardSplit(MOTEL, TRIP(), a, {})) };
  assert.equal(LA.chatReply(a, motel, 'en', {}), 'Already on your plan. Stay: two separate bookings, since one booking link can’t hold different dates per room. 1: 2 adults, 1 room, Oct 8–10. 2: 1 adult, 1 room, Oct 9–10. Make both on the hotel’s own site. Activities: Day 1 is planned for 2. Oct 9 (Day 2): for 2 until they arrive (time not set). All 3 from Day 3. No stops changed.');
  assert.equal(LA.chatReply(a, hotel, 'en', { recorded: true }), 'Noted, it’s on your plan. Stay: two separate bookings, since one booking link can’t hold different dates per room. 1: 2 adults, 1 room, Oct 8–10. 2: 1 adult, 1 room, Oct 9–10. Each has its own button on the stay card. Activities: Day 1 is planned for 2. Oct 9 (Day 2): for 2 until they arrive (time not set). All 3 from Day 3. No stops changed.');
  assert.match(LA.chatReply(a, hotel, 'fr', {}), /^Déjà sur votre plan\. Hébergement : deux réservations distinctes, car un lien de réservation ne peut pas avoir des dates différentes par chambre\. 1 : 2 adultes, 1 chambre, 8–10 oct\. 2 : 1 adulte, 1 chambre, 9–10 oct\. .*Activités : Le jour 1 est prévu pour 2\. 9 oct\. \(jour 2\) : pour 2 jusqu’à son arrivée \(heure à préciser\)\. Les 3 dès le jour 3\. Aucun arrêt n’a changé\.$/);
  // Beside another change in the same message it does not say "No stops changed".
  assert.ok(!/No stops changed/.test(LA.chatReply(a, hotel, 'en', { recorded: true, alone: false })));
  // No place to stay on the plan; a date that cannot be placed (one concise question); nobody arriving later.
  assert.match(LA.chatReply(a, null, 'en', {}), /Stay: none on this plan, so there’s nothing to book here for the rooms\. Activities: Day 1 is planned for 2/);
  assert.equal(LA.chatReply({ unresolved: 'outside' }, null, 'en', {}), 'That date isn’t one of this trip’s days. Which day do they join or leave? No stops changed.');
  assert.match(LA.chatReply(null, null, 'en', { orphan: true }), /^I don’t have anyone arriving later on this plan\. Which day do they arrive\?/);
  for (const s of [LA.chatReply(a, motel, 'en', {}), LA.chatReply(a, hotel, 'fr', { recorded: true })]) { assert.ok(!CLAIM_RE.test(s), s); assert.ok(s.split(/\s+/).length < 85, s); }
});

// ---------- End to end: the planner and the chat handler on the repo's seed database ----------
const app = require('../server.js');
const db = require('../db.js');
// Two places to stay made for this file (the seed database has none): a hotel with Booking.com, Expedia and its own
// site, and a motel with its own site only. Removed again at the end.
const AT = WR ? [50.1163, -122.9574] : [49.5955, -119.5936];
const FIX = [];
test.before(() => {
  const mk = (slug, name, cuisine, dKm, booking) => {
    const v = app.createVenue({ region: WR ? 'whistler' : 'naramata', type: 'stay', cuisine, slug, name, address: `${700 + FIX.length} Late Arrival Test Road, ${TOWN}, BC`, latitude: AT[0] + dKm / 111, longitude: AT[1], description: 'A fixture used only by the late arrival tests.' });
    db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ max_guests: 6, confidence: 'high', booking }), new Date().toISOString(), 'test');
    FIX.push(v.id);
  };
  mk('late-arrival-test-hotel', 'Late Fixture Hotel', 'hotel', 0.1, { booking_com: 'https://www.booking.com/hotel/ca/late-fixture-hotel.html', expedia: 'https://www.expedia.ca/Town-Hotels-Late-Fixture-Hotel.h9201.Hotel-Information', own: 'https://late-fixture-hotel.example.com/book' });
  mk('late-arrival-test-motel', 'Late Fixture Motel', 'motel', 0.3, { own: 'https://late-fixture-motel.example.com/reserve' });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of FIX) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const NOW = new Date('2026-11-23T18:00:00Z');
const run = (text, stay) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true }).value, v4: true }, true);
const stopIds = (p) => (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue).map((s) => `${d.day}-${s.daypart}:${s.venue.id}`));
const pageOf = (p, text) => ({ text, stayId: (p.whereToStay && p.whereToStay.pick && p.whereToStay.pick.id) || null, stops: (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue).map((s) => { const r = (p.schedule || []).find((x) => x.day === d.day && x.venueId === s.venue.id); return { key: `${d.day}-${s.daypart}`, id: s.venue.id, ...(r && Number.isInteger(r.startMinutes) ? { start: r.startMinutes } : {}) }; })) });
const say = async (page, message, lang = 'en', stay = null) => {
  const parsed = app.parseTripChatBody({ message, lang, plan: { text: page.text, seed: 0, excludeVenueIds: [], ...(stay ? { stay } : {}) }, locks: {}, removed: [], stops: page.stops, dayDates: DATES, tripSource: 'request', ...(page.stayId ? { stayId: page.stayId } : {}) }, { stays: true });
  assert.ok(!parsed.error, parsed.error);
  return (await app.runTripChatTurn(parsed.value, { staysOn: true, lang })).response;
};
const allLinks = (p) => { const w = p.whereToStay || {}; return [w.pick, ...(w.alternatives || [])].filter(Boolean).flatMap((c) => [...(c.bookingLinks || []), ...(c.bookingLinks2 || []), ...(c.bookingSteps || []).filter((x) => x.kind === 'stay')]); };
const whole = (url) => /(?:adults|group_adults)=3\b|rm1=a3|(?:rooms|no_rooms)=2\b|rm2=/.test(decodeURIComponent(url));

test('10. the owner’s request: the same stops as without the sentence; the arrangement on the plan, the summary, the stay and every link', () => {
  const p = run(OWNER), plain = run(BASE);
  assert.ok(['multi_day'].includes(p.kind), p.kind);
  assert.equal((p.days || []).length, 3);
  // Planned exactly as the request without the sentence: no stop, date or stay moved for it.
  assert.deepEqual(stopIds(p), stopIds(plain));
  assert.deepEqual(p.tripDates, plain.tripDates);
  assert.deepEqual(p.tripDates && [p.tripDates.start, p.tripDates.end], ['2027-10-08', '2027-10-10']);
  const a = p.lateArrival;
  assert.deepEqual([a.kind, a.n, a.day, a.base, a.mode, a.nightsB, a.date], ['join', 1, 2, 2, 'split', 1, '2027-10-09']);
  // First in the plan's evidence, flagged (never a tick), and the summary's first item.
  assert.equal(p.evidence[0].ask, 'late_arrival');
  assert.equal(p.evidence[0].status, 'partial');
  assert.equal(p.evidence[0].line, true);
  assert.match(p.evidence[0].text, /^2 adults Oct 8–10 · 1 more from Oct 9 \(time not set\), own room, 1 night\. .*Day 1 is planned for 2\. Oct 9 \(Day 2\): for 2 until they arrive \(time not set\)\. All 3 from Day 3\. What time do they arrive on Oct 9\?$/);
  const facts = L.tripSummaryFacts(p, false, {});
  assert.deepEqual([facts[0].kind, facts[0].text], ['flag', '2 adults Oct 8–10 · 1 more from Oct 9 (time not set), own room, 1 night']);
  assert.equal(L.tripSummaryFacts(p, true, {})[0].text, '2 adultes 8–10 oct. · 1 de plus dès le 9 oct. (heure à préciser), chambre à part, 1 nuit');
  assert.ok(p.whereToStay && p.whereToStay.pick, 'the plan has a place to stay');
  {
    const w = p.whereToStay, t = w.trip;
    assert.equal(t.split.who, '2 adults + 1 from Oct 9');
    assert.deepEqual(t.split.parts.map((x) => [x.adults, x.rooms, x.arrive, x.leave, x.nights]), [[2, 1, '2027-10-08', '2027-10-10', 2], [1, 1, '2027-10-09', '2027-10-10', 1]]);
    assert.equal(w.pick.id, plain.whereToStay.pick.id); // the same place to stay
    for (const c of [w.pick, ...(w.alternatives || [])]) { assert.ok(c.split && c.split.text.card, c.name); assert.match(c.split.text.card, /^Two bookings, since one link can’t hold both\. 1: 2 adults, 1 room, Oct 8–10\. 2: 1 adult, 1 room, Oct 9–10\./); }
    // No stay link or step on the plan is the whole party's (3 adults, or 2 rooms) -- the plain plan's were.
    for (const l of allLinks(p)) assert.ok(!whole(l.url), l.url);
    // The stay's sentence is in the plan's line; the stay's own dates are still only proposed (no date in any link).
    assert.match(p.evidence[0].text, /two separate bookings\. Booking 1: 2 adults, 1 room, Oct 8–10\. Booking 2: 1 adult, 1 room, Oct 9–10\./);
    for (const l of allLinks(p)) assert.ok(!/2027-10/.test(decodeURIComponent(l.url)), l.url);
    // Once the visitor confirms the dates, each booking's link carries its own.
    const c = run(OWNER, { arrive: '2027-10-08', leave: '2027-10-10' });
    assert.deepEqual(stopIds(c), stopIds(p));
    for (const card of [c.whereToStay.pick, ...(c.whereToStay.alternatives || [])]) {
      if (!card.split.distinct) continue;
      const f = card.bookingLinks[0], s2 = card.bookingLinks2.find((l) => l.key === f.key);
      const cf = SBL.stayLinkCarries(f.key, f.url), cs = SBL.stayLinkCarries(s2.key, s2.url);
      if (cf.dates) { assert.match(decodeURIComponent(f.url), /2027-10-08/); assert.match(decodeURIComponent(f.url), /2027-10-10/); assert.ok(!/2027-10-09/.test(decodeURIComponent(f.url))); }
      if (cs.dates) { assert.match(decodeURIComponent(s2.url), /2027-10-09/); assert.ok(!/2027-10-08/.test(decodeURIComponent(s2.url))); }
    }
    for (const l of allLinks(c)) assert.ok(!whole(l.url), l.url);
  }
  assert.ok(!CLAIM_RE.test(JSON.stringify([p.evidence[0], p.whereToStay && p.whereToStay.pick.split])));
});

test('11. a plan without it is untouched: no key, no entry, no split, the whole party’s links as before', () => {
  for (const t of [BASE, `A weekend in ${TOWN} for two couples, we need two separate hotel rooms`, `3 days in ${TOWN} for 4 friends. We arrive on October 8, 2027 and leave October 10.`]) {
    const p = run(t);
    assert.ok(!('lateArrival' in p), t);
    assert.ok(!(p.evidence || []).some((e) => e.ask === 'late_arrival'), t);
    const w = p.whereToStay;
    if (w) { assert.ok(!w.trip.split); for (const c of [w.pick, ...(w.alternatives || [])]) { assert.ok(!c.split); assert.ok(!c.bookingLinks2); assert.ok(!(c.bookingSteps || []).some((x) => x.part)); } }
    assert.ok(!/late_arrival|Booking 1|two separate bookings/.test(JSON.stringify(p)), t);
  }
  // Three adults with no later arrival: the labelled assumption, as before.
  const p = run(BASE);
  if (p.whereToStay) assert.deepEqual([p.whereToStay.trip.adults, p.whereToStay.trip.rooms, p.whereToStay.trip.roomsAssumed], [3, 2, true]);
});

test('12. the chat, the owner’s follow-up: ONE reply, no stop added or changed, nothing recorded twice', async () => {
  const p = run(OWNER), page = pageOf(p, OWNER);
  const r = await say(page, FOLLOW);
  assert.equal(r.plan, null);
  assert.deepEqual(r.changed, []);
  assert.deepEqual([r.text, r.stayBlock, r.late], [undefined, undefined, undefined]); // the plan already has it
  assert.match(r.reply, /^Already on your plan\. Stay: two separate bookings, since one booking link can’t hold different dates per room\. 1: 2 adults, 1 room, Oct 8–10\. 2: 1 adult, 1 room, Oct 9–10\. .*Activities: Day 1 is planned for 2\. Oct 9 \(Day 2\): for 2 until they arrive \(time not set\)\. All 3 from Day 3\. No stops changed\. What time do they arrive on Oct 9\?$/);
  assert.ok(!/Added|Swapped|Done\./.test(r.reply), r.reply);
  assert.ok(!CLAIM_RE.test(r.reply), r.reply);
  // Nearby phrasings change nothing either.
  for (const m of ['only include her for activities from October 9', 'include her in the activities from Saturday', 'she’ll skip day 1', 'Please make sure the hotel booking reflects this']) {
    const x = await say(page, m);
    assert.deepEqual([x.plan, x.changed, x.text], [null, [], undefined], m);
    assert.match(x.reply, /^Already on your plan\./, m);
  }
  // In French.
  const f = await say(page, 'Notre amie nous rejoint seulement le 9 octobre et a besoin de sa propre chambre.', 'fr');
  assert.equal(f.plan, null);
  assert.match(f.reply, /^Déjà sur votre plan\. Hébergement : deux réservations distinctes/);
  // A change to the stops on this plan keeps the arrangement (the request still says it).
  const sw = await say(page, 'swap the day 1 dinner');
  if (sw.plan) { assert.equal(sw.plan.lateArrival.day, 2); assert.equal(sw.plan.evidence[0].ask, 'late_arrival'); assert.deepEqual(shape(LA.readLate(sw.req.text)), ['join', 1, { md: [10, 9] }, true]); if (sw.plan.whereToStay) for (const l of allLinks(sw.plan)) assert.ok(!whole(l.url), l.url); }
});

test('13. the chat introduces it: recorded on the request, the stay and the plan’s line sent back at once, no stop changed; then idempotent', async () => {
  const p = run(BASE), page = pageOf(p, BASE);
  const r = await say(page, FOLLOW);
  assert.equal(r.plan, null);
  assert.deepEqual(r.changed, []);
  assert.equal(r.late, true);
  assert.match(r.reply, /^Noted, it’s on your plan\. Stay: two separate bookings/);
  assert.match(r.reply, /Activities: Day 1 is planned for 2\. Oct 9 \(Day 2\): for 2 until they arrive \(time not set\)\. All 3 from Day 3\. No stops changed\. What time do they arrive on Oct 9\?$/);
  // The request keeps its own words and gains the statement.
  assert.ok(r.text.startsWith(BASE.replace(/\.$/, '')), r.text);
  assert.deepEqual(shape(LA.readLate(r.text)), ['join', 1, { md: [10, 9] }, true]);
  assert.equal(LA.stripLate(r.text).replace(/\.$/, ''), BASE.replace(/\.$/, ''));
  // The stay part and the plan's line, for the page to swap in.
  assert.equal(r.stayBlock.lateArrival.day, 2);
  assert.equal(r.stayBlock.lateEvidence.short, '2 adults Oct 8–10 · 1 more from Oct 9 (time not set), own room, 1 night');
  assert.ok(r.stayBlock.whereToStay, 'the stay part comes back');
  {
    assert.equal(r.stayBlock.whereToStay.trip.split.who, '2 adults + 1 from Oct 9');
    assert.equal(r.stayBlock.whereToStay.pick.id, p.whereToStay.pick.id); // the stay on screen stays
    for (const c of [r.stayBlock.whereToStay.pick, ...(r.stayBlock.whereToStay.alternatives || [])]) for (const l of [...(c.bookingLinks || []), ...(c.bookingLinks2 || [])]) assert.ok(!whole(l.url), l.url);
  }
  // Every later turn reads it from the request: a re-plan has the same stops, and saying it again records nothing.
  const again = run(r.text);
  assert.deepEqual(stopIds(again), stopIds(p));
  assert.equal(again.lateArrival.day, 2);
  const page2 = pageOf(again, r.text);
  const twice = await say(page2, FOLLOW);
  assert.deepEqual([twice.plan, twice.text, twice.stayBlock], [null, undefined, undefined]);
  assert.match(twice.reply, /^Already on your plan\./);
  const skip = await say(page2, 'she’ll skip day 1');
  assert.deepEqual([skip.plan, skip.text, skip.stayBlock], [null, undefined, undefined]);
  // Confirming the stay's dates keeps it: each booking then has its own dates.
  const dated = await say(page2, 'check in 2027-10-08, check out 2027-10-10');
  const w = (dated.stayBlock && dated.stayBlock.whereToStay) || (dated.plan && dated.plan.whereToStay);
  assert.ok(w, 'the stay comes back with its dates');
  { assert.equal(w.trip.stayStatus, 'confirmed'); assert.deepEqual(w.trip.split.parts.map((x) => [x.arrive, x.leave]), [['2027-10-08', '2027-10-10'], ['2027-10-09', '2027-10-10']]); assert.ok(!/The booking links (?:now )?carry these dates/.test(dated.reply), dated.reply); }
  // A date outside the trip asks one question and leaves the stay as it was.
  const out = await say(page, 'our friend arrives October 12');
  assert.equal(out.reply, 'That date isn’t one of this trip’s days. Which day do they join or leave? No stops changed.');
  assert.equal(out.plan, null);
  // Nobody arriving later on the plan, and only the instruction: a question, nothing recorded, nothing added.
  const orphan = await say(page, 'only include her for activities from October 9');
  assert.deepEqual([orphan.plan, orphan.changed, orphan.text], [null, [], undefined]);
  assert.match(orphan.reply, /^I don’t have anyone arriving later on this plan\. Which day do they arrive\?/);
  // The variants: leaving a day early, two who come later.
  const early = await say(page, 'my sister leaves a day early');
  assert.match(early.reply, /2: 1 adult, 1 room \(assumed\), Oct 8–9\..*Activities: Day 1 is for all 3\. Oct 9 \(Day 2\): for all 3 until they leave \(time not set\)\. Day 3 is planned for 2\./);
  assert.equal(early.plan, null);
  const two = await say(page, 'two friends join us on day 2');
  assert.match(two.reply, /1: 1 adult, 1 room, Oct 8–10\. 2: 2 adults, 1 room \(assumed\), Oct 9–10\./);
});

test('14. the shared copy (a link opened fresh): who is there which nights, the two bookings, each day’s head count; its buttons follow the same rule', () => {
  const p = run(OWNER, { arrive: '2027-10-08', leave: '2027-10-10' });
  const refs = stopIds(p).map((s) => `venue:${s.split(':')[1]}`), days = stopIds(p).map((s) => s.split('-')[0]);
  const stayId = p.whereToStay ? String(p.whereToStay.pick.id) : null;
  const q = { stops: refs.join(','), days: days.join(','), td: '2027-10-08_2027-10-10', ts: 'r', sa: '2027-10-08', sl: '2027-10-10', sc: '1', ad: '3', rm: '2', ra: '1', la: p.evidence[0].share, ...(stayId ? { stay: stayId, nights: '2' } : {}) };
  assert.equal(q.la, 'j1d2o');
  const c = app.tripShareContext(q, 'en', NOW), html = app.tripShareContextHtml(c, 'en');
  assert.equal(c.late.line, '2 adults Oct 8–10 · 1 more from Oct 9 (time not set), own room, 1 night');
  assert.deepEqual(c.late.days, { 1: 'for 2', 2: 'for 2 + 1 arriving', 3: 'for all 3' });
  assert.match(html, /data-mt-facts>2 adults Oct 8–10 · 1 more from Oct 9 \(time not set\), own room, 1 night · /);
  assert.ok(!/3 adults/.test(html), 'the copy never says the stay is for 3 adults');
  assert.match(html, /data-mt-late>Day 1 is planned for 2\. Oct 9 \(Day 2\): for 2 until they arrive \(time not set\)\. All 3 from Day 3\./);
  assert.ok(c.stay, 'the copy has the place to stay');
  {
    assert.match(html, /data-mt-late-stay>Two bookings, since one link can’t hold both\. 1: 2 adults, 1 room, Oct 8–10\. 2: 1 adult, 1 room, Oct 9–10\./);
    for (const l of c.stay.links) assert.ok(!whole(l.url), l.url);
    if (c.stay.split.distinct) { assert.deepEqual(c.stay.links.map((l) => l.label), ['2 adults · Oct 8–10', '1 adult · Oct 9–10']); assert.match(decodeURIComponent(c.stay.links[1].url), /2027-10-09/); }
    else assert.equal(c.stay.links.length, 1);
  }
  const fr = app.tripShareContextHtml(app.tripShareContext(q, 'fr', NOW), 'fr');
  assert.match(fr, /2 adultes 8–10 oct\. · 1 de plus dès le 9 oct\. \(heure à préciser\), chambre à part, 1 nuit/);
  assert.ok(!CLAIM_RE.test(JSON.stringify([c.late, c.stay && c.stay.split])));
  // The same link without la= is the copy main made: the whole party, no such line.
  const { la, ...rest } = q;
  const oc = app.tripShareContext(rest, 'en', NOW), old = app.tripShareContextHtml(oc, 'en');
  assert.equal(oc.late, undefined);
  assert.match(old, /data-mt-facts>3 adults · 2 rooms \(assumed\) · /);
  assert.ok(!/data-mt-late|Booking 1/.test(old));
});

test('15. the page: the split stay’s links are never rewritten, the rooms stepper gives way, each day says who it is for', () => {
  // v4PartyUrl leaves a split stay's links as built (each booking's own party); the rooms row and its note are not shown.
  assert.match(V4, /function v4PartyUrl\(raw\)\{\n    try \{\n      \/\/ A split stay's links are each booking's own[^\n]*\n      if \(typeof v4LateSplit === 'function' && v4LateSplit\(\)\) return raw;/);
  assert.match(V4, /if \(typeof v4LateSplit === 'function' && v4LateSplit\(\)\) return '';\n    if \(!st \|\| !\(stayRoomsMatter/);
  assert.match(V4, /if \(!st \|\| !first \|\| \(typeof v4LateSplit === 'function' && v4LateSplit\(\)\)\) return '';/);
  // The day titles, the Book my trip rows and line.
  assert.match(V4, /var label = \[date, d\.regionLabel, laDay\]\.filter\(Boolean\)\.join\(' · '\);/);
  assert.match(V4, /data-v4-book-part=/);
  assert.match(V4, /data-v4-book-late/);
  // The stay line and its notes read the split (no "3 adults · 2 rooms").
  assert.match(V3, /if \(t\.split && \(fr \? t\.split\.whoFr : t\.split\.who\)\) who = /);
  assert.match(V3, /if \(!t \|\| !\(t\.rooms >= 1\) \|\| t\.split\) return '';/);
  assert.match(V3, /if \(sp && sp\.note\) bits\.unshift\(sp\.note\);/);
  // The chat page: two buttons only when each link carries its own booking; the stay block brings the plan's line; a named Undo.
  assert.match(CHATPAGE, /var step2 = sp && s\.split\.distinct && \(sp\.btn \|\| \[\]\)\.length === 2 \?/);
  assert.match(CHATPAGE, /data-v4-late/);
  assert.match(CHATPAGE, /if \(Object\.prototype\.hasOwnProperty\.call\(j\.stayBlock, 'lateArrival'\)\)/);
  assert.match(CHATPAGE, /undoArrival: 'Undo arrival change'/);
  assert.match(CHATPAGE, /undoArrival: 'Annuler le changement d’arrivée'/);
});

test('16. the chat beside the other fixed rules: never the stay’s check-in, never the trip’s rooms; a correction takes it off again', async () => {
  const p = run(OWNER), page = pageOf(p, OWNER);
  const stayOf = (r) => (r.stayBlock && r.stayBlock.whereToStay) || (r.plan && r.plan.whereToStay) || null;
  // "our friend arrives October 9" is about the friend: the stay's check-in stays Oct 8 (the stay-dates rule read it).
  for (const m of ['our friend arrives October 9', 'Our friend arrives only on October 9 and needs her own room']) {
    const r = await say(page, m);
    assert.equal(r.stayDates, undefined, m);
    assert.match(r.reply, /^Already on your plan\./, m);
  }
  const plainPage = pageOf(run(BASE), BASE);
  const intro = await say(plainPage, 'our friend arrives October 9');
  assert.equal(intro.stayDates, undefined);
  assert.deepEqual(stayOf(intro).trip.split.parts.map((x) => [x.adults, x.arrive, x.leave]), [[2, '2027-10-08', '2027-10-10'], [1, '2027-10-09', '2027-10-10']]);
  assert.equal(stayOf(intro).trip.arrive, '2027-10-08');
  // The party's own dates are still the stay-dates rule's: the whole stay moves, each booking with it.
  const thu = await say(page, 'we arrive Thursday night');
  assert.deepEqual(thu.stayDates, { arrive: '2027-10-07', leave: '2027-10-10' });
  assert.deepEqual(stayOf(thu).trip.split.parts.map((x) => [x.adults, x.arrive, x.leave]), [[2, '2027-10-07', '2027-10-10'], [1, '2027-10-09', '2027-10-10']]);
  assert.match(thu.reply, /1: 2 adults, 1 room, Oct 7–10\. 2: 1 adult, 1 room, Oct 9–10\./);
  assert.ok(!/The booking links (?:now )?carry these dates/.test(thu.reply), thu.reply);
  // The rooms: asked, the answer is the arrangement (never "2 rooms for 3 adults"); a number said is the explicit count.
  const q = await say(page, 'how many rooms did you assume?');
  assert.equal(q.reply, '2 adults Oct 8–10 · 1 more from Oct 9 (time not set), own room, 1 night. One booking link can’t hold different dates per room, so these are two separate bookings.');
  const three = await say(page, 'make it 3 rooms');
  assert.deepEqual(stayOf(three).trip.split.parts.map((x) => [x.adults, x.rooms]), [[2, 2], [1, 1]]);
  // A correction: she comes for the whole trip after all. The statement leaves the request; the stay is one booking again.
  for (const m of ['actually our friend arrives with us on October 8', 'remove the late arrival', 'our friend is coming for the whole trip after all']) {
    const r = await say(page, m);
    assert.equal(r.reply, 'Got it: everyone is there from start to finish, so the stay is one booking for the whole party again. No stops changed.', m);
    assert.equal(LA.readLate(r.text), null, m);
    assert.equal(r.text, BASE, m);
    assert.equal(r.stayBlock.lateArrival, null, m);
    assert.ok(!stayOf(r).trip.split, m);
    assert.deepEqual([r.plan, r.changed], [null, []], m);
  }
  // On a plan that never had it, the same words change nothing and record nothing.
  const none = await say(plainPage, 'our friend arrives with us on October 8');
  assert.deepEqual([none.plan, none.text, none.stayBlock], [null, undefined, undefined]);
  assert.equal(none.reply, 'Then everyone is there from start to finish: nothing to change. No stops changed.');
  // "remove the winery on day 1" is still a removal.
  const rm = await say(page, 'remove the late fixture winery stop');
  assert.ok(!/everyone is there from start to finish/.test(rm.reply), rm.reply);
});

// ---------- The time of day they arrive (2026-11-24) ----------
// The owner, same request: "it assumes the third traveller can join the 9:45 a.m. activity on her arrival day without
// asking when she arrives. Ask for the arrival time when it affects planned activities, or clearly mark participation on
// that day as unconfirmed until the traveller specifies it. […] Make the two hotel buttons self-explanatory—for
// example, '2 adults · Oct 8–10' and '1 adult · Oct 9–10'—in both the planner and shared itinerary."
const ARR = (at, o = {}) => LA.resolve({ ...LA.readLate(OWNER), ...(at ? { at } : {}), ...o }, CTX);

test('17. the time of day is read with the statement, English and French, a clock time or a part of the day; nothing else is', () => {
  const cases = [
    ['Our friend arrives only on October 9 at 3 pm and needs a separate room for one night.', { m: 900 }, true],
    ['Our friend arrives at 3:30 p.m. on October 9. She needs her own room.', { m: 930 }, true],
    ['our friend gets in around 15h on the 9th', { m: 900 }, false],
    ['our friend lands at 2:30 on October 9', { m: 870 }, false],
    ['our friend arrives on October 9 around 3', { m: 900 }, false],
    ['our friend arrives on October 9 at noon', { m: 720 }, false],
    ['our friend arrives on October 9 at 10', { m: 600 }, false],
    ['my sister arrives Saturday afternoon', { part: 'afternoon' }, false],
    ['my sister arrives Saturday morning', { part: 'morning' }, false],
    ['two of us arrive on day 2 in the evening', { part: 'evening' }, false],
    ['our friend arrives October 9 after lunch', { part: 'after_lunch' }, false],
    ['one of us arrives on Oct 9 in time for dinner', { part: 'dinner' }, false],
    ['our friend arrives mid-afternoon on October 9', { part: 'mid_afternoon' }, false],
    ['our friend arrives October 9 late at night', { part: 'night' }, false],
    ['Notre amie arrive le 9 octobre vers 15 h 30 et a besoin d’une chambre séparée', { m: 930 }, true],
    ['notre amie arrive samedi en fin d’après-midi', { part: 'late_afternoon' }, false],
    ['notre amie arrive le 9 octobre en soirée', { part: 'evening' }, false],
    ['notre amie arrive le 9 octobre à midi', { m: 720 }, false],
    ['one of us leaves at noon on the 10th', { m: 720 }, false],
    ['my mom has to leave on October 9 in the morning', { part: 'morning' }, false],
  ];
  for (const [t, at, own] of cases) { const r = LA.readLate(`Three days in ${TOWN} for 3 adults. ${t}`); assert.ok(r, t); assert.deepEqual(r.at, at, t); assert.equal(r.ownRoom, own, t); }
  // No time said: none read. "for one night" and "that night" are about the room, a date is not a time.
  for (const t of [LATE, 'Our friend joins only on October 9 and needs her own room that night.', 'our friend arrives on October 9 for one night', 'our friend arrives on the 9th', 'two friends join us on day 2',
    'our friend arrives October 9 and wants a room for the evening', 'Notre amie arrive seulement le 9 octobre et a besoin d’une chambre séparée pour une nuit.']) assert.equal(LA.readLate(t).at, undefined, t);
  // The request without the statement is the same whether or not it gave a time (the planner reads the same words).
  for (const t of ['Our friend arrives only on October 9 at 3 pm and needs a separate room for one night.', 'Our friend arrives on October 9, around 3 pm, and needs her own room.', 'Our friend arrives at 3 p.m. on October 9.']) assert.equal(LA.stripLate(`${BASE} ${t}`), BASE, t);
  // The words a request gains read back to the same time, both languages.
  const have = LA.readLate(OWNER);
  for (const at of [{ m: 840 }, { m: 870 }, { m: 720 }, { m: 570 }, ...Object.keys(LA.DAYPARTS).map((part) => ({ part }))]) for (const lang of ['en', 'fr']) {
    const got = LA.readLate(LA.requestWords({ ...have, at }, lang));
    assert.deepEqual([got.kind, got.n, got.when, got.ownRoom, got.at], ['join', 1, { md: [10, 9] }, true, at], `${JSON.stringify(at)} ${lang}`);
  }
  assert.equal(LA.requestWords({ ...have, at: { m: 840 } }, 'en'), 'one of us arrives on Oct 9 at 2 PM and needs a separate room');
  assert.equal(LA.requestWords({ ...have, at: { m: 870 } }, 'fr'), '1 d’entre nous arrive le 9 octobre à 14 h 30 et a besoin d’une chambre séparée');
});

test('18. no time known: the arrival day is never "for all 3"; it is marked, and the plan asks once', () => {
  const a = ARR(null), w = LA.words(a, false), f = LA.words(a, true), e = LA.entry(a, null);
  assert.equal(a.at, undefined);
  assert.equal(w.days[2], 'for 2 + 1 arriving');
  assert.equal(f.days[2], 'pour 2 + 1 qui arrive');
  assert.deepEqual([w.days[1], w.days[3]], ['for 2', 'for all 3']);
  assert.equal(w.ask, 'What time do they arrive on Oct 9? Until I know, Day 2 stops are for 2, plus 1 once they’re there.');
  assert.equal(f.ask, 'À quelle heure arrive cette personne le 9 oct.? D’ici là, les arrêts du jour 2 sont pour 2, plus 1 dès son arrivée.');
  assert.equal(e.askTime, w.ask);
  assert.equal(e.askTimeFr, f.ask);
  assert.deepEqual([e.win, e.stop], [undefined, undefined]);
  // The plan's own line ends with the question; what a copied itinerary says does not carry it.
  assert.match(e.text, /for 2 until they arrive \(time not set\)\. All 3 from Day 3\. What time do they arrive on Oct 9\?$/);
  assert.match(e.copy, /All 3 from Day 3\.$/);
  assert.ok(!/\?/.test(e.copy) && !/\?/.test(e.copyFr));
  assert.equal(LA.chatAsk(a, 'en'), 'What time do they arrive on Oct 9?');
  assert.equal(LA.chatAsk(ARR({ m: 840 }), 'en'), '');
  // The last day, with no night (mode 'day'), and someone leaving early: the same rule on the day it is about.
  const last = LA.resolve(LA.readLate('our friend joins us on the last day'), CTX);
  assert.deepEqual([last.mode, last.day, LA.words(last, false).days[3]], ['day', 3, 'for 2 + 1 arriving']);
  assert.equal(LA.words(last, false).act, 'Days 1–2 are planned for 2. Oct 10 (Day 3): for 2 until they arrive (time not set).');
  const leave = LA.resolve(LA.readLate('my mom has to leave on October 9'), CTX), lw = LA.words(leave, false);
  assert.deepEqual(lw.days, { 1: 'for all 3', 2: 'for 2 + 1 leaving', 3: 'for 2' });
  assert.equal(lw.act, 'Day 1 is for all 3. Oct 9 (Day 2): for all 3 until they leave (time not set). Day 3 is planned for 2.');
  assert.equal(lw.ask, 'What time do they leave on Oct 9? Until I know, Day 2 stops are for all 3, less 1 once they’ve left.');
  // No dates on the plan: by the day's number.
  const und = LA.resolve(LA.readLate('two friends join us on day 2'), { ...CTX, dayDates: [null, null, null], dated: false, adults: 4 });
  assert.equal(LA.words(und, false).ask, 'What time do they arrive on day 2? Until I know, Day 2 stops are for 2, plus 2 once they’re there.');
  for (const s of [w.ask, f.ask, w.act, f.act, lw.act, lw.ask, e.text, e.textFr]) assert.ok(!CLAIM_RE.test(s) && !/\b(?:can make|will make|minutes? away|drive from)\b/i.test(s), s);
});

test('19. a time known: each stop of that day is for 2, not confirmed, or for everyone, by when it starts; no travel time is claimed', () => {
  const a = ARR({ m: 840 }), w = LA.words(a, false), f = LA.words(a, true), e = LA.entry(a, null);
  assert.equal(w.line, '2 adults Oct 8–10 · 1 more from Oct 9, 2 PM, own room, 1 night');
  assert.equal(f.line, '2 adultes 8–10 oct. · 1 de plus dès le 9 oct., 14 h, chambre à part, 1 nuit');
  assert.deepEqual(w.days, { 1: 'for 2', 2: '2 until 2 PM, then all 3', 3: 'for all 3' });
  assert.equal(f.days[2], '2 jusqu’à l’arrivée (14 h), puis les 3');
  assert.equal(w.act, 'Day 1 is planned for 2. Oct 9 (Day 2): 2 until 2 PM, then all 3.');
  assert.deepEqual(w.stop, { few: 'Before the 2 PM arrival: for 2', near: 'Close to the 2 PM arrival: not confirmed for all 3' });
  assert.deepEqual(f.stop, { few: 'Avant l’arrivée (14 h) : pour 2', near: 'Près de l’arrivée (14 h) : non confirmé pour les 3' });
  assert.equal(w.ask, '');
  assert.deepEqual([e.askTime, e.kind, e.day], [undefined, 'join', 2]);
  assert.deepEqual(e.win, { from: 840, to: 840, pad: 60, before: 120 });
  // A stop that starts before 2 PM is for 2; within the hour after, not confirmed; from 3 PM, everyone.
  const st = (m) => LA.lateStopState(e.win, 'join', m);
  assert.deepEqual([540, 825, 839, 840, 885, 899, 900, 1065].map(st), ['few', 'few', 'few', 'near', 'near', 'near', 'all', 'all']);
  assert.equal(LA.lateStopState(e.win, 'join', null), '');
  // A part of the day is a window: nobody is counted in before it opens, nor as surely there until an hour after it.
  const ev = ARR({ part: 'evening' }), ew = LA.words(ev, false), win = LA.atWindow(ev.at);
  assert.deepEqual(win, { from: 1020, to: 1260, pad: 60, before: 120 });
  assert.equal(ew.days[2], '2 until the evening arrival, then all 3');
  assert.equal(ew.stop.near, 'Close to the evening arrival: not confirmed for all 3');
  assert.deepEqual([945, 1019, 1020, 1065, 1319, 1320].map((m) => LA.lateStopState(win, 'join', m)), ['few', 'few', 'near', 'near', 'near', 'all']);
  assert.deepEqual(Object.fromEntries(Object.entries(LA.DAYPARTS).map(([k, p]) => [k, [p.from, p.to]])), { early_morning: [360, 540], morning: [480, 720], midday: [690, 780], after_lunch: [780, 900], early_afternoon: [720, 840],
    mid_afternoon: [840, 960], late_afternoon: [960, 1080], afternoon: [720, 1020], dinner: [1020, 1020], evening: [1020, 1260], night: [1260, 1439] });
  // "in time for dinner": the traveller said they are at dinner, so a stop from 5 PM is for everyone.
  const dn = LA.atWindow({ part: 'dinner' });
  assert.deepEqual([1019, 1020, 1065].map((m) => LA.lateStopState(dn, 'join', m)), ['few', 'all', 'all']);
  // Leaving at noon: a stop that starts from noon is for 2; within two hours before, not confirmed (it may not be over).
  const lv = LA.resolve(LA.readLate('my mom has to leave at noon on October 9'), CTX), lw = LA.words(lv, false), lwin = LA.atWindow(lv.at);
  assert.equal(lw.days[2], 'all 3 until 12 PM, then 2');
  assert.deepEqual(lw.stop, { few: 'After the 12 PM departure: for 2', near: 'Close to the 12 PM departure: not confirmed for all 3' });
  assert.equal(lw.act, 'Day 1 is for all 3. Oct 9 (Day 2): all 3 until 12 PM, then 2. Day 3 is planned for 2.');
  assert.deepEqual([540, 599, 600, 719, 720, 825].map((m) => LA.lateStopState(lwin, 'leave', m)), ['all', 'all', 'near', 'near', 'few', 'few']);
  // The source the pages run is that same function, and stands alone.
  assert.equal(new Function(`${LA.CLIENT_SRC}; return lateStopState;`)()(e.win, 'join', 885), 'near');
  assert.ok(V4.includes("${require('./trip-late-arrival').CLIENT_SRC}"));
  // The chat's reply to a time: who each stop is for, by name and start; never that anyone can make a stop.
  const stops = [{ name: 'Tour', start: 540 }, { name: 'Lunch', start: 720 }, { name: 'Winery', start: 825 }, { name: 'Paddle', start: 885 }, { name: 'Dinner', start: 1065 }];
  assert.equal(LA.chatReply(a, null, 'en', { time: 'set', stops }), 'Noted: arrival on Oct 9 at 2 PM. Day 2 before the arrival is for 2: Tour (9 AM), Lunch (12 PM), Winery (1:45 PM). Close to the arrival, so not confirmed for all 3: Paddle (2:45 PM). After that, all 3. No stops changed.');
  assert.equal(LA.chatReply(ev, null, 'en', { time: 'changed', stops }), 'Updated: arrival on Oct 9 in the evening (taken as 5–9 PM). Day 2 before the arrival is for 2: Tour (9 AM), Lunch (12 PM), Winery (1:45 PM), Paddle (2:45 PM). Close to the arrival, so not confirmed for all 3: Dinner (5:45 PM). No stops changed.');
  assert.equal(LA.chatReply(a, null, 'fr', { time: 'set', stops: stops.slice(0, 1) }), 'Noté : arrivée le 9 oct. à 14 h. Au jour 2, avant l’arrivée, pour 2 : Tour (9 h). Aucun arrêt n’a changé.');
  assert.equal(LA.chatReply(ARR({ m: 480 }), null, 'en', { time: 'set', stops }), 'Noted: arrival on Oct 9 at 8 AM. Every Day 2 stop starts later: all 3. No stops changed.');
  assert.equal(LA.chatReply(ARR(null), null, 'en', { unsure: true }), 'No problem. Until then, Day 2 stays for 2 + 1 arriving. Tell me the time when you know it. No stops changed.');
  for (const s of [w.act, f.act, ew.act, lw.act, ...Object.values(w.stop), ...Object.values(f.stop), LA.chatReply(a, null, 'en', { time: 'set', stops })]) assert.ok(!CLAIM_RE.test(s) && !/\b(?:can make|will make|can join|minutes? away|drive from)\b/i.test(s), s);
});

test('20. the chat reads a time only as the arrival time when it is about the arrival, or answers the open question', () => {
  const have = LA.readLate(OWNER);
  // About the person arriving: read whether or not the question is open.
  for (const [m, at] of [['She arrives at 2 pm', { m: 840 }], ['her flight lands at 2:30', { m: 870 }], ['she gets in around 3', { m: 900 }], ['arrival time is 4pm', { m: 960 }], ['change her arrival to 4 pm', { m: 960 }],
    ['elle arrive vers 15 h', { m: 900 }], ['our friend arrives mid-afternoon', { part: 'mid_afternoon' }], ['actually she gets in in the evening', { part: 'evening' }], ['they land in the morning', { part: 'morning' }]]) {
    assert.deepEqual(LA.timeChat(m, have, false), { at }, m);
    assert.deepEqual(LA.timeChat(m, have, true), { at }, m);
  }
  // A bare answer: only while the question is the open one.
  for (const [m, at] of [['2 pm', { m: 840 }], ['around 3', { m: 900 }], ['2', { m: 840 }], ['at 10', { m: 600 }], ['14h30', { m: 870 }], ['3 p.m.', { m: 900 }], ['noon', { m: 720 }], ['vers 15 h', { m: 900 }], ['mid-afternoon', { part: 'mid_afternoon' }],
    ['in the morning', { part: 'morning' }], ['in the evening', { part: 'evening' }], ['after lunch', { part: 'after_lunch' }], ['probably around 5ish', { m: 1020 }], ['en soirée', { part: 'evening' }], ['late afternoon I think', { part: 'late_afternoon' }]]) {
    assert.deepEqual(LA.timeChat(m, have, true), { at }, m);
    assert.equal(LA.timeChat(m, have, false), null, m);
  }
  assert.deepEqual(LA.timeChat('not sure yet', have, true), { unsure: true });
  assert.deepEqual(LA.timeChat('je ne sais pas encore', have, true), { unsure: true });
  assert.equal(LA.timeChat('not sure yet', have, false), null);
  // Never: a change to the stops or their times, a question, another number, someone leaving on a plan about an arrival.
  for (const m of ['start day 2 at 2 pm', 'move dinner to 7 pm', 'what time is dinner?', 'we want dinner at 6 pm', 'add a winery in the afternoon', 'something in the evening', '2 adults', '2 rooms', 'day 2', 'she arrives tomorrow',
    'She leaves at 3 pm', 'book the tour for 2 pm', 'what time does she arrive?', 'yes', 'cheaper dinner']) { assert.equal(LA.timeChat(m, have, true), null, m); assert.equal(LA.timeChat(m, have, false), null, m); }
  // A plan about someone leaving reads a leaving time, not an arriving one.
  const lv = LA.readLate('my mom has to leave on October 9');
  assert.deepEqual(LA.timeChat('she leaves at noon', lv, false), { at: { m: 720 } });
  assert.equal(LA.timeChat('she arrives at noon', lv, false), null);
  // Through the chat's reader: the op carries the request's own statement with the time; the same time again records nothing.
  const h = { op: (o, x = {}) => ({ o, ...x }) };
  const r = LA.chatRead('She arrives at 2 pm', [], h, { request: OWNER });
  assert.deepEqual([r.ops.length, r.ops[0].o, r.ops[0].time, r.ops[0].late.at, r.ops[0].late.when, r.ops[0].late.ownRoom, r.access, r.rest], [1, 'late', true, { m: 840 }, { md: [10, 9] }, true, true, undefined]);
  assert.equal(LA.chatRead('2 pm', [], h, { request: OWNER }), null);
  assert.deepEqual(LA.chatRead('2 pm', [], h, { request: OWNER, pendingTime: true }).ops[0].late.at, { m: 840 });
  assert.equal(LA.chatRead('2 pm', [], h, { request: BASE, pendingTime: true }), null); // no arrangement on the plan
  assert.equal(LA.chatRead('She arrives at 2 pm', [], h, { request: BASE }), null);
  const timed = `${BASE} ${LA.requestWords({ ...LA.readLate(OWNER), at: { m: 840 } }, 'en')}.`;
  assert.equal(LA.chatRead('she arrives at 2 pm', [], h, { request: timed }).ops[0].late, null);
  assert.deepEqual(LA.chatRead('she arrives at 4 pm', [], h, { request: timed }).ops[0].late.at, { m: 960 });
  // The whole statement again with a new time changes the time only; without one it changes nothing.
  assert.deepEqual(LA.chatRead('Our friend arrives on October 9 at 5 pm', [], h, { request: timed }).ops[0].late.at, { m: 1020 });
  assert.equal(LA.chatRead('Our friend arrives on October 9', [], h, { request: timed }).ops[0].late, null);
  // The word rules hand it over the same way (the AI's reading never stands in for it).
  const viaRules = tc.rulesRead('She arrives at 2 pm', [], { request: OWNER });
  assert.deepEqual([viaRules.access, viaRules.ops[0].o, viaRules.ops[0].late.at], [true, 'late', { m: 840 }]);
  assert.ok(!tc.rulesRead('2 pm', [], { request: OWNER }).ops.some((o) => o.o === 'late'));
  assert.deepEqual(tc.rulesRead('2 pm', [], { request: OWNER, pendingTime: true }).ops[0].late.at, { m: 840 });
});

test('21. sharing: la= carries the time only when known; a link from before reads as "time not set"', () => {
  assert.equal(LA.toShare(ARR(null)), 'j1d2o');
  assert.equal(LA.toShare(ARR({ m: 840 })), 'j1d2o.t1400');
  assert.equal(LA.toShare(ARR({ m: 570 })), 'j1d2o.t0930');
  assert.equal(LA.toShare(ARR({ part: 'evening' })), 'j1d2o.we');
  for (const at of [{ m: 0 }, { m: 840 }, { m: 1439 }, ...Object.keys(LA.DAYPARTS).map((part) => ({ part }))]) assert.deepEqual(LA.fromShare(LA.toShare(ARR(at))).at, at, JSON.stringify(at));
  assert.deepEqual(LA.fromShare('j1d2o'), { key: 'late_arrival', kind: 'join', n: 1, when: { day: 2 }, ownRoom: true, phrase: '' });
  for (const bad of ['j1d2o.t2400', 'j1d2o.t1260', 'j1d2o.wzz', 'j1d2o.', 'j1d2o.t14', 'j1d2ot1400', 'j1d2o.t1400x', 'j1d2o.w']) assert.equal(LA.fromShare(bad), null, bad);
  const codes = Object.values(LA.DAYPARTS).map((p) => p.c);
  assert.equal(new Set(codes).size, codes.length);
  // The link's reader and its way back (EN / FR switch): values only.
  for (const la of ['j1d2o', 'j1d2o.t1400', 'j1d2o.wa']) { const c = H.parseShareContext({ la }); assert.equal(c.lateQ, la); assert.match(H.shareContextQuery(c), new RegExp(`(?:^|&)la=${la.replace('.', '\\.')}$`)); }
  assert.equal(H.parseShareContext({ la: 'j1d2o.t9999' }), null);
});

test('22. the stay’s two buttons say the booking each link opens with, in both languages, and never more than the link carries', () => {
  const a = LA.resolve(LA.readLate(OWNER), CTX);
  const s = LA.cardSplit(HOTEL, TRIP(), a, {});
  assert.deepEqual(s.text.btn, ['2 adults · Oct 8–10', '1 adult · Oct 9–10']);
  assert.deepEqual(s.textFr.btn, ['2 adultes · 8–10 oct.', '1 adulte · 9–10 oct.']);
  // Each label against its own link's parameters (Booking.com is the first link).
  const first = s.links[0], second = s.links2.find((l) => l.key === first.key);
  assert.deepEqual(['checkin', 'checkout', 'adults', 'rooms'].map((k) => wrap(first.url).get(k)), ['2027-10-08', '2027-10-10', '2', '1']);
  assert.deepEqual(['checkin', 'checkout', 'adults', 'rooms'].map((k) => wrap(second.url).get(k)), ['2027-10-09', '2027-10-10', '1', '1']);
  for (const [l, label] of [[first, s.text.btn[0]], [second, s.text.btn[1]]]) { const c = SBL.stayLinkCarries(l.key, l.url); assert.equal(c.adults && c.dates, true); assert.match(label, /^\d adults? · Oct \d+–10$/); }
  // Dates not confirmed yet: the Booking.com links carry the guests and no dates, so the buttons say the guests only;
  // the dates stay in the note beside them.
  const p = LA.cardSplit(HOTEL, TRIP({ datesGiven: false, stayStatus: 'proposed' }), a, {});
  assert.equal(p.distinct, true);
  assert.deepEqual(p.text.btn, ['2 adults', '1 adult']);
  assert.deepEqual(p.textFr.btn, ['2 adultes', '1 adulte']);
  for (const l of [p.links[0], p.links2[0]]) { const c = SBL.stayLinkCarries(l.key, l.url); assert.deepEqual([c.adults, c.dates], [true, false]); assert.ok(!/2027-10/.test(l.url), l.url); }
  assert.match(p.text.card, /1: 2 adults, 1 room, Oct 8–10\. 2: 1 adult, 1 room, Oct 9–10\./);
  // Two bookings whose links would be the very same link (1 adult each, no dates in them yet) are one button, as before.
  const two = LA.cardSplit(HOTEL, TRIP({ adults: 2, datesGiven: false, stayStatus: 'proposed' }), LA.resolve(LA.readLate(OWNER), { ...CTX, adults: 2 }), {});
  assert.deepEqual([two.distinct, two.text.btn], [false, []]);
  // The hotel's own site only: one button, and the note still lists both bookings.
  const m = LA.cardSplit(MOTEL, TRIP(), a, {});
  assert.deepEqual([m.distinct, m.text.btn], [false, []]);
  assert.equal(m.text.card, 'Two bookings, since one link can’t hold both. 1: 2 adults, 1 room, Oct 8–10. 2: 1 adult, 1 room, Oct 9–10. Make both on the hotel’s own site.');
  // Said beside the buttons, on the plan and on the shared copy: the booking site confirms; nothing here does.
  assert.equal(s.text.confirm, 'Availability, rooms and the booking itself are confirmed on the booking site.');
  assert.equal(s.textFr.confirm, 'La disponibilité, les chambres et la réservation elle-même se confirment sur le site de réservation.');
  assert.match(CHATPAGE, /data-v4-late-confirm/);
  assert.match(V3, /if \(sp && sp\.confirm && first\) bits\.push\(sp\.confirm\);/);
  // Book my trip: each stay row and the "next" button are named by the same words; "see live prices" says which booking.
  const steps = TB.tripBookingSteps({ id: 9101, name: HOTEL.name, bookingLinks: s.links, bookingLinks2: s.links2, split: { distinct: true, text: s.text, textFr: s.textFr } }, []);
  assert.deepEqual(steps.map((x) => [x.part, x.btn, x.btnFr, x.sub]), [[1, '2 adults · Oct 8–10', '2 adultes · 8–10 oct.', '2 adults, 1 room, Oct 8–10'], [2, '1 adult · Oct 9–10', '1 adulte · 9–10 oct.', '1 adult, 1 room, Oct 9–10']]);
  assert.match(V4, /var partName = x\.part \? \(\(fr && x\.btnFr\) \|\| x\.btn \|\|/);
  assert.match(V4, /\(fr \? 'Ouvrir : ' : 'Open: '\) \+ vt\('stay'\) \+ ' · ' \+ nxPart/);
  assert.match(V3, /label \+ \(sp1 \? ' \(' \+ sp1 \+ '\)' : ''\)/);
});

const sayWith = async (page, message, o = {}) => {
  const parsed = app.parseTripChatBody({ message, lang: o.lang || 'en', plan: { text: page.text, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: page.stops, dayDates: DATES, tripSource: 'request', ...(page.stayId ? { stayId: page.stayId } : {}), ...(o.offer ? { offer: o.offer } : {}) }, { stays: true });
  assert.ok(!parsed.error, parsed.error);
  return (await app.runTripChatTurn(parsed.value, { staysOn: true, lang: o.lang || 'en' })).response;
};

test('23. the plan and the chat: asked once, answered, changed, undone by its own Undo, cleared with the arrangement', async () => {
  const p = run(OWNER), page = pageOf(p, OWNER), e = p.evidence[0];
  // The plan: day 2 is not "for all 3", and carries the one question; nothing is moved for it.
  assert.deepEqual(e.days, { 1: 'for 2', 2: 'for 2 + 1 arriving', 3: 'for all 3' });
  assert.equal(e.askTime, 'What time do they arrive on Oct 9? Until I know, Day 2 stops are for 2, plus 1 once they’re there.');
  assert.equal(e.share, 'j1d2o');
  assert.match(V4, /data-v4-late-ask/);
  // The follow-up restated: the reply ends with the question, and the question's tag rides back.
  const f = await sayWith(page, FOLLOW);
  assert.match(f.reply, /No stops changed\. What time do they arrive on Oct 9\?$/);
  assert.deepEqual(f.offer, [LA.ASK_TAG]);
  assert.equal((f.reply.match(/What time/g) || []).length, 1);
  // A bare "2 pm" with no question open is not the arrival time; as the answer to it, it is.
  const stray = await sayWith(page, '2 pm');
  assert.ok(!stray.late && !stray.lateTime && !/arrival/.test(stray.reply), stray.reply);
  const day2 = page.stops.filter((s) => /^2-/.test(s.key) && Number.isInteger(s.start));
  for (const [msg, offer] of [['2 pm', [LA.ASK_TAG]], ['She arrives at 2 pm', undefined]]) {
    const r = await sayWith(page, msg, { offer });
    assert.equal(r.lateTime, 'join', msg);
    assert.equal(r.late, true, msg);
    assert.deepEqual([r.plan, r.changed], [null, []], msg);
    assert.match(r.reply, /^Noted: arrival on Oct 9 at 2 PM\. /, msg);
    assert.match(r.reply, / No stops changed\.$/, msg);
    assert.equal(r.offer, undefined, msg); // nothing more to ask
    assert.deepEqual(LA.readLate(r.text).at, { m: 840 }, msg);
    assert.equal(LA.stripLate(r.text), BASE, msg);
    const le = r.stayBlock.lateEvidence;
    assert.deepEqual([le.days[2], le.askTime, le.share, le.win.from], ['2 until 2 PM, then all 3', undefined, 'j1d2o.t1400', 840], msg);
    assert.deepEqual(r.stayBlock.lateArrival.at, { m: 840 }, msg);
    // The stay is as it was: the same two bookings.
    assert.deepEqual(r.stayBlock.whereToStay.trip.split.parts.map((x) => [x.adults, x.rooms, x.arrive, x.leave]), [[2, 1, '2027-10-08', '2027-10-10'], [1, 1, '2027-10-09', '2027-10-10']], msg);
    // Every stop of day 2 that starts before 2 PM is named as for 2; none of the others is.
    for (const s of day2) { const name = app.getVenue(s.id).name; const part = r.reply.split('Close to the arrival')[0]; assert.equal(part.includes(name), s.start < 840, `${name} ${s.start}`); }
  }
  // Later turns keep it: a part of the day replaces the time; the same time again changes nothing; "not sure" neither.
  const t2 = (await sayWith(page, 'She arrives at 2 pm')).text, page2 = { ...page, text: t2 };
  const ev = await sayWith(page2, 'actually she gets in in the evening');
  assert.match(ev.reply, /^Updated: arrival on Oct 9 in the evening \(taken as 5–9 PM\)\. /);
  assert.deepEqual([LA.readLate(ev.text).at, ev.lateTime, ev.stayBlock.lateEvidence.share], [{ part: 'evening' }, 'join', 'j1d2o.we']);
  const same = await sayWith(page2, 'she arrives at 2 pm');
  assert.deepEqual([same.text, same.stayBlock, same.lateTime], [undefined, undefined, undefined]);
  assert.match(same.reply, /^Noted: arrival on Oct 9 at 2 PM\./);
  const fr = await sayWith(page2, 'Elle arrive vers 15 h 30', { lang: 'fr' });
  assert.match(fr.reply, /^Modifié : arrivée le 9 oct\. à 15 h 30\. /);
  assert.deepEqual(LA.readLate(fr.text).at, { m: 930 });
  const unsure = await sayWith(page, 'not sure yet', { offer: [LA.ASK_TAG] });
  assert.equal(unsure.reply, 'No problem. Until then, Day 2 stays for 2 + 1 arriving. Tell me the time when you know it. No stops changed.');
  assert.deepEqual([unsure.text, unsure.stayBlock, unsure.offer], [undefined, undefined, [LA.ASK_TAG]]);
  // The other fixed rules still read their own messages on a plan with a time (stay dates, rooms), and keep the time.
  const thu = await sayWith(page2, 'we arrive Thursday night');
  assert.deepEqual(thu.stayDates, { arrive: '2027-10-07', leave: '2027-10-10' });
  const rooms = await sayWith(page2, 'how many rooms did you assume?');
  assert.match(rooms.reply, /^2 adults Oct 8–10 · 1 more from Oct 9, 2 PM, own room, 1 night\./);
  // Taking the arrangement off takes its time with it.
  const gone = await sayWith(page2, 'remove the late arrival');
  assert.equal(gone.text, BASE);
  assert.equal(gone.stayBlock.lateArrival, null);
  // The page: the time's own Undo, and the bare-answer tag only while the plan shows the question.
  assert.match(CHATPAGE, /undoArrTime: 'Undo arrival time'/);
  assert.match(CHATPAGE, /undoArrTime: 'Annuler l’heure d’arrivée'/);
  assert.match(CHATPAGE, /j\.lateTime && !\(j\.plan && j\.req && changed\.length\) \? 'arrtime:'/);
  assert.match(CHATPAGE, /if \(laQ && laQ\.askTime\) body\.offer = \['\[arrival time\]'\];/);
});

test('24. the time said in the request: the same stops, each stop of that day marked, the estimate counted by who is there', () => {
  const timed = run(`${BASE} Our friend arrives only on October 9 at 3 pm and needs a separate room for one night.`), plain = run(BASE), untimed = run(OWNER);
  assert.deepEqual(stopIds(timed), stopIds(plain));
  assert.deepEqual((timed.schedule || []).map((r) => [r.day, r.venueId, r.startMinutes]), (plain.schedule || []).map((r) => [r.day, r.venueId, r.startMinutes]));
  const e = timed.evidence[0];
  assert.deepEqual([timed.lateArrival.at, e.days[2], e.share, e.askTime], [{ m: 900 }, '2 until 3 PM, then all 3', 'j1d2o.t1500', undefined]);
  assert.equal(e.short, '2 adults Oct 8–10 · 1 more from Oct 9, 3 PM, own room, 1 night');
  // The stay and every link are the same as without the time.
  assert.deepEqual(allLinks(timed).map((l) => l.url), allLinks(untimed).map((l) => l.url));
  // The estimate: stops of day 2 that start before 3 PM are counted for 2, so it is never more than with no time.
  const est = (p) => (p.whereToStay && p.whereToStay.pick && p.whereToStay.pick.estimate) || (p.v4Booking && p.v4Booking.estimate) || null;
  const a = est(timed), b = est(untimed);
  if (a && b && a.high !== null && b.high !== null) assert.ok(a.high <= b.high && a.low <= b.low, `${a.low}-${a.high} vs ${b.low}-${b.high}`);
  const paid = (timed.days[1].stops || []).filter((s) => s.venue).length;
  if (a && paid) { const n = (a.notes || []).find((x) => x.key === 'late'); if (n && /stops before/.test(n.text)) assert.equal(n.text, 'Day 1 and Day 2 stops before the 3 PM arrival counted for 2, the rest for 3.'); }
  // A plan with no later arrival has none of this.
  assert.ok(!/late_arrival|lateArrival|arriving|askTime/.test(JSON.stringify(plain)));
});

test('25. the shared copy: the time and each stop’s note when the link carries it; the unconfirmed day when it does not', () => {
  const p = run(OWNER, { arrive: '2027-10-08', leave: '2027-10-10' });
  const refs = stopIds(p).map((s) => `venue:${s.split(':')[1]}`), days = stopIds(p).map((s) => s.split('-')[0]);
  const stayId = p.whereToStay ? String(p.whereToStay.pick.id) : null;
  const base = { stops: refs.join(','), days: days.join(','), td: '2027-10-08_2027-10-10', ts: 'r', sa: '2027-10-08', sl: '2027-10-10', sc: '1', ad: '3', rm: '2', ra: '1', ...(stayId ? { stay: stayId, nights: '2' } : {}) };
  // A link from before (no time): the honest state.
  const old = app.tripShareContext({ ...base, la: 'j1d2o' }, 'en', NOW), oldHtml = app.tripShareContextHtml(old, 'en');
  assert.deepEqual(old.late.days, { 1: 'for 2', 2: 'for 2 + 1 arriving', 3: 'for all 3' });
  assert.equal(old.late.win, undefined);
  assert.match(oldHtml, /data-mt-late>Day 1 is planned for 2\. Oct 9 \(Day 2\): for 2 until they arrive \(time not set\)\. All 3 from Day 3\./);
  assert.ok(!/What time/.test(oldHtml), 'no question on the shared copy');
  // With the time.
  const c = app.tripShareContext({ ...base, la: 'j1d2o.t1400' }, 'en', NOW), html = app.tripShareContextHtml(c, 'en');
  assert.equal(c.late.line, '2 adults Oct 8–10 · 1 more from Oct 9, 2 PM, own room, 1 night');
  assert.deepEqual(c.late.days, { 1: 'for 2', 2: '2 until 2 PM, then all 3', 3: 'for all 3' });
  assert.deepEqual([c.late.kind, c.late.day, c.late.win.from], ['join', 2, 840]);
  assert.deepEqual(c.late.stop, { few: 'Before the 2 PM arrival: for 2', near: 'Close to the 2 PM arrival: not confirmed for all 3' });
  assert.match(html, /data-mt-late>Day 1 is planned for 2\. Oct 9 \(Day 2\): 2 until 2 PM, then all 3\./);
  const frc = app.tripShareContext({ ...base, la: 'j1d2o.wa' }, 'fr', NOW);
  assert.equal(frc.late.days[2], '2 jusqu’à l’arrivée (après-midi), puis les 3');
  assert.equal(frc.late.stop.few, 'Avant l’arrivée (après-midi) : pour 2');
  // The stay: the same two bookings and links with or without the time; the buttons say each booking.
  if (c.stay) {
    assert.deepEqual(c.stay.links.map((l) => l.url), old.stay.links.map((l) => l.url));
    assert.match(html, /data-mt-late-stay>Two bookings, since one link can’t hold both\. 1: 2 adults, 1 room, Oct 8–10\. 2: 1 adult, 1 room, Oct 9–10\.[^<]* Availability, rooms and the booking itself are confirmed on the booking site\./);
    if (c.stay.split.distinct) assert.deepEqual(c.stay.links.map((l) => l.label), ['2 adults · Oct 8–10', '1 adult · Oct 9–10']);
  }
  assert.ok(!CLAIM_RE.test(JSON.stringify([c.late, old.late, frc.late])));
  // A link with no la= is the copy as it always was.
  const none = app.tripShareContext(base, 'en', NOW);
  assert.equal(none.late, undefined);
});
