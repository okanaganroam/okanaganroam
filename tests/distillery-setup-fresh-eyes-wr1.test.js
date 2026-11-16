// First first-time DISTILLERY owner test on Whistler (Graham, a Pemberton tasting room: closed Mon–Wed, an off-season
// stretch, a two-week spring break every year, snacks only, adults only; Android, English; Whistler Roam
// drafts/fresh-eyes-distillery1-2026-11-16/REPORT.md). The code is shared, so the fixes are made here:
//  1. a stretch with every day closed says where a closure goes, with a button that drops it and carries on;
//  2. the story box's hint says what the first tap on research's text does;
//  3. the public page: "🍸 Cocktail list" (a cidery an apple), never a beer mug;
//  4. Build My Trip: "cocktail class" is a class a place lists; a listed event asked for starts at its start time;
//     "happy hour cocktails"; a listed event on a closed date says why; an outside town's name inside a listing's
//     name; « fermé » on French cards; "closed on May 1 (spring break)";
//  5. help: beer, a snack board, bottles, how long until it shows, a cocktail special, private tastings, a whisky
//     that isn't out, free parking, tours, the two-week closure;
//  6. the tasting-price note goes once the price is the owner's;
//  7. research's "Tastings $10" is read, and isn't shown beside the owner's own line;
//  8. the last screen never says "To reach 100%" under 100%;
//  9. the small ones;
// 10. a price after the kind's name in an event's name.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'distillery-wr1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
const frTrip = require('../trip-planner-fr.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c, closed = []) => Object.fromEntries(DAYS.map((d) => [d, closed.includes(d) ? [] : [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Chief Test ${++n}`, slug: `chief-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('11:00', '23:00')),
  description: 'A fixture used only by the first Whistler distillery fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const getJson = (p) => fetch(base + p).then((r) => r.json());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.17.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const setupCfg = async (t, fr = false) => cfgOf((await get(`${fr ? '/fr' : ''}/owner/${t}/setup`)).text);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
// A link sent from the setup is checked first: approve it, as the reviewer would.
const approveLink = (id) => { const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0").get(id); assert.ok(pend, 'a change is waiting'); assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true); };
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = () => fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
// A help answer as plain words (tags taken out with no space added, so "<em>no cover</em>." stays "no cover.").
const bare = (h) => String(h).replace(/<\/p><p>/g, ' ').replace(/<\/li><li>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const stopsOf = (p) => ((p.outing && p.outing.stops) || (p.itinerary && p.itinerary.stops) || []).map((x) => ({ label: x.label, name: x.venue && x.venue.name, reasons: (x.reasons || []).map((r) => r.text || r), venue: x.venue }));
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
// One function (or a run of lines) of the setup page's script, run on its own.
const clientPart = (from, to, ctx, tail = '') => { const s = CLIENT(); const a = s.indexOf(from), b = s.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, `client part ${from}`); vm.runInNewContext(s.slice(a, b) + tail, ctx); return ctx; };
// 3 PM Pacific on a date (PDT from mid-March to early November).
const at = (date, hm = '15:00') => new Date(`${date}T${hm}:00${/-(0[4-9]|10)-|-03-(1[5-9]|[23]\d)|-11-01/.test(date) ? '-07:00' : '-08:00'}`);


const layout = require('../food-drink-venue-layout.js');
const TEXT_SRC = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-text.js'), 'utf8');


// Graham's tasting room: Thu 1–7, Fri 1–8, Sat 12–8, Sun 12–6, closed Mon–Wed; Oct 13 – Nov 27 Fri–Sun 1–5 (Thursday
// closed); closed Apr 26 – May 9 every year ("spring break") and Dec 25; snacks only; $15 a tasting; adults only; a
// distillery tour on Saturdays at 2 PM and a cocktail class on the last Thursday at 6 PM; happy hour Thu–Fri 3–5.
const USUAL = { mon: [], tue: [], wed: [], thu: [['13:00', '19:00']], fri: [['13:00', '20:00']], sat: [['12:00', '20:00']], sun: [['12:00', '18:00']] };
const OFF = { label: '', from: '10-13', to: '11-27', hours: { mon: [], tue: [], wed: [], thu: [], fri: [['13:00', '17:00']], sat: [['13:00', '17:00']], sun: [['13:00', '17:00']] } };
const CLOSURES = [{ from: '04-26', to: '05-09', note: 'spring break', yearly: true }, { from: '12-25', to: '12-25', note: '', yearly: true }];
const RESEARCH = [{ label: 'Known for', text: 'Small-batch gin and vodka from Pemberton potatoes' }, { label: 'Prices', text: 'Tasting flights from $12, cocktails $14' }, { label: 'Kids & dogs', text: 'Minors welcome with an adult; dogs welcome inside' },
  { label: 'Food', text: 'Charcuterie boards and snacks' }, { label: 'Events', text: 'Distillery tours Saturdays at 2 PM' }, { label: 'Good to know', text: 'Street parking only' }];
const NIGHTS = [{ days: ['sat'], kind: 'tour', title: 'Distillery tour', detail: '$20, by booking', start: '14:00', frequency: 'weekly' }, { days: ['thu'], kind: 'class', title: 'Cocktail class', start: '18:00', frequency: 'monthly-last' }];
const graham = async (o = {}, opts = {}) => {
  const v = mk('distillery', { name: opts.name || `Graham Fixture ${n + 1}`, region: opts.region || 'vernon', price: '$$', rating: 4.7, reviews: 176, patio: 1, dog_friendly: 1, kid_friendly: 1, live_music: 1, great_groups: 1, vegan: 1, hours: JSON.stringify(WK('12:00', '18:00')), ...o });
  research(v.id, opts.research || RESEARCH);
  const t = tokenFor(v.id);
  if (opts.bare) return { v, t };
  ok(await change(t, { hours: USUAL, hours_checked: true }));
  ok(await change(t, { hours_seasons: [OFF] }));
  if (!opts.noClosure) ok(await change(t, { closures: CLOSURES }));
  ok(await change(t, { brewery_info: { food: 'snacks', outside: 'no' } }));
  ok(await change(t, { flight_fee: 15, brewery_info: { to_go: ['bottles'], minors: { policy: 'adults' } } }));
  ok(await change(t, { happy_hour: Object.fromEntries(DAYS.map((d) => [d, ['thu', 'fri'].includes(d) ? [['15:00', '17:00']] : []])), badges: { happy_hour: true }, happy_hour_deals: { deals: [{ price: '$10', text: 'gin and tonics' }, { price: '$2 off', text: 'cocktails' }] } }));
  if (!opts.noNights) ok(await change(t, { weekly_nights: NIGHTS }));
  return { v, t };
};
// The last Thursday of January 2027 (his class), the Thursday before (not his class), a Saturday in his spring break.
const CLASS_DAY = 'Thursday January 28', OTHER_THU = 'Thursday January 21', BREAK_SAT = 'Saturday May 1';
const SETUP_TYPES = ['pub', 'restaurant', 'cafe', 'winery', 'cidery', 'brewery', 'cocktail', 'distillery'].filter((t) => { try { return !!app.createVenue; } catch (e) { return false; } });
const mkType = (type, o = {}) => (type === 'cidery' ? mk('brewery', { name: `Orchard Cidery Fixture ${n + 1}`, ...o }) : mk(type, o));

// ====================== 1. A stretch with every day closed ======================
test('all-closed stretch: the message says where a closure goes and a button drops the stretch and carries on (EN + FR, every type)', async () => {
  assert.equal(text.en.seasonAllClosed, 'Closed the whole time? That goes on the next screen under “Closed for a week or two”.');
  assert.equal(text.en.seasonAllClosedBtn, 'Skip these dates and keep going');
  assert.match(text.fr.seasonAllClosed, /^Fermé tout ce temps \? Cela va à l’écran suivant, sous « Fermé une semaine ou deux »\.$/);
  assert.equal(text.fr.seasonAllClosedBtn, 'Passer ces dates et continuer');
  // The words are the closures screen's own button.
  assert.ok(text.en.anotherDay.includes('Closed for a week or two')); assert.ok(text.fr.anotherDay.includes('Fermé une semaine ou deux'));
  const s = CLIENT();
  // Only a stretch whose every day is closed gets it (no week yet, or a bad time, keeps the old message); pubs and
  // restaurants, with the kitchen question in between, say "a little further on".
  assert.match(s, /if \(so\.week && T\.seasonAllClosed && DAYS\.every\(function\(d\)\{ return !\(so\.week\[d\] \|\| \[\]\)\.length; \}\)\) \{ S\.nudge = KITCHEN_Q && T\.seasonAllClosedSoon \? T\.seasonAllClosedSoon : T\.seasonAllClosed; S\.seaClosedNudge = S\.nudge;/);
  assert.ok(s.indexOf('T.seasonAllClosed && DAYS.every') < s.indexOf('S.nudge = T.seasonNeedOpenDay'), 'checked before the old message');
  assert.match(s, /S\.nudge === S\.seaClosedNudge && seaIsStep\(S\.step\) \? '<div class="su-stack su-seaskip">' \+ big\('➜', T\.seasonAllClosedBtn, '', true, 'seaSkipClosed'\)/);
  // The button: a new stretch is dropped, a saved one goes back to what is stored, and the hours save as usual.
  assert.match(s, /if \(k === 'seaSkipClosed'\) \{[\s\S]{0,200}if \(zo && zo\.src\) S\.seaList\[zi\] = seaLoad\(seaBlank\(\), zo\.src\);\s+else if \(zi === 1\) S\.seaList\.length = 1;\s+else if \(zo\) S\.seaList\[0\] = seaBlank\(\);[\s\S]{0,80}return hoursSave\(\);/);
  for (const [type, fr] of [['pub', false], ['restaurant', true], ['cafe', false], ['winery', true], ['brewery', false], ['cocktail', false], ['distillery', true]]) {
    const v = mk(type); const html = (await get(`${fr ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`)).text;
    assert.ok(html.includes(fr ? 'Passer ces dates et continuer' : 'Skip these dates and keep going'), type);
    assert.ok(html.includes(fr ? 'sous « Fermé une semaine ou deux »' : 'under “Closed for a week or two”'), type);
  }
});

test('help: "we close for two weeks in spring" names "Closed for a week or two" for every setup type (EN + FR)', async () => {
  for (const type of ['pub', 'restaurant', 'cafe', 'winery', 'brewery', 'cocktail', 'distillery']) {
    const v = mk(type), t = tokenFor(v.id);
    const en = helpBot((await get(`/owner/${t}/setup`)).text);
    for (const q of ['We close for two weeks in spring', 'closed for two weeks in the spring every year']) {
      const b = en.best(q);
      assert.ok(b && b.id, `${type}: ${q}`);
      assert.match(bare(en.topic(b.id).a), /Closed for a week or two/, `${type}: ${q} -> ${b.id}`);
    }
    const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
    const bf = fr.best('nous fermons deux semaines au printemps');
    assert.ok(bf && bf.id, `${type} fr`);
    assert.match(bare(fr.topic(bf.id).aFr), /Fermé une semaine ou deux/, `${type} fr -> ${bf.id}`);
  }
});

// ====================== 2. The story box ======================
test('story box: research text is still selected on the first tap, and the hint over it says so (EN + FR); her own story keeps the old hint', async () => {
  assert.equal(text.en.storyResearchHint, 'This is what your page says now. Type to replace this text, or tap again to add to it. The ✕ clears it.');
  assert.match(text.fr.storyResearchHint, /Tapez pour remplacer ce texte, ou touchez une deuxième fois pour y ajouter des mots\. Le ✕ l’efface\.$/);
  assert.match(text.en.storyEditHint, /Change any words right in the box/, 'her own story: as before');
  const s = CLIENT();
  // The hint is shown on exactly the condition the first-tap select uses (research's text, nothing of hers waiting, unchanged).
  assert.match(s, /C\.storyResearch && !C\.storyPending && S\.story === storyCur\(\) && T\.storyResearchHint \? T\.storyResearchHint : T\.storyEditHint/);
  assert.match(s, /var researchStory = inp\.id === 'suStory' && C\.storyResearch && !C\.storyPending && !!storyCur\(\) && inp\.value === storyCur\(\);/);
  assert.match(s, /\|\| researchStory \|\| researchLine\) && !chipOwn, first = true;/);
  // "…or tap again to add to it" is kept on every phone: a second tap while our own select is still on the box puts the
  // cursor at the end (the first tap's own click, right after the focus, is left alone; typing ends it).
  assert.match(s, /if \(sel\) \{ inp\.select\(\); inp\._autoSel = Date\.now\(\); \} else inp\.setSelectionRange\(n, n\);/);
  assert.match(s, /if \(researchStory\) \{\s+inp\.addEventListener\('click', function\(\)\{ if \(!inp\._autoSel \|\| Date\.now\(\) - inp\._autoSel < 300\) return; inp\._autoSel = 0; try \{ var n2 = inp\.value\.length; if \(n2 && inp\.selectionStart === 0 && inp\.selectionEnd === n2\) inp\.setSelectionRange\(n2, n2\); \} catch \(e\) \{\} \}\);\s+inp\.addEventListener\('input', function\(\)\{ inp\._autoSel = 0; \}\);/);
  // Every type that has the box gets the words.
  for (const [type, fr] of [['distillery', false], ['brewery', true], ['pub', false], ['winery', false], ['restaurant', false], ['cafe', true], ['cocktail', false]]) {
    const v = mk(type); const html = (await get(`${fr ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`)).text;
    assert.ok(html.includes(fr ? 'Tapez pour remplacer ce texte' : 'Type to replace this text, or tap again to add to it'), type);
    assert.equal(cfgOf(html).storyResearch, true, `${type}: a fixture description nobody wrote is research's`);
  }
});

// ====================== 3. The public page ======================
test('public page: a distillery has "🍸 Cocktail list" (never a beer mug or "Drinks list"); a cidery an apple; a taproom keeps its mug; French words', async () => {
  const { v } = await graham();
  db.prepare("INSERT INTO venue_links (venue_id, menu_url) VALUES (?, 'https://example.com/cocktails') ON CONFLICT(venue_id) DO UPDATE SET menu_url = excluded.menu_url").run(v.id);
  assert.deepEqual(app.venueTapListWords(app.getVenue(v.id), false), { label: 'Cocktail list', see: 'See the cocktail list', lower: 'cocktail list' });
  assert.deepEqual(app.venueTapListWords(app.getVenue(v.id), true), { label: 'Carte des cocktails', see: 'Voir la carte des cocktails', lower: 'carte des cocktails' });
  assert.equal(app.venueTapListIcon(app.getVenue(v.id)), '🍸');
  const html = page(v);
  assert.ok(html.includes('<a class="cta fd-menu-button" href="#fdMenu">🍸 Cocktail list</a>'), 'the button');
  assert.ok(html.includes('<h2>Cocktail list 🍸</h2>'), 'the heading');
  assert.ok(html.includes('See the cocktail list ↗'));
  assert.ok(!/🍺|Drinks list|drinks list/.test(html), 'no beer mug, no "Drinks list"');
  // A cidery and a brewery with no kitchen.
  const c = mk('brewery', { name: 'Orchard Row Cidery Fixture' }), b = mk('brewery', { name: 'Hop Yard Brewing Fixture' });
  for (const x of [c, b]) { ok(await change(tokenFor(x.id), { brewery_info: { food: 'snacks' } })); db.prepare("INSERT INTO venue_links (venue_id, menu_url) VALUES (?, 'https://example.com/list') ON CONFLICT(venue_id) DO UPDATE SET menu_url = excluded.menu_url").run(x.id); }
  ok(await change(tokenFor(c.id), { place_type: 'Cidery' }));
  const ch = page(c), bh = page(b);
  assert.ok(ch.includes('🍏 Cider list') && ch.includes('<h2>Cider list 🍏</h2>') && !ch.includes('🍺'), 'a cidery: an apple');
  assert.ok(bh.includes('🍺 Tap list') && bh.includes('<h2>Tap list 🍺</h2>'), 'a brewery keeps the mug');
  // A winery never had the beer words.
  const w = mk('winery'); db.prepare("INSERT INTO venue_links (venue_id, menu_url) VALUES (?, 'https://example.com/wines') ON CONFLICT(venue_id) DO UPDATE SET menu_url = excluded.menu_url").run(w.id);
  assert.equal(app.venueTapListWords(app.getVenue(w.id), false), null); assert.ok(!page(w).includes('🍺'));
  // One name on the owner pages too.
  assert.deepEqual(app.breweryListTile({ type: 'distillery', name: 'X' }), { en: ['Update my menu or cocktail list', 'Snap your cocktail list or menu'], fr: ['Mettre à jour mon menu ou ma carte des cocktails', 'Photographiez votre carte des cocktails ou votre menu'] });
  assert.equal(text.en.brewery.kindDistillery.labels.menu, 'Your menu or cocktail list');
  assert.equal(text.en.brewery.kindDistillery.menuQ, 'How should we add your menu or cocktail list?');
  assert.match(text.fr.brewery.kindDistillery.menuQ, /^Comment ajouter votre menu ou votre carte des cocktails/);
  assert.equal(text.en.brewery.kindDistillery.tapWords.web, 'My cocktail list is on my website');
});

// ====================== 4. Build My Trip ======================
test('Build My Trip: "cocktail class" on its day finds the place that lists the class (not cocktail lounges), in the visitor\'s own words', async () => {
  const { v } = await graham({}, { name: 'Lillooet River Distilling Fixture', region: 'osoyoos' });
  mk('cocktail', { name: 'Plain Lounge Fixture', region: 'osoyoos', rating: 4.9, reviews: 900 });
  const p = await plan(`Cocktail class in Osoyoos on ${CLASS_DAY}`);
  const recs = (p.recommendations || []).map((r) => ({ name: r.venue && r.venue.name, reasons: (r.reasons || []).map((x) => x.text || x) }));
  assert.deepEqual(recs.map((r) => r.name), [v.name], JSON.stringify(recs));
  assert.ok(recs[0].reasons.includes('Cocktail class on Thursday at 6 PM, from its listing'), recs[0].reasons.join(' | '));
  assert.ok(!/cocktail lounge/i.test(`${p.summary} ${(p.warnings || []).join(' ')}`), `${p.summary} | ${(p.warnings || []).join(' | ')}`);
  assert.ok(!/masterclass/i.test(JSON.stringify({ ...p, recommendations: null })), 'the planner\'s own word never shows');
  assert.match(p.summary, /“cocktail class”/);
  assert.ok(!(p.requirementResults || []).some((r) => r.kind === 'type' && r.value === 'cocktail'), 'no "cocktail lounge" requirement');
  // A plain "a class" too; the Thursday before (not the last Thursday) finds nothing and never names a lounge.
  const bare1 = await plan(`a class in Osoyoos on ${CLASS_DAY}`);
  assert.deepEqual((bare1.recommendations || []).map((r) => r.venue.name), [v.name]);
  const other = await plan(`Cocktail class in Osoyoos on ${OTHER_THU}`);
  assert.ok(!(other.recommendations || []).some((r) => r.venue.name === v.name), 'not on a Thursday without the class');
  // Undated: the place that hosts one, with its day.
  const und = await plan('Cocktail class in Osoyoos');
  assert.ok(((und.recommendations || [])[0].reasons || []).some((r) => (r.text || r) === 'Hosts a class on Thursdays, from its listing'));
  // Other "class" words are left as typed.
  for (const q of ['cooking class in Kelowna', 'yoga class in Kelowna on Saturday', 'first class dinner in Kelowna', 'world class wineries in Oliver']) {
    const x = await plan(q);
    assert.ok(!/cocktail class|masterclass/i.test(JSON.stringify(x.understood || {})), q);
  }
  // French lines.
  assert.equal(frCopy.t3FrenchText('Cocktail class on Thursday at 6 PM, from its listing'), 'Cocktail class le jeudi à 18 h, selon sa fiche');
  assert.equal(frCopy.t3FrenchText('Hosts a class on Thursdays, from its listing'), 'Offre un atelier le jeudi, selon sa fiche');
  assert.equal(frCopy.t3FrenchText('Tour on Saturday at 2 PM, from its listing'), 'Visite le samedi à 14 h, selon sa fiche', 'the tour line is as it was');
});

test('Build My Trip: a named place\'s listed class (and a pub\'s trivia) is planned at the event\'s start time, as a visit, not a What\'s On item', async () => {
  const { v } = await graham({}, { name: 'Birkenhead Spirits Fixture', region: 'oliver' });
  mk('restaurant', { name: 'Oliver Supper Fixture', region: 'oliver', rating: 4.6, reviews: 300, hours: JSON.stringify(WK('11:00', '22:00')) });
  const p = await plan(`Cocktail class at ${v.name} on ${CLASS_DAY} then dinner in Oliver`);
  assert.equal(p.kind, 'itinerary', JSON.stringify(p.summary));
  const row = (p.schedule || []).find((r) => r.venueId === v.id);
  assert.ok(row, JSON.stringify(p.schedule));
  assert.equal(row.startMinutes, 18 * 60, 'the class is at 6 PM (it was planned for 1 PM)');
  assert.ok(!(p.events || []).length && !stopsOf(p).some((s) => !s.name), 'a visit to the place, not an event item');
  assert.ok(!(p.warnings || []).some((w) => /masterclass|couldn’t match that word|cocktail lounge/i.test(w)), (p.warnings || []).join(' | '));
  // Without the class word the same request starts in the afternoon, as before.
  const plain = await plan(`${v.name} on ${CLASS_DAY} then dinner in Oliver`);
  const prow = (plain.schedule || []).find((r) => r.venueId === v.id);
  assert.ok(prow && prow.startMinutes < 18 * 60, JSON.stringify(plain.schedule));
  // The same rule for any listed event asked for by its kind: trivia at a pub on its night.
  const pub = mk('pub', { name: 'Fairview Quiz Pub Fixture', region: 'oliver', rating: 4.5, reviews: 400, hours: JSON.stringify(WK('11:00', '23:00')) });
  ok(await change(tokenFor(pub.id), { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:30', frequency: 'weekly' }] }));
  const tq = await plan(`Dinner in Oliver then trivia at ${pub.name} on Tuesday January 26`);
  const trow = (tq.schedule || []).find((r) => r.venueId === pub.id);
  assert.equal(trow && trow.startMinutes, 19 * 60 + 30, `${tq.kind} ${JSON.stringify(tq.schedule)}`);
  const s = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  assert.match(s, /const askedNightStart=s=>\{/); assert.match(s, /nightStop&&\(stop===nightStop\|\|stop\.listedNight\)&&askedNightStart\(stop\)!=null\?askedNightStart\(stop\):0\)/);
  // One stop a day, never a lunch or coffee stop, and the day's start moves only for one of its first two stops.
  assert.match(s, /if\(!askedKinds\.length\|\|\/\\b\(\?:lunch\|brunch\|breakfast\|coffee\)\\b\/i\.test\(s\.label\|\|''\)\)return null;/);
  assert.match(s, /if\(nightStop\.listedNight\|\|at<=1\)nightLead=Math\.max\(540,askedNightStart\(nightStop\)-at\*90\);/);
});

test('Build My Trip: "happy hour cocktails" is a happy hour anywhere that has one then (a distillery), not only cocktail lounges', async () => {
  const { v } = await graham({}, { name: 'Pemberton Gin Works Fixture', region: 'summerland' });
  const p = await plan('Happy hour cocktails in Summerland on Friday January 22 at 3 PM');
  assert.ok((p.recommendations || []).some((r) => r.venue.name === v.name) || stopsOf(p).some((s) => s.name === v.name), `${p.summary} | ${(p.warnings || []).join(' | ')}`);
  assert.ok(!/[Cc]ocktail lounges?/.test(`${p.summary} ${(p.warnings || []).join(' ')}`), p.summary);
  const b = await plan('Happy hour in Summerland on Friday January 22 at 3 PM');
  assert.equal(p.summary, b.summary, 'the same reading as "happy hour"');
  // "Cocktails" on their own still ask for cocktail lounges.
  const c = await plan('Cocktails in Summerland on Friday January 22');
  assert.match(JSON.stringify(c.understood.interests), /cocktail lounges/);
});

test('Build My Trip: a listed event asked for on a date the place is closed says so; a short yearly break is "closed on", a long one "for the season"', async () => {
  const { v } = await graham({}, { name: 'Mount Currie Stillhouse Fixture', region: 'peachland' });
  const tour = await plan(`Distillery tour in Peachland on ${BREAK_SAT}`);
  assert.equal(stopsOf(tour).length + (tour.recommendations || []).length, 0);
  assert.equal(tour.warnings[0], `${v.name} is closed on May 1 (spring break), so it isn’t in this plan.`, JSON.stringify(tour.warnings));
  // On an open Saturday the tour is found, as before.
  const open = await plan('Distillery tour in Peachland on Saturday May 15');
  assert.equal(stopsOf(open)[0].name, v.name);
  assert.ok(!(open.warnings || []).some((w) => /is closed/.test(w)));
  // The class in the break (the last Thursday of April).
  const cls = await plan('Cocktail class in Peachland on Thursday April 29');
  assert.ok((cls.warnings || []).some((w) => w.includes(v.name) && /closed/.test(w)), JSON.stringify(cls.warnings));
  // Named: "closed on May 1 (spring break)", never "for the season" for two weeks.
  const named = await plan(`${v.name} on ${BREAK_SAT}`);
  assert.equal(named.warnings[0], `${v.name} is closed on May 1 (spring break), so it isn’t in this plan.`);
  assert.equal(frCopy.t3FrenchText(named.warnings[0]), `${v.name} est fermé le 1er mai (spring break); il ne fait donc pas partie de ce plan.`);
  assert.equal(frCopy.t3FrenchText('X is closed on December 26 for Boxing Day, so it isn’t in this plan.'), 'X est fermé le 26 décembre (lendemain de Noël); il ne fait donc pas partie de ce plan.');
  // A shoulder season of more than three weeks keeps "closed for the season on".
  const r = mk('restaurant', { name: 'Long Shoulder Bistro Fixture', region: 'peachland', hours: JSON.stringify(WK('11:00', '22:00')) });
  ok(await change(tokenFor(r.id), { closures: [{ from: '04-19', to: '05-14', note: 'Spring shoulder season', yearly: true }] }));
  const long = await plan(`${r.name} on Saturday May 8`);
  assert.equal(long.warnings[0], `${r.name} is closed for the season on May 8 (Spring shoulder season), so it isn’t in this plan.`, JSON.stringify(long.warnings));
});

test('Build My Trip: an outside town\'s name inside a planned listing\'s own name is not "out of area"; the town on its own still is', async () => {
  const { v } = await graham({}, { name: 'Kamloops Street Distilling Fixture', region: 'naramata' });
  const p = await plan(`${v.name} on Saturday January 30`);
  assert.ok((p.recommendations || []).some((r) => r.venue.name === v.name) || stopsOf(p).some((s) => s.name === v.name), JSON.stringify(p.warnings));
  assert.ok(!(p.unsupported || []).includes('Kamloops'), JSON.stringify(p.unsupported));
  assert.ok(!((p.understood || {}).notUsed || []).includes('Kamloops'));
  // Typed without the word "Fixture" (a shorter form of the name) too.
  const short = await plan('Kamloops Street Distilling in Naramata on Saturday January 30');
  assert.ok(!(short.unsupported || []).includes('Kamloops'), JSON.stringify(short.unsupported));
  // The town itself, away from the name, is still flagged.
  const both = await plan(`${v.name} on Saturday January 30 then dinner in Kamloops`);
  assert.ok((both.unsupported || []).includes('Kamloops'), JSON.stringify(both.unsupported));
  const town = await plan('Distilleries in Kamloops');
  assert.ok((town.unsupported || []).includes('Kamloops'), JSON.stringify(town.unsupported));
});

test('Build My Trip in French: « fermé » for the closed days on the hours line, with a run of days too', () => {
  assert.equal(frCopy.t3FrenchText('Listed hours: 13:00–17:00 Fri–Sun; closed Mon–Thu'), 'Horaires indiqués : 13 h–17 h ven.–dim. ; fermé lun.–jeu.');
  assert.equal(frCopy.t3FrenchText('Listed hours: 13:00–19:00 Thu; 13:00–20:00 Fri; 12:00–20:00 Sat; closed Mon–Wed'), 'Horaires indiqués : 13 h–19 h jeu. ; 13 h–20 h ven. ; 12 h–20 h sam. ; fermé lun.–mer.');
  assert.equal(frCopy.t3FrenchText('Listed hours: 11:00–22:00 Tue–Sun; closed Mon'), 'Horaires indiqués : 11 h–22 h mar.–dim. ; fermé lun.', 'one closed day: as before');
});

// ====================== 5. Help ======================
test('help for a distillery: beer, a snack board, bottles, how long, a cocktail special, private tastings, an unreleased whisky, parking, tours (EN + FR)', async () => {
  const { t } = await graham();
  const en = helpBot((await get(`/owner/${t}/setup`)).text);
  const ans = (q) => { const b = en.best(q); assert.ok(b && b.id, `no answer: ${q}`); return { id: b.id, a: bare(en.topic(b.id).a) }; };
  let x = ans('we dont make beer');
  assert.equal(x.id, 'distillery-no-beer'); assert.match(x.a, /set up as a distillery, so it talks about spirits, tastings and cocktails\. It never asks about beer/);
  x = ans('we just do a charcuterie board');
  assert.equal(x.id, 'distillery-snacks'); assert.match(x.a, /Food here .*Tap Snacks only \(a charcuterie or snack board counts\)/);
  x = ans('can i say we sell bottles');
  assert.equal(x.id, 'distillery-bottles'); assert.match(x.a, /Tastings and bottles\. Under What can people take home\? tap Bottles/);
  x = ans('how long until it shows');
  assert.equal(x.id, 'setup-live-when'); assert.match(x.a, /^Most answers show right away/); assert.match(x.a, /Within a day for anything we check first: photos, a new story, and a new link/);
  assert.ok(!/15 to 30 minutes|average spend|takeout/.test(x.a), 'not the setup overview');
  x = ans('we dont do apres just a cocktail special thursday and friday');
  assert.equal(x.id, 'distillery-cocktail-special'); assert.match(x.a, /^Yes, that’s the happy hour question\./); assert.match(x.a, /No drink special at set times\? Tap No\./);
  x = ans('private tastings for groups');
  assert.equal(x.id, 'distillery-private'); assert.match(x.a, /Groups and booking/);
  x = ans('our whisky isnt out yet');
  assert.equal(x.id, 'distillery-coming-soon'); assert.match(x.a, /^Say it in your story\./); assert.ok(!/own kitchen/.test(x.a));
  x = ans('free parking on site');
  assert.equal(x.id, 'parking-free'); assert.match(x.a, /What you offer .*: tick Free parking\. Paid or street parking goes under Good to know/); assert.ok(!/unticked/.test(x.a));
  x = ans('parking is paid');
  assert.equal(x.id, 'parking-paid', 'paid parking keeps its answer');
  x = ans('tours are $20 and people have to book');
  assert.equal(x.id, 'distillery-tours'); assert.match(x.a, /Say so in the tour’s name, after a comma \(“Distillery tour, \$20, book ahead”\)/); assert.ok(!/tour’s detail/.test(x.a));
  // The four that were already right.
  assert.equal(ans('tastings price').id, 'distillery-price'); assert.equal(ans('no minors, we are 19+ only').id, 'distillery-kids');
  assert.equal(ans('is this free').id, 'cost'); assert.equal(ans('cocktail class last thursday').id, 'distillery-tours');
  // The cocktail list answer no longer says the step needs a kitchen, and uses the one name.
  const menu = bare(en.topic('distillery-menu').a);
  assert.ok(!/only when you have your own kitchen/.test(menu)); assert.match(menu, /Update my menu or cocktail list/);
  // The hours answer names the closures button.
  assert.match(bare(en.topic('distillery-hours').a), /Closed for a week or two \(a spring break, renovations\)\? That’s on the next screen, after your hours: tap \+ Closed for a week or two \(or other dates\)/);
  // French.
  const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  const ansFr = (q) => { const b = fr.best(q); assert.ok(b && b.id, `pas de réponse : ${q}`); return { id: b.id, a: bare(fr.topic(b.id).aFr) }; };
  assert.equal(ansFr('nous ne faisons pas de bière').id, 'distillery-no-beer');
  assert.equal(ansFr('juste un plateau de charcuteries').id, 'distillery-snacks');
  assert.equal(ansFr('nous vendons des bouteilles').id, 'distillery-bottles');
  x = ansFr('dans combien de temps ça paraît');
  assert.equal(x.id, 'setup-live-when'); assert.match(x.a, /^La plupart des réponses paraissent tout de suite/);
  assert.equal(ansFr('dégustations privées pour les groupes').id, 'distillery-private');
  assert.equal(ansFr('notre whisky n’est pas encore sorti').id, 'distillery-coming-soon');
  x = ansFr('stationnement gratuit sur place');
  assert.equal(x.id, 'parking-free'); assert.match(x.a, /cochez Stationnement gratuit/);
  assert.match(bare(fr.topic('distillery-tours').aFr), /Dites-le dans le nom de la visite, après une virgule/);
  assert.ok(!/seulement si vous avez votre propre cuisine/.test(bare(fr.topic('distillery-menu').aFr)));
});

test('help for the other types: free parking and "how long until it shows" are answered; a brewery is never told "we don\'t make beer"', async () => {
  for (const type of ['pub', 'restaurant', 'cafe', 'winery', 'brewery', 'cocktail']) {
    const v = mk(type); const hb = helpBot((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
    const live = hb.best('how long until it shows');
    assert.equal(live && live.id, 'setup-live-when', type);
    const park = hb.best('free parking on site');
    assert.equal(park && park.id, 'parking-free', type);
    assert.match(bare(hb.topic('parking-free').a), /tick Free parking/, type);
    assert.equal(hb.topic('distillery-no-beer'), undefined, type);
    assert.equal(hb.topic('distillery-cocktail-special'), undefined, type);
    // "When do my photos show up?" keeps its own answer (brewery test 3).
    assert.equal((hb.best('when do my photos show up') || {}).id, 'photos-when', type);
  }
});

// ====================== 6. The tasting-price note ======================
test('tasting price: "from your website, so we picked it" goes once the price in the box is no longer research\'s (distillery, brewery flight, winery)', () => {
  const s = CLIENT();
  assert.match(s, /if \(S\.brew\.feeGuessed && S\.brew\.fee !== C\.researchFee\) S\.brew\.feeGuessed = false; \}/);
  assert.match(s, /if \(S\.wine\.feeGuessed && S\.wine\.fee !== C\.researchFee\) S\.wine\.feeGuessed = false; \}/);
  assert.match(s, /if \(sfe\) sfe\.addEventListener\('input', function\(\)\{ if \(C\.brewery\) readBrew\(\); else if \(C\.winery\) readWine\(\); var fg = el\('suFeeGuess'\); if \(fg && !\(\(C\.brewery \? S\.brew : S\.wine\) \|\| \{\}\)\.feeGuessed\) fg\.hidden = true; \}\);/);
  // readBrew itself, run on its own: $15 typed over research's $12 is his; research's own $12 left in the box is still a guess.
  const run = (typed) => {
    const ctx = { C: { brewery: true, researchFee: 12 }, S: { brew: { fee: 12, feeGuessed: true }, kitchen: null }, FOLD: false, CK: false, el: (id) => (id === 'suFee' ? { value: typed } : null) };
    clientPart('  function readBrew(){', '    if ((x = v(\'suKto\'))', ctx, '}');
    vm.runInNewContext('readBrew()', ctx); return ctx.S.brew;
  };
  assert.deepEqual(run('$15'), { fee: 15, feeGuessed: false });
  assert.deepEqual(run('15 $'), { fee: 15, feeGuessed: false });
  assert.deepEqual(run('12'), { fee: 12, feeGuessed: true });
});

// ====================== 7. Research's tasting price ======================
test('research "Tastings $10" pre-picks $10; once the owner gives a price, research\'s "Prices: Tastings $10" is left off the page (other prices stay)', async () => {
  const R2 = RESEARCH.map((r) => (r.label === 'Prices' ? { label: 'Prices', text: 'Tastings $10' } : r));
  const { v, t } = await graham({}, { bare: true, research: R2, region: 'penticton' });
  assert.equal((await setupCfg(t)).researchFee, 10, '"Tastings $10" is read');
  // Other wordings; "flights $12" as before; a happy hour line is never a tasting price.
  const fee = async (line) => { const x = await graham({}, { bare: true, research: RESEARCH.map((r) => (r.label === 'Prices' ? { label: 'Prices', text: line } : r)), region: 'penticton' }); return (await setupCfg(x.t)).researchFee; };
  assert.equal(await fee('Tasting flights from $12, cocktails $14'), 12);
  assert.equal(await fee('Cocktails $14, $9 a tasting'), 9);
  assert.equal(await fee('Tastings from $8'), 8);
  assert.equal(await fee('Cocktails $14'), null);
  // Before his answer the research line shows; after it, only his line.
  assert.match(plain(page(v)), /Prices\s+Tastings \$10/);
  ok(await change(t, { flight_fee: 10, brewery_info: { to_go: ['bottles'] } }));
  const after = plain(page(v));
  assert.match(after, /Tastings\s+\$10 a tasting/); assert.ok(!/Prices\s+Tastings \$10/.test(after), 'not said twice');
  assert.ok(app.venueVisitInfo(v.id).rows.some((r) => r.label === 'Prices' && r.text === 'Tastings $10'), 'the stored research row is untouched');
  // A Prices line with something else in it stays beside his tasting line.
  const g = await graham({}, { region: 'penticton' });
  assert.match(plain(page(g.v)), /Prices\s+Tasting flights from \$12, cocktails \$14/);
  // A brewery's "Pints from $8, flights $13" stays too.
  const b = mk('brewery', { name: 'Flight Line Brewing Fixture', region: 'penticton' });
  research(b.id, [{ label: 'Prices', text: 'Pints from $8, flights $13' }]);
  ok(await change(tokenFor(b.id), { flight_fee: 13 }));
  assert.match(plain(page(b)), /Prices\s+Pints from \$8, flights \$13/);
});

// ====================== 8. The last screen ======================
test('last screen: at 100% the open tiles are "You can still add", never "To reach 100%" (EN + FR)', async () => {
  assert.equal(text.en.stillAdd, 'You can still add'); assert.equal(text.fr.stillAdd, 'Vous pouvez encore ajouter');
  const s = CLIENT();
  assert.match(s, /\(left\.length \? '<h2 class="su-h2" id="suLeftH">' \+ h\(\(sc\.soon < sc\.pct \? sc\.soon : Math\.max\(sc\.pct, sc\.soon \|\| 0\)\) >= 100 && T\.stillAdd \? T\.stillAdd : T\.toReach\) \+ '<\/h2>/);
  assert.equal((s.match(/h\(T\.toReach\)/g) || []).length, 0, '"To reach 100%" is never shown without the check');
  const v = mk('distillery'); const html = (await get(`/fr/owner/${tokenFor(v.id)}/setup`)).text;
  assert.ok(html.includes('Vous pouvez encore ajouter'));
});

// ====================== 9. The small ones ======================
test('edit page: a distillery\'s tips give distillery examples and "Tours & events" (EN + FR); Sports TV is not offered; pubs keep theirs', async () => {
  const { t } = await graham();
  const en = (await get(`/owner/${t}`)).text, fr = (await get(`/fr/owner/${t}`)).text;
  assert.ok(en.includes('&ldquo;Gin and tonic&rdquo; &middot; &ldquo;$10&rdquo;'), 'the happy hour deals tip');
  assert.ok(!en.includes('House pints'), 'no pints');
  assert.ok(en.includes('tours and classes go under Tours &amp; events'), 'the specials tip');
  assert.ok(!/go under Weekly nights/.test(en) && !en.includes('Wing Wednesday'), 'no pub examples, in the tips, the boxes or the help');
  assert.ok(en.includes('placeholder="Gin and tonic"') && en.includes('placeholder="e.g. Martini Monday"'));
  assert.ok(/«\s*Gin tonic\s*» · «\s*10\s*\$\s*»/.test(fr) && !fr.includes('Pintes maison') && !fr.includes('Mercredi des ailes'));
  assert.ok(fr.includes('les visites et les ateliers vont sous Visites et événements') && !fr.includes('vont sous Soirées de la semaine'));
  assert.ok(en.includes('#opBadges[data-venue-type="distillery"] .amenity-check[hidden]:has(input[value="sports_tv"]) { display: none; }'));
  assert.match(en, /<label class="amenity-check" hidden><input type="checkbox" name="badge" value="sports_tv">/);
  assert.match(en, /id="opBadges"[^>]*data-venue-type="distillery"/);
  assert.ok(en.includes('Update my menu or cocktail list') && !en.includes('cocktail or tasting menu'));
  const pub = mk('pub'); const ph = (await get(`/owner/${tokenFor(pub.id)}`)).text;
  assert.ok(ph.includes('House pints (20 oz)') && ph.includes('trivia and karaoke go under Weekly nights'));
});

test('hours chips: a distillery gets 1 PM to open and 7 PM to close (no more chips than a brewery has); breweries keep theirs; "Open after midnight?" is as it was', () => {
  const s = CLIENT();
  assert.match(s, /var BQ_OPEN = \['11:00', '12:00', '14:00', '15:00'\], BQ_CLOSE = \['18:00', '20:00', '21:00', '22:00', '23:00'\];/);
  assert.match(s, /if \(C\.distillery\) \{ BQ_OPEN = \['11:00', '12:00', '13:00', '14:00'\]; BQ_CLOSE = \['18:00', '19:00', '20:00', '21:00', '22:00'\]; \}/);
  // Wineries (the other tasting-room type) show the midnight row, so a distillery's stays: only cafés hide it.
  assert.match(s, /function lateBtns\(d, j, y\)\{\s+\/\/[^\n]+\n\s+if \(C\.cafe\) return '';/);
});

// (Okanagan already had this right; the test keeps it so, since the Whistler page showed the English words.)
test('French category page: "Back to all of <town>" is in French', async () => {
  const { v } = await graham({}, { region: 'lake-country' });
  const html = (await get('/fr/lake-country/distilleries')).text;
  assert.ok(html.includes(v.name));
  assert.ok(/Retour à tout Lake Country/.test(html) && !html.includes('Back to all of'), 'the link under the list');
});

test('closure notice: "reopens" names the first day the place is open again (May 13, a Thursday), not the day after (a closed Monday)', async () => {
  assert.equal(app.tempClosureText('2027-04-26', '2027-05-09', '2027-04-20'), 'Closed Apr 26–May 9, reopens May 10.', 'without a week: the day after, as before');
  assert.equal(app.tempClosureText('2027-04-26', '2027-05-09', '2027-04-20', () => '2027-05-13'), 'Closed Apr 26–May 9, reopens May 13.');
  assert.equal(app.tempClosureText('2027-04-26', '2027-05-09', '2027-04-20', () => null), 'Closed Apr 26–May 9, reopens May 10.');
  const { v } = await graham();
  assert.equal(app.firstOpenDayAfter(v.id, '2027-05-09'), '2027-05-13', 'closed Mon–Wed: Thursday');
  assert.equal(app.firstOpenDayAfter(v.id, '2027-11-06'), '2027-11-07', 'a Sunday in the off-season stretch is open');
  assert.equal(app.firstOpenDayAfter(v.id, '2027-11-07'), '2027-11-12', 'off-season: Thursday is closed too, so Friday');
  const st = app.getSeasonStates(at('2027-04-20')).get(v.id);
  assert.ok(st && st.kind === 'temp_closed', JSON.stringify(st));
  assert.equal(st.text, 'Closed Apr 26–May 9, reopens May 13.');
  // A place open every day: the day after.
  const daily = mk('brewery'); ok(await change(tokenFor(daily.id), { closures: [{ from: '2027-04-26', to: '2027-05-09', note: '' }] }));
  assert.equal(app.getSeasonStates(at('2027-04-20')).get(daily.id).text, 'Closed Apr 26–May 9, reopens May 10.');
});

test('What\'s On: a tour at 2 PM today is under "Today", an evening quiz under "Tonight"', async () => {
  const { v } = await graham({}, { region: 'big-white' });
  const pub = mk('pub', { name: 'Evening Quiz Pub Fixture', region: 'big-white', hours: JSON.stringify(WK('11:00', '23:00')) });
  ok(await change(tokenFor(pub.id), { weekly_nights: [{ days: ['sat'], kind: 'trivia', title: 'Trivia', start: '19:30', frequency: 'weekly' }] }));
  const html = plain(app.whatsOnWeeklyNightsHtml(at('2027-01-30', '10:00')));
  assert.match(html, /Today · Tours? at \d+ places?/, html.slice(0, 400));
  assert.ok(!/Tonight · Tours? at/.test(html));
  assert.match(html, /Tonight · Trivia at \d+ places?/);
  assert.ok(v);
});

test('a quick answer carried on in lower case joins with a space ("Patio only in summer, not inside"); a new sentence keeps the full stop', () => {
  const s = CLIENT();
  const a = s.indexOf('  var quickJoin = function(box, prev, sibs, sep){'), b = s.indexOf("  screen.addEventListener('focusin'", a);
  assert.ok(a > 0 && b > a);
  const ctx = {}; vm.runInNewContext(`${s.slice(a, b)}; this.quickJoin = quickJoin;`, ctx);
  const type = (prev, typed, sep = '. ') => { const box = { value: prev + typed, selectionStart: (prev + typed).length, setSelectionRange() {} }; const r = ctx.quickJoin(box, prev, ['Patio only', 'Dogs welcome inside', 'Takeout', 'Delivery'], sep); return [r, box.value]; };
  assert.deepEqual(type('Patio only', ' i'), [true, 'Patio only i'], 'lower case: a space');
  assert.deepEqual(type('Patio only', 'i'), [true, 'Patio only i']);
  assert.deepEqual(type('Patio only', ' D'), [true, 'Patio only. D'], 'a capital: a new sentence, as before');
  assert.deepEqual(type('Takeout', ' c', ', '), [true, 'Takeout, c'], 'the takeout chips keep their comma');
});

test('holidays: one that is always on a weekday the place is closed (Family Day, closed Mondays) is not offered; Christmas always is', () => {
  assert.equal(text.en.holClosedDay, 'You’re closed {day}s'); assert.equal(text.fr.holClosedDay, 'Vous êtes fermé le {day}');
  const s = CLIENT();
  const DAYS7 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const week = { mon: null, tue: null, wed: null, thu: [['13:00', '19:00']], fri: [['13:00', '20:00']], sat: [['12:00', '20:00']], sun: [['12:00', '18:00']] };
  const ctx = { S: { week, seaList: [{ on: true, src: { from: '10-13', to: '11-27' }, week: { ...week, thu: null } }] }, DAYS: DAYS7, mdInRange: (md, from, to) => (from <= to ? md >= from && md <= to : md >= from || md <= to) };
  clientPart('  function holWeekClosed(o){', '  // ', ctx);
  assert.equal(vm.runInNewContext('holWeekClosed({ key: "family", date: "2027-02-15" })', ctx), 'mon', 'Family Day 2027 is a Monday');
  assert.equal(vm.runInNewContext('holWeekClosed({ key: "goodFri", date: "2027-03-26" })', ctx), '', 'open Fridays');
  assert.equal(vm.runInNewContext('holWeekClosed({ key: "xmas", date: "2028-12-25" })', ctx), '', 'Christmas on a Monday is still offered (it moves)');
  assert.equal(vm.runInNewContext('holWeekClosed({ key: "thanks", date: "2027-10-11" })', ctx), 'mon');
  // No hours at all (by appointment): nothing is taken away.
  ctx.S.week = {}; ctx.S.seaList = [];
  assert.equal(vm.runInNewContext('holWeekClosed({ key: "family", date: "2027-02-15" })', ctx), '');
  // Inside a stored stretch, the stretch's week decides (Thursday closed only in the off-season).
  ctx.S.week = week; ctx.S.seaList = [{ on: true, src: { from: '10-01', to: '11-27' }, week: { ...week, mon: [['13:00', '17:00']] } }];
  assert.equal(vm.runInNewContext('holWeekClosed({ key: "thanks", date: "2027-10-11" })', ctx), '', 'open Mondays in the stretch that covers Thanksgiving');
  // The tile is shown, not tappable, with the reason.
  assert.match(s, /var wkc = !cov && S\.closures\.indexOf\(o\.key\) < 0 && T\.holClosedDay \? holWeekClosed\(o\) : ''/);
  assert.match(s, /\(cov \? ' disabled' : ''\) \+ \(wkc \? ' disabled data-wkc="' \+ wkc \+ '"' : ''\)/);
  assert.match(s, /h\(fill\(T\.holClosedDay, \{ day: longDay\(wkc\) \}\)\)/);
});

test('"Adults only (19+)" in the setup takes research\'s Kid-friendly badge off the stored row (logged); other answers leave it', async () => {
  const { v } = await graham();
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(v.id).kid_friendly, 0);
  const row = db.prepare("SELECT old_value, new_value, source, source_ref FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'kid_friendly' ORDER BY id DESC").get(v.id);
  assert.deepEqual({ ...row }, { old_value: '1', new_value: '0', source: 'venue_owner', source_ref: 'setup: adults only (19+)' });
  assert.equal(app.getVenue(v.id).kid_friendly, false);
  // The answer taken back (an Undo): the badge this rule took off comes back, so research's badge stands again.
  ok(await change(tokenFor(v.id), { brewery_info: { minors: null } }));
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(v.id).kid_friendly, 1);
  assert.equal(app.getVenue(v.id).kid_friendly, true);
  // A badge the owner unticked herself is never put back by it.
  const own = mk('distillery', { kid_friendly: 0 }); ok(await change(tokenFor(own.id), { brewery_info: { minors: { policy: 'adults' } } })); ok(await change(tokenFor(own.id), { brewery_info: { minors: null } }));
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(own.id).kid_friendly, 0);
  const b = mk('distillery', { kid_friendly: 1 }); ok(await change(tokenFor(b.id), { brewery_info: { minors: { policy: 'all_ages' } } }));
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(b.id).kid_friendly, 1);
  const c = mk('brewery', { kid_friendly: 1 }); ok(await change(tokenFor(c.id), { brewery_info: { food: 'snacks' } }));
  assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(c.id).kid_friendly, 1, 'no kids answer: untouched');
});

// ====================== 10. An event's name ======================
test('event name: a price after the kind\'s name, then a comma, splits like a comma after the name ("Distillery tour $20, by booking")', () => {
  const ctx = { T: { kinds: { tour: 'Distillery tour', class: 'Class' } }, C: { nightKindsEn: { tour: 'Tour', class: 'Class' } }, NT_MAX: 40, NT_DETAIL_MAX: 80 };
  clientPart('  function ntSplit(text, kind){', '  function ntHint(text, kind){', ctx);
  const sp = (t, k) => { const r = vm.runInNewContext('ntSplit(t, k)', { ...ctx, t, k }); return [r.title, r.detail]; };
  assert.deepEqual(sp('Distillery tour $20, by booking', 'tour'), ['Distillery tour', '$20, by booking']);
  assert.deepEqual(sp('Distillery tour, $20, book ahead', 'tour'), ['Distillery tour', '$20, book ahead'], 'brewery test 3\'s rule holds for a distillery');
  assert.deepEqual(sp('Tour 20 $, sur réservation', 'tour'), ['Tour', '20 $, sur réservation']);
  assert.deepEqual(sp('Distillery tour with the owner, book', 'tour'), ['Distillery tour with the owner, book', ''], 'other words after the name: left whole');
  assert.deepEqual(sp('Cocktail class', 'class'), ['Cocktail class', '']);
  assert.deepEqual(sp('Distillery tour $20, by booking', 'other'), ['Distillery tour $20, by booking', '']);
});

test('the other setup types still load, in English and French', async () => {
  for (const type of ['pub', 'restaurant', 'cafe', 'winery', 'brewery', 'cocktail', 'distillery']) for (const fr of [false, true]) {
    const v = mk(type); const r = await get(`${fr ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`);
    assert.equal(r.status, 200, `${type} ${fr ? 'fr' : 'en'}`);
    const cfg = cfgOf(r.text);
    assert.ok(cfg && cfg.lang === (fr ? 'fr' : 'en'), `${type} cfg`);
  }
});

test('Build My Trip page: a quoted word in "what we understood" keeps its last letters (“cocktail class” read "Cocktail cla")', async () => {
  const html = (await get('/trip')).text;
  assert.ok(html.includes(`replace(/^[“"«] *| *[”"»]$/g, '')`), 'the quotes come off, nothing else');
  assert.ok(!html.includes('replace(/^[“"«]s*|s*[”"»]$/g'), 'the regex that ate a trailing s is gone');
  const strip = (x) => String(x).replace(/^[“"«] *| *[”"»]$/g, '');
  assert.equal(strip('“cocktail class”'), 'cocktail class'); assert.equal(strip('« tacos »'), 'tacos');
});

test('Build My Trip: a plain "class" is a listed class only while some place lists one (the reading is as before otherwise)', () => {
  const s = SERVER();
  assert.match(s, /\.replace\(OWN_CLASS_BARE_RE, \(m, lead\) => \(tripAnyClassListed\(\) \? `\$\{lead \|\| ''\}masterclass` : m\)\)/);
  assert.equal(typeof app.tripAnyClassListed, 'function');
  assert.equal(app.tripAnyClassListed(), true, 'the fixtures above list a cocktail class');
});
