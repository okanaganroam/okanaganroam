const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3001;
const SITE_PATH = path.join(__dirname, 'okanagan.html');

// IndexNow key — proves domain ownership so Bing/Yandex/Seznam etc. accept
// instant-indexing submissions instead of waiting for a passive crawl.
// The key itself has no secrecy requirement (it's published at
// /{key}.txt by design, per the IndexNow protocol) — it just has to match
// between the hosted file and whatever key is sent with a submission.
const INDEXNOW_KEY = 'b25ba530bda42cb30e339b0dd848dadf';

// ---------- helpers ----------

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const BOOL_FIELDS = [
  'dog_friendly', 'vegan', 'vegetarian', 'patio', 'kid_friendly',
  'gluten_free', 'lake_view', 'nonalcoholic', 'sports_tv', 'live_music',
  'great_groups', 'happy_hour',
];

const ALL_FIELDS = [
  'name', 'region', 'type', 'cuisine', 'phone', 'price', 'reviews', 'rating',
  'description', 'description_fr', 'hours', 'address', 'website', 'image_url',
  'latitude', 'longitude', ...BOOL_FIELDS,
];

function rowToVenue(row) {
  const v = { id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  for (const f of ['name', 'region', 'type', 'cuisine', 'phone', 'price', 'reviews', 'rating', 'description', 'description_fr', 'hours', 'address', 'website', 'image_url', 'slug', 'latitude', 'longitude']) {
    v[f] = row[f];
  }
  for (const f of BOOL_FIELDS) {
    v[f] = !!row[f];
  }
  return v;
}

// ---------- route handlers ----------

// GET /api/venues  (supports ?region=&type=&dog_friendly=1&vegetarian=1&vegan=1&search=&min_rating=&page=&limit=)
function listVenues(query) {
  const clauses = [];
  const params = [];

  if (query.region) {
    clauses.push('region = ?');
    params.push(query.region);
  }
  if (query.type) {
    clauses.push('type = ?');
    params.push(query.type);
  }
  if (query.search) {
    clauses.push('(name LIKE ? OR description LIKE ? OR cuisine LIKE ?)');
    const like = `%${query.search}%`;
    params.push(like, like, like);
  }
  if (query.min_rating) {
    clauses.push('rating >= ?');
    params.push(parseFloat(query.min_rating));
  }
  for (const f of BOOL_FIELDS) {
    if (query[f] === '1' || query[f] === 'true') {
      clauses.push(`${f} = 1`);
    }
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const limit = Math.min(parseInt(query.limit) || 50, 2000);
  const page = Math.max(parseInt(query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const countRow = db.prepare(`SELECT COUNT(*) AS n FROM venues ${where}`).get(...params);
  const rows = db
    .prepare(`SELECT * FROM venues ${where} ORDER BY name ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return {
    total: countRow.n,
    page,
    limit,
    total_pages: Math.ceil(countRow.n / limit),
    venues: rows.map(rowToVenue),
  };
}

function getVenue(id) {
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  return row ? rowToVenue(row) : null;
}

function createVenue(data) {
  if (!data.name || !data.region || !data.type) {
    const err = new Error('name, region, and type are required');
    err.status = 400;
    throw err;
  }
  const cols = ALL_FIELDS;
  const values = cols.map((f) => {
    if (BOOL_FIELDS.includes(f)) return data[f] ? 1 : 0;
    return data[f] !== undefined ? data[f] : null;
  });
  const placeholders = cols.map(() => '?').join(', ');
  const info = db
    .prepare(`INSERT INTO venues (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(...values);
  return getVenue(info.lastInsertRowid);
}

function updateVenue(id, data) {
  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) return null;

  const cols = ALL_FIELDS.filter((f) => data[f] !== undefined);
  if (cols.length === 0) return rowToVenue(existing);

  const setClause = cols.map((f) => `${f} = ?`).join(', ');
  const values = cols.map((f) => (BOOL_FIELDS.includes(f) ? (data[f] ? 1 : 0) : data[f]));

  db.prepare(`UPDATE venues SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
    ...values,
    id
  );
  return getVenue(id);
}

function deleteVenue(id) {
  const info = db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  return info.changes > 0;
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM venues').get().n;
  const phoned = db.prepare("SELECT COUNT(*) AS n FROM venues WHERE phone IS NOT NULL AND phone != ''").get().n;
  const vegetarian = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE vegetarian = 1').get().n;
  const vegan = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE vegan = 1').get().n;
  const byRegion = db.prepare('SELECT region, COUNT(*) AS n FROM venues GROUP BY region ORDER BY n DESC').all();
  const byType = db.prepare('SELECT type, COUNT(*) AS n FROM venues GROUP BY type ORDER BY n DESC').all();
  return { total, phoned, vegetarian, vegan, by_region: byRegion, by_type: byType };
}

// ---------- SEO guide pages ----------
//
// The main site is a single-page app, so before this feature the only
// crawlable URL on the whole domain was "/". That meant none of the site's
// badge data (dog-friendly, patio, happy hour, etc.) could ever surface in
// search results, get shared as a link with a real preview, or rank for
// long-tail searches like "dog friendly wineries kelowna".
//
// This adds one real, server-rendered, indexable page per region+badge
// combination that has enough venues to be genuinely useful:
// GET /guide/:region/:badge  ->  e.g. /guide/kelowna/dog_friendly
//
// Each page is plain server-rendered HTML (no JS required to see content),
// has its own <title>/meta description/canonical/OG tags, and lists the
// real matching venues with their real descriptions. It links back to the
// main app so visitors can explore further. A MIN_GUIDE_VENUES threshold
// keeps thin/near-empty pages out of the sitemap.

const MIN_GUIDE_VENUES = 8;

const REGION_LABELS = {
  kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland',
  summerland: 'Summerland', penticton: 'Penticton', naramata: 'Naramata',
  'lake-country': 'Lake Country', 'okanagan-falls': 'Okanagan Falls',
  oliver: 'Oliver', osoyoos: 'Osoyoos', vernon: 'Vernon', armstrong: 'Armstrong',
  coldstream: 'Coldstream', lumby: 'Lumby', enderby: 'Enderby', kaleden: 'Kaleden',
  apex: 'Apex', 'big-white': 'Big White', silverstar: 'SilverStar', baldy: 'Baldy',
};

const BADGE_LABELS = {
  dog_friendly: { title: 'Dog-Friendly', noun: 'dog-friendly spots', adj: 'dog-friendly' },
  vegan: { title: 'Vegan-Friendly', noun: 'vegan-friendly venues', adj: 'vegan-friendly' },
  vegetarian: { title: 'Vegetarian-Friendly', noun: 'vegetarian-friendly venues', adj: 'vegetarian-friendly' },
  patio: { title: 'Patio', noun: 'venues with a patio', adj: 'patio' },
  kid_friendly: { title: 'Kid-Friendly', noun: 'kid-friendly spots', adj: 'kid-friendly' },
  gluten_free: { title: 'Gluten-Free-Friendly', noun: 'venues with gluten-free options', adj: 'gluten-free-friendly' },
  lake_view: { title: 'Lake View', noun: 'venues with a lake view', adj: 'lake-view' },
  nonalcoholic: { title: 'Non-Alcoholic Options', noun: 'venues with non-alcoholic options', adj: 'non-alcoholic-friendly' },
  sports_tv: { title: 'Sports TV', noun: 'spots to watch the game', adj: 'sports-viewing' },
  live_music: { title: 'Live Music', noun: 'venues with live music', adj: 'live-music' },
  great_groups: { title: 'Great for Groups', noun: 'venues that are great for groups', adj: 'group-friendly' },
  happy_hour: { title: 'Happy Hour', noun: 'venues with happy hour', adj: 'happy-hour' },
};

// ---------- SEO architecture: regions / categories / venue pages ----------
// Phase 2 of the SEO roadmap: /:region, /:region/:category, and
// /:region/:category/:venueSlug, sitting alongside the existing /guide
// pages (untouched) and the existing SPA (untouched).

const MIN_CATEGORY_VENUES = 1; // a region/category page renders as soon as at least one real venue exists in it

// DB `type` -> URL category slug (also doubles as the reverse lookup below)
const CATEGORY_SLUGS = {
  restaurant: 'restaurants',
  winery: 'wineries',
  cafe: 'cafes',
  brewery: 'breweries',
  pub: 'pubs',
  cocktail: 'cocktail-lounges',
};
const SLUG_TO_TYPE = Object.fromEntries(Object.entries(CATEGORY_SLUGS).map(([type, slug]) => [slug, type]));

// Human-readable label per category, singular and plural, for titles/H1s
const CATEGORY_LABELS = {
  restaurant: { singular: 'Restaurant', plural: 'Restaurants' },
  winery: { singular: 'Winery', plural: 'Wineries' },
  cafe: { singular: 'Cafe', plural: 'Cafes' },
  brewery: { singular: 'Brewery', plural: 'Breweries' },
  pub: { singular: 'Pub', plural: 'Pubs' },
  cocktail: { singular: 'Cocktail Lounge', plural: 'Cocktail Lounges' },
};

// DB `type` -> schema.org @type. Every one of these is a real, valid
// schema.org type under LocalBusiness > FoodEstablishment — no generic
// fallback needed for the 6 types this site currently has.
const SCHEMA_TYPE_MAP = {
  restaurant: 'Restaurant',
  winery: 'Winery',
  cafe: 'CafeOrCoffeeShop',
  brewery: 'Brewery',
  pub: 'BarOrPub',
  cocktail: 'BarOrPub', // schema.org has no distinct "cocktail lounge" type; BarOrPub is the correct closest official type
};

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// One-time, idempotent backfill: assigns a permanent slug to any venue
// that doesn't have one yet. Never touches a venue that already has a
// slug — per the "permanent stored slugs" decision, slugs are not
// regenerated if a name changes later. Collisions (same region+type+slug)
// are resolved deterministically by appending the venue's own id, so the
// result is stable and reproducible even if this runs again.
function backfillSlugs() {
  const rows = db.prepare('SELECT id, name, region, type FROM venues WHERE slug IS NULL ORDER BY id').all();
  if (rows.length === 0) return 0;
  const usedInScope = new Set(
    db.prepare('SELECT region, type, slug FROM venues WHERE slug IS NOT NULL').all()
      .map((r) => `${r.region}|${r.type}|${r.slug}`)
  );
  let count = 0;
  for (const row of rows) {
    const base = slugify(row.name);
    let slug = base;
    let scopeKey = `${row.region}|${row.type}|${slug}`;
    if (usedInScope.has(scopeKey)) {
      slug = `${base}-${row.id}`;
      scopeKey = `${row.region}|${row.type}|${slug}`;
    }
    usedInScope.add(scopeKey);
    db.prepare('UPDATE venues SET slug = ? WHERE id = ?').run(slug, row.id);
    count++;
  }
  return count;
}

const slugsBackfilled = backfillSlugs();
if (slugsBackfilled > 0) {
  console.log(`[seo] backfilled slugs for ${slugsBackfilled} venue(s)`);
}

function getRegionCategoryCounts(region) {
  // { restaurant: 12, winery: 4, ... } for a region, only categories with >=1 venue
  return db
    .prepare('SELECT type, COUNT(*) AS n FROM venues WHERE region = ? GROUP BY type')
    .all(region)
    .filter((r) => CATEGORY_SLUGS[r.type]) // ignore any unexpected/unmapped type defensively
    .reduce((acc, r) => { acc[r.type] = r.n; return acc; }, {});
}

function getVenuesByRegionCategory(region, type) {
  return db
    .prepare('SELECT * FROM venues WHERE region = ? AND type = ? ORDER BY name ASC')
    .all(region, type)
    .map(rowToVenue);
}

function findVenueBySlug(region, type, slug) {
  const row = db
    .prepare('SELECT * FROM venues WHERE region = ? AND type = ? AND slug = ?')
    .get(region, type, slug);
  return row ? rowToVenue(row) : null;
}

function getRelatedVenues(venue, limit = 6) {
  // Same region + same category, excluding itself
  return db
    .prepare('SELECT * FROM venues WHERE region = ? AND type = ? AND id != ? ORDER BY rating DESC, name ASC LIMIT ?')
    .all(venue.region, venue.type, venue.id, limit)
    .map(rowToVenue);
}

function getNearbyVenues(venue, limit = 6) {
  // Same region, any other category, excluding itself — a broader
  // "explore this region more" set distinct from same-category related venues
  return db
    .prepare('SELECT * FROM venues WHERE region = ? AND type != ? AND id != ? ORDER BY rating DESC, name ASC LIMIT ?')
    .all(venue.region, venue.type, venue.id, limit)
    .map(rowToVenue);
}

function breadcrumbListSchema(items) {
  // items: [{ name, url }, ...] in order from Home to the current page
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function listGuideCombos(minCount) {
  // One row per region+badge combo that clears the venue-count threshold,
  // computed live from the DB so the guide/sitemap list grows automatically
  // as more venues get badges — no hardcoded list to fall out of date.
  const combos = [];
  for (const region of Object.keys(REGION_LABELS)) {
    for (const badge of BOOL_FIELDS) {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM venues WHERE region = ? AND ${badge} = 1`)
        .get(region);
      if (row.n >= minCount) combos.push({ region, badge, count: row.n });
    }
  }
  return combos;
}

function renderGuidePage(region, badge, venues) {
  const regionLabel = REGION_LABELS[region];
  const badgeInfo = BADGE_LABELS[badge];
  const title = `${badgeInfo.title} Venues in ${regionLabel}, BC | Okanagan Roam`;
  const description = `${venues.length} verified ${badgeInfo.noun} in ${regionLabel}, BC — wineries, restaurants, breweries, and more, reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com/guide/${region}/${badge}`;
  const regionUrl = `https://okanaganroam.com/${region}`;

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: regionUrl },
    { name: `${badgeInfo.title} Venues`, url: canonical },
  ]);

  // Cross-link to whichever category pages actually have venues on this
  // guide page — e.g. a "Kelowna Dog-Friendly" page that lists both
  // restaurants and wineries links to both /kelowna/restaurants and
  // /kelowna/wineries, not just one.
  const categoriesPresent = [...new Set(venues.map((v) => v.type))]
    .filter((t) => CATEGORY_SLUGS[t])
    .sort();
  const categoryLinksHtml = categoriesPresent.length
    ? `<p class="venue-meta">Browse by category: ${categoriesPresent
        .map((t) => `<a href="/${region}/${CATEGORY_SLUGS[t]}">${escapeHtml(CATEGORY_LABELS[t].plural)}</a>`)
        .join(', ')}</p>`
    : '';

  const cards = venues
    .map((v) => {
      const badgeChips = BOOL_FIELDS.filter((f) => v[f])
        .map((f) => `<span class="chip">${escapeHtml(BADGE_LABELS[f].title)}</span>`)
        .join(' ');
      const desc = v.description ? `<p>${escapeHtml(v.description)}</p>` : '';
      const meta = [
        v.type ? escapeHtml(v.type) : null,
        v.cuisine ? escapeHtml(v.cuisine) : null,
        v.rating ? `${v.rating}★` : null,
      ].filter(Boolean).join(' &middot; ');
      const venueHref = (v.slug && CATEGORY_SLUGS[v.type]) ? `/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}` : null;
      const nameHtml = venueHref
        ? `<a href="${venueHref}">${escapeHtml(v.name)}</a>`
        : escapeHtml(v.name);
      return `
      <li class="venue-card">
        <h2>${nameHtml}</h2>
        <p class="venue-meta">${meta}</p>
        ${desc}
        <p class="chips">${badgeChips}</p>
      </li>`;
    })
    .join('\n');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    // No cap — every venue on the visible page is also in the structured
    // data, however large the list gets.
    itemListElement: venues.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: (v.slug && CATEGORY_SLUGS[v.type]) ? `https://okanaganroam.com/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}` : undefined,
      item: {
        '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness',
        name: v.name,
        description: v.description || undefined,
      },
    })),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList])}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  <nav class="breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/${region}">${escapeHtml(regionLabel)}</a> &rsaquo; ${escapeHtml(badgeInfo.title)} Venues</nav>
  <h1>${escapeHtml(badgeInfo.title)} Venues in ${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${venues.length} verified ${escapeHtml(badgeInfo.noun)} in ${escapeHtml(regionLabel)} — badge-checked from real listings, not guessed.</p>
  ${categoryLinksHtml}
  <ul class="card-grid">
    ${cards}
  </ul>
  <a class="cta" href="/${region}">See all of ${escapeHtml(regionLabel)} on Okanagan Roam</a>
  ${siteFooter()}
</body>
</html>`;
}

function renderGuideFooterHTML() {
  const combos = listGuideCombos(MIN_GUIDE_VENUES);
  if (combos.length === 0) return '';

  const byRegion = {};
  for (const c of combos) {
    (byRegion[c.region] = byRegion[c.region] || []).push(c);
  }

  const sections = Object.keys(byRegion)
    .sort((a, b) => byRegion[b].length - byRegion[a].length)
    .map((region) => {
      const links = byRegion[region]
        .sort((a, b) => b.count - a.count)
        .map(
          (c) =>
            `<a href="/guide/${c.region}/${c.badge}">${escapeHtml(BADGE_LABELS[c.badge].title)} (${c.count})</a>`
        )
        .join(', ');
      return `<div class="og-guide-region"><strong><a href="/${region}">${escapeHtml(REGION_LABELS[region])}</a>:</strong> ${links}</div>`;
    })
    .join('\n');

  return `
<footer id="og-guides" style="max-width:960px;margin:40px auto;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.8;color:#52606d;border-top:1px solid #e4e7eb;">
  <p style="margin:0 0 10px;font-weight:600;color:#1f2933;">Browse Okanagan Roam by guide</p>
  ${sections}
</footer>`;
}

// ---------- shared SEO page CSS (region / category / venue pages) ----------
// One shared style block so these three page types look and feel
// consistent, and so it's defined once rather than duplicated three times.
const SEO_PAGE_CSS = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px 20px 64px; color: #1f2933; line-height: 1.5; }
  a { color: #0b6e4f; }
  header.top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  header.top a.brand { font-weight: 700; text-decoration: none; color: #1f2933; font-size: 1.1rem; }
  nav.breadcrumb { font-size: 0.82rem; color: #7b8794; margin-bottom: 20px; }
  nav.breadcrumb a { color: #52606d; text-decoration: none; }
  nav.breadcrumb a:hover { text-decoration: underline; }
  h1 { font-size: 1.6rem; margin-bottom: 4px; }
  .subtitle { color: #52606d; margin-bottom: 24px; }
  .card-grid { padding: 0; margin: 0; }
  .venue-card, .category-card { list-style: none; border: 1px solid #e4e7eb; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; }
  .venue-card h2, .category-card h2 { font-size: 1.05rem; margin: 0 0 4px; }
  .venue-card h2 a, .category-card h2 a { color: #1f2933; text-decoration: none; }
  .venue-card h2 a:hover, .category-card h2 a:hover { text-decoration: underline; }
  .venue-meta { color: #7b8794; font-size: 0.85rem; margin: 0 0 8px; }
  .venue-card p, .category-card p { margin: 0 0 8px; font-size: 0.95rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: #eaf6f0; color: #0b6e4f; font-size: 0.75rem; padding: 3px 9px; border-radius: 999px; }
  .related-section { margin-top: 32px; }
  .related-section h2 { font-size: 1.15rem; margin-bottom: 12px; }
  .related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .related-card { border: 1px solid #e4e7eb; border-radius: 8px; padding: 10px 12px; }
  .related-card a { font-weight: 600; text-decoration: none; color: #1f2933; }
  .related-card .related-meta { font-size: 0.8rem; color: #7b8794; }
  .detail-row { display: flex; gap: 8px; margin: 4px 0; font-size: 0.95rem; }
  .detail-row .label { color: #7b8794; min-width: 90px; }
  .cta { display: inline-block; margin-top: 28px; background: #0b6e4f; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; }
  .cta.secondary { background: #fff; color: #0b6e4f; border: 1px solid #0b6e4f; }
  .hours-list { list-style: none; padding: 0; margin: 8px 0; font-size: 0.9rem; }
  .hours-list li { display: flex; justify-content: space-between; max-width: 260px; padding: 2px 0; }
  footer.site-footer { margin-top: 40px; font-size: 0.85rem; color: #7b8794; }
`;

function pageHead(title, description, canonical, jsonLdBlocks) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="https://okanaganroam.com/og-image.png">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${jsonLdBlocks.map((block) => `<script type="application/ld+json">\n${JSON.stringify(block)}\n</script>`).join('\n')}
<style>${SEO_PAGE_CSS}</style>`;
}

function siteHeader(rightLinkHref, rightLinkText) {
  return `<header class="top">
    <a class="brand" href="https://okanaganroam.com/">Okanagan Roam</a>
    <a href="${rightLinkHref}">${escapeHtml(rightLinkText)}</a>
  </header>`;
}

function siteFooter() {
  return `<footer class="site-footer">Okanagan Roam &middot; <a href="https://okanaganroam.com/">okanaganroam.com</a></footer>`;
}

// GET /:region — region hub page
function renderRegionPage(region, categoryCounts, regionGuidePages) {
  const regionLabel = REGION_LABELS[region];
  const totalVenues = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const title = `${regionLabel} Restaurants, Wineries & More, BC | Okanagan Roam`;
  const description = `${totalVenues} verified venues in ${regionLabel}, BC — browse restaurants, wineries, breweries, cafes, pubs, and cocktail lounges, all reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com/${region}`;

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: canonical },
  ]);

  const categoryCards = Object.keys(CATEGORY_SLUGS)
    .filter((type) => categoryCounts[type] >= MIN_CATEGORY_VENUES)
    .sort((a, b) => categoryCounts[b] - categoryCounts[a])
    .map((type) => {
      const catSlug = CATEGORY_SLUGS[type];
      const label = CATEGORY_LABELS[type];
      return `
      <li class="category-card">
        <h2><a href="/${region}/${catSlug}">${escapeHtml(label.plural)}</a></h2>
        <p class="venue-meta">${categoryCounts[type]} ${categoryCounts[type] === 1 ? label.singular.toLowerCase() : label.plural.toLowerCase()} in ${escapeHtml(regionLabel)}</p>
      </li>`;
    })
    .join('\n');

  const guideLinks = regionGuidePages.length
    ? `<div class="related-section">
        <h2>Browse ${escapeHtml(regionLabel)} by what matters to you</h2>
        <p>${regionGuidePages
          .map((c) => `<a href="/guide/${c.region}/${c.badge}">${escapeHtml(BADGE_LABELS[c.badge].title)} (${c.count})</a>`)
          .join(', ')}</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb])}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  <nav class="breadcrumb"><a href="/">Home</a> &rsaquo; ${escapeHtml(regionLabel)}</nav>
  <h1>${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${totalVenues} verified venues across ${categoryCards ? Object.keys(categoryCounts).length : 0} categories in ${escapeHtml(regionLabel)}.</p>
  <ul class="card-grid">
    ${categoryCards}
  </ul>
  ${guideLinks}
  <a class="cta" href="https://okanaganroam.com/">See all of ${escapeHtml(regionLabel)} on Okanagan Roam</a>
  ${siteFooter()}
</body>
</html>`;
}

// GET /:region/:category — category page within a region
function renderCategoryPage(region, type, venues, categoryGuidePages) {
  const regionLabel = REGION_LABELS[region];
  const catSlug = CATEGORY_SLUGS[type];
  const label = CATEGORY_LABELS[type];
  const title = `${label.plural} in ${regionLabel}, BC | Okanagan Roam`;
  const description = `${venues.length} verified ${label.plural.toLowerCase()} in ${regionLabel}, BC — real listings with hours, ratings, and attributes, reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com/${region}/${catSlug}`;

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: `https://okanaganroam.com/${region}` },
    { name: label.plural, url: canonical },
  ]);

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    itemListElement: venues.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://okanaganroam.com/${region}/${catSlug}/${v.slug}`,
      item: {
        '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness',
        name: v.name,
        description: v.description || undefined,
      },
    })),
  };

  const cards = venues
    .map((v) => {
      const badgeChips = BOOL_FIELDS.filter((f) => v[f])
        .map((f) => `<span class="chip">${escapeHtml(BADGE_LABELS[f].title)}</span>`)
        .join(' ');
      const meta = [
        v.cuisine ? escapeHtml(v.cuisine) : null,
        v.rating ? `${v.rating}\u2605` : null,
      ].filter(Boolean).join(' &middot; ');
      const desc = v.description ? `<p>${escapeHtml(v.description)}</p>` : '';
      return `
      <li class="venue-card">
        <h2><a href="/${region}/${catSlug}/${v.slug}">${escapeHtml(v.name)}</a></h2>
        <p class="venue-meta">${meta}</p>
        ${desc}
        <p class="chips">${badgeChips}</p>
      </li>`;
    })
    .join('\n');

  const guideLinks = categoryGuidePages.length
    ? `<div class="related-section">
        <h2>Filter ${escapeHtml(label.plural)} in ${escapeHtml(regionLabel)}</h2>
        <p>${categoryGuidePages
          .map((c) => `<a href="/guide/${c.region}/${c.badge}">${escapeHtml(BADGE_LABELS[c.badge].title)}</a>`)
          .join(', ')}</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList])}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  <nav class="breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/${region}">${escapeHtml(regionLabel)}</a> &rsaquo; ${escapeHtml(label.plural)}</nav>
  <h1>${escapeHtml(label.plural)} in ${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${venues.length} verified ${escapeHtml(label.plural.toLowerCase())} in ${escapeHtml(regionLabel)}.</p>
  <ul class="card-grid">
    ${cards}
  </ul>
  ${guideLinks}
  <a class="cta" href="/${region}">Back to all of ${escapeHtml(regionLabel)}</a>
  ${siteFooter()}
</body>
</html>`;
}

