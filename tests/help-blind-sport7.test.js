// Blind Help check (sport test 7, 2026-11-20): 180 questions written blind by six kinds of sport and golf owners
// (tests/help-blind-sport7-questions.js), asked through the widget's own matcher on a place set up as that owner's kind.
// None may land on a harmful answer; the trained half must keep landing at least 83% well and the held-out half 72%
// (sport test 7: held-out 64.4% before, 72.2% after; trained 64.4% before, 83.3% after).
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'help-blind-sport7-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const { Q } = require('./help-blind-sport7-questions.js');
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
const SET = { golf: { type: 'golf', kinds: ['golf'], book: 'busy', price: 65, season: '04-01:10-31' }, simgolf: { type: 'golf', kinds: ['simgolf'], book: 'busy', price: 45 },
  discgolf: { type: 'sport', kinds: ['discgolf'], book: 'no', price: 'free' }, rink: { type: 'sport', kinds: ['rink'], book: 'no', price: 5, season: '10-01:03-15' },
  swim: { type: 'sport', kinds: ['swim'], book: 'no', price: 6, season: '06-01:09-05' }, skatepark: { type: 'sport', kinds: ['skatepark'], book: 'no', price: 'free' },
  skischool: { type: 'sport', kinds: ['skischool'], book: 'ahead', price: 129, season: '11-26:04-06' }, bike: { type: 'sport', kinds: ['bike'], book: 'no', price: 'free', season: '05-01:10-15' } };

test('blind Help: 180 fresh owner questions: no harmful answer; trained half ≥ 83%, held-out half ≥ 72%', { timeout: 280000 }, async () => {
  const bots = {}; let n = 0;
  for (const [k, c] of Object.entries(SET)) {
    n++;
    const v = app.createVenue({ name: `Blind ${k}`, slug: `blind-${k}`, region: 'kelowna', type: c.type, latitude: 49.88 + n / 1000, longitude: -119.49, address: `${n} Water St, Kelowna`, website: `https://b-${n}.example.com`, hours: JSON.stringify(WK), description: 'A fixture.' });
    const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const post = (changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.78.${n}.1` }, body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
    if (c.season) assert.ok([200, 201].includes((await post({ hours: WK, open_months: c.season })).status));
    assert.ok([200, 201].includes((await post({ indoor_info: { kinds: c.kinds, length: '1-2h', book: c.book, age: 'all', year: c.season ? 'seasonal' : 'all' }, indoor_price: c.price })).status));
    bots[k] = {};
    for (const [page, p] of [['setup', '/setup'], ['edit', '']]) bots[k][page] = { en: helpBot(await get(`/owner/${t}${p}`)), fr: helpBot(await get(`/fr/owner/${t}${p}`)) };
  }
  const harmful = [], good = { train: 0, held: 0 }, all = { train: 0, held: 0 };
  for (const [half, , kind, page, lang, q, ok, harm] of Q) {
    const r = bots[kind][page][lang].best(q);
    all[half]++;
    if (r.id && harm.includes(r.id)) { harmful.push(`${kind} "${q}" -> ${r.id}`); continue; }
    if (r.id ? ok.includes(r.id) : ok.includes('UNSURE')) good[half]++;
  }
  assert.deepEqual(harmful, [], 'no blind question may land on an answer that undoes the owner’s setup');
  assert.ok(good.train / all.train >= 0.83, `trained half ${good.train}/${all.train}`);
  assert.ok(good.held / all.held >= 0.72, `held-out half ${good.held}/${all.held}`);
});
