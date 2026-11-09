// Owner portal: the easy setup for photos and menu (2026-11-09). Dayton: "someone who is not good with mobile devices
// or desktops will say that was very easy". Restaurants get .../setup: one question per screen, Skip on every step,
// and the owner only ever sees "Saved ✓". Everything goes through the paths the edit page already uses, with the same
// checks and the same review: /photos (now with a "Make main photo" wish), /menu/pages + /menu/help, and /changes for a
// menu link. Other types and public pages are unchanged.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-easy-setup-admin-token';
const app = require('../server.js');
const db = require('../db.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Easy Setup ${type} ${++n}`, slug: `easy-setup-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St', phone: '250-555-0142', website: 'https://example.com', description: 'A fixture used only by the easy setup tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0;
let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const get = (p, cookie) => fetch(base + p, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.21.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})), cookie: (r.headers.get('set-cookie') || '').split(';')[0] }));
// A tiny but well-formed JPEG header (SOF0 gives the size), like server.test.js.
const jpeg = (w, h) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(64), Buffer.from([0xFF, 0xD9])]);
const photo = (w, h, extra = {}) => ({ image: `data:image/jpeg;base64,${jpeg(w, h).toString('base64')}`, credit: 'Easy Setup Kitchen', rights: true, contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000, notify: false, ...extra });

