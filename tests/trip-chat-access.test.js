'use strict';
// Travel agent chat: access needs (2026-11-22, Dayton's report on the live site, mobile). The request: "Plan a relaxed
// 2-day trip in Vernon for two adults on January 16–17, 2027. We have a dog, need gluten-free food and want easy walks
// and a dog-friendly hotel. One of us uses a wheelchair." Then, in the chat: "Please make sure every activity and the
// hotel are wheelchair accessible, and the dog can come with us." The chat changed the hotel and said it had accessible
// rooms, and said nothing about the activities or the dog.
//  1. the message is FOUR checks (activities + hotel wheelchair accessible; the dog at the stops + at the hotel), never
//     a stay change alone, in English and French, by the rules and with an AI reader that returns only a stay change
//  2. each part is answered from the listings' own data: what was changed is named, what still needs checking is named,
//     unrelated stops and times are unchanged, the request text gains the need once
//  3. more than two stops would change: asked first; yes swaps, no keeps
//  4. a later "add a café" honours the needs
//  5. the questions change nothing
//  6. with the plan's own evidence (plan.evidence) and without it
//  7. the stay hand-off wording: "the links carry these dates" only when every link does
// The same file runs on okanaganroam.com and whistlerroam.com (its own town and places).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.ANTHROPIC_API_KEY;
const app = require('../server.js');
const tc = require('../trip-chat.js');
const ac = require('../trip-chat-access.js');
const db = require('../db.js');

const WR = /whistler/i.test(tc.agent.AREA.site);
const REGION = WR ? 'whistler' : 'vernon';
const TOWN = WR ? 'Whistler' : 'Vernon';
const AT = WR ? [50.1163, -122.9574] : [50.267, -119.272];
const REQ = `Plan a relaxed 2-day trip in ${TOWN} for two adults on January 16–17, 2027. We have a dog, need gluten-free food and want easy walks and a dog-friendly hotel. One of us uses a wheelchair.`;
const REQ_PLAIN = `A relaxed 2-day trip in ${TOWN} with easy walks and good food`;
const MSG = 'Please make sure every activity and the hotel are wheelchair accessible, and the dog can come with us.';
const MSG_FR = 'Assurez-vous que chaque activité et l’hôtel sont accessibles en fauteuil roulant, et que le chien peut venir avec nous.';
const sentences = (s) => String(s).split(/(?<=[.?!])\s+(?=[A-ZÀ-Ý])/).filter(Boolean);

