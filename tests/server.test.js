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
  const genStart = src.indexOf('function generateTrip(paramsOverride)');
  assert.ok(genStart !== -1, 'expected generateTrip(paramsOverride) to still exist with its original signature');
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
  assert.match(src, /regenerateBtn\.addEventListener\('click', function\(\)\{ generateTrip\(lastGeneratedParams \|\| undefined\); \}\);/, 'Regenerate must pass the stored params (or undefined, to preserve the original validation) instead of always calling generateTrip() with no argument');
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
  // 'type.' + venue.type -- the seven real venue types (matches CATEGORY_SLUGS).
  const typeKeys = Object.keys(app.CATEGORY_SLUGS).map((t) => `type.${t}`);

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

test('Mood cards: What\'s On links to /events with no filter', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-whats-on" href="\/events">/);
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

test('Mood cards: Outdoors links to #exploreRegions with no filter', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-outdoors" href="#exploreRegions">/);
});

test('Mood cards: Beaches links to #exploreRegions with no filter and no new venue type', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-beaches" href="#exploreRegions">/);
  assert.doesNotMatch(html, /data-type="beach"/, 'must not invent a new beach venue type');
});

test('Mood cards: Hidden Gems is no longer one of the six mood cards', () => {
  const html = app.renderMoodCardsHTML();
  assert.doesNotMatch(html, /mood-card-hidden-gems/, 'Hidden Gems must not render as a mood card in this pass');
});

test('Mood cards: Golf still uses the existing dynamic bestRegionForType mechanism with a /browse fallback', () => {
  const html = app.renderMoodCardsHTML();
  const golfMatch = html.match(/class="mood-card mood-card-golf" href="([^"]*)"/);
  assert.ok(golfMatch, 'expected the Golf card to have an href');
  assert.ok(
    golfMatch[1] === '/browse' || /^\/[a-z-]+\/golf$/.test(golfMatch[1]),
    `Golf href must be either the /browse fallback (no golf venues exist) or a real /:region/golf category page, got: ${golfMatch[1]}`
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
  assert.ok(items[3].href === '/browse' || /^\/[a-z-]+\/golf$/.test(items[3].href), `Golf href unexpected: ${items[3].href}`);
  assert.equal(items[4].href, '/events');
  assert.equal(items[5].href, '#exploreRegions');
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

test('Home footer: Regions is grouped into exactly Central/South/North/Ski resorts, matching the wizard\'s own grouping', () => {
  const html = app.renderHomeFooterHTML();
  const groupLabels = Array.from(html.matchAll(/<h5 data-i18n="(wizard\.[a-zA-Z]+)">([^<]*)<\/h5>/g)).map((m) => m[2]);
  assert.deepEqual(groupLabels, ['Central', 'South', 'North', 'Ski resorts']);
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

test('renderCategoryPage renders the golf category with the correct URL and label', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'golf');
  assert.equal(rows.length, 1);
  const html = app.renderCategoryPage('kelowna', 'golf', rows, []);
  assert.match(html, /Golf Courses in Kelowna, BC/);
  assert.match(html, /Test Golf Course/);
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
  assert.match(await golfCategoryPage.text(), /Test Golf Course/);

  const golfVenuePage = await fetch(`${base}/kelowna/golf/test-golf-course`);
  assert.equal(golfVenuePage.status, 200, 'golf venue route must resolve');
  assert.match(await golfVenuePage.text(), /<h1>Test Golf Course<\/h1>/);

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
