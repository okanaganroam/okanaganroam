'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { distanceMeters, decide, createArrivalPoints, LIMITS } = require('../arrival-points');

const PIN = { lat: 49.8863, lng: -119.4966 };
const near = (m) => ({ lat: PIN.lat + m / 111320, lng: PIN.lng });

test('distance in metres is about right', () => {
  assert.ok(Math.abs(distanceMeters(PIN, near(100)) - 100) < 1);
  assert.equal(distanceMeters(PIN, PIN), 0);
});

test('only a signed-in owner with a good reading near the listing goes live; everything else is checked first', () => {
  const good = { point: near(30), device: near(30), accuracy: 12, pin: PIN, signedIn: true };
  const ok = decide(good);
  assert.equal(ok.status, 'approved'); assert.deepEqual(ok.reasons, []); assert.equal(ok.distance, 30);
  const reasonFor = (x) => { const d = decide({ ...good, ...x }); assert.equal(d.status, 'pending'); return d.reasons.join(' '); };
  assert.match(reasonFor({ signedIn: false }), /edit link/);
  assert.match(reasonFor({ device: null, accuracy: NaN }), /no location/);
  assert.match(reasonFor({ accuracy: 70 }), /Rough phone reading \(about 70 m\)/);
  assert.match(reasonFor({ point: near(90), device: near(10) }), /Pin moved 80 m/);
  assert.match(reasonFor({ point: near(400), device: near(400) }), /400 m from the listing/);
  assert.match(reasonFor({ pin: null }), /no map pin/);
});

