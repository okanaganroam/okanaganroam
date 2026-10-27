// Build My Trip (2026-10-27, drafts/site-audit/2026-10-27-trip.md and PR #506's "Not fixed" list): long idle gaps in
// day plans are filled, closed or explained; "happy hour crawl" / "happy hour and dinner" / "pub crawl" (« tournée des
// bars », « 5 à 7 ») are a timed outing through the happy hours of one day; short outings' stops are called by the part
// of the day they are timed in; "wine and dinner" is two tastings.
// Runs on a throwaway database (like r25-audit-fixes-trip.test.js) with a fixed clock; run `git checkout -q okanagan.db`
// afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r26-planner-gaps-token';
process.env.TRIP_PLANNER_V2 = 'on';
const app = require('../server.js');
const db = require('../db.js');
const tp = require('../trip-planner.js');
const { t3FrenchText } = require('../trip-french-copy.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to, days = WEEK) => Object.fromEntries(WEEK.map((k) => [k, days.includes(k) ? [[from, to]] : []]));
const CENTRES = { kelowna: [49.888, -119.47], vernon: [50.267, -119.272], penticton: [49.48, -119.585], osoyoos: [49.032, -119.468], 'west-kelowna': [49.863, -119.583] };
let n = 0;
// Fixtures sit within about 600 m of their town centre, so every hop is a short walk.
const mk = (o) => { n++; const [lat, lng] = CENTRES[o.region]; const { hoursObj, ...rest } = o;
  return app.createVenue({ slug: `r26-fixture-${n}`, rating: 4.3, latitude: lat + (n % 7) / 2000, longitude: lng + (n % 5) / 2000, description: 'A fixture venue used only by the r26 planner tests.',
    hours: hoursObj === null ? null : JSON.stringify(hoursObj || open('11:00', '22:00')), ...rest }); };
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const MON = '2026-10-26', TUE = '2026-10-27', WED = '2026-10-28', FRI = '2026-10-30';
const MON_NOON = at(MON, '12:00'), TUE_1PM = at(TUE, '13:00'), TUE_530PM = at(TUE, '17:30');
const meta = { reason: 'r26 fixture', batch_id: 'test-r26' };
const hhTimes = (v, times, deals) => {
  assert.equal(app.guardedHappyHourUpdate(v.id, null, { times, source_url: 'https://example.com/hh', checked_at: MON }, meta).ok, true);
  if (deals) assert.equal(app.guardedHappyHourDealsUpdate(v.id, null, { deals, source_url: 'https://example.com/hh', checked_at: MON }, meta).ok, true);
};
const daily = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
const closeSeason = (v) => db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, 'closed', null, null, 'https://example.com/season', '2026-10-01');
const full = (text, now, extra = {}) => app.withTripWeeklyNights(app.withTripSpecials(app.withTripFrenchUrls(app.withTripHappyHourDeals(app.runTripPlan({ text, ...extra }, now), now)), now), now);
const stopsOf = (p) => (p.days || []).flatMap((x) => (x.stops || []).map((s) => ({ ...s, day: x.day }))).concat((p.itinerary && p.itinerary.stops) || [], (p.outing && p.outing.stops) || []);
const rowOf = (p, s) => (p.schedule || []).find((r) => s.venue && r.venueId === s.venue.id && (s.day == null || r.day == null || r.day === s.day));
// Every wait over the limit between two timed stops has a Free time card between them, with a note.
const unexplainedGaps = (p) => {
  const out = [];
  const groups = (p.days || []).length ? p.days.map((d) => ({ day: d.day, stops: d.stops })) : [{ day: 1, stops: (p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [] }];
  for (const g of groups) {
    const timed = g.stops.filter((s) => s.venue && rowOf(p, { ...s, day: g.day }) && Number.isFinite(rowOf(p, { ...s, day: g.day }).startMinutes));
    for (let i = 1; i < timed.length; i++) {
      const a = rowOf(p, { ...timed[i - 1], day: g.day }), b = rowOf(p, { ...timed[i], day: g.day });
      const idle = b.startMinutes - a.endMinutes - (b.transferMinutes || 0);
      const card = g.stops.slice(g.stops.indexOf(timed[i - 1]) + 1, g.stops.indexOf(timed[i])).find((s) => s.freeTime);
      if (idle > tp.IDLE_GAP_LIMIT && !(card && card.freeTime.note && card.freeTime.noteFr)) out.push(`${timed[i - 1].venue.name} -> ${timed[i].venue.name}: ${idle} min`);
    }
  }
  return out;
};

// ---- fixtures: Kelowna happy hours ----
const TAPS = mk({ name: 'Kelowna Taps', region: 'kelowna', type: 'pub', happy_hour: true, rating: 4.6, hoursObj: open('11:00', '23:00') });
hhTimes(TAPS, daily('14:00', '17:00'), [{ text: 'Crown Lager (0.5 L)', price: '$5' }, { text: 'Well highballs', price: '$5' }]);
const LOUNGE = mk({ name: 'Central Lounge', region: 'kelowna', type: 'cocktail', happy_hour: true, rating: 4.5, hoursObj: open('15:00', '23:59') });
hhTimes(LOUNGE, daily('15:00', '18:00'), [{ text: 'House wine (5 oz)', price: '$6' }, { text: 'Classic cocktails', price: '$9' }]);
const BREW = mk({ name: 'Kelowna Brew House', region: 'kelowna', type: 'brewery', happy_hour: true, rating: 4.4, hoursObj: open('12:00', '22:00') });
hhTimes(BREW, daily('16:00', '18:00'), [{ text: 'Pints', price: '$6' }]);
const LATE = mk({ name: 'Late Night Lounge', region: 'kelowna', type: 'cocktail', happy_hour: true, rating: 4.2, hoursObj: open('16:00', '23:59') });
hhTimes(LATE, daily('21:00', '23:59'), [{ text: 'Shots', price: '$4' }]);
const SEASON = mk({ name: 'Closed Patio Bar', region: 'kelowna', type: 'pub', happy_hour: true, rating: 4.9, hoursObj: open('11:00', '23:00') });
hhTimes(SEASON, daily('14:00', '18:00'), [{ text: 'Patio pints', price: '$4' }]);
closeSeason(SEASON);
const NODEALS = mk({ name: 'No Deals Pub', region: 'kelowna', type: 'pub', happy_hour: true, rating: 4.8, hoursObj: open('11:00', '23:00') });
hhTimes(NODEALS, daily('14:00', '18:00'), null);
for (let i = 1; i <= 3; i++) mk({ name: `Kelowna Supper Bistro ${i}`, region: 'kelowna', type: 'restaurant', price: 3, description: 'A dinner bistro with a wine list.', hoursObj: open('17:00', '22:00') });

// ---- Vernon: happy hour and dinner on Friday ----
const RUSTLERS = mk({ name: 'Rustlers Table', region: 'vernon', type: 'pub', happy_hour: true, rating: 4.5, hoursObj: open('11:00', '22:00') });
hhTimes(RUSTLERS, { fri: [['15:00', '17:00']] }, [{ text: 'Half nachos', price: '$15' }, { text: 'Pulled pork tacos (2)', price: '$15' }]);
const INTERMEZZO = mk({ name: 'Intermezzo Restaurant', region: 'vernon', type: 'restaurant', happy_hour: true, rating: 4.6, hoursObj: open('16:00', '22:00') });
hhTimes(INTERMEZZO, { fri: [['16:00', '18:00']] }, [{ text: 'House red or white (6 oz)', price: '$6' }, { text: 'Domestic beer', price: '$5' }]);
const STEAK = mk({ name: 'Vernon Steakhouse', region: 'vernon', type: 'restaurant', rating: 4.7, price: 3, description: 'Steaks and seafood for dinner.', hoursObj: open('16:30', '22:00') });

// ---- Penticton: no happy hours on file ----
for (let i = 1; i <= 2; i++) mk({ name: `Penticton Pub ${i}`, region: 'penticton', type: 'pub', happy_hour: true, hoursObj: open('11:00', '23:00') });
for (let i = 1; i <= 2; i++) mk({ name: `Penticton Dining ${i}`, region: 'penticton', type: 'restaurant', hoursObj: open('11:00', '22:00') });

// ---- Osoyoos: a beach day with a long afternoon ----
mk({ name: 'Osoyoos Coffee Co', region: 'osoyoos', type: 'cafe', description: 'Coffee and pastries.', hoursObj: open('07:00', '15:00') });
for (let i = 1; i <= 2; i++) mk({ name: `Osoyoos Lunch Spot ${i}`, region: 'osoyoos', type: 'restaurant', description: 'Lunch and dinner, burgers and salads.', hoursObj: open('11:00', '21:00') });
mk({ name: 'Osoyoos Dinner House', region: 'osoyoos', type: 'restaurant', price: 3, description: 'A dinner restaurant.', hoursObj: open('17:00', '22:00') });
const LEGION = mk({ name: 'Legion Beach', region: 'osoyoos', type: 'beach', description: 'A sandy beach on Osoyoos Lake for swimming.', hoursObj: null });
const DESERT = mk({ name: 'Osoyoos Desert Centre', region: 'osoyoos', type: 'outdoor', description: 'A desert boardwalk walk through the antelope-brush with interpretive signs.', hoursObj: open('09:30', '16:30') });
const MUSEUM = mk({ name: 'Osoyoos Museum', region: 'osoyoos', type: 'indoor', description: 'The town museum of local history.', hoursObj: open('10:00', '16:00') });

// ---- West Kelowna: wine and dinner ----
for (const name of ['Quails Gate Winery', 'Mission Hill Winery', 'Little Straw Vineyards']) mk({ name, region: 'west-kelowna', type: 'winery', description: 'Wine tastings with lake views.', hoursObj: open('10:00', '18:00') });
for (let i = 1; i <= 2; i++) mk({ name: `West Kelowna Supper ${i}`, region: 'west-kelowna', type: 'restaurant', description: 'A dinner restaurant.', hoursObj: open('16:00', '22:00') });

// ---- 2. happy hour crawl ----
test('Happy hour crawl: a timed outing through the day\'s happy hours, each stop inside its window with its deals', () => {
  const p = full('happy hour crawl in Kelowna tonight', TUE_1PM);
  assert.equal(p.kind, 'itinerary', JSON.stringify([p.kind, p.summary, p.notes]));
  const stops = stopsOf(p);
  assert.ok(stops.length >= 2 && stops.length <= 3, JSON.stringify(stops.map((s) => s.venue.name)));
  assert.ok(!stops.some((s) => [SEASON.id, NODEALS.id].includes(s.venue.id)), 'never a place closed for the season, nor one without deals on file');
  const rows = stops.map((s) => rowOf(p, s));
  assert.ok(rows.every((r) => r.date === TUE && r.startMinutes >= 900), JSON.stringify(rows));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].startMinutes >= rows[i - 1].endMinutes + (rows[i].transferMinutes || 0) && rows[i].startMinutes - rows[i - 1].endMinutes <= 60, JSON.stringify(rows));
  // Each stop is timed inside its happy hour and says it.
  for (const s of stops) {
    assert.match(s.happyHourLine, /^Happy hour \d.*(?:AM|PM|midnight): \$/, JSON.stringify(s.happyHourLine));
    assert.match(s.happyHourLineFr, /^Happy hour \d+ h.* : \$/);
    assert.ok(s.reasons.some((r) => r.code === 'happy_hour'), JSON.stringify(s.reasons));
  }
  const taps = stops.find((s) => s.venue.id === TAPS.id);
  if (taps) assert.equal(taps.happyHourLine, 'Happy hour 2–5 PM: $5 Crown Lager (0.5 L), $5 Well highballs');
  assert.equal(p.summary, 'A happy hour crawl in Kelowna tonight.');
  assert.ok(p.notes[0].startsWith('Each stop is timed inside its happy hour on Tuesday'));
  assert.equal(t3FrenchText(p.notes[0]), 'Chaque arrêt est prévu pendant son happy hour le mardi, selon les heures de sa fiche Okanagan Roam. Les happy hours et les offres changent; vérifiez avant de partir.');
  assert.ok(p.story.textFr.startsWith('Commencez à '));
  // The same request at 5:30 PM: only one happy hour is still ahead, so the list stays, with a note.
  const late = full('happy hour crawl in Kelowna tonight', TUE_530PM);
  assert.notEqual(late.kind, 'itinerary');
  assert.ok(late.notes.some((x) => /^Fewer than two places in Kelowna have happy hours on Tuesday that line up/.test(x)), JSON.stringify(late.notes));
  assert.equal(t3FrenchText(late.notes[0]), 'Moins de deux lieux à Kelowna ont des happy hours le mardi qui se suivent; voici donc plutôt les lieux avec un happy hour.');
});

