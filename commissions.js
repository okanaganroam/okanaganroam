'use strict';
// Commissions (2026-11-21, Dayton): every affiliate program on both sites in one place, for the owner dashboard's
// Commissions page (/admin/dashboard/commissions on okanaganroam.com). This file is the same on Okanagan Roam and
// Whistler Roam: the programs and their terms, each program's on/off state read from this site's own settings (env), and
// the clicks we sent, from our own anonymous daily counts.
//
// Clicks: one count per tap on a commission link, by partner and by the kind of page it sat on, kept as a site event
// (site-events.js, table site_event_counts) named commission:<program>:<surface>. Nothing else: no visitor id, no IP, no
// business, nothing typed. The page script is clientJs() below, in every page's analytics head (bots, our own scripts and
// the roam_internal cookie are left out on the server as for every other count). Counting started 2026-11-21, so days
// before that have no page split; Build My Trip's own booking taps (trip-funnel.js, bmt:<v>:book:<kind>) go back further.
//
// A tap is not a booking: the partner decides what was booked and pays weeks later (after the stay, the tour or the rental).
// The money side is entered by hand on Okanagan Roam (commissions-page.js), since no partner sends it to us.
const { dayOf } = require('./trip-demand');
const placesToStay = require('./places-to-stay');
const viator = require('./viator');
const gettingHere = require('./getting-here');
let fever = null;
try { fever = require('./fever'); } catch (e) { /* Whistler Roam has no Fever button */ }

const SITES = ['okanagan', 'whistler'];
const SITE_NAMES = { okanagan: 'Okanagan Roam', whistler: 'Whistler Roam' };

// key, name, what it covers, the sites it can run on, the terms in one short line, the partner's own dashboard (real
// URLs only), the payout minimum (per account; null when we don't know one), and when we applied (for "waiting").
const PROGRAMS = [
  { key: 'stay', name: 'Stay22', what: 'Places to stay (Booking.com, Expedia, Vrbo)', sites: SITES,
    terms: 'A share of the booking site’s commission. Paid monthly once the guest has stayed. US$100 minimum.',
    dashboard: 'https://hub.stay22.com/', minimum: { amount: 100, currency: 'USD' }, env: 'STAY_AFFILIATE_PROVIDER, STAY_AFFILIATE_ID' },
  { key: 'viator', name: 'Viator', what: 'Tours, wine tours, ski rentals, shuttles and buses', sites: SITES,
    terms: '8% of tours booked within 30 days of the click. Earned once the tour date has passed. US$50 minimum by bank, none by PayPal.',
    dashboard: 'https://partners.viator.com/', minimum: { amount: 50, currency: 'USD' }, env: 'VIATOR_PARTNER_ID, VIATOR_API_KEY' },
  { key: 'discovercars', name: 'Discover Cars', what: 'Rental cars', sites: SITES,
    terms: 'About $20 a booking, 365-day cookie. Paid monthly after the rental ends. US$200 minimum. One account for both sites.',
    dashboard: 'https://discover-car-hire.postaffiliatepro.com/affiliates/login.php', minimum: { amount: 200, currency: 'USD' }, env: 'DISCOVERCARS_AID' },
  { key: 'fever', name: 'Fever', what: 'Kelowna Candlelight concert tickets (through Impact)', sites: ['okanagan'],
    terms: '6% of tickets, 1-day window. Earned in US dollars, paid in Canadian dollars.',
    dashboard: 'https://app.impact.com/', minimum: null, applied: '2026-11-21', env: 'FEVER_AFFILIATE_TEMPLATE' },
  { key: 'whistlercom', name: 'Whistler.com', what: 'Lodging, activities, rentals and lift tickets', sites: ['whistler'],
    terms: '5% on lodging, activities and rentals; 2.5% on lift tickets bundled with lodging. CA$100 minimum.',
    dashboard: '', minimum: { amount: 100, currency: 'CAD' }, applied: '2026-11-21', env: '' },
];
const PROGRAM_KEYS = PROGRAMS.map((p) => p.key);
const byKey = (k) => PROGRAMS.find((p) => p.key === k) || null;

// The kinds of page a commission link can sit on, as the page script tells them apart.
const SURFACES = [
  ['stays', 'Places to stay pages'],
  ['trip', 'Build My Trip and My Trip'],
  ['town', 'Town pages (Getting here box) and home'],
  ['guide', 'Guides'],
  ['event', 'Events and What’s On'],
  ['listing', 'Business pages'],
  ['list', 'Lists and search'],
  ['hotel', 'Hotel guest pages (QR cards)'],
  ['other', 'Other pages'],
];
const SURFACE_KEYS = SURFACES.map(([k]) => k);
const NAMES = PROGRAM_KEYS.flatMap((p) => SURFACE_KEYS.map((s) => `commission:${p}:${s}`));

// This site's own state for each program: live, waiting (applied, not switched on yet), off, or na (not on this site).
function status(site, env = process.env) {
  const out = {};
  for (const p of PROGRAMS) {
    let state = 'off'; let note = '';
    if (!p.sites.includes(site)) state = 'na';
    else if (p.key === 'stay') { const c = placesToStay.affiliateConfig(env); state = c.provider === 'none' ? 'off' : 'live'; if (c.provider !== 'none' && c.provider !== 'stay22') note = `Going through ${c.provider}, not Stay22.`; }
    else if (p.key === 'viator') state = viator.enabled(env) ? 'live' : 'off';
    else if (p.key === 'discovercars') state = gettingHere.enabled(env) ? 'live' : 'off';
    else if (p.key === 'fever') state = fever && fever.enabled(env) ? 'live' : 'waiting';
    else if (p.key === 'whistlercom') state = 'waiting';
    if (state === 'waiting' && p.key === 'fever') note = 'Applied Nov 21, in review. The button stays off until FEVER_AFFILIATE_TEMPLATE is set.';
    if (state === 'waiting' && p.key === 'whistlercom') note = 'Applied Nov 21. Waiting for their booking link.';
    out[p.key] = { state, note };
  }
  return out;
}

