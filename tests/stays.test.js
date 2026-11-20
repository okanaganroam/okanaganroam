// Places to stay (2026-11-19): type 'stay', /<town>/stays and /<town>/stays/<slug> (+ /fr), the Check rates link
// (affiliate partner, owner override, website), the commission line, the SEO freeze (noindex, no sitemap, no llms.txt
// unless STAYS_INDEXABLE), stays kept out of every other list, and stay_click counting.
// Runs on a throwaway database (like server.test.js): back up okanagan.db first and restore it afterwards.
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
for (const k of ['STAY_AFFILIATE_PROVIDER', 'STAY_AFFILIATE_ID', 'STAY_AFFILIATE_CAMPAIGN', 'STAYS_INDEXABLE', 'STAYS_NAV']) delete process.env[k];
const app = require('../server.js');
const db = require('../db.js');
const stays = require('../places-to-stay');
const tripDemand = require('../trip-demand');
const importer = require('../scripts/import-stays');

let n = 0;
const mkStay = (o = {}) => app.createVenue({ slug: `test-stay-${++n}`, region: 'kelowna', type: 'stay', cuisine: 'hotel', name: `Test Stay ${n}`,
  address: `${100 + n} Water Street, Kelowna, BC`, latitude: 49.886 + n / 1000, longitude: -119.496, website: `https://stay${n}.example.com/`,
  description: 'A fixture hotel used only by the places to stay tests.', ...o });
const setBooking = (id, url) => db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(id, url);
const withEnv = async (vars, fn) => {
  const old = {}; for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
};

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

const A = mkStay({ name: 'Aardvark Lakeside Inn', cuisine: 'inn' });
const B = mkStay({ name: 'Bluebird Motel', cuisine: 'motel', website: null });
const C = mkStay({ name: 'Cedar B&B', cuisine: 'b&b', description_fr: 'Un gîte tranquille près du lac.' });
const PEN = mkStay({ name: 'Penticton Test Lodge', region: 'penticton', cuisine: 'lodge' });

test('type, labels and kinds in English and French', () => {
  assert.equal(stays.STAY_TYPE, 'stay');
  assert.equal(stays.STAY_SEGMENT, 'stays');
  assert.equal(stays.STAY_LABEL.en, 'Places to stay');
  assert.equal(stays.STAY_LABEL.fr, 'Hébergement');
  assert.deepEqual(stays.STAY_KINDS.map((k) => k.en), ['Hotel', 'Motel', 'B&B', 'Inn', 'Lodge', 'Resort', 'Cabin', 'Campground', 'Guest house']);
  assert.equal(stays.stayKindLabel('Bed and Breakfast'), 'B&B');
  assert.equal(stays.stayKindLabel('hotel', 'fr'), 'Hôtel');
  assert.equal(stays.stayKindLabel('castle'), '');
  assert.equal(stays.stayPath(A), `/kelowna/stays/${A.slug}`);
  assert.equal(stays.stayPath(A, 'fr'), `/fr/kelowna/stays/${A.slug}`);
});

