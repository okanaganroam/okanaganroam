// Third first-time restaurant owner test on Whistler (Jen, iPad, English, a family restaurant; Whistler Roam
// drafts/fresh-eyes-restaurant3-2026-11-15/REPORT.md). The last restaurant round. The code is shared, so the fixes are made
// here for every type: Build My Trip keeps a stated dinner time and plans one dinner, matches the day's specials
// ("kids eat free") and prefers Breakfast & Brunch places for brunch; the day card says two times a day is the most; research's
// Free parking pre-ticks for restaurants; a quick-answer chip and her own words read as two sentences; a long special shows as
// one line; "different for part of the year"; Family pre-picked from the name; the spend guess from a range's middle; help in
// the setup starts with the setup's path; the events lead says weekly or monthly.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'restaurant-wr3-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const tp = require('../trip-planner.js');
const req = require('../trip-requirements.js');
const di = require('../discovery-intent.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = (o, c) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[o, c]]])));
// Jen's hours: Sat/Sun 8–3 and 4:30–9, weekdays 11:30–3 and 4:30–9.
const JEN = Object.fromEntries(DAYS.map((d) => [d, d === 'sat' || d === 'sun' ? [['08:00', '15:00'], ['16:30', '21:00']] : [['11:30', '15:00'], ['16:30', '21:00']]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Creek Test ${++n}`, slug: `creek-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0188', website: 'https://example.com', hours: JSON.stringify(JEN),
  description: 'A fixture used only by the third restaurant fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.11.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const clientSlice = (from, to, ctx, tail) => { const s = CLIENT(); vm.runInNewContext(s.slice(s.indexOf(from), s.indexOf(to)) + tail, ctx); return ctx; };
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const KIDS_FREE = { days: ['mon'], title: 'Kids eat free', deal: 'One kids meal per adult main', price: null, kind: 'food', start: '16:30', end: 'close', title_fr: null, deal_fr: null, season_from: null, season_to: null };
const TUE_OFF = { ...JEN, tue: [] };
// Jen's place: closed Tuesdays Oct 13 – Nov 26, kitchen 8:30, Monday "Kids eat free" from 4:30, Breakfast & Brunch.
async function jensPlace(region, extra = {}) {
  const v = mk('restaurant', { name: `Orchard Family Kitchen ${region}`, slug: `orchard-family-kitchen-${region}`, region, cuisine: 'Breakfast & Brunch', price: '$$', description: 'Wood-fired pizza and weekend brunch.', ...extra });
  ok(await change(tokenFor(v.id), { hours: JEN, hours_checked: true, hours_seasons: [{ from: '10-13', to: '11-26', label: '', hours: TUE_OFF }], pub_info: { kitchen: { mode: 'earlier', closes: '20:30', note: '' } }, specials: [KIDS_FREE] }));
  return v;
}

// ---------- 1. Build My Trip ----------
test('Build My Trip: "Family dinner … Monday at 5:30pm … somewhere kids eat free" is one dinner at 5:30 at the place whose Monday special is Kids eat free', async () => {
  const jen = await jensPlace('summerland', { latitude: 49.6, longitude: -119.67, address: '1 Main St, Summerland' });
  // A busier, higher-rated kid-friendly restaurant nearby with no special.
  mk('restaurant', { name: 'Summerland Grill House', slug: 'summerland-grill-house', region: 'summerland', latitude: 49.601, longitude: -119.671, address: '3 Main St, Summerland', rating: 4.9, reviews: 900, kid_friendly: 1, hours: WEEK('11:00', '22:00'), description: 'Family friendly grill.' });
  const r = await plan('Family dinner in Summerland on Monday December 13 2027 at 5:30pm with two young kids, somewhere kids eat free');
  const rows = (r.schedule || []).filter((x) => Number.isFinite(x.startMinutes));
  assert.equal(rows.length, 1, `one dinner, no second "restaurants" stop: ${JSON.stringify(rows)}`);
  assert.equal(rows[0].venueId, jen.id, JSON.stringify([r.summary, r.warnings]));
  assert.equal(rows[0].startMinutes, 17 * 60 + 30, 'dinner starts at the time she gave');
  assert.ok(rows[0].endMinutes <= 20 * 60 + 30, 'the kitchen time (#876) still ends it');
  assert.ok(!(r.warnings || []).some((w) => /“free”/.test(w)), `"free" was used: ${JSON.stringify(r.warnings)}`);
  assert.ok(!((r.understood && r.understood.notUsed) || []).includes('free'));
  const stop = [...((r.itinerary && r.itinerary.stops) || [])].find((s) => s.venue && s.venue.id === jen.id);
  assert.ok((stop.reasons || []).some((x) => /Monday special: Kids eat free/.test(x.text)), JSON.stringify(stop.reasons));
  // The parts: one dinner part (the eating word is that meal), and the clock is dinner's (#872/#877 parsing kept).
  const tax = app.buildDiscoveryTaxonomy();
  const q = 'Family dinner in Summerland on Monday December 13 2027 at 5:30pm with two young kids, somewhere kids eat free';
  const trip = di.interpretTripComponents(q, tax, di.interpretDiscoveryQuery(q, tax, { tripPlanner: true }));
  assert.equal(trip.components.length, 1); assert.equal(trip.components[0].meal, 'dinner'); assert.equal(trip.multi, true);
  const x = req.extractTripRequirements({ text: q, intent: { days: null }, taxonomy: { regions: ['summerland'], regionLabels: { summerland: 'Summerland' } } });
  assert.deepEqual(x.mealMinutes, { dinner: 1050 }); assert.equal(x.dinnerAtClock, true);
  // A request with two real parts keeps both ("dinner and drinks").
  const two = 'dinner and drinks in Summerland on Friday';
  assert.equal(di.interpretTripComponents(two, tax, di.interpretDiscoveryQuery(two, tax, { tripPlanner: true })).components.length, 2);
});

test('Build My Trip: a closed shoulder-season Tuesday still leaves her out; another Monday without the words plans dinner as before', async () => {
  const jen = await jensPlace('peachland', { latitude: 49.77, longitude: -119.73, address: '1 Beach Ave, Peachland' });
  mk('restaurant', { name: 'Peachland Lakeside Diner', slug: 'peachland-lakeside-diner', region: 'peachland', latitude: 49.771, longitude: -119.731, address: '3 Beach Ave, Peachland', hours: WEEK('11:00', '22:00'), kid_friendly: 1 });
  const tue = await plan('Family dinner in Peachland on Tuesday November 16 2027 at 5:30pm with two young kids, somewhere kids eat free');
  assert.ok(!(tue.schedule || []).some((x) => x.venueId === jen.id), JSON.stringify(tue.schedule));
  assert.ok(!(tue.recommendations || []).some((x) => x.venue && x.venue.id === jen.id));
  // The special's words only count on its day: on a Tuesday "free" is still a word the plan couldn't use.
  assert.ok((tue.warnings || []).some((w) => /“free”/.test(w)) || !(tue.schedule || []).length, JSON.stringify(tue.warnings));
});

test('Build My Trip: specials are matched by their own words on the plan’s day ("kids eat free", "wing night", "taco tuesday"); one word or another day is not', () => {
  const v = { specials: [{ days: ['mon'], title: 'Kids eat free', deal: 'One kids meal per adult main' }, { days: ['wed'], title: 'Wing Night', deal: '60¢ wings' }, { days: ['tue'], title: 'Taco Tuesday', deal: '3 tacos' }, { days: ['thu'], title: 'Burgers', deal: '$12 burger' }] };
  const ctx = (q, weekday, date) => ({ queryText: q, startWeekday: weekday, tripDate: date });
  assert.equal(tp.specialPhraseMatch(v, ctx('somewhere kids eat free', 'mon', '2027-12-13')).title, 'Kids eat free');
  assert.equal(tp.specialPhraseMatch(v, ctx('somewhere kids eat free', 'tue', '2027-12-14')), null, 'not on Tuesday');
  assert.equal(tp.specialPhraseMatch(v, ctx('wing night with friends', 'wed', '2027-12-15')).title, 'Wing Night');
  assert.equal(tp.specialPhraseMatch(v, ctx('taco tuesday', 'tue', '2027-12-14')).title, 'Taco Tuesday');
  assert.equal(tp.specialPhraseMatch(v, ctx('burgers on thursday', 'thu', '2027-12-16')), null, 'a one-word special is the food words’ job');
  assert.equal(tp.specialPhraseMatch(v, ctx('kids eat free', null, null)).title, 'Kids eat free', 'undated: any day');
  // A longer line matches by its first part (and a line stored cut mid-sentence too).
  const cut = { specials: [{ days: ['mon'], title: 'Kids eat free, one kids meal per adult', deal: 'main' }] };
  assert.equal(tp.specialPhraseMatch(cut, ctx('somewhere kids eat free', 'mon', '2027-12-13')).phrase, 'Kids eat free');
  assert.equal(tp.specialPhraseMatch({ specials: [{ days: ['wed'], title: 'Wing night - 60¢ wings and $6 pints', deal: 'dine in only' }] }, ctx('wing night in kelowna', 'wed', '2027-12-15')).phrase, 'Wing night');
});

test('Build My Trip: "Family Saturday brunch at 9am" puts the Breakfast & Brunch restaurant open at 8 ahead of a café that only says brunch', async () => {
  const jen = await jensPlace('oliver', { latitude: 49.18, longitude: -119.55, address: '1 Main St, Oliver' });
  mk('cafe', { name: 'Oliver Brunch Cafe', slug: 'oliver-brunch-cafe', region: 'oliver', latitude: 49.181, longitude: -119.551, address: '3 Main St, Oliver', rating: 4.9, reviews: 300, hours: null, description: 'Coffee, pastries and brunch.' });
  const r = await plan('Family Saturday brunch in Oliver at 9am on Saturday December 11 2027');
  const ids = [...(r.recommendations || []).map((x) => x.venue && x.venue.id), ...(r.schedule || []).map((x) => x.venueId)].filter(Boolean);
  assert.equal(ids[0], jen.id, JSON.stringify([r.kind, r.summary, (r.recommendations || []).map((x) => x.venue.name)]));
  const first = (r.recommendations || [])[0] || ((r.itinerary && r.itinerary.stops) || [])[0];
  assert.ok((first.reasons || []).some((x) => /Listed cuisine: Breakfast & Brunch/.test(x.text)), JSON.stringify(first.reasons));
});

// ---------- 2. Two times a day ----------
test('two times a day: the day card says so under a day with two times (EN/FR); the help answers "third time", "brunch hours", « troisième plage »', async () => {
  assert.equal(text.en.twoTimesMax, 'Up to two times a day. Breakfast runs into lunch? Start the first time earlier (for example 8 AM – 3 PM).');
  assert.equal(text.fr.twoTimesMax, 'Jusqu’à deux plages par jour. Le déjeuner se poursuit jusqu’au dîner ? Faites commencer la première plage plus tôt (par exemple 8 h – 15 h).');
  assert.match(CLIENT(), /\(w\.length >= 2 && T\.twoTimesMax \? '<p class="su-hint su-twotimes">' \+ h\(T\.twoTimesMax\) \+ '<\/p>' : ''\)/);
  assert.match(CLIENT(), /\(w\.length < 2 && T\.addSecond \?/, 'the button is still there for one time');
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  for (const q of ['I need a third time on Saturday for breakfast', 'third time', 'breakfast hours', 'brunch hours', 'add brunch', 'how do I add weekend brunch hours']) assert.equal(en.best(q).id, 'setup-third-time', q);
  for (const q of ['troisième plage', 'heures du brunch']) assert.equal(fr.best(q).id, 'setup-third-time', q);
  const tp0 = en.topic('setup-third-time');
  assert.match(tp0.a, /^<p>Right here in setup: <strong>Hours<\/strong>/);
  assert.match(tp0.a, /Up to two times a day\. Breakfast runs into lunch\? Start the first time earlier \(for example 8 AM – 3 PM\)\./);
  assert.match(tp0.aFr, /Jusqu’à deux plages par jour\. Le déjeuner se poursuit jusqu’au dîner \?/);
  // Unchanged: split shifts and the kitchen.
  assert.equal(en.best('split shift').id, 'setup-split-hours');
  assert.equal(en.best('when does the kitchen close').id, 'restaurant-kitchen');
  assert.match(en.topic('setup-split-hours').a, /Up to two times a day/);
});

// ---------- 3. Free parking from research ----------
test('Free parking: research’s Good to know "Free parking" pre-ticks the tile for restaurants (with Takes reservations); not once she answered it', async () => {
  const v = mk('restaurant');
  research(v.id, [{ label: 'Reservations', text: 'Recommended on weekends' }, { label: 'Good to know', text: 'Free parking' }, { label: 'Kids & dogs', text: 'Very family friendly' }]);
  const cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.ok(cfg.visitTicks.includes('free_parking'), JSON.stringify(cfg.visitTicks));
  assert.ok(cfg.visitTicks.includes('takes_reservations'));
  assert.ok(JSON.stringify(cfg.offerGroups).includes('free_parking'), 'restaurants have the tile');
  // Nothing is saved by the suggestion.
  assert.ok(!app.getVenue(v.id).free_parking);
  // Her own answer wins: ticked, then unticked (logged as hers), it is never suggested again.
  ok(await change(tokenFor(v.id), { badges: { free_parking: true } }));
  assert.ok(!cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).visitTicks.includes('free_parking'));
  ok(await change(tokenFor(v.id), { badges: { free_parking: false } }));
  assert.ok(!cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).visitTicks.includes('free_parking'));
  // The client only uses it while "What you offer" is unanswered.
  assert.match(CLIENT(), /if \(\(C\.winery \|\| C\.brewery \|\| C\.pub \|\| C\.restaurant\) && !S\.done\.offer && !S\.visitTicksSet\)/);
});

// ---------- 4. Quick answer + her own words ----------
test('quick answers: "Patio only" then her own sentence reads "Patio only. Dogs welcome…"; her own words are never changed', () => {
  const run = (prev, typed, sep = '. ') => {
    const box = { value: prev + typed, selectionStart: (prev + typed).length, setSelectionRange(a) { this.selectionStart = a; } };
    const c = clientSlice('  var quickJoin = function(', "  screen.addEventListener('focusin'", {}, 'this.f = quickJoin;');
    const res = c.f(box, prev, ['Patio only', 'Inside too', 'Takeout', 'Delivery', 'No dogs'], sep);
    return { value: box.value, res, at: box.selectionStart };
  };
  assert.equal(run('Patio only', 'D').value, 'Patio only. D');
  assert.equal(run('Patio only', 'D').at, 'Patio only. D'.length, 'the cursor stays after her letter');
  assert.equal(run('Patio only', ' ').res, 'wait', 'a space first waits for her next letter');
  assert.equal(run('Patio only', ' D').value, 'Patio only. D');
  assert.equal(run('Patio only. Inside too', 'W').value, 'Patio only. Inside too. W', 'two chips');
  assert.equal(run('Takeout', 'U', ', ').value, 'Takeout, U', 'takeout chips join with a comma');
  // Her own words before, a full stop she typed, or typing that isn't at the end: left exactly as they are.
  assert.equal(run('Dogs on the patio', 'X').value, 'Dogs on the patioX');
  assert.equal(run('Patio only.', 'D').value, 'Patio only.D');
  assert.equal(run('Patio only', ', not inside').value, 'Patio only, not inside');
  const box = { value: 'Dogs welcome', selectionStart: 3, setSelectionRange() {} };
  const c = clientSlice('  var quickJoin = function(', "  screen.addEventListener('focusin'", {}, 'this.f = quickJoin;');
  assert.equal(c.f(box, 'Patio only', ['Patio only'], '. '), false); assert.equal(box.value, 'Dogs welcome', 'replaced text is hers');
  // Wired to the box: the value before her typing is remembered on focus and after each chip tap.
  assert.match(CLIENT(), /box\.value = v\.slice\(0, 180\); box\._qPrev = box\.value; mark\(\);/);
  assert.match(CLIENT(), /screen\.addEventListener\('focusin', function\(e\)\{ if \(e\.target && e\.target\.id && screen\.querySelector\('\[data-quick\]\[data-box="' \+ e\.target\.id \+ '"\]'\)\) e\.target\._qPrev = e\.target\.value; \}\);/);
});

// ---------- 5. A long special ----------
test('specials: "Kids eat free, one kids meal per adult main" stored cut mid-line shows as one line on the page and in the planner line; new lines split at a clear separator', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { specials: [{ ...KIDS_FREE, title: 'Kids eat free, one kids meal per adult', deal: 'main' }] }));
  const html = page(v);
  assert.match(html, /class="venue-sp-title">Kids eat free, one kids meal per adult main</);
  assert.doesNotMatch(html, /class="venue-sp-deal">main</);
  assert.equal(app.specialLine({ ...KIDS_FREE, title: 'Kids eat free, one kids meal per adult', deal: 'main', source: 'venue_owner' }, false).text, 'Kids eat free, one kids meal per adult main');
  // A title and deal that were meant as two (research's, or a short title) are unchanged.
  assert.equal(app.specialLine({ title: 'Wing Wednesday', deal: '60¢ wings', price: null }, false).text, 'Wing Wednesday · 60¢ wings');
  assert.equal(app.specialLine({ title: 'Prime rib dinner served every Sunday', deal: 'with yorkshire pudding', price: null, source: 'https://example.com/specials' }, false).text, 'Prime rib dinner served every Sunday · with yorkshire pudding');
  // The setup's split: a clear separator first; a comma never splits; a line with none is still cut between words.
  const line = /( {6}var t1 = text, rest = '';\n {6}if \(text\.length > 40\).*\n)/.exec(CLIENT())[1];
  const split = new Function('text', `${line}; return [t1, rest || text];`);
  assert.deepEqual(split('Kids eat free · one kids meal per adult main course'), ['Kids eat free', 'one kids meal per adult main course']);
  assert.deepEqual(split('Wing night: 60¢ wings and $6 pints all night long'), ['Wing night', '60¢ wings and $6 pints all night long']);
  assert.deepEqual(split('Prime rib Sunday - slow roasted with all the fixings'), ['Prime rib Sunday', 'slow roasted with all the fixings']);
  const [a, b] = split('Kids eat free, one kids meal per adult main');
  assert.equal(`${a} ${b}`, 'Kids eat free, one kids meal per adult main');
  assert.deepEqual(split('Buy 9, get the 10th free (loyalty card)'), ['Buy 9, get the 10th free (loyalty card)', 'Buy 9, get the 10th free (loyalty card)']);
});

