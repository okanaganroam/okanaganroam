// Sport test 1 fixes (2026-11-20; Debbie, GM of a public golf course in Kelowna: setup 7.5, overwhelm 8.0, whole thing
// 6.5; drafts/fresh-eyes-sport1-2026-11-20/REPORT.md). Golf happy hour restored as an optional tile (Dayton's decision),
// the card price never an extra or a discounted line, the golf glance box quiet once she sent prices, research's Food
// line kept, chips that never contradict research, golf booking words, a month or holiday in search, Build My Trip's
// closed-for-the-season line, and the polish items. Help is in tests/sport-help-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0, ipN = 0, srv, base;
const mk = (type, o = {}) => app.createVenue({ name: `Sport One Fixture ${++n}`, slug: `sport-one-fixture-${n}`, region: 'kelowna', type, latitude: 49.9 + n / 3000, longitude: -119.4,
  rating: 4.4, reviews: 90, address: `${500 + n} Bulman Rd, Kelowna`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('07:30', '17:30')), description: 'A fixture for sport test 1.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.121.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status === 201 ? 200 : r.status, body: await r.json().catch(() => ({})) }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const NOV = new Date('2026-11-20T12:00:00-08:00');
const page = (v, lang = 'en', now = NOV) => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{[\s\S]*?\});<\/script>/.exec(html)[1].replace(/\\u003c/g, '<'));
const publishPrices = (id, items, section = 'Green fees') => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: section, note: '', items: items.map(([name, price, description = '']) => ({ name, description, price: String(price), dietary: [], check: false })) }] }));
// Debbie's research rows (the live Shadow Ridge page, Nov 20).
const RESEARCH_ROWS = [
  { label: 'Known for', text: 'Public par-71, 6,183-yard flat walkable course near Kelowna airport; no collars required.' },
  { label: 'Booking', text: 'Book online or through the golf shop. Cancel 2 hours ahead or pay a $20 per person no-show fee.' },
  { label: 'Food', text: 'Clubhouse restaurant with a licensed patio; Back 9 and Breakfast deal from April to August except Tuesdays.' },
  { label: 'Green fees', text: 'Adult 18 holes $72 ($59 after 2 pm), 9 holes $45. Junior 18 holes $39. Plus tax.' },
  { label: 'Rentals', text: 'Clubs $30 for 18 holes; power carts $23 per seat for 18; pull carts $5 a day.' },
  { label: 'Dress code', text: 'Relaxed and casual; collars not needed.' },
  { label: 'Good to know', text: 'Pace of play is 4 hours for 18 holes. Rain checks given for holes not played.' }];
const DEBBIE_PRICES = [['9 holes', 45, 'Adults'], ['18 holes', 72, 'Adults, any time before 2 PM'], ['Twilight 18 holes', 59, 'After 2 PM'], ['Junior 18 holes', 39, '17 and under'], ['Power cart', 23, 'Per seat, 18 holes'], ['Club rental', 30, '18 holes']];
const debbie = async (o = {}) => {
  const v = mk('golf', { name: `Ridge Shadow Golf Club ${n + 1}`, description: 'A flat, walkable, par-71 public course near the airport, with a full-service restaurant.', ...o });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: RESEARCH_ROWS, booking_url: 'https://example.com/tee-times', source_url: 'https://example.com/', checked_at: '2026-11-01' }));
  const t = tokenFor(v.id);
  return { v, t };
};
const setupAll = async (t) => {
  ok(await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'busy', age: 'all', year: 'seasonal' }, indoor_price: 45, open_months: '03-15:10-31' }));
  ok(await change(t, { visit_rows: { known_for: 'Public par-71, 6,183-yard flat walkable course near Kelowna airport; no collars required.' } }));
  ok(await change(t, { visit_rows: { good_to_know: 'Pace of play is 4 hours for 18 holes. Rain checks given for holes not played. Cart and club rentals. Restaurant and patio on site. Relaxed dress code, no collars needed. Members only before 9 AM Saturdays.' } }));
  ok(await change(t, { visit_rows: { groups: 'Groups of 12 or more: please book ahead. Tournaments and corporate golf. Weddings and private events. . Charity tournaments up to 144 golfers.' } }));
};

