// Round 11 speed (2026-10-20): owner-photo venue pages (Red Rooster, Cozy Nook) had a 3.4-3.6 s LCP on a throttled
// phone because the gallery strip's 81x64px thumbnails downloaded 480px copies (about 140 KB) alongside the main
// photo. Covers: the 160/240px owner photo copies (upload keys, admin backfill, files served), the strip's srcset
// and its deferred src (data-src until the hero has loaded, <noscript> fallback), the phone copy of the strip after
// the button row, the hero's sizes and preload, the hero-ready signal in <head>, and the guides' 1200px banners.
// Runs on a throwaway, fixture-seeded database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.OKR_TODAY_OVERRIDE = '2026-07-15';
process.env.ENRICHMENT_ADMIN_TOKEN = 'test-fixture-admin-token';
const PHOTO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'okr-r11-speed-'));
process.env.OWNER_PHOTO_DIR = PHOTO_DIR;

const app = require('../server.js');
const db = require('../db.js');

// A minimal JPEG (start of frame and scan) of the given size; jpegDimensions reads it like a real photo.
const jpeg = (w, h, seed = 0) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xFF, 0xDA, 0x00, 0x08, 1, 1, 0, 0, 0x3F, 0]), Buffer.alloc(64, seed), Buffer.from([0xFF, 0xD9])]);
const dataUrl = (buf) => `data:image/jpeg;base64,${buf.toString('base64')}`;

const insertVenue = db.prepare(`INSERT INTO venues (name, region, type, description, address, phone, website, latitude, longitude, slug, image_url)
  VALUES (@name, 'naramata', 'winery', 'A fixture winery used only by the test suite.', '1 Test Rd', '250-555-0100', 'https://example.com', 49.59, -119.59, @slug, @image)`);
const STEMS = ['r11a00000000000000000001', 'r11a00000000000000000002', 'r11a00000000000000000003', 'r11a00000000000000000004', 'r11a00000000000000000005'];
const galleryId = Number(insertVenue.run({ name: 'R11 Gallery Winery', slug: 'r11-gallery-winery', image: `/images/owner/${STEMS[0]}.jpg` }).lastInsertRowid);
const plainId = Number(insertVenue.run({ name: 'R11 Single Photo Winery', slug: 'r11-single-photo-winery', image: `/images/owner/r11b00000000000000000001.jpg` }).lastInsertRowid);
const addPhoto = db.prepare(`INSERT INTO owner_photos (venue_id, file, preview_key, width, height, bytes, credit, rights_confirmed_at, status)
  VALUES (?, ?, ?, 1600, 1067, 100, 'R11 Winery', '2026-10-18', 'approved')`);
