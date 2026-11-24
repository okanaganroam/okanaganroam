'use strict';
// Build My Trip chat and no-car notes (2026-11-24, Dayton's live test at 390px). The request:
//   "Plan a 3-day trip in Lake Country for 2 adults and 2 children ages 4 and 7, July 16–18 2027. We would like
//    kid-friendly beaches, a farm visit, and a hotel with a pool for two nights. We have no car, so please choose
//    activities we can reach without driving ourselves."
// then, in the chat:
//   "Please make day 1 slower for the kids, with only the beach, lunch and splash park. Keep the hotel and the other
//    days the same."
// took one activity off day 1, left the dinner as a fourth stop and said "Done."; the dinner's card still gave a
// distance from the stop that was removed; and the planner said "9 rides to check" where a fresh shared copy of the
// same stops said "8 of 11 trips".
// Here: the list is what day 1 keeps (trip-keep-only.js); the reply names what stayed and what came off; every no-car
// note and the one count come from the stops as they are now, by the same code on the planner page and the shared copy
// (trip-transport-need.js). Fixture listings only; no network; the word rules only (the AI reader is shown never to be
// asked). The same file runs on whistlerroam.com.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const KO = require('../trip-keep-only.js');
const T = require('../trip-transport-need.js');
const HP = require('../trip-honest-plan.js');
const LAYOUT = require('../trip-workspace-layout.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'pemberton' : 'lake-country', TOWN = WR ? 'Pemberton' : 'Lake Country';
const AT = WR ? [50.3192, -122.8035] : [50.0537, -119.4106];
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');
// The planner page's own copy of the hop code, run as the browser runs it.
const CLIENT = new Function(`${T.CLIENT_SRC}; return tripNoCarApi;`)();

const REQ = `Plan a 3-day trip in ${TOWN} for 2 adults and 2 children ages 4 and 7, July 16–18 2027. We would like kid-friendly beaches, a farm visit, and a hotel with a pool for two nights. We have no car, so please choose activities we can reach without driving ourselves.`;
const MSG = 'Please make day 1 slower for the kids, with only the beach, lunch and splash park. Keep the hotel and the other days the same.';
const DATES = ['2027-07-16', '2027-07-17', '2027-07-18'];

const made = [];
const F = {};
const DAYS7 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOURS = JSON.stringify(Object.fromEntries(DAYS7.map((d) => [d, [['07:00', '22:00']]])));
// km north of the hotel (1 km of latitude is about 0.009 degrees).
const mk = (key, km, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${800 + n} Keep Test Road, ${TOWN}, BC`, latitude: AT[0] + km * 0.009, longitude: AT[1], hours: HOURS, kid_friendly: 1, description: 'A place used only by the keep-only tests. Open all year.', slug: `keep-test-${key.toLowerCase()}`, website: `https://keep-${key.toLowerCase()}.example.com/`, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  mk('HOTEL', 0, { type: 'stay', cuisine: 'hotel', name: 'Fixture Poolside Hotel KO', hours: null });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.HOTEL.id, JSON.stringify({ max_guests: 4, confidence: 'high', pool: true, booking: { own: 'https://keep-hotel.example.com/book' } }), '2026-11-24T00:00:00Z', 'test-keep');
  // Day 1: beach, lunch, splash park, preserve, dinner. The dinner is beside the splash park and 2 km from the preserve.
  mk('BEACH', 3, { type: 'beach', name: 'Fixture Sandy Cove Beach KO' });
  mk('LUNCH', 5, { type: 'restaurant', price: 2, name: 'Fixture Noodle Kitchen KO' });
  mk('SPLASH', 7, { type: 'outdoor', name: 'Fixture Orchard Park & Splash Park KO' });
  mk('PRES', 9, { type: 'outdoor', name: 'Fixture Creek Wildlife Preserve KO' });
  mk('DINNER', 7.1, { type: 'restaurant', price: 2, name: 'Fixture Bella Bistro KO' });
  // Day 2: two beaches, lunch beside the first, dinner. Day 3: a café by the hotel, lunch.
  mk('BEACH2', 3.2, { type: 'beach', name: 'Fixture Pebble Point Beach KO' });
  mk('LUNCH2', 3.3, { type: 'restaurant', price: 2, name: 'Fixture Thai Table KO' });
  mk('BEACH3', 6, { type: 'beach', name: 'Fixture Willow Bay Beach KO' });
  mk('DINNER2', 8, { type: 'restaurant', price: 2, name: 'Fixture Sushi Corner KO' });
  mk('CAFE', 0.3, { type: 'cafe', price: 1, name: 'Fixture Nickel Cafe KO' });
  mk('LUNCH3', 3, { type: 'restaurant', price: 1, name: 'Fixture Slice Shop KO' });
});
test.after(() => {
  app.setTripChatReader(null);
  if (F.HOTEL) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F.HOTEL.id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

// The plan on the traveller's screen.
const SCREEN = () => [
  { key: '1-morning', id: F.BEACH.id, start: 540 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-afternoon', id: F.SPLASH.id, start: 825 }, { key: '1-late', id: F.PRES.id, start: 945 }, { key: '1-evening', id: F.DINNER.id, start: 1080 },
  { key: '2-morning', id: F.BEACH2.id, start: 540 }, { key: '2-midday', id: F.LUNCH2.id, start: 720 }, { key: '2-afternoon', id: F.BEACH3.id, start: 825 }, { key: '2-evening', id: F.DINNER2.id, start: 1080 },
  { key: '3-morning', id: F.CAFE.id, start: 615 }, { key: '3-midday', id: F.LUNCH3.id, start: 765 },
];
const byId = (id) => Object.values(F).find((v) => v.id === id);
const on = (removed = []) => SCREEN().filter((s) => !removed.includes(s.key));
const say = async (message, o = {}) => {
  const removed = o.removed || [];
  const body = { message, lang: o.lang || 'en', plan: { text: REQ, seed: 0, excludeVenueIds: removed.map((k) => SCREEN().find((s) => s.key === k).id) }, locks: {}, removed, stops: on(removed), dayDates: DATES, tripSource: 'request', stayId: F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) };
  const v = app.parseTripChatBody(body, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
// The hops as the planner page works them out (the browser's copy of the code, the stops on screen, the stay card).
const listOf = (removed) => on(removed).map((s) => { const v = byId(s.id); return { id: v.id, name: v.name, day: Number(s.key[0]), latitude: v.latitude, longitude: v.longitude }; });
const pageEntry = (removed = []) => CLIENT.entry(listOf(removed), { id: F.HOTEL.id, name: F.HOTEL.name, lat: F.HOTEL.latitude, lng: F.HOTEL.longitude });
// A fresh shared copy of the same stops (the link the page makes: its stops, days, times, stay, party and asks).
const shared = (removed = [], lang = 'en') => {
  const list = on(removed);
  const q = { stops: list.map((s) => `venue:${s.id}`).join(','), days: list.map((s) => s.key[0]).join(','), t: list.map((s) => s.start).join(','), td: '2027-07-16_2027-07-18', ts: 'r', stay: String(F.HOTEL.id), nights: '2', ad: '2', kids: '2', ka: '4,7', rm: '1', ra: '1', asks: 'type:beach,kid_friendly,no_car,stay:pool', ni: 'farm:n', nt: REGION };
  const c = app.tripShareContext(q, lang, new Date('2026-11-24T18:00:00Z'));
  return { q, c, line: (c.lines.find((l) => l.ask === 'no_car') || {}).text, html: app.tripShareContextHtml(c, lang) };
};
const chip = (e, removedIds = {}) => LAYOUT.tripSummaryFacts({ evidence: [e], needs: [{ key: 'no_car' }] }, false, { removed: removedIds }).map((f) => f.text).find((t) => /^No car/.test(t));
const stopsFor = (removed = []) => on(removed).map((s) => { const v = byId(s.id); const role = v.type === 'restaurant' ? (/midday/.test(s.key) ? 'lunch' : 'dinner') : ''; return { key: s.key, id: v.id, name: v.name, type: v.type, day: Number(s.key[0]), start: s.start, role, badges: [] }; });
const names = (list) => list.map((s) => s.name);
const NOTHING_ELSE = (r) => {
  assert.equal(r.plan, null, 'the trip is not planned again');
  assert.equal(r.req, null);
  for (const k of ['stayBlock', 'stayPref', 'stayForce', 'stayDates', 'party', 'text', 'needPatch', 'needDrop', 'card', 'confirm']) assert.equal(r[k], undefined, `${k} must not change`);
};
const HONEST = (reply) => {
  assert.doesNotMatch(reply, /^Done\.?$|\bavailable\b|\bconfirmed\b|\bbooked\b|\bminutes?\b|\bdrive\b|suitable|\bages?\b/i, reply);
  assert.ok((reply.match(/\?/g) || []).length <= 1, `one question at most: ${reply}`);
};

test('1. the words: a list after "only / just" is what that day keeps; the pace words beside it are not a second request', () => {
  const stops = stopsFor();
  const rd = (m, o = {}) => tc.rulesRead(m, stops, { days: 3, request: REQ, ...o });
  const r = rd(MSG);
  assert.deepEqual(r.ops.map((o) => o.o), ['remove']);
  assert.equal(r.access, true, 'fixed rules: the AI reader’s reading never stands in');
  assert.equal(r.ops[0].day, 1);
  assert.deepEqual(names(r.ops[0].stops), [F.PRES.name, F.DINNER.name]);
  assert.deepEqual(names(r.ops[0].keepOnly.kept), [F.BEACH.name, F.LUNCH.name, F.SPLASH.name]);
  assert.deepEqual(names(r.ops[0].keepOnly.meals), [F.DINNER.name]);
  assert.ok(!r.ops.some((o) => ['pace', 'refine', 'keep', 'party', 'stay', 'days', 'date', 'town'].includes(o.o)));
  assert.deepEqual(tc.reconcileReads({ ok: true, ops: [{ o: 'pace', value: 'relaxed', day: 1, stops: [] }], cant: null }, r, MSG).ops.map((o) => o.o), ['remove']);
  // The same ask in other words, English and French; a stop by its own name; a weekday.
  for (const m of ['only the beach, lunch and splash park on day 1', 'Day 1: just the beach, lunch and the splash park please', 'on the first day keep only the beach, the lunch and the splash park', 'For day 1 we want nothing but the beach, lunch and the splash park',
    'Garde seulement la plage, le dîner et les jeux d’eau le jour 1', 'Le premier jour, juste la plage, le dîner et les jeux d’eau'])
    assert.deepEqual(names(rd(m).ops[0].keepOnly.kept), [F.BEACH.name, F.LUNCH.name, F.SPLASH.name], m);
  assert.deepEqual(names(rd('keep only Fixture Creek Wildlife Preserve KO and dinner on day 1').ops[0].keepOnly.kept), [F.PRES.name, F.DINNER.name]);
  assert.deepEqual(names(rd('only the beach and lunch on Friday', { weekdays: tc.weekdayDays(DATES, 3) }).ops[0].keepOnly.kept), [F.BEACH.name, F.LUNCH.name]);
  // The general case on another day. Two beaches on day 2: "the beach" keeps both, and both are named.
  const d2 = rd('only the beach and dinner on day 2');
  assert.deepEqual([d2.ops[0].day, names(d2.ops[0].keepOnly.kept), names(d2.ops[0].stops)], [2, [F.BEACH2.name, F.BEACH3.name, F.DINNER2.name], [F.LUNCH2.name]]);
  assert.deepEqual(names(d2.ops[0].keepOnly.meals), [F.LUNCH2.name]);
  // Another sentence of the message is still read and done with it.
  const two = rd('Only the beach and lunch on day 1. Remove the café on day 3.');
  assert.deepEqual(two.ops.map((o) => [o.o, names(o.stops)]), [['remove', [F.SPLASH.name, F.PRES.name, F.DINNER.name]], ['remove', [F.CAFE.name]]]);
  // "Keep the hotel and the other days the same" restates what the change already does.
  for (const m of ['Keep the hotel and the other days the same.', 'Leave everything else as it is', 'Ne change pas l’hôtel ni les autres jours']) assert.ok(KO.SAME_RE.test(tc.fold(m).replace(/[.!?;]+$/, '')), m);
  assert.ok(!KO.SAME_RE.test('keep only the beach on day 2'));
  // Not these rules' to read: a number of things, an edit, a need, a wish for a kind of day, one person's need.
  for (const m of ['Only one person does not drink; the rest want wineries', 'just add a winery on day 2', 'I just want a beach day', 'can you just remove the beach on day 1', 'only vegan restaurants on day 2', 'just one stop on day 2', 'only 2 nights', 'make it just one day',
    'only include her for activities from July 17', 'not only the beach on day 1', 'just beaches please'])
    assert.ok(!rd(m).keepOnly && !(rd(m).ops || []).some((o) => o.keepOnly), m);
  // "Slower" on its own is the lighter day (or the trip's pace) it always was.
  assert.deepEqual(rd('Please make day 1 slower for the kids.').ops.map((o) => [o.o, o.value, o.day]), [['pace', 'relaxed', 1]]);
  assert.deepEqual(rd('a slower pace please').ops.map((o) => [o.o, o.value, o.day]), [['pace', 'relaxed', null]]);
});

test('2. the exact message: day 1 keeps exactly the beach, lunch and splash park; days 2–3, the hotel, the dates and the party are as they were', async () => {
  let asked = 0;
  app.setTripChatReader(async () => { asked += 1; return { ok: true, ops: [{ o: 'pace', value: 'relaxed', day: 1, stops: [], kind: null, time: null, n: null, ages: [], region: null, date: null }], cant: null }; });
  const r = await say(MSG);
  app.setTripChatReader(null);
  assert.equal(asked, 0, 'the AI reader is not asked');
  assert.deepEqual(r.actions, { remove: ['1-late', '1-evening'], keep: [] });
  assert.deepEqual(on(r.actions.remove).filter((s) => s.key[0] === '1').map((s) => s.id), [F.BEACH.id, F.LUNCH.id, F.SPLASH.id]);
  assert.deepEqual(on(r.actions.remove).filter((s) => s.key[0] !== '1'), SCREEN().filter((s) => s.key[0] !== '1'), 'days 2 and 3 are untouched');
  NOTHING_ELSE(r);
  assert.equal(r.reply, `Day 1 now has only ${F.BEACH.name}, ${F.LUNCH.name} and ${F.SPLASH.name}. Took out ${F.PRES.name} and ${F.DINNER.name}. That leaves day 1 with no dinner. Want it back?`);
  HONEST(r.reply);
  assert.deepEqual(r.choices, [{ kind: 'say', label: 'Put dinner back', say: `Put dinner back on day 1 [putback 1-evening:${F.DINNER.id}]` }]);
  assert.deepEqual(r.offer, [r.choices[0].say]);
  const fr = await say('Garde seulement la plage, le dîner et les jeux d’eau le jour 1', { lang: 'fr' });
  assert.equal(fr.reply, `Le jour 1 n’a plus que ${F.BEACH.name}, ${F.LUNCH.name} et ${F.SPLASH.name}. J’ai retiré ${F.PRES.name} et ${F.DINNER.name}. Le jour 1 n’a donc plus de souper. Voulez-vous le remettre?`);
  // The meal offered back: a yes (or the button) returns it to its own slot, and nothing else changes.
  for (const m of ['yes', 'yes please', 'put dinner back', r.choices[0].say]) {
    const b = await say(m, { removed: ['1-late', '1-evening'], offer: r.offer });
    assert.deepEqual(b.actions, { remove: [], keep: [], restore: ['1-evening'] }, m);
    assert.equal(b.reply, `${F.DINNER.name} is back on day 1.`);
    NOTHING_ELSE(b);
  }
  assert.equal((await say('no thanks', { removed: ['1-late', '1-evening'], offer: r.offer })).actions.restore, undefined);
  // …and the page un-removes it the way its own Undo does.
  assert.match(CHAT_PAGE, /\(acts\.restore \|\| \[\]\)\.forEach\(function\(k\)\{ if \(!\/\^\[1-7\]-\[a-z\]\+\$\/\.test\(k\) \|\| !state\.removed\[k\]\) return; var rid = state\.removed\[k\]; delete state\.removed\[k\];/);
  // A list that keeps the dinner takes no meal off, and asks nothing.
  const keepD = await say('only the beach, lunch, splash park and dinner on day 1');
  assert.deepEqual(keepD.actions.remove, ['1-late']);
  assert.equal(keepD.reply, `Day 1 now has only ${F.BEACH.name}, ${F.LUNCH.name}, ${F.SPLASH.name} and ${F.DINNER.name}. Took out ${F.PRES.name}.`);
  assert.equal(keepD.offer, undefined);
});

test('3. a thing listed that is not on that day changes nothing and asks once; no day on a trip of several days asks which', async () => {
  // Day 2 has no splash park.
  const r = await say('only the beach, lunch and splash park on day 2');
  assert.deepEqual(r.actions, { remove: [], keep: [] });
  assert.equal(r.reply, `I don’t see a splash park on day 2, so I haven’t changed it. Keep only ${F.BEACH2.name}, ${F.LUNCH2.name} and ${F.BEACH3.name}?`);
  HONEST(r.reply); NOTHING_ELSE(r);
  assert.deepEqual(r.offer, ['only the beach and lunch on day 2']);
  assert.deepEqual(r.choices, [{ kind: 'say', label: 'Yes, keep those', say: 'only the beach and lunch on day 2' }]);
  // "Yes": exactly what was offered.
  const y = await say('yes', { offer: r.offer });
  assert.deepEqual(y.actions.remove, ['2-evening']);
  assert.equal(y.reply, `Day 2 now has only ${F.BEACH2.name}, ${F.LUNCH2.name} and ${F.BEACH3.name}. Took out ${F.DINNER2.name}. That leaves day 2 with no dinner. Want it back?`);
  // Words that are no kind of place we know, beside one that is: said as typed.
  const farm = await say('only the beach and the farm on day 1');
  assert.deepEqual(farm.actions.remove, []);
  assert.equal(farm.reply, `I don’t see “farm” on day 1, so I haven’t changed it. Keep only ${F.BEACH.name}?`);
  // Nothing listed is on that day: no question to answer with a yes.
  const none = await say('only the winery on day 3');
  assert.deepEqual(none.actions.remove, []);
  assert.equal(none.reply, 'I don’t see a winery on day 3, so I haven’t changed it. Tell me which stops day 3 should keep.');
  assert.equal(none.offer, undefined);
  // No day said.
  const which = await say('just the beach and lunch');
  assert.deepEqual(which.actions.remove, []);
  assert.equal(which.reply, 'Which day should have only the beach and lunch?');
  assert.deepEqual(which.offer, ['only the beach and lunch on day 1', 'only the beach and lunch on day 2', 'only the beach and lunch on day 3']); // day 3 has a lunch: "day 3" typed is an answer too
  assert.deepEqual(which.choices.map((c) => c.label), ['Day 1', 'Day 2']);
  const d1 = await say('day 1', { offer: which.offer });
  assert.deepEqual(d1.actions.remove, ['1-afternoon', '1-late', '1-evening']);
  // A day that already has only those: said, nothing changed.
  const same = await say('only the café and lunch on day 3');
  assert.deepEqual(same.actions.remove, []);
  assert.equal(same.reply, `Day 3 already has only ${F.CAFE.name} and ${F.LUNCH3.name}. Nothing changed.`);
});

test('4. "slower" alone still takes one activity off that day and never a meal', async () => {
  const r = await say('Please make day 1 slower for the kids.');
  assert.equal(r.actions.remove.length, 1);
  assert.ok(!['1-midday', '1-evening'].includes(r.actions.remove[0]) && r.actions.remove[0][0] === '1');
  assert.match(r.reply, /^Done\. Took out /);
  assert.equal(r.choices, undefined);
});

test('5. the no-car notes come from the stops as they are now: never a removed stop, always the stop (or the stay) before it', () => {
  const check = (removed) => {
    const list = listOf(removed), e = pageEntry(removed), gone = removed.map((k) => byId(SCREEN().find((s) => s.key === k).id).name);
    for (const row of e.stops) {
      const i = list.findIndex((s) => s.id === row.id), prev = i > 0 && list[i - 1].day === list[i].day ? list[i - 1] : null;
      assert.equal(row.from, prev ? prev.name : null, `${row.name}: measured from the stop before it`);
      assert.equal(!!row.fromStay, !prev);
      for (const g of gone) assert.ok(!String(row.note || '').includes(g) && row.from !== g, `${row.name} names ${g}`);
      if (row.check && row.km != null) assert.match(row.note, new RegExp(`^No car: about [\\d.]+ km in a straight line from ${prev ? prev.name.replace(/[&()]/g, '\\$&') : 'your stay'} · check a ride$`));
      if (!row.check) assert.equal(row.note, undefined, 'a short walk says nothing on the card');
    }
    return e;
  };
  const before = check([]);
  const row = (e, v) => e.stops.find((x) => x.id === v.id);
  assert.equal(row(before, F.DINNER).from, F.PRES.name);
  assert.equal(row(before, F.DINNER).note, `No car: about 1.9 km in a straight line from ${F.PRES.name} · check a ride`);
  assert.equal(row(before, F.DINNER).noteShort, 'About 1.9 km (straight line) · check a ride');
  // The preserve removed (its ✕, or the chat): the dinner is now measured from the splash park beside it.
  const mid = check(['1-late']);
  assert.equal(row(mid, F.DINNER).from, F.SPLASH.name);
  assert.equal(row(mid, F.DINNER).check, false);
  assert.equal(row(mid, F.PRES), undefined);
  // The first stop of a day removed: the next one is measured from the stay.
  const first = check(['1-morning']);
  assert.equal(row(first, F.LUNCH).fromStay, true);
  assert.match(row(first, F.LUNCH).note, /^No car: about 5 km in a straight line from your stay · check a ride$/);
  // After the chat message, and after its Undo (the page restores the stops it had): exactly as before.
  const after = check(['1-late', '1-evening']);
  assert.deepEqual(after.stops.filter((x) => x.day === 1).map((x) => x.id), [F.BEACH.id, F.LUNCH.id, F.SPLASH.id]);
  assert.deepEqual(check([]), before);
  // The browser's copy and the server's are one piece of code, and give the same entry.
  const coordsOf = (id) => { const v = byId(id); return v ? { lat: v.latitude, lng: v.longitude } : null; };
  for (const rm of [[], ['1-late'], ['1-late', '1-evening']]) assert.deepEqual(pageEntry(rm), T.entry(listOf(rm).map((s) => ({ id: s.id, name: s.name, day: s.day })), { id: F.HOTEL.id, name: F.HOTEL.name }, coordsOf));
  // The page works the entry out again before anything reads it, from the stops that are not removed and the stay it shows.
  assert.match(PAGE, /try \{ v4NoCarSync\(\); \} catch \(e\) \{[^}]*\}\n    var p = t3LocalTimes/);
  assert.match(PAGE, /function v4NoCarStops\(\)\{[\s\S]{0,300}!state\.removed\[d\.day \+ '-' \+ s\.daypart\]/);
  assert.match(PAGE, /tripNoCarApi\.entry\(v4NoCarStops\(\), c && c\.id > 0 \? \{ id: c\.id, name: c\.name, lat: c\.lat, lng: c\.lng \} : null\)/);
  // A "Drive from A to B" line is said only while the stop now before it is still in A.
  assert.match(PAGE, /var legFits = !prev \|\| !prev\.venue \|\| !s\.driveFrom \|\| !s\.driveFrom\.from \|\| prev\.venue\.region === s\.driveFrom\.from;/);
});

test('6. one count, one definition: the planner and a fresh shared copy say the same numbers before, after and after Undo', () => {
  const states = [['before', [], 9, 11], ['after the chat message', ['1-late', '1-evening'], 7, 9], ['dinner put back', ['1-late'], 7, 10], ['after Undo', [], 9, 11]];
  for (const [label, removed, rides, total] of states) {
    const e = pageEntry(removed), s = shared(removed);
    assert.deepEqual([e.rides, e.hops], [rides, total], label);
    const text = `No car: ${rides} of ${total} trips between stops are longer than a short walk (over 1 km in a straight line). Check a taxi, shuttle or bus for each; none is checked here. Counted from your stay to each day’s first stop, then from stop to stop.`;
    assert.equal(e.text, text, label);
    assert.equal(s.line, text, `${label}: the shared copy`);
    assert.ok(s.html.includes(text.replace(/’/g, '&#39;')) || s.html.includes(text), `${label}: printed on the shared page`);
    assert.equal(chip(e), `No car: ${rides} of ${total} trips over 1 km`, `${label}: the summary`);
    assert.equal(e.short, `No car: ${rides} of ${total} trips between stops are over 1 km in a straight line. Check a taxi, shuttle or bus for each; none is checked here`, `${label}: Book my trip and the copied text`);
    // Each stop's note on the shared copy is the page's note for that stop.
    const notes = s.c.stopNotes || {};
    for (const row of e.stops) assert.equal((notes[`venue:${row.id}`] || {}).text, row.check ? row.note : undefined, `${label}: ${row.name}`);
    // The party, the dates and the stay travel unchanged.
    assert.deepEqual([s.c.adults, s.c.kids, s.c.kidAges, s.c.tripDates && s.c.tripDates.start, s.c.tripDates && s.c.tripDates.end, s.c.stay && s.c.stay.name], [2, 2, [4, 7], '2027-07-16', '2027-07-18', F.HOTEL.name], label);
  }
  // French, and the other shapes of the count.
  assert.equal(pageEntry(['1-late', '1-evening']).textFr, 'Sans voiture : 7 trajets sur 9 entre les arrêts dépassent une courte marche (plus de 1 km à vol d’oiseau). Vérifiez un taxi, une navette ou un autobus pour chacun; aucun n’est vérifié ici. Compté de votre hébergement au premier arrêt de chaque jour, puis d’un arrêt au suivant.');
  assert.equal(pageEntry(['1-late', '1-evening']).chipFr, '7 trajets sur 9 de plus de 1 km');
  const noStay = CLIENT.entry(listOf([]), null);
  assert.deepEqual([noStay.rides, noStay.hops], [7, 8]);
  assert.match(noStay.text, /Counted from stop to stop within each day\.$/);
  const walk = CLIENT.entry(listOf([]).filter((s) => [F.SPLASH.id, F.DINNER.id].includes(s.id)), null);
  assert.equal(walk.text, 'No car: the 1 trip between stops is a short walk (1 km or less in a straight line). Walking routes aren’t checked. Counted from stop to stop within each day.');
  assert.equal(chip(walk), 'No car: short walks (approx.)');
  // The words never promise a ride, a route or a time.
  for (const st of states) { const e = pageEntry(st[1]); for (const t of [e.text, e.textFr, e.short, e.shortFr, ...e.stops.map((x) => x.note || '')]) assert.doesNotMatch(t, /\bminutes?\b|\bmin\b|available|disponible|\bwalkable\b|\bis a ride\b/i, t); }
  // An entry older than the screen (a stop of its rows was taken out, and it was not worked out again) gives no number.
  assert.equal(chip(pageEntry([]), { [F.PRES.id]: 1 }), 'No car: rides not checked');
  // The summary reads the entry's own count (never its own tally of rows), and the copied text carries the same line.
  assert.match(LAYOUT.WORKSPACE_CLIENT_SRC, /chip = \(fr && e\.chipFr\) \|\| e\.chip;/);
  assert.match(PAGE, /lines\.push\(\(\(fr && ncT\.shortFr\) \|\| ncT\.short\) \+ '\.'\);/);
  // The stay card carries its stored map location for the page's own count.
  const plan = app.runTripPlanRequest({ ...app.parseTripPlanBody({ text: REQ }, { v4: true, stays: true }).value, v4: true }, true);
  const pick = plan.whereToStay && plan.whereToStay.pick;
  if (pick && pick.id > 0) assert.ok(Number.isFinite(pick.lat) && Number.isFinite(pick.lng), 'the stay card has a map location');
  const nc = (plan.evidence || []).find((x) => x.ask === 'no_car');
  if (nc) { assert.match(nc.text, /^No car: /); assert.equal(nc.walkKm, 1); assert.equal(typeof nc.chip, 'string'); }
  assert.ok(HP.shareAsks(plan).includes('no_car'));
  // The farm the plan could not include stays said on the copy in every state (the chat never touches that line).
  for (const st of states) assert.match(shared(st[1]).html, /no farm listed in /, st[0]);
});
