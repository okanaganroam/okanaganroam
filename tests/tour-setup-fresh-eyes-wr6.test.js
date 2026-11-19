// Whistler tour test 6 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour6-2026-11-17/REPORT.md:
// Sophie-Anne, operations manager of a zipline + treetop park with summer e-bike rentals, Android, French). Covers bugs
// 1-10, the Minor list, the wording table and suggested fixes 1-8, in English and French, and that the other setup types
// still load. The Help questions are in tour-help-routing.test.js; planner words in tour-planner-words.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr6-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tr = require('../trip-requirements.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const { createArrivalPoints } = require('../arrival-points');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const V3 = fs.readFileSync(path.join(ROOT, 'trip-planner-v3-page.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const NONE = Object.fromEntries(DAYS.map((d) => [d, null]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr6 ${++n}`, slug: `tour-wr6-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.39.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);
const box = (id) => { const r = db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : null; };
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };
// Sophie-Anne's listing, moved to Penticton: research partly wrong on purpose (badges Lake view, Vegan, Patio, Happy hour,
// Dog-friendly; English research rows).
let skyCache = null;
function sky() {
  if (skyCache) return skyCache;
  const v = mk('tour', { name: 'Sky Line Ziplines & Adventure Park', slug: 'sky-line-ziplines-wr6', cuisine: 'Ziplines, treetop adventure course & e-bike rentals', rating: 4.7, reviews: 143,
    description: 'Ziplines over the canyon, a treetop adventure course and summer e-bike rentals, a short shuttle from our village office.', lake_view: 1, vegan: 1, patio: 1, happy_hour: 1, dog_friendly: 1 });
  setBox(v.id, { rows: [
    { label: 'Known for', text: 'Ziplines and a treetop adventure course' },
    { label: 'Prices', text: 'From $79 per person' },
    { label: 'Good to know', text: 'Free parking at the course; e-bike rentals all year; patio with drinks' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  skyCache = { v, t: tokenFor(v.id) };
  return skyCache;
}

test('1. per-unit prices: "69 par vélo", "$69/bike", "$40 per hour" are never a price per person; the nudge points to Your tours and prices (EN + FR)', async () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(clientFn('moneyHead') + clientFn('feeHours') + clientFn('priceSwiss') + clientFn('priceTrim') + clientFn('tourPriceWhy') + clientFn('tourPriceRead') + clientFn('tourPriceNumber'), ctx);
  const why = (x, priv) => vm.runInContext(`tourPriceWhy(${JSON.stringify(x)}, ${!!priv})`, ctx);
  const rd = (x, priv) => vm.runInContext(`tourPriceRead(${JSON.stringify(x)}, ${!!priv})`, ctx);
  // Tour test 7 (2026-11-17): a bare hourly or day rate is its own case now ('hourly' / 'day'), still never a price per person.
  for (const x of ['$40 per hour', '40/hr', '45 $ de l’heure']) { assert.equal(why(x), 'hourly', x); assert.ok(Number.isNaN(rd(x)), x); }
  assert.equal(why('150 per day'), 'day');
  const UNIT = ['69 par vélo', '$69/bike', '69$ / vélo', '69 $ par vélo électrique', '$69 per e-bike', '$45 kayak rental', '35 per kayak', '30 per board', '25 / SUP',
    '120 per canoe', '50 per pair of skis', '20 per snowshoe set', '15 per helmet', '200 per vehicle', '250 per sled', '90 per horse', '180 per room', '69 per unit', '69 par location', '69/rental'];
  for (const x of UNIT) { assert.equal(why(x), 'unit', x); assert.ok(Number.isNaN(rd(x)), x); assert.equal(app.tourPriceWhy(x), 'unit', `server ${x}`); }
  for (const x of ['650 per boat', '$650 per group', '1100 for the whole raft', '650 per charter']) { assert.equal(why(x), 'group', x); assert.equal(app.tourPriceWhy(x), 'group', x); }
  for (const [x, want] of [['69', 69], ['$159 pp', 159], ['159 $ par personne', 159], ['95 per seat', 95], ['from 79', 79], ['à partir de 79 $', 79]]) { assert.equal(rd(x), want, x); }
  // Tour test 10 (2026-11-18; Dayton): per rider, child, kid or adult is per person now ("75 per rider" couldn't be saved).
  // Tour test 13 (Dayton): per flight / ride / trip / tour is per person now.
  for (const x of ['95 per tour']) assert.equal(why(x), '', x);
  for (const x of ['95 per child', '75 per rider']) assert.equal(why(x), '', x);
  // The private box: "1500$ et plus", "from 1500", "1 500 $ et plus" read as the number (they were refused).
  for (const [x, want] of [['1500$ et plus', 1500], ['from 1500', 1500], ['1 500 $ et plus', 1500], ['$1,500+', 1500], ['1500 and up', 1500], ['à partir de 1500', 1500]]) { assert.equal(rd(x, true), want, x); assert.deepEqual(app.cleanTourPrice(x), { value: want }, `server ${x}`); }
  // Server: refused with the per-bike reason; nothing saved.
  assert.match(app.cleanTourPrice('69 par vélo', true).error, /per bike or per rental/);
  const { v, t } = sky();
  const bad = await change(t, { tour_price: '$69/bike' });
  assert.equal(bad.status, 400); assert.equal(app.tourPrice(v.id), null);
  // The nudge (EN + FR), its button to Your tours and prices, and the hint naming both cases.
  assert.equal(text.en.tour.tpriceUnit, 'Priced per bike or per rental? Put your lowest per-person trip price here; list the per-bike price in Your tours and prices.');
  assert.match(text.fr.tour.tpriceUnit, /^Prix par vélo ou par location\s?\? Mettez votre prix le plus bas par personne ici\s?; le prix par vélo va dans Vos sorties et tarifs\.$/);
  assert.match(text.en.tour.tpriceUnitRentals, /^Rentals only\?/); assert.match(text.fr.tour.tpriceUnitRentals, /^Seulement de la location/);
  assert.match(text.en.tour.tpriceMore, /per boat, per group or per lesson\? Use Private tours below\. Priced per bike or per rental\? Put it in Your tours and prices\.$/); // tour test 14: per group or lesson too
  assert.match(text.fr.tour.tpriceMore, /par vélo ou par location\s?\? Mettez-le dans Vos sorties et tarifs\.$/);
  assert.match(CLIENT, /pwhy === 'unit' && T\.tpriceUnit \?/);
  assert.match(CLIENT, /if \(k === 'tpriceToMenu'\) \{ readTour\(\); S\.menuReturn = 'price'; return go\('menu'\); \}/);
  assert.match(CLIENT, /if \(step === 'menu' && S\.menuReturn\)/);
  // Rentals only: the Prices line says "From $69." with no "a person".
  ok(await change(t, { tour_info: { kinds: ['rentals'] }, tour_price: 69 }));
  assert.match(plain(page(app.getVenue(v.id))), /From \$69\.(?! a person)/);
  assert.doesNotMatch(plain(page(app.getVenue(v.id))), /From \$69 a person/);
  assert.match(plain(page(app.getVenue(v.id), 'fr')), /À partir de 69 \$\.?/);
  ok(await change(t, { tour_info: { kinds: ['zipline', 'adventure', 'bike'] } }));
  assert.match(plain(page(app.getVenue(v.id))), /From \$69 a person/);
});

test('7. saving "Who can come" also takes Lake view (and the other place badges the tour setup never shows) off a tour', async () => {
  const { v, t } = sky();
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  for (const b of ['lake_view', 'beach_access', 'rv_parking', 'heated_patio', 'fireplace', 'local_drinks', 'takeout']) assert.ok(c.tourFoodBadges.includes(b), b);
  for (const b of ['great_groups', 'kid_friendly', 'dog_friendly', 'free_parking', 'wheelchair_accessible', 'service_dogs', 'locally_owned']) assert.ok(!c.tourFoodBadges.includes(b), b);
  assert.ok(app.getVenue(v.id).lake_view);
  const on = c.tourFoodBadges.filter((b) => c.cur.badges[b]);
  assert.ok(on.includes('lake_view'), JSON.stringify(on));
  ok(await change(t, { tour_info: { age: '6', adult: true }, badges: Object.fromEntries(on.map((b) => [b, false])) }, true));
  const after = app.getVenue(v.id);
  for (const b of ['lake_view', 'vegan', 'patio', 'happy_hour']) assert.ok(!after[b], b);
  // Other types never get the list.
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).tourFoodBadges, undefined);
});

test('2. category words: no "ATV, bungee…" for a zipline park; treetop / ropes course / adventure park are Adventure words; no English leftovers on French cards', () => {
  const kt = app.tourKindsText;
  const was = 'Ziplines, treetop adventure course & e-bike rentals';
  const en = kt(['zipline', 'bike', 'adventure'], false, was), fr = kt(['zipline', 'bike', 'adventure'], true, was);
  assert.doesNotMatch(en + fr, /ATV|bungee|VTT|élastique|canyon/i);
  assert.equal(en, 'E-bike rentals, ziplines & treetop adventure course');
  assert.equal(fr, 'Location de vélos électriques, tyrolienne et parcours dans les arbres (hébertisme)');
  assert.doesNotMatch(fr, /treetop|rentals|course/i);
  // Nothing narrower: the kind's short word.
  assert.equal(kt(['adventure'], false, ''), 'Adventure'); assert.equal(kt(['adventure'], true, ''), 'Aventure');
  assert.equal(kt(['adventure'], false, 'ATV tours'), 'ATV tours'); assert.equal(kt(['adventure'], true, 'ATV tours'), 'Sorties en quad (VTT)');
  // The label (chip) names ropes courses; the words are on the adventure kind.
  assert.equal(app.TOUR_KIND_LABELS_OWNER.adventure[0], 'ATV, bungee, climbing, ropes courses or canyoning');
  assert.equal(app.TOUR_KIND_LABELS_OWNER.adventure[1], 'VTT, saut à l’élastique, escalade, hébertisme ou canyonisme');
  for (const w of ['Treetop adventure course', 'High ropes course', 'Adventure park', 'Parc d’aventure', 'Hébertisme', 'Parcours d’arbre en arbre'])
    assert.ok(app.tourKindSuggestion({ cuisine: w, name: 'X' }).includes('adventure'), w);
  // Leftovers no picked kind covers: English kept on English pages; French says it in French or leaves it off.
  // Tour test 11 (2026-11-18): picking any kind replaces research's words; a leftover no picked kind covers goes.
  assert.equal(kt(['zipline'], false, 'Ziplines & heli-hiking'), 'Ziplines');
  assert.equal(kt(['zipline'], true, 'Ziplines & heli-hiking'), 'Tyrolienne');
  assert.equal(kt(['zipline'], true, 'Ziplines & sunset yoga'), 'Tyrolienne');
  // Tour test 7 (2026-11-17): ATV words pre-pick the adventure chip; with only Ziplines saved, he unticked it, so they go.
  assert.equal(kt(['zipline'], true, 'Ziplines & ATV tours'), 'Tyrolienne');
  assert.equal(kt(['zipline', 'adventure'], true, 'Ziplines & ATV tours'), 'Tyrolienne et sorties en quad (VTT)');
  // The rest of the kinds keep their words.
  assert.equal(kt(['bike'], false, ''), 'Bike and e-bike tours');
  assert.equal(kt(['bike'], true, 'Guided bike tours'), 'Sorties à vélo');
});

// The planner fixtures: Sophie-Anne's park with her answers saved and her published list (treetop 7+), a rental
// outfitter, a ski-and-bike rental shop, a hard hike, a restaurant.
let planCache = null;
async function planFixtures() {
  if (planCache) return planCache;
  const { v, t } = sky();
  ok(await change(t, { tour_info: { kinds: ['bike', 'zipline', 'adventure'], length: '2-3h', age: '6', adult: true, year: 'all' }, tour_price: 79 }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(v.id, JSON.stringify({ sections: [
    { name: 'Zipline & treetop park', items: [{ name: 'Zipline tour', price: '$159 per person', duration: '2.5 hours', description: 'Ages 6+, 70–275 lb. Departures every 30 minutes.' }, { name: 'Treetop adventure course', price: '$79 per person', duration: '1.5 hours', description: 'Ages 7+.' }] },
    { name: 'E-bike rentals (summer only)', items: [{ name: 'E-bike rental, 2 hours', price: '69 per bike', duration: '2 hours', description: 'Riders 16+ with ID.' }, { name: 'E-bike rental, half day', price: '109 per bike', duration: '4 hours' }] },
    { name: 'Private groups', items: [{ name: 'Private group or corporate booking', price: 'From 1500', description: 'Birthday parties and team days.' }] }] }));
  const rent = mk('tour', { name: 'Valley E-Bike Rentals Wr6', cuisine: 'E-bike rentals', description: 'E-bike and bike rentals by the hour or the day.', rating: 4.5, reviews: 80 });
  ok(await change(tokenFor(rent.id), { tour_info: { kinds: ['rentals', 'bike'], length: '2-3h', year: 'all' } }));
  const shop = mk('shop', { name: 'Penticton Ski & Bike Rentals Wr6', cuisine: 'Ski and bike rentals', description: 'Ski, snowboard and bike rentals and tuning.', rating: 4.9, reviews: 400 });
  const trail = mk('outdoor', { name: 'Hard Lake Trail Wr6', cuisine: '', description: 'A long, hard hike to an alpine lake.', activities: ['hiking'], rating: 4.9, reviews: 900 });
  const resto = mk('restaurant', { name: 'Caramba Wr6', cuisine: 'Italian', description: 'A lively family restaurant, great for birthdays.', rating: 4.6, reviews: 700, kid_friendly: 1 });
  planCache = { v, t, rent, shop, trail, resto };
  return planCache;
}

const tf = require('../trip-french-copy.js');
test('3. Build My Trip rentals: "E-bike rental", « location de vélos électriques », bike / kayak rentals plan the outfitters that rent first, shops after; headers say what is rented (EN + FR)', async () => {
  const { v, rent, shop } = await planFixtures();
  for (const q of ['E-bike rental in Penticton on August 10', 'location de vélos électriques à Penticton le 12 août', 'bike rental in Penticton on July 10', 'e-bike rentals in Penticton on July 10']) {
    const p = await plan(q), got = names(p);
    assert.ok(got.includes(v.name) && got.includes(rent.name), `${q}: ${JSON.stringify(got)}`);
    assert.ok(got.indexOf(shop.name) < 0 || got.indexOf(shop.name) > Math.max(got.indexOf(v.name), got.indexOf(rent.name)), `${q}: shop after the outfitters ${JSON.stringify(got)}`);
    assert.match(p.summary, /^(?:E-bike|Bike) rentals in Penticton/, q);
    assert.doesNotMatch(p.summary, /Shops|electriques/i, q);
  }
  assert.equal(tf.t3FrenchSummary('E-bike rentals in Penticton.'), 'Location de vélos électriques à Penticton.');
  assert.equal(tf.t3FrenchSummary('Bike rentals in Penticton on Saturday.'), 'Location de vélos à Penticton samedi.');
  // A shop is still found when it is the only place that rents (ski rentals in January).
  assert.ok(names(await plan('ski rentals in Penticton on January 10')).includes(shop.name));
  // Plain shopping still plans the shop.
  assert.ok(names(await plan('bike shop in Penticton')).includes(shop.name));
});

test('4. "adventure park" / « parc d’aventure » / "ropes course" plan the adventure-kind park (not a hike); her park is not an ATV tour', async () => {
  const { v, trail } = await planFixtures();
  for (const q of ['adventure park in Penticton on July 10', 'parc d’aventure à Penticton le samedi 10 juillet', 'ropes course in Penticton on July 10', 'treetop course in Penticton on July 10', 'parcours dans les arbres à Penticton le 10 juillet']) {
    const got = names(await plan(q));
    assert.equal(got[0], v.name, `${q}: ${JSON.stringify(got)}`);
    assert.ok(!got.includes(trail.name), `${q}: ${JSON.stringify(got)}`);
  }
  const kinds = tr.inferPlannerKinds({ type: 'tour', name: v.name, cuisine: app.getVenue(v.id).cuisine, description: '', tourKinds: ['bike', 'zipline', 'adventure'] });
  assert.ok(kinds.includes('adventure_park') && !kinds.includes('atv'), JSON.stringify(kinds));
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'Quad Co', cuisine: 'ATV tours', tourKinds: ['adventure'] }).includes('atv'));
  assert.ok(tr.inferPlannerKinds({ type: 'sport', name: 'Okanagan Aerial Adventure Park', cuisine: 'Aerial park' }).includes('adventure_park'));
  // "park" alone is still a park; an adventure park is not a park.
  assert.ok(!(tr.extractTripRequirements({ text: 'adventure park in penticton' }).items || []).some((i) => i.kind === 'venue_kind' && i.value === 'park'));
  assert.ok((tr.extractTripRequirements({ text: 'a park in penticton' }).items || []).some((i) => i.kind === 'venue_kind' && i.value === 'park'));
});

