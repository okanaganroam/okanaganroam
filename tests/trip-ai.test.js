'use strict';
// Build My Trip step 4 (2026-11-20): trip-ai.js, the AI request reader, with a mocked fetch (never the real API).
// Valid output, invalid JSON, a wrong enum, a timeout, a refusal, the daily spend cap, PII stripping, unsure -> rules,
// and that nothing the model returns can name a place the visitor did not type.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../trip-ai.js');

const TAXONOMY = {
  regions: ['kelowna', 'penticton', 'naramata', 'big-white'],
  regionLabels: { kelowna: 'Kelowna', penticton: 'Penticton', naramata: 'Naramata', 'big-white': 'Big White' },
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub'],
  activities: ['hiking', 'winter'],
  features: ['vegan', 'gluten_free', 'dog_friendly', 'kid_friendly', 'patio'],
  paces: ['relaxed', 'standard', 'packed'],
  budgets: ['budget', 'moderate', 'upscale'],
};
const ALLOWED = ai.buildAllowed(TAXONOMY);
const ENV = { ANTHROPIC_API_KEY: 'test-key-not-real', TRIP_AI_DAILY_USD: '1' };
const BASE = {
  unsure: false, towns: [], valley_wide: false, start_date: null, days: null, nights: null, weekday: null, month: null, season: null,
  party: { adults: null, kids: null, kid_ages: [], dog: false }, occasion: null, rainy_day: false, interests: [], pace: null, budget: null,
  must_have: [], must_avoid: [],
};
const intent = (o = {}) => ({ ...BASE, ...o, party: { ...BASE.party, ...(o.party || {}) } });
const it = (kind, extra = {}) => ({ kind, time_of_day: 'any', start_time: null, place: null, ...extra });

// A fetch that answers like the Messages API; records what it was sent.
function mockFetch(answer, { status = 200, stop = 'end_turn', usage = { input_tokens: 2000, output_tokens: 150 }, raw = null } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => ({ id: 'msg_test', model: ai.MODEL, stop_reason: stop, usage, content: [{ type: 'text', text: raw !== null ? raw : JSON.stringify(answer) }] }),
    };
  };
  fn.calls = calls;
  return fn;
}
const read = (text, fetchImpl, extra = {}) => ai.readTripRequest(text, { allowed: ALLOWED, today: '2026-11-20', env: ENV, fetchImpl, ...extra });

test.beforeEach(() => ai.resetSpend());

test('valid output: the structure comes back checked; the request sent is Haiku with a strict schema and the enums', async () => {
  const answer = intent({ towns: ['kelowna'], interests: [it('coffee', { time_of_day: 'morning', start_time: '10:00' }), it('winery'), it('dinner')] });
  const f = mockFetch(answer);
  const r = await read('morning coffee at 10 then wineries and dinner in Kelowna', f);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.intent.towns, ['kelowna']);
  assert.deepEqual(r.intent.interests.map((x) => x.kind), ['coffee', 'winery', 'dinner']);
  assert.ok(r.costUsd > 0 && r.costUsd < 0.001);
  assert.equal(f.calls.length, 1);
  const b = f.calls[0].body;
  assert.equal(b.model, 'claude-haiku-5-5');
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.deepEqual(b.output_config.format.schema.properties.towns.items.enum, TAXONOMY.regions);
  assert.ok(b.output_config.format.schema.properties.interests.items.properties.kind.enum.includes('winery'));
  assert.ok(!b.output_config.format.schema.properties.interests.items.properties.kind.enum.includes('shop'));
  assert.equal(f.calls[0].init.headers['x-api-key'], 'test-key-not-real');
  assert.match(b.messages[0].content, /Today is Friday 2026-11-20\./);
  // The model is told no venue, price or hour: nothing about our listings is in the prompt.
  assert.doesNotMatch(JSON.stringify(b), /Bright Jenny|Quails|price_level|listedHours/);
});

test('invalid JSON, a wrong enum, an extra field, an out-of-range number -> not ok (rules)', async () => {
  assert.equal((await read('a day in Kelowna', mockFetch(null, { raw: '{"towns": [' }))).reason, 'bad_json');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ towns: ['whistler'] })))).reason, 'invalid:towns');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ interests: [it('casino')] })))).reason, 'invalid:interest_kind');
  assert.equal((await read('a day in Kelowna', mockFetch({ ...intent(), venue_id: 12 }))).reason, 'invalid:extra_venue_id');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ days: 40 })))).reason, 'invalid:days');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ start_date: '2020-01-01' })))).reason, 'invalid:start_date_range');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ interests: [it('coffee', { start_time: '25:00' })] })))).reason, 'invalid:interest_start_time');
  const { towns, ...missing } = intent();
  assert.equal((await read('a day in Kelowna', mockFetch(missing))).reason, 'invalid:missing_towns');
});

