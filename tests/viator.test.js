'use strict';
// Viator (2026-11-20, viator.js + scripts/viator-match.js + scripts/viator-apply.js) with a mocked Partner API: the
// links, the client, the cards and their cache, the Build My Trip interests, the venue page line, and the match/apply
// scripts. Fixtures in tests/fixtures/viator are shaped from Viator's API docs. No network.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const viator = require('../viator');

const FIX = path.join(__dirname, 'fixtures', 'viator');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
const ENV = { VIATOR_API_KEY: 'test-key-not-real', VIATOR_PARTNER_ID: 'P00333119' };
const CFG = viator.config(ENV);

// A mock of the Partner API: answers from the fixtures and records every call.
function mockApi(opts = {}) {
  const calls = [];
  const json = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] || null }, json: async () => body });
  const impl = async (url, init) => {
    const u = new URL(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), path: u.pathname, query: Object.fromEntries(u.searchParams), headers: init.headers, body });
    if (opts.fail) return json(500, {});
    if (opts.throw) throw new Error('socket hang up');
    if (u.pathname === '/partner/destinations') return json(200, fixture('destinations.json'));
    if (u.pathname === '/partner/products/search') {
      const all = fixture(`products-search-${body.filtering.destination}.json`);
      const start = body.pagination.start - 1;
      return json(200, { products: all.products.slice(start, start + body.pagination.count), totalCount: all.totalCount });
    }
    if (u.pathname === '/partner/search/freetext') {
      const t = body.searchTerm.toLowerCase();
      if (t === 'wine tour' || /bare wine/.test(t)) return json(200, fixture('freetext-wine-tour.json'));
      if (t === 'boat tour') return json(200, fixture('freetext-boat-tour.json'));
      return json(200, fixture('freetext-empty.json'));
    }
    const m = /^\/partner\/products\/([A-Za-z0-9]+)$/.exec(u.pathname);
    if (m && fs.existsSync(path.join(FIX, `product-${m[1]}.json`))) return json(200, fixture(`product-${m[1]}.json`));
    return json(404, {});
  };
  return { impl, calls };
}

test('config: off without the key or with a bad partner id; campaign from trip-site.js, cleaned', () => {
  assert.equal(viator.config({}).enabled, false);
  assert.equal(viator.config({ VIATOR_PARTNER_ID: 'P00333119' }).enabled, false);
  assert.equal(viator.config({ VIATOR_API_KEY: 'k' }).enabled, false);
  assert.equal(viator.config({ VIATOR_API_KEY: 'k', VIATOR_PARTNER_ID: 'x123' }).enabled, false);
  assert.equal(CFG.enabled, true);
  assert.equal(CFG.campaign, 'okanagan');
  assert.equal(CFG.mcid, '42383');
  assert.equal(viator.config({ ...ENV, VIATOR_CAMPAIGN: 'winter promo+1' }).campaign, 'winterpromo1');
  // Off: no key is ever kept.
  assert.equal(viator.config({ VIATOR_API_KEY: 'secret' }).key, '');
});

test('links: an API productUrl is used exactly as given; another viator.com link gets pid, mcid, medium and campaign', () => {
  const api = 'https://www.viator.com/tours/Kelowna/X/d5257-11111P1?mcid=42383&pid=P00333119&medium=api&api_version=2.0&campaign=okanagan';
  assert.equal(viator.affiliateUrl(api, CFG, 'api'), api);
  assert.equal(viator.affiliateUrl('https://www.viator.com/Kelowna/d5257-ttd', CFG), 'https://www.viator.com/Kelowna/d5257-ttd?pid=P00333119&mcid=42383&medium=link&campaign=okanagan');
  assert.equal(viator.affiliateUrl('https://www.viator.com/Kelowna/d5257-ttd?sort=x#top', CFG), 'https://www.viator.com/Kelowna/d5257-ttd?sort=x&pid=P00333119&mcid=42383&medium=link&campaign=okanagan#top');
  assert.equal(viator.affiliateUrl('https://www.viator.com/x', viator.config({ ...ENV, VIATOR_CAMPAIGN: 'whistler' })), 'https://www.viator.com/x?pid=P00333119&mcid=42383&medium=link&campaign=whistler');
  for (const bad of ['https://evil.example/viator.com', 'http://www.viator.com/x', 'https://www.viator.com.evil.example/', 'javascript:alert(1)', 'https://www.viator.com/a"b', null]) assert.equal(viator.affiliateUrl(bad, CFG), null, String(bad));
  assert.equal(viator.affiliateUrl('https://www.viator.com/x', viator.config({})), null, 'no partner id: no link');
});

