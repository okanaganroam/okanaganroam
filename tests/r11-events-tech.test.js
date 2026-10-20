// Round 11 (2026-10-20), events and tech: event -> venue linking by exact name and town, stale French event
// descriptions, closures in openingHoursSpecification, the GA CSP hosts, /fr/events, bare /api, French ItemList
// names, the town ItemList and its events page, /menu with no menu, and /healthz. Runs on a throwaway database
// (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r11-test-admin-token';

const app = require('../server.js');
const db = require('../db.js');

const insertVenue = db.prepare(`
  INSERT INTO venues (name, region, type, description, address, latitude, longitude, slug, website)
  VALUES (@name, @region, @type, @description, @address, @lat, @lng, @slug, @website)
`);
const venueId = (o) => Number(insertVenue.run({ type: 'indoor', description: 'A fixture place used only by the test suite.', address: '1 Test St', lat: 49.88, lng: -119.49, website: null, ...o }).lastInsertRowid);
const theatreId = venueId({ name: 'Fixture Community Theatre', region: 'kelowna', slug: 'fixture-community-theatre', website: 'https://theatre.example.com' });
// Same name in another town: an event in Vernon links there, never to Kelowna's.
const vernonTheatreId = venueId({ name: 'Fixture Community Theatre', region: 'vernon', slug: 'fixture-community-theatre', lat: 50.26, lng: -119.27 });
// Two listings with one name in one town: ambiguous, never linked.
venueId({ name: 'Fixture Twin Hall', region: 'kelowna', slug: 'fixture-twin-hall-a' });
venueId({ name: 'Fixture Twin Hall', region: 'kelowna', slug: 'fixture-twin-hall-b' });
const cafeId = venueId({ name: 'Fixture Closed Cafe', region: 'kelowna', type: 'cafe', slug: 'fixture-closed-cafe' });
const menuless = venueId({ name: 'Fixture No Menu Bistro', region: 'kelowna', type: 'restaurant', slug: 'fixture-no-menu-bistro' });

const today = app.todayLocal();
const day = (n) => app.addLocalDays(today, n);
// Sugar Quail's case: a closure that is on now and runs a fortnight.
db.prepare('INSERT INTO venue_hours_extra (venue_id, closures) VALUES (?, ?)').run(cafeId, JSON.stringify([{ from: day(-3), to: day(14), note: '' }]));

