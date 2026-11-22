'use strict';
// Travel agent abilities (2026-11-22, trip-chat-agent.js; Dayton: "as if they were actually sitting down with a travel
// agent"): a place to stay on any plan, tours and bookable activities as stops, several asks in one message, questions
// answered from a listing's own facts, getting there, and the shape of the trip (a night, adults, a stop moved, one
// stop's time). Word rules (EN + FR), the model's answer checked, the rules standing over the AI, replies, and the
// planner's hooks (tourStops, moves, overrides.stopStarts, trustedPins) through a mocked planner; then the API with
// the real planner on the repo database (food and drink only: a stay or a tour we do not list is said plainly).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.ANTHROPIC_API_KEY;
const app = require('../server.js');
const tc = require('../trip-chat.js');
const ag = require('../trip-chat-agent.js');

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  app.setTripChatReader(null);
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const S = (o) => ({ badges: [], price: 2, role: '', ...o });
const PLAN = [
  S({ key: '1-morning', id: 11, name: 'Knox Mountain Park', type: 'outdoor', day: 1, start: 585 }),
  S({ key: '1-midday', id: 12, name: 'Broken Anchor Cafe', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 13, name: 'La Frenz Estate Winery', type: 'winery', day: 1, start: 795 }),
  S({ key: '1-late', id: 14, name: 'Kelowna Art Gallery', type: 'indoor', day: 1, start: 945 }),
  S({ key: '1-evening', id: 15, name: 'Ramen Arashi Kelowna', type: 'restaurant', day: 1, start: 1080, role: 'dinner', price: 3 }),
  S({ key: '2-morning', id: 21, name: 'Stuart Park Rink', type: 'outdoor', day: 2, start: 585 }),
  S({ key: '2-afternoon', id: 23, name: 'Moraine Estate Winery', type: 'winery', day: 2, start: 795 }),
  S({ key: '2-late', id: 24, name: 'Tantalus Vineyards', type: 'winery', day: 2, start: 930 }),
];
const WD = tc.weekdayDays('2026-11-28', 2); // Saturday, Sunday
const OPTS = { regions: ['kelowna', 'penticton'], regionLabels: { kelowna: 'Kelowna', penticton: 'Penticton' }, days: 2, weekdays: WD };
const R = (m, stops = PLAN, extra = {}) => tc.rulesRead(m, stops, { ...OPTS, ...extra });
const brief = (r) => r.ops.map((o) => [o.o, o.kind || o.value || null, (o.stops || []).map((s) => s.id), o.day || null, o.n || null, o.region || null].filter((x, i) => i < 3 || x !== null));

test('1. a place to stay on any plan: asked for, with an amenity, taken off (EN + FR)', () => {
  assert.deepEqual(brief(R('find us a place to stay')), [['stay', 'add', []]]);
  assert.deepEqual(brief(R('we need somewhere Saturday night')), [['stay', 'add', []]]);
  assert.deepEqual(brief(R('add a hotel')), [['stay', 'hotel', []]]);
  assert.deepEqual(brief(R('somewhere with a hot tub')), [['stay', 'hot_tub', []]]);
  assert.deepEqual(brief(R('find us a place to stay with a hot tub')), [['stay', 'hot_tub', []]]);
  assert.deepEqual(brief(R('find us a cheap hotel in Penticton')), [['stay', 'budget', [], 'penticton'], ['stay', 'hotel', []]]);
  assert.deepEqual(brief(R('remove the hotel')), [['stay', 'have_place', []]]);
  assert.deepEqual(brief(R("we don't need a place to stay")), [['stay', 'have_place', []]]);
  assert.deepEqual(brief(R("we're staying with friends")), [['stay', 'have_place', []]]);
  assert.deepEqual(brief(R('trouve-nous un hôtel avec piscine')), [['stay', 'pool', []], ['stay', 'hotel', []]]);
  assert.deepEqual(brief(R('on a besoin d’un endroit où dormir')), [['stay', 'add', []]]);
  assert.deepEqual(brief(R('enlève l’hôtel')), [['stay', 'have_place', []]]);
  // Not a stay: an escape room is a thing to do, a resort is not asked for by "remove".
  assert.notEqual((R('add an escape room').ops[0] || {}).o, 'stay');
  assert.equal(R('remove the escape room').cant, 'not_found');
  assert.ok(tc.STAY_VALUES.includes('add'));
});

