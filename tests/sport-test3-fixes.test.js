// Sport test 3 fixes (2026-11-20; Gord, family-run driving range and mini golf in Kelowna: setup 7.5, overwhelm 8.0, whole
// thing 6.0; drafts/fresh-eyes-sport3-2026-11-20/REPORT.md). The root fix: every word and rule a golf or sport listing
// shows reads the owner's MAIN kind (server.js sportMainKind), never the listing type. Then Build My Trip's mini golf and
// driving range kinds, the happy hour bar words and "No", the part-seasonal line read from the owner's own words, Help for
// his log, the Groups research sentence, a chip then typing, a month or holiday in search, the French Practice row and the
// booking button. Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test3-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const SK = require('../sport-kinds.js');
const IK = require('../indoor-kinds.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c, days = DAYS) => Object.fromEntries(DAYS.map((d) => [d, days.includes(d) ? [[o, c]] : []]));
let n = 0, ipN = 0, srv, base;
const mk = (type, o = {}) => app.createVenue({ name: `Sport Three Fixture ${++n}`, slug: `sport-three-fixture-${n}`, region: 'kelowna', type, latitude: 49.85 + n / 3000, longitude: -119.47,
  rating: 4.4, reviews: 90, address: `${800 + n} Casorso Rd, Kelowna`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(WK('10:00', '18:00')), description: 'A fixture for sport test 3.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.123.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status === 201 ? 200 : r.status, body: await r.json().catch(() => ({})) }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const NOV = new Date('2026-11-20T12:00:00-08:00');
const html = (v, lang = 'en', now = NOV) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const page = (v, lang = 'en', now = NOV) => plain(html(v, lang, now));
const cfgOf = (h) => JSON.parse(/window\.SETUP_CFG = (\{[\s\S]*?\});<\/script>/.exec(h)[1].replace(/\\u003c/g, '<'));
const visit = (id, rows, extra = {}) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(id, JSON.stringify({ rows, source_url: 'https://example.com/', checked_at: '2026-11-01', ...extra }));
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: sections.map(([name, items]) => ({ name, note: '', items: items.map(([nm, price, d = '']) => ({ name: nm, description: d, price: String(price), dietary: [], check: false })) })) }));
const PLAN = (text, now = NOV) => app.runTripPlan({ text }, now);
const inPlan = (p, name) => JSON.stringify([p.recommendations, p.itinerary, p.days, p.outing]).includes(name);

// Gord's research rows (the live Kelowna Driving Range & Mini Golf page, Nov 20).
const GORD_ROWS = [
  { label: 'Known for', text: 'Range since 1991: 16 covered Toptracer bays, 18-hole championship mini golf, indoor Trackman 4 sim.' },
  { label: 'Booking', text: 'Walk-ins welcome. Outdoor Toptracer is walk-in only in winter; the indoor Trackman can be booked online.' },
  { label: 'Winter', text: 'The indoor Trackman 4 simulator keeps the facility open all year; 2027 range and mini golf prices are not posted yet.' },
  { label: 'Practice', text: '300-yard range with 16 covered Toptracer stalls and 6 teaching stalls; winter bucket (68 balls) is $16.' },
  { label: 'Good to know', text: 'Open to the public; 18 holes of championship mini golf on site.' },
  { label: 'Groups', text: 'Lessons with golf pro Steve Lawrence, plus a pro shop with full sets, junior sets and regripping.' }];
