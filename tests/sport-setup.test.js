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

test('3. a city skate park: Skate park picked, one tap on Free entry; the card and page say Free; no season hint for an all-year kind', async () => {
  const v = mk('sport', { name: 'Riverside Skate Park', description: 'A concrete skate park with a bowl.' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'indoor' });
  assert.ok(sim.has('[data-tkind="skatepark"][aria-pressed="true"]'));
  await sim.click('indoorSave');
  assert.equal(app.getVenue(v.id).cuisine, 'Skate park');
  await sim.click('[data-ifree="free"]');
  await sim.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 'free');
  assert.equal(!!app.getVenue(v.id).free_entry, true);
  assert.ok(sim.has('[data-tpick="book:no"][aria-pressed="true"]'), 'walk-ins are a skate park\'s usual answer');
  await sim.click('bookingSave');
  const en = plain(page(v));
  for (const l of ['Free entry.', 'Walk-ins welcome: no need to book.']) assert.ok(en.includes(l), l);
  assert.ok(plain(page(v, 'fr')).includes('Entrée gratuite.'));
  const card = db.prepare('SELECT from_price, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(card.from_price, 0); assert.equal(card.basis, 'Free');
  // Your prices is optional once it's free: the checklist counts it.
  const done = pc.doneMap({ type: 'sport', indoorInfo: app.venueIndoorInfo(v.id), indoorPrice: app.indoorPriceValue(v.id) }, '2026-11-20');
  assert.equal(done.menu, true); assert.equal(done.indoor_price, true);
});

test('4. an arena, winter only: the winter hint on the hours step, the exact price words, closed out of season, French', async () => {
  const v = mk('sport', { name: 'Lakeside Memorial Arena', description: 'Public skating and hockey.' });
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds: ['rink'] } }));
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  assert.match(sim.text(), /open in winter only/);
  ok(await change(t, { open_months: '10-01:03-31' }));
  ok(await change(t, { indoor_price: 5.5 }));
  const en = plain(page(v));
  assert.ok(en.includes('Adult public skate $5.50.'), 'an exact kind: no "from"');
  assert.ok(en.includes('Oct 1 – Mar 31.'), 'the season line');
  assert.ok(plain(page(v, 'fr')).includes('Patinage libre adulte 5,50 $.'));
  assert.equal(app.cardPriceFor(v.id), '$5.50', 'the card says the exact price');
  // Out of season the page says so (July), in season it doesn't.
  const july = plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en', now: new Date('2026-07-15T12:00:00-07:00') }));
  assert.match(july, /Closed for the season/);
  const jan = plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en', now: new Date('2027-01-15T12:00:00-08:00') }));
  assert.doesNotMatch(jan, /Closed for the season/);
});

test('5. a golf simulator (type golf): Indoor golf picked from its words, the bay price, Book a bay; the golf hub card shows the owner\'s price', async () => {
  const v = mk('golf', { name: 'Back Nine Sim Lounge', description: 'Four indoor golf simulator bays downtown.' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'indoor' });
  assert.ok(sim.has('[data-tkind="simgolf"][aria-pressed="true"]'));
  await sim.click('indoorSave');
  await sim.type('suTprice', '45');
  await sim.click('priceSave');
  assert.ok(plain(page(v)).includes('Bays from $45 an hour.'));
  assert.deepEqual(app.indoorBookButton(app.getVenue(v.id), 'https://example.com/book'), ['Book a bay', 'Réserver une baie']);
  const hub = plain((await getText('/golf')).text);
  assert.ok(hub.includes('Back Nine Sim Lounge'));
  const course = mk('golf', { name: 'Hub Check Golf Club', description: 'An 18-hole course.' });
  ok(await change(tokenFor(course.id), { indoor_info: { kinds: ['golf'] }, indoor_price: 72 }));
  const hub2 = (await getText('/golf')).text;
  const cardAt = hub2.indexOf(`data-venue-id="${course.id}"`);
  assert.ok(cardAt > 0);
  assert.match(hub2.slice(cardAt, cardAt + 4000), /From \$72/, 'the owner\'s green fee on the golf card');
});

