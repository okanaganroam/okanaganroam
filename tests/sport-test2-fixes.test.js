// Sport test 2 fixes (2026-11-20; Trevor, co-owner of a golf simulator lounge in Kelowna: setup 7.5, overwhelm 8.0, whole
// thing 6.0; drafts/fresh-eyes-sport2-2026-11-20/REPORT.md). Round 1's golf-course fixes made general: every layout carries
// the happy hour deals its link jumps to, the golf hub card speaks the sport kind, Build My Trip offers simulators when the
// courses are closed and plans a sim then drinks, the golf winter rule (Dayton approved), no sports-TV nudge for sport
// kinds, English search finds every simulator as French does, Help for his 38 questions and ~18 price-list questions per
// kind, research's walk-in words pre-pick booking, the owner's "19+ after 8 PM" read into Ages, research lines kept, French
// polish, and no golf-course words on another kind's screens. Each fix is swept over every kind it can apply to.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test2-admin-token';
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
const mk = (type, o = {}) => app.createVenue({ name: `Sport Two Fixture ${++n}`, slug: `sport-two-fixture-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 3000, longitude: -119.47,
  rating: 4.4, reviews: 90, address: `${700 + n} Vaughan Ave, Kelowna`, phone: '250-555-0188', website: 'https://example.com', hours: JSON.stringify(WK('10:00', '23:00')), description: 'A fixture for sport test 2.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.122.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status === 201 ? 200 : r.status, body: await r.json().catch(() => ({})) }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const NOV = new Date('2026-11-18T15:30:00-08:00');
const html = (v, lang = 'en', now = NOV) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const page = (v, lang = 'en', now = NOV) => plain(html(v, lang, now));
const cfgOf = (h) => JSON.parse(/window\.SETUP_CFG = (\{[\s\S]*?\});<\/script>/.exec(h)[1].replace(/\\u003c/g, '<'));
const setHH = (id, deals) => db.prepare("UPDATE venues SET happy_hour = 1, happy_hour_times = ?, happy_hour_source = 'venue_owner', happy_hour_checked_at = date('now'), happy_hour_deals = ?, happy_hour_deals_source = 'venue_owner', happy_hour_deals_checked_at = date('now') WHERE id = ?")
  .run(JSON.stringify(WK('15:00', '17:00', ['mon', 'tue', 'wed', 'thu', 'fri'])), JSON.stringify(deals), id);
const visit = (id, rows, extra = {}) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(id, JSON.stringify({ rows, source_url: 'https://example.com/', checked_at: '2026-11-01', ...extra }));
const SIM_DESC = 'An indoor golf simulator lounge with four bays and a licensed bar.';
// Trevor's research rows (the live Okanagan Virtual Golf Kelowna page, Nov 20).
const TREVOR_ROWS = [
  { label: 'Green fees', text: 'Priced per bay per hour, not per person (1 to 8 people): Mon to Fri before 5:30 pm $45, evenings and weekends $60.' },
  { label: 'Booking', text: 'Book online or by phone. Walk-ins welcome; booking ahead recommended. Cancel at least 24 hours ahead for a full refund.' },
  { label: 'Rentals', text: 'Club rental $10 per reservation.' },
  { label: 'Practice', text: 'Lessons with outside PGA of Canada pros; contact the pro directly. Punch pass: load $300, get $375.' },
  { label: 'Food', text: 'Full bar with beer on tap, cocktails and wine. Pizza is available in store.' },
  { label: 'Groups', text: 'Events for about 50 people; outside catering allowed. Winter scramble leagues run 5 weeks (currently full, waitlist open).' }];

test('1. every layout, EN and FR: a "See the deals" link always has its deals card, and the deals show (a simulator, a course, a sport place, an indoor place, a pub, GOLFBOX)', async () => {
  const cases = [['golf', { description: SIM_DESC }], ['golf', { description: 'An 18-hole public course, open year-round when the weather allows.' }], ['sport', { description: 'A community arena.' }], ['indoor', { description: 'A bowling alley.' }],
    ['pub', { description: 'A neighbourhood pub.' }], ['beach', { description: 'A sandy beach.' }], ['golf', { region: 'west-kelowna', slug: 'golfbox', name: 'GOLFBOX Fixture', description: SIM_DESC }]];
  const bad = [];
  for (const [type, o] of cases) {
    const v = mk(type, o);
    setHH(v.id, [{ text: '$6 local pints, $7 house wine' }]);
    for (const lang of ['en', 'fr']) {
      const h = html(v, lang);
      if (/href="#venueDeals"/.test(h) && !/id="venueDeals"/.test(h)) bad.push(`${type} ${o.description || o.slug} [${lang}]: link without its card`);
      if (!/\$6 local pints/.test(h)) bad.push(`${type} ${o.description || o.slug} [${lang}]: no deals`);
    }
  }
  assert.deepEqual(bad, []);
  // The English simulator page has the "Happy hour today" line under the open-now line too, as the French one does.
  const sim = mk('golf', { description: SIM_DESC }); setHH(sim.id, [{ text: '$6 pints' }]);
  assert.match(html(sim, 'en', new Date('2026-11-18T15:30:00-08:00')), /id="venueHappyHour"/);
});

test('2. the golf hub card speaks the sport kind: a simulator "Per bay, per hour" (« Par baie, à l’heure »), a course "Green fees", in town and valley hubs, EN and FR', async () => {
  const sim = mk('golf', { name: 'Hub Sim Lounge Fixture', description: SIM_DESC });
  ok(await change(tokenFor(sim.id), { indoor_info: { kinds: ['simgolf'] }, indoor_price: 45 }));
  const course = mk('golf', { name: 'Hub Course Fixture', description: 'An 18-hole public course.' });
  ok(await change(tokenFor(course.id), { indoor_info: { kinds: ['golf'] }, indoor_price: 65 }));
  const near = (p, name) => { const i = p.indexOf(name); return i < 0 ? '' : p.slice(i, i + 600); };
  for (const [path, simWord, courseWord] of [['/kelowna/golf', 'Per bay, per hour', 'Green fees'], ['/golf', 'Per bay, per hour', 'Green fees'], ['/fr/kelowna/golf', 'Par baie, à l’heure', 'Droits de jeu']]) {
    const p = plain(await getText(path));
    assert.ok(near(p, 'Hub Sim Lounge Fixture').includes(simWord), `${path} sim: ${near(p, 'Hub Sim Lounge Fixture').slice(0, 300)}`);
    assert.ok(!/Green fees|Droits de jeu/i.test(near(p, 'Hub Sim Lounge Fixture').split(/Hub Course Fixture/)[0]), `${path}: no green fees on the sim card`);
    assert.ok(near(p, 'Hub Course Fixture').includes(courseWord), `${path} course`);
  }
  // Every sport kind a golf listing can have: its card words.
  for (const k of ['golf', 'simgolf', 'range']) assert.equal(app.golfCardBasis({ id: -1, type: 'golf', description: '' }, { golf: 'courses', simgolf: 'simulators', range: 'practice' }[k]), SK.K[k].en.price.basis, k);
});

test('3. the golf winter rule: a course with no season reads "Usually closed for the season" Nov 1 – Mar 14 (EN + FR); simulators, covered ranges, owner seasons and year-round words are exempt', async () => {
  assert.equal(app.GOLF_WINTER_RULE_ON, true);
  const JAN = new Date('2027-01-16T12:00:00-08:00'), JUL = new Date('2027-07-16T12:00:00-07:00');
  const course = mk('golf', { name: 'Winter Rule Course Fixture', description: 'An 18-hole public course with lake views.' });
  assert.match(page(course, 'en', JAN), /Usually closed for the season \(check before you go\)/);
  assert.match(page(course, 'fr', JAN), /Habituellement fermé pour la saison \(vérifiez avant d’y aller\)/);
  assert.doesNotMatch(page(course, 'en', JUL), /Usually closed for the season/);
  assert.doesNotMatch(page(course, 'en', JAN), /Reopens/, 'a usual season names no reopening day');
  const exempt = [
    ['a simulator', mk('golf', { description: SIM_DESC })],
    ['a covered range', mk('golf', { name: 'Covered Range Fixture', description: 'A driving range with heated, covered stalls.' })],
    ['year-round words', mk('golf', { name: 'Desert Course Fixture', description: 'A desert course open year-round, weather permitting.' })],
  ];
  const own = mk('golf', { name: 'Own Season Course Fixture', description: 'An 18-hole course.' });
  ok(await change(tokenFor(own.id), { indoor_info: { kinds: ['golf'], year: 'seasonal' }, open_months: '04-01:10-15' }));
  const all = mk('golf', { name: 'All Year Course Fixture', description: 'An 18-hole course.' });
  ok(await change(tokenFor(all.id), { indoor_info: { kinds: ['golf'], year: 'all' } }));
  exempt.push(['the owner\'s "all year"', all]);
  const map = app.golfWinterSeasonMap();
  assert.ok(map.has(course.id));
  for (const [why, v] of exempt) { assert.ok(!map.has(v.id), why); assert.doesNotMatch(page(v, 'en', JAN), /Usually closed for the season/, why); }
  assert.ok(!map.has(own.id), 'own season');
  assert.match(page(own, 'en', JAN), /Closed for the season/);
  // A sport listing whose owner picked the golf course kind is covered too; with simulators picked it isn't.
  const sportGolf = mk('sport', { name: 'Sport Kind Golf Fixture' }); ok(await change(tokenFor(sportGolf.id), { indoor_info: { kinds: ['golf'] } }));
  const sportSim = mk('golf', { name: 'Owner Sim Fixture', description: 'A golf place.' }); ok(await change(tokenFor(sportSim.id), { indoor_info: { kinds: ['simgolf'] } }));
  assert.ok(app.golfWinterSeasonMap().has(sportGolf.id));
  assert.ok(!app.golfWinterSeasonMap().has(sportSim.id));
  // The per-course season notes in data/golf-course-data.json set better dates where they name the opening month.
  const ok2 = mk('golf', { name: 'The Okanagan Golf Club Bear Fixture', region: 'kelowna', slug: 'okanagan-golf-club-bear-course', description: 'An 18-hole course.' });
  assert.equal(app.golfWinterSeasonMap().get(ok2.id), '03-01:10-31');
});

test('4. Build My Trip off season: plain "golf" in January or this Saturday (November) plans simulators, says why and names the closed courses; never a course', async () => {
  const town = { region: 'peachland', latitude: 49.77, longitude: -119.73 };
  const course = mk('golf', { name: 'Peach Course Fixture', description: 'An 18-hole public course.', ...town });
  const sim = mk('golf', { name: 'Peach Sim Fixture', description: SIM_DESC, ...town, kid_friendly: 1 });
  for (const q of ['golf in Peachland on January 16', 'golf in January in Peachland', 'my 10 year old wants to golf this Saturday in Peachland']) {
    const p = app.runTripPlan({ text: q }, NOV);
    const all = JSON.stringify(p);
    assert.ok(all.includes('Peach Sim Fixture'), `${q}: the simulator`);
    assert.ok(!JSON.stringify([p.recommendations, p.itinerary, p.days]).includes('Peach Course Fixture'), `${q}: no closed course planned`);
    assert.match(JSON.stringify(p.warnings), /Closed for the season: [^"]*Peach Course Fixture/, q);
    assert.match(JSON.stringify(p.warnings), /Most golf courses are closed in (January|November), so these are indoor golf simulators\./, q);
    assert.match(String(p.summary), /Indoor golf/, q);
  }
  const fr = require('../trip-french-copy.js');
  assert.equal(fr.t3FrenchText('Most golf courses are closed in January, so these are indoor golf simulators.'), 'La plupart des terrains de golf sont fermés en janvier, alors voici des simulateurs de golf intérieur.');
  // In July the course is planned.
  const jul = app.runTripPlan({ text: 'golf in Peachland on July 16' }, NOV);
  assert.ok(JSON.stringify(jul.recommendations).includes('Peach Course Fixture'));
});

test('5. Build My Trip: "golf simulator saturday night then drinks" plans the sim then a drinks stop; "golf and happy hour" finds an owner\'s happy hour at every kind that has one', async () => {
  const town = { region: 'summerland', latitude: 49.6, longitude: -119.67 };
  const sim = mk('golf', { name: 'Summer Sim Bar Fixture', description: SIM_DESC, ...town, hours: JSON.stringify(WK('10:00', '23:30')) });
  setHH(sim.id, [{ text: '$6 pints' }]);
  mk('pub', { name: 'Summer Pub Fixture', description: 'A pub with local beer.', ...town, hours: JSON.stringify(WK('11:00', '23:59')) });
  const p = app.runTripPlan({ text: 'golf simulator saturday night then drinks in Summerland' }, NOV);
  const stops = ((p.itinerary && p.itinerary.stops) || []).filter((s) => s.venue).map((s) => s.venue);
  assert.ok(stops.length >= 2, JSON.stringify(p.warnings));
  assert.equal(stops[0].name, 'Summer Sim Bar Fixture');
  assert.ok(['pub', 'cocktail', 'distillery', 'brewery'].includes(stops[1].type) || stops[1].name === 'Summer Sim Bar Fixture', JSON.stringify(stops));
  assert.doesNotMatch(JSON.stringify(p), /golf simulator restaurants|Golf courses and/);
  assert.match(String(p.summary), /Indoor golf/);
  // "golf and happy hour": the simulator's own happy hour (Mon–Fri 3–5), and a course or range with a bar in summer.
  const hh = app.runTripPlan({ text: 'golf and happy hour in Summerland on Wednesday' }, NOV);
  assert.ok(JSON.stringify(hh.recommendations).includes('Summer Sim Bar Fixture'), JSON.stringify(hh.notes));
  assert.doesNotMatch(JSON.stringify(hh.notes), /No place here is listed with happy hour/);
  const course = mk('golf', { name: 'Summer Course Bar Fixture', description: 'An 18-hole course with a patio bar.', ...town });
  setHH(course.id, [{ text: '$6 pints' }]);
  const range = mk('golf', { name: 'Summer Range Bar Fixture', description: 'A driving range with a licensed patio bar.', ...town });
  setHH(range.id, [{ text: '$6 pints' }]);
  const july = app.runTripPlan({ text: 'golf and happy hour in Summerland on July 14' }, NOV);
  for (const nm of ['Summer Course Bar Fixture', 'Summer Range Bar Fixture']) assert.ok(JSON.stringify(july.recommendations).includes(nm), `${nm}: ${JSON.stringify(july.notes)}`);
  // French: « golf intérieur » is understood.
  const f = app.runTripPlan({ text: 'golf intérieur à Summerland samedi soir' }, NOV);
  assert.deepEqual((f.understood || {}).notUsed || [], []);
  assert.ok(JSON.stringify(f).includes('Summer Sim Bar Fixture'));
});

test('6. rainy days: Build My Trip and search include simulators and indoor sport places (an arena), never a skate park; the town Indoor page is unchanged', async () => {
  const town = { region: 'lake-country', latitude: 50.05, longitude: -119.41 };
  const sim = mk('golf', { name: 'Rainy Sim Fixture', description: SIM_DESC, ...town });
  const arena = mk('sport', { name: 'Rainy Arena Fixture', description: 'Public skating and drop-in hockey.', ...town });
  ok(await change(tokenFor(arena.id), { indoor_info: { kinds: ['rink'] } }));
  const skate = mk('sport', { name: 'Rainy Skate Park Fixture', description: 'A concrete skate park.', ...town });
  ok(await change(tokenFor(skate.id), { indoor_info: { kinds: ['skatepark'] } }));
  mk('indoor', { name: 'Rainy Museum Fixture', description: 'A local history museum.', ...town });
  const p = app.runTripPlan({ text: 'rainy day ideas in Lake Country' }, NOV);
  const recs = JSON.stringify(p.recommendations || p);
  assert.ok(recs.includes('Rainy Sim Fixture') && recs.includes('Rainy Arena Fixture'), recs.slice(0, 600));
  assert.ok(!recs.includes('Rainy Skate Park Fixture'));
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const r = plain(await getText(`/search?q=${encodeURIComponent('rainy day lake country')}`));
    for (const nm of ['Rainy Sim Fixture', 'Rainy Arena Fixture', 'Rainy Museum Fixture']) assert.ok(r.includes(nm), `${nm}: ${r.slice(0, 500)}`);
    assert.ok(!r.includes('Rainy Skate Park Fixture'));
  } finally { delete process.env.DISCOVERY_SEARCH; }
  const hub = plain(await getText('/lake-country/indoor'));
  assert.ok(!hub.includes('Rainy Sim Fixture') && !hub.includes('Rainy Arena Fixture'), 'the town Indoor page lists what it always did');
});

test('7. the sports-TV nudge never shows in a sport or golf setup (no Sports TV tile to answer it); a pub still gets it', async () => {
  for (const [type, kind] of [['golf', 'simgolf'], ['golf', 'golf'], ['sport', 'rink'], ['sport', 'courts']]) {
    const v = mk(type, { description: 'A place with big screens and sports on TV, plus mocktails.' });
    const t = tokenFor(v.id);
    ok(await change(t, { indoor_info: { kinds: [kind] } }));
    for (const hash of ['offer', 'story', '']) {
      const sim = await openSetup(base, t, hash ? { hash } : {});
      assert.doesNotMatch(sim.text(), /still mentions sports|Fix my description|You can change that in your description/, `${kind} ${hash}`);
    }
  }
  const pub = mk('pub', { description: 'A pub with big screens for the game.' });
  const cfg = cfgOf(await getText(`/owner/${tokenFor(pub.id)}/setup`));
  assert.ok(cfg.offerGroups.some((g) => g.keys.includes('sports_tv')), 'a pub has the tile, so its nudge stays');
});

test('8. English search finds every simulator as French does ("golf simulator", "indoor golf", "sim golf", « golf intérieur »); each sport kind\'s words, EN and FR, find the place with and without its owner\'s kind', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const town = { region: 'oliver', latitude: 49.18, longitude: -119.55 };
    const own = mk('golf', { name: 'Oliver Sim Own Fixture', description: SIM_DESC, ...town });
    ok(await change(tokenFor(own.id), { indoor_info: { kinds: ['simgolf'] } }));
    mk('golf', { name: 'Oliver Sim Words Fixture', description: 'Three TrackMan simulator bays and lessons.', ...town });
    mk('golf', { name: 'Oliver Indoor Golf Fixture', description: 'Indoor golf all winter, with a lounge.', ...town });
    mk('golf', { name: 'Oliver Course Fixture', description: 'An 18-hole desert course.', ...town });
    const SIMS = ['Oliver Sim Own Fixture', 'Oliver Sim Words Fixture', 'Oliver Indoor Golf Fixture'];
    for (const [lang, q] of [['en', 'golf simulator oliver'], ['en', 'indoor golf oliver'], ['en', 'sim golf oliver'], ['en', 'golf simulators oliver'], ['fr', 'simulateur de golf oliver'], ['fr', 'golf intérieur oliver']]) {
      const r = plain(await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
      for (const nm of SIMS) assert.ok(r.includes(nm), `${q}: ${nm}`);
      assert.ok(!r.includes('Oliver Course Fixture'), `${q}: no course`);
      assert.doesNotMatch(r, /aren’t applied to search|ne s’appliquent pas/, `${q}: indoor is not a rainy day`);
    }
    // Every sport kind: its owner-picked category word and a listing that only says the kind's words in its description.
    const bad = [];
    const FR_Q = { rink: 'patinoire', skatepark: 'planchodrome', discgolf: 'disque-golf', bike: 'piste de bmx', swim: 'piscine extérieure', courts: 'pickleball', sportsctr: 'centre sportif', range: 'champ de pratique', skischool: 'cours de ski' };
    const EN_DESC = { rink: 'An ice rink with public skating.', skatepark: 'A skate park with a bowl.', discgolf: 'An 18-hole disc golf course.', bike: 'A BMX track for all ages.', swim: 'An outdoor pool with a slide.', courts: 'Six pickleball courts.', sportsctr: 'A sports centre with a gym.', range: 'A driving range with grass tees.', skischool: 'Ski and snowboard lessons for kids and adults.' };
    let i = 0;
    for (const [k, q] of Object.entries(FR_Q)) {
      const reg = ['naramata', 'penticton', 'okanagan-falls', 'osoyoos', 'kaleden', 'enderby', 'armstrong', 'lumby', 'coldstream'][i++];
      const t2 = { region: reg, latitude: 49.5 + i / 50, longitude: -119.6 };
      const type = ['range'].includes(k) ? 'golf' : 'sport';
      const a = mk(type, { name: `Kind ${k} Own Fixture`, description: EN_DESC[k], ...t2 }); ok(await change(tokenFor(a.id), { indoor_info: { kinds: [k] } }));
      mk(type, { name: `Kind ${k} Words Fixture`, description: EN_DESC[k], ...t2 });
      const town = reg.replace(/-/g, ' ');
      const en = plain(await getText(`/search?q=${encodeURIComponent(`${k === 'skischool' ? 'ski lessons' : SK.K[k].en.search[0]} ${town}`)}`));
      const fr = plain(await getText(`/fr/search?q=${encodeURIComponent(`${q} ${town}`)}`));
      for (const [lang, r] of [['en', en], ['fr', fr]]) for (const nm of [`Kind ${k} Own Fixture`, `Kind ${k} Words Fixture`]) if (!r.includes(nm)) bad.push(`${k} [${lang}]: ${nm}`);
    }
    assert.deepEqual(bad, []);
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

// Help (the widget's own matcher on the real page config).
const helpBot = (h) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(h);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  return { best: (q) => ctx.window.__ohbBest(q), topics: JSON.parse(m[1]).topics };
};
const bots = {};
const botsFor = async (kind) => {
  if (bots[kind]) return bots[kind];
  const v = mk(['golf', 'simgolf', 'range'].includes(kind) ? 'golf' : 'sport', { name: `Help Two ${kind} Fixture` });
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds: [kind], length: '1-2h', book: 'busy', age: 'all' }, indoor_price: 45 }));
  bots[kind] = { setup: helpBot(await getText(`/owner/${t}/setup`)), frsetup: helpBot(await getText(`/fr/owner/${t}/setup`)), menu: helpBot(await getText(`/owner/${t}/menu`)), frmenu: helpBot(await getText(`/fr/owner/${t}/menu`)) };
  return bots[kind];
};
// Trevor's 38 questions (help-log.json), on the page he asked from, with French twins of every miss.
const TREVOR_LOG = [
  ['en', 'setup', "we're open all year but closed christmas day and new years day, where do i put that", ['closures', 'setup-closures']],
  ['en', 'setup', 'last bay booking is 10pm but the bar stays open till 11, which time do i put', ['sport-last-booking']],
  ['en', 'setup', 'do these hours change in summer? we do a mini putt outside in summer', ['seasonal-hours', 'sport-second-kind']],
  ['en', 'setup', "we're a golf sim but also a licensed bar, there's no bar option?", ['indoor-bar']],
  ['en', 'setup', 'should i pick mini golf too? we only do mini putt outside in the summer', ['sport-second-kind']],
  ['en', 'setup', 'a full 18 holes takes 4 people about 3 hours but most book 2 hours, what do i pick', ['indoor-visit-length']],
  ['en', 'setup', 'we charge per bay not per person, up to 8 people a bay. will people think its $45 each?', ['sport-per-person', 'indoor-price']],
  ['en', 'setup', 'its $45 an hour weekdays before 5:30 and $60 nights and weekends. which one do i put', ['indoor-price', 'indoor-price-varies', 'sport-rate-lines']],
  ['en', 'setup', 'plus GST?', ['indoor-extras']],
  ['en', 'setup', 'people can book online or just call us, and walk ins are fine if a bay is free. what do i pick', ['sport-tee-times', 'indoor-booking']],
  ['en', 'setup', 'we have a 24 hour cancellation policy where does that go', ['indoor-good-to-know', 'sport-refunds']], // sport test 5: its own answer
  ['en', 'setup', 'kids are welcome with an adult until 8pm, after 8 its 19+ because of the bar. what age do i pick', ['indoor-age']],
  ['en', 'setup', 'why does it say no dogs and quote our description about mocktails?', ['sport-dogs']],
  ['en', 'setup', "why does it say my description still mentions sports? we're a golf place, the big screens are real", ['sport-sports-words']],
  ['en', 'menu', 'lessons are with outside pros, they set their own price. do i put lessons here?', ['sport-lessons']],
  ['en', 'menu', 'we sell gift cards in any amount, where does that go', ['indoor-gift']],
  ['en', 'menu', 'do we have to show prices per person? groups always ask how much each', ['sport-per-person']],
  ['en', 'menu', 'we have a monthly membership coming in january, can i add it now', ['sport-rate-lines']],
  ['en', 'menu', 'is my $45 still what shows on the card or will it show $10 for clubs?', ['sport-card-price']],
  ['en', 'setup', 'should i say which simulator brand and courses we have? does anybody care', ['sport-sim-tech']],
  ['en', 'setup', 'do i need to write this in french too?', ['indoor-french']],
  ['en', 'setup', 'we have pizza and snacks and a full bar, where do i put our food menu', ['sport-food-menu']],
  ['en', 'setup', 'kids are ok with an parent until 8 then its 19+ how do i say that', ['indoor-age']],
  ['en', 'setup', 'can people bring their own clubs?', ['indoor-good-to-know', 'sport-rentals', 'sport-what-to-bring']],
  ['en', 'setup', 'we do birthday parties and corporate buyouts of the whole place, how do people find that', ['indoor-groups']],
  ['en', 'setup', 'our tuesday night league, should that be an event?', ['indoor-theme-nights', 'sport-members']],
  ['en', 'setup', 'can i put a bay deal in here too, like $35 bays 3 to 5 weekdays, or only drinks?', ['indoor-bar']],
  ['en', 'setup', 'do i need a liquor licence to list happy hour? we are fully licensed', ['indoor-bar']],
  ['en', 'setup', 'christmas eve we close at 4pm, and new years eve we stay open late for a party', ['closures', 'setup-closures', 'sport-holiday-short']], // sport test 5: a short holiday's own answer
  ['en', 'setup', 'is this every year or do i have to do it again next year', ['sport-closures-yearly']],
  ['fr', 'setup', "c'est 45 $ par baie de l'heure, pas par personne. qu'est-ce que je mets?", ['sport-per-person', 'indoor-price']],
  ['fr', 'setup', "on a une ligue d'hiver le mardi soir, ça va où?", ['indoor-theme-nights', 'sport-members']],
  ['fr', 'setup', 'on a un simulateur Uneekor, est-ce que je le dis quelque part?', ['sport-sim-tech']],
  ['fr', 'setup', "les enfants peuvent venir avec un adulte jusqu'à 20 h", ['indoor-age']],
  ['en', 'setup', 'how do i add our food menu? we have pizza, wings and snacks', ['sport-food-menu']],
  ['en', 'setup', 'can a golf simulator have a happy hour on here?', ['indoor-bar']],
  ['en', 'setup', 'my card on the golf page says green fees, we dont have green fees we rent bays', ['sport-card-price']],
  ['en', 'setup', 'how do people see our happy hour deals? i cant find them on my page', ['indoor-bar', 'hh-deals']],
  // French twins of his misses.
  ['fr', 'setup', "la dernière réservation de baie est à 22 h mais le bar reste ouvert jusqu'à 23 h, quelle heure je mets", ['sport-last-booking']],
  ['fr', 'setup', "est-ce que je choisis aussi le mini-golf? on fait du mini-golf dehors l'été seulement", ['sport-second-kind']],
  ['fr', 'setup', '18 trous prennent environ 3 heures, la plupart réservent 2 heures, je choisis quoi', ['indoor-visit-length']],
  ['fr', 'menu', 'les cours sont donnés par des pros externes qui fixent leurs propres prix, je les mets ici?', ['sport-lessons']],
  ['fr', 'menu', "est-ce qu'on doit montrer les prix par personne?", ['sport-per-person']],
  ['fr', 'menu', "on aura un abonnement mensuel en janvier, je peux l'ajouter maintenant?", ['sport-rate-lines']],
  ['fr', 'menu', 'est-ce que ma fiche va afficher 10 $ pour la location de bâtons au lieu de 45 $?', ['sport-card-price', 'sport-rentals', 'indoor-extras']],
  ['fr', 'setup', 'on a pizza, collations et un bar, où je mets notre menu', ['sport-food-menu']],
  ['fr', 'setup', "est-ce que c'est chaque année ou je dois le refaire l'an prochain", ['sport-closures-yearly']],
  ['fr', 'setup', 'ma fiche sur la page golf dit droits de jeu, on loue des baies', ['sport-card-price']],
];
const bot = (b, lang, pg) => b[(lang === 'fr' ? 'fr' : '') + pg];

test('9. Help: Trevor\'s 38 questions and French twins of every miss land on the right answer, on the page he asked from', async () => {
  const b = await botsFor('simgolf');
  const wrong = [];
  for (const [lang, pg, q, want] of TREVOR_LOG) { const r = bot(b, lang, pg).best(q); if (!r || !want.includes(r.id)) wrong.push(`[${lang} ${pg}] "${q}" -> ${r && r.id}`); }
  assert.deepEqual(wrong, []);
});

test('10. Help on the price-list page: ~18 realistic questions for every sport kind land (EN + FR)', async () => {
  const M = 'menu-add', X = 'indoor-extras', RL = 'sport-rate-lines', RC = 'sport-rate-change', RN = 'sport-rentals', LS = 'sport-lessons', CP = 'sport-card-price', PP = 'sport-per-person', G = 'indoor-gift', NSP = 'indoor-no-set-price';
  const W = { golf: ['power carts', 'juniors', 'season pass'], simgolf: ['club rental', 'kids', 'punch pass'], range: ['club rental', 'kids', 'range card'], skischool: ['ski rentals', 'kids', 'lesson pack'],
    rink: ['skate rental', 'kids', '10 skate pass'], swim: ['locker', 'kids', '10 swim pass'], skatepark: ['helmet rental', 'kids', 'camp pass'], bike: ['bike rental', 'kids', 'season membership'],
    courts: ['racquet rental', 'juniors', 'membership'], discgolf: ['disc rental', 'kids', 'league fee'], sportsctr: ['towel rental', 'youth', '10 visit pass'], sportother: ['equipment rental', 'kids', 'season pass'] };
  const wrong = [];
  for (const k of IK.SPORT_KIND_TEXT_KINDS) {
    const [rent, kids, pass] = W[k];
    const b = await botsFor(k);
    const Q = [['en', 'how do i add the rest of our prices', [M, 'menu-import']], ['en', 'what goes in the first line', ['indoor-typer-first']], ['en', 'can i just take a picture of our price board', [M, 'menu-blurry']],
      ['en', 'our prices are on our website, can you get them from there', ['menu-import', 'menu-website', M]], ['en', 'all our prices are plus gst', [X]], ['en', `will the ${rent} price become the price on my card`, [CP, X, RN]],
      ['en', `${kids} and seniors are cheaper, how do i show that`, [RL, 'indoor-line-age']], ['en', `we sell a ${pass}, where does it go`, [RL, G, NSP]], ['en', 'memberships with no set price', [RL, NSP]],
      ['en', 'our prices go up in the spring', [RC]], ['en', 'lessons are booked with the instructor, they set the price', [LS]], ['en', `${rent} is extra`, [RN, X]], ['en', 'do i have to show the price per person', [PP]],
      ['en', 'how do i change a price later', ['menu-change', RC, M]], ['en', 'do you take gift cards here', [G]],
      ['fr', 'tous nos prix sont plus taxes', [X]], ['fr', 'nos prix augmentent au printemps', [RC]], ['fr', 'les abonnements sans prix fixe', [RL, NSP]]];
    for (const [lang, q, want] of Q) { const r = bot(b, lang, 'menu').best(q); if (!r || !want.includes(r.id)) wrong.push(`${k} [${lang}] "${q}" -> ${r && r.id}`); }
  }
  assert.deepEqual(wrong, []);
});

test('11. booking pre-pick: research\'s "walk-ins welcome" pre-picks walk-ins for every kind, never "please book"', async () => {
  const bad = [];
  for (const k of IK.SPORT_KIND_TEXT_KINDS) {
    for (const [text, want] of [['Walk-ins welcome; booking ahead recommended.', 'busy'], ['Walk-ins welcome.', 'no']]) {
      const v = mk(['golf', 'simgolf', 'range'].includes(k) ? 'golf' : 'sport');
      visit(v.id, [{ label: 'Booking', text }]);
      const t = tokenFor(v.id);
      ok(await change(t, { indoor_info: { kinds: [k] } }));
      const cfg = cfgOf(await getText(`/owner/${t}/setup`));
      if (cfg.researchBook !== want) bad.push(`${k} "${text}": ${cfg.researchBook}`);
      const sim = await openSetup(base, t, { hash: 'booking' });
      if (!sim.has(`[data-tpick="book:${want}"][aria-pressed="true"]`)) bad.push(`${k} "${text}": not pre-picked`);
      if (sim.has('[data-tpick="book:ahead"][aria-pressed="true"]')) bad.push(`${k} "${text}": "please book" picked`);
    }
  }
  assert.deepEqual(bad, []);
});

test('12. ages from the owner\'s own words: "19+ after 8 PM" (« 19 ans et plus après 20 h », "adults only after 9") makes the Ages line, the card chip and Build My Trip agree', async () => {
  const cases = [['All ages with an adult until 8 PM, 19+ after 8 PM.', 'All ages until 8 PM (kids with an adult), 19+ after.', 'Tous les âges jusqu’à 20 h (enfants avec un adulte), 19+ ensuite.', 'Kids until 8 PM', 20],
    ['Adults only after 9 PM.', 'All ages until 9 PM, 19+ after.', 'Tous les âges jusqu’à 21 h, 19+ ensuite.', 'Kids until 9 PM', 21],
    ['Tous les âges, 19 ans et plus après 20 h.', 'All ages until 8 PM, 19+ after.', 'Tous les âges jusqu’à 20 h, 19+ ensuite.', 'Kids until 8 PM', 20]];
  for (const kind of ['simgolf', 'rink', 'sportsctr']) {
    for (const [gtk, en, fr, chip, h] of cases) {
      const v = mk(kind === 'simgolf' ? 'golf' : 'sport', { name: `Ages ${kind} ${h} Fixture ${n}`, kid_friendly: 1, region: 'west-kelowna', latitude: 49.86, longitude: -119.58 });
      const t = tokenFor(v.id);
      ok(await change(t, { indoor_info: { kinds: [kind], age: 'all' } }));
      ok(await change(t, { visit_rows: { good_to_know: gtk } }));
      const ages = (app.venueVisitInfo(v.id).rows.find((r) => r.label === 'Ages') || {}).text;
      assert.equal(ages, en, `${kind}: ${gtk}`);
      assert.ok(page(v, 'fr').includes(fr), `${kind} FR: ${gtk}`);
      const card = app.cardBadgeChipsHtml ? app.cardBadgeChipsHtml(app.getVenue(v.id)) : '';
      if (card) assert.match(card, new RegExp(chip), `${kind}: card chip`);
      const name = app.getVenue(v.id).name;
      const late = app.runTripPlan({ text: `${kind === 'simgolf' ? 'golf simulator' : kind === 'rink' ? 'skating' : 'sports centre'} with my 10 year old in West Kelowna on Saturday at ${h - 11} PM` }, NOV);
      assert.ok(!JSON.stringify([late.recommendations, late.itinerary]).includes(name), `${kind}: no kids after ${h - 12} PM`);
    }
  }
});

test('13. research lines kept: Groups keeps the league sentence (240 for a sport place); Rentals and Practice stay until her list is approved; French keeps Food and the booking detail', async () => {
  const v = mk('golf', { name: 'Kept Lines Sim Fixture', description: SIM_DESC });
  visit(v.id, TREVOR_ROWS);
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds: ['simgolf'], length: '2-3h', book: 'busy', age: 'all', year: 'all' }, indoor_price: 45 }));
  const groups = 'Events for about 50 people; outside catering allowed. Winter scramble leagues run 5 weeks (currently full, waitlist open). Groups of 10 or more: please book ahead. Corporate events and parties.';
  assert.ok(groups.length > 180);
  ok(await change(t, { visit_rows: { groups, good_to_know: 'Food and drinks on site. Lessons available.' } }));
  assert.match(page(v), /Winter scramble leagues run 5 weeks/);
  // A pub's Groups line still holds 180.
  const pub = mk('pub'); assert.equal((await change(tokenFor(pub.id), { visit_rows: { groups } })).status, 400);
  // Her price list sent, not yet approved: research's Rentals and Practice still show.
  ok(await change(t, { indoor_price: 45 }));
  const en = page(v);
  assert.match(en, /Club rental \$10 per reservation/);
  assert.match(en, /Lessons with outside PGA of Canada pros/);
  const fr = page(v, 'fr');
  assert.match(fr, /Full bar with beer on tap/, 'French keeps research\'s Food row');
  // Sport test 4 (2026-11-20): the French booking row never mixes in research's English (it adds it once translated).
  assert.match(fr, /Sans réservation si une baie est libre/);
  assert.doesNotMatch(fr, /Sans réservation si une baie est libre[^.]*\.\s*Book online or by phone/, 'no English inside the French booking row');
  assert.doesNotMatch(fr, /Plus : durée/);
  // Approved list: research's price rows step back.
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
    .run(v.id, JSON.stringify({ sections: [{ name: 'Bays', note: '', items: [{ name: 'One bay, one hour', description: '', price: '45', dietary: [], check: false }, { name: 'Club rental', description: '', price: '10', dietary: [], check: false }] }] }));
  assert.doesNotMatch(page(v).split('Your visit')[1] || '', /Club rental \$10 per reservation/);
});

test('14. French polish: the live card status says « minuit »; every sport kind\'s French words read in Build My Trip', () => {
  const ft = require('../french-text.js');
  const x = ft.FR_SCRIPT.find((p) => /hoursStatusLabel/.test(p[0]));
  const code = x[1].split('\n').slice(1, 4).join('\n');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(`${code}; this.f = __frStatusText;`, ctx);
  assert.equal(ctx.f('Open now · Closes midnight'), 'Ouvert · ferme à minuit');
  const frp = require('../trip-planner-fr.js');
  const left = [];
  for (const [k, e] of Object.entries(SK.K)) for (const w of e.fr.search) { const out = frp.tripPlannerText(`${w} à Kelowna samedi`, {}).replace(/ at kelowna saturday$/, ''); if (/\b(?:de|du|des|libre|aquatique|trous|jeu|sportif|recreatif|loisirs|gymnase|patinoire|virtuel|apprendre|d|eau)\b/.test(out.replace(/bucket of balls/, ''))) left.push(`${k}: ${w} -> ${out}`); }
  assert.deepEqual(left, []);
});

test('15. no golf-course words on another kind\'s screens, chips, examples or Help (twilight, carts, aeration, tee times, green fees, "your course")', async () => {
  const T = require('../owner-setup-text.js');
  const bad = [];
  const walk = (o, where, k, keyPath = '') => {
    if (typeof o === 'string') { if (SK.GOLF_COURSE_ONLY_RE.test(o) && !(k === 'discgolf' && /your course|votre parcours/i.test(o))) bad.push(`${k} ${where}${keyPath}: ${o.slice(0, 90)}`); return; }
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, where, k, `${keyPath}[${i}]`)); return; }
    if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, where, k, `${keyPath}.${kk}`);
  };
  for (const k of IK.SPORT_KIND_TEXT_KINDS.filter((x) => x !== 'golf')) {
    for (const lang of ['en', 'fr']) {
      const S = T[lang].sport, kt = S.kindText[k], g = S.kindGroups[k];
      // What the client shows for this kind: the sport strings with the kind's own words over them (owner-setup-client.js kindWords).
      const shown = { ...Object.fromEntries(Object.entries(S).filter(([kk]) => !/Kinds$|^kindText$|^kindGroups$|^quick$/.test(kk))), ...kt };
      walk(shown, `[${lang}] T`, k);
      walk(S.quick.good_to_know_kinds[g[0]], `[${lang}] chips`, k);
      for (const m of ['storyExKinds', 'knownExKinds', 'bringExKinds']) walk((S[m] || {})[g[1]], `[${lang}] ${m}`, k);
    }
    // Help on the setup page and the price list, EN and FR: the answers' own words (the topic list's titles may name every kind).
    const b = await botsFor(k);
    for (const [pg, bb] of Object.entries(b)) for (const t of bb.topics) {
      const a = typeof t.a === 'object' ? Object.values(t.a).join(' ') : t.a, af = typeof t.aFr === 'object' ? Object.values(t.aFr).join(' ') : t.aFr;
      if (/^(?:sport-tee-times|sport-kinds-other|menu-import)$/.test(t.id)) continue; // lists every kind's booking, kind or price-list words by design
      walk([a, af].map((x) => String(x || '').replace(/<[^>]+>/g, '')), `help ${pg} ${t.id}`, k);
    }
  }
  assert.deepEqual(bad, []);
});
