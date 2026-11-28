'use strict';
// Bookable tour picks (2026-11-21, Dayton): two small Viator commission surfaces. This file is the same on Okanagan Roam
// and Whistler Roam; what differs lives in data/viator-picks.json and trip-site.js.
//
//   1. Hotel and rental guest pages (/near/<slug>, which /guests/<slug> forwards to): one short "Book a tour" row with
//      2-3 well-reviewed Viator products near the hotel (or around the rental's town), in season, at the very end of the
//      page (after the free local picks and this week's events). Not on the printable card (/near/<slug>/card).
//   2. The Thursday "This weekend" email (weekend-email.js): one "Book something this weekend" item before the footer.
//
// Which products: only ones we already link. The Viator products Dayton approved for businesses we list
// (data/viator-matches.json, via viator.js), the wine tours (data/viator-wine-tours.json, wine-tours.js, Okanagan) and
// Black Tie's ski rental delivery (a matched listing on Whistler). Each needs a row in data/viator-picks.json "products"
// (its Viator rating and review count, the months it runs, a group); a product without one never shows, so a new match
// shows only once someone adds its row. In season: the month is one of its months ("ski": the ski hill's own season,
// passed in by server.js), and its business is not closed for the season or not operating (the same closed list the
// guest page uses for its free picks). Well reviewed: at least minRating and minReviews (the email: emailMinReviews).
//
// Near: within maxKm of the hotel (a product's own maxKm when it has one, e.g. a delivery area) (a wine tour: pickup in the hotel's town); a hotel on a ski hill gets only products on
// that hill. Order (guest pages): Viator's rating, steadied by the review count (a 5.0 from 3 reviews is not above a 4.9 from
// 500), plus a little for a business we list, minus a little per km; at most one per group (no two wine tours), "pin"
// products first (Whistler's ski delivery in ski season). Commission never changes which free places show or their
// order: this row is added after the page is built and touches nothing else.
// The email: one product, rotated week to week by the ISO week number of the weekend's Friday among every in-season,
// well-reviewed candidate whose business has its own real photo on our site (the listing's image_url; for a wine tour,
// the operator's own listing), sorted by product code so the rotation is stable. Never Viator's photo, never stock, and
// never a box without a photo: a product whose business has no photo here is skipped.
//
// One booking button per product ("Book now", rel="sponsored noopener", data-link="viator": commissions.js counts the
// taps as viator:hotel on guest pages), the site's commission line under the row. Off when Viator is off
// (viator.config()), and nothing shows when nothing fits (no empty section). No car rentals here: guests have arrived.

const fs = require('fs');
const path = require('path');
const SITE = require('./trip-site.js');
const viator = require('./viator');
let wineTours = null;
try { wineTours = require('./wine-tours'); } catch (e) { /* Whistler Roam has no wine tours file */ }

const HILL_REGIONS = new Set(Array.isArray(SITE.skiHillRegions) ? SITE.skiHillRegions : []);
const TEXT = {
  heading: { en: 'Book a tour', fr: 'Réserver une activité' },
  emailHeading: { en: 'Book something this weekend', fr: 'Réservez quelque chose cette fin de semaine' },
  pickup: { en: 'Pickup in town', fr: 'Prise en charge en ville' },
  with: { en: 'with', fr: 'avec' },
};

// VIATOR_DATA_DIR: tests only (as in viator.js).
const dataDir = () => process.env.VIATOR_DATA_DIR || path.join(__dirname, 'data');
let cache = null;
function loadData(file = path.join(dataDir(), 'viator-picks.json')) {
  if (cache && cache.file === file) return cache.value;
  let value = { minRating: 4.6, minReviews: 5, emailMinReviews: 20, maxKm: 30, products: {} };
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (o && o.products && typeof o.products === 'object') {
      const num = (x, d) => (Number.isFinite(x) ? x : d);
      value = { minRating: num(o.minRating, 4.6), minReviews: num(o.minReviews, 5), emailMinReviews: num(o.emailMinReviews, 20), maxKm: num(o.maxKm, 30), products: o.products };
    }
  } catch (e) { /* no file: nothing shows */ }
  cache = { file, value };
  return value;
}
const clearCache = () => { cache = null; };

