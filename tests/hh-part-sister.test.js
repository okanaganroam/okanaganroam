// Two owner-setup changes Dayton approved after sport test 17 (2026-11-21; drafts/fresh-eyes-sport16-2026-11-21 and
// drafts/fresh-eyes-sport17-2026-11-21):
//   1. A happy hour at a part of the place ("Greenside Bar & Grill: Nov 9 – Mar 31, Tue–Thu" in her "Part of the place with
//      its own times?" line) shows on the days that part is open, even while the course is closed for the season. The
//      closed-months heads-up becomes one question ("Is this happy hour at Greenside Bar & Grill?"); her pick is stored with
//      the happy hour ("_at"). Page, badge, search, hubs and Build My Trip show it at that part; other closed days still
//      hide it. No parts line, or "No": exactly as before.
//   2. A setup line naming a sister listing (another listing at her street address, or under her name):
//      "Park Meadows has its own page and its own setup link. Need it? Message us." Sport and golf places only; names only.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'hh-part-sister-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); srv.keepAliveTimeout = 120000; await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '19:00']]]));
const ip = () => `10.181.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, `status ${r.status}`); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const sp = (x) => String(x).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const plain = (h) => sp(String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’'));
const page = (v, lang, now, guides = []) => plain(app.renderVenuePage(app.getVenue(v.id), [], [], guides, { lang, now }));
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'the page has the Help widget');
  const cfg = JSON.parse(m[1]);
  return { cfg, answer: (id, fr) => ((cfg.topics.find((x) => x.id === id) || {})[fr ? 'aFr' : 'a']) || '' };
};
function mk(o = {}) {
  n++;
  return app.createVenue({ name: o.name || `Part Test Club ${n}`, slug: o.slug || `part-test-club-${n}`, region: o.region || 'osoyoos', type: o.type || 'golf', latitude: 49.03 + n / 4000, longitude: -119.45,
    address: o.address || `${n}0 Part Test Rd`, website: `https://part-test-${n}.example.com/`, hours: JSON.stringify(WK), rating: 4.5, reviews: 300, description: 'A fixture for the part happy hour test.', description_fr: 'Un lieu de test.' });
}
const PARTS = 'Greenside Bar & Grill: Nov 9 – Mar 31, Tue–Thu; Pro shop: Mon–Fri 10–4';
async function setUp(o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  await ok(change(t, { hours: WK, open_months: '04-01:10-31' }));
  await ok(change(t, { indoor_info: { kinds: o.kinds || ['golf'], length: 'half', book: 'busy', year: 'seasonal' }, indoor_price: 155 }));
  if (o.parts !== null) await ok(change(t, { visit_rows: { part_times: o.parts || PARTS } }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  const g = await openSetup(base, t);
  const done = Object.fromEntries((g.cfg.part1 || []).map((k) => [k, 'live']));
  db.prepare('INSERT INTO owner_setup_progress (venue_id, state) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET state = excluded.state').run(v.id, JSON.stringify({ done }));
  return { v, t };
}
const happyType = async (g) => { await g.click('edit:happy'); if (g.acts().includes('go:happy:yes')) await g.click('go:happy:yes'); if (g.acts().includes('go:happy:type')) await g.click('go:happy:type'); };
// Her winter grill deal: Mon–Fri 3–5 PM, November to March (every month of it in her closed season).
async function typeWinterDeal(g, deal = 'Half-price apps') {
  await happyType(g);
  await g.click('hhDays:0,wk');
  await g.click('[data-sea="happy:some"]');
  for (const m of [11, 12, 1, 2, 3]) await g.click(`[data-smon="happy:${m}"]`);
  await g.type('hw0', deal);
}
const happyRow = (id) => (db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(id) || {}).happy_hour_times;
const listRow = (g) => [...g.doc.querySelectorAll('.su-rowbtn')].map((b) => sp(b.textContent)).find((x) => /Happy hour|5 à 7/.test(x)) || '';
// Wednesday Dec 2, 2026 at 4 PM: the course is closed (Apr 1 – Oct 31), the grill is open (Nov 9 – Mar 31, Tue–Thu).
const WED = new Date('2026-12-02T16:00:00-07:00');
// Monday Dec 7, 2026 at 4 PM: closed season, and the grill isn't open on Mondays.
const MON = new Date('2026-12-07T16:00:00-07:00');
const plan = (text) => fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip(), 'User-Agent': 'okanaganroam-check/1.0' }, body: JSON.stringify({ text }) }).then((r) => r.json());
const stopsOf = (p, id) => { const out = []; const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 8) return; if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; } if (o.venue && o.venue.id === id) out.push(o); for (const k of Object.keys(o)) if (k !== 'venue' && o[k] && typeof o[k] === 'object') walk(o[k], d + 1); }; walk(p, 0); return out; };

