#!/usr/bin/env node
// Badge guide intros (2026-10-27): renders the intro of every INDEXABLE /guide/<town>/<badge> page (the same list the
// sitemap uses: listGuideCombos(MIN_INDEXABLE_GUIDE_VENUES)) and reports how alike they are -- pairwise word 3-gram
// Jaccard and sentences repeated word for word across pages. Warns when two pages share more than 33% of their
// 3-grams or a whole sentence.
//
// Data: the repo okanagan.db is a partial copy (no hours, happy hours, specials or collections), so this builds a
// THROWAWAY database. With a full venue snapshot it uses real data:
//   --drafts <dir>         the drafts folder (default: ./drafts, then the main checkout's drafts); reads
//                          claims-2026-10-25/venues-snapshot.json (venues, badges, hours, ratings),
//                          happy-hour-2026-10/approved.json (happy hour times), data-2026-10-26-hh-deals/deals-apply.json,
//                          data-2026-10-26-specials/{specials,valley-specials}-apply.json,
//                          data-2026-10-27-weekly-nights/nights-apply.json
//   --collections <file>   { lf: { ids, notes }, hg: { ids, notes }, dog: { ids, notes } } read from the live
//                          Local Favourites, Hidden Gems and Dog-Friendly pages (optional)
//   --json <file>          write every intro (EN + FR) and the numbers to a JSON file
//   --fixtures             ignore the snapshot and use generated fixtures
// The real okanagan.db is moved aside first and put back at the end; run `git checkout -q okanagan.db` afterwards
// anyway. Never run against the live site's database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'okanagan.db');
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const THRESHOLD = 0.33;

const draftsDir = [arg('--drafts'), path.join(ROOT, 'drafts'), path.resolve(ROOT, '..', '..', '..', 'drafts')].find((d) => d && fs.existsSync(path.join(d, 'claims-2026-10-25', 'venues-snapshot.json')));
const useSnapshot = !args.includes('--fixtures') && !!draftsDir;
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };

// Move the real database aside; the server creates a fresh one.
const backup = `${DB_FILE}.uniqueness-backup`;
if (fs.existsSync(DB_FILE)) fs.renameSync(DB_FILE, backup);
const restore = () => { try { if (fs.existsSync(backup)) { if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE); fs.renameSync(backup, DB_FILE); } } catch (e) { console.error('restore failed:', e.message); } };
process.on('exit', restore);

const app = require('../server.js');
const db = require('../db.js');
const today = app.todayLocal();
const sources = [];

