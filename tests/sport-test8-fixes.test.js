// Sport tests 8 and 9 fixes (2026-11-21; Marg, a volunteer at a 9-hole walk-on course in Lumby, and Gord, the GM of an
// 18-hole semi-private course in Summerland; drafts/fresh-eyes-sport8-2026-11-21 and -sport9-…/REPORT.md). Dayton's two
// decisions: "Ask us" when Help isn't sure (her exact question to Dayton, through the Message us channel), and the
// small-course golf chips. Also the setup's kind-worded dog chips, the 9-hole length, the rates page (never a booking
// link), research's "mid March through the end of October" season and the owner home tiles. Search and Build My Trip are
// tests/sport-test8-search-planner.test.js; the page is tests/sport-test8-page.test.js.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test8-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q } = require('./help-sport89-questions.js');
const { openSetup } = require('./setup-sim.js');
const sent = [];
app.setVenueSubmissionTransport(async (fields) => { sent.push(fields); });
// Help's emails to info@ go by the owner email transport; each one is kept here as the fields the email lists.
const asText = (m) => Object.fromEntries([['_subject', m.subject], ...String(m.text || '').split('\n\n').map((x) => { const i = x.indexOf(': '); return [x.slice(0, i), x.slice(i + 2)]; })]);
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { if (m && m.to === 'info@okanaganroam.com') sent.push(asText(m)); });

let srv, base, ipN = 0, n = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '20:00']]]));
const ip = () => `10.128.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => { assert.ok([200, 201].includes(r.status), `change ${r.status}`); return r; });
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'the page has the Help widget');
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  return { best: (q) => ctx.window.__ohbBest(q), cfg: JSON.parse(m[1]), script: m[2] };
};
const setupCfg = (html) => JSON.parse(/<script>window\.SETUP_CFG = ([\s\S]*?);<\/script>/.exec(html)[1]);
function mk(o = {}) {
  n++;
  return app.createVenue({ name: o.name || `Sport Eight ${n}`, slug: `sport-eight-${n}`, region: o.region || 'lumby', type: o.type || 'golf', latitude: 50.25 + n / 4000, longitude: -118.97, rating: 4.4, reviews: 40,
    address: `${n} Hwy 6`, website: o.website === undefined ? `https://eight-${n}.example.com/` : o.website, hours: JSON.stringify(WK), description: o.description || 'A fixture for sport test 8.', description_fr: 'Un lieu de test.' });
}
async function setUp(c, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, o.email ? { contact_email: o.email } : {}).url.split('/owner/')[1];
  if (c.season) await change(t, { hours: WK, open_months: c.season });
  await change(t, { indoor_info: { kinds: c.kinds, length: c.length || '1-2h', book: c.book, age: 'all', year: c.season ? 'seasonal' : 'all' }, indoor_price: c.price });
  return { v, t };
}

