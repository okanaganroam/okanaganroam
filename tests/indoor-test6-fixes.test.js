// Indoor test 6 (2026-11-19; Priya owns a pottery and paint studio in Penticton: drop-in paint-your-own pottery $25 for all
// ages, 6-week wheel courses 14+, a Friday date night $95 for two, kids' camps and parties; closed Sundays and Mondays and
// over Christmas). Each fix from her report, checked with the real setup page script and real taps (tests/setup-sim.js),
// Build My Trip, search and the public page. Her Help questions are in tests/indoor-help-routing.test.js; every kind's
// kids and family plans are in tests/indoor-kids-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test6-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const frCopy = require('../trip-french-copy.js');
const IK = require('../indoor-kinds.js');
const T = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Tue–Sat 11–6, Wed and Fri to 6 (her open studio hours), closed Sunday and Monday.
const HOURS = JSON.stringify({ mon: null, tue: [['11:00', '18:00']], wed: [['11:00', '18:00']], thu: [['11:00', '18:00']], fri: [['11:00', '21:00']], sat: [['11:00', '18:00']], sun: null });
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T6 Fixture ${++n}`, slug: `indoor-t6-${n}`, region: 'penticton', type, latitude: 49.48 + n / 3000, longitude: -119.59,
  address: `${100 + n} Fairview Rd, Penticton, BC`, phone: '250-555-0147', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 6 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.97.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);
const badge = (id) => db.prepare('SELECT arts_culture FROM venues WHERE id = ?').get(id).arts_culture;
const goodToKnow = (id) => { const r = db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id); const o = r ? JSON.parse(r.info) : { rows: [] }; return ((o.rows || []).find((x) => x.label === 'Good to know') || {}).text || ''; };

const STORY = 'A cozy, sunny pottery and paint studio in Penticton. Drop in any time we’re open to paint your own pottery, no booking needed: pick a piece, paint it, and we glaze and fire it for you. Want to get your hands muddy? Sign up for a 6-week wheel-throwing course or a Friday date night on the wheel. Kids’ summer camps and private parties too.';
const PRICES = [['Paint your own pottery (drop-in)', '25 + the piece'], ['Wheel-throwing course, 6 weeks', '320'], ['Date night wheel class, Fridays 7 PM', '95 for two'], ['Kids’ summer camps', ''], ['Private parties', '']];
// Priya's studio as she left it: classes, All ages, walk-ins welcome, $25, her Groups, Known for and prices.
const priya = async (o = {}, research = null) => {
  const v = mk('indoor', { name: `Donut House Studios T6 ${n + 1}`, cuisine: 'Pottery studio', description: STORY, kid_friendly: 1, great_groups: 1, rating: 4.6, reviews: 40, ...o });
  if (research) db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(research));
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['classes'], length: '2-3h', book: 'no', age: 'all', year: 'all' } }));
  await ok(change(t, { indoor_price: 25 }));
  if (!research) {
    await ok(change(t, { visit_rows: { groups: 'Groups of 8 or more: please book ahead. Private parties and workshops. Kids’ birthday classes. Kids’ summer camps in July and August.', known_for: 'Paint-your-own pottery and Friday date nights on the wheel' } }));
    db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at, source) VALUES (?, 'published', ?, '2026-11-19', 'owner')")
      .run(v.id, JSON.stringify({ sections: [{ name: 'Classes', note: '', items: PRICES.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));
  }
  return { v, t };
};

test('1. Build My Trip: her All ages studio ("Studios" in its name) is in the kids, rainy-day, family and birthday plans, ahead of an unanswered gallery and theatre; never a casino or spa', async () => {
  const { v } = await priya();
  const gallery = mk('indoor', { name: 'Penticton Art Gallery T6', cuisine: 'Art gallery', description: 'A public art gallery.', rating: 4.8, reviews: 400 });
  const theatre = mk('indoor', { name: 'Cleland Theatre T6', cuisine: 'Live theatre', description: 'A community theatre.', rating: 4.8, reviews: 500 });
  mk('indoor', { name: 'Roll N Stones Fun Centre T6', cuisine: 'Bowling and arcade', description: 'Bowling, an arcade and laser tag for families.', rating: 4.7, reviews: 400, kid_friendly: 1 });
  mk('indoor', { name: 'Penticton Museum T6', cuisine: 'Museum', description: 'Local history museum.', rating: 4.7, reviews: 300, kid_friendly: 1 });
  mk('indoor', { name: 'Penticton Leisure Pool T6', cuisine: 'Pool', description: 'A pool with a lazy river.', rating: 4.7, reviews: 300, kid_friendly: 1 });
  const casino = mk('indoor', { name: 'Cascades Casino T6', cuisine: 'Casino', description: 'Slots. 19+.', rating: 4.9, reviews: 900 });
  const spa = mk('indoor', { name: 'Penticton Day Spa T6', cuisine: 'Spa', description: 'A day spa.', rating: 4.9, reviews: 800 });
  for (const q of ['rainy day with kids in Penticton', 'family fun in Penticton', 'kids birthday party in Penticton', 'things to do with a 6 year old in Penticton']) {
    const ids = idsOf(app.runTripPlan({ text: q }, NOW));
    assert.ok(ids.includes(v.id), `${q}: her studio is in`);
    for (const id of [casino.id, spa.id]) assert.ok(!ids.includes(id), `${q}: never ${id}`);
    for (const id of [gallery.id, theatre.id]) if (ids.includes(id)) assert.ok(ids.indexOf(v.id) < ids.indexOf(id), `${q}: before ${id}`);
  }
  // Her reasons say why (her own answer).
  const p = app.runTripPlan({ text: 'kids birthday party in Penticton' }, NOW);
  const mine = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.match(JSON.stringify(mine), /Hosts birthday parties, from its listing|All ages welcome \(the owner’s own answer\)/);
});

test('2. The classes hours screens say where evening classes go (one line); a bowling alley’s don’t', async () => {
  const { t } = await priya();
  const s = await openSetup(base, t, { hash: 'hours' });
  assert.match(s.doc.getElementById('suClassNightsHint').textContent, /^Evening classes outside these hours\? Keep your open studio hours here, and add class nights in Good to know\.$/);
  await s.click('go:hours:edit');
  assert.ok(s.has('#suClassNightsHint'), 'on the day-by-day screen too');
  const fr = await openSetup(base, t, { hash: 'hours', lang: 'fr' });
  assert.match(fr.doc.getElementById('suClassNightsHint').textContent, /heures d’atelier libre/);
  const b = mk('indoor', { name: 'Lanes T6', description: 'Bowling.' });
  const tb = tokenFor(b.id);
  await ok(change(tb, { indoor_info: { kinds: ['bowling'], length: '1-2h' } }));
  const sb = await openSetup(base, tb, { hash: 'hours' });
  assert.ok(!sb.has('#suClassNightsHint'));
  await sb.click('go:hours:edit');
  assert.ok(!sb.has('#suClassNightsHint'));
});

test('3. Hours copy (real taps): "Mon–Fri" never opens a Monday she sees Closed; "Tue–Sat" is offered only when Monday is closed and fills Tuesday to Saturday', async () => {
  // A new page with no hours (as hers was): Monday's card is open, showing Closed.
  const { t } = await priya({ hours: null });
  const row = (s, d) => { const m = new RegExp(`id="suRow${d}"[\\s\\S]*?(?=<div class="su-day|$)`).exec(s.screen()); return m ? plain(m[0]) : ''; };
  const s = await openSetup(base, t, { hash: 'hours' });
  await s.click('go:hours:edit');
  await s.click('[data-hopen="tue"]');
  await s.click('[data-dayopen="tue"]');
  assert.ok(s.has('[data-copytuesat="tue"]'), 'Tue–Sat beside Mon–Fri');
  await s.click('[data-copywk="tue"]');
  assert.match(row(s, 'mon'), /Closed/);
  assert.doesNotMatch(row(s, 'mon'), /AM|PM/, 'Monday stays closed');
  assert.match(row(s, 'fri'), /AM – .*PM/);
  // Tue–Sat on a new page: Saturday too, Sunday and Monday stay closed.
  const { t: t2 } = await priya({ hours: null });
  const s2 = await openSetup(base, t2, { hash: 'hours' });
  await s2.click('go:hours:edit');
  await s2.click('[data-hopen="tue"]');
  await s2.click('[data-dayopen="tue"]');
  await s2.click('[data-copytuesat="tue"]');
  for (const d of ['wed', 'thu', 'fri', 'sat']) assert.match(row(s2, d), /AM – .*PM/, d);
  for (const d of ['mon', 'sun']) assert.doesNotMatch(row(s2, d), /AM – /, d);
  // Monday open: no Tue–Sat button.
  const v3 = mk('indoor', { name: 'Open Mondays T6', hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '17:00']]]))) });
  const t3 = tokenFor(v3.id);
  await ok(change(t3, { indoor_info: { kinds: ['classes'], length: '2-3h' } }));
  const s3 = await openSetup(base, t3, { hash: 'hours' });
  await s3.click('go:hours:edit');
  await s3.click('[data-hopen="tue"]');
  assert.ok(!s3.has('[data-copytuesat]'));
  assert.ok(s3.has('[data-copywk="tue"]'));
  // Other kinds of places share the button the same way (strings in both languages).
  assert.equal(T.en.copyTueSat, 'Tue–Sat');
  assert.equal(T.fr.copyTueSat, 'Mar–sam');
});

