'use strict';
// Travel agent chat, round 5 (2026-11-23, fourth fresh-eyes test): weekdays come from each day's own date; a weekday or a
// part of the day never moves the trip; an add into a full part of the day takes the place of the stop there and says
// which; the word rules stand where they read a specific edit; what the chat added is "soft" (never a hard lock).
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
  S({ key: '1-morning', id: 11, name: 'Knox Mountain Park', type: 'outdoor', day: 1, start: 585 }),
  S({ key: '1-midday', id: 12, name: 'Broken Anchor Cafe', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 13, name: 'Kelowna Art Gallery', type: 'indoor', day: 1, start: 795 }),
  S({ key: '1-late', id: 14, name: 'Planet Lazer', type: 'indoor', day: 1, start: 945 }),
  S({ key: '1-evening', id: 15, name: 'Yuzu Bowl', type: 'restaurant', day: 1, start: 1080, role: 'dinner', price: 3 }),
  S({ key: '2-morning', id: 21, name: 'Stuart Park Outdoor Rink', type: 'outdoor', day: 2, start: 585 }),
  S({ key: '2-midday', id: 22, name: 'Salsa & Sabor', type: 'restaurant', day: 2, start: 690, role: 'lunch' }),
  S({ key: '2-evening', id: 25, name: 'JOEY Kelowna', type: 'restaurant', day: 2, start: 1080, role: 'dinner', price: 3 }),
];
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
const brief = (r) => r.ops.map((o) => [o.o, o.kind, (o.stops || []).map((s) => s.id), o.value]);
const dayPlan = (stops) => ({ kind: 'multi_day', days: [1, 2].map((d) => ({ day: d, stops: stops.filter((s) => s.day === d).map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: s.price || 2, badges: [] } })) })), schedule: stops.map((s) => ({ day: s.day, venueId: s.id, startMinutes: s.start })) });
const ctxFor = (run, extra = {}) => ({ args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops: PLAN, days: 2, run, regionLabels: {}, lang: 'en', ...extra });

test('weekdays come from each day\'s own date (Dec 11-13: Friday is day 1), so "Friday dinner" is Friday\'s', () => {
  const wd = tc.weekdayDays(['2026-12-11', '2026-12-12', '2026-12-13'], 3);
  assert.deepEqual([wd.friday, wd.saturday, wd.sunday, wd.vendredi], [1, 2, 3, 1]);
  assert.deepEqual(tc.weekdayDays([null, null], 2), {});
  const R = (m) => tc.rulesRead(m, PLAN, { regions: [], regionLabels: {}, days: 2, weekdays: tc.weekdayDays(['2026-12-11', '2026-12-12'], 2) });
  assert.deepEqual(brief(R('swap Friday dinner for pizza')), [['replace', 'pizza', [15], null]]);
  assert.deepEqual(brief(R('something cheaper for dinner on Friday')), [['budget', null, [15], 'budget']]);
  assert.deepEqual(brief(R('swap Saturday lunch for sushi')), [['replace', 'sushi', [22], null]]);
  assert.deepEqual(brief(R('swap Friday lunch for burgers')), [['replace', 'burgers', [12], null]]);
  // The page sends the dates of the plan's days; the server reads them.
  const stops = PLAN.map((s) => ({ key: s.key, id: s.id, start: s.start }));
  const body = { message: 'x', lang: 'en', plan: { text: 'a weekend in Kelowna', seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops };
  assert.deepEqual(app.parseTripChatBody({ ...body, dayDates: ['2026-12-11', null] }, {}).value.dayDates, ['2026-12-11', null]);
  assert.ok(app.parseTripChatBody({ ...body, dayDates: ['Friday'] }, {}).error);
  assert.match(app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' }), /body\.dayDates = dd/);
});

test('a weekday or a part of the day never moves the trip: the AI\'s date is dropped unless the message gives a date', () => {
  const R = (m) => tc.rulesRead(m, PLAN, { regions: [], regionLabels: {}, days: 2, weekdays: tc.weekdayDays(['2026-12-11', '2026-12-12'], 2) });
  const msg = 'add a spa on Saturday afternoon instead of the park';
  let m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'date', date: '2026-11-28' })] }, R(msg), msg);
  assert.ok(!m.ops.some((o) => o.o === 'date'), 'no date change');
  assert.deepEqual(m.fixes, ['no_date']);
  m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'date', date: '2026-11-28' }), OP({ o: 'time', value: 'later' })] }, R('start later on Saturday'), 'start later on Saturday');
  assert.ok(!m.ops.some((o) => o.o === 'date'));
  for (const ok of ["we're coming December 5 and 6", 'move the trip to next weekend', 'on arrive le 5 décembre', 'change the dates to 2026-12-05']) {
    m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'date', date: '2026-12-05' })] }, R(ok), ok);
    assert.ok(m.ops.some((o) => o.o === 'date'), ok);
  }
});

