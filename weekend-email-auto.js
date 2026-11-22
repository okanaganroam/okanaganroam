'use strict';
// The weekend email sends itself (2026-11-21, Dayton approved). OFF unless WEEKEND_EMAIL_AUTO=on.
//
//   Wednesday from 10:00 America/Vancouver: the admin (the Monday email's address) gets a preview of this week's email
//     with a "Hold this week" link (signed, admin-only, works until the end of Thursday).
//   Thursday from 08:00 America/Vancouver: the real email goes to every confirmed subscriber, unless this week is held,
//     was already sent (by hand from /admin/weekend-email or by an earlier tick), has no events, or is blocked (no CASL
//     mailing address, no email provider key). Then the admin gets one short "not sent because..." note instead.
//
// Never twice: one weekend_email_auto row per weekend (its Friday) in the database. Each step is claimed with a
// conditional UPDATE, so only one tick (or one server, across restarts and redeploys) wins it; the send itself keeps the
// existing per-subscriber claim in weekend_email_sends, so even a resumed send never emails anyone twice. Same
// 15-minute tick as the Monday email (server.js startDigestTimer); nothing runs under NODE_ENV=test unless a test calls
// tick() with its own clock.
const crypto = require('crypto');

const PREVIEW_HOUR = 10; // Wednesday
const SEND_HOUR = 8; // Thursday
const MAX_SEND_ATTEMPTS = 3;
const STALE_CLAIM_MS = 2 * 60 * 60 * 1000; // a 'sending' claim older than this (a restart mid-send) may resume
const FINAL = new Set(['sent', 'held', 'skipped_sent', 'skipped_no_events', 'blocked']);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function pacificParts(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, hour: Number(p.hour), minute: Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

// deps: { db, weekendEmail (weekend-email.js instance), getSender, adminEmail(), secret() (the admin token),
//         site: { name, url }, env }
function create(deps) {
  const { db, weekendEmail: wk, site } = deps;
  const env = deps.env || process.env;
  const adminEmail = () => String((deps.adminEmail && deps.adminEmail()) || '').trim();
  const secret = () => String((deps.secret && deps.secret()) || '');
  const enabled = () => String(env.WEEKEND_EMAIL_AUTO || '').trim().toLowerCase() === 'on';
  let busy = false;

  const row = (weekend) => db.prepare('SELECT * FROM weekend_email_auto WHERE weekend = ?').get(weekend) || null;
  const ensure = (weekend) => db.prepare('INSERT OR IGNORE INTO weekend_email_auto (weekend) VALUES (?)').run(weekend);

  // ---- The hold link ----
  // HMAC of the weekend with the admin token: only someone with the admin's email (or the token) has it. It works until the
  // end of that weekend's Thursday (Pacific).
  function holdSig(weekend) {
    const s = secret();
    return s ? crypto.createHmac('sha256', s).update(`weekend-email-hold:${weekend}`).digest('hex').slice(0, 32) : '';
  }
  function holdUrl(weekend) { const sig = holdSig(weekend); return sig ? `${site.url}/weekend-email/hold/${weekend}/${sig}` : ''; }
  function holdLinkValid(weekend, sig, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekend) || !/^[a-f0-9]{32}$/.test(String(sig || ''))) return false;
    const want = holdSig(weekend);
    if (!want || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(String(sig)))) return false;
    return pacificParts(now).date <= addDays(weekend, -1); // expires after Thursday
  }
  function setHold(weekend, held, by = 'admin') {
    ensure(weekend);
    if (held) db.prepare('UPDATE weekend_email_auto SET held_at = COALESCE(held_at, CURRENT_TIMESTAMP), held_by = ? WHERE weekend = ?').run(by, weekend);
    else db.prepare('UPDATE weekend_email_auto SET held_at = NULL, held_by = NULL WHERE weekend = ? AND (send_state IS NULL OR send_state != ?)').run(weekend, 'held');
    return row(weekend);
  }

  // ---- Emails to the admin ----
  async function mailAdmin(subject, lines, extraHtml = '') {
    const to = adminEmail(), send = deps.getSender();
    if (!to || !send) return 'email_off';
    const text = lines.join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b2e39;max-width:600px">${lines.map((l) => (l ? `<p style="margin:0 0 10px">${esc(l).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>` : '')).join('')}</div>${extraHtml}`;
    try { await send({ to, subject, text, html }); return 'sent'; } catch (e) { console.error('[weekend-auto] admin email failed:', e.message); return 'failed'; }
  }
  const confirmedCount = () => db.prepare('SELECT COUNT(*) AS n FROM weekend_email_subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL').get().n;
  // Why the automatic send must not go out (not counting a send already running), or null.
  function blockerFor(dg) {
    const b = wk.sendBlocker(dg);
    return b && !/already running/.test(b) ? b : null;
  }

  async function preview(now) {
    const dg = wk.buildDigest(now);
    ensure(dg.weekend);
    // Claim the preview for this weekend (one tick, one server).
    if (db.prepare("UPDATE weekend_email_auto SET preview_state = 'sending', preview_at = CURRENT_TIMESTAMP WHERE weekend = ? AND preview_state IS NULL").run(dg.weekend).changes !== 1) return null;
    const r = row(dg.weekend);
    const thu = addDays(dg.weekend, -1);
    const blocker = !dg.count ? 'There are no events this weekend yet, so nothing will go out unless some are added by Thursday morning.' : blockerFor(dg);
    const hold = holdUrl(dg.weekend);
    const lines = [
      `Preview: this week’s ${site.name} weekend email goes out automatically on Thursday, ${shortDate(thu)} at 8:00 AM (Pacific) to ${confirmedCount()} confirmed subscriber${confirmedCount() === 1 ? '' : 's'}.`,
      blocker ? `Heads up: ${blocker}` : `${dg.count} event${dg.count === 1 ? '' : 's'} in it. Subject: ${dg.subject}`,
      r && r.held_at ? 'This week is already on hold: it will NOT go out.' : (hold ? `Don’t want it to go out this week? Hold it here (one button, works until the end of Thursday): ${hold}` : 'To hold it, open /admin/weekend-email.'),
      `Change anything first? ${site.url}/admin/weekend-email`, '',
    ];
    const msg = wk.messageFor(dg, adminEmail(), 'preview');
    const res = await mailAdmin(`[Preview] ${dg.subject}`, lines, `<hr style="border:0;border-top:1px solid #e0d8c3;margin:18px 0">${msg.html.replace(/^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/g, '')}`);
    db.prepare('UPDATE weekend_email_auto SET preview_state = ? WHERE weekend = ?').run(res, dg.weekend);
    return `preview_${res}`;
  }

  // One short note, claimed with the decision itself so it goes once.
  async function decide(weekend, state, reason) {
    if (db.prepare('UPDATE weekend_email_auto SET send_state = ?, decided_at = CURRENT_TIMESTAMP, detail = ? WHERE weekend = ? AND send_state IS NULL').run(state, reason, weekend).changes !== 1) return null;
    const res = await mailAdmin(`Weekend email not sent this week (${shortDate(weekend)})`, [`The ${site.name} weekend email for Friday ${shortDate(weekend)} was not sent automatically: ${reason}`, '', `${site.url}/admin/weekend-email`]);
    db.prepare('UPDATE weekend_email_auto SET note_state = ? WHERE weekend = ?').run(res, weekend);
    return state;
  }

  async function send(now) {
    const dg = wk.buildDigest(now);
    const weekend = dg.weekend;
    ensure(weekend);
    let r = row(weekend);
    if (FINAL.has(r.send_state)) return r.send_state;
    if (wk.isSending()) return null; // a send by hand is running: look again next tick
    const counts = wk.sendCounts(weekend);
    if (r.send_state === null) {
      if (r.held_at) return decide(weekend, 'held', 'you put this week on hold.');
      if (counts.sent > 0) return decide(weekend, 'skipped_sent', `it was already sent this week (${counts.sent} sent by hand from the admin page).`);
      if (!dg.count) return decide(weekend, 'skipped_no_events', 'there are no events for this weekend.');
      const blocker = blockerFor(dg);
      if (blocker) return decide(weekend, 'blocked', blocker.replace(/\s*Add it in Railway, then press Send again\.|\s*Press Send again\./g, ' Fix it and send by hand from the admin page.').trim());
    }
    // Claim the send: a first try, a retry of failed addresses, or a send cut off by a restart long enough ago.
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
    const claim = db.prepare(`UPDATE weekend_email_auto SET send_state = 'sending', send_attempts = send_attempts + 1, claimed_at = ?
      WHERE weekend = ? AND send_attempts < ? AND (send_state IS NULL OR send_state = 'partial' OR (send_state = 'sending' AND claimed_at < ?))`)
      .run(now.toISOString(), weekend, MAX_SEND_ATTEMPTS, staleBefore);
    if (claim.changes !== 1) return null;
    let result;
    try { result = await wk.sendDigest({ now }); } catch (e) { result = { ok: false, error: String(e.message || e) }; }
    r = row(weekend);
    if (!result.ok) {
      db.prepare("UPDATE weekend_email_auto SET send_state = NULL WHERE weekend = ? AND send_state = 'sending'").run(weekend);
      return decide(weekend, 'blocked', result.error || 'the send could not start.');
    }
    const state = result.failed && r.send_attempts < MAX_SEND_ATTEMPTS ? 'partial' : 'sent';
    db.prepare('UPDATE weekend_email_auto SET send_state = ?, sent_at = CURRENT_TIMESTAMP, detail = ? WHERE weekend = ?')
      .run(state, `sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`, weekend);
    console.log(`[weekend-auto] ${weekend}: ${state} (sent ${result.sent}, failed ${result.failed})`);
    return state;
  }

  // Called every 15 minutes (and by tests with their own clock).
  async function tick(now = new Date()) {
    if (!enabled() || busy) return null;
    const p = pacificParts(now);
    busy = true;
    try {
      if (p.weekday === 'Wed' && p.hour >= PREVIEW_HOUR) return await preview(now);
      if (p.weekday === 'Thu' && p.hour >= SEND_HOUR) return await send(now);
      return null;
    } finally { busy = false; }
  }

  // The admin page's status line.
  function status(now = new Date()) {
    const dg = wk.buildDigest(now);
    const r = row(dg.weekend) || {};
    const thu = addDays(dg.weekend, -1), wed = addDays(dg.weekend, -2);
    const held = !!r.held_at;
    const stateText = {
      sent: 'sent automatically', partial: 'sent (some addresses failed; retrying)', sending: 'sending now', held: 'held, not sent',
      skipped_sent: 'already sent by hand', skipped_no_events: 'not sent: no events', blocked: `not sent: ${r.detail || 'blocked'}`,
    }[r.send_state] || '';
    return {
      on: enabled(), weekend: dg.weekend, held, state: r.send_state || null, preview: r.preview_state || null,
      line: enabled()
        ? `Auto-send: on — next send Thu ${shortDate(thu)} 8:00, preview Wed ${shortDate(wed)} 10:00, held: ${held ? 'yes' : 'no'}${stateText ? ` · this week: ${stateText}` : ''}`
        : 'Auto-send: off (set WEEKEND_EMAIL_AUTO=on in Railway to turn it on). Emails go out only when you press Send here.',
    };
  }
  function statusHtml(now = new Date()) {
    const s = status(now);
    const canChange = s.on && !FINAL.has(s.state) && s.state !== 'sending';
    const btn = canChange ? `<form method="post" action="/admin/weekend-email/hold" style="display:inline;margin-left:8px"><input type="hidden" name="weekend" value="${esc(s.weekend)}"><input type="hidden" name="hold" value="${s.held ? 'no' : 'yes'}"><button type="submit">${s.held ? 'Release the hold' : 'Hold this week'}</button></form>` : '';
    return `<p class="auto-status"><strong>${esc(s.line)}</strong>${btn}</p>`;
  }

  // GET/POST /weekend-email/hold/<weekend>/<sig>: the link in the Wednesday preview. GET shows one button (mail scanners
  // open links, so a GET never holds anything); POST holds. Returns true when handled.
  function handleHoldLink(req, res, pathname, method, now = new Date()) {
    const m = /^\/weekend-email\/hold\/(\d{4}-\d{2}-\d{2})\/([a-f0-9]{32})\/?$/.exec(pathname);
    if (!m) return false;
    const page = (status, title, body, extra = '') => { res.writeHead(status, wk.NOINDEX_HEADERS); res.end(require('./weekend-email').simplePage({ title, body, extra })); return true; };
    if (method !== 'GET' && method !== 'POST') { res.writeHead(405, { ...wk.NOINDEX_HEADERS, Allow: 'GET, POST' }); res.end(); return true; }
    const [, weekend, sig] = m;
    if (!holdLinkValid(weekend, sig, now)) return page(410, 'Link expired', 'This hold link has expired or is not valid. Open the admin page to see this week’s email.');
    const r = row(weekend) || {};
    if (FINAL.has(r.send_state) && r.send_state !== 'held') return page(200, 'Too late to hold', 'This week’s email has already been dealt with (sent or skipped). See the admin page for details.');
    if (method === 'GET') {
      if (r.held_at) return page(200, 'This week is on hold', `The weekend email for Friday ${shortDate(weekend)} will not go out automatically.`);
      return page(200, 'Hold this week’s email?', `The weekend email for Friday ${shortDate(weekend)} will not go out automatically on Thursday. You can still send it by hand from the admin page.`,
        `<form method="post" action="/weekend-email/hold/${esc(weekend)}/${esc(sig)}"><button type="submit">Hold this week</button></form>`);
    }
    req.resume();
    setHold(weekend, true, 'email link');
    return page(200, 'Held', `Done. The weekend email for Friday ${shortDate(weekend)} will not go out automatically. To undo it, open the admin page and press Release the hold.`);
  }

  return { tick, preview, send, status, statusHtml, setHold, holdUrl, holdSig, holdLinkValid, handleHoldLink, enabled, pacificParts, row };
}

module.exports = { create, pacificParts };
