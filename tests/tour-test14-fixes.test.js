// Whistler tour test 14 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour14-2026-11-18/REPORT.md:
// Lucía, private ski and snowboard lessons, on a Pixel 8 with Gboard; some Help questions in Spanish). No ski-lesson kind,
// Build My Trip never planned a lesson company, the season tick wiped the dates, "per lesson" got the bike message, her
// Groups line ran together, "15% off" became "$15% off", "snow board" and "Black comb" went live unflagged.
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t14-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T14 ${++n}`, slug: `tour-t14-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 14 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.74.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const textOf = (p) => JSON.stringify(p);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };

// Lucía's typed lessons (her final-state.json), extras last.
const LESSONS = [
  { name: 'Private lessons', items: [{ name: 'Private half day ski or snow board lesson', price: '$599 per lesson (1-4 people)', duration: '3 hours', description: 'Up to 4 people of similar level, ski or snow board. Morning or afternoon. Lift tickets and rentals not included.' },
    { name: 'Private full day lesson', price: '$949 per lesson, up to 4 people', duration: '6 hours', description: 'Ski or snowboard, all levels. We can meet at Black comb base on request. Lift tickets not included.' }] },
  { name: 'Kids camp', items: [{ name: 'Kids ski & snow board camp, 5 days (ages 6-12)', price: '$1,295 per child for the week', duration: '5 days, 9:30 to 3:30', description: 'Monday to Friday, small groups by level, supervised lunch. Lift ticket and rentals not included.' }] },
  { name: 'Packages', items: [{ name: 'First timer adult package', price: '$249 per person', duration: '2 hours', description: 'Your first day on skis or a snow board: private intro on the beginner area, then we ski together. Rental discount code included.' }] },
  { name: 'Extras', items: [{ name: 'Adaptive lessons (sit-ski, visually impaired, cognitive)', price: 'On request', description: 'Certified adaptive instructors. Tell us what you need when you book.' },
    { name: 'Rental shop discount', price: '15% off with our code', description: 'Ask us for the code when you book.' }] },
];
const STORY = 'Altitud is a small private ski and snowboard school on Whistler and Blackcomb. Our CSIA and CASI instructors teach in English, Spanish and Portuguese, one family or group of friends at a time (up to 4 people of similar level). We run a 5 day kids camp for ages 6 to 12, first timer packages for adults, and adaptive lessons on request.';
async function lucia(o = {}, info = {}) {
  const v = mk('tour', { name: `Altitud Private Ski Lessons ${n + 1}`, cuisine: 'Ski lessons', rating: 4.9, reviews: 211, address: 'Base of Whistler Village Gondola', latitude: 50.1167, longitude: -122.9548,
    description: STORY, description_fr: 'Cours de ski privés à Whistler pour tous les âges.', ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['lessons'], length: 'half', book: 'day', age: '5', year: 'seasonal', ...info } }));
  ok(await change(t, { open_months: '11-25:04-15' }));
  ok(await change(t, { tour_price: 249 }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: LESSONS }));
  approveAll(v.id);
  return { v, t };
}
let hill = null, wasp = null, kite = null;
function world() {
  if (hill) return;
  hill = mk('outdoor', { name: 'Whistler Blackcomb T14', region: 'whistler-blackcomb', cuisine: 'Ski resort', rating: 4.7, reviews: 9000, description: 'The ski resort: two mountains of lift-served skiing and snowboarding.', latitude: 50.107, longitude: -122.95 });
  for (const [nm, cu] of [['Village Bistro T14', 'Bistro'], ['Village Grill T14', 'Grill'], ['Mountain Cafe T14', 'Cafe']]) mk('restaurant', { name: nm, cuisine: cu, hours: JSON.stringify(WK('08:00', '22:00')) });
  wasp = mk('tour', { name: 'Whistler Adaptive Sports Program T14', cuisine: 'Adaptive ski & snowboard lessons', rating: 4.8, reviews: 80, description: 'Not-for-profit society running alpine ski, sit-ski, snowboard, Nordic and snowshoe lessons for people of any age with a disability, with trained instructors and adaptive equipment.' });
  kite = mk('tour', { name: 'Squamish Kite School T14', region: 'squamish', cuisine: 'Kiteboarding & wing foil lessons, paddling', rating: 5, reviews: 900, description: 'Kiteboarding, wing foil and wakeboard lessons, and paddle board rentals.' });
}
const plan = (q, lang) => app.runTripPlan({ text: q, ...(lang ? { lang } : {}) }, NOW);

