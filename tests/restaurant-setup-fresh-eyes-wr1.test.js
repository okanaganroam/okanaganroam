// First first-time restaurant owner test on Whistler (Sofia, Android, 2026-11-14; Whistler Roam
// drafts/fresh-eyes-restaurant1-2026-11-14/REPORT.md). The setup code is shared, so the fixes are made here for every type:
// lunch and dinner (a second time) on the setup's day cards, the kitchen / last seating question for restaurants, Build My
// Trip with yearly owner closures (and a substitute restaurant), "dinner … at 7pm" and food words in Known for, closing
// twice a year, the food list (European, Swiss & Alpine, one ✕), service dogs, reservations from research, "Book online",
// yearly closures in Hours through the year, out-of-season specials and events, "You said: Yes." and the happy hour example.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'restaurant-wr1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const tp = require('../trip-planner.js');
const req = require('../trip-requirements.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = (o, c) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[o, c]]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Alpenglow Test ${++n}`, slug: `alpenglow-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.5, reviews: 188, address: `${900 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK('17:00', '22:00'),
  description: 'A fixture used only by the first restaurant fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = () => fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const SHOULDERS = [{ from: '04-19', to: '05-14', note: 'Spring shoulder season', yearly: true }, { from: '10-12', to: '11-26', note: 'Fall shoulder season', yearly: true }];

// ---------- 1. Lunch and dinner (a second time) in setup ----------
test('split hours: "+ Add a second time (lunch & dinner)" and ✕ on the setup day cards (usual and season hours), words EN/FR', () => {
  const s = CLIENT();
  assert.equal(text.en.addSecond, '+ Add a second time (lunch & dinner)');
  assert.equal(text.fr.addSecond, '+ Ajouter une deuxième plage (midi et soir)');
  assert.equal(text.en.removeSecond, 'Remove this time'); assert.equal(text.fr.removeSecond, 'Retirer cette plage');
  // Drawn on every open day card of both weeks (the screen is W(): the usual week or the season's), two ranges at most.
  assert.match(s, /\(w\.length < 2 && T\.addSecond \? '<div class="su-samerow"><button type="button" class="su-toggle su-addtime" data-addtime="' \+ d \+ '">' \+ h\(T\.addSecond\)/);
  assert.match(s, /\(w\.length > 1 \? '<button type="button" class="su-toggle su-rmtime" data-rmtime="' \+ d \+ ':' \+ j \+ '" aria-label="' \+ h\(T\.removeSecond \+ \(C\.lang === 'fr' \? '\\u00a0: ' : ': '\) \+ t12\(y\[0\]\) \+ ' – ' \+ t12\(y\[1\]\)\) \+ '"><span aria-hidden="true">✕<\/span> ' \+ h\(T\.removeSecond\) \+ '<\/button>' : ''\)/, 'with two times, ✕ on each');
  assert.match(s, /querySelectorAll\('\[data-addtime\]'\)[\s\S]{0,200}var d = b\.getAttribute\('data-addtime'\), wk = W\(\), w = wk\[d\]; if \(!w \|\| !w\.length \|\| w\.length >= 2\) return;/);
  assert.match(s, /if \(a >= '15:00'\) w\.unshift\(\['11:30', '14:30'\]\);/, 'a dinner-only day gets lunch before it');
  assert.match(s, /w\.splice\(\+q5\[1\], 1\);/, '✕ removes that time');
  // "Copy these hours to" copies the whole day (both times): clone of the day's list.
  assert.match(s, /gets\.forEach\(function\(x\)\{ if \(all \|\| \(we \? \['sat', 'sun'\] : \['mon', 'tue', 'wed', 'thu', 'fri'\]\)\.indexOf\(x\) >= 0\) wk\[x\] = clone\(src\); \}\);/);
  // Saving stores every range of each day; reading them back keeps both.
  assert.match(s, /var week = \{\}; DAYS\.forEach\(function\(d\)\{ week\[d\] = S\.week\[d\] \|\| \[\]; \}\);/);
  assert.match(s, /var sw = \{\}; DAYS\.forEach\(function\(d\)\{ sw\[d\] = so\.week\[d\] \|\| \[\]; \}\);/);
  assert.match(s, /out\[d\] = o && o\[d\] && o\[d\]\.length \? o\[d\]\.map\(function\(x\)\{ return \[x\[0\], x\[1\]\]; \}\) : null;/);
  assert.match(SERVER(), /body\.owner-setup \.su-rmtime \{ min-height: 44px; \}/);
});

test('split hours: a summer season of lunch 11:30–2:30 + dinner 5–10 saved from the setup is stored, reloads, and shows closed at 3 PM in July', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const split = Object.fromEntries(DAYS.map((d) => [d, [['11:30', '14:30'], ['17:00', '22:00']]]));
  const usual = Object.fromEntries(DAYS.map((d) => [d, [['17:00', '22:00']]]));
  ok(await change(t, { hours: usual, hours_checked: true, hours_seasons: [{ from: '06-15', to: '09-15', label: '', hours: split }] }));
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.cur.hours_seasons[0].hours.tue, [['11:30', '14:30'], ['17:00', '22:00']], 'Change an answer reloads both times');
  // Usual days with a second time too.
  ok(await change(t, { hours: { ...usual, sat: [['11:30', '14:30'], ['17:00', '22:00']] }, hours_checked: true }));
  assert.deepEqual(JSON.parse(app.getVenue(v.id).hours).sat, [['11:30', '14:30'], ['17:00', '22:00']]);
  assert.deepEqual(cfgOf((await get(`/owner/${t}/setup`)).text).cur.hours.sat || JSON.parse(cfgOf((await get(`/owner/${t}/setup`)).text).cur.hours).sat, [['11:30', '14:30'], ['17:00', '22:00']]);
  // Tuesday July 13, 2027: 3 PM closed, 12 PM and 7 PM open (America/Vancouver: UTC-7).
  const at = (hh) => new Date(Date.UTC(2027, 6, 13, hh + 7));
  const st = (hh) => app.venueHoursStatusAt(app.hoursWithExtras(app.getVenue(v.id), at(hh)), at(hh));
  assert.equal(st(15).state, 'closed', JSON.stringify(st(15)));
  assert.equal(st(12).state, 'open'); assert.equal(st(19).state, 'open');
  // Build My Trip reads the same week on that date.
  assert.deepEqual(JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-07-13')).tue, [['11:30', '14:30'], ['17:00', '22:00']]);
  // A third range is refused (the server's rule; the setup never offers one).
  const bad = await change(t, { hours: { ...usual, mon: [['08:00', '09:00'], ['11:30', '14:30'], ['17:00', '22:00']] }, hours_checked: true });
  assert.notEqual(bad.status, 200);
});

test('split hours: help for "close between lunch and dinner", "split shift", "lunch only in summer" points to the setup (EN and FR)', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  for (const q of ['How do I close between lunch and dinner?', 'split shift', 'lunch hours only in summer', 'we do lunch and dinner']) assert.equal(en.best(q).id, 'setup-split-hours', q);
  for (const q of ['fermé entre le dîner et le souper', 'horaire coupé', 'dîner seulement l’été']) assert.equal(fr.best(q).id, 'setup-split-hours', q);
  const tp0 = en.topic('setup-split-hours');
  assert.match(tp0.a, /\+ Add a second time \(lunch &amp; dinner\)/); assert.match(tp0.a, /No, different in summer/); assert.match(tp0.a, /Copy these hours to/);
  assert.match(tp0.aFr, /\+ Ajouter une deuxième plage \(midi et soir\)/); assert.match(tp0.aFr, /Non, elles changent en été/);
  // Every type's setup has it (the day cards are shared).
  const pub = mk('pub'); assert.equal(helpBot((await get(`/owner/${tokenFor(pub.id)}/setup`)).text).best('split shift').id, 'setup-split-hours');
});

