// Indoor test 8 (2026-11-19; Gary runs a 5-pin bowling centre in Kelowna: $6.50 a game, $45 a lane an hour, shoes extra,
// cosmic bowling Friday and Saturday nights, leagues fill the lanes on weeknights, a licensed lounge and an arcade corner).
// Each fix from his report, checked with the real setup page script and real taps (tests/setup-sim.js), Build My Trip,
// search and the public page. His Help questions, and every indoor kind's, are in tests/indoor-help-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test8-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const IK = require('../indoor-kinds.js');
const T = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Mon–Thu 10–11 PM, Fri–Sat 10 AM–1 AM, Sun 10–10 (his open-door hours; leagues are a Good to know line).
const HOURS = JSON.stringify({ mon: [['10:00', '23:00']], tue: [['10:00', '23:00']], wed: [['10:00', '23:00']], thu: [['10:00', '23:00']], fri: [['10:00', '01:00']], sat: [['10:00', '01:00']], sun: [['10:00', '22:00']] });
const STORY = 'Kelowna’s home of 5-pin bowling since 1962: 24 lanes, an arcade corner and a licensed lounge.';
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T8 Fixture ${++n}`, slug: `indoor-t8-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 3000, longitude: -119.49,
  address: `${100 + n} Harvey Ave, Kelowna, BC`, phone: '250-555-0188', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 8 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.81.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);

// Gary's place, his own answers; research text where a test needs it.
const gary = async (o = {}, research = null) => {
  const v = mk('indoor', { name: `Okanagan Lanes T8 ${n + 1}`, cuisine: 'Bowling alley', description: STORY, ...o });
  if (research) db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(research));
  const t = tokenFor(v.id);
  return { v, t };
};

test('2. Groups: research text plus two chips over 180 trims research, never his taps, keeps ";", says so in one line; clearing the box resets the sizes', async () => {
  const research = { rows: [{ label: 'Groups', text: 'Party room for up to 30 guests; private bookings and banquets on request. Lane rentals for 12 to 60 people, with pizza and pitchers; call the front desk for packages.' }], source_url: 'https://example.com/', checked_at: '2026-10-31' };
  const { v, t } = await gary({}, research);
  await ok(change(t, { indoor_info: { kinds: ['bowling', 'games'], length: '1-2h', book: 'busy', age: 'all' } }));
  const g = await openSetup(base, t, { hash: 'groups' });
  const box = () => g.doc.getElementById('suGroupsLine');
  assert.match(box().value, /^Party room for up to 30 guests; private bookings/);
  const chips = IK.indoorKindText(['bowling'], 'en').groups.chips;
  await g.click(`[data-quick="${chips[0]}"]`);
  // The first chip keeps research's own punctuation (";" stays ";").
  assert.match(box().value, /^Party room for up to 30 guests; private bookings/);
  assert.ok(box().value.includes(chips[0]));
  await g.click(`[data-quick="${chips[1]}"]`);
  const val = box().value.trim();
  assert.ok(val.length <= 180, `${val.length}: ${val}`);
  assert.ok(val.includes(chips[0]) && val.includes(chips[1]), `both taps kept: ${val}`);
  // One line says what came out.
  const note = g.doc.getElementById('suGroupsLineTrim');
  assert.ok(note && !note.hidden, 'the note shows');
  assert.match(note.textContent, /we took out part of the line we found online/);
  // A size: punctuation kept, the size pressed; then clearing the box un-presses it.
  await g.click('[data-bgroup="10"]');
  assert.match(box().value, /Groups of 10 or more/);
  assert.equal(g.doc.querySelector('[data-bgroup="10"]').getAttribute('aria-pressed'), 'true');
  await g.type('suGroupsLine', '');
  assert.equal(g.doc.querySelector('[data-bgroup="10"]').getAttribute('aria-pressed'), 'false');
  for (const c of chips) assert.equal(g.doc.querySelector(`[data-quick="${c}"]`).getAttribute('aria-pressed'), 'false', c);
  // His taps again, then Save: what is saved has both chips.
  await g.click(`[data-quick="${chips[0]}"]`);
  await g.click('[data-bgroup="10"]');
  await g.click('brewGroupsSave').catch(() => null);
  await g.settle();
  const saved = (JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id) || {}).info || '{}').rows || []).find((r) => r.label === 'Groups');
  assert.ok(saved && saved.text.includes(chips[0]) && /Groups of 10 or more/.test(saved.text), JSON.stringify(saved));
});

