#!/usr/bin/env node
// Applies data/dog-friendly-additions-2026-10.json to a running site.
//
//   node scripts/apply-dog-friendly-additions.js            # dry run: checks each listing
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-dog-friendly-additions.js --apply
//
// Each venue is re-read first and skipped if its region/slug no longer match
// the file. Only the badges named in "set" are written (PUT /api/venues/:id
// updates just the fields it is given). OKR_BASE_URL overrides the target site.

const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const data = require(path.join(__dirname, '..', 'data', 'dog-friendly-additions-2026-10.json'));

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  for (const item of data.venues) {
    const res = await fetch(`${BASE}/api/venues/${item.id}`);
    if (!res.ok) { console.log(`skip ${item.name}: GET ${res.status}`); continue; }
    const live = await res.json();
    if (live.region !== item.region || live.slug !== item.slug) { console.log(`skip ${item.name}: live is ${live.region}/${live.slug}`); continue; }
    const changes = Object.entries(item.set).filter(([k, v]) => !!live[k] !== v);
    if (!changes.length) { console.log(`ok   ${item.name}: already set`); continue; }
    const summary = changes.map(([k, v]) => `${k} ${!!live[k]} -> ${v}`).join(', ');
    if (!APPLY) { console.log(`would update ${item.name}: ${summary}`); continue; }
    const put = await fetch(`${BASE}/api/venues/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(Object.fromEntries(changes)),
    });
    console.log(`${put.ok ? 'updated' : `FAILED ${put.status}`} ${item.name}: ${summary}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
