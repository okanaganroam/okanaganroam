// Breweries in the owner portal (Dayton, Nov 12 2026; drafts/brewery-portal-2026-11-12/SPEC-breweries.md, "Decided"):
// their own 100-point checklist and a 12-screen easy setup (7 essentials, 5 optional, plus "Your menu" for a kitchen),
// venue_brewery_info, the flight price (live from $0 to $40 as the card price, higher waits for our check; "We don't do
// flights" shows no card price), the kind of place read by the Cider search and Build My Trip, "Who's welcome?"
// deciding the Kids badge only for breweries that answered, the Plan your visit lines written from the answers (research
// never overwrites them; a full box sets research aside with an Undo record), and the other types unchanged.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-breweries-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const text = require('../owner-setup-text.js');
const planner = require('../trip-planner.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['12:00', '22:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Brew Test ${type} ${++n}`, slug: `brew-test-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.5, address: `${200 + n} Ellis St, Kelowna`, phone: '250-555-0177', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the brewery portal tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p, h = {}) => fetch(base + p, { headers: h }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, setup = true) => postJson(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const progress = (t, step, status) => postJson(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const visitRows = (id) => ((app.venueVisitInfo(id) || {}).rows || []);
const row = (id, label) => visitRows(id).find((r) => r.label === label);
const research = (id, rows, booking = null) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows, booking_url: booking, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const lastReq = (id, like) => db.prepare(`SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE ? ORDER BY id DESC`).get(id, `%${like}%`).id;

// ---------- Steps and screens ----------
test('steps: breweries get 7 essentials and 5 optional screens, plus Your menu with their own kitchen', async () => {
  assert.deepEqual(app.BREWERY_SETUP_PART1, ['basics', 'hours', 'taproom', 'flights', 'happy', 'photos', 'offer']);
  assert.deepEqual(app.BREWERY_SETUP_PART2, ['story', 'music', 'groups', 'social', 'door', 'menu']);
  const b = mk('brewery'); const t = tokenFor(b.id);
  assert.equal(app.setupStepsFor('brewery', b.id).length, 12, 'no kitchen answer yet: no menu step');
  assert.ok(!app.setupStepsFor('brewery', b.id).includes('menu'));
  assert.equal((await change(t, { brewery_info: { food: 'kitchen' } })).status, 200);
  assert.equal(app.setupStepsFor('brewery', b.id).length, 13, 'our own kitchen: 13 screens');
  assert.equal((await change(t, { brewery_info: { food: 'trucks' } })).status, 200);
  assert.equal(app.setupStepsFor('brewery', b.id).length, 12);
  // Every other type keeps its steps.
  assert.deepEqual(app.setupParts('winery').part1, ['basics', 'hours', 'winery', 'tastings', 'visit', 'photos', 'offer']);
  assert.deepEqual(app.setupParts('cafe').part1, ['basics', 'hours', 'cuisine', 'photos', 'menu', 'spend', 'offer']);
  assert.deepEqual(app.setupParts('pub').part1, ['basics', 'hours', 'closures', 'happy', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(app.setupParts('restaurant').part1, ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(app.setupStepsFor('restaurant'), app.SETUP_STEPS);
});

test('setup page: a brewery gets the brewery setup (no more bounce to the edit page), with its kinds and tiles', async () => {
  const b = mk('brewery', { name: 'Orchard Hill Cider Co' }); const t = tokenFor(b.id);
  const r = await get(`/owner/${t}/setup`);
  assert.equal(r.status, 200);
  const cfg = cfgOf(r.text);
  assert.equal(cfg.brewery, true); assert.equal(cfg.combo, true);
  assert.deepEqual(cfg.part1, app.BREWERY_SETUP_PART1);
  assert.deepEqual(cfg.placeTypes, ['Brewery', 'Cidery', 'Taphouse or beer hall', 'Distillery']);
  assert.equal(cfg.suggestKind, 'Cidery', 'a kind from the name, as a suggestion');
  assert.equal(cfg.cur.place_type, '', 'nothing saved until she taps Save');
  assert.equal(cfg.t.labels.taproom, 'Your taproom'); assert.equal(cfg.t.labels.flights, 'Flights and to go');
  assert.match(cfg.t.hiLead, /About 10 to 20 minutes/);
  assert.equal(cfg.feeLiveMax, 40);
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  for (const k of ['patio', 'heated_patio', 'lake_view', 'dog_friendly', 'live_music', 'sports_tv', 'pool', 'darts', 'shuffleboard', 'arcade', 'board_games', 'nonalcoholic', 'gluten_free', 'picnic_area', 'takes_reservations', 'wheelchair_accessible', 'free_parking', 'rv_parking', 'locally_owned', 'vegan', 'vegetarian', 'takeout']) assert.ok(keys.includes(k), k);
  for (const k of ['local_beer_taps', 'off_sales', 'fireplace', 'beach_access', 'wifi', 'kid_friendly', 'great_groups']) assert.ok(!keys.includes(k), `${k} is hidden for breweries`);
  assert.deepEqual(cfg.kitchenOnly, ['vegan', 'vegetarian', 'takeout']);
  assert.match(cfg.offerLabels.nonalcoholic, /for drivers/);
  // The French page: « 5 à 7 » and « Pour qui ».
  const f = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(f.t.labels.happy, '5 à 7');
  assert.match(f.t.happyQ, /5 à 7 \?$/);
  assert.ok(f.offerGroups.some((g) => g.title === 'Pour qui'));
});

// ---------- venue_brewery_info writer ----------
test('the brewery answers save live from the setup, read back, and bad ones are refused plainly', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  let r = await change(t, { place_type: 'Brewery', brewery_info: { food: 'kitchen', outside: 'no', kitchen: { mode: 'earlier', closes: '21:00' }, to_go: ['cans', 'growler'], minors: { policy: 'minors_until', until: '22:00' }, year: 'all' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(!(r.body.review || []).length, 'live at once');
  assert.deepEqual(app.breweryInfoAnswers(b.id), { food: 'kitchen', outside: 'no', kitchen: { mode: 'earlier', closes: '21:00' }, to_go: ['cans', 'growler'], minors: { policy: 'minors_until', until: '22:00' }, year: 'all' });
  assert.equal(app.breweryKindOf(app.getVenue(b.id)), 'Brewery');
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.brewery_info.food, 'kitchen'); assert.equal(cfg.cur.place_type, 'Brewery');
  // The kitchen time goes with "Our own kitchen" only.
  assert.equal((await change(t, { brewery_info: { food: 'snacks' } })).status, 200);
  assert.equal(app.breweryInfoAnswers(b.id).kitchen, undefined);
  // Refused.
  for (const bad of [{ food: 'buffet' }, { to_go: ['kegs'] }, { to_go: ['none', 'cans'] }, { minors: { policy: 'teens' } }, { kitchen: { mode: 'earlier' } }, { nope: 1 }]) {
    r = await change(t, { brewery_info: { food: 'kitchen', ...bad } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await change(t, { flight_fee: 'twelve' })).status, 400);
  // Another type can't send them.
  const w = mk('winery');
  assert.equal((await change(tokenFor(w.id), { brewery_info: { food: 'none' } })).status, 400);
  assert.equal((await change(tokenFor(w.id), { flight_fee: 12 })).status, 400);
});

// ---------- Flight price ----------
test('flight price: live from $0 to $40 as the card price; over $40 waits for our check; the weekly check skips it', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  app.CARD_PRICES[String(b.id)] = { from: 11, basis: 'Tasting flight', conf: 'site', source: 'https://example.com/taproom' };
  const cfg0 = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg0.researchFee, 11, 'research’s flight price is offered as a starting point');
  let r = await change(t, { flight_fee: 40 });
  assert.equal(r.status, 200); assert.ok(!(r.body.review || []).length);
  assert.equal(app.cardPriceFor(b.id), 'From $40');
  assert.equal(app.priceCheck.isOwnerPrice(b.id), true, 'the weekly price check leaves it alone');
  assert.equal(row(b.id, 'Flights').text, '$40 a flight.');
  r = await change(t, { flight_fee: 55 });
  assert.equal(r.status, 200); assert.deepEqual(r.body.review, ['flight_fee'], 'over $40 is checked first');
  assert.equal(app.breweryFlightFee(b.id), 40, 'the page keeps $40 until we approve');
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.flight_fee_waiting, 55);
  const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0").get(b.id);
  assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true);
  assert.equal(app.cardPriceFor(b.id), 'From $55');
  r = await change(t, { flight_fee: 12 });
  assert.equal(app.cardPriceFor(b.id), 'From $12');
  // A bowling-lane price is never offered as a flight price.
  const lanes = mk('brewery');
  app.CARD_PRICES[String(lanes.id)] = { from: 45, per: 'hour', basis: 'Bowling lane rental', conf: 'site' };
  assert.equal(cfgOf((await get(`/owner/${tokenFor(lanes.id)}/setup`)).text).researchFee, null);
});

test('“We don’t do flights” gives no card price; a price later takes it back; Undo restores research’s price', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  app.CARD_PRICES[String(b.id)] = { from: 12, basis: 'Flight of four', conf: 'site', source: 'https://example.com' };
  app.priceCheck.applyOverrides();
  assert.equal(app.cardPriceFor(b.id), 'From $12');
  assert.equal((await change(t, { brewery_info: { no_flights: true } })).status, 200);
  assert.equal(app.cardPriceFor(b.id), null, 'no card price');
  assert.equal(row(b.id, 'Flights').text, 'No tasting flights.');
  assert.ok(db.prepare("SELECT 1 FROM price_overrides WHERE venue_id = ? AND reviewer = 'owner' AND hidden = 1").get(b.id), 'the owner’s answer hides it');
  // Undo: the owner's hiding goes (the card shows research's price again, as it was).
  assert.equal(app.undoOwnerInstantChange(lastReq(b.id, 'no_flights'), 'test').ok, true);
  assert.equal(db.prepare('SELECT 1 FROM price_overrides WHERE venue_id = ?').get(b.id), undefined);
  assert.equal(row(b.id, 'Flights'), undefined);
  // A price after "no flights": the price shows.
  assert.equal((await change(t, { brewery_info: { no_flights: true } })).status, 200);
  assert.equal((await change(t, { brewery_info: { no_flights: null } })).status, 200);
  assert.equal((await change(t, { flight_fee: 14 })).status, 200);
  assert.equal(app.cardPriceFor(b.id), 'From $14');
});

// ---------- Kind: cider search and Build My Trip ----------
test('kind of place: the map’s Cider and Brewery searches and Build My Trip’s “beer, not cider” read the owner’s answer', async () => {
  const tagIdx = (key) => app.MAP_TAGS.findIndex((x) => x.key === key);
  const tags = (id) => app.mapPlaceTags(db.prepare('SELECT * FROM venues WHERE id = ?').get(id));
  // A cidery whose name doesn't say cider.
  const c = mk('brewery', { name: 'Orchard Lane Farm' });
  assert.ok(tags(c.id).includes(tagIdx('brewery')), 'unanswered: guessed from the name (a brewery)');
  assert.equal((await change(tokenFor(c.id), { place_type: 'Cidery' })).status, 200);
  assert.ok(tags(c.id).includes(tagIdx('cider')), 'the owner said Cidery');
  assert.ok(!tags(c.id).includes(tagIdx('brewery')));
  // A brewery whose description mentions a cider.
  const bw = mk('brewery', { name: 'Hop Valley Ales', description: 'Ales, lagers and one guest cider on tap.' });
  assert.ok(tags(bw.id).includes(tagIdx('cider')), 'unanswered: the old guess');
  assert.equal((await change(tokenFor(bw.id), { place_type: 'Brewery' })).status, 200);
  assert.ok(!tags(bw.id).includes(tagIdx('cider')) && tags(bw.id).includes(tagIdx('brewery')));
  // Build My Trip: the kind is in the facts, and "beer" pushes a cidery down.
  assert.equal(planner.breweryIsCidery({ breweryKind: 'Cidery', cuisine: '' }), true);
  assert.equal(planner.breweryIsCidery({ breweryKind: 'Brewery', cuisine: 'Craft cider' }), false, 'the owner’s answer beats the cuisine words');
  assert.equal(planner.breweryIsCidery({ cuisine: 'Craft cider' }), true, 'unanswered: as before');
  const facts = app.buildTripPlannerFacts ? app.buildTripPlannerFacts(false) : null;
  const f = facts.find((x) => x.id === c.id);
  assert.equal(f.breweryKind, 'Cidery');
});

// ---------- Who's welcome and the Kids badge ----------
test('who’s welcome overrides the Kids badge only for breweries that answered (no bulk change)', async () => {
  const kidsRow = (id) => db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  const inSql = (id) => !!db.prepare(`SELECT 1 FROM venues WHERE id = ? AND ${app.KID_FRIENDLY_SQL}`).get(id);
  const researched = mk('brewery', { kid_friendly: 1 });
  const none = mk('brewery', { kid_friendly: 0 });
  // Unanswered: the researched badge stands, as today.
  assert.equal(app.kidFriendlyPublic(kidsRow(researched.id)), true);
  assert.equal(inSql(researched.id), true);
  assert.equal(app.kidFriendlyPublic(kidsRow(none.id)), false);
  assert.equal(inSql(none.id), false);
  // Adults only turns it off (page, guides, Build My Trip); the stored column is never changed.
  assert.equal((await change(tokenFor(researched.id), { brewery_info: { minors: { policy: 'adults' } } })).status, 200);
  assert.equal(app.kidFriendlyPublic(kidsRow(researched.id)), false);
  assert.equal(inSql(researched.id), false);
  assert.equal(kidsRow(researched.id).kid_friendly, 1, 'stored badge untouched');
  assert.equal(app.rowToVenue(kidsRow(researched.id)).kid_friendly, false);
  // All ages, or until a set time, turns it on.
  assert.equal((await change(tokenFor(none.id), { brewery_info: { minors: { policy: 'minors_until', until: '22:00' } } })).status, 200);
  assert.equal(app.kidFriendlyPublic(kidsRow(none.id)), true);
  assert.equal(inSql(none.id), true);
  assert.equal(row(none.id, 'Kids & dogs').text, 'Minors welcome with an adult until 10 PM.');
  // Pubs keep their rule; restaurants, cafés and wineries read the stored badge.
  const pub = mk('pub', { kid_friendly: 1 });
  assert.equal(inSql(pub.id), false, 'a pub that hasn’t answered still shows no kids badge');
  for (const type of ['restaurant', 'cafe', 'winery']) { const v = mk(type, { kid_friendly: 1 }); assert.equal(inSql(v.id), true, type); }
});

// ---------- Plan your visit lines ----------
test('plan your visit: Flights, Food, To go and Kids & dogs are written from the answers; research never overwrites them', async () => {
  const b = mk('brewery', { dog_friendly: 1 }); const t = tokenFor(b.id);
  research(b.id, [
    { label: 'Known for', text: 'Hazy IPAs.' }, { label: 'Flights', text: 'Flights of four, $12.' }, { label: 'Food', text: 'Pizza truck on weekends (Tony’s).' },
    { label: 'To go', text: 'Cans.' }, { label: 'Kids & dogs', text: 'Kids until 8 PM.' }, { label: 'Games', text: 'Trivia Tuesdays.' },
  ]);
  assert.equal((await change(t, { flight_fee: 12, brewery_info: { food: 'trucks', outside: 'yes', to_go: ['cans', 'bottles', 'growler'], minors: { policy: 'all_ages' } } })).status, 200);
  assert.equal(row(b.id, 'Flights').text, '$12 a flight.');
  assert.equal(row(b.id, 'Food').text, 'Food trucks most days. Outside food welcome.', 'never a truck’s name');
  assert.equal(row(b.id, 'To go').text, 'Cans, bottles and growler fills to go.');
  assert.equal(row(b.id, 'Kids & dogs').text, 'All ages welcome. Dogs welcome.');
  assert.equal(row(b.id, 'Known for').text, 'Hazy IPAs.', 'not answered: research’s');
  assert.equal(row(b.id, 'Games').text, 'Trivia Tuesdays.', 'events not answered yet');
  // French lines ride along.
  const info = app.venueVisitInfo(b.id);
  assert.equal(info.owner_fr.Food.fr, 'Camions-restaurants la plupart des jours. Vous pouvez apporter votre pique-nique.' /* distillery test 2 */);
  assert.equal(info.owner_fr['To go'].fr, 'Canettes, bouteilles et remplissage de growlers pour emporter.');
  // Owner lines first, never folded under "More".
  const html = app.visitInfoHtml(info, false);
  const open = html.split('<details')[0];
  for (const l of ['Flights', 'Food', 'To go', 'Kids &amp; dogs']) assert.ok(open.includes(`<span class="visit-label">${l}</span>`), l);
  // Research can't bring its lines back over hers.
  research(b.id, [{ label: 'Flights', text: 'Research flights' }, { label: 'Food', text: 'Research food' }, { label: 'Kids & dogs', text: 'Research kids' }, { label: 'To go', text: 'Research to go' }]);
  assert.equal(row(b.id, 'Flights').text, '$12 a flight.');
  assert.equal(row(b.id, 'Food').text, 'Food trucks most days. Outside food welcome.');
  assert.equal(row(b.id, 'Kids & dogs').text, 'All ages welcome. Dogs welcome.');
  assert.equal(row(b.id, 'To go').text, 'Cans, bottles and growler fills to go.');
  // The kitchen line with its close time; no food; snacks; nothing to go.
  const k = mk('brewery'); const tk = tokenFor(k.id);
  assert.equal((await change(tk, { brewery_info: { food: 'kitchen', kitchen: { mode: 'earlier', closes: '21:00' }, outside: 'no', to_go: ['none'] } })).status, 200);
  assert.equal(row(k.id, 'Food').text, 'Our own kitchen; it closes at 9 PM. No outside food, please.');
  assert.equal(app.venueVisitInfo(k.id).owner_fr.Food.fr, 'Cuisine sur place; elle ferme à 21 h. Pas de nourriture de l’extérieur.');
  assert.equal(row(k.id, 'To go').text, 'Nothing to go.');
  // Weekly events answered: research's Games line is set aside (Undo brings it back).
  assert.equal((await change(t, { not_offered: ['entertainment'] })).status, 200);
  assert.equal(row(b.id, 'Games'), undefined);
  assert.ok((app.venueVisitInfo(b.id).owner_was || {}).Games, 'kept for an Undo');
  // "No dogs" in the Kids & dogs line once dogs are answered that way.
  const nd = mk('brewery'); const tn = tokenFor(nd.id);
  assert.equal((await change(tn, { not_offered: ['dogs'] })).status, 200);
  assert.equal((await change(tn, { brewery_info: { minors: { policy: 'adults' } } })).status, 200);
  assert.equal(row(nd.id, 'Kids & dogs').text, 'Adults only (19+). No dogs.');
});

test('plan your visit cap: a full box sets research aside before her lines, records it, and Undo brings it back', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  research(b.id, [
    { label: 'Known for', text: 'Hazy IPAs.' }, { label: 'Food', text: 'Pizza on site.' }, { label: 'Groups', text: 'Book ahead for 8 or more.' },
    { label: 'Tours', text: 'Tours on Saturdays.' }, { label: 'Winter', text: 'Patio closes in October.' }, { label: 'Parking', text: 'Street parking.' }, { label: 'Games', text: 'Shuffleboard.' },
  ]);
  assert.equal(visitRows(b.id).length, 7);
  assert.equal((await change(t, { flight_fee: 10, brewery_info: { to_go: ['cans'], minors: { policy: 'all_ages' } } })).status, 200);
  const labels = visitRows(b.id).map((r) => r.label);
  assert.equal(labels.length, 7);
  for (const l of ['Flights', 'To go', 'Kids & dogs']) assert.ok(labels.includes(l), `${l} (hers) never drops: ${labels.join()}`);
  const dropped = app.venueVisitInfo(b.id).owner_dropped || [];
  assert.equal(dropped.length, 3, 'three research rows set aside, each recorded');
  assert.ok(dropped.every((r) => !r.owned));
  // Undo the answers: research's rows come back.
  const u1 = app.undoOwnerInstantChange(lastReq(b.id, 'to_go'), 'test');
  assert.equal(u1.ok, true, JSON.stringify(u1));
  const back = visitRows(b.id).map((r) => r.label);
  for (const l of ['Known for', 'Food', 'Groups', 'Tours', 'Winter', 'Parking', 'Games']) assert.ok(back.includes(l), `${l} back: ${back.join()}`);
  assert.ok(!back.includes('Flights') && !back.includes('To go') && !back.includes('Kids & dogs'));
  // A research Games line a full box set aside, then replaced by the weekly events answer, comes back on Undo.
  assert.equal((await change(t, { flight_fee: 10, brewery_info: { to_go: ['cans'], minors: { policy: 'all_ages' } } })).status, 200);
  assert.ok(!visitRows(b.id).some((r) => r.label === 'Games'), 'set aside by the full box');
  assert.equal((await change(t, { not_offered: ['entertainment'] })).status, 200);
  assert.equal(app.venueVisitInfo(b.id).owner_was.Games.text, 'Shuffleboard.', 'what it replaced is kept');
  assert.equal(app.undoOwnerInstantChange(lastReq(b.id, 'entertainment'), 'test').ok, true);
  assert.equal(app.undoOwnerInstantChange(lastReq(b.id, 'to_go'), 'test').ok, true);
  assert.ok(visitRows(b.id).some((r) => r.label === 'Games' && r.text === 'Shuffleboard.'), visitRows(b.id).map((r) => r.label).join());
});

test('owner-verified listings: the brewery answers never change their hours or description', async () => {
  const b = mk('brewery', { description: 'Owner verified words.' }); const t = tokenFor(b.id);
  db.prepare("UPDATE venues SET hours_source = 'venue_owner', hours_checked_at = ? WHERE id = ?").run(today, b.id);
  const before = db.prepare('SELECT hours, description, hours_source FROM venues WHERE id = ?').get(b.id);
  assert.equal((await change(t, { place_type: 'Brewery', flight_fee: 12, brewery_info: { food: 'none', to_go: ['cans'], minors: { policy: 'adults' }, year: 'all' } })).status, 200);
  assert.deepEqual(db.prepare('SELECT hours, description, hours_source FROM venues WHERE id = ?').get(b.id), before);
});

// ---------- Checklist ----------
test('checklist: brewery weights sum to 100 in the spec groups; other types keep theirs', () => {
  const items = pc.itemsFor('brewery');
  assert.equal(items.reduce((a, i) => a + i.w, 0), 100);
  const by = (g) => items.filter((i) => i.group === g).reduce((a, i) => a + i.w, 0);
  assert.deepEqual({ basics: by('basics'), hours: by('hours'), photos: by('photos'), taproom: by('taproom'), yourvisit: by('yourvisit'), about: by('about'), social: by('social'), finding: by('finding'), confirmed: by('confirmed') },
    { basics: 14, hours: 16, photos: 16, taproom: 21, yourvisit: 15, about: 8, social: 6, finding: 2, confirmed: 2 });
  assert.ok(!items.some((i) => i.key === 'booking_link'), 'the booking link is unscored');
  for (const type of ['restaurant', 'pub', 'cafe', 'winery']) assert.equal(pc.itemsFor(type).reduce((a, i) => a + i.w, 0), 100);
  assert.ok(!pc.itemsFor('winery').some((i) => ['brewery_kind', 'flight_price', 'to_go'].includes(i.key)));
  assert.equal(pc.quickFieldFor('winery', 'food_here'), 'winery_info');
  assert.equal(pc.quickFieldFor('brewery', 'food_here'), 'brewery_info');
});

test('checklist: a no-kitchen, no-flights cidery reaches 100% (menu done, every “we don’t have one” counts)', async () => {
  const b = mk('brewery', { name: 'Orchard Cider House', dog_friendly: 0 }); const t = tokenFor(b.id);
  const steps = [
    { place_type: 'Cidery' }, { brewery_info: { food: 'none', outside: 'yes', no_flights: true, to_go: ['bottles'], year: 'seasonal' } }, { open_months: '5-10' },
    { hours_checked: true }, { not_offered: ['happy_hour', 'entertainment', 'pyv_groups', 'dogs'] }, { brewery_info: { minors: { policy: 'all_ages' } } },
    { badges: { wheelchair_accessible: true } }, { visit_rows: { known_for: 'Dry ciders from our own orchard' } },
    { instagram_url: '@ciderfixture' }, { facebook_url: 'https://www.facebook.com/ciderfixture' },
  ];
  for (const c of steps) { const r = await change(t, c); assert.equal(r.status, 200, `${JSON.stringify(c)}: ${JSON.stringify(r.body)}`); }
  const v = app.getVenue(b.id);
  const live = app.ownerVenueSnapshot(v, null);
  const input = { type: 'brewery', address: v.address, latitude: 1, longitude: 1, phone: v.phone, website: v.website, hasHours: true, hoursCheckedAt: today, imageUrl: '/images/owner/x.jpg', photoCount: 3,
    placeType: live.place_type, breweryInfo: live.brewery_info, flightFee: live.flight_fee, openMonths: '5-10', visitLabels: visitRows(b.id).map((x) => x.label), description: 'x'.repeat(130),
    instagramUrl: 'x', facebookUrl: 'x', hasArrival: true, claimed: true, dogFriendly: false, ownerFeatures: ['wheelchair_accessible'], declaredNone: live.not_offered, offerAnswered: true };
  const r = pc.scoreCompleteness(input, { today });
  assert.deepEqual(r.missing.map((x) => x.key), []);
  assert.equal(r.pct, 100);
  assert.equal(pc.badgeState(r, true), 'earned');
  // Menu: done without a kitchen; not done with one until a menu is added.
  assert.equal(pc.doneMap({ ...input, breweryInfo: { food: 'kitchen' } }, today).menu, false);
  assert.equal(pc.doneMap({ ...input, breweryInfo: { food: 'trucks' } }, today).menu, true);
  // "Nearly there" names what's missing: a short story and a missing who's welcome.
  const r2 = pc.scoreCompleteness({ ...input, description: 'Short.', breweryInfo: { ...input.breweryInfo, minors: undefined } }, { today });
  assert.deepEqual(r2.missing.map((x) => x.key).sort(), ['description', 'dogs_kids']);
  assert.ok(r2.pct < 100);
  // The setup's own score names nothing a brewery isn't asked.
  const sc = app.setupScore(app.venueForOwnerToken(t));
  assert.ok(!sc.left.some((x) => ['specials', 'avg_spend', 'cuisine', 'sports', 'games', 'kitchen', 'menu'].includes(x.k)), JSON.stringify(sc.left));
});

test('checklist: the brewery items score from the owner answers', () => {
  const base0 = { type: 'brewery', address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: today };
  const done = (x) => pc.doneMap({ ...base0, ...x }, today);
  assert.equal(done({ placeType: 'Cidery' }).brewery_kind, true);
  assert.equal(done({ placeType: 'Estate winery' }).brewery_kind, false);
  assert.equal(done({ flightFee: 12 }).flight_price, true);
  assert.equal(done({ breweryInfo: { no_flights: true } }).flight_price, true, '“We don’t do flights” counts');
  assert.equal(done({ flightFee: null }).flight_price, false);
  assert.equal(done({ breweryInfo: { to_go: ['none'] } }).to_go, true);
  assert.equal(done({ breweryInfo: { year: 'all' } }).season, true);
  assert.equal(done({ breweryInfo: { food: 'none' } }).food_here, true);
  assert.equal(done({ breweryInfo: { minors: { policy: 'adults' } }, offerAnswered: true }).dogs_kids, true);
  assert.equal(done({ offerAnswered: true }).dogs_kids, false, 'who’s welcome is needed');
  assert.equal(done({ nightsCount: 1 }).entertainment, true);
});

// ---------- Hours and closed days ----------
test('closed days are saved as closed; the Hours step needs its holidays part; Instagram and Facebook are one screen', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  const week = { mon: [], tue: [], wed: [['14:00', '21:00']], thu: [['14:00', '21:00']], fri: [['12:00', '22:00']], sat: [['12:00', '22:00']], sun: [['12:00', '20:00']] };
  const hr = await change(t, { hours: week, hours_checked: true });
  assert.equal(hr.status, 200, JSON.stringify(hr.body));
  const stored = JSON.parse(db.prepare('SELECT hours FROM venues WHERE id = ?').get(b.id).hours);
  assert.ok('mon' in stored && 'tue' in stored, JSON.stringify(stored));
  assert.equal(stored.mon, null); assert.equal(stored.tue, null);
  const parsed = require('../hours.js').parseHours(stored);
  assert.equal(parsed.days.mon.status, 'closed'); assert.equal(parsed.days.tue.status, 'closed');
  const page = await get(`/kelowna/breweries/${app.getVenue(b.id).slug}`);
  assert.equal(page.status, 200);
  assert.ok(!/Hours not listed/.test(page.text), 'closed days read Closed, never “Hours not listed”');
  assert.equal((await progress(t, 'hours', 'live')).status, 200);
  assert.equal(app.setupState(b.id), 'none', 'hours without their holidays part are not done yet');
  assert.equal((await progress(t, 'closures', 'live')).status, 200);
  for (const s of ['instagram', 'facebook', 'social']) assert.equal((await progress(t, s, 'unsure')).status, 200, s);
  for (const s of app.BREWERY_SETUP_PART1) assert.equal((await progress(t, s, 'skip')).status, 200, s);
  assert.equal(app.setupState(b.id), 'essentials');
  for (const s of app.BREWERY_SETUP_PART2) await progress(t, s, 'skip');
  assert.equal(app.setupState(b.id), 'done');
});

