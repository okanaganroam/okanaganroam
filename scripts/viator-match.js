#!/usr/bin/env node
'use strict';
// Viator (2026-11-20): which of our tour and activity businesses also sell on Viator, for Dayton to review. READ-ONLY:
// GET/POST to Viator's Partner API (Basic access) and one GET of our own public /api/venues; it writes only the review
// files below, never the database and never data/.
//
//   1. Our venues: GET <site>/api/venues?types=<types> (sends -A <site>roam-check/1.0), or --venues <file.json>.
//   2. Viator destinations (/destinations): the trip-site.js viator.destinationNames under viator.province.
//      -> drafts/viator-2026-11/destinations-<site>.json (viator-apply.js copies it to data/viator-destinations.json).
//   3. Every product in those destinations (/products/search, 50 a page), plus a /search/freetext for each venue's name.
//   4. Product details (/products/{code}) for the likely ones only (their title names a venue, or the name search found
//      them; at most 6 per venue), for the supplier name. --all-details checks every product instead (slower; Viator
//      asks that /products/{code} is not used to copy the whole catalogue, so keep it for a one-off). Details are kept
//      for 7 days in drafts/viator-2026-11/cache-<site>/ so a re-run does not ask again.
//   5. -> drafts/viator-2026-11/matches-<site>.csv: ok, venue_id, venue_name, viator_product_code, title,
//      supplier_name, confidence (high/medium/low), reason, product_url. Put "ok" in the first column of the rows that
//      are really that business, then run scripts/viator-apply.js.
//
// Usage (the key is read from the environment, never from a file or the command line):
//   read -rs "K?Paste Viator key: " && VIATOR_API_KEY="$K" VIATOR_PARTNER_ID=P00333119 node scripts/viator-match.js --site okanagan; unset K
// Options: --site okanagan|whistler (default from trip-site.js campaign), --base <url>, --types tour,sport,...,
//          --venues <file.json>, --all-details, --out-dir <dir>, --delay <ms> (default 300).

const fs = require('fs');
const path = require('path');
const viator = require('../viator');
const SITE = require('../trip-site.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DETAIL_DAYS = 7;
const PER_VENUE_DETAILS = 6;
const MAX_PER_DEST = 1500;

function parseArgs(argv) {
  const o = { allDetails: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--site') o.site = next();
    else if (a === '--base') o.base = next();
    else if (a === '--types') o.types = next();
    else if (a === '--venues') o.venuesFile = next();
    else if (a === '--out-dir') o.outDir = next();
    else if (a === '--delay') o.delay = Number(next());
    else if (a === '--all-details') o.allDetails = true;
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}

// A Viator call with a pause after it and up to 3 retries on HTTP 429 (Retry-After seconds, else 2/4/8 s).
function makeCaller(opts) {
  const delay = Number.isFinite(opts.delay) ? opts.delay : 300;
  let calls = 0;
  async function call(fn) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let status = 0, retry = null;
      const out = await fn({ fetchImpl: opts.fetchImpl, cfg: opts.cfg, timeoutMs: 60000, onResponse: (res) => { status = res.status; retry = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null; } });
      calls++;
      if (delay) await sleep(delay);
      if (status !== 429) return out;
      const wait = Number(retry) > 0 ? Number(retry) * 1000 : 2000 * 2 ** attempt;
      opts.log(`  429 from Viator, waiting ${Math.round(wait / 1000)} s`);
      await sleep(wait);
    }
    return null;
  }
  call.count = () => calls;
  return call;
}

