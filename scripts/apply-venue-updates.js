#!/usr/bin/env node
// Applies venue corrections that venues sent us (e.g. data/venue-updates-2026-10-14.json)
// to the live site.
//
//   node scripts/apply-venue-updates.js data/venue-updates-2026-10-14.json            # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-venue-updates.js <file.json> --apply
//
// Each entry: { id, region, slug, expect: {field: currentValue}, set: {field: newValue},
// hours?: { expected_current_hours, hours, hours_source, hours_checked_at } }.
// A venue is re-read first and changed only when its region/slug still match and
// every `expect` value is still exactly what is live, so nothing edited since is
// overwritten. Fields go through PUT /api/venues/:id (only the fields given);
// hours go through POST /admin/verify-hours so their source and check date are
// recorded. Before the first write, the live venues about to change are saved to
// venue-updates-backup-<time>.json in the current folder. Photos referenced by
// image_url must already be deployed. OKR_BASE_URL overrides the target site.

const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!fileArg) {
  console.error('Usage: node scripts/apply-venue-updates.js <file.json> [--apply]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
const UA = { 'User-Agent': 'okanaganroam-apply/1.0' };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sameHours = (a, b) => {
  try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(typeof b === 'string' ? JSON.parse(b) : b); } catch (e) { return false; }
};

async function send(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { ...UA, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  let out = null;
  try { out = await res.json(); } catch (e) { out = null; }
  return { ok: res.ok, status: res.status, out };
}

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const steps = [];
  const backup = [];
  for (const v of data.venues) {
    const res = await fetch(`${BASE}/api/venues/${v.id}`, { headers: UA });
    if (!res.ok) { console.log(`skip ${v.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== v.region || live.slug !== v.slug) { console.log(`skip ${v.name}: live is ${live.region}/${live.slug}`); continue; }

    const set = v.set || {};
    const todo = Object.keys(set).filter((k) => !same(live[k], set[k]));
    const stale = Object.keys(v.expect || {}).filter((k) => !same(live[k], v.expect[k]));
    if (todo.length && stale.length) {
      console.log(`skip ${v.name} fields: ${stale.join(', ')} changed since this file was made`);
    } else if (todo.length) {
      const body = Object.fromEntries(todo.map((k) => [k, set[k]]));
      steps.push({ label: `${v.name}: ${todo.join(', ')}`, run: () => send('PUT', `/api/venues/${v.id}`, body) });
    }

    if (v.hours) {
      if (live.hours && sameHours(live.hours, v.hours.hours)) {
        console.log(`done already: ${v.name} hours`);
      } else if ((live.hours || null) !== v.hours.expected_current_hours && !sameHours(live.hours, v.hours.expected_current_hours)) {
        console.log(`skip ${v.name} hours: they changed since this file was made`);
      } else {
        steps.push({
          label: `${v.name}: hours (source ${v.hours.hours_source})`,
          run: () => send('POST', '/admin/verify-hours', {
            id: v.id,
            expected_current_hours: live.hours || null,
            verified: { hours: JSON.stringify(v.hours.hours), hours_source: v.hours.hours_source, hours_checked_at: v.hours.hours_checked_at },
            reason: data.reason,
            batch_id: data.batch_id,
          }),
        });
      }
    }
    if (steps.some((s) => s.label.startsWith(`${v.name}:`))) backup.push(live);
  }

  console.log(`\n${steps.length} change(s):`);
  for (const s of steps) console.log(`  - ${s.label}`);
  if (!APPLY) {
    console.log('\nDry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to write.');
    return;
  }
  if (!steps.length) return;
  const file = path.resolve(`venue-updates-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nBackup of the current venues: ${file}`);
  let ok = 0, failed = 0;
  for (const s of steps) {
    const r = await s.run();
    if (r.ok) { ok += 1; console.log(`OK     ${s.label}`); }
    else { failed += 1; console.log(`FAILED ${s.label}: ${r.status} ${JSON.stringify(r.out).slice(0, 300)}`); }
  }
  console.log(`\nDone: ${ok} applied${failed ? `, ${failed} failed (see above)` : ''}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
