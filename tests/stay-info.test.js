// Stay info (2026-11-20): validateStayInfo, the stay_info table, POST/GET /admin/stay-info, scripts/apply-stay-info.js
// (dry run), and the "Good to know" list on a stay's page and the "Sleeps N" chip on the town list, in EN and FR.
// Runs on a throwaway database (like stays.test.js): back up okanagan.db first and restore it afterwards.
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
for (const k of ['STAY_AFFILIATE_PROVIDER', 'STAY_AFFILIATE_ID', 'STAY_AFFILIATE_CAMPAIGN', 'STAYS_INDEXABLE', 'STAYS_NAV']) delete process.env[k];
const TOKEN = 'stay-info-test-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;
const app = require('../server.js');
const db = require('../db.js');
const stays = require('../places-to-stay');
const applyScript = require('../scripts/apply-stay-info');

let n = 0;
const mkStay = (o = {}) => app.createVenue({ slug: `info-stay-${++n}`, region: 'kelowna', type: 'stay', cuisine: 'hotel', name: `Info Stay ${n}`,
  address: `${200 + n} Water Street, Kelowna, BC`, latitude: 49.886 + n / 1000, longitude: -119.496, website: `https://infostay${n}.example.com/`,
  description: 'A fixture hotel used only by the stay info tests.', ...o });

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
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const admin = async (method, p, body, token = TOKEN) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const GOOD = {
  max_guests: 6, unit_types: ['room', 'suite'], bedrooms_max: 2, price_level: 2, pets: 'some', kitchen: 'some', pool: true, hot_tub: false,
  parking: 'free', accessible: null, adults_only: false, kid_friendly: true, check_in: '15:00', check_out: '11:00', min_nights: 2,
  min_nights_note: '2 nights on summer weekends', open_months: [5, 6, 7, 8, 9, 10],
  booking: { own: 'https://book.example.com/hotel/123', booking_com: 'https://www.booking.com/hotel/ca/info-stay.html', expedia: 'https://www.expedia.ca/Kelowna-Hotels-Info-Stay.h123456.Hotel-Information' },
  sources: ['https://infostay1.example.com/rooms'], confidence: 'high', checked_at: '2026-11-20',
};
const bad = (patch) => stays.validateStayInfo({ ...GOOD, ...patch });

test('validateStayInfo: the schema example passes; every field may be null or missing', () => {
  assert.deepEqual(stays.validateStayInfo(GOOD), { ok: true, errors: [] });
  assert.equal(stays.validateStayInfo({}).ok, true);
  const allNull = Object.fromEntries(stays.STAY_INFO_KEYS.map((k) => [k, null]));
  assert.equal(stays.validateStayInfo(allNull).ok, true);
  assert.equal(stays.validateStayInfo({ open_months: [], booking: { own: null, booking_com: null, expedia: null } }).ok, true);
  assert.equal(stays.validateStayInfo({ bedrooms_max: 0 }).ok, true, '0 = studio');
  for (const x of [null, [], 'x', 3]) assert.equal(stays.validateStayInfo(x).ok, false);
});