// ---------- Words ----------
test('every brewery word has English and French, with French spacing', () => {
  const keys = (o, p = '') => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], `${p}${k}.`) : [`${p}${k}`]));
  const en = keys(text.en.brewery), fr = new Set(keys(text.fr.brewery));
  assert.deepEqual(en.filter((k) => !fr.has(k)), []);
  const at = (o, k) => k.split('.').reduce((a, x) => a[x], o);
  for (const k of fr) {
    const f = at(text.fr.brewery, k);
    if (typeof f === 'string') assert.ok(!/\S[?!](\s|$)/.test(f) && !/[^\s \d/]:\s/.test(f), `${k}: French spacing (${f})`);
  }
  for (const s of app.setupStepsFor('brewery')) {
    assert.ok({ ...text.en.labels, ...text.en.brewery.labels }[s], `en label ${s}`);
    assert.ok({ ...text.fr.labels, ...text.fr.brewery.labels }[s], `fr label ${s}`);
  }
  assert.equal(text.fr.brewery.labels.happy, '5 à 7');
  // The public French lines and kinds.
  assert.equal(app.frPlaceType('Cidery'), 'Cidrerie');
  assert.equal(app.PLACE_TYPE_DISPLAY_FR['Taphouse or beer hall'], 'Bar à bières');
  const b = { id: -1, type: 'brewery', dog_friendly: 0 };
  const lines = app.breweryVisitLines(b, { fee: 12.5, to_go: ['crowler'], food: 'snacks' });
  assert.equal(lines.Flights.fr, '12,50 $ le plateau.');
  assert.equal(lines['To go'].fr, 'Remplissage de crowlers pour emporter.');
  assert.equal(lines.Food.fr, 'Collations seulement.');
});

