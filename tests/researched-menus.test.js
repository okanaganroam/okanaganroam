// Researched menus (Dayton, 2026-11-16): GET /admin/venue-menu/:id and POST /admin/set-researched-menu put a menu typed
// up from the venue's own website on its /menu page. Until the owner taps "This is right" the page is noindex, left out
// of the sitemap and says where it came from; it never marks the venue "Verified by the business", and never goes over
// an owner's own menu or a claimed listing.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'researched-menus-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `researched-menu-fixture-${++n}`, region: 'kelowna', type: 'restaurant', latitude: 49.885 + n / 1000, longitude: -119.46, rating: 4.4,
  description: 'A fixture restaurant used only by the researched menus tests.', hours: JSON.stringify(open('11:00', '22:00')), ...o });
const DATA = { sections: [{ name: 'Mains', note: '', items: [
  { name: 'Butter Chicken', price: '18', description: 'Creamy tomato sauce', dietary: ['gluten_free'] },
  { name: 'Chana Masala', price: '15', dietary: ['vegan', 'not_a_diet'] },
  { name: 'Lamb Rogan Josh', price: '21' },
  { name: 'Palak Paneer', price: '16', dietary: ['vegetarian'] },
  { name: 'Garlic Naan', price: '4' },
  { name: 'Mango Lassi', price: '5', check: true },
] }] };
const SRC = 'https://example.com/menu';

