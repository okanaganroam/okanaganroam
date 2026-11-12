// Café easy setup in 13 screens instead of 22 (Dayton, 2026-11-11: "seems like a lot of questions for a café").
// Part 1 (7): basics, hours (holidays and closures at the end of the same step), kind of café and what you serve,
// photos, menu, price per person, what you offer. Part 2 (6, optional): specials, story, dietary details, coffee,
// Instagram + Facebook on one screen, front door. Staying a while, ordering, sells out early, weekly events, known for,
// groups and happy hour are no longer asked of cafés; their stored answers and the public page stay as they are.
// Restaurants and pubs are unchanged.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-fewer-steps-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '15:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Fewer Steps ${type} ${++n}`, slug: `fewer-steps-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.5, address: `${n} Front St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the café fewer-steps tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const getJson = (p) => fetch(base + p, { headers: { Accept: 'application/json' } }).then(async (r) => ({ status: r.status, body: await r.json() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const progress = (t, step, status) => postJson(`/owner/${t}/setup/progress`, { step, status });
const CAFE_13 = ['basics', 'hours', 'cuisine', 'photos', 'menu', 'spend', 'offer', 'specials', 'story', 'diet', 'coffee', 'social', 'door'];
const REMOVED = ['stay', 'order', 'sellout', 'music', 'known', 'groups', 'happy'];

