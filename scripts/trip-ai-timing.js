#!/usr/bin/env node
'use strict';
// Build My Trip AI reader (round 2, 2026-11-20): a small timing check for trip-ai.js alone (no planner, no database).
//
//   ANTHROPIC_API_KEY=... node scripts/trip-ai-timing.js            # 12 requests x 2 rounds against the real model
//   node scripts/trip-ai-timing.js --mock                           # no key: our own code's time + answer sizes only
// Options: --n 12 (requests, from scripts/trip-ai-eval/cases.json), --rounds 2, --timeout-ms 5000
//
// Prints each read's time and tokens (input / output / read from cache / written to cache), then p50 and p95 for the
// first call (cold: schema compile + cache write) and for the rest. The first round warms the prompt cache, so the
// second round shows the steady state. A generous timeout here, so slow calls are measured instead of cut off.
// With --mock it also compares the size of the model's answer in the first version's format (every key, long names)
// with the current wire format, for the fixture answers: output tokens are most of Haiku's read time.

const fs = require('fs');
const path = require('path');
const tripAi = require('../trip-ai.js');

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const MOCK = argv.includes('--mock');
const N = Number(opt('n', 12)) || 12;
const ROUNDS = Number(opt('rounds', 2)) || 2;
const TIMEOUT_MS = Number(opt('timeout-ms', 5000)) || 5000;
if (!MOCK && !tripAi.apiKey()) { console.error('No ANTHROPIC_API_KEY. Use --mock for the offline numbers.'); process.exit(2); }

// The towns and kinds offered to the model, without loading server.js (the same lists buildTripPlannerTaxonomy gives).
const REGIONS = { kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland', summerland: 'Summerland', penticton: 'Penticton',
  naramata: 'Naramata', 'lake-country': 'Lake Country', 'okanagan-falls': 'Okanagan Falls', oliver: 'Oliver', osoyoos: 'Osoyoos', vernon: 'Vernon',
  armstrong: 'Armstrong', coldstream: 'Coldstream', lumby: 'Lumby', enderby: 'Enderby', kaleden: 'Kaleden', apex: 'Apex', 'big-white': 'Big White',
  silverstar: 'SilverStar', baldy: 'Baldy' };
const allowed = tripAi.buildAllowed({
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: Object.keys(tripAi.TYPE_PHRASES), activities: Object.keys(tripAi.ACTIVITY_PHRASES),
  features: Object.keys(tripAi.FEATURE_PHRASES).filter((f) => f !== 'accessible'),
  paces: ['relaxed', 'standard', 'packed'], budgets: ['budget', 'moderate', 'upscale'],
});
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'trip-ai-eval', 'cases.json'), 'utf8')).cases;
const mocks = JSON.parse(fs.readFileSync(path.join(__dirname, 'trip-ai-eval', 'mock-answers.json'), 'utf8')).answers;
const pick = cases.slice(0, N);
const pct = (xs, p) => { if (!xs.length) return '-'; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };

async function main() {
  const env = { ...process.env, TRIP_AI_DAILY_USD: process.env.TRIP_AI_DAILY_USD || '5' };
  const today = new Date(Date.now() - 8 * 3600000).toISOString().slice(0, 10);
  const times = [];
  let first = null;
  for (let round = 1; round <= ROUNDS; round++) {
    for (const c of pick) {
      const fetchImpl = MOCK ? async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: 'text', text: JSON.stringify(tripAi.toWire(mocks[c.id] || { towns: [], interests: [] })) }] }) }) : undefined;
      const r = await tripAi.readTripRequest(c.text, { allowed, today, env, timeoutMs: TIMEOUT_MS, lang: c.lang, ...(MOCK ? { fetchImpl, apiKey: 'mock' } : {}) });
      const u = r.usage || {};
      console.log(`r${round} ${c.id} ${String(r.ms).padStart(5)} ms  ${r.ok ? 'ok    ' : r.reason.padEnd(6)} in ${u.input_tokens ?? '-'} out ${u.output_tokens ?? '-'} cache read ${u.cache_read_input_tokens ?? '-'} write ${u.cache_creation_input_tokens ?? '-'}  ${c.text.slice(0, 60)}`);
      if (!r.ok && r.error) console.log(`      error: ${r.error}`);
      // A refused request (4xx) on the first call means every call will be refused: stop and show why.
      if (first === null && !r.ok && /^api_4/.test(r.reason)) {
        console.error(`\nStopped: the first call was refused (${r.reason}${r.error ? `: ${r.error}` : ''}). Every call would fail the same way.`);
        process.exit(3);
      }
      if (first === null) first = r.ms; else times.push(r.ms);
    }
  }
  console.log(`\nfirst call (cold): ${first} ms; the other ${times.length}: p50 ${pct(times, 50)} ms, p95 ${pct(times, 95)} ms, max ${times.length ? Math.max(...times) : '-'} ms`);
  if (MOCK) {
    // Answer size, first version vs round 2, for the fixture answers (characters; roughly 3 characters per token).
    const longForm = (x) => JSON.stringify({ unsure: x.unsure, towns: x.towns, valley_wide: x.valley_wide, start_date: x.start_date, days: x.days, nights: x.nights,
      weekday: x.weekday, month: x.month, season: x.season, party: x.party, occasion: x.occasion, rainy_day: x.rainy_day,
      interests: x.interests.map((i) => ({ kind: i.kind, time_of_day: i.time_of_day, start_time: i.start_time, place: i.place })), pace: x.pace, budget: x.budget, must_have: x.must_have, must_avoid: x.must_avoid });
    const ids = Object.keys(mocks);
    const a = ids.reduce((t, id) => t + longForm(mocks[id]).length, 0) / ids.length;
    const b = ids.reduce((t, id) => t + JSON.stringify(tripAi.toWire(mocks[id])).length, 0) / ids.length;
    console.log(`answer size over ${ids.length} fixture answers: first version ${Math.round(a)} characters (~${Math.round(a / 3)} tokens), now ${Math.round(b)} characters (~${Math.round(b / 3)} tokens), ${Math.round((100 * (a - b)) / a)}% smaller`);
    console.log(`schema: ${JSON.stringify(tripAi.schemaComplexity(tripAi.wireSchema(allowed)))} (documented limits: ${tripAi.SCHEMA_LIMITS.optional} optional, ${tripAi.SCHEMA_LIMITS.unions} union-typed parameters)`);
    console.log(`system prompt ${tripAi.systemPrompt(allowed).length} characters + schema ${JSON.stringify(tripAi.wireSchema(allowed)).length} characters (~${Math.round((tripAi.systemPrompt(allowed).length + JSON.stringify(tripAi.wireSchema(allowed)).length) / 3.5)} tokens; Haiku 5.5 caches from 512)`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
