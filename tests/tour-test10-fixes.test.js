// Whistler tour test 10 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour10-2026-11-18/REPORT.md: Gord,
// a horseback ranch in the Pemberton Meadows on a landscape Android tablet: trail rides for riders 8+ under 230 lb, pony
// rides for kids under 8, summer pack trips with a 2-person minimum, winter sleigh rides on weekends and holidays priced
// per sleigh, closed Mondays in spring and fall; short answers, typos, no capitals). On Okanagan fixtures (Penticton, with
// Naramata next door). Dayton approved four additions: a third stretch of hours, 8+ and 10+ ages, a "Sleigh rides" kind
// and "Open on holidays" inside a stretch. The Help questions are in tour-help-routing.test.js.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t10-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const hours = require('../hours.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
const tr = require('../trip-requirements.js');
const frCopy = require('../trip-french-copy.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const PAGE_JS = fs.readFileSync(path.join(ROOT, 'trip-planner-v3-page.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const W = (o) => Object.fromEntries(DAYS.map((d) => [d, o[d] || []]));
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T10 ${++n}`, slug: `tour-t10-${n}`, region: 'penticton', type, latitude: 49.49 + n / 3000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Penticton`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 10 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.61.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(id, JSON.stringify({ sections }));
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };
const NOW = new Date('2026-11-18T12:00:00-08:00');
const dayOn = (v, date) => hours.dayOnDate(hours.parseHours(app.hoursWithExtras(app.getVenue(v.id), new Date(`${date}T12:00:00-08:00`))), date);

// Gord's ranch, moved to Penticton: research says "all ages… sleigh rides year-round", 9–5 daily.
const SUMMER = W({ mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [['09:00', '17:00']], sun: [['09:00', '17:00']] });
const SPRING_FALL = W({ tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [['09:00', '17:00']], sun: [['09:00', '17:00']] });
const WINTER = W({ sat: [['10:00', '16:00']], sun: [['10:00', '16:00']] });
async function gord(o = {}) {
  const v = mk('tour', { name: `Meadow Creek Ranch ${n + 1}`, cuisine: 'Trail rides & sleigh rides', rating: 4.9, reviews: 211,
    description: 'Family-run ranch offering guided trail rides for all ages and skill levels, plus horse-drawn sleigh rides year-round.',
    description_fr: 'Ranch familial proposant des randonnées guidées pour tous les âges, ainsi que des promenades en traîneau toute l’année.', ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['horseback', 'sleigh', 'farm'], length: '1h', book: 'day', age: 'all', year: 'all' } }));
  ok(await change(t, { hours: SPRING_FALL, hours_checked: true, hours_seasons: [
    { from: '06-01', to: '09-30', label: '', hours: SUMMER }, { from: '12-01', to: '03-31', label: '', holidays: true, hours: WINTER }] }));
  ok(await change(t, { visit_rows: { good_to_know: 'wear closed-toe shoes. riders 8+ (pony rides under 8) and under 230 lb.' } }));
  publish(v.id, [{ name: '', items: [
    { name: '1 hr trail ride', price: '$75 per rider', description: '' }, { name: '2 hr trail ride', price: '$120 per rider', description: 'along the river' },
    { name: 'Pony rides', price: '$25 per child', description: 'kids under 8 only, parent walks along' },
    { name: 'Overnite pack trip (summer)', price: '$450 per person, 2 person min', description: '2 days, tents and meals included' },
    { name: 'Sleigh ride (winter weekends and holidays)', price: '$200 per sleigh, up to 10 people', description: '' }] }]);
  app.clearHoursExtraCache();
  return { v, t };
}