test('1. the closed-months heads-up becomes "Is this happy hour at Greenside Bar & Grill?"; her pick is saved with it and the list says it shows there (EN)', async () => {
  const { v, t } = await setUp();
  const g = await openSetup(base, t);
  await typeWinterDeal(g);
  const q = g.doc.getElementById('suHappyAt');
  assert.ok(q, 'the question shows as soon as the months are all closed ones');
  assert.match(sp(q.textContent), /Is this happy hour at one of these\?/);
  assert.ok(g.acts().includes('happyAt:0') && g.acts().includes('happyAt:1') && g.acts().includes('happyAtNo'), g.acts().join(' | '));
  assert.ok(g.doc.getElementById('suHappyClosed').hidden, 'the question takes the place of the heads-up');
  await g.click('happyAt:0');
  assert.ok(!g.doc.getElementById('suHappyAt'), 'answered');
  const w = g.doc.getElementById('suHappyClosed');
  assert.ok(w && !w.hidden);
  assert.match(sp(w.textContent), /This happy hour shows at Greenside Bar & Grill: on the days your “Part of the place with its own times\?” line gives it/);
  assert.ok(g.acts().includes('happyAtNo'), 'one tap undoes it');
  // Save: no "Save anyway?", saved with the part.
  await g.click('happySave'); await g.settle();
  assert.ok(!g.doc.getElementById('suHappyClosedAsk'), 'no save confirm');
  assert.match(String(happyRow(v.id)), /"_at":"Greenside Bar & Grill"/);
  assert.match(String(happyRow(v.id)), /"_season":\{"from":"11-01","to":"03-31"\}/);
  const g2 = await openSetup(base, t);
  assert.match(listRow(g2), /on your page at Greenside Bar & Grill, on its days/);
  assert.doesNotMatch(listRow(g2), /not shown/);
  // Coming back: it still says so, with no question.
  await happyType(g2);
  assert.ok(!g2.doc.getElementById('suHappyAt'));
  assert.match(sp(g2.doc.getElementById('suHappyClosed').textContent), /shows at Greenside Bar & Grill/);
});

test('1b. French: « Ce 5 à 7 a-t-il lieu à Greenside Bar & Grill? » with one part; the list says it in French', async () => {
  const { v, t } = await setUp({ parts: 'Greenside Bar & Grill: Nov 9 – Mar 31, Tue–Thu' });
  const g = await openSetup(base, t, { lang: 'fr' });
  await typeWinterDeal(g, 'Entrées à moitié prix');
  assert.match(sp(g.doc.getElementById('suHappyAt').textContent), /Ce 5 à 7 a-t-il lieu à Greenside Bar & Grill ?\?/);
  assert.match(sp(g.text()), /Oui, à Greenside Bar & Grill/);
  assert.match(sp(g.text()), /Non/);
  await g.click('happyAt:0');
  assert.match(sp(g.doc.getElementById('suHappyClosed').textContent), /Ce 5 à 7 paraît à Greenside Bar & Grill/);
  await g.click('happySave'); await g.settle();
  assert.match(String(happyRow(v.id)), /"_at":"Greenside Bar & Grill"/);
  const g2 = await openSetup(base, t, { lang: 'fr' });
  assert.match(listRow(g2), /sur votre page à Greenside Bar & Grill/);
});

