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
];

const ALL_FIELDS = [
  'name', 'region', 'type', 'cuisine', 'phone', 'price', 'reviews', 'rating',
  'description', ...BOOL_FIELDS,
];

function rowToVenue(row) {
  const v = { id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  for (const f of ['name', 'region', 'type', 'cuisine', 'phone', 'price', 'reviews', 'rating', 'description']) {
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
