// Sport test 11 fixes (2026-11-21; Geneviève, director of golf operations at the Vernon Golf & Country Club, French first,
// on her Samsung phone; drafts/fresh-eyes-sport11-2026-11-21/REPORT.md):
//   1. Words she typed in French ask for their English (one review item, "write the English"); the English page shows
//      research's English line for that row meanwhile, else her French line marked "(in French)"; a French price list is
//      marked too and found by English words ("twilight"); Help says which way translation goes.
//   2. Hours of a second stretch outside the season: asked about, never a "saved ✓" for hours that show nowhere.
//   3. Help in French: the fit check reads French; her 24 questions land; 30 held-out French questions never harm.
//   4. Research's season advisory goes once she has set her season (page, cards, planner).
//   5. The typed price list's first line: only her own words (never the kind's "18 holes").
//   6. « Ajouter la version anglaise » no longer sends her to the English portal (her English is queued).
//   7. Kids welcome never from an age we pre-picked and she didn't touch.
//   8. « un départ le matin puis un souper » plans a tee time, then dinner.
//   9. The Good to know example after « Non, réservez un départ ».
//  10. « Créer mon compte » lands on /fr/owner/account/venue/<id> (not /fr/fr/…), with « Vous êtes connecté ».
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test11-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { SRC, Q, HELD } = require('./help-sport11-questions.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

let srv, base, ipN = 0, n = 0;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const WK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '19:00']]]));
const ip = () => `10.151.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`;
const change = (t, changes, fr = false) => fetch(`${base}${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });
const ok = async (p) => { const r = await p; assert.ok(r.status < 300, `${r.status} ${await r.text()}`); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'the page has the Help widget');
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const cfg = JSON.parse(m[1]);
  return { best: (q) => ctx.window.__ohbBest(q), cfg, answer: (id, fr) => { const t = cfg.topics.find((x) => x.id === id) || {}; return (fr ? t.aFr : t.a) || ''; } };
};
function mk(o = {}) {
  n++;
  return app.createVenue({ name: o.name || `Vernon Eleven ${n}`, slug: `vernon-eleven-${n}`, region: 'vernon', type: o.type || 'golf', latitude: 50.24 + n / 4000, longitude: -119.27,
    address: o.address || `${n} Kalamalka Lake Rd`, website: `https://eleven-${n}.example.com/`, hours: JSON.stringify(WK), description: o.description || 'A semi-private parkland course since 1913.', description_fr: o.description_fr || 'Un parcours semi-privé depuis 1913.' });
}
async function setUp(c = SRC.sport11, o = {}) {
  const v = mk(o);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  if (c.season) await ok(change(t, { hours: WK, open_months: c.season }));
  await ok(change(t, { indoor_info: { kinds: c.kinds, length: c.length || '1-2h', book: c.book, age: 'all', year: c.season ? 'seasonal' : 'all' }, indoor_price: c.price }));
  return { v, t };
}
const seedVisit = (v, rows) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(v.id, JSON.stringify({ rows, booking_url: null, source_url: 'https://vernongolf.example.com/', checked_at: '2026-10-19' }));
const clear = () => { for (const c of ['clearVenueCaches', 'clearHoursExtraCache', 'clearVenueIndoorInfoCache', 'clearVenueOwnerFeaturesCache']) if (app[c]) app[c](); };
const pagePath = (v, lang = 'en') => app.venuePagePath(app.getVenue(v.id), lang);