test('2. tours and bookable activities are kinds of stop (never "I can\'t book things in this chat")', () => {
  assert.deepEqual(brief(R('add a wine tour')), [['add', 'wine_tour', []]]);
  assert.deepEqual(brief(R('book us a wine tour on Saturday')), [['add', 'wine_tour', [], 1]]);
  assert.deepEqual(brief(R('book us a snowmobile tour')), [['add', 'snowmobile', []]], 'the snowmobile tour, not also "a tour"');
  assert.deepEqual(brief(R('a boat cruise on Sunday')), [['add', 'boat_tour', [], 2]]);
  assert.deepEqual(brief(R('ziplining')), [['add', 'zipline', []]]);
  assert.deepEqual(brief(R('ajoute un tour des vignobles')), [['add', 'wine_tour', []]]);
  assert.deepEqual(brief(R('ajoute une croisière samedi')), [['add', 'boat_tour', [], 1]]);
  assert.deepEqual(brief(R('no driving after the wineries')), [['transport', 'wine_tour', []]], '"no driving" still offers the tour with a driver');
  // With a tour on the plan: it is named by its kind and can be taken out again; "book the wine tour" is the booking line.
  const withTour = [...PLAN, S({ key: '2-morning', id: 31, name: 'Vivid Tours', type: 'tour', day: 2, start: 600 })].filter((s) => s.id !== 21);
  assert.deepEqual(brief(R('remove the wine tour', withTour)), [['remove', null, [31]]]);
  assert.equal(R('book the wine tour', withTour).cant, 'booking');
  for (const k of Object.keys(ag.TOUR_KINDS)) { assert.ok(tc.KINDS[k], k); assert.ok(tc.KINDS[k].types.length && tc.KINDS[k].words.length); }
  assert.equal(tc.KINDS.wine_tour.en, 'a wine tour');
});

test('3. several asks in one message are each read, in order; a part that cannot be done is said', () => {
  const m = R('drop the gallery, add a wine tour Saturday and find us a hotel with a hot tub');
  assert.deepEqual(brief(m), [['remove', null, [14]], ['add', 'wine_tour', [], 1], ['stay', 'hot_tub', []], ['stay', 'hotel', []]]);
  assert.equal(m.multi, 3);
  assert.deepEqual(brief(R('add ice cream after lunch and make dinner cheaper')), [['add', 'ice_cream', [12]], ['budget', 'budget', [15]]]);
  assert.deepEqual(brief(R('enlève le premier vignoble et ajoute un tour des vignobles')), [['remove', null, [13]], ['add', 'wine_tour', []]]);
  const part = R('remove the brewery and add a beach');
  assert.deepEqual(brief(part), [['add', 'beach', []]]);
  assert.deepEqual(part.missed, [{ cant: 'not_found', what: 'brewery' }]);
  // One ask stays one ask ("wineries and a brewery" is not cut).
  assert.deepEqual(ag.splitAsks('a day with wineries and a brewery'), ['a day with wineries and a brewery']);
  assert.deepEqual(ag.splitAsks('remove the gallery, then add a beach. We need a hotel'), ['remove the gallery', 'add a beach', 'We need a hotel']);
  // The rules' several asks stand over an AI answer that read only one.
  const ai = { ok: true, cant: null, ops: [{ o: 'remove', stops: [PLAN[3]], kind: null, value: null }] };
  const rec = tc.reconcileReads(ai, m, 'drop the gallery, add a wine tour Saturday and find us a hotel with a hot tub');
  assert.equal(rec.ops.length, 4); assert.deepEqual(rec.fixes, ['multi']);
});

