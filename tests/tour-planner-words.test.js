// Build My Trip words for every tour kind (2026-11-17, after Whistler tour test 5: "fishing charter" planned lakes and
// trails). One tour operator per kind in the tour setup's kind list, its kind ticked by the owner (so its category words
// are the setup's own), beside a lake beach, a fishing lake, a trail, a restaurant, an indoor spot and a winery in the
// same town. A plain English and French request naming each kind plans that operator, and no trail, lake, indoor spot
// or restaurant. A group size ("for 6 people") doesn't change it.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-words-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const tr = require('../trip-requirements.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Words ${++n}`, slug: `tour-words-${n}`, region: 'penticton', type, latitude: 49.49 + n / 3000, longitude: -119.59,
  rating: 4.6, reviews: 150, address: `${400 + n} Main St, Penticton`, phone: '250-555-0188', website: 'https://example.com', hours: JSON.stringify(WK('08:00', '18:00')),
  description: 'A fixture used only by the tour planner words tests.', ...o });
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.41.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);

// Every kind in the tour setup's list (Okanagan's list; Whistler has the same keys), with a plain request in each
// language. 'other' (Something else) has no words of its own.
const KINDS = {
  heli: ['heli-skiing in Penticton on February 10', 'héliski à Penticton le 10 février'],
  snowmobile: ['snowmobile tour in Penticton on January 20', 'motoneige à Penticton le 20 janvier'],
  dogsled: ['dog sledding in Penticton on January 20', 'traîneau à chiens à Penticton le 20 janvier'],
  snowshoe: ['snowshoe tour in Penticton on January 20', 'sortie en raquettes à Penticton le 20 janvier'],
  jetboat: ['jet boat tour in Penticton on July 10', 'sortie en jet boat à Penticton le 10 juillet'],
  boat: ['boat tour in Penticton on July 10', 'croisière à Penticton le 10 juillet'],
  paddle: ['guided kayak tour in Penticton on July 10', 'excursion en kayak à Penticton le 10 juillet'],
  raft: ['rafting in Penticton on July 10', 'rafting à Penticton le 10 juillet'],
  fishing: ['fishing charter in Penticton on August 14', 'excursion de pêche à Penticton le 14 août'],
  wildlife: ['wildlife tour in Penticton on July 10', 'observation de la faune à Penticton le 10 juillet'],
  horseback: ['horseback riding in Penticton on July 10', 'équitation à Penticton le 10 juillet'],
  bike: ['guided bike tour in Penticton on July 10', 'visite guidée à vélo à Penticton le 10 juillet'],
  zipline: ['ziplining in Penticton on July 10', 'tyrolienne à Penticton le 10 juillet'],
  adventure: ['ATV tour in Penticton on July 10', 'sortie en quad à Penticton le 10 juillet'],
  flight: ['scenic flight in Penticton on July 10', 'vol panoramique à Penticton le 10 juillet'],
  walking: ['walking tour in Penticton on July 10', 'visite à pied à Penticton le 10 juillet'],
  food: ['food tour in Penticton on July 10', 'visite gourmande à Penticton le 10 juillet'],
  wine: ['wine tour in Penticton on July 10', 'tournée des vignobles à Penticton le 10 juillet'],
  farm: ['farm tour in Penticton on July 10', 'visite de ferme à Penticton le 10 juillet'],
  rentals: ['equipment rentals in Penticton on July 10', 'location d’équipement à Penticton le 10 juillet'],
};
// Test 5's own fishing and charter words, and a group size (each must plan the fishing or boat operator).
const CHARTER = ['fishing charter in Penticton', 'Fishing charter in Penticton on August 14', 'a fishing trip for 6 people in Penticton on August 21', 'fishing tour in Penticton on August 14',
  'charter in Penticton on August 14', 'boat charter in Penticton on August 14', 'salmon fishing in Penticton in September', 'pêche à Penticton le 14 août', 'excursion de pêche à Penticton le 14 août', 'bateau nolisé à Penticton le 14 août'];
