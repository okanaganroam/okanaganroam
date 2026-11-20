// Indoor test 1 (2026-11-19; Margaret, 67, volunteer coordinator at the Summerland Museum & Archives, on an older iPad).
// Her museum: summer Tue–Sat 10–4, winter Thu–Sat 11–3, closed Christmas to mid-January, entry by donation (suggested $5),
// school groups by appointment. Each fix from her report, checked with the real setup page script and real taps
// (tests/setup-sim.js), then on the public page (EN + FR), the cards, Build My Trip and search.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const hours = require('../hours.js');
const { openSetup } = require('./setup-sim.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SUMMER = Object.fromEntries(DAYS.map((d) => [d, ['mon', 'sun'].includes(d) ? null : [['10:00', '16:00']]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Indoor T1 Fixture ${++n}`, slug: `indoor-t1-${n}`, region: 'summerland', type, latitude: 49.6 + n / 3000, longitude: -119.67,
  address: `${9500 + n} Wharton St, Summerland, BC`, phone: '250-555-0199', website: 'https://example.com', hours: JSON.stringify(SUMMER), description: 'A fixture used only by the indoor test 1 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.93.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en', now = NOW) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const RESEARCH = { rows: [{ label: 'Prices', text: 'Admission by donation: suggested $5 per adult, $2 per child.' }, { label: 'Known for', text: 'Summerland history and the model railway' }],
  booking_url: null, source_url: 'https://www.summerlandmuseum.org/', checked_at: '2026-10-20' };
const museum = (o = {}) => { const v = mk('indoor', { name: `Summerland Museum T1 ${n + 1}`, free_entry: 1, kid_friendly: 1, ...o }); setBox(v.id, RESEARCH); return v; };
const helpTopics = (html) => JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html)[1]).topics;
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);

test('1. an indoor place\'s kind is labelled Category / Catégorie (never Cuisine); a restaurant keeps Cuisine', async () => {
  const v = museum();
  await ok(change(tokenFor(v.id), { indoor_info: { kinds: ['museum'], length: '1h' } }));
  const en = page(v), fr = page(v, 'fr');
  assert.match(en, /class="label">Category<\/span>/);
  assert.doesNotMatch(en, /class="label">Cuisine</);
  assert.match(fr, /class="label">Catégorie<\/span>/);
  assert.doesNotMatch(fr, /class="label">Cuisine</);
  const r = mk('restaurant', { cuisine: 'Italian' });
  assert.match(page(r), /class="label">Cuisine<\/span>/);
});