const meta = { reason: 'r11 fixture', batch_id: 'test-r11-events-tech' };
function mkEvent(over) {
  const r = app.createEvent({
    region: 'kelowna', description: 'R11 fixture description.', source_type: 'tourism_org', source_name: 'Tourism Fixture',
    source_url: `https://example.com/r11/${app.slugify(over.name)}`, categories: ['live-music'],
    occurrences: [{ start_date: day(5), start_time: '19:30', end_time: '21:30' }], ...over,
  }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.event;
}
// An English description that already has French (from data/french/events-2026-10.json).
const frList = require('../data/french/events-2026-10.json');
const translatedEn = Object.keys(frList).find((k) => k.length > 40 && !/[{}]/.test(k));

const evA = mkEvent({ name: 'R11 Theatre Show One', venue_name_text: 'Fixture Community Theatre, Kelowna' });
const evB = mkEvent({ name: 'R11 Theatre Show Two', venue_name_text: 'the fixture community theatre', occurrences: [{ start_date: day(6), start_time: '19:00' }] });
const evC = mkEvent({ name: 'Fixture Celtic Society presents Tulua', venue_name_text: 'Fixture Community Theatre', occurrences: [{ start_date: day(7), start_time: '19:00' }] });
const evVernon = mkEvent({ name: 'R11 Vernon Show', region: 'vernon', venue_name_text: 'Fixture Community Theatre, Vernon' });
const evTwin = mkEvent({ name: 'R11 Twin Hall Night', venue_name_text: 'Fixture Twin Hall' });
const evFuzzy = mkEvent({ name: 'R11 Annex Night', venue_name_text: 'Fixture Community Theatre Annex' });
const evStale = mkEvent({ name: 'R11 Edited Show', description: translatedEn, venue_name_text: 'Somewhere Else' });
assert.equal(app.updateEvent(evStale.id, { description: 'R11 edited English description with no French yet.' }, meta).ok, true);
const evNew = mkEvent({ name: 'R11 New Show', venue_name_text: 'Somewhere Else', description: 'R11 brand new English description, never translated.' });
// Four more at the theatre: seven in all, so its page shows three and says there are more.
const evMore = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((w, i) => mkEvent({ name: `R11 ${w} Gala`, venue_name_text: 'Fixture Community Theatre', occurrences: [{ start_date: day(11 + i * 3), start_time: '20:00' }] }));
const evFr = mkEvent({ name: 'R11 Translated Show', venue_name_text: 'Somewhere Else', description: translatedEn, occurrences: [{ start_date: day(8), start_time: '18:00' }] });

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
const eventLd = (html) => jsonLd(html).find((o) => /Event$/.test(String(o['@type'])));

test('R11 linking: an event whose place is exactly one listing in its own town is linked to it', () => {
  assert.equal(app.eventLinkedVenueId(evA), theatreId, 'trailing town dropped');
  assert.equal(app.eventLinkedVenueId(evB), theatreId, 'case, spaces and a leading "the" do not matter');
  assert.equal(app.eventLinkedVenueId(evC), theatreId);
  assert.equal(app.eventLinkedVenueId(evVernon), vernonTheatreId, 'the Vernon listing, not Kelowna\'s');
  assert.equal(app.eventLinkedVenueId(evTwin), null, 'two listings share the name: not linked');
  assert.equal(app.eventLinkedVenueId(evFuzzy), null, 'no fuzzy matches');
  assert.equal(app.eventLinkedVenueId({ ...evA, venue_id: menuless }), menuless, 'a stored venue_id wins');
});

test('R11 linking: the venue page lists the matched events; the event page links the venue', async () => {
  const html = await page('/kelowna/indoor/fixture-community-theatre');
  assert.match(html, /Events at Fixture Community Theatre/);
  for (const e of [evA, evB, evC]) assert.ok(html.includes(`href="/kelowna/events/${e.slug}"`), e.name);
  // Round 12: up to ten show now, so all seven are listed and no "more" line is needed.
  for (const e of evMore) assert.ok(html.includes(`/kelowna/events/${e.slug}`), e.name);
  assert.ok(!html.includes(`/vernon/events/${evVernon.slug}`));
  assert.ok(!html.includes('coming up at this venue'));
  const ev = await page(`/kelowna/events/${evA.slug}`);
  assert.ok(ev.includes('href="/kelowna/indoor/fixture-community-theatre"'), 'the event page links its place');
});

test('R11 linking: event JSON-LD has the venue as location and organizer, or the presenter', async () => {
  const a = eventLd(await page(`/kelowna/events/${evA.slug}`));
  assert.equal(a.location.name, 'Fixture Community Theatre');
  assert.equal(a.organizer.name, 'Fixture Community Theatre');
  assert.equal(a.organizer.url, 'https://theatre.example.com');
  const c = eventLd(await page(`/kelowna/events/${evC.slug}`));
  assert.deepEqual(c.organizer, { '@type': 'Organization', name: 'Fixture Celtic Society' });
  assert.equal(app.eventPresenterName({ name: 'Show', description: 'A holiday concert presented by Children Believe: Christmas classics.' }), 'Children Believe');
  assert.equal(app.eventPresenterName({ name: 'Leif David Magic', description: 'Award-winning magician Leif David presents a show.' }), null);
  assert.equal(app.eventPresenterName({ name: 'An evening', description: 'presented by local volunteers' }), null);
});

test('R11 French: stale and missing French are told apart and listed for the admin', async () => {
  assert.equal(app.eventFrenchStatus(app.getEventById(evStale.id)).status, 'stale');
  assert.ok(app.eventFrenchStatus(app.getEventById(evStale.id)).english_changed_at);
  assert.equal(app.eventFrenchStatus(app.getEventById(evNew.id)).status, 'missing');
  assert.equal(app.eventFrenchStatus(app.getEventById(evFr.id)).status, 'translated');
  assert.equal((await fetchRaw('/api/events/needs-french')).status, 401);
  const res = await fetchRaw('/api/events/needs-french', { headers: { Authorization: 'Bearer r11-test-admin-token' } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.events[0].id, evStale.id, 'stale first');
  assert.ok(body.events.some((e) => e.id === evNew.id && e.status === 'missing'));
  assert.ok(!body.events.some((e) => e.id === evFr.id));
  assert.equal(body.stale, 1);
  const one = await (await fetchRaw(`/api/events/${evStale.id}`, { headers: { Authorization: 'Bearer r11-test-admin-token' } })).json();
  assert.equal(one.french.status, 'stale');
  const linked = await (await fetchRaw(`/api/events/${evA.id}`, { headers: { Authorization: 'Bearer r11-test-admin-token' } })).json();
  assert.deepEqual(linked.linked_venue, { id: theatreId, matched_by_name: true });
});

test('R11 French: the French page and cards hide an untranslated English description; still noindex', async () => {
  const fr = await page(`/fr/kelowna/events/${evStale.slug}`);
  assert.match(fr, /<meta name="robots" content="noindex, follow">/);
  assert.match(fr, /<p class="event-body">La description en français arrive bientôt/);
  assert.match(fr, /<details class="event-body-en"><summary>[^<]*<\/summary><p class="event-body" lang="en">R11 edited English/);
  const list = await page('/fr/whats-on');
  const card = (id) => (new RegExp(`id="golf-desc-event-${id}"><p>([^<]*)</p>`).exec(list) || [])[1];
  assert.equal(card(evNew.id), 'Description en français à venir.');
  assert.ok(!list.includes('R11 brand new English description'));
  assert.equal(card(evFr.id), frList[translatedEn].replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/&(?!#39;|quot;)/g, '&amp;'));
  // English stays English.
  assert.ok((await page('/whats-on')).includes('R11 brand new English description'));
});

test('R11 closures: a temporary closure is a dated closed spec in openingHoursSpecification too', async () => {
  const html = await page('/kelowna/cafes/fixture-closed-cafe');
  const biz = jsonLd(html).find((o) => o.openingHoursSpecification || o.specialOpeningHoursSpecification);
  const spec = { '@type': 'OpeningHoursSpecification', opens: '00:00', closes: '00:00', validFrom: day(-3), validThrough: day(14) };
  assert.ok(biz.openingHoursSpecification.some((s) => JSON.stringify(s) === JSON.stringify(spec)), JSON.stringify(biz.openingHoursSpecification));
  assert.ok(biz.specialOpeningHoursSpecification.some((s) => JSON.stringify(s) === JSON.stringify(spec)));
});

test('R11 CSP: GA4 hits to www.google.com/g/collect are allowed', async () => {
  const res = await fetchRaw('/healthz');
  const csp = res.headers.get('content-security-policy');
  const connect = csp.split(';').map((x) => x.trim()).find((x) => x.startsWith('connect-src'));
  for (const h of ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://*.google.com', 'https://*.g.doubleclick.net']) assert.ok(connect.split(' ').includes(h), h);
});

test('R11 routes: /healthz, /fr/events, bare /api, /menu with no menu', async () => {
  const h = await fetchRaw('/healthz');
  assert.equal(h.status, 200);
  assert.equal(h.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await h.json(), { ok: true, status: 'ready' });
  const fe = await fetchRaw('/fr/events?utm_source=ig');
  assert.equal(fe.status, 301);
  assert.equal(fe.headers.get('location'), '/fr/whats-on?utm_source=ig');
  const api = await fetchRaw('/api');
  assert.equal(api.status, 404);
  assert.match(api.headers.get('content-type'), /json/);
  for (const p of ['/kelowna/restaurants/fixture-no-menu-bistro/menu', '/fr/kelowna/restaurants/fixture-no-menu-bistro/menu']) {
    assert.equal((await fetchRaw(p)).status, 404, p);
  }
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'railway.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'railway.json'), 'utf8')).deploy.healthcheckPath, '/healthz');
});

test('R11 ItemLists: French weekend list name; a town list leaves out a noindex events page', () => {
  const out = JSON.parse(app.frJsonLd(JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Things to Do in the Okanagan This Weekend', itemListElement: [] })));
  assert.equal(out.name, 'Quoi faire dans l’Okanagan cette fin de semaine');
  const lists = app.regionPageSchemas('coldstream', 'Coldstream', 'd', 'https://okanaganroam.com/coldstream', [
    { href: '/coldstream/restaurants', count: 3, label: 'Restaurants' }, { href: '/coldstream/events', count: 2, label: 'What’s On' },
  ]);
  const list = lists.find((o) => o['@type'] === 'ItemList');
  assert.deepEqual(list.itemListElement.map((x) => x.url), ['https://okanaganroam.com/coldstream/restaurants']);
});