// ---------- Help ----------
test('help topics for breweries: flight price, kids rule, food trucks, seasonal hours; truthful, no “we emailed you”, no upsell', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  const ohb = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`, `/owner/${t}`]) {
    const r = await get(p); assert.equal(r.status, 200, p);
    const topics = ohb(r.text).topics;
    for (const id of ['brewery-price', 'brewery-kids', 'brewery-food-trucks', 'brewery-seasonal-hours']) {
      const tp = topics.find((x) => x.id === id);
      assert.ok(tp, `${p}: ${id}`);
      assert.ok(!/emailed you|featured|feature your|upgrade/i.test(tp.a), `${id}: no emailed link and no upsell`);
      assert.ok(!/\S[?!](\s|$)/.test(tp.qFr), `${id}: French spacing in the question`);
    }
  }
  const T = app.BREWERY_SETUP_HELP_TOPICS;
  const price = T.find((x) => x.id === 'brewery-price');
  assert.match(price.a, /right away/); assert.match(price.a, /over \$40 is checked first/); assert.match(price.a, /takes the price off your card/);
  assert.match(T.find((x) => x.id === 'brewery-kids').a, /on your page right away/);
  assert.match(T.find((x) => x.id === 'brewery-food-trucks').a, /never a truck’s name/);
  assert.match(T.find((x) => x.id === 'brewery-seasonal-hours').a, /Change an answer<\/strong>, then <strong>Hours and holidays/);
  for (const tp of T) assert.ok(!/emailed you|link we emailed/i.test(`${tp.a} ${tp.aFr}`), tp.id);
});

// ---------- Build My Trip ----------
test('Build My Trip: a stop shows the owner’s flight price; a brewery closed for the season is never offered back', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  assert.equal((await change(t, { flight_fee: 12 })).status, 200);
  const pv = planner.publicVenue({ id: b.id, type: 'brewery', url: '/kelowna/breweries/x', flightFee: 12, features: {}, collections: [] }, null);
  assert.deepEqual(pv.cost, { cents: 1200, label: 'Flight', labelFr: 'Plateau de dégustation', source: null });
  // Wineries keep their own tasting fee.
  const pw = planner.publicVenue({ id: 1, type: 'winery', url: '/x', tastingFee: 15, features: {}, collections: [] }, null);
  assert.equal(pw.cost.label, 'Tasting');
  // A brewery closed for the season (Nov–Apr) on the trip's date is never an alternative.
  const closed = { id: 99, name: 'Closed Cidery', type: 'brewery', region: 'kelowna', url: '/kelowna/breweries/closed', openMonths: '5-10', hours: WEEK, features: {}, collections: [], activities: [] };
  assert.equal(planner.dayClosedAllDay({ ...closed, hours: JSON.stringify({ ...JSON.parse(WEEK), mon: [] }) }, '2026-11-16'), true);
});

// ---------- Other types unchanged ----------
test('cafés, restaurants, pubs and wineries are unchanged: no brewery fields, kinds, screens or tiles', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery']) {
    const v = mk(type); const t = tokenFor(v.id);
    const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
    assert.ok(!cfg.brewery, type);
    assert.ok(!cfg.part1.includes('taproom') && !cfg.part1.includes('flights'), type);
    assert.ok(!('brewery_info' in cfg.cur), type);
    assert.ok(!cfg.placeTypes.includes('Cidery'), type);
    assert.ok(!('brewery_info' in app.ownerVenueSnapshot(app.getVenue(v.id), null)), type);
  }
  assert.deepEqual(app.ownerExtraBadgesFor('winery'), ['heated_patio', 'picnic_area', 'free_parking', 'rv_parking', 'wheelchair_accessible', 'locally_owned', 'service_dogs']);
});

// ---------- Brewery test 1 fixes (2026-11-12; drafts/fresh-eyes-brewery1-2026-11-12/REPORT.md) ----------
const ohbCfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
const setupScript = (html) => { assert.match(html, /window\.SETUP_CFG/); return fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8'); };

test('fix 1: “how do I update our tap list?” has a brewery answer (EN + FR), on setup, edit and menu pages; tile says menu or tap list', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  for (const p of [`/owner/${t}/setup`, `/owner/${t}`, `/owner/${t}/menu`, `/fr/owner/${t}/setup`]) {
    const r = await get(p); assert.equal(r.status, 200, p);
    const tp = ohbCfg(r.text).topics.find((x) => x.id === 'brewery-taplist');
    assert.ok(tp, p);
    assert.ok(!/emailed you|featured|upgrade/i.test(`${tp.a} ${tp.aFr}`), 'no emailed link, no upsell');
  }
  const tp = app.BREWERY_SETUP_HELP_TOPICS.find((x) => x.id === 'brewery-taplist');
  for (const k of ['tap list', 'taps', 'beer list', 'beers', 'draft', 'on tap']) assert.ok(tp.keys.includes(k), k);
  for (const k of ['liste des bieres', 'en fut', 'pression']) assert.ok(tp.keysFr.includes(k), k);
  assert.ok(tp.over.includes('menu-add'));
  assert.match(tp.a, /no separate tap list/); assert.match(tp.a, /Update my menu or tap list/); assert.match(tp.a, /Take a photo of your menu/); assert.match(tp.a, /Just add a link to your menu/); assert.match(tp.a, /as often as you like/);
  assert.match(tp.aFr, /Mettre à jour mon menu ou ma liste des bières/);
  // Other types: the general menu topic knows the words too.
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /Update my menu or tap list/);
  assert.doesNotMatch((await get(`/owner/${tokenFor(mk('restaurant').id)}`)).text, /Update my menu or tap list/);
  // The menu step and checklist say "menu or tap list" for a brewery, never "your food menu" only.
  assert.equal(text.en.brewery.labels.menu, 'Your menu or tap list');
  assert.match(text.en.brewery.menuQ, /menu or tap list/);
  const menuItem = pc.BREWERY_ITEMS.find((i) => i.key === 'menu');
  assert.doesNotMatch(menuItem.whyEn, /food menu/); assert.match(menuItem.whyEn, /tap list/);
});

test('fix 2: Build My Trip with kids: “Kids welcome with an adult until 9 PM” on the stop; not planned after it; adults only excluded', () => {
  const W = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
  const base = { type: 'brewery', region: 'kelowna', url: '/kelowna/breweries/x', hours: W, collections: [], activities: [] };
  const v = { ...base, id: 1, kidsUntil: '21:00', features: { kid_friendly: true } };
  const pv = planner.publicVenue(v, null);
  assert.equal(pv.kidsUntil, '21:00');
  assert.equal(pv.badges.find((x) => x.key === 'kid_friendly').label, 'Kids until 9 PM');
  // No time for minors, or no kids badge: unchanged.
  assert.equal(planner.publicVenue({ ...base, id: 2, features: { kid_friendly: true } }, null).kidsUntil, undefined);
  assert.equal(planner.publicVenue({ ...base, id: 3, kidsUntil: '21:00', features: {} }, null).kidsUntil, undefined);
  // French copy for the caveat.
  const tr = require('../trip-french-copy.js').t3FrenchText;
  assert.equal(tr('Kids welcome with an adult until 9 PM'), 'Enfants bienvenus avec un adulte jusqu’à 21 h');
  assert.match(tr('Kids welcome with an adult until 9 PM, so plan to leave by then'), /prévoyez de partir avant/);
});

test('fix 2: the planner names the time on a kids stop, flags or skips a late one, and adults trips never see it', async () => {
  const W = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
  const b = mk('brewery', { name: 'Kidsclock Brewing', slug: 'kidsclock-brewing', hours: W, kid_friendly: 1 }); const t = tokenFor(b.id);
  const plan = async (txt) => (await fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) }).then((r) => r.json()));
  const stopsOf = (j) => (j.recommendations || []).concat(...(j.days || []).map((d) => d.stops), (j.itinerary || {}).stops || [], (j.outing || {}).stops || []).filter((s) => s && s.venue && s.venue.id === b.id);
  const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on';
  try {
    assert.equal((await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '21:00' } } })).status, 200);
    let s = stopsOf(await plan('Tuesday evening in Kelowna with the kids: Kidsclock Brewing from 7 to about 10 PM'));
    assert.ok(s.length, 'listed');
    assert.ok(s[0].caveats.includes('Kids welcome with an adult until 9 PM, so plan to leave by then'), JSON.stringify(s[0].caveats));
    assert.equal(s[0].caveats.filter((c) => /^Kids welcome/.test(c)).length, 1, 'once');
    // French: « de 19 h à environ 22 h ».
    s = stopsOf(await plan('Mardi soir à Kelowna avec nos deux enfants. Quiz à Kidsclock Brewing de 19 h à environ 22 h.'));
    if (s.length) assert.ok(s[0].caveats.includes('Kids welcome with an adult until 9 PM, so plan to leave by then'), JSON.stringify(s[0].caveats));
    s = stopsOf(await plan('Tuesday evening in Kelowna, Kidsclock Brewing from 7 to about 10 PM'));
    assert.ok(!s.length || !s[0].caveats.some((c) => /^Kids welcome/.test(c)), 'not on an adults trip');
    // Until 6 PM: an evening with kids doesn't plan it.
    assert.equal((await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '18:00' } } })).status, 200);
    s = stopsOf(await plan('Tuesday evening in Kelowna with the kids, a brewery and dinner'));
    assert.equal(s.length, 0, 'not planned after the time for minors');
    // Adults only: never on a kids trip.
    assert.equal((await change(t, { brewery_info: { minors: { policy: 'adults' } } })).status, 200);
    s = stopsOf(await plan('Tuesday afternoon in Kelowna with the kids, a brewery'));
    assert.equal(s.length, 0, 'adults only is left out');
  } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; }
});

test('fix 3: the flights lead names her current pick and changes with it; no number before a pick', async () => {
  assert.doesNotMatch(text.en.brewery.flightLead, /\$\d/); assert.doesNotMatch(text.fr.brewery.flightLead, /\d+\s?\$/);
  assert.match(text.en.brewery.flightLeadPick, /\{x\}/);
  const b = mk('brewery'); const t = tokenFor(b.id);
  const html = (await get(`/owner/${t}/setup`)).text;
  const s = setupScript(html);
  assert.match(s, /function flightLeadText\(\)/);
  assert.match(s, /id="suFlightLead"/);
  assert.match(s, /sfe\.addEventListener\('input', function\(\)\{ readBrew\(\); sfl\.textContent = flightLeadText\(\); \}\)/);
  assert.equal(text.en.brewery.flightLeadPick.replace('{x}', text.en.brewery.feeCard.replace('{x}', '$14')), 'It shows on your card as “From $14” right away.');
});

test('fix 4: “Your answers so far” reads “on your page” once nothing for that step waits (all types)', async () => {
  for (const type of ['brewery', 'cafe', 'winery', 'restaurant']) {
    const v = mk(type); const t = tokenFor(v.id);
    assert.equal((await change(t, { description: `A brand new story for this ${type}, long enough to be checked by us first.` })).status, 200);
    assert.equal((await progress(t, 'story', 'day')).status, 200);
    let r = await fetch(`${base}/owner/${t}/setup/progress`).then((x) => x.json());
    assert.ok(r.waiting.includes('story'), `${type}: waiting while the story is pending`);
    assert.deepEqual(app.setupDoneNow(app.getVenue(v.id), r.progress.done).story, 'day');
    const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").get(v.id);
    assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true);
    r = await fetch(`${base}/owner/${t}/setup/progress`).then((x) => x.json());
    assert.ok(!r.waiting.includes('story'), type);
    assert.equal(r.progress.done.story, 'day', 'the stored progress is untouched');
    assert.equal(app.setupDoneNow(app.getVenue(v.id), r.progress.done).story, 'live', type);
    const html = (await get(`/owner/${t}/setup`)).text;
    assert.deepEqual(cfgOf(html).waiting, []);
    // The help bot's "did it go through?" list says "on your page" too.
    const st = ohbCfg(html).topics.find((x) => x.id === 'setup-status');
    if (st) assert.doesNotMatch(st.a, /within a day<\/li>/);
  }
  // A pending photo holds the photos step back; a waiting field nobody maps holds every step back.
  const v = mk('brewery');
  db.prepare("INSERT INTO owner_photos (venue_id, file, preview_key, credit, rights_confirmed_at, status, main_requested) VALUES (?, ?, ?, 'Jess', ?, 'pending', 0)").run(v.id, `fx-${v.id}.jpg`, `pk-${v.id}`, today);
  assert.deepEqual(app.setupWaitingSteps(app.getVenue(v.id)), ['photos']);
  assert.equal(app.setupDoneNow(app.getVenue(v.id), { photos: 'day', hours: 'day' }).photos, 'day');
  assert.equal(app.setupDoneNow(app.getVenue(v.id), { photos: 'day', hours: 'day' }).hours, 'live');
});

test('fix 5: minors until a time shows “Kids until 9 PM” on the page and cards; adults only shows no kids chip; unanswered unchanged', async () => {
  const b = mk('brewery', { kid_friendly: 0 }); const t = tokenFor(b.id);
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '21:00' } } })).status, 200);
  const v = app.getVenue(b.id);
  assert.equal(app.kidsChipLabel(v, false), 'Kids until 9 PM');
  assert.equal(app.kidsChipLabel(v, true), 'Enfants jusqu’à 21 h');
  const row0 = db.prepare('SELECT * FROM venues WHERE id = ?').get(b.id);
  assert.equal(app.rowToVenue(row0).kids_until, '21:00', 'the API carries it for the cards');
  const page = await get(`/${v.region}/breweries/${v.slug}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Kids until 9 PM/);
  assert.doesNotMatch(page.text, />Kid-friendly</);
  const pageFr = await get(`/fr/${v.region}/breweries/${v.slug}`);
  if (pageFr.status === 200 && /<html lang="fr/.test(pageFr.text)) assert.match(pageFr.text, /Enfants jusqu’à 21 h/);
  // Adults only: no kids chip at all.
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'adults' } } })).status, 200);
  const p2 = await get(`/${v.region}/breweries/${v.slug}`);
  assert.doesNotMatch(p2.text, /Kids until|>Kid-friendly</);
  assert.equal(app.rowToVenue(db.prepare('SELECT * FROM venues WHERE id = ?').get(b.id)).kids_until, undefined);
  // An unanswered brewery and a pub keep what they had (Decided 3).
  const un = mk('brewery', { kid_friendly: 1 });
  assert.equal(app.kidsChipLabel(app.getVenue(un.id), false), '');
  const app_js = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  assert.match(app_js, /function badgeLabelFor\(b, v\)/);
  assert.equal((app_js.match(/escapeAttr\(badgeLabelFor\(b, v\)\)/g) || []).length, 4, 'every card badge row');
});

