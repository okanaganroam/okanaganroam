'use strict';
// Business portal activity (2026-11-05): how often people click "Business login" around the site, and what happens at
// the login page and inside the portal. Daily totals per step, kept in site_event_counts. Counts only: a day, a fixed
// step name, a number. No email, no business, no IP, nothing typed. Steps are counted on our server as the portal
// pages are requested, so it works without JavaScript; only the "clicked Business login" steps come from the browser.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { rateLimited } = require('./site-events');

// [key, label, group]. Keys beginning "portal_login_click" / "portal_claim_click" arrive from the browser (and are in
// site-events.js EVENTS); every other key is stored as "portal:<key>" and counted by the server.
const STEPS = [
  ['portal_login_click_menu', 'Clicked Business login in the top menu', 'Before signing in'],
  ['portal_login_click_venue_page', 'Clicked “Sign in to update this listing” on a business page', 'Before signing in'],
  ['portal_login_click_footer', 'Clicked Business login in the footer', 'Before signing in'],
  ['portal_login_click_other', 'Clicked Business login somewhere else', 'Before signing in'],
  ['portal_claim_click', 'Clicked “Claim this listing”', 'Before signing in'],
  ['claim_page_view', 'Opened a claim page', 'Claiming'],
  ['claim_submit', 'Sent a claim', 'Claiming'],
  ['login_page_view', 'Opened the login page', 'Signing in'],
  ['login_success', 'Signed in', 'Signing in'],
  ['login_failed', 'Sign-in failed (wrong email or password)', 'Signing in'],
  ['login_locked', 'Sign-in locked after too many tries', 'Signing in'],
  ['forgot_page_view', 'Opened Forgot password', 'Signing in'],
  ['forgot_submit', 'Asked for a password reset', 'Signing in'],
  ['reset_page_view', 'Opened a reset-password link', 'Signing in'],
  ['reset_submit', 'Set a new password', 'Signing in'],
  ['new_link_page_view', 'Opened “Send me a new edit link”', 'Signing in'],
  ['new_link_submit', 'Asked for a new edit link', 'Signing in'],
  ['edit_link_view', 'Opened an emailed edit link', 'Emailed edit link'],
  ['edit_link_send', 'Sent changes from an emailed edit link', 'Emailed edit link'],
  ['create_login', 'Created a login from an edit link', 'Emailed edit link'],
  ['account_view', 'Opened My listings', 'Inside the portal'],
  ['edit_page_view', 'Opened a listing’s edit page', 'Inside the portal'],
  ['edit_save', 'Saved changes to a listing', 'Inside the portal'],
  ['photo_upload', 'Uploaded a photo', 'Inside the portal'],
  ['photo_edit', 'Changed photos (remove, main photo, order, position)', 'Inside the portal'],
  ['video', 'Added a video', 'Inside the portal'],
  ['menu_page_view', 'Opened the menu page', 'Inside the portal'],
  ['menu_edit', 'Changed the menu', 'Inside the portal'],
  ['event_submit', 'Listed an event', 'Inside the portal'],
  ['event_cancel', 'Cancelled an event', 'Inside the portal'],
  ['settings_view', 'Opened Account settings', 'Inside the portal'],
  ['settings_change', 'Changed email, password or sign-outs', 'Inside the portal'],
  ['access_change', 'Changed who has access to a listing', 'Inside the portal'],
  ['help_message', 'Sent a message through the Help button', 'Inside the portal'],
  ['logout', 'Signed out', 'Inside the portal'],
];
const CLIENT_KEYS = new Set(STEPS.map((s) => s[0]).filter((k) => k.startsWith('portal_')));
const STEP_KEYS = new Set(STEPS.map((s) => s[0]));
const storedName = (key) => (CLIENT_KEYS.has(key) ? key : `portal:${key}`);

// Why a step was refused (2026-11-14): a short fixed code kept next to the "failed" count, such as "wrong_email_or_password"
// or "form_problem:contact_name". It is made from the answer's status and the NAMES of the form fields it flagged, never
// from anything typed. Stored as "portal:why:<step>:<code>" daily totals, like every other count.
const WHY_BY_STATUS = { 400: 'form_problem', 401: 'wrong_email_or_password', 403: 'not_from_our_site', 404: 'link_not_valid', 409: 'already_sent', 413: 'too_long', 415: 'wrong_type', 429: 'too_many_tries' };
function whyCode(status, data) {
  const code = Number(status) || 0;
  const base = code >= 500 ? 'server_error' : (WHY_BY_STATUS[code] || `status_${code}`);
  const errors = data && typeof data === 'object' && data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors) ? data.errors : null;
  const fields = errors ? Object.keys(errors).filter((k) => /^[a-z][a-z0-9_]{0,30}$/.test(k)).sort().slice(0, 3) : [];
  return fields.length ? `${base}:${fields.join('+')}` : base;
}
const safeWhy = (why) => (/^[a-z0-9_]{1,40}(?::[a-z0-9_+]{1,100})?$/.test(String(why)) ? String(why) : 'other');

