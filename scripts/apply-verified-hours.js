#!/usr/bin/env node
// Applies a file of researched opening hours (e.g. data/indoor-hours-2026-10.json)
// to a running site through POST /admin/verify-hours -- the guarded, audited hours
// write that records where the hours came from (hours_source) and when they were
// checked (hours_checked_at), so Open Now can use them.
//
//   node scripts/apply-verified-hours.js data/indoor-hours-2026-10.json            # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-verified-hours.js data/indoor-hours-2026-10.json --apply
//
// Each venue is re-read first and skipped unless its region/slug still match and
// its live hours are still exactly what the file expects (normally none), so hours
// someone has set since are never overwritten (the endpoint checks this too).
// OKR_BASE_URL overrides the target site.

const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!fileArg) {
  console.error('Usage: node scripts/apply-verified-hours.js <file.json> [--apply]');
  process.exit(1);
}
const data = require(path.resolve(fileArg));

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const counts = { ready: 0, done: 0, changed: 0, moved: 0, missing: 0, updated: 0, failed: 0 };
  for (const item of data.venues) {
    const res = await fetch(`${BASE}/api/venues/${item.id}`);
    if (!res.ok) { counts.missing += 1; console.log(`skip ${item.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== item.region || live.slug !== item.slug) { counts.moved += 1; console.log(`skip ${item.name}: live is ${live.region}/${live.slug}`); continue; }
    const want = JSON.stringify(item.verified.hours);
    if (live.hours && JSON.stringify(JSON.parse(live.hours)) === JSON.stringify(JSON.parse(want))) { counts.done += 1; continue; }
    if ((live.hours || null) !== item.expected_current_hours) { counts.changed += 1; console.log(`skip ${item.name}: its hours changed since this file was made`); continue; }
    counts.ready += 1;
    if (!APPLY) continue;
    const post = await fetch(`${BASE}/admin/verify-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ id: item.id, expected_current_hours: item.expected_current_hours, verified: { hours: want, hours_source: item.verified.hours_source, hours_checked_at: item.verified.hours_checked_at }, reason: data.reason, batch_id: data.batch_id }),
    });
    if (post.ok) counts.updated += 1;
    else { counts.failed += 1; console.log(`FAILED ${post.status} ${item.name}: ${(await post.text()).slice(0, 200)}`); }
  }
  console.log(`\n${counts.ready} to update, ${counts.done} already done, ${counts.changed} changed since (skipped), ${counts.moved} moved (skipped), ${counts.missing} not found.`);
  if (APPLY) console.log(`Updated ${counts.updated}${counts.failed ? `, ${counts.failed} failed` : ''}.`);
  else console.log('Dry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to write.');
}

main().catch((err) => { console.error(err); process.exit(1); });
