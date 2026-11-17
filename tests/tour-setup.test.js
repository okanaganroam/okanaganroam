// Tour operators' easy setup (Dayton, 2026-11-16: "build the tours setup"): one question per screen and an honest %
// checklist for tours, the same engine as the winery and brewery setups. Covers the steps, saving (venue_tour_info and
// the price per person), the % complete, the Plan your visit lines in English and French, the card's price and length,
// the season status, Build My Trip (season, minimum age vs kids, book ahead), the help topics, and that the other
// types' setups still load.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-setup-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Test ${++n}`, slug: `tour-test-${n}`, region: 'vernon', type, latitude: 50.267 + n / 2000, longitude: -119.272,
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

test('a tour gets its own setup: 7 essentials, 5 optional screens, tour words, and the old types are unchanged', async () => {
  const v = mk('tour', { name: 'Silver Snowmobile Tours', cuisine: 'Snowmobile tours' });
  const t = tokenFor(v.id);
  assert.deepEqual(app.setupParts('tour').part1, ['basics', 'hours', 'tour', 'price', 'booking', 'offer', 'photos']);
  assert.deepEqual(app.setupParts('tour').part2, ['story', 'bring', 'groups', 'social', 'door']);
  const r = await get(`/owner/${t}/setup`);
  assert.equal(r.status, 200);
  const c = cfgOf(r.text);
  assert.equal(c.tour, true);
  assert.equal(c.combo, true);
  assert.deepEqual(c.steps, ['basics', 'hours', 'tour', 'price', 'booking', 'offer', 'photos', 'story', 'bring', 'groups', 'social', 'door']);
  assert.equal(c.t.labels.hours, 'When you run');
  assert.equal(c.t.labels.door, 'Where do people meet you?');
  assert.equal(c.t.noSetHours, 'We don’t have set hours. Trips are by booking only');
  assert.ok(c.tourKinds.some((k) => k.k === 'heli' && k.t === 'Heli-skiing'));
  assert.ok(c.tourKinds.some((k) => k.k === 'wildlife'));
  assert.equal(c.feeLiveMax, 1000);
  // Who can come: dogs and access, never food, patio, games or reservations tiles.
  const keys = c.offerGroups.flatMap((g) => g.keys);
  assert.deepEqual(keys.sort(), ['dog_friendly', 'free_parking', 'locally_owned', 'wheelchair_accessible']);
  // No happy hour, menu, specials or events for tours.
  for (const s of ['happy', 'menu', 'specials', 'music', 'cuisine', 'spend']) assert.ok(!c.steps.includes(s), s);
  // French
  const f = await get(`/fr/owner/${t}/setup`);
  const cf = cfgOf(f.text);
  assert.equal(cf.t.labels.hours, 'Quand vous partez');
  assert.match(cf.t.tkindQ, /^Qu’offrez-vous[\u00a0\u202f]\?$/, 'French spacing before ?');
  assert.ok(cf.tourKinds.some((k) => k.t === 'Traîneau à chiens'));
  // The edit page offers the setup card.
  const e = await get(`/owner/${t}`);
  assert.match(e.text, /id="opSetupCard"/);
  // Other types still load their own setup.
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail']) {
    const o = mk(type);
    const g = await get(`/owner/${tokenFor(o.id)}/setup`);
    assert.equal(g.status, 200, type);
    const oc = cfgOf(g.text);
    assert.equal(oc.tour, false, type);
    assert.deepEqual(oc.part1, app.setupParts(type).part1, type);
  }
  // A type without a setup still goes back to its edit page.
  const b = mk('beach');
  const gb = await get(`/owner/${tokenFor(b.id)}/setup`);
  assert.equal(gb.status, 302);
});

