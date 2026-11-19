// Whistler tour test 16 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour16-2026-11-18/REPORT.md: Tom,
// Coast Mountain Bear Tours: bear viewing by 4x4 May to October, a kids' price, a private vehicle, hotel pickup; a Galaxy A
// phone). The pickup button had been dead since test 11 (its only check read the source), Help missed his questions, "bear"
// search ranked him 10th, Build My Trip ignored "without a car", and a few setup screens said too much.
// The setup checks here run the real setup page script (tests/setup-sim.js): they press the buttons the screen drew.
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) {} }
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t16-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T16 ${++n}`, slug: `tour-t16-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0144', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 16 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let ipN = 0, srv, base;
const start = async () => { if (srv) return; srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; };
const stop = () => srv && srv.close();
if (!process.env.T16_LIB) { test.before(start); test.after(stop); }
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.76.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const plan = (q, lang, now = NOW) => app.runTripPlan({ text: q, ...(lang ? { lang } : {}) }, now);

// Tom's typed tours (his final-state.json).
const TOURS = [{ name: 'Tours', items: [
  { name: 'Bear viewing tour, morning or evening', description: 'By 4x4. Leaves 7 AM and 5:30 PM daily. Pickup from village hotels. Sells out, book early.', price: '$149 adult, $99 kids 5 to 12', duration: '3 hours' },
  { name: 'Private vehicle, up to 6 people', description: '', price: '$895', duration: '3 hours' }] }];
const STORY = 'Family run since 2004. We take small groups out by 4x4 to see black bears in the Whistler valley, May to October. Morning and evening tours, with hotel pickup. Kids 5 and up welcome.';
async function tom(o = {}, info = {}, { tours = true, months = '5-10' } = {}) {
  const v = mk('tour', { name: `Coast Mountain Bear Tours ${n + 1}`, cuisine: 'Wildlife and bear viewing', rating: 4.8, reviews: 211, address: '4314 Main St, Whistler', latitude: 50.1172, longitude: -122.9543,
    description: STORY, description_fr: 'Visites guidées d’observation de l’ours noir dans la vallée de Whistler.', hours: JSON.stringify(WK('07:00', '20:30')), kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['wildlife'], length: '2-3h', book: 'week', age: '5', private: 895, year: 'seasonal', ...info } }));
  if (months) ok(await change(t, { open_months: months }));
  ok(await change(t, { tour_price: 149 }));
  if (tours) db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}

module.exports = { start, stop, app, db, tom, mk, plan, namesOf, itemsOf, page, plain, change, ok, approveAll, tokenFor, WK, TOURS, NOW };
if (process.env.T16_LIB) return;

test('1. BLOCKER: "We pick you up" on Basics really saves (the button the screen drew, pressed), the page shows Pickup, and "No pickup" takes it off', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'basics' });
  assert.ok(sim.acts().includes('pickupOn:basics'), sim.acts().join(' | '));
  await sim.click('pickupOn:basics');
  assert.equal(app.venueTourInfo(v.id).pickup, true, 'tour_info.pickup saved');
  approveAll(v.id);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Pickup:? hotels in Whistler/, 'the page shows the Pickup row');
  assert.match(fr, /Prise en charge/);
  // Back on Basics, the button now offers to take it off, and that works too.
  const sim2 = await openSetup(base, t, { hash: 'basics' });
  assert.ok(sim2.acts().includes('pickupOff:basics'), sim2.acts().join(' | '));
  assert.match(sim2.text(), /pick/i);
  await sim2.click('pickupOff:basics');
  assert.notEqual(app.venueTourInfo(v.id).pickup, true, 'pickup taken off');
  approveAll(v.id);
  assert.doesNotMatch(plain(page(v)), /Pickup:? hotels in Whistler/);
});

