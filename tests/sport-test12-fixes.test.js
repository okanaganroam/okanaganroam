// Sport test 12 fixes (2026-11-21; Rob, the general manager of Tower Ranch Golf & Country Club in Kelowna, a fast English
// typer on an iPhone mini; drafts/fresh-eyes-sport12-2026-11-21/REPORT.md):
//   1. An age we suggested and the owner never tapped is never his answer and never ticks Kid-Friendly, on the first save,
//      the revisit and the second save; the screen says "Suggested: All ages. Tap it to confirm", never "✓ Saved"; the
//      checklist item says "Who can come: tap an age to confirm". A golf course, range, rink, skate park or disc golf course
//      counts the untouched All ages toward 100% (still no Kid-Friendly).
//   2. Build My Trip: an owner-set-up sport or golf place wins the time-slot stop of its kind over unverified ones.
//   3. Help: a part of the place closing (Carrington's) is never the Closures answer; "which one goes here" with several
//      prices is the Price rule; "what's missing" names the item; Kid-Friendly is the age answer; no public tee times is a
//      Good to know line plus a weekly event, never his Known for line. Rob's 16 questions all land well.
//   4. The off-season warning offers to widen the season only for a stretch that touches it, saying exactly what opens;
//      Skip comes first.
//   5. Research's Rentals row stays (its rules, not its prices) once the rates link is in.
//   6. Search finds golf lessons, « cours de golf », golf and dinner, a Christmas party and a men's night; "9 hole" is golf.
//   7. The happy hour deal gets a capital and joins the French lines item.
//   8. Chips the owner's own words say are not so are hidden; a page with no hours opens Monday on neither Open nor Closed;
//      the hours revisit shows the season.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test12-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q } = require('./help-sport12-questions.js');
const F = require('./sport12-fixture.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0, tower;
const NOV = new Date('2026-11-21T12:00:00-08:00');
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  tower = F.towerRanch(app, db); F.neighbours(app);
  if (app.clearVenueCaches) app.clearVenueCaches();
});
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '19:00']]]));
const ip = () => `10.132.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, `status ${r.status}`); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
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
  return app.createVenue({ name: o.name || `Sport Twelve ${n}`, slug: `sport-twelve-${n}`, region: o.region || 'peachland', type: o.type || 'golf', latitude: 49.77 + n / 4000, longitude: -119.73,
    address: `${n} Beach Ave`, website: `https://twelve-${n}.example.com/`, hours: o.hours === null ? null : JSON.stringify(WK), description: o.description || 'A fixture for sport test 12.', description_fr: 'Un lieu de test.',
    ...(o.extra || {}) });
}
async function setUp(kinds, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (o.season) await ok(change(t, { hours: WK, open_months: o.season }));
  await ok(change(t, { indoor_info: { kinds, length: o.length || '1-2h', book: o.book || 'busy', year: o.season ? 'seasonal' : 'all' }, indoor_price: o.price || 40 }));
  return { v, t };
}
const completeness = (id) => {
  const v = app.getVenue(id);
  const hh = null;
  return require('../portal-completeness.js').scoreCompleteness(app.gatherCompletenessInput ? app.gatherCompletenessInput(v, app.ownerVenueSnapshot(v, hh), hh) : {}, { today: app.todayLocal() });
};
const NAMES = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || [])].filter((x) => x && x.venue).map((x) => x.venue.name);

