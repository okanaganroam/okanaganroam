// First first-time BREWERY owner test on Whistler (Dan, Android, English; Whistler Roam
// drafts/fresh-eyes-brewery1-2026-11-15/REPORT.md). The code is shared, so the fixes are made here:
//  A. a second "other hours" period (a spring and a fall shoulder season): stored as a second set in the same list
//     (venue_hours_extra.seasons, no schema change), refused when the two share a day, read by the status line, the page's
//     "Hours through the year", the happy hour "(when open)" note and Build My Trip; one-period venues exactly as before;
//  B. the event box (a counter, "name, then the rest" kept as the detail), the tap list tile for a brewery with no
//     kitchen, a "Tour" kind for breweries that Build My Trip plans around, brewery help answers, a taproom happy hour
//     example, "+ Add a second time (if you close in between)", the dates lead, the food-truck sub-line, the kids cut-off
//     in Build My Trip, the phone's Back button, and the small ones;
//  C. leftovers from the café round (dogs outside only on a trip card, the French dietary line, the story tile).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'brewery-wr1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const WK = (o, c, closed = []) => Object.fromEntries(DAYS.map((d) => [d, closed.includes(d) ? [] : [[o, c]]]));
const WEEK = (o, c) => JSON.stringify(WK(o, c));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Lake Test ${++n}`, slug: `lake-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK('12:00', '21:00'),
  description: 'A fixture used only by the first Whistler brewery fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.14.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const setupCfg = async (t, fr = false) => cfgOf((await get(`${fr ? '/fr' : ''}/owner/${t}/setup`)).text);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const recs = (p) => (p.recommendations || []).map((x) => ({ name: x.venue && x.venue.name, caveats: x.caveats || [], venue: x.venue, reasons: (x.reasons || []).map((r) => r.text || r) }));
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
// One function (or a run of lines) of the setup page's script, run on its own.
const clientPart = (from, to, ctx, tail = '') => { const s = CLIENT(); const a = s.indexOf(from), b = s.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, `client part ${from}`); vm.runInNewContext(s.slice(a, b) + tail, ctx); return ctx; };
// Dan's brewery: 12–9 PM daily, research's Plan your visit lines, badges from research.
const DAN_RESEARCH = [{ label: 'Known for', text: 'Hazy IPAs and a sunny patio' }, { label: 'Prices', text: 'Pints from $8, flights $12' }, { label: 'Kids & dogs', text: 'Family and dog friendly' },
  { label: 'Tours', text: 'Tours by appointment' }, { label: 'Good to know', text: 'Free parking, food truck on weekends' }];
const dan = (o = {}) => {
  const v = mk('brewery', { name: `Cheakamus Test Brewing ${n + 1}`, price: '$$', patio: 1, dog_friendly: 1, kid_friendly: 1, happy_hour: 1, great_groups: 1, ...o });
  research(v.id, DAN_RESEARCH);
  return v;
};
// His two shoulder seasons: closed Monday and Tuesday in both.
const FALL = { from: '10-13', to: '11-26', label: '', hours: WK('12:00', '21:00', ['mon', 'tue']) };
const SPRING = { from: '04-19', to: '05-14', label: '', hours: WK('12:00', '21:00', ['mon', 'tue']) };
// As stored: a closed day is null.
const stored = (x) => ({ ...x, hours: Object.fromEntries(DAYS.map((d) => [d, x.hours[d].length ? x.hours[d] : null])) });
// 3 PM Pacific on a date (PDT from mid-March to early November).
const at = (date, hm = '15:00') => new Date(`${date}T${hm}:00${/-(0[4-9]|10)-|-03-(1[5-9]|[23]\d)|-11-01/.test(date) ? '-07:00' : '-08:00'}`);
const statusOf = (html) => { const m = /class="[^"]*venue-open-status[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/.exec(html); return m ? plain(m[1]).trim() : plain(html).match(/(Open now[^.]{0,60}|Closed[^.]{0,60})/)?.[0] || ''; };

// ====================== A. A second "other hours" period ======================
test('two periods are stored in the same list and read back; a one-period venue saves and loads exactly as before', async () => {
  // One period, with research's name: the round trip is exact.
  const one = dan(); const t1 = tokenFor(one.id);
  const WINTER = { from: '11-01', to: '04-30', label: 'Winter hours', hours: WK('12:00', '20:00', ['mon']) };
  ok(await change(t1, { hours_seasons: [WINTER] }));
  assert.deepEqual((await setupCfg(t1)).cur.hours_seasons, [stored(WINTER)]);
  assert.deepEqual(app.venueHoursExtras(one.id).seasons, [stored(WINTER)]);
  const before = db.prepare('SELECT seasons FROM venue_hours_extra WHERE venue_id = ?').get(one.id).seasons;
  // Sent again unchanged (what the setup does for a period the owner didn't open): nothing changes.
  const again = await change(t1, { hours: WK('12:00', '21:00'), hours_checked: true, hours_seasons: [WINTER] });
  assert.ok(!(again.body.fields || []).includes('hours_seasons'), 'the same one period is not a change');
  // ...and so is the stored form the setup holds (what it sends back for a period she didn't open).
  const again2 = await change(t1, { hours_seasons: (await setupCfg(t1)).cur.hours_seasons });
  assert.ok(!(again2.body.fields || []).includes('hours_seasons'));
  assert.equal(db.prepare('SELECT seasons FROM venue_hours_extra WHERE venue_id = ?').get(one.id).seasons, before, 'byte for byte');
  // Two periods.
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { hours_seasons: [FALL] }));
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  const cfg = await setupCfg(t);
  assert.deepEqual(cfg.cur.hours_seasons, [stored(FALL), stored(SPRING)]);
  assert.deepEqual(app.venueHoursExtras(v.id).seasons, [stored(FALL), stored(SPRING)]);
  // Removing the first keeps the second; a third is still refused (two at most, as before).
  ok(await change(t, { hours_seasons: [SPRING] }));
  assert.deepEqual(app.venueHoursExtras(v.id).seasons, [stored(SPRING)]);
  assert.equal((await change(t, { hours_seasons: [FALL, SPRING, { from: '07-01', to: '07-31', label: '', hours: WK('11:00', '22:00') }] })).status, 400);
  // No new table or column: the list lives where it always did.
  const cols = db.prepare('PRAGMA table_info(venue_hours_extra)').all().map((c) => c.name);
  assert.deepEqual(cols.filter((c) => /season/.test(c)), ['seasons']);
});

