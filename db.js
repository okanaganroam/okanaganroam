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
// Unique index on slug (nullable — many rows can be NULL simultaneously in
// SQLite since NULL never equals NULL, so this is safe before the backfill
// below runs, and stays correct after every row has a real slug).
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_slug ON venues(slug)`);

module.exports = db;