test('API error, refusal, cut-off answer, no key -> not ok', async () => {
  assert.equal((await read('a day in Kelowna', mockFetch(intent(), { status: 529 }))).reason, 'api_529');
  assert.equal((await read('a day in Kelowna', mockFetch(intent(), { stop: 'refusal' }))).reason, 'refused');
  assert.equal((await read('a day in Kelowna', mockFetch(intent(), { stop: 'max_tokens' }))).reason, 'too_long');
  assert.equal((await ai.readTripRequest('a day in Kelowna', { allowed: ALLOWED, env: {}, fetchImpl: mockFetch(intent()) })).reason, 'no_api_key');
  const throws = async () => { throw new Error('ECONNRESET'); };
  assert.equal((await read('a day in Kelowna', throws)).reason, 'network');
});

test('timeout: a slow answer is abandoned after timeoutMs (default 2 s), even if fetch ignores the abort', async () => {
  assert.equal(ai.DEFAULT_TIMEOUT_MS, 2000);
  let aborted = false;
  const slow = (url, init) => new Promise((resolve) => { init.signal.addEventListener('abort', () => { aborted = true; }); setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({}) }), 1000); });
  const t0 = Date.now();
  const r = await read('a day in Kelowna', slow, { timeoutMs: 50 });
  assert.equal(r.reason, 'timeout');
  assert.ok(Date.now() - t0 < 500);
  assert.equal(aborted, true);
});

test('unsure -> not ok with the reading attached (the planner uses the rules)', async () => {
  const r = await read('hmm', mockFetch(intent({ unsure: true })));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unsure');
});

test('daily spend cap: counted from usage at Haiku prices; over the cap -> rules without calling the API', async () => {
  // 2000 in + 150 out = $0.000275 at $0.10 / $0.50 per million.
  assert.equal(Number(ai.costOf({ input_tokens: 2000, output_tokens: 150 }).toFixed(6)), 0.000275);
  const f = mockFetch(intent({ towns: ['kelowna'] }), { usage: { input_tokens: 4000000, output_tokens: 1000000 } }); // $0.90
  const env = { ...ENV, TRIP_AI_DAILY_USD: '1' };
  assert.equal((await read('a day in Kelowna', f, { env })).ok, true);
  assert.equal((await read('a day in Kelowna', f, { env })).ok, true); // $1.80 now
  const over = await read('a day in Kelowna', f, { env });
  assert.equal(over.reason, 'over_daily_cap');
  assert.equal(f.calls.length, 2, 'no call once over the cap');
  // A new (Pacific) day starts at $0.
  const tomorrow = await read('a day in Kelowna', f, { env, now: new Date(Date.now() + 86400000) });
  assert.equal(tomorrow.ok, true);
  assert.equal(ai.dailyCapUsd({}), 1);
  assert.equal(ai.dailyCapUsd({ TRIP_AI_DAILY_USD: '0.25' }), 0.25);
  assert.equal(ai.dailyCapUsd({ TRIP_AI_DAILY_USD: 'lots' }), 1);
});

test('privacy: emails, phone numbers and links are stripped before sending; dates and times stay', async () => {
  const f = mockFetch(intent({ towns: ['kelowna'] }));
  await read('golf then lunch in Kelowna on 2026-12-04 at 10:30, call 250-555-0199 or (250) 555 0199, email me@example.com, see https://x.example/p or okanaganroam.com', f);
  const sent = f.calls[0].body.messages[0].content;
  assert.doesNotMatch(sent, /555|0199|example|okanaganroam\.com|me@/);
  assert.match(sent, /\[phone\].*\[phone\].*\[email\].*\[link\].*\[link\]/);
  assert.match(sent, /2026-12-04 at 10:30/);
  assert.equal(ai.stripPII('+1 250.555.0199'), '[phone]');
  // Nothing else about the visitor: one user message, no metadata.
  assert.equal(f.calls[0].body.messages.length, 1);
  assert.equal(f.calls[0].body.metadata, undefined);
});

