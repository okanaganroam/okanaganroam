// Indoor test 19 (2026-11-19; Priyanka, a kids' indoor play centre in Kelowna: $15 a child, parents free, walk-ins, kids 0 to
// 10, closed Christmas Day, a café inside, toddler-only mornings, birthday parties). The last fix round: each leftover from
// her report, checked with the real setup page script and real taps (tests/setup-sim.js), the public page (EN + FR), search
// and the Help widget's own matcher. Her Help questions (EN + FR) are in the Help matrix (tests/indoor-help-matrix.test.js).
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test19-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const DAY = (a, b) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]]));
const STORY = 'Indoor playground for kids 0 to 10, with a ball pit, a sand table and a café for parents. Toddler-only mornings Tuesday and Thursday.';
let n = 0, ipN = 0, srv, base;
const mk = (o = {}) => app.createVenue({ name: `Indoor T19 Fixture ${++n}`, slug: `indoor-t19-${n}`, region: 'kelowna', type: 'indoor', latitude: 49.8801 + n / 4000, longitude: -119.4772,
  address: `${400 + n} Water St, Kelowna, BC`, phone: '250-555-0119', website: 'https://example.com', hours: JSON.stringify(DAY('09:00', '18:00')), rating: 4.6, reviews: 120,
  description: 'A local place in Kelowna.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.219.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const NOW = new Date('2026-11-19T12:00:00-08:00');
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/[\s  ]+/g, ' ');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id) };
};
const answer = (bot, id, fr = false) => plain(fr ? bot.topic(id).aFr : bot.topic(id).a);
const publishPrices = (id, items) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: 'Play passes', note: '', items: items.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));

// Priyanka's play centre: her answers (kids, 1–2 hours, walk-ins, All ages, all year, $15 a child).
const priyanka = async (o = {}, answers = {}) => {
  const v = mk({ name: `Play Area Kelowna T19 ${n + 1}`, cuisine: 'Indoor playground', description: STORY, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['kids'], length: '1-2h', book: 'no', age: 'all', year: 'all', ...answers }, indoor_price: 15 }));
  return { v, t };
};

test('1. Help: "parents free" at a place that charges is Your prices ("Adults free"), never Free entry; Free entry stays for a free place (EN + FR)', async () => {
  const { t } = await priyanka();
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  for (const q of ['parents free', 'parents are free', 'adults free', 'parents get in free']) assert.equal(en.best(q).id, 'indoor-price', q);
  for (const q of ['parents gratuits', 'les parents entrent gratuitement']) assert.equal(fr.best(q).id, 'indoor-price', q);
  assert.match(answer(en, 'indoor-price'), /Parents or adults get in free\? Add a line in Your prices , like Adults free : your card keeps “Child admission \$15”\. Don’t tap Free entry : that’s for places where nobody pays\./);
  assert.match(answer(fr, 'indoor-price', true), /Adultes : gratuit/);
  assert.match(answer(fr, 'indoor-price', true), /Ne touchez pas Entrée gratuite/);
  // Nobody pays: Free entry is still the answer for "we are free", and a free gallery gets no "Adults free" line.
  for (const q of ['we are free', 'free entry', 'by donation']) assert.equal(en.best(q).id, 'indoor-free', q);
  const g = mk({ name: 'Free Gallery T19', cuisine: 'Art gallery', description: 'A free art gallery.' }), gt = tokenFor(g.id);
  await ok(change(gt, { indoor_info: { kinds: ['gallery'], length: '1h', book: 'no', age: 'all' }, indoor_price: 'free' }));
  const ge = helpBot(await getText(`/owner/${gt}/setup`));
  assert.doesNotMatch(answer(ge, 'indoor-price'), /Adults free/);
  assert.equal(ge.best('we are free').id, 'indoor-free');
});

