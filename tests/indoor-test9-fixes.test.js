// Indoor test 9 (2026-11-19; Melissa runs an indoor play centre in West Kelowna for kids 0 to 10: $14 per child, crawlers
// $8, adults free, punch passes; grip socks required and an adult must stay; a café inside; party rooms booked online; a
// sensory-friendly hour on Tuesdays). Each fix from her report, checked with the real setup page script and real taps
// (tests/setup-sim.js), Build My Trip, search and the public pages. Her Help questions are in the Help matrix
// (tests/indoor-help-matrix.test.js); French Build My Trip and search for every kind in tests/indoor-planner-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test9-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const T = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const HOURS = JSON.stringify({ mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [['09:00', '17:00']], sun: [['10:00', '16:00']] });
const STORY = 'Indoor play centre in West Kelowna for kids 0 to 10, with a big play structure, a toddler zone and bouncy castles. Grab a coffee and a snack at our cafe while they play.';
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T9 Fixture ${++n}`, slug: `indoor-t9-${n}`, region: 'west-kelowna', type: 'indoor', latitude: 49.83 + n / 3000, longitude: -119.62,
  address: `${100 + n} Bering Rd, West Kelowna, BC`, phone: '250-555-0199', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 9 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.82.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);
const setLink = (id, url) => db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(id, url);
const publishPrices = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: 'Play passes', note: '', items: items.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));

// Melissa's place: her story, her answers.
const melissa = async (o = {}, info = {}) => {
  const v = mk({ name: `Wild Kidz Play Centre T9 ${n + 1}`, cuisine: 'Indoor playground', description: STORY, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['kids'], length: '1-2h', book: 'no', age: 'all', year: 'all', ...info }, indoor_price: 14 }));
  return { v, t };
};

test('1. Kids 0 to 10 from her own words: the page says it (EN + FR), Build My Trip leaves her out for a 12-year-old with a note, keeps her for a 2-year-old', async () => {
  const { v } = await melissa();
  const en = plain(pageHtml(v)), fr = plain(pageHtml(v, 'fr'));
  assert.match(en, /Ages Kids 0 to 10\./);
  assert.doesNotMatch(en, /Ages All ages/);
  assert.match(fr, /Enfants de 0 à 10 ans/);
  const old = app.runTripPlan({ text: 'something for my 12 year old in West Kelowna' }, NOW);
  assert.ok(!idsOf(old).includes(v.id), 'not for a 12-year-old');
  assert.ok((old.notes || []).some((x) => x.includes(`${v.name} is for kids 0 to 10, so it isn’t in this plan for your 12-year-old.`)), (old.notes || []).join(' | '));
  const fr2 = require('../trip-french-copy.js');
  assert.match(fr2.t3FrenchText(`${v.name} is for kids 0 to 10, so it isn’t in this plan for your 12-year-old.`), /est pour les enfants de 0 à 10 ans/);
  assert.ok(idsOf(app.runTripPlan({ text: 'rainy day with a 2 year old in West Kelowna' }, NOW)).includes(v.id), 'kept for a 2-year-old');
  // A range said only in her own Good to know line counts too (her story says none).
  const { v: v2, t: t2 } = await melissa({ description: 'Indoor play centre with a toddler zone.' });
  assert.doesNotMatch(plain(pageHtml(v2)), /Kids \d+ to/);
  await ok(change(t2, { visit_rows: { good_to_know: 'Ages 2–12. An adult must stay with their kids.' } }));
  assert.match(plain(pageHtml(v2)), /Ages Kids 2 to 12\./);
  // A price line is never read as an age range, and a museum's words never cap it.
  const { v: v3, t: t3 } = await melissa({ cuisine: 'Museum', description: 'Local history museum. Kids 6 to 12 $5.' }, { kinds: ['museum'] });
  assert.doesNotMatch(plain(pageHtml(v3)), /Kids 6 to 12\./);
  assert.ok(t3);
});

test('2. A walk-in place whose link or Groups line is about parties: "Book a party" (« Réserver une fête »); the setup titles the link box for parties or groups', async () => {
  const { v, t } = await melissa();
  setLink(v.id, 'https://example.com/book');
  assert.match(plain(pageHtml(v)), /\bBook\b/);
  assert.doesNotMatch(plain(pageHtml(v)), /Book a party/);
  await ok(change(t, { visit_rows: { groups: 'Birthday parties with a party room. Private party rooms on weekends, book online.' } }));
  assert.match(plain(pageHtml(v)), /Book a party/);
  assert.match(plain(pageHtml(v, 'fr')), /Réserver une fête/);
  // A party link alone says it too; a place that asks people to book keeps "Book".
  const { v: v2 } = await melissa();
  setLink(v2.id, 'https://example.com/birthday-parties');
  assert.match(plain(pageHtml(v2)), /Book a party/);
  const { v: v3 } = await melissa({}, { book: 'ahead' });
  setLink(v3.id, 'https://example.com/birthday-parties');
  assert.doesNotMatch(plain(pageHtml(v3)), /Book a party/);
  // The setup: walk-ins welcome titles the box for parties or groups.
  const g = await openSetup(base, t, { hash: 'booking' });
  assert.ok(g.text().includes(T.en.indoor.tbookQParty), g.text().slice(0, 400));
  assert.equal(T.en.indoor.tbookQParty, 'Party or group booking link (optional)');
  await g.click('[data-tpick="book:ahead"]');
  assert.ok(!g.text().includes(T.en.indoor.tbookQParty), 'book ahead: the plain title');
});

// Indoor test 18 (THE PRICE RULE, indoor-kinds.js): a play centre's price is one child admission (an exact kind): "Child
// admission $14."; with a lower typed price, "From $8 (child admission $14)."
test('3. Price: "Child admission $14", and "From $8 (child admission $14)" when a lower price is in her typed prices (page, card line); the price hint names her own other prices', async () => {
  const { v } = await melissa();
  assert.match(plain(pageHtml(v)), /Child admission \$14\./);
  publishPrices(v.id, [['Drop-in play, per child', '14'], ['Crawlers under 1', '8'], ['Adults with a child', 'Free'], ['10-visit punch pass', '126']]);
  const { t } = await melissa();
  // The line is written again when her prices are published (publishMenu does this; here the prices went in directly).
  app.writeIndoorVisitRows(v.id);
  const en = plain(pageHtml(v)), fr = plain(pageHtml(v, 'fr'));
  assert.match(en, /Prices From \$8 \(child admission \$14\)\./);
  assert.doesNotMatch(en, /Kids from \$14/);
  assert.match(fr, /À partir de 8\s\$ \(entrée enfant 14\s\$\)\./);
  const facts = app.indoorPlannerFacts(v.id);
  assert.deepEqual(facts.indoorPriceLine.map((x) => x.replace(/\s/g, ' ')), ['From {x} (child admission $14)', 'À partir de {x} (entrée enfant 14 $)']);
  assert.equal(facts.indoorPriceAt, 8);
  // The hint under the price box.
  const g = await openSetup(base, t, { hash: 'price' });
  const hint = g.doc.getElementById('suTpriceMore');
  assert.ok(hint && /toddlers, babies, adults/.test(hint.textContent), hint && hint.textContent);
  assert.doesNotMatch(hint.textContent, /kids, seniors/);
});

test('4. Groups for a kids place: the party chips and her line first, then "School or daycare groups: from what size? (optional)"; no size unless tapped', async () => {
  const { v, t } = await melissa();
  const g = await openSetup(base, t, { hash: 'groups' });
  const html = g.screen();
  const chip = html.indexOf('data-quick="Birthday parties with a party room"'), sizes = html.indexOf('id="suGroupSizes"'), q = html.indexOf('School or daycare groups: from what size?');
  assert.ok(chip > 0 && sizes > 0 && q > 0, 'all three are there');
  assert.ok(chip < q && q < sizes, `party chips first (${chip}), then the size question (${q}) and sizes (${sizes})`);
  await g.click('[data-quick="Birthday parties with a party room"]');
  await g.click('brewGroupsSave').catch(() => null);
  await g.settle();
  const saved = (JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id) || {}).info || '{}').rows || []).find((r) => r.label === 'Groups');
  assert.ok(saved && /Birthday parties with a party room/.test(saved.text), JSON.stringify(saved));
  assert.doesNotMatch(saved.text, /Groups of \d+ or more/);
  // Another kind keeps the size question first.
  const o = mk({ name: 'Climb T9', cuisine: 'Climbing gym' });
  const to = tokenFor(o.id);
  await ok(change(to, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no', age: 'all' } }));
  const g2 = await openSetup(base, to, { hash: 'groups' });
  assert.ok(!g2.screen().includes('School or daycare groups: from what size?'));
  assert.ok(g2.screen().indexOf('id="suGroupSizes"') < g2.screen().indexOf('data-quick='), 'sizes first for a climbing gym');
});

test('6. French page: her own English lines stay whole (no chip phrase translated inside them) and are queued for their French; the hub card\'s "more features" is French; the top label is her category', async () => {
  const { v, t } = await melissa({ description_fr: 'Centre de jeux intérieur à West Kelowna pour les enfants de 0 à 10 ans, avec une grande structure de jeu.' });
  const before = db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v.id).n;
  await ok(change(t, { visit_rows: { good_to_know: 'Grip socks required. Socks are $3 if you forget. An adult must stay with their kids.', groups: 'Birthday parties with a party room. Private party rooms on weekends, book online.' } }));
  const fr = plain(pageHtml(v, 'fr'));
  assert.ok(fr.includes('Grip socks required. Socks are $3 if you forget. An adult must stay with their kids.'), 'Good to know as she typed it');
  assert.ok(fr.includes('Private party rooms on weekends, book online.'), 'Groups as she typed it');
  assert.doesNotMatch(fr, /Réservez en ligne|Chaussettes antidérapantes obligatoires\. Socks/);
  const after = db.prepare("SELECT COUNT(*) AS n, MAX(help_note) AS note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines' AND status = 'help'").get(v.id);
  assert.equal(after.n, before + 1, 'one admin item for this change');
  assert.match(after.note, /Good to know: Grip socks required/);
  // A line made only of quick answers is shown in French (nothing to queue).
  const { v: v2, t: t2 } = await melissa();
  await ok(change(t2, { visit_rows: { good_to_know: 'Grip socks required. Coffee for parents.' } }));
  assert.match(plain(pageHtml(v2, 'fr')), /Chaussettes antidérapantes obligatoires\. Café pour les parents\./);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v2.id).n, 0);
  // The top label says her category.
  assert.match(fr, /Aire de jeux intérieure · West Kelowna/);
  assert.doesNotMatch(fr, /Activité intérieure · West Kelowna/);
  const live = await fetch(`${base}/fr/west-kelowna/indoor/${app.getVenue(v.id).slug}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  const hero = (/class="venue-hero-type">([^<]*)</.exec(live) || [])[1];
  assert.equal(hero, 'Aire de jeux intérieure');
  // The hub card's folded features.
  const hub = await fetch(`${base}/fr/indoor`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  assert.doesNotMatch(hub, /\d+ more features?</);
  assert.doesNotMatch(hub, />Fewer features</);
});