function insertVenue(v) {
  const cols = db.prepare('PRAGMA table_info(venues)').all().map((c) => c.name);
  const keys = Object.keys(v).filter((k) => cols.includes(k) && v[k] !== undefined);
  db.prepare(`INSERT INTO venues (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => (typeof v[k] === 'boolean' ? (v[k] ? 1 : 0) : v[k])));
}
function addCollection(kind, ids, notes = {}) {
  const c = db.prepare('INSERT INTO collections (slug, kind, title) VALUES (?, ?, ?)').run(`${kind}-u`, kind, kind);
  const exists = db.prepare('SELECT 1 FROM venues WHERE id = ?');
  for (const id of ids) if (exists.get(id)) db.prepare('INSERT INTO collection_items (collection_id, content_type, content_id, note) VALUES (?, ?, ?, ?)').run(c.lastInsertRowid, 'venue', id, notes[id] || null);
  // Public notes are those logged under a public batch (getPublicCollectionNotes).
  for (const id of ids) if (exists.get(id) && notes[id]) db.prepare("INSERT INTO venue_enrichment_log (venue_id, field_name, old_value, new_value, source, confidence, batch_id) VALUES (?, ?, NULL, 'member', 'uniqueness', 'high', 'public-notes-2026-10')").run(id, `collection:${kind}`);
}

if (useSnapshot) {
  const snap = readJson(path.join(draftsDir, 'claims-2026-10-25', 'venues-snapshot.json'));
  const venues = Array.isArray(snap) ? snap : (snap.venues || snap.data || Object.values(snap));
  db.exec('BEGIN');
  for (const v of venues) insertVenue({ ...v, hours: v.hours && typeof v.hours === 'object' ? JSON.stringify(v.hours) : v.hours });
  db.exec('COMMIT');
  sources.push(`venues, badges, hours, ratings: drafts/claims-2026-10-25/venues-snapshot.json (${venues.length} venues, live API copy of Oct 25)`);
  const hh = readJson(path.join(draftsDir, 'happy-hour-2026-10', 'approved.json')) || [];
  let n = 0;
  for (const r of hh) if (r.hours) n += db.prepare('UPDATE venues SET happy_hour_times = ?, happy_hour_source = ?, happy_hour_checked_at = ? WHERE id = ?').run(JSON.stringify(r.hours), r.source_url || 'x', today, r.id).changes;
  sources.push(`happy hour times: drafts/happy-hour-2026-10/approved.json (${n} venues; the live site has more since)`);
  const deals = readJson(path.join(draftsDir, 'data-2026-10-26-hh-deals', 'deals-apply.json')) || [];
  n = 0;
  for (const r of deals) if (r.deals) n += db.prepare('UPDATE venues SET happy_hour_deals = ?, happy_hour_deals_source = ?, happy_hour_deals_checked_at = ? WHERE id = ?').run(JSON.stringify(r.deals), r.source_url || 'x', today, r.id).changes;
  sources.push(`happy hour deals: drafts/data-2026-10-26-hh-deals/deals-apply.json (${n} venues)`);
  n = 0;
  for (const f of ['specials-apply.json', 'valley-specials-apply.json']) {
    for (const r of readJson(path.join(draftsDir, 'data-2026-10-26-specials', f)) || []) {
      for (const s of r.specials || []) {
        try { db.prepare('INSERT INTO venue_specials (venue_id, days, title, deal, price, kind, source, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, JSON.stringify(s.days || []), s.title, s.deal || s.title, s.price || null, s.kind || 'food', r.source_url || 'x', today); n++; } catch (e) { /* venue not in snapshot */ }
      }
    }
  }
  sources.push(`weekly specials: drafts/data-2026-10-26-specials (${n} specials)`);
  n = 0;
  for (const r of readJson(path.join(draftsDir, 'data-2026-10-27-weekly-nights', 'nights-apply.json')) || []) {
    for (const s of r.nights || []) {
      try { db.prepare('INSERT INTO venue_weekly_nights (venue_id, days, kind, title, source, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(r.id, JSON.stringify(s.days || []), s.kind, s.title, s.source || 'x', today); n++; } catch (e) { /* venue not in snapshot */ }
    }
  }
  sources.push(`weekly nights: drafts/data-2026-10-27-weekly-nights/nights-apply.json (${n} nights)`);
  const col = arg('--collections') ? readJson(arg('--collections')) : null;
  if (col) {
    addCollection('local_favorite', col.lf.ids, col.lf.notes);
    addCollection('hidden_gem', col.hg.ids, col.hg.notes);
    addCollection('dog_policy', Object.keys(col.dog.notes).map(Number), col.dog.notes);
    sources.push(`Local Favourites (${col.lf.ids.length}), Hidden Gems (${col.hg.ids.length}) and dog rules (${Object.keys(col.dog.notes).length}): read from the live /local-favorites, /hidden-gems and /dog-friendly pages on ${today}`);
  } else sources.push('collections: none (no --collections file), so standouts fall back to top-rated');
  sources.push('menu links and seasons: not in the snapshot (0 here; the live site has them)');
} else {
  // Fixtures: four towns with different mixes, enough to clear the index threshold.
  const towns = { kelowna: 34, penticton: 22, vernon: 15, 'west-kelowna': 12 };
  const types = ['restaurant', 'pub', 'brewery', 'winery', 'cafe', 'cocktail'];
  let id = 0;
  const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const [region, count] of Object.entries(towns)) {
    for (let i = 0; i < count; i++) {
      id++;
      const t = types[(i * 7 + region.length) % types.length];
      const open = `${String(6 + (i % 5)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
      const close = `${String(20 + (i % 6)).padStart(2, '0')}:00`;
      app.createVenue({ name: `${region} fixture ${i}`, slug: `uq-${region}-${i}`, region, type: t, rating: 3.8 + (i % 12) / 10, reviews: 15 + i * 13, latitude: 49.8 + id / 1000, longitude: -119.5,
        description: `A fixture ${t} in ${region}, used only by the uniqueness script.`, hours: JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [[open, close]]]))),
        patio: i % 2 === 0, happy_hour: i % 3 !== 2, dog_friendly: i % 3 === 0, kid_friendly: i % 4 !== 3, lake_view: i % 5 === 0, live_music: i % 4 === 0, great_groups: i % 2 === 1 });
    }
  }
  sources.push(`fixtures: ${id} generated venues in 4 towns (${args.includes("--fixtures") ? "--fixtures" : "no snapshot found"})`);
}

