#!/usr/bin/env node
// Imports places to stay (type 'stay', places-to-stay.js) from a CSV through the same admin route every new venue goes
// through: POST /api/venues (admin token; it refuses a likely duplicate with a 409 and lists the live match).
//
//   node scripts/import-stays.js stays.csv                     # dry run (default): checks every row, sends nothing
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/import-stays.js stays.csv --go
//
// OKR_BASE_URL overrides the target (default https://okanaganroam.com; use https://whistlerroam.com on Whistler).
// Required columns: name, region, subtype, address, latitude, longitude, website, phone, description, source_url.
// A row without a street address (a number and a street name) is skipped: the site only lists fixed addresses.
// subtype is one of Hotel, Motel, B&B, Inn, Lodge, Resort, Cabin, Campground, Guest house; it is stored in `cuisine`
// (the kind of place, as outdoor, tour and indoor places do). source_url is where the details were checked: it is
// printed with each row for the log, not stored on the site.
// New stays are noindex and out of the sitemap until STAYS_INDEXABLE opens their town.

const fs = require('node:fs');
const path = require('node:path');
const { stayKind } = require('../places-to-stay');

const REQUIRED = ['name', 'region', 'subtype', 'address', 'latitude', 'longitude', 'website', 'phone', 'description', 'source_url'];
const BASE = (process.env.OKR_BASE_URL || 'https://okanaganroam.com').replace(/\/$/, '');
const UA = /whistler/i.test(BASE) ? 'whistlerroam-import/1.0' : 'okanaganroam-import/1.0';

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes.
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = [];
    } else field += c;
  }
  row.push(field); if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] === undefined ? '' : r[i]).trim()])));
}

// The towns the site knows, read from server.js's REGION_LABELS (read as text: nothing is run, no database opened).
function knownRegions(serverFile = path.join(__dirname, '..', 'server.js')) {
  const src = fs.readFileSync(serverFile, 'utf8');
  const m = /const REGION_LABELS = \{([\s\S]*?)\n\};/.exec(src);
  if (!m) return null;
  return new Set([...m[1].matchAll(/(?:^|[\s,{])'?([a-z][a-z-]*)'?\s*:/g)].map((x) => x[1]));
}

const STREET_RE = /\b\d+[a-z]?(?:-\d+)?\s+[A-Za-z0-9]/;
function slugify(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 80).replace(/-+$/, '');
}

// One CSV row -> { body } for POST /api/venues, or { skip: reason }.
function rowToVenue(r, regions) {
  for (const col of ['name', 'region', 'subtype', 'address', 'latitude', 'longitude']) if (!r[col]) return { skip: `no ${col}` };
  if (!STREET_RE.test(r.address)) return { skip: 'no street address' };
  if (regions && !regions.has(r.region)) return { skip: `unknown region "${r.region}"` };
  const kind = stayKind(r.subtype);
  if (!kind) return { skip: `unknown subtype "${r.subtype}"` };
  const lat = Number(r.latitude); const lng = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { skip: 'bad latitude/longitude' };
  const slug = slugify(r.name);
  if (!slug) return { skip: 'name gives no slug' };
  const body = { name: r.name, region: r.region, type: 'stay', cuisine: kind.key, address: r.address, latitude: lat, longitude: lng, slug };
  if (r.website) body.website = /^https?:\/\//i.test(r.website) ? r.website : `https://${r.website}`;
  if (r.phone) body.phone = r.phone;
  if (r.description) body.description = r.description;
  return { body };
}

async function main(argv = process.argv.slice(2)) {
  const file = argv.find((a) => !a.startsWith('--'));
  const GO = argv.includes('--go');
  if (!file) { console.error('Usage: node scripts/import-stays.js <file.csv> [--go]'); process.exit(1); }
  const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
  if (GO && !TOKEN) { console.error('Set ENRICHMENT_ADMIN_TOKEN to import (--go).'); process.exit(1); }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (rows.length) {
    const missing = REQUIRED.filter((c) => !(c in rows[0]));
    if (missing.length) { console.error(`Missing columns: ${missing.join(', ')}`); process.exit(1); }
  }
  const regions = knownRegions();
  const counts = { created: 0, would_create: 0, skipped: 0, duplicate: 0, failed: 0 };
  console.log(`${GO ? 'IMPORTING to' : 'DRY RUN for'} ${BASE}: ${rows.length} rows`);
  for (const [i, r] of rows.entries()) {
    const line = `row ${i + 2} ${r.name || '(no name)'} [${r.region || '?'}]`;
    const { body, skip } = rowToVenue(r, regions);
    if (skip) { console.log(`SKIP     ${line}: ${skip}`); counts.skipped++; continue; }
    if (!GO) { console.log(`WOULD    ${line} -> /${body.region}/stays/${body.slug} (${body.cuisine}) source: ${r.source_url || '-'}`); counts.would_create++; continue; }
    try {
      const res = await fetch(`${BASE}/api/venues`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, 'User-Agent': UA }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (res.status === 201) { console.log(`CREATED  ${line} -> #${out.id} /${out.region}/stays/${out.slug} source: ${r.source_url || '-'}`); counts.created++; }
      else if (res.status === 409) { console.log(`DUPLICATE ${line}: ${out.error || ''} ${JSON.stringify(out.existing || [])}`); counts.duplicate++; }
      else { console.log(`FAILED   ${line}: ${res.status} ${out.error || ''}`); counts.failed++; }
    } catch (e) { console.log(`FAILED   ${line}: ${e.message}`); counts.failed++; }
  }
  console.log(JSON.stringify(counts));
}

if (require.main === module) main();
module.exports = { parseCsv, rowToVenue, knownRegions, slugify, REQUIRED };
