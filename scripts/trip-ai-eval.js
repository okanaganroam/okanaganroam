#!/usr/bin/env node
'use strict';
// Build My Trip step 4 (2026-11-20): the AI-reader test harness (drafts/trip-ai/plan-2026-11-18.md).
//
// Runs each request in scripts/trip-ai-eval/cases.json both ways on the same date -- today's rules, and the AI reader
// (trip-ai.js) feeding the same planner -- straight through the planner functions in server.js (no server, no live
// site, no live database). The code runs from a temporary staged copy of this folder with a COPY of the database
// (the repo's okanagan.db, or --db <file>), so neither the repo's tracked database nor the --db file is ever changed.
// Writes into drafts/trip-ai/:
//   trip-ai-eval-<date>.csv          one row per request and path, with every automatic check
//   trip-ai-eval-<date>.md           success rate, fallback rate, p50/p95 latency, cost per plan, monthly estimate
//   blind-ab-<date>.md               up to 20 step-by-step requests whose plans differ, as plan A / plan B (no labels)
//   blind-ab-key-<date>.json         which of A/B was the AI (open only after judging)
//
// Usage (from the repo folder):
//   ANTHROPIC_API_KEY=... node scripts/trip-ai-eval.js              # real model, all 84 requests
//   node scripts/trip-ai-eval.js --mock                             # no key: the cases with fixture answers
//   ... --db drafts/trip-ai/okanagan-real-copy.db                   # plan against a fuller local copy of the data
// Options: --db <file>, --tag <word> (added to the file names), --date YYYY-MM-DD (default today), --only hard|real, --limit N, --timeout-ms 2000,
//          --monthly-plans 341 (plans a month, for the cost estimate), --out <dir> (default drafts/trip-ai), --seed 20261120
//
// Automatic checks (each only when it applies): right towns (every stop in a town asked for), every interest asked for
// appears (only kinds we list locally), in the order asked, start time respected (+/-30 min), no stop marked closed or
// out of season, no venue outside our listings, the right number of days, dog/kids read. Expectations come from the
// hand labels for the 20 hard cases and from a simple keyword labeller for the rest, the same for both paths.

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes(`--${name}`);
const MOCK = flag('mock');
const ONLY = opt('only', null);
const LIMIT = Number(opt('limit', 0)) || 0;
const TIMEOUT_MS = Number(opt('timeout-ms', 2000)) || 2000;
const MONTHLY_PLANS = Number(opt('monthly-plans', 341)) || 341; // GA, Sep 27 - Oct 24 2026: 341 trip plans in four weeks
const SEED = Number(opt('seed', 20261120)) || 20261120;
const OUT = path.resolve(opt('out', path.join(ROOT, 'drafts', 'trip-ai')));

if (!MOCK && !String(process.env.ANTHROPIC_API_KEY || '').trim()) {
  console.error('No ANTHROPIC_API_KEY in the environment. Run with --mock to use the fixture answers, or set the key for this command only.');
  process.exit(2);
}

// Stage the code in a temporary folder with a copy of the database (db.js opens <its folder>/okanagan.db; loading
// server.js runs migrations on it). Top-level files are copied, data/ is copied, public/ is linked (read-only), the same
// way tests/server.test.js stages isolated servers. Nothing in the repo or in --db is written.
if (fs.existsSync('/data')) { console.error('This looks like the live server (/data exists). Run the eval on a laptop.'); process.exit(2); }
const DB_SOURCE = path.resolve(opt('db', path.join(ROOT, 'okanagan.db')));
if (!fs.existsSync(DB_SOURCE)) { console.error(`No database at ${DB_SOURCE}`); process.exit(2); }
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-ai-eval-'));
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  const n = entry.name;
  if (n.startsWith('.') || /\.db(-wal|-shm)?$/.test(n) || n.endsWith('.zip') || n === 'node_modules' || entry.isSymbolicLink()) continue;
  if (entry.isDirectory()) {
    if (n === 'data') fs.cpSync(path.join(ROOT, n), path.join(STAGE, n), { recursive: true });
    else if (n === 'public') fs.symlinkSync(path.join(ROOT, n), path.join(STAGE, n), 'dir');
  } else fs.copyFileSync(path.join(ROOT, n), path.join(STAGE, n));
}
fs.copyFileSync(DB_SOURCE, path.join(STAGE, 'okanagan.db'));