test('fix 6: wording: food trucks, the guess line, the door lead, Kids label, dog sentences, Flights from, owner hours, 12 PM', async () => {
  assert.equal(text.en.brewery.tfoodSubs.trucks, 'We’ll show “Food trucks most days” or “on weekends” (truck names change too often)');
  assert.equal(text.en.brewery.foodGuess, 'We picked this from what’s on your page. Tap another if it’s changed.');
  assert.doesNotMatch(text.en.brewery.doorLead, /orchard/i); assert.doesNotMatch(text.fr.brewery.doorLead, /verger/i);
  assert.match(text.en.brewery.doorLeadCidery, /orchard/);
  // French typography on the new words.
  for (const k of ['togoGuess', 'dogGuess', 'eventsGuess', 'eventsHint', 'flightLeadPick', 'doorLead', 'tfoodSubs']) {
    const v = JSON.stringify(text.fr.brewery[k]);
    assert.ok(!/[^   ]:\s/.test(v.replace(/https?:/g, '')), `${k}: no-break space before :`);
    assert.ok(!/\S[?!]/.test(v.replace(/ [?!]/g, '')), `${k}: narrow space before ? !`);
  }
  assert.equal(text.fr.storySentAs, 'Ce que nous mettrons sur votre page :');
  // Plan your visit: "Kids" when dogs have their own line, and the dog chips as sentences.
  const info = { rows: [{ label: 'Kids & dogs', text: 'Minors welcome with an adult until 9 PM.' }, { label: 'Dogs', text: 'Patio only. Water bowls at the door.' }], owner_labels: ['Dogs', 'Kids & dogs'],
    owner_fr: { 'Kids & dogs': { en: 'Minors welcome with an adult until 9 PM.', fr: 'Mineurs bienvenus avec un adulte jusqu’à 21 h.' } } };
  const en = app.visitInfoHtml(info, false), frh = app.visitInfoHtml(info, true);
  assert.match(en, /<span class="visit-label">Kids<\/span>/); assert.doesNotMatch(en, /Kids &amp; dogs/);
  assert.match(en, /Dogs welcome on the patio only\. Water bowls at the door\./);
  assert.match(frh, /<span class="visit-label">Enfants<\/span>/);
  assert.match(frh, /Chiens bienvenus sur la terrasse seulement\./);
  assert.equal(app.dogsChipSentences('Inside and patio'), 'Dogs welcome inside and on the patio.', 'brewery test 2: with its period');
  // A Kids & dogs line that speaks of dogs keeps its label.
  assert.match(app.visitInfoHtml({ rows: [{ label: 'Kids & dogs', text: 'All ages welcome. Dogs welcome.' }, { label: 'Dogs', text: 'Patio only' }] }, false), /Kids &amp; dogs/);
  // Build My Trip: "Flights from $14" / "Tastings from $10", and no "check before you go" on hours the business confirmed.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /'Flights from '/); assert.match(v3, /'Tastings from '/); assert.match(v3, /v\.hoursByOwner \?/);
  const W = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
  assert.equal(planner.publicVenue({ id: 9, type: 'brewery', url: '/x', hours: W, ownerHours: true, features: {}, collections: [] }, null).hoursByOwner, true);
  // Noon reads "12 PM" (as the page's hours say it), never "Noon".
  assert.equal(app.minorsLineText({ policy: 'minors_until', until: '12:00' }, false), 'Minors welcome with an adult until 12 PM');
  const s = setupScript((await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text);
  assert.doesNotMatch(s, /'Noon'/);
});

test('fix 6: hours the owner saved go to Build My Trip as confirmed by the business (no “check before you go”)', async () => {
  const W = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
  const b = mk('brewery', { name: 'Hourscheck Brewing', slug: 'hourscheck-brewing', hours: W }); const t = tokenFor(b.id);
  const plan = async () => (await fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hourscheck Brewing in Kelowna on Tuesday afternoon' }) }).then((r) => r.json()));
  const find = (j) => (j.recommendations || []).concat(...(j.days || []).map((d) => d.stops), (j.itinerary || {}).stops || [], (j.outing || {}).stops || []).find((s) => s && s.venue && s.venue.id === b.id);
  const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on';
  try {
    let st = find(await plan());
    assert.ok(st, 'listed'); assert.ok(!st.venue.hoursByOwner, 'research hours: still “check before you go”');
    assert.equal((await change(t, { hours_checked: true })).status, 200);
    st = find(await plan());
    assert.equal(st.venue.hoursByOwner, true);
    assert.ok(!st.caveats.some((c) => /check (?:before|the day) you go/.test(c)), JSON.stringify(st.caveats));
  } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; }
});

test('fix 7: research To go, dogs and a plain weekly event are offered as suggestions only (nothing saved)', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  research(b.id, [{ label: 'To go', text: 'Cans and growler fills.' }, { label: 'Kids & dogs', text: 'Kids welcome. Dogs on the patio.' }, { label: 'Games', text: 'Trivia Tuesdays.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.suggestToGo, ['cans', 'growler']);
  assert.equal(cfg.suggestDogNote, 'Patio only');
  assert.deepEqual(cfg.suggestNights, [{ kind: 'trivia', days: ['tue'] }]);
  assert.equal(cfg.researchEvents, 'Trivia Tuesdays.');
  assert.ok(cfg.visitTicks.includes('dog_friendly'), 'Dogs welcome pre-ticked');
  assert.deepEqual(app.venueBreweryInfo(b.id), {}, 'nothing saved as her answer');
  assert.ok(!app.venueWeeklyNightsList || !(app.venueWeeklyNightsList(b.id) || []).length);
  // A line that isn't plainly one event on named days is only a hint.
  const c = mk('brewery');
  research(c.id, [{ label: 'Games', text: 'Board games, darts and trivia some nights.' }]);
  const cfg2 = cfgOf((await get(`/owner/${tokenFor(c.id)}/setup`)).text);
  assert.equal(cfg2.suggestNights, undefined);
  assert.equal(cfg2.researchEvents, 'Board games, darts and trivia some nights.');
  const s = setupScript((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /S\.togoGuessed = true/); assert.match(s, /S\.dogGuessed = true/); assert.match(s, /S\.nightsGuessed = true/);
});

test('fix 8: photo source label, photos waiting counts the one she has, happy hour after midnight, the description as sent', async () => {
  // "(from Google Maps)" only for a photo credited to Google.
  const g = mk('brewery', { image_url: '/images/venues/barley-mill-brew-pub-2610.jpg' });
  const o = mk('brewery', { image_url: '/images/venues/not-a-google-photo-x.jpg' });
  assert.equal(cfgOf((await get(`/owner/${tokenFor(g.id)}/setup`)).text).imageSource, 'google');
  assert.equal(cfgOf((await get(`/owner/${tokenFor(o.id)}/setup`)).text).imageSource, 'other');
  // 2 photos sent + the 1 she has = 3.
  const base0 = { type: 'brewery', address: 'a', latitude: 1, longitude: 1, phone: 'p', hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 1, description: 'x'.repeat(128), claimed: true };
  const r = pc.scoreCompleteness({ ...base0, pendingPhotos: 2, photoCountAfter: 3 }, { today, pending: new Set() });
  const it = r.missing.find((x) => x.key === 'photo_extra');
  assert.equal(it.waiting, true); assert.equal(it.after, 3);
  const html = pc.renderCompleteness(r, { fr: false, brewery: true, canDecline: true, noScore: true, menuHref: '/m', setupHref: '/s' });
  assert.match(html, /2 photos sent \(3 in all with the one you have\)/);
  // Happy hour: "today" by day; after midnight the day is named.
  const h = { state: 'later', from: { weekday: 'fri', minutes: 900 }, to: { weekday: 'fri', minutes: 1020 } };
  assert.match(app.happyHourLiveText(h, false, { weekday: 'fri', minutes: 30 }), /^Happy hour Friday 3/);
  assert.match(app.happyHourLiveText(h, false, { weekday: 'fri', minutes: 600 }), /^Happy hour today 3/);
  assert.match(app.happyHourLiveText(h, true, { weekday: 'fri', minutes: 30 }), /^Happy hour vendredi 15/);
  // The story screen shows the description as it will be saved.
  const s = setupScript((await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text);
  assert.match(s, /id="suStorySent"/); assert.match(s, /st\.onblur = function\(\)\{ var fx = storyJoinFix\(st\.value\)/);
});

// ---------- Brewery test 2 (2026-11-13; drafts/fresh-eyes-brewery2-2026-11-12/REPORT.md) ----------
test('test 2 fix 1: food trucks “Most days” / “Weekends only”, pre-picked from a research weekends line, never less accurate', async () => {
  const b = mk('brewery'); const t = tokenFor(b.id);
  research(b.id, [{ label: 'Food', text: 'Food trucks on weekends.' }, { label: 'To go', text: 'Cans.' }]);
  let cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.suggestFood, 'trucks'); assert.equal(cfg.suggestTrucks, 'weekends', 'pre-picked from research');
  assert.deepEqual(app.venueBreweryInfo(b.id), {}, 'a suggestion only: nothing saved');
  assert.equal(row(b.id, 'Food').text, 'Food trucks on weekends.');
  // Saved with the screen: the line stays "on weekends", in both languages.
  assert.equal((await change(t, { brewery_info: { food: 'trucks', trucks: 'weekends', outside: 'yes' } })).status, 200);
  assert.equal(row(b.id, 'Food').text, 'Food trucks on weekends. Outside food welcome.');
  assert.equal(app.venueVisitInfo(b.id).owner_fr.Food.fr, 'Camions-restaurants la fin de semaine. Vous pouvez apporter votre pique-nique.');
  assert.equal(app.venueBreweryInfo(b.id).trucks, 'weekends');
  // Most days.
  assert.equal((await change(t, { brewery_info: { trucks: 'most_days' } })).status, 200);
  assert.equal(row(b.id, 'Food').text, 'Food trucks most days. Outside food welcome.');
  // Another food answer drops the trucks part; a bad value is refused.
  assert.equal((await change(t, { brewery_info: { food: 'snacks' } })).status, 200);
  assert.equal(app.venueBreweryInfo(b.id).trucks, undefined);
  assert.equal(row(b.id, 'Food').text, 'Snacks only. Outside food welcome.');
  assert.equal((await change(t, { brewery_info: { food: 'trucks', trucks: 'tuesdays' } })).status, 400);
  // Weekend words research uses; a line that names other days pre-picks nothing (she picks), "daily" is most days.
  for (const [line, want] of [['Food trucks Fri–Sun.', 'weekends'], ['Food trucks Friday to Sunday.', 'weekends'], ['Food trucks Saturdays and Sundays.', 'weekends'], ['Camions de cuisine de rue la fin de semaine.', ''], ['Food trucks daily.', 'most_days'], ['Food trucks Thursday to Saturday.', '']]) {
    const c = mk('brewery'); research(c.id, [{ label: 'Food', text: line }]);
    const g = cfgOf((await get(`/owner/${tokenFor(c.id)}/setup`)).text);
    assert.equal(g.suggestTrucks, g.suggestFood === 'trucks' ? want : '', line);
  }
  // The screen: chips under Food trucks, required with it, toggled like the food pick, and the suggestion saved only with it.
  const s = setupScript((await get(`/owner/${t}/setup`)).text);
  assert.match(s, /bchips\('trucks', \['most_days', 'weekends'\]/);
  assert.match(s, /tb\.food === 'trucks' && !tb\.trucks\) \{ S\.nudge = T\.ttrucksNeed/);
  assert.match(s, /S\.brew\.trucks = C\.suggestTrucks; S\.trucksGuessed = C\.suggestTrucks;/);
  assert.equal(text.en.brewery.ttrucks.weekends, 'Weekends only'); assert.equal(text.fr.brewery.ttrucks.weekends, 'La fin de semaine seulement');
  assert.equal(text.en.brewery.ttrucks.most_days, 'Most days'); assert.equal(text.fr.brewery.ttrucks.most_days, 'La plupart des jours');
  assert.match(text.fr.brewery.tfoodSubs.trucks, /la fin de semaine/);
  // The help answer says both and no longer says the menu "counts as done".
  const help = app.BREWERY_SETUP_HELP_TOPICS.find((x) => x.id === 'brewery-food-trucks');
  assert.match(help.a, /Food trucks on weekends/); assert.match(help.a, /Weekends only/); assert.doesNotMatch(help.a, /counts as done/);
  assert.match(help.aFr, /la fin de semaine/);
});

test('test 2 fix 2: the kind guess is Brewery for a taproom (taphouse only when the name says so), named at the top', async () => {
  const kind = async (name) => cfgOf((await get(`/owner/${tokenFor(mk('brewery', { name }).id)}/setup`)).text).suggestKind;
  assert.equal(await kind('Two Dogs Taproom'), 'Brewery');
  assert.equal(await kind('Lakeside Tap House'), 'Taphouse or beer hall');
  assert.equal(await kind('Old Town Taphouse'), 'Taphouse or beer hall');
  assert.equal(await kind('Main Street Beer Hall'), 'Taphouse or beer hall');
  assert.equal(await kind('Orchard Hill Cider Co'), 'Cidery');
  assert.equal(await kind('Okanagan Spirits Distillery'), 'Distillery');
  assert.equal(await kind('Something Different'), 'Brewery', 'a brewery is a Brewery by default');
  assert.equal(text.en.brewery.kindGuess, 'We picked “{kind}”. Tap another if it’s not right.');
  assert.match(text.fr.brewery.kindGuess, /\{kind\}/);
  const s = setupScript((await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text);
  assert.match(s, /h\(fill\(T\.kindGuess, \{ kind: \(C\.placeNames \|\| \{\}\)\[S\.place\]/);
});

test('test 2 fix 3: the “Who’s welcome?” note shows in the Kids & dogs line, without repeating the answer', async () => {
  const b = mk('brewery', { dog_friendly: 1 }); const t = tokenFor(b.id);
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'all_ages', note: 'Kids with an adult' } } })).status, 200);
  assert.equal(row(b.id, 'Kids & dogs').text, 'All ages welcome. Kids with an adult. Dogs welcome.');
  assert.equal(app.venueVisitInfo(b.id).owner_fr['Kids & dogs'].fr, 'Tous les âges sont bienvenus. Chiens bienvenus.', 'her words stay off the French line, as on a pub');
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'all_ages', note: 'All ages welcome' } } })).status, 200);
  assert.equal(row(b.id, 'Kids & dogs').text, 'All ages welcome. Dogs welcome.', 'a note that only repeats it is left out');
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'all_ages', note: 'All ages welcome, kids with an adult.' } } })).status, 200);
  assert.equal(row(b.id, 'Kids & dogs').text, 'All ages welcome. Kids with an adult. Dogs welcome.');
  assert.equal(app.breweryVisitLines(app.getVenue(b.id), { minors: { policy: 'minors_until', until: '21:00', note: 'Patio is 19+ after 9.' } })['Kids & dogs'].en, 'Minors welcome with an adult until 9 PM. Patio is 19+ after 9. Dogs welcome.');
  // No note: as before.
  assert.equal((await change(t, { brewery_info: { minors: { policy: 'adults' } } })).status, 200);
  assert.equal(row(b.id, 'Kids & dogs').text, 'Adults only (19+). Dogs welcome.');
});