test('2. Help: the price list page answers a membership with no set price, socks required $3 and "should child admission say 2 and up"; the setup answers café inside, monthly membership, toddler time to What\'s On and the Book a party button (EN + FR)', async () => {
  const { t } = await priyanka();
  const men = helpBot(await getText(`/owner/${t}/menu`)), mfr = helpBot(await getText(`/fr/owner/${t}/menu`));
  for (const [q, id, qf] of [['monthly membership no set price', 'indoor-no-set-price', 'abonnement mensuel sans prix fixe'], ['socks required $3', 'indoor-required-buy', 'chaussettes obligatoires 3 $'],
    ['should child admission say 2 and up', 'indoor-line-age', 'l’entrée enfant doit-elle dire 2 ans et plus']]) {
    assert.equal((men.best(q) || {}).id, id, q);
    assert.equal((mfr.best(qf) || {}).id, id, qf);
  }
  assert.match(answer(men, 'indoor-no-set-price'), /leave the price blank/);
  assert.match(answer(men, 'indoor-no-set-price'), /never changes your card’s price/);
  assert.match(answer(mfr, 'indoor-no-set-price', true), /laissez le prix vide/);
  assert.match(answer(men, 'indoor-required-buy'), /Grip socks \(required\) \$3/);
  assert.match(answer(men, 'indoor-required-buy'), /Good to know/);
  assert.match(answer(men, 'indoor-line-age'), /Child admission \(2 and up\) \$15/);
  assert.match(answer(mfr, 'indoor-line-age', true), /2 ans et plus/);
  // The setup: café inside is Good to know (or the story), a monthly membership Your prices, toddler time on What's On the
  // weekly event answer (never the price answer), the Book a party button "already does it".
  const en = helpBot(await getText(`/owner/${t}/setup`)), fr = helpBot(await getText(`/fr/owner/${t}/setup`));
  for (const [q, id, qf] of [['we have a cafe inside', 'indoor-good-to-know', 'nous avons un café sur place'], ['monthly membership', 'indoor-price', 'abonnement mensuel'],
    ['how do i add toddler time to whats on', 'indoor-theme-nights', 'comment ajouter le temps des tout-petits à l’affiche'], ['the book button should say book a party', 'indoor-book-party', 'le bouton devrait dire réserver une fête']]) {
    assert.equal((en.best(q) || {}).id, id, q);
    assert.equal((fr.best(qf) || {}).id, id, qf);
  }
  // A cheaper toddler time is still a price.
  assert.equal(en.best('toddler time is cheaper').id, 'indoor-price');
  assert.match(answer(en, 'indoor-good-to-know'), /A café or snack bar inside\? Say it here too, like Café inside with coffee and snacks , or in a sentence of your story\./);
  assert.match(answer(en, 'indoor-theme-nights'), /Add an event/);
  assert.match(answer(en, 'indoor-theme-nights'), /Known for/);
  const bp = answer(en, 'indoor-book-party');
  assert.match(bp, /^ ?It already does, with your party link\./);
  assert.match(bp, /Party or group booking link : your page’s button says Book a party/);
  assert.match(bp, /Your Groups line about parties/);
  assert.match(answer(fr, 'indoor-book-party', true), /Réserver une fête/);
  // A cinema's button is Showtimes & tickets: no Book a party answer there.
  const c = mk({ name: 'Cinema T19', cuisine: 'Cinema', description: 'A cinema.' }), ct = tokenFor(c.id);
  await ok(change(ct, { indoor_info: { kinds: ['cinema'], length: '2-3h', book: 'busy', age: 'all' }, indoor_price: 14 }));
  assert.equal(helpBot(await getText(`/owner/${ct}/setup`)).topic('indoor-book-party'), undefined);
  // And the button really says Book a party with a party link (walk-ins welcome).
  const { v: v2, t: t2 } = await priyanka();
  db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(v2.id, 'https://playarea.example/birthday-parties');
  assert.match(plain(page(v2)), /Book a party/);
});

test('3. Search: "christmas day" / "december 25" applies the date (Closed Dec 25 on her card) with no "december" note; "boxing day" is the holiday, never the word "boxing"; other holidays in EN and FR', async () => {
  const { v, t } = await priyanka({ name: 'Play Area Kelowna T19 Search' });
  await ok(change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }] }));
  await priyanka({ name: 'Wild Kidz T19 Search' });
  const cardOf = (html, name) => { const i = html.indexOf(`data-venue-name="${name}"`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('</li>', i)); };
  for (const [q, day] of [['indoor playground kelowna christmas day', 'Dec 25'], ['indoor playground kelowna december 25', 'Dec 25'], ['indoor playground kelowna on christmas', 'Dec 25'],
    ['indoor playground kelowna boxing day', 'Dec 26'], ['indoor playground kelowna christmas eve', 'Dec 24'], ['indoor playground kelowna new years day', 'Jan 1']]) {
    const h = await getText(`/search?q=${encodeURIComponent(q)}`), p = plain(h);
    assert.doesNotMatch(p, /isn’t something search can apply/, q);
    assert.doesNotMatch(p, /“boxing”|No places match/, q);
    assert.match(p, new RegExp(`in Kelowna on ${day}`), q);
    const card = cardOf(h, v.name);
    if (day === 'Dec 25') assert.match(card, /data-fd-day="1">Closed Dec 25</, q);
    else assert.match(card, new RegExp(`data-fd-day="1">${day} · `), q);
  }
  for (const [q, day, mine] of [['aire de jeux intérieure kelowna noël', '25 déc\\.', /Fermé le 25 déc\./], ['aire de jeux intérieure kelowna 25 décembre', '25 déc\\.', /Fermé le 25 déc\./],
    ['aire de jeux intérieure kelowna lendemain de noël', '26 déc\\.', /26 déc\. · /], ['aire de jeux intérieure kelowna jour de l’an', '1er janv\\.', /1er janv\. · /]]) {
    const h = await getText(`/fr/search?q=${encodeURIComponent(q)}`), p = plain(h);
    assert.match(p, new RegExp(`à Kelowna le ${day}`), q);
    assert.doesNotMatch(p, /« lendemain »|ne peut pas encore appliquer|“december”/, q);
    assert.match(cardOf(h, v.name), mine, q);
  }
  // The holiday words are taken out of the place search (and an "on" before them); other words stay.
  assert.equal(app.smartStripHoliday('indoor playground kelowna on boxing day'), 'indoor playground kelowna');
  assert.equal(app.smartStripHoliday('escape room christmas eve penticton'), 'escape room penticton');
  assert.equal(app.smartStripHoliday('boxing gym kelowna'), 'boxing gym kelowna');
  // Sport test 1 (2026-11-20): a month alone (no date) is applied too ("in December"), never "can't apply".
  const dec = plain(await getText(`/search?q=${encodeURIComponent('indoor playground kelowna december')}`));
  assert.doesNotMatch(dec, /isn’t something search can apply/);
  assert.match(dec, /in December/);
});

