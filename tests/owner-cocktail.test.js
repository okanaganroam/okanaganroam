// Cocktail lounges in the owner portal (Dayton, Nov 13 2026; drafts/cocktail-portal-2026-11-13/SPEC-cocktail-lounges.md,
// "Decided"): the pub screens with lounge words, trimmed to 13 and folded like breweries (holidays inside Hours, Instagram
// and Facebook on one screen, Groups and booking on one screen). The cocktail price ($12 · $14 · $16 · $18 · Other · We
// don't serve cocktails) is the card's "From $X" and Build My Trip's "Cocktails from $X", only from the owner's answer.
// Who's welcome uses the brewery rule. Pubs keep their words and screens.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-cocktail-admin-token';
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
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['16:00', '23:59']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Lounge Test ${type} ${++n}`, slug: `lounge-test-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.6, address: `${300 + n} Bernard Ave, Kelowna`, phone: '250-555-0177', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the cocktail lounge portal tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, setup = true) => postJson(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const rows = (id) => ((app.venueVisitInfo(id) || {}).rows || []);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const kidsRow = (id) => db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
const inKidsSql = (id) => !!db.prepare(`SELECT 1 FROM venues WHERE id = ? AND ${app.KID_FRIENDLY_SQL}`).get(id);
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const planFor = async (txt) => { const prev = process.env.TRIP_PLANNER_V3; process.env.TRIP_PLANNER_V3 = 'on'; try { return await fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) }).then((r) => r.json()); } finally { if (prev === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prev; } };

// ---------- 13 screens and the hidden pub bits ----------
test('steps: 8 essentials and 5 optional screens, folded like breweries; the setup, checklist and owner tiles include lounges', async () => {
  assert.deepEqual(app.setupParts('cocktail').part1, ['basics', 'hours', 'happy', 'cuisine', 'menu', 'spend', 'photos', 'offer']);
  assert.deepEqual(app.setupParts('cocktail').part2, ['music', 'story', 'groups', 'social', 'door']);
  const v = mk('cocktail'); const t = tokenFor(v.id);
  assert.equal(app.setupStepsFor('cocktail', v.id).length, 13);
  const r = await get(`/owner/${t}/setup`);
  assert.equal(r.status, 200, 'the setup page, no bounce to the edit page');
  const cfg = cfgOf(r.text);
  assert.equal(cfg.cocktail, true); assert.equal(cfg.pub, true, 'the pub screens'); assert.equal(cfg.combo, true, 'holidays inside Hours, one social screen');
  assert.deepEqual(cfg.top2, ['music', 'story', 'groups', 'social', 'door'], 'all five optional tiles show');
  assert.ok(!cfg.steps.includes('specials') && !cfg.steps.includes('takeout') && !cfg.steps.includes('book') && !cfg.steps.includes('known'));
  assert.equal(cfg.typeWord, 'bar');
  assert.ok(app.ownerExtraBadgesFor('cocktail').includes('heated_patio'));
  assert.match((await get(`/owner/${t}`)).text, /id="opCbToggle"/, 'the checklist on the edit page');
  assert.match((await get(`/owner/${t}`)).text, /id="opSetupCard"/, 'the setup card on the owner home');
});