test('a place name is kept only when the visitor typed it; it is never a suggestion from the model', async () => {
  const typed = await read('dinner at Waterfront Wines then cocktails in Kelowna', mockFetch(intent({ towns: ['kelowna'], interests: [it('dinner', { place: 'Waterfront Wines' }), it('drinks')] })));
  assert.equal(typed.ok, true);
  assert.equal(typed.intent.interests[0].place, 'Waterfront Wines');
  const invented = await read('dinner then cocktails in Kelowna', mockFetch(intent({ towns: ['kelowna'], interests: [it('dinner', { place: 'Bouchons Bistro' }), it('drinks')] })));
  assert.equal(invented.ok, true);
  assert.equal(invented.intent.interests[0].place, null);
  assert.deepEqual(invented.dropped, ['place:Bouchons Bistro']);
});

test('render: the planner\'s own words, overrides only where the visitor set none, stay inputs only with stays on', () => {
  const r1 = ai.renderTripRequest(intent({ towns: ['kelowna'], interests: [it('coffee', { time_of_day: 'morning', start_time: '10:00' }), it('winery'), it('dinner', { start_time: '19:00' })] }), { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} });
  assert.equal(r1.text, 'morning coffee then wineries then dinner in Kelowna, dinner at 7 PM');
  assert.deepEqual(r1.overrides, { startMinutes: 600 });
  // The visitor's own start time wins.
  assert.deepEqual(ai.renderTripRequest(intent({ towns: ['kelowna'], interests: [it('coffee', { start_time: '10:00' })] }), { allowed: ALLOWED, taxonomy: TAXONOMY, args: { overrides: { startMinutes: 540 } } }).overrides, { startMinutes: 540 });
  const three = intent({ towns: ['penticton'], nights: 3, start_date: '2026-12-04', party: { adults: 2, kids: 2, dog: true } });
  const off = ai.renderTripRequest(three, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {}, staysOn: false });
  assert.equal(off.text, '4 days in Penticton, with 2 kids and our dog');
  assert.deepEqual(off.overrides, { startDate: '2026-12-04' });
  assert.equal(off.stay, null);
  const on = ai.renderTripRequest(three, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {}, staysOn: true });
  assert.deepEqual(on.stay, { arrive: '2026-12-04', leave: '2026-12-07', adults: 2, kids: 2, dog: true });
  // Fields the visitor filled are kept.
  const mine = ai.renderTripRequest(three, { allowed: ALLOWED, taxonomy: TAXONOMY, args: { stay: { arrive: '2026-12-10', leave: '2026-12-12', adults: 3 } }, staysOn: true });
  assert.deepEqual(mine.stay, { arrive: '2026-12-10', leave: '2026-12-12', adults: 3, kids: 2, dog: true });
  const r3 = ai.renderTripRequest(intent({ towns: ['penticton'], rainy_day: true, party: { kid_ages: [2, 4] }, pace: 'relaxed', must_have: ['vegan', 'accessible'], must_avoid: ['brewery', 'alcohol'] }), { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} });
  assert.equal(r3.text, 'a day in Penticton, with a 2-year-old and a 4-year-old, on a rainy day, vegan and wheelchair accessible, no breweries and no alcohol');
  assert.deepEqual(r3.overrides, { pace: 'relaxed' });
  const r4 = ai.renderTripRequest(intent({ towns: ['kelowna'], interests: [it('hiking', { time_of_day: 'afternoon' }), it('gallery', { time_of_day: 'morning' }), it('dinner', { time_of_day: 'evening' })] }), { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} });
  assert.equal(r4.text, 'an afternoon hike then a morning art gallery then dinner in Kelowna');
});

test('French requests go to the model as typed (it reads French); the reading is language-free', async () => {
  const f = mockFetch(intent({ towns: ['kelowna'], occasion: 'romantic', days: 2, interests: [it('winery')] }));
  const r = await read('un week-end romantique à Kelowna avec des vignobles', f, { lang: 'fr' });
  assert.equal(r.ok, true);
  assert.match(f.calls[0].body.messages[0].content, /week-end romantique à Kelowna/);
  assert.match(f.calls[0].body.system, /French/);
  assert.equal(ai.renderTripRequest(r.intent, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} }).text, 'a romantic 2 days in Kelowna with wineries');
});

test('the switch: TRIP_AI must be on', () => {
  assert.equal(ai.enabled({}), false);
  assert.equal(ai.enabled({ TRIP_AI: 'off' }), false);
  assert.equal(ai.enabled({ TRIP_AI: 'on' }), true);
});
