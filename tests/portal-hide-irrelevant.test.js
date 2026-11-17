// Business portal (2026-11-08): beaches, outdoor places and shops are not offered the storefront ("find your door") tile
// or section, and beaches and shops are not offered dietary / patio badges. Cafes, wineries, pubs, restaurants and tours
// must look exactly as before. Badges an owner has already set stay visible.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'hide-irrelevant-admin-token';
const app = require('../server.js');

const FOOD_BADGES = ['vegan', 'vegetarian', 'gluten_free', 'nonalcoholic', 'sports_tv'];
const badgeVisible = (html, badge) => new RegExp(`<label class="amenity-check"><input type="checkbox" name="badge" value="${badge}"`).test(html);
const hasArrival = (html) => /data-pick="arrival"/.test(html) || /id="arrival"/.test(html);

test('map: only beach, outdoor and shop lose the storefront tile', () => {
  for (const t of ['beach', 'outdoor', 'shop']) assert.equal(app.portalFields(t).arrivalTile, false, t);
  for (const t of Object.keys(app.CATEGORY_SLUGS).filter((x) => !['beach', 'outdoor', 'shop'].includes(x))) assert.equal(app.portalFields(t).arrivalTile, true, t);
  assert.equal(app.portalFields('a-type-added-later').arrivalTile, true);
});

test('owner page: what each category sees', async () => {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const cache = {};
  const page = async (type) => cache[type] || (cache[type] = await build(type));
  const build = async (type) => {
    const v = app.createVenue({ name: `Hide Fixture ${type}`, slug: `hide-fixture-${type}`, region: 'kelowna', type, latitude: 49.9, longitude: -119.4, rating: 4.2, description: 'Fixture.' });
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    return fetch(`http://127.0.0.1:${srv.address().port}/owner/${token}`).then((r) => r.text());
  };
  try {
    for (const t of ['cafe', 'winery', 'pub', 'restaurant', 'brewery', 'tour', 'golf']) {
      const html = await page(t);
      assert.ok(hasArrival(html), `${t} still has the storefront tile and section`);
      assert.ok(badgeVisible(html, 'patio'), `${t} still offers patio`);
    }
    for (const t of ['beach', 'outdoor', 'shop']) {
      const html = await page(t);
      assert.ok(!hasArrival(html), `${t} has no storefront tile or section`);
    }
    for (const t of ['beach', 'shop']) {
      const html = await page(t);
      for (const b of [...FOOD_BADGES, 'patio']) assert.ok(!badgeVisible(html, b), `${t} does not offer ${b}`);
      assert.ok(badgeVisible(html, 'dog_friendly'), `${t} still offers dog friendly`);
    }
    const outdoor = await page('outdoor');
    assert.ok(badgeVisible(outdoor, 'patio'), 'outdoor still offers patio');
    const cafe = await page('cafe');
    // Sports on TV is hidden for cafés since 2026-11-10 (SPEC-cafes.md), and Non-alcoholic options since café test 2
    // (2026-11-11); the other food badges stay.
    for (const b of FOOD_BADGES.filter((x) => x !== 'sports_tv' && x !== 'nonalcoholic')) assert.ok(badgeVisible(cafe, b), `cafe offers ${b}`);
    assert.ok(!badgeVisible(cafe, 'sports_tv'), 'cafe does not offer sports_tv');
    assert.ok(!badgeVisible(cafe, 'nonalcoholic'), 'cafe does not offer nonalcoholic');
  } finally { srv.close(); }
});
