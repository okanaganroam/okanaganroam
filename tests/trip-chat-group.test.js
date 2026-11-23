'use strict';
// Travel agent chat: one non-drinker in a group, explain questions, the broad-change guard (2026-11-22, Dayton's brief:
// one non-drinker must not remove wineries for everyone; questions are answers, never edits; a targeted edit keeps the
// other stops; a broad change is said first; never claim a feature the listing does not support).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
const app = require('../server.js');
const tc = require('../trip-chat.js');
test.after(() => { try { app.server.close(); } catch (e) { /* not listening */ } });

const S = (o) => ({ badges: [], price: 2, role: '', ...o });
const PLAN = [
  S({ key: '1-morning', id: 11, name: 'Tree of Wisdom Trail', type: 'outdoor', day: 1, start: 615 }),
  S({ key: '1-midday', id: 12, name: 'Frankie We Salute You!', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 13, name: 'Meadow Vista Honey Wines', type: 'winery', day: 1, start: 795 }),
  S({ key: '1-evening', id: 15, name: 'Dawett Fine Indian Cuisine', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
  S({ key: '1-night', id: 16, name: 'Blue Gator Bar', type: 'pub', day: 1, start: 1200, badges: ['live_music'] }),
  S({ key: '2-morning', id: 21, name: 'Mill Creek Regional Park', type: 'outdoor', day: 2, start: 615 }),
  S({ key: '2-midday', id: 22, name: 'Table Nineteen Kelowna', type: 'restaurant', day: 2, start: 690, role: 'lunch' }),
  S({ key: '2-evening', id: 25, name: 'Gulfstream', type: 'restaurant', day: 2, start: 1080, role: 'dinner' }),
];
const REQ = 'Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.';
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
const R = (m, stops = PLAN, extra = {}) => tc.rulesRead(m, stops, { regions: [], regionLabels: {}, days: 2, request: REQ, ...extra });
const dayPlan = (stops) => ({ kind: 'multi_day', days: [1, 2].map((d) => ({ day: d, stops: stops.filter((s) => s.day === d).map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: 2, badges: (s.badges || []).map((b) => ({ key: b })) } })) })), schedule: stops.map((s) => ({ day: s.day, venueId: s.id, startMinutes: s.start })) });
const ctxFor = (run, extra = {}) => ({ args: { text: REQ, seed: 0 }, locks: {}, removed: [], stops: PLAN, days: 2, run, regionLabels: {}, lang: 'en', ...extra });
const AZ = { key: '2-afternoon', id: 812, name: 'Azhadi Vineyards', type: 'winery', day: 2, start: 795, badges: [] };
const MSG1 = 'Only one person does not drink; the rest want wineries. Can you add a winery on day 2 with a non-alcoholic option?';