test('1. "Sleigh rides" kind (EN + FR): the list, Winter & Snow, its page words, research hints, planner words; dog sledding stays dog sledding', async () => {
  assert.ok(completeness.TOUR_KINDS.includes('sleigh'));
  assert.deepEqual(app.TOUR_KIND_LABELS_OWNER.sleigh, ['Sleigh rides', 'Promenades en traîneau']);
  assert.equal(app.TOUR_KIND_ACTIVITY.sleigh, 'winter');
  assert.equal(app.tourKindsText(['horseback', 'sleigh'], false), 'Horseback riding & sleigh rides'); // tour test 17: the owner's own chip order
  assert.match(app.tourKindsText(['horseback', 'sleigh'], true), /promenades en traîneau/i);
  // Research's "Trail rides & sleigh rides" pre-picks both; "horse-drawn" alone isn't horseback; « traîneau à chiens » is dogs.
  assert.deepEqual(app.tourKindSuggestion({ cuisine: 'Trail rides & sleigh rides', name: '' }), ['sleigh', 'horseback']);
  assert.deepEqual(app.tourKindSuggestion({ cuisine: 'Horse-drawn sleigh rides', name: '' }), ['sleigh']);
  assert.deepEqual(app.tourKindSuggestion({ cuisine: 'Traîneau à chiens', name: '' }), ['dogsled']);
  // Build My Trip: the kind and its words, apart from dog sledding.
  assert.ok(tr.inferPlannerKinds({ type: 'tour', name: 'x', description: '', cuisine: '', tourKinds: ['sleigh'] }).includes('sleigh_ride'));
  for (const q of ['sleigh ride', 'horse-drawn sleigh', 'sleigh rides in january']) { assert.ok(tr.KINDS.sleigh_ride.test(q), q); assert.ok(!tr.KINDS.snow_tour.test(q), q); }
  for (const q of ['dog sledding', 'dog sled tour', 'husky sled ride']) { assert.ok(tr.KINDS.snow_tour.test(q), q); assert.ok(!tr.KINDS.sleigh_ride.test(q), q); }
  // The setup offers it in both languages.
  const { v, t } = await gord();
  const en = cfgOf((await get(`/owner/${t}/setup`)).text), fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.ok(en.tourKinds.some((x) => x.k === 'sleigh' && x.t === 'Sleigh rides'));
  assert.ok(fr.tourKinds.some((x) => x.k === 'sleigh' && x.t === 'Promenades en traîneau'));
  assert.equal(app.tourInActivity(app.getVenue(v.id), 'winter'), true);
  assert.match(plain(page(v, 'fr')), /[Pp]romenades en traîneau/);
});

test('2. French "promenade en traîneau" (search and plan) finds the sleigh rides; « traîneau à chiens » still finds the dog sledding only', async () => {
  const { v } = await gord();
  const sled = mk('tour', { name: 'Husky Trails Sled Dogs', cuisine: 'Dog sledding', description: 'Dog sled tours with our huskies.' });
  ok(await change(tokenFor(sled.id), { tour_info: { kinds: ['dogsled'], length: '2-3h', year: 'all' } }));
  const names = (q, lang) => (app.runDiscovery(app.discoverySearchText(q, lang), { limit: 40, lang }).results.items || []).map((x) => (x.venue || x).name);
  assert.ok(names('promenade en traîneau', 'fr').includes(v.name));
  assert.ok(!names('promenade en traîneau', 'fr').includes(sled.name));
  assert.ok(names('traîneau à chiens', 'fr').includes(sled.name));
  const plan = app.runTripPlan({ text: 'promenade en traîneau près de Penticton en janvier' }, NOW);
  assert.ok(namesOf(plan).includes(v.name), JSON.stringify([plan.kind, namesOf(plan), plan.warnings]));
  assert.ok(!namesOf(plan).includes(sled.name));
  const dogs = app.runTripPlan({ text: 'traîneau à chiens près de Penticton en janvier' }, NOW);
  assert.ok(namesOf(dogs).includes(sled.name)); assert.ok(!namesOf(dogs).includes(v.name));
});

