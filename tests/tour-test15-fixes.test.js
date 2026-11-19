// Whistler tour test 15 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour15-2026-11-18/REPORT.md:
// Dave, Alta Lake Paddle & Snowshoe: summer canoe, kayak and SUP rentals and a sunset guided paddle; winter snowshoe tours
// and a fondue snowshoe night; an iPad held portrait). Build My Trip missed his headline tours and ignored which kind runs
// in which season, the price screen sent a per-boat rental to Private tours, French "location de canot" and "SUP" searches
// missed him, Help got 2 of 13. Dayton approved one new input: the season each kind runs (tour_info.kind_seasons).
// Dayton (2026-11-18): tours have no meeting-spot step ("most tour operators have where their meeting spots are when people
// make their bookings"); the page shows the business address.
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
// Tour test 16 (2026-11-18): the -wal and -shm files go too. Run in the same `node --test` call as another file that
// rebuilt the database, a left-over -wal from that run was replayed into this fresh file (the two passed only alone).
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t15-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T15 ${++n}`, slug: `tour-t15-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 15 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
const start = async () => { if (srv) return; srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; };
const stop = () => srv && srv.close();
if (!process.env.T15_DEBUG) { test.before(start); test.after(stop); }
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.75.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const textOf = (p) => JSON.stringify(p);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };

// Dave's typed tours (his final-state.json).
const TOURS = [
  { name: 'Summer rentals and tours (mid-June to early Sept)', items: [
    { name: 'Canoe rental', description: 'Fits 2 adults and a small child. Life jackets included.', price: '$45 per boat per hour', duration: '1 hour' },
    { name: 'Kayak rental', description: '', price: '$30 per boat per hour', duration: '1 hour' },
    { name: 'SUP rental', description: '', price: '$30 per board per hour', duration: '1 hour' },
    { name: 'Sunset guided paddle', description: 'Kids 6+. Leaves from the dock about 2 hours before sunset.', price: '$89 per person', duration: '2 hours' }] },
  { name: 'Winter snowshoe tours (mid-Dec to March)', items: [
    { name: 'Guided snowshoe tour', description: 'Snowshoes and poles included. Kids 6+. Meet at the Olympic Plaza ticket booth.', price: '$99 per person', duration: '2 hours' },
    { name: 'Fondue snowshoe evening', description: 'Evening snowshoe by headlamp, then a cheese and chocolate fondue dinner in a heated yurt. Dinner included. Kids 6+.', price: '$179 per person', duration: '3 hours' }] },
];
const STORY = 'Summer on Alta Lake: rent a canoe, kayak or SUP by the hour from our dock at Lakeside Park, or join our 2-hour guided sunset paddle. Winter: guided snowshoe tours from Whistler Village, and our fondue snowshoe evening with dinner in a heated yurt. Closed spring and fall.';
async function dave(o = {}, info = {}) {
  const v = mk('tour', { name: `Alta Lake Paddle & Snowshoe ${n + 1}`, cuisine: 'Canoe & kayak rentals', rating: 4.7, reviews: 211, address: 'Lakeside Park, 4320 Alta Lake Rd, Whistler', latitude: 50.1103, longitude: -122.9719,
    description: STORY, description_fr: 'Location de canots et de kayaks sur le lac Alta au parc Lakeside.', hours: JSON.stringify(WK('09:00', '21:00')), kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['paddle', 'rentals', 'snowshoe'], length: '1-2h', book: 'same_day', age: 'all', year: 'seasonal', snow_open: true, ...info } }));
  ok(await change(t, { open_months: '12-15:09-05' }));
  ok(await change(t, { tour_price: 89 }));
  db.prepare('INSERT OR REPLACE INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id,
    JSON.stringify([{ from: '06-15', to: '09-05', label: '', hours: WK('08:00', '21:00') }]),
    JSON.stringify([{ from: '04-01', to: '06-14', note: 'Closed between seasons. Paddling back mid-June.', yearly: true }]));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}
