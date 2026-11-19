// Whistler tour test 1 fixes (fresh eyes, 2026-11-16; Whistler Roam drafts/fresh-eyes-tour1-2026-11-16/REPORT.md) and
// Dayton's "Your tours and prices" screen (the menu feature in tour words). Covers screen A, bugs 1-14, the Minor list,
// the wording table and the suggested fixes, in English and French, and that the other setups still load.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tp = require('../trip-planner.js');
const tr = require('../trip-requirements.js');
const trFr = require('../trip-planner-fr.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr1 ${++n}`, slug: `tour-wr1-${n}`, region: 'vernon', type, latitude: 50.267 + n / 2000, longitude: -119.272,
  rating: 4.6, reviews: 120, address: `${4000 + n} 30 Ave, Vernon`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text(), location: r.headers.get('location') }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.31.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list, extra = {}) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today, ...extra }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const progress = (t, step, status) => postJson(`/owner/${t}/setup/progress`, { step, status });


// Jess's tour (Pemberton snowmobile in winter, ATV in summer), moved to Vernon: research words "Snowmobile & ATV tours",
// wrong Patio / Live music / Sports TV badges, research's Good to know line, two stretches with a spring break.
let jessCache = null;
async function jess() {
  if (jessCache) return jessCache;
  const v = mk('tour', { name: 'Vernon Backcountry Sleds', cuisine: 'Snowmobile & ATV tours', region: 'vernon', patio: 1, live_music: 1, sports_tv: 1, dog_friendly: 1,
    description: 'Guided snowmobile tours in the Monashee backcountry above Vernon in winter, and ATV tours in summer.' });
  research(v.id, [{ label: 'Known for', text: 'Guided snowmobile tours in the backcountry' }, { label: 'Good to know', text: 'Meet at the trailhead on Silver Star Road; dogs welcome. One guide per 5 guests.' }]);
  const t = tokenFor(v.id);
  jessCache = { v, t };
  return jessCache;
}

const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const ARRIVAL = fs.readFileSync(path.join(__dirname, '..', 'arrival-points.js'), 'utf8');
const MENU_KEYS = ['menuQ', 'menuLead', 'snap', 'snapSub', 'upload', 'uploadSub', 'web', 'menuSocial', 'emailQ', 'emailLead', 'mailSubject', 'menuSentEmail', 'menuNote', 'menuSentQ', 'menuNewer', 'menuSent',
  'webQ', 'webLead', 'webQEmpty', 'webLeadEmpty', 'webLabel', 'webEmpty', 'upQ', 'upQSome', 'upLead', 'upPick', 'sendMenu', 'camQ', 'camLead', 'page', 'menuSocialQ', 'menuSocialLead', 'menuSocialNote', 'savedMenuSocialName', 'helpTail'];