test('test 2 fix 4: the checklist door item says “orchard” for a cidery only, in English and French', () => {
  const base0 = { type: 'brewery', address: 'a', latitude: 1, longitude: 1, phone: 'p', hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 1, description: 'x'.repeat(128), claimed: true };
  const door = (placeType) => { const r = pc.scoreCompleteness({ ...base0, placeType }, { today, pending: new Set() }); return r.missing.concat(r.coming, r.afterReopen).find((x) => x.key === 'arrival'); };
  for (const k of ['Brewery', 'Taphouse or beer hall', 'Distillery', undefined]) {
    const it = door(k);
    assert.doesNotMatch(it.whyEn, /orchard/i, String(k)); assert.doesNotMatch(it.whyFr, /verger/i, String(k));
    assert.match(it.whyEn, /around the side or upstairs/);
  }
  assert.match(door('Cidery').whyEn, /At an orchard/); assert.match(door('Cidery').whyFr, /Dans un verger/);
  const html = pc.renderCompleteness(pc.scoreCompleteness({ ...base0, placeType: 'Brewery' }, { today, pending: new Set() }), { fr: false, brewery: true, canDecline: true, noScore: true, menuHref: '/m', setupHref: '/s' });
  assert.doesNotMatch(html, /orchard/i);
});

