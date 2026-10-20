// Round 12 (2026-10-20), tech: closures in force in the venue JSON-LD, event -> venue linking (first comma part, "+",
// a trailing "(...)", listing aliases), venue-page event lists, event organizer cleanup, event pins from the linked
// venue (/map, My Trip), the admin slug change with 301s, and small header/redirect/ItemList fixes. Runs on a
// throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r12-test-admin-token';
const AUTH = { Authorization: 'Bearer r12-test-admin-token' };

const app = require('../server.js');
const db = require('../db.js');

const insertVenue = db.prepare(`
  INSERT INTO venues (name, region, type, description, description_fr, address, latitude, longitude, slug, website, hours)
  VALUES (@name, @region, @type, @description, @description_fr, @address, @lat, @lng, @slug, @website, @hours)
`);
const WEEK = JSON.stringify({ mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
const venueId = (o) => Number(insertVenue.run({
  type: 'restaurant', description: 'A fixture place used only by the round 12 tests.', description_fr: null, address: '1 Test St',
  lat: 49.5, lng: -119.6, website: null, hours: null, ...o,
}).lastInsertRowid);

const today = app.todayLocal();
const day = (n) => app.addLocalDays(today, n);
const SRC = 'https://example-r12.ca/hours';
const seasonRow = db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)');

// Closures in force.
const seasonDated = venueId({ name: 'R12 Dated Season Winery', region: 'oliver', type: 'winery', slug: 'r12-dated-season-winery', hours: WEEK });
seasonRow.run(seasonDated, 'closed', null, day(60), SRC, day(-10));
const seasonOpenEnded = venueId({ name: 'R12 Open-Ended Season Bistro', region: 'peachland', slug: 'r12-open-ended-season-bistro', hours: WEEK });
seasonRow.run(seasonOpenEnded, 'closed', null, null, SRC, day(-5));
const seasonNoHours = venueId({ name: 'R12 No Hours Season Cafe', region: 'penticton', type: 'cafe', slug: 'r12-no-hours-season-cafe' });
seasonRow.run(seasonNoHours, 'closed', null, day(30), SRC, day(-3));
const advisoryClosed = venueId({ name: 'R12 Wings Fixture', region: 'west-kelowna', slug: 'r12-wings-fixture', hours: WEEK });
const advisoryUntil = venueId({ name: 'R12 Until Fixture', region: 'west-kelowna', slug: 'r12-until-fixture', hours: WEEK });
const tempNow = venueId({ name: 'R12 Temp Closed Cafe', region: 'kelowna', type: 'cafe', slug: 'r12-temp-closed-cafe', hours: WEEK });
db.prepare('INSERT INTO venue_hours_extra (venue_id, closures) VALUES (?, ?)').run(tempNow, JSON.stringify([{ from: day(-2), to: day(5), note: '' }]));
const tempLater = venueId({ name: 'R12 Later Closure Cafe', region: 'kelowna', type: 'cafe', slug: 'r12-later-closure-cafe', hours: WEEK });
db.prepare('INSERT INTO venue_hours_extra (venue_id, closures) VALUES (?, ?)').run(tempLater, JSON.stringify([{ from: day(20), to: day(25), note: '' }]));
const openVenue = venueId({ name: 'R12 Open Bistro', region: 'kelowna', slug: 'r12-open-bistro', hours: WEEK });
const meta = { reason: 'r12 fixture', batch_id: 'test-r12-tech' };
assert.equal(app.guardedCollectionMembershipUpdate('advisory', advisoryClosed, 'add', "Temporarily closed, per the restaurant's own website (checked October 19, 2026). https://example-r12.ca/wings", meta).ok, true);
assert.equal(app.guardedCollectionMembershipUpdate('advisory', advisoryUntil, 'add', 'Temporarily closed until November 5 for renovations. https://example-r12.ca/until', meta).ok, true);

// Event -> venue linking.
const hester = venueId({ name: 'Hester Creek Estate Winery', region: 'oliver', type: 'winery', slug: 'hester-creek-estate-winery' });
const soec = venueId({ name: 'South Okanagan Events Centre (SOEC)', region: 'penticton', type: 'indoor', slug: 'south-okanagan-events-centre-soec', website: 'https://soec.example.com' });
const revelry = venueId({ name: 'Revelry Food + Music Hub', region: 'kelowna', type: 'indoor', slug: 'revelry-food-music-hub' });
const cannery = venueId({ name: 'Cannery Brewing Co.', region: 'penticton', type: 'brewery', slug: 'cannery-brewing-co', lat: 49.4935, lng: -119.5878 });
const laurel = venueId({ name: 'Okanagan Wine & Orchard Museum (Laurel Packinghouse)', region: 'kelowna', type: 'indoor', slug: 'okanagan-wine-orchard-museum-laurel-packinghouse' });
const okeefe = venueId({ name: "Historic O'Keefe Ranch", region: 'vernon', type: 'indoor', slug: 'historic-o-keefe-ranch', lat: 50.3639, lng: -119.3311 });
venueId({ name: 'The Kal', region: 'vernon', type: 'pub', slug: 'the-kal' });

function mkEvent(over) {
  const r = app.createEvent({
    region: 'kelowna', description: 'R12 fixture description.', source_type: 'tourism_org', source_name: 'Tourism Fixture',
    source_url: `https://example.com/r12/${app.slugify(over.name)}`, categories: ['live-music'],
    occurrences: [{ start_date: day(2), start_time: '19:30', end_time: '21:30' }], ...over,
  }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.event;
}
const evHester = mkEvent({ name: 'R12 Harvest Dinner', region: 'oliver', venue_name_text: 'Hester Creek Estate Winery, 877 Road 8, Oliver' });
const evSoec = mkEvent({ name: 'R12 Hockey Night', region: 'penticton', venue_name_text: 'South Okanagan Events Centre' });
const evSoecShort = mkEvent({ name: 'R12 Concert at SOEC', region: 'penticton', venue_name_text: 'SOEC' });
const evRevelryAnd = mkEvent({ name: 'R12 Revelry And', venue_name_text: 'Revelry Food and Music Hub, Kelowna' });
const evRevelryShort = mkEvent({ name: 'R12 Revelry Short', venue_name_text: 'Revelry, 1383 Ellis Street, Kelowna' });
const evCannery = mkEvent({ name: 'R12 Pumpkin Workshop', region: 'penticton', venue_name_text: 'Cannery Brewing' });
const evLaurel = mkEvent({ name: 'R12 Christmas at the Laurel', venue_name_text: 'Laurel Packinghouse' });
const evOkeefe = mkEvent({ name: 'R12 Field of Screams', region: 'vernon', venue_name_text: "Historic O'Keefe Ranch, 9380 Hwy 97 N, Vernon" });
const evOtherTown = mkEvent({ name: 'R12 Wrong Town', region: 'kelowna', venue_name_text: 'Hester Creek Estate Winery, 877 Road 8' });
const evKal = mkEvent({ name: 'R12 Vipers Game', region: 'vernon', venue_name_text: 'Kal Tire Place, 3445 43 Ave, Vernon' });
const evNowhere = mkEvent({ name: 'R12 Somewhere Show', region: 'penticton', venue_name_text: 'A Barn Somewhere, Penticton' });

// A wrongly filed event re-created in the right town; the old one cancelled.
const evFiledWrong = mkEvent({ name: 'R12 Winemakers Series Dinner', region: 'okanagan-falls', venue_name_text: 'Somewhere OK Falls' });
const evRefiled = mkEvent({ name: 'R12 Winemakers Series Dinner', region: 'penticton', venue_name_text: 'Somewhere Penticton', occurrences: [{ start_date: day(9), start_time: '18:00' }] });
assert.equal(app.updateEvent(evFiledWrong.id, { status: 'cancelled' }, meta).ok, true);
const evCancelledAlone = mkEvent({ name: 'R12 Lonely Cancelled Show', region: 'oliver', venue_name_text: 'Somewhere Oliver' });
assert.equal(app.updateEvent(evCancelledAlone.id, { status: 'cancelled' }, meta).ok, true);

// Venue-page event lists: twelve at one hall.
const hall = venueId({ name: 'R12 Busy Hall', region: 'kelowna', type: 'indoor', slug: 'r12-busy-hall', description_fr: 'Une salle de test.' });
const HALL_WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima'];
const hallEvents = HALL_WORDS.map((w, i) => mkEvent({ name: `${w} ${['Gala', 'Recital', 'Revue', 'Soiree'][i % 4]} R12`, venue_name_text: 'R12 Busy Hall', occurrences: [{ start_date: day(3 + i * 2), start_time: '20:00' }] }));

// Slug changes.
const renameId = venueId({ name: "Gino's Family Kitchen", region: 'oliver', slug: 'm-j-s-country-kitchen', description_fr: 'Une cuisine familiale.' });
venueId({ name: 'R12 Taken Name', region: 'oliver', slug: 'r12-taken-name' });

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const fetchRaw = (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts });
const page = async (p) => {
  const res = await fetchRaw(p);
  assert.equal(res.status, 200, `${p} -> ${res.status}`);
  return res.text();
};
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } }).filter(Boolean);
const bizOf = (id) => {
  const v = app.getVenue(id);
  return jsonLd(app.renderVenuePage(v, [], [], [])).find((o) => o.name === v.name && o['@type'] !== 'BreadcrumbList');
};
const closed = (from, through) => ({ '@type': 'OpeningHoursSpecification', opens: '00:00', closes: '00:00', validFrom: from, validThrough: through });

