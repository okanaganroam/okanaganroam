// "Book a wine tour" (2026-11-21, wine-tours.js): one Viator wine tour per wine area (data/viator-wine-tours.json) on the
// wine guides and the wineries listings, and one "Book a wine tour (no driving)" step in Build My Trip V4's "Book my trip"
// when a day has 2+ winery stops. Only with Viator set up; never on a winery's own page; never changes which places show
// or their order. Runs on a throwaway database; restore okanagan.db from your own copy afterwards.
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

delete process.env.VIATOR_API_KEY;
delete process.env.VIATOR_PARTNER_ID;
delete process.env.VIATOR_DATA_DIR;
const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const viator = require('../viator');
const wt = require('../wine-tours');
const fx = require('./fixtures/trip-v4-kelowna.js');

const ENV = { VIATOR_API_KEY: 'test-key-not-real', VIATOR_PARTNER_ID: 'P00333119' };
const ON = viator.config(ENV);
const OFF = viator.config({});
const on = () => Object.assign(process.env, ENV);
const off = () => { delete process.env.VIATOR_API_KEY; delete process.env.VIATOR_PARTNER_ID; };
const DATA = wt.loadData();

test('data file: one real, linked product per area; every town has an area; the wine guides are named', () => {
  assert.deepEqual(Object.keys(DATA.areas).sort(), ['kelowna', 'lake-country', 'oliver-osoyoos', 'penticton']);
  for (const [k, a] of Object.entries(DATA.areas)) {
    assert.match(a.productCode, /^\d+P\d+$/, k);
    assert.ok(a.title && a.why && a.supplier, k);
    assert.ok(viator.isViatorUrl(a.url), k);
    assert.match(a.url, new RegExp(`d22366-${a.productCode}\\?`), `${k}: the URL is the product's own page`);
    assert.match(a.url, /[?&]pid=P00333119(&|$)/, `${k}: our partner id`);
  }
  const REGIONS = require('../trip-site.js').routeCorridor.concat(Object.keys(require('../trip-site.js').routeOffCorridor));
  for (const r of REGIONS) assert.ok(DATA.areas[DATA.regions[r]], `${r} has an area`);
  assert.equal(DATA.areas[DATA.defaultArea] !== undefined, true);
  for (const [g, r] of Object.entries(DATA.guides)) { assert.match(g, /^\/guides\/[a-z-]+$/); assert.ok(DATA.regions[r], `${g}: a town`); }
});

test('areas: the town\'s own area, the closest for a town without one, the default otherwise', () => {
  const a = (r) => wt.areaFor(r, DATA);
  assert.equal(a('kelowna'), 'kelowna');
  assert.equal(a('west-kelowna'), 'kelowna');
  assert.equal(a('lake-country'), 'lake-country');
  assert.equal(a('vernon'), 'lake-country');
  assert.equal(a('naramata'), 'penticton');
  assert.equal(a('penticton'), 'penticton');
  assert.equal(a('summerland'), 'penticton');
  assert.equal(a('oliver'), 'oliver-osoyoos');
  assert.equal(a('osoyoos'), 'oliver-osoyoos');
  assert.equal(a('okanagan-falls'), 'oliver-osoyoos');
  assert.equal(a(null), 'kelowna');
  assert.equal(a('nowhere'), 'kelowna');
  assert.equal(wt.guideRegion('/guides/penticton-naramata-wine-weekend', DATA), 'naramata');
  assert.equal(wt.guideRegion('/guides/oliver-osoyoos-wine-weekend/', DATA), 'oliver');
  assert.equal(wt.guideRegion('/guides/best-pizza-kelowna', DATA), undefined);
});

