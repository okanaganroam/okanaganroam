'use strict';
// "Book a wine tour" (2026-11-21, Dayton): one guided Viator wine tour per wine area, as a commission link. The same
// affiliate as viator.js (pid P00333119, the site's commission line); nothing new to sign up for. Off unless Viator is
// set up (VIATOR_API_KEY + VIATOR_PARTNER_ID, viator.config()).
//
// Where it shows (one tour per page, one "Book now" button, plain words):
//   - the wine guides named in data/viator-wine-tours.json "guides" (not the first-timers guide, which lists local tour companies) and the wineries listings (/wineries and /<town>/wineries):
//     one short line "Book a wine tour (no driving): <tour> · Book now ↗" with the commission line under it;
//   - Build My Trip V4, "Book my trip": one step "Book a wine tour (no driving)" when a day of the plan has 2+ winery stops.
// Never on a winery's own page (its own "Book a tasting" stays the only booking button there).
//
// Which tour: the area of the page's town (or of that day's wineries), else data file defaultArea. Picked by hand (see the
// data file's "why"). It never changes a plan's stops, their order, or which places show or their order.
// Clicks: data-track="booking" data-link="viator" (Build My Trip funnel bmt:<v>:book:viator; outbound_click link_type
// "viator" on the guide and listing pages). French: french-text.js translates the words on /fr pages; the tour's own
// title stays as Viator wrote it (data-fr-keep).

const fs = require('fs');
const path = require('path');
const viator = require('./viator');

const TEXT = {
  step: { en: 'Book a wine tour (no driving)', fr: 'Réserver un circuit vinicole (sans conduire)' },
  lead: { en: 'Book a wine tour (no driving):', fr: 'Réserver un circuit vinicole (sans conduire) :' },
};

// VIATOR_DATA_DIR: tests only (as in viator.js).
const dataDir = () => process.env.VIATOR_DATA_DIR || path.join(__dirname, 'data');
let cache = null;
function loadData(file = path.join(dataDir(), 'viator-wine-tours.json')) {
  if (cache && cache.file === file) return cache.value;
  let value = { areas: {}, regions: {}, guides: {}, defaultArea: null };
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (o && o.areas && typeof o.areas === 'object') {
      value = {
        areas: o.areas,
        regions: o.regions && typeof o.regions === 'object' ? o.regions : {},
        guides: o.guides && typeof o.guides === 'object' ? o.guides : {},
        defaultArea: typeof o.defaultArea === 'string' ? o.defaultArea : null,
      };
    }
  } catch (e) { /* no file: nothing shows */ }
  cache = { file, value };
  return value;
}
const clearCache = () => { cache = null; };

