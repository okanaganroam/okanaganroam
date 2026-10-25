'use strict';
// When the only matches are closed for the season, the plan names them and says so (2026-10-25: "boat rental in
// Penticton" in October said "No Okanagan Roam listings match every part of that request."). Uses the repo database
// and removes its rows afterwards (run `git checkout -q okanagan.db` if a run is interrupted).
process.env.TRIP_PLANNER_V2 = 'on';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server.js');
const db = require('../db.js');
const { t3FrenchText } = require('../trip-french-copy.js');

const NOW = new Date('2026-10-25T19:00:00Z');
let id = null, collectionId = null, addedCollection = false;
test.before(() => {
  id = db.prepare('INSERT INTO venues (name, region, type, slug, description) VALUES (?, ?, ?, ?, ?)').run(
    'Test Lakeside Boat Rentals', 'penticton', 'outdoor', 'test-lakeside-boat-rentals', 'Boat rentals and paddleboard rentals on Okanagan Lake, May to September.').lastInsertRowid;
  db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, 'closed', null, '2027-05-01', 'https://example.com', '2026-10-01');
  const c = db.prepare("SELECT id FROM collections WHERE kind = 'activity_water' LIMIT 1").get();
  if (c) collectionId = c.id;
  else { collectionId = db.prepare("INSERT INTO collections (slug, kind, title) VALUES ('test-activity-water', 'activity_water', 'Water')").run().lastInsertRowid; addedCollection = true; }
  db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id) VALUES (?, 'venue', ?)").run(collectionId, id);
});
test.after(() => {
  db.prepare("DELETE FROM collection_items WHERE content_type = 'venue' AND content_id = ?").run(id);
  if (addedCollection) db.prepare('DELETE FROM collections WHERE id = ?').run(collectionId);
  db.prepare('DELETE FROM venue_seasons WHERE venue_id = ?').run(id);
  db.prepare('DELETE FROM venues WHERE id = ?').run(id);
});

test('a request whose only match is closed for the season says so and names it', () => {
  const p = app.runTripPlan({ text: 'boat rental in Penticton' }, NOW);
  assert.equal((p.recommendations || []).length, 0);
  const w = (p.warnings || []).find((x) => /closed for the season/.test(x));
  assert.ok(w, JSON.stringify(p.warnings));
  assert.match(w, /^Test Lakeside Boat Rentals matches but is closed for the season in October\./);
  assert.match(w, / It reopens May 1\./);
  assert.ok(!(p.warnings || []).some((x) => /No Okanagan Roam listings match/.test(x)));
});

test('in its season it is planned as usual', () => {
  const p = app.runTripPlan({ text: 'boat rental in Penticton in July' }, NOW);
  assert.ok((p.recommendations || []).some((s) => s.venue && s.venue.id === Number(id)), JSON.stringify(p.warnings));
});

test('the closed-for-season warning reads in French', () => {
  assert.equal(t3FrenchText('These places match but are closed for the season in October: A and B. A reopens May 1. Ask again with a date in their season to plan them.'),
    'Ces lieux correspondent, mais sont fermés pour la saison en octobre : A et B. A rouvre le 1er mai. Redemandez avec une date dans leur saison pour les planifier.');
  assert.equal(t3FrenchText('Pier Water Sports matches but is closed for the season right now. It reopens May 15. Ask again with a date in its season to plan it.'),
    'Pier Water Sports correspond, mais est fermé pour la saison en ce moment. Réouverture le 15 mai. Redemandez avec une date dans sa saison pour le planifier.');
});
