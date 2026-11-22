// Sport test 6 fixes (2026-11-20; Priya, a recreation programmer for the City, Kelowna Memorial Arena: setup 7.5, overwhelm
// 8.0, whole thing 7.0; drafts/fresh-eyes-sport6-2026-11-20/REPORT.md). Help on real wording runs in
// tests/help-heldout.test.js (every real owner question from sport tests 1-6 and indoor tests 1-19) and the sport matrix;
// this file is the rest: the building's hours are not the public skate times ("Building open · public skate times change:
// see schedule ↗"), every sport kind's booking button in its own words (a walk-in rink's ice-rental link a smaller button),
// "skating" finds rinks and says "Closed in July", owner lines that say "no …" are no search match, the planner gaps, the
// owner home words, the hours copy buttons, the chip join, one translation item per listing, and the leftovers.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test6-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const SK = require('../sport-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const ARENA_HOURS = { ...WK('06:00', '23:00'), sat: [['07:00', '22:00']], sun: [['07:00', '22:00']] };
let n = 0, ipN = 0, srv, base;
const mk = (type, o = {}) => app.createVenue({ name: `Sport Six ${++n}`, slug: `sport-six-${n}`, region: 'kelowna', type, latitude: 49.886 + n / 4000, longitude: -119.495, rating: 4.5, reviews: 120,
  address: `${n} Ellis St`, phone: '250-555-0160', website: `https://six-${n}.example.com/`, hours: JSON.stringify(WK('09:00', '17:00')), description: 'A fixture for sport test 6.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (v, changes, t = tokenFor(v.id)) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.126.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => { assert.ok([200, 201].includes(r.status), `change ${r.status}`); return r; });
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); if (app.clearHoursExtraCache) app.clearHoursExtraCache(); if (app.clearVenueCaches) app.clearVenueCaches(); };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: sections.map(([name, items]) => ({ name, note: '', items: items.map(([nm, price, d = '']) => ({ name: nm, description: d, price: String(price), dietary: [], check: false })) })) }));
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const retire = (ids) => { for (const id of ids) db.prepare("UPDATE venues SET region = 'retired-fixture' WHERE id = ?").run(id); if (app.clearVenueCaches) app.clearVenueCaches(); };
const pagePath = (v, fr) => `${fr ? '/fr' : ''}/${v.region}/${v.type === 'golf' ? 'golf' : 'sports'}/${app.getVenue(v.id).slug}`;
const statusOf = (h) => { const m = /<p class="venue-open-status"[\s\S]*?<\/p>/.exec(h); return m ? m[0] : ''; };
const JAN = new Date('2027-01-15T10:00:00-08:00');

// Priya's arena as she left it: a rink, drop in, Oct 1 – Mar 15, doors open 6–11 weekdays and 7–10 weekends, her own lines.
async function priya(o = {}, lines = 'Public skate times change: check the schedule. Helmets for kids under 10. No skate rentals or sharpening here: Rutland Arena has both.') {
  const v = mk('sport', { name: `Memorial Arena Fixture ${n + 1}`, kid_friendly: 1, hours: JSON.stringify(ARENA_HOURS), website: 'https://www.kelowna-fixture.example/public-skating-schedules',
    description: 'The old downtown rink with public skating from October and a quieter Seniors Skate. Run by the City.', description_fr: 'La vieille patinoire du centre-ville, avec du patinage libre dès octobre. Gérée par la Ville.', ...o });
  const t = tokenFor(v.id);
  await change(v, { hours: ARENA_HOURS, open_months: '10-01:03-15' }, t);
  await change(v, { indoor_info: { kinds: ['rink'], length: '1-2h', book: 'no', age: 'all', year: 'seasonal' }, indoor_price: 5 }, t);
  if (lines) await change(v, { visit_rows: { good_to_know: lines } }, t);
  await change(v, { booking_url: 'https://www.kelowna-fixture.example/facility-bookings/ice-rentals' }, t);
  approveAll(v.id);
  return { v, t };
}

