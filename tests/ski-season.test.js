// Ski hill pages (2026-10-29): a "Season at a glance" box (the 2026/27 season line by date, the drive, the mountain,
// and links to the hill's snow report, webcams, lift tickets and trail map), and category tiles that show the hill's
// own listing photos instead of the valley-wide category art. Runs on a throwaway database; run
// `git checkout -q okanagan.db` after.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');

test('ski season: the season line follows the date', () => {
  const bw = app.SKI_RESORT_SEASON['big-white'];
  assert.match(app.skiSeasonLine(bw, '2026-10-29'), /^Opens Thursday, November 26/);
  assert.equal(app.skiSeasonLine(bw, '2026-11-26'), 'Open for the season until Sunday, April 4, 2027.');
  assert.equal(app.skiSeasonLine(bw, '2027-04-05'), null, 'past the season, no stale line');
  const apex = app.SKI_RESORT_SEASON.apex;
  assert.match(app.skiSeasonLine(apex, '2026-12-20'), /hasn’t been announced/);
  assert.equal(app.skiSeasonLine(apex, '2027-05-01'), null);
});

test('ski season: the box on the four hills, and nowhere else', () => {
  const html = app.skiSeasonBoxHtml('big-white', '2026-10-29');
  assert.match(html, /Season at a glance/);
  assert.match(html, /Under an hour from Kelowna/);
  for (const label of ['Snow report', 'Webcams', 'Lift tickets', 'Trail map']) assert.ok(html.includes(`>${label}</a>`), label);
  assert.match(html, /href="https:\/\/www\.bigwhite\.com\/mountain-conditions\/daily-snow-report" target="_blank" rel="noopener"/);
  assert.ok(!app.skiSeasonBoxHtml('apex', '2026-10-29').includes('Trail map'), 'no trail map link where the hill has no current one');
  assert.equal(app.skiSeasonBoxHtml('kelowna'), '');
  assert.match(app.renderRegionPage('baldy', app.getRegionCategoryCounts('baldy'), []), /class="ski-season"/);
  assert.ok(!app.renderRegionPage('kelowna', app.getRegionCategoryCounts('kelowna'), []).includes('class="ski-season"'));
});

test('ski season: every line in the box has its French', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'ski-season-2026-10-29.json'), 'utf8'));
  const lines = ['Season at a glance', 'Season', 'Getting there', 'The mountain', 'Snow report', 'Webcams', 'Lift tickets', 'Trail map'];
  for (const f of Object.values(app.SKI_RESORT_SEASON)) lines.push(...[f.before, f.during, f.drive, f.mountain].filter(Boolean));
  for (const l of lines) assert.ok(fr[l], `French for: ${l}`);
});

test('ski season: category tiles show the hill’s own photos, winter first', () => {
  const add = (name, type, img) => db.prepare(`INSERT INTO venues (name, region, type, slug, description, image_url)
    VALUES (?, 'apex', ?, ?, 'A fixture listing for the ski tile tests.', ?)`).run(name, type, app.slugify(name), img);
  add('Tile Test Grill', 'restaurant', '/images/venues/tile-test-grill.jpg');
  add('Tile Test Grill Two', 'restaurant', '/images/venues/tile-test-grill-two.jpg');
  add('Tile Test Summer Hiking Trail', 'outdoor', '/images/hiking/venues/tile-test-summer.jpg');
  add('Tile Test Snowshoe Loop', 'outdoor', '/images/hiking/venues/tile-test-snowshoe.jpg');
  add('Tile Test Snowshoe Meadow', 'outdoor', '/images/hiking/venues/tile-test-meadow.jpg');
  const html = app.renderRegionPage('apex', app.getRegionCategoryCounts('apex'), []);
  const tile = (label) => (new RegExp(`>${label}</a></h3>[\\s\\S]*?<img src="([^"]+)"`).exec(html) || [])[1];
  assert.match(tile('Restaurants'), /tile-test-grill/);
  assert.match(tile('Outdoor Destinations'), /tile-test-(snowshoe|meadow)/, 'a winter listing, not the summer trail');
  assert.ok(!html.includes('/images/food-drink/thumbs/restaurants'), 'not the valley-wide restaurant art');
  // A town page keeps the shared category art.
  db.prepare(`INSERT INTO venues (name, region, type, slug, description, image_url) VALUES ('Tile Test Town Grill', 'kelowna', 'restaurant', 'tile-test-town-grill', 'A fixture.', '/images/venues/tile-test-town.jpg'), ('Tile Test Town Grill 2', 'kelowna', 'restaurant', 'tile-test-town-grill-2', 'A fixture.', '/images/venues/tile-test-town2.jpg')`).run();
  assert.match(app.renderRegionPage('kelowna', app.getRegionCategoryCounts('kelowna'), []), /\/images\/food-drink\/thumbs\/restaurants/);
});
