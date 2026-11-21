// Sport test 16 fixes (2026-11-21; Nadia, part-time assistant pro at Gallagher's Canyon Golf & Country Club, the 18-hole
// Canyon Course, on her iPhone; drafts/fresh-eyes-sport16-2026-11-21/REPORT.md):
//   1. The card price: her typed Price (her usual adult green fee) is the headline. A rate line lowers it only when it is a
//      plain adult rate for the same round: twilight, after 5 PM, standby, replay, junior or senior words in its name OR
//      its description never do, and on an 18-hole course a 9-hole line never does. (Every kind: sport-price-matrix.)
//   2. The hours revisit on a place with a season and no other hours: "No change, keep Apr 1 – Oct 31" first; "Yes, all
//      year" asks before it removes the season.
//   3. A happy hour whose months are all in the closed season: the Happy hour screen says it won't show; no Happy Hour
//      "More in" link or search match while it can't be seen; the month chips start empty.
//   4. Help: her 30 questions on the screens she asked them land well (or on choices with the right one), none harmful.
//   5. Unsaved changes after the essentials; FR closure note and research rows; search finds her for a holiday party and
//      for "canyon bar and grill"; the planner doesn't read "venue" as a word.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test16-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q } = require('./help-sport16-questions.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); srv.keepAliveTimeout = 120000; await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['08:00', '19:00']]]));
const ip = () => `10.161.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, `status ${r.status}`); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const sp = (x) => String(x).replace(/[\s  ]+/g, ' ').trim();
const plain = (h) => sp(String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’'));
const page = (v, lang = 'en', now = NOV, guides = []) => plain(app.renderVenuePage(app.getVenue(v.id), [], [], guides, { lang, now }));
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'the page has the Help widget');
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const cfg = JSON.parse(m[1]);
  return { best: (q, s) => ctx.window.__ohbBest(q, s), cfg, answer: (id, fr) => ((cfg.topics.find((x) => x.id === id) || {})[fr ? 'aFr' : 'a']) || '' };
};
function mk(o = {}) {
  n++;
  return app.createVenue({ name: o.name || `Sport Sixteen ${n}`, slug: o.slug || `sport-sixteen-${n}`, region: o.region || 'kelowna', type: o.type || 'golf', latitude: o.lat || 49.84 + n / 4000, longitude: o.lng || -119.38,
    address: o.address || `${n} Gallagher Dr`, website: o.website || `https://sixteen-${n}.example.com/`, hours: JSON.stringify(WK), rating: 4.6, reviews: 400, description: o.description || 'A fixture for sport test 16.', description_fr: 'Un lieu de test.' });
}
async function setUp(kinds, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (o.season) await ok(change(t, { hours: WK, open_months: o.season })); else await ok(change(t, { hours: WK }));
  await ok(change(t, { indoor_info: { kinds, length: o.length || 'half', book: o.book || 'busy', year: o.season ? 'seasonal' : 'all' }, indoor_price: o.price || 200 }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t };
}
const publishPrices = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: 'Green fees', note: '', items: items.map(([name, price, description = '']) => ({ name, description, price, dietary: [], check: false })) }] }));
// The essentials done (the Happy hour step is in More about your place).
const toHappyType = async (g) => { await g.click('edit:happy'); if (g.acts().includes('go:happy:yes')) await g.click('go:happy:yes'); if (g.acts().includes('go:happy:type')) await g.click('go:happy:type'); };
async function essentialsDone(v, t) {
  const g = await openSetup(base, t);
  const done = Object.fromEntries((g.cfg.part1 || []).map((k) => [k, 'live']));
  db.prepare('INSERT INTO owner_setup_progress (venue_id, state) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET state = excluded.state').run(v.id, JSON.stringify({ done }));
}
const openMonths = (id) => { const r = db.prepare('SELECT open_months FROM venue_links WHERE venue_id = ?').get(id); return r ? r.open_months : null; };