async function loadVenues(opts) {
  if (opts.venuesFile) return JSON.parse(fs.readFileSync(opts.venuesFile, 'utf8'));
  const url = `${opts.base}/api/venues?types=${encodeURIComponent(opts.types)}&limit=2000`;
  const r = await (opts.siteFetch || fetch)(url, { headers: { 'User-Agent': `${opts.site}roam-check/1.0` } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : j.venues || [];
}

// Destinations named in trip-site.js, inside the province (lookupId holds the province id). -> { found, missing, ... }
function pickDestinations(all, cfg) {
  const norm = (s) => viator.normName(s);
  const prov = all.find((d) => norm(d.name) === norm(cfg.province) && /STATE|PROVINCE|REGION/i.test(String(d.type || ''))) || all.find((d) => norm(d.name) === norm(cfg.province));
  const inProv = (d) => !prov || String(d.lookupId || '').split('.').includes(String(prov.destinationId));
  const found = {}, missing = [];
  for (const name of cfg.destinationNames || []) {
    const d = all.find((x) => norm(x.name) === norm(name) && inProv(x));
    if (d) found[name] = d.destinationId; else missing.push(name);
  }
  const area = found[cfg.area] || null;
  const regions = {};
  for (const [slug, name] of Object.entries(cfg.regionDestinations || {})) if (found[name]) regions[slug] = found[name];
  return { province: prov ? { id: prov.destinationId, name: prov.name } : null, found, missing, area, regions };
}

async function run(opts) {
  const log = opts.log || ((s) => process.stdout.write(`${s}\n`));
  const cfg = opts.cfg || viator.config();
  if (!cfg.enabled) throw new Error('VIATOR_API_KEY and VIATOR_PARTNER_ID must be set (see the usage line at the top).');
  const vcfg = SITE.viator || {};
  const site = opts.site || vcfg.campaign || 'okanagan';
  const outDir = opts.outDir || path.join(__dirname, '..', 'drafts', 'viator-2026-11');
  const cacheDir = path.join(outDir, `cache-${site}`);
  fs.mkdirSync(cacheDir, { recursive: true });
  const call = makeCaller({ ...opts, cfg, log });
  const base = opts.base || (SITE.page && SITE.page.siteUrl) || `https://${site}roam.com`;
  const types = opts.types || 'tour,sport,indoor,outdoor,winery';

  const venues = (await loadVenues({ ...opts, base, types, site })).filter((v) => v && Number.isInteger(v.id) && v.name && !v.redirect_to);
  log(`Our venues (${types}): ${venues.length}`);

  const all = await call((o) => viator.destinations(o));
  if (!all) throw new Error('Could not read Viator destinations (check the key).');
  const dests = pickDestinations(all, vcfg);
  fs.writeFileSync(path.join(outDir, `destinations-${site}.json`), `${JSON.stringify({ fetched_at: new Date().toISOString().slice(0, 10), ...dests }, null, 1)}\n`);
  log(`Destinations: ${Object.entries(dests.found).map(([n, id]) => `${n}=${id}`).join(', ') || 'none'}${dests.missing.length ? ` (not on Viator: ${dests.missing.join(', ')})` : ''}`);
  const destIds = [...new Set(Object.values(dests.found))];
  if (!destIds.length) throw new Error('None of the destinations were found.');

  // Every product in our destinations.
  const products = new Map();
  for (const id of destIds) {
    let start = 1, total = Infinity;
    while (start <= Math.min(total, MAX_PER_DEST)) {
      const page = await call((o) => viator.searchProducts(id, { ...o, start, count: 50 }));
      if (!page) break;
      total = page.total;
      for (const p of page.products) if (p && p.productCode && !products.has(p.productCode)) products.set(p.productCode, { ...p, inArea: true });
      if (!page.products.length) break;
      start += 50;
    }
  }
  log(`Viator products in those destinations: ${products.size}`);

  // A name search per venue (in the area destination, else the first one found).
  const searchDest = dests.area || destIds[0];
  const candidates = new Map(venues.map((v) => [v.id, new Set()]));
  const stop = SITE.areaWords || [];
  for (const v of venues) {
    const r = await call((o) => viator.freetext(v.name, searchDest, { ...o, count: 10 }));
    for (const p of (r && r.products) || []) {
      if (!p || !p.productCode) continue;
      if (!products.has(p.productCode)) products.set(p.productCode, { ...p, inArea: true });
      candidates.get(v.id).add(p.productCode);
    }
    for (const [code, p] of products) if (viator.textMentions(`${p.title || ''} ${p.description || ''}`, v.name, stop)) candidates.get(v.id).add(code);
  }

  // Supplier names from product details.
  const want = new Set();
  if (opts.allDetails) for (const code of products.keys()) want.add(code);
  else for (const v of venues) {
    const list = [...candidates.get(v.id)].sort((a, b) => Number(viator.textMentions(`${products.get(b).title}`, v.name, stop)) - Number(viator.textMentions(`${products.get(a).title}`, v.name, stop)));
    list.slice(0, PER_VENUE_DETAILS).forEach((c) => want.add(c));
  }
  let fetched = 0;
  for (const code of want) {
    const file = path.join(cacheDir, `${code.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
    let d = null;
    try { const st = fs.statSync(file); if (Date.now() - st.mtimeMs < DETAIL_DAYS * 86400000) d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { d = null; }
    if (!d) {
      d = await call((o) => viator.productDetails(code, o));
      fetched++;
      if (d) fs.writeFileSync(file, JSON.stringify({ productCode: d.productCode, status: d.status, title: d.title, supplier: d.supplier || null, productUrl: d.productUrl || null, destinations: d.destinations || [] }));
    }
    if (!d) continue;
    const p = products.get(code);
    p.supplierName = (d.supplier && d.supplier.name) || '';
    if (d.productUrl) p.productUrl = d.productUrl;
    if (d.status && d.status !== 'ACTIVE') p.inactive = true;
  }
  log(`Product details: ${want.size} checked (${fetched} new calls)`);

  const detailed = [...products.values()].filter((p) => p.supplierName && !p.inactive);
  const rows = [];
  for (const v of venues) {
    const pool = new Map(detailed.map((p) => [p.productCode, p]));
    for (const c of candidates.get(v.id)) if (!products.get(c).inactive) pool.set(c, products.get(c));
    rows.push(...viator.matchVenue(v, [...pool.values()], stop));
  }
  rows.sort((a, b) => a.venueName.localeCompare(b.venueName) || 0);
  const csvFile = path.join(outDir, `matches-${site}.csv`);
  fs.writeFileSync(csvFile, viator.matchesCsv(rows));
  const by = (c) => rows.filter((r) => r.confidence === c).length;
  log(`Matches: ${rows.length} rows for ${new Set(rows.map((r) => r.venueId)).size} venues (high ${by('high')}, medium ${by('medium')}, low ${by('low')}); ${call.count()} Viator calls.`);
  log(`Review: ${csvFile}\nMark the right rows "ok" in the first column, then run: node scripts/viator-apply.js --site ${site}`);
  return { rows, dests, csvFile, calls: call.count() };
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 24).join('\n')); process.exit(0); }
  run(opts).catch((e) => { console.error(`viator-match: ${e.message}`); process.exit(1); });
}

module.exports = { run, parseArgs, pickDestinations, makeCaller };
