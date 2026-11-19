// Indoor test 12 (2026-11-19; Jess, owner of a small hot yoga and Pilates studio in Kelowna: about 30 classes a week from
// 6 AM to 8 PM, no open-door hours, a Book link to her schedule, a $22 drop-in, research's "1 month unlimited intro pass
// $80"). Each fix from her report, checked with the real setup page script and real taps (tests/setup-sim.js), Build My
// Trip, search, Help and the public pages. Her Help questions are in the Help matrix (tests/indoor-help-matrix.test.js);
// the daypart requests of several kinds in tests/indoor-planner-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test12-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const IK = require('../indoor-kinds.js');
const { openSetup } = require('./setup-sim.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
const NONE = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
const STORY = 'Pranify Yoga is a South Pandosy yoga studio with two rooms: a heated Sun Room for hot classes and a warm Moon Room. We also teach Pilates, about 30 classes a week.';
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T12 Fixture ${++n}`, slug: `indoor-t12-${n}`, region: 'kelowna', type: 'indoor', latitude: 49.8712 + n / 3000, longitude: -119.4926,
  address: `${2900 + n} Pandosy St, Kelowna, BC`, phone: '778-555-0133', website: 'https://example.com', hours: DAY('06:00', '20:00'), description: 'A fixture used only by the indoor test 12 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.85.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en', now = NOW) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const hp = (x) => String(x && typeof x === 'object' ? x.link || x.out : x).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const research = (id, prices) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(id, JSON.stringify({ rows: [
  { label: 'Known for', text: 'Hot yoga in the heated Sun Room; warmer, gentler classes in the Moon Room.' }, { label: 'Prices', text: prices }], source_url: 'https://example.com/', checked_at: '2026-11-19' }));

// Jess's studio: classes only (no set hours), book ahead, 16+, $22 drop-in, her schedule link.
const jess = async (o = {}, info = {}, link = 'https://pranify.example/schedule') => {
  const v = mk({ name: `Pranify Yoga T12 ${n + 1}`, cuisine: 'Yoga studio', description: STORY, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['yoga'], length: '1h', book: 'ahead', age: '16', year: 'all', visit: 'appointment', ...info }, indoor_price: 22 }));
  await ok(change(t, { hours: NONE }));
  if (link) await ok(change(t, { booking_url: link }));
  approveAll(v.id);
  app.indoorCardPrice(v.id);
  return { v, t };
};

test('1. "yoga class in Kelowna Saturday morning" plans her studio in the morning, in Kelowna, with no drive to another town for dinner (EN + FR); a yoga place next door no longer turns it into a three-town day', async () => {
  const { v } = await jess();
  // A yoga place in West Kelowna, so the towns around Kelowna have more of the kind (the old widening), and dinner places.
  const wk = mk({ name: 'West Side Flow Yoga T12', region: 'west-kelowna', cuisine: 'Yoga studio', description: 'A yoga studio with flow and yin classes.', latitude: 49.86, longitude: -119.58 });
  await ok(change(tokenFor(wk.id), { indoor_info: { kinds: ['yoga'], length: '1h', book: 'busy', age: 'all', year: 'all' }, indoor_price: 20 }));
  mk({ name: 'Peachland Lakeside Grill T12', type: 'restaurant', region: 'peachland', cuisine: 'Canadian', description: 'Dinner by the lake.', hours: DAY('11:00', '22:00'), latitude: 49.77, longitude: -119.73 });
  for (const q of ['yoga class in Kelowna Saturday morning', 'yoga in Kelowna Saturday morning', 'cours de yoga à Kelowna samedi matin']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.notEqual(p.kind, 'day_plan', `${q}: ${p.kind}`);
    const items = itemsOf(p);
    const mine = items.find((x) => x.venue.id === v.id);
    assert.ok(mine, `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
    assert.equal(mine.daypart, 'morning', `${q}: ${mine.daypart}`);
    assert.ok(items.every((x) => x.venue.region === 'kelowna'), `${q}: ${items.map((x) => `${x.venue.name} (${x.venue.region})`).join(' | ')}`);
    assert.ok(!items.some((x) => /Peachland/.test(x.venue.name)), q);
  }
  // A list request still takes in the towns around it.
  const list = app.runTripPlan({ text: 'yoga studios in Kelowna' }, NOW);
  assert.ok(itemsOf(list).some((x) => x.venue.id === wk.id), itemsOf(list).map((x) => x.venue.name).join(' | '));
});

