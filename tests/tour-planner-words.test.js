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
    // Tour test 6 (2026-11-17): the adventure kind's page word is "Adventure" when her words name nothing narrower (it was
    // the chip's whole "ATV, bungee…" label); the planner reads her picked kinds too (server.js plannerKinds), as it plans.
    const kinds = tr.inferPlannerKinds({ type: 'tour', name: v.name, description: v.description, cuisine: v.cuisine, ...(k === 'adventure' ? { tourKinds: app.venueTourInfo(v.id).kinds } : {}) });
    if (!kinds.includes(kind)) bad.push(`${k} (${v.cuisine}) -> ${JSON.stringify(kinds)}`);
  }
  assert.deepEqual(bad, []);
});

// From Whistler Roam #188 (2026-11-17), its real-data check on whistler.db, on Okanagan fixtures: a snowshoe tour plans
// the snowshoe operator, not the snowshoe trail first (EN, FR, « randonnée guidée en raquettes »); plain "snowshoeing"
// may still offer the trail. Heli-skiing is read from a listing's own name and category (a snowcat sightseeing tour and a
// yurt whose description names a heli-ski company are not heli-skiing); "cat skiing" keeps the heli and cat-ski
// companies; a "snowcat tour" is not cat-skiing.
test('Whistler real-data fixes: snowshoe tour before trails, guided snowshoe in French, heli and cat skiing', async () => {
  await fixtures();
  const trail = mk('outdoor', { name: 'Snowshoe Trails Words', cuisine: 'Snowshoe trails', description: 'Marked snowshoe trails through the forest.', activities: ['snowshoeing', 'winter', 'hiking'], rating: 4.9, reviews: 900 });
  const cat = mk('tour', { name: 'Big White Snowcat Words Adventures', cuisine: 'Snowmobile, dog sled, snowshoe & snowcat tours', description: 'Snowmobile, dog sled, snowshoe and snowcat tours.', rating: 4.9, reviews: 900 });
  const yurt = mk('tour', { name: 'Monashee Yurt Words', cuisine: 'Heli-touring & backcountry yurt', description: "Words Heli-Skiing's six-bunk yurt.", rating: 4.9, reviews: 900 });
  const catski = mk('tour', { name: 'SilverStar Powder Words Cat-Skiing', cuisine: 'Heli & cat skiing', description: 'Guided snowcat skiing.', rating: 4.7, reviews: 100 });
  const names = async (q) => itemsOf(await plan(q)).map((x) => x.venue.name);
  for (const q of ['snowshoe tour in Penticton on January 20', 'sortie en raquettes à Penticton le 20 janvier', 'randonnée guidée en raquettes à Penticton le 20 janvier']) {
    const got = await names(q);
    assert.ok(got.length && got[0] !== trail.name && !got.includes(trail.name), `${q}: ${JSON.stringify(got)}`);
    assert.ok(got.includes(OP('snowshoe')), `${q}: ${JSON.stringify(got)}`);
  }
  assert.ok((tr.extractTripRequirements({ text: 'snowshoeing in penticton on january 20' }).items || []).some((i) => i.kind === 'activity' && i.value === 'snowshoeing'));
  assert.ok(!(tr.extractTripRequirements({ text: 'snowshoe tour in penticton on january 20' }).items || []).some((i) => i.kind === 'activity' && i.value === 'snowshoeing'));
  const kindsOf = (v) => tr.inferPlannerKinds({ type: 'tour', name: v.name, cuisine: v.cuisine, description: v.description });
  assert.ok(!kindsOf(cat).includes('heli_ski')); assert.ok(!kindsOf(yurt).includes('heli_ski')); assert.ok(kindsOf(catski).includes('heli_ski'));
  const heli = await names('heli-skiing in Penticton on February 10');
  assert.ok(heli.includes(OP('heli')) && heli.includes(catski.name), JSON.stringify(heli));
  assert.ok(!heli.includes(cat.name) && !heli.includes(yurt.name), JSON.stringify(heli));
  const cs = await names('cat skiing in Penticton on February 10');
  assert.ok(cs.includes(catski.name), JSON.stringify(cs));
  assert.ok(!(tr.extractTripRequirements({ text: 'snowcat tour in penticton' }).items || []).some((i) => i.value === 'heli_ski'));
});

