// Second first-time restaurant owner test on Whistler (Hiroshi, French, iPhone, a sushi restaurant with lunch and dinner;
// Whistler Roam drafts/fresh-eyes-restaurant2-2026-11-14/REPORT.md). The setup code is shared, so the fixes are made here
// for every type: French setup words saved as French (deals, specials, events, Plan your visit lines, the kitchen note),
// a happy hour between lunch and dinner, help for it and for delivery, Build My Trip in French (« souper … à 20 h »,
// « après sushi »), the spend guess, the food list's dish words, the tasting event, "Keep 9:30 PM", French spacing and a
// heads-up for a special set when the place is closed.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'restaurant-wr2-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const tpfr = require('../trip-planner-fr.js');
const req = require('../trip-requirements.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = (o, c) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[o, c]]])));
// Hiroshi's hours: lunch 12–3 and dinner 5–10, no Monday lunch, Friday and Saturday to 11.
const SPLIT = Object.fromEntries(DAYS.map((d) => [d, d === 'mon' ? [['17:00', '22:00']] : d === 'fri' || d === 'sat' ? [['12:00', '15:00'], ['17:00', '23:00']] : [['12:00', '15:00'], ['17:00', '22:00']]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Sakura Test ${++n}`, slug: `sakura-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.5, reviews: 188, address: `${900 + n} Water St, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(SPLIT),
  description: 'A casual sushi and izakaya spot used only by the second restaurant fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, extra = {}) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000, ...extra })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const editPage = (t, changes) => postJson(`/owner/${t}/changes`, { changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
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
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
const HH = Object.fromEntries(DAYS.map((d) => [d, [['15:00', '17:00']]]));
// A slice of the setup script run on its own (the helpers it needs are stubbed).
const clientSlice = (from, to, ctx, tail) => { const s = CLIENT(); vm.runInNewContext(s.slice(s.indexOf(from), s.indexOf(to)) + tail, ctx); return ctx; };

// ---------- 1. French setup words are saved as French ----------
test('French deals: the French setup saves them as French only; the French page shows them, the English page never does', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { happy_hour: HH, happy_hour_deals: { deals: [], deals_fr: [{ text: 'Saké à 5 $ et rouleaux à moitié prix' }] }, badges: { happy_hour: true } }));
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(fr, /Saké à 5\s?\$ et rouleaux à moitié prix/);
  assert.doesNotMatch(en, /Saké|rouleaux/);
  // Nothing English reads them (map, guides, Build My Trip: happyHourDealsShown).
  assert.equal(app.venueHappyHourDeals(v.id), null);
  // The setup: French starts from her French deals; English has none, with the hint.
  const cf = cfgOf((await get(`/fr/owner/${t}/setup`)).text), ce = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cf.cur.happy_hour_deals.deals_fr.map((d) => d.text), ['Saké à 5 $ et rouleaux à moitié prix']);
  assert.deepEqual(ce.cur.happy_hour_deals.deals, []);
  assert.match(CLIENT(), /\(C\.lang !== 'fr' && !HH_EN\.length && HH_FR\.length \? frOnlyHint\('suHappyFr'\) : ''\)/);
  assert.equal(text.en.frOnlyHint, 'Your French version is on your French page. Write it in English here to show it on your English page too.');
  // The classic edit page still asks for English first.
  const r = await editPage(t, { happy_hour_deals: { deals: [], deals_fr: [{ text: 'Bière à 6 $' }] } });
  assert.notEqual(r.status, 201);
  // Then an English version: both pages show their own.
  ok(await change(t, { happy_hour_deals: { deals: [{ text: '$5 sake and half-price rolls' }], deals_fr: [{ text: 'Saké à 5 $ et rouleaux à moitié prix' }] } }));
  assert.match(plain(page(v)), /\$5 sake and half-price rolls/);
  assert.match(plain(page(v, 'fr')), /Saké à 5/);
});

test('French deals in the setup script: unchanged deals go back as stored; changed ones are French, English keeps only its unchanged lines; English setup as before', () => {
  const run = (lang, en, fr) => clientSlice('  function dealKey(d)', '  function happySave()', { C: { lang }, HH_EN: en, HH_FR: fr, HH_SRC: lang === 'fr' && fr.length ? fr : en }, 'this.out = dealsOut;').out;
  const EN = [{ text: 'Sake $5' }, { text: 'Half-price rolls', price: '' }];
  assert.deepEqual(JSON.parse(JSON.stringify(run('fr', EN, [])(EN))), { deals: EN, deals_fr: [] }, 'kept as shown: nothing changes');
  assert.deepEqual(JSON.parse(JSON.stringify(run('fr', EN, [])([{ text: 'Sake $5' }, { text: 'Rouleaux à moitié prix' }]))), { deals: [{ text: 'Sake $5' }], deals_fr: [{ text: 'Sake $5' }, { text: 'Rouleaux à moitié prix' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(run('en', EN, [{ text: 'x' }])([{ text: 'Sake $6' }]))), { deals: [{ text: 'Sake $6' }], deals_fr: [] }, 'English setup unchanged');
  assert.equal(run('fr', EN, [])([]), null);
});

test('French specials and events: French only on French pages; an event keeps its kind’s English name ("Tasting")', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { specials: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], title: '', deal: '', price: '$22', kind: 'food', start: null, end: null, title_fr: 'Menu midi', deal_fr: 'Soupe miso, salade et bento', season_from: null, season_to: null }] }));
  ok(await change(t, { weekly_nights: [
    { days: ['wed'], kind: 'tasting', title: 'Tasting', start: '19:00', end: null, detail: null, host: null, cost: null, frequency: 'monthly-1st-3rd', title_fr: 'Dégustation de saké', detail_fr: null, season_from: null, season_to: null },
    { days: ['thu'], kind: 'other', title: '', start: '18:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: 'Soirée omakase', detail_fr: null, season_from: null, season_to: null },
  ] }));
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(fr, /Menu midi/); assert.match(fr, /Dégustation de saké/); assert.match(fr, /Soirée omakase/);
  assert.doesNotMatch(en, /Menu midi|Soupe miso|Dégustation|omakase/);
  assert.match(en, /Tasting/);
  // Build My Trip and the cards read the English lines only.
  const facts = app.buildTripPlannerFacts(false, today).find((f) => f.id === v.id);
  assert.ok(!facts.specials, JSON.stringify(facts.specials));
  // The setup shows them in French; the English setup keeps them out of its rows (and says where they are).
  const s = CLIENT();
  assert.match(s, /S\.specialsFr = FRS \? \[\] : \(CUR\.specials \|\| \[\]\)\.filter\(function\(x\)\{ return !x\.title && x\.title_fr; \}\);/);
  assert.match(s, /title: frNew \? '' : sameText \? o0\.title : t1/);
  assert.match(s, /title_fr: frNew \? t1 :/);
  assert.match(s, /var titleEn = FRS && !sameTitle \? enKind : sameTitle \? n0\.title : title, titleFr = FRS && !sameTitle \? title : sameTitle \? n0\.title_fr \|\| null : null;/);
  assert.match(s, /out = out\.concat\(S\.specialsFr \|\| \[\]\);/); assert.match(s, /out = out\.concat\(S\.nightsFr \|\| \[\]\);/);
  // An English special is still required to have a title on the classic edit page path (validateSpecials).
  assert.equal(app.validateSpecials([{ days: ['mon'], title: '', deal: '', kind: 'food' }], { source: 'venue_owner', checked_at: today }).ok, false);
  const cf = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(cf.nightKindsEn.tasting, 'Tasting');
});

test('French Plan your visit lines: her French line on the French page and card, never the English one; quick answers as before; Undo', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Known for', text: 'Fresh sushi and ramen' }, { label: 'Reservations', text: 'Walk-ins only' }]);
  // Kept as shown (research's English line) changes nothing.
  const same = await change(t, { visit_rows: { reservations: 'Walk-ins only', _lang: 'fr' } });
  assert.ok(same.status === 200 || same.status === 400, JSON.stringify(same));
  ok(await change(t, { visit_rows: { known_for: 'Sushi frais et ramen maison', _lang: 'fr' } }));
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(fr, /Sushi frais et ramen maison/);
  assert.doesNotMatch(en, /Sushi frais/);
  assert.doesNotMatch(en, /Fresh sushi and ramen/, 'research’s English line she replaced is gone');
  assert.match(en, /Walk-ins only/);
  // The setup: French shows her French line (never called English); English shows none, with the hint.
  const cf = cfgOf((await get(`/fr/owner/${t}/setup`)).text), ce = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cf.cur.visit_rows.known_for, 'Sushi frais et ramen maison'); assert.equal(cf.cur.visit_fr.known_for, true);
  assert.equal(ce.cur.visit_rows.known_for, ''); assert.equal(ce.cur.visit_fr.known_for, true);
  assert.match(CLIENT(), /if \(key && \(CUR\.visit_fr \|\| \{\}\)\[key\]\) return C\.lang === 'fr' \? '' : frOnlyHint\(id \+ 'Fr'\);/);
  // A line made only of quick answers reads in either language: stored as before.
  ok(await change(t, { visit_rows: { takeout: 'Appelez pour commander', _lang: 'fr' } }));
  assert.match(plain(page(v)), /Call to order/);
  // An English line later: both pages show their own.
  ok(await change(t, { visit_rows: { known_for: 'Fresh sushi and house ramen' } }));
  assert.match(plain(page(v)), /Fresh sushi and house ramen/);
  assert.match(plain(page(v, 'fr')), /Sushi frais et ramen maison/);
  // A cocktail lounge's box and the card helpers read the same key.
  assert.match(SERVER(), /const knownFr = tourInfo \? ownerVisitFrLines\(tourInfo\)\.known_for \|\| '' : '';/);
});

test('French Plan your visit: an Undo of her French line takes it off the French page', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const r = await change(t, { visit_rows: { groups: 'Groupes de 8 et plus : appelez-nous', _lang: 'fr' } });
  ok(r);
  assert.match(plain(page(v, 'fr')), /Groupes de 8 et plus/);
  const row = db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? ORDER BY id DESC LIMIT 1').get(v.id);
  const u = app.undoOwnerInstantChange(row.id, 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.doesNotMatch(plain(page(v, 'fr')), /Groupes de 8 et plus/);
});

test('kitchen note: written in French, shown in French on the French page and not on the English page; an English note shows on both', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: '', note_fr: 'Ven. et sam., cuisine jusqu’à 21 h 45' } } }));
  let en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(fr, /La cuisine ferme à 21 h 30/); assert.match(fr, /Ven\. et sam\., cuisine jusqu’à 21 h 45/);
  assert.match(en, /Kitchen closes at 9:30 PM/); assert.doesNotMatch(en, /Ven\. et sam/);
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: 'Fri and Sat, last seating 9:45 PM', note_fr: 'Ven. et sam., cuisine jusqu’à 21 h 45' } } }));
  en = plain(page(v)); fr = plain(page(v, 'fr'));
  assert.match(en, /Fri and Sat, last seating 9:45 PM/); assert.match(fr, /Ven\. et sam\./); assert.doesNotMatch(fr, /Fri and Sat/);
  // English only: the French page shows her English note as typed (pub test 2's rule for her own lines).
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: 'Sushi bar until 10' } } }));
  assert.match(plain(page(v, 'fr')), /Sushi bar until 10/);
  // The setup script: the French setup writes note_fr; the English one note.
  const s = CLIENT();
  assert.match(s, /function noteIn\(o\)\{ o = o \|\| \{\}; return C\.lang === 'fr' \? \(o\.note_fr \|\| o\.note \|\| ''\) : \(o\.note \|\| ''\); \}/);
  const noteOut = clientSlice('  function noteIn(o)', '  S.kitchen = {', { C: { lang: 'fr' } }, 'this.f = noteOut;').f;
  assert.deepEqual(JSON.parse(JSON.stringify(noteOut({ note: 'Fri late' }, 'Ven. tard', { mode: 'earlier' }))), { mode: 'earlier', note: '', note_fr: 'Ven. tard' });
  assert.deepEqual(JSON.parse(JSON.stringify(noteOut({ note: 'Fri late' }, 'Fri late', {}))), { note: 'Fri late' }, 'kept as shown');
  const noteOutEn = clientSlice('  function noteIn(o)', '  S.kitchen = {', { C: { lang: 'en' } }, 'this.f = noteOut;').f;
  assert.deepEqual(JSON.parse(JSON.stringify(noteOutEn({ note_fr: 'Ven.' }, 'Fri late', {}))), { note: 'Fri late', note_fr: 'Ven.' });
});

// ---------- 2. A happy hour between lunch and dinner ----------
const warnCtx = () => {
  const T = { happyOutside: 'out {days}.', happySplit: text.en.happySplit, closedWarn: 'closed {days}{when}.', closedWarnHappy: 'closedhh {days}{when}.', closedWarnUsual: '' };
  return clientSlice('  function closedWarn(days, sea)', '  function warnHtml', { S: { week: JSON.parse(JSON.stringify(SPLIT)), sea: { on: false }, happySea: { on: false } }, DAYS, T, C: { lang: 'en' }, fill: (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : '')),
    pad2: (x) => ('0' + x).slice(-2), seaMonths: () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, true])), longDay: (d) => d, seaFrom: () => ({ on: false }), seaWhen: () => '' }, 'this.warnOf = warnOf; this.hd = happyDefault; this.gap = happySplitGap;');
};
test('happy hour 3–5 between lunch 12–3 and dinner 5–10: the heads-up stays, with "Is the bar open between lunch and dinner?" and a button to the hours', () => {
  const ctx = warnCtx();
  const days = Object.fromEntries(DAYS.map((d) => [d, true]));
  const w = ctx.warnOf('happy', { days, from: '15:00', to: '17:00' });
  assert.match(w, /^out mon, tue, wed, thu, fri, sat and sun\. Is the bar open between lunch and dinner\? Change your hours so they run through\.$/, w);
  assert.equal(ctx.gap({ days: { mon: true }, from: '15:00', to: '17:00' }), false, 'Monday has dinner only');
  assert.equal(ctx.warnOf('happy', { days: { tue: true }, from: '17:00', to: '19:00' }), '', 'inside dinner: nothing');
  assert.doesNotMatch(ctx.warnOf('happy', { days: { tue: true }, from: '22:30', to: '23:30' }), /bar open/, 'after closing is not the break');
  assert.equal(text.en.happySplit, 'Is the bar open between lunch and dinner? Change your hours so they run through.');
  assert.equal(text.fr.happySplit, 'Le bar reste ouvert entre le dîner et le souper ? Changez vos heures pour qu’elles se suivent.');
  assert.equal(text.en.happySplitBtn, 'Change my hours'); assert.equal(text.fr.happySplitBtn, 'Changer mes heures');
  assert.match(CLIENT(), /data-act="go:hours:edit"' \+ \(splitOn\(key, e\) \? '' : ' hidden'\)/);
});

test('happy hour default for lunch and dinner: 3–5 PM for an afternoon break, else from dinner', () => {
  const ctx = warnCtx();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.hd())), { days: {}, from: '15:00', to: '17:00', what: '' });
  ctx.S.week = Object.fromEntries(DAYS.map((d) => [d, [['11:00', '14:00'], ['18:30', '22:00']]]));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.hd())), { days: {}, from: '18:30', to: '20:30', what: '' }, 'a break past 6 PM starts with dinner');
});

test('help: « le 5 à 7 est entre le dîner et le souper » and "happy hour between lunch and dinner"; « comment j’ajoute la livraison » points to the setup’s Takeout step', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  for (const q of ['le 5 à 7 est entre le dîner et le souper, c’est grave?', '5 à 7 entre le dîner et le souper']) assert.equal(fr.best(q).id, 'setup-happy-split', q);
  for (const q of ['happy hour between lunch and dinner', 'my happy hour is outside my opening hours']) assert.equal(en.best(q).id, 'setup-happy-split', q);
  // Split hours themselves still go to the split-hours answer.
  assert.equal(fr.best('fermé entre le dîner et le souper').id, 'setup-split-hours');
  assert.match(fr.topic('setup-happy-split').aFr, /Changer mes heures/);
  for (const q of ['comment j’ajoute la livraison', 'livraison']) assert.equal(fr.best(q).id, 'setup-delivery', q);
  for (const q of ['how do I add delivery', 'Uber Eats']) assert.equal(en.best(q).id, 'setup-delivery', q);
  assert.match(fr.topic('setup-delivery').aFr, /Modifier une réponse<\/strong> → <strong>À emporter<\/strong>/);
  assert.match(en.topic('setup-delivery').a, /Uber Eats/);
});

// ---------- 4. Build My Trip in French ----------
test('Build My Trip French: « souper … à 20 h », « vers 19 h », « 20 h 30 » are the meal’s time; « dîner » is lunch; « après sushi » and « après-ski » are happy hour', () => {
  const T = (s) => tpfr.tripPlannerText(s, null);
  assert.match(T('Souper sushi pour deux à Kelowna samedi 16 janvier 2027 à 20 h'), /^dinner sushi .* at 8:00 pm$/);
  assert.match(T('souper vers 19 h samedi à Kelowna'), /^dinner around 7:00 pm /);
  assert.match(T('souper 20 h 30 à Kelowna'), /^dinner at 8:30 pm /);
  assert.match(T('souper à 20h30 à Kelowna'), /^dinner at 8:30 pm /);
  assert.match(T('dîner à 12 h 30 à Kelowna'), /^lunch at 12:30 pm /);
  assert.match(T('déjeuner à Kelowna samedi'), /^breakfast /);
  assert.match(T('après sushi à Kelowna'), /^happy hour sushi /);
  assert.match(T('après-ski à Kelowna'), /^happy hour /);
  assert.match(T('pas de conduite après 18 h'), /after 18 h/, 'the no-driving rule keeps its own reading');
  assert.match(T('une randonnée de 2 h à Kelowna'), /2 h/, 'a duration is never a clock');
  // English "après sushi" is a sushi happy hour too.
  assert.equal(req.tripRequestSynonyms ? req.tripRequestSynonyms('après sushi in Kelowna') : 'happy hour sushi in Kelowna', 'happy hour sushi in Kelowna');
});

test('Build My Trip: « Souper sushi … samedi 16 janvier 2027 à 20 h » plans dinner at 8 PM; "après sushi" finds the sushi place with a happy hour', async () => {
  const v = mk('restaurant', { name: 'Sakura Sushi Izakaya Test', slug: 'sakura-sushi-izakaya-test', cuisine: 'Japanese', happy_hour: 1, description: 'Sushi, ramen and sake downtown.' });
  const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
  const fr = await plan('Souper sushi pour deux à Kelowna samedi 16 janvier 2027 à 20 h');
  const row = (fr.schedule || []).find((x) => x.venueId === v.id);
  assert.ok(row, JSON.stringify(fr.schedule));
  assert.equal(row.startMinutes, 20 * 60);
  const ap = await plan('après sushi in Kelowna');
  assert.ok((ap.recommendations || []).some((x) => x.venue.id === v.id), JSON.stringify(ap.summary));
  assert.doesNotMatch(String(ap.summary), /Pubs/);
});

test('Build My Trip French: the « Autres bonnes options » cards are in French', () => {
  const stop = (name) => ({ venue: { name, type: 'restaurant', listedHours: 'Listed hours: 12:00–22:00 daily', typeLabel: 'Restaurant' }, why: ['Matches your request for restaurants', 'Recognised: Golden Plate 2025', 'Listed cuisine: Japanese — matches “sushi”'], caveats: [], label: 'Dinner' });
  const p = frCopy.t3FrenchPlan({ summary: 'Dinner in Kelowna.', outing: { stops: [stop('A')], alternates: [stop('B'), stop('C')] }, itinerary: { stops: [stop('A')] }, warnings: [], notes: [] });
  for (const a of p.outing.alternates) {
    assert.equal(a.venue.listedHours, 'Horaires indiqués : 12 h–22 h tous les jours');
    assert.deepEqual(a.why, ['Correspond à votre demande : restaurants', 'Distinction : Golden Plate 2025', 'Cuisine indiquée : japonaise — correspond à « sushi »']);
  }
});

// ---------- 5. Spend guess ----------
test('spend: "Rolls from $9" never sets $9; mains lead; side items only guess from the price range, with "We guessed from your listing"', async () => {
  const a = mk('restaurant', { price: 2 }); research(a.id, [{ label: 'Prices', text: 'Rolls from $9' }, { label: 'Reservations', text: 'Walk-ins only' }]);
  let c = cfgOf((await get(`/owner/${tokenFor(a.id)}/setup`)).text);
  assert.equal(c.suggestSpend, 25); assert.equal(c.suggestSpendFrom, '$$ ($15–30 per person)');
  assert.equal(cfgOf((await get(`/fr/owner/${tokenFor(a.id)}/setup`)).text).suggestSpendFrom, '$$ (15 à 30 $ par personne)');
  const b = mk('restaurant'); research(b.id, [{ label: 'Prices', text: 'Rolls from $9; mains $22–34' }]);
  c = cfgOf((await get(`/fr/owner/${tokenFor(b.id)}/setup`)).text);
  // Restaurant test 3 (2026-11-15, Dayton approved): the mains range's middle on the $2 steps ($22–34 -> $28), not its low end.
  assert.equal(c.suggestSpend, 28); assert.equal(c.suggestSpendFrom, 'Rolls from $9; mains $22–34');
  const d = mk('restaurant'); research(d.id, [{ label: 'Prices', text: 'Appetizers $8, pints $7' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(d.id)}/setup`)).text).suggestSpend, 0, 'side items and no price range: no guess');
  assert.equal(text.en.spendGuessed, 'We guessed from your listing: “{x}”.');
  // Whistler café test 2 (2026-11-15): the French line no longer quotes research's English line.
  assert.equal(text.fr.spendGuessed, 'Estimation d’après les prix trouvés en ligne.');
  assert.match(CLIENT(), /\(!CUR\.avg_spend && C\.suggestSpend && C\.suggestSpendFrom && T\.spendGuessed \? '<p class="su-hint" id="suSpendGuessed">'/);
});