test('two periods that share a day are refused in plain words (EN and FR); a year-crossing period too; back-to-back periods are fine', async () => {
  const v = dan(); const t = tokenFor(v.id);
  let r = await change(t, { hours_seasons: [FALL, { ...SPRING, from: '11-20', to: '12-10' }] });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors.hours_seasons, app.OWNER_SEASONS_OVERLAP);
  assert.match(app.OWNER_SEASONS_OVERLAP, /share some dates/);
  r = await change(t, { hours_seasons: [FALL, { ...SPRING, from: '11-20', to: '12-10' }] }, true);
  assert.equal(r.status, 400);
  assert.match(r.body.errors.hours_seasons, /des dates en commun/);
  // One inside the other, and one that runs over New Year.
  assert.equal((await change(t, { hours_seasons: [FALL, { ...SPRING, from: '10-20', to: '10-25' }] })).status, 400);
  assert.equal((await change(t, { hours_seasons: [{ ...FALL, from: '11-20', to: '01-10' }, { ...SPRING, from: '01-05', to: '02-01' }] })).status, 400);
  assert.equal((await change(t, { hours_seasons: [{ ...FALL, from: '11-20', to: '01-10' }, { ...SPRING, from: '12-31', to: '12-31' }] })).status, 400, 'one day is not a period');
  assert.deepEqual(app.venueHoursExtras(v.id).seasons, [], 'nothing was saved');
  // Back to back, and a year-crossing one beside a spring one.
  ok(await change(t, { hours_seasons: [FALL, { ...SPRING, from: '11-27', to: '12-20' }] }));
  ok(await change(t, { hours_seasons: [{ ...FALL, from: '11-20', to: '01-10' }, SPRING] }));
  // The setup refuses it before sending, naming the other period's dates.
  const ctx = clientPart('  function mdOverlap(x, y)', '  function seaIsStep(s)', { mdInRange: (md, from, to) => (from <= to ? md >= from && md <= to : md >= from || md <= to) }, '\nthis.mdOverlap = mdOverlap;');
  assert.equal(ctx.mdOverlap({ from: '10-13', to: '11-26' }, { from: '04-19', to: '05-14' }), false);
  assert.equal(ctx.mdOverlap({ from: '10-13', to: '11-26' }, { from: '11-26', to: '12-05' }), true, 'the same day counts');
  assert.equal(ctx.mdOverlap({ from: '11-20', to: '01-10' }, { from: '01-05', to: '02-01' }), true);
  assert.equal(ctx.mdOverlap({ from: '11-20', to: '01-10' }, { from: '01-11', to: '02-01' }), false);
  assert.equal(ctx.mdOverlap({ from: '03-01', to: '03-31' }, { from: '02-01', to: '04-30' }), true, 'one inside the other');
  const s = CLIENT();
  assert.match(s, /if \(list\.length > 1 && mdOverlap\(list\[0\], list\[1\]\)\) \{ S\.nudge = fill\(T\.seasonOverlap, /);
  assert.equal(text.en.seasonOverlap, 'These dates overlap your {a} – {b} hours. Please pick dates that don’t overlap.');
  assert.match(text.fr.seasonOverlap, /^Ces dates chevauchent vos heures du \{a\} au \{b\}\./);
});

test('the status line and the hours engine use the right week on a date in each period and outside both', async () => {
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  const venue = app.getVenue(v.id);
  const hours = require('../hours.js');
  const parsed = hours.parseHours(app.hoursWithExtras(venue));
  assert.equal(parsed.seasons.length, 2);
  // Monday in the fall period, Monday in the spring period (the one that read "Open now"), Monday in January, a Wednesday in each.
  assert.equal(hours.dayOnDate(parsed, '2026-10-19').status, 'closed');
  assert.equal(hours.dayOnDate(parsed, '2027-04-26').status, 'closed');
  assert.equal(hours.dayOnDate(parsed, '2027-04-27').status, 'closed', 'Tuesday too');
  assert.equal(hours.dayOnDate(parsed, '2027-01-11').status, 'open');
  assert.equal(hours.dayOnDate(parsed, '2027-04-28').status, 'open');
  assert.equal(hours.dayOnDate(parsed, '2026-10-21').status, 'open');
  // The first and last day of each period, and the days just outside.
  for (const [d, st] of [['2027-04-19', 'closed'], ['2027-04-12', 'open'], ['2027-05-10', 'closed'], ['2027-05-17', 'open'], ['2026-10-13', 'closed'], ['2026-10-12', 'open'], ['2026-11-24', 'closed'], ['2026-11-30', 'open']]) {
    assert.equal(hours.dayOnDate(parsed, d).status, st, d);
  }
  // The venue page on those dates.
  const closedSpring = plain(page(v, 'en', at('2027-04-26')));
  assert.doesNotMatch(closedSpring, /Open now/);
  assert.match(closedSpring, /Closed/);
  assert.match(plain(page(v, 'en', at('2026-10-19'))), /Closed/);
  assert.doesNotMatch(plain(page(v, 'en', at('2026-10-19'))), /Open now/);
  assert.match(plain(page(v, 'en', at('2027-01-11'))), /Open now/);
  assert.match(plain(page(v, 'en', at('2027-04-28'))), /Open now/);
  // weekJsonOn (what Build My Trip plans by) gives each period's week.
  assert.equal(JSON.parse(app.weekJsonOn(venue, '2027-04-26')).mon, null);
  assert.equal(JSON.parse(app.weekJsonOn(venue, '2026-11-02')).mon, null);
  assert.deepEqual(JSON.parse(app.weekJsonOn(venue, '2027-01-11')).mon, [['12:00', '21:00']]);
});

test('“Hours through the year” lists both periods and the usual hours; the French page too; one period reads as before', async () => {
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  const en = page(v, 'en', at('2027-01-11'));
  const year = /<div class="venue-hours-year">[\s\S]*?<\/div>/.exec(en)[0];
  const lines = [...year.matchAll(/<li><span>([^<]*)<\/span><span>([^<]*)<\/span><\/li>/g)].map((m) => `${m[1]} | ${m[2]}`);
  // Same closed days in both, so the page says them once, with both date ranges; the usual hours take the rest of the year.
  assert.ok(lines.some((l) => /Oct 13 – Nov 26/.test(l) && /Mon, Tue Closed/.test(l)), lines.join(' // '));
  assert.ok(lines.some((l) => /Apr 19 – May 14/.test(l) && /Mon, Tue Closed/.test(l)), lines.join(' // '));
  assert.ok(lines.some((l) => /Daily 12 PM – 9 PM/.test(l) && /Nov 27 – Apr 18/.test(l) && /May 15 – Oct 12/.test(l)), lines.join(' // '));
  const fr = page(v, 'fr', at('2027-01-11'));
  assert.match(fr, /Heures selon la saison/);
  assert.match(plain(fr), /19 avr\. – 14 mai|du 19 avr\. au 14 mai/);
  // On a date inside the second period the page says those hours apply now.
  assert.match(plain(page(v, 'en', at('2027-04-28'))), /Hours \(Apr 19 – May 14\) apply now/);
  assert.match(plain(page(v, 'en', at('2026-10-21'))), /Hours \(Oct 13 – Nov 26\) apply now/);
  // One period: as before.
  const one = dan(); ok(await change(tokenFor(one.id), { hours_seasons: [FALL] }));
  const y1 = /<div class="venue-hours-year">[\s\S]*?<\/div>/.exec(page(one, 'en', at('2027-01-11')))[0];
  assert.equal([...y1.matchAll(/<li>/g)].length, 2);
  assert.match(y1, /Nov 27 – Oct 12/);
});

test('a happy hour on a day closed only in a short second period says “(when open)”, and is not “on now” that day', async () => {
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { happy_hour: Object.fromEntries(DAYS.map((d) => [d, ['mon', 'tue', 'wed', 'thu', 'fri'].includes(d) ? [['15:00', '17:00']] : []])), badges: { happy_hour: true } }));
  // Apr 19 – May 14 holds no 15th of a month: it was never looked at.
  ok(await change(t, { hours_seasons: [SPRING] }));
  const row = db.prepare('SELECT hours, happy_hour_times FROM venues WHERE id = ?').get(v.id);
  assert.equal(app.happyHourOnClosedDay(v.id, row.hours, row.happy_hour_times), true);
  assert.match(plain(page(v, 'en', at('2027-01-11'))), /\(when open\)/);
  // Monday 3 PM in the spring period: closed, and no happy hour claimed (it read "Open now · Closes 9 PM · Happy hour on now").
  const mon = plain(page(v, 'en', at('2027-04-26')));
  assert.doesNotMatch(mon, /Happy hour on now/);
  assert.doesNotMatch(mon, /Open now/);
  // Wednesday 3 PM in the same period: on.
  assert.match(plain(page(v, 'en', at('2027-04-28'))), /Happy hour on now/);
});

