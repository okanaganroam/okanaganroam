// Whistler tour test 11 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour11-2026-11-18/REPORT.md:
// Min-jun, a private sightseeing van company in Whistler on an iPhone 15 Pro Max. He dictates: no punctuation, the
// spoken words "comma" and "period", misheard names ("Jeffrey lakes"). Korean and Japanese guides, hotel pickups in the
// village, a private van per hour with a 3-hour minimum, and an airport shuttle, which isn't a tour). On Okanagan fixtures:
// a Kelowna van company with day trips to Myra Canyon, Kalamalka Lake and Fintry Falls, hotel pickups downtown.
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
// Ported to Okanagan Roam (2026-11-18, Whistler #199): on Okanagan fixtures (Kelowna, Vernon, Coldstream, Penticton, Big White).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t11-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const hours = require('../hours.js');
const text = require('../owner-setup-text.js');
const clean = require('../owner-text-clean.js');
const completeness = require('../portal-completeness.js');
const tr = require('../trip-requirements.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T11 ${++n}`, slug: `tour-t11-${n}`, region: 'kelowna', type, latitude: 49.888 + n / 3000, longitude: -119.496,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 11 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.71.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const boxOf = (id) => JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id) || { info: '{}' }).info);
const rowOf = (id, label) => ([...(boxOf(id).rows || []), ...(boxOf(id).owner_dropped || [])].find((r) => r.label === label) || {}).text;
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');

// The places his trips go (outdoor listings, like the real ones).
let placesMade = false;
function places() {
  if (placesMade) return;
  placesMade = true;
  app.createVenue({ type: 'outdoor', name: 'Myra Canyon Provincial Park (Kettle Valley trestles)', slug: 't11-myra', region: 'kelowna', address: 'Myra Forest Service Rd, Kelowna', latitude: 49.791, longitude: -119.331,
    cuisine: 'Provincial park', description: 'Wooden trestles and rock tunnels on the old railway grade above Kelowna. A free BC Parks day-use pass is needed in summer.', rating: 4.8, reviews: 5000, hours: JSON.stringify(WK('07:00', '21:00')), activities: ['hiking'] });
  app.createVenue({ type: 'outdoor', name: 'Kalamalka Lake Provincial Park', slug: 't11-kalamalka', region: 'coldstream', address: 'Kidston Rd, Coldstream', latitude: 50.201, longitude: -119.271,
    cuisine: 'Lake', description: 'A turquoise lake with quiet coves and grassland trails.', rating: 4.8, reviews: 4000, hours: JSON.stringify(WK('08:00', '20:00')), activities: ['hiking'] });
  app.createVenue({ type: 'outdoor', name: 'Fintry Falls (Fintry Provincial Park)', slug: 't11-fintry', region: 'vernon', address: 'Westside Rd, Vernon', latitude: 50.137, longitude: -119.501,
    cuisine: 'Waterfall', description: 'A waterfall up a staircase beside Okanagan Lake, an easy walk from the beach.', rating: 4.7, reviews: 6000, hours: JSON.stringify(WK('08:00', '20:00')), activities: ['hiking'] });
}

// Min-jun's company (in Kelowna for the Okanagan port): research says "Sightseeing tours & airport shuttles", 8–6 daily, meet at the Visitor Centre.
const STORY = 'We are small family company comma private van tours from kelowna period we take you to myra canyon comma kalamalka lake comma fintry falls and vernon period our guides speak english korean and japanese period we pick up from your hotel downtown period if weather is bad we cancel and give full refund';
const TOURS = [
  { name: 'Myra canyon day trip (summer)', price: '$169 per person', description: '9 hours · walk the trestles comma we pick up from your hotel downtown period BC parks day use pass is needed in summer we can book it for you' },
  { name: 'North okanagan sightseeing kalamalka lake fintry falls and vernon', price: '$139 per seat', description: '8 hours · kalamalka lake comma fintry falls comma lunch stop in vernon comma lunch not included' },
  { name: 'Kelowna holiday lights and lake views', price: '$69 per person', description: '2 hours · winter evening tour december to march comma see the holiday lights and the lake' },
  { name: 'Private charter', price: '$150 per hour per van up to 11 people minimum 3 hours', description: 'any place you want comma Korean and Japanese speaking guide' },
  { name: 'Airport shuttle', price: '$99 per person', description: '2.5 hours · Vancouver airport to Kelowna hotel' },
];
async function minjun(o = {}) {
  places();
  const v = mk('tour', { name: `Okanagan Sightseeing Vans ${n + 1}`, cuisine: 'Sightseeing tours & airport shuttles', rating: 4.8, reviews: 211, address: '1310 Water St, Kelowna',
    description: 'Guided sightseeing tours from Kelowna to Myra Canyon and Kalamalka Lake, plus shuttles to Kelowna airport. Meet at the Kelowna Visitor Centre.',
    description_fr: 'Visites guidées de Kelowna au canyon Myra et au lac Kalamalka, et navettes vers l’aéroport de Kelowna.', hours: JSON.stringify(WK('08:00', '18:00')), ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['sightseeing'], length: 'full', book: 'day', age: 'all', year: 'all', visit: 'appointment', private: 150, private_per: 'hour', private_min: 3, pickup: true } }));
  ok(await change(t, { tour_price: 69 }));
  ok(await change(t, { visit_rows: { good_to_know: 'Hotel pickup available. We call you if the weather cancels a trip. Full refund if we cancel for weather comma myra canyon need bc parks day pass in summer we book it for you' } }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: [{ name: '', items: TOURS.map((x) => {
    const m = /^(\d+(?:\.\d+)? hours) · (.*)$/.exec(x.description);
    return { name: x.name, price: x.price, ...(m ? { duration: m[1], description: m[2] } : { description: x.description }) };
  }) }] }));
  db.prepare('UPDATE venues SET description = ? WHERE id = ?').run(app.ownerTextClean(STORY, { multiline: true }), v.id);
  app.clearHoursExtraCache();
  return { v, t };
}

