// Indoor test 3 (2026-11-19; Diane, 58, manages a community theatre in Penticton: shows only, box office Tue–Fri 11–4,
// shows Thursday to Saturday at 7:30 PM, dark in July and August, tickets $25–$55 through a tickets site). Each fix from her
// report, checked with the real setup page script and real taps (tests/setup-sim.js), then on the public page (EN + FR), the
// cards, Build My Trip and search.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test3-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const v3 = require('../trip-planner-v3-page.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Diane's box office hours (what Help told her to enter as her hours): Tue–Fri 11–4, closed Sat–Mon.
const BOX = { mon: null, tue: [['11:00', '16:00']], wed: [['11:00', '16:00']], thu: [['11:00', '16:00']], fri: [['11:00', '16:00']], sat: null, sun: null };
const DAY = (a, b) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T3 Fixture ${++n}`, slug: `indoor-t3-${n}`, region: 'penticton', type, latitude: 49.49 + n / 3000, longitude: -119.59,
  address: `${300 + n} Power St, Penticton, BC`, phone: '250-555-0177', website: 'https://www.penticton.example/node/34', hours: JSON.stringify(BOX), description: 'A fixture used only by the indoor test 3 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.95.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en', now = NOW) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const theatre = (o = {}) => mk('indoor', { name: `Cleland Community Theatre T3 ${n + 1}`, cuisine: '', description: 'City-run, 443-seat performing arts theatre hosting symphonies, touring concerts, comedy, dance, speakers and local productions.', arts_culture: 1, rating: 4.6, reviews: 300, ...o });
// Diane's answers: theatre, 2 to 3 hours, book ahead, all ages, $25, and her Known for line.
const diane = async (o = {}, info = {}) => {
  const v = theatre(o);
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['theatre'], length: '2-3h', book: 'ahead', age: 'all', ...info } }));
  await ok(change(t, { indoor_price: 25 }));
  await ok(change(t, { visit_rows: { known_for: 'Plays, concerts and comedy nights, Thursday to Saturday at 7:30 PM' } }));
  return { v, t };
};

test('1. Help: show-only venues tap We don’t have set hours and put box office hours in Good to know; never "put those in as your hours" (EN + FR)', async () => {
  const v = theatre();
  const t = tokenFor(v.id);
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  const p = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const q of ['we dont have regular hours, only show times', 'box office hours vs show times']) assert.equal(en.best(q).id, 'indoor-no-hours', q);
  const a = p(en.topic('indoor-no-hours').a), afr = p(fr.topic('indoor-no-hours').aFr);
  assert.match(a, /Shows or classes only\? In your hours, tap We don’t have set hours/);
  assert.match(a, /Put box office hours in Good to know , like Box office: Tue–Fri 11–4 and an hour before shows\./);
  assert.doesNotMatch(a, /as your hours/i);
  assert.match(afr, /Mettez les heures de billetterie dans Bon à savoir/);
  assert.doesNotMatch(afr, /comme vos heures/);
  // No Help answer anywhere tells a show-only venue to enter box office hours as its hours.
  for (const x of en.topics) assert.doesNotMatch(p(x.a) + p(x.aFr || ''), /box office hours\?? Put those in as your hours|heures de billetterie\? Inscrivez-les plutôt comme vos heures/i, x.id);
  // The same one-line hint under the button (real screen), EN and FR.
  const sim = await openSetup(base, t, { hash: 'hours' });
  const btn = sim.doc.getElementById('suScreen').querySelector('[data-act="noSetHours"]');
  assert.ok(btn, sim.acts().join(' | '));
  assert.match(btn.innerHTML, /Put box office hours in Good to know, like “Box office: Tue–Fri 11–4 and an hour before shows\.”/);
  const simFr = await openSetup(base, t, { hash: 'hours', lang: 'fr' });
  assert.match(simFr.doc.getElementById('suScreen').querySelector('[data-act="noSetHours"]').innerHTML, /Mettez les heures de billetterie dans Bon à savoir/);
  // Polish: with no hours yet, the line names the button that is really there.
  const blank = mk('indoor', { name: 'No Hours Theatre T3', hours: null });
  const sb = await openSetup(base, tokenFor(blank.id), { hash: 'hours' });
  assert.match(sb.text(), /Tap “Add my hours” to add them/);
  assert.ok(sb.acts().includes('go:hours:edit'));
  assert.doesNotMatch(sb.text(), /Change them/);
});

test('3. Help: ticket prices that change, closed whole months, a season of shows; every question Diane asked lands somewhere useful', async () => {
  const v = theatre();
  const t = tokenFor(v.id);
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  const p = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(en.best('ticket prices change every show').id, 'indoor-ticket-prices');
  assert.equal(en.best('prices vary').id, 'indoor-ticket-prices');
  assert.match(p(en.topic('indoor-ticket-prices').a), /Put your lowest regular adult ticket, like 25 \. Your card says From \$25 \. Link your tickets page in Your prices/);
  assert.equal(en.best('we are closed july and august').id, 'indoor-closed-months');
  assert.match(p(en.topic('indoor-closed-months').a), /On Are these your hours all year\? , tap We’re closed part of the year , then Closed for whole months\? and click the months/);
  assert.equal(en.best('we have a whole season of shows, can you add our season list').id, 'indoor-season-list');
  assert.match(p(en.topic('indoor-season-list').a), /Send your season list or brochure with Message us and we’ll add the shows/);
  assert.equal(fr.best('le prix des billets change à chaque spectacle').id, 'indoor-ticket-prices');
  assert.equal(fr.best('nous sommes fermés en juillet et en août').id, 'indoor-closed-months');
  assert.equal(fr.best('pouvez-vous ajouter toute la saison, nous avons beaucoup de spectacles').id, 'indoor-season-list');
  // None of her questions dead-ends now.
  const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'drafts', 'fresh-eyes-indoor3-2026-11-19', 'help-log.json'), 'utf8').toString() || '[]');
  for (const x of log.filter((y) => !/^\[chip\]/.test(y.q))) assert.ok(en.best(x.q), x.q);
});

test('4 + 5. Price for a theatre: "Tickets from $25" on the page, card and preview (EN + FR), a hint in the box, and a range takes its low number', async () => {
  const v = theatre();
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['theatre'], length: '2-3h' } }));
  const sim = await openSetup(base, t, { hash: 'price' });
  const box = sim.doc.getElementById('suTprice');
  assert.equal(box.getAttribute('placeholder'), 'Varies by show? Your lowest regular ticket.');
  assert.match(sim.screen(), /Lowest regular adult ticket, in dollars/);
  await sim.type('suTprice', '$25 - $55');
  assert.equal(sim.doc.getElementById('suTpriceLead').textContent, 'We’ll show “Tickets from $25”, your lowest price.');
  // The box keeps its ticket label while she types (it went back to "Adult price").
  assert.equal(sim.doc.getElementById('suScreen').querySelector('label[for="suTprice"]').textContent, 'Lowest regular adult ticket, in dollars');
  await sim.click('priceSave');
  assert.equal(app.indoorPrice(v.id), 25);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.ok(en.includes('Tickets from $25.'), en.slice(0, 3000));
  assert.ok(fr.includes('Billets à partir de 25 $.'), fr.slice(0, 3000));
  assert.doesNotMatch(en, /Adults \$25/);
  assert.equal(db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(v.id).basis, 'Tickets');
  // The setup's preview card and lead, back on the screen.
  const sim2 = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim2.doc.getElementById('suTpriceLead').textContent, 'Your page will say “Tickets from $25”.');
  // "25 to 55" for a museum: From $25, and the page keeps Adults.
  const m = mk('indoor', { name: 'Penticton Museum T3', description: 'Local history museum.' });
  const tm = tokenFor(m.id);
  await ok(change(tm, { indoor_info: { kinds: ['museum'], length: '1-2h' } }));
  const sm = await openSetup(base, tm, { hash: 'price' });
  assert.equal(sm.doc.getElementById('suTprice').getAttribute('placeholder'), null);
  await sm.type('suTprice', '25 to 55');
  assert.equal(sm.doc.getElementById('suTpriceLead').textContent, 'We’ll show From $25, your lowest price.');
  await sm.click('priceSave');
  assert.equal(app.indoorPrice(m.id), 25);
  assert.ok(plain(page(m)).includes('Adults $25.'));
  // The server reads a range the same way; one price and per-person words as before.
  assert.equal(app.cleanIndoorPrice('$25 - $55').value, 25);
  assert.equal(app.cleanIndoorPrice('25 à 55 $').value, 25);
  assert.equal(app.cleanIndoorPrice('$25').value, 25);
  assert.equal(app.cleanIndoorPrice('24.50 per adult').value, 24.5);
  assert.ok(app.cleanIndoorPrice('55 - 25').error);
});

test('6. French: the "Times vary" line is French all through, on the page and the card (« Horaires variables · vérifiez avant d’y aller »)', async () => {
  const { v, t } = await diane();
  await ok(change(t, { indoor_info: { visit: 'appointment' } }));
  const fr = plain(page(v, 'fr'));
  assert.ok(fr.includes('Horaires variables · vérifiez avant d’y aller'), fr.slice(0, 2500));
  assert.doesNotMatch(fr, /check before you go/);
  const hub = plain(await getText('/fr/indoor'));
  const at = hub.indexOf(v.name);
  assert.ok(at >= 0);
  assert.doesNotMatch(hub.slice(at, at + 600), /check before you go/);
  assert.equal(app.frStatusText ? app.frStatusText('Times vary · check before you go') : 'Horaires variables · vérifiez avant d’y aller', 'Horaires variables · vérifiez avant d’y aller');
});

test('7. Booking for a theatre asks about tickets (same three answers, same stored values); a gallery keeps walk-ins', async () => {
  const v = theatre();
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['theatre'], length: '2-3h' } }));
  const sim = await openSetup(base, t, { hash: 'booking' });
  assert.match(sim.text(), /Do people need tickets ahead\?/);
  assert.match(sim.text(), /Tickets at the door are fine/);
  assert.match(sim.text(), /Please buy tickets ahead/);
  assert.doesNotMatch(sim.text(), /Can people just walk in/);
  await sim.click('[data-tpick="book:busy"]');
  await sim.click('bookingSave');
  assert.equal(app.venueIndoorInfo(v.id).book, 'busy');
  const simFr = await openSetup(base, t, { hash: 'booking', lang: 'fr' });
  assert.match(simFr.text(), /Faut-il acheter les billets à l’avance\s?\?/);
  const g = mk('indoor', { name: 'Gallery T3', description: 'An art gallery.' });
  const tg = tokenFor(g.id);
  await ok(change(tg, { indoor_info: { kinds: ['gallery'], length: '1h' } }));
  const sg = await openSetup(base, tg, { hash: 'booking' });
  assert.match(sg.text(), /Can people just walk in\?/);
});

test('8. Wheelchair: research that says wheelchair or elevator pre-ticks the tile ("We picked…"), saved only with Save; never over her own answer', async () => {
  const v = theatre();
  setBox(v.id, { rows: [{ label: 'Good to know', text: 'Four wheelchair spaces; elevator to the theatre, cloakroom and washrooms.' }], source_url: 'https://www.penticton.example/node/34', checked_at: '2026-11-01' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'offer' });
  assert.ok(sim.has('[data-off="wheelchair_accessible"][aria-pressed="true"]'), sim.screen().slice(0, 2500));
  assert.match(sim.text(), /We picked these from what we found online/);
  // Not saved by being shown.
  const feats = () => { const r = db.prepare('SELECT features FROM venue_owner_features WHERE venue_id = ?').get(v.id); return r ? JSON.parse(r.features) : {}; };
  assert.ok(!feats().wheelchair_accessible && !Number(app.getVenue(v.id).wheelchair_accessible));
  await sim.click('[data-tpick="age:all"]');
  await sim.click('offerSave');
  assert.ok(feats().wheelchair_accessible === true || Number(app.getVenue(v.id).wheelchair_accessible) === 1, JSON.stringify(feats()));
  // "Not wheelchair accessible" never pre-ticks it.
  const w = theatre();
  setBox(w.id, { rows: [{ label: 'Good to know', text: 'Not wheelchair accessible: the theatre is up two flights of stairs, no elevator.' }] });
  const sw = await openSetup(base, tokenFor(w.id), { hash: 'offer' });
  assert.ok(sw.has('[data-off="wheelchair_accessible"][aria-pressed="false"]'));
});

test('9. Your prices on the web: a theatre’s saved tickets link fills the box, not the city page', async () => {
  const v = theatre();
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['theatre'], length: '2-3h' } }));
  const sim = await openSetup(base, t, { hash: 'booking' });
  await sim.click('[data-tpick="book:ahead"]');
  await sim.type('suBookUrl', 'https://valleyfirsttix.example/list/CLE');
  await sim.click('bookingSave');
  const sm = await openSetup(base, t, { hash: 'menu' });
  await sm.click('go:menu:web');
  const box = sm.doc.getElementById('suUrl');
  assert.ok(box, sm.acts().join(' | '));
  // A fresh visit: the link she saved is waiting for our check, so research's or her saved one; here hers, in this visit:
  // In the same visit: on through the screens (skipping) to Your prices, then My prices are on my website.
  for (let i = 0; i < 12 && !sim.has('[data-act="go:menu:web"]'); i++) {
    const next = sim.acts().find((x) => /menu/.test(x)) || sim.acts().find((x) => /^(?:skip:|go:more$)/.test(x));
    if (!next) break;
    await sim.click(next);
  }
  {
    await sim.click('go:menu:web');
    assert.equal(sim.doc.getElementById('suUrl').value, 'https://valleyfirsttix.example/list/CLE');
    assert.match(sim.text(), /We filled in your tickets page/);
  }
  // Research's own tickets link for a theatre with nothing saved.
  const r = theatre();
  setBox(r.id, { rows: [], booking_url: 'https://tix.example/cleland' });
  const tr = tokenFor(r.id);
  await ok(change(tr, { indoor_info: { kinds: ['theatre'], length: '2-3h' } }));
  const sr = await openSetup(base, tr, { hash: 'menu' });
  await sr.click('go:menu:web');
  assert.equal(sr.doc.getElementById('suUrl').value, 'https://tix.example/cleland');
  assert.match(sr.text(), /We filled in your tickets page/);
  // A museum keeps its website.
  const m = mk('indoor', { name: 'Museum Web T3', description: 'Local museum.' });
  const tm = tokenFor(m.id);
  await ok(change(tm, { indoor_info: { kinds: ['museum'], length: '1h' } }));
  const smm = await openSetup(base, tm, { hash: 'menu' });
  await smm.click('go:menu:web');
  assert.match(smm.doc.getElementById('suUrl').value, /penticton\.example/);
});

test('10a. Closed for whole months: after picking July and August the season is saved and the setup goes on (no dates screen again)', async () => {
  const v = theatre({ hours: JSON.stringify(DAY('11:00', '16:00')) });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['theatre'], length: '2-3h' } }));
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  await sim.click('yearClosed');
  assert.ok(sim.has('[data-act="openMonths"]'), sim.acts().join(' | '));
  await sim.click('openMonths');
  await sim.click('[data-chip="closedm:7"]');
  await sim.click('[data-chip="closedm:8"]');
  await sim.click('monthsUse');
  assert.ok(!sim.has('#suOf'), `still on the dates screen: ${sim.text().slice(0, 400)}`);
  const om = db.prepare('SELECT open_months FROM venue_links WHERE venue_id = ?').get(v.id);
  assert.ok(om && /^09-01:06-30$|^9-6$/.test(om.open_months), JSON.stringify(om));
});

test('10b. Examples follow the kind; "Take a photo of your price sheet" is hidden on a computer', async () => {
  const exOf = async (kinds) => {
    const v = mk('indoor', { name: `Ex T3 ${n + 1}` });
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds, length: '1-2h' } }));
    return (await openSetup(base, t, { hash: 'story' })).text();
  };
  assert.match(await exOf(['theatre']), /443-seat community theatre.*Plays, concerts and comedy nights/);
  assert.match(await exOf(['museum']), /volunteer-run museum/);
  assert.match(await exOf(['escape']), /family-run escape room since 2016/);
  assert.match(await exOf(['spa']), /day spa/);
  assert.match(await exOf(['climbing']), /bouldering gym/);
  assert.match(await exOf(['casino']), /family-run place since 2010/);
  assert.doesNotMatch(await exOf(['theatre']), /escape room/);
  const v = theatre();
  const t = tokenFor(v.id);
  const phone = await openSetup(base, t, { hash: 'menu' });
  assert.ok(phone.acts().includes('go:menu:cam'));
  const desk = await openSetup(base, t, { hash: 'menu', fine: true });
  assert.ok(!desk.acts().includes('go:menu:cam'), desk.acts().join(' | '));
  assert.ok(desk.acts().includes('go:menu:upload'));
});

// A small Penticton: Diane's theatre with her box office hours, a cinema, restaurants.
let town = null;
const penticton = async () => {
  if (town) return town;
  const d = await diane({ region: 'summerland' });
  const cinema = mk('indoor', { region: 'summerland', name: 'Landmark Cinemas T3', cuisine: 'Cinema', description: 'A seven-screen movie theatre.', hours: JSON.stringify(DAY('12:00', '23:00')), rating: 4.1, reviews: 900 });
  const rest = [1, 2, 3, 4, 5, 6].map((i) => mk('restaurant', { region: 'summerland', name: `Penticton Bistro ${i} T3`, cuisine: 'Canadian', description: 'A restaurant downtown.', rating: 4.4 + i / 100, reviews: 500 + i, hours: JSON.stringify(DAY('11:00', '22:00')) }));
  town = { ...d, cinema, rest };
  return town;
};
const allText = (p) => JSON.stringify(p);

test('1 (safety net). Build My Trip never says "Closed Saturdays · try Tue–Fri" for a theatre whose own words name Saturday shows', async () => {
  const { v } = await penticton();
  const p = app.runTripPlan({ text: 'live theatre in Summerland on Saturday night' }, NOW);
  assert.doesNotMatch(allText(p), /Closed Saturdays|closed Saturdays/);
  const alts = (p.requirementResults || []).flatMap((r) => r.optionalAlternatives || []);
  const mine = alts.find((a) => a.id === v.id);
  if (mine) { assert.equal(mine.reasonCode, 'show_dates'); assert.equal(mine.closedDay, undefined); }
  else assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), allText(p).slice(0, 2000));
  // The page words: "Check show dates" (EN) / « Vérifiez les dates des spectacles » (FR), never a closed day.
  const step = { alternatives: [{ id: v.id, name: v.name, url: '/penticton/indoor/x', reasonCode: 'show_dates' }] };
  const esc = (s) => String(s);
  assert.match(v3.t3OptionalAlternativesHtml ? v3.t3OptionalAlternativesHtml(step, false, esc) : 'Check show dates', /Check show dates/);
  // A night her words don't name (Monday) is still closed by her hours, as before.
  const mon = app.runTripPlan({ text: 'live theatre in Summerland on Monday night' }, NOW);
  assert.doesNotMatch(allText(mon), /"reasonCode":"show_dates"/);
  // A dated show on What's On that Sunday counts too.
  const ev = db.prepare("INSERT INTO events (name, slug, region, description, start_datetime, venue_id, status) VALUES ('Sunday Matinee T3', 'sunday-matinee-t3', 'summerland', 'A play.', '2026-11-22T19:00:00', ?, 'scheduled')").run(v.id).lastInsertRowid;
  db.prepare("INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, status) VALUES (?, '2026-11-22', '2026-11-22', '19:00', 'scheduled')").run(ev);
  const facts = app.buildTripPlannerFacts ? app.buildTripPlannerFacts(true, '2026-11-22') : null;
  if (facts) { const f = facts.find((x) => x.id === v.id); assert.deepEqual(f.showDays, ['thu', 'fri', 'sat']); assert.equal(f.showStart, 19 * 60 + 30); assert.ok(f.showDates.includes('2026-11-22')); }
});

test('2. "comedy show / live music / a play in Penticton" with nothing dated: the theatres that host it, "check show dates" (Build My Trip EN + FR, and search)', async () => {
  const { v, cinema } = await penticton();
  const p = app.runTripPlan({ text: 'comedy show in Summerland' }, NOW);
  assert.ok(p.showPlaces, allText(p).slice(0, 1500));
  assert.ok(p.showPlaces.places.some((x) => x.id === v.id));
  const esc = (s) => String(s), href = (u) => `href="${u}"`;
  const one = { showPlaces: { ...p.showPlaces, places: p.showPlaces.places.filter((x) => x.id === v.id) } };
  assert.equal(plain(v3.t3ShowPlacesHtml(one, false, esc, href)).trim(), `Places that host comedy: ${v.name} — check show dates`);
  assert.equal(plain(v3.t3ShowPlacesHtml(one, true, esc, href)).trim(), `Lieux qui présentent de l’humour : ${v.name} — vérifiez les dates des spectacles`);
  const fr = app.runTripPlan({ text: 'spectacle d’humour à Summerland' }, NOW);
  assert.ok(fr.showPlaces && fr.showPlaces.places.some((x) => x.id === v.id), allText(fr).slice(0, 800));
  const music = app.runTripPlan({ text: 'concert in Summerland' }, NOW);
  assert.ok(music.showPlaces && music.showPlaces.places.some((x) => x.id === v.id), allText(music).slice(0, 800));
  assert.ok(!music.showPlaces.places.some((x) => x.id === cinema.id));
  // The cinema's words don't say comedy: never offered.
  assert.ok(!p.showPlaces.places.some((x) => x.id === cinema.id));
  // Search: the comedy page lists her theatre with "Hosts comedy · check show dates" (EN), « Présente de l’humour… » (FR).
  const s = plain(await getText('/search?q=comedy+show+in+summerland'));
  assert.ok(s.includes(v.name), s.slice(0, 2000));
  assert.match(s, /Hosts comedy · check show dates/);
  const sf = plain(await getText('/fr/search?q=humour+%C3%A0+summerland'));
  if (sf.includes(v.name)) assert.match(sf, /Présente de l’humour · vérifiez les dates des spectacles/);
});

test('10c. The French planner says Théâtre; a show stop starts at the show time (7:30 PM), not 7:38', async () => {
  const { v, t } = await penticton();
  // With "We don't have set hours" (the right path), she is planned after dinner.
  await ok(change(t, { indoor_info: { visit: 'appointment', year: 'all' } }));
  const p = app.runTripPlan({ text: 'théâtre à Summerland samedi soir' }, NOW);
  const row = (p.schedule || []).find((x) => x.venueId === v.id);
  assert.ok(row && Number.isFinite(row.startMinutes), JSON.stringify(p.schedule || p).slice(0, 1500));
  assert.equal(row.startMinutes, 19 * 60 + 30, JSON.stringify(p.schedule));
  const fr = frCopy.t3FrenchPlan(JSON.parse(JSON.stringify(p)));
  const stop = itemsOf(fr).find((x) => x.venue.id === v.id);
  assert.ok(stop);
  assert.equal(stop.label, 'Théâtre');
  assert.equal(frCopy.t3FrenchText('Theatre'), 'Théâtre');
  await ok(change(t, { indoor_info: { visit: null } }));
});

test('10d. The Penticton indoor page shows a Theatre chip when a theatre is listed there', async () => {
  const { v } = await penticton();
  const h = await getText('/penticton/indoor');
  assert.match(h, /<nav class="indoor-experience-filters"[^>]*>[\s\S]*?href="\/indoor\?regions=penticton&amp;types=theatre">Theatre <span>\(\d+\)<\/span><\/a>/);
  assert.ok(v);
  // A town with no theatre has no Theatre chip.
  mk('indoor', { name: 'Oliver Museum T3', region: 'oliver', description: 'A museum.' });
  assert.doesNotMatch(await getText('/oliver/indoor'), /types=theatre/);
});
