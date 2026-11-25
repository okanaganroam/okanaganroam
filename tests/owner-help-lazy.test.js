// Portal speed (2026-11-25): the Help answers are fetched from a cached file instead of being written into every portal page.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-help-lazy-admin-token';
process.env.OWNER_HELP_LAZY = '1';
const app = require('../server.js');

let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());

test('the help widget carries a small config and points at its cached topics file', async () => {
  const html = app.ownerHelpWidgetHtml('edit', { lang: 'en' });
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'config is on the page');
  const cfg = JSON.parse(m[1]);
  assert.deepEqual(cfg.topics, [], 'no topics inline');
  assert.match(cfg.topicsUrl, /^\/owner-help\/[0-9a-f]{16}\.json$/);
  assert.ok(html.length < 120000, `the widget is small now (${html.length})`);
  const r = await fetch(base + cfg.topicsUrl);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /immutable/);
  const topics = await r.json();
  assert.ok(Array.isArray(topics) && topics.length > 20 && topics[0].id && topics[0].q, 'the topics come back whole');
});

test('an unknown topics file is a plain 404 that is never cached', async () => {
  const r = await fetch(`${base}/owner-help/0123456789abcdef.json`);
  assert.equal(r.status, 404);
  assert.match(r.headers.get('cache-control'), /no-store/);
});

test('the client script boots straight away from an inline config and otherwise fetches topicsUrl', () => {
  const js = app.ownerHelpWidgetHtml('edit', { lang: 'en' });
  assert.match(js, /cfg0\.topicsUrl/);
  assert.match(js, /function ohbBoot\(cfg\)/);
  assert.match(js, /\(cfg0\.topics && cfg0\.topics\.length\) \|\| !cfg0\.topicsUrl\) \{ ohbBoot\(cfg0\); return; \}/);
});
