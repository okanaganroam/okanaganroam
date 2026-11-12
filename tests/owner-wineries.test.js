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
  assert.equal(row(w.id, 'Tastings').text, 'From $15 a person, free with a bottle purchase. Booking recommended.');
  assert.equal(row(w.id, 'Groups').text, 'Groups of 8 or more, please book ahead. Tour buses and limos: please book ahead.');
  assert.equal(row(w.id, 'Restaurant').text, 'The Vine Bistro on site, Thu–Mon from noon.');
  assert.equal(row(w.id, 'Winter').text, 'Nov 1 – Mar 31: by appointment. Please call ahead.');
  assert.equal(row(w.id, 'Wine & cheese').text, '$45 a person, daily at 1 PM');
  assert.equal(row(w.id, 'Known for').text, 'Pinot Noir and Chardonnay from estate vines');
  const page = app.renderVenuePage(app.getVenue(w.id), [], [], [], { lang: 'en' });
  assert.match(page, /From \$15 a person, free with a bottle purchase/);
  const pageFr = app.renderVenuePage(app.getVenue(w.id), [], [], [], { lang: 'fr' });
  assert.match(pageFr, /Dès 15 \$ par personne, offerte à l’achat d’une bouteille/);
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
  assert.equal(row(w.id, 'Tastings').text, 'From $20 a person. Walk-ins welcome.');
  // Research can't bring its lines back over the owner's.
  research(w.id, [{ label: 'Tastings', text: 'Research again' }, { label: 'Groups', text: 'Research groups' }, { label: 'Winter', text: 'Research winter' }]);
  assert.equal(row(w.id, 'Tastings').text, 'From $20 a person. Walk-ins welcome.');
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
  assert.match((await get(`/fr/owner/${t}`)).text, /Vous nous avez dit que vous n’avez pas : de réservation en ligne/);
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