test('routes: the town list and the place page in English and French; unknown towns, places and other towns 404', async () => {
  const list = await get('/kelowna/stays');
  assert.equal(list.status, 200);
  assert.match(list.text, /<h1>Places to stay in Kelowna<\/h1>/);
  assert.match(list.text, /Aardvark Lakeside Inn/);
  assert.match(list.text, /Inn · Kelowna/);
  assert.ok(!list.text.includes('Penticton Test Lodge'), 'only this town');
  // Same order as every other category page: by name.
  const order = ['Aardvark Lakeside Inn', 'Bluebird Motel', 'Cedar B&amp;B'].map((x) => list.text.indexOf(x));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'alphabetical');
  const fr = await get('/fr/kelowna/stays');
  assert.equal(fr.status, 200);
  assert.match(fr.text, /<html lang="fr-CA">/);
  assert.match(fr.text, /Hébergement à Kelowna/);
  assert.match(fr.text, /Auberge · Kelowna/);
  assert.match(fr.text, new RegExp(`href="/fr/kelowna/stays/${A.slug}"`));
  const page = await get(`/kelowna/stays/${A.slug}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Aardvark Lakeside Inn<\/h1>/);
  const frPage = await get(`/fr/kelowna/stays/${C.slug}`);
  assert.equal(frPage.status, 200);
  assert.match(frPage.text, /Un gîte tranquille près du lac\./);
  assert.match(frPage.text, /Gîte \(B&amp;B\) · Kelowna/);
  assert.equal((await get('/kelowna/stays/no-such-place')).status, 404);
  assert.equal((await get('/nowhere/stays')).status, 404);
  assert.equal((await get('/summerland/stays')).status, 404, 'a town with no stays has no page');
  assert.equal((await get(`/penticton/stays/${A.slug}`)).status, 404);
});

test('SEO freeze: every stays page is noindex and has no canonical by default; out of sitemap.xml and llms.txt', async () => {
  for (const p of ['/kelowna/stays', `/kelowna/stays/${A.slug}`, '/fr/kelowna/stays', `/fr/kelowna/stays/${A.slug}`]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex', p);
    assert.match(r.text, /<meta name="robots" content="noindex">/, p);
    assert.ok(!/rel="canonical"/.test(r.text), p);
  }
  const sitemap = (await get('/sitemap.xml')).text;
  assert.ok(!sitemap.includes('/stays'), 'no stays URL in the sitemap');
  assert.ok(!sitemap.includes(A.slug));
  const llms = await get('/llms.txt');
  if (llms.status === 200) assert.ok(!/\/stays\b|Places to stay/i.test(llms.text));
});

test('STAYS_INDEXABLE opens towns: all, or one town at a time; French pages stay noindex', async () => {
  await withEnv({ STAYS_INDEXABLE: 'kelowna' }, async () => {
    const r = await get('/kelowna/stays');
    assert.equal(r.headers.get('x-robots-tag'), null);
    assert.ok(!/content="noindex"/.test(r.text));
    assert.match(r.text, /<link rel="canonical" href="https:\/\/okanaganroam.com\/kelowna\/stays">/);
    assert.match((await get(`/kelowna/stays/${A.slug}`)).text, new RegExp(`rel="canonical" href="https://okanaganroam.com/kelowna/stays/${A.slug}"`));
    assert.equal((await get(`/penticton/stays/${PEN.slug}`)).headers.get('x-robots-tag'), 'noindex', 'other towns stay closed');
    assert.equal((await get('/fr/kelowna/stays')).headers.get('x-robots-tag'), 'noindex');
    const sitemap = (await get('/sitemap.xml')).text;
    assert.ok(sitemap.includes('<loc>https://okanaganroam.com/kelowna/stays</loc>'));
    assert.ok(sitemap.includes(`<loc>https://okanaganroam.com/kelowna/stays/${A.slug}</loc>`));
    assert.ok(!sitemap.includes('/penticton/stays'));
    assert.ok(!sitemap.includes('/fr/kelowna/stays'));
  });
  await withEnv({ STAYS_INDEXABLE: 'all' }, async () => {
    assert.ok((await get('/sitemap.xml')).text.includes(`/penticton/stays/${PEN.slug}`));
  });
  assert.equal(stays.staysIndexable('kelowna', {}), false);
  assert.equal(stays.staysIndexable('kelowna', { STAYS_INDEXABLE: 'off' }), false);
  assert.equal(stays.staysIndexable('kelowna', { STAYS_INDEXABLE: '1' }), true);
  assert.equal(stays.staysIndexable('kelowna', { STAYS_INDEXABLE: 'penticton, kelowna' }), true);
});

