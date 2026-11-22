'use strict';
// Travel agent chat, round 4 (2026-11-23, third fresh-eyes test): the add / swap searches the listings by the words asked
// (pizza, bowling, hot chocolate, a wine bar) and near the stops around it; a change touches only what was asked (the
// place to stay and every other stop stay); weekdays name days; replies are one or two sentences; the rate limit.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
const app = require('../server.js');
const tc = require('../trip-chat.js');
const planner = require('../trip-planner.js');

test.after(() => { try { app.server.close(); } catch (e) { /* not listening */ } });

const S = (o) => ({ badges: [], price: 2, role: '', ...o });
const PLAN = [
  S({ key: '1-morning', id: 11, name: 'Knox Mountain Park', type: 'outdoor', day: 1, start: 585 }),
  S({ key: '1-midday', id: 12, name: 'Broken Anchor Cafe', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 13, name: 'La Frenz Estate Winery', type: 'winery', day: 1, start: 795 }),
  S({ key: '1-late', id: 14, name: 'Bad Tattoo Brewing', type: 'brewery', day: 1, start: 945 }),
  S({ key: '1-evening', id: 15, name: 'Ramen Arashi Kelowna', type: 'restaurant', day: 1, start: 1080, role: 'dinner', price: 3 }),
  S({ key: '2-morning', id: 21, name: 'Stuart Park Outdoor Rink', type: 'outdoor', day: 2, start: 585 }),
  S({ key: '2-midday', id: 22, name: 'Salsa & Sabor', type: 'restaurant', day: 2, start: 690, role: 'lunch' }),
  S({ key: '2-afternoon', id: 23, name: 'Moraine Estate Winery', type: 'winery', day: 2, start: 795 }),
];
const WD = tc.weekdayDays('2026-11-28', 2); // Saturday, Sunday
const R = (m, stops = PLAN, extra = {}) => tc.rulesRead(m, stops, { regions: [], regionLabels: {}, days: 2, weekdays: WD, ...extra });
const brief = (r) => r.ops.map((o) => [o.o, o.kind, (o.stops || []).map((s) => s.id), o.time, o.day, o.value]);

test('weekdays are days of the plan (from its first date), English and French', () => {
  assert.deepEqual([WD.saturday, WD.sunday, WD.samedi, WD.dimanche, WD.friday], [1, 2, 1, 2, undefined]);
  assert.deepEqual(tc.weekdayDays(null, 3), {});
});

test('rules: the listings\' own words (pizza, ramen, bowling, hot chocolate, a wine bar) are kinds of stop', () => {
  assert.deepEqual(brief(R('swap the ramen for pizza')), [['replace', 'pizza', [15], null, null, null]], 'the ramen place, for pizza');
  const noRamen = R('swap the ramen for pizza', PLAN.filter((s) => s.id !== 15));
  assert.equal(noRamen.cant, 'not_found');
  assert.equal(tc.cantReply('not_found', 'en', noRamen.what, PLAN), 'I don’t see ramen in your plan.');
  assert.deepEqual(brief(R('swap day 2 dinner for pizza')), [['add', 'pizza', [], 'evening', 2, null]], 'day 2 has no dinner: one is added there (never day 1\'s swapped)');
  assert.deepEqual(brief(R('swap dinner for pizza')), [['replace', 'pizza', [15], null, null, null]]);
  assert.deepEqual(brief(R('add bowling on day 2 morning')), [['add', 'bowling', [], 'morning', 2, null]]);
  assert.deepEqual(brief(R('swap the brewery for a wine bar')), [['replace', 'wine_bar', [14], null, null, null]], 'a wine bar is not a cocktail bar or a winery');
  assert.deepEqual(brief(R('add hot chocolate on Saturday afternoon')), [['add', 'hot_chocolate', [], 'afternoon', 1, null]]);
  assert.deepEqual(brief(R('add hot chocolate after lunch')), [['add', 'hot_chocolate', [12], null, null, null]]);
  assert.deepEqual(brief(R('quilles ou cinéma après le souper')), [['add', 'bowling', [15], null, null, null], ['add', 'cinema', [15], null, null, null]]);
  assert.deepEqual(brief(R('quelque chose à faire après le souper')), [['add', 'activity', [15], null, null, null]]);
  assert.deepEqual(brief(R('swap Sunday lunch for sushi')), [['replace', 'sushi', [22], null, null, null]]);
  for (const k of Object.keys(tc.WORD_KINDS)) assert.ok(tc.KIND_KEYS.includes(k), `${k} is a kind the AI can answer with too`);
});

