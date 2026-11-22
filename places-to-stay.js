'use strict';
// Places to stay (2026-11-19): hotels, motels, B&Bs, inns, lodges, resorts, cabins, campgrounds and guest houses, by town.
// Stored as ordinary venues rows with type 'stay' (the kind -- Hotel, Motel ... -- in the free-text `cuisine` column, the
// way outdoor, tour and indoor places keep their kind). Deliberately NOT in CATEGORY_SLUGS: stays have their own routes
// (/<town>/stays, /<town>/stays/<slug> and the /fr twins, see server.js) and stay out of every other list, the map, Roam
// Now, Build My Trip, Editor's Picks, search, the sitemap and llms.txt.
//
// Each place has a "Check rates" button. With an affiliate partner configured it goes to that partner's search for the
// place (we earn a commission if a visitor books; we never take payment), else to the place's own website. An owner's or
// admin's own booking link (venue_links.booking_url) always wins and is never marked as an affiliate link.
//
// Search engines (SEO freeze, Nov 2026): every stays page is noindex and out of the sitemap until STAYS_INDEXABLE opens
// it (all towns, or a comma-separated list of towns), so towns can be opened one at a time.
//
// Environment (all optional; everything defaults off):
//   STAY_AFFILIATE_PROVIDER  stay22 | booking | expedia | none   (default none)
//   STAY_AFFILIATE_ID        the partner's affiliate id (Stay22 "aid", Booking.com "aid", Expedia "affcid")
//   STAY_AFFILIATE_CAMPAIGN  optional campaign / label (Stay22 campaign, Booking.com label, Expedia afflid)
//   STAYS_INDEXABLE          off by default; "all" (or 1 / on / true) opens every town, "kelowna,penticton" opens those
//   STAYS_NAV                off by default; on shows a "Places to stay" link on a town's page when it has a stay

const STAY_TYPE = 'stay';
const STAY_SEGMENT = 'stays';
const STAY_LABEL = { en: 'Places to stay', fr: 'Hébergement' };

// The kinds shown on the card. key = what is stored (lower case) in venues.cuisine.
const STAY_KINDS = [
  { key: 'hotel', en: 'Hotel', fr: 'Hôtel' },
  { key: 'motel', en: 'Motel', fr: 'Motel' },
  { key: 'b&b', en: 'B&B', fr: 'Gîte (B&B)' },
  { key: 'inn', en: 'Inn', fr: 'Auberge' },
  { key: 'lodge', en: 'Lodge', fr: 'Lodge' },
  { key: 'resort', en: 'Resort', fr: 'Complexe hôtelier' },
  { key: 'cabin', en: 'Cabin', fr: 'Chalet' },
  { key: 'campground', en: 'Campground', fr: 'Camping' },
  { key: 'guest house', en: 'Guest house', fr: 'Maison d’hôtes' },
];
const KIND_ALIASES = { 'bed and breakfast': 'b&b', 'bed & breakfast': 'b&b', bnb: 'b&b', 'b and b': 'b&b', guesthouse: 'guest house', 'guest-house': 'guest house', cabins: 'cabin', campsite: 'campground', 'rv park': 'campground' };
function stayKind(raw) {
  const k = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = KIND_ALIASES[k] || k;
  return STAY_KINDS.find((x) => x.key === key) || null;
}
function stayKindLabel(raw, lang = 'en') {
  const kind = stayKind(raw);
  return kind ? kind[lang === 'fr' ? 'fr' : 'en'] : '';
}

const DISCLOSURE = {
  en: 'We may earn a commission if you book through these links. It never changes which places we list or their order.',
  fr: 'Nous pouvons toucher une commission si vous réservez par ces liens. Cela ne change jamais les lieux affichés ni leur ordre.',
};
const CHECK_RATES = { en: 'Check rates', fr: 'Voir les tarifs' };

const PROVIDERS = new Set(['stay22', 'booking', 'expedia', 'none']);
const on = (v) => ['1', 'on', 'true', 'yes', 'all'].includes(String(v || '').trim().toLowerCase());

function affiliateConfig(env = process.env) {
  const p = String(env.STAY_AFFILIATE_PROVIDER || 'none').trim().toLowerCase();
  const provider = PROVIDERS.has(p) ? p : 'none';
  const id = String(env.STAY_AFFILIATE_ID || '').trim();
  const campaign = String(env.STAY_AFFILIATE_CAMPAIGN || '').trim();
  return { provider: provider !== 'none' && id ? provider : 'none', id: provider !== 'none' ? id : '', campaign };
}

// STAYS_INDEXABLE: off (default) -> no town; all / 1 / on / true -> every town; "kelowna,penticton" -> those towns.
function staysIndexable(region, env = process.env) {
  const raw = String(env.STAYS_INDEXABLE || '').trim().toLowerCase();
  if (!raw || ['0', 'off', 'false', 'no', 'none'].includes(raw)) return false;
  if (on(raw)) return true;
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(String(region || '').toLowerCase());
}
function staysNavOn(env = process.env) { return on(env.STAYS_NAV); }

// ---- Affiliate link templates (one constant per partner, so a format change is one edit) ----
// Stay22 "Allez" deep link. Source: https://dev.stay22.com/docs/allez/parameters (and /docs/allez/quick-start), checked
// 2026-11-19: base https://www.stay22.com/allez/{provider}; /allez/roam lets Stay22 pick the best partner. aid is
// required; lat + lng (preferred, they win over address), address, hotelname (fuzzy match, best with address),
// campaign (use underscores: a hyphen splits it into two labels) and lang are query parameters.
const STAY22_ALLEZ_BASE = 'https://www.stay22.com/allez/roam';
// Booking.com affiliate search link: searchresults.html with ss (the search text), aid (affiliate id) and label
// (campaign). TODO: confirm against the Booking.com Affiliate Partner Centre once the account exists.
const BOOKING_SEARCH_BASE = 'https://www.booking.com/searchresults.html';
// Expedia hotel search link with the Expedia Group affiliate ids (affcid; afflid for the campaign). TODO: confirm the
// exact parameters in the Expedia Group Affiliate Program dashboard once the account exists (it may issue its own
// tracked short links instead).
const EXPEDIA_SEARCH_BASE = 'https://www.expedia.ca/Hotel-Search';

