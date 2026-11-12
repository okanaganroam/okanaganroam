// Pubs in the owner portal (Dayton, Nov 10 2026; drafts/pub-portal-2026-11-10/SPEC-pubs.md and SETUP-pubs.md): their own
// 100-point checklist, the easy setup with the pub-only questions (kitchen, sports, who's welcome), the new owner-only
// answers on the public page, the researched Kid-friendly badge hidden on pubs (kept stored), the pub kinds of place,
// the Complete & Verified badge for pubs, the map bits, restaurants unchanged and no new pages. Also the logged admin
// route that turns a wrong researched badge off (POST /admin/remove-amenities) and its Undo.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const ADMIN = 'owner-pubs-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = ADMIN;
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

const today = app.todayLocal();
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, d === 'mon' ? [] : [['11:30', '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Pub Test ${type} ${++n}`, slug: `pub-test-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: `${n} Main St, Penticton`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the pub portal tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`, ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
// A saved change answers 201 (created) or 200 (nothing new); both read as 200 here.
const change = (t, changes, setup = true) => postJson(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const admin = (p, body) => postJson(p, body, { Authorization: `Bearer ${ADMIN}` });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });

// ---------- Checklist ----------
test('checklist: pub weights sum to 100 in the spec groups; restaurants keep their own list', () => {
  assert.equal(pc.PUB_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  const g = {};
  for (const it of pc.PUB_ITEMS) g[it.group] = (g[it.group] || 0) + it.w;
  assert.deepEqual(g, { basics: 14, hours: 14, photos: 14, food: 17, whatson: 14, yourvisit: 10, about: 5, social: 6, finding: 3, confirmed: 3 });
  const w = Object.fromEntries(pc.PUB_ITEMS.map((i) => [i.key, i.w]));
  assert.deepEqual(w, { address_pin: 4, phone: 4, website: 3, cuisine: 3, hours: 7, hours_fresh: 4, kitchen: 3, photo_main: 8, photo_extra: 6, menu: 7, happy_hour: 6, avg_spend: 2, dietary: 2,
    entertainment: 5, sports: 4, specials: 3, games: 2, minors: 4, pyv_groups: 3, pyv_known: 3, description: 5, instagram: 3, facebook: 3, arrival: 3, owner_confirmed: 3 });
  assert.ok(!w.pyv_reservations && !w.pyv_takeout, 'booking and takeout are not scored for pubs');
  // Restaurants: the same 100 points as before, the same "we don't have one" list.
  assert.equal(pc.ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.deepEqual(pc.ITEMS.map((i) => i.key), ['address_pin', 'phone', 'website', 'cuisine', 'hours', 'hours_fresh', 'photo_main', 'photo_extra', 'avg_spend', 'menu', 'dietary', 'happy_hour', 'specials', 'entertainment', 'pyv_known', 'pyv_reservations', 'pyv_takeout', 'pyv_groups', 'description', 'instagram', 'facebook', 'arrival', 'owner_confirmed']);
  assert.deepEqual([...pc.NONE_KEYS].sort(), ['dietary', 'entertainment', 'facebook', 'happy_hour', 'instagram', 'pyv_groups', 'pyv_reservations', 'pyv_takeout', 'specials', 'website']);
  assert.deepEqual(pc.noneKeysFor('pub').sort(), ['cuisine', 'dietary', 'dogs', 'entertainment', 'facebook', 'games', 'happy_hour', 'instagram', 'pyv_groups', 'pyv_reservations', 'pyv_takeout', 'specials', 'sports', 'website']); // dogs: pub test 4; booking and takeout: café test 1 (asked in the setup); never scored
  for (const it of pc.PUB_ITEMS) assert.ok(it.en && it.fr && it.whyEn && it.whyFr && (it.fix === false || (it.btnEn && it.btnFr)), `${it.key} has its words in both languages`);
});

test('checklist: the pub-only items score from the owner answers; sports on TV is its own item', () => {
  const base0 = { type: 'pub', address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: today };
  const done = (x) => pc.doneMap({ ...base0, ...x }, today);
  assert.equal(done({}).kitchen, false);
  assert.equal(done({ pubInfo: { kitchen: { mode: 'earlier', closes: '22:00' } } }).kitchen, true);
  assert.equal(done({ pubInfo: { kitchen: { mode: 'none' } } }).cuisine, true, '"We don\'t serve food" answers the food type too');
  assert.equal(done({ pubInfo: { minors: { policy: 'adults' } } }).minors, true);
  assert.equal(done({ pubInfo: { sports: { list: ['hockey'], tvs: '' } } }).sports, true);
  assert.equal(done({ ownerFeatures: ['darts'] }).games, true);
  assert.equal(done({ sportsTv: 1 }).entertainment, false, 'for a pub, Sports on TV alone is not an event');
  assert.equal(pc.doneMap({ ...base0, type: 'restaurant', sportsTv: 1 }, today).entertainment, true, 'restaurants unchanged');
  // "We don't show sports" / "No games" count as done.
  const r = pc.scoreCompleteness({ ...base0, declaredNone: ['sports', 'games', 'pyv_takeout'] }, { today });
  assert.ok(!r.missing.some((it) => it.key === 'sports' || it.key === 'games'));
  // Café test 1 (2026-11-11): a pub's setup asks about takeout and booking, so its "No" is kept (and never scored).
  assert.ok(r.declared.includes('pyv_takeout') && !r.missing.concat(r.declined).some((it) => it.key === 'pyv_takeout'), 'a pub\u2019s unscored takeout answer is kept, never scored');
  assert.deepEqual(r.groups.map((g) => g.key), ['basics', 'hours', 'photos', 'food', 'whatson', 'yourvisit', 'about', 'social', 'finding'], 'pub groups in spec order');
  // The new rows open the setup at their own question.
  const html = pc.renderCompleteness(pc.scoreCompleteness(base0, { today }), { setupHref: '/owner/x/setup', canDecline: true });
  assert.match(html, /href="\/owner\/x\/setup#hours:kitchen"/);
  assert.match(html, /href="\/owner\/x\/setup#offer:minors"/);
  assert.match(html, /href="\/owner\/x\/setup#offer:sports"/);
});

test('badge: a pub at 100% that the business manages earns Complete & Verified; paused after 30 days', () => {
  const full = { type: 'pub', address: 'a', latitude: 1, longitude: 1, phone: '1', website: 'w', cuisine: 'Pub Fare', hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 3,
    menuUrl: 'https://x.ca/menu', hasHappyHour: true, avgSpend: 30, avgSpendSource: 'owner', vegan: 1, liveMusic: 1, specialsCount: 1, visitLabels: ['Known for', 'Groups'],
    description: 'x'.repeat(130), instagramUrl: 'i', facebookUrl: 'f', hasArrival: true, claimed: true,
    pubInfo: { kitchen: { mode: 'same' }, minors: { policy: 'all_ages' }, sports: { list: ['hockey'], tvs: '3-5' } }, ownerFeatures: ['pool'] };
  const r = pc.scoreCompleteness(full, { today });
  assert.equal(r.pct, 100);
  assert.equal(pc.badgeState(r, true), 'earned');
  assert.equal(pc.badgeState(pc.scoreCompleteness({ ...full, hoursCheckedAt: app.addLocalDays(today, -31) }, { today }), true), 'paused');
  // The server no longer turns pubs away from the badge.
  const v = mk('pub');
  db.prepare("INSERT INTO venue_claims (venue_id, name, role, email, phone, verify_method, status) VALUES (?, 'Owner', 'owner', 'o@example.com', '250', 'call', 'approved')").run(v.id);
  app.resetCompleteVerifiedCache();
  assert.equal(app.venueBadgeState(app.getVenue(v.id)), 'none', 'not complete yet');
});

// ---------- Owner saves ----------
test('pub answers: kitchen, who\'s welcome and sports save live from the setup, round-trip, and Undo puts them back', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  let r = await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '22:00', note: 'Fri and Sat, food until 11 PM' } } });
  assert.equal(r.status, 200); assert.ok(!(r.body.review || []).length, 'live, not waiting');
  r = await change(t, { pub_info: { minors: { policy: 'minors_until', until: '20:00', note: 'Patio is 19+' } } });
  assert.equal(r.status, 200);
  r = await change(t, { pub_info: { sports: { list: ['football', 'hockey'], tvs: '6-10' } } });
  assert.equal(r.status, 200);
  assert.deepEqual(app.venuePubInfo(v.id), {
    kitchen: { mode: 'earlier', closes: '22:00', note: 'Fri and Sat, food until 11 PM' }, minors: { policy: 'minors_until', until: '20:00', note: 'Patio is 19+' },
    sports: { list: ['hockey', 'football'], tvs: '6-10' } });
  // From the classic edit page (no setup flag) too: one-tap answers from fixed lists.
  r = await change(t, { pub_info: { kitchen: { mode: 'same' } } }, false);
  assert.equal(r.status, 200); assert.deepEqual(app.venuePubInfo(v.id).kitchen, { mode: 'same' });
  // The setup page reads them back.
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.cur.pub_info.minors, { policy: 'minors_until', until: '20:00', note: 'Patio is 19+' });
  // Logged, and Undo restores the one before.
  const last = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC").get(v.id).id;
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'pub_info' AND source = 'venue_owner'").get(v.id));
  const u = app.undoOwnerInstantChange(last, 'test');
  assert.equal(u.ok, true);
  assert.deepEqual(app.venuePubInfo(v.id).kitchen, { mode: 'earlier', closes: '22:00', note: 'Fri and Sat, food until 11 PM' });
  // Clearing one part.
  r = await change(t, { pub_info: { sports: null } });
  assert.equal(r.status, 200); assert.equal(app.venuePubInfo(v.id).sports, undefined);
});