const GORD_DESC = 'Kelowna’s most complete practice facility and a fun night out: a 300-plus-yard grass range with 16 covered Toptracer stalls that track every shot. There’s also a 4,700 sq ft bent-grass putting green, a short-game chipping area and an 18-hole championship mini-golf course for the whole family.';
const GORD_GTK = 'Open to the public; 18 holes of championship mini golf on site. Covered stalls. Lessons available. Lit for evening play. Leashed dogs welcome on the range, not on the mini golf. Snack bar with pop, coffee and ice cream. Cash or debit only. Gift cards at the counter. Mini golf April to mid-October.';
const GORD_PRICES = [['Driving range', [['Small bucket (35 balls)', 10], ['Medium bucket (70 balls)', 16], ['Large bucket (110 balls)', 22]]],
  ['Mini golf', [['Adults', 11, '18 holes, putter and ball included'], ['Kids 12 and under', 8], ['Family (2 adults, 2 kids)', 34], ['Kids under 5', 'Free', 'With a paying adult']]],
  ['Lessons and more', [['Lesson with our pro, 30 min', 60, 'Book by phone'], ['Indoor Trackman simulator, 1 hour', 50, 'Book online, up to 4 players'], ['Range clubs to borrow', 'Free']]]];
// Gord's place as he left it: range first, simulator second, open all year, his own Good to know with the mini golf season.
async function gord(o = {}, { kinds = ['range', 'simgolf'], gtk = GORD_GTK, prices = true, rows = GORD_ROWS } = {}) {
  const v = mk('golf', { name: `Kelowna Driving Range & Mini Golf Fixture ${n + 1}`, description: GORD_DESC, description_fr: 'L’installation d’entraînement la plus complète de Kelowna : un champ de pratique sur gazon et un parcours de mini-golf de 18 trous pour toute la famille.', kid_friendly: 1, hours: JSON.stringify({ ...WK('10:00', '18:00'), sun: [['10:00', '16:00']] }), ...o });
  visit(v.id, rows, { booking_url: 'https://alleytrak.com/app/client/4370-5153' });
  db.prepare("INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url").run(v.id, 'https://alleytrak.com/app/client/4370-5153');
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds, length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 10 }));
  if (gtk) ok(await change(t, { visit_rows: { good_to_know: gtk } }));
  ok(await change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }, { from: '2026-12-26', to: '2026-12-26', note: 'Boxing Day' }, { from: '2027-01-01', to: '2027-01-01', note: 'New Year’s Day' }, { from: '2027-12-25', to: '2027-12-25', note: 'Christmas Day' }] }));
  if (prices) publish(v.id, GORD_PRICES);
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t };
}


const noHit = (re, text, where = '') => { const m = new RegExp(re.source, re.flags.replace('g', '')).exec(String(text)); assert.ok(!m, m ? `${where}: "${m[0]}" in …${String(text).slice(Math.max(0, m.index - 120), m.index + 80)}…` : ''); };
const NO_GOLF_COURSE = /green fees?|tee[- ]?times?|droits? de jeu|tarifs de golf|golf course in|from the course|selon le terrain|heures? de départ|book a tee time|réserver un départ|like 18 holes|ex\. 18 trous|golf courses? (?:à|in) kelowna/i;