// ---------- 1. Reading ----------
const S = (o) => ({ badges: [], feats: [], price: 2, role: '', ...o });
const PLAN = [
  S({ key: '1-morning', id: 9001, name: 'Kal Lake Lookout', type: 'outdoor', day: 1, start: 615 }),
  S({ key: '1-midday', id: 9002, name: 'Roster Sports Club', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 9003, name: 'Grey Canal Trail', type: 'outdoor', day: 1, start: 810 }),
  S({ key: '1-evening', id: 9004, name: 'Station BBQ', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
  S({ key: '2-morning', id: 9005, name: 'Davison Orchards', type: 'outdoor', day: 2, start: 615 }),
  S({ key: '2-midday', id: 9006, name: 'Polson Bistro', type: 'restaurant', day: 2, start: 690, role: 'lunch' }),
];
const R = (m, stops = PLAN) => tc.rulesRead(m, stops, { regions: [REGION], regionLabels: { [REGION]: TOWN }, days: 2, request: REQ });
const FOUR = [{ need: 'accessible', scopes: ['activities', 'stay'] }, { need: 'dog', scopes: ['activities', 'meals', 'stay'] }];

test('the owner’s message is read as four checks (activities and hotel accessible; the dog at the stops and the hotel), never a stay change', () => {
  for (const m of [MSG, MSG_FR, 'make sure every activity and the hotel are wheelchair accessible and the dog can come with us', 'Can you make sure every activity and the hotel are wheelchair accessible, and that our dog can come too?']) {
    const r = R(m);
    assert.equal(r.ops.length, 1, m);
    assert.equal(r.ops[0].o, 'ensure', m);
    assert.deepEqual(r.ops[0].parts, FOUR, m);
    assert.ok(!r.ops.some((o) => o.o === 'stay' || o.o === 'party'), `${m}: no stay or party op`);
    assert.ok(tc.rulesConfident(r) && r.access, m);
  }
  // Other needs and scopes.
  assert.deepEqual(R('make sure all the restaurants are gluten-free').ops[0].parts, [{ need: 'gluten_free', scopes: ['meals'] }]);
  assert.deepEqual(R('we need every stop to be dog friendly').ops[0].parts, [{ need: 'dog', scopes: ['activities', 'meals'] }]);
  assert.deepEqual(R('please ensure everything is kid-friendly').ops[0].parts, [{ need: 'kid_friendly', scopes: ['activities', 'meals'] }]);
  assert.deepEqual(R('make sure the hotel is wheelchair accessible').ops[0].parts, [{ need: 'accessible', scopes: ['stay'] }]);
  assert.deepEqual(R('Vérifie que tous les arrêts acceptent les chiens').ops[0].parts, [{ need: 'dog', scopes: ['activities', 'meals'] }]);
  // What is not an "ensure": a stay change, a swap that asks a badge, a question about one stop by its name.
  assert.deepEqual(R('find a hotel with a pool').ops.map((o) => o.o), ['stay', 'stay']);
  assert.ok(!R('swap Grey Canal Trail for another that’s dog friendly').ops.some((o) => o.o === 'ensure'));
  assert.equal(R('is Roster Sports Club dog friendly?').ops[0].value, 'q_dog');
  assert.ok(!R('add a café').access);
});

test('questions about a need are answers (ask ops), in English and French', () => {
  const q = (m) => { const r = R(m); assert.ok(r.explain && r.access, m); assert.equal(r.ops.length, 1, m); assert.equal(r.ops[0].o, 'ask', m); return r.ops[0]; };
  assert.deepEqual([q('is day 2 wheelchair accessible?').value, q('is day 2 wheelchair accessible?').day], ['q_access', 2]);
  const lunch = q('can the dog come to lunch?');
  assert.deepEqual([lunch.value, lunch.needs, lunch.scopes, lunch.meal], ['q_access', ['dog'], ['meals'], 'lunch']);
  assert.equal(q('which stops are accessible?').which, true);
  assert.deepEqual(q('is the hotel pet friendly?').scopes, ['stay']);
  for (const m of ['what do I still need to check?', 'What still needs checking?', 'Que dois-je encore vérifier?', 'anything else I should check?']) assert.equal(q(m).value, 'q_check', m);
  for (const m of ['Why is day 2 so empty?', 'Pourquoi le jour 2 est-il si vide?']) assert.deepEqual([q(m).value, q(m).day], ['q_thin', 2], m);
  assert.equal(q('Est-ce que le jour 2 est accessible en fauteuil roulant?').value, 'q_access');
  assert.equal(q('Le chien peut-il venir au souper?').meal, 'dinner');
});

test('an AI reading that has only the stay change never stands in for the four checks', () => {
  const rules = R(MSG);
  const ai = { ok: true, ops: [{ o: 'stay', value: 'accessible', stops: [], ages: [] }], cant: null };
  const m = tc.reconcileReads(ai, rules, MSG);
  assert.deepEqual(m.ops, rules.ops);
  assert.equal(m.source, 'rules_over_ai');
  assert.deepEqual(m.fixes, ['access']);
});

// ---------- 6. The check and the replies, with the plan's evidence and without ----------
const BADGES = { 9001: ['dog_friendly'], 9002: ['dog_friendly'], 9006: ['dog_friendly'] };
const ACCESS = { 9001: true, 9005: false };
const fromListings = (need, s) => (need === 'accessible' ? (ACCESS[s.id] === undefined ? null : ACCESS[s.id]) : (BADGES[s.id] || []).includes(ac.NEEDS[need].feat) ? true : null);
const names = (a) => a.map((s) => s.name);

test('without plan.evidence: the stops’ own data decides; true is verified, missing is “doesn’t say”, false only when the data says so', () => {
  const [a, d] = ac.check(FOUR.map((p) => ({ need: p.need, scopes: p.scopes.filter((x) => x !== 'stay') })), PLAN, fromListings);
  assert.deepEqual([names(a.ok), names(a.unk), names(a.no)], [['Kal Lake Lookout'], ['Grey Canal Trail'], ['Davison Orchards']], 'activities only for the wheelchair part');
  assert.deepEqual(names(d.ok), ['Kal Lake Lookout', 'Roster Sports Club', 'Polson Bistro']);
  assert.deepEqual(names(d.unk), ['Grey Canal Trail', 'Station BBQ', 'Davison Orchards']);
  const reply = ac.ensureReply({ stay: { name: 'Quality Inn & Suites Vernon', changed: true, has: { accessible: true, pets: 'some' }, asked: ['accessible', 'pets'] }, stayAsked: true, checks: [a, d], lang: 'en' });
  assert.match(reply, /^Hotel: now Quality Inn & Suites Vernon; its listing has accessible rooms and allows pets in some rooms\./);
  assert.match(reply, /Wheelchair access: Kal Lake Lookout lists wheelchair access; Davison Orchards says it isn’t wheelchair accessible; Grey Canal Trail doesn’t say\./);
  assert.match(reply, /Dog: Kal Lake Lookout, Roster Sports Club and Polson Bistro list dogs welcome; Grey Canal Trail, Station BBQ and Davison Orchards don’t say\./);
  assert.match(reply, /Still to check: wheelchair access at Grey Canal Trail and Davison Orchards; dogs at Grey Canal Trail, Station BBQ and Davison Orchards\. Call ahead\.$/);
  assert.ok(sentences(reply).length <= 5 && reply.split('. ').length <= 5, reply);
  // Never "not accessible" for a stop whose data does not say.
  assert.ok(!/Grey Canal Trail says it isn’t/.test(reply));
});

test('with plan.evidence: its has true / null / false is used for the stops it names, and the listings for any other', () => {
  const evidence = [
    { ask: 'accessible', status: 'partial', stops: [{ id: 9001, name: 'Kal Lake Lookout', has: null }, { id: 9003, name: 'Grey Canal Trail', has: true }, { id: 9005, name: 'Davison Orchards', has: null }, { id: 9002, has: null }, { id: 9004, has: null }, { id: 9006, has: null }], text: 'x' },
    { ask: 'dog_friendly', status: 'partial', stops: PLAN.map((s) => ({ id: s.id, name: s.name, has: s.id === 9004 ? false : true })), text: 'x' },
  ];
  const acc = ac.evidenceMap(evidence, 'accessible', PLAN), dog = ac.evidenceMap(evidence, 'dog_friendly', PLAN);
  const has = (need, s) => { const m = need === 'accessible' ? acc : dog; return m && m.has(s.id) ? m.get(s.id) : fromListings(need, s); };
  const [a, d] = ac.check([{ need: 'accessible', scopes: ['activities'] }, { need: 'dog', scopes: ['activities', 'meals'] }], PLAN, has);
  assert.deepEqual([names(a.ok), names(a.unk), names(a.no)], [['Grey Canal Trail'], ['Kal Lake Lookout', 'Davison Orchards'], []], 'the plan’s evidence, not the fallback');
  assert.deepEqual([names(d.unk), names(d.no)], [[], ['Station BBQ']]);
  assert.match(ac.needClause(d, 'en'), /Station BBQ says no dogs/);
  // Evidence built for other stops (one was swapped since) is not used.
  assert.equal(ac.evidenceMap(evidence, 'accessible', PLAN.slice(1)), null);
  assert.equal(ac.evidenceMap(evidence, 'vegan', PLAN), null);
});

test('a long list is a count with a pointer to Details; the ask-first line names the stops; French reads the same', () => {
  const many = PLAN.map((s) => ({ stop: s, has: null }));
  const c = { need: 'accessible', scopes: ['activities', 'meals'], list: many, ok: [], unk: PLAN, no: [] };
  const still = ac.stillLine([c], null, 'en');
  assert.equal(still, 'Still to check: wheelchair access at 6 stops. Details has the full list.');
  assert.equal(ac.stillLine([{ ...c, unk: [], ok: PLAN }], null, 'en'), 'Nothing else to check from the listings.');
  assert.equal(ac.askReply(PLAN.slice(0, 3), ['accessible'], 'en'), '3 stops don’t say if they’re wheelchair accessible: Kal Lake Lookout, Roster Sports Club and Grey Canal Trail. Swap them for places whose listing says wheelchair access, where I can find them? Go ahead?');
  const fr = ac.ensureReply({ stay: { name: 'Hôtel Test', changed: false, has: { accessible: true, pets: null }, asked: ['accessible', 'pets'] }, stayAsked: true, checks: [{ ...c, list: many.slice(0, 1), unk: PLAN.slice(0, 1) }], lang: 'fr' });
  assert.match(fr, /^Hôtel : Hôtel Test reste; sa fiche indique des chambres accessibles mais ne dit pas si les animaux sont acceptés\./);
  assert.match(fr, /À vérifier : l’accès en fauteuil roulant à Kal Lake Lookout; les animaux à Hôtel Test\./);
});

// ---------- 7. The stay hand-off wording ----------
test('“the links carry these dates” is said only when every link shown does; otherwise what to enter on the hotel’s site', () => {
  const trip = { arrive: '2027-01-16', leave: '2027-01-17' };
  const own = { key: 'own', label: 'Hotel’s own site', short: 'Hotel’s own site', labelFr: 'Site de l’hôtel', shortFr: 'Site de l’hôtel', url: 'https://www.choicehotels.com/en-ca/british-columbia/vernon/quality-inn-hotels/cn661' };
  const ota = { key: 'booking', label: 'Book on Booking.com', short: 'Booking.com', labelFr: 'Réserver sur Booking.com', shortFr: 'Booking.com', url: 'https://www.booking.com/hotel/ca/x.html?checkin=2027-01-16&checkout=2027-01-17&group_adults=2&no_rooms=1' };
  const said = 'Stay set: Sat, Jan 16 → Sun, Jan 17, 1 night. The booking links now carry these dates.';
  // No hand-off from the planner: the link itself is read (its own date and room parameters).
  assert.equal(app.tripChatLinkClaims(said, { trip, pick: { bookingLinks: [ota] } }, 'en'), said);
  assert.equal(app.tripChatLinkClaims(said, { trip, pick: { bookingLinks: [own] } }, 'en'), 'Stay set: Sat, Jan 16 → Sun, Jan 17, 1 night. The hotel’s own site doesn’t take your dates from here, so enter them on that site.');
  assert.equal(app.tripChatLinkClaims(said, { trip, pick: { bookingLinks: [ota, own] } }, 'en'), 'Stay set: Sat, Jan 16 → Sun, Jan 17, 1 night. The Booking.com link now carries these dates. The hotel’s own site doesn’t take your dates from here, so enter them on that site.');
  // The planner's hand-off: its carries and its note.
  const hand = (dates, note) => [{ key: 'own', label: 'Hotel’s own site', carries: { dates, adults: dates, rooms: dates }, note, noteFr: 'Entrez vos dates et le chien sur le site de l’hôtel.' }];
  assert.equal(app.tripChatLinkClaims(said, { trip, pick: { bookingLinks: [own], handoff: hand(true, '') } }, 'en'), said);
  assert.equal(app.tripChatLinkClaims(said, { trip, pick: { bookingLinks: [own], handoff: hand(false, 'Enter your dates and the dog on the hotel’s site') } }, 'en'), 'Stay set: Sat, Jan 16 → Sun, Jan 17, 1 night. Enter your dates and the dog on the hotel’s site.');
  assert.equal(app.tripChatLinkClaims('Séjour : a → b, 1 nuit. Les liens de réservation portent ces dates.', { trip, pick: { bookingLinks: [own], handoff: hand(false, 'x') } }, 'fr'), 'Séjour : a → b, 1 nuit. Entrez vos dates et le chien sur le site de l’hôtel.');
  assert.equal(app.tripChatLinkClaims('Séjour : a → b, 1 nuit. Les liens de réservation portent ces dates.', { trip, pick: { bookingLinks: [ota, own] } }, 'fr'), 'Séjour : a → b, 1 nuit. Le lien Booking.com porte ces dates. Le site de l’hôtel ne reçoit pas vos dates d’ici : entrez-les sur ce site.');
  // Rooms.
  assert.equal(app.tripChatLinkClaims('Set to 3 rooms. The stay links are updated; rooms and how many each sleeps are confirmed on the booking site.', { trip, pick: { bookingLinks: [own] } }, 'en'), 'Set to 3 rooms. The hotel’s own site doesn’t take your rooms and guests from here, so enter them on that site. Rooms and how many each sleeps are confirmed on the booking site.');
  assert.equal(app.tripChatLinkClaims('The stay links are set for 2 rooms for 6 adults, as you asked. The booking site confirms the rooms.', { trip, pick: { bookingLinks: [ota, own] } }, 'en'), 'The Booking.com link is set for 2 rooms for 6 adults, as you asked. The hotel’s own site doesn’t take your rooms and guests from here, so enter them on that site. The booking site confirms the rooms.');
});

// ---------- End to end: the chat handler and the real planner on test listings made for this file ----------
const made = [];
const F = {};
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${200 + n} Access Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 2000, longitude: AT[1] + n / 2000, description: 'A place used only by the access tests. Easy, flat and open all year.', slug: `access-test-${key.toLowerCase().replace(/_/g, "-")}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
test.before(() => {
  // Trails: one whose listing says wheelchair access (on the plan), three that don't say, and two with it (replacements).
  mk('T_OK', { type: 'outdoor', name: 'Access Test Lookout Loop', dog_friendly: 1 });
  mk('T_A', { type: 'outdoor', name: 'Access Test Ridge Trail', dog_friendly: 1 });
  mk('T_B', { type: 'outdoor', name: 'Access Test Creek Trail', dog_friendly: 1 });
  mk('T_C', { type: 'outdoor', name: 'Access Test Orchard Walk', dog_friendly: 1 });
  mk('T_N1', { type: 'outdoor', name: 'Access Test Canal Path', dog_friendly: 1 });
  mk('T_N2', { type: 'outdoor', name: 'Access Test Lakeside Boardwalk', dog_friendly: 1 });
  mk('T_N3', { type: 'outdoor', name: 'Access Test Marsh Boardwalk', dog_friendly: 1 });
  // Meals: a dog-friendly restaurant and one whose listing doesn't say.
  mk('R_DOG', { type: 'restaurant', name: 'Access Test Bistro', dog_friendly: 1, gluten_free: 1, price: 2, hours: HOURS });
  mk('R_PLAIN', { type: 'restaurant', name: 'Access Test Grill', gluten_free: 1, price: 2, hours: HOURS });
  mk('C_OK', { type: 'cafe', name: 'Access Test Café', dog_friendly: 1, price: 1, hours: HOURS });
  // Stays: one without a word on accessible rooms, one with them.
  mk('H_OLD', { type: 'stay', cuisine: 'motel', name: 'Access Test Motor Inn' });
  mk('H_NEW', { type: 'stay', cuisine: 'hotel', name: 'Access Test Hotel' });
  const ins = db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)');
  ins.run(F.H_OLD.id, JSON.stringify({ pets: 'yes', max_guests: 4, confidence: 'high', booking: { own: 'https://www.example.com/motor-inn' } }), '2026-11-20T00:00:00Z', 'test');
  ins.run(F.H_NEW.id, JSON.stringify({ pets: 'some', accessible: true, max_guests: 4, confidence: 'high', booking: { own: 'https://www.example.com/access-hotel' } }), '2026-11-20T00:00:00Z', 'test');
  for (const k of ['T_OK', 'T_N1', 'T_N2', 'T_N3', 'C_OK']) app.writeVenueOwnerFeatures(F[k].id, { wheelchair_accessible: true });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of made) { for (const t of ['stay_info', 'venue_owner_features']) { try { db.prepare(`DELETE FROM ${t} WHERE venue_id = ?`).run(id); } catch (e) { /* no such table */ } } db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  app.clearVenueOwnerFeaturesCache();
  try { app.server.close(); } catch (e) { /* not listening */ }
});

// The page's state (trip-chat-page.js): the request, the stops on screen with their times, the stay on screen.
const pageOf = (text, rows, stayId) => ({ text, seed: 0, overrides: {}, exclude: [], locks: {}, soft: {}, stops: rows.map(([key, f, start]) => ({ key, id: F[f].id, start })), stayId });
const bodyOf = (page, message, lang = 'en', extra = {}) => ({ message, lang, plan: { text: page.text, seed: page.seed, excludeVenueIds: page.exclude, ...(Object.keys(page.overrides).length ? { overrides: page.overrides } : {}), ...(page.stayPref ? { stay: { pref: page.stayPref } } : {}) }, locks: page.locks, removed: [], stops: page.stops, dayDates: ['2027-01-16', '2027-01-17'], ...(Object.keys(page.soft).length ? { soft: page.soft } : {}), ...(page.stayId ? { stayId: page.stayId } : {}), ...extra });
const say = async (page, message, lang = 'en', extra = {}) => {
  const parsed = app.parseTripChatBody(bodyOf(page, message, lang, extra), { stays: true });
  assert.ok(!parsed.error, parsed.error);
  return (await app.runTripChatTurn(parsed.value, { staysOn: true, lang })).response;
};
// The page applies a reply (chatSend).
const apply = (page, j) => {
  let next = { ...page };
  if (j.plan && j.req && (j.changed || []).length) next = { ...next, text: j.req.text, seed: j.req.seed, overrides: j.req.overrides || {}, exclude: (j.req.excludeVenueIds || []).slice(), locks: j.req.locks || {}, soft: j.req.soft || {}, stops: tc.planStops(j.plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })) };
  else if (typeof j.text === 'string' && j.text) next.text = j.text;
  const w = (j.stayBlock && j.stayBlock.whereToStay) || (j.plan && j.changed && j.changed.length && j.plan.whereToStay) || null;
  if (w && w.pick) next.stayId = w.pick.id;
  if (j.stayPref !== undefined) next.stayPref = j.stayPref;
  return next;
};
const at = (page) => page.stops.map((s) => `${s.key}:${s.id}@${s.start}`).sort();
const nothingChanged = (j, tag) => {
  assert.equal(j.plan, null, `${tag}: no new plan`);
  assert.equal(j.req, null, `${tag}: no new request`);
  assert.deepEqual(j.changed, [], `${tag}: no stop changed`);
  assert.deepEqual(j.actions, { remove: [], keep: [] }, `${tag}: nothing removed or kept`);
  for (const k of ['stayBlock', 'stayPref', 'text', 'confirm', 'party']) assert.equal(j[k], undefined, `${tag}: no ${k}`);
};
// Like the live plan: a trail with access data, one without, a dog-friendly restaurant and one that doesn't say, and a
// stay without the accessible amenity.
const LIVE = [['1-morning', 'T_OK', 615], ['1-midday', 'R_DOG', 690], ['1-afternoon', 'T_A', 810], ['1-evening', 'R_PLAIN', 1080], ['2-midday', 'R_DOG', 720]];
const LIVE_ROWS = [LIVE[0], LIVE[1], LIVE[2], LIVE[3]];

test('the listings’ own access data: the owner’s answer is a yes, nothing is “doesn’t say”', () => {
  assert.equal(app.tripChatAccessOf(F.T_OK.id), true);
  assert.equal(app.tripChatAccessOf(F.T_A.id), null);
  assert.equal(app.tripChatHasBadge(F.T_N1.id, 'wheelchair_accessible'), true);
  assert.equal(app.tripChatHasBadge(F.R_DOG.id, 'wheelchair_accessible'), false);
});

for (const [tag, reader] of [['rules', null], ['AI reader that returns only a stay change', async () => ({ ok: true, ops: [{ o: 'stay', value: 'accessible', stops: [], kind: null, time: null, day: null, n: null, ages: [], region: null, date: null }], cant: null })]]) {
  test(`end to end (${tag}): the exact request and message; all four parts answered, the change named, what is left named, the rest untouched`, async () => {
    app.setTripChatReader(reader);
    try {
      const page0 = pageOf(REQ, LIVE_ROWS, F.H_OLD.id);
      const j = await say(page0, MSG);
      const reply = j.reply;
      // (b) + (d) the hotel: changed to the one whose listing has accessible rooms, said from its listing only.
      assert.match(reply, /^Hotel: now Access Test Hotel; its listing has accessible rooms and allows pets in some rooms\./, reply);
      assert.equal((j.stayBlock || j.plan).whereToStay.pick.id, F.H_NEW.id, 'the stay part goes back with the plan');
      assert.deepEqual(j.stayPref.amenities, ['accessible', 'pets']);
      // (a) every activity: the verified one is kept, the one that doesn't say is swapped for the same kind, named.
      const page1 = apply(page0, j);
      const fresh = page1.stops.find((s) => s.key === '1-afternoon');
      assert.notEqual(fresh.id, F.T_A.id, reply);
      assert.equal(app.tripChatAccessOf(fresh.id), true, 'the replacement’s listing has the access data');
      const freshName = db.prepare('SELECT name, type FROM venues WHERE id = ?').get(fresh.id);
      assert.equal(freshName.type, 'outdoor', 'the same kind of place');
      assert.ok(reply.includes(`Wheelchair access: Access Test Lookout Loop lists wheelchair access; I swapped Access Test Ridge Trail for ${freshName.name}, whose listing says wheelchair access.`), reply);
      // (c) the dog at the stops: verified ones named, the one that doesn't say named (a meal stop is not swapped for
      // the wheelchair part, and the dog part covers it).
      assert.match(reply, /Dog: /, reply);
      // What still needs checking ends the reply; never a claim for a place whose listing doesn't say.
      assert.match(sentences(reply).slice(-2).join(' '), /Still to check|Nothing else to check/, reply);
      assert.ok(!/Access Test Grill (?:lists|list)/.test(reply), 'no claim for the restaurant that doesn’t say');
      assert.ok(sentences(reply).length <= 5, `at most four sentences and a short close: ${reply}`);
      // Unrelated stops and times unchanged.
      assert.equal(fresh.start, 810, 'the swapped stop keeps its slot and time');
      for (const s of page0.stops.filter((x) => x.key !== '1-afternoon' && !(j.changed || []).includes(x.key))) assert.ok(page1.stops.some((x) => x.key === s.key && x.id === s.id && x.start === s.start), `${s.key} unchanged`);
      assert.ok((j.changed || []).includes('1-afternoon'));
      assert.ok(!(j.changed || []).includes('1-morning') && !(j.changed || []).includes('1-midday'), 'verified stops are not touched');
      // The request already says both needs: it gains nothing.
      assert.equal(page1.text, REQ);
      assert.equal(j.source === 'rules' || j.source === 'rules_over_ai', true);
    } finally { app.setTripChatReader(null); }
  });
}

test('end to end: a request that never said the needs gains each one once, and the unrelated stops are not re-planned', async () => {
  const page0 = pageOf(REQ_PLAIN, [LIVE[0], LIVE[1]], F.H_NEW.id);
  const j = await say(page0, MSG);
  const page1 = apply(page0, j);
  assert.equal(page1.text, `${REQ_PLAIN}, wheelchair accessible, with our dog`);
  assert.deepEqual(at(page1), at(page0), 'every stop and time as before');
  assert.match(j.reply, /^Hotel: Access Test Hotel stays; its listing has accessible rooms and allows pets in some rooms\./);
  assert.match(j.reply, /Wheelchair access: Access Test Lookout Loop lists wheelchair access\./);
  assert.match(j.reply, /Dog: both stops list dogs welcome\./);
  assert.match(j.reply, /Nothing else to check from the listings\.$/);
  // Said again: the text does not gain it twice.
  const j2 = await say(page1, MSG);
  const page2 = apply(page1, j2);
  assert.equal(page2.text, page1.text);
  assert.equal((page2.text.match(/wheelchair accessible/g) || []).length, 1);
  assert.equal((page2.text.match(/with our dog/g) || []).length, 1);
  assert.deepEqual(at(page2), at(page0));
  // French.
  const fr = await say(pageOf(REQ_PLAIN, [LIVE[0], LIVE[1]], F.H_NEW.id), MSG_FR, 'fr');
  assert.match(fr.reply, /^Hôtel : Access Test Hotel reste; sa fiche indique des chambres accessibles et accepte les animaux dans certaines chambres\./);
  assert.match(fr.reply, /Accès en fauteuil roulant : Access Test Lookout Loop indique un accès en fauteuil roulant\./);
  assert.match(fr.reply, /Rien d’autre à vérifier d’après les fiches\.$/);
});

test('end to end: more than two stops would change, so the chat asks first; yes swaps where it can, the rest is “still to check”', async () => {
  const rows = [['1-morning', 'T_A', 615], ['1-midday', 'R_DOG', 690], ['1-afternoon', 'T_B', 810], ['2-morning', 'T_C', 615], ['2-midday', 'R_DOG', 720]];
  const page0 = pageOf(REQ, rows.slice(0, 4), F.H_NEW.id);
  const msg = 'Make sure every activity is wheelchair accessible';
  const ask = await say(page0, msg);
  assert.equal(ask.confirm, true);
  assert.equal(ask.plan, null);
  assert.deepEqual(ask.changed, []);
  assert.equal(ask.reply, '3 stops don’t say if they’re wheelchair accessible: Access Test Ridge Trail, Access Test Creek Trail and Access Test Orchard Walk. Swap them for places whose listing says wheelchair access, where I can find them? Go ahead?');
  // No: the page keeps the plan (nothing was applied by the question).
  assert.deepEqual(at(apply(page0, ask)), at(page0));
  // Yes: the page sends the message again, confirmed.
  const yes = await say(page0, msg, 'en', { confirmed: true });
  const page1 = apply(page0, yes);
  const swapped = page0.stops.filter((s) => !page1.stops.some((x) => x.key === s.key && x.id === s.id));
  assert.ok(swapped.length >= 2, yes.reply);
  for (const s of page1.stops.filter((x) => !page0.stops.some((o) => o.id === x.id))) {
    assert.equal(app.tripChatAccessOf(s.id), true, 'every replacement’s listing has the access data');
    const o = page0.stops.find((x) => x.key === s.key);
    assert.equal(s.start, o.start, 'same slot and time');
  }
  assert.ok(page1.stops.some((s) => s.key === '1-midday' && s.id === F.R_DOG.id && s.start === 690), 'the meal is untouched');
  assert.match(yes.reply, /I swapped Access Test (?:Ridge Trail|Creek Trail|Orchard Walk) for Access Test/);
  assert.match(yes.reply, /Still to check|Nothing else to check/);
});

test('end to end: a later “add a café” honours the needs (its listing has them, or the reply says it doesn’t say)', async () => {
  // (No dates here: on the test listings a dated January day has no café the planner will add.)
  const page0 = pageOf(`A relaxed 2-day trip in ${TOWN} with our dog. One of us uses a wheelchair.`, [LIVE[0], LIVE[1]], F.H_NEW.id);
  const j = await say(page0, 'add a café on day 1 in the afternoon', 'en', { dayDates: [] });
  const page1 = apply(page0, j);
  const added = page1.stops.find((s) => !page0.stops.some((o) => o.id === s.id));
  assert.ok(added, j.reply);
  const acc = app.tripChatAccessOf(added.id) === true, dog = app.tripChatHasBadge(added.id, 'dog_friendly');
  if (acc) assert.match(j.reply, /Its listing notes wheelchair access/, j.reply); else assert.match(j.reply, /doesn’t say if it’s wheelchair accessible/, j.reply);
  if (dog) assert.match(j.reply, /dogs welcome/, j.reply); else assert.match(j.reply, /doesn’t say/, j.reply);
  assert.equal(added.id, F.C_OK.id, 'the café whose listing has both is the one added when it fits');
  for (const s of page0.stops) assert.ok(page1.stops.some((x) => x.key === s.key && x.id === s.id && x.start === s.start), `${s.key} unchanged`);
});

test('end to end: the questions are answers and change nothing', async () => {
  const page0 = pageOf(REQ, LIVE_ROWS, F.H_OLD.id);
  const q1 = await say(page0, 'is day 1 wheelchair accessible?');
  nothingChanged(q1, 'day');
  assert.match(q1.reply, /^Day 1: Wheelchair access: Access Test Lookout Loop lists wheelchair access; Access Test Bistro, Access Test Ridge Trail and Access Test Grill don’t say\./, q1.reply);
  const q2 = await say(page0, 'can the dog come to lunch?');
  nothingChanged(q2, 'lunch');
  assert.match(q2.reply, /^Dog: Access Test Bistro lists dogs welcome\.$/, q2.reply);
  const q2b = await say(page0, 'can the dog come to dinner?');
  assert.match(q2b.reply, /^Dog: Access Test Grill doesn’t say if dogs are welcome\./, q2b.reply);
  assert.ok(!/no dogs|not allowed/.test(q2b.reply), 'never “no dogs” without data');
  const q3 = await say(page0, 'which stops are accessible?');
  nothingChanged(q3, 'which');
  assert.match(q3.reply, /Access Test Lookout Loop lists wheelchair access/);
  const q4 = await say(page0, 'what do I still need to check?');
  nothingChanged(q4, 'check');
  assert.match(q4.reply, /^Still to check: wheelchair access at Access Test Bistro, Access Test Ridge Trail and Access Test Grill; dogs at Access Test Grill; accessible rooms at Access Test Motor Inn/, q4.reply);
  const q5 = await say(page0, 'is the hotel wheelchair accessible?');
  nothingChanged(q5, 'hotel');
  assert.match(q5.reply, /^Hotel: Access Test Motor Inn’s listing doesn’t say if it has accessible rooms/, q5.reply);
  const q6 = await say(page0, 'Why is day 2 so empty?');
  nothingChanged(q6, 'thin');
  assert.ok(q6.reply.length > 10 && sentences(q6.reply).length <= 2, q6.reply);
  const fr = await say(page0, 'Est-ce que le chien peut venir au dîner?', 'fr');
  nothingChanged(fr, 'fr');
  assert.match(fr.reply, /^Chien : Access Test Bistro indique que les chiens sont admis\.$/, fr.reply);
});

// ---------- 4b. The itinerary's buttons under a light day (plan.thinDays[].next[].message) ----------
test('the light-day buttons: “Keep day 2 light” changes nothing; “Add an easy walk in <town> on day 2” is an add on that day, never a new base town', async () => {
  const keep = R('Keep day 2 light');
  assert.deepEqual([keep.ops[0].o, keep.ops[0].value, keep.ops[0].day, keep.ops[0].keep], ['ask', 'q_thin', 2, true]);
  for (const m of [`Add an easy walk in ${TOWN} on day 2`, 'Add an easy walk in Coldstream on day 2', 'Add a stop in Oliver on day 2']) {
    const r = R(m);
    assert.deepEqual(r.ops.map((o) => [o.o, o.day]), [['add', 2]], m);
    assert.ok(!r.ops.some((o) => o.o === 'town'), `${m}: the trip is not moved to that town`);
  }
  assert.deepEqual(R('Add an indoor stop on day 2').ops.map((o) => [o.o, o.kind, o.day]), [['add', 'indoor', 2]]);
  const page0 = pageOf(REQ, LIVE_ROWS, F.H_OLD.id);
  const j = await say(page0, 'Keep day 2 light');
  nothingChanged(j, 'keep light');
  assert.equal(j.reply, 'OK, day 2 stays as it is. Nothing changed.');
  // Asked why, with the planner's own line when the plan has one (plan.thinDays), else what is known: one or two lines.
  const why = await say(page0, 'Why is day 2 so empty?');
  nothingChanged(why, 'why');
});
