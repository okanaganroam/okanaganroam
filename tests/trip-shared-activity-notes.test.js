'use strict';
// Build My Trip: a tour stop's own notes, on the plan and on its shared copy (2026-11-24, Dayton's live test at 390px).
// The request:
//   "Plan a two-day anniversary getaway in Peachland for two adults on June 12–13, 2027. We want a lake-view dinner, a
//    relaxed boat tour and a hotel for one night. One of us is vegetarian and we would like to avoid wineries."
// then, in the chat:
//   "Can you add the guided boat tour in Kelowna you suggested? Keep all the other stops and avoid wineries."
// The plan added Luxury Lake Tours on day 2, its card said "2:15 PM · book a departure time", and the chat's reply said
// the operator also runs wine tours (pick an outing with no winery stop) and to check the date. A freshly opened shared
// copy said only "2:15 PM · Tour & Experience · Kelowna".
// Here: those notes belong to the stop (trip-activity-notes.js). They are worked out from the plan and the listing's
// stored facts, so the card, Details, the Book my trip sheet and the copied text say them on every load; the shared
// copy works them out again from the link as it already was (its stops, times, dates and asks), with nothing new in
// the link. Undo takes them away with the stop; adding it again brings the same words back. Nothing says a tour is
// booked or open on a date. Fixture listings only; no network.
// The same file runs on whistlerroam.com, where the kind ruled out is a brewery.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const AN = require('../trip-activity-notes.js');
const HP = require('../trip-honest-plan.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const HOST = WR ? 'brewery' : 'winery', HOSTS = WR ? 'breweries' : 'wineries';
const REGION = WR ? 'callaghan-valley' : 'peachland', TOWN = WR ? 'Callaghan Valley' : 'Peachland';
const REGION2 = WR ? 'whistler' : 'west-kelowna', TOWN2 = WR ? 'Whistler' : 'West Kelowna';
const AT = WR ? [50.139, -123.114] : [49.7791, -119.7367];
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const LAYOUT = fs.readFileSync(require.resolve('../trip-workspace-layout.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const REQ = `Plan a two-day anniversary getaway in ${TOWN} for two adults on June 12–13, 2027. We want a lake-view dinner, a relaxed boat tour and a hotel for one night. One of us is vegetarian and we would like to avoid ${HOSTS}.`;
// The same trip with no boat tour asked for: its plan suggests nothing.
const REQ_PLAIN = REQ.replace(', a relaxed boat tour', '');
const NAME = 'Fixture Luxury Lake Tours SAN';
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
  const v = app.createVenue({ region: REGION, address: `${700 + n} San Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 4000, longitude: AT[1], description: 'A place used only by the shared-activity-notes tests. Open all year.', slug: `san-test-${key.toLowerCase()}`, website: `https://san-${key.toLowerCase()}.example.com/`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const EAT = { type: 'restaurant', price: 2, hours: HOURS, vegetarian: 1, lake_view: 1 };
test.before(() => {
  mk('HOSTV', { type: HOST, name: `Fixture Lakeshore Estate ${WR ? 'Brewing Company' : 'Winery'} SAN`, address: `4300 Fixture Lakeshore Road, ${TOWN}, BC`, website: 'https://fixture-lakeshore-san.example.com/', hours: HOURS, latitude: AT[0] + 0.004, description: 'Tastings on a patio above the lake. Open all year.' });
  mk('HOSTREST', { ...EAT, price: 3, name: 'Fixture Vine Room SAN', address: `4300 Fixture Lakeshore Road, ${TOWN}, BC`, website: 'https://fixture-lakeshore-san.example.com/dining/', latitude: AT[0] + 0.0041,
    description: `The Vine Room is the fine-dining room at Fixture Lakeshore Estate ${WR ? 'Brewing Company' : 'Winery'}, with sweeping lake views and a vegetarian tasting menu. Open all year.` });
  mk('VEG1', { ...EAT, name: 'Fixture Lakeview Table SAN', description: 'A lakefront dining room with a vegetarian menu. Open all year.' });
  mk('VEG2', { ...EAT, name: 'Fixture Shoreline Kitchen SAN', description: 'A casual kitchen on the shoreline with vegetarian plates. Open all year.' });
  mk('VEG3', { ...EAT, name: 'Fixture Pier Bistro SAN', description: 'A bistro by the pier with vegetarian choices and lake views. Open all year.' });
  mk('TRAIL', { type: 'outdoor', name: 'Fixture Beach Trail SAN', hours: HOURS, description: 'A winding gravel path through the woods to a quiet sandy beach. Open all year.' });
  mk('CAMP', { type: 'outdoor', name: 'Fixture Lookout Loop SAN', hours: HOURS, lake_view: 1, description: 'A short loop trail to a lookout above the lake. Open all year.' });
  mk('PARK', { type: 'outdoor', name: 'Fixture Creek Park SAN', hours: HOURS, description: 'A shady creekside park with picnic tables and a short walking path. Open all year.' });
  mk('PARK2', { type: 'outdoor', name: 'Fixture Orchard Walk SAN', hours: HOURS, description: 'A flat walking path through old orchards. Open all year.' });
  mk('PARK3', { type: 'outdoor', name: 'Fixture Heritage Garden SAN', hours: HOURS, description: 'A small heritage garden with benches and a pond. Open all year.' });
  mk('PARK4', { type: 'outdoor', name: 'Fixture Marsh Boardwalk SAN', hours: HOURS, description: 'A boardwalk over a marsh with bird blinds. Open all year.' });
  // The next town: guided boat tours by their own words. The nearest one's name has a word the chat used to read as a
  // wish ("Luxury" -> fancier meals), and in the Okanagan its words also mention wine tours.
  // The next town: a guided boat tour, a Tours listing with no hours and no departure times of its own, whose words
  // also mention tours of the kind this trip rules out (the live listing's own facts on 2026-11-24).
  mk('TOUR', { region: REGION2, type: 'tour', name: NAME, hours: null, lake_view: 1, latitude: AT[0] + 0.045, address: `12 Fixture Marina Way, ${TOWN2}, BC`,
    description: `Captained private boat tours on the lake, from sightseeing cruises and fishing charters to ${WR ? 'brewery tours that arrive at lakeside breweries' : 'wine tours that arrive at lakeside wineries'} by water.` });
  // The same operator's words on a listing kept under Outdoors (how the live listing was stored until 2026-11-23).
  mk('TOUROUT', { region: REGION2, type: 'outdoor', name: 'Fixture Sunset Boat Tours SAN', hours: null, lake_view: 1, latitude: AT[0] + 0.07, address: `90 Fixture Marina Way, ${TOWN2}, BC`,
    description: `Captained private boat tours on the lake, from sightseeing cruises to ${WR ? 'brewery tours that arrive at lakeside breweries' : 'wine tours that arrive at lakeside wineries'} by water.` });
  // A Tours listing with departure times of its own, and no word of the kind ruled out.
  mk('DEP', { region: REGION2, type: 'tour', name: 'Fixture Harbour Pontoon Cruises SAN', hours: HOURS, latitude: AT[0] + 0.06, address: `40 Fixture Harbour Road, ${TOWN2}, BC`, description: 'Fixture Harbour Pontoon Cruises runs private, captained pontoon tours on the lake. Leaves 9 AM and 2 PM daily. Open all year.' });
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Lakeside Hotel SAN' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.HOTEL.id, JSON.stringify({ max_guests: 4, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-lakeside-san.html', own: 'https://san-hotel.example.com/book' } }), '2026-11-24T00:00:00Z', 'test-san');
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
const shareQuery = (p, list = tc.planStops(p)) => {
  const asks = HP.shareAsks(p), ni = HP.shareNotIncluded(p);
  const mealIds = new Set(((p.evidence.find((e) => e.ask === 'vegetarian') || {}).stops || []).map((s) => s.id));
  return { stops: list.map((s) => `venue:${s.id}`).join(','), days: list.map((s) => s.day).join(','), t: list.map((s) => s.start).join(','), td: '2027-06-12_2027-06-13', ts: 'r', stay: String(F.HOTEL.id), nights: '1', ad: '2', rm: '1', ra: '1',
    asks: asks.join(','), ml: list.map((s) => (mealIds.has(s.id) ? 1 : 0)).join(''), ...(ni.length ? { ni: ni.join(','), nt: REGION } : {}) };
};
const shared = (p) => { const c = app.tripShareContext(shareQuery(p), 'en', new Date('2026-11-24T18:00:00Z')); return { c, html: app.tripShareContextHtml(c, 'en'), lines: Object.fromEntries(c.lines.map((l) => [l.ask, l.text])) }; };


// ---------- the words ----------
const WHAT = WR ? 'brewery tours' : 'wine tours';
const TIME_LINE = 'Suggested time · book a departure time with the operator';
const ALSO = `Also runs ${WHAT}: pick an outing with no ${HOST} stop.`;
const DATE = 'Check your date with the operator.';
const NOTE = `${ALSO} ${DATE}`;
// Nothing a note says may read as a booking made, a place held or a date that is open.
const NOT_BOOKED = (text) => assert.doesNotMatch(String(text), /\bbooked\b|\bconfirmed\b|\breserved\b|\bavailable\b|\bavailability\b|\bguaranteed\b|réservé[es]?\b|confirmé[es]?\b|disponible/i, String(text));
const rowOf = (p, id) => (p.schedule || []).find((r) => r.venueId === id);
const actOf = (p, id) => (rowOf(p, id) || {}).activity || null;
const NOW = new Date('2026-11-24T18:00:00Z');
const ctxOf = (q, lang = 'en') => app.tripShareContext(q, lang, NOW);
const pageOf = (q, lang = 'en') => app.renderMyTripPage({ lang, share: app.tripShareSummary(q, lang), context: ctxOf(q, lang) });
// What the shared page is given for its stops: the ACT_NOTES it prints beside each one.
// The plan asked for again the way the page does it: the request the chat handed back (its pins and all).
const reload = ({ locks, soft, ...req }) => { const v = app.parseTripPlanBody({ ...req, trustedPins: Object.keys(req.pinned || {}) }, { v4: true, stays: true }); assert.ok(v.value, JSON.stringify(v.error)); return app.runTripPlanRequest({ ...v.value, v4: true }, true); };
// The plan on the traveller's screen before the add (the stops of SCREEN(), each in its slot at its time), and its link.
const planBefore = (text = REQ) => reload({ text, seed: 0, pinned: Object.fromEntries(SCREEN().map((s) => [s.key, s.id])) });
const linkBefore = (p) => shareQuery(p, SCREEN().map((s) => ({ ...s, day: Number(s.key[0]) })));
// A link without one stop: its entry taken out of stops, days, t and ml; everything else as it is.
const without = (q, ref) => { const i = q.stops.split(',').indexOf(ref), cut = (v, sep) => v.split(sep).filter((_, n) => n !== i).join(sep); return { ...q, stops: cut(q.stops, ','), days: cut(q.days, ','), t: cut(q.t, ','), ml: cut(q.ml, '') }; };
const actNotesIn = (html) => JSON.parse(/var ACT_NOTES = (\{.*?\});\n/.exec(html)[1]);

test('1. the rule: which stops get which note, from the listing’s facts, the time, the trip’s rules and its dates', () => {
  const SET = ['wine_tour', 'boat_tour', 'atv', 'rentals'];
  const n = (o) => AN.notes({ tourKindSet: SET, ...o });
  // A Tours listing at a time that is not its own departure: the time is a suggestion; with dates, the date to check.
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour'], start: 855, dated: true }).lines, [TIME_LINE, DATE]);
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour'], start: 855, dated: false }).lines, [TIME_LINE]);
  // …that also runs tours of a kind the trip rules out: one more short sentence, only with that rule.
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour', 'wine_tour'], start: 855, exclusions: ['winery'], dated: true }).lines, [TIME_LINE, 'Also runs wine tours: pick an outing with no winery stop. Check your date with the operator.']);
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour', 'wine_tour'], start: 855, exclusions: ['pub', 'beach'], dated: true }).lines, [TIME_LINE, DATE]);
  // A brewery tour is told by the listing's own words (the planner has no such kind).
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour'], text: 'Lake cruises and brewery tours by boat.', start: 855, exclusions: ['brewery'], dated: false }).lines, [TIME_LINE, 'Also runs brewery tours: pick an outing with no brewery stop.']);
  assert.equal(AN.alsoRuns('brewery', [], 'A patio beside the brewery, with tours of the lake.'), false);
  assert.equal(AN.alsoRuns('brewery', [], 'Craft beer tours and tastings.'), true);
  assert.equal(AN.alsoRuns('winery', ['boat_tour'], 'Wine tours by water.'), false, 'a wine tour is the planner’s own kind, by the listing’s facts');
  assert.equal(AN.alsoRuns('pub', ['wine_tour'], 'pub tours'), false);
  // A time that is one of its own stored departures is not a suggestion; the plan's own word on it counts the same.
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour'], start: 540, departures: [540, 840], dated: true }).lines, [DATE]);
  assert.equal(n({ type: 'tour', kinds: ['boat_tour'], start: 540, departures: [540, 840], dated: false }), null);
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour'], start: 600, departures: [540, 840], dated: false }).lines, [TIME_LINE]);
  assert.equal(n({ type: 'tour', kinds: ['boat_tour'], start: 600, departure: true, dated: false }), null);
  // No time in the link: nothing is said about a time.
  assert.deepEqual(n({ type: 'tour', kinds: ['boat_tour'], start: null, dated: true }).lines, [DATE]);
  // Rentals only: not an outing an operator runs. A listing under Outdoors that is one by its own facts: no "book a
  // departure" (the plan's own rule is for Tours listings), but the date and the rule are said.
  assert.equal(n({ type: 'tour', kinds: ['rentals'], tourKinds: ['rentals'], start: 600, dated: true }), null);
  assert.equal(n({ type: 'outdoor', kinds: ['rentals'], start: 600, dated: true }), null);
  assert.deepEqual(n({ type: 'outdoor', kinds: ['boat_tour', 'wine_tour'], start: 600, exclusions: ['winery'], dated: true }).lines, ['Also runs wine tours: pick an outing with no winery stop. Check your date with the operator.']);
  // Never a restaurant, a park, a winery, a museum.
  for (const type of ['restaurant', 'outdoor', 'winery', 'indoor', 'cafe', 'stay']) assert.equal(n({ type, kinds: type === 'outdoor' ? ['walk'] : [], start: 600, exclusions: ['winery'], dated: true }), null, type);
  // A stop that already carries a suggested-time note of its own (a class, a session) does not get a second one.
  assert.equal(n({ type: 'tour', kinds: ['cooking'], start: 600, scheduled: true, dated: true }), null);
  // French, and never a word that says booked.
  const fr = n({ type: 'tour', kinds: ['boat_tour', 'wine_tour'], start: 855, exclusions: ['winery'], dated: true });
  assert.deepEqual(fr.linesFr, ['Heure suggérée · réservez un départ auprès de l’exploitant', 'Propose aussi des tours des vignobles : choisissez une sortie sans arrêt dans un vignoble. Vérifiez votre date auprès de l’exploitant.']);
  for (const l of [...fr.lines, ...fr.linesFr]) { NOT_BOOKED(l); assert.ok(l.length <= 140, l); }
});

test('2. the exact request and chat message: the stop carries its notes on the plan, and a fresh shared copy says them beside it', async () => {
  const before = slots(SCREEN());
  const p0 = planBefore();
  assert.deepEqual(tc.planStops(p0).map((s) => [s.key, s.id]), SCREEN().map((s) => [s.key, s.id]), 'the plan on screen before the add');
  const q0 = linkBefore(p0), c0 = ctxOf(q0);
  assert.equal(c0.actNotes, undefined, 'no tour on the plan: no tour note on its copy');
  const r = await say(MSG1);
  assert.ok(r.plan, r.reply);
  const now = at(r.plan), start = now['2-afternoon'][1];
  assert.equal(now['2-afternoon'][0], F.TOUR.id);
  UNTOUCHED(r, before);
  // The chat's reply, as before: the same two cautions, in a sentence.
  assert.match(r.reply, new RegExp(`^Added ${NAME} on day 2 at ${clockOf(start)}\\. It’s in ${TOWN2}, outside ${TOWN} \\(about [\\d.]+ km in a straight line\\)\\. Check your date with the operator\\. It also runs ${WHAT}: pick an outing with no ${HOST} stop\\. Nothing else changed\\.$`));
  HONEST(r.reply);
  // ---- the plan: the notes are the stop's own (its schedule row), not the reply's ----
  const row = rowOf(r.plan, F.TOUR.id), a = row.activity;
  assert.equal(row.bookDeparture, true, 'the planner’s own "book a departure time"');
  assert.deepEqual([a.suggested, a.also, a.date], [true, HOST, true]);
  assert.deepEqual(a.lines, [TIME_LINE, NOTE]);
  assert.equal(a.note, NOTE);
  assert.equal(a.book, 'book a departure time with the operator');
  for (const l of [...a.lines, ...a.linesFr]) NOT_BOOKED(l);
  // No other stop of this plan gets one (trails, parks, restaurants).
  assert.deepEqual((r.plan.schedule || []).filter((x) => x.activity).map((x) => x.venueId), [F.TOUR.id]);
  // ---- the shared copy: worked out again from the link, which carries nothing new for it ----
  const q = shareQuery(r.plan);
  assert.deepEqual(Object.keys(q).sort(), Object.keys(q0).filter((k) => !['ni', 'nt'].includes(k)).sort(), 'no new link parameter');
  assert.match(q.asks, new RegExp(`\\bno:${HOST}\\b`)); assert.match(q.asks, /\bvegetarian\b/);
  const c = ctxOf(q);
  assert.deepEqual(c.actNotes, { [`venue:${F.TOUR.id}`]: { lines: [TIME_LINE, NOTE], suggested: true } });
  // The page prints them beside that stop, under its time: the suggested-time line, then what to pick and check.
  const html = pageOf(q);
  assert.deepEqual(actNotesIn(html), c.actNotes);
  assert.match(html, /var an = !mine && ACT_NOTES\[x\.s\.ref\], actHtml = an && an\.lines \? an\.lines\.map\(function\(l, i\)\{ return '<p class="mt-meta mt-act" data-mt-act="' \+ \(an\.suggested && i === 0 \? 'time' : 'note'\) \+ '">' \+ esc\(l\) \+ '<\/p>'; \}\)\.join\(''\) : '';/);
  assert.match(html, /'<p class="mt-meta">' \+ esc\(meta\) \+ '<\/p>' \+ \(skHtml \? '<p class="mt-meta">' \+ skHtml \+ '<\/p>' : ''\) \+ actHtml \+ needHtml \+ notice \+ noPin \+ bk/);
  // The copy still says nothing is booked, and the notes never say otherwise; one booking link per stop at most.
  assert.match(html, /Nothing in it is booked\./);
  for (const l of c.actNotes[`venue:${F.TOUR.id}`].lines) NOT_BOOKED(l);
  assert.equal((html.match(/var bk = /g) || []).length, 1);
  // The other stops, the hotel, the dates, the diet and the rule are as on the copy before the add.
  assert.equal(c.stay.id, F.HOTEL.id); assert.equal(c0.stay.id, F.HOTEL.id);
  assert.deepEqual(c.tripDates, c0.tripDates); assert.deepEqual([c.tripDates.start, c.tripDates.end], DATES);
  assert.equal(c.adults, 2);
  const L = Object.fromEntries(c.lines.map((l) => [l.ask, l.text])), L0 = Object.fromEntries(c0.lines.map((l) => [l.ask, l.text]));
  assert.equal(L.vegetarian, L0.vegetarian); assert.match(L.vegetarian, /^Vegetarian: /);
  assert.equal(L[`no:${HOST}`], L0[`no:${HOST}`]); assert.match(L[`no:${HOST}`], new RegExp(`^Avoiding ${HOSTS}`));
  // The link itself: the link from before with that one stop's own entries added, and nothing else different.
  const { ni, nt, ...q0rest } = q0;
  assert.deepEqual(without(q, `venue:${F.TOUR.id}`), q0rest);
  // French copy: the same notes in French.
  assert.deepEqual(ctxOf(q, 'fr').actNotes[`venue:${F.TOUR.id}`].lines, a.linesFr);
});

test('3. add, Undo, add again: the notes come and go with the stop; the link after Undo is the link from before', async () => {
  const p0 = planBefore(), q0 = linkBefore(p0);
  const r1 = await say(MSG1);
  const q1 = shareQuery(r1.plan), a1 = actOf(r1.plan, F.TOUR.id);
  assert.ok(a1 && ctxOf(q1).actNotes[`venue:${F.TOUR.id}`]);
  // Undo puts the plan from before back on screen (the page keeps it): asked again, it is the same plan, with no tour
  // stop, no note anywhere, and the same link as before the add.
  // (The page's Undo puts back the plan it kept; here that plan is asked for again.)
  const pU = planBefore(), qU = linkBefore(pU);
  assert.deepEqual(qU, q0);
  const { ni, nt, ...q0rest } = q0;
  assert.deepEqual(without(q1, `venue:${F.TOUR.id}`), q0rest, 'the add changed the link by that stop’s own entries only');
  assert.ok(!(pU.schedule || []).some((x) => x.activity));
  assert.equal(ctxOf(qU).actNotes, undefined);
  assert.equal(JSON.stringify(actNotesIn(pageOf(qU))), '{}');
  // Added again (by its name this time): the same slot, the same time, the same words, the same link as the first add.
  const r2 = await say(MSG2);
  assert.deepEqual(at(r2.plan), at(r1.plan));
  assert.deepEqual(actOf(r2.plan, F.TOUR.id), a1);
  assert.deepEqual(shareQuery(r2.plan), q1);
  assert.deepEqual(ctxOf(shareQuery(r2.plan)).actNotes, ctxOf(q1).actNotes);
  // A later turn on the plan with the tour in it keeps the notes on the stop (they are not the reply's).
  const r3 = await say('What time is the boat tour?', { stops: screenOf(r1.plan) });
  if (r3.plan) assert.deepEqual(actOf(r3.plan, F.TOUR.id), a1);
  // The same plan asked for again with the stop pinned where it is (a reload of the page): the notes are there.
  const again = reload(r1.req);
  assert.deepEqual(at(again), at(r1.plan));
  assert.deepEqual(actOf(again, F.TOUR.id), a1);
});

test('4. a tour stop on a trip without that rule: the time and the date only', async () => {
  const text = REQ.replace(` and we would like to avoid ${HOSTS}`, '');
  assert.ok(!/avoid/.test(text));
  const r = await say(MSG2, { text, suggested: null });
  assert.ok(r.plan, r.reply);
  assert.doesNotMatch(r.reply, /also runs/i);
  assert.deepEqual(actOf(r.plan, F.TOUR.id).lines, [TIME_LINE, DATE]);
  const q = shareQuery(r.plan);
  assert.doesNotMatch(q.asks, /no:/);
  assert.deepEqual(ctxOf(q).actNotes, { [`venue:${F.TOUR.id}`]: { lines: [TIME_LINE, DATE], suggested: true } });
  // The same stop with no dates in the link: the suggested time only.
  const { td, ts, ...undated } = q;
  assert.deepEqual(ctxOf(undated).actNotes, { [`venue:${F.TOUR.id}`]: { lines: [TIME_LINE], suggested: true } });
});

test('5. other tours: one under Outdoors gets no "book a departure"; one at its own stored departure time is not a suggestion', async () => {
  // The listing kept under Outdoors: the planner's card shows its time plainly, and so does the copy; the rule and
  // the date are still said.
  const r = await say(`Please add ${F.TOUROUT.name} in ${TOWN2} to our trip.`);
  assert.ok(r.plan, r.reply);
  const row = rowOf(r.plan, F.TOUROUT.id);
  assert.ok(!row.bookDeparture);
  assert.deepEqual(row.activity.lines, [NOTE]);
  assert.deepEqual(ctxOf(shareQuery(r.plan)).actNotes, { [`venue:${F.TOUROUT.id}`]: { lines: [NOTE] } });
  // A Tours listing with "Leaves 9 AM and 2 PM daily": at 2 PM the time is its own departure; at 3 PM it is not.
  const base = { stops: `venue:${F.VEG1.id},venue:${F.DEP.id}`, days: '1,1', td: '2027-06-12_2027-06-13', ts: 'r', ad: '2' };
  assert.deepEqual(ctxOf({ ...base, t: '720,840' }).actNotes, { [`venue:${F.DEP.id}`]: { lines: [DATE] } });
  assert.deepEqual(ctxOf({ ...base, t: '720,900' }).actNotes, { [`venue:${F.DEP.id}`]: { lines: [TIME_LINE, DATE], suggested: true } });
  // A restaurant, a park and a winery never get one.
  assert.equal(ctxOf({ stops: `venue:${F.VEG1.id},venue:${F.PARK.id},venue:${F.HOSTV.id}`, days: '1,1,1', t: '720,840,960', td: '2027-06-12_2027-06-13', ts: 'r', ad: '2', asks: `no:${HOST}` }).actNotes, undefined);
});

test('6. links made before this: the oldest form still opens, and an older link with times gains the notes with nothing added to it', () => {
  // Stops only, and stops by day: no context at all. The page renders, with no notes.
  for (const q of [{ stops: `venue:${F.VEG1.id},venue:${F.TOUR.id}` }, { stops: `venue:${F.VEG1.id},venue:${F.TOUR.id}`, days: '1,2' }]) {
    const html = pageOf(q);
    assert.match(html, /id="mtList"|mt-list/);
    assert.equal(JSON.stringify(actNotesIn(html)), '{}');
    assert.doesNotMatch(html, /data-mt-facts/);
  }
  // A link from before with its times, the party and the rule (start= for the date, as older links carried it).
  const old = { stops: `venue:${F.VEG1.id},venue:${F.TOUR.id}`, days: '1,2', t: '720,855', start: '2027-06-12', ad: '2', asks: `vegetarian,no:${HOST}` };
  const c = ctxOf(old);
  assert.deepEqual(c.actNotes, { [`venue:${F.TOUR.id}`]: { lines: [TIME_LINE, NOTE], suggested: true } });
  assert.match(pageOf(old), /Nothing in it is booked\./);
  // A listing that is gone, or an id that never was: the copy stands, without a note for it.
  assert.equal(ctxOf({ stops: 'venue:99999991', days: '1', t: '855', ad: '2' }).actNotes, undefined);
});

test('7. the plan’s card, Details, the Book my trip sheet and the copied text say the stop’s own words', () => {
  // The time on the card: "2:15 PM · book a departure time" whenever the stop's note says the time is a suggestion.
  assert.match(PAGE, /if \(hit && \(r\.bookDeparture \|\| \(r\.activity && r\.activity\.suggested\)\)\) return \(typeof r\.startMinutes === 'number' \? clockLabel\(r\.startMinutes\) \+ ' · ' : ''\) \+ \(lang\(\) === 'fr' \? 'départ à réserver' : 'book a departure time'\);/);
  // The card's one short line under it, from the stop's row; Details prints every line.
  assert.match(PAGE, /function v4Act\(s, key\)\{\s+var r = s && s\.venue \? v4Row\(s, key\) : null, a = r && r\.activity/);
  assert.match(PAGE, /'<p class="v4-note v4-act-note" data-v4-act="' \+ esc\(note\) \+ '">' \+ esc\(note\) \+ '<\/p>'/);
  assert.ok(LAYOUT.includes("var act=typeof v4Act==='function'?v4Act(s,key):null;\n    if(act&&act.html)note={url:note?note.url:'',html:(note?note.html:'')+act.html};"));
  assert.match(PAGE, /if \(act && act\.lines\.length\) out \+= '<p class="v4-need" data-v4-act-more>'/);
  // The sheet: the stop under "Times to check", with its day, its suggested time and the same words; a link to its
  // own page only (its booking step, when its listing stores a link, is the one in the list above).
  assert.match(PAGE, /'<li data-v4-act-row="' \+ esc\(x\.s\.venue\.id\) \+ '">/);
  assert.match(PAGE, /esc\(vt\('day'\) \+ ' ' \+ x\.day \+ ' · ' \+ x\.a\.sheet\)/);
  assert.match(PAGE, /\(fr \? 'suggéré à ' : 'suggested '\) \+ clockLabel\(r\.startMinutes\)/);
  const rowHtml = /var actRows = acts\.map\(function\(x\)\{[\s\S]*?\}\)\.join\(''\);/.exec(PAGE)[0];
  assert.doesNotMatch(rowHtml, /data-track="booking"|t3StepLinkHtml|mt-book/);
  // The copied text: the card's time ("2:15 PM · book a departure time <name>") and then the stop's note on its own line.
  assert.match(PAGE, /var an = li\.querySelector\('\[data-v4-act\]'\);\s+if \(an && an\.getAttribute\('data-v4-act'\)\) rows\.push\('  ' \+ an\.getAttribute\('data-v4-act'\)\);/);
  // Nothing in the share link is for these notes (the copy works them out again).
  const linkFn = /function v4ShareContext\(list\)\{[\s\S]*?\n  \}\n/.exec(PAGE)[0];
  assert.doesNotMatch(linkFn, /activity|v4Act/);
});