test('1. Gord\'s range: the price list editor, his page, the prices page and the admin email speak his kind (EN + FR), never "Green fees"', async () => {
  const { v, t } = await gord();
  assert.equal(app.sportMainKind(app.getVenue(v.id)), 'range');
  // The editor (the setup's "Type them in myself" screen and the full editor).
  for (const lang of ['en', 'fr']) {
    const ed = await getText(`${lang === 'fr' ? '/fr' : ''}/owner/${t}/menu`);
    const cfg = JSON.parse(/window\.MENU_CFG = (\{[\s\S]*?\});<\/script>/.exec(ed)[1].replace(/\\u003c/g, '<'));
    const words = JSON.stringify(cfg.t);
    noHit(NO_GOLF_COURSE, words, `${lang} editor`);
    assert.equal(cfg.t.firstSection, lang === 'fr' ? 'Tarifs' : 'Prices');
    assert.match(cfg.t.namePh, lang === 'fr' ? /Petit seau, ou Mini-golf/ : /Small bucket, or Mini golf/);
    assert.match(cfg.t.pricePh, /12/);
    assert.match(cfg.t.sent, lang === 'fr' ? /Vos tarifs sont en route/ : /Your prices (?:&amp;|&) rates are on their way/);
  }
  const en = page(v), fr = page(v, 'fr');
  noHit(NO_GOLF_COURSE, en, 'en page'); noHit(NO_GOLF_COURSE, fr, 'fr page');
  assert.match(en, /Prices & rates/); assert.match(en, /See all prices & rates \(10 prices\)/);
  assert.match(fr, /Tarifs/);
  const href = /href="([^"]+\/prices)"/.exec(html(v))[1];
  const pp = plain(await getText(href)), ppf = plain(await getText(`/fr${href}`));
  assert.match(pp, /Driving range & mini golf in Kelowna, BC/); assert.match(pp, /Prices & Rates/);
  noHit(NO_GOLF_COURSE, pp, 'prices page'); noHit(NO_GOLF_COURSE, ppf, 'fr prices page');
  assert.match(ppf, /Champ de pratique et mini-golf à Kelowna/);
  // The checklist's words are his kind's.
  assert.equal(app.priceListWordsFor(app.getVenue(v.id)).en.noun, 'Prices & rates');
  noHit(NO_GOLF_COURSE, plain(await getText(`/owner/${t}`)), 'portal home');
  noHit(NO_GOLF_COURSE, plain(await getText(`/fr/owner/${t}`)), 'fr portal home');
  assert.match(plain(await getText(`/owner/${t}`)), /Your range or mini golf, and people playing/);
  // A golf course keeps its green fees.
  const course = mk('golf', { name: 'Green Fee Course Fixture', description: 'An 18-hole public course.' });
  assert.equal(app.priceListWordsFor(app.getVenue(course.id)).en.noun, 'Green fees & rates');
  // A sport listing whose owner picked ski lessons says lessons.
  const ski = mk('sport', { name: 'Ski Lessons Fixture' }); ok(await change(tokenFor(ski.id), { indoor_info: { kinds: ['skischool'] } }));
  assert.equal(app.priceListWordsFor(app.getVenue(ski.id)).en.noun, 'Lessons & rates');
});

test('2. Build My Trip plans the range for mini golf and the driving range (EN + FR), never golf courses; off season, holidays and his own season', async () => {
  const { v } = await gord();
  const name = app.getVenue(v.id).name;
  const course = mk('golf', { name: 'Trip Course Fixture', description: 'An 18-hole public course with lake views.' });
  const sim = mk('golf', { name: 'Trip Sim Fixture', description: 'An indoor golf simulator lounge with four bays.' });
  mk('restaurant', { name: 'Trip Dinner Fixture', hours: JSON.stringify(WK('11:00', '22:00')) });
  for (const q of ['mini golf with kids in Kelowna on Saturday July 17, 2027', 'mini golf in Kelowna on Canada Day 2027', 'driving range then dinner in Kelowna on Saturday July 17, 2027',
    'mini-golf avec les enfants à Kelowna le samedi 17 juillet 2027', 'minigolf à Kelowna le 1er juillet 2027', 'champ de pratique à Kelowna samedi', 'driving range in January in Kelowna', 'bucket of balls in Kelowna on Saturday', 'hit some golf balls in Kelowna this afternoon']) {
    const p = PLAN(q);
    assert.ok(inPlan(p, name), `${q}: ${p.summary} ${JSON.stringify(p.warnings)}`);
    assert.ok(!inPlan(p, 'Trip Course Fixture'), `${q}: no course`);
    assert.doesNotMatch(String(p.summary), /Golf courses|Indoor golf|Terrains de golf/, q);
  }
  // His card in the plan says what he is.
  const p1 = PLAN('mini golf in Kelowna on Canada Day 2027');
  assert.match(JSON.stringify(p1), /Driving range & mini golf/);
  assert.doesNotMatch(JSON.stringify(p1), /"typeLabel":"Indoor golf"/);
  // November: mini golf is closed for his season: not planned, and the plan says why; never the simulators.
  const nov = PLAN('mini golf with kids on Saturday in Kelowna');
  assert.ok(!inPlan(nov, name));
  assert.ok(!inPlan(nov, 'Trip Sim Fixture'), 'no simulator swap for mini golf');
  assert.match(JSON.stringify(nov.warnings), new RegExp(`Mini golf is closed for the season at ${name.replace(/[()&]/g, '.')} \\(reopens Apr 1\\)`));
  // Christmas Day: left out, with its closed line.
  const xmas = PLAN('driving range in Kelowna on Christmas Day');
  assert.ok(!inPlan(xmas, name));
  assert.match(JSON.stringify(xmas.warnings), /closed on December 25|Closed Dec 25/);
  // golfSimVenue reads the main kind only: his simulator second kind never makes him "Indoor golf".
  assert.equal(app.golfSimVenue ? app.golfSimVenue(app.getVenue(v.id)) : false, false);
  // Plain golf in January still plans the simulators (round 2), and a simulator-first owner is a simulator.
  const jan = PLAN('golf in Kelowna on January 16, 2027');
  assert.ok(inPlan(jan, 'Trip Sim Fixture'));
  assert.ok(!inPlan(jan, name), 'a range is not golf');
  // A range-only owner, open all year, stays in for a January driving range.
  const r2 = await gord({ region: 'peachland', latitude: 49.77, longitude: -119.73 }, { kinds: ['range'], gtk: 'Covered stalls.', prices: false });
  assert.ok(inPlan(PLAN('driving range in January in Peachland'), app.getVenue(r2.v.id).name));
  void course; void sim;
});