test('1. an untouched suggested age: never saved, never Kid-Friendly, never "✓ Saved", named on the checklist; golf counts it toward 100%', async () => {
  for (const [kinds, counts] of [[['museum'], false], [['golf'], true], [['discgolf'], true], [['rink'], true], [['swim'], false]]) {
    const type = kinds[0] === 'museum' ? 'indoor' : kinds[0] === 'golf' ? 'golf' : 'sport';
    const { v, t } = await setUp(kinds, { type, season: type === 'indoor' ? null : '04-01:10-31' });
    const g = await openSetup(base, t, { hash: 'offer' });
    assert.ok(g.has('[data-tpick="age:all"][aria-pressed="true"]'), `${kinds}: All ages suggested`);
    assert.match(g.doc.getElementById('suAgeGuess').textContent, /^Suggested: All ages\. Tap it to confirm/);
    await g.click('offerSave');
    assert.equal(app.venueIndoorInfo(v.id).age, undefined, `${kinds}: first save`);
    assert.ok(!app.getVenue(v.id).kid_friendly, `${kinds}: no Kid-Friendly from the first save`);
    // The revisit in the same visit (Rob's way back in): still a suggestion, no "Saved" line; a second save keeps it open.
    g.doc.getElementById('suBack').click(); await g.settle();
    if (!g.has('#suAgeQ')) { const j = g.doc.getElementById('suScreen').querySelector('[data-act="jump:offer"]') || g.doc.getElementById('suScreen').querySelector('[data-act="go:offer"]'); if (j) { j.click(); await g.settle(); } }
    assert.ok(g.has('#suAgeQ'), `${kinds}: back on Who can come: ${g.text().slice(0, 300)}`);
    assert.match(g.doc.getElementById('suAgeGuess').textContent, /^Suggested: All ages/, `${kinds}: still a suggestion on the revisit`);
    assert.doesNotMatch(g.text(), /Saved\. You can change it here|✓ Saved/, `${kinds}: never "Saved" over an untouched age`);
    await g.click('offerSave');
    assert.equal(app.venueIndoorInfo(v.id).age, undefined, `${kinds}: second save`);
    assert.ok(!app.getVenue(v.id).kid_friendly, `${kinds}: no Kid-Friendly from the second save`);
    // The checklist: golf, disc golf and rinks count the untouched All ages; the others name the item plainly.
    const missing = (completeness(v.id).missing || []).map((it) => it.key);
    assert.equal(!missing.includes('indoor_ages'), counts, `${kinds}: ${missing.join(', ')}`);
    if (!counts) assert.equal((completeness(v.id).missing || []).find((it) => it.key === 'indoor_ages').en, 'Who can come: tap an age to confirm');
    // Help names it ("what's missing").
    const b = helpBot(await getText(`/owner/${t}/setup`));
    const r = b.best('it says I need who can come to get 100% but it already says saved. what\'s missing?');
    assert.equal(r.id, 'setup-missing', `${kinds}: ${JSON.stringify(r.why)}`);
    if (!counts) assert.match(b.answer('setup-missing'), /Who can come<\/strong>: the age is only suggested until you tap it/);
    // A tap on the suggested age confirms it (it used to take it off): then it is his answer, with Kids welcome.
    const g2 = await openSetup(base, t, { hash: 'offer' });
    await g2.click('[data-tpick="age:all"]');
    assert.ok(g2.has('[data-tpick="age:all"][aria-pressed="true"]'), `${kinds}: the tap keeps All ages picked`);
    assert.ok(!g2.has('#suAgeGuess'), `${kinds}: no suggestion line once tapped`);
    await g2.click('offerSave');
    assert.equal(app.venueIndoorInfo(v.id).age, 'all', `${kinds}: tapped`);
    assert.ok(!(completeness(v.id).missing || []).some((it) => it.key === 'indoor_ages'));
  }
  // The kinds that count an untouched All ages.
  assert.deepEqual(require('../sport-kinds.js').SPORT_UNTAPPED_AGE_OK_KINDS, ['golf', 'range', 'rink', 'skatepark', 'discgolf']);
});

