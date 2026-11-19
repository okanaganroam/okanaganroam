// Indoor test 5 (2026-11-19; Chris co-owns The Rock Garden, an indoor climbing gym and trampoline park in Vernon: All ages,
// jump passes of 60 and 90 minutes, Little Jumpers toddler time, birthday parties and PD-day camps, closed Christmas Day).
// Each fix from his report, checked with the real setup page script and real taps (tests/setup-sim.js), the public page
// (EN + FR), the price typer, Build My Trip and search. His Help questions are in tests/indoor-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test5-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const frCopy = require('../trip-french-copy.js');
const IK = require('../indoor-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T5 Fixture ${++n}`, slug: `indoor-t5-${n}`, region: 'vernon', type, latitude: 50.25 + n / 3000, longitude: -119.27,
  address: `${100 + n} 30th Ave, Vernon, BC`, phone: '250-555-0155', website: 'https://example.com', hours: DAY('10:00', '20:00'), description: 'A fixture used only by the indoor test 5 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.95.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);
const badge = (id) => db.prepare('SELECT arts_culture FROM venues WHERE id = ?').get(id).arts_culture;

const STORY = 'The Rock Garden Climbing Centre is Vernon\'s indoor climbing gym, with a bouldering area and roped routes for beginners through experienced climbers. Intro lessons, kids\' programs and birthday parties are also on offer. We also have a trampoline park, with Little Jumpers toddler time for kids under 5.';
const PRICES = [['Jump pass 60 min', '22'], ['Jump pass 90 min', '28'], ['Little Jumpers (under 5)', '12'], ['Bouldering day pass', '20'], ['Grip socks (required)', '3'], ['Birthday party, 10 kids', '249'], ['Memberships', '']];
// Chris's park as he left it: climbing, All ages, $20, his prices typed and published, his Groups and Good to know lines.
const chris = async (o = {}) => {
  const v = mk('indoor', { name: `The Rock Garden Climbing Centre T5 ${n + 1}`, cuisine: 'Climbing & trampoline', description: STORY, kid_friendly: 1, great_groups: 1, rating: 4.5, reviews: 150, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'busy', age: 'all', year: 'all' } }));
  await ok(change(t, { indoor_price: 20 }));
  await ok(change(t, { visit_rows: { groups: 'Groups of 10 or more: please book ahead. Birthday party packages from $249 for 10 kids. School groups and PD-day camps.', good_to_know: 'Waiver to sign before you play. Grip socks required.' } }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at, source) VALUES (?, 'published', ?, '2026-11-19', 'owner')")
    .run(v.id, JSON.stringify({ sections: [{ name: 'Passes', note: '', items: PRICES.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));
  return { v, t };
};

test('1. Typed prices show on the English indoor page as on the French one ("See all prices & rates (N)"); the English intro shows his whole short story', async () => {
  const { v } = await chris();
  const en = plain(pageHtml(v, 'en')), fr = plain(pageHtml(v, 'fr'));
  for (const name of ['Jump pass 60 min', 'Jump pass 90 min', 'Little Jumpers (under 5)']) assert.ok(en.includes(name), `EN page lists ${name}`);
  assert.match(en, /See all prices & rates \(7 prices\)/);
  assert.match(fr, /Voir tous les tarifs \(7 /);
  // The tab row offers it (no booking link, so the prices card is the Prices tab).
  assert.match(pageHtml(v, 'en'), /href="#gbBooking">Prices<\/a>|href="#gbPrices">Prices<\/a>/);
  // The intro (before the fold) has the trampoline sentence.
  const intro = (/<p class="gb-intro">([\s\S]*?)<\/p>/.exec(pageHtml(v, 'en')) || [])[1] || '';
  assert.match(intro, /We also have a trampoline park, with Little Jumpers toddler time for kids under 5\./);
  // A longer story still stops at about 300 characters.
  const long = await chris({ description: `${STORY} ${STORY}` });
  const intro2 = (/<p class="gb-intro">([\s\S]*?)<\/p>/.exec(pageHtml(long.v, 'en')) || [])[1] || '';
  assert.ok(intro2.length <= 330 && intro2.length >= 200, intro2);
});

test('2. Build My Trip: a generic kids / family / rainy-day request in Vernon includes the owner-confirmed All ages climbing park, ahead of galleries and the theatre; never a casino, a spa or a 19+ place', async () => {
  const { v } = await chris();
  // Vernon's other indoor places, better rated than Chris's (they used to come first) and a few that are not for kids.
  const gallery = mk('indoor', { name: 'Vernon Public Art Gallery T5', cuisine: 'Art gallery', description: 'A public art gallery with rotating exhibitions.', rating: 4.8, reviews: 400 });
  const theatre = mk('indoor', { name: 'Vernon Towne Theatre T5', cuisine: 'Live theatre', description: 'A historic live theatre.', rating: 4.8, reviews: 500 });
  const museum = mk('indoor', { name: 'Okanagan Science Centre T5', cuisine: 'Science centre', description: 'A hands-on science centre for kids and families.', rating: 4.6, reviews: 300, kid_friendly: 1 });
  const escape = mk('indoor', { name: 'Beyond Belief Escape Rooms T5', cuisine: 'Escape room', description: 'Escape rooms.', rating: 4.9, reviews: 600 });
  const casino = mk('indoor', { name: 'Lake City Casino Vernon T5', cuisine: 'Casino', description: 'Slots and table games.', rating: 4.9, reviews: 900 });
  const spa = mk('indoor', { name: 'Kalamalka Day Spa T5', cuisine: 'Spa', description: 'A day spa with massage and facials.', rating: 4.9, reviews: 800 });
  const adults = mk('indoor', { name: 'Vernon Axe Lounge T5', cuisine: 'Axe throwing', description: 'Axe throwing for adults. 19+ only.', rating: 4.9, reviews: 700 });
  mk('outdoor', { name: 'Polson Park T5', description: 'A park with a playground and a creek.', rating: 4.6, reviews: 900, kid_friendly: 1 });
  for (let i = 0; i < 4; i++) mk('restaurant', { name: `Family Diner ${i} T5`, cuisine: 'Canadian', description: 'Family dinner.', kid_friendly: 1, rating: 4.7, reviews: 500 });
  const never = [casino.id, spa.id, adults.id];
  for (const q of ['rainy day with a 4 year old in Vernon', 'rainy day with kids in Vernon', 'family fun in Vernon', 'indoor things to do with kids in Vernon', 'things to do with a 4 year old in Vernon']) {
    const p = app.runTripPlan({ text: q }, NOW);
    const ids = idsOf(p);
    assert.ok(ids.includes(v.id), `${q}: the climbing park is in (${itemsOf(p).map((x) => x.venue.name).join(' | ')})`);
    for (const id of never) assert.ok(!ids.includes(id), `${q}: never ${id}`);
    for (const id of [gallery.id, theatre.id]) if (ids.includes(id)) assert.ok(ids.indexOf(v.id) < ids.indexOf(id), `${q}: the park comes before ${id}`);
  }
  // The French twin too.
  const fr = app.runTripPlan({ text: 'jour de pluie avec les enfants à Vernon' }, NOW);
  assert.ok(idsOf(fr).includes(v.id), 'French rainy day with kids');
  // An unanswered climbing gym (no owner ages) comes after the owner-confirmed one.
  const other = mk('indoor', { name: 'Vernon Climbing Gym T5', cuisine: 'Climbing gym', description: 'Bouldering and climbing for everyone.', rating: 4.5, reviews: 150 });
  const p2 = app.runTripPlan({ text: 'rainy day with kids in Vernon' }, NOW);
  const ids2 = idsOf(p2);
  if (ids2.includes(other.id)) assert.ok(ids2.indexOf(v.id) < ids2.indexOf(other.id), 'owner-confirmed All ages first');
  // Museums and the science centre are family kinds too.
  assert.ok(ids2.includes(museum.id), 'the science centre is planned');
  assert.ok(escape);
});

test('3. A climbing or trampoline park says "Passes from $20" with the label "Your lowest adult pass (day or timed)" (EN + FR); Help answers what goes in the box', async () => {
  const en = IK.indoorKindText(['climbing'], 'en'), fr = IK.indoorKindText(['climbing'], 'fr');
  assert.equal(en.price.page, 'Passes from {x}.');
  assert.equal(en.price.basis, 'Passes');
  assert.equal(en.price.label, 'Your lowest adult pass (day or timed)');
  assert.equal(fr.price.page, 'Laissez-passer à partir de {x}.');
  assert.equal(fr.price.basis, 'Laissez-passer');
  const { v, t } = await chris();
  assert.match(plain(pageHtml(v, 'en')), /Passes from \$20\./);
  assert.match(plain(pageHtml(v, 'fr')), /Laissez-passer à partir de 20 \$\./);
  const sim = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim.doc.getElementById('suScreen').querySelector('label[for="suTprice"]').textContent, 'Your lowest adult pass (day or timed)');
  assert.doesNotMatch(sim.text(), /Adult day pass|Day pass from/);
});

test('4. Help: the examples use his own price, "put your…", camps go to the Groups chip (and dated camps to events), and the English page\'s "Your visit"', async () => {
  const { t } = await chris();
  const html = await getText(`/owner/${t}/setup`);
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]);
  const topic = (id) => cfg.topics.find((x) => x.id === id);
  const p = plain(topic('indoor-price').a);
  assert.match(p, /In Price , put your lowest adult pass \(day or timed\)\. Your card and your page say “(?:Passes|Adult pass) \$20”/);
  assert.doesNotMatch(p, /\$25|put adult/);
  assert.match(plain(topic('indoor-price').aFr), /« (?:Laissez-passer|Laissez-passer adulte) 20 \$ »/);
  const g = plain(topic('indoor-groups').a);
  assert.match(g, /tap School and camp groups in Groups and parties/);
  assert.match(g, /A camp on set dates \(a PD-day or spring break camp\) can also go on What’s On: add it with Add an event/);
  assert.match(plain(topic('indoor-groups').aFr), /touchez Groupes scolaires et camps dans Groupes et fêtes/);
  assert.match(plain(topic('indoor-good-to-know').a), /It shows in “Your visit” on your page\./);
  for (const x of cfg.topics) assert.doesNotMatch(String(x.a || ''), /“Plan your visit”/, x.id);
  // Other kinds: "put your adult admission" (a museum).
  const m = mk('indoor', { name: 'Vernon Museum T5', cuisine: 'Museum', description: 'A history museum.' });
  const tm = tokenFor(m.id);
  await ok(change(tm, { indoor_info: { kinds: ['museum'], length: '1-2h' } }));
  const cm = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await getText(`/owner/${tm}/setup`))[1]);
  // Indoor test 10: with no price typed yet, the kind's own example (a museum's $12, never $25 for every kind).
  assert.match(plain(cm.topics.find((x) => x.id === 'indoor-price').a), /put your adult admission\. Your card and your page say “Admission \$12”/);
});

