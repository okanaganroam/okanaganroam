// Whistler tour test 6 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour6-2026-11-17/REPORT.md:
// Sophie-Anne, operations manager of a zipline + treetop park with summer e-bike rentals, Android, French). Covers bugs
// 1-10, the Minor list, the wording table and suggested fixes 1-8, in English and French, and that the other setup types
// still load. The Help questions are in tour-help-routing.test.js; planner words in tour-planner-words.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr6-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tr = require('../trip-requirements.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const { createArrivalPoints } = require('../arrival-points');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const V3 = fs.readFileSync(path.join(ROOT, 'trip-planner-v3-page.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const NONE = Object.fromEntries(DAYS.map((d) => [d, null]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr6 ${++n}`, slug: `tour-wr6-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.39.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);
const box = (id) => { const r = db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : null; };
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };
// Sophie-Anne's listing, moved to Penticton: research partly wrong on purpose (badges Lake view, Vegan, Patio, Happy hour,
// Dog-friendly; English research rows).
let skyCache = null;
function sky() {
  if (skyCache) return skyCache;
  const v = mk('tour', { name: 'Sky Line Ziplines & Adventure Park', slug: 'sky-line-ziplines-wr6', cuisine: 'Ziplines, treetop adventure course & e-bike rentals', rating: 4.7, reviews: 143,
    description: 'Ziplines over the canyon, a treetop adventure course and summer e-bike rentals, a short shuttle from our village office.', lake_view: 1, vegan: 1, patio: 1, happy_hour: 1, dog_friendly: 1 });
  setBox(v.id, { rows: [
    { label: 'Known for', text: 'Ziplines and a treetop adventure course' },
    { label: 'Prices', text: 'From $79 per person' },
    { label: 'Good to know', text: 'Free parking at the course; e-bike rentals all year; patio with drinks' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  skyCache = { v, t: tokenFor(v.id) };
  return skyCache;
}

test('1. per-unit prices: "69 par vélo", "$69/bike", "$40 per hour" are never a price per person; the nudge points to Your tours and prices (EN + FR)', async () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(clientFn('moneyHead') + clientFn('feeHours') + clientFn('priceTrim') + clientFn('tourPriceWhy') + clientFn('tourPriceRead') + clientFn('tourPriceNumber'), ctx);
  const why = (x, priv) => vm.runInContext(`tourPriceWhy(${JSON.stringify(x)}, ${!!priv})`, ctx);
  const rd = (x, priv) => vm.runInContext(`tourPriceRead(${JSON.stringify(x)}, ${!!priv})`, ctx);
  const UNIT = ['69 par vélo', '$69/bike', '69$ / vélo', '69 $ par vélo électrique', '$69 per e-bike', '$40 per hour', '40/hr', '45 $ de l’heure', '$45 kayak rental', '35 per kayak', '30 per board', '25 / SUP',
    '120 per canoe', '50 per pair of skis', '20 per snowshoe set', '15 per helmet', '200 per vehicle', '250 per sled', '90 per horse', '180 per room', '69 per unit', '150 per day', '69 par location', '69/rental'];
  for (const x of UNIT) { assert.equal(why(x), 'unit', x); assert.ok(Number.isNaN(rd(x)), x); assert.equal(app.tourPriceWhy(x), 'unit', `server ${x}`); }
  for (const x of ['650 per boat', '$650 per group', '1100 for the whole raft', '650 per charter']) { assert.equal(why(x), 'group', x); assert.equal(app.tourPriceWhy(x), 'group', x); }
  for (const [x, want] of [['69', 69], ['$159 pp', 159], ['159 $ par personne', 159], ['95 per seat', 95], ['from 79', 79], ['à partir de 79 $', 79]]) { assert.equal(rd(x), want, x); }
  for (const x of ['95 per child', '95 per tour']) assert.equal(why(x), 'many', x);
  // The private box: "1500$ et plus", "from 1500", "1 500 $ et plus" read as the number (they were refused).
  for (const [x, want] of [['1500$ et plus', 1500], ['from 1500', 1500], ['1 500 $ et plus', 1500], ['$1,500+', 1500], ['1500 and up', 1500], ['à partir de 1500', 1500]]) { assert.equal(rd(x, true), want, x); assert.deepEqual(app.cleanTourPrice(x), { value: want }, `server ${x}`); }
  // Server: refused with the per-bike reason; nothing saved.
  assert.match(app.cleanTourPrice('69 par vélo', true).error, /per bike or per rental/);
  const { v, t } = sky();
  const bad = await change(t, { tour_price: '$69/bike' });
  assert.equal(bad.status, 400); assert.equal(app.tourPrice(v.id), null);
  // The nudge (EN + FR), its button to Your tours and prices, and the hint naming both cases.
  assert.equal(text.en.tour.tpriceUnit, 'Priced per bike or per rental? Put your lowest per-person trip price here; list the per-bike price in Your tours and prices.');
  assert.match(text.fr.tour.tpriceUnit, /^Prix par vélo ou par location\s?\? Mettez votre prix le plus bas par personne ici\s?; le prix par vélo va dans Vos sorties et tarifs\.$/);
  assert.match(text.en.tour.tpriceUnitRentals, /^Rentals only\?/); assert.match(text.fr.tour.tpriceUnitRentals, /^Seulement de la location/);
  assert.match(text.en.tour.tpriceMore, /per boat\? Use Private tours below\. Priced per bike or per rental\? Put it in Your tours and prices\.$/);
  assert.match(text.fr.tour.tpriceMore, /par vélo ou par location\s?\? Mettez-le dans Vos sorties et tarifs\.$/);
  assert.match(CLIENT, /pwhy === 'unit' && T\.tpriceUnit \?/);
  assert.match(CLIENT, /if \(k === 'tpriceToMenu'\) \{ readTour\(\); S\.menuReturn = 'price'; return go\('menu'\); \}/);
  assert.match(CLIENT, /if \(step === 'menu' && S\.menuReturn\)/);
  // Rentals only: the Prices line says "From $69." with no "a person".
  ok(await change(t, { tour_info: { kinds: ['rentals'] }, tour_price: 69 }));
  assert.match(plain(page(app.getVenue(v.id))), /From \$69\.(?! a person)/);
  assert.doesNotMatch(plain(page(app.getVenue(v.id))), /From \$69 a person/);
  assert.match(plain(page(app.getVenue(v.id), 'fr')), /À partir de 69 \$\.?/);
  ok(await change(t, { tour_info: { kinds: ['zipline', 'adventure', 'bike'] } }));
  assert.match(plain(page(app.getVenue(v.id))), /From \$69 a person/);
});
