// Blue Heron Restaurant (Nov 17 2026): an owner with no hours on file could not save her hours from the easy setup.
// The setup sends { hours, hours_checked: true }, and the server refused the whole save with "We don't have your hours
// yet" before it saw the new hours in the same save. New hours win; the message stays for a bare "These hours are right".
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'first-hours-admin';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekObj = (a, b) => Object.fromEntries(DAYS.map((d) => [d, [[a, b]]]));
let n = 0, ipN = 0, srv, base;
const mk = (type) => app.createVenue({ name: `First Hours ${type} ${++n}`, slug: `first-hours-${type}-${n}`, region: 'penticton', type,
  latitude: 49.49 + n / 1000, longitude: -119.59, address: `${n} Comox St, Penticton`, description: 'A fixture used only by the first-hours setup test.' });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.81.0.${++ipN}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });

for (const type of ['restaurant', 'cafe', 'pub']) {
  test(`${type} with no hours on file saves its first hours from the setup`, async () => {
    const v = mk(type);
    assert.equal(app.getVenue(v.id).hours, null);
    const r = await change(tokenFor(v.id), { hours: weekObj('11:00', '21:00'), hours_checked: true });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    assert.ok(!r.body.errors, JSON.stringify(r.body));
    assert.ok((r.body.fields || []).includes('hours'), JSON.stringify(r.body));
  });
}

test('"These hours are right" alone, with no hours on file, still says to add them first', async () => {
  const v = mk('restaurant');
  const r = await change(tokenFor(v.id), { hours_checked: true }, false);
  assert.equal(r.status, 400);
  assert.match(r.body.errors.hours_checked, /We don’t have your hours yet/);
});
