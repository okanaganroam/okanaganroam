// Sport test 15 fixes (2026-11-21; Kurt, operations manager at Kelowna Springs Golf Club, on his Android phone;
// drafts/fresh-eyes-sport15-2026-11-21/REPORT.md):
//   1. Help: the screen a question is asked on knows its subject (sport-help.js SCREENS); the part-of-place answer only for
//      a question about the place's own season or hours; not clearly sure is "Is it one of these?" with choices and Ask us.
//      His 29 questions land well or on choices with the right one in them, none harmful.
//   2. "Use whole months instead" with no dates picked starts with no months (it lit all 12, so Mar + Apr left May–Feb).
//   3. Unsaved picks are kept on the device (localStorage, 7 days), so a new tab from the emailed link carries on; the
//      parts line is kept too; "You have unsaved changes from earlier" and a price list started in the editor say so.
//   4. Research's parts-line suggestions: never a year, a ";" or two parts; only "Part: when".
//   5. The parts box under the year answers, behind one line; the first rate's prefilled price is selected on tap; a
//      holiday party is not Dec 25; a 9-hole round is 2 to 2.5 hours; « cours de golf » is golf lessons; the closed-for-
//      the-season list gives a whole-month season's reopen date.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test15-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q } = require('./help-sport15-questions.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); srv.keepAliveTimeout = 120000; await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '19:00']]]));
const ip = () => `10.151.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, `status ${r.status}`); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
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
  return app.createVenue({ name: o.name || `Sport Fifteen ${n}`, slug: o.slug || `sport-fifteen-${n}`, region: o.region || 'kelowna', type: o.type || 'golf', latitude: o.lat || 49.95 + n / 4000, longitude: o.lng || -119.38,
    address: `${n} Penno Rd`, website: o.website || `https://fifteen-${n}.example.com/`, hours: JSON.stringify(WK), description: o.description || 'A fixture for sport test 15.', description_fr: 'Un lieu de test.' });
}
async function setUp(kinds, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (o.season) await ok(change(t, { hours: WK, open_months: o.season })); else await ok(change(t, { hours: WK }));
  await ok(change(t, { indoor_info: { kinds, length: o.length || '1-2h', book: o.book || 'busy', year: o.season ? 'seasonal' : 'all' }, indoor_price: o.price || 47 }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t };
}
const seasons = (id) => { const r = db.prepare('SELECT seasons FROM venue_hours_extra WHERE venue_id = ?').get(id); return r && r.seasons ? JSON.parse(r.seasons).map((x) => `${x.from}:${x.to}`) : []; };
const pressed = (g) => { assert.match(g.screen(), /data-chip="sea:3"/); return [...g.screen().matchAll(/aria-pressed="true" data-chip="sea:(\d+)"/g)].map((m) => +m[1]); };

test('1. Help: his 29 questions on the screens he asked them land well (or on choices with the right one), none harmful', async () => {
  const { t } = await setUp(SRC.sport15.kinds, { season: SRC.sport15.season, price: SRC.sport15.price });
  const bots = {};
  for (const [page, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[page] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const bad = []; let choices = 0;
  for (const [, page, lang, q, okIds, harm, screen] of Q) {
    const r = bots[page][lang].best(q, screen);
    if (r.id && harm.includes(r.id)) { bad.push(`HARM "${q}" -> ${r.id}`); continue; }
    if (r.id ? okIds.includes(r.id) : okIds.includes('UNSURE')) continue;
    if (!r.id && r.hits.slice(0, 3).some((x) => okIds.includes(x))) { choices++; continue; }
    bad.push(`"${q}" -> ${r.id || 'not sure'} [${r.hits.slice(0, 3)}] (wants ${okIds.join(' / ')})`);
  }
  assert.deepEqual(bad, []);
  assert.ok(choices <= 5, `choices ${choices}`);
  const S = bots.setup.en, E = bots.edit.en;
  // The Happy hour screen's own answer: yes, Only some months. Never the part-of-place answer, on any screen.
  const hh = Q[17][3];
  assert.equal(S.best(hh, 'happy').id, 'hh-some-months');
  assert.match(S.answer('hh-some-months'), /^<p>Yes\. On <strong>Happy hour<\/strong>, type its days and times, then tap <strong>Only some months<\/strong>/);
  assert.notEqual(S.best(hh).id, 'sport-part-season');
  // Off the Happy hour screen it is never the course's season either (a fit rule's next answer that another rule rules out).
  for (const sc0 of [undefined, '', 'hours', 'hours:year', 'closures']) assert.ok(!require('../sport-help.js').DANGER.includes(S.best(hh, sc0).id), String(sc0));
  assert.notEqual(S.best(hh, 'closures').id, 'sport-part-season');
  // The part answer: one answer (the shop's winter hours on that line too), never "No" and then Good to know.
  const part = S.answer('sport-part-season');
  // Sport test 16: no "No:" opener (it misfired on "which button" and "will it still say" questions).
  assert.match(part, /^<p>That line never changes your season or hours/);
  assert.match(part, /stays right every year/);
  assert.match(part, /Golf shop: December–February/);
  assert.doesNotMatch(part, /Good to know/);
  // The app answer: the web link, the app store link only if that's all; the app in Good to know.
  assert.match(S.answer('sport-app-booking'), /web booking link[\s\S]*only if the app is the only way to book[\s\S]*Good to know/);
  // Price: one rule, the usual adult green fee.
  assert.match(S.answer('indoor-price'), /^<p>One rule: <strong>Price<\/strong> is your usual adult green fee/);
  assert.match(E.answer('see-page'), /EN \/ FR[\s\S]*\(en anglais\)/);
  // Choices: "Is it one of these?" (EN + FR) with Ask us.
  assert.match(S.cfg.ui.en.choices, /^<p>Is it one of these\?[\s\S]*Ask us/);
  assert.match(S.cfg.ui.fr.choices, /Est-ce l’un de ces sujets\s?\?[\s\S]*Demandez-nous/);
  // A screen's pick never closes the place: a closures answer only when the matcher scored it.
  const sc = require('../sport-help.js').SCREENS;
  for (const [k, x] of Object.entries(sc)) for (const p of x.pick || []) assert.ok(!require('../sport-help.js').DANGER.includes(p.id) || p.id === 'indoor-price', `${k} picks ${p.id}`);
});

test('2. "Use whole months instead" with no dates yet starts with no months; Mar + Apr saves Apr (in the season)', async () => {
  const { v, t } = await setUp(['golf'], { season: '04-01:10-31' });
  const g = await openSetup(base, t, { hash: 'hours' });
  await g.click('hoursOk'); await g.click('seaMore');
  await g.click(g.acts().find((x) => /^yearSeason:part/.test(x)));
  assert.ok(g.screen().includes('data-sea="hours:months"'), 'the exact-date view');
  await g.click('[data-sea="hours:months"]');
  assert.deepEqual(pressed(g), [], 'no months picked for him');
  await g.click('[data-chip="sea:3"]'); await g.click('[data-chip="sea:4"]');
  await g.click('hoursSave');
  // Mar is outside his Apr 1 – Oct 31 season: the screen says so and keeps April.
  assert.match(g.text(), /Your hours from March to April/);
  await g.click('seaOutKeep');
  assert.deepEqual(seasons(v.id), ['04-01:04-30']);
  // The client's months view keeps the months it had, or none, when no dates are picked.
  const client = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(client, /ex0 && ex0\.from && ex0\.to \? seaMonths/);
});

test('3. a new tab on the same phone carries on: the season picks and the parts line come back, and it says so', async () => {
  const { t } = await setUp(['golf'], { season: '03-01:11-30' });
  const g = await openSetup(base, t);
  await g.click('go:basics'); await g.click('basicsOk');
  await g.click('hoursOk');
  await g.click('partTimesOpen');
  await g.type('suPartTimes', 'Legends Grill: April to October, Tue–Sun');
  await g.click('yearClosed');
  await g.settle();
  // The emailed link opens a new tab: a new sessionStorage, the same localStorage.
  const g2 = await openSetup(base, t, { local: g.local });
  assert.match(g2.text(), /Carry on You have unsaved changes from earlier/);
  await g2.click('resume');
  // Back on the season screen he left; his parts line is in the kept draft, for about 7 days.
  assert.ok(g2.acts().includes('openSave:same'), g2.acts().join(' | '));
  const draft = JSON.parse(g.local.getItem(`suDraft:/owner/${t}:hours`) || 'null');
  assert.ok(draft && draft.exp > Date.now() + 6 * 24 * 3600 * 1000, 'kept for about 7 days');
  assert.match(JSON.stringify(draft.s), /Legends Grill: April to October/);
  // Another phone has nothing waiting.
  const g3 = await openSetup(base, t);
  assert.doesNotMatch(g3.text(), /unsaved changes from earlier/);
});

test('3b. a price list started in the editor says how many prices wait to be sent', async () => {
  const { v, t } = await setUp(['golf'], { season: '03-01:11-30' });
  db.prepare("INSERT INTO venue_menus (venue_id, status, data) VALUES (?, 'draft', ?)").run(v.id, JSON.stringify({ sections: [{ name: 'Green fees', items: [{ name: '9 holes walking', price: '47' }, { name: '9 holes riding', price: '60' }, { name: 'After 4 PM', price: '39' }, { name: 'Replay', price: '30' }] }] }));
  const g = await openSetup(base, t);
  assert.equal(g.cfg.menuDraftLines, 4);
  const text = require('../owner-setup-text.js');
  assert.equal(text.en.stMenuDraft, '{n} prices saved, not sent yet');
});

test('4. research\'s parts-line suggestions: no year, no ";", one part, "Part: when" only', async () => {
  const v = mk({ name: 'Parts Suggest T15' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [
    { label: 'Food', text: 'Legends Classic Grill and banquet facilities; grill closed until spring 2027.' },
    { label: 'Patio', text: 'The patio is open May to September. Great views.' },
    { label: 'Range', text: 'Driving range and pro shop open daily in summer.' }] }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  await ok(change(t, { indoor_info: { kinds: ['golf'], length: '1-2h', book: 'busy', year: 'all' }, indoor_price: 47 }));
  const g = await openSetup(base, t);
  assert.equal(JSON.stringify(g.cfg.partTimesSuggest), JSON.stringify(['Patio: May to September']));
});

test('5. the parts box sits under the year answers, behind one line', async () => {
  const { t } = await setUp(['golf'], { season: '03-01:11-30' });
  const g = await openSetup(base, t, { hash: 'hours' });
  await g.click('hoursOk');
  const html = g.screen();
  assert.ok(html.indexOf('data-act="yearClosed"') < html.indexOf('data-act="partTimesOpen"'), 'after "We\'re closed part of the year"');
  assert.ok(!g.doc.getElementById('suPartTimes'));
  await g.click('partTimesOpen');
  assert.ok(g.doc.getElementById('suPartTimes'));
  assert.match(g.doc.getElementById('suPartTimes').getAttribute('placeholder'), /^e\.g\. /);
});

test('5b. the first rate\'s price from the Price screen is selected when tapped (typing 47 replaces it)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /var preTouched = false;\n  app\.addEventListener\('focusin'/);
});

test('5c. "holiday party venue kelowna" is a group booking, not December 25', async () => {
  const { v } = await setUp(['golf'], { season: '03-01:11-30', name: 'Holiday Party Golf T15' });
  db.prepare("INSERT OR REPLACE INTO venue_visit_info (venue_id, info) VALUES (?, ?)").run(v.id, JSON.stringify({ rows: [{ label: 'Groups', text: 'Christmas parties in the banquet room all winter, 30+' }], owner_labels: ['Groups'] }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  for (const q of ['holiday party venue kelowna', 'christmas party venue kelowna']) {
    const html = (await getText(`/search?q=${encodeURIComponent(q)}`)).replace(/<script[\s\S]*?<\/script>/g, '');
    assert.doesNotMatch(html, /Dec 25/, q);
  }
  const html = (await getText(`/search?q=${encodeURIComponent('golf christmas day kelowna')}`)).replace(/<script[\s\S]*?<\/script>/g, '');
  assert.match(html, /Dec 25/, 'Christmas Day itself is still the date');
});

test('5d. Build My Trip: « cours de golf » is golf lessons; a whole-month season gives its reopen date', async () => {
  const fr = require('../trip-planner-fr.js');
  assert.match(fr.tripPlannerText('cours de golf près de Kelowna le samedi 5 juin 2027'), /golf lessons/);
  const { v } = await setUp(['golf'], { season: '3-11', name: 'Whole Months Golf T15' });
  await setUp(['simgolf'], { name: 'Sim Bay T15' });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner' WHERE id = ?").run(v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const p = app.runTripPlan({ text: 'golf in Kelowna on January 16 2027' }, NOV);
  const w = (p.warnings || []).join(' ');
  assert.match(w, /Whole Months Golf T15 \(reopens Mar 1\)|Whole Months Golf T15 reopens March 1/, w);
});

test('5e. Build My Trip: an owner-set-up 9-hole course is a 2 to 2.5 hour round, not 9 AM – 1 PM', async () => {
  const { v } = await setUp(['golf'], { season: '03-01:11-30', name: 'Kelowna Springs Golf Club (test)', slug: 'kelowna-springs-golf-club', length: '1-2h' });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner' WHERE id = ?").run(v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const p = app.runTripPlan({ text: 'tee time in the morning then dinner in Kelowna, Fri June 11 2027' }, NOV);
  const sc = (p.schedule || []).find((x) => x.venueId === v.id);
  assert.ok(sc, JSON.stringify(p.schedule));
  const mins = sc.endMinutes - sc.startMinutes;
  assert.ok(mins >= 120 && mins <= 150, `a ${mins}-minute round`);
});