test('1a. her French lines ask for their English; the English page keeps research’s line, else marks hers "(in French)"', async () => {
  const { v, t } = await setUp();
  seedVisit(v, [{ label: 'Known for', text: 'Private-club golf with lake views since 1913.' }, { label: 'Food', text: 'The 1913 Restaurant on site.' }]);
  clear();
  sent.length = 0;
  await ok(change(t, { visit_rows: { _lang: 'fr', known_for: 'Club semi-privé, ouvert au public, avec vue sur le lac', good_to_know: 'Code vestimentaire : chemise à col, bermudas ou pantalons. Crampons souples seulement.' } }, true));
  clear();
  const item = db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").all(v.id);
  assert.equal(item.length, 1, 'one review item');
  assert.match(item[0].help_note, /^They wrote these in French: please write the English/);
  assert.match(item[0].help_note, /Known for \(write the English\): Club semi-privé/);
  assert.match(item[0].help_note, /Good to know \(write the English\): Code vestimentaire/);
  assert.doesNotMatch(item[0].help_note, /please write the French/);
  // The email names the way it goes.
  assert.equal(app.sendFrLinesEmailNow(v.id), true);
  await new Promise((r) => setTimeout(r, 30));
  const mail = JSON.stringify(sent.filter((m) => /\[TRANSLATE\]/.test(JSON.stringify(m))));
  assert.match(mail, /write the English for their own lines written in French/);
  // The English page: research's Known for while hers is translated; her Good to know (no research line) marked.
  const en = await getText(pagePath(v));
  assert.match(en, /<span class="visit-label">Known for<\/span><span>Private-club golf with lake views since 1913\.?<\/span>/);
  assert.match(en, /<span lang="fr">Code vestimentaire[^<]*<\/span> <span class="visit-lang-note">\(in French\)<\/span>/);
  assert.match(en, /From the venue and/, 'research’s stand-in line is not called the venue’s');
  assert.ok(en.indexOf('visit-lang-note') < (en.indexOf('class="visit-more"') >>> 0), 'her French line shows open, never under More');
  // The French page: her own lines.
  const fr = plain(await getText(pagePath(v, 'fr')));
  assert.match(fr, /Club semi-privé, ouvert au public/);
  // English lines still ask for their French (as before), in the same item.
  await ok(change(t, { visit_rows: { groups: 'Weddings and Christmas parties for up to 200.' } }));
  const note = db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id).help_note;
  assert.match(note, /^Some of their own words need the other language/);
  assert.match(note, /Groups: Weddings and Christmas parties/);
  assert.match(note, /Known for \(write the English\)/);
  // Her owner home names it in her language and the right way round.
  const home = plain(await getText(`/fr/owner/${t}`));
  assert.match(home, /Traduction demandée|Vos lignes en français : nous écrivons la version anglaise/);
  assert.doesNotMatch(home, /Vos lignes en français : nous les écrivons/);
});

test('1b. a French story and a French price list: English asked for, the English page marks the list, English search finds it', async () => {
  const { v, t } = await setUp();
  await ok(change(t, { description_fr: 'Le Vernon Golf & Country Club accueille les golfeurs depuis 1913. Un parcours semi-privé, ouvert au public, avec vue sur le lac Kalamalka et un club-house chaleureux.' }, true));
  const note = (db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id) || {}).help_note || '';
  assert.match(note, /Story \(write the English\): Le Vernon Golf/);
  const items = [['18 trous, matin', '139', 'De l’ouverture à 12 h 59'], ['18 trous, crépuscule', '75', 'À partir de 16 h'], ['9 trous', '75', 'Après 16 h seulement'], ['Demi-voiturette', '27', 'Par personne']];
  const id = Number(db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, source) VALUES (?, 'ready', ?, 'owner-link', 'owner')").run(v.id, JSON.stringify({ sections: [{ name: 'Tarifs 2026', note: '', items: items.map(([name, price, description]) => ({ name, description, price, dietary: [], check: false })) }] })).lastInsertRowid);
  assert.equal(app.publishMenu(id, 'dayton').ok, true);
  const n2 = db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id).help_note;
  assert.match(n2, /Prices \(write the English\): Tarifs 2026 \| 18 trous, matin/);
  assert.doesNotMatch(n2, /Prices: /, 'never "write the French" for French names');
  clear();
  const en = await getText(pagePath(v));
  assert.match(en, /Price names written in French by the business\./);
  assert.match(en, /<ul class="vm-list" lang="fr">/);
  assert.doesNotMatch(await getText(pagePath(v, 'fr')), /Price names written in French/);
  const prices = await getText(`${pagePath(v)}/prices`);
  assert.match(prices, /Price names written in French by the business\./);
  // An English list stays unmarked.
  const { v: e } = await setUp();
  const id2 = Number(db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, source) VALUES (?, 'ready', ?, 'owner-link', 'owner')").run(e.id, JSON.stringify({ sections: [{ name: 'Rates', note: '', items: [{ name: '18 holes, morning', description: '', price: '139', dietary: [], check: false }, { name: 'Twilight', description: 'From 4 PM', price: '75', dietary: [], check: false }] }] })).lastInsertRowid);
  assert.equal(app.publishMenu(id2, 'dayton').ok, true);
  clear();
  assert.doesNotMatch(await getText(pagePath(e)), /written in French/);
  // English search reads her French names in English: "twilight" finds « crépuscule ».
  if (app.clearDiscoverySearchCache) app.clearDiscoverySearchCache();
  const s = plain(await getText('/search?q=twilight%20golf%20vernon'));
  assert.ok(s.includes(app.getVenue(v.id).name), 'twilight golf vernon finds her French list');
});

