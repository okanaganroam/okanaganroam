const fs = require('fs');
const path = require('path');
const db = require('./db');

const venues = JSON.parse(fs.readFileSync(path.join(__dirname, 'venues.json'), 'utf-8'));

db.exec('DELETE FROM venues');

const insert = db.prepare(`
  INSERT INTO venues (
    name, region, type, cuisine, phone, price, reviews, rating, description,
    dog_friendly, vegan, vegetarian, patio, kid_friendly, gluten_free,
    lake_view, nonalcoholic, sports_tv, live_music
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const insertMany = db.transaction ? null : null; // node:sqlite doesn't expose .transaction; wrap manually

db.exec('BEGIN');
try {
  for (const v of venues) {
    insert.run(
      v.name, v.region, v.type, v.cuisine, v.phone, v.price, v.reviews, v.rating, v.description,
      v.dog_friendly ? 1 : 0,
      v.vegan ? 1 : 0,
      v.vegetarian ? 1 : 0,
      v.patio ? 1 : 0,
      v.kid_friendly ? 1 : 0,
      v.gluten_free ? 1 : 0,
      v.lake_view ? 1 : 0,
      v.nonalcoholic ? 1 : 0,
      v.sports_tv ? 1 : 0,
      v.live_music ? 1 : 0
    );
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

const count = db.prepare('SELECT COUNT(*) AS n FROM venues').get();
console.log(`Seeded ${count.n} venues into okanagan.db`);