test('Check rates: Stay22 Allez deep link with name, address, lat/lng, aid and campaign', () => {
  const env = { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okr123', STAY_AFFILIATE_CAMPAIGN: 'stays-kelowna' };
  const l = stays.stayRatesLink(app.getVenue(A.id), { env, regionLabel: 'Kelowna' });
  assert.equal(l.affiliate, true);
  assert.equal(l.source, 'stay22');
  assert.equal(l.rel, 'sponsored nofollow noopener');
  const u = new URL(l.url);
  assert.equal(`${u.origin}${u.pathname}`, 'https://www.stay22.com/allez/roam');
  assert.equal(u.searchParams.get('aid'), 'okr123');
  assert.equal(u.searchParams.get('hotelname'), 'Aardvark Lakeside Inn');
  assert.equal(u.searchParams.get('address'), `${A.address}, Canada`);
  assert.equal(Number(u.searchParams.get('lat')), A.latitude);
  assert.equal(Number(u.searchParams.get('lng')), A.longitude);
  assert.equal(u.searchParams.get('campaign'), 'stays_kelowna', 'Stay22 splits a campaign on hyphens');
  assert.equal(new URL(stays.stayRatesLink(app.getVenue(A.id), { env, lang: 'fr' }).url).searchParams.get('lang'), 'fr');
  assert.equal(l.label, 'Check rates');
  assert.equal(stays.stayRatesLink(app.getVenue(A.id), { env, lang: 'fr' }).label, 'Voir les tarifs');
});

test('Check rates: Booking.com and Expedia search links', () => {
  const v = app.getVenue(A.id);
  const b = stays.stayRatesLink(v, { env: { STAY_AFFILIATE_PROVIDER: 'booking', STAY_AFFILIATE_ID: '999', STAY_AFFILIATE_CAMPAIGN: 'okr' }, regionLabel: 'Kelowna' });
  const bu = new URL(b.url);
  assert.equal(`${bu.origin}${bu.pathname}`, 'https://www.booking.com/searchresults.html');
  assert.equal(bu.searchParams.get('aid'), '999');
  assert.equal(bu.searchParams.get('label'), 'okr');
  assert.match(bu.searchParams.get('ss'), /^Aardvark Lakeside Inn, \d+ Water Street/);
  assert.equal(b.affiliate, true);
  const e = stays.stayRatesLink(v, { env: { STAY_AFFILIATE_PROVIDER: 'expedia', STAY_AFFILIATE_ID: 'X1' } });
  const eu = new URL(e.url);
  assert.equal(`${eu.origin}${eu.pathname}`, 'https://www.expedia.ca/Hotel-Search');
  assert.equal(eu.searchParams.get('affcid'), 'X1');
  assert.equal(eu.searchParams.get('latLong'), `${A.latitude},${A.longitude}`);
  assert.equal(e.rel, 'sponsored nofollow noopener');
});

test('Check rates: provider none or no id -> the website (not affiliate), or no button; owner link wins and is not affiliate', () => {
  const v = app.getVenue(A.id);
  for (const env of [{}, { STAY_AFFILIATE_PROVIDER: 'none', STAY_AFFILIATE_ID: 'x' }, { STAY_AFFILIATE_PROVIDER: 'stay22' }, { STAY_AFFILIATE_PROVIDER: 'nonsense', STAY_AFFILIATE_ID: 'x' }]) {
    const l = stays.stayRatesLink(v, { env });
    assert.equal(l.url, A.website, JSON.stringify(env));
    assert.equal(l.affiliate, false);
    assert.equal(l.rel, 'nofollow noopener');
    assert.equal(l.label, 'Check rates');
  }
  assert.equal(stays.stayRatesLink(app.getVenue(B.id), { env: {} }), null, 'no website, no partner: no button');
  const env = { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okr123' };
  const own = stays.stayRatesLink(v, { env, links: { booking_url: 'https://book.example.com/aardvark' } });
  assert.deepEqual([own.url, own.affiliate, own.source, own.rel], ['https://book.example.com/aardvark', false, 'owner', 'nofollow noopener']);
  assert.equal(stays.stayRatesLink(v, { env, links: { booking_url: 'javascript:alert(1)' } }).source, 'stay22', 'a bad link is ignored');
  assert.equal(stays.stayRatesLink(app.getVenue(B.id), { env }).affiliate, true, 'with a partner, a place with no website still gets a button');
});

test('pages: affiliate links carry rel="sponsored" and target=_blank, and the commission line shows only with an affiliate link', async () => {
  // Default (no partner): website links, no commission line.
  let list = await get('/kelowna/stays');
  assert.ok(!list.text.includes('data-stay-disclosure'));
  assert.ok(!list.text.includes('sponsored'));
  assert.match(list.text, new RegExp(`<a class="st-rates" href="${A.website.replace(/[.]/g, '\\.')}" rel="nofollow noopener" target="_blank" data-track="stay_click"`));
  assert.ok(!(await get(`/kelowna/stays/${B.slug}`)).text.includes('class="st-rates'), 'no website: no Check rates button');
  await withEnv({ STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okr123' }, async () => {
    list = await get('/kelowna/stays');
    assert.match(list.text, /<a class="st-rates" href="https:\/\/www\.stay22\.com\/allez\/roam\?aid=okr123[^"]*" rel="sponsored nofollow noopener" target="_blank" data-track="stay_click"/);
    assert.ok(list.text.includes(stays.DISCLOSURE.en));
    const page = await get(`/kelowna/stays/${A.slug}`);
    assert.match(page.text, /rel="sponsored nofollow noopener" target="_blank" data-track="stay_click"/);
    assert.ok(page.text.includes(stays.DISCLOSURE.en));
    const fr = await get(`/fr/kelowna/stays/${A.slug}`);
    assert.ok(fr.text.includes(stays.DISCLOSURE.fr));
    assert.ok(fr.text.includes('Voir les tarifs'));
    // An owner's own booking link: no sponsored rel and no commission line on that place's page.
    setBooking(C.id, 'https://cedar.example.com/book');
    const own = await get(`/kelowna/stays/${C.slug}`);
    assert.match(own.text, /href="https:\/\/cedar\.example\.com\/book" rel="nofollow noopener" target="_blank" data-track="stay_click"/);
    assert.ok(!own.text.includes('data-stay-disclosure'));
    assert.ok(!own.text.includes('sponsored'));
    setBooking(C.id, null);
  });
});

test('stays never show in other lists: categories, town counts, browse, map, API, nearby, trip plans, Editor\'s Picks', () => {
  const ids = new Set([A.id, B.id, C.id, PEN.id]);
  const has = (list) => list.some((v) => ids.has(Number(v.id)));
  assert.equal(app.getRegionCategoryCounts('kelowna').stay, undefined);
  assert.ok(!has(app.getBrowseHubVenues()));
  const map = app.mapPlacesData();
  assert.ok(!JSON.stringify(map).includes('Aardvark Lakeside Inn'));
  assert.ok(!has(app.listVenues({ limit: '2000' }).venues));
  assert.ok(!JSON.stringify(app.listVenues({ region: 'kelowna', limit: '2000' })).includes('Aardvark Lakeside Inn'));
  assert.ok(!JSON.stringify(app.listVenues({ search: 'Aardvark' })).includes('Aardvark Lakeside Inn'));
  const other = app.createVenue({ slug: 'stays-neighbour-cafe', region: 'kelowna', type: 'cafe', name: 'Stays Neighbour Cafe', latitude: 49.887, longitude: -119.496 });
  assert.ok(!has(app.getNearbyVenues(app.getVenue(other.id), 50)));
  assert.ok(!has(app.getRelatedVenues(app.getVenue(other.id))));
  const tax = app.buildTripPlannerTaxonomy();
  assert.ok(!has(tax.venues), 'not in the trip planner taxonomy');
  assert.ok(!(tax.types || []).includes('stay'));
  assert.ok(app.TRIP_PLANNER_EXCLUDED_TYPES.has('stay'));
  for (const text of ['a hotel and dinner in Kelowna', 'Aardvark Lakeside Inn then a winery in Kelowna', 'motel, coffee and a beach in Kelowna']) {
    const plan = app.runTripPlan({ text }, new Date('2026-11-18T17:00:00Z'));
    const found = tripDemand.collectVenueIds(plan);
    assert.ok(![...ids].some((id) => found.has(id)), text);
    assert.ok(!JSON.stringify({ ...plan, query: null, text: null }).includes('Aardvark Lakeside Inn'), `${text} (beyond the echoed request)`);
  }
  const picks = app.renderHomeEditorsPicksHTML({ data: { picks: [{ id: A.id, why: 'A test pick', photo: '/images/venues/test.webp' }] }, rotate: false });
  assert.ok(!String(picks).includes('Aardvark Lakeside Inn'), 'never an Editor\'s Pick');
});

test('town page: no "Places to stay" link by default; STAYS_NAV adds it only where the town has a stay', async () => {
  const before = await get('/kelowna');
  assert.equal(before.status, 200);
  assert.ok(!before.text.includes('/kelowna/stays'));
  await withEnv({ STAYS_NAV: 'on' }, async () => {
    const k = await get('/kelowna');
    assert.ok(k.text.includes('<a href="/kelowna/stays">Places to stay &rarr;</a>'));
    const s = await get('/summerland');
    if (s.status === 200) assert.ok(!s.text.includes('/summerland/stays'));
  });
});

test('stay_click: counted through the outbound-click log; bots, our own UA and our own visits are not', async () => {
  const post = (ua, body, extra = {}) => fetch(`${base}/api/venue-event`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': ua, ...extra }, body: JSON.stringify(body) });
  const count = (name) => (db.prepare('SELECT SUM(n) AS n FROM venue_event_counts WHERE venue_id = ? AND name = ?').get(A.id, name).n || 0);
  const human = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
  assert.equal((await post(human, { venue_id: A.id, name: 'click:stay_click' })).status, 204);
  assert.equal((await post(human, { venue_id: A.id, name: 'outbound_click:stay_click' })).status, 204);
  await post('Googlebot/2.1 (+http://www.google.com/bot.html)', { venue_id: A.id, name: 'click:stay_click' });
  await post('okanaganroam-check/1.0', { venue_id: A.id, name: 'click:stay_click' });
  await post(human, { venue_id: A.id, name: 'click:stay_click' }, { Cookie: 'roam_internal=1' });
  assert.equal(count('click:stay_click'), 1);
  assert.equal(count('outbound_click:stay_click'), 1);
  const out = app.venueActivityCounter ? app.venueActivityCounter.outbound(30, 100) : null;
  if (out) {
    const row = out.businesses.find((b) => b.id === A.id);
    assert.ok(row && row.stays === 1, 'on the admin outbound dashboard');
    assert.equal(out.totals.stays, 1);
  }
  // The page tells the click sheet what was clicked: the Check rates link classifies as stay_click.
  assert.ok(require('../click-labels').isKey('stay_click'));
});

test('import script: dry-run parsing, street address rule, kinds and regions', () => {
  const csv = [
    'name,region,subtype,address,latitude,longitude,website,phone,description,source_url',
    '"Hotel Eldorado, Test",kelowna,Hotel,"500 Cook Rd, Kelowna, BC",49.86,-119.48,hotel.example.com,250-555-0100,"Lakeside ""classic"" hotel",https://example.com/src',
    'No Street Lodge,kelowna,Lodge,"Kelowna, BC",49.86,-119.48,,,,https://example.com/src',
    'Bad Kind,kelowna,Castle,"1 Main St",49.86,-119.48,,,,',
    'Nowhere Inn,atlantis,Inn,"1 Main St",49.86,-119.48,,,,',
  ].join('\n');
  const rows = importer.parseCsv(csv);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].name, 'Hotel Eldorado, Test');
  assert.equal(rows[0].description, 'Lakeside "classic" hotel');
  const regions = importer.knownRegions();
  assert.ok(regions.has('kelowna') && regions.has('west-kelowna'));
  const ok = importer.rowToVenue(rows[0], regions);
  assert.deepEqual(ok.body, { name: 'Hotel Eldorado, Test', region: 'kelowna', type: 'stay', cuisine: 'hotel', address: '500 Cook Rd, Kelowna, BC', latitude: 49.86, longitude: -119.48, slug: 'hotel-eldorado-test', website: 'https://hotel.example.com', phone: '250-555-0100', description: 'Lakeside "classic" hotel' });
  assert.equal(importer.rowToVenue(rows[1], regions).skip, 'no street address');
  assert.match(importer.rowToVenue(rows[2], regions).skip, /unknown subtype/);
  assert.match(importer.rowToVenue(rows[3], regions).skip, /unknown region/);
});

// ---- Close by, no-photo cards and pages, town notes (2026-11-19) ----
// A stay far from every other fixture, with our own listings set out around it at known distances (due north).
const FAR = { lat: 50.9, lng: -118.2 };
const north = (km) => FAR.lat + km / 111.195;
const S = mkStay({ name: 'Remote Close By Lodge', cuisine: 'lodge', latitude: FAR.lat, longitude: FAR.lng, website: null });
let nb = 0;
const mkNear = (type, km, o = {}) => app.createVenue({ slug: `close-by-${type}-${++nb}`, region: 'kelowna', type, name: `Near ${type} ${nb}`,
  latitude: north(km), longitude: FAR.lng, ...o });
const R1 = mkNear('restaurant', 0.3);
const C1 = mkNear('cafe', 0.6, { description_fr: 'Un café de test.' });
const W1 = mkNear('winery', 1.5);
const O1 = mkNear('outdoor', 0.2);
const B1 = mkNear('beach', 1.0);
const I1 = mkNear('indoor', 1.9);
const FAR_R = mkNear('restaurant', 2.3);
const GOLF = mkNear('golf', 0.1);
const COCKTAIL = mkNear('cocktail', 0.1);
const OTHER_STAY = mkStay({ name: 'Next Door Stay', latitude: north(0.05), longitude: FAR.lng });
const MOVED = mkNear('restaurant', 0.1);
db.prepare('UPDATE venues SET redirect_to = ? WHERE id = ?').run(R1.id, MOVED.id);
const SEASONAL = mkNear('outdoor', 0.15);
db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)')
  .run(SEASONAL.id, 'closed', null, '2099-05-01', 'https://example.com/season', '2026-01-01');