// ---------- 2. The kitchen / last seating question for restaurants ----------
test('kitchen: restaurants are asked "When does the kitchen close / last seating?" after their hours (the pub screen and storage); pubs unchanged', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.restaurant, true);
  assert.equal(cfg.t.kitchenQ, 'When does the kitchen close / last seating?');
  assert.equal(cfg.t.kitchenAt, 'Kitchen closes / last seating at');
  assert.deepEqual(cfg.cur.pub_info, {});
  const fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(fr.t.kitchenQ, 'À quelle heure la cuisine ferme-t-elle (dernier service) ?');
  const pub = cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text);
  assert.equal(pub.t.kitchenQ, 'Does your kitchen close before the bar?'); assert.equal(pub.t.kitchenNone, 'We don’t serve food'); assert.ok(!pub.restaurant);
  const s = CLIENT();
  assert.match(s, /var KITCHEN_Q = !!\(C\.pub \|\| C\.restaurant\);/);
  assert.match(s, /saveAll\('hours', listH, null, addNext \? 'hours:season2' : KITCHEN_Q \? 'hours:kitchen' : COMBO \? 'closures' : null,/);
  assert.match(s, /\(C\.restaurant \? '' : big\('✕', T\.kitchenNone, '', true, 'kitchenNone'\)\)/, 'no "We don’t serve food" for a restaurant');
});