// Tour test 6 (Whistler, 2026-11-17): rentals by what is rented, adventure parks and kids' birthdays, EN and FR.
test('tour test 6 words: "e-bike rental", « location de vélos », "adventure park", « parc d’aventure », a kids’ birthday', async () => {
  const { ops } = await fixtures();
  const bad = [];
  const first = async (q, want) => { const got = itemsOf(await plan(q)).map((x) => x.venue.name); if (!got.length || got[0] !== want) bad.push(`"${q}" -> ${JSON.stringify(got)}`); };
  for (const q of ['e-bike rental in Penticton on July 10', 'bike rentals in Penticton on July 10', 'location de vélos électriques à Penticton le 10 juillet', 'location de vélos à Penticton le 10 juillet', 'kayak rental in Penticton on July 10']) await first(q, ops.rentals.name);
  for (const q of ['adventure park in Penticton on July 10', 'parc d’aventure à Penticton le 10 juillet', 'ropes course in Penticton on July 10', 'hébertisme à Penticton le 10 juillet']) await first(q, ops.adventure.name);
  const bday = itemsOf(await plan('kids birthday party activity in Penticton on July 10'));
  if (!bday.length || !['tour', 'indoor', 'sport'].includes(bday[0].venue.type)) bad.push(`kids birthday -> ${JSON.stringify(bday.map((x) => x.venue.name))}`);
  assert.deepEqual(bad, []);
});

// Tour test 7 (Whistler, 2026-11-17; Erik, an ACMG mountain guide): ski touring, backcountry skiing, splitboarding,
// avalanche courses (one course too), AST, hut and multi-day trips and mountaineering, EN and FR, plan the guide in the
// asked town before another town's operator or a heli-ski company; a 15-year-old is never planned on his 16+ trips.
test('tour test 7 words: ski touring, avalanche course, hut trip, mountaineering (EN + FR); a child under the minimum age', async () => {
  await fixtures();
  const erik = mk('tour', { name: 'Okanagan Mountain Guiding Words', cuisine: 'Ski touring, heli-skiing & avalanche courses', description: 'Certified mountain guides: ski touring, mountaineering and avalanche courses.', rating: 4.9, reviews: 143 });
  const t = app.createOwnerLink(erik.id, {}).url.split('/owner/')[1];
  const r = await change(t, { tour_info: { kinds: ['snowshoe', 'guide'], length: 'multi', age: '16', year: 'all' } });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  assert.doesNotMatch(app.getVenue(erik.id).cuisine, /heli/i);
  const heli = mk('tour', { name: 'Penticton Heli-Skiing Words', cuisine: 'Heli-skiing', description: 'Heli-skiing.', rating: 4.9, reviews: 900 });
  const away = mk('tour', { name: 'Kelowna Backcountry Words', region: 'kelowna', cuisine: 'Backcountry ski touring lodge', description: 'Guided ski touring.', rating: 5, reviews: 900 });
  const names = async (q) => itemsOf(await plan(q)).map((x) => x.venue.name);
  const bad = [];
  // The setup's own snowshoe operator (its chip is "Snowshoe or ski touring", so its words say ski touring) may come first.
  const firstIs = async (q) => { const got = (await names(q)).filter((x) => x !== OP('snowshoe')); if (got[0] !== erik.name && !(/\bnear\b/.test(q) && got.includes(erik.name))) bad.push(`"${q}" -> ${JSON.stringify(got)}`); if (got.includes(heli.name)) bad.push(`"${q}" plans heli-skiing ${JSON.stringify(got)}`); if (got.includes(away.name) && !/\bnear\b|près/.test(q)) bad.push(`"${q}" borrows Kelowna ${JSON.stringify(got)}`); };
  for (const q of ['ski touring in Penticton on February 10', 'Ski touring near Penticton on February 10', 'backcountry skiing in Penticton on February 10', 'backcountry ski day in Penticton on February 10', 'splitboard in Penticton on February 10', 'ski touring guide in Penticton on February 10',
    'avalanche course in Penticton on January 16', 'avalanche courses in Penticton on January 16', 'AST 1 in Penticton on January 16', 'avalanche training in Penticton on January 16',
    'hut trip near Penticton in August', 'multi-day hut trip from Penticton in August', '3 day hut trip near Penticton August 10 to 12', 'overnight hike in Penticton on August 10', 'glacier mountaineering in Penticton on August 12',
    'ski de randonnée à Penticton le 10 février', 'ski hors-piste à Penticton le 10 février', 'randonnée alpine guidée à Penticton le 10 août', 'cours d’avalanche à Penticton le 16 janvier', 'formation avalanche à Penticton le 16 janvier',
    'randonnée de plusieurs jours à Penticton en août', 'nuit en refuge à Penticton en août']) await firstIs(q);
  // A 15-year-old: left out, and the plan says why.
  const p = await plan('mountaineering in Penticton on August 12 with our 15-year-old');
  if (itemsOf(p).some((x) => x.venue.id === erik.id)) bad.push('15-year-old planned on a 16+ guide');
  if (!(p.notes || []).some((n) => n.startsWith(`${erik.name} is for ages 16 and up`))) bad.push(`no age note: ${JSON.stringify(p.notes)}`);
  // A 16-year-old is fine; "a 3 day trip to Penticton" is still a 3-day plan, not a hut trip.
  if (!itemsOf(await plan('mountaineering in Penticton on August 12 with our 16-year-old')).some((x) => x.venue.id === erik.id)) bad.push('16-year-old left out');
  assert.ok(!(tr.extractTripRequirements({ text: '3 day trip to penticton' }).items || []).some((i) => i.value === 'multi_day_tour'));
  assert.ok(!(tr.extractTripRequirements({ text: 'ski touring in penticton' }).items || []).some((i) => i.kind === 'activity' && i.value === 'skiing'));
  assert.deepEqual(bad, []);
});

