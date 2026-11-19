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
    const v = mk({ name: k.name, cuisine: k.cuisine, description: `${k.name}, ${k.cuisine.toLowerCase()} in ${TOWN}.${kind === 'pool' ? ' A 25 m lap pool, a hot tub and a sauna.' : ''}` });
    await ok(change(tokenFor(v.id), { indoor_info: { kinds: [kind], length: '1-2h', age: kind === 'casino' ? '19' : 'all', year: 'all' } }));
    placed[kind] = v;
  }
  // Generic competitors, better rated, with no owner answers.
  for (const [nm, c, d] of [['Summerland Family Fun Centre', 'Family fun centre', 'Bowling, an arcade and laser tag for the whole family.'], ['Summerland Heritage Museum & Archives', 'Museum', 'Local history.'],
    ['Summerland Leisure Pool', 'Pool', 'A leisure pool with a waterslide.'], ['Summerland Public Art Gallery', 'Art gallery', 'Rotating exhibitions.'], ['Summerland Playhouse', 'Live theatre', 'A community theatre.']]) {
    mk({ name: nm, cuisine: c, description: d, rating: 4.8, reviews: 500, kid_friendly: 1 });
  }
  // Indoor test 10 (2026-11-19): Sports & Recreation and beaches in the same town, so the phrases they own ("swimming
  // pool", "rec centre", "climbing wall" -> Sports & Recreation; "swim" -> beaches) are read the way a real town reads them.
  for (const [nm, type, d] of [['Summerland Disc Golf Course', 'sport', 'An 18-hole disc golf course.'], ['Summerland BMX Track', 'sport', 'A BMX track.'], ['Summerland Arena', 'sport', 'An ice arena.'],
    ['Peach Orchard Beach', 'beach', 'A sandy swimming beach.'], ['Sun-Oka Beach', 'beach', 'A long sandy beach.']]) {
    mk({ name: nm, type, cuisine: null, description: d, rating: 4.7, reviews: 300 });
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

test('A named kind with nothing in the town itself takes in the towns right around it: "indoor playground Kelowna" offers the West Kelowna play centre (Build My Trip and search, EN + FR)', async () => {
  const v = app.createVenue({ slug: 'indoor-pm-wk-play', type: 'indoor', region: 'west-kelowna', name: 'Westside Kidz Play Centre', cuisine: 'Indoor playground', description: 'Indoor play centre for kids 0 to 10.',
    latitude: 49.83, longitude: -119.62, address: '2374 Bering Rd, West Kelowna, BC', phone: '250-555-0199', website: 'https://example.com', hours: DAY('09:00', '17:00'), rating: 4.4, reviews: 70 });
  await ok(change(tokenFor(v.id), { indoor_info: { kinds: ['kids'], length: '1-2h', age: 'all', year: 'all' } }));
  for (const q of ['indoor playground Kelowna', 'indoor playground in Kelowna', 'aire de jeux intérieure à Kelowna', 'aire de jeux intérieure à West Kelowna']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), `${q}: ${itemsOf(p).map((x) => x.venue.name).slice(0, 6).join(' | ')} ${(p.notes || []).join(' ')}`);
  }
  // Site search too (EN and FR).
  for (const [lang, q] of [['en', 'indoor playground Kelowna'], ['en', 'play centre in Kelowna'], ['fr', 'aire de jeux intérieure à Kelowna']]) {
    const r = await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    assert.ok(plain(await r.text()).includes('Westside Kidz Play Centre'), `search ${lang} "${q}" -> ${r.url.replace(base, '')}`);
  }
});

