// Sixth first-time café test fixes (Dayton, Nov 12 2026; drafts/fresh-eyes-cafe6-2026-11-12/REPORT.md). The tester played
// Hélène, a French-first café owner from Québec on an iPad. Keep it simple: bugs and wording fixed, nothing new asked.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-test6-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const TEXT = require('../owner-setup-text.js');
const { highlightsFor } = require('../food-drink-venue-layout.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week = (a, b) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `CT6 ${type} ${++n}`, slug: `ct6-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.6, address: `${n} Main St, Penticton`, phone: '250-555-0100', hours: week('08:00', '14:00'),
  description: 'A fixture used only by the café test 6 fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text(), headers: r.headers }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.76.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const topHighlights = (html) => { const m = /<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(html); return m ? m[1] : ''; };
const head = (html) => html.split('</head>')[0];

test('1: the language switch on owner pages goes to the other language\'s address (token, query and step kept), never via hreflang', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const en = await get(`/owner/${t}?full=1`);
  assert.equal(en.status, 200);
  // The page names its twin in a data attribute; no alternate links, still noindex.
  assert.match(en.text, new RegExp(`<html lang="en" data-twin-path="/fr/owner/${t}"`));
  assert.doesNotMatch(head(en.text), /rel="alternate"[^>]*hreflang/);
  assert.match(head(en.text), /<meta name="robots" content="[^"]*noindex/);
  assert.match(String(en.headers.get('x-robots-tag') || ''), /noindex/);
  // The visible link (and the header switch) keep the query.
  assert.match(en.text, new RegExp(`<a class="owner-lang-link" href="/fr/owner/${t}\\?full=1" hreflang="fr" lang="fr" rel="nofollow">Français</a>`));
  assert.match(en.text, new RegExp(`id="langToggle" href="/fr/owner/${t}\\?full=1"`));
  // The French page links back, in English.
  const fr = await get(`/fr/owner/${t}`);
  assert.match(fr.text, new RegExp(`<html lang="fr" data-twin-path="/owner/${t}"`));
  assert.match(fr.text, new RegExp(`<a class="owner-lang-link" href="/owner/${t}" hreflang="en" lang="en" rel="nofollow">English</a>`));
  // The one script handles the header link, the ☰ menu's EN / FR (the hidden header link is inert while the menu is
  // open, so pressing it did nothing) and the visible link, going straight to the address; the setup adds its step.
  assert.match(SERVER, /e\.target\.closest\('#langToggle, \.owner-lang-link, \.nav-lang-opt'\)/);
  assert.match(SERVER, /typeof window\.suLangHash === 'function' \? window\.suLangHash\(\)/);
  assert.match(en.text, /closest\('#langToggle, \.owner-lang-link, \.nav-lang-opt'\)/);
  // app.js's setLanguage also follows data-twin-path when a page has it.
  assert.match(APPJS, /getAttribute\('data-twin-path'\)/);
  // Owner pages never reach a sitemap.
  const sm = await get('/sitemap.xml');
  if (sm.status === 200) assert.doesNotMatch(sm.text, /\/owner\//);
});

