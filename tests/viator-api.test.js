'use strict';
// Viator (2026-11-20) through the server: no key means nothing anywhere; with the key but the stays switch off, /trip and
// plans are byte-identical; with both, the plan carries the hint (its stops unchanged) and /api/trip/viator gives the
// cards (mocked Partner API); a venue Dayton approved gets "Also bookable on Viator" with the commission line, in
// English and French; the sitemap and llms.txt never mention Viator. Uses the repo's seed database plus one fixture
// tour, removed again at the end.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.TRIP_STAYS;
delete process.env.VIATOR_API_KEY;
delete process.env.VIATOR_PARTNER_ID;
process.env.TRIP_PLANNER_V3 = 'on';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viator-api-'));
process.env.VIATOR_DATA_DIR = dataDir;
const app = require('../server.js');
const db = require('../db.js');
const viator = require('../viator');

const FIX = path.join(__dirname, 'fixtures', 'viator');
const PRODUCT_URL = 'https://www.viator.com/tours/Kelowna/Bare-Wine-Tours/d5257-11111P1?mcid=42383&pid=P00333119&medium=api&api_version=2.0&campaign=okanagan';
const keyOn = () => { process.env.VIATOR_API_KEY = 'test-key-not-real'; process.env.VIATOR_PARTNER_ID = 'P00333119'; };
const keyOff = () => { delete process.env.VIATOR_API_KEY; delete process.env.VIATOR_PARTNER_ID; };

// Calls to api.viator.com are answered from the fixtures; everything else (this test's own requests) is real.
const realFetch = globalThis.fetch;
const apiCalls = [];
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.viator.com/')) return realFetch(url, init);
  const body = init && init.body ? JSON.parse(init.body) : null;
  apiCalls.push({ url: String(url), headers: init.headers, body });
  const file = body && body.searchTerm === 'wine tour' ? 'freetext-wine-tour.json' : 'freetext-empty.json';
  const json = JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8'));
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => json };
};

