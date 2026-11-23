'use strict';
// Build My Trip (2026-11-23, Dayton's report at 390px): "Plan a 3-day trip in Oliver … for one adult and a 15-year-old.
// We want cycling, swimming and casual food. No alcohol or wineries please. We need a hotel for two nights and our total
// budget is $600 for both of us." Then in the chat: "Does this stay within our total $600 budget including two hotel
// nights, meals and activities? Please replace the splash park with a cycling activity suitable for a 15-year-old."
//   1. The chat changed the place to stay (nobody asked): "stay", "hotel" and "budget" were read as "a cheaper hotel".
//   2. The budget question was not answered.
//   3. The request part was dropped (a "?" did not end an ask), and "the splash park" did not find the Spray Park.
//   4. The $600 was nowhere on the plan, the Book my trip sheet or the shared copy.
// No network; the word rules only (no AI reader).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const B = require('../trip-budget.js');
const H = require('../trip-honest-plan.js');
const tb = require('../trip-booking.js');
const tc = require('../trip-chat.js');
const W = require('../trip-workspace-layout.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'whistler' : 'kelowna';
const TOWN = WR ? 'Whistler' : 'Kelowna';
const AT = WR ? [50.1163, -122.9574] : [49.887, -119.496];
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${700 + n} Budget Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 4000, longitude: AT[1], description: 'A place used only by the budget and chat tests. Open all year.', slug: `bgt-test-${key.toLowerCase()}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const stayInfo = (v, level) => db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ price_level: level, sleeps: 4, confidence: 'high', booking: { own: `https://${v.slug}.example.com/book` } }), '2026-11-23T00:00:00Z', 'test-bgt');
test.before(() => {
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Lakeside Hotel BGT' }); stayInfo(F.HOTEL, 2);
  mk('CHEAP', { type: 'stay', cuisine: 'motel', name: 'Fixture Thrifty Motel BGT' }); stayInfo(F.CHEAP, 1);
  mk('SPRAY', { type: 'outdoor', name: 'Fixture Spray Park BGT', kid_friendly: 1, hours: HOURS, description: 'A free splash pad with a playground for kids aged 2 to 12. Open all year.' });
  mk('LUNCH', { type: 'restaurant', name: 'Fixture Taco Counter BGT', price: 1, hours: HOURS });
  mk('DINNER', { type: 'restaurant', name: 'Fixture Pizza Table BGT', price: 2, hours: HOURS });
  mk('TRAIL', { type: 'outdoor', name: 'Fixture Hike and Bike Trail BGT', kid_friendly: 1, hours: HOURS, description: 'A wide, flat dyke path, great for all ages on foot or by bicycle. Open all year.' });
  mk('WINEBIKE', { type: 'tour', name: 'Fixture Vineyard Bike Tours BGT', hours: HOURS, description: 'Guided e-bike rides to wineries, with tastings and a vineyard lunch included. Open all year.' });
  mk('WATERBIKE', { type: 'tour', name: 'Fixture Water Bikes BGT', hours: HOURS, description: 'Pedal-powered water bikes to rent at the dock. Open all year.' });
  mk('ADULTBIKE', { type: 'tour', name: 'Fixture Night Bike Ride BGT', hours: HOURS, description: 'An evening bike ride for adults only, ages 19 and over. Open all year.' });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const k of ['HOTEL', 'CHEAP']) if (F[k]) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F[k].id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const REQ = `Plan a 2-day trip in ${TOWN} from July 10 to July 11, 2027 for one adult and a 15-year-old. We want swimming and casual food. No alcohol or wineries please. We need a hotel for one night and our total budget is $300 for both of us.`;
const ASK = 'Does this stay within our total $300 budget including the hotel night, meals and activities? Please replace the splash park with a cycling activity suitable for a 15-year-old.';
const stopsOn = () => [{ key: '1-morning', id: F.SPRAY.id, start: 600 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-evening', id: F.DINNER.id, start: 1080 }];
const turn = async (message, o = {}) => {
  const v = app.parseTripChatBody({ message, lang: o.lang || 'en', plan: { text: o.text || REQ, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: o.stops || stopsOn(), stayId: o.stayId || F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) }, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const stopIds = (p) => tc.planStops(p).map((s) => s.id);
// The stop now in the spray park's slot is a cycling stop by its own listing's words (the fixture trail, or a real bike
// trail or park of this site's own listings), never one of the three the trip's rules keep out.
const cyclingIn = (p, what) => {
  const s = tc.planStops(p).find((x) => x.key === '1-morning');
  assert.ok(s && s.id !== F.SPRAY.id, `${what}: the spray park is replaced`);
  const row = db.prepare('SELECT name, type, description FROM venues WHERE id = ?').get(s.id);
  assert.match(tc.fold(`${row.name} ${String(row.description || '').split(/(?<=[.!?])\s/)[0]}`), /(?:^|[^a-z])(?:bike|biking|bicycl|cycl|e-bike|ebike|velo)/, `${what}: ${row.name} is a cycling stop`);
  assert.ok(['outdoor', 'sport', 'tour'].includes(row.type), `${what}: ${row.type}`);
  for (const k of ['WINEBIKE', 'WATERBIKE', 'ADULTBIKE']) assert.notEqual(s.id, F[k].id, `${what}: never ${k}`);
  assert.doesNotMatch(`${row.name} ${row.description || ''}`, /water[- ]?bikes?/i, `${what}: never a water bike`);
  if (row.type === 'tour') assert.doesNotMatch(`${row.name} ${row.description || ''}`, /\b(?:wine|winer(?:y|ies)|tastings?|brewer(?:y|ies))\b/i, `${what}: never a tour of wineries on a no-alcohol trip`);
  return s;
};

test('1. the budget is read from the request: total, per person, a night; English and French; a price for one thing is not', () => {
  const r = (t) => { const b = B.readBudget(t); return b ? [b.amount, b.scope] : null; };
  for (const [t, want] of [
    ['We need a hotel for two nights and our total budget is $600 for both of us.', [600, 'total']],
    ['3 days in Kelowna, $600 total', [600, 'total']],
    ['a weekend with a budget of $600', [600, 'total']],
    ['Penticton weekend under $600 all in', [600, 'total']],
    ['our budget is $1,200', [1200, 'total']],
    ['we can spend up to 1500 dollars', [1500, 'total']],
    ['2 days in Oliver, budget $300 per person', [300, 'per_person']],
    ['We have $600 to spend each', [600, 'per_person']],
    ['hotel under $200 a night', [200, 'per_night']],
    ['Fin de semaine à Oliver, notre budget total est de 600 $ pour nous deux', [600, 'total']],
    ['Deux jours à Kelowna, budget de 300 $ par personne', [300, 'per_person']],
    ['moins de 800 $ en tout pour le voyage', [800, 'total']],
    ['une chambre à moins de 200 $ par nuit', [200, 'per_night']],
  ]) assert.deepEqual(r(t), want, t);
  for (const t of ['dinner under $50 in Kelowna', 'a weekend in Kelowna on a budget', '3 days in Kelowna for 4 adults', '$100 a day in Kelowna', 'a $25 tasting and lunch', 'Kelowna weekend, budget is not an issue', '']) assert.equal(r(t), null, t);
});

test('2. a question about the cost is a question; a request for something cheaper is not', () => {
  const q = (m) => B.isBudgetQuestion(tc.fold(m));
  for (const m of ['Does this stay within our total $600 budget including two hotel nights, meals and activities?', 'how much will this trip cost?', 'is this within budget?', 'are we over budget', 'what is the total cost', 'can we afford this', 'Est-ce que ça respecte notre budget de 600 $ ?', 'Combien coûte le voyage au total ?']) assert.equal(q(m), true, m);
  for (const m of ['is there a budget hotel?', 'how much is dinner at Joey?', 'find a cheaper hotel', 'make it fit our $600 budget', 'is the spray park open Sunday?', 'how much is it?', 'somewhere cheaper to stay']) assert.equal(q(m), false, m);
  // The word rules: the question alone is one ask op (never a stay op), whatever words it carries.
  const stops = app.tripChatStops(stopsOn());
  const r = tc.rulesRead('Does this stay within our total $600 budget including two hotel nights, meals and activities?', stops, { days: 1, request: REQ });
  assert.deepEqual(r.ops.map((o) => [o.o, o.value]), [['ask', 'q_budget']]);
  assert.equal(r.explain, true);
  // "find a cheaper hotel" is still a change to the stay.
  assert.ok(tc.rulesRead('find a cheaper hotel', stops, { days: 1, request: REQ }).ops.some((o) => o.o === 'stay' && o.value === 'budget'));
});

test('3. the limit beside the estimate: over, maybe over, under on what is priced; never "within budget"', () => {
  const est = (low, high, o = {}) => ({ low, high, people: 2, peopleAssumed: false, openLow: low === null, openHigh: high === null, unknown: o.unknown || [],
    parts: [{ key: 'stay', label: 'Stay', labelFr: 'Hébergement', low: low === null ? null : 300, high: high === null ? null : 500, count: 2, nights: 2, rooms: 1 }, { key: 'meals', label: 'Meals', labelFr: 'Repas', low: 270, high: 420, count: 6, fromPriceLevel: 6 }] });
  const b = { amount: 600, scope: 'total' };
  const maybe = B.facts(est(570, 920), b, { hasStay: true });
  assert.equal(maybe.status, 'maybe'); assert.equal(maybe.overHigh, 320);
  const L = B.lines(maybe, 'en');
  assert.equal(L.chat, 'Estimate: $570–$920 for 2 vs your $600 total: could be up to $320 over. Counted: 2 hotel nights ($300–$500), meals ($270–$420 by price level). Not counted: taxes, tips, fees, getting around.');
  assert.deepEqual(L.share, ['Budget: $600 total. Estimate so far: $570–$920 for 2 (2 hotel nights + 6 stops): could be up to $320 over.', 'Not included: taxes, tips, fees, getting around. Estimates from listings, not final prices.']);
  assert.equal(L.summary, 'Budget $600 · est. $570–$920 (may go over)');
  assert.equal(L.sheet, 'Your budget: $600 total. Estimate $570–$920 for 2: could be up to $320 over.');
  const fr = B.lines(maybe, 'fr');
  assert.equal(fr.share[0], 'Budget : 600 $ au total. Estimation jusqu’ici : 570–920 $ pour 2 (2 nuits d’hébergement + 6 arrêts) : pourrait dépasser de 320 $ au plus.');
  assert.match(fr.chat, /^Estimation : 570–920 \$ pour 2, pour un budget de 600 \$ au total : pourrait dépasser de 320 \$ au plus\. /);
  const over = B.facts(est(700, 920), b, { hasStay: true });
  assert.equal(over.status, 'over'); assert.match(B.lines(over, 'en').chat, /about \$100–\$320 over/);
  const under = B.facts(est(400, 560), b, { hasStay: true });
  assert.equal(under.status, 'under'); assert.match(B.lines(under, 'en').chat, /vs your \$600 total: under, on listed prices\./);
  // Unpriced items: "under" is said only of what is priced, with the count; the names follow.
  const part = B.facts(est(400, 560, { unknown: ['Bowling Alley', 'Pool', 'Lift tickets'] }), b, { hasStay: true });
  assert.equal(part.status, 'under_priced');
  assert.match(B.lines(part, 'en').chat, /under on what’s priced, but 3 items have no price\. .*No price: Bowling Alley, Pool, Lift tickets\./);
  assert.match(B.lines(part, 'en').share[0], /under on what’s priced, but 3 items have no price\.$/);
  // A stay with no price band is an unpriced item too, by name.
  const noStay = B.facts({ low: 270, high: 420, people: 2, unknown: [], parts: [{ key: 'meals', label: 'Meals', low: 270, high: 420, count: 6 }] }, b, { hasStay: true, stayName: 'Quiet Inn' });
  assert.equal(noStay.status, 'under_priced'); assert.match(B.lines(noStay, 'en').chat, /but 1 item has no price\. .*No price: the stay \(Quiet Inn\)\./);
  // An open end ("up to $720") is never read as under.
  const open = B.facts(est(null, 720), b, { hasStay: true });
  assert.equal(open.status, 'maybe'); assert.match(B.lines(open, 'en').chat, /^Estimate: up to \$720 for 2 vs your \$600 total: could be up to \$120 over\./);
  // Too little priced: said so.
  assert.equal(B.facts({ parts: [], unknown: [] }, b, {}).status, 'unknown');
  // Per person and a night.
  const pp = B.facts(est(570, 920), { amount: 300, scope: 'per_person' }, { hasStay: true });
  assert.equal(pp.limitTotal, 600); assert.match(B.lines(pp, 'en').chat, /vs your \$300 per person \(\$600 for 2\): could be up to \$320 over/);
  const night = B.facts(est(570, 920), { amount: 200, scope: 'per_night' }, { hasStay: true });
  assert.deepEqual([night.low, night.high, night.status, night.overHigh], [150, 250, 'maybe', 50]);
  assert.match(B.lines(night, 'en').chat, /^Estimate: \$150–\$250 a night vs your \$200 a night: could be up to \$50 over\./);
  // No wording, in any state or language, says "within budget".
  for (const f of [maybe, over, under, part, noStay, open, pp, night]) for (const lang of ['en', 'fr']) { const l = B.lines(f, lang); assert.doesNotMatch([l.chat, l.summary, l.sheet, ...l.share].join(' '), /within (?:your |the |our )?budget|dans (?:votre|le) budget|respecte/i); }
});

test('4. one message, a question and a request: each part is read on its own, in either order', () => {
  assert.deepEqual(tc.agent.splitAsks(ASK), ['Does this stay within our total $300 budget including the hotel night, meals and activities?', 'Please replace the splash park with a cycling activity suitable for a 15-year-old']);
  const stops = app.tripChatStops(stopsOn());
  // "the splash park" (and a water park, a splash pad) is the Spray Park on the plan.
  for (const m of ['the splash park', 'the spray park', 'the splash pad', 'the water park', 'les jeux d’eau']) assert.deepEqual(tc.stopsNamed(tc.fold(m), stops).map((s) => s.id), [F.SPRAY.id], m);
  const swap = tc.rulesRead('Please replace the splash park with a cycling activity suitable for a 15-year-old', stops, { days: 1, request: REQ });
  assert.equal(swap.ops.length, 1);
  assert.deepEqual([swap.ops[0].o, swap.ops[0].stops[0].id, swap.ops[0].kind, swap.ops[0].age], ['replace', F.SPRAY.id, 'cycling', 15]);
  // With a bike trail already on the plan, the stop replaced is still the one named before "with".
  const withTrail = app.tripChatStops([{ key: '1-morning', id: F.TRAIL.id, start: 540 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-afternoon', id: F.SPRAY.id, start: 840 }]);
  const swap2 = tc.rulesRead('Please replace the splash park with a cycling activity suitable for a 15-year-old', withTrail, { days: 1, request: REQ });
  assert.deepEqual([swap2.ops.length, swap2.ops[0].o, swap2.ops[0].stops[0].id, swap2.ops[0].kind], [1, 'replace', F.SPRAY.id, 'cycling']);
  // A question about a stop and a request in one message: both are read (the question never swallows the request).
  const both = tc.rulesRead('Is the spray park good for kids? Replace the taco counter with pizza.', stops, { days: 1, request: REQ });
  assert.deepEqual(both.ops.map((o) => o.o).sort(), ['ask', 'replace']);
  // "a bike tour" stays the tour kind; "cycling" is the new kind.
  assert.deepEqual(tc.kindsNamed('add a bike tour'), ['bike_tour']);
  assert.equal(tc.kindsNamed('a cycling activity')[0], 'cycling');
});

test('5. Dayton\'s message: the budget is answered from the estimate, the splash park is swapped for a cycling stop, the stay does not change', async () => {
  const r = await turn(ASK);
  // The question, first: the estimate beside the limit, what is counted, what is not.
  assert.match(r.reply, /^Estimate: [^.]+ for 2 vs your \$300 total: /);
  assert.match(r.reply, /Counted: 1 hotel night \(\$150–\$250\)/);
  assert.match(r.reply, /Not counted: taxes, tips, fees, getting around\./);
  assert.doesNotMatch(r.reply, /within (?:your |our )?budget/i);
  // The request: the spray park is replaced by the bike trail (never the winery bike tour, a water bike or an adults' ride).
  assert.ok(r.plan, 'a new plan');
  const ids = stopIds(r.plan);
  const fresh = cyclingIn(r.plan, 'question first');
  assert.ok(ids.includes(F.LUNCH.id) && ids.includes(F.DINNER.id), 'the other stops stay');
  assert.ok(r.reply.includes(`Swapped Fixture Spray Park BGT for ${fresh.name}`), r.reply);
  // Its age line is the listing's own words ("all ages"), else "check": never our own claim that it suits a teen.
  assert.match(r.reply, /Its listing says “[^”]+”\.|Its listing gives no ages: check it suits a 15-year-old\./);
  if (fresh.id === F.TRAIL.id) assert.match(r.reply, /Its listing says “all ages”\./);
  assert.doesNotMatch(r.reply, /suitable for|good for a 15|great for a 15/i);
  assert.ok(r.reply.indexOf('Estimate:') < r.reply.indexOf('Swapped'), 'answered in the order asked');
  // The stay: the same one, and nothing in the response changes it.
  assert.equal(r.plan.whereToStay.pick.id, F.HOTEL.id);
  assert.equal(r.stayBlock, undefined); assert.equal(r.stayPref, undefined);
  assert.doesNotMatch(r.reply, /Now staying/);
  // The request text keeps the budget, the teen and no alcohol; the plan carries the budget beside its estimate.
  assert.match(r.req.text, /total budget is \$300 for both of us/);
  assert.match(r.req.text, /15-year-old/); assert.match(r.req.text, /No alcohol or wineries/);
  assert.deepEqual([r.plan.budget.amount, r.plan.budget.scope], [300, 'total']);
  assert.equal(r.plan.whereToStay.pick.budget.limit, 300);
  assert.deepEqual(r.plan.whereToStay.trip.kidAges, [15]);
  // Over or maybe over: a cheaper stay we list is offered by name, as the last thing said; nothing changes without a yes.
  assert.ok(['over', 'maybe'].includes(r.plan.whereToStay.pick.budget.status), r.plan.whereToStay.pick.budget.status);
  assert.match(r.reply, /Cheaper stay I list: Fixture Thrifty Motel BGT \(then [^)]+\)\. Want to switch\?$/);
  assert.deepEqual(r.offer, ['Fixture Thrifty Motel BGT [stay cheaper]']);
  // The other order: the swap is said first, then the estimate.
  const r2 = await turn('Please replace the splash park with a cycling activity suitable for a 15-year-old. Does this stay within our total $300 budget?');
  assert.ok(r2.plan); cyclingIn(r2.plan, 'request first');
  assert.ok(r2.reply.indexOf('Swapped') < r2.reply.indexOf('Estimate:'), r2.reply);
  assert.equal(r2.plan.whereToStay.pick.id, F.HOTEL.id);
  assert.equal(r2.stayBlock, undefined);
  // French.
  const fr = await turn('Est-ce que ça respecte notre budget total de 300 $? Remplace les jeux d’eau par une activité de vélo.', { lang: 'fr' });
  assert.match(fr.reply, /^Estimation : [^.]+ pour 2, pour un budget de 300 \$ au total : /);
  assert.ok(fr.plan, fr.reply); cyclingIn(fr.plan, 'French');
  assert.equal(fr.plan.whereToStay.pick.id, F.HOTEL.id);
});

test('6. the question alone changes nothing; a yes to the offered cheaper stay is the only way the stay changes', async () => {
  const q = await turn('Does this stay within our total $300 budget including the hotel night, meals and activities?');
  assert.equal(q.plan, null); assert.equal(q.req, null); assert.deepEqual(q.changed, []);
  assert.equal(q.stayBlock, undefined); assert.equal(q.stayPref, undefined);
  assert.match(q.reply, /^Estimate: /);
  // A cost question on a trip with no budget: the estimate alone, nothing compared.
  const none = await turn('how much will this trip cost?', { text: `Plan a 2-day trip in ${TOWN} for one adult and a 15-year-old. We need a hotel for one night.` });
  assert.match(none.reply, /^Estimate: [^.]+ for 2\. Counted: /); assert.doesNotMatch(none.reply, /vs your/);
  assert.equal(none.plan, null); assert.equal(none.stayBlock, undefined);
  // A plain swap (no question) keeps the stay too.
  const s = await turn('replace the splash park with a bike ride');
  assert.ok(s.plan, s.reply); cyclingIn(s.plan, 'a plain swap');
  assert.equal(s.plan.whereToStay.pick.id, F.HOTEL.id); assert.equal(s.stayBlock, undefined);
  assert.deepEqual(q.offer, ['Fixture Thrifty Motel BGT [stay cheaper]']);
  const yes = await turn('yes', { offer: q.offer });
  assert.ok(yes.stayBlock && yes.stayBlock.whereToStay.pick.id === F.CHEAP.id, yes.reply);
  assert.equal(yes.plan, null, 'the stops are not planned again');
  // The cheaper stay carries the budget beside its own estimate.
  assert.equal(yes.stayBlock.whereToStay.pick.budget.limit, 300);
  // A no keeps everything.
  const no = await turn('no thanks', { offer: q.offer });
  assert.equal(no.stayBlock, undefined); assert.equal(no.plan, null);
});

test('7. what a swap must not pick, from each listing\'s own words; no suitable place is said plainly', () => {
  const types = ['outdoor', 'sport', 'tour'];
  const dry = app.tripChatUnfit({ kind: 'cycling', age: 15, types }, null, REQ);
  for (const k of ['WINEBIKE', 'WATERBIKE', 'ADULTBIKE']) assert.ok(dry.includes(F[k].id), k);
  assert.ok(!dry.includes(F.TRAIL.id));
  // The spray park's own words ("kids aged 2 to 12") leave a 15-year-old out; a 6-year-old fits.
  assert.ok(app.tripChatUnfit({ kind: null, age: 15, types: ['outdoor'] }, null, REQ).includes(F.SPRAY.id));
  assert.ok(!app.tripChatUnfit({ kind: null, age: 6, types: ['outdoor'] }, null, REQ).includes(F.SPRAY.id));
  // A trip that drinks, with no age asked: the winery bike tour is a cycling stop like any other; a water bike never is.
  const wet = app.tripChatUnfit({ kind: 'cycling', age: null, types }, null, `2 days in ${TOWN}`);
  assert.ok(!wet.includes(F.WINEBIKE.id) && wet.includes(F.WATERBIKE.id));
  assert.deepEqual(app.tripListingAges('a playground for kids aged 2 to 12'), { min: 2, max: 12 });
  assert.equal(app.tripListingAges('Great for all ages on foot or by bicycle'), null);
  assert.equal(app.tripChatAgeNote(F.TRAIL.id, 15, 'en'), 'all ages');
  assert.equal(app.tripChatAgeNote(F.LUNCH.id, 15, 'en'), null);
  // The reply when nothing suitable fits: the stop stays; the nearest one we list is only named.
  const old = { id: 1, key: '1-morning', name: 'Kinsmen Spray Park', day: 1, type: 'outdoor' };
  const fail = { plan: null, req: null, actions: { remove: [], keep: [] }, changed: [], results: [{ op: 'replace', ok: false, local: true, old, kind: 'cycling', why: 'no_fit', age: 15, nearest: { name: 'Canal Walkway', town: 'Osoyoos' } }] };
  assert.match(tc.buildReply(fail, { lang: 'en' }), /I couldn’t find a cycling stop that fits there, so Kinsmen Spray Park stays\. The nearest one I list is Canal Walkway in Osoyoos\./);
  assert.match(tc.buildReply(fail, { lang: 'fr' }), /donc Kinsmen Spray Park reste\. Le plus proche que je répertorie : Canal Walkway, à Osoyoos\./);
  // A swap whose new stop's listing gives no ages says "check", never that it suits.
  const okNoAge = { plan: {}, req: {}, actions: { remove: [], keep: [] }, changed: ['1-morning'], results: [{ op: 'replace', ok: true, local: true, old, kind: 'cycling', age: 15, ageSays: null, fresh: { id: 2, key: '1-morning', name: 'Rail Trail', day: 1, start: 600 } }] };
  assert.match(tc.buildReply(okNoAge, { lang: 'en' }), /Its listing gives no ages: check it suits a 15-year-old\./);
});

test('8. the plan carries the budget beside each stay\'s estimate; a plan with no budget is as before', () => {
  const run = (text) => { const b = app.parseTripPlanBody({ text }, { v4: true, stays: true }); assert.ok(b.value, JSON.stringify(b.error)); return app.runTripPlanRequest(b.value, true); };
  const p = run(REQ);
  assert.deepEqual([p.budget.amount, p.budget.scope], [300, 'total']);
  const w = p.whereToStay;
  assert.ok(w && w.pick && w.pick.budget, 'the pick has the budget facts');
  assert.equal(w.budget, w.pick.budget);
  // The same numbers as the estimate "Book my trip" shows.
  assert.equal(w.pick.budget.low, w.pick.estimate.openLow ? null : w.pick.estimate.low);
  assert.equal(w.pick.budget.high, w.pick.estimate.openHigh ? null : w.pick.estimate.high);
  assert.match(w.pick.budget.text.sheet, /^Your budget: \$300 total\. /);
  assert.match(w.pick.budget.textFr.sheet, /^Votre budget : 300 \$ au total\. /);
  for (const c of w.alternatives || []) assert.equal(c.budget.limit, 300);
  // No budget in the request: no budget anywhere on the plan, and the booking block is the one main builds.
  const plain = run(`Plan a 2-day trip in ${TOWN} for one adult and a 15-year-old. We need a hotel for one night.`);
  assert.equal(plain.budget, undefined);
  assert.equal(plain.whereToStay.budget, undefined); assert.equal(plain.whereToStay.pick.budget, undefined);
  assert.ok((plain.whereToStay.alternatives || []).every((c) => c.budget === undefined));
  const block = { pick: { id: 1, name: 'A', priceLevel: 2, bookingLinks: [] }, alternatives: [], trip: { nights: 1, adults: 2 }, checklist: [] };
  assert.deepEqual(tb.withTripBooking(block, { days: [] }), tb.withTripBooking(block, { days: [] }, null));
  assert.equal(Object.prototype.hasOwnProperty.call(tb.withTripBooking(block, { days: [] }), 'budget'), false);
  // The summary: one short fact from the server's own words; without a budget the facts are the same list as before.
  const facts = W.tripSummaryFacts(p, false, { budget: w.pick.budget });
  assert.equal(facts.filter((f) => f.ask === 'budget').length, 1);
  assert.match(facts.find((f) => f.ask === 'budget').text, /^Budget \$300 · est\. /);
  assert.doesNotMatch(facts.find((f) => f.ask === 'budget').text, /✓/);
  assert.match(W.tripSummaryFacts(p, true, { budget: w.pick.budget }).find((f) => f.ask === 'budget').text, /^Budget 300 \$ · est\. /);
  assert.deepEqual(W.tripSummaryFacts(plain, false, {}), W.tripSummaryFacts(plain, false, { budget: null }));
  assert.ok(!W.tripSummaryFacts(p, false, {}).some((f) => f.ask === 'budget'));
});

test('9. the share link carries the limit and the estimate\'s figures; the copy words them again; an old link opens as before', () => {
  const base = { stops: `venue:${F.LUNCH.id},venue:${F.DINNER.id}`, days: '1,1', stay: String(F.HOTEL.id), nights: '1', ad: '1', kids: '1', ka: '15', asks: 'no_alcohol', td: '2027-09-03_2027-09-04', ts: 'r' };
  const q = { ...base, bg: '600t', be: '570.920.2.0.2.12.3.0' };
  const c = app.tripShareContext(q, 'en');
  assert.deepEqual(c.budgetLines, ['Budget: $600 total. Estimate so far: $570–$920 for 2 (2 hotel nights + 12 stops): could be up to $320 over.', 'Not included: taxes, tips, fees, getting around; 3 items have no price. Estimates from listings, not final prices.']);
  const html = app.tripShareContextHtml(c, 'en');
  assert.match(html, /data-mt-budget data-status="maybe"><strong>Budget: \$600 total\. Estimate so far: \$570–\$920 for 2 \(2 hotel nights \+ 12 stops\): could be up to \$320 over\.<\/strong> Not included: taxes, tips, fees, getting around; 3 items have no price\./);
  // The teen's age and the party ride along as before.
  assert.deepEqual(c.kidAges, [15]); assert.equal(c.adults, 1);
  const fr = app.tripShareContext(q, 'fr');
  assert.equal(fr.budgetLines[0], 'Budget : 600 $ au total. Estimation jusqu’ici : 570–920 $ pour 2 (2 nuits d’hébergement + 12 arrêts) : pourrait dépasser de 320 $ au plus.');
  // The EN / FR switch keeps the values.
  const again = H.shareContextQuery(H.parseShareContext(q));
  assert.match(again, /(?:^|&)bg=600t(?:&|$)/); assert.match(again, /(?:^|&)be=570\.920\.2\.0\.2\.12\.3\.0(?:&|$)/);
  // Under on what is priced with unpriced items; an open end; never "within budget".
  assert.match(app.tripShareContext({ ...base, bg: '600t', be: '300.560.2.0.2.9.2.0' }, 'en').budgetLines[0], /under on what’s priced, but 2 items have no price\.$/);
  assert.match(app.tripShareContext({ ...base, bg: '600t', be: 'x.720.2.0.2.12.0.0' }, 'en').budgetLines[0], /Estimate so far: up to \$720 for 2 .*could be up to \$120 over\.$/);
  assert.match(app.tripShareContext({ ...base, bg: '600t' }, 'en').budgetLines[0], /^Budget: \$600 total\. There are too few prices on file to compare\.$/);
  // An old link (no bg) and a bad value: no budget lines, and the block is what it always was.
  const old = app.tripShareContext(base, 'en');
  assert.equal(old.budgetLines, undefined); assert.equal(old.budget, undefined);
  assert.doesNotMatch(app.tripShareContextHtml(old, 'en'), /data-mt-budget/);
  for (const bad of ['600', 'abc', '600z', '5t', '-600t', '9999999t']) { const x = app.tripShareContext({ ...base, bg: bad, be: '570.920.2.0.2.12.3.0' }, 'en'); assert.equal(x.budgetLines, undefined, bad); assert.equal(app.tripShareContextHtml(x, 'en'), app.tripShareContextHtml(old, 'en'), bad); }
  assert.equal(B.toShare(B.facts({ low: 570, high: 920, people: 2, unknown: ['a', 'b', 'c'], parts: [{ key: 'stay', low: 300, high: 500, nights: 2, rooms: 1, count: 2 }, { key: 'meals', low: 270, high: 420, count: 12 }] }, { amount: 600, scope: 'total' }, { hasStay: true })), '&bg=600t&be=570.920.2.0.2.12.3.0');
  // The page builds the same parameters and puts the two lines in the copied text.
  assert.ok(V4.includes("out += '&bg=' + bg.limit + { total: 't', per_person: 'p', per_night: 'n' }[bg.scope] + '&be=' + [bx(bg.low), bx(bg.high), bx(bg.people), bg.peopleAssumed ? 1 : 0, bx(bg.nights), bx(bg.stops), bx(bg.unpriced), bg.stayMissing ? 1 : 0].join('.')"));
  assert.ok(V4.includes('bgT.copy.forEach(function(l){ lines.push(l); })'));
  assert.ok(V4.includes('data-v4-budget'));
});

test('10. the budget said in the chat is recorded with the request and compared; it never changes the stops or the stay', async () => {
  const NOB = `Plan a 2-day trip in ${TOWN} from July 10 to July 11, 2027 for one adult and a 15-year-old. We need a hotel for one night.`;
  const r = await turn('our budget is $300 total', { text: NOB });
  assert.match(r.reply, /^Budget noted: \$300 total\. Estimate: [^.]+ for 2 vs your \$300 total: /);
  assert.equal(r.plan, null, 'the stops are not planned again');
  assert.match(r.text, /We need a hotel for one night, total budget \$300$/);
  assert.deepEqual([B.readBudget(r.text).amount, B.readBudget(r.text).scope], [300, 'total']);
  // The stay part goes back with the budget beside its estimate: the same stay.
  assert.equal(r.stayBlock.whereToStay.pick.id, F.HOTEL.id);
  assert.equal(r.stayBlock.whereToStay.pick.budget.limit, 300);
  assert.equal(r.stayPref, undefined);
  // Changed later: the newest one is the trip's budget.
  const r2 = await turn('actually keep it under $500', { text: r.text });
  assert.match(r2.reply, /^Budget noted: \$500 total\. /);
  assert.deepEqual([B.readBudget(r2.text).amount, B.readBudget(r2.text).scope], [500, 'total']);
  assert.equal(r2.stayBlock.whereToStay.pick.id, F.HOTEL.id);
  // Per person, in French.
  const fr = await turn('notre budget est de 200 $ par personne', { text: NOB, lang: 'fr' });
  assert.match(fr.reply, /^Budget noté : 200 \$ par personne\. Estimation : /);
  assert.deepEqual([B.readBudget(fr.text).amount, B.readBudget(fr.text).scope], [200, 'per_person']);
  // The same budget again: said, nothing added.
  const same = await turn('our total budget is $300', { text: REQ });
  assert.match(same.reply, /^Budget noted: \$300 total\. /); assert.equal(same.text, undefined); assert.equal(same.stayBlock, undefined);
  // A budget message is never a "yes" to a pending offer, and "cheaper dinner" does not take the stay offer.
  const offer = ['Fixture Thrifty Motel BGT [stay cheaper]'];
  const keep = await turn('keep it under $280', { offer });
  assert.match(keep.reply, /^Budget noted: \$280 total\. /);
  assert.ok(!keep.stayBlock || keep.stayBlock.whereToStay.pick.id === F.HOTEL.id, 'the stay is not changed');
  const q = await turn('is that within our budget?', { offer });
  assert.match(q.reply, /^Estimate: /); assert.equal(q.stayBlock, undefined);
  const meal = await turn('cheaper dinner', { offer });
  assert.ok(!meal.stayBlock, 'a cheaper dinner is not a cheaper stay');
  assert.doesNotMatch(meal.reply, /Now staying/);
  // Its name is a yes.
  const named = await turn('the Thrifty Motel', { offer });
  assert.equal(named.stayBlock.whereToStay.pick.id, F.CHEAP.id);
  // A request for another place to stay is still that request, not a note about the budget.
  const stops = app.tripChatStops(stopsOn());
  assert.ok(tc.rulesRead('find us a cheaper hotel', stops, { days: 1, request: REQ }).ops.every((o) => o.o === 'stay'));
});