test('1. one non-drinker: ONE winery on day 2 asked with the non-alcoholic badge; nothing else changes; the claim is made only when the listing supports it', () => {
  const r = R(MSG1);
  assert.deepEqual(r.ops.map((o) => [o.o, o.kind, o.day, o.features || null]), [['party_some', null, null, null], ['add', 'winery', 2, ['nonalcoholic']]]);
  assert.ok(!r.ops.some((o) => o.o === 'party' && o.value === 'no_alcohol'));
  // The AI's reading (no alcohol for everyone, two wineries) never wins.
  const m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'party', value: 'no_alcohol' }), OP({ o: 'add', kind: 'winery' }), OP({ o: 'add', kind: 'winery', day: 2 })] }, r, MSG1);
  assert.deepEqual(m.ops.map((o) => o.o), ['party_some', 'add']);
  // The planner is asked for a winery with the badge, wide, and only that slot.
  const calls = [];
  const run = (a) => { calls.push(a); return dayPlan([...PLAN, AZ]); };
  const ops = r.ops.filter((o) => o.o !== 'party_some');
  let out = tc.planTurn(ops, ctxFor(run, { hasFeature: (id, f) => id === 812 && f === 'nonalcoholic' }));
  assert.deepEqual(calls[0].swap.features, ['nonalcoholic']);
  assert.deepEqual(calls[0].swap.types, ['winery']);
  assert.equal(calls[0].swap.wide, true);
  assert.deepEqual(out.changed, ['2-afternoon']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added Azhadi Vineyards at 1:15 PM. Its listing has non-alcoholic options.');
  assert.equal(tc.buildReply(out, { lang: 'fr' }), 'C’est fait. J’ai ajouté Azhadi Vineyards à 13 h 15. Sa fiche indique des options sans alcool.');
  // No winery with the badge within reach: the best winery, and plainly that its listing does not say.
  const run2 = (a) => (a.swap.features ? { ...dayPlan(PLAN), swapMissed: { key: a.swap.key } } : dayPlan([...PLAN, AZ]));
  out = tc.planTurn(ops, ctxFor(run2, { hasFeature: () => false }));
  const rep = tc.buildReply(out, { lang: 'en' });
  assert.equal(rep, 'Done. Added Azhadi Vineyards at 1:15 PM. Its listing doesn’t say if it has non-alcoholic options, so ask when you book.');
  // A planner that came back with a winery without the badge is never described as having it.
  out = tc.planTurn(ops, ctxFor(run, { hasFeature: () => false }));
  assert.doesNotMatch(tc.buildReply(out, { lang: 'en' }), /listing has non-alcoholic/);
  // The day already has a winery whose listing has it: said, nothing changes.
  const with2 = [...PLAN, AZ];
  out = tc.planTurn(tc.rulesRead(MSG1, with2, { days: 2, request: REQ }).ops.filter((o) => o.o !== 'party_some'), ctxFor(() => { throw new Error('no run'); }, { stops: with2, hasFeature: (id) => id === 812 }));
  assert.equal(out.plan, null);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Azhadi Vineyards on day 2 already lists non-alcoholic options, so I left the day as it is.');
  // "we don't drink" said of the whole group, then "only one of us doesn't": the stored request is rewritten.
  assert.equal(tc.onePersonText('a weekend in Kelowna with friends, no alcohol'), 'a weekend in Kelowna with friends. One person does not drink.');
  assert.equal(tc.onePersonText('3 days in Kelowna, we do not drink'), '3 days in Kelowna. One person does not drink.');
  for (const msg of ['only one of us doesn’t drink', 'the rest of us drink', 'the others want wineries', 'seulement une personne ne boit pas']) assert.deepEqual(R(msg).ops.map((o) => o.o), ['party_some'], msg);
});

