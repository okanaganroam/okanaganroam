#!/usr/bin/env node
// Applies data/venue-websites-2026-10.json to a running site through
// POST /admin/enrich-website, which only fills a website that is empty.
//
//   node scripts/apply-venue-websites.js            # dry run: shows what would change
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-venue-websites.js --apply
//
// OKR_BASE_URL overrides the target (default https://okanaganroam.com).
// Before each write the script re-reads the venue and skips it when the id
// no longer matches the expected region/slug, or a website is already set.

const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const data = require(path.join(__dirname, '..', 'data', 'venue-websites-2026-10.json'));

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  const counts = { written: 0, would_write: 0, already_set: 0, mismatch: 0, failed: 0 };
  for (const v of data.venues) {
    const res = await fetch(`${BASE}/api/venues/${v.id}`);
    if (!res.ok) {
      console.log(`FAILED   #${v.id} ${v.name}: GET ${res.status}`);
      counts.failed++;
      continue;
    }
    const live = await res.json();
    if (live.region !== v.region || live.slug !== v.slug) {
      console.log(`MISMATCH #${v.id} ${v.name}: live is ${live.region}/${live.slug}`);
      counts.mismatch++;
      continue;
    }
    if (live.website && String(live.website).trim() !== '') {
      console.log(`SKIP     #${v.id} ${v.name}: already has ${live.website}`);
      counts.already_set++;
      continue;
    }
    if (!APPLY) {
      console.log(`WOULD    #${v.id} ${v.name} -> ${v.website}`);
      counts.would_write++;
      continue;
    }
    const post = await fetch(`${BASE}/admin/enrich-website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        id: v.id,
        website: v.website,
        reason: `Website found by research (${v.kind}), verified ${data.verifiedOn}`,
        batch_id: data.batch_id,
      }),
    });
    const body = await post.json().catch(() => ({}));
    if (post.status === 200) {
      console.log(`WROTE    #${v.id} ${v.name} -> ${v.website}`);
      counts.written++;
    } else if (post.status === 409) {
      console.log(`SKIP     #${v.id} ${v.name}: already has ${body.live && body.live.website}`);
      counts.already_set++;
    } else {
      console.log(`FAILED   #${v.id} ${v.name}: ${post.status} ${body.error || ''}`);
      counts.failed++;
      if (post.status === 401 || post.status === 503) break;
    }
  }
  console.log(JSON.stringify(counts));
  if (counts.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
