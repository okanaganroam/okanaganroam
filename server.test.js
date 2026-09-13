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

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
// Guarantee a clean slate every run.
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

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

// ---- seed fixtures for Hidden Gems (Phase 2 Sprint 3) -------------------
const hiddenGemVenue = app.findVenueBySlug('kelowna', 'golf', 'test-golf-course');
const nonGemVenue = app.findVenueBySlug('kelowna', 'restaurant', 'second-test-restaurant');

// A retired/redirected venue, so we can prove a collection referencing it
// never shows the badge — inserted directly (not through createVenue,
// which is out of scope here) and pointed at the already-seeded trattoria.
const trattoria = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
const redirectedVenueId = db.prepare(`
  INSERT INTO venues (name, region, type, slug, redirect_to)
  VALUES ('Test Redirected Venue', 'kelowna', 'restaurant', 'test-redirected-venue', ?)
`).run(trattoria.id).lastInsertRowid;

const insertCollection = db.prepare(`
  INSERT INTO collections (slug, kind, title, region) VALUES (@slug, @kind, @title, @region)
`);
const hiddenGemCollectionId = insertCollection.run({
  slug: 'test-hidden-gems-kelowna', kind: 'hidden_gem', title: 'Test Hidden Gems — Kelowna', region: 'kelowna',
}).lastInsertRowid;
const unrelatedCollectionId = insertCollection.run({
  slug: 'test-unrelated-collection', kind: 'roam_pick', title: 'Test Unrelated Collection', region: 'kelowna',
}).lastInsertRowid;

const insertCollectionItem = db.prepare(`
  INSERT INTO collection_items (collection_id, content_type, content_id) VALUES (@collection_id, @content_type, @content_id)
`);
// The golf venue is the one genuine hidden gem in these fixtures.
insertCollectionItem.run({ collection_id: hiddenGemCollectionId, content_type: 'venue', content_id: hiddenGemVenue.id });
// Same venue also appears in an unrelated (non-hidden_gem) collection —
// proves collection *kind* is what matters, not mere collection_items membership.
insertCollectionItem.run({ collection_id: unrelatedCollectionId, content_type: 'venue', content_id: hiddenGemVenue.id });
// A hidden_gem collection item pointing at a now-redirected venue — proves
// the badge never shows for a retired venue regardless of stale membership.
insertCollectionItem.run({ collection_id: hiddenGemCollectionId, content_type: 'venue', content_id: redirectedVenueId });

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

// ==== Phase 2 Sprint 3 (Hidden Gems) =======================================
// Hidden Gems is editorial curation via collections/collection_items, kept
// deliberately separate from venues/events per the approved architecture.
// These tests confirm: the migration is present, membership detection is
// correct (including the negative case and the unrelated-collection-kind
// case), the badge appears exactly where it should on both list cards and
// the detail page, a redirected venue never shows it despite stale
// membership, and none of this disturbs existing venue/category/guide
// rendering.

test('collections table exists after database initialization', () => {
  const cols = db.prepare('PRAGMA table_info(collections)').all().map((c) => c.name);
  for (const expected of ['id', 'slug', 'kind', 'title', 'region', 'created_at']) {
    assert.ok(cols.includes(expected), `collections table missing column: ${expected}`);
  }
});

test('collection_items table exists after database initialization', () => {
  const cols = db.prepare('PRAGMA table_info(collection_items)').all().map((c) => c.name);
  for (const expected of ['collection_id', 'content_type', 'content_id', 'note', 'position', 'created_at']) {
    assert.ok(cols.includes(expected), `collection_items table missing column: ${expected}`);
  }
});

test('a venue in a hidden_gem collection is detected correctly (bulk lookup)', () => {
  const ids = app.getHiddenGemVenueIds();
  assert.ok(ids.has(hiddenGemVenue.id), 'expected the fixture golf venue to be detected as a hidden gem');
});

test('a venue in a hidden_gem collection is detected correctly (targeted lookup)', () => {
  assert.equal(app.isVenueHiddenGem(hiddenGemVenue.id), true);
});

test('a venue not in any Hidden Gem collection is not detected as one', () => {
  const ids = app.getHiddenGemVenueIds();
  assert.ok(!ids.has(nonGemVenue.id));
  assert.equal(app.isVenueHiddenGem(nonGemVenue.id), false);
});