test('2. Help examples follow his kind: a bear tour never sees a dock, a sled ride or salmon season (EN + FR); unknown kinds keep the old examples', async () => {
  const { t } = await tom();
  const cfgOf = async (p) => JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await fetch(base + p).then((r) => r.text()))[1]);
  for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`]) {
    const hits = (await cfgOf(p)).topics.flatMap((x) => [x.q, x.qFr, x.a, x.aFr].map((y) => [x.id, String(y || '')])).filter(([id, y]) => !['tour-own-dogs', 'tour-kinds-sleigh', 'tour-kinds-kennel'].includes(id) && /\bthe dock\b|\bau quai\b|Sled ride|Balade en traîneau|Salmon season|Saison du saumon|sled dogs|chiens de traîneau/.test(y)).map(([id, y]) => `${id}: ${/.{0,40}(?:\bthe dock\b|\bau quai\b|Sled ride|Balade en traîneau|Salmon season|Saison du saumon|sled dogs|chiens de traîneau).{0,40}/.exec(y)[0]}`);
    assert.deepEqual(hits, [], p);
  }
  // (The answers about sled dogs and sleigh rides themselves only come up when asked about them.)
  const en = (await cfgOf(`/owner/${t}/setup`)).topics, fr = (await cfgOf(`/fr/owner/${t}/setup`)).topics;
  assert.match(en.find((x) => x.id === 'tour-kids-price').a, /Bear viewing tour: \$149 adult, \$99 kids 5 to 12\./);
  assert.match(en.find((x) => x.id === 'tour-busy-season').a, /Bear season May to October: book early/);
  assert.match(fr.find((x) => x.id === 'tour-busy-season').aFr, /Saison des ours de mai à octobre/);
  assert.match(en.find((x) => x.id === 'tour-meeting').a, /we meet at our office/);
  // A fishing charter keeps salmon season and the dock; a listing with no kinds yet keeps every example.
  const f = await tom({ cuisine: 'Fishing charters' }, { kinds: ['fishing'] });
  const fen = (await cfgOf(`/owner/${f.t}/setup`)).topics;
  assert.match(fen.find((x) => x.id === 'tour-busy-season').a, /Salmon season/);
  assert.match(fen.find((x) => x.id === 'tour-meeting').a, /dock/);
  const none = mk('tour', { name: 'No Kinds T16' });
  const nen = (await cfgOf(`/owner/${tokenFor(none.id)}/setup`)).topics;
  assert.match(nen.find((x) => x.id === 'tour-kids-price').a, /Sled ride/);
});

test('3. Booking: "Yes" saves on its own (no how-far-ahead chip, no Save bounce), the page says "Book ahead"; a chip still saves its own rule', async () => {
  const { v, t } = await tom({}, { book: undefined });
  assert.equal(app.venueTourInfo(v.id).book, undefined);
  const sim = await openSetup(base, t, { hash: 'booking' });
  await sim.click('[data-tpick="bookYes:yes"]');
  assert.match(sim.text(), /How far ahead\? \(optional\)/);
  await sim.click('bookingSave');
  assert.equal(app.venueTourInfo(v.id).book, 'ahead', 'saved without a chip');
  assert.doesNotMatch(sim.text(), /Please tap how far ahead/);
  approveAll(v.id);
  assert.match(plain(page(v)), /Booking:? Book ahead\./);
  assert.match(plain(page(v, 'fr')), /Réservez à l’avance\./);
  // Build My Trip says it too.
  const p = plan('bear viewing in July');
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  if (stop) assert.ok(stop.caveats.includes('Book ahead (the operator’s own answer).'), JSON.stringify(stop.caveats));
  // A chip is still his rule.
  const sim2 = await openSetup(base, t, { hash: 'booking' });
  await sim2.click('[data-tpick="book:48h"]');
  await sim2.click('bookingSave');
  assert.equal(app.venueTourInfo(v.id).book, '48h');
});

test('4. Good to know: a chip is added after the research line ("Bring binoculars." stays, in the box and on the page), with no double spaces', async () => {
  const { v, t } = await tom();
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(v.id, JSON.stringify({ rows: [{ label: 'Good to know', text: 'Bring binoculars.' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' }));
  const sim = await openSetup(base, t, { hash: 'bring' });
  assert.equal(sim.doc.getElementById('suBring').value, 'Bring binoculars.');
  assert.match(sim.text(), /Answers you tap below are added after it/);
  await sim.click('[data-quick="Dress for the weather"]');
  await sim.click('[data-quick="Hotel pickup available"]');
  const box = sim.doc.getElementById('suBring');
  assert.equal(box.value, 'Bring binoculars. Dress for the weather. Hotel pickup available. ');
  // A space typed after the chip's ". " is not saved as two.
  await sim.type('suBring', box.value + ' Tours sell out in summer,  book early.');
  await sim.click('bringSave');
  approveAll(v.id);
  const en = plain(page(v));
  assert.match(en, /Bring binoculars\. Dress for the weather\. Hotel pickup available\. Tours sell out in summer, book early\./);
  assert.doesNotMatch(app.venueVisitInfo(v.id).rows.find((r) => r.label === 'Good to know').text, / {2}/);
});

test('5. French page: the chip-built Groups line is in French, and his price line converts all the way (« 149 $ adulte, 99 $ enfants de 5 à 12 ans »)', async () => {
  const { v, t } = await tom();
  ok(await change(t, { visit_rows: { groups: 'Groups of 6 or more: please book ahead. Private tours available.' } }));
  approveAll(v.id);
  const fr = plain(page(v, 'fr')), en = plain(page(v));
  assert.match(fr, /Groupes de 6 (?:personnes )?ou plus/);
  assert.doesNotMatch(fr, /Groups of 6 or more/);
  assert.match(en, /Groups of 6 or more: please book ahead\. Private tours available\./);
  assert.match(fr, /149 \$ adulte, 99 \$ enfants de 5 à 12 ans/);
  assert.doesNotMatch(fr, /\$99|kids 5 to 12/);
  assert.match(en, /\$149 adult, \$99 kids 5 to 12/);
  // Words we don't know stay as typed (no half-French line).
  assert.equal(app.menuPriceWithWords('349 per sled (2 adults, or 1 adult + 2 kids)', 'fr').replace(/ /g, ' '), '349 $ par traîneau (2 adults, or 1 adult + 2 kids)');
  assert.equal(app.menuPriceWithWords('$75 adults, $45 children', 'fr').replace(/ /g, ' '), '75 $ adultes, 45 $ enfants');
});

test('6. Story: research says "Open year-round." after he set May to October: the story screen nudges him, and the page leaves that sentence off until he sends his own', async () => {
  const RES = 'Guided black bear viewing tours in the Whistler valley. Open year-round.';
  const RES_FR = 'Visites guidées d’observation de l’ours noir dans la vallée de Whistler. Ouvert toute l’année.';
  const { v, t } = await tom({ description: RES, description_fr: RES_FR });
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Guided black bear viewing tours in the Whistler valley\./); assert.doesNotMatch(en, /year-round/i);
  assert.match(fr, /Visites guidées d’observation/); assert.doesNotMatch(fr, /toute l’année/);
  assert.equal(app.getVenue(v.id).description, RES, 'the stored story is unchanged');
  const sim = await openSetup(base, t, { hash: 'story' });
  assert.match(sim.text(), /You run part of the year, but this says year-round\. Change or take out that sentence\./);
  const simFr = await openSetup(base, t, { hash: 'story', lang: 'fr' });
  assert.match(simFr.text().replace(/[  ]/g, ' '), /mais ce texte dit toute l’année/);
  // Running all year: the sentence is right, so it stays and there is no nudge.
  const all = await tom({ description: RES }, { year: 'all' }, { months: null });
  assert.match(plain(page(all.v)), /Open year-round\./);
  assert.doesNotMatch((await openSetup(base, all.t, { hash: 'story' })).text(), /this says year-round/);
  // His own story is his: it shows as he wrote it.
  ok(await change(t, { description: 'Bear viewing by 4x4, May to October. Office open year-round for bookings.' }));
  approveAll(v.id);
  assert.match(plain(page(v)), /Office open year-round for bookings\./);
});

test('7. Search (/browse): "bear", "bear viewing", « ours » and « observation des ours » put the bear tour companies first (off-season too), above lakes and recreation sites that only mention bears; « ours » never matches « jours » or « tours »', async () => {
  const lake = mk('beach', { name: 'Alta Shore Lake T16', cuisine: 'Lake', rating: 4.9, reviews: 3000, description: 'A swimming lake. Black bears are often seen along the shore in spring.' });
  const rec = mk('outdoor', { name: 'Riverside Rec Site T16', cuisine: 'Recreation site', rating: 4.9, reviews: 2500, description: 'Camping and picnics in bear country. Store food in the bear lockers.' });
  const other = mk('tour', { name: 'Whistler Discovery Bear Tours T16', cuisine: 'Bear viewing tours', rating: 4.5, reviews: 90, description: 'Bear viewing in the Whistler valley.' });
  const jours = mk('tour', { name: 'Village Walks T16', cuisine: 'Walking tours', rating: 4.9, reviews: 1500, description: 'Open every day. Tours daily.' });
  const { v } = await tom();
  const order = async (q, fr) => { const h = await fetch(`${base}${fr ? '/fr' : ''}/browse?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then((r) => r.text());
    return [...h.matchAll(/data-venue-name="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')); };
  for (const [q, fr] of [['bear'], ['bear viewing'], ['bears'], ['ours', true], ['observation des ours', true], ['observation des ours'], ['faune', true]]) {
    const o = await order(q, fr), i = o.indexOf(v.name); if (process.env.T16_DEBUG) console.log(q, JSON.stringify(o.slice(0, 20)));
    assert.ok(i >= 0, `${q}: ${v.name} found`);
    for (const below of [lake.name, rec.name, jours.name]) { const j = o.indexOf(below); assert.ok(j < 0 || j > i, `${q}: ${below} (${j}) is below ${v.name} (${i})`); }
    const L = o.indexOf(lake.name);
    if (q !== 'faune') assert.ok(o.indexOf(other.name) >= 0 && (L < 0 || o.indexOf(other.name) < L), `${q}: the other bear company above the lake`);
  }
  // Whole-word French matching.
  assert.equal(app.browseTextMatch('open every day. tours daily. jours', 'ours'), false);
  assert.equal(app.browseTextMatch('guided bear tours', 'ours'), true);
  assert.equal(app.browseTextMatch('mountain biking trails', 'hike'), true);
  assert.equal(app.browseTextMatch('hiking', 'hike'), true);
  // The order rule itself (the page script runs the same function): name, then kind, then the rest.
  assert.ok(app.browseStrong('Coast Mountain Bear Tours', 'Wildlife and bear viewing', 'bear') > app.browseStrong('Riverside Rec Site', 'Recreation site', 'bear'));
  assert.equal(app.browseStrong('Coast Mountain Bear Tours', 'Wildlife and bear viewing', 'bear viewing'), 1);
});

