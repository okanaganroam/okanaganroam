// Whistler tour test 7 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour7-2026-11-17/REPORT.md: Erik,
// an ACMG / IFMGA mountain guide in Pemberton, desktop, English; private day rates, two seasons with a break, multi-day
// trips). Covers bugs 1-12, the Minor list, the wording table and suggested fixes 1-9, in English and French, and that
// the other setup types still load. The Help questions are in tour-help-routing.test.js; planner words in
// tour-planner-words.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr7-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const hours = require('../hours.js');
const completeness = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr7 ${++n}`, slug: `tour-wr7-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.47.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };
const publish = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(id, JSON.stringify({ sections: [{ name: 'Trips', items }] }));
const cardOf = (html, name) => (html.split('<li class="venue-card"').slice(1).find((x) => x.includes(name)) || '');
// Erik's listing, moved to Penticton: research partly wrong on purpose (heli-skiing, dogs welcome, $195).
function erik(o = {}) {
  const v = mk('tour', { name: `Coast Mountain Guiding ${n + 1}`, cuisine: 'Ski touring, heli-skiing & avalanche courses', rating: 4.9, reviews: 143,
    description: 'Certified mountain guides offering ski touring, heli-skiing and avalanche courses in the backcountry.', dog_friendly: 1, ...o });
  setBox(v.id, { rows: [
    { label: 'Known for', text: 'Heli-skiing and backcountry ski touring' },
    { label: 'Prices', text: 'From $195 per person' },
    { label: 'Good to know', text: 'Rental skis included; meet in the village; dogs welcome on tours' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  return { v, t: tokenFor(v.id) };
}

test('1. price box: "$750/day" is a day rate for the group (Private tours, with the move button), "1450 for 3 days" a trip length; the private box takes a day rate (EN + FR)', async () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(clientFn('moneyHead') + clientFn('feeHours') + clientFn('priceSwiss') + clientFn('priceTrim') + clientFn('tourPriceWhy') + clientFn('tourPriceRead') + clientFn('tourPriceNumber'), ctx);
  const why = (x, priv) => vm.runInContext(`tourPriceWhy(${JSON.stringify(x)}, ${!!priv})`, ctx);
  const rd = (x, priv) => vm.runInContext(`tourPriceRead(${JSON.stringify(x)}, ${!!priv})`, ctx);
  for (const x of ['$750/day', '750 per day', '750 a day', '750 per day, up to 4 people', '750 daily', '800 per night', '750 $ par jour', '750 $ la journée']) {
    assert.equal(why(x), 'day', x); assert.equal(app.tourPriceWhy(x), 'day', `server ${x}`); assert.ok(Number.isNaN(rd(x)), x);
  }
  for (const x of ['1450 for 3 days', '1450 for a 3-day trip', '3 days $1450', '$1,450 (3 days)', '2600 for 5 days', '1450 $ pour 3 jours']) { assert.equal(why(x), 'length', x); assert.equal(app.tourPriceWhy(x), 'length', `server ${x}`); }
  for (const x of ['$40 per hour', '40 $ de l’heure']) { assert.equal(why(x), 'hourly', x); assert.equal(app.tourPriceWhy(x), 'hourly', x); }
  // A unit word with the hour stays per-unit; a boat or group stays group.
  for (const x of ['$30/hour per bike', '$69/bike', '69 par vélo']) assert.equal(why(x), 'unit', x);
  for (const x of ['650 per boat', '650 for 4 people', '650 per boat per day']) assert.equal(why(x), 'group', x);
  // The private box: a day rate reads as its number (client and server); a trip length doesn't.
  for (const [x, want] of [['$750/day', 750], ['750 a day', 750], ['750 per day up to 4', 750], ['750 per day, up to 4 people', 750], ['750 $ par jour', 750], ['$750 daily', 750]]) {
    assert.equal(rd(x, true), want, x); assert.deepEqual(app.cleanTourPrice(x), { value: want }, `server ${x}`);
  }
  assert.ok(Number.isNaN(rd('3000 for 3 days', true)));
  // The nudges (wording table), EN + FR; the move button under the day-rate nudge; no button under the length one.
  assert.equal(text.en.tour.tpriceDay, 'A day rate for your group? Put it in Private tours below, and your lowest price for one person here.');
  assert.equal(text.en.tour.tpriceLength, 'That’s a trip length. Type just the price for one person, like 1450, and list each trip in Your tours and prices.');
  assert.match(text.fr.tour.tpriceDay, /^Un tarif à la journée pour votre groupe\s?\?/); assert.match(text.fr.tour.tpriceLength, /^Ça, c’est une durée\./);
  assert.match(text.en.tour.tprivLead, /a day rate/); assert.match(text.fr.tour.tprivLead, /un tarif à la journée/); // tour test 16: shorter
  assert.equal(text.en.tour.tprivNeed, 'Just the number, like 750. Say “a day, up to 4” in Your tours and prices.');
  assert.match(CLIENT, /pwhy === 'day' && T\.tpriceDay \? T\.tpriceDay : pwhy === 'length' && T\.tpriceLength \? T\.tpriceLength/);
  assert.match(CLIENT, /S\.groupMove = pwhy === 'group' \|\| pwhy === 'day' \|\| pwhy === 'lesson' \? tourPriceNumber/); // tour test 14: per lesson too
  assert.match(CLIENT, /S\.nudge === T\.tpriceGroup \|\| S\.nudge === T\.tpriceDay\) && S\.groupMove != null/);
  // Server: "$750/day" in the per-person box is refused with the day-rate reason; nothing saved. In the private box it saves 750.
  const { v, t } = erik();
  const bad = await change(t, { tour_price: '$750/day' });
  assert.equal(bad.status, 400); assert.equal(app.tourPrice(v.id), null);
  assert.match(app.cleanTourPrice('$750/day', true).error, /^A day rate for your group\?/);
  assert.match(app.cleanTourPrice('1450 for 3 days', true).error, /^That’s a trip length\./);
  ok(await change(t, { tour_price: 395, tour_info: { private: 750 } }));
  assert.match(plain(page(v)), /From \$395 a person\. Private tours from \$750 for the group\./);
});

test('2. category words: a pre-picked kind he unticks takes its research words off the category (EN + FR); only words no pre-picked chip covered stay', async () => {
  const was = 'Ski touring, heli-skiing & avalanche courses';
  assert.deepEqual(app.tourKindSuggestion({ cuisine: was, name: '' }), ['heli', 'snowshoe', 'guide']);
  assert.equal(app.tourKindsText(['snowshoe', 'guide'], false, was), 'Ski touring & avalanche courses');
  assert.equal(app.tourKindsText(['snowshoe', 'guide'], true, was), 'Ski de randonnée et cours d’avalanche');
  assert.equal(app.tourKindsText(['heli', 'snowshoe'], false, was), 'Heli-skiing & ski touring');
  assert.doesNotMatch(app.tourKindsText(['snowshoe', 'other'], false, was), /heli/i);
  assert.doesNotMatch(app.tourKindsText(['snowshoe', 'other'], true, was), /h[ée]li/i);
  // A word no chip would have pre-picked stays ("photography").
  // Tour test 11 (2026-11-18): picking any kind replaces research's words; a leftover no picked kind covers goes.
  assert.equal(app.tourKindsText(['snowshoe'], false, 'Ski touring & photography'), 'Ski touring');
  // Saved through the setup: the listing's category and the French card both lose heli-skiing.
  const { v, t } = erik();
  const r = ok(await change(t, { tour_info: { kinds: ['snowshoe', 'guide'] } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Ski touring & avalanche courses');
  assert.equal(r.body.tour_words.fr, 'Ski de randonnée et cours d’avalanche');
  const metaFr = (/<p class="venue-meta">([\s\S]*?)<\/p>/.exec(cardOf((await get('/fr/penticton/tours')).text, v.name)) || [])[1] || '';
  assert.match(plain(metaFr), /Ski de randonnée et cours d’avalanche/i); assert.doesNotMatch(plain(metaFr), /h[ée]li/i);
  // Research's Known for loses the unticked kind's words too (page and card): "Backcountry ski touring".
  assert.match(plain(page(v)), /Backcountry ski touring/); assert.doesNotMatch(plain(page(v)), /Heli-skiing and backcountry/);
  assert.doesNotMatch(plain(cardOf((await get('/penticton/tours')).text, v.name)), /Heli-skiing/);
  // Untick everything: the listing's own words come back (an Undo of the kinds).
  ok(await change(t, { tour_info: { kinds: null } }));
  assert.equal(app.getVenue(v.id).cuisine, was);
});

test('4. a held price is withdrawn when he saves the live price again (and a new live price withdraws it too); the checklist no longer says within a day', async () => {
  const { v, t } = erik();
  ok(await change(t, { tour_price: 395 }));
  const held = ok(await change(t, { tour_price: 2600 }));
  assert.ok((held.body.review || []).includes('tour_price'), JSON.stringify(held.body));
  assert.equal(app.ownerTourPriceWaiting(v.id), 2600);
  // The right price again (the live one): the held $2,600 is withdrawn (superseded), never approvable later.
  const back = await change(t, { tour_price: 395 });
  assert.ok(back.status === 200, JSON.stringify(back.body));
  assert.equal(app.ownerTourPriceWaiting(v.id), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0").get(v.id).c, 0);
  assert.equal(app.tourPrice(v.id), 395);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(!(cfg.waiting || []).includes('price') && !(cfg.waiting || []).includes('tour_price'), JSON.stringify(cfg.waiting));
  // A different live price withdraws a held one as well.
  ok(await change(t, { tour_price: 2600 })); assert.equal(app.ownerTourPriceWaiting(v.id), 2600);
  ok(await change(t, { tour_price: 450 })); assert.equal(app.ownerTourPriceWaiting(v.id), null); assert.equal(app.tourPrice(v.id), 450);
  // The setup sends the live value again when a held one differs (tour, tasting, flight and cocktail prices).
  assert.match(CLIENT, /pp !== S\.savedTourPrice \|\| \(CUR\.tour_price_waiting != null && pp !== CUR\.tour_price_waiting\)/);
  assert.match(CLIENT, /tf !== S\.savedFee \|\| \(CUR\.tasting_fee_waiting != null && tf !== CUR\.tasting_fee_waiting\)/);
  assert.match(CLIENT, /ff !== S\.savedFlight \|\| \(CUR\.flight_fee_waiting != null && ff !== CUR\.flight_fee_waiting\)/);
  assert.match(CLIENT, /CUR\.cocktail_price_waiting != null && cpv\.fee !== CUR\.cocktail_price_waiting/);
});

test('5. card length: a list of 1- to 5-day trips is "1–5 days" (« 1 à 5 jours »); "A full day" alone is "Full day"; the page says Varies by tour', async () => {
  assert.equal(app.tourLengthRange([1440, 2880, 7200]), '1–5 days');
  assert.equal(app.tourLengthRange([240, 4320]), '4 hr–3 days');
  assert.equal(app.tourLengthRange([120, 240]), '2–4 hr');
  const { v, t } = erik();
  ok(await change(t, { tour_info: { kinds: ['snowshoe', 'guide'], length: 'full', book: 'week' } }));
  let card = cardOf((await get('/penticton/tours')).text, v.name);
  assert.match(plain(card), /Full day/); assert.doesNotMatch(plain(card), /8 hr/);
  assert.match(plain(cardOf((await get('/fr/penticton/tours')).text, v.name)), /Journée complète/);
  publish(v.id, [{ name: 'Private ski touring', price: '750 per day, up to 4 people', duration: '1 day' }, { name: 'AST 1 avalanche course', price: '395', duration: '2 days' },
    { name: 'Hut trip', price: '1450', duration: '3 days' }, { name: 'Hut trip, long', price: '2600', duration: '5 days' }]);
  card = cardOf((await get('/penticton/tours')).text, v.name);
  assert.match(plain(card), /1–5 days/); assert.doesNotMatch(plain(card), /8 hr/);
  assert.match(plain(cardOf((await get('/fr/penticton/tours')).text, v.name)), /1 à 5 jours/);
  const p = plain(page(v));
  assert.match(p, /Time needed 1 day to 5 days\. Varies by tour: see Tours & prices\./); // tour test 11: the range
  // The list's prices with "$" and the thousands comma (display only).
  assert.match(p, /\$750 per day, up to 4 people/); assert.match(p, /\$1,450/); assert.match(p, /\$2,600/);
  assert.match(plain(page(v, 'fr')), /750 \$ par jour, jusqu’à 4 personnes/); assert.match(plain(page(v, 'fr')), /1 450 \$/);
  // "Several days" is "Multi-day" on the card when there is no list.
  const w = erik();
  ok(await change(w.t, { tour_info: { kinds: ['guide'], length: 'multi' } }));
  assert.match(plain(cardOf((await get('/penticton/tours')).text, w.v.name)), /Multi-day/);
});

test('6. filters: mountain guiding, mountaineering, avalanche courses, ACMG put a tour under Adventure too (Whistler: Climbing & Mountain Guides); the guide kind does', async () => {
  const a = mk('tour', { name: 'Alpine Words Guides', cuisine: 'Ski touring', description: 'ACMG guides for ski touring and glacier travel.' });
  assert.ok(app.tourInActivity(a, 'adventure'));
  const b = mk('tour', { name: 'Avalanche Words School', cuisine: 'Avalanche courses', description: 'AST 1 and AST 2.' });
  assert.ok(app.tourInActivity(b, 'adventure'));
  // Not a fishing guide or a heli flight's glacier landing.
  const c = mk('tour', { name: 'Lake Fishing Words', cuisine: 'Fishing charters', description: 'Fishing guiding on the lake.' });
  assert.ok(!app.tourInActivity(c, 'adventure'));
  const d = mk('tour', { name: 'Flight Words', cuisine: 'Scenic flights', description: 'Floatplane flights with a glacier landing.' });
  assert.equal(app.tourInActivity(d, 'adventure'), app.tourActivityOf(d) === 'adventure');
  assert.equal(app.TOUR_KIND_ACTIVITY.guide, 'adventure');
  const e = erik();
  ok(await change(e.t, { tour_info: { kinds: ['guide'] } }));
  assert.ok(app.tourInActivity(app.getVenue(e.v.id), 'adventure'));
});

test('7. kinds: a Mountain guiding chip (a list entry, no new field); its public word is "Mountain guiding" / « Guide de montagne »', async () => {
  assert.ok(completeness.TOUR_KINDS.includes('guide'));
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.guide, ['Mountain guiding, mountaineering or avalanche courses', 'Guide de montagne, alpinisme ou cours d’avalanche']);
  assert.equal(app.tourKindsText(['guide'], false, 'Glacier mountaineering & guiding'), 'Mountain guiding');
  assert.equal(app.tourKindsText(['guide'], true, 'Glacier mountaineering & guiding'), 'Guide de montagne');
  assert.equal(app.tourKindsText(['guide'], false, ''), 'Mountain guiding');
  const { t } = erik();
  for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`]) {
    const c = cfgOf((await get(p)).text);
    assert.ok((c.tourKinds || []).some((k) => k.k === 'guide' && /^(?:Mountain guiding|Guide de montagne)/.test(k.t)), p);
    assert.ok((c.suggestKinds || []).includes('guide'), p);
  }
});

test('8. private only: no per-person price with a private day rate works; the card says "From $750 / group", the page "Private tours from $750"; the price answer counts', async () => {
  const { v, t } = erik();
  ok(await change(t, { tour_info: { private: 750 } }));
  assert.equal(app.tourPrice(v.id), null);
  const card = plain(cardOf((await get('/penticton/tours')).text, v.name));
  assert.match(card, /From \$750 \/ group/); assert.doesNotMatch(card, /\$195/);
  assert.match(plain(page(v)), /Private tours from \$750 for the group\./);
  assert.match(plain(page(v, 'fr')), /Sorties privées à partir de 750 \$ pour le groupe\./);
  const s = completeness.scoreCompleteness({ type: 'tour', tourInfo: app.tourInfoAnswers(v.id), tourPrice: null });
  assert.ok(s && JSON.stringify(s).length, 'scored');
  assert.match(CLIENT, /var privOnly = !pfree && pp == null && pv != null && !isNaN\(pv\);/);
  // A per-person price later takes the card back.
  ok(await change(t, { tour_price: 395 }));
  assert.match(plain(cardOf((await get('/penticton/tours')).text, v.name)), /From \$395/);
});

test('9. minor: Closed between seasons line (EN + FR), Help focus and Esc, Up to 4, two-season hint, sent banner names the list, No dogs hides research dogs, by-booking dates said once', async () => {
  // The break between two seasons: one line, the owner's note not repeated.
  const parsed = hours.parseHours(JSON.stringify({ ...WK('09:00', '17:00'), _closures: [{ from: '2027-05-01', to: '2027-06-30', note: 'Between seasons. Back July 1.', yearly: true }] }));
  const clock = { weekday: 'thu', minutes: 600, date: '2027-05-20' };
  const st = hours.statusAt(parsed, clock);
  const label = hours.hoursStatusLabel(st, clock);
  assert.equal(label.text, 'Closed between seasons · Reopens Jul 1');
  assert.equal(app.frStatusText(label.text), 'Fermé entre les saisons · Réouverture le 1er juil.');
  // A short yearly closure stays "Closed today (…)".
  const p2 = hours.parseHours(JSON.stringify({ ...WK('09:00', '17:00'), _closures: [{ from: '2027-12-25', to: '2027-12-26', note: 'Christmas', yearly: true }] }));
  assert.match(hours.hoursStatusLabel(hours.statusAt(p2, { weekday: 'sat', minutes: 600, date: '2027-12-25' }), { weekday: 'sat', minutes: 600, date: '2027-12-25' }).text, /^Closed today \(Christmas\)/);
  // Help: the input takes the focus (again if the page took it), Esc closes it from anywhere.
  assert.match(SERVER, /function open\(\)\{ panel\.hidden = false; btn\.hidden = true; btn\.setAttribute\('aria-expanded', 'true'\); if \(!started\) begin\(\); focusInput\(\);/);
  assert.match(SERVER, /document\.addEventListener\('keydown', function\(e\)\{ if \(e\.key === 'Escape' && !panel\.hidden && !\(panel\.contains && panel\.contains\(e\.target\)\)\) close\(\); \}\);/);
  // Groups: a booked tour's smallest chip is "Up to 4".
  // Tour test 8 (2026-11-17): every tour starts at 4 ("4+", or "Up to 4" by booking).
  assert.match(CLIENT, /\(TOUR \? \[4\]\.concat\(GROUP_SIZES, T\.groupsChipBig \? \[21\] : \[\]\) : GROUP_SIZES\)/); // tour test 9: and 21+
  // The two-season hint after the first season (EN + FR).
  assert.equal(text.en.tour.twoSeasonHint, 'Two seasons with a break? Make one season from the first day to the last, then add the break below and tick Every year.');
  assert.match(text.fr.tour.twoSeasonHint, /^Deux saisons avec une pause/);
  assert.match(CLIENT, /S\.openSea && T\.twoSeasonHint/);
  // The sent banner names the list.
  assert.match(text.en.tour.menuSentToast, /^✓ Your tours and prices are sent\./); assert.match(text.fr.tour.menuSentToast, /^✓ Vos sorties et tarifs sont envoyés\./);
  // No dogs: research's "dogs welcome on tours" leaves Good to know (display only), the rest stays.
  const { v, t } = erik();
  ok(await change(t, { tour_info: { age: '16' }, badges: { dog_friendly: false, free_parking: true } }));
  const p = plain(page(v));
  assert.doesNotMatch(p, /dogs welcome on tours/i);
  assert.match(p, /Rental skis included/);
  // By booking with an owner season: the dates once (the season line), then the one booking line.
  const b = erik();
  ok(await change(b.t, { tour_info: { visit: 'appointment', year: 'seasonal' }, open_months: '12-15:09-15' }));
  const ph = plain(page(b.v, 'en', new Date('2027-02-10T18:00:00Z')));
  assert.match(ph, /Book ahead · tours by reservation/);
  assert.doesNotMatch(ph, /Hours through the year/);
});

test('other setup types still load (EN + FR) with no tour words', async () => {
  for (const type of ['restaurant', 'pub', 'winery', 'cafe', 'brewery', 'distillery', 'cocktail']) {
    const t = tokenFor(mk(type, { cuisine: 'Canadian' }).id);
    for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`]) {
      const r = await get(p);
      assert.equal(r.status, 200, `${type} ${p}`);
      const c = cfgOf(r.text);
      assert.ok(Array.isArray(c.steps) && c.steps.length, type);
      assert.equal(c.tourKinds, undefined, type);
    }
  }
});