test('3. happy hour: a snack bar is not a bar; a licensed lounge is; "No" works for every golf and sport kind that shows the tile', async () => {
  const snack = await gord({ region: 'summerland', latitude: 49.6, longitude: -119.67 });
  assert.equal(app.happyHourAllowed(app.getVenue(snack.v.id)), false, 'no happy hour tile for a snack bar');
  const sim = await openSetup(base, snack.t, { hash: 'more' });
  assert.doesNotMatch(sim.text(), /Happy hour/);
  for (const words of ['A driving range with a salad bar and granola bars.', 'Range with a juice bar. No alcohol.', 'Snack bar. Root beer floats.']) {
    const x = mk('golf', { description: words }); ok(await change(tokenFor(x.id), { indoor_info: { kinds: ['range'] } }));
    assert.equal(app.happyHourAllowed(app.getVenue(x.id)), false, words);
  }
  const lic = mk('golf', { name: 'Licensed Range Fixture', description: 'A driving range with a licensed patio lounge and beer on tap.' });
  const tl = tokenFor(lic.id); ok(await change(tl, { indoor_info: { kinds: ['range'] } }));
  assert.equal(app.happyHourAllowed(app.getVenue(lic.id)), true);
  const bad = [];
  const cases = [['golf', 'golf', 'An 18-hole course.'], ['golf', 'simgolf', 'A golf simulator lounge.'], ['golf', 'range', 'A driving range with a licensed lounge.']];
  for (const k of SK.SPORT_KINDS) if (!['golf', 'simgolf', 'range'].includes(k)) cases.push(['sport', k, 'A place with a licensed lounge.']);
  for (const [type, k, d] of cases) {
    const x = mk(type, { description: d });
    const t = tokenFor(x.id);
    ok(await change(t, { indoor_info: { kinds: [k] } }));
    const r = await change(t, { not_offered: ['happy_hour'] });
    if (r.status !== 200) bad.push(`${type}/${k}: ${JSON.stringify(r.body)}`);
  }
  assert.deepEqual(bad, []);
});