test('2b. Good to know: research text plus chips over the limit trims research, never the taps', async () => {
  const long = 'Bowling shoes are required on the lanes and are available to rent at the front counter; socks recommended. Outside food and drink are not permitted anywhere in the building.';
  const research = { rows: [{ label: 'Good to know', text: long }], source_url: 'https://example.com/', checked_at: '2026-10-31' };
  const { t } = await gary({}, research);
  await ok(change(t, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all' } }));
  const g = await openSetup(base, t, { hash: 'bring' });
  const chipEls = g.doc.querySelectorAll('[data-quick][data-box="suBring"]');
  assert.ok(chipEls.length >= 3, 'bowling has Good to know chips');
  const max = g.cfg.bringMax || 180;
  for (const c of chipEls.slice(0, 3)) await g.click(`[data-quick="${c.getAttribute('data-quick')}"]`);
  const val = g.doc.getElementById('suBring').value.trim();
  for (const c of chipEls.slice(0, 3)) assert.ok(val.includes(c.getAttribute('data-quick')), `${c.getAttribute('data-quick')} kept: ${val}`);
  assert.ok(val.length <= max, `${val.length} > ${max}: ${val}`);
});

test('3. Games as a second kind says "arcade" (card, page, preview, EN + FR) unless his own words say VR, laser tag or karting', async () => {
  const { v, t } = await gary();
  await ok(change(t, { indoor_info: { kinds: ['bowling', 'games'], length: '1-2h', book: 'busy', age: 'all' } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Bowling & arcade');
  const en = plain(pageHtml(v)), fr = plain(pageHtml(v, 'fr'));
  assert.ok(en.includes('Bowling & arcade'), 'EN page');
  assert.doesNotMatch(en, /VR & laser tag/);
  assert.ok(fr.includes('Quilles et arcade'), 'FR page');
  assert.doesNotMatch(fr, /réalité virtuelle et laser tag/);
  // The card (the cards data the lists use).
  const card = plain(await fetch(`${base}/indoor`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text()));
  assert.doesNotMatch(card, new RegExp(`${v.name}[^|]{0,80}VR & laser tag`));
  // The setup's preview words.
  const g = await openSetup(base, t, { hash: 'more' });
  assert.equal(g.cfg.indoorGamesShort, 'Arcade');
  // His own words say laser tag: the full words.
  const { v: v2, t: t2 } = await gary({ name: 'Lanes & Laser Tag T8', description: 'Bowling with a laser tag arena.' });
  await ok(change(t2, { indoor_info: { kinds: ['bowling', 'games'], length: '1-2h' } }));
  assert.equal(app.getVenue(v2.id).cuisine, 'Bowling · arcade, VR & laser tag');
  // Games as the main kind keeps its own words.
  const { v: v3, t: t3 } = await gary({ name: 'Arcade Hall T8' });
  await ok(change(t3, { indoor_info: { kinds: ['games'], length: '1-2h' } }));
  assert.equal(app.getVenue(v3.id).cuisine, 'Arcade, VR & laser tag');
});

// Gary's prices, as he typed them (published).
const garyPrices = (id) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')").run(id, JSON.stringify({ sections: [{ name: 'Games', note: '', items: [
  { name: 'One game, one person', description: '', price: '6.50', dietary: [], check: false }, { name: 'Shoe rental', description: '', price: '3', dietary: [], check: false },
  { name: 'Lane by the hour (up to 6 people)', description: 'Per lane, per hour', price: '45', dietary: [], check: false }, { name: 'Glow pins unlimited (Fri & Sat 9 PM–midnight)', description: 'Per person', price: '25', dietary: [], check: false }] }] }));
const siteSearch = async (q, lang = 'en') => plain(await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text()));

