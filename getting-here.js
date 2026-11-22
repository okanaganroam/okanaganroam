'use strict';
// "Getting here" (2026-11-21, Dayton): rental cars through Discover Cars (affiliate, about $20 a booking, 365-day
// cookie) and, for the ski resorts, airport shuttles and transfers that Viator sells (our Viator link, pid P00333119).
//
// OFF until DISCOVERCARS_AID is set on the site (the Discover Cars affiliate id, "okanaganroam"). While it is unset (or
// not a valid id) nothing here shows anywhere: no rental car line, no shuttle lines, no Build My Trip step, no
// discovercars.com link in any page. The Viator lines also need Viator set up (VIATOR_API_KEY + VIATOR_PARTNER_ID,
// viator.config()), like every other Viator button.
//
// Where it shows (one booking button per item, rel="sponsored noopener", the site's commission line under them):
//   - every town and ski resort page, inside its existing "Getting around & parking" / "Getting here & parking" box:
//     "Rent a car at <the nearest airport>" (Kelowna YLW or Penticton YYF), and on Big White, SilverStar and Apex their
//     airport shuttle(s) on Viator (data/getting-here.json). No new page, no title / H1 / meta change.
//   - Build My Trip V4, "Book my trip": one last step "Rent a car at <airport>" (the airport nearest the plan's first
//     town) when the plan spans 2+ towns or more than one day.
// Discover Cars links: its own airport landing pages (https://www.discovercars.com/canada/<city>/<iata>) with
// ?a_aid=<id>. Those pages take no dates, so the pick-up date is chosen on Discover Cars.
// Tracking (2026-11-22): &chan=<site channel> (created in the Discover Cars panel: "okanagan" / "whistler"; the
// DISCOVERCARS_CHANNEL env overrides) and &data1=<placement> (page = a town/ski page box, trip = Build My Trip's
// booking step, chat = the travel agent chat card), so their Channel stats / commission reports say where a booking came from.
// Clicks: data-link="discovercars" / "viator" (Build My Trip funnel bmt:<v>:book:discovercars / :viator; outbound_click
// link_type "discovercars" / "viator", surface "getting_here" or "trip_planner").
// French: FR_TEXT below is added to the site's French list (server.js), so /fr pages read in French.
// Affiliate never changes which places show or their order: this only adds a line and a booking step.

const fs = require('fs');
const path = require('path');
const viator = require('./viator');

const DC_BASE = 'https://www.discovercars.com';
const AIRPORTS = {
  ylw: { code: 'YLW', path: '/canada/kelowna/ylw', en: 'Kelowna airport (YLW)', fr: 'l’aéroport de Kelowna (YLW)' },
  yyf: { code: 'YYF', path: '/canada/penticton/yyf', en: 'Penticton airport (YYF)', fr: 'l’aéroport de Penticton (YYF)' },
};
// The nearest airport with rental cars, per town (by road). South of Summerland, Penticton's is closer.
const REGION_AIRPORT = {
  kelowna: 'ylw', 'west-kelowna': 'ylw', 'lake-country': 'ylw', peachland: 'ylw', 'big-white': 'ylw',
  vernon: 'ylw', coldstream: 'ylw', armstrong: 'ylw', enderby: 'ylw', lumby: 'ylw', silverstar: 'ylw',
  summerland: 'yyf', penticton: 'yyf', naramata: 'yyf', kaleden: 'yyf', 'okanagan-falls': 'yyf', oliver: 'yyf',
  osoyoos: 'yyf', apex: 'yyf', baldy: 'yyf',
};
const TEXT = {
  rent: { en: 'Rent a car at', fr: 'Louer une voiture à' },
  seeCars: { en: 'See cars', fr: 'Voir les voitures' },
};
const DISCLOSURE = require('./places-to-stay').DISCLOSURE;

