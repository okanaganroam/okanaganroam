// Indoor test 13 (2026-11-19; Dan, a 2-screen cinema in Penticton: shows only, no set hours, a showtimes link, walk-ins
// welcome, $14 adult, Cheap Tuesdays $8, private screenings and birthday parties). Each fix from his report, checked with
// the real setup page script and real taps (tests/setup-sim.js), Build My Trip, search, Help and the public pages. His Help
// questions are in the Help matrix (tests/indoor-help-matrix.test.js); the every-kind sweeps (slot length, the link button
// and link box, the times line, the French slot labels) in tests/indoor-kind-table.test.js and indoor-planner-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test13-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const IK = require('../indoor-kinds.js');
const T = require('../owner-setup-text.js');
const pc = require('../portal-completeness.js');
const { openSetup } = require('./setup-sim.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
const NONE = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
const STORY = 'A two-screen downtown cinema showing first-run films, with rocker seating and a licensed lounge.';
const LINK = 'https://bluebird.example/showtimes';
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T13 Fixture ${++n}`, slug: `indoor-t13-${n}`, region: 'penticton', type: 'indoor', latitude: 49.4991 + n / 3000, longitude: -119.5937,
  address: `${200 + n} Main St, Penticton, BC`, phone: '250-555-0113', website: 'https://example.com', hours: DAY('10:00', '22:00'), description: 'A fixture used only by the indoor test 13 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.86.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const setLink = (id, url) => db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(id, url);
const publishPrices = (id, items, source = 'owner') => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), ?)")
  .run(id, JSON.stringify({ sections: [{ name: 'Tickets', note: '', items: items.map(([name, price, description]) => ({ name, description: description || '', price, dietary: [], check: false })) }] }), source);
const button = (h) => (/<a [^>]*data-track="booking"[^>]*>([^<]*)<\/a>/.exec(h) || [])[1];
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const hp = (x) => String(x && typeof x === 'object' ? x.link || x.out : x).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Dan's cinema: shows only (no set hours), walk-ins welcome, 2 to 3 hours, all ages, $14, his showtimes link, a Groups
// line with birthday parties, his own prices with Cheap Tuesdays.
const dan = async (o = {}, info = {}, link = LINK) => {
  const v = mk({ name: `Bluebird Cinema T13 ${n + 1}`, cuisine: 'Movie theatre', description: STORY, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['cinema'], length: '2-3h', book: 'no', age: 'all', year: 'all', visit: 'appointment', ...info }, indoor_price: 14 }));
  await ok(change(t, { hours: NONE }));
  await ok(change(t, { visit_rows: { groups: 'Private screenings for up to 120. Birthday party packages', known_for: 'First-run movies and Cheap Tuesdays ($8 every ticket)' } }));
  if (link) setLink(v.id, link);
  approveAll(v.id);
  app.indoorCardPrice(v.id);
  return { v, t };
};

test('1. His showtimes link is a "Showtimes & tickets" button (« Horaires et billets »), never "Book a party" for his Groups line; the setup keeps his link box open under walk-ins as "Your showtimes or tickets link"', async () => {
  const { v, t } = await dan();
  assert.match(button(pageHtml(v)), /^Showtimes &amp; tickets(?: ↗)?$/);
  assert.match(button(pageHtml(v, 'fr')), /^Horaires et billets(?: ↗)?$/);
  assert.doesNotMatch(plain(pageHtml(v)), /Book a party/);
  assert.match(plain(pageHtml(v)), /Showtimes & tickets Showtimes & tickets ↗|Showtimes & tickets/);
  // A link that is itself the party page says so.
  const { v: p } = await dan({}, {}, 'https://bluebird.example/birthday-parties');
  assert.match(button(pageHtml(p)), /^Book a party(?: ↗)?$/);
  // The setup: walk-ins welcome keeps the box open, titled for showtimes (EN + FR).
  const { v: w, t: tw } = await dan({}, {}, null);
  const g = await openSetup(base, tw, { hash: 'booking' });
  await g.click('[data-tpick="book:no"]');
  assert.ok(!g.has('#suBookFold'), 'not folded behind "Have a booking page?"');
  assert.ok(g.has('#suBookUrl'));
  assert.equal(g.doc.getElementById('suLinkQ').textContent, 'Your showtimes or tickets link');
  assert.match(g.text(), /It puts a Showtimes (?:&amp;|&) tickets button on your page\./);
  assert.doesNotMatch(g.text(), /Party or group booking link/);
  const f = await openSetup(base, tw, { hash: 'booking', lang: 'fr' });
  assert.equal(f.doc.getElementById('suLinkQ').textContent, 'Votre lien d’horaires ou de billets');
  // A yoga studio's box is its class schedule; a museum's walk-in box still folds, with the party title.
  const y = mk({ name: 'Flow Yoga T13', cuisine: 'Yoga studio' }); const ty = tokenFor(y.id);
  await ok(change(ty, { indoor_info: { kinds: ['yoga'], length: '1h', book: 'no', age: 'all', year: 'all' } }));
  const gy = await openSetup(base, ty, { hash: 'booking' });
  assert.ok(!gy.has('#suBookFold'));
  assert.equal(gy.doc.getElementById('suLinkQ').textContent, 'Your class schedule link');
  const m = mk({ name: 'Town Museum T13', cuisine: 'Museum' }); const tm = tokenFor(m.id);
  await ok(change(tm, { indoor_info: { kinds: ['museum'], length: '1h', book: 'no', age: 'all', year: 'all' } }));
  const gm = await openSetup(base, tm, { hash: 'booking' });
  assert.ok(gm.has('#suBookFold'));
  assert.equal(gm.doc.getElementById('suLinkQ').textContent, T.en.indoor.tbookQParty);
  assert.ok(t && w);
});

test('2. Build My Trip: a film gets its own Time needed (2 to 3 hours: 2.5 h), or a cinema\'s 2.5 h with no answer; "dinner and a movie" is a Cinema stop and dinner, with no overlap (EN + FR)', async () => {
  // Each planner check in its own town, so the other tests' cinemas are not in it.
  const OLIVER = { region: 'oliver', latitude: 49.18, longitude: -119.55 };
  const { v } = await dan(OLIVER);
  for (let i = 0; i < 3; i++) mk({ name: `Oliver Bistro T13 ${i}`, type: 'restaurant', cuisine: 'Italian', description: 'Dinner downtown.', hours: DAY('11:00', '22:00'), ...OLIVER, latitude: 49.181 + i / 1000 });
  const slotOf = (p, id) => { const r = (p.schedule || []).find((x) => x.venueId === id); return r && r.endMinutes - r.startMinutes; };
  for (const q of ['dinner and a movie in Oliver', 'a movie and dinner in Oliver', 'souper et cinéma à Oliver']) {
    const p = app.runTripPlan({ text: q }, NOW);
    const items = itemsOf(p);
    const film = items.find((x) => x.venue.id === v.id);
    assert.ok(film, `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
    assert.equal(film.label, 'Cinema', q);
    assert.equal(frCopy.t3FrenchText(film.label), 'Cinéma');
    assert.equal(slotOf(p, v.id), 150, `${q}: ${JSON.stringify(p.schedule)}`);
    const dinner = items.find((x) => x.venue.type === 'restaurant');
    assert.ok(dinner, q);
    const a = p.schedule.find((x) => x.venueId === v.id), b = p.schedule.find((x) => x.venueId === dinner.venue.id);
    assert.ok(a.endMinutes <= b.startMinutes || b.endMinutes <= a.startMinutes, `${q}: overlap ${JSON.stringify([a, b])}`);
  }
  for (const q of ['movie in Oliver tonight', 'cinéma à Oliver samedi soir']) assert.equal(slotOf(app.runTripPlan({ text: q }, NOW), v.id), 150, q);
  // No Time needed answer: a cinema's own 2.5 hours; an hour when he says up to an hour.
  const { v: noLen } = await dan({ name: 'Rio Cinema T13', region: 'osoyoos', latitude: 49.03, longitude: -119.47 }, { length: null });
  assert.equal(slotOf(app.runTripPlan({ text: 'movie in Osoyoos tonight' }, NOW), noLen.id), 150);
  const { v: short } = await dan({ name: 'Short Reel Cinema T13', region: 'okanagan-falls', latitude: 49.34, longitude: -119.57 }, { length: '1h' });
  assert.equal(slotOf(app.runTripPlan({ text: 'movie in Okanagan Falls tonight' }, NOW), short.id), 60);
});

