// Indoor test 4 (2026-11-19): one table of words per indoor kind (indoor-kinds.js), so each kind reads in its own words
// everywhere. One loop over every kind the setup offers (gallery, museum, theatre, pool/rec/gym, climbing/trampoline,
// cinema, bowling, arcade/VR/karting, spa, escape room, playground, classes, and the More kinds: curling, yoga/fitness,
// casino, library, something else), checking the table has every part in English and French, and that the setup screens,
// the page, the card, Build My Trip, Help and search really use it (the real setup script with real taps, tests/setup-sim.js).
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-kinds-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const IK = require('../indoor-kinds.js');
const T = require('../owner-setup-text.js');
const { FR_TEXT } = require('../french-text.js');
const { INDOOR_KINDS } = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
let n = 0;
// A plain name and story, so no kind is suggested from the words: the kind tapped is the only one.
const mk = (o = {}) => app.createVenue({ name: `Kind Table Place ${++n}`, slug: `kind-table-${n}`, region: 'vernon', type: 'indoor', latitude: 50.26 + n / 3000, longitude: -119.27,
  address: `${n} Main St, Vernon, BC`, phone: '250-555-0100', website: 'https://kinds.example', hours: DAY('10:00', '18:00'), description: 'A local place.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.96.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const page = (v, lang = 'en') => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW }));
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const ADMISSION_KINDS = ['museum', 'gallery'];
const money = (lang) => (lang === 'fr' ? '20 $' : '$20');

test('the table: every kind the setup offers has its price, Your prices, Help, Groups and search words in English and French', () => {
  assert.deepEqual(IK.INDOOR_KIND_TEXT_KINDS.slice().sort(), INDOOR_KINDS.slice().sort());
  const groupsBefore = T.en.indoor.quick.groups.length;
  for (const k of INDOOR_KINDS) {
    for (const lang of ['en', 'fr']) {
      const w = IK.indoorKindText([k], lang);
      const at = `${k} ${lang}`;
      for (const part of ['page', 'basis', 'label', 'ph', 'lead']) assert.ok(typeof w.price[part] === 'string' && w.price[part].trim().length > 2, `${at} price.${part}`);
      assert.match(w.price.page, /\{x\}/, `${at} price.page`);
      for (const part of ['noun', 'page', 'lead', 'see']) assert.ok(typeof w.prices[part] === 'string' && w.prices[part].trim(), `${at} prices.${part}`);
      for (const part of ['walkin', 'ages', 'gift', 'prices']) assert.ok(typeof w.help[part] === 'string' && w.help[part].trim().length > 4, `${at} help.${part}`);
      assert.equal(w.groups.chips.length, groupsBefore, `${at}: the same number of Groups chips as before`);
      for (const c of w.groups.chips) assert.ok(c.trim(), at);
      assert.ok(w.groups.lead && w.groups.ex, `${at} groups lead and example`);
      assert.ok(Array.isArray(w.search) && w.search.length >= 2, `${at} search words`);
      // "Adult admission" only for kinds people pay admission to.
      if (!ADMISSION_KINDS.includes(k)) for (const x of [w.price.page, w.price.basis, w.price.label, w.price.ph, w.price.lead]) assert.doesNotMatch(x, /Adult admission|Adults \{x\}|Entrée adulte(?! à la séance)|Adultes :/i, `${at}: ${x}`); // (a pool's « Entrée adulte à la séance » is its drop-in)
      // The French is French: the card's line has a French twin the French pages use.
      if (lang === 'en') assert.equal(FR_TEXT[w.price.basis], IK.indoorKindText([k], 'fr').price.basis, `${k}: French card line`);
    }
    // The hours hint about box office hours only where there is a box office (or a class schedule).
    assert.equal(IK.indoorKindText([k], 'en').boxOffice, ['theatre', 'classes'].includes(k), `${k} box office hint`);
    // The setup words built from it, both languages.
    for (const lang of ['en', 'fr']) {
      const kt = T[lang].indoor.kindText[k];
      assert.ok(kt && kt.tpriceLabel && kt.tpriceCard && kt.tpriceLeadPick && kt.menuLead && kt.groupsLead && kt.quick.groups.length === groupsBefore, `${k} ${lang} kindText`);
      assert.equal(!!kt.noSetHoursHint, ['theatre', 'classes'].includes(k), `${k} ${lang} hint`);
    }
  }
  // The kinds named by their words, for search and Build My Trip.
  assert.deepEqual(IK.indoorKindsNamedIn('couples massage in Kelowna'), ['spa']);
  assert.deepEqual(IK.indoorKindsNamedIn('bouldering in Vernon'), ['climbing']);
  assert.deepEqual(IK.indoorKindsNamedIn('lane swim Penticton'), ['pool']);
  assert.deepEqual(IK.indoorKindsNamedIn('tenpin bowling'), ['bowling']);
  assert.deepEqual(IK.indoorKindsNamedIn('5-pin bowling'), ['bowling']);
  assert.deepEqual(IK.indoorKindsNamedIn('pottery class'), ['classes']);
  assert.deepEqual(IK.indoorKindsNamedIn('toddler play'), ['kids']);
  assert.deepEqual(IK.indoorKindsNamedIn('a movie tonight'), ['cinema']);
  assert.deepEqual(IK.indoorKindsNamedIn('slots'), ['casino']);
  assert.deepEqual(IK.indoorKindsNamedIn('learn to curl'), ['curling']);
  assert.deepEqual(IK.indoorKindsNamedIn('massage en couple samedi'), ['spa']);
  // The planner and search read the same words: each kind has words that make a request about indoor places.
  for (const k of INDOOR_KINDS.filter((x) => x !== 'other')) {
    const hit = IK.INDOOR_KIND_TEXT[k].en.search.find((w) => app.interpretDiscoveryText(`${w} in Vernon`).types.includes('indoor'));
    assert.ok(hit, `${k}: an English search word that means an indoor place`);
  }
});

test('every kind, end to end: the Price screen (label, placeholder, preview), the page, the card and Build My Trip say its own words (EN + FR)', async () => {
  for (const k of INDOOR_KINDS) {
    const v = mk();
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h' } }));
    const en = IK.indoorKindText([k], 'en'), fr = IK.indoorKindText([k], 'fr');
    // The setup's Price screen, as the owner sees it.
    const sim = await openSetup(base, t, { hash: 'price' });
    assert.equal(sim.doc.getElementById('suScreen').querySelector('label[for="suTprice"]').textContent, en.price.label, k);
    assert.equal(sim.doc.getElementById('suTprice').getAttribute('placeholder'), en.price.ph, k);
    // (A fixture's id can match a real listing's researched card price, which pre-fills the box: the lead then says it.)
    if (!sim.doc.getElementById('suTprice').value) assert.equal(sim.doc.getElementById('suTpriceLead').textContent, en.price.lead, k);
    await sim.type('suTprice', '20');
    assert.equal(sim.doc.getElementById('suTpriceLead').textContent, `Your page will say “${en.price.page.replace('{x}', '$20').replace(/\.$/, '')}”.`, k);
    await sim.click('priceSave');
    assert.equal(app.indoorPrice(v.id), 20, k);
    const simFr = await openSetup(base, t, { hash: 'price', lang: 'fr' });
    assert.equal(simFr.doc.getElementById('suScreen').querySelector('label[for="suTprice"]').textContent, fr.price.label, `${k} fr`);
    // The page's Prices line and the card's line, in both languages.
    for (const [lang, w] of [['en', en], ['fr', fr]]) assert.ok(page(v, lang).includes(w.price.page.replace('{x}', money(lang))), `${k} ${lang}: ${w.price.page}`);
    const card = db.prepare('SELECT from_price, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
    assert.equal(card.from_price, 20, k); assert.equal(card.basis, en.price.basis, k);
    if (!ADMISSION_KINDS.includes(k)) { assert.doesNotMatch(page(v), /Adults \$20|Adult admission/, k); assert.doesNotMatch(page(v, 'fr'), /Adultes : 20/, k); }
    // Build My Trip's price line is the page's.
    const f = app.indoorPlannerFacts(v.id);
    assert.deepEqual(f.indoorPriceLine, [en.price.page.replace(/\.$/, ''), fr.price.page.replace(/\.$/, '')], k);
  }
});

test('every kind: its Groups chips (same number), Your prices words, the box office hint only for theatres and classes, Help examples of its own', async () => {
  const others = (k, part) => INDOOR_KINDS.filter((x) => x !== k && x !== 'other').map((x) => IK.indoorKindText([x], 'en').help[part]).filter((x) => x !== IK.indoorKindText([k], 'en').help[part]);
  for (const k of INDOOR_KINDS) {
    const v = mk();
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h' } }));
    const en = IK.indoorKindText([k], 'en');
    const g = await openSetup(base, t, { hash: 'groups' });
    const chips = g.doc.getElementById('suScreen').querySelectorAll('[data-key="groups"]').map((b) => b.getAttribute('data-quick'));
    assert.deepEqual(chips, en.groups.chips, `${k}: ${g.text().slice(0, 300)}`);
    assert.match(g.text(), new RegExp(en.groups.lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), k);
    const m = await openSetup(base, t, { hash: 'menu' });
    assert.ok(m.text().includes(en.prices.lead), `${k}: ${m.text().slice(0, 300)}`);
    const h = await openSetup(base, t, { hash: 'hours' });
    const hint = /Put box office hours in Good to know/.test(h.text());
    assert.equal(hint, en.boxOffice, `${k}: box office hint ${hint}`);
    // Help: the kind's own examples, not another kind's.
    const bot = helpBot(await getText(`/owner/${t}/setup`));
    const p = (x) => String(x).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    assert.ok(p(bot.topic('indoor-price').a).includes(en.help.prices), `${k} prices example`);
    assert.ok(p(bot.topic('indoor-age').a).includes(en.help.ages), `${k} ages example`);
    assert.ok(p(bot.topic('indoor-gift').a).includes(en.help.gift), `${k} gift example`);
    assert.ok(p(bot.topic('indoor-booking').a).includes(en.help.walkin), `${k} walk-in example`);
    assert.ok(p(bot.topic('menu-add').a).includes(`“${en.prices.page}”`), `${k} prices link name`);
    for (const part of ['prices', 'ages', 'gift', 'walkin']) for (const o of others(k, part)) assert.ok(!Object.values({ a: p(bot.topic('indoor-price').a), b: p(bot.topic('indoor-age').a), c: p(bot.topic('indoor-gift').a), d: p(bot.topic('indoor-booking').a) }).some((x) => x.includes(o)), `${k}: another kind's example "${o}"`);
    if (!en.arts) assert.doesNotMatch(p(bot.topic('indoor-gift').a), /Gift shop/, k);
  }
});

// Indoor test 13 (2026-11-19; Dan's cinema: his showtimes link was a "Book a party" button and folded away under walk-ins;
// his page said "Times vary" with a showtimes link). The sweeps over every kind.
const NONE_HOURS = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const setLink = (id, url) => db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(id, url);
const bookButton = (v, lang) => ((/<a [^>]*data-track="booking"[^>]*>([^<]*)<\/a>/.exec(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW })) || [])[1] || '').replace(/&amp;/g, '&').replace(/ ↗$/, '');

test('Indoor test 13 sweep (S2): every kind and booking answer: the page\'s link button (EN + FR) and the setup\'s link box say what the link is; "Book a party" only for a party link (or a kids\' place\'s party Groups line)', async () => {
  const B = IK.INDOOR_BOOK_BUTTONS, fails = [];
  for (const k of INDOOR_KINDS) {
    const v = mk(); const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h', book: 'no', age: 'all', year: 'all' }, visit_rows: { groups: 'Birthday parties with a private room' } }));
    approveAll(v.id);
    setLink(v.id, 'https://kinds.example/book');
    const w = IK.indoorKindText([k], 'en');
    for (const book of ['no', 'busy', 'ahead']) {
      await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h', book, age: 'all', year: 'all' } }));
      const want = w.ticketed ? B.shows : w.classKind ? B.classes : book === 'no' ? (k === 'kids' ? B.party : B.visit) : B.book;
      for (const [i, lang] of [[0, 'en'], [1, 'fr']]) if (bookButton(v, lang) !== want[i]) fails.push(`${k} ${book} ${lang}: "${bookButton(v, lang)}" (want "${want[i]}")`);
      // The setup's link box title, as the owner sees it with that answer saved (tapping it again would take it back).
      const g = await openSetup(base, t, { hash: 'booking' });
      if (!g.has(`[data-tpick="book:${book}"][aria-pressed="true"]`) && !/aria-pressed="true"[^>]*data-tpick="book:/.test(g.screen()) ) await g.click(`[data-tpick="book:${book}"]`);
      const q = (g.doc.getElementById('suLinkQ') || { textContent: '(no box)' }).textContent;
      const wantQ = w.ticketed ? 'Your showtimes or tickets link' : w.classKind ? 'Your class schedule link' : book === 'no' ? T.en.indoor.tbookQParty : T.en.indoor.tbookQ;
      if (q !== wantQ) fails.push(`${k} ${book} setup: "${q}" (want "${wantQ}")`);
    }
    // A party page link: "Book a party" for a walk-in place of any kind but a ticketed or class one... and for those too, the link is the party page.
    setLink(v.id, 'https://kinds.example/birthday-parties');
    await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
    if (bookButton(v, 'en') !== B.party[0]) fails.push(`${k} party link: "${bookButton(v, 'en')}"`);
  }
  assert.deepEqual(fails, []);
});

test('Indoor test 13 sweep (S3): every kind with no set hours and a link says what the link is, linked (page EN + FR, Build My Trip\'s fact); with no link "Times vary · check before you go"', async () => {
  const fails = [];
  for (const k of INDOOR_KINDS) {
    const v = mk(); const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [k], length: '1-2h', book: 'busy', age: 'all', year: 'all', visit: 'appointment' } }));
    await ok(change(t, { hours: NONE_HOURS }));
    approveAll(v.id);
    if (!/Times vary · check before you go/.test(page(v))) fails.push(`${k} no link: ${(/Hours[^.]{0,80}/.exec(page(v)) || [''])[0]}`);
    setLink(v.id, `https://kinds.example/${k}/times`);
    const kind = IK.indoorTimesKind([k]), [en, fr] = IK.INDOOR_TIMES_LINES[kind];
    const h = app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en', now: NOW });
    if (!h.includes(`<a href="https://kinds.example/${k}/times" rel="nofollow noopener" target="_blank">${en}</a>`)) fails.push(`${k} en: no linked "${en}"`);
    if (/Times vary/.test(page(v))) fails.push(`${k} en: still "Times vary"`);
    if (!page(v, 'fr').includes(fr.replace(/’/g, '’'))) fails.push(`${k} fr: no "${fr}"`);
    if (app.indoorPlannerFacts(v.id).indoorTimes !== kind) fails.push(`${k} planner fact: ${app.indoorPlannerFacts(v.id).indoorTimes}`);
    if (k === 'cinema' || k === 'theatre') { if (kind !== 'shows') fails.push(`${k}: ${kind}`); } else if (k === 'yoga' || k === 'classes') { if (kind !== 'classes') fails.push(`${k}: ${kind}`); } else if (kind !== 'web') fails.push(`${k}: ${kind}`);
  }
  assert.deepEqual(fails, []);
});

test('Indoor test 13 sweep (S1): every kind has a slot length (its Time needed answer wins) and the planner reads it', () => {
  const TR = require('../trip-requirements.js');
  for (const k of INDOOR_KINDS) {
    const slot = IK.indoorKindText([k], 'en').slot;
    if (k === 'other') { assert.equal(slot, null); continue; }
    assert.ok(slot >= 60 && slot <= 150, `${k}: ${slot}`);
    assert.equal(TR.indoorSlotOf({ type: 'indoor', indoorKinds: [k] }, []), slot, k);
    for (const [len, m] of Object.entries(IK.INDOOR_LENGTH_MINUTES)) assert.equal(TR.indoorSlotOf({ type: 'indoor', indoorKinds: [k], indoorLength: len }, []), m, `${k} ${len}`);
  }
  // The examples Dayton gave.
  const S = (k) => IK.indoorKindText([k], 'en').slot;
  assert.deepEqual([S('cinema'), S('theatre'), S('museum'), S('bowling'), S('escape'), S('spa'), S('climbing')], [150, 150, 90, 90, 60, 150, 120]);
});
