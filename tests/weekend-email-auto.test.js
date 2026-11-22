// The weekend email sends itself (2026-11-21): Wednesday 10:00 Pacific preview to the admin with a signed hold link,
// Thursday 08:00 Pacific send, never twice (DB row per weekend, conditional claims), held / already sent / no events /
// blocked -> one short note to the admin instead. OFF unless WEEKEND_EMAIL_AUTO=on. Fake clocks throughout.
// Runs on a throwaway database; copy okanagan.db back afterwards (or `git checkout -q okanagan.db` in your own worktree).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'weekend-auto-test-token';
delete process.env.BREVO_API_KEY; delete process.env.WEEKEND_EMAIL_AUTO;
process.env.NEWSLETTER_MAILING_ADDRESS = 'PO Box 1, Kelowna, BC';
process.env.DIGEST_EMAIL = 'admin@example.com';
const app = require('../server.js');
const db = require('../db.js');
const wk = app.weekendEmail;
const auto = app.weekendAuto;
wk.setSendDelay(0);

const sent = [];
app.setOwnerEmailTransport(async (m) => { sent.push(m); });
const take = () => sent.splice(0, sent.length);

// The Wednesday/Thursday/Friday of the coming weeks (Okanagan dates).
const TODAY = app.todayLocal();
const wd = new Date(`${TODAY}T12:00:00Z`).getUTCDay();
const WED0 = app.addLocalDays(TODAY, ((3 - wd + 7) % 7) || 7);
const week = (k) => { const wed = app.addLocalDays(WED0, 7 * k); return { wed, thu: app.addLocalDays(wed, 1), fri: app.addLocalDays(wed, 2), sat: app.addLocalDays(wed, 3) }; };
// An instant at a Pacific wall-clock time on a date (PST or PDT, whichever is right that day).
const pac = (date, hh, mm = 0) => {
  for (const off of ['-08:00', '-07:00']) {
    const d = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${off}`);
    const p = auto.pacificParts(d);
    if (p.date === date && p.hour === hh) return d;
  }
  throw new Error('no such Pacific time');
};
const meta = { reason: 'weekend auto fixture', batch_id: 'test-weekend-auto' };
let n = 0;
const mkEvent = (date, name) => {
  n++;
  const res = app.createEvent({ region: 'kelowna', name, description: 'A fixture event used only by the weekend auto-send tests.', source_type: 'official_venue', source_name: 'Fixture',
    source_url: `https://example.com/weekend-auto/${n}`, venue_name_text: `Auto Hall ${n}`, categories: ['arts-culture'], occurrences: [{ start_date: date, start_time: '19:00', end_time: '21:00' }] }, meta);
  assert.equal(res.ok, true, JSON.stringify(res));
};
for (const k of [0, 1, 2, 3, 4]) mkEvent(week(k).fri, `Friday Jazz Night ${k}`);
// Week 5 has no events at all.
const subs = ['a@example.com', 'b@example.com', 'c@example.com'];
for (const e of subs) db.prepare("INSERT INTO weekend_email_subscribers (email, confirmed_at, unsubscribe_token) VALUES (?, CURRENT_TIMESTAMP, ?)").run(e, require('crypto').randomBytes(16).toString('hex'));
const toSubscribers = (msgs) => msgs.filter((m) => subs.includes(m.to));
const toAdmin = (msgs) => msgs.filter((m) => m.to === 'admin@example.com');

async function withServer(fn) {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { return await fn(base); } finally { await new Promise((r) => srv.close(r)); }
}

test('off by default: no preview, no send, and the admin page says so', async () => {
  const w = week(0);
  assert.equal(await auto.tick(pac(w.wed, 10, 30)), null);
  assert.equal(await auto.tick(pac(w.thu, 9)), null);
  assert.equal(take().length, 0);
  assert.match(auto.status(pac(w.wed, 9)).line, /^Auto-send: off/);
  assert.match(wk.adminPage({ now: pac(w.wed, 9), autoHtml: auto.statusHtml(pac(w.wed, 9)) }), /Auto-send: off \(set WEEKEND_EMAIL_AUTO=on/);
});

test('Wednesday 10:00: one preview to the admin with the hold link; Thursday 08:00: one send to every confirmed subscriber', async () => {
  process.env.WEEKEND_EMAIL_AUTO = 'on';
  const w = week(0);
  assert.equal(await auto.tick(pac(w.wed, 9, 59)), null, 'not before 10:00');
  assert.equal(await auto.tick(pac(w.wed, 10, 5)), 'preview_sent');
  const [pv, ...rest] = take();
  assert.equal(rest.length, 0);
  assert.equal(pv.to, 'admin@example.com');
  assert.match(pv.subject, /^\[Preview\] This weekend in the Okanagan/);
  assert.match(pv.text, new RegExp(`https://okanaganroam\\.com/weekend-email/hold/${w.fri}/[a-f0-9]{32}`));
  assert.match(pv.text, /3 confirmed subscribers/);
  assert.match(pv.html, /Friday Jazz Night 0/);
  assert.equal(await auto.tick(pac(w.wed, 10, 20)), null, 'one preview per week');
  assert.equal(take().length, 0);
  // Status line.
  assert.match(auto.status(pac(w.wed, 11)).line, new RegExp(`^Auto-send: on — next send Thu \\w+ \\d+ 8:00, preview Wed \\w+ \\d+ 10:00, held: no$`));
  // Thursday.
  assert.equal(await auto.tick(pac(w.thu, 7, 59)), null, 'not before 8:00');
  assert.equal(take().length, 0);
  assert.equal(await auto.tick(pac(w.thu, 8, 1)), 'sent');
  const out = take();
  assert.deepEqual(toSubscribers(out).map((m) => m.to).sort(), subs);
  assert.equal(toAdmin(out).length, 0);
  assert.equal(auto.row(w.fri).send_state, 'sent');
  // Never twice: later ticks, a restart (a second instance on the same database), a manual press.
  assert.equal(await auto.tick(pac(w.thu, 8, 16)), 'sent');
  const other = require('../weekend-email-auto').create({ db, weekendEmail: wk, getSender: () => async (m) => { sent.push(m); }, site: { name: 'Okanagan Roam', url: 'https://okanaganroam.com' }, adminEmail: () => 'admin@example.com', secret: () => 'weekend-auto-test-token' });
  assert.equal(await other.tick(pac(w.thu, 9)), 'sent');
  await wk.sendDigest({ now: pac(w.thu, 10) });
  assert.equal(take().length, 0);
  assert.match(auto.status(pac(w.thu, 11)).line, /this week: sent automatically/);
});

test('the hold link: GET only shows a button, POST holds; Thursday sends the admin one "not sent" note instead', async () => {
  const w = week(1);
  assert.equal(await auto.tick(pac(w.wed, 10)), 'preview_sent');
  const link = /https:\/\/okanaganroam\.com(\/weekend-email\/hold\/[^\s]+)/.exec(take()[0].text)[1];
  assert.equal(auto.holdLinkValid(w.fri, link.split('/').pop(), pac(w.wed, 12)), true);
  assert.equal(auto.holdLinkValid(w.fri, link.split('/').pop(), pac(w.fri, 1)), false, 'expires after Thursday');
  assert.equal(auto.holdLinkValid(w.fri, '0'.repeat(32), pac(w.wed, 12)), false, 'signed');
  await withServer(async (base) => {
    const page = await fetch(`${base}${link}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<form method="post"[^>]*><button type="submit">Hold this week<\/button>/);
    assert.equal(auto.row(w.fri).held_at, null, 'a GET (a mail scanner) holds nothing');
    const bad = await fetch(`${base}/weekend-email/hold/${w.fri}/${'a'.repeat(32)}`);
    assert.equal(bad.status, 410);
  });
  // The POST (the real hold), with the clock of the day (the server's own clock is today, before the link's Thursday).
  const fake = { resume() {} };
  let status = 0, body = '';
  const res = { writeHead: (s) => { status = s; }, end: (b) => { body = b || ''; } };
  assert.equal(auto.handleHoldLink(fake, res, link, 'POST', pac(w.wed, 12)), true);
  assert.equal(status, 200);
  assert.match(body, /will not go out automatically/);
  assert.ok(auto.row(w.fri).held_at);
  assert.match(auto.status(pac(w.wed, 13)).line, /held: yes/);
  assert.equal(await auto.tick(pac(w.thu, 8)), 'held');
  const out = take();
  assert.equal(toSubscribers(out).length, 0);
  assert.equal(toAdmin(out).length, 1);
  assert.match(out[0].subject, /^Weekend email not sent this week/);
  assert.match(out[0].text, /you put this week on hold/);
  assert.equal(await auto.tick(pac(w.thu, 9)), 'held');
  assert.equal(take().length, 0, 'the note goes once');
});

test('a manual send counts as this week’s send', async () => {
  const w = week(2);
  const r = await wk.sendDigest({ now: pac(w.wed, 15) });
  assert.equal(r.sent, 3);
  take();
  assert.equal(await auto.tick(pac(w.thu, 8)), 'skipped_sent');
  const out = take();
  assert.equal(toSubscribers(out).length, 0);
  assert.match(toAdmin(out)[0].text, /already sent this week \(3 sent by hand/);
});

test('a blocker (no CASL mailing address, no email key) and a weekend with no events: a note, never a send', async () => {
  const w = week(3);
  delete process.env.NEWSLETTER_MAILING_ADDRESS;
  assert.equal(await auto.tick(pac(w.wed, 10)), 'preview_sent');
  assert.match(take()[0].text, /Heads up: Not sent: NEWSLETTER_MAILING_ADDRESS is not set/);
  assert.equal(await auto.tick(pac(w.thu, 8)), 'blocked');
  const out = take();
  assert.equal(toSubscribers(out).length, 0);
  assert.match(toAdmin(out)[0].text, /NEWSLETTER_MAILING_ADDRESS is not set/);
  process.env.NEWSLETTER_MAILING_ADDRESS = 'PO Box 1, Kelowna, BC';
  // No events (week 5).
  const w5 = week(5);
  assert.equal(await auto.tick(pac(w5.thu, 8)), 'skipped_no_events');
  assert.match(toAdmin(take())[0].text, /there are no events for this weekend/);
});

test('a send cut off by a restart resumes later without emailing anyone twice', async () => {
  const w = week(4);
  // One subscriber already got it before the "crash"; the claim is old.
  const subA = db.prepare('SELECT id FROM weekend_email_subscribers WHERE email = ?').get('a@example.com').id;
  db.prepare("INSERT INTO weekend_email_sends (weekend, subscriber_id, status, sent_at) VALUES (?, ?, 'sent', CURRENT_TIMESTAMP)").run(w.fri, subA);
  db.prepare("INSERT INTO weekend_email_auto (weekend, send_state, send_attempts, claimed_at) VALUES (?, 'sending', 1, ?)").run(w.fri, pac(w.thu, 8).toISOString());
  assert.equal(await auto.tick(pac(w.thu, 8, 30)), null, 'a fresh claim is left alone (another server may be sending)');
  assert.equal(await auto.tick(pac(w.thu, 11)), 'sent');
  assert.deepEqual(toSubscribers(take()).map((m) => m.to).sort(), ['b@example.com', 'c@example.com']);
});

test('the admin page shows the status line and the Hold button; the hold form needs the admin', async () => {
  const html = wk.adminPage({ now: pac(week(6).wed, 9), autoHtml: auto.statusHtml(pac(week(6).wed, 9)) });
  assert.match(html, /Auto-send: on — next send Thu/);
  assert.match(html, /<button type="submit">Hold this week<\/button>/);
  assert.doesNotMatch(html, /Nothing goes out by itself/);
  await withServer(async (base) => {
    const r = await fetch(`${base}/admin/weekend-email/hold`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: 'weekend=x&hold=yes', redirect: 'manual' });
    assert.equal(r.status, 401);
  });
  delete process.env.WEEKEND_EMAIL_AUTO;
});
