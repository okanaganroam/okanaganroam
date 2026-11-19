// Whistler tour test 9 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour9-2026-11-18/REPORT.md: Tanis,
// an Indigenous-owned cultural tour business near Mount Currie and Pemberton, Android 390 wide; a cultural walk by
// booking, a summer-only canoe, school programs priced per group, a winter snowshoe storytelling walk; yearly breaks in
// April and November). On Okanagan fixtures (Penticton, with Naramata next door). The Help questions are in
// tour-help-routing.test.js.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t9-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const tr = require('../trip-requirements.js');
const SITE = require('../trip-site.js');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T9 ${++n}`, slug: `tour-t9-${n}`, region: 'penticton', type, latitude: 49.49 + n / 3000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Penticton`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 9 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.59.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const boxOf = (id) => JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id).info);
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(id, JSON.stringify({ sections }));
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };

// Tanis's listing, moved to Penticton: research partly wrong on purpose ("native war canoe", "tribal culture", "Drinks at the bar").
function tanis(o = {}) {
  const v = mk('tour', { name: `Skaha Cultural Walks ${n + 1}`, cuisine: '', description: 'Epic adventure with a native war canoe and tribal culture shows. Adrenaline for the whole family!',
    description_fr: 'Aventure épique en canot de guerre et spectacles de culture tribale.', rating: 4.9, reviews: 211, ...o });
  setBox(v.id, { rows: [{ label: 'Known for', text: 'Adrenaline canoe adventures and native culture shows' }, { label: 'Good to know', text: 'Bring a swimsuit. Drinks at the bar after the show.' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  return { v, t: tokenFor(v.id) };
}

test('0. a request during her yearly break plans the day she reopens (no date asked; tour test 18), and a named request says when she reopens', async () => {
  const v = mk('tour', { name: 'Osoyoos Story Walks Words', region: 'osoyoos', latitude: 49.03, longitude: -119.46, address: '1 Main St, Osoyoos', cuisine: '', rating: 4.9, reviews: 211 });
  ok(await change(tokenFor(v.id), { tour_info: { kinds: ['cultural'], length: '2-3h', year: 'all' }, closures: [{ from: '04-01', to: '04-30', yearly: true }, { from: '11-01', to: '11-30', yearly: true }] }));
  const now = new Date('2026-11-18T12:00:00-08:00');
  const kind = app.runTripPlan({ text: 'cultural tour in Osoyoos' }, now);
  // Tour test 18 (2026-11-18): an undated request during her yearly break is planned for the day she reopens, with a note
  // (it said "matches but is closed on November 18. It reopens December 1." and planned nothing).
  assert.ok(itemsOf(kind).some((x) => x.venue.id === v.id) && kind.comingSeason && kind.comingSeason.date === '2026-12-01', JSON.stringify([kind.kind, kind.warnings, kind.notes, itemsOf(kind).map((x) => x.venue.name)]));
  assert.equal(kind.notes[0], 'This tour is closed on November 18, so this plan is for December 1, when it reopens. Pick your own dates any time.');
  const named = app.runTripPlan({ text: 'Osoyoos Story Walks Words' }, now);
  assert.ok((named.warnings || []).some((w) => /opens again on December 1|reopens December 1/.test(w) && w.includes(v.name)), JSON.stringify(named.warnings));
  assert.match(require('../trip-french-copy.js').t3FrenchText(`${v.name} matches but is closed on November 18. It reopens December 1. Ask again with another date to plan it.`), /Réouverture le 1er décembre/);
});

test('1. the cultural kind: in the list (EN + FR), Culture filter, planner words; page words say Indigenous only when her words do; walking no longer reads "indigenous cultur" as history', async () => {
  assert.ok(completeness.TOUR_KINDS.includes('cultural'));
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.cultural, ['Indigenous and cultural tours', 'Visites autochtones et culturelles']);
  assert.equal(app.TOUR_KIND_ACTIVITY.cultural, 'culture');
  assert.equal(app.tourKindsText(['cultural'], false, '', 'Indigenous-owned walks with Elders’ storytelling.'), 'Indigenous cultural tours');
  assert.equal(app.tourKindsText(['cultural'], true, '', 'Indigenous-owned walks with Elders’ storytelling.'), 'Visites culturelles autochtones');
  assert.equal(app.tourKindsText(['cultural'], false, '', 'Heritage walks through the old town.'), 'Cultural tours');
  assert.equal(app.tourKindsText(['cultural'], true, '', ''), 'Visites culturelles');
  // Never from research's "native" or "tribal".
  assert.equal(app.tourKindsText(['cultural'], false, '', 'Native war canoe and tribal culture shows.'), 'Cultural tours');
  assert.ok(!app.TOUR_KIND_PUBLIC.walking.sides.some(([re]) => re.test('indigenous cultural walks')));
  assert.equal(app.tourKindSuggestion({ cuisine: 'Indigenous cultural tours', name: '' })[0], 'cultural');
  // The setup's chip, saved: the card words and the filter.
  const { v, t } = tanis();
  const en = cfgOf((await get(`/owner/${t}/setup`)).text), fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.ok(en.tourKinds.some((x) => x.k === 'cultural' && x.t === 'Indigenous and cultural tours'));
  assert.ok(fr.tourKinds.some((x) => x.k === 'cultural' && x.t === 'Visites autochtones et culturelles'));
  ok(await change(t, { tour_info: { kinds: ['cultural'], length: '2-3h', year: 'all' } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Cultural tours');
  assert.equal(app.tourInActivity(app.getVenue(v.id), 'culture'), true);
  // Build My Trip reads the kind (and an indoor cultural centre that says Indigenous).
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'x', description: '', cuisine: '', tourKinds: ['cultural'] }).includes('cultural_tour'));
  assert.ok(tr.inferPlannerKinds({ type: 'indoor', name: 'Lil’wat Cultural Centre', description: 'A First Nations cultural centre.', cuisine: 'Museum' }).includes('cultural_tour'));
  for (const q of ['indigenous cultural tour', 'a cultural tour', 'first nations experience', 'school field trip to learn about indigenous culture', 'storytelling walk']) assert.ok(tr.KINDS.cultural_tour.test(q), q);
  assert.ok(!tr.KINDS.cultural_tour.test('agricultural tours'));
});

test('1b. a kind with several sides says only the side her words name, from her story or Known for when the category names none', async () => {
  // Her research category named none of them; her story names snowshoeing and the canoe.
  const words = app.tourKindsText(['cultural', 'snowshoe', 'paddle'], false, '', 'Indigenous-owned. Cultural walks, a summer canoe, and a snowshoe storytelling walk on winter weekends.');
  assert.match(words, /Indigenous cultural tours/); assert.match(words, /snowshoeing/i); assert.match(words, /canoeing/i);
  assert.doesNotMatch(words, /ski touring|snowcat|kayak/i);
  // Neither names any side: the kind's whole words, as before.
  assert.equal(app.tourKindsText(['paddle'], false, '', 'Guided trips with a local guide.'), 'Kayak, canoe & SUP');
  // Her Known for line counts too (once live): the category words follow it.
  const { v, t } = tanis({ description: 'Guided trips with a local guide.' });
  ok(await change(t, { tour_info: { kinds: ['snowshoe'], length: '2-3h', year: 'all' } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Snowshoe & ski touring');
  ok(await change(t, { visit_rows: { known_for: 'A snowshoe storytelling walk on winter weekends' } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Snowshoeing');
});

test('2. no "Verified by the business" while research’s description shows and her rewrite waits; a Known for save sends only that line', async () => {
  const { v, t } = tanis();
  // An instant save (Known for) makes the listing hers; research's Good to know is not re-sent with it.
  ok(await change(t, { visit_rows: { known_for: 'Cultural walks with Elders' } }));
  const row = db.prepare("SELECT changes FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC LIMIT 1").get(v.id);
  assert.deepEqual(JSON.parse(row.changes).visit_rows, { known_for: 'Cultural walks with Elders' });
  const box = boxOf(v.id);
  assert.deepEqual(box.owner_labels, ['Known for']);
  assert.ok(box.rows.some((r) => r.label === 'Good to know' && /Drinks at the bar/.test(r.text)), 'research’s line stays research’s');
  assert.match(plain(page(v)), /Verified by the business/);
  // Her story waits for our check: no pill while research's story is the one on the page.
  ok(await change(t, { description: 'Indigenous-owned cultural walks and a summer canoe, guided by members of our Nation. Elders share stories on the land.' }));
  assert.doesNotMatch(plain(page(v)), /Verified by the business/);
  assert.doesNotMatch(plain(page(v, 'fr')), /Vérifié par l’entreprise/);
  // The Undo of the Known for line puts back only that line.
  const live = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC LIMIT 1").get(v.id);
  const u = app.undoOwnerInstantChange(live.id, 'test');
  assert.ok(u && u.ok !== false, JSON.stringify(u));
  const after = boxOf(v.id);
  assert.ok(after.rows.some((r) => r.label === 'Known for' && /Adrenaline/.test(r.text)));
  assert.ok(after.rows.some((r) => r.label === 'Good to know' && /Drinks at the bar/.test(r.text)));
});

test('3. the French description link opens the French story box without saving French as her language; the French screen has an English lead', async () => {
  // The setup's link and the edit page's: no okanaganLang = fr.
  assert.match(clientFn('frDescOld'), /id="suFrDescGo" lang="fr" href="' \+ h\(href\) \+ '">/);
  assert.doesNotMatch(clientFn('frDescOld'), /localStorage/);
  assert.doesNotMatch(SERVER, /#story" lang="fr" onclick=/);
  const lead = clientFn('frDescEnLead');
  assert.match(lead, /C\.lang !== 'fr'/); assert.doesNotMatch(lead, /localStorage/);
  assert.equal(text.en.frDescEnLead, 'Not a French speaker? Paste your English story, or tap Leave it to us.'); assert.equal(text.en.frDescLeave, 'Leave it to us');
  assert.match(CLIENT, /q\(T\.storyQ, T\.storyLead\) \+ frDescOld\(\) \+ frDescEnLead\(\)/);
  const { v, t } = tanis();
  ok(await change(t, { description: 'Indigenous-owned cultural walks and a summer canoe, guided by members of our Nation. Elders share stories on the land.' }));
  const frCfg = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(frCfg.frDescFr, 'old'); assert.deepEqual(frCfg.frDescEn, { lead: text.en.frDescEnLead, leave: 'Leave it to us' });
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).frDescFr, '');
  // Run in a page: the line and its link back to the English setup.
  const ctx = { C: { lang: 'fr', frDescFr: 'old', frDescEn: frCfg.frDescEn }, T: text.fr, location: { pathname: `/fr/owner/${t}/setup` }, h: (x) => String(x) }; vm.createContext(ctx); vm.runInContext(lead, ctx);
  const html = vm.runInContext('frDescEnLead()', ctx);
  assert.match(html, /lang="en"/); assert.match(html, new RegExp(`href="/owner/${t}/setup"`)); assert.match(html, /Leave it to us/);
  void v;
});

test('4. Build My Trip: a summer-only canoe is not planned in January (her list’s Summer section), but is in July; the cultural walk still is', async () => {
  const { v, t } = tanis({ name: 'Skaha Cultural Canoe Words' });
  ok(await change(t, { tour_info: { kinds: ['cultural', 'paddle', 'snowshoe'], length: '2-3h', year: 'all' } }));
  publish(v.id, [{ name: 'All year', items: [{ name: 'Cultural walk', description: '$65 per person' }] }, { name: 'Summer (June–September)', items: [{ name: 'Canoe paddle', description: '$95 per person' }] },
    { name: 'Winter', items: [{ name: 'Snowshoe storytelling walk', description: '$75 per person, weekends' }] }]);
  assert.deepEqual(app.tourPlannerFacts(v.id).tourWaterMonths, [6, 7, 8, 9]);
  const jan = itemsOf(await plan('Canoe trip in Penticton on January 16')).map((x) => x.venue.id);
  assert.ok(!jan.includes(v.id), 'not in January');
  const jul = itemsOf(await plan('Canoe tour in Penticton on July 15')).map((x) => x.venue.id);
  assert.ok(jul.includes(v.id), 'in July');
  const walk = itemsOf(await plan('Indigenous cultural tour in Penticton on January 16')).map((x) => x.venue.id);
  assert.ok(walk.includes(v.id), 'the cultural walk in January');
  // No list: a company whose other kinds run in winter isn't planned for a paddle in January (a paddle-only one keeps the
  // summer-only rule it already had).
  const mixed = mk('tour', { name: 'Skaha Snow And Kayak Words', cuisine: '', rating: 4.9, reviews: 300 });
  ok(await change(tokenFor(mixed.id), { tour_info: { kinds: ['snowshoe', 'paddle'], length: '2-3h', year: 'all' } }));
  const k = itemsOf(await plan('guided kayak tour in Penticton on January 20')).map((x) => x.venue.id);
  assert.ok(!k.includes(mixed.id));
  assert.ok(itemsOf(await plan('guided kayak tour in Penticton on July 20')).some((x) => x.venue.id === mixed.id));
  // The month words read in English and French.
  assert.deepEqual(app.tourTextMonths('Canoe (June to September)'), [6, 7, 8, 9]); assert.deepEqual(app.tourTextMonths('Été'), [6, 7, 8, 9]);
  assert.deepEqual(app.tourTextMonths('de juin à septembre'), [6, 7, 8, 9]); assert.equal(app.tourTextMonths('Cultural walk'), null);
});

test('5. "near <town>" takes in the towns right next to it (EN + FR), from the site’s own list', async () => {
  assert.ok((SITE.nearTowns.penticton || []).includes('naramata'));
  const v = mk('tour', { name: 'Naramata First Nations Walks Words', region: 'naramata', address: '1 Robinson Ave, Naramata', cuisine: '', rating: 4.9, reviews: 300 });
  ok(await change(tokenFor(v.id), { tour_info: { kinds: ['cultural'], length: '2-3h', year: 'all' } }));
  for (const q of ['Indigenous cultural tour near Penticton on July 10', 'Visite culturelle autochtone près de Penticton le 10 juillet']) {
    const p = await plan(q);
    assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), `${q}: ${JSON.stringify(itemsOf(p).map((x) => x.venue.name))}`);
  }
  assert.match(require('../trip-french-copy.js').t3FrenchText('This includes Naramata, right next to Penticton.'), /Ce plan inclut aussi Naramata, tout près de Penticton/);
});

test('6. a named request plans that business (a name with a note in brackets too); a school trip about Indigenous culture finds the cultural tour', async () => {
  const v = mk('tour', { name: 'Owl Creek Cultural Tours (test)', cuisine: '', rating: 4.9, reviews: 211 });
  ok(await change(tokenFor(v.id), { tour_info: { kinds: ['cultural'], length: '2-3h', year: 'all' } }));
  setBox(v.id, { rows: [{ label: 'Groups', text: 'School programs for up to 35, priced per group.' }], booking_url: null, source_url: null, checked_at: '2026-11-18', owner_labels: ['Groups'] });
  mk('outdoor', { name: 'Owl Creek Recreation Site', cuisine: 'Campground', description: 'A forest campsite by Owl Creek.', activities: ['camping', 'hiking'], rating: 4.6, reviews: 80 });
  const named = itemsOf(await plan('Owl Creek Cultural Tours on January 16'));
  assert.equal(named[0] && named[0].venue.id, v.id, JSON.stringify(named.map((x) => x.venue.name)));
  const school = itemsOf(await plan('School field trip to learn about Indigenous culture for 30 students in Penticton on May 20'));
  assert.ok(school.some((x) => x.venue.id === v.id), JSON.stringify(school.map((x) => x.venue.name)));
});

test('7. "Other tours" on her page come from her own kinds first', async () => {
  const me = mk('tour', { name: 'Kind First Walks Words', cuisine: '' });
  ok(await change(tokenFor(me.id), { tour_info: { kinds: ['cultural'], year: 'all' } }));
  const heli = mk('tour', { name: 'Kind First Heli Words', cuisine: 'Heli-skiing', rating: 5, reviews: 2000 });
  const other = mk('tour', { name: 'Kind First Culture Words', cuisine: '', rating: 4.2, reviews: 20 });
  ok(await change(tokenFor(other.id), { tour_info: { kinds: ['cultural', 'walking'], year: 'all' } }));
  const rel = app.getRelatedVenues(app.getVenue(me.id), 20).map((x) => x.id);
  assert.ok(rel.indexOf(other.id) >= 0 && rel.indexOf(other.id) < rel.indexOf(heli.id), JSON.stringify(rel));
});

test('8. setup: group size "21+ or whole classes" and ". " after a size; Type them in myself; per-canoe and per-class prices; holidays; closures; season line; photo lead', async () => {
  // Groups: an option of the same question, and her words start a new sentence after the chip.
  assert.equal(text.en.tour.groupsChipBig, '21+ or whole classes'); assert.equal(text.fr.tour.groupsChipBig, '21+ ou classes entières');
  assert.match(text.en.tour.groupsLineBig, /^Groups of 21 or more, like whole classes/); assert.match(text.en.tour.groupsLineBigBooked, /^Groups of 21 or more/);
  assert.match(CLIENT, /\[4\]\.concat\(GROUP_SIZES, T\.groupsChipBig \? \[21\] : \[\]\)/);
  assert.match(CLIENT, /concat\(\[groupsSizeLine\(\+b\.getAttribute\('data-bgroup'\)\)\]\)\.join\('\. '\) \+ '\. '/);
  // Typed tours on the setup's screen: the edit page's own editor, opened on typing.
  assert.equal(text.en.tour.menuType, 'Type them in myself'); assert.equal(text.fr.tour.menuType, 'Je les tape moi-même');
  assert.match(CLIENT, /id="suMenuType" href="' \+ h\(location\.pathname\.replace\(\/\\\/setup\\\/\?\$\/, '\/menu'\) \+ '\?from=setup#type'\)/);
  assert.match(SERVER, /if \(location\.hash === '#type'\) \{ var tyb = app\.querySelector\('\[data-act="type"\]'\); if \(tyb\) tyb\.click\(\); \}/);
  // Prices: per canoe, kayak or raft gets the per-vehicle words; per class or school is a group (Private tours).
  for (const x of ['190 per canoe (up to 3 people)', '$45 per kayak', '950 per raft']) { assert.equal(app.tourPriceWhy(x), 'unit', x); assert.match(app.cleanTourPrice(x, true, false).error, /Priced per sled, boat or vehicle\?/, x); }
  for (const x of ['400 per class', '400 for the whole class', '400 per school group']) assert.equal(app.tourPriceWhy(x), 'group', x);
  // The setup's own copy of the rule says the same.
  assert.match(clientFn('tourPriceWhy'), /canots\?\|rafts\?\|radeaux\?\|boards\?/); assert.match(clientFn('tourPriceWhy'), /\|class\(\?:es\)\?\|classes\?\|schools\?\|\[ée\]coles\?\)/);
  // Tour test 15: boats and boards too.
  assert.match(CLIENT, /voiturettes\?\|kayaks\?\|canoes\?\|canots\?\|rafts\?\|radeaux\?\|boats\?\|bateaux\?\|boards\?\|planches\?\|sups\?\)\\b\/i\.test\(el\('suTprice'\)/);
  // Holidays: the official name, and National Indigenous Peoples Day on June 21 (every type).
  assert.equal(text.en.holidays.truth, 'National Day for Truth and Reconciliation'); assert.equal(text.fr.holidays.truth, 'Journée nationale de la vérité et de la réconciliation');
  assert.equal(text.en.holidays.indigenous, 'National Indigenous Peoples Day'); assert.equal(text.fr.holidays.indigenous, 'Journée nationale des peuples autochtones');
  assert.match(CLIENT, /make\('indigenous', function\(yy\)\{ return new Date\(yy, 5, 21\); \}\)/);
  // Closures: the date box starts tomorrow; each ✕ names its dates.
  assert.match(clientFn('nextMonth'), /d\.getDate\(\) \+ 1/);
  assert.equal(text.en.closeRemove, 'Remove {x}'); assert.match(CLIENT, /fill\(T\.closeRemove, \{ x: closureLabel\(c\) \}\)/);
  // The Season line names her yearly breaks.
  const { v, t } = tanis();
  ok(await change(t, { tour_info: { kinds: ['cultural'], length: '2-3h', year: 'all' } }));
  ok(await change(t, { closures: [{ from: '04-01', to: '04-30', note: 'Spring break', yearly: true }, { from: '11-01', to: '11-30', note: 'Fall break', yearly: true }, { from: '12-25', to: '12-25', yearly: true }] }));
  assert.deepEqual(app.tourYearlyBreaksText(v.id), { en: 'April and November', fr: 'en avril et en novembre' });
  const box = boxOf(v.id);
  assert.ok(box.rows.some((r) => r.label === 'Season' && r.text === 'All year except April and November.'), JSON.stringify(box.rows));
  // The photo lead for a cultural tour.
  assert.match(text.en.tour.photosLeadCultural, /^Your guides, the places you share/); assert.match(clientFn('photosHint'), /T\.photosLeadCultural/);
});

test('9. keyboard: a chip keeps the focus after the screen redraws; the 3-kind limit is said aloud; groups are labelled by their question; Help keeps Tab inside; Save stays in view', async () => {
  assert.match(CLIENT, /function focusKey\(\)\{/);
  assert.match(CLIENT, /var keepSel = focusKey\(\), keepNudge = S\.keepNudgeFocus;/);
  assert.match(CLIENT, /else if \(keepSel\) \{ var kf = null; try \{ kf = screen\.querySelector\(keepSel\); \}/);
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 12).
  assert.match(CLIENT, /srLive\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(CLIENT, /function q\(title, lead\)\{ return '<h1 id="suQ">'/);
  assert.match(CLIENT, /role="group" aria-labelledby="suQ" id="suTourKinds"/);
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 11).
  // Tour test 10 (2026-11-18): with 8+ and 10+.
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 11).
  assert.match(CLIENT, /\.su-closures-save'\); if \(csave\) csave\.addEventListener\('focusin'/);
  // Help: Tab and Shift+Tab stay inside the open dialog.
  assert.match(SERVER, /if \(e\.key !== 'Tab' \|\| panel\.hidden\) return;/);
  // The focus key: an id, else the first data-* attribute (run in a page-like context).
  const ctx = { S: { renderedStep: 'tour', step: 'tour' }, screen: { contains: () => true }, document: {} }; vm.createContext(ctx);
  vm.runInContext(clientFn('focusKey'), ctx);
  ctx.document.activeElement = { id: '', attributes: [{ name: 'class', value: 'su-chip' }, { name: 'data-tpick', value: 'age:6' }] };
  assert.equal(vm.runInContext('focusKey()', ctx), '[data-tpick="age:6"]');
  ctx.S.step = 'price';
  assert.equal(vm.runInContext('focusKey()', ctx), '');
});

test('10. other setup types still load', async () => {
  for (const type of ['restaurant', 'cafe', 'pub', 'winery', 'brewery', 'cocktail']) {
    const v = mk(type, { cuisine: type === 'restaurant' ? 'Italian' : '' });
    const r = await get(`/owner/${tokenFor(v.id)}/setup`);
    assert.equal(r.status, 200, type);
    assert.ok(cfgOf(r.text), type);
  }
});
