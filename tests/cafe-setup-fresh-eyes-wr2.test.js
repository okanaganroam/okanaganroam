// Second first-time café owner test on Whistler (Élodie, iPhone, French, a bakery; Whistler Roam
// drafts/fresh-eyes-cafe2-2026-11-15/REPORT.md). The code is shared, so the fixes are made here: a dietary note is shown in
// the language it was written in (it is an allergy warning); dogs "outside only" (a quick answer, the tile, honest chips,
// and a chip never lit by a sentence that says no); the help answers nothing gluten-free, takeout and a recurring
// workshop, and never brings up happy hour for a place that can't have one; French holiday names in the status line; short
// event details ("By reservation") kept; the French edit page's event boxes; "No, nothing gluten-free"; and the small ones.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-wr2-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const tp = require('../trip-planner.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const WEEK = (o, c) => JSON.stringify(WK(o, c));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Lake Test ${++n}`, slug: `lake-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK('07:00', '17:00'),
  description: 'A fixture used only by the second Whistler café fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.13.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const names = (p) => (p.recommendations || []).map((x) => x.venue && x.venue.name);
const MAYA_RESEARCH = [{ label: 'Known for', text: 'Espresso and house-baked pastries' }, { label: 'Prices', text: 'Coffee from $4' }, { label: 'Kids & dogs', text: 'Dog friendly patio' }, { label: 'Good to know', text: 'Free Wi-Fi' }];
// Maya's café: stored cuisine "Coffee shop", research lines, badges from research.
const maya = (o = {}) => {
  const v = mk('cafe', { name: `Lost Lake Coffee House ${n + 1}`, cuisine: 'Coffee shop', price: '$', dog_friendly: 1, vegan: 1, gluten_free: 1, patio: 1, kid_friendly: 1, ...o });
  research(v.id, MAYA_RESEARCH);
  return v;
};
const frCopy = require('../trip-french-copy.js');
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const dietLine = (h) => { const m = /🌱<\/span>\s*<span[^>]*>([^<]*)</.exec(h) || /🌱\s*(?:<[^>]+>\s*)*([^<]+)</.exec(h); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
const clientSlice = (from, to, ctx, tail) => { const s = CLIENT(); vm.runInNewContext(s.slice(s.indexOf(from), s.indexOf(to)) + tail, ctx); return ctx; };
const NOTE_FR = 'Rien sans gluten : farine partout dans la cuisine. Nos produits peuvent contenir des noix.';

// ---------- 1. The dietary note, in the language it was written in ----------
test('a dietary note typed in the French setup shows on the French page only; one typed in English shows on both (the French page falls back)', async () => {
  const v = maya(); const t = tokenFor(v.id);
  ok(await change(t, { cafe_info: { diet: { milks: ['oat'], note_fr: NOTE_FR } } }));
  assert.deepEqual(app.cafeInfoLinesHtml(app.getVenue(v.id), true).includes('farine partout dans la cuisine'), true, 'on the French page');
  assert.match(plain(page(v, 'fr')), /Laits végétaux\s?: avoine\. Rien sans gluten\s?: farine partout dans la cuisine\. Nos produits peuvent contenir des noix\./);
  assert.doesNotMatch(page(v), /farine partout|peuvent contenir/, 'never as English on the English page');
  assert.match(plain(page(v)), /Dairy-free milks: oat/);
  // English only: both pages (an allergy warning is never left off the French page).
  const e = maya(); ok(await change(tokenFor(e.id), { cafe_info: { diet: { note: 'Nothing gluten-free: flour everywhere. May contain nuts.' } } }));
  assert.match(page(e), /Nothing gluten-free: flour everywhere\. May contain nuts\./);
  assert.match(page(e, 'fr'), /Nothing gluten-free: flour everywhere\. May contain nuts\./);
  // Both: each page its own.
  ok(await change(tokenFor(e.id), { cafe_info: { diet: { note: 'May contain nuts.', note_fr: 'Peut contenir des noix.' } } }));
  assert.match(page(e), /May contain nuts\./); assert.doesNotMatch(page(e), /Peut contenir/);
  assert.match(page(e, 'fr'), /Peut contenir des noix\./); assert.doesNotMatch(page(e, 'fr'), /May contain/);
  // Too long, or not a string, is refused like the English note.
  assert.equal((await change(t, { cafe_info: { diet: { note_fr: 'x'.repeat(200) } } })).status, 400);
});

test('the setup sends the dietary note as the language of the setup (note in English, note_fr in French), and keeps the other', () => {
  const s = CLIENT();
  assert.match(s, /diet: \{ milks: \{\}, [^\n]*note: noteIn\(CId\) \}/, 'the box shows the note of this setup’s language');
  assert.match(s, /noteOut\(CId, dnote, dv\); if \(!dv\.note\) delete dv\.note;/);
  assert.match(s, /if \(gfNone\) S\.badges\.gluten_free = false;\n\s+CId = dv;/, 'the stored note is kept for the next save');
  const fr = clientSlice('  function noteIn(o)', '  S.kitchen = {', { C: { lang: 'fr' } }, 'this.f = noteOut; this.g = noteIn;');
  assert.deepEqual({ ...fr.f({}, NOTE_FR, { milks: [] }) }, { milks: [], note: '', note_fr: NOTE_FR });
  assert.deepEqual({ ...fr.f({ note: 'May contain nuts.', note_fr: 'Peut contenir des noix.' }, 'Peut contenir des noix.', {}) }, { note: 'May contain nuts.', note_fr: 'Peut contenir des noix.' }, 'unchanged keeps both');
  assert.equal(fr.g({ note: 'May contain nuts.' }), 'May contain nuts.', 'the French setup shows her English note when there is no French one');
  const en = clientSlice('  function noteIn(o)', '  S.kitchen = {', { C: { lang: 'en' } }, 'this.f = noteOut; this.g = noteIn;');
  assert.deepEqual({ ...en.f({ note_fr: 'Peut contenir des noix.' }, 'May contain nuts.', {}) }, { note: 'May contain nuts.', note_fr: 'Peut contenir des noix.' });
  assert.equal(en.g({ note_fr: 'Peut contenir des noix.' }), '', 'the English setup never shows the French note as English');
  // The English setup says where a French-only note is.
  assert.match(s, /C\.lang !== 'fr' && !dt\.note && CId\.note_fr \? frOnlyHint\('suDnoteFr'\)/);
});

// ---------- 2. Dogs: outside only ----------
test('dogs "outside only": a quick answer and a wider tile (EN + FR), and honest chips on cards and pages', async () => {
  assert.deepEqual(text.en.cafe.quickDogsNoPatio, ['Dogs welcome inside', 'Dogs outside only', 'Water bowls at the door']);
  assert.deepEqual(text.fr.cafe.quickDogsNoPatio, ['Chiens bienvenus à l’intérieur', 'Chiens à l’extérieur seulement', 'Bols d’eau à l’entrée']);
  assert.equal(text.en.brewery.quickDogsNoPatio[1], 'Dogs outside only'); assert.equal(text.fr.brewery.quickDogsNoPatio[1], 'Chiens à l’extérieur seulement');
  assert.equal(text.en.offers.dog_friendly, 'Dogs welcome (even just outside or on the patio)');
  assert.equal(text.fr.offers.dog_friendly, 'Chiens bienvenus (même juste dehors ou sur la terrasse)');
  const v = maya({ patio: 0 }); const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(cfg.offerLabels.dog_friendly, 'Chiens bienvenus (même juste dehors ou sur la terrasse)');
  assert.ok(cfg.t.quickDogsNoPatio.includes('Chiens à l’extérieur seulement'));
  // Before her answer: the plain chips, as always.
  assert.equal(app.dogsOutsideOnly(app.getVenue(v.id)), false);
  assert.match(app.cardBadgeChipsHtml(app.getVenue(v.id)), /Dogs OK/);
  // The chip, tapped in the French setup: French line; cards and both pages say outside only, never "Dogs OK" / "Dog-friendly".
  ok(await change(t, { visit_rows: { dogs: 'Chiens à l’extérieur seulement', _lang: 'fr' } }));
  assert.equal(app.dogsOutsideOnly(app.getVenue(v.id)), true);
  const card = app.cardBadgeChipsHtml(app.getVenue(v.id));
  assert.match(card, /Dogs outside only/); assert.doesNotMatch(card, /Dogs OK/);
  const frList = (await get('/fr/kelowna/cafes')).text; const k = frList.indexOf(`data-venue-id="${v.id}"`);
  const frCard = frList.slice(k, frList.indexOf('</li>', k));
  assert.match(frCard, /Chiens à l’extérieur seulement/); assert.doesNotMatch(frCard, /Chiens OK/);
  const en = page(v), fr = page(v, 'fr');
  assert.match(plain(en), /🐾 Dogs outside only/); assert.doesNotMatch(plain(en), /🐾 Dog-friendly/);
  assert.match(fr, /Chiens à l’extérieur seulement/); assert.doesNotMatch(fr, /Accepte les chiens/);
  // Her own words count too (English or French), for any type; a line that welcomes dogs inside does not.
  for (const [line, want] of [['Dogs welcome on the patio, not inside', true], ['No dogs inside. Hook and water bowl out front.', true], ['Dogs welcome inside', false], ['Dogs welcome inside and on the patio', false], ['Water bowls at the door', false]]) {
    const p = mk('restaurant', { dog_friendly: 1 }); ok(await change(tokenFor(p.id), { visit_rows: { dogs: line } }));
    assert.equal(app.dogsOutsideOnly(app.getVenue(p.id)), want, line);
    if (want) { assert.match(app.venueBadgeChipsHtml(app.getVenue(p.id), {}), /Dogs outside only/); assert.match(app.venueBadgeChipsHtml(app.getVenue(p.id), { fr: true }), /Chiens à l’extérieur seulement/); }
  }
  const q = mk('cafe', { dog_friendly: 1 }); ok(await change(tokenFor(q.id), { visit_rows: { dogs: 'Pas de chiens à l’intérieur. Crochet et bol d’eau dehors.', _lang: 'fr' } }));
  assert.equal(app.dogsOutsideOnly(app.getVenue(q.id)), true);
  // "Patio only" keeps its own chip; research's line never decides it; no badge, no chip.
  const pat = mk('cafe', { dog_friendly: 1, patio: 1 }); ok(await change(tokenFor(pat.id), { visit_rows: { dogs: 'Patio only' } }));
  assert.match(app.cardBadgeChipsHtml(app.getVenue(pat.id)), /Dogs on patio/);
  const rs = mk('cafe', { dog_friendly: 1 }); research(rs.id, [{ label: 'Dogs', text: 'Dogs outside only' }]);
  assert.equal(app.dogsOutsideOnly(app.getVenue(rs.id)), false, 'only the owner’s own line');
  assert.equal(app.dogsOutsideOnly({ ...app.getVenue(v.id), dog_friendly: 0 }), false);
});

test('a quick-answer chip is not lit by a sentence that says no (« Pas de … », "No …", "not …", « aucun »)', () => {
  const ctx = clientSlice('  function has(v, t){', '  // Cocktail test 3 (2026-11-14): a Groups line in sentences.', {}, 'this.saysIt = saysIt;');
  const fr = text.fr.cafe.quickDogsNoPatio, en = text.en.cafe.quickDogsNoPatio;
  const lit = (v, list) => list.filter((c) => ctx.saysIt(v, c, list));
  assert.deepEqual(lit('Pas de chiens à l’intérieur', fr), []);
  assert.deepEqual(lit('Aucun chien à l’intérieur', fr), []);
  assert.deepEqual(lit('Chiens non admis à l’intérieur', fr), []);
  assert.deepEqual(lit('No dogs inside', en), []);
  assert.deepEqual(lit('Dogs are not allowed inside', en), []);
  assert.deepEqual(lit('We don’t allow dogs inside', en), []);
  assert.deepEqual(lit('No dogs welcome inside', en), [], 'even with the chip’s own words after the no');
  assert.deepEqual(lit('Pas de chiens à l’intérieur. Bols d’eau à l’entrée', fr), ['Bols d’eau à l’entrée']);
  // What a sentence does say still lights its chip.
  assert.deepEqual(lit('Chiens bienvenus à l’intérieur', fr), ['Chiens bienvenus à l’intérieur']);
  assert.deepEqual(lit('Dogs welcome inside', en), ['Dogs welcome inside']);
  assert.deepEqual(lit('Chiens à l’extérieur seulement, pas à l’intérieur', fr), ['Chiens à l’extérieur seulement']);
  assert.deepEqual(lit('Dogs outside only', en), ['Dogs outside only']);
  const full = text.en.quick.dogs;
  assert.deepEqual(lit('Patio only, not inside', full), ['Patio only'], 'the part before the comma still counts');
  assert.deepEqual(lit('Not inside. Patio only', full), ['Patio only']);
  assert.deepEqual(lit('Dogs welcome on the patio, not inside', full), [], '"Inside and patio" is not lit by "not inside"');
  assert.deepEqual(lit('No dogs on the patio', full), []);
  // Other boxes are unchanged.
  const res = text.en.quick.reservations;
  assert.deepEqual(lit('Walk-ins welcome too', res), ['Walk-ins welcome too']);
  assert.deepEqual(lit('Call us', res), ['Call us']);
});

// ---------- 3. Help ----------
test('help in a café’s setup: nothing gluten-free, takeout, a recurring workshop (EN + FR); never happy hour for a place without alcohol', async () => {
  const v = maya(); const t = tokenFor(v.id);
  const html = (await get(`/fr/owner/${t}/setup`)).text;
  const hb = helpBot(html);
  const want = [
    ['on n’a rien sans gluten', 'cafe-no-gluten-free'], ['we have nothing gluten-free', 'cafe-no-gluten-free'], ['nothing here is gluten free', 'cafe-no-gluten-free'], ['aucune option sans gluten', 'cafe-no-gluten-free'],
    ['on fait du pour emporter', 'cafe-takeout'], ['we do takeout', 'cafe-takeout'], ['coffee to go', 'cafe-takeout'],
    ['où est-ce que j’ajoute mon atelier', 'cafe-events'], ['where do I add my workshop', 'cafe-events'], ['how do I add an event', 'cafe-events'],
    ['mon atelier est après la fermeture', 'cafe-event-late'], ['lait d’avoine', 'cafe-milks'], ['pas de wifi', 'cafe-wifi'], ['faut-il dire que nous ne servons pas d’alcool', 'cafe-no-alcohol'], ['commander en ligne', 'cafe-order-link'],
  ];
  for (const [q, id] of want) assert.equal(hb.best(q).id, id, `"${q}" -> ${JSON.stringify(hb.best(q))}`);
  assert.match(hb.topic('cafe-no-gluten-free').aFr, /^<p>Ici même, dans la configuration\s: laissez <strong>Options sans gluten<\/strong> décoché sous <strong>Ce que vous offrez<\/strong>, puis écrivez-le sous <strong>Détails alimentaires<\/strong>/);
  assert.match(hb.topic('cafe-no-gluten-free').a, /^<p>Right here in setup: leave <strong>Gluten-free options<\/strong> unticked on <strong>What you offer<\/strong>, then say so under <strong>Dietary details<\/strong>: tap <strong>No, nothing gluten-free<\/strong>/);
  assert.match(hb.topic('cafe-takeout').aFr, /^<p>Sur votre page de modification, ouvrez <strong>Caractéristiques<\/strong> et cochez <strong>Pour emporter<\/strong>\.<\/p>$/);
  assert.match(hb.topic('cafe-takeout').a, /^<p>On your edit page, open <strong>Badges<\/strong> and tick <strong>Takeout<\/strong>\.<\/p>$/);
  assert.match(hb.topic('cafe-events').aFr, /^<p>Il revient chaque semaine ou chaque mois\s\? Sur votre page de modification, ouvrez <strong>Événements de la semaine<\/strong>[^<]*<strong>À quelle fréquence\s\?<\/strong>/);
  assert.match(hb.topic('cafe-events').a, /^<p>Is it on every week or every month\? On your edit page, open <strong>Weekly events<\/strong>.*<strong>How often\?<\/strong>.*A one-off event on a single date\? On your edit page, scroll to <strong>Add an event<\/strong>/);
  // French typography: a (narrow no-break) space before the semicolon.
  assert.match(hb.topic('cafe-event-late').aFr, /avec ces heures ; vos heures d’ouverture/);
  // Never happy hour: no sentence in any other answer, and never a follow-up chip.
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]);
  const hh = /happy hour|5 à 7/i;
  for (const tp of cfg.topics) if (!cfg.noChip.includes(tp.id)) assert.doesNotMatch(`${tp.a} ${tp.aFr}`, hh, tp.id);
  assert.ok(cfg.noChip.includes('hh-times') && cfg.noChip.includes('hh-deals') && cfg.noChip.includes('cafe-happy'), JSON.stringify(cfg.noChip));
  for (const tp of cfg.topics) if (cfg.noChip.includes(tp.id)) assert.match(`${tp.q} ${tp.qFr}`, hh, `${tp.id} is a happy hour question`);
  assert.match(hb.topic('features').aFr, /Les visiteurs s’en servent pour filtrer\. Touchez ensuite/);
  assert.match(hb.topic('features').a, /Visitors use them to filter\. Then tap/);
  assert.ok(!cfg.start.some((id) => cfg.noChip.includes(id)));
  assert.match(app.OWNER_HELP_SCRIPT || html, /if \(!t \|\| \(cfg\.noChip \|\| \[\]\)\.indexOf\(id\) >= 0\) return;/, 'chips skip them');
  // Asking about happy hour itself is still answered.
  assert.equal(hb.best('happy hour').id, 'cafe-happy');
  // The edit page too, in its own words.
  const edit = helpBot((await get(`/owner/${t}`)).text);
  assert.equal(edit.best('we do takeout').id, 'cafe-takeout'); assert.match(edit.topic('cafe-takeout').a, /^<p>On this page, open <strong>Badges<\/strong>/);
  assert.equal(edit.best('where do I add my workshop').id, 'cafe-events'); assert.match(edit.topic('cafe-events').a, /On this page, open <strong>Weekly events<\/strong>/);
  assert.equal(edit.best('nothing gluten free').id, 'cafe-no-gluten-free'); assert.match(edit.topic('cafe-no-gluten-free').a, /^<p>In <strong>Set up your page<\/strong>: leave/);
  assert.doesNotMatch(edit.topic('features').a, hh);
  // A place with a happy hour keeps every word: a restaurant, and a café that serves beer and wine.
  const rest = (await get(`/owner/${tokenFor(mk('restaurant').id)}`)).text;
  assert.match(helpBot(rest).topic('features').a, /If you serve alcohol you can also add your <strong>happy hour<\/strong> days and times\./);
  assert.equal(JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(rest)[1]).noChip, undefined);
  const bw = maya(); ok(await change(tokenFor(bw.id), { cafe_info: { serves: ['espresso', 'beer_wine'] } }));
  assert.equal(cfgOfHelp((await get(`/owner/${tokenFor(bw.id)}/setup`)).text).noChip, undefined);
  // The helper.
  assert.equal(app.helpWithoutHappyHour('<p>Hours, features, happy hour, price range and photos.</p>'), '<p>Hours, features, price range and photos.</p>');
  assert.equal(app.helpWithoutHappyHour('<ul><li>One.</li><li>Your <strong>happy hour</strong> is here.</li></ul>'), '<ul><li>One.</li></ul>');
  assert.equal(app.helpWithoutHappyHour('<p>Rien à voir.</p>'), '<p>Rien à voir.</p>');
});
const cfgOfHelp = (html) => JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]);