const photoIds = STEMS.map((s, i) => {
  fs.writeFileSync(path.join(PHOTO_DIR, `${s}.jpg`), jpeg(1600, 1067, i));
  // Every photo already has its round 9 copies (480/960/1200), as on the live site before the backfill.
  for (const w of [480, 960, 1200]) fs.writeFileSync(path.join(PHOTO_DIR, `${s}-w${w}.jpg`), jpeg(w, Math.round(1067 * w / 1600), i));
  return Number(addPhoto.run(galleryId, `${s}.jpg`, `r11preview${i}`).lastInsertRowid);
});
fs.writeFileSync(path.join(PHOTO_DIR, 'r11b00000000000000000001.jpg'), jpeg(1600, 1067, 9));
for (const w of [480, 960, 1200]) fs.writeFileSync(path.join(PHOTO_DIR, `r11b00000000000000000001-w${w}.jpg`), jpeg(w, Math.round(1067 * w / 1600), 9));
addPhoto.run(plainId, 'r11b00000000000000000001.jpg', 'r11previewb');

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
  fs.rmSync(PHOTO_DIR, { recursive: true, force: true });
});
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const admin = (p, body) => fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ENRICHMENT_ADMIN_TOKEN}` }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const thumbsIn = (html) => html.match(/<button type="button" class="vg-thumb"[\s\S]*?<\/button>/g) || [];
const mosaicStrip = (html) => (/<div class="vg-mosaic">[\s\S]*?<div class="vg-strip[^"]*">([\s\S]*?)<\/div><\/div>/.exec(html) || [])[1] || '';
const phoneStrip = (html) => (/<div class="vg-phone"><div class="vg-strip[^"]*">([\s\S]*?)<\/div>/.exec(html) || [])[1] || '';

// The tests below run in order: before the backfill, the backfill, after it.

test('R11 speed: before the 160/240px copies exist, the strip keeps the 480px copy (no srcset) and still waits for the photo', async () => {
  const page = await get('/naramata/wineries/r11-gallery-winery');
  assert.equal(page.status, 200);
  const thumbs = thumbsIn(mosaicStrip(page.text));
  assert.equal(thumbs.length, 4);
  for (const t of thumbs) {
    assert.match(t, /<img data-src="\/images\/owner\/r11a\d+-w480\.jpg\?v=[0-9a-f]{10}" width="1600" height="1067" alt="" loading="lazy" fetchpriority="low" decoding="async">/);
    assert.doesNotMatch(t, /data-srcset|-w160|-w240/, 'no small copy yet, so no srcset');
    assert.match(t, /<noscript><img src="\/images\/owner\/r11a\d+-w480\.jpg\?v=[0-9a-f]{10}" width="1600" height="1067" alt=""><\/noscript>/, 'no JavaScript: the plain image');
    assert.doesNotMatch(t.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''), /<img src=/, 'nothing downloads before the script lets it');
  }
});

test('R11 speed: the admin backfill lists, stores and serves the 160 and 240px copies; the upload accepts them', async () => {
  const list = await admin('/admin/owner-photos/sizes');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.sizes, [160, 240, 480, 960, 1200]);
  const item = list.body.photos.find((p) => p.id === photoIds[1]);
  assert.deepEqual(item.has, [480, 960, 1200]);
  assert.deepEqual(item.needs, [160, 240], 'a photo with its round 9 copies needs only the two small ones');
  // Wrong width or shape is refused; a good pair is stored.
  assert.equal((await admin(`/admin/owner-photos/${photoIds[1]}/sizes`, { w160: dataUrl(jpeg(200, 133)) })).status, 400);
  assert.equal((await admin(`/admin/owner-photos/${photoIds[1]}/sizes`, { w240: dataUrl(jpeg(240, 240)) })).status, 400);
  assert.equal((await admin(`/admin/owner-photos/${photoIds[1]}/sizes`, { w320: dataUrl(jpeg(320, 213)) })).status, 400, 'unknown size');
  for (const [i, id] of photoIds.entries()) {
    const r = await admin(`/admin/owner-photos/${id}/sizes`, { w160: dataUrl(jpeg(160, 107, i + 1)), w240: dataUrl(jpeg(240, 160, i + 1)) });
    assert.equal(r.status, 200, `${i} ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body.has, [160, 240, 480, 960, 1200]);
  }
  assert.equal((await admin('/admin/owner-photos/sizes')).body.photos.find((p) => p.id === photoIds[1]).needs.length, 0);
  const served = await fetch(`${base}/images/owner/${STEMS[1]}-w160.jpg`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await served.arrayBuffer()).length, fs.readFileSync(path.join(PHOTO_DIR, `${STEMS[1]}-w160.jpg`)).length);
  assert.equal((await fetch(`${base}/images/owner/r11b00000000000000000001-w160.jpg`)).status, 404, 'a copy never made is a 404');
  assert.equal(app.photoSized(`/images/owner/${STEMS[1]}.jpg`, 240), `/images/owner/${STEMS[1]}-w240.jpg`);
  // The owner upload page makes them in the browser and the upload route accepts them.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /\[160, 240, 480, 960, 1200\]\.forEach\(function\(cw\)\{/);
  assert.match(src, /saveOwnerPhotoCopies\(file, dims, \{ w160: body\.image_w160, w240: body\.image_w240, /);
});

