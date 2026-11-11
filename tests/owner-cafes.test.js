// Cafés in the owner portal (Dayton, Nov 10 2026; drafts/cafe-portal-2026-11-10/SPEC-cafes.md, "Decided"): their own
// 100-point checklist, the easy setup with the café-only questions (kind of café, what you serve, price per person in
// café words, laptops, staying a while, ordering, dietary details, coffee, "sells out early"), the new owner-only
// answers on the public page, the map filters (Wi-Fi, Laptop friendly, Drive-thru), the kind suggested from the name
// (never saved by itself), happy hour only with Beer & wine, old café data unchanged, and restaurants and pubs unchanged.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const ADMIN = 'owner-cafes-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = ADMIN;
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const text = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '15:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Cafe Test ${type} ${++n}`, slug: `cafe-test-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.5, address: `${n} Front St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the café portal tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`, ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, setup = true) => postJson(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const mapRow = (v) => app.mapPlacesData().find((p) => p[5].endsWith(app.getVenue(v.id).slug));
const bitOf = (k) => app.MAP_OWNER_FEATURES.find((f) => f.key === k).bit;
const hasBit = (f, b) => (b > 2 ** 30 ? Math.floor(f / b) % 2 === 1 : !!(f & b));

// ---------- Checklist ----------
test('checklist: café weights sum to 100 in the spec groups; restaurants and pubs keep theirs', () => {
  assert.equal(pc.CAFE_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  const g = {};
  for (const it of pc.CAFE_ITEMS) g[it.group] = (g[it.group] || 0) + it.w;
  assert.deepEqual(g, { basics: 14, hours: 15, photos: 16, serve: 20, yourvisit: 17, about: 8, social: 6, finding: 2, confirmed: 2 });
  const w = Object.fromEntries(pc.CAFE_ITEMS.map((i) => [i.key, i.w]));
  assert.deepEqual(w, { address_pin: 4, phone: 4, website: 3, cafe_kind: 3, hours: 8, hours_fresh: 4, season: 3, photo_main: 9, photo_extra: 7, serves: 6, menu: 6, avg_spend: 4, dietary: 4,
    stay: 5, wifi: 3, dogs_kids: 4, ordering: 5, description: 5, pyv_known: 3, instagram: 3, facebook: 3, arrival: 2, owner_confirmed: 2 });
  assert.ok(!w.happy_hour && !w.entertainment && !w.specials, 'happy hour, events and specials are optional and unscored for cafés');
  assert.equal(pc.PUB_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.equal(pc.ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.deepEqual([...pc.NONE_KEYS].sort(), ['dietary', 'entertainment', 'facebook', 'happy_hour', 'instagram', 'pyv_groups', 'pyv_reservations', 'pyv_takeout', 'specials', 'website']);
  assert.deepEqual(pc.noneKeysFor('cafe').sort(), ['dietary', 'dogs', 'facebook', 'instagram', 'ordering', 'website', 'wifi']);
  for (const it of pc.CAFE_ITEMS) assert.ok(it.en && it.fr && it.whyEn && it.whyFr && (it.fix === false || (it.btnEn && it.btnFr)), `${it.key} has its words in both languages`);
  for (const k of pc.noneKeysFor('cafe')) assert.ok(pc.GOT_TEXT[k] && pc.GOT_TEXT[k].fr, `${k} has its Got it text`);
});

test('checklist: the café items score from the owner answers, and a full café earns Complete & Verified', () => {
  const base0 = { type: 'cafe', address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: today };
  const done = (x) => pc.doneMap({ ...base0, ...x }, today);
  assert.equal(done({}).cafe_kind, false);
  assert.equal(done({ placeType: 'Bakery café' }).cafe_kind, true);
  assert.equal(done({ placeType: 'Gastropub' }).cafe_kind, false, 'only a café kind');
  assert.equal(done({ cafeInfo: { year: 'all' } }).season, true);
  assert.equal(done({ openMonths: '5-9' }).season, true);
  assert.equal(done({ cafeInfo: { serves: ['espresso'] } }).serves, true);
  assert.equal(done({ cafeInfo: { stay: { seats: 'few' } } }).stay, true);
  assert.equal(done({ cafeInfo: { stay: { laptops: 'none' } } }).stay, true);
  assert.equal(done({ ownerFeatures: ['wifi'] }).wifi, true);
  assert.equal(done({ ownerFeatures: ['dairy_free_milk'] }).dietary, true, 'dairy-free milks count as a dietary option');
  assert.equal(done({ dogFriendly: true }).dogs_kids, true);
  assert.equal(done({ declaredNone: ['dogs'] }).dogs_kids, true);
  assert.equal(done({ ownerFeatures: ['drive_thru'] }).ordering, true);
  assert.equal(done({ cafeInfo: { order: { preorder: true } } }).ordering, true);
  assert.equal(pc.doneMap({ ...base0, type: 'restaurant', placeType: 'Bakery' }, today).cafe_kind, undefined, 'restaurants unchanged');
  const r0 = pc.scoreCompleteness({ ...base0, declaredNone: ['wifi', 'ordering'] }, { today });
  assert.ok(!r0.missing.some((it) => it.key === 'wifi' || it.key === 'ordering'));
  assert.deepEqual(r0.groups.map((x) => x.key), ['basics', 'hours', 'photos', 'serve', 'yourvisit', 'about', 'social', 'finding'], 'café groups in spec order');
  const html = pc.renderCompleteness(r0, { setupHref: '/owner/x/setup', canDecline: true });
  assert.match(html, /href="\/owner\/x\/setup#cuisine:serve"/);
  assert.match(html, /href="\/owner\/x\/setup#stay"/);
  const full = { ...base0, website: 'w', placeType: 'Coffee shop', imageUrl: '/images/x.jpg', photoCount: 3, menuUrl: 'https://x.ca/menu', avgSpend: 9, avgSpendSource: 'owner', vegan: 1,
    cafeInfo: { year: 'all', serves: ['espresso'], stay: { laptops: 'all_day' }, order: { preorder: true } }, ownerFeatures: ['wifi'], kidFriendly: true, visitLabels: ['Known for'],
    description: 'x'.repeat(130), instagramUrl: 'i', facebookUrl: 'f', hasArrival: true, claimed: true };
  const r = pc.scoreCompleteness(full, { today });
  assert.equal(r.pct, 100, JSON.stringify(r.missing.map((x) => x.key)));
  assert.equal(pc.badgeState(r, true), 'earned');
  assert.equal(pc.badgeState(pc.scoreCompleteness({ ...full, hoursCheckedAt: app.addLocalDays(today, -31) }, { today }), true), 'paused');
});

// ---------- Owner saves ----------
test('café answers: every part saves live from the setup, reads back in the setup and the snapshot, and Undo puts it back', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const parts = {
    serves: ['pastries', 'espresso', 'lunch'], diet: { milks: ['oat', 'almond'], milk_extra: 'no', gf_kitchen: 'shared', vegan_baking: true },
    stay: { laptops: 'not_busy', seats: 'few', outlets: true }, order: { preorder: true, preorder_how: 'Call us 48 hours ahead' },
    coffee: { roast_own: false, source: 'Cherry Hill', beans: true }, sellout: 'Cinnamon buns usually gone by 11', year: 'all',
  };
  for (const [k, val] of Object.entries(parts)) {
    const r = await change(t, { cafe_info: { [k]: val } });
    assert.equal(r.status, 200, `${k}: ${JSON.stringify(r.body)}`);
    assert.ok(!(r.body.review || []).length, `${k} is live, not waiting`);
  }
  assert.deepEqual(app.venueCafeInfo(v.id), {
    serves: ['espresso', 'pastries', 'lunch'], diet: { milks: ['oat', 'almond'], milk_extra: 'no', gf_kitchen: 'shared', vegan_baking: true },
    stay: { laptops: 'not_busy', seats: 'few', outlets: true }, order: { preorder: true, preorder_how: 'Call us 48 hours ahead' },
    coffee: { source: 'Cherry Hill', beans: true }, sellout: 'Cinnamon buns usually gone by 11', year: 'all' });
  // The setup reads them back.
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.cur.cafe_info.stay, { laptops: 'not_busy', seats: 'few', outlets: true });
  assert.equal(cfg.cur.cafe_info.sellout, 'Cinnamon buns usually gone by 11');
  // The kind of café, the café tiles and the price per person.
  assert.equal((await change(t, { place_type: 'Bakery café' })).status, 200);
  assert.equal((await change(t, { badges: { wifi: true, drive_thru: true, dairy_free_milk: true, stroller: true } })).status, 200);
  assert.equal((await change(t, { avg_spend: 9 })).status, 200);
  const cfg2 = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg2.cur.place_type, 'Bakery café');
  assert.equal(cfg2.cur.badges.wifi, true); assert.equal(cfg2.cur.badges.drive_thru, true);
  assert.equal(cfg2.cur.avg_spend.amount, 9);
  // Logged, and Undo restores the one before.
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'cafe_info' AND source = 'venue_owner'").get(v.id));
  await change(t, { cafe_info: { sellout: 'Sourdough gone by noon' } });
  const last = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC").get(v.id).id;
  assert.equal(app.undoOwnerInstantChange(last, 'test').ok, true);
  assert.equal(app.venueCafeInfo(v.id).sellout, 'Cinnamon buns usually gone by 11');
  // Clearing one part.
  assert.equal((await change(t, { cafe_info: { coffee: null } })).status, 200);
  assert.equal(app.venueCafeInfo(v.id).coffee, undefined);
  // The setup progress takes the café-only steps; a restaurant's does not.
  const p = await postJson(`/owner/${t}/setup/progress`, { step: 'stay', status: 'live' });
  assert.equal(p.status, 200); assert.equal(p.body.progress.done.stay, 'live');
  assert.equal((await postJson(`/owner/${tokenFor(mk('restaurant').id)}/setup/progress`, { step: 'stay', status: 'live' })).status, 400);
});

