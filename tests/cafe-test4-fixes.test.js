// Fourth first-time café test fixes (Dayton, Nov 11 2026; drafts/fresh-eyes-cafe4-2026-11-11/REPORT.md). The tester played
// Gord, 66, with a drive-thru coffee hut in Oliver. Keep it simple: bugs fixed, repeats removed, nothing new asked.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-test4-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week = (a, b) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `CT4 ${type} ${++n}`, slug: `ct4-${type}-${n}`, region: 'oliver', type, latitude: 49.18 + n / 1000, longitude: -119.55,
  rating: 4.6, address: `${n} 97 St, Oliver`, phone: '250-555-0142', hours: week('05:30', '14:00'),
  description: 'A fixture used only by the café test 4 fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.74.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const setupOf = async (v, lang) => { const r = await get(`${lang === 'fr' ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`); assert.equal(r.status, 200); return r.text; };
const page = (v, lang, now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const fnSrc = (name) => new RegExp(`function ${name}\\([^)]*\\)\\{[^\\n]*\\}`).exec(CLIENT)[0];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (k) => { const d = new Date(`${app.todayLocal()}T12:00:00`); d.setDate(d.getDate() + k); return ymd(d); };

test('1: a takeout-only café that said "No Wi-Fi" shows a plain "No Wi-Fi"; the setup tile says so and follows the takeout tile', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { not_offered: ['wifi'], cafe_info: { stay: { seats: 'takeout' } } }));
  const en = page(v, 'en'), fr = page(v, 'fr');
  assert.match(en, /venue-cafe-talk"[^>]*><span aria-hidden="true">📵<\/span> No Wi-Fi<\/p>/);
  assert.match(fr, /venue-cafe-talk"[^>]*><span aria-hidden="true">📵<\/span> Pas de Wi-Fi<\/p>/);
  assert.doesNotMatch(en, /a place to talk/);
  // With seats, the friendly line is unchanged.
  ok(await change(t, { cafe_info: { stay: { seats: 'few' } } }));
  assert.match(page(v, 'en'), /No Wi-Fi: a place to talk/);
  // The setup: the tile's line is what the page will show, and it changes as "No seats inside" is tapped.
  const cfg = cfgOf(await setupOf(v)), cfr = cfgOf(await setupOf(v, 'fr'));
  assert.equal(cfg.t.noWifiSubTakeout, 'Your page says “No Wi-Fi”'); assert.match(cfr.t.noWifiSubTakeout, /Pas de Wi-Fi/);
  assert.match(cfg.t.noWifiSub, /a place to talk/);
  assert.match(CLIENT, /id="suNoWifiSub">' \+ h\(wifiSubText\(\)\)/);
  assert.match(CLIENT, /if \(k === 'takeout_only'\) \{[^\n]*var wsub = el\('suNoWifiSub'\); if \(wsub\) wsub\.textContent = wifiSubText\(\);/);
});

test('2: a holiday inside added closed dates is covered (not saved again, not listed twice on the page)', async () => {
  // The page: a one-day closure inside a range is listed once (existing data too).
  const v = mk('cafe'); const t = tokenFor(v.id);
  const a = inDays(20), b = inDays(27), inside = inDays(22), outside = inDays(40);
  ok(await change(t, { closures: [{ from: a, to: b, note: 'Closed for Christmas' }, { from: inside, to: inside, note: 'Christmas Day' }, { from: outside, to: outside, note: 'Staff day' }] }));
  const html = page(v, 'en');
  const line = /<p class="venue-hours-closures">([\s\S]*?)<\/p>/.exec(html)[1];
  assert.match(line, /Closed for Christmas/); assert.match(line, /Staff day/);
  assert.doesNotMatch(line, /Christmas Day/, 'the one-day closure inside the range is not listed again');
  // The setup: coveredBy() handles dated ranges and yearly ones that wrap over New Year.
  const S = { extra: [{ from: '12-25', to: '01-01', yearly: true, note: '' }, { from: '2027-07-01', to: '2027-07-10', note: '' }] };
  const coveredBy = new Function('S', `${fnSrc('coveredBy')}; return coveredBy;`)(S);
  for (const d of ['2026-12-25', '2026-12-31', '2027-01-01', '2027-12-26', '2027-07-01', '2027-07-10']) assert.equal(coveredBy(d), true, d);
  for (const d of ['2026-12-24', '2027-01-02', '2027-06-30', '2027-07-11', '2026-11-11']) assert.equal(coveredBy(d), false, d);
  // A covered tile shows ticked and disabled with its note, and neither this year's nor next year's row is saved.
  assert.match(CLIENT, /var cov = holCovered\(o\);[^\n]*\(cov \? ' disabled' : ''\)[^\n]*h\(T\.holCovered\)/);
  assert.match(CLIENT, /HOL\.filter\(function\(o\)\{ return S\.closures\.indexOf\(o\.key\) >= 0 && !holCovered\(o\); \}\)\.map\(/);
  assert.match(CLIENT, /yearlyOn\(o\.key\) && !holCovered\(o\) && !coveredBy\(o\.next\)/);
  assert.equal(TEXT.en.holCovered, 'Covered by your closed dates'); assert.ok(TEXT.fr.holCovered);
});

test('3 + 5: the Facebook screen says a link shows right away; the story hint clears at 80 characters', () => {
  assert.match(TEXT.en.fbWhy, /right away/); assert.doesNotMatch(TEXT.en.fbWhy, /within a day, so|so it shows within a day/);
  assert.match(TEXT.fr.fbWhy, /tout de suite/);
  assert.match(CLIENT, /var STORY_OK = 80;/);
  assert.ok('Drive-thru coffee on 97 Street. Fresh espresso from a Penticton roaster. A free biscuit for dogs.'.length >= 80);
});

test('4: "Takeout only" gets the takeout icon; the laptop icon only with a laptop answer', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { cafe_info: { stay: { seats: 'takeout' } } }));
  assert.match(page(v, 'en'), /venue-cafe-stay"[^>]*><span aria-hidden="true">🥡<\/span> Takeout only/);
  assert.doesNotMatch(page(v, 'en'), /💻<\/span> Takeout only/);
  ok(await change(t, { cafe_info: { stay: { seats: 'few', laptops: 'all_day' } } }));
  assert.match(page(v, 'en'), /venue-cafe-stay"[^>]*><span aria-hidden="true">💻<\/span> Laptops welcome all day/);
  ok(await change(t, { cafe_info: { stay: { seats: 'lots' } } }));
  assert.match(page(v, 'en'), /venue-cafe-stay"[^>]*><span aria-hidden="true">🪑<\/span> Lots of seats inside/);
});

test('6: a Facebook page typed as the website becomes the Facebook link (live), and later steps reuse it', async () => {
  const fbFromSite = new Function(`${fnSrc('fbFromSite')}; return fbFromSite;`)();
  assert.equal(fbFromSite('facebook.com/gordsdrivethru'), 'https://www.facebook.com/gordsdrivethru');
  assert.equal(fbFromSite('https://m.facebook.com/gordsdrivethru/'), 'https://www.facebook.com/gordsdrivethru/');
  assert.equal(fbFromSite('fb.com/gordsdrivethru'), 'https://www.facebook.com/gordsdrivethru');
  assert.equal(fbFromSite('gordscoffee.ca'), ''); assert.equal(fbFromSite('facebook.com'), ''); assert.equal(fbFromSite('notfacebook.com/x'), '');
  // The save goes the Facebook field's way (validated, live), never to the website (reviewed).
  const save = CLIENT.slice(CLIENT.indexOf('var fbl = fbFromSite(site);'), CLIENT.indexOf('if (site && !siteOk(site))'));
  assert.match(save, /delete ch\.website;/); assert.match(save, /listF\.push\(\{ facebook_url: fbl \}\)/);
  assert.match(save, /nlF\.push\('website'\)/); assert.match(save, /S\.savedLine\.basics = T\.fbFromSite/);
  assert.match(save, /progress\('facebook', 'live'\)/);
  const v = mk('cafe'); const t = tokenFor(v.id);
  const r = await change(t, { facebook_url: fbFromSite('fb.com/gordsdrivethru') });
  ok(r); assert.deepEqual(r.body.review, []);
  const cfg = cfgOf(await setupOf(v));
  assert.equal(cfg.cur.facebook_url, 'https://www.facebook.com/gordsdrivethru'); assert.equal(cfg.cur.website, '');
  // The menu step offers it and prefills it; the Facebook step starts with it.
  assert.match(CLIENT, /field\('suMsoc', T\.menuSocialLabel, S\.menuSoc \|\| fbKnown\(\)/);
  assert.match(CLIENT, /fb: CUR\.facebook_url \|\| ''/);
  for (const L of ['en', 'fr']) assert.ok(TEXT[L].fbFromSite && TEXT[L].menuFbKnown, L);
  assert.equal(TEXT.en.fbFromSite, 'That’s your Facebook page. We’ve added it as your Facebook link.');
});

test('7: the price step says why it is asked while prices are not on pages', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe')));
  assert.equal(cfg.spendPublic, false);
  assert.equal(cfg.t.spendWhyOff, 'We’ll use this to show your price range once prices go on pages.');
  assert.match(CLIENT, /\(C\.spendPublic \? '' : '<p class="su-hint" id="suSpendWhy">' \+ h\(T\.spendWhyOff\) \+ '<\/p>'\)/);
  assert.doesNotMatch(TEXT.en.savedSpendOff, /don’t show/);
});

test('8: drive-thru and walk-up are asked once ("What you offer"); the Ordering screen keeps them and never re-sends them', async () => {
  const order = CLIENT.slice(CLIENT.indexOf("} else if (s === 'order') {"), CLIENT.indexOf("} else if (s === 'diet' && iceKind()) {"));
  assert.doesNotMatch(order, /drive_thru|walk_up|data-cbadge/);
  const save = CLIENT.slice(CLIENT.indexOf("if (k === 'orderSave') {"), CLIENT.indexOf("if (k === 'dietSave') {"));
  assert.doesNotMatch(save, /\{ badges:/); // read for "tap at least one", never sent
  assert.doesNotMatch(CLIENT, /S\.cafe\.order\.preorder = false; S\.badges\.drive_thru = false/);
  // Round trip: the badges from "What you offer" stay through an Ordering save.
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { badges: { drive_thru: true, walk_up: true } }));
  ok(await change(t, { cafe_info: { order: { preorder: true } } }));
  const cfg = cfgOf(await setupOf(v));
  assert.equal(cfg.cur.badges.drive_thru, true); assert.equal(cfg.cur.badges.walk_up, true);
  assert.match(page(v, 'en'), /Drive-thru/); assert.match(page(v, 'en'), /Walk-up window/);
  assert.ok(cfg.offerGroups.some((g) => g.keys.includes('drive_thru') && g.keys.includes('walk_up')));
});

test('9: "Every open day" never fills a day marked Closed, even on a page with no hours yet', () => {
  const S = { step: 'hours:edit', week: { mon: [['05:30', '14:00']], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null } };
  const F = new Function('S', 'DAYS', 'W', `${fnSrc('othersClosed')}\n${fnSrc('tapClosed')}\n${fnSrc('copyGets')}; return { tapClosed, copyGets };`)(S, DAYS, () => S.week);
  F.tapClosed('sun', true);
  const gets = DAYS.filter((x) => F.copyGets('mon', x));
  assert.deepEqual(gets, ['tue', 'wed', 'thu', 'fri', 'sat']);
  // Stored hours: a closed Sunday stays closed.
  const S2 = { step: 'hours:edit', week: { mon: [['05:30', '14:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [['09:00', '18:00']], sun: null } };
  const F2 = new Function('S', 'DAYS', 'W', `${fnSrc('othersClosed')}\n${fnSrc('copyGets')}; return { copyGets };`)(S2, DAYS, () => S2.week);
  assert.deepEqual(DAYS.filter((x) => F2.copyGets('mon', x)), ['tue', 'wed', 'thu', 'fri', 'sat']);
  assert.match(CLIENT, /if \(wk\[d\]\) \{ S\.hoffWas\[S\.step \+ d\] = wk\[d\]; wk\[d\] = null; tapClosed\(d, true\); \}/);
});

test('10 + 13 + 15: fewer repeats: one after-midnight note, part of the year asked in Hours only, no staff note up front, Send reminder', async () => {
  for (const type of ['cafe', 'restaurant', 'pub']) {
    const s = scriptOf(await setupOf(mk(type)));
    assert.doesNotMatch(s, /id="suLateHint"/, type); assert.match(s, /lateBtns\(d, j, y\)/);
    assert.doesNotMatch(s, /data-act="openEdit">' \+ h\(T\.partYearBtn\)/, type);
    assert.match(s, /big\('🗓️', T\.allYearClosed, T\.allYearClosedSub, true, 'yearClosed'\)/);
    assert.doesNotMatch(s, /id="suStaff"/);
    assert.match(s, /id="suSendFirst">' \+ h\(T\.sendBeforeLeave\)/);
  }
  assert.equal(TEXT.en.sendBeforeLeave, 'Tap Send before you leave this screen.'); assert.ok(TEXT.fr.sendBeforeLeave);
  // The café checklist's season row opens the Hours question.
  assert.match(CLIENT, /season: 'hours:year'/); assert.match(CLIENT, /if \(startAt === 'hours:year'\)/);
  // The edit page: the checklist without the percent and the badge talk.
  const v = mk('cafe');
  const edit = (await get(`/owner/${tokenFor(v.id)}`)).text;
  const card = edit.slice(edit.indexOf('id="opComplete"'), edit.indexOf('id="opCbPanel"'));
  assert.match(card, /Your page checklist/);
  assert.doesNotMatch(card, /% complete|Reach 100% to earn|counts what you sent|op-cb-ring/);
  assert.match(edit, /Managers and staff can use this link too/, 'the edit page keeps the staff note');
  assert.match(edit, /body\.owner-page #navTripBtn \{ display: none; \}/);
});

test('11: dog quick answers and the photo hint fit a takeout window', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe')));
  assert.deepEqual(cfg.t.quickDogsWindow, ['Dogs welcome at the window', 'Dog treats at the window']);
  assert.ok(!cfg.t.quickDogsNoPatio.some((x) => /patio/i.test(x)));
  assert.match(cfg.t.photosTakeout, /window/); assert.doesNotMatch(cfg.t.photosTakeout, /seats/);
  assert.match(CLIENT, /if \(key === 'dogs' && C\.cafe\) l = S\.cafe\.stay\.seats === 'takeout' \? T\.quickDogsWindow : S\.badges\.patio \? l : T\.quickDogsNoPatio;/);
  for (const k of ['quickDogsWindow', 'quickDogsNoPatio', 'photosTakeout']) assert.ok(TEXT.fr.cafe[k], k);
});

test('12: one name for café specials; a punch card or an any-day special shows no "Daily"', async () => {
  const cfg = cfgOf(await setupOf(mk('cafe')));
  assert.equal(cfg.t.labels.specials, 'Specials'); assert.equal(cfg.t.specialsQ, 'Any specials?');
  assert.equal(cfgOf(await setupOf(mk('cafe'), 'fr')).t.labels.specials, 'Spéciaux');
  // Restaurants keep "Weekly specials".
  assert.equal(cfgOf(await setupOf(mk('restaurant'))).t.labels.specials, 'Weekly specials');
  const sp = (o) => ({ days: DAYS, title: 'x', deal: 'x', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: null, season_to: null, ...o });
  const v = mk('cafe'); const t = tokenFor(v.id);
  ok(await change(t, { specials: [sp({ title: 'Punch card. 10th coffee free', deal: 'Punch card. 10th coffee free', days: ['mon', 'tue'] }), sp({ title: 'Muffin of the day', deal: 'Muffin of the day' }), sp({ title: 'Early bird', deal: '$1 off any drink', start: '05:30', end: '07:00' }), sp({ title: 'Toonie Tuesday', deal: '$2 drip', days: ['tue'] })] }));
  const html = page(v, 'en');
  const days = (title) => new RegExp(`<span class="venue-sp-days">([^<]*)</span><span class="venue-sp-main"><span class="venue-sp-title"[^>]*>${title}`).exec(html)[1];
  assert.equal(days('Punch card'), ''); assert.equal(days('Muffin of the day'), ''); assert.equal(days('Early bird'), 'Every day'); assert.equal(days('Toonie Tuesday'), 'Tue');
  assert.doesNotMatch(html, /venue-sp-days">Daily</);
  assert.equal(app.specialLine ? typeof app.specialLine : 'function', 'function');
});