let world0 = null;
function world() {
  if (world0) return world0;
  world0 = {
    eco: mk('tour', { name: 'Whistler Eco Tours T15', cuisine: 'Canoe, kayak, SUP & hiking tours', rating: 4.8, reviews: 600, description: 'Guided canoe and kayak tours on the River of Golden Dreams, SUP lessons and guided hikes.' }),
    snow: mk('tour', { name: 'Blackcomb Snowmobile T15', cuisine: 'Snowmobile & dog sled tours', rating: 4.7, reviews: 900, description: 'Snowmobile and dog sled tours in winter.' }),
    lake: mk('beach', { name: 'Lakeside Park T15', cuisine: 'Beach', rating: 4.6, reviews: 500, description: 'A lakeside park with a swimming dock and a canoe launch.' }),
  };
  for (const [nm, cu] of [['Village Bistro T15', 'Bistro'], ['Village Grill T15', 'Grill'], ['Fondue House T15', 'Fondue']]) mk('restaurant', { name: nm, cuisine: cu, hours: JSON.stringify(WK('08:00', '22:00')) });
  return world0;
}
const plan = (q, lang) => app.runTripPlan({ text: q, ...(lang ? { lang } : {}) }, NOW);

const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } return ''; };
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
// Each test adds a copy of his listing (the same answers): any copy counts.
const inPlan = (p) => namesOf(p).some((x) => /^Alta Lake Paddle & Snowshoe/.test(x));
const hisStop = (p) => itemsOf(p).find((x) => /^Alta Lake Paddle & Snowshoe/.test(x.venue.name));
module.exports = { getText, start, stop, app, db, dave, world, plan, namesOf, itemsOf, textOf, page, plain, change, ok, approveAll, tokenFor, mk, postJson, WK, TOURS, STORY, text, CLIENT, sent, NOW };
if (process.env.T15_DEBUG) return;

test('1. Build My Trip: his headline tours plan him (sunset paddle, guided paddle, SUP/kayak/canoe tour, fondue snowshoe dinner with his own "Dinner included")', async () => {
  world();
  const { v } = await dave();
  const r = require('../trip-requirements.js');
  for (const q of ['paddle tour', 'sunset paddle', 'guided paddle', 'SUP tour', 'kayak tour', 'canoe tour', 'SUP/kayak tour', 'evening paddle']) {
    const items = r.extractTripRequirements({ text: r.tripRequestSynonyms(q.toLowerCase()), referenceDate: '2026-11-18' }).items;
    assert.ok(items.some((i) => i.kind === 'venue_kind' && i.value === 'paddle_tour'), `${q}: ${JSON.stringify(items.map((i) => [i.kind, i.value]))}`);
    assert.ok(!items.some((i) => i.value === 'sunset' || i.value === 'viewpoints'), q);
  }
  for (const q of ['fondue snowshoe dinner', 'dinner snowshoe tour', 'snowshoe with fondue', 'fondue snowshoe']) {
    const items = r.extractTripRequirements({ text: r.tripRequestSynonyms(q), referenceDate: '2026-11-18' }).items;
    assert.ok(items.some((i) => i.kind === 'venue_kind' && i.value === 'snowshoe_tour'), q);
    assert.ok(!items.some((i) => i.kind === 'type' && i.value === 'restaurant'), q);
  }
  // A plain fondue is still a restaurant.
  assert.match(r.tripRequestSynonyms('fondue in whistler'), /fondue restaurant/);
  for (const q of ['sunset paddle tour in August', 'guided paddle in July', 'SUP tour in August', 'fondue snowshoe dinner in February', 'snowshoe tour Whistler in January']) assert.ok(inPlan(plan(q), v), `${q}: ${JSON.stringify(namesOf(plan(q)))}`);
  const fondue = hisStop(plan('fondue snowshoe dinner in February'));
  assert.ok(fondue.caveats.includes('Dinner included on the Fondue snowshoe evening (the operator’s own words).'), JSON.stringify(fondue.caveats));
  assert.ok(!namesOf(plan('fondue snowshoe dinner in February')).includes('Fondue House T15'));
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-french-copy.js'), 'utf8'), /inclus avec « /);
});

