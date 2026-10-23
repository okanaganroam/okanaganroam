// Notes to visitors (2026-10-23): Dayton can send a short personal email to a visitor who sent a tip or photo,
// from /admin/review (cookie) or the token API, without ever seeing their address. Runs on a throwaway database
// (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const TOKEN = 'visitor-note-test-admin-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;

const app = require('../server.js');
const db = require('../db.js');

const venueId = Number(db.prepare(`INSERT INTO venues (name, region, type, description, latitude, longitude, slug)
  VALUES ('Note Fixture Dog Beach', 'kelowna', 'outdoor', 'A fixture place used only by the visitor note tests.', 49.9, -119.5, 'note-fixture-dog-beach')`).run().lastInsertRowid);
const EMAIL = 'elizabeth.private@example.com';
const addContribution = (o = {}) => Number(db.prepare(`INSERT INTO visitor_contributions (venue_id, display_name, email, tip, status, confirmed_at,
    rights_confirmed_at, honesty_confirmed_at, lang, reviewed_at)
  VALUES (@venue_id, @display_name, @email, @tip, @status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, @lang, CURRENT_TIMESTAMP)`)
  .run({ venue_id: venueId, display_name: 'Elizabeth B.', email: EMAIL, tip: 'The map pin is on the wrong side of the creek.', status: 'approved', lang: 'en', ...o }).lastInsertRowid);

async function server() {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, resolve));
  const base = `http://localhost:${srv.address().port}`;
  const post = (p, body, headers = {}) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) })
    .then(async (r) => { const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch (e) { /* not JSON */ } return { status: r.status, body: json, text, setCookie: r.headers.get('set-cookie') || '' }; });
  const get = (p, headers = {}) => fetch(`${base}${p}`, { headers }).then(async (r) => ({ status: r.status, text: await r.text() }));
  return { base, post, get, close: () => new Promise((resolve) => srv.close(resolve)) };
}

test('Visitor note: sends through the decision-email path, never shows the address, logs the note, lists it on /admin/review', async () => {
  const t = await server();
  const mail = [];
  app.setOwnerEmailTransport(async (m) => { mail.push(m); });
  try {
    const id = addContribution();
    const msg = 'Thanks for flagging the pin!\nWe moved it to the right spot. <b>Cheers</b> & enjoy the beach.';
    // Token API: the reviewer is required, like the other visitor routes.
    assert.equal((await t.post(`/admin/visitor-contributions/${id}/note`, { message: msg })).status, 401, 'needs the token');
    assert.equal((await t.post(`/admin/visitor-contributions/${id}/note`, { message: msg }, { Authorization: `Bearer ${TOKEN}` })).status, 400, 'reviewer required');
    const r = await t.post(`/admin/visitor-contributions/${id}/note`, { reviewer: 'dayton', message: `  ${msg}  ` }, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body, { id, emailed: 'sent' });
    assert.equal(r.text.toLowerCase().includes(EMAIL), false);
    assert.equal(r.text.includes('example.com'), false);

    assert.equal(mail.length, 1);
    const m = mail[0];
    assert.equal(m.to, EMAIL);
    assert.equal(m.subject, 'A note from Okanagan Roam about your tip');
    assert.match(m.text, /^Hi Elizabeth,\n\nThanks for flagging the pin!\nWe moved it to the right spot\. <b>Cheers<\/b> & enjoy the beach\.\n/);
    assert.match(m.text, /https:\/\/okanaganroam\.com\/kelowna\/[a-z-]+\/note-fixture-dog-beach/);
    assert.match(m.text, /\n\nDayton\nOkanagan Roam\nokanaganroam\.com$/);
    assert.match(m.html, /Thanks for flagging the pin!<br>We moved it to the right spot\. &lt;b&gt;Cheers&lt;\/b&gt; &amp; enjoy the beach\./);
    assert.equal(m.html.includes('<b>Cheers'), false, 'the message is escaped in the HTML part');
    assert.match(m.html, /Dayton<br>Okanagan Roam<br>okanaganroam\.com/);
    assert.doesNotMatch(m.text + m.html, /Rhodes/);

    const logged = db.prepare('SELECT * FROM visitor_contribution_notes WHERE contribution_id = ?').all(id);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].message, msg, 'trimmed, line breaks kept');
    assert.equal(logged[0].sent_by, 'dayton');
    assert.equal(logged[0].result, 'sent');
    assert.ok(logged[0].sent_at);
    assert.equal(Object.values(logged[0]).join(' ').includes(EMAIL), false, 'the address is not copied into the log');

    // The review page: the form and the earlier note, never the address. The admin JSON list has the notes, no address.
    const cookie = (await t.post('/admin/review/login', { token: TOKEN })).setCookie.split(';')[0];
    const page = (await t.get('/admin/review', { Cookie: cookie })).text;
    assert.match(page, /Visitor photos &amp; tips live \(last 30 days\)/);
    const start = page.indexOf(`data-kind="visitor" data-id="${id}"`);
    assert.ok(start > 0, 'the live item is on the page');
    const card = page.slice(start, page.indexOf('</article>', start));
    assert.match(card, /<summary>Send a note \(1 sent before\)<\/summary>/);
    assert.match(card, /<textarea class="rv-note-text" name="note"/);
    assert.match(card, /rv-note-send">Send<\/button>/);
    assert.match(card, /: Thanks for flagging the pin! We moved it to the right spot\. &lt;b&gt;Cheers&lt;\/b&gt; &amp; enjo…<\/li>/, card);
    assert.match(page, /'\/admin\/review\/visitor\/' \+ card\.getAttribute\('data-id'\) \+ '\/note'/);
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    assert.ok(scripts.some((s) => s.includes('rv-note-send')));
    for (const s of scripts) new Function(s); // eslint-disable-line no-new-func -- the page script still parses
    assert.equal(page.toLowerCase().includes(EMAIL), false);
    const list = await t.get('/admin/visitor-contributions?status=all', { Authorization: `Bearer ${TOKEN}` });
    assert.equal(list.text.toLowerCase().includes(EMAIL), false);
    assert.equal(JSON.parse(list.text).contributions.find((c) => c.id === id).notes[0].message, msg);

    // The cookie route: same-origin and signed in, like Remove / Approve.
    assert.equal((await t.post(`/admin/review/visitor/${id}/note`, { message: 'Hi again' })).status, 401);
    assert.equal((await t.post(`/admin/review/visitor/${id}/note`, { message: 'Hi again' }, { Cookie: cookie, Origin: 'https://evil.example' })).status, 403);
    const viaCookie = await t.post(`/admin/review/visitor/${id}/note`, { message: 'Hi again' }, { Cookie: cookie });
    assert.equal(viaCookie.status, 200, viaCookie.text);
    assert.deepEqual(viaCookie.body, { id, emailed: 'sent' });
    assert.equal(mail.length, 2);
    assert.equal(db.prepare('SELECT sent_by FROM visitor_contribution_notes WHERE contribution_id = ? ORDER BY id DESC').get(id).sent_by, 'dayton');
  } finally {
    app.setOwnerEmailTransport(null);
    await t.close();
  }
});