test('client: no key means no call at all; headers, campaign and currency per the docs; any failure is null', async () => {
  const off = mockApi();
  assert.equal(await viator.freetext('wine tour', 5257, { cfg: viator.config({}), fetchImpl: off.impl }), null);
  assert.deepEqual(await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: viator.config({}), fetchImpl: off.impl, destinations: { area: 25828, regions: { kelowna: 5257 } } }), []);
  assert.equal(off.calls.length, 0);
  const api = mockApi();
  const r = await viator.freetext('wine tour', 5257, { cfg: CFG, fetchImpl: api.impl, lang: 'fr' });
  assert.equal(r.products.length, 2);
  const c = api.calls[0];
  assert.equal(c.url.split('?')[0], 'https://api.viator.com/partner/search/freetext');
  assert.equal(c.query['campaign-value'], 'okanagan');
  assert.equal(c.headers['exp-api-key'], 'test-key-not-real');
  assert.equal(c.headers.Accept, 'application/json;version=2.0');
  assert.equal(c.headers['Accept-Language'], 'fr-CA');
  assert.deepEqual(c.body, { searchTerm: 'wine tour', productFiltering: { destination: '5257' }, productSorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' }, searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count: 6 } }], currency: 'CAD' });
  await viator.productDetails('11111P1', { cfg: CFG, fetchImpl: api.impl });
  assert.equal(api.calls[1].headers['Accept-Language'], 'en-CA');
  assert.equal(await viator.productDetails('../x', { cfg: CFG, fetchImpl: api.impl }), null, 'a bad code is never sent');
  assert.equal(await viator.freetext('x', 1, { cfg: CFG, fetchImpl: mockApi({ fail: true }).impl }), null);
  assert.equal(await viator.freetext('x', 1, { cfg: CFG, fetchImpl: mockApi({ throw: true }).impl }), null);
  // A call that never answers is cut off.
  const slow = (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); });
  const t0 = Date.now();
  assert.equal(await viator.request('/destinations', { cfg: CFG, fetchImpl: slow, timeoutMs: 50 }), null);
  assert.ok(Date.now() - t0 < 2000);
});

test('cards: photo, title, rating, from-price, duration and the unchanged productUrl; no productUrl, no card', () => {
  const p = fixture('products-search-5257.json').products[0];
  const card = viator.toCard(p, CFG);
  assert.deepEqual(card, {
    code: '11111P1', title: 'Bare Wine Tours: Lake Country Wine Tasting Tour', url: p.productUrl,
    photo: { url: 'https://hare-media-cdn.tripadvisor.com/media/attractions-splice-spp-480x320/0f/11111p1.jpg', width: 480, height: 320 },
    rating: 4.9, reviews: 210, fromPrice: 149, currency: 'CAD', duration: { from: 360, to: 360 },
  });
  assert.ok(!('description' in card), 'no description text is passed on');
  assert.deepEqual(viator.toCard(fixture('products-search-5257.json').products[2], CFG).duration, { from: 120, to: 240 });
  assert.equal(viator.toCard({ ...p, productUrl: undefined }, CFG), null);
  assert.equal(viator.toCard({ ...p, productUrl: 'https://elsewhere.example/x' }, CFG), null);
  assert.equal(viator.toCard({ ...p, title: '' }, CFG), null);
});

