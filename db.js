const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH = path.join(DB_DIR, 'okanagan.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  type TEXT NOT NULL,
  cuisine TEXT,
  phone TEXT,
  price INTEGER,
  reviews INTEGER,
  rating REAL,
  description TEXT,
  dog_friendly INTEGER DEFAULT 0,
  vegan INTEGER DEFAULT 0,
  vegetarian INTEGER DEFAULT 0,
  patio INTEGER DEFAULT 0,
  kid_friendly INTEGER DEFAULT 0,
  gluten_free INTEGER DEFAULT 0,
  lake_view INTEGER DEFAULT 0,
  nonalcoholic INTEGER DEFAULT 0,
  sports_tv INTEGER DEFAULT 0,
  live_music INTEGER DEFAULT 0,
  great_groups INTEGER DEFAULT 0,
  happy_hour INTEGER DEFAULT 0,
  hours TEXT,
  description_fr TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_region ON venues(region);
CREATE INDEX IF NOT EXISTS idx_type ON venues(type);
`);

// --- SEO architecture migration (additive, nullable, non-breaking) ---
// Each ADD COLUMN is wrapped individually so re-running this on a DB that
// already has some/all of these columns is always safe (SQLite has no
// native "ADD COLUMN IF NOT EXISTS", so we check pragma table_info first).
const existingCols = db.prepare(`PRAGMA table_info(venues)`).all().map((c) => c.name);
const newColumns = [
  ['address', 'TEXT'],
  ['website', 'TEXT'],
  ['image_url', 'TEXT'],
  ['slug', 'TEXT'],
  ['latitude', 'REAL'],
  ['longitude', 'REAL'],
];
for (const [col, type] of newColumns) {
  if (!existingCols.includes(col)) {
    db.exec(`ALTER TABLE venues ADD COLUMN ${col} ${type}`);
  }
}
// The old index enforced slug uniqueness GLOBALLY across the whole table.
// That was wrong: slugs only need to be unique *within* a region+category,
// because the URL scheme is /region/category/slug — a chain venue with
// locations in two different regions (e.g. "Cactus Club Café" in both
// Kelowna and Vernon) legitimately produces the same base slug in each,
// and that's fine, since the region+category prefix disambiguates the URL.
//
// Safety ordering: create the new composite index FIRST, verify with a
// direct read against sqlite_master that it actually exists, and only
// THEN drop the old global index. This way, if anything ever went wrong
// between these two statements, the database is left with the (overly
// strict but still safe) old index rather than no unique constraint at
// all. Dropping an index only removes a lookup structure, never any row
// data, so this remains safe to run against a database that already has
// the old (incorrectly-scoped) index from a prior deploy attempt — and
// the whole sequence is idempotent (every statement is IF [NOT] EXISTS,
// and the verification check is a plain read).
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_region_type_slug ON venues(region, type, slug)`);

const newIndexExists = !!db
  .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_region_type_slug'`)
  .get();

if (newIndexExists) {
  db.exec(`DROP INDEX IF EXISTS idx_slug`);
} else {
  // Should be unreachable (the CREATE above would throw first if it
  // failed), but if it somehow happened, refuse to drop the old
  // constraint rather than leave the table with no unique index at all.
  console.error('[seo] WARNING: idx_region_type_slug was not found after attempting to create it — leaving the old idx_slug in place rather than dropping it unverified.');
}

// --- Phase 2.2: enrichment infrastructure (additive only) ---
// These four tables exist purely as future-facing infrastructure. Nothing
// in the running application reads from or writes to them yet — no
// routes, no enrichment logic, no automation. Creating them here (at the
// same module-load point as every other schema statement above, which has
// been safe in every deploy so far) does not touch the `venues` table in
// any way: no ALTER, no UPDATE, no data migration. Each statement is
// idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running this on a
// database that already has some or all of these tables is always safe.

db.exec(`
CREATE TABLE IF NOT EXISTS venue_enrichment_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL,
  source_ref TEXT,
  confidence TEXT NOT NULL,
  batch_id TEXT,
  auto_accepted INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_venue ON venue_enrichment_log(venue_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_batch ON venue_enrichment_log(batch_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS venue_attribute_status (
  venue_id INTEGER NOT NULL,
  attribute TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  confidence TEXT,
  source TEXT,
  verified_at TEXT,
  PRIMARY KEY (venue_id, attribute)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS enrichment_batches (
  batch_id TEXT PRIMARY KEY,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  venue_count INTEGER,
  source TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS venue_source_mapping (
  venue_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  last_checked TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (venue_id, source)
);
`);
// PRIMARY KEY (venue_id, source): one venue can be mapped to at most one
// identity per external source, but can independently hold mappings to
// several different sources over time. Critically, this is scoped per
// venue_id (our own internal row id) — so two rows that happen to share a
// name (e.g. "Cactus Club Café" in Kelowna and in Vernon) each get their
// own completely independent row here, mapped to their own distinct
// external identity. Nothing about this table can conflate two locations
// of the same chain, because venue_id is never shared between them.

module.exports = db;