test('test 2 fix 5: “We can’t take big groups” comes before the sizes and the form', async () => {
  const s = setupScript((await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text);
  const i = s.indexOf("id=\"suGroupsNone\""), j = s.indexOf("id=\"suGroupSizes\""), k = s.indexOf("'brewGroupsSave') + '</div>'");
  assert.ok(i > 0 && j > i && k > j, 'none button, then sizes, then Save');
  assert.equal((s.match(/T\.groupsNone, '', true, 'no:groups'/g) || []).length, 1, 'shown once');
});

test('test 2 fix 6: Facebook pre-filled from a facebook.com website, one link on the page, dog lines end with a period, 3 PM and 6 PM', async () => {
  const s = setupScript((await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text);
  assert.match(s, /fbFromSite\(CUR\.website \|\| C\.website \|\| ''\)\) \{ S\.fb = fbFromSite\(CUR\.website \|\| C\.website\); S\.fbFromWebsite = true; \}/);
  assert.match(s, /S\.socSaved = \{ instagram: S\.ig, facebook: S\.fb \}; S\.socLines = \[\];\n.*\n  if \(!S\.fb/, 'after the saved value, so it is saved only with the screen');
  assert.ok(text.en.fbFromWebsite && text.fr.fbFromWebsite);
  // The page: website and Facebook the same page -> Facebook only.
  const b = mk('brewery', { website: 'https://www.facebook.com/twodogstaproom' }); const t = tokenFor(b.id);
  const v = app.getVenue(b.id);
  let p = (await get(`/${v.region}/breweries/${v.slug}`)).text;
  assert.match(p, /Website ↗|Visit Website/, 'no Facebook link yet: the website button stays');
  assert.equal((await change(t, { facebook_url: 'https://www.facebook.com/twodogstaproom' })).status, 200);
  p = (await get(`/${v.region}/breweries/${v.slug}`)).text;
  assert.doesNotMatch(p, /Website ↗|Visit Website/);
  assert.match(p, />Facebook<\/a>/);
  assert.equal(app.websiteIsFacebookLink('https://m.facebook.com/x/', 'https://www.facebook.com/x'), true);
  assert.equal(app.websiteIsFacebookLink('https://example.com', 'https://www.facebook.com/x'), false);
  assert.equal(app.websiteIsFacebookLink('https://www.facebook.com/x', 'https://www.facebook.com/y'), false);
  // Dog chip lines read as sentences, every type.
  assert.equal(app.dogsChipSentences('Dogs welcome inside'), 'Dogs welcome inside.');
  assert.equal(app.dogsChipSentences('Dogs welcome inside. Water bowls at the door'), 'Dogs welcome inside. Water bowls at the door.');
  assert.equal(app.dogsChipSentences('Dogs welcome at the window'), 'Dogs welcome at the window.');
  assert.equal(app.dogsChipSentences('Chiens bienvenus à l’intérieur'), 'Chiens bienvenus à l’intérieur.');
  assert.equal(app.dogsChipSentences('Patio only, on leash'), 'Dogs welcome on the patio only, on leash', 'her own words: as typed');
  // Hours buttons (breweries only).
  assert.match(s, /BQ_OPEN = \['11:00', '12:00', '14:00', '15:00'\], BQ_CLOSE = \['18:00', '20:00', '21:00', '22:00'\]/);
  assert.match(s, /function brewQuick\(d, j, y, last\)\{\n    if \(!C\.brewery\) return '';/);
  assert.match(s, /su-laterow su-bqrow/); assert.match(app.OWNER_SETUP_CSS || (await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text, /\.su-bqrow \.su-latebtn \{ padding: 0 10px; \}/, 'four times fit one row at 375px');
});

// ---------- Brewery test 3 (2026-11-13, a French orchard cidery) ----------
const SEASON_SRC = { source_url: 'https://example.com/season', checked_at: today };
const seasonMeta = { reason: 'test research', batch_id: 'test-season' };
const planFor = async (txt) => (await fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) }).then((r) => r.json()));
const planStops = (j, id) => [].concat(j.recommendations || [], ...(j.days || []).map((d) => d.stops || []), (j.itinerary || {}).stops || [], (j.outing || {}).stops || []).filter((s) => s && s.venue && s.venue.id === id);
const inSeason = (md, a, b) => (a <= b ? md >= a && md <= b : md >= a || md <= b);

test('brewery test 3: the owner’s season wins over a researched closure (cidery, winery, golf); research kept for Undo', async () => {
  const W = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '17:00']]])));
  const nextYear = Number(today.slice(0, 4)) + 1;
  const md = today.slice(5);
  const fixtures = [
    mk('brewery', { name: 'Seasonwin Orchard Cidery', slug: 'seasonwin-orchard-cidery', region: 'summerland', hours: W }),
    mk('winery', { name: 'Seasonwin Bench Winery', slug: 'seasonwin-bench-winery', region: 'summerland', hours: W }),
    mk('golf', { name: 'Seasonwin Golf Club', slug: 'seasonwin-golf-club', region: 'summerland', hours: W }),
  ];
  for (const v of fixtures) assert.equal(app.guardedSeasonUpdate(v.id, { status: 'closed', reopens_date: null, ...SEASON_SRC }, seasonMeta).ok, true);
  const [cid, win, golf] = fixtures;
  // Before the owner says anything, the research closure shows ("not announced").
  assert.equal(app.getSeasonStates().get(cid.id).kind, 'closed');
  assert.equal(app.getSeasonStates().get(cid.id).reopens, null);
  assert.equal((await change(tokenFor(cid.id), { place_type: 'Cidery', open_months: '05-01:10-15' })).status, 200);
  assert.equal((await change(tokenFor(win.id), { open_months: '04-25:10-31' })).status, 200);
  assert.equal((await change(tokenFor(golf.id), { open_months: '04-01:10-31' }, false)).status, 200);
  // The research rows are kept, marked superseded; the owner's dates are what every surface reads.
  for (const v of [cid, win]) assert.ok(db.prepare('SELECT superseded_at FROM venue_seasons WHERE venue_id = ?').get(v.id).superseded_at, v.name);
  const rows = app.getSeasonRows();
  if (!inSeason(md, '05-01', '10-15')) {
    assert.equal(rows.get(cid.id).reopens_date.slice(5), '05-01');
    const st = app.getSeasonStates().get(cid.id);
    assert.equal(st.kind, 'closed'); assert.match(st.text, /Reopens May 1/);
    const page = (await get('/summerland/breweries/seasonwin-orchard-cidery')).text;
    assert.match(page, /Reopens May 1/);
    assert.doesNotMatch(page, /has not been announced/);
    // The card says it once (status line), not again on the photo.
    const list = (await get('/summerland/breweries')).text;
    const i = list.indexOf(`data-venue-id="${cid.id}"`); const card = list.slice(i, list.indexOf('</li>', i));
    assert.match(card, /Closed for the season · Reopens May 1/);
    assert.doesNotMatch(card, /season-tag-closed/);
    const frList = (await get('/fr/summerland/breweries')).text;
    const j = frList.indexOf(`data-venue-id="${cid.id}"`); const frCard = frList.slice(j, frList.indexOf('</li>', j));
    assert.equal((frCard.match(/Fermé pour la saison/g) || []).length, 1, frCard.slice(0, 2000));
  }
  // Build My Trip: July and May 15 are in her season, December is not.
  const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on';
  try {
    assert.ok(planStops(await planFor(`Seasonwin Orchard Cidery in Summerland on July 15, ${nextYear}`), cid.id).length, 'July');
    assert.ok(planStops(await planFor(`Seasonwin Orchard Cidery in Summerland on May 15, ${nextYear}`), cid.id).length, 'May 15');
    assert.equal(planStops(await planFor(`Seasonwin Orchard Cidery in Summerland on December 15, ${nextYear}`), cid.id).length, 0, 'December');
    assert.ok(planStops(await planFor(`Seasonwin Bench Winery in Summerland on July 15, ${nextYear}`), win.id).length, 'winery July');
    assert.ok(planStops(await planFor(`Seasonwin Golf Club in Summerland on July 15, ${nextYear}`), golf.id).length, 'golf July');
  } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; }
  // Undo back to no season: the research closure shows again. A fresh research row later wins again.
  const u = app.undoOwnerInstantChange(lastReq(win.id, 'open_months'), 'dayton', new Date(), 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(db.prepare('SELECT superseded_at FROM venue_seasons WHERE venue_id = ?').get(win.id).superseded_at, null);
  assert.equal(app.getSeasonStates().get(win.id).kind, 'closed');
  assert.equal(app.guardedSeasonUpdate(cid.id, { status: 'closed', reopens_date: null, ...SEASON_SRC }, seasonMeta).changed, true, 'set again by hand: shows again');
  assert.equal(db.prepare('SELECT superseded_at FROM venue_seasons WHERE venue_id = ?').get(cid.id).superseded_at, null);
});

