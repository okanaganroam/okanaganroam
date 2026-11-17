// Build My Trip, tour kinds and owner seasons (2026-11-16).
// 1. ATV and snowmobile-tour requests are tour parts, not indoor ones (Whistler #180): with a jet boat and a wine tour in
//    the same town, "ATV tour in Vernon on July 17" plans the ATV tour under "Tours & experiences", and « Motoneige à
//    Vernon » the snowmobile tour under « Visites et expériences » (it read "Indoor & rainy day spots").
// 2. The owner's own season wins over the snow words in a tour's name: "X Heli-Skiing" open Dec 1 to Sep 30 with a yearly
//    Apr 16 to May 31 closure is planned in July and left out in May; with no owner season it is still dropped in July.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'trip-tour-types-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const frCopy = require('../trip-french-copy.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Types ${++n}`, slug: `tour-types-${n}`, region: 'vernon', type, latitude: 50.267 + n / 2000, longitude: -119.272,
  rating: 4.6, reviews: 120, address: `${4100 + n} 30 Ave, Vernon`, phone: '250-555-0188', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the trip tour-type tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.32.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const plan = (q, fr = false) => postJson(`${fr ? '/fr' : ''}/api/trip/plan`, { text: q, ...(fr ? { lang: 'fr' } : {}) }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);

const heading = (p) => String(p.summary || '');
const said = (p) => JSON.stringify([p.warnings || [], p.notes || [], p.unsupported || []]);

// Decoys in the same town: other kinds of tour, rated above the ones asked for, and an indoor place.
let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  mk('tour', { name: 'Kal Lake Jet Boats', cuisine: 'Jet boat tours', rating: 4.9, reviews: 900, description: 'Jet boat tours on Kalamalka Lake from Vernon.' });
  mk('tour', { name: 'Vernon Wine Shuttle', cuisine: 'Wine tours', rating: 4.8, reviews: 500, description: 'Guided wine tours of the North Okanagan from Vernon.' });
  mk('indoor', { name: 'Vernon Science Hall', cuisine: 'Museum', rating: 4.8, reviews: 700, description: 'A hands-on science museum in downtown Vernon, good on a rainy day.' });
  mk('tour', { name: 'Silver Star Quad Adventures', cuisine: 'ATV tours', description: 'Guided ATV tours in the hills above Vernon.' });
  mk('tour', { name: 'Monashee Sled Tours', cuisine: 'Snowmobile tours', description: 'Guided snowmobile tours in the Monashee backcountry above Vernon in winter.' });
}

test('an ATV tour request plans the ATV tour under "Tours & experiences", not a jet boat or an indoor spot (EN + FR)', async () => {
  seed();
  for (const q of ['ATV tour in Vernon on July 17 2027', 'ATV in Vernon on July 17 2027', 'An afternoon ATV ride in Vernon on July 17 2027']) {
    const p = await plan(q);
    assert.ok(names(p).includes('Silver Star Quad Adventures'), `${q}: ${JSON.stringify(names(p))}`);
    assert.ok(!names(p).includes('Kal Lake Jet Boats') && !names(p).includes('Vernon Wine Shuttle') && !names(p).includes('Vernon Science Hall'), `${q}: ${JSON.stringify(names(p))}`);
    assert.doesNotMatch(said(p), /No ATV tour matched/, q);
    assert.doesNotMatch(heading(p), /Indoor|rainy/i, `${q}: ${heading(p)}`);
  }
  assert.match(heading(await plan('ATV in Vernon on July 17 2027')), /^Tours & experiences in Vernon/);
  for (const q of ['Quad à Vernon le 17 juillet 2027', 'Quad à Vernon le samedi 17 juillet 2027']) {
    const p = await plan(q);
    assert.ok(names(p).includes('Silver Star Quad Adventures'), `${q}: ${JSON.stringify(names(p))}`);
    assert.ok(!names(p).includes('Kal Lake Jet Boats') && !names(p).includes('Vernon Science Hall'), `${q}: ${JSON.stringify(names(p))}`);
    assert.match(String(frCopy.t3FrenchSummary(heading(p))), /^Visites et expériences à Vernon/, `${q}: ${heading(p)}`);
  }
});

