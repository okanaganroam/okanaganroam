// Delete fix (2026-11-23; removing the live TEST campground #2171 failed with "FOREIGN KEY constraint failed": the
// delete's list of related tables was older than the setups' own tables). A listing's delete (DELETE /api/venues/:id,
// deleteVenue) clears every row that points at it, so it never fails on a listing whose owner used a setup, and touches
// nothing of any other listing.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards (git checkout okanagan.db).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
const ADMIN = 'venue-delete-children-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = ADMIN;
delete process.env.OUTDOOR_SETUP_KINDS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
app.setVenueSubmissionTransport(async () => {});

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const listed = (name) => { const a = SRC.indexOf('const VENUE_DELETE_CHILDREN'); const b = SRC.indexOf('function deleteVenue', a); return SRC.slice(a, b).includes(`'${name}'`); };

test('every table whose column REFERENCES venues(id) is cleared or unlinked by the delete', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  const missing = [];
  for (const t of tables) for (const f of db.prepare(`PRAGMA foreign_key_list(${t})`).all()) if (f.table === 'venues' && !listed(t)) missing.push(`${t}.${f.from}`);
  assert.deepEqual(missing, [], 'add these to VENUE_DELETE_CHILDREN (or VENUE_DELETE_UNLINK)');
});

let n = 0;
const mk = (name) => {
  const v = app.createVenue({ name, slug: `del-camp-${++n}`, region: 'osoyoos', type: 'outdoor', latitude: 49.03, longitude: -119.46, address: `${n} Lake Rd, Osoyoos`, description: 'Tent and RV sites on the lake.', description_fr: 'Emplacements de tente et de VR au bord du lac.' });
  return { id: v.id, slug: v.slug, token: app.createOwnerLink(v.id, {}).url.split('/owner/')[1] };
};
const post = (o, p, body) => fetch(`${base}/owner/${o.token}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Origin: base, 'X-Real-IP': `10.92.${o.id % 250}.1` }, body: JSON.stringify(body) });
const setUp = async (o) => {
  const r = await post(o, '/changes?from=setup', { changes: { indoor_info: { kinds: ['camp'], length: 'half', book: 'busy', age: 'all' }, indoor_price: 45, badges: { dog_friendly: true } }, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 });
  assert.ok([200, 201].includes(r.status), `setup save ${r.status}`);
  const p = await post(o, '/setup/progress', { step: 'indoor', status: 'live' });
  assert.ok([200, 201].includes(p.status), `progress ${p.status}`);
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_at) VALUES (?, 'pending', ?, datetime('now'))").run(o.id, JSON.stringify({ sections: [{ name: 'Sites', items: [{ name: 'Tent site', price: '45' }, { name: 'RV hookup site', price: '65' }] }] }));
};
const rowsOf = (id) => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  const out = {};
  // Tables that point at venues (FOREIGN KEY): what can block a delete. Logs without one (venue_enrichment_log, the
  // audit history, and price_overrides) are kept as they always were.
  for (const t of tables) if (db.prepare(`PRAGMA foreign_key_list(${t})`).all().some((f) => f.table === 'venues' && f.from === 'venue_id')) { const c = db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE venue_id = ?`).get(id).c; if (c) out[t] = c; }
  return out;
};

test('a campground that went through the setup (answers, progress, features, a rate sheet) deletes; another one is untouched', async () => {
  const gone = mk('Delete Me Campground'), keep = mk('Keep Me Campground');
  await setUp(gone); await setUp(keep);
  const keepBefore = rowsOf(keep.id);
  assert.ok(Object.keys(rowsOf(gone.id)).length >= 4, `set-up rows: ${JSON.stringify(rowsOf(gone.id))}`);
  const del = await fetch(`${base}/api/venues/${gone.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN}`, Connection: 'close' } });
  assert.equal(del.status, 200, `delete ${del.status} ${await del.text()}`);
  assert.deepEqual(rowsOf(gone.id), {}, 'nothing of the deleted listing is left');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM venues WHERE id = ?').get(gone.id).c, 0);
  for (const p of [`/osoyoos/outdoors/${gone.slug}`, `/fr/osoyoos/outdoors/${gone.slug}`]) assert.equal((await fetch(base + p, { headers: { Connection: 'close' } })).status, 410, p);
  assert.equal((await fetch(`${base}/owner/${gone.token}`, { headers: { Connection: 'close' } })).status, 404, 'its owner link is gone');
  // The other campground: every row as it was, its page and its link working.
  assert.deepEqual(rowsOf(keep.id), keepBefore);
  assert.equal((await fetch(`${base}/osoyoos/outdoors/${keep.slug}`, { headers: { Connection: 'close' } })).status, 200);
  assert.equal((await fetch(`${base}/owner/${keep.token}`, { headers: { Connection: 'close' } })).status, 200);
});