test('kitchen: a restaurant saves 9:30 PM (and its summer time); it is live, on the page, never "no food" or who’s welcome, and the score is unchanged', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const pct = async () => { const j = JSON.parse((await get(`/owner/${t}/completeness`)).text); return /(\d+)\s*%/.exec(j.html)[1]; };
  const before = await pct();
  ok(await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: '', season: { from: '06-15', to: '09-15', closes: '22:00' } } } }));
  assert.deepEqual(app.venuePubInfo(v.id).kitchen, { mode: 'earlier', closes: '21:30', season: { from: '06-15', to: '09-15', closes: '22:00' } });
  assert.equal(await pct(), before, 'the kitchen time is optional: no new checklist item');
  assert.deepEqual(cfgOf((await get(`/owner/${t}/setup`)).text).cur.pub_info.kitchen.closes, '21:30', 'Change an answer reloads it');
  const html = page(v, 'en', new Date('2027-02-10T20:00:00Z'));
  assert.match(html, /Kitchen closes at 9:30\s?PM/);
  assert.match(page(v, 'fr', new Date('2027-02-10T20:00:00Z')), /La cuisine ferme à 21\s?h\s?30/);
  assert.notEqual((await change(t, { pub_info: { kitchen: { mode: 'none' } } })).status, 200, 'a restaurant always serves food');
  assert.notEqual((await change(t, { pub_info: { minors: { policy: 'adults' } } })).status, 200, 'no who’s welcome for restaurants');
  assert.ok(!('minors' in app.venuePubInfo(v.id)));
});

test('kitchen: Build My Trip never plans a dinner past the kitchen / last seating time (restaurants and pubs, the season’s own time)', async () => {
  const v = mk('restaurant', { name: 'Kitchen Close Bistro', slug: 'kitchen-close-bistro', region: 'penticton', address: '5 Main St, Penticton', latitude: 49.49, longitude: -119.59 });
  ok(await change(tokenFor(v.id), { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: '' } } }));
  const facts = app.buildTripPlannerFacts(false, '2027-02-13').find((f) => f.id === v.id);
  assert.deepEqual(facts.ownKitchen, { closes: '21:30' });
  assert.equal(tp.kitchenCloseMinutes(facts), 21 * 60 + 30);
  assert.equal(tp.kitchenCloseMinutes({ ownKitchen: { closes: '00:30' } }), 24 * 60 + 30);
  const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
  const row = async (q) => ((await plan(q)).schedule || []).find((x) => x.venueId === v.id);
  const at8 = await row('Dinner at Kitchen Close Bistro on Saturday February 13 at 8pm');
  assert.equal(at8.startMinutes, 20 * 60); assert.ok(at8.endMinutes <= 21 * 60 + 30, JSON.stringify(at8));
  const at830 = await row('Dinner at Kitchen Close Bistro on Saturday February 13 at 8:30pm');
  assert.ok(!at830 || !Number.isFinite(at830.endMinutes) || at830.endMinutes <= 21 * 60 + 30, JSON.stringify(at830));
  // The season's own kitchen time on a date in that season.
  ok(await change(tokenFor(v.id), { pub_info: { kitchen: { mode: 'earlier', closes: '21:30', note: '', season: { from: '06-15', to: '09-15', closes: 'close' } } } }));
  assert.deepEqual(app.buildTripPlannerFacts(false, '2027-07-13').find((f) => f.id === v.id).ownKitchen, {});
  assert.deepEqual(app.buildTripPlannerFacts(false, '2027-02-13').find((f) => f.id === v.id).ownKitchen, { closes: '21:30' });
});