test('café links: online ordering and pre-orders wait for our check like any link; the answers stay live', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const r = await change(t, { cafe_links: { order_url: 'beanandbun.ca/order', preorder_url: '' } });
  assert.equal(r.status, 200);
  assert.ok((r.body.review || []).includes('cafe_links'), 'waits for review');
  assert.equal(app.venueCafeInfo(v.id).links, undefined, 'not on the page yet');
  assert.equal((await change(t, { cafe_links: { order_url: 'not a link' } })).status, 400);
  // Once approved (written the way an approval writes it), the page shows the button and the answers are kept.
  await change(t, { cafe_info: { order: { preorder: true } } });
  app.writeVenueCafeInfo(v.id, { ...app.venueCafeInfo(v.id), links: { order_url: 'https://beanandbun.ca/order' } });
  assert.match(page(v, 'en'), /href="https:\/\/beanandbun\.ca\/order"[^>]*>Order online</);
  assert.match(page(v, 'en'), /Custom cakes and pre-orders/);
  assert.equal(app.venueCafeInfo(v.id).order.preorder, true);
});

test('café answers: checked like Plan your visit lines; only cafés can send them; café kinds and tiles only', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  for (const bad of [{ serves: ['pizza'] }, { serves: 'espresso' }, { stay: { laptops: 'sometimes' } }, { stay: { seats: 'many' } }, { diet: { milks: ['hemp'] } },
    { coffee: { source: 'see www.example.com' } }, { sellout: '<b>buns</b>' }, { sellout: 'x'.repeat(130) }, { year: 'spring' }, { wifi: true }, {}]) {
    const r = await change(t, { cafe_info: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(app.venueCafeInfo(v.id), {});
  assert.equal((await change(t, { place_type: 'Gastropub' })).status, 400, 'a pub kind is refused for a café');
  assert.equal((await change(t, { badges: { darts: true } })).status, 400, 'no pub games for a café');
  assert.equal((await change(t, { badges: { off_sales: true } })).status, 400, 'no off-sales for a café');
  const rest = mk('restaurant');
  assert.equal((await change(tokenFor(rest.id), { cafe_info: { serves: ['espresso'] } })).status, 400, 'a restaurant cannot send café answers');
  assert.equal((await change(tokenFor(rest.id), { badges: { wifi: true } })).status, 400, 'restaurants keep their own tiles');
  assert.equal((await change(tokenFor(mk('pub').id), { place_type: 'Coffee shop' })).status, 400, 'pubs keep their own kinds');
});

// ---------- Happy hour ----------
test('happy hour: hidden for a café unless it ticks Beer & wine', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  let cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.happyHour, false);
  assert.ok(!cfg.steps.includes('happy') && !cfg.part2.includes('happy'), 'no happy hour step');
  const week = { mon: [['15:00', '17:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  assert.equal((await change(t, { happy_hour: week })).status, 400, 'refused without Beer & wine');
  assert.ok(!app.happyHourAllowed(app.getVenue(v.id)));
  await change(t, { cafe_info: { serves: ['espresso', 'beer_wine'] } });
  cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.happyHour, true);
  assert.ok(cfg.steps.includes('happy') && cfg.part2.includes('happy'));
  const ok = await change(t, { happy_hour: week });
  assert.equal(ok.status, 200, `allowed with Beer & wine: ${JSON.stringify(ok.body)}`);
  // Restaurants and pubs: as before.
  assert.ok(app.happyHourAllowed(app.getVenue(mk('restaurant').id)));
  assert.ok(app.happyHourAllowed(app.getVenue(mk('pub').id)));
  assert.ok(app.setupStepsFor('restaurant').includes('happy'));
});

// ---------- Public page ----------
test('public page: kind, what they serve, price per person by kind, laptops, tiles as chips, coffee and the tip; English and French', async () => {
  const v = mk('cafe', { cuisine: 'Coffee' }); const t = tokenFor(v.id);
  await change(t, { place_type: 'Coffee shop' });
  await change(t, { cafe_info: { serves: ['espresso', 'pastries', 'baked_here'], stay: { laptops: 'all_day', seats: 'lots' }, coffee: { roast_own: true, beans: true }, sellout: 'Cinnamon buns usually gone by 11',
    diet: { milks: ['oat', 'soy'], milk_extra: 'no' } } });
  await change(t, { badges: { wifi: true, drive_thru: true, dog_treats: true } });
  await change(t, { avg_spend: 9 });
  const en = page(v, 'en'), fr = page(v, 'fr');
  assert.match(en, /Coffee shop · Espresso drinks, baked fresh here and pastries/);
  assert.match(en, /About \$9 for a coffee and a pastry/);
  assert.match(en, /Laptops welcome all day · lots of seats inside/);
  assert.match(en, /Dairy-free milks: oat, soy \(no extra charge\)/);
  assert.match(en, /We roast our own beans · beans for sale/);
  assert.match(en, /Tip: Cinnamon buns usually gone by 11/);
  for (const chip of ['Wi-Fi', 'Laptop friendly', 'Drive-thru', 'Dog treats']) assert.ok(en.includes(chip), chip);
  assert.match(fr, /Environ 9 \$ pour un café et une pâtisserie/);
  assert.match(fr, /Boissons espresso, cuit sur place et pâtisseries/);
  assert.ok(fr.includes('Service au volant') && fr.includes('Ordinateurs portables bienvenus'));
  assert.ok(!fr.includes('Cinnamon buns'), 'the owner’s own words stay off the French page');
  // Price words by kind (Decided 2).
  assert.equal(app.cafePriceText(5, 'Ice cream & gelato', false), 'About $5 for a single scoop');
  assert.equal(app.cafePriceText(7, 'Bubble tea', false), 'About $7 for one drink');
  assert.equal(app.cafePriceText(8, 'Juice & smoothie bar', false), 'About $8 for one drink');
  assert.equal(app.cafePriceText(18, 'Brunch café', false), 'About $18 for a breakfast or lunch and a coffee');
  assert.equal(app.cafePriceText(16, 'Deli & sandwiches', true), 'Environ 16 $ pour un déjeuner ou un dîner et un café');
  assert.equal(app.cafePriceText(9, '', false), 'About $9 for a coffee and a pastry');
  // Laptops (Decided 3): only "all day" is the chip; "not at busy times" is a line; "no laptops" shows nothing.
  await change(t, { cafe_info: { stay: { laptops: 'not_busy' } } });
  const nb = page(v, 'en');
  assert.match(nb, /Laptops welcome, except at busy times/);
  assert.ok(!nb.includes('Laptop friendly'));
  await change(t, { cafe_info: { stay: { laptops: 'none' } } });
  const no = page(v, 'en');
  assert.ok(!/Laptop friendly|Laptops welcome/.test(no));
  // A research estimate is never shown; nothing until the business says.
  const r = mk('cafe');
  db.prepare("INSERT INTO venue_avg_spend (venue_id, amount, source, info) VALUES (?, 12, 'research', ?)").run(r.id, JSON.stringify({ amount: 12, source: 'research' }));
  assert.ok(!/About \$12 for/.test(page(r, 'en')));
  assert.equal(app.cafeInfoLinesHtml(app.getVenue(mk('cafe').id), false), '');
});

// ---------- Map ----------
test('map: Wi-Fi, Laptop friendly and Drive-thru filters from the café answers; other bits keep working', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  await change(t, { badges: { wifi: true, drive_thru: true } });
  await change(t, { cafe_info: { stay: { laptops: 'all_day' } } });
  const f = mapRow(v)[7];
  for (const k of ['wifi', 'laptop', 'drivethru']) assert.ok(hasBit(f, bitOf(k)), k);
  await change(t, { cafe_info: { stay: { laptops: 'not_busy' } } });
  assert.ok(!hasBit(mapRow(v)[7], bitOf('laptop')), 'not at busy times is not Laptop friendly');
  assert.ok(hasBit(mapRow(v)[7], bitOf('drivethru')));
  // Low bits are intact next to the high ones (patio and dogs).
  const p = mk('cafe', { patio: 1, dog_friendly: 1 }); await change(tokenFor(p.id), { badges: { drive_thru: true } });
  const pf = mapRow(p)[7];
  assert.ok(pf & 1 && pf & 2 && hasBit(pf, bitOf('drivethru')));
  const m = (await get('/map')).text;
  for (const w of ['Wi-Fi', 'Laptop friendly', 'Drive-thru']) assert.ok(m.includes(w), w);
  const conf = /"wifi":(\d+)/.exec(m);
  assert.ok(conf, 'the filter keys are in the map config');
  assert.equal(app.MAP_DATA_FORMAT, 24);
});

// ---------- Easy setup ----------
test('setup: the café parts, screens and tiles; restaurants and pubs keep theirs', async () => {
  const v = mk('cafe', { cuisine: null });
  const s = await get(`/owner/${tokenFor(v.id)}/setup`);
  assert.equal(s.status, 200);
  const cfg = cfgOf(s.text);
  assert.equal(cfg.cafe, true);
  assert.deepEqual(cfg.part1, ['basics', 'hours', 'closures', 'cuisine', 'photos', 'menu', 'spend', 'offer']);
  assert.deepEqual(cfg.part2, ['stay', 'order', 'diet', 'coffee', 'sellout', 'specials', 'music', 'story', 'known', 'groups', 'instagram', 'facebook', 'door']);
  assert.deepEqual(cfg.placeTypes, ['Coffee shop', 'Bakery', 'Bakery café', 'Roastery', 'Tea house', 'Bubble tea', 'Ice cream & gelato', 'Dessert & sweets', 'Brunch café', 'Juice & smoothie bar', 'Deli & sandwiches']);
  assert.deepEqual(cfg.serves.map((x) => x.k), ['espresso', 'drip', 'tea', 'baked_here', 'pastries', 'breakfast', 'lunch', 'ice_cream', 'desserts', 'bubble_tea', 'smoothies', 'beer_wine']);
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  for (const k of ['patio', 'dog_friendly', 'kid_friendly', 'wheelchair_accessible', 'free_parking', 'lake_view', 'vegan', 'vegetarian', 'gluten_free', 'wifi', 'laptop', 'dairy_free_milk', 'drive_thru', 'walk_up', 'washroom', 'stroller', 'dog_treats']) assert.ok(keys.includes(k), k);
  for (const k of ['sports_tv', 'pool', 'darts', 'off_sales', 'happy_hour', 'local_beer_taps']) assert.ok(!keys.includes(k), `${k} is hidden for cafés`);
  for (const k of keys) assert.ok(cfg.offerLabels[k] && cfg.offerIcons[k], `${k} has a label and an icon`);
  assert.equal(cfg.priceWords['Ice cream & gelato'], 'a single scoop');
  assert.equal(cfg.t.kindQ, 'What kind of café is it?');
  assert.equal(cfg.t.labels.stay, 'Staying a while');
  assert.match(s.text, /cafe-laptops/, 'the café help topics are on the setup page');
  const fr = cfgOf((await get(`/fr/owner/${tokenFor(v.id)}/setup`)).text || '{}');
  assert.equal(fr.t.kindQ, 'Quel genre de café est-ce?');
  // Restaurants and pubs unchanged.
  const rc = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.deepEqual(rc.part1, ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(rc.steps, app.SETUP_STEPS);
  assert.ok(!rc.cafe && !rc.serves && !rc.suggestKind);
  const pcfg = cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text);
  assert.deepEqual(pcfg.part1, ['basics', 'hours', 'closures', 'happy', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(pcfg.steps, app.SETUP_STEPS);
});

test('setup: the kind a name suggests is pre-selected only, never saved until the owner confirms it', async () => {
  const cases = [['Bean & Bun Bakery', 'Bakery'], ['Lakeside Gelato', 'Ice cream & gelato'], ['Bean & Bun Bakery Café', 'Bakery café'], ['Tiger Boba', 'Bubble tea'], ['Pulp Juicery', 'Juice & smoothie bar'],
    ['Cherry Hill Coffee Roasters', 'Roastery'], ['Okanagan Chocolate Co', 'Dessert & sweets'], ['Mom’s Donuts', 'Dessert & sweets'], ['Main Street Deli', 'Deli & sandwiches'], ['Blenz Coffee', 'Coffee shop'], ['The Hive', '']];
  for (const [name, kind] of cases) assert.equal(app.cafeKindSuggestion({ type: 'cafe', id: -1, name }), kind, name);
  assert.equal(app.cafeKindSuggestion({ type: 'restaurant', id: -1, name: 'Bakery Bistro' }), '', 'cafés only');
  const v = mk('cafe', { name: 'Bean & Bun Bakery Café', cuisine: null });
  const before = db.prepare('SELECT COUNT(*) AS n FROM venue_cuisines').get().n;
  const logBefore = db.prepare('SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE venue_id = ?').get(v.id).n;
  const cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(cfg.suggestKind, 'Bakery café');
  assert.equal(cfg.cur.place_type, '', 'nothing stored');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_cuisines').get().n, before, 'no venue_cuisines row written');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE venue_id = ?').get(v.id).n, logBefore, 'nothing logged');
  assert.equal(app.getVenue(v.id).cuisine, null);
  await get(`/owner/${tokenFor(v.id)}`);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_cuisines').get().n, before, 'the edit page writes nothing either');
  // A café with a kind gets no suggestion; confirming saves it.
  assert.equal((await change(tokenFor(v.id), { place_type: 'Bakery' })).status, 200);
  assert.equal(app.cafeKindSuggestion(app.getVenue(v.id)), '');
  assert.equal(cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).cur.place_type, 'Bakery');
});