test('the line: off with Viator off; on, one sponsored "Book now" with the commission line, EN + FR words', () => {
  assert.equal(wt.tourFor('naramata', { cfg: OFF }), null);
  assert.equal(wt.lineHtml('naramata', { cfg: OFF }), '');
  const t = wt.tourFor('naramata', { cfg: ON });
  assert.equal(t.productCode, '325656P7');
  const h = wt.lineHtml('naramata', { cfg: ON });
  assert.equal((h.match(/<a\b/g) || []).length, 1, 'one link');
  assert.match(h, /<a href="https:\/\/www\.viator\.com\/[^"]+d22366-325656P7\?[^"]*pid=P00333119[^"]*" rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator" data-viator-code="325656P7"[^>]*>Book now ↗<\/a>/);
  assert.match(h, /<strong>Book a wine tour \(no driving\):<\/strong> <span data-fr-keep lang="en">Naramata Full Day Lunch Wine Tour/);
  assert.match(h, /data-viator-disclosure[^>]*>We may earn a commission if you book through these links\./);
  const fr = wt.lineHtml('naramata', { cfg: ON, lang: 'fr' });
  assert.match(fr, />Réserver ↗<\/a>/);
  assert.match(fr, /Réserver un circuit vinicole \(sans conduire\) :/);
  assert.match(fr, /Nous pouvons toucher une commission/);
  const ft = require('../french-text').FR_TEXT;
  assert.equal(ft['Book a wine tour (no driving):'], wt.TEXT.lead.fr);
  assert.equal(ft['Book now ↗'], 'Réserver ↗');
  assert.equal(ft[viator.DISCLOSURE.en], viator.DISCLOSURE.fr);
  assert.match(wt.clickScriptHtml('wine_guide'), /link_type: 'viator'.*surface: "wine_guide"/);
});

// ---- Build My Trip ----
const W = (id, region, name = `Winery ${id}`) => ({ venue: { id, type: 'winery', region, name } });
const R = (id, region) => ({ venue: { id, type: 'restaurant', region, name: `Bistro ${id}` } });

test('trip step: only when a day has 2+ wineries; that day\'s area; same day twice counts once', () => {
  const one = { kind: 'multi_day', days: [{ day: 1, stops: [W(1, 'naramata'), R(2, 'penticton')] }, { day: 2, stops: [W(3, 'oliver'), R(4, 'oliver')] }] };
  assert.equal(wt.tripStep(one, { cfg: ON }), null, 'one winery a day');
  const dup = { kind: 'day_plan', days: [{ day: 1, stops: [W(1, 'naramata'), W(1, 'naramata')] }] };
  assert.equal(wt.tripStep(dup, { cfg: ON }), null, 'the same winery twice');
  const two = { kind: 'multi_day', days: [{ day: 1, stops: [W(1, 'kelowna'), R(2, 'kelowna')] }, { day: 2, stops: [W(3, 'naramata'), W(5, 'penticton'), W(6, 'summerland')] }] };
  const s = wt.tripStep(two, { cfg: ON });
  assert.deepEqual({ kind: s.kind, id: s.id, name: s.name, nameFr: s.nameFr, label: s.label, labelFr: s.labelFr, rel: s.rel, link: s.link, affiliate: s.affiliate, wineTour: s.wineTour },
    { kind: 'viator', id: '325656P7', name: 'Book a wine tour (no driving)', nameFr: 'Réserver un circuit vinicole (sans conduire)', label: 'Book now', labelFr: 'Réserver', rel: 'sponsored noopener', link: 'viator', affiliate: true, wineTour: 'penticton' });
  assert.match(s.url, /pid=P00333119/);
  assert.equal(wt.tripStep(two, { cfg: OFF }), null, 'Viator off');
  const outing = { kind: 'outing', outing: { stops: [W(7, 'oliver'), W(8, 'osoyoos')] } };
  assert.equal(wt.tripStep(outing, { cfg: ON }).wineTour, 'oliver-osoyoos');
  // A plan that already has a bookable wine tour stop gets no second one.
  const withTour = { kind: 'day_plan', days: [{ day: 1, stops: [W(1, 'kelowna'), W(2, 'kelowna'), { venue: { id: 9, type: 'tour', region: 'kelowna', name: 'Fixture Wine Tours' } }] }] };
  assert.equal(wt.tripStep(withTour, { cfg: ON, bookableIds: new Set([9]) }), null);
  assert.ok(wt.tripStep(withTour, { cfg: ON, bookableIds: new Set() }), 'a tour stop with no booking link does not cover it');
});

