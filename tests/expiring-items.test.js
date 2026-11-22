// Items that end by themselves (2026-11-21): advisories and "Plan your visit" lines with `until`, and temporary hours
// that go back to the regular week, Pacific time, with no deploy and no script. Fake clocks are passed to the sweep, the
// validators, Build My Trip's per-date week and the venue page.
// Runs on a throwaway database; copy okanagan.db back afterwards (or `git checkout -q okanagan.db` in your own worktree).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const TOKEN = 'expiring-items-test-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const daily = (a, b) => JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [[a, b]]])));
const TODAY = app.todayLocal();
const day = (n) => app.addLocalDays(TODAY, n);
// Noon Pacific on a date (20:00 UTC is 12:00 PST / 13:00 PDT).
const at = (d) => new Date(`${d}T20:00:00Z`);
const meta = { reason: 'expiring items test', batch_id: 'test-expiring-items' };
let n = 0;
const mk = (o) => app.createVenue({ region: 'kelowna', type: 'pub', slug: `expiring-${++n}`, latitude: 49.88 + n / 1000, longitude: -119.49, rating: 4.5,
  hours: daily('11:00', '22:00'), address: `${n} Main St, Kelowna, BC`, phone: '250-555-0100', website: 'https://example.com', description: 'A sample pub used only by the expiring items tests.', ...o });

async function withServer(fn) {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { return await fn(base); } finally { await new Promise((r) => srv.close(r)); }
}
const post = (base, p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (base, p) => fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('until is a real date, today or later (Pacific), within 400 days', () => {
  assert.equal(app.untilDateError(TODAY), null);
  assert.equal(app.untilDateError(day(30)), null);
  assert.match(app.untilDateError(day(-1)), /already over/);
  assert.match(app.untilDateError('2026-02-30'), /real YYYY-MM-DD/);
  assert.match(app.untilDateError(day(500)), /within 400 days/);
  assert.equal(app.untilDateError(null, { allowNull: true }), null);
  // The fake clock: the same date is over the next day.
  assert.match(app.untilDateError('2026-11-24', {}, at('2026-11-25')), /already over/);
  assert.equal(app.untilDateError('2026-11-24', {}, at('2026-11-24')), null);
});

test('an advisory with until: shown through its last day, gone from every reader the next day, then removed by the sweep', async () => {
  const pub = mk({ name: 'Expiring Notice Pub' });
  await withServer(async (base) => {
    const bad = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: pub.id, action: 'add', note: 'Closed today for a private event.', french_pending: true, reason: 'test', batch_id: 'b', until: day(-1) });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /already over/);
    const ok = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: pub.id, action: 'add', note: 'Closed today for a private event.', french_pending: true, reason: 'test', batch_id: 'b', until: TODAY });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.until, TODAY);
    const one = await get(base, `/admin/temporary-items/${pub.id}`);
    assert.equal(one.body.advisory.until, TODAY);
    assert.equal(one.body.claimed, false);
    const list = await get(base, '/admin/temporary-items');
    assert.ok(list.body.advisories.some((x) => x.id === pub.id && x.until === TODAY && !x.ended));
  });
  assert.equal(app.getCollectionNotes('advisory').get(pub.id), 'Closed today for a private event.');
  assert.ok(app.getAdvisoryNotes().has(pub.id));
  // Today the sweep leaves it alone; on the next day (fake clock) it is removed and logged.
  assert.equal(app.expireTemporaryItems(at(TODAY)).advisories, 0);
  const r = app.expireTemporaryItems(at(day(1)));
  assert.equal(r.advisories, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM collection_items WHERE content_id = ? AND content_type = 'venue'").get(pub.id).n, 0);
  const log = db.prepare("SELECT * FROM venue_enrichment_log WHERE venue_id = ? AND source = 'auto_expire'").get(pub.id);
  assert.equal(log.field_name, 'collection:advisory');
  assert.match(log.source_ref, new RegExp(`ended ${TODAY}`));
  // Idempotent.
  assert.equal(app.expireTemporaryItems(at(day(1))).advisories, 0);
});

test('an advisory whose last day was yesterday is never shown, even before the sweep runs', () => {
  const pub = mk({ name: 'Stale Notice Pub' });
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', pub.id, 'add', 'Closed yesterday only.', { ...meta, until: TODAY }).ok, true);
  db.prepare("UPDATE collection_items SET until_date = ? WHERE content_id = ? AND content_type = 'venue'").run(day(-1), pub.id);
  assert.equal(app.getCollectionNotes('advisory').has(pub.id), false);
  assert.equal(app.getAdvisoryNotes().has(pub.id), false);
  const html = app.renderVenuePage(app.getVenue(pub.id), [], [], [], {});
  assert.doesNotMatch(html, /Closed yesterday only/);
});

