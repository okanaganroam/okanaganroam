// The indoor easy setup (2026-11-19; Dayton: "keep this nice and easy for businesses to do and not overwhelming for
// them"). Museums, galleries, theatres, spas, escape rooms, climbing gyms, bowling and play centres get the tour's engine:
// 7 essentials (Basics, Hours, What kind of place, Price, Walk-ins or booking, Who can come, Photos) and 6 optional tiles.
// The setup checks run the real setup page script with real taps (tests/setup-sim.js) on fixture indoor venues (the
// tracked database has none), then check what the server stored, the public page in English and French, the card price,
// the % checklist, Build My Trip and search.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-setup-admin-token';
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
const mk = (type, o = {}) => app.createVenue({ name: `Indoor Fixture ${++n}`, slug: `indoor-fixture-${n}`, region: 'kelowna', type, latitude: 49.886 + n / 3000, longitude: -119.495,
  rating: 4.5, reviews: 120, address: `${300 + n} Water St, Kelowna`, phone: '250-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('10:00', '18:00')),
  description: 'A fixture used only by the indoor setup tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.91.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const NOW = new Date('2026-11-19T12:00:00-08:00');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const plan = (q, o = {}) => app.runTripPlan({ text: q, ...o }, NOW);
const inPlan = (p, v) => itemsOf(p).some((x) => x.venue.id === v.id);

test('1. the switch: indoor places get the setup and the % checklist; their setup is 7 essentials and 6 optional tiles, no door or happy hour', () => {
  assert.equal(app.INDOOR_SETUP_ON, true);
  assert.deepEqual(app.INDOOR_SETUP_PART1, ['basics', 'hours', 'indoor', 'price', 'booking', 'offer', 'photos']);
  assert.deepEqual(app.INDOOR_SETUP_PART2, ['menu', 'story', 'bring', 'groups', 'social', 'closures']);
  assert.deepEqual(app.setupParts('indoor').part1, app.INDOOR_SETUP_PART1);
  assert.ok(!app.INDOOR_SETUP_PART1.concat(app.INDOOR_SETUP_PART2).some((k) => ['door', 'happy', 'specials', 'music', 'spend', 'cuisine'].includes(k)));
  assert.equal(pc.itemsFor('indoor').reduce((a, i) => a + i.w, 0), 100);
  assert.ok(!pc.itemsFor('indoor').some((i) => i.key === 'arrival'), 'no door or meeting-spot item');
  // The essentials lead: the first eight items are the basics, the kind, the hours and season, the photos.
  assert.deepEqual(pc.itemsFor('indoor').slice(0, 4).map((i) => i.key), ['address_pin', 'phone', 'website', 'indoor_kind']);
});

test('2. Part 1 with real taps (an escape room): the starting picks, the answers stored, the page lines, the card price, kids badge by age', async () => {
  const v = mk('indoor', { name: 'Exit Kelowna Escape Games', description: 'Five themed rooms. Teams work together against the clock.', hours: JSON.stringify(WK('14:00', '23:00')), kid_friendly: 1 });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t);
  assert.match(sim.text(), /The 7 essentials take about 5 minutes/);
  await sim.click('go:basics');
  await sim.click('basicsOk');
  assert.ok(sim.acts().includes('noSetHours'), 'no set hours is offered on the hours screen');
  await sim.click('hoursOk');
  // The year question: "Yes, all year" and "closed part of the year" up front, the summer and winter hours folded under one link.
  assert.deepEqual(sim.acts(), ['yearAll', 'yearClosed', 'seaMore']);
  await sim.click('yearAll');
  // What kind of place: Escape room picked from the name, 1 to 2 hours the usual (both said, both saved only with the screen).
  assert.match(sim.text(), /What kind of place are you\?/);
  assert.match(sim.text(), /We picked these from your page/);
  assert.equal(sim.doc.getElementById('suIndoorKinds').querySelectorAll('[data-tkind]').length, 12, 'the 12 most common kinds open');
  assert.ok(sim.has('[data-tkind="escape"][aria-pressed="true"]'));
  assert.ok(sim.has('[data-tpick="length:1-2h"][aria-pressed="true"]'));
  assert.deepEqual(app.venueIndoorInfo(v.id), { year: 'all' }, 'nothing saved before Save');
  // She adds Arcade (tap order kept), then saves.
  await sim.click('[data-tkind="games"]');
  await sim.click('indoorSave');
  assert.deepEqual(app.venueIndoorInfo(v.id).kinds, ['escape', 'games']);
  assert.equal(app.getVenue(v.id).cuisine, 'Escape room · arcade, VR & laser tag');
  // Price: "$32 per person" reads as 32.
  assert.match(sim.text(), /What does it cost\?/);
  await sim.type('suTprice', '$32 per person');
  await sim.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 32);
  // Booking: an escape room's usual answer (book ahead) is picked; one Save.
  assert.ok(sim.has('[data-tpick="book:ahead"][aria-pressed="true"]'));
  await sim.click('bookingSave');
  assert.equal(app.venueIndoorInfo(v.id).book, 'ahead');
  // Who can come: 8+ with an adult takes Kids welcome off (a kids trip can't be sure of their ages).
  await sim.click('[data-tpick="age:8"]');
  await sim.click('[data-tadult="1"]');
  await sim.click('offerSave');
  const info = app.venueIndoorInfo(v.id);
  assert.equal(info.age, '8'); assert.equal(info.adult, true);
  assert.equal(!!app.getVenue(v.id).kid_friendly, false);
  assert.match(sim.text(), /Add photos of your place/);
  // The page: the five answer lines in the Plan your visit rows (English), the booking card has Prices and Booking.
  const en = plain(page(v));
  for (const l of ['All year.', '1 to 2 hours.', 'Adults $32.', 'Ages 8 and up. Under 18s come with an adult.', 'Please book ahead.']) assert.ok(en.includes(l), l);
  // French page: the same lines in French, and the kinds in French.
  const fr = plain(page(v, 'fr'));
  for (const l of ['Toute l’année.', '1 à 2 heures.', 'Adultes : 32 $.', 'À partir de 8 ans. Les moins de 18 ans viennent avec un adulte.', 'Réservez à l’avance.']) assert.ok(fr.includes(l), l);
  assert.match(fr, /Jeu d’évasion/);
  // The card price is the owner's.
  const card = db.prepare('SELECT from_price, basis, reviewer FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(card.from_price, 32); assert.equal(card.basis, 'Adult admission');
});

test('3. a free museum: one tap on Free entry; the card says Free, the Free to Visit badge and Arts & Culture go on; the hub chips follow the kinds', async () => {
  const v = mk('indoor', { name: 'Lake Country Heritage House', description: 'Local history in an old house by the lake.' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'indoor' });
  assert.ok(sim.has('[data-tkind="museum"][aria-pressed="true"]'), 'Museum picked from "Heritage" in the name');
  await sim.click('[data-tkind="gallery"]');
  await sim.click('indoorSave');
  assert.equal(!!app.getVenue(v.id).arts_culture, true);
  assert.equal(app.getVenue(v.id).cuisine, 'Museum & art gallery');
  assert.ok(sim.has('[data-ifree="free"]'));
  await sim.click('[data-ifree="free"]');
  assert.ok(!sim.has('#suTprice'), 'the box goes away with Free entry');
  assert.match(sim.text(), /Your card will say “Free”/);
  await sim.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 'free');
  assert.equal(!!app.getVenue(v.id).free_entry, true);
  assert.ok(plain(page(v)).includes('Free entry.'));
  assert.ok(plain(page(v, 'fr')).includes('Entrée gratuite.'));
  const card = db.prepare('SELECT from_price, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(card.from_price, 0); assert.equal(card.basis, 'Free');
  // Walk-ins welcome is a museum's usual answer.
  assert.ok(sim.has('[data-tpick="book:no"][aria-pressed="true"]'));
  await sim.click('bookingSave');
  assert.ok(plain(page(v)).includes('Walk-ins welcome: no need to book.'));
  assert.deepEqual(app.indoorExperiencesOf(app.getVenue(v.id), ''), ['arts']);
  // A price later takes Free back off (badge too).
  const sim2 = await openSetup(base, t, { hash: 'price' });
  await sim2.click('[data-ifree="free"]');
  await sim2.type('suTprice', '12');
  await sim2.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 12);
  assert.equal(!!app.getVenue(v.id).free_entry, false);
});

