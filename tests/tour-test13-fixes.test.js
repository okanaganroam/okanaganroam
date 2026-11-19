// Whistler tour test 13 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour13-2026-11-18/REPORT.md:
// Matthias, tandem paragliding in Pemberton, on a Windows laptop with a mouse and keyboard. "$189 per flight" / "189.-",
// no paragliding kind, a meeting-spot photo with no GPS, every trip weather permitting, winter trips by request only, a
// long Good to know).
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t13-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T13 ${++n}`, slug: `tour-t13-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 13 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.73.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const boxOf = (id) => JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id) || { info: '{}' }).info);
const rowOf = (id, label) => ([...(boxOf(id).rows || []), ...(boxOf(id).owner_dropped || [])].find((r) => r.label === label) || {}).text;
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };

// Matthias's typed tours: two flights, then "Options and vouchers" (a GoPro add-on and a gift voucher).
const TOURS = [
  { name: 'Tours', items: [{ name: 'Classic tandem flight', price: '$189 per flight', description: '20–30 minutes in the air · The flights are taking place from the launch on Mount Mackenzie.' },
    { name: 'Thermal tandem flight', price: '$289 per flight', description: '45–60 minutes in the air · Longer flight in the afternoon thermals.' }] },
  { name: 'Options and vouchers', items: [{ name: 'GoPro photo and video', price: '+ $49 per flight', description: 'Your flight filmed with a GoPro on the wing.' },
    { name: 'Gift voucher', price: 'From $189', description: 'Valid two years.' }] },
];
async function matthias(o = {}, info = {}) {
  const v = mk('tour', { name: `Pemberton Tandem Paragliding ${n + 1}`, region: 'pemberton', cuisine: 'Paragliding', rating: 4.9, reviews: 211, address: '7400 Frontier St, Pemberton', latitude: 50.3192, longitude: -122.8028,
    description: 'Tandem paragliding flights over the Pemberton Valley with views of Mount Currie. Meet at our office on Frontier Street.',
    description_fr: 'Vols en parapente biplace au-dessus de la vallée de Pemberton avec vue sur le mont Currie.', ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['paraglide'], length: '1h', book: 'day', age: '6', adult: true, adult_age: '19', adult_waiver: true, year: 'all', ...info } }));
  ok(await change(t, { tour_price: 189 }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}
const plan = (q) => app.runTripPlan({ text: q }, NOW);

test('1. Build My Trip: paragliding is its own kind; "paraglide", « parapente » and kids plan the paragliding operator; a plain "scenic flight" ranks him after heli and floatplane, labelled paragliding', async () => {
  const { v, t } = await matthias();
  ok(await change(t, { visit_rows: { good_to_know: 'Passengers 25–110 kg, able to run a few steps. Closed-toe shoes.' } })); approveAll(v.id);
  const heli = mk('tour', { name: 'Pemberton Helicopters T13', region: 'pemberton', cuisine: 'Helicopter tours & scenic flights', rating: 4.6, reviews: 90, description: 'Scenic helicopter flights and glacier landings.' });
  const fly = mk('tour', { name: 'Pemberton Floatplanes T13', region: 'pemberton', cuisine: 'Floatplane scenic flights', rating: 4.7, reviews: 300, description: 'Floatplane flights over the lakes and peaks.' });
  const atv = mk('tour', { name: 'Pemberton ATV T13', region: 'pemberton', cuisine: 'ATV tours', rating: 4.9, reviews: 800, description: 'Guided ATV tours.' });
  const bungee = mk('tour', { name: 'Pemberton Bungee T13', region: 'pemberton', cuisine: 'Bungee jumping', rating: 4.9, reviews: 800, description: 'Bungee jumps.' });
  for (const q of ['paragliding', 'paragliding in August', 'tandem paraglide for my 7 year old in August', 'paragliding for my 8 year old in Pemberton', 'parapente à Pemberton en juillet', 'paraglide', 'skydiving in Pemberton', 'hang gliding in Pemberton']) {
    const p = q.includes('parapente') ? app.runTripPlan({ text: q, lang: 'fr' }, NOW) : plan(q);
    assert.ok(namesOf(p).includes(v.name), `${q}: ${JSON.stringify([p.kind, namesOf(p).slice(0, 6)])}`);
    for (const x of [atv, bungee, heli, fly]) assert.ok(!namesOf(p).includes(x.name), `${q}: ${JSON.stringify(namesOf(p))}`);
    assert.doesNotMatch(String(p.summary), /“(?:paragliding|paraglide|tandem)”/, q);
    const stop = itemsOf(p).find((x) => x.venue.name === v.name);
    assert.ok((stop.caveats || []).includes('Good to know (the operator’s own words): Passengers 25–110 kg, able to run a few steps.'), JSON.stringify(stop.caveats));
  }
  const r = require('../trip-requirements.js');
  for (const q of ['paraglide', 'paragliding', 'parapente', 'skydiving', 'hang gliding', 'speed flying', 'tandem paraglide']) assert.ok(r.KINDS.paragliding.test(q), q);
  const fr = require('../trip-planner-fr.js');
  assert.match(SERVER + fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['parapente', 'paragliding'\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['parachutisme', 'skydiving'\]/);
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-planner-fr.js'), 'utf8'), /\['deltaplane', 'hang gliding'\]/);
  assert.ok(fr);
  // A plain "scenic flight": the helicopter and floatplane first; he comes after them, labelled paragliding.
  const sf = plan('scenic flights in Pemberton in July');
  const names = namesOf(sf);
  assert.ok(names.includes(heli.name) && names.includes(fly.name), JSON.stringify(names));
  if (names.includes(v.name)) {
    assert.ok(names.indexOf(v.name) > names.indexOf(heli.name) && names.indexOf(v.name) > names.indexOf(fly.name), JSON.stringify(names));
    const stop = itemsOf(sf).find((x) => x.venue.name === v.name);
    assert.ok((stop.caveats || []).includes('Paragliding: a tandem flight with a pilot, not a plane or helicopter.'), JSON.stringify(stop.caveats));
  }
  const vocab = require('../data/vocabulary/shared.json');
  assert.ok(vocab.termLabels.paragliding && vocab.descriptionSynonyms.paragliding, 'its own group in shared.json');
});

test('5. two ticks: "Every trip is weather permitting" and "Off-season trips by request" (status line, hours block, planner; EN + FR)', async () => {
  const { v, t } = await matthias({}, { year: 'seasonal' });
  const none = Object.fromEntries(DAYS.map((d) => [d, []]));
  ok(await change(t, { hours: none, hours_checked: true, tour_info: { visit: 'appointment' } }));
  ok(await change(t, { open_months: '04-01:10-31' }));
  ok(await change(t, { tour_info: { weather_all: true, off_request: true } }));
  approveAll(v.id);
  assert.equal(app.venueTourInfo(v.id).weather_all, true);
  assert.equal((await change(t, { tour_info: { weather_all: 'yes' } })).status, 400);
  const jul = new Date('2026-07-15T11:00:00-07:00');
  const en = plain(page(v, 'en', jul)), fr = plain(page(v, 'fr', jul));
  assert.match(en, /Every trip is weather permitting\./); assert.match(fr, /Chaque sortie dépend de la météo\./);
  assert.match(en, /Book ahead · tours by reservation · weather permitting/);
  const nov = plain(page(v, 'en', NOW)), novFr = plain(page(v, 'fr', NOW));
  assert.match(nov, /Closed for the season \(trips by request\)/, nov.slice(0, 2500));
  assert.match(novFr, /Fermé pour la saison \(sorties sur demande\)/);
  // The planner: off-season, listed with "by request, rare"; every trip weather permitting.
  const p = plan('paragliding in Pemberton in January');
  const stop = itemsOf(p).find((x) => x.venue.name === v.name);
  assert.ok(stop, JSON.stringify([p.kind, namesOf(p)]));
  assert.ok(stop.caveats.includes('Out of season: trips by request only, and rare (the operator’s own answer).'), JSON.stringify(stop.caveats));
  assert.ok(stop.caveats.includes('Every trip runs weather permitting (the operator’s own answer).'), JSON.stringify(stop.caveats));
  const pj = plan('paragliding in Pemberton in July');
  const sj = itemsOf(pj).find((x) => x.venue.name === v.name);
  assert.ok(!sj.caveats.includes('Out of season: trips by request only, and rare (the operator’s own answer).'));
  const fc = require('../trip-french-copy.js');
  assert.equal(fc.t3FrenchText('Out of season: trips by request only, and rare (the operator’s own answer).'), 'Hors saison : sorties sur demande seulement, et rares (réponse de l’entreprise).');
  assert.equal(fc.t3FrenchText('Every trip runs weather permitting (the operator’s own answer).'), 'Chaque sortie dépend de la météo (réponse de l’entreprise).');
  // Without the tick, off-season is left out as before.
  ok(await change(t, { tour_info: { off_request: null } })); approveAll(v.id);
  assert.ok(!namesOf(plan('paragliding in Pemberton in January')).includes(v.name));
  assert.doesNotMatch(plain(page(v, 'en', NOW)), /trips by request/);
  // In-season closed days stay closed (an owner closure).
  // The setup: the two ticks on the existing screens (tours only), EN + FR.
  assert.match(CLIENT, /tticksHtml\(true\)/); assert.match(CLIENT, /msgs\(\) \+ tticksHtml\(!!S\.openSea\)/);
  for (const L of [text.en.tour, text.fr.tour]) assert.ok(L.tWeatherAll && L.tOffRequest);
});

test('4. door screen: a photo with no location says so, and offers "Send it with my address and you place the pin"', () => {
  assert.match(CLIENT, /\+ msgs\(\) \+ \(TOUR && S\.door\.noGpsPhoto && C\.pin && T\.doorPickAddr/);
  assert.match(CLIENT, /if \(k === 'doorPickAddr'\) \{[^\n]*S\.door\.mapFail = true; S\.door\.addrOnly = true;/);
  assert.equal(text.en.tour.doorPickAddr, 'Send it with my address and you place the pin');
  assert.ok(text.fr.tour.doorPickAddr);
  assert.match(text.en.tour.doorPickNoGps, /Send it with your address/);
});

test('2. prices: per flight / ride / tandem flight, the Swiss "189.-" and "CHF 189" save 189; one price with words we can’t read says so (not "One price here")', () => {
  for (const x of ['$189 per flight', '$189 per tandem flight', '$189 per ride', '189.- per flight (Classic tandem)', 'CHF 189.-', 'CHF 189', '189.–', '$189 per classic flight', '189 per seat', '189 pp', '$189 per passenger']) {
    assert.deepEqual(app.cleanTourPrice(x, true), { value: 189 }, x);
    assert.equal(app.tourPriceWhy(x), '', x);
  }
  // Test 12's mixed line, and the old nudges, as before.
  assert.equal(app.tourPriceWhy('$139 per jump 🔥 2nd jump same day $69'), 'first');
  assert.deepEqual(app.cleanTourPrice('$139 per jump 🔥 2nd jump same day $69', true), { value: 139 });
  assert.equal(app.tourPriceWhy('650 per boat'), 'group'); assert.equal(app.tourPriceWhy('$69/bike'), 'unit'); assert.equal(app.tourPriceWhy('$750/day'), 'day');
  assert.equal(app.tourPriceWhy('2 hrs $95pp'), 'hours'); assert.equal(app.tourPriceWhy('95 or 120'), 'many');
  assert.equal(app.tourPriceWhy('$95 (per boat)'), 'group');
  // One number and words we can't read: 'words', its own message.
  assert.equal(app.tourPriceWhy('189 great value'), 'words');
  assert.match(app.cleanTourPrice('189 great value', true).error, /Type just the number, like 189, or “189 per person”/);
  assert.match(text.en.tour.tpriceWords, /189 per person/); assert.ok(text.fr.tour.tpriceWords);
  // The setup reads the box the same way.
  const fn = new Function(`${/function feeHours\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function moneyHead\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function priceSwiss\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function priceTrim\(x\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function tourPriceWhy\(x, priv\)\{[\s\S]*?\n  \}\n/.exec(CLIENT)[0]}${/function tourPriceRead\(x, priv\)\{[^\n]*\n/.exec(CLIENT)[0]} return { why: tourPriceWhy, read: tourPriceRead };`)();
  for (const x of ['$189 per flight', '$189 per tandem flight', '$189 per ride', '189.- per flight (Classic tandem)', 'CHF 189.-']) assert.equal(fn.read(x), 189, x);
  assert.equal(fn.why('$139 per jump 🔥 2nd jump same day $69'), 'first'); assert.equal(fn.why('189 great value'), 'words');
  assert.match(CLIENT, /pwhy === 'words' && T\.tpriceWords \? T\.tpriceWords/);
});

test('3. the Paragliding, skydiving or hang gliding kind: under More kinds, Air & Heli plus Adventure, its page words (EN + FR), research words', async () => {
  assert.ok(completeness.TOUR_KINDS.includes('paraglide'));
  assert.ok(app.TOUR_KINDS_SHOWN.indexOf('paraglide') >= 12, 'under More kinds');
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.paraglide, ['Paragliding, skydiving or hang gliding', 'Parapente, parachutisme ou deltaplane']);
  // Research saying paragliding pre-picks this kind, never the ATV / bungee one.
  assert.deepEqual(app.tourKindSuggestion({ cuisine: 'Tandem paragliding', name: 'Pemberton Tandem Paragliding' }), ['paraglide']);
  assert.ok(!app.tourKindSuggestion({ cuisine: 'Skydiving', name: 'Whistler Skydiving' }).includes('adventure'));
  const { v } = await matthias();
  assert.equal(app.getVenue(v.id).cuisine, 'Paragliding');
  assert.match(plain(page(v, 'fr')), /Parapente/);
  assert.doesNotMatch(plain(page(v)), /Helicopter/);
  assert.ok(app.tourInActivity(app.getVenue(v.id), 'air'), 'Air & Heli');
  assert.ok(app.tourInActivity(app.getVenue(v.id), 'adventure'), 'Adventure');
  assert.match(app.tourKindsText(['paraglide'], false, 'Tandem paragliding', '', ''), /^(?:Tandem p|P)aragliding$/);
  assert.equal(app.tourKindsText(['paraglide'], true, 'Skydiving', '', ''), 'Parachutisme');
  // A research word his typed tours say stays with his kinds (as his story or Known for would keep it).
  assert.match(app.tourOwnWords(v.id), /Classic tandem flight/);
  assert.match(app.tourKindsText(['paraglide'], false, 'Paragliding & thermal soaring', '', 'Classic tandem flight ; Thermal soaring flight'), /thermal soaring/i);
  assert.doesNotMatch(app.tourKindsText(['paraglide'], false, 'Paragliding & thermal soaring', '', ''), /thermal soaring/i);
});

test('6. Good to know: a tour holds 320; text past a limit is kept to its last full sentence (never cut mid-word), with where the rest goes', async () => {
  const long = 'Passengers must weigh between 25 and 110 kg and be able to run a few steps. Wear closed-toe shoes. The flight time is confirmed by text message the evening before or in the morning. Payment after the landing, by card or cash. If we cancel because of the weather, you can rebook for free or get a full refund. Thank you very much for your understanding and see you soon.';
  assert.ok(long.length > 320);
  const f = app.fitToLimit(long, 320);
  assert.ok(f.text.length <= 320 && /[.!?]$/.test(f.text), f.text);
  assert.ok(f.rest.startsWith('Thank you') || f.rest.startsWith('If we cancel'), f.rest);
  const w = app.fitToLimit('word '.repeat(60), 180); assert.ok(w.text.length <= 180 && /word$/.test(w.text));
  // The server never saves a line cut mid-word at the limit.
  const cut = long.slice(0, 320);
  assert.ok(app.ownerVisitText(cut, 320).error, cut.slice(-20));
  assert.equal(app.ownerVisitText(f.text, 320).text, f.text);
  const { v, t } = await matthias();
  ok(await change(t, { visit_rows: { good_to_know: f.text } })); approveAll(v.id);
  assert.equal(rowOf(v.id, 'Good to know'), f.text);
  assert.equal((await change(t, { visit_rows: { good_to_know: cut } })).status, 400);
  // The setup: room past the limit in the box (a paste isn't cut), the trim at Save, the message, the other limited boxes.
  assert.match(CLIENT, /id="suBring" maxlength="' \+ \(BRING_MAX \+ 600\) \+ '"/);
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 14).
  assert.match(text.en.tour.fitRestTour || text.en.fitRestTour, /a tour’s description \(in Your tours and prices\) or under Groups/);
  assert.ok((text.fr.tour.fitRestTour || text.fr.fitRestTour) && (text.fr.tour.countOver || text.fr.countOver) && (text.en.tour.countOver || text.en.countOver));
});

test('8a. extras: an "Options and vouchers" section, "+ $49" add-ons and a gift voucher aren’t tours (page, /prices, admin card)', async () => {
  for (const n of ['Options and vouchers', 'Add-ons', 'Add ons', 'Extras', 'Upgrades', 'Options & extras', 'Options et bons cadeaux']) assert.ok(app.tourExtrasSection(n), n);
  for (const n of ['Tours', 'Winter tours', 'Options for groups and families']) assert.ok(!app.tourExtrasSection(n), n);
  assert.equal(app.tourTripItems({ sections: TOURS }).length, 2);
  assert.equal(app.tourTripItems({ sections: [{ name: 'Tours', items: [{ name: 'Flight', price: '$189' }, { name: 'GoPro', price: '+$49' }, { name: 'Photos', price: '+ $29' }, { name: 'Gift voucher', price: 'From $189' }] }] }).length, 1);
  const { v } = await matthias();
  assert.match(plain(page(v)), /See all tours & prices \(2 tours\)/);
});

test('8b. small things: back to setup #more, chip focus, the 1 to 2 hours chip and the time range, the spelling flag, desktop words', async () => {
  // "Back to my listing" from the typed-tours editor opened from the setup goes back to the setup's optional list.
  assert.match(CLIENT, /\/menu'\) \+ '\?from=setup#type'/);
  const { v, t } = await matthias();
  const ed = await get(`/owner/${t}/menu?from=setup`);
  assert.match(ed.text, new RegExp(`"back":"[^"]*/owner/${t}/setup#more"`));
  const ed2 = await get(`/owner/${t}/menu`);
  assert.doesNotMatch(ed2.text, /setup#more/);
  // Good to know chips: an empty box keeps the focus on the chip (keyboard and mouse); a finger tap, or a box with text, goes to the box.
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 15).
  // Time needed: "20–30 min" and "45–60 min" read "20 minutes to 1 hour"; a "1 to 2 hours" chip.
  assert.match(plain(page(v)), /Time needed 20 minutes to 1 hour\. Varies by tour/);
  assert.ok(completeness.TOUR_LENGTHS.includes('1-2h'));
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 11).
  assert.equal(text.en.tour.tlengths['1-2h'], '1 to 2 hours'); assert.equal(text.fr.tour.tlengths['1-2h'], '1 à 2 heures');
  ok(await change(t, { tour_info: { length: '1-2h' } }));
  assert.equal(app.venueTourInfo(v.id).length, '1-2h');
  // Booking: no "Varies by tour" when no typed tour has its own booking words.
  assert.match(plain(page(v)), /Booking Book at least a day ahead\.(?! Varies)/);
  // The admin spelling flag: only words that look like a place name.
  const clean = require('../owner-text-clean.js');
  assert.deepEqual(clean.nameMisspellings('Longer flight in the afternoon thermals.', { phrases: [], words: ['Loggers'] }), []);
  assert.equal(clean.nameMisspellings('We fly near Pemberon every day.', { phrases: [], words: ['Pemberton'] }).length, 1);
  assert.equal(clean.nameMisspellings('A hike to Jeffrey lakes and squamsh.', { phrases: ['Joffre Lakes'], words: ['Squamish'] }).length, 2);
  // Desktop words: "click" and "Choose a photo" with a mouse (pointer:fine).
  assert.match(CLIENT, /window\.matchMedia\('\(pointer:fine\)'\)\.matches/);
  assert.equal(text.en.choosePhoto, 'Choose a photo'); assert.ok(text.fr.choosePhoto);
});

test('9. French prices in one format ("+ 49 $ par vol"); English as typed', () => {
  assert.equal(app.menuPriceLabel('+ $49 per flight', 'fr'), '+ 49 $ par vol');
  assert.equal(app.menuPriceLabel('$189 per flight', 'fr'), '189 $ par vol');
  assert.equal(app.menuPriceLabel('+ $49 per flight', 'en'), '+ $49 per flight');
  assert.equal(app.menuPriceLabel('From $189', 'fr'), 'À partir de 189 $');
});
