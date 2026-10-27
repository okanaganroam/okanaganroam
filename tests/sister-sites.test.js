// Sister sites (2026-10-27): Okanagan Roam and Whistler Roam link to each other from the About page (text and
// AboutPage relatedLink), one homepage line, the Okanagan to Whistler road-trip guide and a shared founder.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const app = require('../server.js');
const WHISTLER = 'href="https://whistlerroam.com/"';

async function get(p) {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}${p}`);
    return { status: res.status, body: await res.text() };
  } finally { srv.close(); }
}

test('the About page links Whistler Roam in English and French, with relatedLink in its schema', async () => {
  const en = await get('/about');
  assert.equal(en.status, 200);
  assert.ok(en.body.includes(WHISTLER), 'About links whistlerroam.com');
  assert.match(en.body, /"relatedLink":\["https:\/\/whistlerroam\.com\/"\]/);
  const fr = await get('/fr/about');
  assert.match(fr.body, /site jumeau pour le corridor Sea to Sky/);
  assert.ok(fr.body.includes(WHISTLER));
});

test('the homepage Organization data names the founder shared with Whistler Roam', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'okanagan.html'), 'utf8');
  assert.match(html, /"founder": \{ "@type": "Person", "name": "Dayton" \}/);
});

test('the homepage sister-site line renders', async () => {
  const res = await get('/');
  const line = res.body.match(/<p class="sister-site-note"[\s\S]*?<\/p>/);
  assert.ok(line, 'sister-site line present');
  assert.equal(line[0].split(WHISTLER).length - 1, 2, 'one link per language');
  assert.match(line[0], /class="home-fr" lang="fr">Vous allez aussi à Whistler/);
});

test('the road-trip guide links Whistler Roam and is listed with the town guides', () => {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'guides', 'okanagan-to-whistler-road-trip.json'), 'utf8'));
  assert.ok(g.footerHtml.includes(WHISTLER));
  assert.match(g.title, /\| Okanagan Roam$/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /'\/guides\/okanagan-to-whistler-road-trip'/);
});
