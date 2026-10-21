// Round 13 (2026-10-20), Roam Now (/map): event pins through the planner's event-location resolver and known host
// points, wider and better-ranked hikes, comedy and New Year's Eve searches, French no-results wording, the phone sheet
// (notice vs handle, the « 0 événements » count) and the map starting before app.js.
// Runs on a throwaway, fixture-seeded database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');
const { mapEventPin, mapPointNames } = require('../map-event-pins.js');

const DAY = app.addLocalDays(app.todayLocal(), 1);
const VENUES = [
  { name: 'R13 Pine and Cedar Hall', region: 'kelowna', type: 'indoor', latitude: 49.881, longitude: -119.471 },
  { name: 'R13 Knox Peak Mountain Park', region: 'kelowna', type: 'outdoor', latitude: 49.912, longitude: -119.486, description: 'Trails up to the lookout.' },
  { name: 'R13 Rotary Marsh Park', region: 'kelowna', type: 'outdoor', latitude: 49.889, longitude: -119.494, description: 'A boardwalk trail through the marsh.' },
  { name: 'R13 Bird Wetland Sanctuary', region: 'kelowna', type: 'outdoor', latitude: 49.874, longitude: -119.49, description: 'A short walkway trail.' },
  { name: 'R13 Cosens Bay', region: 'kelowna', type: 'beach', latitude: 49.9, longitude: -119.45, description: 'A quiet bay.' },
];
const EVENTS = [
  // [name, venue text, region, description, categories, date]
  ['R13 Hockey Night', 'Kal Tire Place, 3445 43 Ave', 'vernon', 'Junior hockey.', ['sports-recreation']],
  ['R13 Big Concert', 'Prospera Place', 'kelowna', 'A concert.', ['live-music']],
  ['R13 Hall Supper', 'R13 Pine & Cedar Hall, 12 Main St, Kelowna', 'kelowna', 'A community supper.', ['community-events']],
  ['R13 Rec Centre Fair', 'Vernon Recreation Centre (Creekside Conference Centre), 3310 37th Ave, Vernon', 'vernon', 'A craft fair.', ['community-events']],
  ['R13 Food Drive', 'Various locations', 'kelowna', 'Drop off food.', ['community-events']],
  ['R13 Wrong Town', 'Kal Tire Place', 'kelowna', 'Not in Vernon.', ['community-events']],
  ['R13 Laugh Riot', 'R13 Pine & Cedar Hall', 'kelowna', 'Three stand-up comedians on one bill.', ['arts-culture', 'nightlife']],
  ['R13 Improv Night', 'R13 Pine & Cedar Hall', 'kelowna', 'Improv games with the crowd.', ['arts-culture']],
];
const ids = {};
for (const row of VENUES) {
  const r = { address: '1 Test St', ...row };
  r.slug = app.slugify(r.name);
  const cols = Object.keys(r);
  ids[r.name] = db.prepare(`INSERT INTO venues (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => r[c])).lastInsertRowid;
}
const collectionId = (kind) => db.prepare('SELECT id FROM collections WHERE kind = ? ORDER BY id LIMIT 1').get(kind).id;
db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id) VALUES (?, 'venue', ?)").run(collectionId('local_favorite'), ids['R13 Knox Peak Mountain Park']);
db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id) VALUES (?, 'venue', ?)").run(collectionId('activity_hiking'), ids['R13 Cosens Bay']);
for (const [name, venue, region, description, cats, date] of EVENTS) {
  const d = date || DAY;
  const eid = db.prepare('INSERT INTO events (name, slug, region, description, start_datetime, venue_name_text) VALUES (?, ?, ?, ?, ?, ?)').run(name, app.slugify(name), region, description, `${d} 19:00:00`, venue).lastInsertRowid;
  db.prepare('INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(eid, d, d, '19:00', '21:00');
  cats.forEach((c, i) => db.prepare('INSERT INTO event_categories (event_id, category_key, position) VALUES (?, ?, ?)').run(eid, c, i));
}

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  srv.closeAllConnections();
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const get = async (p) => {
  const res = await fetch(base + p);
  assert.equal(res.status, 200, `${p} -> ${res.status}`);
  return res.text();
};
const mapData = async () => JSON.parse(await get('/map/data.json'));

// The map's word reading, run as the page runs it (as the round 12 map tests do).
async function mapReader(lang = 'en') {
  const html = await get(lang === 'fr' ? '/fr/map' : '/map');
  const conf = JSON.parse(html.match(/CONF = (\{.*?\});/)[1]);
  const m = html.match(/<script type="application\/json" id="pmFrWords">([\s\S]*?)<\/script>/);
  const list = m ? JSON.parse(m[1]) : null;
  const document = { getElementById: (id) => (id === 'pmFrWords' && list ? { textContent: JSON.stringify(list) } : null) };
  const ctx = { CONF: conf, document, FR: lang === 'fr', okanaganClock: () => ({ minutes: 600 }), WEEK: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], NEG: ' no not without except avoid never nothing sans pas ni aucun aucune ' };
  vm.runInNewContext(`${html.slice(html.indexOf('  // Plain words become filters'), html.indexOf('  var wantNear = false;'))}; this.parseWords = parseWords; this.WORD_TO = WORD_TO;`, ctx);
  return { html, conf, ctx, read: (q) => ctx.parseWords(q).map((w) => (w[0] === '#' ? `#${conf.tg[Number(w.slice(1))].k}` : ctx.WORD_TO[w] || w)).join(' ') };
}
const inlineScripts = (html) => html.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0]);

