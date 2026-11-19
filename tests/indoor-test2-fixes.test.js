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
  // Back to per person: the unit goes, the page says the bowling words (indoor test 4: "From $8 per game.").
  const sb2 = await openSetup(base, tb, { hash: 'price' });
  await sb2.click('[data-iper="person"]');
  await sb2.type('suTprice', '8');
  await sb2.click('priceSave');
  assert.equal(app.venueIndoorInfo(b.id).per, undefined);
  assert.equal(app.indoorPrice(b.id), 8);
  assert.ok(plain(page(b)).includes('From $8 per game.'));
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

// A small Kelowna for the planner and search checks: Jordan's place (with his Groups line), a gallery that closes at 5,
// a winery that closes at 5:30, a climbing gym, a pub open to 1 AM and a few restaurants.
const DAY = (a, b) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]]));
let town = null;
const kelowna = async () => {
  if (town) return town;
  const j = escape({ name: 'Exit Kelowna T2 Main', rating: 4.9, reviews: 400, great_groups: 1, kid_friendly: 1 });
  const t = tokenFor(j.id);
  await ok(change(t, { indoor_info: { kinds: ['escape', 'games'], length: '1-2h', book: 'ahead', age: 'all' } }));
  await ok(change(t, { visit_rows: { groups: 'Corporate team building and birthday parties. Groups of 10 or more: please book ahead.' } }));
  const others = [
    mk('indoor', { name: 'Kelowna Art Gallery T2', description: 'A public art gallery downtown.', rating: 4.7, reviews: 300, hours: JSON.stringify(DAY('10:00', '17:00')), arts_culture: 1 }),
    mk('winery', { name: 'Lakeview Winery T2', description: 'A winery with a tasting room.', rating: 4.8, reviews: 900, hours: JSON.stringify(DAY('11:00', '17:30')) }),
    mk('indoor', { name: 'Kelowna Climbing T2', description: 'A bouldering and climbing gym.', rating: 4.8, reviews: 200, hours: JSON.stringify(DAY('10:00', '22:00')) }),
    mk('pub', { name: 'Late Taps Pub T2', description: 'A pub with pool tables and late food.', rating: 4.4, reviews: 900, hours: JSON.stringify(DAY('11:00', '01:00')), open_late: 1 }),
    ...[1, 2, 3, 4, 5, 6].map((i) => mk('restaurant', { name: `Late Kitchen ${i} T2`, cuisine: 'Canadian', description: 'A restaurant with a late kitchen.', rating: 4.5 + i / 100, reviews: 1000 + i, hours: JSON.stringify(DAY('11:00', '23:30')), open_late: 1 })),
  ];
  town = { j, others };
  return town;
};
const names = (p) => itemsOf(p).map((x) => x.venue.name);

test('2. "team building activity / event / ideas / outing" are "team building": his Groups line puts him first (Build My Trip and search); birthday party and arcade bar find him', async () => {
  const { j } = await kelowna();
  for (const q of ['team building in Kelowna', 'team building activity in Kelowna', 'team building event kelowna', 'team building ideas Kelowna', 'team-building outing kelowna']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.equal(names(p)[0], j.name, `${q}: ${names(p).join(', ')}`);
    const stop = itemsOf(p).find((x) => x.venue.id === j.id);
    assert.ok((stop.why || stop.reasons || []).join(' ').includes('Offers team building, from its listing') || JSON.stringify(stop).includes('Offers team building'), q);
  }
  const bd = app.runTripPlan({ text: 'kids birthday party in kelowna' }, NOW);
  assert.ok(names(bd).includes(j.name), names(bd).join(', '));
  // Search: first for team building and birthday parties, and among the first for an arcade bar.
  for (const q of ['team building', 'team building activity kelowna', 'birthday party kelowna', 'kids birthday party']) {
    const r = app.runDiscovery(q, { limit: 40, now: NOW });
    assert.equal((r.results.items || [])[0] && r.results.items[0].name, j.name, `${q}: ${(r.results.items || []).map((x) => x.name).join(', ')}`);
  }
  const ab = app.runDiscovery('arcade bar kelowna', { limit: 40, now: NOW });
  assert.ok((ab.results.items || []).slice(0, 3).some((x) => x.id === j.id), (ab.results.items || []).map((x) => x.name).join(', '));
});

test('5. late night: an indoor place open past 11 PM counts for late-night requests (on that day); no Open Late badge is written', async () => {
  const { j } = await kelowna();
  const fri = app.runTripPlan({ text: 'late night fun Kelowna Friday after 11' }, NOW);
  const st = itemsOf(fri).find((x) => x.venue.id === j.id);
  assert.ok(st, names(fri).join(', '));
  assert.ok(JSON.stringify(st).includes('Open until 1 AM'), JSON.stringify(st).slice(0, 800));
  // Closed on Tuesday: not a late-night stop then.
  const tue = app.runTripPlan({ text: 'late night Tuesday in kelowna' }, NOW);
  assert.ok(!names(tue).includes(j.name), names(tue).join(', '));
  // Search finds him for late night; the stored badge stays off.
  const r = app.runDiscovery('late night kelowna', { limit: 200, now: NOW });
  assert.ok((r.results.items || []).some((x) => x.id === j.id));
  assert.equal(Number(app.getVenue(j.id).open_late || 0), 0);
});