test('Visitor note: validation, unconfirmed refused, no address, failures, 3 a day per item', async () => {
  const t = await server();
  const mail = [];
  let fail = false;
  app.setOwnerEmailTransport(async (m) => { if (fail) throw new Error("provider down"); mail.push(m); });
  const send = (id, body) => t.post(`/admin/visitor-contributions/${id}/note`, { reviewer: 'dayton', ...body }, { Authorization: `Bearer ${TOKEN}` });
  try {
    const id = addContribution({ status: 'pending' });
    for (const bad of [{}, { message: '' }, { message: '   \n ' }, { message: 42 }, { message: 'x'.repeat(2001) }]) {
      const r = await send(id, bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.reason, 'bad_message');
    }
    assert.equal((await send(id, { message: 'y'.repeat(2000) })).status, 200, 'exactly 2000 is fine');
    assert.equal((await send(99999999, { message: 'Hello' })).status, 404);

    const unconfirmed = addContribution({ status: 'unconfirmed' });
    const u = await send(unconfirmed, { message: 'Hello' });
    assert.equal(u.status, 409);
    assert.equal(u.body.reason, 'not_confirmed');
    for (const status of ['rejected', 'removed']) assert.equal((await send(addContribution({ status }), { message: 'Hello' })).body.emailed, 'sent', status);

    const noAddr = addContribution({ email: 'not-an-email' });
    const before = mail.length;
    const n = await send(noAddr, { message: 'Hello' });
    assert.deepEqual(n.body, { id: noAddr, emailed: 'no_address' });
    assert.equal(mail.length, before, 'nothing sent');
    assert.equal(n.text.includes('not-an-email'), false);

    const flaky = addContribution();
    fail = true;
    const f = await send(flaky, { message: 'Hello' });
    assert.equal(f.status, 200);
    assert.deepEqual(f.body, { id: flaky, emailed: 'failed' });
    assert.equal(f.text.toLowerCase().includes(EMAIL), false);
    fail = false;

    // Rate limit: 3 sent notes per item per day (the failed one above does not count).
    for (let i = 0; i < 3; i++) assert.equal((await send(flaky, { message: `Note ${i}` })).body.emailed, 'sent');
    const limited = await send(flaky, { message: 'Note 4' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.reason, 'rate_limited');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM visitor_contribution_notes WHERE contribution_id = ? AND result = 'sent'").get(flaky).n, 3);
    // Older than a day no longer counts; other items are unaffected.
    db.prepare("UPDATE visitor_contribution_notes SET sent_at = datetime('now', '-25 hours') WHERE contribution_id = ?").run(flaky);
    assert.equal((await send(flaky, { message: 'Next day' })).body.emailed, 'sent');
  } finally {
    app.setOwnerEmailTransport(null);
    await t.close();
  }
});

test('Visitor note: French visitors get the French subject, greeting and sign-off', async () => {
  const id = addContribution({ display_name: 'Élodie T.', lang: 'fr' });
  const mail = [];
  app.setOwnerEmailTransport(async (m) => { mail.push(m); });
  try {
    const r = await app.sendVisitorNote(id, 'Merci pour votre conseil!', 'dayton');
    assert.deepEqual(r.body, { id, emailed: 'sent' });
    assert.equal(mail[0].subject, 'Un mot d’Okanagan Roam au sujet de votre conseil');
    assert.match(mail[0].text, /^Bonjour Élodie,\n\nMerci pour votre conseil!\n\nVotre conseil portait sur Note Fixture Dog Beach :\nhttps:\/\/okanaganroam\.com\//);
    assert.match(mail[0].text, /\n\nDayton\nOkanagan Roam\nokanaganroam\.com$/);
    assert.match(mail[0].html, /Bonjour Élodie,/);
  } finally {
    app.setOwnerEmailTransport(null);
  }
});
