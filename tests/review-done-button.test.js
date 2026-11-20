// Review page Done button (2026-11-20, Dayton): a typed-up request (happy hour, specials, a French description) that we
// finished by hand leaves the list quietly. Its card only had Reject, which emailed the owner a no.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
delete process.env.BREVO_API_KEY;
delete process.env.RESEND_API_KEY;
const app = require('../server.js');
const db = require('../db.js');

const venue = app.createVenue({ name: 'Done Button Pub', region: 'kelowna', type: 'pub', slug: 'done-button-pub' });
const addMenu = (status, helpKind) => db.prepare('INSERT INTO venue_menus (venue_id, status, help_kind, help_note, data) VALUES (?, ?, ?, ?, ?)')
  .run(venue.id, status, helpKind, helpKind ? 'Sent from the easy setup: our happy hour.' : null, JSON.stringify({ sections: [] })).lastInsertRowid;
const card = (id) => app.renderAdminMenuCard({ ...db.prepare('SELECT * FROM venue_menus WHERE id = ?').get(id), venue_name: venue.name });

test('a typed-up request has a Done button; Done takes it off the list without emailing them', async () => {
  const id = addMenu('help', 'happy_hour');
  const html = card(id);
  assert.match(html, /data-act="done"/);
  assert.match(html, /nothing is sent to them/);
  const r = await app.adminReviewAction('menu', id, 'done', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.emailed, 'not_told');
  const row = db.prepare('SELECT status, reviewed_by FROM venue_menus WHERE id = ?').get(id);
  assert.equal(row.status, 'superseded');
  assert.match(row.reviewed_by, /:done$/);
  // Twice is refused, nothing changes.
  assert.equal((await app.adminReviewAction('menu', id, 'done', {})).status, 409);
});

test('Done is only for typed-up requests', async () => {
  const menu = addMenu('pending', null);
  assert.doesNotMatch(card(menu), /data-act="done"/);
  assert.notEqual((await app.adminReviewAction('menu', menu, 'done', {})).status, 200);
  assert.equal(db.prepare('SELECT status FROM venue_menus WHERE id = ?').get(menu).status, 'pending');
  assert.equal((await app.adminReviewAction('photo', 1, 'done', {})).status, 400);
});
