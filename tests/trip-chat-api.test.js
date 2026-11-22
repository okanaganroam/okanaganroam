'use strict';
// POST /api/trip/chat (2026-11-22, trip-chat.js) end to end with the real planner and a mocked model (setTripChatReader;
// the network guard refuses any real call). Off unless TRIP_CHAT=on or ?chat=1; without a key the word rules answer;
// a model answer naming a stop that is not on the plan is never used; every stop in a new plan is a real listing the
// planner picked; the /trip page carries the chat bar only with the flag or the preview.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.TRIP_CHAT;
delete process.env.TRIP_V4;
delete process.env.ANTHROPIC_API_KEY;
const app = require('../server.js');
const tc = require('../trip-chat.js');

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  app.setTripChatReader(null);
  delete process.env.TRIP_CHAT;
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const post = async (body, qs = '?v=4&chat=1', ip = '10.0.0.1') => {
  const r = await fetch(`${base}/api/trip/chat${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-Real-IP': ip }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, j };
};
const TEXT = 'a day in Kelowna with wineries and a brewery';
function planNow(text = TEXT) { return app.runTripPlanRequest(app.parseTripPlanBody({ text }, { v4: true }).value, false); }
function bodyFor(plan, message, extra = {}) {
  return { message, lang: 'en', plan: { text: TEXT, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: tc.planStops(plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) })), ...extra };
}
let ipN = 10;
const freshIp = () => `10.0.1.${ipN++}`;

test('off by default: no route without TRIP_CHAT or ?chat=1, and /trip has no chat bar', async () => {
  const plan = planNow();
  const r = await post(bodyFor(plan, 'remove the winery'), '?v=4', freshIp());
  assert.notEqual(r.status, 200);
  const page = await (await fetch(`${base}/trip?v=4`, { headers: { 'User-Agent': UA } })).text();
  assert.doesNotMatch(page, /id="v4Chat"|v4ChatHtml|\/api\/trip\/chat/);
  const preview = await (await fetch(`${base}/trip?chat=1`, { headers: { 'User-Agent': UA } })).text();
  assert.match(preview, /function v4ChatHtml/);
  assert.match(preview, /\/api\/trip\/chat\?stays=1&v=4&chat=1/);
  assert.match(preview, /<meta name="robots" content="noindex/);
  process.env.TRIP_CHAT = 'on'; process.env.TRIP_V4 = 'on';
  try {
    const on = await (await fetch(`${base}/trip`, { headers: { 'User-Agent': UA } })).text();
    assert.match(on, /function v4ChatHtml/);
    const v3 = await (await fetch(`${base}/trip?v=3`, { headers: { 'User-Agent': UA } })).text();
    assert.doesNotMatch(v3, /function v4ChatHtml/, 'the old page never has it');
  } finally { delete process.env.TRIP_CHAT; delete process.env.TRIP_V4; }
});

test('no key: the word rules read it, the planner re-plans, the reply is a template', async () => {
  app.setTripChatReader(null);
  const plan = planNow();
  const winery = tc.planStops(plan).find((s) => s.type === 'winery');
  const r = await post(bodyFor(plan, 'remove the winery'), '?v=4&chat=1', freshIp());
  assert.equal(r.status, 200);
  assert.equal(r.j.source, 'rules');
  assert.ok(r.j.actions.remove.includes(winery.key));
  assert.equal(r.j.plan, null, 'a removal needs no new plan');
  assert.match(r.j.reply, /^Done\. Took out /);
  const slow = await post(bodyFor(plan, null, { message: undefined, chip: 'slower' }), '?v=4&chat=1', freshIp());
  assert.equal(slow.status, 200);
  assert.equal(slow.j.source, 'chip');
  assert.equal(slow.j.req.overrides.pace, 'relaxed');
  assert.ok(slow.j.plan && slow.j.plan.days.length === 1);
  const book = await post(bodyFor(plan, 'can you book us a table at 7?'), '?v=4&chat=1', freshIp());
  assert.equal(book.j.cant, 'booking');
  assert.equal(book.j.plan, null);
  const junk = await post(bodyFor(plan, 'asdf qwerty zzz'), '?v=4&chat=1', freshIp());
  assert.match(junk.j.reply, /^Sorry, I didn’t catch that. Try “remove .+”, “cheaper dinner” or “more for kids”.$/, 'examples from the plan on screen');
});

test('mocked model: its operations drive the planner; every new stop is a real listing the planner picked', async () => {
  const plan = planNow();
  const seen = [];
  app.setTripChatReader(async (message, opts) => {
    seen.push({ message, refs: opts.stops.map((s) => `${s.ref}:${s.name}`) });
    const brewery = opts.stops.find((s) => s.type === 'winery');
    return { ok: true, cant: null, ops: [{ o: 'replace', stops: [brewery], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null }] };
  });
  try {
    const r = await post(bodyFor(plan, 'a different winery please'), '?v=4&chat=1', freshIp());
    assert.equal(r.status, 200);
    assert.equal(r.j.source, 'ai');
    // The model saw only the plan's stops, named from our database.
    assert.ok(seen[0].refs.every((x) => /^s\d+:/.test(x)));
    assert.ok(r.j.plan, r.j.reply);
    const ids = tc.planStops(r.j.plan).map((s) => s.id);
    assert.equal(app.tripChatStops(tc.planStops(r.j.plan).map((x) => ({ key: x.key, id: x.id }))).length, ids.length, 'every stop is a listing in our database');
    assert.match(r.j.reply, /^Done\. Swapped .+ for .+/);
    // The client's next request reproduces the plan from the returned fields.
    assert.ok(Array.isArray(r.j.req.excludeVenueIds) && r.j.req.excludeVenueIds.length >= 1);
  } finally { app.setTripChatReader(null); }
});

test('a model that fails, times out or names a stop not on the plan: the rules answer instead', async () => {
  const plan = planNow();
  for (const answer of [{ ok: false, reason: 'timeout' }, { ok: false, reason: 'invalid:all_dropped:unknown_stop' }]) {
    app.setTripChatReader(async () => answer);
    const r = await post(bodyFor(plan, 'slower pace'), '?v=4&chat=1', freshIp());
    assert.equal(r.status, 200);
    assert.equal(r.j.source, 'rules');
    assert.equal(r.j.fallback, answer.reason);
    assert.equal(r.j.req.overrides.pace, 'relaxed');
  }
  app.setTripChatReader(async () => { throw new Error('boom'); });
  const r = await post(bodyFor(plan, 'slower pace'), '?v=4&chat=1', freshIp());
  assert.equal(r.j.source, 'rules');
  app.setTripChatReader(null);
});

test('bad input is refused: unknown fields, long messages, stops that are not slots, unknown chips', async () => {
  const plan = planNow();
  const ip = freshIp();
  assert.equal((await post({ ...bodyFor(plan, 'x'), admin: true }, '?v=4&chat=1', ip)).status, 400);
  assert.equal((await post(bodyFor(plan, 'x'.repeat(401)), '?v=4&chat=1', ip)).status, 400);
  assert.equal((await post(bodyFor(plan, 'x', { stops: [{ key: 'drop table', id: 1 }] }), '?v=4&chat=1', ip)).status, 400);
  assert.equal((await post(bodyFor(plan, undefined, { chip: 'free_wine' }), '?v=4&chat=1', ip)).status, 400);
  assert.equal((await post(bodyFor(plan, 'x', { plan: { text: '' } }), '?v=4&chat=1', ip)).status, 400);
  // A stop id that is not a listing is dropped, never shown to the model.
  let refs = null;
  app.setTripChatReader(async (m, opts) => { refs = opts.stops.map((s) => s.id); return { ok: true, cant: 'other', ops: [] }; });
  const r = await post(bodyFor(plan, 'hello', { stops: [{ key: '1-morning', id: 999999999 }] }), '?v=4&chat=1', freshIp());
  assert.equal(r.status, 200);
  assert.deepEqual(refs, []);
  assert.equal(r.j.reply, tc.T.en.other);
  app.setTripChatReader(null);
});

test('rate limit: the 21st message in 10 minutes from one address gets a polite 429', async () => {
  tc.resetRate();
  const plan = planNow();
  const body = bodyFor(plan, 'can you book it?');
  for (let i = 0; i < 20; i++) assert.equal((await post(body, '?v=4&chat=1', '10.9.9.9')).status, 200);
  const r = await post(body, '?v=4&chat=1', '10.9.9.9');
  assert.equal(r.status, 429);
  assert.equal(r.j.reply, tc.T.en.busy);
  tc.resetRate();
});

test('French: replies in French', async () => {
  const plan = planNow();
  const r = await post({ ...bodyFor(plan, 'plus relax'), lang: 'fr' }, '?v=4&chat=1', freshIp());
  assert.equal(r.status, 200);
  assert.match(r.j.reply, /Rythme plus relax\./);
  const c = await post({ ...bodyFor(plan, 'réserver une table'), lang: 'fr' }, '?v=4&chat=1', freshIp());
  assert.equal(c.j.reply, tc.T.fr.booking);
});

// Live eval round 2 (2026-11-22): one-stop edits with the real planner. The repo database has food and drink only, so a
// kids' activity is added for this test (removed after; `git checkout -q okanagan.db` if a run is interrupted).
test('real planner: "swap the day 1 brewery for something for the kids" and "ice cream after lunch on day 1" change one stop, in place', async () => {
  const db = require('../db.js');
  const id = Number(db.prepare('INSERT INTO venues (name, region, type, slug, description, kid_friendly, price) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('Test Family Farm', 'penticton', 'outdoor', 'test-family-farm-chat', 'Petting farm with animals and a playground for kids.', 1, 1).lastInsertRowid);
  try {
    app.setTripChatReader(null);
    const text = '2 days in Penticton with a brewery and a beach';
    const plan = planNow(text);
    const before = tc.planStops(plan);
    const brewery = before.find((s) => s.day === 1 && s.type === 'brewery');
    assert.ok(brewery, 'the plan has a day 1 brewery');
    const body = (m) => ({ ...bodyFor(plan, m), plan: { text, seed: 0, excludeVenueIds: [] } });
    const kids = await post(body('swap the day 1 brewery for something for the kids'), '?v=4&chat=1', freshIp());
    assert.equal(kids.status, 200);
    assert.deepEqual(kids.j.changed, [brewery.key], kids.j.reply);
    const k = tc.planStops(kids.j.plan).find((s) => s.key === brewery.key);
    assert.equal(k.id, id);
    assert.ok(k.start >= brewery.start, 'the slot keeps its time');
    assert.match(kids.j.reply, /^Done\. Swapped .+ for Test Family Farm at /);
    const lunch = before.find((s) => s.day === 1 && s.role === 'lunch');
    const ice = await post(body('ice cream after lunch on day 1'), '?v=4&chat=1', freshIp());
    assert.equal(ice.status, 200);
    const after = tc.planStops(ice.j.plan);
    const cone = after.find((s) => s.key === '1-afternoon');
    assert.match(cone.name, /shake shop|ice ?cream|gelat/i);
    assert.ok(cone.start > lunch.start && cone.start <= lunch.start + 180, `right after lunch (${cone.start})`);
    assert.equal(after.find((s) => s.id === brewery.id).key, '1-late', 'the brewery moves one slot later');
    assert.deepEqual(ice.j.changed.sort(), ['1-afternoon', '1-late']);
    assert.match(ice.j.reply, /^Done\. Added .+ at \d.+\. .+ moves to /);
    for (const s of before.filter((x) => x.key !== '1-afternoon')) assert.ok(after.some((n) => n.id === s.id), `${s.name} stays`);
  } finally { db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
});

// Live eval (2026-11-22, real key): the AI's five misreads, mocked exactly, and what the word rules make of them.
const AI_OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
test('AI + word rules: the five live-eval misreads are corrected; a slow AI loses to confident rules; the AI stands where the rules are unsure', async () => {
  const plan = planNow();
  const ask = async (message, answer, delayMs = 0) => {
    app.setTripChatReader(async (m, opts) => { if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); return typeof answer === 'function' ? answer(opts) : answer; });
    try { return await post(bodyFor(plan, message), '?v=4&chat=1', freshIp()); } finally { app.setTripChatReader(null); }
  };
  // 1. "swap X for something outdoors" read with no kind: the rules' kind is filled in.
  let r = await ask('swap the first winery for something outdoors', (opts) => ({ ok: true, cant: null, ops: [AI_OP({ o: 'replace', stops: [opts.stops.find((s) => s.type === 'winery')] })] }));
  assert.equal(r.j.source, 'ai_fixed');
  assert.deepEqual(r.j.fixes, ['fill_kind']);
  assert.match(r.j.reply, /something outdoors/, 'the reply is about the kind asked for');
  // 2. "we're taking the bus" read as "can't": it is getting here (no car), never "I can't book flights or rides".
  r = await ask("we're taking the bus from Kelowna airport", { ok: true, cant: 'transport', ops: [] });
  assert.equal(r.j.source, 'rules_over_ai');
  assert.equal(r.j.actions.transport, 'no_car');
  assert.notEqual(r.j.reply, tc.T.en.transport);
  // 3. "we want to stay in Penticton" read as a new base town (a re-plan): it is the place to stay.
  r = await ask('we want to stay in Penticton', { ok: true, cant: null, ops: [AI_OP({ o: 'town', region: 'penticton' })] });
  assert.equal(r.j.source, 'ai_fixed');
  assert.deepEqual(r.j.fixes, ['town_to_stay']);
  assert.equal(r.j.plan, null, 'the stops are not re-planned');
  assert.equal(r.j.reply, tc.T.en.stayOff, 'this preview request has no stays box, so it says so');
  // 4. "add ice cream for the kids" read as add + party kids (which re-plans every stop): the add only.
  r = await ask('add ice cream for the kids', { ok: true, cant: null, ops: [AI_OP({ o: 'add', kind: 'ice_cream' }), AI_OP({ o: 'party', value: 'kids' })] });
  assert.equal(r.j.source, 'ai_fixed');
  assert.deepEqual(r.j.fixes, ['drop_party_kids']);
  assert.doesNotMatch(r.j.reply, /Planned for kids/);
  // 5. A slow AI (the live 3 s timeouts): with a confident rules reading, the rules answer after the grace (1.5 s).
  const t0 = Date.now();
  r = await ask('slower pace', { ok: true, cant: null, ops: [AI_OP({ o: 'pace', value: 'relaxed' })] }, 2500);
  const ms = Date.now() - t0;
  assert.equal(r.j.source, 'ai_slow');
  assert.equal(r.j.req.overrides.pace, 'relaxed');
  assert.ok(ms < 2400, `answered before the AI (${ms} ms)`);
  // Where the rules read nothing specific, the AI's reading stands (that is where it adds value).
  r = await ask('make it feel more like a holiday', (opts) => ({ ok: true, cant: null, ops: [AI_OP({ o: 'pace', value: 'relaxed' })] }));
  assert.equal(r.j.source, 'ai');
  assert.equal(r.j.req.overrides.pace, 'relaxed');
});
