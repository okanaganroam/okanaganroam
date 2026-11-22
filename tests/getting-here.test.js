// "Getting here" (2026-11-21, getting-here.js): a "Rent a car" line (Discover Cars) in every town / ski page's existing
// "Getting around & parking" box, the ski resorts' airport shuttles on Viator, and one "Rent a car" step in Build My Trip
// V4 for a plan over 2+ towns or days -- only with DISCOVERCARS_AID set. Without it nothing shows anywhere. Runs on a
// throwaway database (the tests delete okanagan.db): back it up first and copy it back after.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

delete process.env.DISCOVERCARS_AID;
process.env.VIATOR_API_KEY = 'test-key';
process.env.VIATOR_PARTNER_ID = 'P00333119';
process.env.VIATOR_API_BASE = 'http://127.0.0.1:9/';
process.env.TRIP_PLANNER_V3 = 'on';
const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const gh = require('../getting-here');
const funnel = require('../trip-funnel');
const viator = require('../viator');

const ON = gh.config({ DISCOVERCARS_AID: 'okanaganroam' });
const OFF = gh.config({});
const on = () => { process.env.DISCOVERCARS_AID = 'okanaganroam'; };
const off = () => { delete process.env.DISCOVERCARS_AID; };
const VON = viator.config({ VIATOR_API_KEY: 'k', VIATOR_PARTNER_ID: 'P00333119' });
const VOFF = viator.config({});

test('switch: DISCOVERCARS_AID must be a plain id; links are the airport pages with a_aid', () => {
  assert.equal(ON.enabled, true);
  assert.equal(OFF.enabled, false);
  for (const bad of ['', '  ', 'a b', 'x"y', 'https://x', 'a&b=c']) assert.equal(gh.config({ DISCOVERCARS_AID: bad }).enabled, false, bad);
  assert.equal(gh.carUrl('ylw', ON), 'https://www.discovercars.com/canada/kelowna/ylw?a_aid=okanaganroam&chan=okanagan&data1=page');
  assert.equal(gh.carUrl('yyf', ON), 'https://www.discovercars.com/canada/penticton/yyf?a_aid=okanaganroam&chan=okanagan&data1=page');
  // Tracking (2026-11-22): the site channel (env override) and where the link sits.
  assert.equal(gh.carUrl('ylw', gh.config({ DISCOVERCARS_AID: 'okanaganroam', DISCOVERCARS_CHANNEL: 'test1' }), 'chat'), 'https://www.discovercars.com/canada/kelowna/ylw?a_aid=okanaganroam&chan=test1&data1=chat');
  assert.equal(gh.carUrl('ylw', gh.config({ DISCOVERCARS_AID: 'okanaganroam', DISCOVERCARS_CHANNEL: 'bad chan!' }), 'nope'), 'https://www.discovercars.com/canada/kelowna/ylw?a_aid=okanaganroam&chan=okanagan&data1=page');
  assert.equal(gh.carUrl('ylw', OFF), null);
  assert.equal(gh.airportFor('kelowna'), 'ylw');
  assert.equal(gh.airportFor('vernon'), 'ylw');
  assert.equal(gh.airportFor('osoyoos'), 'yyf');
  assert.equal(gh.airportFor('apex'), 'yyf');
  assert.equal(gh.airportFor('nowhere'), null);
});

test('data: every shuttle is a Viator product URL with our pid and campaign; each region names real items', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'getting-here.json'), 'utf8'));
  for (const [k, it] of Object.entries(d.viator)) {
    assert.ok(viator.isViatorUrl(it.url), k);
    assert.match(it.url, /[?&]pid=P00333119&/, k);
    assert.match(it.url, /[?&]campaign=okanagan&/, k);
    assert.ok(it.url.includes(`-${it.productCode}?`), k);
    assert.ok(it.label.en && it.label.fr && it.supplier, k);
  }
  for (const [r, keys] of Object.entries(d.regions)) for (const k of keys) assert.ok(d.viator[k], `${r}: ${k}`);
});

