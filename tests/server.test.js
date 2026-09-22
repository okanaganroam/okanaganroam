// Phase 5 Sprint 1 — minimal regression-protection test foundation.
//
// Runs against a throwaway, fixture-seeded SQLite file (never the real
// committed okanagan.db and never anything on Railway's production
// volume). Requiring ../server.js triggers db.js, which — since no /data
// directory exists in this environment and no okanagan.db file exists yet
// in this project root — creates a brand new, empty local database file
// right here. We then seed it ourselves with a few fixture venues before
// asserting anything, so every test is self-contained and independent of
// any real production or seed data.
//
// This is intentionally NOT comprehensive (per the Sprint 1 brief) — it
// covers exactly the five areas called for: routes, slugs, JSON-LD,
// sitemap-supporting logic, and database reads.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
// Guarantee a clean slate every run.
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

// ENRICHMENT_ADMIN_TOKEN is read once, at module load, by server.js — it
// must be set BEFORE the require() below for /admin/correct-phone's auth
// tests to have a real (non-503) token configured. This is a fixture
// value only, never a real credential, and only exists in this test
// process's environment.
process.env.ENRICHMENT_ADMIN_TOKEN = 'test-fixture-admin-token';

const app = require('../server.js');
const db = require('../db.js');

// ---- seed a handful of fixture venues -------------------------------
const insert = db.prepare(`
  INSERT INTO venues (name, region, type, cuisine, phone, price, reviews, rating,
    description, address, latitude, longitude, hours, slug)
  VALUES (@name, @region, @type, @cuisine, @phone, @price, @reviews, @rating,
    @description, @address, @latitude, @longitude, @hours, @slug)
`);

insert.run({
  name: 'Test Trattoria', region: 'kelowna', type: 'restaurant', cuisine: 'italian',
  phone: '+1 250-555-0100', price: 2, reviews: 42, rating: 4.5,
  description: 'A fixture restaurant used only by the automated test suite.',
  address: '123 Test St, Kelowna, BC V1Y 0A0', latitude: 49.888, longitude: -119.496,
  hours: JSON.stringify({ mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: [], thu: [], fri: [], sat: [], sun: [] }),
  slug: 'test-trattoria',
});
insert.run({
  name: 'Second Test Restaurant', region: 'kelowna', type: 'restaurant', cuisine: 'diner',
  phone: null, price: 1, reviews: 10, rating: 4.0,
  description: 'A second fixture restaurant, same region+category as the first.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'second-test-restaurant',
});
insert.run({
  name: 'Test Winery', region: 'kelowna', type: 'winery', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture winery, different category, same region.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-winery',
});

// ---- seed fixture golf venue (Phase 2 Sprint 1 — Golf) ------------------
insert.run({
  name: 'Test Golf Course', region: 'kelowna', type: 'golf', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture golf course used only by the automated test suite.',
  address: '456 Fairway Dr, Kelowna, BC V1Y 0B0', latitude: 49.89, longitude: -119.49, hours: null,
  slug: 'test-golf-course',
});
// A second golf fixture in a DIFFERENT region, so the Okanagan-wide /golf
// route (2026-09-19) has something real to prove it aggregates across
// regions rather than just happening to match the single-region case.
insert.run({
  name: 'Test Vernon Golf Course', region: 'vernon', type: 'golf', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A second-region fixture golf course, used only to test the Okanagan-wide /golf listing.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-vernon-golf-course',
});
// A same-region (kelowna) indoor/simulator golf fixture (2026-09-19), so
// tests can prove the Golf Courses / Indoor Golf & Simulators split is
// driven by the description text alone (no new DB column), and that it
// only ever applies to type='golf', never to any other category.
insert.run({
  name: 'Test Golf Simulator', region: 'kelowna', type: 'golf', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'An indoor golf simulator fixture used only by the automated test suite.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-golf-simulator',
});

// A third region (west-kelowna), with a bare-domain `website` value
// (2026-09-19 bug fix), used to test both the individual-venue back-link
// ("← West Kelowna Golf") and normalizeWebsiteUrl() turning a bare domain
// into a real absolute https:// URL instead of a broken relative link.
const websiteInsert = db.prepare(`
  INSERT INTO venues (name, region, type, cuisine, phone, price, reviews, rating,
    description, address, latitude, longitude, hours, slug, website)
  VALUES (@name, @region, @type, @cuisine, @phone, @price, @reviews, @rating,
    @description, @address, @latitude, @longitude, @hours, @slug, @website)
`);
websiteInsert.run({
  name: 'Test West Kelowna Golf Course', region: 'west-kelowna', type: 'golf', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture golf course with a bare-domain website, used only by the automated test suite.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-west-kelowna-golf-course',
  website: 'shannonlakegolf.com',
});

// ---- seed fixture beach venues (Beaches Phase 2, 2026-09-19) ------------
// Three beaches: one fully populated (address + coordinates + website, so
// every CTA renders), one with none of those (so the Get Directions /
// Visit Website / Call buttons must all be absent and only Favorite /
// Add to Trip remain), and one in a second region so the Okanagan-wide
// /beaches region selector has two real regions to list. No rating,
// reviews, price, hours or amenity booleans, exactly as the approved
// Beaches data model (verified facts live in the description only).
websiteInsert.run({
  name: 'Test Beach Park', region: 'kelowna', type: 'beach', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture public beach with a swim area, playground and washrooms, used only by the automated test suite.',
  address: '100 Test Lakeshore Rd, Kelowna, BC', latitude: 49.86, longitude: -119.49, hours: null,
  slug: 'test-beach-park',
  website: 'https://www.kelowna.ca/parks-recreation/parks-beaches/parks-beaches-listing/test-beach-park',
});
insert.run({
  name: 'Test Bare Beach', region: 'kelowna', type: 'beach', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture beach with no address, coordinates, website or phone, used to prove no CTA is fabricated.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-bare-beach',
});
insert.run({
  name: 'Test Vernon Beach', region: 'vernon', type: 'beach', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture beach in a second region, used by the Okanagan-wide /beaches region selector tests.',
  address: null, latitude: 50.26, longitude: -119.35, hours: null,
  slug: 'test-vernon-beach',
});

// ---- seed fixture outdoor venues (Outdoors Phase 1, 2026-09-20) ---------
// Two outdoor destinations: one fully populated (address + coordinates +
// website) and one in a second region with no address/website, so the
// Okanagan-wide /outdoors region selector has two regions and the no-CTA
// rule is exercised for the new type too. Same approved data model as
// Beaches: verified facts live in the description only.
websiteInsert.run({
  name: 'Test Canyon Regional Park', region: 'kelowna', type: 'outdoor', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture regional park with a creek-side trail and a waterfall viewpoint, used only by the automated test suite.',
  address: '3000 Test Canyon Rd, Kelowna, BC', latitude: 49.85, longitude: -119.37, hours: null,
  slug: 'test-canyon-regional-park',
  website: 'https://storymaps.arcgis.com/stories/test-canyon-regional-park',
});
insert.run({
  name: 'Test Nordic Centre', region: 'vernon', type: 'outdoor', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture Nordic centre in a second region with no address or website, used by the /outdoors region selector tests.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-nordic-centre',
});

// ---- seed fixtures for /admin/correct-phone tests -----------------------
insert.run({
  name: 'Test Phone Fixture', region: 'kelowna', type: 'restaurant', cuisine: null,
  phone: '+1 250-555-0177', price: null, reviews: null, rating: null,
  description: 'A fixture venue with a known, populated phone number, used only by the /admin/correct-phone test suite.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-phone-fixture',
});
insert.run({
  name: 'Test Null Phone Fixture', region: 'kelowna', type: 'restaurant', cuisine: null,
  phone: null, price: null, reviews: null, rating: null,
  description: 'A fixture venue with a NULL phone number, used only by the /admin/correct-phone NULL-precondition tests.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-null-phone-fixture',
});
insert.run({
  name: 'Test Populated Phone For Null Check', region: 'kelowna', type: 'restaurant', cuisine: null,
  phone: '+1 250-555-0188', price: null, reviews: null, rating: null,
  description: 'A dedicated fixture with a populated phone, used only to test expected_current_phone: null against a POPULATED live value -- kept separate from Test Phone Fixture so it is never mutated by other /admin/correct-phone tests.',
  address: null, latitude: null, longitude: null, hours: null,
  slug: 'test-populated-phone-for-null-check',
});

// ---- seed fixture for /admin/correct-amenities tests ---------------------
// vegan=false, vegetarian=true, patio=true, gluten_free=false -- a
// deliberately mixed starting state so a single fixture can exercise all
// four per-field outcomes (false->true, true->true no-op, true->false
// rejection, expected-current mismatch) in one call. phone/address are
// populated too, specifically so a test can assert they are untouched by
// an amenities call.
const amenityInsert = db.prepare(`
  INSERT INTO venues (name, region, type, cuisine, phone, price, reviews, rating,
    description, address, latitude, longitude, hours, slug,
    vegan, vegetarian, patio, gluten_free, dog_friendly)
  VALUES (@name, @region, @type, @cuisine, @phone, @price, @reviews, @rating,
    @description, @address, @latitude, @longitude, @hours, @slug,
    @vegan, @vegetarian, @patio, @gluten_free, @dog_friendly)
`);
amenityInsert.run({
  name: 'Test Amenity Fixture', region: 'kelowna', type: 'restaurant', cuisine: null,
  phone: '+1 250-555-0199', price: 2, reviews: 5, rating: 4.2,
  description: 'A fixture venue with a deliberately mixed set of amenity flags, used only by the /admin/correct-amenities test suite.',
  address: '789 Amenity Ave, Kelowna, BC V1Y 0C0', latitude: 49.891, longitude: -119.497, hours: null,
  slug: 'test-amenity-fixture',
  vegan: 0, vegetarian: 1, patio: 1, gluten_free: 0, dog_friendly: 0,
});

// ---- seed fixtures for Build My Trip Stage 1 (buildTripItinerary) --------
// A deliberately fresh region ('osoyoos') untouched by any other fixture in
// this file, so trip-planning tests get a clean, fully-controlled pool with
// no risk of perturbing unrelated region/type-count assertions elsewhere.
// Coordinates are real-ish and hand-picked so the exact haversine distances
// between them are known (verified externally): everything except
// "Trip Pub Faraway" sits within ~1km of everything else, and Trip Pub
// Faraway sits ~22km from the rest -- inside a 'standard' (30km) or
// 'packed' (50km) pace's threshold, but outside a 'relaxed' (15km) one.
// This lets tests assert the distance-threshold logic deterministically
// without any mocking.
const tripInsert = db.prepare(`
  INSERT INTO venues (name, region, type, price, reviews, rating,
    description, address, latitude, longitude, hours, slug)
  VALUES (@name, @region, @type, @price, @reviews, @rating,
    @description, @address, @latitude, @longitude, @hours, @slug)
`);
const TRIP_FIXTURE_REGION = 'osoyoos';
[
  { name: 'Trip Golf Course', type: 'golf', rating: 4.5, latitude: 49.030000, longitude: -119.470000, slug: 'trip-golf-course' },
  { name: 'Trip Cafe Morning', type: 'cafe', rating: 4.6, latitude: 49.031000, longitude: -119.469000, slug: 'trip-cafe-morning' },
  { name: 'Trip Winery Afternoon', type: 'winery', rating: 4.7, latitude: 49.033000, longitude: -119.465000, slug: 'trip-winery-afternoon' },
  { name: 'Trip Restaurant Central', type: 'restaurant', rating: 4.8, latitude: 49.032000, longitude: -119.468000, slug: 'trip-restaurant-central' },
  { name: 'Trip Restaurant Secondary', type: 'restaurant', rating: 4.0, latitude: 49.034500, longitude: -119.463000, slug: 'trip-restaurant-secondary' },
  { name: 'Trip Brewery Evening', type: 'brewery', rating: 4.4, latitude: 49.034000, longitude: -119.464000, slug: 'trip-brewery-evening' },
  { name: 'Trip Pub Faraway', type: 'pub', rating: 4.9, latitude: 49.200000, longitude: -119.300000, slug: 'trip-pub-faraway' },
  { name: 'Trip Cocktail No Coords', type: 'cocktail', rating: 4.3, latitude: null, longitude: null, slug: 'trip-cocktail-no-coords' },
].forEach((v) => {
  tripInsert.run({
    name: v.name, region: TRIP_FIXTURE_REGION, type: v.type, price: 2, reviews: 20, rating: v.rating,
    description: 'A fixture venue used only by the Build My Trip Stage 1 test suite.',
    address: v.latitude === null ? null : '1 Trip Fixture Way, Osoyoos, BC V0H 1V0',
    latitude: v.latitude, longitude: v.longitude, hours: null, slug: v.slug,
  });
});

// ---- seed the 6 approved Hidden Gems (Design Sprint 4) ------------------
// Using their real production slugs so HIDDEN_GEM_HOMEPAGE_BLURBS' keys
// match, directly exercising the actual approved-blurb lookup rather than
// its generic fallback.
const ds4GemFixtures = [
  { name: 'Chabendo Gelato', region: 'naramata', type: 'cafe', slug: 'chabendo-gelato', rating: 4.9 },
  { name: 'Buffalo Rouge Brewing Co.', region: 'kelowna', type: 'brewery', slug: 'buffalo-rouge-brewing-co', rating: 4.9 },
  { name: 'The Flealess Hound Pub', region: 'oliver', type: 'pub', slug: 'the-flealess-hound-pub', rating: 4.7 },
  { name: 'Baccata Ridge Winery', region: 'enderby', type: 'winery', slug: 'baccata-ridge-winery', rating: 4.8 },
  { name: 'Black Widow Winery', region: 'naramata', type: 'winery', slug: 'black-widow-winery', rating: 4.8 },
  { name: 'Beat Patisserie', region: 'lake-country', type: 'cafe', slug: 'beat-patisserie', rating: 4.8 },
];
const ds4GemCollectionId = db.prepare(
  "INSERT INTO collections (slug, kind, title, region) VALUES ('test-ds4-hidden-gems', 'hidden_gem', 'Test DS4 Hidden Gems', NULL)"
).run().lastInsertRowid;
const insertDs4GemItem = db.prepare(
  "INSERT INTO collection_items (collection_id, content_type, content_id, position) VALUES (?, 'venue', ?, ?)"
);
ds4GemFixtures.forEach((fixture, i) => {
  db.prepare('INSERT INTO venues (name, region, type, slug, cuisine, phone, price, reviews, rating, description) VALUES (@name, @region, @type, @slug, NULL, NULL, NULL, NULL, @rating, @description)')
    .run({ ...fixture, description: `A fixture description for ${fixture.name}.` });
  const v = app.findVenueBySlug(fixture.region, fixture.type, fixture.slug);
  insertDs4GemItem.run(ds4GemCollectionId, v.id, i + 1);
});

// A venue with stale hidden-gem membership that is ALSO redirected —
// must never render on the homepage or receive the badge on related cards.
const ds4NonGemForRedirect = app.findVenueBySlug('kelowna', 'restaurant', 'second-test-restaurant');
const ds4RedirectedGemId = db.prepare(
  "INSERT INTO venues (name, region, type, slug, redirect_to) VALUES ('DS4 Redirected Gem', 'kelowna', 'restaurant', 'ds4-redirected-gem', ?)"
).run(ds4NonGemForRedirect.id).lastInsertRowid;
insertDs4GemItem.run(ds4GemCollectionId, ds4RedirectedGemId, 99);

// ---- seed fixture events (Phase 1 — Events architecture gate) ----------
const testVenue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');

const insertEvent = db.prepare(`
  INSERT INTO events (name, slug, region, description, start_datetime, end_datetime,
    recurrence_rule, venue_id, website, image_url)
  VALUES (@name, @slug, @region, @description, @start_datetime, @end_datetime,
    @recurrence_rule, @venue_id, @website, @image_url)
`);

// An event far in the future — "active" for the lifetime of this test run.
insertEvent.run({
  name: 'Test Future Festival', slug: 'test-future-festival', region: 'kelowna',
  description: 'A fixture event used only by the automated test suite.',
  start_datetime: '2099-06-01 10:00:00', end_datetime: '2099-06-01 18:00:00',
  recurrence_rule: null, venue_id: testVenue.id, website: 'https://example.com/festival',
  image_url: null,
});

// An event far in the past — always "expired".
insertEvent.run({
  name: 'Test Past Market', slug: 'test-past-market', region: 'kelowna',
  description: 'A fixture expired event.',
  start_datetime: '2000-01-01 10:00:00', end_datetime: '2000-01-01 14:00:00',
  recurrence_rule: null, venue_id: null, website: null, image_url: null,
});

// A recurring series, represented as ONE row (per Phase 1 scope — no
// occurrence expansion), with its end_datetime kept as a future date to
// represent the next upcoming occurrence.
insertEvent.run({
  name: 'Test Weekly Market', slug: 'test-weekly-market', region: 'kelowna',
  description: 'A fixture recurring event series.',
  start_datetime: '2099-01-03 09:00:00', end_datetime: '2099-01-03 13:00:00',
  recurrence_rule: 'weekly on Saturdays', venue_id: null, website: null, image_url: null,
});

// A standalone event in a different region, to confirm region-scoped slug
// uniqueness doesn't collide with the 'kelowna' events above.
insertEvent.run({
  name: 'Test Vernon Event', slug: 'test-future-festival', region: 'vernon',
  description: 'Same slug as the Kelowna festival, different region — must not collide.',
  start_datetime: '2099-07-01 10:00:00', end_datetime: '2099-07-01 18:00:00',
  recurrence_rule: null, venue_id: null, website: null, image_url: null,
});

// What's On Step 5: the frozen model says every scheduled event carries at
// least one materialised occurrence, so the four Phase 1 fixtures get the
// occurrence rows their stored spans describe (same dates, local times).
// Nothing about the fixtures' names/slugs/regions/spans changes.
const insertFixtureOccurrence = db.prepare(`
  INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time)
  VALUES (@event_id, @start_date, @end_date, @start_time, @end_time)
`);
for (const [region, slug, rows] of [
  ['kelowna', 'test-future-festival', [['2099-06-01', '2099-06-01', '10:00', '18:00']]],
  ['kelowna', 'test-past-market', [['2000-01-01', '2000-01-01', '10:00', '14:00']]],
  ['kelowna', 'test-weekly-market', [['2099-01-03', '2099-01-03', '09:00', '13:00'], ['2099-01-10', '2099-01-10', '09:00', '13:00']]],
  ['vernon', 'test-future-festival', [['2099-07-01', '2099-07-01', '10:00', '18:00']]],
]) {
  const ev = db.prepare('SELECT id FROM events WHERE region = ? AND slug = ?').get(region, slug);
  for (const [start_date, end_date, start_time, end_time] of rows) insertFixtureOccurrence.run({ event_id: ev.id, start_date, end_date, start_time, end_time });
}

// ---- Slugs -----------------------------------------------------------
test('slugify produces a URL-safe, lowercase, hyphenated slug', () => {
  assert.equal(app.slugify("Domino's Pizza Oliver"), 'domino-s-pizza-oliver');
  assert.equal(app.slugify('  Multiple   Spaces  '), 'multiple-spaces');
});

test('findVenueBySlug finds the seeded venue by region+type+slug', () => {
  const v = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  assert.ok(v, 'expected to find the fixture venue');
  assert.equal(v.name, 'Test Trattoria');
});

test('findVenueBySlug returns null for a slug that does not exist', () => {
  const v = app.findVenueBySlug('kelowna', 'restaurant', 'does-not-exist');
  assert.equal(v, null);
});

// ---- Database reads ----------------------------------------------------
test('listVenues returns the seeded venues and respects a region filter', () => {
  const result = app.listVenues({ region: 'kelowna' });
  assert.ok(result.venues.length >= 3);
  assert.ok(result.venues.every((v) => v.region === 'kelowna'));
});

test('getVenue returns a venue by id', () => {
  const all = app.listVenues({ region: 'kelowna' }).venues;
  const first = all[0];
  const fetched = app.getVenue(first.id);
  assert.equal(fetched.id, first.id);
  assert.equal(fetched.name, first.name);
});

test('getVenuesByRegionCategory returns only matching region+type rows', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'restaurant');
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((v) => v.region === 'kelowna' && v.type === 'restaurant'));
});

test('getRelatedVenues excludes the venue itself and matches region+type', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const related = app.getRelatedVenues(venue);
  assert.ok(related.every((v) => v.id !== venue.id));
  assert.ok(related.every((v) => v.region === venue.region && v.type === venue.type));
});

test('getStats returns a total count', () => {
  const stats = app.getStats();
  assert.ok(typeof stats.total === 'number');
  assert.ok(stats.total >= 3);
});

// ---- Build My Trip, Stage 1 (buildTripItinerary and its helpers) -------

test('haversineKm returns 0 for identical points and a plausible real-world distance otherwise', () => {
  assert.equal(app.haversineKm(49.0, -119.0, 49.0, -119.0), 0);
  // Kelowna to Vernon is roughly 45km as the crow flies.
  const km = app.haversineKm(49.888, -119.496, 50.267, -119.272);
  assert.ok(km > 40 && km < 50, `expected ~45km, got ${km}`);
});

test('pickBestTripVenue returns null once the candidate pool is exhausted', () => {
  const candidates = [{ id: 1, type: 'cafe', rating: 4.5, latitude: 49, longitude: -119 }];
  const usedIds = new Set([1]);
  const pick = app.pickBestTripVenue(candidates, usedIds, 'morning', null, 30);
  assert.equal(pick, null);
});

test('pickBestTripVenue prefers higher daypart affinity over rating', () => {
  const cafe = { id: 1, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119 };
  const pub = { id: 2, type: 'pub', rating: 4.9, latitude: 49, longitude: -119 };
  // Morning: cafe (affinity 3) must beat pub (affinity 0) despite pub's higher rating.
  const pick = app.pickBestTripVenue([cafe, pub], new Set(), 'morning', null, 30);
  assert.equal(pick.venue.id, 1);
});

test('pickBestTripVenue is fully deterministic: identical inputs always produce the identical pick', () => {
  const candidates = [
    { id: 3, type: 'restaurant', rating: 4.5, latitude: 49, longitude: -119 },
    { id: 1, type: 'restaurant', rating: 4.5, latitude: 49, longitude: -119 },
    { id: 2, type: 'restaurant', rating: 4.5, latitude: 49, longitude: -119 },
  ];
  // All three tie on affinity and rating -- the lowest id must win, every time.
  for (let i = 0; i < 5; i++) {
    const pick = app.pickBestTripVenue(candidates, new Set(), 'evening', null, 30);
    assert.equal(pick.venue.id, 1);
  }
});

test('pickBestTripVenue flags a pick that exceeds the pace distance threshold', () => {
  const near = { id: 1, type: 'pub', rating: 3.0, latitude: 49.0, longitude: -119.0 };
  const far = { id: 2, type: 'pub', rating: 3.0, latitude: 50.0, longitude: -119.0 }; // ~111km away
  const previousStop = { latitude: 49.0, longitude: -119.0 };
  const pickNear = app.pickBestTripVenue([near], new Set(), 'evening', previousStop, 30);
  assert.equal(pickNear.hopExceededThreshold, false);
  const pickFar = app.pickBestTripVenue([far], new Set(), 'evening', previousStop, 30);
  assert.equal(pickFar.hopExceededThreshold, true);
});

test('pickBestTripVenue treats an unknown distance (missing coordinates) as not exceeding the threshold', () => {
  const noCoords = { id: 1, type: 'pub', rating: 3.0, latitude: null, longitude: null };
  const previousStop = { latitude: 49.0, longitude: -119.0 };
  const pick = app.pickBestTripVenue([noCoords], new Set(), 'evening', previousStop, 30);
  assert.equal(pick.hopUnknown, true);
  assert.equal(pick.hopExceededThreshold, false);
});

test('buildTripItinerary: real fixture data, standard pace -- deterministic day plan matching hand-verified distances/ratings', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  assert.equal(venues.length, 8, 'expected exactly the 8 Build My Trip fixtures');

  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'standard' });
  assert.equal(plan.itinerary.length, 1);
  const day1 = plan.itinerary[0];
  assert.equal(day1.morning.name, 'Trip Cafe Morning', 'cafe/golf tie on morning affinity; cafe wins on rating (4.6 > 4.5)');
  assert.equal(day1.afternoon.name, 'Trip Winery Afternoon', 'winery is the only affinity-3 afternoon candidate');
  assert.equal(day1.evening.name, 'Trip Pub Faraway', 'under standard pace (30km) the far pub is in range and wins evening on rating (4.9)');
  assert.equal(plan.warnings.length, 0, 'no warnings expected -- every pick was reachable within the pace threshold');
});

test('buildTripItinerary: same fixtures, relaxed pace -- the far pub is now out of range and evening falls back to the next-best in-range pick', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'relaxed' });
  const day1 = plan.itinerary[0];
  assert.equal(day1.morning.name, 'Trip Cafe Morning');
  assert.equal(day1.afternoon.name, 'Trip Winery Afternoon');
  assert.equal(day1.evening.name, 'Trip Restaurant Central', 'the far pub (~22km) exceeds relaxed pace\'s 15km threshold; Restaurant Central (4.8, ~0.25km away) is the best in-range affinity-3 pick');
  assert.equal(plan.warnings.length, 0, 'the far pub was never picked, so no threshold warning should fire');
});

test('buildTripItinerary never repeats a venue across the whole trip, even across multiple days', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 2, interests: [], pace: 'packed' });
  const ids = [];
  plan.itinerary.forEach((day) => {
    app.TRIP_DAYPARTS.forEach((slot) => { if (day[slot]) ids.push(day[slot].id); });
  });
  assert.equal(new Set(ids).size, ids.length, 'every placed venue id must be unique across the whole itinerary');
});

test('buildTripItinerary applies an interests filter when enough matching venues exist', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const plan = app.buildTripItinerary(venues, {
    region: 'osoyoos', days: 1, interests: ['restaurant', 'cafe', 'winery', 'golf'], pace: 'standard',
  });
  const day1 = plan.itinerary[0];
  const placedTypes = app.TRIP_DAYPARTS.map((slot) => day1[slot] && day1[slot].type).filter(Boolean);
  placedTypes.forEach((type) => {
    assert.ok(['restaurant', 'cafe', 'winery', 'golf'].includes(type), `${type} should have been excluded by the interests filter`);
  });
  assert.equal(plan.warnings.length, 0, 'the pool (5 matching venues) is large enough that no fallback warning should fire');
});

test('buildTripItinerary falls back to the full region pool, with a warning, when an interests filter is too thin', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  // Only 1 golf venue exists, but a 1-day trip needs 3 stops.
  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: ['golf'], pace: 'standard' });
  const day1 = plan.itinerary[0];
  assert.ok(day1.morning && day1.afternoon && day1.evening, 'all three slots should still be filled via the fallback pool');
  assert.ok(plan.warnings.some((w) => /not enough/i.test(w)), 'a fallback warning must be present');
});

test('buildTripItinerary warns per-slot and leaves it null when a region has no venues at all', () => {
  const plan = app.buildTripItinerary([], { region: 'baldy', days: 1, interests: [], pace: 'standard' });
  const day1 = plan.itinerary[0];
  assert.equal(day1.morning, null);
  assert.equal(day1.afternoon, null);
  assert.equal(day1.evening, null);
  assert.equal(plan.warnings.length, 3, 'one "ran out of venues" warning per empty slot');
});

test('buildTripItinerary clamps out-of-range days and defaults an unrecognized pace to standard', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const tooMany = app.buildTripItinerary(venues, { region: 'osoyoos', days: 99, interests: [], pace: 'standard' });
  assert.equal(tooMany.days, 7, 'days must be clamped to the 1-7 range');
  const badPace = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'chaotic' });
  assert.equal(badPace.pace, 'standard');
});

test('buildTripItinerary is deterministic: identical inputs called twice produce byte-identical output', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const params = { region: 'osoyoos', days: 2, interests: [], pace: 'standard' };
  const planA = app.buildTripItinerary(venues, params);
  const planB = app.buildTripItinerary(venues, params);
  assert.deepEqual(planA, planB);
});

// ---- Regenerate-exclusion fix (buildTripItinerary excludeVenueIds) -----
// Reuses the exact same usedIds Set that already prevents a venue being
// picked twice in one trip -- excludeVenueIds just seeds it before the
// first slot is picked, instead of leaving it empty.

test('buildTripItinerary: excludeVenueIds removes a specific venue that would otherwise have been picked', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const cafe = venues.find((v) => v.name === 'Trip Cafe Morning');
  const base = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'standard' });
  assert.equal(base.itinerary[0].morning.name, 'Trip Cafe Morning', 'sanity check: cafe is the normal morning pick');

  const plan = app.buildTripItinerary(venues, {
    region: 'osoyoos', days: 1, interests: [], pace: 'standard', excludeVenueIds: [cafe.id],
  });
  const day1 = plan.itinerary[0];
  assert.notEqual(day1.morning && day1.morning.id, cafe.id, 'the excluded venue must never be selected');
  assert.equal(day1.morning.name, 'Trip Golf Course', 'golf ties cafe on morning affinity (3) and is the next-best pick once cafe is excluded');
});

test('buildTripItinerary: excludeVenueIds referencing a venue id that does not exist in the pool is a harmless no-op', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const base = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'standard' });
  const plan = app.buildTripItinerary(venues, {
    region: 'osoyoos', days: 1, interests: [], pace: 'standard', excludeVenueIds: [999999],
  });
  assert.deepEqual(plan, base, 'an exclude id absent from the pool must not change the plan at all');
});

test('buildTripItinerary: excluding every venue in the pool falls through to the existing "ran out of venues" warning path', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const allIds = venues.map((v) => v.id);
  const plan = app.buildTripItinerary(venues, {
    region: 'osoyoos', days: 1, interests: [], pace: 'standard', excludeVenueIds: allIds,
  });
  const day1 = plan.itinerary[0];
  assert.equal(day1.morning, null);
  assert.equal(day1.afternoon, null);
  assert.equal(day1.evening, null);
  assert.equal(plan.warnings.length, 3, 'one "ran out of venues" warning per empty slot, same as the empty-region case');
  assert.ok(plan.warnings.every((w) => /ran out of venues/i.test(w)));
});

test('buildTripItinerary: identical inputs including the same excludeVenueIds produce byte-identical output', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const pub = venues.find((v) => v.name === 'Trip Pub Faraway');
  const params = { region: 'osoyoos', days: 2, interests: [], pace: 'standard', excludeVenueIds: [pub.id] };
  const planA = app.buildTripItinerary(venues, params);
  const planB = app.buildTripItinerary(venues, params);
  assert.deepEqual(planA, planB);
  const ids = [];
  planA.itinerary.forEach((day) => { app.TRIP_DAYPARTS.forEach((slot) => { if (day[slot]) ids.push(day[slot].id); }); });
  assert.ok(!ids.includes(pub.id), 'the excluded venue must not appear anywhere across the whole itinerary');
});

// ---- Build My Trip, Stage 3 backward-compatibility regression ----------
// Written FIRST, before any other Stage 3 test or code change, per the
// approved implementation sequence. Calls pickBestTripVenue/
// buildTripItinerary with the exact old (pre-Stage-3) argument shapes --
// no preferences/amenities/budget/discovery -- and asserts the picks are
// byte-identical to the pre-Stage-3 behavior already hand-verified by the
// tests above. If a future change to the new preference-scoring tier ever
// makes it anything other than a structural no-op when unused, this test
// must fail.
test('Stage 3 backward compatibility: pickBestTripVenue with no 6th argument behaves exactly as before', () => {
  const cafe = { id: 1, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119 };
  const pub = { id: 2, type: 'pub', rating: 4.9, latitude: 49, longitude: -119 };
  const pick = app.pickBestTripVenue([cafe, pub], new Set(), 'morning', null, 30);
  assert.equal(pick.venue.id, 1, 'affinity tier must still decide this exactly as before Stage 3');
});

test('Stage 3 backward compatibility: pickBestTripVenue given empty/null preferences is identical to omitting them', () => {
  const cafe = { id: 1, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119 };
  const pub = { id: 2, type: 'pub', rating: 4.9, latitude: 49, longitude: -119 };
  const withoutPrefs = app.pickBestTripVenue([cafe, pub], new Set(), 'morning', null, 30);
  const withEmptyPrefs = app.pickBestTripVenue([cafe, pub], new Set(), 'morning', null, 30, { amenities: [], budget: null, discoveryIds: null });
  assert.deepEqual(withoutPrefs, withEmptyPrefs);
});

test('Stage 3 backward compatibility: buildTripItinerary with the old 4-field params shape reproduces the exact pre-Stage-3 plan', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'standard' });
  const day1 = plan.itinerary[0];
  assert.equal(day1.morning.name, 'Trip Cafe Morning');
  assert.equal(day1.afternoon.name, 'Trip Winery Afternoon');
  assert.equal(day1.evening.name, 'Trip Pub Faraway');
  assert.equal(plan.warnings.length, 0);
  // The three new Stage 3 fields must default cleanly and never be
  // silently populated from nothing.
  assert.deepEqual(plan.amenities, []);
  assert.equal(plan.budget, null);
  assert.deepEqual(plan.discovery, []);
});

test('Stage 3 backward compatibility: buildTripItinerary given explicit empty/null Stage 3 fields is identical to omitting them entirely', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const oldShape = app.buildTripItinerary(venues, { region: 'osoyoos', days: 2, interests: [], pace: 'packed' });
  const explicitEmpty = app.buildTripItinerary(venues, {
    region: 'osoyoos', days: 2, interests: [], pace: 'packed',
    amenities: [], budget: null, discovery: [], discoveryVenueIds: null,
  });
  assert.deepEqual(oldShape, explicitEmpty);
});

// ---- Build My Trip, Stage 3 (price/amenity/discovery scoring) -----------

test('pickBestTripVenue: amenity preference boosts a matching venue over a higher-rated non-matching one', () => {
  const dogFriendly = { id: 1, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119, dog_friendly: true };
  const notDogFriendly = { id: 2, type: 'cafe', rating: 4.9, latitude: 49, longitude: -119, dog_friendly: false };
  const pick = app.pickBestTripVenue([dogFriendly, notDogFriendly], new Set(), 'morning', null, 30, { amenities: ['dog_friendly'] });
  assert.equal(pick.venue.id, 1, 'the dog-friendly match must win the preference tier despite the lower rating');
});

test('pickBestTripVenue: a venue that matches zero requested amenities is still selectable, never excluded', () => {
  const onlyCandidate = { id: 1, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119, dog_friendly: false, vegan: false };
  const pick = app.pickBestTripVenue([onlyCandidate], new Set(), 'morning', null, 30, { amenities: ['dog_friendly', 'vegan'] });
  assert.ok(pick, 'a non-matching venue must still be pickable when it is the only candidate');
  assert.equal(pick.venue.id, 1);
});

test('pickBestTripVenue: budget preference boosts a venue whose price falls in the requested band', () => {
  const cheap = { id: 1, type: 'restaurant', rating: 4.0, latitude: 49, longitude: -119, price: 1 };
  const pricey = { id: 2, type: 'restaurant', rating: 4.9, latitude: 49, longitude: -119, price: 4 };
  const pick = app.pickBestTripVenue([cheap, pricey], new Set(), 'evening', null, 30, { budget: 'budget' });
  assert.equal(pick.venue.id, 1, 'budget-band match must win the preference tier despite the lower rating');
});

test('budgetMatchesPrice: a venue with no price on file never matches any budget band', () => {
  assert.equal(app.budgetMatchesPrice('budget', null), false);
  assert.equal(app.budgetMatchesPrice('upscale', null), false);
});

test('pickBestTripVenue: discovery preference boosts a venue whose id is in the discoveryIds set', () => {
  const gem = { id: 1, type: 'winery', rating: 4.0, latitude: 49, longitude: -119 };
  const nonGem = { id: 2, type: 'winery', rating: 4.9, latitude: 49, longitude: -119 };
  const pick = app.pickBestTripVenue([gem, nonGem], new Set(), 'afternoon', null, 30, { discoveryIds: new Set([1]) });
  assert.equal(pick.venue.id, 1, 'discovery match must win the preference tier despite the lower rating');
});

test('pickBestTripVenue: matching more requested preferences outranks matching fewer', () => {
  const oneMatch = { id: 1, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119, dog_friendly: true, vegan: false };
  const twoMatches = { id: 2, type: 'cafe', rating: 4.0, latitude: 49, longitude: -119, dog_friendly: true, vegan: true };
  const pick = app.pickBestTripVenue([oneMatch, twoMatches], new Set(), 'morning', null, 30, { amenities: ['dog_friendly', 'vegan'] });
  assert.equal(pick.venue.id, 2, 'a venue matching both requested amenities must outrank one matching only one, even at equal rating');
});

test('buildTripItinerary: amenities/budget/discovery params thread through to real fixture data and change the plan', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const faraway = venues.find((v) => v.name === 'Trip Pub Faraway');
  // Boost the far pub via discovery so it wins its slot even at 'relaxed'
  // pace, where the earlier backward-compat test proved it is normally
  // excluded by the distance threshold. This proves discoveryVenueIds
  // actually reaches pickBestTripVenue's scoring, not just the echo field.
  const plan = app.buildTripItinerary(venues, {
    region: 'osoyoos', days: 1, interests: [], pace: 'relaxed',
    discovery: ['hidden_gem'], discoveryVenueIds: new Set([faraway.id]),
  });
  assert.deepEqual(plan.discovery, ['hidden_gem'], 'discovery is echoed back for the caller/UI, independent of the resolved id set used for scoring');
  // The distance threshold (tier 1) still outranks the preference tier
  // (tier 3) -- a discovery boost can win among in-range candidates, but
  // cannot make an out-of-range venue beat an in-range one. This asserts
  // that ordering is unchanged by Stage 3, not merely that discovery has
  // *some* effect.
  assert.equal(plan.itinerary[0].evening.name, 'Trip Restaurant Central', 'an out-of-range discovery match must still lose to an in-range candidate -- tier 1 (distance) still outranks tier 3 (preference)');
});

test('buildTripItinerary: amenities param is defensively filtered to real BOOL_FIELDS names', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'standard', amenities: ['dog_friendly', 'not_a_real_field'] });
  assert.deepEqual(plan.amenities, ['dog_friendly'], 'an unrecognized field name must be silently dropped, not passed through');
});

test('buildTripItinerary: budget param is defensively validated against TRIP_VALID_BUDGETS', () => {
  const venues = app.listVenues({ region: 'osoyoos', limit: 50 }).venues;
  const plan = app.buildTripItinerary(venues, { region: 'osoyoos', days: 1, interests: [], pace: 'standard', budget: 'ultra-luxury' });
  assert.equal(plan.budget, null, 'an unrecognized budget value must fall back to null, not be passed through');
});

// ---- Build My Trip, Stage 3 (shared field validators) -------------------

test('isValidTripRegion/isValidTripDays/isValidTripInterest/isValidTripAmenity/isValidTripPace/isValidTripBudget reject the wrong values and accept the right ones', () => {
  assert.equal(app.isValidTripRegion('osoyoos'), true);
  assert.equal(app.isValidTripRegion('atlantis'), false);
  assert.equal(app.isValidTripDays(3), true);
  assert.equal(app.isValidTripDays(0), false);
  assert.equal(app.isValidTripDays(2.5), false);
  assert.equal(app.isValidTripInterest('winery'), true);
  assert.equal(app.isValidTripInterest('beach'), false);
  assert.equal(app.isValidTripAmenity('dog_friendly'), true);
  assert.equal(app.isValidTripAmenity('wheelchair_accessible'), false, 'a real-world concept with no backing column must not validate');
  assert.equal(app.isValidTripPace('relaxed'), true);
  assert.equal(app.isValidTripPace('breakneck'), false);
  assert.equal(app.isValidTripBudget('moderate'), true);
  assert.equal(app.isValidTripBudget('ultra-luxury'), false);
});

test('isValidTripDiscoveryKind only accepts kinds that actually exist in collections', () => {
  const knownKinds = app.getKnownDiscoveryKinds();
  assert.ok(knownKinds.includes('hidden_gem'), 'the fixture-seeded hidden_gem collection must be visible');
  assert.equal(app.isValidTripDiscoveryKind('hidden_gem', knownKinds), true);
  assert.equal(app.isValidTripDiscoveryKind('local_favourite', knownKinds), false, 'a kind with no real collection must not validate');
});

test('getCollectionVenueIds returns the real hidden-gem membership and matches getHiddenGemVenueIds', () => {
  const generic = app.getCollectionVenueIds('hidden_gem');
  const dedicated = app.getHiddenGemVenueIds();
  assert.deepEqual(generic, dedicated, 'the new generic lookup must agree exactly with the existing hidden-gem-specific one');
});

// ---- Build My Trip, Stage 3 (parseTripRequest -- network-free, provider mocked) ----
//
// Every test below injects options.providerFn, so parseTripRequest() never
// makes a real network call and never depends on OPENAI_API_KEY being set.

test('parseTripRequest: a full, valid mocked response maps cleanly to the structured schema', async () => {
  const mockProvider = async () => ({
    raw: {
      region: 'kelowna', days: 3, interests: ['winery', 'restaurant'], amenities: ['dog_friendly'],
      pace: 'relaxed', budget: 'moderate', discovery: ['hidden_gem'], unsupported_terms: [],
    },
    error: null,
  });
  const result = await app.parseTripRequest('a relaxed 3-day Kelowna wine trip', { providerFn: mockProvider });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    region: 'kelowna', days: 3, interests: ['winery', 'restaurant'], amenities: ['dog_friendly'],
    pace: 'relaxed', budget: 'moderate', discovery: ['hidden_gem'],
    unsupported: [], needs_clarification: [],
  });
});

test('parseTripRequest: "beaches" and other unsupported phrases land in unsupported[], never silently mapped to a real field', async () => {
  const mockProvider = async () => ({
    raw: {
      region: 'kelowna', days: 3, interests: ['winery'], amenities: ['dog_friendly'],
      pace: 'relaxed', budget: null, discovery: ['hidden_gem'],
      unsupported_terms: ['beaches', 'something fun Saturday night'],
    },
    error: null,
  });
  const result = await app.parseTripRequest(
    'Plan me a relaxed 3-day Kelowna trip with wine, hidden gems, dog-friendly places, beaches and something fun Saturday night',
    { providerFn: mockProvider }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.unsupported, ['beaches', 'something fun Saturday night']);
  assert.deepEqual(result.value.interests, ['winery']);
  assert.deepEqual(result.value.discovery, ['hidden_gem']);
  assert.deepEqual(result.value.amenities, ['dog_friendly']);
});

test('parseTripRequest: an invalid enum value from the provider is stripped into unsupported[], proving the local validator (not the model) enforces safety', async () => {
  const mockProvider = async () => ({
    raw: {
      region: 'kelowna', days: 2, interests: ['museum'], amenities: ['wheelchair_accessible'],
      pace: 'standard', budget: 'ultra-luxury', discovery: ['local_favourite'], unsupported_terms: [],
    },
    error: null,
  });
  const result = await app.parseTripRequest('a museum trip with wheelchair access', { providerFn: mockProvider });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.interests, [], 'museum is not a real CATEGORY_SLUGS value and must not pass through');
  assert.deepEqual(result.value.amenities, [], 'wheelchair_accessible has no backing column and must not pass through');
  assert.equal(result.value.budget, null, 'ultra-luxury is not a real budget band and must fall back to null');
  assert.deepEqual(result.value.discovery, [], 'local_favourite is not a real collection kind and must not pass through');
  assert.ok(result.value.unsupported.includes('museum'));
  assert.ok(result.value.unsupported.includes('wheelchair_accessible'));
  assert.ok(result.value.unsupported.includes('local_favourite'));
});

test('parseTripRequest: a missing region and missing days are reported via needs_clarification, not an error', async () => {
  const mockProvider = async () => ({
    raw: { region: null, days: null, interests: ['winery'], amenities: [], pace: 'standard', budget: null, discovery: [], unsupported_terms: [] },
    error: null,
  });
  const result = await app.parseTripRequest('I want to visit some wineries', { providerFn: mockProvider });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.needs_clarification.sort(), ['days', 'region']);
});

test('parseTripRequest: malformed/garbage provider output fails safely with ok:false, never a crash or a guessed plan', async () => {
  const notJson = async () => ({ raw: null, error: 'invalid_json' });
  const r1 = await app.parseTripRequest('gibberish request', { providerFn: notJson });
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, 'invalid_json');

  const arrayInsteadOfObject = async () => ({ raw: ['not', 'an', 'object'], error: null });
  const r2 = await app.parseTripRequest('gibberish request', { providerFn: arrayInsteadOfObject });
  assert.equal(r2.ok, false);

  const throwingProvider = async () => { throw new Error('boom'); };
  const r3 = await app.parseTripRequest('gibberish request', { providerFn: throwingProvider });
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'provider_error');
});

test('parseTripRequest: an unconfigured provider (no API key) fails safely rather than silently returning an empty plan', async () => {
  const notConfigured = async () => ({ raw: null, error: 'not_configured' });
  const result = await app.parseTripRequest('any request', { providerFn: notConfigured });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_configured');
});

test('parseTripRequest: empty text is rejected before the provider is ever called', async () => {
  let called = false;
  const spyProvider = async () => { called = true; return { raw: {}, error: null }; };
  const result = await app.parseTripRequest('   ', { providerFn: spyProvider });
  assert.equal(result.ok, false);
  assert.equal(called, false, 'the provider must never be invoked for empty/whitespace-only text');
});

// ---- Build My Trip, Stage 3 (callTripParserProvider diagnostic hardening: timeout + safe logging) ----
//
// callTripParserProvider() itself always short-circuits to
// {error:'not_configured'} in this suite (OPENAI_API_KEY is intentionally
// unset here, and must stay that way -- see the network-free rationale
// above), so its actual fetch/timeout/catch behavior is not directly
// exercisable without either a real network call or a process-cache hack,
// both of which this suite deliberately avoids. classifyTripParserFetchError()
// was pulled out specifically so that error-classification logic -- the
// actual new behavior this diagnostic change adds -- has real, fast,
// network-free coverage.

test('classifyTripParserFetchError: an AbortError (our own 10s timeout firing) is classified as a timeout', () => {
  const abortErr = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
  const result = app.classifyTripParserFetchError(abortErr);
  assert.deepEqual(result, { error: 'timeout', isTimeout: true });
});

test('classifyTripParserFetchError: any other fetch failure (DNS/TCP/TLS) is classified as a generic network error, not a timeout', () => {
  const dnsErr = Object.assign(new Error('getaddrinfo ENOTFOUND api.openai.com'), { name: 'TypeError' });
  assert.deepEqual(app.classifyTripParserFetchError(dnsErr), { error: 'network_error', isTimeout: false });

  const refusedErr = Object.assign(new Error('connect ECONNREFUSED'), { name: 'Error' });
  assert.deepEqual(app.classifyTripParserFetchError(refusedErr), { error: 'network_error', isTimeout: false });
});

test('classifyTripParserFetchError: handles a missing/malformed error object without throwing', () => {
  assert.deepEqual(app.classifyTripParserFetchError(null), { error: 'network_error', isTimeout: false });
  assert.deepEqual(app.classifyTripParserFetchError(undefined), { error: 'network_error', isTimeout: false });
  assert.deepEqual(app.classifyTripParserFetchError({}), { error: 'network_error', isTimeout: false });
});

test('callTripParserProvider: still fails closed with not_configured when OPENAI_API_KEY is unset, before any timeout/fetch machinery runs', async () => {
  const result = await app.callTripParserProvider('a relaxed 3-day Kelowna wine trip');
  assert.deepEqual(result, { raw: null, error: 'not_configured' });
});

test('callTripParserProvider: the catch-path console.error call never references the API key, Authorization header, or the raw request/headers objects (static source check)', () => {
  const fnSource = app.callTripParserProvider.toString();
  const consoleErrorCallIndex = fnSource.indexOf('console.error(');
  assert.ok(consoleErrorCallIndex !== -1, 'expected a console.error call in callTripParserProvider for the diagnostic logging added in this change');
  // Isolate just the console.error(...) call's own argument list (up to
  // its matching close paren) so this assertion is about what actually
  // gets logged, not about the rest of the function merely mentioning
  // these identifiers elsewhere (e.g. building the real Authorization
  // header a few lines earlier is expected and fine).
  const afterCall = fnSource.slice(consoleErrorCallIndex);
  const callEnd = afterCall.indexOf('\n  }'); // catch block closes shortly after
  const loggedArgs = afterCall.slice(0, callEnd === -1 ? afterCall.length : callEnd);
  assert.doesNotMatch(loggedArgs, /OPENAI_API_KEY/, 'the console.error call must never reference OPENAI_API_KEY');
  assert.doesNotMatch(loggedArgs, /Authorization/, 'the console.error call must never reference the Authorization header');
  assert.doesNotMatch(loggedArgs, /\bheaders\b/, 'the console.error call must never log the request headers object');
  assert.doesNotMatch(loggedArgs, /\bbody\b/, 'the console.error call must never log the request body');
});

// ---- Build My Trip, Stage 3 (deterministicTripParserProvider -- FREE natural-language parser) ----
//
// This is now the DEFAULT provider parseTripRequest() uses (see the
// providerFn default). Zero external calls, zero API cost, zero
// dependency on OPENAI_API_KEY. Every test in this section calls either
// deterministicTripParserProvider() directly (raw field-level assertions)
// or parseTripRequest() with no providerFn override at all (full pipeline,
// proving the real default is wired correctly) -- neither ever touches
// the network.

test('deterministicTripParserProvider: makes zero network calls -- global.fetch is never invoked', async () => {
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('fetch must never be called by the deterministic provider'); };
  try {
    const result = await app.parseTripRequest('Plan me a relaxed 3-day trip around Kelowna with wine.');
    assert.equal(result.ok, true);
    assert.equal(result.value.region, 'kelowna');
  } finally {
    global.fetch = realFetch;
  }
});

test('deterministicTripParserProvider: region -- every one of the 20 authoritative regions is recognized by its display label', () => {
  const regionLabels = {
    kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland',
    summerland: 'Summerland', penticton: 'Penticton', naramata: 'Naramata',
    'lake-country': 'Lake Country', 'okanagan-falls': 'Okanagan Falls',
    oliver: 'Oliver', osoyoos: 'Osoyoos', vernon: 'Vernon', armstrong: 'Armstrong',
    coldstream: 'Coldstream', lumby: 'Lumby', enderby: 'Enderby', kaleden: 'Kaleden',
    apex: 'Apex', 'big-white': 'Big White', silverstar: 'SilverStar', baldy: 'Baldy',
  };
  Object.entries(regionLabels).forEach(([slug, label]) => {
    const { raw } = app.deterministicTripParserProvider(`I want to plan a trip to ${label}.`);
    assert.equal(raw.region, slug, `"${label}" should resolve to region slug "${slug}"`);
  });
});

test('deterministicTripParserProvider: region -- natural-language wrappers (around/in/area) all resolve correctly without a special case', () => {
  assert.equal(app.deterministicTripParserProvider('a trip around Kelowna').raw.region, 'kelowna');
  assert.equal(app.deterministicTripParserProvider('something in Kelowna').raw.region, 'kelowna');
  assert.equal(app.deterministicTripParserProvider('the Kelowna area').raw.region, 'kelowna');
  assert.equal(app.deterministicTripParserProvider('Naramata please').raw.region, 'naramata');
});

test('deterministicTripParserProvider: region -- "West Kelowna" resolves to west-kelowna, never falling back to the shorter "kelowna" match', () => {
  assert.equal(app.deterministicTripParserProvider('a trip to West Kelowna').raw.region, 'west-kelowna');
  assert.equal(app.deterministicTripParserProvider('Lake Country please').raw.region, 'lake-country');
  assert.equal(app.deterministicTripParserProvider('Okanagan Falls sounds nice').raw.region, 'okanagan-falls');
  assert.equal(app.deterministicTripParserProvider('Big White for skiing').raw.region, 'big-white');
});

test('deterministicTripParserProvider: region -- no region mentioned resolves to null', () => {
  assert.equal(app.deterministicTripParserProvider('give me three days of wine').raw.region, null);
});

test('deterministicTripParserProvider: days -- digit and word forms both resolve, "long weekend" maps to 3, bare "weekend" stays null', () => {
  assert.equal(app.deterministicTripParserProvider('3 days in Kelowna').raw.days, 3);
  assert.equal(app.deterministicTripParserProvider('a 3-day Kelowna trip').raw.days, 3);
  assert.equal(app.deterministicTripParserProvider('for three days').raw.days, 3);
  assert.equal(app.deterministicTripParserProvider('a three day trip').raw.days, 3);
  assert.equal(app.deterministicTripParserProvider('one day in Kelowna').raw.days, 1);
  assert.equal(app.deterministicTripParserProvider('five days in Kelowna').raw.days, 5);
  assert.equal(app.deterministicTripParserProvider('a long weekend in Kelowna').raw.days, 3, '"long weekend" is a well-defined 3-day idiom, safe to map');
  assert.equal(app.deterministicTripParserProvider('a weekend in Kelowna').raw.days, null, 'bare "weekend" is genuinely ambiguous and must never be guessed');
});

test('deterministicTripParserProvider: days -- an out-of-range day count (e.g. 10) is never returned, even though the number was clearly stated', () => {
  const { raw } = app.deterministicTripParserProvider('a 10 day trip to Kelowna');
  assert.equal(raw.days, null, 'isValidTripDays() rejects 10 (max 7), so the parser must not emit it');
});

// Regression: the primary example prompt on /trip itself ("3 relaxed days
// in Kelowna...") previously failed to parse a day count at all, because
// the adjective "relaxed" sitting between "3" and "days" broke the old
// strictly-adjacent regex -- found during live browser QA of the shipped
// page, not just unit testing.
test('deterministicTripParserProvider: days -- a single trip/pace adjective between the number and "day(s)" still resolves correctly', () => {
  assert.equal(app.deterministicTripParserProvider('3 relaxed days in Kelowna with wine and hidden gems').raw.days, 3, 'the exact /trip example prompt must parse to 3 days');
  assert.equal(app.deterministicTripParserProvider('Plan me a relaxed 3 relaxed days trip').raw.days, 3);
  assert.equal(app.deterministicTripParserProvider('three packed days of golf').raw.days, 3);
  assert.equal(app.deterministicTripParserProvider('2 easy days around Vernon').raw.days, 2);
  assert.equal(app.deterministicTripParserProvider('a 5 amazing day trip').raw.days, 5);
});

test('deterministicTripParserProvider: days -- the adjective-gap allowance stays narrow and does not pick up an unrelated number near an unrelated "day"', () => {
  assert.equal(app.deterministicTripParserProvider('my order was 3 items that day').raw.days, null, 'two unrelated words ("items that") between the number and "day" must never match');
  assert.equal(app.deterministicTripParserProvider('I ate 3 apples that day').raw.days, null, '"apples" is not a recognized trip/pace adjective, so a single-word gap must still not match');
});

test('deterministicTripParserProvider: pace -- every alias for relaxed/standard/packed resolves to the correct enum value', () => {
  ['relaxed', 'easygoing', 'easy going', 'slow', 'leisurely', 'take it easy', 'laid back', 'chill'].forEach((phrase) => {
    assert.equal(app.deterministicTripParserProvider(`a ${phrase} trip to Kelowna`).raw.pace, 'relaxed', `"${phrase}" should map to relaxed`);
  });
  ['moderate pace', 'moderate speed', 'balanced', 'normal pace'].forEach((phrase) => {
    assert.equal(app.deterministicTripParserProvider(`a ${phrase} trip to Kelowna`).raw.pace, 'standard', `"${phrase}" should map to standard`);
  });
  ['packed', 'busy', 'full', 'see as much as possible', 'action packed'].forEach((phrase) => {
    assert.equal(app.deterministicTripParserProvider(`a ${phrase} trip to Kelowna`).raw.pace, 'packed', `"${phrase}" should map to packed`);
  });
});

test('deterministicTripParserProvider: budget -- every alias for budget/moderate/upscale resolves correctly, and bare "moderate" never collides with "moderate pace"', () => {
  ['cheap', 'inexpensive', 'affordable', 'on a budget', 'low cost'].forEach((phrase) => {
    assert.equal(app.deterministicTripParserProvider(`a ${phrase} trip to Kelowna`).raw.budget, 'budget', `"${phrase}" should map to budget`);
  });
  ['mid range', 'reasonable', 'reasonably priced'].forEach((phrase) => {
    assert.equal(app.deterministicTripParserProvider(`a ${phrase} trip to Kelowna`).raw.budget, 'moderate', `"${phrase}" should map to moderate`);
  });
  // Bare "moderate" (unqualified) is also a budget signal...
  assert.equal(app.deterministicTripParserProvider('a moderate trip to Kelowna').raw.budget, 'moderate');
  // ...but "moderate pace"/"moderate speed" must NOT be misread as a budget signal --
  // that phrase belongs to pace, not budget.
  const paceResult = app.deterministicTripParserProvider('a moderate pace trip to Kelowna').raw;
  assert.equal(paceResult.pace, 'standard');
  assert.equal(paceResult.budget, null, '"moderate pace" must not also set budget=moderate');

  ['upscale', 'nicer', 'higher end', 'luxury', 'splurge', 'premium', 'fancy'].forEach((phrase) => {
    assert.equal(app.deterministicTripParserProvider(`a ${phrase} trip to Kelowna`).raw.budget, 'upscale', `"${phrase}" should map to upscale`);
  });
});

test('deterministicTripParserProvider: interests -- every one of the 7 real CATEGORY_SLUGS types has at least one working alias', () => {
  assert.deepEqual(app.deterministicTripParserProvider('wineries in Kelowna').raw.interests, ['winery']);
  assert.deepEqual(app.deterministicTripParserProvider('restaurants in Kelowna').raw.interests, ['restaurant']);
  assert.deepEqual(app.deterministicTripParserProvider('cafes in Kelowna').raw.interests, ['cafe']);
  assert.deepEqual(app.deterministicTripParserProvider('breweries in Kelowna').raw.interests, ['brewery']);
  assert.deepEqual(app.deterministicTripParserProvider('pubs in Kelowna').raw.interests, ['pub']);
  assert.deepEqual(app.deterministicTripParserProvider('cocktail bars in Kelowna').raw.interests, ['cocktail']);
  assert.deepEqual(app.deterministicTripParserProvider('golfing in Kelowna').raw.interests, ['golf']);
});

test('deterministicTripParserProvider: interests -- multiple distinct aliases for the SAME type never produce duplicate entries', () => {
  const { raw } = app.deterministicTripParserProvider('wine and wineries and a wine tasting in Kelowna');
  assert.deepEqual(raw.interests, ['winery'], 'three different winery aliases in one request must still yield exactly one "winery" entry');
});

test('deterministicTripParserProvider: interests -- multiple DIFFERENT types in one request are all captured', () => {
  const { raw } = app.deterministicTripParserProvider('golf and food and cocktails in Kelowna');
  assert.deepEqual(new Set(raw.interests), new Set(['golf', 'restaurant', 'cocktail']));
  assert.equal(raw.interests.length, 3);
});

test('deterministicTripParserProvider: amenities -- every requested dog-friendly alias resolves to dog_friendly', () => {
  ['dog friendly', 'dog-friendly', 'dogs', 'my dog', 'bring my dog', 'with my dog', 'pet friendly', 'pets'].forEach((phrase) => {
    const { raw } = app.deterministicTripParserProvider(`a trip to Kelowna, ${phrase}`);
    assert.ok(raw.amenities.includes('dog_friendly'), `"${phrase}" should map to dog_friendly`);
  });
});

test('deterministicTripParserProvider: amenities -- other real BOOL_FIELDS amenities are also recognized', () => {
  assert.ok(app.deterministicTripParserProvider('a family friendly trip to Kelowna').raw.amenities.includes('kid_friendly'));
  assert.ok(app.deterministicTripParserProvider('vegan options in Kelowna').raw.amenities.includes('vegan'));
  assert.ok(app.deterministicTripParserProvider('gluten free places in Kelowna').raw.amenities.includes('gluten_free'));
  assert.ok(app.deterministicTripParserProvider('somewhere with a patio in Kelowna').raw.amenities.includes('patio'));
  assert.ok(app.deterministicTripParserProvider('happy hour in Kelowna').raw.amenities.includes('happy_hour'));
});

test('deterministicTripParserProvider: amenities -- an unsupported concept like wheelchair accessibility is never mapped to a real amenity', () => {
  const { raw } = app.deterministicTripParserProvider('a wheelchair accessible trip to Kelowna');
  assert.deepEqual(raw.amenities, []);
  assert.ok(raw.unsupported_terms.some((t) => /wheelchair/.test(t)));
});

test('deterministicTripParserProvider: discovery -- every hidden-gem alias resolves to the real hidden_gem collection kind', () => {
  ['hidden gems', 'hidden gem', 'secret spots', 'off the beaten path', 'local secrets', 'lesser known places', 'hidden places'].forEach((phrase) => {
    const { raw } = app.deterministicTripParserProvider(`a trip to Kelowna, ${phrase}`);
    assert.deepEqual(raw.discovery, ['hidden_gem'], `"${phrase}" should map to hidden_gem`);
  });
});

test('deterministicTripParserProvider: discovery -- only uses collection kinds that actually exist in the live database', () => {
  const knownKinds = app.getKnownDiscoveryKinds();
  const { raw } = app.deterministicTripParserProvider('hidden gems in Kelowna');
  raw.discovery.forEach((kind) => assert.ok(knownKinds.includes(kind), `${kind} must be a real, live collection kind`));
});

test('deterministicTripParserProvider: unsupported -- beaches/swimming/waterfront are recognized but never treated as a real interest', () => {
  const { raw } = app.deterministicTripParserProvider('a trip to Kelowna with beaches and swimming');
  assert.deepEqual(raw.interests, [], 'beaches/swimming must never appear in interests -- no such CATEGORY_SLUGS value exists');
  assert.ok(raw.unsupported_terms.includes('beaches'));
});

test('deterministicTripParserProvider: unsupported -- event language is recognized but never fabricates an event', () => {
  ['something fun happening Saturday night', "what's on Saturday", 'live music Saturday', 'a festival this weekend'].forEach((phrase) => {
    const { raw } = app.deterministicTripParserProvider(`a trip to Kelowna, ${phrase}`);
    assert.ok(raw.unsupported_terms.length > 0, `"${phrase}" should produce at least one unsupported term`);
    assert.ok(!('event' in raw), 'the raw result must never contain a fabricated "event" field');
  });
});

test('deterministicTripParserProvider: unsupported -- overlapping phrases for the same concept collapse to the longer, more specific entry only', () => {
  const { raw } = app.deterministicTripParserProvider('something fun happening Saturday night in Kelowna');
  assert.ok(raw.unsupported_terms.includes('something fun happening'));
  assert.ok(!raw.unsupported_terms.includes('something happening'), '"something happening" is fully contained in the longer matched phrase and must be dropped, not duplicated');
});

test('deterministicTripParserProvider: mixed supported + unsupported request returns the supported parts fully populated, never failing the whole request', () => {
  const { raw } = app.deterministicTripParserProvider('3 days in Kelowna with wine and a private helicopter tour');
  assert.equal(raw.region, 'kelowna');
  assert.equal(raw.days, 3);
  assert.deepEqual(raw.interests, ['winery']);
  assert.ok(raw.unsupported_terms.includes('helicopter tour'));
});

test('deterministicTripParserProvider: malformed/empty-ish input never throws and degrades to an honest, mostly-empty result', () => {
  assert.doesNotThrow(() => app.deterministicTripParserProvider('???'));
  assert.doesNotThrow(() => app.deterministicTripParserProvider('   '));
  assert.doesNotThrow(() => app.deterministicTripParserProvider('asdkjfh qwepoiu zxcvb'));
  const { raw } = app.deterministicTripParserProvider('???');
  assert.equal(raw.region, null);
  assert.equal(raw.days, null);
  assert.deepEqual(raw.interests, []);
});

test('deterministicTripParserProvider: fully deterministic -- the exact same input run 10 times produces byte-identical output every time', () => {
  const text = 'Plan me a relaxed 3-day trip around Kelowna with wine, hidden gems, dog-friendly places, beaches and something fun happening Saturday night.';
  const first = app.deterministicTripParserProvider(text);
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(app.deterministicTripParserProvider(text), first);
  }
});

test('parseTripRequest (full pipeline, default provider): fully deterministic across repeated calls, including needs_clarification', async () => {
  const text = 'Plan something in Kelowna.';
  const first = await app.parseTripRequest(text);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await app.parseTripRequest(text), first);
  }
});

// Regression: this is the LITERAL text of the /trip page's first example
// chip (trip.conv.example1). Clicking it previously produced an
// unexpected "how many days?" clarification instead of a clean result --
// found via live browser QA. Full pipeline, not just the raw provider, so
// this also proves needs_clarification correctly comes back empty.
test('parseTripRequest (full pipeline): the live /trip example-1 chip text parses cleanly with no clarification needed', async () => {
  const result = await app.parseTripRequest('3 relaxed days in Kelowna with wine and hidden gems');
  assert.equal(result.ok, true);
  assert.equal(result.value.region, 'kelowna');
  assert.equal(result.value.days, 3);
  assert.equal(result.value.pace, 'relaxed');
  assert.deepEqual(result.value.interests, ['winery']);
  assert.deepEqual(result.value.discovery, ['hidden_gem']);
  assert.deepEqual(result.value.needs_clarification, []);
});

// ---- Build My Trip, Stage 3: the 8 required example requests (default provider, full pipeline) ----

test('Example 1: relaxed 3-day Kelowna wine/hidden-gems/dog-friendly/beaches/Saturday-night request', async () => {
  const result = await app.parseTripRequest(
    'Plan me a relaxed 3-day trip around Kelowna with wine, hidden gems, dog-friendly places, beaches and something fun happening Saturday night.'
  );
  assert.deepEqual(result.value, {
    region: 'kelowna', days: 3, interests: ['winery'], amenities: ['dog_friendly'],
    pace: 'relaxed', budget: null, discovery: ['hidden_gem'],
    unsupported: ['something fun happening', 'saturday night', 'beaches'],
    needs_clarification: [],
  });
});

test('Example 2: packed 2-day Vernon golf/food request', async () => {
  const result = await app.parseTripRequest('Give me a packed 2 day trip in Vernon with golf and food.');
  assert.equal(result.value.region, 'vernon');
  assert.equal(result.value.days, 2);
  assert.equal(result.value.pace, 'packed');
  assert.ok(result.value.interests.includes('golf'));
  assert.ok(result.value.interests.includes('restaurant'));
});

test('Example 3: relaxed weekend Penticton wineries/beaches -- days must NOT be guessed', async () => {
  const result = await app.parseTripRequest("I'm looking for a relaxed weekend around Penticton with wineries and beaches.");
  assert.equal(result.value.region, 'penticton');
  assert.equal(result.value.days, null, 'bare "weekend" must never be guessed as a day count');
  assert.deepEqual(result.value.needs_clarification, ['days']);
  assert.equal(result.value.pace, 'relaxed');
  assert.ok(result.value.interests.includes('winery'));
  assert.ok(result.value.unsupported.includes('beaches'));
});

test('Example 4: 4-day Osoyoos affordable wineries + hidden gems', async () => {
  const result = await app.parseTripRequest('Plan 4 days around Osoyoos. I want affordable wineries and hidden gems.');
  assert.equal(result.value.region, 'osoyoos');
  assert.equal(result.value.days, 4);
  assert.ok(result.value.interests.includes('winery'));
  assert.equal(result.value.budget, 'budget');
  assert.ok(result.value.discovery.includes('hidden_gem'));
});

test('Example 5: 3-day Lake Country, dog, leisurely pace', async () => {
  const result = await app.parseTripRequest('Take me to Lake Country for three days. I have my dog and want a leisurely trip.');
  assert.equal(result.value.region, 'lake-country');
  assert.equal(result.value.days, 3);
  assert.ok(result.value.amenities.includes('dog_friendly'));
  assert.equal(result.value.pace, 'relaxed');
});

test('Example 6: "Plan something in Kelowna." -- days missing, needs clarification', async () => {
  const result = await app.parseTripRequest('Plan something in Kelowna.');
  assert.equal(result.value.region, 'kelowna');
  assert.equal(result.value.days, null);
  assert.deepEqual(result.value.needs_clarification, ['days']);
});

test('Example 7: "Give me three days of wine." -- region missing, needs clarification', async () => {
  const result = await app.parseTripRequest('Give me three days of wine.');
  assert.equal(result.value.region, null);
  assert.equal(result.value.days, 3);
  assert.ok(result.value.interests.includes('winery'));
  assert.deepEqual(result.value.needs_clarification, ['region']);
});

test('Example 8: 3-day Kelowna wine + private helicopter tour -- unsupported, no fabricated venue/event', async () => {
  const result = await app.parseTripRequest('Plan me a 3 day Kelowna trip with wine and a private helicopter tour.');
  assert.equal(result.value.region, 'kelowna');
  assert.equal(result.value.days, 3);
  assert.ok(result.value.interests.includes('winery'));
  assert.ok(result.value.unsupported.includes('helicopter tour'));
  assert.ok(!('venue' in result.value) && !('venues' in result.value), 'the structured result must never contain a fabricated venue field');
});

// ---- Build My Trip, Stage 2 (extractHtmlFragment + renderTripPlannerPage) ----

test('extractHtmlFragment: includeEndMarker=false stops BEFORE the end marker (regression test for the exact bug that swallowed the whole /trip page into an unterminated HTML comment)', () => {
  const html = '<div id="a">keep</div>\n\n<!-- next section starts here -->rest';
  const frag = app.extractHtmlFragment(html, '<div id="a">', '\n\n<!-- next section', false);
  assert.equal(frag, '<div id="a">keep</div>');
  assert.doesNotMatch(frag, /<!--/, 'the end marker text itself must never be included when includeEndMarker is false');
});

test('extractHtmlFragment: includeEndMarker=true includes the end marker itself (e.g. a real closing tag)', () => {
  const html = '<header id="top"><nav>stuff</nav></header>\n\n<main>rest</main>';
  const frag = app.extractHtmlFragment(html, '<header id="top">', '</header>', true);
  assert.equal(frag, '<header id="top"><nav>stuff</nav></header>');
});

test('extractHtmlFragment returns null when either marker is not found', () => {
  const html = '<div id="a">only this</div>';
  assert.equal(app.extractHtmlFragment(html, '<div id="missing">', '</div>', true), null);
  assert.equal(app.extractHtmlFragment(html, '<div id="a">', '<!-- never appears', false), null);
});

test('renderTripPlannerPage renders the full step-wizard form, all 20 regions, all 7 interest chips, and reuses the real header/trip-tray markup (not an empty/broken fragment)', () => {
  const html = app.renderTripPlannerPage();
  assert.match(html, /<form id="tripPlannerForm"/);
  assert.match(html, /id="tripRegionSelect"/);
  assert.match(html, /id="tripDaysInput"/);
  assert.match(html, /id="tripPlannerMap"/);
  // Every real region must appear as a real <option>, nothing invented.
  for (const region of app.REGION_LABELS ? Object.keys(app.REGION_LABELS) : []) {
    assert.match(html, new RegExp(`<option value="${region}">`), `missing region option for ${region}`);
  }
  // All 7 real venue types, using their ALREADY-EXISTING i18n keys.
  for (const key of Object.values(app.TRIP_INTEREST_I18N_KEY)) {
    assert.match(html, new RegExp(`data-i18n="${key.replace('.', '\\.')}"`));
  }
  // The real header and trip tray were actually extracted, not left empty.
  assert.match(html, /<header id="top">/);
  assert.match(html, /id="navTripBtn"/);
  assert.match(html, /id="tripTrayToggle"/);
  assert.match(html, /id="tripTrayPanel"/);
  // Canonical footer consolidation (2026-09-19): /trip must render the same
  // home-footer markup AND load the same canonical CSS as the homepage --
  // previously it had the correct markup but only 2 stale, hand-copied
  // patch rules, so the footer/trip button rendered unstyled.
  assert.match(html, /<footer class="home-footer">/, '/trip must render the approved home-footer');
  assert.match(html, /home-footer-region-subcol/, "/trip's footer must include the two Regions subcolumns");
  assert.match(html, /\.home-footer \{[\s\S]{0,80}background: var\(--ref-navy\)/, '/trip must load the canonical footer CSS, not just the markup');
  assert.match(html, /body:not\(\.page-browse\) #tripTrayToggle \{/, '/trip must load the canonical (gold-border, no-suitcase) trip-button CSS');
  // No unterminated HTML comment leaking from the extraction (regression
  // guard for the exact bug this page hit during manual QA).
  const openComments = (html.match(/<!--/g) || []).length;
  const closeComments = (html.match(/-->/g) || []).length;
  assert.equal(openComments, closeComments, 'every HTML comment must be properly closed');
});

test('renderTripPlannerPage does not alter the homepage template file on disk', () => {
  const fs = require('fs');
  const path = require('path');
  const sitePath = path.join(__dirname, '..', 'okanagan.html');
  const before = fs.readFileSync(sitePath, 'utf8');
  app.renderTripPlannerPage();
  const after = fs.readFileSync(sitePath, 'utf8');
  assert.equal(before, after, 'rendering /trip must only READ okanagan.html, never write to it');
});

// ---- Build My Trip, Stage 4 (conversational /trip experience) -----------
//
// No browser/DOM test harness exists in this project (confirmed by the
// Build My Trip architecture audit and every prior Stage 2/3 test in this
// file) -- so, following the exact same established pattern already used
// above and in the i18n regression tests below, this section verifies (a)
// the server-rendered HTML structure via app.renderTripPlannerPage(), and
// (b) the client module's real behavior via safe, targeted checks against
// the actual public/scripts/app.js source (fetch endpoints, i18n keys
// used, event wiring) -- not a fragile reimplementation of DOM behavior.

function readClientAppJs() {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
}

function readAppCss() {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'styles', 'app.css'), 'utf8');
}

// Regression: found via live browser QA of the shipped /trip page -- a
// pre-existing sitewide mobile rule, `.app-btn{ display:none; }` inside
// the header's `@media (max-width: 940px)` block, unintentionally hid
// EVERY .app-btn-classed button on mobile, not just the header's own
// #navTripBtn it was meant for. Since /trip's conversational and wizard
// "Plan/Generate/Regenerate" buttons all reuse the same shared .app-btn
// styling class, this made the whole feature unusable on mobile (no way
// to submit a request or generate a trip). Fixed by scoping the rule to
// `.nav .app-btn` -- #navTripBtn is the only .app-btn inside <nav
// class="nav">, so this is a no-op for every other .app-btn on the site.
test('mobile CSS: the header-only app-btn hide rule is scoped to .nav, not applied blanket sitewide', () => {
  const css = readAppCss();
  const mediaStart = css.indexOf('@media (max-width: 940px)');
  assert.ok(mediaStart !== -1, 'expected to find the 940px mobile-nav media query in app.css');
  const mediaEnd = css.indexOf('@media (max-width: 560px)', mediaStart);
  const mediaBlock = css.slice(mediaStart, mediaEnd === -1 ? mediaStart + 4000 : mediaEnd);

  assert.match(mediaBlock, /\.nav\s+\.app-btn\s*\{\s*display:\s*none;?\s*\}/, 'the header CTA hide rule must be scoped to .nav .app-btn');
  // The old unscoped form must be gone -- specifically check no bare
  // ".app-btn{" rule (not preceded by ".nav ") exists in this block.
  const bareRule = /(^|[^.\w-])\.app-btn\s*\{/g;
  let match;
  let foundUnscoped = false;
  while ((match = bareRule.exec(mediaBlock))) {
    const precedingText = mediaBlock.slice(Math.max(0, match.index - 6), match.index + match[0].length);
    if (!/\.nav\s+\.app-btn\s*\{/.test(precedingText)) foundUnscoped = true;
  }
  assert.equal(foundUnscoped, false, 'no bare, unscoped ".app-btn { display:none }" rule should remain in the mobile media query');
});

test('conversational hero: input, submit button, and example prompts are present and are the page\'s primary heading', () => {
  const html = app.renderTripPlannerPage();
  assert.match(html, /<section class="trip-conv-hero" id="tripConvHero">/);
  // Exactly one <h1> on the page, and it belongs to the conversational hero.
  const h1Matches = html.match(/<h1[ >]/g) || [];
  assert.equal(h1Matches.length, 1, 'the page must have exactly one <h1>');
  assert.match(html, /<h1 data-i18n="trip\.title">/);
  assert.match(html, /<textarea id="tripConvInput"/);
  assert.match(html, /data-i18n-placeholder="trip\.conv\.placeholder"/);
  assert.match(html, /<button type="button" class="app-btn trip-conv-submit-btn" id="tripConvSubmitBtn"/);
  assert.match(html, /class="trip-conv-example-chip" data-i18n="trip\.conv\.example1"/);
  assert.match(html, /class="trip-conv-example-chip" data-i18n="trip\.conv\.example2"/);
  assert.match(html, /class="trip-conv-example-chip" data-i18n="trip\.conv\.example3"/);
});

test('conversational hero: understood panel (chips, clarify, unsupported, generate button) is present but hidden until a parse result exists', () => {
  const html = app.renderTripPlannerPage();
  assert.match(html, /<div id="tripConvUnderstood" class="trip-conv-understood" style="display:none;">/);
  assert.match(html, /<div id="tripConvChips" class="trip-conv-chips">/);
  assert.match(html, /<div id="tripConvClarify" class="trip-conv-clarify" style="display:none;">/);
  assert.match(html, /<div id="tripConvUnsupported" class="trip-conv-unsupported" style="display:none;">/);
  assert.match(html, /<button type="button" class="app-btn trip-conv-generate-btn" id="tripConvGenerateBtn" data-i18n="trip\.conv\.generate" disabled>/);
});

test('wizard fallback: the existing step-by-step form is still fully present, unchanged internally, just collapsed behind a toggle', () => {
  const html = app.renderTripPlannerPage();
  assert.match(html, /<div id="tripWizardSection" style="display:none;">/);
  assert.match(html, /<button type="button" class="trip-conv-wizard-toggle" id="tripConvWizardToggle" aria-expanded="false" aria-controls="tripWizardSection" data-i18n="trip\.conv\.wizardToggle">/);
  // Every original wizard element must still be present -- not deleted,
  // only relocated inside the collapsed section.
  assert.match(html, /<form id="tripPlannerForm" class="trip-planner-form">/);
  assert.match(html, /id="tripRegionSelect"/);
  assert.match(html, /id="tripDaysInput"/);
  assert.match(html, /name="tripInterest"/);
  assert.match(html, /name="pace" value="relaxed"/);
  assert.match(html, /id="tripGenerateBtn"/);
  // Confirm the wizard form is textually INSIDE #tripWizardSection, not
  // just present somewhere else on the page.
  const sectionStart = html.indexOf('<div id="tripWizardSection"');
  const formStart = html.indexOf('<form id="tripPlannerForm"');
  const sectionFormClose = html.indexOf('</form>', formStart);
  const nextTopLevelDivAfterSection = html.indexOf('<div id="tripPlannerStatus"');
  assert.ok(sectionStart < formStart && formStart < sectionFormClose && sectionFormClose < nextTopLevelDivAfterSection, 'the wizard form must be nested inside #tripWizardSection');
});

test('the result/itinerary rendering targets (#tripPlannerResult, map, days) are unchanged and shared by both the wizard and the conversational flow', () => {
  const html = app.renderTripPlannerPage();
  assert.match(html, /<div id="tripPlannerResult" class="trip-planner-result" style="display:none;">/);
  assert.match(html, /<div id="tripPlannerMapWrap" class="trip-planner-map-wrap" style="display:none;">/);
  assert.match(html, /<div id="tripPlannerMap">/);
  assert.match(html, /<div id="tripPlannerDays" class="trip-planner-days">/);
  assert.match(html, /id="tripRegenerateBtn"/);
});

test('client module: the conversational flow POSTs to /api/trip/parse, never to any OpenAI/external URL', () => {
  const src = readClientAppJs();
  const convModuleStart = src.indexOf('Stage 4: conversational /trip experience');
  assert.ok(convModuleStart !== -1, 'expected to find the conversational module in app.js');
  const nearMeStart = src.indexOf('Near me: geolocation-based distance', convModuleStart);
  assert.ok(nearMeStart !== -1, 'expected a following module to bound the conversational module\'s source slice');
  const convModuleSrc = src.slice(convModuleStart, nearMeStart);
  assert.match(convModuleSrc, /fetch\('\/api\/trip\/parse'/);
  assert.doesNotMatch(convModuleSrc, /openai/i, 'the conversational client module must never reference OpenAI');
  assert.doesNotMatch(convModuleSrc, /https?:\/\/(?!.*okanaganroam)/i, 'the conversational client module must never call an external URL');
});

test('client module: a successful parse reaches the SAME existing generate pipeline (window.__tripGenerateFromParams), not a second implementation', () => {
  const src = readClientAppJs();
  assert.match(src, /window\.__tripGenerateFromParams\s*=\s*generateTrip;/, 'generateTrip must be exposed for the conversational module to reuse');
  assert.match(src, /window\.__tripGenerateFromParams\(\{/, 'the conversational module must call the shared generate function, not fetch(\'/api/trip/generate\') a second time');
  // The conversational module itself must never independently POST to
  // /api/trip/generate -- only the ORIGINAL wizard code path (inside the
  // Stage 2 IIFE, before the Stage 4 module begins) may do that.
  const stage4Start = src.indexOf('Stage 4: conversational /trip experience');
  const stage4Src = src.slice(stage4Start);
  assert.doesNotMatch(stage4Src, /fetch\('\/api\/trip\/generate'/, 'the conversational module must not call /api/trip/generate directly');
});

// ---- Regenerate state bug (found via live production QA) ----------------
//
// Regenerate previously always called generateTrip() with no argument,
// which falls back to collectParams() -- reading the WIZARD FORM's own
// fields. When the on-screen itinerary came from the conversational flow
// instead, those wizard fields were still empty, so Regenerate showed
// "Please choose a region first." even though a valid itinerary was
// already on screen. No DOM/browser harness exists in this project (see
// every other client-module test in this file), so -- consistent with
// that established pattern -- these are source-level checks of the exact
// fix, not a simulated click/fetch cycle.

test('regenerate fix: a single lastGeneratedParams variable is declared in the wizard IIFE, tracking whichever flow last succeeded', () => {
  const src = readClientAppJs();
  assert.match(src, /var lastGeneratedParams = null;/, 'expected a single shared state variable for the last successful generation\'s params');
});

test('regenerate fix: generateTrip() stores lastGeneratedParams only on a SUCCESSFUL generation, using whichever params object was actually used (collectParams() or the conversational override)', () => {
  const src = readClientAppJs();
  const genStart = src.indexOf('function generateTrip(paramsOverride, isRegenerate)');
  assert.ok(genStart !== -1, 'expected generateTrip(paramsOverride, isRegenerate) to still exist');
  const genEnd = src.indexOf('form.addEventListener', genStart);
  const genSrc = src.slice(genStart, genEnd === -1 ? genStart + 3000 : genEnd);

  // Still reads paramsOverride first, falling back to collectParams() --
  // the mechanism the conversational module already relies on is
  // completely unchanged.
  assert.match(genSrc, /var params = paramsOverride \|\| collectParams\(\);/);
  // The two original validation checks (region, days) must still exist
  // and still run BEFORE anything is stored, so an invalid attempt never
  // overwrites a previously-good lastGeneratedParams.
  assert.match(genSrc, /if \(!params\.region\) \{\s*setStatus\(t\('trip\.planner\.errorNoRegion'\), 'error'\);\s*return;/);
  assert.match(genSrc, /if \(!params\.days \|\| params\.days < 1 \|\| params\.days > 7\) \{\s*setStatus\(t\('trip\.planner\.errorDays'\), 'error'\);\s*return;/);
  // lastGeneratedParams is set to the SAME `params` variable that was
  // actually used for this call (not re-derived, not a copy of the form),
  // and only inside the success branch (after the `!result.ok` early
  // return), so a failed/errored generate can never overwrite a
  // previously-good stored value.
  const resultOkIndex = genSrc.indexOf('if (!result.ok)');
  const storeIndex = genSrc.indexOf('lastGeneratedParams = params;');
  assert.ok(resultOkIndex !== -1 && storeIndex !== -1 && storeIndex > resultOkIndex, 'lastGeneratedParams must be set only after the !result.ok early return, i.e. only on real success');
  assert.match(genSrc.slice(storeIndex - 30, storeIndex + 30), /setStatus\(''.*lastGeneratedParams = params;/s, 'lastGeneratedParams must be set right in the success path, before rendering');
});

test('regenerate fix: the Regenerate button reuses lastGeneratedParams (whichever flow produced it), falling back to the original collectParams() validation when nothing has succeeded yet', () => {
  const src = readClientAppJs();
  assert.match(src, /regenerateBtn\.addEventListener\('click', function\(\)\{ generateTrip\(lastGeneratedParams \|\| undefined, true\); \}\);/, 'Regenerate must pass the stored params (or undefined, to preserve the original validation) and isRegenerate=true, instead of always calling generateTrip() with no argument');
});

test('regenerate fix: removing a rendered stop never touches lastGeneratedParams', () => {
  const src = readClientAppJs();
  // The remove-stop handler lives inside buildSlotCard(); confirm its
  // body (up to the next top-level function) only toggles the card's own
  // class and refreshes the map -- never references lastGeneratedParams.
  const removeStart = src.indexOf("removeBtn.addEventListener('click', function(){");
  assert.ok(removeStart !== -1, 'expected the remove-stop click handler to still exist');
  const removeEnd = src.indexOf('});', removeStart) + 3;
  const removeSrc = src.slice(removeStart, removeEnd);
  assert.doesNotMatch(removeSrc, /lastGeneratedParams/, 'removing a stop must never read or write lastGeneratedParams');
  assert.match(removeSrc, /card\.classList\.add\('is-removed'\)/);
  assert.match(removeSrc, /refreshMap\(\)/);
});

// ---- Regenerate-exclusion fix (removed stops stay excluded) ------------
//
// Regenerate previously re-ran the SAME generation params from scratch,
// with no memory of which venues the user had already rejected via
// "Remove" -- so a removed stop silently came back on the next
// Regenerate. Fixed by tracking removed venue ids client-side
// (excludedVenueIds) and sending them to /api/trip/generate on every
// call, reusing the existing server-side usedIds seeding mechanism (see
// the buildTripItinerary excludeVenueIds tests) rather than a second
// selection implementation. Source-level checks only, consistent with
// every other client-module test in this file (no DOM/browser harness).

test('exclusion fix: a single excludedVenueIds array is declared in the wizard IIFE, alongside lastGeneratedParams', () => {
  const src = readClientAppJs();
  assert.match(src, /var excludedVenueIds = \[\];/, 'expected a single shared state array for removed-venue ids');
});

test('exclusion fix: buildSlotCard() exposes the venue id on the rendered card via dataset.id', () => {
  const src = readClientAppJs();
  const cardStart = src.indexOf('function buildSlotCard(daypart, venue)');
  assert.ok(cardStart !== -1, 'expected buildSlotCard() to still exist');
  const cardEnd = src.indexOf('function initMapIfNeeded', cardStart);
  const cardSrc = src.slice(cardStart, cardEnd === -1 ? cardStart + 3000 : cardEnd);
  assert.match(cardSrc, /card\.dataset\.id = venue\.id;/, 'the slot card must record the venue id so Remove can identify which venue to exclude');
});

test('exclusion fix: the remove-stop handler records the removed venue id into excludedVenueIds, deduping', () => {
  const src = readClientAppJs();
  const removeStart = src.indexOf("removeBtn.addEventListener('click', function(){");
  assert.ok(removeStart !== -1, 'expected the remove-stop click handler to still exist');
  const removeEnd = src.indexOf('});', removeStart) + 3;
  const removeSrc = src.slice(removeStart, removeEnd);
  assert.match(removeSrc, /parseInt\(card\.dataset\.id, 10\)/, 'the handler must read the id recorded on the card');
  assert.match(removeSrc, /excludedVenueIds\.indexOf\(removedId\) === -1/, 'the handler must dedupe before recording');
  assert.match(removeSrc, /excludedVenueIds\.push\(removedId\)/, 'the handler must record the removed venue id');
});

test('exclusion fix: generateTrip() includes excludeVenueIds in the /api/trip/generate request body', () => {
  const src = readClientAppJs();
  const genStart = src.indexOf('function generateTrip(paramsOverride, isRegenerate)');
  assert.ok(genStart !== -1, 'expected generateTrip(paramsOverride, isRegenerate) to still exist');
  const genEnd = src.indexOf('form.addEventListener', genStart);
  const genSrc = src.slice(genStart, genEnd === -1 ? genStart + 3000 : genEnd);
  assert.match(genSrc, /excludeVenueIds:\s*excludedVenueIds/, 'the request body must include the current exclusions');
  assert.match(genSrc, /JSON\.stringify\(requestBody\)/, 'the fetch body must be the merged requestBody, not the bare params object');
});

test('exclusion fix: a genuinely new generation (isRegenerate falsy) resets excludedVenueIds before the request is built', () => {
  const src = readClientAppJs();
  const genStart = src.indexOf('function generateTrip(paramsOverride, isRegenerate)');
  const genEnd = src.indexOf('form.addEventListener', genStart);
  const genSrc = src.slice(genStart, genEnd === -1 ? genStart + 3000 : genEnd);
  const resetMatch = genSrc.match(/if \(!isRegenerate\) \{\s*excludedVenueIds = \[\];\s*\}/);
  assert.ok(resetMatch, 'expected an explicit reset of excludedVenueIds guarded by !isRegenerate');
  const requestBodyIndex = genSrc.indexOf('var requestBody');
  assert.ok(resetMatch.index < requestBodyIndex, 'the reset must happen before the request body (and therefore excludeVenueIds) is built');
});

test('exclusion fix: Regenerate passes isRegenerate=true, so its own call site never resets excludedVenueIds', () => {
  const src = readClientAppJs();
  assert.match(src, /regenerateBtn\.addEventListener\('click', function\(\)\{ generateTrip\(lastGeneratedParams \|\| undefined, true\); \}\);/, 'Regenerate must call generateTrip with isRegenerate=true so its exclusions survive');
});

test('exclusion fix: the conversational flow\'s generate call site never passes isRegenerate, so a fresh parse-and-generate always resets exclusions', () => {
  const src = readClientAppJs();
  const callIndex = src.indexOf('window.__tripGenerateFromParams({');
  assert.ok(callIndex !== -1, 'expected the conversational generate call site to still exist');
  const callEnd = src.indexOf('});', callIndex) + 3;
  const callSrc = src.slice(callIndex, callEnd);
  assert.doesNotMatch(callSrc, /,\s*true\s*\)/, 'the conversational generate call must not pass isRegenerate=true');
});

// ---- Map markers/route invisible bug (found via live production QA) ----
//
// Root cause (confirmed by an isolated Leaflet reproduction against real
// coordinates, and again against the actual shipped code with injected
// test coordinates -- local seed data has none): the map was CREATED
// (initMapIfNeeded(), called from renderItinerary()) while its wrap was
// still display:none, and fitBounds() ran immediately after unhiding, in
// the same tick, before the browser had laid out the now-visible
// container. Leaflet's internal size cache from a hidden-container
// creation stays wrong in a way a later invalidateSize() alone can't
// fully correct -- reordering invalidateSize() before fitBounds() alone
// tightened the marker cluster but left it still consistently offset
// outside the visible container; only ALSO deferring map creation until
// after the wrap is shown resolved it completely. Fixed by computing the
// slot points first, then -- only once there's something to show --
// unhiding the wrap and calling initMapIfNeeded() (idempotent) AFTER
// that, so the map's initial size is correct from creation, plus keeping
// the requestAnimationFrame + invalidateSize-before-fitBounds ordering as
// defence in depth for later calls once the map already exists.
test('map fix: the map is created (initMapIfNeeded) only AFTER the wrap is unhidden, inside refreshMap() -- not earlier in renderItinerary()', () => {
  const src = readClientAppJs();
  const renderStart = src.indexOf('function renderItinerary(plan)');
  assert.ok(renderStart !== -1, 'expected renderItinerary() to still exist');
  const renderEnd = src.indexOf('function collectParams', renderStart);
  const renderSrc = src.slice(renderStart, renderEnd === -1 ? renderStart + 2500 : renderEnd);
  assert.doesNotMatch(renderSrc, /initMapIfNeeded\(\)/, 'renderItinerary() must no longer call initMapIfNeeded() directly -- that recreates the original bug by initializing the map while its wrap is still hidden');
  assert.match(renderSrc, /refreshMap\(\);/, 'renderItinerary() must still call refreshMap()');

  const refreshStart = src.indexOf('function refreshMap()');
  assert.ok(refreshStart !== -1, 'expected refreshMap() to still exist');
  const refreshEnd = src.indexOf('function renderItinerary', refreshStart);
  const refreshSrc = src.slice(refreshStart, refreshEnd === -1 ? refreshStart + 2500 : refreshEnd);

  const unhideIndex = refreshSrc.indexOf("mapWrapEl.style.display = '';");
  const initIndex = refreshSrc.indexOf('initMapIfNeeded();');
  assert.ok(unhideIndex !== -1 && initIndex !== -1 && unhideIndex < initIndex, 'refreshMap() must unhide mapWrapEl BEFORE calling initMapIfNeeded(), so the map is never created while hidden');

  assert.match(refreshSrc, /requestAnimationFrame\(function\(\)\{/, 'expected the fit/invalidate work to still run inside a requestAnimationFrame callback');
  const rafIndex = refreshSrc.indexOf('requestAnimationFrame(function(){');
  const invalidateIndex = refreshSrc.indexOf('map.invalidateSize();', rafIndex);
  const fitBoundsIndex = refreshSrc.indexOf('map.fitBounds(', rafIndex);
  assert.ok(invalidateIndex !== -1 && fitBoundsIndex !== -1 && invalidateIndex < fitBoundsIndex, 'invalidateSize() must run BEFORE fitBounds(), both inside the same rAF callback, so bounds are computed against the corrected size');

  // The old ordering (fitBounds immediately, invalidateSize 50ms later)
  // must be gone.
  assert.doesNotMatch(refreshSrc, /map\.fitBounds\([^)]*\)[^]*?setTimeout\(function\(\)\{\s*map\.invalidateSize\(\);\s*\}, 50\);/, 'the old fitBounds-then-delayed-invalidateSize ordering must not remain');
});

test('map fix: removed stops are still correctly excluded from the map (points computed from non-.is-removed cards only)', () => {
  const src = readClientAppJs();
  const refreshStart = src.indexOf('function refreshMap()');
  const refreshEnd = src.indexOf('function renderItinerary', refreshStart);
  const refreshSrc = src.slice(refreshStart, refreshEnd === -1 ? refreshStart + 2500 : refreshEnd);
  assert.match(refreshSrc, /if \(card\.classList\.contains\('is-removed'\)\) return;/, 'removed cards must still be excluded before points are ever collected');
});

test('map fix: the unrelated /browse region map (#okMap, a separate IIFE with its own map/markers state) is untouched', () => {
  const src = readClientAppJs();
  assert.match(src, /map = L\.map\('okMap'\)\.setView/, 'the /browse region map must still exist, unmodified');
  const okMapStart = src.indexOf("map = L.map('okMap')");
  const okMapFnEnd = src.indexOf('function refreshMapMarkers()', okMapStart) + 400;
  const okMapSrc = src.slice(Math.max(0, okMapStart - 200), okMapFnEnd);
  assert.doesNotMatch(okMapSrc, /requestAnimationFrame/, 'the /browse map init must not have been touched by the /trip map fix');
});

test('client module: clarification and unsupported rendering use the real, existing i18n keys, including the required beaches-specific message', () => {
  const src = readClientAppJs();
  assert.match(src, /t\('trip\.conv\.clarifyRegion'\)/);
  assert.match(src, /t\('trip\.conv\.clarifyDays'\)/);
  assert.match(src, /t\('trip\.conv\.clarifyBoth'\)/);
  assert.match(src, /t\('trip\.conv\.unsupportedIntro'\)/);
  assert.match(src, /t\('trip\.conv\.unsupportedBeaches'\)/);
  assert.match(src, /t\('trip\.conv\.unsupportedGeneric'\)/);
  // Beach-specific handling is a real conditional in the render function,
  // not just present as dead text somewhere in the file.
  assert.match(src, /\/beach\/i\.test\(term\)/);
});

test('client module: example prompt chips fill the input and trigger the SAME parse function used by manual submission', () => {
  const src = readClientAppJs();
  assert.match(src, /exampleChips\.forEach\(function\(chip\)\{\s*chip\.addEventListener\('click', function\(\)\{\s*submitConversational\(chip\.textContent\);/);
});

test('renderTripPlannerPage: amenity and interest chip labels in the conversational panel reuse EXISTING i18n keys (badge.*, type.*, gems.heading), not a new competing set', () => {
  const src = readClientAppJs();
  assert.match(src, /dog_friendly: 'badge\.dogFriendly'/);
  assert.match(src, /hidden_gem: 'gems\.heading'/);
  assert.match(src, /t\('type\.' \+ v\)/);
});

// ---- Build My Trip i18n regression coverage -----------------------------
//
// Guards against exactly the class of bug reported after Stage 2 shipped:
// a data-i18n key referenced by a page but never added to one (or both) of
// public/scripts/app.js's TRANSLATIONS.en / TRANSLATIONS.fr dictionaries,
// which makes t() silently fall back to returning the raw key string
// instead of real text. (The actual incident that prompted this test
// turned out to be a stale browser cache of app.js from before the Stage 2
// deploy, not a missing key -- every key was already present -- but this
// test exists so a REAL missing-key regression would be caught by the
// suite next time, rather than only by manual QA.)
//
// There is no browser/DOM test harness in this project (see the Build My
// Trip architecture audit), so this reads public/scripts/app.js as plain
// text and safely evaluates just the TRANSLATIONS object literal in an
// isolated vm context -- no other app.js code runs, nothing touches the
// real `window`/`document`.
function loadClientTranslations() {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  const start = src.indexOf('var TRANSLATIONS = {');
  const end = src.indexOf('\n};', start) + 3;
  if (start === -1 || end === -1) throw new Error('Could not locate the TRANSLATIONS object in app.js');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  return sandbox.TRANSLATIONS;
}

test('every data-i18n(-placeholder/-aria) key rendered on /trip resolves in BOTH TRANSLATIONS.en and TRANSLATIONS.fr', () => {
  const TRANSLATIONS = loadClientTranslations();
  const html = app.renderTripPlannerPage();
  const attrPattern = /data-i18n(?:-placeholder|-aria|-title|-tooltip)?="([^"]+)"/g;
  const keys = new Set();
  let m;
  while ((m = attrPattern.exec(html))) keys.add(m[1]);

  assert.ok(keys.size > 0, 'sanity check: the page must actually contain data-i18n attributes for this test to mean anything');
  // Specifically confirm the Stage 2 keys are among them, not just old ones.
  assert.ok(keys.has('trip.planner.title'), 'expected trip.planner.title to be present as a data-i18n key on /trip');

  const missing = [];
  for (const key of keys) {
    if (!(key in TRANSLATIONS.en)) missing.push(`EN missing: ${key}`);
    if (!(key in TRANSLATIONS.fr)) missing.push(`FR missing: ${key}`);
  }
  assert.deepEqual(missing, [], `every data-i18n key on /trip must exist in both locales:\n${missing.join('\n')}`);
});

test('every dynamically-set trip.planner.*/type.* key used by the /trip client module resolves in BOTH locales', () => {
  const TRANSLATIONS = loadClientTranslations();
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');

  // These are t() calls the /trip module makes with a literal string key --
  // easy to check directly. The two calls built with string concatenation
  // (daypart, venue.type) are checked separately below via their known,
  // closed set of real values, since a regex can't enumerate a runtime
  // variable's possible values.
  const literalKeys = [
    'trip.addToTrip', 'trip.inTrip', 'trip.planner.day', 'trip.planner.errorDays',
    'trip.planner.errorGeneric', 'trip.planner.errorNetwork', 'trip.planner.errorNoRegion',
    'trip.planner.generating', 'trip.planner.noVenue', 'trip.planner.removeStop',
    'trip.planner.viewVenue', 'trip.planner.warningsHeading',
  ];
  for (const key of literalKeys) {
    // Confirm the /trip module actually still calls t() with this literal
    // key (guards this test itself against silently going stale if the
    // client code is refactored to stop using one of them).
    assert.match(appJs, new RegExp(`t\\('${key.replace(/\./g, '\\.')}'\\)`), `expected app.js to still call t('${key}')`);
  }

  // 'trip.planner.' + daypart -- the three real daypart values.
  const daypartKeys = ['morning', 'afternoon', 'evening'].map((d) => `trip.planner.${d}`);
  // 'type.' + venue.type -- every venue type the /trip module can actually
  // be handed by the planner (TRIP_INTEREST_TYPES). Beaches (2026-09-19)
  // are a real CATEGORY_SLUGS type but are deliberately excluded from the
  // Build My Trip planner (TRIP_PLANNER_EXCLUDED_TYPES), so no itinerary
  // stop can ever have type 'beach' and app.js -- a frozen homepage asset
  // -- needs no 'type.beach' key. The guard below keeps this honest: if a
  // type is ever added to the planner it must also get its i18n keys.
  const typeKeys = app.TRIP_INTEREST_TYPES.map((t) => `type.${t}`);
  assert.ok(!app.TRIP_INTEREST_TYPES.includes('beach'), 'beach must stay out of the planner types until app.js gains type.beach in both locales');

  const missing = [];
  for (const key of [...literalKeys, ...daypartKeys, ...typeKeys]) {
    if (!(key in TRANSLATIONS.en)) missing.push(`EN missing: ${key}`);
    if (!(key in TRANSLATIONS.fr)) missing.push(`FR missing: ${key}`);
  }
  assert.deepEqual(missing, [], `every dynamically-used trip.planner.*/type.* key must exist in both locales:\n${missing.join('\n')}`);
});

test('every trip.conv.* key used by the conversational /trip module (literal AND dynamically-looked-up) resolves in BOTH locales', () => {
  const TRANSLATIONS = loadClientTranslations();
  const appJs = readClientAppJs();

  const literalKeys = [
    'trip.conv.errorEmpty', 'trip.conv.parsing', 'trip.conv.errorGeneric',
    'trip.conv.fieldRegion', 'trip.conv.fieldDays',
    'trip.conv.fieldPace', 'trip.conv.fieldInterests', 'trip.conv.fieldAmenities',
    'trip.conv.fieldDiscovery', 'trip.conv.fieldBudget', 'trip.conv.clarifyRegion',
    'trip.conv.clarifyDays', 'trip.conv.clarifyBoth', 'trip.conv.unsupportedIntro',
    'trip.conv.unsupportedBeaches', 'trip.conv.unsupportedGeneric', 'trip.conv.removeChip',
  ];
  for (const key of literalKeys) {
    assert.match(appJs, new RegExp(`t\\('${key.replace(/\./g, '\\.')}'\\)`), `expected app.js to still call t('${key}')`);
  }

  // Keys resolved dynamically via a lookup table (AMENITY_I18N_KEY /
  // BUDGET_I18N_KEY / DISCOVERY_I18N_KEY), not a literal t('...') call --
  // enumerated directly from the real, authoritative field lists rather
  // than regex-matched, since a regex can't see through an object lookup.
  const amenityKeys = [
    'badge.dogFriendly', 'badge.vegan', 'badge.vegetarian', 'badge.glutenFree', 'badge.patio',
    'badge.kidFriendly', 'badge.lakeView', 'badge.nonalcoholic', 'badge.sportsTv',
    'badge.liveMusic', 'badge.greatGroups', 'badge.happyHour',
  ];
  const budgetKeys = ['trip.conv.budget.budget', 'trip.conv.budget.moderate', 'trip.conv.budget.upscale'];
  const discoveryKeys = ['gems.heading'];
  // Also the hero/examples/submit/generate/wizard-toggle strings, which are
  // set via data-i18n attributes on the server-rendered page rather than a
  // JS-side t() call -- already covered by the data-i18n sweep test above,
  // included again here for a single one-stop completeness assertion.
  const heroKeys = [
    'trip.title', 'trip.conv.subtitle', 'trip.conv.placeholder', 'trip.conv.submit',
    'trip.conv.examplesLabel', 'trip.conv.example1', 'trip.conv.example2', 'trip.conv.example3',
    'trip.conv.generate', 'trip.conv.wizardToggle', 'trip.conv.understoodHeading',
  ];

  const missing = [];
  for (const key of [...literalKeys, ...amenityKeys, ...budgetKeys, ...discoveryKeys, ...heroKeys]) {
    if (!(key in TRANSLATIONS.en)) missing.push(`EN missing: ${key}`);
    if (!(key in TRANSLATIONS.fr)) missing.push(`FR missing: ${key}`);
  }
  assert.deepEqual(missing, [], `every trip.conv.* (and reused) key must exist in both locales:\n${missing.join('\n')}`);
});

// ---- JSON-LD -----------------------------------------------------------
test('breadcrumbListSchema produces valid schema.org BreadcrumbList shape', () => {
  const schema = app.breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Kelowna', url: 'https://okanaganroam.com/kelowna' },
  ]);
  assert.equal(schema['@type'], 'BreadcrumbList');
  assert.equal(schema.itemListElement.length, 2);
  assert.equal(schema.itemListElement[0].position, 1);
  assert.equal(schema.itemListElement[1].name, 'Kelowna');
});

test('buildOpeningHoursSpecification parses valid hours JSON into schema.org specs', () => {
  const hours = JSON.stringify({ mon: [['09:00', '17:00']], tue: [], wed: null });
  const specs = app.buildOpeningHoursSpecification(hours);
  assert.equal(specs.length, 1);
  assert.equal(specs[0]['@type'], 'OpeningHoursSpecification');
  assert.equal(specs[0].opens, '09:00');
  assert.equal(specs[0].closes, '17:00');
});

test('buildOpeningHoursSpecification returns undefined for malformed/missing hours', () => {
  assert.equal(app.buildOpeningHoursSpecification(null), undefined);
  assert.equal(app.buildOpeningHoursSpecification('not json'), undefined);
});

// ---- Shared presentation components (Sprint 1 additions) --------------
test('badgeChipsHtml only renders chips for true boolean fields', () => {
  const html = app.badgeChipsHtml({ dog_friendly: true, vegan: false, patio: true });
  assert.match(html, /Dog[- ][Ff]riendly/);
  assert.match(html, /Patio/i);
  assert.doesNotMatch(html, /Vegan/i);
});

test('breadcrumbNavHtml renders the last item as plain text, not a link', () => {
  const html = app.breadcrumbNavHtml([{ name: 'Home', href: '/' }, { name: 'Kelowna' }]);
  assert.match(html, /<a href="\/">Home<\/a>/);
  assert.doesNotMatch(html, /<a[^>]*>Kelowna<\/a>/);
});

test('venueCardHtml links to the venue when it has a slug and known type', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const html = app.venueCardHtml(venue);
  assert.match(html, new RegExp(`href="/kelowna/${app.CATEGORY_SLUGS.restaurant}/test-trattoria"`));
});

// ---- Route/render smoke tests (via the real HTML-producing functions) --
test('renderVenuePage produces a page with the venue name as H1 and a canonical link', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const html = app.renderVenuePage(venue, [], [], []);
  assert.match(html, /<h1>Test Trattoria<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/restaurant/);
  assert.match(html, /BreadcrumbList/); // JSON-LD present
});

test('renderCategoryPage lists seeded venues and links to the region page', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'restaurant');
  const html = app.renderCategoryPage('kelowna', 'restaurant', rows, []);
  assert.match(html, /Test Trattoria/);
  assert.match(html, /href="\/kelowna">/);
});

test('renderRegionPage lists category counts for the region', () => {
  const counts = app.getRegionCategoryCounts('kelowna');
  const html = app.renderRegionPage('kelowna', counts, []);
  assert.match(html, /Kelowna/);
});

test('render404Page returns a 404-flavored page for an unknown path', () => {
  const html = app.render404Page('/nonexistent/path');
  assert.match(html, /404|not found/i);
});

// ==== Design Sprint 4 (Visual & Editorial Polish) ==========================

// Content-model change (2026-09-17): the Hidden Gems homepage section is
// now 3 fixed editorial theme cards (Dog-Friendly Finds/Local Favourites/
// Secret Spots) with dedicated photography, not 3 real venues picked live
// by rating. The underlying hidden_gem collection/membership query and
// per-venue card renderer (hiddenGemHomepageCardHtml) still exist and are
// tested directly below -- they're just no longer called by
// renderHiddenGemsHomepageHTML().

test('exactly 3 Hidden Gems editorial cards render, in the approved order, each with real dedicated artwork', () => {
  const html = app.renderHiddenGemsHomepageHTML();
  const cardCount = (html.match(/class="hidden-gem-card"/g) || []).length;
  assert.equal(cardCount, 3, 'expected exactly 3 cards');
  assert.match(html, /Dog-Friendly Finds/);
  assert.match(html, /Local Favourites/);
  assert.match(html, /Secret Spots/);
  assert.match(html, /src="\/images\/hidden-gems\/dog-friendly\.webp"/);
  assert.match(html, /src="\/images\/hidden-gems\/local-favourites\.webp"/);
  assert.match(html, /src="\/images\/hidden-gems\/secret-spots\.webp"/);
});

test('Hidden Gems editorial cards all link to #directory (no fabricated per-theme venue list)', () => {
  const html = app.renderHiddenGemsHomepageHTML();
  const hrefs = Array.from(html.matchAll(/class="hidden-gem-card" href="([^"]*)"/g)).map((m) => m[1]);
  assert.deepEqual(hrefs, ['#directory', '#directory', '#directory']);
});

test('Hidden Gems editorial cards have no badge/region-chip, just an inline pin before the title', () => {
  const html = app.renderHiddenGemsHomepageHTML();
  assert.doesNotMatch(html, /hidden-gem-card-badge/);
  const pinCount = (html.match(/class="hidden-gem-card-pin"/g) || []).length;
  assert.equal(pinCount, 3, 'expected exactly one inline pin icon per card');
});

test('Hidden Gems editorial cards de-emphasize rating -- no star-rating glyph', () => {
  const html = app.renderHiddenGemsHomepageHTML();
  assert.doesNotMatch(html, /★/);
});

test('Hidden Gems heading includes the subtitle and a "view all" link', () => {
  const html = app.renderHiddenGemsHomepageHTML();
  assert.match(html, /Less crowds\. More Okanagan\./);
  assert.match(html, /discover-heading-link/);
});

// The previous per-venue card renderer is unused by the homepage now, but
// stays defined/exported and directly tested -- still real, correct
// behavior that could back a future "view all hidden gems" page.
test('hiddenGemHomepageCardHtml still renders a real approved venue correctly (unused by the homepage, still directly testable)', () => {
  const gelato = app.findVenueBySlug('naramata', 'cafe', 'chabendo-gelato');
  const html = app.hiddenGemHomepageCardHtml(gelato);
  assert.match(html, /href="\/naramata\/cafes\/chabendo-gelato"/);
  assert.match(html, /Chabendo Gelato/);
  assert.match(html, /hidden-gem-card-img" src="\/images\/mood\/eat\.webp"/, 'cafe type maps to the Food & Drink mood image');
  assert.doesNotMatch(html, /★/);
});

test('related/nearby venue cards include the compact visual band', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const related = app.getRelatedVenues(venue);
  const html = app.renderVenuePage(venue, related, [], []);
  assert.match(html, /related-card related-card-restaurant/);
  assert.match(html, /compact-band-sm/);
});

test('related/nearby venue links remain intact and unchanged', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const related = app.getRelatedVenues(venue);
  const html = app.renderVenuePage(venue, related, [], []);
  for (const r of related) {
    assert.match(html, new RegExp(`href="/${r.region}/${app.CATEGORY_SLUGS[r.type]}/${r.slug}"`));
  }
});

test('a related/nearby card shows the Hidden Gem badge only when that specific venue is actually a hidden gem', () => {
  const trattoria = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const gemNearby = app.findVenueBySlug('kelowna', 'brewery', 'buffalo-rouge-brewing-co');
  const html = app.renderVenuePage(trattoria, [], [gemNearby], []);
  assert.match(html, /Hidden Gem/);
});

test('existing getRelatedVenues/getNearbyVenues query behavior is unchanged (still same-region+category / same-region+different-category)', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const related = app.getRelatedVenues(venue);
  const nearby = app.getNearbyVenues(venue);
  assert.ok(related.every((v) => v.region === venue.region && v.type === venue.type));
  assert.ok(nearby.every((v) => v.region === venue.region && v.type !== venue.type));
});

test('all six category tile descriptions render with their approved copy', () => {
  const html = app.renderExploreByCategoryHTML();
  assert.match(html, /Sit-down meals worth planning your day around\./);
  assert.match(html, /Coffee, baking, and a good reason to slow down\./);
  assert.match(html, /Tasting rooms across the valley&#39;s growing wine country\./);
  assert.match(html, /Local beer, made close to where you&#39;re standing\./);
  assert.match(html, /Casual food and a drink, no reservation needed\./);
  assert.match(html, /Courses across the Okanagan&#39;s valleys and benches\./);
});

test('category tile links/slugs remain unchanged by the new tagline copy', () => {
  const html = app.renderExploreByCategoryHTML();
  assert.match(html, new RegExp(`href="/kelowna/${app.CATEGORY_SLUGS.restaurant}"`));
});

test('Kaleden, Coldstream, Lumby, and Baldy remain valid region links and receive no invented placeholder copy', () => {
  assert.equal(app.REGION_TAGLINES.kaleden, undefined);
  assert.equal(app.REGION_TAGLINES.coldstream, undefined);
  assert.equal(app.REGION_TAGLINES.lumby, undefined);
  assert.equal(app.REGION_TAGLINES.baldy, undefined);
  // Still valid, functional region pages via the unchanged REGION_LABELS taxonomy.
  assert.equal(app.CATEGORY_SLUGS.restaurant, 'restaurants'); // sanity: taxonomy machinery itself untouched
});

// Reference redesign (webpage design.png, decision #2): this exact set of 6
// replaces Milestone 2's 8-region curated list. Oliver/Osoyoos/Summerland
// keep their own region/category pages fully intact -- they just aren't one
// of the 6 featured homepage destinations anymore.
const REFERENCE_EXPLORE_REGIONS = ['kelowna', 'west-kelowna', 'lake-country', 'penticton', 'naramata', 'vernon'];

test('Reference redesign: Explore the Okanagan shows exactly the 6 approved featured destinations, including Lake Country', () => {
  const html = app.renderExploreRegionsHTML();
  const regions = Array.from(html.matchAll(/class="region-card" href="\/([a-z-]+)"/g)).map((m) => m[1]);
  assert.deepEqual(regions, REFERENCE_EXPLORE_REGIONS);
});

test('Reference redesign: Explore the Okanagan cards each include a real, servable destination image', () => {
  const html = app.renderExploreRegionsHTML();
  for (const region of REFERENCE_EXPLORE_REGIONS) {
    assert.match(html, new RegExp(`src="/images/regions/${region}\\.webp"`), `expected a destination image for ${region}`);
  }
});

test('Reference redesign: Explore the Okanagan cards still link to their real, unchanged region pages', () => {
  const html = app.renderExploreRegionsHTML();
  for (const region of REFERENCE_EXPLORE_REGIONS) {
    assert.match(html, new RegExp(`href="/${region}"`), `expected a working link to /${region}`);
  }
});

test('Reference redesign: Explore the Okanagan cards no longer show the old tagline copy (landscape name+arrow treatment)', () => {
  const html = app.renderExploreRegionsHTML();
  assert.doesNotMatch(html, /region-card-tagline/, 'the reference treatment has no tagline on these cards');
});

test('Reference redesign: Oliver, Osoyoos, and Summerland are no longer in the featured homepage set, but keep their own real region pages', () => {
  const html = app.renderExploreRegionsHTML();
  assert.doesNotMatch(html, /href="\/oliver"/);
  assert.doesNotMatch(html, /href="\/osoyoos"/);
  assert.doesNotMatch(html, /href="\/summerland"/);
  assert.equal(app.REGION_LABELS.oliver, 'Oliver', 'Oliver remains a valid, real region elsewhere on the site');
  assert.equal(app.REGION_LABELS.osoyoos, 'Osoyoos', 'Osoyoos remains a valid, real region elsewhere on the site');
  assert.equal(app.REGION_LABELS.summerland, 'Summerland', 'Summerland remains a valid, real region elsewhere on the site');
});

test('Reference redesign: Explore the Okanagan has no "see all regions" link, matching webpage design.png exactly', () => {
  const html = app.renderExploreRegionsHTML();
  assert.doesNotMatch(html, /discover-see-all/, 'the reference has no link below the card row -- the section ends right after it');
  assert.doesNotMatch(html, /See all regions/);
});

test('Reference redesign: Explore the Okanagan arrow icon is a plain glyph, not a circular badge (distinct from the Hidden Gems cards\' own circle treatment)', () => {
  const html = app.renderExploreRegionsHTML();
  const arrowCount = (html.match(/class="region-card-arrow"/g) || []).length;
  assert.equal(arrowCount, 6, 'expected exactly one arrow icon per destination card');
});

// ==== "Explore All Okanagan Regions" link (2026-09-17) ======================
// Bridges the 6 featured destinations to the site's full 20-region
// coverage, reusing the existing /browse region picker -- no new route.
// Layout correction (same day): two earlier attempts put this inside
// .region-card-grid (first as its own bordered tile, then as a 7th grid
// item pinned above Vernon via a grid-column hack) -- both misaligned
// Vernon relative to the other 5 cards. Moved into the section's own
// heading row instead, reusing the exact .discover-heading-split/
// .discover-heading-link pattern "Hidden Gems"/"What are you in the mood
// for?" already use for their own "View all hidden gems"/"Explore all
// categories" links, so the grid at 480px+ is untouched -- just the 6
// real destination cards, one aligned row.
//
// Responsive follow-up (same day): on the mobile single-column stack
// the heading-row link sat above the whole grid, not specifically above
// Vernon. Fixed by rendering a SECOND, CSS-toggled copy of the identical
// link between Naramata and Vernon in the grid markup, `display:none` at
// 480px+ so it never occupies a grid track at tablet/desktop widths --
// the 6-card row stays exactly as before. Exactly one of the two copies
// is meant to be visible at a given width; both exist in the HTML with
// distinguishing modifier classes (.explore-all-link-heading /
// .explore-all-link-mobile) that a real browser's CSS resolves.

test('Explore All Okanagan Regions: renders exactly twice (heading copy + mobile-grid copy), both plain .discover-heading-link links to /browse (no new route), no bordered-tile treatment', () => {
  const html = app.renderExploreRegionsHTML();
  const matches = Array.from(html.matchAll(/<a class="discover-heading-link explore-all-link explore-all-link-(heading|mobile)" href="([^"]*)" data-i18n="explore\.allRegions">Explore All Okanagan Regions &rarr;<\/a>/g));
  assert.equal(matches.length, 2, 'expected exactly two "Explore All Okanagan Regions" links (a heading copy and a mobile-grid copy), both using the shared .discover-heading-link component');
  const variants = matches.map((m) => m[1]).sort();
  assert.deepEqual(variants, ['heading', 'mobile'], 'expected one heading-copy and one mobile-copy instance');
  matches.forEach((m) => assert.equal(m[2], '/browse'));
  assert.doesNotMatch(html, /region-card-all/, 'the old bordered-tile treatment must be fully gone');
  const headingPos = html.indexOf('<h2 data-i18n="explore.heading">Explore by Destination</h2>');
  assert.ok(headingPos !== -1, 'expected the section heading to be i18n-wired');
  const headingLinkPos = html.indexOf('explore-all-link-heading');
  const gridPos = html.indexOf('class="region-card-grid"');
  assert.ok(headingPos < headingLinkPos && headingLinkPos < gridPos, 'expected the heading-copy link inside the heading row, before the card grid starts');
  assert.match(html, /<div class="discover-heading discover-heading-split">\s*<h2 data-i18n="explore\.heading">Explore by Destination<\/h2>\s*<a class="discover-heading-link explore-all-link explore-all-link-heading" href="\/browse" data-i18n="explore\.allRegions">Explore All Okanagan Regions &rarr;<\/a>\s*<\/div>/, 'expected the same heading-row pattern used by Hidden Gems/Mood Cards');
});

test('Explore All Okanagan Regions: the destination-card grid contains the unchanged 6 real cards in their original order (still one aligned row at 480px+), plus the mobile-only copy of the link positioned AFTER Vernon (the last card)', () => {
  const html = app.renderExploreRegionsHTML();
  const gridMatch = html.match(/<div class="region-card-grid">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/);
  assert.ok(gridMatch, 'expected to find the region-card-grid container');
  const gridHtml = gridMatch[1];
  const regionCardHrefs = Array.from(gridHtml.matchAll(/class="region-card" href="([^"]*)"/g)).map((m) => m[1]);
  assert.deepEqual(regionCardHrefs, ['/kelowna', '/west-kelowna', '/lake-country', '/penticton', '/naramata', '/vernon'], 'the grid must contain only the 6 real photo destination cards, unchanged, in their original order');
  const vernonPos = gridHtml.indexOf('href="/vernon"');
  const mobileLinkPos = gridHtml.indexOf('explore-all-link-mobile');
  assert.ok(mobileLinkPos > -1, 'expected the mobile-only copy of the link inside the grid');
  assert.ok(vernonPos < mobileLinkPos, 'expected the mobile-only link positioned after the Vernon card in DOM order (corrected 2026-09-17 -- was previously, incorrectly, before Vernon)');
  assert.doesNotMatch(gridHtml, /explore-all-link-heading/, 'the heading-row copy must not be inside the card grid');
});

// ==== Reference redesign, forensic-comparison rebuild: Build Your
// Perfect Okanagan Trip (supersedes the earlier 3-column split) ============

test('Build Your Perfect Okanagan Trip section renders with the approved heading and reuses the existing trip-tray/map controls', () => {
  const html = app.renderBuildTripCTAHTML();
  assert.match(html, /id="buildTrip"/);
  assert.match(html, /Build Your Perfect Okanagan Trip/);
  // Must reuse the EXISTING trip-tray/map infrastructure -- not new IDs
  // duplicating that state -- so this CTA drives the real, already-working
  // #tripTrayToggle/#tripTrayPanel and #mapToggleBtn/#mapPanel elements
  // rather than reimplementing anything.
  assert.match(html, /id="tripCtaOpenTrip"/);
  assert.match(html, /id="tripCtaOpenMap"/);
});

test('Build Your Perfect Okanagan Trip section does not introduce a new trip data model or duplicate trip-tray IDs', () => {
  const html = app.renderBuildTripCTAHTML();
  assert.doesNotMatch(html, /id="tripTray"/, 'must not duplicate the real #tripTray widget');
  assert.doesNotMatch(html, /id="tripTrayPanel"/, 'must not duplicate the real #tripTrayPanel');
  assert.doesNotMatch(html, /id="okMap"/, 'must not duplicate the real #okMap element');
});

test('Build Your Perfect Okanagan Trip map visual uses the new map image, not the old hand-built SVG', () => {
  const html = app.renderBuildTripCTAHTML();
  assert.match(html, /<img class="trip-cta-map-img" src="\/images\/trip-cta-map\.webp" width="1376" height="768"/, 'the new map image must render inside the existing #tripCtaOpenMap button');
  assert.doesNotMatch(html, /<svg class="trip-cta-map-svg"/, 'the old hand-built SVG map must be fully removed, not layered under the new image');
  assert.doesNotMatch(html, /tripLakeGrad|tripPinGrad|tripSoftBlur/, 'the old SVG\'s gradient/filter defs must be gone too');
});

test('Reference redesign: Build Your Perfect Okanagan Trip has a single CTA button, matching the reference (no second visible link)', () => {
  const html = app.renderBuildTripCTAHTML();
  const buttonCount = (html.match(/class="trip-cta-btn"/g) || []).length;
  assert.equal(buttonCount, 1, 'expected exactly one visible CTA button');
  assert.match(html, />Build My Trip/);
});

// ==== Content-change pass (2026-09-17): six mood cards ====================
// Food & Drink/Wine/Beaches/Golf/What's On/Outdoors, in that exact order,
// all equal visual treatment (no primary/secondary tiering). This
// supersedes the earlier 6-card set that had Hidden Gems instead of Wine
// -- see renderMoodCardsHTML() for the reasoning. Hidden Gems' own
// dedicated section (separate tests further below) is untouched. Reuses
// 100% existing filtering/anchor/category infrastructure -- no new venue
// type, route, or schema.

test('Mood cards: exactly six cards render, in the approved order', () => {
  const html = app.renderMoodCardsHTML();
  const keys = Array.from(html.matchAll(/class="mood-card mood-card-([a-z-]+)"/g)).map((m) => m[1]);
  assert.deepEqual(keys, ['food-drink', 'wine', 'beaches', 'golf', 'whats-on', 'outdoors']);
});

test('Mood cards: no primary/secondary tiering -- all six cards share one class', () => {
  const html = app.renderMoodCardsHTML();
  assert.doesNotMatch(html, /mood-card-primary/, 'tiered primary class must be gone');
  assert.doesNotMatch(html, /mood-card-secondary/, 'tiered secondary class must be gone');
});

test('Mood cards: What\'s On links to /whats-on with no filter', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-whats-on" href="\/whats-on">/);
});

test('Mood cards: no data-i18n translation key ever renders as visible card text (every titleKey resolves to real English in both languages)', () => {
  const html = app.renderMoodCardsHTML();
  assert.doesNotMatch(html, />mood\.[a-zA-Z.]+</, 'a raw translation key leaked into the visible label');
});

test('Mood cards: Food & Drink filters to exactly restaurant, cafe, brewery, pub, cocktail (winery split back out to its own Wine card)', () => {
  const html = app.renderMoodCardsHTML();
  const cardMatch = html.match(/class="mood-card mood-card-food-drink"[^>]*data-mood-filter="([^"]*)"/);
  assert.ok(cardMatch, 'expected the Food & Drink card to have a data-mood-filter attribute');
  const types = cardMatch[1].split(',').sort();
  assert.deepEqual(types, ['brewery', 'cafe', 'cocktail', 'pub', 'restaurant'].sort());
});

test('Mood cards: Wine filters to winery only', () => {
  const html = app.renderMoodCardsHTML();
  const cardMatch = html.match(/class="mood-card mood-card-wine"[^>]*data-mood-filter="([^"]*)"/);
  assert.ok(cardMatch, 'expected the Wine card to have a data-mood-filter attribute');
  assert.equal(cardMatch[1], 'winery');
});

test('Mood cards: Outdoors links to the Okanagan-wide /outdoors listing once outdoor venues exist (2026-09-20 fix), with no filter', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-outdoors" href="\/outdoors">/);
  assert.doesNotMatch(html, /mood-card-outdoors"[^>]*data-mood-filter/, 'no filter: the card is a plain link like Golf and Beaches');
});

test('Mood cards: Beaches links to the Okanagan-wide /beaches listing once beach venues exist (2026-09-20 fix), with no filter', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-beaches" href="\/beaches">/, 'the whole <a class="mood-card"> is the clickable area and must target /beaches');
  assert.doesNotMatch(html, /mood-card-beaches" href="#exploreRegions"/);
  assert.doesNotMatch(html, /mood-card-beaches"[^>]*data-mood-filter/, 'no filter: the card is a plain link like Golf');
  // The other cards keep their existing destinations.
  assert.match(html, /class="mood-card mood-card-outdoors" href="\/outdoors">/);
  assert.match(html, /class="mood-card mood-card-whats-on" href="\/whats-on">/);
  assert.match(html, /class="mood-card mood-card-food-drink" href="\/browse\?types=restaurant,cafe,brewery,pub,cocktail" data-mood-filter="restaurant,cafe,brewery,pub,cocktail">/);
  assert.match(html, /class="mood-card mood-card-golf" href="\/golf">/);
  assert.match(html, /class="mood-card mood-card-wine" href="\/[a-z-]+\/wineries" data-mood-filter="winery">/);
});

test('Mood cards: Hidden Gems is no longer one of the six mood cards', () => {
  const html = app.renderMoodCardsHTML();
  assert.doesNotMatch(html, /mood-card-hidden-gems/, 'Hidden Gems must not render as a mood card in this pass');
});

test('Mood cards: Golf links to the Okanagan-wide /golf listing (not a single region) once any golf venue exists, else falls back to /browse', () => {
  const html = app.renderMoodCardsHTML();
  const golfMatch = html.match(/class="mood-card mood-card-golf" href="([^"]*)"/);
  assert.ok(golfMatch, 'expected the Golf card to have an href');
  assert.ok(
    golfMatch[1] === '/browse' || golfMatch[1] === '/golf',
    `Golf href must be either the /browse fallback (no golf venues exist) or the Okanagan-wide /golf listing -- never a single-region /:region/golf page, since golf venues are deliberately spread across multiple regions. Got: ${golfMatch[1]}`
  );
});

test('Mood cards: Wine still uses the existing dynamic bestRegionForType mechanism with a /browse fallback', () => {
  const html = app.renderMoodCardsHTML();
  const wineMatch = html.match(/class="mood-card mood-card-wine" href="([^"]*)"/);
  assert.ok(wineMatch, 'expected the Wine card to have an href');
  assert.ok(
    wineMatch[1] === '/browse' || /^\/[a-z-]+\/wineries$/.test(wineMatch[1]),
    `Wine href must be either the /browse fallback (no winery venues exist) or a real /:region/wineries category page, got: ${wineMatch[1]}`
  );
});

test('Mood cards: Food & Drink links to /browse pre-filtered by its multi-type filter (no single category page covers all five types)', () => {
  const html = app.renderMoodCardsHTML();
  const cardMatch = html.match(/class="mood-card mood-card-food-drink" href="([^"]*)"/);
  assert.ok(cardMatch, 'expected the Food & Drink card to have an href');
  assert.equal(cardMatch[1], '/browse?types=restaurant,cafe,brewery,pub,cocktail');
});

test('Mood cards: image paths are correct for all six cards, including the not-yet-supplied Beaches asset', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /mood-card-food-drink"[^]*?src="\/images\/mood\/eat\.webp"/);
  assert.match(html, /mood-card-wine"[^]*?src="\/images\/mood\/drink\.webp"/);
  assert.match(html, /mood-card-beaches"[^]*?src="\/images\/mood\/beaches\.webp"/);
  assert.match(html, /mood-card-golf"[^]*?src="\/images\/mood\/golf\.webp"/);
  assert.match(html, /mood-card-whats-on"[^]*?src="\/images\/mood\/whats-on\.webp"/);
  assert.match(html, /mood-card-outdoors"[^]*?src="\/images\/mood\/explore\.webp"/);
});

test('Mood cards: heading row includes the reference\'s "Explore all categories" link', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /discover-heading-link/);
});

// ==== Localization fix (2026-09-17): full EN<->fr-CA i18n wiring pass ====
// The audit found large swaths of the homepage were plain hardcoded
// English with no data-i18n attribute at all (so the language switcher
// had nothing to translate), plus one stale French string (hero.lead)
// that no longer matched the current English copy. These tests lock in
// that every previously-untranslated piece of server-rendered homepage
// text now carries the right data-i18n/-aria/-title/-tooltip key.

test('Mood cards: all six titles are now i18n-wired (Food & Drink and Beaches previously had titleKey:null)', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card-title" data-i18n="mood\.foodDrink\.title">Food &amp; Drink</);
  assert.match(html, /class="mood-card-title" data-i18n="mood\.beaches\.title">Beaches</);
  assert.match(html, /data-i18n="mood\.wine\.title"/);
  assert.match(html, /data-i18n="mood\.golf\.title"/);
  assert.match(html, /data-i18n="mood\.whatsOn\.title"/);
  assert.match(html, /data-i18n="mood\.outdoors\.title"/);
  const titleSpanCount = (html.match(/class="mood-card-title" data-i18n=/g) || []).length;
  assert.equal(titleSpanCount, 6, 'expected all 6 mood card titles to be i18n-wired, not 4');
});

test('Hidden Gems: section heading and all 3 editorial card titles/blurbs are i18n-wired', () => {
  const html = app.renderHiddenGemsHomepageHTML();
  assert.match(html, /<h2><span data-i18n="gems\.heading">Hidden Gems<\/span>/);
  assert.match(html, /data-i18n="gems\.dogFriendly\.title">Dog-Friendly Finds</);
  assert.match(html, /data-i18n="gems\.dogFriendly\.blurb">Patios and trails where your dog belongs\.</);
  assert.match(html, /data-i18n="gems\.localFavourites\.title">Local Favourites</);
  assert.match(html, /data-i18n="gems\.localFavourites\.blurb">The spots locals keep coming back to\.</);
  assert.match(html, /data-i18n="gems\.secretSpots\.title">Secret Spots</);
  assert.match(html, /data-i18n="gems\.secretSpots\.blurb">Quiet corners away from the crowds\.</);
});

test('Explore by Destination: section heading and both copies of "Explore All Okanagan Regions" are i18n-wired', () => {
  const html = app.renderExploreRegionsHTML();
  assert.match(html, /<h2 data-i18n="explore\.heading">Explore by Destination<\/h2>/);
  const linkMatches = html.match(/data-i18n="explore\.allRegions"/g) || [];
  assert.equal(linkMatches.length, 2, 'expected both the heading-row and mobile-grid copies to be i18n-wired');
});

test('Build Your Perfect Okanagan Trip: entire visible/accessible section is i18n-wired', () => {
  const html = app.renderBuildTripCTAHTML();
  assert.match(html, /class="trip-cta-title" data-i18n="trip\.title">Build Your Perfect Okanagan Trip</);
  assert.match(html, /class="trip-cta-lead" data-i18n="trip\.lead"/);
  assert.match(html, /class="trip-cta-example" data-i18n="trip\.example"/);
  assert.match(html, /data-i18n="trip\.buildMyTrip">Build My Trip</);
  assert.match(html, /data-i18n-aria="trip\.openMap"/);
});

test('Home footer: previously-untranslated pieces (tagline, Food & Drinks, Beaches, Hidden Gems, social aria-labels, Facebook tooltip, copyright, logo aria-label) are all now i18n-wired', () => {
  const html = app.renderHomeFooterHTML();
  assert.match(html, /class="home-footer-tagline" data-i18n="homeFooter\.taglineFull"/);
  assert.match(html, /data-i18n="homeFooter\.foodDrinks">Food &amp; Drinks</);
  assert.match(html, /data-i18n="mood\.beaches\.title">Beaches</);
  assert.match(html, /data-i18n="gems\.heading">Hidden Gems</);
  assert.match(html, /data-i18n-aria="homeFooter\.instagramAria"/);
  assert.match(html, /data-i18n-aria="homeFooter\.tiktokAria"/);
  assert.match(html, /data-i18n-tooltip="homeFooter\.comingSoon"/);
  assert.match(html, /data-i18n-title="homeFooter\.comingSoon"/);
  assert.match(html, /data-i18n-aria="homeFooter\.facebookAria"/);
  assert.match(html, /class="home-footer-copyright" data-i18n="homeFooter\.copyright"/);
  assert.match(html, /class="home-footer-logo" href="\/" aria-label="Okanagan Roam home" data-i18n-aria="nav\.homeAriaLabel"/);
});

// ==== Homepage footer redesign (2026-09-17, revised twice same day) ======
// Full-width navy home-footer, homepage-only (/browse keeps the original
// static footer -- covered by the HTTP-level tests further below). Final
// revision: exactly FOUR equal-width columns in one row -- Explore, About,
// Regions (all 20 real regions, compact 2x2 sub-grid of the wizard's own
// Central/South/North/Ski resorts groups, kept INSIDE this one column
// rather than a separate full-width band), and Social Media (renamed from
// "Follow"). Tagline spelled out in full ("Okanagan Valley, British
// Columbia"). The old global footer{padding} leak is also fixed here
// (.home-footer now explicitly overrides it to padding:0).

test('Home footer: Explore column has exactly the 7 approved items, in order, each with a real href (no invented routes)', () => {
  const html = app.renderHomeFooterHTML();
  const exploreMatch = html.match(/<h4 data-i18n="homeFooter\.explore">Explore<\/h4>\s*<ul>([\s\S]*?)<\/ul>/);
  assert.ok(exploreMatch, 'expected to find the Explore column');
  const items = Array.from(exploreMatch[1].matchAll(/<a href="([^"]*)"[^>]*>([^<]*(?:&[a-z]+;[^<]*)*)<\/a>/g))
    .map((m) => ({ href: m[1], text: m[2] }));
  assert.equal(items.length, 7, 'expected exactly 7 Explore links');
  assert.equal(items[0].text, 'Food &amp; Drinks');
  assert.equal(items[0].href, '/browse?types=restaurant,cafe,brewery,pub,cocktail');
  assert.ok(items[1].href === '/browse' || /^\/[a-z-]+\/wineries$/.test(items[1].href), `Wine href unexpected: ${items[1].href}`);
  assert.equal(items[2].href, '#exploreRegions');
  assert.ok(items[3].href === '/browse' || items[3].href === '/golf', `Golf href must be /browse (no golf venues) or the Okanagan-wide /golf listing, never a single region: ${items[3].href}`);
  assert.equal(items[4].href, '/whats-on');
  assert.equal(items[5].href, '/outdoors', 'footer Outdoors link matches the Outdoors mood card once outdoor venues exist (2026-09-20)');
  assert.equal(items[6].href, '#hiddenGems');
});

test('Home footer: Regions column lists ALL 20 real regions (none omitted), each a real /:region link', () => {
  const html = app.renderHomeFooterHTML();
  const allRegionLinks = Array.from(html.matchAll(/<a href="\/([a-z-]+)">[^<]+<\/a>/g))
    .map((m) => m[1])
    .filter((slug) => app.REGION_LABELS[slug]);
  const expected = Object.keys(app.REGION_LABELS).sort();
  assert.deepEqual(Array.from(new Set(allRegionLinks)).sort(), expected, 'every REGION_LABELS region must have a footer link, and no extra/invented ones');
});

test('Home footer: Regions renders as two explicit subcolumns -- Central+South, then North+Ski resorts -- matching the approved FOOTER.png reference', () => {
  const html = app.renderHomeFooterHTML();
  const groupLabels = Array.from(html.matchAll(/<h5 data-i18n="(wizard\.[a-zA-Z]+)">([^<]*)<\/h5>/g)).map((m) => m[2]);
  assert.deepEqual(groupLabels, ['Central', 'South', 'North', 'Ski resorts']);
  const subcolMatch = html.match(/<div class="home-footer-region-groups">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="home-footer-col">/);
  assert.ok(subcolMatch, 'expected the region-groups wrapper immediately followed by the Social Media column');
  const subcolHtml = subcolMatch[1];
  const subcolPositions = Array.from(subcolHtml.matchAll(/home-footer-region-subcol/g)).length;
  assert.equal(subcolPositions, 2, 'expected exactly 2 region subcolumns');
  assert.ok(subcolHtml.indexOf('Central') < subcolHtml.indexOf('South'), 'Central must precede South (same subcolumn)');
  assert.ok(subcolHtml.indexOf('South') < subcolHtml.indexOf('North'), 'South (subcol 1) must precede North (subcol 2)');
  assert.ok(subcolHtml.indexOf('North') < subcolHtml.indexOf('Ski resorts'), 'North must precede Ski resorts (same subcolumn)');
  assert.equal(app.FOOTER_REGION_GROUPS.reduce((n, g) => n + g.regions.length, 0), 20);
});

test('Home footer: exactly FOUR columns (Explore, About, Regions, Social Media) all live inside the same .home-footer-cols row, in that DOM order -- Regions is NOT a separate full-width band', () => {
  const html = app.renderHomeFooterHTML();
  const colsMatch = html.match(/<div class="home-footer-cols">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="wrap-wide home-footer-bottom">/);
  assert.ok(colsMatch, 'expected to find the single .home-footer-cols row, immediately followed by the bottom/copyright row (nothing else in between)');
  const colsHtml = colsMatch[1];
  const headings = Array.from(colsHtml.matchAll(/<h4[^>]*>([^<]*)<\/h4>/g)).map((m) => m[1]);
  assert.deepEqual(headings, ['Explore', 'About', 'Regions', 'Social Media'], 'expected exactly these 4 column headings, in this order, all inside one row');
  assert.doesNotMatch(html, /class="home-footer-regions"/, 'the old separate full-width Regions band must be gone');
  // Regions' own region-groups grid must be nested inside the 4th column, not a sibling of .home-footer-cols.
  const regionsColPos = colsHtml.indexOf('home-footer-col-regions');
  const regionGroupsPos = colsHtml.indexOf('home-footer-region-groups');
  assert.ok(regionsColPos !== -1 && regionGroupsPos > regionsColPos, 'expected the region-groups grid nested inside the Regions column');
});

test('Home footer: Social Media heading (renamed from "Follow") uses its own i18n key, distinct from the old footer.followAlong key /browse still uses', () => {
  const html = app.renderHomeFooterHTML();
  assert.match(html, /<h4 data-i18n="homeFooter\.socialMedia">Social Media<\/h4>/);
  assert.doesNotMatch(html, /data-i18n="homeFooter\.follow"/, 'the old "Follow" key must no longer be used');
  assert.doesNotMatch(html, />Follow<\/h4>/, 'the visible heading text must no longer read just "Follow"');
});

test('Home footer: logo tagline reads exactly "Okanagan Valley, British Columbia" and keeps the gold Roam accent', () => {
  const html = app.renderHomeFooterHTML();
  assert.match(html, /<p class="home-footer-tagline" data-i18n="homeFooter\.taglineFull">Okanagan Valley, British Columbia<\/p>/);
  assert.match(html, /<span class="home-footer-wordmark-accent"> Roam<\/span>/);
});

test('Home footer: does not reuse or modify the header\'s shared .logo classes', () => {
  const html = app.renderHomeFooterHTML();
  assert.doesNotMatch(html, /class="logo"/, 'footer must use its own home-footer-logo, not the shared header .logo class');
  assert.doesNotMatch(html, /class="logo-icon-badge"/);
  assert.doesNotMatch(html, /class="logo-wordmark"/);
});

test('Home footer: About and Social Media (renamed from Follow) column links/icons are unchanged from the previously approved design', () => {
  const html = app.renderHomeFooterHTML();
  assert.match(html, /<a href="\/browse#app" data-i18n="nav\.appComingSoon">App coming soon<\/a>/);
  assert.match(html, /<a href="\/browse#list-venue" data-i18n="footer\.listVenue">List your venue<\/a>/);
  assert.match(html, /<a href="mailto:okanaganroam@gmail\.com" data-i18n="footer\.contact">Contact<\/a>/);
  assert.match(html, /icon-instagram" href="https:\/\/www\.instagram\.com\/okanaganroam"/);
  assert.match(html, /icon-tiktok" href="https:\/\/www\.tiktok\.com\/@okanaganroam"/);
  assert.match(html, /icon-facebook" data-tooltip="Coming soon"/);
});

// ==== Phase 2 Sprint 1 (Golf) =============================================
// Golf is added purely as a new `venues.type` value — no schema change, no
// new route code (the existing generic category/venue routes and render
// functions already key off CATEGORY_SLUGS/CATEGORY_LABELS/SCHEMA_TYPE_MAP).
// These tests confirm the taxonomy addition actually reaches every
// downstream consumer of those three constants.

test('golf is present in CATEGORY_SLUGS with the expected slug', () => {
  assert.equal(app.CATEGORY_SLUGS.golf, 'golf');
});

// ==== Website URL normalization (2026-09-19 bug fix) ======================
// A venue's `website` was rendered as-is in an <a href>. A bare domain like
// "shannonlakegolf.com" has no scheme, so the browser resolves it as a
// RELATIVE path against the current page (e.g. it became
// "/west-kelowna/golf/shannonlakegolf.com") instead of an external link.
test('normalizeWebsiteUrl converts a bare domain to an absolute https:// URL', () => {
  assert.equal(app.normalizeWebsiteUrl('shannonlakegolf.com'), 'https://shannonlakegolf.com/');
});

test('normalizeWebsiteUrl converts a "www." domain to an absolute https:// URL', () => {
  assert.equal(app.normalizeWebsiteUrl('www.example.com'), 'https://www.example.com/');
});

test('normalizeWebsiteUrl preserves a path on a bare domain, without adding a trailing slash', () => {
  assert.equal(app.normalizeWebsiteUrl('example.com/book'), 'https://example.com/book');
});

test('normalizeWebsiteUrl preserves a query string on a bare domain', () => {
  assert.equal(app.normalizeWebsiteUrl('example.com/book?x=1'), 'https://example.com/book?x=1');
});

test('normalizeWebsiteUrl leaves an already-fully-qualified https:// URL completely unchanged', () => {
  assert.equal(app.normalizeWebsiteUrl('https://example.com'), 'https://example.com');
});

test('normalizeWebsiteUrl leaves an already-fully-qualified http:// URL unchanged (never upgraded to https)', () => {
  assert.equal(app.normalizeWebsiteUrl('http://example.com'), 'http://example.com');
});

test('normalizeWebsiteUrl passes through a falsy value unchanged', () => {
  assert.equal(app.normalizeWebsiteUrl(null), null);
  assert.equal(app.normalizeWebsiteUrl(undefined), undefined);
  assert.equal(app.normalizeWebsiteUrl(''), '');
});

test('renderCategoryPage renders the golf category with the correct URL and label', () => {
  // Two kelowna golf fixtures exist (an outdoor course and, added
  // 2026-09-19, an indoor simulator) so this also exercises the
  // Golf Courses / Indoor Golf & Simulators split -- see the dedicated
  // split-section tests below for full coverage of that behavior.
  const rows = app.getVenuesByRegionCategory('kelowna', 'golf');
  assert.equal(rows.length, 2);
  const html = app.renderCategoryPage('kelowna', 'golf', rows, []);
  assert.match(html, /Golf Courses in Kelowna, BC/);
  assert.match(html, /Test Golf Course/);
  assert.match(html, /Test Golf Simulator/);
});

test('renderVenuePage renders a golf venue with the correct URL and GolfCourse JSON-LD', () => {
  const venue = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  assert.ok(venue, 'expected to find the fixture golf venue');
  const html = app.renderVenuePage(venue, [], [], []);
  assert.match(html, /<h1>Test Golf Course<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/golf\/test-golf-course"/);
  assert.match(html, /"@type":"GolfCourse"/);
});

test('getRegionCategoryCounts includes golf once a golf venue exists in the region', () => {
  const counts = app.getRegionCategoryCounts('kelowna');
  assert.ok(counts.golf >= 1, 'expected golf to appear in the region category counts');
});

test('renderRegionPage lists the golf category card for a region with a golf venue', () => {
  const counts = app.getRegionCategoryCounts('kelowna');
  const html = app.renderRegionPage('kelowna', counts, []);
  assert.match(html, /href="\/kelowna\/golf"/);
  assert.match(html, /Golf Courses/);
});

test('venueCardHtml links correctly for a golf venue', () => {
  const venue = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const html = app.venueCardHtml(venue);
  assert.match(html, /href="\/kelowna\/golf\/test-golf-course"/);
});

test('REGRESSION: existing venue types are unaffected by the golf taxonomy addition', () => {
  assert.equal(app.CATEGORY_SLUGS.restaurant, 'restaurants');
  assert.equal(app.CATEGORY_SLUGS.winery, 'wineries');
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const html = app.renderVenuePage(venue, [], [], []);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/restaurant/);
  assert.doesNotMatch(html, /GolfCourse/);
});

// ==== Phase 1 (Events architecture gate) =================================

// ---- Schema / data access ----------------------------------------------
test('events table exists with the expected columns', () => {
  const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  for (const expected of [
    'id', 'name', 'slug', 'region', 'description', 'start_datetime',
    'end_datetime', 'recurrence_rule', 'venue_id', 'website', 'image_url',
    'created_at', 'updated_at',
  ]) {
    assert.ok(cols.includes(expected), `events table missing column: ${expected}`);
  }
});

test('venue_id foreign key is enforced against a nonexistent venue', () => {
  const NONEXISTENT_VENUE_ID = 999999;
  assert.throws(() => {
    db.prepare(`
      INSERT INTO events (name, slug, region, start_datetime, venue_id)
      VALUES ('Bad FK Event', 'bad-fk-event', 'kelowna', '2099-01-01 10:00:00', ?)
    `).run(NONEXISTENT_VENUE_ID);
  }, 'expected the foreign key constraint to reject a nonexistent venue_id');
});

test('venue_id is nullable — a standalone event with no venue is valid', () => {
  const event = app.findEventBySlug('kelowna', 'test-past-market');
  assert.equal(event.venue_id, null);
});

test('an event can reference a real venue via venue_id', () => {
  const event = app.findEventBySlug('kelowna', 'test-future-festival');
  assert.equal(event.venue_id, testVenue.id);
});

test('(region, slug) uniqueness allows the same slug in different regions', () => {
  const kelownaEvent = app.findEventBySlug('kelowna', 'test-future-festival');
  const vernonEvent = app.findEventBySlug('vernon', 'test-future-festival');
  assert.ok(kelownaEvent);
  assert.ok(vernonEvent);
  assert.notEqual(kelownaEvent.id, vernonEvent.id);
});

test('(region, slug) uniqueness is actually enforced by the database', () => {
  assert.throws(() => {
    db.prepare(`
      INSERT INTO events (name, slug, region, start_datetime)
      VALUES ('Duplicate', 'test-future-festival', 'kelowna', '2099-01-01 10:00:00')
    `).run();
  }, 'expected a duplicate (region, slug) pair to be rejected');
});

test('recurring events are represented as a single series row, not expanded occurrences', () => {
  const rows = db.prepare("SELECT * FROM events WHERE slug = 'test-weekly-market'").all();
  assert.equal(rows.length, 1, 'a recurring series must be exactly one row in Phase 1');
  assert.equal(rows[0].recurrence_rule, 'weekly on Saturdays');
});

test('findEventBySlug returns null for a nonexistent event', () => {
  assert.equal(app.findEventBySlug('kelowna', 'does-not-exist'), null);
});

test('isEventExpired correctly classifies past vs. future events', () => {
  const future = app.findEventBySlug('kelowna', 'test-future-festival');
  const past = app.findEventBySlug('kelowna', 'test-past-market');
  assert.equal(app.isEventExpired(future), false);
  assert.equal(app.isEventExpired(past), true);
});

// ---- Sitemap inclusion/exclusion ----------------------------------------
test('listEventsForSitemap includes active events and excludes expired ones', () => {
  const sitemapEvents = app.listEventsForSitemap();
  const slugs = sitemapEvents.map((e) => `${e.region}/${e.slug}`);
  assert.ok(slugs.includes('kelowna/test-future-festival'), 'active event must be included');
  assert.ok(slugs.includes('kelowna/test-weekly-market'), 'active recurring event must be included');
  assert.ok(!slugs.includes('kelowna/test-past-market'), 'expired event must be excluded');
});

// ---- What's On Step 2: Okanagan local-date helpers + expiry ----------------
// The process runs with TZ=UTC in production; every assertion below injects
// an explicit UTC instant and expects America/Vancouver civil-date results.
// DST expectations are pinned only for dates every tzdata release agrees on
// (2025-2026 spring/fall transitions); later offsets are cross-checked
// against Intl itself, because tzdata 2026c (bundled with Node 24) and
// 2026a (production Node 22) disagree about BC's clock after 2026-11-01.
test("todayLocal reports the Okanagan calendar date, not the UTC date", () => {
  assert.equal(app.todayLocal(new Date('2026-09-23T06:30:00Z')), '2026-09-22', '11:30 pm PDT on Sep 22 is still Sep 22');
  assert.equal(app.todayLocal(new Date('2026-09-23T07:30:00Z')), '2026-09-23', '12:30 am PDT on Sep 23 is Sep 23');
  assert.equal(app.todayLocal(new Date('2026-09-22T19:00:00Z')), '2026-09-22', 'normal daytime');
  assert.equal(app.todayLocal(new Date('2026-01-15T07:30:00Z')), '2026-01-14', '11:30 pm PST on Jan 14 (UTC already Jan 15)');
  assert.equal(app.todayLocal(new Date('2026-01-15T08:30:00Z')), '2026-01-15', '12:30 am PST on Jan 15');
  assert.equal(app.OKANAGAN_TIME_ZONE, 'America/Vancouver');
});

test('todayLocal across the 2026-03-08 spring-forward transition', () => {
  assert.equal(app.todayLocal(new Date('2026-03-08T07:59:00Z')), '2026-03-07', '11:59 pm PST Mar 7');
  assert.equal(app.todayLocal(new Date('2026-03-08T08:00:00Z')), '2026-03-08', 'midnight PST Mar 8');
  assert.equal(app.todayLocal(new Date('2026-03-08T09:59:00Z')), '2026-03-08', '1:59 am PST, just before the jump');
  assert.equal(app.todayLocal(new Date('2026-03-08T10:00:00Z')), '2026-03-08', '3:00 am PDT, just after the jump');
  assert.equal(app.todayLocal(new Date('2026-03-09T06:59:00Z')), '2026-03-08', '11:59 pm PDT Mar 8 (UTC already Mar 9)');
});

test('parseLocalDate accepts only real YYYY-MM-DD calendar dates', () => {
  assert.equal(app.parseLocalDate('2026-09-22'), '2026-09-22');
  assert.equal(app.parseLocalDate('2028-02-29'), '2028-02-29', 'leap day in a leap year');
  assert.equal(app.parseLocalDate('2027-02-29'), null, 'no leap day in 2027');
  assert.equal(app.parseLocalDate('2026-13-01'), null);
  assert.equal(app.parseLocalDate('2026-09-31'), null);
  assert.equal(app.parseLocalDate('2026-9-2'), null, 'must be zero-padded');
  assert.equal(app.parseLocalDate('2026-09-22T00:00'), null);
  assert.equal(app.parseLocalDate(''), null);
  assert.equal(app.parseLocalDate(undefined), null);
});

test('local-date arithmetic is timezone-free calendar math', () => {
  assert.equal(app.addLocalDays('2026-09-22', 5), '2026-09-27');
  assert.equal(app.addLocalDays('2026-12-31', 1), '2027-01-01');
  assert.equal(app.addLocalDays('2026-03-08', 1), '2026-03-09', 'spring-forward day is still one day long');
  assert.equal(app.addLocalDays('2026-11-01', -1), '2026-10-31');
  assert.equal(app.localDaysBetween('2026-09-22', '2027-09-22'), 365);
  assert.equal(app.localWeekday('2026-09-22'), 2, 'Sep 22 2026 is a Tuesday');
  assert.equal(app.localWeekday('2026-09-27'), 0, 'Sep 27 2026 is a Sunday');
});

test('This Weekend = Friday-Sunday: coming weekend from Mon-Thu, today-through-Sunday from Fri-Sun', () => {
  assert.deepEqual(app.dateWindowForPreset('this-weekend', '2026-09-21'), { from: '2026-09-25', to: '2026-09-27' }, 'Monday');
  assert.deepEqual(app.dateWindowForPreset('this-weekend', '2026-09-22'), { from: '2026-09-25', to: '2026-09-27' }, 'Tuesday');
  assert.deepEqual(app.dateWindowForPreset('this-weekend', '2026-09-24'), { from: '2026-09-25', to: '2026-09-27' }, 'Thursday');
  assert.deepEqual(app.dateWindowForPreset('this-weekend', '2026-09-25'), { from: '2026-09-25', to: '2026-09-27' }, 'Friday');
  assert.deepEqual(app.dateWindowForPreset('this-weekend', '2026-09-26'), { from: '2026-09-26', to: '2026-09-27' }, 'Saturday');
  assert.deepEqual(app.dateWindowForPreset('this-weekend', '2026-09-27'), { from: '2026-09-27', to: '2026-09-27' }, 'Sunday');
});

test('Today, This Week (Mon-Sun) and This Month (local calendar month) windows', () => {
  assert.deepEqual(app.dateWindowForPreset('today', '2026-09-22'), { from: '2026-09-22', to: '2026-09-22' });
  assert.deepEqual(app.dateWindowForPreset('this-week', '2026-09-22'), { from: '2026-09-21', to: '2026-09-27' }, 'Tuesday');
  assert.deepEqual(app.dateWindowForPreset('this-week', '2026-09-21'), { from: '2026-09-21', to: '2026-09-27' }, 'Monday');
  assert.deepEqual(app.dateWindowForPreset('this-week', '2026-09-27'), { from: '2026-09-21', to: '2026-09-27' }, 'Sunday belongs to the week that started the previous Monday');
  assert.deepEqual(app.dateWindowForPreset('this-week', '2027-01-01'), { from: '2026-12-28', to: '2027-01-03' }, 'week spanning a year boundary');
  assert.deepEqual(app.dateWindowForPreset('this-month', '2026-09-22'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(app.dateWindowForPreset('this-month', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' }, 'leap February');
  assert.deepEqual(app.dateWindowForPreset('this-month', '2026-12-31'), { from: '2026-12-01', to: '2026-12-31' });
  assert.equal(app.dateWindowForPreset('custom', '2026-09-22'), null, 'custom has no preset window');
  assert.equal(app.dateWindowForPreset('nope', '2026-09-22'), null);
});

test('customDateWindow validates both bounds, ordering and the 366-day cap without correcting anything', () => {
  assert.deepEqual(app.customDateWindow('2026-10-01', '2026-10-31'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(app.customDateWindow('2026-10-01', '2026-10-01'), { from: '2026-10-01', to: '2026-10-01' }, 'single day');
  assert.deepEqual(app.customDateWindow('2026-10-01', '2027-10-02'), { from: '2026-10-01', to: '2027-10-02' }, 'exactly 366 days');
  assert.equal(app.customDateWindow('2026-10-01', '2027-10-03'), null, '367 days is over the cap');
  assert.equal(app.customDateWindow('2026-10-02', '2026-10-01'), null, 'from after to');
  assert.equal(app.customDateWindow('2027-02-29', '2027-03-01'), null, 'impossible from date');
  assert.equal(app.customDateWindow('2026-10-01', 'next week'), null);
  assert.equal(app.customDateWindow(undefined, '2026-10-01'), null);
  assert.deepEqual(app.customDateWindow('2026-01-01', '2026-01-31'), { from: '2026-01-01', to: '2026-01-31' }, 'past ranges are allowed');
});

test('localRangesOverlap is the single inclusive window predicate', () => {
  const w = ['2026-09-25', '2026-09-27']; // a Fri-Sun weekend
  assert.equal(app.localRangesOverlap('2026-09-26', '2026-09-26', ...w), true, 'one-day inside');
  assert.equal(app.localRangesOverlap('2026-09-20', '2026-10-05', ...w), true, 'multi-day spanning the window');
  assert.equal(app.localRangesOverlap('2026-09-27', '2026-09-27', ...w), true, 'ends on the last day');
  assert.equal(app.localRangesOverlap('2026-09-23', '2026-09-25', ...w), true, 'starts before, ends on the first day');
  assert.equal(app.localRangesOverlap('2026-09-28', '2026-09-28', ...w), false, 'the Monday after');
  assert.equal(app.localRangesOverlap('2026-09-24', '2026-09-24', ...w), false, 'the Thursday before');
});

test('vancouverOffsetFor / toVancouverIso derive the offset from Intl for the local wall-clock time', () => {
  // Pinned transitions every tzdata release agrees on.
  assert.equal(app.vancouverOffsetFor('2026-01-15', '12:00'), '-08:00', 'PST in January 2026');
  assert.equal(app.vancouverOffsetFor('2026-03-08', '01:59'), '-08:00', 'just before spring-forward');
  assert.equal(app.vancouverOffsetFor('2026-03-08', '03:00'), '-07:00', 'just after spring-forward');
  assert.equal(app.vancouverOffsetFor('2026-07-01', '19:00'), '-07:00', 'PDT in summer');
  assert.equal(app.vancouverOffsetFor('2026-10-30', '19:05'), '-07:00', 'late October is still PDT');
  assert.equal(app.vancouverOffsetFor('2025-11-03', '12:00'), '-08:00', 'PST after the November 2025 fall-back');
  // Later dates: whatever the platform tzdata says, the helper must agree
  // with Intl's own rendering of the resulting instant (round trip).
  for (const [d, t] of [['2026-11-02', '19:05'], ['2026-12-31', '23:30'], ['2027-03-14', '03:00'], ['2027-07-01', '10:00']]) {
    const off = app.vancouverOffsetFor(d, t);
    assert.match(off, /^-0[78]:00$/, `${d} ${t} must be PST or PDT`);
    const iso = app.toVancouverIso(d, t);
    assert.equal(iso, `${d}T${t}:00${off}`);
    const back = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(', ', 'T').replace(/T24:/, 'T00:');
    assert.equal(back, `${d}T${t}`, `round trip through Intl must land on the same Okanagan wall-clock time (${iso})`);
  }
  assert.equal(app.toVancouverIso('2026-12-31'), '2026-12-31', 'date-only stays a bare date (all-day / time unknown)');
  assert.equal(app.toVancouverIso('2026-12-31', ''), '2026-12-31');
  assert.equal(app.toVancouverIso('2026-12-31', '25:00'), null, 'invalid time');
  assert.equal(app.toVancouverIso('2026-02-30', '10:00'), null, 'invalid date');
  assert.equal(app.vancouverOffsetFor('not-a-date'), null);
});

test('eventLocalEndDate reads the local calendar date from either stored format', () => {
  assert.equal(app.eventLocalEndDate({ start_datetime: '2026-10-30T19:05:00-07:00', end_datetime: '2026-10-30T21:30:00-07:00' }), '2026-10-30');
  assert.equal(app.eventLocalEndDate({ start_datetime: '2026-10-30T19:05:00-07:00', end_datetime: null }), '2026-10-30', 'no end -> start');
  assert.equal(app.eventLocalEndDate({ start_datetime: '2099-06-01 10:00:00', end_datetime: '2099-06-01 18:00:00' }), '2099-06-01', 'legacy fixture format');
  assert.equal(app.eventLocalEndDate({ start_datetime: '2026-12-31' }), '2026-12-31', 'bare date');
  assert.equal(app.eventLocalEndDate({ start_datetime: 'soon' }), null);
  assert.equal(app.eventLocalEndDate({}), null);
});

test('isEventExpired uses the Okanagan local day, so an event stays live through 23:59 Pacific on its last day', () => {
  const ninePmPdtSep22 = new Date('2026-09-23T04:00:00Z');
  const elevenThirtyPmPdtSep22 = new Date('2026-09-23T06:30:00Z');
  const twelveThirtyAmPdtSep23 = new Date('2026-09-23T07:30:00Z');
  const endsSep22 = { start_datetime: '2026-09-22T19:00:00-07:00', end_datetime: '2026-09-22T20:00:00-07:00' };
  assert.equal(app.isEventExpired(endsSep22, ninePmPdtSep22), false, 'ended at 8 pm but the local day is not over');
  assert.equal(app.isEventExpired(endsSep22, elevenThirtyPmPdtSep22), false, '11:30 pm local, still Sep 22 (UTC is already Sep 23)');
  assert.equal(app.isEventExpired(endsSep22, twelveThirtyAmPdtSep23), true, '12:30 am local on Sep 23 -> expired');
  const lateShow = { start_datetime: '2026-09-22T23:30:00-07:00', end_datetime: null };
  assert.equal(app.isEventExpired(lateShow, elevenThirtyPmPdtSep22), false, 'an 11:30 pm event on the day it happens');
  assert.equal(app.isEventExpired(lateShow, twelveThirtyAmPdtSep23), true);
  const earlyShow = { start_datetime: '2026-09-23T00:30:00-07:00', end_datetime: null };
  assert.equal(app.isEventExpired(earlyShow, elevenThirtyPmPdtSep22), false, 'a 12:30 am Sep 23 event is in the future at 11:30 pm Sep 22');
  assert.equal(app.isEventExpired(earlyShow, twelveThirtyAmPdtSep23), false, 'and still live during Sep 23');
  assert.equal(app.isEventExpired(earlyShow, new Date('2026-09-24T07:30:00Z')), true, 'expired on Sep 24');
  const crossesMidnight = { start_datetime: '2026-09-22T21:00:00-07:00', end_datetime: '2026-09-23T01:00:00-07:00' };
  assert.equal(app.isEventExpired(crossesMidnight, new Date('2026-09-23T10:00:00Z')), false, 'ends 1 am Sep 23 -> live through Sep 23');
  assert.equal(app.isEventExpired(crossesMidnight, new Date('2026-09-24T10:00:00Z')), true);
  assert.equal(app.isEventExpired({ start_datetime: '2099-06-01 10:00:00' }, new Date()), false, 'legacy future fixture');
  assert.equal(app.isEventExpired({ start_datetime: '2000-01-01 10:00:00' }, new Date()), true, 'legacy past fixture');
  assert.equal(app.isEventExpired({ start_datetime: 'soon' }, new Date()), false, 'malformed is never silently hidden');
  // 2026-11-02T07:30Z is 00:30 Nov 2 if BC stays on UTC-7 (tzdata 2026c) but
  // 23:30 Nov 1 if it falls back to UTC-8 (tzdata 2026a) -- deliberately not
  // asserted; only instants both rules agree on are pinned here.
  const nov1 = { start_datetime: '2026-11-01T20:00:00-07:00', end_datetime: null };
  assert.equal(app.isEventExpired(nov1, new Date('2026-11-02T06:30:00Z')), false, '22:30/23:30 on Nov 1 under either tzdata rule -> not expired');
  assert.equal(app.isEventExpired(nov1, new Date('2026-11-02T08:30:00Z')), true, 'clearly Nov 2 local under either rule -> expired');
});

test('listEventsForSitemap decides "active" on the Okanagan local date, not UTC; GET /events redirects to /whats-on', async () => {
  // Insert an event that ends TODAY (Okanagan) at 11:00 pm local. Under the
  // old UTC comparison this row would already look expired for most of the
  // evening; under the local-date rule it must be listed all day.
  const today = app.todayLocal();
  const end = app.toVancouverIso(today, '23:00');
  const start = app.toVancouverIso(today, '19:00');
  const info = db.prepare(`INSERT INTO events (name, slug, region, start_datetime, end_datetime) VALUES ('Step2 Today Event', 'step2-today-event', 'kelowna', ?, ?)`).run(start, end);
  // Step 5: the sitemap also requires a scheduled occurrence, so give the row the one its span describes.
  db.prepare('INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(info.lastInsertRowid, today, today, '19:00', '23:00');
  try {
    const slugs = app.listEventsForSitemap().map((e) => `${e.region}/${e.slug}`);
    assert.ok(slugs.includes('kelowna/step2-today-event'), 'ends today local -> still in the sitemap list');
    assert.ok(!slugs.includes('kelowna/test-past-market'), 'expired fixture stays excluded');
    assert.ok(slugs.includes('kelowna/test-future-festival'));
    const yesterdayList = app.listEventsForSitemap(new Date(Date.parse(`${app.addLocalDays(today, 1)}T12:00:00Z`)));
    assert.ok(!yesterdayList.some((e) => e.slug === 'step2-today-event'), 'evaluated tomorrow it is expired');
    // Drive the exported http.Server on an ephemeral port so this test never
    // competes with the single startServer() bind the HTTP routes test owns.
    const html = await new Promise((resolve, reject) => {
      const tmp = require('node:http').createServer((req, res) => app.server.emit('request', req, res));
      tmp.listen(0, '127.0.0.1', async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${tmp.address().port}/events`, { redirect: 'manual' });
          assert.equal(res.status, 301, 'GET /events permanently redirects to the What\'s On page');
          assert.equal(res.headers.get('location'), '/whats-on');
          resolve(await res.text());
        } catch (err) { reject(err); } finally { tmp.close(); }
      });
    });
    assert.equal(html, '', 'the redirect carries no body');
  } finally {
    db.prepare("DELETE FROM event_occurrences WHERE event_id IN (SELECT id FROM events WHERE slug = 'step2-today-event')").run();
    db.prepare("DELETE FROM events WHERE slug = 'step2-today-event'").run();
  }
});

// ---- What's On Step 3: event data layer, validation, guarded writers ---------
// All writes below go to this throwaway fixture DB (never production). Every
// event created here is removed again by the last test in this block so the
// sitemap/route tests further down see exactly the Phase 1 fixture events.
const s3meta = { reason: 'step 3 fixture', batch_id: 'test-step3' };
const s3venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
const s3vernonVenue = db.prepare("SELECT id FROM venues WHERE slug = 'test-vernon-golf-course'").get();
const s3redirected = db.prepare("SELECT id FROM venues WHERE slug = 'ds4-redirected-gem'").get();
const s3base = () => ({
  name: 'S3 Harvest Dinner', region: 'kelowna', description: 'A fixture event.',
  source_type: 'official_venue', source_name: 'Test Trattoria', source_url: 'https://example.com/harvest',
  venue_id: s3venue.id, categories: ['food-drink-events'],
  occurrences: [{ start_date: '2030-10-03', start_time: '18:30', end_time: '21:00' }],
});
const s3ids = [];
function s3create(overrides = {}, meta = s3meta) {
  // Each fixture gets its own source page unless a test deliberately reuses
  // one (the same-source-and-date duplicate rule is tested explicitly).
  const data = { ...s3base(), ...overrides };
  if (overrides.source_url === undefined && overrides.name) data.source_url = `https://example.com/${app.slugify(overrides.name)}`;
  const r = app.createEvent(data, meta);
  if (r.ok) s3ids.push(r.event.id);
  return r;
}

test('S3 #1: a valid event is created with categories, one occurrence, a derived span and audit rows', () => {
  const r = s3create();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.event.slug, 's3-harvest-dinner');
  assert.equal(r.event.status, 'scheduled');
  assert.equal(r.event.event_confidence, 'medium');
  assert.equal(r.event.venue_id, s3venue.id);
  assert.deepEqual(r.categories, ['food-drink-events']);
  assert.equal(r.occurrences.length, 1);
  assert.equal(r.event.start_datetime, '2030-10-03T18:30:00-07:00', 'derived ISO span carries the Vancouver offset');
  assert.equal(r.event.end_datetime, '2030-10-03T21:00:00-07:00');
  assert.equal(r.review.length, 0);
  const log = db.prepare('SELECT field_name, new_value, batch_id, source_ref, source FROM event_enrichment_log WHERE event_id = ? ORDER BY id').all(r.event.id);
  assert.deepEqual(log.map((l) => l.field_name), ['create', 'categories', 'occurrence']);
  assert.equal(log[0].new_value, 'kelowna/s3-harvest-dinner');
  assert.equal(log[0].batch_id, 'test-step3');
  assert.equal(log[0].source_ref, 'step 3 fixture');
  assert.equal(log[0].source, 'Test Trattoria');
});

test('S3 #2: a multi-occurrence series spans first->last date and orders its occurrences', () => {
  const r = s3create({
    name: 'S3 Jazz Jam', venue_id: null, venue_name_text: 'RCA Atrium', recurrence_rule: 'Thursdays until Dec 17',
    categories: ['live-music', 'nightlife'],
    occurrences: [
      { start_date: '2030-10-10', start_time: '19:00' }, { start_date: '2030-10-03', start_time: '19:00' }, { start_date: '2030-10-17', start_time: '19:00', source_ref: 'wk3' },
    ],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.occurrences.map((o) => o.start_date), ['2030-10-03', '2030-10-10', '2030-10-17']);
  assert.equal(r.event.start_datetime, '2030-10-03T19:00:00-07:00');
  assert.equal(r.event.end_datetime, '2030-10-17', 'no end_time -> the last local date, bare');
  assert.equal(app.countScheduledOccurrences(r.event.id), 3);
});

test('S3 #3: up to three categories are accepted in order; #4 four rejected; #5 duplicate rejected', () => {
  const ok = s3create({ name: 'S3 Wine Concert', categories: ['live-music', 'wineries-wine-events', 'food-drink-events'] });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.categories, ['live-music', 'wineries-wine-events', 'food-drink-events']);
  assert.deepEqual(db.prepare('SELECT category_key, position FROM event_categories WHERE event_id = ? ORDER BY position').all(ok.event.id).map((r) => `${r.position}:${r.category_key}`), ['0:live-music', '1:wineries-wine-events', '2:food-drink-events']);
  const four = s3create({ name: 'S3 Four Cats', categories: ['live-music', 'nightlife', 'family-kids', 'arts-culture'] });
  assert.deepEqual([four.ok, four.reason], [false, 'too_many_categories']);
  const dup = s3create({ name: 'S3 Dup Cats', categories: ['live-music', 'live-music'] });
  assert.deepEqual([dup.ok, dup.reason], [false, 'duplicate_category']);
  const unknown = s3create({ name: 'S3 Unknown Cat', categories: ['jazz'] });
  assert.deepEqual([unknown.ok, unknown.reason], [false, 'unknown_category']);
  const none = s3create({ name: 'S3 No Cats', categories: [] });
  assert.deepEqual([none.ok, none.reason], [false, 'categories_required']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE name LIKE 'S3 Four%' OR name LIKE 'S3 Dup%' OR name LIKE 'S3 Unknown%' OR name LIKE 'S3 No Cats'").get().n, 0, 'rejected writes leave nothing behind');
});

test('S3 #6: invalid, Shuswap and empty regions are rejected; region is immutable on update', () => {
  for (const region of ['shuswap', 'SHUSWAP (not in region model)', 'salmon-arm', '', undefined, 'Kelowna']) {
    const r = s3create({ name: 'S3 Bad Region', region, venue_id: null, venue_name_text: 'Somewhere' });
    assert.deepEqual([r.ok, r.reason], [false, 'region_invalid'], `region ${JSON.stringify(region)}`);
  }
  const ev = s3create({ name: 'S3 Region Lock', venue_id: null, venue_name_text: 'City Park' });
  assert.equal(ev.ok, true);
  const upd = app.updateEvent(ev.event.id, { region: 'vernon' }, s3meta);
  assert.deepEqual([upd.ok, upd.reason], [false, 'region_immutable']);
  const upd2 = app.updateEvent(ev.event.id, { slug: 'other' }, s3meta);
  assert.deepEqual([upd2.ok, upd2.reason], [false, 'slug_immutable']);
});

test('S3 #7: missing, redirected and malformed venue ids are rejected; #8 venue/region mismatch rejected unless valley-wide', () => {
  const missing = s3create({ name: 'S3 Missing Venue', venue_id: 999999 });
  assert.deepEqual([missing.ok, missing.reason], [false, 'venue_not_found']);
  const redirected = s3create({ name: 'S3 Redirected Venue', venue_id: s3redirected.id });
  assert.deepEqual([redirected.ok, redirected.reason], [false, 'venue_redirected']);
  const bad = s3create({ name: 'S3 Bad Venue Id', venue_id: '12' });
  assert.deepEqual([bad.ok, bad.reason], [false, 'venue_id_invalid']);
  const mismatch = s3create({ name: 'S3 Mismatch', venue_id: s3vernonVenue.id });
  assert.deepEqual([mismatch.ok, mismatch.reason], [false, 'venue_region_mismatch']);
  const both = s3create({ name: 'S3 Both Venues', venue_id: s3venue.id, venue_name_text: 'Also a text venue' });
  assert.deepEqual([both.ok, both.reason], [false, 'venue_ambiguous']);
  const neither = s3create({ name: 'S3 No Venue', venue_id: null });
  assert.deepEqual([neither.ok, neither.reason], [false, 'venue_required']);
  const valleyWide = s3create({ name: 'S3 Valley Wide', venue_id: null, valley_wide: 1, categories: ['wineries-wine-events', 'events-festivals'] });
  assert.equal(valleyWide.ok, true, 'a valley-wide event may have no single venue');
  const valleyMismatch = s3create({ name: 'S3 Okanagan Trail Series', venue_id: s3vernonVenue.id, valley_wide: 1 });
  assert.equal(valleyMismatch.ok, true, 'valley-wide relaxes the region match, never the existence/redirect checks');
});

test('S3 #9: a scheduled event without a scheduled occurrence is rejected; date_tbc is not supported', () => {
  const none = s3create({ name: 'S3 No Dates', occurrences: [] });
  assert.deepEqual([none.ok, none.reason], [false, 'no_scheduled_occurrence']);
  const allCancelled = s3create({ name: 'S3 All Cancelled', occurrences: [{ start_date: '2030-10-03', status: 'cancelled' }] });
  assert.deepEqual([allCancelled.ok, allCancelled.reason], [false, 'no_scheduled_occurrence']);
  const tbc = s3create({ name: 'S3 TBC', status: 'date_tbc', occurrences: [] });
  assert.deepEqual([tbc.ok, tbc.reason], [false, 'status_invalid']);
  const missingOcc = app.createEvent({ ...s3base(), name: 'S3 Missing Occ', occurrences: undefined }, s3meta);
  assert.deepEqual([missingOcc.ok, missingOcc.reason], [false, 'occurrences_required']);
});

test('S3 #10: invalid occurrence dates/times are rejected exactly, never repaired', () => {
  const cases = [
    [{ start_date: '2030-02-30' }, 'occurrence_start_date_invalid'],
    [{ start_date: '2030-10-03', end_date: '2030-10-02' }, 'occurrence_end_before_start'],
    [{ start_date: '2030-10-03', end_date: 'soon' }, 'occurrence_end_date_invalid'],
    [{ start_date: '2030-10-03', start_time: '7pm' }, 'occurrence_start_time_invalid'],
    [{ start_date: '2030-10-03', start_time: '25:00' }, 'occurrence_start_time_invalid'],
    [{ start_date: '2030-10-03', start_time: '21:00', end_time: '01:00' }, 'occurrence_end_time_before_start'],
    [{ start_date: '2030-10-03', end_time: '21:00' }, 'occurrence_end_time_without_start'],
    [{ start_date: '2030-10-03', all_day: 1, start_time: '10:00' }, 'occurrence_all_day_with_times'],
    [{ start_date: '2030-10-03', end_date: '2030-10-05', ends_next_day: 1 }, 'occurrence_ends_next_day_on_multi_day'],
    [{ start_date: '2030-10-03', status: 'maybe' }, 'occurrence_status_invalid'],
    [{ start_date: '2030-10-03', venue: 'x' }, 'occurrence_unexpected_field'],
    ['2030-10-03', 'occurrence_invalid'],
  ];
  for (const [occ, reason] of cases) {
    const r = s3create({ name: 'S3 Bad Occ', occurrences: [occ] });
    assert.deepEqual([r.ok, r.reason], [false, reason], JSON.stringify(occ));
  }
  const crossesMidnight = s3create({ name: 'S3 Late Show', occurrences: [{ start_date: '2030-10-03', start_time: '21:00', end_time: '01:00', ends_next_day: 1 }] });
  assert.equal(crossesMidnight.ok, true, 'ends_next_day = 1 makes an end before the start legal');
  assert.equal(crossesMidnight.event.end_datetime, '2030-10-04T01:00:00-07:00', 'the derived span ends on the next local day');
  const allDay = s3create({ name: 'S3 All Day', occurrences: [{ start_date: '2030-10-03', end_date: '2030-10-05', all_day: 1 }] });
  assert.equal(allDay.ok, true);
  assert.equal(allDay.event.start_datetime, '2030-10-03');
  assert.equal(allDay.event.end_datetime, '2030-10-05');
});

test('S3 #11: date-window overlap on materialised occurrences (end_date >= from AND start_date <= to)', () => {
  const q = (from, to) => app.queryWhatsOnEvents({ from, to }).map((e) => e.name);
  assert.ok(q('2030-10-03', '2030-10-03').includes('S3 Harvest Dinner'), 'one-day event on its day');
  assert.ok(!q('2030-10-04', '2030-10-04').includes('S3 Harvest Dinner'), 'not the day after');
  assert.ok(q('2030-10-04', '2030-10-04').includes('S3 All Day'), 'multi-day event on a middle day');
  assert.ok(q('2030-10-05', '2030-10-09').includes('S3 All Day'), 'window starting on its last day');
  assert.ok(!q('2030-10-06', '2030-10-09').includes('S3 All Day'), 'window after it ends');
  assert.ok(q('2030-10-04', '2030-10-04').includes('S3 Jazz Jam') === false && q('2030-10-10', '2030-10-10').includes('S3 Jazz Jam'), 'series matches only on its occurrence dates');
  assert.ok(!q('2030-10-04', '2030-10-04').includes('S3 Late Show'), 'a show ending at 1 am is listed on its start day only');
  assert.deepEqual(app.queryWhatsOnEvents({ from: '2030-10-05', to: '2030-10-01' }), [], 'inverted window -> nothing');
  assert.deepEqual(app.queryWhatsOnEvents({ from: 'x', to: '2030-10-01' }), [], 'invalid window -> nothing');
});

test('S3 #12/#13: region filtering, multi-region OR, valley-wide matches any region', () => {
  const vernon = s3create({ name: 'S3 Vernon Night', region: 'vernon', venue_id: s3vernonVenue.id, categories: ['nightlife'], occurrences: [{ start_date: '2030-10-03', start_time: '20:00' }] });
  assert.equal(vernon.ok, true, JSON.stringify(vernon));
  const names = (regions) => app.queryWhatsOnEvents({ from: '2030-10-03', to: '2030-10-03', regions }).map((e) => e.name);
  assert.ok(names(['kelowna']).includes('S3 Harvest Dinner') && !names(['kelowna']).includes('S3 Vernon Night'));
  assert.ok(names(['vernon']).includes('S3 Vernon Night') && !names(['vernon']).includes('S3 Harvest Dinner'));
  assert.ok(names(['kelowna', 'vernon']).includes('S3 Vernon Night') && names(['kelowna', 'vernon']).includes('S3 Harvest Dinner'), 'multi-region is OR');
  assert.ok(names(['osoyoos']).includes('S3 Valley Wide'), 'valley-wide appears for a region it is not filed under');
  assert.ok(!names(['osoyoos']).includes('S3 Harvest Dinner'));
  assert.deepEqual(names(['shuswap']), names([]), 'unknown regions are ignored, not matched');
});

test('S3 #14/#15/#16: category filtering, multi-category OR, and combined date + region + category', () => {
  const names = (opts) => app.queryWhatsOnEvents({ from: '2030-10-01', to: '2030-10-31', ...opts }).map((e) => e.name);
  assert.ok(names({ categories: ['nightlife'] }).includes('S3 Jazz Jam'));
  assert.ok(names({ categories: ['nightlife'] }).includes('S3 Vernon Night'));
  assert.ok(!names({ categories: ['nightlife'] }).includes('S3 Harvest Dinner'));
  assert.ok(names({ categories: ['food-drink-events', 'nightlife'] }).includes('S3 Harvest Dinner') && names({ categories: ['food-drink-events', 'nightlife'] }).includes('S3 Jazz Jam'), 'multi-category is OR');
  const combined = names({ from: '2030-10-03', to: '2030-10-03', regions: ['vernon'], categories: ['nightlife'] });
  assert.deepEqual(combined, ['S3 Vernon Night'], 'date AND region AND category');
  assert.deepEqual(names({ from: '2030-10-10', to: '2030-10-10', regions: ['vernon'], categories: ['nightlife'] }), [], 'same region/category, a date with nothing');
  const counts = app.whatsOnCountsFor(app.queryWhatsOnEvents({ from: '2030-10-03', to: '2030-10-03' }));
  assert.equal(counts.regions.vernon, 1 + 2, 'one Vernon event plus the two valley-wide rows');
  assert.equal(counts.regions.osoyoos, 2, 'valley-wide rows count for every region');
  assert.equal(counts.categories['nightlife'] >= 2, true);
});

test('S3 #17: a cancelled occurrence drops out of the window while its series stays live', () => {
  const jam = db.prepare("SELECT id FROM events WHERE slug = 's3-jazz-jam'").get();
  const occ = db.prepare("SELECT id FROM event_occurrences WHERE event_id = ? AND start_date = '2030-10-10'").get(jam.id);
  const r = app.setEventOccurrenceStatus(jam.id, occ.id, 'cancelled', s3meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(!app.queryWhatsOnEvents({ from: '2030-10-10', to: '2030-10-10' }).some((e) => e.slug === 's3-jazz-jam'));
  assert.ok(app.queryWhatsOnEvents({ from: '2030-10-17', to: '2030-10-17' }).some((e) => e.slug === 's3-jazz-jam'), 'other dates unaffected');
  assert.equal(app.countScheduledOccurrences(jam.id), 2);
  const log = db.prepare("SELECT old_value, new_value, occurrence_id FROM event_enrichment_log WHERE event_id = ? AND field_name = 'occurrence_status'").get(jam.id);
  assert.deepEqual([log.old_value, log.new_value, log.occurrence_id], ['scheduled', 'cancelled', occ.id]);
  const again = app.setEventOccurrenceStatus(jam.id, occ.id, 'cancelled', s3meta);
  assert.deepEqual([again.ok, again.changed], [true, false], 'idempotent');
});

test('S3 #18: a cancelled event is excluded from the window even though its occurrences remain', () => {
  const ev = db.prepare("SELECT id FROM events WHERE slug = 's3-all-day'").get();
  const r = app.updateEvent(ev.id, { status: 'cancelled' }, s3meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.changed, ['status']);
  assert.ok(!app.queryWhatsOnEvents({ from: '2030-10-03', to: '2030-10-05' }).some((e) => e.slug === 's3-all-day'));
  assert.equal(app.listEventOccurrences(ev.id).length, 1, 'occurrence row kept for history');
  const back = app.updateEvent(ev.id, { status: 'scheduled' }, s3meta);
  assert.equal(back.ok, true, 'can be re-published because a scheduled occurrence still exists');
  const post = app.updateEvent(ev.id, { status: 'postponed' }, s3meta);
  assert.equal(post.ok, true);
  assert.ok(!app.queryWhatsOnEvents({ from: '2030-10-03', to: '2030-10-05' }).some((e) => e.slug === 's3-all-day'), 'postponed is excluded too');
});

test('S3 #19: the last scheduled occurrence cannot be cancelled while the event stays published', () => {
  const ev = db.prepare("SELECT id FROM events WHERE slug = 's3-harvest-dinner'").get();
  const occ = db.prepare('SELECT id FROM event_occurrences WHERE event_id = ?').get(ev.id);
  const refused = app.setEventOccurrenceStatus(ev.id, occ.id, 'cancelled', s3meta);
  assert.deepEqual([refused.ok, refused.reason], [false, 'last_occurrence']);
  assert.equal(app.getEventById(ev.id).status, 'scheduled');
  assert.equal(db.prepare('SELECT status FROM event_occurrences WHERE id = ?').get(occ.id).status, 'scheduled', 'nothing changed');
  const badStatus = app.setEventOccurrenceStatus(ev.id, occ.id, 'cancelled', { ...s3meta, event_status: 'scheduled' });
  assert.deepEqual([badStatus.ok, badStatus.reason], [false, 'event_status_invalid']);
  const withEvent = app.setEventOccurrenceStatus(ev.id, occ.id, 'postponed', { ...s3meta, event_status: 'postponed' });
  assert.equal(withEvent.ok, true, JSON.stringify(withEvent));
  assert.equal(withEvent.event.status, 'postponed');
  assert.equal(withEvent.occurrence.status, 'postponed');
  const republish = app.updateEvent(ev.id, { status: 'scheduled' }, s3meta);
  assert.deepEqual([republish.ok, republish.reason], [false, 'no_scheduled_occurrence'], 'cannot re-publish with zero scheduled occurrences');
  const restore = app.setEventOccurrenceStatus(ev.id, occ.id, 'scheduled', s3meta);
  assert.equal(restore.ok, true);
  assert.equal(app.updateEvent(ev.id, { status: 'scheduled' }, s3meta).ok, true);
});

test('S3 #20: duplicate protection -- exact slug/identity, same source+date, fuzzy review gate, occurrence keys, source refs', () => {
  const exact = s3create();
  assert.deepEqual([exact.ok, exact.reason], [false, 'duplicate_event']);
  assert.equal(exact.detail[0].rule, 'exact_slug');
  const explicitSlug = s3create({ name: 'S3 Something Else', slug: 's3-harvest-dinner' });
  assert.deepEqual([explicitSlug.ok, explicitSlug.reason], [false, 'duplicate_event']);
  const sameSource = s3create({ name: 'S3 Autumn Feast Dinner', source_url: 'https://example.com/harvest' });
  assert.deepEqual([sameSource.ok, sameSource.reason], [false, 'duplicate_event']);
  assert.equal(sameSource.detail[0].rule, 'same_source_and_date');
  const fuzzy = s3create({ name: 'S3 Harvest Dinner Night', source_url: 'https://example.com/other' });
  assert.deepEqual([fuzzy.ok, fuzzy.reason], [false, 'possible_duplicate'], 'two shared significant words on the same day -> review, not written');
  const harvestId = db.prepare("SELECT id FROM events WHERE slug = 's3-harvest-dinner'").get().id;
  assert.equal(fuzzy.detail[0].event_id, harvestId);
  const reviewed = s3create({ name: 'S3 Harvest Dinner Night', source_url: 'https://example.com/other' }, { ...s3meta, reviewed_duplicates: [harvestId] });
  assert.equal(reviewed.ok, true, 'explicitly reviewed -> written as a separate event (never merged)');
  assert.equal(reviewed.review[0].event_id, harvestId, 'the review hit is still reported');
  assert.equal(reviewed.event.slug, 's3-harvest-dinner-night');
  const otherDay = s3create({ name: 'S3 Harvest Dinner Night', source_url: 'https://example.com/other2', occurrences: [{ start_date: '2030-11-20' }] });
  assert.deepEqual([otherDay.ok, otherDay.reason, otherDay.event && otherDay.event.slug], [true, undefined, 's3-harvest-dinner-night-2030-11-20'], 'base-slug collision on a different date takes the dated suffix');
  const dupOcc = s3create({ name: 'S3 Dup Occ', occurrences: [{ start_date: '2030-10-03', start_time: '19:00' }, { start_date: '2030-10-03', start_time: '19:00' }] });
  assert.deepEqual([dupOcc.ok, dupOcc.reason], [false, 'duplicate_occurrence']);
  const dupRef = s3create({ name: 'S3 Dup Ref', occurrences: [{ start_date: '2030-10-03', source_ref: 'g1' }, { start_date: '2030-10-04', source_ref: 'g1' }] });
  assert.deepEqual([dupRef.ok, dupRef.reason], [false, 'duplicate_occurrence_source_ref']);
  const jam = db.prepare("SELECT id FROM events WHERE slug = 's3-jazz-jam'").get();
  const up = app.upsertEventOccurrences(jam.id, [{ start_date: '2030-10-17', start_time: '19:00' }, { start_date: '2030-10-24', start_time: '19:00' }], s3meta);
  assert.deepEqual([up.ok, up.inserted.length, up.skipped], [true, 1, 1], 'existing (date,time) key skipped, new date appended');
  const upRef = app.upsertEventOccurrences(jam.id, [{ start_date: '2030-10-31', start_time: '19:00', source_ref: 'wk3' }], s3meta);
  assert.deepEqual([upRef.ok, upRef.reason], [false, 'duplicate_occurrence_source_ref']);
  const unexpected = app.createEvent({ ...s3base(), name: 'S3 Extra Field', start_datetime: '2030-01-01' }, s3meta);
  assert.deepEqual([unexpected.ok, unexpected.reason], [false, 'unexpected_field'], 'derived columns can never be supplied');
});

test('S3 #21: window resolution -- presets, custom ranges, the 366-day cap, and the default fallback', () => {
  const now = new Date('2026-09-23T04:00:00Z'); // Tue Sep 22 2026, 9 pm PDT
  assert.deepEqual(app.resolveWhatsOnWindow({ when: 'today' }, now), { from: '2026-09-22', to: '2026-09-22', preset: 'today', fallback: false });
  assert.deepEqual(app.resolveWhatsOnWindow({ when: 'this-weekend' }, now), { from: '2026-09-25', to: '2026-09-27', preset: 'this-weekend', fallback: false });
  assert.deepEqual(app.resolveWhatsOnWindow({ when: 'this-week' }, now), { from: '2026-09-21', to: '2026-09-27', preset: 'this-week', fallback: false });
  assert.deepEqual(app.resolveWhatsOnWindow({ when: 'this-month' }, now), { from: '2026-09-01', to: '2026-09-30', preset: 'this-month', fallback: false });
  assert.deepEqual(app.resolveWhatsOnWindow({ from: '2027-01-01', to: '2027-01-31' }, now), { from: '2027-01-01', to: '2027-01-31', preset: 'custom', fallback: false });
  assert.deepEqual(app.resolveWhatsOnWindow({ when: 'custom', from: '2026-10-01', to: '2027-10-02' }, now).preset, 'custom', '366 days allowed');
  const tooLong = app.resolveWhatsOnWindow({ when: 'custom', from: '2026-10-01', to: '2027-10-03' }, now);
  assert.deepEqual([tooLong.preset, tooLong.fallback, tooLong.from, tooLong.to], ['upcoming', true, '2026-09-22', '2026-10-22'], '>366 days -> rejected, default window with fallback flag');
  assert.deepEqual(app.resolveWhatsOnWindow({}, now), { from: '2026-09-22', to: '2026-10-22', preset: 'upcoming', fallback: false });
  assert.equal(app.resolveWhatsOnWindow({ when: 'someday' }, now).fallback, true);
  assert.equal(app.WHATSON_DEFAULT_WINDOW_DAYS, 30);
});

test('S3 #22: every write is logged; updates record old/new; result rows carry the card fields', () => {
  const ev = db.prepare("SELECT id FROM events WHERE slug = 's3-harvest-dinner'").get();
  const before = db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log WHERE event_id = ?').get(ev.id).n;
  const upd = app.updateEvent(ev.id, { description: 'Updated description', website: 'https://example.com/tickets', event_confidence: 'high' }, { ...s3meta, reviewed_by: 'owner' });
  assert.equal(upd.ok, true, JSON.stringify(upd));
  assert.deepEqual(upd.changed.sort(), ['description', 'event_confidence', 'website']);
  const rows = db.prepare('SELECT field_name, old_value, new_value, reviewed_by, confidence FROM event_enrichment_log WHERE event_id = ? ORDER BY id').all(ev.id).slice(before);
  assert.equal(rows.length, 3);
  assert.deepEqual({ ...rows.find((r) => r.field_name === 'description') }, { field_name: 'description', old_value: 'A fixture event.', new_value: 'Updated description', reviewed_by: 'owner', confidence: 'high' });
  const noop = app.updateEvent(ev.id, { description: 'Updated description' }, s3meta);
  assert.deepEqual([noop.ok, noop.changed], [true, []], 'no change -> no log row');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log WHERE event_id = ?').get(ev.id).n, before + 3);
  const badUpd = app.updateEvent(ev.id, { website: 'not a url' }, s3meta);
  assert.deepEqual([badUpd.ok, badUpd.reason], [false, 'website_invalid']);
  const badMeta = app.updateEvent(ev.id, { description: 'x' }, { reason: '' });
  assert.deepEqual([badMeta.ok, badMeta.reason], [false, 'reason_required']);
  const cats = app.replaceEventCategories(ev.id, ['food-drink-events', 'wineries-wine-events'], s3meta);
  assert.deepEqual([cats.ok, cats.categories], [true, ['food-drink-events', 'wineries-wine-events']]);
  const catsFour = app.replaceEventCategories(ev.id, ['a', 'b', 'c', 'd'], s3meta);
  assert.deepEqual([catsFour.ok, catsFour.reason], [false, 'too_many_categories']);
  const card = app.queryWhatsOnEvents({ from: '2030-10-03', to: '2030-10-03', regions: ['kelowna'] }).find((e) => e.slug === 's3-harvest-dinner');
  assert.deepEqual({ ...card, id: undefined }, {
    id: undefined, name: 'S3 Harvest Dinner', slug: 's3-harvest-dinner', region: 'kelowna', valleyWide: false,
    categories: ['food-drink-events', 'wineries-wine-events'], description: 'Updated description', image: null,
    startDate: '2030-10-03', endDate: '2030-10-03', dateLabel: 'Thu Oct 3', time: '6:30 pm', occurrenceCount: 1,
    venueName: 'Test Trattoria', venueId: s3venue.id, sourceType: 'official_venue', sourceName: 'Test Trattoria', attribution: null, status: 'scheduled',
  });
  const series = app.queryWhatsOnEvents({ from: '2030-10-01', to: '2030-10-31' }).find((e) => e.slug === 's3-jazz-jam');
  assert.equal(series.dateLabel, 'Thursdays until Dec 17 · next Thu Oct 3');
  assert.equal(series.time, '7 pm');
  assert.equal(series.venueName, 'RCA Atrium');
  assert.equal(series.occurrenceCount, 3, 'Oct 3, 17, 24 (Oct 10 cancelled)');
  const tourism = s3create({ name: 'S3 Listed By DMO', source_type: 'tourism_org', source_name: 'Tourism Kelowna', source_url: 'https://example.com/tk', occurrences: [{ start_date: '2030-12-01', end_date: '2030-12-03' }] });
  assert.equal(tourism.ok, true);
  const dmo = app.queryWhatsOnEvents({ from: '2030-12-02', to: '2030-12-02' }).find((e) => e.slug === 's3-listed-by-dmo');
  assert.deepEqual([dmo.attribution, dmo.dateLabel, dmo.time], ['Tourism Kelowna', 'Dec 1 – Dec 3', '']);
});

test('S3 cleanup: remove every Step 3 fixture event so later tests see only the Phase 1 fixtures', () => {
  const ids = db.prepare("SELECT id FROM events WHERE name LIKE 'S3 %'").all().map((r) => r.id);
  for (const id of ids) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE name LIKE 'S3 %'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_occurrences').get().n, 5, 'only the Phase 1 fixture occurrences remain');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log').get().n, 0);
});

// ---- What's On Step 4: bearer-guarded write API + public reads ---------------
// Every request goes through the exported http.Server on an ephemeral port
// (never the single startServer() bind the HTTP-routes test owns). Writes
// land in this throwaway fixture DB only and are removed by the cleanup test.
const S4_TOKEN = 'test-fixture-admin-token'; // the same fixture value set at the top of this file
async function s4request(method, urlPath, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const tmp = require('node:http').createServer((req, res) => app.server.emit('request', req, res));
    tmp.listen(0, '127.0.0.1', async () => {
      try {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (token !== undefined) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`http://127.0.0.1:${tmp.address().port}${urlPath}`, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* non-JSON body */ }
        resolve({ status: res.status, text, json });
      } catch (err) { reject(err); } finally { tmp.close(); }
    });
  });
}
const s4meta = { reason: 'step 4 fixture', batch_id: 'test-step4' };
const s4venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
const s4vernonVenueId = db.prepare("SELECT id FROM venues WHERE slug = 'test-vernon-golf-course'").get().id;
const s4event = (over = {}) => ({
  name: 'S4 Rockets Home Games', region: 'kelowna', description: 'Fixture series.',
  source_type: 'league_feed', source_name: 'WHL feed', source_url: `https://example.com/s4/${app.slugify(over.name || 'S4 Rockets Home Games')}`,
  venue_name_text: 'Prospera Place', categories: ['sports-recreation'],
  occurrences: [{ start_date: '2031-10-04', start_time: '19:05', label: 'vs Kamloops Blazers', source_ref: 'g1' }, { start_date: '2031-10-11', start_time: '18:05', label: 'vs Vees', source_ref: 'g2' }],
  ...s4meta, ...over,
});
const S4_PUBLIC_KEYS = ['id', 'name', 'slug', 'region', 'valleyWide', 'categories', 'description', 'image', 'startDate', 'endDate', 'dateLabel', 'time', 'occurrenceCount', 'venueName', 'attribution'];

test('S4 #1/#2: event writes without a token or with a wrong token are 401 and write nothing', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  for (const [label, opts] of [['no auth', {}], ['wrong token', { token: 'not-the-token' }], ['empty bearer', { token: '' }]]) {
    const res = await s4request('POST', '/api/events', { body: s4event(), ...opts });
    assert.equal(res.status, 401, label);
    assert.deepEqual(res.json, { error: 'Unauthorized.' }, label);
  }
  for (const [method, p] of [['PUT', '/api/events/1'], ['PUT', '/api/events/1/categories'], ['POST', '/api/events/1/occurrences'], ['PATCH', '/api/events/1/occurrences/1']]) {
    const res = await s4request(method, p, { body: { reason: 'x', batch_id: 'y' }, token: 'wrong' });
    assert.equal(res.status, 401, `${method} ${p}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, before, 'nothing written');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log').get().n, 0);
});

test('S4 #3: a valid token reaches the guarded writer -- create, update, categories, occurrences, occurrence status', async () => {
  const created = await s4request('POST', '/api/events', { body: s4event(), token: S4_TOKEN });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.json.ok, true);
  assert.equal(created.json.event.slug, 's4-rockets-home-games');
  assert.equal(created.json.occurrences.length, 2);
  const id = created.json.event.id;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log WHERE event_id = ? AND batch_id = ?').get(id, 'test-step4').n, 4, 'create + categories + 2 occurrences logged');

  const badKey = await s4request('POST', '/api/events', { body: { ...s4event({ name: 'S4 Extra' }), start_datetime: '2031-01-01' }, token: S4_TOKEN });
  assert.equal(badKey.status, 400);
  assert.match(badKey.json.error, /Unexpected field\(s\): start_datetime/);
  const malformed = await s4request('POST', '/api/events', { body: '{not json', token: S4_TOKEN });
  assert.equal(malformed.status, 400);
  const invalid = await s4request('POST', '/api/events', { body: s4event({ name: 'S4 Bad Region', region: 'shuswap' }), token: S4_TOKEN });
  assert.deepEqual([invalid.status, invalid.json.error], [400, 'region_invalid']);
  const dup = await s4request('POST', '/api/events', { body: s4event(), token: S4_TOKEN });
  assert.deepEqual([dup.status, dup.json.error], [409, 'duplicate_event'], 'writer duplicate protection surfaces as 409');
  const mismatch = await s4request('POST', '/api/events', { body: s4event({ name: 'S4 Mismatch', venue_name_text: undefined, venue_id: s4vernonVenueId }), token: S4_TOKEN });
  assert.deepEqual([mismatch.status, mismatch.json.error], [409, 'venue_region_mismatch']);

  const upd = await s4request('PUT', `/api/events/${id}`, { body: { description: 'Updated via API', ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([upd.status, upd.json.changed], [200, ['description']], upd.text);
  const immut = await s4request('PUT', `/api/events/${id}`, { body: { region: 'vernon', ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([immut.status, immut.json.error], [400, 'Unexpected field(s): region']);
  const notFound = await s4request('PUT', '/api/events/999999', { body: { description: 'x', ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([notFound.status, notFound.json.error], [404, 'event_not_found']);

  const cats = await s4request('PUT', `/api/events/${id}/categories`, { body: { categories: ['sports-recreation', 'family-kids'], ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([cats.status, cats.json.categories], [200, ['sports-recreation', 'family-kids']], cats.text);
  const four = await s4request('PUT', `/api/events/${id}/categories`, { body: { categories: ['a', 'b', 'c', 'd'], ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([four.status, four.json.error], [400, 'too_many_categories']);

  const more = await s4request('POST', `/api/events/${id}/occurrences`, { body: { occurrences: [{ start_date: '2031-10-11', start_time: '18:05' }, { start_date: '2031-10-18', start_time: '19:05', source_ref: 'g3' }], ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([more.status, more.json.inserted.length, more.json.skipped], [200, 1, 1], more.text);
  const occId = more.json.occurrences.find((o) => o.start_date === '2031-10-18').id;
  const patched = await s4request('PATCH', `/api/events/${id}/occurrences/${occId}`, { body: { status: 'cancelled', ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([patched.status, patched.json.occurrence.status], [200, 'cancelled'], patched.text);
  const badStatus = await s4request('PATCH', `/api/events/${id}/occurrences/${occId}`, { body: { status: 'sold-out', ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([badStatus.status, badStatus.json.error], [400, 'occurrence_status_invalid']);
  const noMeta = await s4request('PATCH', `/api/events/${id}/occurrences/${occId}`, { body: { status: 'scheduled' }, token: S4_TOKEN });
  assert.deepEqual([noMeta.status, noMeta.json.error], [400, 'reason_required']);
  const wrongMethod = await s4request('DELETE', `/api/events/${id}`, { token: S4_TOKEN });
  assert.equal(wrongMethod.status, 405, 'no delete anywhere');
});

test('S4 #4: with ENRICHMENT_ADMIN_TOKEN unset the event write API fails closed with 503 while public reads still work (isolated child process)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-events-503-'));
  const projectRoot = path.join(__dirname, '..');
  fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(tempDir, 'server.js'));
  fs.copyFileSync(path.join(projectRoot, 'db.js'), path.join(tempDir, 'db.js'));
  const ISOLATED_PORT = '3097';
  const childEnv = { ...process.env };
  delete childEnv.ENRICHMENT_ADMIN_TOKEN;
  childEnv.PORT = ISOLATED_PORT;
  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], { cwd: tempDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (c) => { output += c.toString(); });
  child.stderr.on('data', (c) => { output += c.toString(); });
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { if ((await fetch(`http://localhost:${ISOLATED_PORT}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(ready, `isolated child never became ready: ${output}`);
    const write = await fetch(`http://localhost:${ISOLATED_PORT}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${S4_TOKEN}` }, body: JSON.stringify(s4event()) });
    assert.equal(write.status, 503, 'unset token -> fail closed even with a "valid" bearer');
    assert.deepEqual(await write.json(), { error: 'Event write endpoints are not configured.' });
    const read = await fetch(`http://localhost:${ISOLATED_PORT}/api/events`);
    assert.equal(read.status, 200, 'public reads do not depend on the token');
    assert.deepEqual((await read.json()).events, [], 'the isolated child has an empty events table');
    assert.ok(!output.includes(S4_TOKEN), 'child output never contains the token');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('S4 #5: public event reads need no auth and ignore a wrong bearer', async () => {
  const list = await s4request('GET', '/api/events?from=2031-10-01&to=2031-10-31');
  assert.equal(list.status, 200);
  assert.equal(list.json.count, 1);
  assert.equal(list.json.events[0].slug, 's4-rockets-home-games');
  const withWrong = await s4request('GET', '/api/events?from=2031-10-01&to=2031-10-31', { token: 'wrong' });
  assert.equal(withWrong.status, 200, 'a wrong token on a read is ignored, never a 401 probe');
  assert.deepEqual(withWrong.json.events, list.json.events);
  const id = list.json.events[0].id;
  const one = await s4request('GET', `/api/events/${id}`);
  assert.equal(one.status, 200);
  assert.deepEqual(Object.keys(one.json).sort(), ['attribution', 'categories', 'dateLabel', 'description', 'id', 'image', 'name', 'occurrences', 'recurrence', 'region', 'slug', 'status', 'time', 'valleyWide', 'venueName', 'website'].sort());
  assert.equal(one.json.occurrences.length, 2, 'cancelled occurrence not exposed publicly');
  assert.deepEqual(Object.keys(one.json.occurrences[0]).sort(), ['allDay', 'endDate', 'endsNextDay', 'endTime', 'id', 'label', 'startDate', 'startTime'].sort());
  const occs = await s4request('GET', `/api/events/${id}/occurrences`);
  assert.deepEqual([occs.status, occs.json.occurrences.length], [200, 2]);
  const verified = await s4request('GET', `/api/events/${id}`, { token: S4_TOKEN });
  assert.equal(verified.json.event.source_url, 'https://example.com/s4/s4-rockets-home-games', 'a valid token returns the full record for write verification');
  assert.equal(verified.json.occurrences.length, 3, 'incl. the cancelled one');
  assert.equal((await s4request('GET', '/api/events/999999')).status, 404);
});

test('S4 #6-#9: today / this-weekend / this-week / this-month windows come from the Okanagan local date', async () => {
  const today = app.todayLocal();
  for (const when of ['today', 'this-weekend', 'this-week', 'this-month']) {
    const res = await s4request('GET', `/api/events?when=${when}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.window, { ...app.dateWindowForPreset(when, today), preset: when, fallback: false }, when);
  }
  // Data check: an event on the first day of each window is found by that preset.
  // Distinct names (no shared significant words) so the fuzzy duplicate
  // gate does not fire when several windows start on the same day.
  const WINDOW_NAMES = { today: 'S4 Sunrise Yoga', 'this-weekend': 'S4 Regatta', 'this-week': 'S4 Lecture', 'this-month': 'S4 Craft Fair' };
  for (const when of ['today', 'this-weekend', 'this-week', 'this-month']) {
    const w = app.dateWindowForPreset(when, today);
    const r = await s4request('POST', '/api/events', { body: s4event({ name: WINDOW_NAMES[when], venue_name_text: 'City Park', categories: ['community-events'], occurrences: [{ start_date: w.from }] }), token: S4_TOKEN });
    assert.equal(r.status, 201, r.text);
  }
  for (const when of ['today', 'this-weekend', 'this-week', 'this-month']) {
    const res = await s4request('GET', `/api/events?when=${when}`);
    assert.ok(res.json.events.some((e) => e.name === WINDOW_NAMES[when]), `${when} window lists its event`);
  }
  const todayRes = await s4request('GET', '/api/events?when=today');
  assert.ok(!todayRes.json.events.some((e) => e.name === 'S4 Rockets Home Games'), 'a 2031 series is not "today"');
});

test('S4 #10-#12: custom from/to, invalid custom ranges and >366-day ranges fall back to the rolling default window', async () => {
  const today = app.todayLocal();
  const ok = await s4request('GET', '/api/events?from=2031-10-01&to=2031-10-31');
  assert.deepEqual(ok.json.window, { from: '2031-10-01', to: '2031-10-31', preset: 'custom', fallback: false });
  const single = await s4request('GET', '/api/events?when=custom&from=2031-10-11&to=2031-10-11');
  assert.deepEqual([single.json.count, single.json.events[0].dateLabel, single.json.events[0].time], [1, 'Sat Oct 11', '6:05 pm'], 'the series shows its occurrence inside the window');
  const expectDefault = { from: today, to: app.addLocalDays(today, 30), preset: 'upcoming', fallback: true };
  for (const q of ['from=2031-10-31&to=2031-10-01', 'from=2031-02-30&to=2031-03-01', 'from=abc&to=2031-03-01', 'from=2031-10-01', 'when=custom', 'from=2031-01-01&to=2032-01-03']) {
    const res = await s4request('GET', `/api/events?${q}`);
    assert.deepEqual(res.json.window, expectDefault, q);
  }
  const max = await s4request('GET', '/api/events?from=2031-01-01&to=2032-01-02');
  assert.equal(max.json.window.fallback, false, 'exactly 366 days is allowed');
  const none = await s4request('GET', '/api/events');
  assert.deepEqual(none.json.window, { ...expectDefault, fallback: false }, 'no date params -> default window without the fallback flag');
  const unknown = await s4request('GET', '/api/events?when=someday');
  assert.equal(unknown.json.window.fallback, true);
});

test('S4 #13-#18: region / multi-region / category / multi-category / combined / valley-wide semantics over the API', async () => {
  const mk = async (over) => { const r = await s4request('POST', '/api/events', { body: s4event(over), token: S4_TOKEN }); assert.equal(r.status, 201, r.text); return r.json.event.id; };
  await mk({ name: 'S4 Vernon Concert', region: 'vernon', venue_name_text: 'Kal Tire Place', categories: ['live-music'], occurrences: [{ start_date: '2031-10-04', start_time: '20:00' }] });
  await mk({ name: 'S4 Wine Festival', region: 'kelowna', venue_name_text: undefined, valley_wide: 1, categories: ['wineries-wine-events', 'events-festivals'], occurrences: [{ start_date: '2031-10-03', end_date: '2031-10-12', all_day: 1 }] });
  await mk({ name: 'S4 Osoyoos Market', region: 'osoyoos', venue_name_text: 'Town Square', categories: ['markets-fairs', 'community-events'], occurrences: [{ start_date: '2031-10-04', start_time: '09:00', end_time: '13:00' }] });
  const names = async (q) => (await s4request('GET', `/api/events?from=2031-10-04&to=2031-10-04&${q}`)).json.events.map((e) => e.name).sort();
  assert.deepEqual(await names(''), ['S4 Osoyoos Market', 'S4 Rockets Home Games', 'S4 Vernon Concert', 'S4 Wine Festival']);
  assert.deepEqual(await names('regions=kelowna'), ['S4 Rockets Home Games', 'S4 Wine Festival'], 'region filter (valley-wide included)');
  assert.deepEqual(await names('regions=vernon'), ['S4 Vernon Concert', 'S4 Wine Festival']);
  assert.deepEqual(await names('regions=kelowna,vernon'), ['S4 Rockets Home Games', 'S4 Vernon Concert', 'S4 Wine Festival'], 'multi-region OR');
  assert.deepEqual(await names('regions=peachland'), ['S4 Wine Festival'], 'valley-wide matches a region with no events of its own');
  assert.deepEqual(await names('categories=live-music'), ['S4 Vernon Concert'], 'category filter');
  assert.deepEqual(await names('categories=live-music,markets-fairs'), ['S4 Osoyoos Market', 'S4 Vernon Concert'], 'multi-category OR');
  assert.deepEqual(await names('regions=osoyoos,vernon&categories=markets-fairs,live-music'), ['S4 Osoyoos Market', 'S4 Vernon Concert'], 'regions AND categories');
  assert.deepEqual(await names('regions=osoyoos&categories=live-music'), [], 'AND between groups can be empty');
  assert.deepEqual(await names('regions=shuswap&categories=jazz'), await names(''), 'unknown region/category values are dropped, not matched');
  const r = await s4request('GET', '/api/events?from=2031-10-04&to=2031-10-04&regions=osoyoos,vernon&categories=markets-fairs');
  assert.deepEqual([r.json.regions, r.json.categories], [['osoyoos', 'vernon'], ['markets-fairs']], 'the echoed filter state is the parsed, de-duplicated list');
});

test('S4 #19/#20: an event with no scheduled occurrence cannot exist; cancelled events and occurrences leave the window', async () => {
  const noOcc = await s4request('POST', '/api/events', { body: s4event({ name: 'S4 No Dates', occurrences: [] }), token: S4_TOKEN });
  assert.deepEqual([noOcc.status, noOcc.json.error], [400, 'no_scheduled_occurrence']);
  const allCancelled = await s4request('POST', '/api/events', { body: s4event({ name: 'S4 All Cancelled', occurrences: [{ start_date: '2031-10-04', status: 'cancelled' }] }), token: S4_TOKEN });
  assert.deepEqual([allCancelled.status, allCancelled.json.error], [400, 'no_scheduled_occurrence']);
  const concert = db.prepare("SELECT id FROM events WHERE slug = 's4-vernon-concert'").get();
  const cancelEvent = await s4request('PUT', `/api/events/${concert.id}`, { body: { status: 'cancelled', ...s4meta }, token: S4_TOKEN });
  assert.equal(cancelEvent.status, 200, cancelEvent.text);
  const afterCancel = await s4request('GET', '/api/events?from=2031-10-04&to=2031-10-04&regions=vernon');
  assert.ok(!afterCancel.json.events.some((e) => e.slug === 's4-vernon-concert'), 'cancelled event excluded');
  const rockets = db.prepare("SELECT id FROM events WHERE slug = 's4-rockets-home-games'").get();
  const occ = db.prepare("SELECT id FROM event_occurrences WHERE event_id = ? AND start_date = '2031-10-04'").get(rockets.id);
  const cancelOcc = await s4request('PATCH', `/api/events/${rockets.id}/occurrences/${occ.id}`, { body: { status: 'cancelled', ...s4meta }, token: S4_TOKEN });
  assert.equal(cancelOcc.status, 200, cancelOcc.text);
  const oct4 = await s4request('GET', '/api/events?from=2031-10-04&to=2031-10-04&regions=kelowna');
  assert.ok(!oct4.json.events.some((e) => e.slug === 's4-rockets-home-games'), 'cancelled occurrence excluded on that day');
  const oct11 = await s4request('GET', '/api/events?from=2031-10-11&to=2031-10-11&regions=kelowna');
  assert.ok(oct11.json.events.some((e) => e.slug === 's4-rockets-home-games'), 'series still live on its other date');
  const lastOcc = db.prepare("SELECT id FROM event_occurrences WHERE event_id = ? AND start_date = '2031-10-11'").get(rockets.id);
  const refuse = await s4request('PATCH', `/api/events/${rockets.id}/occurrences/${lastOcc.id}`, { body: { status: 'cancelled', ...s4meta }, token: S4_TOKEN });
  assert.deepEqual([refuse.status, refuse.json.error], [409, 'last_occurrence'], 'the publication invariant holds through the API');
});

test('S4 #21: list responses expose only the approved public card fields', async () => {
  const res = await s4request('GET', '/api/events?from=2031-10-01&to=2031-10-31');
  assert.ok(res.json.count > 0);
  assert.deepEqual(Object.keys(res.json).sort(), ['categories', 'count', 'events', 'regions', 'window']);
  for (const ev of res.json.events) {
    assert.deepEqual(Object.keys(ev).sort(), [...S4_PUBLIC_KEYS].sort(), ev.name);
    for (const forbidden of ['source_url', 'source_name', 'sourceType', 'sourceName', 'event_confidence', 'status', 'venueId', 'venue_id', 'batch_id']) {
      assert.ok(!(forbidden in ev), `${forbidden} must not be public`);
    }
  }
  const festival = res.json.events.find((e) => e.name === 'S4 Wine Festival');
  assert.deepEqual([festival.valleyWide, festival.dateLabel, festival.time, festival.venueName, festival.attribution], [true, 'Oct 3 – Oct 12', '', null, null]);
  const dmo = await s4request('POST', '/api/events', { body: s4event({ name: 'S4 DMO Listed', source_type: 'tourism_org', source_name: 'Tourism Kelowna', venue_name_text: 'Somewhere', categories: ['arts-culture'], occurrences: [{ start_date: '2031-10-20' }] }), token: S4_TOKEN });
  assert.equal(dmo.status, 201, dmo.text);
  const listed = (await s4request('GET', '/api/events?from=2031-10-20&to=2031-10-20')).json.events.find((e) => e.name === 'S4 DMO Listed');
  assert.equal(listed.attribution, 'Tourism Kelowna', 'attribution is the only provenance a card sees');
});

test('S4 #22: the bearer token never appears in responses, errors or the source\'s logging', async () => {
  const outputs = [];
  outputs.push((await s4request('POST', '/api/events', { body: s4event({ name: 'S4 Probe' }) })).text);
  outputs.push((await s4request('POST', '/api/events', { body: s4event({ name: 'S4 Probe' }), token: 'wrong' })).text);
  outputs.push((await s4request('POST', '/api/events', { body: s4event(), token: S4_TOKEN })).text); // 409 duplicate
  outputs.push((await s4request('POST', '/api/events', { body: '{bad', token: S4_TOKEN })).text);
  outputs.push((await s4request('POST', '/api/events', { body: s4event({ name: 'S4 Probe Created', occurrences: [{ start_date: '2031-11-01' }] }), token: S4_TOKEN })).text); // 201
  outputs.push((await s4request('GET', '/api/events?from=2031-11-01&to=2031-11-01', { token: S4_TOKEN })).text);
  for (const out of outputs) assert.ok(!out.includes(S4_TOKEN), `token leaked: ${out.slice(0, 120)}`);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const line of src.split('\n')) {
    if (/console\.(log|error|warn)\(/.test(line)) {
      assert.ok(!/ENRICHMENT_ADMIN_TOKEN|authHeader|req\.headers\[['"]authorization/.test(line), `logging line references the token/header: ${line.trim()}`);
    }
  }
  assert.ok(!src.includes('`Bearer ${ENRICHMENT_ADMIN_TOKEN}'), 'the token is never interpolated into a string');
});

test('S4 cleanup: remove every Step 4 fixture event', () => {
  const ids = db.prepare("SELECT id FROM events WHERE name LIKE 'S4 %'").all().map((r) => r.id);
  for (const id of ids) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_occurrences').get().n, 5, 'only the Phase 1 fixture occurrences remain');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE name LIKE 'S4 %'").get().n, 0);
});

// ---- What's On Step 5: event detail page + sitemap integration --------------
const s5meta = { reason: 'step 5 fixture', batch_id: 'test-step5' };
const s5venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
function s5create(over) {
  const r = app.createEvent({
    region: 'kelowna', description: 'Step 5 fixture description.', source_type: 'official_venue', source_name: 'Test Trattoria',
    source_url: `https://example.com/s5/${app.slugify(over.name)}`, venue_id: s5venue.id, categories: ['live-music'],
    occurrences: [{ start_date: '2032-05-15', start_time: '19:30', end_time: '21:30' }], ...over,
  }, s5meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.event;
}
async function s5get(urlPath) {
  return new Promise((resolve, reject) => {
    const tmp = require('node:http').createServer((req, res) => app.server.emit('request', req, res));
    tmp.listen(0, '127.0.0.1', async () => {
      try { const res = await fetch(`http://127.0.0.1:${tmp.address().port}${urlPath}`); resolve({ status: res.status, text: await res.text() }); }
      catch (err) { reject(err); } finally { tmp.close(); }
    });
  });
}
function s5jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
}

test('S5 #1-#4: canonical detail URL renders a valid event; missing slug, wrong region and unknown region all 404', async () => {
  const ev = s5create({ name: 'S5 Patio Concert' });
  const ok = await s5get('/kelowna/events/s5-patio-concert');
  assert.equal(ok.status, 200);
  assert.match(ok.text, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/events\/s5-patio-concert"/);
  assert.match(ok.text, /<h1>S5 Patio Concert<\/h1>/);
  assert.match(ok.text, /Step 5 fixture description\./);
  assert.match(ok.text, /href="\/kelowna">Kelowna<\/a>/, 'region link');
  assert.doesNotMatch(ok.text, /name="robots" content="noindex"/);
  assert.equal((await s5get('/kelowna/events/does-not-exist')).status, 404);
  assert.equal((await s5get('/vernon/events/s5-patio-concert')).status, 404, 'valid slug under the wrong region');
  assert.equal((await s5get('/shuswap/events/s5-patio-concert')).status, 404, 'unknown region');
  assert.equal((await s5get('/kelowna/events/S5-Patio-Concert')).status, 404, 'slugs are exact');
  assert.equal(ev.region, 'kelowna');
});

test('S5 #5/#6: cancelled and postponed events are not publishable -> 404, and revert to 200 when rescheduled', async () => {
  const ev = s5create({ name: 'S5 Cancelled Show', occurrences: [{ start_date: '2032-05-16', start_time: '20:00' }] });
  assert.equal((await s5get('/kelowna/events/s5-cancelled-show')).status, 200);
  assert.equal(app.updateEvent(ev.id, { status: 'cancelled' }, s5meta).ok, true);
  assert.equal((await s5get('/kelowna/events/s5-cancelled-show')).status, 404, 'cancelled -> 404');
  assert.equal(app.updateEvent(ev.id, { status: 'postponed' }, s5meta).ok, true);
  assert.equal((await s5get('/kelowna/events/s5-cancelled-show')).status, 404, 'postponed -> 404');
  assert.equal(app.updateEvent(ev.id, { status: 'scheduled' }, s5meta).ok, true);
  assert.equal((await s5get('/kelowna/events/s5-cancelled-show')).status, 200, 'rescheduled -> back');
});

test('S5 #7/#10/#12/#13/#15: a timed single-date event renders its occurrence, categories, image and no attribution for an official source', async () => {
  s5create({ name: 'S5 Gallery Night', categories: ['arts-culture', 'nightlife'], image_url: 'https://example.com/gallery.jpg', website: 'https://example.com/gallery' });
  const { text } = await s5get('/kelowna/events/s5-gallery-night');
  assert.match(text, /<span class="label">When<\/span><span>Saturday, May 15, 2032 &middot; 7:30 pm &ndash; 9:30 pm<\/span>/.source ? /Saturday, May 15, 2032 &middot; 7:30 pm – 9:30 pm/ : /x/, 'stored local date + time range');
  assert.match(text, /<p class="subtitle">Event in Kelowna, BC<\/p>/, 'single-date events are "Event", not "Event series"');
  assert.doesNotMatch(text, /All dates/, 'no series list for a single date');
  assert.match(text, /<span class="chip">Arts &amp; Culture<\/span> <span class="chip">Nightlife<\/span>/, 'category chips in position order');
  assert.match(text, /<img src="https:\/\/example\.com\/gallery\.jpg" alt="S5 Gallery Night"/);
  assert.match(text, /href="\/kelowna\/restaurants\/test-trattoria">Test Trattoria<\/a>/, 'venue row link');
  assert.doesNotMatch(text, /Listed by/, 'official_venue source -> no attribution line');
  assert.match(text, /<a href="https:\/\/example\.com\/gallery" rel="nofollow noopener" target="_blank">/);
  assert.match(text, /class="card-action fav-btn" data-fav-name="S5 Gallery Night"/);
  assert.match(text, /class="card-action trip-btn" data-trip-name="S5 Gallery Night" data-trip-query="S5 Gallery Night, Kelowna, Okanagan Valley, BC" data-trip-region="kelowna"/);
  assert.match(text, /data-venue-category="whatson"/, 'the shared fav/trip script keys off the What\'s On holder');
  assert.doesNotMatch(text, /source_url|event_confidence|batch_id|test-fixture-admin-token/, 'no admin metadata or credentials');
});

test('S5 #9/#11: all-day and ends-next-day occurrences render from stored values only', async () => {
  s5create({ name: 'S5 Harvest Weekend', venue_id: null, venue_name_text: 'Kelowna City Park', categories: ['events-festivals', 'food-drink-events'], occurrences: [{ start_date: '2032-09-24', end_date: '2032-09-26', all_day: 1 }] });
  const allDay = (await s5get('/kelowna/events/s5-harvest-weekend')).text;
  assert.match(allDay, /Friday, September 24 – Sunday, September 26, 2032 &middot; All day/);
  assert.match(allDay, /<span class="label">Where<\/span><span>Kelowna City Park<\/span>/, 'text venue when no venue row');
  s5create({ name: 'S5 Late Set', categories: ['nightlife'], occurrences: [{ start_date: '2032-05-15', start_time: '21:00', end_time: '01:00', ends_next_day: 1 }] });
  const late = (await s5get('/kelowna/events/s5-late-set')).text;
  assert.match(late, /Saturday, May 15, 2032 &middot; 9 pm – 1 am \(next day\)/);
  const ld = s5jsonLd(late).find((b) => b['@type'] !== 'BreadcrumbList');
  assert.deepEqual([ld.startDate, ld.endDate], ['2032-05-15T21:00:00-07:00', '2032-05-16T01:00:00-07:00'], 'ends_next_day pushes the ISO end to the next local day');
  const ldAll = s5jsonLd(allDay).find((b) => b['@type'] !== 'BreadcrumbList');
  assert.deepEqual([ldAll.startDate, ldAll.endDate], ['2032-09-24', '2032-09-26'], 'all-day -> bare dates, no invented times');
});

test('S5 #8/#14/#16/#17: a sports series lists its games chronologically with SportsEvent + subEvent JSON-LD; DMO rows get an attribution line', async () => {
  s5create({
    name: 'S5 Rockets Home Games 2032-33', venue_id: null, venue_name_text: 'Prospera Place', categories: ['sports-recreation'],
    source_type: 'league_feed', source_name: 'WHL feed', recurrence_rule: 'Home games through March',
    occurrences: [
      { start_date: '2032-11-01', start_time: '19:05', label: 'vs Kamloops Blazers', source_ref: 'g2' },
      { start_date: '2032-10-04', start_time: '18:05', label: 'vs Penticton Vees', source_ref: 'g1' },
      { start_date: '2032-12-19', start_time: '18:05', label: 'vs Victoria Royals', source_ref: 'g3' },
    ],
  });
  const { text } = await s5get('/kelowna/events/s5-rockets-home-games-2032-33');
  assert.match(text, /<p class="subtitle">Event series in Kelowna, BC<\/p>/);
  assert.match(text, /<span class="label">When<\/span><span>3 dates &middot; next: Monday, October 4, 2032<\/span>/);
  const list = text.match(/<ol class="event-date-list">([\s\S]*?)<\/ol>/)[1];
  const dates = [...list.matchAll(/<span class="event-date-when">([^<]+)<\/span> <span class="event-date-label">([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(dates, [
    ['Monday, October 4, 2032 &middot; 6:05 pm', 'vs Penticton Vees'],
    ['Monday, November 1, 2032 &middot; 7:05 pm', 'vs Kamloops Blazers'],
    ['Sunday, December 19, 2032 &middot; 6:05 pm', 'vs Victoria Royals'],
  ], 'chronological, not insertion order');
  assert.match(text, /Home games through March/);
  const ld = s5jsonLd(text).find((b) => b['@type'] !== 'BreadcrumbList');
  assert.equal(ld['@type'], 'SportsEvent');
  assert.equal(ld.name, 'S5 Rockets Home Games 2032-33 – vs Penticton Vees', 'the next game is the main Event');
  assert.equal(ld.startDate, '2032-10-04T18:05:00-07:00');
  assert.equal(ld.eventStatus, 'https://schema.org/EventScheduled');
  assert.deepEqual(ld.location, { '@type': 'Place', name: 'Prospera Place' });
  assert.deepEqual(ld.subEvent.map((s) => [s['@type'], s.name, s.startDate.slice(0, 16)]), [
    ['SportsEvent', 'S5 Rockets Home Games 2032-33 \u2013 vs Kamloops Blazers', '2032-11-01T19:05'],
    ['SportsEvent', 'S5 Rockets Home Games 2032-33 \u2013 vs Victoria Royals', '2032-12-19T18:05'],
  ]);
  // The winter offset (-08:00 PST, or -07:00 if BC stays on daylight time) depends on the
  // platform's tzdata (2026a vs 2026c disagree after Nov 2026); only its shape is pinned.
  for (const sub of ld.subEvent) assert.match(sub.startDate, /^2032-\d{2}-\d{2}T\d{2}:\d{2}:00-0[78]:00$/);
  assert.doesNotMatch(text, /Listed by/, 'league feed is an official source');
  s5create({ name: 'S5 Craft Market', source_type: 'tourism_org', source_name: 'Tourism Kelowna', categories: ['markets-fairs'], venue_id: null, venue_name_text: 'Laurel Packinghouse', occurrences: [{ start_date: '2032-11-07', start_time: '10:00', end_time: '16:00' }] });
  const dmo = (await s5get('/kelowna/events/s5-craft-market')).text;
  assert.match(dmo, /<p class="event-attribution">Listed by Tourism Kelowna<\/p>/);
});

test('S5 #18: no fabricated dates or times -- untimed occurrences stay date-only; JSON-LD only for scheduled events with occurrences', async () => {
  const ev = s5create({ name: 'S5 Open Studio', categories: ['arts-culture'], occurrences: [{ start_date: '2032-06-06' }] });
  const { text } = await s5get('/kelowna/events/s5-open-studio');
  assert.match(text, /<span class="label">When<\/span><span>Sunday, June 6, 2032<\/span>/, 'no time shown when none is stored');
  const ld = s5jsonLd(text).find((b) => b['@type'] !== 'BreadcrumbList');
  assert.deepEqual([ld.startDate, ld.endDate], ['2032-06-06', '2032-06-06'], 'bare date, no midnight or noon invented');
  assert.equal(app.eventJsonLd({ ...app.getEventById(ev.id), status: 'cancelled' }, app.listEventOccurrences(ev.id), ['arts-culture'], null, 'https://x', '2026-09-22'), null, 'cancelled -> no Event JSON-LD');
  assert.equal(app.eventJsonLd({ ...app.getEventById(ev.id), status: 'postponed' }, app.listEventOccurrences(ev.id), ['arts-culture'], null, 'https://x', '2026-09-22'), null, 'postponed -> no Event JSON-LD');
  assert.equal(app.eventJsonLd(app.getEventById(ev.id), [], ['arts-culture'], null, 'https://x', '2026-09-22'), null, 'no occurrences -> no Event JSON-LD');
  assert.equal(app.eventSchemaType({ type: null }, ['live-music']), 'MusicEvent');
  assert.equal(app.eventSchemaType({ type: 'festival' }, ['live-music']), 'Festival', 'stored type hint wins');
  assert.equal(app.eventSchemaType({ type: null }, ['workshops-classes']), 'Event');
});

test('S5 #19-#23: sitemap includes exactly the publishable, occurrence-backed, unexpired events once each and keeps every other URL', async () => {
  const baseline = (await s5get('/sitemap.xml')).text;
  const urlsOf = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const before = urlsOf(baseline);
  const nonEvent = (urls) => urls.filter((u) => !/\/events\/[a-z0-9-]+$/.test(u));
  const eventUrls = (urls) => urls.filter((u) => /\/events\/[a-z0-9-]+$/.test(u));
  // Fixture events already present: future festival (kelowna + vernon) and the weekly market are active; the past market is expired.
  assert.deepEqual(eventUrls(before).sort(), [
    'https://okanaganroam.com/kelowna/events/s5-cancelled-show',
    'https://okanaganroam.com/kelowna/events/s5-craft-market',
    'https://okanaganroam.com/kelowna/events/s5-gallery-night',
    'https://okanaganroam.com/kelowna/events/s5-harvest-weekend',
    'https://okanaganroam.com/kelowna/events/s5-late-set',
    'https://okanaganroam.com/kelowna/events/s5-open-studio',
    'https://okanaganroam.com/kelowna/events/s5-patio-concert',
    'https://okanaganroam.com/kelowna/events/s5-rockets-home-games-2032-33',
    'https://okanaganroam.com/kelowna/events/test-future-festival',
    'https://okanaganroam.com/kelowna/events/test-weekly-market',
    'https://okanaganroam.com/vernon/events/test-future-festival',
  ]);
  assert.ok(!before.includes('https://okanaganroam.com/kelowna/events/test-past-market'), 'expired fixture excluded');
  assert.equal(new Set(before).size, before.length, 'no duplicate URLs');
  const cancelled = db.prepare("SELECT id FROM events WHERE slug = 's5-cancelled-show'").get();
  app.updateEvent(cancelled.id, { status: 'cancelled' }, s5meta);
  const lateSet = db.prepare("SELECT id FROM events WHERE slug = 's5-late-set'").get();
  app.updateEvent(lateSet.id, { status: 'postponed' }, s5meta);
  const gallery = db.prepare("SELECT id FROM events WHERE slug = 's5-gallery-night'").get();
  const galleryOcc = db.prepare('SELECT id FROM event_occurrences WHERE event_id = ?').get(gallery.id);
  assert.equal(app.setEventOccurrenceStatus(gallery.id, galleryOcc.id, 'cancelled', { ...s5meta, event_status: 'cancelled' }).ok, true);
  const after = urlsOf((await s5get('/sitemap.xml')).text);
  assert.ok(!after.includes('https://okanaganroam.com/kelowna/events/s5-cancelled-show'), 'cancelled excluded');
  assert.ok(!after.includes('https://okanaganroam.com/kelowna/events/s5-late-set'), 'postponed excluded');
  assert.ok(!after.includes('https://okanaganroam.com/kelowna/events/s5-gallery-night'), 'no scheduled occurrence -> excluded');
  assert.ok(after.includes('https://okanaganroam.com/kelowna/events/s5-open-studio'));
  assert.deepEqual(nonEvent(after), nonEvent(before), 'every non-event URL unchanged, in the same order');
  assert.equal(after[0], 'https://okanaganroam.com/', 'homepage leads the file');
  for (const hub of ['whats-on', 'outdoors', 'golf', 'beaches']) {
    assert.equal(after.filter((u) => u === `https://okanaganroam.com/${hub}`).length, 1, `valley-wide hub /${hub} listed exactly once`);
  }
  assert.ok(!after.includes('https://okanaganroam.com/trip'), '/trip is deliberately not listed');
  assert.ok(!after.includes('https://okanaganroam.com/events'), 'the retired /events index is no longer listed (it redirects to /whats-on)');
  assert.deepEqual(app.listEventsForSitemap().map((e) => `${e.region}/${e.slug}`), app.listEventsForSitemap().map((e) => `${e.region}/${e.slug}`).slice().sort(), 'deterministic region/slug order');
});

// ---- H1 Step 2: "Upcoming events in {Region}" block on region hub pages ----
// Same publication predicate as the sitemap and the event-page block; the
// section is omitted entirely below MIN_REGION_EVENTS, so a one-event or
// zero-event region keeps its existing page exactly as before.
// ---- H1 mid-span date display (2026-09-22) ----
// The list helpers pick the next scheduled occurrence that has not finished.
// For a multi-day occurrence already under way that occurrence STARTED in the
// past, and printing its start date showed a visitor a date that had gone.
// upcomingEventDateLabel() prints "Until {end}" in that case only; every other
// event keeps the exact label it had before.
test('H1 mid-span dates: a card for an in-progress multi-day event shows its end date, single-date and future events are unchanged, and all three H1 helpers carry the end date', () => {
  const NOW = new Date('2026-09-22T12:00:00-07:00');
  const label = (a, b) => app.upcomingEventDateLabel(a, b, NOW);

  // The bug: next occurrence is mid-span, so its start date is in the past.
  assert.equal(label('2026-06-13', '2026-10-25'), 'Until Sun Oct 25', 'mid-span -> end date');
  assert.equal(label('2026-09-11', '2026-09-29'), 'Until Tue Sep 29', 'mid-span -> end date');
  assert.equal(label('2026-09-18', '2026-09-27'), 'Until Sun Sep 27', 'mid-span -> end date');

  // Everything else keeps its previous wording exactly.
  assert.equal(label('2026-09-22', '2026-09-22'), 'Tue Sep 22', 'single date today');
  assert.equal(label('2026-09-26', '2026-09-26'), 'Sat Sep 26', 'ordinary single-date event');
  assert.equal(label('2026-11-30', '2026-11-30'), 'Mon Nov 30', 'ordinary future event');
  assert.equal(label('2026-10-02', '2026-10-05'), 'Fri Oct 2', 'future multi-day event keeps its start date');
  assert.equal(label('2026-09-22', '2026-09-30'), 'Tue Sep 22', 'span starting today keeps its start date');
  assert.equal(label('2026-09-20', '2026-09-22'), 'Until Tue Sep 22', 'span ending today is still in progress');
  assert.equal(label(null, null), '', 'no date -> no label');
  assert.equal(label('2026-09-26', null), 'Sat Sep 26', 'missing end date falls back to the start date');

  // All three H1 helpers must expose nextEndDate so they share the fix.
  const region = 'peachland';
  const mk = (name, occurrences) => {
    const r = app.createEvent({
      region, name, description: 'Mid-span fixture.', source_type: 'official_organizer',
      source_name: `midspan ${name}`, source_url: `https://example.com/midspan/${app.slugify(name)}`,
      venue_name_text: `Midspan Hall ${name}`, categories: ['arts-culture'], occurrences,
    }, { reason: 'mid-span fixture', batch_id: 'test-midspan' });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.event;
  };
  const running = mk('Longrun Exhibition', [{ start_date: '2026-06-13', end_date: '2026-10-25' }]);
  const plain = mk('Brightwater Concert', [{ start_date: '2026-10-02' }]);

  const fromRegion = app.listUpcomingEventsForRegion(region, { limit: 10, now: NOW });
  const r1 = fromRegion.find((e) => e.id === running.id);
  const p1 = fromRegion.find((e) => e.id === plain.id);
  assert.ok(r1 && p1, 'both fixtures are publishable');
  assert.equal(r1.nextDate, '2026-06-13', 'selection is unchanged: the in-progress occurrence is still chosen');
  assert.equal(r1.nextEndDate, '2026-10-25', 'region helper carries the end date');
  assert.equal(label(r1.nextDate, r1.nextEndDate), 'Until Sun Oct 25');
  assert.equal(label(p1.nextDate, p1.nextEndDate), 'Fri Oct 2', 'ordinary event unchanged');

  const fromEvent = app.listRelatedEventsInRegion(plain, { limit: 10, now: NOW });
  const r2 = fromEvent.find((e) => e.id === running.id);
  assert.ok(r2, 'event helper returns the in-progress event');
  assert.equal(r2.nextEndDate, '2026-10-25', 'event helper carries the end date');

  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'second-test-restaurant');
  const atVenue = app.createEvent({
    region: 'kelowna', name: 'Harbourlight Residency', description: 'Mid-span fixture.',
    source_type: 'official_organizer', source_name: 'midspan venue', source_url: 'https://example.com/midspan/venue',
    venue_id: venue.id, categories: ['arts-culture'], occurrences: [{ start_date: '2026-06-13', end_date: '2026-10-25' }],
  }, { reason: 'mid-span fixture', batch_id: 'test-midspan' });
  assert.equal(atVenue.ok, true, JSON.stringify(atVenue));
  const atVenue2 = app.createEvent({
    region: 'kelowna', name: 'Quayside Sessions', description: 'Mid-span fixture.',
    source_type: 'official_organizer', source_name: 'midspan venue 2', source_url: 'https://example.com/midspan/venue2',
    venue_id: venue.id, categories: ['live-music'], occurrences: [{ start_date: '2026-11-14' }],
  }, { reason: 'mid-span fixture', batch_id: 'test-midspan' });
  assert.equal(atVenue2.ok, true, JSON.stringify(atVenue2));
  const r3 = app.listUpcomingEventsAtVenue(venue.id, { limit: 10, now: NOW }).find((e) => e.id === atVenue.event.id);
  assert.ok(r3, 'venue helper returns the in-progress event');
  assert.equal(r3.nextEndDate, '2026-10-25', 'venue helper carries the end date');
  assert.equal(label(r3.nextDate, r3.nextEndDate), 'Until Sun Oct 25');

  // Cleanup: leave the shared fixture DB exactly as this test found it.
  for (const e of [running, plain, atVenue.event, atVenue2.event]) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
  }
  assert.equal(app.listUpcomingEventsForRegion(region, { now: NOW }).length, 0, 'fixture rows removed');
  assert.equal(app.listUpcomingEventsAtVenue(venue.id, { limit: 50, now: NOW }).length, 0, 'venue fixture rows removed');
});

// ---- H1 Step 3: "Events at {Venue}" block on venue detail pages ----
// Linked strictly through events.venue_id (never by venue name), using the
// same publication predicate as the sitemap and the event/region blocks. The
// section is omitted entirely below MIN_VENUE_EVENTS, so a venue hosting one
// event or none keeps its existing page exactly as before.
test('H1 Step 3: venue pages link the next publishable events at that venue, omit the block below the threshold, and never link an unpublishable event', () => {
  // second-test-restaurant is used by the redirect fixtures only and carries no
  // events; test-trattoria deliberately is NOT used here because the S3 event
  // fixtures attach their own events to it.
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'second-test-restaurant');
  assert.ok(venue, 'fixture venue exists');
  const other = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  assert.ok(other, 'second fixture venue exists');
  const otherBaseline = app.listUpcomingEventsAtVenue(other.id, { limit: 50 }).map((e) => e.slug).sort();
  const html = () => app.renderVenuePage(venue, [], [], []);
  const cardsOf = (h) => {
    const m = h.match(/<h2>Events at [^<]*<\/h2>[\s\S]*?<\/div>\s*<\/div>/);
    return m ? [...m[0].matchAll(/<a href="(\/[a-z-]+\/events\/[a-z0-9-]+)">/g)].map((x) => x[1]) : [];
  };

  // 1. Zero events at this venue -> no block at all.
  assert.equal(app.listUpcomingEventsAtVenue(venue.id).length, 0, 'fixture venue starts with no events');
  const bare = html();
  assert.doesNotMatch(bare, /Events at /, 'zero events -> no block');

  const mk = (name, over = {}) => {
    const r = app.createEvent({
      region: 'kelowna', name, description: 'H1 Step 3 fixture.', source_type: 'official_organizer',
      source_name: `H1S3 ${name}`, source_url: `https://example.com/h1s3/${app.slugify(name)}`,
      venue_id: venue.id, categories: ['community-events'], occurrences: [{ start_date: '2033-05-02' }], ...over,
    }, { reason: 'H1 Step 3 fixture', batch_id: 'test-h1s3' });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.event;
  };

  // 2. One event -> still no block.
  const a = mk('Cellarwork Nocturne', { occurrences: [{ start_date: '2033-05-02' }] });
  assert.equal(app.listUpcomingEventsAtVenue(venue.id).length, 0, 'one event is below the threshold');
  assert.doesNotMatch(html(), /Events at /, 'one event -> still no block');

  // 3. Two events -> exactly 2 cards, in next-date order, heading names the venue.
  const b = mk('Harvestide Banquet', { categories: ['food-drink-events'], occurrences: [{ start_date: '2033-05-09' }] });
  const two = html();
  assert.deepEqual(cardsOf(two), [`/kelowna/events/${a.slug}`, `/kelowna/events/${b.slug}`], 'two cards in next-date order');
  assert.ok(two.includes(`<h2>Events at ${venue.name}</h2>`), 'heading is "Events at {Venue Name}"');

  // 4. Four events -> capped at 3, still ordered by next occurrence.
  const c = mk('Lanternfall Recital', { categories: ['arts-culture'], occurrences: [{ start_date: '2033-05-05' }] });
  mk('Duskwine Tasting', { categories: ['nightlife'], occurrences: [{ start_date: '2033-06-20' }] });
  assert.deepEqual(cardsOf(html()), [`/kelowna/events/${a.slug}`, `/kelowna/events/${c.slug}`, `/kelowna/events/${b.slug}`], 'max 3 cards, next-date order');

  // 5. Cancelled, postponed and expired events at this venue are never linked.
  const cancelled = mk('Shuttered Doorway', { categories: ['workshops-classes'], occurrences: [{ start_date: '2033-05-03' }] });
  app.updateEvent(cancelled.id, { status: 'cancelled' }, { reason: 'H1 Step 3 fixture', batch_id: 'test-h1s3' });
  const postponed = mk('Deferred Interlude', { categories: ['wineries-wine-events'], occurrences: [{ start_date: '2033-05-04' }] });
  app.updateEvent(postponed.id, { status: 'postponed' }, { reason: 'H1 Step 3 fixture', batch_id: 'test-h1s3' });
  const expired = mk('Antiquevine Soiree', { categories: ['live-music'], occurrences: [{ start_date: '2019-05-04' }] });
  const slugs = app.listUpcomingEventsAtVenue(venue.id, { limit: 50 }).map((e) => e.slug);
  assert.ok(!slugs.includes(cancelled.slug), 'cancelled never linked');
  assert.ok(!slugs.includes(postponed.slug), 'postponed never linked');
  assert.ok(!slugs.includes(expired.slug), 'expired never linked');

  // 6. Links are direct canonical event URLs, never a filtered view, never the venue itself.
  for (const href of cardsOf(html())) {
    assert.match(href, /^\/kelowna\/events\/[a-z0-9-]+$/, `canonical event URL: ${href}`);
    assert.ok(!href.includes('?'), 'no query-string links');
  }

  // 7. The relationship is venue_id only -- an event naming this venue in
  //    venue_name_text is never picked up.
  const byName = app.createEvent({
    region: 'kelowna', name: 'Nameplate Gathering', description: 'H1 Step 3 fixture.', source_type: 'official_organizer',
    source_name: 'H1S3 name-only', source_url: 'https://example.com/h1s3/name-only',
    venue_name_text: venue.name, categories: ['community-events'], occurrences: [{ start_date: '2033-05-06' }],
  }, { reason: 'H1 Step 3 fixture', batch_id: 'test-h1s3' });
  assert.equal(byName.ok, true, JSON.stringify(byName));
  assert.ok(!app.listUpcomingEventsAtVenue(venue.id, { limit: 50 }).map((e) => e.slug).includes(byName.event.slug), 'venue_name_text match is never linked');

  // 8. A different venue never picks up this venue's events.
  assert.deepEqual(app.listUpcomingEventsAtVenue(other.id, { limit: 50 }).map((e) => e.slug).sort(), otherBaseline,
    'another venue\'s event list is untouched by events created here');

  // Cleanup: leave the shared fixture DB exactly as this test found it.
  const made = [a, b, c, cancelled, postponed, expired, byName.event];
  for (const e of app.listUpcomingEventsAtVenue(venue.id, { limit: 50 })) if (!made.some((x) => x.id === e.id)) made.push(e);
  for (const e of made) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
  }
  db.prepare("DELETE FROM events WHERE source_url LIKE 'https://example.com/h1s3/%'").run();
  assert.equal(app.listUpcomingEventsAtVenue(venue.id, { limit: 50 }).length, 0, 'fixture rows removed');
  assert.doesNotMatch(html(), /Events at /, 'page back to its original shape');
});

test('H1 Step 2: region pages link the next publishable events, omit the block below the threshold, and never link an unpublishable event', () => {
  const counts = app.getRegionCategoryCounts('kelowna');
  const regionHtml = (region) => app.renderRegionPage(region, app.getRegionCategoryCounts(region) || counts, []);
  const eventLinksOf = (html) => {
    const m = html.match(/<h2>Upcoming events in [^<]*<\/h2>[\s\S]*?<\/div>\s*<p>/);
    return m ? [...m[0].matchAll(/<a href="(\/[a-z-]+\/events\/[a-z0-9-]+)">/g)].map((x) => x[1]) : [];
  };

  // 1. A region with plenty of publishable events links exactly 3, all direct
  //    canonical event-detail URLs in that region (never a /whats-on?... URL).
  const kelowna = regionHtml('kelowna');
  const kelownaLinks = eventLinksOf(kelowna);
  assert.equal(kelownaLinks.length, 3, 'a well-stocked region links exactly 3 events');
  for (const href of kelownaLinks) assert.match(href, /^\/kelowna\/events\/[a-z0-9-]+$/, `canonical event URL: ${href}`);
  assert.match(kelowna, /<h2>Upcoming events in Kelowna<\/h2>/);
  // 6. The secondary link exists alongside the block, and only as a secondary link.
  assert.match(kelowna, /<a href="\/whats-on\?regions=kelowna">See what&rsquo;s on in Kelowna &rarr;<\/a>/);
  assert.equal(kelownaLinks.filter((h) => h.includes('whats-on')).length, 0, 'no filtered URL is used as a primary event link');

  // 7. The pre-existing region page is otherwise intact.
  assert.match(kelowna, /<h1>Kelowna, BC<\/h1>/);
  assert.match(kelowna, /<ul class="card-grid">/);
  assert.match(kelowna, /<link rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna">/);
  assert.doesNotMatch(kelowna, /<meta name="robots"/, 'region pages stay indexable');
  assert.equal(app.listUpcomingEventsForRegion('kelowna', { limit: 3 }).length, 3);

  // 2/3/4. Threshold behaviour, driven by real fixture data rather than counts.
  const twoRegion = 'peachland';
  const before = app.listUpcomingEventsForRegion(twoRegion).length;
  assert.equal(before, 0, 'fixture DB starts with no peachland events');
  assert.doesNotMatch(regionHtml(twoRegion), /Upcoming events in/, 'zero publishable events -> no block');
  const pvenue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const mk = (name, over) => {
    const r = app.createEvent({
      region: twoRegion, name, description: 'H1 Step 2 fixture.', source_type: 'official_organizer', source_name: `H1S2 ${name}`,
      source_url: `https://example.com/h1s2/${app.slugify(name)}`, venue_name_text: `H1S2 Hall ${name}`, categories: ['community-events'],
      occurrences: [{ start_date: '2032-08-01' }], ...over,
    }, { reason: 'H1 Step 2 fixture', batch_id: 'test-h1s2' });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.event;
  };
  const one = mk('H1S2 Lantern Walk', { occurrences: [{ start_date: '2032-08-01' }] });
  assert.equal(app.listUpcomingEventsForRegion(twoRegion).length, 0, 'one publishable event is below the threshold');
  assert.doesNotMatch(regionHtml(twoRegion), /Upcoming events in/, 'one event -> still no block');

  const two = mk('H1S2 Harbour Recital', { categories: ['live-music'], occurrences: [{ start_date: '2032-08-08' }] });
  const twoHtml = regionHtml(twoRegion);
  const twoLinks = eventLinksOf(twoHtml);
  assert.equal(twoLinks.length, 2, 'a two-event region links exactly 2');
  assert.deepEqual(twoLinks, [`/${twoRegion}/events/${one.slug}`, `/${twoRegion}/events/${two.slug}`], 'ordered by next scheduled occurrence');
  assert.match(twoHtml, /<h2>Upcoming events in Peachland<\/h2>/);

  // 5. Cancelled, postponed and expired events are never linked.
  const cancelled = mk('H1S2 Toolshare Meetup', { categories: ['workshops-classes'], occurrences: [{ start_date: '2032-07-01' }] });
  app.updateEvent(cancelled.id, { status: 'cancelled' }, { reason: 'H1 Step 2 fixture', batch_id: 'test-h1s2' });
  const postponed = mk('H1S2 Almanac Reading', { categories: ['arts-culture'], occurrences: [{ start_date: '2032-07-02' }] });
  app.updateEvent(postponed.id, { status: 'postponed' }, { reason: 'H1 Step 2 fixture', batch_id: 'test-h1s2' });
  const expired = mk('H1S2 Bellows Social', { categories: ['nightlife'], occurrences: [{ start_date: '2020-07-03' }] });
  const slugs = app.listUpcomingEventsForRegion(twoRegion, { limit: 20 }).map((e) => e.slug);
  assert.ok(!slugs.includes(cancelled.slug), 'cancelled event never linked');
  assert.ok(!slugs.includes(postponed.slug), 'postponed event never linked');
  assert.ok(!slugs.includes(expired.slug), 'expired event never linked');
  assert.deepEqual(slugs, [one.slug, two.slug], 'only the publishable pair remains');

  // Cleanup: leave the shared fixture DB exactly as this test found it.
  for (const e of [one, two, cancelled, postponed, expired]) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(e.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
  }
  assert.equal(app.listUpcomingEventsForRegion(twoRegion).length, 0, 'fixture rows removed');
  assert.doesNotMatch(regionHtml(twoRegion), /Upcoming events in/, 'page back to its original shape');
});

test('S5 #24: with zero events the sitemap carries no event URLs and is unaffected by the event tables (isolated child process)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-sitemap-zero-events-'));
  const projectRoot = path.join(__dirname, '..');
  fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(tempDir, 'server.js'));
  fs.copyFileSync(path.join(projectRoot, 'db.js'), path.join(tempDir, 'db.js'));
  const ISOLATED_PORT = '3096';
  const childEnv = { ...process.env, PORT: ISOLATED_PORT };
  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], { cwd: tempDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { if ((await fetch(`http://localhost:${ISOLATED_PORT}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(ready);
    const first = await (await fetch(`http://localhost:${ISOLATED_PORT}/sitemap.xml`)).text();
    const urls = [...first.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(urls.filter((u) => /\/events\/[a-z0-9-]+$/.test(u)).length, 0, 'no event detail URLs');
    assert.equal(urls[0], 'https://okanaganroam.com/');
    assert.ok(!urls.includes('https://okanaganroam.com/events'), 'the retired /events index is not listed');
    const second = await (await fetch(`http://localhost:${ISOLATED_PORT}/sitemap.xml`)).text();
    assert.equal(second, first, 'byte-identical across requests with zero events');
    assert.equal((await fetch(`http://localhost:${ISOLATED_PORT}/kelowna/events/anything`)).status, 404);
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('S5 cleanup: remove every Step 5 fixture event', () => {
  const ids = db.prepare("SELECT id FROM events WHERE name LIKE 'S5 %'").all().map((r) => r.id);
  for (const id of ids) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE name LIKE 'S5 %'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_enrichment_log').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_occurrences').get().n, 5, 'only the Phase 1 fixture occurrences remain');
});

// ---- What's On Step 6: shell wired to the event data layer -------------------
const s6meta = { reason: 'step 6 fixture', batch_id: 'test-step6' };
function s6create(over) {
  const r = app.createEvent({
    region: 'kelowna', description: 'Step 6 fixture description.', source_type: 'official_venue', source_name: 'Test Trattoria',
    source_url: `https://example.com/s6/${app.slugify(over.name)}`, venue_name_text: 'Fixture Hall', categories: ['live-music'], ...over,
  }, s6meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.event;
}
async function s6get(urlPath) {
  return new Promise((resolve, reject) => {
    const tmp = require('node:http').createServer((req, res) => app.server.emit('request', req, res));
    tmp.listen(0, '127.0.0.1', async () => {
      try { const res = await fetch(`http://127.0.0.1:${tmp.address().port}${urlPath}`); resolve({ status: res.status, text: await res.text() }); }
      catch (err) { reject(err); } finally { tmp.close(); }
    });
  });
}
const s6markup = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '');
const s6cards = (html) => [...s6markup(html).matchAll(/<li class="venue-card whatson-event-card" data-venue-id="event-(\d+)"[^>]*data-event-region="([a-z-]+)" data-event-categories="([a-z,-]*)"( data-event-valley-wide="1")?/g)].map((m) => ({ id: Number(m[1]), region: m[2], cats: m[3], valley: !!m[4] }));

test('S6 #1/#20/#22: with zero publishable inventory /whats-on renders the approved empty state, noindex, no date step, hidden controls (isolated child, empty DB)', async () => {
  assert.equal(app.whatsOnInventoryExists(new Date('2200-01-01T00:00:00Z')), false, 'evaluated after every fixture has ended -> no inventory');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-whatson-zero-'));
  const projectRoot = path.join(__dirname, '..');
  fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(tempDir, 'server.js'));
  fs.copyFileSync(path.join(projectRoot, 'db.js'), path.join(tempDir, 'db.js'));
  const ISOLATED_PORT = '3095';
  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], { cwd: tempDir, env: { ...process.env, PORT: ISOLATED_PORT }, stdio: ['ignore', 'pipe', 'pipe'] });
  let text;
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { if ((await fetch(`http://localhost:${ISOLATED_PORT}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(ready);
    const res = await fetch(`http://localhost:${ISOLATED_PORT}/whats-on`);
    assert.equal(res.status, 200);
    text = await res.text();
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  const markup = s6markup(text);
  assert.match(text, /<meta name="robots" content="noindex">/);
  assert.match(markup, /<div class="whatson-empty" id="whatsOnEmptyInventory">\s*<h3>We’re gathering what’s on\.<\/h3>/);
  assert.match(markup, /aria-live="polite">0 events<\/p>/);
  assert.match(markup, /<ul class="card-grid" id="whatsOnResults" hidden><\/ul>/);
  assert.match(markup, /id="whatsOnShowResults" hidden>Show all results</);
  assert.match(markup, /id="whatsOnNoResults" hidden>/);
  assert.doesNotMatch(markup, /whatsOnDatesHeading/, 'the date step only appears once inventory exists');
  assert.match(text, /var INVENTORY = false;/);
  // The date-window parameters are parsed even now, so the future step has its slot: the page query reader is the API's.
  assert.deepEqual(app.parseWhatsOnPageQuery({ regions: 'kelowna', categories: 'nightlife', when: 'this-week' }), { regions: ['kelowna'], categories: ['nightlife'], when: 'this-week', from: undefined, to: undefined });
  assert.deepEqual(app.parseWhatsOnFilterQuery({ regions: 'kelowna', when: 'today' }), { regions: ['kelowna'], categories: [] }, 'the shell-era parser is unchanged');
});

test('S6 #14-#18/#23: with fixture inventory the page is indexable and real events map into the approved card shape', async () => {
  const today = app.todayLocal();
  const d1 = app.addLocalDays(today, 3);
  const d2 = app.addLocalDays(today, 10);
  s6create({ name: 'S6 Lakeside Concert', categories: ['live-music', 'food-drink-events'], image_url: '/images/whats-on/live-music.webp', website: 'https://example.com/tickets', occurrences: [{ start_date: d1, start_time: '19:00' }] });
  s6create({ name: 'S6 Vernon Market', region: 'vernon', venue_name_text: 'Kal Tire Place lot', categories: ['markets-fairs', 'community-events'], occurrences: [{ start_date: d2, start_time: '08:00', end_time: '13:00' }] });
  s6create({ name: 'S6 Osoyoos Pumpkin Patch', region: 'osoyoos', venue_name_text: 'Desert Farm', categories: ['family-kids', 'holiday-seasonal'], occurrences: [{ start_date: d1, end_date: d2, all_day: 1 }] });
  s6create({ name: 'S6 Wine Festival', venue_name_text: undefined, valley_wide: 1, categories: ['wineries-wine-events', 'events-festivals'], occurrences: [{ start_date: d2, end_date: app.addLocalDays(d2, 5), all_day: 1 }] });
  s6create({ name: 'S6 Far Future Gala', categories: ['nightlife'], occurrences: [{ start_date: '2033-03-05', start_time: '20:30' }] });
  assert.equal(app.whatsOnInventoryExists(), true);
  const { text } = await s6get('/whats-on');
  const markup = s6markup(text);
  assert.doesNotMatch(text, /<meta name="robots" content="noindex">/, 'indexable once inventory exists');
  assert.match(text, /rel="canonical" href="https:\/\/okanaganroam\.com\/whats-on"/, 'canonical stays the bare page URL');
  assert.match(text, /var INVENTORY = true;/);
  assert.match(markup, /<div class="whatson-empty" id="whatsOnEmptyInventory" hidden>/);
  assert.match(markup, /id="whatsOnShowResults">Show all results</);
  const cards = s6cards(text);
  assert.deepEqual(cards.map((c) => c.region), ['osoyoos', 'kelowna', 'kelowna', 'vernon'], 'default window (next 30 days) lists the four near events ordered by first occurrence (all-day first on a day); the 2033 gala is outside it');
  assert.match(markup, /aria-live="polite">4 events<\/p>/);
  const lakeside = markup.match(/<li class="venue-card whatson-event-card"[^>]*data-venue-name="S6 Lakeside Concert"[\s\S]*?<\/li>/)[0];
  assert.match(lakeside, /<h2><a class="venue-card-link" href="\/kelowna\/events\/s6-lakeside-concert"><span class="venue-card-name">S6 Lakeside Concert<\/span><span class="venue-card-cue" aria-hidden="true">View details &rarr;<\/span><\/a><\/h2>/, 'canonical detail URL, single link');
  assert.equal((lakeside.match(/<a /g) || []).length, 1);
  assert.match(lakeside, new RegExp(`<p class="venue-meta">Kelowna &middot; ${app.formatLocalDateShort(d1)} · 7 pm</p>`), 'region · date · time from the stored occurrence');
  assert.match(lakeside, /<img class="whatson-event-img" src="\/images\/whats-on\/live-music\.webp"/);
  assert.match(lakeside, /<span class="badge-chip whatson-category-chip">Live Music<\/span> <span class="badge-chip whatson-category-chip">Food &amp; Drink Events<\/span>/);
  assert.match(lakeside, /<div class="golf-desc" id="golf-desc-event-\d+"><p>Step 6 fixture description\./);
  assert.match(lakeside, /class="card-action fav-btn" data-fav-name="S6 Lakeside Concert"/);
  assert.match(lakeside, /class="card-action trip-btn" data-trip-name="S6 Lakeside Concert" data-trip-query="S6 Lakeside Concert, Kelowna, Okanagan Valley, BC" data-trip-region="kelowna"/);
  assert.doesNotMatch(lakeside, /example\.com|tel:|Visit Website/, 'no website/phone on the card');
  const pumpkin = markup.match(/<li class="venue-card whatson-event-card"[^>]*data-venue-name="S6 Osoyoos Pumpkin Patch"[\s\S]*?<\/li>/)[0];
  assert.match(pumpkin, new RegExp(`Osoyoos &middot; ${app.formatLocalDateShort(d1, { weekday: false })} – ${app.formatLocalDateShort(d2, { weekday: false })}</p>`), 'all-day span: dates only, no time');
  assert.doesNotMatch(pumpkin, /whatson-event-img/, 'no image -> no img tag');
  const festival = cards.find((c) => c.valley);
  assert.ok(festival, 'valley-wide card carries the flag for the client filter');
  assert.doesNotMatch(text, /source_url|event_confidence|batch_id|test-fixture-admin-token|\/api\/events/, 'no admin metadata, token or API references in the page');
});

test('S6 #2-#8: the date step renders in the reserved slot; presets and custom ranges drive the server window exactly like the API', async () => {
  const today = app.todayLocal();
  const { text } = await s6get('/whats-on');
  const markup = s6markup(text);
  const order = ['id="whatsOnCategoriesHeading">Choose Category(s)</h2>', 'data-filter="category"', 'id="whatsOnDatesHeading">When are you visiting?</h2>', 'data-filter="date"', 'id="whatsOnShowResults"', 'id="whatsOnResultsTop">Results</h2>'];
  let pos = -1; for (const m of order) { const i = markup.indexOf(m); assert.ok(i > pos, `slot order: ${m}`); pos = i; }
  for (const key of ['today', 'this-weekend', 'this-week', 'this-month']) assert.match(markup, new RegExp(`<a class="outdoor-filter-chip whatson-date-chip" href="/whats-on\\?when=${key}" data-when="${key}" aria-pressed="false">`));
  assert.match(markup, /id="whatsOnCustomToggle" data-when="custom" aria-pressed="false" aria-expanded="false"/);
  assert.match(markup, /<form class="whatson-custom-dates" id="whatsOnCustomDates" method="get" action="\/whats-on" hidden>/);
  assert.match(markup, /<input type="date" name="from" id="whatsOnFrom" value="" required>/);
  assert.match(markup, new RegExp(`Showing the next 30 days: ${app.formatLocalDateShort(today, { weekday: false })} – ${app.formatLocalDateShort(app.addLocalDays(today, 30), { weekday: false })}`));
  assert.match(text, /var DATE = \{"when":"","from":"","to":""\};/);
  for (const when of ['today', 'this-weekend', 'this-week', 'this-month']) {
    const win = app.dateWindowForPreset(when, today);
    const page = s6markup((await s6get(`/whats-on?when=${when}`)).text);
    assert.match(page, new RegExp(`data-when="${when}" aria-pressed="true"`), `${when} chip pressed`);
    assert.match(page, /id="whatsOnDateStatus">1 selected</);
    const expectedNames = app.queryWhatsOnEvents({ from: win.from, to: win.to }).map((e) => e.name);
    const shown = [...page.matchAll(/data-venue-name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(shown, expectedNames, `${when} renders exactly the API window's events`);
  }
  const custom = (await s6get('/whats-on?when=custom&from=2033-03-01&to=2033-03-31')).text;
  const cm = s6markup(custom);
  assert.match(cm, /id="whatsOnCustomToggle" data-when="custom" aria-pressed="true" aria-expanded="true"/);
  assert.match(cm, /<form class="whatson-custom-dates" id="whatsOnCustomDates" method="get" action="\/whats-on">/, 'form open for a custom window');
  assert.match(cm, /id="whatsOnFrom" value="2033-03-01"/); assert.match(cm, /id="whatsOnTo" value="2033-03-31"/);
  assert.deepEqual([...cm.matchAll(/data-venue-name="([^"]+)"/g)].map((m) => m[1]), ['S6 Far Future Gala']);
  assert.match(custom, /var DATE = \{"when":"custom","from":"2033-03-01","to":"2033-03-31"\};/);
  const bare = s6markup((await s6get('/whats-on?from=2033-03-01&to=2033-03-31')).text);
  assert.deepEqual([...bare.matchAll(/data-venue-name="([^"]+)"/g)].map((m) => m[1]), ['S6 Far Future Gala'], 'bare from/to works like the API');
  for (const q of ['when=custom&from=2033-03-31&to=2033-03-01', 'when=custom&from=2033-02-30&to=2033-03-01', 'when=custom&from=2033-01-01&to=2034-01-03', 'when=custom&from=x&to=y']) {
    const fb = s6markup((await s6get(`/whats-on?${q}`)).text);
    assert.match(fb, /class="whatson-date-note" role="status">Those dates weren’t a valid range/, q);
    assert.match(fb, /Showing the next 30 days:/, `${q} -> default window`);
    assert.match(fb, /aria-live="polite">4 events<\/p>/, `${q} -> default window results`);
  }
  const okMax = s6markup((await s6get('/whats-on?when=custom&from=2033-01-01&to=2034-01-02')).text);
  assert.doesNotMatch(okMax, /class="whatson-date-note"/, 'exactly 366 days is accepted');
});

test('S6 #9-#11/#21: region/category multi-select and no-match state over the rendered window', async () => {
  const both = s6markup((await s6get('/whats-on?regions=kelowna,vernon&categories=live-music,markets-fairs')).text);
  assert.match(both, /data-region="kelowna" aria-pressed="true"/); assert.match(both, /data-region="vernon" aria-pressed="true"/);
  assert.match(both, /data-category="live-music" aria-pressed="true"/); assert.match(both, /data-category="markets-fairs" aria-pressed="true"/);
  assert.match(both, /aria-live="polite">2 of 4 events<\/p>/, 'regions OR, categories OR, AND between');
  assert.match(both, /id="whatsOnShowResults">Show 2 results</);
  assert.match(both, /id="whatsOnClearFilters">Clear all</);
  const regionOnly = s6markup((await s6get('/whats-on?regions=peachland')).text);
  assert.match(regionOnly, /aria-live="polite">1 of 4 events<\/p>/, 'valley-wide festival matches a region with nothing else');
  assert.match(regionOnly, /data-region="peachland" aria-pressed="true">Peachland<span class="outdoor-activity-count">1<\/span>/, 'region chip counts include valley-wide rows');
  const noMatch = s6markup((await s6get('/whats-on?regions=vernon&categories=nightlife')).text);
  assert.match(noMatch, /aria-live="polite">0 of 4 events<\/p>/);
  assert.match(noMatch, /<p class="outdoor-no-results" id="whatsOnNoResults">No events match that combination yet\./, 'no-match state, not the empty-inventory state');
  assert.match(noMatch, /<div class="whatson-empty" id="whatsOnEmptyInventory" hidden>/);
  assert.match(noMatch, /<ul class="card-grid" id="whatsOnResults" hidden>/);
  assert.equal((noMatch.match(/<li class="venue-card whatson-event-card" hidden/g) || []).length, 4, 'all four window cards are rendered hidden, so unselecting a chip can reveal them client-side');
  assert.equal((both.match(/<li class="venue-card whatson-event-card" hidden/g) || []).length, 2, 'pre-filtered render: 2 shown, 2 hidden');
});

test('S6 #12/#13/#19: the client script keeps the date window on chip pushState, reloads on Back/Forward date changes, clears all, and keeps Favorite/Add to Trip wiring', () => {
  const script = app.renderWhatsOnFilterScriptHtml({ hasInventory: true, dateState: { when: 'this-week', from: '', to: '' } });
  for (const needle of [
    "var DATE = {\"when\":\"this-week\",\"from\":\"\",\"to\":\"\"};",
    "if (d.when) q.push('when=' + encodeURIComponent(d.when));",
    "if (d.when === 'custom') { if (d.from) q.push('from=' + encodeURIComponent(d.from)); if (d.to) q.push('to=' + encodeURIComponent(d.to)); }",
    "window.addEventListener('popstate'",
    "if (d.when !== DATE.when || d.from !== DATE.from || d.to !== DATE.to) { window.location.reload(); return; }",
    "readUrlIntoChips(); openGroupsForSelection(); apply('none');",
    "function clearAll(){ chips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); apply('push'); }",
    "filter(function(c){ return !c.hasAttribute('data-when'); })",
    "querySelectorAll('a[data-when]')",
    "customForm.addEventListener('submit'",
    "cardMatches(d, regions, categories)",
    "(d.valley ? allRegionKeys : [d.region])",
    "emptyInventory.hidden = INVENTORY;",
    "empty.hidden = !(INVENTORY && shown === 0);",
    app.OUTDOOR_FILTER_CLIENT_PREDICATE_SRC,
  ]) assert.ok(script.includes(needle), `script contains ${needle}`);
  const page = app.renderWhatsOnPage(app.parseWhatsOnPageQuery({ when: 'this-week' }));
  assert.match(page, /<script src="\/scripts\/app\.js"><\/script>/, 'app.js (homepage favourites/trip modules) still loads');
  assert.match(page, /data-venue-category="whatson"/, 'cards carry the holder attribute the shared fav/trip module keys off');
  assert.match(page, /var INVENTORY = true;/);
});

test('S6 #24/#25: no token or admin surface in the page; the shell-era markup is unchanged apart from the data now flowing through it', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const page = (await s6get('/whats-on?when=today')).text;
  assert.doesNotMatch(page, /test-fixture-admin-token|ENRICHMENT_ADMIN_TOKEN|Authorization|\/api\/events/);
  assert.ok(!/fetch\(['"`]\/api\/events/.test(src.slice(src.indexOf('function renderWhatsOnFilterScriptHtml'), src.indexOf('function renderWhatsOnPage'))), 'the page is server-rendered; no browser-side API fetch');
  // Structural markers of the approved shell are all still present, in order.
  const markup = s6markup(page);
  const order = ['<body class="golf-page outdoor-page whatson-page">', '<p class="outdoor-intro">', 'id="whatsOnRegionsHeading">Choose Region(s)</h2>', 'data-filter="region"', 'id="whatsOnCategoriesHeading">Choose Category(s)</h2>', 'data-filter="category"', 'id="whatsOnShowResults"', 'id="whatsOnClearFilters"', 'id="whatsOnResultsTop">Results</h2>', 'id="whatsOnResultsSummary"', 'id="whatsOnSelected"', 'id="whatsOnEmptyInventory"', 'id="whatsOnNoResults"', 'id="whatsOnResults"', '<footer class="home-footer"'];
  let pos = -1; for (const m of order) { const i = markup.indexOf(m); assert.ok(i > pos, `order: ${m}`); pos = i; }
  assert.equal((markup.match(/class="outdoor-filter-chip" data-region="/g) || []).length, 20, 'all 20 region chips');
  assert.deepEqual([...markup.matchAll(/data-category="([a-z-]+)" aria-pressed="false"/g)].map((m) => m[1]), app.WHATSON_CATEGORIES.map((c) => c.key), 'twelve tiles in the approved order');
});

test('S6 cleanup: remove every Step 6 fixture event', () => {
  const ids = db.prepare("SELECT id FROM events WHERE name LIKE 'S6 %'").all().map((r) => r.id);
  for (const id of ids) {
    db.prepare('DELETE FROM event_enrichment_log WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM event_occurrences WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE name LIKE 'S6 %'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_occurrences').get().n, 5);
});

// ---- Event page rendering + SEO (noindex) --------------------------------
test('renderEventPage renders the event name as H1 and a correct canonical', () => {
  const event = app.findEventBySlug('kelowna', 'test-future-festival');
  const html = app.renderEventPage(event, testVenue);
  assert.match(html, /<h1>Test Future Festival<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/events\/test-future-festival"/);
  assert.match(html, /"@type":"Event"/);
});

test('renderEventPage does NOT add noindex for an active event', () => {
  const event = app.findEventBySlug('kelowna', 'test-future-festival');
  const html = app.renderEventPage(event, testVenue);
  assert.doesNotMatch(html, /name="robots" content="noindex"/);
});

test('renderEventPage DOES add noindex for an expired event, while still rendering fully', () => {
  const event = app.findEventBySlug('kelowna', 'test-past-market');
  const html = app.renderEventPage(event, null);
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /<h1>Test Past Market<\/h1>/, 'expired event page must still fully render, not be blanked');
});

test('renderEventPage shows the recurrence rule when present', () => {
  const event = app.findEventBySlug('kelowna', 'test-weekly-market');
  const html = app.renderEventPage(event, null);
  assert.match(html, /weekly on Saturdays/);
});

test('renderEventPage links to the host venue when venue_id is set', () => {
  const event = app.findEventBySlug('kelowna', 'test-future-festival');
  const html = app.renderEventPage(event, testVenue);
  assert.match(html, new RegExp(`href="/kelowna/${app.CATEGORY_SLUGS.restaurant}/test-trattoria"`));
});

// ---- /events index (2026-09-17, replaces the homepage's Happening Soon) --

test('eventCardHtml links to the real individual event page and shows its date/region', () => {
  const event = app.findEventBySlug('kelowna', 'test-future-festival');
  const html = app.eventCardHtml(event);
  assert.match(html, /href="\/kelowna\/events\/test-future-festival"/);
  assert.match(html, /Test Future Festival/);
  assert.match(html, /Kelowna/);
});

test('renderEventsIndexPage lists every event it is given, each linking to its real page', () => {
  const events = [app.findEventBySlug('kelowna', 'test-future-festival')];
  const html = app.renderEventsIndexPage(events);
  assert.match(html, /<h1>Upcoming Events in the Okanagan<\/h1>/);
  assert.match(html, /Test Future Festival/);
  assert.match(html, /href="\/kelowna\/events\/test-future-festival"/);
});

test('renderEventsIndexPage shows a graceful empty state with zero events', () => {
  const html = app.renderEventsIndexPage([]);
  assert.match(html, /No upcoming events right now/);
});

// ---- pageHead() backward-compatibility + noindex regression -------------
test('pageHead is backward-compatible: existing 4-argument call sites are unaffected', () => {
  const html = app.pageHead('Title', 'Description', 'https://okanaganroam.com/kelowna', []);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna"/);
  assert.doesNotMatch(html, /name="robots" content="noindex"/);
});

test('pageHead only adds noindex when explicitly requested via opts', () => {
  const withNoindex = app.pageHead('Title', 'Description', 'https://okanaganroam.com/x', [], { noindex: true });
  const withoutNoindex = app.pageHead('Title', 'Description', 'https://okanaganroam.com/x', [], { noindex: false });
  assert.match(withNoindex, /name="robots" content="noindex"/);
  assert.doesNotMatch(withoutNoindex, /name="robots" content="noindex"/);
});

test('REGRESSION: existing venue/category/region/guide pages retain unchanged canonical and no noindex', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const venueHtml = app.renderVenuePage(venue, [], [], []);
  assert.match(venueHtml, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/restaurant/);
  assert.doesNotMatch(venueHtml, /name="robots" content="noindex"/);

  const rows = app.getVenuesByRegionCategory('kelowna', 'restaurant');
  const categoryHtml = app.renderCategoryPage('kelowna', 'restaurant', rows, []);
  assert.match(categoryHtml, /rel="canonical"/);
  assert.doesNotMatch(categoryHtml, /name="robots" content="noindex"/);

  const counts = app.getRegionCategoryCounts('kelowna');
  const regionHtml = app.renderRegionPage('kelowna', counts, []);
  assert.match(regionHtml, /rel="canonical"/);
  assert.doesNotMatch(regionHtml, /name="robots" content="noindex"/);
});

// ---- Canonical footer consolidation (2026-09-19) -----------------------
// Every normal public page must now render the SAME approved home-footer
// markup (via renderHomeFooterHTML(true)) instead of the old minimal
// siteFooter() one-liner, and must load renderCanonicalFooterStyles()'s
// rules somewhere in its own <style>/CSS so that markup actually renders
// styled, not just present.
test('Canonical footer: venue/category/region/guide/event/events-index pages all render the approved home-footer, not the old siteFooter() one-liner', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const venueHtml = app.renderVenuePage(venue, [], [], []);

  const rows = app.getVenuesByRegionCategory('kelowna', 'restaurant');
  const categoryHtml = app.renderCategoryPage('kelowna', 'restaurant', rows, []);

  const counts = app.getRegionCategoryCounts('kelowna');
  const regionHtml = app.renderRegionPage('kelowna', counts, []);

  const guideHtml = app.renderGuidePage('kelowna', 'dog_friendly', [venue]);

  const event = { id: 99901, name: 'Canonical Footer Test Event', slug: 'canonical-footer-test-event', region: 'kelowna', description: 'x', start_datetime: '2099-01-01 00:00:00', end_datetime: null, recurrence_rule: null, venue_id: null, website: null, image_url: null };
  const eventHtml = app.renderEventPage(event, null);
  const eventsIndexHtml = app.renderEventsIndexPage([event]);

  for (const [label, html] of [
    ['venue', venueHtml], ['category', categoryHtml], ['region', regionHtml],
    ['guide', guideHtml], ['event', eventHtml], ['events index', eventsIndexHtml],
  ]) {
    assert.match(html, /<footer class="home-footer">/, `${label} page must render the approved home-footer`);
    assert.doesNotMatch(html, /class="site-footer"/, `${label} page must NOT render the old siteFooter() one-liner`);
    assert.match(html, /home-footer-region-subcol/, `${label} page's footer must include the two Regions subcolumns`);
    // The markup alone rendering isn't enough (this was exactly /trip's old
    // bug) -- the page's own CSS must actually include the shared ruleset,
    // not just the HTML.
    assert.match(html, /\.home-footer \{[\s\S]{0,80}background: var\(--ref-navy\)/, `${label} page must load the canonical footer CSS, not just the markup`);
  }
});

// ---- Full HTTP integration test (real routing dispatch table) ---------
// Exercises the actual regex-based route matching in server.js end to
// end — distinct from the render-function-level tests above, which skip
// routing entirely. Binds the real server (module-level PORT, default
// 3001, since no PORT env var is set in this environment) exactly once
// for this whole file.
test('HTTP routes: region, category, venue, guide, and 404 all respond correctly', async () => {
  app.startServer();
  const base = 'http://localhost:3001';

  const region = await fetch(`${base}/kelowna`);
  assert.equal(region.status, 200);
  assert.match(await region.text(), /Kelowna/);

  const category = await fetch(`${base}/kelowna/restaurants`);
  assert.equal(category.status, 200);
  assert.match(await category.text(), /Test Trattoria/);

  const venuePage = await fetch(`${base}/kelowna/restaurants/test-trattoria`);
  assert.equal(venuePage.status, 200);
  assert.match(await venuePage.text(), /<h1>Test Trattoria<\/h1>/);

  const notFound = await fetch(`${base}/this-region-does-not-exist`);
  assert.equal(notFound.status, 404);

  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap:/);

  // Phase 1 (Events architecture gate) — route dispatch
  const activeEventPage = await fetch(`${base}/kelowna/events/test-future-festival`);
  assert.equal(activeEventPage.status, 200, 'active event route must resolve');
  const activeEventBody = await activeEventPage.text();
  assert.match(activeEventBody, /<h1>Test Future Festival<\/h1>/);
  assert.doesNotMatch(activeEventBody, /name="robots" content="noindex"/, 'active event must not be noindexed');

  const expiredEventPage = await fetch(`${base}/kelowna/events/test-past-market`);
  assert.equal(expiredEventPage.status, 200, 'expired event route must still resolve (200), not 404');
  const expiredEventBody = await expiredEventPage.text();
  assert.match(expiredEventBody, /<h1>Test Past Market<\/h1>/);
  assert.match(expiredEventBody, /name="robots" content="noindex"/, 'expired event must be noindexed');

  const nonexistentEventPage = await fetch(`${base}/kelowna/events/does-not-exist`);
  assert.equal(nonexistentEventPage.status, 404, 'nonexistent event must 404');

  // Confirm the events route does not accidentally shadow the pre-existing
  // generic venue-page route (both share a /segment/segment/segment shape).
  const stillWorksVenuePage = await fetch(`${base}/kelowna/restaurants/test-trattoria`);
  assert.equal(stillWorksVenuePage.status, 200, 'existing venue route must be unaffected by the new events route');

  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  const sitemapBody = await sitemap.text();
  assert.match(sitemapBody, /<urlset/);
  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/<\/loc>/);

  // Phase 1 (Events architecture gate) — sitemap inclusion/exclusion
  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/kelowna\/events\/test-future-festival<\/loc>/, 'active event must appear in the sitemap');
  assert.doesNotMatch(sitemapBody, /kelowna\/events\/test-past-market/, 'expired event must NOT appear in the sitemap');

  // Existing venue sitemap entries must be unaffected by the Events addition.
  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/kelowna\/restaurants\/test-trattoria<\/loc>/, 'existing venue sitemap entry must be unchanged');

  // Phase 2 Sprint 1 (Golf) — route dispatch and sitemap inclusion
  const golfCategoryPage = await fetch(`${base}/kelowna/golf`);
  assert.equal(golfCategoryPage.status, 200, 'golf category route must resolve');
  const golfCategoryBody = await golfCategoryPage.text();
  assert.match(golfCategoryBody, /Test Golf Course/);

  const golfVenuePage = await fetch(`${base}/kelowna/golf/test-golf-course`);
  assert.equal(golfVenuePage.status, 200, 'golf venue route must resolve');
  const golfVenueBody = await golfVenuePage.text();
  assert.match(golfVenueBody, /<h1>Test Golf Course<\/h1>/);

  // Individual-venue back-link to the venue's regional Golf page
  // (2026-09-19 bug fix): built from the venue's own region field, must
  // read "← Kelowna Golf" here and the equivalent for any other region.
  assert.match(golfVenueBody, /<a class="category-back-link" href="\/kelowna\/golf">← Kelowna Golf<\/a>/, 'a golf venue page must show a back-link to its own region\'s Golf page');

  const vernonGolfVenuePage = await fetch(`${base}/vernon/golf/test-vernon-golf-course`);
  assert.equal(vernonGolfVenuePage.status, 200);
  assert.match(await vernonGolfVenuePage.text(), /<a class="category-back-link" href="\/vernon\/golf">← Vernon Golf<\/a>/, 'the back-link label/href must be derived from the venue\'s own region, not hardcoded');

  // Website URL normalization (2026-09-19 bug fix): a bare domain like
  // "shannonlakegolf.com" must become an absolute https:// link, not a
  // broken relative path such as "/west-kelowna/golf/shannonlakegolf.com".
  const websiteGolfVenuePage = await fetch(`${base}/west-kelowna/golf/test-west-kelowna-golf-course`);
  assert.equal(websiteGolfVenuePage.status, 200);
  const websiteGolfVenueBody = await websiteGolfVenuePage.text();
  assert.match(websiteGolfVenueBody, /<a class="category-back-link" href="\/west-kelowna\/golf">← West Kelowna Golf<\/a>/);
  assert.match(websiteGolfVenueBody, /href="https:\/\/shannonlakegolf\.com\/" rel="nofollow noopener"/, 'a bare-domain website must render as an absolute https:// link');
  assert.doesNotMatch(websiteGolfVenueBody, /href="shannonlakegolf\.com"/, 'the bare domain must never be used as-is as an href (it would resolve as a relative path)');

  // Non-golf venue pages must not show the new back-link.
  const trattoriaVenuePage = await fetch(`${base}/kelowna/restaurants/test-trattoria`);
  assert.doesNotMatch(await trattoriaVenuePage.text(), /<a class="category-back-link"/, 'a non-golf venue page must not render the Golf back-link');

  // Okanagan-wide /golf listing (2026-09-19): must aggregate across every
  // region's golf venues, not just one -- the whole point of this route.
  const golfAllRegionsPage = await fetch(`${base}/golf`);
  assert.equal(golfAllRegionsPage.status, 200, '/golf (Okanagan-wide) route must resolve');
  const golfAllRegionsBody = await golfAllRegionsPage.text();
  assert.match(golfAllRegionsBody, /Test Golf Course/, '/golf must include the Kelowna fixture');
  assert.match(golfAllRegionsBody, /Test Vernon Golf Course/, '/golf must include the Vernon fixture -- proving it is NOT region-scoped');
  assert.match(golfAllRegionsBody, /href="\/kelowna\/golf\/test-golf-course"/, "each card must link using that venue's OWN region");
  assert.match(golfAllRegionsBody, /href="\/vernon\/golf\/test-vernon-golf-course"/, "each card must link using that venue's OWN region");
  assert.doesNotMatch(golfAllRegionsBody, /Test Trattoria|Test Winery/, '/golf must not include non-golf venues');

  // Reusable region-selector (2026-09-19): built from the regions actually
  // present, not a hardcoded list -- must show exactly Kelowna and Vernon
  // (the two regions the golf fixtures are in), each linking to that
  // region's EXISTING single-region page, and nothing else.
  assert.match(golfAllRegionsBody, /class="category-region-selector"/, '/golf must render the shared region selector');
  assert.match(golfAllRegionsBody, /<a href="\/kelowna\/golf">Kelowna<\/a>/, 'selector must link to the existing /kelowna/golf page');
  assert.match(golfAllRegionsBody, /<a href="\/vernon\/golf">Vernon<\/a>/, 'selector must link to the existing /vernon/golf page');
  assert.doesNotMatch(golfAllRegionsBody, /<a href="\/osoyoos\/golf">/, 'selector must NOT list a region with zero golf venues in this fixture set');

  // Back-link to the Okanagan-wide page (2026-09-19): only categories in
  // ALL_REGIONS_CATEGORIES render it, since it's the only case where a
  // wide page exists to link back to.
  assert.match(golfCategoryBody, /<a class="category-back-link" href="\/golf">← All Golf<\/a>/, '/kelowna/golf must show a back-link to /golf');

  // Golf Courses vs. Indoor Golf & Simulators split (2026-09-19): driven
  // entirely by the existing description text ("simulator"/"indoor golf"),
  // no new DB column. Must apply on both the single-region page and the
  // Okanagan-wide page, and must correctly bucket each fixture.
  assert.match(golfCategoryBody, /<h2 class="category-subsection-heading">Kelowna Golf Courses<\/h2>/, '/kelowna/golf must show a region-prefixed Golf Courses heading');
  assert.match(golfCategoryBody, /<h2 class="category-subsection-heading">Kelowna Indoor Golf &amp; Simulators<\/h2>/, '/kelowna/golf must show a region-prefixed Indoor Golf & Simulators heading');
  assert.match(golfCategoryBody, /Test Golf Simulator/, '/kelowna/golf must include the simulator fixture');
  const [coursesSectionBody, indoorSectionBody] = golfCategoryBody.split('Kelowna Indoor Golf &amp; Simulators');
  assert.match(coursesSectionBody, /Test Golf Course/, 'Test Golf Course (an outdoor course) must be in the Golf Courses section');
  assert.doesNotMatch(coursesSectionBody, /Test Golf Simulator/, 'Test Golf Simulator must NOT be in the Golf Courses section');
  assert.match(indoorSectionBody, /Test Golf Simulator/, 'Test Golf Simulator must be in the Indoor Golf & Simulators section');

  assert.match(golfAllRegionsBody, /<h2 class="category-subsection-heading">Golf Courses<\/h2>/, '/golf must show an un-prefixed Golf Courses heading');
  assert.match(golfAllRegionsBody, /<h2 class="category-subsection-heading">Indoor Golf &amp; Simulators<\/h2>/, '/golf must show an un-prefixed Indoor Golf & Simulators heading');
  assert.match(golfAllRegionsBody, /Test Golf Simulator/, '/golf must include the simulator fixture across regions too');

  // Non-golf categories must be completely unaffected by either the
  // back-link or the split-section rendering.
  const wineryPage = await fetch(`${base}/kelowna/wineries`);
  const wineryBody = await wineryPage.text();
  assert.doesNotMatch(wineryBody, /<a class="category-back-link"/, 'non-golf category pages must not render a back-link');
  assert.doesNotMatch(wineryBody, /<h2 class="category-subsection-heading">/, 'non-golf category pages must not render the Golf/Indoor split');

  // Reusable-architecture allowlist (2026-09-19): a real, valid category
  // slug that is NOT in ALL_REGIONS_CATEGORIES must NOT get an Okanagan-
  // wide page just because the route was generalized -- generalizing the
  // route must not silently expose a new public URL for every existing
  // category.
  const wineriesAllRegionsPage = await fetch(`${base}/wineries`);
  assert.equal(wineriesAllRegionsPage.status, 404, '/wineries must stay 404 -- only categories explicitly listed in ALL_REGIONS_CATEGORIES get an Okanagan-wide page');

  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/kelowna\/golf<\/loc>/, 'golf category must appear in the sitemap');
  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/kelowna\/golf\/test-golf-course<\/loc>/, 'golf venue must appear in the sitemap');

  const tokensCss = await fetch(`${base}/styles/tokens.css`);
  assert.equal(tokensCss.status, 200, 'shared tokens.css must be served');
  assert.match(await tokensCss.text(), /--teal/);

  const appCss = await fetch(`${base}/styles/app.css`);
  assert.equal(appCss.status, 200, 'shared app.css must be served');

  const appJs = await fetch(`${base}/scripts/app.js`);
  assert.equal(appJs.status, 200, 'extracted app.js must be served');

  // Design Sprint 4 (Visual & Editorial Polish) — folded into this same
  // start/close cycle, since a second cycle in this test file has been
  // observed to make this same test's own later fetch calls fail.
  const homepage = await fetch(`${base}/`);
  assert.equal(homepage.status, 200);
  const homepageBody = await homepage.text();
  assert.match(homepageBody, /id="hiddenGems"/);
  assert.match(homepageBody, /id="exploreRegions"/);
  // Architecture change (2026-09-17): the homepage no longer renders the
  // old directory UI at all (not CSS-hidden -- genuinely absent from the
  // response). The wizard, its results grid/map, the "list your venue"
  // form, and the app teaser all moved to /browse, verified separately
  // below, without deleting any route, data, or functionality.
  assert.doesNotMatch(homepageBody, /id="directory"/, 'the wizard must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /class="results"/, 'the results grid/map must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /id="mapPanel"/, 'the interactive map must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /id="list-venue"/, 'the "list your venue" form must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /id="app"/, 'the app teaser must no longer render on the homepage');
  // Reference redesign (critical rule): Browse by Category, the old Weather
  // banner, Spotlight banner, and Featured Venues strip are no longer part
  // of the homepage at all -- they don't get stacked underneath the new
  // design. renderExploreByCategoryHTML() itself is untouched and still
  // independently callable/tested above; it's simply not spliced in here.
  assert.doesNotMatch(homepageBody, /id="exploreByCategory"/, 'Browse by Category must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /id="weatherBanner"/, 'old Weather banner must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /id="spotlightBanner"/, 'old Spotlight banner must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /class="featured-venues"/, 'old Featured Venues strip must no longer render on the homepage');

  // Milestone 1 (approved homepage redesign) — the old "Worth the Drive"
  // carousel is intentionally replaced by a scenic hero + a new "What are
  // you in the mood for?" section, both ahead of the wizard.
  assert.match(homepageBody, /class="hero-scenic"/, 'New scenic hero (Milestone 1) must render');
  assert.match(homepageBody, /id="moodCards"/, 'Mood cards section (Milestone 1) must render');
  assert.doesNotMatch(homepageBody, /class="hero">/, 'Old "Worth the Drive" hero carousel must be gone');

  // Elevator-pitch copy update (2026-09-17): the hero heading/layout/CSS
  // are unchanged -- only the supporting <p class="hero-lead"> subtitle
  // text changed, in both the static HTML and its TRANSLATIONS.en source
  // (the i18n script overwrites data-i18n elements' textContent from that
  // dictionary on load, so both had to change or the new copy would have
  // been clobbered at runtime).
  assert.match(homepageBody, /<h1 class="hero-title" data-i18n="hero\.headline">Explore the Okanagan<\/h1>/, 'hero heading must be unchanged');
  assert.match(homepageBody, /<p class="hero-lead hero-lead-full" data-i18n="hero\.lead">Okanagan Roam is your guide to the Okanagan Valley from Enderby to Osoyoos &mdash; including ski resorts, wineries, food, golf, beaches, events, adventures, and hidden gems, all in one place\.<\/p>/, 'hero subtitle must be the new elevator pitch');
  assert.doesNotMatch(homepageBody, /Find the places worth discovering/, 'old hero subtitle copy must be gone');

  // Reference redesign: rebuilt header (decisions #4/#5) — new logo,
  // dropdown nav, search icon, and the relocated "Build My Trip" CTA. The
  // old circular-badge logo/"App coming soon" nav text must be gone.
  assert.match(homepageBody, /logo-wordmark-accent/, 'new two-tone logo wordmark must render');
  assert.match(homepageBody, /class="nav-dropdown"/, 'header dropdown nav must render');
  assert.match(homepageBody, /id="navSearchBtn"/, 'header search icon must render');
  assert.match(homepageBody, /id="navTripBtn"/, 'header "Build My Trip" CTA must render');
  const headerHtml = homepageBody.slice(homepageBody.indexOf('<header'), homepageBody.indexOf('</header>'));
  assert.doesNotMatch(headerHtml, /viewBox="0 0 40 40"/, 'old circular-badge logo SVG must be gone from the header');
  assert.doesNotMatch(headerHtml, /App coming soon/, 'old "App coming soon" header nav CTA text must be gone (the footer keeps its own, unrelated "App coming soon" link)');

  // Localization fix (2026-09-17): the entire header previously had zero
  // data-i18n wiring. Spot-check the pieces most likely to regress.
  assert.match(headerHtml, /data-i18n-aria="nav\.homeAriaLabel"/, 'logo aria-label must be i18n-wired');
  assert.match(headerHtml, /<span data-i18n="nav\.discover">Discover<\/span>/, '"Discover" dropdown label must be i18n-wired');
  assert.match(headerHtml, /<span data-i18n="nav\.thingsToDo">Things to Do<\/span>/, '"Things to Do" dropdown label must be i18n-wired');
  assert.match(headerHtml, /<span data-i18n="mood\.foodDrink\.title">Food &amp; Drink<\/span>/, '"Food & Drink" dropdown label must reuse the mood card key');
  assert.match(headerHtml, /data-i18n="nav\.map">Map<\/a>/, '"Map" link must be i18n-wired');
  assert.match(headerHtml, /data-i18n-aria="search\.button"/, 'search icon aria-label must be i18n-wired');
  assert.match(headerHtml, /data-i18n-aria="nav\.switchLanguage"/, 'language toggle aria-label must be i18n-wired');
  assert.match(headerHtml, /<span data-i18n="trip\.buildMyTrip">Build My Trip<\/span>/, 'header "Build My Trip" CTA must reuse the shared trip.buildMyTrip key');
  assert.match(headerHtml, /data-i18n-aria="nav\.openMenu"/, 'mobile hamburger aria-label must be i18n-wired');

  // Milestone 2 (Hidden Gems editorial + Explore the Okanagan visual
  // destinations) — the redesigned Explore cards each reference a
  // placeholder region image; confirm the /images/* route actually serves
  // one of them (not just that the HTML references the path).
  const exploreRegionImg = await fetch(`${base}/images/regions/kelowna.webp`);
  assert.equal(exploreRegionImg.status, 200, 'Explore the Okanagan placeholder region image must be servable');
  assert.equal(exploreRegionImg.headers.get('content-type'), 'image/webp');

  // Milestone 3 (Build Your Perfect Okanagan Trip) — the approved
  // architecture's final homepage section order: Hero -> Mood -> Hidden
  // Gems -> Explore -> Build Trip -> footer. The old Browse/Search wizard
  // no longer renders on this page at all (verified above and via the
  // dedicated /browse checks below).
  assert.match(homepageBody, /id="buildTrip"/, 'Build Your Perfect Okanagan Trip section (Milestone 3) must render');
  const heroPos = homepageBody.indexOf('class="hero-scenic"');
  const moodPos = homepageBody.indexOf('id="moodCards"');
  const gemsPos = homepageBody.indexOf('id="hiddenGems"');
  const explorePos = homepageBody.indexOf('id="exploreRegions"');
  const tripPos = homepageBody.indexOf('id="buildTrip"');
  assert.ok(
    heroPos < moodPos && moodPos < gemsPos && gemsPos < explorePos && explorePos < tripPos,
    `expected Hero < Mood < Hidden Gems < Explore < Build Trip in page order, got positions ${JSON.stringify({ heroPos, moodPos, gemsPos, explorePos, tripPos })}`
  );
  // The homepage must end right after Build My Trip and the new
  // home-footer (2026-09-17 redesign, class="home-footer" -- distinct
  // from /browse's still-original plain <footer>, checked separately
  // below) -- nothing from the old directory stack follows it.
  const footerPos = homepageBody.indexOf('<footer class="home-footer">');
  assert.ok(footerPos !== -1, 'expected the new home-footer to render on the homepage');
  assert.ok(tripPos < footerPos, 'the footer must immediately follow Build My Trip, with nothing old in between');

  // Build My Trip, Stage 2 (2026-09-18): GET /trip serves the real planner
  // page, and the homepage's own Build Trip CTA section (checked just
  // above) is completely unaffected -- this route is additive.
  {
    const tripPageRes = await fetch(`${base}/trip`);
    assert.equal(tripPageRes.status, 200);
    const tripPageBody = await tripPageRes.text();
    assert.match(tripPageBody, /<form id="tripPlannerForm"/);
    assert.match(tripPageBody, /<header id="top">/, '/trip must reuse the real site header, not a bare one');
    assert.match(tripPageBody, /id="tripTrayToggle"/, '/trip must include the real, working trip tray');
    // The homepage's own CTA copy (frozen, checked above via id="buildTrip")
    // must still say exactly what it always has -- confirms the /trip route
    // addition didn't touch renderBuildTripCTAHTML() in any way.
    assert.match(homepageBody, /Tell us what you&rsquo;re looking for\. We&rsquo;ll help build your adventure\./);
  }

  // "Browse Okanagan Roam by guide" SEO crawl-links block (2026-09-17
  // visual fix): renderGuideFooterHTML() itself is untouched (still
  // returns '' when there aren't enough venues per region/badge to meet
  // MIN_GUIDE_VENUES -- true in this test's minimal fixture db, same as
  // before this change, not a regression), so this checks the WRAPPER
  // that's now unconditionally present on the homepage regardless of
  // that content, rather than the guide text itself (which only a
  // real/seeded db, like the actual production okanagan.db, produces).
  assert.match(homepageBody, /<div style="display:none">/, 'the guide-links footer must be wrapped in a display:none div on the homepage (present in source, hidden visually)');

  // Open Now button (2026-09-17): removed from the homepage only -- the
  // homepage has no .venue-card results to filter (only /browse does),
  // so SHOW_OPEN_NOW_BUTTON is compiled in as false there. The rest of
  // renderOpenNowScript() (MutationObserver, apply(), wizard-scroll
  // handling) is still present/harmless -- only button creation is
  // gated, checked separately below via /browse still getting `true`.
  assert.match(homepageBody, /var SHOW_OPEN_NOW_BUTTON = false;/, 'the homepage must compile Open Now button creation off');

  // Happening Soon (2026-09-17): removed from the homepage entirely, no
  // empty gap left behind -- events now live at their own destination,
  // /events, verified separately below.
  assert.doesNotMatch(homepageBody, /id="happeningSoon"/, 'Happening Soon must no longer render on the homepage');
  assert.doesNotMatch(homepageBody, /discover-section-compact/, 'the now-unused compact-section styling must be gone too');

  // Every homepage link that used to point at the now-removed #directory
  // wizard must instead lead into the real, existing directory at /browse
  // (or, where a real category page already exists for that mood card's
  // single venue type, straight to that category page -- see the Golf/
  // Wine mood-card tests above). No dangling in-page anchors left behind.
  assert.doesNotMatch(homepageBody, /href="#directory"/, 'no homepage link should still point at the removed #directory anchor');
  assert.match(homepageBody, /class="hidden-gem-card" href="\/browse"/, 'Hidden Gems editorial cards must link into the real directory at /browse');
  assert.match(homepageBody, /discover-heading-link" href="\/browse"[^>]*>View all hidden gems/, '"View all hidden gems" must link to /browse');
  assert.match(homepageBody, /discover-heading-link" href="\/browse"[^>]*>Explore all categories/, '"Explore all categories" must link to /browse');
  assert.match(homepageBody, /Browse &amp; Search<\/a>/, 'header dropdown "Browse & Search" label must still read the same');
  const headerBrowseLink = homepageBody.match(/<a href="([^"]*)"[^>]*>Browse &amp; Search<\/a>/);
  assert.ok(headerBrowseLink && headerBrowseLink[1] === '/browse', 'header "Browse & Search" link must point at /browse now that the wizard lives there');

  // ---- /browse: the relocated directory (wizard + results/map + list
  // your venue + app teaser). Same markup/IDs/data as before -- nothing
  // deleted or duplicated, just no longer spliced under the new homepage.
  const browsePage = await fetch(`${base}/browse`);
  assert.equal(browsePage.status, 200, '/browse must exist and serve the relocated directory');
  const browseBody = await browsePage.text();
  assert.match(browseBody, /id="directory"/, 'the wizard must render on /browse');
  assert.match(browseBody, /Browse (&amp;|&) [Ss]earch the Okanagan/, '/browse must keep the existing reframing heading');
  assert.match(browseBody, /id="searchInput"/, 'existing search input must be unchanged on /browse');
  assert.match(browseBody, /id="wizardStep1"/, 'existing wizard step markup must be unchanged on /browse');
  assert.match(browseBody, /class="results"/, 'the results grid/map must render on /browse');
  assert.match(browseBody, /id="mapPanel"/, 'the interactive map must render on /browse');
  assert.match(browseBody, /id="list-venue"/, 'the "list your venue" form must render on /browse');
  assert.match(browseBody, /id="app"/, 'the app teaser must render on /browse');
  assert.doesNotMatch(browseBody, /id="moodCards"/, '/browse must not duplicate the new homepage\'s mood cards');
  assert.doesNotMatch(browseBody, /id="hiddenGems"/, '/browse must not duplicate the new homepage\'s Hidden Gems section');
  assert.doesNotMatch(browseBody, /id="exploreRegions"/, '/browse must not duplicate the new homepage\'s Explore section');
  assert.doesNotMatch(browseBody, /id="buildTrip"/, '/browse must not duplicate the new homepage\'s Build My Trip section');
  assert.match(browseBody, /new URLSearchParams\(window\.location\.search\)/, '/browse must include the prefill script so homepage links (?q=, ?types=, ?openMap=) still work once they land here');
  // The homepage-only display:none wrapper (2026-09-17) must not leak onto
  // /browse -- its own guide-links footer (renderGuideFooterHTML(), called
  // directly and unwrapped in the /browse handler) stays fully visible.
  assert.doesNotMatch(browseBody, /<div style="display:none">/, '/browse must not wrap its guide-links footer -- that fix is homepage-only');
  assert.match(browseBody, /var SHOW_OPEN_NOW_BUTTON = true;/, '/browse must keep the real, functional Open Now button -- that removal is homepage-only');

  // ---- /events: the standalone events index (2026-09-17), replacing the
  // homepage's own removed Happening Soon strip. The What's On mood card
  // must link here instead of the old #happeningSoon anchor.
  assert.match(homepageBody, /class="mood-card mood-card-whats-on" href="\/events">/, 'What\'s On mood card must link to /events');
  const eventsIndexPage = await fetch(`${base}/events`);
  assert.equal(eventsIndexPage.status, 200, '/events must exist and serve the events index');
  const eventsIndexBody = await eventsIndexPage.text();
  assert.match(eventsIndexBody, /<h1>Upcoming Events in the Okanagan<\/h1>/);
  assert.match(eventsIndexBody, /Test Future Festival/, 'an active event fixture must be listed');
  assert.doesNotMatch(eventsIndexBody, /Test Past Market/, 'an expired event fixture must not be listed');
  assert.match(eventsIndexBody, /href="\/kelowna\/events\/test-future-festival"/, 'event cards must link to the real individual event page');

  // Individual event pages are completely untouched by this change.
  const eventPageStillWorks = await fetch(`${base}/kelowna/events/test-future-festival`);
  assert.equal(eventPageStillWorks.status, 200, 'individual event pages must still work after removing Happening Soon');

  const eventsApi = await fetch(`${base}/api/events`);
  const collectionsApi = await fetch(`${base}/api/collections`);
  assert.equal(eventsApi.status, 404, '/api/events must not exist');
  assert.equal(collectionsApi.status, 404, '/api/collections must not exist');

  const trattoriaPage = await fetch(`${base}/kelowna/restaurants/test-trattoria`);
  assert.equal(trattoriaPage.status, 200, 'existing venue route must still work');

  // ---- /admin/collection-membership (2026-09-19) -------------------------
  // Same single start/close cycle as every other admin route below.
  {
    const TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;
    const cmUrl = `${base}/admin/collection-membership`;
    const cmGolf = app.findVenueBySlug('vernon', 'golf', 'test-vernon-golf-course');
    const post = (body, token = TOKEN) => fetch(cmUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const good = { kind: 'local_favorite', venue_id: cmGolf.id, action: 'add', note: 'HTTP test note', reason: 'http test', batch_id: 'http-cm-batch' };

    assert.equal((await post(good, null)).status, 401, 'missing bearer token must be 401');
    assert.equal((await post(good, 'wrong-token')).status, 401, 'wrong bearer token must be 401');
    assert.equal((await post({ ...good, extra: 1 })).status, 400, 'unexpected key must be 400');
    assert.equal((await post({ ...good, kind: 'Hidden Gem' })).status, 400, 'malformed kind must be 400');
    assert.equal((await post({ ...good, venue_id: '12' })).status, 400, 'non-integer venue_id must be 400');
    assert.equal((await post({ ...good, action: 'toggle' })).status, 400, 'bad action must be 400');
    assert.equal((await post({ ...good, reason: '' })).status, 400, 'empty reason must be 400');
    assert.equal((await post({ ...good, batch_id: '' })).status, 400, 'empty batch_id must be 400');
    assert.equal((await post({ ...good, kind: 'roam_picks' })).status, 400, 'unknown collection kind must be 400');
    assert.equal((await post({ ...good, venue_id: 999999 })).status, 404, 'unknown venue must be 404');
    assert.equal((await post({ ...good, action: 'remove' })).status, 409, 'removing a non-member must be 409');

    const addRes = await post(good);
    assert.equal(addRes.status, 200, 'valid add must be 200');
    const addBody = await addRes.json();
    assert.deepEqual({ ok: addBody.ok, kind: addBody.kind, venue_id: addBody.venue_id, action: addBody.action }, { ok: true, kind: 'local_favorite', venue_id: cmGolf.id, action: 'add' });
    assert.equal(addBody.members, 1);
    assert.equal((await post(good)).status, 409, 'duplicate add must be 409');
    assert.ok(app.getCollectionVenueIds('local_favorite').has(cmGolf.id), 'membership visible through getCollectionVenueIds');

    const vernonGolfHttp = await (await fetch(`${base}/vernon/golf`)).text();
    assert.match(vernonGolfHttp, /<span class="chip local-favourite-badge">\u2665 Local Favourite<\/span>/, 'badge must render on the live /vernon/golf page');
    const venuePageHttp = await (await fetch(`${base}/vernon/golf/test-vernon-golf-course`)).text();
    assert.match(venuePageHttp, /local-favourite-badge/, 'badge must render on the live venue page');

    const rmRes = await post({ ...good, action: 'remove' });
    assert.equal(rmRes.status, 200, 'valid remove must be 200');
    assert.equal((await rmRes.json()).members, 0);
    assert.ok(!app.getCollectionVenueIds('local_favorite').has(cmGolf.id));
    const logRows = db.prepare("SELECT field_name, old_value, new_value, source, source_ref, batch_id FROM venue_enrichment_log WHERE venue_id = ? AND batch_id = 'http-cm-batch' ORDER BY id").all(cmGolf.id);
    assert.deepEqual(logRows, [
      { field_name: 'collection:local_favorite', old_value: 'absent', new_value: 'member', source: 'editorial_collection', source_ref: 'http test', batch_id: 'http-cm-batch' },
      { field_name: 'collection:local_favorite', old_value: 'member', new_value: 'absent', source: 'editorial_collection', source_ref: 'http test', batch_id: 'http-cm-batch' },
    ]);
  }

  // ---- /admin/correct-phone ---------------------------------------------
  // Folded into this same start/close cycle for the same reason as the
  // Design Sprint 4 block above: a second app.startServer()/server.close()
  // cycle in this file has been observed to make later fetch calls fail.
  const phoneFixture = app.findVenueBySlug('kelowna', 'restaurant', 'test-phone-fixture');
  const nullPhoneFixture = app.findVenueBySlug('kelowna', 'restaurant', 'test-null-phone-fixture');
  const populatedForNullCheckFixture = app.findVenueBySlug('kelowna', 'restaurant', 'test-populated-phone-for-null-check');
  const ADMIN_TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN;

  async function correctPhone(bodyObj, token = ADMIN_TOKEN) {
    const headers = { 'Content-Type': 'application/json' };
    if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/admin/correct-phone`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    });
    return { status: res.status, body: await res.json() };
  }

  // 401 — wrong bearer token, no write attempted.
  {
    const { status } = await correctPhone(
      { id: phoneFixture.id, expected_current_phone: '+1 250-555-0177', corrected_phone: '+1 250-555-9999', reason: 'test', batch_id: 'test-batch' },
      'wrong-token'
    );
    assert.equal(status, 401, 'wrong bearer token must be rejected');
  }

  // 400 — unexpected top-level key.
  {
    const { status, body } = await correctPhone({ id: phoneFixture.id, expected_current_phone: '+1 250-555-0177', corrected_phone: '+1 250-555-9999', reason: 'test', batch_id: 'test-batch', extra: 'nope' });
    assert.equal(status, 400);
    assert.match(body.error, /Unexpected field/);
  }

  // 400 — missing expected_current_phone entirely.
  {
    const { status, body } = await correctPhone({ id: phoneFixture.id, corrected_phone: '+1 250-555-9999', reason: 'test', batch_id: 'test-batch' });
    assert.equal(status, 400);
    assert.match(body.error, /expected_current_phone is required/);
  }

  // 400 — empty corrected_phone.
  {
    const { status, body } = await correctPhone({ id: phoneFixture.id, expected_current_phone: '+1 250-555-0177', corrected_phone: '   ', reason: 'test', batch_id: 'test-batch' });
    assert.equal(status, 400);
    assert.match(body.error, /corrected_phone/);
  }

  // 404 — nonexistent venue id.
  {
    const { status } = await correctPhone({ id: 999999999, expected_current_phone: '+1 250-555-0177', corrected_phone: '+1 250-555-9999', reason: 'test', batch_id: 'test-batch' });
    assert.equal(status, 404);
  }

  // 409 — wrong expected_current_phone on a POPULATED field; nothing written,
  // including no audit-log row (the INSERT is unreachable before this early
  // return, but assert it directly rather than relying on that by inspection).
  {
    const before = venue_enrichment_log_count(phoneFixture.id);
    const { status, body } = await correctPhone({ id: phoneFixture.id, expected_current_phone: '+1 250-000-0000', corrected_phone: '+1 250-555-9999', reason: 'test', batch_id: 'test-batch' });
    assert.equal(status, 409, 'mismatched expected_current_phone must be rejected');
    assert.equal(body.live.phone, '+1 250-555-0177', 'the response must report the real live phone');
    const stillUnchanged = app.getVenue(phoneFixture.id);
    assert.equal(stillUnchanged.phone, '+1 250-555-0177', 'phone must be unchanged after a 409');
    assert.equal(venue_enrichment_log_count(phoneFixture.id), before, 'a 409 must not write an audit-log row');
  }

  // 409 — NULL-precondition case: wrong (non-null) expected_current_phone
  // asserted against a venue whose live phone is actually NULL. Must
  // mismatch cleanly, not throw, and report the real (null) live value.
  {
    const { status, body } = await correctPhone({ id: nullPhoneFixture.id, expected_current_phone: '+1 250-555-0000', corrected_phone: '+1 250-555-1234', reason: 'test', batch_id: 'test-batch' });
    assert.equal(status, 409, 'a non-null expected_current_phone must mismatch against a genuinely NULL live phone');
    assert.equal(body.live.phone, null);
  }

  // 409 — the reverse NULL-precondition case: expected_current_phone: null
  // asserted against a venue whose live phone is actually POPULATED. Must
  // mismatch (the caller's belief that the field is empty is wrong), not
  // silently match or throw, and the phone must remain unchanged.
  {
    const { status, body } = await correctPhone({ id: populatedForNullCheckFixture.id, expected_current_phone: null, corrected_phone: '+1 250-555-2222', reason: 'test', batch_id: 'test-batch' });
    assert.equal(status, 409, 'expected_current_phone: null must mismatch against a genuinely POPULATED live phone');
    assert.equal(body.live.phone, '+1 250-555-0188', 'the response must report the real, populated live phone');
    assert.equal(app.getVenue(populatedForNullCheckFixture.id).phone, '+1 250-555-0188', 'phone must be unchanged after a 409');
  }

  // 200 — NULL-precondition MATCH case: expected_current_phone: null
  // correctly matches a live NULL phone, and the write succeeds. Exercises
  // the "(phone IS NULL AND ? IS NULL)" branch of the WHERE clause, not
  // just its negative (mismatch) case above.
  {
    const before = venue_enrichment_log_count(nullPhoneFixture.id);
    const { status, body } = await correctPhone({ id: nullPhoneFixture.id, expected_current_phone: null, corrected_phone: '+1 250-555-4321', reason: 'null-precondition match test', batch_id: 'test-batch-null-match' });
    assert.equal(status, 200, 'expected_current_phone: null must match a genuinely NULL live phone');
    assert.equal(body.venue.phone, '+1 250-555-4321');
    assert.equal(app.getVenue(nullPhoneFixture.id).phone, '+1 250-555-4321');
    const logRows = db.prepare('SELECT * FROM venue_enrichment_log WHERE venue_id = ? AND field_name = ?').all(nullPhoneFixture.id, 'phone');
    assert.equal(logRows.length, before + 1, 'exactly one new audit-log row must be written');
    const newest = logRows[logRows.length - 1];
    assert.equal(newest.old_value, null);
    assert.equal(newest.new_value, '+1 250-555-4321');
    assert.equal(newest.source, 'manual_correction');
    assert.equal(newest.batch_id, 'test-batch-null-match');
  }

  // corrected_phone trimming: padded input must be validated as non-empty
  // (it is, after trimming) AND stored as the TRIMMED value, not verbatim.
  {
    const { status, body } = await correctPhone({ id: nullPhoneFixture.id, expected_current_phone: '+1 250-555-4321', corrected_phone: '  +1 250-555-8765  ', reason: 'trim test', batch_id: 'test-batch-trim' });
    assert.equal(status, 200);
    assert.equal(body.venue.phone, '+1 250-555-8765', 'response must reflect the trimmed value, not the padded one');
    assert.equal(app.getVenue(nullPhoneFixture.id).phone, '+1 250-555-8765', 'stored phone must be trimmed, with no leading/trailing whitespace');
  }

  function venue_enrichment_log_count(venueId) {
    return db.prepare('SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE venue_id = ? AND field_name = ?').get(venueId, 'phone').n;
  }

  // 200 — success path on the originally-populated fixture, with exactly
  // one audit-log row written recording the real old/new values.
  {
    const before = venue_enrichment_log_count(phoneFixture.id);
    const { status, body } = await correctPhone({ id: phoneFixture.id, expected_current_phone: '+1 250-555-0177', corrected_phone: '+1 250-555-9999', reason: 'confirmed via chain locations page', batch_id: 'test-batch-success' });
    assert.equal(status, 200);
    assert.equal(body.changed, true);
    assert.equal(body.venue.phone, '+1 250-555-9999');
    assert.equal(app.getVenue(phoneFixture.id).phone, '+1 250-555-9999');

    const logRows = db.prepare('SELECT * FROM venue_enrichment_log WHERE venue_id = ? AND field_name = ?').all(phoneFixture.id, 'phone');
    assert.equal(logRows.length, before + 1, 'exactly one new audit-log row must be written');
    const newest = logRows[logRows.length - 1];
    assert.equal(newest.old_value, '+1 250-555-0177');
    assert.equal(newest.new_value, '+1 250-555-9999');
    assert.equal(newest.source, 'manual_correction');
    assert.equal(newest.source_ref, 'confirmed via chain locations page');
    assert.equal(newest.batch_id, 'test-batch-success');
    assert.equal(newest.confidence, 'high');
    assert.equal(newest.auto_accepted, 0);
  }

  // Concurrent stale-precondition race: a second caller holding the SAME
  // (now-stale) expected_current_phone that was true before the successful
  // correction above must be rejected with 409, not silently overwrite the
  // just-applied correction. Simulates "process A wrote based on a stale
  // read" — the exact scenario this atomic WHERE-clause guard exists for.
  {
    const { status, body } = await correctPhone({ id: phoneFixture.id, expected_current_phone: '+1 250-555-0177', corrected_phone: '+1 250-555-0000', reason: 'stale caller', batch_id: 'test-batch-stale' });
    assert.equal(status, 409, 'a stale expected_current_phone must be rejected even though it WAS correct before the prior write');
    assert.equal(body.live.phone, '+1 250-555-9999', 'must report the value the prior write actually left in place');
    assert.equal(app.getVenue(phoneFixture.id).phone, '+1 250-555-9999', 'the stale caller must not have changed anything');
  }

  // No-op case: expected_current_phone === corrected_phone. Must succeed
  // without writing an audit-log row (mirrors guardedCorrectUpdate()'s
  // existing no-op behavior for an unchanged field).
  {
    const before = venue_enrichment_log_count(phoneFixture.id);
    const { status, body } = await correctPhone({ id: phoneFixture.id, expected_current_phone: '+1 250-555-9999', corrected_phone: '+1 250-555-9999', reason: 'noop', batch_id: 'test-batch-noop' });
    assert.equal(status, 200);
    assert.equal(body.changed, false);
    assert.equal(venue_enrichment_log_count(phoneFixture.id), before, 'a true no-op must not write an audit-log row');
  }

  // ---- /admin/correct-amenities ------------------------------------------
  // Folded into this same start/close cycle for the same reason as the
  // /admin/correct-phone block above.
  {
    const amenityFixture = app.findVenueBySlug('kelowna', 'restaurant', 'test-amenity-fixture');

    async function correctAmenities(bodyObj, token = ADMIN_TOKEN) {
      const headers = { 'Content-Type': 'application/json' };
      if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/admin/correct-amenities`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
      });
      return { status: res.status, body: await res.json() };
    }

    function amenityLogRows(venueId, field) {
      return db.prepare('SELECT * FROM venue_enrichment_log WHERE venue_id = ? AND field_name = ?').all(venueId, field);
    }

    // 401 — wrong bearer token, no write attempted.
    {
      const { status } = await correctAmenities(
        { id: amenityFixture.id, fields: { vegan: { expected_current: false, corrected: true } }, reason: 'test', batch_id: 'test-batch' },
        'wrong-token'
      );
      assert.equal(status, 401, 'wrong bearer token must be rejected');
      assert.equal(app.getVenue(amenityFixture.id).vegan, false, 'no write must happen on a 401');
    }

    // 400 — unexpected top-level key.
    {
      const { status, body } = await correctAmenities({ id: amenityFixture.id, fields: { vegan: { expected_current: false, corrected: true } }, reason: 'test', batch_id: 'test-batch', extra: 'nope' });
      assert.equal(status, 400);
      assert.match(body.error, /Unexpected field/);
    }

    // 400 — empty fields object.
    {
      const { status, body } = await correctAmenities({ id: amenityFixture.id, fields: {}, reason: 'test', batch_id: 'test-batch' });
      assert.equal(status, 400);
      assert.match(body.error, /at least one amenity field/);
    }

    // 400 — unapproved field name (a real column, but not one of the four
    // approved amenity fields). Must be rejected wholesale, and must not
    // partially apply any field in the same request.
    {
      const before = app.getVenue(amenityFixture.id);
      const { status, body } = await correctAmenities({
        id: amenityFixture.id,
        fields: {
          vegan: { expected_current: false, corrected: true },
          dog_friendly: { expected_current: false, corrected: true },
        },
        reason: 'test', batch_id: 'test-batch',
      });
      assert.equal(status, 400);
      assert.match(body.error, /Unexpected amenity field/);
      assert.deepEqual(body.allowed, ['vegan', 'vegetarian', 'patio', 'gluten_free']);
      const after = app.getVenue(amenityFixture.id);
      assert.equal(after.vegan, before.vegan, 'a request containing ANY unapproved field must write NOTHING, including the valid field in the same call');
      assert.equal(after.dog_friendly, false, 'dog_friendly must remain untouched -- it is not a writable field via this endpoint');
    }

    // 400 — an attempt to reach an arbitrary, sensitive column (redirect_to)
    // via the fields object must be rejected the same way, never treated
    // specially or silently ignored.
    {
      const { status, body } = await correctAmenities({
        id: amenityFixture.id,
        fields: { redirect_to: { expected_current: false, corrected: true } },
        reason: 'test', batch_id: 'test-batch',
      });
      assert.equal(status, 400);
      assert.match(body.error, /Unexpected amenity field/);
      assert.equal(app.getVenue(amenityFixture.id).redirect_to, null, 'redirect_to must be completely unreachable via this endpoint');
    }

    // 404 — nonexistent venue id.
    {
      const { status } = await correctAmenities({ id: 999999999, fields: { vegan: { expected_current: false, corrected: true } }, reason: 'test', batch_id: 'test-batch' });
      assert.equal(status, 404);
    }

    // 200 — a single call exercising three of the four per-field outcomes
    // at once against the fixture's mixed starting state (vegan=false,
    // vegetarian=true, patio=true, gluten_free=false). The fourth outcome
    // (a genuine expected-current mismatch) needs live state that diverges
    // from what the caller claims -- it's covered separately below by the
    // stale-precondition case, after this call has already changed vegan.
    //   - vegan:        false -> true   => written (the core "preserve a
    //                                      verified true value" case)
    //   - vegetarian:   true  -> true    => harmless no-op
    //   - patio:        true  -> false   => rejected (true->false is never
    //                                      permitted, regardless of what
    //                                      expected_current claims)
    //   - gluten_free:  also a true->false attempt (expected_current
    //                   claimed true, corrected false), but against a field
    //                   whose real live value is actually false -- proves
    //                   the true->false guard fires unconditionally, BEFORE
    //                   the expected-current check ever runs, even when the
    //                   caller's own claim about the current value is wrong
    {
      const veganLogBefore = amenityLogRows(amenityFixture.id, 'vegan').length;
      const patioLogBefore = amenityLogRows(amenityFixture.id, 'patio').length;
      const glutenLogBefore = amenityLogRows(amenityFixture.id, 'gluten_free').length;
      const vegetarianLogBefore = amenityLogRows(amenityFixture.id, 'vegetarian').length;

      const { status, body } = await correctAmenities({
        id: amenityFixture.id,
        fields: {
          vegan: { expected_current: false, corrected: true },
          vegetarian: { expected_current: true, corrected: true },
          patio: { expected_current: true, corrected: false },
          gluten_free: { expected_current: true, corrected: false },
        },
        reason: 'confirmed via Intermezzo Castle Bistro verification', batch_id: 'test-batch-mixed',
      });

      assert.equal(status, 200);
      assert.deepEqual(body.results, {
        vegan: 'written',
        vegetarian: 'noop_already_matches',
        patio: 'rejected_true_to_false',
        gluten_free: 'rejected_true_to_false',
      });
      assert.equal(body.venue.vegan, true, 'response must reflect the newly-written vegan value');
      assert.equal(body.venue.vegetarian, true);
      assert.equal(body.venue.patio, true, 'patio must remain true -- the true->false attempt must not have applied');
      assert.equal(body.venue.gluten_free, false, 'gluten_free must remain false -- the true->false attempt must not have applied, regardless of the caller\'s (wrong) expected_current claim');

      const live = app.getVenue(amenityFixture.id);
      assert.equal(live.vegan, true);
      assert.equal(live.vegetarian, true);
      assert.equal(live.patio, true, 'patio must be unchanged in the database, not just in the response');
      assert.equal(live.gluten_free, false, 'gluten_free must be unchanged in the database, not just in the response');

      // Logging: exactly one new row for the field that actually wrote,
      // zero new rows for the no-op and the two rejected fields.
      assert.equal(amenityLogRows(amenityFixture.id, 'vegan').length, veganLogBefore + 1, 'exactly one new audit-log row for the written field');
      assert.equal(amenityLogRows(amenityFixture.id, 'vegetarian').length, vegetarianLogBefore, 'a no-op must not write an audit-log row');
      assert.equal(amenityLogRows(amenityFixture.id, 'patio').length, patioLogBefore, 'a rejected true->false attempt must not write an audit-log row');
      assert.equal(amenityLogRows(amenityFixture.id, 'gluten_free').length, glutenLogBefore, 'a rejected true->false attempt must not write an audit-log row');

      const veganLog = amenityLogRows(amenityFixture.id, 'vegan')[amenityLogRows(amenityFixture.id, 'vegan').length - 1];
      assert.equal(veganLog.old_value, '0');
      assert.equal(veganLog.new_value, '1');
      assert.equal(veganLog.source, 'manual_correction');
      assert.equal(veganLog.source_ref, 'confirmed via Intermezzo Castle Bistro verification');
      assert.equal(veganLog.batch_id, 'test-batch-mixed');
      assert.equal(veganLog.confidence, 'high');
      assert.equal(veganLog.auto_accepted, 0);

      // Unrelated fields (non-amenity, and the other 8 amenity booleans
      // this endpoint doesn't touch) must be completely untouched.
      assert.equal(live.phone, '+1 250-555-0199', 'phone must be unaffected by an amenities call');
      assert.equal(live.address, '789 Amenity Ave, Kelowna, BC V1Y 0C0', 'address must be unaffected by an amenities call');
      assert.equal(live.name, 'Test Amenity Fixture');
      assert.equal(live.dog_friendly, false, 'a boolean field outside the four-field allowlist must be unaffected');
      assert.equal(live.redirect_to, null, 'redirect_to must be unaffected');
    }

    // Concurrent stale-precondition race, mirroring the /admin/correct-phone
    // test above: a second caller holding the SAME (now-stale)
    // expected_current that was true before the successful write must be
    // rejected, not silently overwrite the just-applied correction. This is
    // also the dedicated genuine expected-current-mismatch case (distinct
    // from the true->false guard, which fires first and independently
    // whenever corrected: false -- this call uses corrected: true, so the
    // rejection here can only come from the live-state mismatch check).
    {
      const before = amenityLogRows(amenityFixture.id, 'vegan').length;
      const { status, body } = await correctAmenities({
        id: amenityFixture.id,
        fields: { vegan: { expected_current: false, corrected: true } }, // stale: vegan is already true now
        reason: 'stale caller', batch_id: 'test-batch-stale',
      });
      assert.equal(status, 200, 'the call itself succeeds -- the rejection is per-field, not a whole-request error');
      assert.equal(body.results.vegan, 'rejected_expected_mismatch', 'a stale expected_current must be rejected even though it WAS correct before the prior write');
      assert.equal(app.getVenue(amenityFixture.id).vegan, true, 'the stale caller must not have changed anything');
      assert.equal(amenityLogRows(amenityFixture.id, 'vegan').length, before, 'a rejected stale call must not write an audit-log row');
    }
  }

  // ---- POST /api/trip/generate (Build My Trip, Stage 1) -------------------
  // Folded into this same start/close cycle for the same reason as the
  // /admin/correct-phone block above. Unauthenticated -- no bearer token.
  {
    async function generateTrip(bodyObj) {
      const res = await fetch(`${base}/api/trip/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      return { status: res.status, body: await res.json() };
    }

    // 400 -- unexpected top-level key.
    {
      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, extra: 'nope' });
      assert.equal(status, 400);
      assert.match(body.error, /Unexpected field/);
    }

    // 400 -- invalid region.
    {
      const { status, body } = await generateTrip({ region: 'not-a-real-region', days: 1 });
      assert.equal(status, 400);
      assert.match(body.error, /region must be/);
    }

    // 400 -- invalid days (out of range and non-integer).
    {
      const { status: s1 } = await generateTrip({ region: 'osoyoos', days: 0 });
      assert.equal(s1, 400);
      const { status: s2 } = await generateTrip({ region: 'osoyoos', days: 8 });
      assert.equal(s2, 400);
      const { status: s3 } = await generateTrip({ region: 'osoyoos', days: 2.5 });
      assert.equal(s3, 400);
    }

    // 400 -- interests must be an array of known type strings.
    {
      const { status: s1, body: b1 } = await generateTrip({ region: 'osoyoos', days: 1, interests: 'golf' });
      assert.equal(s1, 400);
      assert.match(b1.error, /interests must be an array/);
      const { status: s2, body: b2 } = await generateTrip({ region: 'osoyoos', days: 1, interests: ['not-a-real-type'] });
      assert.equal(s2, 400);
      assert.match(b2.error, /Unknown interest/);
    }

    // 400 -- invalid pace.
    {
      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, pace: 'breakneck' });
      assert.equal(status, 400);
      assert.match(body.error, /pace must be one of/);
    }

    // 200 -- a valid request against the real fixture data, no auth required.
    {
      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, pace: 'standard' });
      assert.equal(status, 200);
      assert.equal(body.region, 'osoyoos');
      assert.equal(body.days, 1);
      assert.equal(body.pace, 'standard');
      assert.equal(body.itinerary.length, 1);
      assert.equal(body.itinerary[0].morning.name, 'Trip Cafe Morning');
      assert.equal(body.itinerary[0].evening.name, 'Trip Pub Faraway');
    }

    // Determinism over HTTP: two identical requests must return identical itineraries.
    {
      const params = { region: 'osoyoos', days: 2, pace: 'packed' };
      const first = await generateTrip(params);
      const second = await generateTrip(params);
      assert.deepEqual(first.body, second.body);
    }

    // 400 -- malformed JSON body.
    {
      const res = await fetch(`${base}/api/trip/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      });
      assert.equal(res.status, 400);
    }

    // ---- Stage 3 fields: amenities, budget, discovery ---------------------

    // 400 -- amenities must be an array of known BOOL_FIELDS names.
    {
      const { status: s1, body: b1 } = await generateTrip({ region: 'osoyoos', days: 1, amenities: 'dog_friendly' });
      assert.equal(s1, 400);
      assert.match(b1.error, /amenities must be an array/);
      const { status: s2, body: b2 } = await generateTrip({ region: 'osoyoos', days: 1, amenities: ['not_a_real_amenity'] });
      assert.equal(s2, 400);
      assert.match(b2.error, /Unknown amenity/);
    }

    // 400 -- invalid budget value.
    {
      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, budget: 'ultra-luxury' });
      assert.equal(status, 400);
      assert.match(body.error, /budget must be one of/);
    }

    // 400 -- discovery must reference a real collections.kind.
    {
      const { status: s1, body: b1 } = await generateTrip({ region: 'osoyoos', days: 1, discovery: 'hidden_gem' });
      assert.equal(s1, 400);
      assert.match(b1.error, /discovery must be an array/);
      const { status: s2, body: b2 } = await generateTrip({ region: 'osoyoos', days: 1, discovery: ['local_favourite'] });
      assert.equal(s2, 400);
      assert.match(b2.error, /Unknown discovery kind/);
    }

    // 200 -- a valid request using all three new Stage 3 fields together;
    // response echoes them back and the plan is unaffected in shape.
    {
      const { status, body } = await generateTrip({
        region: 'osoyoos', days: 1, pace: 'standard',
        amenities: ['dog_friendly'], budget: 'moderate', discovery: ['hidden_gem'],
      });
      assert.equal(status, 200);
      assert.deepEqual(body.amenities, ['dog_friendly']);
      assert.equal(body.budget, 'moderate');
      assert.deepEqual(body.discovery, ['hidden_gem']);
      assert.equal(body.itinerary.length, 1);
    }

    // Omitting the three Stage 3 fields entirely must reproduce the exact
    // pre-Stage-3 response over real HTTP, not just at the function level.
    {
      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, pace: 'standard' });
      assert.equal(status, 200);
      assert.deepEqual(body.amenities, []);
      assert.equal(body.budget, null);
      assert.deepEqual(body.discovery, []);
      assert.equal(body.itinerary[0].morning.name, 'Trip Cafe Morning');
      assert.equal(body.itinerary[0].evening.name, 'Trip Pub Faraway');
    }

    // ---- Regenerate-exclusion fix: excludeVenueIds ------------------------

    // 400 -- excludeVenueIds must be an array of integers.
    {
      const { status: s1, body: b1 } = await generateTrip({ region: 'osoyoos', days: 1, excludeVenueIds: 'not-an-array' });
      assert.equal(s1, 400);
      assert.match(b1.error, /excludeVenueIds must be an array/);
      const { status: s2, body: b2 } = await generateTrip({ region: 'osoyoos', days: 1, excludeVenueIds: ['not-a-number'] });
      assert.equal(s2, 400);
      assert.match(b2.error, /excludeVenueIds must be an array/);
      const { status: s3, body: b3 } = await generateTrip({ region: 'osoyoos', days: 1, excludeVenueIds: [1.5] });
      assert.equal(s3, 400);
      assert.match(b3.error, /excludeVenueIds must be an array/);
    }

    // 200 -- a valid request with excludeVenueIds never returns an excluded id anywhere in the plan.
    {
      const { body: firstBody } = await generateTrip({ region: 'osoyoos', days: 1, pace: 'standard' });
      const cafeId = firstBody.itinerary[0].morning.id;

      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, pace: 'standard', excludeVenueIds: [cafeId] });
      assert.equal(status, 200);
      const placedIds = [];
      body.itinerary.forEach((day) => { ['morning', 'afternoon', 'evening'].forEach((slot) => { if (day[slot]) placedIds.push(day[slot].id); }); });
      assert.ok(!placedIds.includes(cafeId), 'an excluded venue id must never appear in the generated itinerary');
    }

    // Omitting excludeVenueIds entirely must reproduce the exact
    // pre-exclusion-fix response over real HTTP.
    {
      const { status, body } = await generateTrip({ region: 'osoyoos', days: 1, pace: 'standard' });
      assert.equal(status, 200);
      assert.equal(body.itinerary[0].morning.name, 'Trip Cafe Morning');
      assert.equal(body.itinerary[0].evening.name, 'Trip Pub Faraway');
    }
  }

  // ---- POST /api/trip/parse (Build My Trip, Stage 3) -----------------------
  // The route's default provider is now the FREE deterministic parser
  // (deterministicTripParserProvider), not OpenAI -- so a well-formed
  // request succeeds over real HTTP with OPENAI_API_KEY completely unset,
  // no network call, and no cost. Deep parsing/alias-matching behavior is
  // covered exhaustively below (deterministicTripParserProvider tests);
  // this block confirms the route itself wires the real default provider
  // correctly end to end.
  {
    async function parseTrip(bodyObj) {
      const res = await fetch(`${base}/api/trip/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      return { status: res.status, body: await res.json() };
    }

    // 400 -- unexpected top-level key.
    {
      const { status, body } = await parseTrip({ text: 'a trip to kelowna', extra: 'nope' });
      assert.equal(status, 400);
      assert.match(body.error, /Unexpected field/);
    }

    // 400 -- missing/empty text.
    {
      const { status: s1 } = await parseTrip({});
      assert.equal(s1, 400);
      const { status: s2, body: b2 } = await parseTrip({ text: '   ' });
      assert.equal(s2, 400);
      assert.match(b2.error, /text is required/);
    }

    // 400 -- malformed JSON body.
    {
      const res = await fetch(`${base}/api/trip/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      });
      assert.equal(res.status, 400);
    }

    // 200 -- a well-formed request succeeds with NO OPENAI_API_KEY set at
    // all, via the real (unmocked) default provider -- proving the live
    // route no longer depends on OpenAI being configured.
    {
      const { status, body } = await parseTrip({
        text: 'Plan me a relaxed 3-day trip around Kelowna with wine, hidden gems, dog-friendly places, beaches and something fun happening Saturday night.',
      });
      assert.equal(status, 200);
      assert.deepEqual(body, {
        region: 'kelowna',
        days: 3,
        interests: ['winery'],
        amenities: ['dog_friendly'],
        pace: 'relaxed',
        budget: null,
        discovery: ['hidden_gem'],
        unsupported: ['something fun happening', 'saturday night', 'beaches'],
        needs_clarification: [],
      });
    }

    // The structured output from /api/trip/parse must be directly
    // consumable by /api/trip/generate, unmodified -- the two endpoints'
    // contracts are still meant to compose exactly as before.
    {
      const { body: parsed } = await parseTrip({ text: 'Give me three days of wine around Vernon, relaxed pace, dog friendly.' });
      assert.equal(parsed.region, 'vernon');
      assert.equal(parsed.days, 3);

      const genRes = await fetch(`${base}/api/trip/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: parsed.region,
          days: parsed.days,
          interests: parsed.interests,
          pace: parsed.pace,
          amenities: parsed.amenities,
          budget: parsed.budget,
          discovery: parsed.discovery,
        }),
      });
      assert.equal(genRes.status, 200);
      const genBody = await genRes.json();
      assert.equal(genBody.region, 'vernon');
      assert.equal(genBody.days, 3);
    }

    // A request needing clarification still returns 200 (not an error) --
    // this is a valid, honest outcome, not a failure.
    {
      const { status, body } = await parseTrip({ text: 'Plan something in Kelowna.' });
      assert.equal(status, 200);
      assert.equal(body.region, 'kelowna');
      assert.equal(body.days, null);
      assert.deepEqual(body.needs_clarification, ['days']);
    }
  }

  // ---- HEAD requests must mirror GET (SEO fix, 2026-09-19) ---------------
  // Per RFC 7231 sec. 4.3.2, a HEAD response must carry the same
  // status/headers as the equivalent GET, just with no body. Covers a
  // representative page of each route shape guarded by `method === 'GET'`
  // in server.js: the homepage, a region page, a category page, a venue
  // page, a redirect (301), a 404, the plain-text/XML routes
  // (robots.txt/sitemap.xml), and a sendJSON-based API route.
  {
    const headVsGet = async (path) => {
      const [headRes, getRes] = await Promise.all([
        fetch(`${base}${path}`, { method: 'HEAD' }),
        fetch(`${base}${path}`),
      ]);
      const headBody = await headRes.text();
      return { headRes, getRes, headBody };
    };

    for (const path of ['/', '/kelowna', '/kelowna/restaurants', '/kelowna/restaurants/test-trattoria', '/robots.txt', '/sitemap.xml', '/api/venues']) {
      const { headRes, getRes, headBody } = await headVsGet(path);
      assert.equal(headRes.status, getRes.status, `HEAD ${path} must match GET ${path}'s status`);
      assert.equal(headRes.headers.get('content-type'), getRes.headers.get('content-type'), `HEAD ${path} content-type must match GET`);
      assert.equal(headBody, '', `HEAD ${path} must have an empty body`);
    }

    // 404
    {
      const { headRes, getRes, headBody } = await headVsGet('/this-region-does-not-exist');
      assert.equal(headRes.status, 404);
      assert.equal(headRes.status, getRes.status);
      assert.equal(headBody, '', 'HEAD 404 must have an empty body');
    }

    // Redirect (301) -- HEAD must carry the same Location header, no body.
    {
      const headRes = await fetch(`${base}/kelowna/restaurants/ds4-redirected-gem`, { method: 'HEAD', redirect: 'manual' });
      const getRes = await fetch(`${base}/kelowna/restaurants/ds4-redirected-gem`, { redirect: 'manual' });
      assert.equal(headRes.status, 301, 'HEAD must receive the same 301 GET does');
      assert.equal(headRes.status, getRes.status);
      assert.equal(headRes.headers.get('location'), getRes.headers.get('location'), 'HEAD redirect Location must match GET');
      assert.equal(await headRes.text(), '', 'HEAD redirect must have an empty body');
    }
  }

  // ---- sitemap <lastmod> reflects real data, not "today" (SEO fix, 2026-09-19) ----
  {
    const pastDate = '2020-01-02';
    db.prepare('UPDATE venues SET updated_at = ? WHERE id = ?').run(`${pastDate} 00:00:00`, testVenue.id);
    const freshSitemapRes = await fetch(`${base}/sitemap.xml`);
    const freshSitemapBody = await freshSitemapRes.text();
    const block = freshSitemapBody.match(/<url>\s*<loc>https:\/\/okanaganroam\.com\/kelowna\/restaurants\/test-trattoria<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
    assert.ok(block, 'test venue must have a matching sitemap <url> block');
    assert.equal(block[1], pastDate, "venue lastmod must reflect the venue's real updated_at, not today's date");

    // This fix must not change which URLs are in the sitemap -- only the
    // <lastmod> value -- so the total <loc> count must be unchanged from
    // the earlier fetch in this same test (before this one row's
    // updated_at was touched; nothing about its region/type/slug/
    // redirect_to changed).
    const locCountBefore = (sitemapBody.match(/<loc>/g) || []).length;
    const locCountAfter = (freshSitemapBody.match(/<loc>/g) || []).length;
    assert.equal(locCountAfter, locCountBefore, 'sitemap URL count must be unaffected by the lastmod fix');
  }

  // ---- Security fix (2026-09-19): POST/PUT/DELETE /api/venues now require ----
  // the same ENRICHMENT_ADMIN_TOKEN bearer auth every /admin/* route already
  // uses -- previously these three were completely unauthenticated, letting
  // anyone create/edit/delete a real production venue. GET remains public.
  {
    const authHeaders = (token) => {
      const h = { 'Content-Type': 'application/json' };
      if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
      return h;
    };

    // 1/2/3 -- POST /api/venues: no header / wrong token / correct token.
    const newVenuePayload = {
      name: 'Test Auth Fixture Venue', region: 'kelowna', type: 'restaurant',
      description: 'Disposable fixture for the venue-mutation auth test.',
    };
    {
      const res = await fetch(`${base}/api/venues`, { method: 'POST', headers: authHeaders(undefined), body: JSON.stringify(newVenuePayload) });
      assert.equal(res.status, 401, 'POST /api/venues with no Authorization header must be rejected');
    }
    {
      const res = await fetch(`${base}/api/venues`, { method: 'POST', headers: authHeaders('wrong-token'), body: JSON.stringify(newVenuePayload) });
      assert.equal(res.status, 401, 'POST /api/venues with an invalid token must be rejected');
    }
    let createdVenue;
    {
      const res = await fetch(`${base}/api/venues`, { method: 'POST', headers: authHeaders(ADMIN_TOKEN), body: JSON.stringify(newVenuePayload) });
      assert.equal(res.status, 201, 'POST /api/venues with a valid admin token must succeed');
      createdVenue = await res.json();
      assert.equal(createdVenue.name, newVenuePayload.name);
    }

    // 4/5/6 -- PUT /api/venues/:id: no header / wrong token / correct token.
    {
      const res = await fetch(`${base}/api/venues/${createdVenue.id}`, { method: 'PUT', headers: authHeaders(undefined), body: JSON.stringify({ description: 'should not apply' }) });
      assert.equal(res.status, 401, 'PUT /api/venues/:id with no Authorization header must be rejected');
    }
    {
      const res = await fetch(`${base}/api/venues/${createdVenue.id}`, { method: 'PUT', headers: authHeaders('wrong-token'), body: JSON.stringify({ description: 'should not apply' }) });
      assert.equal(res.status, 401, 'PUT /api/venues/:id with an invalid token must be rejected');
    }
    {
      const res = await fetch(`${base}/api/venues/${createdVenue.id}`, { method: 'PUT', headers: authHeaders(ADMIN_TOKEN), body: JSON.stringify({ description: 'updated by authenticated PUT' }) });
      assert.equal(res.status, 200, 'PUT /api/venues/:id with a valid admin token must succeed');
      const updated = await res.json();
      assert.equal(updated.description, 'updated by authenticated PUT');
    }

    // 7/8/9 -- DELETE /api/venues/:id: no header / wrong token / correct token.
    {
      const res = await fetch(`${base}/api/venues/${createdVenue.id}`, { method: 'DELETE', headers: authHeaders(undefined) });
      assert.equal(res.status, 401, 'DELETE /api/venues/:id with no Authorization header must be rejected');
    }
    {
      const res = await fetch(`${base}/api/venues/${createdVenue.id}`, { method: 'DELETE', headers: authHeaders('wrong-token') });
      assert.equal(res.status, 401, 'DELETE /api/venues/:id with an invalid token must be rejected');
    }
    {
      // Confirm the two rejected attempts above genuinely didn't delete it.
      const stillThere = await fetch(`${base}/api/venues/${createdVenue.id}`);
      assert.equal(stillThere.status, 200, 'venue must still exist after the two rejected DELETE attempts');

      const res = await fetch(`${base}/api/venues/${createdVenue.id}`, { method: 'DELETE', headers: authHeaders(ADMIN_TOKEN) });
      assert.equal(res.status, 200, 'DELETE /api/venues/:id with a valid admin token must succeed');
      const gone = await fetch(`${base}/api/venues/${createdVenue.id}`);
      assert.equal(gone.status, 404, 'venue must actually be gone after an authenticated DELETE');
    }

    // 10 -- public GET /api/venues remains fully public, no auth required.
    {
      const res = await fetch(`${base}/api/venues?limit=1`);
      assert.equal(res.status, 200, 'GET /api/venues must remain publicly readable with no Authorization header');
    }

    // 11 -- existing /admin/* auth behavior is unchanged by this fix (a
    // representative spot-check; the full suite of /admin/* auth tests
    // elsewhere in this file is the authoritative coverage).
    {
      const res = await fetch(`${base}/admin/enrich-venue`, { method: 'POST', headers: authHeaders('wrong-token'), body: JSON.stringify({ id: 1, address: 'x', latitude: 49, longitude: -119 }) });
      assert.equal(res.status, 401, '/admin/enrich-venue auth behavior must be unaffected by the /api/venues fix');
    }
  }

  // ---- Optional explicit slug support on POST /api/venues (2026-09-19) ----
  // createVenue() only -- deliberately not updateVenue()/PUT, per the
  // approved proposal. Uses the same authenticated admin token throughout;
  // this block is about slug validation/collision behavior, not auth.
  {
    const adminHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` };
    const postVenue = (body) => fetch(`${base}/api/venues`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) });

    // 1 -- valid custom slug is persisted exactly.
    let slugFixtureId;
    {
      const res = await postVenue({ name: 'Slug Fixture Venue', region: 'kelowna', type: 'golf', slug: 'slug-fixture-venue-custom' });
      assert.equal(res.status, 201, 'POST with a valid custom slug must succeed');
      const created = await res.json();
      assert.equal(created.slug, 'slug-fixture-venue-custom', 'the exact supplied slug must be persisted, not re-derived from name');
      slugFixtureId = created.id;
    }

    // 2 -- same (region, type, slug) collision is rejected, nothing created.
    {
      const beforeCount = (await (await fetch(`${base}/api/venues?limit=1`)).json()).total;
      const res = await postVenue({ name: 'A Different Name Entirely', region: 'kelowna', type: 'golf', slug: 'slug-fixture-venue-custom' });
      assert.equal(res.status, 409, 'a duplicate (region,type,slug) must be rejected with 409');
      const afterCount = (await (await fetch(`${base}/api/venues?limit=1`)).json()).total;
      assert.equal(afterCount, beforeCount, 'a rejected collision must not create a row');
    }

    // 3 -- invalid slug formats are all rejected with 400, nothing created.
    {
      const beforeCount = (await (await fetch(`${base}/api/venues?limit=1`)).json()).total;
      for (const badSlug of ['Has Spaces And Caps', '-leading-hyphen', 'trailing-hyphen-', 'double--hyphen', 'punct!uation', '']) {
        const res = await postVenue({ name: 'Bad Slug Venue', region: 'kelowna', type: 'golf', slug: badSlug });
        assert.equal(res.status, 400, `slug "${badSlug}" must be rejected with 400`);
      }
      const afterCount = (await (await fetch(`${base}/api/venues?limit=1`)).json()).total;
      assert.equal(afterCount, beforeCount, 'rejected invalid slugs must not create any row');
    }

    // 4 -- omitting slug entirely preserves existing behavior exactly
    // (stays NULL until the next backfillSlugs() pass, same as always).
    {
      const res = await postVenue({ name: 'No Slug Supplied Venue', region: 'kelowna', type: 'golf' });
      assert.equal(res.status, 201);
      const created = await res.json();
      assert.equal(created.slug, null, 'omitting slug must leave it NULL, unchanged from existing behavior');
    }
    // ...and explicit null behaves the same as omitted, not as a validation error.
    {
      const res = await postVenue({ name: 'Explicit Null Slug Venue', region: 'kelowna', type: 'golf', slug: null });
      assert.equal(res.status, 201, 'an explicit null slug must be treated like omitted, not rejected');
      const created = await res.json();
      assert.equal(created.slug, null);
    }

    // 5 -- PUT does NOT support setting/changing slug in this change; a
    // slug in a PUT body must be silently ignored (ALL_FIELDS-driven
    // updateVenue() was never touched), not applied and not erroring.
    {
      const res = await fetch(`${base}/api/venues/${slugFixtureId}`, {
        method: 'PUT', headers: adminHeaders,
        body: JSON.stringify({ slug: 'attempted-slug-change-via-put' }),
      });
      assert.equal(res.status, 200, 'PUT with an extraneous slug field must still succeed (ignored, not rejected)');
      const updated = await res.json();
      assert.equal(updated.slug, 'slug-fixture-venue-custom', "PUT must NOT change the venue's slug");
    }
  }

  // Close the listener so the test process can exit naturally instead of
  // hanging on an open server handle.
  await new Promise((resolve) => app.server.close(resolve));
});

// ---- /admin/correct-phone: 503 when ENRICHMENT_ADMIN_TOKEN is unset -----
//
// server.js reads ENRICHMENT_ADMIN_TOKEN exactly once, at module load. The
// shared test harness above already sets a fixture token before its single
// require('../server.js') call, for the whole rest of this file -- so the
// "token genuinely unset" path can't be exercised in-process here without
// either re-requiring server.js (Node's CommonJS cache would just return
// the already-loaded module with the token already baked in) or spinning
// up a second app.startServer()/server.close() cycle in THIS process,
// which the file's own comments already document as breaking later
// fetches in the shared test above.
//
// Isolation strategy: copy server.js + db.js (their real, unmodified
// content -- byte-for-byte, via fs.copyFileSync, nothing rewritten) into a
// fresh OS temp directory, then launch that copy as a genuinely separate
// `node <copy>/server.js` CHILD PROCESS with its own process.env (built
// from a shallow copy of the parent's env with ENRICHMENT_ADMIN_TOKEN
// explicitly deleted, so it's unset regardless of what the parent
// process's own environment happens to contain) and its own PORT (3098,
// distinct from the shared harness's 3001). This gives three independent
// axes of isolation from both the real project and the shared test run
// above:
//   1. Separate OS process -> its own require() cache, so
//      ENRICHMENT_ADMIN_TOKEN is read fresh at THAT process's module-load
//      time, from THAT process's env, not this test file's already-primed
//      one.
//   2. Separate directory (a fresh os.tmpdir() subdirectory) -> db.js
//      resolves its DB_PATH relative to ITS OWN __dirname, which is now
//      the temp directory, not the project root -- so it opens/creates an
//      entirely new, empty SQLite file there, never touching the real
//      project's okanagan.db or the shared test run's copy of it.
//   3. Separate port (3098 vs. 3001) -> no listener conflict with the
//      shared test above, even though that test has already closed its
//      server by the time this one runs.
// The temp directory and child process are both torn down in `finally`,
// so a failed assertion can't leak either.
test('/admin/correct-phone and /admin/correct-amenities return 503 when ENRICHMENT_ADMIN_TOKEN is unset (isolated child process)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-503-isolation-test-'));
  const projectRoot = path.join(__dirname, '..');
  fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(tempDir, 'server.js'));
  fs.copyFileSync(path.join(projectRoot, 'db.js'), path.join(tempDir, 'db.js'));

  const ISOLATED_PORT = '3098';
  const childEnv = { ...process.env };
  delete childEnv.ENRICHMENT_ADMIN_TOKEN; // explicitly unset, regardless of the parent's own env
  childEnv.PORT = ISOLATED_PORT;

  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], {
    cwd: tempDir,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrOutput = '';
  child.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });

  try {
    // Poll a harmless, always-public route until the isolated child is
    // actually accepting connections, rather than guessing a fixed delay.
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try {
        const res = await fetch(`http://localhost:${ISOLATED_PORT}/robots.txt`);
        if (res.status === 200) ready = true;
      } catch (_) {
        // Connection refused -- not listening yet. Retry shortly.
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(ready, `isolated child server on port ${ISOLATED_PORT} never became ready. stderr: ${stderrOutput}`);

    const res = await fetch(`http://localhost:${ISOLATED_PORT}/admin/correct-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Even a well-formed body must never get past the token check --
      // the unset-token 503 is the very first thing the route checks.
      body: JSON.stringify({ id: 1, expected_current_phone: null, corrected_phone: 'x', reason: 'x', batch_id: 'x' }),
    });
    assert.equal(res.status, 503, `expected 503 with ENRICHMENT_ADMIN_TOKEN unset in the isolated process. stderr: ${stderrOutput}`);
    const body = await res.json();
    assert.match(body.error, /not configured/);

    // Same fail-closed check for /admin/correct-amenities -- reuses this
    // same isolated child rather than spinning up a second one.
    const amenityRes = await fetch(`http://localhost:${ISOLATED_PORT}/admin/correct-amenities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, fields: { vegan: { expected_current: false, corrected: true } }, reason: 'x', batch_id: 'x' }),
    });
    assert.equal(amenityRes.status, 503, `expected 503 for /admin/correct-amenities with ENRICHMENT_ADMIN_TOKEN unset. stderr: ${stderrOutput}`);
    const amenityBody = await amenityRes.json();
    assert.match(amenityBody.error, /not configured/);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ==== Golf venue-card engagement (2026-09-19, Golf only) ==================
//
// Read-more/Read-less description toggle on Golf cards plus GA4-backed
// engagement events (venue_impression, description_expand/collapse,
// venue_view, outbound_click with link_type) reusing the homepage's
// existing window.trackEvent() convention. Every other category must
// render byte-for-byte what it did before.

test('Golf venue card wraps the description for the inline toggle, with accessible button semantics', () => {
  const venue = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const html = app.venueCardHtml(venue);
  assert.match(html, /<li class="venue-card" data-venue-id="\d+" data-venue-region="kelowna" data-venue-category="golf" data-venue-name="Test Golf Course" data-surface="category_card">/);
  const descId = `golf-desc-${venue.id}`;
  assert.match(html, new RegExp(`<div class="golf-desc" id="${descId}"><p>A fixture golf course used only by the automated test suite\\.</p></div>`));
  assert.match(html, new RegExp(`<button type="button" class="desc-toggle" aria-expanded="false" aria-controls="${descId}" hidden>Read more &rarr;</button>`));
  // The description text itself is untouched -- only wrapped.
  assert.ok(html.includes(`<p>${venue.description}</p>`));
});

test('REGRESSION: non-Golf venue cards are unchanged by the Golf engagement feature', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const html = app.venueCardHtml(venue);
  assert.match(html, /<li class="venue-card">/);
  assert.doesNotMatch(html, /golf-desc|desc-toggle|data-venue-category|data-venue-id/);
  assert.ok(html.includes(`<p>${venue.description}</p>`));
});

test('Golf category pages (region + Okanagan-wide) carry the GA4 snippet, trackEvent wrapper, and card engagement script', () => {
  const kelownaGolf = app.getVenuesByRegionCategory('kelowna', 'golf');
  const regionHtml = app.renderCategoryPage('kelowna', 'golf', kelownaGolf, []);
  const allHtml = app.renderCategoryAllRegionsPage('golf', app.getVenuesByCategory ? app.getVenuesByCategory('golf') : kelownaGolf);
  for (const html of [regionHtml, allHtml]) {
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-J312FGJPSC/);
    assert.match(html, /gtag\('config', 'G-J312FGJPSC'\)/);
    assert.match(html, /window\.trackEvent = function\(name, params\)/);
    assert.match(html, /\.venue-card\[data-venue-category="golf"\]/);
    assert.match(html, /'description_expand'/);
    assert.match(html, /'venue_impression'/);
    assert.match(html, /IntersectionObserver/);
  }
  // Existing Courses / Indoor split still rendered the same way.
  assert.match(regionHtml, /<h2 class="category-subsection-heading">Kelowna Golf Courses<\/h2>/);
  assert.match(regionHtml, /<h2 class="category-subsection-heading">Kelowna Indoor Golf &amp; Simulators<\/h2>/);
});

test('REGRESSION: non-Golf category pages get no analytics snippet or engagement script', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'restaurant');
  const html = app.renderCategoryPage('kelowna', 'restaurant', rows, []);
  assert.doesNotMatch(html, /googletagmanager|window\.trackEvent|description_expand|venue_impression|data-venue-category="golf" data-venue-name/);
});

test('Golf venue page tags website/directions/phone links with data-track and ships the venue engagement script', () => {
  // kelowna fixture: address + coordinates -> Get Directions + map link, no website/phone
  const kelownaGolf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const html = app.renderVenuePage(kelownaGolf, [], [], []);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-J312FGJPSC/);
  assert.match(html, /<a class="cta secondary" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=49\.89,-119\.49" rel="nofollow noopener" target="_blank" data-track="directions">Get Directions<\/a>/);
  assert.match(html, /class="map-link"[^>]*data-track="directions"/);
  assert.match(html, new RegExp(`"venue_id":${kelownaGolf.id},"venue_name":"Test Golf Course","venue_region":"kelowna","venue_category":"golf","surface":"venue_page"`));
  assert.match(html, /track\('venue_view', ctx\(\)\)/);
  assert.match(html, /'outbound_click'/);
  assert.match(html, /a\[data-track\]/);
  // Description on the venue page is untouched (no clamp/toggle there --
  // the .desc-toggle CSS rule is inlined on every page, so check for the
  // button element specifically).
  assert.ok(html.includes(`<p class="venue-description">${kelownaGolf.description}</p>`));
  assert.doesNotMatch(html, /<button[^>]*desc-toggle/);

  // west-kelowna fixture has a website -> Visit Website + Good-to-Know link are tagged
  const wk = app.getVenuesByRegionCategory('west-kelowna', 'golf')[0];
  const wkHtml = app.renderVenuePage(wk, [], [], []);
  assert.match(wkHtml, /<a class="cta" href="https:\/\/[^"]+" rel="nofollow noopener" target="_blank" data-track="website">Visit Website<\/a>/);
  assert.match(wkHtml, /<a href="https:\/\/[^"]+" rel="nofollow noopener" target="_blank" data-track="website">/);
});

test('Golf venue page shows all five actions: Website, Get Directions, Call, Favorite, Add to Trip', () => {
  const base = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course'); // has coords
  const venue = Object.assign({}, base, { website: 'https://example-golf.test/', phone: '+1 250-555-0100' });
  const html = app.renderVenuePage(venue, [], [], []);
  const row = html.match(/<div class="venue-cta-row"([^>]*)>([\s\S]*?)<\/div>/);
  assert.ok(row, 'cta row present');
  assert.match(row[1], /data-venue-category="golf" data-venue-name="Test Golf Course" data-surface="venue_page"/);
  const body = row[2];
  assert.match(body, /class="cta" href="https:\/\/example-golf\.test\/"[^>]*data-track="website">Visit Website</);
  assert.match(body, /class="cta secondary" href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*data-track="directions">Get Directions</);
  assert.match(body, /class="cta secondary" href="tel:\+1 250-555-0100" data-track="phone">Call</);
  assert.match(body, /class="card-action fav-btn" data-fav-name="Test Golf Course" aria-pressed="false"/);
  assert.match(body, /class="card-action trip-btn" data-trip-name="Test Golf Course" data-trip-query="Test Golf Course, Kelowna, Okanagan Valley, BC" data-trip-region="kelowna" aria-pressed="false"/);
  assert.equal((body.match(/<(a|button)\b/g) || []).length, 5, 'exactly five actions');
  // The venue script carries the shared fav/trip module.
  for (const needle of ["'okanaganFavorites'", "'okanaganTrip'", "'venue_favorite'", "'add_to_trip'", "track('venue_view'"]) {
    assert.ok(html.includes(needle), `expected ${needle} in golf venue page script`);
  }
});

test('Golf pages use the homepage visual system (app.css + reused header + golf-page theme); non-Golf pages do not', () => {
  const golfRows = app.getVenuesByRegionCategory('kelowna', 'golf');
  const golfCategory = app.renderCategoryPage('kelowna', 'golf', golfRows, []);
  const golfAll = app.renderCategoryAllRegionsPage('golf', golfRows);
  const golfVenue = app.renderVenuePage(app.findVenueBySlug('kelowna', 'golf', 'test-golf-course'), [], [], []);
  for (const html of [golfCategory, golfAll, golfVenue]) {
    assert.match(html, /<link rel="stylesheet" href="\/styles\/app\.css">/);
    assert.ok(html.indexOf('/styles/app.css') < html.indexOf('<style>'), 'app.css loads before the inline SEO CSS so SEO rules win ties');
    assert.match(html, /body\.golf-page \{/);
    assert.match(html, /<body class="golf-page">/);
    assert.match(html, /<header id="top">/, 'homepage header markup reused');
    assert.match(html, /class="logo-wordmark">Okanagan<span class="logo-wordmark-accent"> Roam<\/span>/);
    assert.match(html, /<a class="app-btn" id="navTripBtn" href="\/trip">/);
    assert.doesNotMatch(html, /<button class="nav-search-btn"|<button class="lang-toggle"|<header class="top">/);
    assert.match(html, /href="\/#hiddenGems"/);
    assert.match(html, /<main class="wrap-wide golf-main">[\s\S]*<\/main>/);
    // Site-wide floating Trip control: the homepage's own #tripTray fragment,
    // driven by the homepage's app.js (same as /trip) -- not a Golf copy.
    assert.match(html, /<div id="tripTray">[\s\S]*<button id="tripTrayToggle">[\s\S]*<span id="tripTrayCount">0<\/span>/);
    assert.ok(html.indexOf('<div id="tripTray">') < html.indexOf('<header id="top">'), 'tray precedes the header, as on / and /trip');
    assert.match(html, /<div id="floatingTooltip"><\/div>/);
    assert.match(html, /<script src="\/scripts\/app\.js"><\/script>/);
    assert.ok(html.indexOf('<script src="/scripts/app.js">') < html.lastIndexOf('<script>'), 'app.js loads before the Golf engagement script');
    assert.match(html, /body\.golf-page \.venue-card \.card-links \{ display: none; \}/);
    assert.doesNotMatch(html, /getElementById\('navHamburger'\)/, 'no duplicate nav handlers alongside app.js');
  }
  const restaurants = app.renderCategoryPage('kelowna', 'restaurant', app.getVenuesByRegionCategory('kelowna', 'restaurant'), []);
  const restaurantVenue = app.renderVenuePage(app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria'), [], [], []);
  for (const html of [restaurants, restaurantVenue]) {
    assert.doesNotMatch(html, /<link rel="stylesheet" href="\/styles\/app\.css">|golf-page|<header id="top">|golf-main|id="tripTray"|scripts\/app\.js"><\/script>/);
    assert.match(html, /<header class="top">/);
    assert.match(html, /<body>/);
  }
});

// Golf venue page polish (2026-09-20): the hero carries the page's single
// <h1>; the block below opens with the meta line (no repeated title); an
// "At a glance" card renders only from the curated, description-derived
// facts; the polish styles ship only on golf venue pages.
test('Golf venue page: hero is the title treatment, header does not repeat it, indoor venues read "Indoor Golf"', () => {
  const course = app.renderVenuePage(app.findVenueBySlug('kelowna', 'golf', 'test-golf-course'), [], [], []);
  assert.match(course, /<div class="venue-hero venue-hero-fallback venue-hero-golf">\s*<span class="venue-hero-type">Golf Course<\/span>\s*<h1>Test Golf Course<\/h1>\s*<\/div>/);
  assert.equal((course.match(/<h1[\s>]/g) || []).length, 1, 'exactly one <h1> on the page');
  assert.match(course, /<div class="venue-header">\s*<p class="venue-at-a-glance">Golf Course &middot; <a href="\/kelowna">Kelowna<\/a><\/p>/, 'header opens with the meta line, not a second title');
  assert.doesNotMatch(course, /<span class="venue-hero-name">/, 'hero name span replaced by the <h1> on golf pages');
  assert.match(course, /<style>\s*\/\* Hero: same per-type gradient/, 'themed polish styles present');
  assert.match(course, /body\.golf-page \.venue-hero-fallback h1 \{/);
  assert.match(course, /body\.golf-page \.venue-hero-fallback\.venue-hero-golf \{ box-shadow/);
  // Fixture has no curated facts -> no card (the CSS still names the class).
  assert.doesNotMatch(course, /<div class="venue-section golf-glance">|<h2>At a glance<\/h2>/);

  const sim = app.renderVenuePage(app.findVenueBySlug('kelowna', 'golf', 'test-golf-simulator'), [], [], []);
  assert.match(sim, /<span class="venue-hero-type">Indoor Golf<\/span>\s*<h1>Test Golf Simulator<\/h1>/);
  assert.match(sim, /<p class="venue-at-a-glance">Indoor Golf &middot; <a href="\/kelowna">Kelowna<\/a><\/p>/);
  assert.match(sim, /<div class="detail-row"><span class="label">Type<\/span><span>Indoor Golf<\/span>/, 'Good to Know Type matches the hero for simulator venues');
  assert.match(sim, /"@type":"GolfCourse"/, 'JSON-LD type unchanged');
  assert.match(course, /<div class="detail-row"><span class="label">Type<\/span><span>Golf Course<\/span>/);
});

test('Golf theme keeps the shared footer links visible (golf and beach pages)', () => {
  const golf = app.renderVenuePage(app.findVenueBySlug('kelowna', 'golf', 'test-golf-course'), [], [], []);
  const beach = app.renderVenuePage(app.findVenueBySlug('kelowna', 'beach', 'test-beach-park'), [], [], []);
  const restaurant = app.renderVenuePage(app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria'), [], [], []);
  const rule = /body\.golf-page \.home-footer-col a, body\.golf-page \.home-footer-region-group a \{ color: rgba\(245,243,237,0\.78\); \}/;
  for (const html of [golf, beach]) {
    assert.match(html, /body\.golf-page a \{ color: var\(--ref-navy\); \}/);
    assert.match(html, rule, 'footer link colour restated inside the golf theme');
    assert.match(html, /<footer class="home-footer">/);
  }
  assert.doesNotMatch(restaurant, rule);
});

test('Golf "At a glance" card renders only curated facts, escaped, in a dl grid; empty for other categories', () => {
  const keys = Object.keys(app.GOLF_AT_A_GLANCE_FACTS);
  assert.ok(keys.length >= 40, 'curated facts cover the production golf inventory');
  for (const key of keys) {
    assert.match(key, /^[a-z-]+\/[a-z0-9-]+$/, `key ${key} is region/slug`);
    const facts = app.GOLF_AT_A_GLANCE_FACTS[key];
    assert.ok(Array.isArray(facts) && facts.length > 0 && facts.length <= 8, `${key}: 1-8 facts`);
    for (const [lbl, val] of facts) {
      assert.ok(typeof lbl === 'string' && lbl.length && typeof val === 'string' && val.length, `${key}: label/value strings`);
    }
  }
  const [sampleKey] = keys;
  const [region, slug] = sampleKey.split('/');
  const fake = { id: 999999, type: 'golf', region, slug, name: 'Sample & Co', description: '', redirect_to: null };
  const html = app.golfAtAGlanceHtml(fake);
  assert.match(html, /^<div class="venue-section golf-glance">\s*<h2>At a glance<\/h2>\s*<dl>/);
  assert.equal((html.match(/<div class="golf-glance-item"><dt>/g) || []).length, app.GOLF_AT_A_GLANCE_FACTS[sampleKey].length);
  assert.equal(app.golfAtAGlanceHtml({ ...fake, type: 'beach' }), '', 'not for beaches');
  assert.equal(app.golfAtAGlanceHtml({ ...fake, redirect_to: 1 }), '', 'not for redirected rows');
  assert.equal(app.golfAtAGlanceHtml({ ...fake, slug: 'no-such-course' }), '', 'no entry -> no card');
  // A curated value containing markup-significant characters is escaped.
  const escaped = app.golfAtAGlanceHtml({ ...fake, slug: 'tower-ranch-golf-country-club', region: 'kelowna' });
  assert.doesNotMatch(escaped, /<[^\/dhl]/, 'only dl/dt/dd/div/h2 tags are emitted');
  assert.match(escaped, /<dd>Carrington’s Restaurant &amp; Patio; fitness; events<\/dd>/, 'ampersand escaped, typographic apostrophe intact');
  for (const facts of Object.values(app.GOLF_AT_A_GLANCE_FACTS)) {
    assert.ok(facts.length <= 6, 'cards are capped at six items');
    for (const [, val] of facts) assert.ok(val.length <= 60, `value kept scannable: ${val}`);
  }
});

// Beach venue pages (2026-09-20) get the same hero/<h1> hierarchy and the
// URL-wrap rule, but never the golf At-a-glance card or "Indoor Golf".
test('Beach venue page: hero carries the <h1>, header opens with "Beach · Region", no golf card', () => {
  const beach = app.renderVenuePage(app.findVenueBySlug('kelowna', 'beach', 'test-beach-park'), [], [], []);
  assert.match(beach, /<div class="venue-hero venue-hero-fallback venue-hero-beach">\s*<span class="venue-hero-type">Beach<\/span>\s*<h1>Test Beach Park<\/h1>\s*<\/div>/);
  assert.equal((beach.match(/<h1[\s>]/g) || []).length, 1, 'exactly one <h1> on the page');
  assert.match(beach, /<div class="venue-header">\s*<p class="venue-at-a-glance">Beach &middot; <a href="\/kelowna">Kelowna<\/a><\/p>/);
  assert.doesNotMatch(beach, /<span class="venue-hero-name">/);
  assert.match(beach, /<style>\s*\/\* Hero: same per-type gradient/, 'themed polish styles present on beach pages');
  assert.match(beach, /body\.golf-page \.venue-hero-fallback\.venue-hero-beach \{ box-shadow/);
  assert.match(beach, /body\.golf-page \.venue-key-info \.detail-row a \{ overflow-wrap: anywhere; \}/, 'long official URLs wrap on phones');
  assert.doesNotMatch(beach, /<div class="venue-section golf-glance">|<h2>At a glance<\/h2>|venue-hero-type">Indoor Golf</);
  assert.match(beach, /<div class="detail-row"><span class="label">Type<\/span><span>Beach<\/span>/);
  assert.match(beach, /"@type":"Beach"/);
});

// Okanagan-wide listing cards (2026-09-20): the meta line leads with the
// venue's community (REGION_LABELS[venue.region]) so identically named
// venues in different communities are distinguishable; regional listings
// and every other card surface are unchanged.
test('All-regions category cards show their community; regional category cards do not', () => {
  const golfRows = app.getVenuesByRegionCategory('kelowna', 'golf').concat(app.getVenuesByRegionCategory('vernon', 'golf'));
  const beachRows = app.getVenuesByRegionCategory('kelowna', 'beach').concat(app.getVenuesByRegionCategory('vernon', 'beach'));
  const allGolf = app.renderCategoryAllRegionsPage('golf', golfRows);
  const allBeach = app.renderCategoryAllRegionsPage('beach', beachRows);
  assert.match(allGolf, /Test Golf Course<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta">Kelowna<\/p>/);
  assert.match(allGolf, /<p class="venue-meta">Vernon<\/p>/, 'a Vernon golf fixture card names Vernon');
  assert.match(allBeach, /Test Beach Park<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta">Kelowna<\/p>/);
  assert.match(allBeach, /<p class="venue-meta">Vernon<\/p>/);
  // The card keeps its name link, badges line and Favorite / Add to Trip actions.
  assert.match(allBeach, /<p class="venue-meta">Kelowna<\/p>[\s\S]*?<p class="chips">[\s\S]*?<div class="card-actions">/);
  // Regional listings are unchanged: empty meta line for the same fixtures.
  const regionalGolf = app.renderCategoryPage('kelowna', 'golf', app.getVenuesByRegionCategory('kelowna', 'golf'), []);
  const regionalBeach = app.renderCategoryPage('kelowna', 'beach', app.getVenuesByRegionCategory('kelowna', 'beach'), []);
  assert.match(regionalGolf, /Test Golf Course<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta"><\/p>/);
  assert.match(regionalBeach, /Test Beach Park<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta"><\/p>/);
  assert.doesNotMatch(regionalGolf, /<p class="venue-meta">Kelowna<\/p>/);
  // Non-themed cards (restaurant) are unchanged too.
  const restaurants = app.renderCategoryPage('kelowna', 'restaurant', app.getVenuesByRegionCategory('kelowna', 'restaurant'), []);
  assert.doesNotMatch(restaurants, /<p class="venue-meta">Kelowna(?: &middot;|<)/);
});

test('REGRESSION: themed venue polish is confined to golf and beach venue pages (restaurant pages and listings unchanged)', () => {
  const restaurantVenue = app.renderVenuePage(app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria'), [], [], []);
  assert.doesNotMatch(restaurantVenue, /golf-glance|At a glance|Hero: same per-type gradient|overflow-wrap: anywhere|venue-hero-type">Indoor Golf</);
  assert.match(restaurantVenue, /<div class="venue-header">\s*<h1>Test /, 'non-themed pages keep the <h1> in the header');
  assert.match(restaurantVenue, /<span class="venue-hero-name">/);
  const golfRows = app.getVenuesByRegionCategory('kelowna', 'golf');
  const beachRows = app.getVenuesByRegionCategory('kelowna', 'beach');
  for (const html of [app.renderCategoryPage('kelowna', 'golf', golfRows, []), app.renderCategoryAllRegionsPage('golf', golfRows), app.renderCategoryPage('kelowna', 'beach', beachRows, []), app.renderCategoryAllRegionsPage('beach', beachRows)]) {
    assert.doesNotMatch(html, /<div class="venue-section golf-glance">|Hero: same per-type gradient/);
  }
});

test('REGRESSION: non-Golf venue pages carry no data-track attributes, analytics snippet, or engagement script', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria'); // has phone, address, coords
  const html = app.renderVenuePage(venue, [], [], []);
  assert.doesNotMatch(html, /data-track=|googletagmanager|window\.trackEvent|venue_view|outbound_click/);
  assert.match(html, /<a class="cta secondary" href="tel:\+1 250-555-0100">Call<\/a>/);
});

// ==== Golf card Favorite + Add to Trip (2026-09-19, Golf only) ===========
//
// Reuses the homepage's fav-btn / trip-btn conventions and localStorage
// keys (okanaganFavorites, okanaganTrip) so the existing Trip Planner and
// favourites filter see what is chosen on Golf cards.

test('Golf listing card actions are ONLY Favorite and Add to Trip (no website / phone / directions on the card)', () => {
  // west-kelowna fixture has a website; add a phone + coords to prove none of them leak onto the card.
  const wk = Object.assign({}, app.getVenuesByRegionCategory('west-kelowna', 'golf')[0], { phone: '+1 250-555-0199', latitude: 49.83, longitude: -119.63 });
  const html = app.venueCardHtml(wk);
  assert.match(html, /<li class="venue-card" data-venue-id="\d+" data-venue-region="west-kelowna" data-venue-category="golf" data-venue-name="[^"]+" data-surface="category_card">/);
  assert.match(html, /<div class="card-actions">/);
  const escapedName = wk.name.replace(/&/g, '&amp;');
  assert.ok(html.includes(`<button type="button" class="card-action fav-btn" data-fav-name="${escapedName}" aria-pressed="false" aria-label="Favorite ${escapedName}">&#9825; Favorite</button>`));
  assert.ok(html.includes(`<button type="button" class="card-action trip-btn" data-trip-name="${escapedName}" data-trip-query="${escapedName}, West Kelowna, Okanagan Valley, BC" data-trip-region="west-kelowna" aria-pressed="false" aria-label="Add ${escapedName} to trip">&#65291; Add to Trip</button>`));
  assert.doesNotMatch(html, /data-track=|href="https?:|href="tel:|google\.com\/maps|Website|Call |Directions/);
  const actions = html.match(/<div class="card-actions">([\s\S]*?)<\/div>/)[1];
  assert.equal((actions.match(/<(a|button)\b/g) || []).length, 2, 'exactly two actions on the card');
  // Actions come after the chips (badge area); description untouched.
  assert.ok(html.indexOf('<p class="chips">') < html.indexOf('<div class="card-actions">'));
  assert.ok(html.includes(`<p>${wk.description}</p>`));
});

test('Golf listing card: the venue name is the single link to the detail page, with an aria-hidden View details cue', () => {
  const golf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const html = app.venueCardHtml(golf);
  assert.match(html, /<h2><a class="venue-card-link" href="\/kelowna\/golf\/test-golf-course"><span class="venue-card-name">Test Golf Course<\/span><span class="venue-card-cue" aria-hidden="true">View details &rarr;<\/span><\/a><\/h2>/);
  const links = html.match(/<a\b[^>]*href="[^"]*"/g) || [];
  assert.equal(links.length, 1, 'exactly one navigation link on the card (the name)');
  assert.equal((html.match(/href="\/kelowna\/golf\/test-golf-course"/g) || []).length, 1, 'no duplicate link to the same destination');
  // Actions are still only Favorite + Add to Trip.
  const actions = html.match(/<div class="card-actions">([\s\S]*?)<\/div>/)[1];
  assert.equal((actions.match(/<(a|button)\b/g) || []).length, 2);
  // Non-Golf title markup unchanged.
  const trattoria = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  assert.match(app.venueCardHtml(trattoria), /<h2><a href="\/kelowna\/restaurants\/test-trattoria">Test Trattoria<\/a><\/h2>/);
  assert.doesNotMatch(app.venueCardHtml(trattoria), /venue-card-link|venue-card-cue/);
});

test('REGRESSION: non-Golf venue cards have no Favorite / Add to Trip row', () => {
  const venue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const html = app.venueCardHtml(venue);
  assert.doesNotMatch(html, /card-actions|card-action|fav-btn|trip-btn|data-track=/);
});

test('Golf category page script reuses the homepage storage keys and reports the four engagement events', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'golf');
  const html = app.renderCategoryPage('kelowna', 'golf', rows, []);
  for (const needle of ["'okanaganFavorites'", "'okanaganTrip'", "'venue_favorite'", "'venue_unfavorite'", "'add_to_trip'", "'remove_from_trip'", 'MAX_STOPS = 10', "window.__syncTripButtons", "'[data-venue-category=\"golf\"]'"]) {
    assert.ok(html.includes(needle), `expected ${needle} in golf category page script`);
  }
  const restaurantHtml = app.renderCategoryPage('kelowna', 'restaurant', app.getVenuesByRegionCategory('kelowna', 'restaurant'), []);
  assert.doesNotMatch(restaurantHtml, /okanaganFavorites|okanaganTrip|<div class="card-actions">/);
});


// ==== Editorial collection membership: Hidden Gem + Local Favourite (2026-09-19) ====
//
// Membership for both badge kinds is written through one guarded function
// (HTTP coverage lives inside the single 'HTTP routes' test above). These
// run without the HTTP server so they always execute, even where port
// 3001 is occupied.

test('db bootstrap creates the local-favourites collection once, with no members, and leaves hidden-gems alone', () => {
  const rows = JSON.parse(JSON.stringify(db.prepare("SELECT slug, kind, title FROM collections WHERE slug IN ('hidden-gems','local-favourites') ORDER BY kind").all()));
  assert.deepEqual(rows, [
    { slug: 'hidden-gems', kind: 'hidden_gem', title: 'Hidden Gems' },
    { slug: 'local-favourites', kind: 'local_favorite', title: 'Local Favourites' },
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM collections WHERE slug = 'local-favourites'").get().n, 1);
  assert.equal(app.getCollectionVenueIds('local_favorite').size, 0, 'no Local Favourite members are seeded');
  assert.ok(app.getKnownDiscoveryKinds().includes('local_favorite'));
});

test('guardedCollectionMembershipUpdate: add + remove for both kinds, with one audit row per change', () => {
  const golf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const meta = { reason: 'unit test', batch_id: 'unit-cm-batch' };
  const before = db.prepare('SELECT COUNT(*) AS n FROM venue_enrichment_log').get().n;

  for (const kind of ['hidden_gem', 'local_favorite']) {
    const added = app.guardedCollectionMembershipUpdate(kind, golf.id, 'add', `note for ${kind}`, meta);
    assert.deepEqual({ ok: added.ok, kind: added.kind, venue_id: added.venue_id, action: added.action }, { ok: true, kind, venue_id: golf.id, action: 'add' });
    assert.ok(app.getCollectionVenueIds(kind).has(golf.id));
    const item = db.prepare(`SELECT ci.note, ci.position FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE c.kind = ? AND ci.content_id = ?`).get(kind, golf.id);
    assert.equal(item.note, `note for ${kind}`);
    assert.ok(Number.isInteger(item.position) && item.position >= 1, 'position is appended, not null');
    assert.deepEqual(app.guardedCollectionMembershipUpdate(kind, golf.id, 'add', null, meta), { ok: false, reason: 'already_member' });
  }
  assert.ok(app.getHiddenGemVenueIds().has(golf.id), 'hidden_gem membership also flows through the existing hidden-gem lookup');

  for (const kind of ['hidden_gem', 'local_favorite']) {
    const removed = app.guardedCollectionMembershipUpdate(kind, golf.id, 'remove', null, meta);
    assert.equal(removed.ok, true);
    assert.ok(!app.getCollectionVenueIds(kind).has(golf.id));
    assert.deepEqual(app.guardedCollectionMembershipUpdate(kind, golf.id, 'remove', null, meta), { ok: false, reason: 'not_member' });
  }
  const after = db.prepare('SELECT COUNT(*) AS n FROM venue_enrichment_log').get().n;
  assert.equal(after - before, 4, 'exactly one audit row per successful change (2 adds + 2 removes)');
  const kinds = db.prepare("SELECT field_name FROM venue_enrichment_log WHERE batch_id = 'unit-cm-batch' ORDER BY id").all().map((r) => r.field_name);
  assert.deepEqual(kinds, ['collection:hidden_gem', 'collection:local_favorite', 'collection:hidden_gem', 'collection:local_favorite']);
});

test('guardedCollectionMembershipUpdate rejects unknown kinds, unknown venues, and redirected venues without writing', () => {
  const golf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const redirected = db.prepare("SELECT id FROM venues WHERE slug = 'ds4-redirected-gem'").get();
  const meta = { reason: 'unit test', batch_id: 'unit-cm-reject' };
  assert.deepEqual(app.guardedCollectionMembershipUpdate('roam_picks', golf.id, 'add', null, meta), { ok: false, reason: 'unknown_kind' });
  assert.deepEqual(app.guardedCollectionMembershipUpdate('local_favorite', 999999, 'add', null, meta), { ok: false, reason: 'venue_not_found' });
  assert.deepEqual(app.guardedCollectionMembershipUpdate('local_favorite', redirected.id, 'add', null, meta), { ok: false, reason: 'venue_redirected' });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_enrichment_log WHERE batch_id = 'unit-cm-reject'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM collections WHERE kind = 'roam_picks'").get().n, 0, 'a request can never create a collection kind');
});

test('Local Favourite and Hidden Gem badges render on cards, the venue page, and related cards; non-members are byte-identical', () => {
  const golf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const other = app.findVenueBySlug('vernon', 'golf', 'test-vernon-golf-course');
  const trattoria = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const meta = { reason: 'render test', batch_id: 'unit-cm-render' };

  const plainCard = app.venueCardHtml(golf);
  const plainTrattoria = app.venueCardHtml(trattoria);
  const plainCategory = app.renderCategoryPage('kelowna', 'golf', app.getVenuesByRegionCategory('kelowna', 'golf'), []);
  const plainRestaurants = app.renderCategoryPage('kelowna', 'restaurant', app.getVenuesByRegionCategory('kelowna', 'restaurant'), []);

  app.guardedCollectionMembershipUpdate('local_favorite', golf.id, 'add', null, meta);
  app.guardedCollectionMembershipUpdate('hidden_gem', golf.id, 'add', null, meta);

  const cardOpt = app.venueCardHtml(golf, { isHiddenGem: true, isLocalFavourite: true });
  assert.match(cardOpt, /<p class="chips"><span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem<\/span> <span class="chip local-favourite-badge">\u2665 Local Favourite<\/span> <\/p>/u);
  assert.equal(app.venueCardHtml(golf), plainCard, 'without the option flags the card is unchanged');

  const category = app.renderCategoryPage('kelowna', 'golf', app.getVenuesByRegionCategory('kelowna', 'golf'), []);
  assert.match(category, /local-favourite-badge">\u2665 Local Favourite/);
  assert.match(category, /hidden-gem-badge">\u{1F48E} Hidden Gem/u);
  assert.notEqual(category, plainCategory);
  const all = app.renderCategoryAllRegionsPage('golf', app.getVenuesByRegionCategory('kelowna', 'golf'));
  assert.match(all, /local-favourite-badge/);

  const venuePage = app.renderVenuePage(golf, [], [], []);
  assert.match(venuePage, /<p class="chips"><span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem<\/span> <span class="chip local-favourite-badge">\u2665 Local Favourite<\/span> <\/p>/u);
  const otherPage = app.renderVenuePage(other, [golf], [golf], []);
  assert.match(otherPage, /related-meta">[^<]*<span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem<\/span> <span class="chip local-favourite-badge">\u2665 Local Favourite<\/span>/u);

  // Non-member regression: another golf card and a restaurant page are byte-identical.
  assert.equal(app.venueCardHtml(trattoria), plainTrattoria);
  assert.equal(app.renderCategoryPage('kelowna', 'restaurant', app.getVenuesByRegionCategory('kelowna', 'restaurant'), []), plainRestaurants);
  assert.doesNotMatch(app.venueCardHtml(other), /local-favourite-badge|hidden-gem-badge/);

  app.guardedCollectionMembershipUpdate('local_favorite', golf.id, 'remove', null, meta);
  app.guardedCollectionMembershipUpdate('hidden_gem', golf.id, 'remove', null, meta);
  assert.equal(app.renderCategoryPage('kelowna', 'golf', app.getVenuesByRegionCategory('kelowna', 'golf'), []), plainCategory, 'removal restores the page byte-for-byte');
});

test('REGRESSION: the six seeded Hidden Gems block in db.js is unchanged', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const members = src.match(/const HIDDEN_GEMS_MEMBERS = \[([\s\S]*?)\];/)[1];
  const ids = [...members.matchAll(/venue_id: (\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(ids, [128, 100, 685, 47, 816, 1038]);
});

// ==== Beaches Phase 2 (2026-09-19) ========================================
// Beaches are the second category rendered with the approved homepage
// design system that Golf introduced. Golf's deployed implementation is
// untouched; each Golf gate simply also admits the types in
// THEMED_CATEGORY_TYPES. These tests cover the taxonomy, both listing
// pages, the venue page, the CTA rules (nothing fabricated), the
// temporary-condition advisory collection, the trip-planner exclusion,
// and -- most importantly -- that the FROZEN homepage is byte-identical
// before and after beach data exists.

const beachFixture = () => app.findVenueBySlug('kelowna', 'beach', 'test-beach-park');
const bareBeachFixture = () => app.findVenueBySlug('kelowna', 'beach', 'test-bare-beach');

test('Beaches taxonomy: type, slug, labels, tagline, gradient, image, schema type, wide page and back-label', () => {
  assert.equal(app.CATEGORY_SLUGS.beach, 'beaches');
  assert.equal(app.SLUG_TO_TYPE ? app.SLUG_TO_TYPE.beaches : 'beach', 'beach');
  assert.deepEqual(app.CATEGORY_LABELS.beach, { singular: 'Beach', plural: 'Beaches' });
  assert.equal(typeof app.CATEGORY_TAGLINES.beach, 'string');
  assert.deepEqual(app.TYPE_ACCENT_GRADIENTS.beach, ['#1B2B3A', '#101B24'], 'beach gradient must be the tokens.css --ref-navy / --ref-navy-deep pair');
  assert.equal(app.HIDDEN_GEM_TYPE_IMAGE.beach, '/images/mood/beaches.webp');
  assert.equal(app.SCHEMA_TYPE_MAP.beach, 'Beach');
  assert.ok(app.ALL_REGIONS_CATEGORIES.includes('beach'), '/beaches Okanagan-wide page must be enabled');
  assert.ok(app.ALL_REGIONS_CATEGORIES.includes('golf'), 'enabling Beaches must not disable Golf');
  assert.ok(app.THEMED_CATEGORY_TYPES.has('beach') && app.THEMED_CATEGORY_TYPES.has('golf'));
  assert.equal(app.usesThemedCategoryLayout('beach'), true);
  assert.equal(app.usesThemedCategoryLayout('restaurant'), false);
  assert.equal(app.themedBodyClassAttr('golf'), ' class="golf-page"', 'Golf body class is exactly what was deployed');
  assert.equal(app.themedBodyClassAttr('beach'), ' class="golf-page beach-page"');
  assert.equal(app.themedBodyClassAttr('restaurant'), '');
});

test('Beaches: fixture rows exist and are served by the generic lookups', () => {
  const b = beachFixture();
  assert.ok(b && b.type === 'beach');
  assert.equal(app.getVenuesByRegionCategory('kelowna', 'beach').length, 2);
  assert.equal(app.getVenuesByCategory('beach').length, 3);
  assert.equal(app.getRegionCategoryCounts('kelowna').beach, 2);
});

test('Beaches regional listing page reuses the Golf design system: theme, header, tray, cards, actions, scripts', () => {
  const venues = app.getVenuesByRegionCategory('kelowna', 'beach');
  const html = app.renderCategoryPage('kelowna', 'beach', venues, []);
  assert.match(html, /<h1>Beaches in Kelowna, BC<\/h1>/);
  assert.match(html, /<body class="golf-page beach-page">/);
  assert.match(html, /<link rel="stylesheet" href="\/styles\/app\.css">/);
  assert.match(html, /<div id="tripTray">/, 'site-wide floating Trip tray fragment must be present');
  assert.match(html, /<header id="top">/, 'homepage header fragment must be reused');
  assert.match(html, /<script src="\/scripts\/app\.js"><\/script>/);
  assert.match(html, /<a class="category-back-link" href="\/beaches">← All Beaches<\/a>/);
  // Cards
  assert.match(html, /<li class="venue-card" data-venue-id="\d+" data-venue-region="kelowna" data-venue-category="beach" data-venue-name="Test Beach Park" data-surface="category_card">/);
  assert.match(html, /<a class="venue-card-link" href="\/kelowna\/beaches\/test-beach-park"><span class="venue-card-name">Test Beach Park<\/span><span class="venue-card-cue" aria-hidden="true">View details &rarr;<\/span><\/a>/);
  assert.match(html, /<div class="golf-desc" id="golf-desc-\d+"><p>A fixture public beach/, 'clamped description + Read more toggle reused');
  assert.match(html, /<button type="button" class="desc-toggle" aria-expanded="false" aria-controls="golf-desc-\d+" hidden>Read more &rarr;<\/button>/);
  assert.match(html, /class="card-action fav-btn" data-fav-name="Test Beach Park"/);
  assert.match(html, /class="card-action trip-btn" data-trip-name="Test Beach Park" data-trip-query="Test Beach Park, Kelowna, Okanagan Valley, BC" data-trip-region="kelowna"/);
  // Listing cards carry only Favorite + Add to Trip -- never website/phone/directions.
  const cardBlock = html.slice(html.indexOf('data-venue-name="Test Beach Park"'), html.indexOf('</li>', html.indexOf('data-venue-name="Test Beach Park"')));
  assert.doesNotMatch(cardBlock, /Visit Website|Get Directions|tel:|google\.com\/maps/);
  // Engagement + Favorite/Trip script is keyed to the beach attribute.
  assert.match(html, /querySelectorAll\('\.venue-card\[data-venue-category="beach"\]'\)/);
  assert.match(html, /var HOLDER = '\[data-venue-category="beach"\]';/);
  assert.match(html, /venue_category: 'beach',/);
  // Beach theme styles are derived from the Golf rules and keyed to beach.
  assert.match(html, /\.venue-card\[data-venue-category="beach"\] \.card-actions \{/);
  assert.match(html, /body\.golf-page \.venue-card\[data-venue-category="beach"\] \.fav-btn\.is-fav,/);
  // The Golf-only indoor/outdoor split must not apply to Beaches.
  assert.doesNotMatch(html, /<h2 class="category-subsection-heading"/, 'no Golf Courses / Indoor Golf subsection headings on a Beaches page');
});

test('Beaches Okanagan-wide page (/beaches) lists only regions that have beaches in its region selector', () => {
  const venues = app.getVenuesByCategory('beach');
  const html = app.renderCategoryAllRegionsPage('beach', venues);
  assert.match(html, /<h1>Beaches in the Okanagan<\/h1>/);
  assert.match(html, /<body class="golf-page beach-page">/);
  assert.match(html, /href="\/kelowna\/beaches"/);
  assert.match(html, /href="\/vernon\/beaches"/);
  assert.doesNotMatch(html, /href="\/osoyoos\/beaches"/, 'selector must NOT list a region with zero beach venues');
  assert.doesNotMatch(html, /href="\/penticton\/beaches"/);
  assert.match(html, /Test Vernon Beach/);
});

test('Beach venue page: Beach JSON-LD, hero, five-action CTA row (no Call when phone is null), back-link, tray and scripts', () => {
  const b = beachFixture();
  const html = app.renderVenuePage(b, [], [], []);
  assert.match(html, /<title>Test Beach Park — Beach in Kelowna, BC \| Okanagan Roam<\/title>/);
  assert.match(html, /"@type":"Beach"/);
  assert.match(html, /"geo":\{"@type":"GeoCoordinates","latitude":49\.86,"longitude":-119\.49\}/);
  assert.match(html, /<body class="golf-page beach-page">/);
  assert.match(html, /<div id="tripTray">/);
  assert.match(html, /venue-hero venue-hero-fallback venue-hero-beach/);
  assert.match(html, /<a class="category-back-link" href="\/kelowna\/beaches">← Kelowna Beaches<\/a>/);
  const cta = html.match(/<div class="venue-cta-row"([^>]*)>([\s\S]*?)<\/div>/);
  assert.ok(cta, 'CTA row must render');
  assert.match(cta[1], /data-venue-category="beach" data-venue-name="Test Beach Park" data-surface="venue_page"/);
  const order = ['Visit Website', 'Get Directions', 'Favorite', 'Add to Trip'].map((t) => cta[2].indexOf(t));
  assert.ok(order.every((i) => i >= 0), 'Visit Website, Get Directions, Favorite, Add to Trip all present');
  assert.deepEqual([...order].sort((a, c) => a - c), order, 'CTA order: Visit Website, Get Directions, Favorite, Add to Trip');
  assert.doesNotMatch(cta[2], />Call</, 'no Call button when phone is null');
  assert.match(cta[2], /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=49\.86,-119\.49"/, 'Get Directions uses the verified coordinates');
  assert.match(cta[2], /data-track="website"/);
  assert.match(html, /"venue_category":"beach","surface":"venue_page"/);
  assert.match(html, /var HOLDER = '\[data-venue-category="beach"\]';/);
  assert.match(html, /<script src="\/scripts\/app\.js"><\/script>/);
});

test('Beach venue page with no address, coordinates, website or phone: Get Directions / Visit Website / Call are all omitted, Favorite + Add to Trip remain', () => {
  const b = bareBeachFixture();
  const html = app.renderVenuePage(b, [], [], []);
  const cta = html.match(/<div class="venue-cta-row"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(cta);
  assert.doesNotMatch(cta[1], /Get Directions|Visit Website|>Call<|google\.com\/maps|tel:/);
  assert.match(cta[1], /Favorite/);
  assert.match(cta[1], /Add to Trip/);
  assert.doesNotMatch(html, /"geo":/);
  assert.doesNotMatch(html, /venue-location/);
  // Vernon fixture: coordinates but no address -> Get Directions from coordinates only, no address row.
  const v = app.findVenueBySlug('vernon', 'beach', 'test-vernon-beach');
  const vh = app.renderVenuePage(v, [], [], []);
  assert.match(vh, /Get Directions/);
  assert.match(vh, /query=50\.26,-119\.35/);
  assert.doesNotMatch(vh, /<p class="venue-address">/);
});

test('Advisories: the collection is bootstrapped, memberships render a "Check before you go" note on card + page, and removal restores byte-identity', () => {
  const row = db.prepare("SELECT slug, kind, title FROM collections WHERE kind = 'advisory'").get();
  assert.deepEqual({ ...row }, { slug: 'advisories', kind: 'advisory', title: 'Advisories' });
  assert.equal(app.ADVISORY_COLLECTION_KIND, 'advisory');
  const b = beachFixture();
  const venues = app.getVenuesByRegionCategory('kelowna', 'beach');
  const beforeCard = app.venueCardHtml(b);
  const beforeCategory = app.renderCategoryPage('kelowna', 'beach', venues, []);
  const beforePage = app.renderVenuePage(b, [], [], []);
  assert.doesNotMatch(beforePage, /venue-advisory/);
  assert.doesNotMatch(beforeCategory, /venue-advisory/);

  const note = 'Swimming advisory in effect. Check the official source for the latest update. https://www.kelowna.ca/parks-recreation/parks-beaches/water-quality-beaches (checked 2026-09-19)';
  const meta = { reason: 'test advisory', batch_id: 'test-advisories' };
  const r = app.guardedCollectionMembershipUpdate('advisory', b.id, 'add', note, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(app.getAdvisoryNotes().get(b.id), note);

  const card = app.venueCardHtml(b, { advisoryNote: app.getAdvisoryNotes().get(b.id) });
  assert.match(card, /<aside class="venue-advisory" role="note" aria-label="Check before you go">\n  <p class="venue-advisory-kicker">Check before you go<\/p>\n  <p class="venue-advisory-text">Swimming advisory in effect\. Check the official source for the latest update\. \(checked 2026-09-19\)<\/p>\n  <a class="venue-advisory-source" href="https:\/\/www\.kelowna\.ca\/parks-recreation\/parks-beaches\/water-quality-beaches" rel="nofollow noopener" target="_blank">Official source: kelowna\.ca &#8599;<\/a>\n<\/aside>/, 'restrained notice: kicker, message, official-source link; URL lifted out of the message');
  assert.doesNotMatch(card, /<strong>|⚠|warning/i, 'no alert styling or icons');
  assert.deepEqual(app.parseAdvisoryNote('Closed (https://example.org/x). Details.'), { text: 'Closed. Details.', url: 'https://example.org/x' });
  assert.deepEqual(app.parseAdvisoryNote('Bare domain kelowna.ca stays text.'), { text: 'Bare domain kelowna.ca stays text.', url: null });
  assert.doesNotMatch(app.advisoryNoticeHtml('Bare domain kelowna.ca stays text.'), /venue-advisory-source/, 'no link is fabricated from a bare domain');
  assert.equal(app.venueCardHtml(b), beforeCard, 'without the option the card is unchanged (the option is supplied by the listing renderer)');

  const category = app.renderCategoryPage('kelowna', 'beach', venues, []);
  assert.match(category, /venue-advisory/);
  assert.match(category, /\.venue-advisory \{/, 'advisory styles are emitted on a page that carries a notice');
  const bareIdx = category.indexOf('data-venue-name="Test Bare Beach"');
  assert.doesNotMatch(category.slice(bareIdx, category.indexOf('</li>', bareIdx)), /venue-advisory/, 'only the member venue gets the notice');

  const page = app.renderVenuePage(b, [], [], []);
  assert.match(page, /<\/p>\n  <aside class="venue-advisory" role="note" aria-label="Check before you go">/, 'notice sits between the description and the CTA row');
  assert.match(page, /<\/aside>\n  <div class="venue-cta-row"/);
  assert.match(page, /\.venue-advisory \{/);
  // Permanent facts are untouched: the description text is identical.
  assert.match(page, /<p class="venue-description">A fixture public beach with a swim area, playground and washrooms, used only by the automated test suite\.<\/p>/);

  // Audit trail lands in venue_enrichment_log like the editorial kinds.
  const audit = db.prepare("SELECT field_name FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'collection:advisory'").all(b.id);
  assert.ok(audit.length >= 1);

  app.guardedCollectionMembershipUpdate('advisory', b.id, 'remove', null, meta);
  assert.equal(app.renderVenuePage(b, [], [], []), beforePage, 'lifting the advisory restores the page byte-for-byte');
  assert.equal(app.renderCategoryPage('kelowna', 'beach', venues, []), beforeCategory);
});

test('Advisories are never a trip "discovery" preference, while editorial kinds still are', () => {
  const kinds = app.getKnownDiscoveryKinds();
  assert.ok(!kinds.includes('advisory'));
  assert.ok(kinds.includes('hidden_gem'));
  assert.ok(kinds.includes('local_favorite'));
  assert.ok(app.NON_DISCOVERY_COLLECTION_KINDS.has('advisory'));
});

test('Beaches are excluded from the Build My Trip planner: interests, chips, parser and the itinerary candidate pool', () => {
  assert.ok(!app.TRIP_INTEREST_TYPES.includes('beach'));
  assert.deepEqual(app.TRIP_INTEREST_TYPES, ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf'], 'the seven existing planner types are unchanged');
  assert.equal(app.isValidTripInterest('beach'), false);
  assert.equal(app.isValidTripInterest('golf'), true);
  assert.equal(app.isTripPlannerType('beach'), false);
  const tripPage = app.renderTripPlannerPage();
  assert.doesNotMatch(tripPage, /name="tripInterest" value="beach"/, 'no Beaches interest chip on /trip');
  assert.match(tripPage, /name="tripInterest" value="golf"/, 'Golf chip still present');
  const { raw } = app.deterministicTripParserProvider('a trip to Kelowna with beaches and swimming');
  assert.deepEqual(raw.interests, []);
  assert.ok(raw.unsupported_terms.includes('beaches'), 'beach vocabulary stays in the unsupported list');
});

test('Golf regression: Golf listing and venue pages are unchanged by the Beaches work (class, attributes, scripts, split, no beach markup)', () => {
  const golfVenues = app.getVenuesByRegionCategory('kelowna', 'golf');
  const category = app.renderCategoryPage('kelowna', 'golf', golfVenues, []);
  assert.match(category, /<body class="golf-page">/, 'Golf body class must remain exactly golf-page');
  assert.doesNotMatch(category, /beach-page|data-venue-category="beach"|Beach page theme|Test Beach Park/);
  assert.match(category, /data-venue-category="golf"/);
  assert.match(category, /var HOLDER = '\[data-venue-category="golf"\]';/);
  assert.match(category, /venue_category: 'golf',/);
  assert.match(category, /querySelectorAll\('\.venue-card\[data-venue-category="golf"\]'\)/);
  assert.match(category, /Indoor Golf/, 'Golf-only subsection split still applies to Golf');
  const golf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  const page = app.renderVenuePage(golf, [], [], []);
  assert.match(page, /<body class="golf-page">/);
  assert.match(page, /"@type":"GolfCourse"/);
  assert.match(page, /"venue_category":"golf","surface":"venue_page"/);
  assert.match(page, /data-venue-category="golf" data-venue-name="Test Golf Course" data-surface="venue_page"/);
  assert.doesNotMatch(page, /beach-page|data-venue-category="beach"|class="venue-hero venue-hero-fallback venue-hero-beach"|Beach page theme|<aside class="venue-advisory"/);
  const wide = app.renderCategoryAllRegionsPage('golf', app.getVenuesByCategory('golf'));
  assert.match(wide, /<body class="golf-page">/);
  assert.doesNotMatch(wide, /Test Beach Park|beach-page/);
});

test('Non-themed category regression: restaurant card and pages carry no theme, beach, or advisory markup', () => {
  const trattoria = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  const card = app.venueCardHtml(trattoria);
  assert.doesNotMatch(card, /data-venue-category|venue-card-link|venue-card-cue|card-actions|golf-desc|venue-advisory/);
  assert.match(card, /<h2><a href="\/kelowna\/restaurants\/test-trattoria">Test Trattoria<\/a><\/h2>/);
  const markupOnly = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const page = app.renderVenuePage(trattoria, [], [], []);
  assert.match(page, /<body>/);
  assert.doesNotMatch(page, /<link rel="stylesheet" href="\/styles\/app\.css">|id="tripTray"|<script src="\/scripts\/app\.js">|Beach page theme|\.venue-advisory \{/);
  assert.doesNotMatch(markupOnly(page), /golf-page|beach-page|venue-advisory|data-venue-category|data-track=/);
  const category = app.renderCategoryPage('kelowna', 'restaurant', app.getVenuesByRegionCategory('kelowna', 'restaurant'), []);
  assert.match(category, /<body>/);
  assert.doesNotMatch(category, /<link rel="stylesheet" href="\/styles\/app\.css">|id="tripTray"|<script src="\/scripts\/app\.js">|Beach page theme/);
  assert.doesNotMatch(markupOnly(category), /golf-page|beach-page|venue-advisory|data-venue-category/);
});

test('Region hub page lists a Beaches category card once a region has beaches', () => {
  const counts = app.getRegionCategoryCounts('kelowna');
  const html = app.renderRegionPage('kelowna', counts, []);
  assert.match(html, /<h2><a href="\/kelowna\/beaches">Beaches<\/a><\/h2>/);
  assert.match(html, /2 beaches in Kelowna/);
});

test('Beach theme CSS is derived from the Golf rules: every derived rule is keyed to beach, and the Golf theme text is unchanged', () => {
  const golfCss = app.renderGolfThemeStyles ? app.renderGolfThemeStyles() : null;
  const beachCss = app.renderBeachThemeStyles();
  assert.match(beachCss, /^<style>/);
  assert.doesNotMatch(beachCss, /\[data-venue-category="golf"\]/, 'derived block must contain no golf-keyed selectors');
  const rules = beachCss.match(/\[data-venue-category="beach"\]/g) || [];
  assert.ok(rules.length >= 20, `expected the full set of card/CTA rules to be derived, got ${rules.length}`);
  assert.match(beachCss, /\.venue-card\[data-venue-category="beach"\] \.card-action \{/);
  assert.match(beachCss, /body\.golf-page \.venue-card\[data-venue-category="beach"\] \.trip-btn\.in-trip,/);
  // Derivation is mechanical: a synthetic Golf rule maps 1:1.
  assert.equal(app.deriveBeachRulesFromGolfCss('.x[data-venue-category="golf"] .y { color: red; }\n.z { c: d }'), '.x[data-venue-category="beach"] .y { color: red; }');
  if (golfCss) assert.doesNotMatch(golfCss, /beach/);
});

// ---- FROZEN HOMEPAGE: byte-identity before/after beach data (isolated child) ----
// The homepage is approved and frozen. Adding the beach type and beach
// rows (and an advisory membership) must not change a single byte of the
// '/' response: no tile, no count, no mood-card/footer href change, no
// markup. Uses the same isolated child-process pattern as the 503 test
// above (fresh temp dir -> its own empty DB, its own port), so it never
// touches the real okanagan.db, the shared harness DB, or port 3001.
test('FROZEN HOMEPAGE: "/" is byte-identical before and after beach venues + an advisory exist; sitemap, /beaches routes and trip API behave (isolated child process)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-beaches-homepage-'));
  const projectRoot = path.join(__dirname, '..');
  for (const f of ['server.js', 'db.js', 'okanagan.html']) {
    fs.copyFileSync(path.join(projectRoot, f), path.join(tempDir, f));
  }
  const ISOLATED_PORT = '3097';
  const TOKEN = 'beaches-homepage-test-token';
  const childEnv = { ...process.env, PORT: ISOLATED_PORT, ENRICHMENT_ADMIN_TOKEN: TOKEN };
  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], { cwd: tempDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrOutput = '';
  child.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });
  const base = `http://localhost:${ISOLATED_PORT}`;
  const authed = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { if ((await fetch(`${base}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(ready, `isolated child never became ready. stderr: ${stderrOutput}`);

    // Seed a non-beach venue first so the homepage has "normal" data, then snapshot '/'.
    const seedRes = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify({ name: 'Homepage Fixture Winery', region: 'kelowna', type: 'winery', description: 'fixture', slug: 'homepage-fixture-winery' }) });
    assert.equal(seedRes.status, 201);
    const homeNoBeaches = await (await fetch(`${base}/`)).text();
    assert.match(homeNoBeaches, /class="mood-card mood-card-beaches" href="#exploreRegions">/, 'with no beach data the card keeps its previous in-page target');
    const sitemapBefore = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.equal((await fetch(`${base}/beaches`)).status, 404, 'no beaches yet -> /beaches is a 404, never an empty page');
    assert.equal((await fetch(`${base}/kelowna/beaches`)).status, 404);

    // Add beach venues through the real, authenticated creation route, then an advisory membership.
    const b1 = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify({ name: 'Homepage Beach One', region: 'kelowna', type: 'beach', description: 'fixture beach', slug: 'homepage-beach-one', address: '1 Beach Rd, Kelowna, BC', latitude: 49.9, longitude: -119.5, website: 'https://www.kelowna.ca/example' }) });
    assert.equal(b1.status, 201);
    const beachOne = await b1.json();
    // The ONLY homepage byte change beach data may cause is the approved Beaches mood-card href (2026-09-20).
    const homeBefore = await (await fetch(`${base}/`)).text();
    assert.match(homeBefore, /class="mood-card mood-card-beaches" href="\/beaches">/);
    assert.equal(homeBefore, homeNoBeaches.replace('class="mood-card mood-card-beaches" href="#exploreRegions">', 'class="mood-card mood-card-beaches" href="/beaches">'), 'beach data changes exactly one attribute on "/": the Beaches mood-card href');
    const b2 = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify({ name: 'Homepage Beach Two', region: 'vernon', type: 'beach', description: 'fixture beach two', slug: 'homepage-beach-two' }) });
    assert.equal(b2.status, 201);
    const adv = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind: 'advisory', venue_id: beachOne.id, action: 'add', note: 'Partial closure (rdco.com, 2026-09-19).', reason: 'test', batch_id: 'homepage-test' }) });
    assert.equal(adv.status, 200, await adv.text());
    for (const kind of ['hidden_gem', 'local_favorite', 'dog_friendly']) {
      const r = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind, venue_id: beachOne.id, action: 'add', note: kind === 'dog_friendly' ? 'Off-leash dog beach' : null, reason: 'test', batch_id: 'homepage-test' }) });
      assert.equal(r.status, 200, `${kind}: ${await r.text()}`);
    }

    const homeAfter = await (await fetch(`${base}/`)).text();
    assert.equal(homeAfter, homeBefore, 'FROZEN HOMEPAGE: further beach rows, an advisory and Hidden Gem / Local Favourite / Dog Friendly memberships must not change one byte of "/"');
    // Explicit no-Beaches-on-homepage assertions (independent of the byte check).
    assert.doesNotMatch(homeAfter, /href="\/kelowna\/beaches"|category-tile-beach|data-venue-category|venue-advisory|beach-page/);
    assert.equal((homeAfter.match(/href="\/beaches"/g) || []).length, 1, 'exactly one /beaches link on the homepage: the mood card');
    assert.match(homeAfter, /<li><a href="#exploreRegions" data-i18n="mood\.beaches\.title">Beaches<\/a><\/li>/, 'the footer Beaches link is untouched');
    assert.doesNotMatch(homeAfter, /Homepage Beach One|Homepage Beach Two/);

    // Routes now live: wide page, regional page, venue page; sitemap gains exactly the beach URLs.
    const wide = await fetch(`${base}/beaches`);
    assert.equal(wide.status, 200);
    const wideBody = await wide.text();
    assert.match(wideBody, /Homepage Beach One/);
    assert.match(wideBody, /href="\/kelowna\/beaches"/);
    assert.match(wideBody, /href="\/vernon\/beaches"/);
    assert.doesNotMatch(wideBody, /href="\/osoyoos\/beaches"/);
    assert.match(wideBody, /venue-advisory/, 'advisory notice renders on the listing card');
    assert.match(wideBody, /<span class="chip dog-friendly-badge" title="Off-leash dog beach">\u{1F43E} Dog Friendly<\/span>/u, 'Dog Friendly badge on the listing card');
    assert.match(wideBody, /hidden-gem-badge/); assert.match(wideBody, /local-favourite-badge/);
    const regional = await fetch(`${base}/kelowna/beaches`);
    assert.equal(regional.status, 200);
    const venuePage = await fetch(`${base}/kelowna/beaches/homepage-beach-one`);
    assert.equal(venuePage.status, 200);
    const venueBody = await venuePage.text();
    assert.match(venueBody, /"@type":"Beach"/);
    assert.match(venueBody, /<p class="venue-advisory-kicker">Check before you go<\/p>\n  <p class="venue-advisory-text">Partial closure \(rdco\.com, 2026-09-19\)\.<\/p>/);
    assert.match(venueBody, /Get Directions/);
    assert.match(venueBody, /<p class="chips"><span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem<\/span> <span class="chip local-favourite-badge">\u2665 Local Favourite<\/span> <span class="chip dog-friendly-badge" title="Off-leash dog beach">\u{1F43E} Dog Friendly<\/span> <\/p>/u, 'all three badges on the venue page, existing badges unchanged');
    const beachTwoBody = await (await fetch(`${base}/vernon/beaches/homepage-beach-two`)).text();
    assert.match(beachTwoBody, /<div class="venue-header">[\s\S]*?<p class="chips"><\/p>/, 'non-member beach carries no badges in its own header (related cards may still show other venues\' badges)');
    assert.doesNotMatch(beachTwoBody, /Get Directions|Visit Website|>Call</, 'no address/coords/website/phone -> no fabricated CTA');
    assert.equal((await fetch(`${base}/kelowna/beaches/does-not-exist`)).status, 404);
    assert.equal((await fetch(`${base}/osoyoos/beaches`)).status, 404, 'region with zero beaches is a 404');
    const sitemapAfter = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemapAfter, /<loc>https:\/\/okanaganroam\.com\/kelowna\/beaches<\/loc>/);
    assert.match(sitemapAfter, /<loc>https:\/\/okanaganroam\.com\/kelowna\/beaches\/homepage-beach-one<\/loc>/);
    // No beach *category or venue* URLs before the data exists. (The static
    // valley-wide /beaches hub is always listed, so match region-scoped URLs.)
    assert.doesNotMatch(sitemapBefore, /okanaganroam\.com\/[a-z-]+\/beaches/);

    // Region hub shows the new category card.
    const hub = await (await fetch(`${base}/kelowna`)).text();
    assert.match(hub, /<h2><a href="\/kelowna\/beaches">Beaches<\/a><\/h2>/);

    // Trip planner: beach is not an interest, not a discovery kind, and never an itinerary stop.
    const badInterest = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1, interests: ['beach'] }) });
    assert.equal(badInterest.status, 400);
    const badInterestBody = await badInterest.json();
    assert.ok(!badInterestBody.allowed.includes('beach'));
    const badDiscovery = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1, discovery: ['advisory'] }) });
    assert.equal(badDiscovery.status, 400, 'advisory is not a discovery kind');
    const badDiscovery2 = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1, discovery: ['dog_friendly'] }) });
    assert.equal(badDiscovery2.status, 400, 'dog_friendly collection is not a discovery kind');
    const plan = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1 }) });
    assert.equal(plan.status, 200);
    assert.doesNotMatch(await plan.text(), /Homepage Beach One/, 'a beach must never be picked as an itinerary stop');

    // Advisory removal restores the venue page and clears the notice.
    const rm = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind: 'advisory', venue_id: beachOne.id, action: 'remove', reason: 'test', batch_id: 'homepage-test' }) });
    assert.equal(rm.status, 200);
    assert.doesNotMatch(await (await fetch(`${base}/kelowna/beaches/homepage-beach-one`)).text(), /venue-advisory/);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});


// ==== Beaches accuracy pass (2026-09-19): Dog Friendly badge, CTA rules, badge regression ====

test('Dog Friendly badge: collection bootstrapped, renders on card + venue page for members only, carries the official restriction, removal restores bytes', () => {
  const row = db.prepare("SELECT slug, kind, title FROM collections WHERE kind = 'dog_friendly'").get();
  assert.deepEqual({ ...row }, { slug: 'dog-friendly-beaches', kind: 'dog_friendly', title: 'Dog Friendly' });
  assert.equal(app.DOG_FRIENDLY_COLLECTION_KIND, 'dog_friendly');
  const b = beachFixture();
  const bare = bareBeachFixture();
  const venues = app.getVenuesByRegionCategory('kelowna', 'beach');
  const beforeCategory = app.renderCategoryPage('kelowna', 'beach', venues, []);
  const beforePage = app.renderVenuePage(b, [], [], []);
  assert.doesNotMatch(beforeCategory, /dog-friendly-badge/);
  const meta = { reason: 'test dog badge', batch_id: 'test-dog-friendly' };
  const r = app.guardedCollectionMembershipUpdate('dog_friendly', b.id, 'add', 'Designated off-leash dog beach only', meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(app.getDogFriendlyNotes().get(b.id), 'Designated off-leash dog beach only');
  // badge markup = existing .chip convention (same as Hidden Gem / Local Favourite), restriction in title
  assert.equal(app.dogFriendlyBadgeHtml('On leash only'), '<span class="chip dog-friendly-badge" title="On leash only">\u{1F43E} Dog Friendly</span>');
  assert.equal(app.dogFriendlyBadgeHtml(''), '<span class="chip dog-friendly-badge">\u{1F43E} Dog Friendly</span>');
  const category = app.renderCategoryPage('kelowna', 'beach', venues, []);
  const cardStart = category.indexOf('data-venue-name="Test Beach Park"');
  const card = category.slice(cardStart, category.indexOf('</li>', cardStart));
  assert.match(card, /<p class="chips"><span class="chip dog-friendly-badge" title="Designated off-leash dog beach only">\u{1F43E} Dog Friendly<\/span> <\/p>/u, 'listing card shows the badge in the chips row');
  const bareStart = category.indexOf('data-venue-name="Test Bare Beach"');
  assert.doesNotMatch(category.slice(bareStart, category.indexOf('</li>', bareStart)), /dog-friendly-badge/, 'non-member card has no badge');
  const page = app.renderVenuePage(b, [], [], []);
  assert.match(page, /<p class="chips"><span class="chip dog-friendly-badge" title="Designated off-leash dog beach only">\u{1F43E} Dog Friendly<\/span> <\/p>/u, 'venue page shows the badge');
  assert.doesNotMatch(app.renderVenuePage(bare, [], [], []), /dog-friendly-badge/);
  // The badge never touches the amenity boolean (which feeds the homepage's guide-footer counts).
  assert.equal(db.prepare('SELECT dog_friendly FROM venues WHERE id = ?').get(b.id).dog_friendly, 0);
  assert.equal(app.badgeChipsHtml(app.getVenue(b.id)), '', 'no amenity chip is produced');
  // Not a trip discovery kind.
  assert.ok(!app.getKnownDiscoveryKinds().includes('dog_friendly'));
  // Audit trail + removal restores byte identity.
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'collection:dog_friendly'").get(b.id));
  app.guardedCollectionMembershipUpdate('dog_friendly', b.id, 'remove', null, meta);
  assert.equal(app.renderCategoryPage('kelowna', 'beach', venues, []), beforeCategory);
  assert.equal(app.renderVenuePage(b, [], [], []), beforePage);
});

test('Dog Friendly badge coexists with the existing Hidden Gem / Local Favourite badges without changing their markup', () => {
  const b = beachFixture();
  const meta = { reason: 'test', batch_id: 'test-badges' };
  for (const [kind, note] of [['hidden_gem', null], ['local_favorite', null], ['dog_friendly', 'Off-leash dog beach']]) {
    assert.equal(app.guardedCollectionMembershipUpdate(kind, b.id, 'add', note, meta).ok, true);
  }
  const page = app.renderVenuePage(b, [], [], []);
  assert.match(page, /<p class="chips"><span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem<\/span> <span class="chip local-favourite-badge">♥ Local Favourite<\/span> <span class="chip dog-friendly-badge" title="Off-leash dog beach">\u{1F43E} Dog Friendly<\/span> <\/p>/u);
  const card = app.venueCardHtml(b, { isHiddenGem: true, isLocalFavourite: true, dogFriendlyNote: 'Off-leash dog beach' });
  assert.match(card, /<span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem<\/span> <span class="chip local-favourite-badge">♥ Local Favourite<\/span> <span class="chip dog-friendly-badge" title="Off-leash dog beach">\u{1F43E} Dog Friendly<\/span> /u);
  // Golf regression: golf pages unaffected by the new kind.
  const golf = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
  assert.doesNotMatch(app.renderVenuePage(golf, [], [], []), /dog-friendly-badge/);
  for (const kind of ['hidden_gem', 'local_favorite', 'dog_friendly']) app.guardedCollectionMembershipUpdate(kind, b.id, 'remove', null, meta);
});

test('Beach venue CTA rules: Get Directions from coordinates OR a verified address; Visit Website / Call only when the field is verified', () => {
  const base = { id: 999901, name: 'CTA Rule Beach', region: 'kelowna', type: 'beach', slug: 'cta-rule-beach', description: 'x', redirect_to: null };
  const ctaOf = (v) => { const m = app.renderVenuePage(v, [], [], []).match(/<div class="venue-cta-row"[^>]*>([\s\S]*?)<\/div>/); return m ? m[1] : ''; };
  const addrOnly = ctaOf({ ...base, address: '12 Sample Beach Rd, Kelowna, BC', latitude: null, longitude: null, website: null, phone: null });
  assert.match(addrOnly, /Get Directions/);
  assert.match(addrOnly, /query=12%20Sample%20Beach%20Rd%2C%20Kelowna%2C%20BC/, 'address-only venues get directions via the address query, same pattern as every other venue');
  assert.doesNotMatch(addrOnly, /Visit Website|>Call</);
  const coordsOnly = ctaOf({ ...base, address: null, latitude: 49.9, longitude: -119.5, website: null, phone: null });
  assert.match(coordsOnly, /query=49\.9,-119\.5/);
  const nothing = ctaOf({ ...base, address: null, latitude: null, longitude: null, website: null, phone: null });
  assert.doesNotMatch(nothing, /Get Directions|Visit Website|>Call</);
  assert.match(nothing, /Favorite/); assert.match(nothing, /Add to Trip/);
  const full = ctaOf({ ...base, address: '12 Sample Beach Rd, Kelowna, BC', latitude: 49.9, longitude: -119.5, website: 'https://storymaps.arcgis.com/stories/ae662360d11c44c6a8edb3bf2eb315d3', phone: '+1 250-555-0199' });
  assert.match(full, /href="https:\/\/storymaps\.arcgis\.com\/stories\/ae662360d11c44c6a8edb3bf2eb315d3" rel="nofollow noopener" target="_blank" data-track="website">Visit Website</);
  assert.match(full, /query=49\.9,-119\.5/, 'coordinates win over the address for directions');
  assert.match(full, />Call</);
});


// ==== Outdoors Phase 1 (2026-09-20): third themed category ================
//
// `outdoor` reuses the Golf/Beaches category architecture end to end: the
// themed body class, name-as-link cards with the community line on the
// Okanagan-wide page, the hero <h1>, the Favorite / Add to Trip CTA row,
// and the derived (never copied) theme rules. Eight activity collection
// kinds are bootstrapped in db.js as the tagging mechanism; they seed no
// members and never enter trip "discovery".

// Markup-only view of a page: the shared theme/polish CSS legitimately
// mentions golf/beach selectors on every themed page, so the "no foreign
// markup" assertions below look at the HTML outside <style>/<script>.
const outdoorMarkupOnly = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

test('Outdoor category wiring: slug, themed layout, all-regions page, labels, schema type, trip-planner exclusion', () => {
  assert.equal(app.CATEGORY_SLUGS.outdoor, 'outdoors');
  assert.equal(app.SLUG_TO_TYPE.outdoors, 'outdoor');
  assert.equal(app.usesThemedCategoryLayout('outdoor'), true);
  assert.equal(app.themedBodyClassAttr('outdoor'), ' class="golf-page outdoor-page"');
  assert.equal(app.themedBodyClassAttr('golf'), ' class="golf-page"', 'golf body class unchanged');
  assert.equal(app.themedBodyClassAttr('beach'), ' class="golf-page beach-page"', 'beach body class unchanged');
  assert.ok(app.ALL_REGIONS_CATEGORIES.includes('outdoor'));
  assert.deepEqual(app.CATEGORY_LABELS.outdoor, { singular: 'Outdoor Destination', plural: 'Outdoor Destinations' });
  assert.equal(app.SCHEMA_TYPE_MAP.outdoor, 'TouristAttraction');
  assert.equal(app.isTripPlannerType('outdoor'), false, 'outdoor is not a Build My Trip interest');
  assert.ok(!app.TRIP_INTEREST_TYPES.includes('outdoor'));
  // Theme rules are derived from the Golf rules and re-keyed to the outdoor attribute only.
  const css = app.renderOutdoorThemeStyles();
  assert.match(css, /Outdoor page theme \(2026-09-20\)/);
  assert.ok(css.includes('[data-venue-category="outdoor"]'));
  assert.ok(!css.includes('[data-venue-category="golf"]') && !css.includes('[data-venue-category="beach"]'));
  assert.equal(css.split('[data-venue-category="outdoor"]').length, app.renderBeachThemeStyles().split('[data-venue-category="beach"]').length, 'outdoor and beach derive the same number of golf rules');
});

test('Outdoor activity collections: nine kinds bootstrapped with no members, excluded from trip discovery, usable through the audited membership route', () => {
  const expected = [
    ['activity-hiking', 'activity_hiking', 'Hiking & Trails'], ['activity-cycling', 'activity_cycling', 'Cycling'],
    ['activity-viewpoints', 'activity_viewpoints', 'Viewpoints'], ['activity-nature', 'activity_nature', 'Nature'],
    ['activity-winter', 'activity_winter', 'Winter'], ['activity-camping', 'activity_camping', 'Camping'],
    ['activity-water', 'activity_water', 'Water Activities'], ['activity-adventure', 'activity_adventure', 'Adventure'],
    ['activity-fishing', 'activity_fishing', 'Fishing'],
  ];
  assert.deepEqual(app.ACTIVITY_COLLECTION_KINDS, expected.map((e) => e[1]));
  for (const [slug, kind, title] of expected) {
    const row = db.prepare('SELECT slug, kind, title FROM collections WHERE slug = ?').get(slug);
    assert.deepEqual({ ...row }, { slug, kind, title });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM collections WHERE kind = ?').get(kind).n, 1);
    assert.ok(app.NON_DISCOVERY_COLLECTION_KINDS.has(kind));
    assert.ok(!app.getKnownDiscoveryKinds().includes(kind), `${kind} must never be a trip discovery kind`);
  }
  const outdoor = app.findVenueBySlug('kelowna', 'outdoor', 'test-canyon-regional-park');
  assert.equal(app.getCollectionVenueIds('activity_hiking').size, 0, 'no seeded members');
  const add = app.guardedCollectionMembershipUpdate('activity_hiking', outdoor.id, 'add', null, { reason: 'test', batch_id: 'outdoors-test', reviewed_by: null });
  assert.equal(add.ok, true, JSON.stringify(add));
  assert.ok(app.getCollectionVenueIds('activity_hiking').has(outdoor.id));
  const rm = app.guardedCollectionMembershipUpdate('activity_hiking', outdoor.id, 'remove', null, { reason: 'test', batch_id: 'outdoors-test', reviewed_by: null });
  assert.equal(rm.ok, true);
  assert.equal(app.getCollectionVenueIds('activity_hiking').size, 0);
});

test('/outdoors (Okanagan-wide) renders the discovery landing: one H1, canonical, compact region-grouped index (one entry per venue, grouped by community), region selector, no golf/beach markup', () => {
  const rows = app.getVenuesByCategory('outdoor');
  assert.ok(rows.length >= 2);
  const html = app.renderCategoryAllRegionsPage('outdoor', rows);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<h1>Outdoors in the Okanagan<\/h1>/);
  assert.match(html, /<title>Outdoors in the Okanagan \| Okanagan Roam<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/outdoors"/);
  assert.match(html, /<meta property="og:title" content="Outdoors in the Okanagan \| Okanagan Roam">/);
  assert.match(html, /<body class="golf-page outdoor-page">/);
  assert.match(html, /Outdoor page theme \(2026-09-20\)/);
  // Region choice is a multi-select chip row (buttons), not links; regional pages stay reachable from region hubs, cards and the sitemap.
  assert.match(html, /data-region="kelowna"/); assert.match(html, /data-region="vernon"/);
  // Landing: no count subtitle, no /browse CTA; every destination rendered once as a full card in the results list.
  const markup = outdoorMarkupOnly(html);
  assert.doesNotMatch(markup, /<p class="subtitle">|Back to the full directory|aria-label="Filter by region"/);
  const cards = markup.match(/<li class="venue-card" data-venue-id="\d+" data-venue-region="[a-z-]+" data-venue-category="outdoor"/g) || [];
  assert.equal(cards.length, rows.length, 'exactly one result card per outdoor venue');
  assert.match(html, /<ul class="card-grid" id="outdoorResults">/);
  assert.match(markup, /Test Canyon Regional Park<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta">Kelowna<\/p>/, 'community line on result cards');
  // Hierarchy (2026-09-22 explorer): Choose Region(s) -> Choose Activity(s) (nine toggle cards) -> Show results -> Results.
  const iRegion = markup.indexOf('Choose Region(s)</h2>'), iActivity = markup.indexOf('id="outdoorActivitiesHeading">Choose Activity(s)</h2>'), iShow = markup.indexOf('id="outdoorShowResults"'), iResults = markup.indexOf('id="outdoorResultsTop">Results</h2>');
  assert.ok(iRegion > 0 && iActivity > iRegion && iShow > iActivity && iResults > iShow, 'Region -> Choose Activity(s) -> Show results -> Results');
  assert.doesNotMatch(markup, /Explore by Activity|outdoorActivityMore|View All Outdoor Activities|class="outdoor-filter-chip" data-activity=/, 'the former showcase reveal and the old activity chip row are gone');
  assert.equal((markup.match(/Choose Activity\(s\)<\/h2>/g) || []).length, 1, 'exactly one Choose Activity(s) section');
  for (const r of Object.keys(app.REGION_LABELS)) assert.match(markup, new RegExp(`<button type="button" class="outdoor-filter-chip" data-region="${r}" aria-pressed="false">`), `canonical region chip for ${r}`);
  assert.match(markup, /<p class="outdoor-results-summary" id="outdoorResultsSummary" aria-live="polite">\d+ outdoor destinations<\/p>/);
  assert.match(markup, /id="outdoorNoResults" hidden>/);
  assert.match(html, /<script type="application\/json" id="outdoorActivityMap">\{[\s\S]*?\}<\/script>/);
  assert.doesNotMatch(outdoorMarkupOnly(html), /data-venue-category="beach"|data-venue-category="golf"|beach-page|golf-glance|Indoor Golf/);
  assert.doesNotMatch(html, /Beach page theme/);
  assert.match(html, /"@type":"TouristAttraction"/);
  assert.match(html, /<footer class="home-footer"/, 'shared footer markup present');
});

test('/:region/outdoors renders the regional themed listing with the "All Outdoors" back-link and no community line', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'outdoor');
  const html = app.renderCategoryPage('kelowna', 'outdoor', rows, []);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<h1>Outdoor Destinations in Kelowna, BC<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/outdoors"/);
  assert.match(html, /<a class="category-back-link" href="\/outdoors">← All Outdoors<\/a>/);
  assert.match(html, /<body class="golf-page outdoor-page">/);
  assert.match(html, /Test Canyon Regional Park<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta"><\/p>/, 'regional page keeps the empty meta line (no community)');
  assert.doesNotMatch(html, /Test Nordic Centre/);
});

test('Outdoor venue page: hero carries the H1 (exactly one), themed CTA row, canonical/OG, TouristAttraction schema, no fabricated CTA for a bare venue', () => {
  const venue = app.findVenueBySlug('kelowna', 'outdoor', 'test-canyon-regional-park');
  const html = app.renderVenuePage(venue, [], [], []);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<div class="venue-hero venue-hero-fallback venue-hero-outdoor">\s*<span class="venue-hero-type">Outdoor Destination<\/span>\s*<h1>Test Canyon Regional Park<\/h1>\s*<\/div>/);
  assert.doesNotMatch(html, /<div class="venue-header">\s*<h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/outdoors\/test-canyon-regional-park"/);
  assert.match(html, /<title>Test Canyon Regional Park/);
  assert.match(html, /<meta property="og:title" content="Test Canyon Regional Park/);
  assert.match(html, /"@type":"TouristAttraction"/);
  assert.match(html, /<body class="golf-page outdoor-page">/);
  assert.match(html, /Outdoor page theme \(2026-09-20\)/);
  assert.match(html, /body\.golf-page \.venue-hero-fallback\.venue-hero-outdoor \{ box-shadow/);
  assert.match(html, /<a class="category-back-link" href="\/kelowna\/outdoors">← Kelowna Outdoors<\/a>/);
  assert.match(html, /data-venue-category="outdoor" data-venue-name="Test Canyon Regional Park" data-surface="venue_page"/);
  assert.match(html, /Visit Website/); assert.match(html, /Get Directions/); assert.match(html, /Favorite/); assert.match(html, /Add to Trip/);
  assert.match(html, /<span class="label">Type<\/span><span>Outdoor Destination<\/span>/);
  assert.doesNotMatch(outdoorMarkupOnly(html), /golf-glance|Indoor Golf|beach-page/);
  const bare = app.renderVenuePage(app.findVenueBySlug('vernon', 'outdoor', 'test-nordic-centre'), [], [], []);
  assert.doesNotMatch(bare, /Get Directions|Visit Website|>Call</, 'no address/coords/website/phone -> no fabricated CTA');
  assert.equal((bare.match(/<h1[\s>]/g) || []).length, 1);
});

test('REGRESSION (Outdoors): Golf and Beach pages carry no outdoor theme or markup, and non-themed pages are untouched', () => {
  const golfRows = app.getVenuesByRegionCategory('kelowna', 'golf');
  const beachRows = app.getVenuesByRegionCategory('kelowna', 'beach');
  const pages = [
    app.renderCategoryPage('kelowna', 'golf', golfRows, []), app.renderCategoryAllRegionsPage('golf', golfRows),
    app.renderCategoryPage('kelowna', 'beach', beachRows, []), app.renderCategoryAllRegionsPage('beach', beachRows),
    app.renderVenuePage(app.findVenueBySlug('kelowna', 'beach', 'test-beach-park'), [], [], []),
    app.renderVenuePage(golfRows[0], [], [], []),
  ];
  for (const html of pages) {
    assert.doesNotMatch(html, /Outdoor page theme/);
    assert.doesNotMatch(outdoorMarkupOnly(html), /outdoor-page|data-venue-category="outdoor"|Test Canyon Regional Park|Test Nordic Centre|Outdoor Destinations/);
  }
  // The beach theme block is byte-identical to its pre-Outdoors form (derived from the same golf rules).
  assert.match(app.renderBeachThemeStyles(), /^<style>\n  \/\* Beach page theme \(2026-09-19\)/);
  const restaurant = app.renderVenuePage(app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria'), [], [], []);
  assert.doesNotMatch(restaurant, /Outdoor page theme/);
  assert.doesNotMatch(outdoorMarkupOnly(restaurant), /golf-page|outdoor-page|data-venue-category/);
});

test('FROZEN HOMEPAGE + FOOTER (Outdoors): "/" is byte-identical before and after outdoor venues exist; /beaches and /golf unchanged; routes, sitemap and trip API behave (isolated child process)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-outdoors-homepage-'));
  const projectRoot = path.join(__dirname, '..');
  for (const f of ['server.js', 'db.js', 'okanagan.html']) {
    fs.copyFileSync(path.join(projectRoot, f), path.join(tempDir, f));
  }
  const ISOLATED_PORT = '3096';
  const TOKEN = 'outdoors-homepage-test-token';
  const childEnv = { ...process.env, PORT: ISOLATED_PORT, ENRICHMENT_ADMIN_TOKEN: TOKEN };
  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], { cwd: tempDir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrOutput = '';
  child.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });
  const base = `http://localhost:${ISOLATED_PORT}`;
  const authed = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
  const footerOf = (html) => html.slice(html.indexOf('<footer class="home-footer"'), html.indexOf('</footer>') + 9);
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { if ((await fetch(`${base}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(ready, `isolated child never became ready. stderr: ${stderrOutput}`);

    // Fixtures for the existing categories so /beaches and /golf exist to compare against.
    for (const body of [
      { name: 'Fixture Winery', region: 'kelowna', type: 'winery', description: 'fixture', slug: 'fixture-winery' },
      { name: 'Fixture Beach', region: 'kelowna', type: 'beach', description: 'fixture beach', slug: 'fixture-beach', address: '1 Beach Rd, Kelowna, BC', latitude: 49.9, longitude: -119.5 },
      { name: 'Fixture Golf Course', region: 'kelowna', type: 'golf', description: 'An 18-hole fixture course.', slug: 'fixture-golf-course' },
    ]) {
      const r = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify(body) });
      assert.equal(r.status, 201, await r.text());
    }
    const homeBefore = await (await fetch(`${base}/`)).text();
    const beachesBefore = await (await fetch(`${base}/beaches`)).text();
    const golfBefore = await (await fetch(`${base}/golf`)).text();
    const browseBefore = await (await fetch(`${base}/browse`)).text();
    const tripBefore = await (await fetch(`${base}/trip`)).text();
    const sitemapBefore = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.equal((await fetch(`${base}/outdoors`)).status, 404, 'no outdoor venues yet -> /outdoors is a 404, never an empty page');
    assert.equal((await fetch(`${base}/kelowna/outdoors`)).status, 404);

    // Create outdoor venues through the real, authenticated creation route.
    const o1 = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify({ name: 'Fixture Canyon Park', region: 'kelowna', type: 'outdoor', description: 'fixture canyon park', slug: 'fixture-canyon-park', address: '3000 Canyon Rd, Kelowna, BC', latitude: 49.85, longitude: -119.37, website: 'https://storymaps.arcgis.com/stories/fixture' }) });
    const o1Text = await o1.text();
    assert.equal(o1.status, 201, o1Text);
    const canyon = JSON.parse(o1Text);
    const o2 = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify({ name: 'Fixture Nordic Centre', region: 'vernon', type: 'outdoor', description: 'fixture nordic centre', slug: 'fixture-nordic-centre' }) });
    assert.equal(o2.status, 201);
    const tag = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind: 'activity_hiking', venue_id: canyon.id, action: 'add', reason: 'test', batch_id: 'outdoors-test' }) });
    assert.equal(tag.status, 200, await tag.text());

    const homeAfter = await (await fetch(`${base}/`)).text();
    assert.equal(homeAfter, homeBefore.replace('class="mood-card mood-card-outdoors" href="#exploreRegions">', 'class="mood-card mood-card-outdoors" href="/outdoors">').replace('<li><a href="#exploreRegions" data-i18n="mood.outdoors.title">Outdoors</a></li>', '<li><a href="/outdoors" data-i18n="mood.outdoors.title">Outdoors</a></li>'), 'outdoor data changes exactly two hrefs on "/": the Outdoors mood card and the footer Outdoors link (2026-09-20, same pattern as Beaches)');
    assert.match(homeAfter, /class="mood-card mood-card-outdoors" href="\/outdoors">/, 'the Outdoors mood card now points at the Okanagan-wide /outdoors listing');
    assert.match(homeAfter, /<li><a href="\/outdoors" data-i18n="mood\.outdoors\.title">Outdoors<\/a><\/li>/, 'the footer Outdoors link now points at /outdoors like the mood card');
    assert.match(homeBefore, /<li><a href="#exploreRegions" data-i18n="mood\.outdoors\.title">Outdoors<\/a><\/li>/, 'with no outdoor data the footer link keeps its in-page anchor');
    assert.doesNotMatch(homeAfter, /href="\/kelowna\/outdoors"|Fixture Canyon Park|outdoor-page/);
    // The shared footer is on these pages too, so its Outdoors link (and only that) may change with outdoor data.
    const withFooterOutdoors = (html) => html.replace(/<li><a href="\/?#exploreRegions" data-i18n="mood\.outdoors\.title">Outdoors<\/a><\/li>/, '<li><a href="/outdoors" data-i18n="mood.outdoors.title">Outdoors</a></li>');
    assert.equal(await (await fetch(`${base}/beaches`)).text(), withFooterOutdoors(beachesBefore), '/beaches is byte-identical apart from the footer Outdoors link');
    assert.equal(await (await fetch(`${base}/golf`)).text(), withFooterOutdoors(golfBefore), '/golf is byte-identical apart from the footer Outdoors link');
    assert.equal(await (await fetch(`${base}/browse`)).text(), withFooterOutdoors(browseBefore), '/browse is byte-identical apart from the footer Outdoors link');
    assert.equal(await (await fetch(`${base}/trip`)).text(), withFooterOutdoors(tripBefore), '/trip is byte-identical apart from the footer Outdoors link');

    // Routes now live.
    const wide = await fetch(`${base}/outdoors`);
    assert.equal(wide.status, 200);
    const wideBody = await wide.text();
    assert.match(wideBody, /Fixture Canyon Park/); assert.match(wideBody, /Fixture Nordic Centre/);
    assert.match(wideBody, /data-region="kelowna" aria-pressed="false">Kelowna<span class="outdoor-activity-count">1<\/span>/);
    assert.match(wideBody, /data-region="vernon" aria-pressed="false">Vernon/);
    assert.match(wideBody, /data-region="osoyoos" aria-pressed="false">Osoyoos<span class="outdoor-activity-count">0<\/span>/, 'a canonical region with no outdoor venues still gets a chip, showing 0');
    assert.equal((wideBody.match(/<h1[\s>]/g) || []).length, 1);
    assert.equal(footerOf(wideBody), footerOf(withFooterOutdoors(beachesBefore)), 'the shared footer on /outdoors is byte-identical to the /beaches footer (with its Outdoors link now /outdoors)');
    assert.match(wideBody.replace(/<style>[\s\S]*?<\/style>/g, ''), /<ul class="card-grid" id="outdoorResults">[\s\S]*Fixture Canyon Park[\s\S]*Fixture Nordic Centre/, 'landing results list carries every destination');
    assert.match(await (await fetch(`${base}/kelowna/outdoors`)).text(), /<li class="venue-card" /, 'regional page keeps full listing cards');
    const regional = await fetch(`${base}/kelowna/outdoors`);
    assert.equal(regional.status, 200);
    const venuePage = await fetch(`${base}/kelowna/outdoors/fixture-canyon-park`);
    assert.equal(venuePage.status, 200);
    const venueBody = await venuePage.text();
    assert.match(venueBody, /"@type":"TouristAttraction"/);
    assert.match(venueBody, /rel="canonical" href="https:\/\/okanaganroam\.com\/kelowna\/outdoors\/fixture-canyon-park"/);
    assert.equal((venueBody.match(/<h1[\s>]/g) || []).length, 1);
    assert.equal((await fetch(`${base}/kelowna/outdoors/does-not-exist`)).status, 404);
    assert.equal((await fetch(`${base}/osoyoos/outdoors`)).status, 404, 'region with zero outdoor venues is a 404');
    const sitemapAfter = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemapAfter, /<loc>https:\/\/okanaganroam\.com\/kelowna\/outdoors<\/loc>/);
    assert.match(sitemapAfter, /<loc>https:\/\/okanaganroam\.com\/kelowna\/outdoors\/fixture-canyon-park<\/loc>/);
    // No outdoor *category or venue* URLs before the data exists. (The static
    // valley-wide /outdoors hub is always listed, so match region-scoped URLs.)
    assert.doesNotMatch(sitemapBefore, /okanaganroam\.com\/[a-z-]+\/outdoors/);
    const hub = await (await fetch(`${base}/kelowna`)).text();
    assert.match(hub, /<h2><a href="\/kelowna\/outdoors">Outdoor Destinations<\/a><\/h2>/, 'region hub gains the category card, exactly as Beaches did');
    // Phase 2: an activity page appears only once the activity has MIN_ACTIVITY_VENUES destinations.
    assert.equal((await fetch(`${base}/outdoors/hiking`)).status, 404, 'one member is below the activity threshold -> 404, never a thin page');
    assert.equal((await fetch(`${base}/outdoors/not-an-activity`)).status, 404);
    assert.doesNotMatch(await (await fetch(`${base}/sitemap.xml`)).text(), /\/outdoors\/hiking/);

    // Trip planner: outdoor is not an interest, activity kinds are not discovery kinds, and outdoor venues are never itinerary stops.
    const badInterest = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1, interests: ['outdoor'] }) });
    assert.equal(badInterest.status, 400);
    assert.ok(!(await badInterest.json()).allowed.includes('outdoor'));
    const badDiscovery = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1, discovery: ['activity_hiking'] }) });
    assert.equal(badDiscovery.status, 400, 'activity_hiking is not a discovery kind');
    const plan = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1 }) });
    assert.equal(plan.status, 200);
    assert.doesNotMatch(await plan.text(), /Fixture Canyon Park/, 'an outdoor venue must never be picked as an itinerary stop');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});


// ==== Outdoors Phase 2 (2026-09-20): activity discovery =====================
//
// One canonical venue record per destination; activities are many-to-many
// memberships in the activity collections. /outdoors becomes a discovery
// landing page and /outdoors/:activity lists one activity's destinations.

test('Outdoor activity definitions: nine activities map 1:1 onto the bootstrapped collection kinds with clean slugs and labels', () => {
  assert.equal(app.OUTDOOR_ACTIVITIES.length, 9);
  assert.deepEqual([...app.OUTDOOR_ACTIVITIES.map((a) => a.kind)].sort(), [...app.ACTIVITY_COLLECTION_KINDS].sort());
  assert.deepEqual(app.OUTDOOR_ACTIVITIES.map((a) => a.slug), ['hiking', 'cycling', 'winter', 'camping', 'nature', 'water', 'viewpoints', 'adventure', 'fishing']);
  assert.deepEqual(app.OUTDOOR_ACTIVITIES.map((a) => a.label), ['Hiking & Trails', 'Cycling & Biking', 'Winter', 'Camping', 'Nature & Wildlife', 'Water Activities', 'Viewpoints', 'Adventure', 'Fishing']);
  for (const a of app.OUTDOOR_ACTIVITIES) { assert.match(a.slug, /^[a-z]+$/); assert.ok(a.blurb.length > 40); assert.equal(app.OUTDOOR_ACTIVITY_BY_SLUG[a.slug], a); }
  assert.equal(app.MIN_ACTIVITY_VENUES, 3);
  assert.ok(app.OUTDOOR_FEATURED_KEYS.every((k) => /^[a-z-]+\/[a-z0-9-]+$/.test(k)));
});

test('Outdoor activity membership is many-to-many on ONE canonical record: a venue in several activities, no duplicate rows, counts and gating', () => {
  const canyon = app.findVenueBySlug('kelowna', 'outdoor', 'test-canyon-regional-park');
  const nordic = app.findVenueBySlug('vernon', 'outdoor', 'test-nordic-centre');
  const meta = { reason: 'test', batch_id: 'outdoors-phase2-test', reviewed_by: null };
  const added = [];
  const add = (kind, id) => { const r = app.guardedCollectionMembershipUpdate(kind, id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push([kind, id]); };
  try {
    add('activity_hiking', canyon.id); add('activity_viewpoints', canyon.id); add('activity_nature', canyon.id);
    add('activity_winter', nordic.id);
    const hiking = app.OUTDOOR_ACTIVITY_BY_SLUG.hiking;
    const rows = app.getOutdoorActivityVenues(hiking);
    assert.deepEqual(rows.map((v) => v.id), [canyon.id], 'the canyon is listed once under hiking');
    assert.equal(app.getOutdoorActivityVenues(app.OUTDOOR_ACTIVITY_BY_SLUG.winter).map((v) => v.id).join(), String(nordic.id));
    // Still exactly one venue row per destination.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venues WHERE type = 'outdoor' AND slug = 'test-canyon-regional-park'").get().n, 1);
    const counts = app.getOutdoorActivityCounts();
    assert.equal(counts.hiking, 1); assert.equal(counts.viewpoints, 1); assert.equal(counts.nature, 1); assert.equal(counts.winter, 1); assert.equal(counts.camping, 0);
    // Below MIN_ACTIVITY_VENUES nothing is "live": no selector chips, and the activity page would not render.
    assert.deepEqual(app.listLiveOutdoorActivities(), []);
    assert.equal(app.renderOutdoorActivitySelector(null), '');
    // A second add of the same membership is rejected, not duplicated.
    assert.equal(app.guardedCollectionMembershipUpdate('activity_hiking', canyon.id, 'add', null, meta).reason, 'already_member');
    // Activity collections never enter trip discovery even while populated.
    for (const k of app.ACTIVITY_COLLECTION_KINDS) assert.ok(!app.getKnownDiscoveryKinds().includes(k));
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
  }
  assert.equal(app.getOutdoorActivityCounts().hiking, 0);
});

test('Activity page + landing sections render once an activity reaches the threshold: one H1, canonical, SEO/OG, ItemList, community line, active chip, featured cards (fixture-only, cleaned up)', () => {
  // Three more outdoor fixtures so "hiking" reaches MIN_ACTIVITY_VENUES; all removed at the end.
  const ids = [];
  const meta = { reason: 'test', batch_id: 'outdoors-phase2-test', reviewed_by: null };
  const added = [];
  try {
    for (const [name, region, slug] of [['Test Ridge Trail', 'penticton', 'test-ridge-trail'], ['Test Falls Park', 'vernon', 'test-falls-park'], ['Test Bluff Lookout', 'summerland', 'test-bluff-lookout']]) {
      const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} is a fixture outdoor destination used only by the automated test suite.`, address: null, latitude: null, longitude: null, hours: null, slug });
      ids.push(Number(info.lastInsertRowid));
    }
    const canyon = app.findVenueBySlug('kelowna', 'outdoor', 'test-canyon-regional-park');
    for (const id of [canyon.id, ...ids]) { const r = app.guardedCollectionMembershipUpdate('activity_hiking', id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push(['activity_hiking', id]); }
    { const r = app.guardedCollectionMembershipUpdate('activity_viewpoints', canyon.id, 'add', null, meta); assert.equal(r.ok, true); added.push(['activity_viewpoints', canyon.id]); }

    const live = app.listLiveOutdoorActivities();
    assert.deepEqual(live.map((a) => [a.slug, a.count]), [['hiking', 4]], 'only hiking is live; viewpoints (1) stays below the threshold');
    const hiking = app.OUTDOOR_ACTIVITY_BY_SLUG.hiking;
    const venues = app.getOutdoorActivityVenues(hiking);
    assert.equal(venues.length, 4);
    assert.equal(new Set(venues.map((v) => v.id)).size, 4, 'no duplicate venue rows');
    const html = app.renderOutdoorActivityPage(hiking, venues);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(html, /<h1>Hiking &amp; Trails in the Okanagan<\/h1>/);
    assert.match(html, /<title>Hiking &amp; Trails in the Okanagan \| Okanagan Roam<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/outdoors\/hiking"/);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, 'exactly one canonical');
    assert.match(html, /<meta property="og:title" content="Hiking &amp; Trails in the Okanagan \| Okanagan Roam">/);
    assert.match(html, /<meta name="description" content="4 outdoor destinations for hiking &amp; trails across the Okanagan Valley/);
    assert.match(html, /"@type":"ItemList"/); assert.match(html, /"@type":"BreadcrumbList"/); assert.match(html, /"@type":"TouristAttraction"/);
    assert.match(html, /<body class="golf-page outdoor-page">/);
    assert.match(html, /<a class="category-back-link" href="\/outdoors">← All Outdoors<\/a>/);
    assert.match(html, /<nav class="category-region-selector outdoor-activity-selector" aria-label="Choose an activity">\s*<a href="\/outdoors">All Outdoors<\/a>\s*<span class="category-region-selector-active">Hiking &amp; Trails<\/span>\s*<\/nav>/, 'active chip is static; sub-threshold activities are not offered');
    assert.match(html, /<p class="subtitle">4 outdoor destinations for hiking &amp; trails across the Okanagan Valley\.<\/p>/, 'activity pages keep the count line');
    assert.match(html, /<p class="outdoor-intro">/);
    assert.match(html, /Test Canyon Regional Park<\/span><span class="venue-card-cue"[^<]*<\/span><\/a><\/h2>\s*<p class="venue-meta">Kelowna<\/p>/, 'community line on activity cards');
    const cards = html.match(/<li class="venue-card" data-venue-id="\d+" data-venue-region="[a-z-]+" data-venue-category="outdoor"/g) || [];
    assert.equal(cards.length, 4);
    assert.doesNotMatch(html, /Test Nordic Centre/, 'a venue outside the activity is not listed');
    assert.match(html, /<footer class="home-footer"/);
    assert.doesNotMatch(html, /Outdoor page theme \(2026-09-20\)[\s\S]*Outdoor page theme \(2026-09-20\)/, 'theme block emitted once');

    // Landing page: discovery sections in order, featured limited to resolvable keys (none of the fixtures), chips with counts.
    const all = app.getVenuesByCategory('outdoor');
    const landing = app.renderCategoryAllRegionsPage('outdoor', all);
    assert.equal((landing.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(landing, /<h1>Outdoors in the Okanagan<\/h1>/);
    const order = ['<p class="outdoor-intro">', 'Choose Region(s)</h2>', 'data-filter="region"', 'id="outdoorActivitiesHeading">Choose Activity(s)</h2>', 'data-filter="activity"', 'id="outdoorShowResults"', 'id="outdoorResultsTop">Results</h2>', '<ul class="card-grid" id="outdoorResults">'];
    const landingMarkup = outdoorMarkupOnly(landing);
    let pos = -1; for (const marker of order) { const i = landingMarkup.indexOf(marker); assert.ok(i > pos, `landing section order: ${marker}`); pos = i; }
    assert.match(landing, /<button type="button" class="outdoor-activity-card outdoor-activity-card-hiking outdoor-activity-toggle" data-activity="hiking" aria-pressed="false"[^>]*>[\s\S]*?<span class="outdoor-activity-card-count"><span class="outdoor-activity-count">4<\/span> <span class="outdoor-activity-count-noun">destinations<\/span><\/span>/, 'the live activity card is a filter toggle carrying its count');
    assert.match(landing, /<a class="outdoor-activity-card-link" href="\/outdoors\/hiking" aria-label="Hiking &amp; Trails guide">Guide &rarr;<\/a>/, 'and keeps a link to the activity page');
    assert.doesNotMatch(landing, /data-activity="viewpoints"|data-activity="camping"|href="\/outdoors\/(viewpoints|camping)"/, 'sub-threshold activities get no toggle and no link');
    assert.equal((outdoorMarkupOnly(landing).match(/<li class="venue-card" /g) || []).length, all.length, 'every destination rendered once');
    // The per-venue activity map only carries live activities.
    const mapJson = JSON.parse(landing.match(/id="outdoorActivityMap">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(mapJson[String(canyon.id)], ['hiking'], 'viewpoints is not live, so it is absent from the map');
    // Activity page chips carry no counts.
    assert.doesNotMatch(outdoorMarkupOnly(html), /outdoor-activity-count/, 'no chip counts on activity pages');
    assert.doesNotMatch(landing, /Featured Outdoor Experiences/, 'the landing directory has no featured section');
    assert.doesNotMatch(outdoorMarkupOnly(landing), /aria-label="Filter by region"|category-region-selector-active">All Regions/, 'the shared All-Regions selector is not rendered on the landing');
    const chipRegions = [...outdoorMarkupOnly(landing).match(/data-filter="region"[\s\S]*?Choose Activity\(s\)/)[0].matchAll(/data-region="([a-z-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(chipRegions, app.canonicalOutdoorRegionOrder(), 'region chips: the complete canonical region list in the site order');
    assert.equal(app.renderOutdoorFeaturedHtml(all), '');
    // Featured section, when a key resolves, captions cards with their activities and never duplicates the venue.
    const featuredHtml = app.renderOutdoorFeaturedHtml([{ ...canyon, region: 'kelowna', slug: 'myra-canyon-myra-bellevue-provincial-park' }]);
    assert.match(featuredHtml, /Featured Outdoor Experiences/);
    assert.match(featuredHtml, /compact-band-label">Kelowna<\/span>/);
    assert.match(featuredHtml, /<div class="related-meta">Hiking &amp; Trails · Viewpoints<\/div>/);
    assert.equal((featuredHtml.match(/related-card related-card-outdoor/g) || []).length, 1);
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
});

// Activity pages list by membership across the allowlisted venue types
// (2026-09-21): a provincial park catalogued as a Beach that holds an
// activity membership renders on that activity page, counts toward its
// threshold, and keeps its own type on the card (href under /beaches,
// data-venue-category="beach"). A membership on a non-allowlisted type
// (winery) is ignored by both the listing and the counts, and golf is
// deliberately outside the allowlist.
test('Outdoor activity pages list beach-type members (membership + type allowlist), never non-allowlisted types (fixture-only, cleaned up)', () => {
  assert.deepEqual(app.OUTDOOR_ACTIVITY_VENUE_TYPES, ['outdoor', 'beach']);
  const meta = { reason: 'test', batch_id: 'outdoors-type-allowlist-test', reviewed_by: null };
  const ids = [];
  const added = [];
  try {
    for (const [name, region, slug] of [['Test Ridge Trail', 'penticton', 'test-ridge-trail'], ['Test Falls Park', 'vernon', 'test-falls-park']]) {
      const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} is a fixture outdoor destination used only by the automated test suite.`, address: null, latitude: null, longitude: null, hours: null, slug });
      ids.push(Number(info.lastInsertRowid));
    }
    const beach = app.findVenueBySlug('kelowna', 'beach', 'test-beach-park');
    const winery = app.findVenueBySlug('kelowna', 'winery', 'test-winery');
    const golf = app.findVenueBySlug('west-kelowna', 'golf', 'test-west-kelowna-golf-course');
    assert.ok(beach && winery && golf, 'fixtures present');
    for (const id of [...ids, beach.id, winery.id, golf.id]) { const r = app.guardedCollectionMembershipUpdate('activity_camping', id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push(['activity_camping', id]); }

    // Counts: two outdoor + one beach = 3 (the threshold); winery and golf memberships do not count.
    assert.equal(app.getOutdoorActivityCounts().camping, 3);
    assert.deepEqual(app.listLiveOutdoorActivities().map((a) => [a.slug, a.count]), [['camping', 3]], 'the beach member lifts camping to live');
    const camping = app.OUTDOOR_ACTIVITY_BY_SLUG.camping;
    const venues = app.getOutdoorActivityVenues(camping);
    assert.deepEqual(venues.map((v) => v.id).sort((a, b) => a - b), [...ids, beach.id].sort((a, b) => a - b), 'beach member listed; winery and golf members are not');
    assert.deepEqual(venues.map((v) => v.name), ['Test Beach Park', 'Test Falls Park', 'Test Ridge Trail'], 'name order across types');

    const html = app.renderOutdoorActivityPage(camping, venues);
    assert.match(html, /<p class="subtitle">3 outdoor destinations for camping across the Okanagan Valley\.<\/p>/);
    assert.match(html, /<li class="venue-card" data-venue-id="\d+" data-venue-region="kelowna" data-venue-category="beach" data-venue-name="Test Beach Park"/, 'the beach card keeps its own type');
    assert.match(html, /<a class="venue-card-link" href="\/kelowna\/beaches\/test-beach-park">/, 'the beach card links to its beach venue page');
    assert.equal((html.match(/<li class="venue-card" data-venue-id="\d+" data-venue-region="[a-z-]+" data-venue-category="outdoor"/g) || []).length, 2);
    assert.match(html, /"url":"https:\/\/okanaganroam\.com\/kelowna\/beaches\/test-beach-park"/, 'JSON-LD ItemList uses the beach URL');
    assert.doesNotMatch(html, /Test Winery|Test West Kelowna Golf Course/, 'non-allowlisted members never render');
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
  assert.equal(app.getOutdoorActivityCounts().camping, 0);
});

test('REGRESSION (Outdoors Phase 2): Golf/Beach wide pages keep their heading and carry no discovery sections; restaurant/region pages untouched', () => {
  const golfRows = app.getVenuesByRegionCategory('kelowna', 'golf');
  const beachRows = app.getVenuesByRegionCategory('kelowna', 'beach');
  const golf = app.renderCategoryAllRegionsPage('golf', golfRows);
  const beach = app.renderCategoryAllRegionsPage('beach', beachRows);
  assert.match(golf, /<h1>Golf Courses in the Okanagan<\/h1>/);
  assert.match(beach, /<h1>Beaches in the Okanagan<\/h1>/);
  for (const html of [golf, beach, app.renderCategoryPage('kelowna', 'beach', beachRows, []), app.renderCategoryPage('kelowna', 'outdoor', app.getVenuesByRegionCategory('kelowna', 'outdoor'), [])]) {
    assert.doesNotMatch(outdoorMarkupOnly(html), /outdoor-intro|outdoor-activity-selector|Choose an activity|Featured outdoor experiences|All outdoor destinations|Explore by region<\/h2>/);
  }
  assert.doesNotMatch(golf, /outdoor-page|Outdoor page theme/);
  assert.doesNotMatch(beach, /outdoor-page|Outdoor page theme/);
  const restaurant = app.renderVenuePage(app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria'), [], [], []);
  assert.doesNotMatch(restaurant, /outdoor-activity|outdoor-intro|\/outdoors\//);
});

test('FROZEN HOMEPAGE + FOOTER (Outdoors Phase 2): activity memberships and a live activity page change nothing on "/", /beaches, /golf, /browse, /trip; activity route, sitemap and 404s behave (isolated child process)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okanagan-outdoors-activity-'));
  const projectRoot = path.join(__dirname, '..');
  for (const f of ['server.js', 'db.js', 'okanagan.html']) fs.copyFileSync(path.join(projectRoot, f), path.join(tempDir, f));
  const ISOLATED_PORT = '3095';
  const TOKEN = 'outdoors-activity-test-token';
  const child = spawn(process.execPath, ['--no-warnings', path.join(tempDir, 'server.js')], { cwd: tempDir, env: { ...process.env, PORT: ISOLATED_PORT, ENRICHMENT_ADMIN_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrOutput = '';
  child.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });
  const base = `http://localhost:${ISOLATED_PORT}`;
  const authed = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
  const footerOf = (html) => html.slice(html.indexOf('<footer class="home-footer"'), html.indexOf('</footer>') + 9);
  try {
    const deadline = Date.now() + 10000; let ready = false;
    while (Date.now() < deadline && !ready) { try { if ((await fetch(`${base}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
    assert.ok(ready, `isolated child never became ready. stderr: ${stderrOutput}`);
    const post = async (body) => { const r = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify(body) }); const t = await r.text(); assert.equal(r.status, 201, t); return JSON.parse(t); };
    await post({ name: 'Fixture Winery', region: 'kelowna', type: 'winery', description: 'fixture', slug: 'fixture-winery' });
    await post({ name: 'Fixture Beach', region: 'kelowna', type: 'beach', description: 'fixture beach', slug: 'fixture-beach' });
    await post({ name: 'Fixture Golf Course', region: 'kelowna', type: 'golf', description: 'An 18-hole fixture course.', slug: 'fixture-golf-course' });
    const outdoor = [];
    for (const [name, region, slug] of [['Fixture Canyon Park', 'kelowna', 'fixture-canyon-park'], ['Fixture Ridge Trail', 'penticton', 'fixture-ridge-trail'], ['Fixture Falls Park', 'vernon', 'fixture-falls-park']]) {
      outdoor.push(await post({ name, region, type: 'outdoor', description: `${name} fixture`, slug }));
    }
    const snap = async () => Object.fromEntries(await Promise.all(['/', '/beaches', '/golf', '/browse', '/trip'].map(async (p) => [p, await (await fetch(`${base}${p}`)).text()])));
    const before = await snap();
    assert.equal((await fetch(`${base}/outdoors/hiking`)).status, 404, 'no memberships yet -> 404');
    for (const v of outdoor) {
      const r = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind: 'activity_hiking', venue_id: v.id, action: 'add', reason: 'test', batch_id: 'phase2-test' }) });
      assert.equal(r.status, 200, await r.text());
    }
    const r2 = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind: 'activity_viewpoints', venue_id: outdoor[0].id, action: 'add', reason: 'test', batch_id: 'phase2-test' }) });
    assert.equal(r2.status, 200);
    const after = await snap();
    for (const p of Object.keys(before)) assert.equal(after[p], before[p], `${p} must be byte-identical after activity memberships exist`);
    assert.match(after['/'], /class="mood-card mood-card-outdoors" href="\/outdoors">/);
    assert.match(after['/'], /<li><a href="\/outdoors" data-i18n="mood\.outdoors\.title">Outdoors<\/a><\/li>/);
    assert.doesNotMatch(after['/'], /\/outdoors\/hiking|outdoor-activity/);

    const act = await fetch(`${base}/outdoors/hiking`);
    assert.equal(act.status, 200);
    const actBody = await act.text();
    assert.equal((actBody.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(actBody, /rel="canonical" href="https:\/\/okanaganroam\.com\/outdoors\/hiking"/);
    assert.equal((actBody.match(/<li class="venue-card" /g) || []).length, 3, 'three cards, one per member');
    assert.equal(footerOf(actBody), footerOf(before['/beaches']), 'activity page footer == /beaches footer');
    assert.equal((await fetch(`${base}/outdoors/viewpoints`)).status, 404, 'one member -> still 404');
    assert.equal((await fetch(`${base}/outdoors/hiking/`)).status, 200, 'trailing slash tolerated like other routes');
    const landing = await (await fetch(`${base}/outdoors`)).text();
    assert.equal((landing.match(/<h1[\s>]/g) || []).length, 1);
    const lm = landing.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
    assert.ok(lm.indexOf('Choose Region(s)</h2>') < lm.indexOf('Choose Activity(s)</h2>') && lm.indexOf('Choose Activity(s)</h2>') < lm.indexOf('Results</h2>'), 'Region -> Choose Activity(s) -> Results');
    assert.doesNotMatch(lm, /Explore by Activity/);
    for (const r of ['kelowna', 'penticton', 'vernon']) {
      assert.match(lm, new RegExp(`<button type="button" class="outdoor-filter-chip" data-region="${r}" aria-pressed="false">`), `region chip for ${r}`);
      assert.equal((await fetch(`${base}/${r}/outdoors`)).status, 200, `/${r}/outdoors is valid`);
    }
    assert.equal((await fetch(`${base}/outdoors/camping`)).status, 404); assert.equal((await fetch(`${base}/outdoors/water`)).status, 404);
    assert.match(landing, /<button type="button" class="outdoor-activity-card outdoor-activity-card-hiking outdoor-activity-toggle" data-activity="hiking" aria-pressed="false"[^>]*>[\s\S]*?<span class="outdoor-activity-count">3<\/span> <span class="outdoor-activity-count-noun">destinations<\/span>/);
    assert.match(landing, /<a class="outdoor-activity-card-link" href="\/outdoors\/hiking"/);
    assert.equal((lm.match(/<li class="venue-card" /g) || []).length, 3, 'results list has each venue once');
    assert.match(landing, /id="outdoorResults"/);
    assert.match(landing, /querySelectorAll\('#outdoorResults > \.venue-card'\)/, 'filter script shipped on the landing');
    assert.doesNotMatch(actBody.replace(/<style>[\s\S]*?<\/style>/g, ''), /outdoorActivityMap|outdoor-filter-chip|outdoorShowResults/, 'activity pages carry no filter UI');
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemap, /<loc>https:\/\/okanaganroam\.com\/outdoors\/hiking<\/loc>/);
    assert.doesNotMatch(sitemap, /\/outdoors\/viewpoints/);
    const plan = await fetch(`${base}/api/trip/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: 'kelowna', days: 1, discovery: ['activity_hiking'] }) });
    assert.equal(plan.status, 400, 'activity kinds are never trip discovery kinds');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});


// ==== Outdoors landing multi-select filter (2026-09-20) =====================

test('Outdoor filter semantics: regions OR, activities OR, groups AND, empty group = no constraint (server predicate and the shipped client predicate agree)', () => {
  const clientMatches = new Function(`${app.OUTDOOR_FILTER_CLIENT_PREDICATE_SRC}; return matches;`)();
  const cases = [
    [[], [], 'kelowna', [], true],
    [['kelowna'], [], 'kelowna', [], true],
    [['kelowna'], [], 'vernon', ['hiking'], false],
    [['kelowna', 'vernon'], [], 'vernon', [], true],
    [[], ['hiking'], 'osoyoos', ['hiking', 'nature'], true],
    [[], ['hiking', 'winter'], 'apex', ['winter'], true],
    [[], ['hiking', 'winter'], 'apex', ['nature'], false],
    [['kelowna', 'vernon'], ['hiking', 'winter'], 'vernon', ['hiking'], true],
    [['kelowna', 'vernon'], ['hiking', 'winter'], 'vernon', ['nature'], false],
    [['kelowna', 'vernon'], ['hiking', 'winter'], 'apex', ['winter'], false],
    [['kelowna'], ['hiking'], 'kelowna', [], false],
  ];
  for (const [r, a, vr, va, expected] of cases) {
    assert.equal(app.outdoorFilterMatches(r, a, vr, va), expected, `server: regions=${r} activities=${a} venue=${vr}/${va}`);
    assert.equal(clientMatches(r, a, vr, va), expected, `client: regions=${r} activities=${a} venue=${vr}/${va}`);
  }
});

test('filterOutdoorVenues over real memberships: region-only, activity-only, combined, multi-select, result counts, no-results, and reset', () => {
  const meta = { reason: 'test', batch_id: 'outdoors-filter-test', reviewed_by: null };
  const ids = []; const added = [];
  const mk = (name, region, slug) => { const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} fixture.`, address: null, latitude: null, longitude: null, hours: null, slug }); const id = Number(info.lastInsertRowid); ids.push(id); return id; };
  const add = (kind, id) => { const r = app.guardedCollectionMembershipUpdate(kind, id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push([kind, id]); };
  try {
    const kelA = mk('Filter Kelowna Trail', 'kelowna', 'filter-kelowna-trail');
    const kelB = mk('Filter Kelowna Peak', 'kelowna', 'filter-kelowna-peak');
    const verA = mk('Filter Vernon Falls', 'vernon', 'filter-vernon-falls');
    const apxA = mk('Filter Apex Resort', 'apex', 'filter-apex-resort');
    const osoA = mk('Filter Osoyoos Desert', 'osoyoos', 'filter-osoyoos-desert');
    add('activity_hiking', kelA); add('activity_hiking', kelB); add('activity_winter', kelB); add('activity_hiking', verA); add('activity_winter', apxA);
    // Make hiking and winter "live" for this test so getOutdoorActivitySlugsByVenue includes them (3+ members each incl. the canyon fixture).
    const canyon = app.findVenueBySlug('kelowna', 'outdoor', 'test-canyon-regional-park');
    const nordic = app.findVenueBySlug('vernon', 'outdoor', 'test-nordic-centre');
    add('activity_hiking', canyon.id); add('activity_winter', nordic.id); add('activity_winter', canyon.id);
    const venues = app.getVenuesByCategory('outdoor').filter((v) => ids.includes(v.id));
    assert.equal(venues.length, 5);
    assert.equal(new Set(venues.map((v) => v.id)).size, 5, 'no duplicate venue records were created');
    const map = app.getOutdoorActivitySlugsByVenue(venues);
    assert.deepEqual(map.get(kelB).sort(), ['hiking', 'winter']);
    assert.equal(map.has(osoA), false);
    const names = (list) => list.map((v) => v.name).sort();
    assert.equal(app.filterOutdoorVenues(venues, [], [], map).length, 5, 'no filters = everything');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, ['kelowna'], [], map)), ['Filter Kelowna Peak', 'Filter Kelowna Trail'], 'region-only');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, ['kelowna', 'osoyoos'], [], map)), ['Filter Kelowna Peak', 'Filter Kelowna Trail', 'Filter Osoyoos Desert'], 'multiple regions = OR');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, [], ['winter'], map)), ['Filter Apex Resort', 'Filter Kelowna Peak'], 'activity-only, across regions');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, [], ['hiking', 'winter'], map)), ['Filter Apex Resort', 'Filter Kelowna Peak', 'Filter Kelowna Trail', 'Filter Vernon Falls'], 'multiple activities = OR; a venue in both counted once');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, ['kelowna', 'vernon'], ['hiking', 'winter'], map)), ['Filter Kelowna Peak', 'Filter Kelowna Trail', 'Filter Vernon Falls'], 'regions AND activities');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, ['vernon'], ['winter'], map)), [], 'no-results state');
    assert.deepEqual(names(app.filterOutdoorVenues(venues, ['osoyoos'], ['hiking'], map)), [], 'a venue with no activity never satisfies an activity filter');
    assert.equal(app.filterOutdoorVenues(venues, [], [], map).length, 5, 'reset = everything again');
    const chips = app.renderOutdoorRegionFilterChips(venues);
    assert.match(chips, /data-region="apex" aria-pressed="false">Apex<span class="outdoor-activity-count">1<\/span>/);
    assert.match(chips, /data-region="kelowna" aria-pressed="false">Kelowna<span class="outdoor-activity-count">2<\/span>/);
    const script = app.renderOutdoorFilterScriptHtml();
    for (const needle of ['data-venue-region', 'aria-pressed', 'outdoorClearFilters', 'outdoorNoResults', 'replaceState', 'outdoorNoResultsClear', '"kelowna":"Kelowna"', '"hiking":"Hiking & Trails"']) assert.ok(script.includes(needle), needle);
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
});


// ==== Outdoor discovery refinement (2026-09-20): server-applied URL state,
// contextual counts, selected-filter tags, history push/pop ===============

test('parseOutdoorFilterQuery: existing ?regions=a,b&activities=x,y convention; unknown regions and non-live activities dropped; duplicates collapse', () => {
  // No activity is live in the plain fixture DB here, so every activity
  // value must be dropped; the live path is exercised by the render test
  // below once hiking/winter have enough fixture members.
  const q = app.parseOutdoorFilterQuery({ regions: 'kelowna,vernon,kelowna,not-a-region, ', activities: 'hiking,bogus,hiking' });
  assert.deepEqual(q.regions, ['kelowna', 'vernon']);
  assert.deepEqual(q.activities, [], 'an activity that is not live is not a usable filter');
  assert.deepEqual(app.parseOutdoorFilterQuery({}), { regions: [], activities: [] });
  assert.deepEqual(app.parseOutdoorFilterQuery(undefined), { regions: [], activities: [] });
  assert.deepEqual(app.parseOutdoorFilterQuery({ regions: ['kelowna', 'apex'] }), { regions: ['kelowna', 'apex'], activities: [] }, 'repeated query keys are accepted too');
});

test('outdoorSummaryText and the shipped client twin produce identical wording for every state', () => {
  const client = new Function(`${app.OUTDOOR_SUMMARY_CLIENT_SRC}; return summaryText;`)();
  const cases = [[62, 62, [], []], [20, 62, ['Kelowna', 'Vernon'], ['Hiking & Trails', 'Viewpoints']], [0, 62, ['Baldy'], []], [3, 62, [], ['Winter']]];
  for (const [shown, total, r, a] of cases) {
    const text = app.outdoorSummaryText(shown, total, r, a);
    assert.equal(client(shown, total, r, a), text);
  }
  assert.equal(app.outdoorSummaryText(62, 62, [], []), '62 outdoor destinations');
  // 2026-09-22: the count line is count only; the labels live in the selected-filter rows.
  assert.equal(app.outdoorSummaryText(20, 62, ['Kelowna', 'Vernon'], ['Hiking & Trails', 'Viewpoints']), '20 of 62 outdoor destinations');
  assert.equal(app.outdoorSummaryText(0, 62, ['Baldy'], []), '0 of 62 outdoor destinations');
});

test('/outdoors with a filter query renders pre-filtered: pressed chips, contextual counts, hidden cards, summary, Show N / Clear, selected tags, empty state; no query = unchanged landing', () => {
  const meta = { reason: 'test', batch_id: 'outdoors-prefilter-test', reviewed_by: null };
  const ids = []; const added = [];
  const mk = (name, region, slug) => { const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} fixture.`, address: null, latitude: null, longitude: null, hours: null, slug }); ids.push(Number(info.lastInsertRowid)); return Number(info.lastInsertRowid); };
  const add = (kind, id) => { const r = app.guardedCollectionMembershipUpdate(kind, id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push([kind, id]); };
  try {
    const kelA = mk('Prefilter Kelowna Trail', 'kelowna', 'prefilter-kelowna-trail');
    const kelB = mk('Prefilter Kelowna Peak', 'kelowna', 'prefilter-kelowna-peak');
    const verA = mk('Prefilter Vernon Falls', 'vernon', 'prefilter-vernon-falls');
    const apxA = mk('Prefilter Apex Resort', 'apex', 'prefilter-apex-resort');
    const canyon = app.findVenueBySlug('kelowna', 'outdoor', 'test-canyon-regional-park');
    const nordic = app.findVenueBySlug('vernon', 'outdoor', 'test-nordic-centre');
    // hiking: kelA, kelB, verA, canyon (4) -- live; winter: kelB, apxA, nordic (3) -- live
    add('activity_hiking', kelA); add('activity_hiking', kelB); add('activity_hiking', verA); add('activity_hiking', canyon.id);
    add('activity_winter', kelB); add('activity_winter', apxA); add('activity_winter', nordic.id);
    const all = app.getVenuesByCategory('outdoor');
    const map = app.getOutdoorActivitySlugsByVenue(all);
    assert.deepEqual(app.parseOutdoorFilterQuery({ regions: 'vernon,kelowna', activities: 'winter,bogus,hiking,winter' }), { regions: ['vernon', 'kelowna'], activities: ['winter', 'hiking'] }, 'live activities parse, order kept, duplicates and unknowns dropped');

    // Contextual counts: region counts respect the activity selection and vice versa; nothing selected = plain totals.
    const plain = app.outdoorChipCounts(all, map, [], []);
    assert.equal(plain.regions.kelowna, all.filter((v) => v.region === 'kelowna').length);
    assert.equal(plain.activities.hiking, 4);
    const ctx = app.outdoorChipCounts(all, map, ['vernon'], ['winter']);
    assert.equal(ctx.regions.kelowna, 1, 'Kelowna count = Kelowna venues with winter (kelB) -- ignores the region selection (OR within group)');
    assert.equal(ctx.regions.apex, 1);
    assert.equal(ctx.activities.hiking, 1, 'hiking count = hiking venues in Vernon (verA)');
    assert.equal(ctx.activities.winter, 1, 'winter count = winter venues in Vernon (nordic)');

    // Filtered render: kelowna + vernon, hiking + winter.
    const filtered = app.renderCategoryAllRegionsPage('outdoor', all, { regions: ['kelowna', 'vernon'], activities: ['hiking', 'winter'] });
    const markup = outdoorMarkupOnly(filtered);
    const expected = app.filterOutdoorVenues(all, ['kelowna', 'vernon'], ['hiking', 'winter'], map);
    assert.match(markup, /data-region="kelowna" aria-pressed="true">/); assert.match(markup, /data-region="vernon" aria-pressed="true">/); assert.match(markup, /data-region="apex" aria-pressed="false">/);
    assert.match(markup, /data-activity="hiking" aria-pressed="true"/); assert.match(markup, /data-activity="winter" aria-pressed="true"/, 'URL-selected activity cards render pressed');
    const hiddenCards = (markup.match(/<li class="venue-card" data-venue-id="\d+"[^>]*? hidden>/g) || []).length;
    const totalCards = (markup.match(/<li class="venue-card" data-venue-id="\d+"/g) || []).length;
    assert.equal(totalCards, all.length, 'every destination is still in the markup for the script to toggle');
    assert.equal(totalCards - hiddenCards, expected.length, 'exactly the matching cards are visible');
    for (const v of expected) assert.match(markup, new RegExp(`<li class="venue-card" data-venue-id="${v.id}"(?![^>]* hidden)[^>]*>`), `${v.name} visible`);
    assert.match(markup, new RegExp(`id="outdoorResultsSummary" aria-live="polite">${expected.length} of ${all.length} outdoor destinations</p>`));
    assert.match(markup, new RegExp(`id="outdoorShowResults">Show ${expected.length} results</button>`));
    assert.match(markup, /id="outdoorClearFilters">Clear all</); assert.doesNotMatch(markup, /id="outdoorClearFilters" hidden/);
    assert.match(markup, /<div class="outdoor-selected" id="outdoorSelected"><div class="outdoor-selected-row"><span class="outdoor-selected-label">Regions<\/span> <button type="button" class="outdoor-selected-tag" data-remove-region="kelowna" aria-label="Remove Kelowna">Kelowna<span class="outdoor-selected-x" aria-hidden="true">×<\/span><\/button> <button type="button" class="outdoor-selected-tag" data-remove-region="vernon"[^>]*>Vernon[\s\S]*?<\/div><div class="outdoor-selected-row"><span class="outdoor-selected-label">Activities<\/span> /);
    assert.match(markup, /data-remove-activity="hiking"[^>]*>Hiking &amp; Trails</); assert.match(markup, /id="outdoorSelectedClear">Clear all<\/button>/);
    assert.match(markup, /id="outdoorNoResults" hidden>/); assert.match(markup, /<ul class="card-grid" id="outdoorResults">/);
    // Group holding a selection is open with its meta; the rest keep their default state.
    assert.match(markup, /data-region-group="north">\s*<button[^>]*aria-expanded="true"[^>]*><span class="outdoor-region-group-name">North<\/span><span class="outdoor-region-group-meta">\d+ regions<\/span><span class="outdoor-region-group-selected">· 1 selected<\/span>/);
    assert.match(markup, /data-region-group="ski-resorts">\s*<button[^>]*aria-expanded="false"/);
    // Contextual counts are what the region chips carry in the filtered render.
    assert.match(markup, new RegExp(`data-region="kelowna" aria-pressed="true">Kelowna<span class="outdoor-activity-count">${app.outdoorChipCounts(all, map, ['kelowna', 'vernon'], ['hiking', 'winter']).regions.kelowna}</span>`));
    // Canonical stays the bare landing; the filter never becomes a route.
    assert.match(filtered, /rel="canonical" href="https:\/\/okanaganroam\.com\/outdoors"/);

    // Empty result: Baldy + winter (no Baldy fixture) -> no cards visible, list hidden, empty state shown, tags still present.
    const empty = outdoorMarkupOnly(app.renderCategoryAllRegionsPage('outdoor', all, { regions: ['baldy'], activities: ['winter'] }));
    assert.match(empty, /<ul class="card-grid" id="outdoorResults" hidden>/);
    assert.match(empty, /id="outdoorNoResults">No outdoor destinations match that combination yet\./);
    assert.match(empty, new RegExp(`aria-live="polite">0 of ${all.length} outdoor destinations</p>`));
    assert.match(empty, /data-remove-region="baldy"/); assert.match(empty, /data-remove-activity="winter"/);
    assert.match(empty, /id="outdoorShowResults">Show 0 results</);
    assert.equal((empty.match(/<li class="venue-card" data-venue-id="\d+"(?![^>]* hidden)[^>]*>/g) || []).length, 0);

    // Unknown values are ignored (parse step) and an empty filter renders the untouched landing.
    const plainHtml = app.renderCategoryAllRegionsPage('outdoor', all);
    assert.equal(app.renderCategoryAllRegionsPage('outdoor', all, { regions: [], activities: [] }), plainHtml, 'empty filter = default landing byte-for-byte');
    assert.equal(app.renderCategoryAllRegionsPage('outdoor', all, null), plainHtml);
    const pm = outdoorMarkupOnly(plainHtml);
    assert.doesNotMatch(pm, /aria-pressed="true"|data-venue-id="\d+"[^>]* hidden>/);
    assert.match(pm, /id="outdoorSelected" hidden><\/div>/);
    assert.match(pm, /id="outdoorClearFilters" hidden>/); assert.match(pm, /id="outdoorShowResults">Show all results</);
    // Other categories ignore the filter argument entirely.
    const golfRows = app.getVenuesByCategory('golf');
    if (golfRows.length) assert.equal(app.renderCategoryAllRegionsPage('golf', golfRows, { regions: ['kelowna'], activities: ['hiking'] }), app.renderCategoryAllRegionsPage('golf', golfRows));
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
});

test('Outdoor filter script: pushes history on visitor changes, restores on popstate, recomputes contextual counts, renders removable tags; summary twin shipped', () => {
  const script = app.renderOutdoorFilterScriptHtml();
  for (const needle of ['pushState', 'popstate', "apply('push')", "apply('replace')", "apply('none')", 'updateChipCounts', 'renderSelected', 'data-remove-region', 'data-remove-activity', 'outdoorSelectedClear', 'function summaryText', 'function matches', 'readUrlIntoChips', 'regions=', 'activities=']) {
    assert.ok(script.includes(needle), `script contains ${needle}`);
  }
  assert.ok(script.includes(app.OUTDOOR_SUMMARY_CLIENT_SRC) && script.includes(app.OUTDOOR_FILTER_CLIENT_PREDICATE_SRC) && script.includes(app.OUTDOOR_REGION_GROUP_CLIENT_SRC));
});

test('/outdoors?regions=..&activities=.. over HTTP renders pre-filtered; the bare /outdoors and the region page are unaffected (isolated child process)', async () => {
  const childEnv = { ...process.env };
  const ISOLATED_PORT = '3096';
  childEnv.PORT = ISOLATED_PORT;
  childEnv.ENRICHMENT_ADMIN_TOKEN = 'prefilter-http-test-token';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okroam-prefilter-'));
  for (const f of ['server.js', 'db.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
  try { fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(dir, 'node_modules')); } catch (_) {}
  const child = spawn(process.execPath, ['--no-warnings', path.join(dir, 'server.js')], { cwd: dir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrOutput = '';
  child.stderr.on('data', (d) => { stderrOutput += d.toString(); });
  try {
    const base = `http://localhost:${ISOLATED_PORT}`;
    const deadline = Date.now() + 15000; let ready = false;
    while (Date.now() < deadline && !ready) { try { if ((await fetch(`${base}/robots.txt`)).status === 200) ready = true; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
    assert.ok(ready, `isolated child never became ready. stderr: ${stderrOutput}`);
    const authed = { 'Content-Type': 'application/json', Authorization: `Bearer ${childEnv.ENRICHMENT_ADMIN_TOKEN}` };
    const post = async (body) => { const r = await fetch(`${base}/api/venues`, { method: 'POST', headers: authed, body: JSON.stringify(body) }); const t = await r.text(); assert.equal(r.status, 201, t); return JSON.parse(t); };
    const made = [];
    for (const [name, region, slug] of [['Fx Kelowna Trail', 'kelowna', 'fx-kelowna-trail'], ['Fx Kelowna Ridge', 'kelowna', 'fx-kelowna-ridge'], ['Fx Vernon Falls', 'vernon', 'fx-vernon-falls'], ['Fx Apex Peak', 'apex', 'fx-apex-peak']]) made.push(await post({ name, region, type: 'outdoor', description: `${name} fixture`, slug }));
    for (const v of made.slice(0, 3)) { const r = await fetch(`${base}/admin/collection-membership`, { method: 'POST', headers: authed, body: JSON.stringify({ kind: 'activity_hiking', venue_id: v.id, action: 'add', reason: 'test', batch_id: 'prefilter-http' }) }); assert.equal(r.status, 200, await r.text()); }
    const plain = await (await fetch(`${base}/outdoors`)).text();
    const filtered = await (await fetch(`${base}/outdoors?regions=kelowna&activities=hiking`)).text();
    assert.notEqual(plain, filtered);
    const fm = outdoorMarkupOnly(filtered);
    assert.match(fm, /data-region="kelowna" aria-pressed="true">/); assert.match(fm, /data-activity="hiking" aria-pressed="true"/);
    assert.match(fm, /aria-live="polite">2 of 4 outdoor destinations</); assert.match(fm, /data-remove-activity="hiking"/);
    assert.equal((fm.match(/<li class="venue-card" data-venue-id="\d+"(?![^>]* hidden)[^>]*>/g) || []).length, 2);
    assert.match(fm, /data-remove-region="kelowna"/);
    assert.match(filtered, /rel="canonical" href="https:\/\/okanaganroam\.com\/outdoors"/);
    // Junk / unknown values degrade to the plain landing; the region page ignores the query.
    assert.equal(await (await fetch(`${base}/outdoors?regions=nowhere&activities=none`)).text(), plain);
    const regionPlain = await (await fetch(`${base}/kelowna/outdoors`)).text();
    assert.equal(await (await fetch(`${base}/kelowna/outdoors?regions=vernon&activities=hiking`)).text(), regionPlain);
    // Back/forward + share: the same URL always renders the same filtered state.
    assert.equal(await (await fetch(`${base}/outdoors?regions=kelowna&activities=hiking`)).text(), filtered);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
});

// ==== Outdoor activity showcase (2026-09-20 approved presentation) ==========

test('Outdoor activity cards (2026-09-22 explorer): nine data-model activities in the approved order, live ones are filter toggles with a Guide link, below-gate ones are inert "Coming soon" tiles; no invented slugs', () => {
  const cards = app.OUTDOOR_ACTIVITY_CARDS;
  assert.deepEqual(cards.map((c) => c.title), ['Hiking & Trails', 'Cycling & Bike Trails', 'Water Activities', 'Adventure', 'Fishing', 'Winter', 'Nature & Wildlife', 'Viewpoints & Lookouts', 'Camping']);
  assert.equal(cards.length, 9, 'one card per data-model activity');
  for (const c of cards) assert.ok(app.OUTDOOR_ACTIVITY_BY_SLUG[c.slug], `${c.title} maps onto an existing activity slug (${c.slug})`);
  assert.deepEqual([...cards.map((c) => c.slug)].sort(), [...app.OUTDOOR_ACTIVITIES.map((a) => a.slug)].sort(), 'exactly the nine activities, nothing invented');

  const meta = { reason: 'test', batch_id: 'outdoors-showcase-test', reviewed_by: null };
  const ids = []; const added = [];
  const mk = (name, region, slug) => { const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} fixture.`, address: null, latitude: null, longitude: null, hours: null, slug }); ids.push(Number(info.lastInsertRowid)); return Number(info.lastInsertRowid); };
  const add = (kind, id) => { const r = app.guardedCollectionMembershipUpdate(kind, id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push([kind, id]); };
  try {
    // Nothing live yet: every card is a "Coming soon" tile, none is a control.
    const none = app.renderOutdoorActivityShowcaseHtml();
    assert.equal((none.match(/<button type="button" class="outdoor-activity-card/g) || []).length, 0);
    assert.equal((none.match(/Coming soon/g) || []).length, 9);
    assert.doesNotMatch(none, /outdoor-activity-card-link/, 'no guide links while nothing is live');
    // Make hiking live (3 members) -> only Hiking is a toggle (+ guide link to the existing activity page).
    const a = mk('Showcase A', 'kelowna', 'showcase-a'), b = mk('Showcase B', 'vernon', 'showcase-b'), c = mk('Showcase C', 'apex', 'showcase-c');
    add('activity_hiking', a); add('activity_hiking', b); add('activity_hiking', c);
    const html = app.renderOutdoorActivityShowcaseHtml();
    assert.match(html, /<h2 class="category-subsection-heading" id="outdoorActivitiesHeading">Choose Activity\(s\)<\/h2>/);
    assert.match(html, /<div class="outdoor-activity-card-grid" role="group" aria-label="Choose activities" data-filter="activity">/);
    assert.match(html, /<button type="button" class="outdoor-activity-card outdoor-activity-card-hiking outdoor-activity-toggle" data-activity="hiking" aria-pressed="false" aria-label="Hiking &amp; Trails"><span class="outdoor-activity-card-check" aria-hidden="true">&#10003; Selected<\/span>[\s\S]*?Hiking &amp; Trails<\/span>\s*<span class="outdoor-activity-card-count"><span class="outdoor-activity-count">3<\/span> <span class="outdoor-activity-count-noun">destinations<\/span><\/span>/);
    assert.match(html, /<a class="outdoor-activity-card-link" href="\/outdoors\/hiking" aria-label="Hiking &amp; Trails guide">Guide &rarr;<\/a>/);
    assert.equal((html.match(/<button type="button" class="outdoor-activity-card/g) || []).length, 1, 'only the live activity is a toggle');
    assert.equal((html.match(/outdoor-activity-card-link/g) || []).length, 1, 'only the live activity has a guide link');
    assert.match(html, /<div class="outdoor-activity-card outdoor-activity-card-fishing outdoor-activity-card-pending" aria-disabled="true">[\s\S]*?Fishing<\/span>\s*<span class="outdoor-activity-card-soon">Coming soon<\/span>/, 'Fishing exists in the data model but has no members in the fixture, so it is a Coming soon tile');
    assert.match(html, /<div class="outdoor-activity-card outdoor-activity-card-water outdoor-activity-card-pending" aria-disabled="true">/, 'an existing activity below the gate is a Coming soon tile too');
    assert.doesNotMatch(html, /href="\/outdoors\/(fishing|water|camping)"|data-activity="(fishing|water|camping)"/, 'no dead links or controls for below-gate activities');
    assert.doesNotMatch(html, /<details|View All Outdoor Activities|outdoor-activity-card-secondary|boating|climbing/, 'no reveal, no secondary grid, no non-data-model cards');
    // Order: the nine cards in one grid in the approved order.
    assert.deepEqual([...html.matchAll(/outdoor-activity-card outdoor-activity-card-([a-z]+)/g)].map((m) => m[1]), cards.map((c) => c.key));
    // Pressed + contextual count from the server-applied URL state.
    const pressed = app.renderOutdoorActivityShowcaseHtml({ selectedActivities: ['hiking'], counts: { activities: { hiking: 2 } } });
    assert.match(pressed, /data-activity="hiking" aria-pressed="true"/);
    assert.match(pressed, /<span class="outdoor-activity-count">2<\/span> <span class="outdoor-activity-count-noun">destinations<\/span>/);
    assert.match(pressed, /<span class="outdoor-step-status" id="outdoorActivityStatus">1 selected<\/span>/);
    assert.match(html, /<span class="outdoor-step-status" id="outdoorActivityStatus" hidden><\/span>/);
    assert.match(app.renderOutdoorActivityShowcaseHtml({ counts: { activities: { hiking: 1 } } }), /<span class="outdoor-activity-count">1<\/span> <span class="outdoor-activity-count-noun">destination<\/span>/, 'singular noun');
    // Images only when the asset exists; otherwise no <img> (navy fallback), never a broken src.
    for (const cd of app.OUTDOOR_ACTIVITY_CARDS) {
      const p = app.outdoorActivityImagePath(cd.key);
      if (p) assert.match(html, new RegExp(`<img class="outdoor-activity-card-img" src="${p.replace(/\//g, '\\/')}" width="1376" height="768" alt="" loading="lazy">`));
      else assert.doesNotMatch(html, new RegExp(`/images/outdoors/${cd.key}\\.webp`));
    }
    // All nine cards carry approved art (nature / viewpoints / camping added 2026-09-22), 1376x768 WebP under public/images/outdoors.
    for (const k of ['hiking', 'cycling', 'water', 'adventure', 'fishing', 'winter', 'nature', 'viewpoints', 'camping']) assert.equal(app.outdoorActivityImagePath(k), `/images/outdoors/${k}.webp`, `approved image wired for ${k}`);
    assert.equal(app.outdoorActivityImagePath('boating'), null, 'a key with no file gets no <img>');
    // Placement on the landing: intro -> Choose Region(s) -> Choose Activity(s) -> Show all results -> Results; region filter markup unchanged.
    const landing = outdoorMarkupOnly(app.renderCategoryAllRegionsPage('outdoor', app.getVenuesByCategory('outdoor')));
    const iIntro = landing.indexOf('<p class="outdoor-intro">'), iRegion = landing.indexOf('Choose Region(s)</h2>'), iShow = landing.indexOf('outdoor-activity-showcase'), iBtn = landing.indexOf('id="outdoorShowResults"'), iRes = landing.indexOf('id="outdoorResultsTop">Results</h2>');
    assert.ok(iIntro > 0 && iRegion > iIntro && iShow > iRegion && iBtn > iShow && iRes > iBtn, 'intro -> Choose Region(s) -> Choose Activity(s) -> Show all results -> Results');
    assert.equal((landing.match(/Choose Activity\(s\)<\/h2>/g) || []).length, 1, 'one Choose Activity(s) section');
    assert.match(landing, /<button type="button" class="outdoor-filter-chip" data-region="kelowna" aria-pressed="false">Kelowna<span class="outdoor-activity-count">\d+<\/span>/, 'region chip and label untouched');
    // Activity pages and region pages do not carry the activity cards.
    // (markup only -- the shared outdoor <style> block legitimately carries the card class names on every outdoor page)
    assert.doesNotMatch(outdoorMarkupOnly(app.renderOutdoorActivityPage(app.OUTDOOR_ACTIVITY_BY_SLUG.hiking, app.getOutdoorActivityVenues(app.OUTDOOR_ACTIVITY_BY_SLUG.hiking))), /outdoor-activity-showcase|outdoor-activity-toggle/);
    assert.doesNotMatch(outdoorMarkupOnly(app.renderCategoryPage('kelowna', 'outdoor', app.getVenuesByRegionCategory('kelowna', 'outdoor'), [])), /outdoor-activity-showcase|outdoor-activity-toggle/);
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
});

// ==== Outdoors explorer (2026-09-22): Choose Region(s) + Choose Activity(s) -> Results ==

test('Outdoors explorer: no filter = every destination; one/many regions (OR); one/many activities (OR); region AND activity; clear = everything; counts, statuses, tags, Clear all, compact cards; homepage/golf/beaches untouched (fixture-only, cleaned up)', () => {
  const meta = { reason: 'test', batch_id: 'outdoors-explorer-test', reviewed_by: null };
  const ids = []; const added = [];
  const mk = (name, region, slug) => { const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} is a fixture outdoor destination with a description long enough to be clamped by the landing card, used only by the automated test suite.`, address: null, latitude: null, longitude: null, hours: null, slug }); ids.push(Number(info.lastInsertRowid)); return Number(info.lastInsertRowid); };
  const add = (kind, id) => { const r = app.guardedCollectionMembershipUpdate(kind, id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push([kind, id]); };
  const homeBefore = fs.readFileSync(path.join(__dirname, '..', 'okanagan.html'), 'utf8');
  const golfBefore = app.renderCategoryAllRegionsPage('golf', app.getVenuesByCategory('golf'));
  const beachBefore = app.renderCategoryAllRegionsPage('beach', app.getVenuesByCategory('beach'));
  try {
    const kelA = mk('Explorer Kelowna Trail', 'kelowna', 'explorer-kelowna-trail');
    const kelB = mk('Explorer Kelowna Campground', 'kelowna', 'explorer-kelowna-campground');
    const penA = mk('Explorer Penticton Bluffs', 'penticton', 'explorer-penticton-bluffs');
    const verA = mk('Explorer Vernon Falls', 'vernon', 'explorer-vernon-falls');
    const osoA = mk('Explorer Osoyoos Desert', 'osoyoos', 'explorer-osoyoos-desert');
    // hiking: kelA, penA, verA, osoA (live); camping: kelB, penA, verA (live); nature: osoA (below gate)
    for (const id of [kelA, penA, verA, osoA]) add('activity_hiking', id);
    for (const id of [kelB, penA, verA]) add('activity_camping', id);
    add('activity_nature', osoA);
    const all = app.getVenuesByCategory('outdoor');
    const map = app.getOutdoorActivitySlugsByVenue(all);
    const byId = (list) => list.map((v) => v.id).sort((x, y) => x - y);
    const visible = (html) => [...outdoorMarkupOnly(html).matchAll(/<li class="venue-card" data-venue-id="(\d+)"(?![^>]* hidden)[^>]*>/g)].map((m) => Number(m[1])).sort((x, y) => x - y);
    const summary = (html) => outdoorMarkupOnly(html).match(/id="outdoorResultsSummary" aria-live="polite">([^<]*)<\/p>/)[1];

    // 1. No filters -> every current outdoor destination, plain count, nothing pressed, statuses hidden, Clear all hidden.
    const plain = app.renderCategoryAllRegionsPage('outdoor', all);
    assert.deepEqual(visible(plain), byId(all));
    assert.equal(summary(plain), `${all.length} outdoor destinations`);
    const pm = outdoorMarkupOnly(plain);
    assert.doesNotMatch(pm, /aria-pressed="true"/);
    assert.match(pm, /id="outdoorRegionStatus" hidden>/); assert.match(pm, /id="outdoorActivityStatus" hidden>/);
    assert.match(pm, /id="outdoorClearFilters" hidden>Clear all</); assert.match(pm, /id="outdoorSelected" hidden><\/div>/);
    // Nine activity cards in a single grid; live ones toggles (hiking, camping), the rest Coming soon.
    assert.equal((pm.match(/outdoor-activity-card outdoor-activity-card-[a-z]+/g) || []).length, 9);
    assert.deepEqual([...pm.matchAll(/data-activity="([a-z]+)" aria-pressed="false"/g)].map((m) => m[1]), ['hiking', 'camping']);
    assert.match(pm, /data-activity="hiking"[^>]*>[\s\S]*?<span class="outdoor-activity-count">4<\/span>/); assert.match(pm, /data-activity="camping"[^>]*>[\s\S]*?<span class="outdoor-activity-count">3<\/span>/);

    // 2. One region.
    const kel = app.renderCategoryAllRegionsPage('outdoor', all, { regions: ['kelowna'], activities: [] });
    const kelExpected = all.filter((v) => v.region === 'kelowna');
    assert.deepEqual(visible(kel), byId(kelExpected));
    assert.equal(summary(kel), `${kelExpected.length} of ${all.length} outdoor destinations`);
    const km = outdoorMarkupOnly(kel);
    assert.match(km, /data-region="kelowna" aria-pressed="true"/); assert.match(km, /id="outdoorRegionStatus">1 selected</); assert.match(km, /id="outdoorActivityStatus" hidden>/);
    assert.match(km, /<div class="outdoor-selected-row"><span class="outdoor-selected-label">Regions<\/span> <button type="button" class="outdoor-selected-tag" data-remove-region="kelowna"/);
    assert.doesNotMatch(km, /outdoor-selected-label">Activities/);
    assert.match(km, /id="outdoorClearFilters">Clear all</); assert.match(km, /id="outdoorSelectedClear">Clear all</);
    // Activity card counts are contextual to the region selection: hiking in Kelowna = kelA (1), camping in Kelowna = kelB (1).
    assert.match(km, /data-activity="hiking"[^>]*>[\s\S]*?<span class="outdoor-activity-count">1<\/span> <span class="outdoor-activity-count-noun">destination<\/span>/);
    assert.match(km, /data-activity="camping"[^>]*>[\s\S]*?<span class="outdoor-activity-count">1<\/span> <span class="outdoor-activity-count-noun">destination<\/span>/);

    // 3. Multiple regions = OR.
    const kp = app.renderCategoryAllRegionsPage('outdoor', all, { regions: ['kelowna', 'penticton'], activities: [] });
    const kpExpected = all.filter((v) => v.region === 'kelowna' || v.region === 'penticton');
    assert.deepEqual(visible(kp), byId(kpExpected));
    assert.equal(summary(kp), `${kpExpected.length} of ${all.length} outdoor destinations`);
    assert.match(outdoorMarkupOnly(kp), /id="outdoorRegionStatus">2 selected</);
    assert.deepEqual(app.filterOutdoorVenues(all, ['kelowna', 'penticton'], [], map).map((v) => v.id).sort((x, y) => x - y), byId(kpExpected));

    // 4. One activity.
    const camp = app.renderCategoryAllRegionsPage('outdoor', all, { regions: [], activities: ['camping'] });
    assert.deepEqual(visible(camp), [kelB, penA, verA].sort((x, y) => x - y));
    assert.equal(summary(camp), `3 of ${all.length} outdoor destinations`);
    const cm = outdoorMarkupOnly(camp);
    assert.match(cm, /data-activity="camping" aria-pressed="true"/); assert.match(cm, /data-activity="hiking" aria-pressed="false"/);
    assert.match(cm, /id="outdoorActivityStatus">1 selected</); assert.match(cm, /id="outdoorRegionStatus" hidden>/);
    assert.match(cm, /<div class="outdoor-selected-row"><span class="outdoor-selected-label">Activities<\/span> <button type="button" class="outdoor-selected-tag" data-remove-activity="camping" aria-label="Remove Camping">Camping<span/);
    assert.doesNotMatch(cm, /outdoor-selected-label">Regions/);
    // Region pill counts are contextual to the activity selection: Kelowna camping = 1, Osoyoos camping = 0.
    assert.match(cm, /data-region="kelowna" aria-pressed="false">Kelowna<span class="outdoor-activity-count">1<\/span>/);
    assert.match(cm, /data-region="osoyoos" aria-pressed="false">Osoyoos<span class="outdoor-activity-count">0<\/span>/);

    // 5. Multiple activities = OR.
    const hc = app.renderCategoryAllRegionsPage('outdoor', all, { regions: [], activities: ['hiking', 'camping'] });
    assert.deepEqual(visible(hc), [kelA, kelB, penA, verA, osoA].sort((x, y) => x - y));
    assert.equal(summary(hc), `5 of ${all.length} outdoor destinations`);
    assert.match(outdoorMarkupOnly(hc), /id="outdoorActivityStatus">2 selected</);

    // 6. Regions AND activities: (Kelowna OR Penticton) AND (Hiking OR Camping).
    const both = app.renderCategoryAllRegionsPage('outdoor', all, { regions: ['kelowna', 'penticton'], activities: ['hiking', 'camping'] });
    assert.deepEqual(visible(both), [kelA, kelB, penA].sort((x, y) => x - y), 'verA (Vernon) and osoA (Osoyoos) are outside the region group; kelB has camping only, kelA hiking only, penA both -- each listed once');
    assert.equal(summary(both), `3 of ${all.length} outdoor destinations`);
    const bm = outdoorMarkupOnly(both);
    assert.match(bm, /id="outdoorShowResults">Show 3 results</);
    assert.match(bm, /<div class="outdoor-selected" id="outdoorSelected"><div class="outdoor-selected-row"><span class="outdoor-selected-label">Regions<\/span> [\s\S]*?data-remove-region="kelowna"[\s\S]*?data-remove-region="penticton"[\s\S]*?<\/div><div class="outdoor-selected-row"><span class="outdoor-selected-label">Activities<\/span> [\s\S]*?data-remove-activity="hiking"[\s\S]*?data-remove-activity="camping"[\s\S]*?<\/div><button type="button" class="outdoor-selected-clear" id="outdoorSelectedClear">Clear all<\/button><\/div>/);
    // Contextual counts in the combined state: Kelowna = Kelowna venues with hiking OR camping (kelA, kelB) = 2; hiking = hiking venues in Kelowna OR Penticton (kelA, penA) = 2.
    assert.match(bm, /data-region="kelowna" aria-pressed="true">Kelowna<span class="outdoor-activity-count">2<\/span>/);
    assert.match(bm, /data-activity="hiking" aria-pressed="true"[^>]*>[\s\S]*?<span class="outdoor-activity-count">2<\/span>/);
    // Same result from the shipped client predicate.
    const clientMatches = new Function(`${app.OUTDOOR_FILTER_CLIENT_PREDICATE_SRC}; return matches;`)();
    assert.deepEqual(all.filter((v) => clientMatches(['kelowna', 'penticton'], ['hiking', 'camping'], v.region, map.get(v.id) || [])).map((v) => v.id).sort((x, y) => x - y), [kelA, kelB, penA].sort((x, y) => x - y));

    // 7. Clear all -> back to the unfiltered landing (server: the empty filter; client: clearAll() re-applies with nothing pressed).
    assert.equal(app.renderCategoryAllRegionsPage('outdoor', all, { regions: [], activities: [] }), plain);
    const script = app.renderOutdoorFilterScriptHtml();
    assert.ok(script.includes("function clearAll(){ chips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); apply('push'); }"));
    assert.ok(script.includes("querySelectorAll('.outdoor-filter-chip, .outdoor-activity-toggle')"), 'the activity cards are driven by the same toggle script as the region pills');
    for (const needle of ['outdoorRegionStatus', 'outdoorActivityStatus', 'updateStepStatus', 'outdoor-activity-count-noun', "row('Regions'", "row('Activities'", 'pushState', 'popstate', 'readUrlIntoChips']) assert.ok(script.includes(needle), `script contains ${needle}`);

    // 8. Existing activity links/pages: the Guide link points at the real page, and the page renders.
    assert.match(pm, /<a class="outdoor-activity-card-link" href="\/outdoors\/camping" aria-label="Camping guide">Guide &rarr;<\/a>/);
    const campingPage = app.renderOutdoorActivityPage(app.OUTDOOR_ACTIVITY_BY_SLUG.camping, app.getOutdoorActivityVenues(app.OUTDOOR_ACTIVITY_BY_SLUG.camping));
    assert.match(campingPage, /<h1>Camping in the Okanagan<\/h1>/); assert.match(campingPage, /Explorer Penticton Bluffs/);
    assert.deepEqual(app.listLiveOutdoorActivities().map((a) => a.slug).sort(), ['camping', 'hiking']);

    // 10. Favorite / Add to trip, View details, region line and description survive on every landing card; no phone/website on list cards; compact clamp shipped.
    assert.match(pm, new RegExp(`<li class="venue-card" data-venue-id="${kelA}" data-venue-region="kelowna" data-venue-category="outdoor" data-venue-name="Explorer Kelowna Trail" data-surface="category_card">\\s*<h2><a class="venue-card-link" href="/kelowna/outdoors/explorer-kelowna-trail"><span class="venue-card-name">Explorer Kelowna Trail</span><span class="venue-card-cue" aria-hidden="true">View details &rarr;</span></a></h2>\\s*<p class="venue-meta">Kelowna</p>\\s*<div class="golf-desc" id="golf-desc-${kelA}"><p>Explorer Kelowna Trail is a fixture[^<]*</p></div>\\s*<button type="button" class="desc-toggle" aria-expanded="false" aria-controls="golf-desc-${kelA}" hidden>Read more &rarr;</button>[\\s\\S]*?<button type="button" class="card-action fav-btn" data-fav-name="Explorer Kelowna Trail"[\\s\\S]*?<button type="button" class="card-action trip-btn" data-trip-name="Explorer Kelowna Trail"`));
    assert.doesNotMatch(pm.slice(pm.indexOf('id="outdoorResults"')), /card-action-website|card-action-phone|tel:/);
    assert.ok(plain.includes('body.outdoor-page #outdoorResults .golf-desc.is-clamped p { -webkit-line-clamp: 3; max-height: calc(3 * 1.45em); }'), 'landing cards clamp to about three lines');
    assert.ok(!app.renderOutdoorActivityPage(app.OUTDOOR_ACTIVITY_BY_SLUG.hiking, app.getOutdoorActivityVenues(app.OUTDOOR_ACTIVITY_BY_SLUG.hiking)).includes('id="outdoorResults"'), 'activity pages keep the four-line clamp (no #outdoorResults there)');
    assert.ok(plain.includes(app.GOLF_APP_SCRIPT_TAG || '/scripts/app.js'), 'trip tray / favourites script still loaded');

    // 11. Landing universe = activity universe (2026-09-22): a beach-type venue that belongs to a live
    // activity is listed on the landing, so the activity card count, the filtered result and the
    // /outdoors/<activity> page all agree; a beach without a live membership is not.
    assert.deepEqual(byId(app.getOutdoorLandingVenues()), byId(all), 'no beach member yet -> the landing is exactly the outdoor-type list');
    assert.doesNotMatch(plain, /Beach page theme/);
    const beach = app.findVenueBySlug('kelowna', 'beach', 'test-beach-park');
    add('activity_hiking', beach.id);
    const universe = app.getOutdoorLandingVenues();
    assert.deepEqual(byId(universe), byId([...all, beach]), 'the beach member joins the landing list');
    assert.equal(app.getOutdoorActivityCounts().hiking, 5);
    const landing = app.renderCategoryAllRegionsPage('outdoor', universe);
    const lm = outdoorMarkupOnly(landing);
    assert.match(lm, /data-activity="hiking"[^>]*>[\s\S]*?<span class="outdoor-activity-count">5<\/span>/, 'the Hiking card shows the activity count (same number as /outdoors/hiking)');
    assert.equal(app.getOutdoorActivityVenues(app.OUTDOOR_ACTIVITY_BY_SLUG.hiking).length, 5);
    assert.equal(summary(landing), `${all.length + 1} outdoor destinations`);
    assert.match(lm, new RegExp(`<li class="venue-card" data-venue-id="${beach.id}" data-venue-region="kelowna" data-venue-category="beach" data-venue-name="Test Beach Park"`));
    assert.match(lm, /href="\/kelowna\/beaches\/test-beach-park"/, 'the beach card links to its own beach page');
    assert.match(landing, /Beach page theme/, 'beach card rules are loaded only now that a beach card is present');
    const hikingOnly = app.renderCategoryAllRegionsPage('outdoor', universe, { regions: [], activities: ['hiking'] });
    assert.deepEqual(visible(hikingOnly), [kelA, penA, verA, osoA, beach.id].sort((x, y) => x - y), 'selecting Hiking shows the 5 the card promised');
    assert.equal(summary(hikingOnly), `5 of ${all.length + 1} outdoor destinations`);
    // The card engagement script (clamp / Read more, impressions, favourite + trip mirroring) covers every allowlisted card type on outdoor surfaces; Golf/Beach pages keep their own selector.
    assert.ok(landing.includes(`querySelectorAll('.venue-card:is([data-venue-category="outdoor"],[data-venue-category="beach"])')`));
    assert.ok(landing.includes(`var HOLDER = ':is([data-venue-category="outdoor"],[data-venue-category="beach"])';`));
    assert.ok(landing.includes("venue_category: card.dataset.venueCategory || 'outdoor'"));
    assert.ok(golfBefore.includes(`querySelectorAll('.venue-card[data-venue-category="golf"]')`) && golfBefore.includes(`var HOLDER = '[data-venue-category="golf"]';`));
    assert.ok(beachBefore.includes(`var HOLDER = '[data-venue-category="beach"]';`));
    // Region outdoor directories are untouched by the landing universe.
    assert.doesNotMatch(outdoorMarkupOnly(app.renderCategoryPage('kelowna', 'outdoor', app.getVenuesByRegionCategory('kelowna', 'outdoor'), [])), /Test Beach Park/);

    // 9. Golf, Beaches and the homepage do not change while the explorer state exists.
    assert.equal(app.renderCategoryAllRegionsPage('golf', app.getVenuesByCategory('golf')), golfBefore);
    assert.equal(app.renderCategoryAllRegionsPage('beach', app.getVenuesByCategory('beach')), beachBefore);
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'okanagan.html'), 'utf8'), homeBefore, 'the homepage file is never touched by rendering the explorer');
    assert.doesNotMatch(app.renderHomeFooterHTML(true), /outdoor-activity-toggle|outdoorRegionStatus|Choose Activity/, 'the shared footer carries none of the explorer markup');
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
  assert.deepEqual(app.listLiveOutdoorActivities(), []);
});

// ==== I.3 (2026-09-20): finalized Outdoor activity order and labels ========

test('I.3: finalized activity display order and labels; slugs unchanged; Camping/Water stay defined but not live', () => {
  assert.deepEqual(app.OUTDOOR_ACTIVITY_DISPLAY_ORDER.slice(0, 6), ['hiking', 'viewpoints', 'nature', 'cycling', 'winter', 'adventure']);
  const sorted = app.sortOutdoorActivitiesForDisplay(app.OUTDOOR_ACTIVITIES);
  assert.deepEqual(sorted.slice(0, 6).map((a) => a.label), ['Hiking & Trails', 'Viewpoints', 'Nature & Wildlife', 'Cycling & Biking', 'Winter', 'Adventure']);
  assert.deepEqual(sorted.slice(0, 6).map((a) => a.slug), ['hiking', 'viewpoints', 'nature', 'cycling', 'winter', 'adventure']);
  assert.deepEqual(sorted.slice(6).map((a) => a.slug), ['fishing', 'camping', 'water'], 'Fishing (2026-09-21), Camping and Water remain defined, after the six');
  for (const slug of ['hiking', 'viewpoints', 'nature', 'cycling', 'winter', 'adventure', 'fishing', 'camping', 'water']) assert.ok(app.OUTDOOR_ACTIVITY_BY_SLUG[slug], `slug ${slug} unchanged`);
  assert.equal(app.OUTDOOR_ACTIVITIES.length, 9, 'Fishing is the only category added since I.3');
});

test('I.3: the landing filter chips and the activity-page chips present the six live activities in the finalized order (counts on the landing only); Camping/Water not offered; filtering untouched (fixture-only, cleaned up)', () => {
  const meta = { reason: 'test', batch_id: 'outdoors-i3-test', reviewed_by: null };
  const ids = []; const added = [];
  const mk = (name, region, slug) => { const info = insert.run({ name, region, type: 'outdoor', cuisine: null, phone: null, price: null, reviews: null, rating: null, description: `${name} fixture.`, address: null, latitude: null, longitude: null, hours: null, slug }); const id = Number(info.lastInsertRowid); ids.push(id); return id; };
  const add = (kind, id) => { const r = app.guardedCollectionMembershipUpdate(kind, id, 'add', null, meta); assert.equal(r.ok, true, JSON.stringify(r)); added.push([kind, id]); };
  try {
    // Three fixtures in every one of the six activities (in a deliberately scrambled definition order), none in camping/water.
    const a = mk('Order Fixture A', 'kelowna', 'order-fixture-a'), b = mk('Order Fixture B', 'vernon', 'order-fixture-b'), c = mk('Order Fixture C', 'penticton', 'order-fixture-c');
    for (const kind of ['activity_adventure', 'activity_winter', 'activity_cycling', 'activity_nature', 'activity_viewpoints', 'activity_hiking']) for (const id of [a, b, c]) add(kind, id);
    const expectedLabels = ['Hiking & Trails', 'Viewpoints', 'Nature & Wildlife', 'Cycling & Biking', 'Winter', 'Adventure'];
    const expectedSlugs = ['hiking', 'viewpoints', 'nature', 'cycling', 'winter', 'adventure'];
    // Landing chips (multi-select buttons with counts), in order.
    const chips = app.renderOutdoorActivityFilterChips();
    assert.deepEqual([...chips.matchAll(/data-activity="([a-z]+)"/g)].map((m) => m[1]), expectedSlugs);
    assert.deepEqual([...chips.matchAll(/aria-pressed="false">([^<]+)<span class="outdoor-activity-count">(\d+)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, '&')), expectedLabels);
    assert.ok(!chips.includes('data-activity="camping"') && !chips.includes('data-activity="water"'));
    // Activity-page selector (links + active pill), same order, no counts.
    const nav = app.renderOutdoorActivitySelector('nature');
    const navSlugs = [...nav.matchAll(/href="\/outdoors\/([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(navSlugs, ['hiking', 'viewpoints', 'cycling', 'winter', 'adventure'], 'links in order with the active one (nature) rendered as the static pill in its slot');
    assert.match(nav, /Viewpoints<\/a>\s*<span class="category-region-selector-active">Nature &amp; Wildlife<\/span>\s*<a href="\/outdoors\/cycling">/);
    assert.doesNotMatch(nav, /outdoor-activity-count/, 'no counts on activity pages');
    // Full pages: landing keeps the multi-select experience; activity page keeps its layout.
    const all = app.getVenuesByCategory('outdoor');
    const landing = app.renderCategoryAllRegionsPage('outdoor', all);
    const lm = outdoorMarkupOnly(landing);
    assert.deepEqual([...app.renderOutdoorActivityFilterChips().matchAll(/data-activity="([a-z]+)"/g)].map((m) => m[1]), expectedSlugs, 'chip renderer keeps the display order (no longer placed on the landing)');
    assert.deepEqual([...lm.match(/<div class="outdoor-activity-card-grid"[\s\S]*?<\/section>/)[0].matchAll(/data-activity="([a-z]+)"/g)].map((m) => m[1]), ['hiking', 'cycling', 'adventure', 'winter', 'nature', 'viewpoints'], 'only live activities are toggles, in the approved card order');
    assert.deepEqual([...lm.match(/<div class="outdoor-activity-card-grid"[\s\S]*?<\/section>/)[0].matchAll(/class="outdoor-activity-card-link" href="\/outdoors\/([a-z]+)"/g)].map((m) => m[1]), ['hiking', 'cycling', 'adventure', 'winter', 'nature', 'viewpoints'], 'guide links only for live activities');
    assert.ok(lm.indexOf('Choose Region(s)</h2>') < lm.indexOf('Choose Activity(s)</h2>') && lm.indexOf('Choose Activity(s)</h2>') < lm.indexOf('id="outdoorShowResults"') && lm.indexOf('id="outdoorShowResults"') < lm.indexOf('Results</h2>'));
    assert.match(lm, /<button type="button" class="outdoor-filter-chip" data-region="kelowna" aria-pressed="false">/, 'region controls are still toggle buttons');
    assert.match(landing, /replaceState|URLSearchParams/, 'URL query persistence still shipped');
    const winter = app.renderOutdoorActivityPage(app.OUTDOOR_ACTIVITY_BY_SLUG.winter, app.getOutdoorActivityVenues(app.OUTDOOR_ACTIVITY_BY_SLUG.winter));
    assert.deepEqual([...outdoorMarkupOnly(winter).match(/outdoor-activity-selector[\s\S]*?<\/nav>/)[0].matchAll(/(?:href="\/outdoors\/([a-z]+)"|category-region-selector-active">([^<]+)<)/g)].map((m) => m[1] || 'ACTIVE:' + m[2]), ['hiking', 'viewpoints', 'nature', 'cycling', 'ACTIVE:Winter', 'adventure']);
    assert.match(winter, /<h1>Winter in the Okanagan<\/h1>/); assert.match(winter, /<li class="venue-card" /);
    // Filtering semantics untouched.
    const map = app.getOutdoorActivitySlugsByVenue(all.filter((v) => ids.includes(v.id)));
    assert.equal(app.filterOutdoorVenues(all.filter((v) => ids.includes(v.id)), ['kelowna', 'vernon'], ['winter', 'adventure'], map).length, 2);
    assert.equal(app.filterOutdoorVenues(all.filter((v) => ids.includes(v.id)), ['osoyoos'], ['winter'], map).length, 0);
  } finally {
    for (const [kind, id] of added) app.guardedCollectionMembershipUpdate(kind, id, 'remove', null, meta);
    for (const id of ids) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }
});


// ==== Outdoors region selector = canonical region list (2026-09-20) ========

test('Outdoor region chips use the complete canonical region list (REGION_LABELS, in FOOTER_REGION_GROUPS order): every region present, zero-count regions show 0, counts accurate, no invented regions', () => {
  const canonical = app.canonicalOutdoorRegionOrder();
  // Source of truth: exactly the 20 routable regions, ordered by the footer/wizard grouping.
  assert.deepEqual([...canonical].sort(), Object.keys(app.REGION_LABELS).sort(), 'exactly the canonical regions, none missing, none invented');
  assert.deepEqual(canonical, app.FOOTER_REGION_GROUPS.flatMap((g) => g.regions), 'site order: Central, South, North, Ski resorts');
  assert.equal(canonical.length, 20);
  assert.deepEqual(canonical.slice(0, 4), ['kelowna', 'west-kelowna', 'peachland', 'lake-country']);
  assert.deepEqual(canonical.slice(-4), ['big-white', 'silverstar', 'apex', 'baldy']);
  const rows = app.getVenuesByCategory('outdoor');
  const chips = app.renderOutdoorRegionFilterChips(rows);
  const rendered = [...chips.matchAll(/data-region="([a-z-]+)" aria-pressed="false">([^<]+)<span class="outdoor-activity-count">(\d+)<\/span>/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(rendered.map((r) => r[0]), canonical, 'chips rendered for every canonical region in site order');
  for (const [slug, label, count] of rendered) {
    assert.equal(label, app.REGION_LABELS[slug].replace(/&/g, '&amp;'), `label for ${slug} comes from REGION_LABELS`);
    assert.equal(count, rows.filter((v) => v.region === slug).length, `count for ${slug} is the real outdoor count`);
  }
  assert.ok(rendered.some((r) => r[2] === 0), 'at least one canonical region has no outdoor fixtures and shows 0');
  assert.ok(rendered.some((r) => r[2] > 0));
  // Selecting a zero-count region yields no results; OR/AND semantics unchanged.
  const map = app.getOutdoorActivitySlugsByVenue(rows);
  const zeroRegion = rendered.find((r) => r[2] === 0)[0];
  assert.deepEqual(app.filterOutdoorVenues(rows, [zeroRegion], [], map), [], 'zero-count region -> no results (not hidden, not manufactured)');
  assert.equal(app.filterOutdoorVenues(rows, [zeroRegion, 'kelowna'], [], map).length, rows.filter((v) => v.region === 'kelowna').length, 'zero-count region contributes nothing under OR');
  assert.equal(app.filterOutdoorVenues(rows, [], [], map).length, rows.length, 'no filters = everything');
  // Full page still carries the multi-select experience.
  const landing = outdoorMarkupOnly(app.renderCategoryAllRegionsPage('outdoor', rows));
  assert.equal((landing.match(/class="outdoor-filter-chip" data-region="/g) || []).length, 20);
  assert.ok(landing.indexOf('Choose Region(s)</h2>') < landing.indexOf('Choose Activity(s)</h2>'));
  assert.match(landing, /id="outdoorClearFilters"/); assert.match(landing, /id="outdoorNoResults" hidden>/);
});


// ==== Outdoors region selector: grouped/collapsible on mobile (2026-09-20) ==

test('Grouped region selector: four FOOTER_REGION_GROUPS blocks in order, all 20 canonical chips inside, accessible toggle buttons, Central open / others closed by default, no-JS and desktop fallbacks in CSS', () => {
  const rows = app.getVenuesByCategory('outdoor');
  const html = app.renderOutdoorRegionFilterChips(rows);
  // Groups: exactly FOOTER_REGION_GROUPS, same order and membership -- no second source of truth.
  const blocks = [...html.matchAll(/<div class="outdoor-region-group-block" data-region-group="([a-z-]+)">([\s\S]*?)<\/div>\s*<\/div>/g)];
  assert.equal(blocks.length, app.FOOTER_REGION_GROUPS.length);
  assert.deepEqual(blocks.map((b) => b[1]), app.FOOTER_REGION_GROUPS.map((g) => app.outdoorRegionGroupSlug(g.label)));
  const allChips = [];
  blocks.forEach((b, i) => {
    const group = app.FOOTER_REGION_GROUPS[i];
    const chipsIn = [...b[2].matchAll(/data-region="([a-z-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(chipsIn, group.regions, `${group.label} holds exactly its FOOTER_REGION_GROUPS regions in order`);
    allChips.push(...chipsIn);
    // Header: a real <button> with aria-expanded/aria-controls, label text, "N regions" (never a venue total), hidden selection slot.
    const slug = b[1];
    assert.match(b[2], new RegExp(`<button type="button" class="outdoor-region-group-toggle" id="outdoorRegionGroup-${slug}-toggle" aria-expanded="(true|false)" aria-controls="outdoorRegionGroup-${slug}"><span class="outdoor-region-group-name">${group.label.replace(/&/g, '&amp;')}</span><span class="outdoor-region-group-meta">${group.regions.length} regions</span><span class="outdoor-region-group-selected" hidden></span>`));
    assert.match(b[2], new RegExp(`<div class="outdoor-region-group-chips" id="outdoorRegionGroup-${slug}" role="group" aria-label="${group.label.replace(/&/g, '&amp;')} regions"`));
    const expanded = /aria-expanded="true"/.test(b[2]);
    assert.equal(expanded, slug === app.OUTDOOR_REGION_GROUP_DEFAULT_OPEN, `${slug} initially ${slug === 'central' ? 'expanded' : 'collapsed'}`);
    assert.equal(/aria-label="[^"]*regions" hidden>/.test(b[2]), !expanded, `${slug} chip list hidden iff collapsed`);
  });
  assert.deepEqual(allChips, app.canonicalOutdoorRegionOrder(), 'all 20 canonical regions, canonical order, none invented');
  assert.equal(app.OUTDOOR_REGION_GROUP_DEFAULT_OPEN, 'central');
  // Chips themselves unchanged: same toggle buttons, counts (0 shown) intact.
  for (const r of app.canonicalOutdoorRegionOrder()) {
    const count = rows.filter((v) => v.region === r).length;
    assert.match(html, new RegExp(`<button type="button" class="outdoor-filter-chip" data-region="${r}" aria-pressed="false">${app.REGION_LABELS[r].replace(/&/g, '&amp;')}<span class="outdoor-activity-count">${count}</span></button>`));
  }
  assert.ok(html.includes('data-region="osoyoos" aria-pressed="false">Osoyoos<span class="outdoor-activity-count">0</span>'), 'zero-count region present and selectable');
  // CSS: desktop shows every chip without expansion (headers hidden, blocks flow), no-JS shows every chip.
  const css = app.renderOutdoorThemeStyles();
  assert.match(css, /@media \(min-width: 900px\) \{\s*body\.outdoor-page \.outdoor-region-groups \{ display: flex;[\s\S]*?\.outdoor-region-group-toggle \{ display: none !important; \}[\s\S]*?\.outdoor-region-group-chips\[hidden\] \{ display: contents; \}/);
  assert.match(css, /\.outdoor-region-groups:not\(\.js\) \.outdoor-region-group-toggle \{ display: none; \}/);
  assert.match(css, /\.outdoor-region-groups:not\(\.js\) \.outdoor-region-group-chips\[hidden\] \{ display: flex; \}/);
  assert.match(css, /\.outdoor-region-group-toggle:focus-visible \{ outline: 2px solid/);
  // Client helpers: open-on-load rule and the selection text.
  const helpers = new Function(`${app.OUTDOOR_REGION_GROUP_CLIENT_SRC}; return { groupShouldOpen, groupSelectedText };`)();
  assert.equal(helpers.groupShouldOpen(true, 0), true, 'default group opens');
  assert.equal(helpers.groupShouldOpen(false, 0), false, 'other groups closed');
  assert.equal(helpers.groupShouldOpen(false, 2), true, 'a group holding a URL-selected region opens');
  assert.equal(helpers.groupSelectedText(0), '');
  assert.equal(helpers.groupSelectedText(1), '· 1 selected');
  // The script wires the headers, updates them on every apply, and never treats a header as a filter.
  const script = app.renderOutdoorFilterScriptHtml();
  for (const needle of ['outdoor-region-group-toggle', 'aria-expanded', 'updateGroupHeaders()', "classList.add('js')", 'groupShouldOpen(isDefault, n)', "matchMedia('(max-width: 899px)')"]) assert.ok(script.includes(needle), needle);
  assert.match(script, /var chips = Array\.prototype\.slice\.call\(document\.querySelectorAll\('\.outdoor-filter-chip, \.outdoor-activity-toggle'\)\);/, 'the region chips and the activity cards are the filters; group headers are not');
});

test('Grouped region selector: filtering semantics untouched -- regions from different groups (incl. zero-count) combine with OR, AND with activities, clear resets (server predicate)', () => {
  const rows = app.getVenuesByCategory('outdoor');
  const map = app.getOutdoorActivitySlugsByVenue(rows);
  const byRegion = (r) => rows.filter((v) => v.region === r).length;
  const central = 'kelowna', south = 'penticton', north = 'vernon', zero = 'naramata';
  assert.equal(app.filterOutdoorVenues(rows, [central, south, north], [], map).length, byRegion(central) + byRegion(south) + byRegion(north), 'three groups selected together = OR');
  assert.equal(app.filterOutdoorVenues(rows, [central, zero], [], map).length, byRegion(central), 'zero-count region in a collapsed group contributes nothing');
  assert.deepEqual(app.filterOutdoorVenues(rows, [zero], [], map), [], 'zero-count region alone = no results');
  assert.equal(app.filterOutdoorVenues(rows, [], [], map).length, rows.length, 'clear = everything');
  const landing = outdoorMarkupOnly(app.renderCategoryAllRegionsPage('outdoor', rows));
  assert.ok(landing.indexOf('Choose Region(s)</h2>') < landing.indexOf('Choose Activity(s)</h2>') && landing.indexOf('Choose Activity(s)</h2>') < landing.indexOf('id="outdoorShowResults"') && landing.indexOf('id="outdoorShowResults"') < landing.indexOf('Results</h2>'), 'overall structure');
  assert.equal((landing.match(/class="outdoor-filter-chip" data-region="/g) || []).length, 20);
  assert.equal((landing.match(/class="outdoor-filter-chip" data-activity="/g) || []).length, 0, 'activities are cards, not pill chips');
  assert.match(landing, /id="outdoorClearFilters" hidden>Clear all</); assert.match(landing, /id="outdoorNoResults" hidden>/);
});

// ==== What's On page shell (2026-09-22) ====================================

test("What's On shell: twelve categories in the approved order, tiles are multi-select toggles, canonical region chips, URL parsing, empty state, header/footer/tray, noindex while empty", () => {
  assert.deepEqual(app.WHATSON_CATEGORIES.map((c) => c.label), ['Events & Festivals', 'Live Music', 'Sports & Recreation', 'Arts & Culture', 'Food & Drink Events', 'Markets & Fairs', 'Family & Kids', 'Nightlife', 'Wineries & Wine Events', 'Holiday & Seasonal Events', 'Workshops & Classes', 'Community Events']);
  assert.equal(app.WHATSON_CATEGORIES.length, 12);
  for (const c of app.WHATSON_CATEGORIES) { assert.match(c.key, /^[a-z]+(-[a-z]+)*$/); assert.equal(app.WHATSON_CATEGORY_BY_KEY[c.key], c); }
  assert.deepEqual(app.getWhatsOnEvents(), [], 'shell phase: no inventory');
  assert.deepEqual(app.WHATSON_DATE_PRESETS.map((d) => d.key), ['today', 'this-weekend', 'this-week', 'this-month', 'custom'], 'future date step declared, not rendered');
  // URL parsing follows the Outdoors convention with the group renamed.
  assert.deepEqual(app.parseWhatsOnFilterQuery({ regions: 'vernon,kelowna,nowhere', categories: 'live-music,bogus,live-music,nightlife' }), { regions: ['vernon', 'kelowna'], categories: ['live-music', 'nightlife'] });
  assert.deepEqual(app.parseWhatsOnFilterQuery({}), { regions: [], categories: [] });
  const html = app.renderWhatsOnPage(app.parseWhatsOnFilterQuery({}));
  const markup = outdoorMarkupOnly(html);
  assert.match(html, /<title>What&#39;s On in the Okanagan \| Okanagan Roam<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/okanaganroam\.com\/whats-on"/);
  // Step 6: the four Phase 1 fixture events (2099) are publishable inventory, so this render is indexable; the
  // zero-inventory noindex path is covered by the isolated-child test "S6 #1/#20/#22".
  assert.equal(app.whatsOnInventoryExists(), true);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex">/, 'inventory exists -> indexable');
  assert.match(html, /<body class="golf-page outdoor-page whatson-page">/);
  assert.equal((markup.match(/<h1[\s>]/g) || []).length, 1); assert.match(markup, /<h1>What&#39;s On in the Okanagan<\/h1>/);
  // Hierarchy: intro -> Choose Region(s) -> Choose Category(s) -> actions -> Results.
  const order = ['<p class="outdoor-intro">', 'id="whatsOnRegionsHeading">Choose Region(s)</h2>', 'data-filter="region"', 'id="whatsOnCategoriesHeading">Choose Category(s)</h2>', 'data-filter="category"', 'data-filter="date"', 'id="whatsOnShowResults"', 'id="whatsOnResultsTop">Results</h2>', 'id="whatsOnEmptyInventory"'];
  let pos = -1; for (const m of order) { const i = markup.indexOf(m); assert.ok(i > pos, `order: ${m}`); pos = i; }
  // Twelve tiles, in order, each a toggle button with the outdoor card classes (so the shared pressed-state CSS applies) and a data-category hook.
  assert.deepEqual([...markup.matchAll(/<button type="button" class="outdoor-activity-card outdoor-activity-toggle whatson-category-card whatson-category-card-([a-z-]+)[^"]*" data-category="([a-z-]+)" aria-pressed="false"/g)].map((m) => m[2]), app.WHATSON_CATEGORIES.map((c) => c.key));
  assert.equal((markup.match(/class="outdoor-activity-card-check" aria-hidden="true">✓ Selected<\/span>/g) || markup.match(/&#10003; Selected/g) || []).length, 12);
  assert.doesNotMatch(markup, /<a class="outdoor-activity-card/, 'tiles are filters, not links');
  // Region chips: the complete canonical list, grouped like Outdoors; counts (all 0 in the empty default window) are shown because inventory exists.
  for (const r of Object.keys(app.REGION_LABELS)) assert.match(markup, new RegExp(`<button type="button" class="outdoor-filter-chip" data-region="${r}" aria-pressed="false">${app.REGION_LABELS[r].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<span class="outdoor-activity-count">0</span></button>`));
  assert.equal((markup.match(/class="outdoor-filter-chip" data-region="/g) || []).length, 20);
  assert.match(markup, /data-region-group="central">[\s\S]*?aria-expanded="true"/);
  // Inventory exists but the default window (next 30 days) holds none of the 2099 fixtures: no-match state, empty-inventory copy hidden, no fake cards.
  assert.match(markup, /aria-live="polite">0 events<\/p>/);
  assert.match(markup, /<div class="whatson-empty" id="whatsOnEmptyInventory" hidden>\s*<h3>We’re gathering what’s on\.<\/h3>/);
  assert.match(markup, /<ul class="card-grid" id="whatsOnResults" hidden><\/ul>/);
  assert.doesNotMatch(markup, /<li class="venue-card"/, 'no placeholder events rendered');
  assert.match(markup, /id="whatsOnShowResults">Show all results</); assert.match(markup, /id="whatsOnClearFilters" hidden>Clear all</);
  assert.match(markup, /<p class="outdoor-no-results" id="whatsOnNoResults">/);
  // Page chrome: shared header, Trip tray, footer, app.js, analytics head; What's On script with the shared client snippets and both URL keys.
  assert.match(html, /id="tripTray"|class="trip-tray"|trip-tray/); assert.match(html, /<footer class="home-footer"/); assert.match(html, /<script src="\/scripts\/app\.js"><\/script>/);
  const script = app.renderWhatsOnFilterScriptHtml({ hasInventory: true, dateState: { when: '', from: '', to: '' } }); // the state this render carries (Step 6)
  for (const needle of [app.OUTDOOR_FILTER_CLIENT_PREDICATE_SRC, app.OUTDOOR_REGION_GROUP_CLIENT_SRC, "'.outdoor-filter-chip, .outdoor-activity-toggle'", '#whatsOnResults > .venue-card', 'regions=', 'categories=', 'pushState', 'popstate', "apply('push')", "apply('replace')", "apply('none')", 'whatsOnSelectedClear', 'data-remove-category', 'data-event-categories']) assert.ok(script.includes(needle), `script contains ${needle}`);
  assert.ok(html.includes(script));
  // Pre-filtered render from the URL: pressed chips/tiles, statuses, two tag rows, Clear all shown.
  const pre = outdoorMarkupOnly(app.renderWhatsOnPage(app.parseWhatsOnFilterQuery({ regions: 'kelowna,penticton', categories: 'live-music,food-drink-events' })));
  assert.match(pre, /data-region="kelowna" aria-pressed="true"/); assert.match(pre, /data-region="penticton" aria-pressed="true"/);
  assert.match(pre, /data-category="live-music" aria-pressed="true"/); assert.match(pre, /data-category="food-drink-events" aria-pressed="true"/); assert.match(pre, /data-category="nightlife" aria-pressed="false"/);
  assert.match(pre, /id="whatsOnRegionStatus">2 selected</); assert.match(pre, /id="whatsOnCategoryStatus">2 selected</);
  assert.match(pre, /<div class="outdoor-selected" id="whatsOnSelected"><div class="outdoor-selected-row"><span class="outdoor-selected-label">Regions<\/span> [\s\S]*?data-remove-region="kelowna"[\s\S]*?data-remove-region="penticton"[\s\S]*?<div class="outdoor-selected-row"><span class="outdoor-selected-label">Categories<\/span> [\s\S]*?data-remove-category="live-music"[\s\S]*?data-remove-category="food-drink-events"[\s\S]*?id="whatsOnSelectedClear">Clear all</);
  assert.match(pre, /aria-live="polite">0 of 0 events<\/p>/); assert.match(pre, /id="whatsOnClearFilters">Clear all</); assert.match(pre, /id="whatsOnShowResults">Show 0 results</);
  // Tile art: dedicated slot per category, one approved 1376x768 WebP per key under /images/whats-on/.
  for (const c of app.WHATSON_CATEGORIES) assert.equal(app.whatsOnCategoryImagePath(c.key), `/images/whats-on/${c.key}.webp`, `art for ${c.key}`);
  assert.deepEqual([...markup.matchAll(/<img class="outdoor-activity-card-img" src="\/images\/whats-on\/([a-z-]+)\.webp" width="1376" height="768" alt="" loading="lazy">/g)].map((m) => m[1]), app.WHATSON_CATEGORIES.map((c) => c.key), 'twelve tile images in the approved order');
  assert.doesNotMatch(markup, /whatson-category-card-noart/, 'no tile falls back to the no-art state');
});

test("What's On result card contract (fixture only): name is the single link with the View details cue, region + date/time meta, clamped description, category chips, Favorite + Add to Trip; no website/phone; filter semantics reuse the Outdoors predicate", () => {
  const ev = { id: 7, name: 'Fixture Lakeside Concert', slug: 'fixture-lakeside-concert', region: 'kelowna', categories: ['live-music', 'food-drink-events'], dateLabel: 'Sat, 18 Jul 2026', time: '7:00 pm', description: 'A fixture event used only by the automated test suite.', image: '/images/whats-on/live-music.webp', website: 'https://example.com', phone: '250-000-0000' };
  const card = app.whatsOnEventCardHtml(ev);
  assert.match(card, /<li class="venue-card whatson-event-card" data-venue-id="event-7" data-venue-region="kelowna" data-venue-category="whatson" data-venue-name="Fixture Lakeside Concert" data-event-region="kelowna" data-event-categories="live-music,food-drink-events" data-surface="whatson_card">/);
  assert.match(card, /<h2><a class="venue-card-link" href="\/kelowna\/events\/fixture-lakeside-concert"><span class="venue-card-name">Fixture Lakeside Concert<\/span><span class="venue-card-cue" aria-hidden="true">View details &rarr;<\/span><\/a><\/h2>/);
  assert.equal((card.match(/<a /g) || []).length, 1, 'the name is the only link');
  assert.match(card, /<p class="venue-meta">Kelowna &middot; Sat, 18 Jul 2026 · 7:00 pm<\/p>/);
  assert.match(card, /<div class="golf-desc" id="golf-desc-event-7"><p>A fixture event/); assert.match(card, /class="desc-toggle" aria-expanded="false" aria-controls="golf-desc-event-7" hidden>Read more/);
  assert.match(card, /<span class="badge-chip whatson-category-chip">Live Music<\/span> <span class="badge-chip whatson-category-chip">Food &amp; Drink Events<\/span>/);
  assert.match(card, /class="card-action fav-btn" data-fav-name="Fixture Lakeside Concert"/); assert.match(card, /class="card-action trip-btn" data-trip-name="Fixture Lakeside Concert" data-trip-query="Fixture Lakeside Concert, Kelowna, Okanagan Valley, BC" data-trip-region="kelowna"/);
  assert.match(card, /<img class="whatson-event-img" src="\/images\/whats-on\/live-music\.webp"/);
  assert.doesNotMatch(card, /example\.com|250-000-0000|Visit Website|tel:/, 'website/phone stay off the listing card');
  // Filtering: regions OR, categories OR, groups AND (the shared Outdoors predicate).
  const evs = [ev, { ...ev, id: 8, region: 'vernon', categories: ['nightlife'] }, { ...ev, id: 9, region: 'penticton', categories: ['live-music'] }];
  assert.deepEqual(app.filterWhatsOnEvents(evs, [], []).map((e) => e.id), [7, 8, 9]);
  assert.deepEqual(app.filterWhatsOnEvents(evs, ['kelowna', 'vernon'], []).map((e) => e.id), [7, 8]);
  assert.deepEqual(app.filterWhatsOnEvents(evs, [], ['live-music', 'nightlife']).map((e) => e.id), [7, 8, 9]);
  assert.deepEqual(app.filterWhatsOnEvents(evs, ['kelowna', 'penticton'], ['live-music']).map((e) => e.id), [7, 9]);
  assert.deepEqual(app.filterWhatsOnEvents(evs, ['vernon'], ['live-music']), []);
  assert.equal(app.whatsOnSummaryText(3, 3, false), '3 events'); assert.equal(app.whatsOnSummaryText(1, 3, true), '1 of 3 events'); assert.equal(app.whatsOnSummaryText(1, 1, false), '1 event');
  // The card rules for the What's On card attribute are derived from the Golf rules, page-scoped.
  const css = app.renderWhatsOnStyles();
  assert.match(css, /\.venue-card\[data-venue-category="whatson"\] \.card-action/); assert.match(css, /body\.whatson-page \.whatson-category-grid \{ grid-template-columns: repeat\(4, 1fr\)/);
  assert.doesNotMatch(css, /\[data-venue-category="golf"\]|\[data-venue-category="beach"\]|\[data-venue-category="outdoor"\]/, 'no golf/beach/outdoor selectors emitted by the What\'s On styles');
});
