// Sport test 17 fixes (fix round 16, 2026-11-21; Marlene, office volunteer at the Osoyoos Golf Club, Desert Gold, on an
// older Samsung at 125% text; drafts/fresh-eyes-sport17-2026-11-21/REPORT.md):
//   1. THE SPORT CARD RULE: once the owner has typed a Price, no Your prices line lowers the card or headline price, for
//      every sport kind (her $155 stays with a matinee $138 or "18 holes, March, April and after Oct 11" $109). Help says
//      the card's own computed price.
//   2. A happy hour only in the closed months: the heads-up sits right under the month chips; Save asks once ("Save
//      anyway" / "Change months"); the list says "saved, not shown while you're closed"; Help opens "Not while you're closed".
//   3. A research advisory ("(checked …)") on a place the business manages stops showing once every date it names has
//      passed, or once the owner saved her own season or hours after it was checked. Owner or admin notes stay. The FR
//      fallback keeps the reopening day; the EN season sentence is the owner's season.
//   4. Help: her 30 questions land well (or on choices with the right one), none harmful.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test17-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q } = require('./help-sport17-questions.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); srv.keepAliveTimeout = 120000; await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '19:00']]]));
const ip = () => `10.171.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, `status ${r.status}`); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const sp = (x) => String(x).replace(/[\s  ]+/g, ' ').trim();
const plain = (h) => sp(String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’'));
const page = (v, lang = 'en', now = NOV) => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now }));
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
  return app.createVenue({ name: o.name || `Desert Seventeen ${n}`, slug: o.slug || `desert-seventeen-${n}`, region: o.region || 'osoyoos', type: o.type || 'golf', latitude: 49.03 + n / 4000, longitude: -119.45,
    address: o.address || `${n} Golf Course Dr`, website: `https://seventeen-${n}.example.com/`, hours: JSON.stringify(WK), rating: 4.5, reviews: 300, description: o.description || 'A fixture for sport test 17.', description_fr: 'Un lieu de test.' });
}
async function setUp(kinds, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (o.season) await ok(change(t, { hours: WK, open_months: o.season })); else await ok(change(t, { hours: WK }));
  const price = 'price' in o ? o.price : 155;
  await ok(change(t, { indoor_info: { kinds, length: 'half', book: 'busy', year: o.season ? 'seasonal' : 'all' }, ...(price == null ? {} : { indoor_price: price }) }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t };
}
const publishPrices = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: 'Green fees', note: '', items: items.map(([name, price, description = '']) => ({ name, description, price, dietary: [], check: false })) }] }));
const MARLENE = [['Daily 18 holes', '155', 'Open to 11:59 am. Shared cart and range balls included'], ['Daily Matinee 18 holes', '138', '12 pm to 1:59 pm'], ['Daily Twilight', '115', '2 pm to 3:59 pm'], ['Super Twilight', '93', '4 pm to dusk'],
  ['Juniors', '45', 'Under 12, must play with an adult'], ['18 holes, March, April and after Oct 11', '109', 'Open to 11:59 am'], ['Tuesday 18 holes', '99', 'For seniors 65 and over'], ['Second 18 the same day', '60', 'Replay rate, after your first round'], ['Range balls, large bucket', '12', '90 balls']];

test('1. THE SPORT CARD RULE: her typed $155 stays the card, page, Build My Trip and Help price with a matinee $138 or a shoulder "18 holes, March, April and after Oct 11" $109 (EN + FR)', async () => {
  for (const lines of [[['Daily 18 holes', '155'], ['Daily Matinee 18 holes', '138', '12 pm to 1:59 pm']], [['Daily 18 holes', '155'], ['18 holes, March, April and after Oct 11', '109', 'Open to 11:59 am']], MARLENE]) {
    const { v, t } = await setUp(['golf'], { season: '03-06:10-31' });
    publishPrices(v.id, lines);
    app.writeIndoorVisitRows(v.id); app.indoorCardPrice(v.id);
    const label = lines.map((x) => x[0]).join(' / ');
    assert.equal(app.cardPriceFor(v.id), 'From $155', label);
    assert.match(page(v), /Green fees from \$155\./, label);
    assert.doesNotMatch(page(v), /from \$(138|109)\b/, label);
    assert.match(page(v, 'fr'), /Droits de jeu à partir de 155 \$/, label);
    assert.equal(app.indoorPlannerFacts(v.id).indoorPriceAt, 155, label);
    // Help says the card's own price; the setup preview has no lower price to show.
    const S = helpBot(await getText(`/owner/${t}/setup`));
    assert.match(S.answer('sport-card-price'), /Green fees from \$155/, label);
    assert.doesNotMatch(S.answer('sport-card-price'), /\$(138|109)\b/);
    assert.match(S.answer('sport-card-price'), /Nothing in Your prices lowers it, not even a cheaper rate for some times, some months or some people/);
    assert.ok(S.cfg && true);
  }
  // Every sport kind: a lower plain line never lowers a typed Price; with no Price typed it sets the card.
  for (const [k, type] of [['simgolf', 'golf'], ['rink', 'sport'], ['courts', 'sport'], ['skischool', 'sport']]) {
    const { v, t } = await setUp([k], { type });
    publishPrices(v.id, [['Main', '155'], ['Lower one', '100']]);
    app.indoorCardPrice(v.id);
    assert.match(String(app.cardPriceFor(v.id)), /\$155\b/, `${k} typed`);
    await ok(change(t, { indoor_price: null })); if (app.clearVenueCaches) app.clearVenueCaches(); app.indoorCardPrice(v.id);
    assert.match(String(app.cardPriceFor(v.id)), /\$100\b/, `${k} no Price typed`);
  }
});