test('saving the tour answers: kinds and length, price per person, booking, who can come, good to know; checks and Undo-safe storage', async () => {
  const v = mk('tour', { name: 'Coldstream Snowmobile Adventures', cuisine: 'Snowmobile tours (winter)' });
  const t = tokenFor(v.id);
  // What you offer: up to 3 kinds from the list, and how long.
  ok(await change(t, { tour_info: { kinds: ['snowmobile', 'dogsled'], length: 'half' } }));
  let info = app.venueTourInfo(v.id);
  assert.deepEqual(info.kinds, ['snowmobile', 'dogsled']);
  assert.equal(info.length, 'half');
  // The kinds write the cuisine words the cards, search and Build My Trip read; research's words are kept for an Undo.
  assert.equal(app.getVenue(v.id).cuisine, 'Snowmobile tours & Dog sledding');
  assert.equal(info.cuisine_was, 'Snowmobile tours (winter)');
  assert.equal((await change(t, { tour_info: { kinds: ['snowmobile', 'dogsled', 'heli', 'wine'] } })).status, 400);
  assert.equal((await change(t, { tour_info: { kinds: ['bobsled'] } })).status, 400);
  assert.equal((await change(t, { tour_info: { length: 'forever' } })).status, 400);
  // Taking the kinds back puts research's words back.
  ok(await change(t, { tour_info: { kinds: null } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Snowmobile tours (winter)');
  ok(await change(t, { tour_info: { kinds: ['snowmobile', 'dogsled'] } }));
  // Price per person: "$129", "129 $" and "1,500" all read; over $1,000 is checked first.
  ok(await change(t, { tour_price: '$149' }));
  assert.equal(app.tourPrice(v.id), 149);
  ok(await change(t, { tour_price: '129 $' }));
  assert.equal(app.tourPrice(v.id), 129);
  assert.equal((await change(t, { tour_price: 'about a hundred' })).status, 400);
  assert.equal((await change(t, { tour_price: 0 })).status, 400);
  const big = await change(t, { tour_price: '1,500' });
  assert.equal(big.status, 200);
  assert.equal(app.tourPrice(v.id), 129, 'a price over $1,000 waits for our check');
  assert.equal(app.ownerTourPriceWaiting(v.id), 1500);
  ok(await change(t, { tour_info: { private: 900 } }));
  // Booking: how far ahead, and the booking link (checked first).
  ok(await change(t, { tour_info: { book: 'day' } }));
  assert.equal((await change(t, { tour_info: { book: 'month' } })).status, 400);
  // Who can come: the minimum age, and under 18s with an adult.
  ok(await change(t, { tour_info: { age: '12', adult: true } }));
  assert.equal((await change(t, { tour_info: { age: '10' } })).status, 400);
  info = app.venueTourInfo(v.id);
  assert.deepEqual({ age: info.age, adult: info.adult, book: info.book, private: info.private }, { age: '12', adult: true, book: 'day', private: 900 });
  // 19+ never keeps "with an adult".
  ok(await change(t, { tour_info: { age: '19' } }));
  assert.equal(app.venueTourInfo(v.id).adult, undefined);
  ok(await change(t, { tour_info: { age: '12', adult: true } }));
  // Good to know: the cocktail lounges' own line (what to bring, weather), not the Groups line.
  ok(await change(t, { visit_rows: { good_to_know: 'Dress warm: we supply helmets and gloves' } }));
  ok(await change(t, { visit_rows: { groups: 'Groups of 10 or more: please book ahead' } }));
  const rows = app.venueVisitInfo(v.id).rows;
  const row = (l) => (rows.find((r) => r.label === l) || {}).text;
  assert.equal(row('Time needed'), 'Half a day (about 4 hours).');
  assert.equal(row('Prices'), 'From $129 a person. Private tours from $900.');
  assert.equal(row('Ages'), 'Ages 12 and up. Under 18s come with an adult.');
  assert.equal(row('Booking'), 'Book at least a day ahead.');
  assert.equal(row('Good to know'), 'Dress warm: we supply helmets and gloves');
  assert.equal(row('Groups'), 'Groups of 10 or more: please book ahead');
  // Other types can't send tour answers, and tours can't send a tasting fee.
  const w = mk('winery');
  assert.equal((await change(tokenFor(w.id), { tour_info: { length: 'half' } })).status, 400);
  assert.equal((await change(t, { tasting_fee: 15 })).status, 400);
  // The progress endpoint takes the tour steps.
  for (const s of ['tour', 'price', 'booking', 'bring']) assert.equal((await progress(t, s, 'live')).status, 200, s);
  assert.equal((await progress(t, 'tastings', 'live')).status, 400);
});

// A seasonal snowmobile tour (Dec 10 – Apr 5), answered from start to finish, used by the page, card and planner tests.
let snow = null;
async function seasonalSnowmobile() {
  if (snow) return snow;
  const v = mk('tour', { name: 'Monashee Sled Tours', cuisine: 'Snowmobile tours', region: 'vernon', description: 'Guided snowmobile tours in the Monashee backcountry above Vernon, with a warm-up cabin and lunch on the full-day trips.' });
  const t = tokenFor(v.id);
  ok(await change(t, { hours: WK('09:00', '16:00'), hours_checked: true, open_months: '12-10:04-05', tour_info: { year: 'seasonal' } }));
  ok(await change(t, { tour_info: { kinds: ['snowmobile'], length: '2-3h', book: 'day', age: '16', adult: true } }));
  ok(await change(t, { tour_price: 189 }));
  ok(await change(t, { visit_rows: { good_to_know: 'Dress for the weather. We call you if the weather cancels a trip', known_for: 'Small groups and a warm-up cabin at the top' } }));
  snow = { v, t };
  return snow;
}

test('the tour page: Plan your visit lines in English and French, the season in the status, the card price and length', async () => {
  const { v } = await seasonalSnowmobile();
  const en = plain(page(v, 'en', new Date('2027-01-15T19:00:00Z')));
  assert.match(en, /Season Dec 10 – Apr 5\./);
  assert.match(en, /Time needed 2 to 3 hours\./);
  assert.match(en, /From \$189 a person\./);
  assert.match(en, /Ages 16 and up\. Under 18s come with an adult\./);
  assert.match(en, /Book at least a day ahead\./);
  assert.match(en, /Good to know Dress for the weather\. We call you if the weather cancels a trip/);
  const fr = plain(page(v, 'fr', new Date('2027-01-15T19:00:00Z')));
  assert.match(fr, /Saison Du 10 déc\. au 5 avr\. /);
  assert.doesNotMatch(fr, /avr\.\./);
  assert.match(fr, /2 à 3 heures\./);
  assert.match(fr, /À partir de 189 \$ par personne\./);
  assert.match(fr, /À partir de 16 ans\. Les moins de 18 ans viennent avec un adulte\./);
  assert.match(fr, /Réservez au moins la veille\./);
  assert.doesNotMatch(fr, /Book at least a day ahead/);
  // The quick answers tapped on Good to know show in French on the French page.
  assert.match(fr, /Habillez-vous selon la météo\. Nous vous appelons si la météo annule une sortie/);
  for (const l of text.en.tour.quick.good_to_know) assert.doesNotMatch(l, /[,.;]/, 'a preset with a comma never maps as one piece');
  // Out of season: the status says closed for the season and when it's back.
  const summer = plain(page(v, 'en', new Date('2027-07-15T19:00:00Z')));
  assert.match(summer, /Closed for the season|Reopens Dec 10|back Dec 10/i);
  assert.doesNotMatch(summer, /Open now/);
  const summerFr = plain(page(v, 'fr', new Date('2027-07-15T19:00:00Z')));
  assert.match(summerFr, /Fermé pour la saison|10 déc/i);
  // The card: "From $189" and "2–3 hr" chips, and the kind of tour in its words.
  const cat = await get('/vernon/tours');
  assert.equal(cat.status, 200);
  const card = (cat.text.split('<li class="venue-card"').slice(1).find((x) => x.includes('Monashee Sled Tours')) || '');
  assert.ok(card, 'the tour has a card');
  assert.match(card, /From \$189/);
  assert.match(card, /2–3 hr/);
});

test('% complete: tour items, and By booking only answers the hours and season', async () => {
  const v = mk('tour', { name: 'Kalamalka Paddle Co.', cuisine: 'Kayak tours' });
  const t = tokenFor(v.id);
  const items = pc.itemsFor('tour');
  assert.equal(items.reduce((a, i) => a + i.w, 0), 100);
  for (const k of ['tour_kind', 'tour_length', 'tour_price', 'book_ahead', 'tour_ages', 'season', 'booking_link']) assert.ok(items.some((i) => i.key === k), k);
  for (const k of ['menu', 'happy_hour', 'specials', 'entertainment', 'avg_spend', 'cuisine', 'dietary']) assert.ok(!items.some((i) => i.key === k), k);
  const left0 = (await get(`/owner/${t}/setup/progress`)).text;
  const s0 = JSON.parse(left0).score;
  const keys0 = s0.left.map((x) => x.k);
  for (const k of ['tour_kind', 'tour_length', 'tour_price', 'book_ahead', 'tour_ages', 'season']) assert.ok(keys0.includes(k), k);
  ok(await change(t, { tour_info: { kinds: ['paddle'], length: '2-3h', book: 'same_day', age: 'all' }, tour_price: 79 }));
  // "By booking only": no set hours answers the hours, their check and the season.
  const none = Object.fromEntries(DAYS.map((d) => [d, []]));
  ok(await change(t, { hours: none, hours_checked: true, tour_info: { visit: 'appointment' } }));
  const s1 = JSON.parse((await get(`/owner/${t}/setup/progress`)).text).score;
  const keys1 = s1.left.map((x) => x.k);
  for (const k of ['tour_kind', 'tour_length', 'tour_price', 'book_ahead', 'tour_ages', 'season', 'hours', 'hours_fresh']) assert.ok(!keys1.includes(k), k);
  assert.ok(s1.pct > s0.pct);
  // The page and card say "Book ahead · tours by reservation" (French too), never open/closed times.
  const en = plain(page(v, 'en'));
  assert.match(en, /Book ahead · tours by reservation/);
  const fr = plain(page(v, 'fr'));
  assert.match(fr, /Réservez à l’avance · visites sur réservation/);
  // Hours typed in again take "By booking only" back.
  ok(await change(t, { hours: WK('10:00', '16:00'), tour_info: { visit: null } }));
  assert.equal(app.venueTourInfo(v.id).visit, undefined);
});

test('Build My Trip: the season, the minimum age with kids, and the operator’s book-ahead answer', async () => {
  const { v } = await seasonalSnowmobile();
  const names = (p) => itemsOf(p).map((x) => x.venue.name);
  const stopOf = (p, name) => itemsOf(p).find((x) => x.venue.name === name);
  // In season (January): planned, with the operator's own "book at least a day ahead" note instead of the general one.
  const jan = await plan('Monashee Sled Tours on January 20 2027');
  assert.ok(names(jan).includes('Monashee Sled Tours'), JSON.stringify(names(jan)));
  const notes = JSON.stringify(stopOf(jan, 'Monashee Sled Tours'));
  assert.match(notes, /Book at least a day ahead \(the operator’s own answer\)\./);
  assert.doesNotMatch(notes, /Tours run at set times/);
  // French: the same notes in French.
  assert.equal(frCopy.t3FrenchText('Book at least a day ahead (the operator’s own answer).'), 'Réservez au moins la veille (réponse de l’entreprise).');
  assert.equal(frCopy.t3FrenchText('Ages 6 and up (the operator’s own answer).'), 'À partir de 6 ans (réponse de l’entreprise).');
  // Out of season (July): never planned, and named as closed then.
  const jul = await plan('Monashee Sled Tours on July 20 2027');
  assert.ok(!names(jul).includes('Monashee Sled Tours'), JSON.stringify(names(jul)));
  assert.match(JSON.stringify(jul.closedNamedVenues || []), /Monashee/);
  // With kids: a 16+ tour is left out of a family day; a 6+ one is planned and says so.
  const kids = await plan('a winter day in Vernon with my kids on January 20 2027, with a snowmobile or sleigh tour');
  assert.ok(!names(kids).includes('Monashee Sled Tours'), JSON.stringify(names(kids)));
  const fam = mk('tour', { name: 'Vernon Family Sleigh Rides', cuisine: 'Sleigh rides', region: 'vernon' });
  ok(await change(tokenFor(fam.id), { tour_info: { kinds: ['snowshoe'], length: '1h', book: 'same_day', age: '6' } }));
  const famPlan = await plan('Vernon Family Sleigh Rides with my kids on January 20 2027');
  assert.ok(names(famPlan).includes('Vernon Family Sleigh Rides'), JSON.stringify(names(famPlan)));
  const famNotes = JSON.stringify(stopOf(famPlan, 'Vernon Family Sleigh Rides'));
  assert.match(famNotes, /Ages 6 and up \(the operator’s own answer\)\./);
  assert.match(famNotes, /Same-day bookings are often fine/);
  // The planner's facts for a tour, and the kids rule itself.
  assert.deepEqual(app.tourPlannerFacts(v.id), { tourMinAge: '16', tourBookAhead: 'day', tourLength: '2-3h' });
  const tp = require('../trip-planner.js');
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: '16' }), false);
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: '12' }), false);
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: '6' }), true);
  assert.equal(tp.kidsAllowed({ type: 'tour', tourMinAge: 'all' }), true);
  // Unanswered: as before (a tour with no minimum age isn't kept out of a family plan by this rule).
  assert.equal(tp.kidsAllowed({ type: 'tour', features: {} }), true);
});

