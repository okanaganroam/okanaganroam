// Indoor test 14 (2026-11-19; Helen, executive director of a Kelowna history museum: by donation, suggested $5; Tue–Sat
// with Thursdays to 8 PM in summer; closed Christmas to New Year's; research had "Adult $10 …", "Closed Tuesdays and
// Wednesdays" and an exhibit that "runs to November 9, 2026"). Each fix from her report, checked with the real setup page
// script and real taps (tests/setup-sim.js), Build My Trip, search, Help and the public pages. Her Help questions are in
// the Help matrix (tests/indoor-help-matrix.test.js); the every-kind sweep of stale research lines is
// tests/indoor-stale-research.test.js.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test14-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const T = require('../owner-setup-text.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const TUE_SAT = { mon: null, tue: [['10:00', '17:00']], wed: [['10:00', '17:00']], thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: null };
const RESEARCH_HOURS = JSON.stringify({ mon: [['10:00', '17:00']], tue: null, wed: null, thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: [['11:00', '16:00']] });
const STALE_GTK = 'Feature exhibit Making Waves: Kelowna Regatta runs to November 9, 2026. Closed Tuesdays and Wednesdays.';
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Heritage T14 Fixture ${++n}`, slug: `indoor-t14-${n}`, region: 'kelowna', type: 'indoor', cuisine: 'Museum', latitude: 49.8874 + n / 3000, longitude: -119.495,
  address: `${400 + n} Queensway Ave, Kelowna, BC`, phone: '250-555-0114', website: 'https://example.com', hours: RESEARCH_HOURS,
  description: 'The Heritage Museum is a downtown museum covering the natural and human history of the Okanagan. It also houses the public archives.', kid_friendly: 1, arts_culture: 1, ...o });
const setBox = (id, rows, checked = '2026-10-31') => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify({ rows, source_url: 'https://museum.example', checked_at: checked }));
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.87.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), fill: (h, q) => ctx.window.__ohbFill(h, q), topic: (id) => topics.find((x) => x.id === id) };
};

// Helen's museum as research left it: Adult $10 in Prices, the stale Good to know, then her answers.
const helen = async (answers = true) => {
  const v = mk();
  setBox(v.id, [{ label: 'Prices', text: 'Adult $10, student/senior $8, youth (5-17) $7, family $25; ages 5 and under free. Pay what you wish every second Sunday.' },
    { label: 'Known for', text: "Kelowna's natural and human history: syilx/Okanagan displays and a Chinatown storefront." },
    { label: 'Good to know', text: STALE_GTK }]);
  const t = tokenFor(v.id);
  if (answers) {
    await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 'donation' }));
    await ok(change(t, { indoor_info: { suggested: 5 } }));
    await ok(change(t, { hours: TUE_SAT }));
    approveAll(v.id);
  }
  return { v, t };
};

test('1. the suggested donation box starts empty when research had only an adult price (never $10), and from research\'s own suggested amount; the lead says "By donation (suggested $5)" as she types', async () => {
  const { v, t } = await helen(false);
  const g = await openSetup(base, t, { hash: 'price' });
  await g.click('[data-ifree="donation"]');
  assert.equal(g.doc.getElementById('suTsugg').value, '');
  assert.equal(g.doc.getElementById('suTpriceLead').textContent, T.en.indoor.tpriceLeadDonation);
  await g.type('suTsugg', '5');
  assert.equal(g.doc.getElementById('suTpriceLead').textContent, 'Your page will say “By donation (suggested $5)”.');
  await g.type('suTsugg', '');
  assert.equal(g.doc.getElementById('suTpriceLead').textContent, T.en.indoor.tpriceLeadDonation);
  // A price typed in the adult box before By donation is not carried over either.
  const g2 = await openSetup(base, t, { hash: 'price' });
  await g2.type('suTprice', '12');
  await g2.click('[data-ifree="donation"]');
  assert.equal(g2.doc.getElementById('suTsugg').value, '');
  // Research's own "suggested $5" donation line does start the box.
  const m = mk({ free_entry: 1 });
  setBox(m.id, [{ label: 'Prices', text: 'Admission by donation: suggested $5 per adult.' }]);
  const g3 = await openSetup(base, tokenFor(m.id), { hash: 'price' });
  assert.equal(g3.doc.getElementById('suTsugg').value, '5');
  assert.match(g3.doc.getElementById('suTpriceLead').textContent, /By donation \(suggested \$5\)/);
  // French.
  const f = await openSetup(base, t, { hash: 'price', lang: 'fr' });
  await f.click('[data-ifree="donation"]');
  await f.type('suTsugg', '5');
  assert.match(f.doc.getElementById('suTpriceLead').textContent, /Contribution volontaire \(suggérée\s*:\s*5\s\$\)/);
  assert.ok(v);
});

test('2. her saved hours hide research\'s "Closed Tuesdays and Wednesdays" and the passed exhibit date from the page (EN; the French box drops the row), research data untouched; the next setup screen asks "We also had … Still right?"; Keep is remembered and shows it again, Remove keeps it off', async () => {
  const { v, t } = await helen();
  const en = plain(pageHtml(v));
  assert.doesNotMatch(en, /Closed Tuesdays and Wednesdays/);
  assert.doesNotMatch(en, /runs to November 9, 2026/);
  assert.doesNotMatch(en, /Adult \$10/);
  assert.match(en, /By donation \(suggested \$5\)/);
  assert.match(en, /syilx\/Okanagan displays/);
  assert.doesNotMatch(plain(pageHtml(v, 'fr')), /Tuesdays|mardis et mercredis/);
  // Research's row is as it was.
  assert.match(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info, /Closed Tuesdays and Wednesdays/);
  // The setup: the saved screen after hours asks about both.
  const g = await openSetup(base, t, { hash: 'hours' });
  assert.equal(g.cfg.stale.length, 2, JSON.stringify(g.cfg.stale));
  await g.click('[data-act="go:saved:hours"]').catch(() => {});
  const s = await openSetup(base, t, { hash: 'more' });
  assert.ok(s.has('#suStale'), s.text().slice(0, 300));
  assert.match(s.text(), /We also had: “Closed Tuesdays and Wednesdays\.” Still right\?/);
  assert.match(s.text(), /We also had: “Feature exhibit Making Waves: Kelowna Regatta runs to November 9, 2026\.” Still right\?/);
  const keyOf = (re) => s.cfg.stale.find((x) => re.test(x.text)).key;
  await s.click(`[data-stale="keep:${keyOf(/Regatta/)}"]`);
  await s.click(`[data-stale="gone:${keyOf(/Closed Tuesdays/)}"]`);
  assert.ok(!s.has('#suStale'));
  // Keep: back on the page and remembered; Remove: off for good.
  const en2 = plain(pageHtml(v));
  assert.match(en2, /runs to November 9, 2026/);
  assert.doesNotMatch(en2, /Closed Tuesdays/);
  const s2 = await openSetup(base, t, { hash: 'more' });
  assert.ok(!s2.has('#suStale'));
  assert.equal(s2.cfg.stale.length, 0);
  // The Good to know screen pre-fills the kept line and never the removed one.
  const b = await openSetup(base, t, { hash: 'bring' });
  assert.match(b.doc.getElementById('suBring').value, /Making Waves/);
  assert.doesNotMatch(b.doc.getElementById('suBring').value, /Closed Tuesdays/);
  assert.ok(!b.has('#suBringClash'));
});

test('3. the finish card at 100% says "Add more to help visitors (optional)", never "to raise it"', async () => {
  assert.equal(T.en.pctMoreOpt, 'Add more to help visitors (optional).');
  const src = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(src, /sc\.soon >= 100 && T\.pctMoreOpt \? T\.pctMoreOpt : T\.pctRaise/);
  // On screen: a score about to reach 100%.
  const { t } = await helen();
  const real = global.fetch;
  global.fetch = (u, o) => real(u, o).then(async (r) => {
    if (!/\/setup$/.test(String(u))) return r;
    const html = (await r.text()).replace(/"score":\{"pct":\d+,"soon":\d+/, '"score":{"pct":90,"soon":100');
    return new Response(html, { status: r.status, headers: r.headers });
  });
  try {
    for (const step of ['basics', 'hours', 'indoor', 'price', 'booking', 'offer', 'photos']) await postJson(`/owner/${t}/setup/progress`, { step, status: 'live' });
    const g = await openSetup(base, t);
    if (!/About 100%/.test(g.text())) await g.click(g.acts().includes('go:ess') ? 'go:ess' : g.acts().includes('go:finish') ? 'go:finish' : 'resume');
    assert.match(g.text(), /About 100% complete/);
    assert.match(g.text(), /Add more to help visitors \(optional\)\./);
    assert.doesNotMatch(g.text(), /to raise it/);
  } finally { global.fetch = real; }
});

test('4. "free family saturday kelowna" with nothing on What\'s On that Saturday lists the places that say Saturday (her museum) and the next Saturdays\' events, with a note (no redirect to an empty What\'s On)', async () => {
  const v = mk({ name: 'Family Saturday Museum T14', description: 'A history museum. Free family Saturdays with crafts on the first Saturday of every month.' });
  const plan = app.smartSearchPlan('free family saturday kelowna', undefined, NOW);
  assert.ok(plan && !plan.url && plan.list, JSON.stringify(plan));
  assert.match(plan.heading, /^Nothing on What’s On for Saturday, Nov 21 in Kelowna\./);
  assert.ok(plan.list().some((x) => x.row.id === v.id));
  const html = await fetch(`${base}/search?q=${encodeURIComponent('free family saturday kelowna')}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' }, redirect: 'manual' });
  assert.equal(html.status, 200);
  const text = plain(await html.text());
  assert.match(text, /Family Saturday Museum T14/);
  // A weekday without a weekday word still goes to What's On.
  const p2 = app.smartSearchPlan('family events this weekend kelowna', undefined, NOW);
  assert.ok(!p2 || p2.url || p2.key !== 'events_weekday');
});