test('pub answers: checked like Plan your visit lines; only pubs can send them', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  for (const bad of [{ kitchen: { mode: 'sometimes' } }, { kitchen: { mode: 'earlier' } }, { minors: { policy: 'kids' } }, { minors: { policy: 'minors_until', until: '25:00' } },
    { minors: { policy: 'adults', note: 'see www.example.com' } }, { kitchen: { mode: 'same', note: '<b>x</b>' } }, { sports: { list: ['curling'] } }, { sports: { list: ['hockey'], tvs: '50' } }, { wifi: true }, {}]) {
    const r = await change(t, { pub_info: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(app.venuePubInfo(v.id), {});
  const rest = mk('restaurant');
  assert.equal((await change(tokenFor(rest.id), { pub_info: { kitchen: { mode: 'same' } } })).status, 400, 'a restaurant cannot send pub answers');
});

test('pub kind of place: the pub list only, shown on the Cuisine row in both languages', async () => {
  const v = mk('pub', { cuisine: 'Pub Fare' }); const t = tokenFor(v.id);
  assert.equal((await change(t, { place_type: 'Casual' })).status, 400, 'a restaurant kind is refused for a pub');
  const r = await change(t, { cuisines: ['Pub Fare', 'Chicken & Wings'], place_type: 'Gastropub' });
  assert.equal(r.status, 200);
  assert.match(page(v, 'en'), /Pub Fare · Chicken &amp; Wings · Gastropub/);
  assert.match(page(v, 'fr'), /Cuisine de pub · [^<]* · Gastropub/);
  const club = mk('pub', { cuisine: 'Pub Fare' });
  await change(tokenFor(club.id), { place_type: 'Clubhouse' });
  assert.match(page(club, 'en'), /Golf or ski clubhouse/);
  const rest = mk('restaurant', { cuisine: 'Italian' });
  assert.equal((await change(tokenFor(rest.id), { place_type: 'Gastropub' })).status, 400, 'restaurants keep their own list');
});

test('pub features: local beer on tap and the games save as owner features and show as chips', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const r = await change(t, { badges: { local_beer_taps: true, darts: true, pool: true } });
  assert.equal(r.status, 200);
  const html = page(v, 'en');
  for (const w of ['Local or craft beer on tap', 'Darts', 'Pool']) assert.ok(html.includes(w), w);
  assert.ok(page(v, 'fr').includes('Fléchettes'));
  // A restaurant can't tick the pub-only ones, and a pub can't tick Kid-friendly (Who's welcome replaces it).
  assert.equal((await change(tokenFor(mk('restaurant').id), { badges: { darts: true } })).status, 400);
  assert.equal((await change(t, { badges: { kid_friendly: true } })).status, 400);
});

// ---------- Public page ----------
test('public page: kitchen and who\'s welcome lines under the hours; sports and games chips; English and French', async () => {
  const v = mk('pub', { sports_tv: 1 }); const t = tokenFor(v.id);
  await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '22:00', note: 'Fri and Sat, food until 11 PM' }, minors: { policy: 'minors_until', until: '20:00' }, sports: { list: ['hockey', 'football'], tvs: '6-10' } } });
  await change(t, { badges: { shuffleboard: true } });
  const en = page(v, 'en'), fr = page(v, 'fr');
  assert.match(en, /Kitchen closes at 10 PM/);
  assert.match(en, /Fri and Sat, food until 11 PM/);
  assert.match(en, /Minors welcome with an adult until 8 PM/);
  assert.match(en, /Sports on TV: hockey, football · 6 to 10 TVs/);
  assert.match(en, /Shuffleboard/);
  assert.match(fr, /La cuisine ferme à 22 h/);
  assert.match(fr, /Mineurs bienvenus avec un adulte jusqu’à 20 h/);
  assert.match(fr, /hockey, football · 6 à 10 téléviseurs/);
  // The wording of the three answers.
  assert.equal(app.minorsLineText({ policy: 'adults' }, false), 'Adults only (19+)');
  assert.equal(app.minorsLineText({ policy: 'all_ages' }, false), 'All ages welcome');
  assert.equal(app.minorsLineText({ policy: 'minors_until', until: '21:30' }, false), 'Minors welcome with an adult until 9:30 PM');
  assert.equal(app.minorsLineText({ policy: 'adults' }, true), 'Adultes seulement (19 ans et plus)');
  const same = mk('pub'); await change(tokenFor(same.id), { pub_info: { kitchen: { mode: 'same' } } });
  assert.match(page(same, 'en'), /Food served until close/);
  const none = mk('pub'); await change(tokenFor(none.id), { pub_info: { kitchen: { mode: 'none' } } });
  assert.match(page(none, 'en'), /No food served/);
  assert.ok(!/Kitchen closes|Food served|No food served|Minors welcome|Adults only|All ages/.test(page(mk('pub'), 'en')), 'nothing until the business says');
});

