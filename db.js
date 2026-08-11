const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'okanagan.db');
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_region ON venues(region);
  CREATE INDEX IF NOT EXISTS idx_type ON venues(type);
`);

module.exports = db;
