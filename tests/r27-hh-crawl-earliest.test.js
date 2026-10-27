// Build My Trip (2026-10-27, after PR #508): a happy hour crawl / "happy hour and dinner" uses the day's earlier happy
// hours first ("happy hour and dinner in Vernon Friday" had chained Earls 8-11 PM and Winston 9-11 PM, then dinner after
// 11 PM, though both have afternoon happy hours). Late-night windows only when asked for ("late-night", "after 9",
// "tonight" asked after 6 PM) or when nothing earlier fits, with dinner before them, never after 9:30 PM; a dinner place
// is open for the whole meal; every stop carries its clock times.
// Runs on a throwaway database with a fixed clock; run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r27-hh-crawl-token';
process.env.TRIP_PLANNER_V2 = 'on';
const app = require('../server.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to, days = WEEK) => Object.fromEntries(WEEK.map((k) => [k, days.includes(k) ? [[from, to]] : []]));
let n = 0;
const mk = (o) => { n++; const { hoursObj, ...rest } = o;
  return app.createVenue({ slug: `r27-fixture-${n}`, region: 'vernon', rating: 4.3, latitude: 50.267 + (n % 7) / 2000, longitude: -119.272 + (n % 5) / 2000, description: 'A fixture venue used only by the r27 tests.',
    hours: JSON.stringify(hoursObj || open('11:00', '23:30')), ...rest }); };
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const MON = '2026-10-26', FRI = '2026-10-30';
const MON_NOON = at(MON, '12:00');
const meta = { reason: 'r27 fixture', batch_id: 'test-r27' };
const hh = (v, times, deals) => {
  assert.equal(app.guardedHappyHourUpdate(v.id, null, { times, source_url: 'https://example.com/hh', checked_at: MON }, meta).ok, true);
  assert.equal(app.guardedHappyHourDealsUpdate(v.id, null, { deals, source_url: 'https://example.com/hh', checked_at: MON }, meta).ok, true);
};
const MON_SAT = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const both = (a1, b1, a2, b2, days = WEEK) => Object.fromEntries(days.map((k) => [k, [[a1, b1], [a2, b2]]]));

const EARLS = mk({ name: 'Earls Kitchen & Bar', type: 'restaurant', happy_hour: true, rating: 4.4 });
hh(EARLS, both('14:00', '17:00', '20:00', '23:00', MON_SAT), [{ text: 'Draught sleeves', price: '$6' }]);
const WINSTON = mk({ name: 'Winston Pub', type: 'pub', happy_hour: true, rating: 4.3 });
hh(WINSTON, both('15:00', '17:00', '21:00', '23:00'), [{ text: 'Highballs', price: '$5' }]);
// The best-rated dinner places: one open late, one whose kitchen closes before a 90-minute dinner fits.
const LATE_DINER = mk({ name: 'Late Chicken House', type: 'restaurant', rating: 4.9, hoursObj: open('16:00', '23:59') });
const EARLY_CLOSE = mk({ name: 'Early Close Bistro', type: 'restaurant', rating: 5.0, hoursObj: open('11:00', '18:30') });
const BISTRO = mk({ name: 'Vernon Supper Club', type: 'restaurant', rating: 4.5, hoursObj: open('16:30', '21:00') });

const full = (text, now) => app.withTripWeeklyNights(app.withTripSpecials(app.withTripFrenchUrls(app.withTripHappyHourDeals(app.runTripPlan({ text }, now), now)), now), now);
const crawl = (p) => (p.itinerary && p.itinerary.stops) || [];
const row = (p, s) => p.schedule.find((r) => r.venueId === s.venue.id);

test('Happy hour and dinner: the afternoon happy hours, then dinner by 9:30 PM at a place open for the whole meal', () => {
  const p = full('happy hour and dinner in Vernon Friday', MON_NOON);
  assert.ok(p.happyHourCrawl, JSON.stringify([p.kind, p.notes]));
  const stops = crawl(p);
  assert.deepEqual(stops.map((s) => s.venue.name).slice(0, 2).sort(), ['Earls Kitchen & Bar', 'Winston Pub']);
  const hhRows = stops.filter((s) => s.label === 'Happy hour').map((s) => row(p, s));
  assert.ok(hhRows.every((r) => r.date === FRI && r.startMinutes < 17 * 60), JSON.stringify(hhRows));
  const dinner = stops[stops.length - 1];
  assert.equal(dinner.label, 'Dinner');
  const dr = row(p, dinner);
  assert.ok(dr.startMinutes >= 1050 && dr.startMinutes <= 1290, JSON.stringify(dr));
  assert.notEqual(dinner.venue.id, EARLY_CLOSE.id, 'closes at 6:30 PM, before a dinner from 5:30 can end');
  assert.ok(stops.every((s) => /^Happy hour (?:2–5|3–5) PM: /.test(s.happyHourLine || '') || s.label === 'Dinner'), JSON.stringify(stops.map((s) => s.happyHourLine)));
  assert.match(p.story.text, /^Start at /);
});

test('Late-night happy hours only when asked for, or when nothing earlier fits; with dinner, dinner comes first', () => {
  const late = full('late-night happy hour crawl in Vernon on Friday', MON_NOON);
  assert.ok(late.happyHourCrawl, JSON.stringify(late.notes));
  assert.ok(crawl(late).every((s) => row(late, s).startMinutes >= 1200), JSON.stringify(late.schedule));
  const after9 = full('happy hour crawl after 9 in Vernon on Friday', MON_NOON);
  assert.ok(after9.happyHourCrawl && crawl(after9).every((s) => row(after9, s).startMinutes >= 1260), JSON.stringify(after9.schedule));
  // "late afternoon" is not late night.
  const lateAft = full('late afternoon happy hour crawl in Vernon on Friday', MON_NOON);
  assert.ok(lateAft.happyHourCrawl && crawl(lateAft).every((s) => row(lateAft, s).startMinutes < 1140), JSON.stringify(lateAft.schedule));
  // Late with dinner: dinner first (5:30-9:30 PM, ending before the first happy hour), then the late windows.
  const ld = full('late-night happy hour and dinner in Vernon Friday', MON_NOON);
  assert.ok(ld.happyHourCrawl, JSON.stringify(ld.notes));
  const stops = crawl(ld), rows = stops.map((s) => row(ld, s));
  assert.equal(stops[0].label, 'Dinner');
  assert.ok(rows[0].startMinutes >= 1050 && rows[0].startMinutes <= 1290, JSON.stringify(rows));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].startMinutes >= rows[i - 1].endMinutes && rows[i].startMinutes >= 1200, JSON.stringify(rows));
  assert.ok(stops[0].reasons.some((r) => r.text === 'Dinner before the late happy hours'));
  assert.match(ld.story.text, /^Have dinner at /);
  assert.match(ld.story.textFr, /^Soupez à /);
  // "tonight" asked at 6:30 PM on the Friday: the afternoon happy hours are over, so the late ones.
  const tonight = full('happy hour crawl in Vernon tonight', at(FRI, '18:30'));
  assert.ok(tonight.happyHourCrawl, JSON.stringify(tonight.notes));
  assert.ok(crawl(tonight).every((s) => row(tonight, s).startMinutes >= 1110), JSON.stringify(tonight.schedule));
  // Asked at noon for that night: still the earlier windows first.
  const noon = full('happy hour crawl in Vernon tonight', at(FRI, '12:00'));
  assert.ok(crawl(noon).every((s) => row(noon, s).startMinutes < 1140), JSON.stringify(noon.schedule));
});

test('Every crawl stop carries its clock times, matching the schedule; the page shows them from the schedule', () => {
  const p = full('happy hour and dinner in Vernon Friday', MON_NOON);
  for (const s of crawl(p)) {
    const r = row(p, s);
    assert.equal(s.startMinutes, r.startMinutes);
    assert.equal(s.endMinutes, r.endMinutes);
    assert.match(s.timeText, /^\d{1,2}(?::\d{2})? (?:AM|PM)–\d{1,2}(?::\d{2})? (?:AM|PM)$/);
    assert.match(s.timeTextFr, /^\d{1,2} h(?: \d{2})?–\d{1,2} h(?: \d{2})?$/);
  }
  // The v3 page's stop heading (whenLabel) reads each stop's time from plan.schedule by venue id.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes("var hit = s.event ? r.eventId === s.event.id : (s.venue && r.venueId === s.venue.id);"));
  assert.ok(v3.includes("html += '<li class=\"t3-stop\"><div class=\"t3-when\">' + esc(whenLabel(s)) + '</div><div>' + cardHtml(s, key, { planStop: true"));
});