let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => new Promise((resolve) => srv.close(resolve)));
const TOKEN = () => process.env.ENRICHMENT_ADMIN_TOKEN;
const post = async (body, token = TOKEN()) => {
  const res = await fetch(`${base}/admin/set-researched-menu`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const read = async (id, token = TOKEN()) => {
  const res = await fetch(`${base}/admin/venue-menu/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
};
const getText = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text(), robots: r.headers.get('x-robots-tag') }; };
const menuPath = (v) => `/kelowna/restaurants/${v.slug}/menu`;
const add = (v, extra = {}) => post({ id: v.id, expected_current: null, data: DATA, source_url: SRC, checked_at: '2026-11-16', reason: 'venue website menu page', batch_id: 'menus-test', ...extra });

test('auth, strict keys, validation', async () => {
  const v = mk({ name: 'Validate Curry House' });
  assert.equal((await read(v.id, 'wrong')).status, 401);
  assert.equal((await post({ id: v.id }, null)).status, 401);
  assert.equal((await post({ id: v.id }, 'wrong')).status, 401);
  assert.equal((await read(999999)).status, 404);
  assert.match((await add(v, { extra: 1 })).body.error, /Unexpected field/);
  assert.equal((await add(v, { reason: '' })).body.error, 'invalid_meta');
  assert.equal((await add(v, { expected_current: 'x' })).body.error, 'invalid_expected');
  assert.equal((await add(v, { data: [] })).body.error, 'invalid_data');
  assert.equal((await add(v, { data: { sections: [{ name: 'x', items: [] }] } })).body.error, 'invalid_data');
  assert.equal((await add(v, { source_url: 'javascript:alert(1)' })).body.error, 'invalid_source_url');
  assert.equal((await add(v, { source_url: undefined })).body.error, 'invalid_source_url');
  assert.equal((await add(v, { checked_at: '2099-01-01' })).body.error, 'invalid_checked_at');
  assert.equal((await add(v, { checked_at: 'Nov 2026' })).body.error, 'invalid_checked_at');
  assert.equal((await add({ id: 999999 })).status, 404);
  const ok = await add(v);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.items, 6);
  const st = (await read(v.id)).body;
  assert.equal(st.menu.source, 'research');
  assert.equal(st.menu.id, ok.body.menu_id);
  const row = db.prepare('SELECT * FROM venue_menus WHERE id = ?').get(ok.body.menu_id);
  const data = JSON.parse(row.data);
  assert.deepEqual(data.sections[0].items[1].dietary, ['vegan'], 'unknown diets dropped');
  assert.equal(data.sections[0].items[5].check, false, 'no yellow "please check" lines on a researched menu');
  assert.equal(row.source_url, SRC);
  assert.equal(row.source_checked_at, '2026-11-16');
  // compare-and-set
  assert.equal((await add(v)).body.error, 'mismatch');
  const replaced = await add(v, { expected_current: ok.body.menu_id });
  assert.equal(replaced.status, 200);
  assert.equal(db.prepare('SELECT status FROM venue_menus WHERE id = ?').get(ok.body.menu_id).status, 'superseded');
  // logged as research, venue not verified
  const log = db.prepare("SELECT source, field_name, batch_id FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'menu'").all(v.id);
  assert.equal(log.length, 2);
  assert.ok(log.every((l) => l.source === 'research' && l.batch_id === 'menus-test'));
  assert.equal(app.venueIsClaimed ? app.venueIsClaimed(v.id) : (await read(v.id)).body.claimed, false);
  // remove
  assert.equal((await post({ id: v.id, expected_current: null, remove: true, reason: 'x', batch_id: 'b' })).body.error, 'mismatch');
  const rm = await post({ id: v.id, expected_current: replaced.body.menu_id, remove: true, reason: 'menu changed', batch_id: 'b' });
  assert.equal(rm.status, 200);
  assert.equal((await read(v.id)).body.menu, null);
  assert.equal((await getText(menuPath(v))).status, 404);
});

test('refuses an owner menu, an owner draft, a claimed venue, a non-menu type', async () => {
  const owner = mk({ name: 'Owner Menu Bistro' });
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, datetime('now'))").run(owner.id, JSON.stringify(DATA));
  const live = (await read(owner.id)).body.menu;
  assert.equal(live.source, 'owner');
  const r = await add(owner, { expected_current: live.id });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'owner_menu');
  assert.equal((await post({ id: owner.id, expected_current: live.id, remove: true, reason: 'x', batch_id: 'b' })).body.error, 'owner_menu', 'remove never touches an owner menu');

  const drafting = mk({ name: 'Drafting Diner' });
  db.prepare("INSERT INTO venue_menus (venue_id, status) VALUES (?, 'pending')").run(drafting.id);
  assert.equal((await add(drafting)).body.error, 'owner_draft');

  const claimed = mk({ name: 'Claimed Cafe' });
  db.prepare("INSERT INTO venue_claims (venue_id, name, role, email, phone, verify_method, status) VALUES (?, 'Pat', 'owner', 'pat@example.com', '250-555-0100', 'call', 'approved')").run(claimed.id);
  const c = await add(claimed);
  assert.equal(c.status, 409);
  assert.equal(c.body.error, 'owner_verified');

  const park = mk({ name: 'Menu Fixture Park', type: 'park' });
  assert.equal((await add(park)).body.error, 'not_menu_type');
});

test('public page: noindex, out of the sitemap, source line (EN + FR); owner confirm makes it indexable', async () => {
  const v = mk({ name: 'Label Tandoori' });
  const ok = await add(v);
  assert.equal(ok.status, 200);
  const pg = await getText(menuPath(v));
  assert.equal(pg.status, 200);
  assert.match(pg.text, /<meta name="robots" content="noindex/);
  assert.match(pg.text, /From Label Tandoori’s website, checked November 2026\. Prices can change\./);
  assert.match(pg.text, /href="https:\/\/example\.com\/menu"[^>]*>See their menu ↗<\/a>/);
  const fr = app.renderVenueMenuPage ? app.renderVenueMenuPage(app.getVenue(v.id), app.publishedMenu(v.id), { lang: 'fr' }) : null;
  if (fr) {
    assert.match(fr, /Tiré du site Web/);
    assert.match(fr, /novembre 2026/);
    assert.match(fr, /Voir leur menu ↗/);
  }
  let sm = (await getText('/sitemap.xml')).text;
  assert.doesNotMatch(sm, new RegExp(`${v.slug}/menu`), 'not in the sitemap');

  // owner taps "This is right"
  const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const ownerPage = await getText(`/owner/${token}/menu`);
  assert.match(ownerPage.text, /We added your menu from your website \(checked November 2026\)/);
  assert.match(ownerPage.text, /This is right/);
  const crossSite = await fetch(`${base}/owner/${token}/menu/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(crossSite.status, 403);
  const conf = await fetch(`${base}/owner/${token}/menu/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' });
  assert.equal(conf.status, 200);
  const st = (await read(v.id)).body.menu;
  assert.ok(st.owner_confirmed_at);
  assert.equal(db.prepare("SELECT source FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'menu_confirmed'").get(v.id).source, 'venue_owner');
  const after = await getText(menuPath(v));
  assert.doesNotMatch(after.text, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(after.text, /See their menu/);
  sm = (await getText('/sitemap.xml')).text;
  assert.match(sm, new RegExp(`${v.slug}/menu`), 'in the sitemap once confirmed');
  assert.doesNotMatch((await getText(`/owner/${token}/menu`)).text, /id="mnResearch"/);
  // research can't overwrite it any more
  assert.equal((await add(v, { expected_current: st.id })).body.error, 'owner_confirmed');
});

test('owner editing a research menu and publishing makes it owner-sourced', async () => {
  const v = mk({ name: 'Edit Me Grill' });
  await add(v);
  const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const h = { 'Content-Type': 'application/json', Origin: base };
  const e = await fetch(`${base}/owner/${token}/menu/edit`, { method: 'POST', headers: h, body: '{}' });
  assert.equal(e.status, 200);
  const draft = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND status = 'ready'").get(v.id);
  assert.equal(draft.source, 'owner');
});