process.env.TRIP_PLANNER_V3 = process.env.TRIP_PLANNER_V3 || 'on';
const app = require(path.join(STAGE, 'server.js'));
const db = require(path.join(STAGE, 'db.js'));
const tripAi = require(path.join(STAGE, 'trip-ai.js'));

let DB_STATS = '';
try { DB_STATS = db.prepare("SELECT type, COUNT(*) AS n FROM venues WHERE redirect_to IS NULL GROUP BY type ORDER BY n DESC").all().map((r) => `${r.type} ${r.n}`).join(', '); } catch (e) { DB_STATS = 'unknown'; }
const todayPacific = () => new Date(Date.now() - 8 * 3600000).toISOString().slice(0, 10);
const DATE = opt('date', todayPacific());
const NOW = new Date(`${DATE}T19:00:00Z`); // 11 AM Pacific on that date, for both paths

const casesDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'trip-ai-eval', 'cases.json'), 'utf8'));
const mockDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'trip-ai-eval', 'mock-answers.json'), 'utf8'));
let cases = casesDoc.cases.filter((c) => !ONLY || c.set === ONLY);
// Round 4: broad requests never reach the model (the gate), so with --mock they run without a fixture answer.
if (MOCK) cases = cases.filter((c) => mockDoc.answers[c.id] || tripAi.tripGate(c.text).gated !== 'step_by_step');
if (LIMIT) cases = cases.slice(0, LIMIT);