// ---------- 6. Small ----------
test('year question: "No, different for part of the year (like shoulder season)" opens the season screen with no months and the date boxes; summer/winter stay', () => {
  assert.equal(text.en.allYearPart, 'No, different for part of the year (like shoulder season)');
  assert.equal(text.fr.allYearPart, 'Non, c’est différent une partie de l’année (comme l’intersaison)');
  assert.equal(text.en.allYearSummer, 'No, different in summer'); assert.equal(text.en.allYearWinter, 'No, different in winter');
  const s = CLIENT();
  assert.match(s, /big\('❄️', T\.allYearWinter, T\.allYearWinterSub, true, 'yearSeason:winter'\)\n[^\n]*\n[^\n]*\n {10}\+ \(T\.allYearPart \? big\('🍂', T\.allYearPart, T\.allYearPartSub, true, 'yearSeason:part'\) : ''\)\)/);
  // Shown only where summer/winter are (no stored season: #872's "Change my … hours" otherwise).
  assert.match(s, /\(stS\.length \? stS\.map\(function\(st\)\{ return big\('✎', fill\(T\.seaChange, st\), T\.seaChangeSub, true, 'yearSeasonEdit:' \+ st\.i\); \}\)\.join\(''\)[\s\S]{0,400}? : big\('☀️'/);
  // No months, the date boxes open, the usual week to start from.
  const S = { sea: { kind: '', week: null, months: { 6: true } }, week: { mon: [['11:30', '15:00']] } };
  const ctx = { S, CUR: { hours_seasons: [] }, SEA_MONTHS: { summer: [6, 7, 8], winter: [11, 12, 1, 2, 3, 4] }, clone: (x) => JSON.parse(JSON.stringify(x)), v: 'part' };
  const body = /if \(k === 'yearSeason'\) \{\n {6}if \(S\.sea\.kind !== v \|\| !S\.sea\.week\) \{([\s\S]*?)\n {6}\}\n/.exec(s)[1];
  vm.runInNewContext(`if (S.sea.kind !== v || !S.sea.week) {${body}}`, ctx);
  assert.equal(JSON.stringify(S.sea.months), '{}'); assert.equal(JSON.stringify(S.sea.exact), '{"from":"","to":""}'); assert.equal(JSON.stringify(S.sea.week), '{"mon":[["11:30","15:00"]]}'); assert.equal(S.sea.kind, 'part');
});

test('year question: a shoulder season picked by dates saves with no season name and shows by its dates', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  ok(await change(t, { hours: JEN, hours_checked: true, hours_seasons: [{ from: '10-13', to: '11-26', label: '', hours: TUE_OFF }] }));
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.hours_seasons[0].from, '10-13'); assert.equal(cfg.cur.hours_seasons[0].label || '', '');
  assert.equal((JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-11-16')).tue || []).length, 0, 'closed on a shoulder Tuesday');
  assert.equal((JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-12-14')).tue || []).length, 2, 'lunch and dinner on a December Tuesday');
});

test('Family: "Family Kitchen" or "a family restaurant" pre-picks Family on the place screen as a suggestion; never over a stored kind', async () => {
  const a = mk('restaurant', { name: 'Creekside Family Kitchen', slug: 'creekside-family-kitchen' });
  assert.equal(cfgOf((await get(`/owner/${tokenFor(a.id)}/setup`)).text).suggestPlace, 'Family');
  const b = mk('restaurant', { description: 'A family restaurant with pizza.' });
  assert.equal(cfgOf((await get(`/owner/${tokenFor(b.id)}/setup`)).text).suggestPlace, 'Family');
  const c = mk('restaurant', { name: 'Sushi Bar Test', slug: 'sushi-bar-test', description: 'Sushi and sake.' });
  assert.equal(cfgOf((await get(`/owner/${tokenFor(c.id)}/setup`)).text).suggestPlace, '');
  ok(await change(tokenFor(a.id), { cuisines: ['Pizza'], place_type: 'Casual' }));
  assert.equal(cfgOf((await get(`/owner/${tokenFor(a.id)}/setup`)).text).suggestPlace, '', 'her answer stays');
  assert.equal(app.getVenue(b.id).place_type || null, null, 'nothing saved');
  const s = CLIENT();
  assert.match(s, /if \(C\.restaurant && !S\.place && C\.suggestPlace\) \{ S\.place = C\.suggestPlace; S\.kindGuessed = C\.suggestPlace; \}/);
  assert.match(s, /C\.restaurant && T\.placeGuess && S\.kindGuessed && S\.place === S\.kindGuessed && !CUR\.place_type/);
  assert.equal(text.en.placeGuess, 'We picked “{kind}” from your listing. Tap another one if it’s not right. Nothing is saved until you tap Save.');
  // A pub never gets it.
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('pub', { name: 'Family Pub Test', slug: 'family-pub-test' }).id)}/setup`)).text).suggestPlace, undefined);
});

test('spend: "Mains $20–$30" starts at $26 (the middle, on the $2 steps); "Burgers from $19" stays $19', async () => {
  const v = mk('restaurant'); research(v.id, [{ label: 'Prices', text: 'Mains $20–$30' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).suggestSpend, 26);
  const f = mk('restaurant'); research(f.id, [{ label: 'Prices', text: 'Plats 20 $ à 30 $' }]);
  assert.equal(cfgOf((await get(`/fr/owner/${tokenFor(f.id)}/setup`)).text).suggestSpend, 26);
  const p = mk('pub'); research(p.id, [{ label: 'Prices', text: 'Burgers from $19' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(p.id)}/setup`)).text).suggestSpend, 19);
});