test('A. "Your tours and prices": the menu step leads Part 2, every word says tours and prices (EN/FR), and the checklist counts it', async () => {
  const v = mk('tour', { name: 'Kal Lake Jet Boats', cuisine: 'Jet boat tours' });
  const t = tokenFor(v.id);
  assert.deepEqual(app.setupParts('tour').part1, ['basics', 'hours', 'tour', 'price', 'booking', 'offer', 'photos'], 'Part 1 stays the 7 essentials');
  assert.equal(app.setupParts('tour').part2[0], 'menu');
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(c.steps.includes('menu'));
  assert.equal(c.t.labels.menu, 'Your tours and prices');
  assert.equal(c.t.snap, 'Take a photo of your rates sheet');
  assert.equal(c.t.upload, 'Upload your price list');
  assert.equal(c.t.web, 'My tours and prices are on my website');
  assert.equal(c.t.menuSentQ, 'Your tours and prices are sent ✓');
  for (const k of MENU_KEYS) assert.doesNotMatch(String(c.t[k]), /\bmenus?\b/i, `${k}: ${c.t[k]}`);
  const f = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(f.t.labels.menu, 'Vos sorties et tarifs');
  assert.match(f.t.web, /^Mes sorties et tarifs sont sur mon site Web$/);
  for (const k of MENU_KEYS) assert.doesNotMatch(String(f.t[k]), /\bmenus?\b/i, `fr ${k}: ${f.t[k]}`);
  // The price step points to it; a ticket on its tile, never the plate or the mug.
  assert.match(c.t.tpriceMore, /Your tours and prices/);
  assert.match(CLIENT, /if \(TOUR\) \{ P2_ICONS\.bring = '🎒'; P2_ICONS\.door = '📍'; P2_ICONS\.menu = '🎟️'; \}/);
  // Other types keep their menu words.
  const r = mk('restaurant');
  assert.equal(cfgOf((await get(`/owner/${tokenFor(r.id)}/setup`)).text).t.labels.menu, 'Menu');
  // The % checklist item.
  const item = pc.itemsFor('tour').find((i) => i.key === 'menu');
  assert.equal(item.en, 'Your tours and prices');
  assert.equal(item.fr, 'Vos sorties et tarifs');
  assert.equal(pc.itemsFor('tour').reduce((a, i) => a + i.w, 0), 100);
  // Sent from the setup (a link): the step is answered "within a day".
  ok(await change(t, { menu_url: 'https://example.com/rates' }));
  assert.equal((await progress(t, 'menu', 'day')).status, 200);
  // Help: the menu topic in tour words on the setup (no "menu" chip).
  const hb = helpBot((await get(`/owner/${t}/setup`)).text);
  assert.equal(hb.topic('menu-add').q, 'How do I add my tours and prices?');
  assert.equal(hb.best('how do I add all my tours and prices').id, 'menu-add');
  assert.equal(hb.best('can I send a photo of our rates sheet').id, 'menu-add');
});

