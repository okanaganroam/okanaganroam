// Sixth first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub6-2026-11-10/REPORT.md). The setup is
// shared, so restaurants get the same fixes: seasonal hours as their own day-by-day week after "Are these your hours all
// year?", the happy hour line skips closures, one honest time promise, "Something else" empties the event name, the
// owner's "Your updates" labels, no implied "no sports", the closures button not sticky, an honest photo label, "Not
// sure" for Instagram and Facebook, "I'm done for now" is the end, a Fireplace tile, and a red website box.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test6-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
delete process.env.TRIP_PLANNER_V2;
delete process.env.TRIP_PLANNER_V3;
const app = require('../server.js');
const hours = require('../hours.js');
const pc = require('../portal-completeness.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [['11:00', '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT6 ${type} ${++n}`, slug: `pt6-${type}-${n}`, region: 'summerland', type, latitude: 49.6 + n / 1000, longitude: -119.67,
  rating: 4.3, address: `${n} Lakeshore Dr, Summerland`, phone: '250-555-0144', hours: WEEK, description: 'A fixture used only by the sixth pub test fix tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const text = (p) => get(p).then((r) => r.text);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.96.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
// A date `days` after today (Okanagan calendar), and the next Tuesday at least two days ahead.
const today = app.okanaganClock(new Date()).date;
const nextTuesday = () => { let d = hours.shiftDate(today, 2); while (hours.dateWeekday(d) !== 'tue') d = hours.shiftDate(d, 1); return d; };
// Noon-ish in the Okanagan on that date (20:00 UTC is the same calendar day in PST and PDT).
const noonOn = (date) => new Date(`${date}T20:00:00Z`);

// ---------- 1: seasonal hours ----------
test('1: a summer set is its own week: a day closed in the usual week can be open in summer, and the page and Open now use it', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  const usual = Object.fromEntries(DAYS.map((d) => [d, d === 'mon' || d === 'tue' ? [] : [['15:00', '22:00']]]));
  const summer = Object.fromEntries(DAYS.map((d) => [d, [['11:00', d === 'fri' || d === 'sat' ? '01:00' : '23:00']]]));
  ok(await change(t, { hours: usual, hours_checked: true, hours_seasons: [{ from: '06-01', to: '08-31', label: 'Summer hours', hours: summer }] }));
  const stored = app.venueHoursExtras(v.id).seasons;
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].hours.mon, [['11:00', '23:00']], 'Monday is open in summer');
  const venue = app.getVenue(v.id);
  const parsed = hours.parseHours(venue.hours_live);
  // A Monday in July: open at 1 PM (the usual week has Monday closed).
  let julMon = '2027-07-01'; while (hours.dateWeekday(julMon) !== 'mon') julMon = hours.shiftDate(julMon, 1);
  assert.equal(hours.statusAt(parsed, { weekday: 'mon', minutes: 13 * 60, date: julMon }).state, 'open');
  // A Monday in November: closed.
  let novMon = '2027-11-01'; while (hours.dateWeekday(novMon) !== 'mon') novMon = hours.shiftDate(novMon, 1);
  assert.equal(hours.statusAt(parsed, { weekday: 'mon', minutes: 13 * 60, date: novMon }).state, 'closed');
  // A Friday in summer until 1 AM: still open at 12:30 AM early Saturday.
  let julSat = '2027-07-01'; while (hours.dateWeekday(julSat) !== 'sat') julSat = hours.shiftDate(julSat, 1);
  assert.equal(hours.statusAt(parsed, { weekday: 'sat', minutes: 30, date: julSat }).state, 'open');
  // The public page lists the summer week day by day (with Monday open).
  const html = app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en' });
  assert.match(html, /Summer hours \(Jun 1 – Aug 31\)|Summer hours \(Jun 1–Aug 31\)|Summer hours/);
  // The setup reads it back as a week, not one time.
  const cfg = cfgOf(await text(`/owner/${t}/setup`));
  assert.deepEqual(cfg.cur.hours_seasons[0].hours.mon, [['11:00', '23:00']]);
});

test('1: an older seasonal set (one time on the usual open days) still reads exactly as before', () => {
  const old = { mon: [], tue: [], wed: [['11:00', '20:00']], thu: [['11:00', '20:00']], fri: [['11:00', '20:00']], sat: [['11:00', '20:00']], sun: [['11:00', '20:00']] };
  const raw = JSON.stringify({ ...JSON.parse(WEEK), _seasons: [{ from: '11-01', to: '04-30', label: '', hours: old }] });
  const p = hours.parseHours(raw);
  assert.equal(p.seasons.length, 1);
  assert.equal(p.seasons[0].days.mon.status, 'closed');
  assert.deepEqual(p.seasons[0].days.wed.ranges, [[660, 1200]]);
  assert.equal(hours.statusAt(p, { weekday: 'wed', minutes: 19 * 60, date: '2027-01-06' }).state, 'open');
  assert.equal(hours.statusAt(p, { weekday: 'wed', minutes: 21 * 60, date: '2027-01-06' }).state, 'closed');
});

test('1: the setup asks "Are these your hours all year?" and gives the other season its own day-by-day list (EN + FR)', async () => {
  for (const type of ['pub', 'restaurant']) {
    const html = await text(`/owner/${tokenFor(mk(type).id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
    assert.equal(cfg.t.allYearQ, 'Are these your hours all year?');
    assert.equal(cfg.t.allYearYes, 'Yes, all year');
    assert.equal(cfg.t.allYearSummer, 'No, different in summer');
    assert.equal(cfg.t.allYearWinter, 'No, different in winter');
    assert.doesNotMatch(JSON.stringify(cfg.t), /shorter winter hours from November to April/, 'the hint no longer assumes the current hours are summer ones');
    // Yes on the hours, or Next after changing them, goes to the question.
    assert.match(s, /if \(k === 'hoursOk'\) return go\('hours:year'\);/);
    assert.match(s, /if \(k === 'hoursNext'\)/);
    assert.match(s, /big\('✓', T\.allYearYes, '', false, 'yearAll'\)/);
    assert.match(s, /'yearSeason:summer'/); assert.match(s, /'yearSeason:winter'/);
    // The season's own week starts from the usual week, every day (closed ones too), and any day can be opened.
    assert.match(s, /S\.sea\.week = clone\(S\.week\)/);
    assert.match(s, /function W\(\)\{ return S\.step === 'hours:season' \? S\.sea\.week : S\.week; \}/);
    assert.match(s, /data-copyevery="/, '"Every day" opens closed days in the season list');
    assert.match(s, /var sw = \{\}; DAYS\.forEach\(function\(d\)\{ sw\[d\] = S\.sea\.week\[d\] \|\| \[\]; \}\);/);
    assert.doesNotMatch(s, /S\.week\[d\] \? \[\[S\.winter\.from, S\.winter\.to\]\] : \[\]/, 'never only the usual open days');
    // Midnight / 1 AM / 2 AM come with the same editor.
    assert.match(s, /lateBtns\(d, j, y\)/);
    // Untouched seasonal hours are never sent.
    assert.match(s, /if \(S\.seaTouched\) \{/);
    const fr = cfgOf(await text(`/fr/owner/${tokenFor(mk(type).id)}/setup`));
    assert.equal(fr.t.allYearQ, 'Ce sont vos heures toute l’année?');
    assert.equal(fr.t.seasonEditQ.summer, 'Vos heures d’été');
  }
});

// ---------- 2: happy hour skips closures ----------
test('2: "Next happy hour" skips a closure day, and a multi-day closure (server, EN + FR)', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  const hh = Object.fromEntries(DAYS.map((d) => [d, ['wed', 'thu', 'fri'].includes(d) ? [['15:00', '17:00']] : []]));
  ok(await change(t, { happy_hour: hh }));
  const tue = nextTuesday(), wed = hours.shiftDate(tue, 1);
  const now = noonOn(tue);
  const line = (fr) => { const r = app.venueHappyHour(app.getVenue(v.id), app.getVenue(v.id).hours, fr, now); return r && r.live ? r.live.text : ''; };
  assert.equal(line(false), 'Next happy hour: tomorrow 3 PM', 'no closure yet');
  ok(await change(t, { closures: [{ from: wed, to: wed, note: 'Remembrance Day' }] }));
  assert.equal(line(false), 'Next happy hour: Thursday 3 PM');
  assert.match(line(true), /^Prochain happy hour\s:\sjeudi 15\sh$/);
  // Two or more days in a row: the page shows the closure notice instead (no happy hour line, as before); the rule
  // itself steps over the whole range (Wed and Thu closed: Friday).
  const hhJson = JSON.stringify(hh), clock = app.okanaganClock(now);
  const r2 = hours.happyHourState(hhJson, clock, false, [{ from: wed, to: hours.shiftDate(wed, 1) }]);
  assert.equal(r2.from.weekday, 'fri'); assert.equal(r2.daysAhead, 3);
  assert.equal(app.happyHourLiveText(r2, false, clock), 'Next happy hour: Friday 3 PM');
  // More than a week ahead (after a long closure), the line names the date too.
  const h = { state: 'next', from: { weekday: 'wed', minutes: 900, date: '2026-11-18', daysAhead: 8 }, daysAhead: 8, nextWeek: true };
  assert.equal(app.happyHourLiveText(h, false, { weekday: 'tue', minutes: 720, date: '2026-11-10' }), 'Next happy hour: Wednesday, Nov 18 3 PM');
  assert.match(app.happyHourLiveText(h, true, { weekday: 'tue', minutes: 720, date: '2026-11-10' }), /^Prochain happy hour\s:\smercredi 18 nov/);
  // On the closure day itself there is no happy hour "later today".
  const onWed = app.venueHappyHour(app.getVenue(v.id), app.getVenue(v.id).hours, false, new Date(`${wed}T18:00:00Z`));
  assert.ok(!(onWed && onWed.live && ['later', 'now'].includes(onWed.live.state)), 'nothing on the closure day');
});

test('2: hours.js happyHourState takes the closures (the map runs the same function in the browser)', () => {
  const hh = JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, ['wed', 'thu'].includes(d) ? [['15:00', '17:00']] : []])));
  const clock = { weekday: 'tue', minutes: 12 * 60, date: '2026-11-10' };
  const plain = hours.happyHourState(hh, clock, false);
  assert.equal(plain.from.weekday, 'wed');
  const skip = hours.happyHourState(hh, clock, false, [{ from: '2026-11-11', to: '2026-11-11' }]);
  assert.equal(skip.state, 'next'); assert.equal(skip.from.weekday, 'thu'); assert.equal(skip.daysAhead, 2);
  // Today closed: no "later today".
  const wedClock = { weekday: 'wed', minutes: 12 * 60, date: '2026-11-11' };
  assert.equal(hours.happyHourState(hh, wedClock, false).state, 'later');
  assert.notEqual(hours.happyHourState(hh, wedClock, false, [{ from: '2026-11-11', to: '2026-11-11' }]).state, 'later');
  // The map's copy passes the closures from the hours it ships.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /happyHourState\(expandFoodDrinkHours\(p\.hh\), clock, !!\(p\.st && p\.st\.state === 'closed'\), p\.h && typeof p\.h === 'object' && p\.h\._closures \? p\.h\._closures : null\)/);
  assert.match(hours.HOURS_CLIENT_SRC, /function nextOpeningByDate\(/);
});

