// IndexNow (2026-10-20, IndexNow): the key file, the sitemap-equal URL list (English, no noindex / thin pages), the
// 60 s batching queue, the admin write hooks and POST /api/admin/indexnow/submit-sitemap. fetch is stubbed for the
// whole file, so nothing here ever reaches api.indexnow.org. Runs on a throwaway database (like server.test.js);
// run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'indexnow-test-admin-token';
delete process.env.INDEXNOW_KEY;
delete process.env.INDEXNOW_DISABLED;
const AUTH = { Authorization: 'Bearer indexnow-test-admin-token' };

// Every outgoing fetch lands here.
const fetchCalls = [];
let fetchStatus = 202;
globalThis.fetch = async (url, init) => {
  fetchCalls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
  return { status: fetchStatus, text: async () => '' };
};

const app = require('../server.js');
const db = require('../db.js');

const KEY = app.INDEXNOW_KEY;
const insertVenue = db.prepare(`
  INSERT INTO venues (name, region, type, description, address, latitude, longitude, slug, hours)
  VALUES (@name, @region, @type, @description, @address, 49.88, -119.49, @slug, @hours)
`);
const WEEK = JSON.stringify({ mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
const venueId = (o) => Number(insertVenue.run({ type: 'restaurant', region: 'kelowna', description: 'A short fixture.', address: '1 Test St', hours: null, ...o }).lastInsertRowid);
const richId = venueId({ name: 'IndexNow Rich Bistro', slug: 'indexnow-rich-bistro', hours: WEEK });
const thinId = venueId({ name: 'IndexNow Thin Cafe', type: 'cafe', slug: 'indexnow-thin-cafe' });
const slugId = venueId({ name: 'IndexNow Slug Diner', slug: 'indexnow-slug-diner', hours: WEEK });
const RICH_URL = 'https://okanaganroam.com/kelowna/restaurants/indexnow-rich-bistro';
const THIN_URL = 'https://okanaganroam.com/kelowna/cafes/indexnow-thin-cafe';

const server = http.createServer(app.server.listeners('request')[0]);
let port;
test.before(() => new Promise((resolve) => server.listen(0, () => { port = server.address().port; resolve(); })));
test.after(() => new Promise((resolve) => server.close(resolve)));

function request(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const PROD = { Host: 'okanaganroam.com' };
const LOCAL = { Host: 'localhost:3001' };
const withEnv = async (env, fn) => {
  const saved = process.env.NODE_ENV;
  if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
  try { return await fn(); } finally { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; }
};
const drain = async () => { await app.indexNowQueue.flush(); fetchCalls.length = 0; };

test('IndexNow: the key is 32 hex characters and /<key>.txt serves it as text/plain; other .txt guesses do not', async () => {
  assert.match(KEY, /^[0-9a-f]{32}$/);
  const r = await request('GET', `/${KEY}.txt`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/plain/);
  assert.equal(r.text, KEY);
  for (const guess of ['/0123456789abcdef0123456789abcdef.txt', `/${KEY.slice(0, 31)}0.txt`, '/key.txt', '/indexnow.txt']) {
    const g = await request('GET', guess);
    assert.notEqual(g.status, 200, `${guess} is not served`);
    assert.ok(!g.text.includes(KEY), `${guess} does not leak the key`);
  }
});

test('IndexNow: robots.txt does not block the key file', async () => {
  const r = await request('GET', '/robots.txt');
  assert.equal(r.status, 200);
  const disallows = r.text.split('\n').filter((l) => /^Disallow:/i.test(l)).map((l) => l.replace(/^Disallow:\s*/i, '').trim()).filter(Boolean);
  for (const d of disallows) assert.ok(!`/${KEY}.txt`.startsWith(d), `Disallow: ${d} would block the key file`);
});

test('IndexNow: the URL list equals the English sitemap and leaves out /fr and thin (noindex) pages', async () => {
  const urls = app.listSitemapUrls();
  const sm = await request('GET', '/sitemap.xml');
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !/^https:\/\/okanaganroam\.com\/fr(\/|$)/.test(u));
  assert.deepEqual([...urls].sort(), [...new Set(locs)].sort());
  assert.ok(urls.includes(RICH_URL), 'an indexable place page is listed');
  assert.ok(!urls.includes(THIN_URL), 'a thin (noindex) place page is not');
  assert.ok(urls.every((u) => u.startsWith('https://okanaganroam.com/') && !/\/fr(\/|$)/.test(u.slice(25))), 'English only');
  const page = await request('GET', '/kelowna/cafes/indexnow-thin-cafe');
  assert.match(page.text, /<meta name="robots" content="noindex/, 'the thin page really is noindex');
  assert.deepEqual(app.indexNowCleanUrls(['https://okanaganroam.com/fr/kelowna', 'https://example.com/x', 'https://okanaganroam.com/a?b=1', RICH_URL, RICH_URL]), [RICH_URL]);
  assert.equal(app.indexNowVenueUrl(db.prepare('SELECT * FROM venues WHERE id = ?').get(thinId)), null);
});

test('IndexNow: no ping under NODE_ENV=test, with INDEXNOW_DISABLED=1, or from a non-production host', async () => {
  await drain();
  await withEnv('test', async () => {
    assert.equal(app.indexNowEnabled(), false);
    const r = await request('PUT', `/api/venues/${richId}`, { body: { phone: '250-555-0101' }, headers: { ...AUTH, ...PROD } });
    assert.equal(r.status, 200);
  });
  assert.deepEqual(app.indexNowQueue.pending(), []);
  process.env.INDEXNOW_DISABLED = '1';
  await withEnv(undefined, async () => {
    await request('PUT', `/api/venues/${richId}`, { body: { phone: '250-555-0102' }, headers: { ...AUTH, ...PROD } });
  });
  delete process.env.INDEXNOW_DISABLED;
  assert.deepEqual(app.indexNowQueue.pending(), []);
  await withEnv(undefined, async () => {
    await request('PUT', `/api/venues/${richId}`, { body: { phone: '250-555-0103' }, headers: { ...AUTH, ...LOCAL } });
  });
  assert.deepEqual(app.indexNowQueue.pending(), []);
  await app.indexNowQueue.flush();
  assert.equal(fetchCalls.length, 0);
  assert.equal(app.indexNowIsProductionRequest({ headers: { host: 'okanaganroam.com' } }), true);
  assert.equal(app.indexNowIsProductionRequest({ headers: { host: 'okanaganroam-production.up.railway.app' } }), false);
});

test('IndexNow: a venue update on the production host queues its canonical URL and one POST sends it', async () => {
  await drain();
  await withEnv(undefined, async () => {
    const r = await request('PUT', `/api/venues/${richId}`, { body: { phone: '250-555-0104' }, headers: { ...AUTH, ...PROD } });
    assert.equal(r.status, 200);
    await request('PUT', `/api/venues/${thinId}`, { body: { phone: '250-555-0105' }, headers: { ...AUTH, ...PROD } });
  });
  assert.deepEqual(app.indexNowQueue.pending(), [RICH_URL], 'the thin page is not queued');
  await app.indexNowQueue.flush();
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.indexnow.org/indexnow');
  assert.deepEqual(fetchCalls[0].body, { host: 'okanaganroam.com', key: KEY, keyLocation: `https://okanaganroam.com/${KEY}.txt`, urlList: [RICH_URL] });
  fetchCalls.length = 0;
});

test('IndexNow: a slug change queues the old and the new address; a dry run queues nothing', async () => {
  await drain();
  await withEnv(undefined, async () => {
    const dry = await request('POST', `/api/admin/venues/${slugId}/slug`, { body: { slug: 'indexnow-new-diner', dry_run: true }, headers: { ...AUTH, ...PROD } });
    assert.equal(dry.status, 200);
    assert.deepEqual(app.indexNowQueue.pending(), []);
    const r = await request('POST', `/api/admin/venues/${slugId}/slug`, { body: { slug: 'indexnow-new-diner' }, headers: { ...AUTH, ...PROD } });
    assert.equal(r.status, 200, r.text);
  });
  assert.deepEqual(app.indexNowQueue.pending().sort(), [
    'https://okanaganroam.com/kelowna/restaurants/indexnow-new-diner',
    'https://okanaganroam.com/kelowna/restaurants/indexnow-slug-diner',
  ]);
  await drain();
});

test('IndexNow: creating an event queues its page', async () => {
  await drain();
  const day = app.addLocalDays(app.todayLocal(), 5);
  await withEnv(undefined, async () => {
    const r = await request('POST', '/api/events', {
      body: { name: 'IndexNow Fixture Concert', region: 'kelowna', venue_name_text: 'Fixture Hall, Kelowna', description: 'A fixture.', source_type: 'tourism_org', source_name: 'Fixture',
        source_url: 'https://example.com/indexnow-fixture', categories: ['live-music'], occurrences: [{ start_date: day, start_time: '19:00', end_time: '21:00' }],
        reason: 'indexnow test', batch_id: 'test-indexnow' },
      headers: { ...AUTH, ...PROD },
    });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual(app.indexNowQueue.pending(), [`https://okanaganroam.com/kelowna/events/${r.json.event.slug}`]);
  });
  await drain();
});

test('IndexNow: the queue batches changes made within the window into one submit', async () => {
  const submits = [];
  const q = app.createIndexNowQueue({ submit: async (urls) => { submits.push(urls); return { ok: true, status: 202 }; }, delayMs: 40, log: () => {} });
  q.add(['https://okanaganroam.com/a']);
  q.add(['https://okanaganroam.com/b', 'https://okanaganroam.com/a']);
  assert.equal(submits.length, 0, 'nothing is sent straight away');
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(submits, [['https://okanaganroam.com/a', 'https://okanaganroam.com/b']]);
  q.add(['https://okanaganroam.com/c']);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(submits[1], ['https://okanaganroam.com/c']);
  // A failing submit never throws out of the queue.
  const bad = app.createIndexNowQueue({ submit: async () => { throw new Error('network down'); }, delayMs: 10, log: () => {} });
  bad.add(['https://okanaganroam.com/x']);
  assert.equal(await bad.flush(), null);
});

test('IndexNow: indexNowSubmit sends at most 10,000 URLs per POST and never throws', async () => {
  const calls = [];
  const many = Array.from({ length: 10001 }, (_, i) => `https://okanaganroam.com/p${i}`);
  const r = await app.indexNowSubmit(many, { fetchImpl: async (url, init) => { calls.push(JSON.parse(init.body).urlList.length); return { status: 200, text: async () => '' }; } });
  assert.deepEqual(calls, [10000, 1]);
  assert.equal(r.ok, true);
  assert.equal(r.submitted, 10001);
  const failed = await app.indexNowSubmit(['https://okanaganroam.com/'], { fetchImpl: async () => { throw new Error('timeout'); } });
  assert.equal(failed.ok, false);
  assert.match(failed.batches[0].error, /timeout/);
});

test('IndexNow: POST /api/admin/indexnow/submit-sitemap needs the admin token, supports dry_run, and submits on production', async () => {
  await drain();
  const P = '/api/admin/indexnow/submit-sitemap';
  assert.equal((await request('POST', P, { body: { dry_run: true } })).status, 401);
  assert.equal((await request('POST', P, { body: { dry_run: true }, headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await request('GET', P, { headers: AUTH })).status, 405);
  const total = app.listSitemapUrls().length;
  const dry = await request('POST', P, { body: { dry_run: true }, headers: { ...AUTH, ...PROD } });
  assert.equal(dry.status, 200);
  assert.equal(dry.json.dry_run, true);
  assert.equal(dry.json.url_count, total);
  assert.equal(dry.json.batches, 1);
  assert.equal(fetchCalls.length, 0, 'a dry run sends nothing');
  await withEnv('test', async () => {
    const r = await request('POST', P, { body: {}, headers: { ...AUTH, ...PROD } });
    assert.equal(r.status, 409);
  });
  await withEnv(undefined, async () => {
    const local = await request('POST', P, { body: {}, headers: { ...AUTH, ...LOCAL } });
    assert.equal(local.status, 409);
    assert.equal(fetchCalls.length, 0);
    fetchStatus = 202;
    const r = await request('POST', P, { body: {}, headers: { ...AUTH, ...PROD } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.indexnow_status, 202);
    assert.equal(r.json.submitted, total);
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.urlList.length, total);
  fetchCalls.length = 0;
  // The old GET route (guarded only by the public key) no longer submits anything.
  const old = await request('GET', `/admin/indexnow-submit?key=${KEY}`, { headers: PROD });
  assert.notEqual(old.status, 200);
  assert.equal(fetchCalls.length, 0);
});
