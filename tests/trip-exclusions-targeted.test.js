'use strict';
// Build My Trip (2026-11-24, Dayton's report at 390px). The request:
//   "Plan a two-day anniversary getaway in Peachland for two adults on June 12–13, 2027. We want a lake-view dinner, a
//    relaxed boat tour and a hotel for one night. One of us is vegetarian and we would like to avoid wineries."
// chose a winery's restaurant and marked a camp and a water-bike rental as boat-tour matches. The follow-up:
//   "Please replace the winery restaurant with a lake-view dinner that is not at a winery, and replace the water bikes
//    with a relaxing guided boat tour. Keep it vegetarian-friendly."
// left the winery restaurant, swapped the water bikes for a boat rental, took a beach trail off the plan, and its reply
// spoke of finding a winery and of keeping a sushi place.
// Here: explicit exclusions (trip-exclusions.js), "at a winery" from stored data, a guided boat tour by the listing's
// own facts (trip-requirements.js), each replacement on its own stop, a reply that says what happened, and the shared
// copy saying the same. Fixture listings only; no network; the word rules only (no AI reader).
// The same file runs on whistlerroam.com, where the kind ruled out is a brewery.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const X = require('../trip-exclusions.js');
const TR = require('../trip-requirements.js');
const HP = require('../trip-honest-plan.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
// The kind of place ruled out, in the site's own country: wineries in the Okanagan, breweries in Whistler.
const HOST = WR ? 'brewery' : 'winery', HOSTS = WR ? 'breweries' : 'wineries';
// A town with no vegetarian place to eat and no boat tour of its own in the seed data, and the next town.
const REGION = WR ? 'callaghan-valley' : 'peachland', TOWN = WR ? 'Callaghan Valley' : 'Peachland';
const REGION2 = WR ? 'whistler' : 'west-kelowna', TOWN2 = WR ? 'Whistler' : 'West Kelowna';
const AT = WR ? [50.139, -123.114] : [49.7791, -119.7367];
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const REQ = `Plan a two-day anniversary getaway in ${TOWN} for two adults on June 12–13, 2027. We want a lake-view dinner, a relaxed boat tour and a hotel for one night. One of us is vegetarian and we would like to avoid ${HOSTS}.`;
const FOLLOW = `Please replace the ${HOST} restaurant with a lake-view dinner that is not at a ${HOST}, and replace the water bikes with a relaxing guided boat tour. Keep it vegetarian-friendly.`;
// The request the owner's on-screen plan could have come from before this fix: the same trip, said without the rule.
const REQ_OPEN = REQ.replace(` and we would like to avoid ${HOSTS}`, '');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${500 + n} Exclusion Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 4000, longitude: AT[1], description: 'A place used only by the exclusion tests. Open all year.', slug: `exc-test-${key.toLowerCase()}`, website: `https://exc-${key.toLowerCase()}.example.com/`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const EAT = { type: 'restaurant', price: 2, hours: HOURS, vegetarian: 1, lake_view: 1 };
test.before(() => {
  // A winery (a brewery in Whistler) and the restaurant AT it: the same street address, the same website host, a
  // few metres apart, and its own words say so.
  mk('HOSTV', { type: HOST, name: `Fixture Lakeshore Estate ${WR ? 'Brewing Company' : 'Winery'} EXC`, address: `4100 Fixture Lakeshore Road, ${TOWN}, BC`, website: 'https://fixture-lakeshore-estate.example.com/', lake_view: 1, hours: HOURS, latitude: AT[0] + 0.004, description: 'Tastings on a patio above the lake. Open all year.' });
  mk('HOSTREST', { ...EAT, price: 3, name: 'Fixture Vine Room EXC', address: `4100 Fixture Lakeshore Road, ${TOWN}, BC`, website: 'https://fixture-lakeshore-estate.example.com/dining/', latitude: AT[0] + 0.0041,
    description: `The Vine Room is the fine-dining room at Fixture Lakeshore Estate ${WR ? 'Brewing Company' : 'Winery'}, with sweeping lake views and a vegetarian tasting menu. Open all year.` });
  mk('VEG1', { ...EAT, name: 'Fixture Lakeview Table EXC', description: 'A lakefront dining room with a vegetarian menu. Open all year.' });
  mk('VEG2', { ...EAT, name: 'Fixture Shoreline Kitchen EXC', description: 'A casual kitchen on the shoreline with vegetarian plates. Open all year.' });
  mk('VEG3', { ...EAT, name: 'Fixture Pier Bistro EXC', description: 'A bistro by the pier with vegetarian choices and lake views. Open all year.' });
  mk('SUSHI', { ...EAT, name: 'Fixture Sushi Cabana EXC', cuisine: 'Japanese', description: 'Sushi from a beachside cabana, with vegetarian rolls. Open all year.' });
  mk('BIKES', { type: 'tour', name: 'Fixture Water Bikes EXC', hours: HOURS, lake_view: 1, description: 'Fixture Water Bikes rents pedal-powered water bikes on the waterfront, a fun way to cruise along the shoreline without a paddle. Open all year.' });
  mk('RENTAL', { type: 'tour', name: 'Fixture Premium Boat Rentals EXC', hours: HOURS, lake_view: 1, description: 'Rents near-new watercraft for a day on the lake: wake boats, bowriders, pontoons, kayaks and pedal boats. No boating licence is needed. Open all year.' });
  mk('CAMP', { type: 'outdoor', name: 'Fixture Family Camp EXC', hours: HOURS, lake_view: 1, description: 'An old-fashioned fishing and camping camp. Summer means fishing, boating and canoeing, with lakeside cabins. Open all year.' });
  mk('TRAIL', { type: 'outdoor', name: 'Fixture Beach Trail EXC', hours: HOURS, description: 'A winding gravel path through the woods to a quiet sandy beach. Open all year.' });
  // The next town: a guided boat tour by its own words (captained cruises), about 5 km away.
  mk('BOAT', { region: REGION2, type: 'tour', name: 'Fixture Lake Cruises EXC', hours: HOURS, latitude: AT[0] + 0.045, address: `12 Fixture Marina Way, ${TOWN2}, BC`, description: 'Fixture Lake Cruises runs private, captained pontoon tours on the lake, from relaxed daytime cruises to sunset outings. Open all year.' });
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Lakeside Hotel EXC' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(F.HOTEL.id, JSON.stringify({ max_guests: 4, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/fixture-lakeside-exc.html', own: 'https://exc-hotel.example.com/book' } }), '2026-11-24T00:00:00Z', 'test-exc');
});
test.after(() => {
  app.setTripChatReader(null);
  if (F.HOTEL) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F.HOTEL.id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const run = (text) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text }, { v4: true, stays: true }).value, v4: true }, true);
