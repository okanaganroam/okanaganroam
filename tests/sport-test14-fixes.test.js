// Sport test 14 fixes (2026-11-21; Marisol, pro shop manager at Fairview Mountain Golf Club in Oliver, on the shop's Android
// tablet, interrupted twice; drafts/fresh-eyes-sport14-2026-11-21/REPORT.md):
//   1. Shoulder-season hours: a stretch that starts before the season and ends inside it (month chips) is clipped to the
//      season without a question, for every kind with a season; a stretch with days wholly outside the season names only
//      those days and its main button keeps the days in season; months in two runs (Mar, Apr and Oct) become two stretches;
//      the sport path says "part of your season" (no Jun–Aug preset).
//   2. "Book a tee time": a kept booking link (research's, equal to the website) is her own answer on Save, and the page
//      shows the kind's Book button (every type with the booking = website rule).
//   3. Help: her 27 questions land well, none harmful (a named part of the place with open or season words is never the
//      place's season; the course closing for days is a closure; booking link vs website; another listing on this login;
//      the Book button; the Value index).
//   4. Resume: "Carry on" opens the hours screen she left (her picks there are kept in this tab, like typed text).
//   5. "Prices on my website" says the page links to the rates page.
//   6. Build My Trip: a golf weekend in the South Okanagan plays in the area's golf towns (Oliver, with the owner-set-up
//      course, and Osoyoos), never Summerland and Kaleden.
//   7. French: « près d'Oliver » is "near" (no « pres » in the plan); her English lines on the French page say « (en anglais) ».
//   8. Search: "golf and wine oliver" lists the courses first, then the wineries; "golf tournament venue oliver" finds the
//      courses, the ones that say tournaments first.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test14-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q } = require('./help-sport14-questions.js');
const F = require('./sport14-fixture.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0, fv, hood;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  fv = F.fairview(app, db); hood = F.neighbours(app);
  if (app.clearVenueCaches) app.clearVenueCaches();
});
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '20:00']]]));
const ip = () => `10.144.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() },
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
  return { best: (q) => ctx.window.__ohbBest(q), cfg, answer: (id, fr) => ((cfg.topics.find((x) => x.id === id) || {})[fr ? 'aFr' : 'a']) || '' };
};
function mk(o = {}) {
  n++;
  return app.createVenue({ name: o.name || `Sport Fourteen ${n}`, slug: o.slug || `sport-fourteen-${n}`, region: o.region || 'peachland', type: o.type || 'golf', latitude: o.lat || 49.77 + n / 4000, longitude: o.lng || -119.73,
    address: `${n} Beach Ave`, website: o.website || `https://fourteen-${n}.example.com/`, hours: JSON.stringify(WK), description: o.description || 'A fixture for sport test 14.', description_fr: 'Un lieu de test.' });
}
async function setUp(kinds, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (o.season) await ok(change(t, { hours: WK, open_months: o.season })); else await ok(change(t, { hours: WK }));
  await ok(change(t, { indoor_info: { kinds, length: o.length || '1-2h', book: o.book || 'busy', year: o.season ? 'seasonal' : 'all' }, indoor_price: o.price || 40 }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t };
}
const seasons = (id) => { const r = db.prepare('SELECT seasons FROM venue_hours_extra WHERE venue_id = ?').get(id); return r && r.seasons ? JSON.parse(r.seasons).map((x) => `${x.from}:${x.to}`) : []; };
// Taps the month chips on the stretch screen so exactly `want` are picked.
async function months(g, want) {
  for (let m = 1; m <= 12; m++) {
    const on = /data-chip="sea:(\d+)"/.test(g.screen()) && new RegExp(`aria-pressed="true" data-chip="sea:${m}"`).test(g.screen());
    if (on !== want.includes(m)) await g.click(`[data-chip="sea:${m}"]`);
  }
}
// From the hours step to an empty stretch of other hours ("part of your season", or a winter kind's own button).
async function toStretch(g, season) {
  await g.click('hoursOk'); await g.click('yearClosed');
  // (The stand-in browser's date lists don't keep their picked option: the season's dates are picked again.)
  const [a, b] = season.split(':');
  await g.type('suOfM', String(+a.slice(0, 2))); await g.type('suOfD', String(+a.slice(3))); await g.type('suOtM', String(+b.slice(0, 2))); await g.type('suOtD', String(+b.slice(3)));
  await g.click(g.acts().includes('openSave:summer') ? 'openSave:summer' : 'openSave:part');
}
const NAMES = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || [])].filter((x) => x && x.venue).map((x) => x.venue.name);
async function searchNames(q, fr) {
  const html = (await getText(`${fr ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`)).replace(/<script[\s\S]*?<\/script>/g, '');
  const names = [fv.name, ...hood.map((v) => v.name)];
  return names.map((x) => [x, html.indexOf(`>${x.replace(/&/g, '&amp;').replace(/'/g, '&#39;')}`)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

test('1. shoulder hours: a stretch from before the season into it is clipped to the season (every kind with a season)', async () => {
  // [kind, type, season, the month chips (the season's first month and the next)]
  const KINDS = [['golf', 'golf', '03-15:10-31', [3, 4], '03-15:04-30'], ['range', 'golf', '03-15:10-31', [3, 4], '03-15:04-30'], ['discgolf', 'sport', '04-10:11-15', [4, 5], '04-10:05-31'],
    ['bike', 'sport', '05-15:10-15', [5, 6], '05-15:06-30'], ['skatepark', 'sport', '03-15:11-15', [3, 4], '03-15:04-30'], ['swim', 'sport', '06-10:09-05', [6, 7], '06-10:07-31'],
    ['rink', 'sport', '10-15:03-31', [10, 11], '10-15:11-30'], ['skischool', 'sport', '11-26:04-06', [11, 12], '11-26:12-31']];
  for (const [kind, type, season, chips, want] of KINDS) {
    const { v, t } = await setUp([kind], { type, season });
    const g = await openSetup(base, t, { hash: 'hours' });
    await toStretch(g, season);
    await months(g, chips);
    await g.click('hoursSave');
    assert.deepEqual(seasons(v.id), [want], `${kind}: ${g.text().slice(0, 300)}`);
    assert.doesNotMatch(g.text(), /would show nowhere|No, skip these hours/, kind);
  }
  // Marisol's own: Mar, Apr and Oct at 8–6 with a Mar 15 – Oct 31 season: two stretches, the first clipped.
  const { v, t } = await setUp(['golf', 'range'], { season: '03-15:10-31' });
  const g = await openSetup(base, t, { hash: 'hours' });
  await toStretch(g, '03-15:10-31');
  assert.match(g.text(), /Different hours for part of your season\? Pick the months, like spring and fall/);
  assert.doesNotMatch(g.text(), /June to August/);
  assert.ok(!/aria-pressed="true" data-chip="sea:/.test(g.screen()), 'no months picked for her');
  await months(g, [3, 4, 10]);
  await g.click('hoursSave');
  assert.deepEqual(seasons(v.id), ['03-15:04-30', '10-01:10-31']);
});

test('1b. days wholly outside the season: only those days are named, and the main button keeps the days in season', async () => {
  const { v, t } = await setUp(['golf'], { season: '04-01:10-15' });
  const g = await openSetup(base, t, { hash: 'hours' });
  await toStretch(g, '04-01:10-15');
  await months(g, [3, 4]);
  await g.click('hoursSave');
  const txt = g.text();
  assert.match(txt, /so on Mar 1 – Mar 31 your page says “Closed for the season”\. These hours show Apr 1 – Apr 30\./);
  assert.doesNotMatch(txt, /No, skip these hours/);
  assert.deepEqual(g.acts().slice(0, 2), ['seaOutKeep', 'seaOutOpen'], 'Keep is first and the main button');
  await g.click('seaOutKeep');
  assert.deepEqual(seasons(v.id), ['04-01:04-30']);
  // A stretch wholly outside the season keeps its own question (skip, or Good to know).
  const w = await setUp(['golf'], { season: '04-01:10-15' });
  const g2 = await openSetup(base, w.t, { hash: 'hours' });
  await toStretch(g2, '04-01:10-15');
  await months(g2, [12, 1]);
  await g2.click('hoursSave');
  assert.ok(g2.acts().includes('seaOutSkip'));
  // The words, EN and FR.
  const text = require('../owner-setup-text.js');
  for (const L of ['en', 'fr']) for (const k of ['seaOutsidePart', 'seaOutsidePartAsk', 'seaOutsideKeep', 'seaPartQ', 'openPartSeason', 'seaMoreSport', 'seaMoreClosedFirst', 'monthsInRowSea']) assert.ok(text[L][k], `${L}.${k}`);
});

test('2. the kept booking link is her own answer: the page shows Book a tee time (and every type with the rule)', async () => {
  assert.doesNotMatch(await getText(`/oliver/golf/${fv.slug}`), /data-track="booking"/, 'research’s link equal to the website: no button before');
  const t = app.createOwnerLink(fv.id, {}).url.split('/owner/')[1];
  const g = await openSetup(base, t, { hash: 'booking' });
  assert.equal(g.doc.getElementById('suBookUrl').value, 'https://www.fairviewmountain.com/');
  await g.click('bookingSave');
  if (app.clearVenueCaches) app.clearVenueCaches();
  const html = await getText(`/oliver/golf/${fv.slug}`);
  assert.match(html, /data-track="booking">Book a tee time</);
  assert.match(await getText(`/fr/oliver/golf/${fv.slug}`), /data-track="booking">Réserver un départ</);
  // Saved again: nothing new to send, still fine.
  const g2 = await openSetup(base, t, { hash: 'booking' });
  await g2.click('bookingSave');
  assert.doesNotMatch(g2.text(), /Please try again/);
  // The server rule for every type: a kept link sent from the setup is recorded, live, and the page keeps its Book button.
  for (const [type, region] of [['tour', 'kelowna'], ['winery', 'oliver'], ['restaurant', 'penticton'], ['indoor', 'vernon']]) {
    const site = `https://keep-${type}.example.com/`;
    const v = mk({ type, region, website: site, name: `Keep ${type} T14` });
    db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?)').run(v.id, site);
    const tk = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    await ok(change(tk, { booking_url: site }));
    const row = db.prepare("SELECT status, instant FROM owner_change_requests WHERE venue_id = ? AND changes LIKE '%booking_url%'").get(v.id);
    assert.ok(row && row.status === 'approved' && row.instant === 1, type);
    if (app.clearVenueCaches) app.clearVenueCaches();
    const p = await getText(`/${region}/${{ tour: 'tours', winery: 'wineries', restaurant: 'restaurants', indoor: 'indoor' }[type]}/${v.slug}`);
    assert.match(p, /data-track="booking"/, type);
  }
});

test('3. Help: her 27 questions land well, none harmful', async () => {
  const { t } = await setUp(SRC.sport14.kinds, { season: SRC.sport14.season, price: SRC.sport14.price, length: 'half' });
  const bots = {};
  for (const [page, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[page] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const bad = [];
  for (const [, page, lang, q, okIds, harm] of Q) {
    const r = bots[page][lang].best(q);
    if (r.id && harm.includes(r.id)) bad.push(`HARM "${q}" -> ${r.id}`);
    else if (!(r.id ? okIds.includes(r.id) : okIds.includes('UNSURE'))) bad.push(`"${q}" -> ${r.id || 'not sure'} (wants ${okIds.join(' / ')})`);
  }
  assert.deepEqual(bad, []);
  const S = bots.setup.en, E = bots.edit.en;
  // Any named area or service of the place, with open or season words: never the place's season.
  const SEASONY = /^(?:closures|setup-short-closure|sport-one-off-closure|indoor-closed-months|sport-season|season|indoor-seasonal|seasonal-hours|year-round|sport-opening-day|edit-season|setup-season)$/;
  for (const q of ['the golf academy runs lessons all winter, do i change us to open all year?', 'our lesson studio is open year round by appointment, is that open all year?', 'the meeting room is open in december for parties, does that change our season?', 'sim bays open november to march, should i say open all year?']) {
    const r = S.best(q);
    assert.ok(!r.id || !SEASONY.test(r.id), `${q} -> ${r.id}`);
  }
  // The course itself closing for days is a closure.
  assert.match(S.best('we close the course 2 days in october for aeration but the range and restaurant stay open. do i put it as a closure?').id || '', /^(?:sport-aeration|sport-one-off-closure|setup-short-closure|closures)$/);
  // The answers she needed.
  assert.match(E.answer('sport-book-button'), /We found a bug/);
  assert.match(E.answer('sport-golf-facts'), /Message us/);
  assert.match(S.answer('sport-bay-link'), /club-fitting room or lesson studio/);
});

test('4. resume: "Carry on" opens the hours screen she left', async () => {
  const { t } = await setUp(['golf'], { season: '03-15:10-31' });
  const g = await openSetup(base, t);
  await g.click('go:basics'); await g.click('basicsOk');
  await g.click('hoursOk'); await g.click('yearClosed');
  assert.ok(g.acts().includes('openSave:same'));
  await g.settle();
  // The tab is closed; she comes back in the same tab through the email link.
  const g2 = await openSetup(base, t, { session: g.session });
  assert.ok(g2.acts().includes('resume'));
  await g2.click('resume');
  assert.ok(g2.acts().includes('openSave:same') || g2.acts().includes('monthsUseSave'), g2.acts().join(' | '));
  const client = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(client, /d\.at = S\.step;/);
  assert.match(client, /var RESUME_AT = \/\^hours:\(\?:edit\|year\|open\|season\)\$\/;/);
});

test('5. prices on her website: the page will link to her rates page', () => {
  const text = require('../owner-setup-text.js');
  assert.match(text.en.indoor.webWhatShows, /Your page will link to your rates page/);
  assert.match(text.en.indoor.webSavedLink, /Your page will link to your rates page/);
  assert.match(text.fr.indoor.webWhatShows, /renverra à votre page des tarifs/);
});

test('6. Build My Trip: a golf weekend in the South Okanagan plays in its golf towns, with Oliver', () => {
  const p = app.runTripPlan({ text: 'Golf weekend in the South Okanagan July 17-18 2027' }, NOV);
  const towns = (p.days || []).map((d) => d.region);
  assert.ok(towns.includes('oliver'), towns.join(','));
  assert.ok(!towns.includes('summerland') && !towns.includes('kaleden'), towns.join(','));
  assert.ok(NAMES(p).includes(fv.name), NAMES(p).join(' | '));
  // One town asked keeps its own plan.
  const o = app.runTripPlan({ text: 'golf weekend in Oliver June 12-13 2027' }, NOV);
  assert.ok(NAMES(o).includes(fv.name));
});

test('7. French: « près d\'Oliver » is near; her English lines on the French page say so', async () => {
  for (const q of ['golf avec mes enfants de 9 et 12 ans près d\'Oliver, samedi 10 juillet 2027', 'cours de golf près d\'Oliver le samedi 5 juin 2027']) {
    const p = app.runTripPlan({ text: q, lang: 'fr' }, NOV);
    assert.doesNotMatch(JSON.stringify([p.summary, p.headline, p.understood]), /\bpres\b/i, q);
  }
  const fr = await getText(`/fr/oliver/golf/${fv.slug}`);
  assert.match(fr, /<span lang="en">Tournaments and corporate golf[^<]*<\/span> <span class="visit-lang-note">\(en anglais\)<\/span>/);
  assert.doesNotMatch(await getText(`/oliver/golf/${fv.slug}`), /en anglais/);
});

test('8. search: golf and wine lists the courses first; a tournament venue search finds the courses', async () => {
  for (const [q, fr] of [['golf and wine oliver'], ['golf et vin oliver', true]]) {
    const got = await searchNames(q, fr);
    assert.equal(got[0], fv.name, `${q}: ${got.slice(0, 5).join(' | ')}`);
    assert.ok(got.some((x) => /Winery|Wines|Cellars/.test(x)), 'and the wineries');
  }
  const t = await searchNames('golf tournament venue oliver');
  assert.equal(t[0], fv.name, t.join(' | '));
  // A winery search alone is unchanged.
  assert.ok(!(await searchNames('winery oliver')).includes(fv.name));
});

// Dayton approved (2026-11-21), golf only: "Part of the place with its own times? (optional)" on the season question.
test('9. the parts\' own times (golf): on the season question, beside the hours EN and FR, never the course\'s season or plans', async () => {
  const { v, t } = await setUp(['golf', 'range'], { season: '04-01:10-15', region: 'oliver', name: 'Parts Line Golf T14' });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner' WHERE id = ?").run(v.id);
  const g = await openSetup(base, t, { hash: 'hours' });
  await g.click('hoursOk');
  assert.match(g.text(), /Part of the place with its own times\? \(optional\)/);
  assert.equal(g.doc.getElementById('suPartTimes').value, '', 'never filled in for her');
  await g.type('suPartTimes', 'Range: March–November\nFitting bay: open all winter by appointment');
  // Her season as it is (We're closed part of the year, the same dates), saved with the line.
  await g.click('yearClosed');
  await g.type('suOfM', '4'); await g.type('suOfD', '1'); await g.type('suOtM', '10'); await g.type('suOtD', '15');
  await g.click('openSave:same');
  const seasonNow = db.prepare('SELECT open_months FROM venue_links WHERE venue_id = ?').get(v.id).open_months;
  assert.equal(seasonNow, '04-01:10-15', 'the course season stays in charge');
  if (app.clearVenueCaches) app.clearVenueCaches();
  const en = await getText(`/oliver/golf/${v.slug}`), fr = await getText(`/fr/oliver/golf/${v.slug}`);
  assert.match(en, /Parts of the place with their own times[\s\S]*?<span class="venue-part-name">Range<\/span> <span>March–November<\/span>[\s\S]*?<span class="venue-part-name">Fitting bay<\/span> <span>open all winter by appointment<\/span>/);
  assert.doesNotMatch(en, /visit-label">Part times/, 'never in the Plan your visit box');
  assert.match(fr, /Heures de certaines parties de l’endroit[\s\S]*?\(en anglais\)[\s\S]*?<li lang="en"><span class="venue-part-name">Range<\/span>/);
  // Queued for French with her other lines.
  const items = db.prepare("SELECT help_kind, help_note FROM venue_menus WHERE venue_id = ?").all(v.id);
  assert.ok(items.some((x) => /Part times/.test(String(x.help_note || ''))), JSON.stringify(items));
  // Build My Trip: the course is out in January (its season), in in July, whatever the parts say.
  const NOV = new Date('2026-11-21T12:00:00-08:00');
  assert.ok(!NAMES(app.runTripPlan({ text: 'golf in Oliver on Saturday January 15 2028' }, NOV)).includes(v.name));
  const jul = app.runTripPlan({ text: 'golf in Oliver on Saturday July 17 2027' }, NOV);
  assert.ok([...NAMES(jul), ...((jul.recommendations || []).map((x) => x.venue && x.venue.name))].includes(v.name));
  // Not part of the 100%: the checklist is the same with or without it.
  // (Its slot has no checklist item, like the Dogs line: item null.)
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /\{ key: 'part_times', labels: \['Part times'\], def: 'Part times', item: null \}/);
  // Help: the part questions point to the line.
  const S = helpBot(await getText(`/owner/${t}/setup`));
  for (const q of ['the fitting bay is open all winter by appointment. should I say open all year then?', 'the range usually opens a week or two before the course in march. do I change our season?', 'the pro shop is open tue to sat 10 to 4 all winter, where does that go?', 'Also the RV park opens April 28 to mid September, does that go here too?', 'our restaurant is open in november but golf is closed. does that change our season?']) {
    const r = S.best(q);
    assert.ok(!r.id || /Part of the place with its own times/.test(S.answer(r.id)), `${q} -> ${r.id}`);
  }
  assert.match(S.answer('sport-part-season'), /Part of the place with its own times\?/);
  // Search reads it for that part.
  const html = await getText(`/search?q=${encodeURIComponent('fitting bay')}`);
  assert.ok(html.includes(`>${v.name}`));
});

test('9b. no other sport kind sees the line, and the server takes it for golf only', async () => {
  for (const [kind, type] of [['rink', 'sport'], ['skischool', 'sport'], ['swim', 'sport'], ['discgolf', 'sport']]) {
    const { t } = await setUp([kind], { type, season: '06-10:09-05' });
    const g = await openSetup(base, t, { hash: 'hours' });
    await g.click('hoursOk');
    assert.ok(!g.doc.getElementById('suPartTimes'), kind);
    const r = await change(t, { visit_rows: { part_times: 'Lounge: winter only' } });
    assert.equal(r.status, 400, kind);
  }
  // A golf simulator place does see it.
  const { t } = await setUp(['simgolf'], { type: 'golf' });
  const g = await openSetup(base, t, { hash: 'hours' });
  await g.click('hoursOk');
  assert.ok(g.doc.getElementById('suPartTimes'));
});
