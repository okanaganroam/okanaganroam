#!/usr/bin/env node
// Applies data/section-fixes-*.json to the live site:
//   types:   a venue's category (e.g. an indoor arena filed as an outdoor
//            destination -> sport), through PUT /api/venues/:id. Its old
//            category URL 301s to the new one by itself.
//   seasons: a "closed for the season / reopens <date>" notice from an
//            official source, through POST /admin/set-season.
//
//   node scripts/apply-section-fixes.js data/section-fixes-2026-10-14.json            # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-section-fixes.js <file.json> --apply
//
// Every venue is re-read first and changed only when its region/slug (and,
// for types, its current type) still match, so nothing edited since is
// overwritten. Running it twice changes nothing. OKR_BASE_URL overrides the site.

const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!fileArg) { console.error('Usage: node scripts/apply-section-fixes.js <file.json> [--apply]'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
const UA = { 'User-Agent': 'okanaganroam-apply/1.0' };

async function send(method, url, body) {
  const res = await fetch(`${BASE}${url}`, { method, headers: { ...UA, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
  let out = null;
  try { out = await res.json(); } catch (e) { out = null; }
  return { ok: res.ok, status: res.status, out };
}

async function main() {
  if (APPLY && !TOKEN) { console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.'); process.exit(1); }
  const steps = [];
  for (const t of data.types || []) {
    const res = await fetch(`${BASE}/api/venues/${t.id}`, { headers: UA });
    if (!res.ok) { console.log(`skip ${t.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== t.region || live.slug !== t.slug) { console.log(`skip ${t.name}: live is ${live.region}/${live.slug}`); continue; }
    if (live.type === t.to) { console.log(`done already: ${t.name} is ${t.to}`); continue; }
    if (live.type !== t.from) { console.log(`skip ${t.name}: it is ${live.type} now, not ${t.from}`); continue; }
    steps.push({ label: `${t.name}: ${t.from} -> ${t.to} (${t.why})`, run: () => send('PUT', `/api/venues/${t.id}`, { type: t.to }) });
  }
  for (const s of data.seasons || []) {
    const res = await fetch(`${BASE}/api/venues/${s.id}`, { headers: UA });
    if (!res.ok) { console.log(`skip ${s.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== s.region || live.slug !== s.slug) { console.log(`skip ${s.name}: live is ${live.region}/${live.slug}`); continue; }
    steps.push({ label: `${s.name}: season ${s.season.status}${s.season.reopens_date ? `, reopens ${s.season.reopens_date}` : ''} (${s.why})`, run: () => send('POST', '/admin/set-season', { id: s.id, season: s.season, reason: data.reason, batch_id: data.batch_id }) });
  }
  console.log(`\n${steps.length} change(s):`);
  for (const s of steps) console.log(`  - ${s.label}`);
  if (!APPLY) { console.log('\nDry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to write.'); return; }
  let ok = 0, failed = 0;
  for (const s of steps) {
    const r = await s.run();
    if (r.ok) { ok += 1; console.log(`OK     ${s.label}`); }
    else { failed += 1; console.log(`FAILED ${s.label}: ${r.status} ${JSON.stringify(r.out).slice(0, 300)}`); }
  }
  console.log(`\nDone: ${ok} applied${failed ? `, ${failed} failed (see above)` : ''}.`);
}
main().catch((err) => { console.error(err); process.exit(1); });