test('4. questions about a stop are read (EN + FR), and answered from the listing\'s own facts only', () => {
  assert.deepEqual(R('is La Frenz open Sunday?').ops.map((o) => [o.o, o.value, o.stops[0].id, o.wd]), [['ask', 'q_open', 13, 'sun']]);
  assert.deepEqual(brief(R('why the gallery?')), [['ask', 'q_why', [14]]]);
  assert.deepEqual(brief(R('how far is the gallery from the hotel?')), [['ask', 'q_far', [14]]]);
  assert.deepEqual(brief(R('is the gallery good for kids?')), [['ask', 'q_kids', [14]]]);
  assert.deepEqual(brief(R('how much is the ramen place?')), [['ask', 'q_price', [15]]]);
  assert.deepEqual(brief(R('est-ce que La Frenz est ouvert dimanche?')), [['ask', 'q_open', [13], 2]]);
  assert.equal(R('is it open Sunday?').cant, 'ask_which', 'no stop it can be about: which stop? (never a guess)');
  assert.match(tc.cantReply('ask_which', 'en', null, PLAN), /^Which stop do you mean\? Ask with its name, like “is Knox Mountain Park open Sunday\?”$/);
  // "can we ..." is a request, not a question about a stop.
  assert.notEqual((R('can we add a winery on day 2?').ops[0] || {}).o, 'ask');
  const fact = { name: 'La Frenz', type: 'winery', hours: JSON.stringify({ sat: [['11:00', '17:00']], sun: [['12:00', '16:30']] }), description: 'A small family winery on the Naramata Bench with a view of the lake. More text.', kid_friendly: null, dog_friendly: 1, price: 2, lat: 49.6, lng: -119.58 };
  const A = (v, extra = {}, f = fact, lang = 'en', wd) => ag.answerQuestion({ value: v, wd }, f, extra, lang);
  assert.equal(A('q_open', {}, fact, 'en', 'sun'), 'La Frenz is listed as open Sunday, 12 PM to 4:30 PM. Check before you go.');
  assert.equal(A('q_open', {}, fact, 'en', 'mon'), 'La Frenz is listed as closed on Monday. Check before you go.');
  assert.equal(A('q_open', { planWd: 'sat' }), 'La Frenz is listed as open Saturday, 11 AM to 5 PM. Check before you go.', 'no day said: the day it is on the plan');
  assert.equal(A('q_open', {}, { ...fact, hours: null }), 'We don’t have hours on file for La Frenz. Tap La Frenz for its details.');
  assert.equal(A('q_open', {}, fact, 'fr', 'sun'), 'Selon sa fiche, La Frenz est ouvert dimanche, de midi à 16 h 30. Vérifiez avant d’y aller.');
  assert.equal(A('q_why'), 'I picked La Frenz because it fits what you asked for: A small family winery on the Naramata Bench with a view of the lake.');
  assert.equal(A('q_kids'), 'The listing for La Frenz doesn’t say if it suits kids. Tap La Frenz for its details.', 'no fact: said so, never a guess');
  assert.equal(A('q_dog'), 'La Frenz is listed as dog-friendly.');
  assert.equal(A('q_price'), 'La Frenz is listed at $$ (moderate). Tap La Frenz for its details.');
  assert.equal(A('q_far', { stay: { name: 'Lakeside Inn', lat: 49.5, lng: -119.59 } }), 'La Frenz is about 11 km from Lakeside Inn in a straight line; the drive is a little longer.');
  assert.match(A('q_far'), /^There’s no place to stay on this plan to measure from\./);
  assert.match(A('q_book'), /doesn’t say if you need to book/);
});

test('5. getting there and around: flying in, a shuttle, a car for one day, no car after all', () => {
  assert.deepEqual(brief(R("we're flying into YLW")), [['transport', 'fly_in', []]]);
  assert.deepEqual(brief(R('our flight lands at 2pm')), [['transport', 'fly_in', []]]);
  assert.deepEqual(brief(R('on arrive en avion')), [['transport', 'fly_in', []]]);
  assert.deepEqual(brief(R('we need an airport shuttle')), [['transport', 'shuttle', []]]);
  assert.deepEqual(brief(R('we need a car for Saturday only')), [['transport', 'rental', [], 1]]);
  assert.deepEqual(brief(R('we need a rental car')), [['transport', 'rental', []]]);
  assert.deepEqual(brief(R('no car after all')), [['transport', 'no_rental', []]]);
  assert.deepEqual(brief(R('cancel the rental car')), [['transport', 'no_rental', []]]);
  assert.deepEqual(brief(R("we don't have a car")), [['transport', 'no_car', []]], 'no car of their own: the shuttle / central stay line, as before');
  assert.equal(R('find us cheap flights').cant, 'transport');
});

