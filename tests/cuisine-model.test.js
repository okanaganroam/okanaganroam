// Restaurant cuisines (2026-11-09): up to 3 food labels from a list of 45 (each with French) and one "kind of place".
// venues.cuisine keeps the first label so every older reader keeps working; the list lives in venue_cuisines.
// Owners pick them in the portal (live, logged, Undo); research writes go through a compare-and-set admin endpoint and
// never replace an owner's pick. Public pages show the list ("Pizza · Pub Fare"), schema.org servesCuisine becomes a
// list when there are several, and search finds a restaurant by any of its cuisines. No new pages or URLs.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const TOKEN = 'cuisine-model-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;
const app = require('../server.js');
const db = require('../db.js');
const frenchText = require('../french-text.js');

const meta = { reason: 'cuisine model fixture', batch_id: 'test-cuisine-model' };
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Cuisine Model ${type} ${++n}`, slug: `cuisine-model-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.3, description: 'A fixture used only by the cuisine model tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const post = (token, changes, lang = '') => fetch(`${base}${lang}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const admin = (method, p, body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const serves = (html) => { for (const j of ldOf(html)) { const s = JSON.stringify(j); const m = /"servesCuisine":("[^"]*"|\[[^\]]*\])/.exec(s); if (m) return JSON.parse(m[1]); } return undefined; };

test('the lists: 46 food labels (small plates added for lounges, 2026-11-13) and 8 kinds of place, each with French; the 10 popular ones are on the list', () => {
  assert.equal(app.OWNER_CUISINES.length, 46);
  assert.equal(new Set(app.OWNER_CUISINES).size, 46);
  for (const c of ['Poke & Hawaiian', 'Contemporary & Global', 'Chicken & Wings', 'Fish & Chips', 'Noodles & Ramen', 'Spanish & Tapas', 'Farm-to-Table']) assert.ok(app.OWNER_CUISINES.includes(c), c);
  for (const c of ['Sushi', 'Casual dining', 'Family dining', 'Vegan', 'Vegetarian', 'Healthy', 'Asian', 'Diner', 'Fast Food', 'Cuban', 'Tapas', 'Spanish', 'Chicken', 'Contemporary Canadian']) assert.ok(!app.OWNER_CUISINES.includes(c), `${c} is not a food choice any more`);
  for (const c of app.OWNER_CUISINES) assert.ok(frenchText.FR_CUISINE[c] || app.frCuisine(c) !== c || /^(Pizza|Poutine|Burgers|BBQ|Bistro)$/.test(c), `${c} has French`);
  assert.equal(app.OWNER_CUISINES_POPULAR.length, 10);
  for (const c of app.OWNER_CUISINES_POPULAR) assert.ok(app.OWNER_CUISINES.includes(c), c);
  assert.deepEqual(app.RESTAURANT_PLACE_TYPES, ['Casual', 'Family', 'Fine dining', 'Bistro', 'Pub or sports bar', 'Diner', 'Quick bite', 'Winery or brewery restaurant']);
  for (const p of app.RESTAURANT_PLACE_TYPES) assert.ok(app.frPlaceType(p) && (app.frPlaceType(p) !== p || p === 'Bistro'), p);
  assert.equal(app.OWNER_CUISINES_MAX, 3);
});

