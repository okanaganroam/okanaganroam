'use strict';
// Build My Trip (2026-11-24, Dayton's report at 390px): after "Swap it in" (Kinsmen Spray Park -> Okanagan River Path,
// offered with "Its listing gives no ages: check it suits a 15-year-old"), the caveat was gone: not on the new stop's
// card, not on the shared copy. And after "Use these dates" the one Undo button undid the dates, the swap could no
// longer be undone, and nothing said which of the two "Undo" meant.
//   1. The age check stays with the stop: the card, the Book my trip list, the share link (ac=), the shared copy and
//      the copied text. Only when the listing gives no ages; never "not suitable".
//   2. A swap can be undone later, on the plan as it is then: the stop goes back into its slot and the stay, its dates
//      and rooms stay as they are now.
// No network; the word rules only (no AI reader).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const B = require('../trip-budget.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
// A town with no cycling listing of its own in the test data, and a second town a few kilometres away.
const REGION = WR ? 'britannia-beach' : 'oliver', TOWN = WR ? 'Britannia Beach' : 'Oliver';
const REGION2 = WR ? 'furry-creek' : 'okanagan-falls', TOWN2 = WR ? 'Furry Creek' : 'Okanagan Falls';
const AT = WR ? [49.624, -123.205] : [49.183, -119.548];
const PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const H = require('../trip-honest-plan.js');
const app = require('../server.js');
const db = require('../db.js');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${800 + n} Age Check Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 5000, longitude: AT[1], description: 'A place used only by the swap tests. Open all year.', slug: `agc-test-${key.toLowerCase()}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const stayInfo = (v, level) => db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ price_level: level, sleeps: 4, confidence: 'high', booking: { own: `https://${v.slug}.example.com/book` } }), '2026-11-24T00:00:00Z', 'test-agc');
test.before(() => {
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Lakeside Hotel AGC' }); stayInfo(F.HOTEL, 2);
  mk('CHEAP', { type: 'stay', cuisine: 'motel', name: 'Fixture Thrifty Motel AGC' }); stayInfo(F.CHEAP, 1);
  mk('SPRAY', { type: 'outdoor', name: 'Fixture Spray Park AGC', kid_friendly: 1, hours: HOURS, description: 'A free splash pad with a playground for kids aged 2 to 12. Open all year.' });
  mk('LUNCH', { type: 'restaurant', name: 'Fixture Taco Counter AGC', price: 1, hours: HOURS });
  mk('DINNER', { type: 'restaurant', name: 'Fixture Pizza Table AGC', price: 2, hours: HOURS });
  mk('TRAIL', { type: 'outdoor', name: 'Fixture Hike and Bike Trail AGC', kid_friendly: 1, hours: HOURS, description: 'A wide, flat dyke path, great for all ages on foot or by bicycle. Open all year.' });
  // The next town: a winery bike tour (2 km away, nearer) and a bike path (3 km away).
  mk('WINEBIKE', { region: REGION2, type: 'tour', name: 'Fixture Vineyard Bike Tours AGC', hours: HOURS, latitude: AT[0] + 0.018, description: 'Guided e-bike rides to wineries, with tastings and a vineyard lunch included. Open all year.' });
  mk('PATH', { region: REGION2, type: 'outdoor', name: 'Fixture Creekside Bike Path AGC', hours: HOURS, latitude: AT[0] + 0.027, description: 'A flat walking and biking path beside the creek. An easy walk or ride any time of year.' });
  mk('ALLAGES', { region: REGION2, type: 'outdoor', name: 'Fixture Riverside Bike Loop AGC', hours: HOURS, latitude: AT[0] + 0.04, description: 'A paved bike loop, great for all ages. Open all year.' });
  mk('SPRAY2', { region: REGION2, type: 'outdoor', name: 'Fixture Second Spray Park AGC', hours: HOURS, latitude: AT[0] + 0.03, description: 'A free splash pad. Open all year.' });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const k of ['HOTEL', 'CHEAP']) if (F[k]) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F[k].id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const REQ = `Plan a 2-day trip in ${TOWN} from July 10 to July 11, 2027 for one adult and a 15-year-old. We want cycling, swimming and casual food. No alcohol or wineries please. We need a hotel for one night and our total budget is $300 for both of us.`;
const stopsOn = () => [{ key: '1-morning', id: F.TRAIL.id, start: 540 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-afternoon', id: F.SPRAY.id, start: 840 }, { key: '1-evening', id: F.DINNER.id, start: 1080 }];
const swapped = (to) => stopsOn().map((s) => (s.id === F.SPRAY.id ? { ...s, id: to } : s));
const turn = async (message, o = {}) => {
  const v = app.parseTripChatBody({ message, lang: o.lang || 'en', plan: { text: o.text || REQ, seed: 0, excludeVenueIds: o.exclude || [], ...(o.stay ? { stay: o.stay } : {}) }, locks: {}, removed: [], stops: o.stops || stopsOn(), stayId: o.stayId || F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) }, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const at = (p) => Object.fromEntries(tc.planStops(p).map((s) => [s.key, [s.id, s.start]]));
const offerTo = (id, name) => `${name} [swap ${F.SPRAY.id}>${id} cycling 15]`;
const backOf = (id) => `Fixture Spray Park AGC [swap ${id}>${F.SPRAY.id} back]`;
const NEVER = /not suitable|unsuitable|isn’t suitable|is suitable|suitable for|déconseillé|ne convient pas/i;
const NO_TIME = (reply) => assert.doesNotMatch(reply, /\b\d+\s*(?:min|minutes|hours?)\b|\bdrive\b|en voiture/i, reply);

test('1. the age check is worded once, in a few words, and never says a place is or is not suitable', () => {
  const a = app.tripAgeCheck(1892, 15);
  assert.deepEqual(a, { id: 1892, age: 15, short: 'Age 15: check it suits', shortFr: '15 ans : à vérifier', note: 'Ages not listed: check it suits a 15-year-old.', noteFr: 'Âges non indiqués : vérifiez que cela convient à 15 ans.' });
  for (const x of [a.short, a.shortFr, a.note, a.noteFr]) assert.doesNotMatch(x, NEVER);
});

test('2. a swap made for an age keeps the check with the new stop when its listing gives no ages; a listing that covers the age gets none; no other stop gets one', async () => {
  // The place offered in the next town (no ages on its listing): the check rides on the response, for that stop only.
  const r = await turn('yes', { offer: [offerTo(F.PATH.id, 'Fixture Creekside Bike Path AGC')] });
  assert.ok(r.plan, r.reply);
  assert.deepEqual(r.ageAsk, [app.tripAgeCheck(F.PATH.id, 15)]);
  assert.match(r.reply, /\(about \d+(?:\.\d)? km in a straight line\)\. Nothing else changed\.$/); NO_TIME(r.reply);
  // What the page needs to undo this swap later.
  assert.deepEqual(r.swapBack, { say: backOf(F.PATH.id), key: '1-afternoon', newId: F.PATH.id, oldId: F.SPRAY.id, oldName: 'Fixture Spray Park AGC', newName: 'Fixture Creekside Bike Path AGC' });
  // A listing whose own words cover the age ("all ages"): nothing extra on the card.
  const all = await turn('yes', { offer: [offerTo(F.ALLAGES.id, 'Fixture Riverside Bike Loop AGC')] });
  assert.ok(all.plan, all.reply); assert.equal(all.ageAsk, undefined);
  // A swap with no age asked: no check.
  const plain = await turn('yes', { offer: [`Fixture Creekside Bike Path AGC [swap ${F.SPRAY.id}>${F.PATH.id} cycling]`] });
  assert.ok(plain.plan); assert.equal(plain.ageAsk, undefined); assert.ok(plain.swapBack);
  // An ordinary swap (in town) asked for an age: the same check, from the planner's own swap.
  const inTown = await turn('replace the spray park with cycling for a 15-year-old', { stops: [{ key: '1-morning', id: F.SPRAY.id, start: 600 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-evening', id: F.DINNER.id, start: 1080 }] });
  assert.ok(inTown.plan, inTown.reply);
  const fresh = at(inTown.plan)['1-morning'][0];
  assert.equal(db.prepare('SELECT region FROM venues WHERE id = ?').get(fresh).region, REGION, 'a stop in town is used before anything elsewhere is asked');
  const says = app.tripChatAgeNote(fresh, 15, 'en');
  if (says) assert.equal(inTown.ageAsk, undefined); else assert.deepEqual(inTown.ageAsk, [app.tripAgeCheck(fresh, 15)]);
  assert.equal(inTown.swapBack.newId, fresh); assert.equal(inTown.swapBack.oldId, F.SPRAY.id);
  // A turn that is not a swap carries neither.
  const q = await turn('Does this stay within our total $300 budget?');
  assert.equal(q.ageAsk, undefined); assert.equal(q.swapBack, undefined);
});

test('3. the share link carries the check by id and age; the copy words it again under that stop; an old link opens as before', () => {
  const base = { stops: `venue:${F.TRAIL.id},venue:${F.LUNCH.id},venue:${F.PATH.id},venue:${F.DINNER.id}`, days: '1,1,1,1', stay: String(F.HOTEL.id), nights: '1', ad: '1', kids: '1', ka: '15', asks: 'no_alcohol', bg: '300t', be: '240.390.2.0.1.4.0.0' };
  const c = app.tripShareContext({ ...base, ac: `${F.PATH.id}:15` }, 'en');
  assert.deepEqual(c.stopNotes, { [`venue:${F.PATH.id}`]: { text: 'Ages not listed: check it suits a 15-year-old.' } });
  assert.deepEqual(app.tripShareContext({ ...base, ac: `${F.PATH.id}:15` }, 'fr').stopNotes, { [`venue:${F.PATH.id}`]: { text: 'Âges non indiqués : vérifiez que cela convient à 15 ans.' } });
  // The budget lines and the no-alcohol line are still there.
  assert.equal(c.budgetLines.length, 2); assert.ok(c.lines.some((l) => l.ask === 'no_alcohol'));
  // The party line is as it was.
  assert.match(app.tripShareContextHtml(c, 'en'), /data-mt-facts>1 adult, 1 kid · /);
  // A listing that covers the age, a stop that is not in the link, and bad values: no note.
  for (const ac of [`${F.ALLAGES.id}:15`, `${F.TRAIL.id}:15`, '999999:15', `${F.PATH.id}:0`, `${F.PATH.id}`, 'x:15', `${F.PATH.id}:150`]) assert.equal(app.tripShareContext({ ...base, ac }, 'en').stopNotes, undefined, ac);
  // An old link (no ac): no notes; the EN / FR switch keeps the value.
  assert.equal(app.tripShareContext(base, 'en').stopNotes, undefined);
  assert.match(H.shareContextQuery(H.parseShareContext({ ...base, ac: `${F.PATH.id}:15` })), new RegExp(`(?:^|&)ac=${F.PATH.id}:15(?:&|$)`));
  assert.doesNotMatch(JSON.stringify(c.stopNotes), NEVER);
});

test('4. a swap is undone later on the plan as it is then: the stop goes back, and the stay, its dates and rooms stay as they are now', async () => {
  const stops = swapped(F.PATH.id), offer = [backOf(F.PATH.id)], exclude = [F.SPRAY.id];
  // After the dates were confirmed.
  const dated = await turn(backOf(F.PATH.id), { stops, offer, exclude, stay: { arrive: '2027-07-10', leave: '2027-07-11' } });
  assert.ok(dated.plan && dated.req, dated.reply);
  assert.equal(dated.back, true); assert.equal(dated.swapBack, undefined); assert.equal(dated.ageAsk, undefined);
  assert.deepEqual(at(dated.plan), { '1-morning': [F.TRAIL.id, 540], '1-midday': [F.LUNCH.id, 720], '1-afternoon': [F.SPRAY.id, 840], '1-evening': [F.DINNER.id, 1080] });
  assert.equal(dated.reply, 'Undone: Fixture Spray Park AGC is back at 2 PM, in place of Fixture Creekside Bike Path AGC. Nothing else changed. Your stay dates stay confirmed.');
  assert.equal(dated.plan.whereToStay.pick.id, F.HOTEL.id);
  assert.deepEqual([dated.plan.whereToStay.trip.arrive, dated.plan.whereToStay.trip.leave, dated.plan.whereToStay.trip.stayStatus], ['2027-07-10', '2027-07-11', 'confirmed']);
  assert.ok(!dated.req.excludeVenueIds.includes(F.SPRAY.id), 'the stop put back is no longer kept out');
  assert.equal(dated.req.text, REQ); assert.equal(dated.stayBlock, undefined);
  assert.equal(dated.plan.whereToStay.pick.budget.limit, 300);
  // Dates not confirmed: the reply does not say they are.
  const plain = await turn(backOf(F.PATH.id), { stops, offer, exclude });
  assert.equal(plain.reply, 'Undone: Fixture Spray Park AGC is back at 2 PM, in place of Fixture Creekside Bike Path AGC. Nothing else changed.');
  assert.equal(plain.plan.whereToStay.trip.stayStatus, 'proposed');
  // After another stay was chosen: it stays the stay.
  const stay2 = await turn(backOf(F.PATH.id), { stops, offer, exclude, stayId: F.CHEAP.id });
  assert.ok(stay2.plan && at(stay2.plan)['1-afternoon'][0] === F.SPRAY.id); assert.equal(stay2.plan.whereToStay.pick.id, F.CHEAP.id);
  // After the rooms and the party were changed: they stay.
  const rooms = await turn(backOf(F.PATH.id), { stops, offer, exclude, stay: { adults: 2, rooms: 2 } });
  assert.ok(rooms.plan); assert.deepEqual([rooms.plan.whereToStay.trip.adults, rooms.plan.whereToStay.trip.rooms], [2, 2]);
  // French.
  const fr = await turn(backOf(F.PATH.id), { stops, offer, exclude, lang: 'fr', stay: { arrive: '2027-07-10', leave: '2027-07-11' } });
  assert.equal(fr.reply, 'Annulé : Fixture Spray Park AGC est de retour à 14 h et remplace Fixture Creekside Bike Path AGC. Rien d’autre n’a changé. Vos dates de séjour restent confirmées.');
  // The stop to undo is no longer there: said, nothing changes. The tag typed with no offer behind it is not an undo.
  const gone = await turn(backOf(F.PATH.id), { stops: stopsOn(), offer });
  assert.equal(gone.plan, null); assert.match(gone.reply, /^That stop isn’t on your plan any more/);
  const typed = await turn(backOf(F.PATH.id), { stops, exclude });
  assert.ok(!typed.back);
});

test('5. the page: the check on the card and in the lists, the Undo that says what it undoes, the swap\'s own Undo, and the date fields in the snapshot', () => {
  // The card's short note, the opened card's sentence, the Book my trip list (open) and the copied text (data-tw-need).
  assert.ok(V4.includes("var ag = typeof v4AgeAsk === 'function' ? v4AgeAsk(id) : null; if (ag && ag.short) { var as = (fr && ag.shortFr) || ag.short; out.notes.push(as); out.compact.push(as); out.open.push(as); out.more.push((fr && ag.noteFr) || ag.note || as);"));
  assert.ok(V4.includes("if (ac.length) out += '&ac=' + ac.join(',');"));
  assert.ok(PAGE.includes('function v4AgeAsk(id){ return (chat.ageAsk && chat.ageAsk[id]) || null; }'));
  // Undo beside the reply says what it undoes when it is not a change of stops.
  for (const s of ["undoDates: 'Undo dates'", "undoStay: 'Undo stay change'", "undoSwap: 'Undo swap: {name} back'", "undoneDates: 'Undone: your stay dates are as they were before. Your stops are unchanged.'", "undoDates: 'Annuler les dates'", "undoSwap: 'Annuler l’échange : remettre {name}'", "noUndo: 'There’s nothing to undo right now.'"]) assert.ok(PAGE.includes(s), s);
  assert.ok(PAGE.includes("chat.undoKind = !chat.undo ? '' : j.stayDates ? 'dates'"));
  assert.ok(PAGE.includes('data-v4-swap-back'));
  // An earlier swap keeps its own button only while its new stop is in its slot and the old one is not on the plan.
  assert.ok(PAGE.includes('if (at && at.venue && at.venue.id === sb.newId && !state.removed[sb.key] && !oldOn) return sb;'));
  // The undo of a swap after another action goes back through the chat (the plan as it is now), never a snapshot.
  assert.ok(PAGE.includes("chat.offer = [sb.say];") && PAGE.includes("chatSend(sb.say, null, typed || ct('undoSwap').replace('{name}', sb.oldName), false, true);"));
  // An undone "undo" turn shows no Undo of its own.
  assert.ok(PAGE.includes('if (j.back) chat.undo = null;'));
  // The stay's date fields are part of the snapshot (an Undo of the dates used to leave them set).
  assert.ok(PAGE.includes("arrive: (document.getElementById('t3Arrive') || {}).value || '', leave: (document.getElementById('t3Leave') || {}).value || ''"));
  assert.ok(PAGE.includes("if (arEl && lvEl && o.arrive !== undefined) { arEl.value = o.arrive || ''; lvEl.value = o.leave || ''; }"));
  assert.ok(PAGE.includes('ageAsk: chat.ageAsk, swapBacks: chat.swapBacks'));
});
