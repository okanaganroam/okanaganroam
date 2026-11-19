// Whistler tour test 18 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour18-2026-11-18/REPORT.md: Priya,
// Treetop Zip Whistler: year-round 5-line and 10-line ziplines, a treetop walk for all ages, winter night zips on weekends,
// child prices, ages 6+ for zips, tours every 30 minutes, booked online, closed Christmas Day; a MacBook).
// The last round of leftovers: Help wording on the screen she is on, the closures tile after the month picker, the trip
// card's booking line, the French price line, the "Hotel pickup" line on the card, an undated request during a yearly
// closure, a young child's plain request, and the adventure kind's label. The setup checks run the real setup page script
// (tests/setup-sim.js). Her Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
// Ported to Okanagan Roam (2026-11-18, Whistler #199): on Okanagan fixtures (Kelowna, Vernon, Coldstream, Penticton, Big White).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) {} }
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t18-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const v3 = require('../trip-planner-v3-page.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T18 ${++n}`, slug: `tour-t18-${n}`, region: 'kelowna', type, latitude: 49.888 + n / 3000, longitude: -119.496,
  rating: 4.4, reviews: 90, address: `${600 + n} Main St, Kelowna`, phone: '250-555-0178', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 18 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.78.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const plan = (q, o = {}, now = NOW) => app.runTripPlan({ text: q, ...o }, now);
const onlyMe = (v) => ({ excludeVenueIds: db.prepare("SELECT id FROM venues WHERE type = 'tour' AND id != ?").all(v.id).map((x) => x.id) });

// Priya's typed tours (her final-state.json).
const TOURS = [{ name: 'Tours', items: [
  { name: '5-Line Zipline Tour', description: 'Five ziplines through old-growth forest. Leaves every 30 minutes from our village base office. Ages 6+, weight 25–125 kg.', price: '$129 adult, 99 child (6–12)', duration: '2.5 hours' },
  { name: 'Superfly 10-Line Tour', description: 'Ten lines including our longest and highest. Leaves every 30 minutes. Ages 6+, weight 25–125 kg.', price: '$179 adult, 139 child (6–12)', duration: '3 hours' },
  { name: 'Treetop Walk', description: 'Suspension bridges and platforms in the canopy, no zipping. All ages.', price: '$39 adult, 25 child (6–12), under 6 free', duration: '1.5 hours' },
  { name: 'Night Zip (winter weekends)', description: 'Friday and Saturday evenings, December to March, 5–9 PM. Ages 6+.', price: '$149 adult, 119 child (6–12)', duration: '2 hours' }] }];
const STORY = 'Fly through the old-growth forest on our 5-line tour or the 10-line Superfly, or stroll the canopy on our Treetop Walk (all ages). Tours leave from our base office in downtown Kelowna, all year.';
async function priya(o = {}, info = {}, { tours = TOURS, booking = true, closures = null } = {}) {
  const v = mk('tour', { name: `Treetop Zip Kelowna ${n + 1}`, cuisine: 'Ziplines', rating: 4.8, reviews: 211, address: '4165 Springs Lane, Kelowna', latitude: 49.8866, longitude: -119.4944,
    description: STORY, hours: JSON.stringify(WK('08:30', '19:00')), kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['zipline', 'adventure'], length: '2-3h', book: 'same_day', age: 'all', year: 'all', ...info } }));
  ok(await change(t, { tour_price: 39 }));
  if (closures) ok(await change(t, { closures }));
  if (booking) db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(v.id, 'https://treetopzip.example.com/book');
  if (tours) db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: tours }));
  approveAll(v.id);
  return { v, t };
}
const cfgTopics = async (t, lang = 'en') => JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/owner/${t}/setup`).then((r) => r.text()))[1]).topics;
const helpPlain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

test('1. Help answers: kinds by season tells a year-round company to stay "all year" (never for a seasonal one); "each price"; the under-18s button is only for 5+ to 16+; tours that leave every 30 minutes', async () => {
  const { t } = await priya();
  const en = await cfgTopics(t), fr = await cfgTopics(t, 'fr');
  const ks = helpPlain(en.find((x) => x.id === 'tour-kind-seasons').a), ksFr = helpPlain(fr.find((x) => x.id === 'tour-kind-seasons').aFr);
  assert.match(ks, /Open all year, and one kind only in winter \(or summer\)\? Stay “all year”/);
  assert.match(ks, /on that trip in Your tours and prices/);
  assert.match(ksFr, /Restez à « toute l’année »/);
  // A seasonal company's answer has no "stay all year".
  const s = await priya({}, { year: 'seasonal' });
  ok(await change(s.t, { open_months: '12-4' })); approveAll(s.v.id);
  assert.doesNotMatch(helpPlain((await cfgTopics(s.t)).find((x) => x.id === 'tour-kind-seasons').a), /Stay “all year”/);
  assert.doesNotMatch(helpPlain((await cfgTopics(s.t, 'fr')).find((x) => x.id === 'tour-kind-seasons').aFr), /toute l’année »/);
  const two = helpPlain(en.find((x) => x.id === 'tour-two-prices').a);
  assert.match(two, /Put each price, and every trip/); assert.doesNotMatch(two, /both prices/);
  assert.match(helpPlain(fr.find((x) => x.id === 'tour-two-prices').aFr), /Mettez chaque prix/);
  const age = helpPlain(en.find((x) => x.id === 'tour-age').a);
  assert.match(age, /Picked an age from 5\+ to 16\+\? Tap Under 18s come with an adult under it if they do \(it isn’t there for All ages or 19\+\)/);
  assert.match(helpPlain(fr.find((x) => x.id === 'tour-age').aFr), /le bouton n’y est pas pour Tous les âges ni 19\+/);
  assert.match(helpPlain(en.find((x) => x.id === 'tour-times').a), /Tours leave every 30 minutes \(or every hour\)\? .*Leaves every 30 minutes, 9 AM to 5 PM/);
});

test('2. Help on the Hours screen says "right here" instead of "Set up your page → Change an answer → Hours"; on another screen the path stays', async () => {
  const { t } = await priya();
  const a = (await cfgTopics(t)).find((x) => x.id === 'seasonal-hours').a, aFr = (await cfgTopics(t, 'fr')).find((x) => x.id === 'seasonal-hours').aFr;
  assert.match(helpPlain(a), /Set up your page → Change an answer → Hours/);
  const sim = await openSetup(base, t, { hash: 'hours' });
  assert.equal(typeof sim.window.ohbHere, 'function');
  const here = helpPlain(sim.window.ohbHere(a, 'en'));
  assert.doesNotMatch(here, /Change an answer/);
  assert.match(here, /^ ?Right here, on this screen: Set your usual hours/);
  const simFr = await openSetup(base, t, { hash: 'hours', lang: 'fr' });
  const hereFr = helpPlain(simFr.window.ohbHere(aFr, 'fr'));
  assert.doesNotMatch(hereFr, /Modifier une réponse/); assert.match(hereFr, /Ici même, sur cet écran/);
  const other = await openSetup(base, t, { hash: 'price' });
  assert.match(helpPlain(other.window.ohbHere(a, 'en')), /Set up your page → Change an answer → Hours/);
});

test('3. The Closures tile is done once the month picker saved a yearly closure', async () => {
  const { v, t } = await priya({}, { year: 'all' }, { tours: null, booking: false });
  const sim = await openSetup(base, t, { hash: 'hours:year' });
  if (!sim.has('[data-act="openMonths"]')) {
    const go = sim.acts().find((x) => x === 'yearClosed');
    assert.ok(go, sim.acts().join(' | '));
    await sim.click(go);
  }
  await sim.click('openMonths');
  for (const m of [4, 5, 10, 11]) await sim.click(`[data-chip="closedm:${m}"]`);
  await sim.click('monthsUse');
  assert.match(sim.text(), /Saved: closed/);
  const cl = JSON.parse(db.prepare('SELECT closures FROM venue_hours_extra WHERE venue_id = ?').get(v.id).closures);
  assert.ok(cl.some((c) => c.yearly), JSON.stringify(cl));
  const prog = await fetch(`${base}/owner/${t}/setup/progress`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
  assert.ok(['live', 'day'].includes(prog.progress.done.closures), JSON.stringify(prog.progress.done));
  // The Part 2 list shows the tile as done (pressed, with its status), not "not done yet".
  const more = await openSetup(base, t, { hash: 'more' });
  const tile = more.doc.getElementById('suScreen').querySelector('[data-act="open:closures"]');
  assert.ok(tile, more.acts().join(' | '));
  assert.equal(tile.getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(tile.textContent, /not done yet/);
});

test('4. Trip card: same-day booking with her booking link says "Book a time online", her typed tours\' "every 30 minutes" says "Tours leave every 30 minutes" (EN + FR); "Call ahead" only when neither is known', async () => {
  const cav = (v) => { const it = itemsOf(plan('ziplining in Kelowna in August', onlyMe(v))).find((x) => x.venue.id === v.id); assert.ok(it, 'planned'); return it.caveats.find((c) => /^Same-day bookings/.test(c)); };
  const both = await priya();
  assert.equal(cav(both.v), 'Same-day bookings are often fine (the operator’s own answer). Tours leave every 30 minutes. Book a time online.');
  assert.equal(frCopy.t3FrenchText(cav(both.v)), 'Réserver le jour même convient souvent (réponse de l’entreprise). Départs toutes les 30 minutes. Réservez une heure en ligne.');
  const link = await priya({}, {}, { tours: null });
  assert.equal(cav(link.v), 'Same-day bookings are often fine (the operator’s own answer). Book a time online.');
  assert.equal(frCopy.t3FrenchText(cav(link.v)), 'Réserver le jour même convient souvent (réponse de l’entreprise). Réservez une heure en ligne.');
  const every = await priya({}, {}, { booking: false });
  assert.equal(cav(every.v), 'Same-day bookings are often fine (the operator’s own answer). Tours leave every 30 minutes.');
  const none = await priya({}, {}, { tours: null, booking: false });
  assert.equal(cav(none.v), 'Same-day bookings are often fine (the operator’s own answer). Call ahead for the times.');
  assert.equal(frCopy.t3FrenchText(cav(none.v)), 'Réserver le jour même convient souvent (réponse de l’entreprise). Appelez pour connaître les heures.');
  for (const [txt, want] of [['Leaves every 30 minutes.', 30], ['Tours every half hour, 9 to 5', 30], ['every 15 min in summer', 15], ['Départ toutes les 20 minutes', 20], ['every hour on the hour', 60], ['2.5 hours, ages 6+', 0]]) assert.equal(app.tourEveryMinutesIn(txt), want, txt);
  for (const x of [both, link, every, none]) for (const r of db.prepare('SELECT id FROM venues WHERE id = ?').all(x.v.id)) db.prepare("UPDATE venues SET type = 'outdoor' WHERE id = ?").run(r.id);
});

test('5. French price line: the words we know are said in French even when another part follows; "under 6 free" is « gratuit pour les moins de 6 ans »', async () => {
  const fr = (p) => app.menuPriceWithWords(p, 'fr').replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(fr('$39 adult, 25 child (6–12), under 6 free'), '39 $ adulte, 25 $ enfant (6–12), gratuit pour les moins de 6 ans');
  assert.equal(fr('$39 adult, kids under 4 free'), '39 $ adulte, gratuit pour les moins de 4 ans');
  assert.equal(fr('$39 per person, free under 5'), '39 $ par personne, gratuit pour les moins de 5 ans');
  // A part we can't say in French stays as typed; the rest is French.
  assert.equal(fr('$89 adult, 49 kids, family deals available'), '89 $ adulte, 49 $ enfants, family deals available');
  // A bracket with an English word stays whole, as before.
  assert.equal(fr('349 per sled (2 adults, or 1 adult + 2 kids)'), '349 $ par traîneau (2 adults, or 1 adult + 2 kids)');
  assert.equal(fr('$149 adult, $99 kids 5 to 12'), '149 $ adulte, 99 $ enfants de 5 à 12 ans');
  // English is unchanged.
  assert.equal(app.menuPriceWithWords('$39 adult, 25 child (6–12), under 6 free'), '$39 adult, $25 child (6–12), under 6 free');
  // And on her French page.
  const { v } = await priya();
  assert.match(plain(page(v, 'fr')), /39 \$ adulte, 25 \$ enfant \(6–12\), gratuit pour les moins de 6 ans/);
  db.prepare("UPDATE venues SET type = 'outdoor' WHERE id = ?").run(v.id);
});

test('6. "Hotel pickup": the trip API stop leads with it, and the v3 card shows it as its own line (outside the closed Why it fits box, not repeated in it), EN + FR', async () => {
  const bike = mk('tour', { name: 'Vernon E-Bike T18', region: 'vernon', cuisine: 'E-bike tours', latitude: 50.27, longitude: -119.27, address: '1 Cleveland Ave, Vernon' });
  const t = tokenFor(bike.id);
  ok(await change(t, { tour_info: { kinds: ['bike'], length: '2-3h', book: 'day', age: '12', year: 'all', pickup: true } }));
  approveAll(bike.id);
  const r = await postJson('/api/trip/plan', { text: 'e-bike tour in Vernon in June, we have no car, hotel pickup please' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const stop = itemsOf(r.body).find((x) => x.venue.id === bike.id);
  assert.ok(stop, JSON.stringify(itemsOf(r.body).map((x) => x.venue.name)));
  assert.equal(stop.why[0], 'Hotel pickup');
  assert.equal(v3.t3PickupLine(stop), 'Hotel pickup');
  assert.ok(!v3.t3WhyLines(stop).includes('Hotel pickup'), JSON.stringify(v3.t3WhyLines(stop)));
  assert.ok(v3.t3WhyLines(stop).length >= 1);
  // French: the same line, translated.
  const frStop = { ...stop, why: stop.why.map((w) => frCopy.t3FrenchText(w)) };
  assert.equal(v3.t3PickupLine(frStop), 'Prise en charge à l’hôtel');
  assert.ok(!v3.t3WhyLines(frStop).includes('Prise en charge à l’hôtel'));
  // Without pickup asked, no line.
  const r2 = await postJson('/api/trip/plan', { text: 'e-bike tour in Vernon in June' });
  const s2 = itemsOf(r2.body).find((x) => x.venue.id === bike.id);
  assert.ok(s2); assert.equal(v3.t3PickupLine(s2), '');
  db.prepare("UPDATE venues SET type = 'outdoor' WHERE id = ?").run(bike.id);
});

test('7. Undated request while today is inside her yearly closure: planned for the day she reopens, with a note (EN + FR); a closure with no reopening day said stays as it was; per kind', async () => {
  const { v } = await priya({}, {}, { closures: [{ from: '11-01', to: '12-11', note: '', yearly: true }] });
  for (const q of ['zipline tour', 'ziplining with my kids']) {
    const p = plan(q, onlyMe(v));
    assert.ok(itemsOf(p).some((x) => x.venue.id === v.id), `${q}: ${JSON.stringify(p.warnings)}`);
    assert.ok(p.comingSeason, q);
    assert.equal(p.comingSeason.date, '2026-12-12', q);
    assert.equal(p.notes[0], 'This tour is closed on November 18, so this plan is for December 12, when it reopens. Pick your own dates any time.');
    assert.equal(frCopy.t3FrenchText(p.notes[0]), 'Cette sortie est fermée le 18 novembre; ce plan est donc pour le 12 décembre, à sa réouverture. Choisissez vos dates quand vous voulez.');
  }
  // A dated request is left alone.
  const dated = plan('zipline tour on November 20', onlyMe(v));
  assert.ok(!dated.comingSeason);
  // Per kind: a summer kind whose yearly break ends in winter plans the summer, never the reopening day.
  db.prepare("UPDATE venues SET type = 'outdoor' WHERE id = ?").run(v.id);
  const raft = mk('tour', { name: 'Raft T18', cuisine: 'Whitewater rafting', kid_friendly: 1 });
  const rt = tokenFor(raft.id);
  ok(await change(rt, { tour_info: { kinds: ['raft'], length: '2-3h', book: 'day', age: '8', year: 'all' } }));
  ok(await change(rt, { closures: [{ from: '11-01', to: '12-11', note: '', yearly: true }] }));
  approveAll(raft.id);
  const rp = plan('rafting with my kids', onlyMe(raft));
  assert.ok(!rp.comingSeason || rp.comingSeason.date !== '2026-12-12', JSON.stringify(rp.comingSeason));
  db.prepare("UPDATE venues SET type = 'outdoor' WHERE id = ?").run(raft.id);
});

test('8. "something for my 4 year old in July": an all-ages tour with the Kid-Friendly badge is in Places that fit, after the parks; never a 12+ tour', async () => {
  const parks = [];
  for (let i = 0; i < 9; i++) parks.push(mk('outdoor', { name: `Family Park T18 ${i}`, cuisine: 'Park', kid_friendly: 1, rating: 4.7, reviews: 400 + i }));
  const { v } = await priya();
  const teen = mk('tour', { name: 'Teen Bungee T18', cuisine: 'Bungee jumping', kid_friendly: 1, rating: 4.9, reviews: 900 });
  ok(await change(tokenFor(teen.id), { tour_info: { kinds: ['adventure'], length: '1-2h', book: 'day', age: '12', year: 'all' } })); approveAll(teen.id);
  const p = plan('something for my 4 year old in July');
  const names = itemsOf(p).map((x) => x.venue.name);
  assert.ok(names.includes(v.name), JSON.stringify(names));
  // After every park that made the list.
  for (const pk of parks) if (names.includes(pk.name)) assert.ok(names.indexOf(pk.name) < names.indexOf(v.name), JSON.stringify(names));
  assert.ok(!names.includes(teen.name));
  for (const x of [v, teen, ...parks]) db.prepare("UPDATE venues SET type = 'indoor', kid_friendly = 0 WHERE id = ?").run(x.id);
});

test('9. The adventure kind chip leads with "Ropes, treetop, bungee…" (EN and FR in step); Help names it the same way', async () => {
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.adventure, ['Ropes, treetop, bungee, ATV, climbing or canyoning', 'Hébertisme, parcours dans les arbres, saut à l’élastique, VTT, escalade ou canyonisme']);
  const { v, t } = await priya();
  const sim = await openSetup(base, t, { hash: 'tour' });
  const kinds = sim.cfg.tourKinds || [];
  assert.ok(kinds.some((k) => k.k === 'adventure' && k.t === 'Ropes, treetop, bungee, ATV, climbing or canyoning'), JSON.stringify(kinds.slice(0, 4)));
  const en = await cfgTopics(t);
  assert.match(helpPlain(en.find((x) => x.id === 'tour-kinds-pick').a), /is Ropes, treetop, bungee, ATV, climbing or canyoning/);
  // Her card never takes the chip's long name.
  assert.doesNotMatch(String(app.getVenue(v.id).cuisine), /Ropes, treetop/);
});