test('4. A researched Good to know line that contradicts her answers is flagged, never put in her box as hers, and never dropped', async () => {
  const research = { rows: [{ label: 'Good to know', text: 'Studio is by appointment only outside classes; call or text to book a studio tour.' }], source_url: 'https://donuthousestudios.com/', checked_at: '2026-10-31' };
  const { v, t } = await priya({}, research);
  const s = await openSetup(base, t, { hash: 'bring' });
  assert.match(s.doc.getElementById('suBringClash').textContent, /^Found online, may not match your answers: check it\./);
  assert.match(s.doc.getElementById('suBringFound').textContent, /by appointment only/);
  assert.equal(s.doc.getElementById('suBring').value, '', 'not pre-filled as hers');
  assert.ok(!s.has('#suBringGuess'));
  // Skip: research's line stays as it was.
  await s.click('skip:bring');
  assert.match(goodToKnow(v.id), /by appointment only/);
  // Her own line replaces it.
  const s2 = await openSetup(base, t, { hash: 'bring' });
  await s2.type('suBring', 'Drop in to paint pottery any time we’re open, no booking.');
  await s2.click('bringSave');
  assert.equal(goodToKnow(v.id), 'Drop in to paint pottery any time we’re open, no booking.');
  // "Adults only" against All ages is flagged too; a line that agrees is pre-filled as before.
  const { t: t2 } = await priya({}, { rows: [{ label: 'Good to know', text: 'Adults only (19+) on Friday nights.' }] });
  const a = await openSetup(base, t2, { hash: 'bring' });
  assert.ok(a.has('#suBringClash'));
  const { t: t3 } = await priya({}, { rows: [{ label: 'Good to know', text: 'Free parking on site.' }] });
  const c = await openSetup(base, t3, { hash: 'bring' });
  assert.ok(!c.has('#suBringClash'));
  assert.equal(c.doc.getElementById('suBring').value, 'Free parking on site.');
  assert.ok(c.has('#suBringGuess'));
});