const cleanAid = (s) => { const t = String(s || '').trim(); return /^[A-Za-z0-9_-]{1,40}$/.test(t) ? t : ''; };
const DEFAULT_CHANNEL = 'okanagan';
const PLACEMENTS = ['page', 'trip', 'chat'];
function config(env = process.env) {
  const aid = cleanAid(env.DISCOVERCARS_AID);
  return { enabled: !!aid, aid, channel: cleanAid(env.DISCOVERCARS_CHANNEL) || DEFAULT_CHANNEL };
}
const enabled = (env = process.env) => config(env).enabled;

const airportFor = (region) => AIRPORTS[REGION_AIRPORT[String(region || '')]] ? REGION_AIRPORT[region] : null;
// The Discover Cars link for an airport key ('ylw' / 'yyf'), or null when off. placement: 'page' | 'trip' | 'chat'.
function carUrl(key, cfg = config(), placement = 'page') {
  const a = AIRPORTS[key];
  if (!a || !cfg || !cfg.enabled) return null;
  const chan = cfg.channel || DEFAULT_CHANNEL;
  const where = PLACEMENTS.includes(placement) ? placement : 'page';
  return `${DC_BASE}${a.path}?a_aid=${encodeURIComponent(cfg.aid)}&chan=${encodeURIComponent(chan)}&data1=${where}`;
}

// GETTING_HERE_DATA_DIR: tests only; the site reads data/.
const dataDir = () => process.env.GETTING_HERE_DATA_DIR || path.join(__dirname, 'data');
let cache = null;
function loadData(file = path.join(dataDir(), 'getting-here.json')) {
  if (cache && cache.file === file) return cache.value;
  let value = { viator: {}, regions: {} };
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    value = { viator: (o && o.viator) || {}, regions: (o && o.regions) || {} };
  } catch (e) { /* none */ }
  cache = { file, value };
  return value;
}
const clearCache = () => { cache = null; };