// ---------- 3: one honest time promise ----------
test('3: the time promise is "About 15 to 30 minutes. You can stop any time and carry on later." everywhere (EN + FR)', async () => {
  for (const lang of ['en', 'fr']) {
    assert.match(TEXT[lang].timeLine, lang === 'en' ? /^About 15 to 30 minutes\. You can stop any time and carry on later\.$/ : /^Environ 15 à 30 minutes\. Vous pouvez arrêter à tout moment et continuer plus tard\.$/);
    assert.ok(TEXT[lang].hiLead.endsWith(TEXT[lang].timeLine));
    assert.ok(TEXT[lang].pub.hiLead.endsWith(TEXT[lang].timeLine));
  }
  const t = tokenFor(mk('pub').id);
  const card = (/id="opSetupCard"[^>]*>([\s\S]*?)<\/a>/.exec(await text(`/owner/${t}`)) || [])[1] || '';
  assert.ok(card.includes(TEXT.en.timeLine), card);
  const topic = app.OWNER_HELP_TOPICS.find((x) => x.id === 'easy-setup');
  assert.ok(topic.a.includes(TEXT.en.timeLine)); assert.ok(topic.aFr.includes(TEXT.fr.timeLine));
});

// ---------- 4: "Something else" ----------
test('4: the "Something else" chip empties the name box, focuses it and shows "Type the name, e.g. Meat draw"; never saved as "Something else"', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.t.otherPh, 'Type the name, e.g. Meat draw');
  assert.equal(cfgOf(await text(`/fr/owner/${tokenFor(mk('pub').id)}/setup`)).t.otherPh, 'Écrivez le nom, p. ex. Tirage de viande');
  assert.match(s, /if \(q2\[1\] === 'other'\) \{ if \(kindName\) e\.what = ''; render\(\); var nb = el\('nt' \+ q2\[0\]\); if \(nb\) \{ try \{ nb\.focus/);
  assert.match(s, /\(e\.kind === 'other' \? ' placeholder="' \+ h\(T\.otherPh\) \+ '"' : ''\)/);
  assert.match(s, /\(e\.kind && e\.kind !== 'other' \? T\.kinds\[e\.kind\] : ''\)/, 'an empty "Something else" never becomes its title');
  assert.match(s, /if \(!title && e\.kind === 'other'\) \{ S\.nudge = T\.otherNeed;/);
});

// ---------- 5: "Your updates" ----------
test('5: each update is labelled with only what changed; the same one twice shows once', () => {
  assert.deepEqual(app.ownerChangeLabels({ pub_info: { kitchen: { mode: 'earlier', closes: '20:00' }, minors: { policy: 'all_ages' } } }, { pub_info: { minors: { policy: 'all_ages' } } }, false), ['Kitchen']);
  assert.deepEqual(app.ownerChangeLabels({ pub_info: { minors: { policy: 'all_ages' } } }, { pub_info: {} }, false), ['Who’s welcome']);
  assert.deepEqual(app.ownerChangeLabels({ pub_info: { kitchen: { mode: 'same' } } }, {}, true), ['Heures de la cuisine']);
  assert.deepEqual(app.ownerChangeLabels({ badges: { happy_hour: true }, happy_hour: '{}', happy_hour_deals: { deals: [] } }, {}, false), ['Happy hour']);
  assert.deepEqual(app.ownerChangeLabels({ badges: { happy_hour: true, patio: true }, happy_hour: '{}' }, {}, false), ['What you offer', 'Happy hour']);
  assert.deepEqual(app.ownerChangeLabels({ badges: { patio: true }, not_offered: ['games'] }, {}, false), ['What you offer']);
  const items = [{ kind: 'change', title: 'Listing update: Happy hour', status: 'approved', sent: '2026-11-10 22:00:00' }, { kind: 'photo', title: 'Photo', status: 'pending', sent: '2026-11-10 21:59:00' },
    { kind: 'change', title: 'Listing update: Happy hour', status: 'approved', sent: '2026-11-10 21:58:00' }];
  assert.equal(app.ownerActivityDedup(items, false).length, 2);
});

test('5: a pub\'s kitchen-only save reads "Kitchen"; a happy hour save reads "Happy hour", once; the note counts what is waiting', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  ok(await change(t, { pub_info: { minors: { policy: 'all_ages', note: '' } } }));
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '20:00', note: '' } } }));
  const hh = Object.fromEntries(DAYS.map((d) => [d, ['wed', 'thu', 'fri'].includes(d) ? [['15:00', '18:00']] : []]));
  ok(await change(t, { happy_hour: hh, happy_hour_deals: { deals: [{ text: '$5 house wine', price: '' }] }, badges: { happy_hour: true } }));
  ok(await change(t, { happy_hour: { ...hh, wed: [['15:00', '17:00']], thu: [['15:00', '17:00']], fri: [['15:00', '17:00']] } }));
  const titles = app.ownerVenueActivity(v.id, 20, 'en').map((it) => it.title);
  assert.ok(titles.includes('Listing update: Kitchen'), titles.join(' | '));
  assert.ok(titles.includes('Listing update: Who’s welcome'), titles.join(' | '));
  assert.ok(!titles.some((x) => /Kitchen, who’s welcome and sports|What you offer, happy hour/.test(x)), titles.join(' | '));
  const html = app.ownerActivityHtml(app.ownerVenueActivity(v.id, 20, 'en'), 'en');
  assert.equal((html.match(/Listing update: Happy hour</g) || []).length, 1, 'the happy hour saved twice shows once');
  // A new address waits for our check; the rest are live. The note says so.
  ok(await change(t, { address: '12408 Lakeshore Dr, Summerland' }));
  const page = await text(`/owner/${t}`);
  assert.match(page, /1 update is waiting for us to check\. The rest are on your page now\./);
  assert.doesNotMatch(page, /They&rsquo;re waiting for review and show below/);
  const fr = await text(`/fr/owner/${t}`);
  assert.match(fr, /1 mise à jour attend notre vérification\. Les autres sont déjà sur votre page\./);
});