test('region box: one button per item, sponsored, commission line; nothing when off; shuttles only with Viator', () => {
  const html = '<html><head></head><body><details><summary>Getting here & parking</summary><p>Road text.</p></details><details><summary>Getting around</summary><p>x</p></details></body></html>';
  assert.equal(gh.withRegionBox(html, 'big-white', { cfg: OFF, viatorCfg: VON }), html);
  const out = gh.withRegionBox(html, 'big-white', { cfg: ON, viatorCfg: VON });
  assert.equal((out.match(/class="gh-box"/g) || []).length, 1, 'only the first box');
  assert.match(out, /<p>Road text\.<\/p><div class="gh-box" data-getting-here>/);
  assert.match(out, /<span>Rent a car at Kelowna airport \(YLW\)<\/span> <a href="https:\/\/www\.discovercars\.com\/canada\/kelowna\/ylw\?a_aid=okanaganroam&amp;chan=okanagan&amp;data1=page" rel="sponsored noopener" target="_blank" data-track="booking" data-link="discovercars" data-airport="YLW">See cars/);
  assert.equal((out.match(/data-link="viator"/g) || []).length, 2);
  assert.match(out, /data-viator-code="350808P616">Book now/);
  assert.equal((out.match(/rel="sponsored noopener"/g) || []).length, 3);
  assert.match(out, /data-gh-disclosure>We may earn a commission if you book through these links\./);
  assert.match(out, /<style id="getting-here">/);
  assert.match(out, /surface: 'getting_here'/);
  const noV = gh.withRegionBox(html, 'big-white', { cfg: ON, viatorCfg: VOFF });
  assert.doesNotMatch(noV, /data-link="viator"/);
  assert.match(noV, /data-link="discovercars"/);
  assert.match(gh.withRegionBox(html, 'penticton', { cfg: ON, viatorCfg: VON }), /Rent a car at Penticton airport \(YYF\)[\s\S]*penticton\/yyf/);
  assert.equal(gh.withRegionBox('<p>no box</p>', 'kelowna', { cfg: ON }), '<p>no box</p>');
});

test('Build My Trip step: 2+ towns or 2+ days, the first town\'s airport, at the end; stops untouched; none when off', () => {
  const day = (region) => ({ stops: [{ venue: { id: 1, name: 'A', region } }] });
  assert.equal(gh.wantsCar({ kind: 'day_plan', days: [day('kelowna')] }, null), false);
  assert.equal(gh.wantsCar({ kind: 'outing', outing: { stops: [{ venue: { region: 'kelowna' } }] } }, null), false);
  assert.equal(gh.wantsCar({ kind: 'day_plan', days: [{ stops: [{ venue: { region: 'kelowna' } }, { venue: { region: 'west-kelowna' } }] }] }, null), true);
  assert.equal(gh.wantsCar({ kind: 'multi_day', days: [day('kelowna'), day('kelowna')] }, null), true);
  assert.equal(gh.wantsCar({ kind: 'day_plan', days: [day('kelowna')] }, { arrive: '2026-12-01', leave: '2026-12-03' }), true);
  const plan = { kind: 'multi_day', days: [day('penticton'), day('kelowna')], v4Booking: { steps: [{ kind: 'venue', id: 1, url: 'https://a.example/' }], estimate: null } };
  const before = JSON.stringify(plan.days);
  gh.withTripStep(plan, null, { cfg: ON });
  gh.withTripStep(plan, null, { cfg: ON });
  assert.equal(JSON.stringify(plan.days), before);
  assert.deepEqual(plan.v4Booking.steps.map((s) => s.id), [1, 'car-yyf']);
  const s = plan.v4Booking.steps[1];
  assert.deepEqual({ kind: s.kind, name: s.name, nameFr: s.nameFr, label: s.label, labelFr: s.labelFr, url: s.url, rel: s.rel, link: s.link, affiliate: s.affiliate },
    { kind: 'transport', name: 'Rent a car at Penticton airport (YYF)', nameFr: 'Louer une voiture à l’aéroport de Penticton (YYF)', label: 'See cars', labelFr: 'Voir les voitures', url: 'https://www.discovercars.com/canada/penticton/yyf?a_aid=okanaganroam&chan=okanagan&data1=trip', rel: 'sponsored noopener', link: 'discovercars', affiliate: true });
  const stayPlan = { kind: 'multi_day', days: plan.days, whereToStay: { pick: { id: 9, bookingSteps: [{ kind: 'stay', id: 9 }] }, alternatives: [{ id: 8 }], bookingSteps: [] } };
  gh.withTripStep(stayPlan, null, { cfg: ON });
  assert.deepEqual(stayPlan.whereToStay.pick.bookingSteps.map((x) => x.id), [9, 'car-yyf']);
  assert.deepEqual(stayPlan.whereToStay.alternatives[0].bookingSteps.map((x) => x.id), ['car-yyf']);
  const offPlan = { kind: 'multi_day', days: plan.days };
  gh.withTripStep(offPlan, null, { cfg: OFF });
  assert.equal(offPlan.v4Booking, undefined);
});