function fullAddress(venue, regionLabel) {
  const parts = [venue.address, regionLabel, 'BC', 'Canada'].map((x) => String(x || '').trim()).filter(Boolean);
  // The stored address often already ends "..., Kelowna, BC": say each part once.
  const out = [];
  for (const p of parts) if (!out.some((o) => o.toLowerCase().includes(p.toLowerCase()))) out.push(p);
  return out.join(', ');
}
const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));

function buildAffiliateUrl(venue, cfg, opts = {}) {
  const lang = opts.lang === 'fr' ? 'fr' : 'en';
  const address = fullAddress(venue, opts.regionLabel);
  const lat = num(venue.latitude); const lng = num(venue.longitude);
  const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);
  if (cfg.provider === 'stay22') {
    const q = new URLSearchParams();
    q.set('aid', cfg.id);
    q.set('hotelname', venue.name);
    if (address) q.set('address', address);
    if (hasLatLng) { q.set('lat', String(lat)); q.set('lng', String(lng)); }
    if (cfg.campaign) q.set('campaign', cfg.campaign.replace(/-/g, '_'));
    if (lang === 'fr') q.set('lang', 'fr');
    return `${STAY22_ALLEZ_BASE}?${q.toString()}`;
  }
  if (cfg.provider === 'booking') {
    const q = new URLSearchParams();
    q.set('ss', [venue.name, address].filter(Boolean).join(', '));
    q.set('aid', cfg.id);
    if (cfg.campaign) q.set('label', cfg.campaign);
    if (lang === 'fr') q.set('lang', 'fr');
    return `${BOOKING_SEARCH_BASE}?${q.toString()}`;
  }
  if (cfg.provider === 'expedia') {
    const q = new URLSearchParams();
    q.set('destination', [venue.name, address].filter(Boolean).join(', '));
    if (hasLatLng) q.set('latLong', `${lat},${lng}`);
    q.set('affcid', cfg.id);
    if (cfg.campaign) q.set('afflid', cfg.campaign);
    return `${EXPEDIA_SEARCH_BASE}?${q.toString()}`;
  }
  return null;
}

const httpUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : null);
function websiteUrl(w) {
  const s = String(w || '').trim();
  if (!s) return null;
  return httpUrl(/^https?:\/\//i.test(s) ? s : `https://${s}`);
}

// Where "Check rates" goes. -> { url, affiliate, source, rel, label } or null (no button).
// Rule (Dayton, 2026-11-21): the button always opens THIS place's own page, never a search or a map of the town.
//   1. the owner's / admin's own booking link (venue_links.booking_url): never an affiliate link;
//   2. the place's own Booking.com or Expedia listing from its stay info (opts.info.booking), through the affiliate
//      partner when one is set (stay-booking-links.js), else plain; then the researched own booking page (booking.own);
//   3. the place's own website;
//   4. nothing: no button.
// The old name search (Stay22 /allez/roam?hotelname=..., Booking.com / Expedia search) is never used: it landed on a
// search of the whole town, often with another place on top.
function stayRatesLink(venue, opts = {}) {
  if (!venue || venue.type !== STAY_TYPE) return null;
  const lang = opts.lang === 'fr' ? 'fr' : 'en';
  const links = opts.links || {};
  const label = CHECK_RATES[lang];
  const own = httpUrl(links.booking_url);
  if (own) return { url: own, affiliate: false, source: 'owner', rel: 'nofollow noopener', label };
  const info = opts.info && typeof opts.info === 'object' ? opts.info : null;
  if (info && info.booking && typeof info.booking === 'object') {
    // Lazy: stay-booking-links.js requires this file. No fallback there, so this never loops back here.
    const exact = require('./stay-booking-links').exactStayLinks({ id: venue.id, info }, null, { env: opts.env || process.env });
    const first = exact[0];
    if (first) return { url: first.url, affiliate: first.affiliate, source: first.key, rel: first.affiliate ? 'sponsored nofollow noopener' : 'nofollow noopener', label };
  }
  const site = websiteUrl(venue.website);
  if (site) return { url: site, affiliate: false, source: 'website', rel: 'nofollow noopener', label };
  return null;
}

// ---- Pages ----
const STAY_STYLES = `<style>
  body.stays-page .st-wrap { max-width: 980px; margin: 0 auto; }
  body.stays-page .st-kicker { margin: 0 0 4px; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; }
  body.stays-page h1 { margin: 0 0 8px; }
  body.stays-page .st-intro { margin: 0 0 18px; max-width: 640px; opacity: 0.85; }
  body.stays-page .st-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  body.stays-page .st-card { display: flex; flex-direction: column; background: #fff; border: 1px solid rgba(27,43,58,0.14); border-radius: 14px; overflow: hidden; }
  body.stays-page .st-card img { width: 100%; height: 150px; object-fit: cover; display: block; }
  body.stays-page .st-body { display: flex; flex-direction: column; gap: 4px; padding: 12px; flex: 1; }
  body.stays-page .st-meta { font-size: 0.78rem; font-weight: 700; opacity: 0.7; }
  body.stays-page .st-name { font-weight: 800; color: var(--ref-navy, #1B2B3A); text-decoration: none; overflow-wrap: anywhere; }
  body.stays-page .st-addr { font-size: 0.88rem; opacity: 0.8; margin: 0; }
  body.stays-page .st-rates { align-self: flex-start; display: inline-flex; align-items: center; min-height: 44px; margin-top: 6px; padding: 0 16px; border-radius: 999px; font-weight: 800; text-decoration: none; background: var(--ref-navy, #1B2B3A); color: #fff; }
  body.stays-page .st-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
  body.stays-page .st-actions a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; font-weight: 800; text-decoration: none; border: 1px solid var(--ref-navy, #1B2B3A); color: var(--ref-navy, #1B2B3A); }
  body.stays-page .st-actions a.st-rates { background: var(--ref-navy, #1B2B3A); color: #fff; margin-top: 0; }
  body.stays-page .st-credit { margin: -8px 0 14px; font-size: 12px; color: var(--ink-soft, #666); }
  body.stays-page .st-hero { width: 100%; max-height: 360px; object-fit: cover; border-radius: 14px; display: block; margin: 0 0 14px; }
  body.stays-page .st-disclosure { margin: 18px 0 0; font-size: 0.82rem; opacity: 0.75; max-width: 640px; }
  /* No photo (2026-11-19): the same plain sand panel with the mountain mark the venue cards use (CARD_V2_CSS), the
     same height as a photo, so a row of mixed cards still lines up. */
  body.stays-page .st-nophoto { display: block; width: 100%; height: 150px; background: #EEE8DC url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 24'%3E%3Cpath d='M3 20 14 7l7 8 10-12 12 14 7-7 10 10' fill='none' stroke='%23B7AB96' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 72px auto no-repeat; }
  body.stays-page .st-body > .st-rates { margin-top: auto; }
  body.stays-page .st-body > .st-addr { margin-bottom: 6px; }
  /* No photo on the place page: the plain dark title hero of the venue pages (.venue-hero-fallback in SEO_PAGE_CSS). */
  body.stays-page .st-titlehero { margin: 0 0 14px; border-radius: 14px; min-height: 170px; }
  body.stays-page .st-titlehero .venue-hero-type { color: rgba(255,255,255,0.85); }
  body.stays-page .st-titlehero h1 { margin: 0; color: #fff; font-family: 'Fraunces', 'Fraunces Fallback', serif; font-weight: 600; line-height: 1.15; font-size: clamp(1.7rem, 3.4vw, 2.4rem); overflow-wrap: anywhere; }
  body.stays-page .st-notes { margin: 0 0 18px; max-width: 640px; }
  body.stays-page .st-notes .st-intro { margin: 0 0 8px; }
  body.stays-page .st-tips { margin: 0; padding-left: 1.2em; opacity: 0.85; }
  body.stays-page .st-tips li { margin: 0 0 4px; }
  /* Close by (2026-11-19): up to four of our listings within 2 km, with type and straight-line distance. */
  body.stays-page .st-near { margin: 22px 0 8px; }
  body.stays-page .st-near h2 { font-size: 1.05rem; margin: 0 0 4px; }
  body.stays-page .st-near-note { margin: 0 0 10px; font-size: 0.82rem; opacity: 0.7; }
  body.stays-page .st-near-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  body.stays-page .st-near-list a { display: flex; flex-direction: column; gap: 2px; min-height: 44px; padding: 10px 12px; border: 1px solid rgba(27,43,58,0.14); border-radius: 12px; background: #fff; text-decoration: none; color: var(--ref-navy, #1B2B3A); }
  body.stays-page .st-near-name { font-weight: 800; overflow-wrap: anywhere; }
  body.stays-page .st-near-list a:hover .st-near-name { text-decoration: underline; }
  body.stays-page .st-near-meta { font-size: 0.8rem; font-weight: 700; opacity: 0.7; }
  /* Stay info (2026-11-20): the facts list under the address on a stay's page (.st-know), and the guests chip on the list. */
  body.stays-page .st-know { margin: 10px 0 4px; max-width: 640px; }
  body.stays-page .st-know h2 { font-size: 1.05rem; margin: 0 0 4px; }
  body.stays-page .st-know ul { margin: 0; padding-left: 1.2em; }
  body.stays-page .st-know li { margin: 0 0 3px; }
  body.stays-page .st-chip { align-self: flex-start; display: inline-block; margin: 0 0 4px; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #EEE8DC; color: var(--ref-navy, #1B2B3A); }
  @media (max-width: 860px) { body.stays-page .st-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { body.stays-page .st-list, body.stays-page .st-near-list { grid-template-columns: 1fr; } }
</style>`;

function stayPath(venue, lang = 'en') { return `${lang === 'fr' ? '/fr' : ''}/${venue.region}/${STAY_SEGMENT}/${venue.slug}`; }
function staysListPath(region, lang = 'en') { return `${lang === 'fr' ? '/fr' : ''}/${region}/${STAY_SEGMENT}`; }

function ratesButtonHtml(link, venue, esc, extraClass = '') {
  if (!link) return '';
  return `<a class="st-rates${extraClass}" href="${esc(link.url)}" rel="${link.rel}" target="_blank" data-track="stay_click" data-stay-id="${venue.id}"${link.affiliate ? ' data-affiliate="1"' : ''}>${esc(link.label)}</a>`;
}
function disclosureHtml(lang) {
  return `<p class="st-disclosure" data-stay-disclosure>${DISCLOSURE[lang === 'fr' ? 'fr' : 'en']}</p>`;
}

// List page script: report each Check rates tap as stay_click through the same outbound-click logging the place pages
// use (window.trackEvent -> /api/venue-event; bots, our own visits and own-UA scripts are filtered on the server).
const LIST_CLICK_SCRIPT = `<script>
document.addEventListener('click', function(e){
  try {
    var a = e.target && e.target.closest ? e.target.closest('a[data-stay-id]') : null;
    if (!a || !window.trackEvent) return;
    var p = { venue_id: Number(a.getAttribute('data-stay-id')), venue_category: 'stay', surface: 'stays_list', link_type: 'stay_click' };
    window.trackEvent('outbound_click', p);
    var q = { venue_id: p.venue_id, click_key: 'stay_click' };
    window.trackEvent('page_click', q);
  } catch (err) { /* counting must never break the site */ }
});
</script>`;

// deps: { origin, siteName, pageHead, analyticsHead, headerHtml, footerHtml, appScript, escapeHtml, breadcrumbSchema, links(venueId), indexable(region), engagementScript(venue), stayInfo(venueId) (optional) }
function renderStaysListPage({ region, regionLabel, stays, lang = 'en' }, deps) {
  const origin = deps.origin || 'https://okanaganroam.com';
  const siteName = deps.siteName || 'Okanagan Roam';
  const fr = lang === 'fr';
  const esc = deps.escapeHtml;
  const town = regionLabel;
  const label = STAY_LABEL[fr ? 'fr' : 'en'];
  const title = fr ? `${label} à ${town}, C.-B. | ${siteName}` : `${label} in ${town}, BC | ${siteName}`;
  // Town notes (2026-11-19, data/stays-town-notes.json): "Where to stay in <town>" intro + tips; a town without one
  // keeps the generic line. The note also becomes the meta description.
  const note = townNoteFor(region, lang, deps.townNotes);
  const description = note ? metaFromNote(note.text) : fr
    ? `Hôtels, motels, gîtes et autres lieux où dormir à ${town}, C.-B.`
    : `Hotels, motels, B&Bs and other places to stay in ${town}, BC.`;
  const canonical = `${origin}${staysListPath(region, lang)}`;
  const indexable = !fr && deps.indexable(region);
  let anyAffiliate = false;
  const cards = stays.map((v) => {
    const link = stayRatesLink(v, { lang, links: deps.links(v.id), regionLabel: town, env: deps.env, info: deps.stayInfo ? deps.stayInfo(v.id) : null });
    if (link && link.affiliate) anyAffiliate = true;
    const kind = stayKindLabel(v.cuisine, lang);
    const photo = v.image_url && /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(v.image_url).trim()) ? String(v.image_url).trim() : '';
    return `<li class="st-card" data-venue-id="${v.id}"${photo ? '' : ' data-ph="none"'}>${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" width="480" height="270">` : '<span class="st-nophoto" aria-hidden="true"></span>'}<div class="st-body">
      <span class="st-meta">${esc([kind, town].filter(Boolean).join(' · '))}</span>
      <a class="st-name" href="${stayPath(v, lang)}">${esc(v.name)}</a>
      ${v.address ? `<p class="st-addr">${esc(v.address)}</p>` : ''}
      ${staySleepsChip(deps.stayInfo ? deps.stayInfo(v.id) : null, lang)}
      ${ratesButtonHtml(link, v, esc)}
    </div></li>`;
  }).join('\n    ');
  const crumbs = [{ name: fr ? 'Accueil' : 'Home', url: `${origin}${fr ? '/fr' : '/'}` }, { name: town, url: `${origin}${fr ? '/fr' : ''}/${region}` }, { name: label, url: canonical }];
  return `<!DOCTYPE html>
<html lang="${fr ? 'fr-CA' : 'en'}">
<head>
${deps.pageHead(title, description, indexable ? canonical : null, [deps.breadcrumbSchema(crumbs)], { golfTheme: true, noindex: !indexable, locale: fr ? 'fr_CA' : null })}
${deps.analyticsHead('category')}
${STAY_STYLES}
</head>
<body class="golf-page stays-page" data-stays-region="${esc(region)}">
${deps.headerHtml()}
  <main class="wrap-wide golf-main" id="main">
  <div class="st-wrap">
  <nav class="breadcrumb" aria-label="${fr ? 'Fil d’Ariane' : 'Breadcrumb'}"><a href="${fr ? '/fr' : '/'}">${fr ? 'Accueil' : 'Home'}</a> &rsaquo; <a href="${fr ? '/fr' : ''}/${esc(region)}">${esc(town)}</a> &rsaquo; ${esc(label)}</nav>
  <p class="st-kicker">${esc(town)}</p>
  <h1>${fr ? `${esc(label)} à ${esc(town)}` : `${esc(label)} in ${esc(town)}`}</h1>
  ${note ? townNoteHtml(note, esc) : `<p class="st-intro">${fr ? 'Hôtels, motels, gîtes, auberges et autres lieux où dormir, par ordre alphabétique.' : 'Hotels, motels, B&amp;Bs, inns and other places to stay, in alphabetical order.'}</p>`}
  <ul class="st-list">
    ${cards}
  </ul>
  ${anyAffiliate ? disclosureHtml(lang) : ''}
  </div>
  </main>
  ${deps.footerHtml()}
  ${deps.appScript}
${LIST_CLICK_SCRIPT}
</body>
</html>`;
}

function renderStayVenuePage({ venue, regionLabel, lang = 'en', closeBy = [] }, deps) {
  const origin = deps.origin || 'https://okanaganroam.com';
  const siteName = deps.siteName || 'Okanagan Roam';
  const fr = lang === 'fr';
  const esc = deps.escapeHtml;
  const town = regionLabel;
  const label = STAY_LABEL[fr ? 'fr' : 'en'];
  const kind = stayKindLabel(venue.cuisine, lang);
  const title = `${venue.name}, ${town}${fr ? ', C.-B.' : ', BC'} | ${siteName}`;
  const descFr = fr && venue.description_fr && String(venue.description_fr).trim() ? String(venue.description_fr).trim() : '';
  const desc = descFr || String(venue.description || '').trim();
  const description = (desc || `${kind || label} ${fr ? 'à' : 'in'} ${town}`).slice(0, 300);
  const canonical = `${origin}${stayPath(venue, lang)}`;
  const indexable = !fr && deps.indexable(venue.region);
  const link = stayRatesLink(venue, { lang, links: deps.links(venue.id), regionLabel: town, env: deps.env, info: deps.stayInfo ? deps.stayInfo(venue.id) : null });
  const site = websiteUrl(venue.website);
  const photo = venue.image_url && /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(venue.image_url).trim()) ? String(venue.image_url).trim() : '';
  const crumbs = [{ name: fr ? 'Accueil' : 'Home', url: `${origin}${fr ? '/fr' : '/'}` }, { name: town, url: `${origin}${fr ? '/fr' : ''}/${venue.region}` }, { name: label, url: `${origin}${staysListPath(venue.region, lang)}` }, { name: venue.name, url: canonical }];
  const actions = [
    ratesButtonHtml(link, venue, esc),
    site && !(link && link.source === 'website') ? `<a href="${esc(site)}" rel="nofollow noopener" target="_blank" data-track="website">${fr ? 'Site Web ↗' : 'Website ↗'}</a>` : '',
    venue.phone ? `<a href="${esc(require('./tel-href.js').telHref(venue.phone))}" data-track="phone">${fr ? 'Appeler' : 'Call'}</a>` : '',
  ].filter(Boolean).join('\n    ');
  return `<!DOCTYPE html>
<html lang="${fr ? 'fr-CA' : 'en'}">
<head>
${deps.pageHead(title, description, indexable ? canonical : null, [deps.breadcrumbSchema(crumbs)], { golfTheme: true, noindex: !indexable, locale: fr ? 'fr_CA' : null })}
${deps.analyticsHead('venue')}
${STAY_STYLES}
</head>
<body class="golf-page stays-page stay-venue-page" data-venue-id="${venue.id}">
${deps.headerHtml()}
  <main class="wrap-wide golf-main" id="main">
  <div class="st-wrap">
  <nav class="breadcrumb" aria-label="${fr ? 'Fil d’Ariane' : 'Breadcrumb'}"><a href="${fr ? '/fr' : '/'}">${fr ? 'Accueil' : 'Home'}</a> &rsaquo; <a href="${fr ? '/fr' : ''}/${esc(venue.region)}">${esc(town)}</a> &rsaquo; <a href="${staysListPath(venue.region, lang)}">${esc(label)}</a> &rsaquo; ${esc(venue.name)}</nav>
  ${photo ? `<img class="st-hero" src="${esc(photo)}" alt="${esc(venue.name)}" width="980" height="360">
  ${photoCreditFor(photo) ? `<p class="st-credit">${fr ? 'Photo :' : 'Photo:'} ${esc(photoCreditFor(photo))}</p>` : ''}
  <p class="st-kicker">${esc([kind, town].filter(Boolean).join(' · '))}</p>
  <h1>${esc(venue.name)}</h1>` : `<div class="venue-hero venue-hero-fallback st-titlehero" data-ph="none">
    <span class="venue-hero-type">${esc([kind, town].filter(Boolean).join(' · '))}</span>
    <h1>${esc(venue.name)}</h1>
  </div>`}
  ${desc ? `<p class="st-intro"${fr && !descFr ? ' lang="en"' : ''}>${esc(desc)}</p>` : ''}
  ${venue.address ? `<p class="st-addr">${esc(venue.address)}</p>` : ''}
  ${stayInfoHtml(deps.stayInfo ? deps.stayInfo(venue.id) : null, lang, esc)}
  ${actions ? `<div class="st-actions">
    ${actions}
  </div>` : ''}
  ${link && link.affiliate ? disclosureHtml(lang) : ''}
  ${closeByHtml(closeBy, lang, deps)}
  <p><a href="${staysListPath(venue.region, lang)}">${fr ? `← ${esc(label)} à ${esc(town)}` : `← ${esc(label)} in ${esc(town)}`}</a></p>
  </div>
  </main>
  ${deps.footerHtml()}
  ${deps.appScript}
${deps.engagementScript(venue)}
</body>
</html>`;
}


// ---- Close by (2026-11-19) ----
// Up to four of our own listings within 2 km (straight line) of a stay: food & drink first, then things to do, nearest
// first within each, and a mix when both are near (two of each, the spare places going to whichever is nearer). Skips
// other stays, hidden or redirected listings, places with no page, and places closed now (closedIds: a written
// "not operating" advisory or closed for the season). Pure: the server passes the candidates and its distance helper
// (venueDistanceKm, the one the venue pages' Close by uses).
const CLOSE_BY_KM = 2;
const CLOSE_BY_LIMIT = 4;
const CLOSE_BY_FOOD_DRINK = ['restaurant', 'cafe', 'winery', 'brewery', 'pub'];
const CLOSE_BY_THINGS_TO_DO = ['outdoor', 'beach', 'indoor', 'tour'];
const CLOSE_BY_TYPES = [...CLOSE_BY_FOOD_DRINK, ...CLOSE_BY_THINGS_TO_DO];
const CLOSE_BY_LABEL = { en: 'Close by', fr: 'À proximité' };
const CLOSE_BY_NOTE = { en: 'Straight-line distances from this place.', fr: 'Distances à vol d’oiseau depuis ce lieu.' };
function pickStayCloseBy(stay, candidates, opts = {}) {
  const distanceKm = opts.distanceKm;
  const closed = opts.closedIds || new Set();
  const maxKm = opts.maxKm || CLOSE_BY_KM;
  const limit = opts.limit || CLOSE_BY_LIMIT;
  if (!stay || typeof distanceKm !== 'function') return [];
  const seen = new Set([stay.id]);
  const rows = (candidates || []).filter((v) => v && !seen.has(v.id) && seen.add(v.id) && v.type !== STAY_TYPE && CLOSE_BY_TYPES.includes(v.type)
    && v.slug && !v.redirect_to && !closed.has(v.id))
    .map((v) => ({ v, km: distanceKm(stay, v) }))
    .filter((x) => typeof x.km === 'number' && Number.isFinite(x.km) && x.km <= maxKm)
    .sort((a, b) => a.km - b.km || String(a.v.name).localeCompare(String(b.v.name)));
  const food = rows.filter((x) => CLOSE_BY_FOOD_DRINK.includes(x.v.type));
  const todo = rows.filter((x) => CLOSE_BY_THINGS_TO_DO.includes(x.v.type));
  const half = Math.ceil(limit / 2);
  const picked = new Set([...food.slice(0, half), ...todo.slice(0, limit - half)]);
  for (const x of rows) { if (picked.size >= limit) break; picked.add(x); }
  const inOrder = (list) => list.filter((x) => picked.has(x));
  return [...inOrder(food), ...inOrder(todo)].slice(0, limit).map((x) => ({ ...x, group: CLOSE_BY_FOOD_DRINK.includes(x.v.type) ? 'food_drink' : 'things_to_do' }));
}
// "350 m" under 1 km (to the nearest 10 m), "1.2 km" from 1 km ("1,2 km" in French).
function formatStayDistance(km, lang = 'en') {
  const m = Math.max(10, Math.round((Number(km) * 1000) / 10) * 10);
  if (m < 1000) return `${m} m`;
  const k = (Math.round(Number(km) * 10) / 10).toFixed(1);
  return `${lang === 'fr' ? k.replace('.', ',') : k} km`;
}
// deps: escapeHtml, typeLabel(type, lang), venueHref(venue, lang). Nothing near -> no section.
function closeByHtml(items, lang, deps) {
  if (!items || !items.length) return '';
  const fr = lang === 'fr';
  const esc = deps.escapeHtml;
  const li = items.map(({ v, km }) => {
    const type = (deps.typeLabel && deps.typeLabel(v.type, lang)) || v.type;
    return `<li data-venue-id="${Number(v.id)}"><a href="${esc(deps.venueHref(v, lang))}"><span class="st-near-name">${esc(v.name)}</span><span class="st-near-meta">${esc(type)} · ${esc(formatStayDistance(km, lang))}</span></a></li>`;
  }).join('\n      ');
  return `<section class="st-near" aria-labelledby="stNearHead" data-stay-close-by>
    <h2 id="stNearHead">${CLOSE_BY_LABEL[fr ? 'fr' : 'en']}</h2>
    <p class="st-near-note">${CLOSE_BY_NOTE[fr ? 'fr' : 'en']}</p>
    <ul class="st-near-list">
      ${li}
    </ul>
  </section>`;
}

// ---- Town notes (2026-11-19) ----
// data/stays-town-notes.json: { "<region-slug>": { "en": "...", "fr": "...", "tips": [{ "en": "...", "fr": "..." }] } }.
// Read when it changes (a content update is a file drop-in). setTownNotes() replaces it (tests).
const TOWN_NOTES_FILE = require('path').join(__dirname, 'data', 'stays-town-notes.json');
let _townNotes = { mtime: -1, data: {} };
let _townNotesOverride = null;
function loadTownNotes(file = TOWN_NOTES_FILE) {
  if (_townNotesOverride) return _townNotesOverride;
  try {
    const fs = require('fs');
    const mtime = fs.statSync(file).mtimeMs;
    if (mtime !== _townNotes.mtime) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      _townNotes = { mtime, data: data && typeof data === 'object' && !Array.isArray(data) ? data : {} };
    }
    return _townNotes.data;
  } catch (e) { return {}; }
}
function setTownNotes(data) { _townNotesOverride = data || null; }
const clean = (x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '');
// -> { text, textLang, tips: [{ text, lang }] } or null. French falls back to the English text (marked lang="en").
function townNoteFor(region, lang = 'en', notes) {
  const all = notes || loadTownNotes();
  const entry = all && Object.prototype.hasOwnProperty.call(all, region) ? all[region] : null;
  if (!entry || typeof entry !== 'object') return null;
  const fr = lang === 'fr';
  const pick = (o) => { const f = fr ? clean(o && o.fr) : ''; return f ? { text: f, lang: 'fr' } : { text: clean(o && o.en), lang: 'en' }; };
  const main = pick(entry);
  if (!main.text) return null;
  const tips = (Array.isArray(entry.tips) ? entry.tips : []).map(pick).filter((t) => t.text).map((t) => ({ text: t.text, lang: t.lang }));
  return { text: main.text, textLang: main.lang, tips, lang: fr ? 'fr' : 'en' };
}
function metaFromNote(text) {
  const t = clean(text);
  if (t.length <= 300) return t;
  const cut = t.slice(0, 297);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 200 ? cut.lastIndexOf(' ') : 297)}…`;
}
function townNoteHtml(note, esc) {
  const langAttr = (l) => (l !== note.lang ? ` lang="${l}"` : '');
  const tips = note.tips.length ? `\n    <ul class="st-tips">${note.tips.map((t) => `<li${langAttr(t.lang)}>${esc(t.text)}</li>`).join('')}</ul>` : '';
  return `<div class="st-notes" data-stay-town-note>
    <p class="st-intro"${langAttr(note.textLang)}>${esc(note.text)}</p>${tips}
  </div>`;
}

// Photo credit for a stay's photo (2026-11-19), from the same credits file every listing uses. "Photo:" is added on the page.
let _stayCredits = null;
function photoCreditFor(url) {
  try {
    if (!_stayCredits) _stayCredits = require('./data/venue-photo-credits.json');
    return String(_stayCredits[String(url).split('?')[0]] || '').replace(/^\s*photos?\s*:\s*/i, '').trim();
  } catch (e) { return ''; }
}

// ---- Stay info (2026-11-20) ----
// Extra facts about each place to stay (drafts/stays-2026-11/stay-info-schema.md), one JSON object per stay in the
// stay_info table (db.js), written only through POST /admin/stay-info (scripts/apply-stay-info.js). Build My Trip will
// use it later to choose a base and pre-fill booking links; for now the stay's own page shows a short "Good to know"
// list and the town list a "Sleeps N" chip. sources, confidence and the booking links are stored but never shown yet.
// Every field is optional and may be null ("not known"; never guessed).
const STAY_INFO_KEYS = ['max_guests', 'unit_types', 'bedrooms_max', 'price_level', 'pets', 'kitchen', 'pool', 'hot_tub', 'parking',
  'accessible', 'adults_only', 'kid_friendly', 'check_in', 'check_out', 'min_nights', 'min_nights_note', 'open_months',
  'booking', 'sources', 'confidence', 'checked_at'];
const STAY_UNIT_TYPES = ['room', 'suite', 'studio', 'apartment', 'cabin', 'cottage', 'house', 'condo', 'rv_site', 'tent_site', 'dorm_bed', 'glamping'];
const STAY_INFO_ENUMS = { pets: ['yes', 'no', 'some'], kitchen: ['all', 'some', 'none'], parking: ['free', 'paid', 'none'], confidence: ['high', 'medium', 'low'] };
const STAY_INFO_BOOLEANS = ['pool', 'hot_tub', 'accessible', 'adults_only', 'kid_friendly'];
const STAY_BOOKING_KEYS = ['own', 'booking_com', 'expedia'];
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// A URL in the query string of which an affiliate or tracking tag appears (aid=, label=, affiliate, utm_).
function hasTrackingParams(u) {
  const q = String(u.search || '').toLowerCase();
  return /(?:^\?|[?&;])(?:aid|label)=/.test(q) || q.includes('affiliate') || q.includes('utm_');
}
// -> error text or null. https only, no user:password, no tracking tags.
function stayUrlError(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 600) return `${field} must be a URL (at most 600 characters).`;
  let u;
  try { u = new URL(value.trim()); } catch (e) { return `${field} must be an absolute URL.`; }
  if (u.protocol !== 'https:') return `${field} must use https.`;
  if (u.username || u.password) return `${field} must not contain credentials.`;
  if (!u.hostname.includes('.')) return `${field} must have a real domain.`;
  if (hasTrackingParams(u)) return `${field} has an affiliate or tracking parameter (aid=, label=, affiliate, utm_); use the plain listing URL.`;
  return null;
}
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// -> { ok, errors: [text] }. Only the schema's keys; every value null or the right type / enum value.
function validateStayInfo(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['info must be a JSON object.'] };
  for (const k of Object.keys(obj)) if (!STAY_INFO_KEYS.includes(k)) errors.push(`Unknown field: ${k}.`);
  const has = (k) => Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null;
  if (has('max_guests') && !intIn(obj.max_guests, 1, 500)) errors.push('max_guests must be a whole number from 1 to 500, or null.');
  if (has('bedrooms_max') && !intIn(obj.bedrooms_max, 0, 50)) errors.push('bedrooms_max must be a whole number from 0 to 50, or null.');
  if (has('min_nights') && !intIn(obj.min_nights, 1, 365)) errors.push('min_nights must be a whole number from 1 to 365, or null.');
  if (has('price_level') && !intIn(obj.price_level, 1, 4)) errors.push('price_level must be 1, 2, 3 or 4, or null.');
  if (has('unit_types')) {
    if (!Array.isArray(obj.unit_types)) errors.push('unit_types must be a list.');
    else {
      for (const t of obj.unit_types) if (!STAY_UNIT_TYPES.includes(t)) errors.push(`unit_types: "${String(t)}" is not one of ${STAY_UNIT_TYPES.join(', ')}.`);
      if (new Set(obj.unit_types).size !== obj.unit_types.length) errors.push('unit_types lists a type twice.');
    }
  }
  for (const [k, allowed] of Object.entries(STAY_INFO_ENUMS)) {
    if (has(k) && !allowed.includes(obj[k])) errors.push(`${k} must be one of ${allowed.join(', ')}, or null.`);
  }
  for (const k of STAY_INFO_BOOLEANS) if (has(k) && typeof obj[k] !== 'boolean') errors.push(`${k} must be true, false or null.`);
  for (const k of ['check_in', 'check_out']) if (has(k) && (typeof obj[k] !== 'string' || !TIME_RE.test(obj[k]))) errors.push(`${k} must be a 24-hour time like 15:00, or null.`);
  if (has('min_nights_note') && (typeof obj.min_nights_note !== 'string' || !obj.min_nights_note.trim() || obj.min_nights_note.length > 160 || /[<>]/.test(obj.min_nights_note))) {
    errors.push('min_nights_note must be short plain text (at most 160 characters), or null.');
  }
  if (has('open_months')) {
    const m = obj.open_months;
    if (!Array.isArray(m) || !m.every((x) => intIn(x, 1, 12))) errors.push('open_months must be a list of month numbers 1 to 12.');
    else if (new Set(m).size !== m.length) errors.push('open_months lists a month twice.');
  }
  if (has('checked_at') && !validDate(obj.checked_at)) errors.push('checked_at must be a date like 2026-11-20, or null.');
  if (has('sources')) {
    if (!Array.isArray(obj.sources) || obj.sources.length > 30) errors.push('sources must be a list of at most 30 URLs.');
    else obj.sources.forEach((s, i) => { const e = stayUrlError(s, `sources[${i}]`); if (e) errors.push(e); });
  }
  if (has('booking')) {
    const b = obj.booking;
    if (typeof b !== 'object' || Array.isArray(b)) errors.push('booking must be an object with own, booking_com and expedia.');
    else {
      for (const k of Object.keys(b)) if (!STAY_BOOKING_KEYS.includes(k)) errors.push(`Unknown field: booking.${k}.`);
      for (const k of STAY_BOOKING_KEYS) {
        if (b[k] === null || b[k] === undefined) continue;
        const e = stayUrlError(b[k], `booking.${k}`);
        if (e) { errors.push(e); continue; }
        const u = new URL(b[k].trim());
        const host = u.hostname.toLowerCase();
        if (k === 'booking_com' && !((host === 'booking.com' || host.endsWith('.booking.com')) && /^\/hotel\/[a-z]{2}\/[^/]+\.html$/i.test(u.pathname))) {
          errors.push('booking.booking_com must be a Booking.com hotel page (https://www.booking.com/hotel/ca/<name>.html).');
        }
        if (k === 'expedia' && !(/(?:^|\.)expedia\.[a-z.]{2,6}$/.test(host) && /Hotel-Information/i.test(u.pathname))) {
          errors.push('booking.expedia must be an Expedia hotel page (https://www.expedia.ca/...Hotel-Information).');
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
// The stored form: the schema's keys in the schema's order (a valid object only), so the same facts are the same text.
function normalizeStayInfo(obj) {
  const out = {};
  for (const k of STAY_INFO_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    let v = obj[k];
    if (typeof v === 'string') v = v.trim();
    if (k === 'booking' && v) { const b = {}; for (const bk of STAY_BOOKING_KEYS) if (Object.prototype.hasOwnProperty.call(v, bk)) b[bk] = typeof v[bk] === 'string' ? v[bk].trim() : v[bk]; v = b; }
    if (k === 'sources' && Array.isArray(v)) v = v.map((s) => s.trim());
    out[k] = v;
  }
  return out;
}

// ---- Showing it ----
const UNIT_TYPE_LABELS = {
  room: { en: 'rooms', fr: 'chambres' }, suite: { en: 'suites', fr: 'suites' }, studio: { en: 'studios', fr: 'studios' },
  apartment: { en: 'apartments', fr: 'appartements' }, cabin: { en: 'cabins', fr: 'chalets' }, cottage: { en: 'cottages', fr: 'cottages' },
  house: { en: 'houses', fr: 'maisons' }, condo: { en: 'condos', fr: 'condos' }, rv_site: { en: 'RV sites', fr: 'emplacements pour VR' },
  tent_site: { en: 'tent sites', fr: 'emplacements de tente' }, dorm_bed: { en: 'dorm beds', fr: 'lits en dortoir' }, glamping: { en: 'glamping', fr: 'prêt-à-camper' },
};
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// "15:00" -> "3 pm" / "15 h"; "10:30" -> "10:30 am" / "10 h 30".
function formatStayTime(hhmm, lang = 'en') {
  if (typeof hhmm !== 'string' || !TIME_RE.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (lang === 'fr') return `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
// Month numbers -> runs of months in calendar order, a run may wrap past December ([11,12,1,2] -> one run Nov-Feb).
function monthRuns(months) {
  const set = new Set(months);
  const runs = [];
  // Start each run at a month whose previous month is closed; walk forward.
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!set.has(m) || set.has(prev)) continue;
    let end = m; let len = 1;
    while (len < 12 && set.has(end === 12 ? 1 : end + 1)) { end = end === 12 ? 1 : end + 1; len++; }
    runs.push([m, end]);
  }
  return runs;
}
function openMonthsText(months, lang = 'en') {
  if (!Array.isArray(months) || !months.length) return '';
  const valid = [...new Set(months.filter((x) => intIn(x, 1, 12)))];
  if (!valid.length || valid.length === 12) return '';
  const fr = lang === 'fr';
  const names = MONTHS[fr ? 'fr' : 'en'];
  const runs = monthRuns(valid);
  if (runs.length === 1) {
    const [a, b] = runs[0];
    if (a === b) return fr ? `Ouvert en ${names[a - 1]}` : `Open in ${names[a - 1]}`;
    return fr ? `Ouvert de ${names[a - 1]} à ${names[b - 1]}` : `Open ${names[a - 1]}–${names[b - 1]}`;
  }
  const parts = runs.map(([a, b]) => (a === b ? names[a - 1] : `${names[a - 1]}–${names[b - 1]}`));
  return fr ? `Ouvert : ${parts.join(', ')}` : `Open ${parts.join(', ')}`;
}

// The "Good to know" lines for a stay's page: [{ key, text, lang? }]. A null (or missing) value hides its line.
// Never sources, confidence or booking links. price_level shows only as $ symbols.
function stayInfoLines(info, lang = 'en') {
  if (!info || typeof info !== 'object') return [];
  const fr = lang === 'fr';
  const out = [];
  if (intIn(info.max_guests, 1, 500)) out.push({ key: 'max_guests', text: fr ? `Jusqu’à ${info.max_guests} personne${info.max_guests > 1 ? 's' : ''}` : `Sleeps up to ${info.max_guests}` });
  const units = Array.isArray(info.unit_types) ? info.unit_types.filter((t) => UNIT_TYPE_LABELS[t]).map((t) => UNIT_TYPE_LABELS[t][fr ? 'fr' : 'en']) : [];
  if (units.length) out.push({ key: 'unit_types', text: upperFirst(units.join(', ')) });
  if (intIn(info.price_level, 1, 4)) out.push({ key: 'price_level', text: `${fr ? 'Prix habituel :' : 'Typical price:'} ${'$'.repeat(info.price_level)}` });
  const ci = formatStayTime(info.check_in, lang); const co = formatStayTime(info.check_out, lang);
  const times = [ci ? (fr ? `Arrivée dès ${ci}` : `Check-in from ${ci}`) : '', co ? (fr ? `Départ ${co}` : `Check-out ${co}`) : ''].filter(Boolean);
  if (times.length) out.push({ key: 'times', text: times.join(' · ') });
  const note = typeof info.min_nights_note === 'string' ? clean(info.min_nights_note) : '';
  if (intIn(info.min_nights, 2, 365)) {
    const n = info.min_nights;
    out.push({ key: 'min_nights', text: fr ? `Minimum ${n} nuits` : `Minimum ${n} nights`, note: note || null });
  } else if (note) {
    out.push({ key: 'min_nights', text: '', note });
  }
  const pets = { yes: { en: 'Pets welcome', fr: 'Animaux acceptés' }, no: { en: 'No pets', fr: 'Animaux non acceptés' }, some: { en: 'Pets welcome in some units', fr: 'Animaux acceptés dans certaines unités' } }[info.pets];
  if (pets) out.push({ key: 'pets', text: pets[fr ? 'fr' : 'en'] });
  const kitchen = { all: { en: 'Kitchen in every unit', fr: 'Cuisine dans chaque unité' }, some: { en: 'Kitchen in some units', fr: 'Cuisine dans certaines unités' } }[info.kitchen];
  if (kitchen) out.push({ key: 'kitchen', text: kitchen[fr ? 'fr' : 'en'] });
  const extras = [
    info.pool === true ? (fr ? 'Piscine' : 'Pool') : '',
    info.hot_tub === true ? (fr ? 'Bain à remous' : 'Hot tub') : '',
    info.parking === 'free' ? (fr ? 'Stationnement gratuit' : 'Free parking') : info.parking === 'paid' ? (fr ? 'Stationnement payant' : 'Paid parking') : '',
  ].filter(Boolean);
  if (extras.length) out.push({ key: 'amenities', text: extras.join(' · ') });
  if (info.adults_only === true) out.push({ key: 'adults_only', text: fr ? 'Adultes seulement' : 'Adults only' });
  const open = openMonthsText(info.open_months, lang);
  if (open) out.push({ key: 'open_months', text: open });
  return out;
}
// "Good to know" under the address; '' when there is nothing to say. The minimum-stay note is written in English, so
// on a French page it is marked lang="en".
function stayInfoHtml(info, lang, esc) {
  const lines = stayInfoLines(info, lang);
  if (!lines.length) return '';
  const fr = lang === 'fr';
  const li = lines.map((l) => {
    const note = l.note ? (l.text ? ` <span${fr ? ' lang="en"' : ''}>(${esc(l.note)})</span>` : `<span${fr ? ' lang="en"' : ''}>${esc(upperFirst(l.note))}</span>`) : '';
    return `<li data-stay-info-line="${l.key}">${esc(l.text)}${note}</li>`;
  }).join('');
  return `<section class="st-know" aria-labelledby="stKnowHead" data-stay-info>
    <h2 id="stKnowHead">${fr ? 'Bon à savoir' : 'Good to know'}</h2>
    <ul>${li}</ul>
  </section>`;
}
// The list card's chip: "Sleeps 6" / "Jusqu’à 6 pers." when max_guests is known.
function staySleepsChip(info, lang = 'en') {
  if (!info || !intIn(info.max_guests, 1, 500)) return '';
  return `<span class="st-chip" data-stay-sleeps>${lang === 'fr' ? `Jusqu’à ${info.max_guests} pers.` : `Sleeps ${info.max_guests}`}</span>`;
}

module.exports = {
  STAY_TYPE, STAY_SEGMENT, STAY_LABEL, STAY_KINDS, DISCLOSURE, CHECK_RATES,
  STAY22_ALLEZ_BASE, BOOKING_SEARCH_BASE, EXPEDIA_SEARCH_BASE,
  stayKind, stayKindLabel, affiliateConfig, staysIndexable, staysNavOn, buildAffiliateUrl, stayRatesLink,
  stayPath, staysListPath, renderStaysListPage, renderStayVenuePage,
  CLOSE_BY_KM, CLOSE_BY_LIMIT, CLOSE_BY_FOOD_DRINK, CLOSE_BY_THINGS_TO_DO, CLOSE_BY_TYPES, CLOSE_BY_LABEL,
  pickStayCloseBy, formatStayDistance, closeByHtml,
  TOWN_NOTES_FILE, loadTownNotes, setTownNotes, townNoteFor,
  hasTrackingParams,
  STAY_INFO_KEYS, STAY_UNIT_TYPES, validateStayInfo, normalizeStayInfo, stayInfoLines, stayInfoHtml, staySleepsChip, formatStayTime, openMonthsText,
};