test('2. the season each kind runs (A): stored on tour_info.kind_seasons, read from his sections without an answer; snowshoe in July and kayak in January leave him out', async () => {
  world();
  const { v, t } = await dave();
  // No answer: his typed sections ("Summer rentals and tours", "Winter snowshoe tours") and the defaults.
  assert.deepEqual(app.tourKindSeasons(v.id), { snowshoe: 'winter', paddle: 'summer', rentals: 'summer' });
  for (const q of ['kayak in January', 'snowshoe in July', 'canoe rental in January', 'snowshoe tour in August']) assert.ok(!inPlan(plan(q), v), `${q}: ${JSON.stringify(namesOf(plan(q)))}`);
  for (const q of ['kayak in July', 'snowshoe in January', 'canoe rental Whistler in July', 'things to do in January']) assert.ok(inPlan(plan(q), v), `${q}: ${JSON.stringify(namesOf(plan(q)))}`);
  // His own answer wins, and is checked.
  ok(await change(t, { tour_info: { kind_seasons: { paddle: 'summer', rentals: 'both', snowshoe: 'winter' } } }));
  assert.deepEqual(app.venueTourInfo(v.id).kind_seasons, { paddle: 'summer', rentals: 'both', snowshoe: 'winter' });
  assert.equal(app.tourKindSeasons(v.id).rentals, 'both');
  assert.equal((await change(t, { tour_info: { kind_seasons: { paddle: 'spring' } } })).status, 400);
  // Taking a kind off takes its season off.
  ok(await change(t, { tour_info: { kinds: ['paddle', 'snowshoe'] } }));
  assert.deepEqual(app.venueTourInfo(v.id).kind_seasons, { paddle: 'summer', snowshoe: 'winter' });
  // A kind he didn't pick is never kept.
  assert.equal((await change(t, { tour_info: { kind_seasons: { zipline: 'summer' } } })).status, 200);
  assert.equal(app.venueTourInfo(v.id).kind_seasons, undefined);
  // One kind, or one season: nothing to say.
  const one = mk('tour', { cuisine: 'Snowshoe tours' }); const t1 = tokenFor(one.id);
  ok(await change(t1, { tour_info: { kinds: ['snowshoe'], year: 'seasonal' } }));
  assert.equal(app.tourKindSeasons(one.id), null);
  assert.equal(app.tourKindSeasonsAsked(one.id, ['snowshoe']), false);
});

test('2b. the setup asks only when needed: 2+ kinds, two seasons, and a kind whose season isn’t plain; pre-filled; one short question on the kinds screen', async () => {
  const { v, t } = await dave();
  assert.equal(app.tourTwoSeasons(v.id), true);
  assert.equal(app.tourKindSeasonsAsked(v.id, ['paddle', 'snowshoe']), false, 'plain from the kinds: not asked');
  const html = await getText(`/owner/${t}/setup`);
  assert.match(html.text, /"tourTwoSeasons":true/);
  assert.match(html.text, /"kindSeasonGuess":\{[^}]*"snowshoe":"winter"/);
  assert.match(CLIENT, /function ksShown\(\)\{ var ks = ksKinds\(\); return ks\.length >= 2 && ksTwoSeasons\(\) && \(ks\.some/);
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 12).
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 12).
  assert.equal(text.en.tour.ksQ, 'Which season does each run?');
  assert.deepEqual(text.fr.tour.ksOpts, { summer: 'Été', winter: 'Hiver', both: 'Les deux' });
  // The client's rule, run.
  const ks = new Function('S', 'C', 'CUR', 'TI', `${fnBody(CLIENT, 'ksKinds')}\n${fnBody(CLIENT, 'ksVal')}\n${fnBody(CLIENT, 'ksTwoSeasons')}\n${fnBody(CLIENT, 'ksShown')}\nreturn { ksShown, ksVal };`);
  const C = { tourTwoSeasons: true, kindSeasonGuess: { paddle: 'summer', rentals: 'both', snowshoe: 'winter' } };
  const S = { tour: { kinds: ['paddle', 'rentals', 'snowshoe'], ks: {} } };
  const k1 = ks(S, C, {}, {});
  assert.equal(k1.ksShown(), true); assert.equal(k1.ksVal('rentals'), 'both'); assert.equal(k1.ksVal('snowshoe'), 'winter');
  assert.equal(ks({ tour: { kinds: ['paddle', 'snowshoe'], ks: {} } }, C, {}, {}).ksShown(), false);
  assert.equal(ks(S, { ...C, tourTwoSeasons: false }, {}, {}).ksShown(), false);
  assert.equal(ks({ tour: { kinds: ['rentals'], ks: {} } }, C, {}, {}).ksShown(), false);
});