test('4. part of the place is seasonal: his own "Mini golf April to mid-October" shows by his hours (EN + FR); the range stays open; the hours hint is his kind\'s', async () => {
  const { v, t } = await gord();
  const en = page(v), fr = page(v, 'fr');
  assert.match(en, /Mini golf: April to mid-October/);
  assert.match(fr, /Mini-golf : d’avril à la mi-octobre/);
  // January: the range is open (all year), not "Closed for the season".
  const jan = page(v, 'en', new Date('2027-01-16T12:00:00-08:00'));
  assert.doesNotMatch(jan, /Closed for the season|Usually closed for the season/);
  // French words read too, and a price list section ("Mini golf (April to October)").
  const f2 = await gord({ region: 'west-kelowna', latitude: 49.86, longitude: -119.58 }, { gtk: 'Couvert. Minigolf d’avril à octobre.', prices: false });
  assert.deepEqual(app.sportPartSeasons(app.getVenue(f2.v.id)).map((x) => [x.kind, x.from, x.to]), [['mini_golf', '04-01', '10-31']]);
  const f3 = await gord({ region: 'lake-country', latitude: 50.05, longitude: -119.41 }, { gtk: 'Covered stalls.', prices: false });
  publish(f3.v.id, [['Mini golf (April to October)', [['Adults', 11]]]]);
  assert.deepEqual(app.sportPartSeasons(app.getVenue(f3.v.id)).map((x) => [x.kind, x.from, x.to]), [['mini_golf', '04-01', '10-31']]);
  // Research's words never count (only the owner's own lines, list and story).
  const r = mk('golf', { name: 'Research Range Fixture', description: 'A driving range. Mini golf April to October.' });
  visit(r.id, [{ label: 'Good to know', text: 'Mini golf May to September.' }]);
  ok(await change(tokenFor(r.id), { indoor_info: { kinds: ['range'] } }));
  assert.deepEqual(app.sportPartSeasons(app.getVenue(r.id)), []);
  // The hours year screen: a range's own hint, never "Most places like yours close for winter".
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  assert.doesNotMatch(sim.text(), /Most places like yours close for winter/);
  assert.match(sim.text(), /Only the mini golf closes for winter\? Keep Yes, and add one line in Good to know/);
});

test('5. the Groups line keeps research\'s lessons-pro sentence when his taps and words push it out (every path), and typing after a chip continues the sentence', async () => {
  const { v, t } = await gord({}, { gtk: null, prices: false });
  // The setup's own path: research's line in the box, a size tap, chips and his words, over 240 when joined.
  const groups = 'Groups of 10 or more: please book ahead. Birthday parties with mini golf for up to 20 kids, picnic tables included. Corporate and team outings. Group lessons and clinics on weekends.';
  ok(await change(t, { visit_rows: { groups } }));
  const p = page(v);
  assert.match(p, /Lessons with golf pro Steve Lawrence/, 'research\'s sentence is kept on his page');
  assert.match(p, /Birthday parties with mini golf for up to 20 kids/);
  // A sentence he kept himself is not shown twice.
  const w2 = await gord({ region: 'oliver', latitude: 49.18, longitude: -119.55 }, { gtk: null, prices: false });
  ok(await change(w2.t, { visit_rows: { groups: 'Lessons with golf pro Steve Lawrence. Birthday parties.' } }));
  assert.equal((page(w2.v).match(/Steve Lawrence/g) || []).length, 1);
  // Typing after a chip: "Birthday parties" then "with mini golf…" reads as one sentence.
  const sim = await openSetup(base, t, { hash: 'groups' });
  const box = sim.doc.getElementById('suGroupsLine');
  assert.ok(box, 'the Groups box');
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Birthday parties"]');
  assert.match(box.value, /^Birthday parties\. $/);
  await sim.type('suGroupsLine', `${box.value}with mini golf for up to 20 kids`);
  assert.equal(box.value, 'Birthday parties with mini golf for up to 20 kids');
  // A capital still starts a new sentence.
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Birthday parties"]');
  await sim.type('suGroupsLine', `${box.value}Picnic tables included`);
  assert.equal(box.value, 'Birthday parties. Picnic tables included');
});