// ---------- 1. Event pins ----------

test('map-event-pins: venue text is read by its name, without the town, the street address or a "(...)"', () => {
  assert.deepEqual(mapPointNames('Vernon Recreation Centre (Creekside Conference Centre), 3310 37th Ave, Vernon', ['Vernon']).slice(-3),
    ['vernon recreation centre creekside conference centre', 'vernon recreation centre', 'creekside conference centre']);
  assert.ok(mapPointNames('Black Box Theatre, Kelowna', ['Kelowna']).includes('black box theatre'));
  assert.ok(mapPointNames('Steady Effort Yoga, 106-1641 Dartmouth Rd, Penticton', ['Penticton']).includes('steady effort yoga'));
  // Known points only in their own town; a vague place never.
  assert.ok(mapEventPin({ venue_name_text: 'Kal Tire Place, 3445 43 Ave', region: 'vernon' }, [], ['Vernon']));
  assert.equal(mapEventPin({ venue_name_text: 'Kal Tire Place', region: 'kelowna' }, [], ['Kelowna']), null);
  assert.equal(mapEventPin({ venue_name_text: 'Various locations', region: 'kelowna' }, [], ['Kelowna']), null);
  // Every point in the data file is inside the Okanagan and named.
  for (const p of require('../data/event-map-points.json').points) {
    assert.ok(p.lat > 48.95 && p.lat < 50.8 && p.lng > -120.2 && p.lng < -118.25, JSON.stringify(p));
    assert.ok(p.names.length && p.source, JSON.stringify(p));
  }
});

test('/map: events at Kal Tire Place, Prospera Place, a "&" listing and the Vernon Recreation Centre get pins; vague ones do not', async () => {
  const data = await mapData();
  const ev = (n) => data.e.find((e) => e[0] === n);
  const near = (e, lat, lng) => e && Math.abs(e[4] - lat) < 0.001 && Math.abs(e[5] - lng) < 0.001;
  assert.ok(near(ev('R13 Hockey Night'), 50.27556, -119.27806), JSON.stringify(ev('R13 Hockey Night')));
  assert.ok(near(ev('R13 Big Concert'), 49.89258, -119.4954), 'Prospera Place, from the planner’s curated hosts');
  assert.ok(near(ev('R13 Hall Supper'), 49.881, -119.471), '"&" as "and", "Name, street address" -> the listing');
  assert.ok(near(ev('R13 Rec Centre Fair'), 50.26843, -119.27582));
  for (const n of ['R13 Food Drive', 'R13 Wrong Town']) assert.equal(ev(n)[4], null, n);
});

// ---------- 2. Search: hikes, comedy, New Year's Eve, French ----------

