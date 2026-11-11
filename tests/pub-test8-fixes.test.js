// Eighth first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub8-2026-11-10/REPORT.md). The setup is
// shared, so restaurants get the same fixes: an upcoming closure no longer hides happy hour, specials and weekly nights;
// "Free. No cost, ever."; a safer "Mark closed" with Undo; full day names; "Open after midnight?"; free parking, room for
// RVs / trailers, off-sales, "Service dogs welcome" and "Country pub"; a public "No dogs" line; times on a special; no
// website options without a website; the public page fits 300px; a clearer photo tick box; Help clear of the heading.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test8-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
delete process.env.TRIP_PLANNER_V2;
delete process.env.TRIP_PLANNER_V3;
const app = require('../server.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const wk = (fn) => Object.fromEntries(DAYS.map((d) => [d, fn(d)]));
const OPEN = wk(() => [['11:00', '23:00']]);
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT8 ${type} ${++n}`, slug: `pt8-${type}-${n}`, region: 'vernon', type, latitude: 50.3 + n / 1000, longitude: -119.27,
  rating: 4.4, address: `${n} Highway 97 N, Vernon`, phone: '250-555-0142', hours: JSON.stringify(OPEN), description: 'A country pub on the highway with cold beer and pub food.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.98.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
// Okanagan local time on a date: the site's clock is UTC-8 in December (PST).
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h + 8, m)); };
const page = (v, now, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now, lang });
const SPECIAL = (o = {}) => ({ days: DAYS.slice(), title: 'Wing night', deal: '60¢ wings', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: null, season_to: null, ...o });
const NIGHT = { days: DAYS.slice(), kind: 'karaoke', title: 'Karaoke', start: '21:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: null, detail_fr: null };

// The Hitching Post as she set it up: happy hour Mon–Fri 3–6 with deals, a special and karaoke every day, closed Dec 25–26.
const hitchingPost = async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  const hh = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [['15:00', '18:00']]]));
  ok(await change(t, { happy_hour: hh, happy_hour_deals: { deals: [{ price: '$5', text: 'Highballs' }, { price: '$6', text: 'Pints' }], deals_fr: [] }, badges: { happy_hour: true } }));
  ok(await change(t, { specials: [SPECIAL()] }));
  ok(await change(t, { weekly_nights: [NIGHT] }));
  ok(await change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }, { from: '2026-12-26', to: '2026-12-26', note: 'Boxing Day' }] }));
  return { v, t };
};

// ---------- 1: an upcoming closure no longer hides happy hour, specials and weekly nights ----------
test('1: a Dec 25–26 closure leaves happy hour, specials and nights up on Dec 16 and Dec 24, hides them Dec 25, back Dec 27', async () => {
  const { v } = await hitchingPost();
  const venue = () => app.getVenue(v.id);
  const hrs = (now) => app.hoursWithExtras(venue(), now);
  // Wed Dec 16 and Thu Dec 24 (open days, inside the two-week notice), Fri Dec 25 (closed), Sun Dec 27 (back open).
  for (const [date, shown] of [['2026-12-16', true], ['2026-12-24', true], ['2026-12-25', false], ['2026-12-27', true]]) {
    const now = at(date, '16:00');
    // The notice itself is still there before and during the closure ("Closed Dec 25–26, reopens Dec 27.").
    if (date !== '2026-12-27') assert.match(app.getAdvisoryNotes(now).get(v.id) || '', /Closed Dec 25.26, reopens Dec 27/, date);
    assert.equal(app.offersBlockedIds(now).has(v.id), !shown, date);
    const hh = app.venueHappyHour(venue(), hrs(now), false, now);
    const sp = app.venueSpecials(venue(), hrs(now), false, now);
    const wn = app.venueWeeklyNights(venue(), hrs(now), false, now);
    assert.equal(!!hh, shown, `happy hour ${date}`);
    assert.equal(!!sp, shown, `specials ${date}`);
    assert.equal(!!wn, shown, `nights ${date}`);
    // Roam Now / the counts / the homepage line read the same rule.
    const st = app.happyHourStatesFor([{ ...venue(), happy_hour_times: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [['15:00', '18:00']]]))) }], now).byId.get(v.id);
    assert.equal(st.blocked, !shown, `roam now ${date}`);
    assert.equal(app.specialsTodayFor([venue()], now).byId.get(v.id).blocked, !shown, `specials today ${date}`);
    assert.equal(app.weeklyNightsTodayFor([venue()], now).byId.get(v.id).blocked, !shown, `nights today ${date}`);
  }
  // Wednesday Dec 16 at 4 PM: happy hour is on, and the page says so with the deals, wing night and karaoke.
  const dec16 = at('2026-12-16', '16:00');
  assert.match(app.venueHappyHour(venue(), hrs(dec16), false, dec16).live.text, /Happy hour on now/);
  const html = page(v, dec16, 'en');
  assert.match(html, /Happy hour on now/);
  assert.match(html, /Wing night/);
  assert.match(html, /Karaoke/);
  // The notice shows near the top on the page's own clock, and the open-now line stays.
  assert.match(html, /Closed Dec 25.26, reopens Dec 27/);
  assert.match(html, /venue-open-status/);
  // Christmas Day: hidden, as before; the notice is up.
  const dec25 = page(v, at('2026-12-25', '16:00'), 'en');
  assert.doesNotMatch(dec25, /Happy hour on now/);
  assert.doesNotMatch(dec25, /class="venue-wn-title"/);
  // Dec 27: no notice.
  assert.doesNotMatch(page(v, at('2026-12-27', '16:00'), 'en'), /reopens Dec 27/);
});

test('1: a real written advisory still hides them', async () => {
  const { v } = await hitchingPost();
  const now = at('2026-12-16', '16:00');
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', v.id, 'add', 'Temporarily closed for renovations. https://example.com/notice', { reason: 'pub test 8', batch_id: 'pt8', reviewer: 'test' }).ok, true);
  assert.ok(app.offersBlockedIds(now).has(v.id));
  assert.equal(app.venueHappyHour(app.getVenue(v.id), app.hoursWithExtras(app.getVenue(v.id), now), false, now), null);
  assert.equal(app.venueSpecials(app.getVenue(v.id), app.hoursWithExtras(app.getVenue(v.id), now), false, now), null);
  assert.equal(app.venueWeeklyNights(app.getVenue(v.id), app.hoursWithExtras(app.getVenue(v.id), now), false, now), null);
});

// ---------- 2: free ----------
test('2: "Free. No cost, ever." on the setup welcome and the edit page; softer wording', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  assert.equal(TEXT.en.freeLine, 'Free. No cost, ever.');
  assert.equal(TEXT.fr.freeLine, 'Gratuit. Aucuns frais, jamais.');
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /'<p class="su-free" id="suFree">.*h\(T\.freeLine\)/);
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /id="opFree"[^>]*>.*Free\. No cost, ever\./);
  assert.doesNotMatch(edit, /Features, prices and deals/);
  assert.match(edit, /Features and deals/);
  assert.match((await get(`/fr/owner/${t}`)).text, /Gratuit\. Aucuns frais, jamais\./);
  assert.equal(TEXT.en.labels.spend, 'Price per person');
  assert.equal(TEXT.fr.labels.spend, 'Prix par personne');
  assert.match(s, /spend: '🍽️'/);
});

// ---------- 3: the hours screen ----------
test('3: "Mark closed" sits on its own line with Undo; full day names; "Open after midnight?"', async () => {
  const v = mk('restaurant');
  const s = scriptOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  // Change keeps its spot; the closed button is on the next line, never beside it.
  const row = s.slice(s.indexOf('su-hrow'), s.indexOf("return '<div class=\"su-day su-hopen\""));
  assert.ok(row.indexOf('data-hopen') < row.indexOf('su-hoffrow') && row.indexOf('su-hoffrow') < row.indexOf('data-hoff'));
  assert.match(row, /T\.dayClosedNow/);
  assert.match(row, /T\.undo/);
  assert.match(s, /fill\(T\.sameAs, \{ day: longDay\(DAYS\[i - 1\]\) \}\)/);
  assert.equal(TEXT.en.lateLbl, 'Open after midnight?');
  assert.equal(TEXT.fr.lateLbl, 'Ouvert après minuit?');
  assert.equal(TEXT.en.closeDayBtn, 'Mark closed');
  assert.equal(TEXT.en.undo, 'Undo');
  const css = (await get(`/owner/${tokenFor(v.id)}/setup`)).text;
  assert.match(css, /\.su-hoffrow \{ flex-basis: 100%/);
});

// ---------- 4 + 5: new offers, service dogs, Country pub, the No dogs line ----------
test('4: free parking, room for RVs, off-sales (pubs), service dogs, Country pub', async () => {
  for (const type of ['pub', 'restaurant']) for (const k of ['free_parking', 'rv_parking', 'service_dogs']) assert.ok(app.ownerExtraBadgesFor(type).includes(k), `${type} ${k}`);
  assert.ok(app.ownerExtraBadgesFor('pub').includes('off_sales'));
  assert.ok(!app.ownerExtraBadgesFor('restaurant').includes('off_sales'));
  assert.equal(app.OWNER_EXTRA_BADGE_LABELS.free_parking.fr, 'Stationnement gratuit');
  for (const k of ['free_parking', 'rv_parking', 'off_sales', 'service_dogs']) assert.ok(app.OWNER_EXTRA_BADGE_LABELS[k].en && app.OWNER_EXTRA_BADGE_LABELS[k].fr, k);
  for (const [key, owner] of [['parking', 'free_parking'], ['rv', 'rv_parking'], ['offsales', 'off_sales']]) assert.ok(app.MAP_OWNER_FEATURES.some((f) => f.key === key && f.owner === owner), key);
  assert.ok(!app.MAP_OWNER_FEATURES.some((f) => f.owner === 'service_dogs'));
  assert.ok(app.PUB_PLACE_TYPES.includes('Country pub'));
  const v = mk('pub');
  const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  for (const k of ['free_parking', 'rv_parking', 'off_sales']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes('service_dogs')); // a follow-up under No dogs, not a tile of its own
  assert.equal(cfg.offerLabels.service_dogs, 'Service dogs welcome');
  assert.ok(cfg.placeTypes.includes('Country pub'));
  ok(await change(t, { badges: { free_parking: true, rv_parking: true, off_sales: true }, place_type: 'Country pub', cuisines: ['Pub Fare'] }));
  const f = app.venueOwnerFeatures(v.id);
  assert.ok(f.free_parking && f.rv_parking && f.off_sales);
  const html = page(v, new Date(), 'en');
  for (const w of ['Free parking', 'Room for RVs and trailers', 'Liquor store / off-sales', 'Country pub']) assert.ok(html.includes(w), w);
  const fr = page(v, new Date(), 'fr');
  for (const w of ['Stationnement gratuit', 'Pub de campagne']) assert.ok(fr.includes(w), w);
  // A restaurant never gets the off-sales tile.
  const r = mk('restaurant');
  assert.ok(!cfgOf((await get(`/owner/${tokenFor(r.id)}/setup`)).text).offerGroups.flatMap((g) => g.keys).includes('off_sales'));
  const map = await get('/map');
  assert.match(map.text, /parking: 'Free parking'/);
});

test('5: "No dogs" shows publicly, "(service dogs welcome)" when ticked; never with the Dog friendly badge', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  assert.doesNotMatch(page(v, new Date(), 'en'), /venue-pub-dogs/);
  ok(await change(t, { not_offered: ['dogs'] }));
  let html = page(v, new Date(), 'en');
  assert.match(html, /venue-pub-dogs[^>]*><span aria-hidden="true">🐕<\/span> <strong>No dogs<\/strong>/);
  ok(await change(t, { badges: { service_dogs: true } }));
  html = page(v, new Date(), 'en');
  assert.match(html, /<strong>No dogs \(service dogs welcome\)<\/strong>/);
  // Never a chip of its own.
  assert.doesNotMatch(html, /<span class="[^"]*">Service dogs welcome<\/span>/);
  assert.match(page(v, new Date(), 'fr'), /Pas de chiens \(chiens d’assistance bienvenus\)/);
  // A restaurant gets the line too.
  const r = mk('restaurant');
  ok(await change(tokenFor(r.id), { not_offered: ['dogs'] }));
  assert.match(page(r, new Date(), 'en'), /<strong>No dogs<\/strong>/);
  // Dog friendly (badge rules decide it) and the line never show together.
  const d = mk('pub', { dog_friendly: 1 });
  require('../db.js').prepare("INSERT OR IGNORE INTO venue_not_offered (venue_id, item) VALUES (?, 'dogs')").run(d.id);
  assert.doesNotMatch(page(d, new Date(), 'en'), /venue-pub-dogs/);
  // The setup: the follow-up shows only with No dogs, and is saved only with it.
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /id="suServiceDogs"/);
  assert.match(s, /badges\.service_dogs = !!\(S\.noDogs && !badges\.dog_friendly && S\.badges\.service_dogs\)/);
  assert.ok(TEXT.en.serviceDogsSub && TEXT.fr.serviceDogsSub);
});

// ---------- 6: a special's times ----------
test('6: a special takes an optional start and end time; old rows read the same', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  ok(await change(t, { specials: [SPECIAL({ days: ['sun'], title: 'Sunday brunch', deal: 'Eggs benny and caesars', start: '10:00', end: '13:00' }), SPECIAL({ days: ['wed'] })] }));
  const list = app.venueSpecialsList(v.id);
  const brunch = list.find((x) => x.title === 'Sunday brunch'), wings = list.find((x) => x.title === 'Wing night');
  assert.equal(brunch.start, '10:00'); assert.equal(brunch.end, '13:00');
  assert.equal(wings.start, null); assert.equal(wings.end, null);
  const html = page(v, at('2026-11-18', '12:00'), 'en');
  assert.match(html, /Sunday brunch[\s\S]*?<span class="venue-sp-time">10 AM–1 PM<\/span>/);
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /data-sp="' \+ i \+ ':start"/);
  assert.match(s, /data-sp="' \+ i \+ ':end"/);
  assert.match(s, /start: e\.start \|\| null, end: e\.end \|\| \(e\.endClose \? 'close' : null\)/);
  assert.ok(TEXT.en.specialTimeQ && TEXT.fr.specialTimeQ && TEXT.fr.specialTimeEx && TEXT.fr.specialTimeSame);
  // The setup sends the stored rows back untouched: a row it shows with no change keeps its times exactly.
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.specials.find((x) => x.title === 'Sunday brunch').start, '10:00');
});

// ---------- 7: no website, no website options ----------
test('7: without a website, "It\'s on my website" and "My menu is on my website" are not offered', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  ok(await change(t, { not_offered: ['website'] }));
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).website, '');
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /\(C\.website \? big\('🌐', T\.web, '', true, 'go:menu:web'\) : ''\)/);
  assert.match(s, /\(C\.website \? big\('🌐', hk === 'happy' \? T\.happyWeb : T\.specialsWeb/);
  // With a website they stay.
  const w = mk('pub', { website: 'https://hitchingpost.example.com' });
  assert.match(cfgOf((await get(`/owner/${tokenFor(w.id)}/setup`)).text).website, /hitchingpost\.example\.com/);
});

// ---------- 8: the public page fits a 300px screen ----------
test('8: the venue layout columns may shrink below their content (no overflow at 300px)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'food-drink-venue.css'), 'utf8');
  assert.match(css, /body\.fd-venue-page \.fd-layout>\*,body\.fd-venue-page \.fd-summary,body\.fd-venue-page \.fd-summary>\*\{min-width:0;max-width:100%\}/);
  assert.match(css, /@media \(max-width:899px\)\{body\.fd-venue-page \.fd-layout\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

// ---------- 9 + 10: the photo tick box and Help ----------
test('9 + 10: a clearer photo tick box right above Send; the "?" sits in the Back row', async () => {
  const v = mk('restaurant');
  const html = (await get(`/owner/${tokenFor(v.id)}/setup`)).text;
  const s = scriptOf(html);
  assert.match(s, /'<label class="su-tick su-rights'/);
  assert.match(s, /su-rights[\s\S]{0,800}'sendPhotos'/); // right above Send
  assert.equal(TEXT.en.rightsStep, 'Tick this, then send');
  assert.match(html, /\.su-tick\.su-rights input \{ width: 36px; height: 36px; \}/);
  assert.match(html, /t\.appendChild\(b\);document\.body\.classList\.add\('su-help-inrow'\)/);
  assert.match(html, /body\.owner-setup\.su-help-inrow \.su-top \.ohb-btn \{ position: static;/);
});

test('every new string has a French version', () => {
  const missing = Object.keys(TEXT.en).filter((k) => !(k in TEXT.fr));
  assert.deepEqual(missing, []);
});
