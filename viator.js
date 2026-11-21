'use strict';
// Viator tours and activities (2026-11-20): the affiliate (Basic access, 8%, 30-day cookie) part of the site.
//
// What visitors see (both behind the env below; nothing shows and no call is made without it):
//   - a venue page: for a venue Dayton approved in data/viator-matches.json (scripts/viator-match.js then
//     viator-apply.js), the main Book button is "Book on Viator ↗" with the commission line under it and the operator's
//     own booking link as a smaller "or book direct" link; Build My Trip's booking steps use the same Viator link;
//   - Build My Trip (TRIP_STAYS or ?stays=1 only): up to 2 Viator suggestion cards for an activity the visitor asked for
//     (wine tour, zipline, boat cruise...) when the plan has no bookable listing for it. The cards load from
//     GET /api/trip/viator (robots.txt blocks /api/), so no Viator content is ever in a page's source.
//
// Env: VIATOR_API_KEY (secret) and VIATOR_PARTNER_ID (P00333119). Both are needed; with either missing the feature is off.
//   VIATOR_CAMPAIGN overrides the campaign tag (default trip-site.js viator.campaign: 'okanagan').
//
// Viator's rules followed here (docs.viator.com/partner-api/technical, partnerresources.viator.com attribution):
//   - productUrl from the API is used exactly as returned (it already carries pid, mcid=42383, medium=api); the campaign
//     is added by Viator through the campaign-value request parameter, never by editing the URL. Any other viator.com
//     link (no pid yet) gets ?pid=&mcid=42383&medium=link&campaign= (campaign: letters, digits, dashes only). A product
//     with no productUrl is never linked.
//   - Basic access endpoints only: /products/search, /products/{code}, /search/freetext, /destinations.
//   - Caching: search results (titles, photos, ratings, from-prices) are kept in memory for 24 hours, a failed call for
//     10 minutes (so an outage never hammers the API); destinations are looked up by the match script and stored in
//     data/viator-destinations.json (Viator: refresh weekly; re-run the match script to refresh). Calls time out after
//     8 s on the site (Viator recommends up to 120 s, which is for bookings; a slow answer here just shows no cards).
//   - Reviews: only the rating and the review count are shown, never review text (protected content); no
//     viatorUniqueContent is ever used.
//   - Photos: Viator's own photo only inside a Viator card, credited "Photo: Viator"; never a venue's photo.
//   - Rate limits: the scripts wait between calls and honour 429 Retry-After; the site makes at most one call per
//     (destination, interest, language) a day.

const fs = require('fs');
const path = require('path');
const SITE = require('./trip-site.js');

const API_BASE = 'https://api.viator.com/partner';
// VIATOR_API_BASE: a local mock for trying the page (only http://127.0.0.1 or localhost is accepted); never set live.
const apiBase = () => { const b = String(process.env.VIATOR_API_BASE || '').trim(); return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/[\w/-]*$/.test(b) ? b.replace(/\/$/, '') : API_BASE; };
const MCID = '42383';
const TIMEOUT_MS = 8000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const FAIL_CACHE_MS = 10 * 60 * 1000;
const SITE_CFG = SITE.viator || {};
// VIATOR_DATA_DIR: tests only (their own matches/destinations files); the site reads data/.
const dataDir = () => process.env.VIATOR_DATA_DIR || path.join(__dirname, 'data');

// The commission line (the same words as places to stay).
const DISCLOSURE = require('./places-to-stay').DISCLOSURE;
const TEXT = {
  seeOn: { en: 'See on Viator', fr: 'Voir sur Viator' },
  photo: { en: 'Photo: Viator', fr: 'Photo : Viator' },
  powered: { en: 'Powered by Viator', fr: 'Propulsé par Viator' },
  from: { en: 'From', fr: 'À partir de' },
  add: { en: 'Add to trip', fr: 'Ajouter au voyage' },
  added: { en: 'Added', fr: 'Ajouté' },
  book: { en: 'Book now', fr: 'Réserver' }, // owner decision 2026-11-20: plain label; the link goes to Viator (affiliate), commission line under it
  heading: { en: 'Tours you can book', fr: 'Activités à réserver' },
  priceNote: { en: 'Price per person from Viator, in CAD; the final price is on Viator.', fr: 'Prix par personne selon Viator, en $ CA; le prix final est sur Viator.' },
};

