'use strict';
// Build My Trip (2026-11-23, Dayton's report at 390px): "Plan a 2-day birthday getaway in Summerland for four adults on
// July 10–11, 2027. We want breweries, lake activities and affordable dinners. One person is vegan and one does not
// drink alcohol. We have two couples and need two separate hotel rooms."
//   1. Rooms: the plan showed FOUR rooms ("separate rooms" read as a room per adult, over the number said).
//   2. Chat: "We need two hotel rooms, one for each couple. Please make the second day less busy." set the rooms and
//      dropped the second part.
//   3. Vegan: the plan said all 4 meal stops list vegan options, its shared copy said 5 (a brewery planned after lunch
//      was a meal stop by its clock time on the copy).
// No network; the word rules only (no AI reader).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const H = require('../trip-honest-plan.js');
const ts = require('../trip-stays.js');
const sbl = require('../stay-booking-links.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'whistler' : 'kelowna';
const TOWN = WR ? 'Whistler' : 'Kelowna';
const AT = WR ? [50.1163, -122.9574] : [49.887, -119.496];
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const EXPLAIN = fs.readFileSync(require.resolve('../trip-chat-explain.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${600 + n} Rooms Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 3000, longitude: AT[1], description: 'A place used only by the rooms, chat and vegan tests. Open all year.', slug: `rmv-test-${key.toLowerCase()}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Couples Hotel RMV' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.HOTEL.id, JSON.stringify({ pool: true, hot_tub: true, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-couples-hotel.html', own: 'https://fixture-couples-hotel.example.com/book' } }), '2026-11-23T00:00:00Z', 'test-rmv');
  mk('CAFE', { type: 'cafe', name: 'Sunrise Cafe RMV', vegan: 1, price: 1, hours: HOURS });
  mk('LUNCH', { type: 'cafe', name: 'Orchard Lunch Counter RMV', vegan: 1, price: 1, hours: HOURS });
  mk('BREW', { type: 'brewery', name: 'Fixture Brewing RMV', vegan: 1, hours: HOURS });
  mk('DINNER', { type: 'restaurant', name: 'Stone Table RMV', vegan: 1, price: 2, hours: HOURS });
  mk('DINNER2', { type: 'restaurant', name: 'Cove Kitchen RMV', vegan: 1, price: 2, hours: HOURS });
});
test.after(() => {
  app.setTripChatReader(null);
  if (F.HOTEL) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F.HOTEL.id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const REQ = `Plan a 2-day birthday getaway in ${TOWN} for four adults. We want breweries and affordable dinners, and a hotel with a pool. We have two couples and need two separate hotel rooms.`;
const plan = (text, stay) => {
  const b = app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true });
  assert.ok(b.value, JSON.stringify(b.error));
  return app.runTripPlanRequest(b.value, true);
};
const trip = (text, stay) => { const p = plan(text, stay); assert.ok(p.whereToStay && p.whereToStay.pick, `a stay for: ${text}`); return p.whereToStay; };

test('1. a number of rooms said in the request wins over "separate rooms", in English and French', () => {
  const said = (m) => ts.roomsInText(m);
  for (const [m, n] of [['We have two couples and need two separate hotel rooms.', 2], ['two separate hotel rooms', 2], ['2 rooms', 2], ['two couples, we need two rooms', 2], ['we need three separate rooms', 3],
    ['deux chambres séparées', 2], ['Nous sommes deux couples et il nous faut deux chambres séparées', 2], ['We need two hotel rooms, one for each couple', 2],
    // A room for each couple, with the couples counted in the same text.
    ['two couples, a room for each couple', 2], ['three couples, one room per couple', 3], ['Deux couples, une chambre par couple', 2]]) assert.deepEqual(said(m), { rooms: n }, m);
  // A room for each couple with no count: one for every two adults (worked out with the party).
  for (const m of ['a room for each couple', 'a hotel room per couple', 'une chambre par couple', 'each couple gets their own room']) assert.deepEqual(said(m), { couple: true }, m);
  assert.equal(ts.roomsGiven({ couple: true }, 4), 2);
  assert.equal(ts.roomsGiven({ couple: true }, 5), 3);
  assert.equal(ts.roomsGiven({ couple: true }, null), null);
  assert.equal(ts.roomsGiven({ each: true }, 4), 4);
  assert.equal(ts.roomsGiven({ rooms: 2 }, 4), 2);
  assert.equal(ts.roomsGiven(null, 4), null);
  // "separate rooms" with no number and no couples: a room per adult, as before.
  for (const m of ['separate rooms', 'we want separate rooms', 'our own rooms', 'a room each', 'chambres séparées', 'une chambre chacun']) assert.deepEqual(said(m), { each: true }, m);
  // Couples named, "separate rooms" and no number: not a room per adult; the labelled assumption stands.
  assert.equal(said('two couples, separate rooms please'), null);
  // Not a number of rooms.
  for (const m of ['We have two couples', 'a couple of nights', 'a couples getaway', 'a brewery tour, one for each couple', 'a 2 bedroom condo']) assert.equal(said(m), null, m);
});

test('2. the plan: the rooms asked for are chosen (not assumed) in the stay block, its links and notes, and the shared copy', () => {
  let w = trip(REQ);
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [4, 2, undefined], 'two rooms, chosen');
  assert.equal(w.pick.id, F.HOTEL.id, 'the fixture hotel');
  const bc = w.pick.bookingLinks.find((l) => l.key === 'booking_com');
  assert.ok(bc, 'a Booking.com link');
  const inner = (u) => { try { const x = new URL(u).searchParams.get('link'); return x ? new URL(x) : new URL(u); } catch (e) { return new URL(u); } };
  assert.equal(new URL(bc.url).searchParams.get('rooms') || inner(bc.url).searchParams.get('no_rooms'), '2', bc.url);
  assert.doesNotMatch(decodeURIComponent(bc.url), /no_rooms=4|[?&]rooms=4/);
  // The hand-off notes say two rooms wherever they say rooms; none says four.
  const notes = (w.pick.handoff || []).flatMap((h) => [h.note, h.noteFr]).filter(Boolean).join(' ');
  assert.match(notes, /2 rooms/);
  assert.match(notes, /2 chambres/);
  assert.doesNotMatch(notes, /4 rooms|4 chambres/);
  // French, and a room for each couple.
  w = trip(`Planifie une escapade de 2 jours à ${TOWN} pour quatre adultes, avec des microbrasseries et un hôtel avec piscine. Nous sommes deux couples et il nous faut deux chambres séparées.`);
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [4, 2, undefined]);
  w = trip(`A 2-day ${TOWN} getaway for four adults, breweries and a hotel with a pool, a room for each couple`);
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [4, 2, undefined]);
  w = trip(`Escapade de 2 jours à ${TOWN} pour quatre adultes, microbrasseries et hôtel avec piscine, une chambre par couple`);
  assert.deepEqual([w.trip.rooms, w.trip.roomsAssumed], [2, undefined]);
  // Two couples and no number of rooms: two rooms, labelled as our assumption.
  w = trip(`A 2-day ${TOWN} getaway for two couples, breweries and a hotel with a pool`);
  assert.deepEqual([w.trip.adults, w.trip.rooms, w.trip.roomsAssumed], [4, 2, true]);
  // "separate rooms" alone keeps its meaning; a number picked on the page still wins over the request's words.
  w = trip(`A 2-day ${TOWN} getaway for four friends, separate rooms, breweries and a hotel with a pool`);
  assert.deepEqual([w.trip.rooms, w.trip.roomsAssumed], [4, undefined]);
  w = trip(REQ, { rooms: 3 });
  assert.deepEqual([w.trip.rooms, w.trip.roomsAssumed], [3, undefined]);
  // A request that says nothing of rooms is as before.
  w = trip(`A 2-day ${TOWN} getaway for four adults, breweries and a hotel with a pool`);
  assert.deepEqual([w.trip.rooms, w.trip.roomsAssumed], [2, true]);
  // The shared copy: rm=2 with no ra, read back as chosen, said as "4 adults · 2 rooms"; the notes say two rooms.
  const c = H.parseShareContext({ stay: String(F.HOTEL.id), nights: '1', ad: '4', rm: '2' });
  assert.deepEqual([c.rooms, c.roomsAssumed], [2, undefined]);
  assert.match(H.shareContextQuery(c), /(?:^|&)rm=2(?:&|$)/);
  assert.doesNotMatch(H.shareContextQuery(c), /ra=1/);
  const ctx = app.tripShareContext({ stops: `venue:${F.DINNER.id}`, days: '1', stay: String(F.HOTEL.id), nights: '1', ad: '4', rm: '2' }, 'en');
  const html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>4 adults · 2 rooms · /);
  assert.doesNotMatch(html, /assumed|4 rooms/);
  assert.match(html, /enter 2 rooms there/);
  // The page: the link carries the rooms as chosen, and the copied itinerary says them on the stay line.
  assert.ok(V4.includes("out += '&rm=' + t.rooms + (t.roomsAssumed ? '&ra=1' : '')"));
  assert.ok(V4.includes("d.chosen.name + (rmTxt ? ' · ' + rmTxt : '')") && V4.includes('t3RoomsLabel(d.w.trip, fr)'));
});