test('6. the shape of the trip: a night, a second town, adults, a stop moved, one stop\'s time', () => {
  assert.deepEqual(brief(R('add a night')), [['days', null, [], 3]]);
  assert.deepEqual(brief(R('add a night in Penticton')), [['days', null, [], 3, 'penticton']]);
  assert.deepEqual(brief(R('add a night', PLAN.filter((s) => s.day === 1), { days: 1 })), [['stay', 'add', []]], 'on a day plan: a place to stay for the night');
  assert.deepEqual(brief(R('remove a day')), [['days', null, [], 1]]);
  assert.equal(R('remove a day', PLAN.filter((s) => s.day === 1), { days: 1 }).cant, 'days_min');
  assert.deepEqual(R('we are 4 adults').ops.map((o) => [o.o, o.value, o.n]), [['party', 'adults', 4]]);
  assert.deepEqual(R('nous sommes 6 adultes').ops.map((o) => [o.o, o.value, o.n]), [['party', 'adults', 6]]);
  assert.deepEqual(R('move the gallery to day 2').ops.map((o) => [o.o, o.stops.map((s) => s.id), o.day, o.value]), [['move', [14], 2, null]]);
  assert.deepEqual(R('do the winery before lunch').ops.map((o) => [o.o, o.stops.map((s) => s.id), o.day, o.value]), [['move', [13, 12], 1, 'earlier']]);
  assert.deepEqual(R('move the gallery to the morning').ops.map((o) => [o.o, o.stops.map((s) => s.id), o.time]), [['move', [14], 'morning']]);
  assert.deepEqual(R('move dinner to 6:30').ops.map((o) => [o.o, o.stops[0].id, o.n]), [['set_time', 15, 1110]]);
  assert.deepEqual(R('move lunch later').ops.map((o) => [o.o, o.value]), [['time', 'later']], '"later" stays a shift of the day');
  assert.deepEqual(brief(R('a winery before dinner')).map((x) => x[0]), ['add'], '"a winery" is an add, "the winery" a move');
});

test('the model\'s answer: the new operations are checked like the rest', () => {
  const stops = PLAN.map((s, i) => ({ ...s, ref: `s${i + 1}` }));
  const item = (o) => ({ o: 'add', s: [], k: '', t: '', d: 0, v: '', n: 0, ka: [], r: '', sd: '', ...o });
  const V = (ops) => tc.validateWire({ ops, cant: '' }, stops, { regions: OPTS.regions, today: '2026-11-22' });
  let v = V([item({ o: 'ask', s: ['s3'], v: 'q_open' }), item({ o: 'move', s: ['s3', 's2'], v: 'earlier' }), item({ o: 'add', k: 'wine_tour', d: 2 }), item({ o: 'stay', v: 'add' }), item({ o: 'transport', v: 'fly_in' }), item({ o: 'party', v: 'adults', n: 4 })]);
  assert.equal(v.ok, true); assert.equal(v.ops.length, 6); assert.deepEqual(v.dropped, []);
  v = V([item({ o: 'move', s: ['s3'] }), item({ o: 'ask', s: ['s3'], v: 'budget' }), item({ o: 'party', v: 'adults', n: 0 }), item({ o: 'ask', s: ['s99'], v: 'q_open' })]);
  assert.equal(v.ok, false, 'a move with nowhere to go, a question with no topic, 0 adults and a made-up stop are all dropped');
  // The schema stays all-required and small enough; the prompt names the new abilities.
  const schema = tc.wireSchema(OPTS.regions);
  assert.deepEqual(schema.properties.ops.items.required, ['o', 's', 'k', 't', 'd', 'v', 'n', 'ka', 'r', 'sd']);
  assert.ok(schema.properties.ops.items.properties.o.enum.includes('ask') && schema.properties.ops.items.properties.k.enum.includes('wine_tour'));
  assert.match(tc.systemPrompt(OPTS.regions, OPTS.regionLabels), /Travel agent abilities/);
  // The rules' reading of a question, a move or the stay stands over a different AI reading; a question the AI read with no stop asks which.
  const msg = 'do the winery before lunch';
  assert.deepEqual(tc.reconcileReads({ ok: true, cant: null, ops: [{ o: 'time', value: 'earlier', stops: [PLAN[2]] }] }, R(msg), msg).ops.map((o) => o.o), ['move']);
  assert.equal(tc.reconcileReads({ ok: true, cant: null, ops: [{ o: 'ask', value: 'q_open', stops: [] }] }, { ops: [], cant: null }, 'is that place open?').cant, 'ask_which');
});

