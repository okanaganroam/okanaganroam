// The Monday "what changed" email (2026-11-06): sent once per Monday after 7 AM Pacific, by Brevo, retried up to 4 times
// on failure, and never when email is off. Runs on a throwaway database; run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'weekly-digest-test-token';
delete process.env.WHISTLER_ADMIN_TOKEN; delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');

const SUN = new Date('2026-11-08T20:00:00Z'); const MON_EARLY = new Date('2026-11-09T13:00:00Z'); // 5 AM PST
const MON = new Date('2026-11-09T16:00:00Z'); const MON_LATER = new Date('2026-11-09T22:00:00Z');
const MON2 = new Date('2026-11-16T16:00:00Z');

test('pacificNow reads the Pacific weekday, hour and date', () => {
  assert.deepEqual(app.pacificNow(MON), { weekday: 'Mon', hour: 8, date: '2026-11-09' });
  assert.deepEqual(app.pacificNow(SUN), { weekday: 'Sun', hour: 12, date: '2026-11-08' });
});

test('only Monday from 7 AM; once a week; email off is logged once and not retried', async () => {
  app.setOwnerEmailTransport(null);
  assert.equal(await app.digestTick(SUN), null);
  assert.equal(await app.digestTick(MON_EARLY), null);
  assert.equal(await app.digestTick(MON), 'email_off');
  assert.equal(await app.digestTick(MON_LATER), 'email_off');
  assert.equal(db.prepare('SELECT attempts FROM digest_log WHERE week = ?').get('2026-11-09').attempts, 1);
});

test('sends once with a subject, text and html; a second tick the same Monday sends nothing more', async () => {
  const sent = [];
  app.setOwnerEmailTransport(async (m) => { sent.push(m); });
  assert.equal(await app.digestTick(MON2), 'sent');
  assert.equal(await app.digestTick(new Date(MON2.getTime() + 3600000)), 'sent');
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /What changed this week: 2026-11-09 to 2026-11-15/);
  assert.match(sent[0].text, /OKANAGAN ROAM/); assert.match(sent[0].html, /Open the full dashboard/);
  assert.match(sent[0].to, /@/);
  app.setOwnerEmailTransport(null);
});

test('a failed send is retried on later ticks, at most 4 attempts in a week', async () => {
  let calls = 0;
  app.setOwnerEmailTransport(async () => { calls += 1; throw new Error('boom'); });
  const MON3 = new Date('2026-11-23T16:00:00Z');
  const results = [];
  for (let i = 0; i < 6; i += 1) results.push(await app.digestTick(new Date(MON3.getTime() + i * 900000)));
  assert.deepEqual(results.slice(0, 4), ['failed', 'failed', 'failed', 'failed']);
  assert.equal(results[4], 'failed'); assert.equal(calls, 4);
  app.setOwnerEmailTransport(null);
});
