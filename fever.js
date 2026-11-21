'use strict';
// Fever "Tickets" (2026-11-21, Dayton): a commission button on What's On events that Fever itself sells (Candlelight
// concerts in Kelowna and the like). Fever pays through its affiliate program on the Impact network.
//
// OFF until Dayton has joined Fever's program on Impact and set FEVER_AFFILIATE_TEMPLATE on the site. While it is unset
// (or not a valid template) nothing about Fever shows anywhere: no button, no disclosure, no Build My Trip step, no
// fever.com link in any page (no free promotion). Each event keeps its own website / "Tickets & info" link as before.
//
// FEVER_AFFILIATE_TEMPLATE: the Impact tracking link for Fever with {url} where the Fever event page goes, for example
//   https://feverup.pxf.io/c/1234567/1234567/12345?u={url}
// ({url} is replaced by the event's Fever URL, URL-encoded; Impact's "u" deep-link parameter sends the visitor there).
// It must be one https:// link with exactly one {url} and no spaces or quotes.
//
// Which events: data/fever-events.json, { events: { "<our event id>": { url: "https://feverup.com/m/123456", ... } } },
// matched by hand against our own events by venue and date (never created from Fever's list). An event not in the file
// is never touched. Affiliate never changes which events show or their order.
//
// Where it shows (one button per event; with the button on, it is the event's main ticket button):
//   - the What's On card: a "Tickets ↗" link under the card's actions, with the short commission line;
//   - the event page: the main "Tickets ↗" button (instead of "Tickets & info"), with the commission line under the row;
//   - Build My Trip V4, "Book my trip": a step for that event when it is in the plan.
// Clicks: data-link="fever" (Build My Trip funnel bmt:<v>:book:fever; outbound_click link_type "fever").
// French: french-text.js translates the words on /fr pages (« Billets », the commission line).

const fs = require('fs');
const path = require('path');

const TEXT = {
  tickets: { en: 'Tickets', fr: 'Billets' },
  // Consistent with the site's commission line (places-to-stay.js DISCLOSURE), for tickets.
  disclosure: {
    en: 'We may earn a commission if you buy tickets through this link. It never changes which events we list or their order.',
    fr: 'Nous pouvons toucher une commission si vous achetez des billets par ce lien. Cela ne change jamais les événements affichés ni leur ordre.',
  },
};

