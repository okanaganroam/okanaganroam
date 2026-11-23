'use strict';
// Build My Trip: a hot tub asked of the hotel is the stay's amenity, not an outing; "we do not have a car" is a need of
// the trip (2026-11-23). The owner's request, on the live site at 390px:
//   "Plan a 3-day romantic getaway in Osoyoos for two adults from May 7 to May 9, 2027. We want wineries, vegetarian
//    meals, a spa and a hotel with a hot tub. We do not have a car and want a relaxed pace."
// The plan picked a hotel marked "Hot tub" and also said "Hot tub or sauna: not in this plan"; nothing on screen spoke
// to the missing car, and the chat answered "most stops need a car; taxis are limited" and left it there.
// Parts 1-8 are pure (fixtures); parts 9-11 run the planner and the chat on the repo's seed database.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const TR = require('../trip-requirements.js');
const T = require('../trip-transport-need.js');
const A = require('../trip-access-needs.js');
const H = require('../trip-honest-plan.js');
const L = require('../trip-workspace-layout.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'whistler' : 'vernon';
const TOWN = WR ? 'Whistler' : 'Vernon';
const AT = WR ? [50.1163, -122.9574] : [50.267, -119.272];
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');

const kinds = (text) => TR.extractTripRequirements({ text, intent: {}, trip: {}, taxonomy: { venues: [] } }).items.filter((i) => i.kind === 'venue_kind').map((i) => i.value).sort();

test('1. a hot tub or sauna said of the place to stay is not an outing; a spa, or a sauna visit, asked beside it still is', () => {
  // The owner's sentence: the spa stays a request, the hot tub belongs to the hotel.
  assert.deepEqual(kinds('3 days in Osoyoos. We want wineries, vegetarian meals, a spa and a hotel with a hot tub.'), ['spa']);
  for (const t of ['2 days in Vernon with a hot tub at the hotel', 'a weekend in Kelowna, hot tub suite and wineries', '2 days in Penticton, a stay with a sauna', '2 days in Kelowna, a hotel with a pool and a hot tub',
    '2 days in Kelowna, a hotel with a hot tub and a sauna', '2 days in Kelowna, a cabin that has a private hot tub', '2 days in kelowna, a hotel with hot tub', '2 jours a kelowna, un hotel avec bain a remous', '2 days in Kelowna, somewhere to stay with a jacuzzi']) {
    assert.deepEqual(kinds(t).filter((k) => k === 'sauna' || k === 'spa'), [], t);
    assert.ok(TR.stayTubAsked(t), t);
  }
  // Both asked: the hotel's hot tub and a sauna outing.
  assert.deepEqual(kinds('2 days in Kelowna, a hotel with a hot tub and also a sauna visit'), ['sauna']);
  assert.deepEqual(kinds('2 days in Kelowna, hotel with a hot tub, and a floating sauna'), ['sauna']);
  assert.deepEqual(kinds('2 days in Kelowna, a hotel with hot tub and a spa'), ['spa']);
  // Not said of the stay: an outing, as before.
  for (const t of ['2 days in Vernon, hot tub and sauna', '2 days in Kelowna with a hot tub', '2 days in Kelowna, a hotel and a sauna', '2 days in Kelowna, a sauna session and a hotel']) {
    assert.deepEqual(kinds(t), ['sauna'], t);
    assert.equal(TR.stayTubAsked(t), null, t);
  }
  assert.deepEqual(TR.stayTubAsked('a stay with a sauna'), { hotTub: false, sauna: true });
  assert.deepEqual(TR.stayTubAsked('a hotel with a hot tub'), { hotTub: true, sauna: false });
  // The words the indoor-places reader no longer sees; everything else is as typed.
  assert.equal(TR.stripStayTub('We want wineries, a spa and a hotel with a hot tub. We do not have a car.'), 'We want wineries, a spa and a hotel. We do not have a car.');
  assert.equal(TR.stripStayTub('A weekend in Kelowna with wineries and a spa'), 'A weekend in Kelowna with wineries and a spa');
  // The stay's own reader still hears the hot tub, in every wording.
  for (const t of ['a hotel with a hot tub', 'a hot tub at the hotel', 'hot tub suite', 'un hôtel avec bain à remous', 'a place to stay with a jacuzzi']) assert.deepEqual((tc.stayTextPref(t) || {}).amenities, ['hot_tub'], t);
});

test('2. "we do not have a car" is read as a need of the trip, in English and French; no driving after tastings is not one', () => {
  const n = T.readNoCar('Plan a 3-day romantic getaway in Osoyoos. We do not have a car and want a relaxed pace.');
  assert.deepEqual([n.key, n.who, n.phrase], ['no_car', 'all', 'We do not have a car and want a relaxed pace']);
  for (const t of ['a weekend in Penticton without a car', 'no car, 2 days in Kelowna', 'we don’t have a car', 'car-free weekend in Vernon', 'we are arriving by bus', 'Une fin de semaine à Kelowna sans voiture', 'Nous n’avons pas de voiture', 'pas d’auto, 2 jours à Vernon']) assert.ok(T.readNoCar(t), t);
  for (const t of ['a weekend in Kelowna with wineries', 'no driving after the wineries', 'we need a designated driver', 'we are driving up from Vancouver', 'a rental car for Saturday', 'cable car and a gondola ride', 'we don’t drive after tastings']) assert.equal(T.readNoCar(t), null, t);
});

// Fixture stops around a hotel: two a short walk apart, one 3 km out, one with no map location.
const P = { 1: { lat: 50.0000, lng: -119.0000 }, 2: { lat: 50.0040, lng: -119.0000 }, 3: { lat: 50.0300, lng: -119.0000 }, 9: { lat: 50.0010, lng: -119.0000 } };
const coordsOf = (id) => P[id] || null;
const LIST = [{ id: 1, name: 'Corner Bistro', day: 1 }, { id: 2, name: 'Lake Café', day: 1 }, { id: 3, name: 'Hill Winery', day: 1 }, { id: 4, name: 'Pickup Tours', day: 2 }];
const STAY = { id: 9, name: 'Beach Hotel' };

test('3. the trips between stops: a short walk only where the stored locations support it; anything else is a ride to check', () => {
  const legs = T.legsOf(LIST, STAY, coordsOf);
  assert.deepEqual(legs.map((l) => [l.day, l.from.name, l.to.name, l.walk]), [[1, 'Beach Hotel', 'Corner Bistro', true], [1, 'Corner Bistro', 'Lake Café', true], [1, 'Lake Café', 'Hill Winery', false], [2, 'Beach Hotel', 'Pickup Tours', false]]);
  assert.ok(legs[2].km > 2.5 && legs[2].km < 3.2);
  assert.equal(legs[3].km, null); // no stored location: never called walkable
  // Without a place to stay the day starts at its first stop.
  assert.equal(T.legsOf(LIST, null, coordsOf).length, 2);
  const e = T.entry(LIST, STAY, coordsOf);
  assert.equal(e.ask, 'no_car');
  assert.equal(e.status, 'unknown'); // transport is never "verified"
  assert.equal(e.rides, 2);
  assert.match(e.text, /^No car: 2 of 4 trips between stops are more than a short walk \(over about 1 km in a straight line\); the longest is Lake Café to Hill Winery \(about 3 km\)\. Taxis, shuttles and buses aren’t checked here: confirm a ride before you go\.$/);
  assert.match(e.textFr, /^Sans voiture : 2 des 4 trajets entre les arrêts dépassent une courte marche .*Lake Café à Hill Winery \(env\. 3 km\)\. Les taxis, navettes et autobus ne sont pas vérifiés ici/);
  const row = (id) => e.stops.find((r) => r.id === id);
  assert.equal(row(1).check, false);
  assert.equal(row(1).note, undefined);
  assert.equal(row(3).note, 'No car: about 3 km from Lake Café · check a ride');
  assert.equal(row(3).noteFr, 'Sans voiture : env. 3 km depuis Lake Café · prévoyez un transport');
  assert.equal(row(4).note, 'No car: no map location to measure from your stay · check a ride');
  // Every trip short: said as approximate, never as checked.
  const near = T.entry(LIST.slice(0, 2), STAY, coordsOf);
  assert.equal(near.rides, 0);
  assert.equal(near.status, 'unknown');
  assert.match(near.text, /under about 1 km in a straight line, a short walk\. Walking routes aren’t checked\.$/);
  // No wording anywhere names or promises a taxi, a bus or a shuttle.
  for (const s of [e.text, e.textFr, e.short, e.shortFr, near.text, near.textFr, ...e.stops.flatMap((r) => [r.note, r.noteFr, r.noteShort, r.noteShortFr])].filter(Boolean)) assert.ok(!/\b(?:taxis? (?:are|is) available|short taxi|bus ride|book rides ahead|verified ✓)\b/i.test(s), s);
});

const stop = (daypart, id, name, type, badges = []) => ({ daypart, label: daypart, venue: { id, name, type, region: 'osoyoos', latitude: (P[id] || {}).lat, longitude: (P[id] || {}).lng, badges: badges.map((key) => ({ key })) }, reasons: [] });
const ASK = 'Plan a 3-day romantic getaway in Osoyoos for two adults from May 7 to May 9, 2027. We want wineries, vegetarian meals, a spa and a hotel with a hot tub. We do not have a car and want a relaxed pace.';
function planOf(extra = {}) {
  return { kind: 'multi_day', query: ASK, needs: [T.readNoCar(ASK)], warnings: [], datesGiven: true,
    days: [{ day: 1, stops: [stop('midday', 1, 'Corner Bistro', 'restaurant', ['vegetarian']), stop('afternoon', 3, 'Hill Winery', 'winery')] }, { day: 2, stops: [stop('midday', 2, 'Lake Café', 'restaurant', ['vegetarian'])] }],
    requirementResults: [{ kind: 'type', value: 'winery', strength: 'must', status: 'satisfied' }, { kind: 'feature', value: 'vegetarian', strength: 'must', status: 'satisfied' }],
    intent: { features: ['vegetarian'] },
    notIncluded: [{ kind: 'spa', label: 'spa', text: 'There’s no spa listed in Osoyoos, so this plan has none.', textFr: 'Aucun spa.' }],
    whereToStay: { pick: { id: 9, name: 'Beach Hotel', regionLabel: 'Osoyoos', has: ['hot_tub'] }, amenity: { keys: ['hot_tub'] } }, ...extra };
}
const ev = (p, ask) => (p.evidence || []).find((e) => e.ask === ask);

test('4. the plan’s evidence: one hot tub line (the hotel’s listing), no "hot tub: not in this plan"; a no-car line that is never a tick', () => {
  const p = H.applyEvidence(planOf(), { coordsOf });
  assert.equal(ev(p, 'stay:hot_tub').status, 'verified');
  assert.equal(ev(p, 'stay:hot_tub').text, 'Hot tub: Beach Hotel’s listing says it has a hot tub.');
  assert.equal(ev(p, 'stay:hot_tub').labelFr, 'Bain à remous'); // not « Spa », which the French plan also uses for a spa outing
  assert.ok(!p.evidence.some((e) => /^kind:(?:sauna|spa)$/.test(e.ask)));
  const nc = ev(p, 'no_car');
  assert.equal(nc.status, 'unknown');
  assert.equal(nc.line, true); // printed under Details
  assert.equal(nc.rides, 1);
  // The summary: the need is there, flagged; the hot tub is said once, and nothing says it is missing.
  const facts = L.tripSummaryFacts(p, false, {}).map((f) => f.text);
  assert.ok(facts.includes('No car: 1 ride to check'), facts.join(' | '));
  assert.ok(facts.includes('Hot tub ✓'));
  assert.ok(facts.includes('Spa: not in this plan'));
  assert.equal(facts.filter((t) => /hot tub/i.test(t)).length, 1);
  const fr = L.tripSummaryFacts(p, true, {}).map((f) => f.text);
  assert.ok(fr.includes('Sans voiture : 1 trajet à vérifier'), fr.join(' | '));
  assert.ok(fr.includes('Bain à remous ✓'));
  // A stop taken off the page no longer counts.
  assert.ok(L.tripSummaryFacts(p, false, { removed: { 3: 1 } }).map((f) => f.text).includes('No car: short walks (approx.)'));
  // The hotel picked doesn't list one: said honestly, still one line.
  const q = H.applyEvidence(planOf({ whereToStay: { pick: { id: 9, name: 'Beach Hotel', regionLabel: 'Osoyoos', has: [] }, amenity: { keys: ['hot_tub'] } } }), { coordsOf });
  assert.equal(ev(q, 'stay:hot_tub').status, 'unmet');
  assert.match(ev(q, 'stay:hot_tub').text, /Beach Hotel’s listing doesn’t say\.$/);
  assert.ok(L.tripSummaryFacts(q, false, {}).some((f) => f.kind === 'flag' && /^Hot tub/.test(f.text)));
  // A sauna asked of the stay: no stay listing carries that fact, so it is unknown, never there or missing.
  const s = H.applyEvidence(planOf({ stayAlso: ['sauna'], whereToStay: { pick: { id: 9, name: 'Beach Hotel', has: [] } } }), { coordsOf });
  assert.equal(ev(s, 'stay:sauna').status, 'unknown');
  assert.match(ev(s, 'stay:sauna').text, /doesn’t say whether it has a sauna/);
});

test('5. each card’s note, the booking sheet and the shared copy read the same rows', () => {
  const p = H.applyEvidence(planOf(), { coordsOf });
  const n = A.stopNeedNotes(p, 3, false);
  assert.deepEqual(n.notes, ['No car: about 3 km from Corner Bistro · check a ride']);
  assert.deepEqual(n.compact, ['About 3 km away · check a ride']);
  assert.deepEqual(n.open, []); // the Book my trip sheet says it once, in its own line, not once per stop
  assert.deepEqual(A.stopNeedNotes(p, 1, false).notes, []); // a short walk from the hotel: nothing on the card
  assert.deepEqual(A.stopNeedNotes(p, 3, true).notes, ['Sans voiture : env. 3 km depuis Corner Bistro · prévoyez un transport']);
  // The page reads the same rows (the card note and the Book my trip sheet).
  assert.match(V4, /e\.ask === 'no_car' && Array\.isArray\(e\.stops\) && hasNeed\('no_car'\)/);
  assert.match(V4, /data-v4-book-nocar/);
  assert.match(CHAT_PAGE, /j\.needPatch/);
});

test('6. the share link carries both asks; the shared copy works the same lines out again', () => {
  const p = H.applyEvidence(planOf(), { coordsOf });
  const asks = H.shareAsks(p);
  assert.ok(asks.includes('no_car') && asks.includes('stay:hot_tub'), asks.join(','));
  assert.ok(!asks.some((a) => /sauna/.test(a)));
  const c = H.parseShareContext({ asks: asks.join(','), stay: '9', start: '2027-05-07' });
  assert.ok(c.asks.includes('no_car'));
  assert.match(H.shareContextQuery(c), /asks=[^&]*no_car/);
  const stops = [{ id: 1, name: 'Corner Bistro', type: 'restaurant', region: 'osoyoos', day: 1, start: 720, kinds: [] }, { id: 3, name: 'Hill Winery', type: 'winery', region: 'osoyoos', day: 1, start: 840, kinds: [] }];
  const sp = H.applyEvidence(H.sharedPlan(c, stops, [], { id: 9, name: 'Beach Hotel', regionLabel: 'Osoyoos', has: ['hot_tub'] }), { coordsOf });
  assert.deepEqual(sp.needs.map((x) => x.key), ['no_car']);
  assert.equal(ev(sp, 'no_car').text, ev(p, 'no_car').text.replace('1 of 3', '1 of 2'));
  assert.equal(ev(sp, 'stay:hot_tub').text, 'Hot tub: Beach Hotel’s listing says it has a hot tub.');
  assert.ok(!sp.evidence.some((e) => /not in this plan/.test(e.text) && /hot tub|sauna/i.test(e.text)));
  assert.equal(A.stopNeedNotes(sp, 3, false).text, 'No car: about 3 km from Corner Bistro · check a ride');
  // A sauna asked of the stay rides along too.
  const c2 = H.parseShareContext({ asks: 'stay:sauna', stay: '9' });
  const sp2 = H.applyEvidence(H.sharedPlan(c2, stops, [], { id: 9, name: 'Beach Hotel', has: [] }), { coordsOf });
  assert.equal(ev(sp2, 'stay:sauna').status, 'unknown');
});

test('7. a plan without these needs is untouched: no no-car entry, no new summary item, no note on a card', () => {
  const p = planOf({ query: 'A weekend in Osoyoos with wineries and vegetarian meals', needs: [], whereToStay: undefined, notIncluded: [] });
  H.applyEvidence(p, { coordsOf });
  assert.deepEqual(p.evidence.map((e) => e.ask), ['type:winery', 'vegetarian']);
  assert.deepEqual(L.tripSummaryFacts(p, false, {}).map((f) => f.text), ['Wineries ✓', 'Vegetarian ✓']);
  assert.deepEqual(A.stopNeedNotes(p, 3, false).notes, []);
  assert.deepEqual(H.shareAsks(p), ['type:winery', 'vegetarian']);
});

test('8. the chat’s word rules (no AI): "we do not have a car…" is the no-car turn; "a wine tour with pickup" is the tour card', () => {
  const stops = [{ key: '1-midday', id: 1, name: 'Corner Bistro', type: 'restaurant', day: 1, start: 720, role: 'lunch', region: 'osoyoos', badges: [], feats: [] }, { key: '1-afternoon', id: 3, name: 'Hill Winery', type: 'winery', day: 1, start: 840, role: '', region: 'osoyoos', badges: [], feats: [] }];
  const read = (m) => tc.rulesRead(m, stops, { regions: ['osoyoos'], regionLabels: { osoyoos: 'Osoyoos' }, days: 1, request: ASK }).ops.map((o) => `${o.o}:${o.value || o.kind || ''}`);
  const ops = read('We do not have a car. Can you arrange the plan so we can get between stops, and add a couples spa if possible?');
  assert.ok(ops.includes('transport:no_car'), ops.join(' '));
  assert.ok(ops.some((o) => /^add:spa/.test(o)), ops.join(' ')); // the spa is its own part
  assert.deepEqual(read('Show a wine tour with pickup'), ['transport:wine_tour']);
  assert.deepEqual(read('Montre un tour des vignobles avec prise en charge'), ['transport:wine_tour']);
  assert.deepEqual(read('nous n’avons pas de voiture'), ['transport:no_car']);
  for (const L2 of ['en', 'fr']) for (const k of ['noCarRides', 'noCarArrange', 'noCarWalk', 'noCarPlain', 'noCarAirport', 'noCarTourAsk', 'noCarTourSay', 'wineTourPickup']) assert.ok(tc.T[L2][k], `${L2}.${k}`);
});

// ---------- End to end: the planner and the chat handler on test listings made for this file ----------
const app = require('../server.js');
const db = require('../db.js');
const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
// dKm: how far north of the test hotel the place is.
const mk = (key, dKm, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${300 + n} Hop Test Road, ${TOWN}, BC`, latitude: AT[0] + dKm / 111, longitude: AT[1], description: 'A place used only by the no-car tests. Open all year.', slug: `nocar-test-${key.toLowerCase().replace(/_/g, '-')}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  mk('R_NEAR', 0.3, { type: 'restaurant', name: 'Linden Bistro NC', vegetarian: 1, price: 2, hours: HOURS });
  mk('R_MID', 0.6, { type: 'restaurant', name: 'Marlow Grill NC', vegetarian: 1, price: 2, hours: HOURS });
  mk('W_FAR', 3.5, { type: 'winery', name: 'Quarry Cellars NC', hours: HOURS });
  mk('H_TUB', 0, { type: 'stay', cuisine: 'hotel', name: 'Harbourside Inn NC' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.H_TUB.id, JSON.stringify({ hot_tub: true, max_guests: 4, confidence: 'high', booking: { own: 'https://www.example.com/nocar-hotel' } }), '2026-11-20T00:00:00Z', 'test');
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of made) { try { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); } catch (e) { /* no such table */ } db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const run = (text) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text }, { v4: true, stays: true }).value, v4: true }, true);
const pageOf = (text, rows, stayId) => ({ text, stops: rows.map(([key, f, start]) => ({ key, id: F[f].id, start })), stayId });
const say = async (page, message, lang = 'en') => {
  const parsed = app.parseTripChatBody({ message, lang, plan: { text: page.text, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: page.stops, dayDates: ['2027-05-07', '2027-05-08'], ...(page.stayId ? { stayId: page.stayId } : {}) }, { stays: true });
  assert.ok(!parsed.error, parsed.error);
  return (await app.runTripChatTurn(parsed.value, { staysOn: true, lang })).response;
};

test('9. the planner: the request’s no-car need is on the plan, in its evidence and its summary; the hot tub makes no outing request', () => {
  const p = run(`Plan a 2-day getaway in ${TOWN} for two adults from May 7 to May 8, 2027. We want vegetarian meals and a hotel with a hot tub. We do not have a car and want a relaxed pace.`);
  assert.ok(['multi_day', 'day_plan'].includes(p.kind), p.kind);
  assert.ok((p.needs || []).some((n) => n && n.key === 'no_car'), JSON.stringify(p.needs));
  const nc = ev(p, 'no_car');
  assert.ok(nc && nc.status === 'unknown' && /^No car: /.test(nc.text) && /^Sans voiture : /.test(nc.textFr));
  assert.ok(L.tripSummaryFacts(p, false, {}).some((f) => /^No car: /.test(f.text)));
  assert.ok(!(p.requirementResults || []).some((r) => r.kind === 'venue_kind' && ['sauna', 'spa'].includes(r.value)));
  assert.ok(!(p.notIncluded || []).some((x) => x && ['sauna', 'spa'].includes(x.kind)));
  assert.ok(!(p.evidence || []).some((e) => /not in this plan/.test(e.text || '') && /hot tub|sauna/i.test(e.text || '')));
  assert.ok(H.shareAsks(p).includes('no_car'));
  assert.equal(p.pace || (p.understood && p.understood.pace) || 'relaxed', 'relaxed');
  // The same request without the two needs: neither appears.
  const q = run(`Plan a 2-day getaway in ${TOWN} for two adults from May 7 to May 8, 2027. We want vegetarian meals.`);
  assert.ok(!(q.needs || []).some((n) => n && n.key === 'no_car'));
  assert.ok(!ev(q, 'no_car') && !ev(q, 'stay:hot_tub') && !ev(q, 'stay:sauna'));
  assert.ok(!L.tripSummaryFacts(q, false, {}).some((f) => /No car|Hot tub/.test(f.text)));
});

test('10. the chat follow-up: says which trips are more than a short walk, that no ride is checked, and changes nothing', async () => {
  const text = `Plan a 2-day getaway in ${TOWN}. We want wineries and vegetarian meals. We do not have a car.`;
  const page = pageOf(text, [['1-midday', 'R_NEAR', 720], ['1-afternoon', 'W_FAR', 840], ['1-evening', 'R_MID', 1080]], F.H_TUB.id);
  const j = await say(page, 'We do not have a car. Can you arrange the plan so we can get between stops?');
  assert.match(j.reply, /^I can’t make this plan walkable from the listings: by straight-line distance, 2 of 3 trips between your stops are more than a short walk; the longest is Linden Bistro NC to Quarry Cellars NC \(about 3 km\)\. I can’t check taxis, shuttles or buses here, so I left the stops as they are\./);
  assert.ok(!j.plan && !(j.changed || []).length);
  assert.equal(j.actions.transport, 'no_car');
  assert.ok(!/taxis are limited|book rides ahead|need a car or a taxi/.test(j.reply));
  assert.equal(j.text, undefined); // the request already says it: nothing to add
  // A plain statement, in French, on a plan whose request did not say it: the request gains the words and the page
  // gets the need and its line (no stop changes).
  const page2 = pageOf(`2 jours à ${TOWN}, vignobles et repas végétariens`, page.stops.map((s, i) => [s.key, ['R_NEAR', 'W_FAR', 'R_MID'][i], s.start]), F.H_TUB.id);
  const k = await say(page2, 'Nous n’avons pas de voiture', 'fr');
  assert.match(k.reply, /^C’est noté : sans voiture\. À vol d’oiseau, 2 des 3 trajets entre vos arrêts dépassent une courte marche/);
  assert.ok(T.readNoCar(k.text), k.text);
  assert.equal(k.needPatch.need.key, 'no_car');
  assert.equal(k.needPatch.evidence.rides, 2);
  assert.ok(!k.plan);
  // Stops a short walk apart: said as approximate.
  const near = await say(pageOf(text, [['1-midday', 'R_NEAR', 720], ['1-evening', 'R_MID', 1080]], F.H_TUB.id), 'we don’t have a car');
  assert.match(near.reply, /^Noted: no car\. By straight-line distance, every trip between your stops is under about 1 km, a short walk\. Walking routes aren’t checked\./);
});

test('11. a message with no such need is read as before', async () => {
  const text = `Plan a 2-day getaway in ${TOWN}. We want wineries and vegetarian meals.`;
  const page = pageOf(text, [['1-midday', 'R_NEAR', 720], ['1-afternoon', 'W_FAR', 840]], F.H_TUB.id);
  const j = await say(page, 'remove Quarry Cellars NC');
  assert.ok(!j.needPatch && !/Noted: no car|straight-line/i.test(j.reply));
  assert.deepEqual(j.actions.remove, ['1-afternoon']);
});