const LONELY = mkStay({ name: 'Lonely Cabin', cuisine: 'cabin', latitude: 51.7, longitude: -117.1, website: null });
const PHOTO = mkStay({ name: 'Photo Hotel', image_url: '/images/venues/test-photo-hotel.jpg' });

const nearIds = (html) => [...(html.match(/<section class="st-near"[\s\S]*?<\/section>/) || [''])[0].matchAll(/<li data-venue-id="(\d+)"/g)].map((m) => Number(m[1]));

test('Close by: within 2 km, food & drink first then things to do, nearest first, a mix, four at most', async () => {
  const items = app.getStayCloseBy(app.getVenue(S.id));
  assert.deepEqual(items.map((x) => x.v.id), [R1.id, C1.id, O1.id, B1.id]);
  assert.deepEqual(items.map((x) => x.group), ['food_drink', 'food_drink', 'things_to_do', 'things_to_do']);
  const page = await get(`/kelowna/stays/${S.slug}`);
  assert.equal(page.status, 200);
  assert.deepEqual(nearIds(page.text), [R1.id, C1.id, O1.id, B1.id]);
  assert.match(page.text, /<h2 id="stNearHead">Close by<\/h2>/);
  assert.match(page.text, new RegExp(`<a href="/kelowna/restaurants/${R1.slug}"><span class="st-near-name">Near restaurant \\d+</span><span class="st-near-meta">Restaurant · 300 m</span></a>`));
  assert.match(page.text, /<span class="st-near-meta">Beach · 1\.0 km<\/span>/);
  assert.ok(!/st-near[\s\S]*nofollow[\s\S]*<\/section>/.test(page.text.match(/<section class="st-near"[\s\S]*?<\/section>/)[0]), 'plain internal links');
});