test('1c. Help says which way translation goes (the three answers that promised "we write the other language")', async () => {
  const { t } = await setUp();
  const b = helpBot(await getText(`/fr/owner/${t}/setup`));
  for (const [q, fr] of [['J’ai tapé tous nos tarifs en français. Les golfeurs anglophones vont les voir en anglais, ou en français comme je les ai écrits?', true],
    ['Si je la réécris en français, est-ce que la page anglaise va rester vide?', true], ['Will the lines I wrote in French show up on the English page, or do I have to write them twice?', false]]) {
    assert.equal(b.best(q).id, 'indoor-french', q);
  }
  assert.match(b.answer('indoor-french', true), /vos lignes en français reçoivent leur version anglaise/);
  assert.match(b.answer('indoor-french', true), /marquée <em>in French<\/em>/);
  assert.match(b.answer('indoor-french'), /lines in French get their English/);
  assert.doesNotMatch(b.answer('indoor-french'), /We write the French for your own lines/);
  // The price list's own Help has the answer and the fit check too.
  const m = helpBot(await getText(`/fr/owner/${t}/menu`));
  assert.equal(m.best('J’ai tapé tous nos tarifs en français. Les golfeurs anglophones vont les voir en anglais?').id, 'indoor-french');
});

test('2. hours outside the season: asked about (open those days too, or skip them), never "saved ✓"', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  const text = require('../owner-setup-text.js');
  // The real seaOutside, run on her dates.
  const src = /function seaOutside\(per, sea\)\{[\s\S]*?\n  \}\n/.exec(client)[0];
  const mdIn = /function mdInRange\(md, from, to\)\{[^\n]*\}/.exec(client)[0];
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(`function pad2(n){ return ('0' + n).slice(-2); } ${mdIn} ${src} this.f = seaOutside;`, ctx);
  const her = ctx.f({ from: '01-05', to: '03-31' }, { from: '04-03', to: '10-31' });
  assert.equal(her.out, true);
  assert.deepEqual({ ...her.ext }, { from: '01-05', to: '10-31' });
  assert.equal(ctx.f({ from: '07-01', to: '08-31' }, { from: '04-03', to: '10-31' }).out, false, 'summer hours inside the season are fine');
  assert.deepEqual({ ...ctx.f({ from: '10-15', to: '11-15' }, { from: '04-03', to: '10-31' }).ext }, { from: '04-03', to: '11-15' });
  assert.equal(ctx.f({ from: '12-01', to: '02-28' }, { from: '11-26', to: '04-06' }).out, false, 'a winter season across New Year');
  // The save asks first, and the line on the hours screen has no ✓ for them.
  assert.match(client, /var ox = seaOutside\(lo, seaNow\);/);
  assert.match(client, /S\.nudge = fill\(T\.seaOutside, \{ a: mdLabel\(seaNow\.from\), b: mdLabel\(seaNow\.to\), c: mdLabel\(lo\.from\), d: mdLabel\(lo\.to\) \}\);/);
  assert.match(client, /if \(sNow && T\.seaOutsideLine && seaOutside\(sz, sNow\)\.out\) return '<p class="su-hint su-seaoutline">'/);
  assert.match(client, /'seaOutOpen'[\s\S]*'seaOutSkip'/);
  for (const L of ['en', 'fr']) for (const k of ['seaOutside', 'seaOutsideYes', 'seaOutsideNo', 'seaOutsideNoSub', 'seaOutsideSkipped', 'seaOutsideLine']) assert.ok(text[L][k], `${L}.${k}`);
  assert.doesNotMatch(text.en.seaOutsideLine, /✓/); assert.doesNotMatch(text.fr.seaOutsideLine, /✓/);
  assert.match(text.fr.seaOutside, /Ouvert aussi du \{c\} au \{d\}/);
  assert.match(text.en.seaOutsideSkipped, /Good to know/);
});