// ---------- A mocked planner that follows the hooks' contract (trip-planner.js v4AgentHooks) ----------
const VENUES = new Map(PLAN.map((s) => [s.id, s]));
VENUES.set(90, S({ id: 90, name: 'Vivid Wine Tours', type: 'tour' }));
VENUES.set(91, S({ id: 91, name: 'Filler Winery', type: 'winery' }));
const DEF = { morning: 585, midday: 690, afternoon: 795, late: 945, evening: 1080, night: 1185 };
function mockRun(calls, opts = {}) {
  return (a) => {
    calls.push(a);
    const slots = { ...(a.pinned || {}) };
    const starts = {};
    if (a.swap && a.swap.key) {
      if (!(a.swap.words || []).includes('wine tour') || opts.noTour) return { kind: 'multi_day', days: [], swapMissed: { key: a.swap.key } };
      slots[a.swap.key] = 90;
      Object.assign(starts, a.swap.times || {});
    }
    const res = {};
    for (const m of a.moves || []) { const x = slots[m.from], y = slots[m.to]; if (!x) continue; delete slots[m.from]; if (y) slots[m.from] = y; slots[m.to] = x; res.moved = [...(res.moved || []), { from: m.from, to: m.to, id: x }]; }
    for (const t of a.tourStops || []) {
      const replaced = [];
      for (const [k, id] of Object.entries(slots)) if (Number(k[0]) === t.day && id !== t.listingId && (t.covers || []).includes(VENUES.get(id).type)) { replaced.push(id); delete slots[k]; }
      slots[`${t.day}-${t.part}`] = t.listingId; starts[`${t.day}-${t.part}`] = t.startMinutes;
      res.tourReplaced = replaced;
    }
    // A pinned re-run fills a free part of a day with a place nobody asked for (the real planner does).
    if (!a.swap && !slots['2-midday']) slots['2-midday'] = 91;
    const ss = (a.overrides && a.overrides.stopStarts) || {};
    if (opts.refuse && ss[opts.refuse.key] !== undefined && ss[opts.refuse.key] === opts.refuse.at) res.stopStartRefused = [{ key: opts.refuse.key, reason: 'closed', opensMinutes: 660, closesMinutes: 1260 }];
    const days = [...new Set(Object.keys(slots).map((k) => Number(k[0])))].sort().map((d) => ({ day: d, stops: ['morning', 'midday', 'afternoon', 'late', 'evening', 'night'].filter((p) => slots[`${d}-${p}`]).map((p) => ({ daypart: p, venue: { id: slots[`${d}-${p}`], name: VENUES.get(slots[`${d}-${p}`]).name, type: VENUES.get(slots[`${d}-${p}`]).type } })) }));
    const schedule = [];
    for (const d of days) for (const s of d.stops) { const k = `${d.day}-${s.daypart}`; schedule.push({ day: d.day, venueId: s.venue.id, startMinutes: res.stopStartRefused && res.stopStartRefused.some((x) => x.key === k) ? DEF[s.daypart] : (ss[k] !== undefined ? ss[k] : starts[k] !== undefined ? starts[k] : DEF[s.daypart]) }); }
    return { kind: 'multi_day', days, schedule, ...res };
  };
}
const HOOKS = { tourStops: true, moves: true, stopStarts: true };
const ctxFor = (calls, opts) => ({ args: { text: 'two days in Kelowna', seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: PLAN, days: 2, lang: 'en', regionLabels: OPTS.regionLabels, run: mockRun(calls, opts), hooks: HOOKS });
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });

