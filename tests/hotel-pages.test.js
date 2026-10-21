// Hotel QR pages (2026-10-20): /near/<slug> ("Things to do near <Hotel>") and its printable card /near/<slug>/card.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');

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
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, headers: r.headers, text: await r.text() }; };

const HOTEL = { slug: 'test-hotel', name: 'Test Hotel', region: 'kelowna', latitude: 49.8456, longitude: -119.4896 };
// About 111 m per 0.001 degree of latitude.
const at = (id, type, dLat, extra = {}) => ({ id, type, name: `Place ${id}`, slug: `place-${id}`, region: 'kelowna', latitude: HOTEL.latitude + dLat, longitude: HOTEL.longitude, ...extra });
const NO_INFO = { openIds: new Set(), byId: new Map() };

test('hotel groups: closest first, each group within its distance, closed places left out, open places lead', () => {
  const venues = [
    at(1, 'restaurant', 0.004), at(2, 'cafe', 0.001), at(3, 'pub', 0.09), // 3 is ~10 km away: past the 8 km limit
    at(4, 'winery', 0.1), at(5, 'winery', 0.3), // 5 is ~33 km away: past the 25 km limit
    at(6, 'outdoor', 0.002), at(7, 'beach', 0.003), at(8, 'restaurant', 0.002),
    at(9, 'restaurant', 0.0005, { slug: null }), // no page: never listed
  ];
  const closed = new Set([8]);
  let groups = app.hotelPageGroups(HOTEL, venues, NO_INFO, closed);
  assert.deepEqual(groups.map((g) => g.key), ['eat', 'wine', 'do']);
  assert.deepEqual(groups[0].items.map((x) => x.v.id), [2, 1], 'cafe 111 m before restaurant 444 m; far pub and closed restaurant left out');
  assert.deepEqual(groups[1].items.map((x) => x.v.id), [4]);
  assert.deepEqual(groups[2].items.map((x) => x.v.id), [6, 7]);
  // An open place leads its group even when it is a little farther away.
  groups = app.hotelPageGroups(HOTEL, venues, { openIds: new Set([1]), byId: new Map() }, closed);
  assert.deepEqual(groups[0].items.map((x) => x.v.id), [1, 2]);
  // A group with nothing nearby is dropped, not shown empty.
  assert.deepEqual(app.hotelPageGroups(HOTEL, [at(1, 'cafe', 0.001)], NO_INFO, new Set()).map((g) => g.key), ['eat']);
});

test('hotel data: every hotel has a unique slug, a town, coordinates in the Okanagan and a name', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hotels.json'), 'utf8'));
  assert.ok(data.hotels.length >= 1);
  const slugs = new Set();
  for (const h of data.hotels) {
    assert.match(h.slug, /^[a-z0-9-]+$/);
    assert.ok(!slugs.has(h.slug), `duplicate ${h.slug}`); slugs.add(h.slug);
    assert.ok(h.name && h.name.trim());
    assert.ok(h.latitude > 48.9 && h.latitude < 50.9 && h.longitude > -120.6 && h.longitude < -118.6, `${h.slug} is in the Okanagan`);
  }
  assert.equal(app.hotelList().length, data.hotels.length, 'every entry passes validation');
});

test('/near/<slug>: the hotel page is noindex, briefly cached, named for the hotel and links to the planner and the town events', async () => {
  const hotel = app.hotelList()[0];
  const r = await get(`/near/${hotel.slug}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
  assert.match(r.text, /<meta name="robots" content="noindex/);
  assert.ok(r.text.includes(`<h1>Things to do near ${hotel.name}</h1>`));
  assert.ok(r.text.includes('href="/trip"'));
  assert.ok(r.text.includes(`href="/${hotel.region}/events"`));
  assert.ok(r.text.includes("window.trackEvent('hotel_page_click'"));
  assert.ok(r.text.includes("page_type: 'hotel'"));
  assert.equal((await get('/near/no-such-hotel')).status, 404);
  assert.ok(!app.buildSitemapXml().includes('/near/'), 'not in the sitemap');
});

test('/near/<slug>/card: the printable card carries the tracked link for the QR code and the short address', async () => {
  const hotel = app.hotelList()[0];
  const r = await get(`/near/${hotel.slug}/card`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.ok(r.text.includes(`data-target="https://okanaganroam.com/near/${hotel.slug}?utm_source=${hotel.slug}&amp;utm_medium=hotel_qr"`));
  assert.ok(r.text.includes(`okanaganroam.com/near/${hotel.slug}</div>`));
  assert.ok(r.text.includes('@page { size: 4in 6in; margin: 0; }'));
  assert.ok(r.text.includes('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'));
  assert.equal(app.HOTEL_QR_UTM('abc'), 'utm_source=abc&utm_medium=hotel_qr');
});

test('hotel groups (2026-10-20): a place closed only until soon is listed after open ones, labelled by the page; other closed places stay out', () => {
  const venues = [at(1, 'restaurant', 0.001), at(2, 'restaurant', 0.002), at(3, 'pub', 0.003)];
  const closed = new Set([1, 3]);
  const soon = new Map([[1, 'Opens Nov 26']]);
  const groups = app.hotelPageGroups(HOTEL, venues, { openIds: new Set([2]), byId: new Map() }, closed, soon);
  assert.deepEqual(groups[0].items.map((x) => x.v.id), [2, 1], 'open place first, then the one opening soon; the closed pub stays out');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes("opensSoon.set(id, 'Opens for the ski season')"), 'ski-hill places with no date yet open with the hill');
  assert.ok(src.includes('row.reopens_date <= addLocalDays(today0, HOTEL_OPENS_SOON_DAYS)'));
  assert.ok(src.includes('<span class="ht-soon">'));
});