test('research: suggested price and length (checked by the owner, never saved alone), research lines kept for an Undo, and never written over the owner’s', async () => {
  const db = require('../db.js');
  const v = mk('tour', { name: 'Kal Lake Jet Boat Tours', cuisine: 'Jet boat tours' });
  const t = tokenFor(v.id);
  research(v.id, [{ label: 'Known for', text: 'Fast boat rides on Kal Lake' }, { label: 'Prices', text: 'Adults $95, kids $60' }, { label: 'Time needed', text: 'About 2 hours including the safety talk' }, { label: 'Ages', text: 'All ages' }]);
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c.researchFee, 95);
  assert.equal(c.researchLength, '2-3h');
  // The kind of tour from research's words, as a starting pick only.
  assert.deepEqual(c.suggestKinds, ['jetboat']);
  assert.deepEqual(app.tourKindSuggestion({ name: 'Canadian Wilderness Adventures', cuisine: 'Snowmobile, dog sled, snowshoe & snowcat tours' }), ['snowmobile', 'dogsled', 'snowshoe']);
  assert.deepEqual(app.tourKindSuggestion({ name: 'Whistler Photo Safaris', cuisine: 'Bear viewing tours' }), ['wildlife']);
  assert.deepEqual(app.tourKindSuggestion({ name: 'Ghost Tours of Vernon', cuisine: null }), ['walking']);
  assert.equal(app.tourPrice(v.id), null, 'a suggestion is never saved by itself');
  assert.equal(app.venueTourInfo(v.id).length, undefined);
  ok(await change(t, { tour_price: 99 }));
  const row = (l) => (app.venueVisitInfo(v.id).rows.find((r) => r.label === l) || {}).text;
  assert.equal(row('Prices'), 'From $99 a person.');
  // Research can't bring its line back over the owner's.
  research(v.id, [{ label: 'Prices', text: 'Adults $105' }, { label: 'Time needed', text: 'Two hours' }]);
  assert.equal(row('Prices'), 'From $99 a person.');
  assert.equal(row('Time needed'), 'Two hours', 'not answered: research may update it');
  // Undo the price: research's line comes back, and the card's price is research's again.
  const req = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 AND changes LIKE '%tour_price%' ORDER BY id DESC").get(v.id).id;
  assert.equal(app.undoOwnerInstantChange(req, 'test').ok, true);
  assert.equal(app.tourPrice(v.id), null);
  assert.equal(row('Prices'), 'Adults $95, kids $60', 'the research line her answer replaced');
});