test('Happy hour and dinner on Friday: happy hour stops, then dinner; a weekday is honoured', () => {
  const p = full('happy hour and dinner in Vernon Friday', MON_NOON);
  assert.equal(p.kind, 'itinerary', JSON.stringify([p.kind, p.notes]));
  const stops = stopsOf(p);
  const rows = stops.map((s) => rowOf(p, s));
  assert.ok(rows.every((r) => r.date === FRI), JSON.stringify(rows));
  assert.equal(stops[stops.length - 1].label, 'Dinner');
  assert.ok(rows[rows.length - 1].startMinutes >= 1050, 'dinner from 5:30 PM');
  assert.equal(stops[0].venue.id, RUSTLERS.id);
  assert.equal(stops[0].happyHourLine, 'Happy hour 3–5 PM: $15 Half nachos, $15 Pulled pork tacos (2)');
  assert.ok(stops.some((s) => s.venue.id === INTERMEZZO.id && /^Happy hour 4–6 PM: /.test(s.happyHourLine || '')), JSON.stringify(stops.map((s) => [s.venue.name, s.happyHourLine])));
  assert.equal(p.summary, 'Happy hour and dinner in Vernon on Friday.');
  // On a Monday nothing in Vernon has a happy hour: the plan stays as the planner made it, with the note.
  const mon = full('happy hour and dinner in Vernon on Monday', MON_NOON);
  assert.ok(!mon.happyHourCrawl);
  assert.ok((mon.notes || []).some((x) => /happy hours on Monday that line up/.test(x)));
});