test('2. visitors: shown at the grill on its closed-season days (page, badge, More in, hubs), labelled; hidden on other closed days (EN + FR)', async () => {
  const { v, t } = await setUp();
  const g = await openSetup(base, t);
  await typeWinterDeal(g);
  await g.click('happyAt:0'); await g.click('happySave'); await g.settle();
  db.prepare('UPDATE venues SET great_groups = 1 WHERE id = ?').run(v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const V = app.getVenue(v.id);
  // The part's own line, read.
  const p = app.happyHourPartOf(V);
  assert.equal(p.name, 'Greenside Bar & Grill');
  assert.deepEqual(p.range, { from: '11-09', to: '03-31' });
  assert.deepEqual([...p.days].sort(), ['thu', 'tue', 'wed']);
  // Wednesday in the closed season: on.
  assert.equal(app.happyHourHiddenNow(V, WED), false, 'Wednesday Dec 2: the grill is open');
  const en = page(v, 'en', WED), fr = page(v, 'fr', WED);
  assert.match(en, /At the Greenside Bar & Grill: /);
  const live = app.venueHappyHourForTest(app.getVenue(v.id), WED);
  assert.ok(live && live.live && live.live.state === 'now', JSON.stringify(live));
  assert.match(live.week, /^At the Greenside Bar & Grill: /);
  assert.match(app.venueHappyHourForTest(app.getVenue(v.id), WED, true).week, /^Au Greenside Bar & Grill : /);
  assert.match(fr, /Au Greenside Bar & Grill : /);
  const guides = [{ region: 'osoyoos', badge: 'happy_hour' }, { region: 'osoyoos', badge: 'great_groups' }];
  assert.match(page(v, 'en', WED, guides), /More in Osoyoos:[^.]*Happy Hour/);
  // The town's happy hour hub and the map's happy hour column.
  const hub = app.happyHourStatesForTest ? app.happyHourStatesForTest([{ id: v.id, hours: JSON.stringify(WK), happy_hour_times: happyRow(v.id) }], WED) : null;
  if (hub) { const st = hub.byId.get(v.id); assert.ok(st && !st.blocked && st.h && st.h.state === 'now', JSON.stringify(st)); }
  // Monday (the grill is closed Mondays) and Saturday: still hidden, as before.
  for (const [label, d] of [['Monday Dec 7', MON], ['Saturday Dec 5', new Date('2026-12-05T16:00:00-07:00')], ['Tuesday Nov 3 (before Nov 9)', new Date('2026-11-03T16:00:00-07:00')]]) {
    assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), d), true, label);
    const pg = page(v, 'en', d, guides);
    assert.doesNotMatch(pg, /Greenside Bar & Grill: Mon|At the Greenside Bar & Grill/, label);
    assert.doesNotMatch(pg, /More in Osoyoos:[^.]*Happy Hour/, label);
    if (hub) { const st = app.happyHourStatesForTest([{ id: v.id, hours: JSON.stringify(WK), happy_hour_times: happyRow(v.id) }], d).byId.get(v.id); assert.ok(!st || st.blocked || !st.h, `${label}: ${JSON.stringify(st)}`); }
  }
  // In June the course is open but the deal's own months (Nov–Mar) are not: hidden, as before.
  assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), new Date('2027-06-09T16:00:00-07:00')), true);
  // A written advisory (not a season note) still hides it on the grill's days.
  const c = db.prepare("SELECT id FROM collections WHERE kind = 'advisory'").get();
  db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id, note) VALUES (?, 'venue', ?, ?)").run(c.id, v.id, 'Temporarily closed for clubhouse renovations.');
  if (app.clearVenueCaches) app.clearVenueCaches();
  assert.doesNotMatch(page(v, 'en', WED), /At the Greenside Bar & Grill/);
  db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND content_id = ?").run(c.id, v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
});