test('1. her $200 stays the card price: a 9-hole "After 5 pm or on standby" line, standby, twilight or replay in the details never lower it', async () => {
  const { v } = await setUp(['golf', 'range'], { season: '04-01:10-31', price: 200 });
  publishPrices(v.id, [['18 holes, peak', '200', 'May to September, power cart and range included'], ['18 holes, twilight', '115', 'After 2 PM'], ['18 holes', '85', 'Double twilight, after 4 pm'],
    ['9 holes', '65', 'After 5 pm or on standby'], ['Junior', '70', '17 and under'], ['18 holes', '75', 'Standby only'], ['Range basket', '14', 'Large $22'], ['Rental clubs', '75', 'TaylorMade']]);
  app.writeIndoorVisitRows(v.id); app.indoorCardPrice(v.id);
  assert.equal(app.cardPriceFor(v.id), 'From $200');
  assert.match(page(v), /Green fees from \$200\./);
  assert.match(page(v, 'fr'), /À partir de 200 \$|200 \$/);
  assert.doesNotMatch(page(v), /from \$65/);
  // The rule, line by line (name and details).
  const c = (name, desc, eighteen = true) => app.sportPriceLineCounts('golf', name, desc, 'Green fees', { eighteen });
  assert.equal(c('9 holes', 'After 5 pm or on standby'), false);
  assert.equal(c('9 holes', ''), false, 'a 9-hole line never lowers an 18-hole course');
  assert.equal(c('9 holes', '', false), true, 'on a 9-hole course it is the round');
  assert.equal(c('Standby', ''), false); assert.equal(c('18 holes', 'standby'), false); assert.equal(c('18 holes', 'after 10 pm'), false); assert.equal(c('18 holes', 'après 17 h'), false);
  assert.equal(c('18 holes', 'Twilight rate'), false); assert.equal(c('18 holes', 'Replay same day'), false); assert.equal(c('18 holes', 'Seniors 65+'), false);
  assert.equal(c('18 holes, spring', 'April and October'), true, 'a plain adult round in another month still may');
  // A 9-hole course: its 9-hole line is its plain round.
  const nine = await setUp(['golf'], { season: '04-01:10-31', price: 47, name: 'Nine Hole Sixteen' });
  publishPrices(nine.v.id, [['9 holes walking', '42', ''], ['9 holes', '30', 'After 4 pm']]);
  app.indoorCardPrice(nine.v.id);
  assert.equal(app.cardPriceFor(nine.v.id), 'From $42');
});

test('2. hours revisit with a season and no other hours: "No change, keep Apr 1 – Oct 31" first; "Yes, all year" asks first', async () => {
  const { v, t } = await setUp(['golf'], { season: '04-01:10-31' });
  const g = await openSetup(base, t, { hash: 'hours' });
  await g.click('hoursOk');
  const acts = g.acts();
  assert.equal(acts.find((x) => /^year/.test(x)), 'yearKeepSea', acts.join(' | '));
  assert.match(g.text(), /No change, keep Apr 1 – Oct 31/);
  // The dark main button is "No change"; "Yes, all year" is a light one now.
  assert.match(g.screen(), /<button[^>]*su-big(?![^>]*su-light)[^>]*data-act="yearKeepSea"|data-act="yearKeepSea"/);
  await g.click('yearAll');
  assert.ok(g.screen().includes('id="suSeaDrop"'), 'it asks before removing the season');
  assert.match(g.text(), /Open all year\?[\s\S]*open April 1 to October 31|Open all year\?[\s\S]*Apr 1/);
  await g.click('yearDropKeep');
  await g.settle();
  assert.equal(openMonths(v.id), '04-01:10-31', 'No keeps the season');
  // "No change" saves the hours and keeps the season too.
  const g2 = await openSetup(base, t, { hash: 'hours' });
  await g2.click('hoursOk'); await g2.click('yearKeepSea'); await g2.settle();
  assert.equal(openMonths(v.id), '04-01:10-31');
  // Only her explicit "Yes, open all year" clears it.
  const g3 = await openSetup(base, t, { hash: 'hours' });
  await g3.click('hoursOk'); await g3.click('yearAll'); await g3.click('yearSeaDropYes'); await g3.settle();
  assert.ok(!openMonths(v.id), `cleared only when she says so (${openMonths(v.id)})`);
  // French too.
  const { t: tf } = await setUp(['golf'], { season: '04-01:10-31' });
  const gf = await openSetup(base, tf, { hash: 'hours', lang: 'fr' });
  await gf.click('hoursOk');
  assert.match(gf.text(), /Aucun changement, garder du 1er avr\.? au 31 oct\.?|Aucun changement, garder du/);
});