// ---------- Old data ----------
test('old café data reads and shows the same: one cuisine label, no answers, no new lines', async () => {
  const v = mk('cafe', { cuisine: 'Bakery', vegan: 1, patio: 1 });
  const vv = app.getVenue(v.id);
  assert.deepEqual(app.venueCuisineList(vv), ['Bakery']);
  assert.equal(app.placeTypeDisplay(vv), '');
  assert.deepEqual(app.venueCafeInfo(v.id), {});
  const en = page(v, 'en');
  assert.ok(!/venue-cafe-lines|Laptop friendly|Wi-Fi|Drive-thru/.test(en));
  assert.match(en, /Bakery/);
  // Saving only the kind keeps the stored cuisine label.
  await change(tokenFor(v.id), { place_type: 'Bakery café' });
  assert.equal(app.getVenue(v.id).cuisine, 'Bakery');
  assert.deepEqual(app.venueCuisineList(app.getVenue(v.id)), ['Bakery']);
  assert.match(page(v, 'en'), /Bakery café/);
  // Owner-verified hours and description are never touched by any of this.
  assert.equal(app.getVenue(v.id).hours, WEEK);
  assert.equal(app.getVenue(v.id).description, 'A fixture used only by the café portal tests.');
});

test('no new pages: café answers make no URLs or sitemap entries', async () => {
  const before = (await get('/sitemap.xml')).text;
  const v = mk('cafe'); await change(tokenFor(v.id), { cafe_info: { serves: ['espresso'], stay: { laptops: 'all_day' } } });
  await change(tokenFor(v.id), { badges: { wifi: true } });
  const after = (await get('/sitemap.xml')).text;
  const urls = (x) => new Set((x.match(/<loc>[^<]+<\/loc>/g) || []).filter((u) => !u.includes(app.getVenue(v.id).slug)));
  assert.deepEqual([...urls(after)].filter((u) => !urls(before).has(u)), []);
  assert.ok(!/wifi|laptop|drive-thru/i.test([...urls(after)].join(' ')));
});