test('café step lists: 7 essentials and 6 optional; restaurants and pubs unchanged', async () => {
  assert.deepEqual(app.CAFE_SETUP_PART1, ['basics', 'hours', 'cuisine', 'photos', 'menu', 'spend', 'offer']);
  assert.deepEqual(app.CAFE_SETUP_PART2, ['specials', 'story', 'diet', 'coffee', 'social', 'door']);
  assert.deepEqual(app.setupStepsFor('cafe'), CAFE_13);
  for (const k of REMOVED.concat(['closures', 'instagram', 'facebook'])) assert.ok(!app.setupStepsFor('cafe').includes(k), `${k} is not a café step`);
  // Even with Beer & wine, happy hour is not a café setup step any more.
  const bw = mk('cafe'); const tb = tokenFor(bw.id);
  assert.equal((await change(tb, { cafe_info: { serves: ['espresso', 'beer_wine'] } })).status, 200);
  const cb = cfgOf((await get(`/owner/${tb}/setup`)).text);
  assert.deepEqual(cb.steps, CAFE_13); assert.deepEqual(cb.part1, app.CAFE_SETUP_PART1); assert.deepEqual(cb.part2, app.CAFE_SETUP_PART2);
  assert.deepEqual(cb.top2, app.CAFE_SETUP_PART2, 'all six optional tiles show (no "A few more")');
  assert.ok(!cb.offerGroups.flatMap((g) => g.keys).includes('laptop'), 'no Laptop friendly tile');
  for (const k of ['wifi', 'drive_thru', 'walk_up']) assert.ok(cb.offerGroups.flatMap((g) => g.keys).includes(k), `${k} tile kept (map filters)`);
  // Restaurants and pubs: exactly as before.
  const SETUP = ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer', 'happy', 'specials', 'music', 'story', 'book', 'takeout', 'known', 'groups', 'instagram', 'facebook', 'door'];
  assert.deepEqual(app.SETUP_STEPS, SETUP);
  const rc = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.deepEqual(rc.steps, SETUP);
  assert.deepEqual(rc.part1, ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(rc.part2, ['happy', 'specials', 'music', 'story', 'book', 'takeout', 'known', 'groups', 'instagram', 'facebook', 'door']);
  assert.deepEqual(rc.top2, ['happy', 'specials', 'music', 'story', 'instagram', 'facebook']);
  const pcfg = cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text);
  assert.deepEqual(pcfg.steps, SETUP);
  assert.deepEqual(pcfg.part1, ['basics', 'hours', 'closures', 'happy', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(pcfg.part2, ['music', 'specials', 'story', 'groups', 'spend', 'known', 'book', 'takeout', 'instagram', 'facebook', 'door']);
  assert.deepEqual(pcfg.top2, ['music', 'specials', 'story', 'groups', 'instagram', 'facebook']);
  // A restaurant can't record a café step, and a café can't record a removed one.
  const tr = tokenFor(mk('restaurant').id);
  assert.equal((await progress(tr, 'social', 'live')).status, 400);
  const tc = tokenFor(mk('cafe').id);
  for (const k of REMOVED) assert.equal((await progress(tc, k, 'live')).status, 400, `${k} refused for a café`);
});

test('holidays and closures inside Hours: saved through the hours flow, recorded as done, never a step of their own', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  // The hours, then the closures (same save paths as before).
  await change(t, { hours_checked: true });
  assert.equal((await progress(t, 'hours', 'live')).status, 200);
  const from = app.addLocalDays(today, 20);
  const c = await change(t, { closures: [{ from, to: app.addLocalDays(from, 6), note: 'Holidays' }], cafe_info: { year: 'all' } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const p = await progress(t, 'closures', 'live');
  assert.equal(p.status, 200); assert.equal(p.body.progress.done.closures, 'live');
  assert.equal(app.setupProgress(v.id).done.closures, 'live');
  // "Skip" and "No, nothing coming up" are answers too.
  const t2 = tokenFor(mk('cafe').id);
  assert.equal((await progress(t2, 'closures', 'skip')).status, 200);
  assert.equal((await progress(t2, 'closures', 'no')).status, 200);
  // The essentials are the 7, without closures: a café that answered them (and skipped closures) is at "essentials".
  const v3 = mk('cafe');
  for (const k of app.CAFE_SETUP_PART1) app.saveSetupProgress(v3.id, k, 'live');
  // Café test 6 (2026-11-12): the Hours step counts once its holidays part is answered too (here skipped).
  assert.equal(app.setupState(v3.id), 'partial');
  app.saveSetupProgress(v3.id, 'closures', 'skip');
  assert.equal(app.setupState(v3.id), 'essentials');
  for (const k of app.CAFE_SETUP_PART2) app.saveSetupProgress(v3.id, k, k === 'door' ? 'later' : 'live');
  assert.equal(app.setupState(v3.id), 'done', 'the 13 screens are the whole setup');
  // The page's hours step goes on to the closures screen, and closures has no number of its own.
  const html = (await get(`/owner/${t}/setup`)).text;
  const cfg = cfgOf(html);
  assert.ok(!cfg.part1.includes('closures') && !cfg.steps.includes('closures'));
  assert.equal(cfg.t.labels.hours, 'Hours and holidays');
  assert.equal(cfg.progress.done.closures, 'live', 'the stored closures answer is still sent to the page');
  const js = app.OWNER_SETUP_SCRIPT || fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /C\.cafe \? 'closures' : null/, 'a café\'s hours save goes straight on to its closures');
  assert.match(js, /if \(C\.cafe && step === 'hours'\) return go\('closures'\)/);
});

test('Instagram and Facebook on one screen: both save live through the usual checks, and both answers are recorded', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const r = await change(t, { instagram_url: '@fewersteps' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(!(r.body.review || []).length, 'Instagram is live');
  const f = await change(t, { facebook_url: 'https://www.facebook.com/fewersteps' });
  assert.equal(f.status, 200, JSON.stringify(f.body)); assert.ok(!(f.body.review || []).length, 'Facebook is live');
  const snap = app.ownerVenueSnapshot(app.getVenue(v.id));
  assert.match(snap.instagram_url, /instagram\.com\/fewersteps/); assert.equal(snap.facebook_url, 'https://www.facebook.com/fewersteps');
  for (const k of ['instagram', 'facebook', 'social']) assert.equal((await progress(t, k, 'live')).status, 200, k);
  const g = await getJson(`/owner/${t}/setup/progress`);
  assert.deepEqual([g.body.progress.done.instagram, g.body.progress.done.facebook, g.body.progress.done.social], ['live', 'live', 'live']);
  // "Not sure" counts for the one screen too; "We're not on it" is the usual not-offered answer.
  const t2 = tokenFor(mk('cafe').id);
  assert.equal((await progress(t2, 'social', 'unsure')).status, 200);
  assert.equal((await change(t2, { not_offered: ['instagram'] })).status, 200);
  assert.equal((await progress(t2, 'instagram', 'no')).status, 200);
  // The screen and its words (EN and FR); Facebook from the website box (#841) still records Facebook for a café.
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /function socialBoth\(\)/);
  assert.match(js, /\(STEPS\.indexOf\('facebook'\) >= 0 \|\| C\.cafe\) && !answered\('facebook'\)\) progress\('facebook', 'live'\)/);
  for (const L of ['en', 'fr']) for (const k of ['socialQ', 'socialLead', 'socialNeed', 'hoursSavedNow', 'hoursSentNow']) assert.ok(TEXT[L].cafe[k], `${L} ${k}`);
  for (const L of ['en', 'fr']) { assert.ok(TEXT[L].cafe.labels.social && TEXT[L].cafe.labels.hours && TEXT[L].cafe.noLabels.social, L); }
});

test('completeness: a café that does all 13 screens is 100% and earns Complete & Verified', () => {
  const keys = pc.CAFE_ITEMS.map((i) => i.key);
  for (const k of ['stay', 'ordering', 'pyv_known', 'happy_hour', 'entertainment', 'pyv_groups']) assert.ok(!keys.includes(k), `${k} is not scored for cafés`);
  assert.equal(pc.CAFE_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  // Only what the 13 screens ask: no laptops, ordering, known-for, groups, events or happy hour.
  const full = { type: 'cafe', address: 'a', latitude: 1, longitude: 1, phone: '1', website: 'https://x.ca', hasHours: true, hoursCheckedAt: today, placeType: 'Coffee shop',
    cafeInfo: { year: 'all', serves: ['espresso'], menu_daily: 'board' }, imageUrl: '/images/x.jpg', photoCount: 3, avgSpend: 5, avgSpendSource: 'owner', vegan: 1,
    ownerFeatures: ['wifi'], kidFriendly: true, description: 'x'.repeat(130), instagramUrl: 'i', facebookUrl: 'f', hasArrival: true, claimed: true };
  const r = pc.scoreCompleteness(full, { today });
  assert.equal(r.pct, 100, JSON.stringify(r.missing.map((x) => x.key)));
  assert.equal(r.complete, true);
  assert.equal(pc.badgeState(r, true), 'earned');
  // "We don't have one" answers still count; "Order at the counter only" from before is still a valid stored answer.
  const r2 = pc.scoreCompleteness({ ...full, ownerFeatures: [], instagramUrl: '', declaredNone: ['wifi', 'instagram', 'ordering'] }, { today });
  assert.equal(r2.pct, 100, JSON.stringify(r2.missing.map((x) => x.key)));
  assert.ok(pc.noneKeysFor('cafe').includes('ordering'));
  // Restaurants and pubs keep their checklists.
  assert.ok(pc.ITEMS.some((i) => i.key === 'pyv_known') && pc.PUB_ITEMS.some((i) => i.key === 'pyv_known'));
});

test('old progress with removed café steps: the page, the resume list and the score still work; stored data kept', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  // Stored before 2026-11-11: answers to steps that are gone now, and the old separate Instagram / Facebook / closures.
  const old = { basics: 'live', hours: 'live', closures: 'no', cuisine: 'live', photos: 'day', menu: 'live', spend: 'live', offer: 'live',
    stay: 'live', order: 'no', sellout: 'live', music: 'no', known: 'live', groups: 'no', happy: 'no', instagram: 'live', facebook: 'unsure' };
  db.prepare('INSERT INTO owner_setup_progress (venue_id, state) VALUES (?, ?)').run(v.id, JSON.stringify({ done: old, done_for_now: true }));
  await change(t, { cafe_info: { stay: { laptops: 'all_day', seats: 'few' }, sellout: 'Scones by 10' } });
  const s = await get(`/owner/${t}/setup`);
  assert.equal(s.status, 200);
  const cfg = cfgOf(s.text);
  assert.deepEqual(cfg.steps, CAFE_13);
  assert.equal(cfg.progress.done.stay, 'live', 'old answers are kept in the stored progress');
  assert.equal(cfg.doneForNow, true);
  assert.equal(app.setupState(v.id), 'essentials', 'the 7 essentials are answered; the old keys do no harm');
  assert.notEqual(app.setupState(v.id), 'done');
  const g = await getJson(`/owner/${t}/setup/progress`);
  assert.equal(g.status, 200); assert.ok(g.body.score && typeof g.body.score.pct === 'number');
  // The stored café answers and the public page are unchanged (laptops all day still shows).
  assert.equal(app.venueCafeInfo(v.id).sellout, 'Scones by 10');
  assert.equal(app.venueCafeInfo(v.id).stay.laptops, 'all_day');
  assert.equal(app.cafeLaptopFriendly(app.getVenue(v.id)), true);
  // The portal page renders too.
  assert.equal((await get(`/owner/${t}`)).status, 200);
});

test('help: the café setup lists the café questions; restaurants keep the general answer', async () => {
  const c = (await get(`/owner/${tokenFor(mk('cafe').id)}/setup`)).text;
  const topics = JSON.parse(/"topics":(\[.*?\]),"rules"/s.exec(c)[1]);
  const easy = topics.filter((x) => x.id === 'easy-setup');
  assert.equal(easy.length, 1, 'one "How does Set up your page work?"');
  assert.match(easy[0].a, /Instagram and Facebook/); assert.doesNotMatch(easy[0].a, /booking, takeout|groups/);
  assert.match(easy[0].aFr, /Instagram et Facebook/);
  const hh = topics.find((x) => x.id === 'cafe-happy');
  assert.doesNotMatch(hh.a, /appears under “More about your place”/);
  const lap = topics.find((x) => x.id === 'cafe-laptops');
  assert.doesNotMatch(lap.a, /You pick one of three answers/);
  const r = (await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text;
  const rt = JSON.parse(/"topics":(\[.*?\]),"rules"/s.exec(r)[1]).filter((x) => x.id === 'easy-setup');
  assert.equal(rt.length, 1); assert.match(rt[0].a, /booking, takeout/);
});