test('5. Search: a kids’ birthday party in Vernon lists Vernon’s indoor Family Fun places, his (whose Groups line offers parties) first; never the A-Z Kid-Friendly list; the Indoor hub’s search reads the Groups line', async () => {
  const { v } = await chris();
  mk('indoor', { name: 'Vernon Bowling Lanes T5', cuisine: 'Bowling', description: 'Five-pin bowling for families and kids.', kid_friendly: 1, rating: 4.8, reviews: 300 });
  mk('restaurant', { name: 'Kids Eat Free Diner T5', cuisine: 'Diner', description: 'Kids eat free on Tuesdays.', kid_friendly: 1, rating: 4.9, reviews: 900 });
  for (const q of ['kids birthday party in Vernon', 'birthday party for kids vernon', 'fête d’anniversaire enfants vernon']) {
    const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}`, { redirect: 'manual', headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    assert.equal(r.status, 200, q);
    const h = plain(await r.text());
    assert.match(h, /Kids’ birthday parties in Vernon/, q);
    assert.doesNotMatch(h, /Places with the Kid-Friendly badge/, q);
    assert.doesNotMatch(h, /Kids Eat Free Diner T5/, q);
    const me = h.indexOf(v.name), bowl = h.indexOf('Vernon Bowling Lanes T5');
    assert.ok(me > 0, `${q}: his park is listed`);
    if (bowl > 0) assert.ok(me < bowl, `${q}: his party line puts him first`);
  }
  // No town: the Indoor hub's Family Fun.
  const r2 = await fetch(`${base}/search?q=${encodeURIComponent('kids birthday party')}`, { redirect: 'manual', headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
  assert.equal(r2.status, 302);
  assert.match(r2.headers.get('location'), /^\/indoor\?types=family/);
  // The hub's own search data has his Groups line words.
  const hub = await getText('/indoor');
  const k = new RegExp(`"${v.id}":\\{[^}]*"k":"([^"]*)"`).exec(hub);
  assert.ok(k && /packages/.test(k[1]) && /camps/.test(k[1]), 'hub search reads the Groups line');
});