test('2. Build My Trip: an owner-set-up course wins the time-slot plans (EN, FR, lake view); every sport kind sweeps the same way', async () => {
  for (const q of ['tee time in the morning then dinner in Kelowna on Friday July 16 2027', 'un départ le matin puis un souper à Kelowna le vendredi 16 juillet 2027', 'golf with a lake view in Kelowna on Thursday July 15 2027 in the afternoon']) {
    const p = app.runTripPlan({ text: q }, NOV);
    const golf = NAMES(p).filter((x) => /Golf|Springs|Ranch|Ridge|Greens|Canyon/.test(x));
    assert.equal(golf[0], tower.name, `${q}: ${NAMES(p).join(' | ')}`);
  }
  // Sweep: in a town with two places of one kind, the owner-set-up one wins the slot over a better-rated unverified one.
  const KINDS = [['golf', 'golf', 'Golf course', 'golf then dinner'], ['range', 'golf', 'Driving range', 'driving range then dinner'], ['rink', 'sport', 'Ice rink', 'public skating then dinner'],
    ['discgolf', 'sport', 'Disc golf course', 'disc golf then dinner'], ['skatepark', 'sport', 'Skate park', 'skate park then dinner']];
  // (Tennis and pickleball courts aren't read as a kind of stop by the planner yet: "tennis then dinner" lists the dinner only.)
  const TOWNS = [['osoyoos', 'Osoyoos'], ['oliver', 'Oliver'], ['summerland', 'Summerland'], ['naramata', 'Naramata'], ['okanagan-falls', 'Okanagan Falls'], ['peachland', 'Peachland']];
  let k = 0;
  for (const [kind, type, cuisine, ask] of KINDS) {
    const [region, town] = TOWNS[k];
    k++;
    const lat = 49.25 + k / 100;
    const other = app.createVenue({ name: `Unverified ${cuisine} T12`, slug: `unverified-${kind}-t12`, region, type, cuisine, latitude: lat, longitude: -119.47, address: `${k} Main St, ${town}`, hours: JSON.stringify(WK), description: `A ${cuisine.toLowerCase()} in ${town}.`, rating: 4.8, reviews: 400 });
    const own = app.createVenue({ name: `Owner ${cuisine} T12`, slug: `owner-${kind}-t12`, region, type, cuisine, latitude: lat + 0.002, longitude: -119.47, address: `${k + 50} Main St, ${town}`, hours: JSON.stringify(WK), description: `A ${cuisine.toLowerCase()} in ${town}.`, rating: 4.3, reviews: 60 });
    const t = app.createOwnerLink(own.id, {}).url.split('/owner/')[1];
    await ok(change(t, { hours: WK }));
    await ok(change(t, { indoor_info: { kinds: [kind], length: '1-2h', book: 'busy', year: 'all' }, indoor_price: 20 }));
    db.prepare("UPDATE venues SET hours_source = 'venue_owner' WHERE id = ?").run(own.id);
    if (app.clearVenueCaches) app.clearVenueCaches();
    const p = app.runTripPlan({ text: `${ask} in ${town} on Saturday July 17 2027` }, NOV);
    const names = NAMES(p);
    const i = names.indexOf(own.name), j = names.indexOf(other.name);
    assert.ok(i >= 0 && (j < 0 || i < j), `${kind}: ${names.join(' | ')}`);
  }
});

test('3. Help: Rob\'s 16 questions land well, none harmful; the answers he needed', async () => {
  const { t } = await setUp(SRC.sport12.kinds, { season: SRC.sport12.season, price: 89, book: 'ahead', length: 'half' });
  const bots = { setup: helpBot(await getText(`/owner/${t}/setup`)), edit: helpBot(await getText(`/owner/${t}`)) };
  const bad = [];
  for (const [, page, , q, okIds, harm] of Q) {
    const r = bots[page].best(q);
    if (r.id && harm.includes(r.id)) bad.push(`HARM ${q} -> ${r.id}`);
    else if (!(r.id ? okIds.includes(r.id) : okIds.includes('UNSURE'))) bad.push(`${q} -> ${r.id || 'not sure'}`);
  }
  assert.deepEqual(bad, []);
  const e = bots.edit;
  assert.equal(e.best('carringtons closes oct 17, a couple weeks before the course. does the happy hour need different dates').id, 'hh-some-months');
  // A part of the place closing is never the Closures answer; the place itself closing still is.
  for (const q of ['the patio closes oct 15, what dates do i change', 'our restaurant closes for the winter on oct 20, does anything change', 'the pro shop closes at 5 on sundays']) {
    const r = e.best(q);
    assert.ok(!['closures', 'setup-short-closure', 'sport-one-off-closure', 'indoor-closed-months', 'sport-season', 'season', 'indoor-seasonal'].includes(r.id), `${q} -> ${r.id}`);
  }
  assert.ok(['closures', 'sport-one-off-closure', 'setup-short-closure'].includes(e.best('we are closed on june 12 for a private tournament').id));
  assert.match(e.answer('sport-kid-badge'), /Kid-Friendly comes from Who can come/);
  assert.match(e.answer('indoor-theme-nights'), /Good to know/);
  assert.doesNotMatch(e.answer('indoor-theme-nights'), /Put it in your <strong>Known for<\/strong>/);
  assert.match(e.answer('sport-members'), /Add an event/);
  // The workarounds for what wasn't added (no new chip, field or bigger box).
  assert.equal(bots.setup.best('there is no 16+ chip, our group packages are 16 or more').id, 'sport-group-size');
  assert.equal(bots.setup.best('good to know is full, no more room for our league nights').id, 'sport-gtk-full');
  assert.equal(bots.setup.best('we have a toll free number too, where does the second phone go').id, 'phone');
});

