// Tour setup simplify (Dayton, 2026-11-18: "we want to keep this nice and easy for businesses to do and not overwhelming
// for them. if its overwhelming they will give up"). On the tour hours and season screens the three ticks fold under one
// link, "Anything else about your season?" (open when one is on); the third stretch sits behind "More options"; holidays
// and closures leave Part 1 and become an optional tile in Part 2, "Closures and holidays". Nothing is deleted (the edit
// page keeps them all), saved closures keep working, other types are unchanged, and Help names the new link and tile.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-simplify-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } return ''; };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const mk = (type, o = {}) => app.createVenue({ name: `Simplify ${++n}`, slug: `tour-simplify-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  address: `${600 + n} Main St, Whistler`, phone: '604-555-0166', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')), description: 'A fixture used only by the tour simplify tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
const get = (p) => fetch(base + p, { headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then((r) => r.text());
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const h = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('closures and holidays leave Part 1 for tours and become the last optional tile; other types keep them in the Hours step', async () => {
  const tour = app.setupParts('tour');
  assert.deepEqual(tour.part1, ['basics', 'hours', 'tour', 'price', 'booking', 'offer', 'photos'], 'Part 1 stays the 7 essentials (Step N of 7)');
  assert.deepEqual(tour.part2, ['menu', 'story', 'bring', 'groups', 'social', 'closures']);
  const v = mk('tour', { name: 'Simplify Snowshoe Tours', cuisine: 'Snowshoe tours' });
  const t = tokenFor(v.id);
  const c = cfgOf(await get(`/owner/${t}/setup`));
  assert.equal(c.closuresTile, true);
  assert.equal(c.combo, true, 'Instagram and Facebook stay one screen');
  assert.ok(c.part2.includes('closures') && !c.part1.includes('closures'));
  assert.equal(c.t.labels.closures, 'Closures and holidays');
  assert.equal(c.t.tFold, 'Anything else about your season?');
  assert.equal(c.t.seaMore, 'More options');
  const cf = cfgOf(await get(`/fr/owner/${t}/setup`));
  assert.equal(cf.t.labels.closures, 'Fermetures et jours fériés');
  assert.match(cf.t.tFold, /^Autre chose sur votre saison\s\?$/);
  assert.equal(cf.t.seaMore, 'Plus d’options');
  // The other combo types: unchanged (closures end the Hours step).
  for (const type of ['cafe', 'winery', 'brewery', 'distillery', 'cocktail']) {
    const x = mk(type);
    const cx = cfgOf(await get(`/owner/${tokenFor(x.id)}/setup`));
    assert.ok(!cx.closuresTile, `${type}: no closures tile`);
    assert.ok(!cx.part2.includes('closures'), `${type}: closures not in Part 2`);
  }
  // Restaurants and pubs keep closures as a Part 1 step.
  assert.ok(app.setupParts('restaurant').part1.includes('closures'));
  assert.ok(app.setupParts('pub').part1.includes('closures'));
});

test('a tour with its hours saved and no closures answer has its essentials done (closures are optional now)', async () => {
  const v = mk('tour');
  for (const k of ['basics', 'hours', 'tour', 'price', 'booking', 'offer', 'photos']) app.saveSetupProgress(v.id, k, 'live');
  assert.equal(app.setupState(v.id), 'essentials', 'Hours counts as done without the closures screen');
  app.saveSetupProgress(v.id, 'closures', 'skip');
  assert.equal(app.setupState(v.id), 'essentials');
  // A café still needs its holidays part for the Hours step to count.
  const c = mk('cafe');
  for (const k of app.setupParts('cafe').part1) app.saveSetupProgress(c.id, k, 'live');
  assert.equal(app.setupState(c.id), 'partial');
  app.saveSetupProgress(c.id, 'closures', 'no');
  assert.equal(app.setupState(c.id), 'essentials');
});

test('the completeness score has no closures item for tours, so skipping the tile costs nothing', () => {
  const items = pc.itemsFor('tour');
  assert.equal(items.reduce((a, i) => a + i.w, 0), 100);
  assert.ok(!items.some((i) => /closure|holiday/.test(i.key) || (i.fields || []).includes('closures') || (i.target && i.target.setup === 'closures')), 'no tour item points at the closures screen');
});

test('the client: a tour\'s hours go on to the next essential, and the closures tile goes back to the extra details', () => {
  const src = ['sub', 'stepOf', 'half', 'fin', 'allDone', 'inP2', 'nextOf', 'firstOpen'].map((x) => fnBody(CLIENT, x)).join('\n');
  const nav = (closuresTile, part1, part2, done) => new Function('C', 'S', 'P1', 'P2', 'STEPS', 'tapOnly', `var COMBO = true; var CLO_SUB = COMBO && !C.closuresTile;\n${src}\nreturn { nextOf, firstOpen, stepOf, half };`)({ closuresTile }, { done }, part1, part2, part1.concat(part2), () => false);
  const T1 = app.setupParts('tour');
  const tour = nav(true, T1.part1, T1.part2, { basics: 'live', hours: 'live' });
  assert.equal(tour.nextOf('hours'), 'tour', 'hours → What you offer (no closures screen in between)');
  assert.equal(tour.stepOf('closures'), 'closures');
  assert.equal(tour.nextOf('closures'), 'more', 'the closures tile goes back to More about your tours');
  assert.equal(tour.firstOpen(), 'tour', 'carry on: the next essential, not the holidays');
  assert.equal(tour.half('hours'), false);
  const C1 = app.setupParts('cafe');
  const cafe = nav(false, C1.part1, C1.part2, { basics: 'live', hours: 'live' });
  assert.equal(cafe.nextOf('hours'), 'closures', 'cafés unchanged');
  assert.equal(cafe.firstOpen(), 'closures');
  // The saves after the hours go to the closures only where they are part of the Hours step.
  assert.match(CLIENT, /KITCHEN_Q \? 'hours:kitchen' : CLO_SUB \? 'closures' : null/);
  assert.match(CLIENT, /T\.yearNoSetQ \? 'hours:year' : CLO_SUB \? 'closures' : null/);
  assert.match(CLIENT, /if \(TOUR\) \{[^}]*P2_ICONS\.closures = /);
});

test('the three season ticks fold under "Anything else about your season?" (a button with aria-expanded), open when one is on', () => {
  const src = ['tticks', 'tticksHtml', 'tfoldOpen'].map((x) => fnBody(CLIENT, x)).join('\n');
  const T = text.en.tour;
  const run = (S, TI) => new Function('S', 'T', 'TI', 'h', `var TOUR = true;\n${src}\nreturn tticksHtml;`)(S, T, TI, h);
  // Closed: one link, no ticks on the screen.
  let html = run({}, {})(true);
  assert.match(html, /<button type="button" class="su-link" id="suTfold" aria-expanded="false" data-act="tfold:1"[^>]*>Anything else about your season\?<\/button>/);
  assert.doesNotMatch(html, /suTick_/);
  // A tick already saved: open, with all three ticks (the part-of-the-year screen).
  html = run({}, { snow_open: true })(true);
  assert.match(html, /aria-expanded="true" aria-controls="suSeaTicks"/);
  for (const k of ['weather_all', 'off_request', 'snow_open']) assert.match(html, new RegExp(`id="suTick_${k}" aria-pressed="${k === 'snow_open'}"`));
  assert.match(html, /role="group" aria-label="Also true for your trips"/);
  // By booking only, all year: only "Every trip is weather permitting" (and an off-season tick on doesn't open it there).
  html = run({}, { off_request: true })(false);
  assert.match(html, /aria-expanded="false"/);
  html = run({ tfold: true }, {})(false);
  assert.match(html, /id="suTick_weather_all"/);
  assert.doesNotMatch(html, /suTick_off_request|suTick_snow_open/);
  // Opened (or closed) by the owner: the link follows the tap.
  assert.match(run({ tfold: false }, { weather_all: true })(true), /aria-expanded="false"/);
  // The link opens in place (the same screen redrawn, focus back on the link), and a tick keeps it open.
  assert.match(CLIENT, /if \(k === 'tfold'\) \{ S\.tfold = !tfoldOpen\(v === '1'\); var fy = window\.scrollY; render\(\); window\.scrollTo\(0, fy\); var fb = el\('suTfold'\); if \(fb\) fb\.focus\(\); return; \}/);
  assert.match(CLIENT, /if \(k === 'tourTick'\) \{ var tk0 = tticks\(\); tk0\[v\] = !tk0\[v\]; if \(S\.tfold == null\) S\.tfold = true;/);
  // The ticks still save with the screen's answer (unchanged).
  const part = new Function('S', 'TI', `var TOUR = true;\n${fnBody(CLIENT, 'tticksPart')}\nreturn tticksPart;`)({ tticks: { weather_all: true, off_request: false, snow_open: true } }, {});
  assert.deepEqual(part(true), { tour_info: { weather_all: true, snow_open: true } });
  // Another type never shows them.
  assert.equal(new Function('S', 'T', 'TI', 'h', `var TOUR = false;\n${src}\nreturn tticksHtml;`)({}, T, {}, h)(true), '');
});

test('the third stretch sits behind "More options"; two stretches look as before, and a saved third shows', () => {
  const more = new Function('S', 'T', 'h', `${fnBody(CLIENT, 'seaMoreHtml')}\nreturn seaMoreHtml;`);
  const T = text.en.tour;
  assert.equal(more({}, T, h)('<b>x</b>'), '<div class="su-skip su-seamore"><button type="button" class="su-link" id="suSeaMore" aria-expanded="false" data-act="seaMore">More options</button></div>');
  assert.match(more({ seaMore: true }, T, h)('<b>x</b>'), /aria-expanded="true" aria-controls="suSeaMoreBox" data-act="seaMore">More options<\/button><\/div><div id="suSeaMoreBox"><b>x<\/b><\/div>$/);
  const wrap = new Function('S', 'T', 'h', `${fnBody(CLIENT, 'seaMoreHtml')}\n${fnBody(CLIENT, 'seaMoreWrap')}\nreturn seaMoreWrap;`);
  assert.match(wrap({}, T, h)(true, '<b>3rd</b>'), /^<div class="su-skip su-seamore">.*More options<\/button><\/div>$/, 'third: tucked away');
  assert.equal(wrap({}, T, h)(false, '<b>2nd</b>'), '<b>2nd</b>', 'second stretch: as before');
  assert.equal(wrap({}, T, h)(true, ''), '', 'nothing to add (a third already saved): no link');
  assert.equal(wrap({}, text.en, h)(true, '<b>3rd</b>'), '<b>3rd</b>', 'other types: as before');
  // On the second stretch's screen (seaI >= 1) and on "Are these your hours all year?" with two stored.
  assert.match(CLIENT, /\+ seaMoreWrap\(S\.seaI >= 1, \(seas && S\.seaI === S\.seaList\.length - 1 && S\.seaList\.length < SEA_MAX && T\.seaAddLink \? /);
  assert.match(CLIENT, /\+ seaMoreWrap\(stS\.length > 1, \(stS\.length < SEA_MAX && S\.seaList\.length < SEA_MAX && T\.seaAdd \? big\('🍂'/);
  assert.ok(!text.en.seaMore && !text.fr.seaMore, 'only tours have "More options"');
});

test('saved holidays and closures keep working for a tour (the page still says Closed, the tile shows them)', async () => {
  const v = mk('tour', { name: 'Simplify Ziplines' });
  db.prepare('INSERT OR REPLACE INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id, '[]', JSON.stringify([{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }]));
  app.clearHoursExtraCache();
  const c = cfgOf(await get(`/owner/${tokenFor(v.id)}/setup`));
  assert.ok(JSON.stringify(c).includes('2026-12-25'), 'the closures screen gets the saved closure');
  const page = app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en', now: new Date('2026-12-25T12:00:00-08:00') });
  assert.match(page, /Closed/);
});

test('Help names the new link and tile, EN and FR', async () => {
  const v = mk('tour');
  const t = tokenFor(v.id);
  const en = helpBot(await get(`/owner/${t}/setup`)), fr = helpBot(await get(`/fr/owner/${t}/setup`));
  for (const id of ['tour-snow-open', 'tour-off-request', 'tour-weather-all']) {
    assert.match(en.topic(id).a, /<strong>Anything else about your season\?<\/strong>/, id);
    assert.match(fr.topic(id).aFr || fr.topic(id).a, /<strong>Autre chose sur votre saison\s?\?<\/strong>/, id);
  }
  assert.match(en.topic('setup-season').a, /Opening day depends on snow\? On that screen, tap <strong>Anything else about your season\?<\/strong>/);
  for (const id of ['tour-weather', 'tour-season', 'tour-course-dates', 'tour-yearly-break', 'setup-closure-fix']) {
    assert.match(en.topic(id).a, /<strong>Closures and holidays<\/strong>,? \(?in <strong>More about your tours<\/strong>/, id);
    assert.doesNotMatch(en.topic(id).a, /Holidays &amp; closures/, id);
    assert.match(fr.topic(id).aFr || fr.topic(id).a, /<strong>Fermetures et jours fériés<\/strong>,? \(?dans <strong>Plus de détails sur votre entreprise<\/strong>/, id);
  }
  assert.doesNotMatch(en.topic('tour-weather').a, /in <strong>When you run<\/strong>\. Dates/);
  assert.match(en.topic('hours-third-stretch').a, /tap <strong>More options<\/strong> to see it/);
  assert.match(en.topic('closures').a, /Right here in setup: <strong>Closures and holidays<\/strong>, under <strong>More about your tours<\/strong>/);
  assert.doesNotMatch(en.topic('closures').a, /After your hours comes/);
  // A café's answers are unchanged.
  const c = mk('cafe');
  const ce = helpBot(await get(`/owner/${tokenFor(c.id)}/setup`));
  assert.match(ce.topic('closures').a, /After your hours comes <strong>Holidays and closures<\/strong>/);
  assert.doesNotMatch(ce.topic('hours-third-stretch').a, /More options/);
  // Questions still land on these answers.
  assert.equal(en.best('opening day depends on snow').id, 'tour-snow-open');
  assert.equal(en.best('how do i add a holiday we are closed').id, 'closures');
});
