// Whistler tour test 3 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour3-2026-11-17/REPORT.md: Karen, an
// office manager on the owner's link, a year-round helicopter company with set hours, two stretches and five products).
// Covers bugs 1-14, the Minor list, the wording table and suggested fixes 1-12, in English and French, the two fixes
// brought over from whistlerroam #183 (wildlife category words; tourKindsText keeps her words only when they still name
// the kind), and that the other setup types still load.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr3-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tr = require('../trip-requirements.js');
const trFr = require('../trip-planner-fr.js');
const text = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c, closed = []) => Object.fromEntries(DAYS.map((d) => [d, closed.includes(d) ? [] : [[o, c]]]));
const NONE = Object.fromEntries(DAYS.map((d) => [d, []]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr3 ${++n}`, slug: `tour-wr3-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.36.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);
const stopOf = (p, name) => itemsOf(p).find((x) => x.venue.name === name);
const tourInfo = (id) => { const r = db.prepare('SELECT info FROM venue_tour_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : {}; };

// Karen's company, moved to Penticton: research words "Helicopter tours, heli-skiing & heli-hiking", research hours and
// lines as in the test. Named with another town's name in it ("Kelowna Peak Helicopters"). Decoys in the same town.
const K = 'Kelowna Peak Helicopters';
let karenCache = null;
function karen() {
  if (karenCache) return karenCache;
  const v = mk('tour', { name: K, cuisine: 'Helicopter tours, heli-skiing & heli-hiking', rating: 4.8, reviews: 326, price: 4,
    description: 'Year-round helicopter company: scenic flights and glacier landings in every season, heli-skiing in winter and heli-hiking in summer.',
    description_fr: 'Entreprise d’hélicoptères ouverte à l’année : vols panoramiques et atterrissages sur glacier en toute saison, héliski l’hiver et randonnée héliportée l’été.' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [
    { label: 'Known for', text: 'Scenic helicopter flights and glacier landings above the valley' },
    { label: 'Time needed', text: '20 minutes to a full day' },
    { label: 'Prices', text: 'Scenic flights from $179 per person; heli-skiing from $1,650' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' }));
  mk('tour', { name: 'Skaha Jet Boats Wr3', cuisine: 'Jet boat tours', rating: 4.9, reviews: 900, description: 'Jet boat tours on Skaha Lake.' });
  mk('tour', { name: 'Naramata Wine Shuttle Wr3', cuisine: 'Wine tours', rating: 4.8, reviews: 500, description: 'Guided wine tours of the Naramata Bench.' });
  mk('restaurant', { name: 'Main Street Diner Wr3', cuisine: 'Canadian', rating: 4.5, reviews: 300 });
  karenCache = { v, t: tokenFor(v.id) };
  return karenCache;
}

test('1. Build My Trip: an owner’s "all year" (with a kind that isn’t a snow one) lifts the winter-words rule; research alone and snow-only companies keep it', async () => {
  const { v, t } = karen();
  // Research only (no owner answer): the heli-skiing words still drop it from a general July tours request...
  assert.ok(!names(await plan('tours in Penticton on July 14 2027')).includes(K));
  // ...but (port of whistlerroam #184) its own category words name helicopter tours and heli-hiking, so a July request
  // for exactly that keeps it.
  assert.ok(names(await plan('Scenic flight in Penticton on July 14 2027')).includes(K));
  assert.ok(names(await plan('Heli-hiking in Penticton on July 22 2027')).includes(K));
  const vern = { region: 'vernon', address: '6300 Tronson Rd, Vernon', latitude: 50.25, longitude: -119.33 };
  const drops = mk('tour', { name: 'Monashee Helicopter Wr3', cuisine: 'Heli-sightseeing, heli-hiking & heli-ski drops (ski touring November to July)', ...vern, description: 'Helicopter operator.' });
  const touring = mk('tour', { name: 'Silver Star Helicopters Wr3', cuisine: 'Heli-assisted ski touring & heli-sightseeing', ...vern, latitude: 50.251, description: 'Helicopter charter.' });
  const skiOnly = mk('tour', { name: 'Kalamalka Helicopters Wr3', cuisine: 'Heli-skiing', ...vern, latitude: 50.252, description: 'Heli-skiing days, and scenic flights on request.' });
  const vf = names(await plan('Scenic flight in Vernon on July 14 2027'));
  assert.ok(vf.includes(drops.name) && vf.includes(touring.name), JSON.stringify(vf));
  // A company whose category words are only snow ones stays out, whatever its description says; and a general tours
  // request, or a request for another kind, keeps the rule for all three.
  assert.ok(!vf.includes(skiOnly.name), JSON.stringify(vf));
  assert.ok(names(await plan('Heli-hiking in Vernon on July 22 2027')).includes(drops.name));
  assert.ok(!names(await plan('Heli-hiking in Vernon on July 22 2027')).includes(touring.name));
  for (const q of ['tours in Vernon on July 14 2027', 'rafting in Vernon on July 14 2027']) { const got = names(await plan(q)); assert.ok(![drops.name, touring.name, skiOnly.name].some((x) => got.includes(x)), `${q}: ${JSON.stringify(got)}`); }
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: '', description: '', cuisine: 'Heli-sightseeing' }).includes('scenic_flight'));
  // She picks her kinds and answers "Yes, all year".
  ok(await change(t, { tour_info: { kinds: ['flight', 'heli', 'other'], length: '1h', year: 'all', age: 'all' } }));
  assert.equal(app.tourPlannerFacts(v.id).tourYearAll, true);
  for (const q of ['Scenic flight in Penticton on July 14 2027', 'Flightseeing tour in Penticton on July 14 2027']) assert.deepEqual(names(await plan(q)), [K], q);
  // January still finds it for heli-skiing; a July request for skiing itself is told skiing isn't part of a July plan.
  assert.ok(names(await plan('heli-skiing in Penticton on January 20 2027')).includes(K));
  const july = await plan('heli-skiing in Penticton on July 20 2027');
  assert.match(JSON.stringify(july), /skiing isn’t part of this July plan/);
  assert.doesNotMatch(String(july.summary || ''), /skiing/i);
  // A company whose only words are snow ones keeps the rule even with "all year" (the office may be open; the trips aren't).
  const snow = mk('tour', { name: 'Apex Snowmobile Tours Wr3', cuisine: 'Snowmobile tours', rating: 4.9, reviews: 800, description: 'Guided snowmobile tours.' });
  ok(await change(tokenFor(snow.id), { tour_info: { kinds: ['snowmobile'], length: 'half', year: 'all' } }));
  assert.ok(!names(await plan('tours in Penticton on July 14 2027')).includes('Apex Snowmobile Tours Wr3'));
  // A part-of-the-year season that covers the date still lifts it (#901), and one that doesn't keeps it out.
  const coast = mk('tour', { name: 'Coast Heli-Skiing Wr3', cuisine: 'Heli-skiing & summer heli-biking', rating: 4.9, reviews: 700, description: 'Heli-skiing in winter, heli-biking in summer.' });
  ok(await change(tokenFor(coast.id), { open_months: '12-01:09-30' }));
  ok(await change(tokenFor(coast.id), { tour_info: { kinds: ['heli', 'bike'], length: 'full', year: 'seasonal' } }));
  assert.ok(names(await plan('bike tour in Penticton on July 20 2027')).includes('Coast Heli-Skiing Wr3'));
  assert.ok(!names(await plan('bike tour in Penticton on October 20 2027')).includes('Coast Heli-Skiing Wr3'));
  // The rule's own helper: snow-only words never count as "other kinds".
  const tp = require('../trip-planner.js');
  assert.equal(typeof tp.offSeasonBlocked, 'function');
});

test('2. planner words: helicopter, heli tour, flightseeing, French, heli-hiking, glacier landing, the age note, a town’s name inside a listing’s name', async () => {
  const { v } = karen();
  if (!tourInfo(v.id).year) ok(await change(tokenFor(v.id), { tour_info: { kinds: ['flight', 'heli', 'other'], length: '1h', year: 'all', age: 'all' } }));
  for (const q of ['Helicopter tour in Penticton on July 14 2027', 'heli tour in Penticton on July 14 2027', 'helicopter in Penticton on July 14 2027', 'helicopter flight in Penticton on July 14 2027',
    'Scenic helicopter flight in Penticton on July 14 2027', 'flightseeing in Penticton on July 14 2027', 'Glacier landing in Penticton on July 14 2027',
    'tour d’hélicoptère à Penticton le 14 juillet 2027', 'vol en hélicoptère à Penticton le 14 juillet 2027', 'hélicoptère à Penticton le 14 juillet 2027',
    'Heli-hiking in Penticton on July 22 2027', 'heli hiking in Penticton on July 22 2027', 'heli hike in Penticton on July 22 2027', 'héli-randonnée à Penticton le 22 juillet 2027']) {
    const p = await plan(q);
    assert.deepEqual(names(p), [K], `${q}: ${JSON.stringify(names(p))} ${JSON.stringify(p.warnings)}`);
    assert.match(String(p.summary), /^Tours & experiences in Penticton/, q);
    assert.doesNotMatch(JSON.stringify(p.warnings || []), /No (?:hike|outdoor|scenic flight)/, q);
    // Port of whistlerroam #184: the helicopter words are used, so they are never listed as "not something we can plan around".
    assert.doesNotMatch(JSON.stringify([p.unsupported || [], (p.understood || {}).notUsed || []]), /h[eé]licopt/i, q);
  }
  // Kids with an age: the tour's own age answer is said.
  const kid = await plan('heli hike in Penticton on July 22 2027 with our 10-year-old');
  assert.ok(stopOf(kid, K), JSON.stringify(names(kid)));
  assert.ok(stopOf(kid, K).caveats.includes('All ages welcome (the operator’s own answer).'), JSON.stringify(stopOf(kid, K).caveats));
  assert.equal(require('../trip-french-copy.js').t3FrenchText('All ages welcome (the operator’s own answer).'), 'Tous les âges sont bienvenus (réponse de l’entreprise).');
  // A town's name inside the name of the listing the request names is not the trip's town.
  for (const q of ['A flight with Kelowna Peak Helicopters on March 6 2027', 'Kelowna Peak Helicopters on March 6 2027']) {
    const p = await plan(q);
    assert.equal(names(p)[0], K, `${q}: ${JSON.stringify(names(p))}`);
    assert.match(String(p.summary), /Penticton/, q);
    assert.doesNotMatch(JSON.stringify(p.warnings || []), /No scenic flight/, q);
  }
  // Named with its town said as well: the town stays.
  assert.match(String((await plan('Kelowna Peak Helicopters in Penticton on March 6 2027')).summary), /Penticton/);
  // The words themselves. A listing must say flight or tour words itself: a heli-ski company named "… Helicopters" is not one.
  const kinds = (o) => tr.inferPlannerKinds({ type: 'tour', name: 'X', description: '', ...o });
  assert.ok(kinds({ cuisine: 'Scenic or helicopter flights' }).includes('scenic_flight'));
  assert.ok(kinds({ cuisine: 'Helicopter & scenic flights' }).includes('scenic_flight'));
  assert.ok(kinds({ cuisine: 'Helicopter flights, Heli-skiing & Heli-hiking' }).includes('scenic_flight'));
  assert.ok(kinds({ cuisine: 'Helicopter flights, Heli-skiing & Heli-hiking' }).includes('heli_hike'));
  assert.equal(kinds({ name: 'Powder Peak Helicopters', cuisine: 'Heli-skiing' }).includes('scenic_flight'), false);
  assert.equal(kinds({ cuisine: 'Guided hiking tours' }).includes('heli_hike'), false);
  assert.equal(tr.tripRequestSynonyms('Heli-hiking in Penticton'), 'helihiking tour in Penticton');
  assert.equal(tr.tripRequestSynonyms('a scenic helicopter flight'), 'a helicopter flight');
  const tx = (q) => trFr.tripPlannerText(q, { regions: [{ slug: 'penticton', label: 'Penticton' }], venues: [] });
  assert.match(tx('tour d’hélicoptère à Penticton'), /helicopter tour/);
  assert.match(tx('vol en hélicoptère à Penticton'), /helicopter flight/);
  assert.match(tx('héli-randonnée à Penticton'), /heli hiking/);
  assert.match(tx('randonnée à Penticton'), /\bhike\b/);
  const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vocabulary', 'shared.json'), 'utf8'));
  assert.ok(vocab.types.tour.includes('heli hiking') && vocab.types.tour.includes('heli hike'));
});

test('2b. from whistlerroam #183: a wildlife tour request is not also a category match; her words replace a chip’s name only when they still name the kind', async () => {
  const raft = mk('tour', { name: 'Riviere Rafting Wr3', cuisine: 'Whitewater rafting & bear viewing tours', rating: 4.9, reviews: 212, description: 'Rafting, and bear-viewing 4x4 tours in summer.' });
  ok(await change(tokenFor(raft.id), { tour_info: { kinds: ['raft', 'wildlife'], length: '2-3h', year: 'all' } }));
  // Real listings elsewhere carry the category "Bear viewing tour" / "Wildlife viewing".
  mk('tour', { name: 'Kelowna Bear Tours Wr3', cuisine: 'Bear viewing tour', region: 'kelowna', address: '1 Water St, Kelowna', latitude: 49.888, longitude: -119.496, description: 'Bear viewing tours by 4x4.' });
  mk('outdoor', { name: 'Marsh Boardwalk Wr3', cuisine: 'Wildlife viewing', region: 'kelowna', address: '2 Marsh Rd, Kelowna', latitude: 49.89, longitude: -119.49, description: 'A marsh boardwalk with wildlife viewing.' });
  for (const q of ['Bear viewing tour in Penticton on July 20 2027', 'wildlife tour in Penticton on July 20 2027', 'observation des ours à Penticton le 20 juillet 2027']) {
    assert.ok(names(await plan(q)).includes('Riviere Rafting Wr3'), q);
  }
  assert.deepEqual(names(await plan('Bear viewing tour in Kelowna on July 20 2027')), ['Kelowna Bear Tours Wr3']);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner.js'), 'utf8'), /const WILDLIFE_TOUR_WORDS_RE = /);
  // A heli-ski company's "summer heli-biking" with Bike tours picked keeps the kind's words ("bike tour" still finds it).
  assert.equal(app.tourKindsText(['heli', 'bike'], false, 'Heli-skiing & summer heli-biking'), 'Heli-skiing · Bike and e-bike tours');
  assert.equal(app.tourKindsText(['raft', 'wildlife'], false, 'Whitewater rafting & bear viewing tours'), 'Whitewater rafting · Wildlife and bear viewing');
});

test('3. cards: on a tour card with Complete & Verified the price and length sit whole on the line under the badge (tour cards only)', async () => {
  const html = (await get('/penticton/tours')).text;
  assert.match(html, /\[data-venue-category="tour"\] > \.chips:has\(> \.complete-verified-badge\) \{ flex-wrap: wrap !important;/);
  assert.match(html, /\[data-venue-category="tour"\] > \.chips:has\(> \.complete-verified-badge\) > \.chip\.chip-feat \{ flex-shrink: 0; \}/);
  assert.match(html, /\[data-venue-category="tour"\] > \.chips > \.complete-verified-badge \+ \.chip::before \{ content: none !important; \}/);
  // Other cards keep their one line: the wrap rule names tour cards only.
  const rules = [...SERVER.matchAll(/^.*\.chips:has\(> \.complete-verified-badge\).*$/gm)].map((m) => m[0]);
  assert.ok(rules.length >= 4 && rules.every((r) => r.includes('[data-venue-category="tour"]')), rules.join('\n'));
  // The card says "Up to 1 hr" for the shortest length, in French « Jusqu’à 1 h ».
  assert.equal(app.tourCardFacts({ rows: [{ label: 'Time needed', text: 'Up to 1 hour.' }] }).time, 'Up to 1 hr');
  assert.equal(app.tourCardFacts({ rows: [{ label: 'Time needed', text: '2 to 3 hours.' }] }).time, '2–3 hr');
  const chip = '<!DOCTYPE html><html><body><span class="chip chip-feat"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg>Up to 1 hr</span><span class="chip chip-feat">2–3 hr</span></body></html>';
  const fr = app.frenchTwinHtml(chip, '/penticton/tours');
  assert.match(fr, /Jusqu’à 1 h<\/span>/);
  assert.match(fr, />2–3 h<\/span>/);
});

test('4. Help: the winter-only trip, office hours, change it later, can my boss see, the heliport, a week or 48 hours, the private price (EN + FR)', async () => {
  const { t } = karen();
  const hb = helpBot((await get(`/owner/${t}/setup`)).text);
  const want = (q, id) => assert.equal(hb.best(q).id, id, `${q} -> ${hb.best(q).id} (${hb.best(q).hits.slice(0, 3).join(',')})`);
  for (const q of ['Heli-skiing is only in winter. How do I say that?', 'One of our tours is summer only', 'heli-hiking is only in summer, where do I put that', 'L’héliski est seulement en hiver. Comment le dire?']) want(q, 'tour-one-trip-season');
  // The company's own season still gets the season answer.
  for (const q of ['We only run in winter', 'our season is December to April', 'We are closed in summer']) want(q, 'tour-season');
  for (const q of ['Our office is open set hours but trips are by reservation. Which do I pick?', 'the office is open 9 to 5 but flights are by reservation', 'Notre bureau a des heures fixes mais les sorties sont sur réservation']) want(q, 'tour-office-hours');
  want('We have no set hours, trips are by booking only', 'tour-booking-only');
  for (const q of ['How do I change something later?', 'I made a mistake, can I change it?', 'Comment changer quelque chose plus tard?']) want(q, 'setup-change-later');
  for (const q of ['Can my boss see what I did?', 'Will the owner get an email?', 'does my boss get an email when I save', 'Est-ce que mon patron peut voir ce que j’ai fait?']) want(q, 'setup-who-sees');
  for (const q of ['The heliport is not in the village', 'where people meet us is not our office', 'L’héliport n’est pas au village']) want(q, 'tour-meeting');
  for (const q of ['Some trips need a week and some 48 hours. Which do I pick?', 'une semaine ou 48 heures, lequel choisir?']) want(q, 'tour-lead-time');
  for (const q of ['Why isn’t my private charter price showing?', 'Pourquoi mon prix privé ne s’affiche pas?']) want(q, 'tour-private-price');
  want('what price do I put', 'tour-price');
  want('can my staff log in too', 'staff');
  // What the answers say.
  const one = hb.topic('tour-one-trip-season');
  assert.match(one.a, /Stay “all year”/);
  assert.match(one.a, /on that trip<\/strong> in <strong>Your tours and prices/);
  assert.doesNotMatch(one.a, /tap <strong>We only run part of the year/);
  assert.match(one.aFr, /Restez à « toute l’année »/);
  const office = hb.topic('tour-office-hours');
  assert.match(office.a, /Keep your hours/);
  assert.match(office.a, /By booking only is for no set hours at all/);
  const later = hb.topic('setup-change-later');
  assert.match(later.a, /Use this same link, any time/);
  assert.match(later.a, /Change an answer/);
  assert.match(later.a, /Back to my edit page/);
  // Truthful: no email per save, no list of who changed what; emails only on our decisions and a new login.
  const who = hb.topic('setup-who-sees');
  assert.match(who.a, /nothing is sent to them when you save/);
  assert.match(who.a, /no list of who changed what, and no email goes out each time you save/);
  assert.match(who.a, /only when we approve or decline something we check first/);
  assert.match(who.aFr, /aucun courriel n’est envoyé à chaque enregistrement/);
  assert.match(SERVER, /async function notifyReviewDecision\(kind, id, action/);
  assert.match(SERVER, /function ownerDecisionRecipients\(venueId, senderEmail\)/);
  assert.match(SERVER, /function notifyOwnersOfNewLogin\(venue, newAccount\)/);
  assert.match(hb.topic('tour-meeting').a, /drag the pin to your meeting spot/);
  assert.equal(hb.best('our office is not the meeting point').id, 'tour-meeting');
  assert.equal(hb.best('We do ATV tours, which one do I pick?').id, 'tour-kinds-other');
  assert.match(hb.topic('tour-lead-time').a, /pick the <strong>longest<\/strong> notice/);
  const priv = hb.topic('tour-private-price');
  assert.match(priv.a, /as soon as you save it/);
  assert.match(priv.a, new RegExp(`price per person<\\/strong> is checked first when it is over \\$${app.TOUR_PRICE_LIVE_MAX.toLocaleString('en-CA')}`));
  // The tour answers say "More about your tours" (and the price answer "per person").
  for (const tp of hb.topics.filter((x) => /^tour-/.test(x.id))) { assert.doesNotMatch(tp.a, /More about your place/, tp.id); assert.doesNotMatch(tp.aFr || '', /Plus de détails sur votre établissement/, tp.id); }
  assert.match(hb.topic('tour-price').a, /A price per person over \$1,000 is checked first/);
  // Every setup type gets the two staff answers.
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail']) {
    const o = mk(type, { cuisine: type === 'winery' ? 'Winery' : 'Canadian' });
    const b = helpBot((await get(`/owner/${tokenFor(o.id)}/setup`)).text);
    assert.equal(b.best('How do I change something later?').id, 'setup-change-later', type);
    assert.equal(b.best('Can my boss see what I did?').id, 'setup-who-sees', type);
    assert.equal(b.best('Will the owner get an email?').id, 'setup-who-sees', type);
    assert.equal(b.topic('tour-one-trip-season'), undefined, type);
  }
});

test('5. "by booking only" keeps the weekly hours for "Add my hours" (every type with that choice); the year question shows the earlier answer', async () => {
  // The setup script: the week is kept before it is cleared, and put back when the hours are opened again.
  assert.match(CLIENT, /function weekKeep\(\)\{ return S\.week && DAYS\.some\(function\(d\)\{ return S\.week\[d\] && S\.week\[d\]\.length; \}\) \? clone\(S\.week\) : null; \}/);
  assert.match(CLIENT, /var keptWeek = weekKeep\(\);\n    var ch = \{ hours: none, hours_checked: true \};/);
  assert.match(CLIENT, /weekKept\(keptWeek\); AI\.visit = 'appointment';/);
  assert.match(CLIENT, /var keptWeek2 = apptClear \? weekKeep\(\) : null;/);
  assert.match(CLIENT, /if \(apptClear\) \{ weekKept\(keptWeek2\);/);
  assert.match(CLIENT, /if \(!seas && APPT\) weekRestore\(\);/);
  assert.match(CLIENT, /sessionStorage\.setItem\('suWeekKept:' \+ C\.base, JSON\.stringify\(w\)\)/);
  assert.match(CLIENT, /S\.weekBack && T\.hoursBack \? '<p class="su-sent" id="suHoursBack">'/);
  // weekRestore never overwrites hours that are there, and puts the kept week back once.
  const src = /  function weekRestore\(\)\{[\s\S]*?\n  \}\n/.exec(CLIENT)[0];
  const run = (S, stored) => { const ctx = { S, C: { base: '/owner/x' }, DAYS, clone: (x) => JSON.parse(JSON.stringify(x)), window: { sessionStorage: { getItem: () => stored || null, removeItem() {} } } }; vm.createContext(ctx); vm.runInContext(`${src}; var out = weekRestore();`, ctx); return ctx.out; };
  const kept = WK('08:30', '17:00', ['sat', 'sun']);
  const s1 = { week: Object.fromEntries(DAYS.map((d) => [d, null])), weekKept: kept };
  assert.equal(run(s1), true);
  assert.deepEqual(s1.week.mon, [['08:30', '17:00']]);
  assert.equal(s1.week.sat, null);
  assert.equal(s1.weekKept, null);
  assert.equal(s1.weekBack, true);
  const s2 = { week: WK('10:00', '16:00'), weekKept: kept };
  assert.equal(run(s2), false);
  assert.deepEqual(s2.week.mon, [['10:00', '16:00']]);
  const s3 = { week: Object.fromEntries(DAYS.map((d) => [d, null])), weekKept: null };
  assert.equal(run(s3, JSON.stringify(kept)), true, 'kept across a reload of the tab');
  assert.equal(run({ week: Object.fromEntries(DAYS.map((d) => [d, null])), weekKept: null }), false);
  assert.equal(text.en.hoursBack, 'We put back the hours you had before. Check them, then save.');
  assert.match(text.fr.hoursBack, /^Nous avons remis les heures que vous aviez/);
  // The year question on the by-booking path: the earlier "Yes, all year" shows as picked.
  assert.match(CLIENT, /\(S\.savedWYear === 'all' && T\.youSaid \? '<p class="su-sent" id="suYearSaid">' \+ h\(fill\(T\.youSaid, \{ a: T\.yearNoSetYes \}\)\) \+ '<\/p>' : ''\) \+ big\('✓', T\.yearNoSetYes, '', false, 'noSetAll', S\.savedWYear === 'all' \? ' aria-pressed="true"' : ''\)/);
  // What the server keeps: the hours come back with one save, and "by booking only" is off again.
  const v = mk('tour', { name: 'Back Again Tours Wr3', cuisine: 'Boat tours', hours: JSON.stringify(WK('08:30', '17:00', ['sat', 'sun'])) });
  const t = tokenFor(v.id);
  ok(await change(t, { hours: NONE, hours_checked: true, tour_info: { visit: 'appointment' } }));
  ok(await change(t, { tour_info: { year: 'all' } }));
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).cur.tour_info.year, 'all');
  ok(await change(t, { hours: WK('08:30', '17:00', ['sat', 'sun']), hours_checked: true, tour_info: { visit: null } }));
  assert.equal(tourInfo(v.id).visit, undefined);
  assert.match(String(app.getVenue(v.id).hours), /"mon":\[\["08:30","17:00"\]\]/);
});

test('6. public category words: short page words per kind, never a side of a chip her words don’t say; the same set on the preview, the cards and both pages', async () => {
  const kt = app.tourKindsText;
  // Karen: research "Helicopter tours, heli-skiing & heli-hiking", Scenic or helicopter flights + Heli-skiing + Something else.
  assert.equal(kt(['flight', 'heli', 'other'], false, 'Helicopter tours, heli-skiing & heli-hiking'), 'Helicopter flights, Heli-skiing & Heli-hiking');
  assert.equal(kt(['flight', 'heli', 'other'], true, 'Helicopter tours, heli-skiing & heli-hiking'), 'Vols en hélicoptère, Héliski et Heli-hiking');
  // A chip that covers several things: only the side her words name; all of it when they name none or every side.
  assert.equal(kt(['flight'], false, ''), 'Helicopter & scenic flights');
  assert.equal(kt(['flight'], true, ''), 'Vols en hélicoptère et panoramiques');
  assert.equal(kt(['flight'], false, 'Floatplane tours'), 'Scenic flights');
  assert.equal(kt(['flight'], true, 'Floatplane tours'), 'Vols panoramiques');
  assert.equal(kt(['heli'], false, 'Heli-skiing'), 'Heli-skiing');
  assert.equal(kt(['heli'], false, ''), 'Heli-skiing');
  assert.equal(kt(['snowshoe'], false, 'Snowshoe tours'), 'Snowshoeing');
  assert.equal(kt(['snowshoe'], false, ''), 'Snowshoe & ski touring');
  assert.equal(kt(['paddle'], false, ''), 'Kayak, canoe & SUP');
  assert.equal(kt(['walking', 'food'], false, 'Ghost walks & food tours'), 'Walking tours & Food tours');
  assert.equal(kt(['walking'], false, ''), 'Walking & history tours');
  assert.equal(kt(['snowmobile', 'adventure'], true, 'Snowmobile & ATV tours'), 'Motoneige et Sorties en quad (VTT)');
  // Unchanged: her own fuller words, the "and" chips, nothing picked.
  assert.equal(kt(['snowmobile', 'adventure'], false, 'Snowmobile & ATV tours'), 'Snowmobile tours & ATV tours');
  assert.equal(kt(['adventure'], false, ''), 'ATV, bungee, climbing or canyoning');
  assert.equal(kt(['wildlife'], false, 'Whale watching'), 'Wildlife and bear viewing');
  assert.equal(kt(['raft'], false, 'Rafting'), 'Rafting');
  assert.equal(kt(['other'], false, 'ATV tours'), '');
  // No page word says "or": the question's wording stays on the chips.
  for (const k of Object.keys(app.TOUR_KIND_PUBLIC)) for (const w of (app.TOUR_KIND_PUBLIC[k].words || [])) assert.doesNotMatch(w, / (?:or|ou) /, k);
  assert.equal(app.TOUR_KIND_LABELS_OWNER.flight[0], 'Scenic or helicopter flights');
  // The whole way through: saved kinds -> the listing's words, the save's answer, the setup's preview, the cards, the pages.
  const { v, t } = karen();
  const saved = ok(await change(t, { tour_info: { kinds: ['flight', 'heli', 'other'], length: '1h', year: 'all', age: 'all' } }));
  const EN = 'Helicopter flights, Heli-skiing & Heli-hiking', FR = 'Vols en hélicoptère, Héliski et Heli-hiking';
  assert.equal(app.getVenue(v.id).cuisine, EN);
  if (saved.body.tour_words) assert.deepEqual(saved.body.tour_words, { en: EN, fr: FR });
  const again = ok(await change(t, { tour_info: { kinds: ['flight', 'heli', 'other'], length: '1h', year: 'all', age: 'all', book: '48h' } }));
  assert.deepEqual(again.body.tour_words, { en: EN, fr: FR });
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).tourWords, EN);
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).tourWords, FR);
  assert.match(CLIENT, /\+ h\(\[S\.tourWords \|\| C\.tourWords \|\| \(TI\.kinds \|\| \[\]\)\.filter\(function\(k\)\{ return k !== 'other'; \}\)\.map\(tourKindName\)\.join\(', '\) \|\| C\.typeLabel, C\.regionLabel,/);
  assert.match(CLIENT, /if \(j\.tour_words\) S\.tourWords = j\.tour_words\[C\.lang === 'fr' \? 'fr' : 'en'\] \|\| S\.tourWords;/);
  const cardOf = (html) => (html.split('<li class="venue-card"').slice(1).find((x) => x.includes(K)) || '');
  const cardEn = plain(cardOf((await get('/penticton/tours')).text)), cardFr = plain(cardOf((await get('/fr/penticton/tours')).text));
  assert.ok(cardEn.includes(EN), cardEn.slice(0, 400));
  assert.ok(cardFr.includes(FR), cardFr.slice(0, 400));
  assert.doesNotMatch(cardFr, /Heli-skiing/);
  assert.doesNotMatch(cardEn + cardFr, /cat-skiing|Scenic or helicopter/i);
  assert.equal(app.frCuisineShown(EN), FR);
  assert.equal(app.tourCuisineFr(EN), FR);
  const pEn = plain(page(v, 'en')), pFr = plain(page(v, 'fr'));
  assert.ok(pEn.includes(EN), 'the English page');
  assert.ok(pFr.includes(FR), 'the French page');
  assert.doesNotMatch(pFr, /Helicopter flights, Heli-skiing/);
  // Build My Trip still reads the new words.
  assert.deepEqual(names(await plan('Scenic flight in Penticton on July 14 2027')), [K]);
});

test('7. length: "Up to 1 hour" first, on the page too; research’s range starts on the shortest, with the usual note', async () => {
  assert.equal(text.en.tour.tlengths['1h'], 'Up to 1 hour');
  // Port of whistlerroam #184: the finish screen's line under the % says tours, not "your place"; other types and French (no "place" word) as they were.
  assert.equal(text.en.tour.pctRaise, 'Add more about your tours to raise it.');
  assert.equal(text.en.pctRaise, 'Add more about your place to raise it.');
  assert.equal(text.fr.tour.pctRaise, undefined);
  assert.equal(text.fr.pctRaise, 'Ajoutez plus de détails pour l’augmenter.');
  assert.match(text.fr.tour.tlengths['1h'], /^Jusqu’à 1\sheure$/);
  assert.deepEqual(Object.keys(text.en.tour.tlengths), ['1h', '2-3h', 'half', 'full', 'multi']);
  const { v, t } = karen();
  ok(await change(t, { tour_info: { kinds: ['flight', 'heli', 'other'], length: '1h', year: 'all', age: 'all' } }));
  const lines = app.tourVisitLines(app.getVenue(v.id));
  assert.equal(lines['Time needed'].en, 'Up to 1 hour.');
  assert.equal(lines['Time needed'].fr, 'Jusqu’à 1 heure.');
  assert.match(plain(page(v, 'en')), /Time needed Up to 1 hour\./);
  assert.match(plain(page(v, 'fr')), /Jusqu’à 1 heure\./);
  // Research's line as the starting pick: the shortest length it names.
  const rl = (txt) => { const o = mk('tour', { cuisine: 'Boat tours' }); db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(o.id, JSON.stringify({ rows: [{ label: 'Time needed', text: txt }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' })); return { o, len: app.tourResearchLength(app.getVenue(o.id)) }; };
  assert.equal(rl('20 minutes to a full day').len, '1h');
  assert.equal(rl('Half-day and full-day trips').len, 'half');
  assert.equal(rl('2 to 3 hours').len, '2-3h');
  assert.equal(rl('Full day (8 hours)').len, 'full');
  assert.equal(rl('3 days and 2 nights').len, 'multi');
  assert.equal(rl('45 minutes').len, '1h');
  assert.equal(rl('Allow some time').len, '');
  const fresh = rl('20 minutes to a full day').o;
  const c = cfgOf((await get(`/owner/${tokenFor(fresh.id)}/setup`)).text);
  assert.equal(c.researchLength, '1h');
  assert.equal(c.t.tlengths['1h'], 'Up to 1 hour');
  assert.match(CLIENT, /S\.tour\.lengthGuessed && S\.tour\.length === C\.researchLength && T\.guessCheck \? '<p class="su-sent su-research" id="suLengthGuess">'/);
  assert.match(c.t.tlengthNeed, /Pick your shortest/);
});

test('8. every price box takes words after the number', async () => {
  for (const [typed, want] of [['$189.00 per person', 189], ['189 pp', 189], ['189 $ par personne', 189], ['$1,500 per group', 1500], ['1 500 $ par personne', 1500], ['129 each', 129], ['12.50/person', 12.5], ['$129', 129], ['129 $', 129], ['1,500', 1500]]) {
    assert.deepEqual(app.cleanTourPrice(typed), { value: want }, typed);
  }
  for (const bad of ['per person', 'call us', '0', '-5', '25000']) assert.ok(app.cleanTourPrice(bad).error, bad);
  const { v, t } = karen();
  ok(await change(t, { tour_price: '$189.00 per person' }));
  assert.equal(app.tourPrice(v.id), 189);
  // The setup's own reader, as the page runs it.
  const head = /  function moneyHead\(x\)\{.*\}\n/.exec(CLIENT)[0], read = /  function tourPriceRead\(x\)\{.*\}\n/.exec(CLIENT)[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(`${head}${read}`, ctx);
  const rd = (x) => vm.runInContext(`tourPriceRead(${JSON.stringify(x)})`, ctx);
  for (const [typed, want] of [['$189.00 per person', 189], ['189 pp', 189], ['189 $ par personne', 189], ['189 $ par personne', 189], ['1 500 $ par personne', 1500], ['$1,500 CAD', 1500], ['CA$189 per person', 189], ['129 each', 129], ['12.50/person', 12.5], ['12,50 $', 12.5], ['3900+', 3900], ['129', 129], ['', null]]) assert.equal(rd(typed), want, typed);
  for (const bad of ['per person', 'abc']) assert.ok(Number.isNaN(rd(bad)), bad);
  // Tasting, flight and cocktail boxes read through it too, and no price box cuts the typing at 8 or 10 characters.
  const tail = "String(x).trim().replace(/^(\\$?\\s*\\d[\\d.,]*\\s*\\$?)\\s*[\\/+(A-Za-z\\u00c0-\\u024f].*$/, '$1').trim().replace(";
  assert.ok(CLIENT.includes(`if ((x = v('suFee')) !== null && C.brewery) { var f = ${tail}`), 'flight price box');
  assert.ok(CLIENT.includes(`if ((x = v('suFee')) !== null) { var f = ${tail}`), 'tasting price box');
  assert.ok(CLIENT.includes(`if ((x = v('suCfee')) !== null && CK) { var cf = ${tail}`), 'cocktail price box');
  const feeRead = (x) => { const f = String(x).trim().replace(/^(\$?\s*\d[\d.,]*\s*\$?)\s*[\/+(A-Za-z\u00c0-\u024f].*$/, '$1').trim().replace(/^\$\s*/, '').replace(/\s*\$$/, '').replace(',', '.'); return f === '' ? null : /^\d{1,3}(\.\d{1,2})?$/.test(f) ? +f : NaN; };
  for (const [typed, want] of [['$15', 15], ['15 $', 15], ['$15 per flight', 15], ['12 dollars', 12], ['12,50 $ par personne', 12.5], ['10 each', 10], ['', null]]) assert.equal(feeRead(typed), want, typed);
  assert.equal((CLIENT.match(/mode: 'decimal', max: 40 \}/g) || []).length, 5);
  assert.doesNotMatch(CLIENT, /mode: 'decimal', max: (?:8|10) \}/);
  assert.equal(text.en.tour.tpriceNeed, 'Just the number, like 189.');
  assert.match(text.fr.tour.tpriceNeed, /^Seulement le chiffre, par exemple 189\.$/);
});

test('9. the price note says "per person" with the limit from the config; a held price says "We’re checking $3,900" right after saving; a private price stays live', async () => {
  const { v, t } = karen();
  assert.equal(text.en.tour.tpriceOver, 'A price per person over {n} is checked first and shows within a day.');
  assert.match(text.fr.tour.tpriceOver, /^Un prix par personne de plus de \{n\} est vérifié d’abord/);
  assert.match(CLIENT, /h\(fill\(T\.tpriceOver, \{ n: tourMoney\(C\.feeLiveMax \|\| 1000\) \}\)\)/);
  assert.doesNotMatch(CLIENT, /'1\\u00a0000' : '1,000'/);
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c.feeLiveMax, app.TOUR_PRICE_LIVE_MAX);
  // The message on the next screen, with the amount.
  assert.match(text.en.tour.tpriceSavedDay, /^We’re checking \{x\}\. A price per person over \{n\} is checked first/);
  assert.match(text.fr.tour.tpriceSavedDay, /^Nous vérifions \{x\}\./);
  assert.match(CLIENT, /S\.savedLine\.price = pp > \(C\.feeLiveMax \|\| 1000\) && pp !== S\.savedTourPrice \? fill\(T\.tpriceSavedDay, \{ x: tourMoney\(pp\), n: tourMoney\(C\.feeLiveMax \|\| 1000\) \}\) : T\.tpriceSavedLive;/);
  // 3900 in the per-person box waits; the same number as a private price is live at once (Dayton's decision).
  ok(await change(t, { tour_price: 189 }));
  const held = ok(await change(t, { tour_price: 3900 }));
  assert.deepEqual(held.body.review, ['tour_price']);
  assert.equal(app.tourPrice(v.id), 189);
  assert.equal(app.ownerTourPriceWaiting(v.id), 3900);
  ok(await change(t, { tour_price: 189 }));
  const priv = ok(await change(t, { tour_info: { private: 3900 } }));
  assert.deepEqual(priv.body.live, ['tour_info']);
  assert.match(plain(page(v, 'en')), /From \$189 a person\. Private tours from \$3,900\./);
  assert.match(text.en.tour.tprivLead, /It shows on your page right away/);
  assert.match(text.fr.tour.tprivLead, /Il s’affiche sur votre page tout de suite/);
});

test('10. the venue page’s short "Tours & prices" list keeps its section names; a restaurant’s short menu is unchanged', async () => {
  const { v } = karen();
  const data = { sections: [
    { name: 'Year-round', items: [{ name: 'Valley scenic flight', price: '$189' }, { name: 'Glacier landing', price: '$349' }] },
    { name: 'Winter', items: [{ name: 'Heli-skiing day', price: '$1,650' }] },
    { name: 'Summer', items: [{ name: 'Heli-hiking', price: '$495' }] },
    { name: 'Private', items: [{ name: 'Private charter', price: '$3,900' }] }] };
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(v.id, JSON.stringify(data));
  const en = page(v, 'en');
  for (const s of ['Year-round', 'Winter', 'Summer', 'Private']) assert.ok(en.includes(`<li class="vm-sub">${s}</li>`), s);
  assert.match(plain(en), /Tours & prices Year-round Valley scenic flight \$189 Glacier landing \$349 Winter Heli-skiing day \$1,650 Summer Heli-hiking \$495 Private Private charter \$3,900/);
  assert.match(plain(page(v, 'fr')), /Sorties et tarifs Year-round Valley scenic flight 189 \$/);
  // One section (or none named): no heading over it.
  const one = mk('tour', { cuisine: 'Boat tours' });
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(one.id, JSON.stringify({ sections: [{ name: 'Cruises', items: [{ name: 'Sunset cruise', price: '$79' }] }] }));
  assert.doesNotMatch(page(one, 'en'), /class="vm-sub"/);
  // A restaurant's short menu stays its first dishes, no section names.
  const r = mk('restaurant', { cuisine: 'Italian' });
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(r.id, JSON.stringify({ sections: [{ name: 'Starters', items: [{ name: 'Soup', price: '$9' }] }, { name: 'Mains', items: [{ name: 'Pasta', price: '$24' }] }] }));
  const rp = page(r, 'en');
  assert.ok(rp.includes('Soup') && rp.includes('Pasta'));
  assert.doesNotMatch(rp, /class="vm-sub"/);
  assert.match(SERVER, /if \(first && venue\.type === 'tour' && s\.name && menu\.data\.sections\.length > 1\) secOf\.set\(it, String\(s\.name\)\);/);
});

test('11. a card says a holiday closure once (Dec 25); a notice shown ahead of time stays', () => {
  const tag = '<p class="season-tag season-tag-temp_closed"><span aria-hidden="true">x</span> Closed Dec 25, reopens Dec 26.</p>';
  // A closure of several days keeps its line (it gives the dates).
  const range = '<li class="venue-card"><p class="season-tag season-tag-temp_closed"><span aria-hidden="true">x</span> Closed Oct 21\u201328, reopens Oct 29.</p></li>';
  assert.match(app.cardSeasonOnce(range, { state: 'closed', text: 'Closed today (temporary closure) · Opens Thu, Oct 29' }), /season-tag-temp_closed/);
  const chunk = `<li class="venue-card" data-venue-category="tour">${tag}</li>`;
  const today = { state: 'closed', text: 'Closed today (Christmas Day) · Opens tomorrow 7 AM' };
  assert.equal(app.statusSaysClosureToday(today), true);
  assert.doesNotMatch(app.cardSeasonOnce(chunk, today), /season-tag-temp_closed/);
  assert.doesNotMatch(app.cardSeasonOnce(chunk.replace('tour', 'restaurant'), { state: 'closed', text: 'Closed today (holiday) · Opens tomorrow 11 AM' }), /season-tag-temp_closed/);
  // An ordinary closed day, or an open one, keeps the notice of the closure that is coming.
  for (const line of [{ state: 'closed', text: 'Closed today · Opens tomorrow 9 AM' }, { state: 'open', text: 'Open now · Closes 5 PM' }, { state: 'closed', text: 'Closed today (Christmas Day)' }, null]) {
    assert.equal(app.statusSaysClosureToday(line), false, JSON.stringify(line));
    assert.match(app.cardSeasonOnce(chunk, line), /season-tag-temp_closed/, JSON.stringify(line));
  }
  // The seasonal case (tour test 1) still holds.
  const closed = '<li class="venue-card"><p class="season-tag season-tag-closed"><span>⏸</span> Closed · reopens December 15</p></li>';
  assert.doesNotMatch(app.cardSeasonOnce(closed, { state: 'seasonal', text: 'Closed for the season · Reopens Dec 15' }), /season-tag-closed/);
  assert.match(SERVER, /&& !\(cardSeasonTag && cardSeasonTag\.kind === 'temp_closed' && cardSeasonTag\.current && cardSeasonTag\.from === cardSeasonTag\.to && statusSaysClosureToday\(opts\.statusLine\)\)/);
});

test('11b. on Dec 25 the tours page card has one closed line (EN + FR)', async () => {
  const { v, t } = karen();
  ok(await change(t, { hours: WK('09:00', '17:00'), hours_checked: true }));
  const y = Number(app.todayLocal().slice(0, 4)) + (app.todayLocal().slice(5) > '12-20' ? 1 : 0);
  ok(await change(t, { closures: [{ from: `${y}-12-25`, to: `${y}-12-25`, note: 'Christmas Day' }] }));
  const RealDate = Date;
  const at = new RealDate(`${y}-12-25T19:00:00Z`).getTime(), off = at - RealDate.now();
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + off); else super(...a); } static now() { return RealDate.now() + off; } }
  global.Date = FakeDate;
  try {
    for (const lang of ['en', 'fr']) {
      const html = (await get(`${lang === 'fr' ? '/fr' : ''}/penticton/tours`)).text;
      const card = plain(html.split('<li class="venue-card"').slice(1).find((x) => x.includes(K)) || '');
      assert.match(card, lang === 'fr' ? /Fermé aujourd’hui \(Noël\)/ : /Closed today \(Christmas Day\) · Opens tomorrow/, card.slice(0, 500));
      assert.doesNotMatch(card, /Closed Dec 25, reopens|Fermé le 25 déc/, card.slice(0, 600));
    }
  } finally { global.Date = RealDate; }
});

test('12. wording: trips, tours and the meeting spot; the year screen’s last button; the edit page; Known for from research; her Groups line', async () => {
  const E = text.en.tour, F = text.fr.tour;
  assert.equal(E.photosQ, 'Add photos of your trips');
  assert.equal(E.moreOpt, 'Add more about your tours');
  assert.equal(E.moreQ, 'More about your tours');
  assert.match(E.moreProg, /^More about your tours · /);
  assert.equal(E.pinLead, 'If not, drag it to your meeting spot.');
  assert.match(E.noGps, /Drag the pin to your meeting spot\.$/);
  assert.match(E.needPin, /drag the pin to your meeting spot\.$/);
  assert.match(F.pinLead, /point de rencontre/);
  assert.match(F.moreQ, /^Plus de détails sur votre entreprise$/);
  assert.equal(E.storyLabel, 'About your tours');
  // Other types keep their words.
  assert.equal(text.en.photosQ, 'Add photos of your place');
  assert.equal(text.en.moreQ, 'More about your place');
  assert.match(text.en.noGps, /Drag the pin to your door\.$/);
  const c = cfgOf((await get(`/owner/${karen().t}/setup`)).text);
  assert.equal(c.t.photosQ, 'Add photos of your trips');
  assert.equal(c.t.moreQ, 'More about your tours');
  assert.equal(c.t.pinLead, 'If not, drag it to your meeting spot.');
  // The year screen with other hours stored: the last button says what it does (every type).
  assert.equal(text.en.allYearSame, 'Same hours all year (removes your other hours)');
  assert.match(text.fr.allYearSame, /^Mêmes heures toute l’année \(retire vos autres heures\)$/);
  assert.equal(text.en.allYearYes, 'Yes, all year');
  assert.match(CLIENT, /big\(stS\.length && T\.yearKeep \? '✕' : '✓', stS\.length && T\.yearKeep && T\.allYearSame \? T\.allYearSame : T\.allYearYes, '', !!\(stS\.length && T\.yearKeep\), 'yearAll'\)/);
  assert.match(text.en.yearAllDropLead, /“Same hours all year” removes them\.$/);
  // The edit page of a tour: trips worth booking, no "Open past midnight?"; a restaurant's is as it was.
  const tourEdit = (await get(`/owner/${karen().t}`)).text;
  assert.match(tourEdit, /A few sentences about what makes your trips worth booking\./);
  assert.doesNotMatch(tourEdit, /Open past midnight\? Just enter/);
  assert.doesNotMatch(tourEdit, /add more about your place/i);
  const rest = mk('restaurant', { cuisine: 'Italian' });
  const restEdit = (await get(`/owner/${tokenFor(rest.id)}`)).text;
  assert.match(restEdit, /A few sentences about what makes your place worth a visit\./);
  assert.match(restEdit, /Open past midnight\? Just enter the real closing time/);
  assert.match((await get(`/fr/owner/${karen().t}`)).text, /Quelques phrases sur ce qui donne envie de réserver vos sorties\./);
  // Research's Known for line, untouched, says it came from online (tours only: the words exist only there).
  assert.match(E.knownGuess, /^We found this online\./);
  assert.match(F.knownGuess, /^Nous avons trouvé ceci en ligne\./);
  assert.equal(text.en.knownGuess, undefined);
  assert.match(CLIENT, /\(T\.knownGuess && !!S\.brew\.known && S\.brew\.known === \(\(CUR\.visit_rows \|\| \{\}\)\.known_for \|\| ''\) && \(C\.visitResearch \|\| \[\]\)\.indexOf\('known_for'\) >= 0 \? '<p class="su-sent su-research" id="suKnownGuess">'/);
  // Her one line set aside by a full box shows open on a tour's page (it sat under "More: groups"); a winery's stays folded.
  const rows = ['Known for', 'Time needed', 'Prices', 'Booking', 'Ages', 'Season', 'Good to know'].map((l) => ({ label: l, text: `${l} line` }));
  const info = { rows, owner_labels: rows.map((r) => r.label).concat(['Groups']), winery_labels: ['Ages', 'Booking', 'Prices', 'Season', 'Time needed'], owner_dropped: [{ label: 'Groups', text: 'Up to 5 guests per helicopter.', owned: true }] };
  const tourBox = app.visitInfoHtml(info, false, { type: 'tour' });
  assert.ok(tourBox.includes('Up to 5 guests per helicopter.'));
  assert.doesNotMatch(tourBox, /<details class="visit-more">/);
  const wineBox = app.visitInfoHtml(info, false, { type: 'winery' });
  assert.match(wineBox, /<details class="visit-more"><summary>More: groups<\/summary>/);
  // Two set aside still fold (one "More" for both).
  const two = app.visitInfoHtml({ ...info, owner_labels: info.owner_labels.concat(['Parking']), owner_dropped: info.owner_dropped.concat([{ label: 'Getting there', text: 'Ten minutes north of town.', owned: true }]) }, false, { type: 'tour' });
  assert.match(two, /<details class="visit-more">/);
});

test('the other setups still load, and their words are as they were', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail', 'tour']) {
    const o = mk(type, { cuisine: type === 'winery' ? 'Winery' : type === 'tour' ? 'Boat tours' : 'Canadian' });
    for (const lang of ['', '/fr']) {
      const r = await get(`${lang}/owner/${tokenFor(o.id)}/setup`);
      assert.equal(r.status, 200, `${type} ${lang}`);
      const c = cfgOf(r.text);
      assert.ok(c.t.allYearSame, `${type} ${lang}`);
      assert.ok(c.t.hoursBack, `${type} ${lang}`);
      if (type !== 'tour') { assert.equal(c.t.knownGuess, undefined, type); assert.doesNotMatch(String(c.t.moreQ), /tours|entreprise/, type); }
    }
  }
  // Happy hour is never asked of a tour.
  const tourCfg = cfgOf((await get(`/owner/${karen().t}/setup`)).text);
  assert.ok(!tourCfg.allSteps.includes('happy'));
});