test('R11 speed: the strip lists 160/240/480px copies with sizes for its box; the phone copy sits after the buttons', async () => {
  const page = (await get('/naramata/wineries/r11-gallery-winery')).text;
  const mosaic = thumbsIn(mosaicStrip(page));
  const phone = thumbsIn(phoneStrip(page));
  assert.equal(mosaic.length, 4);
  assert.equal(phone.length, 4, 'the same four thumbnails');
  for (const [i, t] of mosaic.entries()) {
    const stem = STEMS[i + 1];
    assert.match(t, new RegExp(`data-src="/images/owner/${stem}-w480\\.jpg\\?v=[0-9a-f]{10}" data-srcset="/images/owner/${stem}-w160\\.jpg\\?v=[0-9a-f]{10} 160w, /images/owner/${stem}-w240\\.jpg\\?v=[0-9a-f]{10} 240w, /images/owner/${stem}-w480\\.jpg\\?v=[0-9a-f]{10} 480w" sizes="\\(min-width: 900px\\) 220px, 96px"`));
    assert.match(phone[i], new RegExp(`data-srcset="/images/owner/${stem}-w160\\.jpg\\?v=[0-9a-f]{10} 160w, [^"]+" sizes="80px"`));
    assert.match(phone[i], new RegExp(`aria-label="Open photo ${i + 2} of 5"`));
  }
  // Order in the page: hero, mosaic strip, the button row, the phone strip with the credit, then the description.
  const at = (s) => page.indexOf(s);
  assert.ok(at('<div class="vg-mosaic">') < at('<div class="venue-cta-row"'));
  assert.ok(at('<div class="venue-cta-row"') < at('<div class="vg-phone">'));
  assert.ok(at('<div class="vg-phone">') < at('<p class="venue-description"'));
  assert.match(page, /<div class="vg-phone"><div class="vg-strip vg-count-4">[\s\S]*?<\/div><p class="venue-photo-credit"[^>]*>Photo: R11 Winery<\/p><\/div>/);
  // Phones show the phone copy, wider screens the one by the photo.
  assert.match(page, /\.vg-phone \{ display: none; \}/);
  assert.match(page, /@media \(max-width: 640px\) \{\s*\.vg-mosaic \.vg-strip, \.vg-mosaic \+ \.venue-photo-credit \{ display: none; \}\s*\.vg-phone \{ display: block;/);
  // One click listener covers both strips (the viewer's script comes before the phone copy).
  assert.match(page, /document\.addEventListener\('click', function\(e\)\{ var b = e\.target && e\.target\.closest \? e\.target\.closest\('\[data-vg-open\]'\)/);
  // The wide-screen layout rule that drops the button row's margin ignores the hidden phone copy.
  assert.match(page, /\.venue-cta-row:not\(:has\(~ :not\(\.venue-description, \.venue-editorial, \.vg-phone, script\)\)\)/);
  // French: the same, with French labels.
  db.prepare("UPDATE venues SET description_fr = 'Un domaine fictif pour les tests.' WHERE id = ?").run(galleryId);
  const fr = (await get('/fr/naramata/wineries/r11-gallery-winery'));
  assert.equal(fr.status, 200);
  assert.match(fr.text, /<html lang="fr"/);
  {
    assert.match(phoneStrip(fr.text), /aria-label="Ouvrir la photo 2 sur 5"/);
    assert.match(fr.text, /<div class="vg-phone">[\s\S]*?Photo : R11 Winery/);
  }
});

test('R11 speed: the hero sizes match its box, the preload repeats them, and the hero-ready signal is first in <head>', async () => {
  const page = (await get('/naramata/wineries/r11-gallery-winery')).text;
  const hero = /<div class="venue-hero venue-hero-photo"><img ([^>]+)>/.exec(page)[1];
  const sizes = /sizes="([^"]+)"/.exec(hero)[1];
  assert.equal(sizes, '(max-width: 480px) and (min-resolution: 2.75dppx) 320px, (max-width: 640px) calc(100vw - 32px), (max-width: 899px) calc(100vw - 48px), (max-width: 1359px) calc((100vw - 56px) * 2 / 3), 870px');
  const head = page.split('</head>')[0];
  const preload = /<link rel="preload" as="image" imagesrcset="([^"]+)" imagesizes="([^"]+)" fetchpriority="high">/.exec(head);
  assert.ok(preload);
  assert.equal(preload[1], /srcset="([^"]+)"/.exec(hero)[1], 'the same candidates as the <img>');
  assert.equal(preload[2], sizes, 'the same sizes as the <img>');
  // roamAfterHero is defined straight after the charset, before the analytics snippet that waits on it.
  assert.match(head, /^[\s\S]*?<meta charset="UTF-8">\n<script>\n\(function\(\)\{\n  var q = \[\], done = false;[\s\S]*?window\.roamAfterHero = function/);
  if (head.includes('gtag(')) assert.ok(head.indexOf('window.roamAfterHero = ') < head.indexOf('gtag('));
  // Without a gallery a computer still asks for the 1200px copy.
  const single = (await get('/naramata/wineries/r11-single-photo-winery')).text;
  const singleHero = /<div class="venue-hero venue-hero-photo"><img ([^>]+)>/.exec(single)[1];
  assert.match(singleHero, /sizes="\(max-width: 480px\) and \(min-resolution: 2\.75dppx\) 320px, \(max-width: 640px\) calc\(100vw - 32px\), \(max-width: 899px\) calc\(100vw - 48px\), 1200px"/);
  assert.doesNotMatch(single, /class="vg-phone"/, 'one photo: no strip');
  // A venue with no photo has neither the preload nor the hero-ready signal.
  const bare = Number(db.prepare(`INSERT INTO venues (name, region, type, description, slug) VALUES ('R11 No Photo Winery', 'naramata', 'winery', 'Fixture.', 'r11-no-photo-winery')`).run().lastInsertRowid);
  const none = app.renderVenuePage(app.getVenue(bare), [], [], []);
  assert.doesNotMatch(none.split('</head>')[0], /rel="preload" as="image"|window\.roamAfterHero = /);
});

test('R11 speed: the thumbnail loader waits for the photo, then loads only the strip on screen (the other on resize)', async () => {
  const page = (await get('/naramata/wineries/r11-gallery-winery')).text;
  const script = (page.match(/<script>\s*\(function\(\)\{\s*function show\(img\)[\s\S]*?<\/script>/) || [''])[0].replace(/^<script>|<\/script>$/g, '');
  assert.ok(script, 'the loader is in the page');
  assert.ok(page.indexOf(script) > page.indexOf('<div class="vg-phone">'), 'after both strips');
  const mkImg = (visible) => {
    const a = { 'data-src': '/a-w480.jpg', 'data-srcset': '/a-w160.jpg 160w, /a-w240.jpg 240w' };
    return { visible, attrs: a, getAttribute: (k) => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: (k) => { delete a[k]; }, getClientRects() { return this.visible ? [1] : []; } };
  };
  const shown = [mkImg(true), mkImg(true)], hidden = [mkImg(false), mkImg(false)];
  const all = shown.concat(hidden);
  const listeners = {};
  const queue = [];
  const ctx = {
    document: { querySelectorAll: () => all.filter((i) => 'data-src' in i.attrs), querySelector: () => null },
    window: { roamAfterHero: (fn) => queue.push(fn), addEventListener: (ev, fn) => { listeners[ev] = fn; } },
    setTimeout: () => {},
  };
  vm.runInNewContext(script, ctx);
  assert.ok(all.every((i) => !('src' in i.attrs)), 'nothing before the photo has loaded');
  assert.equal(queue.length, 1);
  queue[0]();
  for (const i of shown) { assert.equal(i.attrs.src, '/a-w480.jpg'); assert.equal(i.attrs.srcset, '/a-w160.jpg 160w, /a-w240.jpg 240w'); assert.ok(!('data-src' in i.attrs)); }
  assert.ok(hidden.every((i) => !('src' in i.attrs)), 'the hidden strip is not downloaded');
  hidden.forEach((i) => { i.visible = true; });
  listeners.resize();
  assert.ok(hidden.every((i) => i.attrs.src === '/a-w480.jpg'), 'shown after a rotation');
  // Without roamAfterHero: waits for the hero's load event.
  const heroEvents = {};
  const one = mkImg(true);
  vm.runInNewContext(script, {
    document: { querySelectorAll: () => ('data-src' in one.attrs ? [one] : []), querySelector: () => ({ complete: false, addEventListener: (ev, fn) => { heroEvents[ev] = fn; } }) },
    window: { addEventListener: () => {} }, setTimeout: () => {},
  });
  assert.ok(!('src' in one.attrs));
  heroEvents.load();
  assert.equal(one.attrs.src, '/a-w480.jpg');
});

test('R11 speed: every guide banner photo has a 1200px copy, listed between the 800px and full-size ones', () => {
  const dir = path.join(__dirname, '..', 'public', 'images', 'guides');
  const originals = fs.readdirSync(dir).filter((f) => /-800\.jpg$/.test(f)).map((f) => f.replace(/-800\.jpg$/, '.jpg')).filter((f) => fs.existsSync(path.join(dir, f)));
  assert.ok(originals.length >= 30);
  for (const f of originals) {
    const mid = path.join(dir, f.replace(/\.jpg$/, '-1200.jpg'));
    assert.ok(fs.existsSync(mid), `${f} has a 1200px copy`);
    const d = app.jpegDimensions(fs.readFileSync(mid));
    assert.equal(d.width, 1200, f);
    assert.ok(fs.statSync(mid).size < fs.statSync(path.join(dir, f)).size, `${f}: the copy is smaller`);
  }
  const out = app.withSmallBanner('<div class="category-banner"><img src="/images/guides/fall-forest-hiker.jpg" alt=""></div>');
  assert.match(out, /srcset="\/images\/guides\/fall-forest-hiker-800\.jpg 800w, \/images\/guides\/fall-forest-hiker-1200\.jpg 1200w, \/images\/guides\/fall-forest-hiker\.jpg 1600w"/);
});