test('1. Build My Trip: a ski_lessons kind; each lesson request plans her next to the ski hill ("add a lesson"), with her own notes; July stays out', async () => {
  world();
  const { v } = await lucia();
  const r = require('../trip-requirements.js');
  for (const q of ['ski lessons', 'snowboard lesson', 'ski school', 'ski instructor', 'private lesson', 'kids ski camp', 'adaptive ski', 'snow board lessons', 'learn to ski']) assert.ok(r.KINDS.ski_lessons.test(q) || r.KINDS.ski_lessons.test(r.tripRequestSynonyms(q)), q);
  assert.ok(r.TOUR_PLANNER_KINDS.includes('ski_lessons'));
  for (const [q, lang] of [['ski lessons Whistler in January'], ['snowboard lesson for my 8 year old in February'], ['kids ski camp week in March'], ['cours de ski à Whistler en janvier', 'fr'], ['Spanish speaking ski instructor'], ['adaptive ski lessons']]) {
    const p = plan(q, lang);
    const names = namesOf(p);
    assert.ok(names.includes(v.name) || (/adaptive/.test(q) && names.includes(wasp.name)), `${q}: ${JSON.stringify([p.kind, names])}`);
    assert.doesNotMatch(textOf(p), /No ski hill could be fitted/, q);
    assert.doesNotMatch(String(p.summary), /“(?:spanish|speaking|instructor|adaptive|week|lessons?)”/i, q);
    // The lesson is on the ski day, before the hill.
    const day = (p.days || [])[0];
    if (day) { const ix = day.stops.findIndex((s) => s.lessonStop); const hx = day.stops.findIndex((s) => s.skiDay); assert.ok(ix >= 0 && hx > ix, `${q}: ${JSON.stringify(day.stops.map((s) => s.venue && s.venue.name))}`); }
  }
  const kidsStop = itemsOf(plan('snowboard lesson for my 8 year old in February')).find((x) => x.venue.name === v.name);
  assert.ok((kidsStop.caveats || []).includes('Kids’ lessons: ages 6 to 12 (the operator’s own words).'), JSON.stringify(kidsStop.caveats));
  const es = itemsOf(plan('Spanish speaking ski instructor')).find((x) => x.venue.name === v.name);
  assert.ok((es.caveats || []).includes('Lessons in Spanish (the operator’s own words).'), JSON.stringify(es.caveats));
  // Adaptive: the adaptive program first, and her school named too (its own words say adaptive lessons).
  const ad = plan('adaptive ski lessons');
  assert.ok(namesOf(ad).includes(wasp.name), JSON.stringify(namesOf(ad)));
  assert.match(textOf(ad), new RegExp(`Also teaches adaptive lessons \\(its own words\\): ${v.name}`));
  // Out of season: no lesson in July.
  const jul = plan('ski lesson in July');
  assert.ok(!namesOf(jul).includes(v.name) && !namesOf(jul).includes(wasp.name), JSON.stringify(namesOf(jul)));
  // French notes.
  const fr = require('../trip-french-copy.js');
  assert.ok(fr);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-french-copy.js'), 'utf8'), /Cours pour enfants : de \$1 à \$2 ans/);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['cours de ski', 'ski lessons'\]/);
  // Words: the shared vocabulary has the group.
  const vocab = require('../data/vocabulary/shared.json');
  assert.ok(vocab.descriptionSynonyms['ski lessons'] && vocab.termLabels['ski lessons'].fr === 'cours de ski et de planche');
});

