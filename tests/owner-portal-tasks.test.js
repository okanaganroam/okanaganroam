// Owner portal task screens (2026-11-05): the class that hides the parts of the page that belong to other tasks must not
// be `op-off`, which is the (older) name of each opening-hours day's "Closed" tick box. When both shared a name the CSS hid
// every Closed box and owners could not mark a day open or closed.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-tasks-admin-token';
const app = require('../server.js');

test('hours: the Closed tick boxes are never hidden by the task-screen rule', async () => {
  const v = app.createVenue({ name: 'Task Fixture Cafe', slug: 'task-fixture-cafe', region: 'kelowna', type: 'cafe', latitude: 49.9, longitude: -119.4, rating: 4.2, description: 'Fixture.' });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const html = await fetch(`http://127.0.0.1:${srv.address().port}/owner/${token}`).then((r) => r.text());
    assert.match(html, /<input type="checkbox" class="op-off"/, 'each day keeps its Closed tick box');
    assert.doesNotMatch(html, /\.op-off\s*\{[^}]*display:\s*none/, 'nothing hides .op-off');
    assert.match(html, /body\.owner-page \.op-hide \{ display: none !important; \}/, 'the task screens hide with op-hide');
    assert.doesNotMatch(html, /classList\.toggle\('op-off'/, 'the task script never toggles op-off');
  } finally { srv.close(); }
});