test('5. The Arts & Culture badge (real taps): classes -> gallery puts it on with the kind, gallery -> classes takes it off', async () => {
  const { v, t } = await priya();
  assert.equal(badge(v.id), 0);
  const s = await openSetup(base, t, { hash: 'indoor' });
  await s.click('[data-tkind="classes"]');
  await s.click('[data-tkind="gallery"]');
  await s.click('indoorSave');
  assert.equal(badge(v.id), 1, 'the gallery kind put it on');
  const s2 = await openSetup(base, t, { hash: 'indoor' });
  assert.equal(s2.cfg.artsAuto, true, 'the server knows the kind put it on');
  await s2.click('[data-tkind="gallery"]');
  await s2.click('[data-tkind="classes"]');
  await s2.click('indoorSave');
  assert.equal(badge(v.id), 0, 'back to classes: it comes off');
});

test('6. Vocabulary: "something creative", "art class", "summer camp" and "paint your own pottery" find her as classes (never Camping), and the header names the kind, not "“paint” and “own”"', async () => {
  const { v } = await priya();
  mk('restaurant', { name: 'Chicken Place T6', cuisine: 'Chicken', description: 'Creative chicken dishes.', rating: 4.9, reviews: 900 });
  mk('winery', { name: 'Creative Wines T6', cuisine: 'Winery', description: 'Creative wines.', rating: 4.9, reviews: 900 });
  for (const [q, head] of [['something creative to do in Penticton', /^Classes & workshops in Penticton\.$/], ['art class in Penticton', /^Classes & workshops in Penticton\.$/], ['summer camp in Penticton', /^Kids’ camps in Penticton\.$/], ['kids day camp Penticton', /Kids’ camps/], ['paint your own pottery Penticton Saturday', /^Classes & workshops in Penticton on Saturday\.$/], ['hands-on workshop in Penticton', /Classes & workshops/]]) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(idsOf(p).includes(v.id), `${q}: ${itemsOf(p).map((x) => x.venue.name).join(' | ')}`);
    assert.match(p.summary, head, q);
    assert.doesNotMatch(p.summary, /Camping|“paint”|“own”|mention/, q);
  }
  // Her camp line is the reason.
  const camp = itemsOf(app.runTripPlan({ text: 'summer camp in Penticton' }, NOW)).find((x) => x.venue.id === v.id);
  assert.match(JSON.stringify(camp), /Runs kids’ camps, from its listing/);
  assert.equal(frCopy.t3FrenchSummary('Kids’ camps in Penticton.'), 'Camps pour enfants à Penticton.');
  assert.equal(frCopy.t3FrenchSummary('Classes & workshops in Penticton on Saturday.'), 'Cours et ateliers à Penticton samedi.');
  // Camping is still camping.
  assert.match(app.runTripPlan({ text: 'camping in Penticton' }, NOW).summary, /Camping/);
  // The kind's search words.
  assert.deepEqual(IK.indoorKindsNamedIn('something creative to do'), ['classes']);
  assert.ok(IK.indoorKindsNamedIn('summer camp').includes('classes'));
});