test('4. The visit box: "Season: All year." is left off, and the automatic Time needed row goes before her researched Food line or her own Groups line when the box is full', async () => {
  const { v, t } = await priyanka({}, { book: undefined });
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(v.id, JSON.stringify({ rows: [
    { label: 'Prices', text: '$25 per child for up to three hours of play. Up to 2 supervising adults free.' },
    { label: 'Known for', text: 'Indoor playground for 9 months to 10 years.' },
    { label: 'Ages', text: 'Main play floor is for 9 months to 10 years.' },
    { label: 'Season', text: 'Open year-round.' },
    { label: 'Food', text: 'Parties can bring their own food, cake and non-alcoholic drinks; no catering requirement.' },
    { label: 'Good to know', text: 'Shoes off at the door.' },
  ], source_url: 'https://example.com', checked_at: '2026-10-01' }));
  await ok(change(t, { indoor_info: { book: 'no' } }));
  await ok(change(t, { visit_rows: { groups: 'Birthday parties on weekends, book online.', known_for: 'Indoor playground for kids 0 to 10 with a café for parents', good_to_know: 'Grip socks required. A parent must stay.' } }));
  app.writeIndoorVisitRows(v.id);
  const info = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info);
  const labels = info.rows.map((r) => r.label);
  assert.ok(labels.includes('Food'), labels.join(', '));
  assert.ok(labels.includes('Groups'), labels.join(', '));
  assert.ok(!labels.includes('Season'), labels.join(', '));
  assert.ok(info.rows.length <= 7);
  const en = plain(page(v)), fr = plain(page(v, 'fr'));
  assert.doesNotMatch(en, /Season All year\.|Open year-round/);
  assert.doesNotMatch(fr, /Toute l’année\./);
  assert.match(en, /Parties can bring their own food/);
  // Her card still says how long a visit takes (from her answer, not the row).
  assert.equal(app.venueIndoorInfo(v.id).length, '1-2h');
  // (A yearly shutdown is still said, "All year except Aug 16–29.": tests/indoor-test10-fixes.test.js.)
});

test('5. The price box reads "adults free, kids 15" as 15 (the kid\'s number), in either order and in French; the hint for words with no price', async () => {
  const { v, t } = await priyanka();
  for (const [typed, want, lang] of [['adults free, kids 15', 15, 'en'], ['kids $16, parents free', 16, 'en'], ['Parents free and children 17', 17, 'en'], ['adultes gratuits, enfants 18', 18, 'fr']]) {
    const g = await openSetup(base, t, { hash: 'price', lang });
    await g.type('suTprice', typed);
    assert.match(g.doc.getElementById('suTpriceLead').textContent, new RegExp(lang === 'fr' ? `${want}\\s?\\$` : `\\$${want}`), typed);
    await g.click('priceSave');
    assert.equal(app.indoorPrice(v.id), want, typed);
  }
  const h = await openSetup(base, t, { hash: 'price' });
  await h.type('suTprice', 'call us for prices');
  await h.click('priceSave');
  assert.match(h.text(), /We couldn’t find a price in that\. Type your main price with its number, like 25\. Some people get in free \(like adults\)\? Add that line in Your prices\. Nobody pays\? Tap Free entry\./);
  assert.doesNotMatch(h.text(), /Just the number/);
});

