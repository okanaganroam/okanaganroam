// Sport test 5 fixes (2026-11-20; Jen, guest services lead at a ski & board school at Big White: setup 7.5, overwhelm 8.0,
// whole thing 6.5; drafts/fresh-eyes-sport5-2026-11-20/REPORT.md). Help is fixed for every kind in sport-help.js (its
// questions run in tests/sport-help-matrix.test.js); this file is the rest: the sports hub cards read the owner's price
// line in her language, an owner's booking link that is her website keeps the Book button, Build My Trip plans a sports
// kind with its own card words (never a tour's), first-timers and kids on a ski request plan lessons, an undated plan in
// the off season says so on her stop, a child's own price line, and the polish (a time word after a chip, a ski school's
// age, winter-only season words, ski lessons asked from a valley town, French card times).
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test5-admin-token';
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
const REG = { penticton: [49.49, -119.59], kelowna: [49.886, -119.495], vernon: [50.267, -119.272], oliver: [49.18, -119.55], 'big-white': [49.72, -118.93] };
let n = 0, ipN = 0, srv, base;
const mk = (type, region, o = {}) => app.createVenue({ name: `Sport Five ${++n}`, slug: `sport-five-${n}`, region, type, latitude: REG[region][0] + n / 4000, longitude: REG[region][1], rating: 4.6, reviews: 300,
  address: `${n} Main St`, phone: '250-555-0150', website: `https://five-${n}.example.com/`, hours: JSON.stringify(WK('09:00', '17:00')), description: 'A fixture for sport test 5.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (v, changes) => fetch(`${base}/owner/${tokenFor(v.id)}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.125.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => { assert.ok([200, 201].includes(r.status), `change ${r.status}`); return r; });
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); if (app.clearHoursExtraCache) app.clearHoursExtraCache(); if (app.clearVenueCaches) app.clearVenueCaches(); };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: sections.map(([name, items]) => ({ name, note: '', items: items.map(([nm, price, d = '']) => ({ name: nm, description: d, price: String(price), dietary: [], check: false })) })) }));
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const NOV = new Date('2026-11-20T12:00:00-08:00'), JAN = new Date('2027-01-10T12:00:00-08:00'), JULY = new Date('2026-07-10T12:00:00-07:00');
// The page's link buttons (the main buttons and a layout's own Book link), as text.
const links = (h) => (String(h).match(/<a [^>]*data-track="(?:booking|website)"[^>]*>[\s\S]{0,200}?<\/a>/g) || []).map((x) => x.replace(/<[^>]+>/g, '').trim()).join(' | ');
// A test's fixtures leave the site for the next test (an unknown town is never listed, searched or planned).
const retire = (ids) => { for (const id of ids) db.prepare("UPDATE venues SET region = 'retired-fixture' WHERE id = ?").run(id); if (app.clearVenueCaches) app.clearVenueCaches(); };
const card = (html, id) => { const i = html.indexOf(`data-venue-id="${id}"`); assert.ok(i >= 0, `card ${id} listed`); return html.slice(i, i + 8000).split('</li>')[0]; };

// Jen's school as she left it: lessons, Nov 26 – Apr 6, her lessons and kids' programs, 8–4:30.
const JEN_PRICES = [['Lessons', [['Adult group lesson, 2 hours', 129, 'Ages 13 and up. Lift ticket not included'], ['Private lesson, 1 hour', 189, '1 to 3 people, same price'], ['Discover first-timer package', 219, 'Half-day lesson, rentals and a beginner lift ticket']]],
  ['Kids programs', [['Kinder Kids (ages 3 to 4), full day', 239, 'Lesson, lunch and supervised play'], ['Kids Club (ages 5 to 12), full day', 259, 'Lessons, lunch and lift ticket'], ['Christmas camp (ages 5 to 12), 5 days', 1099, 'Dec 21 to 24 and Dec 26']]],
  ['Rentals', [['Ski or snowboard rental, full day', 69, 'Helmet included']]]];
async function jen(o = {}) {
  const v = mk('sport', 'big-white', { name: `Snow School Fixture ${n + 1}`, address: 'Snow School Desk, Village Centre Mall, Big White', kid_friendly: 1, hours: JSON.stringify(WK('08:00', '16:30')), website: 'https://www.bigwhite-fixture.example/ski-school', ...o });
  await change(v, { hours: WK('08:00', '16:30'), open_months: '11-26:04-06' });
  await change(v, { indoor_info: { kinds: ['skischool'], length: 'half', book: 'busy', age: 'all', year: 'seasonal' }, indoor_price: 129 });
  await change(v, { booking_url: 'https://bigwhite-fixture.example/ski-school' });
  approveAll(v.id);
  publish(v.id, JEN_PRICES);
  if (app.clearVenueCaches) app.clearVenueCaches();
  return { v, name: app.getVenue(v.id).name };
}