test('2. by donation (real taps): research\'s "suggested $5" is offered under By donation, labelled Suggested amount; page, card, planner say By donation', async () => {
  const v = museum();
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'price' });
  // Research said by donation, suggested $5: By donation is pre-picked, and its box (the adult price box) holds 5.
  assert.ok(sim.has('[data-ifree="donation"][aria-pressed="true"]'), sim.text().slice(0, 400));
  assert.match(sim.text(), /Suggested amount \(optional\)/);
  assert.equal(sim.doc.getElementById('suTsugg').value, '5');
  // Indoor test 14: the lead says the suggested amount the box holds, as the page will.
  assert.match(sim.text(), /Your page will say “By donation \(suggested \$5\)”/);
  await sim.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 'donation');
  assert.equal(app.indoorSuggested(v.id), 5);
  // The page: "By donation (suggested $5)." in English, « Contribution volontaire (suggérée : 5 $). » in French; never "Free (by donation)".
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.ok(en.includes('By donation (suggested $5).'), en.slice(0, 2000));
  assert.ok(fr.includes('Contribution volontaire (suggérée : 5 $).'), fr.slice(0, 2000));
  assert.doesNotMatch(en, /Free \(by donation\)/);
  // The Free to Visit badge stays on; the card price says By donation.
  assert.equal(!!app.getVenue(v.id).free_entry, true);
  const card = db.prepare('SELECT from_price, basis FROM price_overrides WHERE venue_id = ?').get(v.id);
  assert.equal(card.from_price, 0); assert.equal(card.basis, 'By donation');
  // The card: one "By donation" chip, no "Free" beside it (it was "Free · Free").
  const chips = /<p class="chips">([\s\S]*?)<\/p>/.exec(app.venueCardHtml(app.getVenue(v.id), { themed: true }))[1].replace(/<[^>]+>/g, '|').split('|').map((x) => x.trim()).filter(Boolean);
  assert.ok(chips.includes('By donation'), chips.join(' · '));
  assert.ok(!chips.includes('Free'), chips.join(' · '));
  // Build My Trip: the stop says By donation, with the suggested amount.
  const p = app.runTripPlan({ text: 'museum in Summerland' }, NOW);
  const stop = itemsOf(p).find((x) => x.venue.id === v.id);
  assert.ok(stop, JSON.stringify(itemsOf(p).map((x) => x.venue.name)));
  assert.equal(stop.venue.byDonation, 5);
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /if \(v\.byDonation\) return '<p class="t3-stop-price" data-cost-cents="0" data-donation="' \+ [^\n]*?'"><strong>' \+ esc\(french \? 'Contribution volontaire' : 'By donation'\)/);
  // An empty box takes the amount off: "By donation." on its own.
  const sim2 = await openSetup(base, t, { hash: 'price' });
  assert.equal(sim2.doc.getElementById('suTsugg').value, '5');
  await sim2.type('suTsugg', '');
  await sim2.click('priceSave');
  assert.equal(app.indoorSuggested(v.id), null);
  assert.ok(plain(page(v)).includes('By donation.'));
  // Free entry instead: "Free entry." and the card says Free.
  const sim3 = await openSetup(base, t, { hash: 'price' });
  await sim3.click('[data-ifree="free"]');
  assert.ok(!sim3.has('#suTsugg'));
  await sim3.click('priceSave');
  assert.equal(app.indoorPriceValue(v.id), 'free');
  assert.ok(plain(page(v)).includes('Free entry.'));
});

// Indoor test 14 (2026-11-19; Dayton: never carry over an adult price): a price typed before tapping By donation no longer
// becomes the suggested amount; the box starts empty and she types it.
test('3. a price typed before tapping By donation is not carried into the suggested amount; words in the box get a plain nudge', async () => {
  const v = mk('indoor', { name: 'Penticton Gallery T1', description: 'A public art gallery.' });
  const sim = await openSetup(base, tokenFor(v.id), { hash: 'price' });
  await sim.type('suTprice', '4');
  await sim.click('[data-ifree="donation"]');
  assert.equal(sim.doc.getElementById('suTsugg').value, '');
  await sim.type('suTsugg', 'whatever you like');
  await sim.click('priceSave');
  assert.match(sim.text(), /Just the number, like 5/);
  await sim.type('suTsugg', '$10');
  await sim.click('priceSave');
  assert.equal(app.indoorSuggested(v.id), 10);
});

test('4. the English page shows her Time needed like the French one (a full box set it aside)', async () => {
  const v = museum();
  const t = tokenFor(v.id);
  // Her own lines fill the box: Groups, Good to know and Known for, then the answers.
  await ok(change(t, { visit_rows: { groups: 'School and group tours by appointment. Please call ahead.', good_to_know: 'Small gift shop. Upstairs is stairs only.', known_for: 'Summerland history and the model railway' } }));
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1h', book: 'no', age: 'all', year: 'all' } }));
  await ok(change(t, { indoor_price: 'donation' }));
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.ok(fr.includes('Jusqu’à 1 heure.'), 'French has it');
  assert.ok(en.includes('Up to 1 hour.'), en.slice(0, 2500));
});

