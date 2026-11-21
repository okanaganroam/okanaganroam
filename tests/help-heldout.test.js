// Held-out Help check (sport test 6, 2026-11-20; Priya: the 631-question matrix passed, yet 11 of her 34 real questions got
// a good answer, and one would have closed her arena on her busiest skating days). Every real owner question from sport
// tests 1-6 and indoor tests 1-19 (tests/help-heldout-questions.js) is asked through the widget's own matcher
// (window.__ohbBest) on the page it was asked from, with a place set up like that test's. None may land on a harmful
// answer; every question that lands well today must keep landing well; at least 97% must land well.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'help-heldout-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const H0 = require('./help-heldout-questions.js');
// Sport tests 8-10 (2026-11-21): Marg's, Gord's and Lorraine's real questions join the set.
const S89 = require('./help-sport89-questions.js'), S10 = require('./help-sport10-questions.js');
// Sport test 11 (2026-11-21): Geneviève's 24 (22 in French).
const S11 = require('./help-sport11-questions.js');
const SRC = { ...H0.SRC, ...S89.SRC, ...S10.SRC, ...S11.SRC }, Q = [...H0.Q, ...S89.Q, ...S10.Q, ...S11.Q], KNOWN_MISS = H0.KNOWN_MISS;
app.setVenueSubmissionTransport(async () => {});

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'the page has the Help widget');
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  return { best: (q) => ctx.window.__ohbBest(q) };
};
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '17:00']]]));
const SEA = { winter: '11-26:04-06', summer: '04-01:10-31' };

async function botsFor(src, n) {
  const c = SRC[src];
  const v = app.createVenue({ name: `Heldout ${src}`, slug: `heldout-${src}`, region: 'kelowna', type: c.type, latitude: 49.88 + n / 1000, longitude: -119.49, address: `${n} Water St, Kelowna`, website: `https://example-${n}.com`, hours: JSON.stringify(WK), description: 'A fixture.' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const post = (changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.66.${n}.1` }, body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
  if (c.season) assert.ok([200, 201].includes((await post({ hours: WK, open_months: SEA[c.season] || c.season })).status), `${src} season`);
  const info = { kinds: c.kinds, length: c.length || '1-2h', book: c.book, age: c.age || 'all', year: c.season || c.year === 'seasonal' ? 'seasonal' : 'all' };
  const r = await post({ indoor_info: info, indoor_price: c.free || c.price });
  assert.ok([200, 201].includes(r.status), `${src} setup`);
  const out = {};
  for (const [page, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) out[page] = { en: helpBot(await get(`/owner/${t}${p}`)), fr: helpBot(await get(`/fr/owner/${t}${p}`)) };
  return out;
}

test('held-out Help: real owner questions land on a good answer, never a harmful one', async () => {
  const bots = {}; let n = 0;
  for (const src of Object.keys(SRC)) bots[src] = await botsFor(src, ++n);
  const harmful = [], newMiss = [];
  let good = 0;
  for (const [src, page, lang, q, ok, harm] of Q) {
    const r = bots[src][page][lang].best(q);
    const fine = r.id ? ok.includes(r.id) : ok.includes('UNSURE');
    if (r.id && harm.includes(r.id)) harmful.push(`${src} "${q}" -> ${r.id}`);
    if (fine && !(r.id && harm.includes(r.id))) good++;
    else if (!KNOWN_MISS.includes(q)) newMiss.push(`${src} "${q}" -> ${r.id || 'not sure'} (wants ${ok.join(' / ')})`);
  }
  assert.deepEqual(harmful, [], 'no real question may land on an answer that undoes the owner’s setup');
  assert.deepEqual(newMiss, [], 'a question that landed well must keep landing well');
  assert.ok(good / Q.length >= 0.97, `held-out good ${good}/${Q.length}`);
});