test('an add into a full part of the day takes the place of the stop there and says which; never a meal or a stop the visitor kept', () => {
  const R = (m) => tc.rulesRead(m, PLAN, { regions: [], regionLabels: {}, days: 2 });
  const scoop = S({ key: '1-afternoon', id: 81, name: 'MOO-LIX Ice Cream Shop', type: 'cafe', day: 1, start: 795 });
  const calls = [];
  const run = (a) => { calls.push(a); return dayPlan(PLAN.map((s) => (s.key === a.swap.key ? { ...scoop, key: a.swap.key, start: s.start } : s))); };
  let out = tc.planTurn(R('add ice cream after lunch').ops, ctxFor(run));
  assert.equal(calls[calls.length - 1].swap.key, '1-afternoon');
  assert.equal(calls[calls.length - 1].swap.id, undefined, 'round 6: the stop that gives way is not the model for the new one');
  assert.ok(calls[calls.length - 1].excludeVenueIds.includes(13), 'the gallery after lunch gives way');
  assert.deepEqual(out.changed, ['1-afternoon']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added MOO-LIX Ice Cream Shop at 1:15 PM in place of Kelowna Art Gallery.');
  assert.equal(tc.buildReply(out, { lang: 'fr' }), 'C’est fait. J’ai ajouté MOO-LIX Ice Cream Shop à 13 h 15 à la place de Kelowna Art Gallery.');
  // The stop there was kept by the visitor: it is not replaced, and the reply says there is no free spot.
  out = tc.planTurn(R('add ice cream after lunch').ops, ctxFor(run, { locks: { '1-afternoon': 13 } }));
  assert.equal(out.plan, null);
  assert.match(tc.buildReply(out, { lang: 'en' }), /^There’s no free spot for ice cream after lunch/);
});

test('the word rules stand where they read a specific edit: bowling or a movie, "more indoor things", a thing to do after dinner, a day that ends after lunch', () => {
  const R = (m) => tc.rulesRead(m, PLAN, { regions: [], regionLabels: {}, days: 2, weekdays: tc.weekdayDays(['2026-12-12', '2026-12-13'], 2) });
  const AI = (ops) => ({ ok: true, cant: null, ops });
  let msg = 'quilles ou cinéma après le souper';
  let m = tc.reconcileReads(AI([OP({ o: 'add', kind: 'arts', stops: [PLAN[4]] })]), R(msg), msg);
  assert.deepEqual(m.ops.map((o) => [o.kind, o.alt]), [['bowling', ['cinema']]], 'round 6: one stop, bowling or else a cinema');
  msg = 'more indoor things';
  m = tc.reconcileReads(AI([OP({ o: 'add', kind: 'indoor' })]), R(msg), msg);
  assert.deepEqual(brief(m), [['replace', 'indoor', [11], null], ['replace', 'indoor', [21], null]], 'the outdoor stops are swapped; nothing is "added at that time"');
  msg = 'quelque chose à faire après le souper';
  m = tc.reconcileReads(AI([OP({ o: 'add', kind: 'restaurant', stops: [PLAN[4]] })]), R(msg), msg);
  assert.deepEqual(brief(m), [['add', 'activity', [15], null]], 'never a second dinner');
  msg = 'make Sunday lighter, we drive home after lunch';
  m = tc.reconcileReads(AI([OP({ o: 'pace', value: 'relaxed' }), OP({ o: 'transport', value: 'driving' })]), R(msg), msg);
  assert.deepEqual(brief(m), [['remove', null, [25], null]], 'Sunday ends with lunch (lunch stays); getting here is untouched');
  assert.deepEqual(brief(R('something more romantic for dinner on Saturday')), [['budget', null, [15], 'upscale']]);
  const q = R('what time do the lifts open?');
  assert.equal(q.cant, 'ask_which', 'a question with no stop it can be about asks which stop (travel agent abilities answer it from the listing when one is named)');
  assert.match(tc.cantReply('info', 'en'), /Tap the stop’s name/);
});

test('"slower pace" never re-plans a day plan; a start time that changed counts as a change', () => {
  const thin = PLAN.filter((s) => s.role || s.id === 11);
  let ran = 0;
  const out = tc.planTurn([OP({ o: 'pace', value: 'relaxed' })], ctxFor(() => { ran += 1; return dayPlan(thin); }, { stops: thin }));
  assert.equal(ran, 0);
  assert.deepEqual(out.actions.remove, ['1-morning']);
  const later = PLAN.map((s) => (s.id === 11 ? { ...s, start: 630 } : s));
  const t = tc.planTurn([OP({ o: 'time', value: 'later', day: 1 })], ctxFor(() => dayPlan(later)));
  assert.ok(t.changed.includes('1-morning'), 'the page takes the new plan (it kept the old one while the reply said "starts later")');
});

test('what the chat added goes back as soft (the Swap button never sends it as a hard lock); cheaper stays in the stay\'s town; one-day plans', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /out\.req\.locks = L; out\.req\.soft = S;/);
  assert.match(src, /pref\.region = v\.stayTown/);
  const stops = PLAN.map((s) => ({ key: s.key, id: s.id, start: s.start }));
  const body = { message: 'x', lang: 'en', plan: { text: 'a weekend in Kelowna', seed: 0, excludeVenueIds: [] }, locks: { '1-late': 14 }, removed: [], stops, soft: { '1-afternoon': 13, '1-late': 14, '2-night': 99 } };
  assert.deepEqual(app.parseTripChatBody(body, {}).value.soft, { '1-afternoon': 13 }, 'only stops still on the plan, and not the visitor\'s own locks');
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /chat\.soft = j\.req\.soft \|\| \{\}/);
  assert.match(tc.T.en.stayOff, /make it 2 days/);
});