test('Pub crawl, bar crawl, « tournée des bars » and « 5 à 7 »: the same timed outing; a plain happy hour list is unchanged; a town with no happy hours keeps its plan', () => {
  for (const text of ['pub crawl in Kelowna on Friday', 'bar crawl in Kelowna on Friday', 'tournée des bars à Kelowna vendredi', '5 à 7 à Kelowna vendredi']) {
    const p = full(text, MON_NOON);
    assert.equal(p.kind, 'itinerary', text);
    assert.ok(p.happyHourCrawl && p.happyHourCrawl.date === FRI, text);
    assert.ok(stopsOf(p).every((s) => s.happyHourLine), text);
  }
  assert.equal(tp.planTrip === undefined, false);
  const list = full('happy hour in Kelowna', TUE_1PM);
  assert.ok(!list.happyHourCrawl && ['discover', 'recommendations'].includes(list.kind), list.kind);
  const pen = full('pub crawl in Penticton on Friday', MON_NOON);
  assert.ok(!pen.happyHourCrawl);
  assert.ok(!(pen.notes || []).some((x) => /line up/.test(x)), 'a pub crawl did not ask for happy hours');
  const penHh = full('happy hour crawl in Penticton', MON_NOON);
  assert.ok(!penHh.happyHourCrawl && penHh.notes.some((x) => /^Fewer than two places in Penticton/.test(x)));
  // A dog-friendly crawl only uses places that let the dog in (none of these do).
  const dog = full('dog friendly happy hour crawl in Kelowna on Friday', MON_NOON);
  assert.ok(!dog.happyHourCrawl, JSON.stringify(stopsOf(dog).map((s) => s.venue && s.venue.name)));
});