test('6. a list for a stated time leaves out places their hours prove closed then ("Friday at 11 PM" never offers the gallery or the winery)', async () => {
  const { j, others } = await kelowna();
  const gallery = others[0], winery = others[1];
  for (const q of ['something to do Friday at 11pm in Kelowna', 'late night fun Kelowna Friday after 11']) {
    const p = app.runTripPlan({ text: q }, NOW);
    const n = names(p);
    assert.ok(!n.includes(gallery.name) && !n.includes(winery.name), `${q}: ${n.join(', ')}`);
  }
  const p = app.runTripPlan({ text: 'something to do Friday at 11pm in Kelowna' }, NOW);
  assert.ok(names(p).includes(j.name), names(p).join(', '));
  // The same request at 3 PM keeps them.
  const day = app.runTripPlan({ text: 'something to do Friday at 3pm in Kelowna' }, NOW);
  assert.ok(names(day).includes(gallery.name) || names(day).includes(winery.name), names(day).join(', '));
});

test('7. after the owner answers, the English page\'s source line matches the French: "Source: the business, checked Nov 19, 2026"', async () => {
  const v = escape();
  setBox(v.id, { rows: [{ label: 'Prices', text: '$35 per person.' }], source_url: 'https://e-exit.example/kelowna/', checked_at: '2026-10-31' });
  const t = tokenFor(v.id);
  const before = plain(page(v));
  assert.match(before, /From e-exit\.example ↗ ?, checked Oct 31, 2026/);
  await ok(change(t, { indoor_info: { kinds: ['escape'], length: '1-2h', book: 'ahead' } }));
  await ok(change(t, { indoor_price: 120 }));
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  const when = /checked (\w{3} \d{1,2}, \d{4})/.exec(en);
  assert.ok(/Source: the business, checked \w{3} \d{1,2}, \d{4}/.test(en), en.slice(0, 3000));
  assert.doesNotMatch(en, /From e-exit\.example/);
  assert.match(fr, /Source : l’établissement, vérifié le/);
  assert.ok(when);
});

test('8. polish: short kind words in the setup preview, the Good to know example by kind, Back and Skip on the prices link screen, no donation pre-filled from an adult price', async () => {
  const v = escape({ website: 'https://e-exit.example' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['escape', 'games'], length: '1-2h' } }));
  // The preview card (the finish screen): "Escape room · arcade, VR & laser tag", not the chip's long label.
  const fin = await openSetup(base, t, { hash: 'more' });
  await fin.click(fin.acts().find((a) => /^doneNow2?$|^go:finish$/.test(a)) || 'doneNow2');
  assert.match(fin.text(), /Escape room · arcade, VR &amp; laser tag|Escape room · arcade, VR & laser tag/);
  assert.doesNotMatch(fin.text(), /Arcade, VR, laser tag or karting/);
  // Good to know: no grip socks example for an escape room; a climbing gym keeps it.
  const gk = await openSetup(base, t, { hash: 'bring' });
  assert.doesNotMatch(gk.text(), /Grip socks required \(we sell/);
  assert.match(gk.text(), /Arrive 15 minutes early\. Free parking behind the building\./);
  const c = mk('indoor', { name: 'Climb T2 Polish', description: 'A climbing gym.' });
  const tc = tokenFor(c.id);
  await ok(change(tc, { indoor_info: { kinds: ['climbing'], length: '1-2h' } }));
  const gc = await openSetup(base, tc, { hash: 'bring' });
  assert.match(gc.text(), /Grip socks required \(we sell them for \$3\)/);
  // The prices link screen: Back to the choices and Skip.
  const w = await openSetup(base, t, { hash: 'menu' });
  await w.click('go:menu:web');
  assert.ok(w.acts().includes('go:menu'), w.acts().join(' | '));
  assert.ok(w.acts().some((a) => /^skip:menu$|^after:menu$/.test(a)), w.acts().join(' | '));
  await w.click('go:menu');
  assert.ok(w.acts().includes('go:menu:web'), w.acts().join(' | '));
  // A museum whose research says by donation and has an adult price: By donation is picked, the box starts empty.
  const m = mk('indoor', { name: 'Museum T2 Donation', description: 'A local history museum.', free_entry: 1 });
  setBox(m.id, { rows: [{ label: 'Admission', text: 'By donation. Adults $10 for special exhibitions.' }], source_url: 'https://museum.example', checked_at: '2026-10-20' });
  const sm = await openSetup(base, tokenFor(m.id), { hash: 'price' });
  assert.ok(sm.has('[data-ifree="donation"][aria-pressed="true"]'), sm.text().slice(0, 400));
  assert.equal(sm.doc.getElementById('suTsugg').value, '');
  // Research's own "suggested $5" still starts the box (indoor test 1).
  const m2 = mk('indoor', { name: 'Museum T2 Suggested', description: 'A local history museum.', free_entry: 1 });
  setBox(m2.id, { rows: [{ label: 'Prices', text: 'Admission by donation: suggested $5 per adult.' }], source_url: 'https://museum.example', checked_at: '2026-10-20' });
  const sm2 = await openSetup(base, tokenFor(m2.id), { hash: 'price' });
  assert.equal(sm2.doc.getElementById('suTsugg').value, '5');
});