// ---------- French ----------
test('French: every café string has a French version', () => {
  const walk = (a, b, p) => { for (const k of Object.keys(a)) { assert.ok(k in b, `fr.${p}${k}`); if (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) walk(a[k], b[k], `${p}${k}.`); else assert.ok(String(b[k]).trim(), `fr.${p}${k} is not empty`); } };
  walk(text.en.cafe, text.fr.cafe, 'cafe.');
  for (const k of app.CAFE_SETUP_PART1.concat(app.CAFE_SETUP_PART2)) assert.ok({ ...text.fr.labels, ...text.fr.cafe.labels }[k], `fr label for ${k}`);
  for (const k of Object.keys(app.CAFE_SERVE_LABELS)) assert.ok(app.CAFE_SERVE_LABELS[k].fr, k);
  for (const k of app.CAFE_OWNER_BADGES) assert.ok(app.OWNER_EXTRA_BADGE_LABELS[k].fr, k);
  for (const p of app.CAFE_PLACE_TYPES) { assert.ok(app.PLACE_TYPE_DISPLAY_FR[p], p); assert.ok(app.PLACE_TYPE_DISPLAY[p], p); }
  for (const h of app.CAFE_SETUP_HELP_TOPICS) assert.ok(h.qFr && h.aFr && h.keysFr.length, h.id);
});
