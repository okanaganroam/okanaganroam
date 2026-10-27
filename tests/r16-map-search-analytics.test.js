// Round 16 (2026-10-21), Roam Now (/map, /fr/map): what visitors search for and don't find. A finished search sends
// one map_search (words as typed, normalized, and a result-count bucket) and, when nothing was found, map_search_empty.
// Never a location, pin, distance or radius. The map note and /privacy say so, in English and French.
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

let server, base;
test.before(async () => {
  server = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, text: await r.text() }; };

// The analytics block of the page script, from its first helper to the Enter search.
function analyticsBlock(html) {
  const from = html.indexOf('function mapSearchTerm(raw)');
  const to = html.indexOf('// Enter (or the phone', from);
  assert.ok(from > 0 && to > from, 'the analytics block is in the page script');
  return html.slice(from, to);
}

test('the normalizer: trimmed, lower case, spaces collapsed, at most 60 characters', () => {
  assert.equal(app.mapSearchTerm('  Pizza   NEAR\tme  '), 'pizza near me');
  assert.equal(app.mapSearchTerm('Terrasse  Chiens Acceptés'), 'terrasse chiens acceptés');
  assert.equal(app.mapSearchTerm(''), '');
  assert.equal(app.mapSearchTerm('   '), '');
  assert.equal(app.mapSearchTerm(null), '');
  assert.equal(app.mapSearchTerm(undefined), '');
  assert.equal(app.mapSearchTerm('a'.repeat(100)).length, 60);
  assert.equal(app.mapSearchTerm(`${'b'.repeat(59)} c`), 'b'.repeat(59), 'no trailing space after the cut');
  assert.deepEqual([0, 1, 5, 6, 20, 21, 500].map(app.mapSearchBucket), ['0', '1-5', '1-5', '6-20', '6-20', '21+', '21+']);
});

test('/map and /fr/map carry the event code, at the finished-search points only', async () => {
  for (const p of ['/map', '/fr/map']) {
    const page = await get(p);
    assert.equal(page.status, 200, p);
    const block = analyticsBlock(page.text);
    assert.match(block, /track\('map_search', p\)/, `${p}: map_search for every finished search`);
    assert.match(block, /if \(!n\) track\('map_search_empty', \{ search_term: q, lang: p\.lang, tab: p\.tab, how: how \}\)/, `${p}: map_search_empty when nothing was found`);
    assert.match(block, /lang: FR \? 'fr' : 'en'/);
    assert.match(block, /if \(!q \|\| q === lastSentTerm\) return;/, `${p}: never the same words twice in a row`);
    assert.match(block, /typeof window\.gtag !== 'function' \|\| typeof window\.trackEvent !== 'function'\) return;/, `${p}: nothing without Google Analytics`);
    assert.match(block, /aheadOn && aheadState === 'loading'/, `${p}: an events search waits for the Coming up weeks`);
    // The page-side copy of the normalizer keeps its backslashes (it is inlined from the function, not retyped).
    assert.ok(block.includes(".replace(/\\s+/g, ' ').slice(0, 60)"), `${p}: the normalizer is intact`);
    // Enter / the phone's Search key and voice go through runSearch, which reports once the results are in.
    assert.match(page.text, /var hadWords = !!term; searchFit = true; changed\(\); reportSearch\(v, how \|\| 'typed', hadWords\);/);
    assert.match(page.text, /runSearch\(said, 'voice'\)/);
    // Typing reports only after it rests for 2.5 s, not on every key.
    assert.match(block, /pauseTimer = setTimeout\(function\(\)\{ if \(searchEl\.value === v\) reportSearch\(v, 'paused', !!term\); \}, 2500\)/);
    assert.equal((page.text.match(/track\('map_search'/g) || []).length, 1, `${p}: one map_search call site`);
  }
});

test('nothing personal in the payload: no location, pin, distance or radius on the analytics path', async () => {
  const block = analyticsBlock((await get('/map')).text);
  for (const bad of [/\bme\b/, /\blat\b/, /\blng\b/, /radius/i, /distKm/, /\bpin\b/i, /\.d\b/, /town/, /location/i, /navigator/, /coords/i]) {
    assert.doesNotMatch(block, bad, `the analytics block never reads ${bad}`);
  }
  // The payloads hold exactly these keys.
  const payload = block.match(/p = \{ ([^}]*) \};/);
  assert.ok(payload);
  assert.deepEqual(payload[1].split(', ').map((x) => x.split(':')[0].trim()), ['search_term', 'lang', 'tab', 'how', 'results', 'words']);
});

