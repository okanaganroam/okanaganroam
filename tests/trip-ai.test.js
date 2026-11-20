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

// A fetch that answers like the Messages API, in the model's short-key wire format (a long-form intent is converted with
// toWire; `wire` sends an exact wire object, `raw` an exact string); records what it was sent.
function mockFetch(answer, { status = 200, stop = 'end_turn', usage = { input_tokens: 2000, output_tokens: 150 }, raw = null, wire = null } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => ({ id: 'msg_test', model: ai.MODEL, stop_reason: stop, usage, content: [{ type: 'text', text: raw !== null ? raw : JSON.stringify(wire || (answer ? ai.toWire(answer) : answer)) }] }),
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
  const sch = b.output_config.format.schema;
  assert.deepEqual(sch.properties.t.items.enum, TAXONOMY.regions);
  assert.ok(sch.properties.i.items.properties.k.enum.includes('winery'));
  assert.ok(!sch.properties.i.items.properties.k.enum.includes('shop'));
  assert.deepEqual(sch.required, ai.WIRE_KEYS, 'every key is required (round 3)');
  // Speed (round 2): short answer cap, thinking off, the stable system prompt sent as one cached block.
  assert.equal(b.max_tokens, 400);
  assert.deepEqual(b.thinking, { type: 'disabled' });
  assert.equal(b.output_config.effort, 'low');
  assert.equal(b.system.length, 1);
  assert.deepEqual(b.system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  assert.doesNotMatch(b.system[0].text, /2026-11-20|Today is|wineries and dinner in Kelowna/, 'nothing per-request in the cached prefix');
  assert.equal(f.calls[0].init.headers['x-api-key'], 'test-key-not-real');
  assert.match(b.messages[0].content, /Today is Friday 2026-11-20\./);
  // The model is told no venue, price or hour: nothing about our listings is in the prompt.
  assert.doesNotMatch(JSON.stringify(b), /Bright Jenny|Quails|price_level|listedHours/);
});

test('invalid JSON, a wrong enum, an extra field, an out-of-range number -> not ok (rules)', async () => {
  assert.equal((await read('a day in Kelowna', mockFetch(null, { raw: '{"towns": [' }))).reason, 'bad_json');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ towns: ['whistler'] })))).reason, 'invalid:towns');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ interests: [it('casino')] })))).reason, 'invalid:interest_kind');
  assert.equal((await read('a day in Kelowna', mockFetch(null, { wire: { ...ai.toWire(intent()), venue_id: 12 } }))).reason, 'invalid:extra_venue_id');
  assert.equal((await read('a day in Kelowna', mockFetch(null, { wire: { ...ai.toWire(intent()), w: 'someday' } }))).reason, 'invalid:when');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ days: 40 })))).reason, 'invalid:days');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ start_date: '2020-01-01' })))).reason, 'invalid:start_date_range');
  assert.equal((await read('a day in Kelowna', mockFetch(intent({ interests: [it('coffee', { start_time: '25:00' })] })))).reason, 'invalid:interest_start_time');
  const { t, ...missing } = ai.toWire(intent());
  assert.equal((await read('a day in Kelowna', mockFetch(null, { wire: missing }))).reason, 'invalid:missing_t');
  // The long form is validated the same way wherever it comes from (server.js re-checks every reader's answer).
  const { towns, ...missingLong } = intent();
  assert.equal(ai.validateIntent(missingLong, ALLOWED).reason, 'invalid:missing_towns');
  assert.equal(ai.validateIntent({ ...intent(), venue_id: 3 }, ALLOWED).reason, 'invalid:extra_venue_id');
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
  assert.equal(r3.text, 'a day in Penticton, with a 2-year-old and a 4-year-old, on a rainy day, vegan and wheelchair accessible, no alcohol', '"no alcohol" covers the drinks kinds');
  assert.deepEqual(r3.overrides, { pace: 'relaxed' });
  const r4 = ai.renderTripRequest(intent({ towns: ['kelowna'], interests: [it('hiking', { time_of_day: 'afternoon' }), it('gallery', { time_of_day: 'morning' }), it('dinner', { time_of_day: 'evening' })] }), { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} });
  assert.equal(r4.text, 'an afternoon hike then a morning art gallery then dinner in Kelowna');
});

test('French requests go to the model as typed (it reads French); the reading is language-free', async () => {
  const f = mockFetch(intent({ towns: ['kelowna'], occasion: 'romantic', days: 2, interests: [it('winery')] }));
  const r = await read('un week-end romantique à Kelowna avec des vignobles', f, { lang: 'fr' });
  assert.equal(r.ok, true);
  assert.match(f.calls[0].body.messages[0].content, /week-end romantique à Kelowna/);
  assert.match(f.calls[0].body.system[0].text, /French/);
  assert.equal(ai.renderTripRequest(r.intent, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} }).text, 'a romantic 2 days in Kelowna with wineries');
});

