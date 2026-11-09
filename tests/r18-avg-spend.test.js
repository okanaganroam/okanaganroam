// Average spend per person (2026-11-08): storage, guarded update, admin endpoints, and the flagged public read.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r18-avg-spend-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');

let n = 0;
const mk = (o) => app.createVenue({ slug: `avg-spend-fixture-${++n}`, region: 'kelowna', type: 'restaurant', latitude: 49.885 + n / 1000, longitude: -119.49, rating: 4.4,
  description: 'A fixture restaurant used only by the average spend tests.', ...o });
const meta = { reason: 'avg spend fixture', batch_id: 'test-avg-spend' };
const today = app.todayLocal();
const R = (amount = 25, extra = {}) => ({ amount, source: 'research', source_url: 'https://example.com/menu', basis: 'Median main $20 + $4.50 drink', checked_at: today, ...extra });

test('validate: whole dollars in range, source required, research needs a source_url, strict keys, real date', () => {
  assert.equal(app.validateAvgSpend(R(25)).ok, true);
  for (const amount of [0, 4, 301, 25.5, '25', null]) assert.equal(app.validateAvgSpend(R(amount)).ok, false, String(amount));
  assert.equal(app.validateAvgSpend(R(25, { source: 'guess' })).ok, false);
  assert.equal(app.validateAvgSpend(R(25, { source_url: null })).ok, false, 'research needs a link');
  assert.equal(app.validateAvgSpend({ amount: 25, source: 'owner', checked_at: today }).ok, true, 'owner needs no link');
  assert.equal(app.validateAvgSpend(R(25, { extra: 1 })).ok, false);
  assert.equal(app.validateAvgSpend(R(25, { checked_at: '2026-13-40' })).ok, false);
  assert.equal(app.validateAvgSpend(R(25, { basis: '<b>x</b>' })).ok, false);
  assert.equal(app.validateAvgSpend(R(25, { source_url: 'javascript:alert(1)' })).ok, false);
});

