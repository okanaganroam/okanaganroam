const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3001;
const SITE_PATH = path.join(__dirname, 'okanagan.html');

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
  'description', 'description_fr', 'hours', ...BOOL_FIELDS,
];

function rowToVenue(row) {
  const v = { id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  for (const f of ['name', 'region', 'type', 'cuisine', 'phone', 'price', 'reviews', 'rating', 'description', 'description_fr', 'hours']) {
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
      return `
      <li class="venue-card">
        <h2>${escapeHtml(v.name)}</h2>
        <p class="venue-meta">${meta}</p>
        ${desc}
        <p class="chips">${badgeChips}</p>
      </li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
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
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: title,
  description,
  itemListElement: venues.slice(0, 50).map((v, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': v.type === 'winery' ? 'Winery' : 'FoodEstablishment',
      name: v.name,
      description: v.description || undefined,
    },
  })),
})}
</script>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 780px; margin: 0 auto; padding: 24px 20px 64px; color: #1f2933; line-height: 1.5; }
  a { color: #0b6e4f; }
  header.top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  header.top a.brand { font-weight: 700; text-decoration: none; color: #1f2933; font-size: 1.1rem; }
  h1 { font-size: 1.6rem; margin-bottom: 4px; }
  .subtitle { color: #52606d; margin-bottom: 28px; }
  .venue-card { list-style: none; border: 1px solid #e4e7eb; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; }
  .venue-card h2 { font-size: 1.05rem; margin: 0 0 4px; }
  .venue-meta { color: #7b8794; font-size: 0.85rem; margin: 0 0 8px; }
  .venue-card p { margin: 0 0 8px; font-size: 0.95rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: #eaf6f0; color: #0b6e4f; font-size: 0.75rem; padding: 3px 9px; border-radius: 999px; }
  ul.venues { padding: 0; margin: 0; }
  .cta { display: inline-block; margin-top: 28px; background: #0b6e4f; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; }
  footer { margin-top: 40px; font-size: 0.85rem; color: #7b8794; }
</style>
</head>
<body>
  <header class="top">
    <a class="brand" href="https://okanaganroam.com/">Okanagan Roam</a>
    <a href="https://okanaganroam.com/">Explore the full directory &rarr;</a>
  </header>
  <h1>${escapeHtml(badgeInfo.title)} Venues in ${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${venues.length} verified ${escapeHtml(badgeInfo.noun)} in ${escapeHtml(regionLabel)} — badge-checked from real listings, not guessed.</p>
  <ul class="venues">
    ${cards}
  </ul>
  <a class="cta" href="https://okanaganroam.com/">See all of ${escapeHtml(regionLabel)} on Okanagan Roam</a>
  <footer>Okanagan Roam &middot; <a href="https://okanaganroam.com/">okanaganroam.com</a></footer>
</body>
</html>`;
}

// ---------- router ----------

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
        const html = fs.readFileSync(SITE_PATH);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('okanagan.html not found on server');
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
      const urlEntries = [
        `  <url>\n    <loc>https://okanaganroam.com/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
        ...combos.map(
          ({ region, badge }) =>
            `  <url>\n    <loc>https://okanaganroam.com/guide/${region}/${badge}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
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

    return sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    const status = err.status || 500;
    return sendJSON(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Okanagan Roam API listening on http://localhost:${PORT}`);
});