test('4. French: the screens in French, a French price, and Part 2 lists the six optional tiles', async () => {
  const v = mk('indoor', { name: 'Gneiss Climbing Fixture', description: 'Bouldering and top rope.' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { lang: 'fr', hash: 'indoor' });
  assert.match(sim.text(), /Quel genre d’endroit êtes-vous.?\?/);
  assert.ok(sim.has('[data-tkind="climbing"][aria-pressed="true"]'), 'Climbing picked from the name');
  await sim.click('indoorSave');
  assert.match(sim.text(), /Combien ça coûte.?\?/);
  await sim.type('suTprice', '22,50 $');
  await sim.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 22.5);
  assert.ok(plain(page(v, 'fr')).includes('Adultes : 22,50 $.'));
  const more = await openSetup(base, t, { hash: 'more' });
  for (const l of ['Your prices', 'Your story and Known for', 'Good to know', 'Groups and parties', 'Instagram and Facebook', 'Closures and holidays']) assert.ok(more.text().includes(l), l);
});

test('5. no set hours (a theatre with shows only): one tap; the page says times vary; the season is answered and the checklist counts the hours', async () => {
  const v = mk('indoor', { name: 'Creekside Stage Fixture', description: 'A community theatre with touring shows.', hours: null });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'hours' });
  await sim.click('noSetHours');
  assert.equal(app.venueIndoorInfo(v.id).visit, 'appointment');
  const en = plain(page(v));
  assert.match(en, /Times vary · check before you go/);
  assert.match(plain(page(v, 'fr')), /Heures variables · vérifiez avant d’y aller/);
  const r = await getText(`/owner/${t}/setup/progress`);
  const done = pc.doneMap({ type: 'indoor', indoorInfo: app.venueIndoorInfo(v.id) }, '2026-11-19');
  assert.equal(done.hours, true); assert.equal(done.season, true);
  assert.equal(r.status, 200);
});