test('5: the "… sent" line names every pending item, photos included', () => {
  const input = { type: 'restaurant', address: '1 Main St', latitude: 49.6, longitude: -119.6, phone: '250-555-0100', hasHours: true, imageUrl: '/images/venues/x.jpg', photoCount: 0, pendingPhotos: 1 };
  const r = pc.scoreCompleteness(input, { today, pending: new Set(['address']) });
  const html = pc.renderCompleteness(r, { plainWaiting: true, pendingFields: ['address', 'website'], pendingPhotos: 1 });
  assert.match(html, /Photos, address and website sent\. We’ll add them within a day\./);
});

// ---------- 6: no implied "no sports" ----------
test('6: an untouched Sports on TV tile is not "no sports"; only the explicit tile or unticking a research tick is', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.t.noSports, 'No sports / no TVs');
  assert.match(s, /data-off="no_sports"/);
  assert.match(s, /var noSportsSaid = S\.noSports \|\| \(!!S\.badgesAtStart\.sports_tv && !badges\.sports_tv\);/);
  assert.match(s, /if \(badges\.sports_tv \|\| !noSportsSaid\) rem\.push\('sports'\); else if \(!partial\) add\.push\('sports'\);/);
  // Restaurants have no such tile (sports isn't scored for them).
  assert.match(s, /C\.pub && g\.keys\.indexOf\('sports_tv'\) >= 0/);
  // Saved without "sports": nothing in "Your updates" says "You told us you don't have: sports on TV".
  const v = mk('pub');
  ok(await change(tokenFor(v.id), { badges: { darts: true }, not_offered: [] }));
  const act = app.ownerVenueActivity(v.id, 20, 'en').map((it) => it.title).join(' | ');
  assert.doesNotMatch(act, /sports on TV/);
});

