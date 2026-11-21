#!/usr/bin/env node
'use strict';
// Viator (2026-11-20): turns the rows Dayton marked "ok" in drafts/viator-2026-11/matches-<site>.csv (made by
// scripts/viator-match.js) into data/viator-matches.json, and copies drafts/viator-2026-11/destinations-<site>.json to
// data/viator-destinations.json. No API key, no network, no database: commit the two data files and the site reads them
// at start ("Also bookable on Viator" on those venues' pages; Build My Trip suggestions use the destinations).
//
// Usage: node scripts/viator-apply.js --site okanagan [--csv <file>] [--dests <file>] [--data-dir <dir>]
// A venue gets one product (the first "ok" row); extra ok rows for it are listed and left out. Only rows marked ok count:
// a venue not marked is not linked (re-running replaces the whole file, so un-marking a row removes the link).

const fs = require('fs');
const path = require('path');
const viator = require('../viator');
const SITE = require('../trip-site.js');

function run(opts = {}) {
  const log = opts.log || ((s) => process.stdout.write(`${s}\n`));
  const site = opts.site || (SITE.viator && SITE.viator.campaign) || 'okanagan';
  const drafts = path.join(__dirname, '..', 'drafts', 'viator-2026-11');
  const csvFile = opts.csv || path.join(drafts, `matches-${site}.csv`);
  const destFile = opts.dests || path.join(drafts, `destinations-${site}.json`);
  const dataDir = opts.dataDir || path.join(__dirname, '..', 'data');
  const rows = viator.parseCsv(fs.readFileSync(csvFile, 'utf8'));
  const missingCols = viator.MATCH_COLUMNS.filter((c) => rows.length && !(c in rows[0]));
  if (missingCols.length) throw new Error(`${csvFile} is missing columns: ${missingCols.join(', ')}`);
  const { venues, skipped } = viator.approvedMatches(rows, opts.today);
  const out = { updated: opts.today || new Date().toISOString().slice(0, 10), source: path.basename(csvFile), how: 'scripts/viator-match.js then rows marked ok by Dayton, applied by scripts/viator-apply.js', venues };
  fs.writeFileSync(path.join(dataDir, 'viator-matches.json'), `${JSON.stringify(out, null, 1)}\n`);
  log(`data/viator-matches.json: ${Object.keys(venues).length} venues linked to Viator.`);
  for (const s of skipped) log(`  left out: ${s.row.venue_name || s.row.venue_id} ${s.row.viator_product_code || ''} (${s.why})`);
  if (fs.existsSync(destFile)) {
    const d = JSON.parse(fs.readFileSync(destFile, 'utf8'));
    const dest = { fetched_at: d.fetched_at || null, province: d.province || null, area: Number.isInteger(d.area) ? d.area : null, regions: d.regions || {}, found: d.found || {} };
    fs.writeFileSync(path.join(dataDir, 'viator-destinations.json'), `${JSON.stringify(dest, null, 1)}\n`);
    log(`data/viator-destinations.json: area ${dest.area || 'none'}, ${Object.keys(dest.regions).length} towns.`);
  } else log(`No ${destFile}: data/viator-destinations.json not changed (Build My Trip suggestions need it).`);
  return { venues, skipped };
}

if (require.main === module) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  try { run({ site: get('--site'), csv: get('--csv'), dests: get('--dests'), dataDir: get('--data-dir') }); } catch (e) { console.error(`viator-apply: ${e.message}`); process.exit(1); }
}

module.exports = { run };
