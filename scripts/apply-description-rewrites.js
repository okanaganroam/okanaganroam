#!/usr/bin/env node
// Applies data/description-rewrites-2026-10.json to a running site.
//
//   node scripts/apply-description-rewrites.js            # dry run: checks every listing, writes nothing
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-description-rewrites.js --apply
//   node scripts/apply-description-rewrites.js data/description-sports-2026-10.json   # another file, same rules
//
// Each venue is re-read first. It is updated only when its region and slug
// still match the file AND its live English and French descriptions are
// exactly the ones the rewrite was made from (compared by SHA-1), so a
// description someone edited since is never overwritten. Before the first
// write, every live description about to change is saved to
// description-rewrites-backup-<time>.json in the current folder.
// Only description and description_fr are sent (PUT /api/venues/:id updates
// just the fields it is given). OKR_BASE_URL overrides the target site.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
const data = require(fileArg ? path.resolve(fileArg) : path.join(__dirname, '..', 'data', 'description-rewrites-2026-10.json'));
const sha1 = (text) => crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const ready = [];
  const counts = { ready: 0, done: 0, changed: 0, moved: 0, missing: 0 };
  for (const item of data.venues) {
    const res = await fetch(`${BASE}/api/venues/${item.id}`);
    if (!res.ok) { counts.missing += 1; console.log(`skip ${item.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== item.region || live.slug !== item.slug) { counts.moved += 1; console.log(`skip ${item.name}: live is ${live.region}/${live.slug}`); continue; }
    if (live.description === item.description && live.description_fr === item.description_fr) { counts.done += 1; continue; }
    if (sha1(live.description) !== item.before_sha1 || sha1(live.description_fr) !== item.before_fr_sha1) {
      counts.changed += 1;
      console.log(`skip ${item.name}: its description changed since the rewrite was made`);
      continue;
    }
    counts.ready += 1;
    ready.push({ item, live });
  }
  console.log(`\n${counts.ready} to update, ${counts.done} already done, ${counts.changed} changed since (skipped), ${counts.moved} moved (skipped), ${counts.missing} not found.`);
  if (!APPLY) {
    if (ready.length) console.log(`\nExample -- ${ready[0].item.name}:\n  now: ${ready[0].live.description}\n  new: ${ready[0].item.description}`);
    console.log('\nDry run only. Add --apply (with ENRICHMENT_ADMIN_TOKEN) to write.');
    return;
  }
  if (!ready.length) return;
  const backup = path.resolve(`description-rewrites-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(ready.map(({ item, live }) => ({ id: item.id, region: live.region, slug: live.slug, name: live.name, description: live.description, description_fr: live.description_fr })), null, 1));
  console.log(`Backup of the current text: ${backup}`);
  let ok = 0, failed = 0;
  for (const { item } of ready) {
    const put = await fetch(`${BASE}/api/venues/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ description: item.description, description_fr: item.description_fr }),
    });
    if (put.ok) ok += 1; else { failed += 1; console.log(`FAILED ${put.status} ${item.name}`); }
  }
  console.log(`\nUpdated ${ok}${failed ? `, ${failed} failed` : ''}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
