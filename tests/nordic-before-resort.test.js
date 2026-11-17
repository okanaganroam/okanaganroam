// A Nordic centre that reopens before the downhill resort next to it (2026-11-14): Sovereign Lake Nordic Centre aimed
// for Nov 18 while SilverStar's lifts open Nov 27, and "cross-country skiing at SilverStar on November 20" was told
// "skiing isn't part of this November plan". Cross-country skiing on a day the Nordic centre has reopened is planned;
// downhill skiing that day still waits for the resort, and a day before the Nordic centre reopens is still off season.
// Runs on a throwaway database (like r25-audit-fixes-trip.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'nordic-before-resort-token';
process.env.TRIP_PLANNER_V2 = 'on';
const app = require('../server.js');
app.setVenueSubmissionTransport(async () => {});
const db = require('../db.js');
const tp = require('../trip-planner.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
const CENTRES = { silverstar: [50.36, -119.06], vernon: [50.267, -119.272] };
let n = 0;
const mk = (o) => { n++; const [lat, lng] = CENTRES[o.region]; const { hoursObj, ...rest } = o;
  return app.createVenue({ slug: `nordic-fixture-${n}`, rating: 4.5, latitude: lat + n / 1500, longitude: lng + n / 1500, description: 'A fixture venue used only by the Nordic reopening tests.',
    hours: JSON.stringify(hoursObj || open('09:00', '16:00')), ...rest }); };
// Pacific (PST, UTC−8) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 8) * 60 + m) * 60000); };
const NOW = at('2026-11-14', '12:00');
const closeSeason = (v, reopens) => db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, 'closed', null, reopens, 'https://example.com/season', '2026-11-14');
const stopsOf = (p) => (p.days || []).flatMap((x) => x.stops || []).concat((p.itinerary && p.itinerary.stops) || [], (p.outing && p.outing.stops) || [], p.recommendations || []);
const has = (p, v) => stopsOf(p).some((s) => s.venue && s.venue.id === v.id);
const offNote = (p) => (p.notes || []).find((x) => /skiing isn’t part of this/.test(x));

const RESORT = mk({ name: 'SilverStar Mountain Resort', region: 'silverstar', type: 'outdoor', cuisine: 'Ski resort', description: 'The downhill ski resort above Vernon.', hoursObj: open('08:30', '15:30') });
const NORDIC = mk({ name: 'Sovereign Lake Nordic Centre', region: 'silverstar', type: 'outdoor', cuisine: 'Nordic skiing, snowshoe trails', description: 'Cross-country ski and snowshoe trails in Silver Star Provincial Park.' });
closeSeason(RESORT, '2026-11-27');
closeSeason(NORDIC, '2026-11-18');

test('nordicOpenOn: only for cross-country/snowshoe requests, only once the Nordic centre has reopened', () => {
  const facts = app.buildTripPlannerFacts(false, '2026-11-14');
  assert.equal(tp.nordicOpenOn(facts, ['silverstar'], '2026-11-20', 'cross country skiing at silverstar'), true);
  assert.equal(tp.nordicOpenOn(facts, ['vernon'], '2026-11-20', 'nordic skiing near vernon'), true, 'Vernon maps to SilverStar');
  assert.equal(tp.nordicOpenOn(facts, ['silverstar'], '2026-11-16', 'cross country skiing at silverstar'), false, 'before it reopens');
  assert.equal(tp.nordicOpenOn(facts, ['silverstar'], '2026-11-20', 'ski day at silverstar'), false, 'downhill waits for the resort');
});

test('Cross-country skiing on Nov 20 is planned at the Nordic centre; downhill and Nov 16 still say when the resort opens', () => {
  const xc = app.runTripPlan({ text: 'cross-country skiing at SilverStar on November 20' }, NOW);
  assert.equal(offNote(xc), undefined, JSON.stringify(xc.notes));
  assert.ok(has(xc, NORDIC), JSON.stringify(stopsOf(xc).map((s) => s.venue && s.venue.name)));
  assert.ok(!has(xc, RESORT), 'the resort is still closed');

  const early = app.runTripPlan({ text: 'cross-country skiing at SilverStar on November 16' }, NOW);
  assert.ok(offNote(early), JSON.stringify(early.notes));
  assert.ok(!has(early, NORDIC));

  const downhill = app.runTripPlan({ text: 'ski day at SilverStar on November 20' }, NOW);
  assert.ok(offNote(downhill), JSON.stringify(downhill.notes));
  assert.ok(!has(downhill, RESORT));
});