// ---------- 4. French holiday names in the status line ----------
test('the French status line says a holiday in French: « Fermé aujourd’hui (Noël) », « (Jour de l’An) »', async () => {
  assert.equal(app.frStatusText('Closed today (Christmas Day)'), `Fermé aujourd’hui (${text.fr.holidays.xmas})`);
  assert.equal(app.frStatusText('Closed today (New Year’s Day) · Opens Sat 7 AM'), `Fermé aujourd’hui (${text.fr.holidays.nyd}) · ouvre sam. à 7 h`);
  assert.equal(app.frStatusText('Closed today (Boxing Day)'), `Fermé aujourd’hui (${text.fr.holidays.boxing})`);
  assert.equal(app.frStatusText('Closed today (holiday)'), 'Fermé aujourd’hui (jour férié)');
  assert.match(text.fr.holidays.xmas, /^Noël/); assert.match(text.fr.holidays.nyd, /^Jour de l’An/);
  // On the page, for a holiday tapped in the setup (stored by its English name).
  const v = maya(); const y = Number(today.slice(0, 4)) + (today.slice(5) > '12-25' ? 1 : 0);
  ok(await change(tokenFor(v.id), { closures: [{ from: `${y}-12-25`, to: `${y}-12-25`, note: 'Christmas Day' }] }));
  const now = new Date(`${y}-12-25T20:00:00Z`);
  assert.match(plain(page(v, 'fr', now)), new RegExp(`Fermé aujourd’hui \\(${text.fr.holidays.xmas}\\)`));
  assert.doesNotMatch(plain(page(v, 'fr', now)), /\(Christmas Day\)/);
  assert.match(plain(page(v, 'en', now)), /Closed today \(Christmas Day\)/);
});