test('Build My Trip plans by the period’s week: a shoulder Monday in either period is closed, a January Monday is open', async () => {
  const v = dan({ name: 'Shoulder Planner Brewing' }); const t = tokenFor(v.id);
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  const factsOn = (date) => app.buildTripPlannerFacts(false, date).find((x) => x.id === v.id);
  const openMon = (date) => { const m = JSON.parse(factsOn(date).hours).mon; return !!(m && m.length); };
  assert.equal(openMon('2027-04-26'), false, 'spring shoulder Monday');
  assert.equal(openMon('2026-10-19'), false, 'fall shoulder Monday');
  assert.equal(openMon('2027-01-11'), true, 'January Monday');
  // The season the planner names for "closed Mondays" is the one that applies on the date.
  assert.deepEqual({ from: factsOn('2027-04-26').hoursSeason.from, to: factsOn('2027-04-26').hoursSeason.to }, { from: '04-19', to: '05-14' });
  assert.deepEqual({ from: factsOn('2026-10-19').hoursSeason.from, to: factsOn('2026-10-19').hoursSeason.to }, { from: '10-13', to: '11-26' });
  assert.equal(factsOn('2027-01-11').hoursSeason, undefined);
});

test('the setup’s year question, the second period’s screen and its words (EN and FR)', async () => {
  const s = CLIENT();
  // The stored periods are read into S.seaList; the season screen works on the one its step names.
  assert.match(s, /if \(st\[0\] && st\[1\]\) S\.seaList\.push\(seaLoad\(seaBlank\(\), st\[1\]\)\);/);
  assert.match(s, /function seaIsStep\(s\)\{ return s === 'hours:season' \|\| s === 'hours:season2'; \}/);
  assert.match(s, /seaUse\(s === 'hours:season2' && S\.seaList\[1\] \? 1 : 0\);/);
  // The year question: "Change my … hours" for each stored period, "+ Add a second stretch" with only one.
  assert.match(s, /stS\.map\(function\(st\)\{ return big\('✎', fill\(T\.seaChange, st\), T\.seaChangeSub, true, 'yearSeasonEdit:' \+ st\.i\); \}\)\.join\(''\)/);
  assert.match(s, /\(stS\.length < 2 && S\.seaList\.length < 2 && T\.seaAdd \? big\('🍂', T\.seaAdd, T\.seaAddSub, true, 'yearSeasonAdd'\) : ''\)/);
  // "Copy the hours from …", and removing one of two is asked first.
  assert.match(s, /id="suSeaCopy" data-act="seaCopy">' \+ h\(fill\(T\.seaCopy, seaOtherAB\)\)/);
  assert.match(s, /if \(k === 'seaCopy'\) \{ readTimes\(\); var co = S\.seaList\[1 - S\.seaI\]; if \(co && co\.week\) \{ S\.sea\.week = clone\(co\.week\);/);
  assert.match(s, /if \(k === 'seaRemove'\) \{ readTimes\(\); S\.dropI = S\.seaI; return go\('hours:yeardrop'\); \}/);
  // A stored period she didn't open on this visit is sent back exactly as stored.
  assert.match(s, /if \(s0 && !so\.dirty\) \{ list\.push\(s0\); continue; \}/);
  // "Yes, all year" with periods stored names every one that would go.
  assert.match(s, /if \(k === 'yearAll' && storedSeas\(\)\.length\) \{ S\.dropI = null; return go\('hours:yeardrop'\); \}/);
  for (const L of ['en', 'fr']) for (const k of ['seasonEditQSecond', 'seasonEditLeadDates', 'seaAdd', 'seaAddSub', 'seaAddLink', 'seaCopy', 'seaRemove', 'seaDropQ', 'seaDropLead', 'seaDropYes', 'seasonOverlap', 'seaStale', 'seaStaleYes', 'seaStaleDone']) {
    assert.ok(text[L][k] && typeof text[L][k] === 'string', `${L}.${k}`);
  }
  assert.equal(text.en.seaAdd, '+ Add a second stretch with different hours');
  assert.equal(text.en.seaCopy, 'Copy the hours from {a} – {b}');
  assert.equal(text.fr.seaCopy, 'Copier les heures du {a} au {b}');
  assert.equal(text.en.seasonEditLeadDates, 'Pick the first and last day, then tap Change beside any day that’s different. Any day can be open, even one that’s closed the rest of the year.');
  assert.match(s, /q\(seaTitle\(\), S\.sea\.exact && T\.seasonEditLeadDates \? T\.seasonEditLeadDates : T\.seasonEditLead\)/);
  // French typography: a narrow no-break space before « ? ».
  assert.equal(text.fr.seaDropQ, 'Retirer vos heures {span} ?');
  // Every type with the year question gets the same words (no type replaces them).
  for (const typeKey of ['pub', 'cafe', 'winery', 'brewery']) for (const k of ['seaAdd', 'seaCopy', 'seasonOverlap']) assert.equal(Object.prototype.hasOwnProperty.call(text.en[typeKey], k), false, `${typeKey}.${k}`);
  for (const type of ['restaurant', 'pub', 'cocktail', 'cafe', 'brewery', 'distillery', 'winery']) {
    const v = mk(type); const cfg = await setupCfg(tokenFor(v.id));
    assert.equal(cfg.t.seaAdd, text.en.seaAdd, type);
    assert.equal(cfg.t.allYearQ, text.en.allYearQ, type);
  }
});

test('bug 9: a usual day changed while a stored period still has its old time gets one line and a one-tap fix', () => {
  const parseWeek = (w) => { const o = typeof w === 'string' ? JSON.parse(w) : w; const out = {}; DAYS.forEach((d) => { out[d] = o && o[d] && o[d].length ? o[d].map((x) => [x[0], x[1]]) : null; }); return out; };
  const t12 = (v) => { const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
  const S = { week: parseWeek(WK('12:00', '21:00')) };
  const CUR = { hours: JSON.stringify(WK('12:00', '22:00')) };
  // He changes Sunday 12–10 PM to 12–9 PM... here every day closes at 9 now, but only Sunday is stale in the stored period.
  const fall = { from: '10-13', to: '11-26', label: '', hours: { ...WK('12:00', '21:00', ['mon', 'tue']), sun: [['12:00', '22:00']] } };
  const ctx = clientPart('  function seaStaleOf(seasons){', '  function seaStaleHtml(){', { S, CUR, DAYS, parseWeek, t12, dayName: (d) => d.charAt(0).toUpperCase() + d.slice(1) }, '\nthis.seaStaleOf = seaStaleOf;');
  let out = ctx.seaStaleOf([fall, SPRING]);
  assert.equal(out.length, 1);
  assert.deepEqual({ i: out[0].i, days: [...out[0].days], text: out[0].text, from: out[0].from }, { i: 0, days: ['sun'], text: 'Sun 12 PM – 10 PM', from: '10-13' });
  assert.equal(fill(text.en.seaStale, { a: 'Oct 13', b: 'Nov 26', what: out[0].text }), 'Your Oct 13 – Nov 26 hours still say Sun 12 PM – 10 PM. Change them too?');
  assert.equal(fill(text.fr.seaStale, { a: '13 oct', b: '26 nov', what: 'Dim 12 h – 22 h' }), 'Vos heures du 13 oct au 26 nov indiquent encore Dim 12 h – 22 h. Les changer aussi ?');
  // Nothing changed in the usual week, or the period already differs from the old time: no line.
  CUR.hours = JSON.stringify(WK('12:00', '21:00'));
  assert.equal(ctx.seaStaleOf([fall]).length, 0);
  CUR.hours = JSON.stringify(WK('12:00', '22:00'));
  assert.equal(ctx.seaStaleOf([SPRING]).length, 0, 'its days were never the old time');
  const s = CLIENT();
  assert.match(s, /data-act="seaStaleFix:' \+ x\.i \+ '">' \+ h\(T\.seaStaleYes\)/);
  assert.match(s, /change\(\{ hours_seasons: list \}\)\.then\(/, 'one tap saves the period with the new time');
});

test('help: the seasonal answers say “No, different for part of the year” by dates and that a second stretch can be added (EN and FR); never “message us”', async () => {
  const v = dan(); const t = tokenFor(v.id);
  let hb = helpBot((await get(`/owner/${t}/setup`)).text);
  for (const q of ['two shoulder seasons with different hours', 'closed mondays in shoulder season', 'different hours in spring and fall']) {
    const b = hb.best(q); assert.equal(b.id, 'brewery-seasonal-hours', q);
  }
  const sea = hb.topic('brewery-seasonal-hours');
  assert.match(sea.a, /^<p>Right here in setup: <strong>Hours and holidays<\/strong>/);
  assert.match(sea.a, /No, different for part of the year/); assert.match(sea.a, /pick the first and last day/);
  assert.match(sea.a, /\+ Add a second stretch with different hours/);
  assert.match(sea.aFr, /Non, c’est différent une partie de l’année/); assert.match(sea.aFr, /\+ Ajouter une deuxième période aux heures différentes/);
  for (const id of ['brewery-seasonal-hours', 'seasonal-hours', 'setup-season']) { const x = hb.topic(id); assert.doesNotMatch(`${x.a} ${x.aFr}`, /message us|écrivez-nous les dates/i, id); assert.match(x.a, /second stretch with different hours/, id); assert.match(x.aFr, /deuxième période aux heures différentes/, id); }
  // With one period stored the general answer names it and says a second can be added; with two it names both.
  ok(await change(t, { hours_seasons: [FALL] }));
  let one = app.ownerSeasonHelpTopic(v.id);
  assert.match(one.a, /Oct 13/); assert.match(one.a, /\+ Add a second stretch with different hours/);
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  const two = app.ownerSeasonHelpTopic(v.id);
  assert.match(two.a, /two stretches of <strong>other hours<\/strong>/); assert.match(two.a, /Oct 13/); assert.match(two.a, /Apr 19/); assert.match(two.a, /Remove these hours/);
  assert.match(two.aFr, /deux périodes d’<strong>autres heures<\/strong>/);
  // Restaurants, pubs and cafés get the same seasonal words.
  for (const type of ['restaurant', 'pub', 'cafe']) {
    const x = mk(type); hb = helpBot((await get(`/owner/${tokenFor(x.id)}/setup`)).text);
    assert.match(hb.topic('seasonal-hours').a, /\+ Add a second stretch with different hours/, type);
    assert.match(hb.topic('setup-season').a, /\+ Add a second stretch with different hours/, type);
  }
});

test('the edit page keeps a second period as it is and says where to change it', async () => {
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /id="opSeasonalSecond">You also have other hours Apr 19 – May 14\./);
  assert.match(edit, /var rest = \(initial\.hours_seasons \|\| \[\]\)\.slice\(1\);/, 'the edit page still sends the second period back untouched');
  const fr = (await get(`/fr/owner/${t}`)).text;
  assert.match(fr, /id="opSeasonalSecond">Vous avez aussi d’autres heures du 19 avr\. au 14 mai\./);
  const one = dan(); ok(await change(tokenFor(one.id), { hours_seasons: [FALL] }));
  assert.doesNotMatch((await get(`/owner/${tokenFor(one.id)}`)).text, /opSeasonalSecond/);
});

// ====================== B. Brewery items ======================
test('the event box: a counter, and “name, then the rest” kept as the detail (never cut at 40 letters)', async () => {
  const T = { eventLeft: text.en.eventLeft, eventLeft1: text.en.eventLeft1, eventSplit: text.en.eventSplit, eventLong: text.en.eventLong, eventDetailLong: text.en.eventDetailLong };
  const ctx = clientPart('  var NT_MAX = 40', '  function apptKind(k)', { T, fill }, '\nthis.ntSplit = ntSplit; this.ntHint = ntHint;');
  const sp = (x) => { const r = ctx.ntSplit(x); return { title: r.title, detail: r.detail, long: !!r.long }; };
  assert.deepEqual(sp('Brewery tour, $15 with a flight. Book by email'), { title: 'Brewery tour', detail: '$15 with a flight. Book by email', long: false });
  assert.deepEqual(sp('Trivia night, free to play'), { title: 'Trivia night, free to play', detail: '', long: false }, 'a short name with a comma stays the name, as before');
  assert.deepEqual(sp('Open mic night. sign up at the bar from 6:30 PM, all welcome'), { title: 'Open mic night', detail: 'Sign up at the bar from 6:30 PM, all welcome', long: false });
  assert.deepEqual(sp('Run club – 5 km along the Valley Trail, then pints'), { title: 'Run club', detail: '5 km along the Valley Trail, then pints', long: false });
  assert.equal(sp('A very long event name that just keeps going and going on').long, true);
  assert.equal(ctx.ntHint('Trivia'), '');
  assert.equal(ctx.ntHint('Brewery tour with a flight at the bar'), '3 characters left');
  assert.equal(ctx.ntHint('x'.repeat(39)), '1 character left');
  assert.equal(ctx.ntHint('Brewery tour, $15 with a flight. Book by email'), 'Name: “Brewery tour”. The rest shows under it: “$15 with a flight. Book by email”.');
  assert.equal(ctx.ntHint('A very long event name that just keeps going and going on'), text.en.eventLong);
  assert.equal(ctx.ntHint(`Tour, ${'x'.repeat(90)}`), text.en.eventDetailLong);
  const s = CLIENT();
  assert.doesNotMatch(s, /data-nt="' \+ i \+ '" type="text" maxlength="40"/, 'the box no longer stops at 40 letters');
  assert.match(s, /<p class="su-hint su-count" id="nth' \+ i \+ '" aria-live="polite"/);
  assert.match(s, /detail: \(!FRS && sp\.detail\) \|\| n0\.detail \|\| null/);
  assert.match(text.fr.eventSplit, /^Nom : « \{title\} »\. Le reste s’affiche dessous : « \{detail\} »\.$/);
  // What the setup then sends, and the page: the name with the time, the rest under it.
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { weekly_nights: [{ days: ['sat'], kind: 'tour', title: 'Brewery tour', start: '13:00', detail: '$15 with a flight. Book by email', frequency: 'weekly' }] }));
  const html = page(v, 'en', at('2026-11-18'));
  const p = plain(html);
  assert.match(html, /<span class="venue-wn-title">Brewery tour<\/span>/);
  assert.match(p, /\$15 with a flight\. Book by email/);
  assert.doesNotMatch(p, /Book by 1 PM/);
});

test('a brewery with no kitchen keeps “Your menu or tap list” as an optional tile; the finish screen names “Add your tap list”; the page says “Tap list”', async () => {
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { place_type: 'Brewery', brewery_info: { food: 'trucks', trucks: 'weekends', outside: 'yes' } }));
  let cfg = await setupCfg(t);
  assert.ok(cfg.allSteps.includes('menu'));
  assert.equal(cfg.menuKnown, false);
  assert.equal(cfg.t.labels.menu, 'Your menu or tap list');
  assert.equal(cfg.t.finishTap, 'Add your tap list');
  assert.equal(text.fr.brewery.finishTap, 'Ajouter votre liste des bières');
  assert.equal(text.en.brewery.kindCidery.finishTap, 'Add your cider list');
  const s = CLIENT();
  assert.match(s, /function tapOnly\(\)\{ return !!C\.brewery && BI\.food !== 'kitchen'; \}/);
  assert.match(s, /function allDone\(\)\{ return STEPS\.every\(function\(k\)\{ return fin\(k\) \|\| \(k === 'menu' && tapOnly\(\)\); \}\); \}/, 'never needed to be “all done”');
  assert.match(s, /if \(k === 'menu' && tapOnly\(\)\) \{ if \(C\.menuKnown\) return; seen\[k\] = true; out\.push\(\{ step: k, label: T\.finishTap \|\| T\.labels\[k\] \}\); return; \}/);
  assert.match(s, /\n  syncMenu\(\);\n/, 'the tile is there from the first screen');
  // The server still counts the setup as finished without it (no change for breweries already set up).
  assert.ok(!app.setupStepsFor('brewery', v.id).includes('menu'));
  // His tap list link, approved: the page says "Tap list" / "See the tap list" (it read "Menu … See the menu").
  ok(await change(t, { menu_url: 'https://example.com/taps' }));
  const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0").get(v.id);
  assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true);
  cfg = await setupCfg(t);
  assert.equal(cfg.menuKnown, true, 'the finish screen stops asking once there is a link');
  const html = page(v);
  assert.match(html, /See the tap list ↗/);
  assert.match(html, /<h2>Tap list 🍺<\/h2>/);
  assert.doesNotMatch(html, /See the menu ↗/);
  assert.doesNotMatch(html, /Menu &amp; prices/);
  assert.deepEqual(app.venueTapListWords(app.getVenue(v.id), true), { label: 'Liste des bières', see: 'Voir la liste des bières', lower: 'liste des bières' });
  assert.match(page(v, 'fr'), /Voir la liste des bières/);
  // With its own kitchen (or no answer yet) the menu words stay.
  const k = dan(); ok(await change(tokenFor(k.id), { place_type: 'Brewery', brewery_info: { food: 'kitchen' } }));
  assert.equal(app.venueTapListWords(app.getVenue(k.id), false), null);
  assert.equal(app.venueTapListWords(app.getVenue(dan().id), false), null);
  assert.equal(app.venueTapListWords(app.getVenue(mk('restaurant').id), false), null);
  // The menu page: "menu or tap list", "searching for your beer".
  const menu = (await get(`/owner/${t}/menu`)).text;
  assert.match(menu, /Add your menu or tap list/);
  assert.match(menu, /searching for your beer/);
  assert.match(menu, /Just add a link to your menu or tap list/);
  assert.doesNotMatch(menu, /searching for your food/);
  const menuFr = (await get(`/fr/owner/${t}/menu`)).text;
  assert.match(menuFr, /Ajoutez votre menu ou votre liste des bi&egrave;res/);
  // A restaurant's menu page is unchanged.
  assert.match((await get(`/owner/${tokenFor(mk('restaurant').id)}/menu`)).text, /searching for your food/);
});