test('3. the page and the edit page say which kind runs when (EN and FR); no "rentals" twice', async () => {
  const { v, t } = await dave();
  assert.equal(app.getVenue(v.id).cuisine, 'Canoe, kayak rentals & snowshoeing'); // tour test 17: the owner's own chip order
  assert.equal(app.tourKindsText(['paddle', 'rentals', 'snowshoe'], false, 'Canoe & kayak rentals', STORY, ''), 'Canoe, kayak rentals & snowshoeing'); // tour test 17: the owner's own chip order
  const en = plain(page(v, 'en', NOW)), fr = plain(page(v, 'fr', NOW));
  assert.match(en, /Category Summer: canoe & kayak rentals · Winter: snowshoeing/);
  assert.match(fr, /Catégorie Été : kayak, canot et location · Hiver : raquette/);
  const edit = await getText(`/owner/${t}`);
  assert.match(plain(edit.text), /Season of each kind: Summer: canoe & kayak rentals · Winter: snowshoeing/);
});

test('4. the price screen: a per-boat, per-board or hourly rental goes to Your tours and prices (no Private-tours button); a whole-boat charter stays Private tours', async () => {
  const why = app.tourPriceWhy;
  assert.equal(why('30/hr per boat', false, ['paddle', 'rentals', 'snowshoe']), 'unit');
  assert.equal(why('45 per canoe per hour', false, ['paddle']), 'unit');
  assert.equal(why('30 per board', false, ['rentals']), 'unit');
  assert.equal(why('30/hr per boat', false, []), 'unit', 'hourly words say rental');
  assert.equal(why('650 per boat', false, ['boat']), 'group');
  assert.equal(why('1200 whole boat charter', false, ['paddle', 'boat']), 'group');
  const { t } = await dave();
  const r = await change(t, { tour_price: '30/hr per boat' });
  assert.equal(r.status, 400); assert.doesNotMatch(JSON.stringify(r.body), /Private tours/);
  // The client rule and its hint.
  // Tour test 16 (2026-11-18): shorter, and the rentals line is shown on the real price screen in tour-test16-fixes (17).
  assert.match(text.en.tour.tpriceMoreRentals, /per-boat rentals go in “Your tours and prices”/);
  assert.match(text.fr.tour.tpriceMoreRentals, /locations par bateau/);
  // The client's own rule, run (with the page's kinds, and without).
  const src = ['moneyHead', 'feeHours', 'priceSwiss', 'priceTrim', 'tourPriceWhy'].map((n) => fnBody(CLIENT, n)).join('\n');
  const cw = (kinds) => new Function('S', `${src}\nreturn tourPriceWhy;`)(kinds ? { tour: { kinds } } : undefined);
  assert.equal(cw(['paddle', 'rentals', 'snowshoe'])('30/hr per boat'), 'unit');
  assert.equal(cw(['paddle'])('45 per canoe'), 'unit');
  assert.equal(cw(['boat'])('650 per boat'), 'group');
  assert.equal(cw(['paddle', 'boat'])('1200 whole boat charter'), 'group');
  assert.equal(cw(null)('30/hr per boat'), 'unit');
  assert.equal(cw(null)('650 per boat'), 'group');
});

