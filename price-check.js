'use strict';
// Weekly price check (2026-11-07). Once a week the server re-reads the page each "From $X" card price came from
// (data/card-prices.json `source`) and looks for that price on it. A price still on its page is marked checked and stays
// as it is. When the page no longer shows it, shows no prices at all, or does not load, the place goes on the
// "Price checks" list on /admin/review with the prices the page shows now. Nothing on the site changes until Dayton
// decides there:
//   approve  -> the new price (and optional per / basis) goes live at once, saved in price_overrides
//   keep     -> the current price stays; the place is not listed again until the prices on its page change
//   dismiss  -> the price is taken off the card (saved as hidden in price_overrides)
// Overrides are kept in the database, so they last across deploys and win over data/card-prices.json. The fetch is
// honest about who it is (its own user agent), reads only the one page on file, follows robots.txt, and goes slowly.
const crypto = require('node:crypto');

const USER_AGENT = 'OkanaganRoamPriceCheck/1.0 (+https://okanaganroam.com/about)';
const WEEK_MS = 7 * 86400000;
// Only a likely real change goes on the review list (2026-11-08: the first run listed 141 places, 140 of them noise).
// Pages that could not be read, or whose other prices are for something else, are counted but not listed.
const FLAGGED = ['changed'];
const QUIET = ['missing', 'unreachable', 'unclear'];
const STOP_WORDS = new Set(['with', 'from', 'that', 'this', 'your', 'per', 'person', 'each', 'about', 'only', 'plus', 'gst', 'pst', 'tax', 'and', 'the', 'for', 'min', 'mins', 'hour', 'hours', 'hrs']);
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length >= 4 && !STOP_WORDS.has(w)).map((w) => w.replace(/s$/, '')));
// Rows of price_overrides an owner set themselves (reviewer 'owner'): never checked, never on the review list, and only
// replaced by the owner (or by Dayton's own decision on /admin/review).
const OWNER_REVIEWER = 'owner';
const STATUS_TEXT = {
  changed: 'The page no longer shows this price',
  missing: 'The page shows no prices (it may load them with JavaScript, or moved)',
  unreachable: 'The page did not load',
};

// Plain text of a page: no scripts, styles or tags, common entities decoded, spaces squeezed.
function pageText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#36;|&dollar;/gi, '$')
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every dollar amount on the page with a little text around it: [{ amount, context }], first 40 distinct amounts.
function extractPrices(html) {
  const text = pageText(html);
  const out = []; const seen = new Set();
  const re = /(?:\$|CAD\s?\$?)\s?(\d{1,3}(?:,\d{3})+|\d{1,5})(\.\d{1,2})?(?!\d)/g;
  let m;
  while ((m = re.exec(text)) && out.length < 40) {
    const amount = Number(m[1].replace(/,/g, '') + (m[2] || ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 50000) continue;
    const key = amount.toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);
    const context = text.slice(Math.max(0, m.index - 60), Math.min(text.length, m.index + m[0].length + 60)).trim();
    out.push({ amount, context });
  }
  return out;
}

const sameAmount = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// What a check found -> { status, found }. found is the page's prices (for the review card).
// 'changed' only when a price on the page sits next to a word from what the card price is for ("tasting", "half day",
// "rental") and is within half to double the old price. Anything else the page shows (bottles, gift boxes, fees, a
// $3,000 boat next to a $35 board) is 'unclear' and stays off the list.
function judge(expected, page, basis = '') {
  if (!page.ok) return { status: 'unreachable', found: [], detail: page.detail || 'did not load' };
  const found = extractPrices(page.body);
  if (!found.length) return { status: 'missing', found };
  if (found.some((f) => sameAmount(f.amount, expected))) return { status: 'confirmed', found };
  const want = words(basis);
  const likely = found.filter((f) => {
    const ratio = f.amount / Number(expected);
    if (!(ratio >= 0.5 && ratio <= 2)) return false;
    for (const w of words(f.context)) if (want.has(w)) return true;
    return false;
  });
  return likely.length ? { status: 'changed', found: likely } : { status: 'unclear', found };
}

// A fingerprint of the prices on a page, so "keep" stays quiet until they change.
function pricesHash(found) {
  return crypto.createHash('sha1').update(found.map((f) => f.amount.toFixed(2)).sort().join('|')).digest('hex').slice(0, 16);
}

