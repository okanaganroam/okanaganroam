'use strict';
// Build My Trip funnel (2026-11-21, Dayton): how many visits to the planner got a plan, swapped, removed, confirmed,
// opened "Book my trip", clicked each kind of booking link (a stay and Viator earn commission), shared and saved --
// for the new simple page (V4) and the old one (/trip?v=3) side by side.
//
// Built on the site's own daily counts (site-events.js, table site_event_counts): the page sends a fixed event name with
// navigator.sendBeacon to POST /api/site-event, which keeps a day, the name and a number. Nothing else: no visitor id,
// no IP, no words typed, no business (a booking link's business is used only to tell a tasting from a table, then
// dropped). Bots, our own scripts (okanaganroam-check, whistlerroam-...) and the roam_internal cookie are left out
// there, as for every other count.
//
// Each step counts once per page visit (a visit that swapped three stops is one "swapped"), so the steps read as
// "visits that did this". Booking-link clicks and share methods are also counted per tap, by kind.
const { dayOf } = require('./trip-demand');

const VERSIONS = ['v4', 'v3'];
// [step, label, in the main path]: the main path is plan -> confirm -> book_open -> book_click; the rest are side actions.
const STEPS = [
  ['plan', 'Got a plan', true],
  ['swap', 'Swapped a stop', false],
  ['remove', 'Removed a stop', false],
  ['confirm', 'Confirmed the plan', true],
  ['book_open', 'Opened “Book my trip”', true],
  ['book_click', 'Clicked a booking link', true],
  ['share', 'Shared the trip', false],
  ['save', 'Saved it to My Trip', false],
];
// The old page has no Confirm button and no Book my trip sheet (its bookings sit in the plan).
const NOT_ON = { v3: ['confirm', 'book_open'] };
const BOOK_TYPES = [
  ['stay', 'Place to stay (Stay22 and other stay links)', true],
  ['viator', 'Viator tour or activity', true],
  ['tasting', 'Winery, brewery or distillery tasting', false],
  ['reservation', 'Restaurant, pub, café or bar reservation', false],
  ['other', 'Other booking link', false],
];
const SHARE_METHODS = [['native', 'Phone share sheet'], ['copy', 'Copied the link']];

const NAMES = [];
for (const v of VERSIONS) {
  for (const [s] of STEPS) if (!(NOT_ON[v] || []).includes(s)) NAMES.push(`bmt:${v}:${s}`);
  for (const [b] of BOOK_TYPES) NAMES.push(`bmt:${v}:book:${b}`);
  for (const [m] of SHARE_METHODS) NAMES.push(`bmt:${v}:share:${m}`);
}