// Which step a portal request is. Returns a key, or null for anything that isn't a step. POST steps also count a
// "<key>_failed" when the answer is an error; sign-in has its own success / failed / locked steps.
function classify(method, rawPath) {
  const p = String(rawPath || '').replace(/^\/fr(?=\/)/, '').replace(/(.)\/$/, '$1');
  const get = method === 'GET';
  const post = method === 'POST';
  if (!get && !post) return null;
  if (p === '/owner/login') return get ? 'login_page_view' : 'login';
  if (p === '/owner/forgot') return get ? 'forgot_page_view' : 'forgot_submit';
  if (p === '/owner/link') return get ? 'new_link_page_view' : 'new_link_submit';
  if (p.startsWith('/owner/reset/')) return get ? 'reset_page_view' : 'reset_submit';
  if (p === '/owner/logout') return post ? 'logout' : null;
  if (p === '/owner/help') return post ? 'help_message' : null;
  if (p === '/owner/account') return get ? 'account_view' : null;
  if (p === '/owner/account/settings') return get ? 'settings_view' : null;
  let m;
  if ((m = /^\/owner\/account\/(?:email|password|signout-others|venue\/\d+\/unlink)$/.exec(p))) return post ? 'settings_change' : null;
  if (/^\/owner\/account\/venue\/\d+\/events\/\d+\/cancel$/.test(p)) return post ? 'event_cancel' : null;
  if (/^\/owner\/account\/venue\/\d+\/(?:logins\/\d+\/remove|reset-link)$/.test(p)) return post ? 'access_change' : null;
  if (/^\/owner\/account\/venue\/\d+\/photo-position$/.test(p) || /^\/owner\/account\/venue\/\d+\/photos\/\d+\/(?:remove|main|up|down)$/.test(p)) return post ? 'photo_edit' : null;
  if (/^\/owner\/account\/venue\/\d+\/menu(?:\/[a-z0-9/]*)?$/.test(p)) return get ? (/\/menu$/.test(p) ? 'menu_page_view' : null) : 'menu_edit';
  if ((m = /^\/owner\/account\/venue\/\d+(?:\/(changes|events|photos|video\/start|video\/done))?$/.exec(p))) {
    if (get) return m[1] ? null : 'edit_page_view';
    return { changes: 'edit_save', events: 'event_submit', photos: 'photo_upload' }[m[1]] || (m[1] ? 'video' : null);
  }
  // The emailed edit link: /owner/<token> and what it posts to.
  if ((m = /^\/owner\/([A-Za-z0-9_-]+)\/(changes|events|photos|video\/start|video\/done|account)$/.exec(p)) && post) {
    return { changes: 'edit_link_send', events: 'event_submit', photos: 'photo_upload', account: 'create_login' }[m[2]] || 'video';
  }
  if (/^\/owner\/[A-Za-z0-9_-]+\/events\/\d+\/cancel$/.test(p)) return post ? 'event_cancel' : null;
  if (/^\/owner\/[A-Za-z0-9_-]+\/menu(?:\/[a-z0-9/]*)?$/.test(p)) return get ? (/\/menu$/.test(p) ? 'menu_page_view' : null) : 'menu_edit';
  if (/^\/owner\/[A-Za-z0-9_-]+$/.test(p) && get) return 'edit_link_view';
  if (/^\/claim\//.test(p)) return get ? 'claim_page_view' : null;
  if (p === '/api/claims') return post ? 'claim_submit' : null;
  return null;
}

// Link scanners (2026-11-07): mail-security tools and crawlers fetch the claim and edit-link addresses in emails, which
// inflated "Opened a claim page" and "Opened an emailed edit link". Two signs, neither of which stores anything about
// a person: real browsers always send Accept-Language, and one browser fetching more than two different claim or edit
// links in six hours is a scanner, not one owner. Only those two views are checked; the memory is a short-lived
// in-process map of a hash and a few path hashes, never written to the database.
const SCAN_STEPS = new Set(['claim_page_view', 'edit_link_view']);
const SCAN_WINDOW_MS = 6 * 3600000, SCAN_MAX_DISTINCT = 2;
const scanSeen = new Map();
function scannerLike(req, ip, pathname, now = Date.now()) {
  if (!String(req.headers['accept-language'] || '').trim()) return true;
  const hash = (t) => require('node:crypto').createHash('sha256').update(String(t)).digest('hex').slice(0, 16);
  const key = hash(`${ip}|${req.headers['user-agent'] || ''}`);
  const entry = scanSeen.get(key);
  const fresh = entry && now - entry.t < SCAN_WINDOW_MS ? entry : { t: now, paths: new Set() };
  fresh.paths.add(hash(String(pathname).replace(/^\/fr(?=\/)/, '')));
  scanSeen.set(key, fresh);
  if (scanSeen.size > 5000) for (const [k, v] of scanSeen) if (now - v.t >= SCAN_WINDOW_MS) scanSeen.delete(k);
  return fresh.paths.size > SCAN_MAX_DISTINCT;
}

function createPortalCounter(db) {
  const up = db.prepare('INSERT INTO site_event_counts (day, name, n) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET n = n + 1');
  function bump(req, name, ip, now = new Date()) {
    if (!demandEnabled() || isBot(req) || isInternal(req) || rateLimited(ip)) return false;
    up.run(dayOf(now), name);
    return true;
  }
  // Called once when a portal request arrives; counts when the answer is sent, so the outcome is known.
  function watch(req, res, method, pathname, ip) {
    const key = classify(method, pathname);
    if (!key) return;
    res.on('finish', () => {
      try {
        const code = res.statusCode;
        const why = (step) => (res.portalWhy ? safeWhy(res.portalWhy) : whyCode(code, null));
        if (key === 'login') {
          const counted = bump(req, storedName(code === 200 ? 'login_success' : code === 429 ? 'login_locked' : 'login_failed'), ip);
          if (counted && code !== 200 && code !== 429) bump(req, `portal:why:login_failed:${why()}`, ip);
          return counted;
        }
        if (method === 'GET') return code === 200 && !(SCAN_STEPS.has(key) && scannerLike(req, ip, pathname)) ? bump(req, storedName(key), ip) : false;
        const counted = bump(req, storedName(code < 400 ? key : `${key}_failed`), ip);
        if (counted && code >= 400) bump(req, `portal:why:${key}_failed:${why()}`, ip);
        return counted;
      } catch (e) { return false; } // counting must never break the portal
    });
  }

  function report(days = 30, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const list = []; for (let i = days - 1; i >= 0; i -= 1) list.push(dayOf(new Date(now.getTime() - i * 86400000)));
    const rows = db.prepare("SELECT day, name, n FROM site_event_counts WHERE day >= ? AND (name LIKE 'portal:%' OR name LIKE 'portal\\_%' ESCAPE '\\')").all(list[0]);
    const total = {}; const perDay = {};
    for (const r of rows) { total[r.name] = (total[r.name] || 0) + r.n; (perDay[r.name] = perDay[r.name] || new Map()).set(r.day, r.n); }
    const first = db.prepare("SELECT MIN(day) AS d FROM site_event_counts WHERE name LIKE 'portal:%' OR name LIKE 'portal\\_%' ESCAPE '\\'").get().d;
    const reasons = {};
    for (const [name, n] of Object.entries(total)) {
      if (!name.startsWith('portal:why:')) continue;
      const rest = name.slice('portal:why:'.length); const i = rest.indexOf(':');
      if (i > 0) (reasons[rest.slice(0, i)] = reasons[rest.slice(0, i)] || []).push({ why: rest.slice(i + 1), n });
    }
    for (const k of Object.keys(reasons)) reasons[k].sort((a, b) => b.n - a.n || a.why.localeCompare(b.why));
    const series = (key) => list.map((day) => ({ day, n: (perDay[storedName(key)] && perDay[storedName(key)].get(day)) || 0 }));
    return {
      days, since: list[0], counting_since: first || null,
      steps: STEPS.map(([key, text, group]) => ({ key, text, group, n: total[storedName(key)] || 0, failed: total[`portal:${key}_failed`] || 0, why: reasons[`${key}_failed`] || (key === 'login_failed' ? reasons.login_failed : null) || [] })),
      logins_per_day: series('login_success'),
      login_clicks_per_day: list.map((day) => ({ day, n: STEPS.filter((s) => s[0].startsWith('portal_login_click')).reduce((a, s) => a + ((perDay[s[0]] && perDay[s[0]].get(day)) || 0), 0) })),
    };
  }
  return { watch, report, bump };
}

module.exports = {
  whyCode, safeWhy, scannerLike, _resetScanMemory: () => scanSeen.clear(), STEPS, CLIENT_KEYS, STEP_KEYS, classify, createPortalCounter };