test('5. the closures line after seasonal hours (real taps); the museum\'s hours editor has no after-midnight or lunch-and-dinner buttons', async () => {
  const v = museum();
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'hours' });
  // The hours editor: a museum (picked from its name) gets no "Open after midnight?" and no "+ Add a second time".
  await sim.click('go:hours:edit');
  assert.ok(sim.has('[data-hopen="tue"]'));
  await sim.click('[data-hopen="tue"]');
  assert.ok(!sim.has('[data-late]'), 'no after-midnight buttons');
  assert.ok(!sim.has('[data-addtime]'), 'no second time');
  const sim1 = await openSetup(base, t, { hash: 'hours' });
  await sim1.click('hoursOk');
  await sim1.click('seaMore');
  await sim1.click('yearSeason:winter');
  await sim1.click('[data-hoff="tue"]');
  await sim1.click('[data-hoff="wed"]');
  await sim1.click('hoursSave');
  assert.ok((app.venueHoursExtras(v.id).seasons || []).length >= 1, 'winter hours saved');
  assert.match(sim1.toast(), /Closed over Christmas or for a winter break\? Add it under Closures in More about your place\./);
  // French: the same line in French (another museum, the French setup).
  const vf = museum();
  const simFr = await openSetup(base, tokenFor(vf.id), { lang: 'fr', hash: 'hours' });
  await simFr.click('hoursOk');
  await simFr.click('seaMore');
  await simFr.click('yearSeason:winter');
  await simFr.click('[data-hoff="tue"]');
  await simFr.click('hoursSave');
  assert.match(simFr.toast(), /Fermé pendant les Fêtes ou pour une pause d’hiver\s?\? Ajoutez-le sous Fermetures dans Plus sur votre endroit\./);
  // A bowling centre keeps both buttons.
  const b = mk('indoor', { name: 'Kobau Lanes T1', description: 'Five-pin bowling.' });
  const sb = await openSetup(base, tokenFor(b.id), { hash: 'hours' });
  await sb.click('go:hours:edit');
  await sb.click('[data-hopen="tue"]');
  assert.ok(sb.has('[data-late]'), 'after-midnight kept for bowling');
  assert.ok(sb.has('[data-addtime]'), 'second time kept for bowling');
  assert.match(sb.text(), /\+ Add a second time \(if you close in between\)/);
});