test('a snowmobile request plans the snowmobile tour under "Tours & experiences" / « Visites et expériences » (EN + FR)', async () => {
  seed();
  for (const q of ['Snowmobile in Vernon on January 16 2027', 'Snowmobile tour in Vernon on January 16 2027', 'Snowmobiling in Vernon on Saturday January 16 2027']) {
    const p = await plan(q);
    assert.ok(names(p).includes('Monashee Sled Tours'), `${q}: ${JSON.stringify(names(p))}`);
    assert.ok(!names(p).includes('Kal Lake Jet Boats') && !names(p).includes('Vernon Wine Shuttle') && !names(p).includes('Vernon Science Hall'), `${q}: ${JSON.stringify(names(p))}`);
    assert.match(heading(p), /^Tours & experiences in Vernon/, `${q}: ${heading(p)}`);
  }
  for (const q of ['Motoneige à Vernon le samedi 16 janvier 2027', 'Une sortie en motoneige à Vernon le 16 janvier 2027']) {
    const p = await plan(q);
    assert.ok(names(p).includes('Monashee Sled Tours'), `${q}: ${JSON.stringify(names(p))}`);
    assert.ok(!names(p).includes('Kal Lake Jet Boats') && !names(p).includes('Vernon Science Hall'), `${q}: ${JSON.stringify(names(p))}`);
    assert.doesNotMatch(heading(p), /Indoor|rainy/i, `${q}: ${heading(p)}`);
    assert.match(String(frCopy.t3FrenchSummary(heading(p))), /^Visites et expériences à Vernon/, `${q}: ${heading(p)}`);
  }
});

test('the owner\'s own season wins over "Heli-Skiing" in the name: planned in July, left out in their May closure; no owner season, still dropped in July', async () => {
  seed();
  const HELI = { cuisine: 'Heli-skiing & heli-hiking tours', description: 'Heli-skiing in the Monashees in winter, and heli-hiking tours from Vernon in summer.' };
  const own = mk('tour', { name: 'Monashee Range Heli-Skiing', ...HELI });
  mk('tour', { name: 'Kalamalka Heli-Skiing', ...HELI, rating: 4.9, reviews: 800 });
  const t = tokenFor(own.id);
  // "We only run part of the year": Dec 1 to Sep 30, closed Apr 16 to May 31 every year.
  ok(await change(t, { hours: WK('09:00', '17:00'), hours_checked: true, open_months: '12-01:09-30', tour_info: { year: 'seasonal' } }));
  ok(await change(t, { closures: [{ from: '04-16', to: '05-31', note: 'Between seasons', yearly: true }] }));
  for (const q of ['Tours in Vernon on July 17 2027', 'Heli-hiking tour in Vernon on July 17 2027', 'Tours in Vernon in July']) {
    const p = await plan(q);
    assert.ok(names(p).includes('Monashee Range Heli-Skiing'), `${q}: ${JSON.stringify(names(p))}`);
    assert.ok(!names(p).includes('Kalamalka Heli-Skiing'), `${q}: no owner season, the name rule stands: ${JSON.stringify(names(p))}`);
  }
  // May: inside their yearly closure, so it is left out (as is the one with no season); October: outside their season.
  for (const q of ['Tours in Vernon on May 10 2027', 'Tours in Vernon on October 20 2027']) {
    const p = await plan(q);
    assert.ok(!names(p).includes('Monashee Range Heli-Skiing') && !names(p).includes('Kalamalka Heli-Skiing'), `${q}: ${JSON.stringify(names(p))}`);
    assert.ok(names(p).includes('Kal Lake Jet Boats'), `${q}: the other tours are still planned: ${JSON.stringify(names(p))}`);
  }
  // Winter: both, as before.
  const w = await plan('Heli-skiing tours in Vernon on January 16 2027');
  assert.ok(names(w).includes('Monashee Range Heli-Skiing') && names(w).includes('Kalamalka Heli-Skiing'), JSON.stringify(names(w)));
});