test('5. a rental request’s trip card shows his own rental price; French planner words for canoe, kayak, SUP, raquettes and fondue', async () => {
  world();
  const { v } = await dave();
  const c = hisStop(plan('canoe rental Whistler in July'));
  assert.deepEqual([c.venue.cost.label, c.venue.cost.item, c.venue.cost.unit, c.venue.cost.unitFr], ['Rental', 'Canoe rental', '$45 per boat per hour', '45 $ par bateau de l’heure']);
  const sup = hisStop(plan('SUP rental in July'));
  assert.equal(sup.venue.cost.unitFr, '30 $ par planche de l’heure');
  assert.equal(hisStop(plan('sunset paddle in July')).venue.cost.label, 'Tour');
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner-v3-page.js'), 'utf8'), /cost\.label === 'Rental' && cost\.unit/);
  const frw = require('../trip-planner-fr.js');
  assert.equal(frw.tripPlannerText('location de canot à Whistler en juillet'), 'canoe rental at whistler in july');
  assert.equal(frw.tripPlannerText('raquettes et fondue en février'), 'fondue snowshoe in february');
  assert.equal(frw.tripPlannerText('pagaie au coucher du soleil en août'), 'sunset paddle in august');
  for (const [q, inIt] of [['location de canot à Whistler en juillet', true], ['location de canoë à Whistler en juillet', true], ['raquettes et fondue en février', true], ['planche à pagaie en juillet', true], ['kayak en janvier', false]]) assert.equal(inPlan(plan(q, 'fr'), v), inIt, q);
  for (const q of ['stand up paddle in July', 'SUP rental in July', 'paddleboard rental in July', 'paddle board in August']) assert.ok(inPlan(plan(q), v), q);
});

