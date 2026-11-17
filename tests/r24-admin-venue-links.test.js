// Researched venue links (2026-10-27): GET /admin/venue-links/:id and POST /admin/set-venue-links write a menu or
// booking link straight to venue_links, one field at a time with compare-and-set, logged as source 'research'. They
// never touch owner_change_requests, so the venue stays unclaimed (no "Verified by the business" pill), and a link the
// owner set last is kept unless force_owner: true.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r24-venue-links-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `venue-links-fixture-${++n}`, region: 'kelowna', type: 'restaurant', latitude: 49.885 + n / 1000, longitude: -119.46, rating: 4.4,
  description: 'A fixture restaurant used only by the researched venue links tests.', hours: JSON.stringify(open('11:00', '22:00')), ...o });
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const MENU = 'https://example.com/menu';
const MENU2 = 'https://example.com/menu-fall';
const BOOK = 'https://example.com/book';

async function withServer(fn) {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
  const post = async (body, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/set-venue-links`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const read = async (id, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/venue-links/${id}`, { headers: auth(token) });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  };
  try { await fn({ post, read }); } finally { await new Promise((resolve) => srv.close(resolve)); }
}

test('GET /admin/venue-links/:id: bearer token, 404, the links shape', async () => {
  const v = mk({ name: 'Links Read Bistro' });
  await withServer(async ({ read }) => {
    assert.equal((await read(v.id, 'wrong')).status, 401);
    assert.equal((await read(v.id, null)).status, 401);
    const missing = await read(999999);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'venue_not_found');
    const r = await read(v.id);
    assert.equal(r.status, 200);
    assert.equal(r.cache, 'no-store');
    assert.deepEqual(r.body, { id: v.id, name: 'Links Read Bistro', type: 'restaurant', redirect_to: null,
      links: { menu_url: null, booking_url: null, instagram_url: null, facebook_url: null, open_months: null } });
  });
});