test('3. a happy hour only in the closed months says it won\'t show; no Happy Hour link or search match while it can\'t be seen; chips start empty', async () => {
  const { v, t } = await setUp(['golf', 'range'], { season: '04-01:10-31' });
  await essentialsDone(v, t);
  // Her winter grill deal, typed on the Happy hour screen: the month chips start empty (not lit with her Apr–Oct season).
  const g = await openSetup(base, t);
  await toHappyType(g);
  await g.click('hhDays:0,wk');
  await g.click('[data-sea="happy:some"]');
  assert.ok(g.screen().includes('data-smon="happy:'), 'the month chips');
  assert.deepEqual([...g.screen().matchAll(/aria-pressed="true"[^>]*data-smon="happy:(\d+)"|data-smon="happy:(\d+)"[^>]*aria-pressed="true"/g)].map((m) => m[1] || m[2]), [], 'no months picked for her');
  for (const m of [11, 12, 1, 2, 3]) await g.click(`[data-smon="happy:${m}"]`);
  const w = g.doc.getElementById('suWarnhappy0');
  assert.ok(w && !w.hidden, 'the heads-up shows as soon as the months are all closed ones');
  assert.match(sp(w.textContent), /closed for the season outside Apr 1 to Oct 31[\s\S]*visitors won’t see it[\s\S]*Part of the place with its own times\?/);
  await g.type('hw0', 'Half-price apps');
  await g.click('happySave'); await g.settle();
  // Saved: it says so again when she comes back, EN and FR.
  for (const lang of ['en', 'fr']) {
    const g2 = await openSetup(base, t, lang === 'fr' ? { lang } : {});
    await toHappyType(g2);
    const w2 = g2.doc.getElementById('suWarnhappy0');
    assert.ok(w2 && !w2.hidden, `${lang}: the heads-up shows for the saved one`);
    assert.match(sp(w2.textContent), lang === 'fr' ? /fermé pour la saison[\s\S]*ne le verront pas[\s\S]*Une partie de l’endroit a ses propres heures/ : /visitors won’t see it/);
  }
  // A happy hour in the open months: nothing to say.
  const { v: v3, t: t3 } = await setUp(['golf'], { season: '04-01:10-31' });
  await essentialsDone(v3, t3);
  const g3 = await openSetup(base, t3);
  await toHappyType(g3);
  await g3.click('hhDays:0,wk'); await g3.click('[data-sea="happy:some"]');
  for (const m of [5, 6, 7]) await g3.click(`[data-smon="happy:${m}"]`);
  assert.ok(g3.doc.getElementById('suWarnhappy0').hidden, 'nothing to say');
  db.prepare('UPDATE venues SET happy_hour = 1, great_groups = 1, happy_hour_times = ? WHERE id = ?').run(JSON.stringify({ wed: [['17:00', '18:00']], _season: { from: '11-01', to: '03-31' } }), v.id);
  // While it can't be seen (closed for the season, or outside its months): no "More in Kelowna: Happy Hour", no search match.
  db.prepare('UPDATE venues SET happy_hour_times = ? WHERE id = ?').run(JSON.stringify({ wed: [['17:00', '18:00']], _season: { from: '11-01', to: '03-31' } }), v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const JAN = new Date('2027-01-13T17:30:00-08:00');
  assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), JAN), true, 'closed for the season in January');
  assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), new Date('2027-06-09T17:30:00-07:00')), true, 'outside its own months in June');
  const guides = [{ region: 'kelowna', badge: 'happy_hour' }, { region: 'kelowna', badge: 'great_groups' }];
  const pg = page(v, 'en', JAN, guides);
  assert.doesNotMatch(pg, /More in Kelowna:[^.]*Happy Hour/);
  assert.match(pg, /More in Kelowna:[^.]*Great for Groups/);
  const sv = app.discoverySearchVenuesForTest ? app.discoverySearchVenuesForTest() : null;
  if (sv) assert.ok(!sv.find((x) => x.id === v.id).features.happy_hour);
  const html = await getText(`/search?q=${encodeURIComponent('golf happy hour kelowna')}`);
  assert.ok(!html.includes(`>${app.getVenue(v.id).name}<`), 'not found for a deal nobody can see today');
  // Help never promises it shows while closed.
  const S = helpBot(await getText(`/owner/${t}/setup`));
  assert.match(S.answer('hh-some-months'), /never in months your page says <strong>Closed for the season<\/strong>/);
  assert.match(S.answer('hh-closed-season'), /only while you’re open/);
});