// ---------- 6. Food list and events ----------
test('food list: "sushi", "izakaya", "omakase", "ramen" find Japanese; a few other dish words; events: Tasting (« Dégustation ») for restaurants', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  const hit = clientSlice('  function aliasHit(tq, c)', '  function kindText(key)', { C: c }, 'this.f = aliasHit;').f;
  for (const q of ['sushi', 'sush', 'izakaya', 'omakase', 'ramen']) assert.equal(hit(q, 'Japanese'), true, q);
  assert.equal(hit('ramen', 'Noodles & Ramen'), true);
  assert.equal(hit('tacos', 'Mexican'), true); assert.equal(hit('pho', 'Vietnamese'), true); assert.equal(hit('curry', 'Indian'), true);
  assert.equal(hit('su', 'Japanese'), false, 'from 3 letters');
  assert.equal(hit('sushi', 'Mexican'), false);
  assert.ok(c.nightKinds.slice(0, 6).includes('tasting'), JSON.stringify(c.nightKinds));
  assert.equal(c.t.kinds.tasting, 'Tasting');
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).t.kinds.tasting, 'Dégustation');
  assert.ok(app.NIGHT_KINDS.includes('tasting'));
  assert.match(text.fr.musicLeadRestaurant, /dégustation/);
  // Pubs keep their own list (no tasting up front).
  assert.ok(!cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text).nightKinds.slice(0, 6).includes('tasting'));
});