test('7. Search: "pottery" lists her studio (an owner-picked classes place) above cafés that mention pottery', async () => {
  const { v } = await priya({ region: 'summerland', latitude: 49.6, longitude: -119.67 });
  mk('cafe', { region: 'summerland', name: 'Corner Cafe T6', cuisine: 'Cafe', description: 'Coffee on handmade pottery mugs. Pottery for sale.', rating: 4.9, reviews: 900 });
  mk('cafe', { region: 'summerland', name: 'Soe Cafe T6', cuisine: 'Cafe', description: 'A cafe with local pottery on the shelves.', rating: 4.9, reviews: 900 });
  for (const q of ['pottery', 'pottery summerland']) {
    const h = plain(await fetch(`${base}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text()));
    const me = h.indexOf(v.name), cafe = h.indexOf('Corner Cafe T6');
    assert.ok(me > 0, `${q}: she is listed`);
    if (cafe > 0) assert.ok(me < cafe, `${q}: before the café`);
  }
});

test('8. Date night: her own date night is the first other good option on a Friday, with her own line; not on a Wednesday', async () => {
  const at = { region: 'naramata', latitude: 49.59, longitude: -119.59 };
  const { v } = await priya(at);
  for (let i = 0; i < 3; i++) mk('restaurant', { ...at, name: `Romantic Bistro ${i} T6`, cuisine: 'French', description: 'Romantic candlelit dinners.', price: 3, rating: 4.7, reviews: 300, hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['17:00', '22:00']]]))) });
  mk('cocktail', { ...at, name: 'Candle Lounge T6', cuisine: 'Cocktail lounge', description: 'Romantic cocktails.', price: 3, rating: 4.7, reviews: 300, hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['16:00', '23:00']]]))) });
  const fri = app.runTripPlan({ text: 'date night in Naramata on Friday' }, NOW);
  assert.ok(fri.outing, 'an outing');
  const alt = (fri.outing.alternates || [])[0];
  assert.equal(alt && alt.venue.id, v.id, (fri.outing.alternates || []).map((a) => a.venue.name).join(' | '));
  assert.match(JSON.stringify(alt), /Its own date night: “Paint-your-own pottery and Friday date nights on the wheel”/);
  assert.match(frCopy.t3FrenchText('Its own date night: “Friday date nights”'), /^Sa propre soirée en amoureux : « Friday date nights »$/);
  const wed = app.runTripPlan({ text: 'date night in Naramata on Wednesday' }, NOW);
  assert.ok(!(wed.outing && (wed.outing.alternates || []).some((a) => a.venue.id === v.id)), 'her date night is on Fridays');
  // From her price list alone (no line saying it).
  const v2 = mk('indoor', { ...at, name: 'Clay Date T6', cuisine: 'Pottery studio', description: 'A pottery studio.', hours: HOURS });
  const t2 = tokenFor(v2.id);
  await ok(change(t2, { indoor_info: { kinds: ['classes'], length: '2-3h', age: 'all' } }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at, source) VALUES (?, 'published', ?, '2026-11-19', 'owner')")
    .run(v2.id, JSON.stringify({ sections: [{ name: 'Classes', note: '', items: [{ name: 'Date night for two', description: '', price: '95', dietary: [], check: false }] }] }));
  const fri2 = app.runTripPlan({ text: 'date night in Naramata on Friday' }, NOW);
  assert.ok((fri2.outing.alternates || []).some((a) => a.venue.id === v2.id && /Date night for two \(\$95\)/.test(JSON.stringify(a))));
});

test('9. Polish: the prices tile, the story and Known for examples and the Good to know chips follow the kind; cinemas have no Lockers chip', async () => {
  assert.equal(T.en.indoor.kindText.classes.menuTypeSub, 'Each class and its price, one line at a time');
  assert.equal(T.fr.indoor.kindText.classes.menuTypeSub, 'Chaque cours et son prix, une ligne à la fois');
  assert.equal(T.en.indoor.kindText.spa.menuTypeSub, 'Each treatment or pass and its price, one line at a time');
  const { t } = await priya();
  const m = await openSetup(base, t, { hash: 'menu' });
  assert.match(m.text(), /Each class and its price, one line at a time/);
  assert.doesNotMatch(m.text(), /ticket or pass/);
  const st = await openSetup(base, t, { hash: 'story' });
  assert.match(st.text(), /pottery studio/);
  assert.doesNotMatch(st.text(), /family-run place since 2010/);
  const g = await openSetup(base, t, { hash: 'bring' });
  for (const c of ['Wear clothes that can get messy', 'Pieces ready in about a week']) assert.ok(g.has(`[data-quick="${c}"]`), c);
  assert.ok(!g.has('[data-quick="Lockers available"]'));
  assert.ok(!g.has('[data-quick="Café or snack bar on site"]'));
  // Every kind's chips: no lockers for a cinema or theatre; no grip socks or waiver for a pool; a spa's swimsuit.
  const chipsOf = (k) => T.en.indoor.quick.good_to_know_kinds[IK.indoorKindText([k], 'en').gtk];
  for (const k of ['cinema', 'theatre']) assert.ok(!chipsOf(k).includes('Lockers available'), k);
  assert.ok(!chipsOf('pool').includes('Grip socks required') && !chipsOf('pool').includes('Waiver to sign before you play'));
  assert.ok(chipsOf('pool').includes('Bring a swimsuit'));
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    const en = chipsOf(k), fr = T.fr.indoor.quick.good_to_know_kinds[IK.indoorKindText([k], 'en').gtk];
    assert.ok(en && en.length >= 3 && en.length <= 7 && fr.length === en.length, k);
  }
  // A chip she taps shows in French on her French page (presets).
  const { v: v2, t: t2 } = await priya();
  await ok(change(t2, { visit_rows: { good_to_know: 'Wear clothes that can get messy. Pieces ready in about a week.' } }));
  assert.match(plain(pageHtml(v2, 'fr')), /Portez des vêtements qui peuvent se salir/);
});

test('10. A weekly closed day says so ("… is closed Mondays") when the list moves to another town; the English intro shows her whole story', async () => {
  const { v } = await priya({ region: 'oliver', latitude: 49.18, longitude: -119.55 });
  mk('indoor', { name: 'Work of Art Pottery T6', region: 'osoyoos', cuisine: 'Pottery studio', description: 'Pottery classes.', latitude: 49.03, longitude: -119.47, hours: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '17:00']]]))) });
  const p = app.runTripPlan({ text: 'pottery class in Oliver on Monday' }, NOW);
  assert.ok(!idsOf(p).includes(v.id));
  assert.ok((p.warnings || []).some((w) => w.includes(`${v.name} is closed Mondays`)), JSON.stringify(p.warnings));
  const f = frCopy.t3FrenchPlan(JSON.parse(JSON.stringify(p)));
  assert.ok((f.warnings || []).some((w) => w.includes(`${v.name} — Fermé le lundi`)), JSON.stringify(f.warnings));
  // Her whole four-sentence story is the intro (338 letters).
  const intro = (/<p class="gb-intro">([\s\S]*?)<\/p>/.exec(pageHtml(v, 'en')) || [])[1] || '';
  assert.match(intro, /Kids’ summer camps and private parties too\.$/);
});
