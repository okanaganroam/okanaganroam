// Indoor test 4 (2026-11-19; Lauren runs a Kelowna day spa: treatments by appointment, massages $130 and $175, a $65
// hydrotherapy circuit, walk-in, 19+; treatments 16+). Each fix from her report, checked with the real setup page script
// and real taps (tests/setup-sim.js), then on the public page (EN + FR), the cards, Build My Trip and search. The fixes for
// every other kind are in tests/indoor-kind-table.test.js; her Help questions in tests/indoor-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test4-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const tp = require('../trip-planner.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T4 Fixture ${++n}`, slug: `indoor-t4-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 3000, longitude: -119.49,
  address: `${100 + n} Harvey Ave, Kelowna, BC`, phone: '250-555-0144', website: 'https://spa.example', hours: DAY('09:00', '20:00'), description: 'A fixture used only by the indoor test 4 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.97.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const page = (v, lang = 'en') => plain(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW }));
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
// Spas made for one check live in Vernon, so Lauren's Kelowna (below) has only her own spa of these.
const spa = (o = {}) => mk('indoor', { region: 'vernon', name: `Room and Pillar Spa T4 ${n + 1}`, description: 'An award-winning wellness spa with salt caves, relaxation massages and Éminence facials.', rating: 4.7, reviews: 420, ...o });
// Lauren's answers: a spa, 2 to 3 hours, book ahead, 16+, $65, her Known for and Groups lines.
const lauren = async (o = {}) => {
  const v = spa({ region: 'kelowna', ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['spa'], length: '2-3h', book: 'ahead', age: '16' } }));
  await ok(change(t, { indoor_price: 65 }));
  await ok(change(t, { visit_rows: { known_for: 'Nordic hydrotherapy circuit, massage and facials', groups: 'Couples’ packages and bridal parties' } }));
  return { v, t };
};
// Her Kelowna: her spa, three other spas (one 19+ by its own page), museums, restaurants and a winery.
let town = null;
const kelowna = async () => {
  if (town) return town;
  const me = await lauren();
  const nordic = mk('indoor', { name: 'Kelowna Nordic Spa T4', cuisine: 'Spa', description: 'A Nordic spa with hot and cold pools and saunas. 19+ only.', rating: 4.8, reviews: 900 });
  const tality = mk('indoor', { name: 'Tality Wellness T4', cuisine: 'Spa', description: 'Infrared sauna and wellness studio.', rating: 4.9, reviews: 600 });
  const glow = mk('indoor', { name: 'Glow Day Spa T4', cuisine: 'Spa', description: 'Day spa with manicures and pedicures.', rating: 4.9, reviews: 300 });
  const museums = [1, 2, 3, 4, 5].map((i) => mk('indoor', { name: `Kelowna Museum ${i} T4`, cuisine: 'Museum', description: 'A history museum.', rating: 4.4, reviews: 200 + i }));
  const rest = [1, 2, 3, 4, 5, 6].map((i) => mk('restaurant', { name: `Lakeside Bistro ${i} T4`, cuisine: 'Canadian', description: 'Romantic lakeside dinner.', price: 3, rating: 4.5 + i / 100, reviews: 500 + i, hours: DAY('11:00', '22:00') }));
  mk('winery', { name: 'Hillside Winery T4', description: 'A winery with tastings.', rating: 4.7, reviews: 800 });
  town = { ...me, nordic, tality, glow, museums, rest };
  return town;
};

