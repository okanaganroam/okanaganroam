// Sport test 7 fixes (2026-11-20; Kayla, marketing & events coordinator, Predator Ridge — Predator Course: setup 7.5,
// overwhelm 8.0, whole thing 7.0; drafts/fresh-eyes-sport7-2026-11-20/REPORT.md). Help on blind wording runs in
// tests/help-blind-sport7.test.js and her own questions in tests/help-heldout.test.js; this file is the rest: THE SPORT
// HEADLINE RULE (her typed $210, never "Replay round $150"), the Book words of unclaimed listings, the value box, a
// seasonal happy hour that lasts its season, the Groups size chip, a stale research Winter row, the Patio badge from her
// own chip, search (courses first in season, Thanksgiving, wheelchair accessible), Build My Trip (lessons and camps from her
// price list, the clubhouse dinner, French holidays and « les 17 et 18 juillet », a closure note) and test 4's leftovers.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test7-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { kayla, neighbours, K } = require('./sport7-kayla-fixture.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = (o, c) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[o, c]]]));
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.127.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => { assert.ok([200, 201].includes(r.status), `change ${r.status}`); return r; });
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); if (app.clearHoursExtraCache) app.clearHoursExtraCache(); if (app.clearVenueCaches) app.clearVenueCaches(); };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[\s  ]+/g, ' ');
const page = (v, now, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const retire = (ids) => { for (const id of ids) db.prepare("UPDATE venues SET region = 'retired-fixture' WHERE id = ?").run(id); if (app.clearVenueCaches) app.clearVenueCaches(); };
const NOV = new Date('2026-11-20T12:00:00-08:00');
const mkSport = (type, o = {}) => app.createVenue({ name: `Sport Seven ${++n}`, slug: `sport-seven-${n}`, region: 'kelowna', type, latitude: 49.886 + n / 4000, longitude: -119.495, rating: 4.5, reviews: 120,
  address: `${n} Ellis St`, website: `https://seven-${n}.example.com/`, hours: JSON.stringify(WK('09:00', '17:00')), description: 'A fixture for sport test 7.', description_fr: 'Un lieu de test.', ...o });
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: sections.map(([name, items]) => ({ name, note: '', items: items.map(([nm, price, d = '']) => ({ name: nm, description: d, price: String(price), dietary: [], check: false })) })) }));

test('1. THE SPORT HEADLINE RULE: her typed $210 is the headline on the page, the card, Build My Trip and Help (EN + FR); "Replay round", twilight and guests never lower it; a plain 9 holes does; a skipped Price step takes the lowest plain line', async () => {
  const v = kayla(app, db);
  const en = plain(page(v, NOV)), fr = plain(page(v, NOV, 'fr'));
  if (!/Green fees from \$210\./.test(en)) console.log('PAGE', en.slice(0, 3000));
  assert.match(en, /Green fees from \$210\./); assert.doesNotMatch(en, /from \$150/);
  assert.match(fr, /Droits de jeu à partir de 210 \$/);
  assert.equal(app.cardPriceFor(v.id), 'From $210');
  const f = app.indoorPlannerFacts(v.id);
  assert.equal(f.indoorPriceAt, 210);
  // The setup preview and Help read the same lowest line (none lower than hers).
  assert.equal(app.indoorLowestTyped(v.id), 210, 'her lowest plain line is her own $210, never the replay');
  const t = tokenFor(v.id);
  const g = await openSetup(base, t, { hash: 'price' });
  assert.match(plain(g.doc.getElementById('suTpriceLead').textContent), /Green fees from \$210/);
  const help = await getText(`/owner/${t}/setup`);
  assert.match(help, /Green fees from \$210/); assert.doesNotMatch(help, /Green fees from \$150/);
  // Each qualified line, by its own name, never lowers it, whatever its section; a plain adult round does.
  for (const nm of ['Replay round', 'Twilight 18 holes', 'Resort guest rate', 'Stay and play', 'Member rate', 'Guest of member', 'Junior 18 holes', 'Senior 18 holes', 'Military 18 holes', 'Group rate 18 holes', 'Early bird 18 holes', 'Off-peak 18 holes', 'Shoulder season 18 holes', 'Second round', '18 holes package']) assert.equal(app.sportPriceLineCounts('golf', nm, '', 'Green fees'), false, nm);
  for (const nm of ['18 holes', '9 holes, weekdays', 'Green fee', '18 holes, spring']) assert.equal(app.sportPriceLineCounts('golf', nm, '', 'Rates'), true, nm);
  assert.equal(app.sportPriceLineCounts('golf', 'Weekday', '', 'Green fees'), false, 'a section never makes a line a green fee');
  const nine = kayla(app, db, { slug: 'predator-fixture-nine', name: 'Predator Nine Fixture', menu: { sections: [...K.menu.sections, { name: 'Nine', note: '', items: [{ name: '9 holes', description: '', price: '120', dietary: [], check: false }] }] } });
  assert.equal(app.cardPriceFor(nine.id), 'From $120');
  // No Price-step answer: the lowest plain regular line is the headline.
  const skip = kayla(app, db, { slug: 'predator-fixture-skip', name: 'Predator Skip Fixture', sportInfo: { price: null } });
  assert.equal(app.indoorPriceValue(skip.id), null, 'her own answer stays unanswered');
  assert.equal(app.cardPriceFor(skip.id), 'From $210');
  assert.match(plain(page(skip, NOV)), /Green fees from \$210\./);
  retire([v.id, nine.id, skip.id]);
});