// The Viator shuttles for a region: [{ key, productCode, url, label: {en, fr}, supplier }] (Viator set up only).
function regionShuttles(region, opts = {}) {
  const vcfg = opts.viatorCfg || viator.config();
  if (!vcfg.enabled) return [];
  const data = opts.data || loadData();
  return (data.regions[region] || []).map((k) => {
    const it = data.viator[k];
    const url = it && viator.isViatorUrl(it.url) ? viator.affiliateUrl(it.url, vcfg, 'api') : null;
    return url && it.label ? { key: k, productCode: String(it.productCode || ''), url, label: it.label, supplier: String(it.supplier || '') } : null;
  }).filter(Boolean);
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const rentText = (key, lang) => `${TEXT.rent[lang]} ${AIRPORTS[key][lang]}`;

// The rows for a town / ski page (English; the French list translates /fr). '' when off or nothing to show.
function regionBoxHtml(region, opts = {}) {
  const cfg = opts.cfg || config();
  if (!cfg.enabled) return '';
  const key = airportFor(region);
  const rows = [];
  const car = key ? carUrl(key, cfg, 'page') : null;
  if (car) rows.push(`<li><span>${escapeHtml(rentText(key, 'en'))}</span> <a href="${escapeHtml(car)}" rel="sponsored noopener" target="_blank" data-track="booking" data-link="discovercars" data-airport="${escapeHtml(AIRPORTS[key].code)}">${escapeHtml(TEXT.seeCars.en)} <span aria-hidden="true">↗</span></a></li>`);
  for (const s of regionShuttles(region, opts)) {
    rows.push(`<li><span>${escapeHtml(s.label.en)}</span> <a href="${escapeHtml(s.url)}" rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator" data-viator-code="${escapeHtml(s.productCode)}">${escapeHtml(viator.TEXT.book.en)} <span aria-hidden="true">↗</span></a></li>`);
  }
  if (!rows.length) return '';
  return `<div class="gh-box" data-getting-here><ul class="gh-rows">${rows.join('')}</ul><p class="gh-note" data-gh-disclosure>${escapeHtml(DISCLOSURE.en)}</p></div>`;
}
const BOX_STYLE = '<style id="getting-here">.gh-box{margin:10px 0 0;padding:10px 0 0;border-top:1px solid rgba(42,32,25,0.12)}.gh-rows{list-style:none;margin:0;padding:0;display:grid;gap:8px}.gh-rows li{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;font-size:0.88rem;line-height:1.4}.gh-rows a{font-weight:800;white-space:nowrap}.gh-note{margin:10px 0 0;font-size:0.76rem;line-height:1.4;opacity:0.75}</style>';

// Region pages: outbound_click for the box's links (the page's analytics and our own counts).
const CLICK_SCRIPT = `<script>
(function(){
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('[data-getting-here] a[data-link]') : null;
      if (!a || !window.trackEvent) return;
      window.trackEvent('outbound_click', { link_type: a.getAttribute('data-link'), surface: 'getting_here', viator_product: a.getAttribute('data-viator-code') || '', airport: a.getAttribute('data-airport') || '' });
    } catch (err) { /* counting must never break the site */ }
  });
})();
</script>`;

// Puts the rows inside the page's first "Getting around & parking" / "Getting here & parking" box, after its text.
// No such box, or nothing to show: the page exactly as it was.
const BOX_RE = /(<details><summary>Getting (?:around|here)[^<]*<\/summary>[\s\S]*?)(<\/details>)/;
function withRegionBox(html, region, opts = {}) {
  if (typeof html !== 'string' || !BOX_RE.test(html)) return html;
  const box = regionBoxHtml(region, opts);
  if (!box) return html;
  let out = html.replace(BOX_RE, (m, a, b) => `${a}${box}${b}`);
  out = out.includes('</head>') ? out.replace('</head>', `${BOX_STYLE}\n</head>`) : out;
  return out.includes('</body>') ? out.replace(/<\/body>(?![\s\S]*<\/body>)/, `${CLICK_SCRIPT}</body>`) : out;
}

// ---- Build My Trip V4 ----
function planStops(plan) {
  if (!plan) return [];
  return Array.isArray(plan.days) && plan.days.length ? plan.days.flatMap((d) => (d && d.stops) || [])
    : ((plan.itinerary && plan.itinerary.stops) || (plan.outing && plan.outing.stops) || []);
}
const stopRegion = (s) => {
  const v = s && (s.venue || s.event);
  return v ? (v.homeRegion || v.region || null) : null;
};
// 2+ towns, or more than one day (days in the plan, or nights in the stay).
function wantsCar(plan, stay) {
  if (!plan || typeof plan !== 'object') return false;
  const towns = new Set(planStops(plan).map(stopRegion).filter(Boolean));
  const days = Array.isArray(plan.days) ? plan.days.length : 0;
  const nights = stay && stay.arrive && stay.leave && stay.leave > stay.arrive;
  return towns.size >= 2 || days > 1 || plan.kind === 'multi_day' || !!nights;
}
// The step, or null. kind 'transport' (the page gives it data-link="discovercars").
function tripStep(plan, stay, opts = {}) {
  const cfg = opts.cfg || config();
  if (!cfg.enabled || !wantsCar(plan, stay)) return null;
  const first = planStops(plan).map(stopRegion).find((r) => airportFor(r));
  const key = first ? airportFor(first) : null;
  const url = key ? carUrl(key, cfg, 'trip') : null;
  if (!url) return null;
  return { kind: 'transport', id: `car-${key}`, name: rentText(key, 'en'), nameFr: rentText(key, 'fr'), label: TEXT.seeCars.en, labelFr: TEXT.seeCars.fr, url, affiliate: true, rel: 'sponsored noopener', link: 'discovercars' };
}
// The travel agent chat's "Getting here" card (2026-11-22, trip-chat-page.js; shown only in chat mode): for an
// overnight trip (2+ days, or a stay over a night; never a day trip or an evening), the airport nearest the plan's first
// town, its Discover Cars link (null while DISCOVERCARS_AID is unset) and that town's airport shuttles on Viator.
// -> { airport: { key, code, en, fr }, car, carLabel, shuttles: [{ label, url, productCode }] } or null.
function tripCard(plan, stay, opts = {}) {
  if (!plan || typeof plan !== 'object') return null;
  const days = Array.isArray(plan.days) ? plan.days.length : 0;
  const nights = !!(stay && stay.arrive && stay.leave && stay.leave > stay.arrive);
  if (!(days > 1 || nights)) return null;
  const first = planStops(plan).map(stopRegion).find((r) => airportFor(r));
  const key = first ? airportFor(first) : null;
  if (!key) return null;
  const car = carUrl(key, opts.cfg || config(), 'chat');
  const shuttles = regionShuttles(first, opts).map((x) => ({ label: x.label, url: x.url, productCode: x.productCode }));
  return { airport: { key, code: AIRPORTS[key].code, en: AIRPORTS[key].en, fr: AIRPORTS[key].fr }, region: first, car, carLabel: car ? { en: rentText(key, 'en'), fr: rentText(key, 'fr') } : null, shuttles };
}
// Adds the step at the end of every "Book my trip" list (the stays box's pick, its alternatives, V4's own list), once.
function withTripStep(plan, stay, opts = {}) {
  const step = tripStep(plan, stay, opts);
  if (!step) return plan;
  const add = (list) => { const l = Array.isArray(list) ? list.slice() : []; if (!l.some((x) => x && (x.id === step.id || x.url === step.url))) l.push(step); return l; };
  const w = plan.whereToStay;
  if (w && w.pick) {
    w.pick = { ...w.pick, bookingSteps: add(w.pick.bookingSteps) };
    w.alternatives = (w.alternatives || []).map((c) => ({ ...c, bookingSteps: add(c.bookingSteps) }));
    w.bookingSteps = add(w.bookingSteps);
  } else plan.v4Booking = { estimate: null, ...(plan.v4Booking || {}), steps: add(plan.v4Booking && plan.v4Booking.steps) };
  return plan;
}

// The V4 page's hooks (trip-planner-v4-page.js v4StaySrc): a transport step's link says data-link (discovercars) and
// sends outbound_click; the step's French name.
function v4ClientSwaps(staySrc) {
  const swap = (from, to) => { if (!staySrc.includes(from)) throw new Error(`getting-here hook not found: ${from.slice(0, 60)}`); staySrc = staySrc.replace(from, to); };
  swap('var track = step.kind === ', "var track = step.kind === 'transport' ? ' data-track=\"booking\" data-link=\"' + esc(step.link || '') + '\" data-gh-step=\"' + esc(step.id) + '\"' : step.kind === ");
  return staySrc + `
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[data-gh-step]') : null;
      if (a) track('outbound_click', { surface: 'trip_planner', link_type: a.getAttribute('data-link') || '' });
    } catch (err) {}
  });
`;
}

// French for the words above (added to the site's French list).
const FR_TEXT = {
  [TEXT.seeCars.en]: TEXT.seeCars.fr,
  [viator.TEXT.book.en]: viator.TEXT.book.fr,
  [DISCLOSURE.en]: DISCLOSURE.fr,
  [rentText('ylw', 'en')]: rentText('ylw', 'fr'),
  [rentText('yyf', 'en')]: rentText('yyf', 'fr'),
};
for (const it of Object.values(loadData(path.join(__dirname, 'data', 'getting-here.json')).viator)) {
  if (it && it.label && it.label.en && it.label.fr) FR_TEXT[it.label.en] = it.label.fr;
}
clearCache();

module.exports = { AIRPORTS, REGION_AIRPORT, TEXT, FR_TEXT, config, enabled, cleanAid, airportFor, carUrl, loadData, clearCache, regionShuttles, regionBoxHtml, withRegionBox, wantsCar, tripStep, withTripStep, tripCard, v4ClientSwaps };
