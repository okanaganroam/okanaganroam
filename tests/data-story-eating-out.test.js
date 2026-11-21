// Data story (2026-11-20): /guides/okanagan-eating-out-prices-2026, "What It Costs to Eat Out in the Okanagan (2026)",
// a figures page for press pitches. It must stay noindex (its "indexable" field in data/data-stories/), out of the
// sitemap, IndexNow, the /guides hub, llms.txt and every guide list, and name no venue.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');

const PATH = '/guides/okanagan-eating-out-prices-2026';
const DATA_FILE = path.join(__dirname, '..', 'data', 'data-stories', 'okanagan-eating-out-prices-2026.json');

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
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, headers: r.headers, text: await r.text() }; };

test('the page renders with its headline figures, table and method', async () => {
  const r = await get(PATH);
  assert.equal(r.status, 200);
  assert.match(r.text, /<h1>What It Costs to Eat Out in the Okanagan \(2026\)<\/h1>/);
  assert.match(r.text, /<table class="patio-picks">/);
  assert.match(r.text, /<th scope="col">Places counted<\/th>/);
  assert.match(r.text, /<th scope="row">Kelowna<\/th><td>119<\/td><td>about \$25<\/td>/);
  assert.match(r.text, /<h2>How we measured<\/h2>/);
  assert.match(r.text, /Last checked: <time datetime="2026-11-04">/);
  assert.ok(!r.text.includes('—'), 'no em dashes');
});

test('noindex while the data file says indexable: false, and the flag is the only switch', async () => {
  const story = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  assert.equal(story.indexable, false, 'flip to true only when the page should be indexed (then update this test)');
  const r = await get(PATH);
  const headHtml = r.text.split('</head>')[0];
  assert.match(headHtml, /<meta name="robots" content="noindex, follow">/);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  // Flipped in memory, the same page drops the noindex.
  const live = app.DATA_STORIES[PATH];
  live.indexable = true;
  try { assert.ok(!/<meta name="robots"/.test(app.renderDataStoryPage(PATH).split('</head>')[0])); } finally { live.indexable = false; }
});

test('absent from the sitemap, IndexNow, the guide lists, the /guides hub and llms.txt', async () => {
  assert.ok(!app.buildSitemapXml().includes('eating-out-prices'), 'sitemap');
  assert.ok(!app.listSitemapUrls().some((u) => u.includes('eating-out-prices')), 'IndexNow URL list');
  assert.ok(!app.allGuides().some((g) => g.path === PATH), 'guide registry (hub, smart search, Featured in)');
  assert.ok(!app.liveGuides().some((g) => g.path === PATH), 'live guides');
  assert.ok(!(await get('/sitemap.xml')).text.includes('eating-out-prices'));
  assert.ok(!(await get('/guides')).text.includes('eating-out-prices'), '/guides hub');
  assert.ok(!(await get('/llms.txt')).text.includes('eating-out-prices'), 'llms.txt');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data', 'guides', 'okanagan-eating-out-prices-2026.json')), 'not a file guide');
});

test('names no venue', async () => {
  const main = (await get(PATH)).text.split('<main')[1].split('</main>')[0].replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const story = fs.readFileSync(DATA_FILE, 'utf8');
  const names = new Set(db.prepare('SELECT name FROM venues').all().map((v) => v.name));
  try { for (const v of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'venues.json'), 'utf8'))) if (v && v.name) names.add(v.name); } catch (e) { /* no seed list */ }
  assert.ok(names.size > 50, 'venue names to check against');
  // Multi-word venue names only: one-word names ("Oliver", "Summerland") can be town names, which the page does use.
  for (const n of names) {
    if (!/\S\s+\S/.test(n) || n.length < 8) continue;
    assert.ok(!main.includes(n), `names a venue: ${n}`);
    assert.ok(!story.includes(n), `data file names a venue: ${n}`);
  }
});