test('4. Search (site and hub) reads his Known for, Good to know, price names and owner-picked kinds: "cosmic bowling" and "arcade kelowna" find him', async () => {
  const { v, t } = await gary({ name: 'Capri Five Pin Centre T8', cuisine: '', description: 'Five-pin centre in the Capri mall since 1962.' });
  await ok(change(t, { indoor_info: { kinds: ['bowling', 'games'], length: '1-2h', book: 'busy', age: 'all' } }));
  await ok(change(t, { visit_rows: { known_for: 'Cosmic bowling Fri & Sat 9 PM–midnight', good_to_know: 'Leagues use most lanes Mon–Thu after 6, call ahead. Licensed lounge.' } }));
  garyPrices(v.id);
  for (const q of ['cosmic bowling', 'arcade kelowna', 'glow pins', 'shoe rental']) assert.ok((await siteSearch(q)).includes(v.name), `site search "${q}"`);
  // French site search reads the kinds' French words.
  assert.ok((await siteSearch('quilles kelowna', 'fr')).includes(v.name), 'site search « quilles kelowna »');
  // The hub's own search words.
  const hub = await fetch(`${base}/indoor`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  const tag = /<script type="application\/json" id="fdVenueData"([^>]*)>([\s\S]*?)<\/script>/.exec(hub);
  const rest = /data-rest="([^"]+)"/.exec(tag[1]);
  const data = rest ? await fetch(`${base}/cards/rest/${rest[1]}.json`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.json()) : JSON.parse(tag[2] || '{}');
  const k = (data[v.id] || {}).k || '';
  for (const w of ['cosmic', 'arcade', 'glow', 'lounge']) assert.ok(k.split(' ').includes(w), `hub words have ${w}: ${k}`);
  assert.ok(!k.split(' ').includes('laser'), 'no laser tag words he never said');
});

test('5. Build My Trip "Why it fits" quotes his own line for the day and time asked; the header keeps "7 PM"; Christmas Day names the bowling places closed', async () => {
  const { v, t } = await gary({ name: 'Glenmore Lanes T8', region: 'kelowna' });
  await ok(change(t, { indoor_info: { kinds: ['bowling', 'games'], length: '1-2h', book: 'busy', age: 'all' } }));
  await ok(change(t, { visit_rows: { known_for: 'Cosmic bowling Fri & Sat 9 PM–midnight', good_to_know: 'Leagues use most lanes Mon–Thu after 6, call ahead. Licensed lounge.' } }));
  const stopOf = (p) => itemsOf(p).find((x) => x.venue.id === v.id);
  // Tuesday 7 PM: his leagues line, not "walk-ins welcome"; the header keeps the time.
  const tue = app.runTripPlan({ text: 'bowling Kelowna Tuesday 7 PM' }, NOW);
  const st = stopOf(tue);
  assert.ok(st, 'he is in the Tuesday 7 PM plan');
  const lines = [...(st.why || []), ...(st.caveats || [])].join(' | ');
  assert.match(lines, /Leagues use most lanes Mon–Thu after 6, call ahead/);
  assert.doesNotMatch(lines, /Walk-ins welcome; book ahead/);
  assert.match(JSON.stringify(tue.summary || ''), /7 PM/);
  // Saturday night: his cosmic bowling line.
  const sat = stopOf(app.runTripPlan({ text: 'bowling in Kelowna on Saturday night' }, NOW));
  assert.ok(sat, 'he is in the Saturday night plan');
  assert.match((sat.why || []).join(' | '), /Cosmic bowling Fri & Sat 9 PM–midnight/);
  // French: the same line, said to be his own words.
  const fr = require('../trip-french-copy.js');
  assert.match(fr.t3FrenchText('“Cosmic bowling Fri & Sat 9 PM–midnight” (the owner’s own words)'), /les mots de l’établissement/);
  assert.equal(fr.t3FrenchText('Closed Dec 25: Glenmore Lanes, Rutland Bowl.'), 'Fermés le 25 déc. : Glenmore Lanes, Rutland Bowl.');
  // Christmas Day: closed by his own closure, named.
  await ok(change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }] }));
  const other = mk('indoor', { name: 'Rutland Bowl T8', cuisine: 'Bowling alley', description: 'Ten-pin bowling.', rating: 4.2, reviews: 50 });
  await ok(change(tokenFor(other.id), { indoor_info: { kinds: ['bowling'], length: '1-2h' } }));
  const xmas = app.runTripPlan({ text: 'bowling on Christmas Day' }, NOW);
  assert.ok(!idsOf(xmas).includes(v.id), 'not planned on his closed day');
  assert.match((xmas.warnings || []).join(' '), new RegExp(`Closed Dec 25: [^.]*${v.name}`));
});

