// Two Build My Trip fixes found porting #894 to Whistler (whistlerroam #173):
//  1. "Jazz brunch" finds a place's listed Sunday « Brunch jazz » even when "brunch" is a cuisine in the database (it is
//     on live data; #894's own test DB had none, so the event-name match, which skips cuisine words, was never tried).
//     Plain "brunch on Sunday" still finds brunch restaurants.
//  2. "A drink at <named brewery/distillery>" is that one stop: the named place absorbs the generic drinks stop (a
//     distillery was missing from that list once "a drink" started to include distilleries).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'trip-brunch-drinks-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Brunch Drinks Fixture ${++n}`, slug: `brunch-drinks-fixture-${n}`, region: 'lumby', type, latitude: 50.25 + n / 2000, longitude: -118.97,
  rating: 4.4, reviews: 150, address: `${4000 + n} Vernon St, Lumby`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '22:00')),
  description: 'A fixture used only by the Build My Trip event-name and named drink tests.', ...o });
let ipN = 0;
let srv, base;
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.31.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const reasonsOf = (x) => (x.reasons || x.why || []).map((r) => (typeof r === 'string' ? r : r.text));
const names = (p) => JSON.stringify(itemsOf(p).map((x) => `${x.venue.name} (${x.venue.type})`));

// Brunch restaurants (cuisine "Brunch", as on live data), a pub with live music, and a distillery that lists a Sunday
// live-music event named « Brunch jazz » at 11 AM with its own kitchen.
let jazzId, brunchIds = [];
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  for (let i = 0; i < 3; i++) brunchIds.push(mk('restaurant', { name: `Lumby Brunch House ${i + 1}`, cuisine: 'Brunch', rating: 4.5 + i / 20, reviews: 300 + i }).id);
  mk('pub', { name: 'Lumby Corner Pub', cuisine: 'Pub fare', live_music: 1, rating: 4.7, reviews: 800 });
  const jazz = mk('distillery', { name: 'Monashee Fixture Spirits', cuisine: 'Craft distillery & cocktail lounge', live_music: 1, rating: 4.6, reviews: 210 });
  jazzId = jazz.id;
  const t = app.createOwnerLink(jazz.id, {}).url.split('/owner/')[1];
  {
    const change = (changes) => postJson(`/fr/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
    for (const c of [{ hours: WK('10:00', '21:00'), hours_checked: true }, { brewery_info: { food: 'kitchen', outside: 'no' } },
      { weekly_nights: [{ days: ['sun'], kind: 'live_music', title: 'Live music', title_fr: 'Brunch jazz', start: '11:00' }] }]) {
      const r = await change(c);
      assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    }
  }
});

test('1: jazz brunch on Sunday finds her « Brunch jazz » though "brunch" is a cuisine (EN + FR)', async () => {
  for (const q of ['Jazz brunch in Lumby on Sunday November 22', 'Brunch avec du jazz à Lumby le dimanche 22 novembre']) {
    const p = await plan(q);
    const it = itemsOf(p).find((x) => x.venue.id === jazzId);
    assert.ok(it, `${q}: ${names(p)}`);
    assert.match(reasonsOf(it).join(' | '), /Brunch jazz on Sunday at 11 AM, from its listing/, `${q}: ${reasonsOf(it).join(' | ')} -- ${names(p)}`);
  }
});

test('1: plain brunch on Sunday still finds the brunch restaurants', async () => {
  const p = await plan('Brunch in Lumby on Sunday November 22');
  assert.ok(itemsOf(p).some((x) => brunchIds.includes(x.venue.id)), names(p));
});

test('2: a drink at a named brewery or distillery is just that stop, no extra pub', async () => {
  const at = (name, type, k) => mk(type, { name, region: 'vernon', address: `${k} Main St, Vernon`, latitude: 50.267 + k / 1000, longitude: -119.272, rating: 4.5, reviews: 300 + k });
  // A brewery named "... Brewing" (Whistler Brewing's shape) and distilleries named "... Spirits" and "... Distilling".
  const named = [at('Kalamalka Fixture Brewing', 'brewery', 1), at('Coldstream Fixture Spirits', 'distillery', 2), at('Tumbleweed Fixture Distilling', 'distillery', 3)];
  at('Vernon Fixture Pub', 'pub', 4); at('Vernon Fixture Lounge', 'cocktail', 5);
  for (const v of named) for (const q of [`A drink at ${v.name} in Vernon on Saturday`, `Drinks at ${v.name} in Vernon on Saturday`]) {
    const p = await plan(q);
    const stops = itemsOf(p);
    assert.ok(stops.some((x) => x.venue.id === v.id), `${q}: ${names(p)}`);
    assert.equal(stops.length, 1, `${q}: ${p.kind} ${names(p)}`);
  }
});