const tableExists = (db, t) => { try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t); } catch (e) { return false; } };
const shift = (day, n) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

// Clicks we sent from this site: per program, the last 7 days (today included), the 7 before, the last 30 days, where the
// last 30 days' clicks came from, and Build My Trip's own booking taps for the same windows.
function clicks(db, now = new Date()) {
  const today = dayOf(now);
  const w = { d7: [shift(today, -6), today], p7: [shift(today, -13), shift(today, -7)], d30: [shift(today, -29), today] };
  const out = { range: w, since: null, programs: {} };
  for (const p of PROGRAMS) out.programs[p.key] = { d7: 0, p7: 0, d30: 0, surfaces: {}, bmt7: 0, bmt30: 0 };
  if (!tableExists(db, 'site_event_counts')) return out;
  const rows = db.prepare("SELECT day, name, n FROM site_event_counts WHERE day >= ? AND (name LIKE 'commission:%' OR name LIKE 'bmt:%:book:%')").all(w.p7[0] < w.d30[0] ? w.p7[0] : w.d30[0]);
  const inR = (day, r) => day >= r[0] && day <= r[1];
  for (const r of rows) {
    let m = /^commission:([a-z]+):([a-z]+)$/.exec(r.name);
    if (m && out.programs[m[1]]) {
      const x = out.programs[m[1]];
      if (inR(r.day, w.d7)) x.d7 += r.n;
      if (inR(r.day, w.p7)) x.p7 += r.n;
      if (inR(r.day, w.d30)) { x.d30 += r.n; x.surfaces[m[2]] = (x.surfaces[m[2]] || 0) + r.n; }
      continue;
    }
    m = /^bmt:v\d:book:([a-z]+)$/.exec(r.name);
    if (m && out.programs[m[1]]) {
      if (inR(r.day, w.d7)) out.programs[m[1]].bmt7 += r.n;
      if (inR(r.day, w.d30)) out.programs[m[1]].bmt30 += r.n;
    }
  }
  const first = db.prepare("SELECT MIN(day) AS d FROM site_event_counts WHERE name LIKE 'commission:%'").get();
  out.since = first && first.d ? first.d : null;
  return out;
}

// What /api/admin/commissions (and the dashboard data) gives the Commissions page for this site.
function siteReport(db, site, { env = process.env, now = new Date() } = {}) {
  return { site, status: status(site, env), clicks: clicks(db, now) };
}

// Commission taps in a range of days (the weekly summary, whats-changed.js).
function totalBetween(db, a, b) {
  if (!tableExists(db, 'site_event_counts')) return 0;
  const r = db.prepare("SELECT SUM(n) AS n FROM site_event_counts WHERE name LIKE 'commission:%' AND day BETWEEN ? AND ?").get(a, b);
  return (r && r.n) || 0;
}

// The page script, in every page's analytics head right after roamCount (server.js renderAnalyticsHeadHtml). One count per
// real tap on a commission link: a link marked rel="sponsored" (every affiliate link on the sites is), counted as "stay"
// for a place-to-stay button (data-track stay_click) or else by its data-link (viator, discovercars, fever, whistlercom);
// the server keeps only the names in NAMES. The script names no partner, so a partner that is off appears in no page.
// The kind of page comes from the address and the page type.
function clientJs(pageType) {
  return `  // Commission links (2026-11-21, commissions.js): one count per tap, by partner and kind of page. Counts only.
  (function(){
    var PT = ${JSON.stringify(String(pageType || ''))};
    function partner(a){
      if (!/(^|\\s)sponsored(\\s|$)/.test(a.getAttribute('rel') || '')) return '';
      if (/(^|\\s)stay_click(\\s|$)/.test(a.getAttribute('data-track') || '')) return 'stay';
      var dl = String(a.getAttribute('data-link') || '');
      return /^[a-z]{2,24}$/.test(dl) ? dl : '';
    }
    function surface(a){
      var p = location.pathname.replace(/^\\/fr(?=\\/|$)/, '') || '/';
      if (/^\\/(trip|my-trip)(\\/|$)/.test(p) || PT === 'trip' || PT === 'trip_v3' || PT === 'my_trip') return 'trip';
      if (/^\\/near\\//.test(p) || PT === 'hotel') return 'hotel';
      if (/^\\/whats-on(\\/|$)/.test(p) || PT === 'event') return 'event';
      if (/^\\/guides\\//.test(p) || PT === 'guide') return 'guide';
      if (a.hasAttribute('data-stay-id')) return 'stays';
      if (PT === 'venue') return 'listing';
      if (PT === 'region' || PT === 'hub') return 'town';
      if (PT === 'category' || PT === 'browse' || PT === 'search') return 'list';
      return 'other';
    }
    document.addEventListener('click', function(e){
      try {
        if (!e.isTrusted || !e.target || !e.target.closest) return;
        var a = e.target.closest('a[href]'); if (!a) return;
        var k = partner(a); if (k) roamCount('commission:' + k + ':' + surface(a));
      } catch (err) { /* counting must never break the site */ }
    }, true);
  })();`;
}

module.exports = { PROGRAMS, PROGRAM_KEYS, SURFACES, SURFACE_KEYS, NAMES, SITES, SITE_NAMES, byKey, status, clicks, siteReport, totalBetween, clientJs };
