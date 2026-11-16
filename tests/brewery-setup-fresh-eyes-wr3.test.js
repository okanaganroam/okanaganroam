// Third first-time BREWERY owner test on Whistler (Priya, a taproom with no kitchen, two stretches of other hours, iPhone,
// English; Whistler Roam drafts/fresh-eyes-brewery3-2026-11-16/REPORT.md). The code is shared, so the fixes are made here:
//  1. back on the year question with stretches stored: a first button keeps them (no "Remove your other hours?");
//  2. Build My Trip: a place's own listed live music is planned at its start time, found with a time in the request,
//     and a badge is never the reason on a day the music isn't on;
//  3. the happy hour (and events) heads-up names days closed only in a stretch apart from days closed all year;
//  4. Build My Trip names: accents without the bracket part, French words inside a name, a "." inside a name; "run
//     club" as one term; the closed note's exact dates;
//  5. a doubled web address keeps the last one (setup and server);
//  6. "tap list" words on the menu step and the edit page's banner for a taproom with no kitchen;
//  7. "Weekly events" on a brewery's edit page, venue page and tab (pubs keep "nights");
//  8. help: bring your own food, and when photos show up;
//  9. the last screen's French-only line when there is no French story;
// 10. the small ones.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'brewery-wr3-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const frCopy = require('../trip-french-copy.js');
const frTrip = require('../trip-planner-fr.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c, closed = []) => Object.fromEntries(DAYS.map((d) => [d, closed.includes(d) ? [] : [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Chief Test ${++n}`, slug: `chief-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('11:00', '23:00')),
  description: 'A fixture used only by the third Whistler brewery fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const getJson = (p) => fetch(base + p).then((r) => r.json());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.17.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const setupCfg = async (t, fr = false) => cfgOf((await get(`${fr ? '/fr' : ''}/owner/${t}/setup`)).text);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
// A link sent from the setup is checked first: approve it, as the reviewer would.
const approveLink = (id) => { const pend = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' AND instant = 0").get(id); assert.ok(pend, 'a change is waiting'); assert.equal(app.approveOwnerChange(pend.id, 'dayton').ok, true); };
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const SERVER = () => fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
// A help answer as plain words (tags taken out with no space added, so "<em>no cover</em>." stays "no cover.").
const bare = (h) => String(h).replace(/<\/p><p>/g, ' ').replace(/<\/li><li>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const stopsOf = (p) => ((p.outing && p.outing.stops) || (p.itinerary && p.itinerary.stops) || []).map((x) => ({ label: x.label, name: x.venue && x.venue.name, reasons: (x.reasons || []).map((r) => r.text || r), venue: x.venue }));
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
// One function (or a run of lines) of the setup page's script, run on its own.
const clientPart = (from, to, ctx, tail = '') => { const s = CLIENT(); const a = s.indexOf(from), b = s.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, `client part ${from}`); vm.runInNewContext(s.slice(a, b) + tail, ctx); return ctx; };
// 3 PM Pacific on a date (PDT from mid-March to early November).
const at = (date, hm = '15:00') => new Date(`${date}T${hm}:00${/-(0[4-9]|10)-|-03-(1[5-9]|[23]\d)|-11-01/.test(date) ? '-07:00' : '-08:00'}`);


const layout = require('../food-drink-venue-layout.js');
const TEXT_SRC = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-text.js'), 'utf8');

// Priya's taproom: closed Monday and Tuesday; a fall stretch (Oct 13 – Nov 26) and a spring one (Apr 13 – May 20) that
// also closes Wednesday; snacks only, outside food welcome; a run club on Wednesdays and live music on the first Friday.
const U = (o, c) => ({ mon: [], tue: [], wed: [[o, c]], thu: [[o, c]], fri: [[o, c]], sat: [[o, c]], sun: [[o, c]] });
const USUAL = U('12:00', '22:00');
const FALL = { label: '', from: '10-13', to: '11-26', hours: U('12:00', '20:00') };
const SPRING = { label: '', from: '04-13', to: '05-20', hours: { ...U('12:00', '20:00'), wed: [] } };
const RESEARCH = [{ label: 'Known for', text: 'Small-batch ales and lagers near the lake' }, { label: 'Prices', text: 'Pints from $8, flights $13' }, { label: 'Kids & dogs', text: 'Dogs welcome inside; kids until 8 PM' },
  { label: 'Food', text: 'Full kitchen with burgers and tacos' }, { label: 'Events', text: 'Run club Wednesdays at 6 PM' }, { label: 'Good to know', text: 'Free parking out front' }];
const NIGHTS = [{ days: ['wed'], kind: 'run_club', title: 'Run club', start: '18:00', frequency: 'weekly' }, { days: ['fri'], kind: 'live_music', title: 'Live music', detail: 'Local bands, no cover', start: '19:00', frequency: 'monthly-1st' }];
const priya = async (o = {}, opts = {}) => {
  const v = mk('brewery', { name: opts.name || `Priya Fixture ${n + 1}`, region: opts.region || 'kelowna', price: '$$', rating: 4.6, reviews: 420, patio: 1, dog_friendly: 1, kid_friendly: 1, happy_hour: 1, sports_tv: 1, live_music: 1, great_groups: 1, vegan: 1, ...o });
  research(v.id, RESEARCH);
  const t = tokenFor(v.id);
  if (opts.bare) return { v, t };
  ok(await change(t, { hours: USUAL, hours_checked: true }));
  ok(await change(t, { hours_seasons: [FALL, SPRING] }));
  if (!opts.noFood) ok(await change(t, { place_type: 'Brewery', brewery_info: { food: 'snacks', outside: 'yes' } }));
  if (!opts.noNights) ok(await change(t, { weekly_nights: NIGHTS }));
  return { v, t };
};
// The first Friday of February 2027 (her music night) and the second (not her night).
const FRI1 = 'Friday February 5', FRI2 = 'Friday February 12';

// ====================== 1. The year question with stretches stored ======================
test('year question with other hours stored: the first button keeps them, and "Yes, all year" is the second (EN + FR)', async () => {
  assert.equal(text.en.yearKeep, 'No change, keep my other hours');
  assert.match(text.fr.yearKeep, /^Aucun changement, garder mes autres heures$/);
  const s = CLIENT();
  // The keep button comes first and only with stored stretches; it saves as "No, keep them" does, with no question.
  assert.match(s, /\(stS\.length && T\.yearKeep \? big\('✓', T\.yearKeep, '', false, 'yearKeep'\) : ''\) \+ big\(stS\.length && T\.yearKeep \? '✕' : '✓', T\.allYearYes, '', !!\(stS\.length && T\.yearKeep\), 'yearAll'\)/);
  assert.match(s, /if \(k === 'yearKeep' \|\| k === 'yearDropKeep'\) \{ S\.seaList\.forEach/);
  assert.match(s, /if \(k === 'yearAll' && storedSeas\(\)\.length\) \{ S\.dropI = null; return go\('hours:yeardrop'\); \}/, '"Yes, all year" still asks first');
  // Every setup type gets the words (the hours step is shared).
  const { t } = await priya();
  for (const [type, fr] of [['pub', false], ['restaurant', false], ['cafe', true], ['winery', false], ['cocktail', false], ['distillery', true]]) {
    const v = mk(type); const page = (await get(`${fr ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`)).text;
    assert.ok(page.includes(fr ? 'Aucun changement, garder mes autres heures' : 'No change, keep my other hours'), type);
  }
  assert.ok((await get(`/owner/${t}/setup`)).text.includes('No change, keep my other hours'));
});

// ====================== 2. Build My Trip and her live music night ======================
test('Build My Trip: live music on her first Friday is one stop at 7 PM, with its listing line and no badge line; the request is met', async () => {
  const { v } = await priya({}, { name: 'Stawamus Taproom Fixture', region: 'osoyoos' });
  mk('brewery', { name: 'Badge Only Brewing Fixture', region: 'osoyoos', live_music: 1, rating: 4.8, reviews: 900 });
  mk('brewery', { name: 'Plain Brewing Fixture', region: 'osoyoos', rating: 4.5 });
  const p = await plan(`Live music at a brewery in Osoyoos on ${FRI1}`);
  const st = stopsOf(p);
  assert.equal(st.length, 1, JSON.stringify(st.map((x) => x.name)));
  assert.equal(st[0].name, v.name);
  assert.ok(st[0].reasons.includes('Live music on Friday from 7 PM, from its listing'), st[0].reasons.join(' | '));
  assert.ok(!st[0].reasons.some((r) => /Live Music badge/.test(r)), st[0].reasons.join(' | '));
  assert.deepEqual((p.schedule || []).map((r) => r.startMinutes), [19 * 60], JSON.stringify(p.schedule));
  assert.ok((p.notes || []).some((x) => /lists live music that night on its own page/.test(x)));
  assert.ok(!(p.warnings || []).some((w) => /^Not met: live music/.test(w)), (p.warnings || []).join(' | '));
  assert.equal((p.requirementResults || []).find((i) => i.kind === 'event').status, 'satisfied');
  // "in the evening" keeps the music (it was dropped, with "No live-music is listed on What's On for the evening").
  const eve = await plan(`Live music at a brewery in Osoyoos on ${FRI1} in the evening`);
  assert.deepEqual(stopsOf(eve).map((x) => x.name), [v.name]);
  assert.ok(!(eve.warnings || []).some((w) => /No live-music is listed|Not met: live music/.test(w)), (eve.warnings || []).join(' | '));
  assert.deepEqual((eve.schedule || []).map((r) => r.startMinutes), [19 * 60]);
});

test('Build My Trip: "live music … at 7 PM" lists her night as What’s On does; the second Friday never says the badge is why for her', async () => {
  const { v } = await priya({}, { name: 'Stawamus Second Fixture', region: 'oliver' });
  const badge = mk('brewery', { name: 'Badge Only Oliver Fixture', region: 'oliver', live_music: 1, rating: 4.8, reviews: 900 });
  const p = await plan(`Live music in Oliver on ${FRI1} at 7 PM`);
  assert.equal(p.kind, 'events');
  const ev = (p.events || []).find((e) => e.venueId === v.id);
  assert.ok(ev, JSON.stringify(p.events));
  assert.equal(ev.name, `Live music at ${v.name}`); assert.equal(ev.time, '7 PM'); assert.equal(ev.dateLabel, 'Fri Feb 5'); assert.match(ev.url, /\/oliver\/breweries\//);
  assert.ok(!(p.warnings || []).some((w) => /^Not met: live music/.test(w)));
  assert.ok((p.notes || []).some((x) => /list live music that night on their own page/.test(x)));
  // Not her night: nothing listed for her, and the plan never gives her badge as the reason.
  const p2 = await plan(`Live music in Oliver on ${FRI2} at 7 PM`);
  assert.ok(!(p2.events || []).some((e) => e.venueId === v.id));
  const it2 = await plan(`Live music at a brewery in Oliver on ${FRI2}`);
  const s2 = stopsOf(it2);
  assert.ok(!s2.some((x) => x.name === v.name && x.reasons.some((r) => /Live Music badge/.test(r))), JSON.stringify(s2));
  // A badge-only place with no listed nights may stand in, worded honestly.
  const b = s2.find((x) => x.name === badge.name);
  assert.ok(b, JSON.stringify(s2.map((x) => x.name)));
  assert.ok(b.reasons.includes('Has the Live Music badge; no music nights are listed, so check before you go'), b.reasons.join(' | '));
  assert.ok(!b.reasons.includes('Has the Live Music badge'));
  // French copy for the new lines.
  assert.match(frCopy.t3FrenchText('No one-off live-music event is on What’s On for that date, so this is a place that lists live music that night on its own page.'), /^Aucun spectacle de musique ponctuel/);
  assert.match(frCopy.t3FrenchText('Has the Live Music badge; no music nights are listed, so check before you go'), /^A le badge Musique en direct; aucune soirée de musique/);
  assert.match(frCopy.t3FrenchText('These are places that list live music that night on their own page; check with them before you go.'), /^Ces endroits annoncent de la musique en direct/);
});

// ====================== 3. The closed-day heads-up ======================
test('happy hour and events heads-up: days closed all year and days closed only in a stretch are named apart (EN + FR)', () => {
  assert.equal(text.en.closedWarnMix, ', and on {days} {when}');
  assert.equal(text.fr.closedWarnMix, ', et le {days} {when}');
  const s = CLIENT();
  assert.match(s, /var seaOnly = all\.filter\(function\(d\)\{ return inUsual\.indexOf\(d\) < 0; \}\);/);
  assert.match(s, /if \(inUsual\.length && seaOnly\.length && T\.closedWarnMix\) \{/);
  assert.match(s, /days: daysInFull\(inUsual\) \+ fill\(T\.closedWarnMix, \{ days: daysInFull\(seaOnly\), when: wl \}\), when: '' \}/);
  // The sentence she reads: "…closed on Monday and Tuesday, and on Wednesday from Apr 13 to May 20."
  const days = 'Monday and Tuesday' + fill(text.en.closedWarnMix, { days: 'Wednesday', when: 'from Apr 13 to May 20' });
  assert.equal(fill(text.en.closedWarnHappy, { days, when: '' }), 'Heads up: you’re closed on Monday and Tuesday, and on Wednesday from Apr 13 to May 20. Your page will say happy hour is on when you’re open.');
  // The events screen uses the same sentence when the days are mixed.
  assert.match(s, /if \(nAny && closedWarnAny\(e\.days, e\.sea, T\.closedWarnNight, true\)\) return closedWarnAny\(e\.days, e\.sea, T\.closedWarnNight\);/);
});

// ====================== 4. Named places, "run club", exact dates ======================
test('Build My Trip names: accents without the bracket part, French words inside a name, and a "." inside a name', async () => {
  const a = mk('brewery', { name: 'Brasserie Rivière Éphémère (test)', region: 'vernon' });
  const b = mk('brewery', { name: 'Microbrasserie du Lac Vert (test)', region: 'vernon' });
  const c = mk('brewery', { name: 'High Mountain Brewing Co. (The Brewhouse)', region: 'vernon' });
  mk('brewery', { name: 'Other Vernon Brewing Fixture', region: 'vernon', rating: 4.9, reviews: 2000 });
  const first = async (q) => { const p = await plan(q); const x = (p.recommendations || [])[0] || stopsOf(p)[0] || {}; return { name: (x.venue && x.venue.name) || x.name, reasons: (x.reasons || []).map((r) => r.text || r), summary: p.summary }; };
  const named = (r, v) => { assert.equal(r.name, v.name, JSON.stringify(r)); assert.ok(r.reasons.some((x) => /place you named|You asked for this place/.test(x)), JSON.stringify(r)); };
  named(await first('Brasserie Rivière Éphémère on Saturday January 9'), a);
  named(await first('Brasserie Riviere Ephemere on Saturday January 9'), a);
  named(await first('Microbrasserie du Lac Vert le samedi 9 janvier'), b);
  named(await first('High Mountain Brewing Co on Saturday January 9'), c);
  named(await first('High Mountain Brewing Co. on Saturday January 9'), c);
  assert.doesNotMatch((await first('High Mountain Brewing Co on Saturday January 9')).summary, /“co”|“brewhouse”/);
  // A real Okanagan kind of name: "Bros." inside it.
  const d = mk('winery', { name: 'Bartier Bros. Fixture Vineyard & Winery', region: 'oliver' });
  named(await first('Bartier Bros. Fixture Vineyard & Winery on Saturday January 9'), d);
  // The French word pass leaves a listed name without its bracket part as typed.
  assert.match(frTrip.tripPlannerText('Microbrasserie du Lac Vert le samedi 9 janvier', { venues: [{ name: b.name }], regions: [], regionLabels: {} }), /lac vert/i);
});

test('Build My Trip: "run club" is one term and finds her Wednesday; the closed note gives the stretch’s exact dates (EN + FR)', async () => {
  const { v } = await priya({}, { name: 'Stawamus Runclub Fixture', region: 'summerland' });
  mk('brewery', { name: 'No Club Brewing Fixture', region: 'summerland', rating: 4.9, reviews: 1500 });
  const p = await plan('run club at a brewery in Summerland on Wednesday');
  assert.doesNotMatch(p.summary, /“run” and “club”/);
  assert.match(p.summary, /“run club”/);
  const top = (p.recommendations || [])[0];
  assert.equal(top.venue.name, v.name);
  assert.ok(top.reasons.some((r) => (r.text || r) === 'Run club on Wednesday from 6 PM, from its listing'));
  // A Wednesday inside her spring stretch (closed Wednesdays from Apr 13 to May 20).
  const closed = await plan(`${v.name} on Wednesday April 21`);
  const note = (closed.warnings || []).concat(closed.notes || []).find((x) => x.includes(v.name) && /closed Wednesdays/.test(x));
  assert.equal(note, `${v.name} is closed Wednesdays from Apr 13 to May 20, so it isn’t in this plan.`);
  assert.match(frCopy.t3FrenchText(note), /est fermé le mercredi du 13 .+ au 20 mai; il ne fait donc pas partie de ce plan\.$/);
  // Whole months keep the short form.
  assert.match(SERVER(), /return whole \|\| !d \? shortMonth\(md\) : `\$\{shortMonth\(md\)\} \$\{d\}`;/);
});

// ====================== 5. A doubled web address ======================
test('menu / tap list web address: two "http" in the box keeps the last one (setup script and server)', async () => {
  const ctx = clientPart('function lastHttp(u){', 'function kindWords(){', {});
  assert.equal(ctx.lastHttp('https://example.com/https://example.com/on-tap'), 'https://example.com/on-tap');
  assert.equal(ctx.lastHttp('https://example.com/on-tap'), 'https://example.com/on-tap');
  assert.equal(ctx.lastHttp('example.com/on-tap'), 'example.com/on-tap');
  assert.equal(ctx.lastHttp('https://l.example.com/go?u=https://example.com/menu'), 'https://l.example.com/go?u=https://example.com/menu', 'an address inside a query is left alone');
  assert.match(CLIENT(), /if \(k === 'menuWebSave'\) \{ var u = lastHttp\(el\('suUrl'\)\.value\.trim\(\)\);/);
  const { v, t } = await priya();
  ok(await change(t, { menu_url: 'https://example.com/https://example.com/on-tap' }));
  const pend = db.prepare("SELECT changes FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' ORDER BY id DESC").get(v.id);
  assert.equal(JSON.parse(pend.changes).menu_url, 'https://example.com/on-tap');
});

// ====================== 6. "Tap list" on the menu step and the edit page ======================
test('no kitchen: the menu step’s buttons, sub-screens and "sent" screen say tap list (cider, drinks and cocktail lists too), EN + FR', async () => {
  const tw = text.en.brewery.tapWords, fw = text.fr.brewery.tapWords;
  assert.equal(tw.snap, 'Take photos of my tap list'); assert.equal(tw.upload, 'Upload my tap list (a file or photos)'); assert.equal(tw.web, 'My tap list is on my website');
  assert.equal(tw.webQ, 'Is this where your tap list is?'); assert.equal(tw.webLabel, 'Tap list web address');
  assert.equal(tw.menuSentQ, 'Your tap list is sent ✓'); assert.equal(tw.menuNewer, 'Want to send a newer one?'); assert.equal(tw.sendMenu, 'Send my tap list');
  assert.equal(fw.snap, 'Photographier ma liste des bières'); assert.equal(fw.webLabel, 'Adresse Web de la liste des bières'); assert.match(fw.menuSentQ, /^Votre liste des bières est envoyée/);
  assert.equal(text.en.brewery.kindCidery.tapWords.web, 'My cider list is on my website');
  assert.equal(text.en.brewery.kindNeutral.tapWords.web, 'My drinks list is on my website');
  assert.equal(text.en.brewery.kindDistillery.tapWords.web, 'My cocktail list is on my website');
  for (const o of [tw, fw, text.en.brewery.kindCidery.tapWords, text.fr.brewery.kindDistillery.tapWords]) for (const k of Object.keys(o)) assert.doesNotMatch(o[k], /\bmenu\b(?!\.)/i, `${k}: ${o[k]}`);
  // Laid over the words only once the food answer is saved and isn't "our own kitchen".
  assert.match(CLIENT(), /var tw = BI\.food && BI\.food !== 'kitchen' \? \(ov \? ov\.tapWords : T0\.tapWords\) \|\| null : null;/);
  const { t } = await priya();
  const cfg = await setupCfg(t);
  assert.equal(cfg.t.tapWords.snap, 'Take photos of my tap list');
  assert.equal((await setupCfg(t, true)).t.tapWords.snap, 'Photographier ma liste des bières');
});

test('edit page: "Add your tap list" for a taproom with no kitchen, gone once a link is sent; a brewpub and a pub keep "Add your menu"', async () => {
  const { v, t } = await priya();
  let edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /class="op-menu-big">[\s\S]{0,400}?Add your tap list</);
  assert.match(edit, /Snap a photo of your chalkboard or tap list, or share the link from your website\./);
  assert.doesNotMatch(edit, /Add your menu<|Snap a photo of your menu, or share/);
  assert.match((await get(`/fr/owner/${t}`)).text, /Ajouter votre liste des bières</);
  ok(await change(t, { menu_url: 'https://example.com/on-tap' }));
  edit = (await get(`/owner/${t}`)).text;
  assert.doesNotMatch(edit, /id="opMenuCard"/, 'sent and waiting for our check: no banner');
  approveLink(v.id);
  assert.doesNotMatch((await get(`/owner/${t}`)).text, /id="opMenuCard"/, 'on the page: no banner');
  // With her own kitchen, and for a pub: the menu banner as before.
  const k = await priya({}, { noFood: true }); ok(await change(k.t, { place_type: 'Brewery', brewery_info: { food: 'kitchen', outside: 'no', kitchen: { mode: 'same' } } }));
  assert.match((await get(`/owner/${k.t}`)).text, /Add your menu</);
  const pub = mk('pub');
  assert.match((await get(`/owner/${tokenFor(pub.id)}`)).text, /Add your menu</);
});

// ====================== 7. "Weekly events" ======================
test('a brewery’s edit page, venue page and tab say events; a pub’s keeps "nights"', async () => {
  const { v, t } = await priya();
  const edit = plain((await get(`/owner/${t}`)).text);
  assert.match(edit, /Weekly events: days and how often/); assert.match(edit, /Weekly events\s+2 events/); assert.match(edit, /\+ Add an event/);
  assert.doesNotMatch(edit, /Weekly nights|2 nights|Add a night|Night 1/);
  const editFr = plain((await get(`/fr/owner/${t}`)).text);
  assert.match(editFr, /Événements de la semaine/); assert.doesNotMatch(editFr, /Soirées de la semaine|2 soirées/);
  assert.equal(app.ownerFieldLabelsFor({ id: v.id, type: 'brewery', name: v.name }, false).weekly_nights, 'Weekly events');
  assert.equal(app.ownerFieldLabelsFor({ id: v.id, type: 'brewery', name: v.name }, true).weekly_nights, 'Événements de la semaine');
  assert.equal(app.ownerFieldLabelsFor({ type: 'pub' }, false).weekly_nights, 'Weekly nights');
  // The venue page: an evening-only list at a brewery is "Weekly events" too.
  const eve = await priya({}, { noNights: true }); ok(await change(eve.t, { weekly_nights: [{ days: ['thu'], kind: 'trivia', title: 'Trivia', start: '19:30', frequency: 'weekly' }] }));
  const jan = at('2027-01-14', '12:00');
  assert.match(page(eve.v, 'en', jan), /<h2 id="venueNightsTitle">Weekly events<\/h2>/);
  assert.match(page(eve.v, 'fr', jan), /<h2 id="venueNightsTitle">Événements de la semaine<\/h2>/);
  // The tab.
  assert.equal(layout.dealsWording(true, true, ['live_music'], 'brewery').tab, 'Deals & events');
  assert.equal(layout.dealsWording(false, true, ['live_music'], 'brewery').tab, 'Weekly events');
  assert.equal(layout.dealsWording(true, true, ['trivia'], 'brewery').tab, 'Deals & trivia');
  // Pubs: as they were. Restaurants say events too since 2026-11-16 (tests/restaurant-weekly-events.test.js).
  assert.equal(layout.dealsWording(true, true, ['live_music'], 'pub').tab, 'Deals & nights');
  assert.equal(layout.dealsWording(false, true, ['live_music'], 'restaurant').tab, 'Weekly events');
  const pub = mk('pub'); const pt = tokenFor(pub.id);
  ok(await change(pt, { weekly_nights: [{ days: ['thu'], kind: 'trivia', title: 'Trivia', start: '19:30', frequency: 'weekly' }] }));
  const pedit = plain((await get(`/owner/${pt}`)).text);
  assert.match(pedit, /Weekly nights: days and how often/); assert.match(pedit, /\+ Add a night/);
  assert.match(page(pub, 'en', jan), /<h2 id="venueNightsTitle">Weekly nights<\/h2>/);
});

// ====================== 8. Help ======================
test('help: bring your own food leads with the taproom screen; "when do my photos show up" leads with "Within a day" (EN + FR)', async () => {
  const { t } = await priya();
  const bots = { en: helpBot((await get(`/owner/${t}/setup`)).text), fr: helpBot((await get(`/fr/owner/${t}/setup`)).text) };
  for (const q of ['people bring pizza from next door', 'can customers bring their own food in', 'we only do snacks, chips and pretzels', 'is outside food ok']) assert.equal(bots.en.best(q).id, 'brewery-outside-food', q);
  const a = bare(bots.en.topic('brewery-outside-food').a);
  assert.ok(a.startsWith('Right here in setup: Your taproom → Can people bring their own food? Tap Yes.'), a);
  assert.match(a, /Snacks only/);
  assert.equal(bots.fr.best('est-ce qu’on peut apporter sa propre nourriture').id, 'brewery-outside-food');
  assert.ok(bare(bots.fr.topic('brewery-outside-food').aFr).startsWith('Ici même, dans la configuration : Votre salle de dégustation → Peut-on apporter sa propre nourriture ? Touchez Oui.') || bare(bots.fr.topic('brewery-outside-food').aFr).startsWith('Ici même, dans la configuration : Votre salle de dégustation → Peut-on apporter sa propre nourriture? Touchez Oui.'), bare(bots.fr.topic('brewery-outside-food').aFr));
  // Food trucks keep their own answer.
  assert.equal(bots.en.best('we have a food truck on weekends').id, 'brewery-food-trucks');
  // Photos.
  assert.equal(bots.en.best('when do my photos show up').id, 'photos-when');
  assert.ok(bare(bots.en.topic('photos-when').a).startsWith('Within a day. We check each photo first'), bare(bots.en.topic('photos-when').a));
  assert.ok(bare(bots.fr.topic('photos-when').aFr).startsWith('D’ici un jour. Nous vérifions chaque photo d’abord'));
  // On the edit page the same question gets the waiting answer, and a distillery has the food answer in its own words.
  const edit = helpBot((await get(`/owner/${t}`)).text);
  assert.equal(edit.best('when do my photos show up').id, 'photo-pending');
  assert.equal(edit.best('can people bring pizza from next door').id, 'brewery-outside-food');
  const d = mk('distillery'); const dbot = helpBot((await get(`/owner/${tokenFor(d.id)}/setup`)).text);
  assert.ok(bare(dbot.topic('brewery-outside-food').a).startsWith('Right here in setup: Food here → Can people bring their own food? Tap Yes.'));
  // Every setup with a photos step answers the photos question (a pub).
  const pub = mk('pub'); assert.equal(helpBot((await get(`/owner/${tokenFor(pub.id)}/setup`)).text).best('when do my photos show up').id, 'photos-when');
});

// ====================== 9. French-only answers with no French story ======================
test('last screen: French-only answers with no French story say what really happens; with a French story the line is as before', () => {
  assert.match(text.en.frOnlyFinishNoStory, /Your French page goes up once your story in French is on your page\. Until then, an event shows on your English page in short form/);
  assert.match(text.fr.frOnlyFinishNoStory, /Votre page française paraîtra dès que votre histoire en français sera sur votre page\./);
  assert.match(text.fr.frOnlyFinishNoStory, /en version courte/);
  assert.doesNotMatch(text.fr.frOnlyFinishNoStory, /paraissent sur votre page française seulement/);
  assert.match(text.fr.frOnlyFinish, /elles paraissent sur votre page française seulement/, 'kept when a French story exists');
  assert.match(CLIENT(), /var noFr = !CUR\.description_fr && T\.frOnlyFinishNoStory;/);
  assert.match(CLIENT(), /h\(noFr \? fill\(T\.frOnlyFinishNoStory, \{ story: T\.labels\.story \}\) : T\.frOnlyFinish\)/);
});

// ====================== 10. The small ones ======================
test('"(when open)" on the happy hour line only while a listed day is closed in the hours that apply that day', async () => {
  const { v, t } = await priya();
  ok(await change(t, { happy_hour: { mon: [], tue: [], wed: [['15:00', '17:00']], thu: [['15:00', '17:00']], fri: [['15:00', '17:00']], sat: [], sun: [] }, badges: { happy_hour: true } }));
  const row = db.prepare('SELECT hours, happy_hour_times FROM venues WHERE id = ?').get(v.id);
  assert.equal(app.happyHourOnClosedDay(v.id, row.hours, row.happy_hour_times), true, 'some time in the year');
  assert.equal(app.happyHourOnClosedDay(v.id, row.hours, row.happy_hour_times, '2027-01-13'), false);
  assert.equal(app.happyHourOnClosedDay(v.id, row.hours, row.happy_hour_times, '2027-04-21'), true);
  assert.doesNotMatch(plain(page(v, 'en', at('2027-01-13'))), /\(when open\)/);
  assert.match(plain(page(v, 'en', at('2027-04-22'))), /Happy hour Wed[^.]{0,30}\(when open\)/);
  assert.match(plain(page(v, 'fr', at('2027-04-22'))), /\(les jours d’ouverture\)/);
  // A day closed in the usual week says so all year.
  ok(await change(t, { happy_hour: { mon: [['15:00', '17:00']], tue: [], wed: [['15:00', '17:00']], thu: [], fri: [], sat: [], sun: [] }, badges: { happy_hour: true } }));
  assert.match(plain(page(v, 'en', at('2027-01-13'))), /\(when open\)/);
});

test('events: Undo after Remove; a short name with a comma is split after the picked kind’s name only', () => {
  const s = CLIENT();
  assert.match(s, /if \(q2\[0\] === 'nights' && gone\.length\) S\.nightUndo = \{ i: \+q2\[1\], e: gone\[0\] \};/);
  assert.match(s, /if \(k === 'nightUndo'\) \{ readEntries\(\); var nu = S\.nightUndo; S\.nightUndo = null; if \(nu && S\.nights\.length < 7\) S\.nights\.splice\(Math\.min\(nu\.i, S\.nights\.length\), 0, nu\.e\); return render\(\); \}/);
  assert.match(s, /id="suNightUndo" role="status">/);
  assert.equal(fill(text.en.nightUndo, { title: 'Run club' }), 'Removed “Run club”.'); assert.equal(text.en.nightUndoBtn, 'Undo'); assert.equal(text.fr.nightUndoBtn, 'Annuler');
  const ctx = clientPart('var NT_MAX = 40', 'function apptKind(k)', { T: { ...text.en, kinds: { live_music: 'Live music', trivia: 'Trivia' } }, C: { nightKindsEn: { live_music: 'Live music', trivia: 'Trivia' } }, fill }, '\nthis.ntSplit = ntSplit; this.ntHint = ntHint;');
  const sp = (x, k) => { const r = ctx.ntSplit(x, k); return [r.title, r.detail]; };
  assert.deepEqual(sp('Live music, local bands, no cover', 'live_music'), ['Live music', 'Local bands, no cover']);
  assert.deepEqual(sp('live music, local bands', 'live_music'), ['live music', 'Local bands']);
  assert.deepEqual(sp('Tacos, trivia and tunes', 'trivia'), ['Tacos, trivia and tunes', ''], 'an ordinary name with a comma stays whole');
  assert.deepEqual(sp('Live music, local bands, no cover', 'other'), ['Live music, local bands, no cover', '']);
  assert.deepEqual(sp('Live music, local bands, no cover'), ['Live music, local bands, no cover', ''], 'no kind picked: as before');
  assert.deepEqual(sp('Trivia', 'trivia'), ['Trivia', '']);
  assert.equal(ctx.ntHint('Live music, local bands, no cover', 'live_music'), 'Name: “Live music”. The rest shows under it: “Local bands, no cover”.');
  assert.match(s, /var sp = ntSplit\(title, e\.kind\);/);
});

test('research: "Dogs welcome inside" is offered on the Dogs screen (never saved until Save); "Our own kitchen" is a pre-pick only', async () => {
  const { v, t } = await priya({}, { bare: true });
  const cfg = await setupCfg(t);
  assert.equal(cfg.suggestDogNote, 'Dogs welcome inside');
  assert.equal((await setupCfg(t, true)).suggestDogNote, 'Chiens bienvenus à l’intérieur');
  assert.equal(cfg.suggestFood, 'kitchen', 'research’s "Full kitchen" is the pre-pick she sees with its note');
  // Other screens saved: neither suggestion is on file.
  ok(await change(t, { hours: USUAL, hours_checked: true })); ok(await change(t, { flight_fee: 14 })); ok(await change(t, { badges: { patio: false } }));
  assert.equal(app.venueBreweryInfo(v.id).food, undefined);
  assert.ok(!(app.ownerVenueSnapshot ? (app.ownerVenueSnapshot(app.getVenue(v.id), null).visit_rows || {}).dogs : ''), 'no dogs line saved');
  // The food answer is sent only by the taproom screen's own Save, and the dogs line by the Dogs screen's.
  const s = CLIENT();
  assert.equal((s.match(/bi\.food = tb\.food/g) || []).length, 1);
  assert.match(s, /if \(C\.brewery && C\.suggestDogNote && !S\.dogGuessSet && !S\.dogNote && !\(\(CUR\.visit_rows \|\| \{\}\)\.dogs\)\)/);
  // Patio named too: "Inside and patio"; patio only: as before; a "no dogs inside" line: nothing about inside.
  const both = mk('brewery'); research(both.id, [{ label: 'Kids & dogs', text: 'Dogs welcome inside and on the patio' }]);
  assert.equal((await setupCfg(tokenFor(both.id))).suggestDogNote, 'Inside and patio');
  const pat = mk('brewery'); research(pat.id, [{ label: 'Kids & dogs', text: 'Dogs on the patio' }]);
  assert.equal((await setupCfg(tokenFor(pat.id))).suggestDogNote, 'Patio only');
  const no = mk('brewery'); research(no.id, [{ label: 'Kids & dogs', text: 'Dogs on the patio only, not inside' }]);
  assert.equal((await setupCfg(tokenFor(no.id))).suggestDogNote, 'Patio only');
});

test('edit page: the badge count is every ticked box; Groups and Kids labels; setup: the Food trucks line and the English-text note', async () => {
  const { t } = await priya();
  ok(await change(t, { badges: { free_parking: true, board_games: true } }));
  const html = (await get(`/owner/${t}`)).text;
  const ticked = (/<div class="amenity-check-grid" id="opBadges"[\s\S]*?<\/div>/.exec(html)[0].match(/ checked>/g) || []).length;
  const said = Number(/(\d+) ticked:/.exec(plain(html))[1]);
  assert.equal(said, ticked); assert.ok(ticked >= 9, String(ticked));
  // Her Groups answer's box is "Groups and good to know"; "Kids" beside a separate Dogs line.
  ok(await change(t, { brewery_info: { minors: { policy: 'minors_until', until: '20:00', note: '' } } }));
  ok(await change(t, { visit_rows: { dogs: 'Dogs welcome inside' } }));
  const e2 = (await get(`/owner/${t}`)).text;
  assert.match(e2, /<label for="opVisitGroups">Groups and good to know<\/label>/);
  assert.match(e2, /<strong>Kids:<\/strong> Minors welcome/);
  assert.match((await get(`/fr/owner/${t}`)).text, /<label for="opVisitGroups">Groupes et bon à savoir<\/label>/);
  const s = CLIENT();
  assert.match(s, /\(subs && subs\[k\] && \(!subsOn \|\| on\) \? '<small>'/);
  assert.match(s, /bchips\('trucks', \['most_days', 'weekends'\], T\.ttrucks, T\.ttrucksQ\) \+ '<\/div>' \} : null, true\)/);
  assert.match(s, /var was = f\.value; f\.addEventListener\('input', function\(\)\{ hint\.hidden = f\.value !== was; \}\);/);
});
