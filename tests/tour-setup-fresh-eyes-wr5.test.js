// Whistler tour test 5 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour5-2026-11-17/REPORT.md: Rob, an
// owner-skipper with fishing charters priced per boat and a whale cruise per person, by booking only, closed over Christmas).
// Covers bugs 1-11, the Minor list, the wording table and suggested fixes 1-10, in English and French, and that the other
// setup types still load. The Help questions of all five tests are in tour-help-routing.test.js; the planner words for
// every tour kind in tour-planner-words.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr5-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tr = require('../trip-requirements.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const { createArrivalPoints } = require('../arrival-points');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const V3 = fs.readFileSync(path.join(ROOT, 'trip-planner-v3-page.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const NONE = Object.fromEntries(DAYS.map((d) => [d, null]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr5 ${++n}`, slug: `tour-wr5-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.39.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);
const box = (id) => { const r = db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : null; };
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };

// Rob's listing, moved to Penticton: research rows partly wrong (7 of them, Good to know "Free parking at the marina;
// fishing licence included; patio seating").
const R = 'Okanagan Fishing Charters';
let robCache = null;
function rob() {
  if (robCache) return robCache;
  const v = mk('tour', { name: R, slug: 'okanagan-fishing-charters-wr5', cuisine: 'Fishing charters & whale watching', rating: 4.8, reviews: 143, address: '40211 Kintyre Drive, Penticton',
    description: 'Salmon fishing charters and wildlife cruises on Okanagan Lake with a local skipper. Half-day and full-day private charters for up to six people, and a two-hour scenic cruise.',
    description_fr: 'Sorties de pêche et croisières sur le lac Okanagan avec un capitaine local.' });
  setBox(v.id, { rows: [
    { label: 'Known for', text: 'Salmon fishing charters and whale watching on Okanagan Lake' },
    { label: 'Time needed', text: '2 to 8 hours' },
    { label: 'Prices', text: 'From $95 per person' },
    { label: 'Booking', text: 'Walk-ups welcome at the dock' },
    { label: 'Ages', text: 'All ages' },
    { label: 'Season', text: 'April to October' },
    { label: 'Good to know', text: 'Free parking at the marina; fishing licence included; patio seating' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  mk('tour', { name: 'Skaha Boat Tours Wr5', cuisine: 'Boat tours', rating: 4.7, reviews: 200, description: 'Boat tours on Skaha Lake.' });
  mk('outdoor', { name: 'Skaha Lake Beach Wr5', cuisine: '', rating: 4.8, reviews: 900, description: 'A sandy lake beach with a dock for fishing and a boat launch.', activities: ['water', 'fishing'] });
  mk('outdoor', { name: 'Trout Creek Trail Wr5', cuisine: '', rating: 4.8, reviews: 500, description: 'An easy walking trail to a fishing pond.', activities: ['hiking', 'fishing'] });
  robCache = { v, t: tokenFor(v.id) };
  return robCache;
}

test('1. price box: "650 per boat" and other worded prices are never trimmed; per boat points to Private tours; "2 hrs $95pp" is refused; per person is fine (EN + FR)', async () => {
  // The setup's own reader, as the page runs it.
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(clientFn('moneyHead') + clientFn('feeHours') + clientFn('priceSwiss') + clientFn('priceTrim') + clientFn('tourPriceWhy') + clientFn('tourPriceRead') + clientFn('tourPriceNumber'), ctx);
  const why = (x, priv) => vm.runInContext(`tourPriceWhy(${JSON.stringify(x)}, ${!!priv})`, ctx);
  const rd = (x, priv) => vm.runInContext(`tourPriceRead(${JSON.stringify(x)}, ${!!priv})`, ctx);
  for (const x of ['650 per boat', '650/boat', '$650 for 4 ppl', '650 per charter', '650 for the whole boat', '$650 per group', '1100 for up to 6']) { assert.equal(why(x), 'group', x); assert.ok(Number.isNaN(rd(x)), x); }
  for (const x of ['2 hrs $95pp', '2 hr 95', '4-8 hrs', '90 min $45']) { assert.equal(why(x), 'hours', x); assert.ok(Number.isNaN(rd(x)), x); }
  for (const x of ['650 or 1100', '650 + 75 extra']) { assert.equal(why(x), 'many', x); assert.ok(Number.isNaN(rd(x)), x); }
  // Tour test 13: one price and words we can't read is 'words' (its own message), no longer "One price here".
  assert.equal(why('95 adults'), 'words'); assert.ok(Number.isNaN(rd('95 adults')));
  for (const [x, want] of [['$162 pp', 162], ['162 per person', 162], ['162 pp', 162], ['$189.00 per person', 189], ['189 $ par personne', 189], ['129 each', 129], ['95 a person', 95], ['95 per person + tax', 95], ['12.50/person', 12.5], ['$1,500', 1500], ['1 500 $', 1500]]) assert.equal(rd(x), want, x);
  // The private box takes per-boat words (that is what it is for), never a trip length.
  for (const [x, want] of [['650 per boat', 650], ['$1,100 for the whole boat', 1100], ['650 for 4 people', 650]]) assert.equal(rd(x, true), want, x);
  assert.ok(Number.isNaN(rd('2 hrs 650', true)));
  assert.equal(vm.runInContext('tourPriceNumber("650 per boat")', ctx), 650);
  // The nudges and the lead (EN + FR); the move button; the hint says where a boat price goes.
  assert.equal(text.en.tour.tpriceGroup, 'Priced per boat, per group or per lesson? Put it in Private tours below.'); // tour test 14: per lesson too
  assert.match(text.fr.tour.tpriceGroup, /par bateau, par groupe ou par cours\s?\? Mettez-le dans Sorties privées/);
  assert.equal(text.en.tour.tpriceLeadPick, 'Your card will say “From {x} a person”.');
  assert.equal(text.fr.tour.tpriceLeadPick, 'Votre fiche indiquera « À partir de {x} par personne ».');
  assert.match(text.en.tour.tpriceHours, /starts with a trip length/); assert.match(text.en.tour.tpriceOne, /One price here/);
  // Tour test 16 (2026-11-18): the line under the box is one short line now ("The adult price…"); per boat, per group and
  // per lesson are in Help, and the nudge after Save (above) still says Private tours.
  assert.match(text.en.tour.tpriceMore, /^The adult price\./);
  assert.match(CLIENT, /if \(k === 'tpriceToPriv'\)/);
  assert.match(CLIENT, /S\.nudge = pwhy === 'group' && T\.tpriceGroup \? T\.tpriceGroup : /);
  // The server reads the same way (the edit page sends text): per-person refused with the reason, private takes per boat.
  assert.match(app.cleanTourPrice('650 per boat', true).error, /Private tours/);
  assert.match(app.cleanTourPrice('2 hrs $95pp', true).error, /trip length/);
  assert.deepEqual(app.cleanTourPrice('$162 pp', true), { value: 162 });
  assert.deepEqual(app.cleanTourPrice('650 per boat'), { value: 650 });
  const { v, t } = rob();
  assert.equal(ok(await change(t, { tour_price: '$95 per person', tour_info: { private: 650 } })).status, 200);
  assert.equal(app.tourPrice(v.id), 95);
  const bad = await change(t, { tour_price: '650 per boat' });
  assert.equal(bad.status, 400); assert.equal(app.tourPrice(v.id), 95);
  // Tasting, flight and cocktail boxes refuse a trip length first too (never "$2").
  assert.match(CLIENT, /S\.brew\.fee = f === '' \? null : feeHours\(x\) \? NaN :/);
  assert.match(CLIENT, /S\.cp\.fee = cf === '' \? null : feeHours\(x\) \? NaN :/);
  assert.match(CLIENT, /S\.wine\.fee = f === '' \? null : feeHours\(x\) \? NaN :/);
  assert.equal(vm.runInContext('feeHours("2 hrs $15")', ctx), true); assert.equal(vm.runInContext('feeHours("$15 per flight")', ctx), false);
});

test('3 + 10. Build My Trip: fishing charter, a fishing trip for 6 and « excursion de pêche » plan the fishing operator first; its slot is its own trip length', async () => {
  const { v, t } = rob();
  ok(await change(t, { tour_info: { kinds: ['fishing', 'boat', 'wildlife'], length: 'half', year: 'all' } }));
  for (const q of ['fishing charter in Penticton', 'Fishing charter in Penticton on August 14', 'a fishing trip for 6 people in Penticton on August 21', 'excursion de pêche à Penticton le 14 août', 'bateau nolisé à Penticton le 14 août', 'salmon fishing in Penticton in September']) {
    const got = names(await plan(q));
    assert.equal(got[0], R, `${q}: ${JSON.stringify(got)}`);
    assert.ok(!got.some((x) => /Beach Wr5|Trail Wr5/.test(x)), `${q}: ${JSON.stringify(got)}`);
  }
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'X', cuisine: 'Boat tours', tourKinds: ['fishing'], description: '' }).includes('fishing_tour'));
  assert.ok(!tr.inferPlannerKinds({ type: 'outdoor', name: 'Trout Lake', cuisine: '', description: 'Fishing from the dock.' }).includes('fishing_tour'));
  // A named charter on a day plan gets its own length (half a day), not the 2-hour default.
  const p = await plan(`${R} on August 14`);
  const stop = itemsOf(p).find((x) => x.venue.name === R);
  assert.ok(stop, JSON.stringify(names(p)));
  if (stop.start && stop.end) { const m = (x) => { const [h, mi] = String(x).split(':').map(Number); return h * 60 + mi; }; assert.ok(m(stop.end) - m(stop.start) >= 240, `${stop.start}-${stop.end}`); }
});

test('4. the by-booking Hours block during a yearly closure says "Book ahead · tours by reservation", never "Daily Closed" (EN + FR)', async () => {
  const v = mk('tour', { name: 'Xmas Break Charters Wr5', cuisine: 'Fishing charters', hours: JSON.stringify(NONE) });
  const t = tokenFor(v.id);
  ok(await change(t, { hours: NONE, hours_checked: true, tour_info: { visit: 'appointment', year: 'all' } }));
  ok(await change(t, { closures: [{ from: '12-20', to: '01-05', note: 'Xmas break', yearly: true }] }));
  for (const [lang, appt, closed] of [['en', 'Book ahead · tours by reservation', /Daily Closed|Every day Closed/], ['fr', 'Réservez à l’avance · sorties sur réservation', /Tous les jours Fermé/]]) {
    const h = plain(page(v, lang, new Date('2026-12-28T20:00:00Z')));
    const hours = h.slice(h.indexOf(lang === 'fr' ? 'Heures' : 'Hours'), h.indexOf(lang === 'fr' ? 'Heures' : 'Hours') + 600);
    assert.ok(h.includes(appt), `${lang}: ${hours}`);
    assert.doesNotMatch(hours, closed, lang);
  }
  // Out of the closure it is the plain by-booking line, as before.
  assert.match(plain(page(v, 'en', new Date('2027-03-10T20:00:00Z'))), /Book ahead · tours by reservation/);
});

test('5. story box: never selected on a tap (typing adds to it); replacing is an explicit link; the review card flags a much shorter description', async () => {
  assert.doesNotMatch(CLIENT, /\|\| researchStory \|\| researchLine\) && !chipOwn/);
  assert.match(CLIENT, /var pre = \(\(inp\.tagName !== 'TEXTAREA' && inp\.id !== 'suUrl' && inp\.id !== 'suCq' && !!inp\.value\) \|\| researchLine\) && !chipOwn/);
  assert.equal(text.en.storyResearchHint, 'This is what your page says now. Typing adds to the end of it.');
  assert.equal(text.fr.storyResearchHint, 'Voici ce que dit votre page maintenant. Ce que vous tapez s’ajoute à la fin.');
  assert.equal(text.en.storyReplaceLink, 'Clear it and write my own');
  assert.match(CLIENT, /id="suStoryReplace">' \+ h\(T\.storyReplaceLink\)/);
  // Research one-line boxes (Known for, booking, groups) keep their first-tap select (pub test 3).
  assert.match(CLIENT, /researchLine = !!vk && !!inp\.value/);
  assert.equal(app.descriptionShrank('A'.repeat(300), 'Half day $650 per boat'), true);
  assert.equal(app.descriptionShrank('A'.repeat(300), 'A'.repeat(200)), false);
  assert.equal(app.descriptionShrank('Short.', ''), false);
  const card = app.renderAdminChangeCard({ id: 9, venue_name: R, listing_url: '/x', submitted_at: '2026-11-17 10:00:00', changes: { description: 'Half day $650 per boat' }, previous: { description: 'A'.repeat(300) } });
  assert.match(card, /The new text is much shorter than the old one \(22 characters, was 300\)/);
  const card2 = app.renderAdminChangeCard({ id: 10, venue_name: R, listing_url: '/x', submitted_at: '2026-11-17 10:00:00', changes: { description: 'A'.repeat(250) }, previous: { description: 'A'.repeat(300) } });
  assert.doesNotMatch(card2, /much shorter/);
});

test('6. kinds: whales on the wildlife chip, "More kinds" stays open, the category in list order with her "Whale watching" and "Fishing charters" kept, and the tour under its filter', async () => {
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.wildlife, ['Wildlife, whale and bear viewing', 'Observation de la faune, des baleines et des ours']);
  assert.match(CLIENT, /id="suKindsMore"' \+ \(S\.tourMoreOpen \|\| tRest\.some/);
  assert.match(CLIENT, /kmo\.addEventListener\('toggle', function\(\)\{ S\.tourMoreOpen = kmo\.open; \}\)/);
  const kt = app.tourKindsText;
  // Tap order no longer matters.
  assert.equal(kt(['wildlife', 'fishing', 'boat'], false, 'Fishing charters & whale watching'), kt(['boat', 'fishing', 'wildlife'], false, 'Fishing charters & whale watching'));
  const words = kt(['wildlife', 'fishing', 'boat'], false, 'Fishing charters & whale watching');
  assert.match(words, /Fishing charters/); assert.match(words, /[Ww]hale watching/); assert.doesNotMatch(words, /Fishing charters.*· Fishing$/);
  assert.equal(kt(['wildlife'], false, 'Whale watching'), 'Whale watching');
  assert.equal(kt(['wildlife'], false, ''), 'Wildlife and bear viewing');
  // A ticked kind puts the tour under its filter (Lake & Boats for fishing), its name saying nothing about boats.
  const v = mk('tour', { name: 'Penticton Anglers Wr5', cuisine: 'Guided trips', description: 'Guided trips with a local guide.' });
  assert.equal(app.tourInActivity(app.getVenue(v.id), 'lake'), false);
  ok(await change(tokenFor(v.id), { tour_info: { kinds: ['fishing'], length: 'half' } }));
  assert.equal(app.tourInActivity(app.getVenue(v.id), 'lake'), true);
  assert.equal(app.tourInActivity(app.getVenue(v.id), 'wine'), false);
  const lake = (await get('/tours/lake')).text;
  assert.ok(lake.includes('Penticton Anglers Wr5'), 'under Lake & Boats');
  // Whale words are wildlife tours for the planner too.
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'X', cuisine: 'Whale watching', description: '' }).includes('wildlife_tour'));
});