let base, srv, tour;
test.before(async () => {
  fs.writeFileSync(path.join(dataDir, 'viator-destinations.json'), JSON.stringify({ area: 25828, regions: { kelowna: 5257 } }));
  tour = app.createVenue({ region: 'kelowna', type: 'tour', slug: 'viator-test-wine-tours', name: 'Viator Test Wine Tours', address: '1 Water Street, Kelowna, BC', latitude: 49.887, longitude: -119.496, description: 'A fixture used only by the Viator tests.', description_fr: 'Une fiche utilisée seulement par les tests Viator.', website: 'https://viator-test-wine-tours.example/' });
  db.prepare('INSERT OR REPLACE INTO venue_links (venue_id, booking_url) VALUES (?, ?)').run(tour.id, 'https://viator-test-wine-tours.example/book');
  fs.writeFileSync(path.join(dataDir, 'viator-matches.json'), JSON.stringify({ venues: { [tour.id]: { productCode: '11111P1', title: 'Bare Wine Tours', url: PRODUCT_URL } } }));
  viator.clearCache();
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  if (tour) { db.prepare('DELETE FROM venue_links WHERE venue_id = ?').run(tour.id); db.prepare('DELETE FROM venues WHERE id = ?').run(tour.id); }
  keyOff();
  delete process.env.VIATOR_DATA_DIR;
  globalThis.fetch = realFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const post = async (text, qs = '') => (await realFetch(`${base}/api/trip/plan${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).text();
const get = async (p) => { const r = await realFetch(`${base}${p}`); return { status: r.status, text: await r.text(), headers: r.headers }; };
const TEXT = '2 days in Kelowna with a wine tour';
const tourPath = () => `/kelowna/${app.CATEGORY_SLUGS.tour}/viator-test-wine-tours`;

test('no key: nothing anywhere (plan, /trip, the cards route, the venue page) and no call to Viator', async () => {
  keyOff();
  const plan = await post(TEXT, '?stays=1');
  assert.doesNotMatch(plan, /viator/i);
  assert.doesNotMatch((await get('/trip?stays=1')).text, /viator/i);
  const api = await get('/api/trip/viator?i=wine_tour&r=kelowna&stays=1');
  assert.notEqual(api.status, 200);
  const page = await get(tourPath());
  assert.equal(page.status, 200);
  assert.match(page.text, /data-track="booking"/, 'the operator\'s own Book button');
  assert.doesNotMatch(page.text, /Also bookable on Viator|data-link="viator"[^\]]/);
  assert.equal(apiCalls.length, 0);
});

test('key set, stays switch off: /trip and plans are byte-identical to no key; no cards route', async () => {
  keyOff();
  const planOff = await post(TEXT);
  const tripOff = (await get('/trip')).text;
  keyOn();
  try {
    assert.equal(await post(TEXT), planOff);
    assert.equal((await get('/trip')).text, tripOff);
    assert.notEqual((await get('/api/trip/viator?i=wine_tour&r=kelowna')).status, 200);
  } finally { keyOff(); }
  assert.equal(apiCalls.length, 0);
});

test('key + ?stays=1: the plan gets the hint and the same stops; /trip ships the card code; the cards come from the API', async () => {
  keyOff();
  const before = await post(TEXT, '?stays=1');
  const pageOff = (await get('/trip?stays=1')).text;
  keyOn();
  try {
    const p = JSON.parse(await post(TEXT, '?stays=1'));
    assert.deepEqual(p.viator, { interests: [{ key: 'wine_tour', label: 'Wine tours', labelFr: 'Visites de vignobles' }], region: 'kelowna' });
    delete p.viator;
    assert.equal(JSON.stringify(p), JSON.stringify(JSON.parse(before)), 'the plan itself is unchanged: commission never picks or orders places');
    const page = (await get('/trip?stays=1')).text;
    assert.notEqual(page, pageOff);
    assert.match(page, /t3ViatorBlockHtml/);
    assert.match(page, /\/api\/trip\/viator\?i=/);
    assert.match(page, /T3_VT_QS = "&stays=1"/);
    assert.doesNotMatch(page, /Bare Wine Tours|hare-media-cdn/, 'no Viator content in the page source');
    assert.doesNotMatch(page, /href="[^"]*viator/i);
    // The cards.
    const r = await get('/api/trip/viator?i=wine_tour,nope&r=kelowna&stays=1');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    const j = JSON.parse(r.text);
    assert.deepEqual(j.cards.map((c) => c.code), ['11111P1', '44444P1']);
    assert.equal(j.cards[0].url, JSON.parse(fs.readFileSync(path.join(FIX, 'freetext-wine-tour.json'), 'utf8')).products.results[0].productUrl, 'the productUrl exactly as Viator gave it');
    assert.equal(j.cards[0].photo.url, 'https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-480x320/0f/11111p1.jpg');
    assert.match(j.disclosure, /We may earn a commission/);
    const call = apiCalls[apiCalls.length - 1];
    assert.equal(call.body.productFiltering.destination, '5257');
    assert.equal(call.headers['exp-api-key'], 'test-key-not-real');
    const n = apiCalls.length;
    await get('/api/trip/viator?i=wine_tour&r=kelowna&stays=1');
    assert.equal(apiCalls.length, n, 'cached');
    const fr = JSON.parse((await get('/api/trip/viator?i=wine_tour&r=kelowna&lang=fr&stays=1')).text);
    assert.match(fr.disclosure, /Nous pouvons toucher une commission/);
    assert.equal(apiCalls[apiCalls.length - 1].headers['Accept-Language'], 'fr-CA');
    assert.equal((await get('/api/trip/viator?i=nope&r=kelowna&stays=1')).status, 400);
    assert.equal((await get('/api/trip/viator?i=wine_tour&r=atlantis&stays=1')).status, 400);
    // Nothing asked for: no hint.
    assert.equal(JSON.parse(await post('2 days in Kelowna', '?stays=1')).viator, undefined);
  } finally { keyOff(); }
});

test('venue page: "Also bookable on Viator" under the own Book button, sponsored, new tab, commission line; French too', async () => {
  keyOn();
  try {
    const en = (await get(tourPath())).text;
    const own = en.indexOf('https://viator-test-wine-tours.example/book');
    const vi = en.indexOf('data-link="viator">Also bookable on Viator');
    assert.ok(own > 0 && vi > own, 'after the operator\'s own Book button');
    assert.match(en, /<a href="https:\/\/www\.viator\.com\/tours\/Kelowna\/Bare-Wine-Tours\/d5257-11111P1\?mcid=42383&amp;pid=P00333119&amp;medium=api&amp;api_version=2\.0&amp;campaign=okanagan" target="_blank" rel="sponsored nofollow noopener" data-track="booking" data-link="viator">/);
    assert.match(en, /data-viator-disclosure[^>]*>We may earn a commission if you book through these links/);
    assert.equal((en.match(/Also bookable on Viator/g) || []).length, 1);
    assert.doesNotMatch(en, /hare-media-cdn/, 'no Viator photo on a venue page');
    const fr = await get(`/fr${tourPath()}`);
    assert.equal(fr.status, 200);
    assert.match(fr.text, /data-link="viator">Aussi réservable sur Viator/);
    assert.match(fr.text, /Nous pouvons toucher une commission/);
    // The click is its own key on the dashboard's click sheet.
    assert.match(en, /\["viator","a\[data-link=\\"viator\\"\]"/);
    // Not in the sitemap or llms.txt.
    for (const p of ['/sitemap.xml', '/llms.txt']) assert.doesNotMatch((await get(p)).text, /viator/i, p);
  } finally { keyOff(); }
});
