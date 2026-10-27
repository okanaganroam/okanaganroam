// Build My Trip audit fixes (2026-10-27, drafts/site-audit/2026-10-27-trip.md): the happy hour / specials / weekly
// nights lines on plans for a named day ("tonight", "Tuesday", "this Saturday", « mardi »), trivia/karaoke/bingo
// requests planned from the weekly nights, "tonight" after midnight, the night line only on a stop that overlaps the
// night, "Tonight" only for today, named closed places, "on October 30 at 4 pm", and the smaller fixes.
// Runs on a throwaway database (like r22-weekly-nights.test.js) with a fixed clock; run `git checkout -q okanagan.db`
// afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r25-audit-trip-token';
process.env.TRIP_PLANNER_V2 = 'on';
const app = require('../server.js');
const db = require('../db.js');
const tp = require('../trip-planner.js');
const r = require('../trip-requirements.js');
const d = require('../discovery-intent.js');
const { t3FrenchText } = require('../trip-french-copy.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to, days = WEEK) => Object.fromEntries(WEEK.map((k) => [k, days.includes(k) ? [[from, to]] : []]));
const CENTRES = { kelowna: [49.888, -119.47], osoyoos: [49.032, -119.468], 'west-kelowna': [49.863, -119.583], penticton: [49.48, -119.585], 'big-white': [49.72, -118.93] };
let n = 0;
const mk = (o) => { n++; const [lat, lng] = CENTRES[o.region]; const { hoursObj, ...rest } = o;
  return app.createVenue({ slug: `r25-fixture-${n}`, rating: 4.4, latitude: lat + (n % 7) / 1500, longitude: lng + (n % 5) / 1500, description: 'A fixture venue used only by the r25 audit tests.',
    hours: JSON.stringify(hoursObj || open('11:00', '23:00')), ...rest }); };
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const MON = '2026-10-26', TUE = '2026-10-27';
const MON_NOON = at(MON, '12:00'), TUE_2AM = at(TUE, '02:00'), TUE_NOON = at(TUE, '12:00');
const checked = MON;
const meta = { reason: 'r25 fixture', batch_id: 'test-r25' };
const nights = (v, list) => assert.equal(app.guardedWeeklyNightsUpdate(v.id, app.currentWeeklyNightsJson(v.id), { nights: list, source_url: 'https://example.com/nights', checked_at: checked }, meta).ok, true);
const specials = (v, list) => assert.equal(app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials: list, source_url: 'https://example.com/specials', checked_at: checked }, meta).ok, true);
const closeSeason = (v, reopens) => db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, 'closed', null, reopens, 'https://example.com/season', '2026-10-01');
// The trip API's order: runTripPlan, then the happy hour, French link, specials and weekly-nights lines.
const full = (text, now, extra = {}) => app.withTripWeeklyNights(app.withTripSpecials(app.withTripFrenchUrls(app.withTripHappyHourDeals(app.runTripPlan({ text, ...extra }, now), now)), now), now);
const stopsOf = (p) => (p.days || []).flatMap((x) => x.stops || []).concat((p.itinerary && p.itinerary.stops) || [], (p.outing && p.outing.stops) || []);
const recNames = (p) => (p.recommendations || []).map((s) => s.venue && s.venue.name);