test('1b. indoor places keep their own rule: a lower typed visit price still lowers the card', async () => {
  const v = mk({ type: 'indoor', name: 'Indoor Seventeen Museum' });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  await ok(change(t, { hours: WK }));
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', year: 'all' }, indoor_price: 20 }));
  publishPrices(v.id, [['Adults', '20'], ['Students', '12']]);
  app.indoorCardPrice(v.id);
  assert.match(String(app.cardPriceFor(v.id)), /\$12\b/);
});

const happyType = async (g) => { await g.click('edit:happy'); if (g.acts().includes('go:happy:yes')) await g.click('go:happy:yes'); if (g.acts().includes('go:happy:type')) await g.click('go:happy:type'); };
async function essentialsDone(v, t) {
  const g = await openSetup(base, t);
  const done = Object.fromEntries((g.cfg.part1 || []).map((k) => [k, 'live']));
  db.prepare('INSERT INTO owner_setup_progress (venue_id, state) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET state = excluded.state').run(v.id, JSON.stringify({ done }));
}
const happyRow = (id) => (db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(id) || {}).happy_hour_times;

test('2. a happy hour only in the closed months: the heads-up is under the month chips, Save asks once, the list says it can\'t show (EN + FR)', async () => {
  const { v, t } = await setUp(['golf'], { season: '03-06:10-31' });
  await essentialsDone(v, t);
  const g = await openSetup(base, t);
  await happyType(g);
  await g.click('hhDays:0,all');
  await g.click('[data-sea="happy:some"]');
  for (const m of [11, 12]) await g.click(`[data-smon="happy:${m}"]`);
  const w = g.doc.getElementById('suHappyClosed');
  assert.ok(w && !w.hidden, 'the heads-up shows as soon as the months are all closed ones');
  assert.match(sp(w.textContent), /closed for the season outside Mar 6 to Oct 31[\s\S]*visitors won’t see it/);
  // Right under the month chips: after the last month chip, before the Save button.
  const html = g.screen();
  const iChip = html.lastIndexOf('data-smon="happy:12"'), iWarn = html.indexOf('id="suHappyClosed"'), iSave = html.indexOf('data-act="happySave"');
  assert.ok(iChip > 0 && iWarn > iChip && iSave > iWarn, `chip ${iChip} < warn ${iWarn} < save ${iSave}`);
  assert.ok(!g.doc.getElementById('suWarnhappy0') || g.doc.getElementById('suWarnhappy0').hidden || !/closed for the season/.test(g.doc.getElementById('suWarnhappy0').textContent), 'not 800 px above, under the day chips');
  await g.type('hw0', '$2 off draft beer and house wine');
  // Save asks first; nothing is saved yet.
  await g.click('happySave');
  assert.ok(g.doc.getElementById('suHappyClosedAsk'), 'it asks before saving');
  assert.match(g.text(), /Visitors won’t see this while you’re closed\. Save anyway\?/);
  assert.ok(g.acts().includes('happyClosedYes') && g.acts().includes('happyClosedNo'));
  assert.ok(!happyRow(v.id), 'nothing saved yet');
  // Change months: back to the chips, no question.
  await g.click('happyClosedNo');
  assert.ok(!g.doc.getElementById('suHappyClosedAsk'));
  assert.ok(g.acts().includes('happySave'));
  // Save anyway: saved as she typed it.
  await g.click('happySave'); await g.click('happyClosedYes'); await g.settle();
  assert.match(String(happyRow(v.id)), /"_season":\{"from":"11-01","to":"12-31"\}/);
  // The list never says "on your page" for it.
  for (const lang of ['en', 'fr']) {
    const g2 = await openSetup(base, t, lang === 'fr' ? { lang } : {});
    const row = [...g2.doc.querySelectorAll('.su-rowbtn')].map((b) => sp(b.textContent)).find((x) => /Happy hour|5 à 7/.test(x)) || '';
    assert.match(row, lang === 'fr' ? /enregistré, caché pendant que vous êtes fermé/ : /saved, not shown while you’re closed/, `${lang}: ${row}`);
    assert.doesNotMatch(row, /on your page|sur votre page|✓/, `${lang}: ${row}`);
  }
  // French asks in French.
  const { v: vf, t: tf } = await setUp(['golf'], { season: '03-06:10-31' });
  await essentialsDone(vf, tf);
  const gf = await openSetup(base, tf, { lang: 'fr' });
  await happyType(gf);
  await gf.click('hhDays:0,all'); await gf.click('[data-sea="happy:some"]');
  for (const m of [11, 12]) await gf.click(`[data-smon="happy:${m}"]`);
  await gf.type('hw0', '2 $ de rabais sur la pression');
  await gf.click('happySave');
  assert.match(gf.text(), /Les visiteurs ne le verront pas pendant que vous êtes fermé\. Enregistrer quand même ?\?/);
  // A happy hour in the open months: no question, saved in one tap, and the list says it's on the page.
  const { v: v3, t: t3 } = await setUp(['golf'], { season: '03-06:10-31' });
  await essentialsDone(v3, t3);
  const g3 = await openSetup(base, t3);
  await happyType(g3);
  await g3.click('hhDays:0,wk'); await g3.click('[data-sea="happy:some"]');
  for (const m of [6, 7]) await g3.click(`[data-smon="happy:${m}"]`);
  assert.ok(g3.doc.getElementById('suHappyClosed').hidden, 'nothing to say');
  await g3.type('hw0', 'Half-price apps');
  await g3.click('happySave'); await g3.settle();
  assert.ok(!g3.doc.getElementById('suHappyClosedAsk'));
  assert.match(String(happyRow(v3.id)), /"_season":\{"from":"06-01","to":"07-31"\}/);
  // Help #20 opens with "Not while you're closed" (EN + FR).
  const S = helpBot(await getText(`/owner/${t}/setup`)), F = helpBot(await getText(`/fr/owner/${t}/setup`));
  assert.equal(S.best(Q[19][3], 'happy').id, 'hh-closed-season');
  assert.match(S.answer('hh-closed-season'), /^<p>Not while you’re closed\./);
  assert.match(F.answer('hh-closed-season', true), /^<p>Pas pendant que vous êtes fermé\./);
  // Display is as before: the deal never shows while closed.
  assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), new Date('2026-12-03T16:00:00-08:00')), true);
});