test('validateStayInfo: each bad field is refused with a reason', () => {
  const cases = [
    [{ extra_field: 1 }, /Unknown field: extra_field/],
    [{ max_guests: 0 }, /max_guests/], [{ max_guests: 2.5 }, /max_guests/], [{ max_guests: '6' }, /max_guests/],
    [{ bedrooms_max: -1 }, /bedrooms_max/], [{ min_nights: 0 }, /min_nights/],
    [{ unit_types: ['room', 'castle'] }, /castle/], [{ unit_types: 'room' }, /unit_types/], [{ unit_types: ['room', 'room'] }, /twice/],
    [{ price_level: 0 }, /price_level/], [{ price_level: 5 }, /price_level/], [{ price_level: '2' }, /price_level/],
    [{ pets: 'maybe' }, /pets/], [{ kitchen: 'full' }, /kitchen/], [{ parking: 'street' }, /parking/], [{ confidence: 'sure' }, /confidence/],
    [{ pool: 'yes' }, /pool/], [{ hot_tub: 1 }, /hot_tub/], [{ adults_only: 'false' }, /adults_only/],
    [{ check_in: '3pm' }, /check_in/], [{ check_in: '24:00' }, /check_in/], [{ check_out: '9:00' }, /check_out/],
    [{ open_months: [0, 5] }, /open_months/], [{ open_months: [13] }, /open_months/], [{ open_months: [5, 5] }, /twice/], [{ open_months: '5-10' }, /open_months/],
    [{ checked_at: '2026-13-01' }, /checked_at/], [{ min_nights_note: '' }, /min_nights_note/], [{ min_nights_note: '<b>2</b>' }, /min_nights_note/],
    [{ sources: ['http://infostay1.example.com/'] }, /https/], [{ sources: 'https://a.example.com/' }, /sources/],
    [{ booking: { own: 'ftp://x.example.com/' } }, /booking.own/], [{ booking: { airbnb: 'https://airbnb.ca/rooms/1' } }, /booking.airbnb/],
    [{ booking: { booking_com: 'https://www.booking.com/searchresults.html?ss=Kelowna' } }, /Booking.com hotel page/],
    [{ booking: { booking_com: 'https://www.notbooking.example.com/hotel/ca/x.html' } }, /Booking.com hotel page/],
    [{ booking: { expedia: 'https://www.expedia.ca/Hotel-Search?destination=Kelowna' } }, /Expedia hotel page/],
    [{ booking: { expedia: 'https://www.hotels.com/ho123/' } }, /Expedia hotel page/],
  ];
  for (const [patch, re] of cases) {
    const r = bad(patch);
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.ok(r.errors.some((e) => re.test(e)), `${JSON.stringify(patch)} -> ${r.errors.join(' | ')}`);
  }
  assert.equal(bad({ booking: { expedia: 'https://www.expedia.com/Kelowna-Hotels-X.h1.Hotel-Information' } }).ok, true, 'expedia.com is fine');
});

test('validateStayInfo: affiliate and tracking parameters are refused in every URL', () => {
  for (const q of ['?aid=304142', '?label=gen173nr', '?x=1&AID=9', '?affiliate_id=7', '?ref=affiliate', '?utm_source=x', '?a=1&utm_medium=email']) {
    assert.equal(bad({ booking: { booking_com: `https://www.booking.com/hotel/ca/info-stay.html${q}` } }).ok, false, `booking_com ${q}`);
    assert.equal(bad({ booking: { own: `https://book.example.com/r${q}` } }).ok, false, `own ${q}`);
    assert.equal(bad({ sources: [`https://infostay1.example.com/${q}`] }).ok, false, `sources ${q}`);
  }
  assert.match(bad({ booking: { expedia: 'https://www.expedia.ca/X.h1.Hotel-Information?utm_campaign=y' } }).errors.join(' '), /tracking/);
  assert.equal(bad({ booking: { own: 'https://book.example.com/r?arrival=2026-07-01' } }).ok, true, 'other parameters are fine');
});

const STAY = mkStay({ name: 'Good To Know Lodge', cuisine: 'lodge' });
const BARE = mkStay({ name: 'Bare Facts Motel', cuisine: 'motel' });
const FOOD = app.createVenue({ slug: 'info-not-a-stay', region: 'kelowna', type: 'restaurant', name: 'Not A Stay Bistro', address: '1 Bernard Ave, Kelowna, BC', latitude: 49.88, longitude: -119.49 });

test('stay_info table exists with the agreed columns', () => {
  const cols = db.prepare('PRAGMA table_info(stay_info)').all().map((c) => c.name);
  assert.deepEqual(cols, ['venue_id', 'info_json', 'updated_at', 'batch_id']);
});