test('5. a kids’ birthday plans a kid-friendly activity (ages respected), not only a restaurant (EN + FR)', async () => {
  const { v, trail } = await planFixtures();
  for (const q of ['Birthday party activity for 8-year-olds in Penticton on July 17', 'fête d’anniversaire pour enfants à Penticton le 17 juillet', 'kids birthday in Penticton on July 17']) {
    const p = await plan(q), got = names(p);
    assert.equal(got[0], v.name, `${q}: ${JSON.stringify(got)}`);
    assert.ok(!got.slice(0, 1).includes(trail.name), q);
    assert.doesNotMatch(p.summary, /celebration/, q);
  }
  // A 4-year-old: her park is 6+, so it is not planned.
  assert.ok(!names(await plan('birthday party for my 4-year-old in Penticton on July 17')).includes(v.name));
  // A birthday dinner is still a dinner.
  assert.ok(names(await plan('birthday dinner in Penticton on July 17')).length);
});

test('8. a child under an age on her published list: "Some activities are 7+: check Tours & prices" (EN + FR)', async () => {
  const { v } = await planFixtures();
  assert.deepEqual(app.tourPlannerFacts(v.id).tourListAges, [6, 7, 16]);
  for (const q of ['treetop course in Penticton with a 6-year-old on July 14', 'parcours dans les arbres à Penticton avec un enfant de 6 ans le 14 juillet']) {
    const it = itemsOf(await plan(q)).find((x) => x.venue.name === v.name);
    // Tour test 8 (2026-11-17): the list item that matches the asked activity says its own age instead.
    assert.ok(it && ((it.caveats || []).includes('Some activities are 7+: check Tours & prices.') || (it.caveats || []).some((c) => /“Treetop adventure course” is for 7 and up/.test(c))), `${q}: ${JSON.stringify(it && it.caveats)}`);
  }
  // A 10-year-old: only the 16+ rentals are older; a 17-year-old: no note.
  const ten = itemsOf(await plan('ziplining in Penticton with a 10-year-old on July 14')).find((x) => x.venue.name === v.name);
  assert.ok(ten && ten.caveats.includes('Some activities are 16+: check Tours & prices.'), JSON.stringify(ten && ten.caveats));
  assert.equal(tf.t3FrenchText('Some activities are 7+: check Tours & prices.'), 'Certaines activités sont pour les 7 ans et plus : voyez Sorties et tarifs.');
  assert.equal(tf.t3FrenchText('A kids’ activity for the birthday'), 'Une activité pour les enfants, pour l’anniversaire');
  assert.equal(tf.t3FrenchText('Rents what you asked for'), 'Loue ce que vous avez demandé');
});