// ---- 1. long idle gaps ----
test('Long gaps: a beach day (dated and undated) leaves no wait over 90 minutes unexplained', () => {
  for (const text of ['beach day in Osoyoos on October 28', 'a day at the beach in Osoyoos', 'a day in Osoyoos on Saturday']) {
    const p = full(text, MON_NOON);
    assert.ok(['day_plan', 'itinerary'].includes(p.kind), `${text}: ${p.kind}`);
    assert.deepEqual(unexplainedGaps(p), [], `${text}: ${JSON.stringify(stopsOf(p).map((s) => [s.daypart, s.venue && s.venue.name, rowOf(p, s) && [rowOf(p, s).startMinutes, rowOf(p, s).endMinutes], s.freeTime]))}`);
    const ids = stopsOf(p).filter((s) => s.venue).map((s) => s.venue.id);
    assert.equal(new Set(ids).size, ids.length, 'no place twice');
    // Every stop's part is used once in a day plan.
    for (const d of p.days || []) { const parts = d.stops.map((s) => s.daypart); assert.equal(new Set(parts).size, parts.length, JSON.stringify(parts)); }
  }
});

test('Long gaps: closeIdleGaps fills a gap with a nearby open stop, or names it with a walk in daylight (EN + FR)', () => {
  const facts = app.buildTripPlannerFacts(false, WED).filter((f) => f.region === 'osoyoos');
  const byName = (name) => facts.find((f) => f.name === name);
  const stop = (v, label, daypart) => ({ kind: 'venue', label, daypart, component: null, venue: tp.publicVenue(v, null), reasons: [], why: [], caveats: [], alternates: [] });
  const labels = { regions: { osoyoos: 'Osoyoos' }, types: {} };
  const input = { facts, labels, intent: { regions: ['osoyoos'], types: [], features: [], foodTerms: [] }, tripDate: WED, startWeekday: 'wed' };
  // A noon start (the scheduler times a lone lunch-then-dinner outing from it).
  const req = () => ({ items: [], conflicts: [], startDate: WED, endDate: null, startMinutes: 720 });
  const make = () => ({ kind: 'itinerary', days: [], itinerary: { stops: [stop(byName('Osoyoos Lunch Spot 1'), 'Lunch', 'midday'), stop(byName('Osoyoos Dinner House'), 'Dinner', 'evening')] }, notes: [], warnings: [] });
  // Lunch 12:00-13:30 then dinner at 6: the museum or the desert walk fills the afternoon.
  const p = make(), r = req();
  tp.scheduleTripByHours(p, input, r);
  assert.ok(tp.closeIdleGaps(p, input, r));
  assert.deepEqual(unexplainedGaps(p), [], JSON.stringify(p.itinerary.stops.map((s) => [s.label, s.venue && s.venue.name, s.freeTime])));
  const filler = p.itinerary.stops.find((s) => s.gapFill);
  assert.ok(filler && [DESERT.id, MUSEUM.id].includes(filler.venue.id), JSON.stringify(p.itinerary.stops.map((s) => s.venue && s.venue.name)));
  assert.ok(filler.reasons.some((x) => x.text === 'Fills the free time between stops'));
  assert.equal(t3FrenchText('Fills the free time between stops'), 'Occupe le temps libre entre deux arrêts');
  // With nothing open to add (the visitor excluded both), the wait is named, with the beach walk while it is light.
  const q = make(), r2 = req();
  const input2 = { ...input, excludeIds: [DESERT.id, MUSEUM.id] };
  tp.scheduleTripByHours(q, input2, r2);
  tp.closeIdleGaps(q, input2, r2);
  const card = q.itinerary.stops.find((s) => s.freeTime);
  assert.ok(card, JSON.stringify(q.itinerary.stops.map((s) => s.venue && s.venue.name)));
  assert.match(card.freeTime.note, /^Free time: about [\d.]+ hours before dinner to take a walk at Legion Beach, or rest\.$/);
  assert.match(card.freeTime.noteFr, /^Temps libre : environ [\d,]+ h avant le souper pour une promenade à Legion Beach, ou une pause\.$/);
  assert.equal(card.freeTime.walk.id, LEGION.id);
  // Dinner first moves to 5:30 PM (the wait is shorter), never earlier.
  const dinnerRow = q.schedule.find((x) => x.venueId === byName('Osoyoos Dinner House').id);
  assert.equal(dinnerRow.startMinutes, 1050);
  // Times the visitor named are kept: nothing is added or moved.
  const named = make(), r3 = req();
  tp.scheduleTripByHours(named, input, r3);
  assert.equal(tp.closeIdleGaps(named, input, r3, { userTimed: tp.userNamedTimes(r3) }), false);
  assert.equal(tp.userNamedTimes({ items: [{ kind: 'deadline' }] }), true);
  assert.equal(tp.userNamedTimes({ items: [] }), false);
  // The planner page prints the card's own words.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes('var ftNote = ftFr ? s.freeTime.noteFr : s.freeTime.note;'));
});