test('8. Build My Trip: "without a car", "no car", "hotel pickup" and "pick us up" put the tours with hotel pickup first ("Hotel pickup" in Why it fits); undated out of season plans the coming season with a note', async () => {
  const plain0 = await tom({ name: 'Plain Bear Co T16' }, {});
  const pk = await tom({ name: 'Pickup Bear Co T16', rating: 4.2, reviews: 20 }, { pickup: true });
  const first = (p) => itemsOf(p).find((x) => x.venue && x.venue.type === 'tour');
  for (const q of ['bear tour without a car in July', 'bear tour no car in July', 'bear viewing with hotel pickup in July', 'bear tour, can you pick us up? July', 'bear tour in July, we don’t have a car']) {
    const p = plan(q), f = first(p);
    assert.ok(f, q);
    assert.equal(f.venue.id, pk.v.id, `${q}: ${JSON.stringify(namesOf(p))}`);
    assert.ok(f.why.includes('Hotel pickup'), `${q}: ${JSON.stringify(f.why)}`);
    assert.doesNotMatch(JSON.stringify(p.notes || []), /doesn’t list “pick/, q);
  }
  // Without the words, the plain order (no "Hotel pickup" line).
  const plainP = plan('bear viewing tour in July');
  assert.ok(!itemsOf(plainP).some((x) => (x.why || []).includes('Hotel pickup')));
  // Undated in November: the coming season (May), with the note; dated out of season stays out. (The other tours this file
  // made run May to October too, so only the coming season has one.)
  for (const o of db.prepare("SELECT id FROM venues WHERE type = 'tour'").all()) { ok(await change(tokenFor(o.id), { tour_info: { year: 'seasonal' }, open_months: '5-10' })); approveAll(o.id); }
  for (const q of ['bear tour without a car', 'bear viewing tour', 'bear tour, can you pick us up']) {
    const p = plan(q);
    assert.ok(itemsOf(p).some((x) => x.venue.type === 'tour'), `${q}: ${JSON.stringify(namesOf(p))}`);
    assert.match((p.notes || [])[0] + JSON.stringify(namesOf(p)), /^This tour isn’t running in November, so this plan is for May 1, when the season starts\./, q);
    assert.equal(p.comingSeason.date, '2026-05-01'.replace('2026', '2027'));
  }
  assert.ok(!itemsOf(plan('bear viewing in January')).some((x) => x.venue.type === 'tour'));
  const fr = require('../trip-french-copy.js');
  assert.match(fr.t3FrenchText('This tour isn’t running in November, so this plan is for May 1, when the season starts. Pick your own dates any time.'), /^Cette sortie n’a pas lieu en novembre; ce plan est donc pour le 1er mai/);
  assert.equal(fr.t3FrenchText('Hotel pickup'), 'Prise en charge à l’hôtel');
  assert.equal(fr.t3FrenchText('Book ahead (the operator’s own answer).'), 'Réservez à l’avance (réponse de l’entreprise).');
  void plain0;
});