// Main's button words for the same unclaimed listings (recorded on a fresh origin/main worktree, 2026-11-20, with the probe
// in this test): every kind's research link, research label, owner-style link, and both. The branch says the same or the
// kind's own words: "Book a tee time" / « Réserver un départ » for a golf course.
const MAIN_BOOK = { 'research-label': ['Book online', 'Réserver en ligne'], 'research-nolabel': ['Book', 'Réserver'], 'link-only': ['Book', 'Réserver'], 'link+label': ['Book', 'Réserver'] };
test.beforeEach(() => { for (const r of db.prepare("SELECT id FROM venues WHERE region = 'vernon'").all()) db.prepare("UPDATE venues SET region = 'retired-fixture' WHERE id = ?").run(r.id); });
test('2. Book on unclaimed listings of every kind: the words main says, or the kind’s own (a golf course: "Book a tee time" / « Réserver un départ »), EN + FR; never a plainer word than main', async () => {
  const U = 'https://example.com/book-tee-time/';
  const kinds = [['golf', 'golf', 'Okanagan Hills Golf Club'], ['range', 'golf', 'Lakeside Driving Range'], ['minigolf', 'golf', 'Sunny Mini Golf'], ['discgolf', 'sport', 'Park Disc Golf Course'], ['rink', 'sport', 'Memorial Arena'],
    ['swim', 'sport', 'Parkinson Outdoor Pool'], ['skatepark', 'sport', 'Downtown Skate Park'], ['bike', 'sport', 'Valley Bike Park'], ['courts', 'sport', 'City Tennis Courts'], ['skischool', 'sport', 'Ski & Board School'], ['sportsctr', 'sport', 'Valley Sports Centre']];
  const made = [];
  for (const [k, type, name] of kinds) for (const sc of Object.keys(MAIN_BOOK)) {
    const v = mkSport(type, { name: `${name} ${sc}` });
    made.push(v.id);
    const label = k === 'golf' ? 'Book a tee time' : 'Book online';
    if (sc !== 'link-only') db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Booking', text: 'Book online.' }], booking_url: U, ...(sc === 'research-nolabel' ? {} : { booking_label: label }) }));
    if (sc === 'link-only' || sc === 'link+label') db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?)').run(v.id, U);
    if (app.clearVenueCaches) app.clearVenueCaches();
    const seg = type === 'golf' ? 'golf' : 'sports';
    const words = [];
    for (const fr of [false, true]) { const h = await getText(`${fr ? '/fr' : ''}/kelowna/${seg}/${app.getVenue(v.id).slug}`); const m = /<a class="cta[^"]*"[^>]*data-track="booking"[^>]*>([^<]*)<\/a>/.exec(h); words.push(m ? m[1].trim() : null); }
    const main = k === 'golf' && sc === 'research-label' ? ['Book a tee time', 'Réserver'] : MAIN_BOOK[sc];
    if (k === 'golf') assert.deepEqual(words, ['Book a tee time', 'Réserver un départ'], `${k} ${sc}: ${words}`);
    else if (sc === 'link+label') assert.deepEqual(words, ['Book online', 'Réserver en ligne'], `${k} ${sc}: research's own words for its own link (main said ${main})`);
    else assert.deepEqual(words, main, `${k} ${sc}: ${words} (main ${main})`);
  }
  retire(made);
});

