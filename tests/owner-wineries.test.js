// Wineries in the owner portal (Dayton, Nov 12 2026; drafts/winery-portal-2026-11-12/SPEC-wineries.md, "Decided"): their
// own 100-point checklist and a 12-screen easy setup (7 essentials, 5 optional), venue_winery_info, the tasting fee (live
// from $0 to $75 as the card price, higher waits for our check, the weekly price check skips owner prices), the Plan
// your visit lines written from the answers (research rows the owner didn't answer are kept), "By appointment" on cards
// and in Build My Trip from the owner's answers, the groups answer never setting "Great for groups", happy hour hidden,
// and restaurants, pubs and cafés unchanged.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-wineries-admin-token';
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
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '18:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Winery Test ${type} ${++n}`, slug: `winery-test-${type}-${n}`, region: 'naramata', type, latitude: 49.59 + n / 1000, longitude: -119.59,
  rating: 4.6, address: `${100 + n} Naramata Rd, Naramata`, phone: '250-555-0188', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the winery portal tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, setup = true) => postJson(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const progress = (t, step, status) => postJson(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const visitRows = (id) => ((app.venueVisitInfo(id) || {}).rows || []);
const row = (id, label) => visitRows(id).find((r) => r.label === label);
// A research "Plan your visit" box, as the Oct 29 winery pass wrote them.
const research = (id, rows, booking = null) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows, booking_url: booking, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};

// ---------- Steps per type ----------
test('steps: wineries get 7 essentials and 5 optional screens; restaurants, pubs and cafés keep theirs', () => {
  assert.deepEqual(app.WINERY_SETUP_PART1, ['basics', 'hours', 'winery', 'tastings', 'visit', 'photos', 'offer']);
  assert.deepEqual(app.WINERY_SETUP_PART2, ['story', 'experiences', 'menu', 'social', 'door']);
  assert.equal(app.setupStepsFor('winery').length, 12);
  assert.deepEqual(app.setupParts('restaurant').part1, ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(app.setupParts('restaurant').part2, ['happy', 'specials', 'music', 'story', 'book', 'takeout', 'known', 'groups', 'instagram', 'facebook', 'door']);
  assert.deepEqual(app.setupParts('pub').part1, ['basics', 'hours', 'closures', 'happy', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(app.setupParts('cafe').part1, ['basics', 'hours', 'cuisine', 'photos', 'menu', 'spend', 'offer']);
  assert.deepEqual(app.setupParts('cafe').part2, ['specials', 'story', 'diet', 'coffee', 'social', 'door']);
  assert.deepEqual(app.setupStepsFor('restaurant'), app.SETUP_STEPS);
  for (const k of ['happy', 'specials', 'music', 'spend', 'cuisine']) assert.ok(!app.setupStepsFor('winery').includes(k), `${k} is not a winery step (happy hour, specials and events are hidden)`);
});

test('setup page: a winery gets the winery setup; every other type keeps its own (no winery screens)', async () => {
  const w = mk('winery'); const tw = tokenFor(w.id);
  const r = await get(`/owner/${tw}/setup`);
  assert.equal(r.status, 200);
  const cfg = cfgOf(r.text);
  assert.equal(cfg.winery, true); assert.equal(cfg.combo, true);
  assert.deepEqual(cfg.part1, app.WINERY_SETUP_PART1);
  assert.equal(cfg.t.labels.tastings, 'Tastings'); assert.equal(cfg.t.labels.visit, 'Booking and groups');
  assert.match(cfg.t.hiLead, /About 10 to 20 minutes/);
  assert.deepEqual(cfg.placeTypes, pc.WINERY_KINDS);
  // What you offer: the reused tiles and Picnic area; no happy hour, food, sports, games, Wi-Fi or beach tiles.
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  for (const k of ['patio', 'heated_patio', 'lake_view', 'picnic_area', 'live_music', 'wheelchair_accessible', 'free_parking', 'rv_parking', 'locally_owned', 'kid_friendly', 'dog_friendly', 'nonalcoholic']) assert.ok(keys.includes(k), k);
  for (const k of ['happy_hour', 'vegan', 'vegetarian', 'gluten_free', 'sports_tv', 'off_sales', 'takeout', 'wifi', 'beach_access', 'pool']) assert.ok(!keys.includes(k), `${k} is hidden for wineries`);
  assert.equal(cfg.offerLabels.picnic_area, 'Picnic area');
  assert.match(cfg.offerLabels.nonalcoholic, /drivers and kids/);
  // Help topics for wineries.
  for (const id of ['winery-price', 'winery-appointment', 'winery-restaurant', 'winery-happy', 'winery-groups']) assert.ok(r.text.includes(`"${id}"`) || r.text.includes(id), id);
  // Restaurants, pubs and cafés: no winery flag or screens.
  for (const type of ['restaurant', 'pub', 'cafe']) {
    const v = mk(type); const c = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
    assert.equal(c.winery, false, type);
    assert.ok(!c.steps.includes('tastings') && !c.steps.includes('winery') && !c.steps.includes('visit'), type);
    assert.equal(c.t.labels.tastings, undefined, type);
  }
  // French.
  const fr = cfgOf((await get(`/fr/owner/${tw}/setup`)).text);
  assert.equal(fr.t.labels.tastings, 'Dégustations');
  assert.equal(fr.t.wkindQ, 'Quel genre de vignoble est-ce ?');
});

// ---------- Each step saves and reads back ----------
test('each winery step saves live from the setup and reads back in the setup', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  // Your winery: the kind and food here.
  let r = await change(t, { place_type: 'Boutique winery' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await change(t, { winery_info: { food: 'restaurant', restaurant: { name: 'The Vine Bistro', when: 'Thu–Mon from noon' } } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(!(r.body.review || []).length);
  // Tastings.
  r = await change(t, { tasting_fee: 15 }); assert.equal(r.status, 200); assert.ok(!(r.body.review || []).length, 'a $15 tasting is live');
  r = await change(t, { winery_info: { waived: 'yes' } }); assert.equal(r.status, 200);
  // Booking and groups.
  r = await change(t, { winery_info: { visit: 'recommended', groups: 8, buses: 'book' } }); assert.equal(r.status, 200);
  // Off-season by appointment, with the walk-in season.
  r = await change(t, { winery_info: { year: 'appointment', season: { from: '04-01', to: '10-31' } } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // Experiences.
  r = await change(t, { winery_info: { experiences: [{ label: 'Wine & cheese', text: '$45 a person, daily at 1 PM' }, { label: 'Vineyard tour' }] } }); assert.equal(r.status, 200);
  // Known for (the story screen) and the tiles.
  r = await change(t, { visit_rows: { known_for: 'Pinot Noir and Chardonnay from estate vines' } }); assert.equal(r.status, 200);
  r = await change(t, { badges: { picnic_area: true, wheelchair_accessible: true, patio: true } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const [step, st] of [['winery', 'live'], ['tastings', 'live'], ['visit', 'live'], ['experiences', 'live'], ['story', 'live'], ['offer', 'live']]) assert.equal((await progress(t, step, st)).status, 200, step);
  assert.deepEqual(app.wineryInfoAnswers(w.id), { food: 'restaurant', restaurant: { name: 'The Vine Bistro', when: 'Thu–Mon from noon' }, waived: 'yes', visit: 'recommended', groups: 8, buses: 'book',
    year: 'appointment', season: { from: '04-01', to: '10-31' }, experiences: [{ label: 'Wine & cheese', text: '$45 a person, daily at 1 PM' }, { label: 'Vineyard tour' }] });
  assert.equal(app.wineryTastingFee(w.id), 15);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.place_type, 'Boutique winery');
  assert.equal(cfg.cur.tasting_fee, 15);
  assert.equal(cfg.cur.winery_info.visit, 'recommended');
  assert.equal(cfg.cur.badges.picnic_area, true);
  assert.equal(cfg.progress.done.tastings, 'live');
  // The Plan your visit lines written from the answers (English, with French alongside).
  assert.equal(row(w.id, 'Tastings').text, '$15 a person, free with a bottle purchase. Booking recommended.');
  assert.equal(row(w.id, 'Groups').text, 'Groups of 8 or more, and tour buses and limos, please book ahead.');
  assert.equal(row(w.id, 'Restaurant').text, 'The Vine Bistro on site, Thu–Mon from noon.');
  assert.equal(row(w.id, 'Winter').text, 'Nov 1 – Mar 31: by appointment. Please call ahead.');
  assert.equal(row(w.id, 'Wine & cheese').text, '$45 a person, daily at 1 PM');
  assert.equal(row(w.id, 'Known for').text, 'Pinot Noir and Chardonnay from estate vines');
  const page = app.renderVenuePage(app.getVenue(w.id), [], [], [], { lang: 'en' });
  assert.match(page, /\$15 a person, free with a bottle purchase/);
  const pageFr = app.renderVenuePage(app.getVenue(w.id), [], [], [], { lang: 'fr' });
  assert.match(pageFr, /15 \$ par personne, offerte à l’achat d’une bouteille/);
  // Logged as the owner's, and the change can be undone.
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'winery_info' AND source = 'venue_owner'").get(w.id));
  await change(t, { winery_info: { buses: 'no' } });
  const last = db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(last, 'test').ok, true);
  assert.equal(app.wineryInfoAnswers(w.id).buses, 'book');
});

test('“No” answers save: no extras, no online bookings, not on Instagram or Facebook, no dogs, and no website', async () => {
  const w = mk('winery', { website: null }); const t = tokenFor(w.id);
  let r = await change(t, { winery_info: { experiences: [] } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await progress(t, 'experiences', 'no')).status, 200);
  r = await change(t, { not_offered: ['booking_link'] }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await change(t, { not_offered: ['booking_link', 'instagram', 'facebook', 'dogs', 'website'] }); assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const s of ['instagram', 'facebook', 'social', 'closures']) assert.equal((await progress(t, s, 'no')).status, 200, s);
  assert.deepEqual(app.wineryInfoAnswers(w.id).experiences, []);
  // An unscored "No" key from another type is still refused for a winery.
  r = await change(t, { not_offered: ['booking_link', 'wifi'] }); assert.equal(r.status, 400);
});

test('bad winery answers are refused with a plain reason', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  for (const bad of [{ visit: 'maybe' }, { groups: 7 }, { buses: 'yes' }, { food: 'pizza' }, { year: 'appointment' }, { season: { from: '13-01', to: '10-01' } }, { experiences: [{ label: 'x', text: 'see https://x.com' }] }, { nope: 1 }]) {
    const r = await change(t, { winery_info: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await change(t, { tasting_fee: -1 })).status, 400);
  assert.equal((await change(t, { tasting_fee: 'ten' })).status, 400);
  // Not a winery: refused.
  const c = mk('cafe');
  assert.equal((await change(tokenFor(c.id), { winery_info: { visit: 'walk_in' } })).status, 400);
  assert.equal((await change(tokenFor(c.id), { tasting_fee: 10 })).status, 400);
});

// ---------- Tasting fee: live up to $75, reviewed above; the card price; the weekly check ----------
test('tasting fee: live from $0 to $75 as the card price; over $75 waits for our check; Free reads “Free tasting”', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  let r = await change(t, { tasting_fee: 75 });
  assert.equal(r.status, 200); assert.ok(!(r.body.review || []).length);
  assert.equal(app.cardPriceFor(w.id), 'From $75');
  assert.equal(app.priceCheck.isOwnerPrice(w.id), true);
  r = await change(t, { tasting_fee: 120 });
  assert.equal(r.status, 200); assert.deepEqual(r.body.review, ['tasting_fee'], 'over $75 is checked first');
  assert.equal(app.wineryTastingFee(w.id), 75, 'the page keeps $75 until we approve');
  assert.equal(app.cardPriceFor(w.id), 'From $75');
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.tasting_fee_waiting, 120);
  // Approved from the review queue: live.
  const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0").get(w.id);
  assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true);
  assert.equal(app.wineryTastingFee(w.id), 120);
  assert.equal(app.cardPriceFor(w.id), 'From $120');
  // Free.
  r = await change(t, { tasting_fee: 0 });
  assert.equal(r.status, 200); assert.ok(!(r.body.review || []).length);
  assert.equal(app.cardPriceFor(w.id), 'Free tasting');
  assert.equal(row(w.id, 'Tastings').text, 'Free tastings.');
});

test('the weekly price check skips an owner’s price, and research never overwrites it', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  app.CARD_PRICES[String(w.id)] = { from: 10, basis: 'Standard tasting', conf: 'site', source: 'https://example.com/tastings' };
  const fetched = [];
  const pcOwn = require('../price-check.js').createPriceCheck({ db, prices: app.CARD_PRICES, fetchFn: async (u) => { fetched.push(u); return { ok: true, headers: { get: () => 'text/html' }, text: async () => 'Tastings $12' }; } });
  assert.notEqual(await pcOwn.checkOne(w.id), null, 'a research price is checked');
  assert.equal((await change(t, { tasting_fee: 18 })).status, 200);
  app.priceCheck.applyOverrides();
  pcOwn.applyOverrides();
  fetched.length = 0;
  assert.equal(await pcOwn.checkOne(w.id), null, 'an owner price is never checked');
  assert.equal(fetched.length, 0);
  assert.ok(!pcOwn.listFlagged().some((r) => r.venue_id === w.id), 'never on the review list');
  assert.equal(app.cardPriceFor(w.id), 'From $18');
  // Taken back (an Undo): the researched price comes back.
  const last = db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(last, 'test').ok, true);
  assert.equal(app.priceCheck.isOwnerPrice(w.id), false);
});

// ---------- Plan your visit: owner answers vs research rows ----------
test('answers update the matching research rows and never wipe the ones not answered; an Undo puts research back', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [
    { label: 'Tastings', text: 'Five wines from $15, about 30 min. Walk-ins welcome.' },
    { label: 'Groups', text: 'Groups of 10 or more, please book ahead.' },
    { label: 'Winter', text: 'Closed Nov 1 to Apr 1.' },
    { label: 'Picnic area', text: 'Bring a picnic to the lawn.' },
  ], 'https://example.com/book');
  // Only groups answered: Groups changes, the rest stays research's.
  assert.equal((await change(t, { winery_info: { groups: 6 } })).status, 200);
  assert.equal(row(w.id, 'Groups').text, 'Groups of 6 or more, please book ahead.');
  assert.equal(row(w.id, 'Tastings').text, 'Five wines from $15, about 30 min. Walk-ins welcome.');
  assert.equal(row(w.id, 'Winter').text, 'Closed Nov 1 to Apr 1.');
  assert.equal(row(w.id, 'Picnic area').text, 'Bring a picnic to the lawn.');
  // How people visit alone keeps research's Tastings line (it has the price); the fee rewrites it.
  assert.equal((await change(t, { winery_info: { visit: 'walk_in' } })).status, 200);
  assert.equal(row(w.id, 'Tastings').text, 'Five wines from $15, about 30 min. Walk-ins welcome.');
  assert.equal((await change(t, { tasting_fee: 20 })).status, 200);
  assert.equal(row(w.id, 'Tastings').text, '$20 a person. Walk-ins welcome.');
  // Research can't bring its lines back over the owner's.
  research(w.id, [{ label: 'Tastings', text: 'Research again' }, { label: 'Groups', text: 'Research groups' }, { label: 'Winter', text: 'Research winter' }]);
  assert.equal(row(w.id, 'Tastings').text, '$20 a person. Walk-ins welcome.');
  assert.equal(row(w.id, 'Groups').text, 'Groups of 6 or more, please book ahead.');
  assert.equal(row(w.id, 'Winter').text, 'Research winter', 'not answered: research may update it');
  // Undo the fee: research's Tastings line comes back.
  const feeReq = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%tasting_fee%' ORDER BY id DESC").get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(feeReq, 'test').ok, true);
  assert.equal(row(w.id, 'Tastings').text, 'Five wines from $15, about 30 min. Walk-ins welcome.', 'with no fee, research’s line comes back (the visit answer alone never replaces it)');
});

test('food here: a restaurant with its own page is only pointed to; none removes research food lines', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  const resto = mk('restaurant', { address: app.getVenue(w.id).address, name: 'Old Barrel Bistro' });
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.restaurantPage.name, 'Old Barrel Bistro');
  assert.equal((await change(t, { winery_info: { food: 'restaurant' } })).status, 200);
  assert.equal(row(w.id, 'Restaurant').text, 'Old Barrel Bistro on site.');
  assert.equal(row(w.id, 'Restaurant').venue_id, resto.id);
  // A later save keeps the line it wrote (it is not research's).
  assert.equal((await change(t, { tasting_fee: 12 })).status, 200);
  assert.equal(row(w.id, 'Restaurant').text, 'Old Barrel Bistro on site.');
  const w2 = mk('winery'); const t2 = tokenFor(w2.id);
  research(w2.id, [{ label: 'Tastings', text: 'From $10.' }, { label: 'Restaurant', text: 'Bistro open daily.' }]);
  assert.equal((await change(t2, { winery_info: { food: 'picnic' } })).status, 200);
  assert.equal(row(w2.id, 'Restaurant'), undefined);
  assert.equal(row(w2.id, 'Food').text, 'Picnic area: bring a picnic.');
  assert.equal(row(w2.id, 'Tastings').text, 'From $10.');
});