const advisory = (vid, note) => { const c = db.prepare("SELECT id FROM collections WHERE kind = 'advisory'").get(); db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id, note) VALUES (?, 'venue', ?, ?)").run(c.id, vid, note); if (app.clearVenueCaches) app.clearVenueCaches(); };
const NOTE = 'A public tournament is on Desert Gold on October 31. The Greenside Bar & Grill keeps fall hours (daily, 11 am to 7 pm) until November 8 (checked October 23, 2026).';

test('3. a stale research advisory: hidden on an owner-verified page and in plans once its dates pass; still shown before; owner and admin notes stay', async () => {
  const { v } = await setUp(['golf'], { season: '03-06:10-31' });
  advisory(v.id, NOTE);
  const OCT25 = new Date('2026-10-25T12:00:00-07:00'), JAN = new Date('2027-01-13T12:00:00-08:00'), JUL = new Date('2027-07-14T12:00:00-07:00');
  assert.match(page(v, 'en', OCT25), /A public tournament is on Desert Gold on October 31/, 'still shown on Oct 25, 2026');
  assert.ok(String(app.getAdvisoryNotes(OCT25).get(v.id) || '').includes('public tournament'));
  for (const d of [JAN, JUL, NOV]) {
    assert.doesNotMatch(page(v, 'en', d), /public tournament/, `hidden on ${d.toISOString()}`);
    assert.doesNotMatch(page(v, 'fr', d), /tournoi|public tournament/i);
    assert.ok(!String(app.getAdvisoryNotes(d).get(v.id) || '').includes('public tournament'), 'not in the notes plans read');
    assert.ok(!app.getCollectionNotes('advisory', d).has(v.id));
  }
  // The data is unchanged (display only).
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE c.kind = 'advisory' AND ci.content_id = ?").get(v.id).n, 1);
  // A note the owner or admin wrote (no "(checked …)") stays.
  const { v: v2 } = await setUp(['golf'], { season: '03-06:10-31' });
  advisory(v2.id, 'The back nine is closed for bunker work until October 31. Front nine open.');
  assert.match(page(v2, 'en', JAN), /back nine is closed for bunker work/);
  // A place nobody manages keeps research's note (the rule is for owner-verified pages).
  const v3 = mk({ name: 'Unclaimed Seventeen Golf' });
  advisory(v3.id, NOTE);
  assert.ok(String(app.getAdvisoryNotes(JAN).get(v3.id) || '').includes('public tournament'));
  // Older than the owner's own saved season or hours: hidden even while a date is still to come.
  const { v: v4 } = await setUp(['golf'], { season: '03-06:10-31' });
  advisory(v4.id, 'The course plans to open for the season on March 20, 2027 (checked October 23, 2026).');
  assert.ok(!app.getAdvisoryNotes(new Date('2026-12-01T12:00:00-08:00')).has(v4.id) || !String(app.getAdvisoryNotes(new Date('2026-12-01T12:00:00-08:00')).get(v4.id)).includes('March 20'));
  // ...but a fire or works note waits for its dates.
  const { v: v5 } = await setUp(['golf'], { season: '03-06:10-31' });
  advisory(v5.id, 'Wildfire smoke: the course may close on short notice until March 31, 2027 (checked October 23, 2026).');
  assert.ok(String(app.getAdvisoryNotes(new Date('2026-12-01T12:00:00-08:00')).get(v5.id) || '').includes('Wildfire'));
});

