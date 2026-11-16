// Second first-time BREWERY owner test on Whistler (Mathieu, iPhone, French, a brewpub with its own kitchen; Whistler Roam
// drafts/fresh-eyes-brewery2-2026-11-16/REPORT.md). The code is shared, so the fixes are made here:
//  1. a French event with a comma detail saves (French name + detail over the kind's English name);
//  2. the French edit page shows the answers' French lines (it printed "[object Object]");
//  3. a French-only Known for counts as done; the answers list names a French-only event by its French title;
//  4. dogs: the French chip is pre-filled in French; her own French dogs line keeps its meaning in English and isn't
//     said twice in French; "Dogs on patio" on trip cards;
//  5. the pub's seasonal kitchen time for breweries and distilleries, and for two stretches of other hours (pubs too);
//  6. help: off-seasons, the kitchen off-season, no cover, paid parking, group bookings, opening late on a holiday, and
//     "Right here in setup" for happy hour and the menu or tap list;
//  7. one line on the last screen when answers are in French only;
//  8. the events screen's closed-day heads-up, and the page marks an event whose day is closed in the current stretch;
//  9. the overlap message clears when the dates change;
// 10. Build My Trip: a weekday in a named month uses that month's hours; a named brewpub is the meal; French dates,
//     « midi » and French chips;
// 11. the small ones.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'brewery-wr2-admin-token';
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
const mk = (type, o = {}) => app.createVenue({ name: `Lac Test ${++n}`, slug: `lac-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('11:00', '23:00')),
  description: 'A fixture used only by the second Whistler brewery fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const getJson = (p) => fetch(base + p).then((r) => r.json());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.15.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
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

// Mathieu's brewpub: research's lines and badges, his hours with two shoulder stretches (closed Mondays and Tuesdays),
// his own kitchen (closes at 10 PM), kids until 9 PM.
const RESEARCH = [{ label: 'Known for', text: 'House lagers and après on the patio' }, { label: 'Prices', text: 'Pints $8.50, flights $14, mains $19–$27' }, { label: 'Kids & dogs', text: 'Kids welcome until 9 PM; dogs on patio' },
  { label: 'Reservations', text: 'Walk-ins; groups call ahead' }, { label: 'Good to know', text: 'Paid parking in Day Lots' }];
const USUAL = { mon: [['15:00', '22:00']], tue: [['15:00', '22:00']], wed: [['15:00', '22:00']], thu: [['15:00', '22:00']], fri: [['11:30', '01:00']], sat: [['11:30', '01:00']], sun: [['11:30', '00:00']] };
const SHOULDER = { mon: [], tue: [], wed: [['15:00', '22:00']], thu: [['15:00', '22:00']], fri: [['15:00', '22:00']], sat: [['15:00', '22:00']], sun: [['15:00', '22:00']] };
const FALL = { label: '', from: '10-13', to: '11-26', hours: SHOULDER }, SPRING = { label: '', from: '04-19', to: '05-29', hours: SHOULDER };
const mathieu = async (o = {}, opts = {}) => {
  const v = mk('brewery', { name: opts.name || `Mathieu Fixture ${n + 1}`, price: '$$', rating: 4.5, reviews: 388, patio: 1, dog_friendly: 1, kid_friendly: 1, happy_hour: 1, sports_tv: 1, live_music: 1, great_groups: 1, vegetarian: 1, gluten_free: 1, ...o });
  research(v.id, RESEARCH);
  const t = tokenFor(v.id);
  ok(await change(t, { hours: USUAL, hours_checked: true }, true));
  if (!opts.noSeasons) ok(await change(t, { hours_seasons: [FALL, SPRING] }, true));
  if (!opts.noKitchen) ok(await change(t, { place_type: 'Brewery', brewery_info: { food: 'kitchen', outside: 'no', kitchen: { mode: 'earlier', closes: '22:00' } } }, true));
  ok(await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '21:00', note: '' } } }, true));
  return { v, t };
};

// ====================== 1. A French event with a comma detail ======================
test('French setup: an event with a French name and detail saves over the kind’s English name; the English page shows it without the French detail', async () => {
  const { v, t } = await mathieu();
  // What the French setup sends for « Musique en direct, groupes d’ici, sans frais d’entrée » (kind: live music).
  const music = { days: ['fri', 'sat'], kind: 'live_music', title: 'Live music', start: '21:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly', title_fr: 'Musique en direct', detail_fr: 'Groupes d’ici, sans frais d’entrée', season_from: null, season_to: null };
  // « Lancement de bière » is "Something else": French only (no English name).
  const release = { days: ['thu'], kind: 'other', title: '', start: '17:00', end: null, detail: null, host: null, cost: null, frequency: 'monthly-1st', title_fr: 'Lancement de bière', detail_fr: 'Une nouvelle bière chaque mois', season_from: null, season_to: null };
  const r = await change(t, { weekly_nights: [music, release] }, true);
  ok(r);
  const stored = app.venueWeeklyNightsList(v.id);
  assert.equal(stored.find((x) => x.kind === 'live_music').detail_fr, 'Groupes d’ici, sans frais d’entrée');
  assert.equal(stored.find((x) => x.kind === 'live_music').detail, null);
  const jan = at('2027-01-15', '12:00');
  const fr = plain(page(v, 'fr', jan)), en = plain(page(v, 'en', jan));
  assert.match(fr, /Musique en direct/); assert.match(fr, /Groupes d’ici, sans frais d’entrée/); assert.match(fr, /Lancement de bière/);
  assert.match(en, /Live music/); assert.doesNotMatch(en, /Groupes d’ici/); assert.doesNotMatch(en, /Lancement de bière/);
  // The setup sends exactly that shape: the French detail with no English one.
  assert.match(CLIENT(), /title_fr: titleFr, detail_fr: FRS && sp\.detail \? sp\.detail :/);
  // An event with English words of its own still needs the English detail first (the edit page's rule), and so does a
  // French detail with no French title.
  const V = (x) => app.validateWeeklyNights([x], { source: 'venue_owner', checked_at: today, type: 'brewery' });
  assert.equal(V({ days: ['sun'], kind: 'other', title: 'Workshop', title_fr: 'Atelier', detail: null, detail_fr: 'Sur réservation' }).ok, false);
  assert.equal(V({ days: ['sun'], kind: 'live_music', title: 'Sunday sessions', title_fr: 'Musique', detail: null, detail_fr: 'Sans frais' }).ok, false);
  assert.equal(V({ days: ['sun'], kind: 'live_music', title: 'Live music', title_fr: null, detail: null, detail_fr: 'Sans frais' }).ok, false);
  assert.equal(V({ days: ['sun'], kind: 'trivia', title: 'Trivia', title_fr: 'Quiz', detail: null, detail_fr: 'Équipes de 6' }).ok, true);
  // Every setup type takes it (a pub, a restaurant).
  for (const type of ['pub', 'restaurant', 'cocktail', 'distillery']) {
    const o = mk(type);
    ok(await change(tokenFor(o.id), { weekly_nights: [music] }, true));
  }
});

// ====================== 2. The French edit page ======================
test('French edit page: the answers’ lines read in French, never "[object Object]"', async () => {
  const { v, t } = await mathieu();
  ok(await change(t, { flight_fee: 14 }, true));
  ok(await change(t, { brewery_info: { to_go: ['cans', 'growler', 'crowler'] } }, true));
  const box = app.venueVisitInfo(v.id);
  assert.equal(typeof box.owner_fr.Food, 'object');
  const html = (await get(`/fr/owner/${t}`)).text;
  assert.doesNotMatch(html, /\[object Object\]/);
  const p = plain(html);
  assert.match(p, /Cuisine sur place ; elle ferme à 22 h\. Pas de nourriture de l’extérieur\./);
  assert.match(p, /14 \$ la palette\./);
  assert.match(p, /Canettes, remplissage de cruchons \(growlers\) et remplissage de canettes géantes \(crowlers\) pour emporter\./);
  assert.match(p, /Mineurs bienvenus avec un adulte jusqu’à 21 h\./);
  // The English edit page keeps the English lines.
  assert.match(plain((await get(`/owner/${t}`)).text), /Our own kitchen; it closes at 10 PM\. No outside food, please\./);
  // The helper: the French goes with that English line only.
  assert.equal(app.ownerFrLineText({ owner_fr: { Food: { en: 'A', fr: 'B' } } }, { label: 'Food', text: 'A' }), 'B');
  assert.equal(app.ownerFrLineText({ owner_fr: { Food: { en: 'A', fr: 'B' } } }, { label: 'Food', text: 'changed' }), '');
  assert.equal(app.ownerFrLineText({}, { label: 'Food', text: 'A' }), '');
  // No other reader of owner_fr prints the object.
  assert.doesNotMatch(SERVER(), /box\.owner_fr\[r\.label\]\) \|\| r\.text/);
});

// ====================== 3. French Known for counts; the answers list names a French-only event ======================
test('a Known for written in the French setup is answered (score and "to reach 100%"); a French-only event is named in the answers list', async () => {
  const { v, t } = await mathieu();
  const left0 = (await getJson(`/owner/${t}/setup/progress`)).score.left.map((x) => x.k);
  // Research's Known for is there, so it counts already; her own French one replaces it and must still count.
  ok(await change(t, { visit_rows: { known_for: 'Nos lagers maison, la poutine et l’après-ski sur la terrasse chauffée', _lang: 'fr' } }, true));
  const box = app.venueVisitInfo(v.id);
  assert.equal(box.owner_fr_lines.known_for, 'Nos lagers maison, la poutine et l’après-ski sur la terrasse chauffée');
  assert.ok(!(box.rows || []).some((r) => r.label === 'Known for'), 'no English Known for line');
  const sc = (await getJson(`/fr/owner/${t}/setup/progress`)).score;
  assert.ok(!sc.left.some((x) => x.k === 'pyv_known'), JSON.stringify(sc.left));
  assert.ok(!left0.includes('pyv_known'));
  // A place with no Known for at all is still asked for it.
  const bare = mk('brewery'); const tb = tokenFor(bare.id);
  assert.ok((await getJson(`/owner/${tb}/setup/progress`)).score.left.some((x) => x.k === 'pyv_known'));
  ok(await change(tb, { visit_rows: { known_for: 'Des IPA troubles et une sure aux mûres', _lang: 'fr' } }, true));
  assert.ok(!(await getJson(`/owner/${tb}/setup/progress`)).score.left.some((x) => x.k === 'pyv_known'));
  // A French groups line counts the same way.
  const r = mk('restaurant'); const tr = tokenFor(r.id);
  assert.ok((await getJson(`/owner/${tr}/setup/progress`)).score.left.some((x) => x.k === 'pyv_groups'));
  ok(await change(tr, { visit_rows: { groups: 'Pour les groupes de 12 et plus, écrivez-nous une semaine avant', _lang: 'fr' } }, true));
  assert.ok(!(await getJson(`/owner/${tr}/setup/progress`)).score.left.some((x) => x.k === 'pyv_groups'));
  // The answers list: « Lancement de bière : 1er du mois », never «  : 1er du mois ».
  const s = CLIENT();
  const fn = (name) => { const i = s.indexOf(`function ${name}(`); let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
  const line = (lang) => new Function('S', 'T', 'C', 'fill', `${fn('freqLabel')}\n${fn('musicOftenLine')}\nreturn musicOftenLine();`)(
    { done: { music: 'live' }, nightsSaved: [{ title: '', title_fr: 'Lancement de bière', frequency: 'monthly-1st' }, { title: 'Trivia', title_fr: 'Quiz', frequency: 'biweekly' }, { title: 'Live music', frequency: 'weekly' }] },
    text[lang], { lang, nightFreqs: [['weekly', 'w'], ['biweekly', lang === 'fr' ? 'Une semaine sur deux' : 'Every other week'], ['monthly-1st', lang === 'fr' ? '1er du mois' : '1st of the month']] }, fill);
  assert.equal(line('fr').replace(/[  ]/g, ' '), 'Lancement de bière : 1er du mois; Quiz : Une semaine sur deux');
  assert.equal(line('en'), 'Trivia: Every other week', 'the English list leaves a French-only event out');
});

// ====================== 4. Dogs ======================
test('dogs: the French setup pre-fills « Terrasse seulement »; a French dogs line keeps its meaning in English and isn’t said twice in French', async () => {
  // Research's "dogs on patio" pre-fills the chip in the setup's own language (before she answers anything).
  const fresh = mk('brewery', { dog_friendly: 1 }); research(fresh.id, RESEARCH);
  assert.equal((await setupCfg(tokenFor(fresh.id), true)).suggestDogNote, 'Terrasse seulement');
  assert.equal((await setupCfg(tokenFor(fresh.id), false)).suggestDogNote, 'Patio only');
  assert.match(CLIENT(), /S\.dogGuessSet = true; S\.dogNote = C\.suggestDogNote; S\.dogGuessed = true;/);
  const { v, t } = await mathieu();
  const fromJan = at('2027-01-15', '12:00');
  // Before any dogs line: the plain sentence in both languages.
  assert.match(plain(page(v, 'en', fromJan)), /Minors welcome with an adult until 9 PM\. Dogs welcome\./);
  // The chip alone reads in either language (stored as before): her own row, nothing repeated.
  ok(await change(t, { visit_rows: { dogs: 'Terrasse seulement', _lang: 'fr' } }, true));
  let en = plain(page(v, 'en', fromJan)), fr = plain(page(v, 'fr', fromJan));
  assert.match(en, /Dogs welcome on the patio only\./); assert.doesNotMatch(en, /Dogs welcome\.(?! on)/);
  assert.match(fr, /Chiens bienvenus sur la terrasse seulement\./); assert.doesNotMatch(fr, /Chiens bienvenus\./);
  // Her own words after the chips: French only. The English Kids & dogs line says what the chips say; the French page
  // has her line once and no « Chiens bienvenus. ».
  ok(await change(t, { visit_rows: { dogs: 'Terrasse seulement. Bols d’eau à l’entrée. Pas de chiens à l’intérieur.', _lang: 'fr' } }, true));
  const box = app.venueVisitInfo(v.id);
  assert.equal(box.owner_fr_lines.dogs, 'Terrasse seulement. Bols d’eau à l’entrée. Pas de chiens à l’intérieur.');
  const kd = box.rows.find((r) => r.label === 'Kids & dogs');
  assert.equal(kd.text, 'Minors welcome with an adult until 9 PM. Dogs welcome on the patio only. Water bowls at the door.');
  assert.equal(box.owner_fr['Kids & dogs'].fr, 'Mineurs bienvenus avec un adulte jusqu’à 21 h.');
  en = plain(page(v, 'en', fromJan)); fr = plain(page(v, 'fr', fromJan));
  assert.match(en, /Dogs welcome on the patio only\. Water bowls at the door\./);
  assert.doesNotMatch(en, /Dogs welcome\.(?! on)/, 'never a plain "Dogs welcome" over patio only');
  assert.doesNotMatch(en, /Terrasse seulement|Pas de chiens/);
  assert.equal((fr.match(/Terrasse seulement\. Bols d’eau à l’entrée\. Pas de chiens à l’intérieur\./g) || []).length, 1);
  assert.doesNotMatch(fr, /Chiens bienvenus\./);
  // Her own French words with no chip: the honest short words.
  assert.equal(app.dogsFrLineEnglish('Les chiens restent dehors seulement, en laisse'), 'Dogs outside only.');
  assert.equal(app.dogsFrLineEnglish('Sur la terrasse seulement, en laisse'), 'Dogs on the patio only.');
  assert.equal(app.dogsFrLineEnglish('Nos amis à quatre pattes sont les bienvenus'), '');
  assert.equal(app.dogsFrLineEnglish('Intérieur et terrasse'), 'Dogs welcome inside and on the patio.');
  ok(await change(t, { visit_rows: { dogs: 'Les chiens restent dehors seulement, en laisse', _lang: 'fr' } }, true));
  assert.match(app.venueVisitInfo(v.id).rows.find((r) => r.label === 'Kids & dogs').text, /until 9 PM\. Dogs outside only\.$/);
  // An English line of her own stays its own row, as before (nothing about dogs in Kids & dogs).
  ok(await change(t, { visit_rows: { dogs: 'Dogs on the patio only, on a leash' } }));
  const b2 = app.venueVisitInfo(v.id);
  assert.equal(b2.rows.find((r) => r.label === 'Kids & dogs').text, 'Minors welcome with an adult until 9 PM.');
  assert.equal(b2.rows.find((r) => r.label === 'Dogs').text, 'Dogs on the patio only, on a leash');
});

test('dogs: "Dogs on patio" on cards and in Build My Trip when that is what the owner said (English or French setup)', async () => {
  const { v, t } = await mathieu({ region: 'penticton' }, { name: 'Ombrelle Taphouse' });
  ok(await change(t, { visit_rows: { dogs: 'Terrasse seulement. Bols d’eau à l’entrée. Pas de chiens à l’intérieur.', _lang: 'fr' } }, true));
  assert.equal(app.dogsPatioOnly(app.getVenue(v.id)), true);
  const fact = app.buildTripPlannerFacts(false, today).find((x) => x.id === v.id);
  assert.equal(fact.dogsPatioOnly, true);
  const p = await plan('une microbrasserie qui accepte les chiens à Penticton en février');
  const rec = (p.recommendations || []).find((x) => x.venue && x.venue.id === v.id);
  assert.ok(rec, 'in the list');
  assert.ok(rec.reasons.some((r) => (r.text || r) === 'Dogs on patio'), JSON.stringify(rec.reasons));
  assert.ok(!rec.reasons.some((r) => /Dog-Friendly badge/.test(r.text || r)));
  assert.equal(rec.venue.badges.find((b) => b.key === 'dog_friendly').label, 'Dogs on patio');
  assert.equal(rec.venue.dogsPatioOnly, true);
  assert.equal(frCopy.t3FrenchText('Dogs on patio'), 'Chiens sur la terrasse');
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /b\.key === 'dog_friendly' && v\.dogsPatioOnly \? \(lang\(\) === 'fr' \? 'Chiens sur la terrasse' : 'Dogs on patio'\)/);
  // A place that never said so keeps the plain badge.
  const other = mk('brewery', { name: 'Plainfield Brewing', dog_friendly: 1 });
  assert.equal(app.buildTripPlannerFacts(false, today).find((x) => x.id === other.id).dogsPatioOnly, undefined);
});

// ====================== 5. The kitchen in the shoulder seasons ======================
test('a brewery’s kitchen takes the pub’s seasonal time, one for each of two stretches; the page’s Food line is right by date', async () => {
  const { v, t } = await mathieu();
  assert.match(plain(page(v, 'en', at('2026-11-18'))), /Our own kitchen; it closes at 10 PM\./);
  const k = { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: '21:00' }, season2: { from: '04-19', to: '05-29', closes: '21:00' } };
  ok(await change(t, { brewery_info: { kitchen: k } }, true));
  assert.deepEqual(app.venueBreweryInfo(v.id).kitchen, k);
  // The stored row keeps the rest-of-the-year time; the page shows the time for the date.
  assert.equal(app.venueVisitInfo(v.id).rows.find((r) => r.label === 'Food').text, 'Our own kitchen; it closes at 10 PM. No outside food, please.');
  for (const [date, en, fr] of [['2026-11-18', '9 PM', '21 h'], ['2027-05-05', '9 PM', '21 h'], ['2027-01-15', '10 PM', '22 h'], ['2027-07-10', '10 PM', '22 h'], ['2026-10-13', '9 PM', '21 h'], ['2026-11-27', '10 PM', '22 h']]) {
    assert.match(plain(page(v, 'en', at(date))), new RegExp(`Our own kitchen; it closes at ${en}\\. No outside food, please\\.`), date);
    assert.match(plain(page(v, 'fr', at(date))), new RegExp(`Cuisine sur place ; elle ferme à ${fr}\\. Pas de nourriture de l’extérieur\\.`), date);
    assert.deepEqual(app.plannerOwnKitchen(app.getVenue(v.id), date), { closes: en === '9 PM' ? '21:00' : '22:00' }, `planner ${date}`);
  }
  // "Food until we close" in the stretch, and a kitchen open until close the rest of the year with a time in the stretch.
  ok(await change(t, { brewery_info: { kitchen: { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: 'close' } } } }, true));
  assert.match(plain(page(v, 'en', at('2026-11-18'))), /Our own kitchen, food until close\./);
  assert.match(plain(page(v, 'en', at('2027-05-05'))), /it closes at 10 PM\./, 'only the stretch that has a time');
  ok(await change(t, { brewery_info: { kitchen: { mode: 'same', season: { from: '10-13', to: '11-26', closes: '20:00' }, season2: { from: '04-19', to: '05-29', closes: '20:00' } } } }, true));
  assert.match(plain(page(v, 'en', at('2027-01-15'))), /Our own kitchen, food until close\./);
  assert.match(plain(page(v, 'en', at('2027-04-20'))), /Our own kitchen; it closes at 8 PM\./);
  // A kitchen stored before this reads exactly as before; bad seasons are refused.
  ok(await change(t, { brewery_info: { kitchen: { mode: 'earlier', closes: '21:30' } } }, true));
  assert.deepEqual(app.venueBreweryInfo(v.id).kitchen, { mode: 'earlier', closes: '21:30' });
  assert.equal((await change(t, { brewery_info: { kitchen: { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: '9pm' } } } })).status, 400);
  assert.equal((await change(t, { brewery_info: { kitchen: { mode: 'earlier', closes: '22:00', season2: { from: '10-13', to: '10-13', closes: '21:00' } } } })).status, 400);
  // A distillery with its own kitchen takes it too.
  const d = mk('distillery'); const td = tokenFor(d.id);
  ok(await change(td, { brewery_info: { food: 'kitchen', kitchen: { mode: 'earlier', closes: '21:00', season: { from: '11-01', to: '03-31', closes: '20:00' } } } }));
  assert.equal(app.venueBreweryInfo(d.id).kitchen.season.closes, '20:00');
});

test('a pub’s (and a restaurant’s) kitchen time covers two stretches: stored as season and season2, read by date', async () => {
  for (const type of ['pub', 'restaurant', 'cocktail']) {
    const v = mk(type); const t = tokenFor(v.id);
    ok(await change(t, { hours: USUAL, hours_checked: true }));
    ok(await change(t, { hours_seasons: [FALL, SPRING] }));
    const k = { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: '21:00' }, season2: { from: '04-19', to: '05-29', closes: '21:00' } };
    ok(await change(t, { pub_info: { kitchen: k } }));
    assert.deepEqual(app.venuePubInfo(v.id).kitchen, k, type);
    const venue = () => app.getVenue(v.id);
    assert.match(app.pubInfoLinesHtml(venue(), false, at('2026-11-18')), /Kitchen closes at 9 PM/, type);
    assert.match(app.pubInfoLinesHtml(venue(), false, at('2027-05-05')), /Kitchen closes at 9 PM/, type);
    assert.match(app.pubInfoLinesHtml(venue(), false, at('2027-01-15')), /Kitchen closes at 10 PM/, type);
    assert.match(app.pubInfoLinesHtml(venue(), true, at('2027-05-05')), /La cuisine ferme à 21 h/, type);
    assert.deepEqual(app.plannerOwnKitchen(venue(), '2027-05-05'), { closes: '21:00' });
    assert.deepEqual(app.plannerOwnKitchen(venue(), '2027-01-15'), { closes: '22:00' });
  }
  // One stretch, as before.
  assert.deepEqual(app.pubKitchenOn({ mode: 'earlier', closes: '22:00', season: { from: '06-01', to: '08-31', closes: 'close' } }, '2027-07-01'), { mode: 'same', note: undefined });
  assert.deepEqual(app.pubKitchenOn({ mode: 'earlier', closes: '22:00' }, '2027-07-01'), { mode: 'earlier', closes: '22:00', note: undefined });
});

test('the setup asks the seasonal kitchen time on the taproom screen and on the pub’s kitchen screen, once for both stretches', () => {
  const s = CLIENT();
  // The same block on both screens; a brewery sees it once a kitchen answer is picked.
  assert.match(s, /\+ kseaBlock\(\)\n\s+\+ \(C\.lang !== 'fr' && !S\.kitchen\.note/);
  assert.match(s, /\+ \(bw\.kmode \? kseaBlock\(\) : ''\) : ''\)/);
  assert.match(s, /if \(kv && !kseaInto\(kv, kv\.mode === 'same'\)\) \{ S\.nudge = T\.kitchenSeasonNeed; return render\(\); \}/);
  // The seasonal time typed on the taproom screen survives a redraw (tapping "No" for outside food after it lost it).
  assert.match(s, /if \(\(x = v\('suKsto'\)\) !== null && C\.brewery && S\.kitchen && S\.kitchen\.sea\) S\.kitchen\.sea\.closes = x;/);
  for (const lang of ['en', 'fr']) for (const k of ['kitchenSeasonQ', 'kitchenSeasonQ2', 'kitchenSeasonSame', 'kitchenSeasonClose', 'kitchenSeasonAt', 'kitchenSeasonNeed']) assert.ok(text[lang][k], `${lang}.${k}`);
  assert.match(text.en.kitchenSeasonQ2, /\{a\} – \{b\} and \{a2\} – \{b2\}/);
  assert.match(text.fr.kitchenSeasonQ2, /du \{a\} au \{b\} et du \{a2\} au \{b2\}/);
  // The block and the writer, run on their own.
  const mk2 = (seasons, sea) => {
    const ctx = { CUR: { hours_seasons: seasons }, S: { kitchen: { sea } }, T: text.en, fill, h: (x) => String(x), mdLabel: (md) => md };
    clientPart('  function kitchenSeasons(){', '  function mdText(md){', ctx, '\nfunction mdText(md){ return mdLabel(md); }\nthis.kseaBlock = kseaBlock; this.kseaInto = kseaInto; this.kitchenSeasons = kitchenSeasons;');
    return ctx;
  };
  const two = [{ from: '10-13', to: '11-26', hours: {} }, { from: '04-19', to: '05-29', hours: {} }];
  let c = mk2(two, { mode: 'time', closes: '21:00' });
  assert.match(c.kseaBlock(), /In your 10-13 – 11-26 and 04-19 – 05-29 hours, when does the kitchen close\?/);
  let kv = { mode: 'earlier', closes: '22:00' };
  assert.equal(c.kseaInto(kv, false), true);
  assert.deepEqual(JSON.parse(JSON.stringify(kv)), { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: '21:00' }, season2: { from: '04-19', to: '05-29', closes: '21:00' } });
  // One stretch: the question as before, one season.
  c = mk2([two[0]], { mode: 'close', closes: '' });
  assert.match(c.kseaBlock(), /In your 10-13 – 11-26 hours, when does the kitchen close\?/);
  kv = { mode: 'earlier', closes: '22:00' }; assert.equal(c.kseaInto(kv, false), true);
  assert.deepEqual(JSON.parse(JSON.stringify(kv)), { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: 'close' } });
  // "Food until we close" in the stretch when the kitchen is open until close all year stores nothing; "Same time" too.
  kv = { mode: 'same' }; assert.equal(c.kseaInto(kv, true), true); assert.deepEqual(JSON.parse(JSON.stringify(kv)), { mode: 'same' });
  c = mk2(two, { mode: 'same', closes: '' }); kv = { mode: 'earlier', closes: '22:00' }; assert.equal(c.kseaInto(kv, false), true); assert.equal(kv.season, undefined);
  // A time that is still blank asks for it.
  c = mk2(two, { mode: 'time', closes: '' }); assert.equal(c.kseaInto({ mode: 'earlier', closes: '22:00' }, false), false);
  // No stretch: no question.
  c = mk2([], { mode: 'same', closes: '' }); assert.equal(c.kseaBlock(), '');
});

// ====================== 6. Help ======================
test('help in a brewery’s setup: off-seasons, the kitchen off-season, no cover, paid parking, group bookings, opening late, and "Right here in setup"', async () => {
  const { t } = await mathieu();
  const bots = { en: helpBot((await get(`/owner/${t}/setup`)).text), fr: helpBot((await get(`/fr/owner/${t}/setup`)).text) };
  const want = [
    [['on a deux saisons mortes', 'les saisons mortes', 'hors saison', 'we have two off seasons'], 'brewery-seasonal-hours'],
    [['la cuisine ferme plus tôt hors saison', 'ma cuisine ferme à 21 h hors saison', 'the kitchen closes earlier in the off season', 'when does the kitchen close'], 'brewery-kitchen'],
    [['musique sans frais d’entrée', 'sans frais d’entrée', 'live music with no cover', 'no cover charge'], 'event-cover'],
    [['stationnement payant', 'paid parking', 'our parking is not free'], 'parking-paid'],
    [['réservation pour les groupes', 'group reservations'], 'brewery-groups'],
    [['on ouvre à 14 h le jour de l’An', 'we open at 2 PM on New Year’s Day'], 'closures'],
    [['on a un deuxième 5 à 7', 'we have a second happy hour'], 'hh-times'],
    [['liste des bières', 'where do I add my tap list'], 'brewery-taplist'],
    [['how do I add my menu'], 'menu-add'],
  ];
  for (const lang of ['en', 'fr']) for (const [qs, id] of want) for (const q of qs) assert.equal(bots[lang].best(q).id, id, `${lang}: ${q}`);
  const A = (id, lang) => bare(bots[lang].topic(id)[lang === 'fr' ? 'aFr' : 'a']);
  assert.match(A('brewery-kitchen', 'en'), /^Right here in setup: Your taproom \(tap Change an answer if it’s done\)\. With Our own kitchen picked, answer Does your kitchen close before the bar\? and pick the time\./);
  assert.match(A('brewery-kitchen', 'en'), /With two stretches, one time covers both\./);
  assert.match(A('brewery-kitchen', 'fr'), /^Ici même, dans la configuration : Votre salle de dégustation \(touchez Modifier une réponse si c’est fait\)\. Avec Notre cuisine choisi/);
  assert.match(A('event-cover', 'en'), /^Right here in setup: Weekly events \(tap Change an answer if it’s done\): write it after the event’s name, with a comma, like Live music, no cover\./);
  assert.match(A('event-cover', 'fr'), /^Ici même, dans la configuration : Événements de la semaine .* : écrivez-le après le nom, avec une virgule, comme Musique en direct, sans frais d’entrée\./);
  assert.match(A('parking-paid', 'en'), /^Right here in setup: What you offer .*: leave Free parking unticked .* write it under Good to know in Plan your visit on your edit page\./);
  assert.match(A('parking-paid', 'fr'), /laissez Stationnement gratuit décoché .* écrivez-le sous Bon à savoir/);
  assert.match(A('brewery-groups', 'en'), /^Right here in setup: Groups and booking /); assert.doesNotMatch(A('brewery-groups', 'en'), /^No\./);
  assert.match(A('brewery-groups', 'fr'), /^Ici même, dans la configuration : Groupes et réservations /); assert.doesNotMatch(A('brewery-groups', 'fr'), /^Non\./);
  assert.match(A('closures', 'en'), /Open that day but closing early or opening late\? Leave it unticked and message us the date and time\.$/);
  assert.match(A('closures', 'fr'), /vous fermez plus tôt ou ouvrez plus tard \? Ne le cochez pas et écrivez-nous la date et l’heure\.$/);
  assert.match(A('hh-times', 'en'), /Right here in setup: Happy hour \(tap Change an answer if it’s done\)\. A second one/);
  assert.match(A('hh-times', 'fr'), /Ici même, dans la configuration : 5 à 7 \(touchez Modifier une réponse si c’est fait\)\. Un deuxième/);
  assert.match(A('brewery-taplist', 'en'), /^Right here in setup: Your menu or tap list \(tap Change an answer if it’s done\): paste the link/);
  assert.match(A('brewery-taplist', 'fr'), /^Ici même, dans la configuration : Votre menu ou liste des bières /);
  assert.match(A('menu-add', 'en'), /^Right here in setup: Your menu or tap list /);
  // The edit page keeps its own wording (no "Right here in setup" there), and its kitchen answer names the step.
  const edit = helpBot((await get(`/owner/${t}`)).text);
  assert.doesNotMatch(edit.topic('hh-times').a, /Right here in setup/);
  assert.match(bare(edit.topic('brewery-kitchen').a), /Open Set up your page, tap Change an answer, then Your taproom\./);
  assert.equal(edit.topic('event-cover'), undefined);
});

test('help for the other types: the kitchen off-season for pubs and restaurants, parking and cover where the screens exist, never happy hour for a café', async () => {
  const bot = async (type, o = {}) => { const v = mk(type, o); return helpBot((await get(`/owner/${tokenFor(v.id)}/setup`)).text); };
  const pub = await bot('pub', { happy_hour: 1 }), rest = await bot('restaurant', { happy_hour: 1 }), cafe = await bot('cafe'), winery = await bot('winery'), dist = await bot('distillery');
  for (const q of ['the kitchen closes earlier in the off season', 'la cuisine ferme plus tôt hors saison']) { assert.equal(pub.best(q).id, 'pub-kitchen', q); assert.equal(rest.best(q).id, 'restaurant-kitchen', q); assert.equal(dist.best(q).id, 'brewery-kitchen', q); }
  assert.match(pub.topic('pub-kitchen').a, /with two stretches, one time covers both/);
  assert.match(rest.topic('restaurant-kitchen').a, /with two stretches, one time covers both/);
  assert.match(bare(dist.topic('brewery-kitchen').a), /^Right here in setup: Food here /);
  for (const b of [pub, rest, cafe, winery, dist]) assert.equal(b.best('paid parking').id, 'parking-paid');
  assert.match(winery.topic('parking-paid').a, /add a line to your story/);
  assert.equal(pub.best('no cover').id, 'event-cover'); assert.equal(rest.best('musique sans frais d’entrée').id, 'event-cover');
  // A café's setup has no events screen and no happy hour: neither answer is offered there.
  assert.equal(cafe.topic('event-cover'), undefined);
  assert.doesNotMatch(cafe.topic('hh-times') ? cafe.topic('hh-times').a : '', /Right here in setup/);
  assert.match(pub.topic('hh-times').a, /Right here in setup: <strong>Happy hour<\/strong>/);
  assert.match(bare(rest.topic('menu-add').a), /^Right here in setup: Menu /);
  // Opening late on a holiday, for a café's own early-close topic.
  assert.equal(cafe.best('opening late on a holiday').id, 'cafe-early-close');
  assert.match(cafe.topic('cafe-early-close').a, /closing early or opening late\? Message us the date and time/);
  assert.equal(cafe.best('we open at 2 PM on New Year’s Day').id, 'cafe-early-close');
  assert.match(cafe.topic('closures').a, /closing early or opening late\? Leave it unticked and message us the date and time/);
});

// ====================== 7. French-only answers ======================
test('answers in French only: the score says so, and the last screen and the Saved message say where they show', async () => {
  const { t } = await mathieu();
  assert.equal((await getJson(`/owner/${t}/setup/progress`)).score.frOnly, undefined);
  ok(await change(t, { weekly_nights: [{ days: ['thu'], kind: 'other', title: '', start: '17:00', frequency: 'monthly-1st', title_fr: 'Lancement de bière', detail: null, detail_fr: null }] }, true));
  assert.equal((await getJson(`/fr/owner/${t}/setup/progress`)).score.frOnly, true);
  // A French detail alone, a French-only special and a French line each count.
  const a = await mathieu(); ok(await change(a.t, { weekly_nights: [{ days: ['fri'], kind: 'live_music', title: 'Live music', title_fr: 'Musique en direct', detail: null, detail_fr: 'Sans frais d’entrée', start: '21:00' }] }, true));
  assert.equal((await getJson(`/owner/${a.t}/setup/progress`)).score.frOnly, true);
  const b = await mathieu(); ok(await change(b.t, { visit_rows: { known_for: 'Nos lagers maison et la poutine', _lang: 'fr' } }, true));
  assert.equal((await getJson(`/owner/${b.t}/setup/progress`)).score.frOnly, true);
  const c = await mathieu(); ok(await change(c.t, { specials: [{ days: ['mon'], title: '', deal: '', price: null, kind: 'both', start: null, end: null, title_fr: 'Pichets à 20 $', deal_fr: 'Pichets à 20 $' }] }, true));
  assert.equal((await getJson(`/owner/${c.t}/setup/progress`)).score.frOnly, true);
  // The words, and where the last screen puts them.
  assert.match(text.en.frOnlyFinish, /in French only, so they show on your French page only\. To show them on your English page too, add them in English on your edit page\./);
  assert.match(text.fr.frOnlyFinish.replace(/[  ]/g, ' '), /en français seulement : elles paraissent sur votre page française seulement\. .* ajoutez-les en anglais sur votre page de modification\./);
  const s = CLIENT();
  assert.match(s, /function frOnlyFinish\(\)\{ return T\.frOnlyFinish && frOnlyAny\(\) \? '<p class="su-hint" id="suFrOnlyFinish">'/);
  assert.equal((s.match(/\+ frOnlyFinish\(\)/g) || []).length, 2, 'on both forms of the last screen');
  // The Saved message says it once for a French detail too.
  assert.match(s, /var any = \(out \|\| \[\]\)\.some\(function\(x\)\{ return \(!x\.title && x\.title_fr\) \|\| \(x\.detail_fr && !x\.detail\); \}\);/);
});

// ====================== 8. Events on a closed day ======================
test('an event on a day closed in a stretch: the setup warns and names the stretch; the page marks it meanwhile and never says "Tonight"', async () => {
  const { v, t } = await mathieu();
  ok(await change(t, { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', title_fr: 'Quiz', start: '19:30' }, { days: ['fri', 'sat'], kind: 'live_music', title: 'Live music', start: '21:00' }, { days: ['tue', 'fri'], kind: 'bingo', title: 'Bingo', start: '19:00' }] }));
  // A Tuesday in the fall stretch (closed Tuesdays): marked with the stretch's dates, not "Tonight".
  const card = (html) => (/<section class="venue-section venue-nights-card"[\s\S]*?<\/section>/.exec(html) || [''])[0];
  let en = plain(card(page(v, 'en', at('2026-11-17', '18:00')))), fr = plain(card(page(v, 'fr', at('2026-11-17', '18:00'))));
  assert.match(en, /Tue Trivia \(not Oct 13 – Nov 26\) 7:30 PM/); assert.doesNotMatch(en, /Tonight/);
  assert.match(fr, /Mar Quiz \(sauf du 13 oct\. au 26 nov\.\) 19 h 30/);
  // One of its two days is closed: "(when open)". An event on open days has no mark.
  assert.match(en, /Tue, Fri Bingo \(when open\) 7 PM/); assert.match(fr, /Bingo \(les jours d’ouverture\)/);
  assert.match(en, /Fri, Sat Live music 9 PM/);
  // A January Tuesday (open) has no mark and says Tonight.
  en = plain(card(page(v, 'en', at('2027-01-12', '18:00'))));
  assert.match(en, /Tue Trivia 7:30 PM Tonight/); assert.doesNotMatch(en, /not Oct|when open/);
  // A place with one set of hours all year reads as before, even on a day it is closed.
  const one = mk('pub', { hours: JSON.stringify(WK('12:00', '23:00', ['tue'])) });
  ok(await change(tokenFor(one.id), { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:30' }] }));
  assert.doesNotMatch(card(page(one, 'en', at('2026-11-17', '18:00'))), /venue-wn-shut/);
  // The setup: the events screen gets the happy hour screen's season-aware heads-up, in its own words.
  const s = CLIENT();
  assert.match(s, /return closedWarn\(e\.days, e\.sea\) \|\| \(key === 'nights' && T\.closedWarnNight && !nightAppt\(e\) \? closedWarnAny\(e\.days, e\.sea, T\.closedWarnNight\) : ''\);/);
  assert.match(s, /return fill\(tpl \|\| T\.closedWarnHappy, \{ days: daysInFull\(all\), when: when \}\);/);
  assert.match(text.en.closedWarnNight, /^Heads up: you’re closed on \{days\}\{when\}\. Your page says so beside it/);
  assert.match(text.fr.closedWarnNight.replace(/[  ]/g, ' '), /^Attention : vous êtes fermé le \{days\}\{when\}\. Votre page le dira à côté/);
});

// ====================== 9. The overlap message ======================
test('the "these dates overlap" message goes as soon as a date changes', () => {
  const s = CLIENT();
  assert.match(s, /S\.nudge = fill\(T\.seasonOverlap, \{ a: mdLabel\(list\[1 - S\.seaI\]\.from\), b: mdLabel\(list\[1 - S\.seaI\]\.to\) \}\); S\.overlapNudge = S\.nudge; return render\(\);/);
  assert.match(s, /if \(S\.overlapNudge && S\.nudge === S\.overlapNudge\) \{ S\.nudge = ''; S\.overlapNudge = ''; var oe = screen\.querySelector\('\.su-error'\); if \(oe && oe\.parentNode\) oe\.parentNode\.removeChild\(oe\); \}/);
});

// ====================== 10. Build My Trip ======================
test('Build My Trip: a weekday in a named month is planned on that month’s hours', async () => {
  const { v } = await mathieu({}, { name: 'Janvier Alehaus' });
  // The helper: the month's first such weekday, never before today; null without both.
  const now = at('2026-11-16');
  assert.equal(app.tripMonthWeekdayDate({ when: { weekday: 'saturday' }, month: 1 }, now), '2027-01-02');
  assert.equal(app.tripMonthWeekdayDate({ when: { weekday: 'monday' }, month: 5 }, now), '2027-05-03');
  assert.equal(app.tripMonthWeekdayDate({ when: { weekday: 'friday' }, month: 11 }, now), '2026-11-20', 'this month: from today on');
  assert.equal(app.tripMonthWeekdayDate({ when: { weekday: 'saturday' }, month: 11 }, at('2026-11-29')), '2027-11-06', 'none left this month: next year');
  assert.equal(app.tripMonthWeekdayDate({ when: { weekday: 'saturday' } }, now), null);
  assert.equal(app.tripMonthWeekdayDate({ month: 1 }, now), null);
  // January is outside both stretches: Saturday's hours are the usual ones (11:30–01:00), never the stretch's 15:00–22:00.
  const p = await plan('beers at a brewery in Kelowna on a Saturday in January');
  const rec = (p.recommendations || []).find((x) => x.venue && x.venue.id === v.id);
  assert.ok(rec, JSON.stringify((p.recommendations || []).map((x) => x.venue && x.venue.name)));
  assert.ok(rec.reasons.some((r) => (r.text || r) === 'Listed hours Saturday: 11:30–01:00'), JSON.stringify(rec.reasons));
  // A Monday in May is inside the spring stretch (closed Mondays): left out, and the note says why.
  const q = await plan('beers at Janvier Alehaus on a Monday in May');
  assert.ok(!(q.recommendations || []).some((x) => x.venue && x.venue.id === v.id) && !stopsOf(q).some((x) => x.venue && x.venue.id === v.id));
});

test('Build My Trip: a named brewpub with its own kitchen is the dinner or lunch itself; a brewery with no kitchen never is', async () => {
  const { v } = await mathieu({}, { name: 'Zephyrine Taphouse' });
  const rest = mk('restaurant', { name: 'Steps Test Kitchen', gluten_free: 1, kid_friendly: 1, vegetarian: 1, rating: 4.6, reviews: 900, price: '$$', cuisine: 'Canadian', hours: JSON.stringify(WK('11:00', '22:00')) });
  const dry = mk('brewery', { name: 'Dryhop Cellars', rating: 4.6, reviews: 500, gluten_free: 1, hours: JSON.stringify(WK('12:00', '22:00')) });
  const day = 'on a Saturday in January';
  for (const [q, meal] of [[`dinner with kids at 6 PM at Zephyrine Taphouse ${day}`, 'Dinner'], [`gluten-free dinner at Zephyrine Taphouse ${day}`, 'Dinner'], [`vegetarian dinner at Zephyrine Taphouse ${day}`, 'Dinner'], [`lunch at Zephyrine Taphouse ${day}`, 'Lunch']]) {
    const st = stopsOf(await plan(q));
    assert.deepEqual(st.map((x) => x.name), ['Zephyrine Taphouse'], q);
    assert.ok(st[0].reasons.includes(`${meal} at Zephyrine Taphouse (kitchen until 10 PM)`), `${q}: ${JSON.stringify(st[0].reasons)}`);
  }
  assert.equal(frCopy.t3FrenchText('Dinner at Zephyrine Taphouse (kitchen until 10 PM)'), 'Souper à Zephyrine Taphouse (cuisine jusqu’à 22 h)');
  // The same in French.
  const fr = stopsOf(await plan('souper avec enfants à 18 h à Zephyrine Taphouse un samedi de janvier'));
  assert.deepEqual(fr.map((x) => x.name), ['Zephyrine Taphouse']);
  // In the shoulder season the kitchen's own time is used (9 PM once he says so).
  ok(await change(tokenFor(v.id), { brewery_info: { kitchen: { mode: 'earlier', closes: '22:00', season: { from: '10-13', to: '11-26', closes: '21:00' }, season2: { from: '04-19', to: '05-29', closes: '21:00' } } } }));
  const may = stopsOf(await plan('dinner at Zephyrine Taphouse on a Saturday in May'));
  assert.ok(may[0].reasons.includes('Dinner at Zephyrine Taphouse (kitchen until 9 PM)'), JSON.stringify(may[0] && may[0].reasons));
  // A brewery with no kitchen answer is never the meal: lunch is somewhere that serves it, and the brewery is its own stop.
  const st = stopsOf(await plan(`lunch at Dryhop Cellars ${day}`));
  assert.equal(st.find((x) => x.label === 'Lunch').name, rest.name);
  assert.ok(st.some((x) => x.name === dry.name && x.label !== 'Lunch'));
  assert.ok(!st.some((x) => x.reasons.some((r) => /^(?:Lunch|Dinner) at Dryhop/.test(r))));
  // A named pub is the dinner too, unless it said "We don't serve food".
  const pub = mk('pub', { name: 'Quillon Alehouse', rating: 4.5, reviews: 700, hours: JSON.stringify(WK('11:00', '23:00')) });
  let ps = stopsOf(await plan(`dinner at Quillon Alehouse ${day}`));
  assert.deepEqual(ps.map((x) => x.name), ['Quillon Alehouse']);
  assert.ok(ps[0].reasons.includes('Dinner at Quillon Alehouse'), JSON.stringify(ps[0].reasons));
  ok(await change(tokenFor(pub.id), { pub_info: { kitchen: { mode: 'none' } } }));
  assert.equal(app.buildTripPlannerFacts(false, today).find((x) => x.id === pub.id).noFood, true);
  ps = stopsOf(await plan(`dinner at Quillon Alehouse ${day}`));
  assert.equal(ps.find((x) => x.label === 'Dinner').name, rest.name);
});

test('Build My Trip in French: « le lundi 3 mai à 17 h » keeps its date and time, « midi » is noon, and the chips read in French', () => {
  const tax = app.buildTripPlannerTaxonomy();
  const T = (q) => frTrip.tripPlannerText(q, tax, { frenchPage: true });
  assert.equal(T('le lundi 3 mai à 17 h, une microbrasserie à Kelowna'), 'the monday may 3 at 5:00 pm, a brewery in kelowna');
  assert.equal(T('une microbrasserie à Kelowna le 3 mai à 17 h'), 'a brewery in kelowna may 3 at 5:00 pm');
  assert.equal(T('le 1er juin, souper à Kelowna'), 'june 1, dinner in kelowna');
  assert.equal(T('dîner à midi à Kelowna samedi'), 'lunch at noon in kelowna saturday');
  assert.equal(T('une bière vers midi'), 'a beer around noon');
  // Left as they were: a range, the afternoon, a month alone.
  assert.equal(T('du 3 au 5 mai à Kelowna'), 'from 3 to 5 in may in kelowna');
  assert.equal(T('cet après-midi à Kelowna'), 'this afternoon in kelowna');
  assert.equal(T('un samedi de janvier'), 'a saturday of january');
  // The "what we understood" chips: a kind the planner names reads in French on the French page.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /if \(lang\(\) === 'fr' && Object\.prototype\.hasOwnProperty\.call\(FR_HEADING_NAMES, w\.toLowerCase\(\)\)\) w = FR_HEADING_NAMES\[w\.toLowerCase\(\)\];/);
  assert.equal(frCopy.FR_HEADING_NAMES['venues with happy hour'], 'lieux avec un 5 à 7');
  assert.equal(frCopy.t3FrenchText('Venues with happy hour and venues that are great for groups in Kelowna on Saturday.'), 'Lieux avec un 5 à 7 et lieux parfaits pour les groupes à Kelowna samedi.');
});

test('Build My Trip in French: the dated request is planned on that date and time', async () => {
  const { v } = await mathieu({ region: 'vernon' }, { name: 'Pivoine Taphouse' });
  // Monday May 3, 2027 is in the spring stretch (closed Mondays): not in the list. Wednesday May 5 at 4 PM: in.
  let p = await plan('le lundi 3 mai à 17 h, une microbrasserie à Vernon');
  assert.match(String(p.understood.when), /Mon, May 3 at 5 PM/);
  assert.ok(!(p.recommendations || []).some((x) => x.venue && x.venue.id === v.id));
  p = await plan('une microbrasserie à Vernon le mercredi 5 mai à 16 h');
  assert.match(String(p.understood.when), /Wed, May 5 at 4 PM/);
  assert.ok((p.recommendations || []).some((x) => x.venue && x.venue.id === v.id));
});

// ====================== 11. The small ones ======================
test('French brewery words: palette, cruchons, canettes géantes, « un endroit comme le vôtre », « 12 bières en fût »', () => {
  const b = text.fr.brewery;
  assert.equal(b.flightQ.replace(/[  ]/g, ' '), 'Combien coûte une palette de dégustation ?');
  assert.equal(b.noFlights, 'Nous n’offrons pas de palettes');
  assert.equal(b.labels.flights, 'Palettes et pour emporter');
  assert.equal(b.togo.growler, 'Remplissage de cruchons (growlers)'); assert.equal(b.togo.crowler, 'Remplissage de canettes géantes (crowlers)');
  assert.equal(b.offerLead, 'Les visiteurs s’en servent pour trouver un endroit comme le vôtre.');
  assert.match(JSON.stringify(b), /servons 12 bières en fût à l’avant/);
  assert.doesNotMatch(JSON.stringify(b), /plateau(?!x? de fromages)|12 fûts|une salle comme la vôtre/i);
  // "salle de dégustation" stays everywhere else.
  assert.equal(b.labels.taproom, 'Votre salle de dégustation');
  const lines = app.breweryVisitLines({ id: 0, type: 'brewery' }, { fee: 14, to_go: ['growler', 'crowler'] });
  assert.equal(lines.Flights.fr, '14 $ la palette.');
  assert.equal(lines['To go'].fr, 'Remplissage de cruchons (growlers) et remplissage de canettes géantes (crowlers) pour emporter.');
  assert.equal(app.breweryVisitLines({ id: 0, type: 'brewery' }, { fee: 0 }).Flights.fr, 'Palettes de dégustation gratuites.');
  assert.equal(app.breweryVisitLines({ id: 0, type: 'brewery' }, { no_flights: true }).Flights.fr, 'Pas de palettes de dégustation.');
});

test('French typography: a narrow no-break space before « ; », « nov. » once, « Lun–jeu, dim : »', async () => {
  assert.equal(text.frSpacing('Enfants jusqu’à 21 h; chiens sur la terrasse'), 'Enfants jusqu’à 21 h ; chiens sur la terrasse');
  assert.equal(text.frSpacing('A ; b'), 'A ; b'); assert.equal(text.frSpacing('Tom &amp; Jerry; fin'), 'Tom &amp; Jerry ; fin');
  let bad = 0; (function walk(o) { for (const k of Object.keys(o)) { if (typeof o[k] === 'string') { if (/[^\s ;];(\s|$)/.test(o[k])) bad++; } else if (o[k] && typeof o[k] === 'object') walk(o[k]); } })(text.fr);
  assert.equal(bad, 0, 'no unspaced semicolon in the French setup words');
  // The edit page's line about the second stretch.
  const { t } = await mathieu();
  const html = (await get(`/fr/owner/${t}`)).text;
  const m = /id="opSeasonalSecond">([\s\S]*?)<\/p>/.exec(html);
  assert.ok(m, 'the second-stretch line is there');
  assert.match(plain(m[1]), /du 19 avr\. au 29 mai\. Elles restent comme elles sont ; pour les changer/);
  assert.doesNotMatch(m[1], /\.\./);
  // The happy hour day prefix in French.
  const s = CLIENT();
  const fn = (name) => { const i = s.indexOf(`function ${name}(`); let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
  const names = { fr: { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' }, en: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' } };
  const lib = (lang) => new Function('DAYS', 'dayName', 'T', `${fn('dayPrefix')}\n${fn('rangePrefix')}\n${fn('oldPrefix')}\n${fn('prefixOf')}\nreturn { dayPrefix, prefixOf };`)(DAYS, (d) => names[lang][d], text[lang]);
  const e = { days: { mon: true, tue: true, wed: true, thu: true, sun: true } };
  assert.equal(lib('fr').dayPrefix(e), 'Lun–jeu, dim : ');
  assert.equal(lib('en').dayPrefix(e), 'Mon–Thu, Sun: ');
  // What was saved before is still recognised as the days.
  assert.equal(lib('fr').prefixOf(e, 'Lun–Jeu, Dim: Pichets à 20 $'), 'Lun–Jeu, Dim: ');
  assert.equal(lib('fr').prefixOf(e, 'Lun–jeu, dim : Pichets à 20 $'), 'Lun–jeu, dim : ');
});

test('setup small ones: the kids pre-pick note, "Saturday" beside Sat–Sun, 11 PM, "Until close" pressed, the happy hour count, Instagram alone, the tap list in view', async () => {
  const s = CLIENT();
  // Kids: the same "we picked this" note as the other pre-picks, for a brewery and a pub.
  const fresh = mk('brewery', { kid_friendly: 1 }); research(fresh.id, RESEARCH);
  assert.equal((await setupCfg(tokenFor(fresh.id))).suggestKidsUntil, '21:00');
  assert.match(s, /S\.kidsGuessed && S\.minors\.policy === S\.kidsGuessed && T\.kidsGuess && \(S\.kidsGuessed !== 'minors_until' \|\| S\.minors\.until === C\.suggestKidsUntil\) \? '<p class="su-sent su-research" id="suKidsGuess">'/);
  assert.match(text.en.kidsGuess, /^We picked this from what’s on your page\./); assert.match(text.fr.kidsGuess, /^Nous l’avons choisi d’après ce qui est sur votre page\./);
  // Copy chips and close times.
  assert.match(s, /\(d === 'fri' && T\.copySat && copyGets\('fri', 'sat'\) \? '<button type="button" class="su-toggle" data-copysat="fri">'/);
  assert.match(s, /querySelectorAll\('\[data-copysat\]'\)[\s\S]{0,200}wk\.sat = clone\(src\);/);
  assert.equal(text.en.copySat, 'Saturday'); assert.equal(text.fr.copySat, 'Samedi');
  assert.match(s, /BQ_CLOSE = \['18:00', '20:00', '21:00', '22:00', '23:00'\]/);
  // "Until close" pressed is not the warning colour.
  assert.match(s, /class="su-toggle su-okon" aria-pressed="' \+ \(e\.close \? 'true' : 'false'\) \+ '" data-act="hhClose:/);
  assert.match(s, /class="su-toggle su-okon" aria-pressed="' \+ \(e\.endClose \? 'true' : 'false'\) \+ '" data-act="spClose:/);
  assert.match(SERVER(), /body\.owner-setup \.su-toggle\.su-okon\[aria-pressed="true"\] \{ background: var\(--su-teal\); color: #fff; border-color: var\(--su-teal\); \}/);
  // The happy hour count says why there is less room with a second one.
  const fn = (name) => { const i = s.indexOf(`function ${name}(`); let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
  const room = (happy) => new Function('S', 'T', 'DAYS', 'dayName', 'fill', `${fn('dayPrefix')}\n${fn('rangePrefix')}\n${fn('hhRoom')}\n${fn('roomText')}\nreturn roomText;`)({ happy }, text.en, DAYS, (d) => d.charAt(0).toUpperCase() + d.slice(1), fill);
  const one = { days: { mon: true, tue: true, wed: true, thu: true, sun: true }, what: '' };
  assert.equal(room([one])(0, '$2 off pints'), '48 characters left');
  assert.equal(room([one, { days: { fri: true, sat: true }, what: '' }])(0, '$2 off pints'), '34 characters left (the days, “Mon–Thu, Sun”, go in front on your page)');
  assert.match(text.fr.roomDays, /les jours, « \{days\} », s’ajoutent devant sur votre page/);
  // Instagram alone answers the one Instagram and Facebook screen on the last screen.
  assert.match(s, /function socialGiven\(\)\{ return !!\(CUR\.instagram_url \|\| CUR\.facebook_url \|\| fbKnown\(\)\); \}/);
  assert.match(s, /if \(COMBO && \(it\.k === 'instagram' \|\| it\.k === 'facebook'\)\) \{ if \(socialGiven\(\)\) return; st = 'social'; lab = T\.labels\.social; \}/);
  // "Add your tap list" stays in view on "I'm done for now" (it was inside the fold).
  assert.match(s, /\(left\.some\(tapItem\) \? '<div class="su-stack" id="suTapOpen">' \+ left\.filter\(tapItem\)\.map\(leftItem\)\.join\(''\) \+ '<\/div>' : ''\)/);
  assert.match(s, /function tapItem\(o\)\{ return !!o && o\.step === 'menu' && tapOnly\(\); \}/);
});

test('venue page: "Tap list" on the section tab for a brewery with no kitchen; "Weekly events" over a 5 PM release, « Événements réguliers » in French', async () => {
  // No kitchen, with a link to the tap list: the tab, the button and the card all say Tap list.
  const v = mk('brewery', { name: 'Tab Test Brewing' }); const t = tokenFor(v.id);
  ok(await change(t, { place_type: 'Brewery', brewery_info: { food: 'snacks' } }));
  ok(await change(t, { menu_url: 'https://example.com/taps' })); approveLink(v.id);
  const html = page(v);
  assert.match(html, /href="#fdMenu"[^>]*>(?:<[^>]+>)*\s*Tap list/);
  assert.doesNotMatch(html.replace(/<style[\s\S]*?<\/style>/g, ''), /href="#fdMenu"[^>]*>Menu</);
  // With its own kitchen the tab says Menu, as before.
  const k = await mathieu(); ok(await change(k.t, { menu_url: 'https://example.com/menu' })); approveLink(k.v.id);
  assert.match(page(k.v).replace(/<style[\s\S]*?<\/style>/g, ''), /href="#fdMenu"[^>]*>Menu</);
  // The heading: a 5 PM release on the first Thursday is not a "night".
  const jan = at('2027-01-15', '12:00');
  ok(await change(k.t, { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', title_fr: 'Quiz', start: '19:30' }, { days: ['thu'], kind: 'other', title: 'Beer release', title_fr: 'Lancement de bière', start: '17:00', frequency: 'monthly-1st' }, { days: ['fri', 'sat'], kind: 'live_music', title: 'Live music', start: '21:00' }] }));
  assert.match(page(k.v, 'en', jan), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.match(page(k.v, 'fr', jan), /<h2 id="venueNightsTitle">Événements réguliers<\/h2>/);
  // Evening-only lists keep "Weekly nights" / « Soirées de la semaine », even with one every other week.
  ok(await change(k.t, { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:30' }, { days: ['wed'], kind: 'bingo', title: 'Bingo', start: '18:00', frequency: 'biweekly' }] }));
  assert.match(page(k.v, 'en', jan), /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
  assert.match(page(k.v, 'fr', jan), /<h2 id="venueNightsTitle">Soirées de la semaine<\/h2>/);
  // A weekly 5 PM event alone: "Weekly events" / « Événements de la semaine ».
  ok(await change(k.t, { weekly_nights: [{ days: ['thu'], kind: 'other', title: 'Cask night', start: '17:00' }] }));
  assert.match(page(k.v, 'en', jan), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.match(page(k.v, 'fr', jan), /<h2 id="venueNightsTitle">Événements de la semaine<\/h2>/);
});

test('French category pages and related cards read in French (no new pages)', async () => {
  const { v } = await mathieu();
  mk('restaurant', { name: 'Voisin Test Kitchen' }); mk('pub', { name: 'Voisin Test Pub' });
  const list = (await get('/fr/kelowna/breweries')).text;
  assert.match(list, /<title>Brasseries à Kelowna \(C\.-B\.\) \| Okanagan Roam<\/title>/);
  assert.match(list, /<meta name="description" content="\d+ brasseries? vérifiées? à Kelowna/);
  db.prepare('UPDATE venues SET description_fr = ? WHERE id = ?').run('On brasse nos bières ici même, au cœur du village, depuis 2014. Seize lignes de fût, une cuisine complète et une terrasse chauffée ouverte toute l’année. Venez pour l’après-ski, restez pour la musique.', v.id);
  const fr = (await get(`/fr/kelowna/breweries/${app.getVenue(v.id).slug}`)).text;
  const kinds = [...fr.matchAll(/<span class="nearby-type">([^<·]+) ·/g)].map((m) => m[1].trim());
  assert.ok(kinds.length > 0, 'nearby cards are there');
  for (const k of kinds) assert.ok(['Restaurant', 'Pub', 'Brasserie', 'Café', 'Bar à cocktails', 'Distillerie', 'Vignoble'].includes(k), k);
});
