// Indoor test 2 (2026-11-19; Jordan, owner of an escape room and arcade bar in Kelowna, on a Galaxy S23). His place: closed
// Mon/Tue, open to 1 AM on Fri/Sat, rooms priced per room (2–6 players), team building and birthday parties. Each fix from
// his report, checked with the real setup page script and real taps (tests/setup-sim.js), then on the public page (EN +
// FR), the cards, Build My Trip and search.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test2-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Jordan's hours: closed Mon/Tue, Wed/Thu 4–10 PM, Fri/Sat noon–1 AM, Sun noon–8 PM.
const JORDAN = { mon: null, tue: null, wed: [['16:00', '22:00']], thu: [['16:00', '22:00']], fri: [['12:00', '01:00']], sat: [['12:00', '01:00']], sun: [['12:00', '20:00']] };
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T2 Fixture ${++n}`, slug: `indoor-t2-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 3000, longitude: -119.49,
  address: `${1500 + n} Water St, Kelowna, BC`, phone: '250-555-0142', website: 'https://e-exit.example', hours: JSON.stringify(JORDAN), description: 'A fixture used only by the indoor test 2 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.94.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en', now = NOW) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const escape = (o = {}) => mk('indoor', { name: `Exit Kelowna Escape T2 ${n + 1}`, description: 'Escape rooms and an arcade bar in downtown Kelowna.', ...o });

test('1. per room (real taps): "120 per room 2-6 players" picks Per room or group; the page, card and Build My Trip never say per person (EN + FR)', async () => {
  const v = escape();
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['escape', 'games'], length: '1-2h' } }));
  const sim = await openSetup(base, t, { hash: 'price' });
  // Per person is the default.
  assert.ok(sim.has('[data-iper="person"][aria-pressed="true"]'), sim.text().slice(0, 600));
  await sim.type('suTprice', '120 per room 2-6 players');
  // The words picked Per room or group, and said so; the lead shows the page and card words.
  assert.ok(sim.has('[data-iper="group"][aria-pressed="true"]'), sim.screen().slice(0, 2000));
  assert.ok(!sim.doc.getElementById('suPerRead').hidden);
  assert.match(sim.doc.getElementById('suTpriceLead').textContent, /From \$120 per room \(2–6 players\).*From \$120 \/ room/);
  await sim.click('priceSave');
  assert.equal(app.indoorPrice(v.id), 120);
  const info = app.venueIndoorInfo(v.id);
  assert.equal(info.per, 'room'); assert.equal(info.per_min, 2); assert.equal(info.per_max, 6);
  // The page (EN + FR): never "Adults $120".
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.ok(en.includes('From $120 per room (2–6 players).'), en.slice(0, 3000));
  assert.ok(fr.includes('À partir de 120 $ par salle (2 à 6 joueurs).'), fr.slice(0, 3000));
  assert.doesNotMatch(en, /Adults \$120/);
  // The card: "From $120 / room" (EN), « À partir de 120 $ / salle » (FR hub).
  const card = db.prepare('SELECT from_price, per, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(card.from_price, 120); assert.equal(card.per, 'room');
  assert.match(plain(app.venueCardHtml(app.getVenue(v.id), { themed: true })), /From \$120 \/ room/);
  const hubFr = plain(await getText('/fr/indoor'));
  assert.match(hubFr, /À partir de 120 \$ \/ salle/);
  // Build My Trip: the page's words, never "per person", and not in the per-person estimate.
  const p = app.runTripPlan({ text: 'escape room in Kelowna' }, NOW);
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(stop, JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  assert.equal(stop.venue.cost.perGroup, 'room');
  assert.equal(stop.venue.cost.unit, 'From $120 per room (2–6 players)');
  assert.equal(stop.venue.cost.unitFr.replace(/\u00a0/g, ' '), 'À partir de 120 $ par salle (2 à 6 joueurs)');
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /if \(cost\.perGroup && cost\.unit\) return '<p class="t3-stop-price"><strong>'/);
  // The setup's preview card: the short kind words and "From $120 / room".
  const sim2 = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim2.doc.getElementById('suTprice').value, '120 per room (2–6 players)');
  assert.ok(sim2.has('[data-iper="group"][aria-pressed="true"]'));
  // Saving again as it is changes nothing.
  await sim2.click('priceSave');
  assert.equal(app.venueIndoorInfo(v.id).per_max, 6);
});