const memDb = () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, latitude REAL, longitude REAL);
    CREATE TABLE venue_arrival_points (id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER, file TEXT, preview_key TEXT UNIQUE, lat REAL, lng REAL, device_lat REAL, device_lng REAL, accuracy_m REAL, distance_m INTEGER, status TEXT DEFAULT 'pending', review_reasons TEXT, submitted_by TEXT, submitted_at TEXT DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT, reviewed_by TEXT, rejection_reason TEXT);`);
  d.prepare('INSERT INTO venues VALUES (1, ?, ?, ?)').run('Joe <b>Cafe', PIN.lat, PIN.lng);
  return d;
};
function kit(db) {
  const removed = []; let n = 0; const out = {};
  const ap = createArrivalPoints({
    db, respond: (res, status, body) => { out.status = status; out.body = body; }, sameOrigin: () => true, clientIp: () => 'ip', rateLimited: () => false,
    readJson: async (req) => req.body, venueForToken: (t) => (t === 'good' ? { venue: db.prepare('SELECT * FROM venues').get() } : null),
    strip: (b) => Buffer.concat([b, Buffer.from('stripped')]), dimensions: (b) => (b.length ? { width: 1200, height: 900 } : null), write: (b) => { out.written = b; n += 1; return `file${n}.jpg`; }, remove: (f) => removed.push(f),
  });
  return { ap, out, removed };
}
const jpg = `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}`;
const body = (x = {}) => ({ image: jpg, lat: near(20).lat, lng: near(20).lng, device_lat: near(20).lat, device_lng: near(20).lng, accuracy: 10, rights: true, ...x });
const signedIn = (db) => () => ({ venue: db.prepare('SELECT * FROM venues').get(), account: { email: 'o@example.com' } });

test('a good spot goes live, replaces the old one, keeps the photo clean, and never touches the map pin', async () => {
  const db = memDb(); const { ap, out, removed } = kit(db);
  await ap.submit({ body: body() }, {}, signedIn(db));
  assert.equal(out.status, 201); assert.equal(out.body.live, true);
  assert.match(out.written.toString(), /stripped$/);
  const first = ap.latest(1, 'approved');
  assert.equal(first.reviewed_by, 'automatic'); assert.equal(first.distance_m, 20);
  await ap.submit({ body: body() }, {}, signedIn(db));
  assert.deepEqual(removed, ['file1.jpg']);
  assert.equal(db.prepare("SELECT status FROM venue_arrival_points WHERE id = ?").get(first.id).status, 'replaced');
  assert.equal(db.prepare('SELECT latitude FROM venues').get().latitude, PIN.lat);
});

test('bad requests are refused in plain words, in French too, and nothing is saved', async () => {
  const db = memDb(); const { ap, out } = kit(db);
  const refused = async (b, re, lang) => { await ap.submit({ body: b }, {}, signedIn(db), lang); assert.ok(out.status >= 400); assert.match(out.body.error, re); };
  await refused(body({ rights: false }), /confirm/);
  await refused(body({ lat: 'x' }), /spot on the map/);
  await refused(body({ image: 'nope' }), /could not be read/);
  await refused(body({ extra: 1 }), /went wrong/);
  await refused(body(near(LIMITS.too_far_m + 500)), /stand outside/);
  await refused(body(near(LIMITS.too_far_m + 500)), /Placez-vous/, 'fr');
  await ap.submit({ body: body() }, {}, 'expired');
  assert.equal(out.status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_arrival_points').get().n, 0);
});

test('review: a waiting spot can be approved or rejected once, and a new one replaces the one waiting', async () => {
  const db = memDb(); const { ap, out, removed } = kit(db);
  await ap.submit({ body: body() }, {}, 'good');
  assert.equal(out.body.live, false);
  await ap.submit({ body: body() }, {}, 'good');
  assert.deepEqual(removed, ['file1.jpg']);
  const list = ap.pending();
  assert.equal(list.length, 1); assert.equal(list[0].venue_name, 'Joe <b>Cafe');
  const esc = (s) => String(s).replace(/</g, '&lt;');
  assert.match(ap.cardHtml(list[0], esc, ''), /Joe &lt;b>Cafe/);
  assert.equal(ap.previewFile(list[0].preview_key), 'file2.jpg');
  assert.equal(ap.action(list[0].id, 'approve', {}, 'Dayton').status, 200);
  assert.equal(ap.latest(1, 'approved').reviewed_by, 'Dayton');
  assert.equal(ap.action(list[0].id, 'reject', {}, 'Dayton').status, 409);
  await ap.submit({ body: body() }, {}, 'good');
  const next = ap.pending()[0];
  assert.equal(ap.action(next.id, 'reject', { reason: 'wrong door' }, 'Dayton').status, 200);
  assert.ok(removed.includes('file3.jpg'));
  assert.equal(ap.previewFile(next.preview_key), null);
  assert.equal(ap.latest(1, 'approved').id, list[0].id);
});

test('the portal section explains itself and shows what is live or waiting', async () => {
  const db = memDb(); const { ap } = kit(db); const L = (en) => en; const esc = (s) => String(s).replace(/"/g, '&quot;');
  const v = db.prepare('SELECT * FROM venues').get();
  const empty = ap.sectionHtml(v, L, esc, 'Okanagan Roam');
  assert.match(empty, /Help people find your door/); assert.match(empty, /L\.Icon\.Default\.imagePath=base\+'images\/'/); assert.match(empty, /<strong>Here’s why:<\/strong>/); assert.match(empty, /<strong>Example:<\/strong>/); assert.ok(empty.indexOf('Example:') < empty.indexOf('id="arTake"')); assert.match(empty, /referrerPolicy:'origin'/); assert.match(empty, /capture="environment"/); assert.match(empty, /directions right to the spot where you’re standing/); assert.match(empty, /never track you/); assert.match(empty, /Okanagan Roam may show it/);
  assert.doesNotMatch(empty, /owner-photos\/arrival/);
  await ap.submit({ body: body() }, {}, 'good');
  assert.match(ap.sectionHtml(v, L, esc, 'Okanagan Roam'), /Waiting for us to check it/);
});

test('Roam Now gets only live spots, with a photo address, and a new spot changes the version', async () => {
  const db = memDb(); const { ap } = kit(db);
  assert.equal(ap.forMap().size, 0);
  await ap.submit({ body: body() }, {}, 'good');
  assert.equal(ap.forMap().size, 0, 'waiting spots stay off the map');
  const before = ap.version();
  await ap.submit({ body: body() }, {}, signedIn(db));
  const spot = ap.forMap().get(1);
  assert.equal(spot.length, 3); assert.match(spot[2], /^\/images\/arrival\/file\d+\.jpg$/);
  assert.notEqual(ap.version(), before);
  assert.equal(ap.isLive(spot[2].split('/').pop()), true);
  assert.equal(ap.isLive('nope.jpg'), false);
});