test('kitchen: help "kitchen closes", "last seating", « dernière commande », « la cuisine ferme » (restaurants)', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  for (const q of ['kitchen closes at 9:30', 'last seating', 'when does the kitchen close']) assert.equal(en.best(q).id, 'restaurant-kitchen', q);
  for (const q of ['dernière commande', 'la cuisine ferme à 21 h 30']) assert.equal(fr.best(q).id, 'restaurant-kitchen', q);
  assert.match(en.topic('restaurant-kitchen').a, /When does the kitchen close \/ last seating\?/);
  assert.match(fr.topic('restaurant-kitchen').aFr, /dernier service/);
});

// ---------- 3. Build My Trip and yearly owner closures ----------
test('Build My Trip: a May date in a yearly closure says "closed for the season on May 8 (reason)" and plans another open restaurant in its place', async () => {
  const v = mk('restaurant', { name: 'Edelweiss Stube', slug: 'edelweiss-stube', region: 'summerland', address: '1 Main St, Summerland', latitude: 49.6, longitude: -119.67 });
  mk('restaurant', { name: 'Harvest Table Summerland', slug: 'harvest-table-summerland', region: 'summerland', address: '2 Main St, Summerland', latitude: 49.601, longitude: -119.671, hours: WEEK('11:00', '22:00') });
  ok(await change(tokenFor(v.id), { closures: SHOULDERS }));
  const r = (await postJson('/api/trip/plan', { text: 'Dinner at Edelweiss Stube on Saturday May 8 2027' })).body;
  assert.equal(r.warnings[0], 'Edelweiss Stube is closed for the season on May 8 (Spring shoulder season), so it isn’t in this plan.', JSON.stringify(r.warnings));
  assert.ok(!r.warnings.some((w) => /closed right now|No restaurant could be fitted/.test(w)), JSON.stringify(r.warnings));
  const stops = [...((r.itinerary && r.itinerary.stops) || []), ...(r.days || []).flatMap((d) => d.stops || [])].filter((x) => x.venue);
  assert.ok(stops.some((x) => x.venue.type === 'restaurant' && x.venue.id !== v.id), JSON.stringify(stops.map((x) => x.venue.name)));
  assert.ok(r.warnings.includes(`${stops.find((x) => x.venue.type === 'restaurant').venue.name} is planned in its place.`), JSON.stringify(r.warnings));
  assert.ok(!stops.some((x) => x.venue.id === v.id));
  // French.
  assert.equal(frCopy.t3FrenchText('Edelweiss Stube is closed for the season on May 8 (Spring shoulder season), so it isn’t in this plan.'), 'Edelweiss Stube est fermé pour la saison le 8 mai (Spring shoulder season); il ne fait donc pas partie de ce plan.');
  assert.equal(frCopy.t3FrenchText('Harvest Table Summerland is planned in its place.'), 'Harvest Table Summerland est prévu à sa place.');
  // The yearly rows say so; a one-day holiday closure keeps its own words.
  const f = app.buildTripPlannerFacts(false, '2027-05-08').find((x) => x.id === v.id);
  assert.ok(f.ownerClosures.some((c) => c.yearly && c.from === '2027-04-19'));
});

test('Build My Trip: an outing with no drink open nearby still plans dinner (not "No restaurant could be fitted")', async () => {
  const v = mk('restaurant', { name: 'Lone Dinner House', slug: 'lone-dinner-house', region: 'peachland', address: '1 Beach Ave, Peachland', latitude: 49.77, longitude: -119.73, description: 'Cozy candlelit dining room.' });
  const r = (await postJson('/api/trip/plan', { text: 'Romantic dinner for two in Peachland on Saturday February 13' })).body;
  assert.ok((r.schedule || []).some((x) => x.venueId === v.id), JSON.stringify([r.kind, r.warnings, r.schedule]));
});