test('admin route: auth, bad bodies, non-stay venues refused, upsert with audit row, GET, expect_updated_at', async () => {
  const body = { venue_id: STAY.id, info: GOOD, reason: 'Researched from the property site', batch_id: 'stay-info-test-1' };
  assert.equal((await admin('POST', '/admin/stay-info', body, null)).status, 401);
  assert.equal((await admin('POST', '/admin/stay-info', body, 'wrong')).status, 401);
  assert.equal((await admin('GET', `/admin/stay-info?venue_id=${STAY.id}`, undefined, null)).status, 401);
  assert.equal((await admin('POST', '/admin/stay-info', { ...body, extra: 1 })).status, 400);
  assert.equal((await admin('POST', '/admin/stay-info', { ...body, reason: '' })).status, 400);
  assert.equal((await admin('POST', '/admin/stay-info', { ...body, batch_id: undefined })).status, 400);
  const invalid = await admin('POST', '/admin/stay-info', { ...body, info: { ...GOOD, price_level: 9 } });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.errors.some((e) => /price_level/.test(e)));
  const notStay = await admin('POST', '/admin/stay-info', { ...body, venue_id: FOOD.id });
  assert.equal(notStay.status, 400);
  assert.match(notStay.body.error, /not a place to stay/);
  assert.equal((await admin('GET', `/admin/stay-info?venue_id=${FOOD.id}`)).status, 400);
  assert.equal((await admin('POST', '/admin/stay-info', { ...body, venue_id: 999999 })).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stay_info WHERE venue_id = ?').get(FOOD.id).n, 0);

  const empty = await admin('GET', `/admin/stay-info?venue_id=${STAY.id}`);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.info, null);
  assert.equal(empty.body.updated_at, null);

  const first = await admin('POST', '/admin/stay-info', { ...body, expect_updated_at: null });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.changed, true);
  assert.equal(first.body.created, true);
  assert.deepEqual(first.body.info, GOOD);
  const read = await admin('GET', `/admin/stay-info?venue_id=${STAY.id}`);
  assert.deepEqual(read.body.info, GOOD);
  assert.equal(read.body.batch_id, 'stay-info-test-1');
  assert.equal(read.body.region, 'kelowna');
  assert.equal(read.body.slug, STAY.slug);
  const log1 = db.prepare("SELECT * FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'stay_info' ORDER BY id").all(STAY.id);
  assert.equal(log1.length, 1);
  assert.equal(log1[0].old_value, null);
  assert.deepEqual(JSON.parse(log1[0].new_value), GOOD);
  assert.equal(log1[0].batch_id, 'stay-info-test-1');
  assert.equal(log1[0].source_ref, 'Researched from the property site');

  // The same facts again: nothing written, no second audit row.
  const same = await admin('POST', '/admin/stay-info', body);
  assert.equal(same.status, 200);
  assert.equal(same.body.changed, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'stay_info'").get(STAY.id).n, 1);

  // A stale expect_updated_at is refused; the right one updates (one row per stay, a second audit row).
  const stale = await admin('POST', '/admin/stay-info', { ...body, info: { ...GOOD, max_guests: 8 }, expect_updated_at: null });
  assert.equal(stale.status, 409);
  const upd = await admin('POST', '/admin/stay-info', { ...body, info: { ...GOOD, max_guests: 8 }, batch_id: 'stay-info-test-2', expect_updated_at: read.body.updated_at });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.changed, true);
  assert.equal(upd.body.created, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stay_info WHERE venue_id = ?').get(STAY.id).n, 1);
  const log2 = db.prepare("SELECT * FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'stay_info' ORDER BY id").all(STAY.id);
  assert.equal(log2.length, 2);
  assert.equal(JSON.parse(log2[1].old_value).max_guests, 6);
  assert.equal(JSON.parse(log2[1].new_value).max_guests, 8);
  // Put the schema example back for the page tests.
  const back = await admin('POST', '/admin/stay-info', body);
  assert.equal(back.body.changed, true);
});