const plan = (q) => app.runTripPlan({ text: q }, NOW);

test('1. a long typed price wraps under the tour name (venue page, /prices, the owner editor): no page wider than the phone', async () => {
  // The page's CSS: the line wraps, the name takes the room, the price may break (it was white-space: nowrap).
  assert.match(SERVER, /\.vm-line \{ display: flex; flex-wrap: wrap;/);
  assert.match(SERVER, /\.vm-name \{ flex: 1 1 12em; min-width: 0; overflow-wrap: anywhere; \}/);
  assert.match(SERVER, /\.vm-price \{ flex: 0 1 auto; max-width: 100%; min-width: 0; overflow-wrap: anywhere; \}/);
  assert.doesNotMatch(SERVER, /\.vm-price \{ white-space: nowrap; \}/);
  assert.match(SERVER, /body\.owner-page \.mn-line \{ display: flex; flex-wrap: wrap;/);
  assert.doesNotMatch(SERVER, /body\.owner-page \.mn-price \{ white-space: nowrap; \}/);
  const { v } = await minjun();
  assert.match(page(v), /<span class="vm-price">\$150 per hour per van up to 11 people minimum 3 hours<\/span>/);
  const pr = await get(`/${v.region}/tours/${v.slug}/prices`);
  if (pr.status === 200) assert.match(pr.text, /\.vm-line \{ display: flex; flex-wrap: wrap;/);
});

test('2. dictated punctuation: standalone "comma", "period", "full stop", "question mark", "exclamation point", "new line" become marks; "rental period" stays', () => {
  const d = (x, o) => clean.dictatedPunctuation(x, o);
  assert.equal(d('from kelowna period we take you to myra canyon comma kalamalka lake'), 'from kelowna. we take you to myra canyon, kalamalka lake');
  assert.equal(d('lunch included question mark yes exclamation point'), 'lunch included? yes!');
  assert.equal(d('great views full stop'), 'great views.');
  assert.equal(d('see you new line bring water', { multiline: true }), 'see you\nbring water');
  assert.equal(d('see you new line bring water'), 'see you. bring water');
  for (const keep of ['the rental period is 2 hours', 'a 30 day trial period applies', 'during the grace period we refund', 'bring a comma', 'our new line of bikes', 'a period piece', 'pay per period', 'the booking period ends', 'cancellation period of 48 hours', 'the period of time'])
    assert.equal(d(keep), keep, keep);
  assert.deepEqual(clean.dictationLeftovers('the rental period comma'), ['comma']);
  assert.deepEqual(clean.dictationLeftovers('the rental period is 2 hours'), []);
});

test('2b. on save: story, French story, Known for, Good to know, Groups (capital after a chip), typed tour names and descriptions; names the site knows get capitals', async () => {
  const { v, t } = await minjun();
  const dr = await change(t, { description: `${STORY} comma see you soon period` });
  ok(dr);
  const req = db.prepare("SELECT * FROM owner_change_requests WHERE venue_id = ? AND changes LIKE '%description%' ORDER BY id DESC LIMIT 1").get(v.id);
  assert.ok(req, JSON.stringify(dr.body));
  const story = JSON.parse(req.changes).description;
  assert.equal(story, 'We are small family company, private van tours from Kelowna. We take you to Myra Canyon, Kalamalka Lake, Fintry Falls and Vernon. Our guides speak English Korean and Japanese. We pick up from your hotel downtown. If weather is bad we cancel and give full refund, see you soon.');
  ok(await change(t, { description_fr: 'nous sommes une petite entreprise familiale virgule des visites en van privé depuis kelowna point nous allons au lac kalamalka' }));
  ok(await change(t, { visit_rows: { known_for: 'small private van tours with korean and japanese guides', groups: 'Private tours available. our van is up to 11 people comma price per van per hour minimum 3 hours' } }));
  assert.equal(rowOf(v.id, 'Known for'), 'Small private van tours with Korean and Japanese guides');
  assert.equal(rowOf(v.id, 'Groups'), 'Private tours available. Our van is up to 11 people, price per van per hour minimum 3 hours');
  assert.equal(rowOf(v.id, 'Good to know'), 'Hotel pickup available. We call you if the weather cancels a trip. Full refund if we cancel for weather, Myra Canyon need BC parks day pass in summer we book it for you');
  // A chip phrase the owner's words ran into: "Private tours available our van…" ends its sentence there.
  ok(await change(t, { visit_rows: { groups: 'Private tours available our van is up to 11 people' } }));
  assert.equal(rowOf(v.id, 'Groups'), 'Private tours available. Our van is up to 11 people');
  // The French story: the punctuation words are English dictation only; names still get capitals (languages stay lower case).
  assert.equal(app.ownerTextClean('nous parlons coréen et kelowna', { fr: true }), 'Nous parlons coréen et Kelowna');
  // Typed tours (the tours editor's save).
  const m = await postJson(`/owner/${t}/menu/manual`, {});
  assert.ok([200, 201].includes(m.status), JSON.stringify(m.body));
  const s1 = await postJson(`/owner/${t}/menu/save`, { data: { sections: [{ name: '', items: [{ name: 'kalamalca lake day trip', price: '$169', description: 'swim at the lake comma we pick up from your hotel period' }] }] } });
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  const draft = db.prepare("SELECT data FROM venue_menus WHERE venue_id = ? AND status IN ('draft', 'ready') ORDER BY id DESC LIMIT 1").get(v.id);
  const it = JSON.parse(draft.data).sections[0].items[0];
  assert.equal(it.name, 'Kalamalca lake day trip');
  assert.equal(it.description, 'Swim at the lake, we pick up from your hotel.');
  // The admin card flags the misheard place name; nothing is changed automatically.
  const card = app.typedTourFlagsHtml(app.getVenue(v.id), draft.data);
  assert.match(card, /“Kalamalca lake” may be Kalamalka Lake/);
});

test('2c. the admin card flags dictation left over and close misspellings of local places ("Kalamalca lake"), and a typed shuttle', async () => {
  const { v } = await minjun();
  const card = app.renderAdminChangeCard({ id: 1, venue_name: v.name, submitted_at: '2026-11-18', listing_url: '/x', changes: { description: 'Day trips to Kalamalca lake and summerlnd. The rental period comma is 3 hours.' }, previous: {}, note: '' });
  assert.match(card, /Spoken punctuation left in: “comma”/);
  assert.match(card, /“Kalamalca lake” may be Kalamalka Lake/); assert.match(card, /“summerlnd” may be Summerland/);
  const menuCard = app.typedTourFlagsHtml(app.getVenue(v.id), JSON.stringify({ sections: [{ items: [{ name: 'Airport shuttle', price: '$99' }, { name: 'Myra Canyon day trip', price: '$169' }] }] }));
  assert.match(menuCard, /“Airport shuttle” reads as a shuttle or transfer/);
  assert.doesNotMatch(menuCard, /Myra Canyon day trip” reads/);
  // The tours editor nudges gently on a typed shuttle line.
  assert.match(SERVER, /Airport shuttles and transfers aren’t tours: mention them in your story or Good to know\./);
});

test('3. pickup: an option of the meeting-spot questions; the page says "Pickup: hotels in downtown Kelowna (office: …)" and Directions names the office', async () => {
  const { v, t } = await minjun();
  assert.equal(app.tourPickup(app.getVenue(v.id)), true);
  const en = page(v), fr = page(v, 'fr');
  assert.match(plain(en), /Pickup hotels in downtown Kelowna \(office: 1310 Water St, Kelowna\)/);
  assert.match(plain(fr), /Prise en charge hôtels du centre-ville de Kelowna \(bureau : 1310 Water St, Kelowna\)/);
  assert.doesNotMatch(plain(en), /Meeting point/i);
  assert.match(plain(en), /Office in Google Maps|Directions to the office/);
  assert.match(plain(fr), /Bureau dans Google Maps|Itinéraire vers le bureau/);
  // Taken back: the address row again.
  ok(await change(t, { tour_info: { pickup: null } }));
  assert.doesNotMatch(plain(page(v)), /Pickup hotels/);
  assert.equal((await change(t, { tour_info: { pickup: 'yes' } })).status, 400);
  // The setup: the option on Basics and on Where do people meet you?, and the nudge on the Address box (EN + FR).
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 1 and 10).
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 10).
  for (const L of [text.en.tour, text.fr.tour]) for (const k of ['pickupBtn', 'pickupSub', 'pickupOn', 'pickupOff', 'addrPickup']) assert.ok(L[k], k);
  assert.equal(text.en.tour.pickupBtn, 'We pick you up (from hotels in the village)');
});

test('4. "Sightseeing and day trips" kind: label EN/FR, under More kinds, History & Culture filter (Okanagan), research words replaced, planner kind and words', async () => {
  assert.ok(completeness.TOUR_KINDS.includes('sightseeing'));
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.sightseeing, ['Sightseeing and day trips', 'Visites touristiques et excursions d’une journée']);
  assert.ok(app.TOUR_KINDS_SHOWN.indexOf('sightseeing') >= 12);
  assert.equal(app.TOUR_KIND_ACTIVITY.sightseeing, 'culture');
  // Picking a kind replaces research's category words: "airport shuttles" leaves the card.
  assert.equal(app.tourKindsText(['sightseeing'], false, 'Sightseeing tours & airport shuttles'), 'Sightseeing tours');
  assert.equal(app.tourKindsText(['sightseeing'], true, 'Sightseeing tours & airport shuttles'), 'Visites touristiques');
  assert.equal(app.tourKindsText(['sightseeing'], false, ''), 'Sightseeing tours & day trips');
  assert.ok(!app.tourKindSuggestion({ cuisine: 'Heli-sightseeing (year-round)', name: '' }).includes('sightseeing'));
  assert.ok(app.tourKindSuggestion({ cuisine: 'Sightseeing tours & airport shuttles', name: '' }).includes('sightseeing'));
  const { v, t } = await minjun();
  assert.equal(app.getVenue(v.id).cuisine, 'Sightseeing tours');
  assert.equal(app.tourInActivity(app.getVenue(v.id), 'culture'), true);
  const en = cfgOf((await get(`/owner/${t}/setup`)).text), fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.ok(en.tourKinds.some((x) => x.k === 'sightseeing' && x.t === 'Sightseeing and day trips'));
  assert.ok(fr.tourKinds.some((x) => x.k === 'sightseeing' && x.t === 'Visites touristiques et excursions d’une journée'));
  // Planner words.
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'x', description: '', cuisine: '', tourKinds: ['sightseeing'] }).includes('sightseeing_tour'));
  for (const q of ['sightseeing tour', 'van tour in kelowna', 'guided day trip', 'day tours', 'waterfall tour']) assert.ok(tr.KINDS.sightseeing_tour.test(q), q);
  for (const q of ['heli sightseeing', 'heli-sightseeing flight', 'a day trip to vernon']) assert.ok(!tr.KINDS.sightseeing_tour.test(q), q);
  for (const [q, lang] of [['sightseeing tour', 'en'], ['van tour', 'en'], ['visite touristique', 'fr'], ['excursion d’une journée', 'fr']]) {
    const p = app.runTripPlan({ text: `${q} in Kelowna in July` }, NOW);
    assert.ok(namesOf(p).some((x) => /^Okanagan Sightseeing Vans/.test(x)), `${q}: ${JSON.stringify([p.kind, namesOf(p)])}`);
    const names = (app.runDiscovery(app.discoverySearchText(q, lang), { limit: 40, lang }).results.items || []).map((x) => (x.venue || x).name);
    assert.ok(names.includes(v.name), `search ${q}: ${names}`);
  }
});

