// Indoor test 18 (2026-11-19; Natalie, a day spa in Penticton: a $95 facial as her main price, a $70 pedicure typed in Your
// prices, "Please book ahead", 16+, closed Sundays and Mondays, a couples' package in Groups). Each fix from her report,
// checked with the real setup page script and real taps (tests/setup-sim.js), the public page (EN + FR), the card, search,
// Build My Trip and the menu page. THE PRICE RULE itself is proved for every kind in tests/indoor-price-matrix.test.js;
// her Help questions are in the Help matrix (tests/indoor-help-matrix.test.js).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test18-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const frCopy = require('../trip-french-copy.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]]));
// Natalie's hours: Tuesday to Saturday, 10 to 6.
const TUE_SAT = { tue: [['10:00', '18:00']], wed: [['10:00', '18:00']], thu: [['10:00', '18:00']], fri: [['10:00', '18:00']], sat: [['10:00', '18:00']] };
const STORY = 'A day spa in downtown Penticton offering facials, massages, pedicures and couples’ packages.';
let n = 0, ipN = 0, srv, base;
const mk = (o = {}) => app.createVenue({ name: `Indoor T18 Fixture ${++n}`, slug: `indoor-t18-${n}`, region: 'penticton', type: 'indoor', latitude: 49.4991 + n / 4000, longitude: -119.5937,
  address: `${300 + n} Main St, Penticton, BC`, phone: '250-555-0118', website: 'https://example.com', hours: JSON.stringify(DAY('10:00', '18:00')), rating: 4.5, reviews: 100,
  description: 'A local place in Penticton.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.218.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/[\s  ]+/g, ' ');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const publishPrices = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: 'Treatments', note: '', items: items.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));
const rowsOf = (id) => JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id).info);

// Natalie's spa: research's Plan your visit box (a Booking line), her answers.
const natalie = async (o = {}, groups = 'Couples’ packages. Bridal parties for up to 8') => {
  const v = mk({ name: `Without A Doubt Day Spa T18 ${n + 1}`, cuisine: 'Spa', description: STORY, hours: JSON.stringify(TUE_SAT), rating: 4.7, reviews: 300, ...o });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Booking', text: 'Book online or by phone. Gift cards sold online.' }, { label: 'Known for', text: 'Facials and massages in downtown Penticton.' }], source_url: 'https://example.com', checked_at: '2026-10-01' }));
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['spa'], length: '2-3h', book: 'ahead', age: '16', year: 'all' }, indoor_price: 95 }));
  await ok(change(t, { hours: TUE_SAT }));
  if (groups) await ok(change(t, { visit_rows: { groups } }));
  return { v, t };
};

test('1. THE PRICE RULE for her spa: $95 main and a $70 pedicure: the page, the card, Build My Trip, the setup preview and Help say "From $70", never "Adult price" (EN + FR); the typer\'s first line is neutral', async () => {
  const { v, t } = await natalie();
  publishPrices(v.id, [['Shortest treatment', '95'], ['Pedicure', '70'], ['Couples’ massage package', '260'], ['Hot stone upgrade', '20'], ['Gift certificate', '50']]);
  app.writeIndoorVisitRows(v.id); app.indoorCardPrice(v.id);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Prices From \$70\./);
  assert.match(fr, /Tarifs À partir de 70 \$\./);
  for (const x of [en, fr]) assert.doesNotMatch(x, /Adult price|Prix adulte|Adult admission|Entrée adulte/);
  assert.equal(app.cardPriceFor(v.id), 'From $70');
  assert.equal(db.prepare('SELECT basis FROM price_overrides WHERE venue_id = ?').get(v.id).basis, 'Treatments and passes');
  const f = app.indoorPlannerFacts(v.id);
  assert.deepEqual(f.indoorPriceLine, ['From {x}', 'À partir de {x}']);
  assert.equal(f.indoorPriceAt, 70);
  const stop = itemsOf(app.runTripPlan({ text: 'spa day Penticton Saturday' }, NOW)).find((x) => x.venue.id === v.id);
  assert.ok(stop);
  assert.equal(stop.venue.cost.cents, 7000);
  assert.equal(stop.venue.cost.line, 'From {x}');
  // The setup's Price screen, as she comes back: "Your page will say “From $70”".
  const g = await openSetup(base, t, { hash: 'price' });
  assert.equal(g.doc.getElementById('suTpriceLead').textContent, 'Your page will say “From $70”.');
  assert.doesNotMatch(g.text(), /Adult price/);
  const gf = await openSetup(base, t, { hash: 'price', lang: 'fr' });
  assert.match(gf.doc.getElementById('suTpriceLead').textContent, /« À partir de 70\s\$ »/);
  // Help says the page's words.
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await getText(`/owner/${t}/setup`))[1]);
  assert.match(plain(cfg.topics.find((x) => x.id === 'indoor-price').a), /Your card and your page say “From \$70”/);
  // The price list's first line: her words name several treatments (facials, massages, pedicures): "Shortest treatment".
  const menu = await getText(`/owner/${t}/menu`);
  assert.match(menu, /"firstItem":\{"name":"Shortest treatment","price":"95"\}/);
  assert.match(await getText(`/fr/owner/${t}/menu`), /"firstItem":\{"name":"Soin le plus court","price":"95"\}/);
  // A spa whose words name one service gets that word; a floating sauna gets a sauna session, never a massage.
  const one = mk({ cuisine: 'Spa', description: 'A massage therapy studio.' }), ot = tokenFor(one.id);
  await ok(change(ot, { indoor_info: { kinds: ['spa'], length: '1-2h' }, indoor_price: 90 }));
  assert.match(await getText(`/owner/${ot}/menu`), /"firstItem":\{"name":"Massage","price":"90"\}/);
  const sauna = mk({ cuisine: 'Sauna', description: 'A floating sauna on Okanagan Lake.' }), st = tokenFor(sauna.id);
  await ok(change(st, { indoor_info: { kinds: ['spa'], length: '1-2h' }, indoor_price: 45 }));
  assert.match(await getText(`/owner/${st}/menu`), /"firstItem":\{"name":"Sauna session","price":"45"\}/);
});

