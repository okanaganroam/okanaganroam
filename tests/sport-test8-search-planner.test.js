// Sport tests 8 and 9 (2026-11-21): search and Build My Trip for Marg's Lumby Golf Club (a 9-hole walk-on course whose
// owner also picked Disc golf, short on Tuesdays for the men's league) and Gord's Summerland Golf & Country Club (18 holes,
// semi-private, prices on his website), as they left them (tests/sport89-fixture.js), among unverified courses in the same
// towns (drafts/fresh-eyes-sport8-2026-11-21 and -sport9-2026-11-21/REPORT.md, the search and planner items).
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test8-sp-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const F = require('./sport89-fixture.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, lum, sum, nb;
const NOV = new Date('2026-11-20T12:00:00-08:00');
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[\s  ]+/g, ' ');
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const search = async (q, fr = false) => plain(await getText(`${fr ? '/fr' : ''}/search?q=${encodeURIComponent(q)}`));
const order = (t, names) => names.map((n) => [n, t.indexOf(n)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
const model = (q) => app.searchPageModel(app.runDiscovery(q, { limit: 60 }), NOV, 'en').venues.map((v) => v.name);
const plan = (text, lang) => app.runTripPlan({ text, ...(lang ? { lang } : {}) }, NOV);
const names = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue).map((x) => x.venue.name);
const said = (p) => [...(p.warnings || []), ...(p.notes || [])].join(' \n ');
const retire = (ids) => { for (const id of ids) db.prepare("UPDATE venues SET region = 'retired-fixture' WHERE id = ?").run(id); if (app.clearVenueCaches) app.clearVenueCaches(); };
const unretire = (ids, region) => { for (const id of ids) db.prepare('UPDATE venues SET region = ? WHERE id = ?').run(region, id); if (app.clearVenueCaches) app.clearVenueCaches(); };

test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  lum = F.lumby(app, db); sum = F.summerland(app, db); nb = F.neighbours(app, db);
  if (app.clearVenueCaches) app.clearVenueCaches();
});
test.after(() => srv && srv.close());

test('1. search: her second kind (disc golf) finds her, EN and FR, and she is first among the sports places; "free disc golf" reads her free price line', async () => {
  assert.equal(model('disc golf lumby')[0], lum.name, 'the place whose owner picked disc golf comes first');
  assert.ok((await search('disc golf lumby')).includes(lum.name));
  assert.ok((await search('disque-golf lumby', true)).includes(lum.name));
  assert.ok((await search('free disc golf')).includes(lum.name));
  // Its other type's filters too: Sports & recreation in Lumby.
  assert.match(await search('disc golf lumby'), /Sports & recreation in Lumby/);
});

test('2. search: walk-on phrases are golf ("no" never takes golf out, "walk on" is not hiking)', async () => {
  for (const q of ['golf no tee time vernon', 'walk on golf vernon', 'walk-on golf vernon', 'no tee times golf lumby']) {
    const t = await search(q);
    assert.doesNotMatch(t, /no golf courses|Hiking/i, q);
    assert.ok(t.includes(q.includes('lumby') ? lum.name : nb.hillview.name), q);
  }
});

test('3. search: an owner-set-up course before an unverified one in the town; "cheap" by price; "near <town>" takes in the towns around it', async () => {
  for (const [q, first, second] of [['golf lumby', lum.name, nb.coldstream.name], ['golf course lumby', lum.name, nb.coldstream.name], ['golf summerland', sum.name, nb.sumac.name]]) {
    assert.deepEqual(model(q).filter((n) => [first, second].includes(n)), [first, second], q);
  }
  const cheap = await search('cheap golf');
  assert.match(cheap, /Lowest price first, from the price each place lists\./);
  assert.doesNotMatch(cheap, /Budget isn’t applied/);
  const m = model('cheap golf');
  const prices = m.map((n) => { const v = [lum, sum, ...Object.values(nb)].find((x) => x.name === n); const c = v && app.cardPriceFor(v.id); return c ? Number(String(c).replace(/[^0-9.]/g, '')) : Infinity; });
  const priced = prices.filter((x) => x < Infinity);
  assert.deepEqual(priced, priced.slice().sort((a, b) => a - b), `priced places lowest first: ${m.join(' | ')}`);
  assert.ok(prices.indexOf(Infinity) < 0 || prices.slice(prices.indexOf(Infinity)).every((x) => x === Infinity), 'the unpriced ones after');
  const nv = await search('golf near vernon');
  assert.ok(nv.includes(lum.name) && nv.includes(nb.coldstream.name) && nv.includes(nb.hillview.name), 'near Vernon: Lumby and Coldstream too');
  assert.ok(order(nv, [nb.hillview.name, lum.name])[0] === nb.hillview.name, 'the town asked first');
  assert.ok((await search('golf near penticton')).includes(sum.name), 'near Penticton: Summerland');
});

test('4. search: twilight, junior, semi-private, French lessons, 9 holes and par 3 read the owner\'s and our checked words', async () => {
  for (const q of ['twilight golf summerland', 'junior golf summerland', 'semi private golf', 'semi-private golf', 'semiprivate golf']) assert.ok((await search(q)).includes(sum.name), q);
  assert.ok((await search('cours de golf summerland', true)).includes(sum.name));
  assert.equal(model('9 hole golf')[0], lum.name, 'a 9-hole course first for "9 hole golf"');
  assert.equal(model('nine hole golf near lumby')[0], lum.name);
});