test('1. the card price: a golf course\'s power cart, junior rate and club rental never lower it; once a Price is typed no line does, else the lowest adult green-fee line', async () => {
  const { v, t } = await debbie();
  await setupAll(t);
  publishPrices(v.id, DEBBIE_PRICES);
  ok(await change(t, { indoor_price: 45 }));
  app.indoorCardPrice(v.id);
  assert.equal(app.cardPriceFor(v.id), 'From $45');
  const en = page(v), fr = page(v, 'fr');
  assert.ok(en.includes('Green fees from $45.'), 'page');
  assert.ok(!/from \$23|from \$39|from \$30/i.test(en), 'never an extra');
  assert.ok(fr.includes('Droits de jeu à partir de 45 $.'), 'French page');
  // The setup's price screen and Help read the same lowest price.
  const cfg = cfgOf(await getText(`/owner/${t}/setup`));
  assert.ok(cfg.indoorLow == null || cfg.indoorLow >= 45, `setup low ${cfg.indoorLow}`);
  // Sport fix round 16 (THE SPORT CARD RULE): once she typed a Price, no line lowers it, not even a cheaper adult green fee.
  publishPrices(v.id, DEBBIE_PRICES.concat([['Walking 9 holes, weekdays', 40, 'Adults']]));
  app.indoorCardPrice(v.id);
  assert.equal(app.cardPriceFor(v.id), 'From $45');
  // With no Price typed, her lowest plain 18-hole green fee sets the card (her list has 18-hole lines, so a 9-hole one is
  // a different round).
  ok(await change(t, { indoor_price: null }));
  app.indoorCardPrice(v.id);
  assert.equal(app.cardPriceFor(v.id), 'From $72');
});

test('2. every sport kind: extras and discounted people\'s lines never become the headline price', async () => {
  const LOW = [['Power cart', 10], ['Club rental', 9], ['Skate rental', 5], ['Junior rate', 8], ['Senior rate', 7], ['Kids under 12', 6], ['Youth drop-in', 4], ['Monthly membership', 3], ['Lesson, 30 minutes', 2]];
  const KINDS = { golf: 'golf', simgolf: 'golf', rink: 'sport', swim: 'sport', courts: 'sport', bike: 'sport', sportsctr: 'sport', discgolf: 'sport', skatepark: 'sport', sportother: 'sport' };
  const bad = [];
  for (const [k, type] of Object.entries(KINDS)) {
    const v = mk(type);
    const t = tokenFor(v.id);
    ok(await change(t, { indoor_info: { kinds: [k] }, indoor_price: 20 }));
    publishPrices(v.id, LOW, 'Prices');
    app.indoorCardPrice(v.id);
    const cp = app.cardPriceFor(v.id);
    if (!/\$20\b/.test(cp)) bad.push(`${k}: ${cp}`);
  }
  // A range's bucket and a ski school's lesson are their main prices. Sport fix round 16: her typed $15 holds; with no
  // Price typed, the cheaper bucket sets the card.
  const r = mk('golf', { name: 'Bucket Range Fixture' }); const rt = tokenFor(r.id);
  ok(await change(rt, { indoor_info: { kinds: ['range'] }, indoor_price: 15 })); publishPrices(r.id, [['Small bucket', 10]], 'Range'); app.indoorCardPrice(r.id);
  if (!/\$15\b/.test(app.cardPriceFor(r.id))) bad.push(`range bucket typed: ${app.cardPriceFor(r.id)}`);
  ok(await change(rt, { indoor_price: null })); app.indoorCardPrice(r.id);
  if (!/\$10\b/.test(app.cardPriceFor(r.id))) bad.push(`range bucket, no Price: ${app.cardPriceFor(r.id)}`);
  assert.deepEqual(bad, []);
});