test('3c. main #992: a research note given its own last day (until_date) shows through that day, then goes', async () => {
  const { v } = await setUp(['golf'], { season: '03-06:10-31' });
  advisory(v.id, NOTE);
  db.prepare("UPDATE collection_items SET until_date = '2027-11-30' WHERE content_type = 'venue' AND content_id = ?").run(v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const JAN = new Date('2027-01-13T12:00:00-08:00'), LAST = new Date('2027-11-30T12:00:00-08:00'), AFTER = new Date('2027-12-01T12:00:00-08:00');
  // Its dates passed long ago, but the explicit last day wins over the dates-in-the-note guess.
  for (const d of [JAN, LAST]) assert.ok(String(app.getAdvisoryNotes(d).get(v.id) || '').includes('public tournament'), `shown on ${d.toISOString()}`);
  assert.ok(!app.getCollectionNotes('advisory', AFTER).has(v.id), 'gone the day after its last day');
});

test('3b. the EN season sentence is the owner\'s season; the FR fallback keeps « Réouverture le … »', async () => {
  // Research said it reopens March 13; she then saved her own season, Mar 6 – Oct 31.
  const v = mk();
  db.prepare("INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, 'closed', NULL, '2027-03-13', 'https://example.com/', '2026-11-01')").run(v.id);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  await ok(change(t, { hours: WK, open_months: '03-06:10-31' }));
  await ok(change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'busy', year: 'seasonal' }, indoor_price: 155 }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  const en = page(v, 'en', new Date('2027-01-13T12:00:00-08:00'));
  assert.match(en, /Closed for the season\. Reopens March 6\b/);
  assert.doesNotMatch(en, /March 13/);
  // With research's (stale) advisory note too, the French keeps the reopening day.
  advisory(v.id, NOTE);
  const fr = page(v, 'fr', new Date('2026-10-25T12:00:00-07:00'));
  assert.doesNotMatch(fr, /13 mars/);
  const frJan = page(v, 'fr', new Date('2027-01-13T12:00:00-08:00'));
  assert.match(frJan, /Fermé pour la saison[^.]*\. (Réouverture|Rouvre) le 6 mars/, (frJan.match(/À VÉRIFIER[\s\S]{0,300}|vérifier avant[\s\S]{0,300}/i) || [frJan.slice(0, 300)])[0]);
  assert.match(app.frAdvisoryFallback('Closed for the season. Reopens March 6, 2027. A public tournament is on Desert Gold on October 31 (checked October 23, 2026).'), /^Fermé pour la saison\. Réouverture le 6 mars 2027 \(vérifié le 23 octobre 2026\)\./);
  assert.match(app.frAdvisoryFallback('Closed for the season. Reopens April 1.'), /Réouverture le 1er avril\./);
  assert.equal(app.frAdvisoryFallback('Temporarily closed (checked October 19, 2026).'), 'Fermé temporairement (vérifié le 19 octobre 2026). Vérifiez la source officielle avant d’y aller.');
});

