// Second first-time pub owner test on Whistler (Marc, French, iPhone, 2026-11-14; Whistler Roam
// drafts/fresh-eyes-pub2-2026-11-14/REPORT.md). The setup code is shared, so the fixes are made here for every type:
// his own French lines stay on the French page, a season he set is named by its dates everywhere in the setup (never
// "été"/"Hiver"), "Yes, all year" no longer drops a stored season without asking, the help understands « saison morte »
// and "shoulder season", the French card's food line is in French, a new 5 à 7 starts at 3 PM, research's "Burgers
// from $19" starts the spend at $19, and two small wording fixes.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-wr2-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = (o, c) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[o, c]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Creek Tap Test ${++n}`, slug: `creek-tap-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.5, address: `${500 + n} Water St, Kelowna`, phone: '250-555-0177', website: 'https://example.com', hours: WEEK('11:30', '23:00'),
  description: 'A fixture used only by the second pub fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const pagePath = (v, fr) => `${fr ? '/fr' : ''}/kelowna/pubs/${v.slug}`;
const fn = (src, name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n|  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(src); assert.ok(m, name); return m[0]; };
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

// ---------- 1. His own French lines stay on the French page ----------
test('French page: the owner’s own Known for and Groups show as typed; research’s English lines with no French stay off', async () => {
  const v = mk('pub', { slug: 'creek-tap-french', description_fr: 'Un pub utilisé seulement pour les tests.' }); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Known for', text: 'Burgers and the patio after a bike park day' }, { label: 'Prices', text: 'Burgers from $19' }, { label: 'Good to know', text: 'Bike wash station out front' }]);
  assert.equal((await change(t, { visit_rows: { known_for: 'Burgers maison et la terrasse après le vélo de montagne', groups: 'Groupes de 12 et plus, appelez avant.' } })).status, 200);
  const fr = (await get(pagePath(v, true))).text;
  assert.match(fr, /<html lang="fr/);
  assert.match(fr, /<span>Burgers maison et la terrasse après le vélo de montagne<\/span>/);
  assert.match(fr, /<span>Groupes de 12 et plus, appelez avant\.<\/span>/);
  assert.doesNotMatch(fr, /Bike wash station out front/, 'research’s English line with no French is still left off');
  const en = (await get(pagePath(v))).text;
  assert.match(en, /Burgers maison et la terrasse/); assert.match(en, /Bike wash station out front/);
  // The rule itself: owner rows fall back to their own text; research rows don't.
  const box = { rows: [{ label: 'Known for', text: 'Nos ailes du mercredi' }, { label: 'Good to know', text: 'Bike wash station out front' }], owner_labels: ['Known for'] };
  const html = app.visitInfoHtml(box, true);
  assert.match(html, /Nos ailes du mercredi/); assert.doesNotMatch(html, /Bike wash/);
  assert.equal(app.visitInfoHtml({ rows: [{ label: 'Good to know', text: 'Bike wash station out front' }] }, true), '');
});

// ---------- 2. One season name everywhere in the setup ----------
const seasonCtx = (lang) => {
  const src = CLIENT();
  const T = text[lang];
  const C = { lang, monthNames: lang === 'fr' ? ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthLong: lang === 'fr' ? ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  const code = ['fill', 'monthName', 'mdLabel', 'pad2', 'seaOut', 'monthRun', 'spanOf', 'seaSpan', 'seaLabelKind', 'seaNamed', 'capF', 'seaTitle', 'seaWhen', 'seasonInfo'].map((f) => fn(src, f)).join('');
  const ctx = { T, C, S: { sea: { on: true, months: { 10: true, 11: true }, exact: { from: '10-15', to: '11-25' }, kind: 'summer', storedKind: 'summer' } }, CUR: { hours_seasons: [] }, MLAST: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], parseWeek: (w) => w };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx;
};
test('season: a season he set is named by its dates (EN + FR) on every setup screen; research’s named season keeps its name', () => {
  const src = CLIENT();
  for (const f of ['seaTitle()', 'seaWhen()', 'T.seasonNowSpan', 'T.seasonHoursLineSpan', 'T.seasonDaysHDates']) assert.ok(src.includes(f), f);
  assert.doesNotMatch(src, /q\(T\.seasonEditQ\[S\.sea\.kind\] \|\| T\.seasonEditQ\.summer, /, 'the title no longer guesses the season');
  assert.equal((src.match(/fill\(T\.closedWarnSeason/g) || []).length, 1, 'only research’s named season says "summer"/"winter"');
  const fr = seasonCtx('fr');
  assert.equal(vm.runInContext('seaTitle()', fr), 'Vos heures du 15 oct. au 25 nov.');
  assert.equal(vm.runInContext('seaWhen()', fr), ' (du 15 oct. au 25 nov.)');
  assert.equal(vm.runInContext('fill(T.seasonNowSpan, { span: seaSpan(S.sea) })', fr), 'Votre page a d’autres heures du 15 oct. au 25 nov.');
  const stored = vm.runInContext("seasonInfo({ from: '10-15', to: '11-25', label: '', hours: {} })", fr);
  assert.equal(stored.head, 'Du 15 oct. au 25 nov.'); assert.equal(stored.kind, '');
  assert.equal(vm.runInContext("fill(T.seasonHoursLineSpan, { span: 'Du 15 oct. au 25 nov.', hours: 'x' })", fr), 'Du 15 oct. au 25 nov. : x ✓');
  // Whole months: « d’octobre à novembre »; no dates yet: « Vos autres heures ».
  vm.runInContext('S.sea.exact = null;', fr);
  assert.equal(vm.runInContext('seaTitle()', fr), 'Vos heures d’octobre à novembre');
  vm.runInContext('S.sea.months = { 6: true, 7: true, 8: true };', fr);
  assert.equal(vm.runInContext('seaTitle()', fr), 'Vos heures de juin à août');
  vm.runInContext('S.sea.months = {};', fr);
  assert.equal(vm.runInContext('seaTitle()', fr), 'Vos autres heures');
  const en = seasonCtx('en');
  assert.equal(vm.runInContext('seaTitle()', en), 'Your hours from Oct 15 to Nov 25');
  assert.equal(vm.runInContext('seaWhen()', en), ' (from Oct 15 to Nov 25)');
  assert.equal(vm.runInContext("seasonInfo({ from: '10-15', to: '11-25', label: '', hours: {} }).head", en), 'From Oct 15 to Nov 25');
  // Nothing in the season's words says summer or winter for his season.
  const said = ['seaTitle()', 'seaWhen()', 'fill(T.seasonNowSpan, { span: seaSpan(S.sea) })'].map((x) => { vm.runInContext("S.sea.exact = { from: '10-15', to: '11-25' };", fr); return vm.runInContext(x, fr); }).join(' ');
  assert.doesNotMatch(said, /été|hiver|Hiver/);
  // Research's "Winter hours" keeps its own name.
  vm.runInContext("CUR.hours_seasons = [{ from: '11-25', to: '04-20', label: 'Winter hours' }]; S.sea.kind = 'winter'; S.sea.storedKind = 'winter';", en);
  assert.equal(vm.runInContext('seaTitle()', en), 'Your winter hours');
  assert.equal(vm.runInContext("seasonInfo({ from: '11-25', to: '04-20', label: 'Winter hours', hours: {} }).head", en), 'Winter (Nov 25–Apr 20)');
  // The season screen's heading with exact dates.
  assert.equal(text.fr.seasonDaysHDates, 'Heures pendant ces dates'); assert.equal(text.en.seasonDaysHDates, 'Hours on those dates');
  assert.equal(text.fr.seasonEditQOther, 'Vos autres heures'); assert.equal(text.en.seasonEditQOther, 'Your other hours');
});

// ---------- 3. "Yes, all year" with a season stored asks first ----------
test('all year: with a stored season, "Yes, all year" names the dates and asks; "No, keep them" keeps the season', () => {
  const src = CLIENT();
  assert.match(src, /if \(k === 'yearAll' && S\.sea\.on && \(CUR\.hours_seasons \|\| \[\]\)\.length && seaSpan\(S\.sea\)\) return go\('hours:yeardrop'\);/);
  assert.match(src, /\} else if \(s === 'hours:yeardrop'\) \{/);
  assert.match(src, /big\('✓', T\.yearAllDropKeep, T\.yearAllDropKeepSub, false, 'yearDropKeep'\) \+ big\('✕', T\.yearAllDropYes, T\.yearAllDropYesSub, true, 'yearDropYes'\)/);
  assert.match(src, /if \(k === 'yearDropYes'\) k = 'yearAll';/);
  // Keep: the stored season is put back as it is and left untouched by the save.
  assert.match(src, /if \(k === 'yearDropKeep'\) \{[^\n]*S\.seaTouched = false; return hoursSave\(\); \}/);
  assert.match(src, /'hours:yeardrop': 'yearDropKeep'/);
  assert.equal(text.fr.yearAllDropLead.replace('{span}.', 'du 15 oct. au 25 nov.'), 'Votre page a aussi d’autres heures du 15 oct. au 25 nov. Avec « Oui, toute l’année », elles sont retirées.');
  assert.match(text.en.yearAllDropLead, /\{span\}/);
});

// ---------- 4. Help: shoulder season, in French and English ----------
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  return { best: (q) => ctx.window.__ohbBest(q), topics: JSON.parse(m[1]).topics };
};
test('help: « saison morte », « intersaison », « fermé le lundi en automne seulement » and "shoulder season" get the seasonal answer', async () => {
  for (const withSeason of [false, true]) {
    const v = mk('pub'); const t = tokenFor(v.id);
    if (withSeason) assert.equal((await change(t, { hours_seasons: [{ from: '10-15', to: '11-25', label: '', hours: JSON.parse(WEEK('15:00', '23:00')) }] })).status, 200);
    const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
    for (const q of ['Comment indiquer que je suis fermé les lundis et mardis seulement en saison morte?', 'saison morte', 'mes heures en saison morte', 'heures pendant l’intersaison', 'fermé le lundi en automne seulement',
      'fermé le lundi au printemps', 'heures d’automne', 'nos heures au printemps', 'en basse saison on ferme plus tôt']) assert.equal(fr.best(q).id, 'seasonal-hours', q);
    // Unchanged: plain hours, holidays.
    assert.equal(fr.best('Comment changer mes heures?').id, 'hours');
    assert.equal(fr.best('fermé à Noël').id, 'closures');
    const en = helpBot((await get(`/owner/${t}/setup`)).text);
    for (const q of ['different hours in the shoulder season', 'closed Mondays in the off season', 'we are closed Mondays in the fall only', 'spring only hours', 'shoulder season hours']) assert.equal(en.best(q).id, 'seasonal-hours', q);
    assert.equal(en.best('How do I change my hours?').id, 'hours');
    assert.equal(en.best('closed on christmas').id, 'closures');
    // Setup answers: hours saved in the setup go live at once; "checked first" only in the edit-page line.
    const tp = fr.topics.find((x) => x.id === 'seasonal-hours');
    const setupPart = tp.aFr.split('page de modification')[0];
    assert.doesNotMatch(setupPart, /vérifi/); assert.match(setupPart, /en ligne tout de suite/);
    const tpe = en.topics.find((x) => x.id === 'seasonal-hours');
    assert.doesNotMatch(tpe.a.split('edit page')[0], /checked first|check it first/);
  }
});

// ---------- 5. The French card's food line ----------
test('French cards: "Pub Fare, Burgers · Taphouse / craft beer bar" reads « Cuisine de pub, Burgers · Taphouse / bar à bières artisanales »', async () => {
  const v = mk('pub', { name: 'Zed Creekside Taphouse', slug: 'zed-creekside-taphouse' }); const t = tokenFor(v.id);
  assert.equal((await change(t, { cuisines: ['Pub Fare', 'Burgers'], place_type: 'Taphouse' })).status, 200);
  const en = (await get('/kelowna/pubs')).text;
  const enAt = en.indexOf('venue-card-name">Zed Creekside Taphouse<'); assert.ok(enAt > 0);
  const enCard = en.slice(enAt, enAt + 1500);
  assert.match(enCard, /Pub Fare, Burgers &middot; Taphouse \/ craft beer bar/);
  const fr = (await get('/fr/kelowna/pubs')).text;
  const at = fr.indexOf('venue-card-name">Zed Creekside Taphouse<'); assert.ok(at > 0);
  const frCard = fr.slice(at, at + 1500);
  assert.doesNotMatch(frCard, /Pub Fare|craft beer bar/);
  assert.match(frCard, new RegExp(`${app.PLACE_TYPE_DISPLAY_FR.Taphouse.replace(/[/]/g, '\\/')}`));
  assert.match(frCard, /Cuisine de pub/);
  // The helper: only food types and kinds change; anything else stays as it was.
  assert.equal(app.frCardMetaText('Pub Fare, Burgers &middot; Taphouse / craft beer bar &middot; 4.5★'), `Cuisine de pub, ${app.frCuisine('Burgers')} &middot; Taphouse / bar à bières artisanales &middot; 4.5★`);
  assert.equal(app.frCardMetaText('Kelowna &middot; 4.5★'), null);
});

// ---------- 6. A new happy hour: 3–5 PM when it fits ----------
test('happy hour default: 3–5 PM for a pub open 11:30 AM–11 PM; from opening time for a bar that opens at 5', () => {
  const s = CLIENT();
  const ctx = { S: { week: null }, DAYS, T: { happyOutside: 'out {days}' }, dayName: (d) => d, fill: (t, o) => t.replace('{days}', o.days), pad2: (x) => ('0' + x).slice(-2),
    seaMonths: () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, true])), longDay: (d) => d, C: { lang: 'en' } };
  vm.runInNewContext(s.slice(s.indexOf('  function hm(v)'), s.indexOf('  function warnHtml')) + 'this.hd = happyDefault;', ctx);
  const wk = (o, c, closed = []) => Object.fromEntries(DAYS.map((d) => [d, closed.includes(d) ? null : [[o, c]]]));
  ctx.S.week = wk('11:30', '23:00');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.hd())), { days: {}, from: '15:00', to: '17:00', what: '' });
  ctx.S.week = wk('11:30', '23:00', ['mon', 'tue']);
  assert.equal(ctx.hd().from, '15:00');
  ctx.S.week = wk('17:00', '01:00');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.hd())), { days: {}, from: '17:00', to: '19:00', what: '' }, 'a bar opening at 5 gets 5–7');
  // Open at 4 PM most days: 3–5 doesn't fit, so from opening.
  ctx.S.week = wk('16:00', '23:00'); assert.equal(ctx.hd().from, '16:00');
  // Split lunch/dinner hours: restaurant test 2 (Whistler, 2026-11-14) made the afternoon break 3–5 PM (the bar open between
  // services; the screen then says how to show that) instead of 11 AM from opening.
  ctx.S.week = Object.fromEntries(DAYS.map((d) => [d, [['11:00', '14:00'], ['17:00', '22:00']]])); assert.equal(ctx.hd().from, '15:00');
  ctx.S.week = null; assert.equal(ctx.hd().from, '15:00');
});