test('the switch: TRIP_AI must be on', () => {
  assert.equal(ai.enabled({}), false);
  assert.equal(ai.enabled({ TRIP_AI: 'off' }), false);
  assert.equal(ai.enabled({ TRIP_AI: 'on' }), true);
});

// Round 2 (2026-11-20): misreads from the first real run, fixed in the prompt and checked in code.
test('designated driver is not "no alcohol": a wrong avoidance next to a drinks stop or a driver is dropped', async () => {
  const text = 'wine tasting on the Naramata Bench with a designated driver';
  // The first real answer (R55): wine tasting + "no alcohol". The code drops the contradiction.
  const bad = await read(text, mockFetch(intent({ towns: ['naramata'], interests: [it('wine_tasting')], must_avoid: ['alcohol'] })));
  assert.equal(bad.ok, true);
  assert.deepEqual(bad.intent.must_avoid, []);
  assert.ok(bad.dropped.includes('avoid:alcohol'));
  // The corrected answer: a driver, no avoidance.
  const good = await read(text, mockFetch(intent({ towns: ['naramata'], driver: true, interests: [it('wine_tasting')] })));
  assert.equal(good.intent.driver, true);
  const r = ai.renderTripRequest(good.intent, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} });
  assert.equal(r.text, 'wine tasting in Naramata, with a designated driver');
  // A driver alone also rules out "no alcohol".
  assert.deepEqual(ai.validateIntent(intent({ driver: true, must_avoid: ['alcohol'] }), ALLOWED).intent.must_avoid, []);
  // "We don't drink" with no drinks asked stays a real avoidance.
  assert.deepEqual(ai.validateIntent(intent({ must_avoid: ['alcohol', 'winery'] }), ALLOWED).intent.must_avoid, ['alcohol', 'winery']);
  // Negation scope in general: a kind that is asked for can't also be avoided ("no breweries but a winery" read with
  // winery in both lists keeps the winery).
  const both = ai.validateIntent(intent({ interests: [it('winery')], must_avoid: ['winery', 'brewery'] }), ALLOWED);
  assert.deepEqual(both.intent.must_avoid, ['brewery']);
  assert.match(ai.systemPrompt(ALLOWED), /designated driver.*DO drink/);
});

test('order of happening, not of words: "a brewery after dinner" keeps dinner first all the way to the planner text', async () => {
  const p = ai.systemPrompt(ALLOWED);
  assert.match(p, /IN THE ORDER THEY WILL HAPPEN/);
  assert.match(p, /"a brewery after dinner" -> dinner, brewery/);
  assert.match(p, /"before dinner, a winery" -> winery, dinner/);
  const r = await read('a brewery after dinner in Penticton', mockFetch(intent({ towns: ['penticton'], interests: [it('dinner'), it('brewery', { time_of_day: 'night' })] })));
  const out = ai.renderTripRequest(r.intent, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} });
  assert.equal(out.text, 'dinner then breweries in Penticton', 'no "night breweries"');
});

test('one stop asked once: après + drinks, winery + winery and a sunset + dinner are one stop each', () => {
  const v = ai.validateIntent(intent({ towns: ['big-white'], interests: [it('ski'), it('apres'), it('drinks', { time_of_day: 'evening' })] }), ALLOWED);
  assert.deepEqual(v.intent.interests.map((x) => x.kind), ['ski', 'apres']);
  const g = ai.validateIntent(intent({ days: 2, interests: [it('winery'), it('winery')] }), ALLOWED);
  assert.deepEqual(g.intent.interests.map((x) => x.kind), ['winery']);
  const sd = ai.validateIntent(intent({ towns: ['naramata'], interests: [it('brunch'), it('wine_tasting'), it('sunset'), it('dinner')] }), ALLOWED);
  assert.deepEqual(sd.intent.interests.map((x) => x.kind), ['brunch', 'wine_tasting', 'dinner']);
  assert.equal(ai.renderTripRequest(sd.intent, { allowed: ALLOWED, taxonomy: TAXONOMY, args: {} }).text, 'brunch then wine tasting then a sunset dinner in Naramata');
  // Re-validating an already checked intent (server.js does) changes nothing.
  assert.deepEqual(ai.validateIntent(sd.intent, ALLOWED).intent, sd.intent);
  // Two different stops of the same kind with typed names stay two stops.
  const two = ai.validateIntent(intent({ interests: [it('winery', { place: 'Quails Gate' }), it('winery', { place: 'Mission Hill' })] }), ALLOWED, { originalText: 'Quails Gate then Mission Hill' });
  assert.equal(two.intent.interests.length, 2);
});

