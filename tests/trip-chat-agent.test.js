'use strict';
// Travel agent chat, agent round (2026-11-22, Dayton: "it doesn't suggest rental cars, it doesn't show the accommodation
// when we search"). The stay preference (trip-stays.js stay.pref), the "Getting here" card data (getting-here.js
// tripCard), the chat's stay / transport operations (rules + validator), POST /api/trip/chat changing the place to stay
// with the real planner and fixture stays, and the page: the agent's first message, Edit request gone and Confirm at the
// end only in chat mode (the default V4 page is unchanged). Fixture rows are removed at the end (`git checkout -q
// okanagan.db` if a run is interrupted).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.TRIP_CHAT;
delete process.env.DISCOVERCARS_AID;
const app = require('../server.js');
const db = require('../db.js');
const tc = require('../trip-chat.js');
const tripStays = require('../trip-stays.js');
const gh = require('../getting-here.js');

const made = [];
let base, srv;
test.before(async () => {
  let n = 0;
  const mk = (o, info) => {
    const v = app.createVenue({ region: 'penticton', type: 'stay', cuisine: 'hotel', address: `${100 + (++n)} Main Street, Penticton, BC`, latitude: 49.49 + n / 1000, longitude: -119.59, website: `https://example.com/stay-${n}`, description: 'A fixture used only by the trip chat agent tests.', ...o });
    made.push(v.id);
    db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ confidence: 'high', ...info }), '2026-11-22T00:00:00Z', 'test');
    return v;
  };
  mk({ slug: 'chat-agent-test-resort', name: 'Chat Agent Test Resort', cuisine: 'resort' }, { max_guests: 6, price_level: 3, pool: true, kid_friendly: true });
  mk({ slug: 'chat-agent-test-motel', name: 'Chat Agent Test Motel', cuisine: 'motel' }, { max_guests: 4, price_level: 1 });
  mk({ slug: 'chat-agent-test-suites', name: 'Chat Agent Test Suites' }, { max_guests: 5, price_level: 2, kitchen: true });
  mk({ slug: 'chat-agent-test-naramata-inn', name: 'Chat Agent Test Naramata Inn', cuisine: 'inn', region: 'naramata', latitude: 49.594, longitude: -119.586 }, { max_guests: 4, price_level: 3 });
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  for (const id of made) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  delete process.env.DISCOVERCARS_AID;
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
let ipN = 1;
const chat = async (body) => {
  const r = await fetch(`${base}/api/trip/chat?stays=1&v=4&chat=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-Real-IP': `10.7.0.${ipN++}` }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
};
const TEXT = '2 days in Penticton with the kids';
function planNow(stay = null) { return app.runTripPlanRequest(app.parseTripPlanBody({ text: TEXT, ...(stay ? { stay } : {}) }, { v4: true, stays: true }).value, true); }
const bodyFor = (plan, message, stay = null) => ({ message, lang: 'en', plan: { text: TEXT, seed: 0, excludeVenueIds: [], ...(stay ? { stay } : {}) }, locks: {}, removed: [], stops: tc.planStops(plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })) });

test('stay.pref: only known keys and values; it narrows the stays; "none" and a town', () => {
  assert.deepEqual(tripStays.parseTripStayInput({ pref: { maxPrice: 2, amenity: 'pool', region: 'naramata' } }).value, { pref: { maxPrice: 2, amenity: 'pool', region: 'naramata' } });
  assert.deepEqual(tripStays.parseTripStayInput({ arrive: '2027-07-09', leave: '2027-07-11', pref: { none: true } }).value.pref, { none: true });
  for (const bad of [{ cheap: true }, { maxPrice: 7 }, { amenity: 'sauna' }, { none: false }, { region: 'Not A Town!' }]) assert.ok(tripStays.parseTripStayInput({ pref: bad }).error, JSON.stringify(bad));
  const stays = [{ id: 1, region: 'penticton', info: { price_level: 1 } }, { id: 2, region: 'penticton', info: { price_level: 3, pool: true } }, { id: 3, region: 'naramata', info: {} }];
  assert.deepEqual(tripStays.staysForPref(stays, { maxPrice: 2 }).map((s) => s.id), [1], 'an unknown price never passes a price asked for');
  assert.deepEqual(tripStays.staysForPref(stays, { amenity: 'pool' }).map((s) => s.id), [2]);
  assert.deepEqual(tripStays.staysForPref(stays, { region: 'naramata' }).map((s) => s.id), [3]);
});

test('Getting here card data: overnight trips only; the airport by town; the car link only with DISCOVERCARS_AID', () => {
  const two = { kind: 'multi_day', days: [{ day: 1, stops: [{ venue: { region: 'penticton' } }] }, { day: 2, stops: [] }] };
  const one = { kind: 'day_plan', days: [{ day: 1, stops: [{ venue: { region: 'kelowna' } }] }] };
  const off = gh.tripCard(two, null, { cfg: { enabled: false }, viatorCfg: { enabled: false } });
  assert.equal(off.airport.code, 'YYF');
  assert.equal(off.car, null);
  const on = gh.tripCard(two, null, { cfg: { enabled: true, aid: 'okanaganroam' }, viatorCfg: { enabled: false } });
  assert.match(on.car, /^https:\/\/www\.discovercars\.com\/canada\/penticton\/yyf\?a_aid=okanaganroam&chan=okanagan&data1=chat$/);
  assert.equal(on.carLabel.en, 'Rent a car at Penticton airport (YYF)');
  assert.equal(gh.tripCard(one, null, { cfg: { enabled: true, aid: 'x' }, viatorCfg: { enabled: false } }), null, 'never on a day trip');
  assert.equal(gh.tripCard(one, { arrive: '2027-07-09', leave: '2027-07-10' }, { cfg: { enabled: true, aid: 'x' }, viatorCfg: { enabled: false } }).airport.code, 'YLW', 'a day plan with a night away is overnight');
});

test('rules and validator: the place to stay and getting here, English and French', () => {
  const regions = ['penticton', 'naramata'];
  const labels = { penticton: 'Penticton', naramata: 'Naramata' };
  const R = (m) => tc.rulesRead(m, [], { regions, regionLabels: labels }).ops.map((o) => [o.o, o.value, o.region]);
  assert.deepEqual(R('somewhere cheaper to stay'), [['stay', 'budget', null]]);
  assert.deepEqual(R('a hotel with a pool'), [['stay', 'pool', null], ['stay', 'hotel', null]], 'one stay op per thing asked');
  assert.deepEqual(R('stay in Naramata'), [['stay', null, 'naramata']]);
  assert.deepEqual(R('we already have a place'), [['stay', 'have_place', null]]);
  assert.deepEqual(R('un logement moins cher'), [['stay', 'budget', null]]);
  assert.deepEqual(R('we need a rental car'), [['transport', 'rental', null]]);
  assert.deepEqual(R("we're driving from Vancouver"), [['transport', 'driving', null]]);
  assert.deepEqual(R("we don't have a car"), [['transport', 'no_car', null]]);
  assert.deepEqual(R('sans voiture'), [['transport', 'no_car', null]]);
  assert.deepEqual(R('base us in Naramata instead'), [['town', null, 'naramata']], 'the trip\'s base is still "town"');
  const W = (o) => ({ o: 'stay', s: [], k: '', t: '', d: 0, v: '', n: 0, ka: [], r: '', sd: '', ...o });
  assert.equal(tc.validateWire({ ops: [W({ v: 'pool' })], cant: '' }, [], { regions }).ok, true);
  assert.equal(tc.validateWire({ ops: [W({ r: 'naramata' })], cant: '' }, [], { regions }).ok, true);
  assert.equal(tc.validateWire({ ops: [W({ v: 'rental' })], cant: '' }, [], { regions }).ok, false, 'rental is a transport value');
  assert.equal(tc.validateWire({ ops: [W({ o: 'transport', v: 'driving' })], cant: '' }, [], { regions }).ok, true);
  assert.equal(tc.validateWire({ ops: [W({ o: 'transport', v: 'helicopter' })], cant: '' }, [], { regions }).ok, false);
});

test('POST /api/trip/chat: cheaper, a pool, Naramata and "we already have a place" change only the place to stay', async () => {
  const plan = planNow();
  assert.ok(plan.whereToStay && plan.whereToStay.pick, 'the 2-day plan has a place to stay');
  const first = plan.whereToStay.pick;
  const ids = (p) => tc.planStops(p).map((s) => s.id);
  const cheap = await chat(bodyFor(plan, 'somewhere cheaper to stay'));
  assert.equal(cheap.status, 200);
  assert.equal(cheap.j.stayBlock.whereToStay.pick.name, 'Chat Agent Test Motel');
  assert.ok(cheap.j.stayBlock.whereToStay.pick.priceLevel < (first.priceLevel || 4));
  assert.equal(cheap.j.plan, null, 'the stops are never re-planned for the place to stay (only stayBlock comes back)');
  assert.deepEqual(cheap.j.stayPref, { maxPrice: (first.priceLevel || 3) - 1 });
  assert.equal(cheap.j.reply, 'Now staying at Chat Agent Test Motel (Motel · Penticton · $).');
  // The preference rides along with the next request: the planner's own pick, among the stays that fit it.
  const pool = await chat(bodyFor(plan, 'a hotel with a pool', { pref: cheap.j.stayPref }));
  assert.equal(pool.j.stayBlock.whereToStay.pick.name, 'Chat Agent Test Resort');
  assert.deepEqual(pool.j.stayPref, { kind: 'hotel', amenities: ['pool'] }, 'a new kind of place starts from any price again');
  const nara = await chat(bodyFor(plan, 'stay in Naramata'));
  assert.equal(nara.j.stayBlock.whereToStay.pick.name, 'Chat Agent Test Naramata Inn');
  const none = await chat(bodyFor(plan, 'we already have a place'));
  assert.equal(none.j.stayBlock.whereToStay, null);
  assert.equal(none.j.plan, null, 'the stops are never re-planned for the place to stay');
  assert.deepEqual(none.j.stayPref, { none: true });
  assert.equal(none.j.reply, tc.T.en.stayNone);
  // Nothing cheaper than the cheapest: said, and the plan is not sent back.
  const motelPlan = planNow({ pref: { maxPrice: 1 } });
  const lower = await chat(bodyFor(motelPlan, 'somewhere cheaper to stay', { pref: { maxPrice: 1 } }));
  assert.equal(lower.j.plan, null);
  assert.equal(lower.j.reply, 'I couldn’t find a cheaper place near your plan, so Chat Agent Test Motel stays.');
  const fr = await chat({ ...bodyFor(plan, 'un logement moins cher'), lang: 'fr' });
  assert.equal(fr.j.reply, 'Vous logez maintenant à Chat Agent Test Motel (Motel · Penticton · $).');
});

test('POST /api/trip/chat: rental car, driving and no car answer from the Getting here data', async () => {
  const plan = planNow();
  let r = await chat(bodyFor(plan, 'we need a rental car'));
  assert.equal(r.j.actions.transport, 'rental');
  assert.equal(r.j.reply, 'I can’t book rental cars here yet. Penticton airport (YYF) has rental desks.', 'without DISCOVERCARS_AID: no link promised');
  process.env.DISCOVERCARS_AID = 'okanaganroam';
  try {
    r = await chat(bodyFor(plan, 'we need a rental car'));
    assert.equal(r.j.reply, 'Rental cars at Penticton airport (YYF): tap See cars on the Getting here card.');
    assert.match(planNow().gettingHere.car, /discovercars\.com\/canada\/penticton\/yyf/);
  } finally { delete process.env.DISCOVERCARS_AID; }
  r = await chat(bodyFor(plan, "we're driving from Vancouver"));
  assert.equal(r.j.actions.transport, 'driving');
  assert.equal(r.j.plan, null);
  r = await chat(bodyFor(plan, "we don't have a car"));
  assert.equal(r.j.actions.transport, 'no_car');
  assert.match(r.j.reply, /^Most of these stops need a car\. Staying central in Penticton helps/);
});

test('page: chat mode has the agent\'s first message, no Edit request and Confirm at the end; the default V4 page has none of it', async () => {
  const chatPage = await (await fetch(`${base}/trip?chat=1`, { headers: { 'User-Agent': UA } })).text();
  assert.match(chatPage, /Hi! Where are you headed, and what do you love doing\?/);
  assert.match(chatPage, /v4-chat-mode \.v4-edit/);
  assert.match(chatPage, /v4-confirm-end/);
  assert.match(chatPage, /Where you’ll stay/);
  assert.match(chatPage, /Bonjour! Où allez-vous, et qu’aimez-vous faire\?/);
  const v4 = await (await fetch(`${base}/trip?v=4`, { headers: { 'User-Agent': UA } })).text();
  assert.doesNotMatch(v4, /v4AgentHi|v4-chat-mode|Where you’ll stay|v4-confirm-end/);
});
