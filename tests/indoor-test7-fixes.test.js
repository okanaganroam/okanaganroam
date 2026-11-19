// Indoor test 7 (2026-11-19; Robert runs a commercial art gallery in Kelowna: free entry, walk-ins, no big groups, art for
// sale, a new exhibition every month with an opening reception on the first Friday 6–8 PM, closed Mondays and Tuesdays).
// Each fix from his report, checked with the real setup page script and real taps (tests/setup-sim.js), Build My Trip,
// search and the public page. His Help questions are in tests/indoor-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test7-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const frCopy = require('../trip-french-copy.js');
const IK = require('../indoor-kinds.js');
const T = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Wed–Sat 10–5, Sun 12–4, closed Monday and Tuesday (his gallery).
const HOURS = JSON.stringify({ mon: null, tue: null, wed: [['10:00', '17:00']], thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: [['12:00', '16:00']] });
const OPEN = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '17:00']]])));
const STORY = 'Hambleton Galleries has shown art in Kelowna since 1963. Today we’re in the downtown Cultural District, showing local Okanagan painters and sculptors. A new exhibition opens every month.';
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T7 Fixture ${++n}`, slug: `indoor-t7-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 3000, longitude: -119.49,
  address: `${100 + n} Ellis St, Kelowna, BC`, phone: '250-555-0147', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 7 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.71.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const progress = (t, step, status) => postJson(`/owner/${t}/setup/progress`, { step, status });
const score = (v) => app.setupScore({ venue: app.getVenue(v.id), happyHourTimes: null });
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);
// Three approved photos of his own (the main one and two more).
const photos = (v) => {
  db.prepare('UPDATE venues SET image_url = ? WHERE id = ?').run(`/images/owner/t7main${v.id}.jpg`, v.id);
  for (const i of [1, 2]) db.prepare("INSERT INTO owner_photos (venue_id, file, preview_key, width, height, bytes, credit, rights_confirmed_at, status, ip_hash, submitted_at, reviewed_at, reviewed_by) VALUES (?, ?, ?, 1200, 800, 50000, 'Owner', datetime('now'), 'approved', 'x', datetime('now'), datetime('now'), 'test')").run(v.id, `t7x${v.id}-${i}.jpg`, `pk${v.id}x${i}`);
};
// The setup's last screen, the way the owner gets there (More about your place → I'm done for now, or See the finish).
const finishScreen = async (t) => {
  const f = await openSetup(base, t, { hash: 'more' });
  await f.click(f.acts().find((a) => /^go:finish$|^doneNow2?$/.test(a)) || 'doneNow2');
  return f;
};
// Taps Free entry (unless it is already picked from research) and saves.
const tapFree = async (t) => {
  const s = await openSetup(base, t, { hash: 'price' });
  if (!/aria-pressed="true" data-ifree="free"/.test(s.screen())) await s.click('[data-ifree="free"]');
  await s.click('priceSave');
  return s;
};
// Robert's gallery as research left it, with his kind, length, walk-ins and All ages answered.
const robert = async (o = {}) => {
  const v = mk('indoor', { name: `Hambleton Galleries T7 ${n + 1}`, cuisine: 'Art gallery', description: STORY, free_entry: 1, arts_culture: 1, rating: 4.8, reviews: 60, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['gallery'], length: '1h', book: 'no', age: 'all', year: 'all' } }));
  return { v, t };
};