// GET /:region/:category/:slug — individual venue page
function renderVenuePage(venue, relatedVenues, nearbyVenues, venueGuidePages) {
  const regionLabel = REGION_LABELS[venue.region];
  const catSlug = CATEGORY_SLUGS[venue.type];
  const label = CATEGORY_LABELS[venue.type];
  const canonical = `https://okanaganroam.com/${venue.region}/${catSlug}/${venue.slug}`;
  const title = `${venue.name} \u2014 ${label.singular} in ${regionLabel}, BC | Okanagan Roam`;
  const rawDesc = venue.description || `${venue.name} is a ${label.singular.toLowerCase()} in ${regionLabel}, BC, listed on Okanagan Roam.`;
  const description = rawDesc.length > 155 ? rawDesc.slice(0, 152).replace(/\s+\S*$/, '') + '...' : rawDesc;

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: `https://okanaganroam.com/${venue.region}` },
    { name: label.plural, url: `https://okanaganroam.com/${venue.region}/${catSlug}` },
    { name: venue.name, url: canonical },
  ]);

  // LocalBusiness / type-specific schema — every property below is
  // conditionally included; nothing is fabricated for fields the DB
  // doesn't have yet (address, website, image are genuinely absent for
  // essentially all venues today).
  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE_MAP[venue.type] || 'LocalBusiness',
    name: venue.name,
    description: venue.description || undefined,
    url: canonical,
    telephone: venue.phone || undefined,
    address: venue.address ? { '@type': 'PostalAddress', streetAddress: venue.address, addressRegion: 'BC', addressCountry: 'CA' } : undefined,
    geo: (venue.latitude && venue.longitude) ? { '@type': 'GeoCoordinates', latitude: venue.latitude, longitude: venue.longitude } : undefined,
    image: venue.image_url || undefined,
    sameAs: venue.website || undefined,
    priceRange: venue.price ? '$'.repeat(venue.price) : undefined,
    servesCuisine: venue.type === 'restaurant' && venue.cuisine ? venue.cuisine : undefined,
    aggregateRating: (venue.rating && venue.reviews) ? {
      '@type': 'AggregateRating',
      ratingValue: venue.rating,
      reviewCount: venue.reviews,
    } : undefined,
  };

  const attributeChips = BOOL_FIELDS.filter((f) => venue[f])
    .map((f) => `<span class="chip">${escapeHtml(BADGE_LABELS[f].title)}</span>`)
    .join(' ');

  let hoursHtml = '';
  if (venue.hours) {
    try {
      const hoursObj = JSON.parse(venue.hours);
      const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
      const rows = dayOrder.map((d) => {
        const ranges = hoursObj[d];
        const text = (Array.isArray(ranges) && ranges.length)
          ? ranges.map((r) => `${r[0]}\u2013${r[1]}`).join(', ')
          : 'Closed';
        return `<li><span>${dayNames[d]}</span><span>${escapeHtml(text)}</span></li>`;
      }).join('');
      hoursHtml = `<div class="detail-row"><span class="label">Hours</span></div><ul class="hours-list">${rows}</ul>`;
    } catch (e) {
      hoursHtml = '';
    }
  }

  const detailRows = [
    ['Type', label.singular],
    ['Region', `<a href="/${venue.region}">${escapeHtml(regionLabel)}</a>`],
    venue.cuisine ? ['Cuisine', escapeHtml(venue.cuisine)] : null,
    venue.address ? ['Address', escapeHtml(venue.address)] : null,
    venue.phone ? ['Phone', `<a href="tel:${escapeHtml(venue.phone)}">${escapeHtml(venue.phone)}</a>`] : null,
    venue.website ? ['Website', `<a href="${escapeHtml(venue.website)}" rel="nofollow noopener" target="_blank">${escapeHtml(venue.website)}</a>`] : null,
    venue.price ? ['Price', '$'.repeat(venue.price)] : null,
    (venue.rating && venue.reviews) ? ['Rating', `${venue.rating}\u2605 (${venue.reviews} reviews)`] : (venue.rating ? ['Rating', `${venue.rating}\u2605`] : null),
  ].filter(Boolean)
    .map(([lbl, val]) => `<div class="detail-row"><span class="label">${escapeHtml(lbl)}</span><span>${val}</span></div>`)
    .join('\n');

  const imageHtml = venue.image_url
    ? `<img src="${escapeHtml(venue.image_url)}" alt="${escapeHtml(venue.name)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:10px;margin-bottom:20px;">`
    : '';

  function relatedCard(v) {
    const meta = [v.cuisine, v.rating ? `${v.rating}\u2605` : null].filter(Boolean).join(' \u00b7 ');
    return `<div class="related-card">
      <a href="/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}">${escapeHtml(v.name)}</a>
      <div class="related-meta">${escapeHtml(meta)}</div>
    </div>`;
  }

  const relatedHtml = relatedVenues.length
    ? `<div class="related-section">
        <h2>Other ${escapeHtml(label.plural.toLowerCase())} in ${escapeHtml(regionLabel)}</h2>
        <div class="related-grid">${relatedVenues.map(relatedCard).join('')}</div>
      </div>`
    : '';

  const nearbyHtml = nearbyVenues.length
    ? `<div class="related-section">
        <h2>More to explore near ${escapeHtml(regionLabel)}</h2>
        <div class="related-grid">${nearbyVenues.map(relatedCard).join('')}</div>
      </div>`
    : '';

  const guideLinks = venueGuidePages.length
    ? `<p class="venue-meta">Also see: ${venueGuidePages.map((c) => `<a href="/guide/${c.region}/${c.badge}">${escapeHtml(BADGE_LABELS[c.badge].title)} in ${escapeHtml(regionLabel)}</a>`).join(', ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, localBusiness])}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  <nav class="breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/${venue.region}">${escapeHtml(regionLabel)}</a> &rsaquo; <a href="/${venue.region}/${catSlug}">${escapeHtml(label.plural)}</a> &rsaquo; ${escapeHtml(venue.name)}</nav>
  ${imageHtml}
  <h1>${escapeHtml(venue.name)}</h1>
  <p class="subtitle">${escapeHtml(label.singular)} in ${escapeHtml(regionLabel)}, BC</p>
  <p>${escapeHtml(venue.description || '')}</p>
  <p class="chips">${attributeChips}</p>
  ${detailRows}
  ${hoursHtml}
  ${guideLinks}
  ${relatedHtml}
  ${nearbyHtml}
  <a class="cta" href="/${venue.region}/${catSlug}">Back to ${escapeHtml(label.plural)} in ${escapeHtml(regionLabel)}</a>
  <a class="cta secondary" href="/${venue.region}">Explore all of ${escapeHtml(regionLabel)}</a>
  ${siteFooter()}
</body>
</html>`;
}