test('2. explain questions are answers, never edits', () => {
  const kinds = (m) => R(m).ops.map((o) => [o.o, o.value, o.kind || null]);
  assert.deepEqual(kinds('Can you explain why you left out the wineries and suggest an option for our non-drinking friend?'), [['ask', 'q_why_not', 'winery'], ['ask', 'q_dry', null]]);
  assert.deepEqual(kinds('why are there no wineries?'), [['ask', 'q_why_not', 'winery']]);
  assert.deepEqual(kinds('why no brewery?'), [['ask', 'q_why_not', 'brewery']]);
  assert.deepEqual(kinds('why didn’t you include live music?'), [['ask', 'q_why_not', 'live_music']]);
  assert.deepEqual(kinds('what did you change?'), [['ask', 'q_changed', null]]);
  assert.deepEqual(kinds('what couldn’t you do?'), [['ask', 'q_couldnt', null]]);
  assert.deepEqual(kinds('pourquoi il n’y a pas de vignobles?'), [['ask', 'q_why_not', 'winery']]);
  assert.deepEqual(kinds('qu’est-ce que tu as changé?'), [['ask', 'q_changed', null]]);
  // "why not add a winery on day 2" is a request, not a question about the plan.
  assert.ok(R('why not add a brewery on day 2').ops.every((o) => o.o !== 'ask'));
  // The AI's edit reading never wins over a question.
  const msg = 'why are there no wineries?';
  const m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'add', kind: 'winery' })] }, R(msg), msg);
  assert.deepEqual(m.ops.map((o) => o.o), ['ask']);
  // The answers, from facts in hand.
  const A = (op, facts) => tc.explainReply(op, facts, 'en');
  assert.equal(A({ value: 'q_why_not', kind: 'winery' }, { stops: PLAN, request: REQ }), 'Your plan does have a winery: Meadow Vista Honey Wines on day 1.');
  assert.equal(A({ value: 'q_why_not', kind: 'winery' }, { stops: [...PLAN, AZ], request: REQ }), 'You asked for two wineries: Meadow Vista Honey Wines on day 1 and Azhadi Vineyards on day 2.');
  const noWine = PLAN.filter((s) => s.type !== 'winery');
  assert.equal(A({ value: 'q_why_not', kind: 'winery' }, { stops: noWine, request: 'a weekend in Kelowna, no alcohol', wholeDry: true }), 'Your request said the group doesn’t drink, so I left wineries out. If only one of you doesn’t, say so and I’ll add them.');
  assert.equal(A({ value: 'q_why_not', kind: 'winery' }, { stops: noWine, request: REQ, notIncluded: [{ kind: 'winery', text: 'I couldn’t fit a winery into this plan.' }] }), 'I couldn’t fit a winery into this plan. Say “add a winery” and I’ll try again.');
  assert.equal(A({ value: 'q_why_not', kind: 'brewery' }, { stops: PLAN, request: REQ }), 'Your request didn’t ask for a brewery, so there isn’t one. Say “add a brewery” if you’d like one.');
  assert.equal(A({ value: 'q_why_not', kind: 'live_music' }, { stops: PLAN, request: REQ }), 'Your plan does have live music: Blue Gator Bar on day 1.');
  assert.equal(A({ value: 'q_dry' }, { stops: [...PLAN, AZ], naIds: [812] }), 'For your non-drinker: Azhadi Vineyards lists non-alcoholic options.');
  assert.equal(A({ value: 'q_dry' }, { stops: PLAN, naIds: [] }), 'None of your tasting stops lists non-alcoholic options on its listing, so ask when you book. Want me to add a café near the winery? Say “add a café”.');
  assert.equal(A({ value: 'q_changed' }, { stops: PLAN, last: { in: ['Azhadi Vineyards'], out: ['Mill Creek Regional Park'], moved: [] } }), 'Last change: I added Azhadi Vineyards and took out Mill Creek Regional Park.');
  assert.equal(A({ value: 'q_changed' }, { stops: PLAN, last: null }), 'I haven’t changed anything in this plan yet.');
  assert.equal(A({ value: 'q_couldnt' }, { stops: PLAN, last: { in: [], out: [], moved: [], failed: ['ice_cream'] }, notIncluded: [] }), 'Last time I couldn’t add ice cream.');
  assert.equal(A({ value: 'q_couldnt' }, { stops: PLAN, last: null, notIncluded: [] }), 'Nothing is missing: everything you asked for is in the plan.');
});

