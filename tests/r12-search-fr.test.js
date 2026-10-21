// Round 12 (2026-10-20), search-fr: the French Contact dialog (hints, checks and the server's messages), French dog
// searches, partial last words ("pizz", "piza") on /search and /map, Christmas markets and hikes on /map, search false
// positives (kids' shows, "ron james", "spa", New Year's Eve, « pâtisserie »), the French menu labels, the homepage
// Favorites link, « 1er » on /fr/map, the help bot's dated closures, and « de l’Okanagan ».
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

const DAY = app.addLocalDays(app.todayLocal(), 4);
const VENUES = [
  { name: 'R12 Wood Oven Pizza', region: 'kelowna', type: 'restaurant', cuisine: 'Pizza', description: 'Wood-fired pizza and salads.' },
  { name: 'R12 Sushi House', region: 'kelowna', type: 'restaurant', cuisine: 'Sushi', description: 'Sushi rolls and sashimi.' },
  { name: 'R12 Spaghetti Factory', region: 'kelowna', type: 'restaurant', cuisine: 'Italian', description: 'Spaghetti and meatballs.' },
  { name: 'R12 Cedar Day Spa', region: 'kelowna', type: 'indoor', description: 'A day spa with a cedar sauna and a steam room.' },
  { name: 'R12 Family YMCA', region: 'kelowna', type: 'indoor', description: 'Pool, sauna and steam room for members.' },
  { name: 'R12 Aquatic Centre', region: 'kelowna', type: 'indoor', description: 'A lane pool, a hot pool and a sauna.' },
  { name: 'R12 Lakeshore Park', region: 'lake-country', type: 'outdoor', description: 'A quiet shore with a view across to James Grant Island.' },
  { name: 'R12 New Garden Restaurant', region: 'oliver', type: 'restaurant', description: 'New dishes every week.' },
  { name: 'R12 Dog Patio Pub', region: 'kelowna', type: 'pub', description: 'Beer on the patio.', dog_friendly: 1 },
  { name: 'R12 Dog Beach', region: 'penticton', type: 'beach', description: 'A sandy beach.', dog_friendly: 1 },
  { name: 'R12 Ridge Trail', region: 'kelowna', type: 'outdoor', description: 'A hiking trail up the ridge to a lookout.' },
  { name: 'R12 Outdoor Rink', region: 'kelowna', type: 'outdoor', description: 'An outdoor skating rink beside the park trails.' },
  { name: 'R12 Rose Gardens', region: 'kelowna', type: 'outdoor', description: 'Rose gardens with a short walking trail.' },
  { name: 'R12 Golf Course', region: 'kelowna', type: 'golf', slug: 'r12-golf-course', description: 'An 18-hole course.', description_fr: 'Le plus long des deux parcours du Okanagan Golf Club.' },
  { name: 'R12 Corner Bakery', region: 'vernon', type: 'cafe', cuisine: 'Bakery', description: 'Bread, croissants and pastries.' },
  { name: 'R12 French Bistro', region: 'kelowna', type: 'restaurant', slug: 'r12-french-bistro', description: 'A small bistro.', description_fr: 'Un petit bistro.' },
];
const EVENTS = [
  ['Live Music: R12 Solo Act at the Cider House', 'A one-man band plays in the lounge. Free, no cover, family-friendly; reserve a table.', ['live-music', 'food-drink-events']],
  ['R12 Community Rocks: Benefit Concert', 'A day of live music raising money for families hit by the fire. Entry is by donation.', ['live-music', 'community-events']],
  ['R12 PedalFest at the Ridge', 'An enduro mountain bike race. Categories include women, men, youth under 18 and e-bike.', ['live-music', 'sports-recreation']],
  ['R12 Comedy Hypnosis Show', 'A comedy hypnotist brings his clean, interactive show; volunteers from the crowd become the stars.', ['arts-culture', 'nightlife', 'family-kids']],
  ['R12 Puppet Show for Kids', 'A puppet show for kids and their families.', ['family-kids', 'arts-culture']],
  ['Ron James: R12 The Noise Between Our Ears', 'Ron James brings his new stand-up show to the theatre.', ['arts-culture', 'nightlife']],
  ["R12 New Year's Eve Gala", 'Dinner, a band and a midnight toast.', ['holiday-seasonal', 'food-drink-events']],
  ['R12 German Christmas Market', 'Crafts, gifts and mulled wine.', ['markets-fairs', 'holiday-seasonal']],
];
for (const row of VENUES) {
  const r = { rating: 4.3, reviews: 40, address: '1 Test St', latitude: 49.888, longitude: -119.496, ...row };
  r.slug = r.slug || app.slugify(r.name);
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO venues (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => r[c]));
}
for (const [name, description, cats] of EVENTS) {
  const eid = db.prepare('INSERT INTO events (name, slug, region, description, start_datetime) VALUES (?, ?, ?, ?, ?)').run(name, app.slugify(name), 'kelowna', description, `${DAY} 19:00:00`).lastInsertRowid;
  db.prepare('INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)').run(eid, DAY, DAY, '19:00', '21:00');
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
const r12 = (list) => list.map((x) => x.name || (x.row && x.row.name)).filter((n) => /R12 /.test(n));
const plan = (q, lang = 'en') => app.smartSearchPlan(app.discoverySearchText(q, lang));
const planEvents = (q, lang = 'en') => { const p = plan(q, lang); assert.ok(p && p.events, `a plan with events for ${q}`); return r12(p.events().items); };
const cardNames = (html) => [...html.matchAll(/data-venue-name="([^"]*)"/g)].map((m) => m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'));

// ---------- 1. Contact dialog ----------

test('Contact: the French place page’s dialog has French hints and checks, and asks for French replies', async () => {
  const html = await get('/fr/kelowna/restaurants/r12-french-bistro');
  const script = html.slice(html.indexOf("getElementById('contactDialog')"));
  assert.match(script, /TOPIC_HINTS = \{ venue: 'Le plus rapide : utilisez le formulaire <a href="\/fr\/list-your-venue">Inscrire votre établissement<\/a>/);
  for (const fr of ['Entrez votre nom.', 'Entrez votre adresse courriel.', 'Dites-nous ce que vous voulez nous écrire.', 'Envoi en cours…']) assert.ok(script.includes(fr), fr);
  for (const en of ['Quickest: use', 'Please enter your name.', 'Please enter your email address.', 'Sorry, something went wrong']) assert.ok(!script.includes(`'${en}`), en);
  assert.ok(script.includes("'/api/contact' + (document.documentElement.lang === 'fr' ? '?lang=fr' : '')"));
  // The app sign-up dialog's own lines too.
  assert.ok(html.includes("'Désolés, impossible de joindre Okanagan Roam. Réessayez.'"));
  // A translated French page keeps its French dialog; the English one stays English.
  assert.ok((await get('/fr/kelowna')).includes("'Entrez votre nom.'"));
  assert.ok((await get('/kelowna/restaurants/r12-french-bistro')).includes("'Please enter your name.'"));
});

test('Contact: /api/contact?lang=fr answers in French (nothing is sent: every request here fails a check)', async () => {
  const post = (q, body, headers = { Origin: base }) => fetch(`${base}/api/contact${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const bad = { name: '', email: 'nope', message: 'hi', topic: 'general', started_at: Date.now() - 20000, company_website: '' };
  const fr = await post('?lang=fr', bad);
  assert.equal(fr.status, 400);
  assert.equal(fr.body.error, 'Corrigez les champs signalés.');
  assert.deepEqual(fr.body.errors, { name: 'Entrez votre nom.', email: 'Entrez une adresse courriel valide, comme nom@exemple.com.', message: 'Votre message doit compter au moins 10 caractères.' });
  const en = await post('', bad);
  assert.equal(en.body.errors.name, 'Please enter your name.');
  assert.equal((await post('?lang=fr', bad, { Origin: 'https://elsewhere.example' })).body.error, 'Les messages ne sont acceptés que depuis le site Okanagan Roam.');
  assert.equal((await post('?lang=fr', { ...bad, started_at: Date.now() })).body.error, 'C’était très rapide. Vérifiez vos renseignements et appuyez de nouveau sur Envoyer.');
  // Every message the handler can send has its French.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function handleContactMessage('), src.indexOf('// ---------- Owner portal (2026-10-15)'));
  const v = src.slice(src.indexOf('function validateContactMessage('), src.indexOf('function buildContactEmail('));
  const plain = [...`${fn}\n${v}`.matchAll(/(?:error|errors\.\w+) ?[:=] '([^']+)'/g)].map((m) => m[1]);
  assert.ok(plain.length >= 15, `found ${plain.length}`);
  for (const m of plain) assert.ok(app.CONTACT_MESSAGES_FR[m], `French for: ${m}`);
});

// ---------- 2. French dog searches ----------

test('French dog searches read as the dog-friendly badge, like "dog friendly"', async () => {
  const en = cardNames(await get('/search?q=dog%20friendly')).filter((n) => /R12 /.test(n)).sort();
  assert.deepEqual(en, ['R12 Dog Beach', 'R12 Dog Patio Pub']);
  for (const q of ['chiens acceptés', 'accepte les chiens', 'chiens bienvenus', 'chien', 'qui acceptent les chiens']) {
    assert.match(app.discoverySearchText(q, 'fr'), /^dog( friendly)?$/, q);
    const fr = cardNames(await get(`/fr/search?q=${encodeURIComponent(q)}`)).filter((n) => /R12 /.test(n)).sort();
    assert.deepEqual(fr, en, q);
  }
});

// ---------- 3. Partial words ----------

test('A partial last word reads as the search word it starts; whole words first (spa is never Spaghetti)', async () => {
  const targets = ['pizza', 'pizzeria', 'winery', 'wineries', 'sushi', 'cafe', 'cafes', 'burger', 'burgers', 'spa', 'spas', 'spaghetti'];
  const known = new Set(['spa', 'spas', 'pizza', 'cafe']);
  const fix = (w) => app.searchShortWord(w, targets, (x) => known.has(x));
  assert.deepEqual(['pizz', 'winer', 'sush', 'caf', 'burg', 'piza', 'spa', 'pizza', 'xy'].map(fix), ['pizza', 'winery', 'sushi', 'cafe', 'burger', 'pizza', null, null, null]);
  for (const [q, name] of [['pizz', 'R12 Wood Oven Pizza'], ['piza', 'R12 Wood Oven Pizza'], ['sush', 'R12 Sushi House'], ['burg', null]]) {
    const html = await get(`/search?q=${q}`);
    if (name) {
      assert.ok(cardNames(html).includes(name), `${q} -> ${name}`);
      assert.match(html, new RegExp(`We read “${q}” as “`));
    }
  }
  const fr = await get('/fr/search?q=pizz');
  assert.match(fr, /Nous avons lu « pizz » comme « pizza »/);
  // "spa" keeps whole words: no Spaghetti, and no public pools or gyms.
  const spa = cardNames(await get('/search?q=spa'));
  assert.ok(spa.includes('R12 Cedar Day Spa'), spa.join(' | '));
  for (const n of ['R12 Spaghetti Factory', 'R12 Family YMCA', 'R12 Aquatic Centre']) assert.ok(!spa.includes(n), n);
  assert.ok(!cardNames(await get('/search?q=spas')).includes('R12 Family YMCA'));
});

// The /map search's word reading, run as the page runs it (as the round 8 map test does).
async function mapReader(lang = 'en') {
  const html = await get(lang === 'fr' ? '/fr/map' : '/map');
  const conf = JSON.parse(html.match(/CONF = (\{.*?\});/)[1]);
  const m = html.match(/<script type="application\/json" id="pmFrWords">([\s\S]*?)<\/script>/);
  const list = m ? JSON.parse(m[1]) : null;
  const document = { getElementById: (id) => (id === 'pmFrWords' && list ? { textContent: JSON.stringify(list) } : null) };
  const ctx = { CONF: conf, document, FR: lang === 'fr', okanaganClock: () => ({ minutes: 600 }), WEEK: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], NEG: ' no not without except avoid never nothing sans pas ni aucun aucune ' };
  vm.runInNewContext(`${html.slice(html.indexOf('  // Plain words become filters'), html.indexOf('  var wantNear = false;'))}; this.parseWords = parseWords; this.WORD_TO = WORD_TO; this.shortWordFix = shortWordFix; this.fixTypos = fixTypos; this.getTypo = function(){ return TYPO; };`, ctx);
  return { html, conf, ctx, read: (q) => ctx.parseWords(q).map((w) => (w[0] === '#' ? `#${conf.tg[Number(w.slice(1))].k}` : ctx.WORD_TO[w] || w)).join(' ') };
}

test('/map: Search with a partial last word reads it as the word it starts, and only when nothing matches as typed', async () => {
  const { html, ctx, read } = await mapReader();
  for (const [q, want] of [['pizz', 'pizza'], ['winer', 'winery'], ['sush', 'sushi'], ['caf', 'cafe'], ['burg', 'burger'], ['piza', 'pizza']]) {
    const sw = ctx.shortWordFix(q);
    assert.ok(sw, q);
    assert.equal(ctx.parseWords(sw.text).length, 1, q);
    assert.ok(read(sw.text) !== q, `${q} -> ${sw.text} is a word the map reads (${read(sw.text)})`);
    assert.equal(sw.text.replace(/s$/, ''), want.replace(/s$/, ''), q);
  }
  assert.equal(ctx.shortWordFix('spa'), null, 'spa stays spa');
  // The fallback runs on Search only after the words as typed found nothing.
  assert.match(html, /if \(term && !wantEvents && !places\.some\(matchesPlace\)\) \{\s*var sw = shortWordFix\(v\);/);
  for (const s of html.split(/<script[^>]*>/).slice(1).map((x) => x.split('</script>')[0]).filter((x) => x.includes('shortWordFix'))) new vm.Script(s);
});

// ---------- 4. /map: Christmas markets, musicals, hikes ----------

test('/map: Christmas markets open the Events tab with the guide link, in French on /fr/map; musicals keep the French words', async () => {
  const en = await mapReader('en'), fr = await mapReader('fr');
  assert.equal(fr.read('marché de Noël'), 'christmas market');
  // Round 14 (2026-10-20): a third argument (soon) once the weeks after this one are loaded (/map/ahead.json).
  assert.match(en.html, /xmasMarkets: function\(n, href, soon\)\{ return \(n \? \(soon \? 'Upcoming Christmas markets are on the Events tab\.' : 'This week’s Christmas markets are on the Events tab\.'\)/);
  assert.match(fr.html, /xmasMarkets: function\(n, href, soon\)\{ return \(n \? \(soon \? 'Les marchés de Noël à venir sont dans l’onglet Événements\.' : 'Les marchés de Noël de la semaine sont dans l’onglet Événements\.'\)/);
  assert.ok(fr.html.includes("T.xmasMarkets(all, (FR ? '/fr' : '') + '/guides/okanagan-christmas-markets', soon)"));
  // The map's events carry the Christmas-market kind.
  const data = JSON.parse(await get('/map/data.json'));
  const market = data.e.find((e) => e[0] === 'R12 German Christmas Market');
  assert.ok(market && Array.isArray(market[12]) && market[12].includes('xmas_market'), JSON.stringify(market));
  // « comédie musicale » is named in French in the note.
  fr.ctx.fixTypos('x');
  assert.equal(fr.ctx.getTypo().fr.musical, 'comédie musicale');
});

test('/map: "hike" / « randonnée » are the trails, not a rink, a garden or a sports centre', async () => {
  const { read } = await mapReader('en'), frm = await mapReader('fr');
  assert.equal(read('hike'), '#hiking');
  assert.equal(read('hiking trails'), '#hiking');
  assert.equal(frm.read('randonnée'), '#hiking');
  const tagsOf = (v) => app.mapPlaceTags({ cuisine: '', description: '', ...v }).map((i) => app.MAP_TAGS[i].key);
  assert.ok(tagsOf({ name: 'Ridge Trail', type: 'outdoor', description: 'A hiking trail up the ridge.' }).includes('hiking'));
  for (const v of [{ name: 'Stuart Park Outdoor Rink', type: 'outdoor', description: 'Skating beside the park trails.' }, { name: 'Rose Gardens', type: 'outdoor', description: 'A short walking trail.' },
    { name: 'Lakefront Sports Centre', type: 'outdoor', description: 'Fields and trails.' }, { name: 'Trail Pub', type: 'pub', description: 'Near the trail.' }]) assert.ok(!tagsOf(v).includes('hiking'), v.name);
});

// ---------- 5. Search false positives ----------

test('/search: kids’ shows are children’s and family shows only (in English and French)', async () => {
  for (const [q, lang] of [['kids show'], ['spectacle pour enfants', 'fr'], ['spectacles enfants', 'fr']]) {
    assert.deepEqual(planEvents(q, lang), ['R12 Puppet Show for Kids'], q);
  }
  const html = await get('/fr/search?q=spectacles%20enfants');
  assert.match(html, /Spectacles pour enfants/);
  assert.ok(!html.includes('R12 Comedy Hypnosis Show'));
});

test('/search: an event’s name lists that event, not places sharing one word ("ron james", New Year’s Eve)', async () => {
  const rj = await get('/search?q=ron%20james');
  assert.ok(rj.includes('R12 The Noise Between Our Ears'));
  assert.ok(!cardNames(rj).includes('R12 Lakeshore Park'), 'not the park with James Grant Island in its blurb');
  for (const [q, lang] of [['new years eve'], ['réveillon', 'fr'], ['Saint-Sylvestre', 'fr'], ['la Saint-Sylvestre', 'fr']]) {
    const p = plan(q, lang);
    assert.ok(p && p.events, q);
    assert.deepEqual(r12(p.events().items), ["R12 New Year's Eve Gala"], q);
    const html = await get(`${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`);
    assert.ok(!cardNames(html).includes('R12 New Garden Restaurant'), q);
  }
});

test('/fr/search: « pâtisserie » and « boulangerie » are named in French', async () => {
  for (const q of ['pâtisserie', 'boulangerie']) {
    const html = await get(`/fr/search?q=${encodeURIComponent(q)}`);
    const line = (html.match(/<p class="search-interpreted">([\s\S]*?)<\/p>/) || [])[1] || '';
    assert.ok(!/bakery/i.test(line), line);
    assert.ok(cardNames(html).includes('R12 Corner Bakery'), q);
  }
});

// ---------- 6. Menus, Favorites, dates, help bot ----------

test('Menus: "Switch language" is French on /fr pages before any script runs; Roam Now says what it is in French', async () => {
  for (const p of ['/fr/kelowna', '/fr/map', '/fr/kelowna/restaurants/r12-french-bistro', '/fr/search?q=pizza', '/fr']) {
    const html = await get(p);
    assert.ok(!html.includes('>Switch language<'), p);
    if (html.includes('nav-links-lang')) assert.ok(html.includes('data-i18n="nav.switchLanguage">Changer de langue</span>'), p);
    if (html.includes('class="nav-roam-now"')) assert.ok(html.includes('html[lang="fr"] .nav-links a.nav-roam-now::after { content: "\u00a0· ouvert près de moi"'), p);
  }
  assert.ok((await get('/kelowna')).includes('>Switch language<'), 'English stays English');
  const home = await get('/');
  assert.ok(home.includes('<li class="nav-links-favorites"><a href="/favorites">Favorites</a></li>'), 'the homepage menu has Favorites');
  assert.ok(!(await get('/browse')).includes('<li class="nav-links-favorites">'), '/browse still leaves it out');
  assert.ok((await get('/fr')).includes('<li class="nav-links-favorites"><a href="/fr/favorites">Favoris</a></li>'));
});

test('/fr/map: event dates on the 1st read « 1er »', async () => {
  const html = await get('/fr/map');
  const src = html.match(/function dayText\(d\)\{[^\n]*\}/)[0];
  const ctx = { FR: true };
  vm.runInNewContext(`${src}; this.dayText = dayText;`, ctx);
  assert.equal(ctx.dayText('2026-11-01'), 'dim. 1er nov.');
  assert.equal(ctx.dayText('2026-11-11'), 'mer. 11 nov.');
  ctx.FR = false;
  assert.equal(ctx.dayText('2026-11-01'), 'Sun, Nov 1');
});

function ohbMatcher(page, opts = {}) {
  const html = app.ownerHelpWidgetHtml(page, opts);
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const ctx = { T: cfg.topics, cfg };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  return (q) => ctx.best(q);
}

test('Help bot: hours for a date go to Special closures; the weekly hours stay the weekly hours', () => {
  for (const m of [ohbMatcher('edit'), ohbMatcher('edit', { lang: 'fr' })]) {
    for (const [q, id] of [
      ['horaire du 26 décembre', 'closures'], ['heures du 24 décembre', 'closures'], ['fermé le 1er janvier', 'closures'], ['hours on December 26', 'closures'],
      ['closed dec 24', 'closures'], ['how do I change my hours', 'hours'], ['changer mes heures', 'hours'], ['boxing day hours', 'closures'],
    ]) assert.equal(m(q).id, id, q);
  }
});

// ---------- 7. French typography ----------

test('French typography: « de l’Okanagan Golf Club », and curly apostrophes on the French homepage', async () => {
  assert.equal(app.frElideOkanagan('Le plus long des parcours du Okanagan Golf Club, au Okanagan Lake.'), 'Le plus long des parcours de l’Okanagan Golf Club, à l’Okanagan Lake.');
  assert.equal(app.frElideOkanagan('Du Okanagan Golf Club'), 'De l’Okanagan Golf Club');
  const html = await get('/fr/kelowna/golf/r12-golf-course');
  assert.ok(html.includes('de l’Okanagan Golf Club'));
  assert.ok(!html.includes('du Okanagan Golf Club'));
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  const frDict = appJs.slice(appJs.indexOf('\n  fr: {'));
  assert.ok(frDict.includes("'mood.heading': \"Qu\\u2019est-ce qui vous tente aujourd\\u2019hui?\""));
  assert.ok(frDict.includes("'mood.whatsOn.title': \"\\u00c0 l\\u2019affiche\""));
});