test('2b. a wine tour goes INTO the plan as a timed stop (tourStops) and covers that day\'s wineries; it is said', () => {
  const calls = [];
  const out = tc.planTurn([OP({ o: 'add', kind: 'wine_tour', day: 2 })], ctxFor(calls));
  const nw = tc.planStops(out.plan);
  assert.ok(nw.some((s) => s.id === 90 && s.key === '2-afternoon'), 'the tour takes the first winery\'s place that day');
  assert.ok(!nw.some((s) => [23, 24, 91].includes(s.id)), 'that day\'s wineries give way; nothing nobody asked for is added');
  assert.deepEqual(nw.filter((s) => s.day === 1).map((s) => [s.id, s.start]), PLAN.filter((s) => s.day === 1).map((s) => [s.id, s.start]), 'day 1 is untouched');
  const hook = calls.find((a) => (a.tourStops || []).length);
  assert.deepEqual(hook.tourStops, [{ day: 2, part: 'afternoon', listingId: 90, startMinutes: 795, durationMinutes: 240, covers: ['winery'] }]);
  assert.ok(hook.trustedPins.length && hook.trustedPins.every((k) => hook.pinned[k]), 'the other stops are pins the chat trusts');
  assert.deepEqual(out.req.tourStops, hook.tourStops, 'the tour stop rides along with later requests');
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added Vivid Wine Tours at 1:15 PM in place of Moraine Estate Winery. It covers that day’s wineries, so I took out Tantalus Vineyards.');
  assert.match(tc.buildReply(out, { lang: 'fr' }), /^C’est fait\. J’ai ajouté Vivid Wine Tours à 13 h 15 à la place de Moraine Estate Winery\. Il couvre les vignobles de cette journée, donc j’ai retiré Tantalus Vineyards\.$/);
  // No listed tour fits: said in one line, the plan untouched.
  const none = tc.planTurn([OP({ o: 'add', kind: 'wine_tour', day: 2 })], ctxFor([], { noTour: true }));
  assert.equal(none.plan, null);
  assert.equal(tc.buildReply(none, { lang: 'en' }), 'We don’t list a wine tour that fits there. Your plan is unchanged.');
  none.results[0].offer = { name: 'a boat cruise', short: 'boat cruise' };
  assert.equal(tc.buildReply(none, { lang: 'en' }), 'We don’t list a wine tour that fits there. The nearest thing we list is a boat cruise: say “add boat cruise”.');
});