test('3. Build My Trip: on a grill day in the closed season it is planned as the grill, with no tee-time or green-fee words; not on other days (EN + FR)', async () => {
  const { v, t } = await setUp({ name: 'Sagebrush Part Test Golf Club', region: 'oliver' });
  const g = await openSetup(base, t);
  await typeWinterDeal(g);
  await g.click('happyAt:0'); await g.click('happySave'); await g.settle();
  await ok(change(t, { happy_hour_deals: { deals: [{ text: 'Half-price apps' }], deals_fr: [{ text: 'Entrées à moitié prix' }] } }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  // Wednesday January 13, 2027: closed season, grill open, happy hour on.
  const p = await plan('happy hour in oliver on wednesday january 13 2027');
  const st = stopsOf(p, v.id).filter((s) => !(p.closedForSeason || []).includes(s));
  assert.ok(st.length, `planned: ${p.kind} ${p.summary} ${JSON.stringify(p.warnings)} ${JSON.stringify((p.recommendations || []).map((x) => x.venue && x.venue.name))} ${JSON.stringify(p.closedForSeason && p.closedForSeason.map((x) => x.venue.name))}`);
  const s = st[0];
  assert.equal(s.venue.name, 'Greenside Bar & Grill (Sagebrush Part Test Golf Club)');
  assert.equal(s.venue.cost, null);
  const words = JSON.stringify(s);
  assert.doesNotMatch(words, /tee[- ]?times?|green fees?|droits de jeu|départ/i, words);
  assert.match(words, /Happy hour 3–5 PM on Wednesday at the Greenside Bar & Grill, from its listing/);
  if (s.happyHourLine) { assert.match(s.happyHourLine, /^Happy hour at the Greenside Bar & Grill 3–5 PM: Half-price apps/); assert.match(s.happyHourLineFr, /^5 à 7 au Greenside Bar & Grill \(15\sh–17\sh\)\s:\sEntrées à moitié prix/); }
  assert.equal(frCopy.t3FrenchText('Happy hour 3–5 PM on Wednesday at the Greenside Bar & Grill, from its listing'), '5 à 7 le mercredi, 15 h–17 h, au Greenside Bar & Grill, selon sa fiche');
  assert.ok(!(p.warnings || []).some((w) => w.includes('Sagebrush Part Test')), 'no "closed for the season" for it');
  // Monday January 11, 2027: the grill is closed Mondays: left out, as before ("closed for the season").
  const pm = await plan('happy hour in oliver on monday january 11 2027');
  assert.ok(!stopsOf(pm, v.id).some((x) => /^Greenside/.test(x.venue.name)), 'not as the grill');
  assert.ok(!(pm.recommendations || []).some((x) => x.venue && x.venue.id === v.id));
  // A golf request on the grill's day is still about the course (closed): no part stop.
  const pg = await plan('golf in oliver on wednesday january 13 2027');
  assert.ok(!stopsOf(pg, v.id).some((x) => /^Greenside/.test(x.venue.name)));
});

test('4. "No" and no parts line: exactly as before (heads-up, Save asks once, saved without a part, hidden while closed)', async () => {
  // "No".
  const { v, t } = await setUp();
  const g = await openSetup(base, t);
  await typeWinterDeal(g);
  await g.click('happyAtNo');
  assert.ok(!g.doc.getElementById('suHappyAt'));
  const w = g.doc.getElementById('suHappyClosed');
  assert.ok(w && !w.hidden);
  assert.match(sp(w.textContent), /closed for the season outside Apr 1 to Oct 31[\s\S]*visitors won’t see it/);
  await g.click('happySave');
  assert.match(g.text(), /Visitors won’t see this while you’re closed\. Save anyway\?/);
  await g.click('happyClosedYes'); await g.settle();
  assert.doesNotMatch(String(happyRow(v.id)), /_at/);
  assert.equal(app.happyHourPartOf(app.getVenue(v.id)), null);
  assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), WED), true);
  assert.doesNotMatch(page(v, 'en', WED), /Greenside Bar & Grill: |At the Greenside/);
  const g2 = await openSetup(base, t);
  assert.match(listRow(g2), /saved, not shown while you’re closed/);
  // Picked, then "It isn't at Greenside Bar & Grill" on a later visit: the part is cleared.
  const { v: v3, t: t3 } = await setUp();
  const g3 = await openSetup(base, t3);
  await typeWinterDeal(g3); await g3.click('happyAt:0'); await g3.click('happySave'); await g3.settle();
  assert.match(String(happyRow(v3.id)), /"_at":"Greenside Bar & Grill"/);
  const g4 = await openSetup(base, t3);
  await happyType(g4); await g4.click('happyAtNo'); await g4.click('happySave'); await g4.click('happyClosedYes'); await g4.settle();
  assert.doesNotMatch(String(happyRow(v3.id)), /_at/);
  // No parts line: the heads-up as before (with its tip), no question, and nothing about a part is sent.
  const { v: v2, t: t2 } = await setUp({ parts: null });
  const g5 = await openSetup(base, t2);
  await typeWinterDeal(g5);
  assert.ok(!g5.doc.getElementById('suHappyAt'));
  assert.match(sp(g5.doc.getElementById('suHappyClosed').textContent), /visitors won’t see it[\s\S]*Part of the place with its own times\?/);
  await g5.click('happySave');
  assert.ok(g5.doc.getElementById('suHappyClosedAsk'));
  await g5.click('happyClosedYes'); await g5.settle();
  assert.doesNotMatch(String(happyRow(v2.id)), /_at/);
  assert.equal(app.happyHourHiddenNow(app.getVenue(v2.id), WED), true);
  // A happy hour in her open months: no question at all.
  const { t: t6 } = await setUp();
  const g6 = await openSetup(base, t6);
  await happyType(g6); await g6.click('hhDays:0,wk'); await g6.click('[data-sea="happy:some"]');
  for (const m of [6, 7]) await g6.click(`[data-smon="happy:${m}"]`);
  assert.ok(!g6.doc.getElementById('suHappyAt'));
  assert.ok(g6.doc.getElementById('suHappyClosed').hidden);
});

