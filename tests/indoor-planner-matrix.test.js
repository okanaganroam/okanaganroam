// Indoor test 9 (2026-11-19; Melissa's indoor play centre in West Kelowna: « aire de jeux intérieure à West Kelowna » found
// nothing in French Build My Trip, and "indoor playground Kelowna" read only "indoor" and left out her place next door).
// One place of EVERY indoor kind (indoor-kinds.js) in one town, among generic competitors, and three natural visitor
// requests per kind in English and three in French. Build My Trip and the site search (English /search, French
// /fr/search) must offer that kind's place for each request, and Build My Trip's first indoor stop must be of that kind.
// A named kind with nothing in the town itself takes in the towns right around it (Kelowna ↔ West Kelowna).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-planner-matrix-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const IK = require('../indoor-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const TOWN = 'Summerland', REGION = 'summerland';
// Every kind: a name and category a real place of that kind would have, and its requests ({T} is the town).
const KINDS = {
  gallery: { name: 'Summit Art Gallery', cuisine: 'Art gallery', en: ['art gallery in {T}', 'art galleries {T}', 'gallery to visit in {T}'], fr: ['galerie d’art à {T}', 'galeries d’art à {T}', 'une galerie à {T}'] },
  museum: { name: 'Prairie Valley Museum', cuisine: 'Museum', en: ['museum in {T}', 'science centre {T}', 'museums to visit in {T}'], fr: ['musée à {T}', 'musées à {T}', 'centre des sciences à {T}'] },
  theatre: { name: 'Lakeview Stage Theatre', cuisine: 'Live theatre', en: ['live theatre in {T}', 'theatre in {T}', 'see a play in {T}'], fr: ['théâtre à {T}', 'pièce de théâtre à {T}', 'salle de spectacle à {T}'] },
  cinema: { name: 'Bluebird Picture House', cuisine: 'Movie theatre', en: ['movie theatre in {T}', 'cinema {T} saturday night', 'see a movie in {T}'], fr: ['cinéma à {T} samedi soir', 'salle de cinéma à {T}', 'voir un film à {T}'] },
  spa: { name: 'Cedar Day Spa', cuisine: 'Day spa', en: ['spa in {T}', 'couples massage {T}', 'day spa {T}'], fr: ['spa à {T}', 'massage en couple à {T}', 'spa de jour à {T}'] },
  pool: { name: 'Summerland Aquatic Centre', cuisine: 'Pool', en: ['lane swim in {T}', 'rec centre {T}', 'indoor pool {T}'], fr: ['piscine intérieure à {T}', 'bain libre à {T}', 'centre aquatique à {T}'] },
  climbing: { name: 'Granite Bouldering Co', cuisine: 'Climbing gym', en: ['climbing gym in {T}', 'bouldering {T}', 'trampoline park {T}'], fr: ['salle d’escalade à {T}', 'escalade de bloc à {T}', 'parc de trampolines à {T}'] },
  games: { name: 'Pixel Arcade & Laser Tag', cuisine: 'Arcade', en: ['arcade in {T}', 'laser tag {T}', 'virtual reality {T}'], fr: ['salle d’arcade à {T}', 'laser tag à {T}', 'réalité virtuelle à {T}'] },
  escape: { name: 'Locked In Rooms', cuisine: 'Escape room', en: ['escape room in {T}', 'escape rooms {T}', 'puzzle room {T}'], fr: ['jeu d’évasion à {T}', 'salle d’évasion à {T}', 'escape game à {T}'] },
  bowling: { name: 'Strike Lanes', cuisine: 'Bowling alley', en: ['bowling in {T}', 'bowling alley {T}', '5 pin bowling {T}'], fr: ['quilles à {T}', 'salle de quilles à {T}', 'jouer aux quilles à {T}'] },
  kids: { name: 'Jungle Jim’s Play Place', cuisine: 'Indoor playground', en: ['indoor playground in {T}', 'play centre {T}', 'soft play {T}'], fr: ['aire de jeux intérieure à {T}', 'centre de jeux à {T}', 'parc intérieur pour enfants à {T}'] },
  classes: { name: 'Clay & Brush Studio', cuisine: 'Pottery studio', en: ['pottery class in {T}', 'paint your own pottery {T}', 'art class {T}'], fr: ['atelier de poterie à {T}', 'cours de peinture à {T}', 'cours de poterie à {T}'] },
  curling: { name: 'Summerland Curling Club', cuisine: 'Curling club', en: ['curling in {T}', 'learn to curl {T}', 'curling club {T}'], fr: ['curling à {T}', 'initiation au curling à {T}', 'club de curling à {T}'] },
  yoga: { name: 'Lotus Yoga Loft', cuisine: 'Yoga studio', en: ['yoga class in {T}', 'hot yoga {T}', 'pilates {T}'], fr: ['yoga à {T}', 'cours de yoga à {T}', 'yoga chaud à {T}'] },
  casino: { name: 'Lucky Spur Casino', cuisine: 'Casino', en: ['casino in {T}', 'slots {T}', 'poker {T}'], fr: ['casino à {T}', 'machines à sous à {T}', 'poker à {T}'] },
  library: { name: 'Summerland Branch Library', cuisine: 'Library', en: ['library in {T}', 'story time {T}', 'public library {T}'], fr: ['bibliothèque à {T}', 'heure du conte à {T}', 'bibliothèque publique à {T}'] },
  other: { name: 'Rainy Day Fun Hub', cuisine: 'Indoor activity', en: ['indoor activities in {T}', 'rainy day in {T}', 'things to do when it rains in {T}'], fr: ['activités intérieures à {T}', 'jour de pluie à {T}', 'quoi faire quand il pleut à {T}'] },
};

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (o) => app.createVenue({ slug: `indoor-pm-${++n}`, type: 'indoor', region: REGION, latitude: 49.6 + n / 3000, longitude: -119.67, address: `${100 + n} Main St, Summerland, BC`,
  phone: '250-555-0177', website: 'https://example.com', hours: DAY('10:00', '20:00'), rating: 4.3, reviews: 60, ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.97.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const plain = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const TR = require('../trip-requirements.js');
// The planner kinds a listed place is (its owner's kinds, else its own words), and the planner kind of each indoor kind.
const plannerKindsOf = (pv) => { const v = app.getVenue(pv.id); const k = app.venueIndoorInfo(v.id).kinds; return TR.inferPlannerKinds({ ...v, ...(Array.isArray(k) ? { indoorKinds: k } : {}) }); };
const fitsKind = (pv, kind) => plannerKindsOf(pv).some((k) => (TR.INDOOR_KIND_PLANNER[kind] || []).includes(k));

const placed = {};
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  for (const [kind, k] of Object.entries(KINDS)) {
    const v = mk({ name: k.name, cuisine: k.cuisine, description: `${k.name}, ${k.cuisine.toLowerCase()} in ${TOWN}.` });
    await ok(change(tokenFor(v.id), { indoor_info: { kinds: [kind], length: '1-2h', age: kind === 'casino' ? '19' : 'all', year: 'all' } }));
    placed[kind] = v;
  }
  // Generic competitors, better rated, with no owner answers.
  for (const [nm, c, d] of [['Summerland Family Fun Centre', 'Family fun centre', 'Bowling, an arcade and laser tag for the whole family.'], ['Summerland Heritage Museum & Archives', 'Museum', 'Local history.'],
    ['Summerland Leisure Pool', 'Pool', 'A leisure pool with a waterslide.'], ['Summerland Public Art Gallery', 'Art gallery', 'Rotating exhibitions.'], ['Summerland Playhouse', 'Live theatre', 'A community theatre.']]) {
    mk({ name: nm, cuisine: c, description: d, rating: 4.8, reviews: 500, kid_friendly: 1 });
  }
});
test.after(() => srv && srv.close());