test('Close by: skips other stays, other types, redirected, closed for the season and anything past 2 km', () => {
  const ids = app.getStayCloseBy(app.getVenue(S.id)).map((x) => x.v.id);
  for (const v of [FAR_R, GOLF, COCKTAIL, OTHER_STAY, MOVED, SEASONAL, W1, I1]) assert.ok(!ids.includes(v.id), v.name);
  // The pure ranking: cutoff, cap, mix and the spare places going to the nearer group.
  const dist = (a, b) => b.km;
  const v = (id, type, km, o = {}) => ({ id, type, km, slug: `s${id}`, name: `V${id}`, ...o });
  const stay = { id: 0, type: 'stay' };
  const food = [v(1, 'restaurant', 0.5), v(2, 'cafe', 0.4), v(3, 'pub', 1.2), v(4, 'brewery', 1.9), v(5, 'winery', 2.01)];
  assert.deepEqual(stays.pickStayCloseBy(stay, food, { distanceKm: dist }).map((x) => x.v.id), [2, 1, 3, 4], 'only food: the four nearest, cutoff at 2 km');
  const mixed = [...food, v(6, 'tour', 0.1), v(7, 'outdoor', 1.95)];
  assert.deepEqual(stays.pickStayCloseBy(stay, mixed, { distanceKm: dist }).map((x) => x.v.id), [2, 1, 6, 7]);
  const one = [...food, v(6, 'tour', 0.1)];
  assert.deepEqual(stays.pickStayCloseBy(stay, one, { distanceKm: dist }).map((x) => x.v.id), [2, 1, 3, 6], 'a spare place goes to the nearer remaining one');
  const skip = [v(8, 'stay', 0.1), v(9, 'golf', 0.1), v(10, 'restaurant', 0.1, { redirect_to: 1 }), v(11, 'restaurant', 0.1, { slug: null }), v(12, 'cafe', 0.1)];
  assert.deepEqual(stays.pickStayCloseBy(stay, skip, { distanceKm: dist, closedIds: new Set([12]) }), []);
  assert.equal(stays.formatStayDistance(0.351), '350 m');
  assert.equal(stays.formatStayDistance(0.004), '10 m');
  assert.equal(stays.formatStayDistance(0.998), '1.0 km');
  assert.equal(stays.formatStayDistance(1.24), '1.2 km');
  assert.equal(stays.formatStayDistance(1.24, 'fr'), '1,2 km');
});

