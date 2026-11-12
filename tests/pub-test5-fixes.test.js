// Fifth first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub5-2026-11-10/REPORT.md). The setup is
// shared, so restaurants get the same fixes: a heated patio counts as a patio, no 19+ pub on a trip with kids, copying
// hours never reopens a closed day, "My menu is on Facebook or Instagram" (and no removed website filled in), the next
// opening skips a closure, every BC stat holiday, the research-ticks line and the sports-in-the-description prompt,
// BBQ in the pub food list, "Taphouse / craft beer bar", no "We don't serve food" after a kitchen answer, the Help "?".
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test5-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
delete process.env.TRIP_PLANNER_V2;
delete process.env.TRIP_PLANNER_V3;
const app = require('../server.js');
const hours = require('../hours.js');
const TEXT = require('../owner-setup-text.js');
const FT = require('../french-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT5 ${type} ${++n}`, slug: `pt5-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.3, address: `${n} Main St, Penticton`, phone: '250-555-0100', hours: WEEK, description: 'A fixture used only by the fifth pub test fix tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const text = (p) => get(p).then((r) => r.text);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.95.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });

// ---------- 1: a heated or covered patio counts as a patio ----------
test('1: a heated patio with patio=0 is in the Patio guide, the API patio filter and the map Patio filter (stored patio unchanged)', async () => {
  // Enough patios in Summerland for a guide page, then a pub that only ticked "Heated or covered patio".
  for (let i = 0; i < 9; i++) mk('restaurant', { region: 'summerland', latitude: 49.6 + i / 1000, longitude: -119.67, patio: 1 });
  const pub = mk('pub', { region: 'summerland', latitude: 49.61, longitude: -119.67, name: 'PT5 Heated Patio Pub', patio: 0 });
  const t = tokenFor(pub.id);
  const before = await get('/api/venues?region=summerland&patio=1&limit=100');
  assert.ok(!before.text.includes('PT5 Heated Patio Pub'), 'not a patio before');
  const r = await change(t, { badges: { heated_patio: true } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  assert.equal(app.venueOwnerFeatures(pub.id).heated_patio, true);
  // Read time only: the stored column stays 0.
  assert.equal(require('../db.js').prepare('SELECT patio FROM venues WHERE id = ?').get(pub.id).patio, 0);
  assert.equal(app.patioPublic(require('../db.js').prepare('SELECT * FROM venues WHERE id = ?').get(pub.id)), true);
  assert.equal(app.getVenue(pub.id).patio, true, 'the venue object reads a patio');
  const api = await get('/api/venues?region=summerland&patio=1&limit=100');
  assert.ok(api.text.includes('PT5 Heated Patio Pub'), 'in the API patio filter');
  const guide = await get('/guide/summerland/patio');
  assert.equal(guide.status, 200);
  assert.ok(guide.text.includes('PT5 Heated Patio Pub'), 'in the Patio guide');
  const row = app.mapPlacesData().find((p) => p[2] === 'PT5 Heated Patio Pub');
  assert.ok(row && (row[7] & 1), 'the map Patio bit is on');
  // The owner's own tick compares against the stored column, so nothing writes patio=1 back from the read-time rule.
  assert.equal(cfgOf(await text(`/owner/${t}/setup`)).cur.badges.patio, false);
  assert.match(app.badgeTrueSql('patio'), /heated_patio/);
});

test('1b: the setup ticks Patio when Heated patio is ticked (and unticks Heated when Patio is unticked)', async () => {
  for (const type of ['pub', 'restaurant']) {
    const s = scriptOf(await text(`/owner/${tokenFor(mk(type).id)}/setup`));
    assert.match(s, /if \(k === 'heated_patio' && S\.badges\[k\] && !S\.badges\.patio\) \{ S\.badges\.patio = true; press\('patio', true\); \}/);
    assert.match(s, /if \(k === 'patio' && !S\.badges\[k\] && S\.badges\.heated_patio\) \{ S\.badges\.heated_patio = false; press\('heated_patio', false\); \}/);
  }
});

// ---------- 2: no 19+ pub on a trip with kids ----------
test('2: "craft beer and live music ... with my kids" never plans a 19+ pub (live-music fallback), TRIP_PLANNER_V3 on and off', async () => {
  const hrs = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:30']]])));
  const R = { region: 'peachland', longitude: -119.73 };
  for (let i = 0; i < 4; i++) mk('restaurant', { ...R, latitude: 49.77 + i / 1000, hours: hrs, rating: 4.4, kid_friendly: 1 });
  mk('brewery', { ...R, latitude: 49.775, hours: hrs, rating: 4.5, kid_friendly: 1, description: 'Craft beer brewed on site.' });
  mk('cafe', { ...R, latitude: 49.776, rating: 4.5 });
  const pub = mk('pub', { ...R, latitude: 49.778, hours: hrs, rating: 4.9, reviews: 900, name: 'PT5 Adults Taphouse', live_music: 1, kid_friendly: 1, description: 'Craft beer on tap and live music on Saturdays.' });
  const r = await change(tokenFor(pub.id), { pub_info: { minors: { policy: 'adults' } } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  const has = (p) => JSON.stringify(p).includes('PT5 Adults Taphouse');
  const days = [10, 11, 12, 13, 14, 15].map((d) => new Date(Date.UTC(2026, 10, d, 18)));
  // Sanity: without kids the same request reaches the pub (so the fallback path is the one tested).
  assert.ok(days.some((d) => has(app.runTripPlan({ text: 'craft beer and live music in Peachland' }, d))), 'without kids the pub is planned');
  for (const q of ['craft beer and live music in Peachland with my kids', 'live music and dinner in Peachland with the kids', 'pub night in Peachland with kids']) {
    for (const d of days) assert.ok(!has(app.runTripPlan({ text: q }, d)), `${q} on ${d.toISOString().slice(0, 10)}`);
  }
  // Through the API (the planner is the same with V3 on; with it off and V2 on, too).
  for (const env of [{ TRIP_PLANNER_V3: 'on' }, { TRIP_PLANNER_V3: '', TRIP_PLANNER_V2: '1' }]) {
    Object.assign(process.env, env);
    const res = await post('/api/trip/plan', { text: 'craft beer and live music in Peachland with my kids' });
    assert.equal(res.status, 200, JSON.stringify(env));
    assert.ok(!has(res.body), `API ${JSON.stringify(env)}`);
  }
  delete process.env.TRIP_PLANNER_V3; delete process.env.TRIP_PLANNER_V2;
  // A pub whose business says all ages are welcome may be planned with kids (the shared kid-friendly rule).
  const tp = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  assert.match(tp, /function kidsAllowed\(v\) \{[\s\S]{0,200}if \(v\.type === 'pub' \|\| v\.type === 'brewery'\) return !!\(v\.features && v\.features\.kid_friendly\);/);
  assert.match(tp, /if \(tripKids\) for \(const p of parts\) p\.c\.kids = true;/);
});

// ---------- 3: copying hours never reopens a closed day ----------
test('3: "Copy these hours to" skips days marked Closed ("Every open day"); only a page with no other hours fills every day', async () => {
  for (const type of ['pub', 'restaurant']) {
    const html = await text(`/owner/${tokenFor(mk(type).id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
    // Café test 4: the rule lives in copyGets(d, x) (also skips days the owner marked Closed on this screen).
    assert.match(s, /h\(DAYS\.every\(function\(x\)\{ return x === d \|\| copyGets\(d, x\); \}\) \? T\.copyAll : T\.copyOpen\)/);
    assert.match(s, /var gets = DAYS\.filter\(function\(x\)\{ return copyGets\(d, x\); \}\);/);
    assert.equal(cfg.t.copyOpen, 'Every open day');
    assert.equal(cfg.t.copyClosedNote, 'Days marked Closed stay closed.');
  }
  // The copy rule itself, run as the page runs it: Mon closed, Tue set to noon–midnight, "Every open day".
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const copy = (week, d, all, tapped) => {
    const S = { week: JSON.parse(JSON.stringify(week)), step: 'hours:edit' };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const fns = ['othersClosed', 'tapClosed', 'copyGets'].map((n) => new RegExp(`function ${n}\\(d(, \\w+)?\\)\\{[^\\n]*\\}`).exec(s)[0]).join('\n');
    const F = new Function('S', 'DAYS', 'W', `${fns}; return { othersClosed, tapClosed, copyGets };`)(S, DAYS, () => S.week);
    (tapped || []).forEach((x) => F.tapClosed(x, true));
    const body = /(var gets = DAYS\.filter[^\n]*\n[^\n]*)/.exec(s)[1];
    new Function('S', 'DAYS', 'd', 'all', 'src', 'clone', 'copyGets', 'wk', body)(S, DAYS, d, all, S.week[d], clone, F.copyGets, S.week);
    return S.week;
  };
  const w0 = { mon: null, tue: [['12:00', '00:00']], wed: [['11:30', '23:00']], thu: [['11:30', '23:00']], fri: [['11:30', '23:00']], sat: [['11:30', '23:00']], sun: [['11:30', '23:00']] };
  const all = copy(w0, 'tue', true);
  assert.equal(all.mon, null, 'Monday stays closed');
  for (const d of ['wed', 'thu', 'fri', 'sat', 'sun']) assert.deepEqual(all[d], [['12:00', '00:00']], d);
  const wk = copy(w0, 'tue', false);
  assert.equal(wk.mon, null); assert.deepEqual(wk.fri, [['12:00', '00:00']]); assert.deepEqual(wk.sat, [['11:30', '23:00']]);
  // A new page (every other day closed): Every day fills them all, as before.
  const fresh = copy({ mon: [['11:00', '21:00']], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, 'mon', true);
  for (const d of DAYS) assert.deepEqual(fresh[d], [['11:00', '21:00']], d);
  // Café test 4: a day marked Closed on this screen stays closed even on a new page.
  const fresh2 = copy({ mon: [['05:30', '14:00']], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, 'mon', true, ['sun']);
  assert.equal(fresh2.sun, null); assert.deepEqual(fresh2.sat, [['05:30', '14:00']]);
  for (const k of ['copyOpen', 'copyClosedNote']) assert.ok(TEXT.fr[k] && TEXT.fr[k] !== TEXT.en[k], `FR ${k}`);
});

// ---------- 4: the menu step ----------
test('4: the menu step never fills in a website being removed or one they said they don\'t have', async () => {
  const v = mk('pub', { website: 'https://redbarn.example.com' });
  const t = tokenFor(v.id);
  assert.equal(cfgOf(await text(`/owner/${t}/setup`)).website, 'https://redbarn.example.com');
  const r = await change(t, { website: '' });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  assert.ok(app.getVenue(v.id).website, 'still stored while it waits for review');
  assert.equal(cfgOf(await text(`/owner/${t}/setup`)).website, '', 'not filled in on the menu step');
  // "We don't have a website" with none on file.
  const v2 = mk('restaurant', { website: '' });
  const t2 = tokenFor(v2.id);
  await change(t2, { not_offered: ['website'] });
  assert.equal(cfgOf(await text(`/owner/${t2}/setup`)).website, '');
  const s = scriptOf(await text(`/owner/${t}/setup`));
  assert.match(s, /lead2 = s === 'menu:web' \? \(site \? T\.webLead : T\.webLeadEmpty\)/);
  assert.match(s, /phoneSaved\(chN\); C\.website = ''; \}/, 'removed in this visit: not filled in either');
});

test('4b: "My menu is on Facebook or Instagram": a link is the menu link (checked first); a page name goes to us to find', async () => {
  for (const type of ['pub', 'restaurant']) {
    const html = await text(`/owner/${tokenFor(mk(type).id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
    assert.equal(cfg.t.menuSocial, 'My menu is on Facebook or Instagram');
    // Café test 4: the Facebook link already known shows under it ("Your Facebook: facebook.com/…").
    assert.match(s, /big\('📘', T\.menuSocial, fbKnown\(\) \? fill\(T\.menuFbKnown, \{ x: siteDomain\(fbKnown\(\)\) \}\) : '', true, 'go:menu:social'\)/);
    assert.match(s, /if \(mlink\) return saveAll\('menu', \[\{ menu_url: mlink \}\], 'day'\);/);
    assert.match(s, /post\(C\.base \+ '\/menu\/help', \{ note: fill\(T\.menuSocialNote, \{ name: ms \}\)/);
  }
  const v = mk('pub'); const t = tokenFor(v.id);
  const r = await change(t, { menu_url: 'facebook.com/RedBarnTaphouse' });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  const help = await post(`/owner/${t}/menu/help`, { note: TEXT.en.menuSocialNote.replace('{name}', 'Red Barn Taphouse'), contact_email: '', contact_phone: '' });
  assert.equal(help.status, 200, JSON.stringify(help.body));
  const row = require('../db.js').prepare("SELECT help_note, help_kind FROM venue_menus WHERE venue_id = ? AND status = 'help' ORDER BY id DESC LIMIT 1").get(v.id);
  assert.match(row.help_note, /Red Barn Taphouse/); assert.equal(row.help_kind, null, 'the menu request, reviewed like the menu');
  for (const k of ['menuSocial', 'menuSocialQ', 'menuSocialLead', 'menuSocialLabel', 'menuSocialEmpty', 'menuSocialNote', 'savedMenuSocialName', 'webLeadEmpty', 'webQEmpty']) assert.ok(TEXT.fr[k] && TEXT.fr[k] !== TEXT.en[k], `FR ${k}`);
});

// ---------- 5: the next opening skips a closure ----------
test('5: on Jan 4 with Jan 5–20 closed, the status says "Opens Thu, Jan 21, 12 PM" (server and French; the client copy has it)', () => {
  const week = { mon: [], tue: [['12:00', '00:00']], wed: [['12:00', '00:00']], thu: [['12:00', '00:00']], fri: [['12:00', '00:00']], sat: [['12:00', '00:00']], sun: [['12:00', '00:00']],
    _closures: [{ from: '2027-01-05', to: '2027-01-20', note: 'Closed for holidays' }, { from: '2026-12-26', to: '2026-12-26', note: 'Boxing Day' }] };
  const p = hours.parseHours(JSON.stringify(week));
  const say = (date, weekday, minutes) => { const c = { date, weekday, minutes }; return hours.hoursStatusLabel(hours.statusAt(p, c), c).text; };
  assert.equal(say('2027-01-04', 'mon', 23 * 60 + 59), 'Closed today · Opens Thu, Jan 21, 12 PM');
  assert.equal(say('2027-01-10', 'sun', 600), 'Closed today (Closed for holidays) · Opens Thu, Jan 21, 12 PM');
  assert.equal(say('2027-01-20', 'wed', 600), 'Closed today (Closed for holidays) · Opens tomorrow 12 PM');
  assert.equal(say('2027-01-21', 'thu', 600), 'Closed · Opens 12 PM');
  // Without a closure in the way, nothing changes.
  assert.equal(say('2027-01-25', 'mon', 600), 'Closed today · Opens tomorrow 12 PM');
  assert.equal(say('2026-12-25', 'fri', 23 * 60 + 59 - 1440 + 1440), 'Open now · Closes midnight');
  assert.equal(say('2026-12-26', 'sat', 600), 'Closed today (Boxing Day) · Opens tomorrow 12 PM');
  assert.equal(app.frStatusText('Closed today · Opens Thu, Jan 21, 12 PM'), 'Fermé aujourd’hui · ouvre jeu. 21 janv. à 12 h');
  // The browser copy: the same functions, and the same French.
  assert.match(hours.HOURS_CLIENT_SRC, /function nextOpeningByDate\(/);
  const frScript = FT.FR_SCRIPT.find((x) => String(x[0]).startsWith('function hoursStatusLabel('));
  assert.ok(frScript, 'client French status');
  const ctx = {}; vm.runInNewContext(`${hours.HOURS_CLIENT_SRC.replace('function hoursStatusLabel(status, clock) {', frScript[1])}; out = __frStatusText('Closed today · Opens Thu, Jan 21, 12 PM');`, ctx);
  assert.equal(ctx.out, 'Fermé aujourd’hui · ouvre jeu. 21 janv. à 12 h');
});

// ---------- 6: every BC stat holiday ----------
function holidaysAt(s, iso) {
  const pick = (re) => { const m = re.exec(s); assert.ok(m, String(re)); return m[0]; };
  const src = [pick(/function ymd\(d\)\{[^\n]*\}/), pick(/function easter\(y\)\{[^\n]*\}/), pick(/function thirdMonday\(y, mo\)\{[^\n]*\}/), pick(/function nthMonday\(y, mo, nth\)\{[^\n]*\}/), pick(/function holidays\(\)\{[\s\S]*?\n  \}/)].join('\n');
  const [Y, M, D] = iso.split('-').map(Number);
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(Y, M - 1, D, 9); } }
  const ctx = { Date: FixedDate };
  vm.runInNewContext(`${src}; out = holidays();`, ctx);
  return ctx.out;
}
test('6: holiday tiles cover every BC stat holiday with the right dates, next first; next year\'s date is its own', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  const list = holidaysAt(s, '2026-11-10');
  assert.deepEqual(JSON.parse(JSON.stringify(list.map((o) => `${o.key} ${o.date}`))), ['remembrance 2026-11-11', 'xmasEve 2026-12-24', 'xmas 2026-12-25', 'boxing 2026-12-26', 'nye 2026-12-31', 'nyd 2027-01-01',
    'family 2027-02-15', 'goodFri 2027-03-26', 'easterMon 2027-03-29', 'victoria 2027-05-24', 'canada 2027-07-01', 'bcDay 2027-08-02', 'labour 2027-09-06', 'truth 2027-09-30', 'thanks 2027-10-11']);
  const by = Object.fromEntries(list.map((o) => [o.key, o]));
  assert.equal(by.thanks.next, '2028-10-09', 'Thanksgiving next year is its own 2nd Monday');
  assert.equal(by.victoria.next, '2028-05-22'); assert.equal(by.goodFri.next, '2028-04-14'); assert.equal(by.remembrance.next, '2027-11-11');
  assert.equal(by.xmasEve.yearly, true); // café test 5: the eves have "This year and next" too assert.equal(by.thanks.yearly, true);
  // Canada Day on a Sunday (2029) is Monday July 2.
  assert.equal(Object.fromEntries(holidaysAt(s, '2029-06-01').map((o) => [o.key, o.date])).canada, '2029-07-02');
  // The screen stays short: the next 6 (and any ticked), then "Show all holidays".
  assert.match(s, /var HOL_FEW = 6;/);
  assert.match(s, /HOL\.filter\(function\(o, i\)\{ return S\.holAll \|\| i < HOL_FEW \|\| S\.closures\.indexOf\(o\.key\) >= 0; \}\)/);
  assert.match(s, /fill\(T\.holAll, \{ n: HOL\.length \}\)/);
  for (const k of ['victoria', 'canada', 'bcDay', 'labour', 'truth', 'thanks', 'remembrance']) assert.ok(TEXT.en.holidays[k] && TEXT.fr.holidays[k] && TEXT.fr.holidays[k] !== TEXT.en.holidays[k], k);
  assert.equal(TEXT.en.holidays.thanks, 'Thanksgiving'); assert.equal(TEXT.fr.holidays.thanks, 'Action de grâce');
  for (const k of ['holAll', 'holFewer']) assert.ok(TEXT.fr[k] && TEXT.fr[k] !== TEXT.en[k], `FR ${k}`);
});

test('6b: a saved Thanksgiving (this year and next) comes back as the ticked tile', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const s = scriptOf(await text(`/owner/${t}/setup`));
  const by = Object.fromEntries(holidaysAt(s, app.todayLocal()).map((o) => [o.key, o]));
  const r = await change(t, { closures: [{ from: by.thanks.date, to: by.thanks.date, note: 'Thanksgiving' }, { from: by.thanks.next, to: by.thanks.next, note: 'Thanksgiving' }] });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  const froms = cfgOf(await text(`/owner/${t}/setup`)).cur.closures.map((c) => c.from);
  assert.ok(froms.includes(by.thanks.date) && froms.includes(by.thanks.next), JSON.stringify(froms));
  assert.match(s, /var nextYear = HOL\.filter\(function\(o\)\{ return o\.yearly; \}\)\.map\(function\(o\)\{ return \{ key: o\.key, date: o\.next \}; \}\);/);
});

// ---------- 7: research ticks, and a description that still mentions sports ----------
test('7: "We ticked these from what we found online" above pre-ticked research tiles; the owner\'s own ticks don\'t count', async () => {
  const v = mk('pub', { sports_tv: 1, patio: 1, description: 'Twenty rotating taps, wings and the game on every night.' });
  const t = tokenFor(v.id);
  let cfg = cfgOf(await text(`/owner/${t}/setup`));
  assert.deepEqual(cfg.researchTicks.sort(), ['patio', 'sports_tv']);
  assert.equal(cfg.t.researchLine, 'We ticked these from what we found online. Untick anything that’s wrong.');
  // The owner saves the screen.
  const r = await change(t, { badges: { patio: true, sports_tv: true, live_music: true } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  cfg = cfgOf(await text(`/owner/${t}/setup`));
  // Live music was turned on by the owner (logged as theirs): never "from what we found online". Confirming a researched
  // tick changes nothing stored, so that line goes once the owner has saved the screen (S.done.offer).
  assert.equal(app.getVenue(v.id).live_music, true);
  assert.ok(!cfg.researchTicks.includes('live_music'), JSON.stringify(cfg.researchTicks));
  const s = scriptOf(await text(`/owner/${t}/setup`));
  assert.match(s, /var resTicked = !S\.done\.offer && \(C\.researchTicks \|\| \[\]\)\.some\(function\(k\)\{ return S\.badgesAtStart\[k\]; \}\);/);
  assert.match(s, /'<p class="su-sent su-research" id="suResearch">' \+ h\(T\.researchLine\) \+ '<\/p>'/);
  const rest = cfgOf(await text(`/owner/${tokenFor(mk('restaurant', { vegan: 1 }).id)}/setup`));
  assert.deepEqual(rest.researchTicks, ['vegan']);
  assert.ok(TEXT.fr.researchLine && TEXT.fr.researchLine !== TEXT.en.researchLine);
});

test('7b: no sports, but the description mentions the game: a gentle prompt with one tap to "Your story"; never auto-edited', async () => {
  const desc = 'Twenty rotating taps, wings and the game on every night.';
  const v = mk('pub', { sports_tv: 1, description: desc });
  const t = tokenFor(v.id);
  const s = scriptOf(await text(`/owner/${t}/setup`));
  const re = new RegExp(/var SPORTS_RE = (\/.*?\/i);/.exec(s)[1].replace(/^\/|\/i$/g, '').replace(/\\\\/g, '\\'), 'i');
  assert.ok(re.test(desc)); assert.ok(re.test('Big screens for every Canucks game')); assert.ok(!re.test('Pool, darts and board games every night.'));
  assert.match(s, /var sb = p\[1\] === 'offer' && !S\.badges\.sports_tv && !S\.storyFixed \? sportsBit\(\) : '';/);
  assert.match(s, /big\('✎', T\.storySportsBtn, '', true, 'storyFix'\)/);
  assert.match(s, /if \(k === 'storyFix'\) \{ S\.storyReturn = 'offer';/);
  assert.match(s, /if \(step === 'story' && S\.storyReturn\) \{ var sr = S\.storyReturn; S\.storyReturn = ''; return after\(sr\); \}/);
  // Saving "no sports" leaves the description exactly as it was.
  const r = await change(t, { badges: { sports_tv: false } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  assert.equal(app.getVenue(v.id).description, desc);
  for (const k of ['storySportsQ', 'storySportsLead', 'storySportsBtn', 'storySportsHint']) assert.ok(TEXT.fr[k] && TEXT.fr[k] !== TEXT.en[k], `FR ${k}`);
});

// ---------- 8: small items ----------
test('8: pubs see BBQ and Chicken & Wings without "Show more"; "Taphouse / craft beer bar" saves and shows (EN and FR)', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const cfg = cfgOf(await text(`/owner/${t}/setup`));
  assert.ok(cfg.popular.includes('BBQ') && cfg.popular.includes('Chicken & Wings'));
  assert.ok(cfg.placeTypes.includes('Taphouse'));
  assert.equal(cfg.placeNames.Taphouse, 'Taphouse / craft beer bar');
  assert.equal(cfgOf(await text(`/fr/owner/${t}/setup`)).placeNames.Taphouse, 'Taphouse / bar à bières artisanales');
  const r = await change(t, { cuisines: ['Pub Fare', 'BBQ'], place_type: 'Taphouse' });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  assert.match(page(v, 'en'), /Taphouse \/ craft beer bar/);
  assert.match(page(v, 'fr'), /Taphouse \/ bar à bières artisanales/);
  assert.equal((await change(tokenFor(mk('restaurant').id), { place_type: 'Taphouse' })).status, 400, 'restaurants keep their own list');
});

test('8b: "We don\'t serve food" only before the kitchen question is answered; the Help "?" sits in the Back row', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(html);
  assert.match(s, /\(C\.pub && !S\.kitchen\.mode \? '<div class="su-skip"><button type="button" class="su-link" data-act="noFood">'/);
  assert.match(html, /@media \(max-width: 699px\) \{ body\.owner-setup \.ohb-btn \{ top: 72px; \} body\.owner-setup \.su-top \{ min-height: 52px; padding-right: 56px; \} \}/);
});
