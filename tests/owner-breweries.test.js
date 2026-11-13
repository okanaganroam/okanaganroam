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
  assert.equal(info.owner_fr.Food.fr, 'Camions de cuisine de rue la plupart des jours. Nourriture de l’extérieur bienvenue.');
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
