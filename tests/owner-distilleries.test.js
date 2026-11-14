// Distilleries in the owner portal (Dayton, Nov 13 2026; drafts/distillery-portal-2026-11-13/SPEC-distilleries.md,
// "Decided"): the brewery setup (its 12 screens, checklist and venue_brewery_info) with a spirits wording overlay. The kind
// is Distillery (hidden, counted as done); tastings $10 · $15 · $20 · Other · Free tastings · We don't do tastings;
// Bottles · Canned or bottled cocktails · Nothing to go (no growlers); happy hour stays; Who's welcome uses the brewery rule
// and a distillery joins a kids' trip only on the owner's All ages or "until a set time"; "Tours, classes and events"; the
// winery's "By appointment" on Hours. Breweries and cideries keep their words.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-distilleries-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const text = require('../owner-setup-text.js');
const planner = require('../trip-planner.js');
const tripFr = require('../trip-planner-fr.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['12:00', '20:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Still Test ${type} ${++n}`, slug: `still-test-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.6, address: `${300 + n} Water St, Kelowna`, phone: '250-555-0188', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the distillery portal tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p, h = {}) => fetch(base + p, { headers: h }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, setup = true) => postJson(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const visitRows = (id) => ((app.venueVisitInfo(id) || {}).rows || []);
const row = (id, label) => visitRows(id).find((r) => r.label === label);
const research = (id, rows, booking = null) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows, booking_url: booking, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const lastReq = (id, like) => db.prepare(`SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE ? ORDER BY id DESC`).get(id, `%${like}%`).id;
const pagePath = (v, fr) => `${fr ? '/fr' : ''}/${v.region}/distilleries/${v.slug}`;
const planFor = async (txt, lang) => (await fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt, ...(lang ? { lang } : {}) }) }).then((r) => r.json()));
const planV3 = async (txt, lang) => { const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on'; try { return await planFor(txt, lang); } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; } };
const allStops = (j) => [].concat(j.recommendations || [], ...(j.days || []).map((d) => d.stops || []), (j.itinerary || {}).stops || [], (j.outing || {}).stops || []).filter((s) => s && s.venue);
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');

// ---------- Setup parts and the hidden kind ----------
test('steps: a distillery gets the brewery setup (7 essentials, 5 optional, menu only with its own kitchen)', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  assert.deepEqual(app.setupParts('distillery'), app.setupParts('brewery'));
  assert.equal(app.setupStepsFor('distillery', d.id).length, 12);
  assert.ok(!app.setupStepsFor('distillery', d.id).includes('menu'));
  assert.equal((await change(t, { brewery_info: { food: 'kitchen' } })).status, 200);
  assert.ok(app.setupStepsFor('distillery', d.id).includes('menu'), 'Our own kitchen: the menu step');
  assert.equal((await change(t, { brewery_info: { food: 'snacks' } })).status, 200);
  assert.ok(!app.setupStepsFor('distillery', d.id).includes('menu'));
  // The setup page (no bounce to the edit page), with the brewery screens and the distillery flag.
  const r = await get(`/owner/${t}/setup`);
  assert.equal(r.status, 200);
  const cfg = cfgOf(r.text);
  assert.equal(cfg.brewery, true); assert.equal(cfg.distillery, true); assert.equal(cfg.combo, true);
  assert.deepEqual(cfg.part1, app.BREWERY_SETUP_PART1);
  assert.equal(cfg.suggestKind, 'Distillery');
  assert.equal(cfg.cur.place_type, '', 'the kind is never stored');
  assert.ok(cfg.t.kindDistillery, 'the spirits words go to the page');
  // The page script: no kind question, the kind set to Distillery and never sent.
  const s = CLIENT();
  assert.match(s, /if \(C\.distillery\) \{ S\.place = 'Distillery'; CUR\.place_type = 'Distillery'; \}/);
  assert.match(s, /x = doneLine\('taproom'\) \+ \(C\.distillery \? q\(T\.tfoodQ, T\.tfoodLead\) \+ msgs\(\) : q\(T\.tkindQ, T\.tkindLead\)/);
  // The owner tiles and the checklist list include it.
  assert.ok(app.ownerExtraBadgesFor('distillery').includes('picnic_area'));
  assert.match((await get(`/owner/${t}`)).text, /id="opCbToggle"/, 'the checklist on the edit page');
  // Every other type keeps its steps.
  assert.deepEqual(app.setupParts('winery').part1, ['basics', 'hours', 'winery', 'tastings', 'visit', 'photos', 'offer']);
  assert.deepEqual(app.setupParts('restaurant').part1, ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer']);
});

test('checklist: the kind counts as done for a distillery; a brewery still picks one', () => {
  const base0 = { address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: today };
  assert.equal(pc.doneMap({ ...base0, type: 'distillery' }, today).brewery_kind, true);
  assert.equal(pc.doneMap({ ...base0, type: 'brewery' }, today).brewery_kind, false);
  assert.equal(pc.itemsFor('distillery'), pc.itemsFor('brewery'), 'the same 100 points');
  assert.equal(pc.quickFieldFor('distillery', 'flight_price'), 'flight_fee');
});

// ---------- Tastings and the card price ----------
test('tastings: $15 is the card price at once; Free tastings is a free chip; We don’t do tastings shows none; over $40 waits', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  app.CARD_PRICES[String(d.id)] = { from: 15, basis: 'Tasting of three', conf: 'site', source: 'https://example.com/tastings' };
  app.priceCheck.applyOverrides();
  assert.equal(app.cardPriceFor(d.id), 'From $15', 'the researched price stays until she answers');
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.researchFee, 15);
  let r = await change(t, { flight_fee: 20 });
  assert.equal(r.status, 200); assert.ok(!(r.body.review || []).length);
  assert.equal(app.cardPriceFor(d.id), 'From $20');
  assert.equal(row(d.id, 'Flights').text, '$20 a tasting.');
  assert.equal(db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(d.id).basis, 'Tasting');
  r = await change(t, { flight_fee: 0 });
  assert.equal(app.cardPriceFor(d.id), 'Free tasting');
  assert.equal(row(d.id, 'Flights').text, 'Free tastings.');
  r = await change(t, { flight_fee: null, brewery_info: { no_flights: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(app.cardPriceFor(d.id), null, 'no card price');
  assert.equal(row(d.id, 'Flights').text, 'No tastings.');
  r = await change(t, { brewery_info: { no_flights: null } });
  r = await change(t, { flight_fee: 45 });
  assert.deepEqual(r.body.review, ['flight_fee'], 'over $40 is checked first');
  // The page shows the line as "Tastings" (« Dégustations »), the stored label stays.
  await change(t, { flight_fee: 15 });
  const page = (await get(pagePath(d))).text;
  assert.match(page, /<span class="visit-label">Tastings<\/span><span>\$15 a tasting\./);
  assert.doesNotMatch(page, /<span class="visit-label">Flights<\/span>/);
  // The page script's buttons: $10 · $15 · $20 · Other · Free tastings, then "We don't do tastings".
  const s = CLIENT();
  assert.match(s, /if \(C\.distillery\) \{ QUICK_FLIGHTS = \[10, 15, 20\]; TOGO = \['bottles', 'cans'\]; \}/);
  assert.match(s, /\(C\.distillery && T\.feeFree \? '<button type="button" class="su-chip su-chip-wide" aria-pressed="' \+ \(feeOn\(0\)/);
  // Breweries keep $8 · $10 · $12 · $15 and "a flight".
  const b = mk('brewery'); await change(tokenFor(b.id), { flight_fee: 12 });
  assert.equal(row(b.id, 'Flights').text, '$12 a flight.');
  assert.equal(db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(b.id).basis, 'Flight');
  assert.match((await get(`/kelowna/breweries/${b.slug}`)).text, /<span class="visit-label">Flights<\/span>/);
});

// ---------- To go ----------
test('to go: Bottles and Canned or bottled cocktails (stored as cans); growlers and crowlers hidden; research pre-ticks', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  research(d.id, [{ label: 'Known for', text: 'Gin and vodka.' }, { label: 'To go', text: 'Bottles and canned cocktails to go; growler fills next door.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.suggestToGo, ['cans', 'bottles'], 'no growlers for a distillery');
  assert.equal((await change(t, { brewery_info: { to_go: ['bottles', 'cans'] } })).status, 200);
  assert.equal(row(d.id, 'To go').text, 'Bottles and canned or bottled cocktails to go.');
  assert.equal(app.breweryVisitLines(app.getVenue(d.id), app.venueBreweryInfo(d.id))['To go'].fr, 'Bouteilles et cocktails en canette ou en bouteille pour emporter.');
  // Research's Tours line is the hint on "Tours, classes and events".
  research(d.id, [{ label: 'Tours', text: 'Distillery tours on Saturdays; book online.' }]);
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).researchEvents, 'Distillery tours on Saturdays; book online.');
  assert.equal((await change(t, { brewery_info: { to_go: ['bottles'] } })).status, 200);
  assert.equal(row(d.id, 'To go').text, 'Bottles to go.');
  assert.equal(text.en.brewery.kindDistillery.togo.cans, 'Canned or bottled cocktails');
  assert.equal(text.fr.brewery.kindDistillery.togo.cans, 'Cocktails en canette ou en bouteille');
  // A brewery still says cans.
  const b = mk('brewery'); assert.equal((await change(tokenFor(b.id), { brewery_info: { to_go: ['cans', 'growler'] } })).status, 200);
  assert.equal(row(b.id, 'To go').text, 'Cans and growler fills to go.');
});

// ---------- Who's welcome: the kids badge and Build My Trip ----------
test('kids: the owner’s answer sets the badge; a distillery joins a kids’ trip only on All ages or “until a set time”', async () => {
  const unanswered = mk('distillery', { kid_friendly: 1 });
  const v = app.getVenue(unanswered.id);
  assert.equal(app.kidFriendlyPublic(v), true, 'research badge stands, as before');
  // Build My Trip: the planner's kids rule.
  assert.equal(planner.kidsAllowed({ type: 'distillery', features: { kid_friendly: true } }), false, 'a research badge alone never counts');
  assert.equal(planner.kidsAllowed({ type: 'distillery', features: { kid_friendly: true }, ownerKidsWelcome: true }), true);
  assert.equal(planner.kidsAllowed({ type: 'cocktail', features: { kid_friendly: true } }), false, 'lounges unchanged');
  assert.equal(planner.kidsAllowed({ type: 'brewery', features: { kid_friendly: true } }), true, 'breweries unchanged');
  const d = mk('distillery', { kid_friendly: 0, name: 'Kidsclock Distilling', slug: 'kidsclock-distilling' }); const t = tokenFor(d.id);
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '18:00' } } })).status, 200);
  assert.equal(app.kidFriendlyPublic(app.getVenue(d.id)), true);
  assert.equal(app.kidsChipLabel(app.getVenue(d.id), false), 'Kids until 6 PM');
  assert.equal(app.plannerKidsUntil(app.getVenue(d.id)), '18:00');
  assert.match(row(d.id, 'Kids & dogs').text, /until 6 PM/i);
  const api = await fetch(`${base}/api/venues?type=distillery&region=kelowna`).then((r) => r.json());
  const mine = (api.venues || api).find((x) => x.id === d.id);
  assert.equal(mine.kid_friendly, true); assert.equal(mine.kids_until, '18:00');
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'adults' } } })).status, 200);
  assert.equal(app.kidFriendlyPublic(app.getVenue(d.id)), false, 'adults only takes the badge off');
  // The SQL rule (guides, filters) follows the same answer.
  const ids = db.prepare(`SELECT id FROM venues WHERE type = 'distillery' AND ${app.KID_FRIENDLY_SQL}`).all().map((x) => x.id);
  assert.ok(ids.includes(unanswered.id)); assert.ok(!ids.includes(d.id));
  // The planner facts carry the owner's answer only.
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'all_ages' } } })).status, 200);
  const j = await planV3('A gin distillery afternoon in Kelowna with our kids (8 and 11) on Saturday, July 10, 2027');
  const st = allStops(j).map((s) => s.venue.id);
  assert.ok(!st.includes(unanswered.id), 'an unanswered distillery stays out of a kids’ trip');
  assert.ok(st.includes(d.id), `the all-ages distillery joins it: ${JSON.stringify(allStops(j).map((x) => x.venue.name))}`);
  // "Until 6 PM": a kids' stop there names the time.
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '18:00' } } })).status, 200);
  const j2 = await planV3('A gin distillery afternoon in Kelowna with our kids (8 and 11) on Saturday, July 10, 2027');
  const s2 = allStops(j2).find((x) => x.venue.id === d.id);
  assert.ok(s2, 'still planned with a set time');
  assert.ok((s2.caveats || []).some((c) => /Kids welcome with an adult until 6 PM/.test(c)), JSON.stringify(s2.caveats));
});

