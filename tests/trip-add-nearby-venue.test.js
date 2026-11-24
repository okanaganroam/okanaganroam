'use strict';
// Build My Trip chat (2026-11-24, Dayton's report at 390px). The request:
//   "Plan a two-day anniversary getaway in Peachland for two adults on June 12–13, 2027. We want a lake-view dinner, a
//    relaxed boat tour and a hotel for one night. One of us is vegetarian and we would like to avoid wineries."
// gave a plan whose summary said "There's no guided boat tour listed in Peachland… The nearest is Luxury Lake Tours in
// Kelowna." Then, each on that plan:
//   1. "Can you add the guided boat tour in Kelowna you suggested? Keep all the other stops and avoid wineries."
//        answered that no guided boat tour was listed.
//   2. "Please add Luxury Lake Tours in Kelowna to our trip."
//        moved the trip to Kelowna, changed five stops, added other operators and "couldn't do one other thing".
// Here: the place the plan suggested, or a listing named by its own name, is added to a free part of a day with every
// other stop, the base town, the stay, the dates and the trip's rules as they were (trip-add-venue.js); a town said
// with it says where the place is; anything that cannot be done as asked is said plainly, with one alternative that is
// asked first. Fixture listings only; no network; the word rules only (the AI reader is shown never to be asked).
// The same file runs on whistlerroam.com, where the kind ruled out is a brewery.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const AV = require('../trip-add-venue.js');
const X = require('../trip-exclusions.js');
const HP = require('../trip-honest-plan.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const HOST = WR ? 'brewery' : 'winery', HOSTS = WR ? 'breweries' : 'wineries';
const REGION = WR ? 'callaghan-valley' : 'peachland', TOWN = WR ? 'Callaghan Valley' : 'Peachland';
const REGION2 = WR ? 'whistler' : 'west-kelowna', TOWN2 = WR ? 'Whistler' : 'West Kelowna';
const AT = WR ? [50.139, -123.114] : [49.7791, -119.7367];
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const REQ = `Plan a two-day anniversary getaway in ${TOWN} for two adults on June 12–13, 2027. We want a lake-view dinner, a relaxed boat tour and a hotel for one night. One of us is vegetarian and we would like to avoid ${HOSTS}.`;
// The same trip with no boat tour asked for: its plan suggests nothing.
const REQ_PLAIN = REQ.replace(', a relaxed boat tour', '');
const NAME = 'Fixture Luxury Lake Tours ADD';
const MSG1 = `Can you add the guided boat tour in ${TOWN2} you suggested? Keep all the other stops and avoid ${HOSTS}.`;
const MSG2 = `Please add ${NAME} in ${TOWN2} to our trip.`;

const made = [];
const F = {};
const DAYS7 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOURS = JSON.stringify(Object.fromEntries(DAYS7.map((d) => [d, [['07:00', '22:00']]])));
// June 12 and 13, 2027 are a Saturday and a Sunday.
const WEEKDAYS_ONLY = JSON.stringify(Object.fromEntries(DAYS7.map((d) => [d, ['sat', 'sun'].includes(d) ? null : [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${700 + n} Add Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 4000, longitude: AT[1], description: 'A place used only by the add-a-place tests. Open all year.', slug: `add-test-${key.toLowerCase()}`, website: `https://add-${key.toLowerCase()}.example.com/`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const EAT = { type: 'restaurant', price: 2, hours: HOURS, vegetarian: 1, lake_view: 1 };
test.before(() => {
  mk('HOSTV', { type: HOST, name: `Fixture Lakeshore Estate ${WR ? 'Brewing Company' : 'Winery'} ADD`, address: `4300 Fixture Lakeshore Road, ${TOWN}, BC`, website: 'https://fixture-lakeshore-add.example.com/', hours: HOURS, latitude: AT[0] + 0.004, description: 'Tastings on a patio above the lake. Open all year.' });
  mk('HOSTREST', { ...EAT, price: 3, name: 'Fixture Vine Room ADD', address: `4300 Fixture Lakeshore Road, ${TOWN}, BC`, website: 'https://fixture-lakeshore-add.example.com/dining/', latitude: AT[0] + 0.0041,
    description: `The Vine Room is the fine-dining room at Fixture Lakeshore Estate ${WR ? 'Brewing Company' : 'Winery'}, with sweeping lake views and a vegetarian tasting menu. Open all year.` });
  mk('VEG1', { ...EAT, name: 'Fixture Lakeview Table ADD', description: 'A lakefront dining room with a vegetarian menu. Open all year.' });
  mk('VEG2', { ...EAT, name: 'Fixture Shoreline Kitchen ADD', description: 'A casual kitchen on the shoreline with vegetarian plates. Open all year.' });
  mk('VEG3', { ...EAT, name: 'Fixture Pier Bistro ADD', description: 'A bistro by the pier with vegetarian choices and lake views. Open all year.' });
  mk('TRAIL', { type: 'outdoor', name: 'Fixture Beach Trail ADD', hours: HOURS, description: 'A winding gravel path through the woods to a quiet sandy beach. Open all year.' });
  mk('CAMP', { type: 'outdoor', name: 'Fixture Lookout Loop ADD', hours: HOURS, lake_view: 1, description: 'A short loop trail to a lookout above the lake. Open all year.' });
  mk('PARK', { type: 'outdoor', name: 'Fixture Creek Park ADD', hours: HOURS, description: 'A shady creekside park with picnic tables and a short walking path. Open all year.' });
  mk('PARK2', { type: 'outdoor', name: 'Fixture Orchard Walk ADD', hours: HOURS, description: 'A flat walking path through old orchards. Open all year.' });
  mk('PARK3', { type: 'outdoor', name: 'Fixture Heritage Garden ADD', hours: HOURS, description: 'A small heritage garden with benches and a pond. Open all year.' });
  mk('PARK4', { type: 'outdoor', name: 'Fixture Marsh Boardwalk ADD', hours: HOURS, description: 'A boardwalk over a marsh with bird blinds. Open all year.' });
  // The next town: guided boat tours by their own words. The nearest one's name has a word the chat used to read as a
  // wish ("Luxury" -> fancier meals), and in the Okanagan its words also mention wine tours.
  mk('TOUR', { region: REGION2, type: 'outdoor', name: NAME, hours: null, lake_view: 1, latitude: AT[0] + 0.045, address: `12 Fixture Marina Way, ${TOWN2}, BC`,
    description: WR ? 'Captained private boat tours on the lake, from sightseeing cruises to fishing charters.' : 'Captained private boat tours on the lake, from sightseeing cruises and fishing charters to wine tours that arrive at lakeside wineries by water.' });
  mk('TOUR2', { region: REGION2, type: 'tour', name: 'Fixture Harbour Pontoon Cruises ADD', hours: HOURS, latitude: AT[0] + 0.06, address: `40 Fixture Harbour Road, ${TOWN2}, BC`, description: 'Fixture Harbour Pontoon Cruises runs private, captained pontoon tours on the lake, from daytime cruises to sunset outings. Open all year.' });
  // A guided boat tour whose stored hours show it closed on both days of the trip.
  mk('SHUT', { region: REGION2, type: 'tour', name: 'Fixture Weekday Lake Charters ADD', hours: WEEKDAYS_ONLY, latitude: AT[0] + 0.05, address: `44 Fixture Harbour Road, ${TOWN2}, BC`, description: 'Fixture Weekday Lake Charters runs captained boat tours on the lake on weekdays only.' });
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Lakeside Hotel ADD' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.HOTEL.id, JSON.stringify({ max_guests: 4, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-lakeside-add.html', own: 'https://add-hotel.example.com/book' } }), '2026-11-24T00:00:00Z', 'test-add');
});
test.after(() => {
  app.setTripChatReader(null);
  if (F.HOTEL) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F.HOTEL.id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const run = (text) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text }, { v4: true, stays: true }).value, v4: true }, true);