// Indoor test 10 (2026-11-19; Sandra's Vernon Aquatic Centre: "swimming pool Vernon", "aquatic centre" and "rec centre"
// listed disc golf and BMX in search and beaches in Build My Trip; "hot tub / sauna Vernon" planned Kelowna spas): the
// common other ways of naming each kind, English and French, with Sports & Recreation and beaches in the same town.
const SYN = {
  gallery: { en: ['art museum in {T}', 'art exhibit in {T}', 'art galleries near {T}'], fr: ['musée d’art à {T}', 'exposition d’art à {T}', 'galeries à {T}'] },
  museum: { en: ['science center {T}', 'museums near {T}', 'a museum to visit in {T}'], fr: ['un musée à {T}', 'centre des sciences à {T}', 'musées près de {T}'] },
  theatre: { en: ['playhouse in {T}', 'theater in {T}', 'watch a play in {T}'], fr: ['aller au théâtre à {T}', 'un théâtre à {T}', 'salle de théâtre à {T}'] },
  cinema: { en: ['movies in {T}', 'movie theater {T}', 'watch a film in {T}', 'see a film {T}'], fr: ['cinémas à {T}', 'aller au cinéma à {T}', 'cinéma ce soir à {T}'] },
  spa: { en: ['massage in {T}', 'nordic spa {T}', 'facial {T}'], fr: ['massage à {T}', 'spa nordique à {T}', 'soins du visage à {T}'] },
  pool: { en: ['swimming pool {T}', 'aquatic centre {T}', 'rec centre {T}', 'public swim {T}', 'aquafit {T}'], fr: ['piscine à {T}', 'centre aquatique à {T}', 'bain libre à {T}', 'aquaforme à {T}'] },
  climbing: { en: ['bouldering gym {T}', 'climbing wall {T}', 'indoor rock climbing {T}'], fr: ['escalade intérieure à {T}', 'mur d’escalade à {T}', 'centre d’escalade à {T}'] },
  games: { en: ['laser tag arena {T}', 'vr arcade {T}', 'arcade games {T}'], fr: ['jeux d’arcade à {T}', 'réalité virtuelle à {T}', 'arcade à {T}'] },
  escape: { en: ['escape game {T}', 'puzzle rooms {T}', 'escape room for 4 in {T}'], fr: ['jeu d’évasion à {T}', 'salle d’évasion à {T}', 'escape room à {T}'] },
  bowling: { en: ['bowling alley in {T}', 'ten pin bowling {T}', 'go bowling in {T}'], fr: ['salle de quilles à {T}', 'aller aux quilles à {T}', 'quilles ce soir à {T}'] },
  kids: { en: ['kids play place {T}', 'indoor play area {T}', 'toddler play {T}'], fr: ['centre de jeux pour enfants à {T}', 'jeux intérieurs à {T}', 'aire de jeux intérieure pour enfants à {T}'] },
  classes: { en: ['pottery studio {T}', 'paint night {T}', 'ceramics class {T}'], fr: ['atelier de céramique à {T}', 'soirée peinture à {T}', 'cours de poterie pour adultes à {T}'] },
  curling: { en: ['curling rink {T}', 'try curling in {T}', 'curling lessons {T}'], fr: ['jouer au curling à {T}', 'club de curling à {T}', 'curling ce samedi à {T}'] },
  yoga: { en: ['fitness class {T}', 'yoga studio {T}', 'spin class {T}', 'barre class {T}'], fr: ['cours de mise en forme à {T}', 'studio de yoga à {T}', 'pilates à {T}'] },
  casino: { en: ['slot machines {T}', 'casino night {T}', 'table games {T}'], fr: ['machines à sous à {T}', 'soirée au casino à {T}', 'tables de jeu à {T}'] },
  library: { en: ['public library {T}', 'storytime {T}', 'libraries in {T}'], fr: ['bibliothèque municipale à {T}', 'heure du conte à {T}', 'bibliothèques à {T}'] },
};
const synAsks = () => Object.entries(SYN).flatMap(([kind, k]) => ['en', 'fr'].flatMap((lang) => k[lang].map((q) => ({ kind, lang, q: q.replace('{T}', TOWN) }))));

test('Indoor test 10: every kind has 3 to 5 common synonyms in English and French', () => {
  assert.deepEqual(Object.keys(SYN).sort(), IK.INDOOR_KIND_TEXT_KINDS.filter((k) => k !== 'other').sort());
  for (const k of Object.values(SYN)) for (const l of ['en', 'fr']) assert.ok(k[l].length >= 3 && k[l].length <= 5);
});