test('9. Build My Trip times: his own departures ("Leaves 7 AM and 5:30 PM") place the tour at the nearest one; a tour with none says "Book a departure time", never a made-up 1–3:30 PM', async () => {
  const { v } = await tom({ name: 'Departure Bears T16' }, { pickup: true });
  const row = (p, id) => (p.schedule || []).find((r) => r.venueId === id);
  const cases = [['morning bear tour in July, no car', 420], ['evening bear tour in July, no car', 1050], ['bear tour in July without a car', null]];
  for (const [q, want] of cases) {
    const r = row(plan(q), v.id);
    assert.ok(r, `${q}: planned`);
    assert.ok([420, 1050].includes(r.startMinutes), `${q}: ${r.startMinutes}`);
    if (want != null) assert.equal(r.startMinutes, want, q);
    assert.equal(r.departure, true); assert.ok(!r.bookDeparture);
  }
  // The parser: only times in a sentence about leaving; no lengths, prices or ages.
  const hm = (t) => app.tourDepartureTimesIn(t);
  assert.deepEqual(hm('By 4x4. Leaves 7 AM and 5:30 PM daily. Pickup from village hotels.'), [420, 1050]);
  assert.deepEqual(hm('5:30 PM departure'), [1050]);
  assert.deepEqual(hm('Departures 7:00 and 17:30'), [420, 1050]);
  assert.deepEqual(hm('Départ à 9 h et 13 h 30'), [540, 810]);
  assert.deepEqual(hm('Kids 5 to 12, 3 hours, $149. Open 9 AM to 5 PM.'), []);
  // No departures listed: "Book a departure time" (the page script shows the flag in place of times).
  const none = await tom({ name: 'No Times Bears T16', description: 'Bear viewing by 4x4.' }, { pickup: true }, { tours: false });
  const only = (id, q) => app.runTripPlan({ text: q, excludeVenueIds: db.prepare("SELECT id FROM venues WHERE type = 'tour' AND id != ?").all(id).map((x) => x.id) }, NOW);
  const r2 = row(only(none.v.id, 'bear tour in July without a car'), none.v.id);
  const r3 = row(only(v.id, 'bear tour in July without a car'), v.id);
  assert.ok(r3 && r3.departure && [420, 1050].includes(r3.startMinutes), JSON.stringify(r3));
  assert.ok(r2, "the tour with no times is planned"); assert.equal(r2.bookDeparture, true); assert.ok(!r2.departure);
  const page3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page3.includes("'Book a departure time'") && page3.includes("'Réservez une heure de départ'"));
});