test('7. an owner line beats an unconfirmed research line for the 7-row cap, before she answers that row (all types)', async () => {
  const { v, t } = rob();
  ok(await change(t, { badges: { dog_friendly: true }, visit_rows: { dogs: 'On some trips: private charters only' } }));
  const b = box(v.id);
  assert.ok(b.rows.some((r) => r.label === 'Dogs' && /private charters only/.test(r.text)), JSON.stringify(b.rows.map((r) => r.label)));
  assert.ok(b.rows.length <= 7);
  assert.ok(!(b.owner_dropped || []).some((r) => r.label === 'Dogs'), JSON.stringify(b.owner_dropped));
  assert.ok((b.owner_dropped || []).some((r) => !r.owned), 'a research row was set aside instead');
});

test('8. meeting spot: a phone reading far from the spot sent (500 m+) needs a choice before "Looks right"; the phone spot becomes the spot', async () => {
  const PIN = { lat: 49.7178, lng: -123.1448 }, DOCK = { lat: 49.6930, lng: -123.1580 };
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, latitude REAL, longitude REAL);
    CREATE TABLE venue_arrival_points (id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER, file TEXT, preview_key TEXT UNIQUE, lat REAL, lng REAL, device_lat REAL, device_lng REAL, accuracy_m REAL, distance_m INTEGER, status TEXT DEFAULT 'pending', review_reasons TEXT, submitted_by TEXT, submitted_at TEXT DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT, reviewed_by TEXT, rejection_reason TEXT);`);
  d.prepare('INSERT INTO venues VALUES (1, ?, ?, ?)').run('Rob', PIN.lat, PIN.lng);
  const out = {};
  const ap = createArrivalPoints({ db: d, respond: (res, status, body) => { out.status = status; out.body = body; }, sameOrigin: () => true, clientIp: () => 'ip', rateLimited: () => false,
    readJson: async (req) => req.body, venueForToken: () => ({ venue: d.prepare('SELECT * FROM venues').get() }), strip: (x) => x, dimensions: () => ({ width: 1200, height: 900 }), write: () => 'f.jpg', remove: () => {} });
  const jpg = `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}`;
  // "Send with my address": the spot sent is the old pin (his house), the phone was at the dock.
  await ap.submit({ body: { image: jpg, lat: PIN.lat, lng: PIN.lng, device_lat: DOCK.lat, device_lng: DOCK.lng, accuracy: 12, rights: true } }, {}, 'tok');
  assert.equal(out.status, 201);
  const row = d.prepare('SELECT * FROM venue_arrival_points').get();
  const card = ap.cardHtml({ ...row, venue_name: 'Rob' }, (x) => String(x), '<div class="rv-actions"></div>');
  assert.match(card, /Which spot is right\?/); assert.match(card, /name="use" value="phone"/); assert.match(card, /name="use" value="sent"/);
  assert.doesNotMatch(card, /name="use" value="phone" checked/);
  const refused = ap.action(row.id, 'approve', {}, 'dayton');
  assert.equal(refused.status, 400); assert.match(refused.body.error, /Pick which spot is right/);
  const okd = ap.action(row.id, 'approve', { use: 'phone' }, 'dayton');
  assert.equal(okd.status, 200);
  const after = d.prepare('SELECT * FROM venue_arrival_points WHERE id = ?').get(row.id);
  assert.equal(after.status, 'approved'); assert.equal(after.lat, DOCK.lat); assert.equal(after.lng, DOCK.lng);
  // Near each other: no choice, as before.
  await ap.submit({ body: { image: jpg, lat: DOCK.lat, lng: DOCK.lng, device_lat: DOCK.lat + 0.0002, device_lng: DOCK.lng, accuracy: 12, rights: true } }, {}, 'tok');
  const r2 = d.prepare("SELECT * FROM venue_arrival_points WHERE status = 'pending'").get();
  assert.doesNotMatch(ap.cardHtml({ ...r2, venue_name: 'Rob' }, (x) => String(x), ''), /Which spot is right/);
  assert.equal(ap.action(r2.id, 'approve', {}, 'dayton').status, 200);
  // The review page sends the choice.
  assert.match(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), /if \(card\.querySelector\('input\[name=use\]'\)\) \{ var useBox = card\.querySelector\('input\[name=use\]:checked'\); body\.use = useBox \? useBox\.value : ''; \}/);
});

test('10. the card never pairs one trip’s price with another’s length: a list of different lengths shows their range', () => {
  assert.equal(app.tourLengthRange([120, 240, 480]), '2–8 hr');
  assert.equal(app.tourLengthRange([45, 180]), '45 min–3 hr');
  assert.equal(app.tourLengthRange([120, 120]), null);
  assert.equal(app.tourLengthRange([90]), null);
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(src, /if \(tourFacts && tourFacts\.time && venue\.type === 'tour'\) \{ const lv = tourListInfo\(venue\.id\); if \(lv\.length\) tourFacts\.time = tourLengthRange\(lv\.mins, lv\.hiMins\); \}/);
  // From whistlerroam #186: the list item's own "How long" box is read first.
  assert.match(src, /const t = `\$\{it\.duration \|\| ''\} \$\{it\.name \|\| ''\} \$\{it\.description \|\| ''\}`\.toLowerCase\(\);/);
  // The planner's slot for a tour is its own trip length.
  const tp = fs.readFileSync(path.join(ROOT, 'trip-planner.js'), 'utf8');
  assert.match(tp, /const TOUR_LENGTH_MINUTES = \{ '1h': 60, '1-2h': 90, '2-3h': 150, half: 240, full: 480, multi: 480 \};/);
});

test('11 + Minor + wording: header at 360, "add it", "On some trips: …", Groups for by-booking, the tour count, the counter, the edit page hours, the dock example', async () => {
  const css = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(css, /body\.owner-setup \.su-logo, body\.owner-setup \.su-exit, body\.owner-setup \.su-head \.su-lang \{ white-space: nowrap; \}/);
  assert.match(css, /@media \(max-width: 400px\) \{ body\.owner-setup \.su-head \{ gap: 6px; \} body\.owner-setup \.su-logo \{ font-size: 15px;/);
  // "Address sent. We’ll add it within a day." ("address" ends in s; it read "them").
  const pc = fs.readFileSync(path.join(ROOT, 'portal-completeness.js'), 'utf8');
  assert.match(pc, /const EN_PLURAL = new Set\(\['photos', 'tours and prices', 'features'\]\);/);
  // The dogs line joins chip and words with ": ".
  assert.equal(app.dogsChipSentences('On some trips private charters only'), 'On some trips: private charters only');
  assert.equal(app.dogsChipSentences('À certaines sorties sorties privées seulement'), 'À certaines sorties: sorties privées seulement');
  assert.match(app.dogsChipSentences('On some trips'), /^Dogs welcome on some trips\.?$/);
  // Dogs on some trips: the card chip, the planner's reason and its stop say so.
  const { v } = rob();
  assert.equal(app.dogsSomeTrips(app.getVenue(v.id)), true);
  assert.match(V3, /b\.key === 'dog_friendly' && v\.dogsSomeTrips \? \(lang\(\) === 'fr' \? 'Chiens à certaines sorties' : 'Dogs on some trips'\)/);
  const tp = fs.readFileSync(path.join(ROOT, 'trip-planner.js'), 'utf8');
  assert.match(tp, /v\.dogsSomeTrips \? 'Dogs on some trips' : 'Has the Dog-Friendly badge'/);
  // Groups for a by-booking tour; the dock or marina in the meeting-spot photo words.
  assert.equal(text.en.tour.groupsQBooked, 'Groups and private bookings: how big can a group be?');
  assert.match(text.fr.tour.groupsQBooked, /^Groupes et réservations privées/);
  assert.match(CLIENT, /var bk = AI\.visit === 'appointment'; S\.groupsBooked = bk;/);
  assert.match(text.en.tour.doorPhotoLead, /the dock or marina/); assert.match(text.fr.tour.doorPhotoLead, /le quai ou la marina/);
  // The tours count leaves out add-on lines.
  for (const x of ['Extra person', 'Additional guests', 'Rod rental', 'Fishing licence', 'Add-ons', 'Personne supplémentaire']) assert.ok(app.TOUR_ADDON_LINE_RE.test(x), x);
  for (const x of ['Half day charter', 'Whale and seal cruise', 'Full day private boat']) assert.ok(!app.TOUR_ADDON_LINE_RE.test(x), x);
  // The description counter, the by-booking hours on the edit page.
  assert.match(css, /data-ok="\$\{escapeHtml\(L\('✓ Long enough for your score', '✓ Assez long pour votre pointage'\)\)\}"/);
  const ed = mk('tour', { name: 'Booked Edit Wr5', cuisine: 'Boat tours', hours: JSON.stringify(NONE) });
  ok(await change(tokenFor(ed.id), { hours: NONE, hours_checked: true, tour_info: { visit: 'appointment' } }));
  const edit = (await get(`/owner/${tokenFor(ed.id)}`)).text;
  assert.match(edit, /id="opNoSetHoursTour"/); assert.match(edit, /<details class="op-fold" id="opHoursSetFold"><summary>Add set hours<\/summary><div id="opHours">/);
  // Kid-Friendly is left as it is (defensible for 6+).
  assert.ok(Array.isArray(completeness.TOUR_KINDS));
});

test('the other setups still load, their story box behaves the same, and happy hour is never asked of a tour', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail']) {
    const v = mk(type, { cuisine: type === 'winery' ? 'Winery' : 'Canadian' });
    const r = await get(`/owner/${tokenFor(v.id)}/setup`);
    assert.equal(r.status, 200, type);
    const cfg = cfgOf(r.text);
    assert.ok(cfg, type);
    const fr = await get(`/fr/owner/${tokenFor(v.id)}/setup`);
    assert.equal(fr.status, 200, type);
  }
  const { t } = rob();
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.ok(!JSON.stringify(cfg.steps || []).includes('happy'));
});