test('5. Build My Trip: a car-free Myra Canyon day trip plans the pickup tour in the morning (EN + FR), never "Park in…"; Fintry waterfalls; a January Myra trip is out for its season', async () => {
  const { v } = await minjun();
  for (const q of ['Myra Canyon day trip from Kelowna in July without a car', 'excursion au canyon Myra en juillet sans voiture', 'excursion à Myra Canyon en juillet sans voiture']) {
    const p = plan(q);
    assert.match(String(namesOf(p)[0]), /^Okanagan Sightseeing Vans \d+$/, `${q}: ${JSON.stringify([p.kind, namesOf(p), p.summary])}`);
    assert.doesNotMatch(String(p.summary), /^Park in/);
    assert.ok(!(p.unsupported || []).some((u) => /car|sans/.test(u)), JSON.stringify(p.unsupported));
    assert.ok((p.notes || []).some((x) => /No car needed: .* picks you up from hotels in downtown Kelowna and goes to Myra Canyon/.test(x)), JSON.stringify(p.notes));
    const st = (p.schedule || [])[0];
    assert.ok(st && st.startMinutes <= 600, `${q}: starts ${st && st.startMinutes}`);
  }
  // A plan with a car names the tour as the way without driving.
  const car = plan('Myra Canyon day trip in July');
  assert.ok((car.notes || []).some((x) => /Rather not drive\?/.test(x)), JSON.stringify(car.notes));
  // "sightseeing tour Vernon waterfalls": his Kelowna tours go to Fintry Falls.
  const sq = plan('sightseeing tour Vernon waterfalls');
  assert.ok(namesOf(sq).some((x) => /^Okanagan Sightseeing Vans/.test(x)), JSON.stringify([sq.kind, namesOf(sq)]));
  // January: his Myra Canyon trip is summer only, said for the season (not "Another region").
  const jan = plan('Myra Canyon tour in January');
  assert.ok(!namesOf(jan).includes(v.name));
  assert.ok((jan.notes || []).some((x) => /^Okanagan Sightseeing Vans \d+’s “Myra canyon day trip \(summer\)” runs in summer only, so it isn’t in this January plan\.$/.test(x)), JSON.stringify(jan.notes));
  assert.ok(!(jan.requirementResults || []).some((r) => (r.alternatives || []).some((a) => a.name === v.name && a.reasonCode === 'different_region')));
  // A full-day tour starts in the morning (the French plan had it 1–9 PM).
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner.js'), 'utf8'), /fullDayTour\?Math\.min\(partStart0,540\)/);
  // French notes.
  const fc = require('../trip-french-copy.js');
  assert.match(fc.t3FrenchText(`${v.name}’s “Myra canyon day trip (summer)” runs in summer only, so it isn’t in this January plan.`), /n’a lieu que l’été : elle n’est pas dans ce plan pour janvier/);
});