const cleanCampaign = (s) => String(s || '').trim().replace(/[^A-Za-z0-9-]/g, '').slice(0, 60);
function config(env = process.env) {
  const key = String(env.VIATOR_API_KEY || '').trim();
  const pid = String(env.VIATOR_PARTNER_ID || '').trim();
  const enabled = !!key && /^P\d{8}$/.test(pid);
  return { enabled, key: enabled ? key : '', pid: enabled ? pid : '', mcid: MCID, campaign: cleanCampaign(env.VIATOR_CAMPAIGN) || cleanCampaign(SITE_CFG.campaign) || 'roam' };
}
const enabled = (env = process.env) => config(env).enabled;

// ---- Links ----
const VIATOR_HOST_RE = /^https:\/\/(?:www\.|shop\.live\.rc\.)?viator\.com(?:\/|$|\?)/i;
const isViatorUrl = (u) => typeof u === 'string' && VIATOR_HOST_RE.test(u.trim()) && !/[\s"'<>]/.test(u.trim());
// An API productUrl (it has pid): returned untouched. Anything else on viator.com: our affiliate parameters added.
function affiliateUrl(url, cfg = config(), medium = 'link') {
  if (!isViatorUrl(url) || !cfg || !/^P\d{8}$/.test(cfg.pid || '')) return null;
  const u = url.trim();
  if (/[?&]pid=/.test(u)) return u;
  const params = `pid=${cfg.pid}&mcid=${MCID}&medium=${medium === 'api' ? 'api' : 'link'}${cfg.campaign ? `&campaign=${cleanCampaign(cfg.campaign)}` : ''}`;
  const [head, hash] = u.split('#');
  return `${head}${head.includes('?') ? '&' : '?'}${params}${hash !== undefined ? `#${hash}` : ''}`;
}

// ---- API client ----
// fetchImpl: global fetch by default (tests pass a mock). Every failure (no key, timeout, HTTP error, bad JSON) -> null.
async function request(pathname, opts = {}) {
  const cfg = opts.cfg || config();
  if (!cfg.enabled) return null;
  const doFetch = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs || TIMEOUT_MS) : null;
  try {
    const res = await doFetch(`${apiBase()}${pathname}${qs}`, {
      method: opts.body ? 'POST' : 'GET',
      headers: {
        'exp-api-key': cfg.key,
        Accept: 'application/json;version=2.0',
        'Accept-Language': opts.lang === 'fr' ? 'fr-CA' : 'en-CA',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (opts.onResponse) opts.onResponse(res);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally { if (timer) clearTimeout(timer); }
}

// /search/freetext, products only, in one destination, best rated first (Viator's traveller rating, never commission).
function freetextBody(term, destId, count = 6, start = 1) {
  return {
    searchTerm: String(term || '').slice(0, 100),
    productFiltering: { destination: String(destId) },
    productSorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
    searchTypes: [{ searchType: 'PRODUCTS', pagination: { start, count } }],
    currency: 'CAD',
  };
}
function productSearchBody(destId, start = 1, count = 50) {
  return {
    filtering: { destination: String(destId) },
    sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
    pagination: { start, count },
    currency: 'CAD',
  };
}
async function freetext(term, destId, opts = {}) {
  const cfg = opts.cfg || config();
  const r = await request('/search/freetext', { ...opts, cfg, query: { 'campaign-value': cfg.campaign }, body: freetextBody(term, destId, opts.count, opts.start) });
  const p = r && r.products;
  return p && Array.isArray(p.results) ? { total: Number(p.totalCount) || p.results.length, products: p.results } : null;
}
async function searchProducts(destId, opts = {}) {
  const cfg = opts.cfg || config();
  const r = await request('/products/search', { ...opts, cfg, query: { 'campaign-value': cfg.campaign }, body: productSearchBody(destId, opts.start, opts.count) });
  return r && Array.isArray(r.products) ? { total: Number(r.totalCount) || r.products.length, products: r.products } : null;
}
async function productDetails(code, opts = {}) {
  const cfg = opts.cfg || config();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(String(code || ''))) return null;
  return request(`/products/${encodeURIComponent(code)}`, { ...opts, cfg, query: { 'campaign-value': cfg.campaign } });
}
async function destinations(opts = {}) {
  const r = await request('/destinations', opts);
  return r && Array.isArray(r.destinations) ? r.destinations : null;
}

// ---- Cards ----
// The photo variant nearest 480 px wide (a card is about 240 px; 2x screens).
function pickPhoto(images) {
  const list = Array.isArray(images) ? images : [];
  const img = list.find((i) => i && i.isCover) || list[0];
  const vs = img && Array.isArray(img.variants) ? img.variants.filter((v) => v && typeof v.url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v.url.trim()) && v.width >= 200) : [];
  if (!vs.length) return null;
  vs.sort((a, b) => Math.abs(a.width - 480) - Math.abs(b.width - 480));
  return { url: vs[0].url.trim(), width: vs[0].width, height: vs[0].height };
}
function durationMinutes(d) {
  if (!d || typeof d !== 'object') return null;
  if (Number.isFinite(d.fixedDurationInMinutes) && d.fixedDurationInMinutes > 0) return { from: d.fixedDurationInMinutes, to: d.fixedDurationInMinutes };
  const from = d.variableDurationFromMinutes, to = d.variableDurationToMinutes;
  if (Number.isFinite(from) && from > 0) return { from, to: Number.isFinite(to) && to >= from ? to : from };
  return null;
}
// A product summary -> the card the page shows. null without a usable link or title.
function toCard(p, cfg = config()) {
  if (!p || typeof p !== 'object' || typeof p.title !== 'string' || !p.title.trim()) return null;
  // Only the productUrl Viator gave us (it carries the attribution); a product without one is left out.
  const url = isViatorUrl(p.productUrl) ? affiliateUrl(p.productUrl, cfg, 'api') : null;
  if (!url) return null;
  const reviews = p.reviews || {};
  const price = p.pricing && p.pricing.summary ? p.pricing.summary.fromPrice : null;
  return {
    code: String(p.productCode || ''),
    title: p.title.trim().slice(0, 140),
    url,
    photo: pickPhoto(p.images),
    rating: Number.isFinite(reviews.combinedAverageRating) && reviews.combinedAverageRating > 0 ? Math.round(reviews.combinedAverageRating * 10) / 10 : null,
    reviews: Number.isInteger(reviews.totalReviews) && reviews.totalReviews > 0 ? reviews.totalReviews : 0,
    fromPrice: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
    currency: p.pricing && p.pricing.currency ? String(p.pricing.currency) : 'CAD',
    duration: durationMinutes(p.duration),
  };
}

// ---- Build My Trip interests ----
// key: what the visitor asked for (request words, English and French); term: the Viator search; cover: a plan stop of
// one of these types whose name matches coverRe, with its own booking link, already covers it (no Viator cards).
const INTERESTS = {
  wine_tour: { label: 'Wine tours', labelFr: 'Visites de vignobles', term: 'wine tour', re: /\bwine(?:ry)? (?:tasting )?tours?\b|\bwine tasting tours?\b|\b(?:tourn[ée]es?|visites?|circuits?) (?:des |de |dans les )?vignobles?\b|\bvisites? vinicoles?\b/i, types: ['tour'], coverRe: /wine|vin|grape|vineyard|tasting/i },
  food_tour: { label: 'Food tours', labelFr: 'Visites gourmandes', term: 'food tour', re: /\bfood tours?\b|\bculinary tours?\b|\bvisites? gourmandes?\b|\bcircuits? gourmands?\b/i, types: ['tour'], coverRe: /food|taste|culinary|gourmand/i },
  boat: { label: 'Boat tours', labelFr: 'Sorties en bateau', term: 'boat tour', re: /\bboat (?:tours?|cruises?|rides?|trips?)\b|\b(?:lake |sunset )?cruises?\b|\bsail(?:ing|boat)?\b|\bcroisi[èe]res?\b|\b(?:sorties?|balades?|tours?) en bateau\b|\bvoilier\b/i, types: ['tour', 'sport', 'outdoor'], coverRe: /boat|cruise|sail|charter|yacht|bateau|croisi/i },
  zipline: { label: 'Ziplines', labelFr: 'Tyroliennes', term: 'zipline', re: /\bzip ?lin(?:e|es|ing)\b|\bziptrek\b|\btyroliennes?\b/i, types: ['tour', 'sport', 'outdoor'], coverRe: /zip|tyrolienne/i },
  paddle: { label: 'Kayak and paddle tours', labelFr: 'Kayak et planche à pagaie', term: 'kayak tour', re: /\bkayak(?:s|ing)?\b|\bpaddle ?board(?:s|ing)?\b|\bsup tours?\b|\bcanoe(?:s|ing)?\b|\bcano[ëe]s?\b|\bplanche [àa] pagaie\b/i, types: ['tour', 'sport', 'outdoor'], coverRe: /kayak|paddle|canoe|sup\b|cano/i },
  bike_tour: { label: 'Bike tours', labelFr: 'Visites à vélo', term: 'bike tour', re: /\b(?:e-?bike|bike|bicycle|cycling) tours?\b|\b(?:visites?|circuits?) (?:à|a|en) v[ée]lo\b/i, types: ['tour', 'sport'], coverRe: /bike|cycl|v[ée]lo/i },
  ski_lesson: { label: 'Ski lessons', labelFr: 'Cours de ski', term: 'ski lesson', re: /\b(?:ski|skiing|snowboard|snowboarding) (?:lessons?|school|camps?|instructors?)\b|\b(?:cours|le[çc]ons?) de (?:ski|planche|surf des neiges)\b|\b[ée]cole de ski\b/i, types: ['tour', 'sport', 'outdoor'], coverRe: /lesson|school|snow ?school|cours|[ée]cole/i },
  gondola: { label: 'Gondola rides', labelFr: 'Télécabine', term: 'gondola', re: /\bgondolas?\b|\bpeak 2 peak\b|\bpeak-to-peak\b|\bt[ée]l[ée]cabines?\b|\bt[ée]l[ée]ph[ée]riques?\b/i, types: ['tour', 'outdoor', 'sport', 'indoor'], coverRe: /gondola|peak 2 peak|t[ée]l[ée]cabine/i },
  snowmobile: { label: 'Snowmobile tours', labelFr: 'Motoneige', term: 'snowmobile tour', re: /\bsnowmobil(?:e|es|ing)\b|\bski-?doo\b|\bmotoneiges?\b/i, types: ['tour', 'sport'], coverRe: /snowmobil|motoneige/i },
  rafting: { label: 'Rafting', labelFr: 'Rafting', term: 'rafting', re: /\brafting\b|\bwhite ?water\b|\beaux vives\b/i, types: ['tour', 'sport'], coverRe: /raft|white ?water/i },
  heli: { label: 'Helicopter tours', labelFr: 'Tours en hélicoptère', term: 'helicopter tour', re: /\bheli(?:copter)? (?:tours?|rides?|flights?|skiing)\b|\bheli-?ski(?:ing)?\b|\bh[ée]licopt[èe]re\b/i, types: ['tour', 'sport'], coverRe: /heli|h[ée]licopt/i },
  bear_tour: { label: 'Bear viewing tours', labelFr: 'Observation des ours', term: 'bear viewing tour', re: /\bbear (?:viewing|watching|tours?)\b|\bobservation des ours\b/i, types: ['tour'], coverRe: /bear|ours/i },
  dog_sled: { label: 'Dog sledding', labelFr: 'Traîneau à chiens', term: 'dog sledding', re: /\bdog ?sled(?:ding|s)?\b|\btra[îi]neau (?:[àa] chiens|tir[ée] par des chiens)\b/i, types: ['tour', 'sport'], coverRe: /sled|tra[îi]neau/i },
  // Last: "a tour" with no kind named. Covered by any tour listing with a booking link.
  tour: { label: 'Tours', labelFr: 'Visites guidées', term: 'tour', re: /\bguided (?:tours?|hikes?|walks?)\b|\b(?:walking )?tours?\b|\bvisites? guid[ée]es?\b/i, types: ['tour'], coverRe: /./ },
};
const siteInterests = () => (Array.isArray(SITE_CFG.interests) ? SITE_CFG.interests : Object.keys(INTERESTS)).filter((k) => INTERESTS[k]);

// The interests a request names, in INTERESTS order; "tour" only when no other kind is named.
function requestInterests(text, allowed = siteInterests()) {
  const t = String(text || '').normalize('NFC');
  const out = allowed.filter((k) => k !== 'tour' && INTERESTS[k] && INTERESTS[k].re.test(t));
  if (!out.length && allowed.includes('tour') && INTERESTS.tour.re.test(t)) out.push('tour');
  return out;
}
function planStops(plan) {
  if (!plan) return [];
  return Array.isArray(plan.days) && plan.days.length ? plan.days.flatMap((d) => (d && d.stops) || [])
    : ((plan.itinerary && plan.itinerary.stops) || (plan.outing && plan.outing.stops) || []);
}
// bookableIds: the plan's stops that have their own booking link (server.js tripBookingChecklist).
function interestCovered(key, plan, bookableIds) {
  const it = INTERESTS[key];
  if (!it) return true;
  return planStops(plan).some((s) => {
    const v = s && s.venue;
    return !!v && bookableIds.has(v.id) && it.types.includes(v.type) && it.coverRe.test(`${v.name || ''} ${v.cuisine || ''}`);
  });
}
// The plan's main town: the region with the most stops (ties: the first seen).
function planRegion(plan) {
  const n = new Map();
  for (const s of planStops(plan)) { const r = s && s.venue && s.venue.region; if (r) n.set(r, (n.get(r) || 0) + 1); }
  let best = null, max = 0;
  for (const [r, c] of n) if (c > max) { best = r; max = c; }
  return best;
}
// Destinations from data/viator-destinations.json (written by scripts/viator-apply.js): { area: id, regions: { slug: id } }.
let destCache = null;
function loadDestinations(file = path.join(dataDir(), 'viator-destinations.json')) {
  if (destCache && destCache.file === file) return destCache.value;
  let value = null;
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (o && typeof o === 'object' && (Number.isInteger(o.area) || (o.regions && typeof o.regions === 'object'))) value = { area: Number.isInteger(o.area) ? o.area : null, regions: o.regions && typeof o.regions === 'object' ? o.regions : {} };
  } catch (e) { value = null; }
  destCache = { file, value };
  return value;
}
function destinationFor(region, dests = loadDestinations()) {
  if (!dests) return null;
  const id = region && dests.regions[region];
  return Number.isInteger(id) ? id : dests.area;
}

// What the plan sends the page: { interests: [{ key, label, labelFr }], region } (at most 2 interests), or null.
// Pure and deterministic; it never touches the plan's stops or their order.
function tripHint(plan, text, bookableIds, opts = {}) {
  if (!plan || typeof plan !== 'object') return null;
  if (!(opts.cfg || config()).enabled) return null;
  const dests = opts.destinations === undefined ? loadDestinations() : opts.destinations;
  const region = planRegion(plan) || null;
  if (!destinationFor(region, dests)) return null;
  const ids = bookableIds instanceof Set ? bookableIds : new Set(bookableIds || []);
  const keys = requestInterests(text, opts.allowed).filter((k) => !interestCovered(k, plan, ids)).slice(0, 2);
  if (!keys.length) return null;
  return { interests: keys.map((k) => ({ key: k, label: INTERESTS[k].label, labelFr: INTERESTS[k].labelFr })), region };
}

// GET /api/trip/viator: up to 2 cards for these interests in the region's destination. One call per interest, cached.
const cache = new Map();
async function tripCards(keys, region, lang, opts = {}) {
  const cfg = opts.cfg || config();
  if (!cfg.enabled) return [];
  const dest = destinationFor(region, opts.destinations === undefined ? loadDestinations() : opts.destinations);
  if (!dest) return [];
  const now = opts.now || Date.now();
  const lists = [];
  for (const key of keys.filter((k) => INTERESTS[k]).slice(0, 2)) {
    const ck = `${dest}|${key}|${lang === 'fr' ? 'fr' : 'en'}`;
    let hit = cache.get(ck);
    if (!hit || hit.until <= now) {
      const r = await freetext(INTERESTS[key].term, dest, { cfg, lang, count: 6, fetchImpl: opts.fetchImpl });
      const cards = r ? r.products.map((p) => toCard(p, cfg)).filter(Boolean) : [];
      hit = { until: now + (r ? CACHE_MS : FAIL_CACHE_MS), cards };
      cache.set(ck, hit);
      if (cache.size > 500) cache.delete(cache.keys().next().value);
    }
    lists.push(hit.cards.map((c) => ({ ...c, interest: key })));
  }
  // One from each interest first, then the next best; never the same product twice; at most 2.
  const out = [], seen = new Set();
  for (let i = 0; out.length < 2 && i < 6; i++) {
    for (const l of lists) { const c = l[i]; if (c && !seen.has(c.code) && out.length < 2) { seen.add(c.code); out.push(c); } }
  }
  return out;
}
const clearCache = () => { cache.clear(); destCache = null; matchCache = null; };

// ---- Venue pages ----
// data/viator-matches.json (scripts/viator-apply.js): { venues: { "<id>": { productCode, title, supplier, url } } }.
let matchCache = null;
function loadMatches(file = path.join(dataDir(), 'viator-matches.json')) {
  if (matchCache && matchCache.file === file) return matchCache.value;
  let value = {};
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (o && o.venues && typeof o.venues === 'object') value = o.venues;
  } catch (e) { value = {}; }
  matchCache = { file, value };
  return value;
}
function venueMatch(venueId, matches = loadMatches()) {
  const m = matches && matches[String(venueId)];
  return m && typeof m === 'object' && isViatorUrl(m.url) ? m : null;
}
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Owner decision (Dayton, 2026-11-20): a venue with an approved match books through Viator. Its main Book button is
// "Book on Viator ↗" (sponsored, new tab, data-track="booking" data-link="viator"), with the commission line right under
// it and the operator's own booking link kept as a smaller "or book direct with <name> ↗". A venue without a match, or
// with Viator not set up, is exactly as before.
// -> { url, productCode } or null.
function venueBooking(venueId, opts = {}) {
  const cfg = opts.cfg || config();
  if (!cfg.enabled) return null;
  const m = venueMatch(venueId, opts.matches);
  const url = m ? affiliateUrl(m.url, cfg, 'api') : null;
  return url ? { url, productCode: m.productCode || '' } : null;
}
// The main Book button (the class is the page's own Book button class, so every layout places it the same way).
function bookButtonHtml(url, lang = 'en', cls = 'cta secondary') {
  return `<a class="${escapeHtml(cls)}" href="${escapeHtml(url)}" rel="sponsored nofollow noopener" target="_blank" data-track="booking" data-link="viator">${escapeHtml(TEXT.book[lang === 'fr' ? 'fr' : 'en'])} ↗</a>`;
}
// The line under it: the commission line, then "or book direct with <name> ↗" when the operator has a booking link.
function venueLinkHtml(venueId, lang = 'en', opts = {}) {
  if (!venueBooking(venueId, opts)) return '';
  const fr = lang === 'fr';
  const d = opts.direct && /^https?:\/\/[^\s"'<>]+$/i.test(String(opts.direct.url || '')) ? opts.direct : null;
  const direct = d ? `<br><a class="venue-viator-direct" href="${escapeHtml(d.url)}" target="_blank" rel="nofollow noopener" data-track="booking" data-link="direct">${escapeHtml(fr ? `ou réservez directement auprès de ${d.name}` : `or book direct with ${d.name}`)} <span aria-hidden="true">↗</span></a>` : '';
  return `<p class="venue-viator" style="margin:8px 0 0;font-size:0.86rem;line-height:1.45"><span class="venue-viator-note" data-viator-disclosure style="font-size:0.78rem;opacity:0.75">${escapeHtml(DISCLOSURE[fr ? 'fr' : 'en'])}</span>${direct}</p>`;
}
// Puts that line just after the block holding the page's "Book on Viator" button. No button, no line.
function withVenueLink(html, venue, lang = 'en', opts = {}) {
  if (typeof html !== 'string' || !venue || !Number.isInteger(venue.id)) return html;
  const line = venueLinkHtml(venue.id, lang, opts);
  if (!line) return html;
  const m = /<a\b[^>]*\bdata-link="viator"[^>]*>/.exec(html);
  if (!m) return html;
  const close = html.indexOf('</div>', m.index);
  if (close < 0) return html;
  const at = close + '</div>'.length;
  return `${html.slice(0, at)}\n  ${line}${html.slice(at)}`;
}
// Build My Trip's booking list item ({ venueId, name, url, label, labelFr }) for a matched venue: the Viator link.
function checklistItem(item, opts = {}) {
  const b = item && Number.isInteger(item.venueId) ? venueBooking(item.venueId, opts) : null;
  return b ? { ...item, url: b.url, label: TEXT.book.en, labelFr: TEXT.book.fr, affiliate: true, rel: 'sponsored nofollow noopener', link: 'viator' } : item;
}

// ---- Matching our operators to Viator products (scripts/viator-match.js) ----
const GENERIC = new Set(['the', 'and', 'of', 'a', 'an', 'at', 'in', 'on', 'by', 'ltd', 'inc', 'corp', 'co', 'company', 'llc', 'limited', 'tours', 'tour', 'travel', 'adventures', 'adventure', 'experiences', 'experience', 'excursions', 'rentals', 'rental', 'services', 'service', 'bc', 'canada', 'ca', 'group', 'enterprises', 'the']);
function normName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function nameTokens(s, extraStop = []) {
  const stop = new Set([...GENERIC, ...extraStop.map((w) => normName(w))]);
  return normName(s).split(' ').filter((w) => w && !stop.has(w));
}
// 0..1: how surely two business names are the same business.
function nameScore(a, b, extraStop = []) {
  const na = normName(a).replace(/ /g, ''), nb = normName(b).replace(/ /g, '');
  if (na && na === nb) return 1;
  const ta = nameTokens(a, extraStop), tb = nameTokens(b, extraStop);
  if (!ta.length || !tb.length) return 0;
  if (ta.join('') === tb.join('')) return 0.95;
  const A = new Set(ta), B = new Set(tb);
  const inter = [...A].filter((w) => B.has(w)).length;
  if (!inter) return 0;
  const jac = inter / new Set([...A, ...B]).size;
  const contained = inter === A.size || inter === B.size;
  return Math.round(Math.max(jac, contained ? 0.6 + 0.3 * jac : 0) * 100) / 100;
}
// Does the product's title or description carry the venue's distinctive name (all its distinctive words, in order)?
function textMentions(text, venueName, extraStop = []) {
  const toks = nameTokens(venueName, extraStop);
  if (!toks.length || (toks.length === 1 && toks[0].length < 5)) return false;
  return ` ${normName(text)} `.includes(` ${toks.join(' ')} `);
}
// One venue against products (summaries with optional .supplierName from details). -> rows, best first.
// confidence: high = the supplier is the venue (name score >= 0.9); medium = the supplier name mostly matches (>= 0.6);
// low = only the title/description names the venue (supplier unknown or different: often a reseller, check it).
function matchVenue(venue, products, extraStop = []) {
  const rows = [];
  for (const p of products || []) {
    if (!p || !p.productCode) continue;
    const sup = p.supplierName || '';
    const s = sup ? nameScore(venue.name, sup, extraStop) : 0;
    const mentioned = textMentions(`${p.title || ''} ${p.description || ''}`, venue.name, extraStop);
    let confidence = null, reason = '';
    if (s >= 0.9) { confidence = 'high'; reason = `supplier "${sup}" is the same name (score ${s})`; }
    else if (s >= 0.6) { confidence = 'medium'; reason = `supplier "${sup}" mostly matches (score ${s})`; }
    else if (mentioned) { confidence = 'low'; reason = sup ? `title/description names the venue but supplier is "${sup}" (check it is the same business)` : 'title/description names the venue; supplier not checked'; }
    if (!confidence) continue;
    if (p.inArea === false) { confidence = 'low'; reason += '; product is not in our destinations'; }
    rows.push({ venueId: venue.id, venueName: venue.name, productCode: p.productCode, title: p.title || '', supplierName: sup, productUrl: p.productUrl || '', confidence, score: s, reason });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return rows.sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.score - a.score || a.productCode.localeCompare(b.productCode));
}

// CSV (RFC 4180 quoting) for the review file, and its reader for the apply script.
const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const MATCH_COLUMNS = ['ok', 'venue_id', 'venue_name', 'viator_product_code', 'title', 'supplier_name', 'confidence', 'reason', 'product_url'];
function matchesCsv(rows) {
  return `${MATCH_COLUMNS.join(',')}\n${rows.map((r) => [r.ok || '', r.venueId, r.venueName, r.productCode, r.title, r.supplierName, r.confidence, r.reason, r.productUrl].map(csvCell).join(',')).join('\n')}${rows.length ? '\n' : ''}`;
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}
// The rows Dayton marked ok -> data/viator-matches.json content. One product per venue (the first ok row); others reported.
function approvedMatches(csvRows, today = new Date().toISOString().slice(0, 10)) {
  const venues = {}, skipped = [];
  for (const r of csvRows) {
    if (!/^(ok|yes|y|x|1)$/i.test(r.ok || '')) continue;
    const id = Number(r.venue_id);
    if (!Number.isInteger(id) || id <= 0 || !/^[A-Za-z0-9_-]{2,40}$/.test(r.viator_product_code || '')) { skipped.push({ row: r, why: 'bad venue id or product code' }); continue; }
    if (!isViatorUrl(r.product_url)) { skipped.push({ row: r, why: 'product_url is missing or not a viator.com link' }); continue; }
    if (venues[id]) { skipped.push({ row: r, why: `venue ${id} already has ${venues[id].productCode} (first ok row wins)` }); continue; }
    venues[id] = { name: r.venue_name || '', productCode: r.viator_product_code, title: r.title || '', supplier: r.supplier_name || '', url: r.product_url, approved: today };
  }
  return { venues, skipped };
}

module.exports = {
  API_BASE, MCID, CACHE_MS, FAIL_CACHE_MS, TEXT, DISCLOSURE, INTERESTS, MATCH_COLUMNS,
  config, enabled, isViatorUrl, affiliateUrl,
  request, freetext, searchProducts, productDetails, destinations, freetextBody, productSearchBody,
  pickPhoto, durationMinutes, toCard,
  siteInterests, requestInterests, interestCovered, planRegion, loadDestinations, destinationFor, tripHint, tripCards, clearCache,
  loadMatches, venueMatch, venueBooking, bookButtonHtml, venueLinkHtml, withVenueLink, checklistItem,
  normName, nameTokens, nameScore, textMentions, matchVenue, matchesCsv, parseCsv, approvedMatches,
};