test('guardedAvgSpendUpdate: set, no-op, compare-and-set, clear, log row, meta required', () => {
  const v = mk({ name: 'Avg Spend Grill' });
  assert.equal(app.guardedAvgSpendUpdate(v.id, null, R(25), {}).reason, 'invalid_meta');
  assert.equal(app.guardedAvgSpendUpdate(v.id, null, R(2), meta).reason, 'invalid_avg_spend');
  assert.equal(app.guardedAvgSpendUpdate(999999, null, R(25), meta).reason, 'venue_not_found');
  const a = app.guardedAvgSpendUpdate(v.id, null, R(25), meta);
  assert.deepEqual({ ok: a.ok, changed: a.changed }, { ok: true, changed: true });
  assert.equal(app.venueAvgSpend(v.id).amount, 25);
  assert.equal(db.prepare('SELECT amount, source FROM venue_avg_spend WHERE venue_id = ?').get(v.id).amount, 25);
  const log = db.prepare("SELECT old_value, new_value, batch_id FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'avg_spend'").all(v.id);
  assert.equal(log.length, 1);
  assert.equal(log[0].old_value, null);
  assert.equal(log[0].batch_id, 'test-avg-spend');
  assert.equal(app.guardedAvgSpendUpdate(v.id, null, R(30), meta).reason, 'mismatch', 'stale expected value');
  const same = app.guardedAvgSpendUpdate(v.id, a.info, R(25), meta);
  assert.deepEqual({ ok: same.ok, changed: same.changed }, { ok: true, changed: false });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'avg_spend'").get(v.id).c, 1, 'no-op logs nothing');
  const b = app.guardedAvgSpendUpdate(v.id, a.info, R(30), meta);
  assert.equal(b.changed, true);
  assert.equal(app.venueAvgSpend(v.id).amount, 30);
  const c = app.guardedAvgSpendUpdate(v.id, b.info, null, meta);
  assert.equal(c.changed, true);
  assert.equal(app.venueAvgSpend(v.id), null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM venue_avg_spend WHERE venue_id = ?').get(v.id).c, 0);
});

test('owner protection: owner value never replaced by research; claimed venues refuse research; owner can write', () => {
  const v = mk({ name: 'Owner Number Bistro' });
  const own = app.guardedAvgSpendUpdate(v.id, null, { amount: 40, source: 'owner', checked_at: today }, meta);
  assert.equal(own.ok, true);
  const r1 = app.guardedAvgSpendUpdate(v.id, own.info, R(25), meta);
  assert.equal(r1.reason, 'owner_value_protected');
  assert.equal(app.guardedAvgSpendUpdate(v.id, own.info, null, meta).reason, 'owner_value_protected', 'research cannot clear it either');
  assert.equal(app.venueAvgSpend(v.id).amount, 40);
  const own2 = app.guardedAvgSpendUpdate(v.id, own.info, { amount: 45, source: 'owner', checked_at: today }, meta);
  assert.equal(own2.changed, true, 'the owner can change their own number');

  const claimed = mk({ name: 'Claimed Cafe Grill' });
  db.prepare("INSERT INTO venue_claims (venue_id, name, role, email, phone, verify_method, status) VALUES (?, 'T', 'owner', 't@example.com', '250', 'call', 'approved')").run(claimed.id);
  assert.equal(app.guardedAvgSpendUpdate(claimed.id, null, R(25), meta).reason, 'owner_verified_protected');
  assert.equal(app.venueAvgSpend(claimed.id), null);
  assert.equal(app.guardedAvgSpendUpdate(claimed.id, null, { amount: 35, source: 'owner', checked_at: today }, meta).ok, true);
});

test('deleting a venue removes its average spend row', () => {
  const v = mk({ name: 'Delete Me Diner' });
  assert.equal(app.guardedAvgSpendUpdate(v.id, null, R(25), meta).ok, true);
  app.deleteVenue(v.id);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM venue_avg_spend WHERE venue_id = ?').get(v.id).c, 0);
});

test('HTTP: bearer token, strict keys, GET read shape, 409s; public read stays hidden until AVG_SPEND_PUBLIC=1', async () => {
  const v = mk({ name: 'Avg Spend Route Grill' });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const tok = process.env.ENRICHMENT_ADMIN_TOKEN;
  const post = async (body, token = tok) => {
    const res = await fetch(`${base}/admin/set-avg-spend`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const get = async (p, token = tok) => {
    const res = await fetch(`${base}${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  };
  try {
    const body = { id: v.id, expected_current: null, avg_spend: R(25), reason: 'menu research', batch_id: 'avg-http' };
    assert.equal((await post(body, 'wrong')).status, 401);
    assert.equal((await post(body, null)).status, 401);
    assert.equal((await get(`/admin/avg-spend/${v.id}`, 'wrong')).status, 401);
    assert.equal((await post({ ...body, extra: 1 })).status, 400);
    const { expected_current: _e, ...noExpected } = body;
    assert.equal((await post(noExpected)).status, 400);
    const { avg_spend: _a, ...noSpend } = body;
    assert.equal((await post(noSpend)).status, 400);
    assert.equal((await post({ ...body, id: 'x' })).status, 400);
    assert.equal((await post({ ...body, reason: '' })).body.error, 'invalid_meta');
    assert.equal((await post({ ...body, avg_spend: R(3) })).body.error, 'invalid_avg_spend');
    assert.equal((await post({ ...body, id: 987654 })).status, 404);

    const before = await get(`/admin/avg-spend/${v.id}`);
    assert.equal(before.status, 200);
    assert.equal(before.cache, 'no-store');
    assert.deepEqual({ id: before.body.id, claimed: before.body.claimed, expected_current: before.body.expected_current, avg_spend: before.body.avg_spend }, { id: v.id, claimed: false, expected_current: null, avg_spend: null });

    const ok = await post(body);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.changed, true);
    assert.equal(ok.body.avg_spend.amount, 25);
    assert.equal((await post(body)).status, 409, 'stale expected_current');
    const after = await get(`/admin/avg-spend/${v.id}`);
    assert.equal(after.body.expected_current, ok.body.expected_current);

    // Public read: hidden while the flag is off, present as a whole-dollar CAD amount once it is on.
    const hidden = await get(`/api/venues/${v.id}`, null);
    assert.equal(hidden.status, 200);
    assert.equal('avg_spend' in hidden.body, false, 'not exposed by default');
    process.env.AVG_SPEND_PUBLIC = '1';
    try {
      const shown = await get(`/api/venues/${v.id}`, null);
      assert.deepEqual(shown.body.avg_spend, { amount: 25, currency: 'CAD', source: 'research', checked_at: today });
      assert.equal('source_url' in shown.body.avg_spend, false);
      assert.equal('basis' in shown.body.avg_spend, false, 'research detail stays private');
      const bare = mk({ name: 'No Spend Cafe Grill' });
      assert.equal((await get(`/api/venues/${bare.id}`, null)).body.avg_spend, null);
    } finally { delete process.env.AVG_SPEND_PUBLIC; }

    const cleared = await post({ ...body, expected_current: ok.body.expected_current, avg_spend: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.avg_spend, null);
  } finally { await new Promise((resolve) => srv.close(resolve)); }
});

test('only two code paths read average spend: the admin read and the flagged API read', async () => {
  const v = mk({ name: 'Quiet Spend Grill' });
  assert.equal(app.guardedAvgSpendUpdate(v.id, null, R(27), meta).ok, true);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const uses = src.split('\n').filter((l) => /venueAvgSpend\(/.test(l) && !/^\s*(\/\/|function )/.test(l)).length;
  assert.equal(uses, 2, 'only the admin read and the flagged API read call venueAvgSpend');
});