test('rules: a stop named by its name stands whatever day is mentioned; one hike, one dinner, one day', () => {
  assert.deepEqual(brief(R('La Frenz is closed on Sunday, pick another winery')), [['replace', null, [13], null, null, null]], 'La Frenz, not the Sunday winery');
  assert.deepEqual(brief(R('an easier hike, we are beginners', [...PLAN.slice(0, 5), S({ key: '2-morning', id: 31, name: 'Sea to Sky Trail', type: 'outdoor', day: 2, start: 585 })])), [['replace', 'hike', [11], null, null, null]], 'the hike only: no pace change, no second swap');
  assert.deepEqual(brief(R('something cheaper for dinner on Saturday')), [['budget', null, [15], null, null, 'budget']], 'that dinner only');
  assert.deepEqual(brief(R('cheaper')), [['budget', null, [12, 15, 22], null, null, 'budget']], 'every meal, one by one (no re-plan)');
  assert.deepEqual(R('dinner on Saturday is too late for the kids, make it 5:30').ops.map((o) => [o.o, o.n, o.stops[0].id]), [['set_time', 1050, 15]], 'one stop\'s own time (travel agent abilities)');
  assert.deepEqual(brief(R('make Sunday lighter, we drive home after lunch')), [['remove', null, [23], null, null, null]], 'Sunday ends with lunch; Saturday is untouched');
  assert.deepEqual(brief(R('more indoor things')), [['replace', 'indoor', [11], null, null, null], ['replace', 'indoor', [21], null, null, null]], 'the outdoor stops, one by one');
  const fill = R('fill the day: a winery, lunch and something relaxing', PLAN.slice(0, 1));
  assert.deepEqual(fill.ops.map((o) => [o.o, o.kind]), [['add', 'restaurant'], ['add', 'spa'], ['add', 'winery']].sort(), 'adds, not a pace change');
});

const dayPlan = (stops) => ({ kind: 'multi_day', days: [1, 2].map((d) => ({ day: d, stops: stops.filter((s) => s.day === d).map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: s.price || 2, badges: [] } })) })), schedule: stops.map((s) => ({ day: s.day, venueId: s.id, startMinutes: s.start })) });
const ctxFor = (run) => ({ args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops: PLAN, days: 2, run, regionLabels: {}, lang: 'en' });

test('one-stop edits ask the planner\'s Swap for the words, near the stops around (wide); the reply is "Done" only for a match', () => {
  const calls = [];
  const pizza = { ...PLAN[4], id: 91, name: 'Antico Pizza Napoletana' };
  let out = tc.planTurn(R('swap the ramen for pizza').ops, ctxFor((a) => { calls.push(a); return dayPlan(PLAN.map((s) => (s.id === 15 ? pizza : s))); }));
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].swap.key, calls[0].swap.wide, calls[0].swap.words, calls[0].swap.types, calls[0].swap.id], ['1-evening', true, ['pizza', 'pizzeria'], ['restaurant', 'pub'], 15]);
  assert.deepEqual(out.changed, ['1-evening']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Swapped Ramen Arashi Kelowna for Antico Pizza Napoletana at 6 PM.');
  assert.equal(out.req.locks['1-evening'], 91, 'it stays through later changes');
  // A stop the chat added earlier is sent as a soft pin, never a hard lock (a hard lock on a stop the request's own
  // words would not pick made every later change fail with "a locked stop cannot be kept").
  const later = [];
  tc.planTurn(R('swap the ramen for pizza').ops, { ...ctxFor((a2) => { later.push(a2); return dayPlan(PLAN.map((s) => (s.id === 15 ? pizza : s))); }), locks: { '1-late': 14 } });
  assert.deepEqual(later[0].swap.locked, []);
  assert.equal(later[0].pinned['1-late'], 14, 'it is still pinned to its slot');
  // The planner found no pizza (swapMissed): the plan is unchanged and the reply says so.
  out = tc.planTurn(R('swap the ramen for pizza').ops, ctxFor(() => ({ ...dayPlan(PLAN), swapMissed: { key: '1-evening' } })));
  assert.equal(out.plan, null);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'I couldn’t find pizza that fits there, so Ramen Arashi Kelowna stays. Your plan is unchanged.');
  // A park is not bowling.
  out = tc.planTurn(R('add bowling on day 2 morning').ops, ctxFor(() => dayPlan([...PLAN, S({ key: '2-late', id: 92, name: 'Mission Creek Regional Park', type: 'outdoor', day: 2, start: 945 })])));
  assert.equal(out.plan, null);
  assert.doesNotMatch(tc.buildReply(out, { lang: 'en' }), /^Done/);
});

test('the planner\'s Swap: words must be in the name, cuisine or first sentence; types bound the kind of place', () => {
  const ok = (v, swap) => planner.swapWantOk(v, swap);
  const pizza = { type: 'restaurant', types: ['restaurant', 'pub'], words: ['pizza', 'pizzeria'] };
  assert.equal(ok({ name: 'Antico Pizza Napoletana', type: 'restaurant' }, pizza), true);
  assert.equal(ok({ name: 'Curious Cafe', type: 'restaurant', cuisine: 'Pizza' }, pizza), true);
  assert.equal(ok({ name: 'JOEY Kelowna', type: 'restaurant', cuisine: 'Canadian', description: 'A lively room. Sometimes there is pizza.' }, pizza), false, 'only the first sentence counts');
  assert.equal(ok({ name: 'Pizza Park', type: 'outdoor' }, pizza), false);
  const bowl = { type: 'indoor', types: ['indoor', 'sport'], words: ['bowl', 'lanes', 'quilles'] };
  assert.equal(ok({ name: 'McCurdy Bowling Centre', type: 'indoor' }, bowl), true);
  assert.equal(ok({ name: 'Landmark Cinemas', type: 'indoor', description: 'Ten screens off Highway 97. Next door to McCurdy Bowling.' }, bowl), false);
  assert.equal(ok({ name: 'Mission Creek Regional Park', type: 'outdoor' }, bowl), false);
  assert.equal(ok({ name: 'Purebread', type: 'cafe' }, { type: 'cafe', types: ['cafe'] }), true, 'hot chocolate: any café');
});