test('1b. the broader pass: kite and wing foil lessons, target shooting, rock climbing and bike lessons, sailing have planner words (EN and FR)', () => {
  const r = require('../trip-requirements.js');
  assert.ok(r.KINDS.kite_lessons.test('kiteboarding lessons') && r.KINDS.kite_lessons.test('wing foil clinics') && !r.KINDS.kite_lessons.test('kiteboarding'));
  assert.ok(r.KINDS.shooting.test('target shooting') && r.KINDS.shooting.test('biathlon'));
  assert.ok(r.KINDS.mountain_guide.test('rock climbing lessons') && r.KINDS.mountain_guide.test('climbing school'));
  assert.ok(r.KINDS.bike_tour.test('mountain bike lessons') && r.KINDS.bike_tour.test('bike camp'));
  assert.ok(r.KINDS.boat_tour.test('sailing trip') && r.KINDS.boat_tour.test('sunset sails'));
  const frSrc = fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8');
  for (const w of ["['cours de kitesurf', 'kitesurf lessons']", "['tir a la cible', 'target shooting']", "['cours d escalade', 'rock climbing lessons']", "['cours de voile', 'sailing lessons']"]) assert.ok(frSrc.includes(w), w);
  // A kiteboarding school is that kind; a heli company is not a lesson company.
  assert.ok(r.inferPlannerKinds({ type: 'tour', name: 'Squamish Watersports', cuisine: 'Kiteboarding & wing foil lessons, paddling', description: 'x' }).includes('kite_lessons'));
  assert.ok(!r.inferPlannerKinds({ type: 'tour', name: 'Coast Heli', cuisine: 'Heli-skiing', description: 'Ski school next door.' }).includes('ski_lessons'));
});

test('2. the "Ski and snowboard lessons" kind: its chip (EN + FR), Winter & Snow, its page words, the planner kind; search finds her before a kite school, and « cours de ski » / « leçons de ski » / « école de ski » too', async () => {
  world();
  const { v } = await lucia();
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.lessons, ['Ski and snowboard lessons', 'Cours de ski et de planche']);
  assert.ok(app.TOUR_KINDS_SHOWN.includes('lessons') && completeness.TOUR_KINDS.includes('lessons'));
  assert.equal(app.TOUR_KIND_ACTIVITY.lessons, 'winter');
  assert.ok(app.tourInActivity(app.getVenue(v.id), 'winter'));
  // Research's "Ski lessons" category alone, no kind picked, is under Winter & Snow too (the widened filter).
  const other = mk('tour', { name: 'Snow School T14', cuisine: 'Private ski & snowboard lessons' });
  assert.ok(app.tourInActivity(app.getVenue(other.id), 'winter'));
  assert.equal(app.tourKindSuggestion(app.getVenue(other.id))[0], 'lessons');
  assert.match(plain(page(v)), /Ski lessons/);
  const names = (q, lang) => (app.runDiscovery(app.discoverySearchText(q, lang), { limit: 40, lang }).results.items || []).map((x) => (x.venue || x).name);
  const en = names('ski lessons', 'en');
  assert.ok(en.includes(v.name), JSON.stringify(en));
  if (en.includes(kite.name)) assert.ok(en.indexOf(v.name) < en.indexOf(kite.name), JSON.stringify(en));
  for (const q of ['cours de ski', 'leçons de ski', 'école de ski']) assert.ok(names(q, 'fr').includes(v.name), `${q}: ${JSON.stringify(names(q, 'fr'))}`);
});

