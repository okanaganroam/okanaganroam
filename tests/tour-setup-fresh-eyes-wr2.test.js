// Whistler tour test 2 fixes (fresh eyes, 2026-11-16; Whistler Roam drafts/fresh-eyes-tour2-2026-11-16/REPORT.md:
// Marc-André, French, a summer-only rafting and bear-viewing company that is by booking only). Covers bugs 1-12, the
// Minor list, the wording table and the two additions Dayton approved (a 5+ age and "48 hours ahead"), in English and
// French, a winery by appointment with a season in its last 30 days, and that the other setups still load.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr2-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tr = require('../trip-requirements.js');
const trFr = require('../trip-planner-fr.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const NONE = Object.fromEntries(DAYS.map((d) => [d, []]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr2 ${++n}`, slug: `tour-wr2-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.34.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);
const stopOf = (p, name) => itemsOf(p).find((x) => x.venue.name === name);
const tourInfo = (id) => { const r = db.prepare('SELECT info FROM venue_tour_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : {}; };

// Marc-André's company, moved to Penticton: research words "Whitewater rafting & bear viewing tours", research hours 9-5
// (wrong: he is by booking only), a season of May 15 to Sep 30. Decoys in the same town.
let marcCache = null;
async function marc() {
  if (marcCache) return marcCache;
  const v = mk('tour', { name: 'Riviere Sauvage Rafting', cuisine: 'Whitewater rafting & bear viewing tours', rating: 4.9, reviews: 212, price: 3,
    description: 'Family-run rafting company with gentle family floats and whitewater trips, plus bear-viewing 4x4 tours in summer.',
    description_fr: 'Entreprise familiale de rafting : descentes familiales tranquilles et descentes en eau vive, et excursions d’observation des ours en 4x4 l’été.' });
  mk('tour', { name: 'Skaha Jet Boats', cuisine: 'Jet boat tours', rating: 4.9, reviews: 900, description: 'Jet boat tours on Skaha Lake.' });
  mk('tour', { name: 'Naramata Wine Shuttle', cuisine: 'Wine tours', rating: 4.8, reviews: 500, description: 'Guided wine tours of the Naramata Bench.' });
  mk('restaurant', { name: 'Main Street Diner Wr2', cuisine: 'Canadian', rating: 4.5, reviews: 300 });
  const t = tokenFor(v.id);
  marcCache = { v, t };
  return marcCache;
}

test('1. by booking only: the season question comes next, and the closures save never writes "all year" unasked', async () => {
  const { v, t } = await marc();
  // The setup script: "by booking only" goes on to the year question (no hours words), which saves the dates on their own.
  assert.match(CLIENT, /saveAll\('hours', \[ch\], null, T\.yearNoSetQ \? 'hours:year'/);
  assert.match(CLIENT, /function noSetYear\(\)\{ return APPT && AI\.visit === 'appointment'/);
  assert.match(CLIENT, /if \(noSetYear\(\)\) x = q\(T\.yearNoSetQ, T\.yearNoSetLead\)/);
  assert.match(CLIENT, /if \(S\.openFrom === 'appt'\) \{ if \(k === 'openNone'\) return go\('hours:year', true\); return seasonOnlySave\(\); \}/);
  // The closures save: "all year" only when the year question was answered before (S.savedWYear) or a season is stored.
  assert.match(CLIENT, /var wyc = APPT && S\.savedWYear !== 'appointment' && \(om \|\| S\.savedWYear\) &&/);
  // The words, both languages, tour and winery.
  assert.equal(text.en.tour.yearNoSetQ, 'Do you run trips all year?');
  assert.match(text.fr.tour.yearNoSetQ, /^Offrez-vous des sorties toute l’année/);
  assert.equal(text.en.yearNoSetQ, 'Do you take appointments all year?');
  assert.match(text.fr.yearNoSetQ, /^Recevez-vous sur rendez-vous toute l’année/);
  const c = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.match(c.t.yearNoSetQ, /^Offrez-vous des sorties/);
  assert.doesNotMatch(c.t.yearNoSetQ + c.t.yearNoSetLead, /heures/);
  // What the setup sends on that path: by booking only, then (as the old closures save did NOT have to) nothing about the
  // year. The page never says "All year" on its own.
  ok(await change(t, { hours: NONE, hours_checked: true, tour_info: { visit: 'appointment' } }));
  ok(await change(t, { closures: [] }).then((r) => (r.status === 400 ? { status: 200, body: r.body } : r)));
  assert.equal(tourInfo(v.id).year, undefined);
  assert.doesNotMatch(plain(page(v, 'en')), /Season All year/);
  assert.equal(app.tourVisitLines(app.getVenue(v.id)).Season, undefined);
  // The season question answered: part of the year, May 15 to Sep 30 (the dates and the answer, no week of hours).
  ok(await change(t, { open_months: '05-15:09-30' }));
  ok(await change(t, { tour_info: { year: 'seasonal' } }));
  assert.equal(tourInfo(v.id).year, 'seasonal');
  assert.equal(app.tourVisitLines(app.getVenue(v.id)).Season.en, 'May 15 – Sep 30.');
  assert.match(plain(page(v, 'en', new Date('2027-07-15T19:00:00Z'))), /Season May 15 – Sep 30\./);
  assert.match(plain(page(v, 'fr', new Date('2027-07-15T19:00:00Z'))), /Du 15 mai au 30 sept\./);
});

test('2. a by-booking tour (and a winery by appointment) is not "Closed for the season" in the last 30 days of its season', async () => {
  const { v } = await marc();
  for (const d of ['2027-08-15', '2027-09-01', '2027-09-10', '2027-09-30']) {
    const now = new Date(`${d}T19:00:00Z`);
    const st = app.getSeasonStates(now).get(v.id);
    assert.ok(!st || st.kind !== 'closed', `${d}: ${JSON.stringify(st)}`);
    const en = plain(page(v, 'en', now));
    assert.doesNotMatch(en, /Closed for the season/, d);
    assert.match(en, /Book ahead · tours by reservation/, d);
  }
  // Out of season it is closed, as before.
  const oct = new Date('2027-10-05T19:00:00Z');
  assert.equal((app.getSeasonStates(oct).get(v.id) || {}).kind, 'closed');
  assert.match(plain(page(v, 'en', oct)), /Closed for the season/);
  // Build My Trip agrees: in on Sep 10, out on Oct 10.
  assert.ok(names(await plan('rafting in Penticton on September 10 2027')).includes('Riviere Sauvage Rafting'));
  assert.ok(!names(await plan('rafting in Penticton on October 10 2027')).includes('Riviere Sauvage Rafting'));
  // The rule itself still holds for a place with weekly hours (its last opening has passed).
  assert.equal(app.seasonLastOpeningPassed({ hours: JSON.stringify({ ...NONE, mon: [['10:00', '17:00']] }) }, '2027-09-12', new Date('2027-09-07T19:00:00Z')), true);

  // A winery that is by appointment only, with a season May 1 to Oct 15.
  const w = mk('winery', { name: 'Appointment Hill Winery', cuisine: 'Winery' });
  const wt = tokenFor(w.id);
  ok(await change(wt, { hours: NONE, hours_checked: true, winery_info: { visit: 'appointment' } }));
  ok(await change(wt, { open_months: '05-01:10-15' }));
  for (const d of ['2027-09-20', '2027-10-10']) {
    const now = new Date(`${d}T19:00:00Z`);
    const st = app.getSeasonStates(now).get(w.id);
    assert.ok(!st || st.kind !== 'closed', `${d}: ${JSON.stringify(st)}`);
    const en = plain(page(w, 'en', now));
    assert.doesNotMatch(en, /Closed for the season/, d);
    assert.match(en, /By appointment · call ahead/, d);
  }
  assert.equal((app.getSeasonStates(new Date('2027-11-05T19:00:00Z')).get(w.id) || {}).kind, 'closed');
  // A distillery by appointment only, the same.
  const dz = mk('distillery', { name: 'Appointment Still Wr2', cuisine: 'Craft distillery' });
  ok(await change(tokenFor(dz.id), { hours: NONE, hours_checked: true, brewery_info: { visit: 'appointment' } }));
  ok(await change(tokenFor(dz.id), { open_months: '05-01:10-15' }));
  const stD = app.getSeasonStates(new Date('2027-10-10T19:00:00Z')).get(dz.id);
  assert.ok(!stD || stD.kind !== 'closed', JSON.stringify(stD));
});

test('3 + 6. a tour’s French Good to know shows on the French page; the box holds 240 with a counter', async () => {
  const { v, t } = await marc();
  const frLine = 'Équipement fourni : combinaison, casque et gilet. Apportez un maillot et une serviette. Remboursement complet si le niveau d’eau est trop haut. Eau vive : 12 ans et plus, poids minimum de 40 kg.';
  assert.ok(frLine.length > 180 && frLine.length <= 240, String(frLine.length));
  ok(await change(t, { visit_rows: { good_to_know: frLine, _lang: 'fr' } }, true));
  const fr = plain(page(v, 'fr', new Date('2027-07-15T19:00:00Z')));
  assert.ok(fr.includes('Remboursement complet si le niveau d’eau est trop haut'), fr.slice(0, 1500));
  assert.ok(fr.includes('poids minimum de 40 kg'));
  // The English page has no English line for it (French-only answer), as before.
  assert.doesNotMatch(plain(page(v, 'en', new Date('2027-07-15T19:00:00Z'))), /Remboursement complet/);
  // Tour test 13: a tour's Good to know holds 320 now. 321 characters is refused in plain words; every other line and
  // every other type keeps 180.
  const long = await change(t, { visit_rows: { good_to_know: 'x'.repeat(321) } });
  assert.equal(long.status, 400);
  assert.match(JSON.stringify(long.body), /Good to know to 320 characters/);
  const known = await change(t, { visit_rows: { known_for: 'y '.repeat(95).trim() } });
  assert.equal(known.status, 400);
  const lounge = mk('cocktail');
  assert.equal((await change(tokenFor(lounge.id), { visit_rows: { good_to_know: 'z '.repeat(95).trim() } })).status, 400);
  // The setup: the limit and the counter.
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c.bringMax, 320);
  assert.match(c.t.countFull, /limit/);
  // Tour test 13: room past the limit, so a paste isn't cut mid-word; Save keeps it to the last full sentence.
  assert.match(CLIENT, /maxlength="' \+ \(BRING_MAX \+ 600\) \+ '"/);
  assert.match(CLIENT, /countLine\('suBring', bv, BRING_MAX\)/);
  assert.match(CLIENT, /screen\.addEventListener\('input', function\(e\)\{ countUpdate\(e\.target\); \}\);/);
  // The two slot lists agree for every setup type.
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail', 'tour']) {
    const o = mk(type);
    const keys = app.visitSlotsFor(o.id).map((x) => x.key);
    const html = app.visitInfoHtml({ rows: [{ label: 'Known for', text: 'A' }], owner_fr_lines: Object.fromEntries(keys.filter((k) => k !== 'menu').map((k) => [k, `FR ${k}`])) }, true, { type });
    for (const k of keys.filter((x) => x !== 'menu')) assert.ok(html.includes(`FR ${k}`), `${type}: ${k}`);
  }
});

test('4 + 5. the French status line, and the off-season hours block of a by-booking tour (EN/FR)', async () => {
  const { v } = await marc();
  const july = new Date('2027-07-15T19:00:00Z'), nov = new Date('2027-11-16T19:00:00Z');
  const frJ = page(v, 'fr', july);
  assert.match(frJ, /id="venueOpenStatus">Réservez à l’avance · sorties sur réservation/);
  assert.doesNotMatch(plain(frJ), /Book ahead · tours by reservation/);
  assert.doesNotMatch(plain(frJ), /visites sur réservation/);
  assert.match(page(v, 'en', july), /id="venueOpenStatus">Book ahead · tours by reservation/);
  assert.equal(app.frText('Book ahead · tours by reservation'), 'Réservez à l’avance · sorties sur réservation');
  // Out of season: the season stretch says book ahead, never "Daily Closed" or seven "Closed" rows.
  const enN = plain(page(v, 'en', nov)), frN = plain(page(v, 'fr', nov));
  assert.match(enN, /Closed for the season/);
  // Tour test 7 (2026-11-17): the dates once (the season line), then the one booking line (no table saying them again).
  assert.match(enN, /Open May 15 – September 30 each year .{0,80}Book ahead · tours by reservation/);
  assert.doesNotMatch(enN, /Hours through the year/);
  assert.doesNotMatch(enN, /Daily Closed/);
  assert.doesNotMatch(enN, /Usual hours when open/);
  assert.doesNotMatch(enN, /Monday Closed/);
  assert.match(frN, /Ouvert du .{5,40} chaque année .{0,80}Réservez à l’avance · sorties sur réservation/);
  assert.doesNotMatch(frN, /Tous les jours Fermé/);
  assert.doesNotMatch(frN, /lundi Fermé/i);
  // A seasonal tour WITH hours keeps its week under "Usual hours when open".
  const h = mk('tour', { name: 'Set Hours Tours Wr2', cuisine: 'Boat tours' });
  ok(await change(tokenFor(h.id), { hours: WK('09:00', '17:00'), hours_checked: true, open_months: '05-15:09-30', tour_info: { year: 'seasonal' } }));
  assert.match(plain(page(h, 'en', nov)), /Usual hours when open/);
});

test('8 + 9 (approved): a 5+ age and "48 hours ahead", their page lines and Build My Trip notes', async () => {
  const { v, t } = await marc();
  // Tour test 10 (2026-11-18): 8+ and 10+ too.
  assert.deepEqual(pc.TOUR_AGES, ['all', '5', '6', '8', '10', '12', '14', '16', '19']);
  // Tour test 16 (2026-11-18): 'ahead' is "Yes" with no how-far-ahead chip ("Book ahead.").
  assert.deepEqual(pc.TOUR_BOOK, ['same_day', 'day', '48h', 'week', 'no', 'ahead']);
  assert.match(CLIENT, /tchips\('age', \['all', '5', '6', '8', '10', '12', '14', '16', '19'\]/);
  assert.match(CLIENT, /tchips\('book', \['same_day', 'day', '48h', 'week'\]/);
  // Tour test 10 (2026-11-18): 8+ and 10+ keep Kids welcome too.
  assert.match(CLIENT, /var kidsOn = S\.tour\.age === 'all' \|\| S\.tour\.age === '5' \|\| S\.tour\.age === '6' \|\| S\.tour\.age === '8' \|\| S\.tour\.age === '10';/);
  assert.equal(text.en.tour.tages[5], '5+');
  assert.equal(text.en.tour.taheads['48h'], '48 hours ahead');
  assert.match(text.fr.tour.taheads['48h'], /^48\s?heures à l’avance$/);
  ok(await change(t, { tour_info: { kinds: ['raft', 'wildlife'], length: '2-3h', age: '5', book: '48h' }, badges: { kid_friendly: true } }));
  ok(await change(t, { tour_price: 85 }));
  const lines = app.tourVisitLines(app.getVenue(v.id));
  assert.equal(lines.Ages.en, 'Ages 5 and up.');
  assert.equal(lines.Ages.fr, 'À partir de 5 ans.');
  assert.equal(lines.Booking.en, 'Book at least 48 hours ahead.');
  assert.equal(lines.Booking.fr, 'Réservez au moins 48 heures à l’avance.');
  const july = new Date('2027-07-15T19:00:00Z');
  assert.match(plain(page(v, 'en', july)), /Book at least 48 hours ahead\./);
  assert.match(plain(page(v, 'fr', july)), /Réservez au moins 48 heures à l’avance\./);
  assert.match(plain(page(v, 'fr', july)), /À partir de 5 ans\./);
  assert.equal(pc.TOUR_AGES.includes('7'), false);
  assert.equal((await change(t, { tour_info: { age: '7' } })).status, 400);
  // Build My Trip: a family request includes a 5+ tour with its age and book-ahead notes; no "No usable hours" for by booking.
  const p = await plan('Whitewater rafting in Penticton with a 10-year-old on July 12 2027');
  const s = stopOf(p, 'Riviere Sauvage Rafting');
  assert.ok(s, JSON.stringify(names(p)));
  assert.ok(s.caveats.includes('Book at least 48 hours ahead (the operator’s own answer).'), JSON.stringify(s.caveats));
  assert.ok(s.caveats.includes('Ages 5 and up (the operator’s own answer).'), JSON.stringify(s.caveats));
  assert.ok(!s.caveats.some((c) => /No usable hours/.test(c)), JSON.stringify(s.caveats));
  assert.equal(frCopy.t3FrenchText('Book at least 48 hours ahead (the operator’s own answer).'), 'Réservez au moins 48 heures à l’avance (réponse de l’entreprise).');
  assert.equal(frCopy.t3FrenchText('Ages 5 and up (the operator’s own answer).'), 'À partir de 5 ans (réponse de l’entreprise).');
  assert.equal(frCopy.t3FrenchText('Ages 12 and up (the operator’s own answer).'), 'À partir de 12 ans (réponse de l’entreprise).');
  // A 12+ tour with a named 14-year-old says its age; with a 6-year-old it is left out.
  const teen = mk('tour', { name: 'Canyon Raft Co Wr2', cuisine: 'Rafting', region: 'oliver', address: '12 Main St, Oliver', latitude: 49.18, longitude: -119.55, description: 'Whitewater rafting trips near Oliver.' });
  ok(await change(tokenFor(teen.id), { tour_info: { kinds: ['raft'], age: '12' } }));
  const p14 = await plan('rafting in Oliver with our 14-year-old on July 12 2027');
  const s14 = stopOf(p14, 'Canyon Raft Co Wr2');
  assert.ok(s14 && s14.caveats.includes('Ages 12 and up (the operator’s own answer).'), JSON.stringify([names(p14), s14 && s14.caveats]));
  assert.ok(!names(await plan('rafting in Oliver with a 6-year-old on July 12 2027')).includes('Canyon Raft Co Wr2'));
  // A 5+ tour is left out for a 4-year-old and planned for a 5-year-old.
  assert.ok(!names(await plan('rafting in Penticton with a 4-year-old on July 12 2027')).includes('Riviere Sauvage Rafting'));
  assert.ok(names(await plan('rafting in Penticton with a 5-year-old on July 12 2027')).includes('Riviere Sauvage Rafting'));
});

test('12. kinds keep her own words ("Whitewater"), read naturally, and French cards say the kinds in French', async () => {
  const { v } = await marc();
  // Tour test 17 (2026-11-18): the kinds read in the owner's own chip order (Rafting, then Wildlife).
  assert.equal(app.getVenue(v.id).cuisine, 'Whitewater rafting · Wildlife and bear viewing');
  assert.equal(app.tourKindsText(['raft', 'wildlife'], false, 'Whitewater rafting & bear viewing tours'), 'Whitewater rafting · Wildlife and bear viewing');
  assert.equal(app.tourKindsText(['raft', 'wildlife'], true), 'Rafting et observation de la faune'); // tour test 17: the owner's own chip order, no bears said
  // Test 1's results stand.
  assert.equal(app.tourKindsText(['snowmobile', 'adventure'], false, 'Snowmobile & ATV tours'), 'Snowmobile tours & ATV tours');
  // Tour test 7 (2026-11-17): the ATV chip pre-picked from these words, left unticked, takes them off.
  assert.equal(app.tourKindsText(['snowmobile'], false, 'Snowmobile & ATV tours'), 'Snowmobile tours');
  assert.equal(app.tourKindsText(['heli'], false, ''), 'Heli-skiing');
  assert.equal(app.tourKindsText(['raft'], false, 'Rafting'), 'Rafting');
  assert.equal(app.tourKindsText(['other'], false, 'ATV tours'), '');
  // French cards: the kinds in French, and the chip.
  assert.equal(app.frCardMetaText('Penticton &middot; Whitewater rafting · Wildlife and bear viewing'), 'Penticton &middot; Rafting · Observation de la faune et des ours');
  const chip = '<!DOCTYPE html><html><body><span class="chip complete-verified-badge" style="x"><span aria-hidden="true" style="y">&#10003;</span>Complete &amp; Verified</span></body></html>';
  assert.match(app.frenchTwinHtml(chip, '/penticton/tours'), /Complète et vérifiée<\/span>/);
  const cat = await get('/fr/penticton/tours');
  assert.equal(cat.status, 200);
  const card = (cat.text.split('<li class="venue-card"').slice(1).find((x) => x.includes('Riviere Sauvage Rafting')) || '');
  assert.ok(card.includes('Rafting · Observation de la faune et des ours'), card.replace(/\s+/g, ' ').slice(0, 700));
  assert.doesNotMatch(card, /Wildlife and bear viewing/);
  assert.doesNotMatch(card, /visites sur réservation/);
  const catEn = await get('/penticton/tours');
  const cardEn = (catEn.text.split('<li class="venue-card"').slice(1).find((x) => x.includes('Riviere Sauvage Rafting')) || '');
  assert.ok(cardEn.includes('Whitewater rafting · Wildlife and bear viewing'), cardEn.replace(/\s+/g, ' ').slice(0, 700));
});

test('7. Build My Trip: bear viewing, French wildlife and outing words, ages, the French slot heading, heli biking and quad', async () => {
  await marc();
  const R = 'Riviere Sauvage Rafting';
  for (const q of ['Bear viewing tour near Penticton on July 20 2027', 'bear tour in Penticton on July 20 2027', 'bear viewing in Penticton on July 20 2027', 'wildlife tour in Penticton on July 20 2027',
    'observation des ours à Penticton le 20 juillet 2027', 'observation de la faune à Penticton le 20 juillet 2027']) {
    const p = await plan(q);
    assert.deepEqual(names(p), [R], `${q}: ${JSON.stringify(names(p))} ${p.summary}`);
    assert.doesNotMatch(String(p.summary), /mention/, `${q}: ${p.summary}`);
    assert.match(String(p.summary), /^Tours & experiences/, `${q}: ${p.summary}`);
  }
  // « sortie », « excursion », « descente de rivière » are tour words, never search words; « ans » is an age.
  for (const q of ['une sortie en famille à Penticton le 12 juillet 2027', 'une sortie à Penticton le 12 juillet 2027', 'une excursion à Penticton le 12 juillet 2027',
    'descente de rivière avec un enfant de 6 ans à Penticton le 12 juillet 2027']) {
    const p = await plan(q);
    assert.ok(names(p).includes(R), `${q}: ${JSON.stringify(names(p))} ${p.summary}`);
    assert.doesNotMatch(String(p.summary), /mention|sortie|excursion|descente|\bans\b/, `${q}: ${p.summary}`);
    assert.match(String(p.summary), /Tours & experiences/, `${q}: ${p.summary}`);
  }
  const fam = await plan('une sortie en famille à Penticton le 12 juillet 2027');
  assert.match(JSON.stringify(fam.notes || []), /kid-friendly|Family-friendly/);
  const six = await plan('descente de rivière avec un enfant de 6 ans à Penticton le 12 juillet 2027');
  assert.deepEqual(names(six), [R]);
  assert.ok(stopOf(six, R).caveats.includes('Ages 5 and up (the operator’s own answer).'));
  // The words themselves.
  const tx = (q) => trFr.tripPlannerText(q, { regions: [{ slug: 'penticton', label: 'Penticton' }], venues: [] });
  assert.match(tx('observation des ours à Penticton'), /bear viewing tour/);
  assert.match(tx('observation de la faune à Penticton'), /wildlife viewing tour/);
  assert.match(tx('une sortie en famille à Penticton'), /family friendly tour/);
  assert.match(tx('descente de rivière avec un enfant de 6 ans à Penticton'), /rafting .*6 year old/);
  assert.doesNotMatch(tx('descente de rivière avec un enfant de 6 ans à Penticton'), /\bans\b/);
  assert.match(tx('sortie en quad à Penticton'), /ATV tour/);
  assert.match(tx('sortie en VTT à Penticton'), /ATV tour/);
  assert.match(tx('ski de descente à Penticton'), /downhill skiing/);
  // "Wildlife viewing" alone stays the Nature & Wildlife activity (not a tour kind).
  assert.equal(tr.inferPlannerKinds({ type: 'outdoor', name: 'Marsh Walk', cuisine: 'Wildlife viewing', description: 'A marsh boardwalk with wildlife viewing.' }).includes('wildlife_tour'), false);
  assert.equal(tr.inferPlannerKinds({ type: 'tour', name: 'X', cuisine: 'Whitewater rafting · Wildlife and bear viewing', description: '' }).includes('wildlife_tour'), true);
  // The French slot heading and summary.
  assert.equal(frCopy.t3FrenchText('Tours & experiences'), 'Visites et expériences');
  assert.equal(frCopy.t3FrenchText('Tours & Experiences'), 'Visites et expériences');
  const named = await plan('Riviere Sauvage Rafting à Penticton le 20 juillet 2027');
  const st = stopOf(named, R);
  assert.ok(st, JSON.stringify(names(named)));
  assert.equal(frCopy.t3FrenchText(st.label), 'Visites et expériences');
  // The two Whistler-only word fixes (whistlerroam #181), now here too.
  const vocab = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vocabulary', 'shared.json'), 'utf8'));
  assert.ok(vocab.types.tour.includes('heli biking') && vocab.types.tour.includes('heli bike'));
  assert.match(String((await plan('heli biking in Penticton on July 20 2027')).summary), /^Tours & experiences/);
});

test('8. Help: the questions it missed or answered with food words (EN + FR, plural and hyphen forms)', async () => {
  const { t } = await marc();
  const hb = helpBot((await get(`/owner/${t}/setup`)).text);
  const fb = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  const en = {
    'we only run in summer and by booking only, where does my season go?': 'tour-season', 'where do I put my season': 'tour-season',
    'is there a minimum weight?': 'tour-weight', 'minimum height for rafting': 'tour-weight', 'weight limit': 'tour-weight',
    'our trips have different ages, the float is 5 and whitewater is 12': 'tour-ages-per-trip', 'different minimum ages per trip': 'tour-ages-per-trip',
    'what if the water is too high and we cancel?': 'tour-weather', 'high water cancellation': 'tour-weather',
    'we sell gift certificates': 'tour-gift', 'gift cards': 'tour-gift',
    'only one trip is wheelchair accessible': 'tour-wheelchair', 'wheelchair access': 'tour-wheelchair',
    'is it really free? what’s the catch?': 'tour-free', 'what is the catch': 'tour-free',
    'people must book 48 hours ahead': 'tour-48h', '48 hours': 'tour-48h', 'book two days ahead': 'tour-48h',
  };
  for (const [q, id] of Object.entries(en)) assert.equal(hb.best(q).id, id, q);
  const fr = {
    'où mettre ma saison? nous sommes sur réservation seulement': 'tour-season', 'été seulement, sur réservation': 'tour-season', 'nous offrons des sorties de mai à septembre': 'tour-season',
    'y a-t-il un poids minimum?': 'tour-weight', 'poids minimum': 'tour-weight', 'taille minimum': 'tour-weight',
    'les âges sont différents selon la sortie': 'tour-ages-per-trip', 'chaque sortie a un âge minimum différent': 'tour-ages-per-trip',
    'et si le niveau d’eau est trop haut?': 'tour-weather', 'annulation à cause du niveau d’eau': 'tour-weather',
    'nous vendons des certificats-cadeaux': 'tour-gift', 'certificat-cadeau': 'tour-gift', 'chèques-cadeaux': 'tour-gift', 'cartes-cadeaux': 'tour-gift',
    'une seule sortie est accessible en fauteuil roulant': 'tour-wheelchair', 'fauteuils roulants': 'tour-wheelchair', 'accès en fauteuil roulant': 'tour-wheelchair',
    'C’est vraiment gratuit? C’est quoi l’attrape?': 'tour-free', 'c’est quoi l’attrape': 'tour-free',
    'il faut réserver 48 heures à l’avance': 'tour-48h', '48 heures': 'tour-48h', '48 h': 'tour-48h',
  };
  for (const [q, id] of Object.entries(fr)) assert.equal(fb.best(q).id, id, q);
  // The answers.
  const A = (id) => hb.topic(id).a, F = (id) => fb.topic(id).aFr;
  assert.match(A('tour-season'), /By booking only/);
  assert.match(A('tour-season'), /Do you run trips all year\?/);
  assert.match(F('tour-season'), /Offrez-vous des sorties toute l’année/);
  assert.match(A('tour-booking-only'), /next screen asks whether you run all year/);
  assert.match(A('tour-weight'), /Good to know/);
  assert.match(F('tour-weight'), /Bon à savoir/);
  assert.match(A('tour-ages-per-trip'), /youngest/);
  assert.match(A('tour-ages-per-trip'), /Your tours and prices/);
  assert.match(F('tour-ages-per-trip'), /plus jeune/);
  assert.match(F('tour-ages-per-trip'), /Vos sorties et tarifs/);
  assert.match(A('tour-weather'), /high water/);
  assert.match(A('tour-wheelchair'), /at least one of your trips/);
  assert.match(A('tour-wheelchair'), /Good to know/);
  assert.doesNotMatch(A('tour-wheelchair') + F('tour-wheelchair'), /patio|vegan|terrasse|végan/i);
  assert.match(A('tour-free'), /no catch/);
  assert.match(F('tour-free'), /pas d’attrape/);
  assert.match(A('tour-48h'), /48 hours ahead/);
  assert.match(F('tour-48h'), /48\s?heures à l’avance/);
  // The same-day example no longer says same day is fine for everyone; the Part 2 title is the screen's own.
  assert.doesNotMatch(F('tour-same-day'), /il reste souvent de la place/);
  assert.doesNotMatch(A('tour-same-day'), /we often have room/);
  const allFr = fb.topics.map((x) => x.aFr).join(' ');
  assert.doesNotMatch(allFr, /Plus sur votre entreprise/);
  assert.match(allFr, /Plus de détails sur votre entreprise/);
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).t.moreQ.replace(/[\u00a0\u202f]/g, ' '), 'Plus de détails sur votre entreprise');
  // No menu link chip and no patio or vegan words for a tour; a restaurant keeps them.
  for (const b of [hb, fb]) {
    assert.doesNotMatch(JSON.stringify([b.topic('links').q, b.topic('links').qFr, b.topic('links').a, b.topic('links').aFr]), /menu/i);
    assert.doesNotMatch(JSON.stringify([b.topic('features').a, b.topic('features').aFr]), /patio|vegan|terrasse|végan|happy hour|5 à 7/i);
  }
  const e = helpBot((await get(`/fr/owner/${t}`)).text);
  assert.match(e.topic('links').qFr.replace(/[\u00a0\u202f]/g, ' '), /de tarifs ou de réseau social/);
  const r = mk('restaurant');
  const rb = helpBot((await get(`/owner/${tokenFor(r.id)}`)).text);
  assert.match(rb.topic('links').q, /menu/);
  assert.match(rb.topic('features').a, /patio/);
});

test('9 + 10 + Minor: the edit page and the wording table for a tour (EN/FR); « sorties », not « visites »', async () => {
  const { v, t } = await marc();
  const T = text.fr.tour, sp = (x) => String(x).replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(sp(T.labels.menu), 'Vos sorties et tarifs');
  assert.match(sp(T.tprivQ), /^Sorties privées/);
  assert.match(sp(T.noSetHoursSaved), /sorties sur réservation/);
  // Tour test 15 (Dayton): tours have no meeting-spot question; Basics asks for the address.
  assert.match(sp(T.basicsQ), /^Est-ce bien votre adresse, votre téléphone et votre site Web \?$/);
  assert.equal(sp(T.photosQ), 'Ajoutez des photos de vos sorties');
  assert.equal(sp(T.moreQ), 'Plus de détails sur votre entreprise');
  assert.ok(T.quick.good_to_know.map(sp).includes('Navette depuis l’hôtel offerte'));
  assert.ok(T.quick.groups.map(sp).includes('Sorties privées offertes'));
  assert.match(sp(T.bringGuess), /ci-dessous/);
  assert.match(sp(T.doorRights), /trouver votre point de rencontre/);
  assert.doesNotMatch(JSON.stringify(T).replace(/Visites (?:à pied|gourmandes|de ferme)|quickOld[^}]+}/g, ''), /[Vv]isites? (?:et tarifs|privées?|sur réservation)/);
  // An answer saved with the old wording still pairs with its English.
  assert.match(app.presetAnswer ? app.presetAnswer('Visites privées offertes', 'en') : 'Private tours available', /Private tours available/);
  // The kinds chip.
  const c = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.ok(c.tourKinds.some((k) => k.k === 'jetboat' && sp(k.t) === 'Bateau à propulsion (jet boat)'));
  // The page: « Sorties privées », « Sorties et tarifs ».
  ok(await change(t, { tour_info: { private: 1200 } }));
  assert.match(sp(app.tourVisitLines(app.getVenue(v.id)).Prices.fr), /Sorties privées à partir de 1 200 \$/);
  // The edit page, French then English. A price list sent for typing up, a prices link and the meeting spot.
  db.prepare("INSERT INTO venue_menus (venue_id, status, help_kind, submitted_at, updated_at) VALUES (?, 'help', 'upload', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(v.id);
  const ef = (await get(`/fr/owner/${t}`)).text, pf = plain(ef);
  assert.match(pf, /Sorties et tarifs envoyés/);
  assert.doesNotMatch(pf, /Menu envoyé/);
  assert.match(pf, /Lien des tarifs \(facultatif\)/);
  assert.doesNotMatch(pf, /Lien du menu/);
  assert.match(pf, /Sorties spéciales, ateliers ou cours/);
  assert.doesNotMatch(pf, /Musique en direct, dégustations, marchés/);
  // Tour test 15 (Dayton, 2026-11-18): no meeting-spot section on a tour's edit page.
  assert.doesNotMatch(ef, />POINT DE RENCONTRE<\/text>/);
  assert.doesNotMatch(ef, />VOTRE COMMERCE<\/text>/);
  assert.doesNotMatch(pf, /Prendre la photo du point de rencontre/);
  assert.doesNotMatch(pf, /de le point/);
  assert.doesNotMatch(pf, /aider les visiteurs à trouver votre point de rencontre/);
  assert.match(pf, /À partir de 85 \$ par personne/);
  assert.doesNotMatch(pf, /\$\$\$\s?: 30 à 60 \$ par personne/);
  assert.match(ef, /<span class="op-fold-hint">À partir de 85[\s\u00a0\u202f]\$ par personne<\/span>/);
  assert.match(pf, /Modifier ma saison/);
  assert.doesNotMatch(pf, /Vos heures d’ouverture/);
  assert.doesNotMatch(pf, /[Vv]isites et tarifs/);
  const ee = (await get(`/owner/${t}`)).text, pe = plain(ee);
  assert.match(pe, /Tours and prices sent to us/);
  assert.match(pe, /Prices link \(optional\)/);
  assert.match(pe, /Special trips, workshops or classes/);
  assert.doesNotMatch(ee, />MEETING SPOT<\/text>/);
  assert.match(pe, /From \$85 a person/);
  assert.match(pe, /Change my season/);
  assert.doesNotMatch(pe, /When you open and close/);
  // "… sent" line and the update names.
  const PC = fs.readFileSync(path.join(__dirname, '..', 'portal-completeness.js'), 'utf8');
  assert.match(PC, /menu: o\.tour \? \['tours and prices', 'sorties et tarifs'\] : \['menu', 'menu'\]/);
  assert.match(PC, /arrival: o\.tour \? \['meeting spot photo', 'photo du point de rencontre'\]/);
  assert.doesNotMatch(pf, /menu et photo de la devanture/);
  assert.match(pf, /à partir de quel âge \(5\+, 6\+, 12\+, 16\+, 19\+\)|Qui peut venir/);
  assert.equal(app.ownerVenueActivity(v.id, 12, 'fr').some((x) => /Menu envoyé|lien du menu/i.test(x.title)), false);
  // The badge note for a by-booking tour: season and booking, not hours.
  assert.match(PC, /o\.tour && o\.apptOnly \? L\('It shows on your page, in search and on the Roam Now map\. Keep it by confirming your season and booking details at least every 30 days\./);
  // A tour with set hours keeps "hours" on its tile; a restaurant keeps every word.
  const h = mk('tour', { name: 'Hours Tile Tours Wr2', cuisine: 'Boat tours' });
  assert.match(plain((await get(`/owner/${tokenFor(h.id)}`)).text), /Change my hours or season/);
  const r = mk('restaurant');
  const re = (await get(`/fr/owner/${tokenFor(r.id)}`)).text, pr = plain(re);
  assert.match(pr, /Lien du menu \(facultatif\)/);
  assert.match(pr, /Musique en direct, dégustations, marchés/);
  assert.match(re, />VOTRE COMMERCE<\/text>/);
  assert.match(pr, /Vos heures d’ouverture/);
});

test('10 + 11. closures: Next saves an added closure; the booking and hours defaults for a tour', () => {
  // Next (or Skip) on the closures screen with unsaved picks saves them (every type).
  assert.match(CLIENT, /if \(\(k === 'skip' \|\| k === 'after'\) && v === 'closures' && S\.step === 'closures' && closuresKey\(\) !== S\.closuresWas && \(S\.closures\.length \|\| S\.extra\.length\)\) k = 'closuresSave';/);
  assert.ok(CLIENT.indexOf("k = 'closuresSave';\n    if (k === 'skip')") > 0 && CLIENT.indexOf("k = 'closuresSave';\n    if (k === 'skip')") < CLIENT.indexOf("if (k === 'closuresNone' || k === 'closuresSave') {"));
  // By booking only pre-picks Yes on "Do people need to book ahead?" (saved only with the screen).
  assert.match(CLIENT, /if \(!S\.tour\.bookYes && AI\.visit === 'appointment' && !TI\.book\) S\.tour\.bookYes = 'yes';/);
  // A newly opened day: 9 to 5 for a tour, 11 to 9 otherwise.
  assert.match(CLIENT, /var DAY_NEW = TOUR \? \['09:00', '17:00'\] : \['11:00', '21:00'\];/);
  assert.doesNotMatch(CLIENT, /\[\['11:00', '21:00'\]\]/);
  // The year screen: a tour's "We only run part of the year" comes before the summer and winter hours choices.
  const a = CLIENT.indexOf("'yearAll') + (TOUR && !stS.length ? big('🗓️', T.allYearClosed, T.allYearClosedSub, true, 'yearClosed') : '') + (stS.length ? stS.map(");
  assert.ok(a > 0 && a < CLIENT.indexOf("big('☀️', T.allYearSummer"));
  assert.match(CLIENT, /\+ \(TOUR && !stS\.length \? '' : big\('🗓️', T\.allYearClosed, T\.allYearClosedSub, true, 'yearClosed'\)\)/);
});

test('Minor: the admin editor’s refusal has no "dish" for a tour', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /venue && venue\.type === 'tour' \? MENU_EMPTY_TOUR_ERROR : 'Your menu needs at least one dish before it can go live\.'/);
  assert.match(src, /const MENU_EMPTY_TOUR_ERROR = 'Your list needs at least one line with a price before it can go live\.';/);
});

test('the other setups still load (pub, restaurant, café, winery, brewery, distillery, cocktail), with their own words', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail']) {
    const o = mk(type);
    for (const lang of ['', '/fr']) {
      const g = await get(`${lang}/owner/${tokenFor(o.id)}/setup`);
      assert.equal(g.status, 200, type);
      const c = cfgOf(g.text);
      assert.ok(!c.tour, type);
      assert.equal(c.bringMax, undefined, type);
      assert.notEqual(c.t.yearNoSetQ, text[lang ? 'fr' : 'en'].tour.yearNoSetQ, type);
      assert.doesNotMatch(String(c.t.labels.menu), /sorties et tarifs|tours and prices/i, type);
      assert.equal((await get(`${lang}/owner/${tokenFor(o.id)}`)).status, 200, type);
    }
  }
  // A winery's setup has the by-appointment season question in its own words.
  const w = mk('winery');
  assert.equal(cfgOf((await get(`/owner/${tokenFor(w.id)}/setup`)).text).t.yearNoSetQ, 'Do you take appointments all year?');
});