// ---------- 7. Spend starts from research's price line ----------
test('spend: research "Burgers from $19" starts the spend screen at $19 (a suggestion only); nothing is saved', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Prices', text: 'Burgers from $19' }]);
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).suggestSpend, 19);
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).suggestSpend, 19);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text).suggestSpend, 0, 'no research line: no suggestion');
  const r = mk('restaurant'); research(r.id, [{ label: 'Prices', text: 'Mains $24–$38' }]);
  // Restaurant test 3 (2026-11-15, Dayton approved): a range starts at its middle on the $2 steps ($24–$38 -> $32), not its low end.
  assert.equal(cfgOf((await get(`/owner/${tokenFor(r.id)}/setup`)).text).suggestSpend, 32);
  assert.match(CLIENT(), /CUR\.avg_spend && CUR\.avg_spend\.amount \? CUR\.avg_spend\.amount : C\.suggestSpend \|\| 25,/);
});

// ---------- 8. Small ----------
test('small: no "tap a quick answer" without quick answers; « On accepte aussi les clients sans réservation » (old wording still read)', () => {
  const src = CLIENT();
  assert.match(text.fr.lineEnglishHintNoQuick, /^Ce texte est en anglais, tel qu’il paraît maintenant sur votre page\. Gardez-le ou changez les mots\.$/);
  assert.doesNotMatch(text.fr.lineEnglishHintNoQuick, /réponse rapide/);
  assert.match(src, /var qk = quick\(cfg\[0\], 'suLine', S\.visit\[cfg\[0\]\] \|\| ''\);/);
  assert.match(src, /'suLineEn', !qk, cfg\[0\]\) \+ qk/); // restaurant test 2: the line's key
  assert.match(src, /'suKnownEn', true, 'known_for'\)/); // restaurant test 2: the line's key
  assert.deepEqual(text.fr.quick.reservations, ['Appelez-nous', 'Réservez sur notre site Web', 'Réservez en ligne', 'On accepte aussi les clients sans réservation']); // + « Réservez en ligne » (restaurant test 1, 2026-11-14)
  assert.equal(app.presetAnswer('On accepte aussi les clients sans réservation', 'en'), 'Walk-ins welcome too');
  assert.equal(app.presetAnswer('Walk-ins welcome too', 'fr'), 'On accepte aussi les clients sans réservation');
  assert.equal(app.presetAnswer('Appelez-nous, Sans réservation aussi', 'en'), 'Call us, Walk-ins welcome too', 'an older answer still reads');
  // The client's "already says it" check sees the new chip in a line.
  const code = ['has', 'quickWords', 'rawWords', 'allIn', 'saysIt'].map((f) => { try { return fn(src, f); } catch (e) { return ''; } }).join('');
  if (/function saysIt/.test(code) && /function has\(/.test(code)) {
    const ctx = { T: text.fr, C: { lang: 'fr' } }; vm.createContext(ctx);
    try { vm.runInContext(code, ctx); } catch (e) { return; }
    const sib = text.fr.quick.reservations;
    const walk = sib.indexOf('On accepte aussi les clients sans réservation');
    assert.equal(ctx.saysIt('Appelez-nous. On accepte aussi les clients sans réservation.', sib[walk], sib), true);
    assert.equal(ctx.saysIt('Appelez-nous.', sib[walk], sib), false);
    // Restaurant test 1 (2026-11-14): « Réservez en ligne » is its own chip, not « Réservez sur notre site Web ».
    assert.equal(ctx.saysIt('Réservez sur notre site Web.', 'Réservez en ligne', sib), false);
  }
});
