'use strict';
// Owner dashboard: Commissions (2026-11-21, Dayton). Every affiliate program on both sites in one place: is it on, how many
// taps we sent it (commissions.js, our own counts), and what it says we earned -- typed in by hand once a month from each
// partner's own dashboard, since no partner sends it to us. Admin only (signed-in, same-site POST), noindex like every
// dashboard page. The earnings live in commission_earnings (db.js) on Okanagan Roam only, for both sites.
const { layout, askFor } = require('./dashboard-layout');
const { esc, num } = require('./dashboard-page');
const { lessonHtml } = require('./dashboard-learn');
const { dayOf } = require('./trip-demand');
const C = require('./commissions');

const CURRENCIES = ['CAD', 'USD'];
const STATUSES = [['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid']];
const STATUS_KEYS = STATUSES.map(([k]) => k);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const thisMonth = (now = new Date()) => dayOf(now).slice(0, 7);
const prevMonth = (m) => { const y = Number(m.slice(0, 4)); const n = Number(m.slice(5, 7)); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, '0')}`; };

// Money: amounts are kept in cents per currency, and never added across currencies.
const SIGN = { CAD: 'CA$', USD: 'US$' };
const money = (cents, cur) => `${SIGN[cur] || ''}${(Math.round(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyAll = (byCur) => { const parts = CURRENCIES.filter((c) => byCur && byCur[c]).map((c) => money(byCur[c], c)); return parts.length ? parts.join(' + ') : '$0'; };
const addTo = (o, cur, cents) => { o[cur] = (o[cur] || 0) + cents; };

// A form line, checked. Returns { ok: true, line } or { ok: false, error } with a plain reason.
function validate(f) {
  const month = String(f.month || '').trim();
  const program = String(f.program || '').trim();
  const site = String(f.site || '').trim();
  const p = C.byKey(program);
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: 'month' };
  if (!p) return { ok: false, error: 'program' };
  if (!C.SITES.includes(site)) return { ok: false, error: 'site' };
  if (!p.sites.includes(site)) return { ok: false, error: 'program_site' };
  const b = String(f.bookings == null ? '' : f.bookings).trim();
  if (b && !/^\d{1,6}$/.test(b)) return { ok: false, error: 'bookings' };
  const a = String(f.amount == null ? '' : f.amount).trim().replace(/[$,\s]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(a)) return { ok: false, error: 'amount' };
  const currency = String(f.currency || '').trim().toUpperCase();
  if (!CURRENCIES.includes(currency)) return { ok: false, error: 'currency' };
  const status = String(f.status || '').trim();
  if (!STATUS_KEYS.includes(status)) return { ok: false, error: 'status' };
  const note = String(f.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  return { ok: true, line: { month, program, site, bookings: b ? Number(b) : null, amount_cents: Math.round(Number(a) * 100), currency, status, note: note || null } };
}
const ERRORS = {
  month: 'Pick the month the earnings are for.', program: 'Pick a program.', site: 'Pick a site.', program_site: 'That program doesn’t run on that site.',
  bookings: 'Bookings must be a whole number (or leave it empty).', amount: 'Type the amount as a number, like 42.50.', currency: 'Pick CAD or USD.', status: 'Pick pending, approved or paid.',
};

function createEarnings(db) {
  const list = () => db.prepare('SELECT * FROM commission_earnings ORDER BY month DESC, program, site').all();
  function save(form) {
    const v = validate(form || {});
    if (!v.ok) return v;
    const l = v.line;
    db.prepare(`INSERT INTO commission_earnings (month, program, site, bookings, amount_cents, currency, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month, program, site) DO UPDATE SET bookings = excluded.bookings, amount_cents = excluded.amount_cents, currency = excluded.currency,
      status = excluded.status, note = excluded.note, updated_at = CURRENT_TIMESTAMP`).run(l.month, l.program, l.site, l.bookings, l.amount_cents, l.currency, l.status, l.note);
    return { ok: true, line: l };
  }
  function remove(id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return false;
    return db.prepare('DELETE FROM commission_earnings WHERE id = ?').run(n).changes > 0;
  }
  return { list, save, remove, totals: (now) => totals(list(), now) };
}

// Totals from the lines: this month, last month, all time, waiting (pending + approved) and paid, overall and by program,
// and each program's progress to its payout minimum (unpaid lines in the minimum's currency, both sites together).
function totals(rows, now = new Date()) {
  const m = thisMonth(now); const pm = prevMonth(m);
  const blank = () => ({ month: {}, last: {}, all: {}, pending: {}, approved: {}, paid: {}, bookings: 0 });
  const all = blank(); const programs = Object.fromEntries(C.PROGRAM_KEYS.map((k) => [k, blank()]));
  for (const r of rows) {
    for (const t of [all, programs[r.program]].filter(Boolean)) {
      addTo(t.all, r.currency, r.amount_cents);
      if (r.month === m) addTo(t.month, r.currency, r.amount_cents);
      if (r.month === pm) addTo(t.last, r.currency, r.amount_cents);
      addTo(t[r.status] || t.pending, r.currency, r.amount_cents);
      t.bookings += r.bookings || 0;
    }
  }
  const progress = {};
  for (const p of C.PROGRAMS) {
    if (!p.minimum) continue;
    const t = programs[p.key];
    const have = (t.pending[p.minimum.currency] || 0) + (t.approved[p.minimum.currency] || 0);
    progress[p.key] = { have, need: p.minimum.amount * 100, currency: p.minimum.currency, pct: Math.min(100, Math.round((have / (p.minimum.amount * 100)) * 100)) };
  }
  const waiting = {}; for (const c of CURRENCIES) { const n = (all.pending[c] || 0) + (all.approved[c] || 0); if (n) waiting[c] = n; }
  return { month: m, last_month: pm, all, programs, progress, waiting };
}

// ---- The page ----
const STATE = { live: ['Live', 'live'], waiting: ['Applied – waiting', 'wait'], off: ['Off', 'off'], na: ['Not on this site', 'na'] };
const pill = (siteName, st) => { const s = STATE[st.state] || STATE.off; return `<span class="cm-pill cm-${s[1]}" title="${esc(st.note || '')}"><small>${esc(siteName)}</small> ${esc(s[0])}</span>`; };
function change(cur, prev) {
  if (!prev && !cur) return '<span class="chip">none yet</span>';
  if (!prev) return '<span class="chip">new</span>';
  if (cur === prev) return '<span class="chip">same</span>';
  const up = cur > prev; const pct = Math.round((Math.abs(cur - prev) / prev) * 100);
  return `<span class="chip ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${pct}%</span>`;
}

const CSS = `<style>
.cm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px}
.cm-card h3{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 2px}.cm-what{margin:0 0 8px;color:var(--mute);font-size:.9rem}
.cm-pills{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.cm-pill{font-size:.8rem;font-weight:800;border-radius:99px;padding:3px 10px;background:var(--line);color:var(--mute)}.cm-pill small{font-weight:700;opacity:.8}
.cm-live{background:var(--good-soft);color:var(--good)}.cm-wait{background:var(--warn-soft);color:var(--warn)}.cm-na{background:none;border:1px dashed var(--line)}
.cm-terms{font-size:.88rem;margin:0 0 8px}.cm-note{font-size:.82rem;color:var(--warn);margin:0 0 8px}
.cm-link{display:block;width:fit-content;font-weight:800;font-size:.88rem;text-decoration:none;margin-bottom:8px}
.cm-card table td:not(:first-child),.cm-card table th:not(:first-child){text-align:right;white-space:nowrap}
.hb{margin:10px 0 0}.hb-r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;font-size:.82rem;margin-top:5px}.hb-t{height:8px;border-radius:99px;background:var(--line);grid-column:1/-1;position:relative;overflow:hidden}.hb-f{position:absolute;inset:0 auto 0 0;border-radius:99px;background:linear-gradient(90deg,var(--g1),var(--g2))}
.cm-min{margin-top:10px;font-size:.84rem}.cm-min .track{margin:4px 0 0}
.cm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px 12px;align-items:end}
.cm-form label{display:flex;flex-direction:column;gap:3px;font-size:.8rem;font-weight:800;color:var(--mute)}
.cm-form input,.cm-form select{font:600 .95rem Nunito,system-ui,sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:8px 10px;min-height:40px;width:100%}
.cm-form .wide{grid-column:1/-1}button.cm-del[type=submit],.cm-del{background:none;border:0;color:var(--warn);font:700 .82rem Nunito,system-ui,sans-serif;cursor:pointer;padding:0}
.cm-notice{font-weight:800;padding:10px 14px;border-radius:12px;background:var(--good-soft);color:var(--good)}.cm-notice.bad{background:var(--warn-soft);color:var(--warn)}
</style>`;

function siteClicks(s, key) { return s.data && s.data.clicks && s.data.clicks.programs ? s.data.clicks.programs[key] || null : null; }
function siteState(s, key) { return s.data && s.data.status ? s.data.status[key] : null; }

function programCard(p, sites, t) {
  const on = sites.filter((s) => p.sites.includes(s.key));
  const pills = on.map((s) => (s.error || !s.data ? `<span class="cm-pill"><small>${esc(s.name)}</small> not connected</span>` : pill(s.name, siteState(s, p.key) || { state: 'off' }))).join('');
  const notes = on.map((s) => { const st = siteState(s, p.key); return st && st.note ? `<p class="cm-note">${esc(s.name)}: ${esc(st.note)}</p>` : ''; }).join('');
  const rows = on.map((s) => { const c = siteClicks(s, p.key); return c ? `<tr><td>${esc(s.name)}</td><td><b>${num(c.d7)}</b></td><td>${change(c.d7, c.p7)}</td><td>${num(c.d30)}</td></tr>` : `<tr><td>${esc(s.name)}</td><td>–</td><td></td><td>–</td></tr>`; }).join('');
  const surf = {}; let bmt7 = 0; let bmt30 = 0;
  for (const s of on) { const c = siteClicks(s, p.key); if (!c) continue; for (const [k, n] of Object.entries(c.surfaces || {})) surf[k] = (surf[k] || 0) + n; bmt7 += c.bmt7 || 0; bmt30 += c.bmt30 || 0; }
  const max = Math.max(0, ...Object.values(surf));
  const bars = max ? `<div class="hb"><b style="font-size:.84rem">Where the taps came from (last 30 days)</b>${C.SURFACES.filter(([k]) => surf[k]).sort((a, b) => surf[b[0]] - surf[a[0]]).map(([k, label]) => `<div class="hb-r"><span>${esc(label)}</span><b>${num(surf[k])}</b><div class="hb-t"><div class="hb-f" style="width:${Math.max(4, Math.round((surf[k] / max) * 100))}%"></div></div></div>`).join('')}</div>` : '';
  const bmt = ['stay', 'viator', 'fever', 'discovercars'].includes(p.key) ? `<p class="empty" style="margin-top:8px">Build My Trip’s booking list on its own: ${num(bmt7)} taps in 7 days, ${num(bmt30)} in 30.</p>` : '';
  const pt = t.programs[p.key]; const pr = t.progress[p.key];
  const earned = `<p class="cm-min">Entered so far: <b>${esc(moneyAll(pt.all))}</b>${pt.bookings ? ` from ${num(pt.bookings)} booking${pt.bookings === 1 ? '' : 's'}` : ''} · paid ${esc(moneyAll(pt.paid))}</p>`;
  const min = pr ? `<div class="cm-min">Payout minimum: ${esc(money(pr.have, pr.currency))} of ${esc(money(pr.need, pr.currency))} waiting to be paid<div class="track"><div class="fill" style="width:${pr.pct}%"></div></div></div>` : '';
  return `<div class="card cm-card"><h3>${esc(p.name)}</h3><p class="cm-what">${esc(p.what)}</p>
    <div class="cm-pills">${pills}</div>${notes}
    <p class="cm-terms">${esc(p.terms)}</p>
    ${p.dashboard ? `<a class="cm-link" href="${esc(p.dashboard)}" target="_blank" rel="noopener">Open the ${esc(p.name)} dashboard ↗</a>` : '<p class="empty">Partner dashboard: not known yet.</p>'}
    <p style="margin:6px 0 0;font-size:.84rem;font-weight:800">Taps we sent</p><div class="tw"><table><tr><th>Site</th><th>7 days</th><th>Change</th><th>30 days</th></tr>${rows}</table></div>
    ${bars}${bmt}${earned}${min}</div>`;
}

function earningsSection(rows, t, now) {
  const m = t.month;
  const progRows = C.PROGRAMS.map((p) => { const x = t.programs[p.key]; return `<tr><td>${esc(p.name)}</td><td>${esc(moneyAll(x.month))}</td><td>${esc(moneyAll(x.last))}</td><td>${esc(moneyAll(x.all))}</td><td>${esc(moneyAll({ CAD: (x.pending.CAD || 0) + (x.approved.CAD || 0), USD: (x.pending.USD || 0) + (x.approved.USD || 0) }))}</td><td>${esc(moneyAll(x.paid))}</td></tr>`; }).join('');
  const opt = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const lineRows = rows.map((r) => { const p = C.byKey(r.program); return `<tr><td style="white-space:nowrap">${esc(monthName(r.month))}</td><td>${esc(p ? p.name : r.program)}</td><td>${esc(C.SITE_NAMES[r.site] || r.site)}</td><td>${r.bookings == null ? '–' : num(r.bookings)}</td><td><b>${esc(money(r.amount_cents, r.currency))}</b></td><td>${esc(r.status)}</td><td>${esc(r.note || '')}</td><td><form method="post" action="/admin/dashboard/commissions/delete" onsubmit="return confirm('Delete this line?')"><input type="hidden" name="id" value="${r.id}"><button class="cm-del" type="submit">Delete</button></form></td></tr>`; }).join('');
  return `<h2 class="sec" id="earnings">Earnings <small>typed in from each partner’s own dashboard</small></h2>
  <div class="card"><h3>Totals <small>by program; CAD and USD kept apart</small></h3>
    <div class="tw"><table><tr><th>Program</th><th>${esc(monthName(m))}</th><th>${esc(monthName(t.last_month))}</th><th>All time</th><th>Waiting</th><th>Paid</th></tr>${progRows}
    <tr><td><b>All programs</b></td><td><b>${esc(moneyAll(t.all.month))}</b></td><td><b>${esc(moneyAll(t.all.last))}</b></td><td><b>${esc(moneyAll(t.all.all))}</b></td><td><b>${esc(moneyAll(t.waiting))}</b></td><td><b>${esc(moneyAll(t.all.paid))}</b></td></tr></table></div></div>
  <div class="card"><h3>Add or update a month</h3>
    <p class="empty">Once a month, open each partner’s dashboard and copy its numbers here. Saving the same month, program and site again replaces that line. Status: pending = booked but not confirmed yet; approved = confirmed, not paid yet; paid = the money arrived.</p>
    <form class="cm-form" method="post" action="/admin/dashboard/commissions/save">
      <label>Month<input type="month" name="month" value="${esc(m)}" required></label>
      <label>Program<select name="program" required>${opt(C.PROGRAMS.map((p) => [p.key, p.name]), 'stay')}</select></label>
      <label>Site<select name="site" required>${opt(C.SITES.map((s) => [s, C.SITE_NAMES[s]]), 'okanagan')}</select></label>
      <label>Bookings<input type="number" name="bookings" min="0" step="1" inputmode="numeric" placeholder="optional"></label>
      <label>Commission<input type="text" name="amount" inputmode="decimal" placeholder="42.50" required></label>
      <label>Currency<select name="currency">${opt(CURRENCIES.map((c) => [c, c]), 'CAD')}</select></label>
      <label>Status<select name="status">${opt(STATUSES, 'pending')}</select></label>
      <label class="wide">Note<input type="text" name="note" maxlength="200" placeholder="optional, e.g. 2 stays in Kelowna"></label>
      <div><button type="submit">Save this line</button></div>
    </form></div>
  <div class="card"><h3>All lines <small>${num(rows.length)}</small></h3>${rows.length ? `<div class="tw"><table><tr><th>Month</th><th>Program</th><th>Site</th><th>Bookings</th><th>Commission</th><th>Status</th><th>Note</th><th></th></tr>${lineRows}</table></div>` : '<p class="empty">Nothing entered yet. Partners usually show the first bookings a few weeks after the first clicks.</p>'}</div>`;
}

const NOTICES = { saved: ['Saved.', false], deleted: ['Deleted.', false], not_found: ['That line was already gone.', true] };

// sites: [{ key, name, data: siteReport | null, error }], rows: the earnings lines.
function renderCommissionsPage({ sites, rows, notice = '', now = new Date() }) {
  const t = totals(rows, now);
  const sum = (f) => sites.reduce((a, s) => a + (s.data && s.data.clicks ? Object.values(s.data.clicks.programs).reduce((b, c) => b + f(c), 0) : 0), 0);
  const d7 = sum((c) => c.d7); const p7 = sum((c) => c.p7);
  const n = NOTICES[notice] || (notice.startsWith('error_') && ERRORS[notice.slice(6)] ? [`Not saved: ${ERRORS[notice.slice(6)]}`, true] : null);
  const tiles = `<div class="tiles">
    <div class="tile"><p class="t">Taps on commission links</p><p class="big">${num(d7)}</p>${change(d7, p7)} <span class="chip">last 7 days</span><p class="why">Both sites, every partner. A tap is not a booking.</p></div>
    <a class="tile" href="#earnings"><p class="t">Earned in ${esc(monthName(t.month))}</p><p class="big">${esc(moneyAll(t.all.month))}</p><p class="why">From the lines you’ve entered.</p></a>
    <a class="tile" href="#earnings"><p class="t">Waiting to be paid</p><p class="big">${esc(moneyAll(t.waiting))}</p><p class="why">Pending and approved, not paid yet.</p></a>
    <a class="tile" href="#earnings"><p class="t">Paid so far</p><p class="big">${esc(moneyAll(t.all.paid))}</p><p class="why">Money that has arrived, all time.</p></a></div>`;
  const errs = sites.filter((s) => s.error).map((s) => `<p class="status bad"><span class="dot"></span>${esc(s.name)}: ${esc(s.error)}</p>`).join('');
  const since = sites.map((s) => s.data && s.data.clicks && s.data.clicks.since).filter(Boolean).sort()[0];
  const body = `${CSS}${n ? `<p class="cm-notice${n[1] ? ' bad' : ''}">${esc(n[0])}</p>` : ''}${errs}${tiles}
    <h2 class="sec">Partners <small>${since ? `taps counted on every page since ${esc(since)}` : 'taps are counted on every page from the next deploy on'}</small></h2>
    <div class="cm-grid">${C.PROGRAMS.map((p) => programCard(p, sites, t)).join('')}</div>
    ${lessonHtml('commission')}
    ${earningsSection(rows, t, now)}`;
  return layout({
    active: 'commissions', title: 'Commissions', ask: askFor('commissions'),
    tells: 'Every partner that can pay us a commission, on both sites: whether it is switched on, how many taps we sent it, and the money it says we earned.',
    use: 'Taps are only the start. Once a month, copy each partner’s earnings from its own dashboard into the form at the bottom, and change the line to paid when the money arrives.',
    body,
  });
}

// For Home and the Monday email: what was entered for this month, as one short text.
function monthLine(rows, now = new Date()) { const t = totals(rows, now); return { month: monthName(t.month), earned: moneyAll(t.all.month), waiting: moneyAll(t.waiting) }; }

module.exports = { createEarnings, validate, totals, renderCommissionsPage, monthLine, money, moneyAll, ERRORS, CURRENCIES, STATUS_KEYS };

// A small urlencoded form body (the earnings form), capped at 4 KB.
function readForm(req, max = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []; let done = false;
    req.on('data', (c) => { if (done) return; size += c.length; if (size > max) { done = true; req.resume(); reject(Object.assign(new Error('too_large'), { status: 413 })); } else chunks.push(c); });
    req.on('end', () => { if (done) return; done = true; if (!/^application\/x-www-form-urlencoded\b/i.test(String(req.headers['content-type'] || ''))) return resolve(null); resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))); });
    req.on('error', reject);
  });
}
module.exports.readForm = readForm;
