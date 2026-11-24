'use strict';
// Build My Trip chat (2026-11-24, Dayton): "When someone asks to make a day less busy, consider how many stops are
// already on that day. If removing an activity would leave only one meal, tell the traveller that the day will be
// mostly free and offer Undo or a gentler alternative. Preserve the explicit room count and other trip preferences."
// The Summerland case: day 2 was a beach at 9 AM and lunch; "make the second day less busy" took the beach out and said
// only "Done. Took out Gordon Beggs Rotary Beach."
// The rule: a removal that leaves the day with no activity (only its meal stops, or nothing) is still made for a day the
// visitor named, and the reply says the day is mostly free, where a kind they asked for still is, and the way back:
// Undo, or "keep it, start later" (offered only when that edit works on the plan). No network; the word rules only.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'whistler' : 'kelowna';
const TOWN = WR ? 'Whistler' : 'Kelowna';
const AT = WR ? [50.1163, -122.9574] : [49.887, -119.496];
const app = require('../server.js');
const db = require('../db.js');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${700 + n} Light Day Road, ${TOWN}, BC`, latitude: AT[0] + n / 4000, longitude: AT[1], description: 'A place used only by the lighter-day tests. Open all year.', slug: `ldt-test-${key.toLowerCase()}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Couples Hotel LDT' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.HOTEL.id, JSON.stringify({ pool: true, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-couples-hotel-ldt.html', own: 'https://fixture-couples-hotel-ldt.example.com/book' } }), '2026-11-24T00:00:00Z', 'test-ldt');
  mk('CAFE', { type: 'cafe', name: 'Sunrise Cafe LDT', vegan: 1, price: 1, hours: HOURS });
  mk('LUNCH1', { type: 'restaurant', name: 'Orchard Lunch LDT', vegan: 1, price: 1, hours: HOURS });
  mk('BREW', { type: 'brewery', name: 'Fixture Brewing LDT', hours: HOURS });
  mk('BEACH1', { type: 'beach', name: 'Powell Sands LDT' });
  mk('DINNER', { type: 'restaurant', name: 'Stone Table LDT', vegan: 1, price: 2, hours: HOURS });
  mk('BEACH2', { type: 'beach', name: 'Rotary Sands LDT' });
  mk('LUNCH2', { type: 'restaurant', name: 'Cove Kitchen LDT', vegan: 1, price: 2, hours: HOURS });
});
test.after(() => {
  app.setTripChatReader(null);
  if (F.HOTEL) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F.HOTEL.id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const REQUEST = 'Plan a 2-day getaway for four adults. We want breweries, lake activities and affordable dinners. One person is vegan and one does not drink alcohol. We have two couples and need two separate hotel rooms.';
const st = (key, id, name, type, role = '', start = 600) => ({ key, id, name, type, day: Number(key[0]), role, start, badges: [] });
const STOPS = [st('1-morning', 1, 'Sunrise Cafe', 'cafe', '', 540), st('1-midday', 2, 'Lunch Counter', 'cafe', 'lunch', 690), st('1-afternoon', 3, 'Fixture Brewing', 'brewery', '', 765), st('1-late', 4, 'Powell Beach', 'beach', '', 945), st('1-evening', 5, 'Stone Table', 'restaurant', 'dinner', 1080),
  st('2-morning', 6, 'Rotary Beach', 'beach', '', 540), st('2-midday', 7, 'Cove Kitchen', 'restaurant', 'lunch', 720)];
const ctx = (extra = {}) => ({ args: { text: REQUEST, seed: 0 }, locks: {}, removed: [], stops: STOPS, days: 2, short: false, lang: 'en', run: () => { throw new Error('nothing is planned again'); }, ...extra });
const go = (m, extra, stops = STOPS) => { const r = tc.rulesRead(m, stops, { days: 2, request: REQUEST }); assert.ok(r.ops.length, m); const out = tc.planTurn(r.ops, { ...ctx(extra), stops }); return { out, reply: tc.buildReply(out, { lang: 'en' }), free: tc.mostlyFreeLine(out.results, 'en', true), freeFr: tc.mostlyFreeLine(out.results, 'fr', true), freeNo: tc.mostlyFreeLine(out.results, 'en', false) }; };

test('1. a day with plenty of stops keeps the short reply; a removal that leaves only a meal says the day is mostly free and offers the way back', () => {
  // Day 1 (café, lunch, brewery, beach, dinner): the beach comes off, the brewery is still there. Short reply.
  let x = go('make day 1 lighter');
  assert.deepEqual(x.out.actions.remove, ['1-late']);
  assert.equal(x.reply, 'Done. Took out Powell Beach.');
  assert.equal(x.free, null, 'a day that keeps an activity says nothing more');
  // Day 2 (beach, lunch): the beach comes off and only lunch is left.
  x = go('Please make the second day less busy');
  assert.deepEqual(x.out.actions.remove, ['2-morning']);
  assert.equal(x.reply, 'Done. Took out Rotary Beach.');
  assert.equal(x.free.line, 'Day 2 is now mostly free: only lunch at Cove Kitchen. You still have Powell Beach on day 1. Undo puts it back. Or keep it and start later?');
  assert.equal(x.freeNo.line, 'Day 2 is now mostly free: only lunch at Cove Kitchen. You still have Powell Beach on day 1. Undo puts it back.');
  assert.equal(x.freeFr.line, 'Le jour 2 est maintenant presque libre : il ne reste que le dîner (Cove Kitchen). Il vous reste Powell Beach le jour 1. Annuler le remet. Ou le garder et commencer plus tard ?');
  assert.equal(x.free.say, 'keep it and start day 2 later [back 2-morning 6 540]');
  assert.equal(x.freeFr.say, 'garde-le et commence le jour 2 plus tard [back 2-morning 6 540]');
  assert.equal(x.out.plan, null, 'nothing is planned again');
  // A stop of no asked kind: no "you still have" sentence. Nothing left at all: "now free".
  const park = [...STOPS.slice(0, 5), st('2-morning', 8, 'Hill Park', 'outdoor', '', 540), STOPS[6]];
  x = go('make day 2 lighter', {}, park);
  assert.equal(x.free.line, 'Day 2 is now mostly free: only lunch at Cove Kitchen. Undo puts it back. Or keep it and start later?');
  x = go('make day 2 lighter', {}, park.slice(0, 6));
  assert.equal(x.free.line, 'Day 2 is now free. Undo puts it back. Or keep it and start later?');
  // A dinner left, and a café with no meal role: both are meals, so the day is mostly free.
  const eve = [...STOPS.slice(0, 5), st('2-morning', 9, 'Morning Cafe', 'cafe', '', 540), st('2-afternoon', 8, 'Hill Park', 'outdoor', '', 840), st('2-evening', 10, 'Late Table', 'restaurant', 'dinner', 1080)];
  x = go('make day 2 lighter', {}, eve);
  assert.deepEqual(x.out.actions.remove, ['2-afternoon'], 'the park, never the café or dinner');
  assert.equal(x.free.line, 'Day 2 is now mostly free: only Morning Cafe and dinner at Late Table. Undo puts it back. Or keep it and start later?');
  // Two activities and lunch: one comes off, one stays. Short reply.
  const two = [...STOPS, st('2-afternoon', 8, 'Hill Park', 'outdoor', '', 840)];
  x = go('make day 2 lighter', {}, two);
  assert.deepEqual(x.out.actions.remove, ['2-afternoon']);
  assert.equal(x.free, null);
});

test('2. when nothing can come off, the sentence is as before; the whole trip’s "slower pace" takes the same care', () => {
  // Day 2's beach is the plan's last (day 1's is gone): the day stays.
  let x = go('Please make the second day less busy', { removed: ['1-late'] });
  assert.deepEqual(x.out.actions.remove, []);
  assert.equal(x.reply, 'I left day 2 as is: it only has Rotary Beach and Cove Kitchen (meals and what you asked for).');
  assert.equal(x.free, null);
  // Asked again once the day is only lunch: the same sentence.
  x = go('make the second day less busy', { removed: ['2-morning'] });
  assert.equal(x.reply, 'I left day 2 as is: it only has Cove Kitchen (meals and what you asked for).');
  // "Slower pace": one stop off a day that keeps an activity (day 1's beach); day 2 would be left with only lunch, so
  // it is not touched.
  x = go('slower pace');
  assert.deepEqual(x.out.actions.remove, ['1-late']);
  assert.equal(x.reply, 'Done. Took out Powell Beach.');
  assert.equal(x.free, null);
  // Again: the brewery is the trip's only one (asked for), day 2's beach the last beach, the breakfast café a meal.
  // Nothing comes off, it is said, and the trip is not planned again (it used to take the brewery out).
  x = go('slower pace', { removed: ['1-late'] });
  assert.deepEqual(x.out.actions.remove, []);
  assert.equal(x.out.plan, null);
  assert.equal(x.reply, 'Every day is already down to meals and what you asked for, so I left the plan as is.');
  assert.equal(tc.buildReply(x.out, { lang: 'fr' }), 'Chaque jour ne compte déjà que les repas et ce que vous avez demandé; je n’ai rien changé.');
  // A trip where every day would be left mostly free: the last day that has a stop to give, said as mostly free.
  const thin = [st('1-morning', 11, 'Hill Park', 'outdoor', '', 540), st('1-midday', 2, 'Lunch Counter', 'cafe', 'lunch', 690), st('2-morning', 12, 'Creek Walk', 'outdoor', '', 540), st('2-midday', 7, 'Cove Kitchen', 'restaurant', 'lunch', 720)];
  x = go('slower pace', {}, thin);
  assert.deepEqual(x.out.actions.remove, ['2-morning']);
  assert.equal(x.free.line, 'Day 2 is now mostly free: only lunch at Cove Kitchen. Undo puts it back. Or keep it and start later?');
  // A full trip: one stop off each day, never a café or a meal.
  const full = [...STOPS, st('2-afternoon', 8, 'Hill Park', 'outdoor', '', 840)];
  x = go('slower pace', {}, full);
  assert.deepEqual(x.out.actions.remove, ['1-late', '2-afternoon']);
  assert.equal(x.free, null);
});

test('3. the gentler way: read only from its own tagged offer, by a short "later" message, never by another ask', () => {
  const say = 'keep it and start day 2 later [back 2-morning 6 540]';
  assert.deepEqual(tc.backOffer([say]), { key: '2-morning', id: 6, day: 2, start: 540 });
  assert.deepEqual(tc.backOffer(['keep it [back 2-morning 6]']), { key: '2-morning', id: 6, day: 2 });
  assert.equal(tc.backOffer(['add Hill Park on day 2 [verified outdoor d2 patio 8]']), null);
  assert.equal(tc.backOffer([]), null);
  for (const m of ['yes', 'Yes please', 'keep it', 'keep it, start later', 'keep it and start day 2 later', 'start day 2 later', 'later', 'oui', 'Garde-le', 'Garde-le, commence plus tard', 'plus tard']) assert.equal(tc.takesBack(m), true, m);
  for (const m of ['add a winery on day 2', 'remove lunch and start later', 'move dinner later', 'swap it for something later in the day', 'what is on day 2?', 'no']) assert.equal(tc.takesBack(m), false, m);
});

test('4. end to end: the removal, the mostly-free reply, the offer taken (the stop is back, the day starts later); rooms and the request are untouched', async () => {
  const text = `Plan a 2-day getaway in ${TOWN} for four adults. We want breweries, lake activities and affordable dinners. One person is vegan and one does not drink alcohol. We have two couples and need two separate hotel rooms.`;
  const stops = [['1-morning', F.CAFE, 540], ['1-midday', F.LUNCH1, 690], ['1-afternoon', F.BREW, 765], ['1-late', F.BEACH1, 945], ['1-evening', F.DINNER, 1080], ['2-morning', F.BEACH2, 540], ['2-midday', F.LUNCH2, 720]].map(([key, v, start]) => ({ key, id: v.id, start }));
  const turn = async (message, extra = {}, lang = 'en') => {
    const v = app.parseTripChatBody({ message, lang, plan: { text, seed: 0, excludeVenueIds: extra.exclude || [] }, locks: {}, removed: extra.removed || [], stops: extra.stops || stops, stayId: F.HOTEL.id, ...(extra.offer ? { offer: extra.offer } : {}) }, { stays: true });
    assert.ok(v.value, JSON.stringify(v.error));
    return (await app.runTripChatTurn(v.value, { staysOn: true, lang })).response;
  };
  // Dayton's message: both parts, and the day said as it now is.
  let r = await turn('We need two hotel rooms, one for each couple. Please make the second day less busy.');
  assert.deepEqual(r.actions.remove, ['2-morning']);
  assert.match(r.reply, /^Rooms are already set to 2\. Done\. Took out Rotary Sands LDT\. Day 2 is now mostly free: only lunch at Cove Kitchen LDT\. You still have Powell Sands LDT on day 1\. Undo puts it back\.(?: Or keep it and start later\?)?$/);
  assert.ok(!r.plan && !r.req && !r.party && !r.stayBlock && r.text === undefined, 'no re-plan, no change to the rooms, the stay or the request');
  const fr = await turn('Rends la deuxième journée moins chargée.', {}, 'fr');
  assert.match(fr.reply, /^C’est fait\. J’ai retiré Rotary Sands LDT\. Le jour 2 est maintenant presque libre : il ne reste que le dîner \(Cove Kitchen LDT\)\. Il vous reste Powell Sands LDT le jour 1\. Annuler le remet/);
  // A day that stays reasonably full: the short reply, no offer.
  const d1 = await turn('make day 1 lighter');
  assert.equal(d1.reply, 'Done. Took out Powell Sands LDT.');
  assert.ok(!(d1.offer || []).length);
  // The offer is made only when it works; taken, the stop is back in its slot and the day starts later.
  const after = { removed: ['2-morning'], stops: stops.filter((s) => s.key !== '2-morning'), exclude: [F.BEACH2.id] };
  if ((r.offer || []).length) {
    assert.match(r.reply, / Or keep it and start later\?$/);
    assert.equal(r.offer[0], `keep it and start day 2 later [back 2-morning ${F.BEACH2.id} 540]`);
    const b = await turn('keep it, start later', { ...after, offer: r.offer });
    assert.match(b.reply, /^Put Rotary Sands LDT back\. Done\. Day 2 now starts later: /);
    const now = tc.planStops(b.plan);
    const beach = now.find((s) => s.id === F.BEACH2.id);
    assert.ok(beach && beach.day === 2 && beach.start > 540, 'the beach is back on day 2, later');
    for (const s of stops.filter((x) => x.key[0] === '1')) assert.ok(now.some((n) => n.id === s.id && n.day === 1), 'day 1 is untouched');
    assert.ok(!(b.req.excludeVenueIds || []).includes(F.BEACH2.id), 'it is no longer kept out of the plan');
    assert.equal(b.req.text, text, 'the request (rooms, vegan, non-drinker, breweries, lake) is as typed');
    assert.deepEqual([b.plan.whereToStay.trip.rooms, b.plan.whereToStay.trip.roomsAssumed, b.plan.whereToStay.trip.adults], [2, undefined, 4]);
    // The same words with no such offer are an ordinary message (nothing is put back).
    const plain = await turn('keep it, start later', after);
    assert.ok(!plain.plan || !tc.planStops(plain.plan).some((s) => s.id === F.BEACH2.id));
    // Another ask right after the offer is read as itself: the offer is not taken.
    const yes = await turn('yes', { ...after, offer: r.offer });
    assert.match(yes.reply, /^Put Rotary Sands LDT back\. /);
    const no = await turn('no', { ...after, offer: r.offer });
    assert.ok(!no.plan && !(no.actions.remove || []).length && no.reply.length > 0, 'a no keeps the plan as it is');
    const other = await turn('remove the brewery', { ...after, offer: r.offer });
    assert.deepEqual(other.actions.remove, ['1-afternoon']);
    assert.ok(!other.plan);
  } else assert.match(r.reply, /Undo puts it back\.$/);
  // Asked again now that day 2 is only lunch: nothing more comes off.
  const again = await turn('make the second day less busy', after);
  assert.deepEqual(again.actions.remove, []);
  assert.equal(again.reply, 'I left day 2 as is: it only has Cove Kitchen LDT (meals and what you asked for).');
});