test('kid-friendly: hidden on every pub (page, API, filters, map), kept stored, then the owner answer decides', async () => {
  const v = mk('pub', { kid_friendly: 1 });
  const r0 = mk('restaurant', { kid_friendly: 1 });
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(v.id).kid_friendly, 1, 'stored value kept');
  assert.equal(app.getVenue(v.id).kid_friendly, false);
  const api = JSON.parse((await get(`/api/venues/${v.id}`)).text);
  assert.equal(api.kid_friendly, false);
  const list = JSON.parse((await get('/api/venues?kid_friendly=1&limit=2000')).text);
  const ids = (list.venues || list.data || list).map((x) => x.id);
  assert.ok(!ids.includes(v.id), 'not in the Kid-friendly filter');
  assert.ok(ids.includes(r0.id), 'restaurants unchanged');
  const en = page(v, 'en');
  assert.ok(!/Kid-Friendly|Kids OK|Kid-friendly/.test(en), 'no Kid-friendly chip or highlight on the pub page');
  const kidsBit = 32;
  const row = (id) => app.mapPlacesData().find((p) => p[5].endsWith(app.getVenue(id).slug));
  assert.equal(row(v.id)[7] & kidsBit, 0, 'no Kids bit on the map');
  assert.equal(row(r0.id)[7] & kidsBit, kidsBit);
  // Adults only: still hidden. All ages: the filters and map count it; the page says it in its own line, not a chip.
  const t = tokenFor(v.id);
  await change(t, { pub_info: { minors: { policy: 'adults' } } });
  assert.equal(app.getVenue(v.id).kid_friendly, false);
  await change(t, { pub_info: { minors: { policy: 'all_ages' } } });
  assert.equal(app.getVenue(v.id).kid_friendly, true);
  const list2 = JSON.parse((await get('/api/venues?kid_friendly=1&limit=2000')).text);
  assert.ok((list2.venues || list2.data || list2).some((x) => x.id === v.id));
  assert.equal(row(v.id)[7] & kidsBit, kidsBit);
  const en2 = page(v, 'en');
  assert.match(en2, /All ages welcome/);
  assert.ok(!/Kid-Friendly/.test(en2), 'the line replaces the chip');
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(v.id).kid_friendly, 1, 'still never written');
  // A pub with no research flag but an all-ages answer counts too (the business's own word).
  const w = mk('pub'); await change(tokenFor(w.id), { pub_info: { minors: { policy: 'minors_until', until: '19:00' } } });
  assert.equal(app.getVenue(w.id).kid_friendly, true);
});