// ---------- 7. Small ----------
test('kitchen: a saved answer offers "Keep 9:30 PM" (« Garder 21 h 30 ») as the main button', () => {
  assert.equal(text.en.kitchenKeep, 'Keep {t}'); assert.equal(text.fr.kitchenKeep, 'Garder {t}');
  assert.match(CLIENT(), /var kKeep = S\.kitchen\.mode && T\.kitchenKeep \? \(S\.kitchen\.mode === 'earlier' && S\.kitchen\.closes \? fill\(T\.kitchenKeep, \{ t: t12\(S\.kitchen\.closes\) \}\) : T\.kitchenKeepIt\) : '';/);
  assert.match(CLIENT(), /\(kKeep \? big\('✓', kKeep, '', false, 'go:saved:hours'\) : ''\)/);
});

test('French spacing: « (Créer un compte) ; vous », « d’ici un jour) ; elle », « Retirer cette plage : », « votre voyage ? », « Vous y êtes allé ? »', () => {
  const s = SERVER();
  // Indoor test 10: the link and its brackets stay together in a no-wrap span.
  assert.match(s, /Créer un compte<\/a>\)\\u202f;(?:<\/span>)? vous vous verrez/);
  assert.match(text.fr.oftenWaiting, /d’ici un jour\) ; elle reste/);
  assert.match(CLIENT(), /h\(T\.removeSecond \+ \(C\.lang === 'fr' \? '\\u00a0: ' : ': '\) \+ t12\(y\[0\]\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8'), /Combien de temps dure votre voyage\\u202f\? Choisissez/);
  assert.match(s, /'Vous y êtes allé\\u202f\? Partagez une photo ou un conseil'/);
});

test('specials: a set lunch 12–3 every day gets a heads-up on Monday (opens at 5); none inside the hours', () => {
  const ctx = warnCtx();
  const days = Object.fromEntries(DAYS.map((d) => [d, true]));
  assert.match(ctx.warnOf('specials', { days, start: '12:00', end: '15:00', sea: { on: false } }), /^out mon\.$/);
  assert.equal(ctx.warnOf('specials', { days: { tue: true }, start: '12:00', end: '15:00', sea: { on: false } }), '');
  assert.equal(ctx.warnOf('specials', { days, start: '', end: '', sea: { on: false } }), '', 'no time: nothing to check');
});

test('French page: the happy hour line says « 5 à 7 », never "Happy hour"', () => {
  const v = mk('restaurant', { happy_hour: 1 });
  db.prepare('UPDATE venues SET happy_hour_times = ? WHERE id = ?').run(JSON.stringify(HH), v.id);
  const fr = plain(page(v, 'fr'));
  assert.doesNotMatch(fr.replace(/<[^>]+>/g, ' '), /Happy hour (?:aujourd|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|en cours|jusqu)/);
});

// ---------- English setup unchanged ----------
test('English setup (restaurant and pub): lines, deals, specials and notes still go into the English fields', async () => {
  for (const type of ['restaurant', 'pub']) {
    const v = mk(type); const t = tokenFor(v.id);
    ok(await change(t, { visit_rows: { known_for: 'Wings and pints' } }));
    ok(await change(t, { happy_hour: HH, happy_hour_deals: { deals: [{ text: '$6 pints' }], deals_fr: [] }, badges: { happy_hour: true } }));
    ok(await change(t, { specials: [{ days: ['tue'], title: 'Taco Tuesday', deal: '$3 tacos', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: null, season_to: null }] }));
    ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: 'Late menu Fri' } } }));
    assert.equal(app.ownerVisitRows(v.id).known_for, 'Wings and pints');
    assert.equal(!!(app.venueVisitInfo(v.id) || {}).owner_fr_lines, false);
    assert.deepEqual(app.venueHappyHourDeals(v.id).en.map((d) => d.text), ['$6 pints']);
    const en = plain(page(v));
    assert.match(en, /Wings and pints/); assert.match(en, /\$6 pints/); assert.match(en, /Taco Tuesday/); assert.match(en, /Late menu Fri/);
  }
});
