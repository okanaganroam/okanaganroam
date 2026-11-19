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
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
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