// ---- Source-only checks from earlier rounds, now run on the real page script (tests/setup-sim.js) ----
// Each replaces an assert.match(CLIENT, …) that only read the source (the kind of check that let the pickup bug live
// through five rounds). The old lines say where their behaviour test is now.

test('10. (was test 11, source-only) Basics: an address that says "we pick up from your hotel" gets the pickup nudge once, then saves as typed; two addresses get the two-spots nudge (was test 15, source-only)', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'basics' });
  await sim.click('go:basics:edit');
  await sim.type('suAddr', 'We pick up from your hotel in the village');
  await sim.click('basicsSave');
  assert.match(sim.text(), /pick you up/i, 'the pickup nudge');
  assert.equal(app.getVenue(v.id).address, '4314 Main St, Whistler', 'nothing saved yet');
  const sim2 = await openSetup(base, t, { hash: 'basics' });
  await sim2.click('go:basics:edit');
  await sim2.type('suAddr', 'Summer: 4314 Main St. Winter: 4010 Whistler Way');
  await sim2.click('basicsSave');
  assert.match(sim2.text(), /Put your main spot or office here\. Guests get the exact meeting spot when they book\./);
});

test('11. (was tests 9, 10, 12 and 13, source-only) Who can come and What you offer: the age, under-18 and length chips the screen draws save what they say', async () => {
  const { v, t } = await tom({}, { age: undefined, length: undefined });
  const offer = await openSetup(base, t, { hash: 'offer' });
  const ages = offer.doc.getElementById('suScreen').querySelectorAll('[data-tpick^="age:"]').map((b) => b.getAttribute('data-tpick').slice(4));
  assert.deepEqual(ages, ['all', '5', '6', '8', '10', '12', '14', '16', '19']);
  await offer.click('[data-tpick="age:8"]');
  await offer.click('[data-tadult]');
  await offer.click('[data-tpick="adultAge:19"]');
  await offer.click('[data-tpick="adultHow:waiver"]');
  await offer.click('offerSave');
  const ti = app.venueTourInfo(v.id);
  assert.equal(ti.age, '8'); assert.equal(ti.adult, true); assert.equal(ti.adult_age, '19'); assert.equal(ti.adult_waiver, true);
  const tour = await openSetup(base, t, { hash: 'tour' });
  const lens = tour.doc.getElementById('suScreen').querySelectorAll('[data-tpick^="length:"]').map((b) => b.getAttribute('data-tpick').slice(7));
  assert.deepEqual(lens, ['1h', '1-2h', '2-3h', 'half', 'full', 'multi']);
  await tour.click('[data-tpick="length:half"]');
  await tour.click('tourSave');
  assert.equal(app.venueTourInfo(v.id).length, 'half');
});