test('5. the server only takes a part from her own parts line, on a golf place; the edit page keeps it', async () => {
  const { v, t } = await setUp();
  const hh = { mon: [['15:00', '17:00']], _season: { from: '11-01', to: '03-31' } };
  let r = await change(t, { happy_hour: { ...hh, _at: 'Clubhouse Lounge' } });
  assert.equal(r.status, 400, 'not in her line');
  r = await change(t, { happy_hour: { ...hh, _at: '<b>x</b>' } });
  assert.equal(r.status, 400);
  await ok(change(t, { happy_hour: { ...hh, _at: 'greenside bar and grill' } }));
  assert.match(String(happyRow(v.id)), /"_at":"Greenside Bar & Grill"/, 'stored as her line names it');
  // A save that doesn't mention the part (the edit page's week) keeps it.
  await ok(change(t, { happy_hour: { tue: [['15:00', '17:00']], _season: { from: '11-01', to: '03-31' } } }));
  assert.match(String(happyRow(v.id)), /"_at":"Greenside Bar & Grill"/);
  // Her part taken out of her parts line: the happy hour reads as before (hidden while closed).
  await ok(change(t, { visit_rows: { part_times: 'Pro shop: Mon–Fri 10–4' } }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  assert.equal(app.happyHourPartOf(app.getVenue(v.id)), null);
  assert.equal(app.happyHourHiddenNow(app.getVenue(v.id), WED), true);
  // A sport listing (no parts line) can't name one.
  const s = mk({ type: 'sport', name: 'Part Test Arena' });
  const ts = app.createOwnerLink(s.id, {}).url.split('/owner/')[1];
  await ok(change(ts, { hours: WK }));
  await ok(change(ts, { indoor_info: { kinds: ['rink'], length: 'half', book: 'busy', year: 'all' }, indoor_price: 12 }));
  r = await change(ts, { happy_hour: { ...hh, _at: 'Greenside Bar & Grill' } });
  assert.ok(r.status >= 400, `status ${r.status}`);
});

test('6. Help\'s happy-hour-not-showing answers mention the part question (EN + FR)', async () => {
  const { t } = await setUp();
  const S = helpBot(await getText(`/owner/${t}/setup`)), F = helpBot(await getText(`/fr/owner/${t}/setup`));
  assert.match(S.answer('hh-closed-season'), /^<p>Not while you’re closed\./);
  assert.match(S.answer('hh-closed-season'), /Is this happy hour at Grill\?/);
  assert.match(F.answer('hh-closed-season', true), /Ce 5 à 7 a-t-il lieu à Grill\s?\?/);
  assert.match(S.answer('hh-some-months'), /never in months your page says <strong>Closed for the season<\/strong>/);
});

test('7. the parts line reader: dates, months and days, EN and FR', () => {
  const w = (x) => { const r = app.partHhWhen(x); return [r.range ? `${r.range.from}:${r.range.to}` : null, r.days ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((d) => r.days.has(d)).join(',') : null]; };
  assert.deepEqual(w('Nov 9 – Dec 19, Tue–Thu 11–3'), ['11-09:12-19', 'tue,wed,thu']);
  assert.deepEqual(w('Wed–Fri 5–8 PM, November–March'), ['11-01:03-31', 'wed,thu,fri']);
  assert.deepEqual(w('du 9 nov. au 19 déc., mar.–jeu. 11 h–15 h'), ['11-09:12-19', 'tue,wed,thu']);
  assert.deepEqual(w('de novembre à mars, du mercredi au vendredi'), ['11-01:03-31', 'wed,thu,fri']);
  assert.deepEqual(w('every day except Mondays'), [null, 'tue,wed,thu,fri,sat,sun']);
  assert.deepEqual(w('open all winter'), [null, null]);
  assert.equal(app.happyHourAtText('Greenside Bar & Grill'), 'At the Greenside Bar & Grill');
  assert.equal(app.happyHourAtText('The Grill'), 'At The Grill');
  assert.equal(app.happyHourAtText('Greenside Bar & Grill', true), 'Au Greenside Bar & Grill');
  assert.equal(app.happyHourAtText('La Terrasse', true), 'À la Terrasse');
});

// ---------- 2. The sister line ----------
const sisterOf = (g) => g.doc.getElementById('suSister');
test('8. the sister line: an address match and a name-stem match, on setup and the owner home, EN + FR, with Message us', async () => {
  const dg = mk({ name: 'Osoyoos Golf Club — Desert Gold Test', address: '12300 Golf Course Drive, Osoyoos, BC V0H 1V4', slug: 'dg-test' });
  const pm = mk({ name: 'Osoyoos Golf Club — Park Meadows Test', address: '12301 Golf Course Drive, Osoyoos, BC', slug: 'pm-test' });
  const grill = mk({ name: 'Greenside Test Grill', type: 'restaurant', address: '12300 Golf Course Dr, Osoyoos, BC V0H 1V4', slug: 'grill-test' });
  const tdg = app.createOwnerLink(dg.id, {}).url.split('/owner/')[1];
  const tpm = app.createOwnerLink(pm.id, {}).url.split('/owner/')[1];
  const tgr = app.createOwnerLink(grill.id, {}).url.split('/owner/')[1];
  for (const t of [tdg, tpm]) { await ok(change(t, { hours: WK })); await ok(change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'busy', year: 'all' }, indoor_price: 150 })); }
  if (app.clearVenueCaches) app.clearVenueCaches();
  // Desert Gold: Park Meadows under her name first, then the grill at her address.
  const g = await openSetup(base, tdg);
  assert.ok(sisterOf(g), 'the line');
  assert.equal(sp(sisterOf(g).textContent), 'Park Meadows Test and Greenside Test Grill each have their own page and their own setup link. Need one? Message us');
  const btn = g.doc.getElementById('suSisterMsg');
  assert.equal(btn.getAttribute('data-ohb-contact'), 'Please send me the setup link for Park Meadows Test / Greenside Test Grill.');
  const gf = await openSetup(base, tdg, { lang: 'fr' });
  assert.equal(sp(sisterOf(gf).textContent), 'Park Meadows Test et Greenside Test Grill ont chacun leur propre page et leur propre lien de configuration. Vous en avez besoin ? Écrivez-nous');
  // Park Meadows: Desert Gold by the name stem only (its address differs).
  const g2 = await openSetup(base, tpm);
  assert.equal(sp(sisterOf(g2).textContent), 'Desert Gold Test has its own page and its own setup link. Need it? Message us');
  // A course and its grill at the same address, the other way: the course names the grill.
  const solo = mk({ name: 'Riverside Part Test Golf', address: '400 Riverbend Rd, Osoyoos, BC', slug: 'rs-test' });
  mk({ name: 'The Riverbend Patio', type: 'restaurant', address: '400 Riverbend Road, Osoyoos', slug: 'rb-test' });
  const tso = app.createOwnerLink(solo.id, {}).url.split('/owner/')[1];
  await ok(change(tso, { hours: WK }));
  const g3 = await openSetup(base, tso);
  assert.match(sp(sisterOf(g3).textContent), /^The Riverbend Patio has its own page and its own setup link\. Need it\? Message us$/);
  // The owner home (her edit page), EN + FR, with the Help's Message us form.
  const home = await getText(`/owner/${tdg}`), homeFr = await getText(`/fr/owner/${tdg}`);
  assert.match(plain(home), /Park Meadows Test and Greenside Test Grill each have their own page and their own setup link\. Need one\? Message us/);
  assert.match(plain(homeFr), /Park Meadows Test et Greenside Test Grill ont chacun leur propre page et leur propre lien de configuration\. Vous en avez besoin ?\? Écrivez-nous/);
  assert.match(home, /data-ohb-contact="Please send me the setup link for Park Meadows Test \/ Greenside Test Grill\."/);
  assert.match(home, /\[data-ohb-contact\]/, 'the Help widget opens its Message us form for it');
  // Never the other listings' private links or tokens, anywhere on her pages.
  for (const html of [home, homeFr, await getText(`/owner/${tdg}/setup`), await getText(`/fr/owner/${tdg}/setup`)]) {
    for (const tok of [tpm, tgr]) assert.ok(!html.includes(tok), 'no sister token in the HTML');
    assert.ok(!html.includes(`/pm-test`) && !html.includes('/grill-test'), 'no link to the sister page either');
  }
  // Help's "it has its own page" uses the same detection (sport and golf listings, as before).
  const S = helpBot(await getText(`/owner/${tpm}/setup`));
  assert.match(S.answer('sport-sister-listing'), /^<p>Osoyoos Golf Club — Desert Gold Test has its own page here/);
});