test('1b. per room: Per person tapped with "per room" words asks instead of saving; a tap on Per room or group with just a number uses the kind (lane for bowling)', async () => {
  const v = escape();
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['escape'], length: '1-2h' } }));
  const sim = await openSetup(base, t, { hash: 'price' });
  await sim.type('suTprice', '$120/room');
  await sim.click('[data-iper="person"]');
  await sim.click('priceSave');
  assert.match(sim.text(), /Is that price for a whole room\? Tap Per room or group/);
  assert.equal(app.indoorPrice(v.id), null);
  // "120 per group" before any tap on a fresh screen: per group.
  const b = mk('indoor', { name: 'Kelowna Bowl T2', description: 'Ten-pin bowling.' });
  const tb = tokenFor(b.id);
  await ok(change(tb, { indoor_info: { kinds: ['bowling'], length: '1-2h' } }));
  const sb = await openSetup(base, tb, { hash: 'price' });
  await sb.type('suTprice', '45');
  await sb.click('[data-iper="group"]');
  assert.match(sb.doc.getElementById('suTpriceLead').textContent, /From \$45 per lane/);
  await sb.click('priceSave');
  assert.equal(app.venueIndoorInfo(b.id).per, 'lane');
  assert.ok(plain(page(b)).includes('From $45 per lane.'));
  // Back to per person: the unit goes, the page says Adults again.
  const sb2 = await openSetup(base, tb, { hash: 'price' });
  await sb2.click('[data-iper="person"]');
  await sb2.type('suTprice', '8');
  await sb2.click('priceSave');
  assert.equal(app.venueIndoorInfo(b.id).per, undefined);
  assert.equal(app.indoorPrice(b.id), 8);
  assert.ok(plain(page(b)).includes('Adults $8.'));
  // French words: « 90 $ par équipe, jusqu'à 8 joueurs ».
  const f = escape();
  const tf = tokenFor(f.id);
  await ok(change(tf, { indoor_info: { kinds: ['escape'], length: '1-2h' } }));
  const sf = await openSetup(base, tf, { lang: 'fr', hash: 'price' });
  await sf.type('suTprice', '90 $ par équipe, jusqu’à 8 joueurs');
  assert.ok(sf.has('[data-iper="group"][aria-pressed="true"]'));
  await sf.click('priceSave');
  const fi = app.venueIndoorInfo(f.id);
  assert.equal(fi.per, 'group'); assert.equal(fi.per_max, 8);
  assert.ok(plain(page(f, 'fr')).includes('À partir de 90 $ par groupe (jusqu’à 8 joueurs).'));
});

test('3. Groups (real taps): a size chip keeps every sentence he typed, and replaces only an older size line', async () => {
  const v = escape();
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'groups' });
  await sim.type('suGroupsLine', 'Corporate team building and birthday parties. Private room for 20');
  await sim.click('[data-bgroup="10"]');
  assert.equal(sim.doc.getElementById('suGroupsLine').value.trim(), 'Corporate team building and birthday parties. Private room for 20. Groups of 10 or more: please book ahead.');
  // Another size replaces the size line only.
  await sim.click('[data-bgroup="12"]');
  const box = sim.doc.getElementById('suGroupsLine').value.trim();
  assert.equal(box, 'Corporate team building and birthday parties. Private room for 20. Groups of 12 or more: please book ahead.');
  assert.ok(sim.has('[data-bgroup="12"][aria-pressed="true"]'));
  assert.ok(sim.has('[data-bgroup="10"][aria-pressed="false"]'));
  // He types more after the chip: it starts its own sentence and nothing is lost.
  await sim.type('suGroupsLine', `${box} Kids parties on weekends`);
  await sim.click('[data-bgroup="8"]');
  assert.equal(sim.doc.getElementById('suGroupsLine').value.trim(), 'Corporate team building and birthday parties. Private room for 20. Kids parties on weekends. Groups of 8 or more: please book ahead.');
});
