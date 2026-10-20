// Round 10 (2026-10-19): the Free to Visit (free_entry, #405) and Arts & Culture (arts_culture) guides must read
// French on /fr pages: the town chips on /fr/guides, the "More in <town>" chips on other guides, the breadcrumb
// JSON-LD and the search box's placeholder. Runs on a throwaway, fixture-seeded database (like server.test.js);
// run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.OKR_TODAY_OVERRIDE = '2026-07-15';

const app = require('../server.js');
const db = require('../db.js');

// Nine places per town (a guide needs MIN_GUIDE_VENUES = 8): Kelowna's are free and arts & culture, Vernon's are
// free and kid friendly, so each town has more than one guide and its pages link the others.
const insert = db.prepare(`
  INSERT INTO venues (name, region, type, description, address, latitude, longitude, slug, free_entry, arts_culture, kid_friendly)
  VALUES (@name, @region, @type, @description, @address, @lat, @lng, @slug, @free, @arts, @kids)
`);
for (const [region, lat, lng, arts, kids] of [['kelowna', 49.888, -119.496, 1, 0], ['vernon', 50.267, -119.272, 0, 1]]) {
  for (let i = 1; i <= 9; i++) {
    insert.run({
      name: `Fixture ${region} Gallery ${i}`, region, type: 'activity', description: 'A fixture place used only by the test suite.',
      address: `${i} Test St`, lat: lat + i / 1000, lng, slug: `fixture-${region}-gallery-${i}`, free: 1, arts, kids,
    });
  }
}

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const get = async (p) => {
  const res = await fetch(base + p);
  assert.equal(res.status, 200, `${p} -> ${res.status}`);
  return res.text();
};
const breadcrumbNames = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } })
  .filter((d) => d && d['@type'] === 'BreadcrumbList')
  .flatMap((d) => d.itemListElement.map((el) => el.name));

test('the translator has French for both guide names and their search labels', () => {
  assert.equal(app.frText('Free Things to Do'), 'Activités gratuites');
  assert.equal(app.frText('Arts & Culture'), 'Arts et culture');
  assert.equal(app.frText('Search free things to do in kelowna'), 'Rechercher les activités gratuites à Kelowna');
  assert.equal(app.frText('Search arts &amp; culture in kelowna'), 'Rechercher les lieux d’arts et de culture à Kelowna');
});

test('/fr/guides: the free and arts town chips are French', async () => {
  const html = await get('/fr/guides');
  assert.match(html, /href="\/fr\/guide\/kelowna\/free_entry"[^>]*>Activités gratuites/);
  assert.match(html, /href="\/fr\/guide\/kelowna\/arts_culture"[^>]*>Arts et culture/);
  assert.doesNotMatch(html, /Free Things to Do|>Arts &amp; Culture\b/);
});

test('/fr/guide/vernon/kid_friendly: the "more" chip to the free guide is French', async () => {
  const html = await get('/fr/guide/vernon/kid_friendly');
  assert.match(html, /<a class="guide-more-chip" href="\/fr\/guide\/vernon\/free_entry">Activités gratuites<\/a>/);
  assert.doesNotMatch(html, /Free Things to Do/i);
});

for (const [badge, name, placeholder] of [
  ['free_entry', 'Activités gratuites', 'Rechercher les activités gratuites à Kelowna'],
  ['arts_culture', 'Arts et culture', 'Rechercher les lieux d’arts et de culture à Kelowna'],
]) {
  test(`/fr/guide/kelowna/${badge}: breadcrumb and search placeholder are French`, async () => {
    const html = await get(`/fr/guide/kelowna/${badge}`);
    const crumbs = breadcrumbNames(html);
    assert.ok(crumbs.includes(name), `breadcrumb names: ${JSON.stringify(crumbs)}`);
    assert.ok(!crumbs.some((n) => /Free Things|Arts & Culture/.test(n)), `breadcrumb names: ${JSON.stringify(crumbs)}`);
    assert.doesNotMatch(html, /Search (free things to do|arts &(amp;)? culture) in/i);
    if (/placeholder="Search /.test(html.replace(/placeholder="Search by name[^"]*"/g, ''))) assert.fail('an English search placeholder is left');
    assert.ok(html.includes(placeholder), `expected placeholder text "${placeholder}"`);
  });
}
