// Build My Trip (2026-11-19, after tour tests 11-18): a tour company with both Paddle and Snowshoe ticked, open all year
// (or with no season answer), was left out of "paddle tour Kelowna in July"; with only Paddle ticked it was planned. The
// planner's older snow-season rule (offSeasonSkip's winterOnly) read "Snowshoeing" in its category and dropped the whole
// company in the summer months. The rule now judges the kind the request asks for, by the season of each of the
// company's kinds (tour_info.kind_seasons, else the guess: v.tourKindSeasonsEach): a paddle request in July plans it, a
// snowshoe request in July still leaves it out.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-ps-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour PS ${++n}`, slug: `tour-ps-${n}`, region: 'kelowna', type, latitude: 49.888 + n / 3000, longitude: -119.496,
  rating: 4.6, reviews: 150, address: `${700 + n} Main St, Kelowna`, phone: '250-555-0190', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the paddle + snowshoe tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.76.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => { assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; });
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const plan = (q) => app.runTripPlan({ text: q }, NOW);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);

let world0 = false;
function world() {
  if (world0) return;
  world0 = true;
  for (const [nm, cu] of [['Lakeside Bistro PS', 'Bistro'], ['Harbour Grill PS', 'Grill'], ['Mission Cafe PS', 'Cafe']]) mk('restaurant', { name: nm, cuisine: cu, hours: JSON.stringify(WK('08:00', '22:00')) });
}
async function company(name, kinds, info = {}) {
  world();
  const v = mk('tour', { name, cuisine: 'Paddle tours', rating: 4.8, reviews: 300, address: 'Waterfront Park, 1 Water St, Kelowna', latitude: 49.8879, longitude: -119.4960,
    description: 'Guided kayak, canoe and SUP tours on Okanagan Lake in summer, and guided snowshoe tours at Big White in winter.' });
  await change(tokenFor(v.id), { tour_info: { kinds, length: '1-2h', book: 'same_day', age: 'all', ...info } });
  approveAll(v.id);
  return v;
}
const inPlan = (q, v) => namesOf(plan(q)).includes(v.name);

test('1. a Paddle + Snowshoe company with no season answer: a paddle request in July plans it, a snowshoe request in July leaves it out', async () => {
  const v = await company('Kelowna Paddle & Snowshoe Co', ['paddle', 'snowshoe']);
  assert.deepEqual(app.tourKindSeasonsEach(v.id), { paddle: 'summer', snowshoe: 'winter' });
  for (const q of ['paddle tour Kelowna in July', 'kayak tour Kelowna in August', 'guided paddle in July']) assert.ok(inPlan(q, v), `${q}: ${JSON.stringify(namesOf(plan(q)))}`);
  for (const q of ['snowshoe tour Kelowna in July', 'snowshoe tour Kelowna in August']) assert.ok(!inPlan(q, v), `${q}: ${JSON.stringify(namesOf(plan(q)))}`);
  assert.ok(inPlan('snowshoe tour Kelowna in January', v), JSON.stringify(namesOf(plan('snowshoe tour Kelowna in January'))));
});

test('2. the same company open all year ("Yes, all year"): paddle in July planned, snowshoe in July still left out', async () => {
  const v = await company('Okanagan Paddle & Snowshoe Year Round', ['paddle', 'snowshoe'], { year: 'all' });
  assert.equal(app.tourKindSeasons(v.id), null, 'nothing to say on his page');
  assert.deepEqual(app.tourKindSeasonsEach(v.id), { paddle: 'summer', snowshoe: 'winter' });
  assert.ok(inPlan('paddle tour Kelowna in July', v), JSON.stringify(namesOf(plan('paddle tour Kelowna in July'))));
  assert.ok(!inPlan('snowshoe tour Kelowna in July', v), JSON.stringify(namesOf(plan('snowshoe tour Kelowna in July'))));
  assert.ok(inPlan('snowshoe tour Kelowna in January', v), JSON.stringify(namesOf(plan('snowshoe tour Kelowna in January'))));
});

test('3. his own answer wins: snowshoe "both" keeps him in a July snowshoe request’s season check; one kind has no per-kind seasons', async () => {
  const v = await company('Kelowna Paddle & Snowshoe Both', ['paddle', 'snowshoe'], { year: 'all', kind_seasons: { paddle: 'summer', snowshoe: 'both' } });
  assert.deepEqual(app.tourKindSeasonsEach(v.id), { paddle: 'summer', snowshoe: 'both' });
  const one = await company('Kelowna Paddle Only Co', ['paddle']);
  assert.equal(app.tourKindSeasonsEach(one.id), null);
  // The planner's snow-season rule asks about the requested kind.
  const src = fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8');
  assert.match(src, /winterOnly\(v\) && \(ctx\.skiOffSeason \|\| !ctx\.activities\.has\('winter'\)\) && !ownerSeasonOpenOn\(v, ctx\) && !askedKindRunsIn\(v, ctx, month\)\) return true;/);
});
