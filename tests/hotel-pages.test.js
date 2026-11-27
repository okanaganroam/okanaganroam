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
  assert.ok(r.text.includes(`data-target="https://okanaganroam.com/q/${hotel.slug}"`), 'the QR holds the short link');
  assert.ok(r.text.includes(`Compliments of ${hotel.name}`));
  assert.ok(r.text.includes(`okanaganroam.com/near/<wbr>${hotel.slug}</div>`), 'the address breaks only after /near/');
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

test('short links (2026-10-21): /guests/<slug> and /q/<slug> forward to the hotel page with the email or QR tracking tags', async () => {
  const hotel = app.hotelList()[0];
  let r = await get(`/guests/${hotel.slug}`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/near/${hotel.slug}?utm_source=hotel_email&utm_medium=email&utm_content=${hotel.slug}`);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  r = await get(`/q/${hotel.slug}`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/near/${hotel.slug}?utm_source=${hotel.slug}&utm_medium=hotel_qr`);
  assert.equal((await get('/guests/no-such-hotel')).status, 404);
  assert.equal((await get('/q/no-such-hotel')).status, 404);
});

test('hotel logo (2026-10-21): only a file under /images/hotels/ shows on the card', () => {
  assert.equal(app.hotelLogo({ logo: '/images/hotels/test-hotel.png' }), '/images/hotels/test-hotel.png');
  for (const bad of ['https://example.com/logo.png', '/images/hotels/../x.png', '/images/venues/a.png', 'javascript:alert(1)', 42, null])
    assert.equal(app.hotelLogo({ logo: bad }), null, String(bad));
  const html = app.renderHotelCard({ ...app.hotelList()[0], logo: '/images/hotels/test-hotel.png' });
  assert.ok(html.includes('<img class="hc-logo" src="/images/hotels/test-hotel.png"'));
  assert.ok(!app.renderHotelCard(app.hotelList()[0]).includes('hc-logo"'));
});