test('map: pub games and local beer bits; restaurants keep theirs', async () => {
  const v = mk('pub'); await change(tokenFor(v.id), { badges: { arcade: true, local_beer_taps: true } });
  const games = app.MAP_OWNER_FEATURES.find((f) => f.key === 'games').bit, beer = app.MAP_OWNER_FEATURES.find((f) => f.key === 'localbeer').bit;
  const p = app.mapPlacesData().find((x) => x[5].endsWith(app.getVenue(v.id).slug));
  assert.ok(p[7] & games); assert.ok(p[7] & beer);
  const rest = mk('restaurant'); await change(tokenFor(rest.id), { badges: { local_drinks: true } });
  const q = app.mapPlacesData().find((x) => x[5].endsWith(app.getVenue(rest.id).slug));
  assert.ok(q[7] & app.MAP_OWNER_FEATURES.find((f) => f.key === 'localdrinks').bit);
  assert.equal(q[7] & games, 0);
  const m = (await get('/map')).text;
  assert.ok(m.includes('Pool, darts &amp; games') || m.includes('Pool, darts & games'));
});

// ---------- Easy setup ----------
test('setup: the pub parts and screens; restaurants keep theirs', async () => {
  const v = mk('pub', { cuisine: null });
  const s = await get(`/owner/${tokenFor(v.id)}/setup`);
  assert.equal(s.status, 200);
  const cfg = cfgOf(s.text);
  assert.deepEqual(cfg.part1, ['basics', 'hours', 'closures', 'happy', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(cfg.part2, ['music', 'specials', 'story', 'groups', 'spend', 'known', 'book', 'takeout', 'instagram', 'facebook', 'door']);
  assert.deepEqual(cfg.top2, ['music', 'specials', 'story', 'groups', 'instagram', 'facebook']);
  assert.equal(cfg.pub, true);
  assert.equal(cfg.popular[0], 'Pub Fare');
  assert.deepEqual(cfg.placeTypes, app.PUB_PLACE_TYPES);
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  assert.equal(keys.length, 27, '27 tiles (Fireplace added in pub test 6, Beach access in pub test 7, off-sales, free parking and room for RVs in pub test 8)');
  assert.ok(!keys.includes('kid_friendly') && !keys.includes('happy_hour'));
  for (const k of ['local_beer_taps', 'pool', 'darts', 'shuffleboard', 'arcade', 'board_games', 'takeout']) assert.ok(keys.includes(k), k);
  assert.equal(cfg.t.kitchenQ, 'Does your kitchen close before the bar?');
  assert.equal(cfg.t.minorsQ, 'Who’s welcome?');
  assert.equal(cfg.t.cuisineLead, 'We picked Pub Fare. Add up to 2 more, or change it.');
  assert.match(cfg.t.hiLead, /15 to 30 minutes/);
  assert.equal(cfg.t.spendLead, 'One main and a soft drink, before tax and tip.', 'the restaurant wording (Dayton)');
  assert.equal(cfg.sports.length, 8); assert.equal(cfg.tvs.length, 4);
  const fr = cfgOf((await get(`/fr/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(fr.t.minorsQ, 'Qui est le bienvenu\u202f?');
  // The pub help topics.
  assert.match(s.text, /pub-kids/);
  // Restaurants: unchanged.
  const rc = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.deepEqual(rc.part1, app.SETUP_PART1); assert.deepEqual(rc.part2, app.SETUP_PART2);
  assert.ok(!rc.pub && rc.offerGroups.flatMap((g) => g.keys).includes('kid_friendly'));
  assert.equal(rc.t.kitchenQ, undefined);
});

test('setup: "essentials done" follows the pub Part 1; the edit page has the card and the bar', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  for (const step of app.PUB_SETUP_PART1) app.saveSetupProgress(v.id, step, 'skip');
  assert.equal(app.setupState(v.id), 'essentials');
  const r = mk('restaurant');
  for (const step of app.PUB_SETUP_PART1) app.saveSetupProgress(r.id, step, 'skip');
  assert.equal(app.setupState(r.id), 'partial', 'a restaurant still needs its own Part 1 (average spend)');
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /id="opSetupCard"/);
  assert.match(edit, /id="opComplete"/);
  assert.ok(!/name="badge" value="kid_friendly"/.test(edit), 'no Kid-friendly box for a pub');
  assert.match(edit, /name="badge" value="darts"/);
  assert.match(edit, /data-place="Gastropub"/);
});

test('setup: what you offer with no game and no sports ticked says so; a later tick takes it back', async () => {
  const v = mk('pub', { sports_tv: 1 }); const t = tokenFor(v.id);
  await change(t, { pub_info: { sports: { list: ['hockey'], tvs: '' } } });
  // The page script's save for an unticked Sports on TV and no games: badges, clear the sports, then the answers.
  let r = await change(t, { badges: { sports_tv: false } }); assert.equal(r.status, 200);
  r = await change(t, { pub_info: { sports: null } }); assert.equal(r.status, 200);
  r = await change(t, { not_offered: ['games', 'sports'] }); assert.equal(r.status, 200);
  const snap = JSON.parse(JSON.stringify(cfgOf((await get(`/owner/${t}/setup`)).text).cur));
  assert.deepEqual(snap.not_offered, ['games', 'sports']);
  r = await change(t, { badges: { darts: true } }); assert.equal(r.status, 200);
  const bar = (await get(`/owner/${t}`)).text;
  assert.ok(!/data-cb-item="games"/.test(bar), 'games done');
  // The client works the answers out when it sends them ({ add, remove }), never sending a stale list.
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  // Pub fresh-eyes (2026-11-10, bug B): Save and exit never records an implicit "not offered".
  assert.match(js, /if \(gameOn \|\| !S\.noGames\) rem\.push\('games'\); else if \(!partial\) add\.push\('games'\)/ /* pub test 9: only the "No games" tile */);
  assert.match(js, /function offerNext\(from\)/);
  assert.match(js, /'offer:sports'.*'offer:dogs'.*'offer:minors'/s);
});

// ---------- SEO ----------
test('SEO: pub answers make no new pages, URLs or sitemap entries', async () => {
  const v = mk('pub', { kid_friendly: 1, sports_tv: 1 });
  const before = (await get('/sitemap.xml')).text;
  await change(tokenFor(v.id), { pub_info: { kitchen: { mode: 'same' }, minors: { policy: 'adults' }, sports: { list: ['hockey'], tvs: '3-5' } } });
  await change(tokenFor(v.id), { badges: { pool: true, local_beer_taps: true }, place_type: 'Sports bar' });
  const after = (await get('/sitemap.xml')).text;
  const urls = (x) => [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(urls(after), urls(before));
  for (const p of ['/penticton/pool', '/guide/penticton/pool', '/guide/penticton/local_beer_taps', '/penticton/pubs/sports-bar']) assert.notEqual((await get(p)).status, 200, p);
  const html = page(v, 'en');
  assert.ok(!/"kitchen|"minors|servesCuisine":\s*\[?"Sports bar/.test(html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)?.join('') || ''), 'nothing new in the JSON-LD');
});

// ---------- Admin: removing a wrong researched badge ----------
test('admin remove-amenities: removes and logs; refuses a mismatch and the owner\'s own value; Undo restores', async () => {
  const v = mk('pub', { happy_hour: 1, patio: 1, live_music: 0 });
  const body = { id: v.id, expected_current: { happy_hour: true }, fields: ['happy_hour'], reason: 'No happy hour on their site', batch_id: 'hh-badge-fix-test', source_url: 'https://example.com/' };
  assert.equal((await postJson('/admin/remove-amenities', body)).status, 401, 'admin token required');
  let r = await admin('/admin/remove-amenities', body);
  assert.equal(r.status, 200); assert.deepEqual(r.body.results, { happy_hour: 'written' });
  assert.equal(db.prepare('SELECT happy_hour FROM venues WHERE id = ?').get(v.id).happy_hour, 0);
  const log = db.prepare("SELECT old_value, new_value, source, batch_id, source_ref FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'happy_hour' ORDER BY id DESC").get(v.id);
  assert.deepEqual({ ...log }, { old_value: '1', new_value: '0', source: 'manual_removal', batch_id: 'hh-badge-fix-test', source_ref: 'No happy hour on their site | https://example.com/' });
  // Already off: compare-and-set refuses.
  r = await admin('/admin/remove-amenities', { ...body, batch_id: 'again' });
  assert.equal(r.status, 409); assert.deepEqual(r.body.results, { happy_hour: 'rejected_expected_mismatch' });
  // Not a researched badge, or expected not true: 400.
  assert.equal((await admin('/admin/remove-amenities', { ...body, fields: ['open_late'], expected_current: { open_late: true } })).status, 400);
  assert.equal((await admin('/admin/remove-amenities', { ...body, fields: ['patio'], expected_current: { patio: false } })).status, 400);
  assert.equal((await admin('/admin/remove-amenities', { ...body, source_url: 'nope' })).status, 400);
  // The business's own value is never removed.
  const o = mk('restaurant', { patio: 0 });
  assert.equal((await change(tokenFor(o.id), { badges: { patio: true } })).status, 200);
  r = await admin('/admin/remove-amenities', { id: o.id, expected_current: { patio: true }, fields: ['patio'], reason: 'test', batch_id: 'owner-test', source_url: 'https://example.com/' });
  assert.equal(r.status, 409); assert.deepEqual(r.body.results, { patio: 'rejected_owner_value' });
  assert.equal(db.prepare('SELECT patio FROM venues WHERE id = ?').get(o.id).patio, 1);
  // Undo puts the removed badge back, logged.
  r = await admin('/admin/remove-amenities/undo', { id: v.id, batch_id: 'hh-badge-fix-test', reason: 'test undo' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.results, { happy_hour: 'restored' });
  assert.equal(db.prepare('SELECT happy_hour FROM venues WHERE id = ?').get(v.id).happy_hour, 1);
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND source = 'manual_removal_undo' AND batch_id = 'undo-hh-badge-fix-test'").get(v.id));
  // A second Undo changes nothing.
  r = await admin('/admin/remove-amenities/undo', { id: v.id, batch_id: 'hh-badge-fix-test', reason: 'again' });
  assert.deepEqual(r.body.results, { happy_hour: 'skipped_changed_since' });
  assert.equal(sent.filter((m) => /remove/i.test(JSON.stringify(m))).length, 0, 'no emails');
});

// ---------- Dayton's answers (Nov 10): no food clears the food labels; pub features in the visible highlights ----------
test('"We don\'t serve food" clears the food labels (kind of pub stays), logged, one Undo; serving food again asks the food question', async () => {
  const v = mk('pub', { cuisine: 'Pub Fare' }); const t = tokenFor(v.id);
  assert.equal((await change(t, { cuisines: ['Pub Fare', 'Chicken & Wings'], place_type: 'Sports bar' })).status, 200);
  app.saveSetupProgress(v.id, 'cuisine', 'live');
  assert.match(page(v, 'en'), /Pub Fare · Chicken &amp; Wings · Sports bar/);
  const r = await change(t, { pub_info: { kitchen: { mode: 'none' } } });
  assert.equal(r.status, 200);
  const after = app.getVenue(v.id);
  assert.equal(after.cuisine, null);
  assert.ok(!/Pub Fare|Chicken &amp; Wings/.test(page(v, 'en')), 'the page no longer says Pub Fare');
  assert.match(page(v, 'en'), /No food served/);
  assert.equal(db.prepare('SELECT place_type FROM venue_cuisines WHERE venue_id = ?').get(v.id).place_type, 'Sports bar', 'kind of pub stays');
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'cuisines' AND new_value IS NULL AND source = 'venue_owner'").get(v.id), 'logged');
  const ch = db.prepare("SELECT id, changes FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC").get(v.id);
  assert.deepEqual(Object.keys(JSON.parse(ch.changes)).sort(), ['cuisines', 'pub_info'], 'one change, one Undo');
  // The setup reads it back: no food labels, the kitchen answer.
  let cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.cur.cuisines, []); assert.deepEqual(cfg.cur.pub_info.kitchen, { mode: 'none' });
  // The checklist counts the food type as answered.
  assert.ok(!/data-cb-item="cuisine"/.test((await get(`/owner/${t}`)).text));
  // Undo puts both back.
  assert.equal(app.undoOwnerInstantChange(ch.id, 'test').ok, true);
  assert.equal(app.getVenue(v.id).cuisine, 'Pub Fare');
  assert.match(page(v, 'en'), /Pub Fare · Chicken &amp; Wings · Sports bar/);
  // No food again (from the setup's food screen), then serving food again: the food question comes back.
  await change(t, { pub_info: { kitchen: { mode: 'none' } } });
  app.saveSetupProgress(v.id, 'cuisine', 'no');
  assert.equal((await change(t, { pub_info: { kitchen: { mode: 'same' } } })).status, 200);
  assert.equal(app.setupProgress(v.id).done.cuisine, undefined, 'the setup asks the food question again');
  assert.match((await get(`/owner/${t}`)).text, /data-cb-item="cuisine"/, 'and the checklist asks for the food type');
  cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.cur.cuisines, []);
  // Already no food labels: nothing extra is sent. A restaurant never gets this.
  const bare = mk('pub', { cuisine: null }); const r2 = await change(tokenFor(bare.id), { pub_info: { kitchen: { mode: 'none' } } });
  assert.equal(r2.status, 200);
  assert.ok(!('cuisines' in JSON.parse(db.prepare("SELECT changes FROM owner_change_requests WHERE venue_id = ? ORDER BY id DESC").get(bare.id).changes)));
  // The page script: no food clears the picks; serving food again brings Pub Fare back as the start.
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /if \(mode === 'none'\) \{ S\.cuis = \[\];/);
  assert.match(js, /if \(was === 'none'\) \{ if \(S\.done\.cuisine === 'no'\) delete S\.done\.cuisine; if \(!S\.cuis\.length\) S\.cuis = \['Pub Fare'\]; \}/);
});

test('pub page: Local beer on tap and the games are in the visible highlights; restaurants unchanged', async () => {
  const v = mk('pub', { sports_tv: 1, patio: 1 }); const t = tokenFor(v.id);
  await change(t, { badges: { local_beer_taps: true, darts: true, board_games: true } });
  const html = page(v, 'en');
  const hl = (/<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(html) || [])[1] || '';
  for (const w of ['🍺 Local or craft beer on tap', '🎯 Darts', '🎲 Board games']) assert.ok(hl.includes(w), w);
  assert.ok(!hl.includes('Pool'), 'only what the business ticked');
  const rest = mk('restaurant', { patio: 1 }); await change(tokenFor(rest.id), { badges: { local_drinks: true } });
  const rhl = (/<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(page(rest, 'en')) || [])[1] || '';
  assert.ok(!/Local wine|Local beer/.test(rhl), 'restaurant highlights unchanged');
});

test('no food, then picking food in the setup: the no-food answer goes and the food labels are saved', async () => {
  const v = mk('pub', { cuisine: 'Pub Fare' }); const t = tokenFor(v.id);
  await change(t, { pub_info: { kitchen: { mode: 'none' } } });
  assert.equal(app.getVenue(v.id).cuisine, null);
  // What the page script sends (foodAgain): clear the kitchen answer, then the food.
  assert.equal((await change(t, { pub_info: { kitchen: null } })).status, 200);
  assert.equal((await change(t, { cuisines: ['Burgers'] })).status, 200);
  assert.equal(app.getVenue(v.id).cuisine, 'Burgers');
  assert.equal(app.venuePubInfo(v.id).kitchen, undefined);
  assert.match((await get(`/owner/${t}`)).text, /data-cb-item="kitchen"/, 'the kitchen question is asked again');
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /function foodAgain\(list\)\{ if \(C\.pub && S\.kitchen\.mode === 'none'\) \{ list\.unshift\(\{ pub_info: \{ kitchen: null \} \}\);/);
});
