'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const ps = require('../page-stats');
const st = require('../search-terms');
const { EVENTS } = require('../site-events');

const NOW = new Date('2026-11-06T20:00:00Z');
const memDb = () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE page_counts (day TEXT NOT NULL, page TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, page, name));
    CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));
    CREATE TABLE referral_counts (day TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, source, page));
    CREATE TABLE search_term_counts (day TEXT NOT NULL, source TEXT NOT NULL, term TEXT NOT NULL, found INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, source, term, found));
    CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, slug TEXT, redirect_to TEXT);`);
  return d;
};
let ipN = 0;
function hit(c, url, { referer, ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '' } = {}) {
  return c.recordView({ headers: { 'user-agent': ua, cookie } }, url.split('?')[0], referer, `ip-${ipN += 1}`, NOW);
}
const counts = (db) => Object.fromEntries(db.prepare('SELECT page, name, n FROM page_counts').all().map((r) => [`${r.page}|${r.name}`, r.n]));

test('pageType sorts addresses and never counts private pages', () => {
  const t = ps.pageType;
  assert.equal(t('/'), 'home'); assert.equal(t('/fr'), 'home');
  assert.equal(t('/map'), 'tool'); assert.equal(t('/fr/map'), 'tool');
  assert.equal(t('/hidden-gems'), 'list'); assert.equal(t('/kelowna/events'), 'list');
  assert.equal(t('/guide/kelowna/best_patios'), 'guide'); assert.equal(t('/outdoors/hiking'), 'guide'); assert.equal(t('/guides/okanagan-ski-season-2026-27'), 'guide');
  assert.equal(t('/kelowna/breweries'), 'category'); assert.equal(t('/kelowna'), 'town');
  assert.equal(t('/kelowna/breweries/some-place'), 'business'); assert.equal(t('/kelowna/events/a-show'), 'event');
  for (const p of ['/owner/abc123', '/fr/owner/abc123', '/claim/x', '/admin/dashboard', '/api/x', '/map/data.json', '/list-your-venue', '/a/b/c/d']) assert.equal(t(p), null, p);
});

test('counts pages opened and where people went next; bots, staff, errors and other sites are left out', () => {
  const db = memDb(); const c = ps.createPageStats(db);
  hit(c, '/guide/kelowna/best_patios?utm_source=x');
  hit(c, '/fr/guide/kelowna/best_patios');
  hit(c, '/kelowna/restaurants/joes', { referer: 'https://okanaganroam.com/guide/kelowna/best_patios?x=1' });
  hit(c, '/kelowna/events/a-show', { referer: 'https://www.okanaganroam.com/fr/guide/kelowna/best_patios' });
  hit(c, '/kelowna/restaurants/joes', { referer: 'https://www.google.com/' });
  hit(c, '/kelowna/restaurants/joes', { referer: 'https://okanaganroam.com/kelowna/restaurants/other' }); // business to business
  hit(c, '/kelowna', { ua: 'Googlebot/2.1' });
  hit(c, '/kelowna', { cookie: 'roam_internal=1' });
  assert.deepEqual(counts(db), { '/guide/kelowna/best_patios|seen': 2, '/guide/kelowna/best_patios|sent_business': 1, '/guide/kelowna/best_patios|sent_event': 1 });
});

test('opening a business from Roam Now and directions are counted by business; junk addresses are refused', () => {
  const db = memDb(); const c = ps.createPageStats(db);
  db.prepare("INSERT INTO venues (id, name, region, slug) VALUES (1, 'Joe''s', 'kelowna', 'joes')").run();
  const day = '2026-11-06';
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)').run(day, 'page_view:map', 10);
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)').run(day, 'map_filter:patio', 3);
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)').run(day, 'map_filter:open', 4);
  hit(c, '/kelowna/restaurants/joes', { referer: 'https://okanaganroam.com/fr/map' });
  const req = { headers: { 'user-agent': 'Mozilla/5.0 Safari' } };
  assert.equal(c.recordMapDirections(req, '/kelowna/restaurants/joes', 'ip-a', NOW), true);
  assert.equal(c.recordMapDirections(req, '/admin/dashboard', 'ip-a', NOW), false);
  assert.equal(c.recordMapDirections(req, '/kelowna', 'ip-a', NOW), false);
  c.recordMapDirections(req, '/kelowna/restaurants/not-ours', 'ip-a', NOW); // stored, but not one of ours: never listed
  const r = c.roamNow(30, NOW);
  assert.deepEqual(r.businesses.map((b) => [b.name, b.opens, b.directions]), [["Joe's", 1, 1]]);
  assert.deepEqual(r.towns, [{ town: 'Kelowna', opens: 1, directions: 1 }]);
  assert.deepEqual(r.filters, [{ key: 'open', n: 4 }, { key: 'patio', n: 3 }]);
  assert.equal(r.steps[0].n, 10);
  assert.deepEqual(r.steps.find((s) => s.text.startsWith('Turned on')), { text: 'Turned on a filter', n: 7, of_opens: 70 });
});

test('the page report joins opens, outside visits and people sent on', () => {
  const db = memDb(); const c = ps.createPageStats(db);
  const day = '2026-11-06';
  const put = db.prepare('INSERT INTO page_counts VALUES (?, ?, ?, ?)');
  put.run(day, '/guide/kelowna/a', 'seen', 20); put.run(day, '/guide/kelowna/a', 'sent_business', 5);
  put.run(day, '/guide/kelowna/b', 'seen', 30); put.run(day, '/kelowna', 'seen', 4);
  put.run(day, '/kelowna/restaurants/joes', 'map_opened', 2); // not a content page
  db.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)').run(day, 'visit', 'search:google', '/fr/guide/kelowna/a', 6);
  db.prepare('INSERT INTO referral_counts VALUES (?, ?, ?, ?, ?)').run(day, 'visit', 'ai:chatgpt', '/guide/kelowna/a', 2);
  const r = c.pages(30, 100, NOW);
  assert.deepEqual(r.top.map((p) => p.page), ['/guide/kelowna/b', '/guide/kelowna/a', '/kelowna']);
  const a = r.top[1];
  assert.equal(a.rate, 25); assert.equal(a.from.search, 6); assert.equal(a.from.ai, 2);
  assert.deepEqual(r.best.map((p) => p.page), ['/guide/kelowna/a']);
  assert.deepEqual(r.none_sent.map((p) => p.page), ['/guide/kelowna/b']); // /kelowna has too few opens to judge
  assert.deepEqual(r.totals, { pages: 3, views: 54, sent: 5 });
});

test('Roam Now words count on their own and stay out of the site search totals; filters are a fixed list', () => {
  const db = memDb(); const t = st.createSearchTermCounter(db); const c = ps.createPageStats(db);
  const req = { headers: { 'user-agent': 'Mozilla/5.0 Safari' } };
  assert.equal(t.record(req, 'map', 'Patio', true, 'ip-w', NOW), true);
  assert.equal(t.record(req, 'map', 'tacos', false, 'ip-w', NOW), true);
  assert.equal(t.record(req, 'map', 'me@example.com', true, 'ip-w', NOW), false);
  const rep = t.report(30, 100, NOW);
  assert.equal(rep.totals.map, 2); assert.equal(rep.totals.site, 0);
  assert.deepEqual(rep.top, []);
  const r = c.roamNow(30, NOW);
  assert.deepEqual(r.words.map((w) => w.term), ['patio', 'tacos']);
  assert.deepEqual(r.none.map((w) => w.term), ['tacos']);
  assert.ok(EVENTS.has('map_filter:patio') && EVENTS.has('map_filter:open') && !EVENTS.has('map_filter:anything'));
});

test('the two dashboard pages draw, with a site that is not connected', () => {
  const { renderPagesPage, renderRoamNowPage } = require('../pages-page');
  const db = memDb(); const c = ps.createPageStats(db);
  const off = { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet.' };
  const a = renderPagesPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.pages(30, 100, NOW) }, off] });
  const b = renderRoamNowPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.roamNow(30, NOW) }, off] });
  assert.match(a, /Guides and pages/); assert.match(a, /Not connected yet/);
  assert.match(b, /How are people using the map/); assert.match(b, /Filters turned on/);
});

test('every Roam Now filter on the page is on the counted list, so a new chip cannot go uncounted', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  const block = (name) => { const i = src.indexOf(`const ${name} = [`); return src.slice(i, src.indexOf('\n];', i)); };
  const keys = [...block('MAP_KINDS').matchAll(/key: '([a-z_]+)'/g), ...block('MAP_MUST_HAVES').matchAll(/key: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length > 15);
  assert.deepEqual(keys.filter((k) => !EVENTS.has(`map_filter:${k}`)), []);
});

test('robots and our own testing are not counted as visitors', () => {
  const { isBot, isInternal } = require('../trip-demand');
  for (const ua of ['node', 'Mozilla/5.0', 'okr-audit/1.0', 'curl/8.7.1', 'HeadlessChrome/156', 'Mozilla/5.0 (compatible; fresh-domain-watch/1.0)']) assert.equal(isBot({ headers: { 'user-agent': ua } }), true, ua);
  assert.equal(isBot({ headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Safari/604.1' } }), false);
  const env = { INTERNAL_IPS: ' 1.2.3.4, 5.6.7.8 ' };
  assert.equal(isInternal({ headers: { 'x-real-ip': '5.6.7.8' } }, env), true);
  assert.equal(isInternal({ headers: { 'x-real-ip': '9.9.9.9' } }, env), false);
  assert.equal(isInternal({ headers: {} }, env), false);
  assert.equal(isInternal({ headers: { cookie: 'a=1; roam_internal=1' } }, {}), true);
});

test('the homepage reports through its own event, and sent-on counts can never come from a download alone', () => {
  const db = memDb(); const c = ps.createPageStats(db);
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)').run('2026-11-06', 'page_view:home', 12);
  hit(c, '/kelowna/restaurants/joes', { referer: 'https://okanaganroam.com/' });
  const home = c.pages(30, 100, NOW).top.find((p) => p.page === '/');
  assert.deepEqual([home.views, home.to_business, home.rate], [12, 1, 8]);
  assert.equal(typeof c.watch, 'undefined');
});