// ---------- 4. "Dinner … at 7pm" and food words ----------
test('Build My Trip: "Dinner for two… Saturday February 13 at 7pm, we love cheese fondue" is dinner at 7 at the place Known for fondue', async () => {
  const fondue = mk('restaurant', { name: 'Glacier Room', slug: 'glacier-room', region: 'oliver', address: '1 Main St, Oliver', latitude: 49.18, longitude: -119.55, rating: 4.2, reviews: 90, description: 'A warm room on Main Street.' });
  research(fondue.id, [{ label: 'Known for', text: 'Cheese fondue and raclette' }, { label: 'Reservations', text: 'Recommended' }]);
  mk('restaurant', { name: 'Oliver Grill House', slug: 'oliver-grill-house', region: 'oliver', address: '3 Main St, Oliver', latitude: 49.181, longitude: -119.551, rating: 4.9, reviews: 900, description: 'Romantic candlelit steaks.' });
  mk('cocktail', { name: 'Oliver Velvet Lounge', slug: 'oliver-velvet-lounge', region: 'oliver', address: '5 Main St, Oliver', latitude: 49.1805, longitude: -119.5505, hours: WEEK('16:00', '23:59'), description: 'Cozy romantic cocktails.' });
  const r = (await postJson('/api/trip/plan', { text: 'Dinner for two in Oliver on Saturday February 13 at 7pm, we love cheese fondue' })).body;
  const rows = (r.schedule || []).filter((x) => Number.isFinite(x.startMinutes));
  const din = rows.find((x) => x.venueId === fondue.id);
  assert.ok(din, JSON.stringify([r.kind, r.warnings, rows]));
  assert.equal(din.startMinutes, 19 * 60);
  assert.ok(!rows.some((x) => x.startMinutes < din.startMinutes && x.endMinutes > 19 * 60), 'nothing pushes dinner later');
  // The pieces: the one evening time is dinner's when dinner is all that's asked; drinks first keeps it a start time.
  const tax = { regions: ['oliver'], regionLabels: { oliver: 'Oliver' } };
  const x = req.extractTripRequirements({ text: 'Dinner for two Saturday February 13 at 7pm, we love cheese fondue', intent: { days: null }, taxonomy: tax });
  assert.deepEqual(x.mealMinutes, { dinner: 1140 }); assert.equal(x.startMinutes, null); assert.equal(x.dinnerAtClock, true);
  const y = req.extractTripRequirements({ text: 'drinks then dinner in Oliver on October 30 at 4 pm', intent: { days: null }, taxonomy: tax });
  assert.equal(y.startMinutes, 960); assert.equal(y.mealMinutes, undefined);
  assert.equal(req.extractTripRequirements({ text: 'Lunch and dinner on Saturday at 7pm', intent: { days: null }, taxonomy: tax }).dinnerAtClock, undefined);
  // Known for is read as the place's own words.
  assert.match(app.buildTripPlannerFacts(false, '2027-02-13').find((f) => f.id === fondue.id).textDesc, /cheese fondue and raclette/);
});