test('R12 closures: a dated season closure is a closed spec to the day before reopening; the week starts on that day', () => {
  const specs = bizOf(seasonDated).openingHoursSpecification;
  assert.deepEqual(specs[0], closed(today, day(59)));
  const weekly = specs.slice(1);
  assert.equal(weekly.length, 7);
  for (const s of weekly) assert.equal(s.validFrom, day(60), JSON.stringify(s));
  assert.equal(app.venueClosureInForce(seasonDated).reopens, day(60));
});

test('R12 closures: no reopening date -> closed for six months, no weekly hours; a place with no hours gets the closed spec too', () => {
  assert.deepEqual(bizOf(seasonOpenEnded).openingHoursSpecification, [closed(today, app.addLocalMonths(today, 6))]);
  assert.deepEqual(bizOf(seasonNoHours).openingHoursSpecification, [closed(today, day(29))]);
  assert.equal(app.addLocalMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(app.addLocalMonths('2026-10-20', 6), '2027-04-20');
});

test('R12 closures: a "Temporarily closed" advisory is a closure; one that names a return is left alone', () => {
  assert.deepEqual(bizOf(advisoryClosed).openingHoursSpecification, [closed(today, app.addLocalMonths(today, 6))]);
  const until = bizOf(advisoryUntil).openingHoursSpecification;
  assert.equal(until.length, 7);
  assert.ok(until.every((s) => !s.validFrom && !s.validThrough));
});

test('R12 closures: a current temporary closure moves the week to the reopening; a later one and an open place are unchanged', () => {
  const now = bizOf(tempNow);
  assert.deepEqual(now.openingHoursSpecification[0], closed(day(-2), day(5)), 'the closure keeps its own first day');
  assert.equal(now.openingHoursSpecification.filter((s) => s.opens === '00:00').length, 1, 'one closed spec, not two');
  assert.ok(now.openingHoursSpecification.slice(1).every((s) => s.validFrom === day(6) && s.dayOfWeek), JSON.stringify(now.openingHoursSpecification));
  assert.deepEqual(now.specialOpeningHoursSpecification, [closed(day(-2), day(5))]);
  const later = bizOf(tempLater).openingHoursSpecification;
  assert.equal(later.filter((s) => !s.validFrom).length, 7, 'weekly hours stay current');
  assert.ok(later.some((s) => JSON.stringify(s) === JSON.stringify(closed(day(20), day(25)))));
  const open = bizOf(openVenue).openingHoursSpecification;
  assert.equal(open.length, 7);
  assert.ok(open.every((s) => !s.validFrom && !s.validThrough && s.opens !== '00:00'));
  assert.equal(app.venueClosureInForce(openVenue), null);
});

test('R12 linking: first comma part, "+" / "and", a trailing "(...)" and listing aliases, in the same town only', () => {
  const link = (e) => app.eventLinkedVenueId(e);
  assert.equal(link(evHester), hester, 'Name, street, Town');
  assert.equal(link(evSoec), soec, 'listing name without its "(SOEC)"');
  assert.equal(link(evSoecShort), soec, 'SOEC alias');
  assert.equal(link(evRevelryAnd), revelry, '"and" = "+"');
  assert.equal(link(evRevelryShort), revelry, 'Revelry alias with a street');
  assert.equal(link(evCannery), cannery, 'Cannery Brewing -> Cannery Brewing Co.');
  assert.equal(link(evLaurel), laurel, 'Laurel Packinghouse -> the museum listing');
  assert.equal(link(evOkeefe), okeefe);
  assert.equal(link(evOtherTown), null, 'never another town');
  assert.equal(link(evKal), null, 'Kal Tire Place is not The Kal pub');
  assert.equal(link(evNowhere), null);
  assert.equal(app.eventVenueKey('Revelry Food + Music Hub'), app.eventVenueKey('Revelry Food & Music Hub'));
  // Every alias names its listing by an exact name, and every key is already normalised.
  for (const [k, name] of Object.entries(app.EVENT_VENUE_LISTING_ALIASES)) {
    const [region, key] = k.split('|');
    assert.ok(app.REGION_LABELS[region], k);
    assert.equal(app.eventVenueKey(key), key, k);
    assert.ok(name.length > 2, k);
  }
});

test('R12 venue events: ten show, the rest fold into "Show all", and the count says "at this venue" (EN + FR)', async () => {
  const html = await page('/kelowna/indoor/r12-busy-hall');
  const main = html.slice(html.indexOf('<h2>Events at R12 Busy Hall</h2>'));
  const grid = main.slice(0, main.indexOf('<details'));
  for (const e of hallEvents.slice(0, 10)) assert.ok(grid.includes(`/kelowna/events/${e.slug}"`), e.name);
  assert.ok(!grid.includes(`/kelowna/events/${hallEvents[10].slug}"`), 'the eleventh is in the folded list');
  assert.match(main, /<details class="venue-events-all" id="venue-events-all"[^>]*><summary[^>]*>Show all 12 events at this venue<\/summary>/);
  for (const e of hallEvents.slice(10)) assert.ok(main.includes(`/kelowna/events/${e.slug}"`), e.name);
  assert.match(main, /<a href="\/kelowna\/events">All events in Kelowna &rarr;<\/a> <span class="related-meta">\(<a href="#venue-events-all">12 coming up at this venue<\/a>\)<\/span>/);
  const fr = await page('/fr/kelowna/indoor/r12-busy-hall');
  assert.match(fr, /12 à venir dans ce lieu/);
  assert.match(fr, /Voir les 12 événements dans ce lieu/);
});

test('R12 organizer: never a ticket seller, feed or platform; source notes in brackets go; a title sponsor is skipped', () => {
  const theatre = { id: 1, name: 'Fixture Community Theatre', type: 'indoor', region: 'kelowna', slug: 'fixture-community-theatre', website: 'https://theatre.example.com' };
  const org = (ev, host = null) => app.eventOrganizerSchema({ name: 'Show', description: '', ...ev }, host);
  // SEO r13 (2026-10-20): a theatre is no longer the fallback organizer, so a ticket seller leaves it out.
  assert.equal(org({ source_type: 'official_organizer', source_name: 'Ticket Seller (official box office)' }, theatre), undefined);
  const soecHost = app.getVenue(soec);
  assert.equal(org({ source_type: 'league_feed', source_name: 'WHL schedule feed (HockeyTech)' }, soecHost), undefined, 'SEO r13: not the arena either');
  assert.equal(org({ source_type: 'official_organizer', source_name: 'Race Roster (The Starting Block)' }), undefined);
  assert.equal(org({ source_type: 'official_organizer', source_name: 'SilverStar Mountain Resort (Eventbrite)' }).name, 'SilverStar Mountain Resort');
  assert.equal(org({ source_type: 'official_organizer', source_name: 'Kelowna Actors Studio' }).name, 'Kelowna Actors Studio', 'a real organizer is kept');
  const gala = { name: 'A Night Under OneSky Legacy Gala Presented by Penticton Honda', description: 'An evening for OneSky, presented by Penticton Honda.', source_type: 'tourism_org', source_name: 'Tourism Penticton' };
  assert.equal(org(gala), undefined, 'the sponsor is not the organizer');
  assert.equal(org(gala, theatre), undefined, 'SEO r13: nor the linked theatre');
  assert.equal(org({ name: 'Concert', description: 'A holiday concert presented by Children Believe: Christmas classics.' }).name, 'Children Believe');
  for (const n of ['Ticket Seller', 'BCHL schedule feed', 'Eventbrite', 'Ticketmaster', 'Box Office']) assert.equal(app.eventOrganizerName(n), '', n);
});

test('R12 pins: an event with no coordinates uses its linked venue on /map and My Trip; with none, My Trip says so', () => {
  const rows = app.mapEventsData();
  const row = (e) => rows.find((r) => r[1] === `/${e.region}/events/${e.slug}`);
  assert.deepEqual(row(evCannery).slice(3, 6), ['Cannery Brewing Co.', 49.4935, -119.5878]);
  assert.equal(row(evOkeefe)[4], 50.3639);
  assert.equal(row(evNowhere)[4], null);
  const [a, b] = app.tripStopsFor([`event:${evCannery.id}`, `event:${evNowhere.id}`]);
  assert.deepEqual([a.lat, a.lng], [49.4935, -119.5878]);
  assert.equal(a.query, 'Cannery Brewing Co., Penticton, Okanagan Valley, BC');
  assert.deepEqual([b.lat, b.lng], [null, null]);
  const html = app.renderMyTripPage();
  assert.match(html, /Not on the map: no exact location is listed yet/);
  assert.match(html, /d\.kind === 'event' && !d\.missing && d\.lat == null/);
  assert.match(app.renderMyTripPage({ lang: 'fr' }), /Pas sur la carte : aucun lieu précis/);
});

test('R12 slugs: admin slug change, dry run first; old EN and FR addresses 301; guide refs still resolve', async () => {
  const post = (id, body, headers = AUTH) => fetchRaw(`/api/admin/venues/${id}/slug`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const noAuth = await post(renameId, { slug: 'gino-s-family-kitchen' }, {});
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.headers.get('cache-control'), 'no-store');
  assert.equal((await post(renameId, { slug: 'Bad Slug!' })).status, 400);
  assert.equal((await post(renameId, { slug: 'r12-taken-name' })).status, 409);
  assert.equal((await post(999999, { slug: 'anything' })).status, 404);

  const dry = await (await post(renameId, { slug: 'gino-s-family-kitchen', dry_run: true })).json();
  assert.equal(dry.ok, true);
  assert.equal(dry.dry_run, true);
  assert.deepEqual(dry.redirects, [
    { from: '/oliver/restaurants/m-j-s-country-kitchen', to: '/oliver/restaurants/gino-s-family-kitchen', status: 301 },
    { from: '/fr/oliver/restaurants/m-j-s-country-kitchen', to: '/fr/oliver/restaurants/gino-s-family-kitchen', status: 301 },
  ]);
  assert.ok(Array.isArray(dry.references));
  assert.equal(app.getVenue(renameId).slug, 'm-j-s-country-kitchen', 'a dry run changes nothing');

  const done = await (await post(renameId, { slug: 'gino-s-family-kitchen' })).json();
  assert.equal(done.dry_run, false);
  assert.equal(app.getVenue(renameId).slug, 'gino-s-family-kitchen');
  const en = await fetchRaw('/oliver/restaurants/m-j-s-country-kitchen?utm_source=ig');
  assert.equal(en.status, 301);
  assert.equal(en.headers.get('location'), '/oliver/restaurants/gino-s-family-kitchen?utm_source=ig');
  const fr = await fetchRaw('/fr/oliver/restaurants/m-j-s-country-kitchen');
  assert.equal(fr.status, 301);
  assert.equal(fr.headers.get('location'), '/fr/oliver/restaurants/gino-s-family-kitchen');
  await page('/oliver/restaurants/gino-s-family-kitchen');
  assert.equal(app.guideRefVenue('oliver/m-j-s-country-kitchen').id, renameId, 'a guide ref with the old slug');

  // Changing it back: the old address is the listing again, and the other one redirects.
  await post(renameId, { slug: 'm-j-s-country-kitchen' });
  assert.equal((await fetchRaw('/oliver/restaurants/m-j-s-country-kitchen')).status, 200);
  assert.equal((await fetchRaw('/oliver/restaurants/gino-s-family-kitchen')).headers.get('location'), '/oliver/restaurants/m-j-s-country-kitchen');
});

test('R12 small: /api errors are no-store, /fr/events/ is one hop, French ItemList names drop the site name', async () => {
  const deep = await fetchRaw('/api/venues/999999');
  assert.equal(deep.status, 404);
  assert.equal(deep.headers.get('cache-control'), 'no-store');
  const nf = await fetchRaw('/api/events/needs-french');
  assert.equal(nf.status, 401);
  assert.equal(nf.headers.get('cache-control'), 'no-store');
  const ok = await fetchRaw('/api/events');
  assert.equal(ok.headers.get('cache-control'), 'public, max-age=60', 'public reads keep their cache');
  for (const [from, to] of [['/fr/events/', '/fr/whats-on'], ['/fr/events/?utm_source=ig', '/fr/whats-on?utm_source=ig'], ['/events/', '/whats-on']]) {
    const r = await fetchRaw(from);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get('location'), to, from);
  }
  const out = JSON.parse(app.frJsonLd(JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Beaches in the Okanagan | Okanagan Roam', itemListElement: [] })));
  assert.doesNotMatch(out.name, /Okanagan Roam/);
  assert.match(out.name, /Okanagan$/);
});

test('R12 events: an unpublished event with a published same-name twin in another town 301s to it (EN + FR)', async () => {
  assert.deepEqual({ ...app.eventMovedTwin('okanagan-falls', evFiledWrong.slug) }, { region: 'penticton', slug: evRefiled.slug });
  const en = await fetchRaw(`/okanagan-falls/events/${evFiledWrong.slug}?utm_source=ig`);
  assert.equal(en.status, 301);
  assert.equal(en.headers.get('location'), `/penticton/events/${evRefiled.slug}?utm_source=ig`);
  const fr = await fetchRaw(`/fr/okanagan-falls/events/${evFiledWrong.slug}`);
  assert.equal(fr.status, 301);
  assert.equal(fr.headers.get('location'), `/fr/penticton/events/${evRefiled.slug}`);
  assert.equal((await fetchRaw(`/oliver/events/${evCancelledAlone.slug}`)).status, 404, 'no twin: still a 404');
  assert.equal(app.eventMovedTwin('penticton', evRefiled.slug), null, 'a published event never redirects');
  assert.equal((await fetchRaw(`/penticton/events/${evRefiled.slug}`)).status, 200);
});

test('R12 offers: a listing that says it is sold out is SoldOut; hedged mentions stay InStock', () => {
  const offer = (description, extra = {}) => app.eventOffersSchema({ description, ...extra });
  assert.equal(offer('Murder in the Vineyard. Tickets $95. SOLD OUT - join the waitlist.').availability, 'https://schema.org/SoldOut');
  assert.equal(offer('Dinner theatre, $95 per person.', { price_text: 'Sold out' }).availability, 'https://schema.org/SoldOut');
  assert.equal(offer('Tickets $40. This show sold out last year, so book early.').availability, 'https://schema.org/InStock');
  assert.equal(offer('Tickets $40 and they may sell out.').availability, 'https://schema.org/InStock');
  assert.equal(offer('Tickets $40. Get yours before it is sold out.').availability, 'https://schema.org/InStock');
  assert.equal(offer('Tickets $40.').availability, 'https://schema.org/InStock');
});
