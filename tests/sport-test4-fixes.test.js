// Sport test 4 fixes (2026-11-20; Ryan, head pro at a city-run 18-hole course in Penticton that also has a driving range:
// setup 8.0, overwhelm 8.0, whole thing 6.0; drafts/fresh-eyes-sport4-2026-11-20/REPORT.md). The root fix: owners pick
// more than one kind, and every planner, search and ranking rule reads the owner's MAIN kind (sportKinds[0]); extra kinds
// add, never replace. Then Help for his log (in the main kind's own examples), the search date line in the season's hours,
// the chip join, one price table, the French page, search gaps and the happy hour months.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test4-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const SK = require('../sport-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c, days = DAYS) => Object.fromEntries(DAYS.map((d) => [d, days.includes(d) ? [[o, c]] : []]));
let n = 0, ipN = 0, srv, base;
const mk = (type, o = {}) => app.createVenue({ name: `Sport Four Fixture ${++n}`, slug: `sport-four-fixture-${n}`, region: 'penticton', type, latitude: 49.49 + n / 3000, longitude: -119.6,
  rating: 4.4, reviews: 90, address: `${600 + n} Comox St, Penticton`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(WK('10:00', '18:00')), description: 'A fixture for sport test 4.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.124.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status === 201 ? 200 : r.status, body: await r.json().catch(() => ({})) }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const NOV = new Date('2026-11-20T12:00:00-08:00');
const html = (v, lang = 'en', now = NOV) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const page = (v, lang = 'en', now = NOV) => plain(html(v, lang, now));
const visit = (id, rows, extra = {}) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify({ rows, source_url: 'https://example.com/', checked_at: '2026-11-01', ...extra }));
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: sections.map(([name, items]) => ({ name, note: '', items: items.map(([nm, price, d = '']) => ({ name: nm, description: d, price: String(price), dietary: [], check: false })) })) }));
const PLAN = (text, now = NOV) => app.runTripPlan({ text }, now);
const inPlan = (p, name) => JSON.stringify([p.recommendations, p.itinerary, p.days, p.outing]).includes(name);
const helpBot = (h) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(h);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};

// Ryan's course as he left it (final-state.json): Golf course first, Driving range second; open March 6 to November 1;
// 7–6, with 6:30–8:30 May to August; a daily happy hour 3–6 April to October; his 14 rates published.
const PGCC_DESC = 'Penticton’s municipal course has been played since 1922: mature, walkable, a par-70 test at just over 6,100 yards. Run by the City of Penticton, it’s public and unpretentious: a full driving range, several putting greens and dedicated short-game practice, plus PGA of Canada professionals running junior and adult lesson programs. The Blue Heron Restaurant and its patio are open to everyone, golfers or not.';
const PGCC_ROWS = [
  { label: 'Known for', text: '18-hole club founded 1922 with narrow fairways and water in play on twelve holes; public golfers welcome.' },
  { label: 'Booking', text: 'Public golfers are welcome; public tee times are booked through the golf shop.' },
  { label: 'Food', text: 'Blue Heron Restaurant with Okanagan wines and local craft beer; patio overlooks the course.' },
  { label: 'Green fees', text: '18 holes $99, 9 holes $55, twilight after 2 pm $79.' },
  { label: 'Rentals', text: 'Power carts $42 for 18 holes, $23 for 9; rental clubs $40 for 18.' },
  { label: 'Practice', text: 'Full driving range, putting greens and a short-game area.' }];
const PGCC_PRICES = [['Green fees', [['9 holes', 55], ['18 holes', 99], ['Twilight 18 holes', 79, 'After 2 PM'], ['Junior', 55], ['Family Sunday', 'Free', 'Kids 12 and under, after 3 PM with a paying adult']]],
  ['Carts and rentals', [['Power cart, 18 holes', 42], ['Power cart, 9 holes', 23], ['Rental clubs', 40], ['Pull cart', 8]]],
  ['Practice and lessons', [['Range bucket', 8], ['Lesson, 45 min', 85], ['3 lessons', 240], ['Junior camp', 295]]], ['Passes', [['10-round pass', 790]]]];
