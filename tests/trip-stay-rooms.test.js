'use strict';
// Build My Trip, rooms for a group's stay (2026-11-22, Dayton: "the suggested hotel link includes six adults and
// no_rooms=1, but the planner does not visibly ask how many rooms the group wants"). The rooms value (said, picked or a
// labelled assumption), the provider links that carry it, the stay line and notes, the chat, the shared trip link.
// No network: the provider formats were checked by hand on the providers' own pages (see stay-booking-links.js).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.ANTHROPIC_API_KEY;
const sbl = require('../stay-booking-links.js');
const ts = require('../trip-stays.js');
const hp = require('../trip-honest-plan.js');
const tb = require('../trip-booking.js');
const tc = require('../trip-chat.js');
const app = require('../server.js');

// One fixture hotel (with a pool and its three booking links), removed again at the end.
const db = require('../db.js');
let FIX = null;
test.before(() => {
  FIX = app.createVenue({ region: 'kelowna', type: 'stay', cuisine: 'hotel', slug: 'trip-rooms-test-fixture-hotel', name: 'Fixture Hotel', address: '101 Water Street, Kelowna, BC', latitude: 49.887, longitude: -119.496, description: 'A fixture used only by the trip rooms tests.' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(FIX.id, JSON.stringify({ pool: true, hot_tub: true, kid_friendly: true, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-hotel.html', expedia: 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information', own: 'https://fixture-hotel.example.com/book' } }), '2026-11-22T00:00:00Z', 'test');
});
test.after(() => {
  if (FIX) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(FIX.id); db.prepare('DELETE FROM venues WHERE id = ?').run(FIX.id); }
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const V3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const LAYOUT = fs.readFileSync(require.resolve('../trip-workspace-layout.js'), 'utf8');
const SIX = 'Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.';

const STAY = { id: 1, name: 'Fixture Hotel', info: { booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-hotel.html', expedia: 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information', own: 'https://fixture-hotel.example.com/book' } } };
const S22 = { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'testaid' };
const links = (trip, env = {}) => Object.fromEntries(sbl.exactStayLinks(STAY, trip, { env }).map((l) => [l.key, l.url]));
const qs = (url) => new URL(url).searchParams;
const rms = (url) => [...qs(url).entries()].filter(([k]) => /^rm\d+$/.test(k)).map(([k, v]) => `${k}=${v}`).join('&');
const DATES = { arrive: '2026-12-11', leave: '2026-12-13' };

test('1. the rooms are read from the request and the chat, in English and French', () => {
  const said = (m) => ts.roomsInText(m);
  for (const [m, want] of [['3 rooms', 3], ['we need two rooms', 2], ['2 rooms for the 6 of us', 2], ['one room', 1], ['we only need one room', 1], ['we will share a room', 1], ['all in one room', 1],
    ['3 chambres', 3], ['deux chambres svp', 2], ['on partage une chambre', 1], ['une seule chambre', 1], ['4 hotel rooms', 4], ['12 rooms', 8]]) assert.deepEqual(said(m), { rooms: want }, m);
  for (const m of ['separate rooms', 'a room each', 'our own rooms', 'une chambre chacun', 'chambres séparées', 'chacun sa chambre']) assert.deepEqual(said(m), { each: true }, m);
  // Not a number of rooms: a kind of unit, a table, a tasting room, the owner's own request.
  for (const m of ['a 2 bedroom condo', 'room for two at dinner', 'two tasting rooms', 'share a few plates', 'a hotel with a pool', SIX, '']) assert.equal(said(m), null, m);
  // The chat: a short message about the rooms and nothing else; "we'll share" counts there; a question is an ask.
  assert.deepEqual(ts.roomsChat('make it 3 rooms'), { rooms: 3 });
  assert.deepEqual(ts.roomsChat('we only need one room'), { rooms: 1 });
  assert.deepEqual(ts.roomsChat('We’ll share'), { rooms: 1 });
  assert.deepEqual(ts.roomsChat('a room each please'), { each: true });
  assert.deepEqual(ts.roomsChat('mets 3 chambres'), { rooms: 3 });
  assert.deepEqual(ts.roomsChat('how many rooms did you assume?'), { ask: true });
  assert.deepEqual(ts.roomsChat('Combien de chambres ?'), { ask: true });
  for (const m of ['does the hotel have rooms with a kitchen?', 'swap the winery', 'a hotel with 2 rooms and a pool', 'is there a room with a view?']) assert.equal(ts.roomsChat(m), null, m);
  // The trip inputs accept rooms 1 to 8 only.
  assert.deepEqual(ts.parseTripStayInput({ adults: 6, rooms: 3 }).value, { adults: 6, rooms: 3 });
  for (const bad of [0, 9, 2.5, '3']) assert.ok(ts.parseTripStayInput({ rooms: bad }).error, String(bad));
});

test('2. the rule: said or picked rooms win; else a labelled assumption, never silently one room for a group', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 16].map(sbl.stayDefaultRooms), [1, 1, 2, 2, 3, 3, 4, 4, 5, 8]);
  assert.equal(sbl.stayDefaultRooms(null), null);
  assert.deepEqual(ts.tripRooms(1), { rooms: 1, roomsAssumed: true });
  assert.deepEqual(ts.tripRooms(2), { rooms: 1, roomsAssumed: true });
  assert.deepEqual(ts.tripRooms(6), { rooms: 3, roomsAssumed: true });
  assert.deepEqual(ts.tripRooms(6, 2), { rooms: 2 });
  assert.deepEqual(ts.tripRooms(6, 1), { rooms: 1 });
  assert.deepEqual(ts.tripRooms(2, 5), { rooms: 2 }, 'never more rooms than adults');
  assert.deepEqual(ts.tripRooms(null), {}, 'no adult count: no rooms value');
  // When the question is shown: three or more adults, or more than four people to a room.
  assert.equal(sbl.stayRoomsMatter(1, 0, 1), false);
  assert.equal(sbl.stayRoomsMatter(2, 0, 1), false);
  assert.equal(sbl.stayRoomsMatter(2, 2, 1), false);
  assert.equal(sbl.stayRoomsMatter(2, 3, 1), true);
  assert.equal(sbl.stayRoomsMatter(3, 0, 2), true);
  assert.equal(sbl.stayRoomsMatter(6, 0, 3), true);
  // The split: even, the same every time; the children one at a time to room 1, 2, 3...
  assert.deepEqual(sbl.stayRoomSplit(6, [], 3), [{ adults: 2, ages: [] }, { adults: 2, ages: [] }, { adults: 2, ages: [] }]);
  assert.deepEqual(sbl.stayRoomSplit(5, [], 2).map((r) => r.adults), [3, 2]);
  assert.deepEqual(sbl.stayRoomSplit(7, [], 4).map((r) => r.adults), [2, 2, 2, 1]);
  assert.deepEqual(sbl.stayRoomSplit(4, [3, 6, 9], 2), [{ adults: 2, ages: [3, 9] }, { adults: 2, ages: [6] }]);
  assert.deepEqual(sbl.stayRoomSplit(2, [6, 9], 1), [{ adults: 2, ages: [6, 9] }]);
  assert.equal(sbl.stayRoomSplit(2, [], 5).length, 2, 'each room has an adult');
});

