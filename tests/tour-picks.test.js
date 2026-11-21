// Bookable tour picks (2026-11-21, tour-picks.js): the "Book a tour" row on hotel guest pages and the weekend email's one
// "Book something this weekend" pick. Only products we already link, only in season and well reviewed, one per group,
// off with Viator off, hidden when nothing fits, never on the printable card. Runs on a throwaway database; back up
// okanagan.db first and copy it back afterwards.
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

delete process.env.VIATOR_API_KEY;
delete process.env.VIATOR_PARTNER_ID;
delete process.env.VIATOR_DATA_DIR;
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-picks-test-token';
const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const viator = require('../viator');
const tp = require('../tour-picks');
const app = require('../server.js');
const db = require('../db.js');

const ENV = { VIATOR_API_KEY: 'test-key-not-real', VIATOR_PARTNER_ID: 'P00333119' };
const ON = viator.config(ENV);
const on = () => Object.assign(process.env, ENV);
const off = () => { delete process.env.VIATOR_API_KEY; delete process.env.VIATOR_PARTNER_ID; };
const MATCHES = viator.loadMatches();
const DATA = tp.loadData();
const HOTELS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hotels.json'), 'utf8')).hotels;
const KELOWNA = { latitude: 49.886, longitude: -119.495 };

// Fixture data: small, so the rules are visible.
const FX = {
  minRating: 4.6, minReviews: 5, emailMinReviews: 20, maxKm: 30,
  products: {
    A1: { rating: 4.99, reviews: 560, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'food' },
    B1: { rating: 4.9, reviews: 94, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'wine' },
    B2: { rating: 5.0, reviews: 3, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'wine' }, // too few reviews
    C1: { rating: 5.0, reviews: 118, months: [6, 7, 8, 9], group: 'adventure' }, // summer only
    D1: { rating: 4.8, reviews: 40, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'wine' }, // second wine: one per group
    E1: { rating: 4.4, reviews: 900, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'indoor' }, // rating too low
    F1: { rating: 5.0, reviews: 30, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'tasting' }, // 60 km away
    W1: { rating: 4.9, reviews: 257, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], group: 'wine' },
    S1: { rating: 4.97, reviews: 59, months: 'ski', group: 'ski-rental', pin: true },
  },
};
const url = (code) => `https://www.viator.com/en-CA/tours/Kelowna/X/d22366-${code}?mcid=42383&pid=P00333119&medium=api&api_version=2.0`;
const FX_MATCHES = {
  1: { productCode: 'A1', title: 'Walking Food Tour', supplier: 'Food Co', url: url('A1') },
  2: { productCode: 'B1', title: 'Four Wineries Tour', supplier: 'Wine Co', url: url('B1') },
  3: { productCode: 'B2', title: 'New Wine Tour', supplier: 'New Co', url: url('B2') },
  4: { productCode: 'C1', title: 'Canyoning', supplier: 'Canyon Co', url: url('C1') },
  5: { productCode: 'D1', title: 'Other Wine Tour', supplier: 'Other Co', url: url('D1') },
  6: { productCode: 'E1', title: 'Low Rated', supplier: 'Low Co', url: url('E1') },
  7: { productCode: 'F1', title: 'Far Tasting', supplier: 'Far Co', url: url('F1') },
  8: { productCode: 'S1', title: 'Ski Rental Delivered', supplier: 'Ski Co', url: url('S1') },
  9: { productCode: 'S1', title: 'Ski Rental Delivered', supplier: 'Ski Co', url: url('S1') }, // the same product at a second shop
  10: { productCode: 'NOROW', title: 'No data row', supplier: 'X', url: url('NOROW') },
};
const FX_WINE = { areas: { kelowna: { productCode: 'W1', title: 'Afternoon Wine Tour', supplier: 'Red Dog', url: url('W1') } }, regions: { kelowna: 'kelowna', 'big-white': 'kelowna' } };
const V = (id, dLat, extra = {}) => ({ id, name: `Business ${id}`, region: 'kelowna', type: 'tour', slug: `business-${id}`, latitude: KELOWNA.latitude + dLat, longitude: KELOWNA.longitude, image_url: null, ...extra });
const VENUES = new Map([V(1, 0.01, { image_url: '/images/venues/food.jpg' }), V(2, 0.05), V(3, 0.01), V(4, 0.02), V(5, 0.03), V(6, 0.01), V(7, 0.55), V(8, 0.001), V(9, 0.002, { image_url: '/images/venues/ski.jpg' }), V(10, 0.001), V(11, 0.004, { name: 'Red Dog', type: 'tour', image_url: '/images/venues/red-dog.jpg' })].map((v) => [v.id, v]));
const ctx = (o = {}) => ({ cfg: ON, data: FX, matches: FX_MATCHES, wine: FX_WINE, venues: VENUES, closedIds: new Set(), date: '2026-11-27', skiInSeason: false, ...o });
const HOTEL = { slug: 'h', name: 'Hotel', region: 'kelowna', ...KELOWNA };