test('1. the sports hub cards (town and valley, EN and FR) show every owner kind’s own price line in the page’s language; no empty “Play here” box', async () => {
  const kinds = SK.SPORT_KINDS.filter((k) => !['golf', 'simgolf', 'range'].includes(k));
  const made = [];
  for (const k of kinds) {
    const v = mk('sport', 'kelowna', { name: `Hub Card ${k}` });
    await change(v, { indoor_info: { kinds: [k], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: { skatepark: 'free', discgolf: 'free', courts: 'free' }[k] || 12 });
    made.push([k, v]);
  }
  const bare = mk('sport', 'kelowna', { name: 'Hub Card Nobody Set Up' });
  if (app.clearVenueCaches) app.clearVenueCaches();
  for (const p of ['/sports', '/kelowna/sports', '/fr/sports', '/fr/kelowna/sports']) {
    const h = await getText(p), fr = p.startsWith('/fr');
    for (const [k, v] of made) {
      const c = card(h, v.id), t = plain(c);
      const want = (() => { const x = { skatepark: 1, discgolf: 1, courts: 1 }[k] ? (fr ? 'Entrée gratuite.' : 'Free entry.') : String(SK.K[k][fr ? 'fr' : 'en'].price.page).replace('{x}', fr ? '12 $' : '$12'); return x; })();
      assert.ok(t.includes(want), `${p} ${k}: wants "${want}" in ${t.slice(0, 400)}`);
      assert.doesNotMatch(c, /<strong>Play here<\/strong><p><\/p>/, `${p} ${k}: empty box`);
      if (fr) assert.doesNotMatch(t, /Play here|Lessons from|Adult public skate|Free entry/, `${p} ${k}: English on the French card`);
    }
    assert.doesNotMatch(card(h, bare.id), /<strong>Play here<\/strong><p><\/p>/, `${p}: an empty box for a listing nobody set up`);
  }
  retire(made.map(([, v]) => v.id).concat([bare.id]));
});

test('2. an owner’s booking link that is her own website keeps her Book button in her kind’s words, and the Website button goes; a researched one is still dropped', async () => {
  const { v } = await jen();
  for (const lang of ['en', 'fr']) {
    const ctas = links(app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: JAN }));
    assert.match(ctas, lang === 'fr' ? /Réserver un cours/ : /Book a lesson/, `${lang}: ${ctas}`);
    assert.doesNotMatch(ctas, /Website|Site Web/, `${lang}: one button, not two`);
  }
  // Every type that has the rule: golf (Book a tee time), indoor and tours.
  for (const [type, region, info, btn] of [['golf', 'kelowna', { indoor_info: { kinds: ['golf'], length: 'half', book: 'busy', age: 'all', year: 'all' }, indoor_price: 59 }, /Book a tee time/], ['indoor', 'kelowna', { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'busy', age: 'all', year: 'all' }, indoor_price: 12 }, /Book/]]) {
    const g = mk(type, region, { name: `Book Same ${type}` });
    await change(g, info); await change(g, { booking_url: app.getVenue(g.id).website });
    approveAll(g.id);
    const ctas = links(app.renderVenuePage(app.getVenue(g.id), [], [], [], { lang: 'en', now: JAN }));
    assert.match(ctas, btn, `${type}: ${ctas}`); assert.doesNotMatch(ctas, /Website/, `${type}: ${ctas}`);
  }
  // Research's link to the same website (the Many Hats rule of Oct 29): Website once, no Book.
  const r = mk('indoor', 'kelowna', { name: 'Research Link Theatre' });
  db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?)').run(r.id, app.getVenue(r.id).website);
  const ctas = links(app.renderVenuePage(app.getVenue(r.id), [], [], [], { lang: 'en', now: JAN }));
  assert.match(ctas, /Website/); assert.doesNotMatch(ctas, /Book/);
  retire([v.id]);
});

// [kind, region, request, when]: a request for each sports kind Build My Trip plans through another type's stop.
const PLANNED = [['rink', 'vernon', 'ice skating in Vernon', JAN], ['skatepark', 'penticton', 'skate park in Penticton', JULY], ['discgolf', 'vernon', 'disc golf in Vernon', JULY],
  ['bike', 'kelowna', 'bmx track in Kelowna', JULY], ['swim', 'oliver', 'outdoor pool in Oliver', JULY], ['skischool', 'big-white', 'ski lessons at Big White on January 15', JULY], ['sportsctr', 'kelowna', 'sports centre in Kelowna', JAN]];