test('experiences replace research’s extra lines; “none” clears them; owner-verified hours and descriptions are never touched', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [{ label: 'Tastings', text: 'From $10.' }, { label: 'Vineyard tour', text: 'Tours at 2 PM.' }, { label: 'Charcuterie', text: 'Boards on the patio.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.extras.map((e) => e.label), ['Vineyard tour', 'Charcuterie'], 'research extras are offered to edit');
  const before = db.prepare('SELECT hours, description FROM venues WHERE id = ?').get(w.id);
  assert.equal((await change(t, { winery_info: { experiences: [{ label: 'Wine & cheese', text: 'Daily at 1.' }] } })).status, 200);
  assert.deepEqual(visitRows(w.id).map((r) => r.label), ['Tastings', 'Wine & cheese']);
  assert.equal((await change(t, { winery_info: { experiences: [] } })).status, 200);
  assert.deepEqual(visitRows(w.id).map((r) => r.label), ['Tastings']);
  research(w.id, [{ label: 'Tastings', text: 'From $10.' }, { label: 'Vineyard tour', text: 'Tours at 2 PM.' }]);
  assert.ok(!row(w.id, 'Vineyard tour'), 'research can’t bring back an extra the owner removed');
  const after = db.prepare('SELECT hours, description FROM venues WHERE id = ?').get(w.id);
  assert.deepEqual(after, before);
});

// ---------- By appointment from the owner's answers ----------
test('by appointment: the owner’s answers drive the card line and Build My Trip; unanswered wineries keep the old guess', async () => {
  const appt = mk('winery'); const ta = tokenFor(appt.id);
  assert.equal((await change(ta, { winery_info: { visit: 'appointment' } })).status, 200);
  const walk = mk('winery', { description: 'Tastings by appointment only.' }); const tw = tokenFor(walk.id);
  assert.equal((await change(tw, { winery_info: { visit: 'walk_in' } })).status, 200);
  const guess = mk('winery', { description: 'Tastings by appointment only.' });
  const off = mk('winery'); const to = tokenFor(off.id);
  // Walk-ins all year except a short window around today, so today is in the off-season.
  const md = (d) => d.slice(5);
  const from = md(app.addLocalDays(today, 10)), until = md(app.addLocalDays(today, 200));
  assert.equal((await change(to, { winery_info: { year: 'appointment', season: { from, to: until } } })).status, 200);
  assert.equal(app.wineryAppointmentOn(appt.id, today), true);
  assert.equal(app.wineryAppointmentOn(walk.id, today), false);
  assert.equal(app.wineryAppointmentOn(guess.id, today), null);
  assert.equal(app.wineryAppointmentOn(off.id, today), true);
  assert.equal(app.wineryAppointmentOn(off.id, app.addLocalDays(today, 30)), false, 'in the walk-in season');
  // Cards.
  const vs = [appt, walk, guess, off].map((v) => app.getVenue(v.id));
  const info = app.foodDrinkOpenNowInfo(vs, new Map(), new Date(), { requireVerified: false });
  assert.equal(app.cardStatusFor(info.byId.get(appt.id), vs[0]).text, 'By appointment · call ahead');
  assert.equal(app.cardStatusFor(info.byId.get(off.id), vs[3]).text, 'By appointment · call ahead');
  assert.ok(!info.openIds.has(appt.id), 'never counted as open');
  assert.notEqual(app.cardStatusFor(info.byId.get(walk.id), vs[1]).state, 'appointment');
  assert.equal(app.cardStatusFor(null, { ...vs[1], hours: null }).state, 'unknown', 'walk-ins: its words are no longer read as by appointment');
  assert.equal(app.cardStatusFor(null, { ...vs[2], hours: null }).state, 'appointment', 'unanswered: the old guess from its words');
  // Build My Trip.
  const facts = app.buildTripPlannerFacts(true);
  const f = (id) => facts.find((x) => x.id === id);
  assert.equal(f(appt.id).ownerAppointment, true);
  assert.equal(f(walk.id).ownerAppointment, false);
  assert.equal('ownerAppointment' in f(guess.id), false);
  assert.equal(planner.appointmentOnly(f(appt.id)), true);
  assert.equal(planner.appointmentOnly(f(walk.id)), false, 'the owner said walk-ins, whatever the description says');
  assert.equal(planner.appointmentOnly(f(guess.id)), true);
  const later = app.buildTripPlannerFacts(true, app.addLocalDays(today, 30));
  assert.equal(later.find((x) => x.id === off.id).ownerAppointment, false, 'judged on the trip’s date');
});

test('groups answer does not turn on “Great for groups”; happy hour stays stored and shown', async () => {
  const w = mk('winery', { great_groups: 0, happy_hour: 1 }); const t = tokenFor(w.id);
  assert.equal((await change(t, { winery_info: { groups: 10, buses: 'welcome' } })).status, 200);
  assert.equal(Number(db.prepare('SELECT great_groups FROM venues WHERE id = ?').get(w.id).great_groups), 0);
  assert.equal(app.ownerVenueSnapshot(app.getVenue(w.id), null).badges.great_groups, false);
  // Happy hour is not a winery setup step or tile, but the edit page keeps it.
  assert.ok(!app.setupStepsFor('winery').includes('happy'));
  assert.equal(Number(db.prepare('SELECT happy_hour FROM venues WHERE id = ?').get(w.id).happy_hour), 1);
});

// ---------- Checklist ----------
test('checklist: winery weights sum to 100 in the spec groups; restaurants, pubs and cafés keep theirs', () => {
  assert.equal(pc.WINERY_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  const g = {};
  for (const it of pc.WINERY_ITEMS) g[it.group] = (g[it.group] || 0) + it.w;
  assert.deepEqual(g, { basics: 14, hours: 17, photos: 16, tastings: 24, yourvisit: 11, about: 8, social: 6, finding: 2, confirmed: 2 });
  const w = Object.fromEntries(pc.WINERY_ITEMS.map((i) => [i.key, i.w]));
  assert.deepEqual(w, { address_pin: 4, phone: 4, website: 3, winery_kind: 3, hours: 8, hours_fresh: 4, season: 5, photo_main: 9, photo_extra: 7, tasting_price: 8, visit_how: 8, booking_link: 4, winery_groups: 4,
    food_here: 4, dogs_kids: 4, access: 3, description: 5, pyv_known: 3, instagram: 3, facebook: 3, arrival: 2, owner_confirmed: 2 });
  assert.ok(!w.happy_hour && !w.specials && !w.entertainment && !w.menu, 'happy hour, specials, events and the wine list are unscored');
  for (const it of pc.WINERY_ITEMS) assert.ok(it.en && it.fr && it.whyEn && it.whyFr && (it.fix === false || (it.btnEn && it.btnFr)), `${it.key} has its words in both languages`);
  for (const k of pc.noneKeysFor('winery')) assert.ok(pc.GOT_TEXT[k] && pc.GOT_TEXT[k].fr, `${k} has its Got it text`);
  assert.equal(pc.CAFE_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.equal(pc.PUB_ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.equal(pc.ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.deepEqual(pc.noneKeysFor('cafe').sort(), ['dietary', 'dogs', 'entertainment', 'facebook', 'happy_hour', 'instagram', 'ordering', 'pyv_groups', 'specials', 'washroom', 'website', 'wifi']);
  assert.deepEqual([...pc.NONE_KEYS].sort(), ['dietary', 'entertainment', 'facebook', 'happy_hour', 'instagram', 'pyv_groups', 'pyv_reservations', 'pyv_takeout', 'specials', 'website']);
});

test('checklist: a winery reaches 100% after the 12 screens and earns Complete & Verified', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  const steps = [
    { place_type: 'Estate winery' }, { winery_info: { food: 'snacks' } }, { tasting_fee: 0 },
    { winery_info: { visit: 'walk_in', groups: 8, buses: 'welcome', year: 'all' } }, { hours_checked: true },
    { badges: { dog_friendly: true, wheelchair_accessible: true } },
    { visit_rows: { known_for: 'Estate Riesling' } }, { instagram_url: '@wineryfixture' }, { facebook_url: 'https://www.facebook.com/wineryfixture' },
  ];
  for (const c of steps) { const r = await change(t, c); assert.equal(r.status, 200, `${JSON.stringify(c)}: ${JSON.stringify(r.body)}`); }
  // What only photos, the storefront spot, a longer description and a claim give.
  db.prepare("UPDATE venues SET description = ?, image_url = '/images/owner/fixture.jpg' WHERE id = ?").run('A family estate winery above the lake, with a patio, a picnic lawn and tastings of estate Riesling, Pinot Noir and Chardonnay every day of the year.', w.id);
  const v = app.getVenue(w.id);
  const live = app.ownerVenueSnapshot(v, null);
  const r = pc.scoreCompleteness({ type: 'winery', address: v.address, latitude: 1, longitude: 1, phone: v.phone, website: v.website, hasHours: true, hoursCheckedAt: today, imageUrl: '/images/owner/x.jpg', photoCount: 3,
    placeType: live.place_type, wineryInfo: live.winery_info, tastingFee: live.tasting_fee, bookingUrl: '', visitLabels: visitRows(w.id).map((x) => x.label), description: 'x'.repeat(130),
    instagramUrl: 'x', facebookUrl: 'x', hasArrival: true, claimed: true, dogFriendly: true, ownerFeatures: ['wheelchair_accessible'], declaredNone: [] }, { today });
  assert.deepEqual(r.missing.map((x) => x.key), []);
  assert.equal(r.pct, 100);
  assert.equal(pc.badgeState(r, true), 'earned');
  // The setup's own score agrees on what is left (no happy hour, specials or events).
  const sc = app.setupScore(app.venueForOwnerToken(t));
  assert.ok(!sc.left.some((x) => ['happy_hour', 'specials', 'entertainment', 'menu', 'avg_spend', 'cuisine'].includes(x.k)), JSON.stringify(sc.left));
});

test('checklist: the winery items score from the owner answers', () => {
  const base0 = { type: 'winery', address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: today };
  const done = (x) => pc.doneMap({ ...base0, ...x }, today);
  assert.equal(done({ placeType: 'Estate winery' }).winery_kind, true);
  assert.equal(done({ placeType: 'Bakery' }).winery_kind, false);
  assert.equal(done({ wineryInfo: { year: 'appointment' } }).season, true);
  assert.equal(done({ tastingFee: 0 }).tasting_price, true, 'Free counts');
  assert.equal(done({ tastingFee: null }).tasting_price, false);
  assert.equal(done({ wineryInfo: { visit: 'walk_in' } }).booking_link, true, 'walk-ins only needs no link');
  assert.equal(done({ wineryInfo: { visit: 'needed' } }).booking_link, false);
  assert.equal(done({ wineryInfo: { visit: 'needed' }, bookingUrl: 'https://x' }).booking_link, true);
  assert.equal(done({ wineryInfo: { buses: 'no' } }).winery_groups, true);
  assert.equal(done({ wineryInfo: { food: 'none' } }).food_here, true);
  assert.equal(done({ ownerFeatures: ['free_parking'] }).access, true);
  assert.equal(done({ offerAnswered: true }).access, true);
  assert.equal(done({ declaredNone: ['dogs'] }).dogs_kids, true);
});

test('the Hours step needs its holidays part, as for cafés; Instagram and Facebook are one screen', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await progress(t, 'hours', 'live')).status, 200);
  assert.equal(app.setupState(w.id), 'none', 'hours without their holidays part are not done yet');
  assert.equal((await progress(t, 'closures', 'live')).status, 200);
  assert.equal(app.setupState(w.id), 'partial');
  for (const s of ['instagram', 'facebook', 'social']) assert.equal((await progress(t, s, 'unsure')).status, 200, s);
  assert.equal((await progress(t, 'happy', 'live')).status, 400, 'happy hour is not a winery step');
  for (const s of app.WINERY_SETUP_PART1) assert.equal((await progress(t, s, 'skip')).status, 200, s);
  assert.equal(app.setupState(w.id), 'essentials');
  for (const s of app.WINERY_SETUP_PART2) await progress(t, s, 'skip');
  assert.equal(app.setupState(w.id), 'done');
});

// ---------- Words ----------
test('every winery word has English and French, with French spacing', () => {
  const keys = (o, p = '') => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], `${p}${k}.`) : [`${p}${k}`]));
  const en = keys(text.en.winery), fr = new Set(keys(text.fr.winery));
  assert.deepEqual(en.filter((k) => !fr.has(k)), []);
  assert.deepEqual([...fr].filter((k) => !en.includes(k)), []);
  const at = (o, k) => k.split('.').reduce((a, x) => a[x], o);
  for (const k of en) {
    const f = at(text.fr.winery, k);
    if (typeof f === 'string') assert.ok(!/\S[?!](\s|$)/.test(f) && !/[^\s \d/]:\s/.test(f), `${k}: French spacing (${f})`);
  }
  assert.equal(text.en.winery.expQuick.length, text.fr.winery.expQuick.length);
  // Every label the winery setup shows exists in both languages.
  for (const s of app.setupStepsFor('winery')) {
    assert.ok({ ...text.en.labels, ...text.en.winery.labels }[s], `en label ${s}`);
    assert.ok({ ...text.fr.labels, ...text.fr.winery.labels }[s], `fr label ${s}`);
  }
  for (const id of ['winery-price', 'winery-appointment', 'winery-restaurant', 'winery-happy', 'winery-groups']) {
    const tp = app.WINERY_SETUP_HELP_TOPICS.find((x) => x.id === id);
    assert.ok(tp && tp.q && tp.qFr && tp.a && tp.aFr, id);
  }
});