test('3. the value box: research’s value index (its $300, "Nothing extra included") goes once her own price list is published; without one it stays', async () => {
  const v = kayla(app, db, { slug: 'predator-ridge-predator-course', name: 'Predator Value Fixture' });
  const h = page(v, NOV);
  assert.doesNotMatch(h, /class="golf-value/); assert.doesNotMatch(plain(h), /Nothing extra included/);
  // Without her list, research's value box is the page's (as before).
  db.prepare("UPDATE venue_menus SET status = 'removed' WHERE venue_id = ?").run(v.id); if (app.clearVenueCaches) app.clearVenueCaches();
  assert.match(page(v, NOV), /class="golf-value/);
  const bare = v;
  retire([v.id, bare.id]);
});

test('4. a seasonal happy hour checked in November shows its deals all season (Jul 31, Aug 20, Sep 20, Oct 5); the Happy Hour badge hides while the place is closed for the season', async () => {
  const v = kayla(app, db);
  for (const d of ['2027-04-20', '2027-07-20', '2027-07-31', '2027-08-20', '2027-09-20', '2027-10-05']) {
    const h = page(v, new Date(`${d}T16:00:00-07:00`));
    assert.match(plain(h), /\$7 pints/, `deals on ${d}`);
  }
  // Stale again once the season it covered is over and 120 open days have passed (the next summer).
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(v.id);
  assert.equal(app.happyHourDealsShown(row, new Date('2028-09-20T16:00:00-07:00')), null);
  const chipsOf = (h) => { const i = h.indexOf('Great for Groups'); return i < 0 ? '' : h.slice(Math.max(0, i - 900), i + 900); };
  const jan = page(v, new Date('2027-01-16T12:00:00-08:00'));
  assert.ok(chipsOf(jan), 'the badge row');
  assert.doesNotMatch(chipsOf(jan), /Happy Hour/, 'no Happy Hour badge while closed for the season');
  retire([v.id]);
});

test('5. the Groups size chip never replaces research’s sentence that states a size: "groups of 16 plus get special rates" stays, 15+ shows pressed', async () => {
  const v = mkSport('golf', { name: 'Groups Seven Course' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ rows: [{ label: 'Groups', text: 'Tournaments for 8 to 144 players across both courses; groups of 16 plus get special rates.' }], checked_at: '2026-11-01' }));
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 99 });
  const g = await openSetup(base, t, { hash: 'groups' });
  const box = g.doc.getElementById('suGroupsLine');
  assert.ok(box, 'the Groups box');
  assert.equal(g.doc.querySelectorAll('[data-bgroup="15"]')[0].getAttribute('aria-pressed'), 'true', 'the chip matches research’s 16');
  await g.click('[data-bgroup="15"]');
  assert.match(box.value, /groups of 16 plus get special rates/);
  assert.match(box.value, /Tournaments for 8 to 144 players/);
  retire([v.id]);
});