const asks = () => Object.entries(KINDS).flatMap(([kind, k]) => ['en', 'fr'].flatMap((lang) => k[lang].map((q) => ({ kind, lang, q: q.replace('{T}', TOWN) }))));

test('Every indoor kind in indoor-kinds.js is in the planner matrix, with 3 English and 3 French requests', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), IK.INDOOR_KIND_TEXT_KINDS.slice().sort());
  for (const k of Object.values(KINDS)) { assert.equal(k.en.length, 3); assert.equal(k.fr.length, 3); }
});

test('Build My Trip: every kind\'s place is offered for its EN and FR requests, and the first indoor stop is that kind', () => {
  const fails = [];
  for (const { kind, lang, q } of asks()) {
    const p = app.runTripPlan({ text: q }, NOW);
    const items = itemsOf(p);
    const names = items.map((x) => x.venue.name).slice(0, 6).join(' | ');
    // A plain indoor or rainy-day request ("other") is no one kind: it lists indoor places (at least three), in French too.
    if (kind === 'other') { if (items.filter((x) => x.venue.type === 'indoor').length < 3) fails.push(`${lang} other: "${q}" lists ${names || 'nothing'}`); continue; }
    if (!items.some((x) => x.venue.id === placed[kind].id)) { fails.push(`${lang} ${kind}: "${q}" leaves it out (${p.kind}: ${names || (p.notes || []).join(' ').slice(0, 120)})`); continue; }
    const first = items.find((x) => x.venue.type === 'indoor');
    if (first && !fitsKind(first.venue, kind)) fails.push(`${lang} ${kind}: "${q}" leads with ${first.venue.name} (${plannerKindsOf(first.venue).join(', ')})`);
  }
  assert.deepEqual(fails, []);
});

test('Site search (/search and /fr/search): every kind\'s place is offered for its EN and FR requests', async () => {
  const fails = [];
  for (const { kind, lang, q } of asks()) {
    const r = await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    const h = plain(await r.text());
    if (!h.includes(placed[kind].name.replace(/’/g, '’'))) fails.push(`${lang} ${kind}: "${q}" -> ${r.url.replace(base, '')} misses it`);
  }
  assert.deepEqual(fails, []);
});

test('A named kind with nothing in the town itself takes in the towns right around it: "indoor playground Kelowna" offers the West Kelowna play centre (EN + FR)', async () => {
  const v = app.createVenue({ slug: 'indoor-pm-wk-play', type: 'indoor', region: 'west-kelowna', name: 'Westside Kidz Play Centre', cuisine: 'Indoor playground', description: 'Indoor play centre for kids 0 to 10.',
    latitude: 49.83, longitude: -119.62, address: '2374 Bering Rd, West Kelowna, BC', phone: '250-555-0199', website: 'https://example.com', hours: DAY('09:00', '17:00'), rating: 4.4, reviews: 70 });
  await ok(change(tokenFor(v.id), { indoor_info: { kinds: ['kids'], length: '1-2h', age: 'all', year: 'all' } }));
  for (const q of ['indoor playground Kelowna', 'indoor playground in Kelowna', 'aire de jeux intérieure à Kelowna', 'aire de jeux intérieure à West Kelowna']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), `${q}: ${itemsOf(p).map((x) => x.venue.name).slice(0, 6).join(' | ')} ${(p.notes || []).join(' ')}`);
  }
});