test('5. Build My Trip: a by-donation museum is a cheap stop ("cheap rainy day in Kelowna on Saturday"), and the trip total says "By donation (suggested $5)", not $0', async () => {
  const { v } = await helen();
  for (let i = 0; i < 4; i++) mk({ name: `Cheap Arcade T14 ${i}`, cuisine: 'Arcade', price: 1, description: 'An arcade.', hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '22:00']]]))) });
  const items = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
  const p = app.runTripPlan({ text: 'cheap rainy day in Kelowna on Saturday' }, NOW);
  const me = items(p).find((x) => x.venue.id === v.id);
  assert.ok(me, items(p).map((x) => x.venue.name).join(' | '));
  assert.equal(me.venue.byDonation, 5);
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(page, /data-donation="/);
  assert.match(page, /gifts && !cents \? giftText/);
});

test('6. Help: doors open is an event for her museum; late Thursdays in summer are summer hours; her own pattern is echoed; locally owned names Who can come?', async () => {
  const { t } = await helen();
  const b = helpBot(await (await fetch(`${base}/owner/${t}/setup`)).text());
  assert.equal(b.best('doors open half an hour before the lecture starts').id, 'indoor-doors-open');
  assert.equal(b.best('we are open late thursdays in summer, till 8').id, 'indoor-summer-late');
  const fd = b.best('free family saturdays first saturday of the month');
  assert.equal(fd.id, 'indoor-family-day');
  const a = plain(b.fill(b.topic('indoor-family-day').a, 'free family saturdays first saturday of the month'));
  assert.match(a, /first Saturday of the month/);
  assert.doesNotMatch(a, /\[\[pat|every Sunday/);
  assert.match(a, /Good to know .*Add an event/);
  assert.match(plain(b.fill(b.topic('indoor-family-day').a, 'family day every saturday')), /every Saturday/);
  assert.match(plain(b.fill(b.topic('indoor-family-day').aFr, 'samedi en famille le premier samedi du mois')), /premier samedi du mois/);
  assert.match(plain(b.topic('indoor-local-owned').a), /Who can come\?/);
});

test('7. polish: the Your prices screen says "Entry is by donation"; the English intro shows her own story whole; the year list shows the summer hours once; Add an event names a museum\'s events; the label above the name is "Museum"', async () => {
  const { v, t } = await helen();
  const g = await openSetup(base, t, { hash: 'menu' });
  assert.match(g.text(), /Entry is by donation, so you can skip this/);
  // Her story (kept research's two sentences and added three), approved: the intro is all of it.
  const story = 'The Heritage Museum is a downtown museum covering the natural and human history of the Okanagan. It also houses the public archives. We run rotating exhibitions through the year, school programs and a monthly lecture series. Free family Saturdays with crafts on the first Saturday of every month. Admission is by donation, and members get early previews of every new exhibition all year long.';
  await ok(change(t, { description: story }));
  approveAll(v.id);
  const html = pageHtml(v);
  const intro = (/<p class="gb-intro">([\s\S]*?)<\/p>/.exec(html) || [])[1] || '';
  assert.match(intro, /Free family Saturdays with crafts/);
  assert.match(intro, /members get early previews/);
  // Summer Thursdays to 8: once, in Hours through the year.
  await ok(change(t, { hours_seasons: [{ from: '06-01', to: '08-31', label: '', hours: { ...TUE_SAT, thu: [['10:00', '20:00']] } }] }));
  approveAll(v.id);
  const h2 = pageHtml(v);
  assert.match(plain(h2), /Hours through the year/);
  assert.doesNotMatch(plain(h2), /Hours \(Jun 1 – Aug 31\)/);
  assert.match(h2, /\.venue-hours-year-list li \{ max-width: 620px/);
  // The eyebrow says the kind.
  assert.match(h2, /<p class="gb-eyebrow">🌧️ Museum · /);
  assert.doesNotMatch(h2, /Indoor &amp; rainy day · <a/);
  // Add an event in a museum's words.
  const edit = await (await fetch(`${base}/owner/${t}`)).text();
  assert.match(edit, /Talks, exhibitions, family days on What&rsquo;s On/);
  assert.doesNotMatch(edit, /Live music, tastings, markets, classes or specials on What/);
});