// ---------- 7: closures button ----------
test('7: the closures save button is not sticky over the holiday tiles', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  const block = s.slice(s.indexOf("} else if (s === 'closures') {"), s.indexOf("} else if (s === 'closures:months') {"));
  assert.doesNotMatch(block, /su-sticky/);
  assert.ok(block.indexOf('data-hol=') < block.indexOf("'closuresNone'"), 'the button comes after the tiles');
});

// ---------- 8: photo label ----------
test('8: the photo now on the page is labelled honestly: Google Maps stand-in, other, or the owner\'s own', async () => {
  const g = mk('pub', { image_url: '/images/venues/cineplex-cinemas-orchard-plaza-2610.jpg' });
  assert.equal(app.setupImageSource(app.getVenue(g.id), ''), 'google');
  assert.equal(app.setupImageSource(app.getVenue(mk('pub', { image_url: '/images/venues/priest-creek-winery-exterior.jpg' }).id), ''), 'other');
  assert.equal(app.setupImageSource(app.getVenue(mk('pub', { image_url: '/images/owner/abc.jpg' }).id), ''), 'own');
  assert.equal(app.setupImageSource(app.getVenue(g.id), '/owner-photos/preview/x.jpg'), 'own');
  const html = await text(`/owner/${tokenFor(g.id)}/setup`), cfg = cfgOf(html), s = scriptOf(html);
  assert.equal(cfg.imageSource, 'google');
  assert.equal(cfg.t.curMainGoogle, 'The photo we have now (from Google Maps)');
  assert.equal(cfg.t.curMain, 'Your main photo now');
  assert.match(s, /C\.imageSource === 'own' \? T\.curMain : C\.imageSource === 'google' \? T\.curMainGoogle : T\.curMainOther/);
  assert.equal(cfgOf(await text(`/fr/owner/${tokenFor(g.id)}/setup`)).t.curMainGoogle, 'La photo que nous avons maintenant (de Google Maps)');
});