// ---- 3. small items ----
test('Daypart labels follow the stop\'s time on short outings; "wine and dinner" is two tastings, "a winery and dinner" one', () => {
  assert.equal(tp.partAt(11 * 60), 'morning');
  assert.equal(tp.partAt(12 * 60), 'midday');
  assert.equal(tp.partAt(19 * 60 + 45), 'evening');
  const r = { kind: 'itinerary', schedule: [{ day: 1, venueId: 1, startMinutes: 1185, endMinutes: 1245 }, { day: 1, venueId: 2, startMinutes: 660, endMinutes: 720 }],
    itinerary: { stops: [{ venue: { id: 1 }, label: 'Breweries', daypart: 'afternoon' }, { venue: { id: 2 }, label: 'Late afternoon', daypart: 'late' }] } };
  tp.relabelDayparts(r);
  assert.deepEqual(r.itinerary.stops.map((s) => [s.label, s.daypart]), [['Breweries', 'evening'], ['Morning', 'morning']]);
  const wine = full('wine and dinner in West Kelowna on Saturday', MON_NOON);
  const tastings = stopsOf(wine).filter((s) => s.venue && s.venue.type === 'winery');
  assert.equal(tastings.length, 2, JSON.stringify(stopsOf(wine).map((s) => s.venue && s.venue.name)));
  assert.ok(stopsOf(wine).some((s) => s.label === 'Dinner'));
  assert.ok(!(wine.notes || []).some((x) => /was left out/.test(x)));
  const one = full('a winery and dinner in West Kelowna on Saturday', MON_NOON);
  assert.equal(stopsOf(one).filter((s) => s.venue && s.venue.type === 'winery').length, 1);
});