test('brewery test 3: the picked kind shows on the page and in the planner; cider queries (EN + FR) find the cidery', async () => {
  const c = mk('brewery', { name: 'Verger Kindtest', slug: 'verger-kindtest', region: 'summerland', description: 'A family business pouring its own drinks.' });
  const b = mk('brewery', { name: 'Kindtest Brewing', slug: 'kindtest-brewing', region: 'summerland', description: 'A small family brewery.' });
  assert.equal((await change(tokenFor(c.id), { place_type: 'Cidery' })).status, 200);
  assert.equal((await change(tokenFor(b.id), { place_type: 'Brewery' })).status, 200);
  const page = (await get('/summerland/breweries/verger-kindtest')).text;
  assert.match(page, /Cidery &middot; <a href="\/summerland">/);
  assert.match((await get('/summerland/breweries/kindtest-brewing')).text, /Brewery &middot; <a href="\/summerland">/);
  const pv = planner.publicVenue({ id: c.id, type: 'brewery', breweryKind: 'Cidery', url: '/x', features: {}, collections: [] }, null);
  assert.equal(pv.typeLabel, 'Cidery'); assert.equal(pv.typeLabelFr, 'Cidrerie');
  assert.ok(planner.ciderAsked('cideries in summerland') && planner.ciderAsked('cider') && !planner.ciderAsked('beer and cider'));
  const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on';
  try {
    for (const q of ['Cidreries à Summerland', 'cidre à Summerland', 'Cideries in Summerland', 'Cider in Summerland']) {
      const j = await planFor(q);
      assert.match(j.summary || '', /^Cideries in Summerland/, q);
      const ids = [].concat(j.recommendations || [], ...(j.days || []).map((d) => d.stops || [])).filter((s) => s && s.venue).map((s) => s.venue.id);
      const closed = (j.closedForSeason || []).map((x) => x.id);
      if (ids.length) assert.ok(ids.includes(c.id) || closed.includes(c.id), q);
      if (ids.includes(c.id) && ids.includes(b.id)) assert.ok(ids.indexOf(c.id) < ids.indexOf(b.id), `${q}: the cidery first`);
    }
  } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; }
  const tr = require('../trip-french-copy.js').t3FrenchText;
  assert.equal(tr('Cideries in Summerland.'), 'Cidreries à Summerland.');
  assert.match(tr('Cidrerie du Verger Bleu is closed for the season until May 1, 2027, so it isn’t in this plan.'), /^Cidrerie du Verger Bleu est fermée .*; elle ne fait donc pas/);
  assert.match(tr('Bluebird Bench Winery is closed right now, so it isn’t in this plan.'), /est fermé en ce moment; il ne fait/);
});