const TASTING = new Set(['winery', 'brewery', 'distillery', 'cidery', 'meadery']);
const TABLE = new Set(['restaurant', 'pub', 'cafe', 'cocktail', 'bar', 'lounge', 'bistro']);
function bookTypeFor(venueType) {
  const t = String(venueType || '').toLowerCase();
  return TASTING.has(t) ? 'tasting' : TABLE.has(t) ? 'reservation' : 'other';
}
// The page sends bmt:<v>:book:venue with the business id for a business's own booking link; this turns it into
// tasting / reservation / other from the business's type. Any other name passes through unchanged.
function resolveName(name, venueId, typeOf) {
  const m = /^bmt:(v3|v4):book:venue$/.exec(String(name || ''));
  if (!m) return name;
  let type = null;
  const id = Number(venueId);
  if (Number.isInteger(id) && id > 0 && typeof typeOf === 'function') { try { type = typeOf(id); } catch (e) { type = null; } }
  return `bmt:${m[1]}:book:${bookTypeFor(type)}`;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const dayList = (days, now) => { const out = []; for (let i = days - 1; i >= 0; i -= 1) out.push(dayOf(new Date(now.getTime() - i * 86400000))); return out; };

// One report for the dashboard: totals per version, conversion between the main steps, booking kinds, share methods,
// plans and booking taps per day, and a week-by-week table (both pages added together).
function report(db, days = 30, now = new Date()) {
  const dl = dayList(days, now);
  const since = dl[0];
  const rows = db.prepare("SELECT day, name, n FROM site_event_counts WHERE day >= ? AND name LIKE 'bmt:%'").all(since);
  const tot = {}; const perDay = {};
  for (const r of rows) { tot[r.name] = (tot[r.name] || 0) + r.n; (perDay[r.name] = perDay[r.name] || new Map()).set(r.day, r.n); }
  const g = (k) => tot[k] || 0;
  const versions = {};
  for (const v of VERSIONS) {
    const off = NOT_ON[v] || [];
    const plans = g(`bmt:${v}:plan`);
    let prev = null;
    const steps = STEPS.map(([key, text, main]) => {
      if (off.includes(key)) return { key, text, main, n: null, of_previous: null, of_plans: null };
      const n = g(`bmt:${v}:${key}`);
      const s = { key, text, main, n, of_previous: main && prev !== null ? pct(n, prev) : null, of_plans: key === 'plan' ? null : pct(n, plans) };
      if (main) prev = n;
      return s;
    });
    const book = BOOK_TYPES.map(([key, text, commission]) => ({ key, text, commission, n: g(`bmt:${v}:book:${key}`) }));
    const share = SHARE_METHODS.map(([key, text]) => ({ key, text, n: g(`bmt:${v}:share:${key}`) }));
    const total = steps.reduce((a, s) => a + (s.n || 0), 0) + book.reduce((a, b) => a + b.n, 0);
    versions[v] = { steps, book, share, book_taps: book.reduce((a, b) => a + b.n, 0), commission_taps: book.filter((b) => b.commission).reduce((a, b) => a + b.n, 0), any: total > 0 };
  }
  const sumDay = (suffixes, day) => VERSIONS.reduce((a, v) => a + suffixes.reduce((b, s) => b + ((perDay[`bmt:${v}:${s}`] && perDay[`bmt:${v}:${s}`].get(day)) || 0), 0), 0);
  const bookSuffixes = BOOK_TYPES.map(([b]) => `book:${b}`);
  const plans_per_day = dl.map((day) => ({ day, n: sumDay(['plan'], day) }));
  const book_taps_per_day = dl.map((day) => ({ day, n: sumDay(bookSuffixes, day) }));
  // Weeks run Monday to Sunday; the first and last can be part weeks.
  const weeks = [];
  for (const day of dl) {
    const d = new Date(`${day}T12:00:00Z`); const wd = d.getUTCDay();
    const start = new Date(d.getTime() - ((wd + 6) % 7) * 86400000).toISOString().slice(0, 10);
    let w = weeks[weeks.length - 1];
    if (!w || w.start !== start) { w = { start, plan: 0, swap: 0, remove: 0, confirm: 0, book_open: 0, book_click: 0, book_taps: 0, commission_taps: 0, share: 0, save: 0 }; weeks.push(w); }
    for (const [s] of STEPS) w[s] += sumDay([s], day);
    w.book_taps += sumDay(bookSuffixes, day);
    w.commission_taps += sumDay(['book:stay', 'book:viator'], day);
  }
  return { since, versions, show_v3: versions.v3.any, plans_per_day, book_taps_per_day, weeks: weeks.reverse() };
}

// The page side: one small script on Build My Trip (both versions). It listens; it never changes what a tap does,
// never waits for anything and never throws: clicks are read in the capture phase and the counts go out by sendBeacon.
// It reads the page's own analytics calls (window.trackEvent) for the steps that finish later (a plan arriving, a share
// that went through) and the taps themselves for the rest.
function clientScript() {
  return `<script>
(function(){
  try {
    var main = document.getElementById('tripV3');
    if (!main || !navigator.sendBeacon) return;
    var V = main.classList.contains('t3-v4') ? 'v4' : 'v3', once = {};
    function send(body){
      try {
        if (/(?:^|;\\s*)roam_internal=1(?:;|$)/.test(document.cookie)) return;
        navigator.sendBeacon('/api/site-event', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      } catch (e) { /* counting must never break the page */ }
    }
    function step(s){ if (once[s]) return; once[s] = 1; send({ name: 'bmt:' + V + ':' + s }); }
    window.__roamTripFunnel = { step: step, version: V };
    var orig = window.trackEvent;
    if (typeof orig === 'function') window.trackEvent = function(name, q){
      try {
        var p = q || {};
        if (name === 'trip_plan_complete') step('plan');
        else if (name === 'trip_share' || (name === 'trip_plan_share' && p.share_method === 'clipboard')) {
          var m = name === 'trip_share' ? p.method : 'copy';
          send({ name: 'bmt:' + V + ':share:' + (m === 'native' ? 'native' : 'copy') }); step('share');
        } else if (name === 'add_whole_trip') step('save');
      } catch (e) { /* never in the way */ }
      return orig.apply(this, arguments);
    };
    document.addEventListener('click', function(e){
      try {
        if (!e.isTrusted || !e.target || !e.target.closest) return;
        var t = e.target, b;
        if (t.closest('[data-t3-swap], [data-t3-swap-id]')) { step('swap'); return; }
        if (t.closest('[data-t3-remove]')) { step('remove'); return; }
        if (t.closest('[data-v4-confirm]')) { step('confirm'); return; }
        if (t.closest('[data-v4-book]')) { step('book_open'); return; }
        if ((b = t.closest('[data-v4-save]'))) { if (b.getAttribute('aria-pressed') !== 'true') step('save'); return; }
        var a = t.closest('a[href]');
        if (!a || !document.getElementById('t3Result') || !document.getElementById('t3Result').contains(a)) return;
        var tr = a.getAttribute('data-track'), kind = null, body;
        if (a.getAttribute('data-link') === 'viator') kind = 'viator';
        else if (tr === 'stay_click' && a.closest('.t3-stay')) kind = 'stay';
        else if (tr === 'booking' && a.closest('.t3-stay')) kind = a.getAttribute('data-venue-id') ? 'venue' : 'other';
        if (!kind) return;
        body = { name: 'bmt:' + V + ':book:' + kind };
        if (kind === 'venue') body.venue_id = Number(a.getAttribute('data-venue-id')) || 0;
        send(body); step('book_click');
      } catch (err) { /* never in the way */ }
    }, true);
  } catch (e) { /* counting must never break the page */ }
})();
</script>`;
}

// Adds the script to the planner page, just before the page's own script (which stays the last one on the page). It
// wraps window.trackEvent, which the page looks up on every call, so the order does not matter.
function withTripFunnelScript(html) {
  if (typeof html !== 'string' || !html.includes('id="tripV3"')) return html;
  const at = html.lastIndexOf('<script>');
  return at < 0 ? html : `${html.slice(0, at)}${clientScript()}\n${html.slice(at)}`;
}

module.exports = { VERSIONS, STEPS, BOOK_TYPES, SHARE_METHODS, NAMES, NOT_ON, bookTypeFor, resolveName, report, clientScript, withTripFunnelScript };
