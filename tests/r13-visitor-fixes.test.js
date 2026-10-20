// Round 13 (2026-10-21): six visitor-facing fixes from drafts/site-review-2026-10-20-pass12.md.
//  1. "tonight" / « ce soir » / an afternoon asked after the window started: start at the next quarter hour, or move
//     to tomorrow and say so (EN + FR).
//  2. A dated Halloween request finds the events on that date; "Saturday in Osoyoos" is a one-day plan.
//  3. SoldOut only for present-tense wording ("*SOLD OUT*" yes, "sold-out houses" no).
//  4. French event labels (« Horaires variables », « Tous les soirs du 24 au 30 oct. », « prochaine »), « Ouvert d’avril »,
//     « minuit ».
//  5. A "Temporarily closed" advisory folds the weekly hours away on the venue page.
//  6. data/french/events-2026-10-20-r13.json.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.TRIP_PLANNER_V3 = 'on';
const app = require('../server.js');
const db = require('../db.js');
const { FR_TEXT } = require('../french-text.js');
const { t3FrenchText, t3FrenchEvent, t3FrenchPlan } = require('../trip-french-copy.js');
const { t3LocalTimes } = require('../trip-planner-v3-page.js');
const r = require('../trip-requirements.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `r13-fixture-${++n}`, description: 'A fixture place used only by the round 13 tests.', hours: JSON.stringify(open('11:00', '23:00')), ...o });
for (const [region, lat, lng] of [['kelowna', 49.888, -119.496], ['west-kelowna', 49.863, -119.583], ['osoyoos', 49.032, -119.468]]) {
  for (let i = 0; i < 4; i++) mk({ name: `R13 ${region} Kitchen ${i + 1}`, region, type: 'restaurant', latitude: lat + i / 500, longitude: lng, rating: 4.5 });
  mk({ name: `R13 ${region} Brewing`, region, type: 'brewery', latitude: lat + 0.003, longitude: lng, rating: 4.6 });
  mk({ name: `R13 ${region} Lounge`, region, type: 'cocktail', latitude: lat + 0.004, longitude: lng, rating: 4.6, hours: JSON.stringify(open('16:00', '23:59')) });
  mk({ name: `R13 ${region} Museum`, region, type: 'indoor', latitude: lat + 0.005, longitude: lng, rating: 4.5, hours: JSON.stringify(open('10:00', '17:00')) });
  mk({ name: `R13 ${region} Cafe`, region, type: 'cafe', latitude: lat + 0.006, longitude: lng, rating: 4.5, hours: JSON.stringify(open('07:00', '17:00')), description: 'Coffee and pastries.' });
  mk({ name: `R13 ${region} Winery`, region, type: 'winery', latitude: lat + 0.007, longitude: lng, rating: 4.7, hours: JSON.stringify(open('10:00', '18:00')) });
  mk({ name: `R13 ${region} Park`, region, type: 'outdoor', latitude: lat + 0.008, longitude: lng, rating: 4.6, hours: null, description: 'A lakeside park with an easy 2 km loop trail.' });
}
const meta = { reason: 'r13 fixture', batch_id: 'test-r13-visitor' };
const mkEvent = (o) => {
  const res = app.createEvent({ region: 'kelowna', description: 'A fixture event used only by the round 13 tests.', source_type: 'official_venue', source_name: 'Fixture',
    source_url: `https://example.com/r13/${app.slugify(o.name)}`, categories: ['holiday-seasonal'], ...o }, meta);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.event;
};
mkEvent({ name: 'R13 Halloween Monster Bash', venue_name_text: 'Fixture Hall', occurrences: [{ start_date: '2030-10-31', start_time: '18:00', end_time: '21:00' }] });
mkEvent({ name: 'Lantern Stroll for Halloween', venue_name_text: 'Orchard Lane Farm', occurrences: [{ start_date: '2030-10-31' }] });
mkEvent({ name: 'Corn Maze of Terror Halloween', venue_name_text: 'Valley Corn Field', occurrences: [{ start_date: '2030-10-24', end_date: '2030-10-31', start_time: '19:00', end_time: '22:00' }] });

// Monday 2030-10-14, Pacific time (UTC−7 year-round from Nov 2026).
const at = (hhmm, date = '2030-10-14') => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const rows = (p) => (p.schedule || []).filter((x) => x.venueId);
const french = (p) => t3LocalTimes(t3FrenchPlan(JSON.parse(JSON.stringify(p))), 'fr');

// ---- 1. Windows that already started ----
test('R13 windows: "tonight" at 8:20 PM starts at 8:30 PM with dinner and a nightcap (EN + FR)', () => {
  for (const q of ['tonight in Kelowna', 'ce soir à Kelowna']) {
    const p = app.runTripPlan({ text: q }, at('20:20'));
    assert.equal(p.kind, 'itinerary', q);
    const list = rows(p);
    assert.ok(list.length >= 1 && list.length <= 2, `${q}: ${list.length} stops`);
    for (const row of list) { assert.equal(row.date, '2030-10-14', q); assert.ok(row.startMinutes >= 20 * 60 + 30, `${q}: ${row.startMinutes}`); }
    assert.equal(list[0].startMinutes, 20 * 60 + 30, q);
    assert.ok(!/drinks/.test(p.summary), p.summary);
    assert.equal(p.contextNotes[0], 'The evening has already started, so this plan starts at 8:30 PM.');
    assert.equal(french(p).contextNotes[0], 'La soirée est déjà commencée; ce plan commence donc à 20 h 30.');
  }
  // Before the window nothing changes.
  const early = app.runTripPlan({ text: 'tonight in Kelowna' }, at('12:00'));
  assert.ok(rows(early).every((row) => row.startMinutes >= 17 * 60));
  assert.ok(!(early.contextNotes || []).some((x) => /already/.test(x)));
});

test('R13 windows: « une soirée à West Kelowna » at 8:30 PM starts now instead of at 5 PM', () => {
  const p = app.runTripPlan({ text: 'une soirée à West Kelowna' }, at('20:30'));
  assert.equal(p.kind, 'itinerary');
  for (const row of rows(p)) { assert.equal(row.date, '2030-10-14'); assert.ok(row.startMinutes >= 20 * 60 + 30, `${row.startMinutes}`); }
});

test('R13 windows: too late tonight moves to tomorrow evening and says so (EN + FR)', () => {
  for (const q of ['tonight in Kelowna', 'ce soir à Kelowna']) {
    const p = app.runTripPlan({ text: q }, at('22:40'));
    assert.equal(p.kind, 'itinerary', q);
    const list = rows(p);
    assert.ok(list.length >= 2, `${q}: ${list.length}`);
    for (const row of list) { assert.equal(row.date, '2030-10-15', q); assert.ok(row.startMinutes >= 17 * 60, q); }
    assert.equal(p.contextNotes[0], 'It’s already late, so this plan is for tomorrow evening.');
    assert.match(p.summary, /^Tomorrow evening in Kelowna/);
    const f = french(p);
    assert.equal(f.contextNotes[0], 'Il est déjà tard; ce plan est donc pour demain soir.');
    assert.match(f.headline, /^Demain soir à Kelowna/);
  }
});

test('R13 windows: an afternoon asked in the evening moves to tomorrow and says so (EN + FR)', () => {
  for (const q of ['an afternoon in Kelowna', 'un après-midi à Kelowna']) {
    const p = app.runTripPlan({ text: q }, at('18:45'));
    for (const row of rows(p)) assert.equal(row.date, '2030-10-15', q);
    assert.equal(p.contextNotes[0], 'It’s already evening, so this plan is for tomorrow afternoon.');
    assert.equal(french(p).contextNotes[0], 'Il est déjà le soir; ce plan est donc pour demain après-midi.');
  }
  // Mid-afternoon: today, from the next quarter hour, with fewer stops.
  const p = app.runTripPlan({ text: 'an afternoon in Kelowna' }, at('16:10'));
  const list = rows(p);
  assert.ok(list.length >= 1 && list.length <= 2);
  assert.equal(list[0].date, '2030-10-14');
  assert.equal(list[0].startMinutes, 16 * 60 + 15);
  assert.equal(p.contextNotes[0], 'The afternoon has already started, so this plan starts at 4:15 PM.');
});

test('R13 windows: the rule itself (next quarter hour, stops that fit, at least 90 minutes)', () => {
  const req = (o) => ({ timeWindow: 'evening', startDate: null, startMinutes: 1020, ...o });
  let q = req({});
  assert.equal(r.rollPastTimeWindow(q, { date: '2026-10-19', minutes: 20 * 60 + 20 }), false);
  assert.deepEqual([q.startMinutes, q.windowStops, q.startDate], [1230, 2, null]);
  q = req({});
  r.rollPastTimeWindow(q, { date: '2026-10-19', minutes: 21 * 60 + 50 });
  assert.deepEqual([q.startMinutes, q.windowStops], [1320, 1]);
  q = req({ startDate: '2026-10-19', windowToday: true });
  assert.equal(r.rollPastTimeWindow(q, { date: '2026-10-19', minutes: 22 * 60 + 40 }), true);
  assert.deepEqual([q.startDate, q.startMinutes, q.windowClock.rolled], ['2026-10-20', 1020, true]);
  // A named day that is today is never moved to tomorrow.
  q = req({ startDate: '2026-10-19' });
  assert.equal(r.rollPastTimeWindow(q, { date: '2026-10-19', minutes: 23 * 60 }), false);
  assert.equal(q.startDate, '2026-10-19');
  // Another day is left alone.
  q = req({ startDate: '2026-10-24' });
  assert.equal(r.rollPastTimeWindow(q, { date: '2026-10-19', minutes: 21 * 60 }), false);
  assert.equal(q.startMinutes, 1020);
});

// ---- 2. Dated Halloween, "Saturday in Osoyoos" ----
test('R13 dated events: "Halloween in Kelowna" on Oct 31 lists that day’s events (date control or in the text)', () => {
  const names = (p) => (p.events || []).map((e) => e.name).sort();
  const want = ['Corn Maze of Terror Halloween', 'Lantern Stroll for Halloween', 'R13 Halloween Monster Bash'];
  assert.deepEqual(names(app.runTripPlan({ text: 'Halloween in Kelowna' }, at('12:00'))), want);
  assert.deepEqual(names(app.runTripPlan({ text: 'Halloween in Kelowna', overrides: { startDate: '2030-10-31' } }, at('12:00'))), want);
  assert.deepEqual(names(app.runTripPlan({ text: 'Halloween in Kelowna on Oct 31' }, at('12:00'))), want);
  // A date with none of them is still empty.
  assert.deepEqual(names(app.runTripPlan({ text: 'Halloween in Kelowna', overrides: { startDate: '2030-10-20' } }, at('12:00'))), []);
});

test('R13 dated towns: "Saturday in Osoyoos" is a one-day plan on Saturday; "what to do Saturday" keeps Ideas', () => {
  const p = app.runTripPlan({ text: 'Saturday in Osoyoos' }, at('12:00'));
  assert.equal(p.kind, 'day_plan');
  assert.deepEqual(p.days.map((d) => d.date), ['2030-10-19']);
  assert.ok(p.days[0].stops.length >= 2);
  assert.equal(app.runTripPlan({ text: 'what to do Saturday in Osoyoos' }, at('12:00')).kind, 'discover');
});

// ---- 3. SoldOut ----
test('R13 SoldOut: status wording anywhere counts; "sold-out" before a noun never does', () => {
  const so = (description, extra = {}) => app.eventIsSoldOut({ description, ...extra });
  for (const t of ['Murder Mystery *SOLD OUT*', 'Garth Brooks, Creekside, Nov 7 - SOLD OUT', 'Tickets: sold out.', 'Doors at 7. SOLD OUT',
    "Tickets were $30 plus tax with an engraved wine glass, and this year's event is sold out; email River Stone to join the waitlist."]) assert.equal(so(t), true, t);
  for (const t of [
    'Expect sharp observational humour and storytelling, fresh from a sold-out Edinburgh Fringe run. Tickets are $67.62.',
    'The show has played sold-out houses across British Columbia. Tickets are $62.50.',
    'He has played to SOLD OUT crowds across Canada.', 'After a SOLD-OUT tour of Europe, the band returns.', 'Fresh from a SOLD OUT Fringe run.',
    'Tickets: sold-out shows last year.', 'SOLD OUT last year, so book early.', 'Sold-out audiences loved it.',
  ]) assert.equal(so(t), false, t);
});

// ---- 4. French labels ----
test('R13 French: What’s On labels (« Horaires variables », « Tous les soirs du 24 au 30 oct. », « prochaine »)', () => {
  assert.equal(app.frText('Times vary'), 'Horaires variables');
  assert.equal(app.frText('Nightly Oct 24 to Oct 30 · next Sat Oct 24'), 'Tous les soirs du 24 au 30 oct. · prochaine : sam. 24 oct.');
  assert.equal(app.frText('Nightly Oct 30 to Nov 1'), 'Tous les soirs du 30 oct. au 1er nov.');
  // The planner's event cards: the server sends the French labels with the plan; the page uses them.
  const plan = app.withTripFrenchUrls({ events: [{ id: 1, name: 'X', url: '/kelowna/events/x', dateLabel: 'Nightly Oct 24 to Oct 30 · next Sat Oct 24', time: 'Times vary' }] });
  assert.equal(plan.events[0].dateLabelFr, 'Tous les soirs du 24 au 30 oct. · prochaine : sam. 24 oct.');
  assert.equal(plan.events[0].timeFr, 'Horaires variables');
  const e = t3FrenchEvent(plan.events[0]);
  assert.equal(e.dateLabel, 'Tous les soirs du 24 au 30 oct. · prochaine : sam. 24 oct.');
  assert.equal(e.time, 'Horaires variables');
  // Without them (an older cached plan), the page's own rules.
  const old = t3FrenchEvent({ dateLabel: 'Nightly Oct 24 to Oct 30 · next Sat Oct 24', time: 'Times vary' });
  assert.ok(!/Nightly|next|Times vary/.test(`${old.dateLabel} ${old.time}`), `${old.dateLabel} ${old.time}`);
  assert.equal(t3FrenchEvent({ dateLabel: 'Sat Oct 24', time: '12 am' }).time, 'minuit');
});

test('R13 French: « minuit », not « 0 h »', () => {
  assert.equal(t3LocalTimes('Open 17:00–00:00', 'fr'), 'Open 17 h–minuit');
  assert.equal(t3LocalTimes('Until 12 AM', 'fr'), 'Until minuit');
  assert.equal(t3FrenchText('Hours 18:00–00:00 today'), 'Hours 18 h–minuit today');
  assert.equal(t3LocalTimes('Open 17:00–00:00', 'en'), 'Open 5 PM – 12 AM');
});

test('R13 French: the season line elides (« Ouvert d’avril à octobre », « Ouvert de mai à octobre »)', () => {
  const upsert = db.prepare('INSERT INTO venue_links (venue_id, open_months) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET open_months = excluded.open_months');
  const v = mk({ name: 'R13 Season Line Winery', region: 'oliver', type: 'winery', latitude: 49.18, longitude: -119.55, rating: 4.5 });
  const line = (months, lang) => { upsert.run(v.id, months); const html = app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang }); return (/<p class="venue-season"[^>]*>([^<]*)<\/p>/.exec(html) || [])[1]; };
  assert.equal(line('4-10', 'fr'), 'Ouvert d’avril à octobre');
  assert.equal(line('8-10', 'fr'), 'Ouvert d’août à octobre');
  assert.equal(line('10-4', 'fr'), 'Ouvert d’octobre à avril');
  assert.equal(line('5-10', 'fr'), 'Ouvert de mai à octobre');
  assert.equal(line('4-10', 'en'), 'Open April – October each year');
});