test('1. Help on both owners’ real questions: no harmful or wrong-way answer; each lands on a right answer, or "I’m not sure" with Ask us where that is fine', async () => {
  const bots = {};
  for (const [src, c] of Object.entries(SRC)) {
    const { t } = await setUp(c);
    bots[src] = {};
    for (const [page, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[src][page] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  }
  const bad = [];
  for (const [src, page, lang, q, ok, harm] of Q) {
    const r = bots[src][page][lang].best(q);
    if (r.id && harm.includes(r.id)) bad.push(`HARM ${src} "${q}" -> ${r.id}`);
    else if (r.id ? !ok.includes(r.id) : !ok.includes('UNSURE')) bad.push(`${src} "${q}" -> ${r.id || 'not sure'} (wants ${ok.join(' / ')})`);
  }
  assert.deepEqual(bad, []);
  // The hijack: the weekly-nights answer needs a weekly night, never one shared word.
  const b = bots.sport9.setup.en;
  for (const q of ['We close to the public every Labour Day long weekend for the Summerland Mens Amateur. Do I tick every year?', 'We are semi private. Members get the weekend morning tee times until 10.', 'No real happy hour. The grill has its own page and does specials Wednesday nights after mens night.'])
    assert.notEqual(b.best(q).id, 'indoor-theme-nights', q);
  assert.equal(b.best('Wednesdays from noon to 4:30 is mens night so the public cant get a tee time').id, 'indoor-theme-nights');
  // "we don't do tee times" points to the walk-on answer, never "Tee times recommended".
  const w = bots.sport8.setup.en, wa = w.cfg.topics.find((x) => x.id === w.best('we dont do tee times at all. you just show up and go first come first served').id);
  assert.equal(wa.id, 'sport-walk-ons');
  assert.match(wa.a, /Yes, walk-ons welcome/); assert.match(wa.a, /Walk-ons only: no tee times/);
  for (const x of w.cfg.topics) assert.doesNotMatch(String(x.a), /Tee times recommended/, `${x.id} never names the chip a walk-on course isn't offered`);
  assert.doesNotMatch(JSON.stringify(bots.sport8.setup.fr.cfg.topics.map((x) => x.aFr)), /Heures de départ conseillées/);
  // A golf course's own price in the course details answer; the GST line on the price help.
  assert.match(w.cfg.topics.find((x) => x.id === 'sport-golf-details').a, /Green fees from \$20/);
  assert.match(b.cfg.topics.find((x) => x.id === 'sport-tax').a, /Prices before tax are fine[^<]*<em>\+GST<\/em> in Your prices/);
  // What isn't a field is explained as a Good to know line or this year's closure dates.
  assert.match(b.cfg.topics.find((x) => x.id === 'sport-members').a, /no public tee times/);
  assert.match(b.cfg.topics.find((x) => x.id === 'sport-one-off-closure').a, /Don’t tick <strong>Every year<\/strong>/);
});

test('2. "Ask us": not sure says so and offers Ask us (EN + FR); the question goes to Dayton as typed, with the listing and the screen; one visit’s questions are one email', async () => {
  const { v, t } = await setUp(SRC.sport8, { name: 'Lumby Golf Ask Fixture', email: 'marg@example.com' });
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  assert.equal(en.cfg.ui.en.askUs, 'Ask us'); assert.equal(fr.cfg.ui.fr.askUs, 'Demandez-nous');
  assert.match(en.cfg.ui.en.unsure, /I’m not sure about that one, so I won’t guess/);
  assert.match(fr.cfg.ui.fr.unsure, /je préfère ne pas deviner/);
  assert.match(en.cfg.ui.en.askSent, /Sent — we’ll reply by email/);
  assert.match(fr.cfg.ui.fr.askSent, /Envoyé — nous vous répondrons par courriel/);
  assert.match(en.script, /function askUs\(q, row\)/); assert.match(en.script, /chips\(sugg, true, q\)/);
  assert.equal(en.best('How do I see what the public sees on our page?').id, null);
  sent.length = 0;
  const post = (body) => fetch(`${base}/owner/help`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': '10.129.0.9' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json() }));
  const visit = Date.now();
  let r = await post({ message: 'what do I put for the 18 its just the 9 played twice', path: `/owner/${t}/menu`, page: 'menu', screen: '#type', ask: true, visit, lang: 'en', company_website: '' });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  r = await post({ message: 'my husband took these on his phone last summer is that alright', path: `/owner/${t}/setup`, page: 'setup', screen: '#photos', ask: true, visit, lang: 'en', company_website: '' });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0, 'the email waits for the rest of the visit');
  assert.equal(await app.sendOwnerAsksNow(), 1);
  assert.equal(sent.length, 1, 'one email for the visit');
  const m = sent[0];
  assert.match(m._subject, /\[OWNER HELP\] Lumby Golf Ask Fixture: Help wasn’t sure \(2 questions\)/);
  assert.match(m.Questions, /1\. “what do I put for the 18 its just the 9 played twice” \(on menu #type\)/);
  assert.match(m.Questions, /2\. “my husband took these on his phone last summer is that alright” \(on setup #photos\)/);
  assert.match(m.Listing, new RegExp(`Lumby Golf Ask Fixture \\(venue #${v.id}\\)`));
  assert.equal(m['Reply to'], 'marg@example.com', 'the edit link’s email, so she needn’t type it');
  assert.doesNotMatch(m.Page, new RegExp(t), 'never the private link');
  // No email on file and not signed in: she is asked for one.
  const { t: t2 } = await setUp(SRC.sport9, { name: 'Summerland Ask Fixture' });
  r = await post({ message: 'How do I see what the public sees on our page?', path: `/fr/owner/${t2}/setup`, page: 'setup', screen: '#story', ask: true, visit: visit + 1, lang: 'fr', company_website: '' });
  assert.equal(r.status, 400); assert.equal(r.j.error, 'Please add your email so we can reply.');
  r = await post({ message: 'How do I see what the public sees on our page?', email: 'gord@example.com', path: `/fr/owner/${t2}/setup`, page: 'setup', screen: '#story', ask: true, visit: visit + 1, lang: 'fr', company_website: '' });
  assert.equal(r.status, 200);
  await app.sendOwnerAsksNow();
  const g = sent[sent.length - 1];
  assert.match(g._subject, /Summerland Ask Fixture: Help wasn’t sure \(1 question\)/);
  assert.match(g.Questions, /^“How do I see what the public sees on our page\?” \(on setup #story\)$/);
  assert.equal(g.Language, 'French (they used the help bot in French)');
  // Message us still works as before.
  r = await post({ message: 'Please change our phone number', email: 'gord@example.com', path: `/owner/${t2}`, page: 'edit', lang: 'en', company_website: '' });
  assert.equal(r.status, 200);
});

test('3. Small-course chips (Dayton approved): a walk-on or 9-hole course gets walk-ons only, pull carts, cash and the honour box; no chip contradicts her answers', async () => {
  const strings = require('../owner-setup-text.js');
  assert.deepEqual(strings.en.indoor.quick.good_to_know_kinds.golfsmall.slice(0, 4), ['Walk-ons only: no tee times', 'Pull carts only', 'Cash only', 'Honour box when the clubhouse is closed']);
  assert.equal(strings.fr.indoor.quick.good_to_know_kinds.golfsmall.length, strings.en.indoor.quick.good_to_know_kinds.golfsmall.length);
  const big = strings.en.indoor.quick.good_to_know_kinds.golf;
  // Marg: walk-ons welcome, a nine-hole course.
  const { t } = await setUp(SRC.sport8, { description: 'A village nine-hole course with sand greens.' });
  const chipsOf = (s0) => (s0.screen().match(/data-quick="[^"]*"/g) || []).map((x) => x.slice(12, -1).replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  let sim = await openSetup(base, t, { hash: 'bring' });
  let txt = chipsOf(sim).join(' | ');
  for (const c of ['Walk-ons only: no tee times', 'Pull carts only', 'Cash only', 'Honour box when the clubhouse is closed']) assert.ok(txt.includes(c), `${c} in ${txt.slice(0, 600)}`);
  for (const c of ['Tee times recommended', 'Pro shop', 'Dress code: collared shirts']) assert.ok(!txt.includes(c), `${c} is not offered`);
  assert.ok(Math.abs(chipsOf(sim).length - (big.length - 1)) <= 1, `about the same number of chips (${chipsOf(sim).length})`);
  assert.match(sim.text(), /Walk-ons only: no tee times\. Pull carts only/, 'a small course’s example');
  sim = await openSetup(base, t, { hash: 'bring', lang: 'fr' });
  assert.ok(chipsOf(sim).some((c) => /^Sans réservation seulement/.test(c)), 'French chips');
  // A big course that books tee times keeps the big-course chips; one with walk-ons never gets "Tee times recommended".
  const { t: tBig } = await setUp(SRC.sport9, { description: 'An 18-hole semi-private course.' });
  txt = chipsOf(await openSetup(base, tBig, { hash: 'bring' })).join(' | ');
  assert.ok(txt.includes('Tee times recommended')); assert.ok(!txt.includes('Honour box when the clubhouse is closed'));
  const { t: tWalk } = await setUp({ ...SRC.sport9, book: 'no' }, { description: 'An 18-hole public course.' });
  txt = chipsOf(await openSetup(base, tWalk, { hash: 'bring' })).join(' | ');
  assert.ok(!txt.includes('Tee times recommended')); assert.ok(txt.includes('Walk-ons only: no tee times'));
  // A 9-hole course that books tee times: the small chips, but "Tee times recommended" in place of walk-ons only.
  const { t: tNineBook } = await setUp({ ...SRC.sport8, book: 'busy' }, { description: 'A nine-hole executive course.' });
  txt = chipsOf(await openSetup(base, tNineBook, { hash: 'bring' })).join(' | ');
  assert.ok(txt.includes('Pull carts only')); assert.ok(!txt.includes('Walk-ons only')); assert.ok(txt.includes('Tee times recommended'));
});

test('4. Setup words: dog chips in the kind’s words, 9 holes is 2 to 3 hours, the price line on twilight, the rates page never a booking link, research’s season words', async () => {
  const { v, t } = await setUp(SRC.sport8, { description: 'A nine-hole course by the creek.' });
  const cfg = setupCfg(await getText(`/owner/${t}/setup`)), cfgFr = setupCfg(await getText(`/fr/owner/${t}/setup`));
  assert.deepEqual(cfg.sportDogs.chips, ['On the course, on a leash', 'Clubhouse patio only', 'Not on the course']);
  assert.match(cfg.sportDogs.ex, /on the course on a leash/);
  assert.deepEqual(cfgFr.sportDogs.chips, ['Sur le parcours, en laisse', 'Terrasse du club-house seulement', 'Pas sur le parcours']);
  assert.equal(cfg.golfSmall, true); assert.equal(cfg.kindLength.golf, '2-3h');
  const sim = await openSetup(base, t, { hash: 'offer:dogs' }).catch(() => null);
  if (sim && /leash|Where are dogs/i.test(sim.text())) { assert.ok(sim.text().includes('On the course, on a leash')); assert.ok(!/Patio only|Water bowls/.test(sim.text())); }
  // A rink's dog chips are neutral.
  const rink = await setUp({ type: 'sport', kinds: ['rink'], book: 'no', price: 5 }, { type: 'sport' });
  assert.deepEqual(setupCfg(await getText(`/owner/${rink.t}/setup`)).sportDogs.chips, ['On a leash', 'Outside only', 'Not inside']);
  // 18 holes keeps the usual length.
  const big = await setUp(SRC.sport9, { description: 'An 18-hole semi-private course.' });
  const bigCfg = setupCfg(await getText(`/owner/${big.t}/setup`));
  assert.notEqual(bigCfg.golfSmall, true); assert.notEqual((bigCfg.kindLength || {}).golf, '2-3h');
  // The price screen's line.
  const sk = require('../sport-kinds.js');
  assert.match(sk.K.golf.en.price.lead, /Type your regular adult rate/); assert.match(sk.K.golf.en.price.lead, /Twilight and other rates go in Your prices\./);
  assert.match(sk.K.golf.fr.price.lead, /Les tarifs du crépuscule et les autres vont dans Vos tarifs\./);
  // "My prices are on my website": a tee-time booking link never fills the rates box.
  db.prepare('INSERT OR REPLACE INTO venue_links (venue_id, booking_url) VALUES (?, ?)').run(big.v.id, 'https://www.chronogolf.ca/club/fixture-golf');
  const web = await openSetup(base, big.t, { hash: 'menu' });
  await web.click('go:menu:web');
  const box = web.doc.getElementById('suUrl');
  assert.ok(box, web.text().slice(0, 300));
  assert.doesNotMatch(String(box.value || ''), /chronogolf/);
  assert.match(web.text(), /not your booking page/);
  // Research's "mid March through the end of October" pre-picks the season.
  db.prepare('INSERT OR REPLACE INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Season', text: 'Closed for the season. The reopening date has not been announced yet.' }, { label: 'Winter', text: 'Golf season runs mid March through the end of October; the bar follows a seasonal schedule.' }] }));
  db.prepare('UPDATE venue_links SET open_months = NULL WHERE venue_id = ?').run(v.id);
  const open = setupCfg(await getText(`/owner/${t}/setup`)).researchOpen;
  if (open) assert.deepEqual(open, { from: '03-15', to: '10-31' });
  else assert.ok(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').includes("early|mid|middle of|late|end of|start of|beginning of"), 'the season words are read');
});

test('5. Owner home: a golf course is asked for the clubhouse, not a front door; no Happy hour tile after No; no website code without a website', async () => {
  const { v, t } = await setUp(SRC.sport8, { website: '' });
  db.prepare('INSERT OR IGNORE INTO venue_not_offered (venue_id, item) VALUES (?, ?)').run(v.id, 'happy_hour');
  db.prepare('INSERT OR IGNORE INTO venue_not_offered (venue_id, item) VALUES (?, ?)').run(v.id, 'website');
  const home = await getText(`/owner/${t}`), homeFr = await getText(`/fr/owner/${t}`);
  assert.match(home, /Help people find the clubhouse/); assert.doesNotMatch(home, /photo of the main entrance/);
  assert.match(homeFr, /Aidez les gens à trouver le club-house/);
  assert.doesNotMatch(home, /data-pick="happy"/);
  assert.doesNotMatch(home, /Code for your website/); assert.doesNotMatch(homeFr, /Code pour votre site Web/);
  // A course with a website and a happy hour keeps both.
  const big = await setUp(SRC.sport9);
  const h2 = await getText(`/owner/${big.t}`);
  assert.match(h2, /Code for your website/);
});