function render404Page(pathname) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Page Not Found | Okanagan Roam</title>
<meta name="robots" content="noindex">
<style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:80px auto;text-align:center;color:#1f2933;}a{color:#0b6e4f;}</style>
</head>
<body>
  <h1>Page not found</h1>
  <p>We couldn't find a venue or page at that address.</p>
  <a href="https://okanaganroam.com/">Back to Okanagan Roam</a>
</body>
</html>`;
}

function renderOpenNowScript() {
  // Self-contained "Open Now" toggle. Deliberately does NOT touch the app's
  // own filter/search logic (activeFilters Set, applyFilters(), etc.) —
  // instead it piggybacks on something the app already computes for us:
  // every rendered .venue-card already carries a child element with class
  // "open-status-open" or "open-status-closed" (used to show the "Open
  // now" / "Closed now" text). We just show/hide whole cards based on
  // that existing, already-correct, already-timezone-aware computation.
  //
  // Because search/filter/pagination re-renders the .venue-grid contents
  // via React, we re-apply on every DOM mutation (rAF-debounced so it's
  // cheap) rather than trying to hook into the app's own render cycle.
  return `
<script>
(function(){
  var D = document;
  var active = false;
  var scheduled = false;

  function apply(){
    var cards = D.querySelectorAll('.venue-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!active) { card.style.display = ''; continue; }
      var isOpen = card.querySelector('.open-status-open');
      card.style.display = isOpen ? '' : 'none';
    }
  }

  function scheduleApply(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function(){ scheduled = false; apply(); });
  }

  function ensureButton(){
    if (D.querySelector('.og-open-now-btn')) return;
    var btn = D.createElement('button');
    btn.type = 'button';
    btn.className = 'og-open-now-btn';
    btn.textContent = 'Open Now';
    btn.setAttribute('aria-pressed', 'false');
    // Fixed position, not appended into .results-head: that element can
    // render thousands of pixels down this long-scrolling page, making a
    // button placed there effectively invisible without scrolling. A
    // fixed pill stays visible and reachable no matter where the user is.
    //
    // Position differs by viewport width because the app already claims
    // the bottom of the screen for its own UI: the "Your trip" widget
    // sits bottom-right on all sizes, and on narrow/mobile viewports the
    // wizard's step "Continue" button becomes a bottom-anchored bar too.
    // Bottom-left is clear on desktop, but not reliably clear on mobile,
    // so on narrow screens we place it just under the sticky header
    // instead, which stays clear of both.
    var isNarrow = window.matchMedia('(max-width: 700px)').matches;
    btn.style.cssText = isNarrow
      ? 'position:fixed;left:12px;top:80px;z-index:2147483000;padding:8px 14px;border-radius:999px;border:1px solid #0b6e4f;background:#fff;color:#0b6e4f;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,color .15s;font-family:inherit;box-shadow:0 2px 10px rgba(0,0,0,.15);'
      : 'position:fixed;left:16px;bottom:16px;z-index:2147483000;padding:10px 18px;border-radius:999px;border:1px solid #0b6e4f;background:#fff;color:#0b6e4f;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s,color .15s;font-family:inherit;box-shadow:0 2px 10px rgba(0,0,0,.15);';
    btn.addEventListener('click', function(){
      active = !active;
      btn.setAttribute('aria-pressed', String(active));
      btn.style.background = active ? '#0b6e4f' : '#fff';
      btn.style.color = active ? '#fff' : '#0b6e4f';
      apply();
    });
    D.body.appendChild(btn);
  }

  var observer = new MutationObserver(function(){
    ensureButton();
    scheduleApply();
  });
  observer.observe(D.body, { childList: true, subtree: true });

  ensureButton();
  scheduleApply();

  // The search wizard panel is supposed to scroll away once the person
  // starts browsing results, but it's pinned in place: .filter-bar has
  // position:sticky, top:0, which keeps it stuck to the top of the
  // viewport regardless of scroll position or the wizard-active class.
  // Past a small scroll threshold, drop it to static so it scrolls away
  // normally; restore sticky at the very top.
  var wizardScrollHandler = function(){
    var bar = D.querySelector('.filter-bar');
    if (window.scrollY > 80) {
      D.body.classList.remove('wizard-active');
      if (bar) bar.style.setProperty('position', 'static', 'important');
    } else {
      D.body.classList.add('wizard-active');
      if (bar) bar.style.removeProperty('position');
    }
  };
  window.addEventListener('scroll', wizardScrollHandler, { passive: true });
  wizardScrollHandler();
})();
</script>`;
}

function renderHiddenElementsScript() {
  // Hides two existing UI pieces the site owner asked to remove: the
  // "Open the map view" toggle and the "Live search the whole Okanagan
  // (beta)" panel. Also rounds the big "N places to explore" count down
  // to a friendly "1000+" display once it crosses 1000, rather than
  // showing the exact, ever-growing venue count (which will keep
  // climbing as more venues get added and would otherwise need editing
  // here every time). Smaller/filtered counts are left exact — this
  // only kicks in once the number is genuinely in the thousands.
  //
  // History: first tried a plain <style> tag — didn't survive the app's
  // DOM lifecycle (only one <style> element, the app's own, ever ended
  // up in the live DOM). Then tried the MutationObserver technique that
  // works for the Open Now button — the elements still resurfaced,
  // meaning whatever re-renders them isn't reliably caught as a
  // childList/subtree mutation in time. Verified live in the browser
  // console that a simple interval-based poll reliably keeps them
  // hidden, so that's what this uses: cheap, and doesn't depend on
  // guessing exactly when/how the app re-renders these elements.
  return `
