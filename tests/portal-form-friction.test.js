// Portal form friction (Dayton, Nov 11 2026): owners kept getting forms sent back for boxes they could not know or
// had left short. 1: "Your name" fills itself in (and a blank one is filled on the server). 2: owner events may leave
// the start time blank and read "Time to be confirmed". 3: the event and edit forms check the common boxes in the
// browser first. 4: the portal dashboard says "Asked to fix something", not "Failed".
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'portal-friction-admin';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const { renderPortalPage } = require('../portal-activity-page');
app.setVenueSubmissionTransport(async () => {});

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '22:00']]])));
let n = 0;
const mk = () => app.createVenue({ name: `PFF Bistro ${++n}`, slug: `pff-bistro-${n}`, region: 'penticton', type: 'restaurant', latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: `${n} Main St, Penticton`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK, description: 'A fixture used only by the portal form friction tests.' });
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.88.0.${++ipN}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const day = (k) => { const d = new Date(Date.now() + k * 86400000); return d.toISOString().slice(0, 10); };
const ev = (o = {}) => ({ name: 'Trivia Night', categories: ['events-festivals'], description: 'Pub trivia with prizes every week, teams of up to six.',
  start_date: day(7), end_date: '', start_time: '', end_time: '', all_day: false, event_url: '', price_text: '', schedule_notes: '',
  contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000, partner_venue_ids: [], ...o });

test('1+2: an owner event with no name and no start time goes through, named for the business', async () => {
  const v = mk(); const link = app.createOwnerLink(v.id, { contact_email: 'owner@pff.example' });
  const t = link.url.split('/owner/')[1];
  const r = await post(`/owner/${t}/events`, ev());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sub = db.prepare('SELECT * FROM event_submissions WHERE owner_venue_id = ? ORDER BY id DESC').get(v.id);
  assert.equal(sub.contact_name, v.name);
  assert.equal(sub.start_time, null);
  assert.equal(sub.all_day, 0);
});

test('2: an end time without a start time is still sent back, with a plain reason', async () => {
  const v = mk(); const t = app.createOwnerLink(v.id, { contact_email: 'owner2@pff.example' }).url.split('/owner/')[1];
  const r = await post(`/owner/${t}/events`, ev({ end_time: '21:00' }));
  assert.equal(r.status, 400);
  assert.match(r.body.errors.start_time, /start time too/);
});

test('2: the public event form still needs a start time', () => {
  const { errors } = app.validateEventSubmission({ name: 'Market', description: 'A weekly market with local makers.', categories: ['events-festivals'], region: 'penticton',
    venue_name: 'Gyro Park', organizer_name: 'Market Society', contact_name: 'Sam', contact_email: 'sam@example.com', consent: true, start_date: day(5) });
  assert.match(errors.start_time, /start time/);
});

test('2: only an owner event approved without a time reads "Time to be confirmed"; other untimed dates stay date-only', async () => {
  const d = day(3);
  assert.equal(app.describeEventOccurrence({ start_date: d, end_date: d, start_time: null, end_time: null, all_day: 0, time_tbc: 1 }).timeText, 'Time to be confirmed');
  assert.equal(app.describeEventOccurrence({ start_date: d, end_date: d, start_time: null, end_time: null, all_day: 0 }).timeText, '', 'an import with no time stays date-only');
  assert.equal(app.describeEventOccurrence({ start_date: d, end_date: d, start_time: null, end_time: null, all_day: 1 }).timeText, 'All day');
  assert.equal(app.whatsOnCardTime({ time: '', windowOccurrences: [{ start_date: d, end_date: d, start_time: null, all_day: 0, time_tbc: 1 }] }), 'Time to be confirmed');
  // The whole path: an owner's untimed event, approved, shows the line on its page.
  const v = mk(); const t = app.createOwnerLink(v.id, { contact_email: 'tbc@pff.example' }).url.split('/owner/')[1];
  assert.equal((await post(`/owner/${t}/events`, ev({ name: 'Wine Pairing Dinner', start_date: d }))).status, 201);
  const sub = db.prepare('SELECT id FROM event_submissions WHERE owner_venue_id = ? ORDER BY id DESC').get(v.id);
  const r = app.approveEventSubmission(sub.id, { reviewer: 'test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.prepare('SELECT time_tbc FROM event_occurrences WHERE event_id = ?').get(r.body.event.id).time_tbc, 1);
  const html = await fetch(`${base}/penticton/events/${r.body.event.slug}`).then((x) => x.text());
  assert.match(html, /Time to be confirmed/);
});

test('1+3: the edit-link page fills in a known name, drops the stars and checks boxes before sending', async () => {
  const v = mk(); const t = app.createOwnerLink(v.id, { contact_email: 'named@pff.example' }).url.split('/owner/')[1];
  db.prepare("INSERT INTO owner_change_requests (venue_id, changes, previous, contact_name, contact_email, status) VALUES (?, '{}', '{}', 'Robin Lee', 'named@pff.example', 'approved')").run(v.id);
  const html = await fetch(`${base}/owner/${t}`).then((r) => r.text());
  assert.match(html, /id="oeContactName"[^>]*value="Robin Lee"/);
  assert.match(html, /<label for="oeContactName">Your name<\/label>/);
  assert.match(html, /<label for="oeStartTime">Start time<\/label>/);
  assert.match(html, /Time to be confirmed/);
  assert.match(html, /Checked here first \(2026-11-11\), so a missing box/);
  assert.match(html, /Checked here first \(2026-11-11\): the two length rules/);
});

test('4: the portal dashboard says "Asked to fix something", not "Failed"', () => {
  const html = renderPortalPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: { steps: [{ key: 'event_submit', text: 'Listed an event', group: 'Inside the portal', n: 2, failed: 2 }], login_clicks_per_day: [], logins_per_day: [] } }] });
  assert.match(html, /Asked to fix something/);
  assert.doesNotMatch(html, />Failed</);
});
