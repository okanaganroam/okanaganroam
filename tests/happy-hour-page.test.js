// Happy hour on venue pages (2026-10-23): the researched/owner times as a live line under the name ("Happy hour until
// 6 PM", "Happy hour today 3–6 PM", "Next happy hour: Saturday 7 PM") and a "Happy hour" row in Good to Know, in
// English and French, from hours.js happyHourState() (the same rules as the Roam Now map). Hidden without stored
// times, with an advisory, or while closed for the season.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const app = require('../server.js');
const hours = require('../hours.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `hh-page-fixture-${++n}`, region: 'kelowna', type: 'brewery', latitude: 49.89, longitude: -119.49, rating: 4.5,
  description: 'A fixture brewery used only by the happy hour page tests.', hours: JSON.stringify(open('11:00', '23:00')), ...o });
const meta = { reason: 'hh page fixture', batch_id: 'test-hh-page' };
const CHECKED_NOW = new Date('2026-10-23T19:00:00Z');
const setTimes = (v, times) => {
  const r = app.guardedHappyHourUpdate(v.id, null, { times, source_url: 'https://example.com/hh-menu', checked_at: '2026-10-23' }, meta, CHECKED_NOW);
  assert.equal(r.ok, true, JSON.stringify(r));
};
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27', FRI = '2026-10-30', SUN = '2026-10-25';
const page = (v, now, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now, lang });
const line = (html) => (/<p class="venue-hh-status" data-hh="(\w+)" id="venueHappyHour">([\s\S]*?)<\/p>/.exec(html) || []).slice(1);
const row = (html) => (/<div class="detail-row"><span class="label">Happy hour<\/span><span>([\s\S]*?)<\/span><\/div>/.exec(html) || [])[1] || '';

const brewery = mk({ name: 'HH Page Brewing' });
setTimes(brewery, { mon: [['15:00', '18:00']], tue: [['15:00', '18:00']], wed: [['15:00', '18:00']], thu: [['15:00', '18:00']], sat: [['19:00', '22:00']] });

// Inside a day group the spaces are non-breaking and each dash is followed by a word joiner (a phone wraps only at
// " · ", or after a comma in a long group).
const nb = (s) => s.replace(/_/g, ' ').replace(/–/g, '–⁠');
test('Happy hour row: days with the same windows grouped, then the checked date (EN + FR)', () => {
  const en = page(brewery, at(TUE, '16:00'));
  assert.equal(row(en), nb('<span class="venue-hh-times">Mon–Thu_3–6_PM · Sat_7–10_PM</span><span class="venue-hours-checked venue-hh-checked">Checked Oct 23, 2026</span>'));
  const fr = page(brewery, at(TUE, '16:00'), 'fr');
  assert.equal(row(fr), nb('<span class="venue-hh-times">Lun–jeu_15_h–18_h · sam_19_h–22_h</span><span class="venue-hours-checked venue-hh-checked">Vérifié le 23 octobre 2026</span>'));
  assert.equal(app.happyHourWeekText(JSON.stringify({ mon: [['15:00', '17:30']], wed: [['15:00', '17:30']], thu: [['15:00', '17:30']], fri: [['11:30', '13:00'], ['21:00', '01:00']], sat: null }), false),
    nb('Mon, Wed–Thu_3–5:30_PM · Fri_11:30_AM–1_PM, 9_PM–1_AM'));
  assert.equal(app.happyHourWeekText(JSON.stringify({ fri: [['21:00', '00:00']] }), true), nb('Ven_21_h–minuit'));
  // The aside's labels are one fixed column, so a wrapping "Happy hour" label keeps its value in line.
  assert.match(en, /body\.golf-page \.venue-aside \.detail-row \.label \{ min-width: 76px; flex: 0 0 76px; \}/);
  assert.doesNotMatch(en, /\$\d/, 'never a drink price');
});