test('trip step: added once at the end of every "Book my trip" list; stops untouched; no second Viator "Wine tours" suggestion', () => {
  const days = [{ day: 1, stops: [W(1, 'kelowna'), W(2, 'west-kelowna'), R(3, 'kelowna')] }];
  const before = JSON.stringify(days);
  const p = { kind: 'day_plan', days, v4Booking: { steps: [{ kind: 'venue', id: 3, url: 'https://example.com/book' }] }, viator: { interests: [{ key: 'wine_tour' }, { key: 'zipline' }], region: 'kelowna' } };
  const s = wt.tripStep(p, { cfg: ON });
  wt.withTripStep(p, s);
  wt.withTripStep(p, s);
  assert.deepEqual(p.v4Booking.steps.map((x) => x.id), [3, '74970P2']);
  assert.equal(JSON.stringify(p.days), before);
  assert.deepEqual(p.viator.interests.map((i) => i.key), ['zipline']);
  const only = { kind: 'day_plan', days, viator: { interests: [{ key: 'wine_tour' }] } };
  wt.withTripStep(only, s);
  assert.equal(only.viator, undefined);
  assert.deepEqual(only.v4Booking.steps.map((x) => x.id), ['74970P2']);
  const stay = { kind: 'multi_day', days, whereToStay: { pick: { id: 1, bookingSteps: [{ kind: 'stay', id: 1, url: 'https://stay.example/' }] }, alternatives: [{ id: 2 }], bookingSteps: [] } };
  wt.withTripStep(stay, s);
  assert.deepEqual(stay.whereToStay.pick.bookingSteps.map((x) => x.id), [1, '74970P2']);
  assert.deepEqual(stay.whereToStay.alternatives[0].bookingSteps.map((x) => x.id), ['74970P2']);
  assert.equal(stay.v4Booking, undefined);
});

test('V4 page: the step shows its French name; a Viator step carries data-link="viator" (counted as bmt:<v>:book:viator)', () => {
  const src = require('../trip-planner-v4-page.js').V4_CLIENT_SRC;
  assert.match(src, /\(\(fr && x\.nameFr\) \|\| x\.name\)/);
  assert.match(src, /\(\(fr && steps\[next\]\.nameFr\) \|\| steps\[next\]\.name\)/);
  const funnel = require('../trip-funnel');
  assert.equal(funnel.resolveName('bmt:v4:book:venue', 0, null, 'viator'), 'bmt:v4:book:viator');
});

// ---- Through the server ----
const app = require('../server.js');
const meta = { reason: 'wine tours fixture', batch_id: 'test-wine-tours' };
let n = 0;
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const hours = JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [['10:00', '18:00']]])));
const mk = (o) => app.createVenue({ slug: `wt-fixture-${++n}`, latitude: 49.5 + n / 1000, longitude: -119.58, rating: 4.6, hours, address: '1 Bench Rd, BC', phone: '250-555-0100', website: 'https://example.com', description: 'A fixture winery used only by the wine tour tests. Tastings daily.', ...o }, meta);
let wineryA, base, srv;
test.before(async () => {
  wineryA = mk({ name: 'Fixture Bench Winery', region: 'naramata', type: 'winery' });
  mk({ name: 'Fixture Lakeview Winery', region: 'naramata', type: 'winery' });
  mk({ name: 'Fixture Kelowna Winery', region: 'kelowna', type: 'winery' });
  const http = require('node:http');
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  off();
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const UA = { 'User-Agent': 'okanaganroam-check/1.0' };
const get = async (p) => { const r = await fetch(`${base}${p}`, { headers: UA }); return { status: r.status, text: await r.text() }; };
const SEO = [/<title>[^<]*<\/title>/, /<meta name="description"[^>]*>/, /<link rel="canonical"[^>]*>/, /<meta name="robots"[^>]*>/, /<h1[^>]*>[\s\S]*?<\/h1>/];
const ids = (html) => [...html.matchAll(/data-venue-id="(\d+)"/g)].map((m) => m[1]).join(',');
const PAGES = [
  ['/guides/penticton-naramata-wine-weekend', '325656P7'],
  ['/guides/oliver-osoyoos-wine-weekend', '325656P14'],
  ['/guides/okanagan-winter-wine', '74970P2'],
  ['/guides/okanagan-winery-restaurants', '74970P2'],
  ['/wineries', '74970P2'],
  ['/wineries?regions=naramata', '325656P7'],
  ['/naramata/wineries', '325656P7'],
  ['/kelowna/wineries', '74970P2'],
];

test('server, Viator off: no wine tour line anywhere', async () => {
  off();
  for (const [p] of PAGES) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /wine-tour-line|data-link="viator"/, p);
  }
});