// ---------- 5. Closing twice a year ----------
test('closed twice a year: the "closed part of the year" screen and the seasonal help point to Every year closures and name the saved ones', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { closures: SHOULDERS }));
  assert.equal(text.en.openTwice, 'Closed twice a year, like a spring and a fall shoulder season? Add each one under Holidays & closures and tick “Every year”.');
  assert.equal(text.en.openTwiceHave, 'You already close {list} every year.');
  assert.equal(text.fr.openTwiceHave, 'Vous fermez déjà chaque année : {list}.');
  const s = CLIENT();
  assert.match(s, /\(T\.openTwice \? '<p class="su-hint su-twice">' \+ h\(T\.openTwice\) \+ \(yearlyClosed\(\)\.length \?/);
  assert.match(s, /function yearlyClosed\(\)\{ return \(S\.extra \|\| \[\]\)\.filter\(function\(c\)\{ return c && c\.yearly && c\.to && c\.to !== c\.from; \}\)/);
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  for (const q of ['shoulder season', 'closed twice a year']) {
    const id = en.best(q).id; assert.ok(['seasonal-hours', 'setup-season'].includes(id), `${q}: ${id}`);
    assert.match(en.topic(id).a, /tick <strong>Every year<\/strong>\. You already close Apr 19 – May 14 and Oct 12 – Nov 26 every year\./);
  }
  assert.match(fr.topic('setup-season').aFr, /Vous fermez déjà chaque année\u00a0: 19[ \u00a0]avr\. – 14[ \u00a0]mai et 12[ \u00a0]oct\. – 26[ \u00a0]nov\.<\/p>/);
  // The closures screen's lead is neutral.
  assert.equal(text.en.closeAddLead, 'For a seasonal break, renovations, a private event or a holiday that’s not on the list.');
  assert.match(text.fr.closeAddLead, /^Pour une pause saisonnière, des rénovations/);
});

// ---------- 6. The food list ----------
test('food list: European and Swiss & Alpine (with French); a stored "Alpine / European" is pre-picked; one ✕ in the search box; "not on the list" words', async () => {
  for (const c of ['European', 'Swiss & Alpine']) assert.ok(app.OWNER_CUISINES.includes(c), c);
  assert.equal(app.frCuisine('European'), 'Européenne'); assert.equal(app.frCuisine('Swiss & Alpine'), 'Suisse et alpine');
  const v = mk('restaurant', { cuisine: 'Alpine / European' }); const t = tokenFor(v.id);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(cfg.suggestCuisines, ['Swiss & Alpine', 'European']);
  assert.equal(cfg.cuisineIcons['Swiss & Alpine'], '🧀');
  // A label already on the list starts as it is (no suggestion).
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(mk('restaurant', { cuisine: 'Italian' }).id)}/setup`)).text).suggestCuisines, []);
  const s = CLIENT();
  assert.match(s, /if \(!S\.cuis\.length && \(C\.suggestCuisines \|\| \[\]\)\.length\) S\.cuis = C\.suggestCuisines\.filter/);
  assert.ok(!s.includes("field('suCq', T.typeToFind, S.cuiQ, { type: 'search'"), 'the browser’s own ✕ is gone');
  assert.equal((s.match(/field\('suCq', T\.typeToFind, S\.cuiQ, \{ type: 'text'/g) || []).length, 2);
  assert.match(SERVER(), /body\.owner-setup input\[type=search\]::-webkit-search-cancel-button \{ -webkit-appearance: none; appearance: none; display: none; \}/);
  assert.equal(text.en.notOnList, 'Not on the list? Pick the closest, or type it in your story.');
  assert.match(SERVER(), /body\.owner-setup \.su-tile\[hidden\] \{ display: none; \}/, 'a tile the search hides is off screen');
  // Saving the picks is allowed (they're on the list).
  ok(await change(t, { cuisines: ['Swiss & Alpine', 'European'], place_type: 'Bistro' }));
  assert.equal(app.getVenue(v.id).cuisine, 'Swiss & Alpine');
});

// ---------- 7. Small ----------
test('service dogs: ticked for her on "No dogs" with a line that says so; saved, the page says "No dogs (service dogs welcome)"', async () => {
  assert.equal(text.en.serviceDogsTicked, 'Service dogs welcome is ticked for you. Tap it to untick.');
  const s = CLIENT();
  assert.match(s, /S\.badges\.service_dogs = true; S\.sdogAuto = true; press\('service_dogs', true\);/);
  assert.match(s, /if \(k === 'service_dogs'\) \{ S\.sdogAuto = false;/);
  assert.match(s, /id="suSdogTicked" role="status"' \+ \(S\.sdogAuto && S\.noDogs && S\.badges\.service_dogs \? '' : ' hidden'\)/);
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { not_offered: ['dogs'], badges: { dog_friendly: false, service_dogs: true } }));
  assert.match(page(v), /No dogs \(service dogs welcome\)/);
});

test('reservations: research "Recommended" pre-ticks Takes reservations as a suggestion; "Walk-ins only" or an answered tile does not', async () => {
  const v = mk('restaurant'); research(v.id, [{ label: 'Reservations', text: 'Recommended' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).visitTicks, ['takes_reservations']);
  const w = mk('restaurant'); research(w.id, [{ label: 'Reservations', text: 'Walk-ins only, no reservations' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(w.id)}/setup`)).text).visitTicks, []);
  // Once she has answered the tile (ticked or unticked), research never ticks it again.
  const x = mk('restaurant'); research(x.id, [{ label: 'Reservations', text: 'Required' }]);
  ok(await change(tokenFor(x.id), { badges: { takes_reservations: true } }));
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(x.id)}/setup`)).text).visitTicks, []);
  ok(await change(tokenFor(x.id), { badges: { takes_reservations: false } }));
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(x.id)}/setup`)).text).visitTicks, [], 'unticked by her: never ticked again');
  // Only while the screen is unsaved (the client's rule, now for restaurants too).
  assert.match(CLIENT(), /if \(\(C\.winery \|\| C\.brewery \|\| C\.pub \|\| C\.restaurant\) && !S\.done\.offer && !S\.visitTicksSet\)/);
});