test('6. the % checklist and Part 2: sport words, owner-only answers, no happy hour anywhere in the setup (even for a club with a happy hour badge)', async () => {
  const v = mk('golf', { name: 'Clubhouse Lake Golf Club', happy_hour: 1, description: 'An 18-hole course with a lounge.' });
  const t = tokenFor(v.id);
  assert.deepEqual(app.venueIndoorInfo(v.id), {}, 'research never fills the owner answers');
  const html = (await getText(`/owner/${t}/setup`)).text;
  const cfg = JSON.parse(/window\.SETUP_CFG = (\{[\s\S]*?\});<\/script>/.exec(html)[1].replace(/\\u003c/g, '<'));
  assert.ok(!cfg.steps.some((k) => /^(?:happy|specials|music|spend|cuisine|door)$/.test(k)), cfg.steps.join());
  assert.equal(cfg.sport, true); assert.equal(cfg.indoor, true);
  assert.deepEqual(cfg.indoorKinds.map((x) => x.k), app.SPORT_KINDS_SHOWN);
  const topics = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]).topics;
  assert.ok(!topics.some((x) => /happy hour/i.test(`${x.q} ${x.a}`) && x.id !== 'indoor-bar'), 'no happy hour topic');
  for (const id of ['sport-kinds-other', 'sport-opening-day', 'sport-weather', 'sport-tee-times', 'sport-golf-details', 'indoor-price', 'indoor-free', 'indoor-fill-all']) assert.ok(topics.some((x) => x.id === id), id);
  for (const id of ['indoor-exhibits', 'indoor-artists', 'indoor-kinds-other', 'indoor-ticket-prices']) assert.ok(!topics.some((x) => x.id === id), `no ${id}`);
  const more = await openSetup(base, t, { hash: 'more' });
  for (const l of ['Your prices', 'Your story and Known for', 'Good to know', 'Groups and events', 'Instagram and Facebook', 'Closures and holidays']) assert.ok(more.text().includes(l), l);
  ok(await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'ahead', age: 'all', year: 'all' } }));
  ok(await change(t, { indoor_price: 89 }));
  const done = pc.doneMap({ type: 'golf', indoorInfo: app.venueIndoorInfo(v.id), indoorPrice: app.indoorPriceValue(v.id) }, '2026-11-20');
  for (const k of ['indoor_kind', 'visit_length', 'indoor_price', 'indoor_booking', 'indoor_ages', 'season']) assert.equal(done[k], true, k);
  // Wrong kinds are refused: an indoor kind on a golf listing, or more than 3.
  assert.equal((await change(t, { indoor_info: { kinds: ['museum'] } })).status, 400);
  assert.equal((await change(t, { indoor_info: { kinds: ['golf', 'range', 'simgolf', 'rink'] } })).status, 400);
  // And a sport kind on an indoor place.
  assert.equal((await change(tokenFor(mk('indoor').id), { indoor_info: { kinds: ['golf'] } })).status, 400);
  // The French setup.
  const fr = await openSetup(base, t, { lang: 'fr', hash: 'indoor' });
  assert.match(fr.text(), /Terrain de golf/);
});