test('5b. The French heading keeps the time asked (« mardi à 19 h »)', () => {
  const fr = require('../trip-french-copy.js');
  const h = fr.t3FrenchSummary ? fr.t3FrenchSummary('Indoor & rainy day spots in Kelowna on Tuesday at 7 PM.') : '';
  assert.match(String(h), /mardi à 19 h/);
  assert.doesNotMatch(String(h), /Tuesday|7 PM/);
});

const OPEN = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '17:00']]])));
const photos = (v) => {
  db.prepare('UPDATE venues SET image_url = ? WHERE id = ?').run(`/images/owner/t8main${v.id}.jpg`, v.id);
  for (const i of [1, 2]) db.prepare("INSERT INTO owner_photos (venue_id, file, preview_key, width, height, bytes, credit, rights_confirmed_at, status, ip_hash, submitted_at, reviewed_at, reviewed_by) VALUES (?, ?, ?, 1200, 800, 50000, 'Owner', datetime('now'), 'approved', 'x', datetime('now'), datetime('now'), 'test')").run(v.id, `t8x${v.id}-${i}.jpg`, `pk8${v.id}x${i}`);
};
const progress = (t, step, status) => postJson(`/owner/${t}/setup/progress`, { step, status });
const score = (v) => app.setupScore({ venue: app.getVenue(v.id), happyHourTimes: null });