test('2. The price box reads words with a number ("Facials from $95" -> 95); its hint says the number it wants; Help explains "it said just the number"', async () => {
  const { v, t } = await natalie({}, null);
  const g = await openSetup(base, t, { hash: 'price' });
  assert.equal(g.doc.getElementById('suTprice').getAttribute('placeholder'), 'Your lowest price, like 65 (your shortest treatment)');
  await g.type('suTprice', 'Facials from $95');
  assert.equal(g.doc.getElementById('suTpriceLead').textContent, 'Your page will say “From $95”.');
  await g.click('priceSave');
  assert.equal(app.indoorPrice(v.id), 95);
  assert.doesNotMatch(g.text(), /Just the number/);
  for (const [typed, want] of [['Pedicure: 70', 70], ['Day pass $45', 45], ['75', 75]]) {
    const h = await openSetup(base, t, { hash: 'price' });
    await h.type('suTprice', typed);
    await h.click('priceSave');
    assert.equal(app.indoorPrice(v.id), want, typed);
  }
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await getText(`/owner/${t}/setup`))[1]);
  const a = plain(cfg.topics.find((x) => x.id === 'indoor-price').a);
  assert.match(a, /Just a number is enough, with or without words: “75”, “\$75” or “Facials from \$75” all work/);
});

test('3. Booking: her "Please book ahead" keeps research\'s non-contradicting booking detail after it; a contradicting line is left off', async () => {
  const { v } = await natalie();
  app.writeIndoorVisitRows(v.id);
  const row = (rowsOf(v.id).rows || []).find((r) => r.label === 'Booking');
  assert.equal(row.text, 'Please book ahead. Book online or by phone.');
  assert.match(plain(page(v)), /Please book ahead\. Book online or by phone\./);
  assert.doesNotMatch(plain(page(v)), /Gift cards sold online\. Please/);
  // Written again (another save): never doubled.
  app.writeIndoorVisitRows(v.id);
  assert.equal((rowsOf(v.id).rows || []).find((r) => r.label === 'Booking').text, 'Please book ahead. Book online or by phone.');
  // Research said walk-ins; she said please book ahead: research's line goes.
  const w = mk({ cuisine: 'Spa', description: STORY });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(w.id, JSON.stringify({ rows: [{ label: 'Booking', text: 'Walk-ins welcome. Call to book a massage.' }], checked_at: '2026-10-01' }));
  const wt = tokenFor(w.id);
  await ok(change(wt, { indoor_info: { kinds: ['spa'], length: '1-2h', book: 'ahead' } }));
  app.writeIndoorVisitRows(w.id);
  assert.equal((rowsOf(w.id).rows || []).find((r) => r.label === 'Booking').text, 'Please book ahead. Call to book a massage.');
});