test('12. (was test 9, source-only) What you offer: a fourth kind says "Up to 3" and is not added; (was test 15) two kinds in two seasons save each one\'s season', async () => {
  const { v, t } = await tom({}, { kinds: ['wildlife', 'snowshoe', 'paddle'], year: 'seasonal' }, { months: '12-10' });
  const sim = await openSetup(base, t, { hash: 'tour' });
  const free = sim.doc.getElementById('suScreen').querySelectorAll('[data-tkind]').map((b) => b.getAttribute('data-tkind')).find((k) => !['wildlife', 'snowshoe', 'paddle'].includes(k));
  await sim.click(`[data-tkind="${free}"]`);
  assert.match(sim.text(), /Up to 3/);
  assert.ok(sim.doc.getElementById('suScreen').querySelector(`[data-tkind="${free}"]`).getAttribute('aria-pressed') !== 'true');
  if (sim.has('[data-tks]')) {
    const ks = sim.doc.getElementById('suScreen').querySelectorAll('[data-tks]').map((b) => b.getAttribute('data-tks'));
    const pick = ks.find((x) => x.startsWith('snowshoe:') && x.endsWith(':both')) || ks.find((x) => x.endsWith(':both'));
    await sim.click(`[data-tks="${pick}"]`);
    await sim.click('tourSave');
    assert.equal(app.venueTourInfo(v.id).kind_seasons[pick.split(':')[0]], 'both');
  }
});

test('13. (was test 11, source-only) Price: a private price per hour with a 3-hour minimum saves its unit and minimum; (was tests 12 and 13) "$349 per sled" in the per-person box is not saved and gets the per-unit nudge', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'price' });
  await sim.type('suTpriv', '150');
  await sim.click('[data-tpick="privPer:hour"]');
  await sim.click('[data-tpick="privMin:3"]');
  await sim.click('priceSave');
  const ti = app.venueTourInfo(v.id);
  assert.equal(ti.private, 150); assert.equal(ti.private_per, 'hour'); assert.equal(ti.private_min, 3);
  const sim2 = await openSetup(base, t, { hash: 'price' });
  await sim2.type('suTprice', '$349 per sled');
  await sim2.click('priceSave');
  assert.equal(app.venueTourInfo(v.id).price, 149, 'not saved');
  assert.match(sim2.text(), /Your tours and prices/);
  // The price screen is one short line under the box now (tour test 16).
  assert.match(sim.text() + sim2.text(), /The adult price\./);
  assert.doesNotMatch(sim2.text(), /Free or by donation\? Type free\./);
});