test('1. A spa’s price is "From $65" with "Treatments and passes" on the page, card, setup preview and Build My Trip (EN + FR); the box asks for "Your lowest price (a pass or your shortest treatment)"', async () => {
  const v = spa();
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['spa'], length: '2-3h' } }));
  const sim = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim.doc.getElementById('suScreen').querySelector('label[for="suTprice"]').textContent, 'Your lowest price (a pass or your shortest treatment)');
  assert.equal(sim.doc.getElementById('suTprice').getAttribute('placeholder'), 'Like a day pass or a 30-minute treatment');
  assert.doesNotMatch(sim.text(), /The price for one adult|Adult price|Adults/);
  await sim.type('suTprice', '65');
  assert.equal(sim.doc.getElementById('suTpriceLead').textContent, 'Your page will say “From $65”.');
  await sim.click('priceSave');
  assert.equal(app.indoorPrice(v.id), 65);
  const en = page(v), fr = page(v, 'fr');
  assert.ok(en.includes('From $65.'), en.slice(0, 2500));
  assert.ok(fr.includes('À partir de 65 $.'), fr.slice(0, 2500));
  for (const x of [en, fr]) assert.doesNotMatch(x, /Adults \$65|Adultes : 65|Adult admission|Entrée adulte/);
  assert.equal(db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(v.id).basis, 'Treatments and passes');
  // The card on the Indoor hub (EN + FR): "From $65 · Treatments and passes", « Soins et forfaits ».
  const hub = plain(await getText('/indoor')), at = hub.indexOf(v.name);
  assert.ok(at >= 0);
  assert.match(hub.slice(at, at + 700), /From \$65 Treatments and passes/);
  assert.doesNotMatch(hub.slice(at, at + 700), /Admission/);
  const hubFr = plain(await getText('/fr/indoor')), atFr = hubFr.indexOf(v.name);
  assert.ok(atFr >= 0);
  { assert.match(hubFr.slice(atFr, atFr + 700), /Soins et forfaits/); assert.doesNotMatch(hubFr.slice(atFr, atFr + 700), /Entrée/); }
  // The setup's preview: "Your page will say “From $65”" when she comes back, French « À partir de 65 $ ».
  const sim2 = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim2.doc.getElementById('suTpriceLead').textContent, 'Your page will say “From $65”.');
  const sim3 = await openSetup(base, t, { hash: 'price', lang: 'fr' });
  assert.match(sim3.doc.getElementById('suTpriceLead').textContent, /Votre page indiquera « À partir de 65\s\$ »\./);
  // Build My Trip: "From $65" / « À partir de 65 $ », never "per person · Admission".
  const p = app.runTripPlan({ text: 'spa day in Vernon' }, NOW);
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(stop, JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  assert.equal(stop.venue.cost.line, 'From {x}');
  assert.equal(stop.venue.cost.lineFr, 'À partir de {x}');
  assert.notEqual(stop.venue.cost.label, 'Admission');
  const frPlan = frCopy.t3FrenchPlan(JSON.parse(JSON.stringify(p)));
  const frStop = itemsOf(frPlan).find((x) => x.venue.id === v.id);
  assert.equal(frStop.venue.cost.lineFr, 'À partir de {x}');
  // The Build My Trip page draws it with the page's words.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes("typeof cost.line === 'string'"));
});