test('2: the setup screens carry a small "Français / English" link that keeps the question and what was typed', async () => {
  const v = mk('cafe'); const t = tokenFor(v.id);
  const en = await get(`/owner/${t}/setup`);
  assert.match(en.text, new RegExp(`<a class="owner-lang-link su-lang" href="/fr/owner/${t}/setup" hreflang="fr" lang="fr" rel="nofollow">Français</a><a class="su-exit"`));
  assert.match(en.text, new RegExp(`data-twin-path="/fr/owner/${t}/setup"`));
  const fr = await get(`/fr/owner/${t}/setup`);
  assert.match(fr.text, /<a class="owner-lang-link su-lang" href="\/owner\/[^"]+\/setup" hreflang="en" lang="en" rel="nofollow">English<\/a>/);
  // The step goes along as #step; the draft key is the same on both addresses; no "leave this page?" prompt.
  assert.match(CLIENT, /window\.suLangHash = function\(\)\{/);
  assert.match(CLIENT, /window\.suBeforeLang = function\(\)\{[\s\S]*?drSave\(\); navKeep\(\); S\.leaving = true; return true;\n  \};/);
  assert.match(CLIENT, /function drKey\(b\)\{ return 'suDraft:' \+ String\(C\.base\)\.replace\(\/\^\\\/fr\(\?=\\\/owner\\\/\)\/, ''\)/);
  // The help bot says where the switch is, also in the setup.
  assert.match(SERVER, /Tap <strong>Français<\/strong> at the top of your edit page or of the setup screens/);
  assert.match(SERVER, /Touchez <strong>Français<\/strong> en haut de votre page de modification ou des écrans de configuration/);
  assert.match(SERVER, /\{ id: 'french', q: 'Is the business portal in French\?'[^\n]*'claim', 'setup'\]/);
  // The menu screen keeps its own switch and gets no second one.
  const menu = await get(`/owner/${t}/menu`);
  assert.doesNotMatch(menu.text, /class="owner-lang-link/);
});

test('3: a café\'s Hours step is done only once its holidays and closures part is saved or skipped; Carry on resumes there', async () => {
  const c = mk('cafe');
  app.saveSetupProgress(c.id, 'basics', 'live');
  app.saveSetupProgress(c.id, 'hours', 'live');
  // Hours saved, then the tab closed on the closures screen: still partly done, Hours not counted.
  assert.equal(app.setupState(c.id), 'partial');
  for (const k of ['cuisine', 'photos', 'menu', 'spend', 'offer']) app.saveSetupProgress(c.id, k, 'live');
  assert.equal(app.setupState(c.id), 'partial', 'the essentials are not done while the holidays part is open');
  app.saveSetupProgress(c.id, 'closures', 'skip');
  assert.equal(app.setupState(c.id), 'essentials');
  // Pubs and restaurants (closures is its own Part 2 step): their hours count as soon as they're saved.
  for (const type of ['pub', 'restaurant']) {
    const v = mk(type);
    for (const k of ['basics', 'hours', 'closures', 'cuisine', 'photos', 'menu', 'offer', type === 'pub' ? 'happy' : 'spend']) app.saveSetupProgress(v.id, k, 'live');
    assert.equal(app.setupState(v.id), 'essentials', type);
    for (const k of app.SETUP_STEPS) app.saveSetupProgress(v.id, k, 'live');
    assert.equal(app.setupState(v.id), 'done', type);
  }
  // The page: the half-done step is not ✓, says what's left, and Continue opens the closures part.
  assert.match(CLIENT, /function half\(k\)\{ var d = S\.done\.hours; return COMBO && k === 'hours' && !!d && d !== 'skip' && d !== 'later' && !S\.done\.closures; \}/);
  // Hours skipped as a whole: nothing half-done.
  const c3 = mk('cafe'); for (const k of app.CAFE_SETUP_PART1) app.saveSetupProgress(c3.id, k, k === 'hours' ? 'skip' : 'live');
  assert.equal(app.setupState(c3.id), 'essentials');
  assert.match(CLIENT, /function firstOpen\(\)\{ for \(var i = 0; i < P1\.length; i\+\+\) if \(!fin\(P1\[i\]\)\) return half\(P1\[i\]\) \? 'closures' : P1\[i\];/);
  assert.match(CLIENT, /var d = half\(s\) \? 'half' : fin\(s\) \|\| 'none'/);
  assert.equal(TEXT.en.st.half, 'hours saved, holidays and closures still to do');
  assert.match(TEXT.fr.st.half, /^heures enregistrées, jours fériés et fermetures à faire$/);
  const html = (await get(`/owner/${tokenFor(c.id)}`)).text;
  assert.match(html, /id="opSetupCard"/);
});

test('4: "Mark closed" turns into "Reopen" in the same place; the day\'s note comes after it and the row keeps its height', () => {
  assert.equal(TEXT.en.reopenDay, 'Reopen');
  assert.equal(TEXT.fr.reopenDay, 'Rouvrir');
  // Button first (where "Mark closed" was), then "Monday closed".
  assert.match(CLIENT, /hoffUndo\(d\) \? '<button type="button" class="su-hoff su-hoff-undo"[^\n]*h\(T\.reopenDay \|\| T\.undo\) \+ '<\/button> <span class="su-hundo" role="status">'/);
  assert.match(SERVER, /body\.owner-setup \.su-hoffrow \{ min-height: 54px; box-sizing: border-box; \}/);
  assert.match(SERVER, /body\.owner-setup \.su-hoffrow:has\(\.su-hoff-undo\) \{ flex-wrap: nowrap; \}/);
});

test('5: seasonal hours show one "Every day" button under "Copy these hours to:" when every day is open', () => {
  assert.match(CLIENT, /\(seas && !othersClosed\(d\) && !DAYS\.every\(function\(x\)\{ return x === d \|\| copyGets\(d, x\); \}\) \? '<button type="button" class="su-toggle" data-copyevery="/);
  // The first button already says "Every day" in that case.
  assert.match(CLIENT, /data-copyall="' \+ d \+ '">' \+ h\(DAYS\.every\(function\(x\)\{ return x === d \|\| copyGets\(d, x\); \}\) \? T\.copyAll : T\.copyOpen\)/);
});

test('6: a café\'s dietary chips (vegan, vegetarian, gluten-free) lead its top highlights; restaurants keep theirs', async () => {
  // Hélène: gluten-free and vegetarian, plus dogs, kids and a patio. Both diet chips make the four.
  const c = mk('cafe'); const t = tokenFor(c.id);
  ok(await change(t, { badges: { vegetarian: true, gluten_free: true, patio: true, dog_friendly: true, kid_friendly: true } }));
  const row = topHighlights(page(c, 'en'));
  assert.match(row, /^<span>🥗 Vegetarian-friendly<\/span><span>🌾 Gluten-free options<\/span>/, row);
  // Vegan still leads when there is one (café test 5).
  const c2 = mk('cafe'); ok(await change(tokenFor(c2.id), { badges: { vegan: true, vegetarian: true, gluten_free: true, patio: true, dog_friendly: true, kid_friendly: true } }));
  const row2 = topHighlights(page(c2, 'en'));
  assert.match(row2, /^<span>🌱 Vegan-friendly<\/span><span>🥗 Vegetarian-friendly<\/span><span>🌾 Gluten-free options<\/span>/, row2);
  // highlightFirst is taken in the order given; the four-chip limit stays.
  const r = highlightsFor({ dog_friendly: 1, kid_friendly: 1, patio: 1, gluten_free: 1, vegetarian: 1 }, null, { highlightFirst: ['vegetarian', 'gluten'] });
  assert.deepEqual(r.map((h) => h[1]), ['Vegetarian-friendly', 'Gluten-free options', 'Dog-friendly', 'Kid-friendly']);
  // A restaurant: unchanged order (dog, kid, patio first).
  const rs = mk('restaurant'); ok(await change(tokenFor(rs.id), { badges: { gluten_free: true, patio: true, dog_friendly: true, kid_friendly: true } }));
  assert.match(topHighlights(page(rs, 'en')), /^<span>🐾 Dog-friendly<\/span>/);
});

test('7: tapped answers and holiday names show in the page\'s language; typed words stay as typed', async () => {
  assert.equal(app.presetAnswer('Terrasse seulement. Bols d’eau à l’entrée', 'en'), 'Patio only. Water bowls at the door');
  assert.equal(app.presetAnswer('Patio only', 'fr'), 'Terrasse seulement');
  assert.equal(app.presetAnswer('Appelez-nous, Sans réservation aussi', 'en'), 'Call us, Walk-ins welcome too');
  assert.equal(app.presetAnswer('Noël', 'en'), 'Christmas Day');
  assert.equal(app.presetAnswer('Christmas Day', 'fr'), 'Noël');
  // Her own words: unchanged in both languages.
  assert.equal(app.presetAnswer('Vacances. De retour le 20 janvier.', 'en'), 'Vacances. De retour le 20 janvier.');
  assert.equal(app.presetAnswer('Terrasse seulement. Le chien de la maison s’appelle Biscuit', 'en'), 'Patio only. Le chien de la maison s’appelle Biscuit');
  assert.equal(app.isPresetAnswer('Vacances'), false);
  assert.equal(app.closureNoteFor('Noël', false), 'Christmas Day');
  assert.equal(app.closureNoteFor('Christmas Day', true), 'Noël');
  // On the English page: the dogs line and a holiday saved from the French setup.
  const c = mk('cafe'); const t = tokenFor(c.id);
  ok(await change(t, { visit_rows: { dogs: 'Terrasse seulement' } }));
  const soon = app.todayLocal(new Date(Date.now() + 5 * 86400000));
  ok(await change(t, { closures: [{ from: soon, to: soon, note: 'Noël' }] }));
  const html = page(c, 'en');
  assert.match(html, /Patio only/);
  assert.doesNotMatch(html, /Terrasse seulement/);
  assert.match(html, /\(Christmas Day\)/);
  assert.doesNotMatch(html, /\(Noël\)/);
  // The setup now saves a holiday's name in English (the page shows it in its own language).
  assert.match(CLIENT, /function holEn\(key\)\{ var a = C\.lang === 'fr' && C\.holidayAlt && C\.holidayAlt\[key\];/);
  assert.match(CLIENT, /note: S\.holNotes\[o\.key\] != null \? holKeep\(o\.key, S\.holNotes\[o\.key\]\) : holEn\(o\.key\)/);
});

test('8: French setup wording: spaces before : ? !, no English left, the fixes from the report', async () => {
  const bad = [], same = [];
  const walk = (e, f, p) => {
    for (const k of Object.keys(e)) {
      const a = e[k], b = f ? f[k] : undefined;
      if (typeof a === 'string') {
        if (typeof b === 'string' && /[^\s  ][:?!](?=[\s»”)]|$)/.test(b)) bad.push(`${p}${k}: ${b}`);
        if (a === b && /[a-z]{4}/i.test(a) && !/^(Photos|Menu|Happy hour.*|Instagram|Facebook|Bingo|Cents|\{site\}\/happy-hour)$/i.test(a)) same.push(`${p}${k}: ${a}`);
      } else if (a && typeof a === 'object' && !Array.isArray(a)) walk(a, b || {}, `${p}${k}.`);
    }
  };
  walk(TEXT.en, TEXT.fr, '');
  assert.deepEqual(bad, [], 'French spacing before : ? !');
  assert.deepEqual(same, [], 'English left in the French setup');
  // Times and web addresses are never spaced.
  assert.equal(TEXT.frSpacing('Voir https://exemple.com à 7:00?'), 'Voir https://exemple.com à 7:00 ?');
  assert.equal(TEXT.frSpacing('Facultatif: spéciaux'), 'Facultatif : spéciaux');
  assert.equal(TEXT.frSpacing('Merci !'), 'Merci !');
  // The report's list.
  assert.equal(TEXT.fr.freeLine, 'Gratuit. Sans frais, pour toujours.');
  assert.equal(TEXT.fr.allYearQ, 'Ces heures sont-elles les mêmes toute l’année ?');
  assert.equal(TEXT.fr.allYearSummer, 'Non, elles changent en été');
  assert.equal(TEXT.fr.allYearWinter, 'Non, elles changent en hiver');
  assert.equal(TEXT.fr.everyYear, 'cette année et l’an prochain');
  assert.equal(TEXT.fr.everyYearSub, 'Si coché, nous l’indiquons aussi l’an prochain.');
  assert.equal(TEXT.fr.cafe.closeYearlySub || TEXT.fr.closeYearlySub, 'Si coché, ces dates reviennent chaque année.');
  assert.match(CLIENT, /h\(cl\(T\.holidays\[o\.key\]\) \+ T\.everyYear\)/);
  assert.match(CLIENT, /return cl\(T\.optional\) \+ open2\.join/);
  assert.equal(TEXT.fr.centsDown, '− 25 ¢');
  assert.equal(TEXT.fr.centsUp, '+ 25 ¢');
  assert.doesNotMatch(TEXT.fr.sentMeans, /Nous le vérifions/);
  assert.equal(TEXT.fr.snapSub, 'Un tableau ou chaque page');
  assert.equal(TEXT.fr.socialUnsure, 'Je ne sais pas / quelqu’un d’autre s’en occupe');
  assert.match(TEXT.fr.spendSkip, /^Je ne sais pas/);
  assert.equal(TEXT.fr.cafe.gfQ, 'Options sans gluten ?');
  assert.match(CLIENT, /function pct\(n\)\{ return n \+ \(C\.lang === 'fr' \? '\\u00a0%' : '%'\); \}/);
  assert.match(CLIENT, /String\(title\)\.replace\(\/\[\\s\\u00a0\\u202f\]\*\[\.!\]\$\/, ''\)/);
  // "Planifier mon voyage" everywhere.
  assert.doesNotMatch(APPJS, /Planifiez mon voyage/);
  assert.match(APPJS, /'trip\.buildMyTrip': 'Planifier mon voyage'/);
  // Cuisines: feminine and in French order on the French setup; « Cuisine française » in the preview.
  for (const [en, fr] of [['American', 'Américaine'], ['Canadian', 'Canadienne'], ['Taiwanese', 'Taïwanaise'], ['Spanish & Tapas', 'Espagnole et tapas'], ['French', 'Française']]) assert.equal(app.frCuisine(en), fr);
  const c = mk('cafe'); const t = tokenFor(c.id);
  const cfg = JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec((await get(`/fr/owner/${t}/setup`)).text)[1]);
  const names = cfg.cuisines.map((k) => cfg.cuisineNames[k]);
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })));
  assert.equal(cfg.cuisineShow.French, 'Cuisine française');
  const cfgEn = JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec((await get(`/owner/${t}/setup`)).text)[1]);
  assert.equal(cfgEn.cuisines[0], 'American');
  // Deli and gluten-free words on French pages.
  assert.match(SERVER, /'Deli & sandwiches': 'Délicatessen et sandwichs'/);
  assert.doesNotMatch(SERVER, /'Charcuterie et sandwichs'/);
  assert.match(SERVER, /'options sans gluten \(cuisine partagée\)'/);
  // The French edit page: no English mail subject, « site Web » with its capital.
  const fr = (await get(`/fr/owner/${t}`)).text;
  assert.match(fr, /subject=Mise%20%C3%A0%20jour%20de%20CT6/);
  assert.doesNotMatch(fr, /subject=Please%20update/);
  assert.match(fr, /Gratuit\. Sans frais, pour toujours\./);
  assert.match(SERVER, /\.replace\(\/\\bsite web\\b\/g, 'site Web'\)/);
  // Footer links translated on French pages (they had no translation key).
  for (const k of ['footer.dogFriendly', 'footer.aboutSite', 'footer.listEvent', 'footer.businessLogin', 'footer.allDestinations', 'footer.privacy', 'footer.terms']) {
    assert.equal((APPJS.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) || []).length, 2, k);
    assert.match(SERVER, new RegExp(`data-i18n="${k.replace('.', '\\.')}"`));
  }
  assert.match(SERVER, /<a href="\/secret-spots" data-i18n="gems\.secretSpots\.title">Secret Spots<\/a>/);
});

test('9: reopening the Hours step shows the other season\'s hours in one line (no new question)', async () => {
  assert.equal(TEXT.en.seasonHoursLine, '{kind} ({range}): {hours} ✓');
  assert.equal(TEXT.fr.seasonHoursLine, '{kind} ({range}) : {hours} ✓');
  assert.equal(TEXT.en.everyDayHours, '{t} every day');
  assert.equal(TEXT.fr.everyDayHours, '{t} tous les jours');
  assert.match(CLIENT, /weekRows\(S\.week\) \+ seasonLines\(\) \+ '<div class="su-stack">'/);
  // The setup gets the stored seasons to say it from.
  const c = mk('cafe'); const t = tokenFor(c.id);
  const d = [['07:00', '15:00']];
  ok(await change(t, { hours_seasons: [{ from: '06-01', to: '09-30', label: 'Summer hours', hours: Object.fromEntries(DAYS.map((x) => [x, d])) }] }));
  const cfg = JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec((await get(`/fr/owner/${t}/setup`)).text)[1]);
  assert.equal(cfg.cur.hours_seasons.length, 1);
  assert.equal(cfg.cur.hours_seasons[0].from, '06-01');
});