test('6b. a stop moved (moves) and one stop\'s time (stopStarts): only that changes; a refusal says why', () => {
  let calls = [];
  let out = tc.planTurn([OP({ o: 'move', stops: [PLAN[3]], day: 2 })], ctxFor(calls));
  let nw = tc.planStops(out.plan);
  assert.ok(nw.some((s) => s.id === 14 && s.day === 2), 'the gallery is on day 2');
  assert.equal(nw.length, PLAN.length, 'every other stop is still on the plan, and no filler was added');
  assert.deepEqual(calls[0].moves, [{ from: '1-late', to: '2-midday' }].map(() => calls[0].moves[0]));
  assert.equal(calls[0].moves[0].from, '1-late');
  assert.ok(!calls[0].trustedPins.includes('1-late'), 'the moved stop is not pinned back');
  assert.equal(calls[0].overrides.stopStarts['1-morning'], 585, 'the other stops keep their own times');
  assert.ok(!(out.req.overrides || {}).stopStarts, 'those times are not saved as the visitor\'s own');
  assert.match(tc.buildReply(out, { lang: 'en' }), /^Done\. Moved Kelowna Art Gallery to day 2 at /);
  // "do the winery before lunch": it trades places with the morning stop.
  calls = [];
  out = tc.planTurn([OP({ o: 'move', stops: [PLAN[2], PLAN[1]], day: 1, value: 'earlier' })], ctxFor(calls));
  nw = tc.planStops(out.plan);
  assert.deepEqual([nw.find((s) => s.id === 13).key, nw.find((s) => s.id === 11).key], ['1-morning', '1-afternoon']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Moved La Frenz Estate Winery to 9:45 AM. Knox Mountain Park takes its place at 1:15 PM.');
  // One stop's own time.
  calls = [];
  out = tc.planTurn([OP({ o: 'set_time', stops: [PLAN[4]], n: 1110 })], ctxFor(calls));
  assert.equal(tc.planStops(out.plan).find((s) => s.id === 15).start, 1110);
  assert.deepEqual(out.req.overrides.stopStarts, { '1-evening': 1110 }, 'the time asked for is kept for later requests');
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Ramen Arashi Kelowna is now at 6:30 PM.');
  out = tc.planTurn([OP({ o: 'set_time', stops: [PLAN[4]], n: 600 })], ctxFor([], { refuse: { key: '1-evening', at: 600 } }));
  assert.equal(out.plan, null);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Ramen Arashi Kelowna isn’t open at 10 AM (its listed hours are 11 AM to 9 PM), so it stays where it is.');
  // Without the planner's hook: said plainly (the older line).
  out = tc.planTurn([OP({ o: 'set_time', stops: [PLAN[4]], n: 1110 })], { ...ctxFor([]), hooks: {} });
  assert.equal(tc.buildReply(out, { lang: 'en' }), tc.T.en.time_at);
});

// ---------- The API, with the real planner ----------
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
let ipN = 1;
const post = async (body) => {
  const r = await fetch(`${base}/api/trip/chat?stays=1&v=4&chat=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-Real-IP': `10.9.0.${ipN++}` }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
};
// The same file runs on both sites: a wine day in Kelowna, or a day in Squamish.
const TEXT = app.REGION_LABELS.kelowna ? 'a day in Kelowna with wineries' : 'a day in Squamish';
function bodyFor(message, extra = {}) {
  const plan = app.runTripPlanRequest(app.parseTripPlanBody({ text: TEXT }, { v4: true }).value, false);
  return { plan, body: { message, lang: 'en', plan: { text: TEXT, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: tc.planStops(plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })), ...extra } };
}

test('API: no dead ends on a day plan (a stay, a tour, a question, several asks, getting there, adults)', async () => {
  // The repo database lists no places to stay and no tours: each is said plainly, never "this plan has no night away".
  let r = await post(bodyFor('find us a place to stay with a hot tub').body);
  assert.equal(r.status, 200);
  assert.ok([/^Added a place to stay for the night of /, /^I couldn’t find a place to stay near these stops in our list\.$/].some((re) => re.test(r.j.reply)), r.j.reply);
  assert.doesNotMatch(r.j.reply, /no night away|single day/);
  r = await post(bodyFor('book us a wine tour').body);
  assert.notEqual(r.j.reply, tc.T.en.booking);
  assert.match(r.j.reply, /^(?:Done\. Added |We don’t list a wine tour that fits there)/);
  if (!r.j.plan) assert.deepEqual(r.j.changed, [], 'nothing changes when none is listed');
  // A question is answered from the listing; nothing changes.
  const b = bodyFor('x');
  const winery = tc.planStops(b.plan).find((s) => (app.REGION_LABELS.kelowna ? s.type === 'winery' : !s.role));
  const word = winery.name.split(/\s+/).find((w) => /^[A-Za-z]{5,}$/.test(w) && !/winery|wines|estate|vineyards?|cellars|provincial|squamish|whistler|kelowna/i.test(w)) || winery.name;
  r = await post({ ...b.body, message: `is ${word} open Sunday?` });
  assert.match(r.j.reply, new RegExp(`^(?:${winery.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is listed as (?:open Sunday, .+ to .+|closed on Sunday)\\.|We don’t have hours on file for )`));
  assert.equal(r.j.plan, null); assert.deepEqual(r.j.changed, []);
  r = await post({ ...b.body, message: `how far is ${word} from the hotel?` });
  assert.match(r.j.reply, /^There’s no place to stay on this plan to measure from\./);
  // Several asks: each is carried out or said.
  r = await post({ ...b.body, message: `remove ${word}, we are flying into ${app.REGION_LABELS.kelowna ? 'YLW' : 'YVR'} and we are 4 adults` });
  assert.deepEqual(r.j.actions.remove, [winery.key]);
  assert.match(r.j.reply, new RegExp(`^Done\\. Took out ${winery.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\. Got it, you’re flying into .+ Set for 4 adults\\.$`));
  assert.deepEqual(r.j.party, { adults: 4 });
  r = await post({ ...b.body, message: 'no car after all' });
  assert.equal(r.j.reply, 'Done. I took the rental car off.'); assert.equal(r.j.actions.transport, 'driving');
  r = await post({ ...b.body, message: 'remove the hotel' });
  assert.equal(r.j.reply, 'There’s no place to stay on this plan.');
  assert.deepEqual(r.j.stayPref, { none: true });
});

test('page: the chat page carries a forced stay, tour stops, one stop\'s time and the adults along', () => {
  const page = require('fs').readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
  assert.match(page, /if \(chat\.stayForce && !\(chat\.stayPref && chat\.stayPref\.none\)\) \{ o\.force = true;/);
  assert.match(page, /if \(\(chat\.tourStops \|\| \[\]\)\.length\) body\.tourStops = chat\.tourStops;/);
  assert.match(page, /'eventId', 'stopStarts'\]\.forEach/);
  assert.match(page, /chat\.tourStops = j\.req\.tourStops \|\| \[\];/);
  assert.match(page, /if \(j\.party && j\.party\.adults > 0\)/);
});