test('2. The price box pre-fills only from a research line in the kind\'s basis words: never an intro pass, a class card or a membership (blank instead); a drop-in or an adult admission line does', async () => {
  // The pure reader, kind by kind.
  const P = IK.indoorPrefillPrice;
  assert.equal(P(['yoga'], '1 month unlimited intro pass $80. 20-class card $400, good for 6 months and shareable.'), null);
  assert.equal(P(['yoga'], 'New students: 2 weeks unlimited for $49. Monthly membership $159.'), null);
  assert.equal(P(['yoga'], 'Drop-in $22, 10-class pass $180.'), 22);
  assert.equal(P(['yoga'], 'Intro offer 2 weeks for $49. Drop in class $20.'), 20);
  assert.equal(P(['museum'], 'Adults $12; seniors, students and youth 3 to 18 $7; family (2 adults, 2 kids) $35.'), 12);
  assert.equal(P(['museum'], 'Annual family membership $90.'), null);
  assert.equal(P(['pool'], 'Adult drop-in $6.50, 10-visit pass $58.'), 6.5);
  assert.equal(P(['climbing'], 'Day pass $22; 10-punch card $190; monthly membership $85.'), 22);
  assert.equal(P(['cinema'], 'Reel Deal Tuesday ticket', 8.75), null);
  assert.equal(P(['bowling'], 'Bowling lane per hour, incl. shoes', 45), null);
  // Her setup: research's intro pass and class card leave the box empty (no "We found this online").
  const v = mk({ name: 'Pranify Yoga T12 Prefill', cuisine: 'Yoga studio', description: STORY });
  research(v.id, '1 month unlimited intro pass $80. 20-class card $400, good for 6 months and shareable.');
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['yoga'], length: '1h' } }));
  const g = await openSetup(base, t, { hash: 'price' });
  assert.equal(g.doc.getElementById('suTprice').value, '', g.text().slice(0, 300));
  assert.ok(!g.has('#suFeeGuess'));
  assert.equal(g.cfg.researchFee, null);
  // A drop-in line pre-fills it, said to be found online.
  const w = mk({ name: 'Pranify Yoga T12 Dropin', cuisine: 'Yoga studio', description: STORY });
  research(w.id, 'Intro offer: 2 weeks unlimited $49. Drop-in class $22. 10-class pass $180.');
  const tw = tokenFor(w.id);
  await ok(change(tw, { indoor_info: { kinds: ['yoga'], length: '1h' } }));
  const gw = await openSetup(base, tw, { hash: 'price' });
  assert.equal(gw.doc.getElementById('suTprice').value, '22');
  assert.ok(gw.has('#suFeeGuess'));
  // Each kind has its own pre-fill: the same line read for a museum gives nothing.
  assert.equal(gw.cfg.researchFeeKinds.yoga, 22);
  assert.equal(gw.cfg.researchFeeKinds.museum, null);
});