test('3. Booking.com, Expedia and the Stay22 wrapper carry the party and the rooms', () => {
  // One adult, a couple: one room, as before.
  let l = links({ adults: 1 });
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=1&no_rooms=1');
  assert.equal(l.expedia, 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a1');
  l = links({ adults: 2 });
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=2&no_rooms=1');
  assert.equal(rms(l.expedia), 'rm1=a2');
  // Six adults, nothing said: the labelled assumption (3), never no_rooms=1.
  l = links({ adults: 6 });
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=3');
  assert.equal(rms(l.expedia), 'rm1=a2&rm2=a2&rm3=a2');
  assert.equal(l.own, 'https://fixture-hotel.example.com/book', 'the hotel’s own engine is never pre-filled');
  // Six adults in 3, 2 and 1 rooms as chosen.
  assert.equal(qs(links({ adults: 6, rooms: 3 }).booking_com).get('no_rooms'), '3');
  l = links({ adults: 6, rooms: 2 });
  assert.equal(qs(l.booking_com).get('no_rooms'), '2');
  assert.equal(qs(l.booking_com).get('group_adults'), '6');
  assert.equal(rms(l.expedia), 'rm1=a3&rm2=a3');
  l = links({ adults: 6, rooms: 1 });
  assert.equal(qs(l.booking_com).get('no_rooms'), '1');
  assert.equal(rms(l.expedia), 'rm1=a6');
  // A family: the children with their ages, as before; with dates and without.
  const fam = { adults: 2, kids: 2, kidAges: [6, 9] };
  l = links(fam);
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=2&group_children=2&age=6&age=9&no_rooms=1');
  assert.equal(rms(l.expedia), 'rm1=a2:c6:c9');
  assert.ok(!/checkin|chkin/.test(l.booking_com + l.expedia), 'no dates given, none sent');
  l = links({ ...fam, ...DATES });
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?checkin=2026-12-11&checkout=2026-12-13&group_adults=2&group_children=2&age=6&age=9&no_rooms=1');
  assert.equal(decodeURIComponent(l.expedia), 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?chkin=2026-12-11&chkout=2026-12-13&rm1=a2:c6:c9');
  // Kids whose ages we do not know: the adults only on Expedia (never an invented age), the count on Booking.com.
  l = links({ adults: 4, kids: 2, rooms: 2 });
  assert.equal(rms(l.expedia), 'rm1=a2&rm2=a2');
  assert.equal(qs(l.booking_com).get('group_children'), '2');
  assert.equal(qs(l.booking_com).getAll('age').length, 0);
  // Two families in two rooms.
  assert.equal(rms(links({ adults: 4, kids: 3, kidAges: [3, 6, 9], rooms: 2 }).expedia), 'rm1=a2:c3:c9&rm2=a2:c6');
  // Six adults with dates: both together.
  l = links({ adults: 6, rooms: 3, ...DATES });
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?checkin=2026-12-11&checkout=2026-12-13&group_adults=6&no_rooms=3');
  assert.equal(l.expedia, 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?chkin=2026-12-11&chkout=2026-12-13&rm1=a2&rm2=a2&rm3=a2');
  // A party we do not know: as before (one room on Booking.com, nothing on Expedia).
  l = links({});
  assert.equal(l.booking_com, 'https://www.booking.com/hotel/ca/fixture-hotel.html?no_rooms=1');
  assert.equal(l.expedia, 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information');

  // Through Stay22 Allez: its own adults / children / childrenAges / rooms (it builds the provider URL from these and
  // drops the party inside link=), and the same party inside the wrapped URL.
  l = links({ adults: 6 }, S22);
  let q = qs(l.booking_com);
  assert.equal(new URL(l.booking_com).origin + new URL(l.booking_com).pathname, 'https://www.stay22.com/allez/booking');
  assert.deepEqual([q.get('aid'), q.get('adults'), q.get('rooms'), q.get('children'), q.get('checkin')], ['testaid', '6', '3', null, null]);
  assert.equal(q.get('link'), 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=3');
  q = qs(l.expedia);
  assert.deepEqual([q.get('adults'), q.get('rooms')], ['6', '3']);
  assert.equal(q.get('link'), 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a2&rm2=a2&rm3=a2');
  assert.equal(l.own, 'https://fixture-hotel.example.com/book');
  q = qs(links({ adults: 6, rooms: 2, ...DATES }, S22).booking_com);
  assert.deepEqual([q.get('adults'), q.get('rooms'), q.get('checkin'), q.get('checkout')], ['6', '2', '2026-12-11', '2026-12-13']);
  q = qs(links({ adults: 1 }, S22).booking_com);
  assert.deepEqual([q.get('adults'), q.get('rooms')], ['1', '1']);
  q = qs(links({ adults: 2 }, S22).expedia);
  assert.deepEqual([q.get('adults'), q.get('rooms')], ['2', '1']);
  q = qs(links(fam, S22).booking_com);
  assert.deepEqual([q.get('adults'), q.get('children'), q.get('childrenAges'), q.get('rooms')], ['2', '2', '6,9', '1']);
  assert.equal(q.get('link'), 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=2&group_children=2&age=6&age=9&no_rooms=1');
  q = qs(links({ adults: 2, kids: 2 }, S22).booking_com);
  assert.equal(q.get('childrenAges'), null, 'never an invented age');
  q = qs(links({}, S22).booking_com);
  assert.deepEqual([q.get('adults'), q.get('rooms')], [null, null]);
});

test('4. the plan: the owner’s request gets 3 rooms (assumed); said and picked rooms are kept; a re-plan keeps the choice', () => {
  const plan = (text, stay) => {
    const b = app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true });
    assert.ok(b.value, JSON.stringify(b.error));
    return app.runTripPlanRequest(b.value, true);
  };
  const trip = (text, stay) => { const p = plan(text, stay); assert.ok(p.whereToStay && p.whereToStay.pick, `a stay for: ${text}`); return p.whereToStay; };
  let w = trip(SIX);
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed, w.trip.datesGiven], [6, 3, true, false]);
  const bc = w.pick.bookingLinks.find((x) => x.key === 'booking_com');
  assert.equal(bc.url, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=3', 'six adults, three rooms, no dates');
  // Picked under Dates and guests (or by the room buttons): kept, and no longer an assumption; a re-plan (the same
  // inputs again, as every later request sends them) gives the same.
  for (const n of [3, 2, 1]) {
    w = trip(SIX, { rooms: n });
    assert.deepEqual([w.trip.rooms, w.trip.roomsAssumed], [n, undefined], `picked ${n}`);
    assert.equal(qs(w.pick.bookingLinks.find((x) => x.key === 'booking_com').url).get('no_rooms'), String(n));
  }
  // Said in the request.
  w = trip('A 3-day Kelowna weekend for 6 friends, 2 rooms, wineries and a hotel with a pool');
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [6, 2, undefined]);
  w = trip('A 3-day Kelowna weekend for 4 friends, a room each, wineries and a hotel');
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [4, 4, undefined]);
  w = trip('Fin de semaine de 3 jours à Kelowna pour 6 amis, 3 chambres, vignobles');
  assert.deepEqual([w.trip.rooms, w.trip.roomsAssumed], [3, undefined]);
  // One person, a couple, a family: one room (assumed), the links as before.
  w = trip('A weekend in Kelowna on my own, good food and a hotel');
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [1, 1, true]);
  w = trip('Romantic weekend in Kelowna for two, a hotel with a hot tub');
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [2, 1, true]);
  assert.equal(w.pick.bookingLinks.find((x) => x.key === 'booking_com').url, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=2&no_rooms=1');
  w = trip('Family weekend in Kelowna with two kids, 6 and 9, a hotel with a pool');
  assert.deepEqual([w.trip.adults, w.trip.adultsAssumed, w.trip.kids, w.trip.kidAges, w.trip.rooms, w.trip.roomsAssumed], [2, true, 2, [6, 9], 1, true]);
  assert.equal(w.pick.bookingLinks.find((x) => x.key === 'booking_com').url, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=2&group_children=2&age=6&age=9&no_rooms=1');
  assert.equal(rms(w.pick.bookingLinks.find((x) => x.key === 'expedia').url), 'rm1=a2:c6:c9');
  // With dates: dates and rooms together.
  w = trip(SIX, { ...DATES, rooms: 2 });
  assert.equal(w.pick.bookingLinks.find((x) => x.key === 'booking_com').url, 'https://www.booking.com/hotel/ca/fixture-hotel.html?checkin=2026-12-11&checkout=2026-12-13&group_adults=6&no_rooms=2');
  // The estimate is not multiplied by the rooms picked: the same figures for 1, 2 and 3 rooms.
  const est = (n) => JSON.stringify(tb.tripEstimate({ days: [{ day: 1, stops: [{ venue: { id: 1, name: 'Bistro', type: 'restaurant', price: 2 } }] }] }, { id: 9, priceLevel: 2, sleeps: 4 }, { nights: 2, adults: 6, rooms: n }));
  assert.equal(est(1), est(3));
  assert.equal(est(2), est(3));
});

test('5. the chat sets the rooms, says the links were updated, and answers what it assumed', async () => {
  const text = SIX;
  const core = app.runTripPlanRequest(app.parseTripPlanBody({ text }, { v4: true }).value, true);
  const stops = tc.planStops(core).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) }));
  const stayId = core.whereToStay && core.whereToStay.pick ? core.whereToStay.pick.id : null;
  const turn = async (message, stay, lang = 'en') => {
    const v = app.parseTripChatBody({ message, lang, plan: { text, seed: 0, excludeVenueIds: [], ...(stay ? { stay } : {}) }, locks: {}, removed: [], stops, ...(stayId ? { stayId } : {}) }, { stays: true });
    assert.ok(v.value, JSON.stringify(v.error));
    return (await app.runTripChatTurn(v.value, { staysOn: true, lang })).response;
  };
  // The answer is honest about the assumption, and changes nothing.
  let r = await turn('how many rooms did you assume?');
  assert.equal(r.reply, 'I assumed 3 rooms for 6 adults: one room for every two adults. Nobody chose that, so tell me the number you want (“make it 2 rooms”) or tap it by the stay.');
  assert.ok(!r.plan && !r.stayBlock && !r.party, 'a question never changes the plan');
  r = await turn('how many rooms did you assume?', { rooms: 2 });
  assert.match(r.reply, /^The stay links are set for 2 rooms for 6 adults, as you asked\./);
  r = await turn('combien de chambres ?', null, 'fr');
  assert.match(r.reply, /^J’ai supposé 3 chambres pour 6 adultes/);
  assert.equal(stayId, FIX.id);
  r = await turn('make it 4 rooms');
  assert.deepEqual(r.party, { rooms: 4 });
  assert.equal(r.reply, 'Set to 4 rooms. The stay links are updated; rooms and how many each sleeps are confirmed on the booking site.');
  assert.ok(!r.plan, 'the stops are not planned again');
  {
    assert.deepEqual([r.stayBlock.whereToStay.trip.rooms, r.stayBlock.whereToStay.trip.roomsAssumed], [4, undefined]);
    assert.equal(r.stayBlock.whereToStay.pick.id, stayId, 'the same place to stay');
    for (const l of r.stayBlock.whereToStay.pick.bookingLinks) if (l.key === 'booking_com') assert.match(decodeURIComponent(l.url), /no_rooms=4/);
  }
  r = await turn('we only need one room', { rooms: 4 });
  assert.deepEqual(r.party, { rooms: 1 });
  assert.match(r.reply, /^Set to 1 room\. The stay links are updated; whether one room sleeps everyone is confirmed on the booking site\.$/);
  r = await turn('a room each');
  assert.deepEqual(r.party, { rooms: 6 });
  assert.match(r.reply, /^Set to 6 rooms, one per adult\./);
  r = await turn('mets 3 chambres', null, 'fr');
  assert.deepEqual(r.party, { rooms: 3 });
  assert.match(r.reply, /^C’est noté : 3 chambres\. Les liens d’hébergement sont à jour/);
  // Undo on the page restores the Rooms field with the plan (the snapshot carries it).
  assert.ok(CHAT.includes("rooms: (document.getElementById('t3Rooms') || {}).value || ''") && CHAT.includes("if (rmEl) rmEl.value = o.rooms || '';"));
  assert.ok(CHAT.includes("if (j.party && j.party.rooms > 0)"));
  // A number picked by the buttons or the chat is that trip's: a new request starts without it.
  assert.ok(V4.includes("if (el && el.getAttribute('data-v4-auto')) { el.value = ''; el.removeAttribute('data-v4-auto'); }"));
});

