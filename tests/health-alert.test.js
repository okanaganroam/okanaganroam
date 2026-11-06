// The daily tracking-health email (2026-11-06): sent when a counter recorded nothing yesterday, once per problem,
// not repeated within 2 days, never when counters are fine or still learning. Throwaway database; run
// `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'health-alert-test-token';
delete process.env.WHISTLER_ADMIN_TOKEN; delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');

const at = (d, h) => new Date(`${d}T${h}:00:00Z`); // h in UTC; 16:00Z is 8 AM Pacific, 18:00Z is 10 AM
// Views every day from Nov 16 to Dec 8 except Nov 30 to Dec 3 (the outage), and Dec 9 (a second, later one).
const SKIP = new Set(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03']);
for (let d = new Date('2026-11-16T12:00:00Z'); d < new Date('2026-12-09T12:00:00Z'); d = new Date(d.getTime() + 86400000)) {
  const day = d.toISOString().slice(0, 10);
  if (!SKIP.has(day)) db.prepare("INSERT INTO venue_event_counts (day, venue_id, name, n) VALUES (?, 1, 'venue_view', 40)").run(day);
}

test('nothing before 9 AM Pacific; a quiet or healthy day logs ok and sends nothing', async () => {
  const sent = []; app.setOwnerEmailTransport(async (m) => { sent.push(m); });
  assert.equal(await app.healthAlertTick(at('2026-11-30', '16')), null);          // 8 AM
  assert.equal(await app.healthAlertTick(at('2026-11-30', '18')), 'ok');           // yesterday (Nov 29) had 40 views: fine
  assert.equal(sent.length, 0);
  app.setOwnerEmailTransport(null);
});

test('a silent counter sends one email; the same problem is not repeated for 2 days, then it is', async () => {
  const sent = []; app.setOwnerEmailTransport(async (m) => { sent.push(m); });
  assert.equal(await app.healthAlertTick(at('2026-12-01', '18')), 'sent');         // yesterday (Nov 30) has no views
  assert.equal(await app.healthAlertTick(at('2026-12-01', '20')), 'sent');         // same day again: no second email
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Tracking problem: Okanagan Roam/); assert.match(sent[0].text, /Business page views recorded nothing/);
  assert.equal(await app.healthAlertTick(at('2026-12-02', '18')), 'repeat');       // still silent, told yesterday
  assert.equal(sent.length, 1);
  assert.equal(await app.healthAlertTick(at('2026-12-04', '18')), 'sent');         // 3 days on: tell again
  assert.equal(sent.length, 2);
  app.setOwnerEmailTransport(null);
});

test('with email off the problem is logged once and nothing is sent', async () => {
  app.setOwnerEmailTransport(null);
  assert.equal(await app.healthAlertTick(at('2026-12-10', '18')), 'email_off');
  assert.equal(await app.healthAlertTick(at('2026-12-10', '20')), 'email_off');
});