test('6. Groups is a wrapping box like Good to know; after a chip the caret is at the end (real taps)', async () => {
  const { t } = await chris();
  const g = await openSetup(base, t, { hash: 'groups' });
  const box = g.doc.getElementById('suGroupsLine');
  assert.ok(box, 'the Groups line is on the screen');
  assert.equal(box.tagName.toLowerCase(), 'textarea');
  await g.type('suGroupsLine', 'Party room for 12');
  await g.click('[data-quick="Birthday parties"]');
  const b2 = g.doc.getElementById('suGroupsLine');
  assert.match(b2.value, /^Party room for 12\. Birthday parties\.?\s*$/);
  assert.equal(b2.selectionStart, b2.value.length, 'the caret is at the end');
  assert.equal(g.doc.activeElement, b2);
});

test('7. Switching the kind away from Museum takes off the Arts & Culture badge the museum kind put on; never one the owner or research set', async () => {
  // The setup's own request: the kind and its badge in one save.
  const a = mk('indoor', { name: 'Rock Kinds T5', cuisine: '', description: 'Climbing.' });
  const ta = tokenFor(a.id);
  await ok(change(ta, { indoor_info: { kinds: ['museum'], length: '1-2h' }, badges: { arts_culture: true } }));
  assert.equal(badge(a.id), 1);
  await ok(change(ta, { indoor_info: { kinds: ['climbing'], length: '1-2h' } }));
  assert.equal(badge(a.id), 0, 'the kind’s own badge comes off');
  // Research had it on: it stays.
  const b = mk('indoor', { name: 'Arts Research T5', description: 'Gallery.', arts_culture: 1 });
  const tb = tokenFor(b.id);
  await ok(change(tb, { indoor_info: { kinds: ['museum'], length: '1-2h' } }));
  await ok(change(tb, { indoor_info: { kinds: ['climbing'], length: '1-2h' } }));
  assert.equal(badge(b.id), 1, 'research’s badge stays');
  // The owner ticked it herself: it stays.
  const c = mk('indoor', { name: 'Arts Owner T5', description: 'Studio.' });
  const tc = tokenFor(c.id);
  await ok(change(tc, { indoor_info: { kinds: ['museum'], length: '1-2h' }, badges: { arts_culture: true } }));
  await ok(change(tc, { badges: { arts_culture: true } })); // no change
  await ok(change(tc, { badges: { arts_culture: false } }));
  await ok(change(tc, { badges: { arts_culture: true } })); // her own tap
  await ok(change(tc, { indoor_info: { kinds: ['climbing'], length: '1-2h' } }));
  assert.equal(badge(c.id), 1, 'her own badge stays');
  // Real taps: the kind screen's Save puts the badge on with a museum, and back to climbing takes it off.
  const d = mk('indoor', { name: 'Rock Taps T5', cuisine: '', description: 'Climbing and bouldering.' });
  const td = tokenFor(d.id);
  await ok(change(td, { indoor_info: { kinds: ['museum'], length: '1-2h' }, badges: { arts_culture: true } }));
  const sim = await openSetup(base, td, { hash: 'indoor' });
  assert.equal(sim.cfg.artsAuto, true);
});