test('booking: a "Book online" / « Réservez en ligne » chip; the booking line’s own screen says "Saved. You can change it here."', () => {
  assert.ok(text.en.quick.reservations.includes('Book online')); assert.ok(text.fr.quick.reservations.includes('Réservez en ligne'));
  assert.ok(text.en.pub.quick.reservations.includes('Book online'));
  const s = CLIENT();
  assert.match(s, /var yn = yn0 && S\.step === step && !\(step === 'groups' && FOLD\);/, '"You said: Yes." only on the yes/no screen');
  assert.match(s, /yn \? fill\(T\.youSaid, \{ a: T\.yes \}\) : T\.alreadyDone/);
  assert.equal(text.en.alreadyDone, '✓ Saved. You can change it here.');
  // Typing straight after her own saved line gets the space (the story box's rule).
  assert.match(s, /var fx = storyJoinFix\(ln\.value, \(CUR\.visit_rows \|\| \{\}\)\[ln\.getAttribute\('data-vk'\)\] \|\| ''\);/);
});

test('Hours through the year: yearly closures of a week or more show as "Closed every year"; a one-day yearly closure does not', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const split = Object.fromEntries(DAYS.map((d) => [d, [['11:30', '14:30'], ['17:00', '22:00']]]));
  ok(await change(t, { hours_seasons: [{ from: '06-15', to: '09-15', label: '', hours: split }], closures: [...SHOULDERS, { from: '12-25', to: '12-25', note: '', yearly: true }] }));
  app.clearHoursExtraCache && app.clearHoursExtraCache();
  const html = page(v, 'en', new Date('2027-02-10T20:00:00Z'));
  const year = /<div class="venue-hours-year">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(year, 'Hours through the year');
  assert.match(year[1], /<li><span>Apr 19 – May 14<\/span><span>Closed every year \(Spring shoulder season\)<\/span><\/li>/);
  assert.match(year[1], /<li><span>Oct 12 – Nov 26<\/span><span>Closed every year \(Fall shoulder season\)<\/span><\/li>/);
  assert.match(year[1], /Jun 15 – Sep 15/);
  assert.match(year[1], /<li><span>[^<,]+, [^<,]+ and [^<,]+<\/span><span>Daily 5\s?PM – 10\s?PM<\/span><\/li>/, 'three runs read "A, B and C"');
  assert.ok(!/Dec 25<\/span><span>Closed/.test(year[1]));
  const fr = /<div class="venue-hours-year">([\s\S]*?)<\/div>/.exec(page(v, 'fr', new Date('2027-02-10T20:00:00Z')))[1];
  assert.match(fr, /Fermé chaque année<\/span>/);
  // Without a season, two long yearly closures are enough for the list.
  const w = mk('restaurant'); ok(await change(tokenFor(w.id), { closures: SHOULDERS }));
  assert.match(page(w, 'en', new Date('2027-02-10T20:00:00Z')), /venue-hours-year[\s\S]*Apr 19 – May 14<\/span><span>Closed every year/);
});

test('specials and events with their own season show out of season with their months, never as "Today"', async () => {
  const v = mk('restaurant', { happy_hour: 1 }); const t = tokenFor(v.id);
  // Friday Dec 4, 2026? No: a summer-only special seen in February.
  ok(await change(t, { specials: [{ days: ['fri'], title: 'Patio Fridays', deal: '$5 spritz', price: '$5', kind: 'drink', start: null, end: null, title_fr: null, deal_fr: null, season_from: '06-01', season_to: '08-31' }] }));
  const html = page(v, 'en', new Date('2027-02-12T20:00:00Z'));
  assert.match(html, /Patio Fridays<\/span> <span class="venue-season-tag">\(Jun–Aug\)<\/span>/);
  assert.ok(!/venue-sp is-today/.test(html), 'not "Today" out of season');
});

test('happy hour example: restaurants "$8 wine and half-price small plates", pubs keep the pints', async () => {
  assert.equal(text.en.whatsOnEx, '$8 wine and half-price small plates'); assert.equal(text.fr.whatsOnEx, 'Vin à 8 $ et petites assiettes à moitié prix');
  assert.equal(text.en.pub.whatsOnEx, '$6 pints and half-price appetizers');
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).t.whatsOnEx, '$8 wine and half-price small plates');
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text).t.whatsOnEx, '$6 pints and half-price appetizers');
});
