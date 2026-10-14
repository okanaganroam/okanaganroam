#!/usr/bin/env node
// Adds researched dog rules (e.g. data/dog-policies-2026-10.json) to the live
// site's 'dog_policy' collection, so Dog Friendly Finds shows a "Dogs:" line
// on those cards.
//
//   node scripts/apply-dog-policies.js data/dog-policies-2026-10.json            # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-dog-policies.js <file.json> --apply
//
// Each entry: { id, region, slug, name, note, source_url }. Each note comes
// from the venue's own website. A venue is re-read first and added only when its
// region/slug still match, through POST /admin/collection-membership, so the
// reason and batch are recorded. A venue that already has a rule is left alone
// (409 already_member), and running the file twice changes nothing.
// OKR_BASE_URL overrides the target site.

const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!fileArg) {
  console.error('Usage: node scripts/apply-dog-policies.js <file.json> [--apply]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
const UA = { 'User-Agent': 'okanaganroam-apply/1.0' };

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const steps = [];
  for (const v of data.venues) {
    const res = await fetch(`${BASE}/api/venues/${v.id}`, { headers: UA });
    if (!res.ok) { console.log(`skip ${v.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== v.region || live.slug !== v.slug) { console.log(`skip ${v.name}: live is ${live.region}/${live.slug}`); continue; }
    steps.push(v);
  }

  console.log(`\n${steps.length} dog rule(s):`);
  for (const v of steps) console.log(`  - ${v.name}: ${v.note}`);
  if (!APPLY) {
    console.log('\nDry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to write.');
    return;
  }
  let ok = 0, already = 0, failed = 0;
  for (const v of steps) {
    const r = await fetch(`${BASE}/admin/collection-membership`, {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ kind: 'dog_policy', venue_id: v.id, action: 'add', note: v.note, reason: `${data.reason} (${v.source_url})`, batch_id: data.batch_id }),
    });
    let out = null;
    try { out = await r.json(); } catch (e) { out = null; }
    if (r.ok) { ok += 1; console.log(`OK     ${v.name}`); }
    else if (r.status === 409 && out && out.error === 'already_member') { already += 1; console.log(`done already: ${v.name}`); }
    else { failed += 1; console.log(`FAILED ${v.name}: ${r.status} ${JSON.stringify(out).slice(0, 300)}`); }
  }
  console.log(`\nDone: ${ok} added${already ? `, ${already} already there` : ''}${failed ? `, ${failed} failed (see above)` : ''}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
