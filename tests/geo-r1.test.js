// GEO r1 (2026-10-20): what AI answer tools read about the site itself: /llms.txt, every social profile in the
// Organization sameAs, and a WebSite description that matches what the site does now (hours, events, map, planner).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; };
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const SOCIAL = ['https://www.instagram.com/okanaganroam', 'https://www.facebook.com/okanaganroam', 'https://www.youtube.com/@OkanaganRoam', 'https://www.pinterest.com/okanaganroam/', 'https://www.tiktok.com/@okanaganroam'];

test('/llms.txt is plain text, names the site and links only to okanaganroam.com', async () => {
  const r = await get('/llms.txt');
  assert.equal(r.status, 200);
  assert.match(r.type, /^text\/plain/);
  assert.match(r.text, /^# Okanagan Roam\n/);
  assert.match(r.text, /https:\/\/okanaganroam\.com\/map/);
  // Audit fix (2026-10-27): the French links are listed only once the French pages are indexable; until then the
  // summary only says French pages exist, and never links the noindex /whats-on/this-weekend.
  if (app.FRENCH_INDEXABLE) assert.match(r.text, /https:\/\/okanaganroam\.com\/fr\b/);
  else { assert.doesNotMatch(r.text, /## Français|okanaganroam\.com\/fr\b/); assert.match(r.text, /French pages start with \/fr\//); }
  assert.doesNotMatch(r.text, /this-weekend/);
  assert.match(r.text, /for example https:\/\/okanaganroam\.com\/kelowna\/wineries\/[a-z0-9-]+\./);
  for (const m of r.text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) assert.match(m[1], /^https:\/\/okanaganroam\.com\//);
});

for (const p of ['/', '/browse']) {
  test(`${p}: Organization lists every social profile and WebSite describes the current site`, async () => {
    const blocks = jsonLd((await get(p)).text);
    const org = blocks.find((b) => b['@type'] === 'Organization');
    const site = blocks.find((b) => b['@type'] === 'WebSite');
    assert.ok(org && site);
    assert.deepEqual(org.sameAs, SOCIAL);
    assert.equal(org.email, 'info@okanaganroam.com');
    assert.match(site.description, /opening hours/);
    assert.match(site.description, /events/);
    assert.doesNotMatch(site.description, /review-backed/);
  });
}

test('/fr: the WebSite description is in French', async () => {
  const site = jsonLd((await get('/fr')).text).find((b) => b['@type'] === 'WebSite');
  assert.ok(site);
  assert.match(site.description, /guide local gratuit/);
});

test('/about: Organization sameAs matches the homepage', async () => {
  const blocks = jsonLd((await get('/about')).text);
  const about = blocks.find((b) => b.mainEntity && b.mainEntity['@type'] === 'Organization');
  assert.ok(about);
  assert.deepEqual(about.mainEntity.sameAs, SOCIAL);
});