test('restaurants, pubs and cafés are unchanged: no winery fields, kinds or owner tiles', async () => {
  for (const type of ['restaurant', 'pub', 'cafe']) {
    const v = mk(type);
    const snap = app.ownerVenueSnapshot(app.getVenue(v.id), null);
    assert.ok(!('winery_info' in snap) && !('tasting_fee' in snap), type);
    assert.ok(!app.ownerExtraBadgesFor(type).includes('picnic_area'), type);
    assert.ok(!app.placeTypesFor(type).includes('Estate winery'), type);
  }
  assert.deepEqual(app.ownerExtraBadgesFor('cafe'), ['wifi', 'dairy_free_milk', 'drive_thru', 'walk_up', 'washroom', 'stroller', 'dog_treats', 'free_parking', 'wheelchair_accessible', 'locally_owned', 'takeout', 'service_dogs']);
});

// ---------- Winery test 1 fixes (2026-11-12; drafts/fresh-eyes-winery1-2026-11-12/REPORT.md) ----------
const vpage = (v, lang, now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const statusLine = (html) => (/<p class="venue-open-status" data-open="([a-z]+)" id="venueOpenStatus">([^<]*)/.exec(html) || []).slice(1).map((x) => x.trim());

test('venue page: a winery by appointment in its off-season says so, like its card; walk-in season keeps open/closed', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await change(t, { winery_info: { year: 'appointment', season: { from: '05-01', to: '10-31' } } })).status, 200);
  const nov = new Date('2026-11-18T20:00:00Z'), jul = new Date('2026-07-15T20:00:00Z');
  const off = vpage(w, 'en', nov);
  assert.deepEqual(statusLine(off), ['appointment', 'By appointment · call ahead']);
  assert.ok(!/Open now/.test(statusLine(off)[1] || ''));
  assert.match(off, /class="venue-season venue-winery-offseason"[^>]*>Nov 1 – Apr 30: by appointment, call ahead</);
  const offFr = vpage(w, 'fr', nov);
  assert.deepEqual(statusLine(offFr), ['appointment', 'Sur rendez-vous · appelez avant']);
  assert.match(offFr, /venue-winery-offseason"[^>]*>Du 1er nov\.? au 30 avr\.? : sur rendez-vous, appelez avant</);
  const on = vpage(w, 'en', jul);
  assert.equal(statusLine(on)[0], 'open', 'walk-in season: the normal open line');
  assert.match(on, /Nov 1 – Apr 30: by appointment, call ahead/, 'the off-season line stays in Hours all year');
  // All year by appointment: the status line, no off-season line. A winery that never answered: unchanged.
  const a = mk('winery');
  assert.equal((await change(tokenFor(a.id), { winery_info: { visit: 'appointment' } })).status, 200);
  assert.deepEqual(statusLine(vpage(a, 'en', jul)), ['appointment', 'By appointment · call ahead']);
  assert.ok(!vpage(a, 'en', jul).includes('venue-winery-offseason'));
  const plain = mk('winery');
  assert.equal(statusLine(vpage(plain, 'en', nov))[0], 'open');
  // A restaurant's page is unchanged.
  const r = mk('restaurant');
  assert.equal(statusLine(vpage(r, 'en', nov))[0], 'open');
});

test('help: the tasting price answer says how to change it and never offers the price range topic', async () => {
  const tp = app.OWNER_HELP_TOPICS.find((x) => x.id === 'winery-price') || null;
  assert.equal(tp, null, 'a winery topic, not a general one');
  const w = mk('winery'); const t = tokenFor(w.id);
  const ohb = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  for (const p of [`/owner/${t}/setup`, `/owner/${t}`, `/fr/owner/${t}/setup`]) {
    const r = await get(p); assert.equal(r.status, 200, p);
    const topic = ohb(r.text).topics.find((x) => x.id === 'winery-price');
    assert.ok(topic, p);
    assert.match(topic.a, /To change it, open <strong>Set up your page<\/strong> and tap <strong>Tastings<\/strong>/);
    assert.match(topic.aFr, /Pour le changer, ouvrez <strong>Configurez votre page<\/strong> et touchez <strong>Dégustations<\/strong>/);
    assert.ok(topic.noRelated.includes('price-range') && topic.noRelated.includes('avg-spend'));
    assert.ok(topic.over.includes('price-range'));
    assert.ok(topic.keys.includes('wrong tasting price'));
  }
  // The widget leaves noRelated topics out of the "pick another topic" chips.
  assert.match((await get(`/owner/${t}/setup`)).text, /\(t\.noRelated \|\| \[\]\)\.forEach\(function\(x\)\{ seen\[x\] = 1; \}\)/);
  // The French answer names the renamed question.
  const ap = (await get(`/owner/${t}/setup`)).text;
  assert.ok(!ap.includes('Comment vous visite-t-on'));
});

test('none words: “we don’t take bookings online” reads in words, and every none key has words', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery']) {
    for (const k of pc.noneKeysFor(type)) {
      const w = app.OWNER_NONE_WORDS[k];
      assert.ok(Array.isArray(w) && w[0] && w[1] && !w[0].includes('_'), `${type}: ${k}`);
    }
  }
  const v = mk('winery'); const t = tokenFor(v.id);
  assert.equal((await change(t, { not_offered: ['booking_link'] }, false)).status, 200);
  const home = (await get(`/owner/${t}`)).text;
  assert.match(home, /You told us you don’t have: online booking/);
  assert.ok(!/don’t have: booking_link/.test(home));
  assert.match((await get(`/fr/owner/${t}`)).text, /Vous nous avez dit que vous n’avez pas\u00a0: de réservation en ligne/);
});

test('tastings card: the owner’s own line is credited “From the winery”, not the website or a checked date', () => {
  const nt = require('../niche-tastings.js');
  const esc = (s) => String(s);
  const base = { source_url: 'https://www.sunfield.example/visit', checked_at: '2026-11-12' };
  const own = nt.wineryTastingsHtml({ ...base, rows: [{ label: 'Tastings', text: 'From $10 a person.' }], owner_labels: ['Tastings'] }, esc);
  assert.match(own, /<p class="fd-note">From the winery\. Confirm/);
  assert.ok(!own.includes('sunfield.example') && !own.includes('checked'));
  const res = nt.wineryTastingsHtml({ ...base, rows: [{ label: 'Tastings', text: '$10.' }] }, esc);
  assert.match(res, /From sunfield\.example · checked Nov 12, 2026\./);
  const mixed = nt.wineryTastingsHtml({ ...base, rows: [{ label: 'Tastings', text: '$10.' }, { label: 'Tours', text: 'Daily.' }], owner_labels: ['Tastings'] }, esc);
  assert.match(mixed, /From the winery and sunfield\.example · checked/);
});

test('plan your visit: a full box drops research that repeats an answer before unrelated research; Undo brings it back', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [
    { label: 'Tastings', text: 'Tastings $10 a person.' }, { label: 'Groups', text: 'Groups of 10 or more, call ahead.' },
    { label: 'Picnics', text: 'Picnic tables on the lawn.' }, { label: 'Parking', text: 'Free parking by the tasting room.' },
    { label: 'Patio', text: 'Lake-view patio.' }, { label: 'Good to know', text: 'Cash and cards.' },
  ]);
  assert.equal((await change(t, { winery_info: { year: 'appointment', season: { from: '05-01', to: '10-31' } } })).status, 200);
  assert.equal(visitRows(w.id).length, 7);
  assert.equal((await change(t, { winery_info: { food: 'picnic' } })).status, 200);
  const labels = visitRows(w.id).map((r) => r.label);
  assert.equal(labels.length, 7);
  assert.ok(labels.includes('Food') && labels.includes('Parking'), labels.join());
  assert.ok(!labels.includes('Picnics'), 'the research line that repeats “Food: Picnic area” goes first');
  // Undo the food answer: the picnic line comes back.
  const req = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%picnic%' ORDER BY id DESC").get(w.id).id;
  const un = app.undoOwnerInstantChange(req, 'dayton', new Date(), 'test');
  assert.equal(un.ok, true, JSON.stringify(un));
  const after = visitRows(w.id).map((r) => r.label);
  assert.ok(after.includes('Picnics') && after.includes('Parking') && !after.includes('Food'), after.join());
  // The same when the owner's own line fills the box (a Dogs line from "What you offer", as in the test).
  assert.equal((await change(t, { winery_info: { food: 'picnic' } })).status, 200);
  assert.equal(visitRows(w.id).length, 7);
  assert.ok(!visitRows(w.id).some((r) => r.label === 'Picnics'));
  research(w.id, [{ label: 'Tastings', text: 'Tastings $10 a person.' }, { label: 'Parking', text: 'Free parking by the tasting room.' }, { label: 'Picnics', text: 'Picnic tables on the lawn.' }]);
  const w2 = mk('winery'); const t2 = tokenFor(w2.id);
  research(w2.id, [
    { label: 'Tastings', text: 'Tastings $10 a person.' }, { label: 'Groups', text: 'Groups of 10 or more, call ahead.' },
    { label: 'Picnics', text: 'Picnic tables on the lawn.' }, { label: 'Parking', text: 'Free parking by the tasting room.' },
  ]);
  assert.equal((await change(t2, { winery_info: { food: 'picnic', year: 'appointment', season: { from: '05-01', to: '10-31' } } })).status, 200);
  assert.equal((await change(t2, { visit_rows: { known_for: 'Pinot Noir from estate vines' } })).status, 200);
  assert.equal(visitRows(w2.id).length, 7);
  assert.equal((await change(t2, { badges: { dog_friendly: true }, visit_rows: { dogs: 'Leashed dogs welcome on the patio.' } })).status, 200);
  const l2 = visitRows(w2.id).map((r) => r.label);
  assert.ok(l2.includes('Dogs') && l2.includes('Parking') && !l2.includes('Picnics'), l2.join());
  // A restaurant's full box still drops its last research row, as before.
  const r = mk('restaurant');
  research(r.id, ['A', 'B', 'C', 'D', 'E', 'F', 'Picnics'].map((x) => ({ label: x, text: `${x} line.` })));
  assert.equal((await change(tokenFor(r.id), { visit_rows: { known_for: 'Good food' } })).status, 200);
  assert.deepEqual(visitRows(r.id).map((x) => x.label), ['A', 'B', 'C', 'D', 'E', 'F', 'Known for']);
});