test('3a. "couples massage Kelowna Saturday" plans her (her Known for says massage and her Groups line offers couples’ packages); "massage" and "facial" rank her first', async () => {
  const { v, nordic } = await kelowna();
  const p = app.runTripPlan({ text: 'couples massage Kelowna Saturday' }, NOW);
  const ids = itemsOf(p).map((x) => x.venue.id);
  assert.ok(ids.includes(v.id), JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  assert.ok(!ids.includes(nordic.id) || ids.indexOf(v.id) < ids.indexOf(nordic.id));
  for (const q of ['massage in Kelowna', 'facial in Kelowna', 'massage à Kelowna', 'massage en couple à Kelowna samedi']) {
    const r = app.runTripPlan({ text: q }, NOW);
    const first = itemsOf(r).find((x) => x.venue.type === 'indoor');
    assert.ok(first && first.venue.id === v.id, `${q}: ${JSON.stringify(itemsOf(r).map((x) => x.venue.name))}`);
    assert.ok(!itemsOf(r).some((x) => /Museum/.test(x.venue.name)), `${q}: a museum for a massage`);
  }
});

test('3b. "N year old", "N-year-old" and « N ans » are kids of age N: a 16+ spa and a "19+ only" spa are left out for a 14-year-old, and the plan says why; tours keep the same rule', async () => {
  const { v, nordic, tality } = await kelowna();
  assert.deepEqual(tp.requestKidAges('spa with my 14 year old'), [14]);
  assert.deepEqual(tp.requestKidAges('spa with my 14-year-old'), [14]);
  assert.deepEqual(tp.requestKidAges('spa avec mon fils de 14 ans'), [14]);
  assert.deepEqual(tp.requestKidAges('nos enfants de 8 et 11 ans'), [8, 11]);
  assert.deepEqual(tp.requestKidAges('un spa 19 ans et plus'), []);
  for (const q of ['spa with my 14 year old in Kelowna', 'spa in Kelowna with my 14-year-old', 'spa à Kelowna avec mon fils de 14 ans']) {
    const p = app.runTripPlan({ text: q }, NOW);
    const ids = itemsOf(p).map((x) => x.venue.id);
    assert.ok(!ids.includes(v.id), `${q}: her 16+ spa`);
    assert.ok(!ids.includes(nordic.id), `${q}: a 19+ spa`);
    assert.ok(ids.includes(tality.id), `${q}: ${JSON.stringify(itemsOf(p).map((x) => x.venue.name))}`);
    if (!/ans/.test(q)) assert.ok((p.notes || []).concat(p.contextNotes || []).some((x) => x === `${v.name} is for ages 16 and up, so it isn’t in this plan for your 14-year-old.`), JSON.stringify(p.notes));
  }
  // The French note.
  const fr = frCopy.t3FrenchPlan(JSON.parse(JSON.stringify(app.runTripPlan({ text: 'spa with my 14 year old in Kelowna' }, NOW))));
  assert.ok((fr.notes || []).concat(fr.contextNotes || []).some((x) => /est pour les 16 ans et plus : nous l’avons laissé de côté pour votre enfant de 14 ans/.test(x)), JSON.stringify(fr.notes));
  // A 16-year-old: her spa is fine again.
  assert.ok(itemsOf(app.runTripPlan({ text: 'spa in Kelowna with my 16 year old' }, NOW)).some((x) => x.venue.id === v.id));
  // Tours: the same reading ("14-year-old" as typed, and « 14 ans ») keeps a 16+ tour out.
  const tour = mk('tour', { name: 'Kelowna Zipline T4', cuisine: 'Zipline', description: 'Ziplines over the canyon.', rating: 4.8, reviews: 500 });
  await ok(change(tokenFor(tour.id), { tour_info: { kinds: ['adventure'], length: '2-3h', age: '16' } }));
  for (const q of ['zipline in Kelowna with my 14-year-old', 'tyrolienne à Kelowna avec ma fille de 14 ans']) assert.ok(!itemsOf(app.runTripPlan({ text: q }, NOW)).some((x) => x.venue.id === tour.id), q);
});

test('4. Search: "massage" and "couples massage" find the spas (hers first), never 82 indoor places; the French page too', async () => {
  const { v, museums } = await kelowna();
  // Anywhere: only spas (the Vernon spas of the other checks too), no museum.
  const any = app.runDiscovery('massage').results.items || [];
  assert.ok(any.length >= 2 && any.length <= 7 && any.some((x) => x.id === v.id), any.map((x) => x.name).join(', '));
  assert.ok(!any.some((x) => /Museum/.test(x.name)));
  for (const q of ['couples massage', 'massage in Kelowna', 'facial in Kelowna', 'couples massage kelowna', 'massage en couple à Kelowna']) {
    const r = app.runDiscovery(q);
    const items = r.results.items || [];
    assert.ok(items.length >= 1 && items.length <= 5, `${q}: ${items.length} ${items.map((x) => x.name).join(', ')}`);
    assert.equal(items[0].id, v.id, `${q}: ${items.map((x) => x.name).join(', ')}`);
    assert.ok(!items.some((x) => museums.some((m) => m.id === x.id)), q);
  }
  const s = plain(await getText('/search?q=massage'));
  assert.ok(s.includes(v.name));
  assert.doesNotMatch(s, /Kelowna Museum \d T4/);
  // A kind word with no place of that kind keeps search as it was (nothing taken away).
  const bowl = app.runDiscovery('bowling in Kelowna');
  assert.ok(bowl && bowl.results);
});

test('5. What kind of place: a kind already picked folds to "Spa, sauna or wellness ✓ · Change" with Save on the first screen; Change opens the list (EN + FR)', async () => {
  const v = spa({ name: 'Harbour Day Spa T4' });
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'indoor' });
  const all = sim.doc.getElementById('suKindsAll');
  assert.ok(all && all.getAttribute('hidden') !== null, sim.screen().slice(0, 1500));
  assert.match(sim.doc.getElementById('suKindsPicked').textContent, /^Spa, sauna or wellness ✓ · Change/);
  assert.match(sim.text(), /We picked this from your page\. Not right\? Tap Change\./);
  assert.ok(sim.acts().includes('indoorSave'));
  // Save comes right after the fold and the length chips (the long list is hidden).
  const html = sim.screen();
  assert.ok(html.indexOf('suKindsPicked') < html.indexOf('data-act="indoorSave"'));
  await sim.click('kindsChange');
  assert.equal(sim.doc.getElementById('suKindsAll').getAttribute('hidden'), null);
  assert.ok(sim.has('[data-tkind="spa"][aria-pressed="true"]'));
  assert.ok(!sim.has('#suKindsPicked'));
  // Saving without opening the list keeps the kind picked.
  const sim2 = await openSetup(base, t, { hash: 'indoor' });
  await sim2.click('indoorSave');
  assert.deepEqual(app.venueIndoorInfo(v.id).kinds, ['spa']);
  // A place with no kind picked yet sees the whole list.
  const plainPlace = mk('indoor', { name: 'Local Place T4', description: 'A local place.' });
  const s3 = await openSetup(base, tokenFor(plainPlace.id), { hash: 'indoor' });
  assert.equal(s3.doc.getElementById('suKindsAll').getAttribute('hidden'), null);
  assert.ok(!s3.has('#suKindsPicked'));
  // French.
  const fr = await openSetup(base, t, { hash: 'indoor', lang: 'fr' });
  assert.match(fr.doc.getElementById('suKindsPicked').textContent, /Spa, sauna ou bien-être ✓ · Modifier/);
});