test('7. "Why it fits" quotes her own line for a word of the request (sensory) and for a party request (party rooms)', async () => {
  const { v, t } = await melissa({ name: 'Sensory Kidz T9', description: `${STORY} Quiet sensory-friendly hour every Tuesday 9 to 10 AM.` });
  // Her Known for too: a full box sets her Groups line aside (owner_dropped); it still counts.
  await ok(change(t, { visit_rows: { good_to_know: 'Grip socks required. Sensory-friendly hour Tuesdays 9-10am.', groups: 'Birthday parties with a party room. Private party rooms on weekends, book online.', known_for: 'West Kelowna indoor playground: bouncy house, inflatable slides and a padded toddler zone.' } }));
  setLink(v.id, 'https://example.com/book');
  assert.match(plain(pageHtml(v)), /Book a party/, 'her Groups line set aside still makes it a party link');
  const stopOf = (p) => itemsOf(p).find((x) => x.venue.id === v.id);
  const s1 = stopOf(app.runTripPlan({ text: 'sensory friendly activity for my son in West Kelowna' }, NOW));
  assert.ok(s1, 'she is in the sensory plan');
  assert.match((s1.why || []).join(' | '), /“Sensory-friendly hour Tuesdays 9-10am” \(the owner’s own words\)/);
  const s2 = stopOf(app.runTripPlan({ text: 'kids birthday party in West Kelowna' }, NOW));
  assert.ok(s2, 'she is in the birthday plan');
  assert.match((s2.why || []).join(' | '), /“Birthday parties with a party room” \(the owner’s own words\)/);
});