test('funnel + page hooks: discovercars is its own commission kind; the V4 step link says data-link', () => {
  assert.equal(funnel.resolveName('bmt:v4:book:venue', 0, () => 'restaurant', 'discovercars'), 'bmt:v4:book:discovercars');
  assert.ok(funnel.NAMES.includes('bmt:v4:book:discovercars'));
  assert.ok(require('../site-events').EVENTS.has('bmt:v4:book:discovercars'));
  const src = gh.v4ClientSwaps("var track = step.kind === 'stay' ? 'x' : 'y';");
  assert.match(src, /step\.kind === 'transport' \? ' data-track="booking" data-link="' \+ esc\(step\.link/);
  assert.match(src, /a\[data-gh-step\]/);
  assert.doesNotMatch(src, /discovercars/, 'the page script names no partner');
});

// ---- Through the server ----
const app = require('../server.js');
const db = require('../db.js');
// A few places per town so each town and ski page renders (wineries, restaurants, beaches for a 2-day Kelowna plan).
const insert = db.prepare(`INSERT INTO venues (name, region, type, description, address, latitude, longitude, slug, hours)
  VALUES (@name, @region, @type, @description, @address, @lat, @lng, @slug, @hours)`);
const HOURS = 'Mon-Sun: 9:00 AM - 10:00 PM';
for (const [region, lat, lng] of [['kelowna', 49.888, -119.496], ['west-kelowna', 49.86, -119.58], ['penticton', 49.49, -119.59], ['big-white', 49.72, -118.93], ['silverstar', 50.36, -119.06], ['apex', 49.39, -119.9]]) {
  for (const [type, n] of [['restaurant', 4], ['winery', 4], ['beach', 2], ['cafe', 2]]) {
    for (let i = 1; i <= n; i++) {
      insert.run({ name: `Fixture ${region} ${type} ${i}`, region, type, description: 'A fixture place used only by the getting-here tests.', address: `${i} Test St`, lat: lat + i / 1000, lng: lng + (type.length / 1000), slug: `fixture-${region}-${type}-${i}`, hours: HOURS });
    }
  }
}
let base, srv;
test.before(async () => {
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

test('server, unset: no Discover Cars or shuttle line on any town or ski page', async () => {
  off();
  for (const p of ['/kelowna', '/penticton', '/big-white', '/silverstar', '/apex', '/fr/kelowna', '/fr/big-white']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /discovercars|data-getting-here|data-gh-disclosure/i, p);
  }
});

test('server, set: the line sits in the Getting around box, EN + FR; SEO tags unchanged', async () => {
  off();
  const offPages = {};
  for (const p of ['/kelowna', '/big-white', '/apex']) offPages[p] = (await get(p)).text;
  on();
  const k = (await get('/kelowna')).text;
  assert.match(k, /<summary>Getting around &(?:amp;)? parking<\/summary><p>[\s\S]*?<\/p><div class="gh-box" data-getting-here>/);
  assert.match(k, /href="https:\/\/www\.discovercars\.com\/canada\/kelowna\/ylw\?a_aid=okanaganroam&amp;chan=okanagan&amp;data1=page" rel="sponsored noopener"/);
  assert.doesNotMatch(k, /data-link="viator"[^>]*data-viator-code="350808/, 'no ski shuttles in town');
  const bw = (await get('/big-white')).text;
  assert.match(bw, /data-getting-here[\s\S]*data-viator-code="350808P616"[\s\S]*data-viator-code="5520106P1"/);
  const apex = (await get('/apex')).text;
  assert.match(apex, /penticton\/yyf\?a_aid=okanaganroam&amp;chan=okanagan&amp;data1=page[\s\S]*data-viator-code="350808P703"/);
  for (const [p, before] of Object.entries(offPages)) {
    const now = (await get(p)).text;
    for (const re of SEO) assert.equal((now.match(re) || [''])[0], (before.match(re) || [''])[0], `${p} ${re}`);
  }
  const fr = (await get('/fr/big-white')).text;
  assert.match(fr, /Louer une voiture à l’aéroport de Kelowna \(YLW\)/);
  assert.match(fr, />Voir les voitures <span aria-hidden="true">↗/);
  assert.match(fr, /Aéroport de Kelowna \(YLW\) à Big White, transfert privé/);
  assert.match(fr, /Nous pouvons toucher une commission si vous réservez par ces liens\./);
  off();
});

test('server, Build My Trip V4: "Rent a car" for a 2-day plan only when set; never on the old page; stops unchanged', async () => {
  const post = async (qs, body) => (await fetch(`${base}/api/trip/plan${qs}`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const steps = (p) => [...((p.whereToStay && p.whereToStay.bookingSteps) || []), ...((p.v4Booking && p.v4Booking.steps) || [])];
  const today = app.todayLocal();
  const body = { text: '2 days in Kelowna, wineries and a beach', stay: { arrive: app.addLocalDays(today, 5), leave: app.addLocalDays(today, 7) } };
  off();
  const a = await post('?stays=1&v=4', body);
  assert.ok(!steps(a).some((s) => s.link === 'discovercars'));
  on();
  const b = await post('?stays=1&v=4', body);
  const car = steps(b).filter((s) => s.link === 'discovercars');
  assert.ok(car.length >= 1, JSON.stringify(steps(b)));
  assert.equal(car[0].url, 'https://www.discovercars.com/canada/kelowna/ylw?a_aid=okanaganroam&chan=okanagan&data1=trip');
  assert.equal(JSON.stringify(b.days), JSON.stringify(a.days), 'the same stops with and without it');
  const v3 = await post('?stays=1', body);
  assert.ok(!steps(v3).some((s) => s.link === 'discovercars'), 'not on the old page');
  // The V4 page itself has the hook but names no partner.
  const page = (await get('/trip?v=4&stays=1')).text;
  assert.doesNotMatch(page, /discovercars/);
  off();
});