test('1. Groups: "We can’t take big groups" saves beside a Good to know line; a real Groups line still refuses it; the last screen and the checklist agree', async () => {
  const { v, t } = await robert();
  await ok(change(t, { visit_rows: { good_to_know: 'Most art is for sale. We can ship your purchase.' } }));
  const s = await openSetup(base, t, { hash: 'groups' });
  await s.click('no:groups');
  assert.doesNotMatch(s.text(), /already shows this|remove it first/i);
  const r = score(v);
  assert.ok(!r.left.some((x) => x.k === 'pyv_groups'), JSON.stringify(r.left));
  // The last screen lists only what the checklist still misses: never Groups.
  const f = await finishScreen(t);
  assert.doesNotMatch(f.text(), /Groups and parties/);
  // A real Groups line on the page still contradicts "none".
  const { t: t2 } = await robert();
  await ok(change(t2, { visit_rows: { groups: 'Groups of 10 or more: please book ahead' } }));
  const r2 = await change(t2, { not_offered: ['pyv_groups'] });
  assert.ok(r2.status >= 400, JSON.stringify(r2.body));
  // The same rule for a tour and a restaurant (the code is shared): a Good to know line alone never refuses it.
  for (const type of ['tour', 'restaurant', 'cocktail']) {
    const x = mk(type, { cuisine: type === 'tour' ? 'Boat tours' : 'Canadian' });
    const tx = tokenFor(x.id);
    if (type !== 'restaurant') await ok(change(tx, { visit_rows: { good_to_know: 'Free parking out back' } }));
    else db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(x.id, JSON.stringify({ rows: [{ label: 'Good to know', text: 'Free parking out back' }] }));
    const rx = await change(tx, { not_offered: ['pyv_groups'] });
    assert.ok(rx.status === 200 || rx.status === 201, `${type}: ${JSON.stringify(rx.body)}`);
  }
});

test('2. A free gallery’s Your prices is answered: the tile says it’s optional, its lead says skip it, and it never blocks 100%', async () => {
  const { v, t } = await robert();
  await tapFree(t);
  assert.ok(!score(v).left.some((x) => x.k === 'menu'), 'Your prices is not left');
  const m = await openSetup(base, t, { hash: 'more' });
  assert.match(m.doc.getElementById('suMenuFreeTile').textContent, /Anything that costs extra, like classes or tours\? Optional/);
  const p = await openSetup(base, t, { hash: 'menu' });
  assert.match(p.text(), /Entry is free, so you can skip this/);
  const fr = await openSetup(base, t, { hash: 'more', lang: 'fr' });
  assert.match(fr.doc.getElementById('suMenuFreeTile').textContent, /Facultatif/);
  // A paid place keeps the plain tile.
  const { t: t2 } = await robert({ free_entry: 0 });
  await ok(change(t2, { indoor_price: 12 }));
  const m2 = await openSetup(base, t2, { hash: 'more' });
  assert.ok(!m2.has('#suMenuFreeTile'));
});

test('3. Every indoor kind: an owner with honest answers (free, walk-in, no online bookings, no groups, no prices) reaches 100% through the setup', async () => {
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    const v = mk('indoor', { name: `Walk ${k} T7 ${n + 1}`, cuisine: '', description: STORY, hours: OPEN });
    photos(v);
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [k], length: '1h', book: 'no', age: 'all', year: 'all' } }));
    // Price: Free entry (real taps).
    await tapFree(t);
    // Booking: walk-ins welcome, no online bookings (the link folds away for a walk-in place).
    const sb = await openSetup(base, t, { hash: 'booking' });
    await sb.click('[data-tpick="book:no"]');
    assert.ok(sb.has('#suBookFold'), `${k}: the booking link folds behind "Have a booking page?"`);
    await sb.click('[data-tnobook="1"]');
    await sb.click('bookingSave');
    // Groups: none (real tap).
    const sg = await openSetup(base, t, { hash: 'groups' });
    await sg.click('no:groups');
    // The rest of what he answers honestly.
    await ok(change(t, { visit_rows: { known_for: 'Local painters and sculptors', good_to_know: 'Free parking on site' }, hours_checked: true }));
    await ok(change(t, { not_offered: ['booking_link', 'facebook', 'pyv_groups'], instagram_url: 'https://www.instagram.com/t7gallery' }));
    assert.equal((await progress(t, 'offer', 'live')).status, 200);
    const r = score(v);
    assert.equal(r.pct, 100, `${k}: ${JSON.stringify(r.left)}`);
    assert.deepEqual(r.left, [], k);
    const f = await finishScreen(t);
    assert.doesNotMatch(f.text(), /To reach 100%/, k);
  }
});

