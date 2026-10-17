#!/usr/bin/env node
// Applies a listing-removals file (default data/listing-removals-2026-10.json)
// to a running site.
//
//   node scripts/apply-listing-removals.js [file.json]            # dry run: checks each listing
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-listing-removals.js [file.json] --apply
//
// Redirects go through POST /admin/retire-duplicate (old links keep working);
// deletions go through DELETE /api/venues/:id. Each venue is re-read first
// and skipped if its region/slug no longer match the file, or it was
// already redirected. OKR_BASE_URL overrides the target site.

const path = require('node:path');

const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
const data = require(fileArg ? path.resolve(fileArg) : path.join(__dirname, '..', 'data', 'listing-removals-2026-10.json'));

async function live(expected) {
  const res = await fetch(`${BASE}/api/venues/${expected.id}`);
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `GET ${res.status}` };
  const v = await res.json();
  if (v.region !== expected.region || v.slug !== expected.slug) return { error: `live is ${v.region}/${v.slug}` };
  return { venue: v };
}

async function admin(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  if (APPLY && !TOKEN) {
    console.error('Set ENRICHMENT_ADMIN_TOKEN to apply.');
    process.exit(1);
  }
  let failed = 0;
  for (const r of data.redirect) {
    const dup = await live(r.duplicate);
    const can = await live(r.canonical);
    const label = `${r.duplicate.name} -> ${r.canonical.name}`;
    if (dup.missing || can.missing || dup.error || can.error) {
      console.log(`FAILED   ${label}: ${dup.error || can.error || 'venue not found'}`);
      failed++;
      continue;
    }
    if (dup.venue.redirect_to) {
      console.log(`SKIP     ${label}: already redirected to #${dup.venue.redirect_to}`);
      continue;
    }
    if (!APPLY) {
      console.log(`WOULD    redirect ${label}`);
      continue;
    }
    const out = await admin('POST', '/admin/retire-duplicate', { duplicate_id: r.duplicate.id, canonical_id: r.canonical.id });
    console.log(out.status === 200 ? `DONE     redirect ${label}` : `FAILED   ${label}: ${out.status} ${out.body.error || ''}`);
    if (out.status !== 200) failed++;
  }
  for (const d of data.delete) {
    const v = await live(d);
    if (v.missing) {
      console.log(`SKIP     ${d.name}: already gone`);
      continue;
    }
    if (v.error) {
      console.log(`FAILED   ${d.name}: ${v.error}`);
      failed++;
      continue;
    }
    if (!APPLY) {
      console.log(`WOULD    delete ${d.name} (#${d.id})`);
      continue;
    }
    const out = await admin('DELETE', `/api/venues/${d.id}`);
    console.log(out.status === 200 ? `DONE     delete ${d.name}` : `FAILED   ${d.name}: ${out.status} ${out.body.error || ''}`);
    if (out.status !== 200) failed++;
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