test('trip cards: at most 2, one per interest first, never twice; cached a day; a failure is cached briefly', async () => {
  viator.clearCache();
  const dests = { area: 25828, regions: { kelowna: 5257 } };
  const api = mockApi();
  const now = Date.parse('2026-11-20T12:00:00Z');
  const cards = await viator.tripCards(['wine_tour', 'boat'], 'kelowna', 'en', { cfg: CFG, fetchImpl: api.impl, destinations: dests, now });
  assert.deepEqual(cards.map((c) => [c.code, c.interest]), [['11111P1', 'wine_tour'], ['33333P2', 'boat']]);
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[0].body.productFiltering.destination, '5257');
  const one = await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: CFG, fetchImpl: api.impl, destinations: dests, now: now + 3600e3 });
  assert.deepEqual(one.map((c) => c.code), ['11111P1', '44444P1']);
  assert.equal(api.calls.length, 2, 'served from the cache');
  await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: CFG, fetchImpl: api.impl, destinations: dests, now: now + viator.CACHE_MS + 1 });
  assert.equal(api.calls.length, 3, 'asked again after 24 hours');
  await viator.tripCards(['wine_tour'], 'kelowna', 'fr', { cfg: CFG, fetchImpl: api.impl, destinations: dests, now });
  assert.equal(api.calls.length, 4, 'French is its own entry');
  // A town with no Viator destination of its own uses the area.
  await viator.tripCards(['boat'], 'oliver', 'en', { cfg: CFG, fetchImpl: api.impl, destinations: dests, now });
  assert.equal(api.calls[4].body.productFiltering.destination, '25828');
  // Failure: no cards, and not asked again for 10 minutes.
  viator.clearCache();
  const bad = mockApi({ fail: true });
  assert.deepEqual(await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: CFG, fetchImpl: bad.impl, destinations: dests, now }), []);
  await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: CFG, fetchImpl: bad.impl, destinations: dests, now: now + 60e3 });
  assert.equal(bad.calls.length, 1);
  await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: CFG, fetchImpl: bad.impl, destinations: dests, now: now + viator.FAIL_CACHE_MS + 1 });
  assert.equal(bad.calls.length, 2);
  // No destinations file: nothing, no call.
  viator.clearCache();
  const none = mockApi();
  assert.deepEqual(await viator.tripCards(['wine_tour'], 'kelowna', 'en', { cfg: CFG, fetchImpl: none.impl, destinations: null, now }), []);
  assert.equal(none.calls.length, 0);
  viator.clearCache();
});

test('interests: request words in English and French; "tour" only when no kind is named', () => {
  const ri = (t) => viator.requestInterests(t);
  assert.deepEqual(ri('3 days in Kelowna with a wine tour and a sunset cruise'), ['wine_tour', 'boat']);
  assert.deepEqual(ri('Une visite des vignobles et une croisière à Penticton'), ['wine_tour', 'boat']);
  assert.deepEqual(ri('ziplining and kayaking near Vernon'), ['zipline', 'paddle']);
  assert.deepEqual(ri('tyrolienne et planche à pagaie'), ['zipline', 'paddle']);
  assert.deepEqual(ri('ski lessons at Big White'), ['ski_lesson']);
  assert.deepEqual(ri('cours de ski à Big White'), ['ski_lesson']);
  assert.deepEqual(ri('a guided tour of Kelowna'), ['tour']);
  assert.deepEqual(ri('visite guidée de Kelowna'), ['tour']);
  assert.deepEqual(ri('wineries and great food in Kelowna'), [], 'wineries alone are not a wine tour');
  assert.deepEqual(ri('2 days in Penticton with the kids'), []);
  // A kind this site does not offer is never suggested.
  assert.deepEqual(viator.requestInterests('heli skiing and a gondola', ['wine_tour']), []);
  for (const k of viator.siteInterests()) {
    assert.ok(viator.INTERESTS[k], k);
    assert.ok(viator.INTERESTS[k].label && viator.INTERESTS[k].labelFr && viator.INTERESTS[k].term, k);
  }
});

