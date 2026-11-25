'use strict';
// Build My Trip: the party, who does what, and every visit (2026-11-24, Dayton's live test at 390px). The request:
//   "Plan a 3-day SilverStar winter trip for 2 adults and a 10-year-old from February 12 to February 14, 2027. Two of
//    us are beginners and want ski lessons; one adult does not ski and would prefer a spa or another relaxing
//    activity. We need a hotel for two nights and family-friendly dinners."
// 1. the hotel card said "1 adult, 1 kid": "Two of us" was read as the party's size, less the child;
// 2. nothing was said for the adult who does not ski (the spa was read as a spa to avoid), and "What can the adult who
//    does not ski do while the other two are skiing?" got "Which stop do you mean?";
// 3. the planner showed 8 stops and its shared copy 5: a place visited on more than one day was sent once.
// Here: the party is what the request says in total, and words about some of the party never change it
// (trip-party-split.js); the plan says it is one schedule for everyone and what the listings show for the one not
// skiing; the chat answers the question from the same facts and changes nothing; every visit is a stop of the share
// link, with its own day and time (trip-visits.js). Fixture listings only; no network; the word rules only (the AI
// reader is shown never to be asked). The same file runs on whistlerroam.com.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const S = require('../trip-party-split.js');
const V = require('../trip-visits.js');
const HP = require('../trip-honest-plan.js');
const LAYOUT = require('../trip-workspace-layout.js');
const P = require('../trip-planner.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
// The fixture town (its listings are all made here), the next town over (the fixture spa), and the town of the real
// request (the planner's own listings).
const REGION = WR ? 'pemberton' : 'silverstar', TOWN = WR ? 'Pemberton' : 'SilverStar';
const OTHER = WR ? 'mount-currie' : 'vernon', OTHER_TOWN = WR ? 'Mount Currie' : 'Vernon';
const TRIP_REGION = WR ? 'whistler' : 'silverstar', TRIP_TOWN = WR ? 'Whistler' : 'SilverStar';
const AT = WR ? [50.3192, -122.8035] : [50.3585, -119.0610];
const TRIP_AT = WR ? [50.1163, -122.9574] : AT;
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const SERVER = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');
// The planner page's own copy of the visit code, run as the browser runs it.
const VISITS = new Function(`${V.CLIENT_SRC}; return tripVisitsApi;`)();

const REQ = `Plan a 3-day ${TRIP_TOWN} winter trip for 2 adults and a 10-year-old from February 12 to February 14, 2027. Two of us are beginners and want ski lessons; one adult does not ski and would prefer a spa or another relaxing activity. We need a hotel for two nights and family-friendly dinners.`;
const FIX_REQ = REQ.replace(TRIP_TOWN, TOWN);
const FIX_MSG = 'There are 2 adults and 1 child staying in the hotel for both nights. Please correct the hotel guests and keep the itinerary the same';
const ASK_MSG = 'What can the adult who does not ski do while the other two are skiing?';
const DATES = ['2027-02-12', '2027-02-13', '2027-02-14'];

const made = [], stays = [];
const F = {};
const DAYS7 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOURS = JSON.stringify(Object.fromEntries(DAYS7.map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, km, o) => {
  const n = made.length + 1;
  const at = o.at || AT; delete o.at;
  const v = app.createVenue({ region: REGION, address: `${900 + n} Party Test Road, ${TOWN}, BC`, latitude: at[0] + km * 0.009, longitude: at[1], hours: HOURS, kid_friendly: 1, description: 'A place used only by the party and visits tests. Open all year.', slug: `party-test-${key.toLowerCase()}`, website: `https://party-${key.toLowerCase()}.example.com/`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const mkStay = (key, o) => {
  const v = mk(key, 0, { type: 'stay', cuisine: 'hotel', hours: null, ...o });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ max_guests: 6, confidence: 'high', booking: { booking_com: `https://www.booking.com/hotel/ca/party-test-${key.toLowerCase()}.html`, expedia: `https://www.expedia.ca/Town-Hotels-Party-Test-${key}.h9301.Hotel-Information`, own: `https://party-${key.toLowerCase()}.example.com/book` } }), '2026-11-24T00:00:00Z', 'test-party');
  stays.push(v.id); return v;
};
test.before(() => {
  mkStay('HOTEL', { name: 'Fixture Snowside Lodge PS' });
  if (WR) mkStay('HOTELW', { name: 'Fixture Village Lodge PS', region: TRIP_REGION, at: TRIP_AT, address: '901 Party Test Road, Whistler, BC' });
  mk('HILL', 0.5, { type: 'outdoor', name: 'Fixture Mountain Resort PS', description: 'A ski resort used only by the party tests: alpine skiing and snowboarding in winter. Open all year.' });
  mk('LUNCH', 0.6, { type: 'restaurant', price: 2, name: 'Fixture Pine Social PS' });
  mk('DINNER', 0.7, { type: 'restaurant', price: 2, name: 'Fixture Den Bistro PS' });
  mk('CAFE', 0.4, { type: 'cafe', price: 1, name: 'Fixture Bakery Cafe PS' });
  // The nearest listed spa, in the next town (1.5 km from the hill). Its kind is its own name's.
  mk('SPA', 1.5, { type: 'indoor', region: OTHER, name: 'Fixture Thermal Spa PS', address: `915 Party Test Road, ${OTHER_TOWN}, BC`, kid_friendly: 0, description: 'A thermal spa with a sauna and steam room, used only by the party tests. Open all year.' });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of stays) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

// The plan on the traveller's screen: the hill each morning, the same bistro on two evenings AND for lunch on day 2
// (twice in one day). 8 visits of 4 listings.
const SCREEN = () => [
  { key: '1-morning', id: F.HILL.id, start: 540 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-evening', id: F.DINNER.id, start: 1080 },
  { key: '2-morning', id: F.HILL.id, start: 555 }, { key: '2-midday', id: F.DINNER.id, start: 735 }, { key: '2-evening', id: F.DINNER.id, start: 1110 },
  { key: '3-morning', id: F.HILL.id, start: 570 }, { key: '3-midday', id: F.CAFE.id, start: 750 },
];
const byId = (id) => Object.values(F).find((v) => v.id === id);
const on = (removed = []) => SCREEN().filter((s) => !removed.includes(s.key));
// The plan as the page holds it: its days and its schedule rows (one row per visit, in plan order).
const planDays = () => [1, 2, 3].map((d) => ({ day: d, stops: SCREEN().filter((s) => Number(s.key[0]) === d).map((s) => ({ daypart: s.key.slice(2), venue: { id: s.id, name: byId(s.id).name } })) }));
const planRows = () => SCREEN().map((s) => ({ day: Number(s.key[0]), venueId: s.id, startMinutes: s.start }));
const removedMap = (keys) => Object.fromEntries(keys.map((k) => [k, SCREEN().find((s) => s.key === k).id]));
// The share link the page makes: its stop buttons in page order (a removed stop has none), each visit's own time.
const linkOf = (removedKeys = []) => {
  const btns = on(removedKeys).map((s) => ({ ref: `venue:${s.id}`, key: s.key, day: Number(s.key[0]), name: byId(s.id).name }));
  const list = VISITS.list(btns, 30);
  const times = list.map((x) => { const d = Number(x.key[0]), id = Number(x.ref.split(':')[1]); const r = VISITS.row(planRows(), d, id, VISITS.nth(planDays().find((q) => q.day === d).stops, x.key.slice(2), id)); return r ? r.startMinutes : ''; });
  return { list, q: { stops: list.map((x) => x.ref).join(','), days: list.map((x) => x.day).join(','), t: times.join(','), td: '2027-02-12_2027-02-14', ts: 'r', stay: String(F.HOTEL.id), nights: '2', ad: '2', kids: '1', ka: '10', rm: '1', ra: '1', asks: 'kind:ski_lessons,kind:spa,kid_friendly', ni: `ski_lessons:f,spa:f:${F.SPA.id}`, nt: REGION, ps: '1a.s' } };
};
const say = async (message, o = {}) => {
  const removed = o.removed || [];
  const body = { message, lang: o.lang || 'en', plan: { text: o.text || FIX_REQ, seed: 0, excludeVenueIds: [], ...(o.stay ? { stay: o.stay } : {}) }, locks: {}, removed, stops: on(removed), dayDates: DATES, tripSource: 'request', stayId: F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) };
  const v = app.parseTripChatBody(body, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const stopsFor = () => SCREEN().map((s) => { const v = byId(s.id); const role = v.type === 'restaurant' ? (/midday/.test(s.key) ? 'lunch' : 'dinner') : ''; return { key: s.key, id: v.id, name: v.name, type: v.type, day: Number(s.key[0]), start: s.start, role, badges: [] }; });
const NOTHING_ELSE = (r, also = []) => {
  assert.equal(r.plan, null, 'the trip is not planned again');
  assert.equal(r.req, null);
  assert.deepEqual(r.actions, { remove: [], keep: [] }, 'no stop is removed or kept');
  for (const k of ['stayPref', 'stayForce', 'stayDates', 'text', 'needPatch', 'needDrop', 'card', 'confirm', ...also]) assert.equal(r[k], undefined, `${k} must not change`);
};
// Nothing here may say a lesson, a spa, a room or a booking is confirmed or available, give a travel time, or call a
// place relaxing or suitable.
const HONEST = (text) => {
  assert.doesNotMatch(text, /\bavailable\b|\bavailability\b|\bconfirmed\b|\bbooked\b|\bminutes?\b|\bdrive\b|suitable|\brelaxing\b|\bages?\b/i, text);
  assert.ok((text.match(/\?/g) || []).length <= 1, `one question at most: ${text}`);
};
// A stay link as the booking site reads it (a Stay22 link carries the hotel's own link inside it, encoded).
const dec = (u) => { let x = String(u); for (let i = 0; i < 2; i++) { try { x = decodeURIComponent(x); } catch (e) { break; } } return x; };
const run = (text, stay) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true }).value, v4: true }, true);

test('1. the party is what the request says in total; words about some of the party never change it', () => {
  // Dayton's request, as typed.
  assert.deepEqual(P.requestParty(REQ), { kids: 1, adults: 2 });
  assert.deepEqual(P.requestKidAgeList(REQ.toLowerCase().replace(/-/g, ' ')), [10]);
  // His correction message says the same party.
  assert.deepEqual(P.requestParty(FIX_MSG), { kids: 1, adults: 2 });
  // Explicit totals, in English and French, with sub-groups said before or after them.
  for (const [text, want] of [
    ['2 adults and a 10-year-old. Two of us are beginners; one adult does not ski', { kids: 1, adults: 2 }],
    ['Two of us are beginners; we are 2 adults and a child aged 9', { kids: 1, adults: 2 }],
    ['family of four, one of us is vegetarian', { adults: 2, kids: 2 }],
    ['Three of us ski and one of us does not. Family of four', { adults: 2, kids: 2 }],
    ['2 adults, 2 kids ages 4 and 7. One adult does not ski', { kids: 2, adults: 2 }],
    ['4 adults and 2 kids, the six of us', { kids: 2, adults: 4 }],
    ['the six of us with two kids', { kids: 2, adults: 4 }],
    ['we are 5 people with 2 kids', { kids: 2, adults: 3 }],
    ['two adults don’t ski, 4 adults in all', { adults: 4 }],
    ['kelowna weekend for 4, one of us is sober', { adults: 4 }],
    ['2 adults and a 10-year-old. The other two want lessons', { kids: 1, adults: 2 }],
    ['one of the adults doesn’t ski. 3 adults', { adults: 3 }],
    ['deux adultes et un enfant de 10 ans; un adulte ne skie pas', { kids: 1, adults: 2 }],
    ['nous sommes 6 dont 2 enfants', { kids: 2, adults: 4 }],
    // As they always read: a late arrival, a diet, an allergy, a couple, one adult said as the party.
    ['a girls getaway for three adults from October 8 to October 10. Our friend arrives only on October 9', { adults: 3 }],
    ['three adults; one person has a peanut allergy', { adults: 3 }],
    ['6 friends, one person does not drink', { adults: 6 }],
    ['one adult and a 15-year-old', { kids: 1, adults: 1 }],
    ['just the two of us', { adults: 2 }],
    ['the two of us want a spa weekend', { adults: 2 }],
    ['a weekend for two', { adults: 2 }],
    ['4 friends, girls weekend', { adults: 4 }],
    ['two kids, 6 and 9', { kids: 2 }],
  ]) assert.deepEqual(P.requestParty(text), want, text);
  // Some of the party, with no total said: nobody's count (it used to be "1 adult").
  for (const text of ['one of us is vegetarian', 'One of us uses a wheelchair', 'one of us arrives a day late', 'two of us are beginners', 'one person has a peanut allergy', 'the other two want lessons'])
    assert.deepEqual(P.requestParty(text), {}, text);
  assert.ok(S.hasSubgroup('Two of us are beginners') && !S.hasSubgroup('the two of us') && !S.hasSubgroup('2 adults and a 10-year-old'));
});

test('2. "one adult does not ski and would prefer a spa": that person’s wish, planned as a wish and never ruled out', () => {
  const sp = S.readSplit(REQ);
  assert.deepEqual([sp.nonSkier.n, sp.nonSkier.adult, sp.nonSkier.spa, sp.nonSkier.wish, sp.lessons.n], [1, true, true, 'a spa or another relaxing activity', 2]);
  assert.equal(S.planText(REQ), `Plan a 3-day ${TRIP_TOWN} winter trip for 2 adults and a 10-year-old from February 12 to February 14, 2027. Two of us are beginners and want ski lessons. We would also like a spa or another relaxing activity. We need a hotel for two nights and family-friendly dinners.`);
  for (const [text, n, adult, spa, plan] of [
    ['My husband doesn’t ski, he would rather go to a spa. 2 adults.', 1, true, true, 'We would also like a spa. 2 adults.'],
    ['Ski trip for 4; one of us is a non-skier and wants a massage.', 1, false, true, 'Ski trip for 4. We would also like a massage.'],
    ['Ski weekend, 3 adults. One of the adults doesn’t ski.', 1, true, false, 'Ski weekend, 3 adults.'],
    ['Ski weekend for 5. Two of us won’t ski and would like a gallery.', 2, false, false, 'Ski weekend for 5. We would also like a gallery.'],
    ['3 jours de ski, 2 adultes; un adulte ne skie pas et préfère un spa.', 1, true, true, '3 jours de ski, 2 adultes. Nous aimerions aussi un spa.'],
  ]) {
    const r = S.readSplit(text);
    assert.deepEqual([r.nonSkier.n, r.nonSkier.adult, r.nonSkier.spa], [n, adult, spa], text);
    assert.equal(S.planText(text), plan, text);
  }
  // The whole party not skiing, or nothing about it: read as typed.
  for (const text of ['We do not ski. A winter trip for 2', 'A ski weekend for two', 'snow fun but no skiing', '2 adults who love to ski']) { assert.equal(S.readSplit(text), null, text); assert.equal(S.planText(text), text); }
});

test('3. the plan’s one note: one schedule for everyone, and only what the listings show for the one not skiing', () => {
  const sp = S.readSplit(REQ), near = { id: 77, name: 'Cedar Thermal Spa', region: 'vernon', regionLabel: 'Vernon' };
  const none = S.note(sp, { spaStops: [], nearest: near, inTown: false, town: 'SilverStar' });
  assert.equal(none.text, 'This plan is one schedule for everyone. For the adult who isn’t skiing: no spa is listed in SilverStar; the nearest is Cedar Thermal Spa in Vernon.');
  assert.equal(none.textFr, 'Ce plan est un seul horaire pour tout le monde. Pour l’adulte qui ne skie pas : aucun spa n’est répertorié à SilverStar; le plus proche est Cedar Thermal Spa, à Vernon.');
  assert.deepEqual([none.key, none.n, none.adult, none.spa, none.lessons, none.chip, none.chipFr, none.nearest.id, none.stopIds], ['party_split', 1, true, true, 2, 'One schedule for everyone', 'Un seul horaire pour tous', 77, []]);
  // A spa on the plan: named with its day and time, and its stop says who it is for.
  const has = S.note(sp, { spaStops: [{ id: 5, name: 'Cedar Thermal Spa', day: 2, start: 14 * 60 }], nearest: null, town: 'SilverStar' });
  assert.equal(has.text, 'This plan is one schedule for everyone. For the adult who isn’t skiing: Cedar Thermal Spa (day 2, 2 PM) is listed as a spa.');
  assert.equal(has.textFr, 'Ce plan est un seul horaire pour tout le monde. Pour l’adulte qui ne skie pas : Cedar Thermal Spa (jour 2, 14 h) est répertorié comme spa.');
  assert.deepEqual([has.stopIds, has.nearest, has.stopNote, has.stopNoteFr], [[5], undefined, 'For the adult who isn’t skiing.', 'Pour l’adulte qui ne skie pas.']);
  assert.equal(S.note(sp, { spaStops: [{ id: 5, name: 'A Spa', day: 1, start: 990 }, { id: 6, name: 'B Sauna', day: 3, start: 600 }], town: 'X' }).text, 'This plan is one schedule for everyone. For the adult who isn’t skiing: A Spa (day 1, 4:30 PM) and B Sauna (day 3, 10 AM) are listed as a spa.');
  // A spa listed in the plan's own town but not planned; none listed anywhere; no wish said.
  assert.equal(S.note(sp, { spaStops: [], nearest: { ...near, regionLabel: 'SilverStar' }, inTown: true, town: 'SilverStar' }).text, 'This plan is one schedule for everyone. For the adult who isn’t skiing: Cedar Thermal Spa in SilverStar is listed as a spa but isn’t in this plan.');
  assert.equal(S.note(sp, { spaStops: [], nearest: null, town: 'SilverStar' }).text, 'This plan is one schedule for everyone. For the adult who isn’t skiing: no spa is listed in SilverStar.');
  const bare = S.note(S.readSplit('Ski weekend, 3 adults. One of the adults doesn’t ski.'), { spaStops: [], nearest: near, town: 'SilverStar' });
  assert.equal(bare.text, 'This plan is one schedule for everyone. It can’t plan a separate activity at the same time for the adult who isn’t skiing.');
  assert.equal(bare.nearest, undefined, 'no spa was wished for: none is offered');
  assert.equal(S.note(S.readSplit('Ski weekend for 5. Two of us won’t ski and would like a spa.'), { spaStops: [], nearest: null, town: 'X' }).text, 'This plan is one schedule for everyone. For the 2 who aren’t skiing: no spa is listed in X.');
  for (const n of [none, has, bare]) { HONEST(n.text); HONEST(n.textFr); assert.equal(n.base, 'This plan is one schedule for everyone. It can’t plan a separate activity at the same time for the adult who isn’t skiing.'); }
  assert.equal(S.note(null, {}), null);
  // The summary's chip, flagged (never a tick).
  const fact = LAYOUT.tripSummaryFacts({ partySplit: none }, false, {}).find((f) => f.ask === 'party_split');
  assert.deepEqual([fact.kind, fact.status, fact.text], ['flag', 'partial', 'One schedule for everyone']);
  assert.equal(LAYOUT.tripSummaryFacts({ partySplit: none }, true, {}).find((f) => f.ask === 'party_split').text, 'Un seul horaire pour tous');
  // The share link carries values only, and reads back.
  assert.equal(S.toShare(none), '1a.s');
  assert.deepEqual([S.fromShare('1a.s').nonSkier.n, S.fromShare('1a.s').nonSkier.adult, S.fromShare('1a.s').nonSkier.spa, S.fromShare('2x').nonSkier.adult, S.fromShare('2x').nonSkier.spa], [1, true, true, false, false]);
  for (const bad of ['', '0a', '1b', 'a spa', '1a.s<script>', '12a']) assert.equal(S.fromShare(bad), null, bad);
  // The page: the note with the plan's own "Add it", under Details; the plan's "couldn't fit a spa" line is not said twice.
  assert.match(PAGE, /var ps = v4SplitNote\(\); if \(!ps\) return ''; var nid = ps\.add && typeof chatSend === 'function' && planKinds \? Number\(ps\.add\.id\) : 0; return '<p class="v4-tip v4-picked v4-partynote v4-split" data-v4-split>'/);
  assert.ok(PAGE.includes("(p.notIncluded || []).slice(0, 3).map(function(x){ var t = (fr && x.textFr) || x.text; if (x && x.split && v4SplitNote()) t = '';"));
});

test('4. the exact request, planned: the hotel is for 2 adults and 1 kid (10) for Feb 12–14, on the card and on every stay link', () => {
  const p = run(REQ);
  assert.ok(['multi_day'].includes(p.kind), p.kind);
  assert.equal((p.days || []).length, 3);
  const t = p.whereToStay.trip;
  assert.deepEqual([t.adults, t.kids, t.kidAges, t.arrive, t.leave, t.nights, t.adultsAssumed], [2, 1, [10], '2027-02-12', '2027-02-14', 2, undefined]);
  assert.deepEqual([p.tripDates.start, p.tripDates.end, p.tripDates.source], ['2027-02-12', '2027-02-14', 'request']);
  const pick = p.whereToStay.pick;
  assert.equal(pick.id, (WR ? F.HOTELW : F.HOTEL).id);
  // Every stay link that can carry a party carries THIS one (Booking.com through Stay22, Expedia), never 1 adult.
  const links = (pick.bookingLinks || []).map((l) => dec(l.url));
  const bk = links.find((u) => /booking\.com\/hotel/.test(u)), ex = links.find((u) => /expedia\./.test(u));
  assert.match(bk, /group_adults=2&group_children=1&age=10&no_rooms=1/);
  assert.match(bk, /[?&]adults=2&children=1(?:&|$)/);
  assert.match(ex, /rm1=a2:c10/);
  for (const u of links) assert.doesNotMatch(u, /group_adults=1\b|[?&]adults=1\b|rm1=a1\b/, u);
  // The request text with the party said the other way round reads the same.
  assert.deepEqual((({ adults, kids, kidAges }) => [adults, kids, kidAges])(run(REQ.replace('for 2 adults and a 10-year-old', 'for a 10-year-old and 2 adults')).whereToStay.trip), [2, 1, [10]]);
  // The lessons: asked for and, when no listed lesson is on the plan, said plainly as not in it. Never confirmed.
  const reqs = p.requirementResults || [];
  assert.ok(reqs.some((r) => r.kind === 'venue_kind' && r.value === 'ski_lessons'), 'ski lessons were asked for');
  const lessonIn = reqs.some((r) => r.kind === 'venue_kind' && r.value === 'ski_lessons' && r.status === 'satisfied');
  const lessonLine = (p.notIncluded || []).find((x) => x.kind === 'ski_lessons');
  if (!lessonIn) { assert.ok(lessonLine, 'the plan says the lesson is not in it'); assert.match(lessonLine.text, /^(?:I couldn’t fit a ski or snowboard lesson into this plan\.|There’s no ski or snowboard lesson listed in .+, so this plan has none\.)/); assert.ok(!lessonLine.split); }
  for (const x of p.notIncluded || []) assert.doesNotMatch(x.text, /\bavailable\b|\bconfirmed\b|\bbooked\b/i, x.text);
  // The spa: a wish of the trip, never something to avoid ("does not … spa" was read as "no spa").
  assert.ok(!reqs.some((r) => /^excluded/.test(r.kind) && r.value === 'spa'), 'the spa is not ruled out');
  assert.ok(reqs.some((r) => r.kind === 'venue_kind' && r.value === 'spa'), 'the spa is looked for');
  assert.ok(!(p.understood.interests || []).some((x) => /prefer/.test(x)), JSON.stringify(p.understood.interests));
  // The note: one schedule for everyone, then the spa on the plan (with its day and time) or the nearest listed one.
  const ps = p.partySplit;
  assert.ok(ps, 'the plan says what it did for the adult who is not skiing');
  assert.deepEqual([ps.n, ps.adult, ps.spa, ps.lessons], [1, true, true, 2]);
  assert.match(ps.text, /^This plan is one schedule for everyone\. For the adult who isn’t skiing: /);
  HONEST(ps.text); HONEST(ps.textFr);
  const visits = (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue).map((s) => ({ day: d.day, id: s.venue.id, name: s.venue.name })));
  if (ps.stopIds.length) {
    // (Whistler lists spas in the village.) Each spa named is a stop of the plan, with its own day, and says who it is for.
    for (const id of ps.stopIds) { const v = visits.find((x) => x.id === id); assert.ok(v, 'a named spa is on the plan'); assert.ok(ps.text.includes(`${v.name} (day ${v.day}, `), ps.text); }
    assert.match(ps.text, / (?:is|are) listed as a spa\.$/);
    assert.ok((p.schedule || []).some((r) => ps.stopIds.includes(r.venueId) && r.forSome && r.forSome.note === 'For the adult who isn’t skiing.'));
    assert.equal(ps.nearest, undefined);
  } else {
    // (SilverStar lists none: the fixture spa in the next town is the nearest.)
    assert.equal(ps.text, `This plan is one schedule for everyone. For the adult who isn’t skiing: no spa is listed in ${TRIP_TOWN}; the nearest is ${F.SPA.name} in ${OTHER_TOWN}.`);
    assert.deepEqual([ps.nearest.id, ps.nearest.name], [F.SPA.id, F.SPA.name]);
    assert.ok(!visits.some((x) => x.id === F.SPA.id));
    // The plan's own "couldn't fit a spa" line is the note's to say (once); the summary still flags the spa.
    const spaLine = (p.notIncluded || []).find((x) => x.kind === 'spa');
    assert.ok(spaLine && spaLine.split === true);
    assert.ok(LAYOUT.tripSummaryFacts(p, false, {}).some((f) => /^Spa: not in this plan$/.test(f.text)));
  }
  assert.ok(LAYOUT.tripSummaryFacts(p, false, {}).some((f) => f.ask === 'party_split' && f.text === 'One schedule for everyone'));
  // The same request without the sub-group sentence has no such note, and the same party.
  const plain = run(REQ.replace(' Two of us are beginners and want ski lessons; one adult does not ski and would prefer a spa or another relaxing activity.', ''));
  assert.equal(plain.partySplit, undefined);
  assert.deepEqual([plain.whereToStay.trip.adults, plain.whereToStay.trip.kids], [2, 1]);
});