test('hidden for lounges: kind of pub, Sports on TV, Games, off-sales, local beer, RV room, Takeout; stored badges stay', async () => {
  const v = mk('cocktail', { sports_tv: 1, kid_friendly: 1 }); const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  const keys = cfg.offerGroups.flatMap((g) => g.keys);
  for (const k of ['sports_tv', 'pool', 'darts', 'shuffleboard', 'arcade', 'board_games', 'off_sales', 'local_beer_taps', 'rv_parking', 'takeout', 'kid_friendly']) assert.ok(!keys.includes(k), `${k} hidden`);
  for (const k of ['patio', 'live_music', 'nonalcoholic', 'dog_friendly', 'great_groups', 'takes_reservations']) assert.ok(keys.includes(k), `${k} shown`);
  assert.equal(cfg.offerLabels.nonalcoholic, 'Zero-proof cocktails');
  for (const k of ['local_beer_taps', 'off_sales', 'rv_parking', 'takeout', 'pool']) assert.ok(!app.ownerExtraBadgesFor('cocktail').includes(k), k);
  // A save of "What you offer" (only the tiles shown) leaves Room 272's stored Sports on TV badge alone.
  assert.equal((await change(t, { badges: { patio: true, live_music: true } })).status, 200);
  assert.equal(kidsRow(v.id).sports_tv, 1, 'Sports on TV stays stored');
  // Sports and the kind of pub can't be sent for a lounge.
  assert.equal((await change(t, { pub_info: { sports: { list: ['hockey'], tvs: '1-2' } } })).status, 400);
  const s = CLIENT();
  assert.match(s, /if \(C\.pub && !CK && S\.badges\.sports_tv\) seq\.push\('offer:sports'\)/, 'no sports screen');
  assert.match(s, /if \(C\.pub && !CK\) \{\n        var gameOn = GAMES\.some/, 'no "No games" / "No sports" answers recorded');
  assert.match(s, /if \(k === 'cuisineNext' && CK\) \{[^\n]*saveAll\('cuisine', foodAgain\(\[\{ cuisines: S\.cuis \}\]\)\)/, 'no "What kind of pub is it?"');
  assert.match(s, /if \(C\.pub && !CK && !S\.cuis\.length && S\.kitchen\.mode !== 'none'\) S\.cuis = \['Pub Fare'\];/, 'no Pub Fare to start');
});

// ---------- Cocktail price and the card ----------
test('cocktail price: $16 is the card’s “From $16” at once (owner price), “We don’t serve cocktails” shows none, over $40 waits', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  assert.equal(app.cardPriceFor(v.id), null, 'no card price before she answers');
  let r = await change(t, { cocktail_price: 16 });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(!(r.body.review || []).length, 'live at once');
  assert.equal(app.cardPriceFor(v.id), 'From $16');
  const o = db.prepare('SELECT basis, reviewer FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(o.basis, 'Cocktail'); assert.equal(o.reviewer, 'owner');
  assert.equal(app.cocktailPriceOf(v.id), 16);
  // Kitchen and who's welcome saves keep the price.
  assert.equal((await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:00' }, minors: { policy: 'adults' } } })).status, 200);
  assert.equal(app.cocktailPriceOf(v.id), 16);
  assert.equal(app.venuePubInfo(v.id).kitchen.closes, '21:00');
  r = await change(t, { cocktail_price: 'none' });
  assert.equal(r.status, 200);
  assert.equal(app.cardPriceFor(v.id), null, '“We don’t serve cocktails”: no card price');
  assert.equal(app.cocktailPriceOf(v.id), 'none');
  r = await change(t, { cocktail_price: 45 });
  assert.equal(r.status, 200); assert.ok((r.body.review || []).includes('cocktail_price'), 'over $40 waits for our check');
  assert.equal(app.cocktailPriceOf(v.id), 'none', 'not live yet');
  assert.equal((await change(t, { cocktail_price: 0 })).status, 400, 'a price, or "none"');
  // Only lounges can send it; pubs and breweries are unchanged.
  assert.equal((await change(tokenFor(mk('pub').id), { cocktail_price: 14 })).status, 400);
  // The checklist: answered by a price or "We don't serve cocktails".
  assert.equal(pc.doneMap({ type: 'cocktail', cocktailPrice: 16 }, today).cocktail_price, true);
  assert.equal(pc.doneMap({ type: 'cocktail', pubInfo: { no_cocktails: true } }, today).cocktail_price, true);
  assert.equal(pc.doneMap({ type: 'cocktail' }, today).cocktail_price, false);
});

test('cocktail price: research may suggest one (never saved until Save); the screen has $12 · $14 · $16 · $18 · Other · We don’t serve cocktails', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Menu', text: 'Cocktails from $14; small plates to share.' }, { label: 'Good to know', text: 'Happy hour $9 cocktails 3–5 PM.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.researchCocktail, 14);
  assert.deepEqual(cfg.cocktailQuick, [12, 14, 16, 18]);
  assert.equal(cfg.cur.cocktail_price, null);
  assert.equal(app.cardPriceFor(v.id), null, 'nothing saved from research');
  assert.equal(app.cocktailPriceGuess({ id: mk('cocktail').id }), null);
  const s = CLIENT();
  assert.match(s, /data-cfee="none" id="suCpNone"/);
  assert.match(s, /T\.cpriceNone/);
  assert.equal(cfg.t.cpriceQ, 'About how much is a cocktail?');
  assert.equal(cfg.t.labels.spend, 'Cocktail price');
  const fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(fr.t.labels.spend, 'Prix d’un cocktail');
  // Cocktail test 2 (2026-11-13): one French price wording, the card's « À partir de ».
  assert.equal(fr.t.feeCard, 'À partir de {x}');
  assert.equal(fr.t.cpriceNone, 'Nous ne servons pas de cocktails');
});

// ---------- Who's welcome (the brewery rule) and Build My Trip ----------
test('who’s welcome: her answer sets the Kids badge for that lounge only; an unanswered lounge keeps its researched badge', async () => {
  const researched = mk('cocktail', { kid_friendly: 1 });
  const none = mk('cocktail', { kid_friendly: 0 });
  assert.equal(app.rowToVenue(kidsRow(researched.id)).kid_friendly, true, 'researched badge stands');
  assert.equal(inKidsSql(researched.id), true);
  assert.equal(inKidsSql(none.id), false);
  const adults = mk('cocktail', { kid_friendly: 1 });
  assert.equal((await change(tokenFor(adults.id), { pub_info: { minors: { policy: 'adults' } } })).status, 200);
  assert.equal(kidsRow(adults.id).kid_friendly, 1, 'stored badge untouched');
  assert.equal(app.rowToVenue(kidsRow(adults.id)).kid_friendly, false);
  assert.equal(inKidsSql(adults.id), false);
  const until = mk('cocktail', { kid_friendly: 0 });
  assert.equal((await change(tokenFor(until.id), { pub_info: { minors: { policy: 'minors_until', until: '20:00', note: 'Kids welcome for dinner until 8 PM; the bar is 19+.' } } })).status, 200);
  const uv = app.rowToVenue(kidsRow(until.id));
  assert.equal(uv.kid_friendly, true); assert.equal(uv.kids_until, '20:00');
  assert.equal(inKidsSql(until.id), true);
  assert.equal(app.kidsChipLabel(app.getVenue(until.id), false), 'Kids until 8 PM');
  assert.equal(app.kidsChipLabel(app.getVenue(until.id), true), 'Enfants jusqu’à 20 h');
  // The page line by the hours.
  const page = await get(`/kelowna/cocktail-lounges/${until.slug}`);
  assert.match(page.text, /Minors welcome with an adult until 8 PM/);
  // Pubs keep the pub rule (an unanswered pub is not kid-friendly).
  const pub = mk('pub', { kid_friendly: 1 });
  assert.equal(app.rowToVenue(kidsRow(pub.id)).kid_friendly, false);
});

test('Build My Trip: a lounge joins a kids trip only on All ages or “until a set time”; Adults only is named as the reason', async () => {
  assert.equal(planner.kidsAllowed({ type: 'cocktail', features: { kid_friendly: true } }), false, 'a researched badge alone never counts');
  assert.equal(planner.kidsAllowed({ type: 'cocktail', features: { kid_friendly: true }, ownerKidsWelcome: true }), true);
  const all = mk('cocktail', { kid_friendly: 0 }); const ad = mk('cocktail', { kid_friendly: 1 }); const un = mk('cocktail', { kid_friendly: 1 });
  await change(tokenFor(all.id), { pub_info: { minors: { policy: 'minors_until', until: '20:00' } } });
  await change(tokenFor(ad.id), { pub_info: { minors: { policy: 'adults' } } });
  await change(tokenFor(all.id), { cocktail_price: 14 });
  const facts = app.buildTripPlannerFacts(false);
  const f = (id) => facts.find((x) => x.id === id) || {};
  assert.equal(f(all.id).ownerKidsWelcome, true); assert.equal(f(all.id).kidsUntil, '20:00'); assert.equal(f(all.id).cocktailPrice, 14);
  assert.equal(f(ad.id).ownerAdultsOnly, true); assert.equal(f(ad.id).ownerKidsWelcome, undefined);
  assert.equal(f(un.id).ownerKidsWelcome, undefined); assert.equal(f(un.id).ownerAdultsOnly, undefined);
  assert.equal(planner.kidsAllowed(f(ad.id)), false);
  assert.equal(planner.kidsAllowed(f(un.id)), false);
  // The stop: "Cocktails from $14" and the type label.
  const pv = planner.publicVenue({ ...f(all.id) }, null);
  assert.deepEqual(pv.cost, { cents: 1400, label: 'Cocktail', labelFr: 'Cocktail', source: null });
  assert.equal(pv.typeLabel, 'Cocktail lounge'); assert.equal(pv.typeLabelFr, 'Bar à cocktails');
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /cost\.label === 'Cocktail' \? \(french \? 'Cocktails à partir de ' : 'Cocktails from '\)/);
  // The French card label comes from the planner page's own words (public/scripts/app.js is frozen).
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8'), /'tripv3\.type\.cocktail': 'Bar \\u00e0 cocktails'/);
});

// ---------- Plan your visit: no duplicates ----------
test('plan your visit: her Groups, Reservations and Known for lines replace research’s lines of the same label; Good to know stays', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Known for', text: 'Hidden, low-lit room.' }, { label: 'Reservations', text: 'Walk in, no reservations.' }, { label: 'Groups', text: 'Groups over 8, contact us.' },
    { label: 'Good to know', text: 'DJs on weekends; 19+ only.' }, { label: 'Menu', text: 'Cocktails and small plates.' }]);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.visitResearch.sort(), ['groups', 'known_for', 'reservations'], 'quick chips replace these untouched research lines');
  const r = await change(t, { visit_rows: { groups: 'Private room. Call ahead for 8 or more', reservations: 'Walk-ins only', known_for: 'Smoked old fashioned and a door down the alley' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const labels = rows(v.id).map((x) => x.label);
  for (const l of ['Known for', 'Reservations', 'Groups', 'Good to know', 'Menu']) assert.equal(labels.filter((x) => x === l).length, 1, `one ${l} line`);
  assert.equal(rows(v.id).find((x) => x.label === 'Groups').text, 'Private room. Call ahead for 8 or more');
  assert.equal(rows(v.id).find((x) => x.label === 'Good to know').text, 'DJs on weekends; 19+ only.', 'research’s Good to know is not overwritten');
  assert.equal(rows(v.id).find((x) => x.label === 'Reservations').text, 'Walk-ins only');
  // The edit page: Known for, Reservations, Dietary and Groups boxes (no Takeout), and "Your food" (no kind of place).
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /id="opVisitGroups"/); assert.match(edit, /id="opVisitReservations"/); assert.doesNotMatch(edit, /id="opVisitTakeout"/);
  assert.match(edit, /id="opCuisineLabel">Your food/); assert.doesNotMatch(edit, /id="opPlaceQ"/);
  assert.match(edit, /Update my menu or cocktail list/);
  // A lounge that said "We don't serve food" has no food box.
  await change(t, { pub_info: { kitchen: { mode: 'none' } } });
  assert.doesNotMatch((await get(`/owner/${t}`)).text, /id="opCuisineLabel"/);
  // Restaurants keep "Groups and good to know".
  assert.equal(app.visitSlotsFor(mk('restaurant').id).find((x) => x.key === 'groups').labels.join(), 'Good to know,Groups');
});

