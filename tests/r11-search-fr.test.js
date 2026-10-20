// Round 11 (2026-10-20), search-fr: /map search words ("show", "free", « gratuit », « magie », "musical", whole-word
// names, coffee before gelato), /search false positives (kids menu, kids show, dance party, pumpkin patch, opera,
// Christmas markets, "stand", « spectacle d'humour », « en direct », « cirque »), the French closure label on list
// cards, French dates (« 1er »), French dog-rule tooltips on venue pages, and help-bot topics.
// Runs on a throwaway, fixture-seeded database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.OKR_TODAY_OVERRIDE = '2026-10-19';
process.env.DISCOVERY_SEARCH = 'on';

const app = require('../server.js');
const db = require('../db.js');

// Places and events for the whole file (events four days out, so they fall in this week's map and What's On).
const DAY = app.addLocalDays(app.todayLocal(), 4);
const VENUES = [
  { name: 'R11 Kids Diner', region: 'kelowna', type: 'restaurant', description: 'A kids menu and crayons at every table.', kid_friendly: 1 },
  { name: 'R11 Fruit Stand', region: 'kelowna', type: 'tour', description: 'A roadside fruit stand.' },
  { name: 'R11 Pumpkin Farm', region: 'kelowna', type: 'tour', description: 'Pick your own pumpkins in October.' },
  { name: 'R11 Free Gallery', region: 'kelowna', type: 'indoor', description: 'A small public gallery.', free_entry: 1 },
  { name: 'R11 Dog Beach', region: 'osoyoos', type: 'beach', description: 'A sandy beach.', dog_friendly: 1, slug: 'r11-dog-beach', description_fr: 'Une plage de sable.' },
];
const EVENTS = [
  ['R11 Wine Dinner', 'A five-course menu paired with wines.', ['food-drink'], 'oliver'],
  ['R11 Kids Magic Show', 'A family show for kids with a magician.', ['family-kids', 'arts-culture'], 'kelowna'],
  ['R11 Ballet Gala', 'The ballet company dances three new works.', ['arts-culture'], 'kelowna'],
  ['R11 Halloween Dance', 'A community dance party with a DJ.', ['community-events'], 'osoyoos'],
  ['R11 Drag Queen Halloween Spooktacular', 'A drag comedy show with pumpkin carving jokes.', ['arts-culture', 'holiday-seasonal'], 'kelowna'],
  ['R11 Pumpkin Bash', 'Games for families.', ['family-kids'], 'oliver'],
  ['R11 Halloween Party', 'Costumes, music and a pumpkin on every table.', ['holiday-seasonal'], 'kelowna'],
  ['R11 Buena Vista Orchestra', 'Cuban son, salsa and bolero from Havana.', ['live-music'], 'kelowna'],
  ['R11 Symphony Concert', 'The Okanagan Symphony Orchestra plays Beethoven.', ['live-music'], 'kelowna'],
  ['R11 German Christmas Market', 'Crafts, gifts and mulled wine.', ['markets-fairs', 'holiday-seasonal'], 'kelowna'],
  ['R11 Christmas Craft Fair', 'Local makers and bakers.', ['markets-fairs'], 'penticton'],
  ['R11 A Christmas Twist', 'A Christmas comedy play at the theatre.', ['arts-culture'], 'oliver'],
  ['R11 Holiday Concert', 'Carols and a choir.', ['live-music', 'holiday-seasonal'], 'kelowna'],
  ['R11 Danny Bhoy Live', 'Stand-up comedy from the Scottish comedian.', ['arts-culture'], 'kelowna'],
  ['R11 Big Top Circus', 'Acrobats and clowns under the big top.', ['arts-culture'], 'kelowna'],
  ['R11 Frozen the Musical', 'The Broadway musical on stage.', ['arts-culture'], 'kelowna'],
  ['R11 Holiday Magic Market', 'Crafts and gifts.', ['markets-fairs'], 'vernon'],
];
for (const row of VENUES) {
  const r = { rating: 4.3, reviews: 40, address: '1 Test St', latitude: 49.888, longitude: -119.496, ...row };
  r.slug = r.slug || app.slugify(r.name);
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO venues (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => r[c]));
}
for (const [name, description, cats, region] of EVENTS) {
  const eid = db.prepare('INSERT INTO events (name, slug, region, description, start_datetime) VALUES (?, ?, ?, ?, ?)').run(name, app.slugify(name), region, description, `${DAY} 19:00:00`).lastInsertRowid;
  db.prepare('INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(eid, DAY, DAY, '19:00', '21:00');
  cats.forEach((c, i) => db.prepare('INSERT INTO event_categories (event_id, category_key, position) VALUES (?, ?, ?)').run(eid, c, i));
}

// Gyro Beach's dog rule, on the dog-friendly list (its French is in data/french/notes-2026-10-17.json).
const DOG_NOTE = 'Secluded dog swimming area behind the museum; otherwise not in the park June–Aug except walkways';
{
  const cid = db.prepare("INSERT INTO collections (slug, kind, title, region) VALUES ('r11-dog-friendly', 'dog_friendly', 'R11 Dog Friendly', NULL)").run().lastInsertRowid;
  const vid = db.prepare('SELECT id FROM venues WHERE slug = ?').get('r11-dog-beach').id;
  db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id, position, note) VALUES (?, 'venue', ?, 1, ?)").run(cid, vid, DOG_NOTE);
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
const r11 = (list) => list.map((x) => x.name || (x.row && x.row.name)).filter((n) => /^R11 /.test(n));
const plan = (q, lang = 'en') => app.smartSearchPlan(app.discoverySearchText(q, lang));
const planEvents = (q, lang = 'en') => { const p = plan(q, lang); assert.ok(p && p.events, `a plan with events for ${q}`); return r11(p.events().items); };
const searchEvents = (html) => [...html.matchAll(/<ul class="search-event-list">([\s\S]*?)<\/ul>/g)].map((m) => m[1]).join('')
  .match(/R11 [^<]+/g) || [];

// ---------- /search ----------

test('/search: "kids menu" lists kid-friendly places and no wine dinners', async () => {
  const html = await get('/search?q=kids%20menu');
  assert.ok(html.includes('R11 Kids Diner'));
  assert.ok(!html.includes('R11 Wine Dinner'), 'the events half respects the Kid-Friendly badge');
  const ev = app.searchTextEvents(app.interpretDiscoveryText('kids menu'));
  assert.deepEqual(r11(ev.items), []);
});

test('/search: "kids show" lists the shows for kids, not every kid-friendly place; in French too', async () => {
  assert.equal(plan('kids show').key, 'topic_kids_show');
  assert.deepEqual(planEvents('kids show'), ['R11 Kids Magic Show']);
  assert.deepEqual(planEvents('spectacle pour enfants', 'fr'), ['R11 Kids Magic Show']);
  const html = await get('/search?q=kids%20show');
  assert.match(html, /Shows for kids/);
  assert.ok(!html.includes('R11 Kids Diner'), 'not the kid-friendly places');
  assert.match(await get('/fr/search?q=spectacle%20pour%20enfants'), /Spectacles pour enfants/);
});

test('/search: "dance party" lists the dances, not the ballet; "dance" keeps both', () => {
  assert.equal(plan('dance party').key, 'topic_dance_party');
  assert.deepEqual(planEvents('dance party'), ['R11 Halloween Dance']);
  assert.deepEqual(planEvents('soirée dansante', 'fr'), ['R11 Halloween Dance']);
  assert.deepEqual(planEvents('dance').sort(), ['R11 Ballet Gala', 'R11 Halloween Dance']);
});

test('/search: "pumpkin patch" / « citrouilles » events are pumpkin events, not a drag show or a party with a pumpkin', () => {
  for (const [q, lang] of [['pumpkin patch'], ['citrouilles', 'fr']]) {
    const list = planEvents(q, lang);
    assert.ok(list.includes('R11 Pumpkin Bash'), q);
    assert.ok(!list.includes('R11 Drag Queen Halloween Spooktacular') && !list.includes('R11 Halloween Party'), `${q}: ${list.join(' | ')}`);
  }
});

test('/search: "opera" and "classical" leave out the Buena Vista Orchestra (Cuban son)', () => {
  for (const q of ['opera', 'classical']) {
    const list = planEvents(q);
    assert.ok(list.includes('R11 Symphony Concert'), q);
    assert.ok(!list.includes('R11 Buena Vista Orchestra'), `${q}: ${list.join(' | ')}`);
  }
});

test('/search: Christmas markets are the guide or the markets alone, with a town label, in English and French', async () => {
  const guideLive = app.liveGuides().some((g) => g.path === '/guides/okanagan-christmas-markets');
  for (const [q, lang] of [['christmas market'], ['christmas markets'], ['marché de Noël', 'fr'], ['xmas markets']]) {
    const p = plan(q, lang);
    if (guideLive) { assert.equal(p.url, '/guides/okanagan-christmas-markets', q); continue; }
    assert.equal(p.key, 'christmas_markets', q);
    assert.deepEqual(r11(p.events().items).sort(), ['R11 Christmas Craft Fair', 'R11 German Christmas Market', 'R11 Holiday Magic Market'], q);
  }
  // A town: that town's markets, under its own heading (not "Places in Kelowna").
  const k = plan('christmas markets kelowna');
  assert.equal(k.key, 'christmas_markets');
  assert.equal(k.heading, 'Christmas markets in Kelowna');
  assert.equal(k.headingFr, 'Marchés de Noël à Kelowna');
  assert.deepEqual(r11(k.events().items), ['R11 German Christmas Market'], 'no concert, play or other town');
  const html = await get('/search?q=christmas%20markets%20kelowna');
  assert.match(html, /showing <strong>Christmas markets in Kelowna<\/strong>/);
  assert.match(await get('/fr/search?q=march%C3%A9%20de%20No%C3%ABl%20%C3%A0%20Kelowna'), /Marchés de Noël à Kelowna/);
  assert.equal(app.searchIsXmasMarket({ name: 'Holiday Magic Market', categories: ['markets-fairs'] }), true);
  assert.equal(app.searchIsXmasMarket({ name: 'Christmas Market Concert', categories: ['live-music'] }), false);
});

test('/search: "stand" finds fruit stands, not stand-up comedy', async () => {
  const html = await get('/search?q=stand');
  assert.ok(html.includes('R11 Fruit Stand'));
  assert.ok(!html.includes('R11 Danny Bhoy Live'), 'a stand-up description is not a stand');
  assert.deepEqual(r11(app.searchEventsFor({ terms: ['stand'] }).items), []);
  assert.deepEqual(r11(app.searchEventsFor({ terms: ['stand', 'up'] }).items), ['R11 Danny Bhoy Live'], '"stand up" still finds it');
});

test('/fr/search: « spectacle d’humour » keeps its apostrophe; « en direct » is live music; « cirque » finds the circus', async () => {
  assert.equal(app.frSearchTermLabel('comedy', "spectacle d'humour"), "spectacle d'humour");
  assert.equal(app.frSearchTermLabel('comedy', 'spectacle d’humour'), 'spectacle d’humour');
  const html = await get(`/fr/search?q=${encodeURIComponent("spectacle d'humour")}`);
  assert.ok(!/« spectacle d humour »/.test(html), 'not « spectacle d humour »');
  assert.equal(app.discoverySearchText('en direct', 'fr'), 'live music');
  assert.equal(app.discoverySearchText('musique en direct', 'fr'), 'live music');
  assert.doesNotMatch(await get('/fr/search?q=en%20direct'), /« direct »/);
  for (const [q, lang] of [['cirque', 'fr'], ['circus'], ['acrobats']]) {
    assert.equal(plan(q, lang).key, 'topic_circus', q);
    assert.deepEqual(planEvents(q, lang), ['R11 Big Top Circus'], q);
  }
  assert.match(await get('/fr/search?q=cirque'), /Cirque et acrobaties/);
});

// ---------- /map ----------

// The map's own reading of a search (from "Plain words become filters" to the end of readSearch), run in a VM
// with the page's real config and the visitor's filters as plain objects.
async function mapReader(lang = 'en') {
  const html = await get(lang === 'fr' ? '/fr/map' : '/map');
  const CONF = JSON.parse(html.match(/CONF = (\{.*?\});/)[1]);
  const m = html.match(/<script type="application\/json" id="pmFrWords">([\s\S]*?)<\/script>/);
  const list = m ? m[1] : null;
  const src = html.slice(html.indexOf('  // Plain words become filters'), html.indexOf('  var timer = null;'));
  const ctx = {
    CONF, FR: lang === 'fr', T: { priceLbl: { cheap: 1, afford: 1, fancy: 1 } }, places: [], radiusSel: {},
    document: { getElementById: (id) => (id === 'pmFrWords' && list ? { textContent: list } : null) },
    okanaganClock: () => ({ minutes: 600, weekday: 'mon' }), WEEK: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  };
  vm.runInNewContext(`var kinds = {}, feats = {}, tags = {}, notTags = {}, notKinds = {}, notFeats = {}, notTypes = {}, topOnly = false, openOnly = false, town = '', price = '',
    atMin = null, atDay = '', atUntil = false, tagOr = false, term = '', termTyping = false, radiusKm = 5, radiusFixed = false;
    function on(o){ return Object.keys(o).filter(function(k){ return o[k]; }); }
    function onTags(){ return Object.keys(tags).filter(function(k){ return tags[k]; }); }
    ${src}
    this.read = function(q){ lastSearchSet = null; liveBase = null; kinds = {}; feats = {}; tags = {}; term = ''; readSearch(q, false);
      return JSON.stringify({ kinds: on(kinds), feats: on(feats), term: term, events: wantEvents, kinds2: evFilt.slice(), said: evSaid.slice() }); };`, ctx);
  return { read: (q) => JSON.parse(ctx.read(q)), html, CONF };
}

test('/map: "show" / "show me" open the events; "show me wineries" stays wineries; "kids show" is the shows for kids', async () => {
  const { read } = await mapReader();
  for (const q of ['show', 'show me', 'shows', 'a show tonight']) assert.equal(read(q).events, true, q);
  const wine = read('show me wineries');
  assert.equal(wine.events, false);
  assert.deepEqual(wine.kinds, ['wine']);
  const kids = read('kids show');
  assert.equal(kids.events, true);
  assert.deepEqual(kids.kinds2, ['kids_show']);
  assert.deepEqual(kids.feats, [], 'Kids welcome is not left on for the places');
  assert.deepEqual(read('magic show').kinds2, ['magic']);
  assert.deepEqual(read('musical').kinds2, ['musical']);
  assert.deepEqual(read('circus').kinds2, ['circus']);
});

test('/map: "free", "free things" and « gratuit » turn on Free to visit; "gluten free" and "free parking" do not', async () => {
  const en = await mapReader(), fr = await mapReader('fr');
  for (const q of ['free', 'free things', 'free things to do', 'free stuff']) assert.deepEqual(en.read(q).feats, ['free'], q);
  for (const q of ['gratuit', 'activités gratuites', 'choses gratuites']) assert.deepEqual(fr.read(q).feats, ['free'], q);
  assert.deepEqual(en.read('gluten free').feats, ['gf']);
  assert.deepEqual(en.read('free parking').feats, []);
  assert.equal(en.CONF.f.free, 16384);
  assert.match(en.html, /data-pm-feat="free"/);
  // The data carries the bit for a free place.
  const data = JSON.parse(await get('/map/data.json'));
  const gallery = data.p.find((p) => p[2] === 'R11 Free Gallery');
  assert.ok(gallery && (gallery[7] & 16384), 'Free to visit bit');
});

test('/fr/map: « magie » finds the magic shows and says « magie »; « musique en direct » is live music with nothing left over', async () => {
  const fr = await mapReader('fr');
  const magie = fr.read('magie');
  assert.equal(magie.events, true);
  assert.deepEqual(magie.kinds2, ['magic']);
  assert.deepEqual(magie.said, ['magie'], 'the message uses the visitor’s word');
  assert.equal(fr.read('spectacle de magie').events, true);
  const live = fr.read('musique en direct');
  assert.deepEqual(live.feats, ['music']);
  assert.equal(live.term, '', 'nothing claimed as ignored');
  assert.deepEqual(fr.read('en direct').feats, ['music']);
  // Each event carries the kinds it is, so the map filters by them.
  const data = JSON.parse(await get('/map/data.json'));
  const kindsOf = (name) => (data.e.find((e) => e[0] === name) || [])[12] || [];
  assert.ok(kindsOf('R11 Kids Magic Show').includes('magic') && kindsOf('R11 Kids Magic Show').includes('kids_show'));
  assert.ok(kindsOf('R11 Frozen the Musical').includes('musical'));
  assert.ok(!kindsOf('R11 Holiday Magic Market').includes('magic'), 'a market named Magic is not a magic show');
  assert.ok(kindsOf('R11 Big Top Circus').includes('circus'));
});

test('/map: names match whole words (spa is not Spaghetti or Sparks), plurals and, while typing, the start of the last word', () => {
  const { mapNameKey, mapNameHas } = new Function(`${app.MAP_NAME_MATCH_SRC}\nreturn { mapNameKey, mapNameHas };`)();
  const has = (name, w, typing) => mapNameHas(mapNameKey(name), w, typing);
  assert.equal(has('Spaghetti Factory', 'spa'), false);
  assert.equal(has('Twin Sparks', 'spa'), false);
  assert.equal(has('Kelowna Nordic Spa', 'spa'), true);
  assert.equal(has('Okanagan Spas', 'spa'), true);
  assert.equal(has('Quails’ Gate Winery', "quail's gate"), true);
  assert.equal(has('Café Ricardo', 'cafe'), true);
  assert.equal(has('Mission Hill Family Estate', 'mission hil'), false);
  assert.equal(has('Mission Hill Family Estate', 'mission hil', true), true, 'the last word while typing');
});

test('/map: "coffee" lists coffee places before gelato shops filed as cafés', () => {
  const pick = new Function(`${app.MAP_PLACE_LIST_SRC}\n${app.MAP_COFFEE_FIT_SRC}\nreturn { mapPlaceList, mapCoffeeFit };`)();
  const ix = Object.fromEntries(app.MAP_TAGS.map((t, i) => [t.key, i]));
  const P = (name, tags) => ({ name, r: 4.5, st: { state: 'open' }, tg: tags.map((k) => ix[k]) });
  const list = [P('Alpha Gelato', ['icecream']), P('Bean There Coffee', []), P('Corner Bubble Tea', ['bubbletea']), P('Daily Grind', ['specialty']), P('Echo Bakery Cafe', ['bakery'])];
  const out = pick.mapPlaceList(list, { town: 'kelowna', fit: (p) => pick.mapCoffeeFit(p, ix) }).map((p) => p.name);
  assert.deepEqual(out, ['Bean There Coffee', 'Daily Grind', 'Echo Bakery Cafe', 'Alpha Gelato', 'Corner Bubble Tea']);
  // Without a fit (any other search), the order is as before.
  assert.deepEqual(pick.mapPlaceList(list, { town: 'kelowna' }).map((p) => p.name)[0], 'Alpha Gelato');
});

// ---------- French text ----------

test('French list cards: a closure note reads « Fermé du 11 oct. au 3 nov. », as on the venue page', () => {
  assert.equal(app.frStatusText('Closed today (Closed Oct 11 - Nov 3)'), 'Fermé du 11 oct. au 3 nov.');
  assert.equal(app.frStatusText('Closed today (Closed Oct 11 – Nov 3) · Opens Wed 9 AM'), 'Fermé du 11 oct. au 3 nov. · ouvre mer. à 9 h');
  assert.equal(app.frStatusText('Closed today (Closed Nov 1 - 3)'), 'Fermé du 1er au 3 nov.');
  assert.equal(app.frStatusText('Closed today (holiday)'), 'Fermé aujourd’hui (jour férié)');
  assert.equal(app.frStatusText('Closed today'), 'Fermé aujourd’hui');
});

test('French dates: the 1st is « 1er » (« dim. 1er nov. », « jusqu’au 1er nov. »), and « de » elides before a vowel', () => {
  assert.equal(app.frDateShort('2026-11-01'), 'dim. 1er nov.');
  assert.equal(app.frDateShort('2026-11-02'), 'lun. 2 nov.');
  assert.equal(app.frTidy('Vernon, jusqu’au 1 nov.'), 'Vernon, jusqu’au 1er nov.');
  assert.equal(app.frTidy('du 30 oct. au 1 nov.'), 'du 30 oct. au 1er nov.');
  assert.equal(app.frTidy('le 11 nov. et le 21 nov.'), 'le 11 nov. et le 21 nov.', 'only the 1st');
  assert.equal(app.frTidy('les vignobles de Osoyoos et de Oliver'), 'les vignobles d’Osoyoos et d’Oliver');
  assert.equal(app.frTidy('près de Kelowna'), 'près de Kelowna');
});

test('French guide lines: a space before the colon after the town', () => {
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'guides-1.json'), 'utf8'));
  const bad = Object.values(list).filter((v) => /^\(\{T\}\):/.test(v));
  assert.deepEqual(bad, []);
});