test('6. the shared trip: rm / ra round trip; an older link opens exactly as before', () => {
  const c = hp.parseShareContext({ stay: '1970', nights: '2', ad: '6', rm: '3', ra: '1' });
  assert.deepEqual(c, { stayId: 1970, nights: 2, adults: 6, rooms: 3, roomsAssumed: true });
  assert.equal(hp.shareContextQuery(c), 'stay=1970&nights=2&ad=6&rm=3&ra=1');
  assert.deepEqual(hp.parseShareContext(Object.fromEntries(new URLSearchParams(hp.shareContextQuery(c)))), c);
  assert.deepEqual(hp.parseShareContext({ ad: '6', rm: '2' }), { adults: 6, rooms: 2 });
  assert.deepEqual(hp.parseShareContext({ ad: '2', kids: '2', ka: '6,9', rm: '1', ra: '1' }), { adults: 2, kids: 2, kidAges: [6, 9], rooms: 1, roomsAssumed: true });
  // Not valid: left out, never an error.
  for (const bad of [{ ad: '6', rm: '0' }, { ad: '6', rm: '9' }, { ad: '6', rm: 'x' }, { rm: '3' }]) assert.equal((hp.parseShareContext(bad) || {}).rooms, undefined, JSON.stringify(bad));
  assert.equal(hp.parseShareContext({ ad: '2', rm: '5' }).rooms, 2, 'never more rooms than adults');
  assert.equal(hp.parseShareContext({ ad: '2', kids: '2', ka: '6,99' }).kidAges, undefined);
  // An older link (no rm): the context has no rooms, and its links are built as they were (one room, rm1=a6).
  const old = hp.parseShareContext({ stay: '1970', nights: '2', ad: '6' });
  assert.deepEqual(old, { stayId: 1970, nights: 2, adults: 6 });
  const legacy = sbl.exactStayLinks(STAY, { adults: 6, roomsLegacy: true }, { env: {} });
  assert.equal(legacy[0].url, 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=1');
  assert.equal(legacy[1].url, 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a6');
  assert.equal(qs(sbl.exactStayLinks(STAY, { adults: 6, roomsLegacy: true }, { env: S22 })[0].url).get('rooms'), null);
  // The page's line and notes.
  const ctx = { adults: 6, rooms: 3, roomsAssumed: true, stay: { id: 1, name: 'Fixture Hotel', links: [{ label: 'Book on Booking.com', url: 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=3', key: 'booking_com', rel: 'nofollow noopener' }, { label: 'Hotel’s own site', url: 'https://fixture-hotel.example.com/book', key: 'own', rel: 'nofollow noopener' }] }, lines: [], suggestions: [] };
  let html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>6 adults · 3 rooms \(assumed\) · Dates not set</);
  assert.match(html, /data-mt-rooms-note>Hotel’s own site: enter 3 rooms there\. Rooms and how many each sleeps are confirmed on the booking site\.</);
  html = app.tripShareContextHtml({ ...ctx, roomsAssumed: false, rooms: 2 }, 'fr');
  assert.match(html, /data-mt-facts>6 adultes · 2 chambres · Dates à choisir</);
  assert.match(html, /Site de l’hôtel : indiquez 2 chambres sur place\. Les chambres et leur capacité sont confirmées sur le site de réservation\./);
  // A couple and an older link: the line as before, no rooms note.
  html = app.tripShareContextHtml({ adults: 2, rooms: 1, roomsAssumed: true, stay: ctx.stay, lines: [], suggestions: [] }, 'en');
  assert.match(html, /data-mt-facts>2 adults · Dates not set</);
  assert.doesNotMatch(html, /data-mt-rooms-note/);
  html = app.tripShareContextHtml({ adults: 6, stay: ctx.stay, lines: [], suggestions: [] }, 'en');
  assert.match(html, /data-mt-facts>6 adults · Dates not set</);
  assert.doesNotMatch(html, /data-mt-rooms-note|\d rooms?\b/);
  // The link the page makes.
  assert.ok(V4.includes("out += '&rm=' + t.rooms + (t.roomsAssumed ? '&ra=1' : '')") && V4.includes("out += '&ka=' + t.kidAges.join(',')"));
});

test('7. the page: the stay line, the rooms row, the notes, the sheet and the link rewrite (run as the browser runs them)', () => {
  // The browser's own functions, taken from the page source and run here.
  const grab = (src, name) => { const i = src.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } throw new Error(name); };
  const v3src = require('../trip-planner-v3-page.js');
  assert.ok(V3.includes("${require('./stay-booking-links').ROOMS_CLIENT_SRC}"), 'the page gets the same rule as the server');
  const fields = { t3Adults: '', t3Kids: '', t3Rooms: '' };
  const state = { trip: { adults: 6, rooms: 3, roomsAssumed: true, datesGiven: false, nights: 2 }, links: [{ key: 'booking_com' }] };
  const box = { document: { getElementById: (id) => (id in fields ? { get value() { return fields[id]; }, set value(v) { fields[id] = String(v); }, setAttribute() {}, removeAttribute() {} } : null) }, URL, Number, Math, String,
    esc: (s) => String(s), vt: (k) => (k === 'assumed' ? (box.FR ? ' (supposé)' : ' (assumed)') : k), t3StayData: () => ({ w: { trip: state.trip }, chosen: { bookingLinks: state.links } }) };
  vm.createContext(box);
  vm.runInContext([sbl.ROOMS_CLIENT_SRC, grab(V3, 't3RoomsLabel'), grab(V3, 't3StayTripLine'), grab(V4, 'v4RoomsState'), grab(V4, 'v4PartyUrl'), grab(V4, 'v4RoomsHtml'), grab(V4, 'v4RoomsNote'), grab(V4, 'v4SetRooms')].join('\n'), box);
  void v3src;
  const line = (t, fr) => box.t3StayTripLine(t, !!fr);
  assert.equal(line(state.trip), 'Dates not set · 2 nights · 6 adults · 3 rooms (assumed)');
  assert.equal(line(state.trip, true), 'Dates à choisir · 2 nuits · 6 adultes · 3 chambres (supposé)');
  assert.equal(line({ ...state.trip, rooms: 2, roomsAssumed: false }), 'Dates not set · 2 nights · 6 adults · 2 rooms');
  assert.equal(line({ adults: 6, rooms: 1, nights: 2, datesGiven: false }), 'Dates not set · 2 nights · 6 adults · 1 room');
  assert.equal(line({ adults: 2, rooms: 1, roomsAssumed: true, nights: 1, datesGiven: false }), 'Dates not set · 1 night · 2 adults', 'a couple: as before');
  assert.equal(line({ adults: 1, rooms: 1, roomsAssumed: true, nights: 1, datesGiven: false }), 'Dates not set · 1 night · 1 adult');
  assert.equal(line({ adults: 2, adultsAssumed: true, kids: 2, rooms: 1, roomsAssumed: true, nights: 1, datesGiven: false }), 'Dates not set · 1 night · 2 adults (assumed), 2 kids');
  assert.equal(line({ adults: 2, kids: 3, rooms: 1, roomsAssumed: true, nights: 1, datesGiven: false }), 'Dates not set · 1 night · 2 adults, 3 kids · 1 room (assumed)');
  assert.equal(line({ adults: 6, rooms: 3, roomsAssumed: true, nights: 2, arrive: '2026-12-11', leave: '2026-12-13', datesGiven: true }), 'Dec 11–13 · 2 nights · 6 adults · 3 rooms (assumed)');
  // The rooms row: a labelled group, the number now, the current one marked, "4+" when there can be more.
  let row = box.v4RoomsHtml(false);
  assert.match(row, /^<div class="v4-rooms" role="group" aria-label="How many rooms\?"><span class="v4-rooms-now" data-v4-rooms-now>3 rooms \(assumed\)<\/span>/);
  assert.deepEqual([...row.matchAll(/data-v4-rooms="(\w+)" aria-pressed="(\w+)" aria-label="([^"]+)">([^<]+)</g)].map((m) => m.slice(1).join('|')), ['1|false|1 room|1', '2|false|2 rooms|2', '3|true|3 rooms|3', 'more|false|4 rooms or more|4+']);
  box.FR = true;
  assert.match(box.v4RoomsHtml(true), /aria-label="Combien de chambres \?"><span class="v4-rooms-now" data-v4-rooms-now>3 chambres \(supposé\)</);
  box.FR = false;
  // The link on the page before any pick is the server's own.
  const BC = 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=3';
  const EX = 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a2&rm2=a2&rm3=a2';
  const WR = sbl.exactStayLinks(STAY, { adults: 6 }, { env: S22 })[0].url;
  assert.equal(box.v4PartyUrl(BC), BC);
  // Pick 2: "(assumed)" goes, the choice stays, every link follows.
  box.v4SetRooms(2);
  assert.equal(fields.t3Rooms, '2');
  assert.deepEqual([state.trip.rooms, state.trip.roomsAssumed], [2, undefined]);
  row = box.v4RoomsHtml(false);
  assert.match(row, /data-v4-rooms-now>2 rooms<\/span>/);
  assert.match(row, /data-v4-rooms="2" aria-pressed="true"/);
  assert.equal(box.v4PartyUrl(BC), 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=2');
  assert.equal(box.v4PartyUrl(EX), 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a3&rm2=a3');
  let w = new URL(box.v4PartyUrl(WR)).searchParams;
  assert.deepEqual([w.get('adults'), w.get('rooms'), w.get('link')], ['6', '2', 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=6&no_rooms=2']);
  assert.equal(box.v4PartyUrl('https://fixture-hotel.example.com/book'), 'https://fixture-hotel.example.com/book', 'the hotel’s own link is left as it is');
  // 4+, then one more with each tap up to one room per adult.
  box.v4SetRooms(5);
  assert.match(box.v4RoomsHtml(false), /data-v4-rooms="more" aria-pressed="true" aria-label="5 rooms; tap to add one">5</);
  box.v4SetRooms(9);
  assert.equal(fields.t3Rooms, '6', 'never more rooms than adults');
  // "we are 4 adults" (the Adults field): a picked 6 becomes 4; with nothing picked, the assumption follows the party.
  fields.t3Adults = '4';
  assert.equal(box.v4RoomsState().rooms, 4);
  fields.t3Rooms = ''; state.trip = { adults: 6, rooms: 3, roomsAssumed: true, datesGiven: false };
  assert.deepEqual([box.v4RoomsState().rooms, box.v4RoomsState().assumed], [2, true]);
  assert.equal(box.v4PartyUrl(BC), 'https://www.booking.com/hotel/ca/fixture-hotel.html?group_adults=4&no_rooms=2');
  // A family with the ages typed: the ages stay with the children on Expedia.
  fields.t3Adults = ''; fields.t3Rooms = '1'; state.trip = { adults: 2, kids: 2, kidAges: [6, 9], rooms: 1, roomsAssumed: true };
  assert.equal(decodeURIComponent(box.v4PartyUrl('https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a2%3Ac6%3Ac9')), 'https://www.expedia.ca/Kelowna-Hotels-Fixture-Hotel.h123.Hotel-Information?rm1=a2:c6:c9');
  // A single traveller and a couple: no row, no note.
  fields.t3Rooms = '';
  for (const t of [{ adults: 1, rooms: 1, roomsAssumed: true }, { adults: 2, rooms: 1, roomsAssumed: true }, { adults: 2, kids: 2, rooms: 1, roomsAssumed: true }, {}]) { state.trip = t; assert.equal(box.v4RoomsHtml(false), '', JSON.stringify(t)); }
  state.trip = { adults: 2, rooms: 1, roomsAssumed: true };
  assert.equal(box.v4RoomsNote({ bookingLinks: [{ key: 'booking_com' }] }, false), '');
  // The notes: three or more people; a hotel's own site with more than one room; Expedia with no dates.
  state.trip = { adults: 6, rooms: 3, roomsAssumed: true, datesGiven: false };
  assert.equal(box.v4RoomsNote({ bookingLinks: [{ key: 'booking_com' }] }, false), 'Rooms and how many each sleeps are confirmed on the booking site.');
  assert.equal(box.v4RoomsNote({ bookingLinks: [{ key: 'booking_com' }] }, true), 'Les chambres et leur capacité sont confirmées sur le site de réservation.');
  assert.equal(box.v4RoomsNote({ bookingLinks: [{ key: 'own' }] }, false), 'Hotel’s own site: enter 3 rooms there. Rooms and how many each sleeps are confirmed on the booking site.');
  assert.equal(box.v4RoomsNote({ bookingLinks: [{ key: 'own' }] }, true), 'Site de l’hôtel : indiquez 3 chambres sur place. Les chambres et leur capacité sont confirmées sur le site de réservation.');
  assert.match(box.v4RoomsNote({ bookingLinks: [{ key: 'expedia' }] }, false), /^Expedia shows your guests and rooms only once dates are picked: enter them there\. Rooms and/);
  state.trip.datesGiven = true;
  assert.doesNotMatch(box.v4RoomsNote({ bookingLinks: [{ key: 'expedia' }] }, false), /Expedia/);
  state.trip = { adults: 2, kids: 2, rooms: 1, roomsAssumed: true, datesGiven: true };
  assert.equal(box.v4RoomsNote({ bookingLinks: [{ key: 'booking_com' }] }, false), 'Rooms and how many each sleeps are confirmed on the booking site.');
  assert.equal(box.v4RoomsNote({ bookingLinks: [] }, false), '', 'no button, no line');
  // Nothing in the new words promises a room, a bed or availability.
  for (const s of [box.v4RoomsNote({ bookingLinks: [{ key: 'own' }] }, false), row]) assert.doesNotMatch(s, /confirmed for|available|sleeps (?:all|six|6)|fits/i);
  // Where it is wired: the plan's stay card, the Book my trip sheet (with the estimate's line), Dates and guests, the
  // address bar, and tap targets of 44px.
  assert.ok(CHAT.includes("var roomsRow = typeof v4RoomsHtml === 'function' ? v4RoomsHtml(fr) : ''") && CHAT.includes('data-v4-rooms-note'));
  assert.ok(V4.includes("esc(fr ? 'Changer' : 'Change') + '</button>' : '') + '</div>' + v4RoomsHtml(fr);"), 'the sheet has the row under the stay');
  assert.ok(V4.includes("'$1 · ' + esc(rl) + '$2'"), 'the estimate says the rooms with the party');
  assert.ok(V4.includes('data-v4-est-rooms') && V4.includes("'The stay figure is for ' + sp.rooms"), 'a priced stay says how many rooms its figure is for when the links carry another number');
  assert.ok(V3.includes('<select id="t3Rooms">') && V3.includes("var rm = g('t3Rooms'); if (/^[1-8]$/.test(rm)) o.rooms = Number(rm);"));
  assert.ok(V3.includes('<span class="t3-en">Rooms</span><span class="t3-fr" lang="fr">Chambres</span>'));
  assert.ok(V4.includes("if (o.rooms) p.push('rooms=' + o.rooms);") && V4.includes("any = set('t3Rooms', q.rooms) || any;"));
  assert.ok(V4.includes('.t3-v4 .v4-book .v4-rooms button { height: 44px; }') && V4.includes('min-width: 44px') && LAYOUT.includes('.v4-stay-card .v4-rooms button::after {inset:-9px -1px;}'));
  // The sheet's stay notes say the same (t3StayNotesHtml).
  assert.ok(V3.includes("'Rooms and how many each sleeps are confirmed on the booking site.'") && V3.includes("'Hotel’s own site: enter ' + t.rooms + ' rooms there.'"));
});