test('14. (was test 13, source-only) Good to know: a line over the limit is cut at the last whole sentence on Save, says what was left out, and Save again keeps it', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'bring' });
  const long = 'Dress in layers. ' + 'Bring a warm hat and gloves for the evening tours. '.repeat(8);
  await sim.type('suBring', long);
  await sim.click('bringSave');
  const kept = sim.doc.getElementById('suBring').value;
  assert.ok(kept.length < long.length && /\.$/.test(kept.trim()), kept);
  assert.notEqual((app.venueVisitInfo(v.id) || { rows: [] }).rows.find((r) => r.label === 'Good to know')?.text, long.trim());
  await sim.click('bringSave');
  approveAll(v.id);
  assert.equal(app.venueVisitInfo(v.id).rows.find((r) => r.label === 'Good to know').text, kept.trim());
});

test('15. (was tests 11, 12 and 13, source-only) a Good to know chip tapped with a finger puts the cursor in the box, at the end', async () => {
  const { t } = await tom();
  const sim = await openSetup(base, t, { hash: 'bring' });
  const chip = sim.doc.getElementById('suScreen').querySelector('[data-quick="Dress for the weather"]');
  chip.onclick({ pointerType: 'touch', preventDefault() {} }); await sim.settle();
  const box = sim.doc.getElementById('suBring');
  assert.equal(sim.doc.activeElement, box);
  assert.equal(box.selectionStart, box.value.length);
});

test('16. (was tour simplify, source-only) the season ticks: "Anything else about your season?" opens them, and a tick turns on in place (the tourTick handler, run)', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  if (!sim.has('#suTfold')) await sim.click('yearClosed');
  assert.ok(sim.has('#suTfold'), sim.acts().join(' | '));
  if (!sim.has('[data-act^="tourTick:"]')) await sim.click('#suTfold');
  const tick = sim.doc.getElementById('suScreen').querySelector('[data-act^="tourTick:"]');
  assert.ok(tick, sim.acts().join(' | '));
  const key = tick.getAttribute('data-act').split(':')[1];
  await sim.click(`[data-act="tourTick:${key}"]`);
  assert.equal(sim.doc.getElementById('suTick_' + key).getAttribute('aria-pressed'), 'true');
  void v;
});

test('17. (was tour tests 4 and 15, source-only) Price screen: "free" typed in the box saves a free tour; a rentals company sees the rentals line under the box', async () => {
  const { v, t } = await tom();
  const sim = await openSetup(base, t, { hash: 'price' });
  await sim.type('suTprice', 'free');
  await sim.click('priceSave');
  approveAll(v.id);
  assert.match(plain(page(v)), /Prices:? Free\./);
  const r = await tom({ name: 'Paddle Rentals T16', cuisine: 'Canoe & kayak rentals' }, { kinds: ['paddle', 'rentals'] });
  const sr = await openSetup(base, r.t, { hash: 'price' });
  assert.match(sr.text(), /Kids’ prices, other trips and per-boat rentals go in “Your tours and prices”/);
  assert.doesNotMatch(sim.text(), /per-boat rentals/);
});

test('18. Departure times: the hours screen and Help both say "in Your tours and prices" (EN + FR)', async () => {
  const text = require('../owner-setup-text.js');
  assert.match(text.en.tour.departHint, /list the departure times in Your tours and prices\.$/);
  assert.match(text.fr.tour.departHint, /nommez les heures de départ dans Vos sorties et tarifs\.$/);
  const { t } = await tom();
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await fetch(`${base}/owner/${t}/setup`).then((r) => r.text()))[1]);
  for (const id of ['tour-times', 'hours']) assert.match(cfg.topics.find((x) => x.id === id).a, /Your tours and prices/, id);
  for (const x of cfg.topics) assert.doesNotMatch(x.a || '', /departure times in your story/i, x.id);
});