test('9. French-only lines: the finish screen and the edit pages name them (« Connu pour, Bon à savoir, Groupes : en français seulement ») with a link to add the English; the French Known for says the English line goes', async () => {
  const v = mk('tour', { name: 'Sky Line French Lines Wr6', cuisine: 'Ziplines' });
  setBox(v.id, { rows: [{ label: 'Known for', text: 'Ziplines over the canyon' }, { label: 'Good to know', text: 'Free parking at the course' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['zipline'] } }));
  ok(await change(t, { visit_rows: { known_for: 'Tyroliennes au-dessus du canyon et parcours dans les arbres', good_to_know: 'Les orages ferment le parcours; navette gratuite depuis le bureau', groups: 'Groupes de 10 et plus : réservez; fêtes d’anniversaire', _lang: 'fr' } }, true));
  const sc = JSON.parse((await get(`/owner/${t}/setup/progress`)).text).score;
  assert.deepEqual([...sc.frOnlyKeys].sort(), ['good_to_know', 'groups', 'known_for']);
  assert.equal(sc.frOnly, true);
  // The finish line (client): names them, links to the English edit page's box.
  assert.match(CLIENT, /function frOnlyNamed\(\)/);
  assert.match(CLIENT, /String\(C\.back\)\.replace\(\/\^\\\/fr\(\?=\\\/\)\/, ''\) \+ '#' \+ \(FR_ONLY_BOX\[ks\[0\]\] \|\| 'visit'\)/);
  assert.equal(text.fr.frLineNames.known_for, 'Connu pour'); assert.equal(text.fr.frLineNames.good_to_know, 'Bon à savoir'); assert.equal(text.fr.frLineNames.groups, 'Groupes');
  assert.match(text.fr.frOnlyNamed, /^\{list\}\s: en français seulement/); assert.equal(text.fr.frOnlyAddEn, 'Ajouter la version anglaise');
  assert.match(text.en.frOnlyNamed, /^In French only/); assert.equal(text.en.frOnlyAddEn, 'Add the English version');
  // The French edit page names them with a link to the English one; the English edit page says to type them below.
  const frEdit = plain((await get(`/fr/owner/${t}`)).text), enEditHtml = (await get(`/owner/${t}`)).text;
  assert.match(frEdit, /Connu pour, Bon à savoir, Groupes\s: en français seulement/);
  assert.match((await get(`/fr/owner/${t}`)).text, new RegExp(`href="/owner/${t}#opVisitKnown" onclick="[^"]*okanaganLang[^"]*">Ajouter la version anglaise`));
  assert.match(plain(enEditHtml), /In French only, so on your French page only: Known for, Good to know, Groups\. Type the English version in its box below\./);
  // The French Known for screen: the English research line goes when hers is in French (said in one line).
  assert.match(text.fr.knownFrDropsEn, /quitte votre page anglaise/);
  assert.match(CLIENT, /var dropsEn = key === 'known_for' && T\.knownFrDropsEn/);
  // An English line typed later takes it off the list.
  ok(await change(t, { visit_rows: { known_for: 'Ziplines over the canyon and a treetop course' } }));
  const sc2 = JSON.parse((await get(`/owner/${t}/setup/progress`)).text).score;
  assert.ok(!(sc2.frOnlyKeys || []).includes('known_for'), JSON.stringify(sc2.frOnlyKeys));
});