test('4. Help: her 30 questions on the screens she asked them land well (or on choices with the right one), none harmful', async () => {
  const { v, t } = await setUp(SRC.sport16.kinds, { season: SRC.sport16.season, price: SRC.sport16.price, name: 'Canyon Sixteen Golf Club', address: '4320 Canyon Sixteen Dr' });
  // Her club's other course has its own listing at the same address.
  mk({ name: 'Canyon Sixteen Golf Club Pinnacle Course', slug: 'canyon-sixteen-pinnacle', address: '4320 Canyon Sixteen Dr' });
  if (app.clearVenueCaches) app.clearVenueCaches();
  const bots = {};
  for (const [page0, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[page0] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const bad = []; let choices = 0;
  for (const [, page0, lang, q, okIds, harm, screen] of Q) {
    const r = bots[page0][lang].best(q.replace(/pinnacle/gi, 'pinnacle'), screen);
    if (r.id && harm.includes(r.id)) { bad.push(`HARM "${q}" -> ${r.id}`); continue; }
    if (r.id ? okIds.includes(r.id) : okIds.includes('UNSURE')) continue;
    if (!r.id && r.hits.slice(0, 3).some((x) => okIds.includes(x))) { choices++; continue; }
    bad.push(`"${q}" -> ${r.id || 'not sure'} [${r.hits.slice(0, 3)}] (wants ${okIds.join(' / ')})`);
  }
  assert.deepEqual(bad, []);
  assert.ok(choices <= 6, `choices ${choices}`);
  const S = bots.setup.en, E = bots.edit.en, F = bots.setup.fr;
  // The screen's own topic: the story box, the group size, this course's own price.
  assert.equal(S.best(Q[13][3], 'story').id, 'story-words');
  assert.match(S.answer('story-words'), /^<p>Yes: change the words right here, in the story box on this screen/);
  assert.equal(S.best(Q[17][3], 'groups').id, 'sport-group-size');
  assert.match(S.answer('sport-group-size'), /like <strong>20\+<\/strong> for groups of 24 to 150\? Tap it/);
  assert.equal(S.best(Q[7][3], 'price').id, 'sport-two-courses');
  assert.match(S.answer('sport-two-courses'), /put only this course’s rates[\s\S]*the other course’s prices go on its own page/);
  // No button that's gone; no Good to know for a part where the parts line exists.
  for (const b of [S, E, F]) for (const tp of b.cfg.topics) {
    assert.doesNotMatch(`${tp.a} ${tp.aFr}`, /Different hours in summer or winter\?|Des heures différentes l’été ou l’hiver\?/, tp.id);
  }
  assert.match(S.answer('sport-season'), /Save, and add different hours for part of your season/);
  assert.doesNotMatch(S.answer('sport-season'), /Good to know/);
  assert.match(S.answer('sport-shoulder-hours'), /Save, and add different hours for part of your season/);
  // A management company's course: cautious, never "Yes" first.
  assert.doesNotMatch(S.answer('indoor-local-owned'), /^<p>Yes/);
  assert.match(S.answer('indoor-local-owned'), /management company run from a head office\? Then it doesn’t count: leave it unticked/);
  // The card rule, said as it is (#13, #28).
  assert.match(E.answer('sport-card-price'), /Green fees from \$200/);
  assert.match(E.answer('sport-card-price'), /standby[\s\S]*On an 18-hole course, a 9-hole rate never lowers it either/);
  assert.match(S.answer('sport-rate-lines'), /Write <em>from \$85<\/em> or <em>varies<\/em>[\s\S]*not your lowest/);
  assert.doesNotMatch(`${S.answer('sport-rate-lines')} ${S.answer('sport-no-rate')}`, /lowest regular adult price/);
  // The parts line: shows as typed all year (no "No:" opener).
  assert.match(E.answer('sport-part-season'), /^<p>That line never changes your season or hours/);
  assert.match(E.answer('sport-part-season'), /just as you typed it, all year[\s\S]*rather than “in winter”/);
  // A second person: the same link, their own login. The happy hour that isn't there: only while open.
  assert.equal(E.best(Q[23][3]).id, 'staff');
  assert.match(E.answer('staff'), /Send them your private edit link[\s\S]*Create a login/);
  assert.equal(E.best(Q[29][3]).id, 'hh-closed-season');
  assert.equal(E.best(Q[28][3]).id, 'event-add');
});

test('5a. unsaved changes after the essentials: the "more" button and the step\'s row say so', async () => {
  const { v, t } = await setUp(['golf'], { season: '04-01:10-31' });
  const g = await openSetup(base, t);
  const done = Object.fromEntries((g.cfg.part1 || []).map((k) => [k, 'live']));
  db.prepare('INSERT INTO owner_setup_progress (venue_id, state) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET state = excluded.state').run(v.id, JSON.stringify({ done }));
  const step = (g.cfg.part2 || []).includes('bring') ? 'bring' : (g.cfg.part2 || [])[0];
  g.local.setItem(`suDraft:/owner/${t}:${step}`, JSON.stringify({ s: { bring: ['Dress code'] }, boxes: { suBring: 'The 9-hole Pinnacle is next do' }, exp: Date.now() + 86400000 }));
  const g2 = await openSetup(base, t, { local: g.local });
  assert.match(g2.text(), /You have unsaved changes from earlier/);
  assert.match(g2.text(), /unsaved changes from earlier/i);
  assert.ok(g2.acts().includes('resume'), g2.acts().join(' | '));
  const g3 = await openSetup(base, t);
  assert.doesNotMatch(g3.text(), /unsaved changes from earlier/, 'another phone has nothing waiting');
});

test('5b. French: an owner closure of a few days in the planner, and research\'s Practice line marked (en anglais)', async () => {
  const fr = require('../trip-french-copy.js');
  assert.equal(fr.t3FrenchText('Closed Jun 28–29 (Course aeration. Range and grill open): Canyon Sixteen (test).'), 'Fermés du 28 au 29 juin (Course aeration. Range and grill open) : Canyon Sixteen (test).');
  assert.equal(fr.t3FrenchText('Closed Jun 28–Jul 2: Canyon Sixteen.'), 'Fermés du 28 juin au 2 juill. : Canyon Sixteen.');
  const { v } = await setUp(['golf', 'range'], { season: '04-01:10-31' });
  db.prepare('INSERT OR REPLACE INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Practice', text: 'All-grass double-ended driving range, putting and chipping greens.' }], source_url: 'https://example.com/', checked_at: '2026-11-01' }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  assert.match(page(v, 'fr'), /Pratique All-grass double-ended driving range, putting and chipping greens\. \(en anglais\)/);
});