test('3-4. the broad-change guard: a targeted edit that would change more than 2 other stops asks first; a sunset time never drops a stop unasked', () => {
  const ops = [OP({ o: 'add', kind: 'winery', day: 2 })];
  const rolled = [...PLAN.slice(0, 2), { ...PLAN[2], id: 91, name: 'A Winery' }, { ...PLAN[3], id: 92, name: 'B Diner' }, { ...PLAN[4], id: 93, name: 'C Bar' }, ...PLAN.slice(5), AZ];
  const out = { plan: dayPlan(rolled), results: [{ op: 'add', ok: true, fresh: AZ, kind: 'winery' }], changed: ['1-afternoon', '1-evening', '1-night', '2-afternoon'] };
  const g = tc.guardTurn(out, PLAN, ops);
  assert.equal(g.kind, 'broad');
  assert.deepEqual(g.stops.map((s) => s.name), ['Meadow Vista Honey Wines', 'Dawett Fine Indian Cuisine', 'Blue Gator Bar']);
  assert.equal(tc.guardReply(g, 'en'), 'That would change 3 other stops: Meadow Vista Honey Wines, Dawett Fine Indian Cuisine and Blue Gator Bar. Go ahead?');
  assert.match(tc.guardReply(g, 'fr'), /^Cela changerait 3 autres arrêts : .* On y va\?$/);
  // One stop added, nothing else: no guard. An explicit broad ask (pace, dates, budget, start over): no guard.
  assert.equal(tc.guardTurn({ plan: dayPlan([...PLAN, AZ]), results: [{ op: 'add', ok: true, fresh: AZ }], changed: ['2-afternoon'] }, PLAN, ops), null);
  assert.equal(tc.guardTurn(out, PLAN, [OP({ o: 'pace', value: 'relaxed' })]), null);
  assert.equal(tc.guardTurn(out, PLAN, [OP({ o: 'start_over' })]), null);
  // Sunset: a dinner moved to the sunset time that would drop a stop asks first.
  const sun = { plan: dayPlan(PLAN.filter((s) => s.id !== 13).map((s) => (s.id === 15 ? { ...s, start: 990 } : s))), results: [{ op: 'set_time', ok: true, sunset: true, fresh: { ...PLAN[3], start: 990 }, stop: PLAN[3], gaveWay: [PLAN[2]] }], changed: ['1-evening'] };
  const gs = tc.guardTurn(sun, PLAN, [OP({ o: 'set_time', stops: [PLAN[3]], n: 990, sunsetTime: true })]);
  assert.equal(gs.kind, 'sunset');
  assert.equal(tc.guardReply(gs, 'en'), 'A sunset dinner at 4:30 PM would mean dropping Meadow Vista Honey Wines. Go ahead?');
  // The body carries the yes and the last change.
  const body = { message: 'x', lang: 'en', plan: { text: REQ, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: PLAN.map((s) => ({ key: s.key, id: s.id, start: s.start })) };
  assert.equal(app.parseTripChatBody({ ...body, confirmed: true }, {}).value.confirmed, true);
  assert.deepEqual(app.parseTripChatBody({ ...body, last: { in: [812], out: [21], moved: [], failed: ['winery'] } }, {}).value.last, { in: [812], out: [21], moved: [], failed: ['winery'] });
  assert.ok(app.parseTripChatBody({ ...body, last: { in: ['x'] } }, {}).error);
  const page = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(page, /body\.confirmed = true/);
  assert.match(page, /chat\.pending/);
  assert.match(page, /body\.last = chat\.lastDiff/);
});

test('5. a reply that changes the plan names the stops; "Changed 5 stops. I couldn’t find a fit for the rest." is never said for a targeted ask', () => {
  const B = { key: '2-late', id: 813, name: 'Second Winery', type: 'winery', day: 2, start: 930, badges: [] };
  const out = { plan: dayPlan([...PLAN, AZ, B]), changed: ['2-afternoon', '2-late'], added: [AZ, B], gone: [], actions: { remove: [], keep: [] },
    results: [{ op: 'add', ok: true, local: true, fresh: AZ, kind: 'winery' }, { op: 'add', ok: true, local: true, fresh: B, kind: 'winery' }, { op: 'add', ok: false, local: true, kind: 'ice_cream', why: 'no_fit' }, { op: 'add', ok: false, local: true, kind: 'bowling', why: 'no_fit' }, { op: 'add', ok: false, local: true, kind: 'cinema', why: 'no_fit' }] };
  const rep = tc.buildReply(out, { lang: 'en', asks: 1 });
  assert.doesNotMatch(rep, /couldn’t find a fit for the rest|Changed \d+ stops\. I/);
  assert.match(rep, /Azhadi Vineyards/);
  assert.match(rep, /Second Winery/);
  assert.match(rep, /I couldn’t find ice cream/);
  // A broad change with many stops: the count and the days.
  const broad = { plan: dayPlan(PLAN), changed: ['1-morning', '1-afternoon', '2-morning', '2-evening'], added: [1, 2, 3, 4].map((i) => ({ id: 900 + i, name: `N${i}` })), gone: [1, 2, 3, 4].map((i) => ({ id: 800 + i, name: `O${i}` })), actions: { remove: [], keep: [] }, results: [{ op: 'pace', ok: true, broad: true, value: 'packed' }] };
  assert.equal(tc.buildReply(broad, { lang: 'en' }), 'Done. Busier days. Changed 4 stops on days 1 and 2.');
});