// The wine area for a town slug (closest area for a town without its own), else the default.
function areaFor(region, data = loadData()) {
  const a = region && data.regions[region];
  return a && data.areas[a] ? a : (data.defaultArea && data.areas[data.defaultArea] ? data.defaultArea : null);
}
// -> { area, url, productCode, title } or null (Viator off, no product, not a viator.com URL).
function tourFor(region, opts = {}) {
  const cfg = opts.cfg || viator.config();
  if (!cfg.enabled) return null;
  const data = opts.data || loadData();
  const area = areaFor(region, data);
  const it = area && data.areas[area];
  const url = it && viator.isViatorUrl(it.url) ? viator.affiliateUrl(it.url, cfg, 'api') : null;
  return url ? { area, url, productCode: String(it.productCode || ''), title: String(it.title || '') } : null;
}
// A wine guide's town (data file "guides": path -> town slug), or undefined when the path is not one of the wine guides.
function guideRegion(pathname, data = loadData()) {
  const p = String(pathname || '').replace(/(.)\/$/, '$1');
  return Object.prototype.hasOwnProperty.call(data.guides, p) ? data.guides[p] : undefined;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// The one line for a guide or listing page. '' when off. English words (french-text.js translates /fr pages).
function lineHtml(region, opts = {}) {
  const t = tourFor(region, opts);
  if (!t) return '';
  const fr = opts.lang === 'fr';
  return `<div class="wine-tour-line" data-wine-tour="${escapeHtml(t.area)}" style="margin:12px 0;padding:10px 14px;border:1px solid rgba(27,43,58,0.14);border-radius:12px;background:var(--paper,#fff)">
    <p style="margin:0;font-size:0.95rem;line-height:1.45"><strong>${escapeHtml(TEXT.lead[fr ? 'fr' : 'en'])}</strong> <span data-fr-keep lang="en">${escapeHtml(t.title)}</span> · <a href="${escapeHtml(t.url)}" rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator" data-viator-code="${escapeHtml(t.productCode)}" style="font-weight:800;white-space:nowrap">${escapeHtml(viator.TEXT.book[fr ? 'fr' : 'en'])} ↗</a></p>
    <p class="venue-viator-note" data-viator-disclosure style="margin:4px 0 0;font-size:0.76rem;line-height:1.4;opacity:0.75">${escapeHtml(viator.DISCLOSURE[fr ? 'fr' : 'en'])}</p>
  </div>`;
}
// Guide and listing pages: outbound_click with link_type "viator" (the page's analytics).
function clickScriptHtml(surface) {
  return `<script>
(function(){
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('.wine-tour-line a[data-link="viator"]') : null;
      if (!a || !window.trackEvent) return;
      window.trackEvent('outbound_click', { link_type: 'viator', viator_code: a.getAttribute('data-viator-code') || '', surface: ${JSON.stringify(String(surface || ''))} });
    } catch (err) { /* counting must never break the site */ }
  });
})();
</script>`;
}

// ---- Build My Trip ----
function planDays(plan) {
  if (!plan) return [];
  if (Array.isArray(plan.days) && plan.days.length) return plan.days.map((d) => (d && d.stops) || []);
  return [(plan.itinerary && plan.itinerary.stops) || (plan.outing && plan.outing.stops) || []];
}
// The first day with 2+ different wineries: its wineries' towns. [] when no day has two.
function wineDayRegions(plan) {
  for (const stops of planDays(plan)) {
    const seen = new Map();
    for (const s of stops) { const v = s && s.venue; if (v && v.type === 'winery' && Number.isInteger(v.id) && !seen.has(v.id)) seen.set(v.id, v.region || ''); }
    if (seen.size >= 2) return [...seen.values()];
  }
  return [];
}
// The step, or null. opts: { bookableIds (the plan's stops with their own booking link), cfg, data }.
// A plan that already has a bookable wine tour stop gets no second one.
function tripStep(plan, opts = {}) {
  if (!plan || typeof plan !== 'object') return null;
  const regions = wineDayRegions(plan);
  if (!regions.length) return null;
  const ids = opts.bookableIds instanceof Set ? opts.bookableIds : new Set(opts.bookableIds || []);
  if (viator.interestCovered('wine_tour', plan, ids)) return null;
  // The day's main wine area: the area most of its wineries are in (ties: the first winery's).
  const data = opts.data || loadData();
  const n = new Map();
  for (const r of regions) { const a = areaFor(r, data); if (a) n.set(a, (n.get(a) || 0) + 1); }
  let best = null, max = 0;
  for (const [a, c] of n) if (c > max) { best = a; max = c; }
  const region = regions.find((r) => areaFor(r, data) === best) || regions[0];
  const t = tourFor(region, { ...opts, data });
  if (!t) return null;
  return {
    kind: 'viator', id: t.productCode || `wine-tour-${t.area}`, name: TEXT.step.en, nameFr: TEXT.step.fr,
    label: viator.TEXT.book.en, labelFr: viator.TEXT.book.fr, url: t.url,
    affiliate: true, rel: 'sponsored noopener', link: 'viator', wineTour: t.area,
  };
}
// Adds the step to every "Book my trip" list (the stays box's pick, its alternatives, V4's own list), once, at the end;
// and drops a "Wine tours" Viator suggestion for the same plan (one wine tour, not two). Stops are never touched.
function withTripStep(plan, step) {
  if (!plan || !step) return plan;
  const add = (list) => (Array.isArray(list) && !list.some((x) => x && x.url === step.url) ? [...list, step] : list);
  const w = plan.whereToStay;
  if (w && w.pick) {
    w.pick = { ...w.pick, bookingSteps: add(w.pick.bookingSteps || []) };
    w.alternatives = (w.alternatives || []).map((c) => ({ ...c, bookingSteps: add(c.bookingSteps || []) }));
    w.bookingSteps = add(w.bookingSteps || []);
  } else plan.v4Booking = { estimate: null, ...(plan.v4Booking || {}), steps: add((plan.v4Booking && plan.v4Booking.steps) || []) };
  if (plan.viator && Array.isArray(plan.viator.interests)) {
    const rest = plan.viator.interests.filter((i) => i && i.key !== 'wine_tour');
    if (rest.length) plan.viator = { ...plan.viator, interests: rest }; else delete plan.viator;
  }
  return plan;
}

module.exports = { TEXT, loadData, clearCache, areaFor, tourFor, guideRegion, lineHtml, clickScriptHtml, wineDayRegions, tripStep, withTripStep };
