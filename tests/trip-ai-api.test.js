'use strict';
// Build My Trip step 4 (2026-11-20) through POST /api/trip/plan: the AI reader is used only with TRIP_AI on, ?ai=1 AND
// the admin token. Every other combination returns the plan byte for byte as before. With all three, the (mocked) model's
// reading feeds the same planner, the response carries a small "ai" debug block, and nothing the model says can add a
// place the planner did not pick from our own listings. The real API is never called (setTripAiReader + network guard).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const TOKEN = 'trip-ai-test-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.TRIP_AI;
delete process.env.TRIP_STAYS;
const app = require('../server.js');
const tripAi = require('../trip-ai.js');

const BASE = {
  unsure: false, towns: [], valley_wide: false, start_date: null, days: null, nights: null, weekday: null, month: null, season: null,
  party: { adults: null, kids: null, kid_ages: [], dog: false }, occasion: null, rainy_day: false, interests: [], pace: null, budget: null,
  must_have: [], must_avoid: [],
};
const intent = (o = {}) => ({ ...BASE, ...o, party: { ...BASE.party, ...(o.party || {}) } });
const it = (kind, extra = {}) => ({ kind, time_of_day: 'any', start_time: null, place: null, ...extra });

let base, srv, reads = [];
let answer = null;
test.before(async () => {
  app.setTripAiReader(async (text, opts) => {
    reads.push({ text, opts });
    if (typeof answer === 'function') return answer(text, opts);
    return answer;
  });
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  app.setTripAiReader(null);
  delete process.env.TRIP_AI;
  delete process.env.TRIP_STAYS;
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const post = async (body, qs = '', token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${base}/api/trip/plan${qs}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const TEXT = 'morning coffee at 10 then wineries and dinner in Kelowna';
const stopVenueIds = (p) => [
  ...(p.days || []).flatMap((d) => d.stops || []),
  ...((p.itinerary && p.itinerary.stops) || []),
  ...((p.outing && p.outing.stops) || []),
  ...(p.recommendations || []),
].map((s) => s && s.venue && s.venue.id).filter(Boolean);

test('off unless TRIP_AI + ?ai=1 + admin token: every other combination is byte-identical and never reads', async () => {
  reads = [];
  answer = { ok: true, ms: 5, intent: intent({ towns: ['penticton'], interests: [it('brewery')] }) };
  const plain = await post({ text: TEXT });
  assert.equal(plain.status, 200);
  assert.doesNotMatch(plain.text, /"ai":/);
  // TRIP_AI off: ?ai=1 with the right token changes nothing.
  assert.equal((await post({ text: TEXT }, '?ai=1', TOKEN)).text, plain.text);
  process.env.TRIP_AI = 'on';
  try {
    assert.equal((await post({ text: TEXT })).text, plain.text, 'flag on, public request');
    assert.equal((await post({ text: TEXT }, '?ai=1')).text, plain.text, 'flag on, ?ai=1 without a token (no 401 either)');
    assert.equal((await post({ text: TEXT }, '?ai=1', 'wrong-token')).text, plain.text, 'wrong token');
    assert.equal((await post({ text: TEXT }, '', TOKEN)).text, plain.text, 'admin token without ?ai=1');
    assert.equal((await post({ text: TEXT }, '?ai=0', TOKEN)).text, plain.text, '?ai=0');
  } finally { delete process.env.TRIP_AI; }
  assert.equal(reads.length, 0, 'the reader is never called');
  // The same plan the planner gives directly.
  const direct = app.runTripPlan(app.parseTripPlanBody({ text: TEXT }).value);
  assert.equal(JSON.parse(plain.text).kind, direct.kind);
});

test('on + ?ai=1 + admin token: the mocked reading feeds the same planner; ai block for debugging', async () => {
  process.env.TRIP_AI = 'on';
  try {
    reads = [];
    answer = { ok: true, ms: 7, costUsd: 0.0003, intent: intent({ towns: ['kelowna'], interests: [it('coffee', { time_of_day: 'morning', start_time: '10:00' }), it('winery'), it('dinner')] }) };
    const r = await post({ text: TEXT }, '?ai=1', TOKEN);
    assert.equal(r.status, 200);
    const p = JSON.parse(r.text);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].text, TEXT);
    assert.ok(reads[0].opts.allowed.regions.includes('kelowna'));
    assert.equal(p.ai.used, true);
    assert.equal(p.ai.reason, 'ok');
    assert.equal(p.ai.text, 'morning coffee then wineries then dinner in Kelowna');
    assert.deepEqual(p.ai.overrides, { startMinutes: 600 });
    assert.equal(p.ai.model, 'claude-haiku-5-5');
    // The plan is exactly what the planner gives for that request and those overrides.
    const direct = app.runTripPlan(app.parseTripPlanBody({ text: p.ai.text, overrides: { startMinutes: 600 } }).value);
    assert.deepEqual(stopVenueIds(p), stopVenueIds(direct));
    assert.deepEqual(p.schedule, direct.schedule);
    // (Which places come back depends on the shared test database other files change; the start time is the planner's own
    // startMinutes chip, so the first stop starts at 10:00 whenever the planner times the plan.)
    if (p.schedule && p.schedule.length && p.itinerary.stops[0].venue && p.itinerary.stops[0].venue.type === 'cafe') assert.equal(p.schedule[0].startMinutes, 600, 'coffee at 10');
  } finally { delete process.env.TRIP_AI; }
});

test('a failed, unsure or invalid reading plans from the visitor\'s own text, as today, with the reason', async () => {
  process.env.TRIP_AI = 'on';
  try {
    const plain = JSON.parse((await post({ text: TEXT })).text);
    for (const [a, reason] of [
      [{ ok: false, reason: 'timeout', ms: 2001 }, 'timeout'],
      [{ ok: false, reason: 'unsure', intent: intent({ unsure: true }) }, 'unsure'],
      [{ ok: true, intent: intent({ towns: ['vancouver'] }) }, 'invalid:towns'],
      [{ ok: true, intent: { ...intent(), venue_ids: [1, 2] } }, 'invalid:extra_venue_ids'],
      [() => { throw new Error('boom'); }, 'error'],
      [{ ok: false, reason: 'over_daily_cap' }, 'over_daily_cap'],
    ]) {
      answer = a;
      const p = JSON.parse((await post({ text: TEXT }, '?ai=1', TOKEN)).text);
      assert.equal(p.ai.used, false);
      assert.equal(p.ai.reason, reason);
      const { ai, ...rest } = p;
      assert.deepEqual(rest, plain, `same plan as the rules (${reason})`);
    }
  } finally { delete process.env.TRIP_AI; }
});

test('AI output can never add a venue: every stop is one of our listings the planner picked; an invented name is dropped', async () => {
  process.env.TRIP_AI = 'on';
  try {
    const facts = new Set(app.buildTripPlannerFacts(false).map((f) => f.id));
    // A place name the visitor did not type is dropped before planning.
    answer = { ok: true, intent: intent({ towns: ['kelowna'], interests: [it('dinner', { place: 'The Totally Made Up Bistro' }), it('drinks')] }) };
    const p = JSON.parse((await post({ text: 'dinner then drinks in Kelowna' }, '?ai=1', TOKEN)).text);
    assert.equal(p.ai.used, true);
    assert.doesNotMatch(p.ai.text, /Made Up/);
    assert.deepEqual(p.ai.dropped, ['place:The Totally Made Up Bistro']);
    const { ai: dbg, ...planOnly } = p;
    assert.doesNotMatch(JSON.stringify(planOnly), /Totally Made Up/, 'only the debug block says what was dropped');
    for (const id of stopVenueIds(p)) assert.ok(facts.has(id), `venue ${id} is one of our listings`);
    // A typed name that is not one of our listings: the name matcher finds nothing, so it is not a stop.
    answer = { ok: true, intent: intent({ towns: ['kelowna'], interests: [it('dinner', { place: 'Nowhere Grill Imaginary' })] }) };
    const q = JSON.parse((await post({ text: 'dinner at Nowhere Grill Imaginary in Kelowna' }, '?ai=1', TOKEN)).text);
    assert.equal(q.ai.used, true);
    for (const id of stopVenueIds(q)) assert.ok(facts.has(id), `venue ${id} is one of our listings`);
    assert.ok(!stopVenueIds(q).some((id) => !facts.has(id)));
    // A typed name that is ours resolves through the planner's own matcher.
    answer = { ok: true, intent: intent({ towns: ['kelowna'], interests: [it('dinner', { place: 'Waterfront Wines' }), it('drinks')] }) };
    const w = JSON.parse((await post({ text: 'dinner at Waterfront Wines then drinks in Kelowna' }, '?ai=1', TOKEN)).text);
    assert.match(w.ai.text, /dinner at Waterfront Wines then drinks in Kelowna/);
    for (const id of stopVenueIds(w)) assert.ok(facts.has(id));
  } finally { delete process.env.TRIP_AI; }
});

test('stays: AI dates, party and dog fill the "Where to stay" inputs only with stays on, and only the empty ones', async () => {
  process.env.TRIP_AI = 'on';
  const reading = { ok: true, intent: intent({ towns: ['penticton'], nights: 3, start_date: '2027-07-09', party: { adults: 2, kids: 2, dog: true } }) };
  try {
    answer = reading;
    const off = JSON.parse((await post({ text: '3 nights in Penticton with 2 kids and our dog' }, '?ai=1', TOKEN)).text);
    assert.equal(off.ai.used, true);
    assert.equal(off.ai.stay, undefined);
    assert.equal(off.whereToStay, undefined);
    const on = JSON.parse((await post({ text: '3 nights in Penticton with 2 kids and our dog' }, '?ai=1&stays=1', TOKEN)).text);
    assert.deepEqual(on.ai.stay, { arrive: '2027-07-09', leave: '2027-07-12', adults: 2, kids: 2, dog: true });
    assert.equal(on.kind, 'multi_day');
    assert.equal(on.days.length, 4);
    const mine = JSON.parse((await post({ text: '3 nights in Penticton with 2 kids and our dog', stay: { adults: 4 } }, '?ai=1&stays=1', TOKEN)).text);
    assert.equal(mine.ai.stay.adults, 4, 'the visitor\'s own number is kept');
  } finally { delete process.env.TRIP_AI; }
});

test('tripAiRequested: needs all three, constant-time token check', () => {
  const req = (auth) => ({ headers: auth ? { authorization: auth } : {} });
  process.env.TRIP_AI = 'on';
  try {
    assert.equal(app.tripAiRequested(req(`Bearer ${TOKEN}`), { ai: '1' }), true);
    assert.equal(app.tripAiRequested(req(`Bearer ${TOKEN}`), { ai: 'true' }), false);
    assert.equal(app.tripAiRequested(req(`Bearer ${TOKEN}x`), { ai: '1' }), false);
    assert.equal(app.tripAiRequested(req(TOKEN), { ai: '1' }), false);
    assert.equal(app.tripAiRequested(req(null), { ai: '1' }), false);
  } finally { delete process.env.TRIP_AI; }
  assert.equal(app.tripAiRequested(req(`Bearer ${TOKEN}`), { ai: '1' }), false);
  assert.equal(tripAi.enabled(), false);
});