test('set_until gives an existing advisory an end date (and null clears it); remove still works', async () => {
  const pub = mk({ name: 'Set Until Pub' });
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', pub.id, 'add', 'Summit route closed for maintenance.', meta).ok, true);
  await withServer(async (base) => {
    const missing = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: pub.id, action: 'set_until', reason: 'test', batch_id: 'b' });
    assert.equal(missing.status, 400);
    const set = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: pub.id, action: 'set_until', until: day(6), reason: 'test', batch_id: 'b' });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(db.prepare("SELECT until_date FROM collection_items WHERE content_id = ? AND content_type = 'venue'").get(pub.id).until_date, day(6));
    const clear = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: pub.id, action: 'set_until', until: null, reason: 'test', batch_id: 'b' });
    assert.equal(clear.status, 200);
    assert.equal(db.prepare("SELECT until_date FROM collection_items WHERE content_id = ? AND content_type = 'venue'").get(pub.id).until_date, null);
    const notMember = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: mk({ name: 'No Notice Pub' }).id, action: 'set_until', until: day(3), reason: 'test', batch_id: 'b' });
    assert.equal(notMember.status, 409);
    const rm = await post(base, '/admin/collection-membership', { kind: 'advisory', venue_id: pub.id, action: 'remove', reason: 'test', batch_id: 'b' });
    assert.equal(rm.status, 200);
  });
  const log = db.prepare("SELECT old_value, new_value FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'collection:advisory:until' ORDER BY id").all(pub.id);
  assert.deepEqual(log.map((x) => [x.old_value, x.new_value]), [[null, day(6)], [day(6), null]]);
});

test('Plan your visit: a line with until shows through its last day, then the sweep takes it out of the stored box', () => {
  const pub = mk({ name: 'Expiring Line Pub' });
  const box = { rows: [{ label: 'Known for', text: 'Wings' }, { label: 'Good to know', text: 'Opening week: kitchen closes at 7.', until: day(2) }], booking_url: null, source_url: 'https://example.com/', checked_at: TODAY };
  assert.equal(app.guardedVisitInfoUpdate(pub.id, null, { ...box, rows: [box.rows[0], { ...box.rows[1], until: day(-1) }] }, meta).reason, 'invalid_visit');
  assert.equal(app.guardedVisitInfoUpdate(pub.id, null, box, meta).ok, true);
  assert.equal(app.venueVisitInfo(pub.id).rows.length, 2);
  assert.equal(app.expireTemporaryItems(at(day(2))).visit_rows, 0);
  assert.equal(app.expireTemporaryItems(at(day(3))).visit_rows, 1);
  const stored = JSON.parse(app.currentVisitInfoJson(pub.id));
  assert.deepEqual(stored.rows.map((r) => r.label), ['Known for']);
  // A box whose only line ended is removed.
  const pub2 = mk({ name: 'Only Line Pub' });
  assert.equal(app.guardedVisitInfoUpdate(pub2.id, null, { ...box, rows: [box.rows[1]] }, meta).ok, true);
  assert.equal(app.expireTemporaryItems(at(day(3))).visit_rows, 1);
  assert.equal(app.currentVisitInfoJson(pub2.id), null);
});

test('temporary hours: shown until the last day, Build My Trip uses the regular week after it, then the sweep reverts', async () => {
  const pub = mk({ name: 'Opening Week Pub', hours: daily('11:00', '22:00') });
  const temp = daily('11:00', '20:00');
  await withServer(async (base) => {
    const body = { id: pub.id, expected_current_hours: daily('11:00', '22:00'), verified: { hours: temp, hours_source: 'venue_social_media', hours_checked_at: TODAY }, reason: 'opening week', batch_id: 'b', temporary: { until: day(3), note: 'Opening week' } };
    const bad = await post(base, '/admin/verify-hours', { ...body, temporary: { until: day(-1) } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'invalid_temporary');
    const same = await post(base, '/admin/verify-hours', { ...body, temporary: { until: day(3), regular_hours: temp } });
    assert.equal(same.status, 400);
    const ok = await post(base, '/admin/verify-hours', body);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.temporary.until, day(3));
    assert.equal(ok.body.temporary.regular_hours, daily('11:00', '22:00'));
    // The API: the temporary week, with its last day and the regular week.
    const api = await fetch(`${base}/api/venues/${pub.id}`).then((r) => r.json());
    const v = api.venue || api;
    assert.equal(v.hours, temp);
    assert.equal(v.hours_until, day(3));
    assert.equal(v.hours_regular, daily('11:00', '22:00'));
    const list = await get(base, '/admin/temporary-items');
    const row = list.body.hours.find((x) => x.id === pub.id);
    assert.equal(row.until, day(3));
    assert.equal(row.still_temporary, true);
  });
  const venue = app.getVenue(pub.id);
  // Build My Trip asks per date: through the last day the temporary week, after it the regular week.
  assert.equal(app.weekJsonOn(venue, day(3)), temp);
  assert.equal(app.weekJsonOn(venue, day(4)), daily('11:00', '22:00'));
  // JSON-LD: the temporary week runs through its last day, then the regular week.
  const html = app.renderVenuePage(venue, [], [], [], { now: at(TODAY) });
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } }).filter(Boolean);
  const specs = ld.flatMap((x) => (Array.isArray(x['@graph']) ? x['@graph'] : [x])).flatMap((x) => x.openingHoursSpecification || []);
  assert.ok(specs.some((s) => s.closes === '20:00' && s.validThrough === day(3)), 'temporary week ends on its last day');
  assert.ok(specs.some((s) => s.closes === '22:00' && s.validFrom === day(4)), 'regular week from the next day');
  // The sweep: nothing on the last day; the next day the regular week is back (badges re-derived, logged).
  assert.equal(app.expireTemporaryItems(at(day(3))).hours_reverted, 0);
  const r = app.expireTemporaryItems(at(day(4)));
  assert.equal(r.hours_reverted, 1);
  assert.equal(db.prepare('SELECT hours FROM venues WHERE id = ?').get(pub.id).hours, daily('11:00', '22:00'));
  assert.equal(db.prepare('SELECT temp_hours FROM venue_hours_extra WHERE venue_id = ?').get(pub.id).temp_hours, null);
  assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'hours' AND source = 'auto_expire'").get(pub.id));
  assert.equal(app.getVenue(pub.id).hours_until, undefined);
});