test('6. A kids\' place has All ages pre-picked ("We picked…"), saved on Save, with one hint line about a range like 0 to 10 (EN + FR); another kind has no such hint', async () => {
  const v = mk({ name: 'Play Area T19 Ages', cuisine: 'Indoor playground', description: STORY });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['kids'], length: '1-2h', book: 'no' }, indoor_price: 15 }));
  const g = await openSetup(base, t, { hash: 'offer' });
  assert.ok(g.has('[data-tpick="age:all"][aria-pressed="true"]'), 'All ages pre-picked');
  assert.ok(g.has('#suAgeGuess'), 'We picked…');
  assert.equal(g.doc.getElementById('suAgeKidsHint').textContent, 'For kids up to an age, like 0 to 10? Say it in your story.');
  assert.equal(app.venueIndoorInfo(v.id).age, undefined, 'not saved before Save');
  await g.click('offerSave');
  assert.equal(app.venueIndoorInfo(v.id).age, 'all');
  const gf = await openSetup(base, tokenFor(v.id), { hash: 'offer', lang: 'fr' });
  assert.match(gf.doc.getElementById('suAgeKidsHint').textContent, /^Pour les enfants jusqu’à un certain âge, comme de 0 à 10 ans\s?\? Dites-le dans votre histoire\.$/);
  const c = mk({ name: 'Climb T19 Ages', cuisine: 'Climbing gym', description: 'Bouldering gym.' }), ct = tokenFor(c.id);
  await ok(change(ct, { indoor_info: { kinds: ['climbing'], length: '1-2h', book: 'no' }, indoor_price: 22 }));
  assert.ok(!(await openSetup(base, ct, { hash: 'offer' })).has('#suAgeKidsHint'));
});

test('7. Polish: "Every day" closes Monday\'s hours editor; the French title says the category; "free" in a price line is « gratuit » on the French page; the [TRANSLATE] emails of one visit are one email', async () => {
  const { v, t } = await priyanka({ name: 'Play Area T19' });
  // Hours: open Monday, copy to every day: Monday's editor is closed, every day has Monday's hours.
  const g = await openSetup(base, t, { hash: 'hours' });
  await g.click('go:hours:edit');
  await g.click('[data-hopen="mon"]');
  assert.ok(g.has('[data-copyall="mon"]'));
  await g.click('[data-copyall="mon"]');
  assert.ok(!g.has('[data-copyall="mon"]'), 'Monday’s editor closed');
  assert.ok(g.has('[data-hopen="mon"]'));
  // The French page's title: her category.
  assert.match(page(v, 'fr'), /<title>[^<]*— Aire de jeux intérieure à Kelowna, C\.-B\./);
  assert.doesNotMatch(page(v, 'fr'), /<title>[^<]*Activité intérieure/);
  // Free in a price line.
  publishPrices(v.id, [['Child admission', '15'], ['Adults', 'Free'], ['Under 2', 'free']]);
  const fr = plain(page(v, 'fr')), en = plain(page(v));
  assert.match(fr, /Adults Gratuit/);
  assert.match(fr, /Under 2 gratuit/);
  assert.doesNotMatch(fr, /\bFree\b|\bfree\b/);
  assert.match(en, /Adults Free/);
  // One setup visit's French lines go to Dayton as one [TRANSLATE] email.
  const { v: v2, t: t2 } = await priyanka();
  sent.length = 0;
  await ok(change(t2, { visit_rows: { good_to_know: 'Shoes off at the door. A parent must stay.' } }));
  await ok(change(t2, { visit_rows: { groups: 'Birthday parties on weekends, book online.' } }));
  await ok(change(t2, { visit_rows: { known_for: 'Toddler-only mornings Tuesday and Thursday' } }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(sent.filter((m) => /\[TRANSLATE\]/.test(JSON.stringify(m))).length, 0, 'held for a few minutes');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines'").get(v2.id).n >= 3, 'each line in the admin queue at once');
  assert.equal(app.sendFrLinesEmailNow(v2.id), true);
  await new Promise((r) => setTimeout(r, 30));
  const tr = sent.filter((m) => /\[TRANSLATE\]/.test(JSON.stringify(m)));
  assert.equal(tr.length, 1);
  const body = JSON.stringify(tr[0]);
  assert.match(body, /Shoes off at the door/);
  assert.match(body, /Birthday parties on weekends/);
  assert.match(body, /Toddler-only mornings/);
  assert.equal(app.sendFrLinesEmailNow(v2.id), false, 'nothing left to send');
});