test('8. Family Fun: the chip and /indoor/family list the same places; play centres, climbing, bowling and arcades come first', async () => {
  const { v } = await melissa({ name: 'Family First Play T9' });
  const hub = await fetch(`${base}/indoor`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  const fam = await fetch(`${base}/indoor/family`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  const chipCount = (h) => Number((/href="\/indoor\/family"[^>]*>Family Fun <span>\((\d+)\)<\/span>/.exec(h) || [])[1]);
  const summary = Number((/(\d+) matching spots? — Family Fun/.exec(plain(fam)) || [])[1]);
  assert.ok(Number.isFinite(summary) && summary > 0, 'the family page counts its places');
  const famChip = chipCount(fam);
  assert.equal(famChip, summary, 'the chip and the list agree');
  // Her place is in the first few under Family Fun.
  const names = [...fam.matchAll(/data-venue-name="([^"]*)"/g)].map((m) => m[1]);
  const at = names.findIndex((x) => x.includes('Family First Play T9'));
  assert.ok(at >= 0 && at < 8, `play centre at ${at}: ${names.slice(0, 10).join(' | ')}`);
  assert.ok(hub.length > 0 && v.id);
});

test('9. Polish: Closed Jul 1 names her on a holiday list; the event thanks promises no email without one; typed Good to know ends with a period; a kids place gets "Coffee for parents"', async () => {
  const { v, t } = await melissa({ name: 'Holiday Kidz T9' });
  await ok(change(t, { closures: [{ from: '2027-07-01', to: '2027-07-01', note: 'Canada Day' }] }));
  const p = app.runTripPlan({ text: 'rainy day with kids in West Kelowna on Canada Day' }, NOW);
  assert.ok(!idsOf(p).includes(v.id), 'not planned on her closed day');
  assert.match((p.warnings || []).join(' '), new RegExp(`Closed Jul 1: [^.]*${v.name}`), (p.warnings || []).join(' | '));
  const fr = require('../trip-french-copy.js');
  assert.match(fr.t3FrenchText(`Closed Jul 1: ${v.name}.`), /^Fermés le 1er juill?\. : /);
  // The event form: the no-email thanks.
  const page = await fetch(`${base}/owner/${t}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  assert.ok(page.includes('It shows on What\\u2019s On once it\\u2019s approved.') || page.includes('It shows on What’s On once it’s approved.'), 'the no-email thanks is there');
  assert.match(page, /!T\.evAccount && !sentAs\.email \? T\.evDoneNoMail : T\.evDoneMail/);
  // Good to know: chips for a kids place, and a typed line ends with a period.
  const g = await openSetup(base, t, { hash: 'bring' });
  const chips = g.doc.querySelectorAll('[data-quick][data-box="suBring"]').map((c) => c.getAttribute('data-quick'));
  assert.ok(chips.includes('Coffee for parents'), chips.join(' | '));
  assert.ok(!chips.includes('Café or snack bar on site'), 'no generic café chip');
  await g.type('suBring', 'Grip socks required. Sensory-friendly hour Tuesdays 9-10am');
  await g.click('bringSave').catch(() => null);
  await g.settle();
  const saved = (JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id) || {}).info || '{}').rows || []).find((r) => r.label === 'Good to know');
  assert.equal(saved && saved.text, 'Grip socks required. Sensory-friendly hour Tuesdays 9-10am.');
});