test('5. the correction message: the hotel’s guests are set, the reply says so in few words, and the itinerary is identical', async () => {
  let asked = 0;
  app.setTripChatReader(async () => { asked += 1; return { ok: true, ops: [{ o: 'party', value: 'adults', n: 1, stops: [], kind: null, time: null, day: null, ages: [], region: null, date: null }], cant: null }; });
  // The page as it stood: the card said 1 adult, 1 kid.
  const r = await say(FIX_MSG, { stay: { adults: 1, kids: 1 } });
  assert.equal(asked, 0, 'the AI reader is not asked');
  assert.equal(r.reply, 'Hotel guests: 2 adults, 1 kid. The itinerary is unchanged.');
  assert.deepEqual(r.party, { adults: 2, kids: 1 });
  NOTHING_ELSE(r);
  const t = r.stayBlock.whereToStay.trip;
  assert.deepEqual([t.adults, t.kids, t.kidAges, r.stayBlock.whereToStay.pick.id], [2, 1, [10], F.HOTEL.id]);
  for (const l of r.stayBlock.whereToStay.pick.bookingLinks || []) assert.doesNotMatch(dec(l.url), /group_adults=1\b|[?&]adults=1\b|rm1=a1\b/);
  // Another party said the same way; French; the plain message it always was.
  const two = await say('There are 2 adults and 2 children staying in the hotel. Keep the itinerary the same.', { stay: { adults: 1, kids: 1 } });
  assert.equal(two.reply, 'Hotel guests: 2 adults, 2 kids. The itinerary is unchanged.');
  assert.deepEqual([two.party, two.stayBlock.whereToStay.trip.adults, two.stayBlock.whereToStay.trip.kids], [{ adults: 2, kids: 2 }, 2, 2]);
  NOTHING_ELSE(two);
  const fr = await say('Il y a 2 adultes et 1 enfant à l’hôtel pour les deux nuits. Gardez l’itinéraire tel quel.', { lang: 'fr', stay: { adults: 1, kids: 1 } });
  assert.equal(fr.reply, 'Clients de l’hôtel : 2 adultes, 1 enfant. L’itinéraire est inchangé.');
  const plain = await say('we are 4 adults');
  assert.equal(plain.reply, 'Set for 4 adults.');
  assert.deepEqual(plain.party, { adults: 4 });
  app.setTripChatReader(null);
  assert.equal(asked, 0);
  // The page puts the children in the Kids field too, so every stay link and a later request carry them.
  assert.match(CHAT_PAGE, /if \(j\.party && typeof j\.party\.kids === 'number' && j\.party\.kids >= 0 && j\.party\.kids <= 12\) \{ var kdEl = document\.getElementById\('t3Kids'\);/);
});

test('6. "What can the adult who does not ski do while the other two are skiing?": a direct answer from the listings; nothing changes', async () => {
  const stops = stopsFor();
  const rd = (m, o = {}) => tc.rulesRead(m, stops, { days: 3, request: FIX_REQ, ...o });
  const r0 = rd(ASK_MSG);
  assert.deepEqual(r0.ops.map((o) => [o.o, o.value]), [['ask', 'q_split']]);
  assert.equal(r0.access, true, 'fixed rules: the AI reader’s reading never stands in');
  for (const m of ['what can the non-skier do', 'something for the one who doesn’t ski', 'anything for the non skier?', 'What about my wife who isn’t skiing?', 'what is there to do while they are skiing?', 'ideas for the adult who won’t ski', 'que peut faire celle qui ne skie pas?'])
    assert.deepEqual(rd(m).ops.map((o) => [o.o, o.value]), [['ask', 'q_split']], m);
  // Never the size of the party, whatever is asked or said of the one who does not ski.
  for (const m of [ASK_MSG, 'something for the one adult who doesn’t ski', 'one adult does not ski', 'one adult doesn’t ski, the other two do', 'two of us are beginners'])
    assert.ok(!(rd(m).ops || []).some((o) => o.o === 'party'), m);
  assert.deepEqual(rd('we are 4 adults').ops.map((o) => [o.o, o.value, o.n]), [['party', 'adults', 4]]);
  // An edit for that person is an edit (read by the usual rules), and a question about a stop is its own question.
  for (const m of ['add a spa for the non-skier', 'is the cafe open on sunday?', 'why this hotel?']) assert.ok(!(rd(m).ops || []).some((o) => o.value === 'q_split'), m);

  let asked = 0;
  app.setTripChatReader(async () => { asked += 1; return { ok: true, ops: [{ o: 'ask', value: 'q_why', stops: [], kind: null, time: null, day: null, n: null, ages: [], region: null, date: null }], cant: null }; });
  const r = await say(ASK_MSG);
  assert.equal(asked, 0, 'the AI reader is not asked');
  assert.equal(r.reply, `No spa is listed in ${TOWN}. The nearest is ${F.SPA.name} in ${OTHER_TOWN}. Your plan is one schedule for everyone, and nothing changed. Add it to the plan?`);
  HONEST(r.reply);
  assert.doesNotMatch(r.reply, /Which stop do you mean/);
  NOTHING_ELSE(r, ['party', 'stayBlock']);
  // One question, one tap to say yes: the plan's own "Add it" for that listing.
  const sayAdd = `${F.SPA.name} [add ${F.SPA.id}]`;
  assert.deepEqual(r.choices, [{ kind: 'say', say: sayAdd, label: 'Add it' }]);
  assert.deepEqual(r.offer, [sayAdd]);
  for (const m of ['what can the non-skier do', 'something for the one who doesn’t ski']) { const x = await say(m); assert.equal(x.reply, r.reply, m); NOTHING_ELSE(x, ['party', 'stayBlock']); }
  const fr = await say('Que peut faire l’adulte qui ne skie pas pendant que les autres skient?', { lang: 'fr' });
  assert.equal(fr.reply, `Aucun spa n’est répertorié à ${TOWN}. Le plus proche est ${F.SPA.name}, à ${OTHER_TOWN}. Votre plan est un seul horaire pour tout le monde, et rien n’a changé. L’ajouter au plan?`);
  app.setTripChatReader(null);
  assert.equal(asked, 0);
  // A statement about the one who does not ski that the AI reads as "1 adult": the party stays as it is.
  let read = 0;
  app.setTripChatReader(async () => { read += 1; return { ok: true, ops: [{ o: 'party', value: 'adults', n: 1, stops: [], kind: null, time: null, day: null, ages: [], region: null, date: null }], cant: null }; });
  for (const m of ['One adult doesn’t ski.', 'Two of us are beginners.']) { const st = await say(m); assert.equal(st.party, undefined, m); assert.equal(st.stayBlock, undefined, m); assert.equal(st.plan, null, m); }
  assert.ok(read >= 1, 'the AI was asked, and its count of adults was not taken');
  // …while a number of adults said as the party is still the party, whoever reads it.
  assert.deepEqual((await say('Actually we will be 3 adults in all')).party, { adults: 3 });
  app.setTripChatReader(null);
  // With a spa on the plan it is named with its day and time, and nothing is offered.
  const f = { spaStops: [{ id: 5, name: 'Cedar Thermal Spa', day: 2, start: 870 }], nearest: null, town: TOWN };
  assert.deepEqual(S.chatReply(f, 'en'), { reply: 'Cedar Thermal Spa (day 2, 2:30 PM) is listed as a spa on your plan. Your plan is one schedule for everyone, and nothing changed.', ask: '', add: null });
  assert.equal(S.chatReply({ spaStops: [], nearest: null, town: TOWN }, 'en').add, null);
});

test('7. every visit is a stop of the share link: the same place on two days and twice in one day keeps each day and time', () => {
  const { list, q } = linkOf();
  // The planner's count is the link's count: 8 visits of 4 listings (it was 4: each listing once).
  assert.equal(list.length, SCREEN().length);
  assert.equal(new Set(list.map((x) => x.ref)).size, 4);
  assert.deepEqual(list.map((x) => [x.ref, x.day]), SCREEN().map((s) => [`venue:${s.id}`, Number(s.key[0])]));
  assert.equal(q.t, '540,720,1080,555,735,1110,570,750', 'each visit’s own time, the second visit of day 2 too');
  // The page's own stop list is built by that code, from each stop's place in the plan.
  assert.match(PAGE, /function v4ShareStops\(\)\{\s*return tripVisitList\(Array\.prototype\.map\.call\(resultEl\.querySelectorAll\('\.trip-btn\[data-plan-stop\]'\), function\(b\)\{\s*return \{ ref: b\.getAttribute\('data-trip-ref'\), key: b\.getAttribute\('data-plan-key'\) \|\| ''/);
  assert.match(PAGE, /\(key \? ' data-plan-key="' \+ esc\(key\) \+ '"' : ''\)/);
  // The same button twice in the page (two layouts), an event, a stop with no place in the plan: each once.
  assert.deepEqual(VISITS.list([{ ref: 'venue:7', key: '1-morning', day: 1 }, { ref: 'venue:7', key: '1-morning', day: 1 }, { ref: 'venue:7', key: '2-morning', day: 2 }, { ref: 'event:3', key: '', day: 2 }, { ref: 'event:3', key: '', day: 2 }, { ref: 'venue:9', key: '', day: 0 }, { ref: 'venue:9', key: '', day: 0 }, { ref: 'x', key: '1-late', day: 1 }], 30).map((x) => `${x.ref}@${x.day}`), ['venue:7@1', 'venue:7@2', 'event:3@2', 'venue:9@0']);
  assert.equal(VISITS.list(Array.from({ length: 40 }, (_, i) => ({ ref: 'venue:7', key: `${(i % 7) + 1}-${['morning', 'midday', 'afternoon', 'late', 'evening', 'night'][Math.floor(i / 7)]}`, day: (i % 7) + 1 })), 30).length, 30);

  // Round trip: the link read back by the server keeps every visit with its day and time, in both languages.
  const back = new URLSearchParams(app.tripShareSearch(q).replace(/^\?/, ''));
  assert.equal(back.get('stops'), q.stops);
  assert.equal(back.get('days'), '1,1,1,2,2,2,3,3');
  assert.equal(back.get('t'), q.t);
  assert.equal(back.get('ps'), '1a.s');
  const c = app.tripShareContext(q, 'en', new Date('2026-11-24T18:00:00Z'));
  assert.deepEqual(c.times, [540, 720, 1080, 555, 735, 1110, 570, 750]);
  // The copy's party and stay: 2 adults, 1 kid (10), the same hotel, links for that party.
  assert.deepEqual([c.adults, c.kids, c.kidAges, c.stay.id, c.nights], [2, 1, [10], F.HOTEL.id, 2]);
  const html = app.tripShareContextHtml(c, 'en');
  assert.match(html, /2 adults, 1 kid · Fri, Feb 12 – Sun, Feb 14/);
  for (const l of c.stay.links) assert.doesNotMatch(dec(l.url), /group_adults=1\b|[?&]adults=1\b|rm1=a1\b/);
  assert.ok(c.stay.links.some((l) => /group_adults=2&group_children=1&age=10/.test(dec(l.url))));
  // The copy's lines: the lesson is not in the plan (as the plan said), and the one note for the adult not skiing.
  const texts = c.lines.map((l) => l.text);
  assert.ok(texts.includes('I couldn’t fit a ski or snowboard lesson into this plan.'), JSON.stringify(texts));
  assert.ok(texts.includes(`This plan is one schedule for everyone. For the adult who isn’t skiing: no spa is listed in ${TOWN}; the nearest is ${F.SPA.name} in ${OTHER_TOWN}.`), JSON.stringify(texts));
  assert.ok(!texts.some((x) => /couldn’t fit a spa|Spa: not in this plan/.test(x)), 'the spa is said once, by the note');
  for (const x of texts) HONEST(x);
  assert.equal(app.tripShareContext(q, 'fr', new Date('2026-11-24T18:00:00Z')).lines.filter((l) => l.ask === 'party_split')[0].text, `Ce plan est un seul horaire pour tout le monde. Pour l’adulte qui ne skie pas : aucun spa n’est répertorié à ${TOWN}; le plus proche est ${F.SPA.name}, à ${OTHER_TOWN}.`);
  // The kid-friendly count is of the copy's own visits, as on the plan (8, not 4).
  assert.match((c.lines.concat(c.evidence || []).find((l) => l.ask === 'kid_friendly') || {}).text || '', /8 stops have the badge/);
  // The shared page lists the link's stops as they are (no listing is dropped for being there twice), and the copied
  // text is every stop row on the page with its time.
  assert.match(SERVER, /var shared = \(params\.get\('stops'\) \|\| ''\)\.split\(','\)\.filter\(function\(r\)\{ return REF\.test\(r\); \}\)\.slice\(0, \$\{MY_TRIP_MAX_REFS\}\);/);
  assert.match(SERVER, /if \(viewing === 'shared'\) return shared\.map\(function\(r, i\)\{/);
  assert.match(PAGE, /Array\.prototype\.forEach\.call\(sec\.querySelectorAll\('\.v4-stop:not\(\.v4-gone\):not\(\.v4-free\)'\), function\(li\)\{/);
  // The spa added to the plan: the copy names it with its day and time, and its stop says who it is for.
  const withSpa = { ...q, stops: `${q.stops},venue:${F.SPA.id}`, days: `${q.days},3`, t: `${q.t},1005`, asks: 'kind:ski_lessons,kind:spa,kid_friendly', ni: 'ski_lessons:f' };
  const c2 = app.tripShareContext(withSpa, 'en', new Date('2026-11-24T18:00:00Z'));
  assert.ok(c2.lines.some((l) => l.text === `This plan is one schedule for everyone. For the adult who isn’t skiing: ${F.SPA.name} (day 3, 4:45 PM) is listed as a spa.`), JSON.stringify(c2.lines));
  assert.deepEqual(c2.actNotes[`venue:${F.SPA.id}`].lines.slice(-1), ['For the adult who isn’t skiing.']);
  // A link without ps= says nothing of it.
  const { ps, ...noPs } = q;
  assert.ok(ps && !app.tripShareContext(noPs, 'en', new Date('2026-11-24T18:00:00Z')).lines.some((l) => l.ask === 'party_split'));
});

test('8. Remove, Undo and Swap act on one visit; a listing is "removed" only when no visit of it is left', async () => {
  const days = planDays(), rows = planRows();
  // A visit's own row: the second visit of a listing on a day reads that day's second row for it.
  assert.equal(VISITS.nth(days[1].stops, 'midday', F.DINNER.id), 0);
  assert.equal(VISITS.nth(days[1].stops, 'evening', F.DINNER.id), 1);
  assert.deepEqual([VISITS.row(rows, 2, F.DINNER.id, 0).startMinutes, VISITS.row(rows, 2, F.DINNER.id, 1).startMinutes, VISITS.row(rows, 1, F.DINNER.id, 0).startMinutes, VISITS.row(rows, 2, F.DINNER.id, 2)], [735, 1110, 1080, null]);
  assert.deepEqual(VISITS.of(days, rows, {}, F.DINNER.id), [{ day: 1, start: 1080 }, { day: 2, start: 735 }, { day: 2, start: 1110 }]);
  // Remove one visit (day 2's dinner): the other two stay, the listing is still on the plan, the link has 7 stops.
  const gone = removedMap(['2-evening']);
  assert.deepEqual(VISITS.gone(days, gone), {});
  assert.deepEqual(VISITS.of(days, rows, gone, F.DINNER.id), [{ day: 1, start: 1080 }, { day: 2, start: 735 }]);
  const less = linkOf(['2-evening']);
  assert.equal(less.list.length, 7);
  assert.equal(less.q.t, '540,720,1080,555,735,570,750');
  assert.equal(less.q.days, '1,1,1,2,2,3,3');
  // Undo: all three visits again. Every visit removed: the listing is gone.
  assert.equal(linkOf([]).list.length, 8);
  assert.deepEqual(VISITS.gone(days, removedMap(['1-evening', '2-midday', '2-evening'])), { [F.DINNER.id]: 1 });
  assert.deepEqual(VISITS.gone(days, removedMap(['3-midday'])), { [F.CAFE.id]: 1 });
  // The page: Remove and Undo are keyed by the visit's place in the plan; what counts as removed is the rule above; a
  // place visited more than once keeps ONE booking row, with each visit said under it.
  assert.match(PAGE, /function v4RemovedIds\(\)\{ var ids = tripVisitGone\(\(state\.last \|\| \{\}\)\.days, state\.removed\);/);
  assert.match(PAGE, /function v4Visits\(id\)\{ return tripVisitsOf\(\(state\.last && state\.last\.days\) \|\| \[\], \(state\.last && state\.last\.schedule\) \|\| \[\], state\.removed, id\); \}/);
  assert.match(PAGE, /x\.kind === 'venue' && x\.id && v4VisitsText\(x\.id\) \? '<small data-v4-visits="'/);
  // The page's own v4Row, run as it is sent: each visit reads its own row (the second dinner-place visit of day 2 too).
  { const a = PAGE.indexOf('  function v4Row('), v4Row = new Function('state', `${PAGE.slice(a, PAGE.indexOf('\n  }\n', a) + 5).replace(/\\\\/g, '\\')}\nreturn v4Row;`)({ last: { days, schedule: rows } });
    assert.deepEqual(['1-evening', '2-midday', '2-evening'].map((k) => v4Row({ venue: { id: F.DINNER.id } }, k).startMinutes), [1080, 735, 1110]);
    assert.deepEqual(['1-morning', '2-morning', '3-morning'].map((k) => v4Row({ venue: { id: F.HILL.id } }, k).startMinutes), [540, 555, 570]); }
  // The chat: "remove dinner on day 1" takes off that visit only, though the bistro is also on day 2 (twice).
  const r = await say('remove the dinner on day 1');
  assert.deepEqual(r.actions.remove, ['1-evening']);
  assert.equal(r.plan, null);
  // …and with it removed, the chat still reads the other visits as stops on the plan.
  const stops = app.tripChatStops(on(['1-evening']).map((s) => ({ key: s.key, id: s.id, start: s.start })));
  assert.deepEqual(stops.filter((s) => s.id === F.DINNER.id).map((s) => [s.key, s.start]), [['2-midday', 735], ['2-evening', 1110]]);
});

test('9. a link made before this (each listing once, no ps=) opens as it did', () => {
  // The oldest form: stops and days only. No context, the stops and days as sent.
  const old = { stops: `venue:${F.HILL.id},venue:${F.LUNCH.id},venue:${F.DINNER.id},venue:${F.CAFE.id}`, days: '1,1,1,3' };
  assert.equal(app.tripShareContext(old, 'en', new Date('2026-11-24T18:00:00Z')), null);
  assert.equal(app.tripShareSearch(old), `?stops=${old.stops}&days=1,1,1,3`);
  assert.equal(app.tripShareSearch({ stops: old.stops }), `?stops=${old.stops}`);
  // The link the page made until now for this plan: 4 stops with their times, party and stay. It reads as before
  // (the party it carries, its times in step with its stops, the plan's "couldn't fit a spa" line), with no note.
  const before = { ...old, td: '2027-02-12_2027-02-14', ts: 'r', t: '540,720,1080,750', stay: String(F.HOTEL.id), nights: '2', ad: '1', kids: '1', ka: '10', rm: '1', ra: '1', asks: 'kind:ski_lessons,kind:spa,kid_friendly', ni: `ski_lessons:f,spa:f:${F.SPA.id}`, nt: REGION };
  const c = app.tripShareContext(before, 'en', new Date('2026-11-24T18:00:00Z'));
  assert.deepEqual([c.times, c.adults, c.kids, c.kidAges, c.stay.id, c.split], [[540, 720, 1080, 750], 1, 1, [10], F.HOTEL.id, undefined]);
  assert.ok(!c.lines.some((l) => l.ask === 'party_split'));
  assert.ok(c.lines.some((l) => l.text === `I couldn’t fit a spa into this plan. The nearest is ${F.SPA.name} in ${OTHER_TOWN}.`), JSON.stringify(c.lines.map((l) => l.text)));
  assert.equal(new URLSearchParams(app.tripShareSearch(before).replace(/^\?/, '')).get('ps'), null);
  // A link's ps= that is not one of ours is ignored.
  assert.equal(HP.parseShareContext({ ...before, ps: '<b>' }).split, undefined);
  assert.deepEqual(HP.parseShareContext({ ...before, ps: '1a.s' }).splitQ, '1a.s');
});