test('6. private price per hour with a minimum: "Private van from $150/hour (3-hour minimum)" (EN + FR); Help points there', async () => {
  const { v, t } = await minjun();
  assert.match(plain(page(v)), /Private van from \$150\/hour \(3-hour minimum\)\./);
  assert.match(plain(page(v, 'fr')), /Van privé à partir de 150 \$ l’heure \(minimum de 3 heures\)\./);
  assert.equal((await change(t, { tour_info: { private_min: 30 } })).status, 400);
  assert.equal((await change(t, { tour_info: { private_per: 'day' } })).status, 400);
  // Taking the private price back clears its unit and minimum.
  ok(await change(t, { tour_info: { private: null } }));
  const ti = app.venueTourInfo(v.id);
  assert.ok(!('private_per' in ti) && !('private_min' in ti), JSON.stringify(ti));
  // A whole-trip private price reads as before.
  ok(await change(t, { tour_info: { private: 900 } }));
  assert.match(plain(page(v)), /Private tours from \$900\./);
  // The setup: whole trip / per hour chips and the minimum hours, read from "per hour … minimum 3 hours" too.
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 13).
  assert.equal(text.en.tour.tprivPers.hour, 'Per hour'); assert.equal(text.fr.tour.tprivPers.hour, 'À l’heure');
});