test('3. the season screen: a tick toggles in place (the dates she picked stay), no stray year; a test of the handler', () => {
  // The tick no longer draws the screen again: it sets aria-pressed on the button and returns.
  const m = /if \(k === 'tourTick'\) \{[^\n]*\n/.exec(CLIENT);
  assert.ok(m, 'tourTick handler');
  const src = m[0];
  assert.match(src, /tb\.setAttribute\('aria-pressed'/);
  // Run it: a fake page whose date boxes hold her picks; the tick changes the state, never the boxes.
  const boxes = { suOfM: { value: '11' }, suOfD: { value: '25' }, suOtM: { value: '4' }, suOtD: { value: '15' } };
  const btn = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() {} };
  let rendered = 0;
  const S = { tticks: { weather_all: false, off_request: false, snow_open: false } };
  const fn = new Function('k', 'v', 'S', 'el', 'render', 'window', 'tticks', `${src}; return 'none';`);
  fn('tourTick', 'snow_open', S, (id) => (id === 'suTick_snow_open' ? btn : boxes[id]), () => { rendered++; }, { scrollY: 0, scrollTo() {} }, () => S.tticks);
  assert.equal(S.tticks.snow_open, true); assert.equal(btn.attrs['aria-pressed'], 'true'); assert.equal(rendered, 0);
  assert.deepEqual([boxes.suOfM.value, boxes.suOfD.value, boxes.suOtM.value, boxes.suOtD.value], ['11', '25', '4', '15']);
  // A year answer the setup already has is not sent again.
  assert.match(CLIENT, /wyNew !== \(S\.savedWYear \|\| AI\.year \|\| ''\)/);
  assert.match(CLIENT, /if \(y !== \(S\.savedWYear \|\| AI\.year \|\| ''\)\) list\.push\(apptPart\(\{ year: y \}\)\);/);
});

test('4. the admin card for a spot sent with her address: says so plainly, shows the new address by the map, no one-tap Looks right', () => {
  const ap = require('../arrival-points.js');
  const pin = { lat: 50.1167, lng: -122.9548 };
  const d = ap.decide({ point: pin, device: null, accuracy: NaN, pin, signedIn: false, addrOnly: true, picked: false });
  assert.ok(d.reasons.includes('The owner couldn’t pin it. Place it from her photo and new address.'), JSON.stringify(d.reasons));
  assert.ok(!d.reasons.some((r) => /picked on the map/.test(r)));
  const notPicked = ap.decide({ point: pin, device: null, accuracy: NaN, pin, signedIn: true, picked: false });
  assert.ok(notPicked.reasons.some((r) => /No spot was picked on the map/.test(r)));
  const { DatabaseSync } = require('node:sqlite');
  const mem = new DatabaseSync(':memory:');
  mem.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, latitude REAL, longitude REAL, address TEXT);
    CREATE TABLE venue_arrival_points (id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER, file TEXT, preview_key TEXT UNIQUE, lat REAL, lng REAL, device_lat REAL, device_lng REAL, accuracy_m REAL, distance_m INTEGER, status TEXT DEFAULT 'pending', review_reasons TEXT, submitted_by TEXT, submitted_at TEXT DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT, reviewed_by TEXT, rejection_reason TEXT);`);
  mem.prepare('INSERT INTO venues VALUES (1, ?, ?, ?, ?)').run('Altitud', pin.lat, pin.lng, '4170 Main St, Whistler');
  mem.prepare("INSERT INTO venue_arrival_points (venue_id, file, preview_key, lat, lng, distance_m, review_reasons) VALUES (1, 'f.jpg', 'k1', ?, ?, 0, ?)").run(pin.lat, pin.lng, d.reasons.join('; '));
  const kit = ap.createArrivalPoints({ db: mem, respond() {}, sameOrigin: () => true, clientIp: () => 'ip', rateLimited: () => false, readJson: async () => ({}), venueForToken: () => null, strip: (b) => b, dimensions: () => null, write: () => 'x', remove() {} });
  const row = { ...kit.pending()[0], new_address: 'Base of Whistler Village Gondola, by the ski school sign' };
  const actions = '<div class="rv-actions"><button type="button" class="rv-btn rv-approve" data-act="approve">Looks right</button><input type="text" name="reason"><button type="button" class="rv-btn rv-reject" data-act="reject">Reject</button></div>';
  const html = kit.cardHtml(row, (x) => String(x), actions);
  assert.match(html, /The owner couldn’t pin it\. Place it from her photo and new address\./);
  assert.match(html, /New address \(waiting for review\): <strong>Base of Whistler Village Gondola, by the ski school sign<\/strong>/);
  assert.doesNotMatch(html, /Looks right<\/button>/); assert.match(html, /data-act="reject"/);
  // The setup says what happened.
  assert.match(CLIENT, /picked: !!S\.door\.moved \}; if \(S\.door\.addrOnly\) b\.addr_only = true;/);
  // The server reads the address change waiting for review.
  assert.match(SERVER, /new_address: hit\.address\.trim\(\)/);
});

test('6. prices: per student / child / kid / skier / rider / participant is per person; per lesson is a group price for Private tours (accepted there); the hint says per group or lesson', async () => {
  for (const x of ['249 per student', '$249 per child', '249 per kid', '249 per skier', '249 per rider', '249 per participant', '$189 per flight', '95']) assert.equal(app.tourPriceWhy(x), x === '$189 per flight' || x === '95' ? '' : '', x);
  assert.equal(app.tourPriceWhy('$249 per lesson'), 'lesson');
  assert.equal(app.tourPriceWhy('$599 per lesson (1-4 people)'), 'lesson');
  assert.equal(app.tourPriceWhy('$599 per lesson (1-4 people)', true), '');
  assert.equal(app.tourPriceWhy('$949 per lesson, up to 4 people', true), '');
  assert.equal(app.tourPriceWhy('650 per boat'), 'group'); assert.equal(app.tourPriceWhy('349 per sled'), 'unit');
  // The client reads it the same way, and says where it goes.
  const fn = new Function(`${/function feeHours\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function moneyHead\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function priceSwiss\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function priceTrim\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function tourPriceWhy\(x, priv\)\{[\s\S]*?\n  \}\n/.exec(CLIENT)[0]}${/function tourPriceRead\(x, priv\)\{[^\n]*\n/.exec(CLIENT)[0]} return { why: tourPriceWhy, read: tourPriceRead };`)();
  assert.equal(fn.read('249 per student'), 249); assert.equal(fn.read('249 per participant'), 249);
  assert.equal(fn.why('$249 per lesson'), 'lesson'); assert.equal(fn.read('$599 per lesson (1-4 people)', true), 599);
  assert.equal(text.en.tour.tpriceLesson, 'A price per lesson for your group? Put it in Private tours');
  assert.ok(text.fr.tour.tpriceLesson);
  assert.match(text.en.tour.tpriceGroup, /per boat, per group or per lesson/);
  assert.match(CLIENT, /pwhy === 'lesson' && T\.tpriceLesson \? T\.tpriceLesson/);
  const { v, t } = await lucia();
  assert.equal((await change(t, { tour_price: '$249 per lesson' })).status, 400);
  ok(await change(t, { tour_price: '249 per student' }));
});

test('7. Groups: after a size chip the box has the focus with the cursor at the end; run-ons are asked about on save; no double space after a chip', () => {
  assert.match(CLIENT, /var gb = el\('suGroupsLine'\); if \(gb\) \{ try \{ gb\.focus\(\{ preventScroll: true \}\); var gl0 = gb\.value\.length; gb\.setSelectionRange\(gl0, gl0\);/);
  assert.match(CLIENT, /S\.chipFilled\[inp\.id\] === inp\.value\) \|\| inp\._chipEnd\) return; inp\._chipEnd = true;/);
  const runOn = new Function(`${/function runOnText\(t\)\{[^\n]*\n/.exec(CLIENT)[0]} return runOnText;`)();
  assert.equal(runOn('Groups of 6 or moreMore than 4 people? welcome.: please book ahead.'), 'moreMore');
  assert.ok(runOn('More than 4 people? All welcome.: please book ahead.'));
  assert.equal(runOn('Groups of 6 or more: please book ahead. GoPro rentals and iPhone mounts.'), '');
  assert.match(CLIENT, /var ro = runOnText\(gline\); if \(ro && T\.runOn && S\.runOnAsked !== gline\)/);
  assert.ok(text.en.tour.runOn && text.fr.tour.runOn);
  assert.equal(app.ownerTextClean('Lift tickets not included.  Rentals extra.', { short: true }), 'Lift tickets not included. Rentals extra.');
});

test('8. extras: no "$" on a percentage or a line that doesn\'t start with a number', () => {
  assert.equal(app.menuPriceLabel('15% off with our code', 'en'), '15% off with our code');
  assert.equal(app.menuPriceLabel('$15% off with our code', 'en'), '15% off with our code');
  assert.equal(app.menuPriceLabel('On request', 'en'), 'On request');
  assert.match(SERVER, /!\/\[\$€£%\]\|\\b\(\?:cad\|usd\)\\b\|\\bpercent\\b/);
});

test('9. local words split by the phone keyboard: flagged in the setup and on the admin card, never changed', () => {
  const clean = require('../owner-text-clean.js');
  const site = require('../trip-site.js');
  const s = clean.localWordSplits('A small private ski and snow board school on Whistler and Black comb, near Creek side. Whistler\'s best.', site.localWordJoins);
  assert.deepEqual(s.map((x) => [x.said, x.word]), [['snow board', 'snowboard'], ['Black comb', 'Blackcomb'], ['Creek side', 'Creekside']]);
  assert.deepEqual(clean.localWordSplits('Zip line tours and paddle board rentals at Whistler\'s lakes.', site.localWordJoins), []);
  // The admin card says so.
  assert.match(app.ownerTextFlagsHtml(['Private ski and snow board lessons on Black comb.']), /Split by the phone keyboard\? “snow board” may be snowboard; “Black comb” may be Blackcomb\. Nothing was changed automatically\./);
  // The setup asks once (Save again keeps it).
  assert.match(CLIENT, /if \(sw\.length && T\.splitWord && S\.splitAsked !== swKey\)/);
  assert.match(SERVER, /localJoins: ownerTextCleanLib\.COMMON_WORD_JOINS\.concat\(TRIP_SITE_LOCAL_JOINS\)/);
  assert.ok(text.en.tour.splitWord && text.fr.tour.splitWord);
  // Never changed: her story is saved as typed.
  assert.equal(app.ownerTextClean('Ski and snow board lessons on Black comb.', {}), 'Ski and snow board lessons on Black comb.');
});

test('10. "Opening day depends on snow": the status line and the hours say "Reopens late November (snow permitting)" (EN + FR)', async () => {
  const { v, t } = await lucia({}, {});
  assert.equal((await change(t, { tour_info: { snow_open: 'yes' } })).status, 400);
  ok(await change(t, { tour_info: { snow_open: true } })); approveAll(v.id);
  assert.equal(app.venueTourInfo(v.id).snow_open, true);
  const en = plain(page(v, 'en', NOW)), fr = plain(page(v, 'fr', NOW));
  assert.match(en, /Reopens late November \(snow permitting\)/);
  assert.match(fr, /Rouvre fin novembre \(selon l’enneigement\)/);
  assert.doesNotMatch(en, /Reopens Nov 25/);
  // In the season: the hours say opening day depends on snow.
  assert.match(plain(page(v, 'en', new Date('2027-01-15T12:00:00-08:00'))), /Opening day depends on snow \(usually late November\)\./);
  assert.match(CLIENT, /\(withOff && T\.tSnowOpen \? chip\('snow_open', T\.tSnowOpen\) : ''\)/);
  assert.equal(text.en.tour.tSnowOpen, 'Opening day depends on snow');
  // All year: no snow words.
  ok(await change(t, { tour_info: { year: 'all' } })); approveAll(v.id);
  assert.doesNotMatch(plain(page(v, 'en', NOW)), /snow permitting/);
});

test('12. finish screen: no "update the French description" when its translation is already queued', async () => {
  const { v, t } = await lucia();
  ok(await change(t, { description: 'Altitud teaches private ski and snowboard lessons on Whistler and Blackcomb, in English, Spanish and Portuguese.' }));
  assert.ok(db.prepare("SELECT 1 FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story' AND status = 'help'").get(v.id), 'queued');
  assert.equal(app.ownerFrDescState(app.getVenue(v.id)), '');
  assert.match(CLIENT, /\(S\.storySentNow && C\.frStoryQueues\)\) return '';/);
  assert.match(SERVER, /frStoryQueues: COMPLETENESS_TYPES\.has\(venue\.type\)/);
});

test('13. polish: "Private lessons from $599", Booking without "Varies by tour" for her list, French unit words, the admin email counts tours like the page, one desktop photo button', async () => {
  const { v, t } = await lucia();
  ok(await change(t, { tour_info: { private: 599 } })); approveAll(v.id);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Private lessons from \$599\./); assert.match(fr, /Cours privés à partir de 599/);
  // Her typed lessons have no booking rule of their own ("on request" is a meeting place, "when you book" an aside).
  assert.match(en, /Booking Book at least a day ahead\.(?! Varies)/);
  const sp = (x) => String(x).replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(sp(app.menuPriceLabel('$1,295 per child for the week', 'fr')), '1 295 $ par enfant pour la semaine');
  assert.equal(sp(app.menuPriceLabel('$599 per lesson (1-4 people)', 'fr')), '599 $ par cours (1 à 4 personnes)');
  assert.equal(sp(app.menuPriceLabel('$949 per lesson, up to 4 people', 'fr')), '949 $ par cours, jusqu’à 4 personnes');
  assert.equal(app.menuPriceLabel('On request', 'fr'), 'Sur demande');
  // The email count: 4 lessons, not the 2 extras.
  assert.match(SERVER, /const items = \(venue && venue\.type === 'tour' \? tourTripItems\(parseMenuData\(menu\.data\)\)\.length : 0\) \|\| menuItemCount/);
  assert.equal(app.tourTripItems({ sections: LESSONS }).length, 4);
  assert.match(CLIENT, /\(FINE && T\.choosePhoto \? big\('🖼️', T\.choosePhoto, '', false, 'pick'\) :/);
  assert.match(CLIENT, /tourLessonsKind\(\) && T\.tprivQLessons \? T\.tprivQLessons : T\.tprivQ/);
});
