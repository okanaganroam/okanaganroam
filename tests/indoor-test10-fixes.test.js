// Indoor test 10 (2026-11-19; Sandra, communications coordinator for a city aquatic and fitness centre in Vernon: a 25 m
// lap pool, a leisure pool, a hot tub, sauna and steam room; drop-in $7.50, kids $3.50, 10-visit passes; closed every
// stat holiday and two weeks each August for maintenance; swim times change by season, on a schedule PDF). Each fix from
// her report, checked with the real setup page script and real taps (tests/setup-sim.js), Build My Trip, search and the
// public pages. Her Help questions are in the Help matrix (tests/indoor-help-matrix.test.js); the vocabulary audit and the
// synonyms of every kind in tests/indoor-planner-matrix.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-test10-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const { openSetup } = require('./setup-sim.js');
const IK = require('../indoor-kinds.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const HOURS = JSON.stringify({ mon: [['06:00', '21:00']], tue: [['06:00', '21:00']], wed: [['06:00', '21:00']], thu: [['06:00', '21:00']], fri: [['06:00', '21:00']], sat: [['09:00', '19:00']], sun: [['08:00', '19:00']] });
const STORY = 'The city’s indoor pool at the Recreation Centre, with a 25 m, 8-lane lap pool, a leisure pool with a waterslide, plus a hot tub, sauna and steam room.';
let n = 0;
const mk = (o = {}) => app.createVenue({ name: `Indoor T10 Fixture ${++n}`, slug: `indoor-t10-${n}`, region: 'vernon', type: 'indoor', latitude: 50.2668 + n / 3000, longitude: -119.2716,
  address: `${3300 + n} 37 Ave, Vernon, BC`, phone: '250-555-0135', website: 'https://example.com', hours: HOURS, description: 'A fixture used only by the indoor test 10 checks.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.83.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const pageHtml = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOW });
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const closuresOf = (id) => { const r = db.prepare('SELECT closures FROM venue_hours_extra WHERE venue_id = ?').get(id); return r && r.closures ? JSON.parse(r.closures) : []; };
const publishPrices = (id, items, section = 'Drop-in') => db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')")
  .run(id, JSON.stringify({ sections: [{ name: section, note: '', items: items.map(([name, price]) => ({ name, description: '', price, dietary: [], check: false })) }] }));

// Sandra's place: her story, her answers.
const sandra = async (o = {}, info = {}) => {
  const v = mk({ name: `Vernon Aquatic Centre T10 ${n + 1}`, cuisine: 'Pool', description: STORY, kid_friendly: 1, ...o });
  const t = tokenFor(v.id);
  await ok(change(t, { indoor_info: { kinds: ['pool'], length: '1-2h', book: 'no', age: 'all', year: 'all', ...info }, indoor_price: 7.5 }));
  return { v, t };
};
const BC_STATS = ['nyd', 'family', 'goodFri', 'victoria', 'canada', 'bcDay', 'labour', 'truth', 'thanks', 'remembrance', 'xmas'];

test('1. Closures: 11 BC stat holidays "this year and next" plus a yearly shutdown save (one closure each toward the cap of 20), with the button count', async () => {
  const { v, t } = await sandra();
  await ok(change(t, { closures: [{ from: '08-16', to: '08-29', note: 'Annual maintenance', yearly: true }] }));
  const g = await openSetup(base, t, { hash: 'closures' });
  if (g.has('[data-act="holAll"]')) await g.click('holAll');
  for (const k of BC_STATS) await g.click(`[data-hol="${k}"]`);
  assert.match(g.text(), /Save these closures \(11 new\)/);
  await g.click('closuresSave');
  assert.doesNotMatch(g.text(), /up to 20/);
  const stored = closuresOf(v.id);
  assert.equal(stored.filter((c) => c.yearly).length, 1);
  assert.equal(stored.filter((c) => !c.yearly).length, 22, JSON.stringify(stored));
  assert.equal(app.ownerClosureCount ? app.ownerClosureCount(stored) : 12, 12);
  // 21 different closures is still over the cap, with the same words.
  const many = Array.from({ length: 21 }, (_, i) => ({ from: `2027-0${1 + Math.floor(i / 9)}-${String(1 + (i % 9) * 3).padStart(2, '0')}`, to: `2027-0${1 + Math.floor(i / 9)}-${String(1 + (i % 9) * 3).padStart(2, '0')}`, note: `Closed ${i}` }));
  const r = await change(t, { closures: many });
  assert.equal(r.status, 400);
  assert.match(JSON.stringify(r.body), /up to 20 closures/);
});

test('2. "Are these your hours all year?" says where a maintenance shutdown goes (EN + FR)', async () => {
  const { t } = await sandra();
  const g = await openSetup(base, t, { hash: 'hours:year' });
  assert.match(g.text(), /Closed a week or two each year, like a maintenance shutdown\? Add it under Closures and holidays\./);
  const f = await openSetup(base, t, { hash: 'hours:year', lang: 'fr' });
  assert.match(f.text(), /comme pour un arrêt d’entretien\s?\? Ajoutez-le dans Fermetures et jours fériés\./);
});

test('3. A link in Good to know names the setup\'s own Address, phone and website box (never the booking link)', async () => {
  const { t } = await sandra();
  const g = await openSetup(base, t, { hash: 'bring' });
  await g.type('suBring', 'Swim times change by season, see vernon.ca');
  await g.click('bringSave');
  assert.match(g.text(), /Your website goes in Address, phone and website, and your Website button links to it/);
  assert.doesNotMatch(g.text(), /booking link/);
});

test('4. "Adult drop-in $7.50" (not "from") when her typed prices list a lower one: page, card, Build My Trip, EN + FR; every kind has its words', async () => {
  const { v } = await sandra();
  assert.match(plain(pageHtml(v)), /Adult drop-in \$7\.50\./); // indoor test 12: never "from" for one drop-in
  publishPrices(v.id, [['Adult drop-in', '7.50'], ['Youth drop-in', '4.75'], ['Child drop-in', '3.50'], ['Locker', '1'], ['10-visit pass', '67.50']]);
  app.writeIndoorVisitRows(v.id);
  app.indoorCardPrice && app.indoorCardPrice(v.id);
  const en = plain(pageHtml(v)), fr = plain(pageHtml(v, 'fr'));
  assert.match(en, /Prices Adult drop-in \$7\.50\./);
  assert.doesNotMatch(en, /Drop-in from/);
  assert.match(fr, /Entrée adulte à la séance 7,50 \$\./);
  assert.deepEqual(app.indoorPlannerFacts(v.id).indoorPriceLine, ['Adult drop-in {x}', 'Entrée adulte à la séance {x}']);
  assert.equal(app.cardPriceFor(v.id), '$7.50');
  // A lower add-on alone (a locker) never makes it exact.
  const { v: v2 } = await sandra();
  publishPrices(v2.id, [['Adult drop-in', '7.50'], ['Locker', '1'], ['Towel rental', '2']]);
  app.writeIndoorVisitRows(v2.id);
  assert.match(plain(pageHtml(v2)), /Adult drop-in \$7\.50\./);
  // Every kind has its exact words, English and French.
  for (const k of IK.INDOOR_KIND_TEXT_KINDS) for (const l of ['en', 'fr']) assert.ok(IK.INDOOR_KIND_TEXT[k][l].price.exact, `${k} ${l}`);
  // Her typed price names show as typed on the French page (never half translated).
  assert.match(fr, /Adult drop-in 7,50 \$ Youth drop-in 4,75 \$/);
});

test('6. Holiday plans name her closure on every path (keyword, kind, near-town, outing, day plan, French)', async () => {
  const { v, t } = await sandra({ name: 'Vernon Aquatic Centre T10 Closed' });
  await ok(change(t, { closures: [{ from: '2026-12-25', to: '2026-12-25', note: 'Christmas Day' }, { from: '08-16', to: '08-29', note: 'Annual maintenance', yearly: true }] }));
  const line = `${v.name} is closed Dec 25 (Christmas Day).`;
  for (const q of ['pool in Vernon on Christmas Day', 'swim on Christmas Day in Vernon', 'swimming pool Vernon December 25', 'hot tub Vernon on Christmas Day', 'lane swim Vernon early morning on Christmas Day',
    'pool and lunch in Vernon on Christmas Day', 'a day in Vernon with a swim on Christmas Day', 'indoor pool Coldstream on Christmas Day', 'piscine à Vernon le 25 décembre']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(!itemsOf(p).some((x) => x.venue.id === v.id), q);
    const all = [...(p.warnings || []), ...(p.notes || [])];
    assert.ok(all.includes(line), `${q}: ${JSON.stringify(all)}`);
    assert.ok(!all.some((w) => /is closed on your dates/.test(w) && w.startsWith(v.name)), q);
  }
  const yearly = app.runTripPlan({ text: 'pool in Vernon on August 20 2027' }, NOW);
  assert.ok([...(yearly.warnings || [])].some((w) => w === `${v.name} is closed Aug 20 (Annual maintenance).`), JSON.stringify(yearly.warnings));
  assert.equal(frCopy.t3FrenchText(line), `${v.name} est fermé le 25 déc. (Noël).`);
});

test('7. French Build My Trip: no English kind words in Why it fits, and the header says the kind once', () => {
  const { v } = { v: null };
  const p = app.runTripPlan({ text: 'piscine intérieure à Vernon' }, NOW);
  assert.equal(p.summary, 'Pools in Vernon.');
  assert.equal(frCopy.t3FrenchHeading(p.summary), 'Piscines à Vernon.');
  for (const it of itemsOf(p)) for (const w of it.why || []) assert.doesNotMatch(frCopy.t3FrenchText(w), /: (?:an? |the )|request for/i, w);
  // Every indoor kind's "Matches your request for …" reads in French.
  const TR = require('../trip-requirements.js');
  for (const k of [...new Set(Object.values(TR.INDOOR_KIND_PLANNER).flat().concat('sauna'))]) {
    const l = TR.LABELS[k], bare = /s$/.test(l) || /ing$/.test(l);
    const en = `Matches your request for ${bare ? l : `${/^[aeiou]/i.test(l) ? 'an' : 'a'} ${l}`}`;
    assert.doesNotMatch(frCopy.t3FrenchText(en), /\b(?:a|an|the|pool|cinema|library|gym|room|class|playground|tub|or)\b/, `${k}: ${frCopy.t3FrenchText(en)}`);
  }
  // A rainy-day indoor list says it once.
  const rain = app.runTripPlan({ text: 'indoor activities in Vernon on a rainy day' }, NOW);
  assert.doesNotMatch(rain.summary, /for a rainy day/);
});

test('8. A new listing with no French description is queued for its French (the French address keeps going to English until then)', async () => {
  const v = mk({ name: 'Vernon Aquatic Centre T10 No FR', cuisine: 'Pool', description: 'Research text.', description_fr: null });
  const t = tokenFor(v.id);
  const before = db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story'").get(v.id).n;
  await ok(change(t, { description: STORY }));
  const after = db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story'").get(v.id).n;
  assert.equal(after, before + 1);
  const r = await fetch(`${base}/fr/vernon/indoor/${v.slug}`, { redirect: 'manual', headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
  assert.ok([301, 302].includes(r.status), String(r.status));
});

test('9. "Early morning" starts at the place\'s opening time when it opens before 9 AM', () => {
  const { v } = { v: null };
  for (const q of ['lane swim Vernon early morning', 'early morning swim in Vernon']) {
    const p = app.runTripPlan({ text: q }, NOW);
    const first = (p.schedule || [])[0];
    assert.ok(first && first.startMinutes < 540, `${q}: ${JSON.stringify(p.schedule)}`);
    assert.ok(first.startMinutes >= 360, `${q}: ${JSON.stringify(p.schedule)}`);
  }
  // Without "early", the usual 9 AM.
  const plainDay = app.runTripPlan({ text: 'lane swim in Vernon' }, NOW);
  assert.ok(!(plainDay.schedule || [])[0] || plainDay.schedule[0].startMinutes >= 540 || plainDay.kind !== 'itinerary');
});

test('10. Polish: Rest of the year and All year except the shutdown; no cuisine for a pool; Your prices starts with her price; Help examples use the kind\'s price; staff line stays together', async () => {
  const { v, t } = await sandra({ name: 'Vernon Aquatic Centre T10 Polish' });
  await ok(change(t, { closures: [{ from: '08-16', to: '08-29', note: 'Annual maintenance', yearly: true }] }));
  const en = plain(pageHtml(v)), fr = plain(pageHtml(v, 'fr'));
  assert.match(en, /Season All year except Aug 16–29\./);
  assert.doesNotMatch(en, /Season All year\./);
  assert.match(en, /Hours through the year Rest of the year/);
  assert.doesNotMatch(en, /Aug 30 – Aug 15/);
  assert.match(fr, /Toute l’année, sauf du 16 au 29 août\./);
  assert.match(fr, /Reste de l’année/);
  // "Why it fits" never says cuisine for a pool.
  const p = app.runTripPlan({ text: 'Vernon pool with a waterslide' }, NOW);
  for (const it of itemsOf(p)) for (const w of it.why || []) assert.doesNotMatch(w, /cuisine/, w);
  // Your prices opens with her main price.
  const html = await (await fetch(`${base}/owner/${t}/menu`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text();
  assert.match(html, /"firstItem":\{"name":"Adult drop-in","price":"7.50"\}/);
  // Help examples: a pool with no price yet reads its own example price, never $25.
  const v2 = mk({ name: 'Vernon Pool T10 No Price', cuisine: 'Pool', description: STORY });
  const t2 = tokenFor(v2.id);
  await ok(change(t2, { indoor_info: { kinds: ['pool'], length: '1-2h', book: 'no', age: 'all', year: 'all' } }));
  const setup = await (await fetch(`${base}/owner/${t2}/setup`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text();
  const cfg = JSON.parse(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(setup)[1]);
  const price = cfg.topics.find((x) => x.id === 'indoor-price');
  assert.match(price.a, /Adult drop-in \$7\.50/); // indoor test 12: the page's words
  assert.doesNotMatch(price.a, /\$25/);
  // The staff line keeps "(Create a login);" together.
  const land = await (await fetch(`${base}/owner/${t}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text();
  assert.match(land, /<span class="op-nw">\(<a href="#opLogin" data-open-login>Create a login<\/a>\);<\/span>/);
});

test('5. Help: the "not the owner" answer starts "Yes — you don’t need to be the owner" on every type\'s setup', async () => {
  for (const [type, cuisine] of [['indoor', 'Pool'], ['tour', 'Boat tours'], ['restaurant', 'Pizza'], ['cafe', 'Coffee']]) {
    const v = mk({ type, cuisine, name: `Not Owner ${type} T10` });
    const html = await (await fetch(`${base}/owner/${tokenFor(v.id)}/setup`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text();
    const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html);
    if (!m) continue;
    const topic = JSON.parse(m[1]).topics.find((x) => x.id === 'not-owner');
    assert.ok(topic, type);
    assert.match(topic.a, /^<p><strong>Yes — you don’t need to be the owner; managers, staff and volunteers can use this link too\.<\/strong>/, type);
  }
});