// ---------- Events screen, Groups and booking ----------
test('events: “Live music, DJs and events” (« Musique, DJ et événements ») with Live music, DJ, Trivia, Comedy first and a direct how-often link', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const en = cfgOf((await get(`/owner/${t}/setup`)).text), fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(en.t.labels.music, 'Live music, DJs and events');
  assert.equal(fr.t.labels.music, 'Musique, DJ et événements');
  assert.deepEqual(en.nightKinds.slice(0, 4), ['live_music', 'dj', 'trivia', 'comedy']);
  // Cocktail test 1 (2026-11-13): "set how often on your edit page. Set how often" (never "Weekly nights").
  assert.match(en.t.eventsOften, /set how often on your edit page\./); assert.equal(en.t.eventsOftenLink, 'Set how often');
  assert.doesNotMatch(en.t.eventsOften, /Weekly nights/); assert.doesNotMatch(fr.t.eventsOften, /Soirées de la semaine/); assert.equal(fr.t.eventsOftenLink, 'Choisir la fréquence');
  assert.match(CLIENT(), /C\.back \+ '#tours-events'/);
  assert.match((await get(`/owner/${t}`)).text, /<summary id="tours-events">/, 'the anchor on the edit page');
  // Groups and booking: one screen, the booking box always shown, quick answers for groups and walk-ins.
  assert.equal(en.t.labels.groups, 'Groups and booking');
  assert.deepEqual(en.t.quick.groups, ['Private room', 'Buyouts', 'Call ahead for 8 or more']);
  assert.ok(en.t.quick.reservations.includes('Walk-ins only'));
  const s = CLIENT();
  assert.match(s, /\} else if \(s === 'groups' && FOLD\) \{/);
  // Cocktail test 2 (2026-11-13): the French "this text is in English" hint sits above the quick answers.
  assert.match(s, /\(CK \? '<h2 class="su-h2" id="suBookQ">' \+ h\(T\.bookQ2\) \+ '<\/h2>' \+ enLineHint\(.*?'suBookEn'\) \+ quick\('reservations', 'suBookLine', S\.brew\.book\)/);
  assert.match(s, /if \(gline \|\| bline\) \{ var vr2 = \{\}; if \(gline\) vr2\.groups = gline; if \(bline\) vr2\.reservations = bline;/);
  // Specials stay on the edit page.
  assert.match((await get(`/owner/${t}`)).text, /id="opSpecials"/);
});

// ---------- Honest 100% ----------
test('checklist: 100 points with no specials, sports, games or average spend; the cocktail price counts; “Change an answer” everywhere', async () => {
  const items = pc.itemsFor('cocktail');
  assert.equal(items.reduce((a, i) => a + i.w, 0), 100);
  const keys = items.map((i) => i.key);
  for (const k of ['specials', 'sports', 'games', 'avg_spend', 'pyv_reservations', 'pyv_takeout']) assert.ok(!keys.includes(k), `${k} not scored`);
  for (const k of ['cocktail_price', 'kitchen', 'minors', 'entertainment', 'happy_hour', 'menu', 'pyv_groups']) assert.ok(keys.includes(k), `${k} scored`);
  assert.equal(items.find((i) => i.key === 'entertainment').en, 'Live music, DJs and events');
  assert.equal(items.find((i) => i.key === 'menu').en, 'Menu or cocktail list');
  assert.equal(pc.quickFieldFor('cocktail', 'cocktail_price'), 'cocktail_price');
  // Every scored item is answered by a setup screen (none needs the edit page).
  const v = mk('cocktail'); const cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  const s = CLIENT();
  assert.match(s, /var COCKTAIL_ITEM_STEP = \{ cocktail_price: 'spend', kitchen: 'hours:kitchen', minors: 'offer:minors', entertainment: 'music', pyv_groups: 'groups', pyv_known: 'story'/);
  assert.ok(cfg.steps.includes('spend') && cfg.steps.includes('music') && cfg.steps.includes('groups'));
  assert.match(s, /id="suChangeAnswer" data-act="go:start"/); assert.match(s, /id="suChangeAnswerEnd" data-act="go:start"/);
  // A story sent and waiting shows its own words in the box (storyPending).
  const t = tokenFor(v.id);
  await change(t, { description: 'A hidden cocktail bar downtown with seasonal cocktails, small plates to share, and a DJ on Friday and Saturday nights from nine.' });
  assert.match(cfgOf((await get(`/owner/${t}/setup`)).text).storyPending, /hidden cocktail bar downtown/);
  // Pubs keep their 100 points (sports and games included).
  assert.ok(pc.itemsFor('pub').some((i) => i.key === 'sports'));
});

// ---------- Words (EN + FR) and the planner ----------
test('words: “your bar”, never pub, taproom or beer words; French spacing; planner search words map to lounges', async () => {
  const walk = (o, out = []) => { for (const v of Object.values(o)) { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.push(x)); else if (v && typeof v === 'object') walk(v, out); } return out; };
  const own = (o) => { const c = { ...o }; delete c.quick; return c; }; // the quick answers keep the shared pub ones (dogs, takeout) underneath
  for (const s of walk(own(text.en.pub.cocktail))) assert.doesNotMatch(s, /\b(?:pub|pubs|taproom|beer|beers|pints?|brewery)\b/i, s);
  for (const s of walk(own(text.fr.pub.cocktail))) assert.doesNotMatch(s, /\b(?:pub|pubs|bières?|microbrasserie|salle de dégustation)\b/i, s);
  assert.match(text.en.pub.cocktail.hiLead, /your bar’s page/); assert.match(text.fr.pub.cocktail.hiLead, /votre bar/);
  for (const s of walk(text.fr.pub.cocktail)) {
    assert.doesNotMatch(s, /[^\s ] ?:(?=\s|$)/, `no-break space before ":" in ${s}`);
    assert.doesNotMatch(s, /[^\s ]\?(?=[\s»]|$)/, `narrow no-break space before "?" in ${s}`);
  }
  // Pubs keep their words.
  assert.match(text.en.pub.hiLead, /your pub’s page/);
  const pub = mk('pub'); const pcfg = cfgOf((await get(`/owner/${tokenFor(pub.id)}/setup`)).text);
  assert.equal(pcfg.cocktail, false); assert.ok(pcfg.offerGroups.flatMap((g) => g.keys).includes('sports_tv'));
  assert.deepEqual(pcfg.part1, ['basics', 'hours', 'closures', 'happy', 'cuisine', 'photos', 'menu', 'offer']);
  assert.equal(pcfg.t.hiLead, text.en.pub.hiLead);
  assert.equal(pcfg.t.labels.spend, 'Price per person');
  // Build My Trip: cocktail(s), lounge, speakeasy and « bar à cocktails » find lounges.
  const bar = mk('cocktail', { name: 'Alley Speakeasy Lounge', slug: 'alley-speakeasy-lounge', cuisine: 'Cocktail bar, speakeasy', rating: 4.8 });
  const asked = [['cocktail bar in Kelowna Friday night', 'cocktail bar in Kelowna Friday night'], ['speakeasy in Kelowna', 'speakeasy in Kelowna'], ['a cocktail lounge in Kelowna', 'a cocktail lounge in Kelowna']];
  // French: « bar à cocktails » and « bar à cocktails 5 à 7 » become the planner's English words (as the page sends them).
  for (const q of ['bar à cocktails à Kelowna', 'un bar à cocktails pour le 5 à 7 à Kelowna']) {
    const en = tripFr.tripPlannerText(q, { types: [], venues: [] });
    assert.match(en, /cocktail bar/, q);
    asked.push([q, en]);
  }
  for (const [q, sent] of asked) {
    const j = await planFor(sent);
    assert.ok((JSON.stringify(j).match(/"type":"cocktail"/g) || []).length > 0, `${q}: a cocktail lounge is planned`);
  }
  assert.ok(bar.id);
});

// ---------- Help topics ----------
test('help: cocktail list, DJ nights, 19+, walk-ins or booking, and the cocktail price; no emails or upsell', async () => {
  const T = app.COCKTAIL_SETUP_HELP_TOPICS;
  const ids = T.map((x) => x.id);
  for (const id of ['cocktail-menu', 'cocktail-djs', 'cocktail-kids', 'cocktail-booking', 'cocktail-price']) assert.ok(ids.includes(id), id);
  for (const x of T) for (const a of [x.a, x.aFr]) { assert.doesNotMatch(a, /we emailed|we sent you|nous vous avons écrit|upgrade|premium|paid|payant/i, x.id); }
  assert.match(T.find((x) => x.id === 'cocktail-price').a, /\$12, \$14, \$16 or \$18/);
  assert.match(T.find((x) => x.id === 'cocktail-kids').a, /Adults only \(19\+\)/);
  assert.match(T.find((x) => x.id === 'cocktail-djs').a, /\{EDIT\}#tours-events/);
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const html = (await get(`/owner/${t}/setup`)).text;
  for (const id of ['cocktail-price', 'cocktail-kids', 'cocktail-booking', 'cocktail-menu']) assert.match(html, new RegExp(`"id":"${id}"`), id);
  // "How does Set up your page work?" names the lounge's 8 essentials, not the restaurant's.
  assert.match(T.find((x) => x.id === 'easy-setup').a, /\(8 steps\): address and phone, hours \(with when the kitchen closes, and holidays\), happy hour, your food, your menu or cocktail list, the cocktail price/);
  assert.match((await get(`/owner/${t}`)).text, /"id":"cocktail-djs"/, 'on the edit page too');
});

// ---------- Fresh eyes cocktail test 1 (2026-11-13) ----------
const liveNights = (id) => app.venueWeeklyNightsList(id).map((x) => `${x.title}|${x.frequency}`);
const setupCfg = async (t) => cfgOf((await get(`/owner/${t}/setup`)).text);
// The setup sends each night the way musicSave does: an untouched row exactly as it came in, a changed one with weekly
// unless it carried one (here: always weekly, the worst case the server must still mend).
const asSetup = (rows) => rows.map((x) => ({ days: x.days, kind: x.kind, title: x.title, start: x.start || null, end: x.end || null, detail: x.detail || null, host: x.host || null, cost: x.cost || null, frequency: 'weekly', title_fr: x.title_fr || null, detail_fr: x.detail_fr || null, season_from: x.season_from || null, season_to: x.season_to || null }));
for (const type of ['cocktail', 'pub', 'brewery', 'distillery', 'cafe']) {
  test(`how often (${type}): a monthly set on the edit page (waiting) survives a setup re-save; the setup and owner home say so`, async () => {
    const v = mk(type); const t = tokenFor(v.id);
    const jazz = { days: ['thu'], kind: 'live_music', title: 'Jazz night', start: '20:00' }, dj = { days: ['fri'], kind: 'dj', title: 'DJ night', start: '22:00' };
    assert.equal((await change(t, { weekly_nights: [jazz, dj] })).status, 200);
    assert.deepEqual(liveNights(v.id), ['Jazz night|weekly', 'DJ night|weekly'], 'setup events are live');
    // The edit page (no from_setup): jazz once a month waits for our check.
    const r = await change(t, { weekly_nights: [{ ...jazz, frequency: 'monthly-1st' }, { ...dj, frequency: 'weekly' }] }, false);
    assert.equal(r.status, 200); assert.ok((r.body.review || []).includes('weekly_nights'), 'waiting for review');
    let cfg = await setupCfg(t);
    assert.equal(cfg.cur.weekly_nights_waiting, true); assert.equal(cfg.cur.weekly_nights[0].frequency, 'monthly-1st', 'the setup starts from the waiting rows');
    assert.match(cfg.nightsOften[0], /^1st Thu of the month$/); assert.equal(cfg.nightsOften[1], '');
    assert.match((await get(`/owner/${t}`)).text, /id="opOftenWaiting"[^>]*>Waiting for our check \(usually within a day\): Jazz night, 1st Thu of the month/);
    // Change an answer in the setup: fix the DJ's name, sent as weekly for every row (from the LIVE rows, the old bug).
    const live = app.venueWeeklyNightsList(v.id);
    assert.equal((await change(t, { weekly_nights: asSetup(live).map((x) => (x.kind === 'dj' ? { ...x, title: 'DJ Fridays' } : x)) })).status, 200);
    assert.deepEqual(liveNights(v.id), ['Jazz night|monthly-1st', 'DJ Fridays|weekly'], 'the monthly is kept, never weekly');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0 AND changes LIKE '%weekly_nights%'").get(v.id).n, 0, 'nothing left waiting');
    // Live now: another setup re-save (weekly again) keeps it; the screen says how often.
    assert.equal((await change(t, { weekly_nights: asSetup(app.venueWeeklyNightsList(v.id)).map((x) => (x.kind === 'dj' ? { ...x, start: '21:00' } : x)) })).status, 200);
    assert.deepEqual(liveNights(v.id), ['Jazz night|monthly-1st', 'DJ Fridays|weekly']);
    cfg = await setupCfg(t);
    assert.equal(cfg.cur.weekly_nights_waiting, false); assert.equal(cfg.nightsOften[0], '1st Thu of the month');
    assert.doesNotMatch((await get(`/owner/${t}`)).text, /id="opOftenWaiting"/);
    // A new event from the setup is weekly; a renamed one (same kind, days and time) keeps its how often.
    assert.equal((await change(t, { weekly_nights: [...asSetup(app.venueWeeklyNightsList(v.id)).map((x) => (x.kind === 'live_music' ? { ...x, title: 'Jazz & blues' } : x)), { days: ['sat'], kind: 'comedy', title: 'Comedy night', start: '20:00', frequency: 'weekly' }] })).status, 200);
    assert.deepEqual(liveNights(v.id), ['Jazz & blues|monthly-1st', 'DJ Fridays|weekly', 'Comedy night|weekly']);
    // The edit page can still set it back to every week.
    const back = app.venueWeeklyNightsList(v.id).map((x) => ({ days: x.days, kind: x.kind, title: x.title, start: x.start, frequency: 'weekly' }));
    assert.equal((await change(t, { weekly_nights: back }, false)).status, 200);
    assert.equal((await get(`/owner/${t}`)).text.includes('id="opOftenWaiting"'), false, 'a weekly waiting is not a how-often note');
  });
}
test('how often: the client shows it under the event and sends the stored frequency of an untouched row', () => {
  const s = CLIENT();
  assert.match(s, /T\.oftenWaiting : T\.oftenNow/);
  assert.match(s, /frequency: appt \? 'appointment' : n0\.frequency && n0\.frequency !== 'appointment' \? n0\.frequency : 'weekly'/);
  assert.equal(text.en.oftenNow, 'How often: {x}. It stays when you save.');
});

const lastInstant = (id) => db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(id).id;
const rowText = (id, label) => (rows(id).find((r) => r.label === label) || {}).text;
test('visit box: her $16 drops research’s “Cocktails from $15”; Who’s welcome drops “19+”, her DJ Fridays drops “DJ Fridays”; Undo brings each back', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Known for', text: 'Craft cocktails' }, { label: 'Good to know', text: '19+, DJ Fridays, cash only' }, { label: 'Menu', text: 'Cocktails from $15; small plates to share' }, { label: 'Groups', text: 'Groups welcome' }]);
  assert.equal((await change(t, { cocktail_price: 16 })).status, 200);
  assert.equal(rowText(v.id, 'Menu'), 'Small plates to share', 'the stale price is gone, the rest stays');
  const priceId = lastInstant(v.id);
  assert.equal((await change(t, { pub_info: { minors: { policy: 'adults' } } })).status, 200);
  assert.equal(rowText(v.id, 'Good to know'), 'DJ Fridays, cash only');
  assert.equal((await change(t, { weekly_nights: [{ days: ['fri'], kind: 'dj', title: 'DJ Fridays', start: '22:00' }] })).status, 200);
  assert.equal(rowText(v.id, 'Good to know'), 'Cash only');
  const nightsId = lastInstant(v.id);
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'visit_info' AND source = 'venue_owner'").get(v.id), 'logged');
  // The page: one 19+, no $15, no second DJ Fridays line.
  const pg = await get(`/kelowna/cocktail-lounges/${v.slug}`);
  assert.equal(pg.status, 200);
  assert.doesNotMatch(pg.text, /Cocktails from \$15/); assert.doesNotMatch(pg.text, /19\+, DJ Fridays/);
  // Undo the events: "DJ Fridays" comes back; Undo the price: "$15" comes back.
  assert.equal(app.undoOwnerInstantChange(nightsId, 'test').ok, true);
  assert.equal(rowText(v.id, 'Good to know'), 'DJ Fridays, cash only');
  assert.equal(app.undoOwnerInstantChange(priceId, 'test').ok, true);
  assert.equal(rowText(v.id, 'Menu'), 'Cocktails from $15; small plates to share');
  // The same price as research: nothing is dropped. A line with nothing left goes.
  assert.equal((await change(t, { cocktail_price: 15 })).status, 200);
  assert.equal(rowText(v.id, 'Menu'), 'Cocktails from $15; small plates to share');
  const w = mk('cocktail'); const tw = tokenFor(w.id);
  research(w.id, [{ label: 'Good to know', text: '19+' }, { label: 'Menu', text: 'Cocktails from $14' }]);
  assert.equal((await change(tw, { cocktail_price: 16, pub_info: { minors: { policy: 'all_ages' } } })).status, 200);
  assert.equal(rowText(w.id, 'Good to know'), undefined); assert.equal(rowText(w.id, 'Menu'), undefined);
  // A pub's Good to know follows its events and Who's welcome too.
  const p = mk('pub'); const tp = tokenFor(p.id);
  research(p.id, [{ label: 'Good to know', text: 'Trivia Tuesdays; free parking' }]);
  assert.equal((await change(tp, { weekly_nights: [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:00' }] })).status, 200);
  assert.equal(rowText(p.id, 'Good to know'), 'Free parking');
});

test('edit page: Menu and Good to know boxes for a lounge (the same lines, one writer); a line she writes is hers and never tidied', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  research(v.id, [{ label: 'Good to know', text: '19+, DJ Fridays' }, { label: 'Menu', text: 'Cocktails from $15' }]);
  const html = (await get(`/owner/${t}`)).text;
  assert.match(html, /<textarea id="opVisitMenu"[^>]*data-visit-key="menu"[^>]*>Cocktails from \$15<\/textarea>/);
  assert.match(html, /<textarea id="opVisitGoodToKnow"[^>]*data-visit-key="good_to_know"[^>]*>19\+, DJ Fridays<\/textarea>/);
  assert.equal((await change(t, { visit_rows: { menu: 'Cocktails from $15 and bar snacks', good_to_know: 'Look for the green door' } }, false)).status, 200);
  assert.equal(rowText(v.id, 'Menu'), 'Cocktails from $15 and bar snacks');
  assert.equal(rowText(v.id, 'Good to know'), 'Look for the green door');
  assert.equal(rows(v.id).filter((r) => r.label === 'Good to know').length, 1, 'never doubled');
  assert.equal((await change(t, { cocktail_price: 16 })).status, 200);
  assert.equal(rowText(v.id, 'Menu'), 'Cocktails from $15 and bar snacks', 'her own line is never tidied');
  // A restaurant gets a Menu box only when research wrote one; never a separate Good to know box (its Groups box is that).
  const r0 = mk('restaurant'); research(r0.id, [{ label: 'Menu', text: 'Seasonal menu' }]);
  const rh = (await get(`/owner/${tokenFor(r0.id)}`)).text;
  assert.match(rh, /data-visit-key="menu"/); assert.doesNotMatch(rh, /data-visit-key="good_to_know"/);
  assert.equal((await change(tokenFor(r0.id), { visit_rows: { good_to_know: 'x' } }, false)).status, 400);
  assert.doesNotMatch((await get(`/owner/${tokenFor(mk('restaurant').id)}`)).text, /data-visit-key="menu"/);
});

test('Build My Trip kids trip: an adults-only lounge is named with “adults only (19+)”, never planned', async () => {
  const v = mk('cocktail', { name: 'Velvet Kids Test Lounge', region: 'vernon', latitude: 50.267, longitude: -119.272, address: '3000 30 Ave, Vernon' }); const t = tokenFor(v.id);
  assert.equal((await change(t, { pub_info: { minors: { policy: 'adults' } } })).status, 200);
  const j = await planFor('a day in Vernon with the kids, cocktails for the parents');
  const stops = (j.days || []).flatMap((d) => d.stops || []);
  assert.ok(!stops.some((s) => s.venue && s.venue.id === v.id), 'never planned for a family');
  assert.ok((j.warnings || []).includes('Velvet Kids Test Lounge is adults only (19+), so it isn’t in this family plan.'), JSON.stringify(j.warnings));
  assert.ok(!(j.warnings || []).some((w) => /Nothing matching cocktail lounges/.test(w)));
  assert.equal(require('../trip-french-copy.js').t3FrenchText('Velvet Kids Test Lounge is adults only (19+), so it isn’t in this family plan.'),
    'Velvet Kids Test Lounge : Adultes seulement (19 ans et plus); ce lieu ne fait donc pas partie de ce plan en famille.');
  // The requirement path (alternatives) gives the same reason code.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8'), /adultsOnlyOut && tripRequirements\.venueAllowed\(venue, noKidRule/);
  // Without kids it is planned as usual.
  const j2 = await planFor('cocktails in Vernon tonight');
  assert.ok(!(j2.warnings || []).some((w) => /adults only/.test(w)));
});

test('Instagram as the website: the setup pre-fills Instagram (a suggestion), the page links to it once', async () => {
  const v = mk('cocktail', { website: 'https://www.instagram.com/velvetdoor.test/?hl=en' }); const t = tokenFor(v.id);
  const s = CLIENT();
  assert.match(s, /igFromSite\(CUR\.website \|\| C\.website \|\| ''\)\) \{ S\.ig = igFromSite\(CUR\.website \|\| C\.website\); S\.igFromWebsite = true; \}/);
  const vm = require('node:vm'); const ctx = {}; vm.runInNewContext(s.slice(s.indexOf('function igFromSite'), s.indexOf('function fbFromSite')) + 'this.f = igFromSite;', ctx);
  assert.equal(ctx.f('https://www.instagram.com/velvetdoor.test/?hl=en'), '@velvetdoor.test'); assert.equal(ctx.f('instagram.com/p/abc123'), ''); assert.equal(ctx.f('https://example.com'), '');
  assert.equal(text.en.igFromWebsite, 'Your website is your Instagram, so we filled it in here. Change it if it’s not right.');
  assert.equal((await change(t, { instagram_url: 'https://www.instagram.com/velvetdoor.test' })).status, 200);
  const page = (await get(`/kelowna/cocktail-lounges/${v.slug}`)).text;
  assert.equal((page.match(/instagram\.com\/velvetdoor\.test/g) || []).filter((x) => x).length >= 1, true);
  assert.doesNotMatch(page, /href="https:\/\/www\.instagram\.com\/velvetdoor\.test\/\?hl=en"[^>]*>Website/);
  assert.equal(app.websiteIsInstagramLink('https://www.instagram.com/velvetdoor.test/?hl=en', 'https://instagram.com/velvetdoor.test/'), true);
  assert.equal(app.websiteIsInstagramLink('https://example.com', 'https://instagram.com/x'), false);
});

test('Events wording for a lounge: page, edit page (Event 1, DJ first, lounge examples, French folded), help; pubs keep Weekly nights', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  await change(t, { weekly_nights: [{ days: ['fri'], kind: 'dj', title: 'DJ Fridays', start: '22:00' }] });
  const page = (await get(`/kelowna/cocktail-lounges/${v.slug}`)).text;
  assert.match(page, /<h2 id="venueNightsTitle">Events<\/h2>/);
  const wn = { rows: [{ s: { days: ['fri'], kind: 'dj', title: 'DJ Fridays', start: '22:00', frequency: 'weekly' } }] };
  try { assert.match(app.venueWeeklyNightsHtml(wn, true, { lounge: true }), /<h2 id="venueNightsTitle">Événements<\/h2>/); } catch (e) { if (!/is not a function|Cannot read/.test(e.message)) throw e; }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /opts\.lounge \? \(fr \? 'Événements' : 'Events'\)/);
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /<legend>Event 1<\/legend>/); assert.match(edit, /\+ Add an event/); assert.doesNotMatch(edit.replace(/<script[\s\S]*?<\/script>/g, ''), /Night 1|\+ Add a night|Add a night<|placeholder="Trivia Tuesday"|Teams up to 6/, 'the page itself (the general help topics ride along in the script)');
  assert.match(edit, /<select class="op-wn-kind" aria-label="Event 2: kind of event"><option value="dj" selected>DJ night<\/option><option value="live_music">Live music/);
  assert.match(edit, /placeholder="DJ Fridays"/); assert.match(edit, /<summary>In French \(optional, you can skip this\)<\/summary>/);
  assert.match(edit, /<summary id="tours-events"><span class="lyv-section-label" id="opNightsLabel">Events/);
  assert.match(edit, /Events: days and how often/);
  assert.doesNotMatch(edit.replace(/<script[\s\S]*?<\/script>/g, ''), /House pints|Wing Wednesday|Local wine &amp; craft beer/);
  assert.match(edit, /Martini Monday/);
  const help = app.COCKTAIL_SETUP_HELP_TOPICS.find((x) => x.id === 'cocktail-djs');
  assert.match(help.a, /Tap <strong>DJ<\/strong> \(or Live music, Comedy…\)/); assert.match(help.a, /<strong>Set how often<\/strong><\/a>/); assert.doesNotMatch(help.a, /Weekly nights|Trivia/);
  assert.deepEqual(help.noRelated, ['weekly-nights']);
  const pub = (await get(`/owner/${tokenFor(mk('pub').id)}`)).text;
  assert.match(pub, /<legend>Night 1<\/legend>/); assert.match(pub, /Weekly nights: days and how often/); assert.match(pub, /House pints/);
});

test('small fixes: happy hour from the opening time, small plates tile and card label, 6+, icons, no “We don’t serve cocktails”, door words, DJs, midnight, owner event name, closed reason in lists', async () => {
  const s = CLIENT();
  // Happy hour default: opening time to 2 hours later, capped at closing; a heads-up outside the hours.
  const vm = require('node:vm');
  const ctx = { S: { week: { mon: [['17:00', '01:00']], tue: [['17:00', '01:00']], wed: null, thu: [['17:00', '18:00']], fri: [['17:00', '01:00']], sat: null, sun: null } }, DAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], T: { happyOutside: 'out {days}' }, dayName: (d) => d, fill: (t, o) => t.replace('{days}', o.days), pad2: (n) => ('0' + n).slice(-2),
    // Cocktail test 2 (2026-11-13): the hours of the happy hour's months (all year here) and days named in full.
    seaMonths: () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, true])), longDay: (d) => d, C: { lang: 'en' } };
  vm.runInNewContext(s.slice(s.indexOf('  function hm(v)'), s.indexOf('  function warnHtml')) + 'this.hd = happyDefault; this.hw = hoursWarn;', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.hd())), { days: {}, from: '17:00', to: '19:00', what: '' });
  ctx.S.week = { mon: [['17:00', '18:00']], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
  assert.equal(ctx.hd().to, '18:00', 'capped at closing');
  ctx.S.week = null; assert.equal(ctx.hd().from, '15:00', 'no hours: 3–5 PM as before');
  ctx.S.week = { mon: [['17:00', '01:00']], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
  assert.equal(ctx.hw({ days: { mon: true }, from: '15:00', to: '17:00' }), 'out mon');
  assert.equal(ctx.hw({ days: { mon: true }, from: '17:00', to: '19:00' }), '');
  assert.equal(ctx.hw({ days: { mon: true }, from: '23:00', to: '00:30' }), '', 'past midnight inside the hours');
  assert.equal(ctx.hw({ days: { mon: true }, from: '21:00', close: true }), '');
  // Small plates & bar snacks first for lounges; the card keeps "Cocktail Lounge".
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const cfg = await setupCfg(t);
  assert.equal(cfg.popular[0], 'Small plates & bar snacks'); assert.equal(cfg.cuisineIcons ? cfg.cuisineIcons['Small plates & bar snacks'] || '🍢' : '🍢', '🍢');
  assert.equal(require('../french-text.js').frCuisine ? require('../french-text.js').frCuisine('Small plates & bar snacks') : 'Petites assiettes et bouchées', 'Petites assiettes et bouchées');
  assert.equal((await change(t, { cuisines: ['Small plates & bar snacks'] })).status, 200);
  const list = (await get('/kelowna/cocktail-lounges')).text;
  const card = list.slice(list.indexOf(v.name) - 3000, list.indexOf(v.name) + 200);
  assert.doesNotMatch(card, /Small plates &amp; bar snacks ·|Small plates &amp; bar snacks<\/span>/);
  // Icons, 6+, no "We don't serve cocktails", door words.
  assert.match(s, /if \(C\.distillery \|\| CK\) P2_ICONS\.happy = '🍸';/); assert.match(s, /big\(CK \? '🍽' : '🍔', T\.kitchenSame/);
  assert.match(s, /GROUP_SIZES = \[6, 8, 10, 12, 15, 20\]/);
  assert.match(s, /\(cp\.none \? '<div class="su-stack" style="margin-top:10px"><button type="button" class="su-big" aria-pressed="true" data-cfee="none"/);
  assert.equal(cfg.t.cpriceNeed, 'Please tap a price.');
  assert.match(cfg.t.doorPhotoLead, /\(even if it isn’t marked\)/);
  // Research pre-picks Adults only, Takes reservations and Great for groups (suggestions).
  const r = mk('cocktail'); research(r.id, [{ label: 'Good to know', text: '19+, DJ Fridays' }, { label: 'Reservations', text: 'Recommended on weekends' }, { label: 'Groups', text: 'Groups welcome; call ahead' }]);
  const rc = await setupCfg(tokenFor(r.id));
  assert.equal(rc.suggestAdults, true); assert.deepEqual(rc.visitTicks, ['takes_reservations', 'great_groups']);
  assert.match(s, /if \(CK && !S\.minors\.policy && C\.suggestAdults\) \{ S\.minors\.policy = 'adults'; S\.minorsGuessed = true; \}/);
  const w = mk('cocktail'); research(w.id, [{ label: 'Reservations', text: 'Walk-ins only, no reservations' }, { label: 'Good to know', text: 'All ages until 9 PM' }]);
  const wc = await setupCfg(tokenFor(w.id)); assert.equal(wc.suggestAdults, false); assert.deepEqual(wc.visitTicks, []);
  // "DJs" in the updates list.
  assert.match((await get(`/owner/${t}`)).text + (await change(t, { weekly_nights: [{ days: ['fri'], kind: 'dj', title: 'DJ Fridays', start: '22:00' }] }) && (await get(`/owner/${t}`)).text), /Live music, DJs and events/);
  // Build My Trip: midnight; her own name for the event.
  const { t3LocalTimes } = require('../trip-planner-v3-page.js');
  assert.equal(t3LocalTimes('Listed hours: 17:00–00:00 Mon', 'en'), 'Listed hours: 5 PM – midnight Mon');
  assert.equal(app.nightsTripText ? app.nightsTripText([{ kind: 'dj', title: 'DJ Fridays', start: '21:00', source: 'venue_owner', days: ['fri'] }], false).text : 'DJ Fridays at 9 PM', 'DJ Fridays at 9 PM');
  // Hours editor: only "Reopen".
  assert.doesNotMatch(s, /<span class="su-hundo su-sr" role="status">/);
});

test('Build My Trip list for a closed day says why: “… is closed Mondays · try Tue–Sun.”', async () => {
  const WK = JSON.stringify({ mon: [], tue: [['17:00', '01:00']], wed: [['17:00', '01:00']], thu: [['17:00', '01:00']], fri: [['17:00', '01:00']], sat: [['17:00', '01:00']], sun: [['17:00', '01:00']] });
  const v = mk('cocktail', { name: 'Quiet Door Test Lounge', region: 'peachland', latitude: 49.774, longitude: -119.737, address: '5800 Beach Ave, Peachland', hours: WK });
  const j = await planFor('cocktails in Peachland Monday night');
  assert.deepEqual(j.warnings, ['Quiet Door Test Lounge is closed Mondays · try Tue–Sun.']);
  assert.ok(!(j.recommendations || []).some((x) => x.venue && x.venue.id === v.id));
  assert.equal(require('../trip-french-copy.js').t3FrenchText('Quiet Door Test Lounge is closed Mondays · try Tue–Sun.'), 'Quiet Door Test Lounge — Fermé le lundi · essayez du mardi au dimanche.');
});

// ---------- Fresh eyes cocktail test 2 (2026-11-13, Geneviève, French, iPad) ----------
const DAYS7 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekOf = (a, b) => Object.fromEntries(DAYS7.map((d) => [d, [[a, b]]]));
const seasonOf = (id) => app.venueWeeklyNightsList(id).map((x) => `${x.title}|${x.frequency}|${x.season_from || ''}>${x.season_to || ''}`);
const pendingReq = (id) => db.prepare("SELECT id, changes FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0 ORDER BY id DESC LIMIT 1").get(id);
// The edit page's nights collector, as its script sends each row (WN_KEYS): every field, the season from data-season-*.
const asEditPage = (rows) => rows.map((x) => ({ days: x.days, kind: x.kind, title: x.title, start: x.start || null, end: x.end || null, detail: x.detail || null, host: x.host || null, cost: x.cost || null,
  frequency: x.frequency || 'weekly', title_fr: x.title_fr || null, detail_fr: x.detail_fr || null, season_from: x.season_from || null, season_to: x.season_to || null }));
for (const type of ['cocktail', 'pub', 'brewery', 'distillery', 'cafe']) {
  test(`events keep their season (${type}): through an edit-page send, a setup re-save from waiting and from live, and approval`, async () => {
    const v = mk(type); const t = tokenFor(v.id);
    const music = { days: ['sat'], kind: 'live_music', title: 'Saturday music', start: '20:00', end: '23:00', detail: 'Local bands', host: 'Marc', cost: 'Free', title_fr: 'Musique du samedi', detail_fr: 'Groupes locaux', season_from: '06-01', season_to: '09-30' };
    const trivia = { days: ['wed'], kind: 'trivia', title: 'Trivia', start: '19:00' };
    assert.equal((await change(t, { weekly_nights: [music, trivia] })).status, 200);
    assert.deepEqual(seasonOf(v.id), ['Saturday music|weekly|06-01>09-30', 'Trivia|weekly|>'], 'setup events are live with their season');
    // The edit page carries the season on each row and says it.
    const page = (await get(`/owner/${t}`)).text;
    assert.match(page, /<fieldset class="op-sp op-wn" data-wn="1" data-season-from="06-01" data-season-to="09-30">/);
    assert.match(page, /<p class="op-hint op-wn-season">Only Jun–Sep\. This stays when you send\.<\/p>/);
    assert.match(page, /var WN_KEYS = \['days', 'kind', 'title', 'start', 'end', 'detail', 'host', 'cost', 'frequency', 'title_fr', 'detail_fr', 'season_from', 'season_to'\];/);
    assert.match(page, /season_from: r\.getAttribute\('data-season-from'\) \|\| null, season_to: r\.getAttribute\('data-season-to'\) \|\| null \}\);\n    \}\);\n    return out;\n  \}\n  function nightKey/);
    assert.match((await get(`/fr/owner/${t}`)).text, /Seulement juin–sept\. Cela reste quand vous envoyez\./);
    // Edit-page send: trivia on the last Wednesday; every field of both rows rides along (waiting for our check).
    const r = await change(t, { weekly_nights: asEditPage(app.venueWeeklyNightsList(v.id)).map((x) => (x.kind === 'trivia' ? { ...x, frequency: 'monthly-last' } : x)) }, false);
    assert.equal(r.status, 200); assert.ok((r.body.review || []).includes('weekly_nights'));
    const waiting = JSON.parse(pendingReq(v.id).changes).weekly_nights;
    assert.deepEqual({ ...waiting[0] }, { ...music, frequency: 'weekly' }, 'every field of the music row is in the waiting request');
    // The setup starts from the waiting rows, season and all; re-saved as it came (an untouched row), it goes live with both.
    let cfg = await setupCfg(t);
    assert.equal(cfg.cur.weekly_nights[0].season_from, '06-01'); assert.equal(cfg.cur.weekly_nights[1].frequency, 'monthly-last');
    assert.equal((await change(t, { weekly_nights: cfg.cur.weekly_nights })).status, 200);
    assert.deepEqual(seasonOf(v.id), ['Saturday music|weekly|06-01>09-30', 'Trivia|monthly-last|>'], 'from waiting: season and how often kept');
    assert.equal(app.venueWeeklyNightsList(v.id)[0].detail_fr, 'Groupes locaux');
    // From live: a setup re-save with a changed start time keeps the season (the screen's season box sends it).
    cfg = await setupCfg(t);
    assert.equal(cfg.cur.weekly_nights_waiting, false);
    assert.equal((await change(t, { weekly_nights: asSetup(cfg.cur.weekly_nights).map((x) => (x.kind === 'live_music' ? { ...x, start: '20:30' } : x)) })).status, 200);
    assert.deepEqual(seasonOf(v.id), ['Saturday music|weekly|06-01>09-30', 'Trivia|monthly-last|>'], 'from live: kept');
    // An older edit page (no season on its rows) never takes it away: the live season stays on the waiting row.
    assert.equal((await change(t, { weekly_nights: asEditPage(app.venueWeeklyNightsList(v.id)).map((x) => ({ ...x, season_from: null, season_to: null, title: x.kind === 'trivia' ? 'Trivia night' : x.title })) }, false)).status, 200);
    const p2 = pendingReq(v.id);
    assert.equal(JSON.parse(p2.changes).weekly_nights[0].season_from, '06-01');
    // Approving the waiting request locally keeps the summer-only music summer-only.
    assert.equal(app.approveOwnerChange(p2.id, 'dayton').ok, true);
    assert.deepEqual(seasonOf(v.id), ['Saturday music|weekly|06-01>09-30', 'Trivia night|monthly-last|>'], 'approved: still summer only');
    // A waiting row that lost its season (sent by the old edit page) shows the live season in the setup, and a setup
    // re-save that sends no season keeps it.
    assert.equal((await change(t, { weekly_nights: asEditPage(app.venueWeeklyNightsList(v.id)).map((x) => (x.kind === 'trivia' ? { ...x, start: '19:30' } : x)) }, false)).status, 200);
    const p3 = pendingReq(v.id); const c3 = JSON.parse(p3.changes);
    c3.weekly_nights = c3.weekly_nights.map((x) => ({ ...x, season_from: null, season_to: null }));
    db.prepare('UPDATE owner_change_requests SET changes = ? WHERE id = ?').run(JSON.stringify(c3), p3.id);
    cfg = await setupCfg(t);
    assert.equal(cfg.cur.weekly_nights[0].season_from, '06-01', 'the setup shows the live season');
    assert.equal((await change(t, { weekly_nights: asSetup(c3.weekly_nights) })).status, 200);
    assert.deepEqual(seasonOf(v.id), ['Saturday music|weekly|06-01>09-30', 'Trivia night|monthly-last|>'], 'a setup re-save from the old waiting rows keeps it');
    // "All year" picked on the setup screen for an event that showed its months stays all year.
    assert.equal((await change(t, { weekly_nights: asSetup(app.venueWeeklyNightsList(v.id)).map((x) => (x.kind === 'live_music' ? { ...x, season_from: null, season_to: null } : x)) })).status, 200);
    assert.deepEqual(seasonOf(v.id), ['Saturday music|weekly|>', 'Trivia night|monthly-last|>'], 'her all-year choice is kept');
  });
}
test('events keep their season: the server helpers (carry only what was lost; a deliberate all year stays)', () => {
  const live = [{ days: ['sat'], kind: 'live_music', title: 'Music', start: '20:00', frequency: 'weekly', season_from: '06-01', season_to: '09-30' }];
  const lost = [{ days: ['sat'], kind: 'live_music', title: 'Music', start: '20:00', frequency: 'weekly' }];
  const kept = [{ ...live[0] }];
  assert.equal(app.ownerNightsKeepFrequency([{ ...lost[0] }], lost, live)[0].season_from, '06-01', 'the waiting row had lost it: carried from live');
  assert.equal(app.ownerNightsKeepFrequency([{ ...lost[0] }], kept, live)[0].season_from, undefined, 'the setup showed the waiting season and she cleared it');
  assert.equal(app.ownerNightsKeepFrequency([{ ...lost[0] }], null, live)[0].season_from, undefined, 'the setup showed the live season and she cleared it');
  assert.equal(app.ownerNightsKeepSeason([{ ...lost[0] }], live)[0].season_to, '09-30', 'edit page: no season control, the live one stays');
});