test('6. a research Winter or Season row’s dated sentence hides once it is past or her own season says it; its other sentences stay (every kind)', async () => {
  const v = kayla(app, db);
  const jul = plain(page(v, new Date('2027-07-17T12:00:00-07:00')));
  assert.doesNotMatch(jul, /Course season ended Sept 27/);
  assert.match(jul, /Callaway SIM Lounge in the clubhouse/);
  // A listing with no season of its own: shown in November, gone the next summer.
  const r = mkSport('sport', { name: 'Seven Rink Stale' });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(r.id, JSON.stringify({ rows: [{ label: 'Season', text: 'Ice season ended March 15. Summer camps run in July.' }], checked_at: '2026-04-01' }));
  if (app.clearVenueCaches) app.clearVenueCaches();
  assert.match(plain(page(r, new Date('2026-05-01T12:00:00-07:00'))), /Ice season ended March 15/);
  const later = plain(page(r, new Date('2026-11-20T12:00:00-08:00')));
  assert.doesNotMatch(later, /Ice season ended March 15/);
  assert.match(later, /Summer camps run in July/);
  retire([v.id, r.id]);
});

test('7. her own "Restaurant and patio on site" chip sets the Patio badge on approval; "golf restaurant patio vernon" finds her', async () => {
  const v = mkSport('golf', { name: 'Patio Seven Golf Course', region: 'vernon', description: 'An 18-hole golf course.' });
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 90 });
  await change(t, { visit_rows: { good_to_know: 'Restaurant and patio on site, open to everyone.' } });
  approveAll(v.id);
  assert.equal(db.prepare('SELECT patio FROM venues WHERE id = ?').get(v.id).patio, 1);
  const s = plain(await getText(`/search?q=${encodeURIComponent('golf restaurant patio vernon')}`));
  assert.match(s, /Patio Seven Golf Course/);
  retire([v.id]);
});

test('8. search: in July courses come before simulators for "golf"; Thanksgiving is a date; "wheelchair accessible" reads her own tile', async () => {
  const v = kayla(app, db); const nb = neighbours(app, db);
  const order = (h) => { const t = plain(h); return ['Predator Ridge Fixture Course', 'Back Nine Indoor Golf Fixture', 'Hillview Golf Course Fixture'].map((x) => t.indexOf(x)); };
  const [kj, sj, hj] = order(await getText(`/search?q=${encodeURIComponent('golf in july vernon')}`));
  assert.ok(kj >= 0 && hj >= 0 && sj >= 0 && kj < sj && hj < sj, `July: courses first (${kj}, ${hj}, ${sj})`);
  const th = plain(await getText(`/search?q=${encodeURIComponent('golf on thanksgiving vernon')}`));
  assert.doesNotMatch(th, /“thanksgiving” isn’t something search can apply/);
  assert.match(th, /Oct 11|October 11/);
  const wc = plain(await getText(`/search?q=${encodeURIComponent('wheelchair accessible golf vernon')}`));
  assert.doesNotMatch(wc, /isn’t something search can apply yet/);
  assert.ok(wc.indexOf('Predator Ridge Fixture Course') >= 0 && wc.indexOf('Predator Ridge Fixture Course') < wc.indexOf('Hillview Golf Course Fixture'), 'her tile first');
  retire([v.id, ...Object.values(nb).map((x) => x.id)]);
});