test('candidates: only products with a data row, in season, open, with an approved link; off with Viator off', () => {
  const codes = (c) => [...new Set(c.map((x) => x.code))].sort();
  assert.deepEqual(codes(tp.candidates(ctx())), ['A1', 'B1', 'B2', 'D1', 'E1', 'F1', 'W1'], 'no row (NOROW), summer-only (C1) and ski out of season (S1) left out');
  assert.ok(codes(tp.candidates(ctx({ date: '2026-07-10' }))).includes('C1'), 'C1 in July');
  assert.ok(codes(tp.candidates(ctx({ skiInSeason: true }))).includes('S1'), 'ski rental in ski season');
  assert.ok(!codes(tp.candidates(ctx({ closedIds: new Set([1]) }))).includes('A1'), 'a business closed for the season is left out');
  assert.deepEqual(tp.candidates(ctx({ cfg: viator.config({}) })), [], 'Viator off: nothing');
});

test('guest picks: well reviewed, close, one per group, best first, at most 3; pinned ski rental first', () => {
  const picks = tp.guestPicks(HOTEL, ctx());
  const codes = picks.map((p) => p.code);
  assert.equal(codes.length, 2, `food + one wine only: ${codes}`);
  assert.equal(codes[0], 'A1');
  assert.ok(['W1', 'B1'].includes(codes[1]), 'one wine tour, the better one');
  assert.ok(!codes.includes('B2') && !codes.includes('E1') && !codes.includes('F1'), 'too few reviews, low rating and 60 km away are left out');
  const ski = tp.guestPicks(HOTEL, ctx({ skiInSeason: true }));
  assert.equal(ski[0].code, 'S1', 'ski rental first in ski season');
  assert.equal(ski.filter((p) => p.code === 'S1').length, 1, 'the same product once, even at two shops');
  assert.ok(ski.length <= 3);
  // A product's own reach (ski delivery around town only).
  const near = { ...FX, products: { ...FX.products, S1: { ...FX.products.S1, maxKm: 0.1 } } };
  assert.ok(!tp.guestPicks(HOTEL, ctx({ data: near, skiInSeason: true })).some((p) => p.code === 'S1'), 'past its own maxKm');
  // Wine tours: pickup in their own towns only, not up on a ski hill.
  assert.ok(!tp.guestPicks({ ...HOTEL, region: require('../trip-site.js').skiHillRegions[0], latitude: 49.72, longitude: -118.92 }, ctx()).some((p) => p.code === 'W1'));
  // A hotel on a ski hill: only products on that hill (the valley's tours 10 km down the road are left out).
  const HILL = require('../trip-site.js').skiHillRegions[0];
  const hill = { ...HOTEL, region: HILL, latitude: KELOWNA.latitude + 0.002, longitude: KELOWNA.longitude };
  const onHill = new Map([...VENUES].map(([id, v]) => [id, id === 8 || id === 9 ? { ...v, region: HILL } : v]));
  assert.deepEqual(tp.guestPicks(hill, ctx()).map((p) => p.code), [], 'nothing on the hill out of ski season');
  assert.deepEqual(tp.guestPicks(hill, ctx({ venues: onHill, skiInSeason: true })).map((p) => p.code), ['S1']);
  assert.deepEqual(tp.guestPicks({ ...HOTEL, region: 'osoyoos', latitude: 49.03, longitude: -119.46 }, ctx()), [], 'nothing near: empty');
});

