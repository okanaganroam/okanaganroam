// Second first-time DISTILLERY owner test on Whistler (Sophie, a Squamish distillery with a cocktail lounge and kitchen,
// iPhone, French; Whistler Roam drafts/fresh-eyes-distillery2-2026-11-16/REPORT.md). The code is shared, so the fixes are
// made here:
//  A. the kitchen's closing time is asked for each stretch of other hours (summer to 10 PM, fall to 8 PM);
//  B. each happy hour has its own "Only some months" (an après deal in winter only); old single-months data still works;
//  1. her French event name (« Atelier de fabrication de gin ») over the chip's generic name;
//  2. a stretch's kitchen time follows the stretch when its dates change;
//  3. the English page leaves off research lines her answers cover (Prices' tasting part, free parking, Events, dish word);
//  4. Sports TV comes off when a distillery saves "What you offer"; 5. a dog chip replaces research's pre-fill;
//  7. Build My Trip: jazz brunch, a name inside another name, a named place at its daytime event, kids before "until",
//     "test" never flagged, French notes, the happy hour's time, "drinks" with a distillery;
//  8. help; 9. French words; 10. English-only cuisine on French pages; 12. the Events row; 13. the deal counter;
//  14. hour chips; 15. one tap to change a stretch.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'distillery-wr2-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
const pc = require('../portal-completeness.js');
const hours = require('../hours.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Sophie Test ${++n}`, slug: `sophie-test-${n}`, region: 'vernon', type, latitude: 50.267 + n / 2000, longitude: -119.272,
  rating: 4.4, reviews: 150, address: `${3000 + n} 30 Ave, Vernon`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('11:00', '22:00')),
  description: 'A fixture used only by the second Whistler distillery fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.27.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = () => fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const bare = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const reasonsOf = (x) => (x.reasons || x.why || []).map((r) => (typeof r === 'string' ? r : r.text));
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
const fnSrc = (s, name) => { const i = s.indexOf(`function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
// 3 PM (or hm) Pacific on a date (PDT from mid-March to early November).
const at = (date, hm = '15:00') => new Date(`${date}T${hm}:00${/-(0[4-9]|10)-|-03-(1[5-9]|[23]\d)|-11-01/.test(date) ? '-07:00' : '-08:00'}`);

// Sophie's place: usual Mon–Thu 2–10, Fri 2–11, Sat 10–11, Sun 10–9; summer Jun 15 – Sep 6 later; autumn Oct 13 – Nov 27
// earlier. Her own kitchen (9 PM, summer 10 PM, autumn 8 PM), minors until 8 PM, $18 tastings, three events.
const USUAL = { mon: [['14:00', '22:00']], tue: [['14:00', '22:00']], wed: [['14:00', '22:00']], thu: [['14:00', '22:00']], fri: [['14:00', '23:00']], sat: [['10:00', '23:00']], sun: [['10:00', '21:00']] };
const SUM = { label: '', from: '06-15', to: '09-06', hours: { mon: [['12:00', '23:00']], tue: [['12:00', '23:00']], wed: [['12:00', '23:00']], thu: [['12:00', '23:00']], fri: [['12:00', '23:59']], sat: [['10:00', '23:59']], sun: [['10:00', '22:00']] } };
const AUT = { label: '', from: '10-13', to: '11-27', hours: { mon: [['15:00', '21:00']], tue: [['15:00', '21:00']], wed: [['15:00', '21:00']], thu: [['15:00', '21:00']], fri: [['15:00', '22:00']], sat: [['10:00', '22:00']], sun: [['10:00', '20:00']] } };
const KITCHEN = { mode: 'earlier', closes: '21:00', season: { from: '06-15', to: '09-06', closes: '22:00' }, season2: { from: '10-13', to: '11-27', closes: '20:00' } };
const NIGHTS = [{ days: ['tue'], kind: 'trivia', title: 'Trivia', title_fr: 'Quiz', start: '19:00' }, { days: ['sun'], kind: 'live_music', title: 'Live music', title_fr: 'Brunch jazz', start: '11:00' },
  { days: ['sat'], kind: 'class', title: 'Class', title_fr: 'Atelier de fabrication de gin', detail_fr: '75 $, sur réservation', start: '14:00', frequency: 'monthly-1st' }];
// Happy hour: every day 3–5 PM, and Sat–Sun 2–4 PM in winter only (Dec 1 – Mar 31).
const HH = { ...Object.fromEntries(DAYS.map((d) => [d, ['sat', 'sun'].includes(d) ? [['15:00', '17:00'], ['14:00', '16:00']] : [['15:00', '17:00']]])), _season: null, _slot_seasons: { sat: { '14:00': { from: '12-01', to: '03-31' } }, sun: { '14:00': { from: '12-01', to: '03-31' } } } };
const DEALS = { deals: [{ text: 'Every day: House cocktails $9' }, { text: 'Sat, Sun: Après pitcher $30' }], deals_fr: [{ text: 'Tous les jours : Cocktails maison 9 $' }, { text: 'Sam, dim : Après-ski : pichet à 30 $' }] };
const RESEARCH = [{ label: 'Known for', text: 'Small-batch gin and vodka' }, { label: 'Prices', text: 'Tasting flights $15, cocktails from $14' }, { label: 'Kids & dogs', text: 'Adults only (19+); dogs welcome inside' },
  { label: 'Food', text: 'Snacks and charcuterie' }, { label: 'Events', text: 'Trivia Tuesdays at 7 PM' }, { label: 'Good to know', text: 'Free parking on site' }];
const sophie = async (o = {}, opts = {}) => {
  const v = mk('distillery', { name: opts.name || `Howe Fixture Spirits ${n + 1}`, ...(opts.region ? { region: opts.region } : {}), price: 2, rating: 4.6, reviews: 213, patio: 1, dog_friendly: 1, live_music: 1, great_groups: 1, nonalcoholic: 1, sports_tv: 1,
    cuisine: 'Craft distillery & cocktail lounge', ...o });
  research(v.id, opts.research || RESEARCH);
  const t = tokenFor(v.id);
  ok(await change(t, { hours: USUAL, hours_checked: true }, true));
  ok(await change(t, { hours_seasons: [SUM, AUT] }, true));
  ok(await change(t, { brewery_info: { food: 'kitchen', outside: 'no', kitchen: KITCHEN } }, true));
  ok(await change(t, { flight_fee: 18, brewery_info: { to_go: ['bottles'], minors: { policy: 'minors_until', until: '20:00' } } }, true));
  ok(await change(t, { weekly_nights: NIGHTS }, true));
  if (!opts.noHappy) ok(await change(t, { happy_hour: HH, badges: { happy_hour: true }, happy_hour_deals: DEALS }));
  return { v, t };
};

// ====================== A. A kitchen time for each stretch ======================
test('A: two stretches ask one kitchen question each, write season and season2 with their own times, and the page shows each by date', async () => {
  const s = CLIENT();
  const ctx = { CUR: { hours_seasons: [SUM, AUT] }, S: { kitchen: { sea: { mode: 'time', closes: '22:00' }, sea2: { mode: 'time', closes: '20:00' } } }, T: text.en, fill, h: (x) => String(x), mdLabel: (md) => md };
  vm.runInNewContext(`${fnSrc(s, 'kitchenSeasons')}\n${fnSrc(s, 'kseaBlock')}\n${fnSrc(s, 'kseaInto')}\nfunction mdText(md){ return mdLabel(md); }\nthis.kseaBlock = kseaBlock; this.kseaInto = kseaInto;`, ctx);
  const block = ctx.kseaBlock();
  assert.match(block, /In your 06-15 – 09-06 hours, when does the kitchen close\?[\s\S]*data-ksea="time"[\s\S]*In your 10-13 – 11-27 hours, when does the kitchen close\?[\s\S]*data-ksea2="time"/);
  assert.match(block, /id="suKsto" value="22:00"[\s\S]*id="suKsto2" value="20:00"/);
  const kv = { mode: 'earlier', closes: '21:00' };
  assert.equal(ctx.kseaInto(kv, false), true);
  assert.deepEqual(JSON.parse(JSON.stringify(kv)), KITCHEN);
  // Only the second stretch differs: only it is stored (the server keeps a lone one as it is).
  ctx.S.kitchen.sea = { mode: 'same', closes: '' };
  const kv2 = { mode: 'earlier', closes: '21:00' }; ctx.kseaInto(kv2, false);
  assert.deepEqual(JSON.parse(JSON.stringify(kv2)), { mode: 'earlier', closes: '21:00', season2: { from: '10-13', to: '11-27', closes: '20:00' } });
  // A blank second time asks for it.
  ctx.S.kitchen.sea2 = { mode: 'time', closes: '' }; assert.equal(ctx.kseaInto({ mode: 'earlier', closes: '21:00' }, false), false);
  // The taproom screen keeps both through a redraw; a tap on the second question's buttons sets only it.
  assert.match(s, /if \(\(x = v\('suKsto2'\)\) !== null && C\.brewery && S\.kitchen && S\.kitchen\.sea2\) S\.kitchen\.sea2\.closes = x;/);
  assert.match(s, /querySelectorAll\('\[data-ksea\],\[data-ksea2\]'\)/);
  // Saved and shown: summer 10 PM, autumn 8 PM, the rest of the year 9 PM (English and French).
  const { v } = await sophie({}, { noHappy: true });
  assert.deepEqual(app.venueBreweryInfo(v.id).kitchen, KITCHEN);
  for (const [date, en, fr] of [['2027-07-10', '10 PM', '22 h'], ['2026-11-20', '8 PM', '20 h'], ['2027-01-15', '9 PM', '21 h']]) {
    assert.match(plain(page(v, 'en', at(date))), new RegExp(`Our own kitchen; it closes at ${en}\\.`), date);
    assert.match(plain(page(v, 'fr', at(date))), new RegExp(`Cuisine sur place ; elle ferme à ${fr}`), date);
  }
  // The help says each stretch has its own time now (pubs and restaurants too).
  assert.doesNotMatch(SERVER(), /one time covers both|une seule heure vaut pour les deux/);
});

// ====================== 2. The kitchen time follows its stretch ======================
test('2: a stretch whose dates change keeps its kitchen time (Sep 7 is a regular day once summer ends Sep 6); pubs too', async () => {
  const { v, t } = await sophie({}, { noHappy: true });
  // Her kitchen was saved with summer to Sep 7; then she moved summer's end to Sep 6.
  ok(await change(t, { hours_seasons: [{ ...SUM, to: '09-07' }, AUT] }, true));
  ok(await change(t, { brewery_info: { kitchen: { ...KITCHEN, season: { ...KITCHEN.season, to: '09-07' } } } }, true));
  ok(await change(t, { hours_seasons: [SUM, AUT] }, true));
  assert.equal(app.venueBreweryInfo(v.id).kitchen.season.to, '09-06', 'read in step with the stretch');
  assert.match(plain(page(v, 'en', at('2027-09-07'))), /it closes at 9 PM\./, 'Sep 7: the rest of the year');
  assert.match(plain(page(v, 'en', at('2027-09-06'))), /it closes at 10 PM\./, 'Sep 6: summer');
  // A stretch removed takes its kitchen time with it; the other keeps its own.
  ok(await change(t, { hours_seasons: [AUT] }, true));
  assert.deepEqual(app.venueBreweryInfo(v.id).kitchen.season, KITCHEN.season2);
  assert.equal(app.venueBreweryInfo(v.id).kitchen.season2, undefined);
  // A pub's kitchen the same way.
  const pub = mk('pub'); const pt = tokenFor(pub.id);
  ok(await change(pt, { hours_seasons: [{ ...SUM, to: '09-07' }] }));
  ok(await change(pt, { pub_info: { kitchen: { mode: 'earlier', closes: '21:00', season: { from: '06-15', to: '09-07', closes: '23:00' } } } }));
  ok(await change(pt, { hours_seasons: [SUM] }));
  assert.equal(app.venuePubInfo(pub.id).kitchen.season.to, '09-06');
  assert.match(app.pubInfoLinesHtml(app.getVenue(pub.id), false, at('2027-09-07', '12:00')), /Kitchen closes at 9 PM/);
  // No stretches at all: read as stored.
  assert.deepEqual(app.kitchenSeasonsInStep(999999, { kitchen: { mode: 'same', season: { from: '06-01', to: '08-31', closes: 'close' } } }).kitchen.season, { from: '06-01', to: '08-31', closes: 'close' });
});

// ====================== B. Each happy hour's own months ======================
test('B: per-happy-hour months are stored by window, shown only in their months (week, deals, status), and a bad window is refused', async () => {
  const { v, t } = await sophie();
  const row = db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(v.id);
  assert.deepEqual(JSON.parse(row.happy_hour_times)._slot_seasons, HH._slot_seasons);
  assert.equal(JSON.parse(row.happy_hour_times)._season, undefined);
  // Saturday Nov 21 2026 (not winter): only 3–5 PM, no après line; Saturday Dec 5 (winter): 2–4 PM with its months, the line.
  const nov = plain(page(v, 'en', at('2026-11-21', '12:00'))), dec = plain(page(v, 'en', at('2026-12-05', '12:00')));
  assert.doesNotMatch(nov, /2–4 PM|Après pitcher/); assert.match(nov, /House cocktails \$9/);
  assert.match(nov, /Happy hour today 3–5 PM/);
  assert.match(dec, /2–4 PM \(Dec–Mar\)/); assert.match(dec, /Après pitcher \$30/);
  // The status line names the stretch actually on that day: 2–4 and 3–5 run together, so 2–5 PM.
  assert.match(dec, /Happy hour today 2–5 PM/);
  const decFr = plain(page(v, 'fr', at('2026-12-05', '12:00')));
  assert.match(decFr, /5 à 7 aujourd’hui 14 h–17 h/); assert.match(decFr, /pichet à 30 \$/);
  assert.doesNotMatch(plain(page(v, 'fr', at('2026-11-21', '12:00'))), /pichet/);
  // On now during the 2–4 window on a winter Saturday: it runs on into 3–5, so it ends at 5 PM, not 4.
  const onNow = at('2026-12-05', '14:30'), left = 17 * 60 - app.okanaganClock(onNow).minutes;
  assert.ok(left > 60 && left < 180, `${left}`);
  assert.match(plain(page(v, 'en', onNow)), new RegExp(`Happy hour on now · ends in ${Math.floor(left / 60)} hr${left % 60 ? ` ${left % 60} min` : ''}`));
  // hours.js: the week as it runs from a date (the map and lists read the same).
  const wk = hours.happyHourSlotsOn(row.happy_hour_times, '2026-11-20');
  assert.deepEqual(wk.sat, [['15:00', '17:00']]); assert.equal(wk._slot_seasons, undefined);
  assert.deepEqual(hours.happyHourSlotsOn(row.happy_hour_times, '2026-12-04').sat, [['15:00', '17:00'], ['14:00', '16:00']]);
  // A deal line belongs to the happy hour with exactly its days.
  assert.deepEqual(app.happyHourDealSeason('Sat, Sun: Après pitcher $30', row.happy_hour_times), { from: '12-01', to: '03-31' });
  assert.equal(app.happyHourDealSeason('Every day: House cocktails $9', row.happy_hour_times), null);
  assert.deepEqual([...app.happyHourDealDays('Sam, dim : Après-ski')], ['sat', 'sun']);
  // Months for a window that isn't there are refused; an edit-page save without them keeps them.
  assert.equal((await change(t, { happy_hour: { ...HH, _slot_seasons: { mon: { '14:00': { from: '12-01', to: '03-31' } } } } })).status, 400);
  const { _slot_seasons, _season, ...weekOnly } = HH;
  const ed = await postJson(`/owner/${t}/changes`, { changes: { happy_hour: { ...weekOnly, mon: [['15:00', '18:00']] } }, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
  assert.ok([200, 201].includes(ed.status), JSON.stringify(ed.body));
  const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").get(v.id);
  if (pend) assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true);
  assert.deepEqual(JSON.parse(db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(v.id).happy_hour_times).mon, [['15:00', '18:00']]);
  assert.deepEqual(JSON.parse(db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(v.id).happy_hour_times)._slot_seasons, HH._slot_seasons);
});

test('B: a happy hour stored before (one "_season" for all) reads exactly as before, and the setup gives every happy hour that season', async () => {
  const v = mk('pub', { happy_hour: 1 }); const t = tokenFor(v.id);
  const old = { ...Object.fromEntries(DAYS.map((d) => [d, d === 'fri' ? [['15:00', '17:00'], ['21:00', '23:00']] : [['15:00', '17:00']]])), _season: { from: '06-01', to: '08-31' } };
  ok(await change(t, { happy_hour: old, badges: { happy_hour: true } }));
  const json = db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(v.id).happy_hour_times;
  assert.equal(app.happyHourSlotSeasonsOf(json), null);
  assert.equal(app.happyHourTimesOn(json, '2026-07-10'), json, 'unchanged');
  assert.match(app.happyHourWeekText(json, false), /\(Jun–Aug\)$/);
  // The setup: each happy hour starts from the stored season; one box per happy hour once there are two or more.
  const s = CLIENT();
  assert.match(s, /S\.happy\.forEach\(function\(e\)\{ var d0 = DAYS\.filter\(function\(d\)\{ return e\.days\[d\]; \}\)\[0\], z = sl && d0 && sl\[d0\] && sl\[d0\]\[e\.from\]; e\.sea = z \? seaFrom\(z\.from, z\.to\) : clone\(S\.happySea\); \}\);/);
  assert.match(s, /\(S\.happy\.length > 1 \? seasonBox\('happy\.' \+ i, e\.sea \|\| \(e\.sea = clone\(S\.happySea\)\), fill\(T\.happySeasonEach \|\| T\.happySeasonH, \{ n: i \+ 1 \}\)\) : ''\)/);
  assert.match(s, /\(S\.happy\.length > 1 \? '' : '<div class="su-day">' \+ seasonBox\('happy', S\.happySea, T\.happySeasonH\) \+ '<\/div>'\)/);
  // Saving: all the same is the one "_season" as before; different months go by window.
  const save = fnSrc(s, 'happySave');
  assert.match(save, /week\._season = same && outs\[0\]\.from \? \{ from: outs\[0\]\.from, to: outs\[0\]\.to \} : null;/);
  assert.match(save, /\(sl\[d\] = sl\[d\] \|\| \{\}\)\[e\.from\] = \{ from: outs\[i\]\.from, to: outs\[i\]\.to \}/);
  assert.equal(text.en.happySeasonEach, 'Is happy hour {n} all year?');
  assert.equal(text.fr.happySeasonEach, 'Le 5 à 7 nº {n} est-il offert toute l’année ?');
});

test('B: Build My Trip plans each happy hour only in its months and says the time, not "Has the Happy Hour badge"', async () => {
  const { v } = await sophie({}, { name: 'Winter Apres Spirits Fixture', region: 'coldstream' });
  const reason = async (q) => { const p = await plan(q); const it = itemsOf(p).find((x) => x.venue.id === v.id); assert.ok(it, `${q}: ${JSON.stringify(itemsOf(p).map((x) => x.venue.name))}`); return reasonsOf(it).join(' | '); };
  const nov = await reason('Happy hour in Coldstream on Saturday November 21');
  assert.match(nov, /Happy hour 3–5 PM on Saturday, from its listing/); assert.doesNotMatch(nov, /Has the Happy Hour badge/);
  assert.match(await reason('Happy hour in Coldstream on Saturday December 5'), /Happy hour 2–5 PM on Saturday, from its listing/);
  assert.equal(frCopy.t3FrenchText('Happy hour 2–5 PM on Saturday, from its listing'), '5 à 7 le samedi, 14 h–17 h, selon sa fiche');
  assert.equal(app.happyHourJoinedRangesText([[900, 1020], [840, 960]], false), '2–5 PM');
});

// ====================== 1. Her French event name ======================
test('1: « Atelier de fabrication de gin » (her French name) on French pages and trip cards; the English page keeps "Class" until an English name', async () => {
  const { v } = await sophie({}, { noHappy: true });
  const fr = plain(page(v, 'fr', at('2026-12-05', '10:00'))), en = plain(page(v, 'en', at('2026-12-05', '10:00')));
  assert.match(fr, /Atelier de fabrication de gin 14 h/); assert.match(fr, /75 \$, sur réservation/);
  assert.match(en, /Class 2 PM/);
  const s = { kind: 'class', title: 'Class', title_fr: 'Atelier de fabrication de gin', start: '14:00' };
  assert.deepEqual(app.daytimeTripLabel(s, true), { text: 'Atelier de fabrication de gin', english: false });
  assert.deepEqual(app.daytimeTripLabel(s, false), { text: 'Class', english: false });
  assert.equal(app.daytimeTripLabel({ ...s, title_fr: 'Atelier' }, true).text, 'Atelier', 'a generic French name stays the chip’s');
  assert.match(app.nightsTripText([s], true).text, /^Atelier de fabrication de gin à 14 h$/);
});

// ====================== 3. Research lines her answers cover ======================
test('3: the English page leaves off research’s tasting price, free parking, Events and dish word once her answers cover them (stored rows untouched)', async () => {
  const { v, t } = await sophie({}, { noHappy: true });
  ok(await change(t, { badges: { wheelchair_accessible: true, free_parking: false } }));
  const en = plain(page(v, 'en'));
  assert.match(en, /Tastings \$18 a tasting\./);
  assert.match(en, /Prices Cocktails from \$14\./); assert.doesNotMatch(en, /Tasting flights \$15/);
  assert.doesNotMatch(en, /Free parking on site/);
  assert.doesNotMatch(en, /Trivia Tuesdays at 7 PM/);
  const stored = app.currentVisitInfoJson(v.id);
  for (const l of ['Tasting flights $15, cocktails from $14', 'Trivia Tuesdays at 7 PM', 'Free parking on site']) assert.ok(String(stored).includes(l), `${l} still stored`);
  // Before a place saves "What you offer", research's free parking stays (unknown is not "no").
  const other = mk('distillery');
  const gtk = { rows: [{ label: 'Good to know', text: 'Free parking on site. Cash only at the bar.' }], owner_labels: [] };
  assert.equal(app.visitRowsOwnerCovered(app.getVenue(other.id), gtk), gtk);
  ok(await change(tokenFor(other.id), { badges: { wheelchair_accessible: true } }));
  assert.deepEqual(app.visitRowsOwnerCovered(app.getVenue(other.id), gtk).rows, [{ label: 'Good to know', text: 'Cash only at the bar.' }]);
  // Her Food line: no research dish word (a row stored before reads "Our own kitchen" too, its French matching).
  const info = { rows: [{ label: 'Food', text: 'Charcuterie from our own kitchen; it closes at 8 PM.' }], winery_labels: ['Food'], owner_labels: ['Food'], owner_fr: { Food: { en: 'Charcuterie from our own kitchen; it closes at 8 PM.', fr: 'Cuisine sur place ; elle ferme à 20 h.' } } };
  const out = app.visitRowsOwnerCovered(app.getVenue(v.id), info);
  assert.equal(out.rows[0].text, 'Our own kitchen; it closes at 8 PM.');
  assert.equal(out.owner_fr.Food.en, 'Our own kitchen; it closes at 8 PM.');
  assert.match(en, /Food Our own kitchen; it closes at/); assert.doesNotMatch(en, /Charcuterie from/);
  // The French page agrees (no research lines there).
  const fr = plain(page(v, 'fr'));
  assert.doesNotMatch(fr, /Tasting flights|Free parking|Trivia Tuesdays/);
});

// ====================== 4 + 5. Sports TV, dog chips ======================
test('4 + 5: saving a distillery’s "What you offer" takes Sports TV off; a dog chip replaces research’s pre-filled line', async () => {
  const s = CLIENT();
  assert.match(s, /if \(C\.distillery && \(S\.savedBadges\.sports_tv \|\| \(CUR\.badges \|\| \{\}\)\.sports_tv\) && C\.offerGroups\.every\(function\(g\)\{ return g\.keys\.indexOf\('sports_tv'\) < 0; \}\)\) sendB\.sports_tv = false;/);
  // The server takes it off from the setup (a distillery's screen has no Sports TV tile).
  const { v, t } = await sophie({}, { noHappy: true });
  const cfg = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.ok(cfg.offerGroups.every((g) => !g.keys.includes('sports_tv')));
  ok(await change(t, { badges: { sports_tv: false } }, true));
  assert.equal(app.getVenue(v.id).sports_tv ? 1 : 0, 0);
  assert.match(s, /else if \(v && qk === 'dogs' && S\.dogGuessed && C\.suggestDogNote && v === String\(C\.suggestDogNote\)\.trim\(\)\) \{ v = t; S\.dogGuessed = false; \}/);
});

// ====================== 7. Build My Trip ======================
test('7: jazz brunch finds her Sunday « Brunch jazz » (EN + FR); her name never pulls in Howe Sound Brewing; a named visit starts at her daytime event', async () => {
  const { v } = await sophie({}, { noHappy: true, name: 'Howe Sound Spirits (test)', region: 'lumby' });
  const brew = mk('brewery', { name: 'Howe Sound Brewing', region: 'lumby', rating: 4.5, reviews: 900, dog_friendly: 1 });
  for (const q of ['Jazz brunch in Lumby on Sunday November 22', 'Brunch avec du jazz à Lumby le dimanche 22 novembre']) {
    const p = await plan(q);
    const it = itemsOf(p).find((x) => x.venue.id === v.id);
    assert.ok(it, `${q}: ${JSON.stringify(itemsOf(p).map((x) => x.venue.name))}`);
    assert.match(reasonsOf(it).join(' | '), /Brunch jazz on Sunday at 11 AM, from its listing/);
    assert.ok(!(p.warnings || []).some((w) => /breakfast or brunch/.test(w)), (p.warnings || []).join(' | '));
  }
  assert.equal(frCopy.t3FrenchText('Brunch jazz on Sunday at 11 AM, from its listing'), 'Brunch jazz le dimanche à 11 h, selon sa fiche');
  // Not on another Sunday's plan when the event isn't that day (a Saturday has no brunch jazz).
  const sat = await plan('Jazz brunch in Lumby on Saturday November 21');
  assert.ok(!itemsOf(sat).some((x) => x.venue.id === v.id && reasonsOf(x).some((r) => /Brunch jazz/.test(r))));
  // Her name alone: her, never Howe Sound Brewing; and never "test" flagged when she didn't type it.
  for (const q of ['Howe Sound Spirits in Lumby on Sunday November 22 at 11 AM', 'Visit Howe Sound Spirits in Lumby on Saturday December 5 then dinner']) {
    const p = await plan(q);
    assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), q);
    assert.ok(!itemsOf(p).some((x) => x.venue.id === brew.id), `${q}: ${JSON.stringify(itemsOf(p).map((x) => x.venue.name))}`);
    assert.ok(!(p.requirementResults || []).some((r) => r.kind === 'venue' && r.value === brew.id), q);
    assert.ok(![...(p.unsupported || []), ...((p.understood && p.understood.notUsed) || [])].some((u) => /\btest\b/i.test(u)), q);
  }
  assert.ok((await plan('Howe Sound Brewing in Lumby on Saturday')).requirementResults.some((r) => r.kind === 'venue' && r.value === brew.id), 'the brewery by its own name');
  // A named visit on a day she lists a daytime event starts at it (11 AM brunch jazz; 2 PM class on the first Saturday).
  const atEvent = async (q) => ((await plan(q)).schedule || []).find((r) => r.venueId === v.id);
  assert.equal((await atEvent('Afternoon at Howe Sound Spirits in Lumby on Saturday December 5')).startMinutes, 14 * 60);
  assert.equal((await atEvent('Howe Sound Spirits and lunch in Lumby on Sunday November 22')).startMinutes, 11 * 60);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8'), /nightMinutes\(n\.start\)<17\*60/);
});

test('7: kids dinner at 6 PM may be at her kitchen (minors until 8 PM), not at 8:30 PM; "drinks" with a dog includes her; French notes', async () => {
  const { v } = await sophie({}, { noHappy: true, name: 'Kids Kitchen Spirits Fixture', region: 'enderby' });
  const has = async (q) => itemsOf(await plan(q)).some((x) => x.venue.id === v.id);
  assert.equal(await has('Kids dinner in Enderby on Saturday November 21 at 6 PM'), true);
  assert.equal(await has('Kids dinner in Enderby on Saturday November 21 at 8:30 PM'), false);
  assert.equal(await has('Toddler day in Enderby on Saturday November 21'), false, 'not a family day out at a distillery');
  // Adults only: never.
  const adults = await sophie({}, { noHappy: true, name: 'Adults Only Spirits Fixture', region: 'enderby' });
  ok(await change(tokenFor(adults.v.id), { brewery_info: { minors: { policy: 'adults' } } }, true));
  assert.ok(!itemsOf(await plan('Kids dinner in Enderby on Saturday November 21 at 6 PM')).some((x) => x.venue.id === adults.v.id));
  // "Dog-friendly drinks": pubs, cocktail lounges and distilleries.
  const d = await plan('Dog-friendly drinks in Enderby on Sunday November 22');
  assert.ok(itemsOf(d).some((x) => x.venue.id === v.id), JSON.stringify(itemsOf(d).map((x) => x.venue.name)));
  // French notes, no English leaks.
  assert.equal(frCopy.t3FrenchText('Venues with live music'), 'Lieux avec musique en direct');
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /breakfast:'déjeuner'/); assert.match(v3, /'non inclus\. Essayez une autre date/);
});

// ====================== 8. Help ======================
test('8: help answers what Sophie asked (EN + FR)', async () => {
  const { t } = await sophie({}, { noHappy: true });
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  const want = [
    [['kids are welcome until 8 pm', 'no minors after 8'], ['enfants bienvenus jusqu’à 20 h'], 'distillery-kids'],
    [['our kitchen closes later in summer', 'two kitchen times'], ['la cuisine ferme plus tard l’été'], 'distillery-kitchen-two'],
    [['our tasting is $18 for three pours'], ['18 $ pour trois produits'], 'distillery-tasting-size'],
    [['we have a gift shop'], ['nous avons une boutique cadeaux'], 'distillery-gift-shop'],
    [['we do a sunday brunch'], ['nous servons un brunch le dimanche'], 'distillery-brunch'],
    [['our apres is only in winter'], ['mon après-ski seulement l’hiver'], 'hh-some-months'],
    [['gin workshop price and booking'], ['prix de l’atelier de gin et réservation'], 'distillery-workshop'],
    [['our parking is paid'], ['le stationnement est payant'], 'parking-paid'],
  ];
  for (const [qe, qf, id] of want) { for (const q of qe) assert.equal(en.best(q).id, id, `en: ${q}`); for (const q of qf) assert.equal(fr.best(q).id, id, `fr: ${q}`); }
  assert.match(bare(fr.topic('parking-paid').aFr), /^Stationnement payant ou dans la rue \? Laissez Stationnement gratuit décoché et écrivez-le sous Bon à savoir\./);
  assert.match(bare(en.topic('parking-paid').a), /^Paid or street parking\? Leave Free parking unticked and write it under Good to know\./);
  assert.match(bare(en.topic('hh-some-months').a), /each has its own All year \/ Only some months/);
  assert.match(bare(fr.topic('distillery-workshop').aFr), /« Atelier de fabrication de gin, 75 \$, sur réservation »/);
});

// ====================== 9. French words ======================
test('9: French agreement and counters: « Photos : envoyées », « Il reste 0 caractère », no empty days, « musique en direct », « VOTRE COMMERCE »', async () => {
  const r = pc.scoreCompleteness({ address: '1 Main St', latitude: 1, longitude: 1, phone: '250-555-0100', hasHours: true, hoursCheckedAt: today }, { today });
  const fr = (o) => bare(pc.renderCompleteness(r, { plainWaiting: true, fr: true, ...o }));
  assert.match(fr({ pendingPhotos: 2 }), /Photos : envoyées\. Nous les ajouterons d’ici un jour\./);
  assert.match(fr({ pendingFields: ['description'] }), /Votre histoire : envoyée\. Nous l’ajouterons d’ici un jour\./);
  assert.match(fr({ pendingFields: ['website'] }), /Site Web : envoyé\. Nous l’ajouterons d’ici un jour\./);
  assert.match(fr({ pendingPhotos: 1, pendingFields: ['website'] }), /Photos et site Web : envoyés\. Nous les ajouterons/);
  // The deal counter.
  const s = CLIENT();
  const room = (happy, T) => new Function('S', 'T', 'DAYS', 'dayName', 'fill', `${fnSrc(s, 'dayPrefix')}\n${fnSrc(s, 'rangePrefix')}\n${fnSrc(s, 'hhRoom')}\n${fnSrc(s, 'roomText')}\nreturn roomText;`)({ happy }, T, DAYS, (d) => d.charAt(0).toUpperCase() + d.slice(1), fill);
  const none = { days: {}, what: '' }, wk = { days: { sat: true, sun: true }, what: '' };
  assert.equal(room([none, wk], text.fr)(0, '').replace(/[  ]/g, ' '), 'Il reste 57 caractères (les jours s’ajoutent devant sur votre page)');
  assert.equal(room([{ days: { mon: true }, what: '' }], text.fr)(0, 'x'.repeat(60)), 'Il reste 0 caractère');
  assert.equal(room([{ days: { mon: true }, what: '' }], text.en)(0, 'x'.repeat(60)), '0 characters left');
  assert.match(room([none, wk], text.en)(1, ''), /\(the days, “Sat, Sun”, go in front on your page\)$/);
  // Over the room: the count shows it from the start (and Save says how much room there is, as before).
  assert.match(s, /'<p class="su-count' \+ \(hhRoom\(i\) - String\(e\.what \|\| ''\)\.trim\(\)\.length < 0 \? ' su-over' : ''\) \+ '" id="hwc' \+ i/);
  assert.match(fnSrc(s, 'happySave'), /if \(what && \(pre \+ what\)\.length > 60\) \{ S\.nudge = fill\(T\.dealLong/);
  assert.match(text.fr.seasonAllClosed, /^Fermé tout ce temps \?/);
  assert.doesNotMatch(SERVER(), /de la musique live/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-french-copy.js'), 'utf8'), /'live music':'de la musique en direct'/);
  const ap = fs.readFileSync(path.join(__dirname, '..', 'arrival-points.js'), 'utf8');
  assert.match(ap, /\.replace\('>YOUR BUSINESS<\/text>', '>VOTRE COMMERCE<\/text>'\)/); assert.match(ap, /\$\{L\(EXAMPLE, EXAMPLE_FR\)\}/);
});

// ====================== 10. English-only cuisine on French pages ======================
test('10: an English-only cuisine is put in French when known, else left off French pages (cards fall back to the kind of place)', async () => {
  assert.equal(app.frCuisineShown('Craft distillery & cocktail lounge'), 'Distillerie artisanale et bar à cocktails');
  assert.equal(app.frCuisineShown('Italian'), 'Italienne');
  assert.equal(app.frCuisineShown('Pizza'), 'Pizza');
  assert.equal(app.frCuisineShown('West Coast comfort food and craft beer'), null);
  const { v } = await sophie({}, { noHappy: true });
  const fr = plain(page(v, 'fr'));
  assert.match(fr, /Distillerie artisanale et bar à cocktails/); assert.doesNotMatch(fr, /Craft distillery/);
  assert.match(plain(page(v, 'en')), /Craft distillery & cocktail lounge/);
  const odd = mk('distillery', { name: 'Odd Cuisine Spirits Fixture', cuisine: 'Small-batch spirits and comfort food' });
  const ofr = page(odd, 'fr');
  assert.doesNotMatch(plain(ofr), /Small-batch spirits/);
  const cat = (await get('/fr/vernon/distilleries')).text;
  assert.doesNotMatch(cat, /Small-batch spirits and comfort food|Craft distillery &amp; cocktail lounge/);
  // The French category filters already say « 5 à 7 », as everywhere else on the French site.
  assert.doesNotMatch(plain(cat), /\bHappy hour\b/);
});

// ====================== 12, 14, 15 ======================
test('12: the Events row names every event with its days (« 3 événements : Quiz (mar.), … (1er sam.) »)', () => {
  const s = CLIENT();
  const line = (lang) => new Function('S', 'T', 'C', 'fill', 'DAYS', `${fnSrc(s, 'musicEventsLine')}\nreturn musicEventsLine();`)(
    { done: { music: 'live' }, nightsSaved: NIGHTS.map((x) => ({ ...x, frequency: x.frequency || 'weekly' })) }, text[lang],
    { lang, dayNames: lang === 'fr' ? { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' } : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' } }, fill, DAYS);
  assert.equal(line('fr').replace(/[  ]/g, ' '), '3 événements : Quiz (mar.), Brunch jazz (dim.), Atelier de fabrication de gin (1er sam.)');
  assert.equal(line('en'), '3 events: Trivia (Tue), Live music (Sun), Class (1st Sat)');
  assert.match(s, /\(s === 'music' && musicEventsLine\(\) \? ' · ' \+ h\(musicEventsLine\(\)\) : \(s === 'music' && musicOftenLine\(\)/);
});

test('14 + 15: a distillery’s hour chips have 10 AM and 11 PM (same count, no wrap); the first hours screen changes a stretch in one tap', () => {
  const s = CLIENT();
  assert.match(s, /if \(C\.distillery\) \{ BQ_OPEN = \['10:00', '12:00', '13:00', '14:00'\]; BQ_CLOSE = \['19:00', '20:00', '21:00', '22:00', '23:00'\]; \}/);
  assert.match(s, /var BQ_OPEN = \['11:00', '12:00', '14:00', '15:00'\], BQ_CLOSE = \['18:00', '20:00', '21:00', '22:00', '23:00'\];/, 'breweries keep theirs');
  assert.match(s, /big\('✎', T\.changeThem, '', true, 'go:hours:edit'\)[\s\S]{0,400}\+ storedSeas\(\)\.map\(function\(st\)\{ return big\('✎', fill\(T\.seaChange, st\), '', true, 'yearSeasonEdit:' \+ st\.i\); \}\)\.join\(''\) \+ noSetBtn\(\)/);
  assert.equal(text.fr.seaChange, 'Modifier mes heures du {a} au {b}');
});

test('11 + every type: an event named in the English setup with a price shows it on the English page; the setup types still load (EN + FR)', async () => {
  const v = mk('distillery'); const t = tokenFor(v.id);
  ok(await change(t, { weekly_nights: [{ days: ['sat'], kind: 'class', title: 'Gin workshop', detail: '$75, by booking', start: '14:00', frequency: 'monthly-1st' }] }));
  assert.match(plain(page(v, 'en', at('2026-12-05', '10:00'))), /Gin workshop 2 PM[\s\S]{0,80}\$75, by booking/);
  for (const type of ['pub', 'restaurant', 'cafe', 'winery', 'brewery', 'cocktail', 'distillery']) for (const fr of [false, true]) {
    const x = mk(type); const r = await get(`${fr ? '/fr' : ''}/owner/${tokenFor(x.id)}/setup`);
    assert.equal(r.status, 200, `${type} ${fr ? 'fr' : 'en'}`);
    assert.equal(cfgOf(r.text).lang, fr ? 'fr' : 'en');
  }
});