test('setup: “Change an answer” on the essentials-done screen, winery icons, wording and the picnic suggestion', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  const r = await get(`/owner/${t}/setup`);
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /id="suChangeAnswer" data-act="go:start">' \+ h\(T\.changeAnswer\)/);
  assert.match(js, /experiences: '🍇', menu: '🍷'/);
  // Every Part 2 tile of every type has an icon (no '•').
  const icons = /var P2_ICONS = (\{[^}]*\})/.exec(js)[1];
  for (const type of ['restaurant', 'pub', 'cafe', 'winery']) for (const k of app.setupParts(type).part2) assert.ok(new RegExp(`\\b${k}: '`).test(icons), `${type}: ${k}`);
  const cfg = cfgOf(r.text);
  assert.equal(cfg.t.changeAnswer, 'Change an answer');
  assert.equal(text.fr.changeAnswer, 'Modifier une réponse');
  assert.equal(cfg.t.webQ, 'Is this where your wine list is?'); assert.equal(cfg.t.webLabel, 'Wine list web address');
  assert.equal(cfg.t.bookLinkEx, 'your website’s booking page');
  assert.equal(cfg.t.groupsSizeLead, 'For example: “Groups of 8 or more, please book ahead”.');
  assert.equal(cfg.t.wkindLead, 'Pick the one visitors would use to describe you.');
  assert.equal(cfg.t.foodLead, 'Pick the main one. Add the rest under Experiences.');
  assert.equal(text.fr.winery.wkindSubs['Boutique winery'], 'Une petite équipe, souvent la famille');
  assert.equal(text.fr.winery.visitQ, 'Comment les visiteurs viennent-ils ?');
  assert.equal(text.fr.winery.groupsSizeLead, 'Par exemple : « Groupes de 8 personnes ou plus : réservez à l’avance ».');
  assert.ok(!JSON.stringify(text.en.winery).includes('Tock') && !JSON.stringify(text.fr.winery).includes('Tock'));
  assert.ok(text.en.winery.stStoryKnown && text.fr.winery.stStoryKnown && text.en.winery.picnicFromFood && text.fr.winery.picnicFromFood);
  // A restaurant keeps its menu words.
  const rc = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.equal(rc.t.webQ, 'Is this where your menu is?');
});

test('checklist: finished groups open their setup screen; dogs and kids answered by What you offer; no “storefront” for a winery', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await change(t, { tasting_fee: 10, winery_info: { visit: 'walk_in', groups: 8, buses: 'welcome' } })).status, 200);
  const home = (await get(`/owner/${t}`)).text;
  assert.match(home, new RegExp(`<a href="/owner/${t}/setup#tastings" class="op-cb-g full op-cb-g-link">`));
  const shown = home.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ');
  assert.ok(!/storefront|devanture/i.test(shown), (shown.match(/.{60}storefront.{40}/i) || [''])[0]);
  assert.ok(!/storefront|devanture/i.test((await get(`/fr/owner/${t}`)).text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ')), 'nor in French: ' + ((await get(`/fr/owner/${t}`)).text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ').match(/[\s\S]{80}devanture[\s\S]{40}/i) || [''])[0]);
  // Dogs and kids: answered once What you offer is saved, with no dog or kid tile.
  const inp = { type: 'winery', offerAnswered: true };
  assert.equal(pc.doneMap(inp, today).dogs_kids, true);
  assert.equal(pc.doneMap({ type: 'winery' }, today).dogs_kids, false);
  assert.equal(pc.doneMap({ type: 'cafe', offerAnswered: true }, today).dogs_kids, false, 'cafés unchanged');
});

// ---------- Winery test 2 (2026-11-12) ----------
// Marco's box: six research lines, then his answers filling it past the 7-row cap.
const MARCO_RESEARCH = [
  { label: 'Tastings', text: 'Tastings $12 a person, waived with a bottle purchase.' }, { label: 'Groups', text: 'Groups of 8 or more, please book ahead.' },
  { label: 'Food', text: 'The Terrace restaurant is on site.' }, { label: 'Parking', text: 'Free parking, including bus parking.' },
  { label: 'Accessibility', text: 'Tasting room and terrace are step-free.' }, { label: 'Dogs', text: 'Leashed dogs welcome on the lawn.' },
];
const boxLabels = (id) => { const i = app.venueVisitInfo(id) || {}; return { rows: (i.rows || []).map((r) => r.label), dropped: (i.owner_dropped || []).map((r) => r.label), owned: i.owner_labels || [], info: i }; };

test('plan your visit cap (winery test 2): a confirmed line is hers, nothing drops silently, Undo restores, no Winter row for all year', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, MARCO_RESEARCH);
  // Year-round: no "Winter: Open all year." line taking a slot.
  assert.equal((await change(t, { tasting_fee: 15, winery_info: { waived: 'two', visit: 'walk_in', groups: 12, buses: 'book', year: 'all' } })).status, 200);
  assert.ok(!boxLabels(w.id).rows.includes('Winter'), boxLabels(w.id).rows.join());
  assert.equal(row(w.id, 'Groups').text, 'Groups of 12 or more, and tour buses and limos, please book ahead.');
  // Confirming research's Dogs line unchanged (from the setup) makes it hers; from the edit page it's still "nothing changed".
  assert.ok(!boxLabels(w.id).owned.includes('Dogs'));
  assert.equal((await change(t, { visit_rows: { dogs: 'Leashed dogs welcome on the lawn.' } }, false)).status, 400);
  assert.ok(!boxLabels(w.id).owned.includes('Dogs'));
  let r = await change(t, { visit_rows: { dogs: 'Leashed dogs welcome on the lawn.' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(boxLabels(w.id).owned.includes('Dogs'));
  assert.equal(row(w.id, 'Dogs').text, 'Leashed dogs welcome on the lawn.');
  // Again: nothing new (already hers).
  assert.notEqual((await change(t, { visit_rows: { dogs: 'Leashed dogs welcome on the lawn.' } })).status, 500);
  // Known for, then two experiences: the box is over the cap, research goes (recorded), every line of his stays.
  assert.equal((await change(t, { visit_rows: { known_for: 'Old-vine Riesling and a lake-view terrace' } })).status, 200);
  const all = new Set(MARCO_RESEARCH.map((x) => x.label).concat('Known for'));
  let b = boxLabels(w.id);
  assert.ok(b.rows.length <= 7);
  for (const l of all) assert.ok(b.rows.includes(l) || b.dropped.includes(l), `${l} lost: ${b.rows} / ${b.dropped}`);
  assert.equal((await change(t, { winery_info: { experiences: [{ label: 'Private tasting', text: '$40 a person, book ahead' }, { label: 'Vineyard tour' }] } })).status, 200);
  b = boxLabels(w.id);
  assert.equal(b.rows.length, 7);
  for (const l of ['Tastings', 'Groups', 'Dogs', 'Known for', 'Private tasting', 'Vineyard tour']) assert.ok(b.rows.includes(l), `${l} must stay: ${b.rows}`);
  for (const l of ['Food', 'Parking', 'Accessibility']) assert.ok(b.rows.includes(l) || b.dropped.includes(l), `${l} recorded: ${b.rows} / ${b.dropped}`);
  // Accessibility is never an Experience: not offered as one, and kept by "we don't offer extras".
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(!cfg.extras.some((x) => x.label === 'Accessibility'));
  // The page: his lines first, none folded under "More" while research shows above them.
  const page = app.renderVenuePage(app.getVenue(w.id), [], [], [], { lang: 'en' });
  const box = page.slice(page.indexOf('id="venueVisit"'), page.indexOf('</section>', page.indexOf('id="venueVisit"')));
  const open = box.split('visit-more')[0];
  for (const l of ['Groups', 'Private tasting', 'Vineyard tour', 'Dogs']) assert.ok(open.includes(`>${l}<`), `${l} shown open`);
  const iOwn = open.indexOf('>Groups<'), iRes = Math.max(open.indexOf('>Parking<'), open.indexOf('>Food<'));
  assert.ok(iRes < 0 || iOwn < iRes, 'her rows before research');
  // Undo the experiences: research's dropped lines come back.
  const req = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%Private tasting%' ORDER BY id DESC").get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(req, 'dayton', new Date(), 'test').ok, true);
  b = boxLabels(w.id);
  for (const l of ['Parking', 'Accessibility', 'Dogs', 'Known for']) assert.ok(b.rows.includes(l), `${l} back: ${b.rows}`);
  assert.ok(!b.rows.includes('Private tasting'));
  // "We don't offer extras" never removes Accessibility.
  assert.equal((await change(t, { winery_info: { experiences: [] } })).status, 200);
  assert.ok(boxLabels(w.id).rows.includes('Accessibility') || boxLabels(w.id).dropped.includes('Accessibility'));
});

test('plan your visit cap (winery test 2): a box full of her own lines keeps the cap and shows the rest folded, never lost', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [{ label: 'Parking', text: 'Free parking.' }]);
  assert.equal((await change(t, { tasting_fee: 10, winery_info: { visit: 'recommended', groups: 8, food: 'snacks', year: 'appointment', season: { from: '05-01', to: '10-31' },
    experiences: [{ label: 'Wine & cheese' }, { label: 'Vineyard tour' }] } })).status, 200);
  assert.equal((await change(t, { visit_rows: { known_for: 'Pinot Noir', dogs: 'Dogs welcome on the patio.' } })).status, 200);
  const b = boxLabels(w.id);
  assert.equal(b.rows.length, 7);
  const own = ['Tastings', 'Groups', 'Food', 'Winter', 'Known for', 'Dogs', 'Wine & cheese', 'Vineyard tour'];
  for (const l of own) assert.ok(b.rows.includes(l) || (b.info.owner_dropped || []).some((x) => x.label === l && x.owned), `${l} kept`);
  assert.ok(b.dropped.includes('Parking'));
  const parked = (b.info.owner_dropped || []).filter((x) => x.owned);
  assert.equal(parked.length, 1);
  const page = app.renderVenuePage(app.getVenue(w.id), [], [], [], { lang: 'en' });
  assert.ok(page.includes(`>${parked[0].label}<`), 'the parked line shows on the page');
  // Her parked line still reads back in the setup, and clearing it really clears it.
  const pk = parked[0].label;
  if (pk === 'Dogs' || pk === 'Known for') {
    const key = pk === 'Dogs' ? 'dogs' : 'known_for';
    assert.ok(cfgOf((await get(`/owner/${t}/setup`)).text).cur.visit_rows[key]);
    assert.equal((await change(t, { visit_rows: { [key]: '' } })).status, 200);
    const b2 = boxLabels(w.id); assert.ok(!b2.rows.includes(pk) && !b2.dropped.includes(pk));
  }
});

test('winery test 2: Tastings never says walk-ins in appointment season; story threshold 120; walk-ins get the booking link box; help and wording', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await change(t, { tasting_fee: 15, winery_info: { visit: 'walk_in', year: 'appointment', season: { from: '05-01', to: '10-31' } } })).status, 200);
  assert.equal(row(w.id, 'Tastings').text, '$15 a person. Walk-ins welcome May 1 – Oct 31.');
  assert.ok(!/Walk-ins welcome\.$/.test(row(w.id, 'Tastings').text));
  // Story: "Great length" only at the checklist's 120.
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /var STORY_OK = 120;/);
  assert.equal(pc.ITEMS.find((i) => i.key === 'description').en, 'A description (120+ characters)');
  assert.equal(text.en.storyCount, 'A bit more would be great (120 letters for full marks).');
  assert.match(text.fr.storyCount, /120 caractères pour une page complète/);
  // Below 100% with nothing left to answer: the missing items are named, with a way to fix them; the last screen has the
  // "Change an answer" link too.
  assert.match(js, /function gapList\(\)/);
  assert.match(js, /id="suChangeAnswerEnd" data-act="go:start"/);
  // Booking link: shown for walk-ins too, worded as optional.
  assert.match(js, /linkShown = !!wv\.visit, walkIn = wv\.visit === 'walk_in'/);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.t.bookLinkLabelWalkIn, 'Booking link (optional, e.g. for groups)');
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).t.bookLinkLabelWalkIn, 'Lien de réservation (facultatif, p. ex. pour les groupes)');
  // The link is sent for a walk-in winery and waits for our check, as before.
  const r = await change(t, { booking_url: 'https://example.com/book-a-group' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // Wording.
  assert.equal(cfg.t.ownPageLink, 'See its page: {name}');
  assert.equal(text.fr.winery.ownPageLink, 'Voir sa page : {name}');
  assert.equal(cfg.t.mapFailQ, 'Send your tasting room door photo');
  assert.match(text.fr.winery.mapFailQ, /porte de votre salle de dégustation/);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).t.mapFailQ, 'Send your front door photo');
  // Help: the winery booking link answer points to "Booking and groups", never to the emailed link.
  const ohb = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  for (const p of [`/owner/${t}/setup`, `/owner/${t}`]) {
    const topic = ohb((await get(p)).text).topics.find((x) => x.id === 'booking-link');
    assert.match(topic.a, /<strong>Booking and groups<\/strong>/);
    assert.ok(!/emailed|How do people book/.test(topic.a), topic.a);
    assert.match(topic.aFr, /<strong>Réservations et groupes<\/strong>/);
    assert.ok(!/viennent-ils\?/.test(topic.aFr), 'French spacing');
  }
  // A restaurant keeps its own booking answer.
  const rt = ohb((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).topics.find((x) => x.id === 'booking-link');
  assert.match(rt.a, /How do people book/);
});