test('3. Help for a class-only studio: "we\'re only open around class times", "class schedule changes weekly", "what hours do I put", "update my hours every week" get the class-times answer (EN + FR); other kinds don\'t have it', async () => {
  const { t } = await jess({ name: 'Pranify Yoga T12 Help' });
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  for (const q of ['we\'re only open around class times', 'class schedule changes weekly', 'we have about 30 classes a week from 6am to 8pm, what hours do I put', 'do I need to update my hours every week', 'what hours for classes', 'open around class times']) assert.equal(en.best(q).id, 'indoor-class-hours', q);
  for (const q of ['nous ouvrons seulement autour des cours', 'l’horaire des cours change chaque semaine', 'dois-je mettre à jour mes heures chaque semaine']) assert.equal(fr.best(q).id, 'indoor-class-hours', q);
  const a = hp(en.topic('indoor-class-hours').a), aFr = hp(fr.topic('indoor-class-hours').aFr);
  assert.match(a, /For set class days, put your first class start to your last class end\. Or tap We don’t have set hours : your Book link shows the schedule/);
  assert.match(a, /You never need to update hours weekly\./);
  assert.match(aFr, /le début de votre premier cours et la fin de votre dernier cours/);
  assert.match(aFr, /Vous n’avez jamais à mettre vos heures à jour chaque semaine/);
  // A museum has no class-times answer.
  const m = mk({ name: 'Museum T12 Help', cuisine: 'Museum' });
  const tm = tokenFor(m.id);
  await ok(change(tm, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all' }, indoor_price: 12 }));
  assert.equal(helpBot(await getText(`/owner/${tm}/setup`)).topic('indoor-class-hours'), undefined);
});

test('4. Help: an intro offer is Your prices; booking that is required is "No, please book ahead" and the link; "Free entry? You can skip this." only for a free or by-donation place (EN + FR)', async () => {
  const { t } = await jess({ name: 'Pranify Yoga T12 Help 2' });
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  for (const q of ['intro offer 2 weeks for $49', 'intro offer: 2 weeks unlimited for $49 where does that go', 'new student special', 'first week $30']) assert.ok(['indoor-price', 'menu-add'].includes(en.best(q).id), `${q}: ${en.best(q).id}`);
  assert.ok(['indoor-price', 'menu-add'].includes(fr.best('offre d’introduction 2 semaines pour 49 $').id));
  for (const q of ['online booking required, classes fill up', 'booking is required', 'you must book online', 'we always book ahead', 'classes fill up']) assert.equal(en.best(q).id, 'indoor-booking', q);
  assert.equal(fr.best('la réservation en ligne est obligatoire, les cours sont pleins').id, 'indoor-booking');
  // Busy times stay busy times ("evening classes fill up" is still a Good to know line or class nights).
  assert.ok(['indoor-busy-times', 'indoor-class-nights'].includes(en.best('evening classes fill up').id));
  const bk = hp(en.topic('indoor-booking').a), bkFr = hp(fr.topic('indoor-booking').aFr);
  assert.match(bk, /Booking always required \(classes fill up\)\? Tap No, please book ahead and paste your booking link/);
  assert.match(bk, /tap one: Yes, walk-ins welcome , Yes, but book ahead for weekends and busy times , or No, please book ahead/);
  assert.match(bkFr, /Touchez Non, réservez à l’avance et collez votre lien de réservation/);
  // Her prices answers: no "Free entry?" line for a paid studio.
  const menu = en.topic('menu-add');
  assert.doesNotMatch(hp(menu.a), /Free entry\? You can skip this/);
  assert.doesNotMatch(hp(fr.topic('menu-add').aFr), /Entrée gratuite\? Vous pouvez passer/);
  // A free gallery keeps it.
  const g = mk({ name: 'Free Gallery T12', cuisine: 'Art gallery' });
  const tg = tokenFor(g.id);
  await ok(change(tg, { indoor_info: { kinds: ['gallery'], length: '1h', book: 'no', age: 'all' }, indoor_price: 'free' }));
  assert.match(hp(helpBot(await getText(`/owner/${tg}/setup`)).topic('menu-add').a), /Free entry\? You can skip this/);
});

test('5. A yoga drop-in is "Drop-in class $22" with no "from": the page, the card, Build My Trip, the setup\'s Price screen and Help agree (EN + FR); every kind\'s page line matches its owner-side words', async () => {
  const { v, t } = await jess({ name: 'Pranify Yoga T12 Price' });
  const en = plain(pageHtml(v)), fr = plain(pageHtml(v, 'fr'));
  assert.match(en, /Drop-in class \$22\./);
  assert.doesNotMatch(en, /Drop-in class(?:es)? from/);
  assert.match(fr, /Cours à la carte 22 \$\./);
  assert.doesNotMatch(fr, /à partir de 22/);
  assert.equal(app.cardPriceFor(v.id), '$22');
  assert.equal(db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(v.id).basis, 'Drop-in class');
  assert.deepEqual(app.indoorPlannerFacts(v.id).indoorPriceLine, ['Drop-in class {x}', 'Cours à la carte {x}']);
  const g = await openSetup(base, t, { hash: 'price' });
  assert.match(g.doc.getElementById('suTpriceLead').textContent, /Your page will say “Drop-in class \$22”/);
  const bot = helpBot(await getText(`/owner/${t}/setup`));
  assert.match(hp(bot.topic('indoor-price').a), /“Drop-in class \$22”/);
  assert.doesNotMatch(hp(bot.topic('indoor-price').a) + hp(bot.topic('indoor-extras').a), /from \$22/);
  // Every kind: the owner side's words (the page's line without "from") are the public line, or the public line minus "from".
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) for (const lang of ['en', 'fr']) {
    const w = IK.indoorKindText([k], lang);
    if (w.single) assert.doesNotMatch(w.price.page, /from|à partir/, `${k} ${lang}`);
    if (w.single) assert.equal(w.price.page.replace(/\.$/, ''), `${w.price.exact} {x}`, `${k} ${lang}`);
  }
});

test('6. A class place with no set hours and a schedule link says "Class times: see the schedule", linked to it, on the page and the card (EN + FR); Build My Trip says to book a class time, never "Hours not listed"; without a link, or for a theatre, "Times vary" stays', async () => {
  const { v } = await jess({ name: 'Pranify Yoga T12 Times' });
  const h = pageHtml(v), hFr = pageHtml(v, 'fr');
  assert.match(h, /<a href="https:\/\/pranify\.example\/schedule"[^>]*>Class times: see the schedule<\/a>/);
  assert.match(plain(hFr), /Horaires des cours : voir l’horaire/);
  assert.doesNotMatch(plain(h), /Times vary · check before you go/);
  const hub = plain(await getText('/kelowna/indoor'));
  const at = hub.indexOf(v.name);
  assert.ok(at >= 0);
  assert.match(hub.slice(at, at + 400), /Class times: see the schedule/);
  const p = app.runTripPlan({ text: 'hot yoga Kelowna' }, NOW);
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(stop);
  assert.ok(stop.caveats.includes('Book a class time: see the schedule on their Book button (the owner’s own answer).'), JSON.stringify(stop.caveats));
  assert.ok(!stop.caveats.some((c) => /No usable hours listed/.test(c)), JSON.stringify(stop.caveats));
  assert.equal(frCopy.t3FrenchText('Book a class time: see the schedule on their Book button (the owner’s own answer).'), 'Réservez une heure de cours : voyez l’horaire avec leur bouton Réserver (réponse de l’établissement).');
  // No link: the general line.
  const { v: noLink } = await jess({ name: 'Pranify Yoga T12 No Link' }, {}, null);
  assert.match(plain(pageHtml(noLink)), /Times vary · check before you go/);
  // A theatre with a link: shows, not classes.
  const th = mk({ name: 'Stage T12', cuisine: 'Live theatre' });
  const tt = tokenFor(th.id);
  await ok(change(tt, { indoor_info: { kinds: ['theatre'], length: '2-3h', book: 'ahead', age: 'all', year: 'all', visit: 'appointment' }, indoor_price: 25 }));
  await ok(change(tt, { hours: NONE })); await ok(change(tt, { booking_url: 'https://stage.example/tickets' })); approveAll(th.id);
  assert.doesNotMatch(plain(pageHtml(th)), /Class times/);
});

test('7. The finish preview uses the page\'s own kind word: a museum whose words say science centre says "Science centre"', async () => {
  const v = mk({ name: 'Okanagan Science Centre T12', cuisine: 'Museum', description: 'A hands-on science centre with a planetarium.' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 12 }));
  const g = await openSetup(base, t, { hash: 'more' });
  await g.click('doneNow2');
  assert.match(g.text(), /Science centre · Kelowna/);
  assert.doesNotMatch(g.text(), /Museum · Kelowna/);
  assert.match(plain(pageHtml(v)), /Science centre/);
  const f = await openSetup(base, t, { hash: 'more', lang: 'fr' });
  await f.click('doneNow2');
  assert.match(f.text(), /Centre des sciences · Kelowna/);
});