test('help in setup starts with the setup’s path: hours, "kids eat free", events (EN/FR); the edit page is unchanged', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  const ans = (bot, q, l = 'a') => { const b = bot.best(q); assert.ok(b.id, q); return { id: b.id, a: bot.topic(b.id)[l] }; };
  for (const [q, id] of [['How do I change my hours?', 'hours'], ['how do I add a kids eat free special', 'specials'], ['kids eat free', 'specials'], ['our event is twice a month', 'event-repeat'], ['add an event', 'event-add'], ['how often', 'weekly-nights']]) {
    const r = ans(en, q); assert.equal(r.id, id, q); assert.match(r.a, /^<p>Right here in setup: /, q); assert.doesNotMatch(r.a.split('edit page')[0], /On your edit page/, q);
  }
  for (const [q, id] of [['Comment changer mes heures?', 'hours'], ['les enfants mangent gratuitement', 'specials'], ['à quelle fréquence', 'weekly-nights']]) {
    const r = ans(fr, q, 'aFr'); assert.equal(r.id, id, q); assert.match(r.a, /^<p>Ici même, dans la configuration : /, q);
    assert.ok(!/\S[?!;:](\s|<|$)/.test(r.a.replace(/<[^>]+>/g, ' ')), `French spacing: ${r.a}`);
  }
  // A one-off event still points to the edit page, after the setup's Weekly events.
  assert.match(en.topic('event-add').a, /A one-off event on a single date/);
  // The edit page keeps its own answers.
  const edit = helpBot((await get(`/owner/${t}`)).text);
  assert.doesNotMatch(edit.topic('hours').a, /Right here in setup/);
  assert.doesNotMatch(edit.topic('specials').a, /Right here in setup/);
});

test('events lead: "Anything on regularly? Weekly or monthly." (FR « Quelque chose de régulier ? Chaque semaine ou chaque mois. »); the happy hour question is a question', () => {
  assert.equal(text.en.musicQ, 'Anything on regularly? Weekly or monthly.');
  assert.equal(text.fr.musicQ, 'Quelque chose de régulier ? Chaque semaine ou chaque mois.');
  assert.equal(text.en.happyQ, 'Do you have a happy hour?');
  // Cafés, lounges and distilleries keep their own.
  assert.equal(text.en.cafe.musicQ, 'Anything on at your café?');
});