test('Indoor test 10: Build My Trip offers each kind\'s place for its synonyms (EN + FR), first among the indoor stops, with Sports & Recreation and beaches in town', () => {
  const fails = [];
  for (const { kind, lang, q } of synAsks()) {
    const p = app.runTripPlan({ text: q }, NOW);
    const items = itemsOf(p);
    const names = items.map((x) => `${x.venue.name} [${x.venue.type}]`).slice(0, 6).join(' | ');
    if (!items.some((x) => x.venue.id === placed[kind].id)) { fails.push(`${lang} ${kind}: "${q}" leaves it out (${p.kind}: ${names || (p.notes || []).join(' ').slice(0, 120)})`); continue; }
    const first = items.find((x) => x.venue.type === 'indoor');
    if (first && !fitsKind(first.venue, kind)) fails.push(`${lang} ${kind}: "${q}" leads with ${first.venue.name}`);
    if (kind === 'pool' && items.some((x) => ['sport', 'beach'].includes(x.venue.type))) fails.push(`${lang} pool: "${q}" also lists ${names}`);
  }
  assert.deepEqual(fails, []);
});

test('Indoor test 10: site search offers each kind\'s place for its synonyms (EN + FR); "swimming pool", "aquatic centre" and "rec centre" never list disc golf or BMX', async () => {
  const fails = [];
  for (const { kind, lang, q } of synAsks()) {
    const r = await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    const h = plain(await r.text());
    if (!h.includes(placed[kind].name)) fails.push(`${lang} ${kind}: "${q}" -> ${r.url.replace(base, '')} misses it`);
    if (kind === 'pool' && /Disc Golf Course|BMX Track/.test(h)) fails.push(`${lang} pool: "${q}" lists disc golf or BMX`);
  }
  assert.deepEqual(fails, []);
});

test('Indoor test 10: a hot tub or sauna request offers the pool whose own words say it (Build My Trip and search, EN + FR), not only spas', async () => {
  for (const q of [`hot tub ${TOWN}`, `sauna in ${TOWN}`, `hot tub and sauna ${TOWN}`, `steam room ${TOWN}`, `sauna à ${TOWN}`, `bain à remous à ${TOWN}`]) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(itemsOf(p).some((x) => x.venue.id === placed.pool.id), `${q}: ${itemsOf(p).map((x) => x.venue.name).join(' | ')}`);
  }
  for (const [lang, q] of [['en', `hot tub ${TOWN}`], ['en', `sauna ${TOWN}`], ['fr', `sauna à ${TOWN}`]]) {
    const r = await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    assert.ok(plain(await r.text()).includes(placed.pool.name), `search ${lang} "${q}"`);
  }
  // "Spa day" is still a spa (a pool's sauna is not a spa day).
  const spaDay = itemsOf(app.runTripPlan({ text: `spa day in ${TOWN}` }, NOW));
  assert.ok(spaDay.some((x) => x.venue.id === placed.spa.id));
  assert.ok(!spaDay.some((x) => x.venue.id === placed.pool.id));
});