test('rental managers (2026-10-22): "Things to do around <Town>", for guests of the company, with no walk or drive times', async () => {
  const rental = app.hotelList().find((h) => app.hotelIsRental(h));
  assert.ok(rental, 'data has at least one rental entry');
  const town = rental.region === 'big-white' ? 'Big White' : null;
  assert.match(app.hotelHeadline(rental), /^around /);
  assert.equal(app.hotelHeadline({ name: 'Hotel X', region: 'kelowna' }), 'near Hotel X');
  const r = await get(`/near/${rental.slug}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /<h1>What&#39;s open in [^<]+ right now<\/h1>|<h1>What's open in [^<]+ right now<\/h1>/);
  assert.ok(r.text.includes(`for guests of ${rental.name}`));
  assert.ok(!/min walk|min drive/.test(r.text), 'no walk/drive times from one door');
  const card = (await get(`/near/${rental.slug}/card`)).text;
  assert.match(card, /<h1 class="hc-h[^"]*">What(&#39;|')s open in [^<]+ right now<\/h1>/);
  assert.ok(card.includes('updated live'));
  assert.ok(/Map of what(&#39;|')s near you/.test(card), 'rental card lists the map');
  assert.ok(card.includes(`Compliments of ${rental.name}`));
  if (town) assert.ok(card.includes(town));
});

test('ski hill guest pages (2026-11-25): before opening day a note says when the lifts open; the map opens on the town', () => {
  const hill = app.hotelList().find((h) => h.region === 'big-white');
  assert.ok(hill, 'a Big White hotel exists');
  const before = app.renderHotelPage(hill, new Date('2026-11-25T19:00:00Z'));
  assert.match(before, /class="ht-season"/);
  assert.match(before, /Big White lifts: Targeting Thursday, December 3\./);
  assert.ok(before.includes('href="/map?f=in.big-white"'));
  const during = app.renderHotelPage(hill, new Date('2026-12-10T19:00:00Z'));
  assert.doesNotMatch(during, /class="ht-season"/, 'no note once the lifts are running');
  const town = app.hotelList().find((h) => h.region === 'kelowna');
  const k = app.renderHotelPage(town, new Date('2026-11-25T19:00:00Z'));
  assert.doesNotMatch(k, /class="ht-season"/, 'no ski note off the hill');
  assert.ok(k.includes('href="/map?f=in.kelowna"'));
});

test('hotel groups (2026-11-25): indoor places get their own rainy-day row, apart from outdoor things to do', () => {
  const venues = [at(1, 'indoor', 0.002), at(2, 'outdoor', 0.002), at(3, 'beach', 0.003)];
  const groups = app.hotelPageGroups(HOTEL, venues, NO_INFO, new Set());
  assert.deepEqual(groups.map((g) => g.key), ['do', 'indoor']);
  assert.deepEqual(groups[0].items.map((x) => x.v.id).sort(), [2, 3]);
  assert.deepEqual(groups[1].items.map((x) => x.v.id), [1]);
});

test('hotel page (2026-11-25): filter flags, day trips from the nearest other towns, never the hotel\'s own town', () => {
  assert.deepEqual(app.hotelVenueFlags({ kid_friendly: true, dog_friendly: true, patio: true, happy_hour: true }, true), ['open', 'hh', 'kids', 'dogs', 'patio']);
  assert.deepEqual(app.hotelVenueFlags({}, false), []);
  const towns = (region, lat, n) => Array.from({ length: n }, (_, i) => ({ region, latitude: lat + i * 0.0001, longitude: HOTEL.longitude }));
  const venues = [...towns('kelowna', HOTEL.latitude, 6), ...towns('vernon', HOTEL.latitude + 0.2, 6), ...towns('oliver', HOTEL.latitude + 0.9, 6), ...towns('penticton', HOTEL.latitude + 0.1, 2)];
  const trips = app.hotelDayTrips(HOTEL, venues, 80);
  assert.deepEqual(trips.map((t) => t.region), ['vernon'], 'own town, a town with under 5 places and a town past 80 km are left out');
  assert.ok(trips[0].drive > 0);
});

test('QR card + page polish (2026-11-26): open-late chip flag, shorter intro, card promises the whole valley', async () => {
  assert.ok(app.hotelVenueFlags({ open_late: 1 }, false).includes('late'));
  assert.ok(!app.hotelVenueFlags({}, false).includes('late'));
  const hotel = app.hotelList().find((h) => !app.hotelIsRental(h));
  const page = app.renderHotelPage(hotel, new Date('2026-11-25T19:00:00Z'));
  assert.match(page, /class="ht-intro">What(&#39;|')s open near [^<]+ right now, closest first\./);
  const card = app.renderHotelCard(hotel);
  assert.ok(card.includes('valley-wide'));
  assert.ok(card.includes('Free, no app.'));
  assert.ok(card.includes('Happy hours &amp; drink deals'));
  assert.ok(card.includes('Build My Trip</strong> planner'));
});

test('guest page rows (2026-11-26): campgrounds and RV resorts are not "outdoors" for a hotel guest; tours lead their row', () => {
  const venues = [
    at(1, 'outdoor', 0.001, { name: 'Lakeview Campground & RV Resort' }), at(2, 'outdoor', 0.002, { name: 'River Walk Park' }),
    at(3, 'sport', 0.001), at(4, 'tour', 0.004),
  ];
  const groups = app.hotelPageGroups(HOTEL, venues, NO_INFO, new Set());
  const doG = groups.find((g) => g.key === 'do');
  assert.deepEqual(doG.items.map((x) => x.v.id), [2], 'the campground is left out');
  const act = groups.find((g) => g.key === 'activities');
  assert.deepEqual(act.items.map((x) => x.v.id), [4, 3], 'the tour leads even though the sport place is closer');
});

test('guest page events (2026-11-26): season-long fixture series stay off the short list', () => {
  for (const n of ['Osoyoos Coyotes Home Games 2026\u201327', 'Penticton Vees Schedule 2026\u201327: Home Games', 'UBCO Heat Men\'s Volleyball 2026\u201327 Season']) assert.ok(app.HOTEL_EVENT_SKIP.test(n), n);
  for (const n of ['Fire & Ice Disco Brunch', 'Christmas Faire', 'Kelowna Chiefs vs Oliver Outlaws', 'Polar Bear Dip']) assert.ok(!app.HOTEL_EVENT_SKIP.test(n), n);
});

test('ski hill guest pages (2026-11-27): no beaches promised at Big White; summer-only places drop out in the ski months', () => {
  const SKI = { slug: 'ski-test', name: 'Ski Test', region: 'big-white', kind: 'rental', latitude: HOTEL.latitude, longitude: HOTEL.longitude };
  assert.equal(app.hotelIsSkiHill(SKI), true);
  assert.equal(app.hotelIsSkiHill(HOTEL), false);
  const venues = [
    at(1, 'beach', 0.001, { name: 'Sunset Beach' }), at(2, 'outdoor', 0.002, { name: 'Big White Summer Hiking Trails' }),
    at(3, 'outdoor', 0.003, { name: 'McCulloch Reservoir Recreation Site' }), at(4, 'outdoor', 0.004, { name: 'Happy Valley Ice Skating Rink' }),
  ];
  const winter = app.hotelPageGroups(SKI, venues, NO_INFO, new Set(), new Map(), new Date('2026-12-10T18:00:00Z')).find((g) => g.key === 'do');
  assert.equal(winter.title, 'Outdoors and things to do');
  assert.deepEqual(winter.items.map((x) => x.v.id), [4], 'beach, summer hiking and reservoir are left out in winter');
  const summer = app.hotelPageGroups(SKI, venues, NO_INFO, new Set(), new Map(), new Date('2026-07-10T18:00:00Z')).find((g) => g.key === 'do');
  assert.deepEqual(summer.items.map((x) => x.v.id), [2, 3, 4], 'summer keeps hiking and the reservoir, but still no beach');
  const beachy = app.hotelPageGroups(HOTEL, venues, NO_INFO, new Set(), new Map(), new Date('2026-12-10T18:00:00Z')).find((g) => g.key === 'do');
  assert.equal(beachy.title, 'Beaches, parks and outdoors');
  assert.ok(beachy.items.some((x) => x.v.id === 1), 'a lake town still lists its beach');
  const card = app.renderHotelCard(SKI);
  assert.ok(!/beach/i.test(card), 'the ski hill card never says beach');
  assert.ok(app.renderHotelCard(HOTEL).includes('Wineries, beaches &amp; day trips'));
});
