'use strict';
// Build My Trip: a spa for the one who is not skiing is a listing that IS a spa (2026-11-24, Dayton's second live test
// at 390px). The request:
//   "Plan a 3-day SilverStar winter trip for 2 adults and a 10-year-old from February 12 to February 14, 2027. Two of
//    us are beginners and want ski lessons; one adult does not ski and would prefer a spa or another relaxing
//    activity. We need a hotel for two nights and family-friendly dinners."
// Live, the plan named "Gostlin Keefer Lake Lodge – Catskiing" in Lumby as the nearest spa for that adult: a
// cat-skiing lodge whose description ends "unwind in the hot tub or sauna" (an amenity for its own guests), and the
// chat offered to add it without its town's distance, what is not checked, or what adding it does to the plan.
// Here:
//   - a spa is a listing that is one by its stored data (trip-requirements.js spaListing), wherever a spa is picked,
//     counted, offered or labelled: the planner's kinds, the plan's note, the nearest one, the chat's own list;
//   - naming one says its town, the straight-line distance from the plan's stops (no travel time), that the date is
//     not checked, and (unless its own words say a visit can be booked by itself) that day visits aren't confirmed;
//   - beyond 40 km it is said to be far and is not the note's "Add it"; things listed in the plan's own town that are
//     not skiing are named by what they are and come first;
//   - the chat's answer says what adding a stop does to the ONE shared schedule, asks one question, changes nothing;
//   - the shared copy and the copied text say the same note, worked out again from the listings.
// Fixture listings only; no network; the word rules only (the AI reader is shown never to be asked). The same file
// runs on whistlerroam.com.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const S = require('../trip-party-split.js');
const TR = require('../trip-requirements.js');
const LAYOUT = require('../trip-workspace-layout.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
// The fixture town (the trip's base), the next town over (the lodge and the spa).
const REGION = WR ? 'pemberton' : 'silverstar', TOWN = WR ? 'Pemberton' : 'SilverStar';
const OTHER = WR ? 'mount-currie' : 'vernon', OTHER_TOWN = WR ? 'Mount Currie' : 'Vernon';
const AT = WR ? [50.3192, -122.8035] : [50.3585, -119.0610];
// Far from every real listing of either site: the "far" case is measured from here.
const REMOTE = [53.9, -124.9];
const PAGE = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const REQ = `Plan a 3-day ${TOWN} winter trip for 2 adults and a 10-year-old from February 12 to February 14, 2027. Two of us are beginners and want ski lessons; one adult does not ski and would prefer a spa or another relaxing activity. We need a hotel for two nights and family-friendly dinners.`;
const ASK_MSG = 'What can the adult who does not ski do while the other two are skiing?';
const DATES = ['2027-02-12', '2027-02-13', '2027-02-14'];
const CHECK = 'Check your date with them.', CHECK_DAY = 'Day visits and your date aren’t checked here: book directly with them.';
// What the live listing says (in the fixture's own words): cat-skiing packages, and a sauna for the lodge's guests.
const LODGE_DESC = 'A backcountry lodge used only by the non-skier tests. Guided cat skiing for advanced skiers and snowboarders, sold as 3-day and 4-day all-inclusive packages with accommodation and meals. After a full day in the mountains, unwind in the hot tub or sauna and enjoy a massage. Operating December through April.';

const made = [], stays = [];
const F = {};
const DAYS7 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOURS = JSON.stringify(Object.fromEntries(DAYS7.map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, km, o) => {
  const n = made.length + 1;
  const at = o.at || AT; delete o.at;
  const v = app.createVenue({ region: REGION, address: `${700 + n} Nonskier Test Road, ${TOWN}, BC`, latitude: at[0] + km * 0.009, longitude: at[1], hours: HOURS, kid_friendly: 1, description: 'A place used only by the non-skier tests. Open all year.', slug: `nonskier-test-${key.toLowerCase()}`, website: `https://nonskier-${key.toLowerCase()}.example.com/`, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  const h = mk('HOTEL', 0, { type: 'stay', cuisine: 'hotel', hours: null, name: 'Fixture Snowside Lodge NV' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(h.id, JSON.stringify({ max_guests: 6, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/nonskier-test-hotel.html', own: 'https://nonskier-hotel.example.com/book' } }), '2026-11-24T00:00:00Z', 'test-nonskier');
  stays.push(h.id);
  mk('HILL', 0.5, { type: 'outdoor', name: 'Fixture Mountain Resort NV', description: 'A ski resort used only by the non-skier tests: alpine skiing and snowboarding in winter. Open all year.' });
  mk('LUNCH', 0.6, { type: 'restaurant', price: 2, name: 'Fixture Pine Social NV' });
  mk('DINNER', 0.7, { type: 'restaurant', price: 2, name: 'Fixture Den Bistro NV' });
  mk('CAFE', 0.4, { type: 'cafe', price: 1, name: 'Fixture Bakery Cafe NV' });
  // The live failure: a cat-skiing lodge, listed under Tours in the next town, nearer than any spa.
  mk('LODGE', 3, { type: 'tour', region: OTHER, name: 'Fixture Keefer Peak Lodge – Catskiing NV', address: `731 Nonskier Test Road, ${OTHER_TOWN}, BC`, kid_friendly: 0, description: LODGE_DESC });
  // A listed spa in the next town, 12 km off: a spa by its own name; its words say sessions are booked.
  mk('SPA', 12, { type: 'indoor', region: OTHER, name: 'Fixture Cedar Thermal Spa NV', address: `732 Nonskier Test Road, ${OTHER_TOWN}, BC`, kid_friendly: 0, description: 'A thermal spa with a sauna and steam room, used only by the non-skier tests. Sessions are booked ahead. Open all year.' });
  // Listed in the trip's own town and not skiing: a gallery (open), and one its stored hours show closed every day.
  mk('GALLERY', 0.55, { type: 'indoor', name: 'Fixture Snowline Gallery NV', description: 'An art gallery of local painters, used only by the non-skier tests. Open all year.' });
  mk('SHUT', 0.56, { type: 'indoor', name: 'Fixture Shuttered Gallery NV', hours: JSON.stringify(Object.fromEntries(DAYS7.map((d) => [d, []]))), description: 'An art gallery used only by the non-skier tests.' });
  mk('CENTRE', 0.54, { type: 'indoor', name: 'Fixture Community Centre NV', description: 'A community centre with a small art gallery and a library in the lobby, used only by the non-skier tests.' });
  // The far case, measured where no real listing is: a hill, and a spa about 60 km from it.
  mk('RHILL', 0, { at: REMOTE, type: 'outdoor', name: 'Fixture Far Peak Resort NV', description: 'A ski resort used only by the non-skier tests: alpine skiing in winter. Open all year.' });
  mk('RSPA', 60, { at: REMOTE, type: 'indoor', region: OTHER, name: 'Fixture Far Valley Spa NV', address: `733 Nonskier Test Road, ${OTHER_TOWN}, BC`, kid_friendly: 0, description: 'A spa used only by the non-skier tests. Open all year.' });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of stays) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const run = (text) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text }, { v4: true, stays: true }).value, v4: true }, true);
// The plan on the traveller's screen: the planner's own plan for the request (PLAN, test 4), without a spa stop.
const screenOf = (p) => tc.planStops(p).filter((s) => !app.tripIsSpa(s.id)).map((s) => ({ key: s.key, id: s.id, start: s.start, day: s.day, name: s.name }));
const sent = (list) => list.map((s) => ({ key: s.key, id: s.id, start: s.start }));
// What the listings show for that screen, as the chat works it out (the trip's own town).
const factsOf = (list) => app.tripPartySplitFacts(list.map((s) => ({ id: s.id, name: s.name, day: s.day, start: s.start })), [REGION], DATES);
const say = async (message, stops, o = {}) => {
  const body = { message, lang: o.lang || 'en', plan: { text: o.text || REQ, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops, dayDates: DATES, tripSource: 'request', stayId: F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) };
  const v = app.parseTripChatBody(body, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const NOTHING_ELSE = (r) => {
  assert.equal(r.plan, null, 'the trip is not planned again');
  assert.equal(r.req, null);
  assert.deepEqual(r.actions, { remove: [], keep: [] }, 'no stop is removed or kept');
  for (const k of ['stayPref', 'stayForce', 'stayDates', 'text', 'needPatch', 'needDrop', 'card', 'confirm', 'party', 'stayBlock']) assert.equal(r[k], undefined, `${k} must not change`);
};
// Nothing here may say a lesson, a spa, a room or a booking is confirmed or available, give a travel time, or call a
// place relaxing or suitable; one question at most.
const HONEST = (text) => {
  assert.doesNotMatch(text, /\bavailable\b|\bavailability\b|\bconfirmed\b(?<!aren’t confirmed)|\bbooked\b|\bminutes?\b|\bdrive\b|suitable|\brelaxing\b|\brelax\b|\bages?\b|\bopen\b/i, text);
  assert.ok((text.match(/\?/g) || []).length <= 1, `one question at most: ${text}`);
  assert.doesNotMatch(text, /Keefer|Catskiing/i, 'the lodge is never named');
};
const kinds = (v, extra = {}) => TR.inferPlannerKinds({ ...v, ...extra });

test('1. a spa is a listing that IS one: never a lodge, hotel, cat-ski operator, gym or water park that mentions a sauna', () => {
  // The live failure, as listed (Tours; the sauna is in the last lines of its description).
  const lodge = { type: 'tour', name: 'Gostlin Keefer Lake Lodge – Catskiing', cuisine: null, description: LODGE_DESC };
  assert.equal(TR.spaListing(lodge), false);
  assert.ok(!kinds(lodge).includes('spa'), 'the planner does not read it as a spa');
  assert.ok(!kinds(F.LODGE).includes('spa') && !app.tripIsSpa(F.LODGE.id));
  // Places whose words mention a spa, a sauna, a hot tub or a massage for their guests or beside what they are.
  for (const v of [
    { type: 'tour', name: 'Alpine Ridge Heli-Skiing', cuisine: 'Heli-skiing', description: 'Heli-skiing weeks from a lodge with a spa, sauna and massage.' },
    { type: 'tour', name: 'Cayuse Outfitters', cuisine: 'Horseback riding', description: 'Trail rides, and a wellness retreat with a sauna is also offered.' },
    { type: 'tour', name: 'Whitecap Alpine', cuisine: 'Backcountry ski touring lodge', description: 'Relax in our lakeside sauna after the day.' },
    { type: 'tour', name: 'InFlow Adventure Co.', cuisine: 'Sailing, wing foil lessons & floating sauna', description: 'A water-sports outfit. Its floating sauna offers private sessions.' },
    { type: 'indoor', name: 'Lakeside Resort Hotel', cuisine: null, description: 'A resort hotel with a full spa and sauna for guests.' },
    { type: 'indoor', name: 'Summit Fitness Gym', cuisine: 'Gym', description: 'A gym with a sauna, steam room and massage.' },
    { type: 'indoor', name: 'City Aquatic Centre', cuisine: null, description: 'Pools, a hot tub, a sauna and a steam room.' },
    { type: 'indoor', name: 'Glow Yoga Studio', cuisine: 'Yoga', description: 'Yoga classes, with an infrared sauna and massage on request.' },
    { type: 'outdoor', name: 'Splash BC Floating Water Park – Kelowna', cuisine: null, description: 'An inflatable course floating off the beach. A spa day for nobody.' },
    { type: 'outdoor', name: 'Keyhole Hot Springs', cuisine: 'Hot springs', description: 'Natural hot pools by the river.' },
    { type: 'restaurant', name: 'The Spa Cafe', cuisine: 'Cafe', description: 'Coffee beside the spa.' },
    { type: 'indoor', name: 'Peak Wellness Clinic', cuisine: null, description: 'A physiotherapy clinic. Massage is offered too.' },
  ]) { assert.equal(TR.spaListing(v), false, v.name); assert.ok(!kinds(v).includes('spa'), v.name); }
  // Listings that are one: by their own name or category line, their owner's kind, or (a "wellness" place) the first
  // sentence of their description.
  for (const v of [
    { type: 'indoor', name: 'Scandinave Spa Whistler', cuisine: 'Nordic spa', description: 'Outdoor Nordic spa in the forest.' },
    { type: 'indoor', name: 'The Spa at Nita Lake Lodge', cuisine: 'Day spa', description: 'Lakeside lodge spa with rooftop hot tubs.' },
    { type: 'indoor', name: 'Vida Spa at Fairmont Chateau Whistler', cuisine: 'Day spa', description: 'Hotel spa. Open to non-guests by booking.' },
    { type: 'indoor', name: 'Cleopatra’s Rituals Thermal Spa and Steam', cuisine: null, description: 'A thermal spa with a hot-cold circuit.' },
    { type: 'indoor', name: 'Löyly Floating Sauna', cuisine: null, description: 'A cedar sauna floating at the dock.' },
    { type: 'indoor', name: 'Plunge Wellness Studio', cuisine: 'Sauna', description: 'Hot and cold studio with a traditional sauna.' },
    { type: 'indoor', name: 'Tality Wellness Kelowna', cuisine: null, description: 'Tality Wellness Kelowna is a downtown social bathhouse with a cedar sauna. Join a shared session.' },
    { type: 'indoor', name: 'Stillwater House', cuisine: null, description: 'A quiet place.', indoorKinds: ['spa'] },
    F.SPA,
  ]) { assert.equal(TR.spaListing(v), true, v.name); assert.ok(kinds(v).includes('spa'), v.name); }
  assert.ok(app.tripIsSpa(F.SPA.id) && app.tripIsSpa(F.RSPA.id));
  // What it calls itself, and whether its own words say a visit can be booked by itself.
  assert.deepEqual([TR.spaWhat({ name: 'Löyly Floating Sauna' }), TR.spaWhat({ name: 'Plunge Wellness Studio', cuisine: 'Sauna' }), TR.spaWhat({ name: 'AIKA Spa', cuisine: 'Sauna spa' }), TR.spaWhat({ name: 'Tality Wellness Kelowna' })], ['sauna', 'sauna', 'spa', 'spa']);
  assert.deepEqual([TR.spaDayVisit(F.SPA), TR.spaDayVisit(F.RSPA), TR.spaDayVisit({ cuisine: 'Day spa', description: 'Massage and facials.' }), TR.spaDayVisit({ description: 'Open to non-guests by booking.' }), TR.spaDayVisit({ description: 'A spa with hot pools. Silence is kept throughout.' })], [true, false, true, true, false]);
  // The chat's own spa list is by the listing's facts too (it was by words: "float" made a floating water park one).
  assert.equal(tc.KIND_FACT.spa, 'spa');
  assert.ok(!tc.KINDS.spa.words.includes('float') && !tc.KINDS.spa.words.includes('hot spring'));
  assert.ok(tc.kindMatches('spa', { type: 'indoor', name: 'Fixture Cedar Thermal Spa NV', kinds: ['spa'] }) && !tc.kindMatches('spa', { type: 'tour', name: 'A Lodge Spa Weekend', kinds: ['heli_ski'] }));
  const [lodgeStop, spaStop] = app.tripChatStops([{ key: '1-afternoon', id: F.LODGE.id, start: 840 }, { key: '2-afternoon', id: F.SPA.id, start: 840 }]);
  assert.ok(!tc.kindMatches('spa', lodgeStop) && tc.kindMatches('spa', spaStop));
});

test('2. the facts: the lodge is never the spa; the listed spa has its distance; what is listed in town and not skiing; closed ones are left out', () => {
  const visits = [{ id: F.HILL.id, name: F.HILL.name, day: 1, start: 540 }, { id: F.LUNCH.id, name: F.LUNCH.name, day: 1, start: 720 }];
  const f = app.tripPartySplitFacts(visits, [REGION], DATES);
  assert.deepEqual([f.spaStops, f.inTown, f.town], [[], false, TOWN]);
  assert.deepEqual([f.nearest.id, f.nearest.name, f.nearest.region, f.nearest.regionLabel, f.nearest.what, f.nearest.dayVisit], [F.SPA.id, F.SPA.name, OTHER, OTHER_TOWN, 'spa', true]);
  assert.ok(f.nearest.km > 10 && f.nearest.km < 13, String(f.nearest.km));
  // Listed in the trip's own town, not skiing, by what it is; the one its hours show closed every day is not named,
  // nor the hill, a restaurant or a café (stored data does not say a café at a resort is in the village).
  assert.deepEqual([f.alts[0].id, f.alts[0].label, f.alts[0].labelFr], [F.GALLERY.id, 'gallery', 'galerie']);
  for (const x of f.alts) assert.ok(![F.SHUT.id, F.HILL.id, F.RHILL.id, F.LUNCH.id, F.DINNER.id, F.CAFE.id, F.LODGE.id, F.CENTRE.id].includes(x.id), x.name);
  assert.ok(f.alts.length <= 2);
  // Without dates nothing is known to be closed: the shut gallery is listed like the other (the two nearest).
  assert.deepEqual(app.tripPartySplitFacts(visits, [REGION], []).alts.map((x) => x.id).sort(), [F.GALLERY.id, F.SHUT.id].sort());
  // A place is named by a kind only when its own name or category line says it (a community centre whose
  // description mentions a gallery is not "a gallery").
  assert.ok(!app.tripPartySplitFacts(visits, [REGION], []).alts.some((x) => x.id === F.CENTRE.id));
  // A spa on the plan is the fact; nothing else is looked for.
  const on = app.tripPartySplitFacts([...visits, { id: F.SPA.id, name: F.SPA.name, day: 2, start: 840 }], [REGION], DATES);
  assert.deepEqual([on.spaStops.map((x) => [x.id, x.day, x.start, x.what, x.dayVisit]), on.nearest, on.alts], [[[F.SPA.id, 2, 840, 'spa', true]], null, []]);
  // The lodge on the plan is not a spa stop.
  assert.deepEqual(app.tripPartySplitFacts([...visits, { id: F.LODGE.id, name: F.LODGE.name, day: 2, start: 840 }], [REGION], DATES).spaStops, []);
  // Far: measured where no other listing is, the spa is about 60 km off.
  const far = app.tripPartySplitFacts([{ id: F.RHILL.id, name: F.RHILL.name, day: 1, start: 540 }], [REGION], DATES);
  assert.equal(far.nearest.id, F.RSPA.id);
  assert.ok(far.nearest.km > 55 && far.nearest.km < 65 && far.nearest.km > S.FAR_KM, String(far.nearest.km));
  assert.equal(far.nearest.dayVisit, false);
});

test('3. the words: town, straight-line distance, what is not checked, far, what is in town, nothing listed', () => {
  const sp = S.readSplit(REQ);
  const near = { id: 77, name: 'Cedar Thermal Spa', region: 'vernon', regionLabel: 'Vernon', km: 18.3, what: 'spa', dayVisit: true };
  const far = { id: 78, name: 'Lakeshore Thermal Spa', region: 'kelowna', regionLabel: 'Kelowna', km: 59.2, what: 'spa', dayVisit: false };
  const alts = [{ id: 8, name: 'Gallery Artiva', label: 'gallery', labelFr: 'galerie' }, { id: 9, name: 'Pond Skating', label: 'skating', labelFr: 'patinage' }];
  const LEAD = 'This plan is one schedule for everyone. For the adult who isn’t skiing: ';
  // Near (40 km or less): named with its town and distance; it is the note's "Add it".
  const a = S.note(sp, { spaStops: [], nearest: near, inTown: false, town: 'SilverStar' });
  assert.equal(a.text, `${LEAD}no spa is listed in SilverStar. The nearest listed is Cedar Thermal Spa in Vernon, outside SilverStar (about 18 km in a straight line). ${CHECK}`);
  assert.equal(a.textFr, 'Ce plan est un seul horaire pour tout le monde. Pour l’adulte qui ne skie pas : aucun spa n’est répertorié à SilverStar. Le plus proche répertorié est Cedar Thermal Spa, à Vernon, hors de SilverStar (environ 18 km à vol d’oiseau). Vérifiez votre date auprès d’eux.');
  assert.deepEqual([a.nearest.id, a.stopIds, a.chip], [77, [], 'One schedule for everyone']);
  // Its own words don't say a visit can be booked by itself: said, in few words.
  assert.equal(S.note(sp, { spaStops: [], nearest: { ...near, dayVisit: false }, town: 'SilverStar' }).text, `${LEAD}no spa is listed in SilverStar. The nearest listed is Cedar Thermal Spa in Vernon, outside SilverStar (about 18 km in a straight line). ${CHECK_DAY}`);
  // Near, with something listed in town: the spa first.
  assert.equal(S.note(sp, { spaStops: [], nearest: near, town: 'SilverStar', alts }).text, `${LEAD}no spa is listed in SilverStar. The nearest listed is Cedar Thermal Spa in Vernon, outside SilverStar (about 18 km in a straight line). Listed in SilverStar, not skiing: Gallery Artiva (gallery) and Pond Skating (skating). ${CHECK}`);
  // Far (over 40 km): said to be far, after what is listed in town, and never the note's "Add it".
  const b = S.note(sp, { spaStops: [], nearest: far, town: 'SilverStar', alts });
  assert.equal(b.text, `${LEAD}no spa is listed in SilverStar. Listed in SilverStar, not skiing: Gallery Artiva (gallery) and Pond Skating (skating). The nearest listed spa is far: Lakeshore Thermal Spa in Kelowna, outside SilverStar (about 59 km in a straight line). ${CHECK}`);
  assert.equal(b.nearest, undefined);
  const c = S.note(sp, { spaStops: [], nearest: far, town: 'SilverStar' });
  assert.equal(c.text, `${LEAD}no spa is listed in SilverStar. The nearest listed spa is far: Lakeshore Thermal Spa in Kelowna, outside SilverStar (about 59 km in a straight line). ${CHECK_DAY}`);
  assert.equal(c.textFr, 'Ce plan est un seul horaire pour tout le monde. Pour l’adulte qui ne skie pas : aucun spa n’est répertorié à SilverStar. Le spa répertorié le plus proche est loin : Lakeshore Thermal Spa, à Kelowna, hors de SilverStar (environ 59 km à vol d’oiseau). Les visites à la journée et votre date ne sont pas vérifiées ici : réservez directement auprès d’eux.');
  assert.equal(c.nearest, undefined);
  assert.equal(S.FAR_KM, 40);
  assert.ok(S.note(sp, { spaStops: [], nearest: { ...near, km: 40 }, town: 'X' }).nearest && !S.note(sp, { spaStops: [], nearest: { ...near, km: 40.6 }, town: 'X' }).nearest);
  // No spa listed anywhere: said; what is listed in town, when there is something.
  assert.equal(S.note(sp, { spaStops: [], nearest: null, town: 'SilverStar', alts: [alts[0]] }).text, `${LEAD}no spa is listed in SilverStar, and none nearby. Listed in SilverStar, not skiing: Gallery Artiva (gallery). ${CHECK}`);
  assert.equal(S.note(sp, { spaStops: [], nearest: null, town: 'SilverStar' }).text, `${LEAD}no spa is listed in SilverStar, and none nearby.`);
  // On the plan: what it calls itself (a spa, a sauna), its day and time.
  assert.equal(S.note(sp, { spaStops: [{ id: 5, name: 'Löyly Floating Sauna', day: 2, start: 840, what: 'sauna', dayVisit: true }], town: 'X' }).text, `${LEAD}Löyly Floating Sauna (day 2, 2 PM) is listed as a sauna. ${CHECK}`);
  assert.equal(S.note(sp, { spaStops: [{ id: 5, name: 'A Spa', day: 1, start: 990, what: 'spa', dayVisit: true }, { id: 6, name: 'B Sauna', day: 3, start: 600, what: 'sauna', dayVisit: false }], town: 'X' }).text, `${LEAD}A Spa (day 1, 4:30 PM) and B Sauna (day 3, 10 AM) are listed as a spa or sauna. ${CHECK_DAY}`);
  for (const n of [a, b, c]) { HONEST(n.text); HONEST(n.textFr); }

  // The chat's answer, from the same facts. One offer, one question.
  const slot = (id) => ({ id, day: 1, start: 840, days: 3 });
  const EFFECT = 'One schedule for everyone: it would go on day 1 at 2 PM for the whole group, so the others can’t be shown skiing then.';
  const q1 = S.chatReply({ spaStops: [], nearest: near, town: 'SilverStar' }, 'en', slot(77));
  assert.deepEqual(q1, { reply: `No spa is listed in SilverStar. The nearest listed is Cedar Thermal Spa in Vernon, outside SilverStar (about 18 km in a straight line). ${EFFECT} ${CHECK}`, ask: 'Add it?', add: { id: 77, name: 'Cedar Thermal Spa' }, label: 'Add it' });
  // Far, with something in town: the thing in town comes first and is the one question; the spa is said to be far
  // and is NOT offered. (The reply names the one place it offers; the plan's note names both.)
  const q2 = S.chatReply({ spaStops: [], nearest: far, town: 'SilverStar', alts }, 'en', slot(8));
  assert.deepEqual(q2, { reply: `No spa is listed in SilverStar. Listed in SilverStar, not skiing: Gallery Artiva (gallery). ${EFFECT} The nearest listed spa is far: Lakeshore Thermal Spa in Kelowna, outside SilverStar (about 59 km in a straight line). ${CHECK}`, ask: 'Add Gallery Artiva?', add: { id: 8, name: 'Gallery Artiva' }, label: 'Add it' });
  assert.equal(S.chatReply({ spaStops: [], nearest: far, town: 'SilverStar', alts: [{ id: 9, name: 'Brewer’s Pond Skating – SilverStar', label: 'skating' }] }, 'en', slot(9)).ask, 'Add Brewer’s Pond Skating?');
  assert.deepEqual(S.chatOffer({ nearest: far, town: 'SilverStar', alts }), { id: 8, name: 'Gallery Artiva', kind: 'alt' });
  // Far and nothing in town: said to be far with its distance, and asked as "Add it anyway?", never a plain "Add it".
  const q3 = S.chatReply({ spaStops: [], nearest: far, town: 'SilverStar' }, 'en', null);
  assert.deepEqual(q3, { reply: `No spa is listed in SilverStar. The nearest listed spa is far: Lakeshore Thermal Spa in Kelowna, outside SilverStar (about 59 km in a straight line). One schedule for everyone: an added stop takes a day and time for the whole group, so the others can’t be shown skiing then. ${CHECK_DAY}`, ask: 'Add it anyway?', add: { id: 78, name: 'Lakeshore Thermal Spa' }, label: 'Add it anyway' });
  // Nothing listed: said, with nothing offered and nothing invented.
  const q4 = S.chatReply({ spaStops: [], nearest: null, town: 'SilverStar' }, 'en', null);
  assert.deepEqual(q4, { reply: 'I don’t list a spa near SilverStar. Name a kind of place (a café, a gallery, a snowshoe trail) and I’ll look. Your plan is one schedule for everyone, and nothing changed.', ask: '', add: null });
  const q5 = S.chatReply({ spaStops: [], nearest: null, town: 'SilverStar', alts: [alts[0]] }, 'en', slot(8));
  assert.deepEqual([q5.reply, q5.ask], [`I don’t list a spa near SilverStar. Listed in SilverStar, not skiing: Gallery Artiva (gallery). ${EFFECT} ${CHECK}`, 'Add it?']);
  // In the plan's own town, not on the plan.
  const q6 = S.chatReply({ spaStops: [], nearest: { ...near, regionLabel: 'SilverStar' }, inTown: true, town: 'SilverStar' }, 'fr', slot(77));
  assert.equal(q6.reply, 'Cedar Thermal Spa, à SilverStar, est répertorié comme spa et n’est pas dans votre plan. Un seul horaire pour tous : cet arrêt irait au jour 1 à 14 h pour tout le groupe; les autres ne peuvent donc pas être montrés en train de skier à ce moment. Vérifiez votre date auprès d’eux.');
  // Short: a phone shows about six lines of a reply before it scrolls.
  for (const q of [q1, q2, q3, q5]) assert.ok(`${q.reply} ${q.ask}`.split(/\s+/).length <= 70, `${q.reply} ${q.ask}`);
  for (const q of [q1, q2, q3, q4, q5, q6]) HONEST(`${q.reply} ${q.ask}`);
});

let PLAN = null;
test('4. the exact request, planned: a spa is named only when the listing is one (never the lodge); party, lessons and chips as they were', () => {
  const p = run(REQ); PLAN = p;
  assert.equal(p.kind, 'multi_day');
  assert.equal((p.days || []).length, 3);
  const ps = p.partySplit;
  assert.ok(ps, 'the plan says what it did for the adult who is not skiing');
  assert.match(ps.text, /^This plan is one schedule for everyone\. For the adult who isn’t skiing: /);
  HONEST(ps.text); HONEST(ps.textFr);
  const stops = tc.planStops(p);
  assert.ok(!stops.some((s) => s.id === F.LODGE.id), 'the lodge is not planned as the spa');
  for (const x of p.notIncluded || []) assert.doesNotMatch(`${x.text} ${JSON.stringify(x.nearest || {})}`, /Keefer|Catskiing/);
  if (ps.stopIds.length) {
    // The planner put a spa on the plan itself: each one named is a listing that is a spa, with its day and time,
    // and only those stops say who they are for.
    for (const id of ps.stopIds) { assert.ok(app.tripIsSpa(id)); assert.ok(stops.some((s) => s.id === id)); }
    assert.match(ps.text, / \(day [1-3], [0-9:]+ [AP]M\)(?: and [^.]+)? (?:is|are) listed as a (?:spa|sauna|spa or sauna)\. (?:Check your date with them|Day visits and your date aren’t checked here: book directly with them)\.$/);
    assert.ok((p.schedule || []).every((r) => !r.forSome || ps.stopIds.includes(r.venueId)));
    assert.equal(ps.nearest, undefined);
  } else {
    // None on the plan: the one named is a listing that is a spa, with its town and its straight-line distance; the
    // note's "Add it" is there only when it is not far.
    assert.match(ps.text, /: (?:no spa is listed in [^.]+\. (?:Listed in [^.]+, not skiing: [^.]+\. )?The nearest listed (?:is|spa is far:) .+ in .+, outside .+ \(about [0-9.]+ km in a straight line\)\.|.+ in .+ is listed as a (?:spa|sauna) but isn’t in this plan\.)/);
    if (ps.nearest) assert.ok(app.tripIsSpa(ps.nearest.id), ps.nearest.name);
    const spaLine = (p.notIncluded || []).find((x) => x.kind === 'spa');
    assert.ok(spaLine && spaLine.split === true);
    assert.ok(!spaLine.nearest || app.tripIsSpa(spaLine.nearest.id), JSON.stringify(spaLine.nearest));
    // The chip: the spa is not ticked.
    assert.ok(LAYOUT.tripSummaryFacts(p, false, {}).some((f) => /^Spa: not in this plan$/.test(f.text)));
  }
  if (!WR) {
    // (On okanaganroam.com the fixture town lists nothing else: the note is exactly this.)
    assert.match(ps.text, new RegExp(`^This plan is one schedule for everyone\\. For the adult who isn’t skiing: no spa is listed in ${TOWN}\\. The nearest listed is ${F.SPA.name} in ${OTHER_TOWN}, outside ${TOWN} \\(about 1[0-3] km in a straight line\\)\\. Listed in ${TOWN}, not skiing: ${F.GALLERY.name} \\(gallery\\)\\. ${CHECK}$`));
  }
  if (!ps.stopIds.length) {
    // On both sites the fixture spa is the nearest listed one (the lodge, nearer, is not a spa) and is the "Add it".
    assert.deepEqual([ps.nearest.id, ps.nearest.name], [F.SPA.id, F.SPA.name]);
    assert.ok(ps.text.includes(`${F.GALLERY.name} (gallery)`), ps.text);
  }
  assert.ok(LAYOUT.tripSummaryFacts(p, false, {}).some((f) => f.ask === 'party_split' && f.text === 'One schedule for everyone'));
  // Kept: the whole party at the hotel, the dates, the lesson said plainly as not in the plan.
  const t = p.whereToStay.trip;
  assert.deepEqual([t.adults, t.kids, t.kidAges, t.arrive, t.leave, t.nights, p.whereToStay.pick.id], [2, 1, [10], '2027-02-12', '2027-02-14', 2, F.HOTEL.id]);
  const lessonIn = (p.requirementResults || []).some((r) => r.kind === 'venue_kind' && r.value === 'ski_lessons' && r.status === 'satisfied');
  const lessonLine = (p.notIncluded || []).find((x) => x.kind === 'ski_lessons');
  if (!lessonIn) { assert.ok(lessonLine, 'the plan says the lesson is not in it'); assert.match(lessonLine.text, /^(?:I couldn’t fit a ski or snowboard lesson into this plan\.|There’s no ski or snowboard lesson listed in .+, so this plan has none\.)/); assert.ok(!lessonLine.split); }
  // The page shows the note's "Add it" only for the place the note offers (ps.nearest: a listed spa that is not far).
  assert.ok(PAGE.includes("return { text: (fr && ps.textFr) || ps.text, add: ps.nearest && ps.nearest.id > 0 ? ps.nearest : null };"));
});

test('5. the exact follow-up question: town, distance, what is not checked, what adding does to the one schedule, one question, nothing changed', async () => {
  let asked = 0;
  app.setTripChatReader(async () => { asked += 1; return { ok: true, ops: [{ o: 'add', kind: 'spa', stops: [], time: null, day: null, n: null, ages: [], region: null, date: null }], cant: null }; });
  try {
    const list = screenOf(PLAN), screen = sent(list), f = factsOf(list);
    // The fixture spa (about 12 km from the fixture town) is the nearest listed one, and not far.
    assert.deepEqual(S.chatOffer(f), { id: F.SPA.id, name: F.SPA.name, kind: 'spa' });
    const r = await say(ASK_MSG, screen);
    assert.equal(asked, 0, 'the AI reader is not asked');
    assert.match(r.reply, new RegExp(`^No spa is listed in ${TOWN}\\. The nearest listed is ${F.SPA.name} in ${OTHER_TOWN}, outside ${TOWN} \\(about 1[0-9] km in a straight line\\)\\. One schedule for everyone: it would go on day [1-3] at [0-9:]+ [AP]M for the whole group, so the others can’t be shown skiing then\\. ${CHECK} Add it\\?$`));
    // The same place, town and distance as the plan's own note (the Details line).
    assert.ok(PLAN.partySplit.text.includes(/The nearest listed is .+? in .+?, outside .+? \(about [0-9.]+ km in a straight line\)\./.exec(r.reply)[0]), PLAN.partySplit.text);
    assert.ok(r.reply.split(/\s+/).length <= 70, r.reply);
    HONEST(r.reply);
    NOTHING_ELSE(r);
    const sayAdd = `${F.SPA.name} [add ${F.SPA.id}]`;
    assert.deepEqual(r.choices, [{ kind: 'say', say: sayAdd, label: 'Add it' }]);
    assert.deepEqual(r.offer, [sayAdd]);
    for (const m of ['what can the non-skier do', 'something for the one who doesn’t ski']) { const x = await say(m, screen); assert.equal(x.reply, r.reply, m); NOTHING_ELSE(x); }
    const fr = await say('Que peut faire l’adulte qui ne skie pas pendant que les autres skient?', screen, { lang: 'fr' });
    assert.match(fr.reply, new RegExp(`^Aucun spa n’est répertorié à ${TOWN}\\. Le plus proche répertorié est ${F.SPA.name}, à ${OTHER_TOWN}, hors de ${TOWN} \\(environ 1[0-9] km à vol d’oiseau\\)\\. Un seul horaire pour tous : cet arrêt irait au jour [1-3] à [0-9]+ h(?: [0-9]+)? pour tout le groupe; les autres ne peuvent donc pas être montrés en train de skier à ce moment\\. Vérifiez votre date auprès d’eux\\. L’ajouter\\?$`));
    assert.equal(asked, 0);
    // With the lodge on the plan it is still not "the spa on your plan".
    const withLodge = await say(ASK_MSG, [...screen, { key: '3-afternoon', id: F.LODGE.id, start: 900 }]);
    assert.match(withLodge.reply, new RegExp(`^No spa is listed in ${TOWN}\\. The nearest listed is ${F.SPA.name} in ${OTHER_TOWN}`));
    NOTHING_ELSE(withLodge);

    // Far: where the spa is about 60 km off, something listed in the trip's own town comes first and is the one
    // question; the spa is said to be far and is not offered.
    const far = await say(ASK_MSG, [{ key: '1-morning', id: F.RHILL.id, start: 540 }]);
    assert.match(far.reply, new RegExp(`^No spa is listed in ${TOWN}\\. Listed in ${TOWN}, not skiing: [^.]+ \\([a-z ]+\\)\\. One schedule for everyone: .+ for the whole group, so the others can’t be shown skiing then\\. The nearest listed spa is far: ${F.RSPA.name} in ${OTHER_TOWN}, outside ${TOWN} \\(about (?:5[5-9]|6[0-5]) km in a straight line\\)\\. ${CHECK} Add .+\\?$`));
    assert.ok(!(far.offer || []).some((o) => o.includes(`[add ${F.RSPA.id}]`)), 'a far spa is not the offer');
    assert.ok(!JSON.stringify(far.choices || []).includes(`[add ${F.RSPA.id}]`));
    HONEST(far.reply);
    NOTHING_ELSE(far);
  } finally { app.setTripChatReader(null); }
});

test('6. Add it: the spa is placed on a free part of a day; the note names it with its day and time; every other stop, each repeat and the hotel party stay', async () => {
  const list = screenOf(PLAN), screen = sent(list);
  // (The plan visits the hill on more than one day: the repeats this must keep.)
  const hills = list.filter((s) => s.id === F.HILL.id).length;
  assert.ok(hills >= 2, JSON.stringify(list.map((s) => [s.key, s.name])));
  const q = await say(ASK_MSG, screen);
  const told = /it would go on day ([1-3]) at ([0-9:]+ [AP]M) for the whole group/.exec(q.reply);
  assert.ok(told, q.reply);
  const r = await say(q.offer[0], screen, { offer: q.offer });
  assert.ok(r.plan, r.reply);
  // The reply: where it went (the day and time the answer said), its town and distance, what to check, the one
  // schedule, and that nothing else changed.
  assert.match(r.reply, new RegExp(`^Added ${F.SPA.name} on day ${told[1]} at ${told[2]}\\. It’s in ${OTHER_TOWN}, outside ${TOWN} \\(about 1[0-9] km in a straight line\\)\\. ${CHECK} It’s on the one shared schedule, for the whole group\\. Nothing else changed\\.$`));
  HONEST(r.reply);
  const after = tc.planStops(r.plan);
  assert.equal(after.length, screen.length + 1);
  // Every stop that was there is there, in its own slot at its own time: the hill on each of its days.
  for (const s of screen) { const x = after.find((y) => y.key === s.key); assert.deepEqual([x && x.id, x && x.start], [s.id, s.start], s.key); }
  assert.equal(after.filter((s) => s.id === F.HILL.id).length, hills);
  const fresh = after.find((s) => s.id === F.SPA.id);
  assert.deepEqual(r.changed, [fresh.key]);
  assert.equal(fresh.day, Number(told[1]));
  // The note now names the spa with its day and time; its stop says who it is for (no other stop does).
  const ps = r.plan.partySplit;
  assert.equal(ps.text, `This plan is one schedule for everyone. For the adult who isn’t skiing: ${F.SPA.name} (day ${fresh.day}, ${told[2]}) is listed as a spa. ${CHECK}`);
  assert.deepEqual([ps.stopIds, ps.nearest], [[F.SPA.id], undefined]);
  assert.ok((r.plan.schedule || []).some((x) => x.venueId === F.SPA.id && x.forSome && x.forSome.note === 'For the adult who isn’t skiing.'));
  assert.ok(!(r.plan.schedule || []).some((x) => x.venueId !== F.SPA.id && x.forSome));
  // The hotel and its party are as they were.
  if (r.plan.whereToStay) { const t = r.plan.whereToStay.trip; assert.deepEqual([t.adults, t.kids, t.kidAges, r.plan.whereToStay.pick.id], [2, 1, [10], F.HOTEL.id]); }
  for (const k of ['party', 'stayBlock', 'stayPref', 'stayForce', 'stayDates']) assert.equal(r[k], undefined, k);
  // Asked again with the spa on the plan: it is named with its time, and nothing is offered.
  const again = await say(ASK_MSG, after.map((s) => ({ key: s.key, id: s.id, start: s.start })));
  assert.equal(again.reply, `${F.SPA.name} (day ${fresh.day}, ${told[2]}) is listed as a spa on your plan, at that time for the whole group. ${CHECK} Your plan is one schedule for everyone, and nothing changed.`);
  assert.equal(again.choices, undefined);
  NOTHING_ELSE(again);
  // Undo is the page's own: it puts back the snapshot it took before sending (the plan without the spa, and its note).
  assert.match(CHAT_PAGE, /chat\.undo = planTouched \? snap : null;/);
  // An add of something that is not a spa on this trip says it is on the one schedule, and gives no spa caveat.
  const tag = `${F.GALLERY.name} [add ${F.GALLERY.id}]`;
  const g = await say(tag, screen, { offer: [tag] });
  assert.match(g.reply, new RegExp(`^Added ${F.GALLERY.name} on day [1-3] at [0-9:]+ [AP]M\\. It’s on the one shared schedule, for the whole group\\. Nothing else changed\\.$`));
  // A trip with nobody said to be not skiing gets neither line.
  const plain = await say(tag, screen, { offer: [tag], text: REQ.replace(' Two of us are beginners and want ski lessons; one adult does not ski and would prefer a spa or another relaxing activity.', '') });
  assert.doesNotMatch(plain.reply, /shared schedule|Check your date with them/);
});

test('7. the shared copy and the copied text carry the same note and every repeated visit; the lodge is never the spa', async () => {
  const before = screenOf(PLAN);
  const link = (list, extra = {}) => ({ stops: list.map((s) => `venue:${s.id}`).join(','), days: list.map((s) => s.day).join(','), t: list.map((s) => (Number.isInteger(s.start) ? s.start : '')).join(','), td: '2027-02-12_2027-02-14', ts: 'r', stay: String(F.HOTEL.id), nights: '2', ad: '2', kids: '1', ka: '10', rm: '1', ra: '1', asks: 'kind:ski_lessons,kind:spa,kid_friendly', ni: 'ski_lessons:f,spa:f', nt: REGION, ps: '1a.s', ...extra });
  const NOW = new Date('2026-11-24T18:00:00Z');
  // A link made on the live site before this fix carried the lodge as the nearest spa (ni=spa:f:<lodge>): the copy
  // works the note out again from the listings and never names it.
  const c = app.tripShareContext(link(before, { ni: `ski_lessons:f,spa:f:${F.LODGE.id}` }), 'en', NOW);
  const texts = c.lines.map((l) => l.text);
  const note = texts.find((x) => /^This plan is one schedule for everyone\./.test(x));
  // The copy says the plan's own note, word for word (worked out again from the link's stops and the listings).
  if (!PLAN.partySplit.stopIds.length) assert.equal(note, PLAN.partySplit.text);
  assert.match(note, new RegExp(`no spa is listed in ${TOWN}\\. The nearest listed is ${F.SPA.name} in ${OTHER_TOWN}, outside ${TOWN} \\(about 1[0-9] km in a straight line\\)\\. Listed in ${TOWN}, not skiing: [^.]*${F.GALLERY.name} \\(gallery\\)\\. ${CHECK}$`));
  for (const x of texts) { assert.doesNotMatch(x, /Keefer|Catskiing/, x); }
  HONEST(note);
  assert.ok(texts.includes('I couldn’t fit a ski or snowboard lesson into this plan.') || (PLAN.requirementResults || []).some((r) => r.value === 'ski_lessons' && r.status === 'satisfied'), JSON.stringify(texts));
  assert.ok(!texts.some((x) => /couldn’t fit a spa|Spa: not in this plan/.test(x)), 'the spa is said once, by the note');
  // Every visit is on the copy, each repeat with its own day and time (the hill on each of its days).
  const q = link(before), back = new URLSearchParams(app.tripShareSearch(q).replace(/^\?/, ''));
  assert.deepEqual([back.get('stops'), back.get('days'), back.get('t'), back.get('ps')], [q.stops, q.days, q.t, '1a.s']);
  const hills = before.filter((s) => s.id === F.HILL.id).length;
  assert.ok(hills >= 2 && back.get('stops').split(',').filter((r) => r === `venue:${F.HILL.id}`).length === hills);
  assert.deepEqual(c.times, before.map((s) => s.start));
  // The party is the request's.
  assert.deepEqual([c.adults, c.kids, c.kidAges, c.stay.id], [2, 1, [10], F.HOTEL.id]);
  const html = app.tripShareContextHtml(c, 'en');
  assert.ok(html.includes(F.SPA.name) && !/Keefer|Catskiing/.test(html));
  assert.match(html, /2 adults, 1 kid/);
  // An older link with no ps= that carried the lodge as the nearest spa: the copy's own line names no nearest place.
  { const { ps, ...old } = link(before, { ni: `ski_lessons:f,spa:f:${F.LODGE.id}` }); const lines = app.tripShareContext(old, 'en', NOW).lines.map((l) => l.text);
    assert.ok(ps && lines.includes('I couldn’t fit a spa into this plan.'), JSON.stringify(lines)); for (const x of lines) assert.doesNotMatch(x, /Keefer|Catskiing/, x);
    // …while a listed spa in such a link is still named.
    assert.ok(app.tripShareContext({ ...old, ni: `ski_lessons:f,spa:f:${F.SPA.id}` }, 'en', NOW).lines.some((l) => l.text === `I couldn’t fit a spa into this plan. The nearest is ${F.SPA.name} in ${OTHER_TOWN}.`)); }
  // French.
  assert.match(app.tripShareContext(link(before), 'fr', NOW).lines.find((l) => l.ask === 'party_split').text, new RegExp(`aucun spa n’est répertorié à ${TOWN}\\. Le plus proche répertorié est ${F.SPA.name}, à ${OTHER_TOWN}, hors de ${TOWN} \\(environ 1[0-9] km à vol d’oiseau\\)\\. À ${TOWN}, sans ski : [^.]*${F.GALLERY.name} \\(galerie\\)`));
  // The lodge as a stop of a link is a stop like any other: never "listed as a spa", never "For the adult…".
  const withLodge = app.tripShareContext(link([...before, { id: F.LODGE.id, day: 3, start: 900 }]), 'en', NOW);
  assert.ok(!withLodge.lines.some((l) => /is listed as a spa/.test(l.text)), JSON.stringify(withLodge.lines.map((l) => l.text)));
  assert.ok(!((withLodge.actNotes || {})[`venue:${F.LODGE.id}`] || { lines: [] }).lines.includes('For the adult who isn’t skiing.'));
  // With the spa added: the copy names it with its day and time, and its stop says who it is for.
  const withSpa = app.tripShareContext(link([...before, { id: F.SPA.id, day: 3, start: 1005 }], { ni: 'ski_lessons:f' }), 'en', NOW);
  assert.ok(withSpa.lines.some((l) => l.text === `This plan is one schedule for everyone. For the adult who isn’t skiing: ${F.SPA.name} (day 3, 4:45 PM) is listed as a spa. ${CHECK}`), JSON.stringify(withSpa.lines.map((l) => l.text)));
  assert.deepEqual(withSpa.actNotes[`venue:${F.SPA.id}`].lines.slice(-1), ['For the adult who isn’t skiing.']);
  // The copied text is the page's: its lines end with the note as the page shows it (v4SplitNote).
  assert.ok(PAGE.includes("var psT = v4SplitNote();") && PAGE.includes("if (psT) lines.push(psT.text);"));
});
