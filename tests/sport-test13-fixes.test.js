// Sport test 13 fixes (2026-11-21; Gord and Linda, owner-operators of Twin Lakes Golf Course & RV Park in Kaleden, sharing
// one phone; drafts/fresh-eyes-sport13-2026-11-21/REPORT.md):
//   1. Help answers only when sure (sport and golf places): a part of the place with its own dates (the RV park, the range,
//      the pro shop in December) is never the place's closures, season or hours; "still open… closures?" is never a
//      closure; plus tax is the tax answer; a drink named is never "no alcohol"; a weak match for an answer that would
//      change the place's own closures, season, Free entry or main price is "I'm not sure" with Ask us. Their 22
//      questions all land well, none harmful.
//   2. Build My Trip: a Good to know line about a part of the place never changes the place's planned season (the owner's
//      own season wins; research's description is read sentence by sentence without the parts' sentences): every sport kind.
//   3. An unverified place with no hours never takes a timed stop from an owner-set-up place of its kind in the same or the
//      next town; "Places that fit" lists put the owner-set-up places of the asked kind first.
//   4. Search: a sport or golf search for one town takes in the towns around it (the town's own first); "rv park",
//      "golf rv" and « golf et camping VR » find a place whose name or own lines say RV park; "driving range" finds a
//      course whose owner picked the range kind or tapped "Driving range on site"; « sud de l'Okanagan » is the south towns.
//   5. The French prices page says « Droits de jeu » for the editor's own "Green fees"; a typed list's details are queued
//      for French with its names.
//   6. Polish: the price editor's Help is a small "?" while a line is open; a chip shows as picked only when tapped or
//      exactly the chip; the French story screen's line is in French first; the hours editor opens no day; the Value index
//      reads At a glance's facilities.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test13-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const planner = require('../trip-planner.js');
const { SRC, Q } = require('./help-sport13-questions.js');
const F = require('./sport13-fixture.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0, twin, hood, twinT;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  twin = F.twinLakes(app, db); hood = F.neighbours(app);
  twinT = app.createOwnerLink(twin.id, {}).url.split('/owner/')[1];
  if (app.clearVenueCaches) app.clearVenueCaches();
});
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['08:00', '18:00']]]));
const ip = () => `10.133.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
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
  return app.createVenue({ name: o.name || `Sport Thirteen ${n}`, slug: o.slug || `sport-thirteen-${n}`, region: o.region || 'peachland', type: o.type || 'golf', latitude: o.lat || 49.77 + n / 4000, longitude: o.lng || -119.73,
    address: `${n} Beach Ave`, website: `https://thirteen-${n}.example.com/`, hours: o.hours === null ? null : JSON.stringify(WK), description: o.description || 'A fixture for sport test 13.', description_fr: 'Un lieu de test.',
    ...(o.extra || {}) });
}
async function setUp(kinds, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (o.season) await ok(change(t, { hours: WK, open_months: o.season })); else await ok(change(t, { hours: WK }));
  await ok(change(t, { indoor_info: { kinds, length: o.length || '1-2h', book: o.book || 'busy', year: o.season ? 'seasonal' : 'all' }, indoor_price: o.price || 40 }));
  if (o.gtk) await ok(change(t, { visit_rows: { good_to_know: o.gtk } }));
  db.prepare("UPDATE venues SET hours_source = 'venue_owner' WHERE id = ?").run(v.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, t };
}
const NAMES = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || [])].filter((x) => x && x.venue).map((x) => x.venue.name);
const RECS = (p) => (p.recommendations || []).map((x) => (x.venue ? x.venue.name : x.name)).filter(Boolean);
const ALL = (p) => NAMES(p).concat(RECS(p));
async function searchNames(q, fr) {
  const html = (await getText(`${fr ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`)).replace(/<script[\s\S]*?<\/script>/g, '');
  const names = [twin.name, ...hood.map((v) => v.name)];
  return names.map((x) => [x, html.indexOf(`>${x.replace(/&/g, '&amp;').replace(/'/g, '&#39;')}`)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

test('1. Help: Gord and Linda\'s 22 questions land well, none harmful; only-when-sure on a weak match', async () => {
  const t = twinT;
  void SRC;
  const bots = {};
  for (const [page, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[page] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const bad = [];
  for (const [, page, lang, q, okIds, harm] of Q) {
    const r = bots[page][lang].best(q);
    if (r.id && harm.includes(r.id)) bad.push(`HARM "${q}" -> ${r.id}`);
    else if (!(r.id ? okIds.includes(r.id) : okIds.includes('UNSURE') || r.hits.slice(0, 3).some((x) => okIds.includes(x)))) bad.push(`"${q}" -> ${r.id || 'not sure'} (wants ${okIds.join(' / ')})`);
  }
  assert.deepEqual(bad, []);
  const S = bots.setup.en, E = bots.edit.en;
  // A part of the place, any way it's said: never the place's closures, season or hours.
  for (const q of ['Range opens mid-April, do I put that as our opening day?', 'the patio is open May to September, where does that go', 'Our campground opens May 1. Do I change our season?', 'the bistro closes at 3 in October, is that our hours?']) {
    const r = S.best(q);
    assert.ok(!r.id || !/^(?:closures|setup-short-closure|sport-one-off-closure|indoor-closed-months|sport-season|season|indoor-seasonal|hours|seasonal-hours|year-round|sport-opening-day)$/.test(r.id), `${q} -> ${r.id}`);
  }
  // "Still open" is never a closure.
  assert.notEqual(S.best('We are still open to the public on member day. Do I put it in closures?').id, 'closures');
  // A drink named is never "we don't serve alcohol".
  assert.notEqual(S.best('no happy hour but we have cold draft beer and wine on the patio, does that go here').id, 'sport-no-bar');
  // Only when sure: a weak match for a main-price answer is Ask us, with up to 3 topics to tap.
  const weak = S.best('is it ok to put the price? our rates are in the fees bylaw');
  assert.equal(weak.id, null); assert.ok(weak.hits.length >= 1);
  // The answers they needed.
  assert.match(E.answer('staff'), /Two of you on one phone/);
  assert.match(S.answer('sport-tournaments'), /Still open to the public[^<]*<\/?[a-z]*>?[^<]*Don’t add a closure|Don’t add a closure/);
  assert.match(E.answer('sport-golf-details'), /Yes, it changes: once your own prices are in/);
  assert.match(E.answer('sport-find-me'), /towns next to it/);
});

test('2. Build My Trip: a part\'s season line never changes the place\'s planned season (Twin Lakes, and every sport kind)', async () => {
  for (const q of ['golf in Kaleden on Thursday September 30 2027', 'golf in Kaleden on Thursday April 15 2027', 'golf near Penticton on Thanksgiving Monday October 11 2027']) {
    assert.ok(ALL(app.runTripPlan({ text: q }, NOV)).includes(twin.name), q);
  }
  // Out of their own season it stays out.
  assert.ok(!ALL(app.runTripPlan({ text: 'golf in Kaleden on Saturday October 23 2027' }, NOV)).includes(twin.name));
  // Research's own words still count for a place nobody set up; a sentence about a part of the place doesn't.
  assert.equal(planner.seasonSentences('Golf season runs April to October. RV park open late April to mid September. The patio is open May to September.'), 'golf season runs april to october');
  // Sweep: each kind, its owner's season, and a Good to know line about a part with other months.
  const KINDS = [['golf', 'golf', 'golf', '04-01:10-15', 'RV park open late April to mid September.', 'Thursday September 30 2027', 'osoyoos'],
    ['range', 'golf', 'driving range', '04-01:10-31', 'Patio open May to mid August.', 'Thursday September 16 2027', 'oliver'],
    ['discgolf', 'sport', 'disc golf', '04-01:11-15', 'Clubhouse cafe open June to August.', 'Wednesday October 20 2027', 'summerland'],
    ['rink', 'sport', 'public skating', '10-15:03-31', 'Patio open May to September.', 'Saturday January 15 2028', 'naramata'],
    ['skatepark', 'sport', 'skate park', '03-15:11-15', 'Snack bar open July to August.', 'Sunday October 10 2027', 'okanagan-falls']];
  for (const [kind, type, ask, season, gtk, when, region] of KINDS) {
    const { v } = await setUp([kind], { type, region, season, gtk, name: `Owner ${kind} T13`, lat: 49.2 + ipN / 1000 });
    const town = { osoyoos: 'Osoyoos', oliver: 'Oliver', summerland: 'Summerland', naramata: 'Naramata', 'okanagan-falls': 'Okanagan Falls' }[region];
    const p = app.runTripPlan({ text: `${ask} in ${town} on ${when}` }, NOV);
    assert.ok(ALL(p).includes(v.name), `${kind}: ${ALL(p).join(' | ')}`);
  }
});

test('3. timed stops and "Places that fit": the owner-set-up course before unverified ones with no hours', () => {
  for (const q of ['tee time in the morning then dinner in Kaleden on Friday July 16 2027', 'un départ le matin puis un souper à Kaleden le vendredi 16 juillet 2027']) {
    const golf = NAMES(app.runTripPlan({ text: q }, NOV)).filter((x) => /Golf|Lakes|Andrews/.test(x));
    assert.equal(golf[0], twin.name, `${q}: ${golf.join(' | ')}`);
  }
  for (const q of ['golf in Kaleden on Saturday July 17 2027', 'golf with my kids 10 and 13 near Penticton on Saturday July 17 2027', 'golf lessons near Penticton on Saturday June 5 2027']) {
    assert.equal(RECS(app.runTripPlan({ text: q }, NOV))[0], twin.name, q);
  }
});

test('4. search: the towns around one town for sport and golf; RV park; driving range; « sud de l\'Okanagan »', async () => {
  for (const [q, fr] of [['golf penticton'], ['golf penticton', true], ['golf lessons penticton']]) {
    const got = await searchNames(q, fr);
    assert.ok(got.includes(twin.name), `${q}: ${got.join(' | ')}`);
    const pent = got.filter((x) => hood.some((v) => v.name === x && v.region === 'penticton'));
    assert.ok(pent.length && got.indexOf(pent[pent.length - 1]) < got.indexOf(twin.name), `the town's own first: ${got.join(' | ')}`);
  }
  for (const q of ['rv park', 'golf rv', 'golf and rv park', 'golf rv park penticton', 'rv camping golf']) assert.ok((await searchNames(q)).includes(twin.name), q);
  assert.ok((await searchNames('golf et camping VR', true)).includes(twin.name));
  assert.ok((await searchNames('driving range')).includes(twin.name), 'his "Driving range on site"');
  const { v: both } = await setUp(['golf', 'range'], { region: 'oliver', name: 'Owner Course And Range T13', description: 'An 18-hole course with a driving range.' });
  assert.ok((await getText(`/search?q=${encodeURIComponent('driving range')}`)).includes(`>${both.name}`), 'a course whose owner picked the range kind');
  // The hub pages keep their own list.
  assert.doesNotMatch(await getText('/penticton/golf'), /Twin Lakes Golf Course and RV Park/);
  // Build My Trip in French: the south of the Okanagan is its towns.
  const p = app.runTripPlan({ text: 'golf puis un 5 à 7 dans le sud de l\'Okanagan le samedi 17 juillet 2027', lang: 'fr' }, NOV);
  assert.doesNotMatch(JSON.stringify(p.summary || ''), /sud”|Kelowna/);
});

test('5. the French prices page: « Droits de jeu »; a typed list\'s details are queued for French', async () => {
  const fr = await getText(`/fr/${twin.region}/golf/${twin.slug}/prices`);
  if (!/<h2>Green fees<\/h2>|<h2>Droits de jeu<\/h2>/.test(fr)) return assert.fail('prices page has the section');
  assert.match(fr, /<h2>Droits de jeu<\/h2>/); assert.doesNotMatch(fr, /<h2>Green fees<\/h2>/);
  assert.match(await getText(`/${twin.region}/golf/${twin.slug}/prices`), /<h2>Green fees<\/h2>/);
  const { v } = await setUp(['golf'], { region: 'oliver', name: 'Owner Prices T13' });
  assert.ok(app.queueFrPriceNames(v.id, { sections: [{ name: 'Green fees', items: [{ name: '9 holes', description: 'Open to 4 pm', price: '47' }, { name: '18 holes weekday', description: 'Mon to Thu, prime time', price: '79' }] }] }));
  const item = db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id);
  assert.match(item.help_note, /Prices: 9 holes \| 18 holes weekday/);
  assert.match(item.help_note, /Price details: Open to 4 pm \| Mon to Thu, prime time/);
  assert.doesNotMatch(item.help_note, /Prices: Green fees/);
});

test('6. polish: Help clear of Delete; chips picked only when tapped or exact; French story line; no day opened; Value index', async () => {
  const t = twinT;
  const menu = await getText(`/owner/${t}/menu`);
  assert.match(menu, /body\.owner-page:has\(\.mn-open\) \.ohb-btn \{ width: 44px/);
  assert.match(menu, /\.mn-open \.mn-row \{ justify-content: flex-start/);
  // Their own sentence starting "Pro shop open Tue and Thu…" doesn't light the "Pro shop" chip.
  const g = await openSetup(base, t, { hash: 'bring' });
  const chip = g.doc.querySelectorAll ? [...g.doc.querySelectorAll('[data-quick]')].find((c) => c.getAttribute('data-quick') === 'Pro shop') : null;
  assert.ok(chip, 'the Pro shop chip is offered'); assert.equal(chip.getAttribute('aria-pressed'), 'false');
  const range = g.doc.querySelectorAll ? [...g.doc.querySelectorAll('[data-quick]')].find((c) => c.getAttribute('data-quick') === 'Driving range on site') : null;
  assert.ok(range); assert.equal(range.getAttribute('aria-pressed'), 'true', 'a sentence that is exactly the chip');
  // The French story screen's line is in French first.
  const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(CLIENT, /var fr = T\.frDescEnLead && T\.frDescEnLead !== E\.lead/);
  // The hours editor opens no day.
  assert.doesNotMatch(CLIENT, /S\.hoursOpen = \{\}; if \(!DAYS\.some\(function\(d\)\{ return S\.week\[d\]; \}\)\) S\.hoursOpen\.mon = true;/);
  // The Value index reads At a glance's facilities (a course nobody has set up yet).
  const d = app.golfDetailsFor ? app.golfDetailsFor([{ region: 'kaleden', slug: 'twin-lakes-golf-course', type: 'golf' }]).get('kaleden/twin-lakes-golf-course') : null;
  assert.ok(d); assert.equal(d.facilities.driving_range, 1);
});