test('help topics for tours, in English and French, on the setup and the edit page', async () => {
  const v = mk('tour', { name: 'Okanagan Heli Tours', cuisine: 'Helicopter tours' });
  const t = tokenFor(v.id);
  const html = (await get(`/owner/${t}/setup`)).text;
  const bot = helpBot(html);
  const asks = {
    'we only run in winter': 'tour-season', 'our season is december to april': 'tour-season',
    'we have no set hours, trips are by booking only': 'tour-booking-only', 'departure times': 'tour-booking-only',
    'what if the weather cancels a trip': 'tour-weather', 'rain or shine': 'tour-weather',
    'private tour price': 'tour-price', 'price per person': 'tour-price',
    'minimum age': 'tour-age', 'can kids come': 'tour-age',
    'we run multi-day trips': 'tour-multiday',
    'our office is not the meeting point': 'tour-meeting', 'hotel pickup': 'tour-meeting',
    'we sell gift cards': 'tour-gift',
    'private bookings for groups': 'tour-groups',
    'how long until it shows on my page': 'setup-live-when',
    'is this free': 'tour-free', 'do you take a commission': 'tour-free',
  };
  const misses = Object.entries(asks).filter(([q, id]) => { const b = bot.best(q); return !b || b.id !== id; }).map(([q, id]) => `${q} -> ${(bot.best(q) || {}).id} (want ${id})`);
  assert.deepEqual(misses, []);
  for (const id of new Set(Object.values(asks))) {
    const tp = bot.topic(id);
    assert.ok(tp && tp.a && tp.aFr, id);
    assert.doesNotMatch(tp.a + tp.aFr, /happy hour|5 à 7/i, id);
  }
  // French questions.
  const fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  for (const [q, id] of [['nous partons seulement l hiver', 'tour-season'], ['annulation a cause de la meteo', 'tour-weather'], ['age minimum', 'tour-age'], ['cartes cadeaux', 'tour-gift'], ['est ce gratuit', 'tour-free']]) assert.equal((fr.best(q) || {}).id, id, q);
  // No happy hour help for tours.
  assert.ok(!bot.topic('hh-times'));
  // The edit page has them too, and no food picker.
  const edit = (await get(`/owner/${t}`)).text;
  assert.ok(helpBot(edit).topic('tour-weather'));
  assert.doesNotMatch(edit, /id="opCuisine"/);
  const editFr = (await get(`/fr/owner/${t}`)).text;
  assert.equal(editFr.includes('opSetupCard'), true);
});
