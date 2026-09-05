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

module.exports = db;