test('10. minor: Groups counter, French unit words and lengths on the list, private lines not counted, private "1500 $ et plus", shoulder hours grouped, land meeting-spot words', async () => {
  // Groups line: a counter like Good to know (180).
  assert.match(CLIENT, /field\('suGroupsLine', T\.groupsLineLabel, gl, \{ max: 780, data: 'aria-describedby="suGroupsLineCount"' \}\) \+ countLine\('suGroupsLine', gl, 180\)/);
  // French price list words and lengths (known words only).
  const sp = (x) => String(x).replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(sp(app.menuPriceLabel('69 per bike', 'fr')), '69 $ par vélo');
  // Tour test 8 (2026-11-17): a price typed "$69" reads the French way on the French page too.
  assert.equal(sp(app.menuPriceLabel('$69 per bike', 'fr')), '69 $ par vélo');
  assert.equal(sp(app.menuPriceLabel('40 per hour', 'fr')), '40 $ de l’heure');
  assert.equal(app.menuPriceLabel('69 per bike', 'en'), '$69 per bike');
  assert.equal(app.menuDurationFr('2.5 hours'), '2,5 heures'); assert.equal(app.menuDurationFr('1.5 hours'), '1,5 heure'); assert.equal(app.menuDurationFr('2 hours'), '2 heures');
  assert.equal(app.menuDurationFr('Half day'), 'Demi-journée'); assert.equal(app.menuDurationFr('Ages 6+'), 'Ages 6+');
  const { v } = await planFixtures();
  const frList = plain(app.renderVenueMenuPage(app.getVenue(v.id), app.publishedMenu(v.id), { lang: 'fr' }));
  assert.match(frList, /69 \$ par vélo/); assert.match(frList, /2,5 heures/); assert.doesNotMatch(frList, /per bike|2\.5 hours/);
  // Tour test 15: rentals are counted as rentals (« 2 activités et 2 locations »).
  assert.match(frList, /2 activités et 2 locations/);
  const enList = plain(app.renderVenueMenuPage(app.getVenue(v.id), app.publishedMenu(v.id), { lang: 'en' }));
  assert.match(enList, /\$69 per bike/); assert.match(enList, /2 tours and 2 rentals/);
  for (const x of ['Private group or corporate booking', 'Private groups', 'Groupes privés', 'Sorties privées']) assert.ok(app.TOUR_ADDON_LINE_RE.test(x), x);
  assert.ok(!app.TOUR_ADDON_LINE_RE.test('Full day private boat'));
  // The private price box takes "1500 $ et plus" (server, as the edit page sends it).
  const { t } = sky();
  ok(await change(t, { tour_info: { private: '1500 $ et plus' } }));
  assert.equal(app.venueTourInfo(sky().v.id).private, 1500);
  // Shoulder summary: days with the same hours together, closed last; French joined by « ; ».
  assert.match(CLIENT, /groups\.sort\(function\(a, b\)\{ return \(a\.t \? 0 : 1\) - \(b\.t \? 0 : 1\); \}\);/);
  // Meeting spot: no dock or boat words for a tour on land.
  assert.doesNotMatch(text.en.tour.doorPhotoLeadLand + text.fr.tour.doorPhotoLeadLand, /dock|marina|boat|quai|bateau/i);
  assert.match(CLIENT, /landTour \? T\.doorPhotoLeadLand : T\.doorPhotoLead/);
});

