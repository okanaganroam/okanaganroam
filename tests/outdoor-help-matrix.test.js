// Outdoor Help matrix (2026-11-23; outdoor test 1: a campground owner's 31 Help questions got 7 good answers, the rest in
// golf, sport, indoor or food words). For every outdoor kind (outdoor-kinds.js), the questions its owners type
// (tests/outdoor-help-questions.js, a third in French) are asked through the widget's own matcher (window.__ohbBest) with
// the real setup, price list and edit page config of a place of that kind, and must land on one of their topics. Then the
// campground's own 31 (held out), and every answer and suggestion title in the kind's words, never golf's, a sport's,
// an indoor place's or a restaurant's.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards (git checkout okanagan.db).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'outdoor-help-matrix-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const OH = require('../outdoor-help.js');
const FX = require('./outdoor-help-questions.js');
app.setVenueSubmissionTransport(async () => {});

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); srv.keepAliveTimeout = 120000; await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q, s) => ctx.window.__ohbBest(q, s), topic: (id) => topics.find((x) => x.id === id), topics };
};
const owners = {};
const ownerBots = async (kind) => {
  if (owners[kind]) return owners[kind];
  const o = await FX.makeOwner(app, base, kind, 600 + Object.keys(owners).length);
  const t = o.token;
  owners[kind] = { setup: helpBot(await get(`/owner/${t}/setup`)), frsetup: helpBot(await get(`/fr/owner/${t}/setup`)), menu: helpBot(await get(`/owner/${t}/menu`)), frmenu: helpBot(await get(`/fr/owner/${t}/menu`)),
    edit: helpBot(await get(`/owner/${t}`)), fredit: helpBot(await get(`/fr/owner/${t}`)) };
  return owners[kind];
};
const strip = (x) => String(x || '').replace(/<[^>]+>/g, ' ');
const say = (bot, q, fr, s) => { const r = bot.best(q, s); const tp = r.id && bot.topic(r.id); return { id: r.id, hits: r.hits, a: tp ? strip(fr ? tp.aFr : tp.a) : '' }; };
const landed = (r, want) => !!r && !!r.id && want.includes(r.id);

test('the outdoor Help questions: about 25 for a campground, rentals, a farm and an adventure park, about 10 for every other kind, a third in French', () => {
  for (const k of OH.KINDS) {
    const rows = FX.QUESTIONS[k] || [];
    const big = ['camp', 'waterrent', 'farm', 'adventurepark'].includes(k);
    assert.ok(rows.length >= (big ? 25 : 10), `${k}: ${rows.length} questions`);
    assert.ok(rows.filter((r) => r[0] === 'fr').length * 3.4 >= rows.length, `${k}: ${rows.filter((r) => r[0] === 'fr').length} in French of ${rows.length}`);
  }
});

test('every outdoor kind’s questions land on a right answer, on the page they are asked from (EN + FR)', async () => {
  const wrong = []; let n = 0;
  for (const k of OH.KINDS) {
    const b = await ownerBots(k);
    for (const [lang, pg, q, want] of FX.QUESTIONS[k]) {
      n++;
      const r = b[(lang === 'fr' ? 'fr' : '') + pg].best(q);
      if (!landed(r, want)) wrong.push(`${k} [${lang} ${pg}] "${q}" -> ${r && r.id} (want ${want.join(' or ')}; hits ${r && r.hits.slice(0, 4).join(',')})`);
    }
  }
  console.log(`outdoor Help matrix: ${n - wrong.length} of ${n} land`);
  assert.deepEqual(wrong, []);
});

test('outdoor test 1: the campground’s own 31 Help questions (held out) land, on the page and screen she asked from', async () => {
  const b = await ownerBots('camp');
  const wrong = [];
  for (const [lang, pg, screen, q, want] of FX.CAMP_LOG) {
    const r = b[(lang === 'fr' ? 'fr' : '') + pg].best(q, screen);
    if (!landed(r, want)) wrong.push(`[${lang} ${pg}#${screen}] "${q}" -> ${r && r.id} (want ${want.join(' or ')})`);
  }
  assert.equal(FX.CAMP_LOG.length, 31);
  assert.deepEqual(wrong, []);
});

test('every outdoor Help answer and title in the kind’s own words (setup, price list and edit page, EN + FR): no golf, sport, indoor or food words, no {TOKEN}', async () => {
  const bad = [];
  for (const k of OH.KINDS) {
    const b = await ownerBots(k);
    for (const pg of ['setup', 'frsetup', 'menu', 'frmenu', 'edit', 'fredit']) for (const tp of b[pg].topics) {
      const txt = [tp.q, tp.qFr, strip(tp.a), strip(tp.aFr)].join(' | ');
      const f = OH.foreignIn(txt, k);
      if (f) bad.push(`${k} ${pg} ${tp.id}: “${f}”`);
      if (/\{[A-Z_]+\}/.test(txt)) bad.push(`${k} ${pg} ${tp.id}: a {TOKEN} is left`);
      if (OH.DROP.has(tp.id)) bad.push(`${k} ${pg} ${tp.id}: a golf, sport, indoor or food topic`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('outdoor test 1: what the campground’s answers say (24 hours and the office line, part of the park, the office on a holiday, guests-only, visit length, rates)', async () => {
  const b = await ownerBots('camp');
  const s = (q, fr = false, pg = 'setup') => say(b[(fr ? 'fr' : '') + pg], q, fr);
  const hrs = s('campers are here 24/7 but the office is 8-8, which hours');
  assert.match(hrs.a, /Open 24 hours/); assert.match(hrs.a, /Good to know[\s\S]*Office 8 AM to 8 PM/);
  assert.match(s('our beach sites close oct 16 to april 14 but the rest of the park is open').a, /Don’t use Closures or your season/);
  assert.match(s('the office is closed christmas day but the park is open').a, /Don’t tick that day/);
  assert.match(s('a potluck only for guests staying with us, is it an event?').a, /Not an event/);
  assert.match(s('how long do visits last').a, /no visit length for a campground/);
  assert.match(s('the cabin is $325 a night, where does it go').a, /Your prices[\s\S]*Lakefront cabin/);
  assert.match(s('ou est-ce que je dis que les feux de bois sont interdits?', true).a, /Aucun feu de bois/);
  // The shared answers in campground words: never "Lessons and camps", a café or PD-day camps.
  for (const tp of b.setup.topics) assert.doesNotMatch(`${tp.q} ${strip(tp.a)}`, /Lessons and camps|PD-day|café or snack bar|room, game or show|Members only/, tp.id);
  // A rental shop's answers are its own: boats, life jackets, the deposit, the boating card.
  const w = await ownerBots('waterrent');
  assert.match(say(w.setup, 'damage deposit on the boats').a, /\$500 damage deposit/);
  assert.match(say(w.setup, 'do drivers need a boating licence').a, /boating card/);
  // A ski hill's part closure is one lift; a market's vendors are a Good to know line, rain or shine.
  assert.match(say((await ownerBots('skihill')).setup, 'the summit chair closes some days but the rest of the hill is open').a, /Summit chair/);
  assert.match(say((await ownerBots('market')).setup, 'about 80 vendors, rain or shine').a, /80 vendors/);
});
