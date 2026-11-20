// The sport kind table (2026-11-20, the sport easy setup): one table of words per sport kind (sport-kinds.js, merged into
// indoor-kinds.js), so a golf course, an arena or a skate park reads in its own words everywhere. One loop over every kind
// the sport setup offers, checking the table has every part in English and French, and that the setup screens (real taps,
// tests/setup-sim.js), the page, the card, Build My Trip and Help really use it. Golf kinds run on type 'golf' listings,
// the rest on type 'sport'. Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-kinds-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const IK = require('../indoor-kinds.js');
const SK = require('../sport-kinds.js');
const T = require('../owner-setup-text.js');
const { FR_TEXT } = require('../french-text.js');
const PC = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
const GOLF_KINDS = ['golf', 'simgolf', 'range'];
let n = 0;
// A plain name and story, so no kind is suggested from the words (a golf listing always starts on Golf course).
const mk = (type, o = {}) => app.createVenue({ name: `Sport Table Place ${++n}`, slug: `sport-table-${n}`, region: 'vernon', type, latitude: 50.26 + n / 3000, longitude: -119.27,
  address: `${n} Main St, Vernon, BC`, phone: '250-555-0100', website: 'https://kinds.example', hours: DAY('09:00', '18:00'), description: 'A local place.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-20T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const page = (v, lang = 'en') => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW }));
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const money = (n2, fr) => { const t = Number.isInteger(n2) ? String(n2) : n2.toFixed(2); return fr ? `${t.replace('.', ',')} $` : `$${t}`; };

test('the table: every sport kind has its price, Your prices, Help, Groups, search, chips and examples in English and French; no key is an indoor one', () => {
  assert.deepEqual(SK.SPORT_KINDS, PC.SPORT_KINDS, 'portal-completeness keeps the same list');
  assert.deepEqual(IK.SPORT_KIND_TEXT_KINDS, SK.SPORT_KINDS);
  for (const k of SK.SPORT_KINDS) assert.ok(!IK.INDOOR_KIND_TEXT_KINDS.includes(k), `${k} is not an indoor key`);
  assert.equal(app.SPORT_KINDS_SHOWN.length, 12, 'all 12 kinds show (no More kinds)');
  // Sport words never make a request "indoor places only".
  for (const w of ['golf', 'tee time', 'skate park', 'pickleball', 'disc golf', 'bmx', 'arena', 'skating']) assert.ok(!IK.INDOOR_TYPE_WORDS.includes(w), w);
  assert.deepEqual(IK.indoorKindsNamedIn('golf course and a skate park'), []);
  for (const k of SK.SPORT_KINDS) {
    for (const lang of ['en', 'fr']) {
      const w = IK.indoorKindText([k], lang), at = `${k} ${lang}`;
      for (const part of ['page', 'basis', 'label', 'ph', 'lead']) assert.ok(typeof w.price[part] === 'string' && w.price[part].trim().length > 2, `${at} price.${part}`);
      assert.match(w.price.page, /\{x\}/); assert.match(w.price.ph, /\d/, `${at}: the placeholder says a number`);
      for (const part of ['noun', 'page', 'lead', 'see', 'typeSub']) assert.ok(typeof w.prices[part] === 'string' && w.prices[part].trim(), `${at} prices.${part}`);
      for (const part of ['walkin', 'ages', 'gift', 'prices', 'busy', 'theme', 'repeat']) assert.ok(typeof w.help[part] === 'string' && w.help[part].trim().length > 3, `${at} help.${part}`);
      assert.equal(w.groups.chips.length, 3, at);
      assert.ok(w.groups.lead && w.groups.ex, at);
      assert.ok(Array.isArray(w.search) && w.search.length >= 3, `${at} search words`);
      assert.ok(w.events, `${at} events`);
      // No sport kind talks about museums or treatments.
      for (const x of [w.price.page, w.price.label, w.price.lead, w.prices.lead]) assert.doesNotMatch(x, /admission|treatment|museum|soin|musée/i, `${at}: ${x}`);
      if (lang === 'en') assert.equal(FR_TEXT[w.price.basis], IK.indoorKindText([k], 'fr').price.basis, `${k}: French card line`);
    }
    // English and French differ (the French is French).
    assert.notEqual(IK.indoorKindText([k], 'en').price.page, IK.indoorKindText([k], 'fr').price.page, k);
    const e = IK.indoorKindText([k], 'en');
    // The setup's own words for the kind: chips, Good to know example, story and Known for examples (EN and FR).
    for (const lang of ['en', 'fr']) {
      const S = T[lang].sport;
      assert.ok(S.kindText[k] && S.kindText[k].tpriceCard, `${k} ${lang} kindText`);
      assert.ok((S.quick.good_to_know_kinds[e.gtk] || []).length >= 4, `${k} ${lang} chips (${e.gtk})`);
      assert.ok(S.bringExKinds[e.gtk], `${k} ${lang} Good to know example`);
      assert.ok(S.storyExKinds[e.ex] && S.knownExKinds[e.ex], `${k} ${lang} story and Known for examples (${e.ex})`);
    }
    // The owner chip and the page word (except "Something else", which writes no words).
    assert.ok(app.INDOOR_KIND_LABELS_OWNER[k], `${k} owner label`);
    // Its usual season is one of three; its planner type is a known one.
    assert.ok(['summer', 'winter', ''].includes(e.season), k);
    assert.ok(['golf', 'indoor', 'outdoor', null].includes(SK.K[k].planner), k);
  }
  // Happy hour is never a sport chip or example.
  assert.doesNotMatch(JSON.stringify(T.en.sport.quick.good_to_know_kinds) + JSON.stringify(T.en.sport.bringExKinds), /happy hour/i);
});

test('every kind with real taps: picked on What kind of place, priced on Price; the page, the card, the French page, the planner and Help say its words', async () => {
  for (const k of SK.SPORT_KINDS) {
    const type = GOLF_KINDS.includes(k) ? 'golf' : 'sport';
    const v = mk(type), t = tokenFor(v.id);
    const sim = await openSetup(base, t, { hash: 'indoor' });
    // Take off whatever was picked (a golf listing starts on Golf course), then tap this kind.
    for (const on of sim.doc.getElementById('suIndoorKinds').querySelectorAll('[data-tkind][aria-pressed="true"]')) await sim.click(`[data-tkind="${on.getAttribute('data-tkind')}"]`);
    await sim.click(`[data-tkind="${k}"]`);
    // "Something else" has no usual visit length: she taps one.
    if (!sim.has('[data-tpick^="length:"][aria-pressed="true"]')) await sim.click('[data-tpick="length:1-2h"]');
    await sim.click('indoorSave');
    assert.deepEqual(app.venueIndoorInfo(v.id).kinds, [k], k);
    const price = IK.indoorKindText([k], 'en').exPrice;
    assert.match(sim.text(), new RegExp(IK.indoorKindText([k], 'en').price.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 20)), `${k}: the Price screen's label`);
    await sim.type('suTprice', String(price));
    await sim.click('priceSave');
    assert.equal(app.indoorPriceValue(v.id), price, k);
    const show = IK.indoorPriceShow([k], 'en', price, { money: (x) => money(x, false) });
    const showFr = IK.indoorPriceShow([k], 'fr', price, { money: (x) => money(x, true) });
    assert.ok(page(v).includes(show.page), `${k}: page says ${show.page}`);
    assert.ok(page(v, 'fr').includes(showFr.page), `${k}: French page says ${showFr.page}`);
    const card = db.prepare('SELECT from_price, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
    assert.equal(card.from_price, price, k); assert.equal(card.basis, show.card.basis, k);
    // The planner: golf kinds stay golf; the others plan as their kind's planner type (or not at all).
    const facts = app.buildTripPlannerFacts(true).find((x) => x.id === v.id);
    const want = type === 'golf' ? 'golf' : SK.K[k].planner;
    if (want) { assert.ok(facts, `${k} planned`); assert.equal(facts.type, want, k); assert.deepEqual(facts.indoorPriceLine, [show.line, showFr.line], k); }
    else assert.ok(!facts, `${k} is a local facility, not a planner stop`);
    // Help's price answer names the kind's own label and page words.
    const bot = helpBot(await getText(`/owner/${t}/setup`));
    const p = bot.topic('indoor-price');
    assert.ok(p.a.includes(show.page.replace(/\.$/, '')), `${k}: Help says ${show.page}`);
    assert.doesNotMatch(p.a, /admission|museum|treatment/i, `${k}: Help has no indoor words`);
  }
});