test('3. every sports kind planned through another type’s stop says its own kind on its card (EN + FR), never a tour’s, an outdoor’s or an indoor’s words', async () => {
  const wrong = [], made = [];
  for (const [k, region, q, when] of PLANNED) {
    const v = mk('sport', region, { name: `Planned ${k}` }); made.push(v.id);
    await change(v, { indoor_info: { kinds: [k], length: '1-2h', book: k === 'skischool' ? 'ahead' : 'no', age: 'all', year: 'all' }, indoor_price: 12 });
    for (const fr of [false, true]) {
      const p = app.runTripPlan({ text: fr ? q.replace(/^ice skating in/, 'patinage à').replace(/^ski lessons at Big White on January 15/, 'cours de ski à Big White le 15 janvier') : q }, when);
      const stop = itemsOf(p).find((x) => x.venue.id === v.id);
      if (!stop) { if (!fr) wrong.push(`${k}: "${q}" not planned (${itemsOf(p).slice(0, 3).map((x) => x.venue.name).join(', ')})`); continue; }
      const words = SK.SPORT_KIND_WORDS[k];
      if (stop.venue.typeLabel !== words[0] || stop.venue.typeLabelFr !== words[1]) wrong.push(`${k}: card says ${stop.venue.typeLabel} / ${stop.venue.typeLabelFr}`);
      const s = JSON.stringify(stop);
      if (/Tours run at set times|Tour & Experience|Outdoor destination|Book a departure time/.test(s)) wrong.push(`${k}: another type's words: ${s.slice(0, 300)}`);
      const row = (p.schedule || []).find((r) => r.venueId === v.id);
      if (row && row.bookDeparture && !(Array.isArray(row.bookLabel) && /lesson/i.test(row.bookLabel[0]))) wrong.push(`${k}: "Book a departure time"`);
    }
  }
  assert.deepEqual(wrong, []);
  // The ski school's own booking words, EN and FR.
  const v = itemsOf(app.runTripPlan({ text: 'ski lessons at Big White on January 15' }, JULY)).find((x) => /Planned skischool/.test(x.venue.name));
  assert.ok(v.caveats.includes('Lessons go out at set times: book yours ahead and plan the day around it.'), JSON.stringify(v.caveats));
  retire(made);
});

test('4. first-timers and kids on a ski request plan the ski school; an undated plan before her opening day says she is closed then', async () => {
  const { v, name } = await jen();
  mk('outdoor', 'big-white', { name: 'Big White Ski Resort Fixture', description: 'Ski resort with 119 runs and night skiing.', cuisine: 'Ski resort' });
  mk('restaurant', 'big-white', { name: 'Village Dinner Fixture', hours: JSON.stringify(WK('11:00', '22:00')) });
  const inPlan = (q, now) => itemsOf(app.runTripPlan({ text: q }, now)).some((x) => x.venue.id === v.id);
  for (const q of ['first time skiing at Big White on Saturday January 16, 2027', 'first time skiing Kelowna on Saturday January 16, 2027', 'never skied before, Big White on January 16, 2027', 'skiing with the kids at Big White on Saturday January 16, 2027', 'Christmas week skiing with kids'])
    assert.ok(inPlan(q, NOV), `${q}: ${itemsOf(app.runTripPlan({ text: q }, NOV)).map((x) => `${x.venue.name} (${x.venue.region})`).join(', ')} ${JSON.stringify(app.runTripPlan({ text: q }, NOV).warnings)}`);
  // A ski trip with no lessons or kids asked stays the resort's (her school isn't forced in).
  assert.ok(!itemsOf(app.runTripPlan({ text: 'skiing at Big White on Saturday January 16, 2027, no lessons' }, NOV)).some((x) => x.venue.id === v.id));
  // Undated, on Nov 20 (she opens Nov 26): her stop says so.
  const stop = itemsOf(app.runTripPlan({ text: 'ski lessons for my 6 year old Big White' }, NOV)).find((x) => x.venue.id === v.id);
  assert.ok(stop, 'planned'); assert.ok(stop.caveats.some((c) => c === `${name} is closed for the season right now and reopens on November 26. This plan is for when it’s open.`), JSON.stringify(stop.caveats));
  // A dated plan in her season has no such note.
  const jan = itemsOf(app.runTripPlan({ text: 'ski lessons at Big White on Saturday January 16, 2027' }, NOV)).find((x) => x.venue.id === v.id);
  assert.ok(jan && !jan.caveats.some((c) => /closed for the season right now/.test(c)));
  // Every kind with a season: a summer kind on an undated November plan.
  const sw = mk('sport', 'oliver', { name: 'Undated Pool Fixture' });
  await change(sw, { hours: WK('10:00', '18:00'), open_months: '06-01:08-31' }); await change(sw, { indoor_info: { kinds: ['swim'], length: '1-2h', book: 'no', age: 'all', year: 'seasonal' }, indoor_price: 5 });
  const ps = itemsOf(app.runTripPlan({ text: 'outdoor pool in Oliver' }, NOV)).find((x) => x.venue.id === sw.id);
  if (ps) assert.ok(ps.caveats.some((c) => /closed for the season right now and reopens on June 1/.test(c)), JSON.stringify(ps.caveats));
  retire([v.id, sw.id]);
});