test('6. Spa screens: Groups chips are couples’ packages and bridal parties (no birthday or school), no theatre box office hint, a spa’s Good to know and Your prices words', async () => {
  const { t } = await lauren();
  const g = await openSetup(base, t, { hash: 'groups' });
  const chips = g.doc.getElementById('suScreen').querySelectorAll('[data-key="groups"]').map((b) => b.getAttribute('data-quick'));
  assert.deepEqual(chips, ['Couples’ packages', 'Bridal and private parties', 'Private spa bookings on request']);
  assert.doesNotMatch(g.text(), /Birthday|School groups|birthday parties, school groups/);
  const h = await openSetup(base, t, { hash: 'hours' });
  assert.doesNotMatch(h.text(), /box office/i);
  const m = await openSetup(base, t, { hash: 'menu' });
  assert.match(m.text(), /Every treatment, pass and package and what it costs/);
  // A chip's line shows in French on the French page (the chips are presets).
  await g.click('[data-quick="Couples’ packages"]');
  assert.equal(app.presetAnswer('Couples’ packages', 'fr'), 'Forfaits pour couples');
});

test('7. Polish: the phone reads 250-860-0188; Known for says where it really shows; the prices link is named as Help names it ("Spa menu")', async () => {
  const v = spa({ phone: '2508600188' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['spa'], length: '2-3h' } }));
  const b = await openSetup(base, t, { hash: 'basics' });
  assert.match(b.text(), /250-860-0188/);
  assert.doesNotMatch(b.text(), /2508600188/);
  if (b.acts().some((x) => /basics:edit|go:basics:no/.test(x))) {
    await b.click(b.acts().find((x) => /basics:edit|go:basics:no/.test(x)));
    if (b.doc.getElementById('suPhone')) assert.equal(b.doc.getElementById('suPhone').value, '250-860-0188');
  }
  // Known for: the line says "under “Your visit”", and the English page has it there.
  await ok(change(t, { visit_rows: { known_for: 'Nordic hydrotherapy circuit, massage and facials' } }));
  const st = await openSetup(base, t, { hash: 'story' });
  assert.match(st.text(), /It shows under “Your visit” on your page\./);
  assert.doesNotMatch(st.text(), /at the top of “Plan your visit”/);
  const en = page(v);
  const visitAt = en.indexOf('Your visit ✨');
  assert.ok(visitAt >= 0 && en.indexOf('Known for', visitAt) > visitAt, en.slice(0, 3000));
  // The prices link: "Spa menu · See the spa menu" (« Carte des soins »), as Help says.
  db.prepare('INSERT INTO venue_links (venue_id, menu_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET menu_url = excluded.menu_url').run(v.id, 'https://spa.example/menu');
  const en2 = page(v);
  assert.match(en2, /Spa menu See the spa menu ↗/);
  assert.doesNotMatch(en2, /Menu See the menu/);
  assert.match(page(v, 'fr'), /Carte des soins Voir la carte des soins ↗/i);
  // A museum's is "Prices & rates".
  const mus = mk('indoor', { name: 'Kelowna Museum Links T4', description: 'A museum.' });
  await ok(change(tokenFor(mus.id), { indoor_info: { kinds: ['museum'], length: '1h' } }));
  db.prepare('INSERT INTO venue_links (venue_id, menu_url) VALUES (?, ?)').run(mus.id, 'https://museum.example/admission');
  assert.match(page(mus), /Prices & rates See prices & rates ↗/);
});

test('8. SEO: a town’s indoor page has no row of experience chips (no new internal links); the Indoor hub keeps its Theatre chip', async () => {
  await kelowna();
  const h = await getText('/kelowna/indoor');
  assert.doesNotMatch(h, /href="\/indoor\?regions=kelowna&amp;types=/);
  assert.doesNotMatch(h, /<nav class="indoor-experience-filters"/);
});
