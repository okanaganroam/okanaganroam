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
//   1. the owner's / admin's own booking link (venue_links.booking_url): never an affiliate link;
//   2. the configured affiliate partner (provider and id both set): an affiliate link;
//   3. the place's own website;
//   4. nothing: no button.
function stayRatesLink(venue, opts = {}) {
  if (!venue || venue.type !== STAY_TYPE) return null;
  const lang = opts.lang === 'fr' ? 'fr' : 'en';
  const links = opts.links || {};
  const label = CHECK_RATES[lang];
  const own = httpUrl(links.booking_url);
  if (own) return { url: own, affiliate: false, source: 'owner', rel: 'nofollow noopener', label };
  const cfg = affiliateConfig(opts.env || process.env);
  if (cfg.provider !== 'none') {
    const url = buildAffiliateUrl(venue, cfg, { lang, regionLabel: opts.regionLabel });
    if (url) return { url, affiliate: true, source: cfg.provider, rel: 'sponsored nofollow noopener', label };
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
  @media (max-width: 860px) { body.stays-page .st-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { body.stays-page .st-list { grid-template-columns: 1fr; } }
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

// deps: { origin, siteName, pageHead, analyticsHead, headerHtml, footerHtml, appScript, escapeHtml, breadcrumbSchema, links(venueId), indexable(region), engagementScript(venue) }
function renderStaysListPage({ region, regionLabel, stays, lang = 'en' }, deps) {
  const origin = deps.origin || 'https://okanaganroam.com';
  const siteName = deps.siteName || 'Okanagan Roam';
  const fr = lang === 'fr';
  const esc = deps.escapeHtml;
  const town = regionLabel;
  const label = STAY_LABEL[fr ? 'fr' : 'en'];
  const title = fr ? `${label} à ${town}, C.-B. | ${siteName}` : `${label} in ${town}, BC | ${siteName}`;
  const description = fr
    ? `Hôtels, motels, gîtes et autres lieux où dormir à ${town}, C.-B.`
    : `Hotels, motels, B&Bs and other places to stay in ${town}, BC.`;
  const canonical = `${origin}${staysListPath(region, lang)}`;
  const indexable = !fr && deps.indexable(region);
  let anyAffiliate = false;
  const cards = stays.map((v) => {
    const link = stayRatesLink(v, { lang, links: deps.links(v.id), regionLabel: town, env: deps.env });
    if (link && link.affiliate) anyAffiliate = true;
    const kind = stayKindLabel(v.cuisine, lang);
    const photo = v.image_url && /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(v.image_url).trim()) ? String(v.image_url).trim() : '';
    return `<li class="st-card" data-venue-id="${v.id}">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" width="480" height="270">` : ''}<div class="st-body">
      <span class="st-meta">${esc([kind, town].filter(Boolean).join(' · '))}</span>
      <a class="st-name" href="${stayPath(v, lang)}">${esc(v.name)}</a>
      ${v.address ? `<p class="st-addr">${esc(v.address)}</p>` : ''}
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
  <p class="st-intro">${fr ? 'Hôtels, motels, gîtes, auberges et autres lieux où dormir, par ordre alphabétique.' : 'Hotels, motels, B&amp;Bs, inns and other places to stay, in alphabetical order.'}</p>
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

function renderStayVenuePage({ venue, regionLabel, lang = 'en' }, deps) {
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
  const link = stayRatesLink(venue, { lang, links: deps.links(venue.id), regionLabel: town, env: deps.env });
  const site = websiteUrl(venue.website);
  const photo = venue.image_url && /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(venue.image_url).trim()) ? String(venue.image_url).trim() : '';
  const crumbs = [{ name: fr ? 'Accueil' : 'Home', url: `${origin}${fr ? '/fr' : '/'}` }, { name: town, url: `${origin}${fr ? '/fr' : ''}/${venue.region}` }, { name: label, url: `${origin}${staysListPath(venue.region, lang)}` }, { name: venue.name, url: canonical }];
  const actions = [
    ratesButtonHtml(link, venue, esc),
    site && !(link && link.source === 'website') ? `<a href="${esc(site)}" rel="nofollow noopener" target="_blank" data-track="website">${fr ? 'Site Web ↗' : 'Website ↗'}</a>` : '',
    venue.phone ? `<a href="tel:${esc(venue.phone)}" data-track="phone">${fr ? 'Appeler' : 'Call'}</a>` : '',
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
  ${photo ? `<img class="st-hero" src="${esc(photo)}" alt="${esc(venue.name)}" width="980" height="360">` : ''}
  ${photo && photoCreditFor(photo) ? `<p class="st-credit">${fr ? 'Photo :' : 'Photo:'} ${esc(photoCreditFor(photo))}</p>` : ''}
  <p class="st-kicker">${esc([kind, town].filter(Boolean).join(' · '))}</p>
  <h1>${esc(venue.name)}</h1>
  ${desc ? `<p class="st-intro"${fr && !descFr ? ' lang="en"' : ''}>${esc(desc)}</p>` : ''}
  ${venue.address ? `<p class="st-addr">${esc(venue.address)}</p>` : ''}
  ${actions ? `<div class="st-actions">
    ${actions}
  </div>` : ''}
  ${link && link.affiliate ? disclosureHtml(lang) : ''}
  <p><a href="${staysListPath(venue.region, lang)}">${fr ? `← ${esc(label)} à ${esc(town)}` : `← ${esc(label)} in ${esc(town)}`}</a></p>
  </div>
  </main>
  ${deps.footerHtml()}
  ${deps.appScript}
${deps.engagementScript(venue)}
</body>
</html>`;
}


// Photo credit for a stay's photo (2026-11-19), from the same credits file every listing uses. "Photo:" is added on the page.
let _stayCredits = null;
function photoCreditFor(url) {
  try {
    if (!_stayCredits) _stayCredits = require('./data/venue-photo-credits.json');
    return String(_stayCredits[String(url).split('?')[0]] || '').replace(/^\s*photos?\s*:\s*/i, '').trim();
  } catch (e) { return ''; }
}

module.exports = {
  STAY_TYPE, STAY_SEGMENT, STAY_LABEL, STAY_KINDS, DISCLOSURE, CHECK_RATES,
  STAY22_ALLEZ_BASE, BOOKING_SEARCH_BASE, EXPEDIA_SEARCH_BASE,
  stayKind, stayKindLabel, affiliateConfig, staysIndexable, staysNavOn, buildAffiliateUrl, stayRatesLink,
  stayPath, staysListPath, renderStaysListPage, renderStayVenuePage,
};