test('server, Viator on: one line on each wine guide and wineries listing, the area\'s tour; SEO tags, list and order unchanged', async () => {
  for (const [p, code] of PAGES) {
    off();
    const a = (await get(p)).text;
    on();
    const b = (await get(p)).text;
    assert.equal((b.match(/class="wine-tour-line"/g) || []).length, 1, `${p}: one line`);
    assert.match(b, new RegExp(`data-viator-code="${code}"`), `${p}: ${code}`);
    assert.match(b, /rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator"/, p);
    assert.match(b, /link_type: 'viator'/, `${p}: clicks counted`);
    for (const re of SEO) assert.equal((b.match(re) || [''])[0], (a.match(re) || [''])[0], `${p} ${re}`);
    assert.equal(ids(b), ids(a), `${p}: the same places in the same order`);
  }
  // French twins: French words, the tour's own title kept.
  const fr = (await get('/fr/guides/penticton-naramata-wine-weekend')).text;
  assert.match(fr, /Réserver un circuit vinicole \(sans conduire\) :/);
  assert.match(fr, /data-link="viator"[^>]*>Réserver ↗/);
  assert.match(fr, /Nous pouvons toucher une commission si vous réservez par ces liens\./);
  assert.match(fr, /<span data-fr-keep lang="en">Naramata Full Day Lunch Wine Tour/);
  const frList = (await get('/fr/naramata/wineries')).text;
  assert.match(frList, /Réserver un circuit vinicole/);
  off();
});

test('server: never on a winery\'s own page, the first-timers guide (EN + FR) or other guides', async () => {
  on();
  const v = app.getVenue(wineryA.id);
  const html = app.renderVenuePage(v, [], [], [], {});
  assert.doesNotMatch(html, /wine-tour-line|Book a wine tour/);
  for (const p of ['/guides/best-pizza-kelowna', '/guides/okanagan-wineries-first-timers', '/fr/guides/okanagan-wineries-first-timers']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /wine-tour-line|data-link="viator"|circuit vinicole \(sans conduire\)/, `${p}: no wine tour line (first-timers lists local tour companies)`);
  }
  off();
});

test('server, Build My Trip V4: a fixture wine day gets the step only in V4 with Viator on; stops unchanged', () => {
  const text = '3 days in Kelowna with my partner, wineries, a nice dinner and a hike';
  const fresh = () => fx.plan(text, { extra: { v4: true } });
  const steps = (p) => [...((p.whereToStay && p.whereToStay.bookingSteps) || []), ...((p.v4Booking && p.v4Booking.steps) || [])];
  assert.ok(wt.wineDayRegions(fresh()).length >= 2, 'the fixture has a day with 2 wineries');
  off();
  const a = app.withTripStays(fresh(), null, new Date(), text, true);
  assert.ok(!steps(a).some((s) => s.wineTour));
  on();
  const b = app.withTripStays(fresh(), null, new Date(), text, true);
  const s = steps(b).filter((x) => x.wineTour);
  assert.equal(s.length, 1, 'one wine tour step');
  assert.equal(s[0].wineTour, 'kelowna');
  assert.equal(JSON.stringify(b.days), JSON.stringify(a.days));
  const v3 = app.withTripStays(fresh(), null, new Date(), text, false);
  assert.ok(!steps(v3).some((x) => x.wineTour), 'not on the old page');
  off();
});
