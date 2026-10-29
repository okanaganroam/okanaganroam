#!/usr/bin/env node
// Merge the venue-photo batches in data/photos/ into the site's data files and one apply batch:
//   node scripts/merge-photo-batches.js            # report only
//   node scripts/merge-photo-batches.js --write [--only=b1,b2] [--date=2026-10-24]   # merge credits + sources, write data/venue-photos-<date>.json
// Then: OKR_BASE_URL=http://localhost:3779 ENRICHMENT_ADMIN_TOKEN=... node scripts/apply-venue-updates.js data/venue-photos-2026-10-22.json --apply
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const DIR = path.join(ROOT, 'data', 'photos');
const WRITE = process.argv.includes('--write');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
// --date=YYYY-MM-DD names the output files and batch id (default: the first run, 2026-10-22).
const DATE = (process.argv.find((a) => a.startsWith('--date=')) || '').slice(7) || '2026-10-22';
const DATE_LABEL = new Date(DATE.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const files = fs.readdirSync(DIR);
const pick = (prefix) => files.filter((f) => f.startsWith(prefix) && f.endsWith('.json')).filter((f) => !only.length || only.some((b) => f === `${prefix}${b}.json`));
const venues = []; const credits = {}; const sources = []; const none = []; const problems = [];
for (const f of pick('batch-')) for (const v of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).venues || []) {
  const file = String(v.set && v.set.image_url || '').split('?')[0];
  if (!file || !fs.existsSync(path.join(ROOT, 'public', file))) problems.push(`${f}: #${v.id} ${v.name}: file missing ${file}`);
  for (const suf of ['-w480', '-w960']) if (file && !fs.existsSync(path.join(ROOT, 'public', file.replace(/\.jpg$/, `${suf}.jpg`)))) problems.push(`${f}: #${v.id} ${v.name}: ${suf} copy missing`);
  venues.push({ ...v, batch: f.replace(/^batch-|\.json$/g, '') });
}
for (const f of pick('credits-')) Object.assign(credits, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
for (const f of pick('sources-')) sources.push(...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
for (const f of pick('none-')) none.push(...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const ids = new Map(); for (const v of venues) { if (ids.has(v.id)) problems.push(`#${v.id} ${v.name} appears in ${ids.get(v.id)} and ${v.batch}`); ids.set(v.id, v.batch); }
for (const v of venues) { const file = String(v.set.image_url).split('?')[0]; if (!credits[file]) problems.push(`#${v.id} ${v.name}: no credit for ${file}`); }
console.log(`${venues.length} photos in ${pick('batch-').length} batches, ${none.length} without, ${Object.keys(credits).length} credits, ${sources.length} sources, ${problems.length} problems`);
for (const p of problems) console.log('  ' + p);
if (WRITE) {
  if (problems.length) { console.log('not writing: fix the problems first'); process.exit(1); }
  const credPath = path.join(ROOT, 'data', 'venue-photo-credits.json');
  const existing = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  fs.writeFileSync(credPath, JSON.stringify({ ...existing, ...credits }, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', `venue-photo-sources-${DATE}.json`), JSON.stringify(sources, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', `venue-photos-${DATE}.json`), JSON.stringify({ reason: `Venue photos, ${DATE_LABEL} run`, batch_id: `venue-photos-${DATE}`, venues: venues.map(({ batch, ...v }) => v) }, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'data', `venue-photos-none-${DATE}.json`), JSON.stringify(none, null, 1) + '\n');
  console.log(`written: data/venue-photo-credits.json (merged), data/venue-photo-sources-${DATE}.json, data/venue-photos-${DATE}.json, data/venue-photos-none-${DATE}.json`);
}