test('Close by: hidden when nothing is within 2 km', async () => {
  assert.deepEqual(app.getStayCloseBy(app.getVenue(LONELY.id)), []);
  for (const p of [`/kelowna/stays/${LONELY.slug}`, `/fr/kelowna/stays/${LONELY.slug}`]) {
    const r = await get(p);
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes('data-stay-close-by'), p);
    assert.ok(!r.text.includes('stNearHead'), p);
  }
});

test('Close by: French labels on /fr pages, French venue pages only where the place has one', async () => {
  const fr = await get(`/fr/kelowna/stays/${S.slug}`);
  assert.equal(fr.status, 200);
  assert.match(fr.text, /<h2 id="stNearHead">À proximité<\/h2>/);
  assert.match(fr.text, /Distances à vol d’oiseau/);
  assert.match(fr.text, new RegExp(`<a href="/fr/kelowna/cafes/${C1.slug}"><span class="st-near-name">[^<]+</span><span class="st-near-meta">Café · 600 m</span>`));
  assert.match(fr.text, new RegExp(`<a href="/kelowna/restaurants/${R1.slug}">`), 'no French page: the English one');
  assert.match(fr.text, /<span class="st-near-meta">Plage · 1,0 km<\/span>/);
  assert.equal(fr.headers.get('x-robots-tag'), 'noindex');
});

