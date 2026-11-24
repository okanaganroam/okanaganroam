// Campgrounds only (Dayton, 2026-11-23: "Yes, campgrounds only"). The outdoor owner setup was tested with campground
// owners only, so live runs it for campgrounds alone: a campground's link opens the setup, the % checklist, the outdoor
// Help and Update my prices; a rental shop, farm or park keeps the classic edit page exactly as before (no setup, no
// checklist, no outdoor Help, no prices tile), and a campground's kinds must keep Campground.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards (git checkout okanagan.db).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'outdoor-camp-only-admin-token';
delete process.env.OUTDOOR_SETUP_KINDS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
app.setVenueSubmissionTransport(async () => {});

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { headers: { Connection: 'close' }, redirect: 'manual' });
let n = 0;
const mk = (name, description) => {
  const v = app.createVenue({ name, slug: `camp-only-${++n}`, region: 'osoyoos', type: 'outdoor', latitude: 49.03, longitude: -119.46, address: `${n} Lake Rd, Osoyoos`, description });
  return { id: v.id, token: app.createOwnerLink(v.id, {}).url.split('/owner/')[1] };
};
const post = (token, changes) => fetch(`${base}/owner/${token}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Origin: base, 'X-Real-IP': `10.91.${n}.1` }, body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) });

test('a campground runs the outdoor setup; a rental shop and a park keep the classic edit page', async () => {
  const camp = mk('Test Lakeside Campground', 'A family campground with tent and RV sites on the lake.');
  const rent = mk('Test Paddle Rentals', 'Paddleboards and kayaks to rent by the hour on the beach.');
  const park = mk('Test Ridge Trail', 'A steep hiking trail with views over the valley.');
  assert.equal(app.sportSetupType({ type: 'outdoor', id: camp.id }), true);
  assert.equal(app.sportSetupType({ type: 'outdoor', id: rent.id }), false);
  assert.equal(app.sportSetupType({ type: 'outdoor', id: park.id }), false);
  // The campground: setup, checklist, outdoor Help, Update my prices.
  const cs = await get(`/owner/${camp.token}/setup`);
  assert.equal(cs.status, 200);
  const ce = await (await get(`/owner/${camp.token}`)).text();
  assert.match(ce, /\/setup"/);
  assert.match(ce, /Update my prices/);
  assert.match(ce, /outdoor-office-hours|outdoor-checkin/);
  // The rental shop: no setup page (back to the edit page), no checklist, no outdoor Help, no prices tile.
  const rs = await get(`/owner/${rent.token}/setup`);
  assert.equal(rs.status, 302);
  const re = await (await get(`/owner/${rent.token}`)).text();
  assert.doesNotMatch(re, /\/setup"/);
  assert.doesNotMatch(re, /Update my prices/);
  assert.doesNotMatch(re, /outdoor-office-hours|outdoor-checkin|Sites from/);
  const pe = await (await get(`/owner/${park.token}`)).text();
  assert.doesNotMatch(pe, /\/setup"/);
});

test('a campground owner keeps Campground among their kinds (else they would leave the setup half-way)', async () => {
  const camp = mk('Test Pines Campground', 'Tent and RV sites under the pines.');
  const bad = await post(camp.token, { indoor_info: { kinds: ['waterrent'] } });
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(await bad.json()), /keep Campground ticked/);
  const ok = await post(camp.token, { indoor_info: { kinds: ['camp', 'waterrent'], length: 'half', book: 'busy', age: 'all' } });
  assert.ok([200, 201].includes(ok.status), `campground save: ${ok.status}`);
  assert.equal(app.sportSetupType({ type: 'outdoor', id: camp.id }), true);
});