test('6. the French page keeps research\'s Practice row; the booking button says "Book a bay" for his Trackman bay booking', async () => {
  const { v, t } = await gord({}, { rows: GORD_ROWS.filter((r) => r.label !== 'Winter') });
  assert.match(page(v), /300-yard range with 16 covered Toptracer stalls/);
  assert.match(page(v, 'fr'), /300-yard range with 16 covered Toptracer stalls/);
  assert.match(html(v), /Book a bay/); assert.doesNotMatch(html(v), /Book a visit/);
  assert.match(html(v, 'fr'), /Réserver une baie/);
  const sim = await openSetup(base, t, { hash: 'booking' });
  assert.match(sim.text(), /Book a bay/);
  assert.match(sim.text(), /Booking link \(lessons, bays or parties, optional\)/);
  // A range with no simulator keeps the walk-in words.
  const r = await gord({ region: 'naramata', latitude: 49.59, longitude: -119.59 }, { kinds: ['range'], gtk: null, prices: false });
  assert.doesNotMatch(html(r.v), /Book a bay/);
});
// Help (the widget's own matcher on the real page config).
const helpBot = (h) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(h);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const cfg = JSON.parse(m[1]);
  return { best: (q) => ctx.window.__ohbBest(q), topics: cfg.topics, byId: Object.fromEntries(cfg.topics.map((t) => [t.id, t])) };
};
const { GORD_LOG } = require('./sport3-help-log.js');
const bot = (b, lang, pg) => b[(lang === 'fr' ? 'fr' : '') + pg];

test('7. Help: Gord\'s log, French twins and more range and mini golf questions land (EN + FR); no "Pints $6" without a bar; the price answer keeps the card rule', async () => {
  const { t } = await gord({ region: 'penticton', latitude: 49.49, longitude: -119.59 });
  const b = { setup: helpBot(await getText(`/owner/${t}/setup`)), frsetup: helpBot(await getText(`/fr/owner/${t}/setup`)), menu: helpBot(await getText(`/owner/${t}/menu`)), frmenu: helpBot(await getText(`/fr/owner/${t}/menu`)) };
  const wrong = [];
  for (const [lang, pg, q, want] of GORD_LOG) { const r = bot(b, lang, pg).best(q); if (!r || !want.includes(r.id)) wrong.push(`[${lang} ${pg}] "${q}" -> ${r && r.id} (${r && r.hits.slice(0, 3).join(',')})`); }
  assert.deepEqual(wrong, []);
  for (const bb of Object.values(b)) for (const tp of bb.topics) assert.doesNotMatch(`${JSON.stringify(tp.a)} ${JSON.stringify(tp.aFr)}`, /Pints \$6|Pintes 6/, tp.id);
  const price = b.setup.byId['indoor-price'];
  assert.doesNotMatch(price.a, /When one of them is lower, your card shows that one/);
  assert.match(price.a, /never become your card’s price/);
  // The season answer never tells him to close the whole place.
  assert.match(b.setup.byId['sport-season'].a, /Only part of your place closes/);
});

// The audit's sweep (2026-11-20): every surface a sport or golf listing shows, for every sport kind, in English and French,
// says that kind's words and never another kind's: the setup screens, the price list editor, the prices page, the public
// page, the hub card, the search card, the Build My Trip stop and Help.
const KIND_DESC = { golf: 'An 18-hole public course.', simgolf: 'Four golf simulator bays and a lounge.', range: 'A driving range with covered stalls.', rink: 'An ice rink with public skating.',
  skatepark: 'A concrete skate park with a bowl.', discgolf: 'An 18-hole disc golf course.', bike: 'A BMX track for all ages.', swim: 'An outdoor pool with a slide.', courts: 'Six pickleball courts.',
  skischool: 'Ski and snowboard lessons for kids and adults.', sportsctr: 'A sports centre with a gym.', sportother: 'A family sports place.' };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What only one kind says: its price line, its card's price words (when no other kind shares them) and its button.