test('3. the chat: a rooms part and an itinerary part in one message are both done, in either order, and both are said', async () => {
  const text = REQ;
  const core = plan(text);
  const stops = tc.planStops(core).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) }));
  const stayId = core.whereToStay && core.whereToStay.pick ? core.whereToStay.pick.id : null;
  const dayDates = null;
  const turn = async (message, stay, lang = 'en') => {
    const v = app.parseTripChatBody({ message, lang, plan: { text, seed: 0, excludeVenueIds: [], ...(stay ? { stay } : {}) }, locks: {}, removed: [], stops, ...(stayId ? { stayId } : {}), ...(dayDates ? { dayDates } : {}) }, { stays: true });
    assert.ok(v.value, JSON.stringify(v.error));
    return (await app.runTripChatTurn(v.value, { staysOn: true, lang })).response;
  };
  const day2 = tc.planStops(core).filter((s) => s.day === 2);
  assert.ok(day2.length, 'the plan has a second day');
  const lighter = (r, what) => {
    const gone = (r.actions && r.actions.remove) || [];
    if (gone.length) {
      assert.ok(gone.every((k) => /^2-/.test(k)), `${what}: only day 2 changes (${gone})`);
      for (const k of gone) { const s = day2.find((x) => x.key === k); assert.ok(s && !s.role, `${what}: never a meal`); assert.ok(r.reply.includes(s.name), `${what}: the stop taken out is named`); }
      assert.match(r.reply, /Took out /);
    } else assert.match(r.reply, /I left day 2 as is: it only has .+ \(meals and what you asked for\)\.|Day 2 has nothing left to take out\./, `${what}: the day part is answered`);
  };
  // Dayton's message. The rooms are already two (chosen in the request): said so, not "set" again; day 2 is answered.
  let r = await turn('We need two hotel rooms, one for each couple. Please make the second day less busy.');
  assert.match(r.reply, /^Rooms are already set to 2\. /);
  assert.equal(r.party, undefined, 'nothing to set');
  lighter(r, 'rooms first');
  // The other order: the day first, then the rooms.
  r = await turn('Please make the second day less busy. We need two hotel rooms, one for each couple.');
  assert.match(r.reply, / Rooms are already set to 2\.$/);
  lighter(r, 'day first');
  // One sentence, no verb to cut at.
  r = await turn('2 rooms and a lighter day 2');
  assert.match(r.reply, /Rooms are already set to 2\./);
  lighter(r, 'one sentence');
  // A real change of rooms beside another edit: both happen, the rooms in a few words.
  const brew = tc.planStops(core).find((s) => s.type === 'brewery');
  assert.ok(brew, 'the plan has a brewery');
  r = await turn('change to 3 rooms and remove the brewery');
  assert.deepEqual(r.party, { rooms: 3 });
  assert.ok(r.actions.remove.includes(brew.key), 'the brewery is taken out');
  assert.match(r.reply, /^Rooms set to 3; the booking site confirms them\. .*Took out /);
  assert.ok(r.reply.includes(brew.name));
  assert.equal(r.stayBlock.whereToStay.trip.rooms, 3);
  r = await turn('remove the brewery and make it 3 rooms');
  assert.deepEqual(r.party, { rooms: 3 });
  assert.ok(r.actions.remove.includes(brew.key));
  assert.match(r.reply, /Took out .*Rooms set to 3; the booking site confirms them\.$/);
  // French, with an accent the splitter folds away.
  r = await turn('Il nous faut deux chambres. Rends la deuxième journée moins chargée.', null, 'fr');
  assert.match(r.reply, /^Les chambres sont déjà réglées à 2\. /);
  assert.ok(((r.actions && r.actions.remove) || []).every((k) => /^2-/.test(k)));
  assert.match(r.reply, /J’ai retiré |J’ai laissé le jour 2 tel quel|Il n’y a plus rien à retirer au jour 2/);
  // A question beside the rooms: the rooms are set and the question is answered (never dropped).
  r = await turn('make it 3 rooms and why is the brewery on the plan?');
  assert.deepEqual(r.party, { rooms: 3 });
  assert.ok(r.reply.length > 'Rooms set to 3; the booking site confirms them.'.length + 10, r.reply);
  assert.ok(!(r.actions.remove || []).length && !r.plan, 'a question changes no stop');
  // A part that cannot be read is said, and the rooms part is still done.
  r = await turn('We need 3 rooms. Please book the flights for us.');
  assert.deepEqual(r.party, { rooms: 3 });
  assert.match(r.reply, /^Rooms set to 3; the booking site confirms them\. \S/);
  // Rooms alone: as before (the full hand-off sentence), and the same number again is "already".
  r = await turn('make it 3 rooms');
  assert.match(r.reply, /^Set to 3 rooms\. /);
  r = await turn('make it 3 rooms', { rooms: 3 });
  assert.equal(r.reply, 'Rooms are already set to 3.');
  r = await turn('a room for each couple');
  assert.equal(r.reply, 'Rooms are already set to 2.');
  r = await turn('mets 2 chambres', null, 'fr');
  assert.equal(r.reply, 'Les chambres sont déjà réglées à 2.');
  // An assumed number said back by the visitor becomes theirs (set, not "already").
  const text2 = `A 2-day ${TOWN} getaway for two couples, breweries and a hotel with a pool`;
  const core2 = plan(text2);
  const v2 = app.parseTripChatBody({ message: 'we need 2 rooms', lang: 'en', plan: { text: text2, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: tc.planStops(core2).map((s) => ({ key: s.key, id: s.id })), stayId: core2.whereToStay.pick.id }, { stays: true });
  const r2 = (await app.runTripChatTurn(v2.value, { staysOn: true, lang: 'en' })).response;
  assert.deepEqual(r2.party, { rooms: 2 });
  assert.match(r2.reply, /^Set to 2 rooms\. /);
});