async function ryan(o = {}, { kinds = ['golf', 'range'], prices = true, rows = PGCC_ROWS } = {}) {
  const v = mk('golf', { name: `Penticton Golf Fixture ${n + 1}`, slug: `penticton-golf-fixture-${n + 1}`, description: PGCC_DESC, patio: 1, kid_friendly: 1, hours: JSON.stringify(WK('07:00', '18:00')), ...o });
  visit(v.id, rows);
  const t = tokenFor(v.id);
  ok(await change(t, { hours: WK('07:00', '18:00'), open_months: '03-06:11-01', hours_seasons: [{ from: '05-01', to: '08-31', label: '', hours: WK('06:30', '20:30') }] }));
  ok(await change(t, { indoor_info: { kinds, length: 'half', book: 'busy', age: 'all', year: 'seasonal', holes: 9 }, indoor_price: 55 }));
  db.prepare("UPDATE venues SET happy_hour = 1, happy_hour_times = ?, happy_hour_deals = ? WHERE id = ?").run(JSON.stringify({ ...WK('15:00', '18:00'), _season: { from: '04-01', to: '10-31' } }), JSON.stringify([{ text: '$6 pints, $7 house wine on the patio' }]), v.id);
  if (prices) publish(v.id, PGCC_PRICES);
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t, name: app.getVenue(v.id).name };
}

test('1. Build My Trip plans a golf course whose owner also picked a driving range for every plain golf request (EN + FR); a range-first owner stays a range', async () => {
  const { v, name } = await ryan();
  mk('restaurant', { name: 'Penticton Dinner Fixture', hours: JSON.stringify(WK('11:00', '22:00')) });
  for (const q of ['golf in Penticton on Saturday July 17, 2027', 'tee time then dinner in Penticton on Saturday June 12, 2027', 'my 12 year old wants to golf in Penticton on Saturday July 17, 2027',
    'golf weekend in Penticton July 17 to 18, 2027', 'golf à Penticton le samedi 17 juillet 2027', 'golf in Penticton on Canada Day 2027', 'golf then happy hour on a patio in Penticton on Saturday July 17, 2027',
    'golf in Penticton on Monday March 8, 2027', 'driving range in Penticton on Saturday July 17, 2027']) {
    const p = PLAN(q);
    assert.ok(inPlan(p, name), `${q}: ${p.summary} ${JSON.stringify(p.warnings)}`);
  }
  // His card says golf course for a plain golf request, never "Driving range".
  const p = JSON.stringify(PLAN('golf in Penticton on Saturday July 17, 2027'));
  const at = p.indexOf(name);
  assert.doesNotMatch(p.slice(at, at + 1200), /"typeLabel":"Driving range"/);
  // Off season: left out with the closed line.
  assert.ok(!inPlan(PLAN('golf in Penticton on Christmas Day'), name));
  // A range-first owner whose second kind is a course is still a range: out of a plain golf request.
  const r = await ryan({ region: 'summerland', latitude: 49.6, longitude: -119.67 }, { kinds: ['range', 'golf'], prices: false });
  mk('golf', { name: 'Summerland Course Fixture', region: 'summerland', latitude: 49.61, longitude: -119.67, description: 'An 18-hole public course.' });
  assert.ok(!inPlan(PLAN('golf in Summerland on Saturday July 17, 2027'), r.name), 'range first: not a plain golf stop');
  assert.ok(inPlan(PLAN('driving range in Summerland on Saturday July 17, 2027'), r.name), 'range first: a driving range stop');
  void v;
});