test('winery test 2: What you offer pre-ticks tiles research supports (free parking, step-free, dogs) as suggestions only', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, MARCO_RESEARCH);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.visitTicks.slice().sort(), ['dog_friendly', 'free_parking', 'wheelchair_accessible']);
  assert.ok(!cfg.cur.badges.free_parking, 'nothing saved until the screen is saved');
  const w2 = mk('winery');
  research(w2.id, [{ label: 'Dogs', text: 'No dogs, sorry.' }, { label: 'Parking', text: 'Paid parking in the lot.' }, { label: 'Accessibility', text: 'The tasting room is not wheelchair accessible.' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(w2.id)}/setup`)).text).visitTicks, []);
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /C\.visitTicks/);
  // Restaurants get none.
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).visitTicks, undefined);
});

// ---------- Winery test 3 (Sylvie, iPad, French; drafts/fresh-eyes-winery3-2026-11-12/REPORT.md) ----------
const ohbOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);

test('winery test 3: Experiences never pre-fills or removes practical research lines; what “none” removes comes back on Undo', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [{ label: 'Tastings', text: 'Free tastings.' }, { label: 'Picnics', text: 'Picnic tables on the lawn by the orchard.' }, { label: 'Dogs', text: 'Leashed dogs welcome outside.' }, { label: 'Vineyard tour', text: 'Tours at 2 PM.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.extras.map((e) => e.label), ['Vineyard tour'], 'Picnics and Dogs are not experiences');
  for (const l of ['Picnics', 'Picnic', 'Picnic area', 'Food', 'Dogs', 'Parking']) assert.ok(!cfgOf((await get(`/owner/${t}/setup`)).text).extras.some((e) => e.label === l), l);
  // "We don't offer extras": research's practical lines stay; its tour is set aside and kept for an Undo.
  assert.equal((await change(t, { winery_info: { experiences: [] } })).status, 200);
  assert.deepEqual(visitRows(w.id).map((r) => r.label), ['Tastings', 'Picnics', 'Dogs']);
  assert.equal(row(w.id, 'Picnics').text, 'Picnic tables on the lawn by the orchard.');
  assert.deepEqual((app.venueVisitInfo(w.id).owner_was_extra || []).map((r) => r.label), ['Vineyard tour']);
  const req = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%experiences%' ORDER BY id DESC").get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(req, 'test').ok, true);
  assert.deepEqual(visitRows(w.id).map((r) => r.label).sort(), ['Dogs', 'Picnics', 'Tastings', 'Vineyard tour']);
  assert.equal(row(w.id, 'Vineyard tour').text, 'Tours at 2 PM.');
  // The quick chip clears a pre-fill's details and is kept as a draft.
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /e9\.label === \(pre9\.label \|\| ''\) && e9\.text === \(pre9\.text \|\| ''\)\) e9\.text = '';/);
  assert.match(js, /if \(xl9\) xl9\.value = e9\.label; if \(xt9\) xt9\.value = e9\.text; mark\(\); drSave\(\); redraw\(\);/);
});

test('winery test 3: an experience saved without details shows its name once (“Ask when you visit”, French too)', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await change(t, { winery_info: { experiences: [{ label: 'Vineyard tour' }] } })).status, 200);
  assert.equal(row(w.id, 'Vineyard tour').text, 'Ask when you visit');
  const info = app.venueVisitInfo(w.id);
  assert.ok(!/Vineyard tour<\/span><span>Vineyard tour/.test(app.visitInfoHtml(info, false)));
  assert.match(app.visitInfoHtml(info, true), /Renseignez-vous sur place/);
});

test('winery test 3: the finish score projects her pending story and the photos there will be; below 100% names what is missing', async () => {
  const w = mk('winery', { description: 'Small family fruit winery near Oliver making apple, cherry and apricot wines, with a picnic lawn among the orchard trees.', image_url: '/images/venues/fixture-research.jpg' });
  const t = tokenFor(w.id);
  // A story of 66 letters (it replaces the 128-letter research description once checked) and two photos, one as main.
  const story = 'Un petit verger familial. Nos vins de cerise sont notre fierté!!';
  const r = await change(t, { description: story });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(app.pendingOwnerChange(w.id), 'the story waits for our check');
  for (const [i, main] of [[1, 1], [2, 0]]) db.prepare("INSERT INTO owner_photos (venue_id, file, preview_key, credit, rights_confirmed_at, status, main_requested) VALUES (?, ?, ?, 'Sylvie', ?, 'pending', ?)").run(w.id, `fixture-${w.id}-${i}.jpg`, `pk-${w.id}-${i}`, today, main);
  const sc = app.setupScore(app.venueForOwnerToken(t));
  assert.ok(sc.soon < 100, `projected ${sc.soon}`);
  assert.ok(sc.left.some((x) => x.k === 'description'), 'the short story is named');
  assert.ok(sc.left.some((x) => x.k === 'photo_extra'), 'two photos (the research one is replaced) is not three');
  // The scoring rules on their own.
  const base = { type: 'winery', address: 'a', latitude: 1, longitude: 1, phone: 'p', hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 1, description: 'x'.repeat(128), claimed: true };
  const p1 = pc.scoreCompleteness({ ...base, pendingPhotos: 2, photoCountAfter: 2, descriptionAfter: 'short' }, { today, pending: new Set(['description']) });
  assert.ok(p1.lost.some((x) => x.key === 'description'));
  assert.ok(!p1.missing.find((x) => x.key === 'photo_extra').waiting);
  const p2 = pc.scoreCompleteness({ ...base, pendingPhotos: 2, photoCountAfter: 3, descriptionAfter: 'y'.repeat(130) }, { today, pending: new Set(['description']) });
  assert.equal(p2.lost.length, 0);
  assert.ok(p2.missing.find((x) => x.key === 'photo_extra').waiting);
  assert.ok(p2.pctWithWaiting > p1.pctWithWaiting);
  // The finish screen: "Nearly there" from the gaps, and never "Reach 100% to earn it" beside 100.
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /h\(Math\.max\(sc\.pct, sc\.soon \|\| 0\) < 100 \|\| sc\.soon < sc\.pct \? T\.badgeReach : T\.badgeSoon\)/);
  assert.match(js, /if \(sc\.soon < sc\.pct\) sc = /);
  assert.equal(text.fr.badgeSoon, 'À vous dès que nous aurons vérifié ce que vous avez envoyé');
  assert.ok(text.en.badgeSoon);
});

test('winery test 3: confirming hours in the setup writes the days shown as Closed as closed; nobody else’s hours change', async () => {
  const d = [['11:00', '17:00']];
  const gappy = JSON.stringify({ mon: d, thu: d, fri: d, sat: d, sun: d });
  for (const type of ['winery', 'cafe', 'restaurant', 'pub']) {
    const v = mk(type, { hours: gappy }); const other = mk(type, { hours: gappy });
    const t = tokenFor(v.id);
    const week = { mon: d, tue: [], wed: [], thu: d, fri: d, sat: d, sun: d };
    const r = await change(t, { hours: week, hours_checked: true });
    assert.equal(r.status, 200, `${type}: ${JSON.stringify(r.body)}`);
    const stored = JSON.parse(app.getVenue(v.id).hours);
    assert.ok('tue' in stored && 'wed' in stored, `${type}: ${JSON.stringify(stored)}`);
    assert.equal(stored.tue, null); assert.equal(stored.wed, null);
    assert.deepEqual(stored.mon, d);
    assert.equal(app.getVenue(other.id).hours, gappy, 'another listing is untouched');
    // Hours with every day already listed: confirming them is still only a check.
    const again = await change(t, { hours: week, hours_checked: true });
    assert.equal(again.status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'hours'").get(v.id).n, 1, `${type}: one hours change only`);
  }
  // The classic edit page (not the setup) keeps its rule: the same hours are not a change.
  const e = mk('winery', { hours: gappy });
  const r2 = await change(tokenFor(e.id), { hours: { mon: d, tue: [], wed: [], thu: d, fri: d, sat: d, sun: d } }, false);
  assert.equal(app.getVenue(e.id).hours, gappy, JSON.stringify(r2.body));
  // The page and Build My Trip read them as closed.
  const hoursLib = require('../hours.js');
  const v2 = mk('winery', { hours: gappy });
  await change(tokenFor(v2.id), { hours: { mon: d, tue: [], wed: [], thu: d, fri: d, sat: d, sun: d }, hours_checked: true });
  const parsed = hoursLib.parseHours(app.getVenue(v2.id).hours);
  assert.equal(parsed.days.tue.status, 'closed');
  assert.equal(parsed.days.wed.status, 'closed');
});

test('winery test 3: the French card says « Dégustation gratuite » and the closed season once', async () => {
  const w = mk('winery', { region: 'oliver', name: 'Verger Fixture Trois', slug: 'verger-fixture-trois' }); const t = tokenFor(w.id);
  assert.equal((await change(t, { tasting_fee: 0 })).status, 200);
  assert.equal((await change(t, { open_months: '04-25:10-31' })).status, 200);
  const card = (html) => { const i = html.indexOf(`data-venue-id="${w.id}"`); return html.slice(i, html.indexOf('</li>', i)); };
  const fr = card((await get('/fr/oliver/wineries')).text);
  assert.match(fr, /Dégustation gratuite/);
  assert.ok(!/Free tasting/.test(fr));
  const en = card((await get('/oliver/wineries')).text);
  assert.match(en, /Free tasting/);
  // In the off-season here (today is outside Apr 25 – Oct 31) the status line says it, and no pill repeats it.
  const md = today.slice(5);
  if (md > '10-31' || md < '04-25') {
    assert.match(en, /Closed for the season/);
    assert.ok(!/season-tag-closed/.test(en) && !/season-tag-closed/.test(fr), 'said once');
    assert.ok(!/reopens April/.test(fr));
  }
  // The pill's French where it is shown (tours cards).
  assert.equal(app.frText('Closed · reopens April 25'), 'Fermé · réouverture le 25 avr.');
  assert.equal(app.frText('Free tasting'), 'Dégustation gratuite');
  assert.equal(app.frText('Ask when you visit'), 'Renseignez-vous sur place');
});

test('winery test 3: help answers no-website / Facebook, names the right tile, never “the link we emailed you” in the portal, French spacing', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`, `/owner/${t}`, `/fr/owner/${t}`]) {
    const html = (await get(p)).text;
    const cfg = ohbOf(html);
    const nw = cfg.topics.find((x) => x.id === 'no-website-social');
    assert.ok(nw, p);
    assert.match(nw.a, /<strong>Instagram and Facebook<\/strong>/);
    assert.match(nw.aFr, /<strong>Instagram et Facebook<\/strong>/);
    assert.ok(nw.keysFr.includes('seulement une page facebook') && nw.over.includes('none'));
    for (const tp of cfg.topics) {
      assert.ok(!/emailed|we emailed/.test(tp.a), `${p} ${tp.id}: ${tp.a}`);
      assert.ok(!/reçu par courriel|que nous vous avons envoyé par courriel/.test(tp.aFr), `${p} ${tp.id}: ${tp.aFr}`);
      assert.ok(!/[^\s  ]\?(?:\s|<|$)/.test(tp.aFr.replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, '')), `${p} ${tp.id} French spacing: ${tp.aFr}`);
    }
    const links = cfg.topics.find((x) => x.id === 'links');
    assert.match(links.a, /<strong>Phone, website or description<\/strong>/);
    assert.match(links.aFr, /<strong>Téléphone, site Web ou description<\/strong>/);
    assert.equal(cfg.ui.fr.greet.includes('Bonjour !'), true);
  }
  // The French owner home: « aujourd’hui ? » with the narrow space.
  assert.match((await get(`/fr/owner/${t}`)).text, /aujourd’hui \?/);
  // Outside the portal (the login page), the emailed link is still how to get in.
  const login = ohbOf((await get('/owner/login')).text);
  assert.ok(login.topics.some((x) => /emailed/.test(x.a)));
});