test('trip hint: only uncovered interests, the main town, never touches the plan; off without key or destinations', () => {
  const dests = { area: 25828, regions: { kelowna: 5257 } };
  const plan = { kind: 'multi_day', days: [{ day: 1, stops: [{ venue: { id: 1, name: 'Bare Wine Tours', type: 'tour', region: 'kelowna' } }, { venue: { id: 2, name: 'Bistro', type: 'restaurant', region: 'kelowna' } }] }, { day: 2, stops: [{ venue: { id: 3, name: 'Beach', type: 'beach', region: 'penticton' } }] }] };
  const before = JSON.stringify(plan);
  const text = '2 days in Kelowna with a wine tour and a boat cruise';
  // The wine tour stop has its own booking link: covered; the cruise is not.
  assert.deepEqual(viator.tripHint(plan, text, new Set([1]), { cfg: CFG, destinations: dests }), { interests: [{ key: 'boat', label: 'Boat tours', labelFr: 'Sorties en bateau' }], region: 'kelowna' });
  // No booking link on the tour: both suggested.
  assert.deepEqual(viator.tripHint(plan, text, new Set(), { cfg: CFG, destinations: dests }).interests.map((x) => x.key), ['wine_tour', 'boat']);
  assert.equal(JSON.stringify(plan), before, 'the plan is never changed');
  assert.equal(viator.tripHint(plan, text, new Set(), { cfg: viator.config({}), destinations: dests }), null, 'no key');
  assert.equal(viator.tripHint(plan, text, new Set(), { cfg: CFG, destinations: null }), null, 'no destinations file');
  assert.equal(viator.tripHint(plan, '2 days in Kelowna', new Set(), { cfg: CFG, destinations: dests }), null, 'nothing asked');
  assert.equal(viator.planRegion(plan), 'kelowna');
  assert.equal(viator.destinationFor('kelowna', dests), 5257);
  assert.equal(viator.destinationFor('oliver', dests), 25828);
});

test('venue page line: after the block with the own Book button, sponsored + new tab, commission line, French; else unchanged', () => {
  const url = 'https://www.viator.com/tours/Kelowna/X/d5257-11111P1?mcid=42383&pid=P00333119&medium=api&api_version=2.0&campaign=okanagan';
  const matches = { 1587: { productCode: '11111P1', url } };
  const page = '<main><div class="venue-cta-row"><a class="cta" href="/d">Directions</a><a class="cta secondary" href="https://op.example/book" target="_blank" data-track="booking">Book a tour</a></div><p>About</p></main>';
  const out = viator.withVenueLink(page, { id: 1587 }, 'en', { cfg: CFG, matches });
  assert.match(out, /data-track="booking">Book a tour<\/a><\/div>\n {2}<p class="venue-viator"/, 'right under the row with the operator\'s own Book button');
  assert.match(out, /<a href="https:\/\/www\.viator\.com\/tours\/Kelowna\/X\/d5257-11111P1\?mcid=42383&amp;pid=P00333119&amp;medium=api&amp;api_version=2\.0&amp;campaign=okanagan" target="_blank" rel="sponsored nofollow noopener" data-track="booking" data-link="viator">Also bookable on Viator <span aria-hidden="true">↗<\/span><\/a>/);
  assert.match(out, /data-viator-disclosure[^>]*>We may earn a commission if you book through these links\. It never changes which places we list or their order\.<\/span>/);
  assert.equal((out.match(/data-track="booking"/g) || []).length, 2);
  assert.ok(out.indexOf('Book a tour') < out.indexOf('Also bookable'), 'the own Book button stays first');
  const fr = viator.withVenueLink(page, { id: 1587 }, 'fr', { cfg: CFG, matches });
  assert.match(fr, />Aussi réservable sur Viator <span/);
  assert.match(fr, /Nous pouvons toucher une commission/);
  // Not shown: no key, no approved match, no Book button of its own, a match that is not a viator.com link.
  assert.equal(viator.withVenueLink(page, { id: 1587 }, 'en', { cfg: viator.config({}), matches }), page);
  assert.equal(viator.withVenueLink(page, { id: 9 }, 'en', { cfg: CFG, matches }), page);
  const noBook = page.replace(' data-track="booking"', ' data-track="website"');
  assert.equal(viator.withVenueLink(noBook, { id: 1587 }, 'en', { cfg: CFG, matches }), noBook);
  assert.equal(viator.withVenueLink(page, { id: 1587 }, 'en', { cfg: CFG, matches: { 1587: { productCode: 'X', url: 'https://elsewhere.example/' } } }), page);
  // Whenever a Viator link renders, the commission line is with it.
  for (const lang of ['en', 'fr']) {
    const h = viator.venueLinkHtml(1587, lang, { cfg: CFG, matches });
    assert.equal((h.match(/data-link="viator"/g) || []).length, 1);
    assert.match(h, /data-viator-disclosure/);
  }
});

