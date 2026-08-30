const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// In production this is mounted to a Railway persistent volume so the
// database survives redeploys. Locally (no /data directory) it falls back
// to sitting alongside the backend code, unchanged from before.
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
    hours TEXT,
    description_fr TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_region ON venues(region);
  CREATE INDEX IF NOT EXISTS idx_type ON venues(type);
`);

// Migration for existing databases created before great_groups/hours/description_fr
// existed — CREATE TABLE IF NOT EXISTS above only applies to brand new databases,
// so an already-existing venues table needs the columns added directly.
try {
  db.exec('ALTER TABLE venues ADD COLUMN great_groups INTEGER DEFAULT 0');
} catch (err) {
  // Column already exists — expected on every restart after the first.
}
try {
  db.exec('ALTER TABLE venues ADD COLUMN hours TEXT');
} catch (err) {
  // Column already exists — expected on every restart after the first.
}
try {
  db.exec('ALTER TABLE venues ADD COLUMN description_fr TEXT');
} catch (err) {
  // Column already exists — expected on every restart after the first.
}

// Seed from committed seed-data.json if the table is empty. This runs on
// every startup but is a no-op once data exists — it exists so that a fresh
// deploy (or a redeploy without a persistent volume) still comes up with
// the real 810-venue dataset instead of an empty database.
try {
  const row = db.prepare('SELECT COUNT(*) AS n FROM venues').get();
  if (row.n === 0) {
    const seedPath = path.join(__dirname, 'seed-data.json');
    if (fs.existsSync(seedPath)) {
      const venues = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      const insert = db.prepare(`
        INSERT INTO venues (
          name, region, type, cuisine, phone, price, reviews, rating, description,
          dog_friendly, vegan, vegetarian, patio, kid_friendly, gluten_free, lake_view,
          nonalcoholic, sports_tv, live_music, great_groups, hours, description_fr
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);
      for (const v of venues) {
        insert.run(
          v.name, v.region, v.type, v.cuisine ?? null, v.phone ?? null,
          v.price ?? null, v.reviews ?? null, v.rating ?? null, v.description ?? null,
          v.dog_friendly ? 1 : 0, v.vegan ? 1 : 0, v.vegetarian ? 1 : 0, v.patio ? 1 : 0,
          v.kid_friendly ? 1 : 0, v.gluten_free ? 1 : 0, v.lake_view ? 1 : 0,
          v.nonalcoholic ? 1 : 0, v.sports_tv ? 1 : 0, v.live_music ? 1 : 0,
          v.great_groups ? 1 : 0, v.hours ?? null, v.description_fr ?? null
        );
      }
      console.log(`Seeded ${venues.length} venues from seed-data.json`);
    }
  }
} catch (err) {
  console.error('Seed step failed (continuing with whatever data exists):', err.message);
}

module.exports = db;