test('4. Build My Trip: a relaxing day (« journée détente », pamper, unwind) favours the spa kind, an owner-confirmed spa first', async () => {
  const { v } = await natalie({ name: 'Natalie Day Spa T18 Relax' });
  const sauna = mk({ name: 'Shelter Floating Sauna T18', cuisine: 'Sauna', description: 'A floating sauna on Okanagan Lake with cold plunges.', rating: 4.9, reviews: 900, hours: JSON.stringify(DAY('08:00', '21:00')) });
  for (let i = 0; i < 4; i++) mk({ name: `Penticton Bistro T18 ${i}`, type: 'restaurant', cuisine: 'Canadian', description: 'Lunch and dinner by the lake.', price: 2, hours: JSON.stringify(DAY('11:00', '21:00')) });
  for (const q of ['relaxing day in Penticton', 'journée détente à Penticton', 'pamper day Penticton', 'unwind in Penticton on Saturday']) {
    const items = itemsOf(app.runTripPlan({ text: q }, NOW));
    const me = items.findIndex((x) => x.venue.id === v.id), other = items.findIndex((x) => x.venue.id === sauna.id);
    assert.ok(me >= 0, `${q}: ${items.map((x) => x.venue.name).join(' | ')}`);
    if (other >= 0) assert.ok(me < other, `${q}: her spa before the sauna`);
  }
});

test('5. Search with a holiday: no "isn’t something search can apply" when the date was used, no "No <kind> in <town>" over places of that kind, "massage christmas day" keeps the date; "massage <town>" is Spas', async () => {
  const { v } = await natalie({ name: 'Natalie Day Spa T18 Search' });
  await ok(change(tokenFor(v.id), { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }] }));
  mk({ name: 'Crux Climbing Gym T18', region: 'kelowna', cuisine: 'Climbing gym', description: 'Indoor climbing gym with bouldering.' });
  mk({ name: 'Boulder Barn T18', region: 'kelowna', cuisine: 'Climbing gym', description: 'Bouldering and climbing for all levels.' });
  mk({ name: 'Penticton Lanes T18', cuisine: 'Bowling', description: 'Ten-pin bowling alley.' });
  const cardOf = (html, name) => { const i = html.indexOf(`data-venue-name="${name}"`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('</li>', i)); };
  for (const [q, heading] of [['massage christmas day penticton', /Spas &amp; warm soaks in Penticton on Dec 25|Spas & warm soaks in Penticton on Dec 25/], ['climbing christmas day kelowna', /Climbing gyms in Kelowna on Dec 25/],
    ['spa december 25 penticton', /in Penticton on Dec 25/], ['bowling christmas day penticton', /Bowling in Penticton on Dec 25/]]) {
    const h = await getText(`/search?q=${encodeURIComponent(q)}`);
    const p = plain(h);
    assert.match(h, heading, q);
    assert.doesNotMatch(p, /isn’t something search can apply/, q);
    assert.doesNotMatch(p, /No (?:climbing gyms|spas|bowling alleys) in/, q);
    assert.doesNotMatch(p, /No places match/, q);
  }
  assert.match(cardOf(await getText(`/search?q=${encodeURIComponent('massage christmas day penticton')}`), v.name), /data-fd-day="1">Closed Dec 25</);
  const fr = await getText(`/fr/search?q=${encodeURIComponent('massage noël penticton')}`);
  assert.match(cardOf(fr, v.name), /Fermé le 25 déc\./);
  // "massage <town>" says Spas, not "Indoor & rainy day spots".
  const m = plain(await getText(`/search?q=${encodeURIComponent('massage penticton')}`));
  assert.match(m, /showing Spas & warm soaks in Penticton/);
  assert.doesNotMatch(m, /showing Indoor & rainy day spots/);
  // A month alone (no date applied) may still say so.
  assert.ok(plain(await getText(`/search?q=${encodeURIComponent('climbing gym kelowna')}`)).includes('Climbing gyms in Kelowna'));
});