test('matching: names, confidence and reasons; CSV round trip; only ok rows are applied, one product per venue', () => {
  assert.equal(viator.nameScore('Bare Wine Tours', 'Bare Wine Tours Ltd.'), 0.95);
  assert.equal(viator.nameScore('Ziptrek Ecotours', 'ZipTrek EcoTours'), 1);
  assert.equal(viator.nameScore('Bare Wine Tours', 'Valley Private Drivers'), 0);
  const part = viator.nameScore('A Taste of Kelowna Food Tours', 'Taste of Kelowna');
  assert.ok(part >= 0.6 && part < 0.9, `one name inside the other is medium (${part})`);
  assert.ok(viator.textMentions('Bare Wine Tours: Lake Country Wine Tasting Tour', 'Bare Wine Tours'));
  assert.ok(!viator.textMentions('Some boat ride', 'Bare Wine Tours'));
  assert.ok(!viator.textMentions('Big lake', 'Big'), 'a short one-word name never matches on text alone');
  const prods = fixture('products-search-5257.json').products;
  const withSup = [{ ...prods[0], supplierName: 'Bare Wine Tours Ltd.' }, { ...prods[3], supplierName: 'Valley Private Drivers' }, { ...prods[2], supplierName: 'Lake Cruises Co' }];
  const rows = viator.matchVenue({ id: 1576, name: 'Bare Wine Tours' }, withSup);
  assert.deepEqual(rows.map((r) => [r.productCode, r.confidence]), [['11111P1', 'high'], ['44444P1', 'low']]);
  assert.match(rows[1].reason, /supplier is "Valley Private Drivers"/);
  const csv = viator.matchesCsv(rows);
  assert.equal(csv.split('\n')[0], 'ok,venue_id,venue_name,viator_product_code,title,supplier_name,confidence,reason,product_url');
  const back = viator.parseCsv(csv);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'Bare Wine Tours: Lake Country Wine Tasting Tour');
  assert.equal(back[1].reason, rows[1].reason, 'quotes and commas survive');
  back[0].ok = 'ok';
  back[1].ok = 'ok';
  const { venues, skipped } = viator.approvedMatches(back, '2026-11-21');
  assert.deepEqual(Object.keys(venues), ['1576']);
  assert.equal(venues[1576].productCode, '11111P1');
  assert.equal(venues[1576].url, prods[0].productUrl);
  assert.match(skipped[0].why, /first ok row wins/);
  assert.deepEqual(viator.approvedMatches([{ ...back[0], ok: '' }]).venues, {}, 'unmarked rows are not applied');
  assert.equal(Object.keys(viator.approvedMatches([{ ...back[0], ok: 'ok', product_url: 'https://evil.example/' }]).venues).length, 0);
});

