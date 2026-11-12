// Seventh first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub7-2026-11-10/REPORT.md). The setup is
// shared, so restaurants get the same fixes: "Next happy hour" skips days the place is closed (weekly, seasonal, closed
// months), seasons for happy hour / specials / weekly events, no claim prompt on a verified page, the story box, exact
// season dates, a seasonal kitchen time, "Which months are you closed?", one-tap Closed, Beach access and "Beach or
// patio bar", the menu link offers the website, and the new main photo on the photos screen.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test7-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
delete process.env.TRIP_PLANNER_V2;
delete process.env.TRIP_PLANNER_V3;
const app = require('../server.js');
const hours = require('../hours.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const wk = (fn) => Object.fromEntries(DAYS.map((d) => [d, fn(d)]));
// The Sandbar Pub, as the tester set it up: winter Thu-Sun 12-9 (Mon-Wed closed), summer every day 11 AM - 1 AM.
const WINTER = wk((d) => (['mon', 'tue', 'wed'].includes(d) ? [] : [['12:00', '21:00']]));
const SUMMER = wk(() => [['11:00', '01:00']]);
const HH = wk(() => [['15:00', '17:00']]);
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT7 ${type} ${++n}`, slug: `pt7-${type}-${n}`, region: 'osoyoos', type, latitude: 49.03 + n / 1000, longitude: -119.45,
  rating: 4.4, address: `${n} Main St, Osoyoos`, phone: '250-555-0177', hours: JSON.stringify(WINTER), description: 'A pub in Osoyoos with cold beer and pub food.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.97.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
// Okanagan local time on a date: the site's clock is UTC-7 from Nov 1, 2026 (and in summer), so 22:00 UTC is 3 PM.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h + 7, m)); };
const line = (v, fr, now) => { const r = app.venueHappyHour(app.getVenue(v.id), app.hoursWithExtras(app.getVenue(v.id), now), fr, now); return r && r.live ? r.live.text : ''; };
const sandbar = async (o = {}) => {
  const v = mk('pub', o);
  const t = tokenFor(v.id);
  ok(await change(t, { hours: WINTER, hours_checked: true, hours_seasons: [{ from: '06-01', to: '08-31', label: 'Summer hours', hours: SUMMER }] }));
  ok(await change(t, { happy_hour: HH, badges: { happy_hour: true } }));
  return { v, t };
};

// ---------- 1: "Next happy hour" skips days the place is closed ----------
test('1: hours.js happyHourState skips weekdays the place is closed, its seasonal week, its closed months and the happy hour\'s own season', () => {
  const place = JSON.stringify({ ...WINTER, _seasons: [{ from: '06-01', to: '08-31', label: 'Summer hours', hours: SUMMER }] });
  const hh = JSON.stringify(HH);
  // Tue Nov 10, 6 PM (closed Mon-Wed in winter): the next one is Thursday, not "tomorrow" (Wednesday).
  const tue = { weekday: 'tue', minutes: 18 * 60, date: '2026-11-10' };
  assert.equal(hours.happyHourState(hh, tue, true, []).from.weekday, 'wed', 'without the place: the old answer');
  const r = hours.happyHourState(hh, tue, true, [], { placeHours: place });
  assert.equal(r.state, 'next'); assert.equal(r.from.weekday, 'thu'); assert.equal(r.daysAhead, 2);
  // Monday evening: not Tuesday either.
  assert.equal(hours.happyHourState(hh, { weekday: 'mon', minutes: 1100, date: '2026-11-09' }, true, [], { placeHours: place }).from.weekday, 'thu');
  // A closed Wednesday at 3:30 PM: never "on now" or "later today".
  const wed = hours.happyHourState(hh, { weekday: 'wed', minutes: 930, date: '2026-11-11' }, false, [], { placeHours: place });
  assert.ok(wed && wed.state === 'next' && wed.from.weekday === 'thu', JSON.stringify(wed));
  assert.equal(hours.happyHourState(hh, { weekday: 'wed', minutes: 600, date: '2026-11-11' }, false, [], { placeHours: place }).state, 'next');
  // Thursday 3:30 PM: on.
  assert.equal(hours.happyHourState(hh, { weekday: 'thu', minutes: 930, date: '2026-11-12' }, false, [], { placeHours: place }).state, 'now');
  // In July the summer week applies: Tuesday evening -> tomorrow (Wednesday is open in summer).
  const jul = hours.happyHourState(hh, { weekday: 'tue', minutes: 1100, date: '2026-07-14' }, false, [], { placeHours: place });
  assert.equal(jul.from.weekday, 'wed'); assert.equal(jul.daysAhead, 1);
  // Closed for the season in January (open Feb-Dec): Dec 31 is the last one, then nothing more than a month ahead.
  const dec = hours.happyHourState(hh, { weekday: 'sun', minutes: 1100, date: '2026-12-27' }, false, [], { placeHours: place, openMonths: '2-12' });
  assert.equal(dec.from.date, '2026-12-31');
  assert.equal(hours.happyHourState(hh, { weekday: 'fri', minutes: 1100, date: '2027-01-01' }, false, [], { placeHours: place, openMonths: '2-12' }), null);
  // The happy hour's own season rides in its week ("_season"): none in November, so no "next" seven months away.
  const summerOnly = JSON.stringify({ ...HH, _season: { from: '06-01', to: '08-31' } });
  assert.equal(hours.happyHourState(summerOnly, { weekday: 'thu', minutes: 930, date: '2026-11-12' }, false, [], { placeHours: place }), null);
  assert.equal(hours.happyHourState(summerOnly, { weekday: 'thu', minutes: 930, date: '2026-07-16' }, false, [], { placeHours: place }).state, 'now');
  // Unknown days never close anything; a place with no hours behaves as before.
  assert.equal(hours.happyHourState(hh, tue, false, [], { placeHours: null }).from.weekday, 'wed');
  // The browser copy carries the helpers the map needs.
  assert.match(hours.HOURS_CLIENT_SRC, /function gateClosedOn/);
  assert.match(hours.HOURS_CLIENT_SRC, /function mdInRange/);
});

test('1: the venue page line skips closed weekdays, EN + FR (real-style data: winter Mon-Wed closed, summer every day)', async () => {
  const { v } = await sandbar();
  assert.equal(line(v, false, at('2026-11-10', '18:00')), 'Next happy hour: Thursday 3 PM');
  assert.match(line(v, true, at('2026-11-10', '18:00')), /^Prochain happy hour\s:\sjeudi 15\sh$/);
  assert.equal(line(v, false, at('2026-11-09', '18:30')), 'Next happy hour: Thursday 3 PM', 'Monday evening');
  assert.equal(line(v, false, at('2026-11-11', '15:30')), 'Next happy hour: tomorrow 3 PM', 'closed Wednesday: never on now');
  assert.match(line(v, false, at('2026-11-12', '15:30')), /Happy hour (on now|until)/);
  // In summer Wednesday is open.
  assert.equal(line(v, false, at('2027-07-13', '18:00')), 'Next happy hour: tomorrow 3 PM');
});

test('1: valley-wide counts and the map leave out a place closed today', async () => {
  const { v } = await sandbar();
  const wedAt = at('2026-11-11', '15:30');
  const st = app.happyHourStatesFor([{ ...app.getVenue(v.id), happy_hour_times: JSON.stringify(HH), hours: app.getVenue(v.id).hours }], wedAt).byId.get(v.id);
  assert.ok(!st.h || st.h.state === 'next', 'not on now on a closed day');
  assert.equal(st.closedToday, true);
  assert.equal(app.happyHourOffOn({ id: v.id, hours: app.getVenue(v.id).hours, happy_hour_times: JSON.stringify(HH) }, '2026-11-11', wedAt), true);
  assert.equal(app.happyHourOffOn({ id: v.id, hours: app.getVenue(v.id).hours, happy_hour_times: JSON.stringify(HH) }, '2026-11-12', wedAt), false);
  const row = app.mapPlacesData(wedAt).find((r) => r[2] === app.getVenue(v.id).name);
  assert.equal(row[11], 0, 'no happy hour times on the map on a closed Wednesday');
  const rowThu = app.mapPlacesData(at('2026-11-12', '15:30')).find((r) => r[2] === app.getVenue(v.id).name);
  assert.notEqual(rowThu[11], 0);
  // The map script hands the place's own hours to the shared rule.
  const map = await get('/map');
  assert.match(map.text, /p\.h \? \{ placeHours: expandFoodDrinkHours\(p\.h\) \} : null/);
});

// ---------- 2: seasons for happy hour, specials and weekly events ----------
test('2: a summer-only happy hour is stored with its season, shows its months, and is never on/next out of season', async () => {
  const { v, t } = await sandbar();
  ok(await change(t, { happy_hour: { ...HH, _season: { from: '06-01', to: '08-31' } } }));
  assert.deepEqual(app.happyHourSeasonOf(cfgOf((await get(`/owner/${t}/setup`)).text).cur.happy_hour), { from: '06-01', to: '08-31' });
  const nov = app.venueHappyHour(app.getVenue(v.id), app.hoursWithExtras(app.getVenue(v.id)), false, at('2026-11-12', '15:30'));
  assert.equal(nov.live, null, 'nothing on or next in November');
  assert.match(nov.week, /\(Jun–Aug\)$/);
  assert.match(app.venueHappyHour(app.getVenue(v.id), null, true, at('2026-11-12', '15:30')).week, /\(juin–août\)$/);
  assert.match(line(v, false, at('2027-07-15', '15:30')), /Happy hour (on now|until)/);
  // The edit page's week (no _season key) keeps the season; an explicit null clears it.
  ok(await change(t, { happy_hour: wk((d) => (d === 'sun' ? [] : [['15:00', '17:00']])) }));
  assert.deepEqual(app.happyHourSeasonOf(cfgOf((await get(`/owner/${t}/setup`)).text).cur.happy_hour), { from: '06-01', to: '08-31' });
  ok(await change(t, { happy_hour: { ...HH, _season: null } }));
  assert.equal(app.happyHourSeasonOf(cfgOf((await get(`/owner/${t}/setup`)).text).cur.happy_hour), null);
  // A bad season is refused.
  assert.equal((await change(t, { happy_hour: { ...HH, _season: { from: '06-01', to: '06-01' } } })).status, 400);
});

test('2: specials and weekly nights take a season: hidden out of season, labelled with their months, never "Today" on a closed day', async () => {
  const { v, t } = await sandbar();
  ok(await change(t, {
    specials: [{ days: ['wed'], title: 'Wing Wednesday', deal: '50¢ wings', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: null, season_to: null },
      { days: ['sat'], title: 'Beach BBQ', deal: 'Burgers on the sand', price: '$15', kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: '05-20', season_to: '09-06' }],
    weekly_nights: [{ days: ['fri'], kind: 'live_music', title: 'Live music', start: '20:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: null, detail_fr: null, season_from: '06-01', season_to: '08-31' },
      { days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: null, detail_fr: null }],
  }));
  const nights = app.venueWeeklyNightsList(v.id);
  assert.equal(nights[0].season_from, '06-01'); assert.equal(nights[0].season_to, '08-31');
  assert.ok(!('season_from' in nights[1]), 'a night without a season keeps its exact old shape');
  // November: the summer night and the summer special are hidden; Wednesday's special is listed but not "Today" (closed).
  const nov = at('2026-11-11', '12:00');
  const venue = app.getVenue(v.id);
  const sp = app.venueSpecials(venue, app.hoursWithExtras(venue, nov), false, nov);
  assert.deepEqual(sp.rows.map((r) => r.s.title), ['Wing Wednesday']);
  assert.equal(sp.rows[0].today, false, 'closed Wednesday: not Today');
  const wn = app.venueWeeklyNights(venue, app.hoursWithExtras(venue, nov), false, nov);
  assert.deepEqual(wn.rows.map((r) => r.s.title), ['Trivia']);
  // July: both show, each with its months.
  // (Last July: the specials were checked today, so a date next summer would read them as stale.)
  const jul = at('2026-07-10', '12:00');
  const spJ = app.venueSpecials(venue, app.hoursWithExtras(venue, jul), false, jul);
  assert.match(app.venueSpecialsHtml(spJ, false), /Beach BBQ<\/span> <span class="venue-season-tag">\(May 20 – Sep 6\)<\/span>/);
  const wnJ = app.venueWeeklyNights(venue, app.hoursWithExtras(venue, jul), false, jul);
  assert.match(app.venueWeeklyNightsHtml(wnJ, false), /Live music<\/span> <span class="venue-season-tag">\(Jun–Aug\)<\/span>/);
  assert.match(app.venueWeeklyNightsHtml(app.venueWeeklyNights(venue, app.hoursWithExtras(venue, jul), true, jul), true), /\(juin–août\)/);
  assert.equal(app.seasonRangeShort('07-01', '07-31', false), 'July');
  // A bad night season is refused.
  assert.equal((await change(t, { weekly_nights: [{ days: ['fri'], kind: 'trivia', title: 'Trivia', season_from: '06-01', season_to: null }] })).status, 400);
});

test('2 + 5: the setup screens carry the season box (All year / Only some months / exact dates) and the closed-day note, EN + FR', async () => {
  const { t } = await sandbar();
  const html = (await get(`/owner/${t}/setup`)).text;
  const s = scriptOf(html);
  for (const k of ['seasonBox(\'happy\'', 'seasonBox(\'specials.\' + i', 'seasonBox(\'nights.\' + i', 'warnHtml(\'specials\'', 'warnHtml(\'nights\'', 'data-sea="hours:exact"', 'week._season = hs.from']) assert.ok(s.includes(k), k);
  for (const k of ['seasonAll', 'seasonSome', 'seasonExactLink', 'closedWarn', 'happySeasonH', 'seasonFrom', 'seasonTo']) {
    assert.ok(TEXT.en[k] && TEXT.fr[k] && TEXT.en[k] !== TEXT.fr[k], k);
  }
  new Function(s); // parses
});

// ---------- 3: no claim prompt on a verified page ----------
test('3: once the owner has used their link, the page shows "Verified by the business" and no claim prompt', async () => {
  const v = mk('pub');
  const before = await get(`/osoyoos/pubs/${app.getVenue(v.id).slug}`);
  assert.match(before.text, /Claim this listing<\/a>/);
  ok(await change(tokenFor(v.id), { pub_info: { kitchen: { mode: 'same' } } }));
  const page = await get(`/osoyoos/pubs/${app.getVenue(v.id).slug}`);
  assert.match(page.text, /Verified by the business/);
  assert.doesNotMatch(page.text, /Own or manage this business\?<\/p>/);
  assert.doesNotMatch(page.text, /Claim this listing<\/a>/);
  assert.match(page.text, /id="venueOwnerCta" data-venue-id="\d+" data-claimed="1" hidden/);
  const fr = await get(`/fr/osoyoos/pubs/${app.getVenue(v.id).slug}`);
  if (fr.status === 200) assert.doesNotMatch(fr.text, /Réclamer cette fiche<\/a>/);
});

// ---------- 4: the story box ----------
test('4: the story box edits the old text in place, has a ✕, and a join with no space gets one', async () => {
  const v = mk('pub');
  const html = (await get(`/owner/${tokenFor(v.id)}/setup`)).text;
  const s = scriptOf(html);
  assert.match(s, /textarea\.su-area'\), function\(inp\)/);
  assert.match(s, /T\.storyEditHint/);
  const fix = new Function('CUR', `${/function storyJoinFix\(v\)\{[\s\S]*?\n  \}/.exec(s)[0]}; return storyJoinFix;`)({ description: 'A pub in Osoyoos with cold beer and pub food.' });
  assert.equal(fix('A pub in Osoyoos with cold beer and pub food.A beach bar on the lake.'), 'A pub in Osoyoos with cold beer and pub food. A beach bar on the lake.');
  assert.equal(fix('A new story, written fresh.'), 'A new story, written fresh.');
  assert.equal(fix('A pub in Osoyoos with cold beer and pub food. More.'), 'A pub in Osoyoos with cold beer and pub food. More.');
  assert.ok(TEXT.fr.storyEditHint && TEXT.fr.storyClear);
});

// ---------- 5: seasons on exact days ----------
test('5: a season from May 20 to Sep 6 is stored as days and the open status follows it', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  ok(await change(t, { hours: WINTER, hours_checked: true, hours_seasons: [{ from: '05-20', to: '09-06', label: 'Summer hours', hours: SUMMER }] }));
  assert.deepEqual(app.venueHoursExtras(v.id).seasons.map((x) => [x.from, x.to]), [['05-20', '09-06']]);
  const status = (date, hhmm) => { const now = at(date, hhmm); return hours.statusAt(hours.parseHours(app.hoursWithExtras(app.getVenue(v.id), now)), app.okanaganClock(now)); };
  assert.equal(status('2027-05-25', '23:30').state, 'open', 'Tue May 25, 11:30 PM: summer hours');
  assert.equal(status('2027-05-18', '23:30').state, 'closed', 'Tue May 18: winter (closed Tuesdays)');
  assert.equal(status('2026-09-05', '23:30').state, 'open', 'Sat Sep 5, 11:30 PM');
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /if \(sf\.exact\) S\.sea\.exact = sf\.exact/);
  assert.match(s, /from: S\.sea\.exact \? S\.sea\.exact\.from/);
});

// ---------- 6: seasonal kitchen time ----------
test('6: a seasonal kitchen time is stored in pub_info.kitchen.season and the page shows the right one by date; old kitchens read the same', async () => {
  const { v, t } = await sandbar();
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '20:00', note: '', season: { from: '06-01', to: '08-31', closes: '00:00' } } } }));
  assert.deepEqual(app.venuePubInfo(v.id).kitchen, { mode: 'earlier', closes: '20:00', season: { from: '06-01', to: '08-31', closes: '00:00' } });
  const venue = app.getVenue(v.id);
  assert.match(app.pubInfoLinesHtml(venue, false, at('2026-11-12', '12:00')), /Kitchen closes at 8 PM/);
  assert.match(app.pubInfoLinesHtml(venue, false, at('2027-07-12', '12:00')), /Kitchen closes at (midnight|12 AM)/);
  assert.match(app.pubInfoLinesHtml(venue, true, at('2027-07-12', '12:00')), /La cuisine ferme à minuit/);
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '20:00', season: { from: '06-01', to: '08-31', closes: 'close' } } } }));
  assert.match(app.pubInfoLinesHtml(app.getVenue(v.id), false, at('2027-07-12', '12:00')), /Food served until close/);
  // An old kitchen (no season) reads exactly as before.
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:00' } } }));
  assert.deepEqual(app.venuePubInfo(v.id).kitchen, { mode: 'earlier', closes: '21:00' });
  assert.match(app.pubInfoLinesHtml(app.getVenue(v.id), false, at('2027-07-12', '12:00')), /Kitchen closes at 9 PM/);
  assert.equal((await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '20:00', season: { from: '06-01', to: '08-31', closes: '9pm' } } } })).status, 400);
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /kv\.season = \{ from: kseason\.from, to: kseason\.to/);
  for (const k of ['kitchenSeasonQ', 'kitchenSeasonSame', 'kitchenSeasonClose', 'kitchenSeasonNeed']) assert.ok(TEXT.en[k] && TEXT.fr[k], k);
});

// ---------- 7 + 8: months closed, one-tap Closed ----------
test('7 + 8: "Which months are you closed?" stores the open months as before; each hours row has a one-tap Closed', async () => {
  const v = mk('pub');
  const s = scriptOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.match(s, /q\(T\.monthsClosedQ, T\.monthsClosedLead\)/);
  assert.match(s, /S\.months = openM;/);
  assert.match(s, /data-hoff="' \+ d \+ '"/);
  assert.equal(TEXT.en.monthsClosedQ, 'Which months are you closed?');
  assert.equal(TEXT.fr.monthsClosedQ, 'Quels mois êtes-vous fermé\u202f?');
  // The stored season is the open months, exactly as before.
  ok(await change(tokenFor(v.id), { open_months: '2-12' }));
  const cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(cfg.cur.open_months, '2-12');
});

// ---------- 9: Beach access, Beach or patio bar ----------
test('9: Beach access is an owner tile for pubs and restaurants (chip, map filter) and pubs can be a "Beach or patio bar"', async () => {
  for (const type of ['pub', 'restaurant']) assert.ok(app.ownerExtraBadgesFor(type).includes('beach_access'), type);
  assert.deepEqual(app.OWNER_EXTRA_BADGE_LABELS.beach_access, { en: 'Beach access', fr: 'Accès à la plage', icon: null, group: 'place' });
  assert.ok(app.MAP_OWNER_FEATURES.some((f) => f.key === 'beachaccess' && f.owner === 'beach_access'));
  assert.ok(app.PUB_PLACE_TYPES.includes('Beach or patio bar'));
  assert.equal(app.frPlaceType('Beach or patio bar'), 'Bar de plage ou terrasse');
  const v = mk('pub');
  const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(cfg.offerGroups.some((g) => g.keys.includes('beach_access')));
  assert.equal(cfg.offerLabels.beach_access, 'Beach access');
  assert.ok(cfg.placeTypes.includes('Beach or patio bar'));
  ok(await change(t, { badges: { beach_access: true }, place_type: 'Beach or patio bar', cuisines: ['Pub Fare'] }));
  assert.equal(app.venueOwnerFeatures(v.id).beach_access, true);
  const page = await get(`/osoyoos/pubs/${app.getVenue(v.id).slug}`);
  assert.match(page.text, /Beach access/);
  assert.match(page.text, /Beach or patio bar/);
  const map = await get('/map');
  assert.match(map.text, /beachaccess: 'Beach access'/);
});

// ---------- 10: the menu link offers the website ----------
test('10: the menu link offers the website she sent (still being checked), never one being removed', async () => {
  const v = mk('pub', { website: null });
  const t = tokenFor(v.id);
  const r = await change(t, { website: 'sandbarpub.ca' });
  ok(r);
  assert.match(app.ownerWebsitePending(v.id), /^https:\/\/sandbarpub\.ca\/?$/);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.match(cfg.website, /^https:\/\/sandbarpub\.ca\/?$/);
  const s = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /fill\(T\.useSite, \{ site:/);
  assert.match(s, /if \(ch\.website\) C\.website =/);
  // A website being removed is never offered.
  const v2 = mk('pub', { website: 'https://oldsite.ca/' });
  const t2 = tokenFor(v2.id);
  ok(await change(t2, { website: '' }));
  assert.equal(cfgOf((await get(`/owner/${t2}/setup`)).text).website, '');
});

// ---------- 11: the new main photo ----------
test('11: after a new main photo is picked, the photos screen says "Your new main photo (on your page within a day)"', async () => {
  const g = mk('pub', { image_url: 'https://lh3.googleusercontent.com/p/abc=s1600' });
  assert.equal(app.setupImageSource(app.getVenue(g.id), '/owner-photos/preview/x.jpg'), 'pending');
  assert.equal(app.setupImageSource(app.getVenue(g.id), ''), 'google');
  const s = scriptOf((await get(`/owner/${tokenFor(g.id)}/setup`)).text);
  assert.match(s, /C\.imageSource === 'pending' \? T\.curMainPending/);
  assert.match(s, /C\.image = S\.mainSrc; C\.imageSource = 'pending'/);
  assert.equal(TEXT.en.curMainPending, 'Your new main photo (on your page within a day)');
  assert.ok(TEXT.fr.curMainPending);
});

test('every new string has a French version', () => {
  const missing = Object.keys(TEXT.en).filter((k) => !(k in TEXT.fr));
  assert.deepEqual(missing, []);
});
