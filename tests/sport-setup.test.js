// The sport easy setup (2026-11-20; Dayton: "sports next. same way, test fix until 8.5"). Golf courses, simulators,
// ranges, arenas, skate parks, pools, courts, disc golf, BMX tracks and ski lessons (types 'sport' and 'golf') get the
// indoor engine with the sport kinds (sport-kinds.js): 7 essentials (Basics, Hours, What kind of place, Price, Walk-ins or
// booking, Who can come, Photos) and 6 optional tiles. Real taps (tests/setup-sim.js) on fixture venues (the tracked
// database has no sport or golf listings), then what the server stored, the page in English and French, the card price,
// the % checklist, Build My Trip and search. Happy hour never appears.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-setup-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Sport Fixture ${++n}`, slug: `sport-fixture-${n}`, region: 'kelowna', type, latitude: 49.886 + n / 3000, longitude: -119.495,
  rating: 4.5, reviews: 120, address: `${300 + n} Water St, Kelowna`, phone: '250-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('07:00', '19:00')),
  description: 'A fixture used only by the sport setup tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.92.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

test('1. the switch: sport and golf get the setup and the % checklist; 7 essentials and 6 optional tiles, no door or happy hour', () => {
  assert.equal(app.SPORT_SETUP_ON, true);
  for (const type of ['sport', 'golf']) {
    assert.deepEqual(app.setupParts(type).part1, ['basics', 'hours', 'indoor', 'price', 'booking', 'offer', 'photos']);
    assert.deepEqual(app.setupParts(type).part2, ['menu', 'story', 'bring', 'groups', 'social', 'closures']);
    assert.equal(pc.itemsFor(type).reduce((a, i) => a + i.w, 0), 100);
    assert.ok(!pc.itemsFor(type).some((i) => i.key === 'arrival' || i.key === 'happy_hour'));
  }
});

test('2. a golf course, Part 1 with real taps: Golf course picked, the season hint, green fees on the page and the card, Book a tee time', async () => {
  const v = mk('golf', { name: 'Sunny Pines Golf Club', description: 'An 18-hole course above the lake.' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t);
  await sim.click('go:basics');
  await sim.click('basicsOk');
  await sim.click('hoursOk');
  assert.match(sim.text(), /Most places like yours close for winter/, sim.text().slice(0, 600));
  await sim.click('yearAll');
  assert.match(sim.text(), /What kind of place are you\?/);
  assert.ok(sim.has('[data-tkind="golf"][aria-pressed="true"]'), 'Golf course picked');
  assert.equal(sim.doc.getElementById('suIndoorKinds').querySelectorAll('[data-tkind]').length, 12);
  assert.ok(sim.has('[data-tpick="length:half"][aria-pressed="true"]'));
  await sim.click('indoorSave');
  assert.deepEqual(app.venueIndoorInfo(v.id).kinds, ['golf']);
  assert.equal(app.getVenue(v.id).cuisine, 'Golf course');
  assert.match(sim.text(), /Your lowest adult green fee/);
  await sim.type('suTprice', '$59');
  await sim.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 59);
  assert.ok(sim.has('[data-tpick="book:ahead"][aria-pressed="true"]'));
  await sim.type('suBookUrl', 'https://example.com/tee-times');
  await sim.click('bookingSave');
  assert.ok(sim.has('[data-tpick="age:all"][aria-pressed="true"]'), 'All ages is a golf course\'s usual answer');
  await sim.click('offerSave');
  const en = plain(page(v));
  for (const l of ['Half a day or more.', 'Green fees from $59.', 'All ages.', 'Please book ahead.']) assert.ok(en.includes(l), l);
  const fr = plain(page(v, 'fr'));
  assert.ok(fr.includes('Droits de jeu à partir de 59 $.'), 'French price');
  const card = db.prepare('SELECT from_price, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(card.from_price, 59); assert.equal(card.basis, 'Green fees');
  assert.equal(app.indoorBookButton(app.getVenue(v.id), 'https://example.com/tee-times')[0], 'Book a tee time');
  assert.equal(app.SPORT_SETUP_ON, true);
});