test('4. a lighter day: "the second day" is that day; meals and the plan’s last stop of a kind asked for stay; nothing is re-planned', () => {
  const st = (key, id, name, type, role = '') => ({ key, id, name, type, day: Number(key[0]), role, start: 600, badges: [] });
  const stops = [st('1-morning', 1, 'Sunrise Cafe', 'cafe'), st('1-midday', 2, 'Lunch Counter', 'cafe', 'lunch'), st('1-afternoon', 3, 'Fixture Brewing', 'brewery'), st('1-late', 4, 'Powell Beach', 'beach'), st('1-evening', 5, 'Stone Table', 'restaurant', 'dinner'),
    st('2-morning', 6, 'Rotary Beach', 'beach'), st('2-midday', 7, 'Cove Kitchen', 'restaurant', 'lunch')];
  const request = 'Plan a 2-day getaway for four adults. We want breweries, lake activities and affordable dinners.';
  const read = (m) => tc.rulesRead(m, stops, { days: 2, request });
  const ctx = (extra = {}) => ({ args: { text: request, seed: 0 }, locks: {}, removed: [], stops, days: 2, short: false, lang: 'en', run: () => { throw new Error('nothing is planned again'); }, ...extra });
  const go = (m, extra) => { const r = read(m); assert.ok(r.ops.length, m); const out = tc.planTurn(r.ops, ctx(extra)); return { out, reply: tc.buildReply(out, { lang: 'en' }) }; };
  // The day named in words is the day changed (it used to take a stop off day 1).
  for (const m of ['Please make the second day less busy', 'make day 2 lighter', 'slow down the second day', 'the second day is too busy', 'a more relaxed day 2', 'Rends la deuxième journée moins chargée']) {
    const r = read(m);
    assert.deepEqual(r.ops.map((o) => [o.o, o.value, o.day]), [['pace', 'relaxed', 2]], m);
  }
  // Day 2: the beach comes off (day 1 still has one, so "lake activities" is still on the plan); lunch stays.
  let x = go('Please make the second day less busy');
  assert.deepEqual(x.out.actions.remove, ['2-morning']);
  assert.equal(x.reply, 'Done. Took out Rotary Beach.');
  assert.equal(x.out.plan, null);
  // With day 1's beach already gone, day 2's is the plan's last: the day stays, and the reply says why.
  x = go('Please make the second day less busy', { removed: ['1-late'] });
  assert.deepEqual(x.out.actions.remove, []);
  assert.equal(x.reply, 'I left day 2 as is: it only has Rotary Beach and Cove Kitchen (meals and what you asked for).');
  assert.equal(tc.buildReply(x.out, { lang: 'fr' }), 'J’ai laissé le jour 2 tel quel : il n’a que Rotary Beach et Cove Kitchen (les repas et ce que vous avez demandé).');
  // Day 1: the trip's only brewery stays (asked for), the breakfast café stays while anything else can go.
  x = go('make day 1 lighter');
  assert.deepEqual(x.out.actions.remove, ['1-late']);
  x = go('make day 1 lighter', { removed: ['2-morning'] });
  assert.deepEqual(x.out.actions.remove, ['1-morning'], 'only the café is left to take');
  // A request that asked for none of it: the last extra stop, as before.
  x = (() => { const r = read('make day 1 lighter'); const out = tc.planTurn(r.ops, ctx({ args: { text: 'a relaxed weekend', seed: 0 } })); return { out }; })();
  assert.deepEqual(x.out.actions.remove, ['1-late']);
  // "Slower pace" for the whole trip is unchanged: the last extra stop of each day that has two or more.
  x = go('slower pace');
  assert.deepEqual(x.out.actions.remove, ['1-late']);
});

