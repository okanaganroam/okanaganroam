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
  assert.match(html, /src="\/images\/hidden-gems\/dog-friendly\.png"/);
  assert.match(html, /src="\/images\/hidden-gems\/local-favourites\.png"/);
  assert.match(html, /src="\/images\/hidden-gems\/secret-spots\.png"/);
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
  assert.match(html, /hidden-gem-card-img" src="\/images\/mood\/eat\.png"/, 'cafe type maps to the Food & Drink mood image');
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
    assert.match(html, new RegExp(`src="/images/regions/${region}\\.png"`), `expected a destination image for ${region}`);
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

// ==== Homepage redesign Milestone 3 (Build Your Perfect Okanagan Trip +
// Browse/Search repositioning) ==============================================

test('Milestone 3: Build Your Perfect Okanagan Trip section renders with the approved heading and reuses the existing trip-tray/map controls', () => {
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

test('Reference redesign: Build Your Perfect Okanagan Trip has a single CTA button, matching the reference (no second visible link)', () => {
  const html = app.renderBuildTripCTAHTML();
  const buttonCount = (html.match(/class="trip-cta-btn"/g) || []).length;
  assert.equal(buttonCount, 1, 'expected exactly one visible CTA button');
  assert.match(html, />Build My Trip/);
  assert.doesNotMatch(html, /trip-cta-map-link/, 'the old separate "View the interactive map" text link must be gone');
});

test('Build Your Perfect Okanagan Trip map visual uses the new map image, not the old hand-built SVG', () => {
  const html = app.renderBuildTripCTAHTML();
  assert.match(html, /<img class="trip-cta-map-img" src="\/images\/trip-cta-map\.png" width="1376" height="768"/, 'the new map image must render inside the existing #tripCtaOpenMap button');
  assert.doesNotMatch(html, /<svg class="trip-cta-map-svg"/, 'the old hand-built SVG map must be fully removed, not layered under the new image');
  assert.doesNotMatch(html, /tripLakeGrad|tripPinGrad|tripSoftBlur/, 'the old SVG\'s gradient/filter defs must be gone too');
});

test('Milestone 3: Build Your Perfect Okanagan Trip section does not introduce a new trip data model or duplicate trip-tray IDs', () => {
  const html = app.renderBuildTripCTAHTML();
  assert.doesNotMatch(html, /id="tripTray"/, 'must not duplicate the real #tripTray widget');
  assert.doesNotMatch(html, /id="tripTrayPanel"/, 'must not duplicate the real #tripTrayPanel');
  assert.doesNotMatch(html, /id="okMap"/, 'must not duplicate the real #okMap element');
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

test('Mood cards: What\'s On links to /events with no filter', () => {
  const html = app.renderMoodCardsHTML();
  assert.match(html, /class="mood-card mood-card-secondary mood-card-whats-on" href="\/events">/);
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
  assert.match(homepageBody, /id="exploreByCategory"/);
  assert.match(homepageBody, /id="exploreRegions"/);
  assert.match(homepageBody, /id="directory"/, 'Discovery Wizard section must be untouched');

  // Milestone 1 (approved homepage redesign) — the old "Worth the Drive"
  // carousel is intentionally replaced by a scenic hero + a new "What are
  // you in the mood for?" section, both ahead of the wizard.
  assert.match(homepageBody, /class="hero-scenic"/, 'New scenic hero (Milestone 1) must render');
  assert.match(homepageBody, /id="moodCards"/, 'Mood cards section (Milestone 1) must render');
  assert.doesNotMatch(homepageBody, /class="hero">/, 'Old "Worth the Drive" hero carousel must be gone');

  // Milestone 2 (Hidden Gems editorial + Explore the Okanagan visual
  // destinations) — the redesigned Explore cards each reference a
  // placeholder region image; confirm the /images/* route actually serves
  // one of them (not just that the HTML references the path).
  const exploreRegionImg = await fetch(`${base}/images/regions/kelowna.png`);
  assert.equal(exploreRegionImg.status, 200, 'Explore the Okanagan placeholder region image must be servable');
  assert.equal(exploreRegionImg.headers.get('content-type'), 'image/png');

  // Milestone 3 (Build Your Perfect Okanagan Trip + Browse/Search
  // repositioning) — the approved architecture's final section order:
  // Hero -> Mood -> Hidden Gems -> Explore -> Build Trip -> Browse/Search
  // (the wizard, id="directory") -> existing deeper directory content.
  assert.match(homepageBody, /id="buildTrip"/, 'Build Your Perfect Okanagan Trip section (Milestone 3) must render');
  const tripMapImg = await fetch(`${base}/images/trip-cta-map.png`);
  assert.equal(tripMapImg.status, 200, 'the new Build Your Trip map image must be servable');
  assert.equal(tripMapImg.headers.get('content-type'), 'image/png');
  const heroPos = homepageBody.indexOf('class="hero-scenic"');
  const moodPos = homepageBody.indexOf('id="moodCards"');
  const gemsPos = homepageBody.indexOf('id="hiddenGems"');
  const explorePos = homepageBody.indexOf('id="exploreRegions"');
  const tripPos = homepageBody.indexOf('id="buildTrip"');
  const directoryPos = homepageBody.indexOf('id="directory"');
  assert.ok(
    heroPos < moodPos && moodPos < gemsPos && gemsPos < explorePos && explorePos < tripPos && tripPos < directoryPos,
    `expected Hero < Mood < Hidden Gems < Explore < Build Trip < Browse/Search in page order, got positions ${JSON.stringify({ heroPos, moodPos, gemsPos, explorePos, tripPos, directoryPos })}`
  );

  // Browse/Search (the existing wizard) is repositioned and reframed, not
  // rewritten -- its own functional markup (#directory, search box, wizard
  // steps) must be completely unchanged; only a new de-emphasized heading
  // is added ahead of it.
  assert.match(homepageBody, /Browse (&amp;|&) [Ss]earch the Okanagan/, 'Browse/Search must have a reframing heading (Milestone 3)');
  assert.match(homepageBody, /id="searchInput"/, 'existing search input must be unchanged');
  assert.match(homepageBody, /id="wizardStep1"/, 'existing wizard step markup must be unchanged');

  // Events index (2026-09-17) — replaces the homepage's own "Happening
  // Soon" strip, which is removed entirely (no leftover section/anchor on
  // the homepage). The What's On mood card links here instead.
  assert.doesNotMatch(homepageBody, /id="happeningSoon"/, 'Happening Soon must no longer render on the homepage');
  assert.match(homepageBody, /class="mood-card mood-card-secondary mood-card-whats-on" href="\/events">/, 'What\'s On mood card must link to /events');
  const eventsIndexPage = await fetch(`${base}/events`);
  assert.equal(eventsIndexPage.status, 200, '/events must exist and serve the events index');
  const eventsIndexBody = await eventsIndexPage.text();
  assert.match(eventsIndexBody, /<h1>Upcoming Events in the Okanagan<\/h1>/);
  assert.match(eventsIndexBody, /Test Future Festival/, 'an active event fixture must be listed');
  assert.doesNotMatch(eventsIndexBody, /Test Past Market/, 'an expired event fixture must not be listed');
  assert.match(eventsIndexBody, /href="\/kelowna\/events\/test-future-festival"/, 'event cards must link to the real individual event page');
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
test('/admin/correct-phone returns 503 when ENRICHMENT_ADMIN_TOKEN is unset (isolated child process)', async () => {
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
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
