'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../server');

test('Apple touch icons: root, precomposed and sized paths all serve the 180px icon; other paths still 404', async () => {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const icon = fs.readFileSync(path.join(__dirname, '..', 'public', 'images', 'icons', 'okanagan-roam-apple-touch-180.png'));
  try {
    for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/apple-touch-icon-120x120.png', '/apple-touch-icon-152x152-precomposed.png']) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), icon, p);
    }
    const head = await fetch(`${base}/apple-touch-icon-precomposed.png`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    for (const p of ['/apple-touch-icon-x.png', '/apple-touch-icon.png.bak', '/apple-touch-icon-1200x1200.png']) {
      assert.notEqual((await fetch(`${base}${p}`)).status, 200, p);
    }
  } finally { srv.close(); }
});