// ---------- Labeller (the same expectations for both paths) ----------
const taxonomy = app.buildTripPlannerTaxonomy();
const labels = taxonomy.regionLabels;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const KIND_WORDS = [
  ['cafe', /\b(?:coffee|cafes?|caf[eé]s?|latte)\b/],
  ['winery', /\b(?:winery|wineries|wine|wines|vignobles?|vin)\b/],
  ['brewery', /\b(?:brewery|breweries|beer|beers|craft beer|bieres?)\b/],
  ['food', /\b(?:breakfast|brunch|lunch|dinner|souper|diner|pizza|tacos|eats|foodie|restaurants?|date night|ice cream)\b/],
  ['drinks', /\b(?:pubs?|cocktails?|drinks|apres|bars?)\b/],
  ['beach', /\b(?:beach|beaches|plage)\b/],
  ['outdoor', /\b(?:hike|hiking|trails?|waterfall|bike ride|ski|skiing|mountain|slopes)\b/],
  ['indoor', /\b(?:museums?|galler(?:y|ies)|spa)\b/],
  ['golf', /\bgolf\b/],
];
const MATCH = {
  cafe: ['cafe'], winery: ['winery'], brewery: ['brewery'], food: ['restaurant', 'cafe'], restaurant: ['restaurant'],
  drinks: ['pub', 'cocktail', 'distillery', 'brewery', 'winery'], beach: ['beach'], outdoor: ['outdoor'], indoor: ['indoor'], golf: ['golf'], tour: ['tour'],
};
function autoLabel(text) {
  const t = fold(text);
  const towns = Object.keys(labels).filter((r) => new RegExp(`\\b${fold(labels[r]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
  const kindsIn = (x) => KIND_WORDS.map(([k, re]) => [k, x.search(re)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  // Order of happening (round 2): "A after B" is B then A; "before B, A" / "A before B" keep A first.
  const after = /^(.*?)\bafter\b(.*)$/.exec(t);
  let kinds = kindsIn(t);
  if (after && kindsIn(after[1]).length && kindsIn(after[2]).length) kinds = [...new Set([...kindsIn(after[2]), ...kindsIn(after[1])])];
  const before = /^\s*before\b([^,]*),(.*)$/.exec(t);
  if (before && kindsIn(before[1]).length && kindsIn(before[2]).length) kinds = [...new Set([...kindsIn(before[2]), ...kindsIn(before[1])])];
  const m = /\b(\d) days?\b/.exec(t) || /\bdeux jours\b/.exec(t);
  const days = m ? (m[1] ? Number(m[1]) : 2) : /\b(?:weekend|fin de semaine|week-end)\b/.test(t) ? 2 : null;
  return { towns, kinds, days, dog: /\bdog\b/.test(t) || null, kids: /\b(?:kids|toddlers?|enfants|children)\b/.test(t) || null };
}
const facts = app.buildTripPlannerFacts(false, DATE);
const factIds = new Set(facts.map((f) => f.id));
const listedKind = (k, towns) => facts.some((f) => (MATCH[k] || []).includes(f.type) && (!towns || !towns.length || towns.includes(f.region)));

// ---------- Reading a plan ----------
function planStops(p) {
  if (!p) return [];
  const days = (p.days || []).flatMap((d, i) => (d.stops || []).map((s) => ({ ...s, day: d.day || i + 1 })));
  const it = ((p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || []).map((s) => ({ ...s, day: 1 }));
  const list = days.length || it.length ? [] : (p.recommendations || []).map((s) => ({ ...s, day: 1 }));
  return [...days, ...it, ...list].filter((s) => s && s.venue && Number.isInteger(s.venue.id));
}
function firstStart(p) {
  const s = (p && p.schedule) || [];
  const d1 = s.filter((x) => (x.day || 1) === 1 && Number.isFinite(x.startMinutes));
  return d1.length ? Math.min(...d1.map((x) => x.startMinutes)) : null;
}
const hm = (m) => (m === null || m === undefined ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

function check(plan, expect, path) {
  const stops = planStops(plan);
  const res = {};
  res.nonEmpty = stops.length > 0;
  res.listed = stops.every((s) => factIds.has(s.venue.id));
  const closedRe = /\bclosed\b|out of season|not open|season(?:al)? closure/i;
  const closedIds = new Set(((plan && plan.schedule) || []).filter((x) => x.status === 'closed').map((x) => x.venueId));
  res.noClosed = !stops.some((s) => closedIds.has(s.venue.id) || (s.caveats || []).some((c) => closedRe.test(c)));
  if (expect.towns && expect.towns.length) res.towns = stops.length > 0 && stops.every((s) => expect.towns.includes(s.venue.region));
  const kinds = (expect.kinds || []).filter((k) => listedKind(k, expect.towns));
  res.unlistedKinds = (expect.kinds || []).filter((k) => !kinds.includes(k));
  if (kinds.length) {
    const types = stops.map((s) => s.venue.type);
    res.interests = kinds.every((k) => types.some((t) => MATCH[k].includes(t)));
    const oneDay = !(plan.days && plan.days.length > 1);
    if (oneDay && kinds.length > 1) {
      let at = -1;
      res.order = kinds.every((k) => { const i = types.findIndex((t, j) => j > at && MATCH[k].includes(t)); if (i < 0) return false; at = i; return true; });
    }
  }
  if (expect.noKinds) res.avoided = !stops.some((s) => expect.noKinds.some((k) => (MATCH[k] || [k]).includes(s.venue.type)));
  if (Number.isFinite(expect.startMinutes)) { const f = firstStart(plan); res.startTime = f !== null && Math.abs(f - expect.startMinutes) <= 30; }
  if (expect.days) res.days = expect.days === 1 ? !(plan.days && plan.days.length > 1) : (plan.days || []).length === expect.days;
  const party = JSON.stringify((plan.understood && plan.understood.party) || []) + JSON.stringify((plan.trip && plan.trip.party) || {});
  if (expect.dog) res.dog = /dog/.test(party);
  if (expect.kids) res.kids = /kid|famil|child/i.test(party) || /kid|famil/i.test(JSON.stringify(plan.understood || {}));
  if (expect.namedVenue) res.named = stops.some((s) => s.venue.name === expect.namedVenue);
  const keys = Object.keys(res).filter((k) => typeof res[k] === 'boolean');
  res.pass = keys.every((k) => res[k]);
  res.failed = keys.filter((k) => !res[k]);
  return res;
}

// ---------- Running ----------
const fullPlan = (args, now) => app.runTripPlan(args, now);
function mockFetchFor(id) {
  return async () => ({
    ok: true, status: 200,
    json: async () => ({ model: tripAi.MODEL, stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: 'text', text: JSON.stringify(tripAi.toWire(mockDoc.answers[id])) }] }),
  });
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pct = (xs, p) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  tripAi.resetSpend();
  const env = { ...process.env, TRIP_AI_DAILY_USD: process.env.TRIP_AI_DAILY_USD || '5' };
  // One warm-up read (a new schema is compiled once, then cached for 24 h), not counted.
  if (!MOCK) {
    const allowed = tripAi.buildAllowed(taxonomy);
    const w = await tripAi.readTripRequest('a day in Kelowna', { allowed, today: DATE, env, timeoutMs: 30000, now: NOW });
    console.log(`warm-up: ${w.ok ? 'ok' : w.reason} in ${w.ms} ms${w.usage ? ` (in ${w.usage.input_tokens}, out ${w.usage.output_tokens}, cache read ${w.usage.cache_read_input_tokens}, write ${w.usage.cache_creation_input_tokens})` : ''}`);
    // Round 3: a warm-up that fails means every request would fail the same way (round 2's schema: 30 s time-outs, then
    // 400 "Schema is too complex"). Stop here and say why, instead of running every request into the same wall.
    if (!w.ok) {
      console.error(`\nStopped: the warm-up read failed (${w.reason}${w.error ? `: ${w.error}` : ''}).`);
      if (/^api_4/.test(w.reason)) console.error('The API refused the request itself (a 4xx), so no request would work. Nothing was written.');
      else if (w.reason === 'timeout') console.error('It took over 30 s. That usually means the answer format is being compiled and is too complex. Nothing was written.');
      restoreDb();
      process.exit(3);
    }
  }
  const rows = [];
  for (const c of cases) {
    const args = app.parseTripPlanBody({ text: c.text }).value;
    const expect = c.expect || autoLabel(c.text);
    const t0 = Date.now();
    const rulesPlan = fullPlan(args, NOW);
    const rulesMs = Date.now() - t0;
    const reader = (text, o) => tripAi.readTripRequest(text, { ...o, env, timeoutMs: TIMEOUT_MS, lang: c.lang, ...(MOCK ? { fetchImpl: mockFetchFor(c.id), apiKey: 'mock' } : {}) });
    const a0 = Date.now();
    const { args: aiArgs, ai } = await app.tripAiPlanArgs(args, { now: NOW, lang: c.lang, reader });
    const aiPlan = fullPlan(aiArgs, NOW);
    const aiMs = Date.now() - a0;
    const rc = check(rulesPlan, expect, 'rules');
    const ac = check(aiPlan, expect, 'ai');
    rows.push({ c, expect, rulesPlan, aiPlan, ai, rc, ac, rulesMs, aiMs });
    console.log(`${c.id} [${ai.gated === 'step_by_step' ? 'AI ' : 'rules'}] rules:${rc.pass ? 'pass' : 'FAIL ' + rc.failed.join('+')} ai:${ac.pass ? 'pass' : 'FAIL ' + ac.failed.join('+')} ${ai.used ? '' : `(fallback: ${ai.reason})`} ${ai.ms !== null ? ai.ms + ' ms' : ''}  ${ai.text ? '-> ' + ai.text : ''}`);
  }

  // ---------- CSV ----------
  const q = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
  const stopText = (p) => planStops(p).map((s) => `D${s.day} ${s.venue.name} [${s.venue.type}/${s.venue.region}]`).join(' | ');
  const head = ['id', 'set', 'lang', 'request', 'path', 'pass', 'failed_checks', 'gate', 'gate_why', 'ai_used', 'ai_reason', 'ai_text', 'ai_ms', 'cost_usd', 'in_tokens', 'out_tokens', 'cache_read_tokens', 'cache_write_tokens', 'plan_ms', 'kind', 'days', 'first_start', 'stops', 'unlisted_kinds'];
  const lines = [head.join(',')];
  for (const r of rows) {
    for (const [pathName, p, ck, ms] of [['rules', r.rulesPlan, r.rc, r.rulesMs], ['ai', r.aiPlan, r.ac, r.aiMs]]) {
      lines.push([r.c.id, r.c.set, r.c.lang, r.c.text, pathName, ck.pass, ck.failed.join('+'), r.ai.gated || '', (r.ai.why || []).join('+'), pathName === 'ai' ? r.ai.used : '', pathName === 'ai' ? r.ai.reason : '', pathName === 'ai' ? (r.ai.text || '') : '',
        pathName === 'ai' ? (r.ai.ms ?? '') : '', pathName === 'ai' ? (r.ai.costUsd || 0) : '', ...['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].map((k) => (pathName === 'ai' && r.ai.usage ? r.ai.usage[k] : '')), ms, p && p.kind, (p && p.days ? p.days.length : ''), hm(firstStart(p)), stopText(p), (ck.unlistedKinds || []).join('+')].map(q).join(','));
    }
  }
  // Files are named by date (+ -mock, + the --db file's name, + --tag), so a second run doesn't overwrite the first.
  const tag = [DATE, MOCK ? 'mock' : '', opt('db', null) ? path.basename(DB_SOURCE).replace(/\.db$/, '') : '', opt('tag', '')].filter(Boolean).join('-');
  fs.writeFileSync(path.join(OUT, `trip-ai-eval-${tag}.csv`), lines.join('\n') + '\n');

  // ---------- Summary ----------
  const n = rows.length;
  const rate = (f) => (n ? Math.round((100 * rows.filter(f).length) / n) : 0);
  const used = rows.filter((r) => r.ai.used);
  const lat = rows.map((r) => r.ai.ms).filter(Number.isFinite);
  const cost = rows.reduce((s, r) => s + (r.ai.costUsd || 0), 0);
  const perPlan = n ? cost / n : 0;
  const withUsage = rows.filter((r) => r.ai.usage);
  const avg = (k) => (withUsage.length ? Math.round(withUsage.reduce((t, r) => t + (r.ai.usage[k] || 0), 0) / withUsage.length) : null);
  const cacheHits = withUsage.filter((r) => r.ai.usage.cache_read_input_tokens > 0).length;
  const reasons = {};
  for (const r of rows.filter((x) => !x.ai.used)) reasons[r.ai.reason] = (reasons[r.ai.reason] || 0) + 1;
  const checkNames = ['towns', 'interests', 'order', 'startTime', 'noClosed', 'listed', 'days', 'dog', 'kids', 'avoided', 'named', 'nonEmpty'];
  const checkRow = (k) => {
    const app_ = rows.filter((r) => typeof r.rc[k] === 'boolean');
    if (!app_.length) return null;
    return `| ${k} | ${app_.length} | ${app_.filter((r) => r.rc[k]).length} | ${app_.filter((r) => r.ac[k]).length} |`;
  };
  const better = rows.filter((r) => r.ac.pass && !r.rc.pass), worse = rows.filter((r) => !r.ac.pass && r.rc.pass);
  // Round 4 gate: the step-by-step requests (read by the model) and the broad ones (rules only, identical by design).
  const gIn = rows.filter((r) => r.ai.gated === 'step_by_step');
  const rateOf = (list, f) => (list.length ? Math.round((100 * list.filter(f).length) / list.length) : 0);
  const gInBetter = gIn.filter((r) => r.ac.pass && !r.rc.pass).length, gInWorse = gIn.filter((r) => !r.ac.pass && r.rc.pass).length;
  const gInFallback = gIn.filter((r) => !r.ai.used);
  const gInLat = gIn.map((r) => r.ai.ms).filter(Number.isFinite);
  const md = [
    `# Build My Trip AI reader: test results ${DATE}${MOCK ? ' (MOCKED model answers)' : ''}`,
    '',
    MOCK ? '**Mocked run.** No ANTHROPIC_API_KEY was available, so only the cases with hand-written fixture answers ran (scripts/trip-ai-eval/mock-answers.json) through the real trip-ai.js code. Latency and cost below are not real; rerun with a key for real numbers.' : `Model: ${tripAi.MODEL}, timeout ${TIMEOUT_MS} ms, same date (${DATE}) for both paths.`,
    '',
    `Requests: ${n} (${rows.filter((r) => r.c.set === 'hard').length} hard, ${rows.filter((r) => r.c.set === 'real').length} realistic). Database: a copy of ${path.basename(DB_SOURCE)} (${DB_STATS}). Interests with no listing of that kind in the asked towns are skipped by the checks and noted as "unlisted_kinds" in the CSV.`,
    '',
    '| | Rules (today) | AI reader |',
    '|---|---|---|',
    `| All automatic checks pass (all ${n}) | ${rate((r) => r.rc.pass)}% | ${rate((r) => r.ac.pass)}% |`,
    `| **Step-by-step requests sent to the AI (gate)** | | **${gIn.length} of ${n}** (the other ${n - gIn.length} plan with the rules, no AI call) |`,
    `| All automatic checks pass, step-by-step only | ${rateOf(gIn, (r) => r.rc.pass)}% | ${rateOf(gIn, (r) => r.ac.pass)}% (better on ${gInBetter}, worse on ${gInWorse}) |`,
    `| Step-by-step: fell back to rules | | ${gInFallback.length} of ${gIn.length}${gInFallback.length ? ` (${[...new Set(gInFallback.map((r) => r.ai.reason))].join(', ')})` : ''} |`,
    `| Step-by-step: AI read time p50 / p95 | | ${pct(gInLat, 50) ?? '-'} / ${pct(gInLat, 95) ?? '-'} ms |`,
    `| AI reading used (not fallen back) | | ${rate((r) => r.ai.used)}% |`,
    `| Fell back to rules | | ${rate((r) => !r.ai.used)}% ${Object.keys(reasons).length ? `(${Object.entries(reasons).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''} |`,
    `| AI read time p50 / p95 | | ${pct(lat, 50) ?? '-'} / ${pct(lat, 95) ?? '-'} ms |`,
    `| Tokens per read (average): input / output / read from cache | | ${avg('input_tokens') ?? '-'} / ${avg('output_tokens') ?? '-'} / ${avg('cache_read_input_tokens') ?? '-'} (cache hit on ${cacheHits} of ${withUsage.length}) |`,
    `| Cost per plan | $0 | $${perPlan.toFixed(6)} |`,
    `| Estimated monthly cost at ${MONTHLY_PLANS} plans/month | $0 | $${(perPlan * MONTHLY_PLANS).toFixed(2)} |`,
    '',
    `AI passes where rules fail: ${better.length}. AI fails where rules pass: ${worse.length}.`,
    '',
    '## Checks (requests where the check applies, passes for rules, passes for AI)',
    '',
    '| Check | Applies | Rules | AI |',
    '|---|---|---|---|',
    ...checkNames.map(checkRow).filter(Boolean),
    '',
    '## Each request',
    '',
    '| id | gate | request | rules | AI | AI read as |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.c.id} | ${r.ai.gated === 'step_by_step' ? 'AI' : 'rules'} | ${r.c.text.replace(/\|/g, '/')} | ${r.rc.pass ? 'pass' : 'fail: ' + r.rc.failed.join(', ')} | ${r.ac.pass ? 'pass' : 'fail: ' + r.ac.failed.join(', ')} | ${r.ai.used ? r.ai.text.replace(/\|/g, '/') : `(rules: ${r.ai.reason})`} |`),
    '',
    'Go / no-go (plan): AI wins at least 15 of the 20 blind picks, adds under 1 second (p95), costs under about $5 a month, and adds no new wrong-place errors (the "towns", "listed" and "noClosed" rows).',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, `trip-ai-eval-${tag}.md`), md);

  // ---------- Blind A/B for 20 requests ----------
  const rand = rng(SEED);
  // Which ones (round 4): ONLY step-by-step requests (the ones the gate sends to the AI) whose two plans differ, up to 20,
  // hard cases first, then the rest, in file order. Broad requests are the rules plan both ways, so there is nothing to pick.
  const ids = (p) => JSON.stringify(planStops(p).map((s) => s.venue.id));
  const eligible = rows.map((r, i) => ({ r, i, h: r.c.set === 'hard' ? 0 : 1 }))
    .filter((x) => x.r.ai.gated === 'step_by_step' && ids(x.r.aiPlan) !== ids(x.r.rulesPlan))
    .sort((x, y) => x.h - y.h || x.i - y.i);
  const pool = eligible.slice(0, 20).map((x) => x.r);
  const render = (p) => {
    const stops = planStops(p);
    if (!stops.length) return '_(no stops: the planner could not build a plan)_';
    const sched = new Map(((p && p.schedule) || []).map((x) => [`${x.day || 1}-${x.venueId}`, x.startMinutes]));
    return stops.map((s) => `- ${p.days && p.days.length > 1 ? `Day ${s.day}, ` : ''}${hm(sched.get(`${s.day}-${s.venue.id}`)) || s.label || s.daypart || ''} ${s.venue.name} (${s.venue.typeLabel || s.venue.type}, ${s.venue.regionLabel || s.venue.region})`).join('\n');
  };
  const sheet = [`# Build My Trip: which plan is better? (${DATE})`, '', `For each request, read plan A and plan B and mark the better one (or "same"). These are the ${pool.length} step-by-step requests where the two plans differ. Do not open the answer key until you are done.`, ''];
  const key = { date: DATE, seed: SEED, mock: MOCK, db: path.basename(DB_SOURCE), chosen: `${pool.length} of the ${eligible.length} step-by-step requests whose AI and rules plans differ (of ${gIn.length} step-by-step, ${n} in all)`, answers: [] };
  pool.forEach((r, i) => {
    const aiIsA = rand() < 0.5;
    const [A, B] = aiIsA ? [r.aiPlan, r.rulesPlan] : [r.rulesPlan, r.aiPlan];
    sheet.push(`## ${i + 1}. "${r.c.text}"`, '', '**Plan A**', '', render(A), '', '**Plan B**', '', render(B), '', 'Better: A / B / same', '');
    key.answers.push({ n: i + 1, id: r.c.id, request: r.c.text, ai: aiIsA ? 'A' : 'B', identical: JSON.stringify(planStops(r.aiPlan).map((s) => s.venue.id)) === JSON.stringify(planStops(r.rulesPlan).map((s) => s.venue.id)) });
  });
  fs.writeFileSync(path.join(OUT, `blind-ab-${tag}.md`), sheet.join('\n'));
  fs.writeFileSync(path.join(OUT, `blind-ab-key-${tag}.json`), JSON.stringify(key, null, 1) + '\n');
  console.log(`\nWrote ${path.join(OUT, `trip-ai-eval-${tag}.md`)} (+ .csv, blind-ab-${tag}.md, blind-ab-key-${tag}.json)`);
  console.log(`Gate: ${gIn.length} of ${n} requests are step-by-step (sent to the AI); on those, rules pass ${rateOf(gIn, (r) => r.rc.pass)}%, AI pass ${rateOf(gIn, (r) => r.ac.pass)}% (better ${gInBetter}, worse ${gInWorse}). Blind sheet: ${pool.length} pairs.`);
  console.log(`All: rules pass ${rate((r) => r.rc.pass)}%, AI pass ${rate((r) => r.ac.pass)}%, fallback ${rate((r) => !r.ai.used)}%, p95 ${pct(lat, 95) ?? '-'} ms, $${perPlan.toFixed(6)}/plan, ~$${(perPlan * MONTHLY_PLANS).toFixed(2)}/month`);
}

function restoreDb() {
  try { db.close(); } catch (e) { /* already closed */ }
  try { fs.rmSync(STAGE, { recursive: true, force: true }); } catch (e) { /* temp folder */ }
}
main().then(() => { restoreDb(); process.exit(0); }, (e) => { console.error(e); restoreDb(); process.exit(1); });