test('route: a restaurant gets the setup page (edit link, French, signed in); the strings match the approved mockup', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const r = await get(`/owner/${t}/setup`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  const html = await r.text();
  assert.match(html, /window\.SETUP_CFG = /);
  for (const words of ['Add photos of your place', 'Take a photo', 'Choose from my photos', 'This one is too small. Try another.', 'These are my photos and Okanagan Roam can use them.',
    'How should we add your menu?', 'Upload my menu', 'Take photos of my menu', 'My menu is on my website', 'Email it to us', 'You’re all set!', 'Skip this for now']) {
    assert.ok(html.includes(words), `has "${words}"`);
  }
  const own = html.slice(0, html.indexOf('class="ohb-btn"')); // the setup itself, without the shared help bot
  assert.doesNotMatch(own, /waiting for (our check|review)|en attente/i, 'the setup never says "waiting"');
  assert.doesNotMatch(html, /sample photos|sample menu|For this mockup/i, 'no mockup-only buttons');
  const cfg = JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
  assert.equal(cfg.base, `/owner/${t}`);
  assert.equal(cfg.menuBase, `/owner/${t}/menu`);
  assert.equal(cfg.minEdge, 800, 'the owner-photo minimum, read from the server');
  assert.equal(cfg.mode, 'token');
  const fr = await get(`/fr/owner/${t}/setup`).then((x) => x.text());
  assert.match(fr, /<html lang="fr"/);
  assert.ok(fr.includes('Ajoutez des photos de votre établissement') && fr.includes('Comment ajouter votre menu?') && fr.includes('Téléverser mon menu'));
  assert.equal(JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(fr)[1]).base, `/fr/owner/${t}`);
  // Signed in.
  const made = await post(`/owner/${t}/account`, { email: `easy${n}@example.com`, password: 'a long enough password' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const signed = await get(`/owner/account/venue/${v.id}/setup`, made.cookie);
  assert.equal(signed.status, 200);
  assert.match(await signed.text(), /"mode":"account"/);
  assert.equal((await get(`/owner/account/venue/${v.id}/setup`)).status, 302, 'not signed in: to the login page');
  assert.equal((await get('/owner/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/setup')).status, 404, 'a bad link');
});

test('route: other types go back to their edit page; their edit pages have no setup card', async () => {
  for (const type of ['winery', 'pub', 'cafe']) {
    const v = mk(type);
    const t = tokenFor(v.id);
    const r = await get(`/owner/${t}/setup`);
    assert.equal(r.status, 302, type);
    assert.equal(r.headers.get('location'), `/owner/${t}`);
    const page = await get(`/owner/${t}`).then((x) => x.text());
    assert.doesNotMatch(page, /op-setup-card|\/setup"/, `${type} edit page unchanged`);
  }
});

test('edit page: a restaurant opens with the setup card; the checklist sends photos and menu to their setup step', async () => {
  const v = mk('restaurant', { image_url: null });
  const t = tokenFor(v.id);
  const page = await get(`/owner/${t}`).then((x) => x.text());
  assert.match(page, new RegExp(`<a class="op-setup-card" id="opSetupCard" href="/owner/${t}/setup">`));
  assert.ok(page.includes('Add your photos and menu') && page.includes('about 2 minutes'));
  assert.ok(page.indexOf('opSetupCard') < page.indexOf('id="opComplete"'), 'the card comes first');
  assert.match(page, new RegExp(`href="/owner/${t}/setup#photos">`), 'Add photos opens the photo step');
  assert.match(page, new RegExp(`href="/owner/${t}/setup#menu">`), 'the menu item opens the menu step');
  const fr = await get(`/fr/owner/${t}`).then((x) => x.text());
  assert.match(fr, new RegExp(`href="/fr/owner/${t}/setup"`));
  assert.ok(fr.includes('Ajoutez vos photos et votre menu'));
});

test('photos: same checks as the edit page; "Make main photo" is kept as a wish and applied on approval', async () => {
  const v = mk('restaurant', { image_url: '/images/venues/example-own.jpg' });
  const t = tokenFor(v.id);
  const small = await post(`/owner/${t}/photos`, photo(600, 450));
  assert.equal(small.status, 400, 'too small is still refused by the server');
  assert.match(small.body.errors.image, /too small/);
  const noRights = await post(`/owner/${t}/photos`, photo(1200, 900, { rights: false }));
  assert.equal(noRights.status, 400);
  const a = await post(`/owner/${t}/photos`, photo(1200, 900, { main: true }));
  const b = await post(`/owner/${t}/photos`, photo(1200, 900, { main: false }));
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal(a.body.live, false, 'edit link: waits for review');
  const row = (id) => ({ ...db.prepare('SELECT status, main_requested FROM owner_photos WHERE id = ?').get(id) });
  assert.deepEqual(row(a.body.id), { status: 'pending', main_requested: 1 });
  assert.deepEqual(row(b.body.id), { status: 'pending', main_requested: 0 });
  // The newest pick wins.
  const c = await post(`/owner/${t}/photos`, photo(1200, 900, { main: true }));
  assert.equal(row(a.body.id).main_requested, 0);
  assert.equal(row(c.body.id).main_requested, 1);
  // The reviewer sees the wish; approving makes it the main photo even though the listing has its own photo.
  const listed = app.listOwnerPhotos ? app.listOwnerPhotos('pending').find((p) => p.id === c.body.id) : null;
  if (listed) assert.equal(listed.main_requested, true);
  assert.equal(app.approveOwnerPhoto(b.body.id, 'test', {}).main, false, 'no wish: the listing keeps its own photo');
  const ok = app.approveOwnerPhoto(c.body.id, 'test', {});
  assert.equal(ok.main, true);
  assert.match(db.prepare('SELECT image_url FROM venues WHERE id = ?').get(v.id).image_url, /^\/images\/owner\//);
  // The reviewer can still say no.
  const d = await post(`/owner/${t}/photos`, photo(1200, 900, { main: true }));
  assert.equal(app.approveOwnerPhoto(d.body.id, 'test', { main: false }).main, false);
  // Unknown keys are still refused.
  assert.equal((await post(`/owner/${t}/photos`, photo(1200, 900, { surprise: 1 }))).status, 400);
});

test('menu: an uploaded PDF or menu photos go to the "Can you do it for me?" queue; a bad file is refused', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% easy setup test\n%%EOF').toString('base64')}`;
  const bad = await post(`/owner/${t}/menu/pages`, { pdf: `data:application/pdf;base64,${Buffer.from('not a pdf').toString('base64')}` });
  assert.equal(bad.status, 400);
  const p1 = await post(`/owner/${t}/menu/pages`, { pdf });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  const p2 = await post(`/owner/${t}/menu/pages`, { image: `data:image/jpeg;base64,${jpeg(1000, 1400).toString('base64')}` });
  assert.equal(p2.status, 201, JSON.stringify(p2.body));
  const tiny = await post(`/owner/${t}/menu/pages`, { image: `data:image/jpeg;base64,${jpeg(300, 400).toString('base64')}` });
  assert.equal(tiny.status, 400, 'a page too small to read');
  const before = sent.length;
  const help = await post(`/owner/${t}/menu/help`, { note: 'Sent from the easy setup. Please turn these pages into our menu.', contact_email: '', contact_phone: '' });
  assert.equal(help.status, 200, JSON.stringify(help.body));
  const m = db.prepare('SELECT * FROM venue_menus WHERE venue_id = ? ORDER BY id DESC').get(v.id);
  assert.equal(m.status, 'help', 'waiting for Dayton, not live');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_menu_files WHERE menu_id = ?').get(m.id).n, 2);
  assert.ok(sent.length > before, 'Dayton is told, like any "Can you do it for me?"');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND status = ?').get(v.id, 'published').n, 0, 'nothing public');
});

test('menu link: "My menu is on my website" uses the reviewed menu link path; the email step writes nothing', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const requests = () => db.prepare('SELECT COUNT(*) AS n FROM owner_change_requests WHERE venue_id = ?').get(v.id).n;
  const html = await get(`/owner/${t}/setup`).then((x) => x.text());
  assert.equal(requests(), 0, 'opening the setup writes nothing');
  // The email step only shows the address; the page never posts anything for it.
  // Full setup (2026-11-09): "I'll email it" only records the answer in the setup's own progress.
  assert.match(html, /if \(k === 'menuEmailDone'\) return progress\('menu', 'email'\)/);
  const r = await post(`/owner/${t}/changes`, { changes: { menu_url: 'example.com/our-menu' }, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const req = db.prepare("SELECT * FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' ORDER BY id DESC").get(v.id);
  assert.ok(req, 'waiting for review');
  assert.equal(req.instant, 0);
  assert.match(JSON.parse(req.changes).menu_url, /example\.com\/our-menu/);
  const link = db.prepare('SELECT menu_url FROM venue_links WHERE venue_id = ?').get(v.id);
  assert.ok(!link || !link.menu_url, 'not live until checked');
});

test('the page shows "Saved" only after the server says ok, and keeps the picks on an error', async () => {
  const v = mk('restaurant');
  const html = await get(`/owner/${tokenFor(v.id)}/setup`).then((x) => x.text());
  // Photos: a photo leaves the list only on ok; any error stops, keeps the rest and shows Try again.
  assert.match(html, /if \(j && j\.ok\) \{ S\.photos\.splice\(S\.photos\.indexOf\(ph\), 1\); i\+\+; return next\(\); \} S\.busy = false; S\.error = why\(j\); render\(\);/);
  assert.match(html, /S\.error \? T\.tryAgain/);
  // Menu: Saved only after the help request is ok.
  assert.match(html, /if \(j && j\.ok\) \{ items\.length = 0; return progress\(step, 'day'\)/);
  // Every other save: "Saved" only after /changes answers ok (or "nothing changed").
  assert.match(html, /return change\(list\[i\]\)\.then\(function\(r\)\{ if \(!r\) \{ S\.busy = false; return render\(\); \}/);
  // The script parses.
  const script = /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new (require('node:vm').Script)(script));
});

test('public pages are unchanged by the setup', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const pub = () => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now: new Date('2026-11-09T20:00:00Z') });
  const before = pub();
  await get(`/owner/${t}/setup`);
  await get(`/fr/owner/${t}/setup`);
  assert.equal(pub(), before);
  assert.doesNotMatch(before, /op-setup-card|Add your photos and menu|SETUP_CFG/);
});

test('help: the easy setup topic is on the setup page and a restaurant edit page, in English and French', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const setup = await get(`/owner/${t}/setup`).then((x) => x.text());
  assert.match(setup, /"id":"easy-setup"/);
  assert.match(setup, /How do I add my photos and menu the easy way\?/);
  assert.match(setup, /Comment ajouter mes photos et mon menu facilement\?/);
  const w = mk('winery');
  assert.doesNotMatch(await get(`/owner/${tokenFor(w.id)}`).then((x) => x.text()), /"id":"easy-setup"/, 'not on other types');
});