test('3. Help in French: her 24 questions land well; the 30 held-out French questions never land on a harmful answer', async () => {
  const { t } = await setUp();
  const bots = {};
  for (const [page, p] of [['setup', '/setup'], ['edit', ''], ['menu', '/menu']]) bots[page] = { en: helpBot(await getText(`/owner/${t}${p}`)), fr: helpBot(await getText(`/fr/owner/${t}${p}`)) };
  const grade = ([, page, lang, q, okIds, harm]) => { const r = bots[page][lang].best(q); return r.id && harm.includes(r.id) ? 'harm' : r.id ? (okIds.includes(r.id) ? 'good' : 'wrong') : (okIds.includes('UNSURE') ? 'good' : 'askus'); };
  const bad = Q.map((row) => [grade(row), row[3]]).filter(([g]) => g !== 'good');
  assert.deepEqual(bad, []);
  const held = HELD.map(grade);
  assert.equal(held.filter((g) => g === 'harm').length, 0);
  // Held out: counted, never tuned (the round-11 report has the breakdown).
  console.log(`held-out French: ${['good', 'askus', 'wrong', 'harm'].map((g) => `${g} ${held.filter((x) => x === g).length}`).join(', ')}`);
  // The answers Dayton asked for.
  const s = bots.setup.fr, e = bots.edit.fr;
  assert.equal(e.best('J’ai appuyé sur « Créer mon compte » et j’ai eu une page blanche qui dit Not found. Est-ce que mon compte a marché?').id, 'login-not-found');
  assert.match(e.answer('login-not-found', true), /il est corrigé[\s\S]*Écrivez-nous/);
  assert.match(s.answer('sport-sister-listing', true), /n’a pas de page à lui ici/, 'no simulator listing of her own: never "il a sa propre page"');
  assert.doesNotMatch(s.answer('sport-sister-listing', true), /il a sa propre page/);
  assert.equal(s.best('Le club de golf comme tel n’a pas de 5 à 7. Par contre, le restaurant 1913 fait des soupers spéciaux le vendredi soir en saison. Qu’est-ce que je réponds ici?').id, 'sport-hh-none-specials');
  assert.match(s.answer('sport-offseason-other', true), /Bon à savoir[\s\S]*Écrivez-nous/);
  assert.match(e.answer('indoor-cost', true), /^<p>C’est gratuit, vraiment/);
  // An error page with no login words is never a confident unrelated answer.
  const r = e.best('J’ai une erreur quand je clique sur le bouton, ça ne marche pas.');
  assert.ok(!r.id || ['login-not-found', 'photo-add', 'photo-small', 'menu-import'].includes(r.id), r.id);
});

test('3b. "it has its own page" only when there is one: a simulator listing at her address', async () => {
  const { v, t } = await setUp(SRC.sport11, { name: 'Vernon Sister Club', address: '800 Kalamalka Lake Road' });
  app.createVenue({ name: 'Vernon Sister Club Indoor Golf', slug: `vernon-sister-sim-${n}`, region: 'vernon', type: 'golf', latitude: 50.2, longitude: -119.2, address: '800 Kalamalka Lake Road, Vernon', hours: JSON.stringify(WK), description: 'Trackman bays.' });
  const b = helpBot(await getText(`/fr/owner/${t}/setup`));
  assert.match(b.answer('sport-sister-listing', true), /Vernon Sister Club Indoor Golf a sa propre page/);
  assert.ok(v.id);
});

test('4. research’s season advisory goes once she has set her season (page, card, planner), other advisories stay', async () => {
  const v = mk();
  app.guardedCollectionMembershipUpdate('advisory', v.id, 'add', 'The course has not posted its 2026 closing day. Daily dining at the clubhouse restaurant stops in the off-season (checked October 19, 2026).', { reason: 'sport test 11', batch_id: 'st11', reviewer: 'test', note_fr: 'Le terrain n’a pas annoncé sa date de fermeture 2026.' });
  const w = mk();
  app.guardedCollectionMembershipUpdate('advisory', w.id, 'add', 'Temporarily closed for bunker renovations until May 1.', { reason: 'sport test 11', batch_id: 'st11', reviewer: 'test', note_fr: 'Fermé temporairement pour la rénovation des fosses jusqu’au 1er mai.' });
  clear();
  assert.match(await getText(pagePath(v)), /has not posted its 2026 closing day/);
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1], tw = app.createOwnerLink(w.id, {}).url.split('/owner/')[1];
  await ok(change(t, { hours: WK, open_months: '04-03:10-31' }));
  await ok(change(tw, { hours: WK, open_months: '04-03:10-31' }));
  clear();
  assert.doesNotMatch(await getText(pagePath(v)), /has not posted its 2026 closing day/);
  assert.doesNotMatch(await getText(pagePath(v, 'fr')), /n’a pas annoncé sa date de fermeture/);
  assert.match(await getText(pagePath(w)), /bunker renovations/, 'an advisory about something else stays');
  assert.doesNotMatch(plain(await getText('/vernon/golf')), /has not posted its 2026 closing day/);
});