test('Indoor test 10: "swim" in winter is the pool, never a beach; in the lake season the beaches stay and come first (Build My Trip)', () => {
  for (const q of [`swim in ${TOWN}`, `swim on Christmas Day in ${TOWN}`, `go for a swim in ${TOWN} in January`, `nager à ${TOWN} en décembre`]) {
    const items = itemsOf(app.runTripPlan({ text: q }, NOW));
    assert.ok(items.some((x) => x.venue.id === placed.pool.id), `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
    assert.ok(!items.some((x) => x.venue.type === 'beach'), `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
  }
  const july = itemsOf(app.runTripPlan({ text: `swim in ${TOWN} in July` }, NOW));
  assert.equal(july[0] && july[0].venue.type, 'beach', july.map((x) => x.venue.name).join(' | '));
  assert.ok(!july.some((x) => x.venue.type === 'indoor' && x.venue.id !== placed.pool.id), july.map((x) => x.venue.name).join(' | '));
});

test('Indoor test 10: Sports & Recreation and beach searches still list what they did (disc golf, BMX, arena, beaches), and lawn bowling is never a bowling alley', async () => {
  const get = async (q) => plain(await (await fetch(`${base}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text());
  assert.match(await get(`disc golf ${TOWN}`), /Summerland Disc Golf Course/);
  assert.match(await get(`bmx ${TOWN}`), /Summerland BMX Track/);
  const sports = await get(`sports in ${TOWN}`);
  for (const n of ['Summerland Disc Golf Course', 'Summerland BMX Track', 'Summerland Arena']) assert.ok(sports.includes(n), n);
  const beaches = await get(`beaches ${TOWN}`);
  for (const n of ['Peach Orchard Beach', 'Sun-Oka Beach']) assert.ok(beaches.includes(n), n);
  assert.ok(!beaches.includes(placed.pool.name));
  assert.deepEqual(IK.indoorKindsNamedIn(`lawn bowling ${TOWN}`), []);
  assert.deepEqual(IK.indoorKindsNamedIn(`bowling green in ${TOWN}`), []);
  assert.deepEqual(IK.indoorKindsNamedIn('pool table bar'), []);
});

// Indoor test 11 (2026-11-19; Kim's science centre: "science centre Vernon" listed a weekends-only museum first, and
// "hands-on science for kids" missed her): within a kind, the place whose name or own lines say the request's own words
// comes first, in a list and as the itinerary's pick. Every kind: two places of the kind in one town, the better-rated one
// without the word; the request names the word.
const OWN = {
  gallery: ['Watercolour', 'watercolour gallery in {T}'], museum: ['Dinosaur', 'dinosaur museum {T}'], theatre: ['Shakespeare', 'shakespeare theatre in {T}'], cinema: ['IMAX', 'imax cinema {T}'],
  spa: ['Salt Cave', 'salt cave spa {T}'], pool: ['Diving', 'diving pool in {T}'], climbing: ['Ninja', 'ninja climbing gym {T}'], games: ['Pinball', 'pinball arcade {T}'],
  escape: ['Heist', 'heist escape room {T}'], bowling: ['Candlepin', 'candlepin bowling {T}'], kids: ['Ball Pit', 'ball pit indoor playground {T}'], classes: ['Glassblowing', 'glassblowing class {T}'],
  curling: ['Bonspiel', 'bonspiel curling club {T}'], yoga: ['Aerial', 'aerial yoga class {T}'], casino: ['Blackjack', 'blackjack casino {T}'], library: ['Makerspace', 'makerspace library {T}'],
};
test('Indoor test 11: within a kind, the place whose name or own lines say the request\'s words comes first (Build My Trip list and day plan), every kind', async () => {
  const T2 = 'Peachland', R2 = 'peachland', fails = [];
  const want = {};
  for (const [kind, [word]] of Object.entries(OWN)) {
    const k = KINDS[kind], i = Object.keys(OWN).indexOf(kind);
    // The better-rated one first (plain), then hers (her word in the name for half the kinds, in her story for the rest).
    const plainV = app.createVenue({ slug: `indoor-pm-own-a-${kind}`, type: 'indoor', region: R2, name: `Peachland ${k.cuisine} ${i}`, cuisine: k.cuisine, description: `A ${k.cuisine.toLowerCase()} in ${T2}.`,
      latitude: 49.77 + i / 2000, longitude: -119.73, address: `${200 + i} Beach Ave, Peachland, BC`, phone: '250-555-0166', website: 'https://example.com', hours: DAY('10:00', '20:00'), rating: 4.9, reviews: 900, kid_friendly: 1 });
    const own = app.createVenue({ slug: `indoor-pm-own-b-${kind}`, type: 'indoor', region: R2, name: i % 2 ? `${word} ${k.cuisine} House` : `Lakeside ${k.cuisine} Co ${i}`, cuisine: k.cuisine,
      description: i % 2 ? `A ${k.cuisine.toLowerCase()} in ${T2}.` : `A ${k.cuisine.toLowerCase()} in ${T2}, known for its ${word.toLowerCase()} nights.`,
      latitude: 49.771 + i / 2000, longitude: -119.731, address: `${300 + i} Beach Ave, Peachland, BC`, phone: '250-555-0167', website: 'https://example.com', hours: DAY('10:00', '20:00'), rating: 4.0, reviews: 20, kid_friendly: 1 });
    for (const x of [plainV, own]) await ok(change(tokenFor(x.id), { indoor_info: { kinds: [kind], length: '1-2h', age: kind === 'casino' ? '19' : 'all', year: 'all' } }));
    want[kind] = own;
  }
  for (const [kind, [, q0]] of Object.entries(OWN)) {
    const q = q0.replace('{T}', T2);
    const items = itemsOf(app.runTripPlan({ text: q }, NOW)).filter((x) => x.venue.region === R2 && x.venue.type === 'indoor');
    if (!items.length || items[0].venue.id !== want[kind].id) fails.push(`list ${kind}: "${q}" -> ${items.map((x) => x.venue.name).slice(0, 4).join(' | ')}`);
    const dq = `${q} on Saturday afternoon`;
    const di = itemsOf(app.runTripPlan({ text: dq }, NOW)).filter((x) => x.venue.region === R2 && x.venue.type === 'indoor');
    if (di.length && di[0].venue.id !== want[kind].id) fails.push(`day ${kind}: "${dq}" -> ${di.map((x) => x.venue.name).slice(0, 4).join(' | ')}`);
  }
  assert.deepEqual(fails, []);
});

// Indoor test 12 (2026-11-19; Jess: "yoga class in Kelowna Saturday morning" became a day in three towns, her studio at 1 PM
// and a drive to Peachland for dinner). "<activity> in <town> <day> <daypart>" for several kinds, EN + FR, with and without
// the town (Peachland, next door, has a place of every kind now): the place of the asked kind is in the daypart asked, the
// request stays one activity (no day plan), and with a town every stop is in that town.
const DAYPART = [
  ['yoga', 'yoga class in {T} Saturday morning', 'morning'], ['yoga', 'cours de yoga à {T} samedi matin', 'morning'], ['yoga', 'yoga Saturday morning', 'morning'],
  ['bowling', 'bowling in {T} Friday evening', 'evening'], ['bowling', 'quilles à {T} vendredi soir', 'evening'], ['bowling', 'bowling Friday evening', 'evening'],
  ['museum', 'museum in {T} Sunday afternoon', 'afternoon'], ['museum', 'musée à {T} dimanche après-midi', 'afternoon'], ['museum', 'museum Sunday afternoon', 'afternoon'],
  ['spa', 'spa in {T} Saturday afternoon', 'afternoon'], ['escape', 'escape room in {T} Friday evening', 'evening'], ['cinema', 'cinéma à {T} samedi soir', 'evening'],
];
test('Indoor test 12: "<activity> in <town> <day> morning/afternoon/evening" puts that kind\'s place in that part of the day, one activity, in the town asked (EN + FR)', () => {
  const fails = [];
  for (const [kind, q0, part] of DAYPART) {
    const q = q0.replace('{T}', TOWN), townAsked = q0.includes('{T}');
    const p = app.runTripPlan({ text: q }, NOW);
    const items = itemsOf(p);
    const hit = items.find((x) => x.venue.type === 'indoor' && fitsKind(x.venue, kind));
    if (p.kind === 'day_plan') fails.push(`${kind}: "${q}" is a day plan (${items.map((x) => x.venue.name).join(' | ')})`);
    if (!hit) { fails.push(`${kind}: "${q}" has no ${kind} (${items.map((x) => x.venue.name).join(' | ')})`); continue; }
    if (hit.daypart && hit.daypart !== part) fails.push(`${kind}: "${q}" puts ${hit.venue.name} in the ${hit.daypart}`);
    if (townAsked && items.some((x) => x.venue.region !== REGION)) fails.push(`${kind}: "${q}" goes to ${items.filter((x) => x.venue.region !== REGION).map((x) => `${x.venue.name} (${x.venue.region})`).join(', ')}`);
  }
  assert.deepEqual(fails, []);
});