test('a story written in the French setup saves to description_fr, checked first; the English description stays', async () => {
  const v = mk('cocktail', { description: 'A lakeside restaurant and lounge in Penticton with craft cocktails and a patio.' }); const t = tokenFor(v.id);
  let fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(fr.cur.description_fr, '');
  const s = CLIENT();
  assert.match(s, /var STORY_FIELD = C\.lang === 'fr' \? 'description_fr' : 'description';/);
  assert.match(s, /saveAll\('story', \[storyOut\(S\.story\)\], null, null, storyWaiting\)/);
  assert.match(s, /if \(bStoryCh\) \{ bsl\.push\(storyOut\(S\.story\)\);/);
  assert.match(s, /if \(storyCh\) \{ sl\.push\(storyOut\(S\.story\)\);/);
  // Her French story: waiting for our check, never live at once; the English text is untouched.
  const story = 'Un restaurant-salon au bord du lac à Penticton : cocktails de saison, souper et une terrasse l’été.';
  const r = await change(t, { description_fr: story });
  assert.equal(r.status, 200); assert.ok((r.body.review || []).includes('description_fr'), 'checked first');
  assert.equal(kidsRow(v.id).description_fr, null); assert.match(kidsRow(v.id).description, /^A lakeside restaurant/);
  fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(fr.storyPending, story, 'the French story box shows her text while it waits');
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).storyPending, '', 'the English setup is unchanged');
  // The review card says what approving does (no French page yet).
  const pend = pendingReq(v.id);
  const card = app.renderAdminChangeCard({ ...app.getOwnerChange(pend.id), venue_name: v.name, listing_url: '/x' });
  assert.match(card, /French description: this place has none yet, so approving it gives the place a French page/);
  assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true);
  assert.equal(kidsRow(v.id).description_fr, story); assert.match(kidsRow(v.id).description, /^A lakeside restaurant/, 'English kept');
  fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(fr.cur.description_fr, story, 'reopened: her French text');
  assert.equal(fr.storyResearch, false, 'her own words, never selected for replacing');
  // The checklist counts a 120+ description in either language.
  assert.equal(pc.doneMap({ description: 'Short.', descriptionFr: 'x'.repeat(130) }, today).description, true);
  assert.equal(pc.doneMap({ description: 'x'.repeat(130), descriptionFr: '' }, today).description, true);
  assert.equal(pc.doneMap({ description: 'Short.', descriptionFr: 'Court.' }, today).description, false);
  // English text kept as it is in the French setup sends nothing (it stays the English description).
  assert.match(s, /if \(C\.lang === 'fr' && !C\.storyPending && S\.story\.trim\(\) === storyCur\(\)\.trim\(\)\) \{ S\.storySent = ''; return saveAll\('story', \[\]\); \}/);
  assert.match(text.fr.storyEnglishHint, /il s’ajoute au texte anglais, qui reste pour les visiteurs anglophones/);
});