test('5. the typed price list starts with her own words only: never the kind’s "18 holes"', async () => {
  const { t } = await setUp();
  const fr = await getText(`/fr/owner/${t}/menu`);
  const m = /"firstItem":(\{[^}]*\})/.exec(fr);
  assert.ok(m, 'her price is the first line');
  const first = JSON.parse(m[1]);
  assert.equal(first.name, '', 'no name she didn’t give');
  assert.equal(first.price, '75');
  assert.doesNotMatch(m[1], /18 trous|18 holes/);
});

test('6–7, 9. the setup client: French lines queued (no switch to English), no Kids welcome from a pre-picked age, the book-ahead example', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  const text = require('../owner-setup-text.js');
  assert.match(client, /if \(INDOOR && T\.frOnlyQueued\) return '<p class="su-hint" id="suFrOnlyNamed">'/);
  assert.match(text.fr.frOnlyQueued, /Nous écrivons la version anglaise/);
  assert.doesNotMatch(text.fr.frOnlyQueued, /Ajouter la version anglaise/);
  // A pre-picked age (from the kind) that she didn't touch is not her answer.
  assert.match(client, /var iGuess = !!S\.tour\.ageGuessed && !TI\.age;/);
  assert.match(client, /if \(!iGuess && S\.tour\.age !== \(TI\.age \|\| ''\)\) ia\.age = S\.tour\.age;/);
  assert.match(client, /if \(iGuess\) ikids = !!S\.savedBadges\.kid_friendly;/);
  assert.match(client, /if \(tGuess\) kidsOn = !!S\.savedBadges\.kid_friendly;/);
  // Book ahead: the example doesn't say tee times are recommended.
  assert.match(client, /bk0 === 'ahead' && T\.bringExKinds\.golfahead\) return T\.bringExKinds\.golfahead;/);
  assert.doesNotMatch(text.fr.indoor.bringExKinds.golfahead, /conseillées/);
  assert.doesNotMatch(text.en.indoor.bringExKinds.golfahead, /recommended/);
});

test('8. « départ » is a tee time for golfers: « un départ le matin puis un souper » plans golf, then dinner', async () => {
  const fr = require('../trip-planner-fr.js');
  assert.equal(fr.tripPlannerText('un départ le matin puis un souper à Vernon le 16 juillet 2027', null, { frenchPage: true }), 'a tee time in the morning then a dinner at vernon july 16 2027');
  assert.equal(fr.tripPlannerText('réserver un départ à Vernon', null, { frenchPage: true }), 'book a tee time at vernon');
  assert.match(fr.tripPlannerText('golf à Vernon, un départ vers 8 h puis un souper', null, { frenchPage: true }), /a tee time around 8:00 am then a dinner/);
  // A departure is still a departure.
  assert.match(fr.tripPlannerText('un départ de Kelowna puis vignobles', null, { frenchPage: true }), /departure from kelowna/);
  assert.doesNotMatch(fr.tripPlannerText('on veut un départ vers 8 h puis le lac', null, { frenchPage: true }), /tee time/);
});

test('10. « Créer mon compte » on the French link page lands on /fr/owner/account/venue/<id> with « Vous êtes connecté »', async () => {
  const v = mk();
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  const page = await getText(`/fr/owner/${t}`);
  const line = /var go = ([^;]+);/.exec(page);
  assert.ok(line);
  const r = await fetch(`${base}/fr/owner/${t}/account`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': ip() }, body: JSON.stringify({ email: `genevieve${n}@example.invalid`, password: 'a long enough password' }) });
  assert.equal(r.status, 201);
  const j = await r.json();
  const go = new Function('location', 'j', `return ${line[1]};`)({ pathname: `/fr/owner/${t}` }, j);
  assert.equal(go, `/fr/owner/account/venue/${v.id}?welcome=1`);
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const landed = await fetch(base + go, { headers: { Cookie: cookie, 'User-Agent': 'okanaganroam-check/1.0' } });
  assert.equal(landed.status, 200);
  const html = await landed.text();
  assert.match(html, /id="opWelcome" role="status">Vous êtes connecté\./);
  // "You're signed in" sits at the top: before the edit form's first section.
  assert.ok(html.indexOf('id="opWelcome"') < html.indexOf('id="opHours"') || html.indexOf('id="opHours"') < 0);
});