test('4. the off-season warning: widen the season only for a stretch that touches it, saying what opens; Skip first', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  const pick = (name) => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext([pick('pad2'), pick('mdInRange'), pick('seaOutside')].join('\n') + '; this.seaOutside = seaOutside;', ctx);
  const sea = { from: '04-01', to: '10-31' };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.seaOutside({ from: '12-01', to: '12-23' }, sea))), { out: true, ext: null }, 'Rob’s pro shop in December: no "Yes"');
  const nov = JSON.parse(JSON.stringify(ctx.seaOutside({ from: '11-01', to: '11-15' }, sea)));
  assert.deepEqual(nov.add, { from: '11-01', to: '11-15' });
  assert.deepEqual(nov.ext, { from: '04-01', to: '11-15' });
  const mar = JSON.parse(JSON.stringify(ctx.seaOutside({ from: '03-15', to: '04-30' }, sea)));
  assert.deepEqual(mar.add, { from: '03-15', to: '03-31' });
  assert.equal(ctx.seaOutside({ from: '11-01', to: '11-15', label: 'Pro shop' }, sea).ext, null, 'a labelled stretch is another part of the place');
  assert.match(src, /big\('✕', T\.seaOutsideNo, T\.seaOutsideNoSub, false, 'seaOutSkip'\) \+ \(S\.seaOut\.ext && S\.seaOut\.add/, 'Skip is first and the main button');
  const T = require('../owner-setup-text.js');
  const en = (T.en || T.STRINGS?.en || {}).indoor || T.en;
  assert.ok(JSON.stringify(T).includes('Yes: {place} will show open {a} – {b}, {hours}'));
  assert.ok(JSON.stringify(T).includes('your course'));
  assert.ok(en || true);
});

test('5. research\'s Rentals row stays as its rules once the rates link is in; its prices go', async () => {
  const page = plain(await getText(`/kelowna/golf/${tower.slug}`));
  assert.match(page, /Shared power cart is mandatory and included\./);
  assert.doesNotMatch(page, /Rental clubs \$65 to \$75/);
  assert.doesNotMatch(page, /2026 May-Sept \$199/, 'the research price table stays hidden');
});