// ---- fixtures ----
const UNICORN = mk({ name: 'Unicorn Lounge', region: 'kelowna', type: 'cocktail', description: 'A downtown cocktail lounge with craft cocktails and small plates.', hoursObj: open('16:00', '23:59') });
nights(UNICORN, [{ days: ['tue'], kind: 'trivia', title: 'Weekly Trivia', start: '19:30', end: '21:00' }]);
const STREET = mk({ name: '97 Street Pub', region: 'kelowna', type: 'pub', description: 'A neighbourhood pub with wings, beer and weekly trivia.' });
nights(STREET, [{ days: ['wed'], kind: 'trivia', title: 'Wednesday Trivia', start: '19:00', end: '21:00' }]);
const SHORE = mk({ name: 'Shore Line Pub', region: 'kelowna', type: 'pub', description: 'A lakeside pub with bingo and pub food.' });
nights(SHORE, [{ days: ['thu'], kind: 'bingo', title: 'SINGO', start: '19:00' }]);
const KETTLE = mk({ name: 'Kettle River Brewing', region: 'kelowna', type: 'brewery', description: 'A small-batch brewery taproom.', hoursObj: open('12:00', '22:00') });
nights(KETTLE, [{ days: ['tue'], kind: 'bingo', title: 'Brewery Bingo', start: '18:30', end: '20:30' }]);
const MONTHLY = mk({ name: 'Monthly Karaoke Bar', region: 'kelowna', type: 'pub', description: 'A pub.' });
nights(MONTHLY, [{ days: ['tue'], kind: 'karaoke', title: 'Karaoke', start: '21:00', frequency: 'monthly-1st' }]);
for (let i = 1; i <= 5; i++) mk({ name: `Kelowna Bistro ${i}`, region: 'kelowna', type: 'restaurant', price: 3, description: 'A seasonal dinner bistro with a wine list.', hoursObj: open('17:00', '22:00') });
const FRANKIE = mk({ name: 'Frankie We Salute You', region: 'kelowna', type: 'restaurant', description: 'A plant-based restaurant for lunch and dinner.', hoursObj: open('11:00', '21:00') });
mk({ name: 'Little Hobo Soup', region: 'kelowna', type: 'restaurant', rating: 4.9, description: 'A soup and sandwich lunch spot.', hoursObj: open('10:00', '15:00') });
const MASA = mk({ name: "Masa's Grill", region: 'kelowna', type: 'restaurant', description: 'A grill restaurant.' });
closeSeason(MASA, null);
const HH = mk({ name: 'Happy Hour Taphouse', region: 'kelowna', type: 'pub', happy_hour: true, description: 'A taphouse with a long happy hour.' });
assert.equal(app.guardedHappyHourUpdate(HH.id, null, { times: { mon: [['15:00', '18:00']], tue: [['15:00', '18:00']], fri: [['14:00', '17:00']] }, source_url: 'https://example.com/hh', checked_at: checked }, meta).ok, true);
assert.equal(app.guardedHappyHourDealsUpdate(HH.id, null, { deals: [{ text: 'House pints', price: '$6' }, { text: 'Cocktails', price: '$10' }], source_url: 'https://example.com/hh', checked_at: checked }, meta).ok, true);
for (const name of ['Ailm Estate Winery', 'Sperling Vineyards', 'The Vibrant Vine']) closeSeason(mk({ name, region: 'kelowna', type: 'winery', description: 'A Kelowna winery tasting room.', hoursObj: open('11:00', '17:00') }), null);
for (const name of ['CedarCreek Estate Winery', 'Waldhof Estate Winery', 'Sandhill Wines']) mk({ name, region: 'kelowna', type: 'winery', description: 'Wine tastings.', hoursObj: open('10:00', '18:00') });
const GOLF = mk({ name: "Gallagher's Canyon Golf Club", region: 'kelowna', type: 'golf', description: 'The golf season runs from early April to mid-October on this canyon course.', hoursObj: open('07:00', '19:00') });
const TERRACE = mk({ name: 'Terrace Restaurant', region: 'west-kelowna', type: 'restaurant', description: 'The patio restaurant at Mission Hill Family Estate winery.', hoursObj: open('11:30', '20:00') });
closeSeason(TERRACE, '2027-05-01');
for (let i = 1; i <= 3; i++) mk({ name: `West Kelowna Kitchen ${i}`, region: 'west-kelowna', type: 'restaurant', description: 'Lunch and dinner.' });
mk({ name: 'Mission Hill Family Estate', region: 'west-kelowna', type: 'winery', description: 'Winery tastings with lake views.', hoursObj: open('10:00', '18:00') });
const SAGE = mk({ name: 'The Sage Pub', region: 'osoyoos', type: 'pub', rating: 4.8, description: 'A pub with burgers, beer and a patio.' });
nights(SAGE, [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:30', end: '21:30' }]);
specials(SAGE, [{ days: ['tue'], kind: 'food', title: 'Taco Tuesday', deal: '$3 tacos' }]);
mk({ name: 'La Marqueza', region: 'osoyoos', type: 'restaurant', cuisine: 'Mexican', description: 'Mexican tacos and burritos.' });
mk({ name: 'The Ridge', region: 'osoyoos', type: 'pub', description: 'A pub with wings.', hoursObj: open('11:00', '23:00', ['wed', 'thu', 'fri', 'sat', 'sun']) }); // closed Mon-Tue
for (let i = 1; i <= 3; i++) mk({ name: `Osoyoos Grill ${i}`, region: 'osoyoos', type: 'restaurant', description: 'A dinner restaurant.', hoursObj: open('16:00', '22:00') });
for (let i = 1; i <= 3; i++) mk({ name: `Penticton Taproom ${i}`, region: 'penticton', type: 'brewery', description: 'A craft beer taproom.', hoursObj: open('11:00', '22:00') });
for (let i = 1; i <= 3; i++) mk({ name: `Penticton Dining ${i}`, region: 'penticton', type: 'restaurant', description: 'A dinner restaurant.', hoursObj: open('11:00', '22:00') });
const TRATTO = mk({ name: 'Pizzeria Tratto', region: 'penticton', type: 'restaurant', description: 'Wood-fired pizza.', hoursObj: open('11:00', '22:00') });
specials(TRATTO, [{ days: ['mon'], kind: 'food', title: 'Bottle Shock', deal: 'Buy a bottle of wine, get a free pizza' }]);
mk({ name: 'Penticton Lounge', region: 'penticton', type: 'cocktail', description: 'A cocktail lounge.', hoursObj: open('15:00', '23:59') });
for (let i = 1; i <= 3; i++) mk({ name: `Penticton Beach ${i}`, region: 'penticton', type: 'beach', description: 'A sandy beach on Okanagan Lake for swimming.', hoursObj: null });
const BIGWHITE = mk({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', description: 'The ski resort above Kelowna.', hoursObj: open('08:30', '15:30') });
db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(BIGWHITE.id, 'closed', '2026-11-25', '2026-11-26', 'https://example.com/season', '2026-10-01');

// ---- 1. the plan's date reaches the trip API's lines ----
test('Fix 1: a plan for a named day keeps its date, so the specials and nights lines show; an undated plan stays a typical day', () => {
  const p = full('pub dinner and drinks in Osoyoos on Tuesday', MON_NOON);
  assert.ok(p.schedule.length && p.schedule.every((row) => row.date === TUE), JSON.stringify(p.schedule));
  assert.ok(!(p.notes || []).includes(tp.SUGGESTED_TIMES_NOTE), 'not "a typical day"');
  const sage = stopsOf(p).find((s) => s.venue && s.venue.id === SAGE.id);
  assert.ok(sage, 'The Sage Pub is the pub stop ' + JSON.stringify(stopsOf(p).map((s) => s.venue && [s.venue.name, s.venue.rating])));
  assert.equal(sage.specialLine, 'Tomorrow night: Taco Tuesday · $3 tacos');
  // The same day named in other ways: "this Saturday", « mardi », "tomorrow", "tonight".
  for (const [text, date] of [['date night in Kelowna this Saturday', '2026-10-31'], ['soirée en amoureux à Kelowna mardi', TUE], ['date night in Kelowna tomorrow', TUE], ['date night in Kelowna tonight', MON]]) {
    const q = app.runTripPlan({ text }, MON_NOON);
    assert.ok(q.schedule.length && q.schedule.every((row) => row.date === date), `${text}: ${JSON.stringify(q.schedule.map((x) => x.date))}`);
  }
  // Undated: a typical Saturday, no date on the rows, and the note.
  const u = app.runTripPlan({ text: 'date night in Kelowna' }, MON_NOON);
  assert.ok(u.schedule.length && u.schedule.every((row) => row.date === undefined && row.suggested));
  assert.ok(u.notes.includes(tp.SUGGESTED_TIMES_NOTE));
});

// ---- 2. weekly nights pick and rank the stops ----
test('Fix 2: "trivia / bingo / tacos and trivia on Tuesday" are planned from the weekly nights on that day', () => {
  const trivia = full('trivia night in Kelowna on Tuesday', MON_NOON);
  const names = recNames(trivia);
  assert.equal(names[0], 'Unicorn Lounge', JSON.stringify(names));
  assert.ok(names.indexOf('97 Street Pub') > 0, 'the Wednesday trivia pub ranks below');
  assert.equal(trivia.listDate, TUE);
  const uni = trivia.recommendations[0];
  assert.equal(uni.nightLine, 'Tomorrow night: Trivia 7:30–9 PM');
  assert.equal(uni.nightLineFr, 'Demain soir : Quiz 19 h 30–21 h');
  assert.equal(uni.nightLineLabelFr, 'Demain soir');
  assert.ok(uni.reasons.some((x) => x.text === 'Trivia on Tuesday from 7:30 PM, from its listing'), JSON.stringify(uni.reasons));
  assert.equal(t3FrenchText('Trivia on Tuesday from 7:30 PM, from its listing'), 'Un quiz le mardi à 19 h 30, selon sa fiche');
  assert.equal(t3FrenchText('Hosts trivia on Wednesdays, from its listing'), 'Accueille un quiz le mercredi, selon sa fiche');
  // The pub whose trivia is on Wednesday never says "Tomorrow night: Trivia".
  const street = trivia.recommendations.find((s) => s.venue.id === STREET.id);
  assert.equal(street.nightLine, undefined);
  // On Wednesday it is the other way round.
  assert.equal(recNames(app.runTripPlan({ text: 'trivia night in Kelowna on Wednesday' }, MON_NOON))[0], '97 Street Pub');
  // Undated: places that host trivia on any day are listed, with the day.
  const any = app.runTripPlan({ text: 'trivia in Kelowna' }, MON_NOON);
  assert.ok(recNames(any).includes('Unicorn Lounge'));
  const bingo = app.runTripPlan({ text: 'bingo night in Kelowna on Tuesday' }, MON_NOON);
  assert.equal(recNames(bingo)[0], 'Kettle River Brewing', JSON.stringify(recNames(bingo)));
  const tacos = full('tacos and trivia in Osoyoos on Tuesday', MON_NOON);
  assert.equal(recNames(tacos)[0], 'The Sage Pub', JSON.stringify(recNames(tacos)));
  assert.ok(!(tacos.notes || []).some((x) => /doesn’t list “trivia”/.test(x)));
  // Frequency: a first-Tuesday karaoke night is on Nov 3, not on Oct 27.
  const kar = (now) => full('karaoke in Kelowna tonight', now).recommendations || [];
  const nov3 = kar(at('2026-11-03', '17:00'));
  assert.equal(nov3[0] && nov3[0].venue.name, 'Monthly Karaoke Bar');
  assert.equal(nov3[0].nightLine, 'Tonight: Karaoke at 9 PM');
  assert.ok(!kar(at(TUE, '17:00')).some((s) => /Karaoke/.test(s.nightLine || '')), 'not on the fourth Tuesday');
  // The planner's unit: the Okanagan calendar day the request named.
  assert.equal(tp.ctxPlanDate({ startWeekday: 'tue', tripDate: MON }), TUE);
  assert.equal(tp.ctxPlanDate({ startWeekday: null, tripDate: MON }), null);
  assert.equal(tp.nightKindOfTerm('pub quiz'), 'trivia');
  assert.equal(tp.nightKindOfTerm('open mic'), 'open_mic');
  assert.equal(tp.nightKindOfTerm('tacos'), null);
});

// ---- 3. "tonight" after midnight ----
test('Fix 3: "tonight" at 2 AM plans the coming evening with a note, never an empty plan or a time already past', () => {
  const p = full('date night in Kelowna tonight', TUE_2AM);
  const stops = stopsOf(p);
  assert.ok(stops.length >= 2 && stops.every((s) => s.venue), JSON.stringify(stops.map((s) => s.venue && s.venue.name)));
  assert.ok(p.notes.includes('It’s after midnight, so this plan is for Tuesday evening.'));
  assert.ok(p.contextNotes.includes('It’s after midnight, so this plan is for Tuesday evening.'));
  assert.ok(!p.notes.some((x) => /Monday night/.test(x)));
  assert.ok(p.schedule.every((row) => row.date === TUE && row.startMinutes >= 16 * 60), JSON.stringify(p.schedule));
  assert.equal(t3FrenchText('It’s after midnight, so this plan is for Tuesday evening.'), 'Il est passé minuit; ce plan est donc pour mardi soir.');
  // An Ideas list for tonight at 2 AM with nothing still open: tonight's trivia, for the coming evening.
  const t = full('trivia night in Kelowna tonight', TUE_2AM);
  assert.equal(recNames(t)[0], 'Unicorn Lounge');
  assert.equal(t.recommendations[0].nightLine, 'Tonight: Trivia 7:30–9 PM');
  // A bar still open at 00:30 keeps the night still running (the listing reaches 01:00).
  const lateBar = { id: 9001, name: 'Late Bar', region: 'kelowna', type: 'cocktail', url: '/kelowna/cocktail-lounges/late-bar', rating: 4.5, reviews: 100, lat: 49.88, lng: -119.47, features: {}, collections: [], activities: [], fdTypes: [], textName: 'late bar', textDesc: '', textCuisine: '', hours: JSON.stringify(open('17:00', '01:00')) };
  const intent = d.interpretDiscoveryQuery('Find me something to do tonight in Kelowna.', { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, types: ['cocktail'], features: [], collections: [], activities: [], cuisines: [], budgets: [], paces: [], datePresets: ['today'], eventCategories: [], venues: [] });
  const live = tp.planTrip({ intent, facts: [lateBar], labels: { regions: { kelowna: 'Kelowna' }, types: {} }, startWeekday: 'tue', clock: { weekday: 'tue', minutes: 30 } });
  assert.deepEqual(live.recommendations.map((s) => s.venue.name), ['Late Bar']);
  assert.ok(!live.notes.some((x) => /after midnight/.test(x)));
  // Every stop empty: a warning says so.
  assert.equal(tp.planTrip({ intent: d.interpretDiscoveryQuery('date night in Kelowna tonight', { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, types: [], features: [], collections: [], activities: [], cuisines: [], budgets: [], paces: [], datePresets: ['today'], eventCategories: [], venues: [] }, { tripPlanner: true }), facts: [], labels: { regions: { kelowna: 'Kelowna' }, types: {} }, startWeekday: 'tue', clock: { weekday: 'tue', minutes: 1200 } }).warnings.length > 0, true);
});

// ---- 4 and 5. the night line's overlap and its day word ----
test('Fix 4 + 5: a night line only on a stop that overlaps the night; "Tonight" only for today, other days by name or date', () => {
  const plan = (date, startMinutes, endMinutes) => ({ kind: 'itinerary', schedule: [{ day: 1, date, venueId: SAGE.id, startMinutes, endMinutes }], days: [{ day: 1, stops: [{ day: 1, venue: { id: SAGE.id } }] }] });
  const line = (p, now) => app.withTripWeeklyNights(p, now).days[0].stops[0].nightLine;
  assert.equal(line(plan(TUE, 1080, 1170), TUE_NOON), undefined, '18:00-19:30 ends as trivia starts at 7:30');
  assert.equal(line(plan(TUE, 1110, 1230), TUE_NOON), 'Tonight: Trivia 7:30–9:30 PM', '18:30-20:30 covers it');
  assert.equal(line(plan(TUE, 1110, 1230), MON_NOON), 'Tomorrow night: Trivia 7:30–9:30 PM');
  assert.equal(line(plan('2026-11-03', 1110, 1230), MON_NOON), 'Tue Nov 3: Trivia 7:30–9:30 PM', 'eight days ahead: the date');
  assert.equal(line(plan('2026-10-27', 1110, 1230), at('2026-10-23', '12:00')), 'Tuesday: Trivia 7:30–9:30 PM');
  const fr = app.withTripWeeklyNights(plan(TUE, 1110, 1230), at('2026-10-23', '12:00')).days[0].stops[0];
  assert.equal(fr.nightLineFr, 'Mardi : Quiz 19 h 30–21 h 30');
  assert.equal(fr.nightLineLabelFr, 'Mardi');
  assert.deepEqual(app.tripLineDayLabel('2026-11-02', at(TUE, '09:00'), true), { en: 'Monday', fr: 'Lundi' });
  assert.deepEqual(app.tripLineDayLabel('2026-11-09', at(TUE, '09:00'), true), { en: 'Mon Nov 9', fr: 'lun. 9 nov.' });
  assert.deepEqual(app.tripLineDayLabel(TUE, at(TUE, '09:00'), false), { en: 'Today', fr: 'Aujourd’hui' });
  // "rainy day in Penticton on November 2" (sent Oct 27): Pizzeria Tratto's Monday special says the date.
  const sp = app.withTripSpecials({ kind: 'itinerary', schedule: [{ day: 1, date: '2026-11-02', venueId: TRATTO.id, startMinutes: 1080, endMinutes: 1170 }], days: [{ day: 1, stops: [{ day: 1, venue: { id: TRATTO.id } }] }] }, at(TUE, '09:00')).days[0].stops[0];
  assert.match(sp.specialLine, /^Monday: Bottle Shock/);
  assert.equal(sp.specialLineLabelFr, 'Lundi');
  // The planner page prints the French day word it is given.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes("esc(stop.nightLineLabelFr || 'Ce soir') + ' : <span'"));
});

// ---- 6. named places ----
test('Fix 6: a named closed place is said plainly and the plan is in its town; a named open place heads the list', () => {
  const t = full('lunch at the Terrace Restaurant at Mission Hill', MON_NOON);
  assert.equal(t.warnings[0], 'Terrace Restaurant is closed for the season until May 1, 2027, so it isn’t in this plan.');
  assert.ok(!t.warnings.some((w) => /No selected stop meets|couldn’t match/.test(w)), JSON.stringify(t.warnings));
  const where = stopsOf(t).concat(t.recommendations || []).filter((s) => s.venue).map((s) => s.venue.region);
  assert.ok(where.length && where.every((x) => x === 'west-kelowna'), JSON.stringify(where));
  const shown = JSON.stringify([stopsOf(t), t.recommendations || [], (t.requirementResults || []).map((x) => x.optionalAlternatives || [])]);
  assert.ok(!shown.includes(`"id":${TERRACE.id},`), 'never a stop, alternative or recommendation');
  assert.deepEqual(t.closedNamedVenues.map((x) => x.name), ['Terrace Restaurant']);
  assert.equal(t.query, 'lunch at the Terrace Restaurant at Mission Hill');
  assert.equal(t3FrenchText(t.warnings[0]), 'Terrace Restaurant est fermé pour la saison jusqu’au 1er mai 2027; il ne fait donc pas partie de ce plan.');
  const m = full("dinner at Masa's Grill in Kelowna", MON_NOON);
  assert.equal(m.warnings[0], "Masa's Grill is closed for the season and hasn’t announced when it reopens, so it isn’t in this plan.");
  assert.ok(!JSON.stringify([m.notes, m.warnings, m.unsupported, m.understood.notUsed, m.summary]).includes('masas'), 'its name is never a food word');
  const w = full('wine tasting at Ailm, Sperling and Vibrant Vine in Kelowna', MON_NOON);
  assert.equal(w.warnings[0], 'Ailm Estate Winery, Sperling Vineyards and The Vibrant Vine are closed for the season and haven’t announced when they reopen, so they aren’t in this plan.');
  assert.ok(!w.warnings.some((x) => /couldn’t match/.test(x)), JSON.stringify(w.warnings));
  assert.ok(stopsOf(w).some((s) => s.venue && s.venue.type === 'winery' && s.venue.region === 'kelowna'));
  assert.equal(t3FrenchText(w.warnings[0]), 'Ailm Estate Winery, Sperling Vineyards et The Vibrant Vine sont fermés pour la saison et n’ont pas encore annoncé leur réouverture; ils ne font donc pas partie de ce plan.');
  // Open: the place named comes first.
  const f = full('lunch at Frankie We Salute You in Kelowna', MON_NOON);
  assert.equal(recNames(f)[0], 'Frankie We Salute You');
  assert.equal(f.recommendations[0].reasons[0].text, 'The place you named');
  assert.equal(t3FrenchText('The place you named'), 'Le lieu que vous avez nommé');
  // "Masa's" read as one word is the name (consumedTerms).
  assert.ok(r.consumedTerms({ items: [{ kind: 'venue', venueName: "Masa's Grill", sourceText: '' }] }).has('masas'));
});

// ---- 7. a start time after a date ----
test('Fix 7: "on October 30 at 4 pm" starts at 4 PM; a meal\'s own time or "no driving after" is not a start', () => {
  const p = app.runTripPlan({ text: 'drinks then dinner in Penticton on October 30 at 4 pm' }, MON_NOON);
  const first = p.schedule.filter((x) => Number.isFinite(x.startMinutes)).sort((a, b) => a.startMinutes - b.startMinutes)[0];
  assert.equal(first.startMinutes, 960, JSON.stringify(p.schedule));
  assert.ok(!(p.understood.notUsed || []).includes('pm'));
  const tax = { regions: ['penticton'], regionLabels: { penticton: 'Penticton' }, types: ['restaurant'], venues: [] };
  const start = (text) => r.extractTripRequirements({ text, intent: {}, trip: {}, taxonomy: tax, referenceDate: MON }).startMinutes;
  assert.equal(start('drinks then dinner in Penticton on October 30 at 4pm'), 960);
  assert.equal(start('drinks in Penticton around 3:30 pm on Friday'), 930);
  assert.equal(start('dinner at 7 pm in Penticton'), null);
  assert.equal(start('a show at 8 pm in Penticton'), null);
  assert.equal(start('wineries in Penticton, no driving after 6 pm'), null);
  assert.equal(start('back by 5 pm'), null);
});

// ---- smaller fixes ----
test('Smaller: no false "No pubs matched" warning; happy hour lists show the window and deals; cold-water note on beach lists', () => {
  const p = app.runTripPlan({ text: 'pub dinner and drinks in Osoyoos on Tuesday' }, MON_NOON);
  assert.ok(stopsOf(p).some((s) => s.venue && s.venue.type === 'pub'));
  assert.ok(!p.warnings.some((w) => /^No pubs/.test(w)), JSON.stringify(p.warnings));
  const hh = full('happy hour in Kelowna on Friday', MON_NOON);
  const tap = (hh.recommendations || []).find((s) => s.venue.id === HH.id);
  assert.ok(tap, JSON.stringify(recNames(hh)));
  assert.equal(tap.happyHourLine, 'Happy hour 2–5 PM: $6 House pints, $10 Cocktails');
  assert.equal(tap.happyHourWhenFr, '14 h–17 h');
  const beach = app.runTripPlan({ text: 'beach and swimming day in Penticton' }, MON_NOON);
  const beaches = (beach.recommendations || []).filter((s) => s.venue && s.venue.type === 'beach').concat(stopsOf(beach).filter((s) => s.venue && s.venue.type === 'beach'));
  assert.ok(beaches.length && beaches.every((s) => (s.caveats || []).some((c) => /too cold for a swim/.test(c))), JSON.stringify(beaches.map((s) => s.caveats)));
});

test('Smaller: a golf course past its own season is not planned; skiing before the resort opens says when it opens', () => {
  const g = app.runTripPlan({ text: 'golf and dinner in Kelowna tomorrow' }, MON_NOON);
  assert.ok(!stopsOf(g).concat(g.recommendations || []).some((s) => s.venue && s.venue.id === GOLF.id), 'mid-October season has ended');
  const fact = app.buildTripPlannerFacts(false, MON).find((x) => x.id === GOLF.id);
  const ctx = (date) => ({ tripDate: date, types: new Set(['golf']), activities: new Set(), requirements: null, queryText: 'golf in kelowna' });
  assert.equal(tp.offSeasonSkip(fact, ctx('2026-10-28')), true);
  assert.equal(tp.offSeasonSkip(fact, ctx('2026-10-10')), false, 'still in season on Oct 10');
  assert.equal(tp.offSeasonSkip(fact, { ...ctx('2026-10-28'), queryText: 'golf at gallaghers canyon' }), false, 'named: kept');
  for (const text of ['ski day at Big White this Saturday', 'ski day at Big White on October 31']) {
    const p = app.runTripPlan({ text }, MON_NOON);
    assert.ok(!stopsOf(p).some((s) => s.venue && s.venue.id === BIGWHITE.id), `${text}: no skiing before Nov 26`);
    assert.ok(p.notes.includes('Big White Ski Resort opens for the season on November 26, so skiing isn’t part of this October plan.'), `${text}: ${JSON.stringify(p.notes)}`);
  }
  assert.equal(t3FrenchText('Big White Ski Resort opens for the season on November 26, so skiing isn’t part of this October plan.'), 'Big White Ski Resort ouvre pour la saison le 26 novembre; le ski ne fait donc pas partie de ce plan d’octobre.');
});