const FEVER_URL_RE = /^https:\/\/(?:www\.)?feverup\.com\/[^\s"'<>]*$/i;
const isFeverUrl = (u) => typeof u === 'string' && FEVER_URL_RE.test(u.trim());

// The template, or '' when unset or not valid.
function cleanTemplate(t) {
  const s = String(t || '').trim();
  if (!/^https:\/\/[^\s"'<>]+$/i.test(s)) return '';
  if (s.split('{url}').length !== 2) return '';
  try { new URL(s.replace('{url}', 'x')); } catch (e) { return ''; }
  return s;
}
function config(env = process.env) {
  const template = cleanTemplate(env.FEVER_AFFILIATE_TEMPLATE);
  return { enabled: !!template, template };
}
const enabled = (env = process.env) => config(env).enabled;
// The tracking link for one Fever page, or null.
function affiliateUrl(feverUrl, cfg = config()) {
  if (!cfg || !cfg.enabled || !isFeverUrl(feverUrl)) return null;
  return cfg.template.replace('{url}', encodeURIComponent(feverUrl.trim()));
}

// FEVER_DATA_DIR: tests only (their own matches file); the site reads data/.
const dataDir = () => process.env.FEVER_DATA_DIR || path.join(__dirname, 'data');
let cache = null;
function loadMatches(file = path.join(dataDir(), 'fever-events.json')) {
  if (cache && cache.file === file) return cache.value;
  let value = {};
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (o && o.events && typeof o.events === 'object') value = o.events;
  } catch (e) { value = {}; }
  cache = { file, value };
  return value;
}
const clearCache = () => { cache = null; };

// -> { url (the tracking link), feverUrl } for one of our events, or null (off, not matched, bad URL).
function eventTickets(eventId, opts = {}) {
  const cfg = opts.cfg || config();
  if (!cfg.enabled) return null;
  const m = (opts.matches || loadMatches())[String(eventId)];
  const url = m && typeof m === 'object' ? affiliateUrl(m.url, cfg) : null;
  return url ? { url, feverUrl: m.url.trim() } : null;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const lang2 = (l) => (l === 'fr' ? 'fr' : 'en');
// The link itself (cls: the page's own button class). English words on English pages; french-text.js translates /fr.
function linkHtml(eventId, url, cls = '', lang = 'en') {
  return `<a${cls ? ` class="${escapeHtml(cls)}"` : ''} href="${escapeHtml(url)}" rel="sponsored noopener" target="_blank" data-track="booking" data-link="fever" data-event-id="${escapeHtml(eventId)}">${escapeHtml(TEXT.tickets[lang2(lang)])} <span aria-hidden="true">↗</span></a>`;
}
function disclosureHtml(lang = 'en', cls = 'fever-note') {
  return `<p class="${escapeHtml(cls)}" data-fever-disclosure style="margin:4px 0 0;font-size:0.76rem;line-height:1.4;opacity:0.75">${escapeHtml(TEXT.disclosure[lang2(lang)])}</p>`;
}
// The What's On card: one line under the card's actions. '' when off or not matched.
function cardHtml(eventId, lang = 'en', opts = {}) {
  const t = eventTickets(eventId, opts);
  if (!t) return '';
  return `<div class="whatson-fever" style="margin-top:8px">${linkHtml(eventId, t.url, 'cta secondary whatson-fever-btn', lang)}${disclosureHtml(lang)}</div>`;
}
// Build My Trip's "Book my trip" step for an event stop, or null. The id is "event-<id>" so it never collides with a
// business id in the sheet; eventId keeps the number.
function tripStep(event, opts = {}) {
  if (!event || !Number.isInteger(event.id)) return null;
  const t = eventTickets(event.id, opts);
  if (!t) return null;
  return { kind: 'event', id: `event-${event.id}`, eventId: event.id, name: String(event.name || ''), label: TEXT.tickets.en, labelFr: TEXT.tickets.fr, url: t.url, affiliate: true, rel: 'sponsored noopener', link: 'fever' };
}
function planEvents(plan) {
  if (!plan) return [];
  const stops = Array.isArray(plan.days) && plan.days.length ? plan.days.flatMap((d) => (d && d.stops) || [])
    : ((plan.itinerary && plan.itinerary.stops) || (plan.outing && plan.outing.stops) || []);
  const out = [], seen = new Set();
  for (const s of stops) {
    const e = s && s.event;
    if (e && Number.isInteger(e.id) && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
  }
  return out;
}
// Adds a step for each Fever event in the plan to every "Book my trip" list (the stays box's pick, its alternatives,
// V4's own list), in plan order, once each. The plan's stops are never touched.
function withTripSteps(plan, opts = {}) {
  if (!plan || typeof plan !== 'object') return plan;
  const steps = planEvents(plan).map((e) => tripStep(e, opts)).filter(Boolean);
  if (!steps.length) return plan;
  const add = (list) => { const l = Array.isArray(list) ? list.slice() : []; for (const s of steps) if (!l.some((x) => x && (x.id === s.id || x.url === s.url))) l.push(s); return l; };
  const w = plan.whereToStay;
  if (w && w.pick) {
    w.pick = { ...w.pick, bookingSteps: add(w.pick.bookingSteps) };
    w.alternatives = (w.alternatives || []).map((c) => ({ ...c, bookingSteps: add(c.bookingSteps) }));
    w.bookingSteps = add(w.bookingSteps);
  } else plan.v4Booking = { estimate: null, ...(plan.v4Booking || {}), steps: add(plan.v4Booking && plan.v4Booking.steps) };
  return plan;
}

// Event pages and What's On cards send outbound_click with link_type "fever" (the page's analytics, our own counts).
function clickScriptHtml(surface) {
  return `<script>
(function(){
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[data-link="fever"]') : null;
      if (!a || !window.trackEvent) return;
      window.trackEvent('outbound_click', { event_id: Number(a.getAttribute('data-event-id')) || 0, link_type: 'fever', surface: ${JSON.stringify(String(surface || ''))} });
    } catch (err) { /* counting must never break the site */ }
  });
})();
</script>`;
}

module.exports = { TEXT, config, enabled, cleanTemplate, isFeverUrl, affiliateUrl, loadMatches, clearCache, eventTickets, linkHtml, disclosureHtml, cardHtml, tripStep, planEvents, withTripSteps, clickScriptHtml };