test('other setup types still load (EN + FR) with no tour words', async () => {
  for (const type of ['restaurant', 'pub', 'winery', 'cafe', 'brewery', 'distillery', 'cocktail']) {
    const t = tokenFor(mk(type, { cuisine: 'Canadian' }).id);
    for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`]) {
      const r = await get(p);
      assert.equal(r.status, 200, `${type} ${p}`);
      const c = cfgOf(r.text);
      assert.ok(Array.isArray(c.steps) && c.steps.length, type);
      assert.equal(c.tourFoodBadges, undefined, type);
    }
  }
});

// From Whistler Roam #190 (2026-11-17, real-data check there): adventure parks filed as sport listings plan for "adventure
// park" and kids' birthdays (ahead of a museum); "side-by-side ziplines" is not an ATV tour; when the asked town has none
// of the kind, the list is the nearest town's and the header names that town (the note says why).
test('Whistler #190: sport-listed adventure parks plan for "adventure park" and kids’ birthdays; side-by-side ziplines are not ATVs; a borrowed town is named in the header', async () => {
  await planFixtures();
  const park = mk('sport', { name: 'Kelowna Aerial Obstacle Course Wr6', region: 'kelowna', latitude: 49.88, longitude: -119.47, address: '1 Water St, Kelowna', cuisine: 'Aerial park', description: 'Treetop obstacle course with rope bridges and a lower kids’ course.', kid_friendly: 1, rating: 4.7, reviews: 300 });
  const zone = mk('sport', { name: 'Penticton Family Adventure Zone Wr6', cuisine: 'Mini golf & family adventure park', description: 'Mini golf, bungee trampolines, a climbing wall and a ropes course.', kid_friendly: 1, rating: 4.6, reviews: 500 });
  const museum = mk('indoor', { name: 'Penticton Village Museum Wr6', cuisine: 'Museum', description: 'A small local history museum.', kid_friendly: 1, rating: 4.8, reviews: 900 });
  for (const f of [park, zone]) assert.ok(app.buildTripPlannerFacts().find((x) => x.id === f.id).activities.includes('adventure'), f.name);
  assert.ok(names(await plan('adventure park in Kelowna on July 17')).includes(park.name));
  for (const q of ['adventure park in Penticton on July 17', 'parc d’aventure à Penticton le samedi 17 juillet']) {
    const got = names(await plan(q));
    assert.ok(got.includes(zone.name), `${q}: ${JSON.stringify(got)}`);
  }
  for (const q of ['Birthday party activity for 8-year-olds in Penticton on July 17', 'fête d’anniversaire pour enfants à Penticton le 17 juillet']) {
    const got = names(await plan(q));
    assert.ok(got.includes(zone.name) && (got.indexOf(museum.name) < 0 || got.indexOf(zone.name) < got.indexOf(museum.name)), `${q}: ${JSON.stringify(got)}`);
  }
  const fly = { type: 'tour', name: 'Sky Ziplines Wr6', cuisine: 'Zipline tours', description: 'Side-by-side ziplines over the canyon; riders race a friend down the longest lines.' };
  const kinds = tr.inferPlannerKinds(fly);
  assert.ok(kinds.includes('zipline') && !kinds.includes('atv'), JSON.stringify(kinds));
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'Ridge Tours Wr6', cuisine: 'Side-by-side RZR tours', description: 'Side-by-side tours on logging roads.' }).includes('atv'));
  // No zipline in Summerland: Penticton's are listed, the header names Penticton ("… in Penticton."), and the note says why.
  mk('tour', { name: 'Summerland Wine Tours Wr6', region: 'summerland', latitude: 49.60, longitude: -119.67, cuisine: 'Wine tours', address: '1 Main St, Summerland' });
  const p = await plan('zipline in Summerland on July 20');
  assert.ok(names(p).length && itemsOf(p).every((x) => x.venue.region === 'penticton'), JSON.stringify(itemsOf(p).map((x) => [x.venue.name, x.venue.region])));
  assert.match(p.summary, / in Penticton\.$/);
  assert.match(tf.t3FrenchSummary(p.summary), / à Penticton\.$/);
  assert.ok((p.notes || []).some((x) => /^Nothing in Summerland fits that, so these are (?:nearby in|the nearest, in) Penticton/.test(x)), JSON.stringify(p.notes));
});