const OWN_WORDS = (() => {
  const out = {};
  const basisCount = {};
  for (const k of SK.SPORT_KINDS) for (const l of ['en', 'fr']) { const b = SK.K[k][l].price.basis; basisCount[b] = (basisCount[b] || 0) + 1; }
  for (const k of SK.SPORT_KINDS) {
    const w = [];
    for (const l of ['en', 'fr']) {
      const e = SK.K[k][l];
      if (!/^(?:From|À partir de) \{x\}\.$/.test(e.price.page)) w.push(esc(e.price.page.replace(/ ?\{x\}.*$/, '').trim()));
      if (basisCount[e.price.basis] === 1 && e.price.basis.split(' ').length > 1) w.push(esc(e.price.basis));
    }
    if (SK.K[k].bookBtn) w.push(...SK.K[k].bookBtn.map(esc));
    out[k] = w.filter((x) => x.length > 5);
  }
  return out;
})();
const SWEEP_SKIP_HELP = /^(?:sport-tee-times|sport-kinds-other|menu-import|sport-bay-link|sport-green-fees-word)$/;
test('8. the sweep: every sport kind, every surface, EN + FR, says its own kind\'s words and never another kind\'s', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  const bad = [], tripMissing = [];
  try {
    let j = 0;
    for (const k of SK.SPORT_KINDS) {
      const type = ['golf', 'simgolf', 'range'].includes(k) ? 'golf' : 'sport';
      const reg = ['vernon', 'penticton', 'osoyoos', 'oliver', 'summerland', 'peachland', 'west-kelowna', 'lake-country', 'naramata', 'enderby', 'armstrong', 'coldstream'][j++];
      const v = mk(type, { name: `Sweep ${k} Fixture`, region: reg, latitude: 49.5 + j / 40, longitude: -119.5, description: KIND_DESC[k], description_fr: `Un endroit pour l’essai ${k}.` });
      const t = tokenFor(v.id);
      ok(await change(t, { indoor_info: { kinds: [k], length: '1-2h', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 12 }));
      db.prepare("INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url").run(v.id, 'https://example.com/book');
      publish(v.id, [['Prices', [['First line', 12], ['Second line', 15], ['Third line', 20]]]]);
      const forbid = [...Object.entries(OWN_WORDS).filter(([kk]) => kk !== k).flatMap(([, w]) => w)];
      const words = new RegExp(`(?:${forbid.join('|')})`, 'i');
      const check = (where, text) => {
        const tt = String(text);
        const m = words.exec(tt) || (k !== 'golf' && NO_GOLF_COURSE.exec(tt)) || (!['golf', 'simgolf', 'range'].includes(k) && /\bmini[- ]?golf\b|\bbuckets?\b|\bseaux? de balles\b/i.exec(tt));
        if (m) bad.push(`${k} ${where}: "${m[0]}" …${tt.slice(Math.max(0, m.index - 70), m.index + 50)}…`);
      };
      const near = (p, name, where) => { const i = p.indexOf(name); if (i < 0) { bad.push(`${k} ${where}: not listed`); return ''; } return p.slice(Math.max(0, i - 40), i + 260); };
      for (const lang of ['en', 'fr']) {
        const pre = lang === 'fr' ? '/fr' : '';
        const h = html(v, lang);
        // (The <title> is the page's search title: unchanged while the SEO freeze rules hold.)
        check(`[${lang}] page`, plain(h.replace(/<title>[\s\S]*?<\/title>/, '')).replace(/Things to Do[\s\S]*?Business login/, ''));
        const href = /href="([^"]+\/prices)"/.exec(h);
        if (href) check(`[${lang}] prices page`, plain((await getText(`${pre}${href[1].replace(/^\/fr/, '')}`)).replace(/<title>[\s\S]*?<\/title>/, '')).replace(/Things to Do[\s\S]*?Business login/, ''));
        else bad.push(`${k} [${lang}]: no prices link`);
        const ed = await getText(`${pre}/owner/${t}/menu`);
        const cfg = JSON.parse(/window\.MENU_CFG = (\{[\s\S]*?\});<\/script>/.exec(ed)[1].replace(/\\u003c/g, '<'));
        check(`[${lang}] editor`, JSON.stringify(cfg.t));
        const cat = type === 'golf' ? 'golf' : 'sports';
        check(`[${lang}] hub card`, near(plain(await getText(`${pre}/${reg}/${cat}`)), `Sweep ${k} Fixture`, `[${lang}] hub`));
        const q = `${k === 'skischool' ? (lang === 'fr' ? 'cours de ski' : 'ski lessons') : SK.K[k][lang].search[0]} ${reg.replace(/-/g, ' ')}`;
        check(`[${lang}] search card "${q}"`, near(plain(await getText(`${pre}/search?q=${encodeURIComponent(q)}`)), `Sweep ${k} Fixture`, `[${lang}] search "${q}"`));
        for (const pg of ['setup', 'menu']) {
          for (const tp of helpBot(await getText(`${pre}/owner/${t}/${pg}`)).topics) {
            if (SWEEP_SKIP_HELP.test(tp.id)) continue;
            check(`[${lang}] help ${pg} ${tp.id}`, [tp.a, tp.aFr].map((x) => (typeof x === 'object' ? Object.values(x || {}).join(' ') : String(x || ''))).join(' ').replace(/<[^>]+>/g, ''));
          }
        }
      }
      for (const hash of ['price', 'booking', 'photos', 'hours:year', 'groups', 'more']) {
        try { const sim = await openSetup(base, t, { hash }); check(`setup #${hash}`, sim.text()); } catch (e) { bad.push(`${k} setup #${hash}: ${e.message}`); }
      }
      const p = app.runTripPlan({ text: `${SK.K[k].en.search[0]} in ${reg.replace(/-/g, ' ')} on Saturday July 17, 2027` }, NOV);
      const stops = JSON.stringify([p.recommendations, p.itinerary, p.days, p.outing]);
      const at = stops.indexOf(`Sweep ${k} Fixture`);
      if (at >= 0) check('trip stop', stops.slice(Math.max(0, at - 600), at + 900)); else tripMissing.push(k);
    }
  } finally { delete process.env.DISCOVERY_SEARCH; }
  assert.deepEqual(bad, []);
  // Every kind a visitor plans for is in its Build My Trip request (courts and Something else aren't visitor stops).
  assert.deepEqual(tripMissing.filter((k) => !['courts', 'sportother', 'sportsctr', 'skischool'].includes(k)), []); // (ski lessons in July: out of season)
});