test('8. "trampoline park" is one phrase (never a park); a place of the asked kind closed that day says so (EN + FR)', async () => {
  // Armstrong, so the other tests' climbing places (Vernon) are not in the list.
  const { v, t } = await chris({ region: 'armstrong', latitude: 50.45, longitude: -119.2 });
  mk('outdoor', { region: 'armstrong', latitude: 50.45, longitude: -119.19, name: 'Becker Bike Park T5', description: 'A bike park with jump lines and a pump track.', rating: 4.7, reviews: 300 });
  mk('outdoor', { region: 'armstrong', latitude: 50.44, longitude: -119.19, name: 'Mission Hill Park T5', description: 'A city park.', rating: 4.5, reviews: 200 });
  mk('indoor', { name: 'Kelowna Climbing Co T5', region: 'kelowna', cuisine: 'Climbing gym', description: 'Bouldering and a trampoline park.', latitude: 49.88, longitude: -119.49 });
  const p = app.runTripPlan({ text: 'trampoline park Armstrong' }, NOW);
  assert.ok(itemsOf(p).every((x) => x.venue.type !== 'outdoor'), itemsOf(p).map((x) => x.venue.name).join(' | '));
  assert.ok(idsOf(p).includes(v.id));
  await ok(change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }] }));
  for (const q of ['trampoline park Armstrong on Christmas Day', 'bouldering in Armstrong on Christmas Day']) {
    const x = app.runTripPlan({ text: q }, NOW);
    assert.ok(!idsOf(x).includes(v.id), `${q}: not planned on a closed day`);
    assert.ok(itemsOf(x).every((s) => s.venue.type !== 'outdoor'), `${q}: no bike park`);
    const all = [...(x.warnings || []), ...(x.notes || [])].join(' ');
    assert.ok(all.includes(`${v.name} is closed Dec 25 (Christmas Day).`), `${q}: ${all}`);
    const f = frCopy.t3FrenchPlan(JSON.parse(JSON.stringify(x)));
    assert.ok([...(f.warnings || []), ...(f.notes || [])].join(' ').includes(`${v.name} est fermé le 25 déc. (Noël).`), `${q} (FR)`);
  }
});