test('5. a child’s price is the owner’s own line for that age (a parse of her words), never the adult price; every kind', async () => {
  const { v } = await jen();
  const cost = (q) => { const s = itemsOf(app.runTripPlan({ text: q }, NOV)).find((x) => x.venue.id === v.id); assert.ok(s, q); return s.venue.cost; };
  const c4 = cost('ski lessons for my 4 year old at Big White on Saturday January 16, 2027');
  assert.equal(c4.cents, 23900); assert.match(c4.line, /Kinder Kids \(ages 3 to 4\)/);
  const c6 = cost('ski lessons for my 6 year old at Big White on Saturday January 16, 2027');
  assert.equal(c6.cents, 25900); assert.match(c6.line, /Kids Club \(ages 5 to 12\)/);
  assert.equal(cost('ski lessons at Big White on Saturday January 16, 2027').cents, 12900);
  // Another kind: a rink's learn-to-skate line for a 5-year-old.
  const r = mk('sport', 'vernon', { name: 'Age Line Rink' });
  await change(r, { indoor_info: { kinds: ['rink'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 6 });
  publish(r.id, [['Skating', [['Adult public skate', 6], ['Learn to skate (ages 4 to 6), 1 hour', 15], ['Senior skate (65 and up)', 4]]]]);
  if (app.clearVenueCaches) app.clearVenueCaches();
  const rs = itemsOf(app.runTripPlan({ text: 'ice skating in Vernon with my 5 year old' }, JAN)).find((x) => x.venue.id === r.id);
  assert.ok(rs, 'rink planned'); assert.equal(rs.venue.cost.cents, 1500);
  // The parse: her own words.
  const P = app.ownerAgeRange;
  retire([v.id, r.id]);
  { assert.deepEqual(P('Kids Club (ages 5 to 12)'), [5, 12]); assert.deepEqual(P('Ages 13 and up'), [13, 99]); assert.deepEqual(P('12 and under'), [0, 12]); assert.equal(P('Private lesson, 1 hour'), null); }
});

test('6. polish: a time word after a chip joins it; a ski school starts on All ages; a winter-only kind is offered hours for part of its season; ski lessons asked from Kelowna list Big White’s; French card times read 8 h–16 h 30', async () => {
  // The chip join, as the server saves it.
  const g = mk('sport', 'big-white', { name: 'Join Fixture' });
  await change(g, { indoor_info: { kinds: ['skischool'], length: 'half', book: 'busy', age: 'all', year: 'all' }, indoor_price: 99 });
  assert.equal(app.ownerTextClean('School and club groups. midweek', { short: true }), 'School and club groups midweek');
  assert.equal(app.ownerTextClean('Corporate ski days. Midweek too', { short: true }), 'Corporate ski days. Midweek too');
  // A ski school's Who can come starts on All ages; its season screen says "part of the season", never summer hours.
  assert.ok(SK.SPORT_ALL_AGES_KINDS.includes('skischool'));
  const t = app.getVenue(g.id);
  const setup = await getText(`/owner/${tokenFor(t.id)}/setup`);
  assert.match(setup, /add different hours for part of the season/);
  // Search from a valley town.
  const { v, name } = await jen();
  const s = plain(await getText('/search?q=ski+lessons+kelowna'));
  assert.match(s, /No ski lessons in Kelowna\. Nearest: /); assert.ok(s.includes(name), 'her school listed');
  // French search card times.
  const f = plain(await getText(`/fr/search?q=${encodeURIComponent('cours de ski big white le jour de noël')}`));
  const i = f.indexOf(name); assert.ok(i >= 0);
  assert.match(f.slice(i, i + 400), /8 h–16 h 30/); assert.doesNotMatch(f.slice(i, i + 400), /AM|PM/);
  void v;
});