test('6. the % checklist: indoor items, answered by the setup; owner-only answers never come from research', async () => {
  const v = mk('indoor', { name: 'Kobau Lanes Fixture', description: 'Eight-lane 5-pin bowling.' });
  const t = tokenFor(v.id);
  const before = JSON.parse((await getText(`/owner/${t}/setup/progress`)).text).score;
  ok(await change(t, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all', year: 'all' } }));
  ok(await change(t, { indoor_price: 6 }));
  const after = JSON.parse((await getText(`/owner/${t}/setup/progress`)).text).score;
  assert.ok(after.pct > before.pct, `${before.pct} -> ${after.pct}`);
  const done = pc.doneMap({ type: 'indoor', indoorInfo: app.venueIndoorInfo(v.id), indoorPrice: app.indoorPriceValue(v.id) }, '2026-11-19');
  for (const k of ['indoor_kind', 'visit_length', 'indoor_price', 'indoor_booking', 'indoor_ages', 'season']) assert.equal(done[k], true, k);
  // A brand-new indoor place starts with none of its own answers (research never fills them).
  const fresh = mk('indoor', { name: 'Fresh Arcade Fixture', description: 'Arcade games.' });
  assert.deepEqual(app.venueIndoorInfo(fresh.id), {});
  // The edit page: no food picker for an indoor place, and its answer lines listed as the page shows them.
  const edit = plain((await getText(`/owner/${t}`)).text);
  assert.match(edit, /Walk-ins welcome\. Book ahead for weekends and busy times\./);
  assert.doesNotMatch(edit, /What you serve/);
  // A non-indoor type can't send indoor answers.
  const r = await change(tokenFor(mk('restaurant').id), { indoor_info: { kinds: ['museum'] } });
  assert.equal(r.status, 400);
  // Bad answers are refused with a plain message.
  assert.equal((await change(t, { indoor_info: { kinds: ['museum', 'gallery', 'spa', 'pool'] } })).status, 400);
  assert.equal((await change(t, { indoor_price: 'lots' })).status, 400);
});

test('7. Build My Trip: the owner\'s kinds plan the place for its kind; the minimum age keeps adults-only places out of family trips; the walk-ins answer is on the stop', async () => {
  // A puzzle venue whose own name and words never say "escape room": only the owner's kind does.
  const v = mk('indoor', { name: 'The Puzzle Vault Penticton', region: 'penticton', latitude: 49.49, longitude: -119.59, description: 'Themed rooms for teams of two to six.' });
  mk('indoor', { name: 'Penticton Museum Fixture', region: 'penticton', latitude: 49.492, longitude: -119.588, description: 'A city museum of local history.', kid_friendly: 1 });
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds: ['escape'], length: '1-2h', book: 'ahead', age: '12', year: 'all' } }));
  ok(await change(t, { indoor_price: 30 }));
  const facts = app.buildTripPlannerFacts(true).find((x) => x.id === v.id);
  assert.ok(facts.plannerKinds.includes('escape'), JSON.stringify(facts.plannerKinds));
  assert.equal(facts.indoorMinAge, '12'); assert.equal(facts.indoorBook, 'ahead'); assert.equal(facts.indoorPrice, 30);
  const p = plan('escape room in Penticton');
  assert.ok(inPlan(p, v), JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(JSON.stringify(stop).includes('Book ahead (the owner’s own answer).'), JSON.stringify(stop).slice(0, 600));
  // A family trip: a 12+ place is left out; an All ages one may come.
  const kids = plan('rainy day indoor activities with kids in Penticton');
  assert.ok(!inPlan(kids, v));
  // French request words find the same kind.
  assert.ok(inPlan(plan('salle d’évasion à Penticton'), v));
});

test('8. search finds an indoor place by the kind its owner picked', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const v = mk('indoor', { name: 'Hidden Lanes Fixture', description: 'A family fun centre downtown.' });
    ok(await change(tokenFor(v.id), { indoor_info: { kinds: ['bowling'] } }));
    const r = await getText(`/search?q=${encodeURIComponent('bowling in Kelowna')}`);
    assert.ok(plain(r.text).includes('Hidden Lanes Fixture'), 'found by the Bowling kind');
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('9. Help on the indoor setup: "do I have to fill all of this in" and the indoor answers are there; no happy hour topic', async () => {
  const v = mk('indoor', { name: 'Help Spa Fixture', description: 'A thermal spa.' });
  const html = (await getText(`/owner/${tokenFor(v.id)}/setup`)).text;
  const topics = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]).topics;
  for (const id of ['indoor-fill-all', 'indoor-price', 'indoor-free', 'indoor-booking', 'indoor-age', 'indoor-groups', 'indoor-good-to-know', 'indoor-no-hours']) assert.ok(topics.some((x) => x.id === id), id);
  assert.ok(!topics.some((x) => /happy hour/i.test(`${x.q}`)), 'no happy hour topic');
  const fill = topics.find((x) => x.id === 'indoor-fill-all');
  assert.match(fill.a, /Only the 7 essentials matter/);
});