test('7. airport shuttles: a transport request lists no tour operator; the admin card flags a typed shuttle', async () => {
  const { v } = await minjun();
  for (const q of ['airport shuttle Kelowna', 'navette aéroport Kelowna']) {
    const p = plan(q);
    assert.ok(!namesOf(p).includes(v.name), `${q}: ${JSON.stringify(namesOf(p))}`);
    assert.ok((p.warnings || []).some((w) => /doesn’t list airport shuttles or transfers/.test(w)), JSON.stringify(p.warnings));
  }
  // A shuttle that is part of a bigger ask keeps the plan.
  assert.ok(namesOf(plan('sightseeing tour in Kelowna in July')).includes(v.name));
});

test('8a. search: French « visite en coréen » / « en japonais », typed tour names and Good to know ("holiday lights tour", "myra canyon tour", "hotel pickup")', async () => {
  const { v } = await minjun();
  const names = (q, lang) => (app.runDiscovery(app.discoverySearchText(q, lang), { limit: 40, lang }).results.items || []).map((x) => (x.venue || x).name);
  for (const [q, lang] of [['visite en coréen', 'fr'], ['visite en japonais', 'fr'], ['korean tour', 'en'], ['holiday lights tour', 'en'], ['myra canyon tour', 'en'], ['hotel pickup', 'en']])
    assert.ok(names(q, lang).includes(v.name), `${q}: ${names(q, lang)}`);
});