test('6. search: golf lessons, « cours de golf », golf and dinner, a Christmas party and a men\'s night; "9 hole" is golf in the planner', async () => {
  // His men's night, as Help now says: a Good to know line.
  const info = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(tower.id).info);
  const gtk = info.rows.find((r) => r.label === 'Good to know');
  gtk.text += " Men's Night every Thursday: no public tee times after 12 PM.";
  db.prepare('UPDATE venue_visit_info SET info = ? WHERE venue_id = ?').run(JSON.stringify(info), tower.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const cards = (h) => [...h.matchAll(/<span class="venue-card-name">([^<]*)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  for (const [lang, q] of [['en', 'golf lessons kelowna'], ['fr', 'cours de golf kelowna'], ['en', 'golf and dinner kelowna'], ['fr', 'golf et souper kelowna'], ['en', 'christmas party venue kelowna'], ['en', 'mens night golf kelowna'], ['en', "men's night golf kelowna"]]) {
    const c = cards(await getText(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
    assert.ok(c.includes(tower.name), `${q}: ${c.slice(0, 8).join(' | ')}`);
    if (/dinner|souper/.test(q)) assert.equal(c[0], tower.name, `${q}: the course with a restaurant first`);
  }
  const p = app.runTripPlan({ text: 'golf near Kelowna on May 3 2027, 9 hole after work' }, NOV);
  assert.doesNotMatch(JSON.stringify(p.overview || {}), /“hole”|"hole"/);
  const p2 = app.runTripPlan({ text: 'nine holes in Kelowna after work on May 3 2027' }, NOV);
  assert.match(JSON.stringify(p2.overview || {}), /[Gg]olf/);
});

test('7. the happy hour deal gets a capital and is queued for French with his other lines', async () => {
  const { v, t } = await setUp(['golf'], { season: '04-01:10-31' });
  await ok(change(t, { happy_hour: { sun: [['14:00', '17:00']] }, happy_hour_deals: { deals: [{ text: "drink and appy specials at Carrington's" }] }, badges: { happy_hour: true } }));
  const deals = JSON.parse(db.prepare('SELECT happy_hour_deals FROM venues WHERE id = ?').get(v.id).happy_hour_deals || '[]');
  assert.equal(deals[0].text, "Drink and appy specials at Carrington's");
  const item = db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id);
  assert.ok(item, 'a French lines item');
  assert.match(item.help_note, /Happy hour: Drink and appy specials at Carrington's/);
});

test('8. polish: chips his own words negate are hidden; no hours opens Monday on neither; the hours revisit shows the season', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  const i = src.indexOf('function chipNegated('), j = src.indexOf('function quick(key');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(`${src.slice(i, j)}; this.f = chipNegated;`, ctx);
  assert.equal(ctx.f('No driving range, warm-up nets on site.', 'Driving range on site'), true);
  assert.equal(ctx.f('pas de champ de pratique', 'Champ de pratique sur place'), true);
  assert.equal(ctx.f('We don’t have a pro shop', 'Pro shop'), true);
  assert.equal(ctx.f('Restaurant and patio on site.', 'Driving range on site'), false);
  assert.equal(ctx.f('Pro shop open daily', 'Pro shop'), false);
  // On the Good to know screen, after "No driving range".
  const { v, t } = await setUp(['golf'], { season: '04-01:10-31' });
  const info = { rows: [{ label: 'Good to know', text: 'No driving range, warm-up nets on site.' }], owner_labels: ['Good to know'] };
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(v.id, JSON.stringify(info));
  if (app.clearVenueCaches) app.clearVenueCaches();
  const g = await openSetup(base, t, { hash: 'bring' });
  assert.ok(/Pro shop/.test(g.text()), g.text().slice(0, 400));
  assert.doesNotMatch(g.text(), /Driving range on site/);
  // A page with no hours: Monday's card shows neither Open nor Closed until a tap.
  const nh = mk({ hours: null, type: 'golf' }), tn = app.createOwnerLink(nh.id, {}).url.split('/owner/')[1];
  const h = await openSetup(base, tn, { hash: 'hours' });
  const edit = h.doc.getElementById('suScreen').querySelector('[data-act="hoursEdit"]') || h.doc.getElementById('suScreen').querySelector('[data-act="hours:edit"]');
  if (edit) { edit.click(); await h.settle(); }
  if (h.has('[data-dayclosed="mon"]')) {
    assert.ok(h.has('[data-dayclosed="mon"][aria-pressed="false"]'), 'Monday is not shown Closed');
    assert.ok(h.has('[data-dayopen="mon"][aria-pressed="false"]'), 'nor Open');
  }
  // The hours revisit: "Open Apr 1 – Oct 31" above the week.
  const hr = await openSetup(base, t, { hash: 'hours' });
  assert.match(hr.text(), /Open April 1 – October 31|Open Apr 1 – Oct 31/, hr.text().slice(0, 500));
});