// robots.txt: is this path disallowed for us (or for everyone)? Simple reading: our group if present, else '*'.
function robotsAllows(robotsTxt, pathname) {
  const groups = []; let cur = null;
  for (const raw of String(robotsTxt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(); const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ allow: key === 'allow', path: val });
  }
  const ours = groups.find((g) => g.agents.some((a) => a !== '*' && 'okanaganroampricecheck'.includes(a)));
  const group = ours || groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best = null;
  for (const r of group.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

function createPriceCheck({ db, prices, fetchFn = (...a) => fetch(...a), now = () => Date.now(), venueName = () => null }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS price_checks (
  venue_id INTEGER PRIMARY KEY,
  source TEXT,
  expected REAL,
  status TEXT NOT NULL,
  found TEXT,
  found_hash TEXT,
  detail TEXT,
  checked_at TEXT NOT NULL,
  kept_hash TEXT,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS price_overrides (
  venue_id INTEGER PRIMARY KEY,
  from_price REAL,
  per TEXT,
  basis TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  decided_at TEXT NOT NULL,
  reviewer TEXT
);
CREATE TABLE IF NOT EXISTS price_check_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  checked INTEGER DEFAULT 0,
  flagged INTEGER DEFAULT 0
);`);

  // The file's prices as they were before any override, so a hidden price can come back on "approve".
  const original = JSON.parse(JSON.stringify(prices));

  function applyOverrides() {
    for (const o of db.prepare('SELECT * FROM price_overrides').all()) {
      const id = String(o.venue_id);
      if (o.hidden) { delete prices[id]; continue; }
      // An owner's own price (wineries' tasting fee, 2026-11-12): it is the card price as they gave it, with no research
      // page behind it (so the weekly check never reads it). A free tasting reads "Free tasting".
      if (o.reviewer === OWNER_REVIEWER) {
        prices[id] = Number(o.from_price) === 0 ? { label: 'Free tasting', conf: 'owner', owner: true } : { from: Number(o.from_price), conf: 'owner', owner: true, ...(o.per ? { per: o.per } : {}), ...(o.basis ? { basis: o.basis } : {}) };
        continue;
      }
      const base = prices[id] || original[id] || {};
      const next = { ...base, from: o.from_price, conf: 'site' };
      if (o.per !== null && o.per !== undefined) { if (o.per) next.per = o.per; else delete next.per; }
      if (o.basis) next.basis = o.basis;
      delete next.label;
      prices[id] = next;
    }
  }
  applyOverrides();

  const iso = () => new Date(now()).toISOString();
  const robotsCache = new Map();
  let running = null;

  async function get(url, ms = 15000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetchFn(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: c.signal });
      const type = String((r.headers && r.headers.get && r.headers.get('content-type')) || '');
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      if (/pdf/i.test(type)) return { ok: false, detail: 'PDF (not read)', pdf: true };
      return { ok: true, body: (await r.text()).slice(0, 2000000) };
    } catch (e) {
      return { ok: false, detail: e.name === 'AbortError' ? 'timed out' : 'could not connect' };
    } finally { clearTimeout(t); }
  }

  async function allowed(url) {
    let u; try { u = new URL(url); } catch (e) { return false; }
    if (!robotsCache.has(u.origin)) {
      const r = await get(`${u.origin}/robots.txt`, 8000);
      robotsCache.set(u.origin, r.ok ? r.body : '');
    }
    return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
  }

  // Check one place now. Returns the saved row, or null when it has nothing to check (no price, label only, PDF).
  async function checkOne(id) {
    const e = prices[String(id)];
    if (isOwnerPrice(id)) return null;
    if (!e || !Number(e.from) || !/^https?:\/\//i.test(String(e.source || '')) || /\.pdf(\?|#|$)/i.test(e.source)) return null;
    let page;
    if (!(await allowed(e.source))) page = { ok: false, detail: 'robots.txt asks us not to read it' };
    else page = await get(e.source);
    if (page.pdf) return null;
    const { status, found, detail } = judge(e.from, page, e.basis);
    const hash = pricesHash(found);
    const prev = db.prepare('SELECT kept_hash FROM price_checks WHERE venue_id = ?').get(Number(id));
    db.prepare(`INSERT INTO price_checks (venue_id, source, expected, status, found, found_hash, detail, checked_at, kept_hash, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(venue_id) DO UPDATE SET source = excluded.source, expected = excluded.expected, status = excluded.status, found = excluded.found,
        found_hash = excluded.found_hash, detail = excluded.detail, checked_at = excluded.checked_at`)
      .run(Number(id), e.source, Number(e.from), status, JSON.stringify(found.slice(0, 40)), hash, detail || null, iso(), prev ? prev.kept_hash : null);
    return db.prepare('SELECT * FROM price_checks WHERE venue_id = ?').get(Number(id));
  }

  // Check every priced place, a few at a time with a pause between pages.
  function runAll({ concurrency = 3, pauseMs = 1500 } = {}) {
    if (running) return running;
    running = (async () => {
      const run = db.prepare('INSERT INTO price_check_runs (started_at) VALUES (?)').run(iso()).lastInsertRowid;
      // The weekly check skips owners' own prices (Decided 1, 2026-11-12).
      const ids = Object.keys(prices).filter((k) => /^\d+$/.test(k) && !isOwnerPrice(k));
      let i = 0; let checked = 0;
      const work = async () => {
        while (i < ids.length) {
          const id = ids[i++];
          try { if (await checkOne(id)) checked++; } catch (e) { console.error('[price-check]', id, e.message); }
          if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
        }
      };
      await Promise.all(Array.from({ length: concurrency }, work));
      const flagged = listFlagged().length;
      db.prepare('UPDATE price_check_runs SET finished_at = ?, checked = ?, flagged = ? WHERE id = ?').run(iso(), checked, flagged, run);
      console.log(`[price-check] checked ${checked} prices, ${flagged} waiting on /admin/review`);
      return { checked, flagged };
    })().finally(() => { running = null; });
    return running;
  }

  // How many priced places the last check could not judge (unreadable page, blocked, or only other prices on it).
  function quietCount() {
    return db.prepare(`SELECT COUNT(*) AS n FROM price_checks WHERE status IN (${QUIET.map(() => '?').join(',')})`).get(...QUIET).n;
  }

  function lastRun() { return db.prepare('SELECT * FROM price_check_runs ORDER BY id DESC LIMIT 1').get() || null; }

  // Called by the server's 15-minute timer: starts a full check when the last one began more than a week ago.
  function tick() {
    const last = lastRun();
    if (running || (last && now() - Date.parse(last.started_at) < WEEK_MS)) return null;
    return runAll();
  }

  // Places waiting for a decision: not confirmed, still priced, and not "kept" with the same prices on the page.
  function listFlagged() {
    return db.prepare(`SELECT * FROM price_checks WHERE status IN (${FLAGGED.map(() => '?').join(',')})
      AND (kept_hash IS NULL OR kept_hash != found_hash) ORDER BY CASE status WHEN 'changed' THEN 0 WHEN 'missing' THEN 1 ELSE 2 END, venue_id`)
      .all(...FLAGGED)
      .filter((r) => prices[String(r.venue_id)] && !isOwnerPrice(r.venue_id))
      .map((r) => ({ ...r, found: JSON.parse(r.found || '[]'), name: venueName(r.venue_id), current: prices[String(r.venue_id)] }));
  }

  // One decision from /admin/review -> { status, body }.
  function decide(id, act, body = {}, reviewer = 'dayton') {
    const row = db.prepare('SELECT * FROM price_checks WHERE venue_id = ?').get(Number(id));
    if (!row) return { status: 404, body: { error: 'Not on the price check list.' } };
    const edits = (body && body.edits) || {};
    if (act === 'keep') {
      db.prepare('UPDATE price_checks SET kept_hash = found_hash, decided_at = ? WHERE venue_id = ?').run(iso(), Number(id));
      return { status: 200, body: { ok: true } };
    }
    if (act === 'dismiss') {
      db.prepare(`INSERT INTO price_overrides (venue_id, from_price, per, basis, hidden, decided_at, reviewer) VALUES (?, NULL, NULL, NULL, 1, ?, ?)
        ON CONFLICT(venue_id) DO UPDATE SET hidden = 1, decided_at = excluded.decided_at, reviewer = excluded.reviewer`).run(Number(id), iso(), reviewer);
      db.prepare('UPDATE price_checks SET decided_at = ? WHERE venue_id = ?').run(iso(), Number(id));
      applyOverrides();
      return { status: 200, body: { ok: true } };
    }
    if (act === 'approve') {
      const cur = prices[String(id)] || original[String(id)] || {};
      const from = Number(String(edits.from != null ? edits.from : cur.from).replace(/[$,\s]/g, ''));
      if (!Number.isFinite(from) || from <= 0 || from > 50000) return { status: 400, body: { error: 'Type the new price as a number, like 25 or 24.50.' } };
      const per = edits.per != null ? String(edits.per).trim().slice(0, 40) : (cur.per || '');
      const basis = edits.basis != null ? String(edits.basis).trim().slice(0, 200) : (cur.basis || '');
      db.prepare(`INSERT INTO price_overrides (venue_id, from_price, per, basis, hidden, decided_at, reviewer) VALUES (?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(venue_id) DO UPDATE SET from_price = excluded.from_price, per = excluded.per, basis = excluded.basis, hidden = 0,
          decided_at = excluded.decided_at, reviewer = excluded.reviewer`).run(Number(id), from, per, basis || null, iso(), reviewer);
      // The new price is now what the page shows, so the place drops off the list.
      db.prepare("UPDATE price_checks SET expected = ?, status = 'confirmed', decided_at = ? WHERE venue_id = ?").run(from, iso(), Number(id));
      applyOverrides();
      return { status: 200, body: { ok: true } };
    }
    return { status: 400, body: { error: 'Unknown action.' } };
  }

  // The review card. esc = the page's HTML escaper, editBox = the shared editable box, actions = the shared buttons row.
  function cardHtml(r, { esc, editBox }) {
    const cur = r.current || {};
    const money = (n) => `$${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`;
    const found = r.found.length
      ? `<ul class="rv-meta">${r.found.slice(0, 12).map((f) => `<li><strong>${money(f.amount)}</strong>: …${esc(f.context)}…</li>`).join('')}</ul>`
      : '';
    return `<article class="rv-card" data-kind="price" data-id="${r.venue_id}">
      <h3>${esc(r.name || `Venue #${r.venue_id}`)}</h3>
      <p><strong>${esc(STATUS_TEXT[r.status] || r.status)}</strong>${r.detail ? ` (${esc(r.detail)})` : ''}. Checked ${esc(String(r.checked_at).slice(0, 10))}.</p>
      <p>On the card now: <strong>${money(cur.from)}${cur.per ? ` / ${esc(cur.per)}` : ''}</strong>${cur.basis ? ` (${esc(cur.basis)})` : ''}. <a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Open the page</a></p>
      ${found ? `<p>Prices on the page now:</p>${found}` : ''}
      <table class="rv-table"><tr><th>New price</th><td>${editBox('from', cur.from)}</td></tr>
      <tr><th>Per (optional)</th><td>${editBox('per', cur.per || '')}</td></tr>
      <tr><th>What it is</th><td>${editBox('basis', cur.basis || '')}</td></tr></table>
      <div class="rv-actions"><button type="button" class="rv-btn rv-approve" data-act="approve">Use the new price</button>
      <button type="button" class="rv-btn" data-act="keep" title="Leaves the card as it is; asks again only if the page's prices change">Still right, keep it</button>
      <button type="button" class="rv-btn rv-reject" data-act="dismiss" title="Takes the price off the card">Take the price off</button></div>
      <p class="rv-result" hidden></p></article>`;
  }

  // Is this place's card price the owner's own? (price_overrides row with reviewer 'owner')
  function isOwnerPrice(id) {
    try { const r = db.prepare('SELECT reviewer, hidden FROM price_overrides WHERE venue_id = ?').get(Number(id)); return !!r && r.reviewer === OWNER_REVIEWER && !r.hidden; } catch (e) { return false; }
  }
  // An owner sets (fee: dollars, 0 = free) or takes back (fee: null) their own card price. Taken back, the card shows
  // the researched price again (the file's, as it was before any override).
  // Breweries (2026-11-12): fee 'hidden' is the owner's "We don't do flights": no card price at all (hidden, reviewer
  // 'owner'), taken back like an owner price.
  function ownerHidden(id) {
    try { const r = db.prepare('SELECT reviewer, hidden FROM price_overrides WHERE venue_id = ?').get(Number(id)); return !!r && r.reviewer === OWNER_REVIEWER && !!r.hidden; } catch (e) { return false; }
  }
  function setOwnerPrice(id, fee, basis = null) {
    const key = String(Number(id));
    if (fee === 'hidden') {
      db.prepare(`INSERT INTO price_overrides (venue_id, from_price, per, basis, hidden, decided_at, reviewer) VALUES (?, 0, NULL, NULL, 1, ?, ?)
        ON CONFLICT(venue_id) DO UPDATE SET from_price = 0, per = NULL, basis = NULL, hidden = 1, decided_at = excluded.decided_at, reviewer = excluded.reviewer`).run(Number(id), iso(), OWNER_REVIEWER);
      applyOverrides();
      return;
    }
    if (fee === null || fee === undefined) {
      if (!isOwnerPrice(id) && !ownerHidden(id)) return;
      db.prepare('DELETE FROM price_overrides WHERE venue_id = ? AND reviewer = ?').run(Number(id), OWNER_REVIEWER);
      if (original[key]) prices[key] = JSON.parse(JSON.stringify(original[key])); else delete prices[key];
      applyOverrides();
      return;
    }
    db.prepare(`INSERT INTO price_overrides (venue_id, from_price, per, basis, hidden, decided_at, reviewer) VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(venue_id) DO UPDATE SET from_price = excluded.from_price, per = excluded.per, basis = excluded.basis, hidden = 0,
        decided_at = excluded.decided_at, reviewer = excluded.reviewer`).run(Number(id), Number(fee), null, basis || null, iso(), OWNER_REVIEWER);
    applyOverrides();
  }
  return { runAll, tick, checkOne, listFlagged, decide, cardHtml, lastRun, quietCount, isRunning: () => !!running, applyOverrides, setOwnerPrice, isOwnerPrice };
}

module.exports = { createPriceCheck, extractPrices, judge, robotsAllows, pageText, USER_AGENT };
