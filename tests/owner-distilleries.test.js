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
  assert.equal(text.en.brewery.kindDistillery.eventEx, 'Whisky class, first Saturday');
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
  assert.equal(en.labels.taproom, 'Your tasting room'); assert.equal(en.labels.flights, 'Tastings and bottles'); assert.equal(en.labels.door, 'Your tasting room door');
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