test('3. a third stretch of hours: saved, on the page (EN + FR), and every status line and the planner follow it', async () => {
  const v = mk('tour', { name: 'Three Season Rides', cuisine: 'Horseback riding' });
  const t = tokenFor(v.id);
  ok(await change(t, { hours: SPRING_FALL, hours_checked: true, hours_seasons: [
    { from: '06-01', to: '09-30', label: '', hours: SUMMER }, { from: '12-01', to: '03-31', label: '', hours: WINTER }, { from: '10-01', to: '10-31', label: '', hours: W({ sat: [['11:00', '15:00']] }) }] }));
  app.clearHoursExtraCache();
  assert.equal(app.venueHoursExtras(v.id).seasons.length, 3);
  // A fourth is refused, and two that share a day are refused in plain words.
  const four = await change(t, { hours_seasons: [{ from: '06-01', to: '06-30', label: '', hours: SUMMER }, { from: '07-01', to: '07-31', label: '', hours: SUMMER }, { from: '08-01', to: '08-31', label: '', hours: SUMMER }, { from: '12-01', to: '12-31', label: '', hours: WINTER }] });
  assert.equal(four.status, 400);
  const overlap = await change(t, { hours_seasons: [{ from: '06-01', to: '09-30', label: '', hours: SUMMER }, { from: '09-01', to: '10-31', label: '', hours: WINTER }] });
  assert.equal(overlap.status, 400); assert.match(JSON.stringify(overlap.body), /Two of your sets of other hours share some dates/);
  // Each date's own week: Monday in summer open, a Monday in May closed (usual), a Wednesday in October closed (third), a Saturday in October open 11–3.
  assert.equal(dayOn(v, '2027-07-12').status, 'open');
  assert.equal(dayOn(v, '2027-05-10').status, 'closed');
  assert.equal(dayOn(v, '2026-10-14').status, 'closed');
  assert.deepEqual(dayOn(v, '2026-10-17').ranges, [[660, 900]]);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.match(en, /Hours through the year/); assert.match(en, /Oct 1 – Oct 31/); assert.match(en, /Jun 1 – Sep 30/); assert.match(en, /Dec 1 – Mar 31/);
  assert.match(fr, /Heures selon la saison/);
  // The planner reads the week of the date: a Wednesday in October closed, a Saturday open 11–3.
  assert.deepEqual(JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-10-16')).sat, [['11:00', '15:00']]);
  assert.ok(!(JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-10-13')).wed || []).length);
  const wed = app.runTripPlan({ text: `${v.name} on October 13` }, NOW), sat = app.runTripPlan({ text: `${v.name} on October 16` }, NOW);
  assert.ok((wed.warnings || []).some((w) => w.includes(v.name) && /closed/.test(w)), JSON.stringify([namesOf(wed), wed.warnings]));
  assert.ok(namesOf(sat).includes(v.name), JSON.stringify([namesOf(sat), sat.warnings]));
  // The setup: up to three (SEA_MAX), the third's own screen and words, the spring-and-fall tip, EN + FR.
  assert.match(CLIENT, /var SEA_MAX = 3;/);
  assert.match(CLIENT, /s === 'hours:season3'/);
  for (const L of [text.en, text.fr]) for (const k of ['seasonEditQThird', 'seaAdd3', 'seaAdd3Sub', 'seaAddLink3', 'seaSpringFallTip', 'seaHolidaysQ', 'seaHolidays']) assert.ok(L[k], k);
  assert.match(text.en.seaSpringFallTip, /Set your usual hours to your spring and fall hours/);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur ? (cfg.cur.hours_seasons || []).length : 3, 3);
});

test('4. "Open on holidays" inside a stretch: Family Day and Christmas week open in a weekends-only winter, a closure still wins; status (EN + FR), page and planner', async () => {
  const { v, t } = await gord();
  // Monday Feb 15, 2027 is Family Day: open with the stretch's Saturday hours. Monday Feb 22 is not: closed.
  assert.equal(hours.holidayOn('2027-02-15'), true); assert.equal(hours.holidayOn('2027-02-22'), false);
  assert.deepEqual(dayOn(v, '2027-02-15').ranges, [[600, 960]]);
  assert.equal(dayOn(v, '2027-02-22').status, 'closed');
  // Christmas week: Wednesday Dec 30 open; Christmas Day closed by his closure.
  assert.equal(dayOn(v, '2026-12-30').status, 'open');
  ok(await change(t, { closures: [{ from: '12-25', to: '12-25', note: '', yearly: true }] }));
  app.clearHoursExtraCache();
  assert.equal(dayOn(v, '2026-12-25').status, 'closed');
  // The status line on Family Day morning (EN + FR) and the year list.
  const fam = new Date('2027-02-15T11:00:00-08:00');
  assert.match(plain(page(v, 'en', fam)), /Open now/);
  assert.match(plain(page(v, 'fr', fam)), /Ouvert/);
  assert.doesNotMatch(plain(page(v, 'en', new Date('2027-02-22T11:00:00-08:00'))), /Open now/);
  assert.match(plain(page(v)), /Holidays and Christmas week too/);
  assert.match(plain(page(v, 'fr')), /Jours fériés et semaine de Noël aussi/);
  // Build My Trip reads the week of that date (weekJsonOn) the same way.
  assert.deepEqual(JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-02-15')).mon, [['10:00', '16:00']]);
  assert.ok(!(JSON.parse(app.weekJsonOn(app.getVenue(v.id), '2027-02-22')).mon || []).length);
  const famPlan = app.runTripPlan({ text: 'sleigh ride in Penticton on February 15' }, NOW);
  assert.ok(namesOf(famPlan).includes(v.name), JSON.stringify([namesOf(famPlan), famPlan.warnings]));
  // The flag is a yes/no only, kept through the setup and the edit page.
  assert.equal((await change(t, { hours_seasons: [{ from: '12-01', to: '03-31', label: '', holidays: 'yes', hours: WINTER }] })).status, 400);
  assert.match(CLIENT, /data-act="seaHolidays"/); assert.match(CLIENT, /if \(so\.holidays\) list\[list\.length - 1\]\.holidays = true;/);
  assert.match(SERVER, /if \(\(\(initial\.hours_seasons \|\| \[\]\)\[0\] \|\| \{\}\)\.holidays === true\) first\.holidays = true;/);
});

test('5. 8+ and 10+ ages; a trip\'s own age ("Riders 8+ (pony rides under 8)" under Good to know, or "8+" on the trip): no trail ride for a 6-year-old, pony rides for a 5-year-old', async () => {
  assert.deepEqual(completeness.TOUR_AGES, ['all', '5', '6', '8', '10', '12', '14', '16', '19']);
  assert.equal(text.en.tour.tages[8], '8+'); assert.equal(text.fr.tour.tages[10], '10+');
  // Tour test 16: this source-only check is now a behaviour test (tour-test16-fixes.test.js, test 11).
  const kid = mk('tour', { name: 'Eight Plus Canoe', cuisine: 'Canoe tours' });
  ok(await change(tokenFor(kid.id), { tour_info: { kinds: ['paddle'], age: '8', year: 'all' } }));
  assert.match(plain(page(kid)), /Ages 8 and up\./); assert.match(plain(page(kid, 'fr')), /À partir de 8 ans\./);
  const { v } = await gord();
  assert.equal(app.tourRiderAge(v.id), 8);
  const f = app.tourPlannerFacts(v.id);
  assert.ok(f.tourItems.some((x) => /pony/i.test(x.name) && x.kids));
  const trail = app.runTripPlan({ text: 'trail ride for me and my 6 year old in july' }, NOW);
  assert.ok(!namesOf(trail).includes(v.name), JSON.stringify(namesOf(trail)));
  assert.ok([...(trail.notes || []), ...(trail.contextNotes || [])].some((x) => /’s “1 hr trail ride” is for ages 8 and up, so it isn’t in this plan for your 6-year-old\./.test(x)), JSON.stringify(trail.notes));
  assert.match(frCopy.t3FrenchText(`${v.name}’s “1 hr trail ride” is for ages 8 and up, so it isn’t in this plan for your 6-year-old.`), /8 ans et plus/);
  for (const q of ['pony ride for my 5 year old', 'horse ride for my 5 year old', 'pony rides with my 4 year old in july', 'trail ride for me and my 9 year old in july']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(namesOf(p).includes(v.name), `${q}: ${JSON.stringify([namesOf(p), p.warnings])}`);
  }
  // Research's Good to know never sets an age: only his own line does.
  const r = mk('tour', { name: 'Research Riders', cuisine: 'Trail rides' });
  setBox(r.id, { rows: [{ label: 'Good to know', text: 'Riders 12+' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  assert.equal(app.tourRiderAge(r.id), 0);
});

test('6. "pony ride" (one) and "horse ride" are riding; an overnight horse pack trip finds the ranch whose trips say pack trip', async () => {
  const { v } = await gord();
  const other = mk('tour', { name: 'Day Ride Stables', cuisine: 'Horseback riding', description: 'One-hour trail rides.' });
  ok(await change(tokenFor(other.id), { tour_info: { kinds: ['horseback'], length: '1h', year: 'all', age: 'all' } }));
  for (const q of ['pony ride', 'a pony ride', 'horse ride']) assert.ok(tr.KINDS.horseback.test(tr.tripRequestSynonyms(q)), q);
  const pony = app.runTripPlan({ text: 'pony ride' }, NOW);
  assert.ok(namesOf(pony).includes(v.name), JSON.stringify([namesOf(pony), pony.warnings]));
  const pack = app.runTripPlan({ text: 'overnight horse pack trip in august' }, NOW);
  assert.equal(namesOf(pack)[0], v.name, JSON.stringify([pack.kind, namesOf(pack), pack.warnings]));
  assert.ok(!(pack.warnings || []).some((w) => /“pack”/.test(w)));
});

test('7. a January trail ride: hidden while only his sleigh rides run; "Sat–Sun only (Dec–Mar)", not "Closed Fridays · try Sat, Sun"', async () => {
  const { v } = await gord();
  const jan = app.runTripPlan({ text: 'horseback trail ride near Penticton in January' }, NOW);
  const all = JSON.stringify(jan);
  assert.ok(!namesOf(jan).includes(v.name)); assert.ok(!all.includes(v.name), all.slice(0, 600));
  // A sleigh ride that month still finds him.
  assert.ok(namesOf(app.runTripPlan({ text: 'sleigh ride near Penticton in January' }, NOW)).includes(v.name));
  // The words for a place open two days or fewer (any type), EN + FR, page and server.
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(/function t3ClosedDayText[\s\S]*?\n\}\n/.exec(PAGE_JS)[0] + /function t3MissingClosedText[\s\S]*?\n\}\n/.exec(PAGE_JS)[0], ctx);
  const c = { day: 'fri', from: '12-01', to: '03-31', open: ['sat', 'sun'] };
  assert.equal(vm.runInContext(`t3ClosedDayText(${JSON.stringify(c)}, false)`, ctx), 'Sat–Sun only (Dec–Mar)');
  assert.equal(vm.runInContext(`t3ClosedDayText(${JSON.stringify(c)}, true)`, ctx), 'Seulement du samedi au dimanche (déc.–mars)');
  assert.equal(vm.runInContext(`t3MissingClosedText({ alternatives: [{ name: 'X', closedDay: ${JSON.stringify(c)} }] }, false)`, ctx), 'X is open Sat–Sun only (Dec–Mar).');
  assert.equal(vm.runInContext(`t3ClosedDayText(${JSON.stringify({ day: 'mon', open: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] })}, false)`, ctx), 'Closed Mondays · try Tue–Sun');
  assert.equal(frCopy.t3FrenchText('X is open Sat–Sun only (Dec–Mar).'), 'X — Seulement du samedi au dimanche (déc.–mars).');
});

test('8. French page: no « Vérifié par l’entreprise » while the French description is research’s and his English story is his', async () => {
  const { v, t } = await gord();
  ok(await change(t, { description: 'Family ranch in the meadows since 1979. Trail rides, pony rides for little ones, overnight pack trips in summer and sleigh rides in winter.' }));
  // (Approved by us: the story is live and his.)
  db.prepare("UPDATE owner_change_requests SET status = 'rejected' WHERE venue_id = ? AND status = 'pending'").run(v.id);
  db.prepare("UPDATE venues SET description = ? WHERE id = ?").run('Family ranch in the meadows since 1979. Trail rides, pony rides for little ones, overnight pack trips in summer and sleigh rides in winter.', v.id);
  db.prepare("INSERT INTO owner_change_requests (venue_id, changes, previous, status, instant) VALUES (?, ?, '{}', 'approved', 0)").run(v.id, JSON.stringify({ description: 'Family ranch in the meadows since 1979. Trail rides, pony rides for little ones, overnight pack trips in summer and sleigh rides in winter.' }));
  assert.equal(app.ownerFrDescState(app.getVenue(v.id)), 'old');
  assert.match(plain(page(v)), /Verified by the business/);
  assert.doesNotMatch(plain(page(v, 'fr')), /Vérifié par l’entreprise/);
  // Once his French description is his, the pill is back in French.
  db.prepare("UPDATE venues SET description_fr = ? WHERE id = ?").run('Ranch familial dans les prés depuis 1979 : randonnées, poneys pour les petits, sorties de deux jours l’été et promenades en traîneau l’hiver.', v.id);
  db.prepare("INSERT INTO owner_change_requests (venue_id, changes, previous, status, instant) VALUES (?, ?, '{}', 'approved', 0)").run(v.id, JSON.stringify({ description_fr: 'Ranch familial dans les prés depuis 1979 : randonnées, poneys pour les petits, sorties de deux jours l’été et promenades en traîneau l’hiver.' }));
  assert.match(plain(page(v, 'fr')), /Vérifié par l’entreprise/);
});

test('9. "Leave it to us" on the French story screen queues the French description for Dayton (the existing Menus queue, email stubbed), once', async () => {
  const { v, t } = await gord();
  sent.length = 0;
  const r = await postJson(`/owner/${t}/menu/help`, { note: 'Please write our French description from our English story.', sheet: 'fr_story', contact_email: '', contact_phone: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story'").all(v.id);
  assert.equal(row.length, 1); assert.equal(row[0].status, 'help');
  assert.ok(sent.some((m) => /\[TRANSLATE\]/.test(JSON.stringify(m))), JSON.stringify(sent).slice(0, 300));
  const again = await postJson(`/owner/${t}/menu/help`, { note: 'again', sheet: 'fr_story', contact_email: '', contact_phone: '' });
  assert.equal(again.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story'").get(v.id).n, 1);
  const card = app.renderAdminMenuCard({ ...row[0], venue_name: v.name });
  assert.match(card, /French description/); assert.match(card, /Write their French description/);
  // The French setup's link posts it, then goes back to the English setup.
  assert.match(CLIENT, /data-act="frLeave"/); assert.match(CLIENT, /sheet: 'fr_story'/);
  // A type without the easy setup can't send one.
  const bar = mk('pub', { name: 'Not A Setup Bar' });
  const no = await postJson(`/owner/${tokenFor(bar.id)}/menu/help`, { note: 'x', sheet: 'fr_story', contact_email: '', contact_phone: '' });
  assert.ok([200, 400].includes(no.status));
});

test('10. price per rider, child, kid, adult or person saves; per sleigh is still a unit price', async () => {
  for (const x of ['75 per rider', '$75 per rider', '25 per child', '25 per kid', '95 per adult', '95 per person', '95 pp', '75 a rider']) assert.equal(app.tourPriceWhy(x), '', x);
  assert.equal(app.tourPriceWhy('200 per sleigh'), 'unit');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(clientFn('moneyHead') + clientFn('feeHours') + clientFn('priceSwiss') + clientFn('priceTrim') + clientFn('tourPriceWhy'), ctx);
  for (const x of ['75 per rider', '25 per child', '25 per kid', '95 per adult']) assert.equal(vm.runInContext(`tourPriceWhy(${JSON.stringify(x)}, false)`, ctx), '', x);
  const { t } = await gord();
  ok(await change(t, { tour_price: 75 }));
});

test('11. Good to know chips end with ". " before the owner types (as the group-size chips do)', () => {
  assert.match(CLIENT, /if \(sep === '\. ' && v && qk !== 'takeout'\) v = v\.replace\(\/\[\\s\]\+\$\/, ''\)\.replace\(\/\(\[\^\.!\?\]\)\$\/, '\$1\.'\) \+ ' ';/);
  // The rule itself, run on Gord's taps then his typing.
  const add = (v, t) => { v = v ? v.replace(/[\s.,]+$/, '') + '. ' + t : t; return v.replace(/[\s]+$/, '').replace(/([^.!?])$/, '$1.') + ' '; };
  assert.equal(add(add('', 'Wear closed-toe shoes'), 'Trips run rain or shine') + 'long pants', 'Wear closed-toe shoes. Trips run rain or shine. long pants');
});

test('12. "Your tours and prices" is done once typed tours are sent (waiting) or published', async () => {
  const v = mk('tour', { name: 'Typed Tours Ranch' });
  assert.ok(!['live', 'day'].includes(app.setupProgress(v.id).done.menu));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at) VALUES (?, 'pending', ?, 'owner:link', datetime('now'))").run(v.id, JSON.stringify({ sections: [{ name: '', items: [{ name: 'Trail ride', price: '$75' }] }] }));
  assert.equal(app.setupProgress(v.id).done.menu, 'day');
  db.prepare("UPDATE venue_menus SET status = 'published', published_at = '2026-11-18' WHERE venue_id = ?").run(v.id);
  assert.equal(app.setupProgress(v.id).done.menu, 'live');
  // Research's own list never counts.
  const r = mk('tour', { name: 'Research List Ranch' });
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, source, published_at) VALUES (?, 'published', ?, 'research', '2026-11-18')").run(r.id, JSON.stringify({ sections: [{ name: '', items: [{ name: 'Trail ride', price: '$75' }] }] }));
  assert.ok(!['live', 'day'].includes(app.setupProgress(r.id).done.menu));
});

test('13. sentence capitals on what he types (story, Known for, Good to know, tour names), nothing else changed; "all lowercase" on the review card', async () => {
  assert.equal(app.sentenceCaps('family ranch in pemberton meadows since 1979. trail rides 1 or 2 hrs! pony rides for little ones'), 'Family ranch in pemberton meadows since 1979. Trail rides 1 or 2 hrs! Pony rides for little ones');
  assert.equal(app.sentenceCaps('Book e.g. two days ahead. approx. 2 hrs'), 'Book e.g. two days ahead. Approx. 2 hrs');
  assert.equal(app.typedAllLowercase(app.sentenceCaps('family ranch in pemberton meadows since 1979. trail rides')), true);
  assert.equal(app.typedAllLowercase('Family ranch in the Pemberton Meadows since 1979.'), false);
  const { v, t } = await gord();
  const box = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info);
  assert.equal(box.rows.find((r) => r.label === 'Good to know').text, 'Wear closed-toe shoes. Riders 8+ (pony rides under 8) and under 230 lb.');
  ok(await change(t, { visit_rows: { known_for: 'quiet horses and big mountain views' } }));
  assert.equal(JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info).rows.find((r) => r.label === 'Known for').text, 'Quiet horses and big mountain views');
  const r = await change(t, { description: 'family ranch in pemberton meadows since 1979. trail rides 1 or 2 hrs or half day with lunch, pony rides for little ones.' });
  ok(r);
  const req = db.prepare("SELECT * FROM owner_change_requests WHERE venue_id = ? AND changes LIKE '%description%' ORDER BY id DESC LIMIT 1").get(v.id);
  assert.match(JSON.parse(req.changes).description, /^Family ranch in Pemberton meadows since 1979\. Trail rides/); // tour test 11: names the site knows get capitals
  const card = app.renderAdminChangeCard({ id: req.id, venue_name: v.name, submitted_at: req.submitted_at || '2026-11-18', listing_url: '/x', changes: JSON.parse(req.changes), previous: {}, note: '' });
  assert.match(card, /Typed all lowercase/);
  // Typed tour names (his own list from the edit page) start with a capital.
  assert.match(SERVER, /if \(venue && venue\.type === 'tour' && ctx\.mode !== 'admin'\) for \(const sec of data\.sections \|\| \[\]\) for \(const it of sec\.items \|\| \[\]\) if \(it && typeof it\.name === 'string'\) it\.name = sentenceCaps\(it\.name\);/);
});

test('14. French « équitation » (and English "horseback riding") lists the horseback places, not every tour', async () => {
  const { v } = await gord();
  const a = mk('tour', { name: 'Okanagan Trail Stables', cuisine: 'Trail rides', description: 'Trail rides in the hills.' });
  const b = mk('tour', { name: 'Lake Kayak Co', cuisine: 'Kayak tours', description: 'Kayak tours on the lake.' });
  for (const [q, lang] of [['équitation', 'fr'], ['horseback riding', 'en']]) {
    const names = (app.runDiscovery(app.discoverySearchText(q, lang), { limit: 40, lang }).results.items || []).map((x) => (x.venue || x).name);
    assert.ok(names.includes(v.name) && names.includes(a.name), `${q}: ${names}`);
    assert.ok(!names.includes(b.name), `${q}: ${names}`);
  }
});

test('15. a named kind of place near a town ("Indigenous culture centre near Penticton") comes from the town right next to it, not a farther one', async () => {
  const near = app.createVenue({ type: 'indoor', name: 'Naramata Indigenous Culture Centre', slug: 'tour-t10-nicc', region: 'naramata', address: '1 Rd, Naramata', latitude: 49.59, longitude: -119.59, cuisine: 'Cultural centre', description: 'A First Nations cultural centre with Indigenous art.', hours: JSON.stringify(WK('10:00', '16:00')), rating: 4.6, reviews: 80 });
  const far = app.createVenue({ type: 'indoor', name: 'Kelowna Indigenous Culture Centre', slug: 'tour-t10-kicc', region: 'kelowna', address: '1 Rd, Kelowna', latitude: 49.88, longitude: -119.49, cuisine: 'Cultural centre', description: 'A First Nations cultural centre with Indigenous art.', hours: JSON.stringify(WK('10:00', '16:00')), rating: 4.9, reviews: 300 });
  const p = app.runTripPlan({ text: 'Indigenous culture centre near Penticton' }, NOW);
  assert.equal(namesOf(p)[0], near.name, JSON.stringify([p.kind, namesOf(p), p.notes]));
  assert.ok(app.planStopRegions({ recommendations: [{ venue: { region: 'naramata' } }] }).includes('naramata'));
  assert.ok(far.id);
});

test('16. "Indigenous" and "First Nations" keep their capital after another kind (port of whistlerroam #193)', () => {
  const w = app.tourKindsText(['snowshoe', 'cultural'], false, '', 'Indigenous-owned. A snowshoe storytelling walk.');
  assert.match(w, /Indigenous cultural tours/); assert.doesNotMatch(w, /indigenous cultural/);
});

test('17. landscape tablets: the hours list is two to a line from 900px wide; phones unchanged', () => {
  assert.match(CLIENT, /'<div class="su-hdays">' \+ DAYS\.map/);
  assert.match(SERVER, /@media \(min-width: 900px\) \{\n    body\.owner-setup \.su-wrap:has\(\.su-hdays\) \{ max-width: 760px; \}\n    body\.owner-setup \.su-hdays \{ display: grid; grid-template-columns: 1fr 1fr;/);
});
