#!/usr/bin/env node
// Applies a file of event descriptions (e.g. data/event-descriptions-2026-10.json)
// to a running site through PUT /api/events/:id, which logs every change with
// the file's reason and batch_id.
//
//   node scripts/apply-event-descriptions.js data/event-descriptions-2026-10.json            # dry run
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-event-descriptions.js data/event-descriptions-2026-10.json --apply
//
// Each event is re-read first and updated only when its region/slug still match
// and its live description is exactly the one this file was written from
// (compared by SHA-1), so a description edited since is never overwritten.
// Before the first write, the current text of every event about to change is
// saved to event-descriptions-backup-<time>.json in the current folder.
// OKR_BASE_URL overrides the target site.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!fileArg) {
  console.error('Usage: node scripts/apply-event-descriptions.js <file.json> [--apply]');
  process.exit(1);
}
const data = require(path.resolve(fileArg));
const sha1 = (text) => crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
const UA = { 'User-Agent': 'okanaganroam-apply/1.0' };

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const ready = [];
  const counts = { done: 0, changed: 0, moved: 0, missing: 0 };
  for (const item of data.events) {
    const res = await fetch(`${BASE}/api/events/${item.id}`, { headers: UA });
    if (!res.ok) { counts.missing += 1; console.log(`skip ${item.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== item.region || live.slug !== item.slug) { counts.moved += 1; console.log(`skip ${item.name}: live is ${live.region}/${live.slug}`); continue; }
    if (live.description === item.description) { counts.done += 1; continue; }
    if (sha1(live.description) !== item.before_sha1) { counts.changed += 1; console.log(`skip ${item.name}: its description changed since this file was made`); continue; }
    ready.push({ item, live });
  }
  console.log(`\n${ready.length} to update, ${counts.done} already done, ${counts.changed} changed since (skipped), ${counts.moved} moved (skipped), ${counts.missing} not found.`);
  if (!APPLY) {
    if (ready.length) console.log(`\nExample -- ${ready[0].item.name}:\n  now: ${ready[0].live.description}\n  new: ${ready[0].item.description}`);
    console.log('\nDry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to write.');
    return;
  }
  if (!ready.length) return;
  const backup = path.resolve(`event-descriptions-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(ready.map(({ item, live }) => ({ id: item.id, region: live.region, slug: live.slug, name: live.name, description: live.description })), null, 1));
  console.log(`Backup of the current text: ${backup}`);
  let ok = 0, failed = 0;
  for (const { item } of ready) {
    const put = await fetch(`${BASE}/api/events/${item.id}`, {
      method: 'PUT',
      headers: { ...UA, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ description: item.description, reason: data.reason, batch_id: data.batch_id }),
    });
    if (put.ok) ok += 1; else { failed += 1; console.log(`FAILED ${put.status} ${item.name}: ${(await put.text()).slice(0, 200)}`); }
  }
  console.log(`\nUpdated ${ok}${failed ? `, ${failed} failed` : ''}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