test('5c. search: a holiday or Christmas party, and "canyon bar and grill"; the planner never reads "venue" as a word', async () => {
  const { v } = await setUp(['golf', 'range'], { season: '04-01:10-31', name: 'Canyon Party Sixteen Golf', description: 'An 18-hole course with the Canyon Bar & Grill and a big clubhouse.' });
  for (let i = 0; i < 4; i++) mk({ type: 'restaurant', name: `Party Restaurant Sixteen ${i}`, description: 'A restaurant in Kelowna.' });
  db.prepare('INSERT OR REPLACE INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Groups', text: 'Tournaments for 24 to 150 golfers. Holiday parties up to 150 in the clubhouse.' }, { label: 'Part times', text: 'Canyon Bar & Grill: Wed–Fri 5–8 PM in winter' }], owner_labels: ['Groups', 'Part times'] }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  const cards = (h) => [...h.matchAll(/<span class="venue-card-name">([^<]*)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  for (const [lang, q] of [['en', 'holiday party venue kelowna'], ['en', 'christmas party kelowna'], ['fr', 'fête de noël kelowna'], ['en', 'canyon bar and grill'], ['en', 'canyon bar & grill kelowna']]) {
    const c = cards(await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
    assert.equal(c[0], v.name, `${q}: ${c.slice(0, 5).join(' | ')}`);
    assert.ok(!c.some((x) => /^Party Restaurant/.test(x)), `${q}: only the places whose own words say it`);
  }
  // Christmas Day itself is still the date.
  assert.match(await getText(`/search?q=${encodeURIComponent('golf christmas day kelowna')}`), /Dec 25/);
  const p = app.runTripPlan({ text: 'holiday party venue in Kelowna on Friday December 10 2027' }, NOV);
  assert.ok(!((p.intent && p.intent.foodTerms) || []).some((x) => x.term === 'venue'), JSON.stringify(p.intent && p.intent.foodTerms));
  assert.doesNotMatch(JSON.stringify(p.overview || {}) + String(p.headline || ''), /“venue”|"venue"/);
});