test('POST /admin/set-venue-links: auth, strict keys, required meta, field allowlist, URL rules, compare-and-set, redirect, clear', async () => {
  const v = mk({ name: 'Links Write Bistro' });
  const base = { id: v.id, field: 'menu_url', expected_current: null, value: MENU, reason: 'venue website menu page', batch_id: 'menus-2026-10-27', source_url: 'https://example.com/' };
  await withServer(async ({ post, read }) => {
    assert.equal((await post(base, 'wrong')).status, 401);
    assert.equal((await post(base, null)).status, 401);
    assert.equal((await post({ ...base, extra: 1 })).status, 400, 'unexpected key');
    assert.match((await post({ ...base, instagram_url: 'x' })).body.error, /Unexpected field/);
    assert.equal((await post({ ...base, id: 'x' })).status, 400);
    const { expected_current: _e, ...noExpected } = base;
    assert.equal((await post(noExpected)).status, 400, 'expected_current is required');
    const { value: _v, ...noValue } = base;
    assert.equal((await post(noValue)).status, 400, 'value is required');
    assert.equal((await post({ ...base, reason: '' })).body.error, 'invalid_meta');
    const { batch_id: _b, ...noBatch } = base;
    assert.equal((await post(noBatch)).body.error, 'invalid_meta');
    for (const field of ['open_months', 'website', undefined]) {
      const r = await post({ ...base, field });
      assert.equal(r.status, 400, String(field));
      assert.equal(r.body.error, 'invalid_field');
    }
    for (const bad of ['javascript:alert(1)', 'ftp://example.com/menu', 'example.com/menu', 'https://example.com/a b', '', 5, `https://example.com/${'x'.repeat(481)}`]) {
      const r = await post({ ...base, value: bad });
      assert.equal(r.status, 400, String(bad));
      assert.equal(r.body.error, 'invalid_value');
    }
    assert.equal((await post({ ...base, value: `https://example.com/${'x'.repeat(480)}`, id: 999999 })).status, 404, '500 chars is fine; the venue is missing');
    assert.equal((await post({ ...base, source_url: 'not a url' })).body.error, 'invalid_source_url');
    assert.equal((await post({ ...base, force_owner: 'yes' })).status, 400);
    assert.equal((await post({ ...base, expected_current: 5 })).body.error, 'invalid_expected');
    const nf = await post({ ...base, id: 999999 });
    assert.equal(nf.status, 404);
    assert.equal(nf.body.error, 'venue_not_found');

    // Nothing written by any of the refusals.
    assert.equal(app.venueLinks(v.id).menu_url, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE venue_id = ?').get(v.id).n, 0);

    const ok = await post(base);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body, { id: v.id, field: 'menu_url', changedFields: ['menu_url'], value: MENU });
    assert.equal((await read(v.id)).body.links.menu_url, MENU);

    // A stale expected value: 409 mismatch with the live value; nothing changes.
    const stale = await post({ ...base, value: MENU2 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'mismatch');
    assert.deepEqual(stale.body.live, { menu_url: MENU });
    assert.equal(app.venueLinks(v.id).menu_url, MENU);

    // The same value again is a no-op (nothing logged).
    const same = await post({ ...base, expected_current: MENU });
    assert.equal(same.status, 200);
    assert.deepEqual(same.body.changedFields, []);

    // booking_url on its own, then the menu replaced and cleared.
    assert.equal((await post({ ...base, field: 'booking_url', value: BOOK })).status, 200);
    assert.equal((await post({ ...base, expected_current: MENU, value: MENU2 })).status, 200);
    assert.equal((await post({ ...base, expected_current: MENU2, value: null })).status, 200);
    const now = await read(v.id);
    assert.equal(now.body.links.menu_url, null);
    assert.equal(now.body.links.booking_url, BOOK);

    // A redirected venue is refused.
    const gone = mk({ name: 'Links Redirected Bistro' });
    db.prepare('UPDATE venues SET redirect_to = ? WHERE id = ?').run(v.id, gone.id);
    const red = await post({ ...base, id: gone.id });
    assert.equal(red.status, 409);
    assert.equal(red.body.error, 'venue_redirected');
  });
});

test('Logged as research (medium, the batch id, reviewed by Dayton), never venue_owner; no owner change request', async () => {
  const v = mk({ name: 'Links Log Bistro' });
  await withServer(async ({ post }) => {
    const r = await post({ id: v.id, field: 'menu_url', expected_current: null, value: MENU, reason: 'venue website menu page', batch_id: 'menus-log', source_url: 'https://example.com/' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
  const logs = db.prepare('SELECT field_name, old_value, new_value, source, source_ref, confidence, batch_id, reviewed_by FROM venue_enrichment_log WHERE venue_id = ?').all(v.id);
  assert.deepEqual(logs.map((l) => ({ ...l })), [{ field_name: 'menu_url', old_value: null, new_value: MENU, source: 'research', source_ref: 'venue website menu page | https://example.com/',
    confidence: 'medium', batch_id: 'menus-log', reviewed_by: 'Dayton' }]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM owner_change_requests WHERE venue_id = ?').get(v.id).n, 0);
});

test('Owner value wins: a link the owner set last is refused (409 owner_value) unless force_owner: true', async () => {
  const v = mk({ name: 'Links Owner Bistro' });
  // As applyOwnerFields leaves it: the link in venue_links and a venue_owner log row for it.
  db.prepare('INSERT INTO venue_links (venue_id, menu_url) VALUES (?, ?)').run(v.id, MENU);
  db.prepare(`INSERT INTO venue_enrichment_log (venue_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
    VALUES (?, 'menu_url', NULL, ?, 'venue_owner', 'owner update', 'high', 'owner-1', 0, 'admin')`).run(v.id, MENU);
  const body = { id: v.id, field: 'menu_url', expected_current: MENU, value: MENU2, reason: 'newer menu', batch_id: 'menus-owner' };
  await withServer(async ({ post }) => {
    const refused = await post(body);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'owner_value');
    assert.deepEqual(refused.body.live, { menu_url: MENU });
    assert.equal(app.venueLinks(v.id).menu_url, MENU);
    // The owner's booking link is not set, so a researched booking link is fine.
    assert.equal((await post({ ...body, field: 'booking_url', expected_current: null, value: BOOK })).status, 200);
    const forced = await post({ ...body, force_owner: true });
    assert.equal(forced.status, 200, JSON.stringify(forced.body));
    assert.equal(app.venueLinks(v.id).menu_url, MENU2);
    // Now research set it last: no force needed.
    assert.equal((await post({ ...body, expected_current: MENU2, value: MENU })).status, 200);
  });
});

test('Venue page: a researched menu shows "See the menu" with no "Verified by the business" pill; venueIsClaimed stays false', async () => {
  const v = mk({ name: 'Links Page Bistro' });
  assert.doesNotMatch(page(v), /See the menu/);
  assert.doesNotMatch(page(v), /<p class="venue-verified-wrap">/);
  await withServer(async ({ post }) => {
    assert.equal((await post({ id: v.id, field: 'menu_url', expected_current: null, value: MENU, reason: 'menu page', batch_id: 'menus-page' })).status, 200);
    assert.equal((await post({ id: v.id, field: 'booking_url', expected_current: null, value: BOOK, reason: 'booking page', batch_id: 'menus-page' })).status, 200);
  });
  assert.equal(app.venueIsClaimed(v.id), false);
  assert.equal(app.ownerLastUpdatedAt(v.id), null);
  assert.equal(app.claimedVenueIds().has(v.id), false);
  const html = page(v);
  assert.ok(html.includes(`<a href="${MENU}" rel="nofollow noopener" target="_blank">See the menu ↗</a>`));
  // The booking link is the venue's "Book" button now (not a detail row).
  assert.ok(html.includes(`<a class="cta secondary" href="${BOOK}" rel="nofollow noopener" target="_blank" data-track="booking">Book</a>`));
  assert.doesNotMatch(html, /<p class="venue-verified-wrap">/);
  const fr = page(v, 'fr');
  assert.match(fr, /Voir le menu/);
  assert.doesNotMatch(fr, /<p class="venue-verified-wrap">/);
});

test('Researched Instagram / Facebook links: profile/page links only, stored in canonical form, shown on the page and the card', async () => {
  const v = mk({ name: 'Links Social Bistro' });
  const base = { id: v.id, expected_current: null, reason: 'linked from the venue website', batch_id: 'socials-test', source_url: 'https://example.com/' };
  await withServer(async ({ post, read }) => {
    for (const bad of ['https://example.com/socialbistro', 'https://www.instagram.com/p/AbC123/', 'https://www.instagram.com/explore/', 'https://instagram.com/', 'https://www.instagram.com/a/b']) {
      const r = await post({ ...base, field: 'instagram_url', value: bad });
      assert.equal(r.status, 400, bad);
      assert.equal(r.body.error, 'invalid_value', bad);
    }
    for (const bad of ['https://example.com/socialbistro', 'https://www.facebook.com/', 'https://www.facebook.com/sharer/sharer.php?u=x', 'https://www.facebook.com/groups/123', 'https://www.facebook.com/events/1']) {
      const r = await post({ ...base, field: 'facebook_url', value: bad });
      assert.equal(r.status, 400, bad);
      assert.equal(r.body.error, 'invalid_value', bad);
    }
    assert.equal(app.venueLinks(v.id).instagram_url, null);
    const ig = await post({ ...base, field: 'instagram_url', value: 'https://instagram.com/social.bistro?hl=en' });
    assert.equal(ig.status, 200, JSON.stringify(ig.body));
    assert.equal(ig.body.value, 'https://www.instagram.com/social.bistro/');
    const fb = await post({ ...base, field: 'facebook_url', value: 'http://facebook.com/SocialBistro' });
    assert.equal(fb.status, 200, JSON.stringify(fb.body));
    const links = (await read(v.id)).body.links;
    assert.equal(links.instagram_url, 'https://www.instagram.com/social.bistro/');
    assert.match(links.facebook_url, /^https:\/\/(www\.)?facebook\.com\/SocialBistro/);
    // Compare-and-set against the stored canonical value; clearing works.
    assert.equal((await post({ ...base, field: 'instagram_url', value: 'https://www.instagram.com/other.bistro/' })).body.error, 'mismatch');
    assert.equal((await post({ ...base, field: 'instagram_url', expected_current: links.instagram_url, value: null })).status, 200);
    assert.equal((await post({ ...base, field: 'instagram_url', expected_current: null, value: '@social.bistro' })).status, 400, 'a bare handle is not an http(s) URL');
    assert.equal((await post({ ...base, field: 'instagram_url', expected_current: null, value: 'https://www.instagram.com/social.bistro/' })).status, 200);
  });
  const html = page(v);
  assert.ok(html.includes('<a href="https://www.instagram.com/social.bistro/" rel="nofollow noopener" target="_blank">Instagram</a>'));
  assert.match(html, />Facebook<\/a>/);
  assert.equal(app.venueIsClaimed(v.id), false);
  assert.doesNotMatch(html, /<p class="venue-verified-wrap">/);
});

test('Owner value wins for social links too', async () => {
  const v = mk({ name: 'Links Owner Social Bistro' });
  const IG = 'https://www.instagram.com/owner.bistro/';
  db.prepare('INSERT INTO venue_links (venue_id, instagram_url) VALUES (?, ?)').run(v.id, IG);
  db.prepare(`INSERT INTO venue_enrichment_log (venue_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
    VALUES (?, 'instagram_url', NULL, ?, 'venue_owner', 'owner update', 'high', 'owner-2', 0, 'admin')`).run(v.id, IG);
  await withServer(async ({ post }) => {
    const r = await post({ id: v.id, field: 'instagram_url', expected_current: IG, value: 'https://www.instagram.com/parent.company/', reason: 'research', batch_id: 'socials-owner' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'owner_value');
  });
  assert.equal(app.venueLinks(v.id).instagram_url, IG);
});