test('3. His page, card and Build My Trip say "Showtimes: see the schedule", linked to his showtimes (EN + FR), never "Times vary"; with no link "Times vary · check before you go" stays', async () => {
  const { v } = await dan({ region: 'lake-country', latitude: 50.05, longitude: -119.41 });
  const h = pageHtml(v), hFr = pageHtml(v, 'fr');
  assert.match(h, new RegExp(`<a href="${LINK.replace(/[.]/g, '\\.')}"[^>]*>Showtimes: see the schedule</a>`));
  assert.doesNotMatch(plain(h), /Times vary/);
  assert.match(plain(hFr), /Séances : voir l’horaire/);
  const hub = plain(await getText('/lake-country/indoor'));
  const at = hub.indexOf(v.name);
  assert.ok(at >= 0);
  assert.match(hub.slice(at, at + 400), /Showtimes: see the schedule/);
  const p = app.runTripPlan({ text: 'movie in Lake Country tonight' }, NOW);
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(stop, itemsOf(p).map((x) => x.venue.name).join(' | '));
  assert.ok(stop.caveats.includes('Showtimes: see the schedule on their Showtimes & tickets button (the owner’s own answer).'), JSON.stringify(stop.caveats));
  assert.ok(!stop.caveats.some((c) => /No usable hours listed/.test(c)), JSON.stringify(stop.caveats));
  assert.equal(frCopy.t3FrenchText('Showtimes: see the schedule on their Showtimes & tickets button (the owner’s own answer).'), 'Séances : voyez l’horaire avec leur bouton Horaires et billets (réponse de l’établissement).');
  const { v: noLink } = await dan({}, {}, null);
  assert.match(plain(pageHtml(noLink)), /Times vary · check before you go/);
});

