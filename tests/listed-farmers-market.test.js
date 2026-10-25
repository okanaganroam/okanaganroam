'use strict';
// A farmers' market listed as a place (with its own hours and season) is part of a farmers' market request
// (2026-10-25: "farmers market in Kelowna on Saturday" listed only Christmas markets). Uses the repo database and
// removes its rows afterwards (run `git checkout -q okanagan.db` if a run is interrupted).
process.env.TRIP_PLANNER_V2 = 'on';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server.js');
const db = require('../db.js');

const NOW = new Date('2026-10-25T19:00:00Z'); // Sunday noon, Okanagan time
let id = null;
test.before(() => {
  id = db.prepare('INSERT INTO venues (name, region, type, slug, description, hours) VALUES (?, ?, ?, ?, ?, ?)').run(
    "Kelowna Farmers' and Crafters' Market", 'kelowna', 'outdoor', 'test-kelowna-farmers-and-crafters-market', 'Farmers market.',
    JSON.stringify({ mon: [], tue: [], wed: [['08:00', '13:00']], thu: [], fri: [], sat: [['08:00', '13:00']], sun: [] })).lastInsertRowid;
  db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, 'open_until', '2026-10-31', null, 'https://example.com', '2026-10-25');
});
test.after(() => {
  db.prepare('DELETE FROM venue_seasons WHERE venue_id = ?').run(id);
  db.prepare('DELETE FROM venues WHERE id = ?').run(id);
});

const market = (p) => (p.events || []).find((e) => e.listedPlace);

test('a farmers market request lists the listed market on its open days', () => {
  const sat = app.runTripPlan({ text: 'farmers market in Kelowna on Saturday' }, NOW);
  assert.equal(sat.kind, 'events');
  assert.equal(sat.events[0].name, "Kelowna Farmers' and Crafters' Market");
  assert.equal(sat.events[0].dateLabel, 'Sat Oct 31');
  assert.equal(sat.events[0].time, '8 AM – 1 PM');
  assert.match(sat.events[0].url, /^\/kelowna\/outdoors\//);
  assert.equal(market(app.runTripPlan({ text: 'Kelowna farmers market' }, NOW)).dateLabel, 'Wed Oct 28, Sat Oct 31');
});

test('after its season the market is not listed and the plan says why', () => {
  const nov = app.runTripPlan({ text: 'farmers market in Kelowna on November 7' }, NOW);
  assert.equal(market(nov), undefined);
  assert.ok((nov.notes || []).some((n) => /Crafters' Market is closed for the season \(its last day was October 31\)/.test(n)));
});

test('another town or a non-market request is unchanged', () => {
  assert.equal(market(app.runTripPlan({ text: 'farmers markets in Vernon' }, NOW)), undefined);
  assert.equal(market(app.runTripPlan({ text: 'Christmas markets in Kelowna' }, NOW)), undefined);
});