test('winery test 3: an owner link opens in French for a French browser unless she chose a language', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  const getL = (p, al) => fetch(base + p, { headers: { 'Accept-Language': al } }).then((r) => r.text());
  for (const p of [`/owner/${t}`, `/owner/${t}/setup`]) {
    const frB = await getL(p, 'fr-CA,fr;q=0.9,en;q=0.8');
    assert.match(frB, /var ol=localStorage\.getItem\('okanaganLang'\);if\(ol==='fr'\|\|!ol\)location\.replace\("\/fr\/owner\//);
    const enB = await getL(p, 'en-CA,en;q=0.9,fr;q=0.5');
    assert.match(enB, /if\(ol==='fr'\)location\.replace/);
    assert.ok(!/ol==='fr'\|\|!ol/.test(enB));
    // q values decide, not the order.
    assert.match(await getL(p, 'en;q=0.4,fr-CA'), /ol==='fr'\|\|!ol/);
  }
  // Public pages are untouched.
  assert.ok(!/ol==='fr'\|\|!ol/.test(await getL('/oliver/wineries', 'fr-CA,fr;q=0.9')));
});

test('winery test 3: a winery’s owner home has no Happy hour or Add an event tile; other types keep them; French wording', async () => {
  const w = mk('winery', { happy_hour: 1 });
  const home = (await get(`/owner/${tokenFor(w.id)}`)).text;
  assert.ok(!/data-pick="happy"/.test(home) && !/data-pick="events"/.test(home));
  const r = mk('restaurant');
  const rh = (await get(`/owner/${tokenFor(r.id)}`)).text;
  assert.match(rh, /class="op-task" data-pick="events"/);
  assert.match(rh, /class="op-task" data-pick="happy"/);
  assert.match((await get(`/fr/owner/${tokenFor(r.id)}`)).text, /data-pick="happy"><span class="op-task-icon" aria-hidden="true">[^<]*<\/span><span class="op-task-text"><strong>5 à 7<\/strong>/);
  // The French wording table.
  const f = text.fr, fw = text.fr.winery;
  assert.equal(f.stDayPlural, 'nous les ajouterons d’ici un jour');
  assert.equal(fw.stStoryKnown, 'Votre spécialité est en ligne; votre histoire le sera d’ici un jour');
  assert.equal(fw.knownQ, 'Pour quoi êtes-vous reconnu\u202f?');
  assert.match(f.openQ, /Quand êtes-vous ouverts chaque année \?/);
  assert.equal(f.holidays.victoria, 'Fête de Victoria');
  assert.equal(fw.menuSocialQ, 'Où est votre carte des vins ?');
  assert.match(fw.doorPhotoLead, /Votre appareil vous demandera/);
  assert.match(fw.photosLead, /vos vignes ou vos vergers/);
  assert.match(fw.doorLead, /vos vignes ou vos vergers/);
  assert.match(f.storyCount, /120 caractères pour une page complète/);
  const cfg = cfgOf((await get(`/fr/owner/${tokenFor(w.id)}/setup`)).text);
  assert.equal(cfg.placeShow['Fruit or honey wines'], 'Vins de fruits ou de miel');
  assert.ok(/Pour qui/.test(JSON.stringify(cfg)) && !/Idéal pour"/.test(JSON.stringify(cfg.offerGroups || [])));
});

// ---------- Winery test 4 (2026-11-12): Gord, by appointment all year with old 10-5 hours ----------
const GORD_WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '17:00']]])));
const NO_DAYS = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, []]));
const noOpenDay = (id) => { const h = JSON.parse(app.getVenue(id).hours); return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].every((d) => !(h[d] && h[d].length)); };
const hoursBox = (html) => (/<section[^>]*id="venueHours"[\s\S]*?<\/section>/.exec(html) || /id="venueHours"[\s\S]{0,3000}/.exec(html) || [''])[0];