test('scripts: viator-match writes the review CSV and destinations (mock API, no DB); viator-apply writes only ok rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viator-test-'));
  try {
    const venuesFile = path.join(dir, 'venues.json');
    fs.writeFileSync(venuesFile, JSON.stringify([{ id: 1576, name: 'Bare Wine Tours', type: 'tour', region: 'kelowna' }, { id: 1999, name: 'Nobody Matches Here', type: 'tour', region: 'kelowna' }, { id: 2001, name: 'Old Place', type: 'tour', region: 'kelowna', redirect_to: 5 }]));
    const api = mockApi();
    const logs = [];
    const res = await require('../scripts/viator-match').run({ site: 'okanagan', venuesFile, outDir: dir, cfg: CFG, fetchImpl: api.impl, delay: 0, log: (s) => logs.push(s) });
    assert.ok(api.calls.every((c) => c.url.startsWith('https://api.viator.com/partner/')), 'only the Viator API is called');
    assert.ok(api.calls.every((c) => ['/partner/destinations', '/partner/products/search', '/partner/search/freetext'].includes(c.path) || /^\/partner\/products\/\w+$/.test(c.path)), 'Basic-access endpoints only');
    const dest = JSON.parse(fs.readFileSync(path.join(dir, 'destinations-okanagan.json'), 'utf8'));
    // Viator's real list (2026-11-20) has one Okanagan destination, d22366 "Kelowna & Okanagan Valley".
    assert.deepEqual(dest.found, { 'Kelowna & Okanagan Valley': 22366 });
    assert.equal(dest.area, 22366);
    assert.deepEqual(dest.regions, {});
    assert.deepEqual(dest.missing, []);
    const csv = viator.parseCsv(fs.readFileSync(res.csvFile, 'utf8'));
    assert.deepEqual(csv.map((r) => [r.venue_id, r.viator_product_code, r.confidence, r.ok]), [['1576', '11111P1', 'high', ''], ['1576', '44444P1', 'low', '']]);
    assert.equal(csv[0].supplier_name, 'Bare Wine Tours Ltd.');
    assert.ok(fs.existsSync(path.join(dir, 'cache-okanagan', '11111P1.json')), 'details kept for a re-run');
    // A re-run uses the kept details: no product detail calls.
    const again = mockApi();
    await require('../scripts/viator-match').run({ site: 'okanagan', venuesFile, outDir: dir, cfg: CFG, fetchImpl: again.impl, delay: 0, log: () => {} });
    assert.equal(again.calls.filter((c) => /^\/partner\/products\/\w+$/.test(c.path) && c.path !== '/partner/products/search').length, 0);
    // No key: refused before any call.
    await assert.rejects(require('../scripts/viator-match').run({ venuesFile, outDir: dir, cfg: viator.config({}), fetchImpl: api.impl, log: () => {} }), /VIATOR_API_KEY/);
    // Dayton marks the first row ok; apply writes the two data files.
    const text = fs.readFileSync(res.csvFile, 'utf8').split('\n');
    text[1] = `ok${text[1]}`;
    fs.writeFileSync(res.csvFile, text.join('\n'));
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir);
    const applied = require('../scripts/viator-apply').run({ site: 'okanagan', csv: res.csvFile, dests: path.join(dir, 'destinations-okanagan.json'), dataDir, today: '2026-11-21', log: () => {} });
    assert.deepEqual(Object.keys(applied.venues), ['1576']);
    const m = JSON.parse(fs.readFileSync(path.join(dataDir, 'viator-matches.json'), 'utf8'));
    assert.equal(m.venues[1576].productCode, '11111P1');
    assert.equal(viator.venueMatch(1576, viator.loadMatches(path.join(dataDir, 'viator-matches.json'))).url, m.venues[1576].url);
    const d = viator.loadDestinations(path.join(dataDir, 'viator-destinations.json'));
    assert.equal(d.area, 22366);
    assert.deepEqual(d.regions, {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); viator.clearCache(); }
});