test('"slower pace" takes one extra stop off each busy day (no re-plan); replies are one or two sentences', () => {
  let ran = 0;
  const out = tc.planTurn(R('slower pace').ops, ctxFor(() => { ran += 1; return dayPlan(PLAN); }));
  assert.equal(ran, 0, 'the planner is not run: every other stop and the place to stay are untouched');
  assert.deepEqual(out.actions.remove, ['1-late', '2-afternoon'], 'the last extra stop of each day; never a meal');
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Took out Bad Tattoo Brewing. Took out Moraine Estate Winery.');
  // Three meals that cannot be made cheaper: one plain sentence pair, not one per meal.
  const none = tc.planTurn(R('cheaper').ops, ctxFor(() => ({ ...dayPlan(PLAN), swapMissed: { key: 'x' } })));
  const reply = tc.buildReply(none, { lang: 'en' });
  assert.equal(reply, 'I couldn’t find anything that fits for that. Your plan is unchanged.');
  const fr = tc.buildReply(none, { lang: 'fr' });
  assert.equal(fr, 'Je n’ai rien trouvé qui convienne. Votre plan n’a pas changé.');
});

test('the chat body: stayId (the stay on screen) is accepted; a day plan is never re-planned from unread words', async () => {
  const stops = PLAN.map((s) => ({ key: s.key, id: s.id, start: s.start }));
  const body = { message: 'pizza', lang: 'en', plan: { text: 'a weekend in Kelowna', seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops, stayId: 77 };
  assert.equal(app.parseTripChatBody(body, { stays: true }).value.stayId, 77);
  assert.ok(app.parseTripChatBody({ ...body, stayId: 'x' }, { stays: true }).error);
  // Words the rules cannot place ("romantic") used to go to the planner as typed and re-plan every stop.
  const real = app.runTripPlanRequest(app.parseTripPlanBody({ text: 'a weekend in Kelowna' }, { v4: true }).value, false);
  const realStops = tc.planStops(real).map((s) => ({ key: s.key, id: s.id, start: s.start }));
  const turn = await app.runTripChatTurn(app.parseTripChatBody({ ...body, message: 'make it romantic', stops: realStops, stayId: undefined }, { stays: false }).value, { lang: 'en' });
  assert.equal(turn.response.plan, null);
  assert.equal(turn.response.cant, 'unclear');
});

test('real planner: "swap dinner for pizza" changes that dinner only, to a pizza place', async () => {
  const text = 'a day in Kelowna';
  const plan = app.runTripPlanRequest(app.parseTripPlanBody({ text }, { v4: true }).value, false);
  const stops = tc.planStops(plan);
  const dinner = stops.find((s) => s.role === 'dinner');
  if (!dinner) return;
  const body = { message: 'swap dinner for pizza', lang: 'en', plan: { text, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: stops.map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })) };
  const r = (await app.runTripChatTurn(app.parseTripChatBody(body, { stays: false }).value, { lang: 'en' })).response;
  if (r.plan) {
    assert.deepEqual(r.changed, [dinner.key], r.reply);
    const now = tc.planStops(r.plan).find((s) => s.key === dinner.key);
    const row = require('../db.js').prepare('SELECT name, cuisine, description FROM venues WHERE id = ?').get(now.id);
    assert.match(`${row.name} ${row.cuisine || ''} ${String(row.description || '').split('. ')[0]}`, /pizz/i, `${now.name} is a pizza place`);
    assert.match(r.reply, /^Done\. Swapped /);
  } else assert.match(r.reply, /^I couldn’t find pizza/);
});

test('page: the stay on screen is sent; a queued message\'s answer follows the first; the kids chip only with kids; a confirmed plan stays confirmed; no Undo for the wine tour card', () => {
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /body\.stayId = sd\.chosen\.id/);
  assert.match(html, /chat\.carry = hadQueue \? said : null/);
  assert.match(html, /c\[0\] !== 'kids' \|\| chatHasKids\(\)/);
  assert.match(html, /v4\.confirmed = wasConfirmed; v4\.saved = false/);
  assert.match(html, /chat\.undo = planTouched \? snap : null/);
});

test('"add dinner in Squamish after the brewery" adds a dinner after that stop (no new base town, no re-plan); the stay on screen decides "it stays"', () => {
  const r = R('add dinner in Squamish after the brewery', PLAN.filter((x) => x.id !== 15), { regions: ['squamish'], regionLabels: { squamish: 'Squamish' } });
  assert.deepEqual(brief(r), [['add', 'restaurant', [14], null, null, null]]);
  assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8'), /if \(next\.id === \(v\.stayId \|\| cur\.id\)\) \{/);
});