test('brewery test 3: cider words for a cidery, neutral for no kind, beer words kept for a brewery (EN + FR)', async () => {
  const fb = text.fr.brewery, eb = text.en.brewery;
  assert.match(fb.kindCidery.photosLead, /^Votre verger, votre salle de dégustation, votre terrasse/);
  assert.match(eb.kindCidery.photosLead, /^Your orchard, your tasting room, your patio/);
  assert.match(fb.kindCidery.knownEx, /cidres secs de pommes anciennes/); assert.match(eb.kindCidery.knownEx, /Dry ciders from heritage apples/);
  assert.doesNotMatch(fb.kindCidery.storyEx, /microbrasserie|fûts/);
  assert.match(fb.igLead, /@votrecommerce/); assert.match(eb.igLead, /@yourbusiness/);
  assert.match(fb.kindCidery.labels.menu, /liste des cidres/); assert.match(fb.kindNeutral.labels.menu, /liste des boissons/);
  assert.match(fb.labels.menu, /liste des bières/, 'beer words kept for a brewery');
  assert.doesNotMatch(fb.hiLead + fb.labels.door + fb.doorQ + fb.mapFailQ, /votre salle(?! de dégustation)/);
  assert.equal(fb.doorHere, 'Êtes-vous sur place en ce moment ?');
  assert.match(fb.knownQ, /reconnus/); assert.match(fb.labels.story, /reconnus/);
  assert.equal(fb.tfoods.trucks, 'Camions-restaurants'); // distillery test 2
  assert.doesNotMatch(eb.groupsLine, /\.$/); assert.doesNotMatch(fb.groupsLine, /\.$/);
  assert.match(text.fr.storyEnglishHint, /anglais/);
  // The setup page script lays the kind's words over the brewery words.
  const s = (await get(`/owner/${tokenFor(mk('brewery').id)}/setup`)).text;
  assert.match(s, /function kindWords\(\)/);
  // Checklist and owner home: cider words for a cidery (picked, or by its name), neutral with no clue, beer for a brewery.
  const item = (k, input) => { const r = pc.scoreCompleteness({ type: 'brewery', ...input }, {}); return r.missing.concat(r.done || []).find((it) => it.key === k) || r.missing.find((it) => it.key === k); };
  const mi = (input) => item('menu', input);
  if (mi({ placeType: 'Cidery' })) {
    assert.equal(mi({ placeType: 'Cidery' }).fr, 'Menu ou liste des cidres');
    assert.equal(mi({ placeType: 'Brewery' }).fr, 'Menu ou liste des bières');
    assert.equal(mi({ placeType: '', wordsKind: '' }).fr, 'Menu ou liste des boissons');
    assert.equal(mi({ placeType: '', wordsKind: 'Cidery' }).fr, 'Menu ou liste des cidres');
  }
  const cid = mk('brewery', { name: 'Cidrerie Hometest', slug: 'cidrerie-hometest' });
  const home = (await get(`/fr/owner/${tokenFor(cid.id)}`)).text;
  assert.match(home, /Mettre à jour mon menu ou ma liste des cidres/);
  assert.match(home, /Photographiez votre tableau ou votre liste des cidres/);
  // French typography on the owner home checklist line and the setup card (a no-break space before « : » and « ? »).
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'portal-completeness.js'), 'utf8'), /`Dernières étapes\\u00a0: /);
  assert.equal(pc.ITEMS.find((i) => i.key === 'happy_hour').fr, 'Heures et spéciaux du 5 à 7');
  assert.match(app.ownerSetupCardHtml('/x', 'fr', 'done', 'brewery'), /Changer quelque chose \?/);
});

test('brewery test 3: « 1 vue de la page », "1 page view", and the French "+N" chip', async () => {
  const os = require('../owner-stats.js');
  const st = { views: 1, clicks: { website: 1, call: 0, directions: 0, book: 0, menu: 0 }, clicks_total: 1, prev: null, since: today, counting_since: today, none: false, small: true };
  const fr = os.ownerStatsHtml(st, 'fr'); const en = os.ownerStatsHtml(st, 'en');
  assert.match(fr, /1 vue de la page · 1 clic vers/); assert.doesNotMatch(fr, /1 vues/);
  assert.match(en, /1 page view · 1 click to/); assert.doesNotMatch(en, /1 page views/);
  assert.match(os.ownerStatsHtml({ ...st, views: 3, clicks_total: 2 }, 'fr'), /3 vues de la page · 2 clics/);
  const v = mk('brewery', { name: 'Chipcount Brewing', slug: 'chipcount-brewing', region: 'summerland', patio: 1, dog_friendly: 1, kid_friendly: 1, live_music: 1, great_groups: 1, nonalcoholic: 1, lake_view: 1 });
  const html = (await get('/fr/summerland/breweries')).text;
  const i = html.indexOf(`data-venue-id="${v.id}"`); const card = html.slice(i, html.indexOf('</li>', i));
  const chip = (card.match(/<span class="chip chip-more"[^>]*>/) || [''])[0];
  if (chip) { assert.match(chip, /aria-label="\d+ de plus : /); assert.doesNotMatch(chip, / more: /); }
});

// ---------- Brewery test 4 (2026-11-13, Carla, Lakeside Lager House, iPhone) ----------
const planV3 = async (txt) => { const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on'; try { return await planFor(txt); } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; } };
const CLIENT_SRC = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const dayWeek = (o, c, closed = []) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, closed.includes(d) ? [] : [[o, c]]]));
// Closed Mondays in the usual week (Oct–Apr), open every day in summer (May–Sep); her own kitchen until 8:30 PM; minors until 8 PM.
const carla = async (o = {}) => {
  const v = mk('brewery', { region: 'peachland', kid_friendly: 1, patio: 1, dog_friendly: 1, ...o });
  const t = tokenFor(v.id);
  assert.equal((await change(t, { hours: dayWeek('12:00', '21:00', ['mon']), hours_checked: true, hours_seasons: [{ from: '05-01', to: '09-30', label: 'Summer hours', hours: dayWeek('11:00', '22:00') }] })).status, 200);
  return { v, t };
};

test('brewery test 4: the story box shows her pending story, the Saved panel shows it, and research text is selected on first tap', async () => {
  const v = mk('brewery'); const t = tokenFor(v.id);
  let cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.storyPending, '');
  assert.equal(cfg.storyResearch, true, 'the description is research’s');
  const mine = 'We are a small family brewery by the lake with lagers, pale ales and a kitchen that serves burgers until 8:30.';
  assert.equal((await change(t, { description: mine })).status, 200);
  cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.storyPending, mine, 'the story waiting for our check');
  const s = CLIENT_SRC();
  assert.match(s, /story: C\.storyPending \|\| CUR\.description \|\| ''/);
  assert.match(s, /C\.storyPending && S\.story === C\.storyPending && T\.storyPendingHint/);
  assert.match(s, /S\.flashStory = sv\[1\] === 'story' \? S\.storySent \|\| '' : ''/, 'the ✓ line after a sent story carries her words');
  assert.match(s, /sp\.className = 'su-toast-story'; sp\.id = 'suStorySent'; sp\.textContent = T\.storySentAs \+ ' ' \+ st;/);
  assert.match(s, /var researchStory = inp\.id === 'suStory' && C\.storyResearch && !C\.storyPending/);
  assert.match(s, /if \(C\.storyPending && S\.story\.trim\(\) === String\(C\.storyPending\)\.trim\(\)\) \{ S\.storySent = ''; return saveAll\('story', \[\]\); \}/, 'not sent twice');
  assert.equal(text.en.storyPendingHint, 'You sent a new story. We check it within a day.');
  assert.equal(text.fr.storyPendingHint, 'Vous avez envoyé une nouvelle histoire. Nous la vérifions d’ici un jour.');
  // Every type gets the same box (café, winery, restaurant).
  for (const type of ['cafe', 'winery', 'restaurant']) {
    const x = mk(type); const tx = tokenFor(x.id);
    assert.equal((await change(tx, { description: `${mine} (${type})` })).status, 200);
    const c2 = cfgOf((await get(`/owner/${tx}/setup`)).text);
    assert.equal(c2.storyPending, `${mine} (${type})`, type);
  }
});

test('brewery test 4: Build My Trip says which day a left-out place is closed ("Closed Mondays (Oct–Apr) · try Tue–Sun")', async () => {
  const { v } = await carla({ name: 'Mondayshut Lager House', slug: 'mondayshut-lager-house' });
  const j = await planV3('A brewery afternoon in Peachland on Monday, January 11, 2027');
  const alt = (j.requirementResults || []).flatMap((i) => i.optionalAlternatives || []).find((a) => a.id === v.id);
  assert.ok(alt, JSON.stringify(j).slice(0, 3000));
  assert.deepEqual(alt.closedDay, { day: 'mon', from: '10-01', to: '04-30', open: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] });
  const v3 = require('../trip-planner-v3-page.js');
  const html = v3.t3OptionalAlternativesHtml({ alternatives: [{ name: 'Lakeside', url: '/peachland/breweries/x', reasonCode: 'different_time', closedDay: alt.closedDay }] }, false, (x) => String(x));
  assert.match(html, /Lakeside<\/a> — Closed Mondays \(Oct–Apr\) · try Tue–Sun/);
  assert.match(v3.t3OptionalAlternativesHtml({ alternatives: [{ name: 'L', url: '/x', reasonCode: 'different_time', closedDay: alt.closedDay }] }, true, (x) => String(x)), /Fermé le lundi \(oct\.–avr\.\) · essayez du mardi au dimanche/);
  assert.equal(v3.t3ClosedDayText({ day: 'mon', open: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }, false), 'Closed Mondays · try Tue–Sun', 'closed all year: no months');
  assert.equal(v3.t3ClosedDayText({ day: 'wed', open: ['mon', 'fri'] }, false), 'Closed Wednesdays · try Mon, Fri');
  // The missing line itself says why when the only matching places were closed that day.
  const step = { alternatives: [{ name: 'Lakeside Lager House', url: '/x', reasonCode: 'different_time', closedDay: alt.closedDay }] };
  assert.equal(v3.t3MissingClosedText(step, false), 'Lakeside Lager House is closed Mondays (Oct–Apr) · try Tue–Sun.');
  assert.equal(v3.t3MissingClosedText(step, true), 'Lakeside Lager House — Fermé le lundi (oct.–avr.) · essayez du mardi au dimanche.' /* distillery test 2: subject-free */);
  assert.equal(v3.t3MissingClosedText({ alternatives: step.alternatives.concat({ name: 'Open Brewing', url: '/y', reasonCode: 'another_listing' }) }, false), null, 'another place nearby: the usual line');
  const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(pageSrc, /t3MissingClosedText\(step,nextFr\)\?esc\(\(nextFr\?'Non inclus : ':'Not included: '\)/);
  assert.match(pageSrc, /t3ClosedDayText, t3MissingClosedText, t3OptionalAlternativesHtml\]\.map/);
  // With no time of day asked, the place closed that day is offered only with its closed day, and the line says why.
  const plain = await planV3('A brewery in Peachland on Monday, January 11, 2027');
  const pAlt = (plain.requirementResults || []).flatMap((i) => i.optionalAlternatives || []).find((a) => a.id === v.id);
  assert.ok(pAlt, JSON.stringify(plain.requirementResults));
  assert.equal(pAlt.reasonCode, 'different_time');
  assert.equal(v3.t3MissingClosedText({ alternatives: [pAlt] }, false), 'Mondayshut Lager House is closed Mondays (Oct–Apr) · try Tue–Sun.');
  // The named request says it too (server note).
  const named = await planV3('Mondayshut Lager House on Monday, January 11, 2027');
  assert.ok((named.warnings || []).concat(named.notes || []).some((w) => /Mondayshut Lager House is closed Mondays from Oct to Apr/.test(w)), JSON.stringify(named.warnings));
  assert.match(v3.t3OptionalAlternativesHtml({ alternatives: [{ name: 'L', url: '/x', reasonCode: 'different_time' }] }, false, (x) => String(x)), /Try another time/, 'no closed-day facts: as before');
  // The client copy of the page script has the helper.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8'), /t3ListingGapSummaryHtml, t3ClosedDayText, t3MissingClosedText, t3OptionalAlternativesHtml\]\.map/);
  // A day closed all year isn't called seasonal.
  assert.deepEqual(planner.closedDayInfo({ hours: JSON.stringify(dayWeek('12:00', '21:00', ['mon'])), hoursSeason: { from: '10-01', to: '04-30', otherOpen: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } }, 'mon'), { day: 'mon', open: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] });
  // The usual week's months for a place with one season.
  assert.deepEqual(app.usualWeekSeasonOn(app.getVenue(v.id), '2027-01-11') && { from: app.usualWeekSeasonOn(app.getVenue(v.id), '2027-01-11').from, to: app.usualWeekSeasonOn(app.getVenue(v.id), '2027-01-11').to }, { from: '10-01', to: '04-30' });
  assert.equal(app.usualWeekSeasonOn(app.getVenue(v.id), '2027-07-09'), null, 'in the season: its own months');
});

test('brewery test 4: her own kitchen can be the dinner stop within its kitchen hours; restaurants unchanged', async () => {
  const { v, t } = await carla({ name: 'Kitchenlake Lager House', slug: 'kitchenlake-lager-house', region: 'osoyoos', latitude: 49.032, longitude: -119.468, address: '8000 Main St, Osoyoos' });
  const q = 'Friday evening July 9, 2027 in Osoyoos with our kids (8 and 11): dinner and a brewery with a patio, from 6 PM';
  // No kitchen answer: no dinner there.
  let j = await planV3(q);
  assert.ok(!planStops(j, v.id).some((s) => (s.why || []).some((w) => /^Dinner at /.test(w))));
  assert.equal((await change(t, { brewery_info: { food: 'kitchen', kitchen: { mode: 'earlier', closes: '20:30' }, minors: { policy: 'minors_until', until: '20:00' } } })).status, 200);
  assert.deepEqual(app.plannerOwnKitchen(app.getVenue(v.id)), { closes: '20:30' });
  j = await planV3(q);
  const st = planStops(j, v.id)[0];
  assert.ok(st, JSON.stringify(j).slice(0, 2500));
  assert.equal(st.why[0], 'Dinner at Kitchenlake Lager House (kitchen until 8:30 PM)');
  assert.ok(st.caveats.some((c) => /until 8 PM/.test(c)), 'the kids caveat stays');
  assert.ok(!(j.warnings || []).some((w) => /No dinner matched|No restaurant could be fitted/.test(w)), JSON.stringify(j.warnings));
  assert.ok(!(j.requirementResults || []).some((i) => i.kind === 'type' && i.value === 'restaurant' && i.status === 'unmet'));
  assert.equal(require('../trip-french-copy.js').t3FrenchText('Dinner at Kitchenlake Lager House (kitchen until 8:30 PM)'), 'Souper à Kitchenlake Lager House (cuisine jusqu’à 20 h 30)');
  // The kitchen closing too early for dinner: not the dinner stop.
  assert.equal(planner.kitchenMealFit({ type: 'brewery', ownKitchen: { closes: '18:30' }, hours: JSON.stringify(dayWeek('11:00', '22:00')) }, planner.SLOT_WINDOWS.evening, 'fri').ok, false);
  assert.equal(planner.kitchenMealFit({ type: 'brewery', ownKitchen: {}, hours: JSON.stringify(dayWeek('11:00', '22:00')) }, planner.SLOT_WINDOWS.evening, 'fri').ok, true);
  assert.equal(planner.kitchenMealFit({ type: 'brewery', hours: JSON.stringify(dayWeek('11:00', '22:00')) }, planner.SLOT_WINDOWS.evening, 'fri'), null, 'no kitchen answer');
  assert.equal(planner.kitchenMealFit({ type: 'restaurant', ownKitchen: {}, hours: JSON.stringify(dayWeek('11:00', '22:00')) }, planner.SLOT_WINDOWS.evening, 'fri'), null, 'restaurants are chosen as before');
  // A restaurant open for dinner in town is still the dinner.
  const r = mk('restaurant', { name: 'Osoyoos Supper Room', slug: 'osoyoos-supper-room', region: 'osoyoos', latitude: 49.033, longitude: -119.467, address: '8010 Main St, Osoyoos', kid_friendly: 1, rating: 4.7, price: 3 });
  j = await planV3('Friday evening July 9, 2027 in Osoyoos: dinner, from 6 PM');
  assert.ok(planStops(j, r.id).length, 'the restaurant is dinner');
  assert.ok(!planStops(j, v.id).length);
});

test('brewery test 4: happy hour warns about closed days, and the page says "(when open)"', async () => {
  const { v } = await carla({ name: 'Happyshut Brewing', slug: 'happyshut-brewing', region: 'kelowna' });
  const s = CLIENT_SRC();
  assert.match(s, /dayChips\(e\.days, 'happy\.' \+ i\) \+ warnHtml\('happy', i, e\)/);
  assert.match(s, /key === 'happy' \? closedWarnAny\(e\.days, S\.happySea\)/);
  assert.match(s, /var inUsual = DAYS\.filter\(function\(d\)\{ return days\[d\] && usual && !S\.week\[d\]; \}\)/, 'a day closed in either week counts');
  assert.match(s, /\['specials', 'nights', 'happy'\]\.forEach/);
  assert.match(text.en.closedWarnHappy, /^Heads up: you’re closed on \{days\}\{when\}\. Your page will say happy hour is on when you’re open\.$/);
  assert.ok(text.fr.closedWarnHappy);
  const hh = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [['15:00', '17:00']]])));
  db.prepare('UPDATE venues SET happy_hour = 1, happy_hour_times = ? WHERE id = ?').run(hh, v.id);
  assert.equal(app.happyHourOnClosedDay(v.id, app.getVenue(v.id).hours, hh), true);
  const page = (await get(`/kelowna/breweries/happyshut-brewing`)).text;
  assert.match(page, /\(when open\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /\(fr \? ' \(les jours d’ouverture\)' : ' \(when open\)'\)/);
  // Open every happy hour day: nothing added.
  const w = mk('brewery', { name: 'Happyopen Brewing', slug: 'happyopen-brewing' });
  db.prepare('UPDATE venues SET happy_hour = 1, happy_hour_times = ? WHERE id = ?').run(hh, w.id);
  assert.equal(app.happyHourOnClosedDay(w.id, app.getVenue(w.id).hours, hh), false);
  assert.doesNotMatch((await get('/kelowna/breweries/happyopen-brewing')).text, /\(when open\)/);
});

test('brewery test 4: small fixes (menu path, kids pre-fill, last step, Dogs on patio, capitals, help)', async () => {
  const s = CLIENT_SRC();
  // The menu address keeps the website's path (never its query or #fragment).
  const fns = s.split('\n').filter((l) => /^  function site(Origin|Url)\(/.test(l)).join('\n');
  const siteUrl = new Function(`${fns}; return siteUrl;`)();
  assert.equal(siteUrl('https://example.com/lakesidelager'), 'https://example.com/lakesidelager/');
  assert.equal(siteUrl('https://example.com'), 'https://example.com/');
  assert.equal(siteUrl('https://example.com/?utm_source=x#top'), 'https://example.com/');
  assert.equal(siteUrl('https://example.com/a/menu.html?x=1'), 'https://example.com/a/menu.html');
  assert.match(s, /var site = siteUrl\(C\.website\), siteHost = siteHostOf\(C\.website\);/);
  // Research "Kids welcome until 8 PM" pre-picks minors until 8 PM.
  const b = mk('brewery'); research(b.id, [{ label: 'Kids & dogs', text: 'Kids welcome until 8 PM; dogs on patio.' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(b.id)}/setup`)).text).suggestKidsUntil, '20:00');
  assert.equal(app.researchKidsUntil([{ label: 'Hours', text: 'Open until 9 PM' }]), '');
  assert.equal(app.researchKidsUntil([{ label: 'Kids', text: 'Minors welcome until 9:30 p.m.' }]), '21:30');
  assert.match(s, /if \(!BIm\.policy && C\.suggestKidsUntil\) \{ S\.minors\.policy = 'minors_until'; S\.minors\.until = C\.suggestKidsUntil; \}/);
  // The checklist names only what's left: photos sent -> the door is the last step.
  const base0 = { address: '1 Main', latitude: 1, longitude: 1, hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 1, description: 'x'.repeat(130), cuisine: 'Italian', phone: '1', website: 'https://a.example' };
  assert.match(pc.renderCompleteness(pc.scoreCompleteness(base0, { today }), {}), /Photos and your storefront spot are the last steps/);
  const sent = pc.renderCompleteness(pc.scoreCompleteness(base0, { today }), { pendingPhotos: 3 });
  assert.match(sent, /Your storefront spot is the last step/);
  assert.doesNotMatch(sent, /Photos and your storefront spot/);
  // "Dogs on patio" on the card when her Dogs answer is patio only (every type), French too.
  const d = mk('brewery', { name: 'Patiodog Brewing', slug: 'patiodog-brewing', region: 'oliver', dog_friendly: 1 });
  assert.equal(app.dogsPatioOnly(app.getVenue(d.id)), false);
  assert.ok((await change(tokenFor(d.id), { visit_rows: { dogs: 'Patio only' } })).status < 300);
  assert.equal(app.dogsPatioOnly(app.getVenue(d.id)), true);
  assert.match(app.cardBadgeChipsHtml(app.getVenue(d.id)), /Dogs on patio/);
  assert.doesNotMatch(app.cardBadgeChipsHtml(app.getVenue(d.id)), /Dogs OK/);
  const frList = (await get('/fr/oliver/breweries')).text; const k = frList.indexOf(`data-venue-id="${d.id}"`);
  assert.match(frList.slice(k, frList.indexOf('</li>', k)), /Chiens sur la terrasse/);
  const c = mk('cafe', { name: 'Patiodog Cafe', slug: 'patiodog-cafe', dog_friendly: 1 });
  assert.ok((await change(tokenFor(c.id), { visit_rows: { dogs: 'Inside and patio' } })).status < 300);
  assert.equal(app.dogsPatioOnly(app.getVenue(c.id)), false);
  // "More about your place" status lines start with a capital.
  assert.match(s, /'<span class="su-tile-sub">' \+ h\(capFirst\(stText\(k, d\)\)\)/);
  // The help answer starts with "Yes, any time."
  const tp = app.WINERY_SETUP_HELP_TOPICS.find((x) => x.id === 'winery-change-hours');
  assert.match(tp.a, /^<p>Yes, any time\. In either place:<\/p>/);
  assert.match(tp.aFr, /^<p>Oui, en tout temps\. À l’un ou l’autre endroit :<\/p>/);
});