test('no photo: the card gets the sand no-photo panel and the page the plain title hero, never an empty image box', async () => {
  const list = await get('/kelowna/stays');
  const card = (id) => (list.text.match(new RegExp(`<li class="st-card" data-venue-id="${id}"[\\s\\S]*?</li>`)) || [''])[0];
  assert.match(card(A.id), /^<li class="st-card" data-venue-id="\d+" data-ph="none"><span class="st-nophoto" aria-hidden="true"><\/span>/);
  assert.ok(!/<img/.test(card(A.id)));
  assert.match(card(PHOTO.id), /<img src="\/images\/venues\/test-photo-hotel\.jpg"/);
  assert.ok(!card(PHOTO.id).includes('st-nophoto'));
  assert.ok(!/<img[^>]*src=""/.test(list.text));
  assert.match(list.text, /\.st-nophoto \{ display: block; width: 100%; height: 150px; background: #EEE8DC/);
  const page = await get(`/kelowna/stays/${A.slug}`);
  assert.match(page.text, /<div class="venue-hero venue-hero-fallback st-titlehero" data-ph="none">\s*<span class="venue-hero-type">Inn · Kelowna<\/span>\s*<h1>Aardvark Lakeside Inn<\/h1>/);
  assert.ok(!page.text.includes('class="st-hero"'));
  assert.ok(!/<img[^>]*src=""/.test(page.text));
  assert.ok(!page.text.includes('class="st-kicker"'), 'the kind line moves into the hero');
  const photoPage = await get(`/kelowna/stays/${PHOTO.slug}`);
  assert.match(photoPage.text, /<img class="st-hero" src="\/images\/venues\/test-photo-hotel\.jpg"/);
  assert.ok(!photoPage.text.includes('class="venue-hero venue-hero-fallback st-titlehero"'));
  assert.match(photoPage.text, /<h1>Photo Hotel<\/h1>/);
});

test('town notes: intro and tips under the heading, escaped, in the meta description; a town without one keeps the generic line', async () => {
  stays.setTownNotes({
    kelowna: { en: 'Stay <b>near</b> the "lake" & the bridge.', fr: 'Dormez <i>près</i> du lac.', tips: [{ en: 'Tip <script>alert(1)</script>', fr: 'Astuce & conseil' }, { en: 'English only tip' }, { fr: '' }] },
  });
  try {
    const en = await get('/kelowna/stays');
    assert.match(en.text, /<h1>Places to stay in Kelowna<\/h1>\s*<div class="st-notes" data-stay-town-note>\s*<p class="st-intro">Stay &lt;b&gt;near&lt;\/b&gt; the &quot;lake&quot; &amp; the bridge\.<\/p>/);
    assert.match(en.text, /<ul class="st-tips"><li>Tip &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/li><li>English only tip<\/li><\/ul>/);
    assert.ok(!en.text.includes('<script>alert(1)'));
    assert.ok(!en.text.includes('in alphabetical order'), 'the note replaces the generic line');
    assert.match(en.text, /<meta name="description" content="Stay &lt;b&gt;near&lt;\/b&gt; the &quot;lake&quot; &amp; the bridge\.">/);
    const fr = await get('/fr/kelowna/stays');
    assert.match(fr.text, /<p class="st-intro">Dormez &lt;i&gt;près&lt;\/i&gt; du lac\.<\/p>/);
    assert.match(fr.text, /<li>Astuce &amp; conseil<\/li><li lang="en">English only tip<\/li>/);
    assert.match(fr.text, /<meta name="description" content="Dormez &lt;i&gt;près&lt;\/i&gt; du lac\.">/);
    const pen = await get('/penticton/stays');
    assert.ok(!pen.text.includes('data-stay-town-note'));
    assert.match(pen.text, /Hotels, motels, B&amp;Bs, inns and other places to stay, in alphabetical order\./);
    assert.match(pen.text, /<meta name="description" content="Hotels, motels, B&amp;Bs and other places to stay in Penticton, BC\.">/);
    assert.equal(en.headers.get('x-robots-tag'), 'noindex', 'still noindex');
    assert.match(en.text, /<meta name="robots" content="noindex">/);
    assert.ok(!(await get('/sitemap.xml')).text.includes('/stays'));
  } finally { stays.setTownNotes(null); }
});

test('town notes file: the shipped shape, with one placeholder entry', () => {
  const data = JSON.parse(fs.readFileSync(stays.TOWN_NOTES_FILE, 'utf8'));
  const towns = Object.keys(data);
  assert.deepEqual(towns, ['kelowna']);
  for (const t of towns) {
    assert.equal(typeof data[t].en, 'string');
    assert.equal(typeof data[t].fr, 'string');
    assert.ok(data[t].en.length > 40 && data[t].fr.length > 40);
    assert.ok(Array.isArray(data[t].tips));
    for (const tip of data[t].tips) { assert.equal(typeof tip.en, 'string'); assert.equal(typeof tip.fr, 'string'); }
  }
  const note = stays.townNoteFor('kelowna', 'en');
  assert.equal(note.text, data.kelowna.en.replace(/\s+/g, ' ').trim());
  assert.equal(stays.townNoteFor('penticton', 'en'), null);
  assert.equal(stays.townNoteFor('__proto__', 'en'), null);
});