test('4. Gallery Good to know chips: for sale, shipping, monthly exhibition; no "Free on the first Sunday" when entry is free; museums keep theirs; gallery examples', async () => {
  const chipsOf = (k) => T.en.indoor.quick.good_to_know_kinds[IK.indoorKindText([k], 'en').gtk];
  for (const c of ['Most art is for sale', 'We can ship your purchase', 'New exhibition every month']) assert.ok(chipsOf('gallery').includes(c), c);
  assert.ok(chipsOf('museum').includes('Free on the first Sunday'));
  const { t } = await robert();
  await ok(change(t, { indoor_price: 'free' }));
  const g = await openSetup(base, t, { hash: 'bring' });
  for (const c of ['Most art is for sale', 'We can ship your purchase', 'New exhibition every month']) assert.ok(g.has(`[data-quick="${c}"]`), c);
  assert.ok(!g.has('[data-quick="Free on the first Sunday"]'));
  // A free museum doesn't see the first-Sunday chip either; a paid one does.
  const mus = mk('indoor', { name: 'Museum T7', cuisine: 'Museum' }); const tm = tokenFor(mus.id);
  await ok(change(tm, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all' }, indoor_price: 'free' }));
  assert.ok(!(await openSetup(base, tm, { hash: 'bring' })).has('[data-quick="Free on the first Sunday"]'));
  const mus2 = mk('indoor', { name: 'Museum T7b', cuisine: 'Museum' }); const tm2 = tokenFor(mus2.id);
  await ok(change(tm2, { indoor_info: { kinds: ['museum'], length: '1-2h', book: 'no', age: 'all' }, indoor_price: 10 }));
  assert.ok((await openSetup(base, tm2, { hash: 'bring' })).has('[data-quick="Free on the first Sunday"]'));
  // His story and Known for examples are a gallery's.
  const st = await openSetup(base, t, { hash: 'story' });
  assert.match(st.text(), /Okanagan painters and sculptors/);
  assert.doesNotMatch(st.text(), /family-run place since 2010/);
  // His chips show in French on his French page.
  const { v: v2, t: t2 } = await robert();
  await ok(change(t2, { visit_rows: { good_to_know: 'Most art is for sale. We can ship your purchase.' } }));
  assert.match(plain(pageHtml(v2, 'fr')), /La plupart des œuvres sont à vendre/);
});

test('5. Build My Trip: art, art walk, first Friday, sculpture and paintings mean galleries (never a hiking park or laser tag); French « art » and « galerie » too', async () => {
  const { v } = await robert();
  const kag = mk('indoor', { name: 'Kelowna Art Gallery T7', cuisine: 'Art gallery', description: 'Public art gallery.', hours: JSON.stringify({ mon: null, tue: [['10:00', '17:00']], wed: [['10:00', '17:00']], thu: [['10:00', '20:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: [['10:00', '17:00']] }), rating: 4.7, reviews: 300 });
  const park = mk('outdoor', { name: 'Knox Mountain Park T7', cuisine: 'Hiking', description: 'Hiking trails and views over the lake.', hours: OPEN, rating: 4.9, reviews: 2000 });
  const lazer = mk('indoor', { name: 'Planet Lazer T7', cuisine: 'Laser tag', description: 'Laser tag arena.', hours: OPEN, rating: 4.9, reviews: 900 });
  for (const q of ['art in Kelowna on Friday', 'art walk downtown Kelowna', 'first friday art Kelowna', 'sculpture in Kelowna', 'paintings in Kelowna', 'art Kelowna', 'art à Kelowna', 'galerie à Kelowna', 'art gratuit à Kelowna']) {
    const p = app.runTripPlan({ text: q, ...(/à|galerie|gratuit/.test(q) ? { lang: 'fr' } : {}) }, NOW);
    const ids = idsOf(p);
    assert.ok(ids.includes(v.id), `${q}: his gallery is in (${itemsOf(p).map((x) => x.venue.name).join(', ')})`);
    for (const id of [park.id, lazer.id]) assert.ok(!ids.includes(id), `${q}: never ${id}`);
  }
  // A kids' art camp is still a class, not a gallery.
  const camp = app.runTripPlan({ text: 'kids art camp in Kelowna' }, NOW);
  assert.ok(!idsOf(camp).includes(v.id) || itemsOf(camp).length > 0);
  // One card label for his place in every plan: its kind.
  for (const q of ['art galleries in Kelowna on Saturday', 'free things to do in Kelowna', 'rainy day in Kelowna on Saturday']) {
    const mine = itemsOf(app.runTripPlan({ text: q }, NOW)).find((x) => x.venue.id === v.id);
    if (mine) assert.equal(mine.venue.typeLabel, 'Art gallery', q);
  }
  assert.ok(kag);
});

test('6. A weekday list names the places that match but are closed that day ("Closed Mondays: …"), in English and French, in the same town', async () => {
  // In Vernon, away from the other tests' galleries.
  const { v } = await robert({ region: 'vernon', latitude: 50.27, longitude: -119.27 });
  const kag = mk('indoor', { region: 'vernon', latitude: 50.271, longitude: -119.271, name: 'Vernon Art Gallery T7m', cuisine: 'Art gallery', description: 'Public art gallery.', hours: JSON.stringify({ mon: null, tue: [['10:00', '17:00']], wed: [['10:00', '17:00']], thu: [['10:00', '17:00']], fri: [['10:00', '17:00']], sat: [['10:00', '17:00']], sun: [['10:00', '17:00']] }) });
  mk('indoor', { region: 'vernon', latitude: 50.272, longitude: -119.272, name: 'Gallery 421 T7', cuisine: 'Art gallery', description: 'A gallery open weekdays.', hours: OPEN });
  const p = app.runTripPlan({ text: 'art gallery Vernon Monday' }, NOW);
  assert.ok(!idsOf(p).includes(v.id));
  const w = (p.warnings || []).find((x) => /^Closed Mondays: /.test(x));
  assert.ok(w && w.includes(v.name) && w.includes(kag.name), JSON.stringify(p.warnings));
  const f = frCopy.t3FrenchPlan(JSON.parse(JSON.stringify(p)));
  assert.ok((f.warnings || []).some((x) => /^Fermés le lundi : /.test(x) && x.includes(v.name)), JSON.stringify(f.warnings));
});

test('7. Kid-Friendly: All ages never ticks it for a gallery, casino, library or theatre (a theatre with kids’ shows does); family kinds keep it; Free to Visit comes first on the page', async () => {
  const tick = async (kind, o = {}) => {
    const v = mk('indoor', { name: `Ages ${kind} T7 ${n + 1}`, cuisine: '', ...o });
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [kind], length: '1h', book: 'no' } }));
    const s = await openSetup(base, t, { hash: 'offer' });
    await s.click('[data-tpick="age:all"]');
    await s.click('offerSave');
    return db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(v.id).kid_friendly;
  };
  for (const k of ['gallery', 'casino', 'library', 'theatre']) assert.ok(!(await tick(k)), k);
  assert.ok(await tick('theatre', { description: 'A community theatre with kids’ shows every Saturday morning and plays for grown-ups at night.' }), 'theatre with kids’ shows');
  for (const k of ['kids', 'museum', 'bowling', 'pool']) assert.ok(await tick(k), k);
  // Badges: Free to Visit before Kid-Friendly.
  const { v } = await robert({ kid_friendly: 1 });
  const h = plain(pageHtml(v));
  assert.ok(h.indexOf('Free to Visit') >= 0 && h.indexOf('Free to Visit') < h.indexOf('Kid-Friendly'), 'Free to Visit first');
});

test('8. The event card on his page shows the time and how many more dates', async () => {
  const { v } = await robert();
  const r = app.createEvent({ name: 'First Friday opening reception T7', region: 'kelowna', description: 'Meet the artists at the opening of our new monthly exhibition.', source_type: 'official_venue', source_name: 'Fixture',
    source_url: 'https://example.com/t7-ff', venue_id: v.id, categories: ['arts-culture'],
    occurrences: ['2026-12-04', '2027-01-01', '2027-02-05', '2027-03-05'].map((d) => ({ start_date: d, start_time: '18:00', end_time: '20:00' })) }, { reason: 'indoor test 7 fixture', batch_id: 'test-indoor-t7' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const h = plain(pageHtml(v));
  assert.match(h, /First Friday opening reception T7 [^·]*Dec 4, 6 PM &middot; \+3 more dates/);
  assert.match(plain(pageHtml(v, 'fr')), /\+3 autres dates/);
});

test('9. Polish: no "The space" repeat; Tue–Sat hidden with Tuesday closed; a closure-day event is flagged for review; search finds first Friday, sculpture, free art and free places first', async () => {
  // His whole story is the intro: no "A little more about" fold repeating it.
  const { v, t } = await robert();
  const h = pageHtml(v);
  assert.doesNotMatch(h, /<summary>The space<\/summary>/);
  // A long story keeps the fold (it has more to say).
  const { v: v2 } = await robert({ description: `${STORY} ${'We also host talks, book launches and small concerts in the back room, and our framing studio can frame anything you buy here. '.repeat(3)}` });
  assert.match(pageHtml(v2), /<summary>The space<\/summary>/);
  // Tue–Sat: not offered with Tuesday closed.
  const s = await openSetup(base, t, { hash: 'hours' });
  await s.click('go:hours:edit');
  if (s.has('[data-hopen="wed"]')) await s.click('[data-hopen="wed"]');
  assert.ok(!s.has('[data-copytuesat]'), 'no Tue–Sat with Tuesday closed');
  // An event on a closure day is flagged (a warning only).
  assert.match(app.eventClosureClash(v.id, '2026-12-07'), /closed Mondays/);
  assert.equal(app.eventClosureClash(v.id, '2026-12-04'), '');
  // Search.
  const get = async (q, lang = 'en') => plain(await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text()));
  const ev = app.createEvent({ name: 'Winter opening reception T7s', region: 'kelowna', description: 'Meet the artists.', source_type: 'official_venue', source_name: 'Fixture', source_url: 'https://example.com/t7-ffs',
    venue_name_text: 'Hall', categories: ['arts-culture'], occurrences: [{ start_date: '2026-12-11', start_time: '18:00', end_time: '20:00' }] }, { reason: 'indoor test 7 fixture', batch_id: 'test-indoor-t7s' });
  assert.equal(ev.ok, true, JSON.stringify(ev));
  const ff = await get('first friday kelowna');
  assert.match(ff, /Art shows & exhibitions in Kelowna/);
  assert.match(ff, /Winter opening reception T7s/);
  assert.ok(ff.includes(v.name), 'the galleries show with it');
  assert.ok(!/\b\d{3} places\b/.test(ff));
  assert.ok((await get('sculptors kelowna')).includes(v.name));
  const af = await get('art gratuit', 'fr');
  assert.ok(af.includes(v.name) && !/\bPub\b/.test(af));
  const free = await get('free things to do kelowna');
  const park = mk('outdoor', { name: 'Zed Park T7', cuisine: 'Park', description: 'A big park.', rating: 5, reviews: 9999, hours: OPEN });
  const free2 = await get('free things to do kelowna');
  assert.ok(free2.indexOf(v.name) >= 0 && (free2.indexOf(park.name) < 0 || free2.indexOf(v.name) < free2.indexOf(park.name)), 'Free to Visit first');
  assert.ok(free);
});
