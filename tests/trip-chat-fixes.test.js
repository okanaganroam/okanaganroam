'use strict';
// Travel agent chat fix round (2026-11-22, fresh-eyes test of the live site, 4.5/10): one regression test per item.
// Uses the repo database plus fixture stays (removed at the end; `git checkout -q okanagan.db` if interrupted).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.DISCOVERCARS_AID;
const app = require('../server.js');
const db = require('../db.js');
const tc = require('../trip-chat.js');
const page = require('../trip-chat-page.js');
const links = require('../stay-booking-links.js');

const made = [];
let base, srv;
test.before(async () => {
  let n = 0;
  const mk = (o, info) => {
    const v = app.createVenue({ region: 'penticton', type: 'stay', cuisine: 'hotel', address: `${500 + (++n)} Main Street, Penticton, BC`, latitude: 49.49 + n / 1000, longitude: -119.59, website: `https://example.com/fix-stay-${n}`, description: 'A fixture used only by the trip chat fix tests.', ...o });
    made.push(v.id);
    db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ confidence: 'high', ...info }), '2026-11-22T00:00:00Z', 'test');
  };
  mk({ slug: 'chat-fix-pool-resort', name: 'Chat Fix Pool Resort', cuisine: 'resort' }, { max_guests: 6, price_level: 3, pool: true, booking: { expedia: 'https://www.expedia.ca/Penticton-Hotels-Chat-Fix-Pool-Resort.h7654321.Hotel-Information' } });
  mk({ slug: 'chat-fix-plain-hotel', name: 'Chat Fix Plain Hotel' }, { max_guests: 6, price_level: 2 });
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  for (const id of made) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
let ipN = 1;
const chat = async (body) => {
  const r = await fetch(`${base}/api/trip/chat?stays=1&v=4&chat=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-Real-IP': `10.8.0.${ipN++}` }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
};
const TEXT = "3 days in Penticton with kids 6 and 9, we don't drink, need a place with a pool";
const planNow = (text = TEXT, stay = null) => app.runTripPlanRequest(app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true }).value, true);
const bodyFor = (plan, message, text = TEXT) => ({ message, lang: 'en', plan: { text, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: tc.planStops(plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })) });

test('1. a planner conflict (a kept stop that no longer fits) is never "Something went wrong": retried without pins, else no plan', () => {
  const calls = [];
  const conflict = () => Object.assign(new Error('A locked stop cannot be kept: Trout Creek Dike Trail on day 1 no longer fits this plan.'), { code: 'TRIP_CONFLICT' });
  let run = app.tripChatSafeRun((a) => { calls.push(a); if (a.pinned) throw conflict(); return { kind: 'day_plan', ok: true }; });
  assert.deepEqual(run({ text: 'x', pinned: { '1-morning': 5 } }), { kind: 'day_plan', ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].pinned, null);
  run = app.tripChatSafeRun(() => { throw conflict(); });
  assert.equal(run({ text: 'x', pinned: { '1-morning': 5 } }), null, 'a second conflict is "no plan"');
  run = app.tripChatSafeRun(() => { throw new Error('boom'); });
  assert.throws(() => run({ text: 'x' }), /boom/, 'other errors are not hidden');
});

test('1/5. before any dates, "we want to stay in Penticton, at a hotel with a pool" and "cheaper dinner on day 2" answer; a stay change never re-plans the stops', async () => {
  const plan = planNow();
  const stay = await chat(bodyFor(plan, 'we want to stay in Penticton, at a hotel with a pool'));
  assert.equal(stay.status, 200);
  assert.notEqual(stay.j.reply, tc.T.en.error);
  assert.equal(stay.j.plan, null, 'the stops, times and free time on screen are untouched');
  const dinner = await chat(bodyFor(plan, 'cheaper dinner on day 2'));
  assert.equal(dinner.status, 200);
  assert.notEqual(dinner.j.reply, tc.T.en.error);
  const nicer = await chat(bodyFor(plan, 'somewhere nicer to stay'));
  assert.equal(nicer.j.plan, null);
  if (nicer.j.stayBlock) assert.ok('whereToStay' in nicer.j.stayBlock);
});

test('2. "This weekend": Friday or Saturday count from today; on a Sunday (or any other day) it is the coming Saturday', () => {
  const W = (iso, days) => page.chatWeekendDates(new Date(`${iso}T10:00:00`), days);
  assert.deepEqual(W('2026-11-22', 2), ['2026-11-28', '2026-11-29'], 'Sunday Nov 22 -> Sat Nov 28 - Sun Nov 29');
  assert.deepEqual(W('2026-11-20', 2), ['2026-11-20', '2026-11-21'], 'a Friday counts');
  assert.deepEqual(W('2026-11-21', 2), ['2026-11-21', '2026-11-22'], 'a Saturday counts');
  assert.deepEqual(W('2026-11-24', 3), ['2026-11-28', '2026-11-30'], 'a 3-day plan: two nights from Saturday');
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /Planned for \{a\} – \{b\}\./, 'the agent says which dates');
  assert.match(html, /Object\.keys\(state\.locks \|\| \{\}\)\.forEach\(function\(k\)\{ pins\[k\] = state\.locks\[k\]; \}\)/, 'kept stops stay kept');
});

test('3. the chat box is cleared as soon as a message is sent', () => {
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /if \(inEl\) inEl\.value = '';\s*chatSend\(text\.slice\(0, 400\), null\);/);
});

test('4. replies say exactly what changed, once; "each day", "the second day is too busy", "an activity after dinner"', () => {
  const S = (o) => ({ badges: [], price: 2, role: '', ...o });
  const stops = [
    S({ key: '1-morning', ref: 's1', id: 1, name: 'A Park', type: 'outdoor', day: 1, start: 540 }),
    S({ key: '1-midday', ref: 's2', id: 2, name: 'Lunchy', type: 'restaurant', day: 1, start: 720, role: 'lunch' }),
    S({ key: '1-evening', ref: 's3', id: 3, name: 'Antojitos', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
    S({ key: '2-morning', ref: 's4', id: 4, name: 'The Museum', type: 'indoor', day: 2, start: 540 }),
    S({ key: '2-midday', ref: 's5', id: 5, name: 'Lunch Two', type: 'restaurant', day: 2, start: 720, role: 'lunch' }),
    S({ key: '2-afternoon', ref: 's6', id: 6, name: 'Beach X', type: 'beach', day: 2, start: 840 }),
    S({ key: '2-evening', ref: 's7', id: 7, name: 'Dinner Two', type: 'restaurant', day: 2, start: 1080, role: 'dinner' }),
  ];
  const R = (m) => tc.rulesRead(m, stops, { regions: [], regionLabels: {}, days: 2 }).ops;
  assert.deepEqual(R('add a winery on each day').map((o) => [o.o, o.kind, o.day]), [['add', 'winery', 1], ['add', 'winery', 2]]);
  assert.deepEqual(R('the second day is too busy').map((o) => [o.o, o.value, o.day]), [['pace', 'relaxed', 2]]);
  const act = R('ajoute une activité après le souper');
  assert.deepEqual(act.map((o) => [o.o, o.kind, o.stops.map((s) => s.id)]), [['add', 'activity', [3]]], 'an activity after dinner, never a dinner swap');
  // The AI swapping the dinner instead: the rules' add wins.
  const m = tc.reconcileReads({ ok: true, cant: null, ops: [{ o: 'replace', stops: [stops[2]], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null }] }, { ops: act, cant: null }, 'ajoute une activité après le souper');
  assert.deepEqual(m.fixes, ['swap_to_add']);
  assert.equal(m.ops[0].o, 'add');
  // "the second day is too busy": a stop off day 2 only; no planner call; nothing else changes.
  const run = () => { throw new Error('should not plan'); };
  const out = tc.planTurn(R('the second day is too busy'), { args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops, days: 2, run, regionLabels: {}, lang: 'en' });
  assert.deepEqual(out.actions.remove, ['2-afternoon']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Took out Beach X.');
  // The same failure for three days is said once.
  const fails = { plan: null, failed: true, actions: { remove: [], keep: [] }, results: [1, 2, 3].map(() => ({ op: 'add', ok: false, local: true, kind: 'winery', why: 'no_fit' })) };
  assert.equal(tc.buildReply(fails, { lang: 'en' }), 'I couldn’t find a winery open nearby at that time. Your plan is unchanged.');
});

test('5. Undo only when something changed; the buttons replace the chat\'s last reply', () => {
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /if \(j\.plan && j\.req && changed\.length\) \{/, 'a plan with no changed stop is not applied, so no Undo');
  assert.match(html, /if \(!chat\.rendering && !chat\.busy\) \{\s*chat\.undo = null;/);
});

test('6. the first request\'s own words: "a place with a pool" is the stay preference (and understood); kids\' ages reach the booking link; no car -> no "Rent a car" in the Book sheet', () => {
  const plan = planNow();
  assert.equal(plan.whereToStay.pick.name, 'Chat Fix Pool Resort', 'the pool stay');
  assert.deepEqual(plan.whereToStay.pref, { amenities: ['pool'] });
  assert.ok(plan.understood.interests.includes('a place to stay with a pool'));
  assert.equal(plan.whereToStay.trip.kids, 2);
  assert.deepEqual(plan.whereToStay.trip.kidAges, [6, 9]);
  const expedia = (plan.whereToStay.pick.bookingLinks || plan.whereToStay.pick.links || []).map((l) => l.url).concat((plan.whereToStay.pick.bookingSteps || []).map((s) => s.url)).find((u) => /expedia/.test(u || ''));
  assert.ok(expedia, 'the Expedia link');
  assert.match(decodeURIComponent(expedia), /rm1=a2:c6:c9/, 'a family of four, with the ages typed');
  const p = links.stayBookingLinks({ id: 1, name: 'X', info: { booking: { booking_com: 'https://www.booking.com/hotel/ca/x.html' } } }, { arrive: '2027-07-09', leave: '2027-07-11', kids: 2, kidAges: [6, 9] }, { env: {} });
  assert.match(p[0].url, /group_children=2/);
  assert.match(p[0].url, /age=6&age=9/);
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /chat\.transport === 'no_car' \|\| chat\.transport === 'driving' \|\| \(state\.last && state\.last\.gettingHere && state\.last\.gettingHere\.driving\) \? l\.filter\(function\(x\)\{ return !\(x && x\.link === 'discovercars'\); \}\)/);
  // "no driving after wineries": the Getting here card puts a wine tour (when there is one) before the car.
  process.env.DISCOVERCARS_AID = 'okanaganroam';
  try {
    const wine = planNow('2 days in Penticton with wineries, no driving after wineries');
    assert.equal(wine.gettingHere.noDrive, true);
  } finally { delete process.env.DISCOVERCARS_AID; }
});

test('8. after Confirm: the agent says the trip is ready; one line of reply; the toast above the bar', () => {
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /Your trip is ready\. Book it, share it, or tell me what to change\./);
  assert.match(html, /\.v4-bar\.has-chat\.is-confirmed \.v4-chat-agent \{ white-space: nowrap;/);
  assert.match(html, /\.t3-v4\.v4-chat-mode \.v4-toast \{ bottom: calc\(var\(--v4-bar-h, 160px\) \+ 12px\); \}/);
});

test('9. Enter sends the first request; "Sorry, I didn\'t catch that" suggests a stop of this plan; only the page\'s language is read out', async () => {
  const html = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(html, /if \(e\.key === 'Enter' && !e\.shiftKey && !e\.isComposing/);
  assert.match(html, /el\.setAttribute\('aria-hidden', 'true'\)/);
  const plan = planNow('a day in Kelowna with wineries and a brewery');
  const r = await chat({ ...bodyFor(plan, 'xyzzy plugh', 'a day in Kelowna with wineries and a brewery'), lang: 'fr' });
  const first = tc.planStops(plan).find((s) => !['lunch', 'dinner'].includes(s.role));
  assert.ok(first);
  assert.match(r.j.reply, /^Désolé, je n’ai pas compris\. Essayez « enlève /);
  assert.doesNotMatch(r.j.reply, /microbrasserie/);
});