test('A. the edit page, the venue page and the list page say "Tours & prices" / « Sorties et tarifs », with a ticket', async () => {
  const v = mk('tour', { name: 'Okanagan Lake Cruises', cuisine: 'Boat tours', region: 'vernon' });
  const t = tokenFor(v.id);
  const e = (await get(`/owner/${t}`)).text;
  assert.match(e, /Update my tours &amp; prices/);
  assert.match(e, /A photo or a link to your price list/);
  assert.match(e, /<a href="#opMenuCard">Tours &amp; prices<\/a>/);
  assert.doesNotMatch(e.split('id="opTasks"')[1].split('</section>')[0], /&#127869;/, 'no plate on the tours tile');
  const ef = (await get(`/fr/owner/${t}`)).text;
  assert.match(ef, /Mettre à jour mes sorties et tarifs/);
  // A published list: the venue page section and its button, and the list page title.
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-01')").run(v.id, JSON.stringify({ sections: [{ name: 'Cruises', items: [{ name: 'Sunset cruise', price: '$79' }, { name: 'Two-hour lake tour', price: '$59' }, { name: 'Private charter', price: '$900' }] }] }));
  const en = page(v, 'en');
  assert.match(en, /<h2><span aria-hidden="true">🎟️<\/span> Tours &amp; prices<\/h2>/);
  assert.match(en, /See all tours &amp; prices \(2/); // tour test 6: the "Private charter" line is not counted as a trip
  const fr = page(v, 'fr');
  assert.match(fr, /<h2><span aria-hidden="true">🎟️<\/span> Sorties et tarifs<\/h2>/);
  assert.match(fr, /Voir toutes les sorties et tarifs \(2/);
  assert.doesNotMatch(plain(en), /🍽|🍺/);
  // A link instead (from the setup's "on my website"): the row says Tours & prices.
  assert.deepEqual(app.venueTapListWords(app.getVenue(v.id), false), { label: 'Tours & prices', see: 'See tours & prices', lower: 'tours & prices' });
  assert.equal(app.venueTapListWords(app.getVenue(v.id), true).label, 'Sorties et tarifs');
  const lp = await get(`${app.venuePagePath ? app.venuePagePath(app.getVenue(v.id)) : '/vernon/tours/' + v.slug}/prices`);
  if (lp.status === 200) assert.match(lp.text, /Tours &amp; Prices|Tours &amp; prices/);
});

test('B1. saving the kinds keeps her own words (ATV), the chip names ATV, ATV pre-picks, and a summer season drops "Winter"', async () => {
  const { v, t } = await jess();
  assert.equal(app.TOUR_KIND_LABELS_OWNER.adventure[0], 'ATV, bungee, climbing, ropes courses or canyoning'); // tour test 6 adds ropes courses
  assert.equal(app.TOUR_KIND_LABELS_OWNER.adventure[1], 'VTT, saut à l’élastique, escalade, hébertisme ou canyonisme');
  // Pre-picks: snowmobile and the ATV chip.
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(c.suggestKinds, ['snowmobile', 'adventure']);
  for (const w of ['Jeep tours', 'Quad rides', 'Side-by-side tours', 'Off-road adventures']) assert.deepEqual(app.tourKindSuggestion({ name: 'X', cuisine: w }), ['adventure'], w);
  // Snowmobile + Something else: ATV stays on her page.
  // Tour test 7 (2026-11-17): the ATV chip was pre-picked from her ATV words; with it unticked, they go (Erik's wrong
  // "heli-skiing" could not be removed otherwise).
  ok(await change(t, { tour_info: { kinds: ['snowmobile', 'other'] } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Snowmobile tours');
  // Snowmobile + the ATV chip: her own ATV words, not the chip's long name.
  ok(await change(t, { tour_info: { kinds: ['snowmobile', 'adventure'] } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Snowmobile tours & ATV tours');
  // Only "Something else": her words exactly.
  ok(await change(t, { tour_info: { kinds: ['other'] } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Snowmobile & ATV tours');
  ok(await change(t, { tour_info: { kinds: ['snowmobile', 'adventure', 'other'] } }));
  // Tour test 7: the chips pre-picked from these words (snowmobile, ziplines, snowshoe) that are left unticked take their
  // words off. Tour test 11 (2026-11-18): picking any kind replaces research's words; a leftover no picked kind covers goes.
  assert.equal(app.tourKindsText(['snowmobile'], false, 'Ziplines, RZR, rafting, snowmobile & snowshoe tours'), 'Snowmobile tours');
  assert.equal(app.tourKindsText(['snowmobile', 'zipline'], false, 'Ziplines, RZR, rafting, snowmobile & snowshoe tours'), 'Snowmobile tours & ziplines');
  assert.equal(app.tourKindsText(['adventure'], false, 'Bungee jumping'), 'Bungee jumping');
  assert.equal(app.tourKindsText(['adventure'], false, ''), 'Adventure'); // tour test 6: the short word, never the chip's whole label
  // The card's season word: "Winter" only while she runs in winter alone.
  const winterOnly = mk('tour', { name: 'Silver Star Snowmobile Tours', cuisine: 'Snowmobile tours', description: 'Guided snowmobile tours.' });
  ok(await change(tokenFor(winterOnly.id), { open_months: '12-15:03-31', tour_info: { year: 'seasonal', kinds: ['snowmobile'] } }));
  assert.equal(app.tourCardKind(app.getVenue(winterOnly.id)), 'Winter');
  ok(await change(t, { open_months: '12-15:09-30', tour_info: { year: 'seasonal' } }));
  assert.notEqual(app.tourCardKind(app.getVenue(v.id)), 'Winter', 'runs in July too');
});

test('B2 + B3 + Minor: departure-time help, no lunch/dinner or after-midnight words, the dogs line and badges for a tour', async () => {
  const { v, t } = await jess();
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c.t.addSecond, '+ Add a second time (only if you close in between)');
  assert.equal(c.t.twoTimesMax, 'Up to two times a day.');
  assert.doesNotMatch(c.t.twoTimesMax, /Breakfast/);
  assert.match(c.t.departHint, /from your first departure to when the last trip gets back/);
  // Tour test 8 (2026-11-17): the No dogs tile says guests' dogs ("No guests’ dogs" / not on any trip).
  assert.equal(c.t.noDogsSub, 'Guests can’t bring their dog on any trip');
  assert.equal(c.t.noDogsSubInside, 'Guests can’t bring their dog on any trip');
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).t.noDogsSub, 'Les clients ne peuvent amener leur chien à aucune sortie');
  // A restaurant keeps its words.
  const r = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.equal(r.t.addSecond, '+ Add a second time (lunch & dinner)');
  assert.equal(r.t.noDogsSub, 'Not inside or on the patio');
  // The page script: no "Open after midnight?" row and a split day (not 6 – 10 PM) for a tour; no service dogs pre-tick.
  assert.match(CLIENT, /if \(C\.tour\) return '';/);
  assert.match(CLIENT, /if \(TOUR && !late\) \{/);
  assert.match(CLIENT, /if \(TOUR && S\.noDogs && S\.sdogAuto\) \{ S\.badges\.service_dogs = false;/);
  assert.match(CLIENT, /if \(TOUR\) \(C\.tourFoodBadges \|\| \['patio', 'live_music', 'sports_tv', /);
  // Help: one time from the first departure to the last return.
  const hb = helpBot((await get(`/owner/${t}/setup`)).text);
  assert.match(hb.topic('tour-booking-only').a, /Set one time from your first departure to when the last trip gets back/);
  assert.doesNotMatch(hb.topic('tour-booking-only').a, /Add a second time/);
  assert.match(hb.topic('tour-booking-only').aFr, /une seule plage/);
  // Saving Who can come with Patio, Live music and Sports TV off (what the page script sends) takes them off.
  assert.ok(app.getVenue(v.id).patio);
  ok(await change(t, { badges: { patio: false, live_music: false, sports_tv: false } }));
  const g = app.getVenue(v.id);
  assert.ok(!g.patio && !g.live_music && !g.sports_tv, JSON.stringify([g.patio, g.live_music, g.sports_tv]));
});

test('B4: Good to know from research says so, and is marked as research (a tap replaces it); not for a cocktail lounge', async () => {
  const { v, t } = await jess();
  assert.ok(app.ownerVisitResearchKeys(v.id).includes('good_to_know'));
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(c.visitResearch.includes('good_to_know'));
  assert.match(c.t.bringGuess, /We found this online/);
  assert.match(cfgOf((await get(`/fr/owner/${t}/setup`)).text).t.bringGuess, /Nous avons trouvé ceci en ligne/);
  assert.equal(c.cur.visit_rows.good_to_know, 'Meet at the trailhead on Silver Star Road; dogs welcome. One guide per 5 guests.', 'the whole line is pre-filled');
  assert.match(CLIENT, /id="suBringGuess"/);
  const ck = mk('cocktail');
  research(ck.id, [{ label: 'Good to know', text: 'Dress code: smart casual' }]);
  assert.ok(!app.ownerVisitResearchKeys(ck.id).includes('good_to_know'));
});

test('B5: a rejected price keeps what was typed (every price box)', () => {
  assert.match(CLIENT, /var PRICE_BOXES = \['suTprice', 'suTpriv', 'suCfee', 'suFee'\];/);
  for (const id of ['suTprice', 'suTpriv', 'suCfee']) assert.match(CLIENT, new RegExp(`field\\('${id}', [^,]*?T\\.\\w+, boxVal\\('${id}'`)); // tour test 14: the private box's label can be "Private lessons"
  assert.equal((CLIENT.match(/field\('suFee', T\.feeLabel, boxVal\('suFee'/g) || []).length, 2);
  assert.doesNotMatch(CLIENT, /isNaN\(tp\.price\) \? '' : String\(tp\.price\)/);
});

test('B6: the edit page and the meeting spot read like a tour; a restaurant keeps its words', async () => {
  const { t } = await jess();
  const e = (await get(`/owner/${t}`)).text;
  // Tour test 15 (Dayton, 2026-11-18): no meeting-spot tile for tours.
  assert.doesNotMatch(e, /Help people find your meeting spot/);
  assert.match(e, /Special trips, classes and more/);
  assert.match(e, /Dogs, parking, access, price range…/);
  assert.match(e, /your trips, your guides and your guests/);
  assert.match(e, /of one of your trips\?/);
  assert.match(e, /A photo of your price list, or just a few words/);
  assert.doesNotMatch(e, /Stand on the sidewalk or street/);
  assert.doesNotMatch(e, /your space, food, drinks/);
  const ef = (await get(`/fr/owner/${t}`)).text;
  assert.doesNotMatch(ef, /Aidez les gens à trouver votre point de rencontre/);
  assert.match(ef, /Sorties spéciales, ateliers et plus/);
  const r = mk('restaurant');
  const re = (await get(`/owner/${tokenFor(r.id)}`)).text;
  assert.match(re, /Help people find your door/);
  assert.match(re, /Music, tastings, markets and more/);
  assert.match(re, /A photo of your menu, or just a few words/);
  // The visits line on the setup and edit page: "booking and tours & prices", never "menu".
  const stats = require('../owner-stats.js');
  assert.match(stats.ownerStatsHtml({ views: 3, clicks_total: 2, clicks: {}, prev: null }, 'en', { short: true, listKind: 'tours' }), /booking and tours &amp; prices/);
  assert.match(stats.ownerStatsHtml({ views: 3, clicks_total: 2, clicks: {}, prev: null }, 'en', { short: true }), /booking and menu/);
  assert.match(ARRIVAL, /venue\.type === 'tour'/);
});

test('B7: Build My Trip: French motoneige and quad, ATV words, a named teen age, no snowmobile trail as a walk, the card price', async () => {
  // French words.
  const fr = (q) => trFr.translateFrenchTrip ? trFr.translateFrenchTrip(q) : null;
  const plans = {};
  const v = mk('tour', { name: 'Lavington Sled & Quad', cuisine: 'Snowmobile & ATV tours', region: 'kelowna', description: 'Guided snowmobile tours in winter and ATV tours in summer above Kelowna.' });
  const t = tokenFor(v.id);
  ok(await change(t, { hours: WK('09:00', '17:00'), hours_checked: true, tour_info: { year: 'all' } }));
  ok(await change(t, { tour_info: { kinds: ['snowmobile', 'adventure'], length: '2-3h', age: '12', adult: true } }));
  ok(await change(t, { tour_price: 149 }));
  mk('outdoor', { name: 'Lavington Snowmobile Trail', cuisine: 'Snowmobile trail', region: 'kelowna', description: 'A groomed snowmobile trail network and staging area, with a loop trail for walks in summer.' });
  const names = (p) => itemsOf(p).map((x) => x.venue.name);
  // Jess's tour (earlier tests) kept her ATV words too: either sled-and-ATV outfitter answers.
  const sled = (p) => names(p).some((n) => n === 'Lavington Sled & Quad' || n === 'Vernon Backcountry Sleds');
  // ATV in July finds her (her own ATV words were kept).
  plans.atv = await plan('ATV tour in Vernon on July 17 2027');
  assert.ok(sled(plans.atv), JSON.stringify(names(plans.atv)));
  assert.doesNotMatch(JSON.stringify([plans.atv.warnings || [], plans.atv.notes || []]), /No ATV tour matched/, 'not said under the ATV tour planned for it');
  plans.jeep = await plan('Jeep or quad tour near Vernon on August 14 2027');
  assert.ok(sled(plans.jeep), JSON.stringify(names(plans.jeep)));
  // French: « motoneige », « randonnée en motoneige » (not a hike), « quad ».
  plans.moto = await plan('Motoneige à Vernon le samedi 16 janvier 2027');
  assert.ok(sled(plans.moto), JSON.stringify(names(plans.moto)));
  plans.rando = await plan('Une randonnée en motoneige à Kelowna le 16 janvier 2027');
  assert.ok(sled(plans.rando), JSON.stringify(names(plans.rando)));
  assert.ok(!names(plans.rando).includes('Lavington Snowmobile Trail'), 'no trail walk for a snowmobile tour');
  plans.quad = await plan('Quad à Vernon le 17 juillet 2027');
  assert.ok(sled(plans.quad), JSON.stringify(names(plans.quad)));
  // A 14-year-old: her 12+ tour is planned; a 16+ one is not; the trail is not planned as a walk.
  plans.teen = await plan('Snowmobile tour in Kelowna January 16 2027 with our 14-year-old');
  assert.ok(names(plans.teen).includes('Lavington Sled & Quad'), JSON.stringify(names(plans.teen)));
  assert.ok(!names(plans.teen).includes('Lavington Snowmobile Trail'), JSON.stringify(names(plans.teen)));
  assert.deepEqual(tp.requestKidAges('with our 14 year old'), [14]);
  assert.deepEqual(tp.requestKidAges('kids aged 8 and 11'), [8, 11]);
  assert.deepEqual(tp.requestKidAges('a family day with kids'), []);
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: '12' }, { queryText: 'with our 14 year old' }), true);
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: '16' }, { queryText: 'with our 14 year old' }), false);
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: '12' }), false, 'no age named: the safe read, as before');
  // The trip card's price: her own "From $149".
  const stop = itemsOf(plans.teen).find((x) => x.venue.name === 'Lavington Sled & Quad');
  assert.equal(stop.venue.cost && stop.venue.cost.cents, 14900);
  assert.equal(stop.venue.cost.label, 'Tour');
  const V3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(V3, /cost\.label === 'Tour' \? \(french \? 'À partir de ' : 'From '\)/);
  // The kind words themselves.
  assert.ok(tr.inferPlannerKinds ? tr.inferPlannerKinds({ type: 'tour', name: 'X', cuisine: 'Jeep tours', description: '' }).includes('atv') : true);
});

test('B8: Help answers the questions it missed (ATV, two lengths, winter/summer prices, same day by phone, drivers, the card price)', async () => {
  const { t } = await jess();
  const hb = helpBot((await get(`/owner/${t}/setup`)).text);
  const want = {
    'We do ATV tours, which one do I pick?': 'tour-kinds-other', 'jeep tours are not on the list': 'tour-kinds-other',
    'we have a 2 hour and a 4 hour trip, which length?': 'tour-lengths', 'our trips are different lengths': 'tour-lengths',
    'winter $189, summer $149': 'tour-two-prices', 'we charge $189 in winter and $149 in summer': 'tour-two-prices', 'different prices in winter and summer': 'tour-two-prices',
    'same day bookings by phone only': 'tour-same-day',
    'drivers are 16+ with a licence, passengers 8+': 'tour-drivers',
    'should the card say 149': 'tour-price',
    'we run winter and summer and close in spring': 'tour-season',
  };
  for (const [q, id] of Object.entries(want)) assert.equal(hb.best(q).id, id, q);
  // French.
  const fb = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(fb.best('les conducteurs et les passagers n’ont pas le même âge').id, 'tour-drivers');
  assert.equal(fb.best('prix d’hiver et prix d’été').id, 'tour-two-prices');
  // The answers say where things go.
  assert.match(hb.topic('tour-lengths').a, /shortest/);
  assert.match(hb.topic('tour-two-prices').a, /lowest/);
  assert.match(hb.topic('tour-two-prices').a, /Your tours and prices/);
  assert.match(hb.topic('tour-drivers').a, /Good to know/);
  assert.match(hb.topic('tour-same-day').a, /Good to know/);
  // No chip offers the menu question in menu words.
  assert.doesNotMatch(JSON.stringify(hb.topic('menu-add').q), /\bmenu\b/i);
});

test('B9: the closed line once on a card (every type), and the Season line and header with the spring break, EN/FR', async () => {
  const { v, t } = await jess();
  ok(await change(t, { hours: WK('09:00', '17:00'), hours_checked: true, open_months: '12-15:09-30', tour_info: { year: 'seasonal' } }));
  ok(await change(t, { closures: [{ from: '04-01', to: '05-31', note: 'Between seasons, back June 1', yearly: true }] }));
  const lines = app.tourVisitLines(app.getVenue(v.id));
  assert.equal(lines.Season.en, 'Dec 15 – Mar 31 and Jun 1 – Sep 30.');
  assert.equal(lines.Season.fr, 'Du 15 déc. au 31 mars et du 1er juin au 30 sept.');
  const en = plain(page(v, 'en', new Date('2027-01-15T19:00:00Z')));
  assert.match(en, /Season Dec 15 – Mar 31 and Jun 1 – Sep 30\./);
  assert.match(en, /Open December 15 – March 31 and June 1 – September 30 each year/);
  const fr = plain(page(v, 'fr', new Date('2027-01-15T19:00:00Z')));
  assert.match(fr, /Ouvert du 15 décembre au 31 mars et du 1er juin au 30 septembre chaque année/);
  // A short closure (Christmas) never splits it.
  assert.equal(app.openSeasonStretches(v.id, '12-15:09-30').length, 2);
  // The card: one closed line.
  const chunk = '<li class="venue-card" data-venue-category="tour"><p class="season-tag season-tag-closed"><span>⏸</span> Closed · reopens December 15</p></li>';
  assert.doesNotMatch(app.cardSeasonOnce(chunk, { state: 'seasonal', text: 'Closed for the season · Reopens Dec 15' }), /season-tag-closed/);
  assert.doesNotMatch(app.cardSeasonOnce(chunk.replace('tour', 'restaurant'), { state: 'seasonal', text: 'x' }), /season-tag-closed/);
  const cat = await get('/vernon/tours');
  const card = (cat.text.split('<li class="venue-card"').slice(1).find((x) => x.includes('Vernon Backcountry Sleds')) || '');
  assert.ok(card);
  const closedSaid = (card.match(/[Cc]losed (?:for the season|·|today)/g) || []).length;
  assert.ok(closedSaid <= 1, card.replace(/\s+/g, ' ').slice(0, 900));
});

test('B10 + B11: the booking link is asked once, and the French wording table', async () => {
  const { t } = await jess();
  assert.match(CLIENT, /\(TOUR && \(CUR\.booking_url \|\| C\.bookingKnown \|\| String\(S\.bookUrl \|\| ''\)\.trim\(\) \|\| S\.tour\.noBook\) \? ''/);
  const f = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(f.t.labels.hours, 'Vos heures et votre saison');
  assert.match(f.t.allYearClosed, /^Nous offrons des sorties une partie de l’année seulement$/);
  assert.match(f.t.tpriceQ, /^Combien coûte une sortie par personne[  ]\?$/);
  assert.match(f.t.knownQ, /^Pour quoi êtes-vous connus[  ]\?$/);
  const ft = require('../french-text.js');
  const pat = ft.FR_PATTERNS.find(([re]) => re.test('Tours and experiences in and from Vernon, booked with local operators.'));
  assert.ok(pat);
  assert.equal(pat[1](pat[0].exec('Tours and experiences in and from Vernon, booked with local operators.')), 'Visites et expériences à Vernon et au départ de Vernon, à réserver auprès d’entreprises locales.');
  // The help says the French screen names.
  const fb = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  assert.match(fb.topic('tour-season').aFr, /Vos heures et votre saison/);
  assert.match(fb.topic('tour-season').aFr, /Nous offrons des sorties une partie de l’année seulement/);
});

test('the other setups still load (pub, restaurant, café, winery, brewery, distillery, cocktail), with their own words', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail']) {
    const o = mk(type);
    const g = await get(`/owner/${tokenFor(o.id)}/setup`);
    assert.equal(g.status, 200, type);
    const c = cfgOf(g.text);
    assert.ok(!c.tour, type);
    assert.notEqual(c.t.labels.menu, 'Your tours and prices', type);
    assert.notEqual(c.t.noDogsSub, 'Not on any trip', type);
  }
});