function km(a, b) {
  if (!a || !b || ![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const monthOf = (date) => (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(5, 7)) : null);
function inSeason(meta, date, skiInSeason) {
  if (!meta) return false;
  if (meta.months === 'ski') return !!skiInSeason;
  const m = monthOf(date);
  return Array.isArray(meta.months) && m !== null && meta.months.includes(m);
}
const wellReviewed = (meta, data, minReviews) => Number.isFinite(meta.rating) && meta.rating >= data.minRating && Number.isInteger(meta.reviews) && meta.reviews >= minReviews;

// Every product that could show, in season on ctx.date. ctx: { cfg, venues (Map id -> venue row with name, region,
// latitude, longitude, slug, type, image_url), closedIds (Set), date (YYYY-MM-DD), skiInSeason, data, matches, wine }.
function candidates(ctx = {}) {
  const cfg = ctx.cfg || viator.config();
  if (!cfg.enabled) return [];
  const data = ctx.data || loadData();
  const venues = ctx.venues instanceof Map ? ctx.venues : new Map();
  const closed = ctx.closedIds instanceof Set ? ctx.closedIds : new Set();
  const out = [];
  const matches = ctx.matches || viator.loadMatches();
  for (const [id, m] of Object.entries(matches || {})) {
    const v = venues.get(Number(id));
    const meta = m && data.products[m.productCode];
    if (!v || !meta || closed.has(v.id) || !inSeason(meta, ctx.date, ctx.skiInSeason)) continue;
    const url = viator.isViatorUrl(m.url) ? viator.affiliateUrl(m.url, cfg, 'api') : null;
    if (!url) continue;
    out.push({ code: String(m.productCode), title: String(m.title || '').trim(), business: v.name, venue: v, photoVenue: v, url, listed: true, ...pickMeta(meta) });
  }
  // Wine tours (pickup at your accommodation in the area's towns; not up on the ski hills).
  const wine = ctx.wine !== undefined ? ctx.wine : (wineTours ? wineTours.loadData() : null);
  if (wine && wine.areas) {
    for (const [area, it] of Object.entries(wine.areas)) {
      const meta = it && data.products[it.productCode];
      if (!meta || !inSeason(meta, ctx.date, ctx.skiInSeason)) continue;
      const url = viator.isViatorUrl(it.url) ? viator.affiliateUrl(it.url, cfg, 'api') : null;
      if (!url) continue;
      const regions = Object.entries(wine.regions || {}).filter(([r, a]) => a === area && !HILL_REGIONS.has(r)).map(([r]) => r);
      // The operator's own listing on our site, when we list it (for the email's photo): the same business name.
      const own = it.supplier ? [...venues.values()].find((v) => v && v.name && viator.nameScore(v.name, it.supplier) >= 0.9) || null : null;
      out.push({ code: String(it.productCode), title: String(it.title || '').trim(), business: String(it.supplier || ''), venue: null, photoVenue: own, regions, url, listed: false, ...pickMeta(meta) });
    }
  }
  return out.filter((c) => c.title);
}
function pickMeta(meta) {
  return { rating: meta.rating, reviews: meta.reviews, group: String(meta.group || 'other'), pin: !!meta.pin, meta };
}
// Rating steadied by review count (10 reviews' worth of 4.5), a little for more reviews and for a business we list.
function quality(c) {
  const steady = (c.rating * c.reviews + 4.5 * 10) / (c.reviews + 10);
  return steady + 0.15 * Math.log10(c.reviews + 1) + (c.listed ? 0.15 : 0);
}

// The guest page's row: at most `limit` products near the hotel, best first, one per group.
function guestPicks(hotel, ctx = {}, limit = 3) {
  if (!hotel) return [];
  const data = ctx.data || loadData();
  const rows = [];
  const onHill = HILL_REGIONS.has(hotel.region);
  for (const c of candidates({ ...ctx, data })) {
    if (!wellReviewed(c.meta, data, data.minReviews)) continue;
    let d = null;
    // A hotel up on a ski hill: only what is on that hill (guests there are not driving down to the valley for a tour).
    if (onHill && !(c.venue && c.venue.region === hotel.region)) continue;
    if (c.venue) { d = km(hotel, c.venue); if (d === null || d > (Number.isFinite(c.meta.maxKm) ? c.meta.maxKm : data.maxKm)) continue; }
    else if (!c.regions.includes(hotel.region)) continue;
    rows.push({ ...c, km: d, score: quality(c) - 0.01 * (d || 0) });
  }
  rows.sort((a, b) => (b.pin - a.pin) || b.score - a.score || a.code.localeCompare(b.code));
  const out = [], groups = new Set(), codes = new Set();
  for (const r of rows) {
    if (out.length >= limit) break;
    if (groups.has(r.group) || codes.has(r.code)) continue;
    groups.add(r.group); codes.add(r.code); out.push(r);
  }
  return out;
}

// Every bookable product a guest page can offer, by the listing it belongs to (2026-11-27, Dayton): the cards for those
// places get a "Book now" beside "Add to trip" instead of a separate "Book a tour" row. One product per listing: the
// strongest one (pinned first, then quality, then nearest).
function bookableByVenue(hotel, ctx = {}) {
  const out = new Map();
  if (!hotel) return out;
  const data = ctx.data || loadData();
  const onHill = HILL_REGIONS.has(hotel.region);
  const rows = [];
  for (const c of candidates({ ...ctx, data })) {
    if (!c.venue || !wellReviewed(c.meta, data, data.minReviews)) continue;
    if (onHill && c.venue.region !== hotel.region) continue;
    const d = km(hotel, c.venue);
    if (d === null || d > (Number.isFinite(c.meta.maxKm) ? c.meta.maxKm : data.maxKm)) continue;
    rows.push({ ...c, km: d, score: quality(c) - 0.01 * d });
  }
  rows.sort((a, b) => (b.pin - a.pin) || b.score - a.score || a.code.localeCompare(b.code));
  for (const r of rows) if (!out.has(r.venue.id)) out.set(r.venue.id, { code: r.code, url: r.url, title: r.title });
  return out;
}

const hasOwnPhoto = (v) => !!(v && /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(v.image_url || '').trim()));

// ISO 8601 week number of a YYYY-MM-DD date.
function isoWeek(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 0;
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(((d - y0) / 86400000 + 1) / 7);
}
// The email's one product for the weekend whose Friday is ctx.date, or null. Same product once per code (Black Tie's
// three shops are one product); rotation = ISO week mod the number of candidates.
// The pick carries photoVenue: the listing whose own photo the email shows (and whose page its name links to).
function emailPick(ctx = {}) {
  const data = ctx.data || loadData();
  const seen = new Map();
  for (const c of candidates({ ...ctx, data })) {
    if (!wellReviewed(c.meta, data, data.emailMinReviews) || c.meta.email === false) continue;
    if (!hasOwnPhoto(c.photoVenue)) continue;
    const prev = seen.get(c.code);
    // One row per product (Black Tie's three shops are one product): the lowest venue id with a photo (stable).
    if (!prev || c.photoVenue.id < prev.photoVenue.id) seen.set(c.code, c);
  }
  const list = [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
  if (!list.length) return null;
  const week = ctx.weekKey !== undefined ? ctx.weekKey : isoWeek(ctx.date);
  return list[week % list.length];
}

// The email's "Book now" goes through our own page (/weekend-email/book/<code, lower case>) so the tap shows in Analytics with the
// email's campaign tags. -> { code, title, business, url } for a product that has a row in the data file and an approved
// link (in season or not: an old email still opens its product), or null (Viator off, unknown code).
function linkFor(code, ctx = {}) {
  const cfg = ctx.cfg || viator.config();
  const data = ctx.data || loadData();
  // Codes are matched without case: the site's lower-case address rule turns /book/312379P1 into /book/312379p1.
  const want = String(code || '').toLowerCase();
  const c = Object.keys(data.products).find((k) => k.toLowerCase() === want);
  if (!cfg.enabled || !/^[a-z0-9_-]{2,40}$/.test(want) || !c) return null;
  const matches = ctx.matches || viator.loadMatches();
  for (const m of Object.values(matches || {})) {
    if (m && m.productCode === c && viator.isViatorUrl(m.url)) return { code: c, title: String(m.title || ''), business: String(m.supplier || m.name || ''), url: viator.affiliateUrl(m.url, cfg, 'api') };
  }
  const wine = ctx.wine !== undefined ? ctx.wine : (wineTours ? wineTours.loadData() : null);
  for (const it of Object.values((wine && wine.areas) || {})) {
    if (it && it.productCode === c && viator.isViatorUrl(it.url)) return { code: c, title: String(it.title || ''), business: String(it.supplier || ''), url: viator.affiliateUrl(it.url, cfg, 'api') };
  }
  return null;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const awayText = (d) => (d <= 1.2 ? `${Math.max(1, Math.round(d * 12))} min walk` : `${Math.round(d * 1.6 + 2)} min drive`);

// The guest page section, or '' when nothing fits. opts: { lang, rental (no walk/drive times), venueHref(venue) }.
function guestRowHtml(picks, opts = {}) {
  if (!Array.isArray(picks) || !picks.length) return '';
  const lang = opts.lang === 'fr' ? 'fr' : 'en';
  const item = (p) => {
    const href = p.venue && typeof opts.venueHref === 'function' ? opts.venueHref(p.venue) : null;
    const biz = href ? `<a class="ht-tour-biz" href="${esc(href)}">${esc(p.business)}</a>` : esc(p.business);
    const where = p.venue ? (opts.rental || p.km === null ? '' : ` · ${esc(awayText(p.km))}`) : ` · ${esc(TEXT.pickup[lang])}`;
    return `<li class="ht-tour" data-viator-code="${esc(p.code)}">
      <span class="ht-tour-text"><span class="ht-meta">${biz}${where}</span><span class="ht-tour-name" data-fr-keep lang="en">${esc(p.title)}</span></span>
      <a class="ht-tour-book" href="${esc(p.url)}" rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator" data-viator-code="${esc(p.code)}">${esc(viator.TEXT.book[lang])} <span aria-hidden="true">↗</span></a>
    </li>`;
  };
  return `<section class="ht-section ht-tours" aria-labelledby="ht-tours">
    <style>
      body.hotel-page .ht-tours-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-width: 720px; }
      body.hotel-page .ht-tour { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #fff; border: 1px solid rgba(27,43,58,0.14); border-radius: 12px; }
      body.hotel-page .ht-tour-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      body.hotel-page .ht-tour .ht-meta { padding: 0; }
      body.hotel-page .ht-tour-biz { color: inherit; }
      body.hotel-page .ht-tour-name { font-weight: 800; overflow-wrap: anywhere; line-height: 1.3; }
      body.hotel-page .ht-tour-book { flex: none; display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--ref-navy, #1B2B3A); color: var(--ref-navy, #1B2B3A); font-weight: 800; text-decoration: none; white-space: nowrap; }
      body.hotel-page .ht-tours-note { margin: 8px 0 0; font-size: 0.78rem; line-height: 1.4; opacity: 0.75; }
    </style>
    <h2 id="ht-tours">${esc(TEXT.heading[lang])}</h2>
    <ul class="ht-tours-list">${picks.map(item).join('')}</ul>
    <p class="ht-tours-note venue-viator-note" data-viator-disclosure>${esc(viator.DISCLOSURE[lang])}</p>
  </section>`;
}

module.exports = { bookableByVenue, TEXT, loadData, clearCache, km, inSeason, candidates, quality, guestPicks, isoWeek, emailPick, linkFor, guestRowHtml };