test('7. Build My Trip: a skate park its owner set up is planned for "skate park"; a golf course\'s own price and booking answer are on its stop; a 19+ simulator stays out of a kids trip', async () => {
  const park = mk('sport', { name: 'Lower Bench Youth Park', region: 'penticton', latitude: 49.49, longitude: -119.59, description: 'A place for kids to ride and roll.' });
  ok(await change(tokenFor(park.id), { indoor_info: { kinds: ['skatepark'], age: 'all', book: 'no', year: 'all' }, indoor_price: 'free' }));
  const f = app.buildTripPlannerFacts(true).find((x) => x.id === park.id);
  assert.ok(f && f.type === 'outdoor', 'planned as an outdoor stop');
  assert.ok(f.plannerKinds.includes('skatepark'), JSON.stringify(f.plannerKinds));
  const NOW = new Date('2026-07-15T12:00:00-07:00');
  const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
  const p = app.runTripPlan({ text: 'skate park in Penticton' }, NOW);
  assert.ok(itemsOf(p).some((x) => x.venue.id === park.id), JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  const golf = mk('golf', { name: 'Ridge View Golf Course', region: 'penticton', latitude: 49.50, longitude: -119.58, description: 'An 18-hole course.' });
  ok(await change(tokenFor(golf.id), { indoor_info: { kinds: ['golf'], book: 'ahead', age: 'all', year: 'all', length: 'half' }, indoor_price: 59 }));
  const gf = app.buildTripPlannerFacts(true).find((x) => x.id === golf.id);
  assert.equal(gf.kindOwn, true); assert.equal(gf.indoorPrice, 59); assert.deepEqual(gf.indoorPriceLine, ['Green fees from {x}', 'Droits de jeu à partir de {x}']);
  const gp = app.runTripPlan({ text: 'golf in Penticton' }, NOW);
  const stop = itemsOf(gp).find((x) => x.venue.id === golf.id);
  assert.ok(stop, JSON.stringify(itemsOf(gp).map((x) => x.venue.name)));
  assert.ok(JSON.stringify(stop).includes('Green fees from'), JSON.stringify(stop).slice(0, 800));
});

test('8. search finds a sports place by the kind its owner picked', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const v = mk('sport', { name: 'Westside Racquet Fixture', description: 'Courts by the community hall.' });
    ok(await change(tokenFor(v.id), { indoor_info: { kinds: ['courts'] } }));
    const r = await getText(`/search?q=${encodeURIComponent('pickleball in Kelowna')}`);
    assert.ok(plain(r.text).includes('Westside Racquet Fixture'), 'found by the courts kind');
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('9. the edit page (golf with a happy hour badge): the checklist and the answer lines; no happy hour box or tile; Help without happy hour', async () => {
  const v = mk('golf', { name: 'Edit Page Golf Club', happy_hour: 1, description: 'An 18-hole course.' });
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 70 }));
  const html = (await getText(`/owner/${t}`)).text;
  assert.match(html, /id="opComplete"/, 'the checklist');
  const text = plain(html);
  assert.match(text, /Green fees from \$70\./);
  assert.match(text, /Please book ahead\./);
  assert.doesNotMatch(text, /Your times and what’s on special/, 'no happy hour tile');
  assert.ok(!/id="happy"/.test(html), 'no happy hour box');
  assert.match(text, /Tournaments, clinics, leagues and more/, 'the events tile in sport words');
  const fr = plain((await getText(`/fr/owner/${t}`)).text);
  assert.match(fr, /Droits de jeu à partir de 70 \$\./);
  // The public page keeps what research found (no data change).
  assert.ok(app.getVenue(v.id).happy_hour);
});

test('10. research lines her answers make wrong come off her page (a skate park research said "Closed Mondays" and "$5 entry"; she says open daily and free)', async () => {
  const v = mk('sport', { name: 'Research Skate Park', description: 'A skate park with a bowl. Closed Mondays.' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(v.id, JSON.stringify({ rows: [{ label: 'Good to know', text: 'Closed Mondays. Helmets recommended.' }, { label: 'Prices', text: 'Entry $5 per person.' }], source_url: 'https://research.example', checked_at: '2026-10-01' }));
  const t = tokenFor(v.id);
  ok(await change(t, { indoor_info: { kinds: ['skatepark'], book: 'no', age: 'all', year: 'all' }, indoor_price: 'free' }));
  // Her hours (every day, Mondays included) from the hours screen.
  ok(await change(t, { hours: WK('08:00', '22:00') }));
  const en = plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'en', now: new Date('2026-11-20T12:00:00-08:00') }));
  assert.ok(en.includes('Free entry.'));
  assert.ok(!en.includes('Entry $5 per person.'), 'research\'s price is replaced by her answer');
  assert.ok(en.includes('Helmets recommended.'), 'the rest of research\'s line stays');
  assert.ok(!/Closed Mondays\. Helmets/.test(en), 'the closed day her hours contradict is off her page');
});