// ---------- 5. Short event details ----------
test('a short event detail that says how to get in is kept ("By reservation", « Sur réservation »); details that only restate the row are still hidden', async () => {
  const d = (s, fr = false) => app.nightShownText({ host: null, cost: null, kind: 'other', ...s }, s.title, s.detail, fr).detail;
  assert.equal(d({ title: 'Sourdough workshop', detail: 'By reservation' }), 'By reservation');
  assert.equal(d({ title: 'Atelier de pain au levain', detail: 'Sur réservation' }, true), 'Sur réservation');
  assert.equal(d({ title: 'Latte art night', detail: 'Sign up ahead' }), 'Sign up ahead');
  assert.equal(d({ title: 'Cupping', detail: 'Free' }), 'Free');
  assert.equal(d({ title: 'Soirée tricot', detail: 'Inscription requise' }, true), 'Inscription requise');
  // Still noise: it restates the row, its frequency or its cost.
  assert.equal(d({ title: 'Karaoke', kind: 'karaoke', detail: 'Karaoke two nights a week' }), '');
  assert.equal(d({ title: 'Open mic', kind: 'open_mic', detail: 'Weekly open mic for local performers' }), '');
  assert.equal(d({ title: 'Live music', kind: 'live_music', detail: 'Live music every Friday' }), '');
  assert.equal(d({ title: 'Cupping', cost: 'Free', detail: 'Free' }), '', 'the cost already says it');
  assert.equal(d({ title: 'Reservation night', detail: 'Reservation' }), '', 'the title already says it');
  // On both pages.
  const v = maya(); const t = tokenFor(v.id);
  ok(await change(t, { weekly_nights: [{ days: ['sun'], kind: 'other', title: 'Sourdough workshop', title_fr: 'Atelier de pain au levain', detail: 'By reservation', detail_fr: 'Sur réservation', start: '16:00', end: '18:00', frequency: 'monthly-1st', host: null, cost: null }] }));
  assert.match(plain(page(v)), /Sourdough workshop\s+4 PM – 6 PM\s+By reservation|Sourdough workshop[^.]{0,40}By reservation/);
  assert.match(plain(page(v, 'fr')), /Atelier de pain au levain[^.]{0,40}Sur réservation/);
});