const DATES = ['2027-06-12', '2027-06-13'];
// The plan on the traveller's screen: two days, the afternoon of day 2 free.
const SCREEN = () => [
  { key: '1-morning', id: F.TRAIL.id, start: 570 }, { key: '1-midday', id: F.VEG1.id, start: 690 }, { key: '1-afternoon', id: F.CAMP.id, start: 810 }, { key: '1-evening', id: F.VEG2.id, start: 1050 },
  { key: '2-morning', id: F.PARK.id, start: 540 }, { key: '2-midday', id: F.VEG3.id, start: 720 },
];
// The same plan with every part of both days taken.
const FULL = () => [...SCREEN(), { key: '1-late', id: F.PARK2.id, start: 930 }, { key: '2-afternoon', id: F.PARK3.id, start: 840 }, { key: '2-late', id: F.PARK4.id, start: 960 }];
const say = async (message, o = {}) => {
  const body = { message, lang: o.lang || 'en', plan: { text: o.text || REQ, seed: 0, excludeVenueIds: [], ...(o.overrides ? { overrides: o.overrides } : {}) }, locks: {}, removed: [], stops: o.stops || SCREEN(), dayDates: DATES, tripSource: 'request', stayId: F.HOTEL.id, stayTown: REGION,
    ...(o.offer ? { offer: o.offer } : {}), ...(o.suggested !== null ? { suggested: o.suggested || [`boat_tour:${F.TOUR.id}`] } : {}) };
  const v = app.parseTripChatBody(body, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const slots = (list) => Object.fromEntries(list.map((s) => [s.key, [s.id, s.start]]));
const at = (p) => slots(tc.planStops(p));
const screenOf = (p) => tc.planStops(p).map((s) => ({ key: s.key, id: s.id, start: s.start }));
const evOf = (p) => Object.fromEntries(p.evidence.map((e) => [e.ask, e]));
const clockOf = (m) => tc.clock(m, 'en');
// A reply never claims what no listing can show.
const HONEST = (reply) => {
  assert.doesNotMatch(reply, /\bavailable\b|\bavailability\b|relaxing|relaxed|\bconfirmed\b|\bbooked\b|\bminutes?\b|\bdrive\b|couldn’t do (?:one|\d+) other/i, reply);
  assert.ok((reply.match(/\?/g) || []).length <= 1, `one question at most: ${reply}`);
  assert.ok(reply.split(/\s+/).length <= 60, reply);
};
// Everything but the one new stop is as it was: the slots, the places, the times, the stay, the dates, the rules.
const UNTOUCHED = (r, before, text = REQ) => {
  const now = at(r.plan);
  for (const [k, v] of Object.entries(before)) assert.deepEqual(now[k], v, `${k} moved or changed`);
  assert.equal(r.req.text, text, 'the request is not rewritten');
  assert.ok(!(r.req.overrides || {}).baseRegion, 'no new base town');
  assert.deepEqual(r.plan.intent.regions, [REGION], 'the trip is still a trip to its own town');
  assert.equal(r.plan.whereToStay.pick.id, F.HOTEL.id);
  const t = r.plan.whereToStay.trip;
  assert.deepEqual([t.arrive, t.leave, t.nights, t.adults], ['2027-06-12', '2027-06-13', 1, 2]);
  assert.deepEqual(r.plan.days.map((d) => d.date), DATES);
  assert.deepEqual(r.actions, { remove: [], keep: [] });
};
const shareQuery = (p) => {
  const list = tc.planStops(p), asks = HP.shareAsks(p), ni = HP.shareNotIncluded(p);
  const mealIds = new Set(((p.evidence.find((e) => e.ask === 'vegetarian') || {}).stops || []).map((s) => s.id));
  return { stops: list.map((s) => `venue:${s.id}`).join(','), days: list.map((s) => s.day).join(','), t: list.map((s) => s.start).join(','), td: '2027-06-12_2027-06-13', ts: 'r', stay: String(F.HOTEL.id), nights: '1', ad: '2', rm: '1', ra: '1',
    asks: asks.join(','), ml: list.map((s) => (mealIds.has(s.id) ? 1 : 0)).join(''), ...(ni.length ? { ni: ni.join(','), nt: REGION } : {}) };
};
const shared = (p) => { const c = app.tripShareContext(shareQuery(p), 'en', new Date('2026-11-24T18:00:00Z')); return { c, html: app.tripShareContextHtml(c, 'en'), lines: Object.fromEntries(c.lines.map((l) => [l.ask, l.text])) }; };

test('1. the words: a listing by its name, the place the plan suggested, a kind in another town; a town with it never moves the trip', () => {
  const labels = { peachland: 'Peachland', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', penticton: 'Penticton' }, regions = Object.keys(labels);
  const index = AV.buildIndex([{ id: 1, name: 'Luxury Lake Tours', region: 'kelowna', type: 'outdoor' }, { id: 2, name: 'Kelowna Cruises', region: 'kelowna', type: 'tour' }, { id: 3, name: 'Lake View', region: 'kelowna', type: 'restaurant' },
    { id: 4, name: 'Earls Kitchen + Bar', region: 'kelowna', type: 'restaurant' }, { id: 5, name: 'Earls Kitchen + Bar', region: 'penticton', type: 'restaurant' }, { id: 6, name: 'Kelowna', region: 'kelowna', type: 'outdoor' }, { id: 7, name: 'The Old Mill (Peachland)', region: 'peachland', type: 'outdoor' }], labels);
  const ctx = (o = {}) => ({ index, regions, regionLabels: labels, tripRegions: ['peachland'], stops: [], suggested: () => [{ kind: 'boat_tour', id: 1, region: 'kelowna', chatKinds: ['boat_tour'] }], kindsNamed: (t) => tc.kindsNamed(t), canList: (k) => k === 'boat_tour' || k === 'spa', days: 2, ...o });
  const rd = (m, o) => AV.read(m, ctx(o));
  // By name: with or without its town, a plural dropped, no "add" but a plain wish, French.
  for (const m of ['Please add Luxury Lake Tours in Kelowna to our trip.', 'add Luxury Lake Tours', 'we’d like to add luxury lake tour', 'Can we do Luxury Lake Tours in Kelowna?', 'Ajoutez Luxury Lake Tours à Kelowna', 'Can you change the plan to include Luxury Lake Tours in Kelowna?']) assert.equal(rd(m).toId, 1, m);
  assert.equal(rd('add Kelowna Cruises').toId, 2, 'a town’s name inside a listing’s name is part of the name');
  assert.equal(rd('add The Old Mill on day 2').toId, 7); assert.equal(rd('add The Old Mill on day 2').day, 2);
  assert.equal(rd('add Luxury Lake Tours tomorrow in the evening').time, 'evening');
  // Two of the same name: the town said tells them apart; with none said, asked.
  assert.equal(rd('add Earls Kitchen + Bar in Penticton').toId, 5);
  assert.deepEqual(rd('add Earls Kitchen and Bar').which, [4, 5]);
  // Plain words and a town's own name are never a listing's name.
  assert.equal(AV.namesIn('add a lake view dinner in kelowna', index).length, 0);
  // The place the plan suggested, in the words people use; a town or kind that fits it changes nothing.
  for (const m of ['add the one you suggested', 'Can you add the guided boat tour in Kelowna you suggested? Keep all the other stops and avoid wineries.', 'add that tour', 'add the nearest one', 'Add it', 'please add the boat tour you recommended', 'add your suggestion',
    'Ajoute l’excursion que vous avez suggérée', 'ajoute la plus proche', 'ajoutez-la']) assert.deepEqual([rd(m).ref, rd(m).toId], ['suggested', 1], m);
  // …and with no suggestion on the plan, the words are not a place: said, or left to the usual rules.
  assert.equal(rd('add the one you suggested', { suggested: () => [] }).ref, 'none');
  assert.equal(rd('Add it', { suggested: () => [] }), null);
  // A suggestion in another town than the one said is not that suggestion.
  assert.deepEqual(rd('add the boat tour in Penticton you suggested'), { kind: 'boat_tour', region: 'penticton', the: true, day: null, time: null });
  // A kind in a town the trip is not in; a town alone; a name that is no listing.
  assert.deepEqual(rd('add a guided boat tour in Kelowna', { suggested: () => [] }), { kind: 'boat_tour', region: 'kelowna', day: null, time: null });
  assert.deepEqual(rd('add something in Kelowna'), { region: 'kelowna', day: null, time: null });
  assert.deepEqual(rd('Can you add a stop in Kelowna to our trip?'), { region: 'kelowna', day: null, time: null });
  assert.deepEqual(rd('Please add Fancy Boat Co in Kelowna to our trip.'), { said: 'Fancy Boat Co', region: 'kelowna', day: null, time: null });
  assert.equal(rd('Ajoute Bateau Fantôme à Kelowna').said, 'Bateau Fantôme');
  // Not these rules' to read: a move of the trip, a swap, a removal, a night, a stay, a meal in a town, the trip's own town.
  for (const m of ['change the trip to Kelowna', 'base us in Kelowna', 'move the whole trip to Kelowna', 'we want to be based in Kelowna', 'replace the trail with Luxury Lake Tours', 'remove Luxury Lake Tours', 'add a night in Kelowna', 'add a hotel in Kelowna',
    'add dinner in Kelowna', 'add a coffee stop before The Old Mill', 'add lunch near Luxury Lake Tours', 'add a guided boat tour in Peachland', 'add a guided boat tour', 'Add an easy walk in Kelowna on day 2', 'what is there to do in Kelowna?']) assert.equal(rd(m), null, m);
  // A town said right after a listing's name is where the listing is.
  assert.deepEqual(AV.locatingTowns('Is Luxury Lake Tours in Kelowna open on Sunday?', { index, regions, regionLabels: labels }), ['kelowna']);
  assert.deepEqual(AV.locatingTowns('change the trip to Kelowna', { index, regions, regionLabels: labels }), []);
  // "Keep all the other stops" asks for what every change already does.
  assert.equal(AV.stripKeepRest('Can you add the guided boat tour in Kelowna you suggested? Keep all the other stops and avoid wineries.'), 'Can you add the guided boat tour in Kelowna you suggested? avoid wineries.');
  assert.equal(AV.stripKeepRest('Add the spa, but leave everything else as it is.'), 'Add the spa.');
  assert.equal(AV.stripKeepRest('keep the other winery'), 'keep the other winery');
  assert.equal(AV.stripKeepRest('keep the rest'), 'keep the rest');
  // The chat's own reader, with the listings' names: the two messages are ONE add each. No new base town, no
  // "fancier meals" from the word Luxury, no re-plan; and fixed rules, so the AI's reading never stands in for them.
  const stops = [{ key: '1-midday', ref: 's1', id: 90, name: 'Peachland Sushi', type: 'restaurant', day: 1, role: 'lunch', badges: [], region: 'peachland' }, { key: '1-evening', ref: 's2', id: 91, name: 'The Landing', type: 'restaurant', day: 1, role: 'dinner', badges: [], region: 'peachland' }];
  const add = ctx();
  const opts = { regions, regionLabels: labels, days: 2, request: 'a trip to Peachland, no wineries', add };
  const r2 = tc.rulesRead('Please add Luxury Lake Tours in Kelowna to our trip.', stops, opts);
  assert.deepEqual(r2.ops.map((o) => [o.o, o.toId]), [['add_to', 1]]); assert.equal(r2.access, true);
  const r1 = tc.rulesRead('Can you add the guided boat tour in Kelowna you suggested? Keep all the other stops and avoid wineries.', stops, opts);
  assert.deepEqual(r1.ops.map((o) => [o.o, o.toId || o.kind]), [['add_to', 1], ['avoid', 'winery']]); assert.equal(r1.access, true);
  assert.ok(![...r1.ops, ...r2.ops].some((o) => ['town', 'budget', 'pace', 'refine', 'start_over', 'keep', 'party'].includes(o.o)));
  assert.deepEqual(tc.reconcileReads({ ok: true, ops: [{ o: 'town', region: 'kelowna', stops: [] }], cant: null }, r2, 'x').ops.map((o) => o.o), ['add_to']);
  // Without the listings' names (as before this fix) the same words were a new base town and fancier meals.
  assert.deepEqual(tc.rulesRead('Please add Luxury Lake Tours in Kelowna to our trip.', stops, { ...opts, add: null }).ops.map((o) => o.o), ['town', 'budget']);
  // A question that names a listing and its town is still not a move, and its name is not a wish for fancier meals.
  assert.ok(!tc.rulesRead('Is Luxury Lake Tours in Kelowna any good for kids?', stops, opts).ops.some((o) => o.o === 'town' || o.o === 'budget'));
  // A real move of the trip reads as it always did.
  for (const m of ['change the trip to Kelowna', 'base us in Kelowna']) assert.deepEqual(tc.rulesRead(m, stops, opts).ops.map((o) => [o.o, o.region]), [['town', 'kelowna']], m);
});

test('2. the exact request: the summary names the nearest guided boat tour, and the page can add exactly that listing', () => {
  const p = run(REQ);
  assert.deepEqual(p.notIncluded.map((x) => [x.kind, x.reason, x.nearest && x.nearest.id]), [['boat_tour', 'none_listed', F.TOUR.id]]);
  assert.equal(p.notIncluded[0].text, `There’s no guided boat tour listed in ${TOWN}, so this plan has none. The nearest is ${NAME} in ${TOWN2}.`);
  assert.ok(!tc.planStops(p).some((s) => s.id === F.TOUR.id), 'named, never added unasked');
  // Beside that sentence: one small button that asks the chat for that listing by its id.
  assert.match(PAGE, /class="v4-notinc-add" data-v4-offer="' \+ esc\(String\(x\.nearest\.name \|\| ''\)\.replace\(\/\[\\\[\\\]\]\/g, ' '\) \+ ' \[add ' \+ nid \+ '\]'\)/);
  assert.match(PAGE, /\(fr \? 'L’ajouter' : 'Add it'\)/);
  // The chat is told which places the plan on screen names, so both always mean the same listing.
  assert.match(CHAT_PAGE, /body\.suggested = \(\(state\.last && state\.last\.notIncluded\) \|\| \[\]\)/);
  assert.equal(app.parseTripChatBody({ message: 'x', plan: { text: REQ }, stops: [], suggested: ['boat_tour:12'] }, { stays: true }).value.suggested[0], 'boat_tour:12');
  assert.match(app.parseTripChatBody({ message: 'x', plan: { text: REQ }, stops: [], suggested: ['<b>'] }, { stays: true }).error, /suggested/);
});

for (const [n, MSG, how] of [[3, MSG1, 'the place the plan suggested'], [4, MSG2, 'the listing named']]) {
  test(`${n}. message ${n - 2}, exactly: ${how} is added to a free afternoon; nothing else changes`, async () => {
    const before = slots(SCREEN());
    // The AI reader is there and would move the trip; it is never asked (fixed rules), and nothing it says is used.
    let asked = 0;
    app.setTripChatReader(async () => { asked += 1; return { ok: true, ops: [{ o: 'town', region: REGION2, stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], date: null }], cant: null }; });
    let r;
    try { r = await say(MSG); } finally { app.setTripChatReader(null); }
    assert.equal(asked, 0, 'the AI reader is not consulted for this message');
    assert.ok(r.plan, r.reply);
    const now = at(r.plan);
    // Exactly that listing, in the one free part of the two days, at a time the planner gave it.
    assert.equal(now['2-afternoon'][0], F.TOUR.id);
    assert.ok(now['2-afternoon'][1] >= 795 && now['2-afternoon'][1] <= 900, String(now['2-afternoon'][1]));
    assert.deepEqual(Object.keys(now).sort(), [...Object.keys(before), '2-afternoon'].sort(), 'no extra stop, none taken out');
    assert.deepEqual(r.changed, ['2-afternoon']);
    assert.ok(!Object.values(now).some((v) => [F.TOUR2.id, F.SHUT.id].includes(v[0])), 'never another operator');
    UNTOUCHED(r, before);
    // The reply: what was added, when, where it is (honest distance), and that the date is the operator's to confirm.
    const want = `^Added ${NAME} on day 2 at ${clockOf(now['2-afternoon'][1])}\\. It’s in ${TOWN2}, outside ${TOWN} \\(about [\\d.]+ km in a straight line\\)\\. Check your date with the operator\\. ${WR ? '' : `It also runs wine tours: pick an outing with no ${HOST} stop\\. `}Nothing else changed\\.$`;
    assert.match(r.reply, new RegExp(want));
    HONEST(r.reply);
    assert.ok(!r.offer && !r.choices && !r.confirm, 'nothing more is asked');
    // The plan that comes back says so honestly: the boat tour is in it (by that stop), no "not in this plan"; the
    // rule, the diet, the hotel and the dates are as they were.
    const ev = evOf(r.plan);
    assert.equal(ev['kind:boat_tour'].status, 'verified'); assert.deepEqual(ev['kind:boat_tour'].stops.map((s) => s.id), [F.TOUR.id]);
    assert.equal(ev['kind:boat_tour'].text, `Guided boat tour: ${NAME}.`);
    assert.ok(!(r.plan.notIncluded || []).some((x) => x.kind === 'boat_tour' || x.kind === 'tour'), JSON.stringify(r.plan.notIncluded));
    assert.deepEqual(HP.shareNotIncluded(r.plan), [], 'no ni= marker any more');
    assert.equal(ev[`no:${HOST}`].status, 'verified'); assert.equal(ev[`no:${HOST}`].short, `No ${HOSTS} ✓`);
    assert.ok(HP.shareAsks(r.plan).includes(`no:${HOST}`));
    assert.ok(X.readExclusions(r.req.text).includes(HOST));
    assert.equal(ev.vegetarian.status, 'verified'); assert.match(ev.vegetarian.text, /^Vegetarian: all 3 meal stops list vegetarian options\.$/);
    for (const e of r.plan.evidence) assert.doesNotMatch(String(e.text), /relax/i, e.text);
    // Said once: the boat tour's own tick is the tour asked for, so the summary's four ticks all show on a phone
    // (a fifth, "Tours ✓", folded "No wineries ✓" into "+2 more").
    assert.deepEqual(r.plan.evidence.filter((e) => e.status === 'verified').map((e) => e.ask), ['kind:boat_tour', 'vegetarian', 'lake_view', `no:${HOST}`]);
    // The trip keeps its own name.
    assert.equal(r.keepHead, true);
    assert.match(CHAT_PAGE, /if \(j\.keepHead && state\.last && typeof state\.last\.headline === 'string' && state\.last\.headline\) j\.plan\.headline = state\.last\.headline;/);
    // What the page needs: the new plan with its request, so its own Undo (the snapshot it took before sending) is
    // offered; the chat keeps the new stop as its own (never a lock of the visitor's).
    assert.equal(r.req.soft['2-afternoon'], F.TOUR.id); assert.deepEqual(r.req.locks, {});
    assert.equal(r.req.pinned['2-afternoon'], F.TOUR.id);
    // The same with a page that sends no suggestions (an older tab): worked out from the stops, the same listing.
    const r0 = await say(MSG, { suggested: null });
    assert.equal(at(r0.plan)['2-afternoon'][0], F.TOUR.id); assert.equal(r0.reply, r.reply);
    // Said again once it is there: nothing changes.
    const again = await say(MSG2, { stops: screenOf(r.plan), suggested: [] });
    assert.equal(again.plan, null);
    assert.equal(again.reply, `${NAME} is already on day 2 at ${clockOf(now['2-afternoon'][1])}. Nothing changed.`);
  });
}

test('5. the summary’s own "Add it", a yes to the offer, and other ways of saying it all add the same listing', async () => {
  const before = slots(SCREEN());
  // The button's message: the place's name and its id.
  const b = await say(`${NAME} [add ${F.TOUR.id}]`, { suggested: [] });
  assert.equal(at(b.plan)['2-afternoon'][0], F.TOUR.id); UNTOUCHED(b, before);
  for (const m of ['add the one you suggested', 'add that tour', 'add the nearest one', `add a guided boat tour in ${TOWN2}`, `Can we do ${NAME}?`, `add ${NAME} and keep the rest as it is`]) {
    const r = await say(m);
    assert.ok(r.plan, `${m}: ${r.reply}`);
    assert.equal(at(r.plan)['2-afternoon'][0], F.TOUR.id, m); UNTOUCHED(r, before);
  }
  // The kind with no town: the trip is not taken to another town unasked. Named (the same place the summary names),
  // asked, and added on a plain yes.
  const k = await say('add a guided boat tour');
  assert.equal(k.plan, null);
  assert.match(k.reply, new RegExp(`^I list no guided boat tour in ${TOWN}\\. Nearest: ${NAME}, in ${TOWN2}, outside ${TOWN} \\(about [\\d.]+ km in a straight line\\)\\. Add it\\?$`));
  assert.deepEqual(k.offer, [`${NAME} [add ${F.TOUR.id}]`]);
  assert.deepEqual(k.choices.map((c) => [c.kind, c.label]), [['view', `View ${NAME}`], ['say', 'Add it']]);
  assert.match(k.choices[0].url, new RegExp(`^/${REGION2}/[a-z-]+/add-test-tour$`));
  HONEST(k.reply);
  const y = await say('yes', { offer: k.offer });
  assert.equal(at(y.plan)['2-afternoon'][0], F.TOUR.id); UNTOUCHED(y, before);
  const n = await say('no thanks', { offer: k.offer });
  assert.equal(n.plan, null); assert.equal(n.reply, tc.T.en.offerKept);
  // French: the same listing, said in French.
  const f = await say('Ajoute l’excursion que vous avez suggérée', { lang: 'fr' });
  assert.equal(at(f.plan)['2-afternoon'][0], F.TOUR.id);
  assert.match(f.reply, new RegExp(`^${NAME} ajouté au jour 2 à .+\\. C’est à ${TOWN2}, hors d[e’] ?${TOWN} \\(environ [\\d,.]+ km à vol d’oiseau\\)\\. Vérifiez votre date auprès de l’exploitant\\. .*Rien d’autre n’a changé\\.$`));
});

test('6. no free part of a day long enough: nothing moves; the stop it would clash with is named and one question is asked', async () => {
  const before = slots(FULL());
  const r = await say(MSG2, { stops: FULL() });
  assert.equal(r.plan, null, r.reply);
  assert.deepEqual(r.changed, []);
  const m = new RegExp(`^There’s no free slot long enough for ${NAME}\\. It would clash with (Fixture [A-Za-z ]+ ADD) \\(day (\\d), ([\\d:]+ [AP]M)\\)\\. Replace that stop\\?$`).exec(r.reply);
  assert.ok(m, r.reply);
  HONEST(r.reply);
  const old = FULL().map((s) => ({ ...s, name: db.prepare('SELECT name, type FROM venues WHERE id = ?').get(s.id) })).find((s) => s.name.name === m[1]);
  assert.ok(old && old.name.type === 'outdoor', 'an activity gives way to an activity, never a meal');
  assert.equal(m[3], clockOf(old.start)); assert.equal(Number(m[2]), Number(old.key[0]));
  assert.deepEqual(r.offer, [`${NAME} [swap ${old.id}>${F.TOUR.id} named]`]);
  assert.deepEqual(r.choices.map((c) => [c.kind, c.label]), [['view', `View ${NAME}`], ['say', 'Replace that stop']]);
  // Any other message leaves the plan alone; a no keeps it.
  const no = await say('no', { stops: FULL(), offer: r.offer });
  assert.equal(no.plan, null); assert.equal(no.reply, tc.T.en.offerKept);
  // Yes (or the button's own words): that one stop gives way, in its own slot and at its own time; every other stop stays.
  const y = await say('Replace that stop', { stops: FULL(), offer: r.offer });
  assert.ok(y.plan, y.reply);
  const now = at(y.plan);
  assert.deepEqual(now[old.key], [F.TOUR.id, old.start]);
  for (const [k, v] of Object.entries(before)) if (k !== old.key) assert.deepEqual(now[k], v, k);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(before).sort());
  assert.match(y.reply, new RegExp(`^Done\\. Swapped ${m[1]} for ${NAME} at ${m[3]}\\. It’s in ${TOWN2}, outside ${TOWN} \\(about [\\d.]+ km in a straight line\\)\\. Nothing else changed\\.$`));
  assert.deepEqual([y.swapBack.oldId, y.swapBack.newId], [old.id, F.TOUR.id], 'that swap can be undone by name later');
  assert.equal(y.plan.whereToStay.pick.id, F.HOTEL.id);
  // A day named that is full while another has room: asked, with the other day and its time; yes puts it there.
  const DAY1 = () => [...SCREEN(), { key: '1-late', id: F.PARK2.id, start: 930 }];
  const d = await say(`add ${NAME} on day 1`, { stops: DAY1() });
  assert.equal(d.plan, null);
  assert.match(d.reply, new RegExp(`^Day 1 has no free slot long enough for ${NAME}: it would clash with ${F.CAMP.name} at 1:30 PM\\. Put it on day 2 at [\\d:]+ [AP]M instead\\?$`));
  assert.deepEqual(d.offer, [`${NAME} [add ${F.TOUR.id} 2-afternoon]`]);
  assert.equal(d.choices[1].label, 'Put it on day 2');
  HONEST(d.reply);
  const dy = await say('yes', { stops: DAY1(), offer: d.offer });
  assert.equal(at(dy.plan)['2-afternoon'][0], F.TOUR.id); UNTOUCHED(dy, slots(DAY1()));
  assert.match(dy.reply, new RegExp(`^Added ${NAME} on day 2 at `));
  // A day and a part of it named, with a stop there: that stop is named, and asked about.
  const dm = await say(`add ${NAME} on day 2 in the morning`);
  assert.equal(dm.plan, null);
  assert.equal(dm.reply, `Day 2 has no free slot long enough for ${NAME} then: it would clash with ${F.PARK.name} at 9 AM. Replace that stop?`);
  assert.deepEqual(dm.offer, [`${NAME} [swap ${F.PARK.id}>${F.TOUR.id} named]`]);
  // With room on the day named, it goes there.
  const d1 = await say(`add ${NAME} on day 1`);
  assert.equal(at(d1.plan)['1-late'][0], F.TOUR.id); UNTOUCHED(d1, slots(SCREEN()));
  assert.match(d1.reply, new RegExp(`^Added ${NAME} on day 1 at `));
});

test('7. a place that cannot be added: the reason in plain words, one alternative named, nothing applied until asked', async () => {
  const before = slots(SCREEN());
  const same = (r) => { assert.equal(r.plan, null, r.reply); assert.deepEqual(r.changed, []); assert.equal(r.req, null); HONEST(r.reply); };
  // Not a listing of ours.
  const a = await say(`Please add Fancy Boat Co in ${TOWN2} to our trip.`);
  same(a);
  assert.match(a.reply, new RegExp(`^I don’t list “Fancy Boat Co” in ${TOWN2}, so I can’t add it\\. The nearest guided boat tour I list is ${NAME}, in ${TOWN2} \\(about [\\d.]+ km in a straight line\\)\\. Add it instead\\?$`));
  assert.deepEqual(a.offer, [`${NAME} [add ${F.TOUR.id}]`]);
  assert.deepEqual(a.choices.map((c) => c.label), [`View ${NAME}`, 'Add it instead']);
  const ay = await say('yes', { offer: a.offer });
  assert.equal(at(ay.plan)['2-afternoon'][0], F.TOUR.id); UNTOUCHED(ay, before);
  // Closed on both days by its own stored hours: said with the dates; the nearest other guided boat tour is offered.
  const c = await say(`add ${F.SHUT.name}`);
  same(c);
  assert.match(c.reply, new RegExp(`^${F.SHUT.name}’s listing shows it closed on Sat, Jun 12 and Sun, Jun 13, so I haven’t added it\\. The nearest other guided boat tour I list is ${NAME}, in ${TOWN2} \\(about [\\d.]+ km in a straight line\\)\\. Add it instead\\?$`));
  assert.deepEqual(c.offer, [`${NAME} [add ${F.TOUR.id}]`]);
  // Against the trip's own rule: it is one, or it is at one. Said, with how to lift the rule; nothing offered in its place.
  const w = await say(`add ${F.HOSTV.name}`);
  same(w);
  assert.equal(w.reply, `${F.HOSTV.name} is a ${HOST}, and you asked to avoid ${HOSTS}, so I haven’t added it. Say “${HOSTS} are fine now” to lift that.`);
  assert.ok(!w.offer);
  const wr = await say('please add Fixture Vine Room ADD to day 2');
  same(wr);
  assert.equal(wr.reply, `Fixture Vine Room ADD is at a ${HOST}, and you asked to avoid ${HOSTS}, so I haven’t added it. Say “${HOSTS} are fine now” to lift that.`);
  // A town and nothing to add: asked. The trip stays where it is.
  const t = await say(`add something in ${TOWN2}`);
  same(t);
  assert.equal(t.reply, `What would you like to add in ${TOWN2}? Your trip stays based in ${TOWN}.`);
  // "The one you suggested" on a plan that suggested nothing.
  const s = await say('add the one you suggested', { text: REQ_PLAIN, suggested: [] });
  same(s);
  assert.equal(s.reply, 'I haven’t suggested a place on this plan. Tell me its name and I’ll add it.');
  // A kind in a town with several, none of them suggested: asked which, by name; the name typed adds that one.
  const q = await say(`add a guided boat tour in ${TOWN2}`, { text: REQ_PLAIN, suggested: [] });
  same(q);
  assert.match(q.reply, new RegExp(`^In ${TOWN2} I list .+ or .+\\. Which one\\?$`));
  assert.ok(q.offer.length >= 2 && q.offer.every((o) => AV.ADD_TAG_RE.test(o)) && q.offer.includes(`${NAME} [add ${F.TOUR.id}]`), JSON.stringify(q.offer));
  const qy = await say(NAME, { text: REQ_PLAIN, suggested: [], offer: q.offer });
  assert.equal(at(qy.plan)['2-afternoon'][0], F.TOUR.id); UNTOUCHED(qy, before, REQ_PLAIN);
});

test('8. the shared copy says only what was accepted: not an offer, the stop once added, and the plan as it was after Undo', async () => {
  // An offer that was made and not taken changes nothing the copy is built from: no plan, no request, no words.
  const offer = await say('add a guided boat tour');
  assert.equal(offer.plan, null); assert.equal(offer.req, null); assert.equal(offer.text, undefined);
  // After it is accepted the plan has the stop, so the link the page builds from it (its stops' ids) has it too.
  const added = await say(MSG2);
  const base = added.plan;
  assert.ok(shareQuery(base).stops.split(',').includes(`venue:${F.TOUR.id}`));
  assert.ok(!shareQuery(base).ni, 'and no "not included" marker');
  const sAfter = shared(base);
  // The copy's own evidence, worked out again from the link: the boat tour is in it (a guided boat tour listed under
  // Outdoors is the tour asked for), so nothing about a tour is said to be missing.
  const evS = Object.fromEntries(sAfter.c.evidence.map((e) => [e.ask, e]));
  assert.equal(evS['kind:boat_tour'].status, 'verified'); assert.equal(evS['kind:boat_tour'].text, `Guided boat tour: ${NAME}.`);
  assert.ok(!evS['type:tour'], 'the tour asked for is said once');
  assert.ok(!sAfter.c.lines.some((l) => /not in this plan|no guided boat tour/i.test(l.text)), JSON.stringify(sAfter.lines));
  assert.ok(!/no guided boat tour listed/.test(sAfter.html));
  assert.equal(sAfter.lines[`no:${HOST}`], evOf(base)[`no:${HOST}`].text);
  assert.match(sAfter.lines.vegetarian, /^Vegetarian: all 3 meal stops list vegetarian options\./);
  assert.equal(sAfter.c.stay.id || sAfter.c.stayId, F.HOTEL.id);
  assert.deepEqual([sAfter.c.tripDates.start, sAfter.c.tripDates.end, sAfter.c.nights, sAfter.c.adults], ['2027-06-12', '2027-06-13', 1, 2]);
  assert.doesNotMatch(sAfter.html, /relax|available on|confirmed for/i);
  // Before acceptance and after Undo the page holds the plan without that stop: the same link either way, with the
  // boat tour honestly not in it and the same nearest place named.
  const prior = run(REQ);
  const q0 = { ...shareQuery(prior), stops: SCREEN().map((s) => `venue:${s.id}`).join(','), days: SCREEN().map((s) => s.key[0]).join(','), t: SCREEN().map((s) => s.start).join(','), ml: SCREEN().map((s) => ([F.VEG1.id, F.VEG2.id, F.VEG3.id].includes(s.id) ? 1 : 0)).join(''), ni: `boat_tour:n:${F.TOUR.id}`, nt: REGION };
  const c0 = app.tripShareContext(q0, 'en', new Date('2026-11-24T18:00:00Z')), h0 = app.tripShareContextHtml(c0, 'en');
  assert.ok(!q0.stops.split(',').includes(`venue:${F.TOUR.id}`) && !h0.includes('Guided boat tour: ') && !c0.lines.some((l) => /^Guided boat tour: /.test(l.text)), 'an offer not taken is never a stop');
  assert.ok(h0.includes(`There’s no guided boat tour listed in ${TOWN}`) && h0.includes(`The nearest is ${NAME} in ${TOWN2}.`));
  // Undo is the page's own: it puts back the snapshot it took before sending (stops, times, request, chips), and the
  // link is built again from that. The reply gives it what that needs, and no swap-back of its own.
  assert.ok(added.plan && added.req && added.changed.length === 1 && !added.swapBack && !added.back);
  assert.match(CHAT_PAGE, /var snap = chatSnapshot\(\)/);
  assert.match(CHAT_PAGE, /chat\.undo = planTouched \? snap : null;/);
  assert.match(CHAT_PAGE, /if \(touched\) \{ v4\.confirmed = wasConfirmed; v4\.saved = false; chat\.rendering = true; try \{ render\(false\); \} finally \{ chat\.rendering = false; \} syncUrl\(\); \}/);
});

test('9. a real request to move the trip still moves it; an add never does, whoever reads it', async () => {
  for (const m of [`change the trip to ${TOWN2}`, `base us in ${TOWN2}`]) {
    const stops = app.tripChatStops(SCREEN());
    const r = tc.rulesRead(m, stops, { regions: Object.keys(app.REGION_LABELS), regionLabels: app.REGION_LABELS, days: 2, request: REQ, add: { index: AV.buildIndex([{ id: F.TOUR.id, name: NAME, region: REGION2, type: 'outdoor' }], app.REGION_LABELS), tripRegions: [REGION], suggested: () => [], canList: () => true } });
    assert.deepEqual(r.ops.map((o) => [o.o, o.region]), [['town', REGION2]], m);
  }
  const mv = await say(`change the trip to ${TOWN2}`);
  assert.ok(mv.confirm || (mv.plan && new RegExp(`Now based in ${TOWN2}\\.`).test(mv.reply)), mv.reply);
  // An add in another town that these rules leave to the usual ones (a meal), read by the AI as a new base: no move.
  app.setTripChatReader(async () => ({ ok: true, ops: [{ o: 'town', region: REGION2, stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], date: null }], cant: null }));
  let r;
  try { r = await say(`Could you add a nice dinner in ${TOWN2} for us?`); } finally { app.setTripChatReader(null); }
  assert.doesNotMatch(r.reply, /Now based in/);
  assert.ok(!r.confirm);
  if (r.plan) { assert.deepEqual(r.plan.intent.regions, [REGION]); assert.ok(!(r.req.overrides || {}).baseRegion); }
});