test('6. Build My Trip: a month-only or undated request that overlaps a yearly closure says so on the card (EN + FR)', async () => {
  const v = museum({ name: 'Summerland Museum Closure T1' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1h', book: 'no', age: 'all', year: 'all' } }));
  await ok(change(t, { closures: [{ from: '12-24', to: '01-14', note: 'Closed for the winter break. Back mid-January.', yearly: true }] }));
  const jan = app.runTripPlan({ text: 'museum in Summerland in January' }, NOW);
  const s = itemsOf(jan).find((x) => x.venue.id === v.id);
  assert.ok(s, JSON.stringify(itemsOf(jan).map((x) => x.venue.name)));
  assert.deepEqual(s.venue.yearlyClosure, { en: 'Closed Dec 24 – Jan 14 every year', fr: 'Fermé du 24 déc. au 14 janv. chaque année' });
  // Undated, in December: the break is within the next weeks.
  const dec = app.runTripPlan({ text: 'museum in Summerland' }, new Date('2026-12-10T12:00:00-08:00'));
  const sd = itemsOf(dec).find((x) => x.venue.id === v.id);
  assert.ok(sd && sd.venue.yearlyClosure, 'undated December plan');
  // July: nothing to say.
  const jul = app.runTripPlan({ text: 'museum in Summerland in July' }, NOW);
  const sj = itemsOf(jul).find((x) => x.venue.id === v.id);
  assert.ok(sj && !sj.venue.yearlyClosure, 'no note in July');
  // The card shows it.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(v3, /v\.yearlyClosure \? '<p class="t3-hours t3-closure">' \+ esc\(lang\(\) === 'fr' \? v\.yearlyClosure\.fr : v\.yearlyClosure\.en\)/);
});

test('7. during the yearly break the page says "Closed for the winter break · Reopens Jan 15" (one line), in French too', async () => {
  const v = museum({ name: 'Summerland Museum Break T1' });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['museum'], length: '1h', book: 'no', age: 'all', year: 'all' } }));
  await ok(change(t, { closures: [{ from: '12-24', to: '01-14', note: 'Closed for the winter break. Back mid-January.', yearly: true }] }));
  const at = new Date('2026-12-27T12:00:00-08:00');
  const en = page(v, 'en', at), fr = page(v, 'fr', at);
  const line = /id="venueOpenStatus">([^<]*)</.exec(en)[1].trim();
  assert.equal(line, 'Closed for the winter break · Reopens Jan 15');
  assert.doesNotMatch(plain(en), /Closed between seasons/);
  assert.equal((plain(en).match(/Reopens Jan 15|reopens Jan 15/gi) || []).length, 1, 'said once');
  assert.equal(/id="venueOpenStatus">([^<]*)</.exec(fr)[1].trim(), 'Fermé pour la pause d’hiver · Réouverture le 15 janv.');
  // No note: a Christmas break is "the holidays"; a long spring break between two seasons stays "between seasons".
  const p1 = hours.parseHours(JSON.stringify({ ...SUMMER, _closures: [{ from: '2026-12-20', to: '2027-01-10', yearly: true }] }));
  const c1 = { weekday: 'mon', minutes: 600, date: '2026-12-28' };
  assert.equal(hours.hoursStatusLabel(hours.statusAt(p1, c1), c1).text, 'Closed for the holidays · Reopens Jan 11');
  const p2 = hours.parseHours(JSON.stringify({ ...SUMMER, _closures: [{ from: '2027-04-01', to: '2027-05-15', note: 'Between seasons.', yearly: true }] }));
  const c2 = { weekday: 'thu', minutes: 600, date: '2027-04-15' };
  assert.equal(hours.hoursStatusLabel(hours.statusAt(p2, c2), c2).text, 'Closed between seasons · Reopens May 16');
});

test('8. search: "heritage" finds a museum; "free museum" finds free and by-donation museums', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  try {
    const v = museum({ name: 'Okanagan Falls Archives T1', region: 'okanagan-falls', description: 'Local history and old photographs.' });
    await ok(change(tokenFor(v.id), { indoor_info: { kinds: ['museum'] } }));
    await ok(change(tokenFor(v.id), { indoor_price: 'donation' }));
    const paid = mk('indoor', { name: 'Paid Museum T1', region: 'okanagan-falls', description: 'A museum of old cars.' });
    await ok(change(tokenFor(paid.id), { indoor_info: { kinds: ['museum'] } }));
    await ok(change(tokenFor(paid.id), { indoor_price: 15 }));
    const heritage = plain(await getText(`/search?q=${encodeURIComponent('heritage')}`));
    assert.ok(heritage.includes('Okanagan Falls Archives T1'), heritage.slice(0, 600));
    const free = plain(await getText(`/search?q=${encodeURIComponent('free museum')}`));
    assert.ok(free.includes('Okanagan Falls Archives T1'), free.slice(0, 600));
    assert.ok(!free.includes('Paid Museum T1'), 'a paid museum is not a free museum');
  } finally { delete process.env.DISCOVERY_SEARCH; }
});