test('9. search keeps mini golf and the driving range with a month or a holiday (EN + FR); a part closed then goes last and says so', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const { v } = await gord({ region: 'armstrong', latitude: 50.45, longitude: -119.2 });
    const name = app.getVenue(v.id).name;
    mk('golf', { name: 'Search Course Fixture', region: 'armstrong', latitude: 50.44, longitude: -119.2, description: 'An 18-hole public course.' });
    const H = async (lang, q) => { const h = await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`); return plain(h); };
    for (const [lang, q, head] of [['en', 'mini golf in july armstrong', /Mini golf in Armstrong in July/], ['en', 'mini golf christmas day armstrong', /Mini golf in Armstrong on Dec 25/],
      ['fr', 'mini-golf en janvier armstrong', /Minigolf à Armstrong en janvier/], ['fr', 'mini-golf le jour de noël armstrong', /Minigolf à Armstrong le 25 déc/],
      ['en', 'driving range in july armstrong', /Driving ranges in Armstrong in July/], ['en', 'driving range armstrong', /Driving ranges in Armstrong/], ['fr', 'champ de pratique armstrong', /Champs de pratique à Armstrong/]]) {
      const r = await H(lang, q);
      assert.match(r, head, q);
      assert.ok(r.includes(name), `${q}: his place`);
      assert.ok(!r.includes('Search Course Fixture'), `${q}: no golf course`);
    }
    // January: his mini golf is closed for its season, so his card says so (and the range search doesn't).
    assert.match(await H('en', 'mini golf in january armstrong'), /Mini golf: April to mid-October · closed then/);
    assert.doesNotMatch(await H('en', 'driving range in january armstrong'), /closed then/);
  } finally { delete process.env.DISCOVERY_SEARCH; }
});