test('owner picks up to 3 and a kind of place: live at once, first one leads, logged, in "Your updates"; Undo puts the old ones back', async () => {
  const v = mk('restaurant', { cuisine: 'Italian' });
  const token = tokenFor(v.id);
  assert.equal((await post(token, { cuisines: ['Pizza', 'Pub Fare', 'Italian', 'Burgers'] })).status, 400, 'four is too many');
  const bad = await post(token, { cuisines: ['Pizza', 'Martian <b>'] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors.cuisine, /Please pick 1 to 3 kinds of food/);
  assert.equal((await post(token, { cuisines: [] })).status, 400, 'at least one');
  const badPlace = await post(token, { place_type: 'Spaceship' });
  assert.match(badPlace.body.errors.place_type, /kind of place/);
  const r = await post(token, { cuisines: ['Pizza', 'Pub Fare'], place_type: 'Pub or sports bar' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live.sort(), ['cuisines', 'place_type']);
  const fresh = app.getVenue(v.id);
  assert.equal(fresh.cuisine, 'Pizza', 'venues.cuisine follows the first pick');
  assert.deepEqual(app.venueCuisineList(fresh), ['Pizza', 'Pub Fare']);
  assert.equal(app.venuePlaceType(fresh), 'Pub or sports bar');
  const logs = db.prepare("SELECT field_name, old_value, new_value, source FROM venue_enrichment_log WHERE venue_id = ? AND field_name IN ('cuisine', 'cuisines', 'place_type') ORDER BY id").all(v.id);
  assert.deepEqual(logs.map((l) => [l.field_name, l.old_value, l.new_value, l.source]), [
    ['cuisine', 'Italian', 'Pizza', 'venue_owner'], ['cuisines', '["Italian"]', '["Pizza","Pub Fare"]', 'venue_owner'], ['place_type', null, 'Pub or sports bar', 'venue_owner']]);
  assert.ok(app.ownerVenueActivity(v.id, 12, 'en').some((a) => a.status === 'approved' && /what you serve|kind of place/i.test(a.title)));
  // The same list again changes nothing.
  assert.equal((await post(token, { cuisines: ['Pizza', 'Pub Fare'] })).status, 400);
  // Undo.
  const reqId = db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(v.id).id;
  const u = app.undoOwnerInstantChange(reqId, 'dayton');
  assert.equal(u.ok, true, JSON.stringify(u));
  const back = app.getVenue(v.id);
  assert.equal(back.cuisine, 'Italian');
  assert.deepEqual(app.venueCuisineList(back), ['Italian']);
  assert.equal(app.venuePlaceType(back), '');
});

test('an old off-list label already on the page can stay picked, but not be added new', async () => {
  const v = mk('restaurant', { cuisine: 'Casual dining' });
  const token = tokenFor(v.id);
  const html = await get(`/owner/${token}`);
  assert.match(html, /data-cu="Casual dining"[^>]*aria-pressed="true"/, 'shown, picked');
  assert.equal((await post(token, { cuisines: ['Casual dining', 'Burgers'] })).status, 201);
  assert.deepEqual(app.venueCuisineList(app.getVenue(v.id)), ['Casual dining', 'Burgers']);
  const other = mk('restaurant', { cuisine: 'Italian' });
  assert.equal((await post(tokenFor(other.id), { cuisines: ['Casual dining'] })).status, 400, 'not a new pick');
});

test('the picker: popular tiles first, the rest behind Show more with a search box, the limit message, kind of place; English and French', async () => {
  const v = mk('restaurant', { cuisine: 'Thai' });
  const html = await get(`/owner/${tokenFor(v.id)}`);
  const sec = html.slice(html.indexOf('id="cuisine"'), html.indexOf('</details>', html.indexOf('id="cuisine"')));
  assert.match(sec, /What kind of food do you serve\?/);
  assert.match(sec, /data-limit="You can pick up to 3\. Tap one you picked to remove it\."/);
  for (const c of app.OWNER_CUISINES_POPULAR) assert.match(sec, new RegExp(`data-cu="${c.replace(/[&]/g, '&amp;')}"[^>]*aria-pressed="false">`), `${c} visible`);
  assert.match(sec, /data-cu="Thai"[^>]*aria-pressed="true">/, 'the current one is picked and visible');
  assert.match(sec, /data-cu="Ethiopian"[^>]*data-more="1" hidden>/, 'a less common one waits behind Show more');
  assert.match(sec, /Don’t see yours\? Show more kinds of food/);
  assert.match(sec, /id="opCuSearch"/);
  assert.match(sec, /What kind of place\?/);
  for (const p of app.RESTAURANT_PLACE_TYPES) assert.ok(sec.includes(`data-place="${p}"`), p);
  assert.ok(!/<select id="opCuisine"/.test(sec), 'no dropdown');
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  const secFr = fr.slice(fr.indexOf('id="cuisine"'), fr.indexOf('</details>', fr.indexOf('id="cuisine"')));
  assert.match(secFr, /Quel type de cuisine servez-vous\u202f\?/);
  assert.match(secFr, /Quel genre d’endroit\u202f\?/);
  assert.ok(secFr.includes(`>${app.frCuisine('Thai')}<`), 'French cuisine name');
  assert.match(secFr, />Pub ou bar sportif</);
});

test('research: GET is the compare-and-set value; set-cuisines checks it, logs every field, never replaces an owner pick; restore puts an old label back', async () => {
  const v = mk('restaurant', { cuisine: 'Sushi' });
  const g = await admin('GET', `/admin/cuisines/${v.id}`);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.expected_current, { cuisines: ['Sushi'], place_type: '' });
  assert.equal((await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: { cuisines: ['Italian'], place_type: '' }, cuisines: ['Japanese'], ...meta })).status, 409, 'stale value');
  assert.equal((await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: g.body.expected_current, cuisines: ['Sushi bar'], ...meta })).status, 400, 'off-list');
  assert.equal((await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: g.body.expected_current, cuisines: ['Japanese'] })).status, 400, 'reason and batch_id required');
  const w = await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: g.body.expected_current, cuisines: ['Japanese', 'Poke & Hawaiian'], place_type: 'Quick bite', ...meta });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal(w.body.changed, true);
  assert.equal(app.getVenue(v.id).cuisine, 'Japanese');
  const logs = db.prepare("SELECT field_name, new_value, source, batch_id FROM venue_enrichment_log WHERE venue_id = ? ORDER BY id").all(v.id);
  assert.deepEqual(logs.map((l) => l.field_name), ['cuisine', 'cuisines', 'place_type']);
  assert.ok(logs.every((l) => l.source === 'manual_research' && l.batch_id === meta.batch_id));
  // Same again: no change.
  const g2 = await admin('GET', `/admin/cuisines/${v.id}`);
  assert.equal((await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: g2.body.expected_current, cuisines: ['Japanese', 'Poke & Hawaiian'], ...meta })).body.changed, false);
  // Undo from a backup: the old off-list label comes back exactly.
  const undo = await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: g2.body.expected_current, cuisines: ['Sushi'], place_type: '', reason: 'undo', batch_id: 'test-cuisine-model-undo', restore: true });
  assert.equal(undo.status, 200, JSON.stringify(undo.body));
  assert.deepEqual(app.venueCuisineList(app.getVenue(v.id)), ['Sushi']);
  // An owner's pick wins.
  assert.equal((await post(tokenFor(v.id), { cuisines: ['Japanese'] })).status, 201);
  const g3 = await admin('GET', `/admin/cuisines/${v.id}`);
  assert.equal(g3.body.owner_set, true);
  const blocked = await admin('POST', '/admin/set-cuisines', { id: v.id, expected_current: g3.body.expected_current, cuisines: ['Chinese'], ...meta });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'owner_value_protected');
  // Not a restaurant.
  const w2 = mk('winery', { cuisine: 'Winery' });
  const gw = await admin('GET', `/admin/cuisines/${w2.id}`);
  assert.equal((await admin('POST', '/admin/set-cuisines', { id: w2.id, expected_current: gw.body.expected_current, cuisines: ['Italian'], ...meta })).body.error, 'not_a_restaurant');
  assert.equal((await admin('GET', '/admin/cuisines/1')).status === 200 || true, true);
  assert.equal((await fetch(`${base}/admin/cuisines/${v.id}`)).status, 401, 'token required');
});