test('9. the sister line never shows for unrelated places, another town, or outside sport and golf', async () => {
  const a = mk({ name: 'Lonely Part Test Links', address: '900 Quiet Way, Osoyoos, BC', slug: 'lonely-test' });
  mk({ name: 'Another Part Test Course', address: '901 Quiet Way, Osoyoos, BC', slug: 'another-test' });
  mk({ name: 'Lonely Part Test Links — North', region: 'oliver', address: '1 Far Rd, Oliver, BC', slug: 'lonely-north-test' });
  mk({ name: 'Quiet Cafe Test', type: 'cafe', address: '9000 Quiet Way, Osoyoos', slug: 'quiet-cafe-test' });
  const ta = app.createOwnerLink(a.id, {}).url.split('/owner/')[1];
  await ok(change(ta, { hours: WK }));
  const g = await openSetup(base, ta), gf = await openSetup(base, ta, { lang: 'fr' });
  assert.ok(!sisterOf(g) && !sisterOf(gf), 'nothing at her address or under her name in her town');
  assert.doesNotMatch(plain(await getText(`/owner/${ta}`)), /its own setup link|lien de configuration/);
  assert.deepEqual(app.setupSisterNamesForTest(app.getVenue(a.id)), []);
  // A restaurant sharing a mall address with another restaurant: no line (sport and golf only).
  const r1 = mk({ name: 'Mall Part Test Sushi', type: 'restaurant', address: '2271 Harvey Ave, Kelowna', region: 'kelowna', slug: 'mall-sushi-test' });
  mk({ name: 'Mall Part Test Tacos', type: 'restaurant', address: '2271 Harvey Ave, Kelowna', region: 'kelowna', slug: 'mall-tacos-test' });
  assert.deepEqual(app.setupSisterNamesForTest(app.getVenue(r1.id)), []);
  const tr = app.createOwnerLink(r1.id, {}).url.split('/owner/')[1];
  assert.doesNotMatch(plain(await getText(`/owner/${tr}`)), /its own setup link/);
  assert.ok(!(await getText(`/owner/${tr}/setup`)).includes('"sisters":["'), 'no sister names in a restaurant setup');
});