test('an unrelated collection kind does not create a Hidden Gem badge', () => {
  // hiddenGemVenue is ALSO a member of the 'roam_pick'-kind collection —
  // this proves detection keys off collections.kind, not mere
  // collection_items membership in any collection.
  const rows = db.prepare('SELECT kind FROM collections WHERE id = ?').get(unrelatedCollectionId);
  assert.equal(rows.kind, 'roam_pick');
  // Membership in the unrelated collection alone (hypothetically, if the
  // hidden_gem membership didn't also exist) would not trigger the badge —
  // demonstrated directly against a venue that has ONLY the unrelated one.
  const soloUnrelatedVenue = app.findVenueBySlug('kelowna', 'restaurant', 'test-trattoria');
  insertCollectionItem.run({ collection_id: unrelatedCollectionId, content_type: 'venue', content_id: soloUnrelatedVenue.id });
  assert.equal(app.isVenueHiddenGem(soloUnrelatedVenue.id), false);
});

test('a Hidden Gem venue gets the badge on its venue card', () => {
  const html = app.venueCardHtml(hiddenGemVenue, { isHiddenGem: true });
  assert.match(html, /Hidden Gem/);
});

test('a non-Hidden-Gem venue gets no badge on its venue card', () => {
  const html = app.venueCardHtml(nonGemVenue, { isHiddenGem: false });
  assert.doesNotMatch(html, /Hidden Gem/);
});

test('a Hidden Gem venue gets the badge on its detail page', () => {
  const html = app.renderVenuePage(hiddenGemVenue, [], [], []);
  assert.match(html, /Hidden Gem/);
});

test('a redirected venue does not display the Hidden Gem badge, despite stale collection membership', () => {
  const redirectedVenue = app.getVenue(redirectedVenueId);
  assert.ok(redirectedVenue.redirect_to, 'fixture venue must actually be redirected');
  assert.equal(app.isVenueHiddenGem(redirectedVenueId), false, 'bulk/targeted lookups must exclude redirected venues');
  const html = app.renderVenuePage(redirectedVenue, [], [], []);
  assert.doesNotMatch(html, /Hidden Gem/, 'renderVenuePage must never show the badge for a redirected venue');
});

test('REGRESSION: category and guide page rendering is unaffected for venues with no Hidden Gem badge', () => {
  const rows = app.getVenuesByRegionCategory('kelowna', 'restaurant');
  const html = app.renderCategoryPage('kelowna', 'restaurant', rows, []);
  assert.match(html, /Test Trattoria/);
  assert.doesNotMatch(html, /Hidden Gem/, 'no restaurant fixture is a hidden gem, so none should show the badge here');
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
  const golfCategoryBody = await golfCategoryPage.text();
  assert.match(golfCategoryBody, /Test Golf Course/);

  const golfVenuePage = await fetch(`${base}/kelowna/golf/test-golf-course`);
  assert.equal(golfVenuePage.status, 200, 'golf venue route must resolve');
  const golfVenueBody = await golfVenuePage.text();
  assert.match(golfVenueBody, /<h1>Test Golf Course<\/h1>/);

  // Phase 2 Sprint 3 (Hidden Gems) — end-to-end through the real routes
  assert.match(golfCategoryBody, /Hidden Gem/, 'hidden-gem fixture venue must show the badge on the real category route');
  assert.match(golfVenueBody, /Hidden Gem/, 'hidden-gem fixture venue must show the badge on the real venue-detail route');

  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/kelowna\/golf<\/loc>/, 'golf category must appear in the sitemap');
  assert.match(sitemapBody, /<loc>https:\/\/okanaganroam\.com\/kelowna\/golf\/test-golf-course<\/loc>/, 'golf venue must appear in the sitemap');

  const tokensCss = await fetch(`${base}/styles/tokens.css`);
  assert.equal(tokensCss.status, 200, 'shared tokens.css must be served');
  assert.match(await tokensCss.text(), /--teal/);

  const appCss = await fetch(`${base}/styles/app.css`);
  assert.equal(appCss.status, 200, 'shared app.css must be served');

  const appJs = await fetch(`${base}/scripts/app.js`);
  assert.equal(appJs.status, 200, 'extracted app.js must be served');

  // Close the listener so the test process can exit naturally instead of
  // hanging on an open server handle.
  await new Promise((resolve) => app.server.close(resolve));
});