// ---- 5. Temporarily closed ----
test('R13 temporarily closed: a "Temporarily closed" advisory folds the weekly hours; the structured data stays closed', () => {
  const wings = mk({ name: 'R13 Wings Fixture', region: 'west-kelowna', type: 'restaurant', latitude: 49.83, longitude: -119.63, rating: 4.1 });
  const until = mk({ name: 'R13 Until Fixture', region: 'west-kelowna', type: 'restaurant', latitude: 49.83, longitude: -119.63, rating: 4.1 });
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', wings.id, 'add', "Temporarily closed, per the restaurant's own website (checked October 19, 2026). https://example-r13.ca/wings", meta).ok, true);
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', until.id, 'add', 'Temporarily closed until November 5 for renovations. https://example-r13.ca/until', meta).ok, true);
  const hours = (id, lang) => (/<div class="venue-section venue-hours" id="venueHours">([\s\S]*?)<\/div>/.exec(app.renderVenuePage(app.getVenue(id), [], [], [], { lang })) || [])[1] || '';
  const en = hours(wings.id, 'en');
  assert.match(en, /<p class="venue-hours-season venue-hours-temp-shut">Temporarily closed<\/p><details class="venue-hours-usual"><summary>Usual hours when open<\/summary><ul class="hours-list">/);
  assert.ok(!/is-today|data-today/.test(en), 'no day reads as today');
  assert.match(hours(wings.id, 'fr'), /Fermé temporairement<\/p><details class="venue-hours-usual"><summary>Heures habituelles quand c’est ouvert<\/summary>/);
  // JSON-LD: one closed spec, no weekly hours (unchanged from round 12).
  const ld = [...app.renderVenuePage(app.getVenue(wings.id), [], [], []).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o.name === 'R13 Wings Fixture');
  assert.equal(ld.openingHoursSpecification.length, 1);
  assert.equal(ld.openingHoursSpecification[0].opens, '00:00');
  assert.equal(ld.openingHoursSpecification[0].closes, '00:00');
  // A notice that names a return, and an open place, keep the list.
  assert.match(hours(until.id, 'en'), /<ul class="hours-list" data-today=/);
  assert.ok(!/venue-hours-temp-shut/.test(hours(until.id, 'en')));
});

// ---- 6. French event descriptions, round 13 ----
const R13 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'events-2026-10-20-r13.json'), 'utf8'));
test('r13 events French: all 10 entries are loaded and none is shadowed by an earlier file', () => {
  assert.equal(Object.keys(R13).length, 10);
  for (const [en, fr] of Object.entries(R13)) { assert.equal(FR_TEXT[en], fr, en); assert.equal(app.frText(en), fr, en); }
});
test('r13 events French: Canadian French typography (curly apostrophes, no space before ; ? !, $ after the amount)', () => {
  for (const fr of Object.values(R13)) {
    assert.ok(!fr.includes("'"), fr);
    assert.ok(!/ [;?!]/.test(fr), fr);
    assert.ok(!/\$\d/.test(fr), fr);
  }
});