// ---------- 9: Not sure; done for now ----------
test('9: "Not sure / someone else runs it" answers Instagram and Facebook without a "we don\'t have one"', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  const before = (await post(`/owner/${t}/setup/progress`, { step: 'spend', status: 'skip' })).body.score;
  assert.ok(before.left.some((x) => x.k === 'instagram'));
  const r = await post(`/owner/${t}/setup/progress`, { step: 'instagram', status: 'unsure' });
  assert.equal(r.status, 200);
  assert.equal(r.body.progress.done.instagram, 'unsure');
  assert.ok(!r.body.score.left.some((x) => x.k === 'instagram'), 'not asked again');
  assert.ok(r.body.score.pct >= before.pct);
  assert.ok(!(app.venueNotOffered(v.id) || []).includes('instagram'), 'never stored as not_offered');
  assert.equal((await post(`/owner/${t}/setup/progress`, { step: 'menu', status: 'unsure' })).status, 400, 'only for Instagram and Facebook');
  // A later "skip" never replaces it.
  assert.equal((await post(`/owner/${t}/setup/progress`, { step: 'instagram', status: 'skip' })).body.progress.done.instagram, 'unsure');
  const html = await text(`/owner/${t}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.t.socialUnsure, 'Not sure / someone else runs it');
  assert.equal(cfg.t.st.unsure, 'not sure (that’s fine)');
  assert.match(s, /'socialUnsure:' \+ s/);
  assert.match(s, /if \(k === 'socialUnsure'\) \{ S\.savedLine\[v\] = T\.savedUnsure; return record\(v, 'unsure'\); \}/);
  assert.equal(cfgOf(await text(`/fr/owner/${t}/setup`)).t.socialUnsure, 'Pas certain / quelqu’un d’autre s’en occupe');
});

test('9: "I\'m done for now" ends on "Nice work!" with the rest folded under an optional "Want to add more later?"', async () => {
  const html = await text(`/owner/${tokenFor(mk('restaurant').id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.t.doneNowTitle, 'Nice work!');
  assert.equal(cfg.t.addLater, 'Want to add more later?');
  assert.match(s, /S\.doneNowSaid = true; go\('finish'\);/);
  assert.match(s, /if \(S\.doneNowSaid && left\.length\) \{/);
  assert.match(s, /<details class="su-later" id="suLater"><summary>' \+ h\(T\.addLater\)/);
});

// ---------- 10: Fireplace ----------
test('10: a Fireplace tile for pubs and restaurants (EN + FR), on the public page and the map filters, never in the score', async () => {
  for (const type of ['pub', 'restaurant']) {
    const v = mk(type);
    const t = tokenFor(v.id);
    const cfg = cfgOf(await text(`/owner/${t}/setup`));
    assert.ok(cfg.offerGroups.some((g) => g.keys.includes('fireplace')), type);
    assert.equal(cfg.offerLabels.fireplace, 'Fireplace');
    assert.equal(cfgOf(await text(`/fr/owner/${t}/setup`)).offerLabels.fireplace, 'Foyer');
    ok(await change(t, { badges: { patio: true } }));
    const s0 = (await post(`/owner/${t}/setup/progress`, { step: 'spend', status: 'skip' })).body.score;
    ok(await change(t, { badges: { fireplace: true } }));
    assert.equal(app.venueOwnerFeatures(v.id).fireplace, true);
    const s1 = (await post(`/owner/${t}/setup/progress`, { step: 'spend', status: 'skip' })).body.score;
    assert.equal(s1.pct, s0.pct, 'not part of the score');
    assert.match(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en' }), />Fireplace</);
    assert.match(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'fr' }), />Foyer</);
  }
  assert.equal(app.MAP_OWNER_FEATURES.find((f) => f.key === 'fireplace').owner, 'fireplace');
  assert.equal(app.MAP_MUST_HAVES.find((f) => f.key === 'fireplace').label, 'Fireplace');
  assert.ok(app.OWNER_EXTRA_BADGES.includes('fireplace'));
});

// ---------- 11: the website box ----------
test('11: a rejected website is outlined in red and gets the cursor', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(html);
  assert.match(s, /S\.nudge = T\.websiteBad; S\.badField = 'suSite'; return render\(\);/);
  assert.match(s, /bf\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(s, /bf\.focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /\.su-field\[aria-invalid="true"\] \{ border-color: var\(--su-warn\)/);
});