test('the analytics block runs: one event per search, empty searches flagged, no repeats, and silent without gtag', async () => {
  const block = analyticsBlock((await get('/map')).text);
  const sent = [];
  let inputHandler = null;
  const ctx = {
    window: { gtag() {}, trackEvent() {} }, FR: false, tab: 'places', term: '', evBySearch: false, evTerm: '', evKinds: [], aheadOn: false, aheadState: null,
    places: [{ n: 'pizza' }, { n: 'sushi' }], events: [{ name: 'Jazz Night', venue: 'Hall' }],
    matchesPlace(x) { return !!ctx.term && x.n === ctx.term; }, evHit() { return true; }, evGroup() { return 'week'; },
    okToday() { return '2026-10-21'; }, okanaganClock() { return { minutes: 600 }; }, foldFr(w) { return String(w).toLowerCase(); },
    track(name, params) { sent.push(JSON.parse(JSON.stringify([name, params]))); },
    searchEl: { value: '', addEventListener(type, fn) { if (type === 'input') inputHandler = fn; } },
    setTimeout, clearTimeout, String,
  };
  vm.createContext(ctx);
  vm.runInContext(`${block}; this.reportSearch = reportSearch;`, ctx);
  assert.equal(typeof inputHandler, 'function', 'typing has its own resting timer');
  ctx.term = 'pizza'; ctx.reportSearch('  Pizza ', 'typed', true);
  assert.deepEqual(sent, [['map_search', { search_term: 'pizza', lang: 'en', tab: 'places', how: 'typed', results: '1-5', words: 1 }]]);
  ctx.reportSearch('pizza', 'typed', true);
  assert.equal(sent.length, 1, 'the same words twice in a row are sent once');
  ctx.term = 'zorblax'; ctx.reportSearch('Zorblax', 'voice', true);
  assert.deepEqual(sent.slice(1), [['map_search', { search_term: 'zorblax', lang: 'en', tab: 'places', how: 'voice', results: '0', words: 1 }], ['map_search_empty', { search_term: 'zorblax', lang: 'en', tab: 'places', how: 'voice' }]]);
  // A places search counts the events whose names hold the words too: "jazz" finds no place but finds Jazz Night.
  ctx.term = 'jazz'; ctx.reportSearch('jazz', 'typed', true);
  assert.equal(sent.at(-1)[0], 'map_search');
  assert.equal(sent.at(-1)[1].results, '1-5');
  // An events search counts its events only, Coming up weeks included once loaded.
  ctx.evBySearch = true; ctx.tab = 'events'; ctx.events = []; ctx.reportSearch('new years eve', 'typed', false);
  assert.deepEqual(sent.slice(-2).map((x) => x[0]), ['map_search', 'map_search_empty']);
  assert.equal(sent.at(-1)[1].tab, 'events');
  // Empty words are not a search.
  const n = sent.length;
  ctx.reportSearch('   ', 'typed', false);
  assert.equal(sent.length, n);
  // Without Google Analytics nothing is sent and nothing throws.
  ctx.window.gtag = undefined;
  assert.doesNotThrow(() => ctx.reportSearch('something new', 'typed', true));
  ctx.window = {};
  assert.doesNotThrow(() => ctx.reportSearch('another one', 'typed', true));
  assert.equal(sent.length, n);
});

test('privacy: the map no longer carries the privacy notes (2026-10-27); /privacy explains location, voice and searches, in English and French', async () => {
  const en = (await get('/map')).text, fr = (await get('/fr/map')).text;
  assert.ok(!en.includes('class="pm-privacy"') && !fr.includes('class="pm-privacy"'), 'no privacy notes under the Roam Now list');
  assert.doesNotMatch(en, /Your location stays on your phone/);
const pen = await get('/privacy'), pfr = await get('/fr/privacy');
  assert.equal(pen.status, 200);
  assert.equal(pfr.status, 200);
  assert.match(pen.text, /<h2>What you search on the map<\/h2>\s*<p>When you search on the map, the words you search and how many results they found may be counted anonymously with Google Analytics[^<]*Your location, a dropped pin and the distance you pick are never sent with them\.<\/p>/);
  assert.match(pfr.text, /<h2>Ce que vous cherchez sur la carte<\/h2>\s*<p>Quand vous faites une recherche sur la carte, les mots cherchés et le nombre de résultats trouvés peuvent être comptés de façon anonyme avec Google Analytics[^<]*Votre position, un repère déposé et la distance choisie ne sont jamais envoyés avec eux\.<\/p>/);
  assert.doesNotMatch(pfr.text, /When you search on the map/, 'no English left on /fr/privacy');
  assert.doesNotMatch(fr, /The words you search may be counted/, 'no English left on /fr/map');
});