test('a “Tour” kind for breweries; Build My Trip plans the stop around the tour on a day it runs and promises nothing on another day', async () => {
  const v = dan({ name: 'Tourday Test Brewing' }); const t = tokenFor(v.id);
  const cfg = await setupCfg(t);
  assert.ok(cfg.nightKinds.slice(0, cfg.nightKindsTop).includes('tour'), 'Tour shows without opening “More kinds”');
  assert.equal(cfg.t.kinds.tour, 'Brewery tour');
  assert.equal(cfg.t.kinds.trivia, text.en.kinds.trivia, 'the other kinds keep their names');
  assert.equal((await setupCfg(t, true)).t.kinds.tour, 'Visite de la brasserie');
  assert.equal(cfg.researchEvents, 'Tours by appointment', 'research’s Tours line is the hint on the events screen');
  // The edit page offers Tour to a brewery too.
  assert.match((await get(`/owner/${t}`)).text, /<option value="tour"/);
  // The tour runs on the weekday three days from now; the day after has none.
  const wd = (off) => DAYS[(new Date(`${today}T12:00:00Z`).getUTCDay() + 6 + off) % 7];
  const tourDay = wd(3), otherDay = wd(4);
  ok(await change(t, { weekly_nights: [{ days: [tourDay], kind: 'tour', title: 'Brewery tour', start: '13:00', detail: '$15 with a flight. Book by email' }] }));
  mk('brewery', { name: 'Alpha Test Taphouse', price: '$$', rating: 4.8, reviews: 900 });
  mk('brewery', { name: 'Beta Test Brewing', price: '$$', rating: 4.7, reviews: 800 });
  let p = await plan(`a brewery tour on ${DAY_NAMES[tourDay]} in Kelowna`);
  let stops = p.itinerary.stops;
  assert.equal(stops[0].venue.name, 'Tourday Test Brewing', 'the place whose tour runs that day is the first stop');
  assert.match(stops[0].nightLine, new RegExp(`^${DAY_NAMES[tourDay]}: Brewery tour at 1 PM`));
  assert.ok(stops[0].reasons.some((r) => (r.text || r) === `Tour on ${DAY_NAMES[tourDay]} at 1 PM, from its listing`));
  const row = p.schedule.find((x) => x.venueId === v.id);
  assert.ok(row.startMinutes <= 13 * 60 && row.startMinutes >= 12 * 60 + 30, `starts just before the tour (${row.startMinutes})`);
  assert.ok(row.endMinutes >= 14 * 60, 'and stays for it');
  // A day with no tour: no tour line and no tour reason anywhere.
  p = await plan(`a brewery tour on ${DAY_NAMES[otherDay]} in Kelowna`);
  stops = p.itinerary.stops;
  assert.ok(stops.every((x) => !x.nightLine && !x.reasons.some((r) => /tour/i.test(r.text || r))), JSON.stringify(stops.map((x) => [x.venue.name, x.nightLine])));
  // French copy for the new reason.
  assert.equal(frCopy.t3FrenchText('Tour on Saturday at 1 PM, from its listing'), 'Visite le samedi à 13 h, selon sa fiche');
  // "wine tour" and "food tour" are not a place's own tour.
  const tp = require('../trip-planner.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  assert.match(src, /const OWN_TOUR_ASK_RE = /);
  assert.equal(typeof tp.planTrip, 'function');
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const re = new RegExp(/const OWN_TOUR_WORDS_RE = \/(.*)\/i;/.exec(serverSrc)[1], 'i');
  assert.equal(re.test('a brewery tour on Saturday'), true); assert.equal(re.test('distillery tours'), true);
  assert.equal(re.test('a wine tour on Saturday'), false); assert.equal(re.test('food tour'), false); assert.equal(re.test('boat tour'), false);
});

test('“Weekly events” over a daytime item; “Weekly nights” stays for evening-only lists', async () => {
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { weekly_nights: [{ days: ['wed'], kind: 'trivia', title: 'Trivia', start: '19:00' }] }));
  assert.match(page(v), /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
  ok(await change(t, { weekly_nights: [{ days: ['wed'], kind: 'trivia', title: 'Trivia', start: '19:00' }, { days: ['sat'], kind: 'tour', title: 'Brewery tour', start: '13:00' }] }));
  assert.match(page(v), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.match(page(v, 'fr'), /<h2 id="venueNightsTitle">Événements de la semaine<\/h2>/);
  // A run club at 6 PM is not a "night" either; a pub with only evening items keeps "Weekly nights".
  ok(await change(t, { weekly_nights: [{ days: ['thu'], kind: 'run_club', title: 'Run club', start: '18:00' }] }));
  assert.match(page(v), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  const pub = mk('pub'); ok(await change(tokenFor(pub.id), { weekly_nights: [{ days: ['tue'], kind: 'karaoke', title: 'Karaoke', start: '21:00' }, { days: ['fri'], kind: 'live_music', title: 'Live music' }] }));
  assert.match(page(pub), /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
});

test('help for breweries: no kitchen, bring your own food, growlers, tours, non-alcoholic on tap; “Right here in setup” for flights (EN and FR)', async () => {
  const v = dan(); const t = tokenFor(v.id);
  const hb = helpBot((await get(`/owner/${t}/setup`)).text);
  const want = [
    ['we don\'t have a kitchen, food truck on weekends', 'brewery-food-trucks'], ['can people bring their own food', 'brewery-food-trucks'], ['outside food', 'brewery-food-trucks'],
    ['growler fills', 'brewery-togo'], ['cans to go', 'brewery-togo'],
    ['tours are saturday only', 'brewery-tours'], ['where do I put our brewery tour', 'brewery-tours'],
    ['hop water and kombucha on tap, no alcohol', 'brewery-na'], ['non-alcoholic beer', 'brewery-na'],
    ['we do flights', 'brewery-price'], ['how do I update our tap list', 'brewery-taplist'], ['run club', 'weekly-nights'], ['we close early on christmas eve', 'closures'],
    // French.
    ['nous n avons pas de cuisine, camion la fin de semaine', 'brewery-food-trucks'], ['peut-on apporter sa propre nourriture', 'brewery-food-trucks'], ['remplissage de growlers', 'brewery-togo'],
    ['où mettre la visite de la brasserie', 'brewery-tours'], ['eau houblonnée et kombucha, sans alcool', 'brewery-na'], ['deux intersaisons avec des heures différentes', 'brewery-seasonal-hours'],
  ];
  for (const [q, id] of want) assert.equal(hb.best(q).id, id, q);
  // "We don't have a happy hour" still gets its own answer.
  assert.equal(hb.best('we dont have a happy hour').id, 'dont-have');
  assert.match(hb.topic('brewery-na').a, /<strong>Non-alcoholic drinks<\/strong>/);
  assert.match(hb.topic('brewery-na').aFr, /<strong>Boissons sans alcool<\/strong>/);
  assert.match(hb.topic('brewery-tours').a, /Tap <strong>Brewery tour<\/strong>/);
  assert.match(hb.topic('brewery-togo').a, /<strong>What can people take home\?<\/strong>/);
  assert.match(hb.topic('brewery-food-trucks').a, /Can people bring their own food\?/);
  assert.match(hb.topic('brewery-food-trucks').a, /<strong>Your menu or tap list<\/strong>/);
  // Asked in the setup: "Right here in setup" (it said "Open Set up your page…" while on that screen).
  assert.match(hb.topic('brewery-price').a, /^<p>Right here in setup: <strong>Flights and to go<\/strong> \(tap <strong>Change an answer<\/strong> if it’s done\)\./);
  assert.match(hb.topic('brewery-price').aFr, /^<p>Ici même, dans la configuration : <strong>Plateaux et pour emporter<\/strong>/);
  // The edit page keeps the way in.
  const edit = helpBot((await get(`/owner/${t}`)).text);
  assert.match(edit.topic('brewery-price').a, /^<p>Open <strong>Set up your page<\/strong>/);
  // The second-time button is named as the brewery's (and a pub's) day card names it; a restaurant's keeps lunch & dinner.
  assert.match(hb.topic('setup-split-hours').a, /\+ Add a second time \(if you close in between\)/);
  assert.match(helpBot((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text).topic('setup-split-hours').a, /\+ Add a second time \(if you close in between\)/);
  assert.match(helpBot((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).topic('setup-split-hours').a, /\+ Add a second time \(lunch &amp; dinner\)/);
});

test('wording: a taproom happy hour example, the shared happy hour question, a second time “if you close in between”, the food-truck sub-line', async () => {
  assert.equal(text.en.brewery.whatsOnEx, '$2 off pints');
  assert.equal(text.fr.brewery.whatsOnEx, '2 $ de rabais sur les pintes');
  // The brewery entry no longer has a happy hour question of its own, so a site's own question applies to breweries too.
  assert.equal(Object.prototype.hasOwnProperty.call(text.en.brewery, 'happyQ'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(text.fr.brewery, 'happyQ'), false);
  const b = dan(); const cfg = await setupCfg(tokenFor(b.id));
  assert.equal(cfg.t.happyQ, text.en.happyQ);
  assert.equal(cfg.t.happyQ, 'Do you have a happy hour?');
  assert.equal(cfg.t.whatsOnEx, '$2 off pints');
  assert.equal(cfg.t.addSecond, '+ Add a second time (if you close in between)');
  assert.equal(cfg.t.twoTimesMax, 'Up to two times a day.');
  for (const type of ['pub', 'cocktail']) { const c = await setupCfg(tokenFor(mk(type).id)); assert.equal(c.t.addSecond, '+ Add a second time (if you close in between)', type); assert.equal(c.t.twoTimesMax, 'Up to two times a day.', type); }
  assert.equal((await setupCfg(tokenFor(mk('pub').id), true)).t.addSecond, '+ Ajouter une deuxième plage (si vous fermez entre les deux)');
  const r = await setupCfg(tokenFor(mk('restaurant').id));
  assert.equal(r.t.addSecond, '+ Add a second time (lunch & dinner)'); assert.match(r.t.twoTimesMax, /Breakfast runs into lunch\?/);
  assert.equal((await setupCfg(tokenFor(mk('cafe').id))).t.addSecond, '+ Add a second time');
  assert.equal(text.en.brewery.tfoodSubs.trucks, 'We’ll show “Food trucks most days” or “on weekends” (truck names change too often). Summer only? Pick Snacks only and mention the trucks in your story.');
  assert.match(text.fr.brewery.tfoodSubs.trucks, /L’été seulement \? Choisissez Collations seulement et parlez des camions dans votre histoire\.$/);
});

test('pre-picks from research wherever it sits: the flight price, food trucks on weekends, all ages (suggestions only)', async () => {
  const v = dan(); const cfg = await setupCfg(tokenFor(v.id));
  assert.equal(cfg.researchFee, 12, '“Pints from $8, flights $12” picks $12, not $8');
  assert.equal(cfg.suggestFood, 'trucks'); assert.equal(cfg.suggestTrucks, 'weekends');
  assert.equal(cfg.suggestKidsAll, true, '“Family and dog friendly”');
  // Nothing is saved by a suggestion.
  assert.equal(app.breweryFlightFee(v.id), null);
  assert.equal(app.venueBreweryInfo(v.id).food, undefined);
  // A Flights line still wins; a happy hour price is never a flight price; "no food trucks" picks nothing.
  const f = mk('brewery'); research(f.id, [{ label: 'Flights', text: 'Flights $10' }, { label: 'Prices', text: 'Pints from $8, flights $14' }]);
  assert.equal((await setupCfg(tokenFor(f.id))).researchFee, 10);
  const h = mk('brewery'); research(h.id, [{ label: 'Good to know', text: 'Happy hour flights $9. No food trucks' }, { label: 'Kids & dogs', text: 'Adults only (19+)' }]);
  const ch = await setupCfg(tokenFor(h.id));
  assert.equal(ch.researchFee, null); assert.equal(ch.suggestFood, ''); assert.equal(ch.suggestKidsAll, false);
  for (const [line, fee] of [['$12 flights', 12], ['Flights from $11', 11], ['$13 for a flight of four', 13], ['Flight: $9.50', 9.5]]) {
    const x = mk('brewery'); research(x.id, [{ label: 'Prices', text: line }]); assert.equal((await setupCfg(tokenFor(x.id))).researchFee, fee, line);
  }
  // Once he answers, his answer stands.
  ok(await change(tokenFor(v.id), { place_type: 'Brewery', brewery_info: { food: 'snacks', minors: { policy: 'adults' } }, flight_fee: 9 }));
  assert.equal(app.breweryFlightFee(v.id), 9); assert.equal(app.venueBreweryInfo(v.id).food, 'snacks');
});

test('Build My Trip with kids: a visit that would start at or after the kids-until time is not offered; before it, the usual line', async () => {
  const v = dan({ name: 'Kidscut Test Brewing', region: 'vernon', address: '3100 30 Ave, Vernon', latitude: 50.267, longitude: -119.272 }); const t = tokenFor(v.id);
  ok(await change(t, { place_type: 'Brewery', brewery_info: { food: 'snacks', minors: { policy: 'minors_until', until: '19:00' } } }));
  const day = DAY_NAMES[DAYS[(new Date(`${today}T12:00:00Z`).getUTCDay() + 6 + 3) % 7]];
  const all = (p) => recs(p).concat(((p.itinerary && p.itinerary.stops) || []).map((x) => ({ name: x.venue && x.venue.name, caveats: x.caveats || [] })));
  // An outing that starts at 8 PM with kids: he is left out (he led it, with "plan to leave by then").
  let r = all(await plan(`a brewery with kids on ${day} evening at 8 PM in Vernon`));
  assert.ok(!r.some((x) => x.name === 'Kidscut Test Brewing'), JSON.stringify(r));
  // Named by the visitor: shown, with the plain line (never "plan to leave by then").
  r = all(await plan('Kidscut Test Brewing with kids at 8 PM'));
  const named = r.find((x) => x.name === 'Kidscut Test Brewing');
  assert.ok(named, 'a place the visitor names is still shown');
  assert.ok(named.caveats.includes('Kids are welcome until 7 PM only'), JSON.stringify(named.caveats));
  assert.ok(!named.caveats.some((c) => /plan to leave by then/.test(c)));
  // From 5 PM: offered, with the time.
  r = all(await plan(`${day} afternoon from 5 PM in Vernon with kids: a brewery`));
  const five = r.find((x) => x.name === 'Kidscut Test Brewing');
  assert.ok(five, 'offered before the cut-off');
  assert.ok(five.caveats.some((c) => /^Kids welcome with an adult until 7 PM/.test(c)), JSON.stringify(five.caveats));
  // Without kids he is offered at 8 PM as before.
  r = all(await plan(`${day} evening from 8 PM in Vernon: a brewery`));
  assert.ok(r.some((x) => x.name === 'Kidscut Test Brewing'), JSON.stringify(r));
  // A dinner time is not the start of the outing: an afternoon stop with kids stays.
  r = all(await plan(`${day} from 2 PM in Vernon with kids: a brewery then dinner at 8 PM`));
  assert.ok(r.some((x) => x.name === 'Kidscut Test Brewing'), JSON.stringify(r));
  assert.equal(frCopy.t3FrenchText('Kids are welcome until 7 PM only'), 'Enfants bienvenus jusqu’à 19 h seulement');
  assert.equal(frCopy.t3FrenchText('Kids welcome with an adult until 7 PM, so plan to leave by then'), 'Enfants bienvenus avec un adulte jusqu’à 19 h; prévoyez de partir avant');
});

test('the phone’s Back button goes to the previous setup screen; the setup’s own Back, resume and the “Leave site?” guard are as before', () => {
  const s = CLIENT();
  assert.match(s, /function canBack\(\)\{ return !!S\.hist\.length && S\.step !== 'finish' && S\.step !== 'ess' && S\.step !== 'start'; \}/);
  assert.match(s, /history\.pushState\(\{ suNav: r, suTrap: 1 \}, '', location\.pathname \+ location\.search \+ \(r\.h \? '#' \+ r\.h : ''\)\); S\.trap = true;/);
  assert.match(s, /window\.addEventListener\('popstate', function\(e\)\{/);
  assert.match(s, /if \(canBack\(\)\) \{ el\('suBack'\)\.onclick\(\); return backArm\(\); \}/, 'exactly what “← Back” does');
  assert.match(s, /try \{ history\.back\(\); \} catch \(x\) \{\}/, 'on the first screen Back leaves, as before');
  // The reload record keeps working (same state key), and the unsaved-typing guard is untouched.
  assert.match(s, /history\.replaceState\(S\.trap \? \{ suNav: r, suTrap: 1 \} : \{ suNav: r \}, '', url\);/);
  assert.match(s, /window\.addEventListener\('beforeunload', function\(e\)\{ drSave\(\); if \(S\.leaving\) return; if \(S\.busy \|\| S\.dirty \|\| S\.photos\.length/);
  // Run it: three screens deep, two phone Backs go back two screens; a third leaves.
  const calls = [];
  const S = { hist: ['start', 'hours'], step: 'hours:edit', trap: false, leaving: false, busy: false };
  const listeners = {};
  const history = { state: null, pushState(st) { calls.push('push'); this.state = st; }, replaceState(st) { this.state = st; }, back() { calls.push('leave'); } };
  const el = () => ({ onclick() { calls.push('back'); S.step = S.hist.pop(); } });
  const ctx = { S, history, location: { pathname: '/owner/x/setup', search: '', hash: '' }, window: { addEventListener: (k, f) => { listeners[k] = f; }, suLangHash: () => '' }, el, navRec: () => ({ h: '' }) };
  clientPart('  function canBack(){', '  function navKeep(){', ctx, '\nthis.backArm = backArm;');
  ctx.backArm(); assert.deepEqual(calls, ['push']); assert.equal(S.trap, true);
  ctx.backArm(); assert.deepEqual(calls, ['push'], 'one entry only, however many screens');
  listeners.popstate({ state: { suNav: {} } });
  assert.deepEqual(calls, ['push', 'back', 'push']); assert.equal(S.step, 'hours');
  listeners.popstate({ state: { suNav: {} } });
  assert.deepEqual(calls, ['push', 'back', 'push', 'back']); assert.equal(S.step, 'start'); assert.equal(S.trap, false, 'nothing to go back to: no entry');
  S.trap = true; // (as when she reached the first screen with the setup's own Back)
  listeners.popstate({ state: { suNav: {} } });
  assert.equal(calls[calls.length - 1], 'leave');
  // Arriving on our own entry (Forward, or Back from a help link) does nothing.
  const before = calls.length; S.trap = true; listeners.popstate({ state: { suTrap: 1 } }); assert.equal(calls.length, before);
});

test('small ones: the second time removed, chip-filled boxes, the story tile, a stale deals block and the status line', async () => {
  const s = CLIENT();
  // Removing the second time just added (12–10 PM split at 2:30 and 5) puts the closing time back.
  assert.match(s, /\{ wk\[d\] = \[\[a, '14:30'\], \['17:00', z\]\]; \(S\.splitWas = S\.splitWas \|\| \{\}\)\[S\.step \+ d\] = z; \}/);
  assert.match(s, /if \(sz0 && \+q5\[1\] === 1 && w\.length === 1 && w\[0\]\[1\] === '14:30'\) w\[0\]\[1\] = sz0;/);
  // Her own chip tap this visit is not selected on the first tap; research's text still is.
  assert.match(s, /var chipOwn = !!\(S\.chipFilled && inp\.id && S\.chipFilled\[inp\.id\] != null && S\.chipFilled\[inp\.id\] === inp\.value\);/);
  assert.match(s, /\|\| researchStory \|\| researchLine\) && !chipOwn, first = true;/);
  assert.match(s, /\(S\.chipFilled = S\.chipFilled \|\| \{\}\)\['nt' \+ q2\[0\]\] = e\.what;/);
  assert.match(s, /\(S\.chipFilled = S\.chipFilled \|\| \{\}\)\.suGroupsLine = S\.brew\.groups;/);
  // The story tile says "on your page" once nothing of it is waiting (it kept "within a day" after approval).
  assert.match(s, /h\(capFirst\(stText\(k, nowSt\(k, d\)\)\)\)/);
  // Deals on file but hidden as stale: the status line doesn't claim "Happy hour on now" either.
  const v = dan(); const t = tokenFor(v.id);
  ok(await change(t, { happy_hour: Object.fromEntries(DAYS.map((d) => [d, [['15:00', '17:00']]])), badges: { happy_hour: true }, happy_hour_deals: { deals: [{ price: '$2 off', text: 'pints' }] } }));
  // Checked recently (pretend it was confirmed the day before): both show.
  db.prepare('UPDATE venues SET happy_hour_deals_checked_at = ?, happy_hour_checked_at = ? WHERE id = ?').run('2027-01-12', '2027-01-12', v.id);
  const now = page(v, 'en', at('2027-01-13'));
  assert.match(now, /class="venue-hh-deal-text"/); assert.match(plain(now), /Happy hour on now/);
  // Checked long before: the deals block is hidden, and the status doesn't say it is on.
  db.prepare('UPDATE venues SET happy_hour_deals_checked_at = ? WHERE id = ?').run('2026-06-01', v.id);
  const old = page(v, 'en', at('2027-01-13'));
  assert.doesNotMatch(old, /class="venue-hh-deal-text"/); assert.doesNotMatch(plain(old), /Happy hour on now/);
  assert.match(plain(old), /Open now/, 'the hours status itself is unchanged');
  // A place with happy hour times and no deals on file keeps "Happy hour on now" (nothing is hidden).
  const nd = dan(); ok(await change(tokenFor(nd.id), { happy_hour: Object.fromEntries(DAYS.map((d) => [d, [['15:00', '17:00']]])), badges: { happy_hour: true } }));
  assert.match(plain(page(nd, 'en', at('2027-01-13'))), /Happy hour on now/);
});

// ====================== C. Leftovers from the café round ======================
test('Build My Trip: “Dogs outside only” for a place whose owner said so (never the plain dog-friendly chip or reason)', async () => {
  const PEN = { region: 'penticton', address: '200 Main St, Penticton', latitude: 49.499, longitude: -119.593 };
  const c = mk('cafe', { name: 'Outside Dogs Coffee', cuisine: 'Coffee shop', price: '$', dog_friendly: 1, patio: 1, ...PEN }); const t = tokenFor(c.id);
  ok(await change(t, { visit_rows: { dogs: 'Dogs outside only' } }));
  assert.equal(app.dogsOutsideOnly(app.getVenue(c.id)), true);
  const fact = app.buildTripPlannerFacts(false, today).find((x) => x.id === c.id);
  assert.equal(fact.dogsOutsideOnly, true);
  const inside = mk('cafe', { name: 'Inside Dogs Coffee', cuisine: 'Coffee shop', price: '$', dog_friendly: 1, ...PEN, latitude: 49.4995 });
  assert.equal(app.buildTripPlannerFacts(false, today).find((x) => x.id === inside.id).dogsOutsideOnly, undefined);
  const r = recs(await plan('a dog friendly cafe in Penticton'));
  const out = r.find((x) => x.name === 'Outside Dogs Coffee'), ins = r.find((x) => x.name === 'Inside Dogs Coffee');
  assert.ok(out && ins, JSON.stringify(r.map((x) => x.name)));
  assert.equal(out.venue.dogsOutsideOnly, true);
  assert.equal(out.venue.badges.find((b) => b.key === 'dog_friendly').label, 'Dogs outside only');
  assert.ok(!out.reasons.includes('Has the Dog-Friendly badge'));
  assert.notEqual(ins.venue.badges.find((b) => b.key === 'dog_friendly').label, 'Dogs outside only');
  // Where the planner gives the badge as a reason, it is the same words.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8'), /if \(v\.features\.dog_friendly\) add\('feature', 8, v\.dogsOutsideOnly \? 'Dogs outside only' : 'Has the Dog-Friendly badge'\);/);
  assert.equal(frCopy.t3FrenchText('Dogs outside only'), 'Chiens à l’extérieur seulement');
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /b\.key === 'dog_friendly' && v\.dogsOutsideOnly \? \(lang\(\) === 'fr' \? 'Chiens à l’extérieur seulement' : 'Dogs outside only'\)/);
});

test('the dietary line doesn’t say “Nothing gluten-free” twice when her own note starts with the same words (EN and FR)', async () => {
  const dietLine = (h) => { const m = /🌱<\/span>\s*<span[^>]*>([^<]*)</.exec(h) || /🌱\s*(?:<[^>]+>\s*)*([^<]+)</.exec(h); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  const c = mk('cafe', { name: 'Flour Test Bakery', cuisine: 'Bakery', price: '$' }); const t = tokenFor(c.id);
  ok(await change(t, { cafe_info: { diet: { gf_kitchen: 'none', note: 'Nothing gluten-free: flour everywhere in our kitchen.', note_fr: 'Rien sans gluten : farine partout dans la cuisine.' } } }));
  assert.equal(dietLine(page(c, 'en')), 'Nothing gluten-free: flour everywhere in our kitchen.');
  assert.equal(dietLine(page(c, 'fr')).replace(/[  ]/g, ' '), 'Rien sans gluten : farine partout dans la cuisine.');
  // A note that says something else keeps the lead-in.
  ok(await change(t, { cafe_info: { diet: { gf_kitchen: 'none', note: 'May contain nuts.', note_fr: 'Peut contenir des noix.' } } }));
  assert.equal(dietLine(page(c, 'en')), 'Nothing gluten-free. May contain nuts.');
  assert.equal(dietLine(page(c, 'fr')), 'Rien sans gluten. Peut contenir des noix.');
});