// Tour test 8 (Whistler, 2026-11-17; Linda, a dog-sledding and kennel-tour business). "Dogs" or "puppy" in her listing's
// name, or in "sled dog tour", "puppy visit", "kennel tour", « chiens de traîneau », never mean a dog in the party; "husky
// sled ride" and "mushing" are dog sledding; a kennel or puppy visit plans her summer product; a named place left out is
// judged on the asked date; "mushing with our 14-year-old" says a 14-year-old can ride but not mush (her list: 16+).
let sledFx = null;
async function sledDogs() {
  if (sledFx) return sledFx;
  await fixtures();
  const v = mk('tour', { name: 'Skaha Sled Dogs Words', cuisine: 'Dog sledding & kennel tours', description: 'Friendly huskies pull our sleds through the snowy forest. In summer, visit the kennel and meet the puppies.', rating: 4.8, reviews: 211, hours: JSON.stringify(WK('09:00', '16:30')) });
  const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
  let r = await change(t, { tour_info: { kinds: ['dogsled', 'farm'], length: '2-3h', age: 'all', year: 'seasonal' }, open_months: '12-10:09-15' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  r = await change(t, { closures: [{ from: '04-01', to: '06-14', note: 'Between seasons', yearly: true }] });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  const db = require('../db.js');
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(v.id, JSON.stringify({ sections: [
    { name: 'Winter', items: [{ name: 'Sled ride', description: '$349 per sled (2 adults), ages 3+' }, { name: 'Mush your own team', description: '$299 per person, 16+' }] },
    { name: 'Summer', items: [{ name: 'Kennel visit', description: '$35 adult, $20 child' }] }] }));
  const pub = mk('pub', { name: 'Leash Pub Words', cuisine: 'Pub', description: 'A dog-friendly pub with a patio.', dog_friendly: 1, rating: 4.9, reviews: 900 });
  const park = mk('outdoor', { name: 'Off Leash Park Words', cuisine: 'Dog park', description: 'An off-leash dog park.', activities: ['hiking'], dog_friendly: 1, rating: 4.9, reviews: 900 });
  sledFx = { v, pub, park };
  return sledFx;
}

test('tour test 8 words: sled dogs, huskies, mushing, puppy and kennel visits (EN + FR) plan the dog-sled operator, never a dog outing', async () => {
  const { v, pub, park } = await sledDogs();
  const bad = [];
  const dogOuting = (p) => /with a dog|dog-friendly spots|Leash Pub Words|Off Leash Park Words/i.test(JSON.stringify([p.party, p.heading, p.summary, itemsOf(p).map((x) => x.venue.name)]));
  const want = async (q, opts = {}) => {
    const p = await plan(q), got = itemsOf(p).map((x) => x.venue.name);
    if (!got.includes(v.name)) bad.push(`"${q}" lacks her -> ${JSON.stringify(got)} ${JSON.stringify(p.warnings || [])}`);
    else if (opts.first && got[0] !== v.name) bad.push(`"${q}" not first -> ${JSON.stringify(got)}`);
    if (got.includes(pub.name) || got.includes(park.name)) bad.push(`"${q}" plans a dog outing -> ${JSON.stringify(got)}`);
    if (dogOuting(p)) bad.push(`"${q}" read as travelling with a dog: ${JSON.stringify(p.party)} ${JSON.stringify(p.heading)}`);
    if ((p.warnings || []).some((w) => /closed for the season until/.test(w))) bad.push(`"${q}" false closed note ${JSON.stringify(p.warnings)}`);
    return p;
  };
  // Her name, asked on a date she is open (asked in November, before her season starts on Dec 10).
  for (const q of ['Skaha Sled Dogs Words on February 3', 'Skaha Sled Dogs Words in Penticton on February 3', 'Skaha Sled Dogs in Penticton on February 3']) await want(q);
  for (const q of ['Book a sled dog tour in Penticton for February 3', 'sled dog ride in Penticton on January 16', 'Husky sled ride in Penticton on December 28', 'husky sled ride near Penticton on December 28', 'huskies in Penticton on January 16',
    'mushing in Penticton on February 12', 'Mushing our own dog sled team in Penticton on February 12', 'dog sledding in Penticton on January 16',
    'chiens de traîneau à Penticton le 13 février', 'traîneau à chiens à Penticton le 13 février', 'balade en traîneau à Penticton le 13 février']) await want(q);
  // Her summer product, first (before the plain farm operator and the winter-only dog-sled operator).
  for (const q of ['Puppy visit near Penticton on July 15', 'puppy visit in Penticton on July 15', 'kennel tour in Penticton on August 10 with kids', 'kennel visit in Penticton on July 15', 'visite du chenil à Penticton le 15 juillet', 'visite des chiots à Penticton le 15 juillet']) await want(q, { first: true });
  // A real dog in the party still is one.
  for (const q of ['Something to do with our dog in Penticton on January 16', 'a walk with our puppy in Penticton on July 15', 'quelque chose à faire avec notre chien à Penticton le 16 janvier']) {
    const p = await plan(q);
    if (!dogOuting(p)) bad.push(`"${q}" lost the dog: ${JSON.stringify([p.party, p.heading])}`);
    if (itemsOf(p).some((x) => x.venue.id === v.id)) bad.push(`"${q}" plans her for a dog outing`);
  }
  // The planner's own reading.
  for (const q of ['sled dog tour', 'puppy visit', 'Skaha Sled Dogs', 'husky sled ride']) {
    const r = tr.extractTripRequirements({ text: q });
    if ((r.items || []).some((i) => i.kind === 'feature' && i.value === 'dog_friendly')) bad.push(`requirements "${q}" -> dog_friendly`);
  }
  if (!(tr.extractTripRequirements({ text: 'husky sled ride in penticton' }).items || []).some((i) => i.kind === 'venue_kind' && i.value === 'snow_tour')) bad.push('husky sled ride is not the dog-sled kind');
  if (!(tr.extractTripRequirements({ text: 'puppy visit in penticton' }).items || []).some((i) => i.kind === 'venue_kind' && i.value === 'kennel_visit')) bad.push('puppy visit is not a kennel visit');
  if ((tr.extractTripRequirements({ text: 'a walk with our puppy in penticton' }).items || []).some((i) => i.value === 'kennel_visit')) bad.push('with our puppy read as a kennel visit');
  assert.deepEqual(bad, []);
});

test('tour test 8: a named place left out is judged on the asked date (closed then: says so with the day it opens again; open then: the real reason)', async () => {
  const { v } = await sledDogs();
  // Inside her yearly break (Apr 1 - Jun 14): closed for the season that day.
  const may = await plan('Skaha Sled Dogs Words on May 15');
  assert.ok(!itemsOf(may).some((x) => x.venue.id === v.id));
  assert.ok((may.warnings || []).some((w) => w.startsWith(`${v.name} is closed for the season on May 15`)), JSON.stringify(may.warnings));
  // Not named: the dog-sled request in May says when she opens again after that date (June 15), not next winter.
  const kind = await plan('dog sledding in Penticton on May 15');
  assert.ok(!(kind.warnings || []).some((w) => /reopens December 10/.test(w)), JSON.stringify(kind.warnings));
  // Open on Feb 3, but asked with a dog: not "closed for the season until December 10".
  const dog = await plan('Skaha Sled Dogs Words with our dog on February 3');
  assert.ok(!(dog.warnings || []).some((w) => /closed for the season/.test(w) && w.includes(v.name)), JSON.stringify(dog.warnings));
  if (!itemsOf(dog).some((x) => x.venue.id === v.id)) assert.ok((dog.warnings || []).includes(`${v.name} isn’t listed as dog-friendly, so it isn’t in this plan with your dog.`), JSON.stringify(dog.warnings));
  // The French wording of the new lines.
  const fr = require('../trip-french-copy.js');
  assert.match(fr.t3FrenchText(`${v.name} is closed for the season on October 10 (it opens again on December 10), so it isn’t in this plan.`), /est fermé pour la saison le 10 octobre \(il rouvre le 10 décembre\)/);
  assert.match(fr.t3FrenchText(`${v.name} isn’t listed as dog-friendly, so it isn’t in this plan with your dog.`), /n’est pas indiqué comme acceptant les chiens/);
  assert.match(fr.t3FrenchText('A 14-year-old can ride but not mush: “Mush your own team” is for 16 and up.'), /Un enfant de 14 ans peut monter dans le traîneau, mais pas le mener/);
});

// Needs server.js's tourListItemAges (the list items' own ages with their names).
test('tour test 8: "mushing with our 14-year-old" keeps her in and says a 14-year-old can ride but not mush (her list: Mush your own team, 16+)', async () => {
  const { v } = await sledDogs();
  const p = await plan('Mushing our own dog sled team in Penticton on February 12 with our 14-year-old');
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(stop, JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  const notes = JSON.stringify(stop);
  assert.match(notes, /A 14-year-old can ride but not mush: “Mush your own team” is for 16 and up\./);
  assert.doesNotMatch(notes, /Some activities are 16\+/);
  // A 16-year-old: no such note; a 2-year-old on a plain sled ride: the general line from her list (3+).
  assert.doesNotMatch(JSON.stringify(itemsOf(await plan('mushing in Penticton on February 12 with our 16-year-old')).find((x) => x.venue.id === v.id) || {}), /can ride but not mush/);
  assert.match(JSON.stringify(itemsOf(await plan('dog sledding in Penticton on February 12 with our 2-year-old')).find((x) => x.venue.id === v.id) || {}), /Some activities are 3\+/);
});