test('6. Every kind: free and walk-in, "Have a booking page?" left closed, reaches 100%: Your prices shows optional-done, the last screen says 100%, the portal checklist agrees', async () => {
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) {
    const v = mk('indoor', { name: `Walk ${k} T8 ${n + 1}`, cuisine: '', description: `${STORY} Locally owned and run by the same family for three generations, right in the middle of town.`, hours: OPEN });
    photos(v);
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [k], length: '1h', book: 'no', age: 'all', year: 'all' } }));
    // Price: Free entry (real taps).
    const sp = await openSetup(base, t, { hash: 'price' });
    if (!/aria-pressed="true" data-ifree="free"/.test(sp.screen())) await sp.click('[data-ifree="free"]');
    await sp.click('priceSave');
    // Booking: walk-ins welcome; the folded "Have a booking page?" is left closed (no link, no "we don't" tap).
    const sb = await openSetup(base, t, { hash: 'booking' });
    await sb.click('[data-tpick="book:no"]');
    assert.ok(sb.has('#suBookFold'), `${k}: the booking link folds behind "Have a booking page?"`);
    await sb.click('bookingSave');
    const sg = await openSetup(base, t, { hash: 'groups' });
    await sg.click('no:groups');
    await ok(change(t, { visit_rows: { known_for: 'Local favourites', good_to_know: 'Free parking on site' }, hours_checked: true }));
    await ok(change(t, { not_offered: ['facebook', 'pyv_groups'], instagram_url: 'https://www.instagram.com/t8place' }));
    assert.equal((await progress(t, 'offer', 'live')).status, 200);
    const r = score(v);
    assert.deepEqual(r.left, [], `${k}: ${JSON.stringify(r.left)}`);
    assert.equal(r.pct, 100, k);
    // The setup list: Your prices is optional and done, never "not done yet".
    const st = await openSetup(base, t, { hash: 'start' });
    assert.match(st.text(), /Your prices · optional: free entry already counts/, k);
    // The last screen: 100%, nothing "to reach".
    const f = await openSetup(base, t, { hash: 'more' });
    await f.click(f.acts().find((a) => /^go:finish$|^doneNow2?$/.test(a)) || 'doneNow2');
    assert.doesNotMatch(f.text(), /To reach 100%/, k);
    assert.match(f.text(), /100\s*%/, k);
    // The portal's checklist says the same.
    const portal = plain(await fetch(`${base}/owner/${t}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((x) => x.text()));
    assert.match(portal, /Your page is complete/, `${k}: portal`);
  }
});

test('7. Add an event from his private link: no email needed (optional, pre-filled when known); a bad one is caught before Send', async () => {
  const { v, t } = await gary();
  const page = await fetch(`${base}/owner/${t}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  assert.match(page, /<label for="oeContactEmail">Your email \(optional\)<\/label>/);
  assert.doesNotMatch(page, /<label for="oeContactEmail">Your email \*/);
  // The email box is checked as soon as she leaves it (a blur check in the page's own script).
  assert.match(page, /oeContactEmail'\); if \(em0\) em0\.addEventListener\('blur'/);
  // Every inline script on the page still parses.
  for (const m of page.matchAll(/<script(?![^>]*(?:application\/json|src=))[^>]*>([\s\S]*?)<\/script>/g)) new (require('node:vm').Script)(m[1]);
  assert.match(page, /test\(x0\)|\.test\(x0\)/);
  assert.match(page, /\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\/\.test\(x0\)/);
  const ev = { name: 'Cosmic Bowling', categories: ['sports-recreation'], description: 'Unlimited glow bowling with music and lights, 9 PM to midnight.', start_date: '2026-11-27', start_time: '21:00', end_time: '23:59', schedule_notes: 'every Friday and Saturday' };
  const r = await postJson(`/owner/${t}/events`, { ...ev, contact_email: '' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const bad = await postJson(`/owner/${t}/events`, { ...ev, name: 'Cosmic Bowling 2', contact_email: 'gary@' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors && bad.body.errors.contact_email);
  // The public form still needs one.
  assert.ok(v);
});

test('8. Bowling Good to know chips (leagues, licensed lounge, bumpers), its own story and Known for examples; every kind has its own examples', async () => {
  const { t } = await gary();
  await ok(change(t, { indoor_info: { kinds: ['bowling'], length: '1-2h', book: 'busy', age: 'all' } }));
  const g = await openSetup(base, t, { hash: 'bring' });
  for (const c of ['Leagues on weeknights: call ahead', 'Licensed lounge', 'Bumpers for kids']) assert.ok(g.has(`[data-quick="${c}"]`), c);
  assert.ok(!g.has('[data-quick="Grip socks required"]'));
  const fr = await openSetup(base, t, { hash: 'bring', lang: 'fr' });
  assert.ok(fr.has('[data-quick="Salon avec permis d’alcool"]'));
  const st = await openSetup(base, t, { hash: 'story' });
  assert.match(st.text(), /cosmic bowling on weekends/);
  assert.match(st.text(), /Cosmic bowling Fri &(?:amp;)? Sat 9 PM–midnight/);
  assert.doesNotMatch(st.text(), /family-run place since 2010/);
  // Every kind (but "something else") has a story and Known for example of its own, in both languages.
  for (const lang of ['en', 'fr']) {
    const I = T[lang].indoor, seenS = new Map(), seenK = new Map();
    for (const k of IK.INDOOR_KIND_TEXT_KINDS.filter((x) => x !== 'other')) {
      const ex = IK.indoorKindText([k], lang).ex;
      assert.ok(I.storyExKinds[ex] && I.knownExKinds[ex], `${lang} ${k}`);
      assert.ok(!seenS.has(I.storyExKinds[ex]), `${lang} ${k} shares a story example with ${seenS.get(I.storyExKinds[ex])}`);
      assert.ok(!seenK.has(I.knownExKinds[ex]), `${lang} ${k} shares a Known for example with ${seenK.get(I.knownExKinds[ex])}`);
      seenS.set(I.storyExKinds[ex], k); seenK.set(I.knownExKinds[ex], k);
    }
  }
});