test('1. a rink’s doors-open hours are not its skating times: "Building open · public skate times change: see schedule ↗" on the page (EN + FR), cards, and the planner stop; the hours screen says so; Help too', async () => {
  const { v, t } = await priya();
  const en = await getText(pagePath(v)), fr = await getText(pagePath(v, true));
  // Inside the doors-open hours (the fixture's "now" is the real clock: only when the page says open).
  const st = statusOf(en);
  if (/data-open="open"/.test(st)) {
    assert.match(st, /data-times-change/);
    assert.match(st, /Building open · public skate times change: see schedule ↗/);
    assert.match(st, /href="https:\/\/www\.kelowna-fixture\.example\/public-skating-schedules"/);
    assert.doesNotMatch(st, /Closes 11 PM|Open now/);
    assert.match(statusOf(fr), /Aréna ouvert · horaire du patinage libre variable : voir l’horaire ↗/);
  }
  // The card line, and its French.
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(v.id);
  const card = app.foodDrinkOpenNowInfo([row], new Map(), new Date('2027-01-13T12:00:00-08:00'), { requireVerified: false }).byId.get(v.id);
  assert.equal(card.state, 'open'); assert.equal(card.text, 'Building open · public skate times change');
  assert.equal(app.frStatusText('Building open · public skate times change'), 'Aréna ouvert · horaire du patinage libre variable');
  // A rink whose own line gives set public skate times and never says they change keeps the plain open line.
  const { v: fixed } = await priya({}, 'Public skate daily 1–3 PM. Helmets for kids.');
  assert.equal(app.sportTimesChange(app.getVenue(fixed.id)), null);
  // Any kind whose owner says the times change ("check the schedule") gets the line too, in its words.
  const court = mk('sport', { name: 'Court Fixture Six' });
  await change(court, { indoor_info: { kinds: ['courts'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 'free' });
  await change(court, { visit_rows: { good_to_know: 'Drop-in times change by season: check our schedule.' } });
  approveAll(court.id);
  assert.match(app.sportTimesChange(app.getVenue(court.id)).card[0], /^Open · activity times change$/);
  // Build My Trip: the stop says to check the schedule, with where.
  const plan = app.runTripPlan({ text: 'skating with my 5 year old in Kelowna on Saturday' }, JAN);
  const stop = itemsOf(plan).find((x) => x.venue.id === v.id);
  assert.ok(stop, 'planned');
  assert.match(stop.venue.timesChange.en, /^Public skate times change: check the schedule before you go \(kelowna-fixture\.example\)$/);
  assert.match(stop.venue.timesChange.fr, /vérifiez l’horaire avant d’y aller/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8'), /t3-times-change/);
  // The hours screen's one line (no new button), EN + FR, and Help's answer says what the page will say.
  const TXT = require('../owner-setup-text.js');
  assert.match(TXT.en.indoor.kindText.rink.classNightsHint, /^Public skate times change week to week\? Enter the hours the building is open; your page will say to check the schedule\.$/);
  assert.match(TXT.fr.indoor.kindText.rink.classNightsHint, /vérifier l’horaire/);
  assert.match(TXT.en.indoor.kindText.swim.classNightsHint, /Public swim times/);
  const setup = await getText(`/owner/${t}/setup`);
  assert.doesNotMatch(setup, /Our public times change weekly/, 'no third hours button');
  retire([v.id, fixed.id, court.id]);
});

test('2. every sport kind names what its booking link is for; a walk-in place’s link is a smaller button after Website; the page, the prices page and the planner agree', async () => {
  for (const k of SK.SPORT_KINDS) {
    const b = SK.K[k].bookBtn;
    assert.ok(Array.isArray(b) && b[0] && b[1] && !/visit/i.test(b[0]), `${k} has its own book button`);
  }
  assert.deepEqual(SK.K.rink.bookBtn, ['Rent the ice', 'Louer la glace']);
  assert.deepEqual(SK.K.courts.bookBtn, ['Book a court', 'Réserver un terrain']);
  const { v } = await priya();
  publish(v.id, [['Public skating', [['Adult public skate', 5], ['Shinny', 9]]]]);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const en = await getText(pagePath(v)), fr = await getText(pagePath(v, true));
  const book = /<a [^>]*data-track="booking"[^>]*>([^<]*)<\/a>/.exec(en);
  assert.ok(book, 'a booking link');
  assert.match(book[0], /data-book-secondary/);
  assert.equal(book[1].trim(), 'Rent the ice');
  assert.doesNotMatch(en, />Book a visit</);
  assert.match(/<a [^>]*data-track="booking"[^>]*>([^<]*)<\/a>/.exec(fr)[1], /Louer la glace/);
  // After Website in the main buttons, never first.
  const primary = /<div class="kl-primary">([\s\S]*?)<\/div>/.exec(en);
  if (primary) assert.ok(primary[1].indexOf('data-track="website"') < primary[1].indexOf('data-track="booking"'), 'Website before the ice rentals');
  const prices = await getText(`${pagePath(v)}/prices`);
  assert.match(prices, /data-track="booking">Rent the ice ↗/);
  const pricesFr = await getText(`${pagePath(v, true)}/prices`);
  assert.match(pricesFr, /data-track="booking">Louer la glace ↗/);
  assert.doesNotMatch(plain(pricesFr), /avant de réserver/);
  assert.deepEqual(app.indoorBookButton(app.getVenue(v.id), 'https://www.kelowna-fixture.example/facility-bookings/ice-rentals'), ['Rent the ice', 'Louer la glace']);
  // A party page is "Book a party"; a booking kind keeps its own button first.
  assert.match(app.indoorBookButton(app.getVenue(v.id), 'https://example.com/birthday-parties')[0], /party/i);
  const sim = mk('golf', { name: 'Sim Fixture Six' });
  await change(sim, { indoor_info: { kinds: ['simgolf'], length: '1-2h', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 45 });
  approveAll(sim.id);
  assert.deepEqual(app.indoorBookButton(app.getVenue(sim.id), 'https://example.com/book'), ['Book a bay', 'Réserver une baie']);
  retire([v.id, sim.id]);
});

test('3. search: skating, shinny and drop-in hockey find the arena (owner’s rink first), with kids too; "skating in july" says Closed in July (EN + FR); a "no skate rentals" line is no match', async () => {
  const { v } = await priya();
  const outd = mk('outdoor', { name: 'Stuart Park Rink Six', description: 'A free outdoor skating rink downtown, open in winter.', hours: JSON.stringify(WK('10:00', '22:00')), rating: 4.9, reviews: 900 });
  const find = async (q, fr) => plain(await getText(`${fr ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
  const name = app.getVenue(v.id).name;
  for (const q of ['skating with kids kelowna', 'skating kelowna', 'shinny kelowna', 'drop in hockey kelowna', 'public skate kelowna']) {
    const p = await find(q);
    assert.ok(p.includes(name), `${q} finds her`);
    if (!/kids/.test(q) && p.includes(outd.name)) assert.ok(p.indexOf(name) < p.indexOf(outd.name), `${q}: the owner’s arena first`);
  }
  const july = await find('skating in july kelowna');
  assert.match(july.slice(july.indexOf(name), july.indexOf(name) + 300), /Closed in July \(reopens Oct 1\)/);
  const juillet = await find('patinage en juillet kelowna', true);
  assert.match(juillet.slice(juillet.indexOf(name), juillet.indexOf(name) + 300), /Fermé en juillet \(réouverture le 1er oct\.\)/);
  // Her "No skate rentals or sharpening here" line is never read as rentals.
  assert.equal(app.searchWithoutNegated('Helmets for kids. No skate rentals or sharpening here: Rutland Arena has both.'), 'Helmets for kids. : Rutland Arena has both.');
  assert.equal(app.searchWithoutNegated('We don’t have skate rentals, but we sharpen'), ', but we sharpen');
  assert.equal(app.searchWithoutNegated('Pas de location de patins; casques pour les enfants'), '; casques pour les enfants');
  const rentals = await find('skate rentals kelowna');
  assert.doesNotMatch(rentals, /Mentions “skate”, “rentals”|Mentions "skate", "rentals"/);
  retire([v.id, outd.id]);
});

test('4. Build My Trip: drop-in hockey and shinny are a rink; a cold or snowy day counts as indoor; skating with a 5 year old plans her', async () => {
  const { v } = await priya();
  const museum = mk('indoor', { name: 'Museum Fixture Six', kid_friendly: 1, rating: 4.8, reviews: 800, hours: JSON.stringify(WK('10:00', '17:00')) });
  const climb = mk('indoor', { name: 'Climbing Fixture Six', kid_friendly: 1, rating: 4.9, reviews: 900, hours: JSON.stringify(WK('10:00', '21:00')) });
  const planned = (q) => itemsOf(app.runTripPlan({ text: q }, JAN)).some((x) => x.venue.id === v.id);
  assert.ok(planned('drop in hockey in Kelowna Friday night'), 'drop in hockey');
  assert.ok(planned('shinny in Kelowna on Saturday'), 'shinny');
  assert.ok(planned('skating with my 5 year old in Kelowna'), '5 year old + skating');
  const cold = app.runTripPlan({ text: 'cold day, something indoor in Kelowna' }, JAN);
  assert.doesNotMatch(JSON.stringify(cold.notes || cold.planningNotes || []), /doesn’t list “cold”/);
  retire([v.id, museum.id, climb.id]);
});

test('5. owner home: a rink’s Add an event and door tiles in its own words (EN + FR)', async () => {
  const { v, t } = await priya();
  const home = plain(await getText(`/owner/${t}`)), homeFr = plain(await getText(`/fr/owner/${t}`));
  assert.match(home, /Family skates, hockey games, special skates and more/);
  assert.doesNotMatch(home, /Tournaments, clinics, leagues/);
  assert.match(homeFr, /Patinages familiaux, matchs de hockey, patinages spéciaux et plus/);
  if (/Help people find your door/.test(home)) { assert.match(home, /A photo of the main entrance/); assert.doesNotMatch(home, /storefront/i); }
  if (/trouver votre porte/.test(homeFr)) assert.doesNotMatch(homeFr, /devanture/);
  retire([v.id]);
});

test('6. hours: Sat–Sun from Saturday opens a Sunday never set; a day marked Closed stays closed and the screen says so; "Open this day" takes the day before it', async () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  assert.match(s, /if \(!savedOpenAny\(\) && !\(S\.closedTap \|\| \{\}\)\[S\.step \+ x\]\) wk\[x\] = clone\(src\); else S\.copySkipped\.push\(x\);/);
  assert.match(s, /for \(var k = 1; k < 7 && !before; k\+\+\) \{ var px = DAYS\[\(di - k \+ 7\) % 7\]; if \(wk\[px\]\) before = wk\[px\]; \}/);
  const TXT = require('../owner-setup-text.js');
  assert.match(TXT.en.copySkipped || TXT.en.indoor.copySkipped || '', /stayed closed \(marked Closed\)/);
  // Run the named-copy rule as the page runs it: a new page (no saved hours), Mon–Fri set, Saturday set, Sunday never set.
  const body = /(S\.copySkipped = \[\]; S\.copyFrom = d;\n[^\n]*\n)/.exec(s)[1];
  const run = (week, d, we, tapped, saved) => {
    const S = { week: JSON.parse(JSON.stringify(week)), step: 'hours:edit', closedTap: Object.fromEntries((tapped || []).map((x) => [`hours:edit${x}`, true])) };
    new Function('S', 'd', 'all', 'we', 'wk', 'src', 'clone', 'savedOpenAny', body)(S, d, false, we, S.week, S.week[d], (o) => JSON.parse(JSON.stringify(o)), () => !!saved);
    return S;
  };
  const wk = { ...WK('06:00', '23:00'), sat: [['07:00', '22:00']], sun: null };
  const a = run(wk, 'sat', true);
  assert.deepEqual(a.week.sun, [['07:00', '22:00']], 'Sunday opens with Saturday’s hours');
  const b = run(wk, 'sat', true, ['sun']);
  assert.equal(b.week.sun, null); assert.deepEqual(b.copySkipped, ['sun']);
  const c = run(wk, 'sat', true, [], true);
  assert.equal(c.week.sun, null, 'closed in her saved hours: stays closed'); assert.deepEqual(c.copySkipped, ['sun']);
});

test('7. chips then typing: "under", "through", ages and numbers carry the chip on (paste, dictation and typing); saving tidies the same', async () => {
  const { openSetup } = require('./setup-sim.js');
  const { t } = await priya({}, '');
  const sim = await openSetup(base, t, { hash: 'bring' });
  const box = sim.doc.getElementById('suBring');
  const chip = (label) => sim.click(`[data-quick="${label}"]`);
  // Paste (one go, with a space first).
  await sim.type('suBring', ''); await chip('Helmets for kids');
  await sim.type('suBring', `${box.value} under 10`);
  assert.equal(box.value, 'Helmets for kids under 10');
  // Dictation (one go, no space first).
  await sim.type('suBring', ''); await chip('Helmets for kids');
  await sim.type('suBring', `${box.value}ages 5 and up`);
  assert.equal(box.value, 'Helmets for kids ages 5 and up');
  // Typed key by key.
  await sim.type('suBring', ''); await chip('Helmets for kids');
  for (const ch of 'under 10') await sim.type('suBring', box.value + ch);
  assert.equal(box.value, 'Helmets for kids under 10');
  // A number.
  await sim.type('suBring', ''); await chip('Helmets for kids');
  await sim.type('suBring', `${box.value} 10 and under`);
  assert.equal(box.value, 'Helmets for kids 10 and under');
  // A new sentence still starts one.
  await sim.type('suBring', ''); await chip('Helmets for kids');
  await sim.type('suBring', `${box.value}concession open weekends`);
  assert.equal(box.value, 'Helmets for kids. Concession open weekends');
  // Saved as it arrived before the fix: tidied on save.
  assert.equal(app.ownerTextClean('Helmets for kids. under 10.', { short: true }), 'Helmets for kids under 10.');
  assert.equal(app.ownerTextClean('Private ice rentals. through the City booking office', { short: true }), 'Private ice rentals through the City booking office');
});

test('8. one translation item per listing: her Good to know, Groups, Known for and price names join one open review row', async () => {
  const v = mk('sport', { name: 'Translate Fixture Six' });
  const t = tokenFor(v.id);
  await change(v, { indoor_info: { kinds: ['rink'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 5 }, t);
  await change(v, { visit_rows: { good_to_know: 'Helmets for kids under 10.' } }, t);
  await change(v, { visit_rows: { groups: 'Private ice rentals by the hour.' } }, t);
  await change(v, { visit_rows: { known_for: 'Seniors Skate on weekday mornings' } }, t);
  await change(v, { visit_rows: { good_to_know: 'Helmets for kids under 10. Skate aids for beginners.' } }, t);
  const rows = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines' AND status = 'help'").all(v.id);
  assert.equal(rows.length, 1, rows.map((r) => r.help_note).join('\n'));
  assert.match(rows[0].help_note, /Good to know: Helmets for kids under 10\. Skate aids for beginners\./);
  assert.match(rows[0].help_note, /Groups: Private ice rentals by the hour\./);
  assert.match(rows[0].help_note, /Known for: Seniors Skate on weekday mornings/);
  assert.doesNotMatch(rows[0].help_note, /Good to know: Helmets for kids under 10\. \|/);
  retire([v.id]);
});

test('9. leftovers: a priced line with no name stays open and asks for one; thousands keep their separator; "per season" in French; the French sports hub’s chips and sort in French', async () => {
  const { v, t } = await priya();
  const menu = await getText(`/owner/${t}/menu`);
  assert.match(menu, /Give this line a name first/);
  assert.match(menu, /if \(ci && !String\(ci\.name \|\| ''\)\.trim\(\) && \(String\(ci\.price \|\| ''\)\.trim\(\) \|\| String\(ci\.description \|\| ''\)\.trim\(\)\)\)/);
  assert.equal(app.menuPriceLabel('1099'), '$1,099');
  assert.match(app.menuPriceLabel('1099', 'fr'), /^1[\s\u00a0\u202f]099[\s\u00a0\u202f]\$$/);
  publish(v.id, [['Passes', [['Season pass', '1099 per season']]]]);
  if (app.clearVenueCaches) app.clearVenueCaches();
  assert.match(plain(await getText(pagePath(v, true))), /1 099 \$ par saison/);
  const hub = plain(await getText('/fr/kelowna/sports'));
  for (const en of ['Skate Parks & BMX', 'Mountain Biking', 'Tennis, Pickleball & More', 'Ice Skating & Hockey', 'Largest places first']) assert.ok(!hub.includes(en), `FR hub: ${en}`);
  assert.match(hub, /Patinage et hockey/);
  // Her hub card's activity is her own kind's (never "Skate Parks & BMX" from "Seniors Skate").
  assert.deepEqual(app.sportActivitiesOf(app.getVenue(v.id)), ['ice']);
  retire([v.id]);
});

test('10. Help: "add the holiday skates" never lands on closures; closures still answer a closed day; the city answers need their intent', async () => {
  const { t } = await priya();
  const bot = async (p) => {
    const html = await getText(p);
    const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
    const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
    const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
    vm.createContext(ctx); vm.runInContext(m[2], ctx);
    const topics = JSON.parse(m[1]).topics;
    return (q) => { const r = ctx.window.__ohbBest(q); const tp = topics.find((x) => x.id === r.id); return { id: r.id, a: tp ? String(tp.a).replace(/<[^>]+>/g, '') : '' }; };
  };
  const edit = await bot(`/owner/${t}`), setup = await bot(`/owner/${t}/setup`);
  const hol = edit('how do i add the holiday skates dec 26 to jan 3 so people see them');
  assert.equal(hol.id, 'sport-extra-sessions');
  assert.match(hol.a, /Holiday public skates, December 26, 1–3 PM/); assert.match(hol.a, /daily to January 3/); assert.match(hol.a, /Dec 24: public skate until 4 PM/);
  assert.match(edit('we are closed on dec 25').id, /closures|setup-closures/);
  assert.match(edit('closed christmas day').id, /closures/);
  assert.notEqual(setup('the schedule is posted on the city website every week, can i just link to that').id, 'sport-public');
  assert.equal(setup('can i say its a city of kelowna facility? i dont want it to look like the city is endorsing your site').id, 'sport-city-say');
  assert.equal(setup('our photos have kids in them from public skates. is that a problem? the city has a photo consent policy').id, 'sport-photo-consent');
  assert.equal(setup('do i need to sign anything or agree to terms as a city employee').id, 'sport-terms');
  assert.equal(setup('we run shinny and stick and puck too. do those go here or somewhere else?').id, 'sport-drop-in-hockey');
  assert.equal(setup('l’horaire du patinage libre change chaque semaine, quoi mettre comme heures?').id, 'indoor-swim-times');
  assert.equal(setup('la glace est enlevée en été, que dit la page?').id, 'sport-season-says');
  assert.match(setup('public skate times change every week. what do i put for hours?').a, /Building open · public skate times change: see schedule/);
});