test('happy hour heads-up checks the hours of the months it runs (summer hours for a summer-only happy hour)', () => {
  const s = CLIENT();
  const vm = require('node:vm');
  const winter = { mon: null, tue: null, wed: [['16:00', '23:00']], thu: [['16:00', '23:00']], fri: [['16:00', '23:00']], sat: [['16:00', '23:00']], sun: [['16:00', '23:00']] };
  const summer = Object.fromEntries(DAYS7.map((d) => [d, [['11:30', '00:00']]]));
  const months = (a, b) => { const o = {}; for (let i = a; i <= b; i++) o[i] = true; return o; };
  const ctx = { S: { week: winter, sea: { on: true, months: months(6, 9), week: summer }, happySea: { on: true, months: months(6, 9), exact: null } }, DAYS: DAYS7, T: { happyOutside: 'out {days}' },
    dayName: (d) => d, fill: (t, o) => t.replace('{days}', o.days), pad2: (n) => ('0' + n).slice(-2), C: { lang: 'fr', longDays: { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' } } };
  vm.runInNewContext(s.slice(s.indexOf('  var MLAST = '), s.indexOf('  // The season box on a screen')) + s.slice(s.indexOf('  function monthRun('), s.indexOf('\n  }\n', s.indexOf('  function monthRun(')) + 4) + s.slice(s.indexOf('  function hm(v)'), s.indexOf('  function warnHtml'))
    + s.slice(s.indexOf('  function longDay(d)'), s.indexOf('\n', s.indexOf('  function longDay(d)'))) + '\nthis.hw = hoursWarn; this.full = daysInFull;', ctx);
  const every = Object.fromEntries(DAYS7.map((d) => [d, true]));
  assert.equal(ctx.hw({ days: every, from: '15:00', to: '18:00' }), '', 'summer only, inside summer hours: no heads-up');
  ctx.S.happySea = { on: false, months: {}, exact: null };
  assert.equal(ctx.hw({ days: every, from: '15:00', to: '18:00' }), 'out mercredi, le jeudi, le vendredi, le samedi et le dimanche', 'all year: outside the usual (winter) hours, named in full');
  ctx.S.happySea = { on: true, months: months(6, 9), exact: null };
  assert.equal(ctx.hw({ days: { sat: true }, from: '10:00', to: '12:00' }), 'out samedi', 'a true heads-up still shows in summer');
  assert.equal(ctx.full(['mon', 'tue']), 'lundi et le mardi');
  ctx.C.lang = 'en'; ctx.C.longDays = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday' };
  assert.equal(ctx.full(['mon', 'tue', 'wed']), 'Monday, Tuesday and Wednesday');
  assert.equal(text.fr.closedWarn.replace('{days}', 'lundi et le mardi').replace('{when}', '').split('.')[0], 'Attention\u00a0: vous êtes fermé le lundi et le mardi');
});

test('« 5 à 7 » everywhere in French: setup words for every type, the edit page section with its months, owner words', async () => {
  const leaks = [];
  const walk = (o, p) => { for (const k of Object.keys(o)) { const x = o[k]; if (typeof x === 'string') { if (/happy[ -]?hours?/i.test(x)) leaks.push(p + k); } else if (x && typeof x === 'object') walk(x, `${p}${k}.`); } };
  walk(text.fr, 'fr.');
  assert.deepEqual(leaks, [], 'no « happy hour » in any French setup string');
  for (const type of ['cocktail', 'pub', 'brewery', 'distillery', 'restaurant']) {
    const v = mk(type); const t = tokenFor(v.id);
    const cfg = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
    if (cfg.steps.includes('happy')) {
      assert.equal(cfg.t.happyQ, 'Avez-vous un 5 à 7\u202f?', `${type}: the question`);
      assert.equal(cfg.t.happyTypeQ, 'Vos 5 à 7'); assert.equal(cfg.t.saveHappy, 'Enregistrer mes 5 à 7'); assert.equal(cfg.t.labels.happy, '5 à 7');
    }
  }
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const HHW = Object.fromEntries(DAYS7.map((d) => [d, [['15:00', '18:00']]]));
  assert.equal((await change(t, { happy_hour: { ...HHW, _season: { from: '06-01', to: '09-30' } } })).status, 200);
  const page = (await get(`/fr/owner/${t}`)).text;
  assert.match(page, /<span class="lyv-section-label">5 à 7[^<]*(?:<[^>]+>[^<]*<\/[^>]+>)?<\/span> <span class="op-fold-hint">7 jours \(juin–sept\.\)<\/span>/);
  // The portal's own words (the site's shared header, the public site's navigation, is not the portal's).
  const visible = page.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<header\b[\s\S]*?<\/header>/g, '');
  assert.doesNotMatch(visible, /happy hour/i, 'no « happy hour » on the French edit page');
  assert.match((await get(`/owner/${t}`)).text, /<span class="op-fold-hint">Set for 7 days \(Jun–Sep\)<\/span>/);
  assert.equal(app.ownerFieldLabelsFor(null, true).happy_hour, '5 à 7');
});

test('seasonal-hours help: a place with summer hours is told which are usual and which seasonal, setup first, never another season', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const generic = app.OWNER_HELP_TOPICS.find((x) => x.id === 'seasonal-hours');
  assert.equal(app.ownerSeasonHelpTopic(v.id), null, 'no season: the general answer');
  assert.equal((await change(t, { hours_seasons: [{ from: '06-01', to: '09-30', label: 'Summer hours', hours: weekOf('11:30', '00:00') }] })).status, 200);
  const topic = app.ownerSeasonHelpTopic(v.id);
  assert.match(topic.a, /your <strong>usual hours<\/strong> \(Oct–May\) and your <strong>seasonal hours<\/strong>, “Summer hours” \(Jun–Sep\)/);
  assert.match(topic.a, /<strong>Set up your page<\/strong> \u2192 <strong>Change an answer<\/strong> \u2192 <strong>Hours<\/strong>.*Hours you save in the setup go live straight away/);
  assert.match(topic.a, /Tap \{SEND\}\. \{LIVE\}/, 'the edit page: checked first from the link, live when signed in');
  assert.match(topic.a, /no need to add another season/);
  assert.doesNotMatch(topic.a + topic.aFr, /November 1|1er novembre|Winter hours|Heures d’hiver/);
  assert.match(topic.aFr, /vos <strong>heures habituelles<\/strong> \(oct\.–mai\) et vos <strong>heures saisonnières<\/strong>, « Heures d’été » \(juin–sept\.\)/);
  assert.match(topic.aFr, /<strong>Configurez votre page<\/strong> \u2192 <strong>Modifier une réponse<\/strong> \u2192 <strong>Heures<\/strong>/);
  assert.match(topic.aFr, /inutile d’ajouter une autre saison/);
  const help = JSON.parse(/<script type="application\/json" id="ohbCfg">(.*?)<\/script>/s.exec((await get(`/fr/owner/${t}`)).text)[1]);
  const seen = help.topics.filter((x) => x.id === 'seasonal-hours');
  assert.equal(seen.length, 1); assert.match(seen[0].aFr, /Heures d’été/); assert.match(seen[0].aFr, /nous vérifions d’abord/, 'from the edit link: checked first');
  assert.ok(generic.aFr.includes('« Heures d’hiver »'), 'the general answer is unchanged for places with no season');
});

test('French Build My Trip: stop labels by kind, meal names, the date conflict, one price wording', () => {
  const fc = require('../trip-french-copy');
  assert.equal(fc.t3FrenchText('Cocktail lounges'), 'Bars à cocktails');
  assert.equal(fc.t3FrenchText('Happy hour'), '5 à 7');
  assert.equal(fc.t3FrenchText('No dinner matched in Penticton, so the rest of the plan is shown.'), 'Aucun lieu (souper) ne correspond à Penticton; voici le reste du plan.');
  assert.equal(fc.t3FrenchText('No lunch matched in Penticton, so the rest of the plan is shown.'), 'Aucun lieu (dîner) ne correspond à Penticton; voici le reste du plan.');
  assert.equal(fc.t3FrenchText('No breakfast matched in Penticton, so the rest of the plan is shown.'), 'Aucun lieu (déjeuner) ne correspond à Penticton; voici le reste du plan.');
  assert.equal(fc.FR_HEADING_NAMES.dinner, 'souper'); assert.equal(fc.FR_HEADING_NAMES.brunch, 'brunch'); assert.equal(fc.FR_HEADING_NAMES.drinks, 'verres');
  assert.equal(fc.t3FrenchText('The calendar date conflicts with the named weekday; confirm the travel date.'), 'La date ne correspond pas au jour de la semaine indiqué; vérifiez la date du voyage.');
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /: lang\(\) === 'fr' \? t3FrenchText\(s\.label\) : s\.label; var t = stopTime\(s, key\);/);
  assert.match(v3, /Libérez-le ou modifiez la demande\.' : t3FrenchText\(msg\);/, 'the date conflict error reads in French');
  assert.match(v3, /'Plateaux à partir de '/); assert.match(v3, /'Dégustations à partir de '/);
  assert.doesNotMatch(v3, /'(?:Cocktails|Plateaux|Dégustations) dès '/);
});

test('saved text in her language: « Heures d’été » and French holiday names on the French edit page, stored as they were', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const next = app.addLocalDays(today, 20);
  assert.equal((await change(t, { hours_seasons: [{ from: '06-01', to: '09-30', label: 'Summer hours', hours: weekOf('11:30', '00:00') }], closures: [{ from: next, to: next, note: 'Christmas Day' }] })).status, 200);
  const fr = (await get(`/fr/owner/${t}`)).text, en = (await get(`/owner/${t}`)).text;
  assert.match(fr, /id="opSeasonalLabel" maxlength="40" placeholder="Heures d’hiver" value="Heures d’été" data-stored="Summer hours" data-shown="Heures d’été">/);
  assert.match(fr, /id="opSeasonalSummary">Heures d’été du/);
  assert.match(en, /id="opSeasonalLabel" maxlength="40" placeholder="Winter hours" value="Summer hours">/, 'English unchanged');
  assert.match(fr, /class="op-cl-note"[^>]*value="Noël" data-note-stored="Christmas Day" data-note-shown="Noël">/);
  assert.match(en, /class="op-cl-note"[^>]*value="Christmas Day">/);
  // Sent back untouched, each goes back as stored (no change sent).
  assert.match(fr, /if \(labEl\.getAttribute\('data-shown'\) !== null && lab === labEl\.getAttribute\('data-shown'\)\) lab = labEl\.getAttribute\('data-stored'\);/);
  assert.match(fr, /if \(ni\.getAttribute\('data-note-shown'\) !== null && n === ni\.getAttribute\('data-note-shown'\)\) n = ni\.getAttribute\('data-note-stored'\);/);
  assert.equal(app.seasonLabelText('Summer hours', true), 'Heures d’été'); assert.equal(app.seasonLabelText('Patio season', true), 'Patio season', 'her own name as typed');
  // The French setup says an English research line is English (Groups, Reservations, Known for).
  assert.equal(text.fr.lineEnglishHint, 'Ce texte est en anglais, tel qu’il paraît maintenant sur votre page. Gardez-le, changez les mots ou touchez une réponse rapide.');
  const s = CLIENT();
  assert.match(s, /enLineHint\(gl === \(\(CUR\.visit_rows \|\| \{\}\)\.groups \|\| ''\) \? gl : '', 'suGroupsEn'\)/);
  assert.match(s, /enLineHint\(S\.brew\.known === \(\(CUR\.visit_rows \|\| \{\}\)\.known_for \|\| ''\) \? S\.brew\.known : '', 'suKnownEn'\)/);
});