test('4. Help: doors open before the first show (no set hours, plus a Good to know line), renting the theatre (Groups), cheap Tuesdays $8 (Your prices plus Known for, no weekly event, no open-door hours) (EN + FR)', async () => {
  const { t } = await dan();
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  for (const q of ['doors open half an hour before first show', 'doors open before the show', 'our first show is at 6']) assert.equal(en.best(q).id, 'indoor-no-hours', q);
  assert.equal(fr.best('les portes ouvrent 30 minutes avant la première séance').id, 'indoor-no-hours');
  const nh = hp(en.topic('indoor-no-hours').a);
  assert.match(nh, /your page says “Showtimes: see the schedule”, linked to it/);
  assert.match(nh, /Doors open 30 minutes before the first show/);
  assert.doesNotMatch(nh, /Add an event/);
  assert.match(hp(fr.topic('indoor-no-hours').aFr), /Portes ouvertes 30 minutes avant la première séance/);
  for (const q of ['can people rent the theatre', 'private screening', 'can we do a buyout', 'theatre rental']) assert.equal(en.best(q).id, 'indoor-groups', q);
  for (const q of ['peut-on louer la salle', 'projection privée']) assert.equal(fr.best(q).id, 'indoor-groups', q);
  const g = hp(en.topic('indoor-groups').a);
  assert.doesNotMatch(g, /Camps and school groups/);
  assert.doesNotMatch(g, /Your open hours stay as they are/);
  for (const q of ['cheap tuesdays $8', 'cheap tuesdays all tickets $8', 'cheap tuesdays']) assert.equal(en.best(q).id, 'indoor-price', q);
  assert.equal(fr.best('mardis à prix réduit 8 $').id, 'indoor-price');
  const pr = hp(en.topic('indoor-price').a);
  assert.match(pr, /A cheap night or a deal, like Cheap Tuesdays \$8 \? Type it as one of Your prices , and say it in your Known for line too/);
  const th = hp(en.topic('indoor-theme-nights').a);
  assert.doesNotMatch(th, /Add an event|open-door hours/);
  assert.match(th, /Known for/);
  // A bowling alley with set hours keeps the weekly-event step and its open-door hours.
  const b = mk({ name: 'Strike Lanes T13', cuisine: 'Bowling alley' }); const tb = tokenFor(b.id);
  await ok(change(tb, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all', year: 'all' }, indoor_price: 6.5 }));
  const bb = helpBot(await getText(`/owner/${tb}/setup`));
  assert.match(hp(bb.topic('indoor-theme-nights').a), /Add an event.*open-door hours/);
});

test('5. A request that names a day or a cheap night shows his matching price line ("Cheap Tuesdays $8"), EN + FR; other requests show the everyday lowest "From $10 (adult ticket $14)"; research prices never count', async () => {
  const ARM = { region: 'armstrong', latitude: 50.45, longitude: -119.2 };
  const { v } = await dan(ARM);
  publishPrices(v.id, [['Adult ticket', '14'], ['Seniors and kids', '10'], ['Cheap Tuesdays', '8', 'Every ticket, all day Tuesday']]);
  const costOf = (q) => { const s = itemsOf(app.runTripPlan({ text: q }, NOW)).find((x) => x.venue.id === v.id); return s && s.venue.cost; };
  for (const q of ['cheap movie night Armstrong Tuesday', 'movie in Armstrong Tuesday', 'cheap movie in Armstrong', 'cinéma pas cher à Armstrong mardi', 'cinéma à Armstrong mardi soir']) {
    const c = costOf(q);
    assert.ok(c, q);
    assert.equal(c.cents, 800, `${q}: ${JSON.stringify(c)}`);
    assert.equal(c.line, 'Cheap Tuesdays {x}', q);
  }
  // Indoor test 18 (THE PRICE RULE): other requests show the everyday lowest (seniors and kids $10; a Tuesday deal is not
  // an everyday price), with what $14 buys.
  for (const q of ['movie in Armstrong tonight', 'movie in Armstrong Saturday', 'cinéma à Armstrong samedi soir']) {
    const c = costOf(q);
    assert.equal(c.cents, 1000, q);
    assert.equal(c.line, 'From {x} (adult ticket $14)', q);
    assert.equal(c.lineFr.replace(/\s/g, ' '), 'À partir de {x} (billet adulte 14 $)', q);
  }
  // Research's prices are never his.
  const { v: r } = await dan({ region: 'enderby', latitude: 50.55, longitude: -119.14 });
  publishPrices(r.id, [['Reel Deal Tuesdays', '8.75']], 'research');
  const s = itemsOf(app.runTripPlan({ text: 'cheap movie night Enderby Tuesday' }, NOW)).find((x) => x.venue.id === r.id);
  assert.ok(!s || s.venue.cost.cents === 1400, JSON.stringify(s && s.venue.cost));
});

test('6. Polish: "Adult ticket $14" from the start on the price screen; cinema chips (Concession stand, no "Book ahead on weekends" under walk-ins); the 30-day line for no set hours; "private screening penticton" lists him first', async () => {
  const v = mk({ name: 'Bluebird Price T13', cuisine: 'Movie theatre' }); const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['cinema'], length: '2-3h', book: 'no', age: 'all', year: 'all' } }));
  const g = await openSetup(base, t, { hash: 'price' });
  await g.type('suTprice', '14');
  assert.equal(g.doc.getElementById('suTpriceLead').textContent, 'Your page will say “Adult ticket $14”.');
  await g.click('priceSave');
  assert.match(plain(pageHtml(v)), /Adult ticket \$14\./);
  assert.doesNotMatch(plain(pageHtml(v)), /Tickets from \$14/);
  // Chips: a concession stand, and no weekend booking chip once he said walk-ins welcome.
  const gk = await openSetup(base, t, { hash: 'bring' });
  assert.match(gk.text(), /Concession stand/);
  assert.doesNotMatch(gk.text(), /Café or snack bar on site|Book ahead on weekends/);
  assert.deepEqual(T.en.indoor.quick.good_to_know_kinds.cinema.length, T.fr.indoor.quick.good_to_know_kinds.cinema.length);
  // The badge line: a place with no set hours checks its details, not its hours.
  const earned = { pct: 100, complete: true, missing: [], quick: [], later: [], coming: [], groups: [], declined: [], declared: [], minutes: 0, quickSeconds: 0 };
  const noHours = pc.renderCompleteness(earned, { claimed: true, indoor: true, apptOnly: true });
  assert.match(noHours, /Keep it by checking your details at least every 30 days/);
  assert.doesNotMatch(noHours, /checking your hours/);
  assert.match(pc.renderCompleteness(earned, { claimed: true, indoor: true, apptOnly: true, fr: true }), /vérifiant vos renseignements/);
  assert.match(pc.renderCompleteness(earned, { claimed: true, indoor: true }), /checking your hours at least every 30 days/);
  // Search: his Groups line says private screenings; a hall that rents for private events and better-rated places don't.
  const { v: d } = await dan({ rating: 4.0, reviews: 40 });
  const hall = mk({ name: 'Cleland Community Theatre T13', cuisine: 'Live theatre', description: 'Community theatre.', rating: 4.8, reviews: 600 }); const th = tokenFor(hall.id);
  await ok(change(th, { indoor_info: { kinds: ['theatre'], length: '2-3h', book: 'ahead', age: 'all', year: 'all' }, visit_rows: { groups: 'Venue rental for private events' } }));
  approveAll(hall.id);
  mk({ name: 'Lakeside Resort Ballroom T13', cuisine: 'Event venue', description: 'Private events and screenings in our ballroom.', rating: 4.9, reviews: 900 });
  for (const q of ['private screening penticton', 'private screenings in penticton']) {
    const r = app.runDiscovery(q, { limit: 40, now: NOW });
    const names = (r.results.items || []).map((x) => x.name);
    assert.ok(names.indexOf(d.name) === 0 || names.slice(0, names.indexOf(d.name)).every((x) => /Bluebird Cinema T13/.test(x)), `${q}: ${names.join(', ')}`);
  }
});