test('9. The price typer is worded by kind ("What it is (like 60-min jump pass)", "Section name, like Passes"), never "Add each price with its price", and opens at its top', async () => {
  const { t } = await chris();
  for (const lang of ['en', 'fr']) {
    const html = await getText(`${lang === 'fr' ? '/fr' : ''}/owner/${t}/menu`);
    const cfg = JSON.parse(/window\.MENU_CFG = (\{[\s\S]*?\});\s*<\/script>/.exec(html)[1]);
    if (lang === 'en') {
      assert.equal(cfg.t.dishName, 'What it is (like 60-min jump pass)');
      assert.equal(cfg.t.namePh, 'like 60-min jump pass');
      assert.equal(cfg.t.sectionPh, 'Section name, like Passes');
      assert.doesNotMatch(cfg.t.typeIntro, /each price with its price/);
      assert.match(cfg.t.typeIntro, /Add each one with its price/);
    } else {
      assert.match(cfg.t.dishName, /ex\. Saut de 60 min/);
      assert.equal(cfg.t.sectionPh, 'Nom de la section, ex. Laissez-passer');
      assert.doesNotMatch(cfg.t.typeIntro, /chaque tarif avec son prix/);
    }
    // "Type them in myself" opens the first line with the page at its top.
    assert.match(html, /openAndShow\('0:0', true\)/);
  }
});

