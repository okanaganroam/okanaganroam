// Restaurants say "Weekly events" (2026-11-16, Dayton): their easy-setup tile already did, so the edit page (link, fold
// heading, count, "Event 1", "+ Add an event", hints, "Listing update" line), the venue page's heading and the deals tab
// now match, in English and French. Pubs keep "Weekly nights"; breweries are unchanged.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'restaurant-weekly-events-admin-token';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const layout = require('../food-drink-venue-layout.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = Object.fromEntries(DAYS.map((d) => [d, [['11:00', '23:00']]]));
let n = 0;
const mk = (type) => app.createVenue({ name: `Weekly Test ${++n}`, slug: `weekly-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(WK),
  description: 'A fixture used only by the restaurant weekly events tests.' });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.19.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = (r) => assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const jan = new Date('2027-01-14T12:00:00-08:00');
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: jan });
const NIGHTS = [{ days: ['tue'], kind: 'trivia', title: 'Trivia Tuesday', start: '19:00', frequency: 'weekly' }, { days: ['fri'], kind: 'live_music', title: 'Live music', start: '20:00', frequency: 'weekly' }];

const withNights = async (type) => { const v = mk(type); const t = tokenFor(v.id); ok(await change(t, { weekly_nights: NIGHTS })); return { v, t }; };

test('a restaurant’s edit page says Weekly events (EN + FR)', async () => {
  const { v, t } = await withNights('restaurant');
  const edit = plain((await get(`/owner/${t}`)).text);
  assert.match(edit, /Weekly events: days and how often/);
  assert.match(edit, /Weekly events\s+2 events/);
  assert.match(edit, /Event 1/); assert.match(edit, /\+ Add an event/);
  assert.doesNotMatch(edit, /Weekly nights|2 nights|Add a night|Night 1|regular nights/);
  const editFr = plain((await get(`/fr/owner/${t}`)).text);
  assert.match(editFr, /Événements de la semaine : jours et fréquence/);
  assert.match(editFr, /Événements de la semaine\s+2 événements/);
  assert.match(editFr, /Événement 1/); assert.match(editFr, /\+ Ajouter un événement/);
  assert.doesNotMatch(editFr, /Soirées de la semaine|2 soirées|Ajouter une soirée|Soirée 1|soirées régulières/);
  assert.equal(app.ownerFieldLabelsFor({ id: v.id, type: 'restaurant' }, false).weekly_nights, 'Weekly events');
  assert.equal(app.ownerFieldLabelsFor({ id: v.id, type: 'restaurant' }, true).weekly_nights, 'Événements de la semaine');
  assert.equal(app.ownerFieldLabelsFor({ id: v.id, type: 'restaurant' }, false).pub_info, 'Kitchen / last seating');
});

test('a restaurant’s venue page heading and tab say events', async () => {
  const { v } = await withNights('restaurant');
  assert.match(page(v, 'en'), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.match(page(v, 'fr'), /<h2 id="venueNightsTitle">Événements de la semaine<\/h2>/);
  assert.equal(layout.dealsWording(true, true, ['live_music'], 'restaurant').tab, 'Deals & events');
  assert.equal(layout.dealsWording(false, true, ['live_music'], 'restaurant').tab, 'Weekly events');
  assert.equal(layout.dealsWording(true, true, ['trivia'], 'restaurant').tab, 'Deals & trivia');
});

test('a pub keeps Weekly nights everywhere; a brewery is unchanged', async () => {
  const pub = await withNights('pub');
  const pedit = plain((await get(`/owner/${pub.t}`)).text);
  assert.match(pedit, /Weekly nights: days and how often/); assert.match(pedit, /Weekly nights\s+2 nights/); assert.match(pedit, /\+ Add a night/); assert.match(pedit, /Night 1/);
  const peditFr = plain((await get(`/fr/owner/${pub.t}`)).text);
  assert.match(peditFr, /Soirées de la semaine/); assert.match(peditFr, /\+ Ajouter une soirée/);
  assert.match(page(pub.v, 'en'), /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
  assert.match(page(pub.v, 'fr'), /<h2 id="venueNightsTitle">Soirées de la semaine<\/h2>/);
  assert.equal(app.ownerFieldLabelsFor({ type: 'pub' }, false).weekly_nights, 'Weekly nights');
  assert.equal(layout.dealsWording(true, true, ['live_music'], 'pub').tab, 'Deals & nights');
  assert.equal(layout.dealsWording(false, true, ['live_music'], 'pub').tab, 'Weekly nights');
  const brew = await withNights('brewery');
  const bedit = plain((await get(`/owner/${brew.t}`)).text);
  assert.match(bedit, /Weekly events\s+2 events/); assert.match(bedit, /\+ Add an event/);
  assert.match(page(brew.v, 'en'), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.equal(layout.dealsWording(true, true, ['live_music'], 'brewery').tab, 'Deals & events');
});