test('temporary hours with regular_hours given (the stored week already is the temporary one)', () => {
  const cafe = mk({ name: 'Pre-season Cafe', type: 'cafe', hours: JSON.stringify({ mon: [['08:00', '11:00']], tue: [['08:00', '11:00']], wed: [['08:00', '11:00']], thu: [['08:00', '11:00']], fri: [['08:00', '11:00']], sat: null, sun: null }) });
  const cur = app.getVenue(cafe.id).hours;
  const r = app.guardedHoursVerifyUpdate(cafe.id, cur, { hours: cur, hours_source: 'venue_social_media', hours_checked_at: TODAY }, { ...meta, temporary: { until: day(5), regular_hours: daily('07:00', '17:00') } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(app.getVenue(cafe.id).hours, cur);
  assert.equal(app.weekJsonOn(app.getVenue(cafe.id), day(6)), daily('07:00', '17:00'));
  assert.equal(app.expireTemporaryItems(at(day(6))).hours_reverted, 1);
  assert.equal(app.getVenue(cafe.id).hours, daily('07:00', '17:00'));
});

test('hours changed during the stretch (owner or research) win: the pending revert is dropped, never applied', () => {
  const pub = mk({ name: 'Changed Since Pub', hours: daily('11:00', '22:00') });
  assert.equal(app.guardedHoursVerifyUpdate(pub.id, daily('11:00', '22:00'), { hours: daily('11:00', '20:00'), hours_source: 'venue_social_media', hours_checked_at: TODAY }, { ...meta, temporary: { until: day(2) } }).ok, true);
  // Someone writes hours some other way (the owner portal, PUT /api/venues).
  db.prepare('UPDATE venues SET hours = ? WHERE id = ?').run(daily('12:00', '23:00'), pub.id);
  assert.equal(app.activeTempHours(app.getVenue(pub.id)), null);
  assert.equal(app.weekJsonOn(app.getVenue(pub.id), day(5)), daily('12:00', '23:00'));
  const r = app.expireTemporaryItems(at(day(3)));
  assert.equal(r.hours_dropped, 1);
  assert.equal(app.getVenue(pub.id).hours, daily('12:00', '23:00'));
});

test('a verified week without temporary replaces a pending stretch; claimed listings refuse temporary hours', () => {
  const pub = mk({ name: 'Replaced Stretch Pub', hours: daily('11:00', '22:00') });
  assert.equal(app.guardedHoursVerifyUpdate(pub.id, daily('11:00', '22:00'), { hours: daily('11:00', '20:00'), hours_source: 'venue_social_media', hours_checked_at: TODAY }, { ...meta, temporary: { until: day(2) } }).ok, true);
  assert.ok(app.tempHoursMap().get(pub.id));
  const r = app.guardedHoursVerifyUpdate(pub.id, daily('11:00', '20:00'), { hours: daily('10:00', '21:00'), hours_source: 'official_website', hours_checked_at: TODAY }, meta);
  assert.equal(r.ok, true);
  assert.ok(r.changedFields.includes('temp_hours'));
  assert.equal(app.tempHoursMap().get(pub.id), undefined);
  // Owner-verified ("Verified by the business"): its hours are the owner's.
  const owned = mk({ name: 'Owner Managed Pub' });
  db.prepare("INSERT INTO venue_claims (venue_id, name, role, email, phone, verify_method, status) VALUES (?, 'Owner', 'owner', 'owner@example.com', '250-555-0101', 'call', 'approved')").run(owned.id);
  const refused = app.guardedHoursVerifyUpdate(owned.id, daily('11:00', '22:00'), { hours: daily('11:00', '20:00'), hours_source: 'venue_social_media', hours_checked_at: TODAY }, { ...meta, temporary: { until: day(2) } });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'owner_verified');
});