test('5. vegan: the plan and its shared copy count the same meal stops (a brewery after lunch is not a second lunch)', () => {
  // The plan's own stops, as the planner places them: the brewery is the afternoon's stop, at 12:45.
  const V = (v, extra = {}) => ({ id: v.id, name: v.name, type: v.type, region: REGION, badges: [{ key: 'vegan' }], ...extra });
  const planLike = { kind: 'multi_day', requirementResults: [{ kind: 'feature', value: 'vegan', strength: 'must' }, { kind: 'type', value: 'brewery', strength: 'must', status: 'satisfied' }], partySome: [{ concept: 'alcohol' }], warnings: [],
    days: [{ day: 1, stops: [{ daypart: 'morning', reasons: [], venue: V(F.CAFE) }, { daypart: 'midday', reasons: [{ code: 'meal' }], venue: V(F.LUNCH) }, { daypart: 'afternoon', reasons: [], venue: V(F.BREW) }, { daypart: 'evening', reasons: [], venue: V(F.DINNER) }] },
      { day: 2, stops: [{ daypart: 'midday', reasons: [], venue: V(F.DINNER2) }] }] };
  H.applyEvidence(planLike, { flags: (id) => db.prepare('SELECT * FROM venues WHERE id = ?').get(id) });
  const ev = (list, ask) => list.find((e) => e.ask === ask);
  const pv = ev(planLike.evidence, 'vegan');
  assert.equal(pv.text, 'Vegan: all 4 meal stops list vegan options.');
  assert.deepEqual(pv.stops.map((s) => s.id), [F.CAFE.id, F.LUNCH.id, F.DINNER.id, F.DINNER2.id], 'the four meal stops, never the brewery');
  // The link the page makes: the asks, and one 0/1 per stop for the plan's meal stops.
  assert.deepEqual(H.shareAsks(planLike), ['type:brewery', 'vegan', 'nonalcoholic']);
  assert.ok(V4.includes("if (mealIds) out += '&ml=' + list.map("));
  const q = { stops: [F.CAFE, F.LUNCH, F.BREW, F.DINNER, F.DINNER2].map((v) => `venue:${v.id}`).join(','), days: '1,1,1,1,2', t: '540,690,765,1080,720', ad: '4', rm: '2', asks: 'type:brewery,vegan,nonalcoholic', ml: '11011' };
  assert.equal(H.parseShareContext(q).meals, '11011');
  assert.match(H.shareContextQuery(H.parseShareContext(q)), /(?:^|&)ml=11011(?:&|$)/);
  for (const bad of ['2', 'abc', '1'.repeat(61), '']) assert.equal((H.parseShareContext({ ad: '4', ml: bad }) || {}).meals, undefined, bad);
  const line = (c, ask) => c.lines.find((l) => l.ask === ask);
  let c = app.tripShareContext(q, 'en');
  assert.equal(line(c, 'vegan').text, 'Vegan: all 4 meal stops list vegan options. Confirm with each place when you book.');
  assert.deepEqual(ev(c.evidence, 'vegan').stops.map((s) => s.id), pv.stops.map((s) => s.id), 'the same stops as the plan');
  assert.equal(line(app.tripShareContext(q, 'fr'), 'vegan').text, 'Végane : les 4 arrêts repas indiquent des options véganes. Confirmez auprès de chaque endroit en réservant.');
  // The non-drinker's line counts the same places on the plan and on the copy.
  assert.deepEqual(ev(c.evidence, 'nonalcoholic').stops.map((s) => s.id), ev(planLike.evidence, 'nonalcoholic').stops.map((s) => s.id));
  assert.equal(line(c, 'nonalcoholic').text, ev(planLike.evidence, 'nonalcoholic').text);
  // An older link (no ml): a brewery at lunch time beside that day's lunch café is not a second lunch (it said 5).
  const { ml, ...old } = q;
  c = app.tripShareContext(old, 'en');
  assert.match(line(c, 'vegan').text, /^Vegan: all 4 meal stops list vegan options\./);
  // …but a pub or brewery that IS the day's lunch still counts, with or without ml.
  const lunchAtBrewery = { stops: [F.BREW, F.DINNER].map((v) => `venue:${v.id}`).join(','), days: '1,1', t: '750,1080', ad: '2', asks: 'vegan' };
  assert.match(line(app.tripShareContext(lunchAtBrewery, 'en'), 'vegan').text, /^Vegan: all 2 meal stops list vegan options\./);
  assert.match(line(app.tripShareContext({ ...lunchAtBrewery, ml: '11' }, 'en'), 'vegan').text, /^Vegan: all 2 meal stops list vegan options\./);
  assert.match(line(app.tripShareContext({ ...lunchAtBrewery, ml: '01' }, 'en'), 'vegan').text, /^Vegan: the meal stop lists vegan options\./);
  // A restaurant or café is always a meal stop, whatever the link says; an ml of the wrong length is ignored.
  assert.match(line(app.tripShareContext({ ...q, ml: '00000' }, 'en'), 'vegan').text, /^Vegan: all 4 meal stops/);
  assert.match(line(app.tripShareContext({ ...q, ml: '111' }, 'en'), 'vegan').text, /^Vegan: all 4 meal stops/);
  // Vegetarian and gluten-free go through the same count.
  const veg = app.tripShareContext({ ...q, asks: 'vegetarian,gluten_free' }, 'en');
  assert.equal(ev(veg.evidence, 'vegetarian').stops.length, 4);
  assert.equal(ev(veg.evidence, 'gluten_free').stops.length, 4);
  // The chat's answer (the same function runs on the page): a meal stop taken off the page since leaves the plan's
  // other meal stops counted, not a different definition of a meal.
  const box = {}; vm.runInNewContext(`${EXPLAIN.slice(EXPLAIN.indexOf('function tripEvidenceFor'), EXPLAIN.indexOf('\n}\n', EXPLAIN.indexOf('function tripEvidenceFor')) + 3)}; out.fn = tripEvidenceFor;`, { out: box });
  const shown = [F.CAFE, F.LUNCH, F.BREW, F.DINNER, F.DINNER2].map((v, i) => ({ id: v.id, name: v.name, type: v.type, key: ['1-morning', '1-midday', '1-afternoon', '1-evening', '2-midday'][i], feats: ['vegan'] }));
  let e = box.fn('vegan', shown, planLike.evidence, 'en');
  assert.deepEqual([e.source, e.total, e.status].join(), 'plan,4,verified');
  assert.equal(e.line, 'Vegan: all 4 meal stops list vegan options.');
  e = box.fn('vegan', shown.filter((s) => s.id !== F.DINNER.id), planLike.evidence, 'en');
  assert.deepEqual([e.source, e.total, e.status, e.has.map((s) => s.id).join()], ['plan', 3, 'verified', [F.CAFE.id, F.LUNCH.id, F.DINNER2.id].join()]);
});

test('6. without these things nothing changes: a link with no dietary ask, an older link, a plan with no rooms said', () => {
  const q = { stops: `venue:${F.BREW.id},venue:${F.DINNER.id}`, days: '1,1', t: '765,1080', ad: '2', asks: 'type:brewery' };
  const c = app.tripShareContext(q, 'en');
  assert.equal(c.meals, undefined);
  assert.equal(H.shareContextQuery(H.parseShareContext(q)), 't=765,1080&ad=2&asks=type:brewery');
  assert.ok(!c.lines.some((l) => /Confirm with each place/.test(l.text)));
  assert.equal(app.tripShareContext({ stops: q.stops }, 'en'), null, 'stops only: no context, as before');
  // The link gains ml only with a dietary ask.
  assert.ok(V4.includes("/^(?:vegan|vegetarian|gluten_free)$/.test(e.ask || '')"));
  // The party and the default rooms are as before.
  assert.deepEqual(sbl.stayRoomsFor(4, null), { rooms: 2, assumed: true });
  assert.deepEqual(sbl.stayRoomsFor(4, 2), { rooms: 2, assumed: false });
});