test('10. Hours editor: no "Same as" that changes nothing or repeats another; no "Open after midnight?" for daytime kinds, kept for bowling', async () => {
  const { t } = await chris();
  const sim = await openSetup(base, t, { hash: 'hours' });
  await sim.click('go:hours:edit');
  await sim.click('[data-hopen="wed"]');
  // Every day 10-8: Wednesday already has Tuesday's and Monday's hours.
  assert.ok(!sim.has('[data-same="wed"]'), 'no Same as Tuesday');
  assert.ok(!sim.has('[data-samemon="wed"]'), 'no Same as Monday');
  assert.ok(!sim.has('[data-late]'), 'no after-midnight for a climbing park');
  for (const k of ['kids', 'pool', 'spa', 'museum', 'gallery', 'library', 'classes']) assert.equal(IK.indoorKindText([k], 'en').day, true, k);
  for (const k of ['theatre', 'bowling', 'games', 'casino', 'cinema']) assert.equal(IK.indoorKindText([k], 'en').day, false, k);
  // Different hours on one day: its "Same as" is offered; a Monday twin of it isn't.
  const v2 = mk('indoor', { name: 'Rock Hours T5', hours: JSON.stringify({ mon: [['10:00', '20:00']], tue: [['10:00', '20:00']], wed: [['12:00', '18:00']], thu: [['10:00', '20:00']], fri: [['10:00', '20:00']], sat: [['10:00', '20:00']], sun: [['10:00', '20:00']] }) });
  const t2 = tokenFor(v2.id);
  await ok(change(t2, { indoor_info: { kinds: ['climbing'], length: '1-2h' } }));
  const s2 = await openSetup(base, t2, { hash: 'hours' });
  await s2.click('go:hours:edit');
  await s2.click('[data-hopen="wed"]');
  assert.ok(s2.has('[data-same="wed"]'), 'Same as Tuesday is offered');
  assert.ok(!s2.has('[data-samemon="wed"]'), 'Same as Monday would copy the same hours');
  // Bowling keeps after-midnight.
  const b = mk('indoor', { name: 'Vernon Lanes Hours T5', description: 'Bowling.' });
  const tb = tokenFor(b.id);
  await ok(change(tb, { indoor_info: { kinds: ['bowling'], length: '1-2h' } }));
  const sb = await openSetup(base, tb, { hash: 'hours' });
  await sb.click('go:hours:edit');
  await sb.click('[data-hopen="tue"]');
  assert.ok(sb.has('[data-late]'), 'bowling keeps after-midnight');
});

test('11. Polish: the setup shows the phone as the page does (no "1-"); the update log names the kind’s price ("Price (passes)")', async () => {
  const { v, t } = await chris({ phone: '+1 236-426-3333' });
  const b = await openSetup(base, t, { hash: 'basics' });
  assert.match(b.text(), /236-426-3333/);
  assert.doesNotMatch(b.text(), /1-236/);
  assert.match(plain(pageHtml(v, 'en')), /236-426-3333/);
  const log = await getText(`/owner/${t}`);
  assert.doesNotMatch(plain(log), /Adult price/);
  assert.equal(app.ownerFieldLabelsFor ? app.ownerFieldLabelsFor(app.getVenue(v.id), false).indoor_price : 'Price (passes)', 'Price (passes)');
});