test('winery test 4: “no set hours” from the setup saves by appointment and replaces the old week; Undo puts it back', async () => {
  const w = mk('winery', { hours: GORD_WEEK }); const t = tokenFor(w.id);
  // Every day closed without saying "by appointment": refused, pointing to the one choice.
  let r = await change(t, { hours: NO_DAYS, hours_checked: true });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.errors.hours, /No set hours\? Tap “We don’t have set hours\. Visits are by appointment”/);
  assert.equal(app.getVenue(w.id).hours, GORD_WEEK);
  // A restaurant still needs an open day.
  const rest = mk('restaurant');
  r = await change(tokenFor(rest.id), { hours: NO_DAYS, hours_checked: true, winery_info: { visit: 'appointment' } });
  assert.equal(r.status, 400);
  // The setup's one tap: by appointment and no weekly hours, in one save, live.
  r = await change(t, { hours: NO_DAYS, hours_checked: true, winery_info: { visit: 'appointment' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!(r.body.review || []).length, JSON.stringify(r.body));
  assert.equal(app.wineryInfoAnswers(w.id).visit, 'appointment');
  assert.ok(noOpenDay(w.id), app.getVenue(w.id).hours);
  assert.equal((await progress(t, 'hours', 'live')).status, 200);
  // Logged with the old hours, and Undo puts them back.
  const log = db.prepare("SELECT old_value FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'hours' ORDER BY id DESC").get(w.id);
  assert.equal(log.old_value, GORD_WEEK);
  const req = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%\"hours\"%' ORDER BY id DESC").get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(req, 'test').ok, true);
  assert.deepEqual(JSON.parse(app.getVenue(w.id).hours), JSON.parse(GORD_WEEK));
  assert.notEqual(app.wineryInfoAnswers(w.id).visit, 'appointment', 'the one save is undone as one');
  // Already by appointment: the week alone is accepted (the portal or a second tap).
  assert.equal((await change(t, { winery_info: { visit: 'appointment' } })).status, 200);
  r = await change(t, { hours: NO_DAYS, hours_checked: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(noOpenDay(w.id));
  // Picking "By appointment only" on the booking screen with the old week clears it in the same save.
  const w2 = mk('winery', { hours: GORD_WEEK });
  r = await change(tokenFor(w2.id), { winery_info: { visit: 'appointment' }, hours: NO_DAYS, hours_checked: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(noOpenDay(w2.id));
  // The setup page carries the button words (English and French) and the client the one action.
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.t.noSetHours, 'We don’t have set hours. Visits are by appointment');
  assert.ok(cfg.t.noSetHoursNow && cfg.t.noSetHoursSaved && cfg.t.apptHoursGone);
  const cfgFr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(cfgFr.t.noSetHours, 'Nous n’avons pas d’heures fixes. Visites sur rendez-vous');
  assert.match(cfgFr.t.noSetHoursSaved, /« Sur rendez-vous · appelez avant »/);
  assert.ok(!cfgOf((await get(`/owner/${tokenFor(rest.id)}/setup`)).text).t.noSetHours, 'wineries only');
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /if \(k === 'noSetHours'\) return noSetHoursSave\(\);/);
  assert.match(js, /var apptClear = wi2\.visit === 'appointment' && S\.week && windowsOk\(S\.week\);/);
  assert.match(js, /big\('➜', T\.hoursNext, '', false, 'hoursNext'\) \+ noSetBtn\(\)/, 'on the day list too');
});

test('winery test 4: the portal hours form has the “no set hours” button for wineries; its save is refused nowhere', async () => {
  const w = mk('winery', { hours: GORD_WEEK }); const t = tokenFor(w.id);
  const home = (await get(`/owner/${t}`)).text;
  assert.match(home, /id="opNoSetHoursBtn">We don’t have set hours\. Visits are by appointment</);
  assert.match((await get(`/fr/owner/${t}`)).text, /id="opNoSetHoursBtn">Nous n’avons pas d’heures fixes\. Visites sur rendez-vous</);
  assert.ok(!(await get(`/owner/${tokenFor(mk('restaurant').id)}`)).text.includes('id="opNoSetHoursBtn"'), 'wineries only');
  assert.match(home, /send\(\{ hours: none, winery_info: \{ visit: 'appointment' \} \}/);
  assert.match(home, /if \(window\.opNoSetHoursSent\) delete changes\.hours;/);
  assert.match(home, /var hk = document\.getElementById\('opHoursOk'\); if \(hk\) hk\.hidden = true;/, 'no “These hours are right” after it');
  // The edit link (no login): by appointment goes live, the hours wait for our check, nothing is refused.
  const r = await change(t, { hours: NO_DAYS, winery_info: { visit: 'appointment' } }, false);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok((r.body.review || []).includes('hours'), JSON.stringify(r.body));
  assert.equal(app.wineryInfoAnswers(w.id).visit, 'appointment');
  // Appointment-only: no "These hours are right" in the form.
  const after = (await get(`/owner/${t}`)).text;
  assert.ok(!after.includes('id="opHoursOkBtn"'), 'no hours check for an appointment-only winery');
});

test('winery test 4: the venue page Hours box says “By appointment · call ahead” instead of the old week, with no “See hours”', async () => {
  const jul = new Date('2026-07-15T20:00:00Z'), nov = new Date('2026-11-18T20:00:00Z');
  // By appointment all year, the old 10-5 still stored: never shown.
  const a = mk('winery', { hours: GORD_WEEK });
  assert.equal((await change(tokenFor(a.id), { winery_info: { visit: 'appointment' } })).status, 200);
  for (const now of [jul, nov]) {
    const page = vpage(a, 'en', now);
    assert.deepEqual(statusLine(page), ['appointment', 'By appointment · call ahead']);
    assert.ok(!/See hours/.test(statusLine(page)[1] || '') && !/<p class="venue-open-status"[^>]*>[^\n]*href="#venueHours"/.test(page), 'no See hours link');
    assert.match(page, /<h2>Hours<\/h2><p class="venue-hours-season venue-hours-appt">By appointment · call ahead<\/p>/);
    assert.ok(!/10 ?AM|10:00|5 ?PM|17:00/.test(page.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')), 'no 10-5 anywhere, JSON-LD included');
    assert.ok(!/openingHoursSpecification/.test(page));
  }
  const fr = vpage(a, 'fr', jul);
  assert.match(fr, /<h2>Heures<\/h2><p class="venue-hours-season venue-hours-appt">Sur rendez-vous · appelez avant<\/p>/);
  assert.ok(!/Voir les heures/.test(fr));
  // The no-set-hours week: the same.
  const b = mk('winery', { hours: GORD_WEEK });
  assert.equal((await change(tokenFor(b.id), { hours: NO_DAYS, hours_checked: true, winery_info: { visit: 'appointment' } })).status, 200);
  const pb = vpage(b, 'en', jul);
  assert.match(pb, /venue-hours-appt">By appointment · call ahead</);
  assert.ok(!/Closed|See hours/.test(hoursBox(pb).replace(/<script[\s\S]*?<\/script>/g, '')), hoursBox(pb).slice(0, 400));
  // Seasonal: in the off-season the line comes first, then the off-season line and the walk-in hours; in season as before.
  const s = mk('winery', { hours: GORD_WEEK });
  assert.equal((await change(tokenFor(s.id), { winery_info: { year: 'appointment', season: { from: '05-01', to: '10-31' } } })).status, 200);
  const off = vpage(s, 'en', nov);
  assert.match(off, /<h2>Hours<\/h2><p class="venue-hours-season venue-hours-appt">By appointment · call ahead<\/p><p class="venue-season venue-winery-offseason"[^>]*>Nov 1 – Apr 30: by appointment, call ahead</);
  assert.match(off, /10 AM|10:00 AM|10 a\.m\./i, 'walk-in hours still shown');
  const on = vpage(s, 'en', jul);
  assert.ok(!on.includes('venue-hours-appt'));
  assert.equal(statusLine(on)[0], 'open');
  assert.match(on, /See hours/);
  // A normal winery: unchanged.
  const n = mk('winery', { hours: GORD_WEEK });
  assert.equal((await change(tokenFor(n.id), { winery_info: { visit: 'walk_in' } })).status, 200);
  const pn = vpage(n, 'en', jul);
  assert.ok(!pn.includes('venue-hours-appt')); assert.match(pn, /See hours/); assert.match(pn, /openingHoursSpecification/);
});

test('winery test 4: Build My Trip has no listed hours for an appointment-only winery, and notes it on alternatives', async () => {
  const a = mk('winery', { hours: GORD_WEEK, name: 'Hollow Oak Cellars' });
  assert.equal((await change(tokenFor(a.id), { winery_info: { visit: 'appointment' } })).status, 200);
  const s = mk('winery', { hours: GORD_WEEK });
  const md = (d) => d.slice(5);
  assert.equal((await change(tokenFor(s.id), { winery_info: { year: 'appointment', season: { from: md(app.addLocalDays(today, 10)), to: md(app.addLocalDays(today, 200)) } } })).status, 200);
  const n = mk('winery', { hours: GORD_WEEK });
  const facts = app.buildTripPlannerFacts(true);
  const f = (id) => facts.find((x) => x.id === id);
  assert.equal(f(a.id).hours, null, 'no hours to plan by');
  assert.equal(f(s.id).hours, null, 'off-season on this date');
  assert.ok(f(n.id).hours, 'a normal winery keeps its hours');
  assert.ok(app.buildTripPlannerFacts(true, app.addLocalDays(today, 30)).find((x) => x.id === s.id).hours, 'walk-in season keeps its hours');
  // A stop for it says by appointment, with no "Listed hours" reason or hours caveat (even if hours were passed in).
  // A stop built for it (a named request) with its old week still passed in: no "Listed hours" reason or hours caveat.
  const fact = { ...f(a.id), hours: GORD_WEEK, _hours: undefined };
  const stop = planner.stopFrom(fact, { reasons: [{ code: 'hours', text: 'Listed hours Saturday: 10:00–17:00', weight: 6 }, { code: 'request', text: 'Matches your request for Hollow Oak Cellars', weight: 9 }], caveats: ['No usable hours listed on Okanagan Roam — check before you go'] }, [], { labels: {} });
  assert.ok((stop.reasons || []).some((x) => /Matches your request/.test(x.text)), JSON.stringify(stop.reasons));
  {
    assert.ok(!(stop.reasons || []).some((x) => /Listed hours/.test(x.text)), JSON.stringify(stop.reasons));
    assert.ok(!(stop.caveats || []).some((x) => /listed hours|No usable hours/i.test(x)), JSON.stringify(stop.caveats));
    assert.ok((stop.caveats || []).some((x) => /By appointment only/.test(x)), JSON.stringify(stop.caveats));
    assert.equal(stop.venue.listedHours || null, null);
  }
  // Alternatives carry the appointment note; the page shows it.
  const v3 = require('../trip-planner-v3-page.js');
  const html = v3.t3OptionalAlternativesHtml({ alternatives: [{ name: 'Hollow Oak', url: '/naramata/wineries/hollow-oak', reasonCode: 'another_listing', appointment: true }, { name: 'Far Winery', url: '/oliver/wineries/far', reasonCode: 'different_region', appointment: true }, { name: 'Plain', url: '/naramata/wineries/plain', reasonCode: 'another_listing' }] }, false, (x) => String(x));
  assert.match(html, /Hollow Oak<\/a> — By appointment · call ahead</);
  assert.match(html, /Far Winery<\/a> — Another region · By appointment · call ahead</);
  assert.match(html, /Plain<\/a> — Another listing</);
  assert.match(v3.t3OptionalAlternativesHtml({ alternatives: [{ name: 'H', url: '/x', reasonCode: 'another_listing', appointment: true }] }, true, (x) => String(x)), /Sur rendez-vous · appelez avant/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  assert.match(src, /reasonCode, \.\.\.\(byAppointment \? \{ appointment: true \} : \{\}\)/);
  assert.match(src, /if \(byAppointment && \['confirm_hours', 'different_time'\]\.includes\(reasonCode\)\) reasonCode = 'another_listing';/);
});

test('winery test 4: the checklist counts hours done for an appointment-only winery and never asks “Are your hours still right?”', async () => {
  assert.equal(pc.doneMap({ type: 'winery', wineryInfo: { visit: 'appointment' } }, today).hours, true);
  assert.equal(pc.doneMap({ type: 'winery', wineryInfo: { visit: 'appointment' } }, today).hours_fresh, true);
  assert.equal(pc.doneMap({ type: 'winery', wineryInfo: { visit: 'appointment' } }, today).season, true);
  assert.equal(pc.doneMap({ type: 'winery', wineryInfo: { visit: 'walk_in' } }, today).hours, false, 'walk-ins still need hours');
  assert.equal(pc.doneMap({ type: 'restaurant', wineryInfo: { visit: 'appointment' } }, today).hours, false);
  const w = mk('winery', { hours: GORD_WEEK }); const t = tokenFor(w.id);
  db.prepare('UPDATE venues SET hours_checked_at = ? WHERE id = ?').run('2026-01-01', w.id);
  assert.match((await get(`/owner/${t}`)).text, /Are your hours still right\?/, 'a walk-in winery is asked (stale check)');
  assert.equal((await change(t, { winery_info: { visit: 'appointment' } })).status, 200);
  const home = (await get(`/owner/${t}`)).text.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(!/Are your hours still right\?|Yes, these are right/.test(home), 'not asked once by appointment');
  // 100% without confirming hours: Gord's answers with the no-set-hours week.
  const v = app.getVenue(w.id); const live = app.ownerVenueSnapshot(v, null);
  const r = pc.scoreCompleteness({ type: 'winery', address: v.address, latitude: 1, longitude: 1, phone: v.phone, website: v.website, hasHours: true, hoursCheckedAt: '2026-01-01', imageUrl: '/images/owner/x.jpg', photoCount: 3,
    placeType: 'Boutique winery', wineryInfo: { ...live.winery_info, groups: 6, buses: 'no', food: 'none' }, tastingFee: 20, bookingUrl: 'https://example.com/book', visitLabels: ['Known for'], description: 'x'.repeat(130),
    instagramUrl: 'x', facebookUrl: 'x', hasArrival: true, claimed: true, ownerFeatures: ['free_parking'], declaredNone: ['dogs'], offerAnswered: true }, { today });
  assert.deepEqual(r.missing.map((x) => x.key), []);
  assert.equal(r.pct, 100);
});

test('winery test 4: the cost answer leads with free and no card, no upsell; the appointment answer names the new button', () => {
  const cost = app.OWNER_HELP_TOPICS.find((x) => x.id === 'cost');
  assert.match(cost.a, /^<p><strong>Free\.<\/strong> You’ll never be charged, and we never ask for a card\./);
  assert.match(cost.aFr, /^<p><strong>Gratuit\.<\/strong> Vous ne paierez jamais rien, et nous ne demandons jamais de carte\./);
  for (const s of [cost.a, cost.aFr]) assert.ok(!/featured|vedette|visibility|visibilité/i.test(s), s);
  for (const k of ['charged', 'credit card']) assert.ok(cost.keys.includes(k), k);
  assert.ok(!app.OWNER_HELP_TOPICS.some((x) => /featured|paid/.test(x.id)), 'no new paid-features topic');
  const ap = app.WINERY_SETUP_HELP_TOPICS.find((x) => x.id === 'winery-appointment');
  assert.match(ap.a, /<strong>We don’t have set hours\. Visits are by appointment<\/strong>/);
  assert.match(ap.aFr, /<strong>Nous n’avons pas d’heures fixes\. Visites sur rendez-vous<\/strong>/);
});

test('winery test 4: “No dogs allowed” reads “Not inside or outside” without a patio; research’s Dogs line comes back on Undo', async () => {
  assert.equal(text.en.noDogsSubInside, 'Not inside or outside');
  assert.equal(text.fr.noDogsSubInside, 'Ni à l’intérieur ni à l’extérieur');
  assert.equal(text.en.noDogsSub, 'Not inside or on the patio');
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [{ label: 'Tastings', text: 'Tastings $10.' }, { label: 'Dogs', text: 'Dogs welcome on the patio.' }, { label: 'Parking', text: 'Free parking by the vineyard.' }]);
  // What you offer with "No dogs allowed": the not-offered answer and research's Dogs line cleared.
  let r = await change(t, { not_offered: ['dogs'] }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await change(t, { visit_rows: { dogs: '' } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!row(w.id, 'Dogs'));
  assert.deepEqual(app.venueVisitInfo(w.id).owner_was.Dogs, { text: 'Dogs welcome on the patio.' });
  const req = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%visit_rows%' ORDER BY id DESC").get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(req, 'test').ok, true);
  assert.equal(row(w.id, 'Dogs').text, 'Dogs welcome on the patio.');
  const box = app.venueVisitInfo(w.id);
  assert.ok(!(box.owner_labels || []).includes('Dogs'), 'research’s again, not hers');
  assert.ok(!(box.owner_was && box.owner_was.Dogs));
  // An owner's own line typed over research's, then cleared: research's original is still what Undo of the first brings back.
  assert.equal((await change(t, { visit_rows: { dogs: 'Leashed dogs on the lawn.' } })).status, 200);
  assert.equal(app.venueVisitInfo(w.id).owner_was.Dogs.text, 'Dogs welcome on the patio.');
});

test('winery test 4: wording: one tasting price without “From” on the page (cards keep “From $X”), “Nearly done”, Exit setup wraps', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await change(t, { tasting_fee: 20 })).status, 200);
  assert.equal(row(w.id, 'Tastings').text, '$20 a person.');
  assert.match(vpage(w, 'fr').replace(/ | /g, ' '), /20 \$ par personne\./);
  assert.ok(!/Dès 20/.test(vpage(w, 'fr')));
  assert.equal(app.cardPriceFor(w.id), 'From $20', 'cards keep the shared “From $X” price style');
  assert.equal(text.en.essNearly, 'Nearly done'); assert.equal(text.fr.essNearly, 'Presque terminé'); assert.equal(text.en.essBarNearly, 'The essentials: nearly done');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8'), /T\.essBarNearly \|\| T\.essBar : T\.essBar/);
  const js = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(js, /h\(open1\.length \? T\.essNearly \|\| T\.essReady : T\.essReady\)/);
  // The edit page's card: "Nearly done" while an essential is skipped, "The essentials are done" once all are answered.
  for (const k of app.WINERY_SETUP_PART1) assert.equal((await progress(t, k, k === 'photos' ? 'skip' : 'live')).status, 200, k);
  assert.equal((await progress(t, 'closures', 'live')).status, 200);
  assert.equal(app.setupState(w.id), 'essentials');
  assert.equal(app.setupState(w.id, { nearly: true }), 'nearly');
  assert.match((await get(`/owner/${t}`)).text, /<strong>Nearly done<\/strong><span>Finish the essentials, or add more about your place\?<\/span>/);
  assert.match((await get(`/fr/owner/${t}`)).text, /<strong>Presque terminé<\/strong>/);
  assert.equal((await progress(t, 'photos', 'live')).status, 200);
  assert.match((await get(`/owner/${t}`)).text, /<strong>The essentials are done<\/strong>/);
  const setup = (await get(`/owner/${t}/setup`)).text;
  assert.match(setup, /@media \(max-width: 330px\) \{ body\.owner-setup \.su-head \{ flex-wrap: wrap; row-gap: 0; \}/);
});

// ---------- Winery test 5 (Donna, Bluebird Bench, 2026-11-12) ----------
const CLIENT5 = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
test('winery test 5: a quick chip replaces research’s untouched line, adds to hers, never repeats what it says', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [{ label: 'Tastings', text: 'Tastings $10.' }, { label: 'Dogs', text: 'Dogs welcome on the patio.' }, { label: 'Parking', text: 'Free parking on site.' }]);
  let cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.visitResearch, ['dogs'], 'research’s Dogs line is still research’s');
  assert.equal(cfg.cur.visit_rows.dogs, 'Dogs welcome on the patio.');
  // The rule in the client: has it -> take it out; untouched research line -> replaced; already says it -> left; else added.
  assert.match(CLIENT5, /else if \(v && pre && v === pre && \(C\.visitResearch \|\| \[\]\)\.indexOf\(qk\) >= 0\) v = t;\n\s*else if \(saysIt\(v, t\)\) return;\n\s*else v = v \? v\.replace/);
  // saysIt, run as the client runs it.
  const fn = new Function(CLIENT5.match(/function has\(v, t\)\{[^\n]*\}/)[0] + '\n' + CLIENT5.match(/var QUICK_COMMON = [^\n]*/)[0] + '\n' + CLIENT5.match(/function quickWords\(t\)\{[^\n]*\}/)[0] + '\n' + CLIENT5.match(/function saysIt\(v, t\)\{[^\n]*\}/)[0] + '\nreturn saysIt;')();
  assert.equal(fn('Dogs welcome on the patio.', 'Patio only'), true);
  assert.equal(fn('Dogs welcome on the patio.', 'Inside and patio'), false);
  assert.equal(fn('Chiens bienvenus sur la terrasse.', 'Terrasse seulement'), true);
  assert.equal(fn('Leashed dogs please.', 'Water bowls at the door'), false);
  // Once she saves the line (it becomes hers), it is no longer research's.
  assert.equal((await change(t, { visit_rows: { dogs: 'Patio only' } })).status, 200);
  cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.visitResearch, []);
  assert.equal(row(w.id, 'Dogs').text, 'Patio only');
  // Restaurants get the same rule (one shared screen).
  const r = mk('restaurant'); research(r.id, [{ label: 'Dogs', text: 'Dogs on the patio.' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(r.id)}/setup`)).text).visitResearch, ['dogs']);
});

test('winery test 5: the groups line keeps limos and the buses question says one answer covers both', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  assert.equal((await change(t, { winery_info: { groups: 8, buses: 'book' } })).status, 200);
  assert.equal(row(w.id, 'Groups').text, 'Groups of 8 or more, and tour buses and limos, please book ahead.');
  assert.equal(app.venueVisitInfo(w.id).owner_fr.Groups.fr, 'Groupes de 8 personnes ou plus, autobus et limousines : réservez à l’avance.');
  assert.equal((await change(t, { winery_info: { groups: null, buses: 'book' } })).status, 200);
  assert.equal(row(w.id, 'Groups').text, 'Tour buses and limos: please book ahead.', 'the stand-alone line as before');
  assert.match(text.en.winery.busesLead, /One answer for both\. Take only one of them\? Tap “Book ahead”/);
  assert.match(text.fr.winery.busesLead, /Vous n’acceptez que l’un des deux \? Touchez « Réservez à l’avance »/);
  assert.equal(text.fr.winery.busesQ, 'Autobus et limousines ?');
  assert.match(CLIENT5, /id="suBusesLead"/);
  assert.deepEqual(text.en.winery.buses, { welcome: 'Welcome', book: 'Book ahead', no: 'Not at this time' });
});

test('winery test 5: Build My Trip says why a named winery is closed that day, never offers it back, and shows its tasting fee', async () => {
  const was = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on';
  try {
    const d11 = [['11:00', '17:00']], g = [['12:00', '16:00']];
    const w = mk('winery', { name: 'Bluebird Bench Winery', slug: 'bluebird-bench-winery-t5', region: 'lake-country', hours: JSON.stringify({ mon: d11, tue: d11, wed: d11, thu: d11, fri: d11, sat: d11, sun: d11 }) });
    const t = tokenFor(w.id);
    const y = Number(today.slice(0, 4)); const jan = `${y + 1}-01`;
    assert.equal((await change(t, { tasting_fee: 10, hours_seasons: [{ from: '11-01', to: '04-30', label: 'Winter hours', hours: { mon: [], tue: [], wed: [], thu: [], fri: g, sat: g, sun: g } }],
      closures: [{ from: `${y}-12-26`, to: `${y}-12-26`, note: 'Boxing Day' }, { from: `${y + 1}-01-01`, to: `${y + 1}-01-01`, note: 'Jour de l’An' }, { from: `${y}-12-30`, to: `${y}-12-30`, note: 'Inventory' }] })).status, 200);
    const plan = async (q) => (await postJson('/api/trip/plan', { text: q })).body;
    const wedJan = [13, 14, 15, 16, 17, 18, 19].map((n) => `${jan}-${n}`).find((x) => new Date(`${x}T12:00:00Z`).getUTCDay() === 3);
    const md = (iso) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
    let p = await plan(`Visit Bluebird Bench Winery in Lake Country on Wednesday ${md(wedJan)}`);
    assert.ok(p.warnings.includes('Bluebird Bench Winery is closed Wednesdays from Nov to Apr, so it isn’t in this plan.'), JSON.stringify(p.warnings));
    const alts = (p.requirementResults || []).flatMap((r) => r.optionalAlternatives || []);
    assert.ok(!alts.some((a) => a.id === w.id), 'never offered back as “Another listing”');
    // Planned again without it (other wineries listed), or its own request line says why.
    assert.ok(p.namedVenueReplanned || (p.requirementResults || []).some((r) => r.kind === 'venue' && r.reason === 'Bluebird Bench Winery is closed Wednesdays from Nov to Apr, so it isn’t in this plan.'));
    assert.ok(!p.warnings.some((x) => /closed for the season/.test(x)));
    // Holiday closures: holiday words, not "for the season"; a closure without a holiday name says the date.
    p = await plan('Visit Bluebird Bench Winery in Lake Country on December 26');
    assert.ok(p.warnings.includes('Bluebird Bench Winery is closed on December 26 for Boxing Day, so it isn’t in this plan.'), JSON.stringify(p.warnings));
    assert.ok(!p.warnings.some((x) => /closed for the season|closed right now/.test(x)), JSON.stringify(p.warnings));
    p = await plan('Visit Bluebird Bench Winery in Lake Country on January 1');
    assert.ok(p.warnings.includes('Bluebird Bench Winery is closed on January 1 for New Year’s Day, so it isn’t in this plan.'), JSON.stringify(p.warnings));
    p = await plan('Visit Bluebird Bench Winery in Lake Country on December 30');
    assert.ok(p.warnings.includes('Bluebird Bench Winery is closed on December 30, so it isn’t in this plan.'), JSON.stringify(p.warnings));
    // A July Wednesday: open, and the stop shows the owner's tasting fee.
    p = await plan('Visit Bluebird Bench Winery in Lake Country on Wednesday July 14');
    const stop = (p.recommendations || []).find((s) => s.venue && s.venue.id === w.id);
    assert.ok(stop, JSON.stringify(p.warnings));
    assert.deepEqual(stop.venue.cost, { cents: 1000, label: 'Tasting', labelFr: 'Dégustation', source: null });
    assert.equal((await change(t, { tasting_fee: 0 })).status, 200);
    p = await plan('Visit Bluebird Bench Winery in Lake Country on Wednesday July 14');
    const free = (p.recommendations || []).find((s) => s.venue && s.venue.id === w.id);
    assert.equal(free.venue.freeTasting, true); assert.equal(free.venue.cost, undefined);
    const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
    assert.match(v3, /if \(v\.freeTasting\) return '<p class="t3-stop-price" data-cost-cents="0">' \+ esc\(french \? 'Dégustation gratuite' : 'Free tasting'\)/);
    // French copy of the new lines.
    const frc = require('../trip-french-copy.js');
    assert.equal(frc.t3FrenchText('Bluebird Bench Winery is closed Wednesdays from Nov to Apr, so it isn’t in this plan.'), 'Bluebird Bench Winery est fermé le mercredi de novembre à avril; il ne fait donc pas partie de ce plan.');
    assert.equal(frc.t3FrenchText('Bluebird Bench Winery is closed on December 26 for Boxing Day, so it isn’t in this plan.'), 'Bluebird Bench Winery est fermé le 26 décembre (lendemain de Noël); il ne fait donc pas partie de ce plan.');
    assert.equal(frc.t3FrenchText('Bluebird Bench Winery is closed on Wednesday, January 13, so it isn’t in this plan.'), 'Bluebird Bench Winery est fermé le mercredi 13 janvier; il ne fait donc pas partie de ce plan.');
    assert.equal(frc.t3FrenchText('Bluebird Bench Winery matches but is closed on December 26. Ask again with another date to plan it.'), 'Bluebird Bench Winery correspond, mais est fermé le 26 décembre. Essayez une autre date pour le planifier.');
  } finally { if (was === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = was; }
});

test('winery test 5: planner alternatives skip a place closed all day on the trip’s date (no time of day asked)', () => {
  const closedWed = JSON.stringify({ mon: [['11:00', '17:00']], tue: [['11:00', '17:00']], wed: [], thu: [['11:00', '17:00']], fri: [['11:00', '17:00']], sat: [['11:00', '17:00']], sun: [['11:00', '17:00']] });
  assert.equal(planner.dayClosedAllDay({ hours: closedWed }, '2027-01-13', null), true);
  assert.equal(planner.dayClosedAllDay({ hours: closedWed }, '2027-01-14', null), false);
  assert.equal(planner.dayClosedAllDay({ hours: closedWed }, null, 'wed'), true);
  assert.equal(planner.dayClosedAllDay({ hours: null }, '2027-01-13', null), false, 'unknown hours are never closed');
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  // Brewery test 4 follow-up: offered only with its closed day ("Closed Wednesdays · try …"), else left out as before.
  assert.match(src, /const closedWd = !daypart && dayClosedAllDay\(venue, visitDate, weekday\)/);
  assert.match(src, /if \(closedWd && !closedAll\) continue;/);
  assert.match(src, /if \(closedAll && reasonCode !== 'different_time'\) continue;/);
});

test('winery test 5: help for changing hours later points to both places, with what goes live', async () => {
  const w = mk('winery'); const t = tokenFor(w.id);
  const ohb = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const topic = ohb((await get(`/owner/${t}/setup`)).text).topics.find((x) => x.id === 'winery-change-hours');
  assert.ok(topic);
  assert.ok(topic.keys.includes('winter hours') && topic.keys.includes('change hours later'));
  assert.ok(topic.over.includes('seasonal-hours') && topic.over.includes('setup-season'));
  assert.match(topic.a, /tap <strong>Change an answer<\/strong>, then <strong>Hours and holidays<\/strong>\..*Hours saved in the setup are on your page straight away\./);
  assert.match(topic.a, /Or tap <strong>Change my hours<\/strong> on your portal’s main page, for the full form with seasonal hours and special closures\. From the edit link we check changes first, usually within a day\./);
  assert.match(topic.aFr, /Modifier une réponse<\/strong>, puis <strong>Heures et jours fériés<\/strong>.*Avec le lien de modification, nous vérifions d’abord/);
  assert.match(topic.aFr, /endroit :/, 'French spacing');
  // What the answer promises is what happens: the setup puts hours live, the edit link sends them for a check.
  assert.ok(!app.OWNER_LINK_INSTANT_FIELDS.has('hours') && !app.OWNER_LINK_INSTANT_FIELDS.has('hours_seasons'));
  const winter = [{ from: '11-01', to: '04-30', label: 'Winter hours', hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['12:00', '16:00']]])) }];
  const r = await change(t, { hours_seasons: winter });
  assert.ok((r.body.live || []).includes('hours_seasons'), JSON.stringify(r.body));
  const r2 = await change(t, { hours_seasons: [] }, false);
  assert.ok(!(r2.body.live || []).includes('hours_seasons'), 'edit link: checked first ' + JSON.stringify(r2.body));
});

test('winery test 5: small wording (closed once, hours recap, research price and kids, known for, preview price, IG/FB status)', async () => {
  // "Mon Closed" over "Reopen · Monday closed": the note is for screen readers only.
  assert.match(CLIENT5, /h\(T\.reopenDay \|\| T\.undo\) \+ '<\/button>'/); // cocktail test 1: the note is in the button's name now
  // The recap after saving hours.
  assert.match(CLIENT5, /T\.hoursSavedNow\) \+ '<\/p>' \+ \(S\.hoursNone \? '' : hoursRecap\(\)\)/);
  assert.equal(text.en.recapRest, 'Rest of the year'); assert.equal(text.fr.recapHours, 'Vos heures');
  // Known for, the preview price, the IG/FB status.
  assert.equal(text.en.winery.knownQ, 'What are you known for?');
  assert.equal(text.fr.winery.knownQ, 'Pour quoi êtes-vous reconnu ?');
  assert.equal(text.en.winery.feeCard, 'tastings {x} a person');
  assert.equal(text.fr.winery.feeCard, 'dégustations à {x} par personne');
  assert.equal(text.en.stSocialIgLive, 'Instagram on your page now, Facebook within a day');
  assert.match(CLIENT5, /step === 'social' && S\.done\.instagram === 'live' && S\.done\.facebook === 'day' && T\.stSocialIgLive\) return T\.stSocialIgLive;/);
  // Research's Tastings "$10" pre-selects $10 (a suggestion: saved only with the screen); research's Kids line ticks Kids welcome.
  const w = mk('winery'); const t = tokenFor(w.id);
  research(w.id, [{ label: 'Tastings', text: 'Tastings $10.' }, { label: 'Food', text: 'Charcuterie boards.' }, { label: 'Dogs', text: 'Dogs welcome on the patio.' }, { label: 'Parking', text: 'Free parking on site.' }, { label: 'Kids', text: 'Kids welcome with an adult.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.researchFee, 10);
  assert.equal(cfg.researchFeeFrom, 'visit', 'not on the card: “Your website says $10”');
  assert.match(text.en.winery.feeGuessVisit, /^Your website says \{x\}, so we picked it\./);
  assert.equal(app.wineryTastingFee(w.id), null, 'not saved until the screen is');
  assert.ok(cfg.visitTicks.includes('kid_friendly') && cfg.visitTicks.includes('free_parking') && cfg.visitTicks.includes('dog_friendly'), JSON.stringify(cfg.visitTicks));
  // Donna's answers: Tastings, Food, Groups, What you offer (Kids welcome, Free parking kept on), then Dogs, Known for and an
  // experience. The box is full: her own lines (Wine & cheese too) come first and stay open (#847); research's Kids line,
  // backed by her tile, is kept (recorded, not dropped) and folds under "More".
  assert.equal((await change(t, { tasting_fee: 10, winery_info: { food: 'snacks', groups: 8, buses: 'book' } })).status, 200);
  assert.equal((await change(t, { badges: { kid_friendly: true, free_parking: true, dog_friendly: true } })).status, 200);
  assert.equal((await change(t, { visit_rows: { dogs: 'Patio only', known_for: 'Our Viognier and the patio view' } })).status, 200);
  assert.equal((await change(t, { winery_info: { food: 'snacks', groups: 8, buses: 'book', experiences: [{ label: 'Wine & cheese', text: 'Boards to share on the patio.' }] } })).status, 200);
  const box = app.venueVisitInfo(w.id);
  const shown = box.rows.map((r) => r.label), kept = (box.owner_dropped || []).filter((r) => r.kept).map((r) => r.label);
  assert.equal(box.rows.length, 7);
  for (const l of ['Tastings', 'Food', 'Groups', 'Dogs', 'Known for', 'Wine & cheese']) assert.ok(shown.includes(l), `${l} hers, in the box: ${shown}`);
  assert.ok(!(box.owner_dropped || []).some((r) => r.owned), 'none of her lines set aside');
  assert.ok(kept.includes('Kids'), `Kids kept, folded: ${shown} / ${JSON.stringify(box.owner_dropped)}`);
  for (const l of ['Kids', 'Parking']) assert.ok(shown.includes(l) || kept.includes(l), `${l} never dropped`);
  // The page: Wine & cheese open, Kids folded under "More" (still there).
  const page = vpage(w, 'en');
  const vbox = page.slice(page.indexOf('id="venueVisit"'), page.indexOf('</section>', page.indexOf('id="venueVisit"')));
  const [open, more] = vbox.split('visit-more');
  assert.ok(open.includes('>Wine &amp; cheese<'), 'her experience shown open');
  assert.ok(more && more.includes('Kids welcome with an adult.'), 'Kids folded under More: ' + vbox.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  assert.ok(!open.includes('Kids welcome with an adult.'));
  // Without her tile, research's line is still research's (dropped first when the box is full).
  const w2 = mk('winery');
  research(w2.id, [{ label: 'Kids', text: 'Kids welcome.' }]);
  assert.deepEqual([...app.visitBadgeConfirmedLabels(w2.id, app.venueVisitInfo(w2.id).rows)], []);
});
