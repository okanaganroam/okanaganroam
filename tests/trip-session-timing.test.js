'use strict';
// Build My Trip: a stop that runs on sessions, lanes or booked slots we do not hold (Dayton's report on the live site:
// "Plan 2 days in Penticton on December 5–6, 2026 for two adults and kids aged 6 and 9…" put a parkour gym at an exact
// time on Sunday, on the plan and on the shared trip, with no word that its sessions and the children's ages need
// checking). The gym's listing holds no hours and the site holds no session of any kind, so the time is only the
// planner's suggestion.
//   1. each kind maps to what must be checked, in English and French, from the listing's kinds, else its name, else
//      its own words                    2. the exact request with a parkour gym: "around", the check-sessions sentence
//      with ages 6 and 9, the listing's stored link     3. a listing that states ages is quoted, never guessed; a badge
//      is not an age statement         4. a walk-in place, an event and a tour keep their own lines; the cinema is as
//      it was                          5. the Book my trip sheet and the shared copy carry the stop   6. the chat
//   7. the collapsed card and the shared copy say it in one short line: "Suggested time · Check sessions ↗"
// No network.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.ANTHROPIC_API_KEY;
const tt = require('../trip-timing.js');
const tc = require('../trip-chat.js');
const app = require('../server.js');
const db = require('../db.js');

const SITE = require('../trip-site.js');
const TOWN = (SITE.TRIP_SITE || SITE).key === 'whistler' || /whistler/i.test(JSON.stringify((SITE.TRIP_SITE || SITE).brand || '')) ? { region: 'whistler', label: 'Whistler', addr: '4010 Whistler Way, Whistler, BC', lat: 50.1146, lng: -122.9548 } : { region: 'penticton', label: 'Penticton', addr: '273 Power Street, Penticton, BC', lat: 49.5003, lng: -119.5953 };
const NOW = new Date('2026-11-23T18:00:00Z');
const EXACT = `Plan 2 days in ${TOWN.label} on December 5–6, 2026 for two adults and kids aged 6 and 9. We want indoor activities, a kid-friendly lunch, a hotel with a pool and a relaxed pace.`;
const V4 = require('../trip-planner-v4-page.js').V4_CLIENT_SRC;
const SERVER = fs.readFileSync(require.resolve('../server.js'), 'utf8');