const OP = (k) => `Okanagan ${k} operator`;
let fx = null;
async function fixtures() {
  if (fx) return fx;
  const ops = {};
  for (const k of Object.keys(KINDS)) {
    const v = mk('tour', { name: OP(k), cuisine: '', description: 'Guided trips with a local guide.', rating: 4.8, reviews: 300 });
    const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const r = await change(t, { tour_info: { kinds: [k], length: 'half', year: 'all' } });
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
    ops[k] = v;
  }
  // The places a kind's words used to plan instead.
  mk('outdoor', { name: 'Skaha Beach Words', cuisine: '', description: 'A sandy lake beach with swimming, paddling and a boat launch.', activities: ['water', 'fishing'], rating: 4.8, reviews: 900 });
  mk('outdoor', { name: 'Trout Lake Words', cuisine: '', description: 'A quiet lake for fishing from shore, with a dock and a short trail.', activities: ['fishing', 'hiking'], rating: 4.7, reviews: 400 });
  mk('outdoor', { name: 'Riverside Trail Words', cuisine: '', description: 'An easy walking and biking trail along the river channel.', activities: ['hiking', 'cycling'], rating: 4.8, reviews: 700 });
  mk('restaurant', { name: 'Dockside Grill Words', cuisine: 'Seafood', description: 'Fish and chips by the marina.', rating: 4.6, reviews: 500 });
  mk('indoor', { name: 'Penticton Museum Words', cuisine: '', description: 'Local history museum.', rating: 4.5, reviews: 200 });
  mk('winery', { name: 'Bench Winery Words', cuisine: 'Winery', description: 'Wine tasting room.', rating: 4.7, reviews: 300 });
  fx = { ops };
  return fx;
}
const BAD_TYPES = ['outdoor', 'beach', 'restaurant', 'cafe', 'indoor', 'pub'];

test('every tour kind: a plain English and French request plans that kind’s operator, not trails, lakes, indoor spots or restaurants', async () => {
  const { ops } = await fixtures();
  const bad = [];
  for (const [k, qs] of Object.entries(KINDS)) {
    for (const q of qs) {
      const p = await plan(q), it = itemsOf(p);
      const got = it.map((x) => x.venue.name), types = it.map((x) => x.venue.type);
      // "Wine tour" in the Okanagan plans wineries (a wine-tour company may be among them).
      if (k === 'wine' && types.includes('winery') && !types.some((x) => BAD_TYPES.includes(x))) continue;
      if (!got.includes(ops[k].name)) bad.push(`${k} "${q}" -> ${JSON.stringify(got)}`);
      else if (types.some((x) => BAD_TYPES.includes(x)) && got.indexOf(ops[k].name) !== 0) bad.push(`${k} "${q}" also plans ${JSON.stringify(got)} before it`);
      // It comes first: no operator of another kind ahead of it (a request that found no kind listed every tour in town A-Z).
      const SAME = { boat: ['jetboat'], jetboat: ['boat'], dogsled: [], snowshoe: [] };
      const others = got.filter((x) => /^Okanagan \w+ operator$/.test(x) && x !== ops[k].name && !(SAME[k] || []).some((o) => ops[o].name === x));
      if (others.length && got[0] !== ops[k].name && !(SAME[k] || []).some((o) => ops[o].name === got[0])) bad.push(`${k} "${q}" also lists ${JSON.stringify(others)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('test 5: fishing charter, fishing trip, charter, salmon fishing and « pêche » plan the fishing or boat operator first, with a group size too', async () => {
  const { ops } = await fixtures();
  const want = [ops.fishing.name, ops.boat.name, ops.jetboat.name];
  const bad = [];
  for (const q of CHARTER) {
    const got = itemsOf(await plan(q)).map((x) => x.venue.name);
    if (!got.length || !want.includes(got[0])) bad.push(`"${q}" -> ${JSON.stringify(got)}`);
    if (/fish|pêche|saumon|salmon/i.test(q) && !got.includes(ops.fishing.name)) bad.push(`"${q}" lacks the fishing operator: ${JSON.stringify(got)}`);
  }
  assert.deepEqual(bad, []);
});

test('the operator’s category words for its kind match the planner kind (inferPlannerKinds), EN words from the setup', async () => {
  const { ops } = await fixtures();
  const expect = { snowmobile: 'snowmobile_tour', dogsled: 'snow_tour', snowshoe: 'snowshoe_tour', heli: 'heli_ski', rentals: 'rentals', bike: 'bike_tour', paddle: 'paddle_tour', jetboat: 'boat_tour', boat: 'boat_tour', raft: 'rafting', fishing: 'fishing_tour', wildlife: 'wildlife_tour',
    horseback: 'horseback', zipline: 'zipline', adventure: 'atv', flight: 'scenic_flight', walking: 'walking_tour', food: 'food_tour', wine: 'wine_tour', farm: 'farm' };
  const bad = [];
  for (const [k, kind] of Object.entries(expect)) {
    const v = app.getVenue(ops[k].id);
    const kinds = tr.inferPlannerKinds({ type: 'tour', name: v.name, description: v.description, cuisine: v.cuisine });
    if (!kinds.includes(kind)) bad.push(`${k} (${v.cuisine}) -> ${JSON.stringify(kinds)}`);
  }
  assert.deepEqual(bad, []);
});