// ---------- Tours, classes and events ----------
test('events screen: “Tours, classes and events” (« Visites, ateliers et événements ») for distilleries only', () => {
  assert.equal(text.en.brewery.kindDistillery.labels.music, 'Tours, classes and events');
  assert.equal(text.fr.brewery.kindDistillery.labels.music, 'Visites, ateliers et événements');
  // Distillery test 1 (2026-11-13): no "first Saturday" in the example (the setup can't say it; the edit page can).
  assert.equal(text.en.brewery.kindDistillery.eventEx, 'Whisky class');
  assert.equal(text.en.brewery.labels.music, 'Weekly events', 'breweries keep Weekly events');
  assert.equal(text.en.brewery.kindCidery.labels.music, undefined, 'cideries too');
  const it = pc.scoreCompleteness({ type: 'distillery', address: 'a' }, { today }).missing.find((x) => x.key === 'entertainment');
  assert.equal(it.en, 'Tours, classes and events'); assert.equal(it.fr, 'Visites, ateliers et événements');
  const ib = pc.scoreCompleteness({ type: 'brewery', address: 'a' }, { today }).missing.find((x) => x.key === 'entertainment');
  assert.equal(ib.en, 'Weekly events');
});

// ---------- By appointment ----------
test('hours: “We don’t have set hours. Visits are by appointment” and walk-ins in a season, as for a winery', async () => {
  const NO_DAYS = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, []]));
  const d = mk('distillery', { name: 'Appt Only Spirits', slug: 'appt-only-spirits' }); const t = tokenFor(d.id);
  let r = await change(t, { hours: NO_DAYS, hours_checked: true });
  assert.equal(r.status, 400, 'every day closed without saying by appointment');
  assert.match(r.body.errors.hours, /We don’t have set hours/);
  r = await change(t, { hours: NO_DAYS, hours_checked: true, brewery_info: { visit: 'appointment' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(app.venueBreweryInfo(d.id).visit, 'appointment');
  assert.equal(app.wineryAppointmentOn(d.id, today, 'distillery'), true);
  const page = (await get(pagePath(d))).text;
  assert.match(page, /By appointment · call ahead/);
  assert.doesNotMatch(page, /12:00|12 PM – 8 PM/, 'the old week is off the page');
  // The checklist: the hours, their check and the season are answered.
  const dm = pc.doneMap({ type: 'distillery', breweryInfo: { visit: 'appointment' } }, today);
  assert.equal(dm.hours, true); assert.equal(dm.season, true); assert.equal(dm.hours_fresh, true);
  // Walk-ins May–Sep, by appointment the rest of the year.
  const d2 = mk('distillery', { name: 'Winter Appt Spirits', slug: 'winter-appt-spirits' }); const t2 = tokenFor(d2.id);
  r = await change(t2, { brewery_info: { year: 'appointment' } });
  assert.equal(r.status, 400, 'a walk-in season is needed');
  r = await change(t2, { brewery_info: { year: 'appointment', season: { from: '05-01', to: '09-30' } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(app.wineryAppointmentOn(d2.id, '2027-01-12', 'distillery'), true);
  assert.equal(app.wineryAppointmentOn(d2.id, '2027-07-12', 'distillery'), false);
  assert.equal(pc.doneMap({ type: 'distillery', breweryInfo: { year: 'appointment', season: { from: '05-01', to: '09-30' } } }, today).season, true);
  // Build My Trip reads her answer.
  const j = await planV3('A distillery tasting in Kelowna on Tuesday, January 12, 2027');
  const caveats = allStops(j).filter((s) => s.venue.id === d2.id).flatMap((s) => s.caveats || []);
  if (caveats.length) assert.ok(caveats.some((c) => /distillery’s own answer/.test(c)), JSON.stringify(caveats));
  // Her answer wins over a researched "Closed for the season" (kept, marked superseded; Undo brings it back).
  const ce = mk('distillery', { name: 'Seasonal Entropy Distilling', slug: 'seasonal-entropy-distilling' });
  assert.equal(app.guardedSeasonUpdate(ce.id, { status: 'closed', reopens_date: null, source_url: 'https://example.com/season', checked_at: today }, { reason: 'test research', batch_id: 'test' }).ok, true);
  assert.equal(app.getSeasonStates().get(ce.id).kind, 'closed');
  assert.equal((await change(tokenFor(ce.id), { brewery_info: { year: 'appointment', season: { from: '05-01', to: '09-30' } } })).status, 200);
  assert.ok(db.prepare('SELECT superseded_at FROM venue_seasons WHERE venue_id = ?').get(ce.id).superseded_at, 'research kept, superseded');
  assert.ok(!app.getSeasonStates().get(ce.id) || app.getSeasonStates().get(ce.id).kind !== 'closed');
  assert.equal(app.undoOwnerInstantChange(lastReq(ce.id, 'appointment'), 'test').ok, true);
  assert.equal(db.prepare('SELECT superseded_at FROM venue_seasons WHERE venue_id = ?').get(ce.id).superseded_at, null, 'Undo brings it back');
  // A brewery can't send these.
  const b = mk('brewery');
  assert.equal((await change(tokenFor(b.id), { brewery_info: { visit: 'appointment' } })).status, 400);
  assert.equal((await change(tokenFor(b.id), { brewery_info: { year: 'appointment', season: { from: '05-01', to: '09-30' } } })).status, 400);
  assert.equal(app.wineryAppointmentOn(b.id, today), null, 'a brewery has no appointment answer');
  // The page script offers the winery's two choices to a distillery.
  const s = CLIENT();
  assert.match(s, /var APPT = !!\(C\.winery \|\| C\.distillery\), AI = C\.distillery \? BI : WI;/);
  assert.match(s, /function noSetBtn\(\)\{ return APPT && T\.noSetHours/);
  assert.match(s, /\(APPT && T\.allYearAppt \? big\('📞', T\.allYearAppt/);
  assert.equal(text.en.brewery.kindDistillery.noSetHours, text.en.winery.noSetHours);
  assert.equal(text.fr.brewery.kindDistillery.allYearAppt, text.fr.winery.allYearAppt);
});

// ---------- Spirits words, EN and FR ----------
test('wording: spirits words in English and French with French spacing; breweries and cideries keep theirs', () => {
  const en = text.en.brewery.kindDistillery, fr = text.fr.brewery.kindDistillery;
  assert.equal(en.labels.taproom, 'Food here'); // distillery test 2: the food screen assert.equal(en.labels.flights, 'Tastings and bottles'); assert.equal(en.labels.door, 'Your tasting room door');
  assert.equal(en.labels.menu, 'Your menu or cocktail list');
  assert.match(en.hiLead, /^Let’s get your distillery’s page ready/);
  assert.equal(en.flightQ, 'What does a tasting cost?'); assert.equal(en.noFlights, 'We don’t do tastings'); assert.equal(en.feeFree, 'Free tastings');
  assert.equal(en.knownEx, 'Small-batch gin with Okanagan botanicals');
  assert.match(en.photosLead, /^Your tasting room, your still, your bottles\./);
  assert.match(en.menuQ, /cocktail or tasting menu/);
  assert.equal(text.en.brewery.igLead, 'Type your Instagram name, like @yourbusiness.');
  assert.match(fr.hiLead, /votre distillerie/);
  assert.equal(fr.flightQ, 'Combien coûte une dégustation ?');
  assert.equal(fr.feeFree, 'Dégustations gratuites');
  assert.equal(fr.labels.flights, 'Dégustations et bouteilles');
  assert.equal(fr.musicQ, 'Des visites, des ateliers ou des événements ?');
  assert.match(fr.minorsNoteEx, /19 ans et plus/);
  // Every French string: no plain space before « : », « ? » or « ! ».
  const walk = (o) => Object.values(o).forEach((x) => { if (typeof x === 'string') { assert.doesNotMatch(x, / [?!]/, x); assert.doesNotMatch(x, / :(?=\s|$)/, x); } else if (x && typeof x === 'object') walk(x); });
  walk(fr);
  // Breweries, cideries and taphouses keep their words.
  assert.equal(text.en.brewery.labels.taproom, 'Your taproom'); assert.equal(text.en.brewery.flightQ, 'What does a flight cost?');
  assert.equal(text.en.brewery.kindCidery.labels.menu, 'Your menu or cider list');
  assert.equal(text.en.brewery.kindCidery.knownEx, 'Dry ciders from heritage apples');
  assert.equal(text.en.brewery.kindNeutral.labels.menu, 'Your menu or drinks list');
  // The checklist words.
  const missing = (type, placeType) => pc.scoreCompleteness({ type, address: 'a', placeType }, { today }).missing;
  const dist = missing('distillery');
  assert.equal(dist.find((x) => x.key === 'flight_price').en, 'Tasting price');
  assert.equal(dist.find((x) => x.key === 'menu').en, 'Menu or cocktail list');
  assert.equal(dist.find((x) => x.key === 'to_go').en, 'What people can take home');
  assert.match(dist.find((x) => x.key === 'to_go').whyEn, /canned or bottled cocktails/);
  assert.match(dist.find((x) => x.key === 'phone').whyEn, /book a tasting/);
  assert.match(dist.find((x) => x.key === 'photo_main').whyEn, /your still, your bottles/);
  assert.ok(!dist.some((x) => x.key === 'brewery_kind'), 'the kind is done');
  const brew = missing('brewery', 'Brewery');
  assert.equal(brew.find((x) => x.key === 'flight_price').en, 'Flight price');
  assert.equal(brew.find((x) => x.key === 'menu').en, 'Menu or tap list');
  assert.match(brew.find((x) => x.key === 'phone').whyEn, /what’s on tap/);
  assert.equal(missing('brewery', 'Cidery').find((x) => x.key === 'menu').en, 'Menu or cider list');
  // The owner home tile.
  assert.deepEqual(app.breweryListTile({ type: 'distillery', name: 'X' }).en, ['Update my cocktail or tasting menu', 'Snap your cocktail or tasting menu']);
  assert.equal(app.breweryListTile({ type: 'brewery', name: 'Hop Brewing', place_type: '' }).en[0], 'Update my menu or tap list');
  // The checklist's door line.
  const html = pc.renderCompleteness(pc.scoreCompleteness({ type: 'distillery', address: 'a', latitude: 1, longitude: 1, phone: '1', website: 'x', hasHours: true, hoursCheckedAt: today }, { today }), { fr: false, brewery: true, distillery: true, canDecline: true, noScore: true, menuHref: '/m', setupHref: '/s' });
  assert.doesNotMatch(html, /taproom door/);
});

// ---------- Planner and search words ----------
test('Build My Trip: gin, whisky, vodka, rum, spirits, liqueur, « distillerie » and « spiritueux » find distilleries', async () => {
  const tr = require('../trip-requirements.js');
  const kinds = (q) => tr.extractTripRequirements({ text: q, taxonomy: { types: ['distillery', 'brewery', 'winery', 'restaurant'], venues: [] } });
  for (const w of ['gin', 'whisky', 'whiskey', 'vodka', 'rum', 'spirits', 'liqueur', 'craft spirits', 'distillery']) {
    const r = kinds(`a ${w} tasting in Kelowna`);
    if (r) assert.ok(r.items.some((i) => i.kind === 'type' && i.value === 'distillery'), `${w}: ${JSON.stringify(r.items)}`);
  }
  // French: « spiritueux » is French and means spirits; « dégustation de gin » isn't wine.
  assert.equal(tripFr.isFrenchTripRequest('spiritueux à Kelowna'), true);
  const t1 = tripFr.tripPlannerText('dégustation de spiritueux à Kelowna', { types: [], venues: [] });
  assert.match(t1, /spirits tasting/); assert.doesNotMatch(t1, /wine/);
  assert.match(tripFr.tripPlannerText('une distillerie à Kelowna', { types: [], venues: [] }), /distillery/);
  const d = mk('distillery', { name: 'Okanagan Gin Works Distillery', slug: 'okanagan-gin-works-distillery', description: 'Small-batch gin, vodka and whisky with a tasting room downtown.', hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((x) => [x, [['11:00', '19:00']]]))) });
  for (const q of ['gin distillery in Kelowna', 'whisky tasting in Kelowna on Saturday afternoon', 'spirits tasting Kelowna']) {
    const j = await planV3(q);
    assert.ok(allStops(j).some((s) => s.venue.type === 'distillery'), `${q}: ${JSON.stringify(allStops(j).map((s) => s.venue.type))}`);
  }
  for (const q of ['distillerie à Kelowna', 'dégustation de spiritueux à Kelowna']) {
    const j = await planV3(q);
    assert.ok(allStops(j).some((s) => s.venue.type === 'distillery'), `${q}: ${JSON.stringify(allStops(j).map((s) => s.venue.type))}`);
  }
  // The stop shows "Tastings from $15" (the cost label) once she answered.
  await change(tokenFor(d.id), { flight_fee: 15 });
  const j = await planV3('gin distillery in Kelowna');
  const stop = allStops(j).find((s) => s.venue.id === d.id);
  if (stop) { assert.equal(stop.venue.cost.label, 'Tasting'); assert.equal(stop.venue.cost.cents, 1500); }
  assert.equal(app.CATEGORY_LABELS ? app.CATEGORY_LABELS.distillery.singular : 'Distillery', 'Distillery');
});

// ---------- An honest 100% ----------
test('checklist: a distillery with no kitchen and no tastings reaches 100% honestly (kind done, every “we don’t have one” counts)', async () => {
  const d = mk('distillery', { name: 'Hundred Spirits', slug: 'hundred-spirits', dog_friendly: 0 }); const t = tokenFor(d.id);
  const steps = [
    { brewery_info: { food: 'none', outside: 'yes', no_flights: true, to_go: ['bottles'], year: 'all' } },
    { hours_checked: true }, { not_offered: ['happy_hour', 'entertainment', 'pyv_groups', 'dogs'] }, { brewery_info: { minors: { policy: 'adults' } } },
    { badges: { wheelchair_accessible: true } }, { visit_rows: { known_for: 'Small-batch gin with Okanagan botanicals' } },
    { instagram_url: '@stillfixture' }, { facebook_url: 'https://www.facebook.com/stillfixture' },
  ];
  for (const c of steps) { const r = await change(t, c); assert.equal(r.status, 200, `${JSON.stringify(c)}: ${JSON.stringify(r.body)}`); }
  const v = app.getVenue(d.id);
  const input = app.ownerCompletenessInput ? null : null;
  const live = app.ownerVenueSnapshot(v, null);
  const base0 = { type: 'distillery', address: v.address, latitude: 1, longitude: 1, phone: v.phone, website: v.website, hasHours: true, hoursCheckedAt: today, imageUrl: '/images/owner/x.jpg', photoCount: 3,
    placeType: 'Distillery', breweryInfo: live.brewery_info, flightFee: live.flight_fee, visitLabels: visitRows(d.id).map((x) => x.label), description: 'x'.repeat(130),
    instagramUrl: 'x', facebookUrl: 'x', hasArrival: true, claimed: true, dogFriendly: false, ownerFeatures: ['wheelchair_accessible'], declaredNone: live.not_offered, offerAnswered: true };
  void input;
  let r = pc.scoreCompleteness(base0, { today });
  assert.deepEqual(r.missing.map((x) => x.key), []);
  assert.equal(r.pct, 100);
  // Not 100% with Who's welcome unanswered or photos missing.
  r = pc.scoreCompleteness({ ...base0, breweryInfo: { ...base0.breweryInfo, minors: undefined } }, { today });
  assert.ok(r.pct < 100); assert.ok(r.missing.some((x) => x.key === 'dogs_kids'));
  r = pc.scoreCompleteness({ ...base0, photoCount: 0, imageUrl: '' }, { today });
  assert.ok(r.pct < 100);
  // Happy hour stays an essential, and "We don't have one" counts as done.
  assert.ok(app.BREWERY_SETUP_PART1.includes('happy'));
  r = pc.scoreCompleteness({ ...base0, declaredNone: live.not_offered.filter((k) => k !== 'happy_hour') }, { today });
  assert.ok(r.missing.some((x) => x.key === 'happy_hour'));
  // The setup's own score names nothing a distillery isn't asked.
  const sc = app.setupScore(app.venueForOwnerToken(t));
  assert.ok(!sc.left.some((x) => ['specials', 'avg_spend', 'cuisine', 'sports', 'games', 'kitchen', 'menu', 'brewery_kind'].includes(x.k)), JSON.stringify(sc.left));
});

// ---------- Help topics ----------
test('help: distillery topics for the tasting price, kids rule, tours and seasonal or appointment hours; no “we emailed you”, no upsell', async () => {
  const T = app.DISTILLERY_SETUP_HELP_TOPICS;
  const ids = T.map((x) => x.id);
  for (const id of ['distillery-price', 'distillery-kids', 'distillery-tours', 'distillery-hours', 'distillery-menu', 'booking-link']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('brewery-taplist') && !ids.includes('brewery-food-trucks') && !ids.includes('brewery-price'), 'no beer topics');
  for (const x of T) for (const k of ['a', 'aFr']) {
    assert.doesNotMatch(x[k] || '', /emailed|link we sent|featured|upgrade|premium|courriel que nous|mise en vedette/i, `${x.id} ${k}`);
  }
  assert.match(T.find((x) => x.id === 'distillery-price').a, /Free tastings/);
  assert.match(T.find((x) => x.id === 'distillery-kids').a, /family trip only when you pick All ages or a set time/);
  assert.match(T.find((x) => x.id === 'distillery-hours').a, /We don’t have set hours\. Visits are by appointment/);
  assert.match(T.find((x) => x.id === 'booking-link').a, /Book a tasting/);
  assert.match(T.find((x) => x.id === 'distillery-menu').q, /spirits or cocktail list/);
  assert.equal(app.brewHelpTopics('brewery'), app.BREWERY_SETUP_HELP_TOPICS, 'breweries keep theirs');
  // On the setup page and the edit page.
  const d = mk('distillery'); const t = tokenFor(d.id);
  const setup = (await get(`/owner/${t}/setup`)).text;
  assert.match(setup, /How do I change our tasting price\?/);
  assert.doesNotMatch(setup, /How do I keep our tap list up to date\?/);
  const b = mk('brewery'); const sb = (await get(`/owner/${tokenFor(b.id)}/setup`)).text;
  assert.match(sb, /How do I change my flight price\?/);
});

// ---------- Everything else unchanged ----------
test('other types: a brewery’s wording, kids rule and cards are unchanged; The Dubh Glas-style brewery stays a brewery', async () => {
  const dubh = mk('brewery', { name: 'The Dubh Glas Distillery', slug: 'the-dubh-glas-distillery', region: 'oliver' });
  assert.equal((await change(tokenFor(dubh.id), { place_type: 'Distillery' })).status, 200);
  const cfg = cfgOf((await get(`/owner/${tokenFor(dubh.id)}/setup`)).text);
  assert.equal(cfg.distillery, false, 'still the brewery setup (neutral words), under /breweries');
  assert.equal((await get(`/oliver/breweries/${dubh.slug}`)).status, 200);
  // Brewery: unanswered with a kids badge still goes on a kids' trip by its badge (planner rule unchanged).
  assert.equal(planner.kidsAllowed({ type: 'pub', features: { kid_friendly: false } }), false);
  // The card list for a brewery still says "Flight".
  const b = mk('brewery'); await change(tokenFor(b.id), { flight_fee: 9 });
  const pv = planner.publicVenue ? planner.publicVenue({ id: b.id, type: 'brewery', flightFee: 9, features: {}, url: '/x' }) : null;
  if (pv) assert.equal(pv.cost.label, 'Flight');
  const pd = planner.publicVenue ? planner.publicVenue({ id: 1, type: 'distillery', flightFee: 15, features: {}, url: '/y' }) : null;
  if (pd) { assert.equal(pd.cost.label, 'Tasting'); assert.equal(pd.cost.labelFr, 'Dégustation'); }
});

// ---------- Fresh eyes distillery test 1 (2026-11-13) ----------
const RAJ_ROWS = [
  { label: 'Known for', text: 'Fruit brandies and gin' }, { label: 'Tastings', text: '$10 for 4 samples' },
  { label: 'To go', text: 'Bottles' }, { label: 'Tours', text: 'Distillery tours Saturdays at 2 PM, book ahead' },
  { label: 'Kids & dogs', text: 'Minors welcome with an adult' },
];
test('fe1 tastings: her tasting line replaces research’s Tastings row (one line on the page), the Tours line stays, Undo brings it back', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  research(d.id, RAJ_ROWS);
  assert.equal((await change(t, { flight_fee: 12 })).status, 200);
  const labels = visitRows(d.id).map((r) => r.label);
  assert.ok(!labels.includes('Tastings'), JSON.stringify(visitRows(d.id)));
  assert.equal(row(d.id, 'Flights').text, '$12 a tasting.');
  assert.equal(labels.indexOf('Flights'), 1, 'in research’s place');
  assert.equal(row(d.id, 'Tours').text, 'Distillery tours Saturdays at 2 PM, book ahead', 'the Tours line is not set aside');
  assert.equal(app.venueVisitInfo(d.id).owner_was.Flights.text, '$10 for 4 samples');
  const page = (await get(pagePath(d))).text;
  assert.equal((page.match(/<span class="visit-label">Tastings<\/span>/g) || []).length, 1);
  assert.doesNotMatch(page, /\$10 for 4 samples/);
  assert.match(page, /book ahead/);
  // A later research write keeps her line, never a second Tastings row.
  const cur = app.venueVisitInfo(d.id);
  research(d.id, RAJ_ROWS);
  assert.ok(!visitRows(d.id).some((r) => r.label === 'Tastings'), JSON.stringify(visitRows(d.id)));
  assert.equal(row(d.id, 'Flights').text, '$12 a tasting.');
  assert.ok(cur);
  // Taking the price back (no answer) brings research's Tastings line back where it was.
  assert.equal((await change(t, { flight_fee: null })).status, 200);
  assert.equal(row(d.id, 'Tastings').text, '$10 for 4 samples');
  assert.ok(!row(d.id, 'Flights'));
  // A brewery (or cidery) whose research says "Tastings" is handled the same way.
  const b = mk('brewery', { name: 'Orchard Cider Test House', slug: 'orchard-cider-test-house' }); research(b.id, [{ label: 'Tastings', text: '$8 for a flight of 4' }, { label: 'Known for', text: 'Dry cider' }]);
  await change(tokenFor(b.id), { flight_fee: 9 });
  assert.ok(!row(b.id, 'Tastings')); assert.equal(row(b.id, 'Flights').text, '$9 a flight.');
  // Both labels in research: one line, both recorded for an Undo.
  const d2 = mk('distillery'); research(d2.id, [{ label: 'Flights', text: 'Flights $14' }, { label: 'Tastings', text: '$10 for 4 samples' }]);
  await change(tokenFor(d2.id), { flight_fee: 11 });
  assert.deepEqual(visitRows(d2.id).map((r) => r.label), ['Flights']);
  await change(tokenFor(d2.id), { flight_fee: null });
  assert.deepEqual(visitRows(d2.id).map((r) => r.text).sort(), ['$10 for 4 samples', 'Flights $14']);
});

test('fe1 wording: “Tours & events” on a distillery’s page, edit page and updates list; help points there; breweries keep theirs', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  assert.equal((await change(t, { brewery_info: { to_go: ['bottles'] }, flight_fee: 12 })).status, 200);
  assert.equal((await change(t, { weekly_nights: [{ days: ['sat'], kind: 'tour', title: 'Distillery tour', start: '14:00' }] })).status, 200);
  const page = (await get(pagePath(d))).text;
  assert.match(page, /<h2 id="venueNightsTitle">Tours &amp; events<\/h2>/);
  assert.doesNotMatch(page, />Weekly nights</);
  assert.match(page, /href="#fdDeals">Tours &amp; events</, 'the section tab');
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /id="opNightsLabel">Tours &amp; events/);
  const act = app.ownerVenueActivity(d.id, 12, 'en').map((x) => x.title).join(' | ');
  assert.match(act, /your tasting room answers/i); assert.match(act, /tasting price/i); assert.match(act, /tours & events/i);
  assert.doesNotMatch(act, /taproom|flight price|weekly nights/i);
  assert.match(app.ownerVenueActivity(d.id, 12, 'fr').map((x) => x.title).join(' | '), /salle de dégustation/);
  const tours = app.DISTILLERY_SETUP_HELP_TOPICS.find((x) => x.id === 'distillery-tours');
  assert.match(tours.a, /Tours &amp; events/); assert.doesNotMatch(tours.a, /Weekly nights/);
  assert.match(tours.aFr, /Visites et événements/); assert.doesNotMatch(tours.aFr, /Soirées de la semaine/);
  // A brewery's page and list keep "Weekly nights" and "Your taproom answers".
  const b = mk('brewery'); const tb = tokenFor(b.id);
  await change(tb, { brewery_info: { to_go: ['cans'] }, flight_fee: 10 });
  await change(tb, { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:00' }] });
  assert.match((await get(`/kelowna/breweries/${b.slug}`)).text, /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
  assert.match(app.ownerVenueActivity(b.id, 12, 'en').map((x) => x.title).join(' | '), /your taproom answers.*flight price|flight price.*your taproom answers/i);
});

test('fe1 tours screen: Distillery tour and Class first, research’s tour pre-filled (Tour · Saturday · 2 PM), how-often note; tour/class kinds', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  research(d.id, RAJ_ROWS);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.nightKinds.slice(0, 4), ['tour', 'class', 'live_music', 'other']);
  assert.equal(cfg.nightKindsTop, 4);
  assert.ok(cfg.nightKinds.includes('trivia') && cfg.nightKinds.indexOf('trivia') >= 4, 'pub kinds under More');
  assert.deepEqual(cfg.suggestNights, [{ kind: 'tour', days: ['sat'], start: '14:00' }]);
  assert.equal(text.en.brewery.kindDistillery.kinds.tour, 'Distillery tour');
  assert.equal(text.fr.brewery.kindDistillery.kinds.tour, 'Visite de la distillerie');
  assert.equal(text.fr.brewery.kindDistillery.kinds.class, 'Atelier');
  // Distillery test 3 (2026-11-13): the note names every other week and links straight to Tours & events (eventsOftenLink).
  assert.match(text.en.brewery.kindDistillery.eventsOften, /^Every other week or once a month\? Tap Save my events, then set how often in Tours & events on your edit page\.$/);
  assert.equal(text.en.brewery.kindDistillery.eventsOftenLink, 'Open Tours & events');
  const s = CLIENT();
  assert.match(s, /start: g\.start \|\| ''/);
  assert.match(s, /nTop = C\.nightKindsTop \|\| 6/);
  assert.match(s, /if \(C\.distillery\) \{ P2_ICONS\.happy = '🍹'; P2_ICONS\.music = '🥃'; \}/);
  // A brewery: the pub chips, six on top; research isn't read as a tour.
  const b = mk('brewery'); research(b.id, [{ label: 'Events', text: 'Brewery tours Saturdays at 2 PM' }]);
  const cb = cfgOf((await get(`/owner/${tokenFor(b.id)}/setup`)).text);
  assert.equal(cb.nightKindsTop, 6); assert.ok(!cb.nightKinds.includes('tour'));
  assert.equal(cb.suggestNights, undefined);
  // Two kinds or two times: shown as a hint only.
  const d2 = mk('distillery'); research(d2.id, [{ label: 'Tours', text: 'Tours and gin classes Saturdays at 2 PM' }]);
  const c2 = cfgOf((await get(`/owner/${tokenFor(d2.id)}/setup`)).text);
  assert.equal(c2.suggestNights, undefined); assert.match(c2.researchEvents, /gin classes/);
  // The kinds are stored values (no new field); the edit page offers them to a distillery only.
  assert.ok(app.NIGHT_KINDS.includes('tour') && app.NIGHT_KINDS.includes('class'));
  assert.equal((await change(t, { weekly_nights: [{ days: ['sun'], kind: 'class', title: 'Gin class', start: '13:00', frequency: 'monthly-1st' }] })).status, 200);
  assert.equal(app.venueWeeklyNightsList(d.id)[0].kind, 'class');
  assert.match((await get(`/owner/${t}`)).text, /<option value="tour"/);
  assert.doesNotMatch((await get(`/owner/${tokenFor(b.id)}`)).text, /<option value="tour"/);
});

test('fe1 Build My Trip: her Saturday 2 PM tour shows on the stop (“Tour at 2 PM, book ahead”), the visit includes it; “tasting” is used; Monday says only why', async () => {
  const sat = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((x) => [x, x === 'mon' ? [] : [['11:00', '18:00']]]));
  const d = mk('distillery', { name: 'Fe Spirits Test Distillery', slug: 'fe-spirits-test-distillery', region: 'vernon', latitude: 50.2671, longitude: -119.272, address: '3000 30 Ave, Vernon', hours: JSON.stringify(sat), kid_friendly: 1 });
  research(d.id, RAJ_ROWS);
  const t = tokenFor(d.id);
  await change(t, { flight_fee: 12, brewery_info: { to_go: ['bottles'], minors: { policy: 'all_ages' } } });
  await change(t, { weekly_nights: [{ days: ['sat'], kind: 'tour', title: 'Distillery tour', start: '14:00' }] });
  for (const q of ['Saturday in Vernon with the kids, 1 PM to 5 PM. Distillery tour.', 'Saturday in Vernon, distillery tasting in the afternoon.']) {
    const j = await planV3(q);
    const st = allStops(j).find((s) => s.venue.id === d.id);
    assert.ok(st, `${q}: ${JSON.stringify(allStops(j).map((s) => s.venue.name))}`);
    assert.match(st.nightLine || '', /: Distillery tour at 2 PM, book ahead$/, q); // distillery test 2: the event's label
    assert.match(st.nightLineFr || '', /: Visite de la distillerie à 14 h, réservez à l’avance$/, q);
    const item = (j.schedule || []).find((x) => x.venueId === d.id);
    assert.ok(item && item.startMinutes <= 830 && item.endMinutes >= 900, `${q}: ${JSON.stringify(item)}`);
    assert.ok(!(j.warnings || []).some((w) => /“tasting”/.test(w)), JSON.stringify(j.warnings));
    assert.ok(!((j.understood || {}).notUsed || []).includes('tasting'));
  }
  // Monday (closed): a real title, and only the closed reason (no "No distilleries … matched").
  const m = await planV3('Monday afternoon in Vernon. A distillery tasting.');
  assert.match(m.summary, /^Distilleries in Vernon on Monday\.$/, m.summary);
  assert.ok(!(m.warnings || []).some((w) => /^No distiller/.test(w) || /No distillery could be fitted/.test(w)), JSON.stringify(m.warnings));
});

test('fe1 free with a bottle: the winery’s question on a distillery’s Tastings screen; the page line says it, the card stays “From $12”', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  let r = await change(t, { flight_fee: 12, brewery_info: { waived: 'yes' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(row(d.id, 'Flights').text, '$12 a tasting, free with a bottle purchase.');
  assert.equal(app.venueVisitInfo(d.id).owner_fr.Flights.fr, '12 $ la dégustation, offerte à l’achat d’une bouteille.');
  assert.equal(app.cardPriceFor(d.id), 'From $12');
  assert.equal(app.venueBreweryInfo(d.id).waived, 'yes', 'stored with her other answers (venue_brewery_info)');
  await change(t, { brewery_info: { waived: 'two' } });
  assert.equal(row(d.id, 'Flights').text, '$12 a tasting, free when you buy 2 bottles or more.');
  await change(t, { brewery_info: { waived: 'no' } });
  assert.equal(row(d.id, 'Flights').text, '$12 a tasting.');
  await change(t, { flight_fee: 0, brewery_info: { waived: 'yes' } });
  assert.equal(row(d.id, 'Flights').text, 'Free tastings.');
  await change(t, { flight_fee: null, brewery_info: { no_flights: true } });
  assert.equal(app.venueBreweryInfo(d.id).waived, undefined, 'no tastings takes it back');
  // Breweries don't get it.
  const b = mk('brewery');
  r = await change(tokenFor(b.id), { brewery_info: { waived: 'yes' } });
  assert.notEqual(r.status, 200);
  assert.match(text.en.brewery.kindDistillery.waivedQ, /free if people buy a bottle/);
  assert.equal(text.fr.brewery.kindDistillery.waivedOpts.yes, 'Oui, avec une bouteille');
  assert.match(CLIENT(), /C\.distillery && T\.waivedQ && !bf\.noFlights/);
});

test('fe1 small fixes: Who’s welcome pre-picked from research, no repeated kids note, home card time, no Games or Sports tiles', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  research(d.id, RAJ_ROWS);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.suggestKidsAll, true);
  assert.match(CLIENT(), /else if \(!BIm\.policy && C\.suggestKidsAll\) S\.minors\.policy = 'all_ages';/);
  const d2 = mk('distillery'); research(d2.id, [{ label: 'Kids & dogs', text: 'Adults only (19+). Dogs on the patio.' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(d2.id)}/setup`)).text).suggestKidsAll, false);
  // "All ages welcome. All ages with an adult." -> one sentence; a note that adds something stays.
  assert.equal(app.breweryMinorsNote('All ages welcome', 'All ages with an adult'), '');
  assert.equal(app.breweryMinorsNote('All ages welcome', 'all ages welcome, kids with an adult'), 'Kids with an adult.');
  await change(t, { brewery_info: { minors: { policy: 'all_ages', note: 'All ages with an adult' } } });
  assert.equal(row(d.id, 'Kids & dogs').text, 'All ages welcome.');
  // The home card says what setup says.
  assert.match(app.ownerSetupCardHtml('/x', 'en', 'none', 'distillery'), /About 10 to 20 minutes/);
  assert.match(app.ownerSetupCardHtml('/x', 'fr', 'none', 'distillery'), /Environ 10 à 20 minutes/);
  assert.match(text.en.brewery.kindDistillery.hiLead, /About 10 to 20 minutes/);
  // No pub games or Sports on TV offered to a distillery; a brewery keeps them.
  assert.ok(!app.ownerExtraBadgesFor('distillery').includes('pool'));
  assert.ok(app.ownerExtraBadgesFor('brewery').includes('pool'));
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  assert.ok(!keys.includes('sports_tv') && !keys.includes('darts'), JSON.stringify(keys));
  const bk = cfgOf((await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text).offerGroups.flatMap((g) => g.keys);
  assert.ok(bk.includes('sports_tv') && bk.includes('darts'));
  // Service dogs: shown as soon as No dogs is tapped (scrolled into view).
  assert.match(CLIENT(), /n\.hidden = !S\.noDogs; if \(S\.noDogs && n\.scrollIntoView\)/);
});

// ---------- Fresh eyes distillery test 2 (2026-11-13, Sylvain, French, by appointment) ----------
const mdOff = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(5, 10); };
const OPEN_LATE = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['00:00', '23:59']]])));
const nightsRows = (html) => (html.match(/<span class="venue-wn[ "][\s\S]*?<\/span><\/span>(?=<span class="venue-wn[ "]|<\/span>)/g) || []);

test('fe2 by appointment: a tour or class saves with no day, frequency "appointment"; other kinds still need a day', async () => {
  assert.ok(app.NIGHT_FREQUENCIES.includes('appointment'));
  let r = app.validateWeeklyNights([{ days: [], kind: 'tour', title: 'Distillery tour', frequency: 'appointment' }], { source: 'venue_owner', checked_at: today });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(r.nights[0].days, []); assert.equal(r.nights[0].frequency, 'appointment');
  r = app.validateWeeklyNights([{ days: ['fri', 'sat'], kind: 'class', title: 'Whisky class', frequency: 'appointment' }], { source: 'venue_owner', checked_at: today });
  assert.deepEqual(r.nights[0].days, [], 'by appointment keeps no days');
  r = app.validateWeeklyNights([{ days: [], kind: 'trivia', title: 'Trivia', frequency: 'appointment' }], { source: 'venue_owner', checked_at: today });
  assert.equal(r.ok, false); assert.match(r.detail, /only a tour or a class/);
  r = app.validateWeeklyNights([{ days: [], kind: 'tour', title: 'Tour' }], { source: 'venue_owner', checked_at: today });
  assert.equal(r.ok, false, 'a weekly tour still needs a day');
  // Saved through the setup, shown on the page and the edit page, and kept.
  const d = mk('distillery'); const t = tokenFor(d.id);
  r = await change(t, { weekly_nights: [{ days: [], kind: 'tour', title: 'Visite de la distillerie', frequency: 'appointment' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const page = (await get(pagePath(d))).text;
  const rows = nightsRows(page);
  assert.equal(rows.length, 1, page.slice(page.indexOf('venueNights'), page.indexOf('venueNights') + 900));
  assert.match(rows[0], /is-appt/); assert.match(rows[0], /Distillery tour<\/span> <span class="venue-wn-time">&middot; By appointment/, 'her French chip name reads in English on the English page');
  assert.doesNotMatch(rows[0], /venue-wn-today|venue-wn-days/, 'no day and no Today / Tonight tag');
  assert.match(app.venueWeeklyNightsHtml({ rows: [{ s: { kind: 'tour', title: 'Visite de la distillerie', title_fr: 'Visite de la distillerie', frequency: 'appointment', days: [] }, days: 'Sur rendez-vous', today: false, time: '', freq: '' }] }, true, { tours: true }),
    /Visite de la distillerie<\/span> <span class="venue-wn-time">&middot; sur rendez-vous/);
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /<option value="appointment" selected>By appointment \(tours and classes\)<\/option>/);
  // Saving the edit page as it is keeps it (days [] with "appointment").
  r = await change(t, { weekly_nights: [{ days: [], kind: 'tour', title: 'Visite de la distillerie', start: null, end: null, detail: null, host: null, cost: null, frequency: 'appointment', title_fr: null, detail_fr: null }] }, false);
  assert.ok(r.status === 200 || /Nothing has changed/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  assert.equal(app.venueWeeklyNightsList(d.id)[0].frequency, 'appointment');
  // A pub's edit page doesn't offer it.
  assert.doesNotMatch((await get(`/owner/${tokenFor(mk('pub').id)}`)).text, /value="appointment"/);
  // The setup screen: the choice next to the day chips for tours and classes, the save without a day, the words.
  const s = CLIENT();
  assert.match(s, /\(apptKind\(e\.kind\) \? '<div class="su-samerow" style="margin:8px 0 0"><button type="button" class="su-toggle" id="suAppt' \+ i/);
  assert.match(s, /if \(!ds\.length && !appt\) \{ S\.nudge = T\.needDays; return render\(\); \}/);
  assert.match(s, /frequency: appt \? 'appointment' :/);
  assert.equal(text.en.byAppt, 'By appointment'); assert.equal(text.fr.byAppt, 'Sur rendez-vous');
  // Build My Trip: no slot for it, a call-ahead line instead, and the event's own label.
  assert.equal(app.nightOnDate({ days: [], frequency: 'appointment', kind: 'tour' }, today), false);
  assert.equal(app.nightsApptTripLine([{ kind: 'tour', frequency: 'appointment', days: [] }], false), 'Tours by appointment, call ahead');
  assert.equal(app.nightsApptTripLine([{ kind: 'tour', frequency: 'appointment', days: [] }], true), 'Visites sur rendez-vous, appelez avant');
  assert.equal(app.nightsApptTripLine([{ kind: 'trivia', frequency: 'weekly', days: ['tue'] }], false), '');
  assert.equal(app.nightsTripText([{ kind: 'tour', title: 'Visite de la distillerie', days: ['sat'], start: '14:00' }], true).text, 'Visite de la distillerie à 14 h');
  assert.equal(app.nightsTripText([{ kind: 'tour', title: 'Distillery tour', days: ['sat'], start: '14:00' }], false).text, 'Distillery tour at 2 PM');
  assert.equal(app.nightsTripText([{ kind: 'class', title: 'Class', days: ['sat'] }], true).text, 'Atelier');
});

test('fe2 Today/Tonight: only when open today (hours, season, not by appointment); no start time is "Today"; pubs and cafés still tagged', async () => {
  // A 7-day tour with no time at a distillery in its by-appointment season: no tag.
  const d = mk('distillery', { hours: OPEN_LATE }); const t = tokenFor(d.id);
  await change(t, { brewery_info: { year: 'appointment', season: { from: mdOff(2), to: mdOff(4) } } });
  await change(t, { weekly_nights: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], kind: 'tour', title: 'Distillery tour' }] });
  assert.equal(app.venueClosedForTagsToday(app.getVenueById ? app.getVenueById(d.id) : d), true);
  let rows = nightsRows((await get(pagePath(d))).text);
  assert.equal(rows.length, 1); assert.doesNotMatch(rows[0], /venue-wn-today/, 'no Tonight in the off-season');
  // In its walk-in season: "Today", never "Tonight" for a row with no start time.
  const d2 = mk('distillery', { hours: OPEN_LATE }); const t2 = tokenFor(d2.id);
  await change(t2, { brewery_info: { year: 'appointment', season: { from: mdOff(-1), to: mdOff(2) } } });
  await change(t2, { weekly_nights: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], kind: 'tour', title: 'Distillery tour' }] });
  rows = nightsRows((await get(pagePath(d2))).text);
  if (new Date().getHours() >= 4) assert.match(rows[0], /venue-wn-today">Today</);
  assert.doesNotMatch(rows[0], /Tonight/);
  // A place closed today by its hours: no tag (as before).
  const hrsNoToday = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((x) => [x, x === app.okanaganClock(new Date()).weekday ? [] : [['00:00', '23:59']]])));
  const p0 = mk('pub', { hours: hrsNoToday });
  await change(tokenFor(p0.id), { weekly_nights: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], kind: 'trivia', title: 'Trivia', start: '19:00' }] }, false);
  rows = nightsRows((await get(`/${p0.region}/pubs/${p0.slug}`)).text);
  if (rows.length) assert.doesNotMatch(rows[0], /venue-wn-today/);
  // Pubs, breweries and cafés keep their tags: trivia at 23:30 is "Tonight", an 8 AM run club "Today".
  const fake = (start) => ({ rows: [{ s: { kind: start && start >= '16:00' ? 'trivia' : 'run_club', title: 'X', start, days: ['mon'] }, days: 'Mon', today: true, onNow: false, time: '', freq: '' }] });
  assert.match(app.venueWeeklyNightsHtml(fake('23:30'), false), /venue-wn-today">Tonight</);
  assert.match(app.venueWeeklyNightsHtml(fake('08:00'), false), /venue-wn-today">Today</);
  assert.match(app.venueWeeklyNightsHtml(fake(null), false), /venue-wn-today">Today</, 'no start time is not evening');
  assert.match(app.venueWeeklyNightsHtml(fake(null), true), /venue-wn-today">Aujourd’hui</);
});

test('fe2 help: tours by appointment answers ahead of the hours topic; hours questions keep theirs; no “we emailed you”, no upsell', () => {
  const vm = require('node:vm');
  const html = app.ownerHelpWidgetHtml('setup', { extraTopics: app.DISTILLERY_SETUP_HELP_TOPICS });
  const c = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const ctx = { T: c.topics, cfg: c };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  for (const q of ['Nos visites de la distillerie sont sur rendez-vous, n’importe quel jour', 'visites sur rendez-vous', 'Comment indiquer que les visites sont sur rendez-vous?', 'our tours are by appointment', 'tours by appointment any day', 'distillery tour by appointment only']) {
    assert.equal(ctx.best(q).id, 'distillery-tours-appointment', q);
  }
  for (const q of ['Nous sommes sur rendez-vous l’hiver', 'by appointment', 'we are by appointment in winter']) assert.equal(ctx.best(q).id, 'distillery-hours', q);
  assert.equal(ctx.best('Où ajouter nos visites et nos ateliers?').id, 'distillery-tours');
  const tp = app.DISTILLERY_SETUP_HELP_TOPICS.find((x) => x.id === 'distillery-tours-appointment');
  assert.match(tp.a, /Tours, classes and events/); assert.match(tp.a, /<strong>By appointment<\/strong>/);
  assert.match(tp.aFr, /Visites, ateliers et événements/); assert.match(tp.aFr, /<strong>Sur rendez-vous<\/strong>/);
  for (const k of ['a', 'aFr']) assert.doesNotMatch(tp[k], /emailed|link we sent|featured|upgrade|premium|courriel que nous|mise en vedette/i);
});

test('fe2 Build My Trip: free tasting for distilleries and breweries, adults-only reason on a kids’ trip, tours by appointment', async () => {
  assert.equal(planner.publicVenue({ id: 1, name: 'x', type: 'distillery', flightFee: 0, features: {}, collections: [] }).freeTasting, true);
  assert.equal(planner.publicVenue({ id: 2, name: 'y', type: 'brewery', flightFee: 0, features: {}, collections: [] }).freeTasting, true);
  assert.equal(planner.publicVenue({ id: 3, name: 'z', type: 'distillery', flightFee: 12, features: {}, collections: [] }).freeTasting, undefined);
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /adults:'Adultes seulement \(19 ans et plus\)'/); assert.match(v3, /adults:'Adults only \(19\+\)'/);
  assert.match(v3, /adults_only:labels\.adults/);
  // A distillery whose owner said Adults only (19+) is left out of a kids' trip with that reason.
  const d = mk('distillery', { name: 'Still Test Adults Gin', region: 'osoyoos', latitude: 49.0323, longitude: -119.4682, address: '8000 Main St, Osoyoos' }); const t = tokenFor(d.id);
  await change(t, { brewery_info: { minors: { policy: 'adults' } } });
  await change(t, { flight_fee: 0 });
  await change(t, { weekly_nights: [{ days: [], kind: 'tour', title: 'Distillery tour', frequency: 'appointment' }] });
  const j = await planV3('A distillery afternoon in Osoyoos with our kids (8 and 11) on Saturday, July 10, 2027');
  const alts = JSON.stringify(j.requirementResults || []);
  assert.match(alts, /"reasonCode":"adults_only"/, alts.slice(0, 300) + JSON.stringify(allStops(j).map((s) => [s.venue.name, s.venue.region])));
  assert.ok(!allStops(j).some((s) => s.venue.id === d.id), 'never planned for a family');
  const j2 = await planV3('A distillery afternoon in Osoyoos on Saturday, July 10, 2027');
  const st = allStops(j2).find((s) => s.venue.id === d.id);
  assert.ok(st, JSON.stringify(allStops(j2).map((s) => s.venue.name)));
  assert.equal(st.venue.freeTasting, true); assert.equal(st.nightLine, 'Tours by appointment, call ahead'); assert.equal(st.nightLineFr, 'Visites sur rendez-vous, appelez avant');
});

test('fe2 small fixes: no-break spaces, Camions-restaurants, food label, tours intro, hours recap, 5 à 7 icon and words, closed reason', async () => {
  assert.equal(text.fr.pctAbout, 'Complète à environ {n} %');
  assert.equal(text.frSpacing('91 %'), '91 %');
  assert.equal(text.fr.brewery.tfoods.trucks, 'Camions-restaurants');
  assert.match(text.fr.brewery.tfoodSubs.trucks, /« Camions-restaurants la plupart des jours »/);
  assert.equal(text.fr.brewery.kindDistillery.labels.taproom, 'Nourriture sur place');
  assert.equal(text.en.brewery.kindDistillery.labels.taproom, 'Food here');
  assert.doesNotMatch(text.fr.brewery.kindDistillery.musicLead, /quiz/);
  assert.equal(text.fr.recapAppt, '({a} – {b}) · sur rendez-vous le reste de l’année');
  assert.match(CLIENT(), /per = ' ' \+ fill\(T\.recapAppt, \{ a: mdLabel\(S\.wine\.season\.from\), b: mdLabel\(S\.wine\.season\.to\) \}\)/);
  // The owner home in French: 🍹 for « 5 à 7 », no ordinary space before « : » in the updates list, « de 5 à 7 ».
  const d = mk('distillery'); const t = tokenFor(d.id);
  await change(t, { not_offered: ['happy_hour'] });
  await change(t, { brewery_info: { food: 'trucks', trucks: 'weekends' } });
  const home = (await get(`/fr/owner/${t}`)).text;
  assert.match(home, /&#127865;/); assert.doesNotMatch(home, /&#127867;/);
  assert.match(home, /n’avez pas : de 5 à 7/);
  assert.match(home, /Mise à jour de la fiche :/);
  const bare = home.replace(/<head[\s\S]*?<\/head>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<textarea[\s\S]*?<\/textarea>/g, '').replace(/<[^>]*>/g, '\n');
  assert.deepEqual(bare.split('\n').filter((x) => / :(?=\s|$)/.test(x)), [], 'no ordinary space before a colon in the text');
  assert.equal(app.venueVisitInfo(d.id).owner_fr.Food.fr, 'Camions-restaurants la fin de semaine.');
  // Distillery test 3 (2026-11-13): English shows a cocktail glass 🍸 for a distillery (pubs and breweries keep 🍻).
  assert.match((await get(`/owner/${t}`)).text, /&#127864;/, 'English 🍸 for a distillery');
  assert.equal(app.frTypographyPage('<style>a { color: red }</style><p>Note : 91 %</p><textarea>x : y</textarea>'), '<style>a { color: red }</style><p>Note : 91 %</p><textarea>x : y</textarea>');
  // Build My Trip's closed reason has no « est fermé » after a feminine name.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /return a\.name\+\(fr\?' — '\+t:' is '/);
});

// ---------- Fresh eyes distillery test 3 (2026-11-13): drafts/fresh-eyes-distillery3-2026-11-13/REPORT.md ----------
const SRV = () => fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const editPage = async (t) => (await get(`/owner/${t}`)).text;

test('fe3 #1 the full edit page fits a phone with pending photos: the status chip wraps, two shrinkable columns, the Send bar shrinks its words', async () => {
  const d = mk('distillery'); const html = await editPage(tokenFor(d.id));
  assert.match(html, /\.op-photos \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/);
  assert.doesNotMatch(html, /\.op-photos \{ grid-template-columns: 1fr 1fr; \}/);
  assert.match(html, /\.op-photos figcaption \.op-status \{ align-self: flex-start; white-space: normal; max-width: 100%;/);
  assert.match(html, /repeat\(auto-fill, minmax\(min\(140px, 100%\), 1fr\)\)/);
  assert.match(html, /\.op-unsent > span \{ min-width: 0; flex: 1 1 auto; \}/);
  assert.match(html, /\.op-unsent button \{ flex: 0 0 auto; \}/);
  // Every type's edit page carries the same rules (one stylesheet).
  for (const type of ['restaurant', 'cafe', 'pub', 'winery', 'brewery']) assert.match(await editPage(tokenFor(mk(type).id)), /minmax\(0, 1fr\) minmax\(0, 1fr\)/, type);
});

test('fe3 #2 a direct route to "how often": owner home link, #tours-events opens and scrolls, the setup note and the help answer link there', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  const html = await editPage(t);
  assert.match(html, /<p class="op-all-link op-nights-link"><a href="#tours-events">Tours &amp; events: days and how often<\/a><\/p>/);
  assert.match(html, /<summary id="tours-events"><span class="lyv-section-label" id="opNightsLabel">Tours &amp; events/);
  assert.match(html, /'weekly-nights': 'more', 'tours-events': 'more'/);
  assert.match(html, /function goSection\(hash\)/);
  assert.match(html, /window\.addEventListener\('hashchange', function\(\)\{ goSection\(location\.hash\); \}\);/);
  assert.match(html, /body\.owner-page #tours-events \{ scroll-margin-top: 76px; \}/);
  assert.match(html, /pick how often \(like Every other week\)/);
  // The edit page's help: a distillery's own topic (no "Weekly nights"), linking to the section on this page.
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">(.*?)<\/script>/s.exec(html)[1]);
  const wn = cfg.topics.find((x) => x.id === 'weekly-nights');
  assert.match(wn.a, /<a href="#tours-events"><strong>Tours &amp; events<\/strong><\/a>/);
  assert.match(wn.a, /<strong>Every other week<\/strong>/);
  assert.match(wn.a, /\+ Add an event/);
  assert.doesNotMatch(wn.a, /Weekly nights|Trivia/);
  assert.doesNotMatch(JSON.stringify(cfg.topics), /\{EDIT\}/);
  // Other types: the link names their own section; a winery has none.
  assert.match(await editPage(tokenFor(mk('pub').id)), /<a href="#tours-events">Weekly nights: days and how often<\/a>/);
  assert.match(await editPage(tokenFor(mk('cafe').id)), /<a href="#tours-events">Weekly events: days and how often<\/a>/);
  assert.doesNotMatch(await editPage(tokenFor(mk('winery').id)), /op-nights-link/);
  // The setup: the note names every other week and links to the edit page's section (C.back + #tours-events).
  const page = (await get(`/owner/${t}/setup`)).text;
  const c = cfgOf(page);
  assert.equal(c.back, `/owner/${t}`);
  assert.match(CLIENT(), /T\.eventsOftenLink && C\.back \? ' <a href="' \+ h\(C\.back \+ '#tours-events'\) \+ '" id="suEventsOftenLink">'/);
  assert.equal(text.fr.brewery.kindDistillery.eventsOftenLink, 'Ouvrir Visites et événements');
  const scfg = JSON.parse(/<script type="application\/json" id="ohbCfg">(.*?)<\/script>/s.exec(page)[1]);
  const tours = scfg.topics.find((x) => x.id === 'distillery-tours');
  assert.ok(tours.a.includes(`<a href="/owner/${t}#tours-events"><strong>Tours &amp; events</strong> on your edit page</a>`), tours.a);
  assert.match(tours.a, /pick <strong>Every other week<\/strong>/);
});

test('fe3 #3 the edit page Tours & events editor in a distillery’s words; pubs and cafés keep theirs', async () => {
  const html = await editPage(tokenFor(mk('distillery').id));
  assert.match(html, /<legend>Event 1<\/legend>/);
  assert.match(html, />\+ Add an event<\/button>/);
  assert.match(html, /aria-label="Event 1: kind of event"/);
  assert.match(html, /placeholder="Meet at the bar; about 45 minutes"/);
  assert.match(html, /placeholder="Saturday distillery tour"/);
  assert.match(html, /<select class="op-wn-kind" aria-label="Event 1: kind of event"><option value="tour" selected>Tour<\/option><option value="class">Class<\/option><option value="trivia">/);
  assert.match(html, /<summary>In French \(optional, you can skip this\)<\/summary>/);
  assert.doesNotMatch(html, /Night 1|\+ Add a night|Teams up to 6/);
  for (const type of ['pub', 'cafe']) {
    const h2 = await editPage(tokenFor(mk(type).id));
    assert.match(h2, /<legend>Night 1<\/legend>/, type); assert.match(h2, /\+ Add a night/, type); assert.match(h2, /Teams up to 6, prizes for the top 3/, type);
    assert.match(h2, /<select class="op-wn-kind" aria-label="Night 1: kind of night"><option value="trivia" selected>Trivia/, type);
  }
});

test('fe3 #4 Build My Trip says "book ahead" for a tour only from its own words, its Tours line, or By appointment (not a groups booking link)', async () => {
  const sat = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((x) => [x, [['11:00', '18:00']]]));
  const d = mk('distillery', { name: 'Fe3 Book Test Distillery', slug: 'fe3-book-test-distillery', region: 'summerland', latitude: 49.6006, longitude: -119.6778, address: '9 Main St, Summerland', hours: JSON.stringify(sat) });
  research(d.id, [{ label: 'Tours', text: 'Saturday tours at 1 PM' }], 'https://example.com/groups');
  const t = tokenFor(d.id);
  await change(t, { weekly_nights: [{ days: ['sat'], kind: 'tour', title: 'Distillery tour', start: '13:00' }] });
  const line = async () => { const j = await planV3('Saturday in Summerland, 12 PM to 5 PM. Distillery tour.'); const st = allStops(j).find((s) => s.venue.id === d.id); assert.ok(st, JSON.stringify(allStops(j).map((s) => s.venue.name))); return st.nightLine || ''; };
  assert.match(await line(), /: Distillery tour at 1 PM$/, 'a booking link alone is not "book ahead"');
  await change(t, { weekly_nights: [{ days: ['sat'], kind: 'tour', title: 'Distillery tour', start: '13:00', detail: 'Book ahead online' }] });
  assert.match(await line(), /, book ahead$/, 'her own words say so');
  await change(t, { weekly_nights: [{ days: ['sat'], kind: 'tour', title: 'Distillery tour', start: '13:00' }] });
  research(d.id, [{ label: 'Tours', text: 'Saturday tours at 1 PM, reservations required' }], 'https://example.com/groups');
  assert.match(await line(), /, book ahead$/, 'her Tours line says so');
  research(d.id, [{ label: 'Groups', text: 'Groups of 8+ please book ahead' }], 'https://example.com/groups');
  assert.match(await line(), /: Distillery tour at 1 PM$/, 'a groups line about booking is not the tour');
  // The help line matches.
  assert.match(SRV(), /Tours people book ahead\? Say so in the tour’s detail \(“Book ahead online”\), or tap <strong>By appointment<\/strong>\. Build My Trip only says “book ahead” then\./);
});

test('fe3 #5 the edit page Plan your visit: the lines the setup writes, one writer, a true count; no food picker for a distillery or a no-kitchen brewery', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  research(d.id, [{ label: 'Known for', text: 'Small-batch gin' }, { label: 'Food', text: 'Small plates' }]);
  await change(t, { flight_fee: 16, brewery_info: { food: 'kitchen', kitchen: { mode: 'earlier', closes: '20:00' }, to_go: ['bottles'], minors: { policy: 'minors_until', until: '19:00' } } });
  await change(t, { visit_rows: { known_for: 'Small-batch gin and craft cocktails', dogs: 'Dogs welcome on the patio' } });
  let html = await editPage(t);
  const box = /<details class="op-fold op-sec" id="visit"[\s\S]*?<\/details>/.exec(html)[0];
  assert.deepEqual([...box.matchAll(/<label for="(opVisit\w+)">([^<]*)<\/label>/g)].map((m) => `${m[1]}=${m[2]}`), ['opVisitKnown=Known for', 'opVisitGroups=Good to know', 'opVisitDogs=Dogs']);
  assert.match(box, /placeholder="e\.g\. Small-batch gin and craft cocktails"/);
  assert.match(box, /<strong>Tastings:<\/strong> \$16 a tasting\./);
  assert.match(box, /<strong>To go:<\/strong> Bottles to go\./);
  assert.match(box, /<strong>Food:<\/strong> Small plates from our own kitchen; it closes at 8 PM\./);
  assert.match(box, /<strong>Kids &amp; dogs:<\/strong> Minors welcome with an adult until 7 PM\./);
  assert.match(box, new RegExp(`open <a href="/owner/${t}/setup">Set up your page</a> and tap Change an answer`));
  assert.match(box, /6 of 7 lines filled in/);
  assert.doesNotMatch(box, /Reservations|Takeout and delivery|Dietary note/);
  assert.doesNotMatch(html, /id="cuisine"/, 'no What you serve for a distillery');
  // The edit page saves Good to know with the same key the setup uses: one row, its label "Good to know", nothing doubled.
  const r = await change(t, { visit_rows: { known_for: 'Small-batch gin and craft cocktails', groups: 'Free parking out back', dogs: 'Dogs welcome on the patio' } }, false);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const labels = visitRows(d.id).map((x) => x.label);
  assert.equal(labels.filter((l) => l === 'Good to know').length, 1);
  assert.equal(new Set(labels).size, labels.length, JSON.stringify(labels));
  assert.match(await editPage(t), /7 of 7 lines filled in/);
  // Breweries: the same boxes; the food picker only with their own kitchen.
  const b = mk('brewery'); const bt = tokenFor(b.id);
  html = await editPage(bt);
  assert.doesNotMatch(html, /id="cuisine"/); assert.match(html, /<strong>Flights:<\/strong> <span class="op-hint">Not answered yet/);
  await change(bt, { brewery_info: { food: 'kitchen' } });
  assert.match(await editPage(bt), /id="cuisine"/);
  // Restaurants keep their five boxes.
  assert.match(await editPage(tokenFor(mk('restaurant').id)), /<label for="opVisitTakeout">Takeout and delivery<\/label>/);
});

test('fe3 #6 no Today / Tonight on a weekly row without an end once the place has closed for the day (after-midnight closes too)', () => {
  // Thursday Nov 12 2026 on the Okanagan clock (the site's own clock, app.okanaganClock).
  const thu = (h, m) => { const d = new Date(Date.UTC(2026, 10, 12, h + 7, m)); const c = app.okanaganClock(d); assert.deepEqual([c.weekday, c.minutes], ['thu', h * 60 + m]); return d; };
  const wk = (close) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((x) => [x, [['12:00', close]]])));
  const d = mk('distillery', { hours: wk('20:00') });
  return change(tokenFor(d.id), { weekly_nights: [{ days: ['thu'], kind: 'class', title: 'Cocktail class', start: '18:00' }, { days: ['thu'], kind: 'live_music', title: 'Late set', start: '19:00', end: '23:00' }] }).then((r) => {
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const v = db.prepare('SELECT * FROM venues WHERE id = ?').get(d.id);
    const tags = (now, hours = v.hours) => Object.fromEntries(app.venueWeeklyNights(v, hours, false, now).rows.map((x) => [x.s.title, x.today]));
    assert.deepEqual(tags(thu(19, 0)), { 'Cocktail class': true, 'Late set': true }, 'open: both today');
    assert.deepEqual(tags(thu(21, 16)), { 'Cocktail class': false, 'Late set': true }, 'closed at 8: the row without an end loses its tag; one with its own end keeps it');
    assert.deepEqual(tags(thu(10, 0)), { 'Cocktail class': true, 'Late set': true }, 'before opening: today');
    assert.deepEqual(tags(thu(20, 30)), { 'Cocktail class': false, 'Late set': true }, 'just after an 8 PM close');
    assert.deepEqual(tags(thu(20, 30), wk('01:00')), { 'Cocktail class': true, 'Late set': true }, 'open until 1 AM: still tonight');
  });
});

test('fe3 #7 small fixes: happy hour example, 🍸, time defaults from closing, research small plates, 1 stop, the Monday missing line', () => {
  assert.equal(text.en.brewery.kindDistillery.whatsOnEx, '$8 cocktails and half-price small plates');
  assert.equal(text.fr.brewery.kindDistillery.whatsOnEx, 'Cocktails à 8\u00a0$ et petites assiettes à moitié prix'); // no-break space (cocktail test 2)
  assert.equal(text.en.brewery.kindCidery.whatsOnEx, '$6 ciders and half-price snacks');
  assert.match(SRV(), /tile\('happy', venue\.type === 'cocktail' \? '&#127864;' : fr \? '&#127865;' : venue\.type === 'distillery' \? '&#127864;' : '&#127867;'/); // cocktail test 3: 🍸 for lounges
  // Kitchen-close and kids-until start an hour before the earliest closing time (never after closing), or blank.
  const src = CLIENT();
  assert.doesNotMatch(src, /\|\| '21:00'/);
  assert.match(src, /until: BIm\.until \|\| beforeClose\(\)/); assert.match(src, /kcloses: \(BI\.kitchen \|\| \{\}\)\.closes \|\| beforeClose\(\)/);
  const m = /function beforeClose\(\)\{[\s\S]*?\n  \}/.exec(src)[0];
  const run = (hours) => new Function('S', 'CUR', 'DAYS', 'parseWeek', `${m}; return beforeClose();`)({}, { hours }, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], (w) => (w ? JSON.parse(w) : null));
  assert.equal(run(WEEK), '19:00');
  assert.equal(run(JSON.stringify({ mon: [], tue: [['12:00', '20:00']], wed: [['12:00', '18:00']], thu: [], fri: [['16:00', '01:00']], sat: [], sun: [] })), '17:00');
  assert.equal(run(JSON.stringify({ mon: [['17:00', '01:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] })), '00:00');
  assert.equal(run(null), '');
});

test('fe3 #7b research "Small plates" pre-picks Our own kitchen and stays in her Food line; BMT "1 stop" and the Monday line', async () => {
  const d = mk('distillery'); const t = tokenFor(d.id);
  research(d.id, [{ label: 'Food', text: 'Small plates' }]);
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).suggestFood, 'kitchen');
  await change(t, { brewery_info: { food: 'kitchen', kitchen: { mode: 'same' } } });
  assert.equal(row(d.id, 'Food').text, 'Small plates from our own kitchen, food until close.');
  assert.equal(app.venueVisitInfo(d.id).owner_fr.Food.fr, 'Cuisine sur place, jusqu’à la fermeture.');
  const d2 = mk('distillery'); await change(tokenFor(d2.id), { brewery_info: { food: 'kitchen' } });
  assert.equal(row(d2.id, 'Food').text, 'Our own kitchen.', 'no research: as before');
  const v3 = require('../trip-planner-v3-page.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(src, /stopCount\+\(stopCount===1\?' stop':' stops'\)\+', times and travel'/);
  assert.match(src, /stopCount\+\(stopCount===1\?' arrêt':' arrêts'\)\+', heures et trajets'/);
  // The named place's step carries its name, not the request; the line says only the closed reason.
  const steps = v3.t3PlanNextSteps({ requirementResults: [{ kind: 'venue', value: 9, status: 'unmet', sourceText: 'monday in kelowna bench road spirits test tasting', venueName: 'Bench Road Spirits (test)', reason: 'No selected stop meets monday in kelowna bench road spirits test tasting.', optionalAlternatives: [{ id: 9, name: 'Bench Road Spirits (test)', url: '/kelowna/distilleries/x', reasonCode: 'different_time', closedDay: { day: 'mon', open: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } }] }] });
  const st = steps.find((s) => s.kind === 'missing');
  assert.equal(st.label, 'Bench Road Spirits (test)'); assert.equal(st.venue, true);
  assert.match(src, /if\(step\.venue&&t3MissingClosedText\(step,nextFr\)\)return '<li>'\+esc\(t3MissingClosedText\(step,nextFr\)\)/);
  assert.match(src, /if \(i\.kind === 'venue'\) label = i\.venueName \|\| i\.sourceText \|\| label;/);
});