test('5. Build My Trip: "after work" and "around 5:30" are a time, never a word; a place closed then is left out and the plan says why', () => {
  const p = plan('9 holes after work on Tuesday July 13 2027 in Lumby, around 5:30');
  assert.ok(!names(p).includes(lum.name), 'she closes at 4 PM on Tuesdays');
  assert.doesNotMatch(JSON.stringify([p.summary, p.notes]), /“work”|'work'/);
  assert.match(said(p), /Lumby Golf Club \(test\) closes at 4 PM Tuesdays\./);
  const r = plan('driving range on Thursday July 15 2027 in Summerland after work');
  assert.doesNotMatch(JSON.stringify([r.summary, r.notes]), /“work”/);
  assert.match(String((r.understood || {}).when || ''), /5:30 PM/);
  // A course with no hours on file is never an evening round.
  const e = plan('Tuesday evening golf in Lumby July 13 2027');
  assert.ok(!((e.itinerary && e.itinerary.stops) || []).some((s) => s.venue && s.venue.name === nb.coldstream.name), 'no evening round at a course without hours');
  assert.match(said(e), /Lumby Golf Club \(test\) closes at 4 PM Tuesdays/);
});

test('5b. the reason is her own league line, EN and FR', () => {
  const info = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(lum.id).info);
  const was = JSON.stringify(info);
  info.rows.find((r) => r.label === 'Known for').text = 'Sand greens. Tuesday men’s league from 4 PM: the course is closed to the public.';
  db.prepare('UPDATE venue_visit_info SET info = ? WHERE venue_id = ?').run(JSON.stringify(info), lum.id);
  if (app.clearVenueCaches) app.clearVenueCaches();
  try {
    assert.match(said(plan('9 holes after work on Tuesday July 13 2027 in Lumby, around 5:30')), /Lumby Golf Club \(test\) closes at 4 PM Tuesdays \(men’s league\)\./);
    assert.match(said(plan('golf à Lumby le mardi 13 juillet 2027 vers 17 h 30', 'fr')), /Lumby Golf Club \(test\) ferme à 16 h le mardi \(ligue des hommes\)\./);
  } finally { db.prepare('UPDATE venue_visit_info SET info = ? WHERE venue_id = ?').run(was, lum.id); if (app.clearVenueCaches) app.clearVenueCaches(); }
});

test('6. Build My Trip: a plan that puts a course in its owner\'s league or members\' time shows the owner\'s line', () => {
  const info = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(sum.id).info);
  const was = JSON.stringify(info);
  const g = info.rows.find((r) => r.label === 'Good to know');
  g.text = `${g.text} Men’s night Wednesdays 12–4:30 PM: no public tee times.`;
  db.prepare('UPDATE venue_visit_info SET info = ? WHERE venue_id = ?').run(JSON.stringify(info), sum.id);
  retire([nb.sumac.id]);
  try {
    const p = plan('golf on Wednesday afternoon July 14 2027 in Summerland');
    assert.ok(names(p).includes(sum.name));
    assert.match(said(p), /Summerland Golf & Country Club \(test\), in the owner’s words: “Men’s night Wednesdays 12–4:30 PM: no public tee times”/);
    // Another day: no line.
    assert.doesNotMatch(said(plan('golf on Thursday afternoon July 15 2027 in Summerland')), /Men’s night/);
  } finally { unretire([nb.sumac.id], 'summerland'); db.prepare('UPDATE venue_visit_info SET info = ? WHERE venue_id = ?').run(was, sum.id); if (app.clearVenueCaches) app.clearVenueCaches(); }
});

test('7. Build My Trip: a weekend in her town plans her 9-hole round into a long free afternoon', () => {
  const town = F.lumbyTown(app);
  if (app.clearVenueCaches) app.clearVenueCaches();
  try {
    const p = plan('a weekend in Lumby July 17 to 18 2027');
    assert.ok(names(p).includes(lum.name), names(p).join(' | '));
  } finally { retire(town.map((v) => v.id)); }
});

test('8. Build My Trip: golf then happy hour in a town with none says so and names the nearest one, EN and FR', () => {
  const p = plan('round of golf then happy hour in Summerland Saturday July 17 2027');
  assert.match(said(p), /No happy hour listed in Summerland\. Nearest: Penticton Taproom Fixture \(Penticton\), about \d+ km away\./);
  assert.doesNotMatch(said(p), /No place here is listed with happy hour/);
  assert.equal(p.happyHourNearest && p.happyHourNearest.name, 'Penticton Taproom Fixture');
  assert.match(said(plan('golf puis un 5 à 7 à Summerland le samedi 17 juillet 2027', 'fr')), /Aucun 5 à 7 à Summerland sur Okanagan Roam\. Le plus proche : Penticton Taproom Fixture \(Penticton\)/);
});

test('9. Build My Trip: disc golf in Lumby plans the golf course whose owner picked disc golf, EN and FR; hiking never does', () => {
  assert.equal(names(plan('disc golf in Lumby on Saturday July 17 2027'))[0], lum.name);
  assert.ok(names(plan('disque-golf à Lumby le samedi 17 juillet 2027', 'fr')).includes(lum.name));
  assert.ok(!names(plan('hiking in Lumby on Saturday July 17 2027')).includes(lum.name));
});
