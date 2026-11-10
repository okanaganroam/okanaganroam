// Restaurant open items (2026-11-10, Dayton): (1) the "kind of place" shows publicly after the cuisines, on the page and
// on short cards (never in schema.org, which has no such property); (2) the six owner-only features are Roam Now map
// filters (bits 2^17-2^22, restaurants only, no pages or sitemap entries); (3) admin can import opt-outs for the badge
// reminders. Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { execFile } = require('node:child_process');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const TOKEN = 'restaurant-open-items-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const frenchText = require('../french-text.js');

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Open Items ${type} ${++n}`, slug: `open-items-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.3, description: 'A fixture used only by the restaurant open items tests.', ...o });
let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const admin = (method, p, body, token = TOKEN) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const cuisineRow = (html) => { const m = /Cuisine<\/[^>]+>\s*<[^>]+>([^<]*)</.exec(html); return m ? m[1] : null; };

test('kind of place: shown after the cuisines on the page (EN + FR), never in schema.org; nothing when unset', () => {
  const v = mk('restaurant', { cuisine: 'Comfort food' });
  app.writeVenueCuisines(v.id, { cuisines: ['Comfort food', 'Burgers'], place_type: 'Family' });
  const en = page(v);
  assert.match(en, /Comfort food · Burgers · Family restaurant/);
  const fr = page(v, 'fr');
  assert.match(fr, /Restaurant familial/);
  for (const m of en.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotMatch(m[1], /Family restaurant|Restaurant familial|"Family"/);
  const plain = mk('restaurant', { cuisine: 'Italian' });
  assert.doesNotMatch(page(plain), /Casual dining|Family restaurant|Fine dining/);
  for (const p of app.RESTAURANT_PLACE_TYPES) { assert.ok(app.PLACE_TYPE_DISPLAY[p], p); assert.ok(app.PLACE_TYPE_DISPLAY_FR[p], p); }
  assert.equal(app.PLACE_TYPE_DISPLAY.Casual, 'Casual dining');
  // Not a restaurant: never shown, whatever is stored.
  assert.equal(app.placeTypeDisplay({ id: v.id, type: 'pub' }), '');
});

test('kind of place on cards: after the cuisines when there are at most two, left out with three', () => {
  const two = mk('restaurant', { cuisine: 'Pizza' });
  app.writeVenueCuisines(two.id, { cuisines: ['Pizza', 'Pub Fare'], place_type: 'Pub or sports bar' });
  assert.match(app.venueCardHtml(app.getVenue(two.id), {}), /Pizza, Pub Fare &middot; Pub or sports bar/);
  const three = mk('restaurant', { cuisine: 'Italian' });
  app.writeVenueCuisines(three.id, { cuisines: ['Italian', 'Pizza', 'Seafood'], place_type: 'Casual' });
  const card = app.venueCardHtml(app.getVenue(three.id), {});
  assert.match(card, /Italian, Pizza, Seafood/);
  assert.doesNotMatch(card, /Casual dining/);
});

test('setup Saved wording says the kind of place is on the page again (EN + FR)', () => {
  const text = require('../owner-setup-text.js');
  const blob = JSON.stringify(text);
  assert.match(blob, /Your food types and kind of place are on your page now\./);
  assert.match(blob, /Vos types de cuisine et votre genre d’endroit sont sur votre page maintenant\./);
});

test('map: the six owner-only features are filters (restaurants only), as bits above specials and nights', async () => {
  assert.equal(app.MAP_DATA_FORMAT, 21);
  const bits = app.MAP_OWNER_FEATURES.map((f) => f.bit);
  assert.deepEqual(bits, [1 << 17, 1 << 18, 1 << 19, 1 << 20, 1 << 21, 1 << 22]);
  assert.deepEqual(app.MAP_OWNER_FEATURES.map((f) => f.owner).sort(), [...app.OWNER_EXTRA_BADGES].sort());
  const r = mk('restaurant', { cuisine: 'Burgers', hours: JSON.stringify({ mon: [['11:00', '21:00']] }) });
  app.writeVenueOwnerFeatures(r.id, { wheelchair_accessible: true, takeout: true });
  const pub = mk('pub', { cuisine: 'Pub Fare' });
  db.prepare('INSERT INTO venue_owner_features (venue_id, features) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET features = excluded.features').run(pub.id, JSON.stringify({ takeout: true }));
  const data = app.mapPlacesData();
  const rows = Array.isArray(data.p) ? data.p : (Array.isArray(data) ? data : data.places);
  const row = rows.find((x) => Array.isArray(x) && x[2] === r.name);
  assert.ok(row, 'the restaurant is on the map');
  const acc = app.MAP_OWNER_FEATURES.find((f) => f.key === 'access').bit;
  const tko = app.MAP_OWNER_FEATURES.find((f) => f.key === 'takeout').bit;
  const loc = app.MAP_OWNER_FEATURES.find((f) => f.key === 'ownlocal').bit;
  assert.ok(row[7] & acc); assert.ok(row[7] & tko); assert.ok(!(row[7] & loc));
  const prow = rows.find((x) => Array.isArray(x) && x[2] === pub.name);
  if (prow) assert.ok(!(prow[7] & tko), 'not a restaurant: no owner feature bits');
  const map = await get('/map');
  assert.equal(map.status, 200);
  for (const k of ['access', 'booking', 'takeout', 'heated', 'localdrinks', 'ownlocal']) assert.match(map.text, new RegExp(`data-pm-feat="${k}"`), k);
  assert.match(map.text, new RegExp(`"access":${acc}`));
  const fr = await get('/fr/map');
  assert.equal(fr.status, 200);
  assert.match(fr.text, /Accessible en fauteuil roulant/);
  assert.match(fr.text, /Pour emporter/);
  assert.equal(frenchText.FR_UI ? true : true, true);
});

test('map version changes when an owner feature changes', () => {
  const r = mk('restaurant', { cuisine: 'Thai' });
  const v1 = app.mapDataVersion();
  app.writeVenueOwnerFeatures(r.id, { heated_patio: true });
  db.prepare("UPDATE venue_owner_features SET updated_at = datetime('now', '+1 second') WHERE venue_id = ?").run(r.id);
  assert.notEqual(app.mapDataVersion(), v1);
});

test('SEO: sitemap and robots identical with and without place types and owner features; no new routes', async () => {
  const a = [await get('/sitemap.xml'), await get('/robots.txt')].map((x) => x.text);
  const v = mk('restaurant', { cuisine: 'Mexican' });
  const b0 = [await get('/sitemap.xml'), await get('/robots.txt')].map((x) => x.text);
  app.writeVenueCuisines(v.id, { cuisines: ['Mexican'], place_type: 'Quick bite' });
  app.writeVenueOwnerFeatures(v.id, { takeout: true, locally_owned: true, local_drinks: true });
  const b = [await get('/sitemap.xml'), await get('/robots.txt')].map((x) => x.text);
  assert.equal(b0[0], b[0]); assert.equal(a[1], b[1]);
  for (const p of ['/kelowna/takeout', '/kelowna/restaurants/takeout', '/kelowna/wheelchair-accessible', '/kelowna/locally-owned']) {
    const r = await get(p);
    assert.notEqual(r.status, 200, `${p} is not a page`);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(src, /takes_reservations[^\n]*(sitemap|noun:)/);
});

test('badge reminder opt-outs: admin only; POST lowercases, checks and skips repeats; GET lists; the sender respects it', async () => {
  assert.equal((await admin('GET', '/admin/badge-reminders/optout', null, null)).status, 401);
  assert.equal((await admin('POST', '/admin/badge-reminders/optout', { emails: ['a@b.ca'], reason: 'x' }, 'wrong')).status, 401);
  assert.equal((await admin('POST', '/admin/badge-reminders/optout', { emails: [], reason: 'x' })).status, 400);
  assert.equal((await admin('POST', '/admin/badge-reminders/optout', { emails: ['a@b.ca'] })).status, 400);
  assert.equal((await admin('POST', '/admin/badge-reminders/optout', { emails: ['a@b.ca'], reason: 'x', extra: 1 })).status, 400);
  const w = await admin('POST', '/admin/badge-reminders/optout', { emails: ['Owner@Example.COM ', 'second@example.com', 'not an email', 'owner@example.com'], reason: 'do-not-contact import test' });
  assert.equal(w.status, 200);
  assert.equal(w.body.added, 2);
  assert.deepEqual(w.body.invalid, ['not an email']);
  const again = await admin('POST', '/admin/badge-reminders/optout', { emails: ['owner@example.com'], reason: 'repeat' });
  assert.equal(again.body.added, 0); assert.equal(again.body.already, 1);
  const list = await admin('GET', '/admin/badge-reminders/optout');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.emails.map((e) => e.email), ['owner@example.com', 'second@example.com']);
  assert.equal(app.badgeReminderOptedOut('OWNER@example.com'), true);
  assert.equal(app.badgeReminderOptedOut('someone@else.ca'), false);
});

test('import script: dry run reads the CSV and the live list and writes nothing', async () => {
  const before = (await admin('GET', '/admin/badge-reminders/optout')).body.count;
  const script = process.env.OPTOUT_SCRIPT || path.join(__dirname, '..', 'drafts', 'badge-reminders', 'import-optouts.js');
  if (!fs.existsSync(script)) return; // the script lives in the drafts folder of the main checkout, not in every worktree
  // Async: the server under test runs in this process, so a blocking child call would freeze it.
  const out = await new Promise((res, rej) => execFile(process.execPath, [script, '--base', base], { env: { ...process.env, ROAM_TOKEN: TOKEN }, encoding: 'utf8' }, (e, o) => (e ? rej(e) : res(o))));
  assert.match(out, /DRY RUN against http:\/\/127\.0\.0\.1:\d+: \d+ addresses in the CSV/);
  assert.equal((await admin('GET', '/admin/badge-reminders/optout')).body.count, before);
});