test('apply-stay-info.js: dry run checks region, slug, type and validation and writes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stay-info-'));
  const file = path.join(dir, 'batch.json');
  fs.writeFileSync(file, JSON.stringify({ reason: 'Test batch', batch_id: 'stay-info-dry', venues: [
    { id: BARE.id, name: BARE.name, region: 'kelowna', slug: BARE.slug, info: { max_guests: 4, price_level: 1, confidence: 'medium' } },
    { id: STAY.id, name: STAY.name, region: 'penticton', slug: STAY.slug, info: { max_guests: 2 } },
    { id: FOOD.id, name: FOOD.name, region: 'kelowna', slug: FOOD.slug, info: { max_guests: 2 } },
    { id: BARE.id + 1000, name: 'Bad info', region: 'kelowna', slug: 'x', info: { pets: 'maybe' } },
  ] }));
  const before = db.prepare('SELECT COUNT(*) AS n FROM stay_info').get().n;
  const lines = [];
  const seenUA = new Set();
  const fetchFn = (url, opts) => { seenUA.add(opts && opts.headers && opts.headers['User-Agent']); return fetch(url, opts); };
  const { counts } = await applyScript.run({ file, apply: false, base, token: undefined, log: (l) => lines.push(l), fetchFn });
  assert.deepEqual(counts, { written: 0, would_write: 1, unchanged: 0, mismatch: 2, invalid: 1, failed: 0 });
  assert.ok(lines.some((l) => l.startsWith('WOULD') && l.includes(BARE.name) && l.includes('sleeps 4')), lines.join('\n'));
  assert.ok(lines.some((l) => l.startsWith('MISMATCH') && l.includes('Good To Know Lodge')));
  assert.ok(lines.some((l) => l.startsWith('MISMATCH') && l.includes('restaurant')));
  assert.ok(lines.some((l) => l.startsWith('INVALID') && /pets/.test(l)));
  assert.match(lines[lines.length - 1], /^DRY RUN .*4 stays in file/);
  assert.deepEqual([...seenUA], ['okanaganroam-apply/1.0']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stay_info').get().n, before, 'a dry run writes nothing');
  // --apply without the token stops before sending anything.
  const r = await applyScript.run({ file, apply: true, base, token: '', log: () => {} });
  assert.match(r.error, /ENRICHMENT_ADMIN_TOKEN/);
  assert.equal(applyScript.DEFAULT_BASE, 'https://okanaganroam.com');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('stay page, English: Good to know lines under the address; price as $ symbols; no sources, confidence or booking links', async () => {
  const page = await get(`/kelowna/stays/${STAY.slug}`);
  assert.equal(page.status, 200);
  const t = page.text;
  assert.match(t, /<h2 id="stKnowHead">Good to know<\/h2>/);
  assert.ok(t.indexOf('data-stay-info>') > t.indexOf('class="st-addr"'), 'under the address');
  assert.match(t, /Sleeps up to 6/);
  assert.match(t, /Rooms, suites/);
  assert.match(t, /Typical price: \$\$</);
  assert.match(t, /Check-in from 3 pm · Check-out 11 am/);
  assert.match(t, /Minimum 2 nights <span>\(2 nights on summer weekends\)<\/span>/);
  assert.match(t, /Pets welcome in some units/);
  assert.match(t, /Kitchen in some units/);
  assert.match(t, /Pool · Free parking</);
  assert.ok(!/Hot tub/.test(t), 'hot_tub false: not shown');
  assert.ok(!/Adults only/.test(t), 'adults_only false: not shown');
  assert.match(t, /Open May–October/);
  assert.ok(!/Typical price: \d/.test(t), 'price level never shown as a number');
  for (const hidden of ['confidence', 'high', 'sources', 'infostay1.example.com/rooms', 'booking.com', 'expedia', 'book.example.com']) {
    assert.ok(!t.includes(hidden), `page must not show ${hidden}`);
  }
  const know = t.slice(t.indexOf('data-stay-info>'), t.indexOf('</section>', t.indexOf('data-stay-info>')));
  assert.ok(!/2026-11-20|confidence|source/i.test(know), 'no checked date, confidence or sources in the list');
});

test('stay page, French: the same lines in French; the English note is marked lang="en"', async () => {
  const t = (await get(`/fr/kelowna/stays/${STAY.slug}`)).text;
  assert.match(t, /Bon à savoir/);
  assert.match(t, /Jusqu’à 6 personnes/);
  assert.match(t, /Chambres, suites/);
  assert.match(t, /Prix habituel : \$\$</);
  assert.match(t, /Arrivée dès 15 h · Départ 11 h/);
  assert.match(t, /Minimum 2 nuits <span lang="en">\(2 nights on summer weekends\)<\/span>/);
  assert.match(t, /Animaux acceptés dans certaines unités/);
  assert.match(t, /Cuisine dans certaines unités/);
  assert.match(t, /Piscine · Stationnement gratuit</);
  assert.match(t, /Ouvert de mai à octobre/);
  for (const hidden of ['confidence', 'booking.com', 'expedia', 'infostay1.example.com/rooms']) assert.ok(!t.includes(hidden), hidden);
});

test('lines are hidden when null; open all year and min 1 night say nothing; a stay with no info has no section', async () => {
  assert.ok(!(await get(`/kelowna/stays/${BARE.slug}`)).text.includes('data-stay-info'));
  const lines = (info, lang) => stays.stayInfoLines(info, lang).map((l) => l.key);
  assert.deepEqual(lines({ ...Object.fromEntries(stays.STAY_INFO_KEYS.map((k) => [k, null])) }), []);
  assert.deepEqual(lines({ open_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], min_nights: 1, kitchen: 'none', parking: 'none', pets: null }), []);
  assert.deepEqual(lines({ adults_only: true, pets: 'no', kitchen: 'all', hot_tub: true }), ['pets', 'kitchen', 'amenities', 'adults_only']);
  const t = (info, lang = 'en') => stays.stayInfoLines(info, lang).map((l) => l.text);
  assert.deepEqual(t({ adults_only: true, pets: 'no', kitchen: 'all', hot_tub: true }), ['No pets', 'Kitchen in every unit', 'Hot tub', 'Adults only']);
  assert.deepEqual(t({ pets: 'yes' }), ['Pets welcome']);
  assert.deepEqual(t({ check_out: '10:30' }), ['Check-out 10:30 am']);
  assert.deepEqual(t({ check_in: '16:00' }, 'fr'), ['Arrivée dès 16 h']);
  assert.deepEqual(t({ price_level: 4 }), ['Typical price: $$$$']);
  assert.deepEqual(t({ price_level: 1 }, 'fr'), ['Prix habituel : $']);
  assert.equal(stays.openMonthsText([11, 12, 1, 2, 3, 4]), 'Open November–April');
  assert.equal(stays.openMonthsText([7]), 'Open in July');
  assert.equal(stays.openMonthsText([6, 7, 9]), 'Open June–July, September');
  assert.equal(stays.openMonthsText([12, 1, 2, 3], 'fr'), 'Ouvert de décembre à mars');
  assert.equal(stays.openMonthsText([]), '');
});

test('town list: a "Sleeps N" chip on cards with max_guests, nothing on others (EN and FR)', async () => {
  const list = (await get('/kelowna/stays')).text;
  const card = (html, id) => { const i = html.indexOf(`data-venue-id="${id}"`); return html.slice(i, html.indexOf('</li>', i)); };
  assert.match(card(list, STAY.id), /<span class="st-chip" data-stay-sleeps>Sleeps 6<\/span>/);
  assert.ok(!card(list, BARE.id).includes('data-stay-sleeps'));
  assert.ok(!/Typical price|Good to know|Check-in/.test(list), 'only the chip on the list');
  const fr = (await get('/fr/kelowna/stays')).text;
  assert.match(card(fr, STAY.id), /Jusqu’à 6 pers\./);
});