// Render every indexable page.
const combos = app.listGuideCombos(app.MIN_INDEXABLE_GUIDE_VENUES);
const pages = [];
for (const c of combos) {
  const rows = db.prepare(`SELECT * FROM venues WHERE region = ? AND ${c.badge} = 1 AND redirect_to IS NULL ORDER BY reviews DESC`).all(c.region);
  const venues = rows.map(app.rowToVenue);
  const facts = app.guideIntroFacts(c.badge, venues);
  const en = app.guideIntroFor(c.region, c.badge, venues, 'en', new Date(), facts);
  const fr = app.guideIntroFor(c.region, c.badge, venues, 'fr', new Date(), facts);
  // Before: the one-line badge intro with the town swapped in, and the meta it made.
  const before = app.guideBadgeHeading(c.region, c.badge).intro;
  pages.push({ path: `/guide/${c.region}/${c.badge}`, n: venues.length, before, en: en ? en.text : null, fr: fr ? fr.text : null, meta: en ? en.meta : null, metaFr: fr ? fr.meta : null, keys: en ? en.keys : [] });
}

const words = (t) => String(t || '').toLowerCase().replace(/[“”"«»(),:;.!?]/g, ' ').split(/\s+/).filter(Boolean);
const grams = (t) => { const w = words(t), s = new Set(); for (let i = 0; i + 2 < w.length; i++) s.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`); return s; };
const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/).map((s) => s.trim()).filter(Boolean);
function report(lang) {
  const list = pages.filter((p) => p[lang]);
  const g = list.map((p) => grams(p[lang]));
  const pairs = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    let inter = 0; for (const x of g[i]) if (g[j].has(x)) inter++;
    const union = g[i].size + g[j].size - inter;
    pairs.push({ a: list[i].path, b: list[j].path, j: union ? inter / union : 0 });
  }
  pairs.sort((a, b) => b.j - a.j);
  const vals = pairs.map((p) => p.j);
  const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
  const p95 = vals.length ? vals.slice().sort((a, b) => a - b)[Math.floor(vals.length * 0.95)] : 0;
  const seen = new Map();
  for (const p of list) for (const s of sentences(p[lang])) { if (!seen.has(s)) seen.set(s, new Set()); seen.get(s).add(p.path); }
  const repeated = [...seen.entries()].filter(([, set]) => set.size > 1).map(([s, set]) => ({ sentence: s, pages: [...set] }));
  return { lang, pages: list.length, pairs: pairs.length, max: vals[0] || 0, mean, p95, over: pairs.filter((p) => p.j > THRESHOLD), top: pairs.slice(0, 5), repeated };
}
const out = { generated: new Date().toISOString(), sources, threshold: THRESHOLD, indexable: combos.length, withIntro: pages.filter((p) => p.en).length, before: report('before'), en: report('en'), fr: report('fr'), pages };
const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`Data:\n  - ${sources.join('\n  - ')}`);
console.log(`Indexable town + badge pages: ${out.indexable}; with a data intro: ${out.withIntro} (the rest keep the one-line badge intro)`);
const b = out.before;
console.log(`\n[before: one-line badge intros] ${b.pages} intros: 3-gram Jaccard max ${pct(b.max)}, mean ${pct(b.mean)}, p95 ${pct(b.p95)}; pairs over ${pct(THRESHOLD)}: ${b.over.length} of ${b.pairs}; sentences repeated across pages: ${b.repeated.length}`);
for (const r of [out.en, out.fr]) {
  console.log(`\n[${r.lang}] ${r.pages} intros, ${r.pairs} pairs: 3-gram Jaccard max ${pct(r.max)}, mean ${pct(r.mean)}, p95 ${pct(r.p95)}; pairs over ${pct(THRESHOLD)}: ${r.over.length}; sentences repeated across pages: ${r.repeated.length}`);
  for (const p of r.top) console.log(`  ${pct(p.j)}  ${p.a}  ~  ${p.b}`);
  for (const p of r.over) console.log(`  WARN over ${pct(THRESHOLD)}: ${p.a} ~ ${p.b} (${pct(p.j)})`);
  for (const x of r.repeated) console.log(`  WARN repeated sentence (${x.pages.length} pages): "${x.sentence}" -- ${x.pages.slice(0, 4).join(', ')}`);
}
const metaLong = pages.filter((p) => p.meta && p.meta.length > 155);
console.log(`\nMeta descriptions over 155 characters: ${metaLong.length}`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(out, null, 2));
db.close && db.close();
