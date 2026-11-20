// Sport price matrix (2026-11-20, the sport easy setup): THE PRICE RULE (indoor-kinds.js, top) for every sport kind
// (sport-kinds.js) and every price scenario a sports or golf owner has: main price only, a lower typed price, a higher typed
// price, free, and a price per person with a minimum. The surfaces must agree: the page's Prices row, the card, Build My
// Trip's card, the setup's Price screen preview, the finish preview, Help's example and the price typer's first line, in
// English and French. A range kind (green fees, lessons, bays…) never says "Adult price" or an exact label; the exact
// kinds (a rink's adult public skate, a pool's adult swim) drop "from"; the card always shows the lowest real price. No
// Per room or group choice for sport (a golf fee is per person). Golf kinds run on type 'golf' listings.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-price-matrix-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const IK = require('../indoor-kinds.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]]));
let n = 0, ipN = 0, srv, base;
const mk = (o = {}) => app.createVenue({ name: `Sport Price Matrix ${++n}`, slug: `sport-price-matrix-${n}`, region: 'kelowna', type: 'sport', latitude: 49.88 + n / 5000, longitude: -119.49,
  address: `${n} Water St, Kelowna, BC`, hours: JSON.stringify(DAY('10:00', '18:00')), rating: 4.5, reviews: 100, description: 'A local place in Kelowna.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.119.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-20T12:00:00-08:00');
const sp = (x) => String(x).replace(/[\s  ]+/g, ' ').trim();
const plain = (h) => sp(String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’'));
const page = (v, lang = 'en') => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW }));
const money = (x, lang) => (lang === 'fr' ? `${String(x).replace('.', ',')} $` : `$${x}`);
const publishPrices = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: 'Prices', note: '', items: items.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));
const helpSay = async (t, lang) => {
  const h = await getText(`${lang === 'fr' ? '/fr' : ''}/owner/${t}/setup`);
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(h)[1]);
  const tp = cfg.topics.find((x) => x.id === 'indoor-price');
  const m = (lang === 'fr' ? /indiquent « ([^»]+) »/ : /say “([^”]+)”/).exec(plain(lang === 'fr' ? tp.aFr || tp.a : tp.a));
  return m ? sp(m[1]) : null;
};
const firstItem = async (t, lang) => { const m = /"firstItem":\{"name":"([^"]*)","price":"([^"]*)"\}/.exec(await getText(`${lang === 'fr' ? '/fr' : ''}/owner/${t}/menu`)); return m ? m[1] : null; };