test('guest row html: heading, one Book now per product (sponsored, Viator), the commission line; empty when nothing fits', () => {
  const picks = tp.guestPicks(HOTEL, ctx());
  const html = tp.guestRowHtml(picks, { venueHref: (v) => `/kelowna/tours/${v.slug}` });
  assert.match(html, /<h2 id="ht-tours">Book a tour<\/h2>/);
  const books = html.match(/<a class="ht-tour-book"[^>]*>/g) || [];
  assert.equal(books.length, picks.length);
  for (const a of books) {
    assert.match(a, /rel="sponsored noopener"/);
    assert.match(a, /data-link="viator"/);
    assert.match(a, /target="_blank"/);
  }
  assert.match(html, /data-viator-disclosure>We may earn a commission/);
  assert.match(html, /href="\/kelowna\/tours\/business-1">Business 1<\/a>/, 'the business links to its free page');
  const noB1 = { ...FX_MATCHES }; delete noB1[2];
  assert.match(tp.guestRowHtml(tp.guestPicks(HOTEL, ctx({ matches: noB1 }))), /Pickup in town/, 'a wine tour with pickup says so');
  assert.doesNotMatch(html, /<img/, 'no Viator photos');
  assert.match(tp.guestRowHtml(picks, { lang: 'fr' }), /Réserver une activité[\s\S]*Réserver <span/);
  assert.equal(tp.guestRowHtml([], {}), '');
});

test('email pick: only businesses with their own photo here; rotates by ISO week; never a product without a photo', () => {
  assert.equal(tp.isoWeek('2026-11-27'), 48);
  assert.equal(tp.isoWeek('2027-01-01'), 53);
  assert.equal(tp.isoWeek('2026-01-02'), 1);
  // 20+ reviews and in season: A1 B1 D1 F1 W1. Own photo: A1 (venue 1) and W1 (its operator, Red Dog, is listed with a photo).
  const pool = ['A1', 'W1'];
  const seen = [];
  for (let w = 0; w < 4; w++) seen.push(tp.emailPick(ctx({ weekKey: w })).code);
  assert.deepEqual(seen, [...pool, ...pool], 'each candidate in turn, in code order');
  assert.equal(tp.emailPick(ctx()).code, pool[48 % pool.length], 'the real ISO week picks');
  assert.equal(tp.emailPick(ctx()).photoVenue.image_url, '/images/venues/food.jpg');
  assert.equal(tp.emailPick(ctx({ weekKey: 1 })).photoVenue.id, 11, 'a wine tour: its operator\'s own listing');
  for (let w = 0; w < 6; w++) assert.ok(tp.emailPick(ctx({ weekKey: w })).photoVenue.image_url, 'never a pick without a photo');
  // Without the operator's listing, the wine tour is skipped.
  const noRedDog = new Map([...VENUES].filter(([id]) => id !== 11));
  assert.deepEqual([0, 1, 2].map((w) => tp.emailPick(ctx({ venues: noRedDog, weekKey: w })).code), ['A1', 'A1', 'A1']);
  // Ski season: S1 joins; the shop with the photo (9), not the first shop (8, no photo).
  const ski = tp.emailPick(ctx({ skiInSeason: true, weekKey: 1 })); // A1 S1 W1
  assert.equal(ski.code, 'S1');
  assert.equal(ski.photoVenue.id, 9);
  // Nobody with a photo: no pick at all.
  const noPhotos = new Map([...VENUES].map(([id, v]) => [id, { ...v, image_url: null }]));
  assert.equal(tp.emailPick(ctx({ venues: noPhotos })), null);
  assert.equal(tp.emailPick(ctx({ cfg: viator.config({}) })), null);
  assert.equal(tp.emailPick(ctx({ matches: {}, wine: null })), null);
});