test('/map: a Hiking & Trails listing counts as a hike, and Local Favourites ship as [15]', async () => {
  const data = await mapData();
  const conf = (await mapReader()).conf;
  const hiking = conf.tg.findIndex((t) => t.k === 'hiking');
  const place = (n) => data.p.find((p) => p[2] === n);
  assert.ok(place('R13 Cosens Bay')[10].includes(hiking), 'a beach on the Hiking & Trails list');
  const tagsOf = (v) => app.mapPlaceTags({ cuisine: '', ...v }).map((i) => app.MAP_TAGS[i].key);
  assert.ok(tagsOf({ name: 'Kalamoir Regional Park', type: 'beach', description: 'Swim, then take the trails up the bluff.' }).includes('hiking'));
  assert.ok(!tagsOf({ name: 'Kalamoir Regional Park', type: 'beach', description: 'A sandy swimming beach.' }).includes('hiking'));
  assert.ok(!tagsOf({ name: 'Gyro Beach', type: 'beach', description: 'Near the trail.' }).includes('hiking'));
  assert.equal(place('R13 Knox Peak Mountain Park')[15], 1);
  assert.equal(place('R13 Rotary Marsh Park')[15], 0);
});

test('/map: "hikes" ranks a mountain park (a Local Favourite) above a nearer marsh and wetland', async () => {
  const { html } = await mapReader();
  const ctx = {};
  const src = (re) => html.match(re)[0];
  vm.runInNewContext(`${src(/function mapPlaceList\(onMap, o\)\{[\s\S]*?\n  \}/)}\n${src(/function mapHikeCost\(p\)\{[\s\S]*?\n  \}/)}\nthis.mapPlaceList = mapPlaceList; this.mapHikeCost = mapHikeCost;`, ctx);
  const ps = [
    { name: 'Rotary Marsh Park', d: 0.9, lf: 0, r: 0, st: null },
    { name: 'Maude-Roxby Wetland (Bird Sanctuary)', d: 2.0, lf: 0, r: 0, st: null },
    { name: 'Knox Mountain Park', d: 4.0, lf: 1, r: 0, st: { state: 'open' } },
    { name: 'Dilworth Mountain Park', d: 4.7, lf: 0, r: 0, st: null },
  ];
  const near = ctx.mapPlaceList(ps, { me: true, cost: ctx.mapHikeCost }).map((p) => p.name);
  assert.equal(near[0], 'Knox Mountain Park', near.join(' | '));
  assert.ok(near.indexOf('Dilworth Mountain Park') < near.indexOf('Rotary Marsh Park'), near.join(' | '));
  const inTown = ctx.mapPlaceList(ps, { town: 'kelowna', cost: ctx.mapHikeCost }).map((p) => p.name);
  assert.equal(inTown[0], 'Knox Mountain Park', inTown.join(' | '));
  // The list uses it for hikes, and a short list near the visitor offers the next distance.
  assert.ok(html.includes('cost: tags.hiking ? mapHikeCost : null'));
  assert.match(html, /moreNear: function\(n, r\)\{ return n \+ ' more within ' \+ r \+ ' km'; \}/);
  assert.match((await mapReader('fr')).html, /moreNear: function\(n, r\)\{ return n === 1 \? '1 autre à moins de '/);
});

test('/map: comedy words and New Year’s Eve (EN and FR) open the Events tab by kind', async () => {
  const en = await mapReader('en'), fr = await mapReader('fr');
  assert.equal(en.read('comedy'), 'comedy');
  assert.equal(en.read('stand-up'), 'standup');
  assert.equal(en.read('stand up paddle'), 'stand up paddle', 'paddling is not comedy');
  for (const q of ["new year's eve", 'new years eve', 'New Years', 'NYE', 'nye party']) assert.equal(en.read(q), 'nye', q);
  for (const q of ['réveillon', "jour de l'An", 'Saint-Sylvestre']) assert.equal(fr.read(q), 'nye', q);
  assert.equal(fr.read('humour'), 'comedy');
  assert.match(en.html, /comedy: 'comedy', comedian: 'comedy', comedians: 'comedy', standup: 'comedy', improv: 'comedy', nye: 'new_years' \}/);
  // The events carry the kinds: comedy by the site search's test, a Dec 31 night as New Year's Eve.
  const data = await mapData();
  const kinds = (n) => (data.e.find((e) => e[0] === n) || [])[12] || [];
  assert.ok(kinds('R13 Laugh Riot').includes('comedy'), JSON.stringify(kinds('R13 Laugh Riot')));
  assert.ok(kinds('R13 Improv Night').includes('comedy'));
  // A night out on Dec 31 is a New Year's Eve event (the map holds 7 days, so this is checked directly).
  assert.equal(app.mapIsDec31Night({ startDate: '2026-12-31', endDate: '2027-01-01', categories: ['nightlife'] }), true);
  assert.equal(app.mapIsDec31Night({ startDate: '2026-12-31', endDate: '2026-12-31', categories: ['sports-recreation'] }), false);
  assert.equal(app.mapIsDec31Night({ startDate: '2026-11-21', endDate: '2026-12-31', categories: ['holiday-seasonal'] }), false, 'a run that ends Dec 31');
  assert.ok(!kinds('R13 Hall Supper').includes('comedy'));
  // New Year's Eve links to the search's New Year's Eve list, in French on /fr/map.
  assert.ok(en.html.includes("'/search?q=' + encodeURIComponent('new years eve')"));
  assert.match(fr.html, /nyeEvents: function\(n, href\)\{ return \(n \? 'Les événements du réveillon de la semaine sont dans l’onglet Événements\.'/);
});

test('/fr/map: the no-results message and the event counts are in French, and 0 reads « Aucun événement »', async () => {
  const fr = await mapReader('fr'), en = await mapReader('en');
  assert.ok(fr.html.includes('T.noName(FR && typedWords ? typedWords : term)'));
  const fn = (html, key) => { const ctx = {}; vm.runInNewContext(`this.f = ${html.match(new RegExp(`${key}: (function\\(n(?:, r)?\\)\\{[^\\n]*?; \\})`))[1]}`, ctx); return ctx.f; };
  const frCount = fn(fr.html.slice(fr.html.indexOf('var T = FR ?')), 'eventsCount'), enCount = fn(en.html.slice(en.html.indexOf('} : {', en.html.indexOf('var T = FR ?'))), 'eventsCount');
  assert.equal(frCount(0), 'Aucun événement cette semaine');
  assert.equal(frCount(2), '2 événements cette semaine');
  assert.equal(enCount(0), 'No events this week');
  assert.equal(enCount(1), '1 event this week');
  const frNear = fn(fr.html.slice(fr.html.indexOf('var T = FR ?')), 'eventsNear');
  assert.equal(frNear(0, 5), 'Aucun événement à moins de 5 km cette semaine');
});

// ---------- 3. Phone layout ----------

test('/map phone: a notice never covers the sheet handle, and the count stays on two lines at most', async () => {
  const html = await get('/map');
  assert.match(html, /\.pm-sheet \{[^}]*max-height: calc\(100% - var\(--pm-float-h, 20px\)\)/);
  assert.match(html, /function floatGap\(\)\{[^\n]*--pm-float-h/);
  assert.match(html, /function setStatus\(text, ms\)\{[^\n]*floatGap\(\);/);
  assert.match(html, /@media \(max-width: 400px\) \{\s*body\.map-page \.pm-count \{[^}]*-webkit-line-clamp: 2/);
});

// ---------- 4. Speed ----------

test('/map: the map starts before app.js runs; other pages keep app.js', async () => {
  for (const p of ['/map', '/fr/map']) {
    const html = await get(p);
    const leaflet = html.indexOf('leaflet.min.js"></script>'), mapInit = html.indexOf('var CONF = '), appJs = html.search(/<script src="\/scripts\/app\.js[^"]*"><\/script>/);
    assert.ok(leaflet > 0 && mapInit > leaflet && appJs > mapInit, `${p}: leaflet ${leaflet}, map ${mapInit}, app.js ${appJs}`);
    assert.match(html, /<link rel="preload" as="script" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.js">/);
    for (const s of inlineScripts(html)) new vm.Script(s);
  }
  assert.match(await get('/kelowna'), /<script src="\/scripts\/app\.js[^"]*"><\/script>/);
});