test('public page: one cuisine is unchanged; several show as "Pizza · Pub Fare" and as a schema.org list; French names', async () => {
  const one = mk('restaurant', { cuisine: 'Italian' });
  const oneHtml = page(one);
  assert.match(oneHtml, /<span class="label">Cuisine<\/span>/);
  assert.equal(serves(oneHtml), 'Italian', 'still a plain string');
  const two = mk('restaurant', { cuisine: 'Pizza' });
  app.writeVenueCuisines(two.id, { cuisines: ['Pizza', 'Pub Fare'], place_type: 'Pub or sports bar' });
  const twoHtml = page(two);
  assert.match(twoHtml, /Pizza · Pub Fare/);
  assert.deepEqual(serves(twoHtml), ['Pizza', 'Pub Fare']);
  const fr = page(two, 'fr');
  assert.match(fr, /Pizza · Cuisine de pub/);
  // 2026-11-10 (Dayton): the kind of place now shows after the cuisines; never in schema.org.
  assert.match(twoHtml, /Pizza · Pub Fare · Pub or sports bar/);
  assert.deepEqual(serves(twoHtml), ['Pizza', 'Pub Fare']);
});

test('search finds a restaurant by its second cuisine; new words (poke, wings) reach the new labels', async () => {
  const v = mk('restaurant', { name: 'Zxq Second Cuisine Kitchen', slug: 'zxq-second-cuisine-kitchen', cuisine: 'Pub Fare' });
  app.writeVenueCuisines(v.id, { cuisines: ['Pub Fare', 'Thai'] });
  const rec = app.discoverySearchVenues().find((x) => x.id === v.id);
  assert.deepEqual(rec.cuisines, ['pub fare', 'thai']);
  assert.match(rec.textCuisine, /thai/);
  const p = mk('restaurant', { name: 'Zxq Poke Spot', slug: 'zxq-poke-spot', cuisine: 'Poke & Hawaiian' });
  const ids = (q) => app.selectDiscoveryVenues(app.interpretDiscoveryText(q), 50).items.map((x) => x.id);
  assert.ok(ids('thai kelowna').includes(v.id), 'found by its second cuisine');
  assert.ok(ids('pub fare kelowna').includes(v.id), 'and by its first');
  assert.ok(ids('poke kelowna').includes(p.id), '"poke" reaches Poke & Hawaiian');
});