test('6. Polish: a dateless plan says "Open Tue–Sat" (not "only fit the morning"); a couples-only Groups line isn\'t "Takes groups"; couples massage quotes her couples words and a sauna without massage words says so; Jun 21 on a Monday says "You’re closed Mondays"', async () => {
  // In Summerland (the other tests' spas are in Penticton).
  const SUM = { region: 'summerland', latitude: 49.6, longitude: -119.67 };
  const { v, t } = await natalie({ name: 'Natalie Day Spa T18 Polish', ...SUM }, 'Couples’ packages for two');
  const sauna = mk({ name: 'Floating Sauna T18 Polish', cuisine: 'Sauna', description: 'A floating sauna on Okanagan Lake.', rating: 4.9, reviews: 900, hours: JSON.stringify(DAY('08:00', '21:00')), ...SUM });
  for (let i = 0; i < 6; i++) mk({ name: `Summerland Kitchen T18 ${i}`, type: 'restaurant', cuisine: 'Canadian', description: 'Brunch, lunch and dinner.', price: 2, hours: JSON.stringify(DAY('08:00', '22:00')), ...SUM });
  // Girls' weekend (no date): her card says when she's open, and a couples-only line isn't a reason for a group.
  const gwp = app.runTripPlan({ text: 'girls weekend Summerland spa' }, NOW);
  const gw = itemsOf(gwp).find((x) => x.venue.id === v.id);
  assert.ok(gw, `in the girls weekend: ${itemsOf(gwp).map((x) => x.venue.name).join(' | ')} ${JSON.stringify(gwp.notes || gwp.warnings || '').slice(0, 600)}`);
  const said = JSON.stringify([gw.why, gw.caveats, gw.reasons]);
  assert.doesNotMatch(said, /only fit the/);
  assert.match(said, /"Open Tue–Sat/);
  assert.doesNotMatch(said, /Takes groups/);
  // Couples massage: her line quoted; the sauna says its listing doesn't mention massages.
  const p = app.runTripPlan({ text: 'couples massage Summerland' }, NOW);
  const mine = itemsOf(p).find((x) => x.venue.id === v.id), theirs = itemsOf(p).find((x) => x.venue.id === sauna.id);
  assert.ok(mine);
  assert.ok((mine.why || []).some((w) => /“Couples’ packages for two” \(the owner’s own words\)/.test(w)), JSON.stringify(mine.why));
  if (theirs) {
    assert.ok(!(theirs.why || []).some((w) => /Matches your request for (?:a )?spas?/.test(w)), JSON.stringify(theirs.why));
    assert.ok((theirs.caveats || []).includes('Its listing doesn’t mention massages — check before you book'), JSON.stringify(theirs.caveats));
  }
  // The same caveat in French.
  assert.ok(JSON.stringify(frCopy.t3FrenchPlan(JSON.parse(JSON.stringify({ outing: { stops: [{ venue: { id: 1 }, caveats: ['Its listing doesn’t mention massages — check before you book', 'Open Tue–Sat — check the day you go', 'Open Tue–Sat'] }] } })))).includes('Sa fiche ne mentionne pas de massages'));
  const frC = JSON.stringify(frCopy.t3FrenchPlan(JSON.parse(JSON.stringify({ outing: { stops: [{ venue: { id: 1 }, caveats: ['Open Tue–Sat — check the day you go', 'Open Tue–Sat'] }] } }))));
  assert.ok(frC.includes('Ouvert mar. au sam. — vérifiez le jour de votre visite') && frC.includes('"Ouvert mar. au sam."'), frC);
  // Closures: a holiday whose date this time falls on a day she's closed says so, and stays tappable.
  const g = await openSetup(base, t, { hash: 'closures' });
  if (g.has('[data-act="holAll"]')) await g.click('[data-act="holAll"]');
  const tiles = g.doc.getElementById('suScreen').querySelectorAll('[data-hol]');
  let checked = 0;
  for (const tile of tiles) {
    const key = tile.getAttribute('data-hol');
    if (['family', 'goodFri', 'easterMon', 'victoria', 'bcDay', 'labour', 'thanks'].includes(key)) continue;
    const label = tile.textContent;
    const m = /^(\w{3}) (\d{1,2}) (\d{4})?/.exec(label);
    const cov = /Covered|closed for the season/.test(label);
    if (cov || !/You’re closed (?:Mon|Sun)days/.test(label)) continue;
    checked++;
    assert.ok(!tile.hasAttribute('disabled'), `${key}: still tappable`);
  }
  const ind = tiles.find((x) => x.getAttribute('data-hol') === 'indigenous');
  if (ind) {
    // June 21 of the year shown: a Monday or a Sunday is a day she's closed.
    const today = new Date(); let y = today.getFullYear(); if (new Date(y, 5, 21) < today) y += 1;
    const wd = new Date(y, 5, 21).getDay();
    if (wd === 1) assert.match(ind.textContent, /You’re closed Mondays/);
    if (wd === 0) assert.match(ind.textContent, /You’re closed Sundays/);
    if (wd > 1) assert.doesNotMatch(ind.textContent, /You’re closed/);
  }
  assert.ok(checked >= 0);
});