// Fixture listings, removed again at the end: a parkour gym with no hours (as the real one), a gymnastics gym with
// hours and its own Ages line, a bowling centre with a booking link, and a museum with hours.
const FIX = {};
const mk = (key, o) => { FIX[key] = app.createVenue({ region: TOWN.region, address: TOWN.addr, latitude: TOWN.lat, longitude: TOWN.lng, ...o }); return FIX[key]; };
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '20:00']]])));
test.before(() => {
  mk('parkour', { type: 'indoor', slug: 'session-fixture-parkour', name: 'Fixture Parkour & Movement', website: 'https://fixture-parkour.example.com/', kid_friendly: 1,
    description: 'Indoor parkour gym with vaults, bars and walls, where kids, teens and adults can join supervised open-gym sessions.' });
  mk('gym', { type: 'indoor', slug: 'session-fixture-gymnastics', name: 'Fixture Gymnastics (Drop-in Gym)', website: 'https://fixture-gymnastics.example.com/', hours: WEEK, description: 'A club that opens its gym for drop-in sessions.' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(FIX.gym.id, JSON.stringify({ rows: [{ label: 'Ages', text: 'Open gym is for all ages; classes run from age 3 up to adult levels.' }], booking_url: 'https://portal.example.com/register?org=1', booking_label: 'Register' }));
  mk('bowl', { type: 'indoor', slug: 'session-fixture-lanes', name: 'Fixture Lanes', website: 'https://fixture-lanes.example.com/', description: 'Ten-pin bowling for ages 5 and up.' });
  db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?)').run(FIX.bowl.id, 'https://fixture-lanes.example.com/book-a-lane');
  mk('museum', { type: 'indoor', slug: 'session-fixture-museum', name: 'Fixture Museum & Archives', website: 'https://fixture-museum.example.com/', hours: WEEK, description: 'Local history exhibits and a film about the valley.' });
});
test.after(() => {
  for (const v of Object.values(FIX)) { for (const t of ['venue_visit_info', 'venue_links']) { try { db.prepare(`DELETE FROM ${t} WHERE venue_id = ?`).run(v.id); } catch (e) { /* no row */ } } db.prepare('DELETE FROM venues WHERE id = ?').run(v.id); }
  try { app.server.close(); } catch (e) { /* not listening */ }
});

test('1. each kind of schedule maps to what must be checked, in English and French', () => {
  const cases = [
    // [listing, kinds on file, the kind, the sentence (EN), the link's label (EN), the sentence (FR), the link's label (FR)]
    [{ name: 'Ethos Parkour & Movement', type: 'indoor' }, [], 'dropin', 'Sessions and drop-in times vary: check Ethos Parkour & Movement’s schedule.', 'Check sessions', 'Les séances et les heures libres varient : vérifiez l’horaire de Ethos Parkour & Movement.', 'Voir les séances'],
    [{ name: 'Any Name', type: 'indoor' }, ['climbing'], 'dropin', 'Sessions and drop-in times vary: check Any Name’s schedule.', 'Check sessions', 'Les séances et les heures libres varient : vérifiez l’horaire de Any Name.', 'Voir les séances'],
    [{ name: 'Any Name', type: 'indoor' }, ['kids'], 'dropin', null, 'Check sessions', null, 'Voir les séances'],
    [{ name: 'Springers Gymnastics', type: 'indoor' }, [], 'dropin', null, 'Check sessions', null, 'Voir les séances'],
    [{ name: 'Airhouse', type: 'indoor', description: 'A freestyle training centre with trampolines and parkour areas.' }, [], 'dropin', null, 'Check sessions', null, 'Voir les séances'],
    [{ name: 'Kobau Lanes', type: 'indoor' }, [], 'lanes', 'Lanes can be fully booked: check Kobau Lanes’s lane times.', 'Book a lane', 'Les allées peuvent être toutes réservées : vérifiez les disponibilités des allées de Kobau Lanes.', 'Réserver une allée'],
    [{ name: 'Any Name', type: 'indoor' }, ['bowling'], 'lanes', null, 'Book a lane', null, 'Réserver une allée'],
    [{ name: 'Beyond Belief Escape Rooms', type: 'indoor' }, [], 'rooms', 'Rooms are booked by time slot: check Beyond Belief Escape Rooms’s room times.', 'Book a room', 'Les salles se réservent par plage horaire : vérifiez les plages horaires de Beyond Belief Escape Rooms.', 'Réserver une salle'],
    [{ name: 'Any Name', type: 'indoor' }, ['escape'], 'rooms', null, 'Book a room', null, 'Réserver une salle'],
    [{ name: 'Penticton Virtual Reality Studio', type: 'indoor' }, [], 'booked', 'Sessions are booked by time slot: check Penticton Virtual Reality Studio’s session times.', 'Check sessions', 'Les séances se réservent par plage horaire : vérifiez l’horaire des séances de Penticton Virtual Reality Studio.', 'Voir les séances'],
    [{ name: 'Forged Axe Throwing', type: 'indoor' }, [], 'booked', null, 'Check sessions', null, 'Voir les séances'],
    [{ name: 'Kelowna Karting & Entertainment', type: 'indoor' }, [], 'booked', null, 'Check sessions', null, 'Voir les séances'],
    [{ name: 'Fun Centre', type: 'indoor', description: 'Laser tag and an arcade.' }, ['games'], 'booked', null, 'Check sessions', null, 'Voir les séances'],
    [{ name: 'McLaren Park Arena', type: 'sport' }, [], 'skate', 'Public skate times vary: check McLaren Park Arena’s public skate times.', 'Check public skate times', 'Les heures de patinage public varient : vérifiez l’horaire du patinage public de McLaren Park Arena.', 'Voir le patinage public'],
    [{ name: 'Any Name', type: 'sport' }, ['rink'], 'skate', null, 'Check public skate times', null, 'Voir le patinage public'],
    [{ name: 'Olympic Plaza Skating Rink', type: 'outdoor' }, [], 'skate', null, 'Check public skate times', null, 'Voir le patinage public'],
    [{ name: 'Scandinave Spa', type: 'indoor' }, [], 'spa', 'Spa and sauna sessions are booked ahead: check Scandinave Spa’s available times.', 'Book a session', 'Les séances de spa et de sauna se réservent à l’avance : vérifiez les disponibilités de Scandinave Spa.', 'Réserver une séance'],
    [{ name: 'Shelter Floating Sauna', type: 'indoor' }, [], 'spa', null, 'Book a session', null, 'Réserver une séance'],
    [{ name: 'bubly Tube Park', type: 'outdoor' }, [], 'tickets', 'Tickets are for timed sessions: check bubly Tube Park’s ticket times.', 'Check ticket times', 'Les billets sont pour des séances à heure fixe : vérifiez l’horaire des billets de bubly Tube Park.', 'Voir les heures des billets'],
    [{ name: 'Tiny Winery', type: 'winery', description: 'A tiny, appointment-only winery. Book ahead.' }, [], 'appointment', 'Tastings are by appointment: check Tiny Winery’s tasting times.', 'Book a tasting', 'Les dégustations sont sur rendez-vous : vérifiez les heures de dégustation de Tiny Winery.', 'Réserver une dégustation'],
    [{ name: 'Any Winery', type: 'winery', appointment: true }, [], 'appointment', null, 'Book a tasting', null, 'Réserver une dégustation'],
    [{ name: 'Pearl & Fern Pottery Studio', type: 'indoor' }, [], 'classes', 'Class times vary: check Pearl & Fern Pottery Studio’s class times.', 'Check class times', 'L’horaire des cours varie : vérifiez l’horaire des cours de Pearl & Fern Pottery Studio.', 'Voir l’horaire des cours'],
    [{ name: 'Community Centre (Pool & Lazy River)', type: 'indoor' }, [], 'sessions', null, 'Check session times', null, 'Voir l’horaire des séances'],
    [{ name: 'Landmark Cinemas 7 Penticton', type: 'indoor' }, [], 'showtimes', 'Showtimes vary: check Landmark Cinemas 7 Penticton’s showtimes.', 'Check showtimes', 'Les séances varient : vérifiez l’horaire des séances de Landmark Cinemas 7 Penticton.', 'Voir les séances'],
  ];
  for (const [v, kinds, kind, en, linkEn, fr, linkFr] of cases) {
    assert.equal(tt.scheduleKind(v, kinds), kind, `${v.name} [${kinds}]`);
    if (en) assert.equal(tt.ttCheck({ schedule: kind }, v.name, false), en);
    if (fr) assert.equal(tt.ttCheck({ schedule: kind }, v.name, true), fr);
    assert.equal(tt.ttLink(kind, false), linkEn); assert.equal(tt.ttLink(kind, true), linkFr);
  }
  // Places you simply walk into, and words that only look like a schedule, are not marked.
  for (const [v, kinds] of [
    [{ name: 'Penticton Museum & Archives', type: 'indoor', description: 'Exhibits, and a film about the lake.' }, []], [{ name: 'Any Name', type: 'indoor' }, ['museum']], [{ name: 'Any Name', type: 'indoor' }, ['gallery']],
    [{ name: 'Scandia Golf & Games', type: 'indoor', description: 'An arcade and indoor mini golf.' }, ['games']], [{ name: 'The Escape Bistro', type: 'restaurant' }, []], [{ name: 'Skaha Bluffs Climbing', type: 'outdoor' }, []],
    [{ name: 'Park Climbing Boulder', type: 'sport', description: 'Short bouldering problems close to the ground.' }, []], [{ name: 'Armstrong Skate Park', type: 'sport', description: 'A skate park beside the pool.' }, []],
    [{ name: 'Open Winery', type: 'winery', description: 'Walk-ins welcome; reservations are recommended but not required. Tours by appointment.' }, []], [{ name: 'Any Winery', type: 'winery', appointment: false, description: 'An appointment-only winery.' }, []],
    [{ name: 'Lakeside Park', type: 'outdoor' }, []], [{ name: 'Okanagan Lake Beach', type: 'beach' }, []],
  ]) assert.equal(tt.scheduleKind(v, kinds), null, v.name);
  // The page's script carries the same table and functions (one place for the words).
  for (const s of ['var TT_WORDS = ', 'function ttCheck(', 'Sessions and drop-in times vary', 'Check sessions', 'Book a lane', 'Book a room', 'Check public skate times', 'Voir le patinage public', 'Réserver une allée']) assert.ok(V4.includes(s), s);
  assert.doesNotThrow(() => new Function(tt.clientSource()));
  assert.ok(SERVER.includes("${require('./trip-timing').clientSource()}"), 'the shared page too');
});

test('2. the exact request with a parkour gym: a suggested time, the check-sessions sentence with ages 6 and 9, the stored link', () => {
  // The gym on the plan (Sunday morning as reported; another slot where an event of that day already holds it).
  let p = null, slot = null;
  for (const k of ['2-morning', '1-morning', '2-afternoon', '1-afternoon']) { try { p = app.runTripPlanWithStay({ text: EXACT, v4: true, stay: null, pinned: { [k]: FIX.parkour.id } }, undefined, NOW); slot = k; break; } catch (e) { p = null; } }
  assert.ok(p, 'the request plans with the gym pinned');
  const row = (p.schedule || []).find((r) => r.venueId === FIX.parkour.id);
  assert.ok(row, 'the parkour gym is on the plan');
  assert.equal(row.date, slot[0] === '2' ? '2026-12-06' : '2026-12-05');
  // What is verified: nothing about its time. The listing holds no hours, and no session is stored anywhere.
  assert.deepEqual(row.timing, { schedule: 'dropin', checkUrl: 'https://fixture-parkour.example.com/', kidAges: [6, 9], hours: 'unknown' });
  const en = tt.suggestedLine(row.startMinutes, row.timing, FIX.parkour.name, false), fr = tt.suggestedLine(row.startMinutes, row.timing, FIX.parkour.name, true);
  assert.equal(en, `Suggested: around ${tt.clock(row.startMinutes, false)}. Sessions and drop-in times vary: check Fixture Parkour & Movement’s schedule and that it suits ages 6 and 9.`);
  assert.equal(fr, `Heure suggérée : vers ${tt.clock(row.startMinutes, true)}. Les séances et les heures libres varient : vérifiez l’horaire de Fixture Parkour & Movement et qu’il convient aux enfants de 6 et 9 ans.`);
  assert.doesNotMatch(en, /–|allow about|\d h\b/, 'no end time and no invented length');
  assert.equal(tt.ttLink(row.timing.schedule, false), 'Check sessions');
  // The Kid-Friendly badge is on the listing and is not an age statement.
  assert.equal(row.timing.agesSaid, undefined);
  // The card: "around" on the pill; the expanded line is the table's sentence with one link to the stored link (the
  // listing's own page, "View details", when it stores none); its listed hours are still said when it has them.
  assert.match(V4, /r\.timing && r\.timing\.schedule \? \(lang\(\) === 'fr' \? 'vers ' : 'around '\) : ''/);
  assert.match(V4, /esc\(ttCheck\(tm, name, fr\)\) \+ \(open \? /, 'the sentence, then its listed hours; the link is the card’s note above (test 7)');
  // A party with children but no ages given: "your kids". One child: "age 6". No children: no age line at all.
  const t = (party) => tt.rowTiming({ startMinutes: 540, confirmationReasons: ['hours'] }, app.tripTimingVenue(FIX.parkour.id), [], null, party);
  assert.equal(tt.ttCheck(t({ kids: 2 }), 'X', false), 'Sessions and drop-in times vary: check X’s schedule and that it suits your kids.');
  assert.equal(tt.ttCheck(t({ kidAges: [6] }), 'X', false), 'Sessions and drop-in times vary: check X’s schedule and that it suits age 6.');
  assert.equal(tt.ttCheck(t(null), 'X', false), 'Sessions and drop-in times vary: check X’s schedule.');
  assert.deepEqual(app.tripTimingParty({ kids: 2, kidAges: [6, 9] }), { kidAges: [6, 9] });
  assert.deepEqual(app.tripTimingParty({ kids: 2 }), { kids: 2 });
  assert.equal(app.tripTimingParty({ adults: 2 }), null);
});

test('3. a listing that states ages is quoted, never guessed; its listed hours are said, and the time stays a suggestion', () => {
  // Its own Ages line (Plan your visit), in its words; in French the plain reading.
  const gym = app.tripTimingVenue(FIX.gym.id, '2026-12-06', 540);
  assert.deepEqual(gym.ages, { en: 'Its listing says: “Open gym is for all ages”.', fr: 'Sa fiche indique : tous les âges.' });
  const t = tt.rowTiming({ startMinutes: 540, status: 'estimated' }, gym, [], null, { kidAges: [6, 9] });
  assert.deepEqual(t, { schedule: 'dropin', checkUrl: 'https://fixture-gymnastics.example.com/', agesSaid: gym.ages, open: { a: 540, b: 1200, wd: 'sun' }, hours: 'listed' });
  assert.equal(tt.suggestedLine(540, t, FIX.gym.name, false), 'Suggested: around 9 AM. Sessions and drop-in times vary: check Fixture Gymnastics (Drop-in Gym)’s schedule. Its listing says: “Open gym is for all ages”.');
  // Open is not a session: the hours are said, the time is still "around".
  assert.equal(tt.ttOpen(t, false), 'Open 9 AM–8 PM Sun by its listed hours.');
  assert.equal(tt.ttOpen(t, true), 'Ouvert de 9 h à 20 h dim. selon ses heures indiquées.');
  // Checking sessions is the website's job; a registration portal is not where sessions are checked.
  assert.equal(t.checkVia, undefined);
  // A minimum age in its own story: "Its listing says ages 5+." A booked kind opens its stored booking link.
  const bowl = app.tripTimingVenue(FIX.bowl.id);
  assert.deepEqual(bowl.ages, { en: 'Its listing says ages 5+.', fr: 'Sa fiche indique : 5 ans et plus.' });
  const tb = tt.rowTiming({ startMinutes: 600, confirmationReasons: ['hours'] }, bowl, [], null, { kidAges: [6, 9] });
  assert.deepEqual(tb, { schedule: 'lanes', checkUrl: 'https://fixture-lanes.example.com/book-a-lane', checkVia: 'booking', agesSaid: bowl.ages, hours: 'unknown' });
  assert.equal(tt.ttCheck(tb, 'Fixture Lanes', false), 'Lanes can be fully booked: check Fixture Lanes’s lane times. Its listing says ages 5+.');
  // What counts as an age statement, and what does not.
  for (const [text, en] of [['All ages.', 'all ages'], ['Ages 8 and up.', 'ages 8+'], ['19 and over.', 'ages 19+'], ['for kids 1 to 12', 'ages 1 to 12'], ['minimum age 10', 'ages 10+'], ['À partir de 8 ans.', 'ages 8+']]) assert.equal((tt.agePhrase(text) || {}).en, en, text);
  for (const text of ['drop-in hockey for 16+ and 55+', 'a 35+ game arcade', 'Kid-Friendly', 'kids, teens and adults can join', 'open since 2010']) assert.equal(tt.agePhrase(text), null, text);
  assert.equal(tt.agesStated({ rows: [], description: 'Fun for kids, teens and adults.' }), null);
  // No stored link at all: no link is invented.
  assert.equal(tt.checkLink('dropin', { website: 'http://not-https.example.com' }), null);
  assert.deepEqual(tt.checkLink('dropin', { bookingUrl: 'https://book.example.com/x' }), { url: 'https://book.example.com/x', via: 'booking' });
});

test('4. a walk-in place, an event and a tour keep their own lines; the cinema is as it was', () => {
  const cinema = { name: 'Landmark Cinemas 7 Penticton', type: 'indoor', website: 'https://www.landmarkcinemas.com/penticton' };
  const p = { schedule: [
    { day: 1, venueId: FIX.museum.id, date: '2026-12-05', status: 'estimated', startMinutes: 600, endMinutes: 690 },
    { day: 1, eventId: 7, status: 'estimated', startMinutes: 840, endMinutes: 960 },
    { day: 1, venueId: 3, status: 'estimated', startMinutes: 990, endMinutes: 1050, departure: true },
    { day: 1, venueId: 4, status: 'estimated', startMinutes: 1060, endMinutes: 1120, bookDeparture: true },
    { day: 1, venueId: 2, status: 'provisional', startMinutes: 1185, endMinutes: 1245, confirmationReasons: ['hours', 'visit_duration', 'travel'] },
  ] };
  tt.applyTiming(p, () => [], (id, row) => (id === 2 ? cinema : id === FIX.museum.id ? app.tripTimingVenue(id, row.date, row.startMinutes) : { name: 'Tour', type: 'tour' }), { kidAges: [6, 9] });
  assert.deepEqual(p.schedule[0].timing, { hours: 'listed' }, 'a museum with listed hours: "Within its listed hours."');
  assert.equal(p.schedule[1].timing, undefined, 'an event keeps its own start time');
  assert.equal(p.schedule[2].timing, undefined, 'a stored tour departure is said as it is');
  assert.equal(p.schedule[3].timing, undefined, '"book a departure time" stays');
  assert.deepEqual(p.schedule[4].timing, { schedule: 'showtimes', allowMinutes: 120, checkUrl: 'https://www.landmarkcinemas.com/penticton', hours: 'unknown' }, 'the cinema, with children in the party, is as it was');
  assert.equal(tt.suggestedLine(1185, p.schedule[4].timing, cinema.name, false), 'Suggested: around 7:45 PM, allow about 2 h. Showtimes vary: check Landmark Cinemas 7 Penticton’s showtimes.');
  assert.equal(tt.suggestedLine(1185, p.schedule[4].timing, cinema.name, true), 'Heure suggérée : vers 19 h 45, prévoyez environ 2 h. Les séances varient : vérifiez l’horaire des séances de Landmark Cinemas 7 Penticton.');
  for (const s of ['Within its listed hours.', 'Hours not verified: check before you go.', 'Dans ses heures indiquées.', 'Heures non vérifiées : à confirmer.']) assert.ok(V4.includes(s), s);
});

test('5. the Book my trip sheet and the shared copy carry the parkour stop', () => {
  // The sheet lists every scheduled stop under "Times to check" with the kind's own link label and a short age note.
  assert.ok(V4.includes("r.timing.schedule && TT_WORDS[r.timing.schedule] && typeof r.startMinutes === 'number') timed.push("));
  assert.ok(V4.includes("fr ? 'Horaires à vérifier' : 'Times to check'") && V4.includes('esc(ttLink(tm.schedule, fr))') && V4.includes('ages = ttAgeShort(tm, fr)'));
  assert.equal(tt.ttAgeShort({ kidAges: [6, 9] }, false), 'check ages 6 and 9');
  assert.equal(tt.ttAgeShort({ kidAges: [6, 9] }, true), 'vérifiez l’âge (6 et 9 ans)');
  assert.equal(tt.ttAgeShort({ agesSaid: { en: 'x', fr: 'x' } }, false), '');
  // The shared copy reads the listing again: the kind, the stored link, and the age line from the ages the link carries.
  const refs = [`venue:${FIX.parkour.id}`, `venue:${FIX.gym.id}`, `venue:${FIX.museum.id}`];
  const [pk, gym, museum] = app.tripStopsFor(refs, NOW, {}, { kidAges: [6, 9] });
  assert.equal(pk.sched, 'dropin'); assert.equal(pk.schedUrl, 'https://fixture-parkour.example.com/'); assert.deepEqual(pk.schedAges, { kidAges: [6, 9] });
  assert.equal(tt.ttAgeNote({ schedule: pk.sched, ...pk.schedAges }, false), 'Check it suits ages 6 and 9.');
  assert.equal(tt.ttAgeNote({ schedule: pk.sched, ...pk.schedAges }, true), 'Vérifiez qu’il convient aux enfants de 6 et 9 ans.');
  assert.deepEqual(gym.schedAges, { agesSaid: { en: 'Its listing says: “Open gym is for all ages”.', fr: 'Sa fiche indique : tous les âges.' } });
  assert.equal(museum.sched, undefined, 'a walk-in place is not marked');
  // An older link (no ages, no party): the stop is still marked, with no age line.
  const [old] = app.tripStopsFor([refs[0]], NOW);
  assert.equal(old.sched, 'dropin'); assert.equal(old.schedAges, undefined);
  // The page asks for the stops with the link's ages (ka=6,9), and prints "around", why, the link and the age line.
  assert.ok(SERVER.includes("(sharedKa ? '&ka=' + sharedKa : '')"));
  assert.match(SERVER, /if \(sk\) tx = \(fr \? 'vers ' : 'around '\) \+ tx;/);
  assert.ok(SERVER.includes("ttNote({ schedule: sk }, d.name || x.s.name, fr, skTo, skTo === d.schedUrl && !!skTo, esc, '')") && SERVER.includes('data-mt-sched-ages'));
});

test('6. the chat answers about the time, the ages and booking from the same data', async () => {
  const text = EXACT;
  const stops = [{ key: '1-morning', id: FIX.bowl.id, start: 600 }, { key: '2-morning', id: FIX.parkour.id, start: 540 }, { key: '2-afternoon', id: FIX.gym.id, start: 840 }];
  const turn = async (message, lang = 'en') => {
    const v = app.parseTripChatBody({ message, lang, plan: { text, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops, dayDates: ['2026-12-05', '2026-12-06'], tripSource: 'request' }, { stays: true });
    assert.ok(v.value, JSON.stringify(v.error));
    const r = (await app.runTripChatTurn(v.value, { staysOn: true, lang })).response;
    assert.ok(!r.plan && !r.stayBlock, `${message}: a question changes nothing`);
    return r.reply;
  };
  assert.match(await turn('what time is parkour?'), /^I don’t have session and drop-in times\. The plan allows around 9 AM; check Fixture Parkour & Movement’s schedule for .+\.$/);
  assert.equal(await turn('is the parkour gym ok for a 6 year old?'), 'Fixture Parkour & Movement’s listing doesn’t state an age range, so I can’t confirm it suits a 6-year-old. Check with them before you go.');
  assert.equal(await turn('is the gymnastics gym ok for a 6 year old?'), 'Its listing says: “Open gym is for all ages”. I can’t confirm it suits a 6-year-old: check with Fixture Gymnastics (Drop-in Gym) before you go.');
  assert.equal(await turn('do we need to book bowling?'), 'Lanes can be fully booked, and I can’t see what’s free: check Fixture Lanes’s lane times before you go.');
  assert.match(await turn('à quelle heure est le parkour?', 'fr'), /^Je n’ai pas l’horaire des séances et des heures libres\. Le plan prévoit vers 9 h; vérifiez l’horaire de Fixture Parkour & Movement pour .+\.$/);
  assert.equal(await turn('faut-il réserver le bowling?', 'fr'), 'Les allées peuvent être toutes réservées, et je ne vois pas ce qui est libre : vérifiez les disponibilités des allées de Fixture Lanes avant d’y aller.');
  assert.equal(await turn('est-ce que le parkour convient à un enfant de 6 ans?', 'fr'), 'La fiche de Fixture Parkour & Movement n’indique pas de tranche d’âge, donc je ne peux pas confirmer que ça convient à un enfant de 6 ans. Vérifiez auprès d’eux avant d’y aller.');
  // The stops the chat reads are marked from the listing; a question about opening hours stays the hours answer.
  const marked = app.tripChatStops(stops);
  assert.deepEqual(marked.map((s) => s.sched), ['lanes', 'dropin', 'dropin']);
  assert.doesNotMatch(await turn('is the gymnastics gym open Sunday?'), /session and drop-in times/);
  assert.equal(tt.askKind(tc.fold('what time is the movie?')), 'showtimes');
});

// ---- 7. the short note (2026-11-22, Dayton: "show a short, visible note on scheduled-activity cards when the time is
// only a suggestion, for example 'Suggested time · Check sessions'") ----
const WS = require('../trip-workspace-layout.js');
const escHtml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The page's own v4Row and v4Note, run here as they are sent, over a plan's schedule rows.
function cardNote(rows, fr) {
  const fn = (name) => { const a = V4.indexOf(`  function ${name}(`); assert.ok(a !== -1, name); return V4.slice(a, V4.indexOf('\n  }\n', a) + 5); };
  const make = new Function('state', 'lang', 'esc', 't3StayExt', 'placeUrl', `${tt.clientSource()}\n${fn('v4Row')}\n${fn('v4Note')}\nreturn v4Note;`);
  return make({ last: { schedule: rows } }, () => (fr ? 'fr' : 'en'), escHtml, (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null), (v) => (v && v.slug ? `${fr ? '/fr' : ''}/penticton/indoor/${v.slug}` : null));
}
test('7. the collapsed card shows one short note with the kind’s link label, a real link and an accessible name; the shared copy prints it', () => {
  const party = { kidAges: [6, 9] };
  const cinema = { id: 900001, name: 'Landmark Cinemas 7 Penticton', type: 'indoor', website: 'https://www.landmarkcinemas.com/penticton', slug: 'landmark-cinemas-7-penticton' };
  const plain = { id: 900002, name: 'No Link Escape Rooms', type: 'indoor', slug: 'no-link-escape-rooms' };
  const rows = [
    { day: 1, venueId: FIX.parkour.id, startMinutes: 585, confirmationReasons: ['hours'] },
    { day: 1, venueId: cinema.id, startMinutes: 1185, confirmationReasons: ['hours'] },
    { day: 2, venueId: FIX.bowl.id, startMinutes: 600, confirmationReasons: ['hours'] },
    { day: 2, venueId: FIX.museum.id, date: '2026-12-06', startMinutes: 780, status: 'estimated' },
    { day: 2, eventId: 7, startMinutes: 840 },
    { day: 2, venueId: 900003, startMinutes: 990, departure: true },
    { day: 2, venueId: 900004, startMinutes: 1060, bookDeparture: true },
    { day: 2, venueId: plain.id, startMinutes: 1140, confirmationReasons: ['hours'] },
  ];
  tt.applyTiming({ schedule: rows }, () => [], (id, row) => (id === cinema.id ? cinema : id === plain.id ? plain : id >= 900003 ? { name: 'Tour', type: 'tour' } : app.tripTimingVenue(id, row.date, row.startMinutes)), party);
  const stop = (v) => ({ venue: { id: v.id, name: v.name, slug: v.slug } });
  const pk = { id: FIX.parkour.id, name: FIX.parkour.name, slug: 'session-fixture-parkour' }, bowl = { id: FIX.bowl.id, name: FIX.bowl.name, slug: 'session-fixture-lanes' }, museum = { id: FIX.museum.id, name: FIX.museum.name, slug: 'session-fixture-museum' };
  const en = cardNote(rows, false), fr = cardNote(rows, true);
  const link = (label, href, say, more = '') => `<a href="${href}" target="_blank" rel="nofollow noopener" data-v4-check-times${more} aria-label="${say}">${label} <span aria-hidden="true">↗</span></a>`;
  // Parkour (sessions and drop-in times): the listing's stored website.
  assert.deepEqual(en(stop(pk), '1-morning'), { url: 'https://fixture-parkour.example.com/', html: `<p class="v4-note"><span class="tt-note" data-tt-note="dropin">Suggested time · ${link('Check sessions', 'https://fixture-parkour.example.com/', 'Check sessions for Fixture Parkour &amp; Movement, opens in a new tab')}</span></p>` });
  assert.equal(fr(stop(pk), '1-morning').html, `<p class="v4-note"><span class="tt-note" data-tt-note="dropin">Heure suggérée · ${link('Voir les séances', 'https://fixture-parkour.example.com/', 'Voir les séances chez Fixture Parkour &amp; Movement, s’ouvre dans un nouvel onglet')}</span></p>`);
  // The cinema (showtimes).
  assert.equal(en(stop(cinema), '1-night').html, `<p class="v4-note"><span class="tt-note" data-tt-note="showtimes">Suggested time · ${link('Check showtimes', 'https://www.landmarkcinemas.com/penticton', 'Check showtimes for Landmark Cinemas 7 Penticton, opens in a new tab')}</span></p>`);
  assert.equal(fr(stop(cinema), '1-night').html, `<p class="v4-note"><span class="tt-note" data-tt-note="showtimes">Heure suggérée · ${link('Voir les séances', 'https://www.landmarkcinemas.com/penticton', 'Voir les séances chez Landmark Cinemas 7 Penticton, s’ouvre dans un nouvel onglet')}</span></p>`);
  // Bowling (a lane is booked): its stored booking link, counted as a booking click.
  const track = ` data-track="booking" data-venue-id="${FIX.bowl.id}"`;
  assert.equal(en(stop(bowl), '2-morning').html, `<p class="v4-note"><span class="tt-note" data-tt-note="lanes">Suggested time · ${link('Book a lane', 'https://fixture-lanes.example.com/book-a-lane', 'Book a lane for Fixture Lanes, opens in a new tab', track)}</span></p>`);
  assert.equal(fr(stop(bowl), '2-morning').html, `<p class="v4-note"><span class="tt-note" data-tt-note="lanes">Heure suggérée · ${link('Réserver une allée', 'https://fixture-lanes.example.com/book-a-lane', 'Réserver une allée chez Fixture Lanes, s’ouvre dans un nouvel onglet', track)}</span></p>`);
  // No stored link: the listing's own page, in the same tab (nothing is invented, and no "new tab" is promised).
  assert.equal(en(stop(plain), '2-night').html, '<p class="v4-note"><span class="tt-note" data-tt-note="rooms">Suggested time · <a href="/penticton/indoor/no-link-escape-rooms" data-v4-check-times aria-label="Book a room for No Link Escape Rooms">Book a room</a></span></p>');
  assert.match(fr(stop(plain), '2-night').html, /Heure suggérée · <a href="\/fr\/penticton\/indoor\/no-link-escape-rooms" data-v4-check-times aria-label="Réserver une salle chez No Link Escape Rooms">Réserver une salle<\/a>/);
  // A walk-in place, an event and a tour (a stored departure, or one to book) get no note.
  assert.equal(en(stop(museum), '2-midday'), null, 'a museum within its listed hours');
  assert.equal(en({ event: { id: 7, name: 'An Event' } }, '2-afternoon'), null, 'an event keeps its own start time');
  assert.equal(en(stop({ id: 900003, name: 'Tour', slug: 't' }), '2-afternoon'), null, 'a tour with a departure');
  assert.equal(en(stop({ id: 900004, name: 'Tour', slug: 't' }), '2-evening'), null, 'a tour whose departure is booked');
  // Every kind's note is its own link label, in both languages; a kind that is not on the table says nothing.
  for (const k of Object.keys(tt.TT_WORDS)) for (const f of [false, true]) {
    const h = tt.ttNote({ schedule: k }, 'A Place', f, 'https://example.com/', true, escHtml, '');
    assert.ok(h.includes(`${f ? 'Heure suggérée' : 'Suggested time'} · <a `) && h.includes(`>${escHtml(tt.ttLink(k, f))} <span aria-hidden="true">↗</span></a>`), `${k} ${f ? 'fr' : 'en'}`);
    assert.ok(h.includes(`aria-label="${escHtml(tt.ttLink(k, f))}${f ? ' chez ' : ' for '}A Place${f ? ', s’ouvre dans un nouvel onglet' : ', opens in a new tab'}"`), `${k}: the link names the place`);
  }
  assert.equal(tt.ttNote({ schedule: 'nope' }, 'X', false, 'https://example.com/', true, escHtml, ''), '');
  assert.equal(tt.ttNote({ schedule: 'dropin' }, 'X', false, '', false, escHtml, ''), '<span class="tt-note" data-tt-note="dropin">Suggested time · Check sessions</span>', 'no link on file anywhere: plain words');
  assert.doesNotMatch(tt.ttNote({ schedule: 'dropin' }, '"><b>x', false, 'https://example.com/', true, escHtml, ''), /<b>/, 'the name is escaped');
  // The card: the note is under the name in place of the generic reason line; "Venue website" is left out when it is
  // the same link; the expanded line no longer repeats the link; the pill is as it was.
  const C = WS.WORKSPACE_CLIENT_SRC, CSS = WS.WORKSPACE_STYLES;
  assert.ok(C.includes('var note=v4Note(s,key);'));
  // (2026-11-23: a trip's need notes, e.g. "Wheelchair access: check ahead", follow the timing note on one more small
  // line, in their shorter forms; the generic reason shows only when a card has neither. tests/trip-access-needs 14.)
  assert.ok(C.includes(`'</span></button>'+(note||need?(note?note.html:'')+need:reason?'<p class="tw-fit">'+esc(reason)+'</p>':'')+'<div class="tw-links">'`));
  assert.ok(C.includes("var need=typeof v4NeedHtml==='function'?v4NeedHtml(s,!!note):'';"));
  assert.ok(C.includes('!(note&&note.url===t3StayExt(v.website))'));
  assert.ok(V4.includes("(v4Note(s, key) || { html: '' }).html"), 'the plain list layout too');
  assert.ok(!V4.includes("' data-v4-check-times>' + esc(fr ? 'Voir la fiche' : 'View details')"), 'one link in each state');
  // One small line; the link's hit area is 44px tall (the line + 14px above and below) without adding height.
  assert.ok(CSS.includes('.t3-v4.tw-workspace .v4-note {font-size:13px;line-height:1.45;'));
  assert.ok(require('../trip-planner-v4-page.js').V4_STYLES.includes('.t3-v4 .v4-note a::after { content: ""; position: absolute; inset: -14px -6px; }'));
  // The shared copy: the same note first, then the age line; a link that is not https falls back to the listing's page.
  assert.ok(SERVER.includes("var skTo = skOn ? (/^https:\\\\/\\\\//.test(d.schedUrl || '') ? d.schedUrl : (fr && d.urlFr) || d.url || '') : '';"));
  assert.ok(SERVER.includes("+ (skAges ? ' <span data-mt-sched-ages>' + esc(skAges) + '</span>' : '') + '</span>' : '';"));
  assert.ok(SERVER.includes('body.my-trip-page .mt-sched a::after { content: ""; position: absolute; inset: -14px -6px; }'));
  const [spk] = app.tripStopsFor([`venue:${FIX.parkour.id}`], NOW, {}, party);
  assert.equal(`${tt.ttNote({ schedule: spk.sched }, spk.name, false, spk.schedUrl, true, escHtml, '')} ${tt.ttAgeNote({ schedule: spk.sched, ...spk.schedAges }, false)}`.replace(/<[^>]+>/g, ''), 'Suggested time · Check sessions ↗ Check it suits ages 6 and 9.');
  assert.equal(`${tt.ttNote({ schedule: spk.sched }, spk.name, true, spk.schedUrl, true, escHtml, '')} ${tt.ttAgeNote({ schedule: spk.sched, ...spk.schedAges }, true)}`.replace(/<[^>]+>/g, ''), 'Heure suggérée · Voir les séances ↗ Vérifiez qu’il convient aux enfants de 6 et 9 ans.');
});