test('9. Build My Trip: lessons and a junior camp from her own price list plan her course; the clubhouse dinner is at her course; French holidays and « les 17 et 18 juillet »; a closure note', async () => {
  const v = kayla(app, db); const nb = neighbours(app, db);
  db.prepare('UPDATE venues SET patio = 1 WHERE id = ?').run(v.id); if (app.clearVenueCaches) app.clearVenueCaches();
  const has = (p) => itemsOf(p).some((x) => x.venue.id === v.id);
  for (const q of ['golf lessons in Vernon on Saturday July 17 2027', 'golf lesson for my 12 year old in Vernon on Saturday July 17 2027', 'junior golf camp in Vernon in July 2027']) {
    const p = app.runTripPlan({ text: q }, NOV);
    assert.ok(has(p), `${q}: planned (${p.summary} | ${itemsOf(p).map((x) => x.venue.name).join(', ')} | ${JSON.stringify(p.notes)})`);
    assert.ok(!(p.notes || []).some((x) => /doesn’t list “(?:lessons?|junior)”/.test(x)), `${q}: no "doesn't list" note`);
  }
  // Research's Practice row stays (without its prices) once her list is published: Build My Trip reads it.
  assert.match(app.sportPracticeKept(app.getVenue(v.id), 'Range $25 per bag or $75 day pass. Academy lessons, clinics and club fittings offered.'), /^Academy lessons, clinics and club fittings offered\.$/);
  const club = app.runTripPlan({ text: 'round of golf then dinner on a patio at the clubhouse in Vernon on Saturday July 17 2027' }, NOV);
  const st = (club.itinerary && club.itinerary.stops) || [];
  assert.ok(st.some((x) => x.venue && x.venue.id === v.id && /golf/i.test(x.label)), 'the golf stop is her course');
  const dinner = st.find((x) => /dinner/i.test(x.label || ''));
  assert.ok(dinner && dinner.venue.id === v.id, 'dinner at her course’s own restaurant');
  assert.match(dinner.why[0], /At the course itself: Restaurant and patio on site/);
  // French holidays are dates, never « fête » plus a place word.
  for (const [q, when] of [['golf à Vernon le jeudi 1er juillet 2027 (fête du Canada)', /Jul 1/], ['golf à Vernon pour la fête de la Reine 2027', /May 24/], ['golf à Vernon pour l’Action de grâce 2027', /Oct 11/], ['golf à Vernon le jour de l’An 2027', /Jan 1/]]) {
    const p = app.runTripPlan({ text: q, lang: 'fr' }, NOV);
    assert.match(String(p.understood.when || ''), when, `${q}: ${p.understood.when}`);
    assert.equal(p.understood.occasion, null, `${q}: no celebration`);
    assert.ok(!(p.understood.interests || []).some((x) => /canada|reine|grace|an”/i.test(x)), `${q}: ${p.understood.interests}`);
  }
  assert.ok(has(app.runTripPlan({ text: 'golf à Vernon le jeudi 1er juillet 2027 (fête du Canada)', lang: 'fr' }, NOV)), 'planned on Canada Day (FR)');
  const wk = app.runTripPlan({ text: 'week-end de golf à Vernon les 17 et 18 juillet 2027', lang: 'fr' }, NOV);
  assert.match(String(wk.understood.when), /Sat, Jul 17 – Sun, Jul 18/);
  const wk2 = app.runTripPlan({ text: 'golf à Vernon les 16, 17 et 18 juillet 2027', lang: 'fr' }, NOV);
  assert.match(String(wk2.understood.when), /Jul 16/);
  // A dated plan that leaves her out for her one-off closure says so.
  const aug = app.runTripPlan({ text: 'golf in Vernon on Saturday August 14, 2027' }, NOV);
  assert.ok(!has(aug));
  assert.ok((aug.warnings || []).includes('Closed Aug 13–15 (member-guest tournament): Predator Ridge Fixture Course.'), JSON.stringify(aug.warnings));
  const augFr = app.runTripPlan({ text: 'golf à Vernon le samedi 14 août 2027', lang: 'fr' }, NOV);
  assert.ok((augFr.warnings || []).some((w) => /^Fermé du 13 au 15 août/.test(w)), JSON.stringify(augFr.warnings));
  retire([v.id, ...Object.values(nb).map((x) => x.id)]);
});

test('10. test 4 leftovers: "What are your hours?" with no hours; a golf course’s new day starts at 7 AM, not 10 to 5; the price preview shows on the first visit as she types', async () => {
  const v = mkSport('golf', { name: 'Leftover Seven Golf Course', hours: null });
  const t = tokenFor(v.id);
  const g = await openSetup(base, t, { hash: 'hours' });
  assert.match(g.text(), /What are your hours\?/); assert.doesNotMatch(g.text(), /Are these still your hours\?/);
  assert.equal(g.cfg.sportMain, 'golf', JSON.stringify(Object.keys(g.cfg)).slice(0, 300));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8'), /golf: \['07:00', '19:00'\]/);
  await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'ahead', age: 'all', year: 'all' } });
  const p = await openSetup(base, t, { hash: 'price' });
  await p.type('suTprice', '210');
  assert.match(plain(p.doc.getElementById('suTpriceLead').textContent), /Your page will say “Green fees from \$210”/);
  retire([v.id]);
});