test('French venue page: the dog chip’s tooltip is the French dog rule', async () => {
  const fr = app.frText(DOG_NOTE);
  assert.ok(fr && fr !== DOG_NOTE);
  const html = await get('/fr/osoyoos/beaches/r11-dog-beach');
  assert.ok(html.includes(`title="${app.escapeHtml(fr)}"`), 'French tooltip');
  assert.ok(!html.includes('Secluded dog swimming area'));
  assert.ok((await get('/osoyoos/beaches/r11-dog-beach')).includes('Secluded dog swimming area'), 'the English page keeps the English rule');
});

// ---------- Help bot ----------

function ohbMatcher(page, opts = {}) {
  const html = app.ownerHelpWidgetHtml(page, opts);
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const ctx = { T: cfg.topics, cfg };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  return (q) => ctx.best(q);
}

test('Help bot: privacy alone, who is Okanagan Roam, Boxing Day hours, "is this a scam", and open all year first', () => {
  const en = ohbMatcher('edit'), fr = ohbMatcher('edit', { lang: 'fr' }), login = ohbMatcher('login');
  for (const m of [en, fr, login]) {
    for (const [q, id] of [
      ['privacy', 'privacy'], ['confidentialité', 'privacy'], ['who can see my login', 'login-privacy'],
      ['c’est qui okanagan roam', 'about'], ["c'est qui okanagan roam", 'about'], ['who is okanagan roam', 'about'], ['who are you', 'about'],
      ['how do i change my hours for boxing day', 'closures'], ['boxing day hours', 'closures'], ['heures du lendemain de Noël', 'closures'],
      ['is this a scam', 'scam'], ['est-ce une arnaque', 'scam'], ['is this legit', 'scam'],
      ['we are open year round now', 'year-round'], ['nous sommes ouverts toute l’année', 'year-round'], ['ouvert à l’année maintenant', 'year-round'],
      ['we are closed in winter', 'season'], ['how do I change my hours', 'hours'], ['is this free', 'cost'],
    ]) assert.equal(m(q).id, id, q);
  }
  const t = Object.fromEntries(JSON.parse(app.ownerHelpWidgetHtml('edit', { signedIn: true }).match(/id="ohbCfg">([\s\S]*?)<\/script>/)[1]).topics.map((x) => [x.id, x]));
  const firstP = (h) => h.slice(0, h.indexOf('</p>'));
  assert.match(firstP(t['year-round'].a), /<strong>Season<\/strong> to <strong>Open all year<\/strong>/, 'the year-round step comes first');
  assert.match(firstP(t['year-round'].aFr), /<strong>Saison<\/strong> sur <strong>Ouvert toute l’année<\/strong>/);
  assert.match(t.scam.a, /free guide to the Okanagan run by Dayton/);
  assert.match(t.scam.aFr, /guide gratuit de l’Okanagan tenu par Dayton/);
});