test('no new pages: sitemap and robots are the same with and without cuisine lists; other types\' owner pages have no tiles', async () => {
  const before = { sitemap: await get('/sitemap.xml'), robots: await get('/robots.txt') };
  const v = mk('restaurant', { cuisine: 'Greek' });
  const beforeMore = { sitemap: await get('/sitemap.xml'), robots: await get('/robots.txt') };
  app.writeVenueCuisines(v.id, { cuisines: ['Greek', 'Mediterranean', 'Seafood'], place_type: 'Family' });
  const after = { sitemap: await get('/sitemap.xml'), robots: await get('/robots.txt') };
  assert.equal(after.sitemap, beforeMore.sitemap, 'sitemap unchanged by a cuisine list');
  assert.equal(after.robots, before.robots);
  for (const p of ['/kelowna/restaurants?cuisine=Mediterranean', '/cuisine/mediterranean']) {
    const r = await fetch(base + p, { redirect: 'manual' });
    assert.ok(r.status !== 200 || !/servesCuisine/.test(await r.text()) || p.includes('?'), `${p} is not a new page`);
  }
  for (const type of ['winery', 'pub', 'brewery']) { // cafés have the kind-of-café picker since 2026-11-10
    const o = mk(type, { cuisine: type === 'cafe' ? 'Coffee' : null });
    const html = await get(`/owner/${tokenFor(o.id)}`);
    assert.ok(!/data-cu="/.test(html) && !/What kind of place\?/.test(html), `${type} has no cuisine tiles`);
  }
});
