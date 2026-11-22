'use strict';
// Travel agent chat, third round (2026-11-22): the place to stay with an amenity (filter, honest replies, chip, speed),
// "ice cream after lunch" in a real time gap, a kind of dinner replaces the dinner, and the second fresh-eyes list
// (edits that stick, events, "X hate Y", who is coming already known, a clock time, a wine tour, a second message while
// waiting, dates). Repo database plus fixtures, removed at the end (`git checkout -q okanagan.db` if interrupted).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.DISCOVERCARS_AID;
const app = require('../server.js');
const db = require('../db.js');
const tc = require('../trip-chat.js');
const tripStays = require('../trip-stays.js');

const made = [], madeEvents = [];
let base, srv, brewery;
test.before(async () => {
  let n = 0;
  const mk = (o, info) => {
    const v = app.createVenue({ region: 'penticton', type: 'stay', cuisine: 'hotel', address: `${700 + (++n)} Main Street, Penticton, BC`, latitude: 49.49 + n / 1000, longitude: -119.59, website: `https://example.com/r3-stay-${n}`, description: 'A fixture used only by the trip chat round 3 tests.', ...o });
    made.push(v.id);
    db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ confidence: 'high', ...info }), '2026-11-22T00:00:00Z', 'test');
    return v;
  };
  mk({ slug: 'r3-pool-motel', name: 'R3 Pool Motel', cuisine: 'motel' }, { max_guests: 6, price_level: 2, pool: true });
  mk({ slug: 'r3-pool-hotel', name: 'R3 Pool Hotel', cuisine: 'hotel', latitude: 49.52 }, { max_guests: 6, price_level: 3, pool: true, hot_tub: true, kitchen: 'some', pets: 'yes' });
  mk({ slug: 'r3-plain-inn', name: 'R3 Plain Inn', cuisine: 'inn' }, { max_guests: 6, price_level: 1, pool: false, kitchen: 'none' });
  mk({ slug: 'r3-unknown-lodge', name: 'R3 Unknown Lodge', cuisine: 'lodge' }, { max_guests: 6, price_level: 2 });
  mk({ slug: 'r3-kaleden-inn', name: 'R3 Kaleden Inn', cuisine: 'inn', region: 'kaleden', latitude: 49.39, longitude: -119.6 }, { max_guests: 4, price_level: 2 });
  brewery = db.prepare("SELECT id, name FROM venues WHERE type = 'brewery' AND region = 'penticton' ORDER BY id LIMIT 1").get();
  madeEvents.push(Number(db.prepare("INSERT INTO events (name, slug, region, description, start_datetime, venue_id, status) VALUES ('Photos with Santa R3', 'photos-with-santa-r3', 'penticton', 'Test.', '2026-11-28T13:00:00', ?, 'scheduled')").run(brewery.id).lastInsertRowid));
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  for (const id of madeEvents) db.prepare('DELETE FROM events WHERE id = ?').run(id);
  for (const id of made) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  app.setTripChatReader(null);
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
let ipN = 1;
const chat = async (body) => {
  const r = await fetch(`${base}/api/trip/chat?stays=1&v=4&chat=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-Real-IP': `10.9.${Math.floor(ipN / 200)}.${(ipN++ % 200) + 1}` }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
};
const TEXT = "3 days in Penticton with kids 6 and 9, we don't drink, need a place with a pool";
const planNow = (text = TEXT, stay = null) => app.runTripPlanRequest(app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true }).value, true);
const bodyFor = (plan, message, text = TEXT, extra = {}) => ({ message, lang: 'en', plan: { text, seed: 0, excludeVenueIds: [], ...(extra.stay ? { stay: extra.stay } : {}) }, locks: {}, removed: [], stops: tc.planStops(plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })), ...(extra.body || {}) });
const pageHtml = () => app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });

// ---------- the place to stay ----------
test('stay amenity: only stays whose facts say yes (pool true; kitchen all / some; pets yes / some); unknown is never a yes', () => {
  const stays = [
    { id: 1, region: 'penticton', info: { pool: true, kitchen: 'some', pets: 'no' } }, { id: 2, region: 'penticton', info: { pool: false, kitchen: 'all', pets: 'yes' } },
    { id: 3, region: 'penticton', info: { kitchen: 'none', parking: 'free', accessible: true } }, { id: 4, region: 'penticton', info: null },
  ];
  const ids = (pref) => tripStays.staysForPref(stays, pref).map((s) => s.id);
  assert.deepEqual(ids({ amenities: ['pool'] }), [1]);
  assert.deepEqual(ids({ amenity: 'pool' }), [1], 'the older single form still works');
  assert.deepEqual(ids({ amenities: ['kitchen'] }), [1, 2], 'kitchen is "all" or "some" (it never matched before)');
  assert.deepEqual(ids({ amenities: ['pets'] }), [2]);
  assert.deepEqual(ids({ amenities: ['parking', 'accessible'] }), [3]);
  assert.deepEqual(ids({ amenities: ['pool', 'kitchen'] }), [1]);
  assert.ok(tripStays.parseTripStayInput({ pref: { amenities: ['sauna'] } }).error);
  assert.ok(tripStays.parseTripStayInput({ pref: { amenities: ['pool', 'pool'] } }).error);
  assert.ok(tripStays.parseTripStayInput({ pref: { kind: 'castle' } }).error);
  assert.deepEqual(tripStays.parseTripStayInput({ pref: { amenities: ['pool', 'hot_tub'], kind: 'hotel' } }).value.pref, { amenities: ['pool', 'hot_tub'], kind: 'hotel' });
});

test('first request "need a place with a pool": a pool stay, said in what we understood, on the card (has) and for the agent\'s first line; Oct-May says to check it', () => {
  const plan = planNow();
  const w = plan.whereToStay;
  assert.ok(['R3 Pool Motel', 'R3 Pool Hotel'].includes(w.pick.name), w.pick.name);
  assert.deepEqual(w.pick.has, ['pool']);
  assert.deepEqual(w.amenity.keys, ['pool']);
  assert.equal(w.amenity.confirmed, true);
  assert.equal(w.amenity.winterCheck, true, 'a November trip: "check it\'s open in winter" (stay_info has no pool season)');
  assert.ok(plan.understood.interests.includes('a place to stay with a pool'));
  assert.ok((w.alternatives || []).every((c) => (c.has || []).includes('pool')), 'the alternatives have one too');
  const summer = planNow(TEXT, { arrive: '2027-07-09', leave: '2027-07-11' });
  assert.equal(summer.whereToStay.amenity.winterCheck, undefined);
  const html = pageHtml();
  assert.match(html, /with a place to stay with \{what\}/);
  assert.match(html, /avec un logement qui a \{what\}/);
  assert.match(html, /v4-stay-chip/);
  assert.match(html, /chip: \{ pool: 'Pool'/);
  assert.match(html, /chip: \{ pool: 'Piscine'/);
});

test('chat: "a hotel with a pool" filters, prefers a hotel over a motel, and the reply names the pool (EN and FR)', async () => {
  const plan = planNow('3 days in Penticton with the kids');
  const text = '3 days in Penticton with the kids';
  let r = await chat(bodyFor(plan, 'we want to stay in Penticton, at a hotel with a pool', text));
  assert.equal(r.status, 200);
  assert.equal(r.j.plan, null, 'the stops are not re-planned');
  const w = r.j.stayBlock.whereToStay;
  assert.equal(w.pick.name, 'R3 Pool Hotel', 'the hotel, not the nearer motel');
  assert.deepEqual(w.pick.has, ['pool']);
  assert.equal(w.kindMatched, true);
  assert.deepEqual(r.j.stayPref, { region: 'penticton', kind: 'hotel', amenities: ['pool'] });
  assert.match(r.j.reply, /^(?:Now staying at R3 Pool Hotel \(Hotel · Penticton · \$\$\$\), which has a pool|R3 Pool Hotel \(Hotel · Penticton · \$\$\$\) has a pool) \(check it’s open in winter\)/);
  r = await chat({ ...bodyFor(plan, 'un logement avec piscine et spa', text), lang: 'fr' });
  assert.equal(r.j.stayBlock.whereToStay.pick.name, 'R3 Pool Hotel');
  assert.match(r.j.reply, /qui a une piscine et un spa|a une piscine et un spa/);
  r = await chat(bodyFor(plan, 'a pet-friendly place to stay with a kitchen', text));
  assert.deepEqual(r.j.stayPref.amenities.slice().sort(), ['kitchen', 'pets']);
  assert.equal(r.j.stayBlock.whereToStay.pick.name, 'R3 Pool Hotel');
  assert.match(r.j.reply, /which has (?:a kitchen and pet-friendly rooms|pet-friendly rooms and a kitchen)\.$/);
});

test('chat: no confirmed pool in the town asked -> the nearest town that has one, said plainly; none anywhere -> "not confirmed"', async () => {
  const text = '3 days in Penticton with the kids';
  const plan = planNow(text);
  let r = await chat(bodyFor(plan, 'stay in Kaleden at a place with a pool', text));
  let w = r.j.stayBlock.whereToStay;
  assert.equal(w.amenity.elsewhere, true);
  assert.equal(w.pick.region, 'penticton');
  assert.match(r.j.reply, /^I couldn’t find a place with a pool in Kaleden in our list\. The nearest that has it is R3 Pool (?:Hotel|Motel) \(/);
  // No stay with a hot tub AND free parking anywhere: the closest, marked not confirmed (never passed off as having it).
  r = await chat(bodyFor(plan, 'a place to stay with free parking and a hot tub', text));
  w = r.j.stayBlock.whereToStay;
  assert.equal(w.amenity.confirmed, false);
  assert.match(r.j.reply, /^I couldn’t find a place with (?:a hot tub and free parking|free parking and a hot tub) in Penticton in our list\. Here’s the closest: .+ \((?:hot tub and free parking|free parking and a hot tub) not confirmed\)\.$/);
  const fr = await chat({ ...bodyFor(plan, 'un logement à Kaleden avec piscine', text), lang: 'fr' });
  assert.match(fr.j.reply, /^Je n’ai pas trouvé de logement avec une piscine à Kaleden dans notre liste\. Le plus proche qui en a : /);
});

test('speed: a stay change plans once, reads the stays once and does not wait for the AI', async () => {
  const plan = planNow('3 days in Penticton with the kids');
  let aiCalls = 0;
  app.setTripChatReader(async () => { aiCalls += 1; await new Promise((r) => setTimeout(r, 1200)); return { ok: false, reason: 'mock' }; });
  try {
    const parsed = app.parseTripChatBody(bodyFor(plan, 'we want to stay in Penticton, at a hotel with a pool', '3 days in Penticton with the kids'), { stays: true });
    const t0 = Date.now();
    const turn = await app.runTripChatTurn(parsed.value, { staysOn: true, lang: 'en' });
    const ms = Date.now() - t0;
    assert.equal(aiCalls, 0, 'a stay message the rules read is answered without the AI');
    assert.equal(turn.timing.plans, 1, 'one planner run (it was two; four after a pin conflict)');
    assert.ok(ms < 1000, `answered in ${ms} ms`);
  } finally { app.setTripChatReader(null); }
});

// ---------- "ice cream after lunch": the real time gap ----------
const S = (o) => ({ badges: [], price: 2, role: '', ...o });
const DAY = [
  S({ key: '1-morning', ref: 's1', id: 11, name: 'Morning Park', type: 'outdoor', day: 1, start: 540 }),
  S({ key: '1-midday', ref: 's2', id: 12, name: 'Lunch Spot', type: 'restaurant', day: 1, start: 705, role: 'lunch' }),
  S({ key: '1-afternoon', ref: 's3', id: 13, name: 'Afternoon Museum', type: 'indoor', day: 1, start: 885 }),
  S({ key: '1-late', ref: 's4', id: 14, name: 'Late Gallery', type: 'indoor', day: 1, start: 990 }),
  S({ key: '1-evening', ref: 's5', id: 15, name: 'Dinner Place', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
];
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
const dayPlan = (stops) => ({ kind: 'day_plan', days: [{ day: 1, stops: stops.map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: s.price || 2, badges: (s.badges || []).map((k) => ({ key: k })) } })) }], schedule: stops.map((s) => ({ day: 1, venueId: s.id, startMinutes: s.start })) });

test('"ice cream after lunch" with 11:45 lunch and a 2:45 stop: it goes into the gap; every other stop keeps its time', () => {
  const cur = { stops: DAY, removed: new Set(), locks: {} };
  const where = tc.placeAdd(OP({ o: 'add', stops: [DAY[1]] }), 'ice_cream', cur);
  assert.equal(where.why, undefined, 'there is room: three hours between lunch and the next stop');
  assert.equal(where.slot, '1-afternoon');
  assert.equal(where.keep, true);
  assert.equal(where.slotStart, 795, 'lunch 11:45 + 75 min + 15 min -> 1:15 PM');
  assert.deepEqual(where.shifts, { '1-afternoon': '1-late', '1-late': '1-evening', '1-evening': '1-night' }, 'slot names move along; dinner takes the free night slot');
  const calls = [];
  const cone = { key: '1-afternoon', id: 81, name: 'Scoops Ice Cream', type: 'cafe', start: 795 };
  const after = [DAY[0], DAY[1], cone, { ...DAY[2], key: '1-late' }, { ...DAY[3], key: '1-evening' }, { ...DAY[4], key: '1-night' }];
  const run = (a) => { calls.push(JSON.parse(JSON.stringify(a))); return dayPlan(after); };
  const out = tc.planTurn([OP({ o: 'add', kind: 'ice_cream', stops: [DAY[1]] })], { args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops: DAY, days: 1, run, regionLabels: {}, lang: 'en' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].swap.times, { '1-morning': 540, '1-midday': 705, '1-late': 885, '1-evening': 990, '1-night': 1080, '1-afternoon': 795 }, 'every stop keeps its own time; the new one starts in the gap');
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added Scoops Ice Cream at 1:15 PM.', 'nothing "moves": no stop changed its time');
  assert.equal(out.req.locks['1-afternoon'], 81, 'what the visitor added stays through later re-plans');
  // A short gap (lunch at 1:30): no room is still said plainly.
  const tight = DAY.map((s) => (s.key === '1-midday' ? { ...s, start: 810 } : s));
  assert.equal(tc.placeAdd(OP({ o: 'add', stops: [tight[1]] }), 'ice_cream', { stops: tight, removed: new Set(), locks: {} }).why, 'no_room');
  // The planner moved another stop: not used, and the reply says there was no free spot.
  const bad = tc.planTurn([OP({ o: 'add', kind: 'ice_cream', stops: [DAY[1]] })], { args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops: DAY, days: 1, run: () => dayPlan([DAY[0], DAY[1], cone, DAY[4]]), regionLabels: {}, lang: 'en' });
  assert.equal(bad.plan, null);
  assert.match(tc.buildReply(bad, { lang: 'en' }), /^There’s no free spot for ice cream after lunch/);
});

// ---------- a kind of dinner replaces the dinner ----------
test('"a sunset dinner with a lake view" swaps that day\'s dinner (its slot, a place to eat with the badge); an add only when the day has no dinner', async () => {
  const R = (m, stops = DAY) => tc.rulesRead(m, stops, { regions: [], regionLabels: {}, days: 1 }).ops.map((o) => [o.o, o.kind, (o.stops || []).map((s) => s.id), o.time]);
  assert.deepEqual(R('can we get a sunset dinner with a lake view'), [['replace', 'lake_view', [15], null]]);
  assert.deepEqual(R('a patio lunch please'), [['replace', 'patio', [12], null]]);
  assert.deepEqual(R('un souper avec vue sur le lac'), [['replace', 'lake_view', [15], null]]);
  assert.deepEqual(R('a dinner with a lake view', DAY.slice(0, 4)), [['add', 'restaurant', [], 'evening']], 'no dinner that day: one is added, in the dinner slot');
  assert.equal(tc.placeAdd(OP({ o: 'add', kind: 'restaurant', time: 'evening' }), 'restaurant', { stops: DAY.slice(0, 4), removed: new Set(), locks: {} }).slot, '1-evening');
  // The AI's "add a lake view stop" becomes the dinner swap.
  const rules = tc.rulesRead('can we get a sunset dinner with a lake view', DAY, { regions: [], regionLabels: {}, days: 1 });
  const m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'add', kind: 'lake_view' })] }, rules, 'can we get a sunset dinner with a lake view');
  assert.deepEqual(m.fixes, ['rules_specific']);
  assert.equal(m.ops[0].o, 'replace');
  // A winery with a lake view is not a dinner.
  const winery = { ...DAY[4], id: 99, name: 'Lakeview Winery', type: 'winery' };
  const out = tc.planTurn(rules.ops, { args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops: DAY, days: 1, run: () => dayPlan([...DAY.slice(0, 4), winery]), regionLabels: {}, lang: 'en' });
  assert.equal(out.plan, null);
  // The real planner: only the dinner changes, and it is a place to eat with a lake view.
  const text = 'a day in Kelowna with wineries';
  const plan = planNow(text);
  const dinner = tc.planStops(plan).find((s) => s.role === 'dinner');
  const r = await chat(bodyFor(plan, 'can we get a sunset dinner with a lake view', text));
  assert.deepEqual(r.j.changed, [dinner.key], r.j.reply);
  const now = tc.planStops(r.j.plan).find((s) => s.key === dinner.key);
  assert.ok(['restaurant', 'pub'].includes(now.type));
  assert.ok(now.badges.includes('lake_view'), `${now.name} has a lake view`);
  assert.equal(tc.planStops(r.j.plan).length, tc.planStops(plan).length, 'no second restaurant');
});

// ---------- second fresh-eyes list ----------
test('edits stick: a stop changed by chat is kept through a later re-plan; "the kids hate museums" changes nothing; kids already known are not planned again', async () => {
  const text = '2 days in Penticton with the kids';
  const plan = planNow(text);
  // (Planner round 3: the last day of a trip is a light day with no dinner, so the dinner edited here is day 1's.)
  const dinner = tc.planStops(plan).find((s) => s.role === 'dinner' && s.day === 1);
  const cheap = await chat(bodyFor(plan, 'cheaper dinner on day 1', text));
  if (cheap.j.plan) {
    const now = tc.planStops(cheap.j.plan).find((s) => s.key === dinner.key);
    assert.equal(cheap.j.req.locks[dinner.key], now.id, 'the new dinner is a kept stop from now on');
    const next = { ...bodyFor(cheap.j.plan, 'slower pace', text), locks: cheap.j.req.locks, plan: { text: cheap.j.req.text, seed: cheap.j.req.seed, excludeVenueIds: cheap.j.req.excludeVenueIds } };
    const slow = await chat(next);
    if (slow.j.plan) assert.ok(tc.planStops(slow.j.plan).some((s) => s.id === now.id), `${now.name} is still there after "slower pace"`);
  }
  const hate = await chat(bodyFor(plan, 'the kids hate museums', text));
  assert.equal(hate.j.plan, null, 'no re-plan');
  assert.equal(hate.j.reply, 'There’s no museum in your plan. I’ll keep it out.');
  assert.match(hate.j.text, /, no museums$/, 'kept out of later re-plans');
  const known = await chat(bodyFor(plan, 'we have kids with us', text));
  assert.equal(known.j.plan, null);
  assert.equal(known.j.reply, 'Your plan is already set for the kids.');
  assert.equal(tc.partyKnown(OP({ o: 'party', value: 'kids', ages: [3] }), text), false, 'new ages are news');
  assert.equal(tc.partyKnown(OP({ o: 'party', value: 'no_alcohol' }), "a day in Kelowna, we don't drink"), true);
  // The AI adding "party kids" to it changes nothing either.
  app.setTripChatReader(async () => ({ ok: true, cant: null, ops: [OP({ o: 'party', value: 'kids' })] }));
  try { const ai = await chat(bodyFor(plan, 'make it nicer for our children', text)); assert.equal(ai.j.plan, null); assert.equal(ai.j.reply, 'Your plan is already set for the kids.'); } finally { app.setTripChatReader(null); }
});

test('events: "take out the brewery event, we don\'t drink" takes the event out (and says so); "we don\'t drink" alone takes out an event at a brewery', async () => {
  const text = "2 days in Penticton with the kids, we don't drink";
  const plan = planNow(text);
  const ev = madeEvents[0];
  let r = await chat(bodyFor(plan, "take out the brewery event, we don't drink", text, { body: { events: [ev] } }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.actions.removeEvents, [ev]);
  assert.equal(r.j.reply, 'Done. Took out Photos with Santa R3.');
  assert.equal(r.j.plan, null);
  r = await chat(bodyFor(plan, 'remove the santa photos', text, { body: { events: [ev] } }));
  assert.deepEqual(r.j.actions.removeEvents, [ev]);
  const plain = planNow('2 days in Penticton with the kids');
  r = await chat(bodyFor(plain, "we don't drink", '2 days in Penticton with the kids', { body: { events: [ev] } }));
  assert.deepEqual(r.j.actions.removeEvents, [ev], 'an event at a brewery goes with "we don\'t drink"');
  assert.match(r.j.reply, /Took out Photos with Santa R3\.$/);
  assert.equal((await chat({ ...bodyFor(plan, 'x', text), events: ['drop'] })).status, 400);
  const html = pageHtml();
  assert.match(html, /data-v4-event-x=/, 'event rows get a Remove button');
  assert.match(html, /chat\.goneEvents\[id\]/);
});

test('a clock time for one stop is said plainly (no day shift); "afternoon" is not "after dinner"; the town of the stay is the one named', async () => {
  const R = (m) => tc.rulesRead(m, DAY, { regions: [], regionLabels: {}, days: 1 });
  assert.equal(R('move it to 6:30').cant, 'time_at');
  assert.equal(R('move dinner to 7').cant, 'time_at');
  assert.deepEqual(R('make it 3 days').ops.map((o) => [o.o, o.n]), [['days', 3]]);
  assert.equal(tc.cantReply('time_at', 'en'), 'I can’t set an exact time for one stop yet. I can start the day earlier or later, or swap that stop.');
  let m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'time', value: 'earlier', stops: [DAY[4]] })] }, R('move it to 6:30'), 'move it to 6:30');
  assert.equal(m.cant, 'time_at'); assert.equal(m.ops.length, 0);
  const spa = R('add a spa on day 1 afternoon');
  assert.deepEqual(spa.ops.map((o) => [o.o, o.kind, o.time, o.day, o.stops.length]), [['add', 'spa', 'afternoon', 1, 0]]);
  m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'add', kind: 'spa', stops: [DAY[4]] })] }, spa, 'add a spa on day 1 afternoon');
  assert.deepEqual(m.fixes, ['drop_anchor']);
  assert.equal(m.ops[0].stops.length, 0); assert.equal(m.ops[0].time, 'afternoon');
  const text = '2 days in Summerland with the kids';
  const plan = planNow(text);
  const r = await chat(bodyFor(plan, "we don't have a car", text, { body: { stayTown: 'penticton' } }));
  assert.match(r.j.reply, /Staying central in Penticton helps/, 'the town of the place to stay, not of the first stop');
});

test('a wine tour with a driver is offered (or said plainly when we have none); "coming from Vancouver" in the first request hides Rent a car', async () => {
  const R = (m) => tc.rulesRead(m, DAY, { regions: [], regionLabels: {}, days: 1 });
  assert.deepEqual(R('book us a wine tour with a driver on saturday').ops.map((o) => [o.o, o.value]), [['transport', 'wine_tour']]);
  assert.deepEqual(R('no driving after wineries').ops.map((o) => [o.o, o.value]), [['transport', 'wine_tour']]);
  const text = 'a day in Kelowna with wineries';
  const plan = planNow(text);
  const r = await chat(bodyFor(plan, 'book us a wine tour with a driver on saturday', text));
  assert.notEqual(r.j.reply, tc.T.en.booking, 'never "I can\'t book things in this chat"');
  if (r.j.card) { assert.equal(r.j.card.kind, 'wine_tour'); assert.match(r.j.card.url, /^https:\/\/www\.viator\.com\//); assert.match(r.j.reply, /^Here’s a wine tour with a driver for Kelowna/); } else assert.equal(r.j.reply, 'I don’t have a wine tour to offer for Kelowna right now.');
  process.env.DISCOVERCARS_AID = 'okanaganroam';
  try {
    const flying = planNow('2 days in Penticton with the kids');
    assert.match(flying.gettingHere.car, /discovercars/);
    const driving = planNow('2 days in Penticton with the kids, coming from Vancouver');
    assert.equal(driving.gettingHere.driving, true);
    assert.equal(driving.gettingHere.car, null);
    const steps = JSON.stringify([driving.v4Booking, driving.whereToStay && driving.whereToStay.pick.bookingSteps]);
    assert.doesNotMatch(steps, /discovercars/, 'no Rent a car in the Book sheet either');
  } finally { delete process.env.DISCOVERCARS_AID; }
});

test('page: a message typed while waiting is queued; no "When are you coming?" when the request had dates; no dates on the stay card before they are known; the plan\'s "not included" is in the first line; button results show in the chat line', () => {
  const html = pageHtml();
  assert.match(html, /if \(chat\.busy\) \{ chat\.queue = \{ message: message, chip: chip, label: label \};/);
  assert.doesNotMatch(html, /inEl\.disabled = true/, 'the box stays usable while waiting');
  assert.match(html, /if \(q\) setTimeout\(function\(\)\{ chatSend\(q\.message, q\.chip, q\.label\); \}, 0\);/);
  assert.match(html, /!chat\.askedWhen && !v4\.confirmed && !chatHasDates\(\)/);
  assert.match(html, /known \? tripIn : \{ adults: tripIn\.adults, kids: tripIn\.kids, dog: tripIn\.dog \}/);
  assert.match(html, /I couldn’t fit \{what\} on these dates; tell me if you’d like me to try another day\./);
  assert.match(html, /announce = function\(text\)\{ announceBase\(text\); if \(text && !chat\.busy\) \{ chatShow\('', text, \{\}\);/);
  assert.match(html, /I couldn’t plan those dates\. Your plan is unchanged\./);
  assert.match(html, /v4d-f/, 'untimed Free time rows are taken out in chat mode');
});