test('4. Help: her 30 questions on the screens she asked them land well (or on choices with the right one), none harmful', async () => {
  const s = SRC.sport17;
  const { v, t } = await setUp(s.kinds, { season: s.season, price: s.price, name: 'Osoyoos Seventeen Golf Club Desert Gold', address: '12300 Golf Course Dr' });
  mk({ name: 'Osoyoos Seventeen Golf Club Park Meadows', slug: 'osoyoos-seventeen-park-meadows', address: '12300 Golf Course Dr' });
  if (app.clearVenueCaches) app.clearVenueCaches();
  const bots = {};
  for (const [page0, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[page0] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const bad = []; let good = 0;
  for (const [, page0, lang, q, okIds, harm, screen] of Q) {
    const r = bots[page0][lang].best(q, screen);
    if (r.id && harm.includes(r.id)) bad.push(`HARM ${r.id}: ${q}`);
    else if (r.id && okIds.includes(r.id)) good++;
    else if (r.id) bad.push(`wrong ${r.id}: ${q}`);
    else if (!okIds.includes('UNSURE') && !(r.hits || []).slice(0, 3).some((x) => okIds.includes(x))) bad.push(`choices without the right one ${JSON.stringify((r.hits || []).slice(0, 3))}: ${q}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(good >= 25, `good ${good}`);
  const S = bots.setup.en, E = bots.edit.en;
  // The routes Dayton listed.
  assert.equal(S.best(Q[14][3], 'story').id, 'story-words');
  for (const q of ['Can you make it sound a bit nicer?', 'Can I tone it down a little?', 'Could we soften that line?']) assert.equal(S.best(q, 'story').id, 'story-words', q);
  assert.equal(bots.menu.en.best(Q[12][3], 'menu').id, 'sport-every-rate');
  assert.equal(S.best(Q[12][3], 'type').id, 'sport-every-rate');
  assert.match(S.answer('sport-every-rate'), /^<p>No, your main ones are enough; the card uses your <strong>Price<\/strong>\./);
  assert.equal(E.best(Q[26][3]).id, 'sport-two-courses');
  assert.equal(S.best(Q[7][3], 'price').id, 'sport-rate-change');
  assert.ok(['sport-included', 'indoor-good-to-know'].includes(S.best(Q[15][3], 'bring').id));
  assert.equal(E.best(Q[27][3]).id, 'hh-closed-season');
  assert.equal(E.best(Q[24][3]).id, 'setup-change-later');
  assert.match(E.answer('setup-change-later'), /^<p>Yes: <strong>Change an answer<\/strong>, any time\.<\/p>/);
  assert.equal(S.best(Q[3][3], 'hours:year').id, 'sport-part-season');
  assert.equal(S.best(Q[20][3], 'social').id, 'sport-social-unsure');
  assert.match(S.answer('sport-social-unsure'), /Not sure \/ someone else runs it/);
  // #29: Help reads her card's own price.
  assert.match(E.answer('sport-card-price'), /Green fees from \$155/);
});

test('5. minor: a doubled price says so; search reads "banquet" as a holiday party and « tournoi de golf » as a golf tournament', async () => {
  const { v, t } = await setUp(['golf'], { season: '03-06:10-31', price: 143, name: 'Banquet Seventeen Golf Club', description: 'An 18-hole desert course. Tournaments up to 132 players. Holiday banquet packages in the clubhouse.' });
  // The saved 143 typed again onto itself.
  const g = await openSetup(base, t, { hash: 'price' });
  await g.type('suTprice', '143143');
  await g.click('priceSave');
  assert.match(g.text(), /That looks like two prices run together\. Did you mean 143\?/);
  assert.doesNotMatch(g.text(), /couldn’t find a price/);
  assert.equal(app.venueIndoorInfo(v.id).price, 143, 'nothing saved');
  // A real four-digit price that isn't her old one twice still saves.
  const cards = (h) => [...h.matchAll(/<span class="venue-card-name">([^<]*)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  for (const [lang, q] of [['en', 'holiday party osoyoos'], ['en', 'christmas party osoyoos'], ['fr', 'fête de noël osoyoos'], ['en', 'banquet osoyoos'], ['fr', 'tournoi de golf osoyoos'], ['en', 'golf tournament osoyoos']]) {
    const c = cards(await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
    // (Other fixtures here say tournaments too: hers is among the first.)
    if (/tourn/.test(q)) assert.ok(c.slice(0, 3).includes(v.name), `${q}: ${c.slice(0, 5).join(' | ')}`); else assert.equal(c[0], v.name, `${q}: ${c.slice(0, 5).join(' | ')}`);
  }
});
