#!/usr/bin/env node
// Applies researched stay info (places-to-stay.js, drafts/stays-2026-11/stay-info-schema.md) to a running site through
// POST /admin/stay-info.
//
//   node scripts/apply-stay-info.js stay-info.json            # dry run (default): checks every stay, writes nothing
//   ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-stay-info.js stay-info.json --apply
//
// The file: { "reason": "...", "batch_id": "...", "venues": [ { "id", "name", "region", "slug", "info": { ... } } ] }.
// OKR_BASE_URL overrides the target (default https://okanaganroam.com).
// Before each write the script re-reads the venue (GET /api/venues/<id>) and skips it unless it is still a place to
// stay with the same region and slug, and the info passes the same validation the server runs. With the token it also
// reads what is stored now (GET /admin/stay-info) and sends that updated_at as expect_updated_at, so a write never
// overwrites a change made in between. One line per stay, then the totals.

const fs = require('node:fs');
const path = require('node:path');
const { validateStayInfo, STAY_TYPE } = require('../places-to-stay');

const DEFAULT_BASE = 'https://okanaganroam.com';
const UA = 'okanaganroam-apply/1.0';

function short(info) {
  const bits = [];
  if (info.max_guests != null) bits.push(`sleeps ${info.max_guests}`);
  if (info.price_level != null) bits.push('$'.repeat(info.price_level));
  if (Array.isArray(info.unit_types) && info.unit_types.length) bits.push(info.unit_types.join('/'));
  if (info.confidence) bits.push(`confidence ${info.confidence}`);
  return bits.join(', ') || 'no facts';
}

async function run({ file, apply = false, base = process.env.OKR_BASE_URL || DEFAULT_BASE, token = process.env.ENRICHMENT_ADMIN_TOKEN, log = console.log, fetchFn = fetch } = {}) {
  base = String(base).replace(/\/$/, '');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const counts = { written: 0, would_write: 0, unchanged: 0, mismatch: 0, invalid: 0, failed: 0 };
  const fail = (msg) => { log(msg); return { counts, error: msg }; };
  if (!data || typeof data !== 'object' || !Array.isArray(data.venues)) return fail('The file must be { reason, batch_id, venues: [...] }.');
  if (typeof data.reason !== 'string' || !data.reason.trim() || typeof data.batch_id !== 'string' || !data.batch_id.trim()) return fail('The file needs a reason and a batch_id.');
  if (apply && !token) return fail('Set ENRICHMENT_ADMIN_TOKEN to apply.');
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  const auth = token ? { ...headers, Authorization: `Bearer ${token}` } : null;
  const seen = new Set();
  for (const v of data.venues) {
    const label = `#${v && v.id} ${(v && v.name) || ''}`.trim();
    if (!v || !Number.isInteger(v.id) || v.id <= 0 || seen.has(v.id)) { log(`INVALID  ${label}: missing, bad or repeated id`); counts.invalid++; continue; }
    seen.add(v.id);
    const check = validateStayInfo(v.info);
    if (!check.ok) { log(`INVALID  ${label}: ${check.errors.join(' ')}`); counts.invalid++; continue; }
    let live;
    try {
      const r = await fetchFn(`${base}/api/venues/${v.id}`, { headers });
      if (!r.ok) { log(`FAILED   ${label}: GET ${r.status}`); counts.failed++; continue; }
      live = await r.json();
    } catch (e) { log(`FAILED   ${label}: ${e.message}`); counts.failed++; continue; }
    if (live.type !== STAY_TYPE || live.region !== v.region || live.slug !== v.slug || live.redirect_to) {
      log(`MISMATCH ${label}: live is ${live.type} ${live.region}/${live.slug}${live.redirect_to ? ` (redirects to #${live.redirect_to})` : ''}`);
      counts.mismatch++;
      continue;
    }
    let stored = null; let storedAt;
    if (auth) {
      try {
        const r = await fetchFn(`${base}/admin/stay-info?venue_id=${v.id}`, { headers: auth });
        if (r.status === 401 || r.status === 503) { log(`FAILED   ${label}: admin GET ${r.status}`); counts.failed++; break; }
        if (!r.ok) { log(`FAILED   ${label}: admin GET ${r.status}`); counts.failed++; continue; }
        const body = await r.json();
        stored = body.info; storedAt = body.updated_at;
      } catch (e) { log(`FAILED   ${label}: ${e.message}`); counts.failed++; continue; }
    }
    const what = `${stored ? 'update' : auth ? 'new' : 'set'} (${short(v.info)})`;
    if (!apply) { log(`WOULD    ${label} ${v.region}/${v.slug}: ${what}`); counts.would_write++; continue; }
    try {
      const r = await fetchFn(`${base}/admin/stay-info`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: v.id, info: v.info, reason: data.reason.trim(), batch_id: data.batch_id.trim(), expect_updated_at: storedAt === undefined ? null : storedAt }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.status === 200 && body.changed) { log(`WROTE    ${label}: ${what}`); counts.written++; }
      else if (r.status === 200) { log(`SAME     ${label}: already stored`); counts.unchanged++; }
      else {
        log(`FAILED   ${label}: ${r.status} ${body.error || ''} ${(body.errors || []).join(' ')}`.trim());
        counts.failed++;
        if (r.status === 401 || r.status === 503) break;
      }
    } catch (e) { log(`FAILED   ${label}: ${e.message}`); counts.failed++; }
  }
  log(`${apply ? 'APPLIED' : 'DRY RUN'} ${base}: ${data.venues.length} stays in file. ${JSON.stringify(counts)}`);
  return { counts };
}

if (require.main === module) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) { console.error('Usage: node scripts/apply-stay-info.js <file.json> [--apply]'); process.exit(1); }
  run({ file: path.resolve(file), apply: process.argv.includes('--apply') })
    .then(({ counts, error }) => { if (error || counts.failed || counts.invalid || counts.mismatch) process.exitCode = 1; })
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { run, UA, DEFAULT_BASE };