// The Help sweep (sport test 4 #3): every example in every Help answer comes from the owner's MAIN kind. Each kind's own
// example words; a main kind's answers never say another kind's (the kinds' chip names, which an answer may tell her to
// tap, are taken out first; the kinds list and the "my kind isn't listed" answers name every kind by design).
const KIND_EX_WORDS = {
  golf: ['tee times?', 'green fees?', 'power carts?', 'collared', 'fairways?', 'voiturettes?', 'droits? de jeu', 'heures? de départ'],
  simgolf: ['bays?', 'simulators?', 'trackman', 'baies?', 'simulateurs?', 'book a bay'],
  range: ['mini[- ]?golf', 'mini[- ]?putt\\w*', 'buckets?', 'seaux?', 'toptracer'],
  rink: ['rinks?', 'skates?', 'skating', 'arenas?', 'hockey', 'patin\\w*', 'arénas?', 'ice rentals?'],
  swim: ['pools?', 'swims?', 'swimming', 'lifeguards?', 'piscines?', 'baignades?', 'sauveteurs?'],
  skatepark: ['skate ?parks?', 'skateboard\\w*', 'planchodromes?', 'jams?', 'skates?'], // sport test 5: a skate park's own "skate camps"
  bike: ['bmx', 'pump tracks?', 'race nights?', 'riders?', 'cyclistes?'],
  courts: ['pickleball', 'tennis', 'racquets?', 'raquettes?', 'book a court'],
  discgolf: ['disc golf', 'discs?', 'disque-golf', 'disques?'],
  skischool: ['ski lessons?', 'snowboard\\w*', 'lift tickets?', 'cours de ski'],
  sportsctr: ['gym rentals?', 'drop-in basketball', 'gymnase'],
  sportother: [],
  indoor: ['book a visit', 'museums?', 'exhibits?', 'escape rooms?', 'bowling', 'lap pool', 'hot tub', 'sauna'],
};
const HELP_SKIP = /^(?:sport-kinds-other|sport-bay-link-other|sport-green-fees-word|indoor-french|french|photo-|social-|website-)/;
const chipNames = Object.values(SK.SPORT_KIND_LABELS_OWNER).flat().concat(Object.values(SK.SPORT_KIND_WORDS).flat()).sort((a, b) => b.length - a.length);
const foreignIn = (main, text) => {
  let t = String(text);
  for (const c of chipNames) t = t.split(c).join(' ');
  const own = new RegExp(`^(?:${KIND_EX_WORDS[main].join('|') || '$^'})$`, 'i');
  const words = Object.entries(KIND_EX_WORDS).filter(([k]) => k !== main).flatMap(([, w]) => w).filter((w) => !own.test(w.replace(/\\w\*|\?|\[- \]\?/g, '')) && !KIND_EX_WORDS[main].includes(w));
  const m = new RegExp(`(?<![\\p{L}])(?:${words.join('|')})(?![\\p{L}])`, 'iu').exec(t);
  return m ? `"${m[0]}" …${t.slice(Math.max(0, m.index - 60), m.index + 40)}…` : null;
};
test('2. Help sweep: for every kind pair (main + second), every Help answer\'s examples are the main kind\'s own (EN + FR, setup and price pages)', async () => {
  const bad = new Set();
  let j = 0;
  for (const main of SK.SPORT_KINDS) {
    for (const second of SK.SPORT_KINDS.filter((k) => k !== main)) {
      const type = ['golf', 'simgolf', 'range'].includes(main) ? 'golf' : 'sport';
      const v = mk(type, { name: `Help Pair ${main} ${second}`, region: 'penticton', latitude: 49.4 + (++j) / 2000 });
      const t = tokenFor(v.id);
      ok(await change(t, { indoor_info: { kinds: [main, second], length: '1-2h', book: 'busy', age: 'all' }, indoor_price: 12 }));
      const pages = second === SK.SPORT_KINDS.find((k) => k !== main) ? ['setup', 'menu'] : ['setup'];
      for (const lang of ['en', 'fr']) for (const pg of pages) {
        for (const tp of helpBot(await getText(`${lang === 'fr' ? '/fr' : ''}/owner/${t}/${pg}`)).topics) {
          if (HELP_SKIP.test(tp.id) || (tp.id === 'sport-bay-link' && main !== 'golf')) continue; // (a bay link is the simulator a range or simulator owner has)
          const txt = [tp.a, tp.aFr].map((x) => (typeof x === 'object' ? Object.values(x || {}).join(' ') : String(x || ''))).join(' ').replace(/<[^>]+>/g, '');
          const f = foreignIn(main, txt);
          if (f) bad.add(`${main} (+${second}) ${tp.id}: ${f}`.replace(/\(\+\w+\)/, '(+…)'));
        }
      }
    }
  }
  assert.deepEqual([...bad], []);
});