test('wire format: short keys round-trip to the long intent', () => {
  const long = intent({ towns: ['kelowna'], weekday: 'saturday', driver: true, party: { adults: 2, kid_ages: [4] }, interests: [it('coffee', { time_of_day: 'morning', start_time: '09:30' })], must_have: ['vegan'] });
  const w = ai.toWire(long);
  assert.deepEqual(Object.keys(w), ai.WIRE_KEYS, 'every key, always');
  assert.deepEqual(w.f, ['driver']);
  assert.equal(w.sd, '');
  assert.equal(w.d, 0);
  assert.equal(w.w, 'saturday');
  const back = ai.expandWire(w);
  assert.equal(back.ok, true);
  assert.equal(back.intent.weekday, 'saturday');
  assert.equal(back.intent.month, null);
  assert.equal(ai.validateIntent(back.intent, ALLOWED).ok, true);
  assert.equal(back.intent.driver, true);
  assert.equal(back.intent.start_date, null, '"" is not said');
  assert.equal(back.intent.days, null, '0 is not said');
  assert.equal(back.intent.interests[0].place, null);
  assert.equal(ai.expandWire({ ...w, i: [{ k: 'coffee', t: 'any', s: '', p: '', venue: 1 }] }).reason, 'invalid:interest');
  assert.equal(ai.expandWire({ ...w, i: [{ k: 'coffee', t: 'any', s: null, p: '' }] }).reason, 'invalid:interest', 'no nulls in the wire format');
  assert.equal(ai.expandWire({ ...w, f: ['vip'] }).reason, 'invalid:flags');
  assert.equal(ai.expandWire({ ...w, d: -1 }).reason, 'invalid:d');
  const { sd, ...noSd } = w;
  assert.equal(ai.expandWire(noSd).reason, 'invalid:missing_sd');
  // Still smaller than the first version's answer (long names, nested party, nulls everywhere).
  assert.ok(JSON.stringify(w).length < JSON.stringify(long).length * 0.6, `${JSON.stringify(w).length} vs ${JSON.stringify(long).length}`);
});

// Round 3 (2026-11-20): round 2's schema (20 optional parameters) made the live API compile for 14-30 s and then answer
// 400 "Schema is too complex". This holds the schema to the documented structured-output limits, with the real taxonomy
// size, so it can't drift back silently.
test('schema complexity: no optional parameters, no unions, no formats, enums no bigger than round 1 (which compiled)', () => {
  // A taxonomy as big as the live one: every type, activity and badge the reader knows, 20 towns.
  const towns = ['kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton', 'naramata', 'lake-country', 'okanagan-falls', 'oliver', 'osoyoos',
    'vernon', 'armstrong', 'coldstream', 'lumby', 'enderby', 'kaleden', 'apex', 'big-white', 'silverstar', 'baldy'];
  const full = ai.buildAllowed({
    regions: towns, regionLabels: Object.fromEntries(towns.map((t) => [t, t])),
    types: Object.keys(ai.TYPE_PHRASES), activities: Object.keys(ai.ACTIVITY_PHRASES),
    features: Object.keys(ai.FEATURE_PHRASES).filter((f) => f !== 'accessible'), paces: ['relaxed', 'standard', 'packed'], budgets: ['budget', 'moderate', 'upscale'],
  });
  const c = ai.schemaComplexity(ai.wireSchema(full));
  assert.ok(c.optional <= ai.SCHEMA_LIMITS.optional && c.unions <= ai.SCHEMA_LIMITS.unions, 'inside the documented limits');
  // Stricter than the limits, on purpose: these are what made round 2 fail.
  assert.equal(c.optional, 0, 'optional parameters');
  assert.equal(c.unions, 0, 'union types (anyOf / type arrays)');
  assert.equal(c.formats, 0, 'string formats');
  assert.ok(c.depth <= 3, `nesting depth ${c.depth}`);
  // Round 1 (all required, 13 unions, 171 enum values, largest 47) compiled and answered in ~1.3 s; stay at or under its
  // enum budget plus the handful of "" sentinels and flags.
  assert.ok(c.largestEnum <= 50, `largest enum ${c.largestEnum}`);
  assert.ok(c.enumValues <= 200, `enum values ${c.enumValues}`);
  assert.ok(c.properties <= 25, `properties ${c.properties}`);
  // The counter itself sees optional parameters and unions.
  assert.deepEqual(ai.schemaComplexity({ type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { anyOf: [{ type: 'string' }, { type: 'null' }] }, c: { type: ['string', 'null'] } } }).optional, 2);
  assert.equal(ai.schemaComplexity({ type: 'object', required: [], properties: { b: { anyOf: [{ type: 'string' }, { type: 'null' }] }, c: { type: ['string', 'null'] } } }).unions, 2);
});