test('8b. Dec 25 for a by-booking tour: the booking line and the closure, not seven "Closed" weekdays', async () => {
  const { v, t } = await minjun();
  ok(await change(t, { hours: Object.fromEntries(DAYS.map((d) => [d, []])), hours_checked: true }));
  ok(await change(t, { closures: [{ from: '12-25', to: '12-25', note: 'Christmas Day', yearly: true }] }));
  app.clearHoursExtraCache();
  const x = plain(page(v, 'en', new Date('2026-12-25T10:00:00-08:00')));
  assert.doesNotMatch(x, /Monday Closed Tuesday Closed/);
  assert.match(x, /Hours Book ahead · tours by reservation/);
  assert.match(x, /Dec 25 \(Christmas Day\)/);
});

test('8c. French page: Good to know chip phrases in French; Time needed from the shortest to the longest tour; the age answer decides Kid-friendly', async () => {
  const { v, t } = await minjun();
  const fr = plain(page(v, 'fr'));
  assert.match(fr, new RegExp(text.fr.tour.quick.good_to_know[6].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(fr, new RegExp(text.fr.tour.quick.good_to_know[5].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Time needed: 2 hours to a full day (the airport shuttle isn't a tour's length).
  assert.match(plain(page(v)), /Time needed 2 hours to a full day\. Varies by tour/);
  assert.match(fr, /De 2 heures à une journée complète\./);
  // Kid-friendly: research's badge until he answers; his answer decides.
  const r = mk('tour', { name: 'Research Kids Tours', kid_friendly: true });
  assert.equal(app.getVenue(r.id).kid_friendly, true);
  const rt = tokenFor(r.id);
  ok(await change(rt, { tour_info: { age: '16' } }));
  assert.equal(app.getVenue(r.id).kid_friendly, false);
  ok(await change(rt, { tour_info: { age: '6' } }));
  assert.equal(app.getVenue(r.id).kid_friendly, true);
  assert.equal(app.getVenue(v.id).kid_friendly, true);
  ok(await change(t, { tour_info: { age: '19' } }));
  assert.equal(app.getVenue(v.id).kid_friendly, false);
});

test('8d. tapping a Good to know chip puts the cursor in the box, at the end', () => {
  // Tour test 13: an empty box keeps the focus on the chip for a keyboard or a mouse; a finger tap still goes to the box.
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 15).
});