test('3. search: a date reads the season\'s hours (every type); "junior golf camp" is a camp; "golf simulator" finds a simulator by its kind; golf with a restaurant comes first', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const { name } = await ryan({ region: 'oliver', latitude: 49.18, longitude: -119.55 });
    const H = async (q, lang = 'en') => plain(await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
    const near = (r, n) => { const i = r.indexOf(n); assert.ok(i >= 0, `${n} listed`); return r.slice(i, i + 400); };
    // Canada Day: his summer hours (May to August), never the usual week's.
    const cd = near(await H('golf canada day oliver'), name);
    assert.match(cd, /Jul 1 · 6:30 AM–8:30 PM \(summer hours\)/);
    assert.doesNotMatch(cd, /usual Thursday hours/);
    assert.match(near(await H('golf fête du canada oliver', 'fr'), name), /heures d’été/);
    // Every type: a restaurant's summer hours.
    const r0 = mk('restaurant', { name: 'Oliver Summer Patio Fixture', region: 'oliver', latitude: 49.181, longitude: -119.55, cuisine: 'Canadian', hours: JSON.stringify(WK('11:00', '21:00')) });
    db.prepare('INSERT INTO venue_hours_extra (venue_id, seasons) VALUES (?, ?)').run(r0.id, JSON.stringify([{ from: '06-01', to: '08-31', label: '', hours: WK('11:00', '23:00') }]));
    app.clearHoursExtraCache();
    assert.match(near(await H('restaurant canada day oliver'), 'Oliver Summer Patio Fixture'), /Jul 1 · 11 AM–11 PM \(summer hours\)/);
    assert.match(near(await H('restaurant christmas day oliver'), 'Oliver Summer Patio Fixture'), /usual Friday hours/, 'outside the season: the usual week');
    // "junior golf camp": a camp, not camping.
    const jc = await H('junior golf camp oliver');
    assert.ok(jc.includes(name), 'his course');
    assert.doesNotMatch(jc.slice(0, 400), /Camping/);
    // "golf simulator": a simulator by its kind (its story never says "simulator").
    mk('golf', { name: 'Oliver Virtual Golf Fixture', region: 'oliver', latitude: 49.182, longitude: -119.55, description: 'A winter golf club downtown that plays like a real round. Three bays track ball flight from an overhead launch monitor across 2,500 virtual courses.' });
    assert.ok((await H('golf simulator oliver')).includes('Oliver Virtual Golf Fixture'));
    // Golf with food words: the golf places that serve food first.
    for (let i = 0; i < 4; i++) mk('restaurant', { name: `Oliver Patio Resto ${i}`, region: 'oliver', latitude: 49.18, longitude: -119.55, patio: 1, cuisine: 'Canadian', rating: 4.8 });
    const run = app.runDiscovery('golf restaurant patio oliver');
    assert.equal(run.results.items[0].name, name);
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('4. his page: one rate table once his price list is live or waiting (course facts stay); the French page has no "voir la page en anglais", no second « Bon à savoir », no English in the booking row', async () => {
  const { v, t } = await ryan({ region: 'penticton', slug: 'penticton-golf-country-club', name: 'Penticton Golf & Country Club Fixture' }, { prices: false });
  // Sport test 9 (2026-11-21): his typed green fee alone is already the page's price story, before his list.
  const before = page(v);
  assert.doesNotMatch(before, /Standard adult rate/, 'research\'s fee table goes with his typed price');
  assert.doesNotMatch(page(v, 'fr'), /voir la page en anglais/, 'with his typed price');
  // Waiting for review: research's fee table goes.
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, source) VALUES (?, 'pending', ?, 'owner-link', datetime('now'), 'owner')").run(v.id, JSON.stringify({ sections: [{ name: 'Green fees', note: '', items: [{ name: '9 holes', description: '', price: '55', dietary: [], check: false }] }] }));
  const waiting = page(v);
  assert.doesNotMatch(waiting, /Standard adult rate/);
  publish(v.id, PGCC_PRICES);
  const en = page(v);
  assert.doesNotMatch(en, /Standard adult rate|\$99 · 18 holes/);
  assert.match(en, /Green fees from \$55/);
  assert.match(en, /Par 70/, 'the course facts stay');
  const fr = page(v, 'fr');
  assert.doesNotMatch(fr, /voir la page en anglais/);
  assert.doesNotMatch(html(v, 'fr'), /<h2>Bon à savoir<\/h2>\s*<div class="detail-row">/);
  assert.doesNotMatch(fr, /achalandées\. Public golfers/);
  assert.match(fr, /Départs sans réservation s’il y a de la place/);
  void t;
});

test('5. chips then typing: a comma carries the chip on, words that arrive in one go join like typed ones, only a linking word joins with a space; saving tidies ". ,"', async () => {
  const { openSetup } = require('./setup-sim.js');
  const { v, t } = await ryan({ region: 'summerland', latitude: 49.6, longitude: -119.67 }, { prices: false });
  const sim = await openSetup(base, t, { hash: 'groups' });
  const box = sim.doc.getElementById('suGroupsLine');
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Tournaments and corporate golf"]');
  await sim.type('suGroupsLine', `${box.value} for up to 144 golfers`);
  assert.equal(box.value, 'Tournaments and corporate golf for up to 144 golfers');
  await sim.click('[data-quick="Group lessons and clinics"]');
  await sim.type('suGroupsLine', `${box.value}junior camps in July and August`);
  assert.equal(box.value, 'Tournaments and corporate golf for up to 144 golfers. Group lessons and clinics. Junior camps in July and August');
  // Key by key: the first word is judged once it is finished.
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Group lessons and clinics"]');
  const p0 = box.value;
  for (const ch of 'junior ') await sim.type('suGroupsLine', box.value + ch);
  assert.equal(box.value, `${p0}Junior `);
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Group lessons and clinics"]');
  for (const ch of 'on ') await sim.type('suGroupsLine', box.value + ch);
  assert.equal(box.value, 'Group lessons and clinics on ');
  const g = await openSetup(base, t, { hash: 'bring' });
  const gb = g.doc.getElementById('suBring');
  await g.type('suBring', '');
  await g.click('[data-quick="Dress code: collared shirts"]');
  await g.type('suBring', `${gb.value}, no denim`);
  assert.equal(gb.value, 'Dress code: collared shirts, no denim');
  // Saved as it was typed before: tidied on save.
  ok(await change(t, { visit_rows: { good_to_know: 'Dress code: collared shirts. , no denim, soft spikes only.' } }));
  assert.match(page(v), /Dress code: collared shirts, no denim, soft spikes only/);
});

test('6. happy hour "Only some months" starts with his own season\'s months (March to November); a place with no season starts empty', async () => {
  const { openSetup } = require('./setup-sim.js');
  const { v, t } = await ryan({ region: 'peachland', latitude: 49.77, longitude: -119.73 }, { prices: false });
  db.prepare('UPDATE venues SET happy_hour_times = ? WHERE id = ?').run(JSON.stringify(WK('15:00', '18:00')), v.id);
  const on = async (tok) => {
    const sim = await openSetup(base, tok, { hash: 'happy' });
    await sim.click('go:happy:yes'); await sim.click('go:happy:type');
    await sim.click('[data-sea="happy:some"]');
    return sim.doc.querySelectorAll('[data-smon]').filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => +x.getAttribute('data-smon').split(':')[1]);
  };
  assert.deepEqual(await on(t), [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // All year: nothing to start from.
  const w = mk('golf', { name: 'Peachland All Year Fixture', region: 'peachland', latitude: 49.771, longitude: -119.73, happy_hour: 1, happy_hour_times: JSON.stringify(WK('15:00', '18:00')) });
  const tw = tokenFor(w.id);
  ok(await change(tw, { indoor_info: { kinds: ['simgolf'], length: '1-2h', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 45 }));
  assert.deepEqual(await on(tw), []);
});