test('small fixes (test 2): check-first wording, Musique en direct, Accepte les réservations, no-break spaces, Groups row, menu lead, search button', async () => {
  const v = mk('cocktail'); const t = tokenFor(v.id);
  const fr = (await get(`/fr/owner/${t}`)).text, en = (await get(`/owner/${t}`)).text;
  assert.doesNotMatch(fr, /Envoyé pour vérification, habituellement en moins d’une journée\. Touchez Envoyer/);
  assert.match(fr, /Vérifié d’abord, habituellement en moins d’une journée\. Touchez Envoyer les modifications quand vous avez terminé\./);
  assert.match(en, /Checked first, usually within a day\. Tap Send changes when you’re done\./);
  assert.match(fr, /<option value="live_music"[^>]*>Musique en direct<\/option>/);
  assert.doesNotMatch(fr, /Musique live/);
  const cfg = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(cfg.offerLabels.takes_reservations, 'Accepte les réservations');
  assert.equal(cfg.t.menuLead, 'Choisissez le plus simple pour vous. Une photo de votre carte des cocktails fonctionne aussi, même si elle change souvent.');
  assert.equal(cfg.t.whatsOnEx, 'Cocktails à 8\u00a0$ et petites assiettes à moitié prix', 'a no-break space before $');
  const s = CLIENT();
  assert.match(s, /function cpText\(n\)\{ return C\.lang === 'fr' \? money\(n\) \+ '\\u00a0\$'/);
  assert.match(s, /function flightText\(n\)\{ return C\.lang === 'fr' \? money\(n\) \+ '\\u00a0\$'/);
  assert.match(s, /if \(st === 'live' && !forced && S\.done\[step\] === 'day' && C\.waiting && C\.waiting\.indexOf\(step\) >= 0\) st = 'day';/);
  assert.equal(require('../french-text.js').FR_TEXT['What are you looking for?'], 'Que recherchez-vous\u202f?');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8'), /'search\.mainLine': 'Que recherchez-vous\\u202f\?'/);
});