test('linkFor: known codes only, any case, Viator on', () => {
  const l = tp.linkFor('a1', ctx());
  assert.equal(l.code, 'A1');
  assert.equal(l.url, url('A1'));
  assert.equal(tp.linkFor('W1', ctx()).business, 'Red Dog');
  assert.equal(tp.linkFor('NOROW', ctx()), null, 'no data row');
  assert.equal(tp.linkFor('../x', ctx()), null);
  assert.equal(tp.linkFor('A1', ctx({ cfg: viator.config({}) })), null);
});

test('data file: every row is a product we link (a match or a wine tour), with a rating, reviews, months and group', () => {
  const linked = new Set([...Object.values(MATCHES).map((m) => m.productCode), ...Object.values(require('../wine-tours').loadData().areas).map((a) => a.productCode)]);
  for (const [code, m] of Object.entries(DATA.products)) {
    assert.ok(linked.has(code), `${code} is a product we already link`);
    assert.ok(m.rating > 0 && m.rating <= 5 && Number.isInteger(m.reviews), code);
    assert.ok(m.months === 'ski' || (Array.isArray(m.months) && m.months.length && m.months.every((x) => Number.isInteger(x) && x >= 1 && x <= 12)), code);
    assert.ok(m.group, code);
  }
});

// ---- On the pages ----
const insert = db.prepare(`INSERT INTO venues (id, name, region, type, description, address, latitude, longitude, slug, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const realIds = Object.keys(MATCHES).map(Number);
for (const id of realIds) {
  const m = MATCHES[id];
  insert.run(id, m.name || `Match ${id}`, 'kelowna', 'tour', 'A fixture business for the tour picks tests.', 'Kelowna, BC', KELOWNA.latitude + 0.01, KELOWNA.longitude, `match-${id}`, id === 1582 ? '/images/venues/taste-of-kelowna.jpg' : null);
}

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  off();
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 test' } }); return { status: r.status, headers: r.headers, text: await r.text() }; };

test('hotel pages: every hotel renders; the row only with Viator on, after the free picks, never on the card', async () => {
  off();
  const k = await get('/near/hotel-eldorado');
  assert.equal(k.status, 200);
  assert.doesNotMatch(k.text, /ht-tours|Book a tour/, 'Viator off: no row');
  on();
  let shown = 0;
  for (const h of HOTELS) {
    const r = await get(`/near/${h.slug}`);
    assert.equal(r.status, 200, h.slug);
    assert.doesNotMatch(r.text, /<section class="ht-section ht-tours"[^>]*>\s*<style>[\s\S]*?<ul class="ht-tours-list"><\/ul>/, `${h.slug}: never an empty row`);
    if (/id="ht-tours"/.test(r.text)) {
      shown++;
      const books = r.text.match(/class="ht-tour-book"/g) || [];
      assert.ok(books.length >= 1 && books.length <= 3, `${h.slug}: 1-3 products`);
      assert.ok(r.text.indexOf('id="ht-tours"') > r.text.lastIndexOf('class="ht-list"'), `${h.slug}: after the free picks`);
      assert.doesNotMatch(r.text, /discovercars/i, `${h.slug}: no car rental`);
    }
    const card = await get(`/near/${h.slug}/card`);
    assert.doesNotMatch(card.text, /ht-tours|Book a tour|viator/i, `${h.slug}: the printed card is unchanged`);
  }
  assert.ok(shown > 0, 'some hotels near our matched businesses show the row');
  const e = await get('/near/hotel-eldorado');
  assert.match(e.text, /id="ht-tours"/);
  assert.match(e.text, /312379P1/, 'Kelowna: the walking food tour (560 reviews)');
  off();
});

test('weekend email: one pick before the footer with Book now through our counted page; none with Viator off', async () => {
  on();
  const wk = app.weekendEmail;
  const dg = wk.buildDigest(new Date('2026-11-26T18:00:00Z'));
  assert.ok(dg.book, 'a pick for the Nov 27 weekend');
  assert.match(dg.book.bookUrl, /^https:\/\/okanaganroam\.com\/weekend-email\/book\/[a-z0-9]+\?utm_source=newsletter&utm_medium=email&utm_campaign=weekend-2026-11-27&utm_content=book-pick$/);
  const html = wk.digestHtml(dg, 'https://okanaganroam.com/weekend-email/unsubscribe/x');
  const at = html.indexOf('Book something this weekend');
  assert.ok(at > 0 && at < html.indexOf('Unsubscribe in one click'), 'before the footer');
  assert.equal((html.match(/>Book now ↗</g) || []).length, 1, 'one Book now');
  assert.match(html, /We may earn a commission/);
  assert.doesNotMatch(html, /media\.tacdn|tripadvisor/i, 'never a Viator photo');
  assert.match(html, /<div class="wk-book"[\s\S]*?<img src="https:\/\/[a-z]+roam\.com\/images\/venues\/[^"]+"/, 'the business\'s own photo, always');
  const text = wk.digestText(dg, 'https://okanaganroam.com/weekend-email/unsubscribe/x');
  assert.match(text, /BOOK SOMETHING THIS WEEKEND[\s\S]*Book now: https:\/\/okanaganroam\.com\/weekend-email\/book\//);
  // A different week, a different (or the same, when only one fits) pick, always deterministic.
  assert.deepEqual(wk.buildDigest(new Date('2026-11-26T18:00:00Z')).book, dg.book);
  // The admin preview shows it.
  const admin = wk.adminPage({ now: new Date('2026-11-26T18:00:00Z') });
  assert.match(admin, /Book something this weekend/);
  // The hop page: counts and goes on to Viator; unknown codes go to What's On.
  const code = /\/book\/([a-z0-9]+)\?/.exec(dg.book.bookUrl)[1];
  const hop = await get(`/weekend-email/book/${code}?utm_source=newsletter&utm_medium=email&utm_campaign=weekend-2026-11-27&utm_content=book-pick`);
  assert.equal(hop.status, 200);
  assert.match(hop.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(hop.text, /location\.replace\(u\)/);
  assert.match(hop.text, /roamCount\('commission:viator:email'\)/);
  assert.match(hop.text, /https:\/\/www\.viator\.com\/[^"]*pid=P00333119/);
  assert.match(hop.text, /page_type: 'email_book'/);
  const bad = await get('/weekend-email/book/nope123');
  assert.equal(bad.status, 302);
  off();
  assert.equal(wk.buildDigest(new Date('2026-11-26T18:00:00Z')).book, null, 'Viator off: no pick');
  assert.doesNotMatch(wk.digestHtml(wk.buildDigest(new Date('2026-11-26T18:00:00Z')), 'x'), /Book something/);
  assert.equal((await get(`/weekend-email/book/${code}`)).status, 302, 'Viator off: the hop goes to What’s On');
});

test('commissions: the weekend email has its own kind of page; guest pages count as hotel', () => {
  const c = require('../commissions');
  assert.ok(c.SURFACE_KEYS.includes('email') && c.SURFACE_KEYS.includes('hotel'));
  assert.ok(c.NAMES.includes('commission:viator:email') && c.NAMES.includes('commission:viator:hotel'));
  assert.ok(require('../site-events').EVENTS.has('commission:viator:email'));
  assert.match(c.clientJs('email_book'), /weekend-email/);
});