<script>
(function(){
  var D = document;
  function apply(){
    var toHide = D.querySelectorAll('.map-toggle-row, .live-search');
    for (var i = 0; i < toHide.length; i++) {
      toHide[i].style.display = 'none';
    }
    var countEl = D.querySelector('.results-count');
    if (countEl) {
      var m = countEl.textContent.match(/^([\\d,]+)(\\s.*)$/);
      if (m) {
        var n = parseInt(m[1].replace(/,/g, ''), 10);
        if (n >= 1000 && !/^1000\\+/.test(countEl.textContent)) {
          countEl.textContent = '1000+' + m[2];
        }
      }
    }
    // The data-sourcing disclaimer paragraph has no class to target, so
    // match on its distinctive opening text instead.
    var ps = D.querySelectorAll('p');
    for (var j = 0; j < ps.length; j++) {
      if (/^Every place below is a real Okanagan venue/.test(ps[j].textContent.trim())) {
        ps[j].style.display = 'none';
      }
    }
    // The app's own CSS clamps .venue-desc to 5 lines with overflow:hidden,
    // which truncated the longer, rewritten venue descriptions with no way
    // to read the rest. Re-clamp to 6 lines (keeps card heights aligned in
    // the grid) and add a "Read more" toggle for any description that
    // actually overflows. data-desc-init marks elements already processed
    // so we don't reprocess them (and don't re-clamp one a user just
    // expanded) on every 300ms poll.
    var descs = D.querySelectorAll('.venue-desc:not([data-desc-init])');
    for (var k = 0; k < descs.length; k++) {
      var desc = descs[k];
      desc.setAttribute('data-desc-init', '1');
      desc.style.setProperty('display', '-webkit-box', 'important');
      desc.style.setProperty('-webkit-box-orient', 'vertical', 'important');
      desc.style.setProperty('-webkit-line-clamp', '6', 'important');
      desc.style.setProperty('overflow', 'hidden', 'important');
      desc.style.setProperty('max-height', 'none', 'important');
      desc.style.setProperty('min-height', '0', 'important');

      if (desc.scrollHeight > desc.clientHeight + 2) {
        var btn = D.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Read more';
        btn.style.cssText = 'display:block;margin:4px 22px 0;padding:0;border:none;background:none;color:#8A631F;font-size:0.85rem;font-weight:700;cursor:pointer;text-decoration:underline;';
        var expanded = false;
        btn.addEventListener('click', function(el, b){
          return function(){
            expanded = !expanded;
            if (expanded) {
              el.style.setProperty('-webkit-line-clamp', 'unset', 'important');
              el.style.setProperty('overflow', 'visible', 'important');
              b.textContent = 'Read less';
            } else {
              el.style.setProperty('-webkit-line-clamp', '6', 'important');
              el.style.setProperty('overflow', 'hidden', 'important');
              b.textContent = 'Read more';
            }
          };
        }(desc, btn));
        desc.insertAdjacentElement('afterend', btn);
      }
    }
  }
  apply();
  setInterval(apply, 300);
})();
</script>`;
}




const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // Serve the website itself at / and /okanagan.html, so this same
    // deployment is both the API and the live site.
    if ((pathname === '/' || pathname === '/okanagan.html') && method === 'GET') {
      if (fs.existsSync(SITE_PATH)) {
        let html = fs.readFileSync(SITE_PATH, 'utf8');
        // Inject real, crawlable internal links to the guide pages so search
        // engines can discover them by following links from the homepage,
        // not just via the sitemap (which some crawlers deprioritize). This
        // is plain visible HTML, not hidden/cloaked content.
        const footer = renderGuideFooterHTML();
        const openNowScript = renderOpenNowScript();
        const hiddenElementsScript = renderHiddenElementsScript();
        html = html.includes('</body>')
          ? html.replace('</body>', `${footer}\n${openNowScript}\n${hiddenElementsScript}\n</body>`)
          : html + footer + openNowScript + hiddenElementsScript;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('okanagan.html not found on server');
    }

    // IndexNow key file — required at the domain root so search engines can
    // verify submissions actually come from whoever controls this site.
    if (pathname === `/${INDEXNOW_KEY}.txt` && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(INDEXNOW_KEY);
    }

    // robots.txt — points crawlers at the sitemap and allows everything
    // except the read/write API endpoints, which have no SEO value and
    // shouldn't be indexed as pages.
    if (pathname === '/robots.txt' && method === 'GET') {
      const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        '',
        'Sitemap: https://okanaganroam.com/sitemap.xml',
        '',
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(robots);
    }

    // sitemap.xml — the homepage, plus one URL per region+badge guide page
    // that has enough venues to be worth indexing. This list is computed
    // live from the DB, so it grows automatically as more venues get badges.
    if (pathname === '/sitemap.xml' && method === 'GET') {
      const today = new Date().toISOString().slice(0, 10);
      const combos = listGuideCombos(MIN_GUIDE_VENUES);

      // Region pages: one per region that has at least one venue.
      const regionCounts = db
        .prepare('SELECT region, COUNT(*) AS n FROM venues GROUP BY region')
        .all()
        .filter((r) => REGION_LABELS[r.region] && r.n > 0);

      // Category pages: one per region+type combo that has at least one
      // venue — computed live, same pattern as the guide-page combos above.
      const categoryCombos = db
        .prepare('SELECT region, type, COUNT(*) AS n FROM venues GROUP BY region, type')
        .all()
        .filter((r) => REGION_LABELS[r.region] && CATEGORY_SLUGS[r.type] && r.n > 0);

      // Venue pages: every venue that has a real, non-null slug (should be
      // all of them after the startup backfill, but this guards against any
      // edge case rather than emitting a broken sitemap entry).
      const venueRows = db
        .prepare('SELECT region, type, slug FROM venues WHERE slug IS NOT NULL')
        .all()
        .filter((v) => REGION_LABELS[v.region] && CATEGORY_SLUGS[v.type]);

      const urlEntries = [
        `  <url>\n    <loc>https://okanaganroam.com/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
        ...regionCounts.map(
          ({ region }) =>
            `  <url>\n    <loc>https://okanaganroam.com/${region}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
        ),
        ...categoryCombos.map(
          ({ region, type }) =>
            `  <url>\n    <loc>https://okanaganroam.com/${region}/${CATEGORY_SLUGS[type]}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
        ),
        ...combos.map(
          ({ region, badge }) =>
            `  <url>\n    <loc>https://okanaganroam.com/guide/${region}/${badge}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
        ),
        ...venueRows.map(
          ({ region, type, slug }) =>
            `  <url>\n    <loc>https://okanaganroam.com/${region}/${CATEGORY_SLUGS[type]}/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
        ),
      ];
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urlEntries,
        '</urlset>',
        '',
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(sitemap);
    }


    // Open Graph / Twitter Card preview image, referenced from the HTML
    // <head> so shared links show a proper branded thumbnail instead of a
    // blank box on Facebook, Twitter/X, Slack, iMessage, etc.
    if (pathname === '/og-image.png' && method === 'GET') {
      const ogPath = path.join(__dirname, 'og-image.png');
      if (fs.existsSync(ogPath)) {
        const image = fs.readFileSync(ogPath);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        return res.end(image);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('og-image.png not found on server');
    }

    // GET /guide/:region/:badge — server-rendered SEO landing page.
    const guideMatch = pathname.match(/^\/guide\/([a-z-]+)\/([a-z_]+)\/?$/);
    if (guideMatch && method === 'GET') {
      const region = guideMatch[1];
      const badge = guideMatch[2];
      if (REGION_LABELS[region] && BOOL_FIELDS.includes(badge)) {
        const rows = db
          .prepare(`SELECT * FROM venues WHERE region = ? AND ${badge} = 1 ORDER BY reviews DESC`)
          .all(region);
        if (rows.length >= MIN_GUIDE_VENUES) {
          const html = renderGuidePage(region, badge, rows.map(rowToVenue));
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Guide page not found');
    }

    // GET /admin/indexnow-submit?key=<INDEXNOW_KEY>
    //
    // Triggers a server-side bulk submission of every URL in the sitemap to
    // the IndexNow API (api.indexnow.org), which fans out to Bing, Yandex,
    // Seznam, and other participating engines. This has to happen
    // server-side rather than from a browser: IndexNow's bulk POST endpoint
    // doesn't send CORS headers, so browser JS gets silently blocked, while
    // a server calling another server has no such restriction.
    //
    // Protected by requiring the IndexNow key itself as a query param —
    // not real auth, just enough to keep this off search-engine crawlers'
    // radar as a normal page (it's already excluded via robots.txt-style
    // reasoning: nobody guesses a 32-char hex key by accident). Re-run this
    // any time a bunch of venues get new badges and you want search engines
    // to know sooner than the next passive sitemap crawl.
    if (pathname === '/admin/indexnow-submit' && method === 'GET') {
      if (query.key !== INDEXNOW_KEY) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Forbidden');
      }
      const today = new Date().toISOString().slice(0, 10);
      const combos = listGuideCombos(MIN_GUIDE_VENUES);
      const urlList = [
        'https://okanaganroam.com/',
        ...combos.map(({ region, badge }) => `https://okanaganroam.com/guide/${region}/${badge}`),
      ];
      try {
        const submitRes = await fetch('https://api.indexnow.org/indexnow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            host: 'okanaganroam.com',
            key: INDEXNOW_KEY,
            keyLocation: `https://okanaganroam.com/${INDEXNOW_KEY}.txt`,
            urlList,
          }),
        });
        const bodyText = await submitRes.text();
        return sendJSON(res, 200, {
          submitted_at: today,
          url_count: urlList.length,
          indexnow_status: submitRes.status,
          indexnow_response: bodyText || '(empty body — normal for a 200/202 success)',
        });
      } catch (err) {
        return sendJSON(res, 502, { error: `IndexNow submission failed: ${err.message}` });
      }
    }

    // GET /api/venues
    if (pathname === '/api/venues' && method === 'GET') {
      return sendJSON(res, 200, listVenues(query));
    }

    // GET /api/stats
    if (pathname === '/api/stats' && method === 'GET') {
      return sendJSON(res, 200, getStats());
    }

    // /api/venues/:id
    const venueIdMatch = pathname.match(/^\/api\/venues\/(\d+)$/);
    if (venueIdMatch) {
      const id = parseInt(venueIdMatch[1]);

      if (method === 'GET') {
        const venue = getVenue(id);
        if (!venue) return sendJSON(res, 404, { error: 'Venue not found' });
        return sendJSON(res, 200, venue);
      }

      if (method === 'PUT') {
        const body = await readBody(req);
        const updated = updateVenue(id, body);
        if (!updated) return sendJSON(res, 404, { error: 'Venue not found' });
        return sendJSON(res, 200, updated);
      }

      if (method === 'DELETE') {
        const deleted = deleteVenue(id);
        if (!deleted) return sendJSON(res, 404, { error: 'Venue not found' });
        return sendJSON(res, 200, { success: true });
      }
    }

    // POST /api/venues
    if (pathname === '/api/venues' && method === 'POST') {
      const body = await readBody(req);
      const created = createVenue(body);
      return sendJSON(res, 201, created);
    }

    // ---------- SEO architecture: region / category / venue pages ----------
    // Registered last, after every fixed route and every /api/* route above,
    // so these broad patterns can never shadow anything that already exists.
    // Each one validates strictly against known regions/categories/slugs —
    // anything that doesn't match a real region, category, or venue falls
    // through to the plain 404 at the bottom of this function.

    // GET /:region/:category/:slug — individual venue page
    const venuePageMatch = pathname.match(/^\/([a-z-]+)\/([a-z-]+)\/([a-z0-9-]+)\/?$/);
    if (venuePageMatch && method === 'GET') {
      const [, region, categorySlug, slug] = venuePageMatch;
      const type = SLUG_TO_TYPE[categorySlug];
      if (REGION_LABELS[region] && type) {
        const venue = findVenueBySlug(region, type, slug);
        if (venue) {
          const relatedVenues = getRelatedVenues(venue);
          const nearbyVenues = getNearbyVenues(venue);
          const venueGuidePages = listGuideCombos(MIN_GUIDE_VENUES).filter((c) => c.region === region && venue[c.badge]);
          const html = renderVenuePage(venue, relatedVenues, nearbyVenues, venueGuidePages);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /:region/:category — category page within a region
    const categoryPageMatch = pathname.match(/^\/([a-z-]+)\/([a-z-]+)\/?$/);
    if (categoryPageMatch && method === 'GET') {
      const [, region, categorySlug] = categoryPageMatch;
      const type = SLUG_TO_TYPE[categorySlug];
      if (REGION_LABELS[region] && type) {
        const venues = getVenuesByRegionCategory(region, type);
        if (venues.length >= MIN_CATEGORY_VENUES) {
          const categoryGuidePages = listGuideCombos(MIN_GUIDE_VENUES).filter(
            (c) => c.region === region && venues.some((v) => v[c.badge])
          );
          const html = renderCategoryPage(region, type, venues, categoryGuidePages);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /:region — region hub page
    const regionPageMatch = pathname.match(/^\/([a-z-]+)\/?$/);
    if (regionPageMatch && method === 'GET') {
      const [, region] = regionPageMatch;
      if (REGION_LABELS[region]) {
        const categoryCounts = getRegionCategoryCounts(region);
        if (Object.keys(categoryCounts).length > 0) {
          const regionGuidePages = listGuideCombos(MIN_GUIDE_VENUES).filter((c) => c.region === region);
          const html = renderRegionPage(region, categoryCounts, regionGuidePages);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    return sendJSON(res, 404, { error: 'Not found' });

  } catch (err) {
    const status = err.status || 500;
    return sendJSON(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Okanagan Roam API listening on http://localhost:${PORT}`);
});