test('6. search: SUP, stand up paddle and paddleboard are one thing; a tour whose own kind matches comes right after the name matches, closed for the season or not', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    world();
    const { v } = await dave();
    const names = async (q) => { const r = await getText(`/search?q=${encodeURIComponent(q)}`); return [...plain(r.text).matchAll(/([A-Z][A-Za-z&' ]+? (?:T15|\d+)) View details/g)].map((m) => m[1].replace(/^Favorite Add to trip /, '')); };
    for (const q of ['SUP', 'stand up paddle', 'paddleboard', 'kayak', 'canoe rental']) assert.ok((await names(q)).some((n) => n.endsWith(v.name)), q);
    const sn = await names('snowshoe tours');
    assert.ok(sn.findIndex((n) => n.endsWith(v.name)) >= 0 && sn.findIndex((n) => n.endsWith(v.name)) < sn.findIndex((n) => /Blackcomb Snowmobile/.test(n)), JSON.stringify(sn));
    assert.match(SERVER, /function searchKindMatchIds\(/);
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('8. the finish screen: a story saved on this visit sets storySentNow, and the French-description line is held back there (run, not read)', () => {
  const fn = new Function('S', 'C', 'T', 'h', 'location', `${fnBody(CLIENT, 'storyWaiting')}\n${fnBody(CLIENT, 'frDescOld')}\nreturn { storyWaiting, frDescOld };`);
  const S = { storySent: 'Summer on Alta Lake…', done: {} }, C = { lang: 'en', frDesc: 'research', frStoryQueues: true }, T = { frDescOld: 'Your French description is the old one:', frDescGo: 'update it?' };
  const f = fn(S, C, T, (x) => String(x), { pathname: '/owner/abc/setup' });
  assert.match(f.frDescOld(false), /^$/, 'nothing before the story is saved');
  f.storyWaiting();
  assert.equal(S.storySentNow, true); assert.equal(C.storyPending, 'Summer on Alta Lake…');
  assert.equal(f.frDescOld(true), '', 'held back on the finish screen');
  assert.match(f.frDescOld(false), /suFrDescOld/, 'the story screen keeps it');
  const S2 = { storySent: '', done: {} }; fn(S2, {}, T, String, {}).storyWaiting(); assert.ok(!S2.storySentNow);
});

test('9. the snow-opening note: only in the break before the snow opening; the notice says "(snow permitting)" too', async () => {
  const { v } = await dave();
  const at = (d, lang = 'en') => plain(page(v, lang, new Date(`${d}T12:00:00-08:00`)));
  assert.match(at('2026-11-18'), /Closed for the season\. Reopens mid-December \(snow permitting\)\./);
  assert.match(at('2026-11-18'), /Hours Reopens mid-December \(snow permitting\)\./);
  assert.match(at('2026-11-18', 'fr'), /Fermé pour la saison\. Rouvre mi-décembre \(selon l’enneigement\)\./);
  assert.match(at('2027-09-20'), /Hours Reopens mid-December \(snow permitting\)\./);
  for (const d of ['2027-07-15', '2027-05-01', '2027-01-15']) assert.doesNotMatch(at(d), /snow permitting|Opening day depends on snow/, d);
});

test('11. a family with a 4-year-old in July: his all-ages paddling and rentals are eligible', async () => {
  world();
  const { v } = await dave();
  // (Each test adds another copy of his listing; any of them counts.)
  const his = (p) => namesOf(p).some((x) => /^Alta Lake Paddle & Snowshoe/.test(x));
  assert.ok(his(plan('family activity with a 4 year old in July')), JSON.stringify(namesOf(plan('family activity with a 4 year old in July'))));
  assert.ok(his(plan('canoe with our 4 year old in July')));
  assert.ok(!his(plan('family activity with a 4 year old in April')), 'closed in spring');
});

test('13. the short tours list keeps a per-person tour from each section; rentals are counted as rentals', async () => {
  const { v } = await dave();
  const en = plain(page(v, 'en', NOW));
  const k = en.indexOf('🎟️ Tours & prices'); const box = en.slice(k, k + 900);
  assert.match(box, /Sunset guided paddle \$89 per person/);
  assert.match(box, /Guided snowshoe tour/);
  assert.match(box, /See all tours & prices \(3 tours and 3 rentals\)/);
  assert.match(plain(page(v, 'fr', NOW)), /\(3 activités et 3 locations\)/);
});

test('14. tours have no meeting-spot step (Dayton): no door step or tile, Basics asks for the address, the page says Address, Maps uses the business pin, a new tour spot is refused', async () => {
  const { v, t } = await dave();
  assert.ok(!app.setupParts('tour').part2.includes('door') && !app.setupParts('tour').part1.includes('door'));
  assert.ok(app.setupParts('restaurant').part2.includes('door') || app.setupParts('restaurant').part1.includes('door'), 'restaurants keep theirs');
  assert.equal(app.portalFields('tour').arrivalTile, false); assert.equal(app.portalFields('restaurant').arrivalTile, true);
  assert.equal(text.en.tour.basicsQ, 'Is this your address, phone and website?');
  assert.ok(text.en.tour.pickupBtn, 'the pickup option stays');
  const completeness = require('../portal-completeness.js');
  assert.ok(!completeness.itemsFor('tour').some((i) => i.key === 'arrival'));
  assert.equal(completeness.itemsFor('tour').reduce((a, i) => a + i.w, 0), 100);
  // A spot sent earlier stays stored, unused.
  db.prepare("INSERT INTO venue_arrival_points (venue_id, file, preview_key, lat, lng, distance_m, status) VALUES (?, 'x.jpg', ?, 50.1301, -122.9501, 2000, 'approved')").run(v.id, `k15-${v.id}`);
  const html = page(v, 'en', NOW);
  assert.match(plain(html), /Address Lakeside Park, 4320 Alta Lake Rd, Whistler/);
  assert.doesNotMatch(plain(html), /Meeting point/);
  assert.doesNotMatch(html, /50\.1301/);
  const r = await postJson(`/owner/${t}/arrival`, { image: 'data:image/jpeg;base64,AAAA', lat: 50.11, lng: -122.97, rights: true });
  assert.equal(r.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_arrival_points WHERE venue_id = ?').get(v.id).n, 1);
  // The Address box nudge.
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 10).
  assert.equal(text.en.tour.addrTwoSpots, 'Put your main spot or office here. Guests get the exact meeting spot when they book.');
});

test('15. polish: unknown change key is a 400; "per board" is « par planche »; "their photo"; Groups ends with a period', async () => {
  const { t } = await dave();
  for (const k of ['foo', 'meeting_spot_2']) { const r = await change(t, { [k]: 'x' }); assert.equal(r.status, 400, k); }
  assert.match(fs.readFileSync(path.join(ROOT, 'arrival-points.js'), 'utf8'), /Place it from their photo and new address\./);
  assert.match(CLIENT, /if \(TOUR && gline && \/\[\.!\?\]\\s\/\.test\(gline\)/);
});