test('3. the golf glance box: no "not yet verified" or "Value index unavailable" once she has sent prices', async () => {
  const gd = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'golf-course-data.json'), 'utf8'));
  const key = Object.keys(gd.courses).find((k) => k === 'kelowna/shadow-ridge-golf-club') || Object.keys(gd.courses).find((k) => gd.courses[k].fees && !['published', 'dynamic'].includes(gd.courses[k].fees.status));
  const [region, slug] = key.split('/');
  const { v, t } = await debbie({ slug, region });
  const before = page(v);
  ok(await change(t, { indoor_info: { kinds: ['golf'] }, indoor_price: 45 }));
  publishPrices(v.id, DEBBIE_PRICES);
  const after = page(v);
  assert.match(before, /not yet verified|not currently verified|Value index unavailable/, 'research\'s unverified line before');
  assert.doesNotMatch(after, /not yet verified|not currently verified|Value index unavailable/, 'quiet once she has prices');
});

test('4. research\'s Food line stays on her page after her answers fill the box (every kind)', async () => {
  const { v, t } = await debbie();
  await setupAll(t);
  publishPrices(v.id, DEBBIE_PRICES);
  ok(await change(t, { indoor_price: 45 }));
  const info = app.venueVisitInfo(v.id);
  assert.ok(info.rows.some((r) => r.label === 'Food'), JSON.stringify(info.rows.map((r) => r.label)));
  assert.match(page(v), /Clubhouse restaurant with a licensed patio/);
  // Groups: ". ." is one stop.
  assert.ok(info.rows.some((r) => r.label === 'Groups' && /private events\. Charity/.test(r.text)), JSON.stringify(info.rows.find((r) => r.label === 'Groups')));
  // A skate park with a researched Food line and a full box keeps it too.
  const sk = mk('sport', { name: 'Food Row Skate Park' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(sk.id, JSON.stringify({ rows: [{ label: 'Known for', text: 'The bowl.' }, { label: 'Food', text: 'Concession stand open in summer.' }, { label: 'Parking', text: 'Free lot.' }, { label: 'Washrooms', text: 'By the field.' }, { label: 'Lights', text: 'Lit until 10 PM.' }], source_url: 'https://example.com', checked_at: '2026-11-01' }));
  const st = tokenFor(sk.id);
  ok(await change(st, { indoor_info: { kinds: ['skatepark'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 'free' }));
  ok(await change(st, { visit_rows: { good_to_know: 'Helmets recommended.', groups: 'Youth jam nights on Fridays.' } }));
  assert.ok(app.venueVisitInfo(sk.id).rows.some((r) => r.label === 'Food'), JSON.stringify(app.venueVisitInfo(sk.id).rows.map((r) => r.label)));
});

test('5. golf happy hour: the optional tile for a golf course and a simulator, a range only with a bar, never another sport kind; saved happy hour is found by search', async () => {
  const kinds = [['golf', 'golf', {}, true], ['simgolf', 'golf', {}, true], ['range', 'golf', { description: 'A grass driving range.' }, false], ['range', 'golf', { description: 'A driving range with a licensed patio bar.' }, true],
    ['rink', 'sport', { description: 'An arena with a lounge.' }, false], ['courts', 'sport', { description: 'Courts by the pub.' }, false], ['skatepark', 'sport', { happy_hour: 1 }, false]];
  for (const [k, type, o, want] of kinds) {
    const v = mk(type, o); const t = tokenFor(v.id);
    ok(await change(t, { indoor_info: { kinds: [k] } }));
    const cfg = cfgOf(await getText(`/owner/${t}/setup`));
    assert.equal(cfg.steps.includes('happy') && cfg.part2.includes('happy') && cfg.happyHour === true, want, `${k} ${JSON.stringify(o)}`);
    if (!want) assert.equal((await change(t, { happy_hour: { mon: [['15:00', '17:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } })).status === 200 && !!app.getVenue(v.id).happy_hour && !o.happy_hour, false, `${k}: no happy hour saved`);
  }
  const { v, t } = await debbie();
  await setupAll(t);
  const sim = await openSetup(base, t, { hash: 'more' });
  assert.match(sim.text(), /Happy hour/, 'the tile');
  const hh = Object.fromEntries(DAYS.map((d) => [d, [['15:00', '17:00']]]));
  ok(await change(t, { happy_hour: hh, badges: { happy_hour: true, patio: true } }));
  assert.equal(!!app.getVenue(v.id).happy_hour, true);
  assert.match(page(v, 'en', new Date('2026-07-15T12:00:00-07:00')), /Happy hour|happy hour/i);
  // Sport test 16 (2026-11-21): search only finds a happy hour visitors can see today, never while the course is closed for
  // the season (a golf course is closed in winter unless it says so), so it is found or not by today's date.
  const seen = !app.happyHourHiddenNow(app.getVenue(v.id));
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const r = plain(await getText(`/search?q=${encodeURIComponent('golf patio happy hour kelowna')}`));
    assert.equal(r.includes(app.getVenue(v.id).name), seen, r.slice(0, 1200));
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('6. golf booking: "book ahead for busy times" pre-picked; the page says walk-ons in golf words, never "Walk-ins welcome"; every sport kind\'s words', async () => {
  const { v, t } = await debbie();
  const sim = await openSetup(base, t, { hash: 'booking' });
  assert.ok(sim.has('[data-tpick="book:busy"][aria-pressed="true"]'), 'busy pre-picked');
  assert.match(sim.text(), /Walk-ons when there’s room; book tee times for busy times/);
  await setupAll(t);
  const en = page(v), fr = page(v, 'fr');
  assert.match(en, /Walk-ons when there’s room\. Book tee times for weekends and busy times\./);
  assert.doesNotMatch(en, /Walk-ins welcome/);
  assert.match(fr, /Départs sans réservation s’il y a de la place/);
  // Build My Trip's note in golf words, EN and FR.
  const f = app.buildTripPlannerFacts(true).find((x) => x.id === v.id);
  assert.match(f.indoorBookNote, /^Walk-ons when there’s room/);
  const want = { simgolf: [/bay/, 'golf'], courts: [/court|First come/, 'sport'], skischool: [/lesson/i, 'sport'], skatepark: [/Open to everyone/, 'sport'], rink: [/public skating|Walk-ins|Drop in/, 'sport'] };
  for (const [k, [re, type]] of Object.entries(want)) {
    const x = mk(type); const xt = tokenFor(x.id);
    const book = k === 'skatepark' || k === 'rink' ? 'no' : 'busy';
    ok(await change(xt, { indoor_info: { kinds: [k], book } }));
    const line = (app.indoorVisitLines(app.getVenue(x.id), app.venueIndoorInfo(x.id)).Booking || {}).en || '';
    assert.match(line, re, `${k}: ${line}`);
    if (k !== 'rink') assert.doesNotMatch(line, /Walk-ins welcome\./, k);
  }
});

test('7. chips never contradict research: no "Dress code: collared shirts" beside "collars not needed"; outdoor kinds\' dog tile never says inside', async () => {
  const { v, t } = await debbie();
  const cfg = cfgOf(await getText(`/owner/${t}/setup`));
  assert.ok(cfg.gtkHide.includes('Dress code: collared shirts'), JSON.stringify(cfg.gtkHide));
  assert.equal(cfg.offerLabels.dog_friendly, 'Dogs welcome');
  const sim = await openSetup(base, t, { hash: 'bring' });
  assert.doesNotMatch(sim.text(), /Dress code: collared shirts/);
  assert.match(sim.text(), /Restaurant and patio on site/);
  const frCfg = cfgOf(await getText(`/fr/owner/${t}/setup`));
  assert.ok(frCfg.gtkHide.some((c) => /^Code vestimentaire/.test(c)), JSON.stringify(frCfg.gtkHide));
  // A course whose research says nothing about dress still gets the chip.
  const plainCourse = mk('golf', { name: 'Plain Course Fixture' });
  assert.deepEqual(cfgOf(await getText(`/owner/${tokenFor(plainCourse.id)}/setup`)).gtkHide, []);
  // An arena (indoors) keeps "inside".
  const ar = mk('sport', { name: 'Inside Arena Fixture' }); const at = tokenFor(ar.id);
  ok(await change(at, { indoor_info: { kinds: ['rink'] } }));
  assert.equal(cfgOf(await getText(`/owner/${at}/setup`)).offerLabels.dog_friendly, 'Dogs welcome inside');
});

test('8. search with a holiday or a month: closed for the season out of season; "golf in july" applies July (EN and FR), with no "can\'t apply" note', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const { v, t } = await debbie({ name: 'Seasonal Ridge Golf Fixture' });
    await setupAll(t);
    const name = app.getVenue(v.id).name;
    const cardOf = (html) => { const p = plain(html); const i = p.indexOf(name); return i < 0 ? '' : p.slice(i, i + 260); };
    const xmas = await getText(`/search?q=${encodeURIComponent('golf christmas day kelowna')}`);
    assert.match(cardOf(xmas), /Closed for the season \(reopens Mar 15\)/, cardOf(xmas));
    assert.doesNotMatch(cardOf(xmas), /usual Friday hours/);
    for (const [q, re, lang] of [['golf in july kelowna', /Open in July/, 'en'], ['golf kelowna january', /Closed in January \(reopens Mar 15\)/, 'en'], ['golf en juillet kelowna', /Ouvert en juillet/, 'fr']]) {
      const html = await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`);
      assert.match(cardOf(html), re, `${q}: ${cardOf(html)}`);
      assert.doesNotMatch(plain(html), /isn’t something search can apply|n’est pas quelque chose/, q);
    }
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('9. Build My Trip out of season names her course closed for the season with the day it reopens (EN and FR)', async () => {
  const { v, t } = await debbie({ name: 'Trip Ridge Golf Fixture', region: 'peachland', latitude: 49.77, longitude: -119.73 });
  await setupAll(t);
  const open = mk('golf', { name: 'Year Round Golf Fixture', region: 'peachland', latitude: 49.78, longitude: -119.73 });
  ok(await change(tokenFor(open.id), { indoor_info: { kinds: ['golf'], year: 'all' } }));
  const p = app.runTripPlan({ text: 'golf in Peachland on January 16' }, new Date('2026-11-20T12:00:00-08:00'));
  const all = JSON.stringify([p.warnings, p.notes]);
  assert.match(all, new RegExp(`Closed for the season: [^"]*${app.getVenue(v.id).name} \\(reopens Mar 15\\)`), all.slice(0, 1500));
  const fr = require('../trip-french-copy.js');
  const line = (p.warnings || []).concat(p.notes || []).find((x) => /^Closed for the season/.test(x));
  const frText = fr.t3FrenchText(line);
  assert.match(frText, /^Fermés pour la saison : .*\(réouverture le 15 mars\)\.$/, frText);
});

test('10. polish: no shoulder-season hint for a golf course; season dates from research; 9 holes on the first price line; no French asked for a line she only confirmed', async () => {
  const v = mk('golf', { name: 'Polish Course Fixture' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Season', text: 'Open April to October, weather permitting.' }, { label: 'Known for', text: 'Lake views from the back nine.' }], source_url: 'https://example.com', checked_at: '2026-11-01' }));
  const t = tokenFor(v.id);
  const cfg = cfgOf(await getText(`/owner/${t}/setup`));
  assert.deepEqual(cfg.researchOpen, { from: '04-01', to: '10-31' });
  ok(await change(t, { indoor_info: { kinds: ['golf'] } }));
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  await sim.click('yearClosed');
  assert.match(sim.text(), /April|avr|Apr/, 'the season boxes');
  assert.doesNotMatch(sim.text(), /shoulder season/);
  // "$45 for 9 holes": the holes ride along with the price and name the first line of her price list.
  ok(await change(t, { indoor_info: { holes: 9 }, indoor_price: 45 }));
  const m = /"firstItem":\{"name":"([^"]*)"/.exec(await getText(`/owner/${t}/menu`));
  assert.equal(m && m[1], '9 holes');
  const mf = /"firstItem":\{"name":"([^"]*)"/.exec(await getText(`/fr/owner/${t}/menu`));
  assert.equal(mf && mf[1], '9 trous');
  // Confirming research's Known for unchanged queues no French.
  const before = db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id).n;
  ok(await change(t, { visit_rows: { known_for: 'Lake views from the back nine.' } }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id).n, before);
  // A simulator (no season) still has the shoulder hint; an arena (winter) doesn't.
  const sg = mk('golf', { name: 'Sim Lounge Fixture' }); const sgt = tokenFor(sg.id);
  ok(await change(sgt, { indoor_info: { kinds: ['simgolf'] } }));
  const sgs = await openSetup(base, sgt, { hash: 'hours:year' });
  await sgs.click('yearClosed');
  assert.match(sgs.text(), /shoulder season/);
});