const stopsOf = (p) => (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue).map((s) => { const r = (p.schedule || []).find((x) => x.day === d.day && x.venueId === s.venue.id); return { key: `${d.day}-${s.daypart}`, id: s.venue.id, name: s.venue.name, type: s.venue.type, ...(r && Number.isInteger(r.startMinutes) ? { start: r.startMinutes } : {}) }; }));
const DATES = ['2027-06-12', '2027-06-13'];
// The plan on the traveller's screen before this fix, as the owner described it: a camp, the winery's restaurant, a
// beach trail and a sushi dinner on day 1; water bikes and a lunch on day 2.
const SCREEN = () => [
  { key: '1-morning', id: F.CAMP.id, start: 570 }, { key: '1-midday', id: F.SUSHI.id, start: 690 }, { key: '1-afternoon', id: F.TRAIL.id, start: 810 }, { key: '1-evening', id: F.HOSTREST.id, start: 1050 },
  { key: '2-morning', id: F.BIKES.id, start: 540 }, { key: '2-midday', id: F.VEG2.id, start: 720 },
];
const say = async (message, o = {}) => {
  const v = app.parseTripChatBody({ message, lang: o.lang || 'en', plan: { text: o.text || REQ, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: o.stops || SCREEN(), dayDates: DATES, tripSource: 'request', stayId: F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) }, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const slots = (list) => Object.fromEntries(list.map((s) => [s.key, [s.id, s.start]]));
const at = (p) => slots(tc.planStops(p));
const linksOf = (p) => { const w = p.whereToStay || {}; return [w.pick, ...(w.alternatives || [])].filter(Boolean).flatMap((c) => [...(c.bookingLinks || []), ...(c.bookingLinks2 || [])]); };
// Every link a stop carries is the listing's own stored link or its page on this site: never a search or a map.
const storedLinks = (p) => {
  for (const d of p.days || []) for (const s of d.stops || []) {
    if (!s.venue) continue;
    const row = db.prepare('SELECT website, slug, region FROM venues WHERE id = ?').get(s.venue.id);
    for (const u of [s.venue.website, s.venue.bookingUrl, s.bookingLink && s.bookingLink.url].filter(Boolean)) {
      assert.ok(!/google\.[a-z.]+\/(?:maps|search)|maps\.apple|bing\.com\/(?:maps|search)|[?&]q=/.test(u), u);
      assert.ok(String(u).startsWith(String(row.website).replace(/\/$/, '')) || u === row.website, `${s.venue.name}: ${u} is not its stored link`);
    }
    if (s.venue.url) assert.match(s.venue.url, new RegExp(`^/(?:fr/)?${row.region}/[a-z-]+/${row.slug}$`));
  }
};
// Nothing in a reply speaks of adding or finding the kind ruled out, or of keeping a stop nobody named.
const TRUE_REPLY = (reply) => {
  assert.doesNotMatch(reply, new RegExp(`(?:find|found|add(?:ed)?|couldn’t find) (?:a|an|another) ${HOST}\\b`, 'i'), reply);
  assert.doesNotMatch(reply, /\bKept [A-Z]|\b[Kk]eeping\b|Sushi Cabana|Took out|\bAdded\b/, reply);
  assert.doesNotMatch(reply, /\bavailable\b|\bavailability\b|relaxing|relaxed/i, reply);
};

test('1. exclusions are read from plain words, English and French; a wish is never one', () => {
  const yes = { 'we would like to avoid wineries': ['winery'], 'No wineries please': ['winery'], 'a lake-view dinner that is not at a winery': ['winery'], 'skip breweries': ['brewery'], 'Sans vignobles, svp': ['winery'],
    'pas de microbrasseries': ['brewery'], "we don't want pubs": ['pub'], 'éviter les vignobles': ['winery'], 'please stay away from the distilleries': ['distillery'], 'no breweries, pubs or wineries': ['winery', 'brewery', 'pub'],
    'avoiding the distilleries and golf': ['distillery', 'golf'], 'No alcohol or wineries please.': ['winery'], 'we want to skip the wineries and do breweries, a lake-view lunch and a museum': ['winery'],
    "we don't want to go to wineries": ['winery'], 'avoid wineries and visit breweries instead': ['winery'], 'skip the brewery and add a winery': ['brewery'] };
  for (const [t, want] of Object.entries(yes)) assert.deepEqual(X.readExclusions(t).sort(), want.slice().sort(), t);
  for (const t of ['we love wineries', 'avoid crowds', 'We want wineries, a sunset dinner and a lakeside hotel', 'not only wineries but breweries too', "we don't hike but love wineries", 'no kids, wineries all day', 'wineries, no kids', 'a winery lunch']) assert.deepEqual(X.readExclusions(t), [], t);
  // The planner's own reader: the kind ruled out is never a kind asked for, and "avoid" is never a search word.
  const p = run(REQ);
  assert.ok(!(p.intent.types || []).includes(HOST), JSON.stringify(p.intent.types));
  assert.ok(!(p.intent.textTerms || []).includes('avoid'), JSON.stringify(p.intent.textTerms));
  assert.ok(p.requirementResults.some((r) => r.kind === 'excluded_type' && r.value === HOST));
  assert.ok(!p.requirementResults.some((r) => r.kind === 'type' && r.value === HOST));
  assert.doesNotMatch(String(p.summary), /“avoid”/);
  assert.ok(!(p.warnings || []).some((w) => /avoid|Nothing matching (?:wineries|breweries)/i.test(w)), JSON.stringify(p.warnings));
  // "avoid" still means what it meant where the site has no name for the thing avoided.
  const di = require('../discovery-intent.js');
  assert.deepEqual(X.readExclusions('avoid long drives'), []);
  assert.equal(typeof di.interpretDiscoveryQuery, 'function');
});

test('2. "at a winery" is evidence from stored data: the same place as a listed one, or the listing’s own words; unknown stays unknown', () => {
  const W = { id: 1, type: 'winery', name: "Quails' Gate Winery", address: '3303 Boucherie Rd, West Kelowna, BC', website: 'https://www.quailsgate.com/', latitude: 49.842719, longitude: -119.5664523 };
  const rows = [W,
    { id: 2, type: 'restaurant', name: 'Old Vines Restaurant', address: '3303 Boucherie Rd, Kelowna, BC', website: 'https://www.quailsgate.com/old-vines-restaurant/', latitude: 49.8426808, longitude: -119.5661225, description: "Old Vines Restaurant is the fine-dining room at Quails' Gate Winery in West Kelowna, with sweeping lake and mountain views." },
    { id: 3, type: 'restaurant', name: 'Next Door Grill', address: '3311 Boucherie Rd, West Kelowna, BC', website: 'https://nextdoorgrill.example.com/', latitude: 49.8428, longitude: -119.5663, description: 'A grill with a patio. Open all year.' },
    { id: 4, type: 'restaurant', name: 'Downtown Bistro', address: '10 Main St, Kelowna, BC', website: 'https://www.quailsgate.com/downtown/', latitude: 49.887, longitude: -119.496, description: 'A bistro downtown.' },
    { id: 5, type: 'restaurant', name: 'Hilltop Kitchen', address: null, website: null, latitude: null, longitude: null, description: 'Hilltop Kitchen is the restaurant at Far Hills Estate Winery, with a vineyard patio.' },
    { id: 6, type: 'restaurant', name: 'Lakeside Diner', address: '5 Beach Ave, Peachland, BC', website: 'https://lakesidediner.example.com/', latitude: 49.77, longitude: -119.73, description: 'A diner near the wineries, a short drive from Quails Gate Winery. Pair lunch with a tasting at a winery nearby.' },
    { id: 7, type: 'restaurant', name: 'Restaurant @ Fairview Mountain Golf Club', address: '1 Golf Rd, Oliver, BC', website: 'https://fairviewgolf.example.com/', latitude: 49.1701, longitude: -119.6001, description: 'The clubhouse restaurant at Fairview Mountain.' },
    { id: 8, type: 'winery', name: 'Fairview Cellars', address: '989 Cellar Rd, Oliver, BC', website: 'https://fairviewcellars.example.com/', latitude: 49.1711, longitude: -119.6011 },
    { id: 9, type: 'brewery', name: 'Harbour Brewing Co', address: '77 Dock St, Squamish, BC', website: 'https://harbourbrewing.example.com/', latitude: 49.7, longitude: -123.15 },
    { id: 10, type: 'restaurant', name: 'The Galley at Harbour Brewing', address: '77 Dock St, Squamish, BC', website: 'https://harbourbrewing.example.com/galley', latitude: 49.70001, longitude: -123.15001, description: 'Burgers and bowls.' }];
  const ix = X.atIndex(rows);
  assert.equal(ix.get(2).winery.how, 'same_place'); assert.equal(ix.get(2).winery.name, "Quails' Gate Winery");
  assert.equal(ix.has(3), false, 'a neighbour 20 m away with its own address, site and words is not at the winery');
  assert.equal(ix.has(4), false, 'the same website host far from the winery is not at it');
  assert.equal(ix.get(5).winery.how, 'own_words', 'its own words say so, though that winery is not listed');
  assert.equal(ix.has(6), false, '"near", "a short drive from" and "a tasting at" are not "at"');
  assert.equal(ix.has(7), false, 'a shared word of a name (Fairview) does not name the winery');
  assert.equal(ix.get(10).brewery.how, 'same_place');
  // The planner's own facts carry it, so "no wineries" rules such a place out; a wine tour too; nothing else.
  const facts = X.markAtPlaces(rows.map((r) => ({ ...r })));
  assert.equal(X.ruledOut(facts[1], 'winery'), true); assert.equal(X.ruledOut(facts[0], 'winery'), true);
  assert.equal(X.ruledOut(facts[2], 'winery'), false); assert.equal(X.ruledOut(facts[9], 'winery'), false); assert.equal(X.ruledOut(facts[9], 'brewery'), true);
  assert.equal(X.ruledOut({ type: 'tour', plannerKinds: ['wine_tour'] }, 'winery'), true);
  // A stop named by what it is at.
  for (const t of ['replace the winery restaurant with a lake view dinner', 'swap the restaurant at the winery', 'le restaurant du vignoble']) assert.equal(X.atPhraseIn(t), 'winery', t);
  assert.equal(X.atPhraseIn('the brewery pub'), 'brewery');
  assert.equal(X.atPhraseIn('replace the sushi place with a winery'), null);
  assert.deepEqual(X.stripNegated('replace it with a lake view dinner that is not at a winery'), { text: 'replace it with a lake view dinner', types: ['winery'] });
});

test('3. a guided boat tour is one by the listing’s own facts: never a rental, water bikes, a camp, a lesson or a beach', () => {
  const kinds = (v) => TR.inferPlannerKinds(v);
  const yes = [
    { type: 'tour', name: 'Lake Life Pontoon Cruises', description: 'Runs private, captained pontoon tours on Okanagan Lake, from relaxed daytime cruises to golden-hour sunset outings.' },
    { type: 'tour', name: 'Kelowna Cruises', description: 'Kelowna Cruises runs public afternoon, evening and late-night cruises on Okanagan Lake aboard two houseboats, plus private charters.' },
    { type: 'outdoor', name: 'Holy Doodle Sailing Charters', description: 'A private sail aboard a comfortable yacht. Choose a daytime cruise or a sunset sail on Okanagan Lake.' },
    { type: 'tour', name: 'Wake the Lake', description: 'Captained pontoon boat tours on Skaha Lake; the captain drives so no licence is needed. Book 2-hour cruises.' },
    { type: 'tour', name: 'Spirit Beach Watersports', description: 'Rents boats, jet skis, kayaks and paddleboards from the beach, and they also run sunset cruises.' },
    { type: 'tour', name: 'Any Name At All', tourKinds: ['boat'], description: 'We take you out on the water.' },
    { type: 'tour', name: 'InFlow Adventure Co.', description: 'Small-group water outfit on Howe Sound offering guided sails and sailing courses, plus wing-foil clinics.' },
    { type: 'tour', name: 'Canyon Jet Boat Tours', description: 'Jet boat tours up the river canyon with a guide.' }];
  for (const v of yes) assert.ok(kinds(v).includes('boat_tour'), v.name);
  const no = [
    { type: 'tour', name: 'Tiki Water Bikes (Peachland)', description: 'Tiki Water Bikes rents pedal-powered water bikes on the Peachland waterfront, a fun way to cruise along the shoreline without a paddle.' },
    { type: 'tour', name: 'LakeSurf Premium Rentals', description: 'LakeSurf rents near-new watercraft for a day on Okanagan Lake: wake boats, bowriders, pontoons, kayaks, paddleboards and pedal boats. No boating licence is needed.' },
    { type: 'outdoor', name: 'Headwaters Family Camp', description: 'An old-fashioned fishing and camping camp. Summer means fishing, boating and canoeing, with lakeside cabins.' },
    { type: 'tour', name: 'Okanagan Experience', description: 'Rents boats and Sea-Doos on Okanagan Lake. It is an easy way to plan a tubing afternoon or a sunset cruise past the city lights.' },
    { type: 'tour', name: 'Okanagan Lake Boat Rentals', description: 'A family-run shop renting wake surf boats and pontoons; the shop also runs surf charters and bachelorette cruises.' },
    { type: 'beach', name: 'Kekuli Bay', description: 'A popular launching point for kayaks, waterskiing and boating, with sunset cruises leaving from the launch.' },
    { type: 'outdoor', name: 'Coyote Cruises – Channel Float', description: 'Coyote Cruises rents the tubes and runs shuttle buses back.' },
    { type: 'tour', name: 'Lakeshore Sailing School', description: 'Sailing lessons and courses for beginners on the lake.' },
    { type: 'outdoor', name: 'Al-ways Fishing Charters', description: "Captain Al's guided trips cruise across Wood Lake, fishing for kokanee and trout." },
    { type: 'restaurant', name: 'Dinner Cruise Grill', description: 'A grill named for the dinner cruises that once left from this dock.' }];
  for (const v of no) assert.ok(!kinds(v).includes('boat_tour'), v.name);
  // The fixtures of this file, as the planner sees them.
  const fact = (v) => TR.inferPlannerKinds({ ...db.prepare('SELECT * FROM venues WHERE id = ?').get(v.id) });
  assert.ok(fact(F.BOAT).includes('boat_tour'));
  for (const k of ['BIKES', 'RENTAL', 'CAMP', 'TRAIL']) assert.ok(!fact(F[k]).includes('boat_tour'), k);
  // The chat's swap asks the planner for that kind by fact (never by a word of a name), and a request for one names it.
  assert.equal(tc.KIND_FACT.boat_tour, 'boat_tour'); // (2026-11-24: a spa is judged by the listing's facts too)
  assert.match('a relaxing guided boat tour', tc.KINDS.boat_tour ? tc.agent.TOUR_KINDS.boat_tour.re : /x/);
  assert.doesNotMatch('boat rentals', tc.agent.TOUR_KINDS.boat_tour.re);
});

test(`4. the exact request: no ${HOST}, no restaurant at one; the rule is recorded and said in one short line; the boat tour is honestly not there`, () => {
  const p = run(REQ);
  const stops = stopsOf(p);
  assert.ok(stops.length >= 2, JSON.stringify(stops));
  const ix = X.atIndex(db.prepare('SELECT id, name, type, address, website, latitude, longitude, description FROM venues WHERE redirect_to IS NULL').all());
  for (const s of stops) { assert.notEqual(s.type, HOST, s.name); assert.ok(!(ix.get(s.id) || {})[HOST], `${s.name} is at a ${HOST}`); }
  assert.ok(!stops.some((s) => s.id === F.HOSTREST.id || s.id === F.HOSTV.id));
  // Recorded, and said: the chip and one short line.
  const ev = Object.fromEntries(p.evidence.map((e) => [e.ask, e]));
  const no = ev[`no:${HOST}`];
  assert.equal(no.status, 'verified'); assert.equal(no.short, `No ${HOSTS} ✓`); assert.equal(no.line, true);
  assert.equal(no.text, `Avoiding ${HOSTS}: restaurants at a ${HOST} are left out too.`);
  assert.match(no.textFr, WR ? /^Sans microbrasseries : les restaurants situés dans un microbrasserie sont écartés aussi\.$/ : /^Sans vignobles : les restaurants situés dans un vignoble sont écartés aussi\.$/);
  assert.ok(HP.shareAsks(p).includes(`no:${HOST}`));
  // The boat tour: not matched by the camp, the rental or the water bikes; said as not there, with the nearest real one.
  const boat = ev['kind:boat_tour'];
  assert.equal(boat.status, 'unmet'); assert.deepEqual(boat.stops, []); assert.equal(boat.label, 'Guided boat tour');
  assert.equal(boat.text, `There’s no guided boat tour listed in ${TOWN}, so this plan has none. The nearest is Fixture Lake Cruises EXC in ${TOWN2}.`);
  assert.deepEqual(p.notIncluded.map((x) => [x.kind, x.reason, x.nearest && x.nearest.id]), [['boat_tour', 'none_listed', F.BOAT.id]]);
  assert.equal(p.notIncluded[0].chip, 'guided boat tour', 'the summary names it as what was looked for');
  assert.match(fs.readFileSync(require.resolve('../trip-workspace-layout.js'), 'utf8'), /var k = typeof x\.chip === 'string' && \/\^\[a-z\]\[a-z \]\{1,30\}\$\/\.test\(x\.chip\) \? x\.chip : /);
  assert.ok(!ev['type:tour'], 'a plain "Tours ✓" is never shown beside the boat tour that is not there');
  assert.ok(!stops.some((s) => s.id === F.BOAT.id), 'the trip is not taken to another town without asking');
  for (const d of p.days) for (const s of d.stops || []) assert.ok(!(s.reasons || []).some((r) => /boat tour/i.test(String(r.text || r))), JSON.stringify(s.reasons));
  // Vegetarian: every meal stop has the listing's badge; the plan's own caution stays.
  assert.equal(ev.vegetarian.status, 'verified');
  assert.match(ev.vegetarian.text, /^Vegetarian: all \d meal stops list vegetarian options\.$/);
  assert.ok(ev.vegetarian.stops.length >= 2 && ev.vegetarian.stops.every((x) => x.has === true));
  assert.equal(ev.lake_view.status, 'verified');
  // The hotel and the dates: one night, June 12 to 13, two adults; exact stored links only.
  const w = p.whereToStay;
  assert.equal(w.pick.id, F.HOTEL.id);
  assert.equal(w.trip.arrive, '2027-06-12'); assert.equal(w.trip.leave, '2027-06-13'); assert.equal(w.trip.nights, 1); assert.equal(w.trip.adults, 2);
  const links = linksOf(p);
  assert.ok(links.length >= 1);
  for (const l of links) { const u = decodeURIComponent(l.url); assert.match(u, /fixture-lakeside-exc\.html|exc-hotel\.example\.com\/book/); assert.doesNotMatch(u, /searchresults|[?&]ss=|google\.[a-z.]+\/maps/); }
  storedLinks(p);
});

test(`5. the same trip said without the rule may plan the ${HOST}'s restaurant; said with it, never`, () => {
  const open = stopsOf(run(REQ_OPEN)), shut = stopsOf(run(REQ));
  assert.ok(!shut.some((s) => s.id === F.HOSTREST.id));
  // (Not required of the open plan; when it does pick it, that is the plan the follow-up below is about.)
  assert.ok(open.length >= 2);
  assert.ok(!(run(REQ_OPEN).evidence || []).some((e) => /^no:/.test(e.ask)), 'a trip that rules nothing out says nothing of it');
});

test('6. the exact follow-up: each replacement on its own stop, nothing else touched, a reply that says what happened', async () => {
  const before = slots(SCREEN().map((s) => ({ ...s })));
  // Read by the word rules: three parts, the first a swap of the stop AT the winery for a lake-view dinner that is not
  // at one, the second a swap of the water bikes for a guided boat tour; no pace change, no "keep", no winery wanted.
  const stops = SCREEN().map((s) => ({ ...s, ...db.prepare('SELECT name, type FROM venues WHERE id = ?').get(s.id), day: Number(s.key[0]), role: s.key.endsWith('midday') ? 'lunch' : s.key.endsWith('evening') ? 'dinner' : '', badges: [], ...(s.id === F.HOSTREST.id ? { at: [HOST] } : {}), ...(s.id === F.BIKES.id ? { kinds: [] } : {}) }));
  const r0 = tc.rulesRead(FOLLOW, stops, { days: 2, request: REQ });
  assert.equal(r0.access, true);
  assert.deepEqual(r0.ops.map((o) => [o.o, (o.stops || []).map((s) => s.id).join(), o.kind || o.value]), [['replace', String(F.HOSTREST.id), 'lake_view'], ['replace', String(F.BIKES.id), 'boat_tour'], ['party', '', 'vegetarian']]);
  assert.deepEqual(r0.ops[0].notAt, [HOST]);
  assert.ok(!r0.ops.some((o) => ['pace', 'keep', 'remove', 'add'].includes(o.o) || o.kind === HOST));

  const r = await say(FOLLOW);
  assert.ok(r.plan, r.reply);
  const now = at(r.plan);
  // The winery's restaurant: replaced in its own slot, at its own time, by a place to eat with the Lake View and
  // Vegetarian-Friendly badges that is not at a winery.
  const fresh = now['1-evening'];
  assert.ok([F.VEG1.id, F.VEG3.id].includes(fresh[0]), JSON.stringify(now));
  assert.equal(fresh[1], 1050);
  const fv = db.prepare('SELECT type, lake_view, vegetarian FROM venues WHERE id = ?').get(fresh[0]);
  assert.deepEqual([fv.type, fv.lake_view, fv.vegetarian], ['restaurant', 1, 1]);
  // Every other stop: still there, same slot, same time. Nothing removed, nothing added, nothing moved.
  for (const [k, v] of Object.entries(before)) if (k !== '1-evening') assert.deepEqual(now[k], v, k);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(before).sort());
  assert.deepEqual(r.changed, ['1-evening']);
  assert.deepEqual(r.actions, { remove: [], keep: [] });
  // The water bikes stay: no guided boat tour is listed in town, and the boat rental was never taken for one.
  assert.equal(now['2-morning'][0], F.BIKES.id);
  assert.ok(!Object.values(now).some((v) => v[0] === F.RENTAL.id));
  // The reply, part by part.
  const name = db.prepare('SELECT name FROM venues WHERE id = ?').get(fresh[0]).name;
  assert.ok(r.reply.startsWith(`Swapped Fixture Vine Room EXC for ${name} at 5:30 PM. Its ${SITE.brand} listing has the Lake View badge. I list no guided boat tour in ${TOWN}. Fixture Water Bikes EXC stays. Vegetarian kept.`), r.reply);
  assert.match(r.reply, new RegExp(`Nearest elsewhere: Fixture Lake Cruises EXC, in ${TOWN2}, outside ${TOWN} \\(about [\\d.]+ km in a straight line\\)\\. Swap it in for Fixture Water Bikes EXC\\?$`));
  TRUE_REPLY(r.reply);
  assert.ok(r.reply.split(/\s+/).length < 75, r.reply);
  // One question, with its two buttons; a plain yes takes it (never anything else).
  assert.deepEqual(r.offer, [`Fixture Lake Cruises EXC [swap ${F.BIKES.id}>${F.BOAT.id} boat_tour]`]);
  assert.deepEqual(r.choices.map((c) => [c.kind, c.label]), [['view', 'View Fixture Lake Cruises EXC'], ['say', 'Swap it in']]);
  assert.match(r.choices[0].url, new RegExp(`^/${REGION2}/[a-z-]+/exc-test-boat$`));
  // The plan that comes back says the same: the rule kept, vegetarian kept, the boat tour still not there.
  const ev = Object.fromEntries(r.plan.evidence.map((e) => [e.ask, e]));
  assert.equal(ev[`no:${HOST}`].status, 'verified');
  assert.equal(ev.vegetarian.status, 'verified'); assert.match(ev.vegetarian.text, /^Vegetarian: all 3 meal stops list vegetarian options\.$/);
  assert.equal(ev['kind:boat_tour'].status, 'unmet');
  assert.ok(!ev['type:tour']);
  assert.equal(r.req.text, REQ, 'the request already rules them out: nothing is added to it');
  // The hotel, the dates and the party: as they were.
  assert.equal(r.plan.whereToStay.pick.id, F.HOTEL.id);
  assert.deepEqual([r.plan.whereToStay.trip.arrive, r.plan.whereToStay.trip.leave, r.plan.whereToStay.trip.nights, r.plan.whereToStay.trip.adults], ['2027-06-12', '2027-06-13', 1, 2]);
  storedLinks(r.plan);
  // Undo data for the one swap made.
  assert.deepEqual([r.swapBack.oldId, r.swapBack.newId, r.swapBack.key], [F.HOSTREST.id, fresh[0], '1-evening']);

  // "Swap it in": the guided boat tour in the next town takes the water bikes' slot; nothing else moves.
  const after1 = tc.planStops(r.plan).map((s) => ({ key: s.key, id: s.id, start: s.start }));
  const y = await say('yes', { stops: after1, offer: r.offer, text: r.req.text });
  assert.ok(y.plan, y.reply);
  const now2 = at(y.plan);
  assert.equal(now2['2-morning'][0], F.BOAT.id); assert.equal(now2['2-morning'][1], 540);
  for (const [k, v] of Object.entries(now)) if (k !== '2-morning') assert.deepEqual(now2[k], v, k);
  assert.match(y.reply, new RegExp(`^Done\\. Swapped Fixture Water Bikes EXC for Fixture Lake Cruises EXC at 9 AM\\. It’s in ${TOWN2}, outside ${TOWN} \\(about [\\d.]+ km in a straight line\\)\\. Nothing else changed\\.$`));
  const ev2 = Object.fromEntries(y.plan.evidence.map((e) => [e.ask, e]));
  assert.equal(ev2['kind:boat_tour'].status, 'verified'); assert.deepEqual(ev2['kind:boat_tour'].stops.map((s) => s.id), [F.BOAT.id]);
  assert.ok(!(y.plan.notIncluded || []).some((x) => x.kind === 'boat_tour' || x.kind === 'tour'), JSON.stringify(y.plan.notIncluded));
});

test('7. the same follow-up on a trip that had not ruled them out: the rule is recorded with the swap, and kept afterwards', async () => {
  const r = await say(FOLLOW, { text: REQ_OPEN });
  assert.ok(r.plan, r.reply);
  assert.ok([F.VEG1.id, F.VEG3.id].includes(at(r.plan)['1-evening'][0]));
  assert.equal(r.req.text, `${REQ_OPEN.replace(/\.$/, '')}, no ${HOSTS}`);
  assert.ok(X.readExclusions(r.req.text).includes(HOST));
  assert.equal(Object.fromEntries(r.plan.evidence.map((e) => [e.ask, e.status]))[`no:${HOST}`], 'verified');
  TRUE_REPLY(r.reply);
  // From here on, one is not added; said, with how to lift the rule. Lifted in plain words, it can be.
  const stops = tc.planStops(r.plan).map((s) => ({ key: s.key, id: s.id, start: s.start }));
  const a = await say(`add a ${HOST}`, { stops, text: r.req.text });
  assert.equal(a.plan, null);
  assert.equal(a.reply, `You asked to avoid ${HOSTS}, so I haven’t added one. Say “${HOSTS} are fine now” to lift that.`);
  const l = await say(`${HOSTS} are fine now`, { stops, text: r.req.text });
  assert.equal(l.reply, `OK: ${HOSTS} are allowed again. Your stops are unchanged.`);
  assert.equal(l.plan, null); assert.equal(l.text, REQ_OPEN.replace(/\.$/, ''));
  assert.equal(l.needDrop, `no:${HOST}`, 'the chip leaves the plan on screen');
  // And a rule said on its own is noted; the stop it touches is named, never removed.
  const n = await say(`please avoid ${HOSTS}`, { text: REQ_OPEN });
  assert.equal(n.plan, null);
  assert.equal(n.reply, `Fixture Vine Room EXC is at a ${HOST}. Say “replace Fixture Vine Room EXC” to change it.`);
  assert.equal(n.text, undefined, 'not recorded while a stop on the plan is at one');
  const n2 = await say(`please avoid ${HOSTS}`, { text: REQ_OPEN, stops: SCREEN().filter((s) => s.id !== F.HOSTREST.id) });
  assert.equal(n2.reply, `Noted: no ${HOSTS} from here on.`);
  assert.ok(X.readExclusions(n2.text).includes(HOST));
  // The plan on screen gains the chip without being planned again (the page patches its evidence).
  assert.deepEqual([n2.needPatch.evidence.ask, n2.needPatch.evidence.status, n2.needPatch.evidence.short], [`no:${HOST}`, 'verified', `No ${HOSTS} ✓`]);
  const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
  assert.match(CHAT_PAGE, /if \(typeof j\.needDrop === 'string' && \/\^no:\[a-z_\]\{2,20\}\$\/\.test\(j\.needDrop\) && state\.last && !\(j\.plan && j\.req\)\)/);
  assert.match(CHAT_PAGE, /if \(!\/\^no:\/\.test\(np\.evidence\.ask \|\| ''\)\) \{ nds\.push\(np\.need\); state\.last\.needs = nds; \}/);
  // French.
  const fr = await say(WR ? 'veuillez éviter les microbrasseries' : 'veuillez éviter les vignobles', { text: REQ_OPEN, stops: SCREEN().filter((s) => s.id !== F.HOSTREST.id), lang: 'fr' });
  assert.equal(fr.reply, WR ? 'C’est noté : plus de microbrasseries à partir de maintenant.' : 'C’est noté : plus de vignobles à partir de maintenant.');
});

test('8. a target that cannot be told is asked about, never guessed; a stop is found by what it is, not only by name', async () => {
  // No stop at a winery on the plan: one question, nothing changes; the other parts are still answered.
  const clean = SCREEN().map((s) => (s.id === F.HOSTREST.id ? { ...s, id: F.VEG1.id } : s));
  const r = await say(FOLLOW, { stops: clean });
  assert.equal(r.plan, null);
  assert.equal(r.reply, `I list no guided boat tour in ${TOWN}. Fixture Water Bikes EXC stays. Your plan is unchanged. Vegetarian kept. None of your stops is listed at a ${HOST}, so I’m not sure which one you mean. Which stop should I replace?`);
  assert.equal(r.offer, undefined, 'one question at a time');
  TRUE_REPLY(r.reply);
  // Two stops at one: the meal the message names tells them apart; with no such word, one question naming both.
  const two = SCREEN().map((s) => (s.id === F.SUSHI.id ? { ...s, id: F.HOSTV.id } : s));
  const st2 = two.map((s) => ({ ...s, ...db.prepare('SELECT name, type FROM venues WHERE id = ?').get(s.id), day: Number(s.key[0]), role: s.key.endsWith('midday') ? 'lunch' : s.key.endsWith('evening') ? 'dinner' : '', badges: [], at: [F.HOSTREST.id, F.HOSTV.id].includes(s.id) ? [HOST] : undefined }));
  assert.deepEqual(tc.rulesRead(`replace the ${HOST} restaurant with a lake-view dinner that is not at a ${HOST}`, st2, { days: 2, request: REQ }).ops.map((o) => [o.o, o.stops[0].id]), [['replace', F.HOSTREST.id]]);
  const which = tc.rulesRead(`replace the ${HOST} restaurant with something else`, st2, { days: 2, request: REQ });
  assert.deepEqual([which.ops.length, which.cant, which.what], [0, 'at_which', HOST]);
  assert.match(tc.cantReply('at_which', 'en', HOST, st2), new RegExp(`are each at a ${HOST}\\. Which one should I replace\\?$`));
  // No water bikes on the plan either: said in the traveller's own words (never "a cycling stop").
  const none = await say(FOLLOW, { stops: clean.filter((s) => s.id !== F.BIKES.id) });
  assert.match(none.reply, /^I don’t see “water bikes” on your plan, so nothing was replaced there\. Vegetarian kept\. None of your stops is listed at a/);
  assert.doesNotMatch(none.reply, /cycling/);
  // "the water bikes" is the water-bike stop, not also a place whose name shares one word with it.
  const named = tc.rulesRead('replace the water bikes with a guided boat tour', [{ key: '1-morning', id: 1, name: 'Splash Floating Water Park', type: 'outdoor', day: 1, role: '', badges: [] }, { key: '2-morning', id: 2, name: 'Tiki Water Bikes (Peachland)', type: 'tour', day: 2, role: '', badges: [], kinds: [] }], { days: 2, request: '' });
  assert.deepEqual(named.ops.map((o) => [o.o, o.stops[0].id, o.kind]), [['replace', 2, 'boat_tour']]);
  // "relaxing" said of a thing is never the trip's pace; said of the trip, it still is.
  assert.ok(!tc.rulesRead('add a relaxing boat cruise on day 2', [], { days: 2, request: '' }).ops.some((o) => o.o === 'pace'));
  assert.ok(tc.rulesRead('make it more relaxed', [], { days: 2, request: '' }).ops.some((o) => o.o === 'pace' && o.value === 'relaxed'));
  // A diet the request already has, said again on its own: one line, nothing planned again.
  const k = await say('Keep it vegetarian-friendly.');
  assert.equal(k.plan, null); assert.equal(k.reply, 'Vegetarian is already part of your request. Nothing changed.');
});

test('9. the shared copy, opened fresh, says what the plan says: the stops, the rule, the boat tour, vegetarian, the stay and its dates', async () => {
  const r = await say(FOLLOW);
  const p = r.plan, list = tc.planStops(p);
  // The link, built as the page builds it (trip-planner-v4-page.js v4ShareLink): ids and known values only.
  const asks = HP.shareAsks(p), ni = HP.shareNotIncluded(p);
  assert.ok(asks.includes(`no:${HOST}`) && asks.includes('vegetarian') && asks.includes('kind:boat_tour'), asks.join());
  assert.deepEqual(ni, [`boat_tour:n:${F.BOAT.id}`]);
  const mealIds = new Set(p.evidence.find((e) => e.ask === 'vegetarian').stops.map((s) => s.id));
  const q = { stops: list.map((s) => `venue:${s.id}`).join(','), days: list.map((s) => s.day).join(','), t: list.map((s) => s.start).join(','), td: '2027-06-12_2027-06-13', ts: 'r', stay: String(F.HOTEL.id), nights: '1', ad: '2', rm: '1', ra: '1',
    asks: asks.join(','), ml: list.map((s) => (mealIds.has(s.id) ? 1 : 0)).join(''), ni: ni.join(','), nt: REGION };
  const c = app.tripShareContext(q, 'en', new Date('2026-11-24T18:00:00Z')), html = app.tripShareContextHtml(c, 'en');
  const lines = Object.fromEntries(c.lines.map((l) => [l.ask, l.text]));
  assert.equal(lines[`no:${HOST}`], Object.fromEntries(p.evidence.map((e) => [e.ask, e.text]))[`no:${HOST}`]);
  assert.equal(lines['kind:boat_tour'], p.notIncluded[0].text);
  assert.equal(lines.vegetarian, 'Vegetarian: all 3 meal stops list vegetarian options. Confirm with each place when you book.');
  assert.ok(!c.lines.some((l) => /^not_included:/.test(l.ask)), 'the boat tour is said once');
  assert.ok(html.includes(`Avoiding ${HOSTS}: restaurants at a ${HOST} are left out too.`));
  assert.ok(html.includes(`There’s no guided boat tour listed in ${TOWN}`));
  // The stay: the same place, the trip's own dates, the same exact links as the plan's.
  assert.equal(c.stay.id || c.stayId, F.HOTEL.id);
  assert.deepEqual([c.tripDates.start, c.tripDates.end, c.nights, c.adults], ['2027-06-12', '2027-06-13', 1, 2]);
  const planHosts = linksOf(p).map((l) => decodeURIComponent(l.url).replace(/[?&](?:checkin|checkout|group_adults|no_rooms|adults|rooms|rm1|chkin|chkout|d1|d2|startDate|endDate)=[^&]*/g, ''));
  for (const l of c.stay.links || []) assert.ok(planHosts.some((u) => decodeURIComponent(l.url).split('?')[0].includes(u.split('?')[0].split('link=').pop().split('?')[0])), l.url);
  // The link round trip keeps the known values and drops anything else.
  const back = HP.parseShareContext({ ...q, asks: `${q.asks},no:volcano,no:${HOST}` });
  assert.ok(back.asks.includes(`no:${HOST}`) && !back.asks.includes('no:volcano'));
  assert.ok(HP.shareContextQuery(back).includes(`no:${HOST}`));
  // An older link (no such ask) reads as it always did.
  const old = app.tripShareContext({ ...q, asks: 'vegetarian' }, 'en', new Date('2026-11-24T18:00:00Z'));
  assert.ok(!old.lines.some((l) => /^no:/.test(l.ask)));
  // French copy.
  const fr = app.tripShareContext(q, 'fr', new Date('2026-11-24T18:00:00Z'));
  assert.ok(fr.lines.some((l) => l.ask === `no:${HOST}` && /^Sans (?:vignobles|microbrasseries) : /.test(l.text)));
  // The page builds the same link: the rule rides in asks=, and the boat tour's own sentence in ni=.
  assert.match(PAGE, /var unmetAsk = \(p\.evidence \|\| \[\]\)\.some\(function\(e\)\{ return e && e\.ask === 'kind:' \+ x\.kind && e\.status === 'unmet'; \}\);/);
  assert.match(PAGE, /asks = asks\.filter\(function\(a\)\{ return a && \/\^\[a-z_:0-9\]\+\$\/\.test\(a\); \}\)/);
});

test('10. the other needs read as before: no alcohol is not "no wineries", and a plan with neither is untouched', () => {
  const dry = run(`Plan a 2-day trip in ${TOWN} from July 10 to July 11, 2027 for two adults. We want casual food. No alcohol please.`);
  assert.ok((dry.evidence || []).some((e) => e.ask === 'no_alcohol'));
  assert.ok(!(dry.evidence || []).some((e) => /^no:/.test(e.ask)), 'no alcohol is its own ask');
  const plain = run(`Plan a 2-day trip in ${TOWN} from July 10 to July 11, 2027 for two adults. We want casual food and a walk.`);
  assert.ok(!(plain.evidence || []).some((e) => /^no:/.test(e.ask) || e.ask === 'kind:boat_tour'));
});