test('Happy hour live line: on now, later today, next day, past midnight (fixed Pacific clock)', () => {
  assert.deepEqual(line(page(brewery, at(TUE, '16:00'))), ['now', '<span aria-hidden="true">🍻</span> Happy hour until 6 PM']);
  assert.deepEqual(line(page(brewery, at(TUE, '12:00'))), ['later', 'Happy hour today 3–6 PM']);
  assert.deepEqual(line(page(brewery, at(TUE, '18:00'))), ['next', 'Next happy hour: Wednesday 3 PM'], 'a window ends at its closing minute');
  assert.deepEqual(line(page(brewery, at(FRI, '12:00'))), ['next', 'Next happy hour: Saturday 7 PM']);
  // It sits directly under the open-now line.
  assert.match(page(brewery, at(TUE, '16:00')), /id="venueOpenStatus">Open now · Closes 11 PM <a href="#venueHours">See hours<\/a><\/p><p class="venue-hh-status" data-hh="now"/);
  // A window past midnight, and a place with happy hour on one weekday only.
  const late = mk({ name: 'HH Late Bar', hours: JSON.stringify(open('16:00', '02:00')) });
  setTimes(late, { sat: [['22:00', '01:00']], tue: [['15:00', '17:00']] });
  assert.deepEqual(line(page(late, at(SUN, '00:30'))), ['now', '<span aria-hidden="true">🍻</span> Happy hour until 1 AM']);
  assert.deepEqual(line(page(late, at(TUE, '20:00'))), ['next', 'Next happy hour: Saturday 10 PM']);
  const weekly = mk({ name: 'HH Tuesday Only' });
  setTimes(weekly, { tue: [['15:00', '17:00']] });
  assert.deepEqual(line(page(weekly, at(TUE, '20:00'))), ['next', 'Next happy hour: next Tuesday 3 PM'], 'not "today" for next week');
  // The place's own hours say closed: happy hour is not claimed as on (the map's rule).
  const shut = mk({ name: 'HH Opens Late', hours: JSON.stringify(open('17:00', '23:00')) });
  setTimes(shut, { tue: [['15:00', '18:00']] });
  assert.deepEqual(line(page(shut, at(TUE, '16:00'))), []);
});

test('Happy hour live line and row in French', () => {
  assert.deepEqual(line(page(brewery, at(TUE, '16:00'), 'fr')), ['now', '<span aria-hidden="true">🍻</span> Happy hour jusqu’à 18 h']);
  assert.deepEqual(line(page(brewery, at(TUE, '12:00'), 'fr')), ['later', 'Happy hour aujourd’hui 15 h–18 h']);
  assert.deepEqual(line(page(brewery, at(FRI, '12:00'), 'fr')), ['next', 'Prochain happy hour : samedi 19 h']);
  assert.equal(app.happyHourLiveText({ state: 'next', from: { weekday: 'tue', minutes: 930 }, nextWeek: true }, true), 'Prochain happy hour : mardi prochain 15 h 30');
});

test('Happy hour: shared rules with the map, hidden without times or with an advisory', () => {
  // The same function runs in the map's script.
  const map = app.renderPlacesMapPage();
  assert.ok(map.includes(hours.happyHourState.toString()), 'the map ships hours.js happyHourState');
  assert.match(map, /var h = happyHourState\(expandFoodDrinkHours\(p\.hh\)/);
  const clock = { weekday: 'tue', minutes: 20 * 60 };
  assert.equal(hours.happyHourState({ tue: [['15:00', '17:00']], mon: null, wed: null, thu: null, fri: null, sat: null, sun: null }, clock, false).state, 'next', 'next week is not "later today"');
  // No stored times: no line, no row (the badge alone is unchanged).
  const plain = mk({ name: 'HH Badge Only', happy_hour: 1 });
  const html = page(plain, at(TUE, '16:00'));
  assert.doesNotMatch(html, /id="venueHappyHour"|class="venue-hh-times"/);
  // An advisory hides both.
  const noted = mk({ name: 'HH Advisory Brewing' });
  setTimes(noted, { tue: [['15:00', '18:00']] });
  assert.equal(line(page(noted, at(TUE, '16:00')))[0], 'now');
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', noted.id, 'add', 'Taproom closed for renovations this week. https://example.com/hh-notice', meta).ok, true);
  for (const lang of ['en', 'fr']) {
    const h = page(noted, at(TUE, '16:00'), lang);
    assert.doesNotMatch(h, /id="venueHappyHour"|class="venue-hh-times"/, lang);
  }
});