const KINDS = IK.SPORT_KIND_TEXT_KINDS;
const GOLF_KINDS = ['golf', 'simgolf', 'range'];
const EXACT = IK.EXACT_PRICE_LABELS;
const MAIN = 40, LOWER = 25, HIGHER = 90, ROOM = 120, PERSON = 30, SUGG = 5;
// Scenario -> how the owner set it up.
const SCENARIOS = {
  main: { price: MAIN },
  lower: { price: MAIN, typed: [['Main', String(MAIN)], ['Lower one', String(LOWER)], ['Locker', '1']] },
  higher: { price: MAIN, typed: [['Main', String(MAIN)], ['Bigger one', String(HIGHER)]] },
  free: { price: 'free' },
  minimum: { price: PERSON, info: { per_min: 2 } },
};
const BAD_WORDS_RE = /Adult price|Prix adulte|Adults \$|Adultes :/;
// Every exact label, any language: a range kind's price line must name none of them.
const EXACT_RE = new RegExp(Object.values(EXACT).flat().map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

test('THE PRICE RULE for sport: every sport kind × every price scenario: the page, the card, Build My Trip, the setup preview, the finish preview, Help and the typer\'s first line agree (EN + FR); no "Adult price"; range kinds say no exact label; the card shows the lowest', { timeout: 280000 }, async () => {
  const bad = [];
  const results = {};
  const want = (cond, msg) => { if (!cond) bad.push(msg); };
  for (const k of KINDS) {
    results[k] = {};
    for (const [sc, cfg] of Object.entries(SCENARIOS)) {
      const id = `${k}/${sc}`;
      const v = mk(GOLF_KINDS.includes(k) ? { type: 'golf' } : {});
      const t = tokenFor(v.id);
      await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h', book: 'no', age: 'all', year: 'all', ...(cfg.info || {}) }, indoor_price: cfg.price }));
      if (cfg.typed) publishPrices(v.id, cfg.typed);
      app.writeIndoorVisitRows(v.id);
      app.indoorCardPrice(v.id);
      const perPerson = typeof cfg.price === 'number' && !(cfg.info && cfg.info.per);
      const lowest = cfg.typed ? Math.min(cfg.price, ...cfg.typed.filter((x) => x[0] !== 'Locker').map((x) => Number(x[1]))) : cfg.price;
      const exact = !!EXACT[k];
      // 1. The page's Prices row (EN + FR).
      const en = page(v), fr = page(v, 'fr');
      const rowEn = (/Prices (.+?\.)(?= [A-Z][a-z]+ |$)/.exec(en) || [])[1] || '', rowFr = (/Tarifs (.+?\.)(?= [A-ZÀ-Ý][a-zà-ÿ]+ |$)/.exec(fr) || [])[1] || '';
      const lineEn = app.indoorVisitLines(app.getVenue(v.id), app.venueIndoorInfo(v.id)).Prices;
      want(lineEn && en.includes(sp(lineEn.en)), `${id}: page EN has its Prices line (${lineEn && lineEn.en})`);
      want(lineEn && fr.includes(sp(lineEn.fr)), `${id}: page FR has its Prices line (${lineEn && lineEn.fr})`);
      const L = { en: sp(lineEn ? lineEn.en : ''), fr: sp(lineEn ? lineEn.fr : '') };
      for (const lang of ['en', 'fr']) want(!BAD_WORDS_RE.test(L[lang]), `${id}: ${lang} "${L[lang]}" says Adult price`);
      if (!exact) for (const lang of ['en', 'fr']) want(!EXACT_RE.test(L[lang]), `${id}: a range kind's ${lang} line names an exact label: "${L[lang]}"`);
      // What each scenario must say.
      if (sc === 'main' || sc === 'higher') want(L.en === (exact ? `${EXACT[k][0]} ${money(MAIN, 'en')}.` : IK.indoorKindText([k], 'en').price.page.replace('{x}', money(MAIN, 'en'))), `${id}: EN "${L.en}"`);
      if (sc === 'lower') {
        want(L.en.includes(money(LOWER, 'en')), `${id}: EN "${L.en}" leads with the lowest`);
        want(exact ? L.en === `From ${money(LOWER, 'en')} (${EXACT[k][0].charAt(0).toLowerCase()}${EXACT[k][0].slice(1)} ${money(MAIN, 'en')}).` : !L.en.includes(money(MAIN, 'en')), `${id}: EN "${L.en}"`);
        want(L.fr.includes(sp(money(LOWER, 'fr'))), `${id}: FR "${L.fr}" leads with the lowest`);
      }
      if (sc === 'room') want(/^From \$120 per room/.test(L.en) && /^À partir de 120 \$ par salle/.test(L.fr), `${id}: "${L.en}" / "${L.fr}"`);
      if (sc === 'free') want(L.en === 'Free entry.' && L.fr === 'Entrée gratuite.', `${id}: "${L.en}" / "${L.fr}"`);
      if (sc === 'donation') want(L.en === `By donation (suggested $${SUGG}).`, `${id}: "${L.en}"`);
      if (sc === 'minimum') want(/\(2-(?:player|person) minimum\)\.$/.test(L.en) && /\(minimum 2 (?:joueurs|personnes)\)\.$/.test(L.fr), `${id}: "${L.en}" / "${L.fr}"`);
      // 2. The card: the lowest real price, "From" unless an exact kind with nothing lower; its small line.
      const card = app.cardPriceFor(v.id), basis = (db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(v.id) || {}).basis;
      if (perPerson) {
        want(card === `${exact && sc !== 'lower' ? '' : 'From '}${money(lowest, 'en')}`, `${id}: card "${card}" (want the lowest, ${lowest})`);
        want(!BAD_WORDS_RE.test(String(basis)) && (exact || !EXACT_RE.test(String(basis))), `${id}: card line "${basis}"`);
        // Build My Trip: its words and amount are the page's.
        const f = app.indoorPlannerFacts(v.id);
        for (const [i, lang] of [[0, 'en'], [1, 'fr']]) want(sp(`${f.indoorPriceLine[i].replace('{x}', money(f.indoorPriceAt, lang))}.`).replace(/ \(\d-(?:player|person) minimum\)| \(minimum \d (?:joueurs|personnes)\)/, '') === L[lang].replace(/ \(\d-(?:player|person) minimum\)| \(minimum \d (?:joueurs|personnes)\)/, ''), `${id}: Build My Trip ${lang} "${f.indoorPriceLine[i]}" @ ${f.indoorPriceAt} vs page "${L[lang]}"`);
        want(f.indoorPriceAt === lowest, `${id}: Build My Trip amount ${f.indoorPriceAt} (want ${lowest})`);
      } else if (sc === 'room') want(card === 'From $120 / room', `${id}: card "${card}"`);
      else if (sc === 'free') want(card === 'Free', `${id}: card "${card}"`);
      else if (sc === 'donation') want(basis === 'By donation', `${id}: card line "${basis}"`);
      // 3. The setup's Price screen preview, EN + FR (her saved price, coming back).
      const pageLine = (lang) => L[lang].replace(/\.$/, '');
      for (const lang of ['en', 'fr']) {
        const g = await openSetup(base, t, { hash: 'price', ...(lang === 'fr' ? { lang } : {}) });
        const lead = sp(g.doc.getElementById('suTpriceLead').textContent);
        want(!BAD_WORDS_RE.test(lead), `${id}: ${lang} lead "${lead}"`);
        if (perPerson && sc !== 'minimum') want(lead.includes(`${lang === 'fr' ? '« ' : '“'}${pageLine(lang)}${lang === 'fr' ? ' »' : '”'}`), `${id}: ${lang} preview "${lead}" vs page "${pageLine(lang)}"`);
      }
      // 4. The finish preview (the card as it will look).
      if (perPerson && sc !== 'minimum') {
        const g = await openSetup(base, t, { hash: 'more' });
        await g.click('doneNow2');
        want(sp(g.text()).includes(pageLine('en')), `${id}: finish preview lacks "${pageLine('en')}"`);
        want(!BAD_WORDS_RE.test(g.text()), `${id}: finish preview says Adult price`);
      }
      // 5. Help's example says the page's words (EN + FR).
      for (const lang of ['en', 'fr']) { const say = await helpSay(t, lang); want(say === pageLine(lang), `${id}: Help ${lang} "${say}" vs page "${pageLine(lang)}"`); }
      // 6. The typer's first line: a true name for the unit; a range kind's never an exact label or "Adult".
      if (typeof cfg.price === 'number') {
        const first = await firstItem(t, 'en'), firstFr = await firstItem(t, 'fr');
        if (sc === 'room') want(first === 'One room' && firstFr === 'Une salle', `${id}: first line "${first}" / "${firstFr}"`);
        else {
          want(first === IK.TYPER_TRUE[k].name[0] || first === '', `${id}: first line "${first}" (want the neutral "${IK.TYPER_TRUE[k].name[0]}")`);
          if (!exact) want(!/\badult|\badulte/i.test(`${first} ${firstFr}`), `${id}: a range kind's first line "${first}" / "${firstFr}"`);
        }
      }
      results[k][sc] = L.en;
    }
  }
  // The matrix as a table, for the report.
  if (process.env.PRICE_MATRIX_OUT) fs.writeFileSync(process.env.PRICE_MATRIX_OUT, JSON.stringify(results, null, 2));
  assert.deepEqual(bad.filter(Boolean), []);
});

test('sport: no Per room or group choice on the Price screen; "45 per bay" for a simulator saves 45 as its hourly bay price', async () => {
  const v = mk({ type: 'golf', name: 'Matrix Sim Bays', description: 'Indoor golf simulators.' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['simgolf'], length: '1-2h', book: 'ahead', age: 'all', year: 'all' } }));
  const g = await openSetup(base, t, { hash: 'price' });
  assert.ok(!g.has('#suPerChips'), 'no per chips');
  await g.type('suTprice', '45 per bay');
  await g.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 45);
  assert.equal(app.venueIndoorInfo(v.id).per, undefined);
  assert.ok(page(v).includes('Bays from $45 an hour.'));
});