test('9. Good to know chips follow the kind: a museum gets museum chips (no grip socks or waivers), a climbing gym keeps them, a spa says arrive early', async () => {
  const chipsOf = async (v, lang) => { const sim = await openSetup(base, tokenFor(v.id), { hash: 'bring', lang }); return sim.doc.getElementById('suScreen').querySelectorAll('[data-quick]').map((b) => b.getAttribute('data-quick')); };
  const m = museum();
  await ok(change(tokenFor(m.id), { indoor_info: { kinds: ['museum'] } }));
  const mc = await chipsOf(m);
  for (const c of ['Free on the first Sunday', 'Gift shop', 'Bags can be left at the desk']) assert.ok(mc.includes(c), c);
  assert.ok(!mc.some((c) => /grip socks|waiver/i.test(c)), mc.join(' | '));
  assert.ok(mc.length <= 7);
  const mf = await chipsOf(m, 'fr');
  assert.ok(mf.includes('Gratuit le premier dimanche'), mf.join(' | '));
  const g = mk('indoor', { name: 'Gneiss Climbing T1', description: 'Bouldering.' });
  await ok(change(tokenFor(g.id), { indoor_info: { kinds: ['climbing'] } }));
  const gc = await chipsOf(g);
  // Indoor test 17: the waiver chip says the kind's verb.
  assert.ok(gc.includes('Grip socks required') && gc.includes('Waiver to sign before you climb'), gc.join(' | '));
  const s = mk('indoor', { name: 'Nordic Spa T1', description: 'Hot and cold pools.' });
  await ok(change(tokenFor(s.id), { indoor_info: { kinds: ['spa'] } }));
  const sc = await chipsOf(s);
  assert.equal(sc[0], 'Arrive 15 minutes early');
  assert.ok(!sc.some((c) => /grip socks|waiver/i.test(c)));
  // The museum's chips show in French on the French page, as her presets do.
  const sim = await openSetup(base, tokenFor(m.id), { hash: 'bring' });
  await sim.click('[data-quick="Gift shop"]');
  await sim.click('bringSave');
  assert.ok(plain(page(m, 'fr')).includes('Boutique sur place'), 'the chip reads in French on the French page');
});

test('10. Help: hours answers have no ski words and name the folded summer/winter link; the hours button says shows or classes only; French is optional', async () => {
  const v = museum();
  const t = tokenFor(v.id);
  const en = helpTopics(await getText(`/owner/${t}/setup`));
  const sea = en.find((x) => x.id === 'seasonal-hours');
  assert.ok(sea, 'seasonal hours topic');
  assert.doesNotMatch(sea.a + sea.aFr, /lifts close|remontées ferment/);
  assert.match(sea.a, /tap <strong>Different hours in summer or winter\?<\/strong>, then <strong>No, different in summer<\/strong>/);
  assert.match(sea.aFr, /Des heures différentes l’été ou l’hiver/);
  const noHours = en.find((x) => x.id === 'indoor-no-hours');
  assert.match(noHours.q, /shows or classes only/);
  const frT = en.find((x) => x.id === 'indoor-french');
  assert.match(frT.a, /<strong>No\.<\/strong> It’s optional: we translate it for you\./);
  const brk = en.find((x) => x.id === 'indoor-yearly-break');
  assert.match(brk.a, /open <strong>Closures and holidays<\/strong> in <strong>More about your place<\/strong>/);
  assert.match(brk.a, /Every year/);
  // The setup's own words: the button, and the softer French line on the finish screen.
  const sim = await openSetup(base, t, { hash: 'hours' });
  assert.match(sim.text(), /We don’t have set hours \(shows or classes only\)/);
  assert.equal(require('../owner-setup-text.js').en.indoor.frDescOld, 'Optional: we translate your story into French for you. Speak French?');
});

test('11. "Type them in myself" from the setup is part of the setup: its title says so and its way back is the setup', async () => {
  const v = museum();
  const t = tokenFor(v.id);
  const sim = await openSetup(base, t, { hash: 'menu' });
  const a = sim.doc.getElementById('suMenuType');
  assert.ok(a, 'the Type them in myself button');
  assert.match(a.getAttribute('href'), /\/menu\?from=setup#type$/);
  const html = await getText(a.getAttribute('href').replace(/#.*$/, ''));
  assert.match(html, /Your prices \(part of your setup\)/);
  assert.match(html, new RegExp(`"back":"\\/owner\\/${t}\\/setup#more"`));
  assert.match(html, /Back to your setup/);
  // Opened from the edit page it stays the full editor.
  assert.doesNotMatch(await getText(`/owner/${t}/menu`), /part of your setup/);
});