test('8. Polish: a yoga studio\'s own Good to know chips and example (no café or lockers); no "Book ahead on weekends" chip once she said "please book ahead"; "yoga vernon" lists yoga studios first, nearest first', async () => {
  const { t } = await jess({ name: 'Pranify Yoga T12 Chips' });
  const g = await openSetup(base, t, { hash: 'bring' });
  const chips = g.doc.getElementById('suScreen').querySelectorAll('[data-key="good_to_know"]').map((b) => b.getAttribute('data-quick'));
  assert.deepEqual(chips, ['Bring water and a towel', 'Mats to rent', 'Arrive 15 minutes early']);
  assert.match(g.text(), /Mats to rent for \$3/);
  assert.ok(!chips.some((c) => /Café|Lockers|Book ahead on weekends/.test(c)));
  const f = await openSetup(base, t, { hash: 'bring', lang: 'fr' });
  assert.deepEqual(f.doc.getElementById('suScreen').querySelectorAll('[data-key="good_to_know"]').map((b) => b.getAttribute('data-quick')), ['Apportez de l’eau et une serviette', 'Tapis à louer', 'Arrivez 15 minutes d’avance']);
  // A walk-in-but-busy studio keeps the weekend chip... in the kinds that have it (a bowling alley that books ahead loses it).
  const b = mk({ name: 'Lanes T12', cuisine: 'Bowling alley' });
  const tb = tokenFor(b.id);
  await ok(change(tb, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all' }, indoor_price: 6 }));
  assert.ok((await openSetup(base, tb, { hash: 'bring' })).has('[data-quick="Book ahead on weekends"]'));
  await ok(change(tb, { indoor_info: { book: 'ahead' } }));
  assert.ok(!(await openSetup(base, tb, { hash: 'bring' })).has('[data-quick="Book ahead on weekends"]'));
  // "yoga vernon": the yoga studio first, then the places that only mention yoga.
  const cat = mk({ name: 'Cat Lounge Cafe T12', cuisine: 'Cat café', description: 'Spend an hour with adoptable cats over coffee; cat yoga on Sundays.', latitude: 49.885, longitude: -119.49 });
  await ok(change(tokenFor(cat.id), { indoor_info: { kinds: ['other'], length: '1h' } }));
  mk({ name: 'Polson Park T12', type: 'outdoor', region: 'vernon', cuisine: null, description: 'A town park.', latitude: 50.26, longitude: -119.27 });
  const s = plain(await getText(`/search?q=${encodeURIComponent('yoga vernon')}`));
  const m = /No yoga or fitness studios in Vernon\. Nearest: ([^.]*)\./.exec(s);
  assert.ok(m, s.slice(0, 500));
  const yogaAt = m[1].search(/Pranify Yoga T12/), catAt = m[1].indexOf('Cat Lounge Cafe T12');
  assert.ok(yogaAt >= 0 && (catAt < 0 || yogaAt < catAt), m[1]);
});