// ---------- 6. The French edit page's events ----------
test('the French edit page labels the events’ first boxes « En anglais », opens the French boxes, and takes French alone; "Weekly events" on the jump chip', async () => {
  const v = maya(); const t = tokenFor(v.id);
  const fr = (await get(`/fr/owner/${t}`)).text;
  const k = fr.indexOf('data-wn="1"'), box = fr.slice(k, fr.indexOf('</fieldset>', k));
  assert.match(box, /<span class="op-hint op-wn-en-label">En anglais \(pour votre page anglaise\) :<\/span>\s*<input type="text" class="op-wn-title" lang="en"[^>]*aria-label="Événement 1\s: nom en anglais" placeholder="Latte art night">/);
  assert.match(box, /class="op-wn-detail" lang="en"[^>]*placeholder="All welcome, no need to sign up"/);
  assert.match(box, /<details class="op-sp-fr" open><summary>En français \(pour votre page française\)<\/summary>\s*<input type="text" class="op-wn-title-fr" lang="fr"[^>]*placeholder="Soirée d’art latté">\s*<input type="text" class="op-wn-detail-fr" lang="fr"[^>]*placeholder="Ouvert à tous, sans inscription">/);
  assert.match(fr, /id="opNightsLabel">Événements de la semaine<\/span> <span class="op-fold-hint">Aucun pour l’instant<\/span>/);
  // The English edit page is as before.
  const en = (await get(`/owner/${t}`)).text; const ke = en.indexOf('data-wn="1"'), boxEn = en.slice(ke, en.indexOf('</fieldset>', ke));
  assert.doesNotMatch(boxEn, /op-wn-en-label|lang="en"/);
  assert.match(boxEn, /<details class="op-sp-fr"><summary>In French \(optional\)<\/summary>/);
  assert.match(boxEn, /placeholder="Latte art night"/);
  // A pub's French edit page keeps « Aucune pour l’instant » (soirées).
  assert.match((await get(`/fr/owner/${tokenFor(mk('pub').id)}`)).text, /id="opNightsLabel">Soirées de la semaine<\/span> <span class="op-fold-hint">Aucune pour l’instant<\/span>/);
  // French alone (title and detail): on the French page only, never as English on the English page.
  const ok1 = app.validateWeeklyNights([{ days: ['sun'], kind: 'other', title: '', title_fr: 'Atelier de pain au levain', detail: null, detail_fr: 'Sur réservation', start: '16:00', end: '18:00', frequency: 'monthly-1st' }], { source: 'venue_owner', checked_at: today, type: 'cafe' });
  assert.equal(ok1.ok, true, JSON.stringify(ok1));
  const bad = app.validateWeeklyNights([{ days: ['sun'], kind: 'other', title: 'Workshop', title_fr: 'Atelier', detail: null, detail_fr: 'Sur réservation', frequency: 'weekly' }], { source: 'venue_owner', checked_at: today, type: 'cafe' });
  assert.equal(bad.ok, false, 'with an English title, a French detail still needs the English one');
  ok(await change(t, { weekly_nights: [{ days: ['sun'], kind: 'other', title: '', title_fr: 'Atelier de pain au levain', detail: null, detail_fr: 'Sur réservation', start: '16:00', end: '18:00', frequency: 'monthly-1st', host: null, cost: null },
    { days: ['thu'], kind: 'other', title: 'Latte art night', title_fr: null, detail: null, detail_fr: null, start: '18:00', end: null, frequency: 'weekly', host: null, cost: null }] }));
  const pe = page(v), pf = page(v, 'fr');
  assert.doesNotMatch(pe, /Atelier de pain|Sur réservation/);
  assert.match(plain(pf), /Atelier de pain au levain[^.]{0,40}Sur réservation/);
  assert.match(pf, /<span class="venue-wn-title">Atelier de pain au levain<\/span>/, 'no lang="en" on her French title');
  // The English page's jump chip says what the section says.
  assert.match(pe, /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.doesNotMatch(plain(pe.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')), /Weekly nights/);
  assert.equal(app.cafePageProfile(app.getVenue(v.id), {}, { hasNights: true }).dealsLabel, 'Weekly events');
  assert.equal(app.cafePageProfile(app.getVenue(v.id), {}, { hasNights: true, hasSpecials: true }).dealsLabel, 'Specials & events');
  assert.equal(app.cafePageProfile(app.getVenue(v.id), {}, { hasNights: true, hasHappyDeals: true }).dealsLabel, undefined);
});

// ---------- 7. "No, nothing gluten-free" ----------
test('the gluten question has a "No, nothing gluten-free" answer: the page says so first, and no list or trip offers the café for gluten-free', async () => {
  assert.equal(text.en.cafe.gf.none || text.en.gf.none, 'No, nothing gluten-free');
  assert.match(text.fr.cafe.gf ? text.fr.cafe.gf.none : text.fr.gf.none, /^Non, rien sans gluten$/);
  const s = CLIENT();
  assert.match(s, /radios\('diet\.gf_kitchen', \['dedicated', 'shared', 'none'\], T\.gf\)/);
  assert.match(s, /var gfNone = dv\.gf_kitchen === 'none' && !!S\.badges\.gluten_free;\n\s+if \(gfNone\) dl\.push\(\{ badges: \{ gluten_free: false \} \}\);/, 'the Gluten-free options badge comes off with it');
  const v = maya({ name: 'Flour Everywhere Bakery', gluten_free: 1, vegan: 1 }); const t = tokenFor(v.id);
  ok(await change(t, { cafe_info: { serves: ['breakfast', 'espresso'] } }));
  const q = 'A vegan and gluten-free breakfast in Kelowna at 8am on Monday January 10 2028';
  assert.ok(names(await plan(q)).includes('Flour Everywhere Bakery'), 'offered while its badge says gluten-free');
  // What the setup sends for "No, nothing gluten-free".
  ok(await change(t, { cafe_info: { diet: { milks: ['oat'], gf_kitchen: 'none' } } }));
  ok(await change(t, { badges: { gluten_free: false } }));
  assert.match(plain(page(v)), /🌱\s+Nothing gluten-free · Dairy-free milks: oat/);
  assert.match(plain(page(v, 'fr')), /🌱\s+Rien sans gluten · Laits végétaux\s?: avoine/);
  assert.doesNotMatch(page(v), /Gluten-free options|Gluten-free \(dedicated kitchen\)/);
  assert.ok(!names(await plan(q)).includes('Flour Everywhere Bakery'), 'not offered for gluten-free');
  // Even with the badge still on (an older page), the chip never says "dedicated kitchen".
  const w = maya({ gluten_free: 1 }); ok(await change(tokenFor(w.id), { cafe_info: { diet: { gf_kitchen: 'none' } } }));
  assert.equal(app.cafePageProfile(app.getVenue(w.id), {}).highlightLabels, undefined);
  assert.equal((await change(t, { cafe_info: { diet: { gf_kitchen: 'maybe' } } })).status, 400);
});

// ---------- 8. Small ----------
test('Build My Trip in French: « Lieux qui mentionnent le déjeuner », « (confirmés par l’entreprise) », a space before « ; » in the hours, and the asked-time caveat', () => {
  assert.equal(frCopy.t3FrenchSummary('Places that mention “breakfast” in Kelowna on Saturday morning.'), 'Lieux qui mentionnent le déjeuner à Kelowna samedi matin.');
  assert.equal(frCopy.t3FrenchSummary('Places that mention “ramen” and “lunch” in Kelowna.'), 'Lieux qui mentionnent « ramen » et le dîner à Kelowna.');
  assert.equal(frCopy.t3FrenchText('Places that mention “breakfast” in Kelowna.'), 'Lieux qui mentionnent le déjeuner à Kelowna.');
  assert.equal(frCopy.t3FrenchText('Listed hours: 07:00–15:00 Wed–Sun; closed Mon–Tue'), 'Horaires indiqués : 7 h–15 h mer.–dim. ; fermé lun.–mar.');
  assert.equal(frCopy.t3FrenchText('Listed hours: 07:00–15:00 Sat–Sun; 07:00–17:00 Mon–Fri'), 'Horaires indiqués : 7 h–15 h sam.–dim. ; 7 h–17 h lun.–ven.');
  const pageJs = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(pageJs.includes("'(confirmés par l’entreprise)'")); assert.ok(!pageJs.includes('confirmées par l’entreprise'));
  // "Opens at 08:00, after the time you asked for": French words, and the page writes the time as the rest of the plan.
  const fr = frCopy.t3FrenchText('Opens at 08:00, after the time you asked for');
  assert.equal(fr, 'Ouvre à 08:00, après l’heure demandée');
  const local = new Function(`${/function t3LocalTimes\(value,language\)\{[\s\S]*?\n\}/.exec(pageJs)[0]}; return t3LocalTimes;`)();
  assert.equal(local(fr, 'fr'), 'Ouvre à 8 h, après l’heure demandée');
  assert.equal(local('Opens at 08:00, after the time you asked for', 'en'), 'Opens at 8 AM, after the time you asked for');
  assert.equal(local('Opens at 06:30, after the time you asked for', 'en'), 'Opens at 6:30 AM, after the time you asked for');
});

test('the French portal’s « Voir votre fiche » opens the French page once the listing has one (else the English page)', async () => {
  const v = maya(); const t = tokenFor(v.id);
  const before = (await get(`/fr/owner/${t}`)).text;
  assert.match(before, new RegExp(`<a href="[^"]*/kelowna/cafes/${v.slug}">Voir votre fiche</a>`)); assert.doesNotMatch(before, new RegExp(`<a href="[^"]*/fr/kelowna/cafes/${v.slug}">Voir votre fiche</a>`));
  const f = maya({ description_fr: 'Une boulangerie de quartier, pain au levain et croissants.' }); const tf = tokenFor(f.id);
  const after = (await get(`/fr/owner/${tf}`)).text;
  assert.match(after, new RegExp(`<a href="[^"]*/fr/kelowna/cafes/${f.slug}">Voir votre fiche</a>`));
  assert.match(cfgOf((await get(`/fr/owner/${tf}/setup`)).text).pageHref, new RegExp(`/fr/kelowna/cafes/${f.slug}$`));
  assert.doesNotMatch(cfgOf((await get(`/owner/${tf}/setup`)).text).pageHref, /\/fr\//);
});

test('small ones in the setup: French-only special or event said once; spend guess line; story hint; winter heading; texts in both languages', () => {
  const s = CLIENT();
  // A French-only special or event: one line on the saved screen, the first time.
  assert.equal(text.fr.frPageOnly, 'Écrit en français : visible sur votre page française seulement. Pour votre page anglaise, ajoutez-le en anglais sur votre page de modification.');
  assert.equal(text.en.frPageOnly, 'Written in French, so it shows on your French page only. For your English page, add it in English on your edit page.');
  assert.match(s, /frOnlyTell\('specials', out\);\n\s+list\.push\(\{ specials: out \}\); saveAll\('specials', list\);/);
  assert.match(s, /frOnlyTell\('music', out\);\n\s+list\.push\(\{ weekly_nights: out \}\);/);
  assert.match(s, /\(S\.frOnlyNote === p\[1\] && T\.frPageOnly \? '<p class="su-hint" id="suFrOnly">' \+ h\(T\.frPageOnly\) \+ '<\/p>' : ''\)/);
  assert.match(s, /\+ line \+ \(S\.frOnlyNote === step && T\.frPageOnly \? ' ' \+ T\.frPageOnly : ''\);/, 'and in the "Saved" toast, when the step has no saved screen');
  const ctx = clientSlice('  function frOnlyTell(step, out){', '  function apptKind(k){', { S: {} }, 'this.tell = frOnlyTell;');
  ctx.tell('specials', [{ title: 'Wing Wednesday', title_fr: null }]); assert.equal(ctx.S.frOnlyNote, undefined, 'nothing French-only');
  ctx.tell('specials', [{ title: '', title_fr: 'Mercredi croissants' }]); assert.equal(ctx.S.frOnlyNote, 'specials');
  ctx.tell('music', [{ title: '', title_fr: 'Atelier' }]); assert.equal(ctx.S.frOnlyNote, 'specials', 'said once');
  ctx.tell('specials', [{ title: '', title_fr: 'Mercredi croissants' }]); assert.equal(ctx.S.frOnlyNote, '', 'not again on the next save');
  // The French spend guess line doesn't quote research's English line.
  assert.equal(text.fr.spendGuessed, 'Estimation d’après les prix trouvés en ligne.');
  assert.match(text.en.spendGuessed, /^We guessed from your listing: “\{x\}”\.$/);
  // The story hint goes once the text is hers.
  assert.match(s, /if \(inp\.id === 'suStory' && T\.storyEnglishHint\) inp\.addEventListener\('input', function\(\)\{ var hn = el\('suStoryEdit'\); if \(hn && \(hn\._en \|\| hn\.textContent === T\.storyEnglishHint\)\) \{ hn\._en = true; hn\.hidden = inp\.value !== CUR\.description; \} \}\);/);
  // The winter screen: no « Quels mois ? » over the exact dates.
  assert.match(s, /q\(seaTitle\(\), T\.seasonEditLead\) \+ \(S\.sea\.exact \? '' : '<p class="su-q">' \+ h\(T\.whichMonths\) \+ '<\/p>'\)/);
});
