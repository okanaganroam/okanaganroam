// Owner portal "Share a video" (2026-11-05): videos go browser -> Cloudflare R2 on a presigned URL; the server keeps only
// the paperwork row. Feature is off unless the four R2_* variables are set. Nothing here calls R2: only start validation,
// the page, and the off switch are exercised. Runs on a throwaway database; run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-video-admin-token';
delete process.env.R2_ACCOUNT_ID;
const app = require('../server.js');
const db = require('../db.js');

let ip = 1;
const mkServer = async () => {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.77.0.${ip++ % 250}` }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const get = (p) => fetch(`${base}${p}`, { redirect: 'manual' }).then((r) => r.text());
  return { srv, post, get };
};
const GOOD = { name: 'clip.mov', size: 20 * 1048576, type: 'video/quicktime', seconds: 30, credit: 'Video Fixture Cafe @videofixture', rights: true, note: 'New fall dish' };

test('Share a video is off, and says so, until R2 is configured', async () => {
  const v = app.createVenue({ name: 'Video Fixture Off', slug: 'video-fixture-off', region: 'kelowna', type: 'cafe', latitude: 49.88, longitude: -119.46, rating: 4.2, description: 'Fixture cafe for the video tests.' });
  const { srv, post, get } = await mkServer();
  try {
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    assert.doesNotMatch(await get(`/owner/${token}`), /id="ovForm"/);
    const r = await post(`/owner/${token}/video/start`, GOOD);
    assert.equal(r.status, 404);
    assert.match(r.body.error, /info@okanaganroam\.com/);
  } finally { srv.close(); }
});

test('Share a video: page, validation and permission slip once R2 is configured', async () => {
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32);
  process.env.R2_ACCESS_KEY_ID = 'AKIATESTTESTTEST';
  process.env.R2_SECRET_ACCESS_KEY = 'secretsecretsecretsecretsecret';
  process.env.R2_BUCKET = 'okr-test-videos';
  const v = app.createVenue({ name: 'Video Fixture On', slug: 'video-fixture-on', region: 'kelowna', type: 'cafe', latitude: 49.89, longitude: -119.46, rating: 4.2, description: 'Fixture cafe for the video tests.' });
  const { srv, post, get } = await mkServer();
  try {
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const pg = await get(`/owner/${token}`);
    assert.match(pg, /id="ovForm"/);
    assert.match(pg, /Share a video/);
    assert.match(await get(`/fr/owner/${token}`), /Partager une vidéo/);
    const start = `/owner/${token}/video/start`;
    assert.match((await post(start, { ...GOOD, rights: false })).body.errors.rights, /tick the box/);
    assert.match((await post(start, { ...GOOD, credit: '' })).body.errors.credit, /business name/);
    assert.match((await post(start, { ...GOOD, size: 200 * 1048576 })).body.errors.video, /150 MB/);
    assert.match((await post(start, { ...GOOD, seconds: 300 })).body.errors.video, /2 minutes/);
    assert.match((await post(start, { ...GOOD, name: 'x.exe', type: 'application/octet-stream' })).body.errors.video, /MP4 or MOV/);
    assert.equal((await post(start, { ...GOOD, surprise: 1 })).status, 400, 'unknown fields refused');
    const ok = await post(start, GOOD);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.match(ok.body.upload, /^https:\/\/a{32}\.r2\.cloudflarestorage\.com\/okr-test-videos\/videos\/\d+\/[a-f0-9]{24}\.mov\?.*X-Amz-Signature=[a-f0-9]{64}$/);
    const row = db.prepare('SELECT * FROM owner_videos WHERE id = ?').get(ok.body.id);
    assert.equal(row.status, 'uploading');
    assert.equal(row.venue_id, v.id);
    assert.equal(row.credit, GOOD.credit);
    assert.equal((await post(`/owner/${token}/video/done`, { id: 999999 })).status, 404, 'unknown upload');
    assert.equal((await post(`/owner/${token}/video/start`, { ...GOOD, company_website: 'spam.example' })).status, 201, 'honeypot looks like success');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM owner_videos').get().n, 1, 'honeypot stored nothing');
  } finally { srv.close(); }
});
