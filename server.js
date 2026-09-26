const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
// Golf course data (2026-09-26): verified green fees, course profiles and
// links to official course maps -- golf pages only. Guarded like db.js so a
// copy of the app without golf-data.js renders exactly as before.
const golfData = (() => { try { return require('./golf-data.js'); } catch (e) { return null; } })();
function golfDetailsFor(venues) {
  return golfData ? golfData.getGolfDetails(db, venues) : new Map();
}
// Canonical opening hours (2026-09-26, Open Now Phase 1): parsing and the
// open/closed/unknown status for venues.hours live in hours.js. Nothing uses
// it yet -- venue pages, structured data, /browse and the trip planner keep
// their own hours logic. Guarded like golf-data.js so a copy of the app
// without hours.js (e.g. the isolated homepage tests) starts exactly as before.
const hoursModule = (() => { try { return require('./hours.js'); } catch (e) { return null; } })();

const PORT = process.env.PORT || 3001;
const SITE_PATH = path.join(__dirname, 'okanagan.html');

// IndexNow key — proves domain ownership so Bing/Yandex/Seznam etc. accept
// instant-indexing submissions instead of waiting for a passive crawl.
// The key itself has no secrecy requirement (it's published at
// /{key}.txt by design, per the IndexNow protocol) — it just has to match
// between the hosted file and whatever key is sent with a submission.
const INDEXNOW_KEY = 'b25ba530bda42cb30e339b0dd848dadf';

// Phase 2.5B: a genuine shared-secret bearer token for the new enrichment
// endpoint below. This is deliberately NOT hardcoded — it's read from an
// environment variable that must be set on Railway (Variables tab) before
// the endpoint will accept any request at all. If the variable is unset,
// the endpoint fails closed (rejects everything) rather than falling back
// to any default or accepting unauthenticated requests. This is a
// different, unrelated value from INDEXNOW_KEY above, which is meant to be
// public — this one must be kept secret and never committed to source.
const ENRICHMENT_ADMIN_TOKEN = process.env.ENRICHMENT_ADMIN_TOKEN || null;

// Build My Trip, Stage 3: the OpenAI key for the natural-language trip
// parser (POST /api/trip/parse below). Same fail-closed pattern as
// ENRICHMENT_ADMIN_TOKEN above -- unset locally and in production for now
// by explicit product decision (not yet provisioned on Railway), so
// callTripParserProvider() always returns a clean "not_configured" error
// rather than attempting a request with no key.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;


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

// Constant-time comparison for the enrichment bearer token, so a caller
// can't learn anything about the correct token's contents by measuring
// response timing. If the lengths differ we return false immediately —
// a minor, widely-accepted length leak, not a content leak — rather than
// throwing (timingSafeEqual requires equal-length buffers).
function safeTokenEquals(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
  for (const f of ['name', 'region', 'type', 'cuisine', 'phone', 'price', 'reviews', 'rating', 'description', 'description_fr', 'hours', 'address', 'website', 'image_url', 'slug', 'latitude', 'longitude', 'redirect_to']) {
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
  const clauses = ['redirect_to IS NULL'];
  const params = [];

  if (query.region) {
    clauses.push('region = ?');
    params.push(query.region);
  }
  if (query.type) {
    clauses.push('type = ?');
    params.push(query.type);
  }
  // Multi-select (2026-09-24): `regions=a,b` and `types=a,b,c`, alongside --
  // never replacing -- the single-value `region`/`type` above, so every
  // existing caller behaves exactly as before. Combined with AND between
  // the two groups and OR within each, which is what the directory needs:
  // (Kelowna OR Penticton) AND (restaurant OR brewery).
  const csv = (value) => String(value).split(',').map((s) => s.trim()).filter(Boolean);
  if (query.regions) {
    const regions = csv(query.regions);
    if (regions.length) {
      clauses.push(`region IN (${regions.map(() => '?').join(', ')})`);
      params.push(...regions);
    }
  }
  if (query.types) {
    const types = csv(query.types);
    if (types.length) {
      // Matches a venue's PRIMARY type or any SECONDARY Food & Drink
      // category membership, so a brewery that is also a restaurant is
      // returned by types=restaurant. One correlated subquery, not N+1.
      const fdKinds = types.map((t) => FD_CATEGORY_KIND_BY_TYPE[t]).filter(Boolean);
      const typeIn = `type IN (${types.map(() => '?').join(', ')})`;
      if (fdKinds.length) {
        clauses.push(`(${typeIn} OR EXISTS (
          SELECT 1 FROM collection_items ci
          JOIN collections c ON c.id = ci.collection_id
          WHERE ci.content_type = 'venue' AND ci.content_id = venues.id
            AND c.kind IN (${fdKinds.map(() => '?').join(', ')})
        ))`);
        params.push(...types, ...fdKinds);
      } else {
        clauses.push(typeIn);
        params.push(...types);
      }
    }
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
    // One bulk lookup for the whole page, not one per venue.
    venues: attachFoodDrinkCategories(rows.map(rowToVenue)),
  };
}

function getVenue(id) {
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!row) return null;
  // Single row: attachFoodDrinkCategories does exactly one extra query here.
  return attachFoodDrinkCategories([rowToVenue(row)])[0];
}

// Optional explicit slug support (2026-09-19): `slug` is deliberately not
// in ALL_FIELDS (so this only affects createVenue, never updateVenue via
// its shared ALL_FIELDS-driven loop -- changing an EXISTING venue's slug
// breaks its live URL with no redirect safety net, a materially different
// risk than assigning one at creation time; that's a separate, not-yet-
// approved change). `null`/omitted behaves exactly as before: the column
// stays NULL and gets filled in by the next backfillSlugs() pass at
// startup, same as it always has. Same character class the router already
// accepts for a slug segment ([a-z0-9-]+), tightened to reject shapes
// slugify() itself would never produce (leading/trailing/double hyphens),
// so a hand-supplied slug always looks like one the system could have
// generated itself. The pre-check mirrors backfillSlugs()'s own
// (region, type, slug) collision query; the existing UNIQUE INDEX
// idx_region_type_slug remains the real backstop regardless.
const EXPLICIT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function createVenue(data) {
  if (!data.name || !data.region || !data.type) {
    const err = new Error('name, region, and type are required');
    err.status = 400;
    throw err;
  }

  let slug;
  if (data.slug !== undefined && data.slug !== null) {
    if (typeof data.slug !== 'string' || !EXPLICIT_SLUG_PATTERN.test(data.slug)) {
      const err = new Error('slug must be lowercase alphanumeric segments separated by single hyphens (e.g. "my-venue-name").');
      err.status = 400;
      throw err;
    }
    const collision = db
      .prepare('SELECT 1 FROM venues WHERE region = ? AND type = ? AND slug = ?')
      .get(data.region, data.type, data.slug);
    if (collision) {
      const err = new Error(`A venue with slug "${data.slug}" already exists for region "${data.region}" and type "${data.type}".`);
      err.status = 409;
      throw err;
    }
    slug = data.slug;
  }

  const cols = ALL_FIELDS;
  const values = cols.map((f) => {
    if (BOOL_FIELDS.includes(f)) return data[f] ? 1 : 0;
    return data[f] !== undefined ? data[f] : null;
  });
  const placeholders = cols.map(() => '?').join(', ');
  const insertCols = slug !== undefined ? [...cols, 'slug'] : cols;
  const insertValues = slug !== undefined ? [...values, slug] : values;
  const insertPlaceholders = slug !== undefined ? `${placeholders}, ?` : placeholders;

  let info;
  try {
    info = db
      .prepare(`INSERT INTO venues (${insertCols.join(', ')}) VALUES (${insertPlaceholders})`)
      .run(...insertValues);
  } catch (err) {
    // Defense in depth only -- the pre-check above should always catch a
    // real collision first. If the UNIQUE INDEX itself ever rejects the
    // insert for any reason, surface it as the same clean 409 rather than
    // an uncaught 500.
    if (slug !== undefined) {
      const conflictErr = new Error(`A venue with slug "${slug}" already exists for region "${data.region}" and type "${data.type}".`);
      conflictErr.status = 409;
      throw conflictErr;
    }
    throw err;
  }
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

// ---------- Phase 2.5: hardened, empty-field-only enrichment update ----------
//
// Purpose: a future enrichment process needs to write address/latitude/
// longitude ONLY when the existing value is genuinely empty, and must
// NEVER be able to overwrite an already-populated value — even under a
// stale-read race, where a process checked the value with a separate GET
// some time ago and is now writing based on that possibly-outdated belief.
//
// The critical design point: the "is this field empty" check and the
// actual write happen in the SAME SQL statement, evaluated atomically by
// SQLite at the moment the UPDATE runs — not as a separate check
// beforehand in application code. A stale application-level belief that a
// field was empty cannot cause an overwrite, because the database
// re-evaluates the WHERE clause against whatever the row's real, current
// state is right now, not whatever some earlier GET returned. This is
// what makes it safe against the exact race the phase asked to test:
// Process A's write, even if based on a stale read, will only actually
// change a row if that row is STILL empty at the instant the UPDATE runs.
//
// This function is intentionally NOT wired to any HTTP route in this
// phase — it exists as tested, available infrastructure for a future
// enrichment phase to call, per the "no new API routes" restriction here.
//
// Only address, latitude, and longitude are supported — deliberately
// narrow, matching the exact fields this hardening was requested for.
// Unknown fields are ignored rather than silently accepted.
const ENRICH_GUARDED_FIELDS = {
  address: {
    // Treat both NULL and empty-string as "empty", matching how the rest
    // of the app already treats an empty address.
    whereClause: `(address IS NULL OR address = '')`,
  },
  latitude: {
    whereClause: `latitude IS NULL`,
  },
  longitude: {
    whereClause: `longitude IS NULL`,
  },
};

// Attempts to write one or more of address/latitude/longitude for a
// venue, each independently guarded so a field already populated is left
// completely untouched. Returns a per-field result so the caller knows
// exactly which fields were actually written vs. skipped because they
// were already populated — this is important: a caller must never assume
// success just because the call didn't throw.
//
// data: { address?, latitude?, longitude? } — only keys present are
// considered; a key explicitly set to undefined is treated as "not
// requested" and left alone entirely.
function guardedEnrichUpdate(id, data) {
  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) return { found: false, results: {} };

  const results = {};
  for (const field of Object.keys(ENRICH_GUARDED_FIELDS)) {
    if (data[field] === undefined) continue;
    const { whereClause } = ENRICH_GUARDED_FIELDS[field];
    // The empty-check and the write are the same atomic UPDATE statement.
    const info = db
      .prepare(`UPDATE venues SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${whereClause}`)
      .run(data[field], id);
    // info.changes === 1 means the row was still empty and got written.
    // info.changes === 0 means the row already had a value (or the id
    // didn't match, already excluded above) and was correctly left alone.
    results[field] = info.changes === 1 ? 'written' : 'skipped_not_empty';
  }
  return { found: true, results, venue: getVenue(id) };
}

// ---------- Phase 2.6R-support: authenticated correction of already-
// populated address/latitude/longitude, with mandatory expected-current
// verification and an audit trail. ----------
//
// This is deliberately a SEPARATE code path from guardedEnrichUpdate()
// above and does not alter its behavior in any way. Where the enrichment
// path guards against overwriting a POPULATED field, this path guards
// against overwriting a value that has DRIFTED from what the caller
// believes it currently is — the expected_current values must match the
// live row exactly, checked atomically in the same UPDATE statement,
// before any write happens.
//
// Only address, latitude, and longitude are supported, matching the
// enrichment path's narrow scope. Field names are hardcoded throughout
// (never taken from the request body), so arbitrary-column writes are
// not possible via this path either.
const CORRECT_GUARDED_FIELDS = ['address', 'latitude', 'longitude'];

// Returns one of:
//   { found: false }
//   { found: true, mismatch: true, live: {...} }               -- expected_current didn't match; nothing written
//   { found: true, mismatch: false, changedFields: [...], venue }  -- write succeeded (or no fields actually differed)
function guardedCorrectUpdate(id, expectedCurrent, corrected, meta) {
  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) return { found: false };

  // Determine which fields actually differ between corrected and
  // expectedCurrent -- a field where corrected === expectedCurrent is not
  // a real change and does not need to be written or logged, but is not
  // an error either.
  const changedFields = CORRECT_GUARDED_FIELDS.filter(
    (f) => corrected[f] !== expectedCurrent[f]
  );

  if (changedFields.length === 0) {
    // Nothing to do -- expected_current and corrected are identical.
    return { found: true, mismatch: false, changedFields: [], venue: getVenue(id) };
  }

  // Build a single atomic UPDATE whose WHERE clause requires ALL THREE
  // expected_current values to match the row's CURRENT live state at the
  // instant the statement runs -- not a separate check beforehand. If the
  // row has drifted from what the caller expects (any of the three
  // fields), changes will be 0 and nothing is written, exactly mirroring
  // the atomicity guarantee guardedEnrichUpdate() already relies on.
  const setClause = CORRECT_GUARDED_FIELDS.map((f) => `${f} = ?`).join(', ');
  const setValues = CORRECT_GUARDED_FIELDS.map((f) => corrected[f]);

  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;

    const info = db
      .prepare(
        `UPDATE venues SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND address = ? AND latitude = ? AND longitude = ?`
      )
      .run(...setValues, id, expectedCurrent.address, expectedCurrent.latitude, expectedCurrent.longitude);

    if (info.changes !== 1) {
      // Live row didn't match expected_current -- roll back (nothing was
      // actually written, but this keeps the transaction discipline
      // uniform) and report the mismatch along with the real live values
      // so the caller can see what actually changed underneath them.
      db.exec('ROLLBACK');
      txOpen = false;
      return { found: true, mismatch: true, live: getVenue(id) };
    }

    // Write one audit-log row per field that actually changed. If ANY of
    // these inserts fails, the whole transaction (including the venue
    // UPDATE above) is rolled back -- the correction must never be left
    // partially applied.
    const logStmt = db.prepare(
      `INSERT INTO venue_enrichment_log
         (venue_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );
    for (const field of changedFields) {
      logStmt.run(
        id,
        field,
        String(expectedCurrent[field]),
        String(corrected[field]),
        'manual_correction',
        meta.reason,
        'high',
        meta.batch_id,
        meta.reviewed_by || null
      );
    }

    db.exec('COMMIT');
    txOpen = false;
    return { found: true, mismatch: false, changedFields, venue: getVenue(id) };
  } catch (err) {
    if (txOpen) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {
        // ROLLBACK itself failing means there's nothing left to roll back
        // (e.g. the failure happened before BEGIN took effect) -- safe to
        // ignore, since the original error is what matters to the caller.
      }
    }
    throw err;
  }
}

// ---------- Phase 2.8D: duplicate-retirement (redirect_to) ----------
//
// Sets redirect_to on a duplicate venue, pointing at its canonical. This
// is a SEPARATE code path from both guardedEnrichUpdate() and
// guardedCorrectUpdate() above and does not alter either of their
// behavior in any way.
//
// This application's node:sqlite connection enforces foreign keys by
// default (verified: PRAGMA foreign_keys returns 1), so SQLite itself
// will reject a redirect_to value that doesn't match an existing
// venues.id. That guarantees the target ROW exists, but says nothing
// about self-redirects, chains, or the target already being a duplicate
// itself -- all of those are checked explicitly here, at the
// application layer, as the primary safeguard. FK enforcement is a
// welcome secondary backstop, not something this function relies on.
function guardedRetireUpdate(duplicateId, canonicalId) {
  // Self-redirect check.
  if (duplicateId === canonicalId) {
    return { ok: false, reason: 'self_redirect' };
  }

  const duplicate = db.prepare('SELECT * FROM venues WHERE id = ?').get(duplicateId);
  if (!duplicate) {
    return { ok: false, reason: 'duplicate_not_found' };
  }
  if (duplicate.redirect_to !== null && duplicate.redirect_to !== undefined) {
    return { ok: false, reason: 'duplicate_already_redirected', current_redirect_to: duplicate.redirect_to };
  }

  const canonical = db.prepare('SELECT * FROM venues WHERE id = ?').get(canonicalId);
  if (!canonical) {
    return { ok: false, reason: 'canonical_not_found' };
  }
  // Refuse if the canonical is itself already a duplicate of something
  // else -- writing this would create a two-hop chain.
  if (canonical.redirect_to !== null && canonical.redirect_to !== undefined) {
    return { ok: false, reason: 'canonical_is_itself_a_duplicate', canonical_redirect_to: canonical.redirect_to };
  }
  // Refuse if any OTHER existing duplicate already points at this same
  // duplicateId as ITS canonical -- i.e. duplicateId is itself someone
  // else's canonical target. Retiring it would orphan that other
  // duplicate's redirect into a chain.
  const dependents = db.prepare('SELECT id FROM venues WHERE redirect_to = ?').all(duplicateId);
  if (dependents.length > 0) {
    return { ok: false, reason: 'duplicate_is_a_canonical_for_others', dependents: dependents.map((d) => d.id) };
  }

  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    const info = db
      .prepare('UPDATE venues SET redirect_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND redirect_to IS NULL')
      .run(canonicalId, duplicateId);
    if (info.changes !== 1) {
      db.exec('ROLLBACK');
      txOpen = false;
      return { ok: false, reason: 'precondition_changed_mid_write' };
    }
    db.exec('COMMIT');
    txOpen = false;
    return { ok: true, venue: getVenue(duplicateId) };
  } catch (err) {
    if (txOpen) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}
    }
    throw err;
  }
}

// ---------- Phase 2.8G: guarded single-field region correction ----------
//
// A SEPARATE, standalone code path. Does not touch guardedEnrichUpdate(),
// guardedCorrectUpdate(), guardedRetireUpdate(), or
// guardedMergeAndRetireUpdate() in any way, and is not reachable through
// any of their routes.
//
// Deliberately NOT built by extending guardedCorrectUpdate()'s
// CORRECT_GUARDED_FIELDS, so that this new capability's blast radius stays
// scoped to exactly one column rather than widening an existing
// multi-field mechanism.
//
// The SQL below has NO dynamic column construction anywhere -- "region" is
// a literal in the SET clause, never a variable. The only two values ever
// bound as parameters are the corrected region value and the
// expected-current region value; a column NAME is never accepted from the
// caller in this function at all.
const VALID_REGIONS = [
  'kelowna', 'penticton', 'vernon', 'west-kelowna', 'oliver', 'osoyoos',
  'summerland', 'naramata', 'lake-country', 'okanagan-falls', 'big-white',
  'peachland', 'armstrong', 'silverstar', 'enderby', 'coldstream', 'lumby',
  'apex', 'kaleden', 'baldy',
];

function guardedRegionCorrectUpdate(id, expectedCurrentRegion, correctedRegion) {
  if (!VALID_REGIONS.includes(correctedRegion)) {
    return { ok: false, reason: 'invalid_region_value' };
  }

  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) {
    return { ok: false, reason: 'venue_not_found' };
  }

  if (existing.region === correctedRegion) {
    // Already correct -- nothing to do. Not an error, but no write either.
    return { ok: true, noop: true, venue: getVenue(id) };
  }

  const info = db
    .prepare('UPDATE venues SET region = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND region = ?')
    .run(correctedRegion, id, expectedCurrentRegion);

  if (info.changes === 0) {
    return { ok: false, reason: 'precondition_failed_region_mismatch', live_region: existing.region };
  }
  if (info.changes > 1) {
    // Structurally should be impossible (id is the primary key), but
    // treat defensively as a hard failure rather than assume success.
    return { ok: false, reason: 'unexpected_multi_row_match', changes: info.changes };
  }

  return { ok: true, noop: false, venue: getVenue(id) };
}

// ---------- Phase 2.6R-support-2: guarded single-field phone correction ----------
//
// A SEPARATE, standalone code path. Does not touch guardedEnrichUpdate(),
// guardedCorrectUpdate(), guardedRetireUpdate(), guardedRegionCorrectUpdate(),
// or guardedMergeAndRetireUpdate() in any way, and is not reachable through
// any of their routes.
//
// Modeled closely on guardedRegionCorrectUpdate()'s single-field pattern
// rather than widening guardedCorrectUpdate()'s fixed three-field
// (address/latitude/longitude) contract -- phone is a different kind of
// correction (a free-text identity field, not part of that geo-bounded
// trio), so it gets its own narrow function and route instead of stretching
// an existing one's documented, deliberately-narrow scope.
//
// Unlike region (NOT NULL in the schema), phone IS nullable. A plain
// `phone = ?` comparison in the WHERE clause would never match when the
// live value is NULL (SQL NULL is never equal to anything, including
// another NULL), so a caller correcting a venue whose phone is currently
// empty would always get a false "mismatch" with the naive comparison.
// The WHERE clause below handles both the populated-value and NULL cases
// explicitly, checked atomically in the same UPDATE statement -- not as a
// separate check beforehand -- exactly like every other guarded* function
// in this file.
//
// Unlike guardedRegionCorrectUpdate() (no audit trail), this DOES write a
// venue_enrichment_log row on a real change, matching guardedCorrectUpdate()'s
// precedent instead -- auditability was an explicit requirement for this
// addition, and the audit-log table already exists with no schema change
// needed (field_name is free TEXT, not an enum).
//
// Returns one of:
//   { found: false }
//   { found: true, mismatch: false, changed: false, venue }              -- no-op: expected_current_phone === corrected_phone
//   { found: true, mismatch: true, live: {...} }                         -- expected_current_phone didn't match the live row; nothing written
//   { found: true, mismatch: false, changed: true, venue }               -- write succeeded, one audit-log row written
function guardedPhoneCorrectUpdate(id, expectedCurrentPhone, correctedPhone, meta) {
  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) return { found: false };

  if (expectedCurrentPhone === correctedPhone) {
    // Nothing to do -- expected_current_phone and corrected_phone are
    // identical, matching guardedCorrectUpdate()'s no-op behavior for an
    // unchanged field. No write, no audit row, not treated as an error.
    return { found: true, mismatch: false, changed: false, venue: getVenue(id) };
  }

  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;

    const info = db
      .prepare(
        `UPDATE venues SET phone = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))`
      )
      .run(correctedPhone, id, expectedCurrentPhone, expectedCurrentPhone);

    if (info.changes !== 1) {
      // Live row didn't match expected_current_phone -- roll back (nothing
      // was actually written) and report the mismatch along with the real
      // live value, exactly mirroring guardedCorrectUpdate()'s behavior.
      db.exec('ROLLBACK');
      txOpen = false;
      return { found: true, mismatch: true, live: getVenue(id) };
    }

    db.prepare(
      `INSERT INTO venue_enrichment_log
         (venue_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
       VALUES (?, 'phone', ?, ?, 'manual_correction', ?, 'high', ?, 0, ?)`
    ).run(
      id,
      existing.phone === null ? null : String(existing.phone),
      String(correctedPhone),
      meta.reason,
      meta.batch_id,
      meta.reviewed_by || null
    );

    db.exec('COMMIT');
    txOpen = false;
    return { found: true, mismatch: false, changed: true, venue: getVenue(id) };
  } catch (err) {
    if (txOpen) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {
        // ROLLBACK itself failing means there's nothing left to roll back --
        // safe to ignore, since the original error is what matters to the caller.
      }
    }
    throw err;
  }
}

// ---------- Phase 2.9: guarded narrow amenity-flag correction ----------
//
// A SEPARATE, standalone code path. Does not touch guardedEnrichUpdate(),
// guardedCorrectUpdate(), guardedRetireUpdate(), guardedRegionCorrectUpdate(),
// guardedPhoneCorrectUpdate(), or guardedMergeAndRetireUpdate() -- including
// its MERGEABLE_FIELDS allowlist -- in any way, and is not reachable
// through any of their routes.
//
// Scoped to exactly four boolean amenity flags: vegan, vegetarian, patio,
// gluten_free. These columns are `INTEGER DEFAULT 0` (db.js) and are never
// NULL in practice, so there is no "empty" sentinel to guard an overwrite
// against the way guardedMergeAndRetireUpdate()'s NULL-check does for
// phone/price/reviews/description_fr. Instead, exactly like
// guardedPhoneCorrectUpdate() and guardedRegionCorrectUpdate(), the caller
// must state the value it currently believes the field holds
// (expected_current), verified atomically against the live row in the
// same UPDATE's WHERE clause -- not a separate check beforehand.
//
// A second, field-specific guard on top of that: a write that would turn
// an existing true into false is always refused, regardless of what
// expected_current claims. This function exists to carry verified,
// positive amenity data forward (e.g. from a duplicate being retired) onto
// a canonical record -- it is not a general-purpose amenity editor, and
// must never be used to erase a true value.
const AMENITY_GUARDED_FIELDS = ['vegan', 'vegetarian', 'patio', 'gluten_free'];

// fieldValues: { [fieldName]: { expectedCurrent: boolean, corrected: boolean } }
// -- only keys already present in AMENITY_GUARDED_FIELDS are ever written;
// the HTTP route below additionally rejects any unexpected key before this
// function is ever called, so this loop iterating AMENITY_GUARDED_FIELDS
// (never Object.keys(fieldValues)) is a second, structural backstop against
// arbitrary column names reaching the UPDATE statement.
//
// Each field is checked and written independently -- one field failing its
// expected-current check, or being a true->false attempt, does not block
// the others in the same call from being written. All writes for a call do
// share one transaction, so a genuine unexpected error rolls every field
// attempted in that call back together rather than leaving a partial state
// from a crash mid-way through.
//
// Returns:
//   { found: false }
//   { found: true, results: { [field]: 'written' | 'noop_already_matches' | 'rejected_true_to_false' | 'rejected_expected_mismatch' }, venue }
function guardedAmenityCorrectUpdate(id, fieldValues, meta) {
  const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
  if (!existing) return { found: false };

  const results = {};
  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;

    for (const field of AMENITY_GUARDED_FIELDS) {
      if (!(field in fieldValues)) continue;
      const { expectedCurrent, corrected } = fieldValues[field];

      // Never permit setting an existing true back to false via this
      // mechanism, regardless of what expected_current claims.
      if (corrected === false && expectedCurrent === true) {
        results[field] = 'rejected_true_to_false';
        continue;
      }

      if (expectedCurrent === corrected) {
        // No-op: nothing to write, not an error -- mirrors
        // guardedPhoneCorrectUpdate()'s / guardedCorrectUpdate()'s handling
        // of a field where corrected === expectedCurrent.
        results[field] = 'noop_already_matches';
        continue;
      }

      const expectedInt = expectedCurrent ? 1 : 0;
      const correctedInt = corrected ? 1 : 0;

      // The expected-current check and the write are the same atomic
      // UPDATE statement -- SQLite re-evaluates the WHERE clause against
      // whatever the row's real, current state is right now, not whatever
      // an earlier GET returned, exactly like every other guarded* function
      // in this file.
      const info = db
        .prepare(`UPDATE venues SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${field} = ?`)
        .run(correctedInt, id, expectedInt);

      if (info.changes !== 1) {
        results[field] = 'rejected_expected_mismatch';
        continue;
      }

      db.prepare(
        `INSERT INTO venue_enrichment_log
           (venue_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
         VALUES (?, ?, ?, ?, 'manual_correction', ?, 'high', ?, 0, ?)`
      ).run(id, field, String(expectedInt), String(correctedInt), meta.reason, meta.batch_id, meta.reviewed_by || null);

      results[field] = 'written';
    }

    db.exec('COMMIT');
    txOpen = false;
    return { found: true, results, venue: getVenue(id) };
  } catch (err) {
    if (txOpen) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {
        // ROLLBACK itself failing means there's nothing left to roll back --
        // safe to ignore, since the original error is what matters to the caller.
      }
    }
    throw err;
  }
}

function deleteVenue(id) {
  const info = db.prepare('DELETE FROM venues WHERE id = ?').run(id);

  return info.changes > 0;
}

// ---------- Phase 2.8E/2.8F: narrow field-merge + retire ----------
//
// A SEPARATE, additional code path from guardedRetireUpdate() above -- that
// function is completely unmodified and unaffected by this one. This one is
// scoped specifically to the case where a duplicate carries a small,
// explicit set of null-vs-value fields that should be transferred to the
// canonical BEFORE/WITH the redirect, rather than lost.
//
// MERGEABLE_FIELDS is a hardcoded master allowlist. Field NAMES are NEVER
// taken from the request body -- only VALUES are, and only for keys that
// already appear in this hardcoded array. This makes arbitrary-column
// writes structurally impossible via this endpoint, matching the existing
// guardedEnrichUpdate()/guardedCorrectUpdate()/guardedRetireUpdate()
// pattern.
//
// Phase 2.8F extends this from "always require exactly phone+price+reviews"
// to "accept any non-empty SUBSET of this master list", so a single pair
// can be authorized to transfer just e.g. description_fr, without widening
// what field names are reachable at all. The set of fields actually
// touched by the SQL statement is built from Object.keys(fieldValues)
// filtered against MERGEABLE_FIELDS -- never from arbitrary request input.
const MERGEABLE_FIELDS = ['phone', 'price', 'reviews', 'description_fr'];

function guardedMergeAndRetireUpdate(duplicateId, canonicalId, fieldValues) {
  // Self-redirect check.
  if (duplicateId === canonicalId) {
    return { ok: false, reason: 'self_redirect' };
  }

  // Validate fieldValues keys are a NON-EMPTY SUBSET of the master
  // allowlist. Reject anything unexpected rather than silently ignoring
  // it. Reject an empty payload (a merge call must actually merge
  // something, or callers should use plain /admin/retire-duplicate
  // instead).
  const providedKeys = Object.keys(fieldValues);
  if (providedKeys.length === 0) {
    return { ok: false, reason: 'no_merge_fields_provided' };
  }
  const unexpectedKeys = providedKeys.filter((k) => !MERGEABLE_FIELDS.includes(k));
  if (unexpectedKeys.length > 0) {
    return { ok: false, reason: 'unexpected_merge_fields', unexpectedKeys };
  }
  // De-duplicate and fix the exact field order deterministically (the
  // order of MERGEABLE_FIELDS, not the order keys happened to arrive in
  // the request), so the generated SQL is always identical for a given
  // field set regardless of client-supplied key ordering.
  const fieldsToMerge = MERGEABLE_FIELDS.filter((f) => providedKeys.includes(f));

  const duplicate = db.prepare('SELECT * FROM venues WHERE id = ?').get(duplicateId);
  if (!duplicate) {
    return { ok: false, reason: 'duplicate_not_found' };
  }
  if (duplicate.redirect_to !== null && duplicate.redirect_to !== undefined) {
    return { ok: false, reason: 'duplicate_already_redirected', current_redirect_to: duplicate.redirect_to };
  }

  const canonical = db.prepare('SELECT * FROM venues WHERE id = ?').get(canonicalId);
  if (!canonical) {
    return { ok: false, reason: 'canonical_not_found' };
  }
  if (canonical.redirect_to !== null && canonical.redirect_to !== undefined) {
    return { ok: false, reason: 'canonical_is_itself_a_duplicate', canonical_redirect_to: canonical.redirect_to };
  }
  const dependents = db.prepare('SELECT id FROM venues WHERE redirect_to = ?').all(duplicateId);
  if (dependents.length > 0) {
    return { ok: false, reason: 'duplicate_is_a_canonical_for_others', dependents: dependents.map((d) => d.id) };
  }

  // Precondition: every field being merged IN THIS CALL must currently be
  // NULL on the canonical -- not the full master list, just whatever
  // subset this call specified. Checked here for a clear error message,
  // AND enforced again atomically inside the UPDATE's WHERE clause below.
  const nonNullOnCanonical = fieldsToMerge.filter(
    (f) => canonical[f] !== null && canonical[f] !== undefined
  );
  if (nonNullOnCanonical.length > 0) {
    return { ok: false, reason: 'canonical_field_not_null', fields: nonNullOnCanonical };
  }

  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;

    // Statement 1: merge only the requested (validated, allowlisted)
    // fields onto the canonical. Column names come only from
    // fieldsToMerge, which is itself filtered from MERGEABLE_FIELDS --
    // never from raw request keys. Guarded by requiring every one of
    // those specific fields to still be NULL at write time.
    const setClause = fieldsToMerge.map((f) => `${f} = ?`).join(', ');
    const whereNullClause = fieldsToMerge.map((f) => `${f} IS NULL`).join(' AND ');
    const setValues = fieldsToMerge.map((f) => fieldValues[f]);

    const mergeInfo = db
      .prepare(
        `UPDATE venues SET ${setClause}, updated_at = CURRENT_TIMESTAMP ` +
          `WHERE id = ? AND ${whereNullClause}`
      )
      .run(...setValues, canonicalId);

    if (mergeInfo.changes !== 1) {
      db.exec('ROLLBACK');
      txOpen = false;
      return { ok: false, reason: 'canonical_precondition_changed_mid_write' };
    }

    // Statement 2: the redirect, identical guard to guardedRetireUpdate().
    const redirectInfo = db
      .prepare('UPDATE venues SET redirect_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND redirect_to IS NULL')
      .run(canonicalId, duplicateId);

    if (redirectInfo.changes !== 1) {
      db.exec('ROLLBACK');
      txOpen = false;
      return { ok: false, reason: 'duplicate_precondition_changed_mid_write' };
    }

    db.exec('COMMIT');
    txOpen = false;
    return { ok: true, canonical: getVenue(canonicalId), duplicate: getVenue(duplicateId), mergedFields: fieldsToMerge };
  } catch (err) {
    if (txOpen) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}

    }
    throw err;
  }
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE redirect_to IS NULL').get().n;
  const phoned = db.prepare("SELECT COUNT(*) AS n FROM venues WHERE phone IS NOT NULL AND phone != '' AND redirect_to IS NULL").get().n;
  const vegetarian = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE vegetarian = 1 AND redirect_to IS NULL').get().n;
  const vegan = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE vegan = 1 AND redirect_to IS NULL').get().n;
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
  // Distilleries (2026-09-24): craft distilleries were previously filed as
  // `cocktail` or `brewery`. A plain Food & Drink type like brewery -- same
  // region/category pages and /food-drink filter (not the trip planner; see
  // TRIP_PLANNER_EXCLUDED_TYPES).
  distillery: 'distilleries',
  golf: 'golf',
  beach: 'beaches',
  // Outdoors (2026-09-20, Phase 1 seed): parks, trails, viewpoints,
  // nature centres, ski resorts and Nordic centres. Same reusable
  // category architecture as Golf/Beaches; see THEMED_CATEGORY_TYPES and
  // ALL_REGIONS_CATEGORIES below.
  outdoor: 'outdoors',
};
// Regional category URLs that were published and later emptied by a type
// correction (2026-09-24: Maple Leaf Spirits and Alchemist Distiller moved
// cocktail -> distillery). They keep answering 200 with a zero-results state
// instead of 404ing; every other empty region/category pair still 404s.
const RETAINED_EMPTY_CATEGORY_PAGES = new Set(['naramata/cocktail', 'summerland/cocktail']);
const SLUG_TO_TYPE = Object.fromEntries(Object.entries(CATEGORY_SLUGS).map(([type, slug]) => [slug, type]));

// Beaches (2026-09-19, Phase 2): the second category rendered with the
// approved homepage design system that Golf introduced (homepage header,
// app.css, name-as-link cards with the "View details" cue, Favorite / Add
// to Trip, the site-wide floating Trip tray, and the five-action venue CTA
// row). Golf's implementation is left exactly as deployed; each Golf gate
// below simply also admits the types in this set. Nothing in this set is
// consulted by the homepage: the homepage's mood cards, footer links and
// injected sections never enumerate CATEGORY_SLUGS, so adding a type here
// cannot surface a tile, count, link or markup change on '/'. Enforced by
// the "homepage byte-identity" tests.
const THEMED_CATEGORY_TYPES = new Set(['golf', 'beach', 'outdoor']);
function usesThemedCategoryLayout(type) {
  return THEMED_CATEGORY_TYPES.has(type);
}

// Types that get the themed (Golf/Beaches-style) treatment on their
// Okanagan-wide /:category hub ONLY, never on their /:region/:category
// pages or their individual venue pages. Wine (2026-09-23) is the first:
// its hub is a new page, but wineries already have 14 live regional pages
// and 204 live venue pages whose current presentation must not change.
// THEMED_CATEGORY_TYPES stays the global switch; this set is consulted
// only by renderCategoryAllRegionsPage(), which threads the result down
// as an explicit `themed` override. Every shared helper still defaults to
// usesThemedCategoryLayout(), so no other caller's output can move.
const HUB_ONLY_THEMED_TYPES = new Set(['winery']);
function usesThemedHubLayout(type) {
  return usesThemedCategoryLayout(type) || HUB_ONLY_THEMED_TYPES.has(type);
}

// Types that get the Favorite / Add to Trip controls on their REGION and
// VENUE pages without the themed visual treatment (2026-09-23). Wine is the
// first: its /wineries hub is themed, but its 14 region pages and 204 venue
// pages must keep their existing presentation exactly, so they receive the
// controls plus the small stylesheet those controls need -- and nothing
// else: no golf body class, no app.css, no trip tray, no card redesign.
// This is possible because golfFavTripScriptBody()'s standalone branch
// already implements the full behaviour against the same okanaganFavorites
// / okanaganTrip localStorage keys the homepage Trip Planner reads, so
// app.js is not required to make the buttons work.
const ENGAGEMENT_ONLY_TYPES = new Set(['winery']);
function usesEngagementControls(type) {
  return usesThemedCategoryLayout(type) || ENGAGEMENT_ONLY_TYPES.has(type);
}

// Categories that exist as venue pages but are deliberately NOT offered
// by the Build My Trip planner yet (interest chips on /trip, the
// `interests` field of POST /api/trip/generate, the LLM/deterministic
// parser vocabulary, and the itinerary candidate pool). Beaches launch as
// browse/favourite/add-to-trip-tray venues only; making them a planner
// interest is a separate, later decision. Favorite and Add to Trip on a
// beach page still work -- those are name-keyed localStorage features of
// the homepage module and never consult this list.
// Distilleries (2026-09-24) are excluded for the same reason as beaches: the
// /trip client labels stops with app.js's type.* keys, and app.js is a frozen
// homepage asset with no type.distillery entry.
const TRIP_PLANNER_EXCLUDED_TYPES = new Set(['beach', 'outdoor', 'distillery']);
const TRIP_INTEREST_TYPES = Object.keys(CATEGORY_SLUGS).filter((t) => !TRIP_PLANNER_EXCLUDED_TYPES.has(t));
function isTripPlannerType(type) {
  return TRIP_INTEREST_TYPES.includes(type);
}

// Reusable category-page architecture (2026-09-19): which category types
// currently have an Okanagan-wide "/:category" page (region-selector,
// all-regions listing) turned on -- Golf is the first, deliberately kept
// as a small explicit allowlist rather than "every category automatically
// gets one" so that adding a future category's wide page later (Wine,
// etc.) is a one-line addition here, without silently exposing a new
// public URL for every existing category type as an unannounced side
// effect of this refactor. getVenuesByCategory()/renderCategoryAllRegionsPage()
// below are already fully generic by `type`; only the route dispatch is
// gated by this list.
const ALL_REGIONS_CATEGORIES = ['golf', 'beach', 'outdoor', 'winery'];

// Human-readable label per category, singular and plural, for titles/H1s
const CATEGORY_LABELS = {
  restaurant: { singular: 'Restaurant', plural: 'Restaurants' },
  winery: { singular: 'Winery', plural: 'Wineries' },
  cafe: { singular: 'Cafe', plural: 'Cafes' },
  brewery: { singular: 'Brewery', plural: 'Breweries' },
  pub: { singular: 'Pub', plural: 'Pubs' },
  cocktail: { singular: 'Cocktail Lounge', plural: 'Cocktail Lounges' },
  distillery: { singular: 'Distillery', plural: 'Distilleries' },
  golf: { singular: 'Golf Course', plural: 'Golf Courses' },
  beach: { singular: 'Beach', plural: 'Beaches' },
  outdoor: { singular: 'Outdoor Destination', plural: 'Outdoor Destinations' },
};

// Design Sprint 4: static editorial micro-copy, following the exact same
// plain-constant pattern as CATEGORY_LABELS/REGION_LABELS above -- no new
// schema, no new taxonomy, just short approved copy keyed by the existing
// type/region keys. Deliberately does not cover every region: Kaleden,
// Coldstream, Lumby, and Baldy were explicitly excluded during creative
// review for lack of enough evidence to write a genuine (non-filler) line
// -- looking one up simply returns undefined, handled gracefully wherever
// it's used below.
const CATEGORY_TAGLINES = {
  restaurant: 'Sit-down meals worth planning your day around.',
  cafe: 'Coffee, baking, and a good reason to slow down.',
  winery: "Tasting rooms across the valley's growing wine country.",
  brewery: "Local beer, made close to where you're standing.",
  pub: 'Casual food and a drink, no reservation needed.',
  distillery: 'Small-batch spirits, poured where they are made.',
  golf: "Courses across the Okanagan's valleys and benches.",
  beach: 'Public beaches and swimming spots on the valley’s lakes.',
};

const REGION_TAGLINES = {
  kelowna: "The valley's largest hub, with the widest spread of everything.",
  'west-kelowna': 'Across the bridge, with its own quieter wine and lake scene.',
  peachland: "A small lakeside community on Okanagan Lake's west shore.",
  'lake-country': 'North of Kelowna, where orchards meet a string of small lakes.',
  naramata: 'A quiet bench road lined with small, walkable wineries.',
  summerland: "A lakeside town with a slower pace than its bigger neighbours.",
  penticton: 'Set between two lakes, with a compact, walkable downtown.',
  'okanagan-falls': 'A small South Okanagan community along the wine route.',
  oliver: "Self-described 'Wine Capital of Canada,' deep in vineyard country.",
  osoyoos: "Canada's warmest lake, near the valley's southern desert landscape.",
  vernon: "The North Okanagan's main hub, near three lakes.",
  armstrong: 'A small North Okanagan farming community.',
  enderby: "A small community at the Okanagan's northern edge.",
  'big-white': 'A ski resort community above the Okanagan Valley.',
  silverstar: 'A ski resort above Vernon, in the North Okanagan.',
  apex: 'A small ski resort near Penticton.',
};

// One JS source of truth for the compact-band accent colors used by
// Design Sprint 4's new compact visual band (Hidden Gems homepage cards,
// related/nearby venue cards). Mirrors -- but does not modify -- the
// color values Design Sprint 2 already hardcoded directly into
// SEO_PAGE_CSS's .venue-hero-* gradient rules; kept as a single lookup
// here so the two *new* compact-band stylesheets generated below (one for
// SEO_PAGE_CSS's related/nearby cards, one for the homepage's injected
// styles) both read from the same values instead of hardcoding them
// twice, without touching Sprint 2's already-shipped venue-hero CSS at
// all. 'golf' again has no prior SPA tag color to match, so it reuses the
// same complementary green already chosen for it in Sprint 2.
const TYPE_ACCENT_GRADIENTS = {
  restaurant: ['#2A6B67', '#1E4F4C'],
  winery: ['#8C4A5E', '#6B2C40'],
  brewery: ['#E0A94E', '#B8802E'],
  cafe: ['#C08A4E', '#8A631F'],
  pub: ['#6B8B5E', '#4A6741'],
  cocktail: ['#A25C93', '#7A3B6E'],
  // 'distillery' (2026-09-24): brewery's second stop deepened into cafe's,
  // so no new hue family enters the site.
  distillery: ['#B8802E', '#8A631F'],
  golf: ['#4E7A5E', '#345942'],
  // 'beach' (2026-09-19): the reference navy pair from tokens.css
  // (--ref-navy -> --ref-navy-deep), the only token family not already
  // claimed by another type, so no new colour enters the site.
  beach: ['#1B2B3A', '#101B24'],
  // 'outdoor' (2026-09-20): the site's --ink earth tone (#4A3428) as the
  // first stop, deepened to a darker second stop the same way every other
  // type's gradient deepens its base hue; no new hue family enters the site.
  outdoor: ['#4A3428', '#2F2118'],
};

function compactBandCSSRules(className) {
  return Object.keys(TYPE_ACCENT_GRADIENTS).map((type) => {
    const [c1, c2] = TYPE_ACCENT_GRADIENTS[type];
    return `.${className}-${type} { background: linear-gradient(135deg, ${c1}, ${c2}); }`;
  }).join('\n  ');
}

// Shared HTML helper for Design Sprint 4's compact visual band --
// deterministic, requires no image, reused identically by both the
// homepage Hidden Gems cards and venue-page related/nearby cards so the
// same category-color logic exists in exactly one place rather than being
// reimplemented per call site.
function compactVisualBandHtml(type, opts = {}) {
  const sizeClass = opts.size === 'small' ? 'compact-band-sm' : '';
  const label = CATEGORY_LABELS[type] ? CATEGORY_LABELS[type].singular : type;
  return `<div class="compact-band compact-band-${type} ${sizeClass}"><span class="compact-band-label">${escapeHtml(label)}</span></div>`;
}

// Reference redesign (webpage design.png): each Hidden Gem's own
// venue.image_url is empty for every approved gem (no per-venue
// photography exists), and decision #8 explicitly forbids fabricating a
// photograph of a specific business. Reusing the matching mood-category
// image as the card's photo backdrop is real, already-approved creative
// (not a stand-in for a fake business photo) and keeps the visual
// treatment the reference calls for without inventing anything.
const HIDDEN_GEM_TYPE_IMAGE = {
  winery: '/images/mood/drink.webp',
  restaurant: '/images/mood/eat.webp',
  cafe: '/images/mood/eat.webp',
  brewery: '/images/mood/eat.webp',
  pub: '/images/mood/eat.webp',
  cocktail: '/images/mood/eat.webp',
  distillery: '/images/mood/drink.webp',
  golf: '/images/mood/golf.webp',
  beach: '/images/mood/beaches.webp',
};

// Design Sprint 4 / reference redesign: the Hidden Gems homepage card has
// a genuinely different structure from the shared venueCardHtml() (full-
// bleed photo, bottom-overlay text, a short blurb instead of the full
// description) -- kept as its own function rather than adding several new
// conditional branches to venueCardHtml(), so that function's existing
// behavior on category/guide pages is completely unaffected.
// NOT currently called by the homepage (see the content-model change note
// above hiddenGemEditorialCardHtml()) -- kept defined and exported since
// it's still real, correct, independently-tested behavior that could
// back a future "view all hidden gems" page.
function hiddenGemHomepageCardHtml(venue) {
  const catSlug = CATEGORY_SLUGS[venue.type];
  const href = (venue.slug && catSlug) ? `/${venue.region}/${catSlug}/${venue.slug}` : '#';
  // Milestone 2 (Hidden Gems editorial redesign): the rating is
  // deliberately no longer shown here -- the approved architecture spec
  // calls for de-emphasizing directory-style metadata (ratings/hours) so
  // the editorial blurb, not a number, carries the card. The underlying
  // query/data and the rating value itself are untouched -- venue.rating
  // is still used elsewhere (e.g. ORDER BY in the query above,
  // category/venue pages) exactly as before.
  const blurb = HIDDEN_GEM_HOMEPAGE_BLURBS[venue.slug] || (venue.description || '').split('.').slice(0, 1).join('.') + '.';
  const img = HIDDEN_GEM_TYPE_IMAGE[venue.type] || '/images/mood/hidden-gems.png';
  // Reference redesign, forensic-comparison rebuild: the reference card
  // has no top-right region chip and no "Hidden Gem" badge at all -- just
  // a small pin glyph directly before the venue name on one line, a
  // one-line description below it, and the circular arrow button. The
  // region label (previously shown as a separate chip) is dropped rather
  // than kept unused.
  return `<a class="hidden-gem-card" href="${href}">
    <img class="hidden-gem-card-img" src="${img}" width="640" height="196" alt="" loading="lazy">
    <span class="hidden-gem-card-scrim" aria-hidden="true"></span>
    <span class="hidden-gem-card-body">
      <h3><svg class="hidden-gem-card-pin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-7.5 7-12.5A7 7 0 0 0 5 8.5C5 13.5 12 21 12 21z"/><circle cx="12" cy="8.5" r="2.4"/></svg>${escapeHtml(venue.name)}</h3>
      <p>${escapeHtml(blurb)}</p>
    </span>
    <span class="hidden-gem-card-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
  </a>`;
}

// Short homepage-card blurbs for the 6 editorially approved Hidden Gems,
// keyed by their existing slugs (no new database field). Each is a
// distinct, shorter rewrite of that venue's own existing longer
// description already in the database -- no fact, claim, award, or
// detail appears here that isn't already stated there. The full existing
// descriptions remain completely unchanged and still render in full on
// each venue's own detail page.
const HIDDEN_GEM_HOMEPAGE_BLURBS = {
  'chabendo-gelato': "Hand-made gelato on Naramata's Old Main Rd — try the lemon, the flavour reviewers keep comparing to Italy.",
  'buffalo-rouge-brewing-co': 'A Kelowna brewpub built entirely around vegan and vegetarian food, with a dedicated gluten-free fryer and live music nights.',
  'black-widow-winery': 'A family-run boutique winery on the Naramata Bench, known for gold-medal wines and a founder who leads tastings personally.',
  'beat-patisserie': 'A Lake Country patisserie built around genuinely exceptional gluten-free baking — try the brownies, carrot cake, or pavlova.',
  'baccata-ridge-winery': 'A one-family organic winery near Enderby making distinctive blueberry and honey wines, named for the yew trees on its land.',
  'the-flealess-hound-pub': 'A historic Oliver pub renovated into a proper gastropub, with food reviewers say rivals a restaurant at twice the price.',
};

// DB `type` -> schema.org @type. Every one of these is a real, valid
// schema.org type — no generic fallback needed for any of the 7 types
// this site currently has (Phase 2 Sprint 1 added `golf` -> GolfCourse,
// itself a real LocalBusiness subtype, alongside the original 6
// FoodEstablishment/BarOrPub types).
const SCHEMA_TYPE_MAP = {
  restaurant: 'Restaurant',
  winery: 'Winery',
  cafe: 'CafeOrCoffeeShop',
  brewery: 'Brewery',
  pub: 'BarOrPub',
  cocktail: 'BarOrPub', // schema.org has no distinct "cocktail lounge" type; BarOrPub is the correct closest official type
  distillery: 'Distillery', // schema.org/Distillery, a FoodEstablishment subtype
  golf: 'GolfCourse',
  beach: 'Beach', // schema.org/Beach (a CivicStructure), the exact type for a public beach
  outdoor: 'TouristAttraction', // parks, trails, viewpoints, nature centres and ski/Nordic areas are all Places a visitor seeks out; no single narrower schema.org type fits every seed record
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
// One-time, idempotent backfill: assigns a permanent slug to any venue
// that doesn't have one yet. Never touches a venue that already has a
// slug — per the "permanent stored slugs" decision, slugs are not
// regenerated if a name changes later.
//
// Collision resolution is a deterministic loop: base -> base-{id} ->
// base-{id}-2 -> base-{id}-3 -> ... Each candidate is checked against
// BOTH the in-memory set built for this run AND the database directly
// (the database is the final authority — the in-memory set is a fast
// pre-check, not a substitute for asking the actual table). This
// protects against any second-order collision where a disambiguated
// candidate (e.g. "foo-25") coincidentally matches another venue's own
// independently-generated slug.
//
// Returns { count, errors } and NEVER throws — if a specific row
// genuinely cannot be given a unique slug (should be structurally
// impossible, since the loop can extend indefinitely), that row's id,
// name, region, and type are recorded in `errors` and processing
// continues with the next venue rather than aborting the whole batch or
// silently pretending success.
function backfillSlugs() {
  const rows = db.prepare('SELECT id, name, region, type FROM venues WHERE slug IS NULL ORDER BY id').all();
  if (rows.length === 0) return { count: 0, errors: [] };

  const usedInScope = new Set(
    db.prepare('SELECT region, type, slug FROM venues WHERE slug IS NOT NULL').all()
      .map((r) => `${r.region}|${r.type}|${r.slug}`)
  );

  const existsInDb = db.prepare(
    'SELECT 1 FROM venues WHERE region = ? AND type = ? AND slug = ? LIMIT 1'
  );
  const updateSlug = db.prepare('UPDATE venues SET slug = ? WHERE id = ?');

  const MAX_ATTEMPTS = 1000; // structurally should never be reached; a safety bound, not a real expectation
  let count = 0;
  const errors = [];

  for (const row of rows) {
    // Defensive fallback for empty/unusual names (e.g. "", "   ", "!!!")
    // that would otherwise slugify to an empty string.
    const base = slugify(row.name) || `venue-${row.id}`;

    let attempt = 0;
    let candidate = base;
    let scopeKey = `${row.region}|${row.type}|${candidate}`;

    while (
      usedInScope.has(scopeKey) ||
      existsInDb.get(row.region, row.type, candidate)
    ) {
      attempt++;
      if (attempt > MAX_ATTEMPTS) {
        errors.push({
          id: row.id,
          name: row.name,
          region: row.region,
          type: row.type,
          reason: `could not find a unique slug after ${MAX_ATTEMPTS} attempts`,
        });
        candidate = null;
        break;
      }
      candidate = attempt === 1 ? `${base}-${row.id}` : `${base}-${row.id}-${attempt}`;
      scopeKey = `${row.region}|${row.type}|${candidate}`;
    }

    if (candidate === null) continue; // recorded in errors above; do not update, do not fake success

    usedInScope.add(scopeKey);
    try {
      updateSlug.run(candidate, row.id);
      count++;
    } catch (err) {
      // The database is the final authority: if it still rejects this
      // candidate for any reason (should be unreachable given the checks
      // above), record exactly which venue failed rather than crash or
      // silently skip.
      errors.push({ id: row.id, name: row.name, region: row.region, type: row.type, reason: err.message });
    }
  }

  return { count, errors };
}

function getRegionCategoryCounts(region) {
  // { restaurant: 12, winery: 4, ... } for a region, only categories with >=1
  // ACTIVE venue -- redirected (retired) rows are not counted (2026-09-25), so
  // the destination page's numbers match the category pages they link to.
  return db
    .prepare('SELECT type, COUNT(*) AS n FROM venues WHERE region = ? AND redirect_to IS NULL GROUP BY type')
    .all(region)
    .filter((r) => CATEGORY_SLUGS[r.type]) // ignore any unexpected/unmapped type defensively
    .reduce((acc, r) => { acc[r.type] = r.n; return acc; }, {});
}

function getVenuesByRegionCategory(region, type) {
  return db
    .prepare('SELECT * FROM venues WHERE region = ? AND type = ? AND redirect_to IS NULL ORDER BY name ASC')
    .all(region, type)
    .map(rowToVenue);
}

// Okanagan-wide category listing (2026-09-19), for categories whose
// venues are deliberately spread across multiple regions rather than
// concentrated in one -- Golf is the first and, so far, only such
// category. Ordered by region then name so the mixed-region list still
// reads as a coherent, grouped page rather than a shuffled one.
function getVenuesByCategory(type) {
  return db
    .prepare('SELECT * FROM venues WHERE type = ? AND redirect_to IS NULL ORDER BY region ASC, name ASC')
    .all(type)
    .map(rowToVenue);
}

function findVenueBySlug(region, type, slug) {
  const row = db
    .prepare('SELECT * FROM venues WHERE region = ? AND type = ? AND slug = ?')
    .get(region, type, slug);
  return row ? rowToVenue(row) : null;
}

// Category-change lookup (2026-09-24): the same region+slug, ignoring type.
// Used ONLY to 301 an old category URL after a venue's `type` is corrected
// (e.g. a pub that had been filed as a restaurant), so previously indexed
// URLs keep working instead of 404ing.
//
// Deliberately returns null unless EXACTLY ONE active venue matches, because
// (region, slug) is NOT unique: three golf clubs currently keep a separate
// clubhouse-restaurant record under the same region and slug as the course
// itself (e.g. penticton/penticton-golf-country-club exists as both
// type='golf' and type='restaurant'). Both of those URLs resolve correctly
// on their own, so this fallback must never guess between them.
//
// `redirect_to IS NULL` keeps this clear of the venue-to-venue duplicate
// redirect above: a retired venue reached under the wrong category still
// 404s, exactly as it does today.
function findActiveVenueBySlugAcrossTypes(region, slug) {
  const rows = db
    .prepare('SELECT * FROM venues WHERE region = ? AND slug = ? AND redirect_to IS NULL')
    .all(region, slug);
  return rows.length === 1 ? rowToVenue(rows[0]) : null;
}

// Region-change lookup (2026-09-24): the same type+slug, ignoring region.
// Used ONLY to 301 an old URL after a venue's `region` is corrected (e.g.
// Blind Tiger Vineyards, filed under Vernon but in Lake Country), and only
// when EXACTLY ONE active venue matches -- the same no-guessing rule as the
// category-change lookup above.
function findActiveVenueBySlugAcrossRegions(type, slug) {
  const rows = db
    .prepare('SELECT * FROM venues WHERE type = ? AND slug = ? AND redirect_to IS NULL')
    .all(type, slug);
  return rows.length === 1 ? rowToVenue(rows[0]) : null;
}

// ---------- Phase 1 (Events architecture gate) — minimal data access ----------
// Deliberately narrow: exactly what Phase 1's route/render/sitemap code
// below needs. No create/update/delete endpoints are added in this phase —
// out of scope per the Phase 1 boundary (Events schema + read/render/sitemap
// only).

function rowToEvent(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    region: row.region,
    description: row.description,
    start_datetime: row.start_datetime,
    end_datetime: row.end_datetime,
    recurrence_rule: row.recurrence_rule,
    venue_id: row.venue_id,
    website: row.website,
    image_url: row.image_url,
    type: row.type,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function findEventBySlug(region, slug) {
  const row = db.prepare('SELECT * FROM events WHERE region = ? AND slug = ?').get(region, slug);
  return row ? rowToEvent(row) : null;
}

// ---------- What's On, Step 2 (2026-09-22): Okanagan local-date helpers ----------
//
// Source of truth for every event date on this site is America/Vancouver
// CIVIL time (the frozen What's On design, §4). The production process runs
// with TZ=UTC, so nothing below may lean on the process timezone, `Date`'s
// local getters, or SQLite's `datetime('now')`: "today" is obtained by
// formatting the instant in the IANA zone with Intl, and every window is
// then plain calendar arithmetic on 'YYYY-MM-DD' strings (Date.UTC is used
// purely as a day counter, never as a clock). Dates compare lexically, so
// DST transitions can never move an event across a day boundary.
//
// Deliberately minimal: no date library, no RRULE, no occurrence expansion
// -- exactly the helpers the expiry fix (below) and later steps need.
const OKANAGAN_TIME_ZONE = 'America/Vancouver';
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CUSTOM_WINDOW_DAYS = 366; // frozen design: Choose Dates spans at most a year

// 'en-CA' yields ISO order (YYYY-MM-DD) for numeric parts, so no manual
// reassembly of formatToParts() output is needed.
const okanaganDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OKANAGAN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

// The Okanagan calendar date ('YYYY-MM-DD') of an instant. `now` is
// injectable for tests; production callers pass nothing.
function todayLocal(now = new Date()) {
  return okanaganDateFormatter.format(now);
}

// Strict 'YYYY-MM-DD' validation: shape AND a real calendar day (rejects
// 2027-02-29, month 13, day 32 ...). Returns null rather than throwing so
// query-string callers can fall back cleanly.
function parseLocalDate(value) {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return value;
}

function localDateToDayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function dayNumberToLocalDate(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

// Calendar arithmetic on local dates (timezone-free by construction).
function addLocalDays(dateStr, days) {
  return dayNumberToLocalDate(localDateToDayNumber(dateStr) + days);
}

function localDaysBetween(fromStr, toStr) {
  return localDateToDayNumber(toStr) - localDateToDayNumber(fromStr);
}

// 0 = Sunday ... 6 = Saturday, for the local calendar date itself.
function localWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// The frozen window definitions (design D3 / §4), all inclusive
// [from, to] local-date ranges keyed by the WHATSON_DATE_PRESETS keys:
//   today         -> [today, today]
//   this-weekend  -> Friday-Sunday: the coming Fri-Sun when today is Mon-Thu,
//                    today-through-Sunday when today is already Fri-Sun
//   this-week     -> Monday-Sunday containing today
//   this-month    -> first-last day of today's local calendar month
// Returns null for an unknown preset (callers decide the fallback).
function dateWindowForPreset(preset, today = todayLocal()) {
  const wd = localWeekday(today); // 0 Sun .. 6 Sat
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'this-weekend') {
    const daysToFriday = wd >= 5 || wd === 0 ? 0 : 5 - wd;
    const from = daysToFriday === 0 ? today : addLocalDays(today, daysToFriday);
    const to = addLocalDays(today, wd === 0 ? 0 : 7 - wd); // this Sunday
    return { from, to };
  }
  if (preset === 'this-week') {
    const from = addLocalDays(today, wd === 0 ? -6 : 1 - wd); // Monday
    return { from, to: addLocalDays(from, 6) };
  }
  if (preset === 'this-month') {
    const [y, m] = today.split('-').map(Number);
    const first = `${today.slice(0, 7)}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month
    return { from: first, to: last };
  }
  return null;
}

// Choose Dates: both bounds must be real local dates, from <= to, and the
// span at most MAX_CUSTOM_WINDOW_DAYS. Anything else -> null (the caller
// falls back to its default window); nothing is silently "corrected".
function customDateWindow(from, to) {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (!f || !t) return null;
  if (localDaysBetween(f, t) < 0) return null;
  if (localDaysBetween(f, t) > MAX_CUSTOM_WINDOW_DAYS) return null;
  return { from: f, to: t };
}

// An occurrence [start_date, end_date] overlaps a window [from, to] iff it
// starts no later than the window ends and ends no earlier than the window
// starts -- the single predicate every date filter uses (also expressed in
// SQL as `start_date <= :to AND end_date >= :from`).
function localRangesOverlap(startDate, endDate, from, to) {
  return startDate <= to && endDate >= from;
}

// The UTC offset America/Vancouver observes at a given local date/time
// ('-07:00' PDT, '-08:00' PST), derived from Intl rather than a hard-coded
// table so the DST rules are the platform's. The local wall-clock time is
// first treated as if it were UTC to find the approximate instant, then
// corrected by the offset Intl reports for that instant (a second pass
// handles the hour around a transition). Used to build the derived
// ISO-8601-with-offset strings (`events.start_datetime`/`end_datetime`)
// that later steps write; never used for filtering.
const okanaganOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OKANAGAN_TIME_ZONE, timeZoneName: 'longOffset',
});
function offsetAtInstant(instantMs) {
  const part = okanaganOffsetFormatter.formatToParts(new Date(instantMs)).find((p) => p.type === 'timeZoneName');
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part ? part.value : '');
  if (!m) return null;
  return { sign: m[1] === '-' ? -1 : 1, hours: Number(m[2]), minutes: Number(m[3] || 0) };
}
function vancouverOffsetFor(dateStr, timeStr = '12:00') {
  if (!parseLocalDate(dateStr)) return null;
  const time = LOCAL_TIME_PATTERN.test(timeStr) ? timeStr : '12:00';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let off = offsetAtInstant(naive);
  if (!off) return null;
  const toMs = (o) => o.sign * (o.hours * 60 + o.minutes) * 60000;
  const refined = offsetAtInstant(naive - toMs(off));
  if (refined) off = refined;
  const abs = Math.abs(off.sign * (off.hours * 60 + off.minutes));
  return `${off.sign < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// 'YYYY-MM-DDTHH:MM:00-07:00' for a local date + time; a date alone (all-day
// or time unknown) stays a bare 'YYYY-MM-DD', which schema.org accepts for
// startDate/endDate. Either form starts with the local calendar date, which
// is exactly what the expiry check and the idx_events_end_local index read.
function toVancouverIso(dateStr, timeStr = null) {
  if (!parseLocalDate(dateStr)) return null;
  if (timeStr == null || timeStr === '') return dateStr;
  if (!LOCAL_TIME_PATTERN.test(timeStr)) return null;
  const offset = vancouverOffsetFor(dateStr, timeStr);
  return offset ? `${dateStr}T${timeStr}:00${offset}` : null;
}

// The local calendar date an event's stored span ends on: the first ten
// characters of end_datetime (or start_datetime when there is no end).
// Works for both the derived ISO-with-offset strings later steps write and
// the legacy 'YYYY-MM-DD HH:MM:SS' fixture format, since both lead with the
// date. Returns null for anything that is not a real date.
function eventLocalEndDate(event) {
  const reference = event && (event.end_datetime || event.start_datetime);
  return typeof reference === 'string' ? parseLocalDate(reference.slice(0, 10)) : null;
}

// An event is "expired" once the Okanagan calendar day its span ends on has
// passed -- i.e. it stays live through 23:59 America/Vancouver on its last
// day regardless of the process clock. (Previously this appended 'Z' and
// compared UTC instants, which marked a 7 pm Okanagan event expired at 4 pm
// on its own day between March and November, and would not even parse the
// offset-bearing strings the frozen design stores.) Malformed dates are
// still treated as NOT expired: don't guess, don't silently hide.
function isEventExpired(event, now = new Date()) {
  const endDate = eventLocalEndDate(event);
  if (!endDate) return false;
  return endDate < todayLocal(now);
}

// Same predicate in SQL, for the routes that select active events directly.
// COALESCE keeps the "no end -> use start" rule identical to isEventExpired.
const ACTIVE_EVENT_DATE_SQL = "substr(COALESCE(end_datetime, start_datetime), 1, 10) >= ?";

// Only non-expired events belong in the sitemap — the same reasoning the
// existing sitemap already applies to retired venues via `redirect_to IS
// NULL`: a sitemap should not advertise pages with no ongoing value. The
// "not expired" test now runs in SQL against the Okanagan local date
// instead of scanning the table and comparing UTC instants in JS.
// Step 5: a sitemap entry needs a publishable event (status = scheduled)
// with at least one scheduled occurrence whose span has not ended on the
// Okanagan calendar; cancelled/postponed rows and rows without a scheduled
// occurrence never appear. (region, slug) uniqueness means no duplicates;
// ORDER BY keeps the file deterministic. lastmod stays events.updated_at
// (bumped by every occurrence write), as the sitemap already does.
function listEventsForSitemap(now = new Date()) {
  return db
    .prepare(`SELECT * FROM events
      WHERE status = 'scheduled'
        AND EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = events.id AND o.status = 'scheduled')
        AND ${ACTIVE_EVENT_DATE_SQL}
      ORDER BY region, slug`)
    .all(todayLocal(now))
    .map(rowToEvent);
}

// ---------- What's On, Step 3 (2026-09-22): event data layer + guarded writers ----------
//
// Internal only: no route, page or API calls anything in this section yet
// (Step 4 adds the bearer-guarded API, Step 5 the detail page/sitemap,
// Step 6 the What's On hook-up). Everything here follows the frozen design
// (scratchpad/whatson-research/WHATSON_TECHNICAL_DESIGN.md) and the
// existing venue-write conventions: explicit allow-lists, typed validation
// that FAILS rather than repairs, `{ ok:false, reason }` results the future
// routes map to 400/404/409, BEGIN/COMMIT/ROLLBACK around every write, and
// one event_enrichment_log row per changed thing inside that transaction.
//
// Vocabularies are closed and application-enforced (same discipline as
// venues.type / collections.kind). 'date_tbc' is reserved by the frozen
// design and deliberately NOT accepted in v1: every published (scheduled)
// event must carry at least one scheduled occurrence, and no date is ever
// manufactured to satisfy that.
const EVENT_STATUSES = ['scheduled', 'postponed', 'cancelled'];
const EVENT_OCCURRENCE_STATUSES = ['scheduled', 'cancelled', 'postponed'];
const EVENT_CONFIDENCES = ['high', 'medium']; // 'low' never enters the events table
const EVENT_SOURCE_TYPES = ['official_organizer', 'official_venue', 'league_feed', 'municipal', 'tourism_org', 'secondary'];
const EVENT_OFFICIAL_SOURCE_TYPES = ['official_organizer', 'official_venue', 'league_feed', 'municipal'];
const EVENT_MAX_CATEGORIES = 3;
// Scalar event fields a writer may set. slug/region are create-only (a
// region move is a new row + editorial decision, never an UPDATE); the
// derived start_datetime/end_datetime are never accepted from callers.
const EVENT_CREATE_FIELDS = [
  'name', 'slug', 'region', 'description', 'website', 'image_url', 'type', 'status', 'event_confidence',
  'source_type', 'source_name', 'source_url', 'source_checked_at', 'venue_id', 'venue_name_text', 'valley_wide',
  'recurrence_rule', 'categories', 'occurrences',
];
const EVENT_UPDATE_FIELDS = [
  'name', 'description', 'website', 'image_url', 'type', 'status', 'event_confidence',
  'source_type', 'source_name', 'source_url', 'source_checked_at', 'venue_id', 'venue_name_text', 'valley_wide',
  'recurrence_rule',
];
const EVENT_OCCURRENCE_FIELDS = ['start_date', 'end_date', 'start_time', 'end_time', 'ends_next_day', 'all_day', 'status', 'label', 'source_ref'];
const EVENT_TYPES = ['sporting', 'festival', 'concert']; // existing EVENT_SCHEMA_TYPE_MAP keys
const EVENT_STOPWORDS = new Set(['live', 'with', 'the', 'and', 'music', 'night', 'show', 'tour', 'kelowna', 'vernon', 'west', 'centre', 'theatre', 'winery', 'estate', 'wines', 'okanagan', 'park', 'club', 'series', 'featuring', 'presents', 'from', 'this', 'that', 'for']);

function eventFail(reason, detail) {
  return { ok: false, reason, detail: detail === undefined ? null : detail };
}
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isNullish(v) { return v === undefined || v === null; }
function optionalString(v) { return isNullish(v) ? null : (typeof v === 'string' ? v.trim() : undefined); }

// --- validation -----------------------------------------------------------
// Each validator returns null when fine, or an eventFail() result. They
// never coerce or repair: a bad value is reported back exactly as received.

function validateEventCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return eventFail('categories_required', 'categories must be a non-empty array of category keys');
  if (categories.length > EVENT_MAX_CATEGORIES) return eventFail('too_many_categories', `at most ${EVENT_MAX_CATEGORIES} categories per event`);
  const seen = new Set();
  for (const key of categories) {
    if (typeof key !== 'string' || !WHATSON_CATEGORY_BY_KEY[key]) return eventFail('unknown_category', key);
    if (seen.has(key)) return eventFail('duplicate_category', key);
    seen.add(key);
  }
  return null;
}

function validateEventOccurrence(occ, index = 0) {
  if (!isPlainObject(occ)) return eventFail('occurrence_invalid', `occurrence[${index}] must be an object`);
  const unexpected = Object.keys(occ).filter((k) => !EVENT_OCCURRENCE_FIELDS.includes(k));
  if (unexpected.length) return eventFail('occurrence_unexpected_field', `occurrence[${index}]: ${unexpected.join(', ')}`);
  const startDate = parseLocalDate(occ.start_date);
  if (!startDate) return eventFail('occurrence_start_date_invalid', `occurrence[${index}].start_date must be a real YYYY-MM-DD local date`);
  const endDate = isNullish(occ.end_date) ? startDate : parseLocalDate(occ.end_date);
  if (!endDate) return eventFail('occurrence_end_date_invalid', `occurrence[${index}].end_date must be a real YYYY-MM-DD local date`);
  if (endDate < startDate) return eventFail('occurrence_end_before_start', `occurrence[${index}] ends before it starts`);
  const allDay = isNullish(occ.all_day) ? 0 : occ.all_day;
  const endsNextDay = isNullish(occ.ends_next_day) ? 0 : occ.ends_next_day;
  if (allDay !== 0 && allDay !== 1) return eventFail('occurrence_all_day_invalid', `occurrence[${index}].all_day must be 0 or 1`);
  if (endsNextDay !== 0 && endsNextDay !== 1) return eventFail('occurrence_ends_next_day_invalid', `occurrence[${index}].ends_next_day must be 0 or 1`);
  const startTime = isNullish(occ.start_time) ? null : occ.start_time;
  const endTime = isNullish(occ.end_time) ? null : occ.end_time;
  if (startTime !== null && !(typeof startTime === 'string' && LOCAL_TIME_PATTERN.test(startTime))) return eventFail('occurrence_start_time_invalid', `occurrence[${index}].start_time must be HH:MM (24h) or null`);
  if (endTime !== null && !(typeof endTime === 'string' && LOCAL_TIME_PATTERN.test(endTime))) return eventFail('occurrence_end_time_invalid', `occurrence[${index}].end_time must be HH:MM (24h) or null`);
  if (allDay === 1 && (startTime !== null || endTime !== null)) return eventFail('occurrence_all_day_with_times', `occurrence[${index}] is all-day but carries times`);
  if (endTime !== null && startTime === null) return eventFail('occurrence_end_time_without_start', `occurrence[${index}] has an end_time but no start_time`);
  if (startTime !== null && endTime !== null && startDate === endDate && endTime < startTime && endsNextDay !== 1) {
    return eventFail('occurrence_end_time_before_start', `occurrence[${index}] end_time precedes start_time; set ends_next_day = 1 if it crosses midnight`);
  }
  if (endsNextDay === 1 && startDate !== endDate) return eventFail('occurrence_ends_next_day_on_multi_day', `occurrence[${index}]: ends_next_day applies to a single-day occurrence only`);
  const status = isNullish(occ.status) ? 'scheduled' : occ.status;
  if (!EVENT_OCCURRENCE_STATUSES.includes(status)) return eventFail('occurrence_status_invalid', `occurrence[${index}].status ${JSON.stringify(status)}`);
  for (const f of ['label', 'source_ref']) {
    if (!isNullish(occ[f]) && typeof occ[f] !== 'string') return eventFail('occurrence_field_invalid', `occurrence[${index}].${f} must be a string`);
  }
  return null;
}

function normalizeEventOccurrence(occ) {
  const startDate = occ.start_date;
  return {
    start_date: startDate,
    end_date: isNullish(occ.end_date) ? startDate : occ.end_date,
    start_time: isNullish(occ.start_time) ? null : occ.start_time,
    end_time: isNullish(occ.end_time) ? null : occ.end_time,
    ends_next_day: isNullish(occ.ends_next_day) ? 0 : occ.ends_next_day,
    all_day: isNullish(occ.all_day) ? 0 : occ.all_day,
    status: isNullish(occ.status) ? 'scheduled' : occ.status,
    label: isNullish(occ.label) ? null : occ.label.trim() || null,
    source_ref: isNullish(occ.source_ref) ? null : occ.source_ref.trim() || null,
  };
}

// Validates a list of occurrences as a set: each one individually, no two
// with the same (start_date, start_time) key, no two with the same
// non-null source_ref, and -- when the parent is scheduled -- at least one
// scheduled occurrence (the publication invariant).
function validateEventOccurrenceSet(occurrences, eventStatus) {
  if (!Array.isArray(occurrences)) return eventFail('occurrences_required', 'occurrences must be an array');
  const keys = new Set();
  const refs = new Set();
  let scheduled = 0;
  for (let i = 0; i < occurrences.length; i++) {
    const err = validateEventOccurrence(occurrences[i], i);
    if (err) return err;
    const n = normalizeEventOccurrence(occurrences[i]);
    const key = `${n.start_date}|${n.start_time || ''}`;
    if (keys.has(key)) return eventFail('duplicate_occurrence', `occurrence[${i}] repeats ${n.start_date} ${n.start_time || '(no time)'}`);
    keys.add(key);
    if (n.source_ref) {
      if (refs.has(n.source_ref)) return eventFail('duplicate_occurrence_source_ref', n.source_ref);
      refs.add(n.source_ref);
    }
    if (n.status === 'scheduled') scheduled++;
  }
  if (eventStatus === 'scheduled' && scheduled === 0) return eventFail('no_scheduled_occurrence', 'a scheduled event needs at least one scheduled occurrence; dates are never manufactured');
  return null;
}

// Venue rule (frozen §8): venue_id must be a real, non-redirected venues
// row in the event's region (or the event is valley-wide); otherwise the
// event names its place in venue_name_text. Both set -> ambiguous; neither
// set on a non-valley-wide event -> incomplete. Nothing is substituted.
function validateEventVenue(data) {
  const hasId = !isNullish(data.venue_id);
  const hasText = !isNullish(data.venue_name_text) && String(data.venue_name_text).trim() !== '';
  const valleyWide = data.valley_wide === 1;
  if (hasId && hasText) return eventFail('venue_ambiguous', 'set venue_id OR venue_name_text, not both');
  if (!hasId && !hasText && !valleyWide) return eventFail('venue_required', 'a non-valley-wide event needs venue_id or venue_name_text');
  if (hasId) {
    if (!Number.isInteger(data.venue_id) || data.venue_id <= 0) return eventFail('venue_id_invalid', 'venue_id must be a positive integer');
    const venue = db.prepare('SELECT id, region, redirect_to FROM venues WHERE id = ?').get(data.venue_id);
    if (!venue) return eventFail('venue_not_found', data.venue_id);
    if (venue.redirect_to !== null) return eventFail('venue_redirected', `venue ${data.venue_id} redirects to ${venue.redirect_to}; use the canonical venue explicitly`);
    if (!valleyWide && venue.region !== data.region) return eventFail('venue_region_mismatch', `venue ${data.venue_id} is in ${venue.region}, event is in ${data.region}`);
  }
  return null;
}

// Scalar-field validation shared by create and update. `partial` = update
// (only the supplied keys are checked); create requires the full set.
function validateEventScalars(data, { partial = false } = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
  const need = (k) => !partial || has(k);
  if (need('name') && (typeof data.name !== 'string' || data.name.trim() === '')) return eventFail('name_required');
  if (!partial && !REGION_LABELS[data.region]) return eventFail('region_invalid', `region must be one of the known region slugs (got ${JSON.stringify(data.region)})`);
  if (partial && has('region')) return eventFail('region_immutable', 'region cannot be changed after creation');
  if (partial && has('slug')) return eventFail('slug_immutable', 'slug cannot be changed after creation');
  if (!partial && !isNullish(data.slug) && (typeof data.slug !== 'string' || !EXPLICIT_SLUG_PATTERN.test(data.slug))) return eventFail('slug_invalid', 'slug must be lowercase alphanumeric segments separated by single hyphens');
  if (has('status') && !EVENT_STATUSES.includes(data.status)) return eventFail('status_invalid', `status must be one of ${EVENT_STATUSES.join('|')} ('date_tbc' is not supported in v1)`);
  if (has('event_confidence') && !EVENT_CONFIDENCES.includes(data.event_confidence)) return eventFail('event_confidence_invalid', `event_confidence must be one of ${EVENT_CONFIDENCES.join('|')}`);
  if (need('source_type') && !EVENT_SOURCE_TYPES.includes(data.source_type)) return eventFail('source_type_invalid', `source_type must be one of ${EVENT_SOURCE_TYPES.join('|')}`);
  for (const f of ['source_name', 'source_url']) {
    if (need(f) && (typeof data[f] !== 'string' || data[f].trim() === '')) return eventFail(`${f}_required`, `${f} is required (provenance is mandatory)`);
  }
  if (has('source_url') && !/^https?:\/\/\S+$/i.test(data.source_url.trim())) return eventFail('source_url_invalid', 'source_url must be an http(s) URL');
  if (has('website') && !isNullish(data.website) && !(typeof data.website === 'string' && /^https?:\/\/\S+$/i.test(data.website.trim()))) return eventFail('website_invalid', 'website must be an http(s) URL or null');
  if (has('source_checked_at') && !isNullish(data.source_checked_at) && !parseLocalDate(data.source_checked_at)) return eventFail('source_checked_at_invalid', 'source_checked_at must be YYYY-MM-DD');
  if (has('valley_wide') && data.valley_wide !== 0 && data.valley_wide !== 1) return eventFail('valley_wide_invalid', 'valley_wide must be 0 or 1');
  if (has('type') && !isNullish(data.type) && !EVENT_TYPES.includes(data.type)) return eventFail('type_invalid', `type must be null or one of ${EVENT_TYPES.join('|')}`);
  for (const f of ['description', 'image_url', 'recurrence_rule', 'venue_name_text']) {
    if (has(f) && !isNullish(data[f]) && typeof data[f] !== 'string') return eventFail(`${f}_invalid`, `${f} must be a string or null`);
  }
  if (has('venue_id') && !isNullish(data.venue_id) && !(Number.isInteger(data.venue_id) && data.venue_id > 0)) return eventFail('venue_id_invalid', 'venue_id must be a positive integer or null');
  return null;
}

function validateEventMeta(meta) {
  if (!isPlainObject(meta)) return eventFail('meta_required', 'writer meta { reason, batch_id } is required');
  if (typeof meta.reason !== 'string' || meta.reason.trim() === '') return eventFail('reason_required');
  if (typeof meta.batch_id !== 'string' || meta.batch_id.trim() === '') return eventFail('batch_id_required');
  return null;
}

// --- duplicate protection (frozen §12, deterministic, never merging) -------
function eventSignificantWords(name) {
  return new Set(slugify(name).split('-').filter((w) => w.length > 3 && !EVENT_STOPWORDS.has(w)));
}
// Candidate duplicates for a proposed event, each tagged with the rule that
// fired. `exact` hits are hard rejections; `fuzzy` hits are review items
// the caller must explicitly acknowledge (meta.reviewed_duplicates) --
// they are never merged and never silently dropped.
function findDuplicateEventCandidates(data, { excludeEventId = null } = {}) {
  const hits = [];
  const baseSlug = slugify(data.name || '');
  const rows = db.prepare('SELECT id, name, slug, region, venue_id, venue_name_text, source_url FROM events WHERE region = ?').all(data.region);
  const occDates = (Array.isArray(data.occurrences) ? data.occurrences : [])
    .map((o) => (isPlainObject(o) ? parseLocalDate(o.start_date) : null)).filter(Boolean);
  const words = eventSignificantWords(data.name || '');
  for (const row of rows) {
    if (excludeEventId !== null && row.id === excludeEventId) continue;
    const rowDates = db.prepare('SELECT start_date FROM event_occurrences WHERE event_id = ?').all(row.id).map((r) => r.start_date);
    const nearDate = occDates.some((d) => rowDates.some((rd) => Math.abs(localDaysBetween(d, rd)) <= 1));
    // Same identity = same base slug in the same region on (or next to) the
    // same date, or an explicitly requested slug that is already taken. The
    // same name on a clearly different date is NOT a duplicate (a repeat
    // show, a later edition) -- createEvent gives it the dated-suffix slug.
    if ((typeof data.slug === 'string' && row.slug === data.slug) || (row.slug === baseSlug && (nearDate || !occDates.length))) {
      hits.push({ event_id: row.id, rule: 'exact_slug', name: row.name });
      continue;
    }
    if (!nearDate) continue;
    if (typeof data.source_url === 'string' && row.source_url && row.source_url === data.source_url.trim()
        && occDates.some((d) => rowDates.includes(d))) {
      hits.push({ event_id: row.id, rule: 'same_source_and_date', name: row.name });
      continue;
    }
    const shared = [...eventSignificantWords(row.name)].filter((w) => words.has(w)).length;
    const sameVenue = (!isNullish(data.venue_id) && data.venue_id === row.venue_id)
      || (typeof data.venue_name_text === 'string' && row.venue_name_text && slugify(data.venue_name_text) === slugify(row.venue_name_text));
    if (shared >= 2 || (shared >= 1 && sameVenue)) hits.push({ event_id: row.id, rule: 'fuzzy_same_day', name: row.name });
  }
  return hits;
}

// --- audit log --------------------------------------------------------------
// One row per changed thing, inside the caller's transaction. Mirrors the
// venue_enrichment_log convention: source = who/what asserted the value,
// source_ref = the human reason, confidence = the event's confidence.
function logEventChange(eventId, occurrenceId, fieldName, oldValue, newValue, meta) {
  db.prepare(
    `INSERT INTO event_enrichment_log
       (event_id, occurrence_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    eventId, occurrenceId, fieldName,
    isNullish(oldValue) ? null : String(oldValue),
    isNullish(newValue) ? null : String(newValue),
    meta.source || 'events_writer', meta.reason.trim(), meta.confidence || 'medium', meta.batch_id.trim(), meta.reviewed_by || null
  );
}

// --- derived span -----------------------------------------------------------
// events.start_datetime / end_datetime = the ISO-with-offset span of the
// event's non-cancelled occurrences (all of them if every one is cancelled),
// recomputed inside every write transaction. Their first ten characters
// are the local first/last dates the expiry check and sitemap read.
function recomputeEventSpan(eventId) {
  let rows = db.prepare("SELECT * FROM event_occurrences WHERE event_id = ? AND status <> 'cancelled'").all(eventId);
  if (!rows.length) rows = db.prepare('SELECT * FROM event_occurrences WHERE event_id = ?').all(eventId);
  if (!rows.length) return null;
  let first = null;
  let last = null;
  for (const o of rows) {
    const s = o.all_day === 1 || !o.start_time ? o.start_date : toVancouverIso(o.start_date, o.start_time);
    const endDate = o.ends_next_day === 1 ? addLocalDays(o.end_date, 1) : o.end_date;
    const e = o.all_day === 1 || !o.end_time ? endDate : toVancouverIso(endDate, o.end_time);
    if (first === null || s < first) first = s;
    if (last === null || e > last) last = e;
  }
  db.prepare('UPDATE events SET start_datetime = ?, end_datetime = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(first, last, eventId);
  return { start_datetime: first, end_datetime: last };
}

// --- reads ------------------------------------------------------------------
function rowToEventOccurrence(row) {
  return {
    id: row.id, event_id: row.event_id, start_date: row.start_date, end_date: row.end_date,
    start_time: row.start_time, end_time: row.end_time, ends_next_day: row.ends_next_day, all_day: row.all_day,
    status: row.status, label: row.label, source_ref: row.source_ref, created_at: row.created_at, updated_at: row.updated_at,
  };
}
function rowToEventFull(row) {
  return {
    ...rowToEvent(row),
    status: row.status, event_confidence: row.event_confidence, source_type: row.source_type, source_name: row.source_name,
    source_url: row.source_url, source_checked_at: row.source_checked_at, venue_name_text: row.venue_name_text,
    valley_wide: row.valley_wide,
  };
}
function getEventById(id) {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return row ? rowToEventFull(row) : null;
}
function getEventCategoryKeys(eventId) {
  return db.prepare('SELECT category_key FROM event_categories WHERE event_id = ? ORDER BY position').all(eventId).map((r) => r.category_key);
}
function listEventOccurrences(eventId, { includeCancelled = true } = {}) {
  const sql = includeCancelled
    ? 'SELECT * FROM event_occurrences WHERE event_id = ? ORDER BY start_date, COALESCE(start_time, \'\'), id'
    : "SELECT * FROM event_occurrences WHERE event_id = ? AND status = 'scheduled' ORDER BY start_date, COALESCE(start_time, ''), id";
  return db.prepare(sql).all(eventId).map(rowToEventOccurrence);
}
function countScheduledOccurrences(eventId) {
  return db.prepare("SELECT COUNT(*) AS n FROM event_occurrences WHERE event_id = ? AND status = 'scheduled'").get(eventId).n;
}

// H1 internal linking (2026-09-22): the handful of other events a visitor on
// one event page is most likely to want next. Same publication rules as the
// sitemap (scheduled event, at least one scheduled occurrence, not expired on
// the Okanagan local date), same region, never the event itself, soonest
// first. Variety: at most one event per primary category is taken on the
// first pass, then the remaining slots are filled in date order, so a page in
// a region dominated by one category still shows a mix where the inventory
// allows it. Read-only; the caller renders nothing when fewer than 2 remain.
function listRelatedEventsInRegion(event, { limit = 4, now = new Date() } = {}) {
  const rows = db
    .prepare(`SELECT e.*, (SELECT ec.category_key FROM event_categories ec WHERE ec.event_id = e.id ORDER BY ec.position LIMIT 1) AS primary_category,
        (SELECT MIN(o.start_date) FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ?) AS next_date,
        (SELECT o.end_date FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ? ORDER BY o.start_date, o.end_date LIMIT 1) AS next_end_date
      FROM events e
      WHERE e.region = ?
        AND e.id <> ?
        AND e.status = 'scheduled'
        AND EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled')
        AND ${ACTIVE_EVENT_DATE_SQL.replace(/\bend_datetime\b/, 'e.end_datetime').replace(/\bstart_datetime\b/, 'e.start_datetime')}
      ORDER BY COALESCE(next_date, substr(e.start_datetime, 1, 10)), e.name`)
    .all(todayLocal(now), todayLocal(now), event.region, event.id, todayLocal(now));
  const picked = [];
  const seenCategory = new Set();
  for (const r of rows) {
    if (picked.length >= limit) break;
    if (r.primary_category && seenCategory.has(r.primary_category)) continue;
    if (r.primary_category) seenCategory.add(r.primary_category);
    picked.push(r);
  }
  for (const r of rows) {
    if (picked.length >= limit) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.map((r) => ({
    ...rowToEvent(r),
    primaryCategory: r.primary_category || null,
    nextDate: r.next_date || null,
    nextEndDate: r.next_end_date || null,
  }));
}

// The date shown on an internal-linking card (H1 Steps 1-3 all use this one
// function). The three list helpers above pick the next scheduled occurrence
// that has not finished -- which, for a multi-day occurrence already under
// way, is one that STARTED in the past. Printing its start date told a visitor
// on 2026-09-22 that "Skillful" was on "Sat Jun 13", a date that has gone.
// When the chosen occurrence is mid-span we therefore print what is still
// true and still useful -- the day it ends -- and otherwise print the start
// date exactly as before. Selection, ordering and the publication predicate
// are untouched; this only changes wording.
function upcomingEventDateLabel(nextDate, nextEndDate, now = new Date()) {
  if (!nextDate) return '';
  const today = todayLocal(now);
  if (nextEndDate && nextDate < today && nextEndDate >= today) {
    return `Until ${formatLocalDateShort(nextEndDate)}`;
  }
  return formatLocalDateShort(nextDate);
}

// H1 internal linking, Step 2 (2026-09-22): the next few publishable events a
// visitor on a region hub page could go to. Same predicate as
// listRelatedEventsInRegion() and the sitemap (scheduled event, at least one
// scheduled occurrence, not expired on the Okanagan local date), ordered by
// next scheduled occurrence. No self-exclusion applies -- the caller is a
// region page, not an event. Returns [] below MIN_REGION_EVENTS so a region
// with a single event (or only a valley-wide one belonging elsewhere) renders
// no block at all, and the block disappears on its own as events expire.
const MIN_REGION_EVENTS = 2;
function listUpcomingEventsForRegion(region, { limit = 3, now = new Date() } = {}) {
  const today = todayLocal(now);
  const rows = db
    .prepare(`SELECT e.*, (SELECT ec.category_key FROM event_categories ec WHERE ec.event_id = e.id ORDER BY ec.position LIMIT 1) AS primary_category,
        (SELECT MIN(o.start_date) FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ?) AS next_date,
        (SELECT o.end_date FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ? ORDER BY o.start_date, o.end_date LIMIT 1) AS next_end_date
      FROM events e
      WHERE e.region = ?
        AND e.status = 'scheduled'
        AND EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled')
        AND ${ACTIVE_EVENT_DATE_SQL.replace(/\bend_datetime\b/, 'e.end_datetime').replace(/\bstart_datetime\b/, 'e.start_datetime')}
      ORDER BY COALESCE(next_date, substr(e.start_datetime, 1, 10)), e.name`)
    .all(today, today, region, today);
  if (rows.length < MIN_REGION_EVENTS) return [];
  return rows.slice(0, limit).map((r) => ({
    ...rowToEvent(r),
    primaryCategory: r.primary_category || null,
    nextDate: r.next_date || null,
    nextEndDate: r.next_end_date || null,
  }));
}

// H1 internal linking, Step 3 (2026-09-22): the next few publishable events
// happening at one venue. Same predicate as listRelatedEventsInRegion(),
// listUpcomingEventsForRegion() and the sitemap (scheduled event, at least one
// scheduled occurrence, not expired on the Okanagan local date), ordered by
// next scheduled occurrence. The relationship is events.venue_id ONLY -- an
// event naming its place in venue_name_text is never matched to a venue row,
// so nothing here depends on name similarity. Returns [] below
// MIN_VENUE_EVENTS so a venue hosting a single event renders no block at all,
// and the block disappears on its own as events expire.
const MIN_VENUE_EVENTS = 2;
function listUpcomingEventsAtVenue(venueId, { limit = 3, now = new Date() } = {}) {
  if (!Number.isInteger(venueId) || venueId <= 0) return [];
  const today = todayLocal(now);
  const rows = db
    .prepare(`SELECT e.*, (SELECT ec.category_key FROM event_categories ec WHERE ec.event_id = e.id ORDER BY ec.position LIMIT 1) AS primary_category,
        (SELECT MIN(o.start_date) FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ?) AS next_date,
        (SELECT o.end_date FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ? ORDER BY o.start_date, o.end_date LIMIT 1) AS next_end_date
      FROM events e
      WHERE e.venue_id = ?
        AND e.status = 'scheduled'
        AND EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled')
        AND ${ACTIVE_EVENT_DATE_SQL.replace(/\bend_datetime\b/, 'e.end_datetime').replace(/\bstart_datetime\b/, 'e.start_datetime')}
      ORDER BY COALESCE(next_date, substr(e.start_datetime, 1, 10)), e.name`)
    .all(today, today, venueId, today);
  if (rows.length < MIN_VENUE_EVENTS) return [];
  return rows.slice(0, limit).map((r) => ({
    ...rowToEvent(r),
    primaryCategory: r.primary_category || null,
    nextDate: r.next_date || null,
    nextEndDate: r.next_end_date || null,
  }));
}

// --- writers ----------------------------------------------------------------
// createEvent(data, meta): the only way an event enters the table. Validates
// everything, checks duplicates, then inserts event + categories +
// occurrences + audit rows in ONE transaction and recomputes the span.
// Returns { ok:true, event, categories, occurrences, review } or eventFail().
function createEvent(data, meta) {
  if (!isPlainObject(data)) return eventFail('body_invalid');
  const metaErr = validateEventMeta(meta);
  if (metaErr) return metaErr;
  const unexpected = Object.keys(data).filter((k) => !EVENT_CREATE_FIELDS.includes(k));
  if (unexpected.length) return eventFail('unexpected_field', unexpected.join(', '));
  const input = {
    ...data,
    status: isNullish(data.status) ? 'scheduled' : data.status,
    event_confidence: isNullish(data.event_confidence) ? 'medium' : data.event_confidence,
    valley_wide: isNullish(data.valley_wide) ? 0 : data.valley_wide,
  };
  const scalarErr = validateEventScalars(input);
  if (scalarErr) return scalarErr;
  const venueErr = validateEventVenue(input);
  if (venueErr) return venueErr;
  const catErr = validateEventCategories(input.categories);
  if (catErr) return catErr;
  const occErr = validateEventOccurrenceSet(input.occurrences, input.status);
  if (occErr) return occErr;

  // Duplicate gate: exact identity is a hard stop; fuzzy hits must have been
  // reviewed (ids listed in meta.reviewed_duplicates) or the write fails.
  const candidates = findDuplicateEventCandidates(input);
  const exact = candidates.filter((c) => c.rule !== 'fuzzy_same_day');
  if (exact.length) return eventFail('duplicate_event', exact);
  const reviewed = new Set(Array.isArray(meta.reviewed_duplicates) ? meta.reviewed_duplicates : []);
  const unreviewed = candidates.filter((c) => !reviewed.has(c.event_id));
  if (unreviewed.length) return eventFail('possible_duplicate', unreviewed);

  // Slug: explicit (must be free) or slugify(name); on a base-slug
  // collision a one-off may take its first start date as suffix (frozen
  // §L); if that is taken too, fail rather than invent anything else.
  const occs = input.occurrences.map(normalizeEventOccurrence);
  const firstDate = occs.map((o) => o.start_date).sort()[0];
  const taken = (slug) => !!db.prepare('SELECT 1 FROM events WHERE region = ? AND slug = ?').get(input.region, slug);
  let slug;
  if (!isNullish(input.slug)) {
    if (taken(input.slug)) return eventFail('slug_collision', `${input.region}/${input.slug}`);
    slug = input.slug;
  } else {
    slug = slugify(input.name);
    if (!slug) return eventFail('slug_invalid', 'name produces an empty slug');
    if (taken(slug)) {
      const dated = `${slug}-${firstDate}`;
      if (taken(dated)) return eventFail('slug_collision', `${input.region}/${slug} and ${dated}`);
      slug = dated;
    }
  }

  const logMeta = { ...meta, source: input.source_name.trim(), confidence: input.event_confidence };
  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    const info = db.prepare(`
      INSERT INTO events (name, slug, region, description, start_datetime, end_datetime, recurrence_rule, venue_id, website, image_url, type,
        status, event_confidence, source_type, source_name, source_url, source_checked_at, venue_name_text, valley_wide)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.name.trim(), slug, input.region, optionalString(input.description), firstDate, firstDate,
      optionalString(input.recurrence_rule), isNullish(input.venue_id) ? null : input.venue_id,
      optionalString(input.website), optionalString(input.image_url), isNullish(input.type) ? null : input.type,
      input.status, input.event_confidence, input.source_type, input.source_name.trim(), input.source_url.trim(),
      isNullish(input.source_checked_at) ? null : input.source_checked_at,
      optionalString(input.venue_name_text) || null, input.valley_wide,
    );
    const eventId = Number(info.lastInsertRowid);
    logEventChange(eventId, null, 'create', null, `${input.region}/${slug}`, logMeta);
    input.categories.forEach((key, position) => {
      db.prepare('INSERT INTO event_categories (event_id, category_key, position) VALUES (?, ?, ?)').run(eventId, key, position);
    });
    logEventChange(eventId, null, 'categories', null, input.categories.join(','), logMeta);
    const insOcc = db.prepare(`INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time, ends_next_day, all_day, status, label, source_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const o of occs) {
      const occId = Number(insOcc.run(eventId, o.start_date, o.end_date, o.start_time, o.end_time, o.ends_next_day, o.all_day, o.status, o.label, o.source_ref).lastInsertRowid);
      logEventChange(eventId, occId, 'occurrence', null, `${o.start_date}${o.start_time ? ' ' + o.start_time : ''} ${o.status}`, logMeta);
    }
    recomputeEventSpan(eventId);
    db.exec('COMMIT');
    txOpen = false;
    return {
      ok: true, event: getEventById(eventId), categories: getEventCategoryKeys(eventId), occurrences: listEventOccurrences(eventId),
      review: candidates.filter((c) => c.rule === 'fuzzy_same_day'),
    };
  } catch (err) {
    if (txOpen) db.exec('ROLLBACK');
    throw err;
  }
}

// updateEvent(id, data, meta): scalar fields only (allow-listed), each
// changed field logged with old/new. Moving to 'scheduled' requires a
// scheduled occurrence; the venue rule is re-checked with the merged row.
function updateEvent(id, data, meta) {
  if (!isPlainObject(data)) return eventFail('body_invalid');
  const metaErr = validateEventMeta(meta);
  if (metaErr) return metaErr;
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) return eventFail('event_not_found', id);
  const unexpected = Object.keys(data).filter((k) => !EVENT_UPDATE_FIELDS.includes(k));
  if (unexpected.length) return eventFail(['region', 'slug'].some((k) => unexpected.includes(k)) ? `${unexpected.find((k) => k === 'region' || k === 'slug')}_immutable` : 'unexpected_field', unexpected.join(', '));
  const scalarErr = validateEventScalars(data, { partial: true });
  if (scalarErr) return scalarErr;
  const merged = { ...existing, ...data };
  if (Object.prototype.hasOwnProperty.call(data, 'venue_id') || Object.prototype.hasOwnProperty.call(data, 'venue_name_text') || Object.prototype.hasOwnProperty.call(data, 'valley_wide')) {
    const venueErr = validateEventVenue(merged);
    if (venueErr) return venueErr;
  }
  if (data.status === 'scheduled' && existing.status !== 'scheduled' && countScheduledOccurrences(id) === 0) {
    return eventFail('no_scheduled_occurrence', 'cannot publish an event with no scheduled occurrence');
  }
  const changed = EVENT_UPDATE_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(data, f) && (isNullish(data[f]) ? null : data[f]) !== existing[f]);
  if (!changed.length) return { ok: true, event: getEventById(id), changed: [] };
  const logMeta = { ...meta, source: meta.source || existing.source_name, confidence: merged.event_confidence };
  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    const setClause = changed.map((f) => `${f} = ?`).join(', ');
    db.prepare(`UPDATE events SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...changed.map((f) => (isNullish(data[f]) ? null : data[f])), id);
    for (const f of changed) logEventChange(id, null, f, existing[f], data[f], logMeta);
    db.exec('COMMIT');
    txOpen = false;
  } catch (err) {
    if (txOpen) db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, event: getEventById(id), changed };
}

// replaceEventCategories(id, keys, meta): the full ordered list (1-3).
function replaceEventCategories(id, keys, meta) {
  const metaErr = validateEventMeta(meta);
  if (metaErr) return metaErr;
  const existing = db.prepare('SELECT id, source_name, event_confidence FROM events WHERE id = ?').get(id);
  if (!existing) return eventFail('event_not_found', id);
  const catErr = validateEventCategories(keys);
  if (catErr) return catErr;
  const before = getEventCategoryKeys(id);
  if (before.join(',') === keys.join(',')) return { ok: true, categories: before, changed: false };
  const logMeta = { ...meta, source: meta.source || existing.source_name, confidence: existing.event_confidence };
  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    db.prepare('DELETE FROM event_categories WHERE event_id = ?').run(id);
    keys.forEach((key, position) => db.prepare('INSERT INTO event_categories (event_id, category_key, position) VALUES (?, ?, ?)').run(id, key, position));
    db.prepare('UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    logEventChange(id, null, 'categories', before.join(','), keys.join(','), logMeta);
    db.exec('COMMIT');
    txOpen = false;
  } catch (err) {
    if (txOpen) db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, categories: getEventCategoryKeys(id), changed: true };
}

// upsertEventOccurrences(id, occurrences, meta): appends occurrences to a
// series (e.g. the next six months of a weekly event, the rest of a
// season). Idempotent on (start_date, start_time): an occurrence that
// already exists with that key is left untouched and reported as skipped
// -- it is never overwritten, so a re-run of the same feed changes nothing.
function upsertEventOccurrences(id, occurrences, meta) {
  const metaErr = validateEventMeta(meta);
  if (metaErr) return metaErr;
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) return eventFail('event_not_found', id);
  const setErr = validateEventOccurrenceSet(occurrences, null);
  if (setErr) return setErr;
  const occs = occurrences.map(normalizeEventOccurrence);
  const current = listEventOccurrences(id);
  const currentKeys = new Set(current.map((o) => `${o.start_date}|${o.start_time || ''}`));
  const currentRefs = new Set(current.map((o) => o.source_ref).filter(Boolean));
  const toInsert = [];
  const skipped = [];
  for (const o of occs) {
    const key = `${o.start_date}|${o.start_time || ''}`;
    if (currentKeys.has(key)) { skipped.push(o); continue; }
    if (o.source_ref && currentRefs.has(o.source_ref)) return eventFail('duplicate_occurrence_source_ref', o.source_ref);
    toInsert.push(o);
  }
  if (!toInsert.length) return { ok: true, inserted: [], skipped: skipped.length, occurrences: current };
  const logMeta = { ...meta, source: meta.source || existing.source_name, confidence: existing.event_confidence };
  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    const insOcc = db.prepare(`INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, end_time, ends_next_day, all_day, status, label, source_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const inserted = [];
    for (const o of toInsert) {
      const occId = Number(insOcc.run(id, o.start_date, o.end_date, o.start_time, o.end_time, o.ends_next_day, o.all_day, o.status, o.label, o.source_ref).lastInsertRowid);
      logEventChange(id, occId, 'occurrence', null, `${o.start_date}${o.start_time ? ' ' + o.start_time : ''} ${o.status}`, logMeta);
      inserted.push(occId);
    }
    recomputeEventSpan(id);
    db.exec('COMMIT');
    txOpen = false;
    return { ok: true, inserted, skipped: skipped.length, occurrences: listEventOccurrences(id) };
  } catch (err) {
    if (txOpen) db.exec('ROLLBACK');
    throw err;
  }
}

// setEventOccurrenceStatus(eventId, occId, status, meta): cancel /
// postpone / restore one date. Cancelling or postponing the LAST scheduled
// occurrence of a scheduled event is refused ('last_occurrence') unless the
// caller also passes meta.event_status ('cancelled' | 'postponed'), in
// which case the parent changes status in the same transaction -- the
// publication invariant can never be broken by a single date change.
function setEventOccurrenceStatus(eventId, occId, status, meta) {
  const metaErr = validateEventMeta(meta);
  if (metaErr) return metaErr;
  if (!EVENT_OCCURRENCE_STATUSES.includes(status)) return eventFail('occurrence_status_invalid', status);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return eventFail('event_not_found', eventId);
  const occ = db.prepare('SELECT * FROM event_occurrences WHERE id = ? AND event_id = ?').get(occId, eventId);
  if (!occ) return eventFail('occurrence_not_found', occId);
  if (occ.status === status) return { ok: true, changed: false, occurrence: rowToEventOccurrence(occ), event: getEventById(eventId) };
  const eventStatus = isNullish(meta.event_status) ? null : meta.event_status;
  if (eventStatus !== null && !['cancelled', 'postponed'].includes(eventStatus)) return eventFail('event_status_invalid', 'meta.event_status may only be cancelled or postponed');
  const remaining = countScheduledOccurrences(eventId) - (occ.status === 'scheduled' ? 1 : 0) + (status === 'scheduled' ? 1 : 0);
  if (event.status === 'scheduled' && remaining === 0 && eventStatus === null) {
    return eventFail('last_occurrence', 'this is the last scheduled occurrence; pass meta.event_status = cancelled|postponed to change the event with it');
  }
  const logMeta = { ...meta, source: meta.source || event.source_name, confidence: event.event_confidence };
  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    db.prepare('UPDATE event_occurrences SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, occId);
    logEventChange(eventId, occId, 'occurrence_status', occ.status, status, logMeta);
    if (eventStatus !== null && eventStatus !== event.status) {
      db.prepare('UPDATE events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(eventStatus, eventId);
      logEventChange(eventId, null, 'status', event.status, eventStatus, logMeta);
    }
    recomputeEventSpan(eventId);
    db.exec('COMMIT');
    txOpen = false;
  } catch (err) {
    if (txOpen) db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, changed: true, occurrence: rowToEventOccurrence(db.prepare('SELECT * FROM event_occurrences WHERE id = ?').get(occId)), event: getEventById(eventId) };
}

// --- What's On window query -------------------------------------------------
// resolveWhatsOnWindow({ when, from, to }, now): the frozen date-filter
// state -> an inclusive local window. Presets come from WHATSON_DATE_PRESETS
// keys; `custom` (or bare from/to) uses customDateWindow's validation; an
// invalid or absent selection falls back to the rolling default window
// (today -> today + WHATSON_DEFAULT_WINDOW_DAYS) and reports `fallback`.
const WHATSON_DEFAULT_WINDOW_DAYS = 30;
function resolveWhatsOnWindow(params = {}, now = new Date()) {
  const today = todayLocal(now);
  const when = typeof params.when === 'string' ? params.when : null;
  if (when && when !== 'custom') {
    const w = dateWindowForPreset(when, today);
    if (w) return { ...w, preset: when, fallback: false };
    return { from: today, to: addLocalDays(today, WHATSON_DEFAULT_WINDOW_DAYS), preset: 'upcoming', fallback: true };
  }
  if (when === 'custom' || params.from !== undefined || params.to !== undefined) {
    const w = customDateWindow(params.from, params.to);
    if (w) return { ...w, preset: 'custom', fallback: false };
    return { from: today, to: addLocalDays(today, WHATSON_DEFAULT_WINDOW_DAYS), preset: 'upcoming', fallback: true };
  }
  return { from: today, to: addLocalDays(today, WHATSON_DEFAULT_WINDOW_DAYS), preset: 'upcoming', fallback: false };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function formatLocalDateShort(dateStr, { weekday = true } = {}) {
  const [, m, d] = dateStr.split('-').map(Number);
  const md = `${MONTH_SHORT[m - 1]} ${d}`;
  return weekday ? `${WEEKDAY_SHORT[localWeekday(dateStr)]} ${md}` : md;
}
function formatLocalTime(timeStr) {
  if (!timeStr) return '';
  const [h, mi] = timeStr.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
}
// The card's date wording, from the occurrences of ONE event that fall in
// the window (ordered): a single day, a multi-day span, or a series count.
function whatsOnDateLabel(event, occsInWindow) {
  if (!occsInWindow.length) return '';
  const first = occsInWindow[0];
  if (occsInWindow.length === 1) {
    if (first.start_date === first.end_date) return formatLocalDateShort(first.start_date);
    return `${formatLocalDateShort(first.start_date, { weekday: false })} – ${formatLocalDateShort(first.end_date, { weekday: false })}`;
  }
  const rule = event.recurrence_rule ? event.recurrence_rule.trim() : '';
  const next = formatLocalDateShort(first.start_date);
  return rule ? `${rule} · next ${next}` : `${next} + ${occsInWindow.length - 1} more date${occsInWindow.length - 1 === 1 ? '' : 's'}`;
}
function whatsOnTimeLabel(occsInWindow) {
  const times = [...new Set(occsInWindow.filter((o) => o.all_day !== 1).map((o) => o.start_time || ''))];
  if (!times.length || (times.length === 1 && times[0] === '')) return '';
  if (times.length > 1) return 'Times vary';
  return formatLocalTime(times[0]);
}

// queryWhatsOnEvents({ from, to, regions, categories }): the series-level
// result set for the What's On page. One row per event; only scheduled
// events with at least one scheduled occurrence overlapping [from, to]
// (occurrence.end_date >= from AND occurrence.start_date <= to). Regions
// OR, categories OR, AND between; a valley_wide event matches any region.
// Filtering is entirely in SQL over event_occurrences (no UTC arithmetic,
// no client-side date parsing); ordering is by the first occurrence inside
// the window. No row cap: the window bounds the result.
function queryWhatsOnEvents({ from, to, regions = [], categories = [] } = {}) {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (!f || !t || t < f) return [];
  const regionList = (Array.isArray(regions) ? regions : []).filter((r) => REGION_LABELS[r]);
  const categoryList = (Array.isArray(categories) ? categories : []).filter((c) => WHATSON_CATEGORY_BY_KEY[c]);
  const params = [f, t];
  let regionSql = '';
  if (regionList.length) {
    regionSql = ` AND (e.valley_wide = 1 OR e.region IN (${regionList.map(() => '?').join(',')}))`;
    params.push(...regionList);
  }
  let categorySql = '';
  if (categoryList.length) {
    categorySql = ` AND EXISTS (SELECT 1 FROM event_categories c WHERE c.event_id = e.id AND c.category_key IN (${categoryList.map(() => '?').join(',')}))`;
    params.push(...categoryList);
  }
  const rows = db.prepare(`
    SELECT e.*, MIN(o.start_date) AS next_start, MIN(o.start_date || 'T' || COALESCE(o.start_time, '')) AS next_key
    FROM events e
    JOIN event_occurrences o ON o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ? AND o.start_date <= ?
    WHERE e.status = 'scheduled'${regionSql}${categorySql}
    GROUP BY e.id
    ORDER BY next_key, e.name, e.id
  `).all(...params);
  const occStmt = db.prepare("SELECT * FROM event_occurrences WHERE event_id = ? AND status = 'scheduled' AND end_date >= ? AND start_date <= ? ORDER BY start_date, COALESCE(start_time, ''), id");
  return rows.map((row) => {
    const event = rowToEventFull(row);
    const occs = occStmt.all(row.id, f, t).map(rowToEventOccurrence);
    const venue = event.venue_id ? getVenue(event.venue_id) : null;
    return {
      id: event.id,
      name: event.name,
      slug: event.slug,
      region: event.region,
      valleyWide: event.valley_wide === 1,
      categories: getEventCategoryKeys(event.id),
      description: event.description || '',
      image: event.image_url || null,
      startDate: occs[0].start_date,
      endDate: occs[0].end_date,
      dateLabel: whatsOnDateLabel(event, occs),
      time: whatsOnTimeLabel(occs),
      occurrenceCount: occs.length,
      venueName: venue ? venue.name : (event.venue_name_text || null),
      venueId: venue ? venue.id : null,
      sourceType: event.source_type,
      sourceName: event.source_name,
      attribution: EVENT_OFFICIAL_SOURCE_TYPES.includes(event.source_type) ? null : event.source_name,
      status: event.status,
    };
  });
}
// Chip/tile counts for a result set (valley-wide rows count once per
// region chip), mirroring what the shell computes client-side.
function whatsOnCountsFor(rows) {
  const regions = Object.fromEntries(Object.keys(REGION_LABELS).map((r) => [r, 0]));
  const categories = Object.fromEntries(WHATSON_CATEGORIES.map((c) => [c.key, 0]));
  for (const row of rows) {
    if (row.valleyWide) for (const r of Object.keys(regions)) regions[r]++;
    else if (regions[row.region] !== undefined) regions[row.region]++;
    for (const k of row.categories) if (categories[k] !== undefined) categories[k]++;
  }
  return { regions, categories };
}

// --- Step 4 (2026-09-22): HTTP plumbing for the data layer -------------------
// Writer result reasons -> HTTP status (everything else is a 400).
const EVENT_WRITE_STATUS_MAP = {
  event_not_found: 404, occurrence_not_found: 404, venue_not_found: 404,
  duplicate_event: 409, possible_duplicate: 409, slug_collision: 409, last_occurrence: 409,
  venue_redirected: 409, venue_region_mismatch: 409, duplicate_occurrence: 409, duplicate_occurrence_source_ref: 409,
};
const EVENT_META_KEYS = ['reason', 'batch_id', 'reviewed_by', 'reviewed_duplicates', 'event_status'];

// The public card contract (frozen §15 / the shell's getWhatsOnEvents
// comment): exactly what a listing card needs, nothing about sources,
// confidence, status or internal ids beyond the event's own id.
function whatsOnPublicEvent(row) {
  return {
    id: row.id, name: row.name, slug: row.slug, region: row.region, valleyWide: row.valleyWide,
    categories: row.categories, description: row.description, image: row.image,
    startDate: row.startDate, endDate: row.endDate, dateLabel: row.dateLabel, time: row.time,
    occurrenceCount: row.occurrenceCount, venueName: row.venueName, attribution: row.attribution,
  };
}
function whatsOnPublicOccurrence(o) {
  return { id: o.id, startDate: o.start_date, endDate: o.end_date, startTime: o.start_time, endTime: o.end_time, endsNextDay: o.ends_next_day, allDay: o.all_day, label: o.label };
}
// Public single-event shape: the card fields for the event's *next* window
// (from today, no upper bound needed -- the rolling default) plus its
// scheduled occurrences. Not the detail page (Step 5); just the data.
function whatsOnPublicEventDetail(event) {
  const occs = listEventOccurrences(event.id, { includeCancelled: false });
  const venue = event.venue_id ? getVenue(event.venue_id) : null;
  return {
    id: event.id, name: event.name, slug: event.slug, region: event.region, valleyWide: event.valley_wide === 1,
    categories: getEventCategoryKeys(event.id), description: event.description || '', image: event.image_url || null,
    website: event.website || null, recurrence: event.recurrence_rule || null, status: event.status,
    venueName: venue ? venue.name : (event.venue_name_text || null),
    attribution: EVENT_OFFICIAL_SOURCE_TYPES.includes(event.source_type) ? null : event.source_name,
    dateLabel: whatsOnDateLabel(event, occs), time: whatsOnTimeLabel(occs),
    occurrences: occs.map(whatsOnPublicOccurrence),
  };
}
// GET /api/events?when=&from=&to=&regions=&categories= -> the frozen
// window semantics in one place; the What's On page (Step 6) will call
// the same functions server-side rather than fetching its own API.
function parseWhatsOnReadQuery(query) {
  const { regions, categories } = parseWhatsOnFilterQuery(query);
  const str = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined);
  return { regions, categories, when: str(query && query.when), from: str(query && query.from), to: str(query && query.to) };
}
function listWhatsOnEventsPublic(query, now = new Date()) {
  const { regions, categories, when, from, to } = parseWhatsOnReadQuery(query);
  const window = resolveWhatsOnWindow({ when, from, to }, now);
  const rows = queryWhatsOnEvents({ from: window.from, to: window.to, regions, categories });
  return { window, regions, categories, count: rows.length, events: rows.map(whatsOnPublicEvent) };
}

// ---------- Phase 2 Sprint 3 (Hidden Gems) — minimal data access ----------
// Deliberately narrow: exactly the two reads this sprint's badge-only scope
// needs. No create/update/delete endpoints are added — out of scope, same
// boundary already applied to Events in Phase 1.

// One query, called ONCE per category/guide page render (never per card) —
// returns every currently-active hidden-gem venue id as a Set, so
// membership checks while building N cards are simple O(1) lookups rather
// than N separate queries. Redirected venues are excluded here directly
// (not left to callers to remember), so this Set can never contain a
// retired venue's id even if collection membership was never explicitly
// cleaned up for it.
function getHiddenGemVenueIds() {
  const rows = db.prepare(`
    SELECT DISTINCT ci.content_id AS id
    FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    JOIN venues v ON v.id = ci.content_id
    WHERE c.kind = 'hidden_gem' AND ci.content_type = 'venue' AND v.redirect_to IS NULL
  `).all();
  return new Set(rows.map((r) => r.id));
}

// A single targeted lookup for the one-venue-at-a-time venue detail page —
// explicitly acceptable per Sprint 3 scope, unlike the N+1 pattern the
// bulk function above avoids for list pages. Still excludes redirected
// venues directly, so a retired venue's page can never show the badge
// regardless of any stale collection_items row.
function isVenueHiddenGem(venueId) {
  const row = db.prepare(`
    SELECT 1
    FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    JOIN venues v ON v.id = ci.content_id
    WHERE c.kind = 'hidden_gem' AND ci.content_type = 'venue' AND ci.content_id = ? AND v.redirect_to IS NULL
    LIMIT 1
  `).get(venueId);
  return !!row;
}

// Build My Trip, Stage 3: a generic collection-membership lookup, used by
// the trip engine's "discovery" preference (e.g. hidden_gem). Deliberately
// separate from getHiddenGemVenueIds() above (used by venue-page/homepage
// badge rendering) -- same underlying tables, but this one is parameterized
// by any real collections.kind value instead of being hardcoded to
// 'hidden_gem', so it stays correct if a second discovery collection kind
// is ever added. Kept as its own function rather than generalizing
// getHiddenGemVenueIds() itself, to avoid any risk of an unrelated
// behavior change to existing badge rendering.
function getCollectionVenueIds(kind) {
  const rows = db.prepare(`
    SELECT DISTINCT ci.content_id AS id
    FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    JOIN venues v ON v.id = ci.content_id
    WHERE c.kind = ? AND ci.content_type = 'venue' AND v.redirect_to IS NULL
  `).all(kind);
  return new Set(rows.map((r) => r.id));
}

// The live set of collection kinds that actually exist right now (today,
// just 'hidden_gem') -- queried fresh, not hardcoded, so trip-request
// validation for the `discovery` field always reflects real data instead
// of a list that could silently drift out of sync with collections.kind.
function getKnownDiscoveryKinds() {
  return db.prepare('SELECT DISTINCT kind FROM collections').all()
    .map((r) => r.kind)
    // Operational (non-editorial) kinds are never a trip "discovery"
    // preference: the 'advisory' collection flags a temporary condition
    // (a swimming advisory, a partial closure), which is the opposite of
    // something a planner should steer a trip towards.
    .filter((kind) => !NON_DISCOVERY_COLLECTION_KINDS.has(kind));
}

// ---------- Shared discovery-intent taxonomy (Phase 1, 2026-09-25) ----------
//
// The ONLY bridge between discovery-intent.js (a pure interpreter with no
// database access) and this app's real data. Every value handed to the
// interpreter is read from the existing constants or the live database --
// region slugs/labels, venue types, the badge features, the live editorial
// collection kinds, the outdoor activities, the cuisines actually in use,
// the budgets/paces the planner accepts, the What's On presets/categories,
// and the active venues' id/name/region/type/slug for exact-name matching.
// Read-only; not wired to any route yet (Hero Search / Build My Trip come in
// later phases), so no page or API response changes.
function buildDiscoveryTaxonomy() {
  const liveKinds = db.prepare('SELECT DISTINCT kind FROM collections').all().map((r) => r.kind);
  const cuisines = db.prepare(`
    SELECT DISTINCT lower(trim(cuisine)) AS c FROM venues
    WHERE redirect_to IS NULL AND cuisine IS NOT NULL AND trim(cuisine) != ''
  `).all().map((r) => r.c);
  const venues = db.prepare('SELECT id, name, region, type, slug FROM venues WHERE redirect_to IS NULL AND slug IS NOT NULL')
    .all()
    .filter((v) => REGION_LABELS[v.region] && CATEGORY_SLUGS[v.type]);
  return {
    regions: VALID_REGIONS.slice(),
    regionLabels: { ...REGION_LABELS },
    types: Object.keys(CATEGORY_SLUGS),
    features: BOOL_FIELDS.slice(),
    collections: liveKinds,
    activities: OUTDOOR_ACTIVITIES.map((a) => a.slug),
    cuisines,
    budgets: TRIP_VALID_BUDGETS.slice(),
    paces: TRIP_VALID_PACES.slice(),
    datePresets: WHATSON_DATE_PRESETS.map((p) => p.key).filter((k) => k !== 'custom'),
    eventCategories: WHATSON_CATEGORIES.map((c) => c.key),
    venues,
  };
}

// ---------- Discovery search (Phase 2, 2026-09-25) ----------
//
// Natural-language search on top of the Phase 1 interpreter:
//
//   text -> interpretDiscoveryQuery() -> DiscoveryIntent
//        -> resolveDiscoveryDestination(): the EXISTING page that shows exactly
//           that request (/{region}/{category}, /food-drink?..., /outdoors?...,
//           /dog-friendly?..., /secret-spots, /guide/..., /whats-on?...,
//           a venue page, or /browse pre-filtered with its own chips)
//        -> selectDiscoveryVenues()/selectDiscoveryEvents(): the real records,
//           ranked deterministically, for GET /api/discover
//
// Nothing here writes, calls an AI, or builds a second venue/event store:
// candidates are read from the venues/collections/events tables through the
// same helpers the pages use, and every URL is built from the record's own
// region/type/slug. Everything is behind DISCOVERY_SEARCH (off by default):
// with the flag off, /api/discover does not exist and /browse is unchanged.
// Loaded lazily, on first use: with the flag off the module is never loaded,
// and a copy of server.js running without it (the isolated child-process
// tests copy only server.js/db.js) starts exactly as before.
function discoveryIntentModule() {
  return require('./discovery-intent');
}

function isDiscoverySearchEnabled() {
  return /^(1|on|true|yes)$/i.test(String(process.env.DISCOVERY_SEARCH || '').trim());
}

// What /browse's own controls can express: its six type chips and its twelve
// feature "stamp" chips (okanagan.html; data-filter names differ from the
// column names). Anything else must go to a page that can show it.
const BROWSE_TYPE_CHIPS = ['winery', 'brewery', 'restaurant', 'cocktail', 'cafe', 'pub'];
const BROWSE_FEATURE_CHIP = {
  dog_friendly: 'dog', gluten_free: 'gluten', great_groups: 'groups', happy_hour: 'happy_hour',
  kid_friendly: 'kids', live_music: 'music', nonalcoholic: 'nonalc', patio: 'patio',
  sports_tv: 'sports', vegan: 'vegan', vegetarian: 'vegetarian', lake_view: 'view',
};
const DISCOVERY_HUB_PAGES = { winery: '/wineries', golf: '/golf', beach: '/beaches', outdoor: '/outdoors' };
const DISCOVERY_DEFAULT_LIMIT = 24;
const DISCOVERY_MAX_LIMIT = 60;

function interpretDiscoveryText(text) {
  return discoveryIntentModule().interpretDiscoveryQuery(text, buildDiscoveryTaxonomy());
}

// "a=x,y&b=z" with each value URL-encoded but the list commas kept literal,
// matching how every directory page writes its own filter URLs.
function discoveryQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    const list = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
    if (list.length) parts.push(`${key}=${list.map((v) => encodeURIComponent(String(v))).join(',')}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function discoveryVenueUrl(venue) {
  return venue && REGION_LABELS[venue.region] && CATEGORY_SLUGS[venue.type] && venue.slug
    ? `/${venue.region}/${CATEGORY_SLUGS[venue.type]}/${venue.slug}`
    : null;
}
function discoveryEventUrl(event) {
  return event && REGION_LABELS[event.region] && event.slug ? `/${event.region}/events/${event.slug}` : null;
}

// The What's On window for an intent's `when`: presets pass straight
// through; "tomorrow" and a weekday become a one-day custom window computed
// in the site's local civil time (the same helpers What's On uses).
function discoveryWhatsOnWindowParams(when, now = new Date()) {
  if (!when) return {};
  if (when.preset) return { when: when.preset };
  const today = todayLocal(now);
  if (when.relative === 'tomorrow') { const d = addLocalDays(today, 1); return { when: 'custom', from: d, to: d }; }
  if (when.weekday) {
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(when.weekday);
    if (target === -1) return {};
    const d = addLocalDays(today, (target - localWeekday(today) + 7) % 7);
    return { when: 'custom', from: d, to: d };
  }
  return {};
}

// Hero Search routing. Returns { url, kind } for a request an existing page
// can show exactly, or { url: null, reason } -- in which case the caller keeps
// today's behaviour. Deliberately conservative: anything the destination page
// could not honestly reflect (an ambiguity, a conflict, an unsupported phrase,
// a heuristic occasion, a budget, a date on a venue search, a trip plan)
// returns no destination rather than silently dropping part of the request.
function resolveDiscoveryDestination(intent) {
  const none = (reason) => ({ url: null, kind: null, reason });
  if (!intent) return none('no_intent');
  if (intent.mode === 'navigate' && intent.exactVenue) {
    const url = discoveryVenueUrl(intent.exactVenue);
    return url ? { url, kind: 'venue', reason: 'exact_venue' } : none('venue_without_url');
  }
  if (intent.confidence === 'low') return none('low_confidence');
  if (intent.ambiguities.length) return none('ambiguous');
  if (intent.conflicts.length) return none('conflicting');
  if (intent.unsupported.length) return none('unsupported');
  if (intent.needs.length) return none('incomplete');
  if (intent.mode === 'plan') return none('trip_request');

  const R = intent.regions, F = intent.features, C = intent.collections, A = intent.activities;
  const T = intent.types;
  const Q = [...intent.cuisines, ...intent.textTerms];

  if (intent.mode === 'events') {
    if (Q.length) return none('event_text_search');
    const w = discoveryWhatsOnWindowParams(intent.when);
    return { url: `/whats-on${discoveryQueryString({ ...w, regions: R, categories: intent.eventCategories })}`, kind: 'events', reason: 'events' };
  }
  if (intent.occasion) return none('heuristic_occasion');
  if (intent.budget) return none('budget_not_filterable');
  if (intent.when) return none('date_on_venue_search');
  if (Q.length > 1) return none('multiple_text_terms');

  // Never route to a page that would 404: each destination is only offered
  // when the page it points at currently has something to show.
  const hasRegionCategory = (r, t) => getVenuesByRegionCategory(r, t).length >= MIN_CATEGORY_VENUES || RETAINED_EMPTY_CATEGORY_PAGES.has(`${r}/${t}`);
  const hasRegion = (r) => Object.keys(getRegionCategoryCounts(r)).length > 0;
  const hasHub = (t) => (t === 'outdoor' ? getOutdoorLandingVenues() : getVenuesByCategory(t)).length >= MIN_CATEGORY_VENUES;
  const subset = (list, allowed) => list.every((x) => allowed.includes(x));
  const same = (list, expected) => list.length === expected.length && subset(list, expected);
  const isFD = (t) => !!FD_CATEGORY_KIND_BY_TYPE[t];

  // Curated collections go to their own pages.
  if (C.length) {
    // /secret-spots lists only the Hidden Gems that are places (outdoor and
    // beach). It is offered as "everything that matches" only when that is
    // true: when no Hidden Gem in the requested regions is a cafe, winery,
    // brewery, golf course or other type the page leaves out.
    if (same(C, ['hidden_gem']) && !T.length && !F.length && !A.length && !Q.length && getSecretSpotVenues().length >= MIN_CATEGORY_VENUES
      && countHiddenGemsOutsideSecretSpots(R) === 0) {
      return { url: `/secret-spots${discoveryQueryString({ regions: R })}`, kind: 'secret-spots', reason: 'collection' };
    }
    // Every other Hidden Gems request -- the whole collection, a region whose
    // gems include cafes, wineries or golf, a category ("wine and hidden
    // gems") or one badge ("dog friendly hidden gems") -- goes to the full
    // Hidden Gems page, but only when that page shows exactly the matching
    // venues (see hiddenGemsPageDestination). Otherwise: no destination.
    if (same(C, ['hidden_gem']) && !A.length && !Q.length) {
      if (F.length <= 1 && isHiddenGemsPageEnabled()) return hiddenGemsPageDestination(intent);
      if (!T.length && !F.length) return none('collection_broader_than_page');
    }
    if (same(C, ['local_favorite']) && !F.length && !A.length && !Q.length && getLocalFavouriteVenues().length >= MIN_CATEGORY_VENUES) {
      return { url: `/local-favorites${discoveryQueryString({ types: T, regions: R })}`, kind: 'local-favorites', reason: 'collection' };
    }
    if (same(C, ['dog_friendly']) && same(T, ['beach']) && same(F, ['dog_friendly']) && !A.length && !Q.length) {
      return { url: `/dog-friendly${discoveryQueryString({ types: [DOG_BEACH_TYPE_KEY], regions: R })}`, kind: 'dog-friendly', reason: 'collection' };
    }
    return none('collection_combination');
  }
  // Outdoor activities -> the Outdoors directory.
  if (A.length) {
    if (subset(T, ['outdoor']) && !F.length && !Q.length && hasHub('outdoor')) {
      return { url: `/outdoors${discoveryQueryString({ regions: R, activities: A })}`, kind: 'outdoors', reason: 'activities' };
    }
    return none('activity_combination');
  }
  // Dog-friendly -> Dog Friendly Finds, which has its own type/feature chips.
  if (F.includes('dog_friendly') && !Q.length) {
    const others = F.filter((f) => f !== 'dog_friendly');
    if (subset(others, [...DOG_HUB_FEATURE_KEYS]) && subset(T, [...DOG_HUB_TYPE_KEYS].filter((t) => t !== DOG_BEACH_TYPE_KEY))) {
      return { url: `/dog-friendly${discoveryQueryString({ types: T, features: others, regions: R })}`, kind: 'dog-friendly', reason: 'feature' };
    }
  }
  // One free-text word (e.g. "poutine") -> /browse's existing text search,
  // with whatever /browse can also express applied through its own chips.
  if (Q.length === 1) {
    if (subset(T, BROWSE_TYPE_CHIPS) && subset(F, Object.keys(BROWSE_FEATURE_CHIP))) {
      return { url: `/browse${discoveryQueryString({ types: T, regions: R, features: F, q: Q[0] })}`, kind: 'browse', reason: 'text_search' };
    }
    return none('text_search_combination');
  }
  // Structured requests, most specific existing page first.
  if (R.length === 1 && T.length === 1 && !F.length && hasRegionCategory(R[0], T[0])) {
    return { url: `/${R[0]}/${CATEGORY_SLUGS[T[0]]}`, kind: 'region-category', reason: 'structured' };
  }
  if (R.length === 1 && T.length === 1 && isFD(T[0]) && hasRegionCategory(R[0], T[0])) {
    return { url: `/${R[0]}/${CATEGORY_SLUGS[T[0]]}${discoveryQueryString({ features: F })}`, kind: 'region-category', reason: 'structured' };
  }
  if (R.length === 1 && !T.length && !F.length && hasRegion(R[0])) {
    return { url: `/${R[0]}`, kind: 'region', reason: 'structured' };
  }
  if (R.length === 1 && !T.length && F.length === 1
    && listGuideCombos(MIN_GUIDE_VENUES).some((c) => c.region === R[0] && c.badge === F[0])) {
    return { url: `/guide/${R[0]}/${F[0]}`, kind: 'guide', reason: 'structured' };
  }
  if (T.length && T.every(isFD)) {
    return { url: `/food-drink${discoveryQueryString({ types: T, features: F, regions: R })}`, kind: 'food-drink', reason: 'structured' };
  }
  if (T.length === 1 && !R.length && !F.length && DISCOVERY_HUB_PAGES[T[0]] && hasHub(T[0])) {
    return { url: DISCOVERY_HUB_PAGES[T[0]], kind: 'category', reason: 'structured' };
  }
  if (same(T, ['outdoor']) && !F.length && hasHub('outdoor')) {
    return { url: `/outdoors${discoveryQueryString({ regions: R })}`, kind: 'outdoors', reason: 'structured' };
  }
  if ((T.length || R.length || F.length) && subset(T, BROWSE_TYPE_CHIPS) && subset(F, Object.keys(BROWSE_FEATURE_CHIP))) {
    return { url: `/browse${discoveryQueryString({ types: T, regions: R, features: F })}`, kind: 'browse', reason: 'structured' };
  }
  return none('no_matching_page');
}

// Whole-word match of a term inside already-normalized text.
function discoveryTextHas(normalized, term) {
  return ` ${normalized} `.indexOf(` ${term} `) !== -1;
}

// Real venues for an intent, ranked deterministically. Constraints are hard
// filters (region, type incl. secondary Food & Drink categories, every
// requested feature, collections, activities, cuisine, every text term);
// ranking is transparent: text relevance (name 3, cuisine 2, description 1
// per term), then rating, then review count, then name and id. Heuristics
// (occasion, budget) are NOT applied here -- they are reported back as not
// applied. An intent with nothing to filter on returns no venues rather than
// the whole directory.
function selectDiscoveryVenues(intent, limit = DISCOVERY_DEFAULT_LIMIT) {
  if (!intent) return { total: 0, items: [] };
  if (intent.mode === 'navigate' && intent.exactVenue) {
    const v = db.prepare('SELECT * FROM venues WHERE id = ? AND redirect_to IS NULL').get(intent.exactVenue.id);
    return v ? { total: 1, items: [discoveryVenueItem(v, [])] } : { total: 0, items: [] };
  }
  if (intent.mode === 'events' || intent.mode === 'unknown') return { total: 0, items: [] };
  const R = intent.regions, T = intent.types, F = intent.features, C = intent.collections, A = intent.activities;
  const cuisines = intent.cuisines, terms = intent.textTerms;
  if (!R.length && !T.length && !F.length && !C.length && !A.length && !cuisines.length && !terms.length) return { total: 0, items: [] };

  const rows = db.prepare('SELECT * FROM venues WHERE redirect_to IS NULL').all();
  const secondary = new Map();
  for (const [type, kind] of Object.entries(FD_CATEGORY_KIND_BY_TYPE)) {
    if (!T.includes(type)) continue;
    for (const id of getCollectionVenueIds(kind)) { if (!secondary.has(id)) secondary.set(id, new Set()); secondary.get(id).add(type); }
  }
  const members = new Map();
  const memberSet = (kind) => { if (!members.has(kind)) members.set(kind, getCollectionVenueIds(kind)); return members.get(kind); };
  const activityKind = (slug) => (OUTDOOR_ACTIVITIES.find((a) => a.slug === slug) || {}).kind;

  const scored = [];
  for (const v of rows) {
    if (!REGION_LABELS[v.region] || !CATEGORY_SLUGS[v.type]) continue;
    if (R.length && !R.includes(v.region)) continue;
    if (T.length && !T.includes(v.type) && !(secondary.get(v.id) && T.some((t) => secondary.get(v.id).has(t)))) continue;
    if (!F.every((f) => Number(v[f]) === 1 || (f === 'dog_friendly' && memberSet('dog_friendly').has(v.id)))) continue;
    if (!C.every((c) => memberSet(c).has(v.id))) continue;
    if (A.length && !A.some((a) => activityKind(a) && memberSet(activityKind(a)).has(v.id))) continue;
    const cuisine = String(v.cuisine || '').toLowerCase().trim();
    if (cuisines.length && !cuisines.includes(cuisine)) continue;
    const name = discoveryIntentModule().normalizeDiscoveryText(v.name || '');
    const cui = discoveryIntentModule().normalizeDiscoveryText(v.cuisine || '');
    const desc = discoveryIntentModule().normalizeDiscoveryText(v.description || '');
    let score = cuisines.length ? 2 : 0;
    const matchedOn = [];
    let ok = true;
    for (const term of terms) {
      const inName = discoveryTextHas(name, term), inCui = discoveryTextHas(cui, term), inDesc = discoveryTextHas(desc, term);
      if (!inName && !inCui && !inDesc) { ok = false; break; }
      score += (inName ? 3 : 0) + (inCui ? 2 : 0) + (inDesc ? 1 : 0);
      matchedOn.push(`${term}:${[inName && 'name', inCui && 'cuisine', inDesc && 'description'].filter(Boolean).join('+')}`);
    }
    if (!ok) continue;
    for (const f of F) matchedOn.push(`feature:${f}`);
    for (const c of C) matchedOn.push(`collection:${c}`);
    if (cuisines.length) matchedOn.push(`cuisine:${cuisine}`);
    scored.push({ v, score, matchedOn });
  }
  scored.sort((a, b) => b.score - a.score
    || (Number(b.v.rating) || 0) - (Number(a.v.rating) || 0)
    || (Number(b.v.reviews) || 0) - (Number(a.v.reviews) || 0)
    || String(a.v.name).localeCompare(String(b.v.name))
    || a.v.id - b.v.id);
  return { total: scored.length, items: scored.slice(0, limit).map((s) => discoveryVenueItem(s.v, s.matchedOn)) };
}
// Only fields the database already holds -- nothing computed or invented.
function discoveryVenueItem(v, matchedOn) {
  return {
    id: v.id, name: v.name, region: v.region, type: v.type, url: discoveryVenueUrl(v),
    rating: v.rating == null ? null : v.rating, reviews: v.reviews == null ? null : v.reviews,
    price: v.price == null ? null : v.price, matchedOn,
  };
}

// Real, scheduled events from the What's On data for an events intent.
function selectDiscoveryEvents(intent, limit = DISCOVERY_DEFAULT_LIMIT, now = new Date()) {
  if (!intent || intent.mode !== 'events') return { total: 0, items: [], window: null };
  const win = resolveWhatsOnWindow(discoveryWhatsOnWindowParams(intent.when, now), now);
  let events = filterWhatsOnEvents(getWhatsOnEvents(win), intent.regions, intent.eventCategories);
  if (intent.textTerms.length) {
    events = events.filter((e) => {
      const text = discoveryIntentModule().normalizeDiscoveryText(`${e.name || ''} ${e.description || ''}`);
      return intent.textTerms.every((t) => discoveryTextHas(text, t));
    });
  }
  const items = events.slice(0, limit).map((e) => ({
    id: e.id, name: e.name, region: e.region, url: discoveryEventUrl(e), valleyWide: !!e.valleyWide,
    categories: e.categories || [], dateLabel: e.dateLabel || '', time: e.time || '',
  }));
  return { total: events.length, items, window: { from: win.from, to: win.to, preset: win.preset } };
}

// What the request asked for that search does not apply (reported, never
// silently dropped).
function discoveryNotApplied(intent) {
  const out = [];
  if (!intent) return out;
  if (intent.occasion) out.push({ field: 'occasion', value: intent.occasion, reason: 'heuristic_not_applied_to_search' });
  if (intent.budget) out.push({ field: 'budget', value: intent.budget, reason: 'price_data_incomplete' });
  if (intent.days !== null) out.push({ field: 'days', value: intent.days, reason: 'trip_planning_only' });
  if (intent.pace) out.push({ field: 'pace', value: intent.pace, reason: 'trip_planning_only' });
  if (intent.when && intent.mode !== 'events') out.push({ field: 'when', value: intent.when, reason: 'venue_hours_not_modelled' });
  for (const u of intent.unsupported) out.push({ field: 'unsupported', value: u, reason: 'not_supported' });
  return out;
}

function runDiscovery(text, { limit = DISCOVERY_DEFAULT_LIMIT, now = new Date() } = {}) {
  const intent = interpretDiscoveryText(text);
  const destination = resolveDiscoveryDestination(intent);
  const venues = selectDiscoveryVenues(intent, limit);
  const events = selectDiscoveryEvents(intent, limit, now);
  return {
    query: text,
    intent,
    destination,
    results: intent.mode === 'events'
      ? { kind: 'events', total: events.total, items: events.items, window: events.window }
      : { kind: venues.total ? 'venues' : 'none', total: venues.total, items: venues.items },
    notApplied: discoveryNotApplied(intent),
  };
}

// ---------- Build My Trip planner (Phase 3, 2026-09-25) ----------
//
// natural language -> DiscoveryIntent (discovery-intent.js)
//   -> verified venue facts read here from the database
//   -> trip-planner.js: recommendations / an outing / a day-by-day plan, each
//      stop with a "why this fits" built only from the request + verified data
//   -> POST /api/trip/plan, rendered by the planner view on /trip
//
// Behind TRIP_PLANNER_V2 (off by default): with the flag off /trip,
// /api/trip/parse and /api/trip/generate are exactly as before and
// /api/trip/plan does not exist. No AI, no writes, no new data store.
function isTripPlannerV2Enabled() {
  return /^(1|on|true|yes)$/i.test(String(process.env.TRIP_PLANNER_V2 || '').trim());
}
// Loaded lazily for the same reason as the interpreter (see
// discoveryIntentModule): server.js still starts without the file.
function tripPlannerModule() {
  return require('./trip-planner');
}

// Every active venue as a plain "fact" object carrying ONLY verified data:
// the badge columns that are set, collection and activity memberships, the
// secondary Food & Drink categories, the stored coordinates, rating, review
// count, price level and cuisine, and normalized name/cuisine/description
// text for whole-word matching. The planner can use nothing else.
function buildTripPlannerFacts() {
  const normalize = discoveryIntentModule().normalizeDiscoveryText;
  const memberships = new Map();
  const addMember = (id, key) => { if (!memberships.has(id)) memberships.set(id, { collections: [], activities: [], fdTypes: [] }); memberships.get(id)[key.kind].push(key.value); };
  for (const kind of ['hidden_gem', 'local_favorite', 'dog_friendly']) for (const id of getCollectionVenueIds(kind)) addMember(id, { kind: 'collections', value: kind });
  for (const a of OUTDOOR_ACTIVITIES) for (const id of getCollectionVenueIds(a.kind)) addMember(id, { kind: 'activities', value: a.slug });
  for (const [type, kind] of Object.entries(FD_CATEGORY_KIND_BY_TYPE)) for (const id of getCollectionVenueIds(kind)) addMember(id, { kind: 'fdTypes', value: type });
  const rows = db.prepare('SELECT * FROM venues WHERE redirect_to IS NULL AND slug IS NOT NULL').all();
  const facts = [];
  for (const v of rows) {
    if (!REGION_LABELS[v.region] || !CATEGORY_SLUGS[v.type]) continue;
    const features = {};
    for (const f of BOOL_FIELDS) if (Number(v[f]) === 1) features[f] = true;
    const m = memberships.get(v.id) || { collections: [], activities: [], fdTypes: [] };
    facts.push({
      id: v.id, name: v.name, region: v.region, type: v.type, url: `/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}`,
      rating: v.rating == null ? null : Number(v.rating), reviews: v.reviews == null ? 0 : Number(v.reviews),
      price: v.price == null ? null : Number(v.price), address: v.address || null,
      lat: v.latitude == null ? null : Number(v.latitude), lng: v.longitude == null ? null : Number(v.longitude),
      cuisine: v.cuisine ? String(v.cuisine).toLowerCase().trim() : null, cuisineLabel: v.cuisine || null,
      textName: normalize(v.name || ''), textCuisine: normalize(v.cuisine || ''), textDesc: normalize(v.description || ''),
      features, collections: m.collections, activities: m.activities, fdTypes: m.fdTypes,
      indoorGolf: v.type === 'golf' && isIndoorGolfVenue(v),
      hours: v.hours || null, // the stored JSON; parsed (never modified) by the planner
    });
  }
  return facts;
}

function tripPlannerLabels() {
  return {
    regions: { ...REGION_LABELS },
    types: Object.fromEntries(Object.entries(CATEGORY_LABELS).map(([t, l]) => [t, { singular: l.singular, plural: l.plural }])),
    activities: Object.fromEntries(OUTDOOR_ACTIVITIES.map((a) => [a.slug, a.label])),
    features: Object.fromEntries(Object.entries(BADGE_LABELS).map(([f, l]) => [f, l.title])),
    featureNouns: Object.fromEntries(Object.entries(BADGE_LABELS).map(([f, l]) => [f, l.noun])),
    collections: { hidden_gem: 'Hidden Gems', local_favorite: 'Local Favourites', dog_friendly: 'dog-friendly beaches' },
  };
}

const TRIP_PLAN_MAX_IDS = 200;
const TRIP_PLAN_PIN_RE = /^[1-7]-(morning|midday|afternoon|evening)$/;
// Validates the POST /api/trip/plan body; returns { error } or { value }.
function parseTripPlanBody(body) {
  const allowed = ['text', 'seed', 'excludeVenueIds', 'avoidVenueIds', 'pinned'];
  const unexpected = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (unexpected.length) return { error: `Unexpected field(s): ${unexpected.join(', ')}` };
  const text = body.text;
  if (typeof text !== 'string' || !text.trim()) return { error: 'text is required and must be a non-empty string.' };
  if (text.length > discoveryIntentModule().DISCOVERY_MAX_TEXT_LENGTH) return { error: `text must be at most ${discoveryIntentModule().DISCOVERY_MAX_TEXT_LENGTH} characters.` };
  const seed = body.seed === undefined ? 0 : body.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 1000000) return { error: 'seed must be an integer between 0 and 1000000.' };
  const ids = (name) => {
    const v = body[name];
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > TRIP_PLAN_MAX_IDS || !v.every((x) => Number.isInteger(x) && x > 0)) return null;
    return v;
  };
  const excludeVenueIds = ids('excludeVenueIds');
  if (!excludeVenueIds) return { error: `excludeVenueIds must be an array of at most ${TRIP_PLAN_MAX_IDS} venue ids.` };
  const avoidVenueIds = ids('avoidVenueIds');
  if (!avoidVenueIds) return { error: `avoidVenueIds must be an array of at most ${TRIP_PLAN_MAX_IDS} venue ids.` };
  let pinned = null;
  if (body.pinned !== undefined) {
    const p = body.pinned;
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length > 28
      || !Object.entries(p).every(([k, v]) => TRIP_PLAN_PIN_RE.test(k) && Number.isInteger(v) && v > 0)) {
      return { error: 'pinned must map "<day>-<daypart>" to a venue id.' };
    }
    pinned = p;
  }
  return { value: { text, seed, excludeVenueIds, avoidVenueIds, pinned } };
}

// The weekday of day 1, only when the request names a date ("tonight",
// "tomorrow", "Saturday", "this weekend"); computed in the site's local civil
// time, the same way What's On resolves its windows. Otherwise null.
function tripStartWeekday(when, now = new Date()) {
  if (!when) return null;
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = todayLocal(now);
  if (when.preset === 'today') return names[localWeekday(today)];
  if (when.relative === 'tomorrow') return names[localWeekday(addLocalDays(today, 1))];
  if (when.weekday) return when.weekday.slice(0, 3);
  if (when.preset === 'this-weekend') {
    const wd = localWeekday(today);
    return wd === 0 ? 'sun' : 'sat';
  }
  return null;
}

// The Okanagan wall clock at an instant: { weekday: 'thu', minutes: 1266 }
// (21:06). Always America/Vancouver -- never the server's own timezone --
// and `now` is injectable so tests can freeze it.
const okanaganClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OKANAGAN_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function okanaganClock(now = new Date()) {
  const parts = Object.fromEntries(okanaganClockFormatter.formatToParts(now).map((x) => [x.type, x.value]));
  return { weekday: parts.weekday.slice(0, 3).toLowerCase(), minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

// A venue's listed-hours status at an instant on the Okanagan wall clock
// (okanaganClock above -- the one timezone path), via hours.js. null when
// hours.js is not present. Not called by any page or route yet.
function venueHoursStatusAt(hoursRaw, now = new Date()) {
  return hoursModule ? hoursModule.statusAt(hoursModule.parseHours(hoursRaw), okanaganClock(now)) : null;
}

function runTripPlan({ text, seed = 0, excludeVenueIds = [], avoidVenueIds = [], pinned = null }, now = new Date()) {
  const intent = interpretDiscoveryText(text);
  const events = intent.mode === 'events' ? selectDiscoveryEvents(intent, 12, now) : null;
  const plan = tripPlannerModule().planTrip({
    intent,
    facts: buildTripPlannerFacts(),
    labels: tripPlannerLabels(),
    seed,
    excludeIds: excludeVenueIds,
    avoidIds: avoidVenueIds,
    pinned,
    events: events ? events.items : null,
    startWeekday: tripStartWeekday(intent.when, now),
    clock: okanaganClock(now),
  });
  if (intent.mode === 'navigate' && intent.exactVenue) {
    plan.venue = { id: intent.exactVenue.id, url: discoveryVenueUrl(intent.exactVenue) };
  }
  const destination = resolveDiscoveryDestination(intent);
  plan.seeAll = destination.url ? { url: destination.url } : null;
  if (events && events.window) plan.eventWindow = events.window;
  plan.query = text;
  plan.intent = {
    mode: intent.mode, confidence: intent.confidence, regions: intent.regions, types: intent.types, features: intent.features,
    collections: intent.collections, activities: intent.activities, foodTerms: intent.foodTerms, days: intent.days, pace: intent.pace,
    budget: intent.budget, occasion: intent.occasion, when: intent.when, ambiguities: intent.ambiguities,
  };
  return plan;
}

// ---------- Temporary-condition advisories (2026-09-19) ----------
// A venue's permanent, verified facts live in its description. Temporary
// conditions -- a swimming advisory, a partial wildfire closure, a
// seasonal access restriction -- are deliberately kept OUT of that text
// and are instead expressed as membership in the 'advisory' collection
// (bootstrapped in db.js like Hidden Gems / Local Favourites; no schema
// change), with the official wording and source in collection_items.note.
// Membership is added and removed through the existing audited
// POST /admin/collection-membership route, so a condition can be lifted
// without a deploy, and every change lands in venue_enrichment_log.
// Rendered as a small "Check before you go" note on the venue's card and
// page; nothing renders for a venue that has no advisory, so pages for
// venues without one are byte-identical to before this was added.
const ADVISORY_COLLECTION_KIND = 'advisory';
// Dog Friendly (2026-09-19, Beaches accuracy pass): a venue where dogs are
// OFFICIALLY allowed on the beach / in the water (an off-leash beach, a
// designated dog beach or dog swimming area, or on-leash beach access).
// Membership lives in the 'dog_friendly' collection (bootstrapped in db.js,
// no schema change) and the exact official restriction is carried in
// collection_items.note, e.g. "Designated dog beach only (Sandy Beach)".
// The badge is deliberately NOT the venues.dog_friendly amenity boolean:
// that boolean feeds the region/badge guide-page counts that the frozen
// homepage embeds, so flipping it would change '/'. Rendered with the
// existing .chip style used by every other badge -- no new visual design.
const DOG_FRIENDLY_COLLECTION_KIND = 'dog_friendly';
// Outdoor activity tags (2026-09-20): eight collection kinds bootstrapped
// in db.js (activity_hiking ... activity_adventure) that classify an
// outdoor destination by what a visitor can do there. Like the two
// operational kinds above they are NOT trip "discovery" preferences, so
// the Build My Trip parser/API vocabulary is unchanged by their existence.
const ACTIVITY_COLLECTION_KINDS = ['activity_hiking', 'activity_cycling', 'activity_viewpoints', 'activity_nature', 'activity_winter', 'activity_camping', 'activity_water', 'activity_adventure', 'activity_fishing'];
// ---------- Food & Drink secondary categories (2026-09-24) ----------
//
// `venues.type` remains the single canonical/primary category: it builds
// the venue's URL through CATEGORY_SLUGS, its breadcrumbs, its schema.org
// type and its sitemap entry. These collections carry ONLY the ADDITIONAL
// Food & Drink categories a venue also genuinely belongs to, so a venue's
// effective set is `type` plus its memberships here.
//
// Bootstrapped in db.js beside the activity collections (no new table, no
// migration) and written through the same audited
// POST /admin/collection-membership route. Wine is deliberately not a
// Food & Drink category -- it has its own section and /wineries hub.
const FD_CATEGORY_KIND_BY_TYPE = {
  restaurant: 'fd_restaurants',
  cafe: 'fd_cafes',
  pub: 'fd_pubs',
  cocktail: 'fd_cocktails',
  brewery: 'fd_breweries',
  distillery: 'fd_distilleries',
};
const FD_CATEGORY_TYPE_BY_KIND = Object.fromEntries(
  Object.entries(FD_CATEGORY_KIND_BY_TYPE).map(([type, kind]) => [kind, type])
);
const FOOD_DRINK_TYPES = Object.keys(FD_CATEGORY_KIND_BY_TYPE);
const FD_CATEGORY_COLLECTION_KINDS = Object.values(FD_CATEGORY_KIND_BY_TYPE);

// These are taxonomy, not editorial discovery: without this the five kinds
// would surface as Build My Trip `discovery` options the moment the first
// membership row exists, because that list is queried live from
// collections.kind rather than hardcoded.
const NON_DISCOVERY_COLLECTION_KINDS = new Set([ADVISORY_COLLECTION_KIND, DOG_FRIENDLY_COLLECTION_KIND, ...ACTIVITY_COLLECTION_KINDS, ...FD_CATEGORY_COLLECTION_KINDS]);

// venue id -> Set of SECONDARY Food & Drink category types, for a given set
// of venue ids, in ONE query (never per-venue: listVenues serves up to 2000
// rows and an N+1 here would be 2000 extra statements per request).
// Callers merge this with each venue's own `type` to get its effective set.
function getFoodDrinkCategoriesForVenueIds(ids) {
  const byId = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return byId;
  const placeholders = ids.map(() => '?').join(', ');
  const kindPlaceholders = FD_CATEGORY_COLLECTION_KINDS.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ci.content_id AS id, c.kind AS kind
    FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    WHERE ci.content_type = 'venue'
      AND c.kind IN (${kindPlaceholders})
      AND ci.content_id IN (${placeholders})
  `).all(...FD_CATEGORY_COLLECTION_KINDS, ...ids);
  for (const row of rows) {
    const type = FD_CATEGORY_TYPE_BY_KIND[row.kind];
    if (!type) continue;
    if (!byId.has(row.id)) byId.set(row.id, new Set());
    byId.get(row.id).add(type);
  }
  return byId;
}

// A venue's effective Food & Drink categories: its own `type` first (the
// primary), then any secondary memberships, de-duplicated and in a stable
// order. Returns [] for a venue that is neither a Food & Drink type nor a
// member of any of these collections, so nothing is added to the payload of
// Golf / Beach / Outdoor / Winery venues.
function effectiveFoodDrinkCategories(venue, secondary) {
  const out = [];
  if (FD_CATEGORY_KIND_BY_TYPE[venue.type]) out.push(venue.type);
  for (const t of FOOD_DRINK_TYPES) {
    if (t !== venue.type && secondary && secondary.has(t)) out.push(t);
  }
  return out;
}

// Attach `fd_categories` to a list of already-serialized venues using a
// single bulk lookup. Venues with no Food & Drink identity are left exactly
// as they were -- no new field -- so other sections' payloads are unchanged.
function attachFoodDrinkCategories(venues) {
  if (!Array.isArray(venues) || venues.length === 0) return venues;
  const secondaryById = getFoodDrinkCategoriesForVenueIds(venues.map((v) => v.id));
  for (const v of venues) {
    const cats = effectiveFoodDrinkCategories(v, secondaryById.get(v.id));
    if (cats.length) v.fd_categories = cats;
  }
  return venues;
}

// Outdoor activity discovery (2026-09-20, Outdoors Phase 2). One outdoor
// destination keeps ONE canonical venue record and page; what a visitor
// can do there is expressed as membership in one or more of the activity
// collections above (many-to-many), never as a second venue record or a
// second venue type. This list is the single source of truth for the
// visitor-facing label, URL slug and one-line blurb of each activity; the
// collection rows in db.js carry the kind. Order here is the display
// order of the activity selector.
const OUTDOOR_ACTIVITIES = [
  { slug: 'hiking', kind: 'activity_hiking', label: 'Hiking & Trails', blurb: 'Creek-side greenways, canyon stairs, waterfall walks and summit climbs \u2014 from a flat hour to a full day on your feet.' },
  { slug: 'cycling', kind: 'activity_cycling', label: 'Cycling & Biking', blurb: 'Rail trails, paved lakeside pathways and mountain-bike terrain, on the valley floor and up at the resorts.' },
  { slug: 'winter', kind: 'activity_winter', label: 'Winter', blurb: 'Ski resorts, Nordic centres and snowshoe trails, plus the parks that stay open for winter walks.' },
  { slug: 'camping', kind: 'activity_camping', label: 'Camping', blurb: 'Provincial and regional parks where an outdoor day can turn into a night under the stars.' },
  { slug: 'nature', kind: 'activity_nature', label: 'Nature & Wildlife', blurb: 'Nature conservancies, creek corridors, desert habitat and the places to watch kokanee, birds and bighorn sheep.' },
  { slug: 'water', kind: 'activity_water', label: 'Water Activities', blurb: 'Outdoor destinations with paddling, boating or lake access built in.' },
  { slug: 'viewpoints', kind: 'activity_viewpoints', label: 'Viewpoints', blurb: 'Lookouts, ridgelines and summits with the lake and valley spread out below.' },
  { slug: 'adventure', kind: 'activity_adventure', label: 'Adventure', blurb: 'Rock climbing, bike parks, tubing and skating loops \u2014 the bigger, louder days out.' },
  { slug: 'fishing', kind: 'activity_fishing', label: 'Fishing', blurb: 'Trout-fishing lodges, public fishing docks and guided charters on the valley\u2019s lakes \u2014 licence required.' },
];
const OUTDOOR_ACTIVITY_BY_SLUG = Object.fromEntries(OUTDOOR_ACTIVITIES.map((a) => [a.slug, a]));
// Finalized visitor-facing display order (I.3, 2026-09-20) for every
// Outdoor activity selector/chip row: most-common summer intents first,
// seasonal and specialist last. Slugs, labels and URLs are unchanged;
// OUTDOOR_ACTIVITIES above keeps its definition order for non-display
// uses (data maps, sitemap), so only presentation moves. Camping and
// Water stay defined but are not live until MIN_ACTIVITY_VENUES is met.
const OUTDOOR_ACTIVITY_DISPLAY_ORDER = ['hiking', 'viewpoints', 'nature', 'cycling', 'winter', 'adventure', 'fishing', 'camping', 'water'];
function sortOutdoorActivitiesForDisplay(list) {
  const rank = (slug) => { const i = OUTDOOR_ACTIVITY_DISPLAY_ORDER.indexOf(slug); return i === -1 ? OUTDOOR_ACTIVITY_DISPLAY_ORDER.length : i; };
  return list.slice().sort((a, b) => rank(a.slug) - rank(b.slug));
}
// An activity page only exists once it has enough real destinations to be
// worth a visit; below this the activity is simply not offered in the
// selector and its URL is a 404 (never an empty or one-card page). Same
// "don't advertise thin pages" discipline as MIN_CATEGORY_VENUES, with a
// higher bar because an activity page is a destination guide, not a
// region listing.
const MIN_ACTIVITY_VENUES = 3;
// Venue types an activity page may list (2026-09-21). Membership in the
// activity collection is the source of truth for WHICH destinations
// belong to an activity; this allowlist only says which underlying
// category records are eligible at all. Provincial parks catalogued as
// Beaches (Ellison, Fintry, Kekuli Bay, Mabel Lake, Vaseux Lake, sw̓iw̓s)
// carry hiking/nature/fishing memberships that were silently dropped by
// the former `v.type = 'outdoor'` gate. Golf is deliberately NOT here:
// whether a golf-and-RV-park record belongs in an activity is a separate
// editorial decision. Cards, hrefs and JSON-LD already key off each
// venue's own type, so a beach row renders as a beach.
const OUTDOOR_ACTIVITY_VENUE_TYPES = ['outdoor', 'beach'];
const OUTDOOR_ACTIVITY_TYPE_SQL = OUTDOOR_ACTIVITY_VENUE_TYPES.map(() => '?').join(', ');
// Featured outdoor experiences on the /outdoors landing page: a short,
// editorially chosen set (region/slug keys, like GOLF_AT_A_GLANCE_FACTS)
// spread across the valley and across activities. Unknown or missing
// keys are skipped, so the section can never show a fabricated card.
const OUTDOOR_FEATURED_KEYS = [
  'kelowna/myra-canyon-myra-bellevue-provincial-park',
  'penticton/skaha-bluffs-provincial-park',
  'enderby/tplaqin-enderby-cliffs-provincial-park',
  'vernon/bx-creek-trail-bx-falls',
  'summerland/giants-head-mountain-park',
  'big-white/big-white-ski-resort',
];

// Canonical venue records (OUTDOOR_ACTIVITY_VENUE_TYPES only) that belong
// to one activity collection, in the same name order the category pages use.
function getOutdoorActivityVenues(activity) {
  return db.prepare(`
    SELECT v.* FROM venues v
    JOIN collection_items ci ON ci.content_type = 'venue' AND ci.content_id = v.id
    JOIN collections c ON c.id = ci.collection_id
    WHERE c.kind = ? AND v.type IN (${OUTDOOR_ACTIVITY_TYPE_SQL}) AND v.redirect_to IS NULL
    GROUP BY v.id
    ORDER BY v.name ASC
  `).all(activity.kind, ...OUTDOOR_ACTIVITY_VENUE_TYPES).map(rowToVenue);
}
// { slug -> count } for every activity, one small query.
function getOutdoorActivityCounts() {
  const rows = db.prepare(`
    SELECT c.kind AS kind, COUNT(DISTINCT v.id) AS n FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    JOIN venues v ON v.id = ci.content_id AND v.type IN (${OUTDOOR_ACTIVITY_TYPE_SQL}) AND v.redirect_to IS NULL
    WHERE ci.content_type = 'venue'
    GROUP BY c.kind
  `).all(...OUTDOOR_ACTIVITY_VENUE_TYPES);
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  return Object.fromEntries(OUTDOOR_ACTIVITIES.map((a) => [a.slug, byKind[a.kind] || 0]));
}
// venue id -> [activity labels] for a set of outdoor venues (one query),
// used to caption featured cards with what you can do there.
function getOutdoorActivityLabelsByVenue(venueIds) {
  if (!venueIds.length) return new Map();
  const placeholders = venueIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ci.content_id AS id, c.kind AS kind FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    WHERE ci.content_type = 'venue' AND ci.content_id IN (${placeholders})
  `).all(...venueIds);
  const map = new Map();
  for (const a of OUTDOOR_ACTIVITIES) {
    for (const r of rows) {
      if (r.kind !== a.kind) continue;
      if (!map.has(r.id)) map.set(r.id, []);
      map.get(r.id).push(a.label);
    }
  }
  return map;
}
// Only activities that have enough destinations to be a real page.
function listLiveOutdoorActivities() {
  const counts = getOutdoorActivityCounts();
  return OUTDOOR_ACTIVITIES.filter((a) => counts[a.slug] >= MIN_ACTIVITY_VENUES).map((a) => ({ ...a, count: counts[a.slug] }));
}
// The /outdoors landing's destination universe (2026-09-22): every
// canonical outdoor-type venue PLUS every other allowlisted-type venue
// (today: Beaches -- the provincial parks) that belongs to a live
// activity, so the landing's activity cards, its filtered results and
// the /outdoors/<activity> pages all count the same destinations
// (getOutdoorActivityVenues / getOutdoorActivityCounts use the same
// allowlist + membership rule). A beach with no live activity
// membership stays a beach only. Same order as getVenuesByCategory.
// Region outdoor directories (/:region/outdoors) are untouched.
function getOutdoorLandingVenues() {
  const liveKinds = listLiveOutdoorActivities().map((a) => a.kind);
  const others = OUTDOOR_ACTIVITY_VENUE_TYPES.filter((t) => t !== 'outdoor');
  if (!liveKinds.length || !others.length) return getVenuesByCategory('outdoor');
  return db.prepare(`
    SELECT v.* FROM venues v
    WHERE v.redirect_to IS NULL AND (
      v.type = 'outdoor'
      OR (v.type IN (${others.map(() => '?').join(', ')}) AND v.id IN (
        SELECT ci.content_id FROM collection_items ci
        JOIN collections c ON c.id = ci.collection_id
        WHERE ci.content_type = 'venue' AND c.kind IN (${liveKinds.map(() => '?').join(', ')})
      ))
    )
    ORDER BY v.region ASC, v.name ASC
  `).all(...others, ...liveKinds).map(rowToVenue);
}

// venue id -> note text for one collection kind (the most recently added
// note wins if several). Shared by the advisory and dog-friendly kinds.
function getCollectionNotes(kind) {
  const rows = db.prepare(`
    SELECT ci.content_id AS id, ci.note AS note
    FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    JOIN venues v ON v.id = ci.content_id
    WHERE c.kind = ? AND ci.content_type = 'venue' AND v.redirect_to IS NULL
    ORDER BY ci.created_at ASC, ci.rowid ASC
  `).all(kind);
  const map = new Map();
  for (const r of rows) map.set(r.id, r.note || '');
  return map;
}
function getAdvisoryNotes() { return getCollectionNotes(ADVISORY_COLLECTION_KIND); }
function getDogFriendlyNotes() { return getCollectionNotes(DOG_FRIENDLY_COLLECTION_KIND); }

// Same .chip convention as the Hidden Gem / Local Favourite badges. The
// official restriction (if any) rides in the title attribute so the label
// stays short on cards while the exact rule is still one hover/tap away;
// the description carries it in full.
function dogFriendlyBadgeHtml(note) {
  const title = note && String(note).trim() ? ` title="${escapeHtml(String(note).trim())}"` : '';
  return `<span class="chip dog-friendly-badge"${title}>\u{1F43E} Dog Friendly</span>`;
}

// Split an advisory note into its message and (optionally) the official source it
// cites: the first http(s) URL in the note becomes the "Official source" link and
// is removed from the visible message. A bare domain (e.g. "kelowna.ca") is left
// in the text as written -- nothing is fabricated into a link.
function parseAdvisoryNote(note) {
  const raw = note && String(note).trim() ? String(note).trim() : '';
  const m = raw.match(/https?:\/\/[^\s)>\]]+/);
  let url = null; let text = raw;
  if (m) {
    url = m[0].replace(/[.,;:]+$/, '');
    text = raw.replace(m[0], '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  }
  return { text, url };
}

// Restrained, informational notice (2026-09-19 redesign): a small uppercase
// kicker in the site's eyebrow style, the advisory sentence in body type, and
// an "Official source" link when the note carries a URL. It sits between the
// permanent description and the CTA row and never styles itself as an alert.
function advisoryNoticeHtml(note) {
  const { text, url } = parseAdvisoryNote(note);
  const message = text || 'A temporary condition currently affects this venue. Check the official source for the latest update.';
  let host = '';
  if (url) { try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; } }
  const source = url
    ? `\n  <a class="venue-advisory-source" href="${escapeHtml(url)}" rel="nofollow noopener" target="_blank">Official source${host ? `: ${escapeHtml(host)}` : ''} &#8599;</a>`
    : '';
  return `<aside class="venue-advisory" role="note" aria-label="Check before you go">
  <p class="venue-advisory-kicker">Check before you go</p>
  <p class="venue-advisory-text">${escapeHtml(message)}</p>${source}
</aside>`;
}

// Emitted only on a page that actually contains an advisory notice, so
// every other page's markup and inline CSS are unchanged. Values come from
// tokens.css; the kicker mirrors the homepage's .eyebrow treatment.
function renderAdvisoryStyles() {
  return `<style>
  .venue-advisory {
    margin: 0 0 14px; padding: 12px 16px; border-radius: 10px;
    background: var(--ref-cream-deep, #EAE6D9); border-left: 3px solid var(--ref-navy, #1B2B3A);
    color: var(--ink); font-size: 0.92rem; line-height: 1.5;
  }
  .venue-advisory-kicker {
    margin: 0 0 4px; font-weight: 700; font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase;
    color: var(--ref-navy, #1B2B3A); opacity: 0.85;
  }
  .venue-advisory-text { margin: 0; }
  .venue-advisory-source {
    display: inline-block; margin-top: 6px; font-size: 0.84rem; font-weight: 700;
    color: var(--ref-navy, #1B2B3A); text-decoration: none; border-bottom: 1px solid rgba(27,43,58,0.3);
  }
  .venue-advisory-source:hover { color: var(--ref-gold, #C9A227); border-bottom-color: currentColor; }
  .venue-card .venue-advisory { margin: 8px 0 10px; padding: 10px 12px; font-size: 0.86rem; }
  .venue-card .venue-advisory-kicker { font-size: 0.68rem; }
</style>`;
}

// Small, shared badge fragment — reuses the existing `.chip` styling
// convention already used by badgeChipsHtml, so no new CSS class or
// design-system addition is needed for this sprint's minimal scope.
function hiddenGemBadgeHtml() {
  return '<span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem</span>';
}

// Second editorial badge (2026-09-19), same chip convention. Membership is
// the 'local_favorite' collection kind, read via getCollectionVenueIds().
function localFavouriteBadgeHtml() {
  return '<span class="chip local-favourite-badge">♥ Local Favourite</span>';
}

// ---------- Editorial collection membership (2026-09-19) ----------
//
// The one write path for badge membership (Hidden Gem, Local Favourite,
// and any future collections.kind). Same guarantees as the other guarded
// updates: the collection kind must already exist in `collections` (kinds
// are bootstrapped in db.js, never created from a request), the venue must
// exist and not be redirected, add/remove are idempotent-safe (409 on a
// duplicate add or a remove of a non-member), the membership change and its
// venue_enrichment_log audit row commit in one transaction, and no column
// or table name ever comes from the request body.
//
// Returns one of:
//   { ok: false, reason: 'unknown_kind' | 'venue_not_found' | 'venue_redirected' | 'already_member' | 'not_member' }
//   { ok: true, kind, venue_id, action, members: <count now in that collection> }
function guardedCollectionMembershipUpdate(kind, venueId, action, note, meta) {
  const collection = db.prepare('SELECT id FROM collections WHERE kind = ?').get(kind);
  if (!collection) return { ok: false, reason: 'unknown_kind' };
  const venue = db.prepare('SELECT id, redirect_to FROM venues WHERE id = ?').get(venueId);
  if (!venue) return { ok: false, reason: 'venue_not_found' };
  if (venue.redirect_to !== null) return { ok: false, reason: 'venue_redirected' };

  const existing = db
    .prepare("SELECT 1 FROM collection_items WHERE collection_id = ? AND content_type = 'venue' AND content_id = ?")
    .get(collection.id, venueId);
  if (action === 'add' && existing) return { ok: false, reason: 'already_member' };
  if (action === 'remove' && !existing) return { ok: false, reason: 'not_member' };

  let txOpen = false;
  try {
    db.exec('BEGIN');
    txOpen = true;
    if (action === 'add') {
      const next = db
        .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM collection_items WHERE collection_id = ?')
        .get(collection.id).p;
      db.prepare(`INSERT INTO collection_items (collection_id, content_type, content_id, note, position) VALUES (?, 'venue', ?, ?, ?)`)
        .run(collection.id, venueId, note, next);
    } else {
      db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND content_type = 'venue' AND content_id = ?")
        .run(collection.id, venueId);
    }
    db.prepare(
      `INSERT INTO venue_enrichment_log
         (venue_id, field_name, old_value, new_value, source, source_ref, confidence, batch_id, auto_accepted, reviewed_by)
       VALUES (?, ?, ?, ?, 'editorial_collection', ?, 'high', ?, 0, ?)`
    ).run(
      venueId,
      `collection:${kind}`,
      action === 'add' ? 'absent' : 'member',
      action === 'add' ? 'member' : 'absent',
      meta.reason,
      meta.batch_id,
      meta.reviewed_by || null
    );
    db.exec('COMMIT');
    txOpen = false;
  } catch (err) {
    if (txOpen) db.exec('ROLLBACK');
    throw err;
  }

  const members = db
    .prepare("SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ? AND content_type = 'venue'")
    .get(collection.id).n;
  return { ok: true, kind, venue_id: venueId, action, members };
}

function getRelatedVenues(venue, limit = 6) {
  // Same region + same category, excluding itself
  return db
    .prepare('SELECT * FROM venues WHERE region = ? AND type = ? AND id != ? AND redirect_to IS NULL ORDER BY rating DESC, name ASC LIMIT ?')
    .all(venue.region, venue.type, venue.id, limit)
    .map(rowToVenue);
}

function getNearbyVenues(venue, limit = 6) {
  // Same region, any other category, excluding itself — a broader
  // "explore this region more" set distinct from same-category related venues
  return db
    .prepare('SELECT * FROM venues WHERE region = ? AND type != ? AND id != ? AND redirect_to IS NULL ORDER BY rating DESC, name ASC LIMIT ?')
    .all(venue.region, venue.type, venue.id, limit)
    .map(rowToVenue);
}

// ---------- Build My Trip, Stage 1 (backend itinerary generation) ----------
//
// Deliberately narrow, per the Stage 1 scope: pure, deterministic itinerary
// generation over REAL venue data, exposed as a single JSON endpoint. No
// frontend changes, no AI/conversational planning, no new database
// columns/tables — everything here reads existing venues rows only.
//
// The generation logic (buildTripItinerary) is a PURE function: it takes an
// already-queried pool of venues plus the trip parameters and returns a
// plan, with no database access of its own — the same separation of
// concerns getRelatedVenues/getNearbyVenues use elsewhere in this file, but
// especially important here since it makes the actual planning algorithm
// directly unit-testable against fixed fixture arrays, with no DB setup
// required, for a feature whose main correctness requirement is
// "deterministic, not AI."

const TRIP_VALID_PACES = ['relaxed', 'standard', 'packed'];

// Maximum straight-line distance (km, haversine) this pace is willing to
// accept between one stop and the next within the same day, before a
// candidate is treated as "too far" and only used as a last resort (with a
// warning). This is the whole of Stage 1's "avoid obviously impossible
// travel schedules" guard — a real drive-time API is explicitly out of
// scope for Stage 1, so this is an honest, deterministic straight-line
// proxy, in the same spirit as the existing "we don't have a verified X, so
// we approximate" pattern already used elsewhere (menu/booking search
// links, the trip tray's region-level distance display).
const TRIP_PACE_MAX_HOP_KM = {
  relaxed: 15,
  standard: 30,
  packed: 50,
};

// How well each venue TYPE fits each part of the day. Deliberately a small
// hardcoded table, not a learned/ML weighting — Stage 1 is explicitly
// required to be deterministic, this is easy to reason about, and it's easy
// to extend later (e.g. once amenity-based scoring or events are folded
// in). Keys match CATEGORY_SLUGS exactly.
const TRIP_TYPE_DAYPART_AFFINITY = {
  golf: { morning: 3, afternoon: 2, evening: 0 },
  cafe: { morning: 3, afternoon: 1, evening: 0 },
  winery: { morning: 1, afternoon: 3, evening: 1 },
  restaurant: { morning: 1, afternoon: 2, evening: 3 },
  brewery: { morning: 0, afternoon: 2, evening: 3 },
  pub: { morning: 0, afternoon: 1, evening: 3 },
  cocktail: { morning: 0, afternoon: 1, evening: 3 },
};

const TRIP_DAYPARTS = ['morning', 'afternoon', 'evening'];

// Build My Trip, Stage 3: budget bands over the existing venues.price
// column (1-4, populated on ~40% of venues -- see the Stage 3 data-model
// audit). Deliberately loose, overlapping ranges rather than an exact
// match: "moderate" includes $ and $$$ neighbors, not just $$, because
// price on this data is sparse and a hard equality match would make the
// budget preference boost almost never fire. A venue with no price on
// file simply never matches any band (see budgetMatchesPrice below) --
// it is never excluded, only never boosted.
const TRIP_VALID_BUDGETS = ['budget', 'moderate', 'upscale'];
const TRIP_BUDGET_PRICE_RANGES = {
  budget: (price) => price <= 2,
  moderate: (price) => price >= 2 && price <= 3,
  upscale: (price) => price >= 3,
};

function budgetMatchesPrice(budget, price) {
  if (price == null) return false;
  const test = TRIP_BUDGET_PRICE_RANGES[budget];
  return test ? test(price) : false;
}

// Haversine great-circle distance in km. A server-side port of the exact
// same formula already used client-side in public/scripts/app.js (the
// haversineKm() behind window.__distanceBetweenRegions) — kept as a
// separate implementation, not a shared module, since the two run in
// genuinely different environments (this one is plain Node, no
// DOM/window), but the math is intentionally identical.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Picks the single best next venue for one slot (one day's morning/
// afternoon/evening), given:
//   - candidates: the full remaining pool to choose from (already filtered
//     to the trip's region/interests by the caller)
//   - usedIds: Set of venue ids already placed anywhere in this itinerary
//     — no venue is ever repeated across the whole trip
//   - daypart: 'morning' | 'afternoon' | 'evening'
//   - previousStop: the venue placed immediately before this slot (the
//     prior slot the same day, or the last slot of the previous day), or
//     null for the very first slot of the trip
//   - maxHopKm: this trip's pace threshold (TRIP_PACE_MAX_HOP_KM[pace])
//   - preferences (Stage 3, optional): { amenities, budget, discoveryIds }
//     - amenities: array of BOOL_FIELDS names the trip should favor (default [])
//     - budget: one of TRIP_VALID_BUDGETS, or null (default null)
//     - discoveryIds: a Set of venue ids to favor (e.g. hidden gems), or
//       null (default null)
//     Omitting `preferences` entirely (every Stage 1/2 call site, and
//     every existing test) makes every candidate score 0 on this tier --
//     see step 3 in the comparator below.
//
// Returns { venue, hopKm, hopExceededThreshold, hopUnknown } or null if the
// candidate pool is exhausted.
//
// Selection is fully deterministic: candidates are scored by (in priority
// order) whether they respect the distance threshold, daypart affinity,
// preference match count, rating, then venue id as a final stable
// tiebreaker — never by random choice or by whatever order SQLite happened
// to return rows in.
function pickBestTripVenue(candidates, usedIds, daypart, previousStop, maxHopKm, preferences) {
  const prefs = preferences || {};
  const prefAmenities = Array.isArray(prefs.amenities) ? prefs.amenities : [];
  const prefBudget = prefs.budget || null;
  const prefDiscoveryIds = prefs.discoveryIds instanceof Set ? prefs.discoveryIds : null;

  const pool = candidates.filter((v) => !usedIds.has(v.id));
  if (pool.length === 0) return null;

  const scored = pool.map((venue) => {
    let hopKm = null;
    let hopUnknown = true;
    if (
      previousStop &&
      previousStop.latitude != null &&
      previousStop.longitude != null &&
      venue.latitude != null &&
      venue.longitude != null
    ) {
      hopKm = haversineKm(previousStop.latitude, previousStop.longitude, venue.latitude, venue.longitude);
      hopUnknown = false;
    }
    const hopExceededThreshold = hopUnknown ? false : hopKm > maxHopKm;
    const affinity = (TRIP_TYPE_DAYPART_AFFINITY[venue.type] || { morning: 1, afternoon: 1, evening: 1 })[daypart];

    // Stage 3: a soft preference-match score -- how many of the caller's
    // requested amenities/budget/discovery this candidate satisfies. This
    // is ALWAYS an additive boost, never a filter: a venue that matches
    // zero preferences is still fully eligible, just without the boost.
    // Amenity columns can never be trusted as "verified false" (see the
    // Stage 3 data-model audit -- false and "never researched" are the
    // same 0 in this schema today), so a non-matching venue must never be
    // excluded outright, only fail to gain a boost here.
    let preferenceScore = 0;
    for (const field of prefAmenities) {
      if (venue[field] === true) preferenceScore += 1;
    }
    if (prefBudget && budgetMatchesPrice(prefBudget, venue.price)) preferenceScore += 1;
    if (prefDiscoveryIds && prefDiscoveryIds.has(venue.id)) preferenceScore += 1;

    return { venue, hopKm, hopUnknown, hopExceededThreshold, affinity, preferenceScore };
  });

  scored.sort((a, b) => {
    // 1. Prefer candidates within the pace's distance threshold (or unknown
    //    distance, since we can't penalize what we can't measure) over ones
    //    that clearly exceed it.
    if (a.hopExceededThreshold !== b.hopExceededThreshold) {
      return a.hopExceededThreshold ? 1 : -1;
    }
    // 2. Prefer a better fit for this part of the day.
    if (a.affinity !== b.affinity) return b.affinity - a.affinity;
    // 3. Stage 3: prefer a higher preference-match score. Both sides are
    //    always 0 when no preferences were requested, so this line is a
    //    structural no-op for every pre-Stage-3-shaped call, and the
    //    comparator falls through to the exact same rating/distance/id
    //    chain as before.
    if (a.preferenceScore !== b.preferenceScore) return b.preferenceScore - a.preferenceScore;
    // 4. Prefer a higher rating (unrated treated as lowest).
    const ar = a.venue.rating == null ? -1 : a.venue.rating;
    const br = b.venue.rating == null ? -1 : b.venue.rating;
    if (ar !== br) return br - ar;
    // 5. Prefer the closer of two otherwise-tied candidates, when distance
    //    is actually known for both.
    if (!a.hopUnknown && !b.hopUnknown && a.hopKm !== b.hopKm) return a.hopKm - b.hopKm;
    // 6. Final, fully deterministic tiebreaker.
    return a.venue.id - b.venue.id;
  });

  const best = scored[0];
  return {
    venue: best.venue,
    hopKm: best.hopKm,
    hopExceededThreshold: best.hopExceededThreshold,
    hopUnknown: best.hopUnknown,
  };
}

// The main Stage 1 planner. Pure function — takes an already-queried pool
// of venues for the requested region (unfiltered by interest; this
// function does its own interest filtering AND the "not enough venues"
// fallback, both of which need visibility into the full pool, not just a
// pre-filtered one) and the trip parameters, returns a day-by-day plan.
//
// params: { region, days, interests, pace, amenities, budget, discovery, discoveryVenueIds, excludeVenueIds }
//   - region: a valid region slug (validated by the caller)
//   - days: integer, clamped to 1–7
//   - interests: array of venue type strings (may be empty = no filter)
//   - pace: one of TRIP_VALID_PACES (defaults to 'standard' if unrecognized)
//   - amenities (Stage 3, optional): array of BOOL_FIELDS names to favor;
//     invalid names are silently dropped (defensive -- callers should
//     already validate, same posture as pace/interests above)
//   - budget (Stage 3, optional): one of TRIP_VALID_BUDGETS, else null
//   - discovery (Stage 3, optional): array of collection-kind strings
//     (e.g. 'hidden_gem'), echoed back as-is -- this function trusts its
//     caller to have already validated these against real collections.kind
//     values (that requires a DB query, which this otherwise-pure function
//     deliberately does not make)
//   - discoveryVenueIds (Stage 3, optional): a Set of venue ids already
//     resolved from `discovery` by the caller (e.g. via
//     getCollectionVenueIds), used for the actual scoring boost
//   - excludeVenueIds (Regenerate-exclusion fix, optional): array of venue
//     ids to treat as already used before the first slot is even picked --
//     the caller's "removed" stops, which must never be re-selected on a
//     Regenerate. Reuses the exact same usedIds mechanism that already
//     stops a venue being picked twice in one trip; no separate
//     filtering/selection path.
//
// Returns:
//   {
//     region, days, pace, interests, amenities, budget, discovery,
//     itinerary: [ { day: 1, morning: venue|null, afternoon: venue|null, evening: venue|null }, ... ],
//     warnings: [ string, ... ],
//   }
function buildTripItinerary(venues, params) {
  const region = params.region;
  const days = Math.max(1, Math.min(7, Math.round(params.days)));
  const interests = Array.isArray(params.interests) ? params.interests.filter(Boolean) : [];
  const pace = TRIP_VALID_PACES.includes(params.pace) ? params.pace : 'standard';
  const maxHopKm = TRIP_PACE_MAX_HOP_KM[pace];
  const amenities = Array.isArray(params.amenities) ? params.amenities.filter((f) => BOOL_FIELDS.includes(f)) : [];
  const budget = TRIP_VALID_BUDGETS.includes(params.budget) ? params.budget : null;
  const discovery = Array.isArray(params.discovery) ? params.discovery.filter(Boolean) : [];
  const discoveryVenueIds = params.discoveryVenueIds instanceof Set ? params.discoveryVenueIds : null;
  const preferences = { amenities, budget, discoveryIds: discoveryVenueIds };
  const excludeVenueIds = Array.isArray(params.excludeVenueIds) ? params.excludeVenueIds : [];

  const warnings = [];

  let pool = venues;
  if (interests.length > 0) {
    const interested = venues.filter((v) => interests.includes(v.type));
    const neededStops = days * TRIP_DAYPARTS.length;
    if (interested.length < neededStops) {
      warnings.push(
        `Not enough ${interests.join('/')} venues in ${region} to fill every day -- showing other types too.`
      );
      pool = venues; // fall back to the full region pool
    } else {
      pool = interested;
    }
  }

  const usedIds = new Set(excludeVenueIds);
  const itinerary = [];
  let previousStop = null;

  for (let day = 1; day <= days; day++) {
    const dayPlan = { day };
    for (const daypart of TRIP_DAYPARTS) {
      const pick = pickBestTripVenue(pool, usedIds, daypart, previousStop, maxHopKm, preferences);
      if (!pick) {
        dayPlan[daypart] = null;
        warnings.push(`Ran out of venues to fill day ${day}'s ${daypart} slot in ${region}.`);
        continue;
      }
      if (pick.hopExceededThreshold) {
        warnings.push(
          `Day ${day} ${daypart}: ${pick.venue.name} is ~${Math.round(pick.hopKm)}km from the previous stop, further than a ${pace} pace usually covers.`
        );
      }
      dayPlan[daypart] = pick.venue;
      usedIds.add(pick.venue.id);
      previousStop = pick.venue;
    }
    itinerary.push(dayPlan);
  }

  return { region, days, pace, interests, amenities, budget, discovery, itinerary, warnings };
}

// ---------- Build My Trip, Stage 3: shared trip-request field validators ----------
//
// The single source of truth for "is this a real, supported value" for
// every Build My Trip field, used by BOTH POST /api/trip/generate (which
// rejects a request outright with 400 on any invalid value -- a strict
// developer/wizard contract) and POST /api/trip/parse (which instead sorts
// an invalid/unsupported value into `unsupported[]` and still returns a
// plan from whatever WAS understood -- because a natural-language request
// can honestly mention things this product doesn't support yet, and that
// is not an error, just a limit to be reported honestly). Keeping these as
// small, pure, single-purpose predicates -- rather than one monolithic
// validator -- lets each route apply its own policy for what an invalid
// value means, without duplicating the definition of "invalid."
function isValidTripRegion(region) {
  return typeof region === 'string' && VALID_REGIONS.includes(region);
}
function isValidTripDays(days) {
  return Number.isInteger(days) && days >= 1 && days <= 7;
}
function isValidTripInterest(type) {
  // Planner-eligible types only (TRIP_INTEREST_TYPES) -- a category can
  // exist as venue pages without being a Build My Trip interest yet.
  return typeof type === 'string' && isTripPlannerType(type);
}
function isValidTripAmenity(field) {
  return typeof field === 'string' && BOOL_FIELDS.includes(field);
}
function isValidTripPace(pace) {
  return typeof pace === 'string' && TRIP_VALID_PACES.includes(pace);
}
function isValidTripBudget(budget) {
  return typeof budget === 'string' && TRIP_VALID_BUDGETS.includes(budget);
}
function isValidTripDiscoveryKind(kind, knownKinds) {
  return typeof kind === 'string' && knownKinds.includes(kind);
}
// Regenerate-exclusion fix: a venue id the caller has already rejected
// (via "Remove") and never wants selected again for this itinerary, sent
// back on every subsequent Regenerate. Same "array of the obvious
// primitive type" validation posture as interests/amenities above.
function isValidTripExcludeIds(value) {
  return Array.isArray(value) && value.every((id) => Number.isInteger(id));
}

// ---------- Build My Trip, Stage 3: OpenAI provider adapter ----------
//
// The ONLY place in this codebase that knows anything about OpenAI's
// specific request/response shape. callTripParserProvider() always
// resolves to a plain { raw, error } value -- `raw` is either a parsed
// JSON object or null, `error` is either null or a short machine-readable
// reason string -- so parseTripRequest() below, and everything upstream of
// it, never depends on an OpenAI-specific structure. Swapping providers
// later means replacing only this one function.
const OPENAI_PARSER_MODEL = 'gpt-4o-mini'; // cost-efficient extraction/classification model, not a reasoning model

// Pure classification of a failed fetch() attempt to the OpenAI endpoint --
// pulled out of callTripParserProvider's catch block specifically so it can
// be unit-tested directly, without a real network call (the fetch call
// itself is not mockable in this test suite without either a live request
// or a process-cache hack, both of which this project's test suite
// deliberately avoids). Behavior-only extraction: no change to what
// callTripParserProvider does.
function classifyTripParserFetchError(err) {
  const isTimeout = !!err && err.name === 'AbortError';
  return { error: isTimeout ? 'timeout' : 'network_error', isTimeout };
}

function buildTripParserSystemPrompt(knownDiscoveryKinds) {
  return [
    'You extract structured trip-planning requirements from a customer\'s natural-language request about visiting the Okanagan Valley, British Columbia.',
    'Return ONLY a JSON object with these fields (every field is optional -- omit or use null for anything you cannot confidently determine):',
    `- region: one of [${VALID_REGIONS.join(', ')}]`,
    '- days: integer 1-7',
    `- interests: array from [${TRIP_INTEREST_TYPES.join(', ')}]`,
    `- amenities: array from [${BOOL_FIELDS.join(', ')}]`,
    `- pace: one of [${TRIP_VALID_PACES.join(', ')}]`,
    `- budget: one of [${TRIP_VALID_BUDGETS.join(', ')}]`,
    `- discovery: array from [${knownDiscoveryKinds.join(', ')}]`,
    '- unsupported_terms: array of short exact phrases from the request that are travel-related but do NOT map to any field/value above (for example: "beaches", "hiking", "a concert Saturday night", "wheelchair accessible")',
    '',
    'Rules:',
    '- NEVER invent a region, interest, amenity, budget, or discovery value outside the exact lists given above.',
    '- If the request mentions something travel-related that is not in an allowed list, put the exact phrase in unsupported_terms -- do NOT approximate it to the closest allowed value.',
    '- If you cannot confidently determine the region or day count, omit that field (use null) rather than guessing.',
    '- Return ONLY the JSON object, no other text.',
  ].join('\n');
}

async function callTripParserProvider(text) {
  if (!OPENAI_API_KEY) {
    return { raw: null, error: 'not_configured' };
  }

  const knownDiscoveryKinds = getKnownDiscoveryKinds();
  const systemPrompt = buildTripParserSystemPrompt(knownDiscoveryKinds);

  // Diagnostic hardening (2026-09-18): the outbound call previously had no
  // timeout, so a hung connection was unobservable -- it could surface
  // only as Railway's edge reporting "Application Failed to Respond" with
  // zero application-level log output. A bounded abort turns any hang
  // into a fast, explicitly logged failure instead.
  const OPENAI_REQUEST_TIMEOUT_MS = 10000;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), OPENAI_REQUEST_TIMEOUT_MS);

  let httpRes;
  try {
    httpRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: OPENAI_PARSER_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'trip_request',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                region: { type: ['string', 'null'] },
                days: { type: ['integer', 'null'] },
                interests: { type: 'array', items: { type: 'string' } },
                amenities: { type: 'array', items: { type: 'string' } },
                pace: { type: ['string', 'null'] },
                budget: { type: ['string', 'null'] },
                discovery: { type: 'array', items: { type: 'string' } },
                unsupported_terms: { type: 'array', items: { type: 'string' } },
              },
              required: ['region', 'days', 'interests', 'amenities', 'pace', 'budget', 'discovery', 'unsupported_terms'],
              additionalProperties: false,
            },
          },
        },
      }),
    });
  } catch (err) {
    const classified = classifyTripParserFetchError(err);
    // Logs ONLY the error's own name/message and our own timeout
    // classification -- never the request itself. The request/headers
    // objects (which contain OPENAI_API_KEY via the Authorization header)
    // are never passed to console.error, here or anywhere else in this
    // function.
    console.error('[trip-parser] OpenAI parser request failed', {
      errorName: err && err.name,
      errorMessage: err && err.message,
      timeout: classified.isTimeout,
    });
    return { raw: null, error: classified.error };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!httpRes.ok) {
    return { raw: null, error: 'provider_http_error' };
  }

  let body;
  try {
    body = await httpRes.json();
  } catch (err) {
    return { raw: null, error: 'invalid_json' };
  }

  const content = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (typeof content !== 'string') {
    return { raw: null, error: 'invalid_response_shape' };
  }

  let parsedContent;
  try {
    parsedContent = JSON.parse(content);
  } catch (err) {
    return { raw: null, error: 'invalid_json' };
  }

  if (typeof parsedContent !== 'object' || parsedContent === null || Array.isArray(parsedContent)) {
    return { raw: null, error: 'invalid_response_shape' };
  }

  return { raw: parsedContent, error: null };
}

// ---------- Build My Trip, Stage 3: FREE deterministic natural-language parser ----------
//
// The DEFAULT trip-request provider (see parseTripRequest()'s providerFn
// default just below). Zero external calls, zero API cost, zero dependency
// on OPENAI_API_KEY -- the whole thing is string matching against this
// app's own authoritative enums. callTripParserProvider() (OpenAI) above
// remains fully intact as an alternative provider for the future (pass it
// explicitly via parseTripRequest(text, { providerFn: callTripParserProvider })),
// but nothing in the live /api/trip/parse path calls it anymore.
//
// Design: normalize the input text once, then run one independent alias-
// table lookup per field. Every alias table is keyed by a value that
// already exists in this app's real data (VALID_REGIONS/REGION_LABELS,
// CATEGORY_SLUGS, BOOL_FIELDS, TRIP_VALID_PACES, TRIP_VALID_BUDGETS, live
// collection kinds) -- nothing here invents a new taxonomy value.
// parseTripRequest()'s existing isValidTrip*() predicates still
// revalidate every field exactly as they do for any other provider, so
// this function doesn't need to be perfectly strict to stay safe; it only
// needs to never emit an out-of-taxonomy VALUE for a supported field.
// Concepts this app can't satisfy (beaches, events, accessibility, etc.)
// are recognized and reported via unsupported_terms, never silently
// dropped and never approximated into a real field.

function normalizeTripParserText(text) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[-–—]/g, ' ') // hyphens/dashes -> space, so "dog-friendly" and "dog friendly" match the same alias
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Region aliases are derived from the app's own authoritative
// VALID_REGIONS/REGION_LABELS, not a separately hand-maintained list -- a
// new region added to the data automatically gets natural-language
// recognition here (its slug-with-spaces form and its display label) with
// no parser change required.
function buildTripParserRegionAliases() {
  const aliases = {};
  VALID_REGIONS.forEach((slug) => {
    const fromSlug = slug.replace(/-/g, ' ');
    const fromLabel = (REGION_LABELS[slug] || '').toLowerCase();
    aliases[slug] = Array.from(new Set([fromSlug, fromLabel].filter(Boolean)));
  });
  return aliases;
}

const TRIP_PARSER_INTEREST_ALIASES = {
  winery: ['wine', 'wines', 'wineries', 'winery', 'vineyard', 'vineyards', 'wine tasting', 'wine tastings', 'wine tour', 'wine tours'],
  restaurant: ['restaurant', 'restaurants', 'dining', 'food', 'eat', 'eating out'],
  cafe: ['cafe', 'cafes', 'coffee', 'coffee shop', 'coffee shops'],
  brewery: ['brewery', 'breweries', 'beer', 'craft beer'],
  pub: ['pub', 'pubs'],
  cocktail: ['cocktail', 'cocktails', 'cocktail bar', 'cocktail bars', 'cocktail lounge'],
  golf: ['golf', 'golfing', 'golf course', 'golf courses'],
};

const TRIP_PARSER_AMENITY_ALIASES = {
  dog_friendly: ['dog friendly', 'dogs', 'my dog', 'bring my dog', 'with my dog', 'pet friendly', 'pets'],
  kid_friendly: ['kid friendly', 'family friendly', 'with kids', 'with my kids'],
  vegan: ['vegan', 'vegan friendly', 'vegan options'],
  vegetarian: ['vegetarian', 'vegetarian friendly', 'vegetarian options'],
  gluten_free: ['gluten free'],
  patio: ['patio', 'outdoor seating'],
  lake_view: ['lake view', 'lakeview', 'lake views'],
  nonalcoholic: ['non alcoholic', 'nonalcoholic', 'alcohol free', 'mocktails'],
  sports_tv: ['sports tv', 'watch the game', 'watch sports'],
  live_music: ['live music'],
  great_groups: ['great for groups', 'good for groups', 'large groups'],
  happy_hour: ['happy hour'],
};

const TRIP_PARSER_PACE_ALIASES = {
  relaxed: ['relaxed', 'easygoing', 'easy going', 'slow', 'leisurely', 'take it easy', 'laid back', 'chill', 'chilled'],
  standard: ['standard', 'moderate pace', 'moderate speed', 'balanced', 'normal pace'],
  packed: ['packed', 'busy', 'full', 'see as much as possible', 'action packed', 'jam packed'],
};

// Deliberately excludes the bare word "moderate" -- it collides with the
// pace aliases "moderate pace"/"moderate speed" above. See the explicit
// disambiguation step in deterministicTripParserProvider() below, which
// only treats bare "moderate" as a budget signal when it is NOT part of
// one of those pace phrases.
const TRIP_PARSER_BUDGET_ALIASES = {
  budget: ['cheap', 'inexpensive', 'affordable', 'on a budget', 'low cost', 'budget friendly'],
  moderate: ['mid range', 'reasonable', 'reasonably priced'],
  upscale: ['upscale', 'nicer', 'higher end', 'high end', 'luxury', 'splurge', 'premium', 'fancy', 'fine dining'],
};

// Keyed by real collections.kind values. Only kinds that
// getKnownDiscoveryKinds() actually returns at parse time are used (see
// deterministicTripParserProvider()), so this table can never surface a
// discovery kind that doesn't really exist in the data.
const TRIP_PARSER_DISCOVERY_ALIASES = {
  hidden_gem: ['hidden gems', 'hidden gem', 'secret spots', 'secret spot', 'off the beaten path', 'local secrets', 'lesser known places', 'lesser known place', 'hidden places', 'hidden place'],
};

// Concepts this app is known NOT to support today (see the Stage 3 data-
// model audits) -- recognized so the parser can report them honestly in
// unsupported_terms instead of silently ignoring them or approximating
// them into a real field. This list can never be exhaustive (an inherent,
// honest limitation of a deterministic, non-LLM parser); it covers the
// concretely known gaps -- beaches/waterfront, outdoors/hiking, events/
// What's On, accessibility -- plus a few illustrative one-off examples.
const TRIP_PARSER_UNSUPPORTED_PHRASES = [
  'beach', 'beaches', 'swimming', 'lake day', 'waterfront',
  'hiking', 'hike', 'outdoors', 'nature', 'adventure', 'explore', 'exploring',
  "what's on", 'whats on', 'something fun happening', 'something happening',
  'saturday night', 'sunday night', 'friday night', 'live music saturday',
  'event', 'events', 'concert', 'festival', 'show',
  'wheelchair accessible', 'wheelchair', 'accessibility', 'accessible',
  'helicopter tour', 'helicopter', 'private jet', 'michelin star', 'michelin',
];

const TRIP_PARSER_DAY_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

// A single adjective is allowed to sit between the number and "day(s)"
// (e.g. "3 relaxed days", "three packed days") -- a very natural, common
// way to phrase a trip length. Deliberately a small, curated list of
// plausible trip/pace adjectives, NOT an arbitrary `\w+` gap: an
// unrestricted gap would risk pulling in unrelated numbers from sentences
// like "my order was 3 items that day" (one word, "items", between "3"
// and "day"). Restricting the gap to known trip-describing adjectives
// keeps the match narrow while covering the realistic phrasing this app
// actually needs to support.
const TRIP_PARSER_DAY_ADJECTIVES = [
  'relaxed', 'easygoing', 'easy', 'slow', 'leisurely', 'chill', 'chilled',
  'standard', 'balanced', 'normal', 'moderate',
  'packed', 'busy', 'full', 'quick', 'short', 'long',
  'fun', 'great', 'amazing', 'wonderful', 'perfect', 'quiet',
];
const TRIP_PARSER_DAY_ADJECTIVE_GROUP = TRIP_PARSER_DAY_ADJECTIVES.join('|');
const TRIP_PARSER_DAYS_DIGIT_RE = new RegExp(`\\b(\\d{1,2})\\s+(?:(?:${TRIP_PARSER_DAY_ADJECTIVE_GROUP})\\s+)?days?\\b`);
const TRIP_PARSER_DAYS_WORD_RE = new RegExp(`\\b(one|two|three|four|five|six|seven)\\s+(?:(?:${TRIP_PARSER_DAY_ADJECTIVE_GROUP})\\s+)?days?\\b`);

// "long weekend" is a well-defined, widely understood 3-day idiom -- safe
// to map. A bare "weekend" alone is genuinely ambiguous (2 days? 3?) and
// is deliberately left unmapped, matching the "never guess a day count"
// rule: it falls through to needs_clarification instead.
function detectTripParserDays(normalizedText) {
  if (/\blong weekend\b/.test(normalizedText)) return 3;
  const digitMatch = normalizedText.match(TRIP_PARSER_DAYS_DIGIT_RE);
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    return isValidTripDays(n) ? n : null;
  }
  const wordMatch = normalizedText.match(TRIP_PARSER_DAYS_WORD_RE);
  if (wordMatch) {
    const n = TRIP_PARSER_DAY_WORDS[wordMatch[1]];
    return isValidTripDays(n) ? n : null;
  }
  return null;
}

// Picks the single best (longest phrase, then leftmost) match across
// every canonical value's alias list -- used for the scalar fields
// (region, pace, budget) where only one value makes sense. Matching is
// whole-phrase-safe: `paddedText` is the normalized text with a leading
// and trailing space, so ` ${phrase} ` can never match inside a larger
// unrelated word.
function findBestTripParserAlias(paddedText, aliasTable) {
  let best = null;
  for (const [value, phrases] of Object.entries(aliasTable)) {
    for (const phrase of phrases) {
      const index = paddedText.indexOf(` ${phrase} `);
      if (index === -1) continue;
      if (!best || phrase.length > best.length || (phrase.length === best.length && index < best.index)) {
        best = { value, phrase, index, length: phrase.length };
      }
    }
  }
  return best ? best.value : null;
}

// Collects every canonical value with at least one matching alias --
// used for the array-valued fields (interests, amenities, discovery)
// where multiple matches are all kept, deduplicated by canonical value.
function findAllTripParserAliases(paddedText, aliasTable) {
  const values = [];
  for (const [value, phrases] of Object.entries(aliasTable)) {
    if (phrases.some((phrase) => paddedText.indexOf(` ${phrase} `) !== -1)) {
      values.push(value);
    }
  }
  return values;
}

// Same matching rule as above, but for the flat unsupported-phrase list.
// When one matched phrase fully contains a shorter matched phrase (e.g.
// "something fun happening" contains "something happening"), only the
// longer, more specific phrase is kept -- so overlapping aliases for the
// same concept don't produce redundant near-duplicate entries.
function findUnsupportedTripParserPhrases(paddedText, phrases) {
  const matched = phrases.filter((phrase) => paddedText.indexOf(` ${phrase} `) !== -1);
  const sortedByLengthDesc = [...matched].sort((a, b) => b.length - a.length);
  const kept = [];
  sortedByLengthDesc.forEach((phrase) => {
    if (!kept.some((k) => k.includes(phrase))) kept.push(phrase);
  });
  return kept;
}

// The deterministic parser provider -- returns the exact same {raw, error}
// contract every provider must (see callTripParserProvider above), so
// parseTripRequest() needs no changes at all to use it. Synchronous (no
// I/O beyond the same local getKnownDiscoveryKinds() SELECT every other
// trip route already makes); awaiting a non-Promise value is a no-op, so
// it works fine as a providerFn even though parseTripRequest() always
// awaits it.
function deterministicTripParserProvider(text) {
  const normalized = normalizeTripParserText(text);
  const padded = ` ${normalized} `;

  const region = findBestTripParserAlias(padded, buildTripParserRegionAliases());
  const days = detectTripParserDays(normalized);
  const pace = findBestTripParserAlias(padded, TRIP_PARSER_PACE_ALIASES);

  let budget = findBestTripParserAlias(padded, TRIP_PARSER_BUDGET_ALIASES);
  if (!budget && padded.indexOf(' moderate ') !== -1 && padded.indexOf(' moderate pace ') === -1 && padded.indexOf(' moderate speed ') === -1) {
    budget = 'moderate';
  }

  const interests = findAllTripParserAliases(padded, TRIP_PARSER_INTEREST_ALIASES);
  const amenities = findAllTripParserAliases(padded, TRIP_PARSER_AMENITY_ALIASES);

  const knownDiscoveryKinds = getKnownDiscoveryKinds();
  const liveDiscoveryAliases = {};
  Object.keys(TRIP_PARSER_DISCOVERY_ALIASES).forEach((kind) => {
    if (knownDiscoveryKinds.includes(kind)) liveDiscoveryAliases[kind] = TRIP_PARSER_DISCOVERY_ALIASES[kind];
  });
  const discovery = findAllTripParserAliases(padded, liveDiscoveryAliases);

  const unsupported_terms = findUnsupportedTripParserPhrases(padded, TRIP_PARSER_UNSUPPORTED_PHRASES);

  return {
    raw: { region, days, interests, amenities, pace, budget, discovery, unsupported_terms },
    error: null,
  };
}

// The natural-language trip-request parser. Treats the provider's response
// as UNTRUSTED input: every field is re-validated with the exact same
// isValidTrip*() predicates /api/trip/generate uses, never taken on faith.
// A value that fails validation is never silently dropped and never
// silently honored -- it is moved into `unsupported`, so the customer's
// request is represented honestly even when part of it can't be fulfilled.
//
// options.providerFn lets tests inject a mock provider (no real network
// call). Production code omits it and gets the FREE deterministic parser
// above (deterministicTripParserProvider) -- NOT the OpenAI provider,
// which is now only used if a caller explicitly opts into it.
//
// Returns either:
//   { ok: false, reason: string }  -- provider unavailable/network/malformed
//     output that could not even be parsed as a JSON object. The route
//     turns this into a 502; it is never presented as a valid (if empty)
//     trip request.
//   { ok: true, value: { region, days, interests, amenities, pace, budget,
//     discovery, unsupported, needs_clarification } } -- always returned
//     once the provider produced *a* JSON object, even if that object is
//     mostly empty; missing/invalid required-ish fields (region, days) are
//     reported via needs_clarification rather than failing the request.
async function parseTripRequest(text, options) {
  const opts = options || {};
  const providerFn = opts.providerFn || deterministicTripParserProvider;

  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, reason: 'empty_text' };
  }

  let providerResult;
  try {
    providerResult = await providerFn(text);
  } catch (err) {
    return { ok: false, reason: 'provider_error' };
  }

  if (!providerResult || providerResult.error || providerResult.raw == null) {
    return { ok: false, reason: (providerResult && providerResult.error) || 'provider_error' };
  }

  const raw = providerResult.raw;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'malformed_provider_output' };
  }

  const unsupported = [];
  if (Array.isArray(raw.unsupported_terms)) {
    raw.unsupported_terms.forEach((term) => {
      if (typeof term === 'string' && term.trim()) unsupported.push(term.trim());
    });
  }
  const needsClarification = [];

  let region = null;
  if (raw.region != null) {
    if (isValidTripRegion(raw.region)) {
      region = raw.region;
    } else {
      unsupported.push(`region: ${String(raw.region)}`);
      needsClarification.push('region');
    }
  } else {
    needsClarification.push('region');
  }

  let days = null;
  if (raw.days != null) {
    if (isValidTripDays(raw.days)) {
      days = raw.days;
    } else {
      needsClarification.push('days');
    }
  } else {
    needsClarification.push('days');
  }

  const interests = [];
  if (Array.isArray(raw.interests)) {
    raw.interests.forEach((value) => {
      if (isValidTripInterest(value)) interests.push(value);
      else unsupported.push(String(value));
    });
  }

  const amenities = [];
  if (Array.isArray(raw.amenities)) {
    raw.amenities.forEach((value) => {
      if (isValidTripAmenity(value)) amenities.push(value);
      else unsupported.push(String(value));
    });
  }

  const pace = isValidTripPace(raw.pace) ? raw.pace : 'standard';
  const budget = isValidTripBudget(raw.budget) ? raw.budget : null;

  const knownDiscoveryKinds = getKnownDiscoveryKinds();
  const discovery = [];
  if (Array.isArray(raw.discovery)) {
    raw.discovery.forEach((value) => {
      if (isValidTripDiscoveryKind(value, knownDiscoveryKinds)) discovery.push(value);
      else unsupported.push(String(value));
    });
  }

  return {
    ok: true,
    value: {
      region,
      days,
      interests,
      amenities,
      pace,
      budget,
      discovery,
      unsupported: Array.from(new Set(unsupported)),
      needs_clarification: needsClarification,
    },
  };
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

// Phase 2.1: builds schema.org OpeningHoursSpecification entries from the
// EXISTING venues.hours column only. Reads real stored data, generates
// nothing, invents nothing, calls nothing external.
//
// Expected shape of the parsed hours JSON (already in production use by
// the visible "Hours" section on venue pages):
//   { mon: [["09:00","17:00"]], tue: [], wed: null, ... , sun: [...] }
// - A day mapped to a non-empty array means one OpeningHoursSpecification
//   per [start, end] pair in that array (this is how split shifts, e.g.
//   lunch + dinner, are already represented).
// - A day mapped to null, an empty array, or simply absent all mean the
//   same thing: no opening period is generated for that day. This matches
//   how the existing HTML "Hours" rendering already treats these three
//   cases identically as "Closed".
// - Any per-day or per-range value that isn't in the expected shape is
//   skipped individually rather than aborting the whole venue, so one bad
//   entry can't take down the others or crash rendering.
// Returns undefined (not an empty array) when there's nothing valid to
// show, so the property is cleanly omitted from the schema object exactly
// like every other conditional field already in localBusiness.
const DAY_SCHEMA_NAMES = {
  mon: 'https://schema.org/Monday',
  tue: 'https://schema.org/Tuesday',
  wed: 'https://schema.org/Wednesday',
  thu: 'https://schema.org/Thursday',
  fri: 'https://schema.org/Friday',
  sat: 'https://schema.org/Saturday',
  sun: 'https://schema.org/Sunday',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const VALID_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/; // accepts "9:00" and "09:00" alike; output is always zero-padded

function normalizeTime(t) {
  const m = VALID_TIME.exec(t);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function buildOpeningHoursSpecification(hoursRaw) {
  if (!hoursRaw) return undefined;

  let hoursObj;
  try {
    hoursObj = JSON.parse(hoursRaw);
  } catch (e) {
    return undefined; // malformed JSON — omit rather than guess
  }
  if (!hoursObj || typeof hoursObj !== 'object') return undefined;

  const specs = [];
  for (const day of DAY_ORDER) {
    const ranges = hoursObj[day];
    if (!Array.isArray(ranges)) continue; // null, missing, or wrong type -> treated as closed, same as existing HTML rendering
    for (const range of ranges) {
      if (!Array.isArray(range) || range.length !== 2) continue; // malformed single entry -> skip just this one
      const opens = normalizeTime(range[0]);
      const closes = normalizeTime(range[1]);
      if (!opens || !closes) continue; // malformed time -> skip just this one
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAY_SCHEMA_NAMES[day],
        opens,
        closes,
      });
    }
  }

  return specs.length > 0 ? specs : undefined;
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

// venues.website is stored as whatever the source data gave -- often a
// bare domain like "shannonlakegolf.com" rather than a full URL (2026-09-
// 19 bug fix). Rendered as-is in an <a href>, a bare domain has no scheme,
// so the browser resolves it as a RELATIVE path against the current page
// instead of visiting the real external site (e.g. it became
// "/west-kelowna/golf/shannonlakegolf.com"). This normalizes it into an
// absolute https:// URL. An already-fully-qualified http(s):// URL is
// returned completely unchanged, never upgraded/rewritten.
function normalizeWebsiteUrl(website) {
  if (!website) return website;
  if (/^https?:\/\//i.test(website)) return website;
  const withScheme = `https://${website}`;
  // A bare domain with no path or query gets a trailing slash so it reads
  // as a complete URL ("shannonlakegolf.com" -> "https://shannonlakegolf.com/");
  // a domain that already has a path/query is left exactly as given.
  return /^https:\/\/[^/?]+$/.test(withScheme) ? `${withScheme}/` : withScheme;
}

function listGuideCombos(minCount) {
  // One row per region+badge combo that clears the venue-count threshold,
  // computed live from the DB so the guide/sitemap list grows automatically
  // as more venues get badges — no hardcoded list to fall out of date.
  const combos = [];
  for (const region of Object.keys(REGION_LABELS)) {
    for (const badge of BOOL_FIELDS) {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM venues WHERE region = ? AND ${badge} = 1 AND redirect_to IS NULL`)
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

  const hiddenGemIds = getHiddenGemVenueIds();
  const localFavouriteIds = getCollectionVenueIds('local_favorite');
  const cards = venues.map((v) => venueCardHtml(v, { showType: true, isHiddenGem: hiddenGemIds.has(v.id), isLocalFavourite: localFavouriteIds.has(v.id) })).join('\n');

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
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${region}` },
    { name: `${badgeInfo.title} Venues` },
  ])}
  <h1>${escapeHtml(badgeInfo.title)} Venues in ${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${venues.length} verified ${escapeHtml(badgeInfo.noun)} in ${escapeHtml(regionLabel)} — badge-checked from real listings, not guessed.</p>
  ${categoryLinksHtml}
  <ul class="card-grid">
    ${cards}
  </ul>
  <a class="cta" href="/${region}">See all of ${escapeHtml(regionLabel)} on Okanagan Roam</a>
  ${renderHomeFooterHTML(true)}
</body>
</html>`;
}

// ---------- Design Sprint 3: homepage discovery modules ----------
// All four follow the exact same server-side injection pattern already
// established by renderGuideFooterHTML/renderOpenNowScript/
// renderHiddenElementsScript below: small, self-contained HTML strings
// computed once per homepage request and spliced into the served
// okanagan.html. No new API endpoints, no new client-side fetches.

// Happening Soon (the homepage's own inline event strip) was removed
// from the homepage entirely on 2026-09-17 -- events now live at their
// own destination, /events (see renderEventsIndexPage() below), linked
// to from the What's On mood card. This function used to render that
// homepage-only strip; it's gone rather than kept-but-unused because it
// had no other caller and no direct test of its own (unlike
// hiddenGemHomepageCardHtml, which stayed for a real future use case).
// The underlying events table, individual event pages/routes
// (/:region/events/:slug), and event data are completely untouched.

// Content-model change (2026-09-17): the Hidden Gems homepage section
// moved from "3 real top-rated venues, picked live by rating" to 3 fixed
// editorial theme cards with their own dedicated photography. This is
// deliberate -- these three are themes (Dog-Friendly Finds/Local
// Favourites/Secret Spots), not individual venue spotlights, so they no
// longer point at a specific venue's canonical page (there isn't one
// venue behind a theme); all three link to #directory, the same anchor
// "View all hidden gems" and "Explore all categories" already use
// elsewhere on this page, so browsing is still one real, working click
// away. The underlying hidden_gem collection/membership data, the 6
// individually-approved gems, and their own venue pages are completely
// untouched -- see hiddenGemHomepageCardHtml()/HIDDEN_GEM_TYPE_IMAGE/
// HIDDEN_GEM_HOMEPAGE_BLURBS just below, kept defined and exported (still
// directly tested) even though the homepage no longer calls them.
const HIDDEN_GEM_EDITORIAL_CARDS = [
  {
    titleKey: 'gems.dogFriendly.title',
    title: 'Dog-Friendly Finds',
    blurbKey: 'gems.dogFriendly.blurb',
    blurb: 'Patios and trails where your dog belongs.',
    img: '/images/hidden-gems/dog-friendly.webp',
    // Repointed 2026-09-24 to the dedicated /dog-friendly hub, exactly the
    // way the Food & Drink mood card was repointed to /food-drink: an
    // explicit href here opts this ONE card out of the homepage route's
    // blanket href="#directory" -> href="/browse" rewrite. The other two
    // theme cards have no href and still resolve to /browse, and nothing
    // else about the Hidden Gems section -- markup, classes, imagery,
    // copy, order -- changes.
    href: '/dog-friendly',
  },
  {
    titleKey: 'gems.localFavourites.title',
    title: 'Local Favourites',
    blurbKey: 'gems.localFavourites.blurb',
    blurb: 'The spots locals keep coming back to.',
    img: '/images/hidden-gems/local-favourites.webp',
    // Repointed 2026-09-24 to the dedicated /local-favorites page, exactly
    // the way the Dog-Friendly Finds card was repointed: an explicit href
    // opts this ONE card out of the blanket href="#directory" -> "/browse"
    // rewrite. Nothing else about the Hidden Gems section changes.
    href: '/local-favorites',
  },
  {
    titleKey: 'gems.secretSpots.title',
    title: 'Secret Spots',
    blurbKey: 'gems.secretSpots.blurb',
    blurb: 'Quiet corners away from the crowds.',
    img: '/images/hidden-gems/secret-spots.webp',
    // Repointed 2026-09-25 to the dedicated /secret-spots page, exactly the
    // way the other two cards were repointed. Nothing else changes.
    href: '/secret-spots',
  },
];

function hiddenGemEditorialCardHtml(card) {
  // Same markup shape as the previous per-venue card (pin + title, blurb,
  // circular arrow, bottom scrim) so all of .hidden-gem-card's existing
  // CSS/responsive behaviour applies unchanged -- only the content source
  // changed, not the visual design. Localization fix (2026-09-17):
  // title/blurb previously had no i18n key at all -- data-i18n now lives
  // on a dedicated <span> around each, not the <h3>/<p> directly, since
  // the <h3> also contains the (aria-hidden, non-text) pin SVG as a
  // sibling -- textContent-based translation on the <h3> itself would
  // have wiped that icon out.
  return `<a class="hidden-gem-card" href="${card.href || '#directory'}">
    <img class="hidden-gem-card-img" src="${card.img}" width="640" height="196" alt="" loading="lazy">
    <span class="hidden-gem-card-scrim" aria-hidden="true"></span>
    <span class="hidden-gem-card-body">
      <h3><svg class="hidden-gem-card-pin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-7.5 7-12.5A7 7 0 0 0 5 8.5C5 13.5 12 21 12 21z"/><circle cx="12" cy="8.5" r="2.4"/></svg><span data-i18n="${card.titleKey}">${escapeHtml(card.title)}</span></h3>
      <p data-i18n="${card.blurbKey}">${escapeHtml(card.blurb)}</p>
    </span>
    <span class="hidden-gem-card-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
  </a>`;
}

function renderHiddenGemsHomepageHTML() {
  const cards = HIDDEN_GEM_EDITORIAL_CARDS.map(hiddenGemEditorialCardHtml).join('\n');

  return `
<section class="discover-section" id="hiddenGems">
  <div class="wrap-wide">
    <div class="discover-heading discover-heading-split">
      <h2><span data-i18n="gems.heading">Hidden Gems</span> <span class="discover-subtitle" data-i18n="gems.subtitle">Less crowds. More Okanagan.</span></h2>
      <a class="discover-heading-link" href="/hidden-gems" data-i18n="gems.viewAll">View all hidden gems &rarr;</a>
    </div>
    <div class="discover-grid hidden-gem-grid">${cards}</div>
  </div>
</section>`;
}

function renderExploreByCategoryHTML() {
  // One lightweight aggregate query — deliberately not per-category (which
  // would be N+1). Also serves a real correctness need: it tells us which
  // categories genuinely have at least one venue *and* which region is the
  // best real landing page for each, so a category with zero venues today
  // (e.g. Golf, currently) is skipped entirely rather than linking to a
  // category page that would 404.
  const rows = db.prepare(`
    SELECT type, region, COUNT(*) AS n
    FROM venues
    WHERE redirect_to IS NULL
    GROUP BY type, region
    ORDER BY n DESC
  `).all();

  const bestRegionForType = {};
  for (const row of rows) {
    if (!bestRegionForType[row.type]) bestRegionForType[row.type] = row.region;
  }

  const preferredOrder = ['restaurant', 'cafe', 'winery', 'brewery', 'pub', 'golf', 'cocktail'];
  const tiles = preferredOrder
    .filter((type) => bestRegionForType[type] && CATEGORY_SLUGS[type] && CATEGORY_LABELS[type])
    .map((type) => {
      const region = bestRegionForType[type];
      const label = CATEGORY_LABELS[type];
      const tagline = CATEGORY_TAGLINES[type]
        ? `<span class="tile-tagline">${escapeHtml(CATEGORY_TAGLINES[type])}</span>`
        : '';
      return `<a class="category-tile category-tile-${type}" href="/${region}/${CATEGORY_SLUGS[type]}"><span class="tile-label">${escapeHtml(label.plural)}</span>${tagline}</a>`;
    }).join('\n');

  if (!tiles) return '';

  return `
<section class="discover-section" id="exploreByCategory">
  <div class="wrap">
    <div class="discover-heading">
      <span class="eyebrow">Explore</span>
      <h2>Browse by category</h2>
    </div>
    <div class="category-tile-grid">${tiles}</div>
  </div>
</section>`;
}

function renderExploreRegionsHTML() {
  // Zero database queries — a curated subset of the existing, authoritative
  // REGION_LABELS taxonomy (no new destination schema, nothing invented).
  // Each card links straight to its real, existing /:region page -- no
  // new routes, no venue/database changes.
  //
  // Reference redesign (webpage design.png, decision #2): this exact set
  // of 6 -- Kelowna, West Kelowna, Lake Country, Penticton, Naramata,
  // Vernon -- replaces the earlier 8-region curated list, matching the
  // reference's featured destinations exactly. Oliver/Osoyoos/Summerland
  // keep their full region pages/data untouched elsewhere -- they simply
  // don't appear in this featured homepage section anymore. Card markup
  // is rewritten to a landscape name+arrow treatment (no tagline) to match
  // the reference; .region-card-tagline/REGION_TAGLINES are no longer used
  // by this section but are left defined since nothing else references
  // removing them. The reference has no "see all regions" link under the
  // grid (verified directly against webpage design.png) -- the section
  // ends right after the card row, so that link is removed rather than
  // kept pointing at a since-removed #directory anchor.
  const curated = ['kelowna', 'west-kelowna', 'lake-country', 'penticton', 'naramata', 'vernon'];
  const cardHtml = curated
    .filter((region) => REGION_LABELS[region])
    .map((region) => {
      return `<a class="region-card" href="/${region}">
      <img class="region-card-img" src="/images/regions/${region}.webp" width="640" height="250" alt="" loading="lazy">
      <span class="region-card-scrim" aria-hidden="true"></span>
      <span class="region-card-overlay">
        <span class="region-card-label">${escapeHtml(REGION_LABELS[region])}</span>
        <svg class="region-card-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </span>
    </a>`;
    });

  if (cardHtml.length === 0) return '';

  // "Explore All Okanagan Regions" (2026-09-17): the audit confirmed the
  // site's real data spans 20 routable regions (Enderby to Osoyoos, plus
  // several ski resorts), while this section deliberately only features 6
  // matching webpage design.png. This bridges the two -- reuses /browse,
  // the existing wizard's own region picker, which already lists all 20
  // (no new route). Layout correction (2026-09-17): two earlier attempts
  // put this INSIDE .region-card-grid (first as its own bordered tile,
  // then as a 7th grid item pinned above Vernon via a grid-column hack) --
  // both misaligned Vernon relative to the other 5 cards, since the grid
  // had to make room for a 7th item. Moved into the section's own heading
  // row instead, reusing the EXACT .discover-heading-split/
  // .discover-heading-link pattern "Hidden Gems"/"What are you in the mood
  // for?" already use for their own "View all hidden gems"/"Explore all
  // categories" links -- not a new component, and the .region-card-grid
  // below contains ONLY the unchanged 6 destination cards, so at 480px+
  // (tablet 3-col and desktop 6-col) all 6, including Vernon, stay one
  // perfectly aligned row.
  //
  // Responsive placement (2026-09-17, corrected same day): on the single-
  // column mobile stack (<480px) the heading-row link sits above the
  // whole grid, not specifically near Vernon. Rather than reintroduce a
  // visible 7th grid item (the earlier mistake that pushed Vernon out of
  // alignment), this renders a SECOND, mobile-only copy of the identical
  // link inside the grid's markup, positioned AFTER Vernon (the last
  // card) -- corrected from an earlier placement between Naramata and
  // Vernon, which put it above Vernon instead of below it as intended.
  // It is `display:none` at 480px+, so it is fully removed from grid
  // layout at every breakpoint that matters for alignment (tablet/
  // desktop) -- zero grid track is ever allocated to it there, and its
  // position in DOM order (now last) makes no difference at those widths
  // since it isn't rendered there at all. Below 480px, the grid is
  // already a single column, so it simply takes its own row in DOM
  // order, landing after Vernon. The heading-row instance is the mirror
  // image: visible at 480px+, `display:none` below it. Exactly one of
  // the two is ever visible/in the a11y tree at a time.
  // Localization fix (2026-09-17): both copies of this link, and the
  // section heading, previously had no i18n key at all.
  // Retargeted 2026-09-25 from /browse to /destinations (every region, then
  // that region's page). Only the href changed.
  const exploreAllHeadingLink = '<a class="discover-heading-link explore-all-link explore-all-link-heading" href="/destinations" data-i18n="explore.allRegions">Explore All Okanagan Regions &rarr;</a>';
  const exploreAllMobileLink = '<a class="discover-heading-link explore-all-link explore-all-link-mobile" href="/destinations" data-i18n="explore.allRegions">Explore All Okanagan Regions &rarr;</a>';
  cardHtml.push(exploreAllMobileLink);
  const cards = cardHtml.join('\n');

  return `
<section class="discover-section explore-section" id="exploreRegions">
  <div class="wrap-wide">
    <div class="discover-heading discover-heading-split">
      <h2 data-i18n="explore.heading">Explore by Destination</h2>
      ${exploreAllHeadingLink}
    </div>
    <div class="region-card-grid">${cards}</div>
  </div>
</section>`;
}

// Milestone 1 (approved homepage redesign): "What are you in the mood
// for?" -- six visual discovery cards immediately after the new hero.
// Eat/Drink reuse the existing wizard type-chip multi-select filter
// exactly as-is (see the "Mood cards" block in app.js, which presses the
// real .type-chip buttons and dispatches the existing wizard:showResults
// event) -- no new filtering system. Hidden Gems/Explore are plain anchor
// links into sections that already exist on this page (#hiddenGems,
// #exploreRegions); What's On links to the real /events page (2026-09-17
// -- previously an in-page anchor to the now-removed Happening Soon
// strip). Golf has no wizard
// chip on this codebase's filter UI, so it links directly to the real,
// existing golf category page for whichever region actually has golf
// venues -- reusing the exact same bestRegionForType aggregate query
// renderExploreByCategoryHTML() already runs, computed independently
// here since that function returns HTML, not data. If no golf venues
// exist at all in the current database, the card falls back to
// #directory (opens the wizard) rather than linking to a page that
// would 404 -- the card itself always renders; only its destination is
// conditional, since the six cards are a fixed design, not a
// data-driven list like Browse by Category.

// Milestone 3 (approved homepage redesign): "Build Your Perfect Okanagan
// Trip" -- a large immersive CTA, deliberately NOT a new itinerary
// builder. Zero database queries, zero new state: both buttons drive the
// real, already-working trip-tray (#tripTrayToggle/#tripTrayPanel,
// localStorage-backed, unchanged) and map (#mapToggleBtn/#mapPanel,
// Leaflet, unchanged) elements that already exist elsewhere on this page
// -- see the "Build Your Trip CTA" block in app.js for the few lines of
// orchestration (open the existing panel; don't reimplement it). No new
// trip data model, no new IDs for trip/map state.
// Visual QA pass: ONE continuous composition -- copy (bottom-left) ->
// travel photo (public/images/trip-cta.webp, the map/sunglasses/water-
// bottle picnic shot) -> soft dissolve -> a real, labeled editorial travel
// map (far right). Still a real, geographically-relative layout of the
// same 6 Explore by Destination places (not an abstract decorative
// graphic), and clicking it still opens the real interactive Leaflet
// #mapPanel.
//
// Geography fix (2026-09-17, reference re-match): webpage design.png's own
// Build Your Trip map is a real Google-Maps-style screenshot -- pale
// green/cream terrain, a thin blue Okanagan Lake (it genuinely renders
// that narrow at this zoomed-out scale -- the lake is ~135km long and
// only ~3-5km wide), subtle tan roads, small circular markers, and clean
// dark sans-serif labels with a white halo. Rebuilt from scratch to match
// that, and this time every coordinate is a real equirectangular
// projection of actual public lat/lon values (not eyeballed): x = (lon -
// lon0) * cos(lat0) * SCALE + offsetX, y = (lat0 - lat) * SCALE + offsetY,
// with lon0=-119.50, lat0=49.88, SCALE=203.1 -- the same scale for both
// axes so real angles/proportions aren't distorted. This reproduces the
// real relative geography (and the lake's real bend west through the
// Peachland/Summerland stretch before curving back east into Penticton)
// rather than an invented shape.
function renderBuildTripCTAHTML() {
  // Map visual replaced with a real, pre-made illustrated map image
  // (2026-09-17) -- the previous hand-built inline SVG (real
  // equirectangular-projected coordinates, procedurally drawn terrain/
  // roads/pins/labels) is fully removed, not layered underneath. The new
  // artwork itself is untouched; only this function's markup changed.
  return `
<section class="trip-cta-section" id="buildTrip">
  <div class="wrap-wide trip-cta-inner">
    <div class="trip-cta-visual" aria-hidden="true">
      <img class="trip-cta-img" src="/images/trip-cta.webp" width="1600" height="656" alt="" loading="lazy">
      <div class="trip-cta-scrim"></div>
    </div>
    <button type="button" class="trip-cta-map" id="tripCtaOpenMap" aria-label="Open the interactive map" data-i18n-aria="trip.openMap">
      <img class="trip-cta-map-img" src="/images/trip-cta-map.webp" width="1376" height="768" alt="" loading="lazy">
    </button>
    <div class="trip-cta-content">
      <span class="trip-cta-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/><circle cx="17" cy="9" r="1.4" fill="currentColor" stroke="none"/></svg></span>
      <h2 class="trip-cta-title" data-i18n="trip.title">Build Your Perfect Okanagan Trip</h2>
      <p class="trip-cta-lead" data-i18n="trip.lead">Tell us what you&rsquo;re looking for. We&rsquo;ll help build your adventure.</p>
      <p class="trip-cta-example" data-i18n="trip.example">&ldquo;I&rsquo;m in Kelowna for 3 days. I want golf, wineries, great food and patios, a beach, what&rsquo;s happening, and a few hidden gems.&rdquo;</p>
      <div class="trip-cta-actions">
        <button type="button" class="trip-cta-btn" id="tripCtaOpenTrip"><span data-i18n="trip.buildMyTrip">Build My Trip</span> <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </div>
    </div>
  </div>
</section>`;
}

// Content-change pass (2026-09-17): Food & Drink, Wine, Beaches, Golf,
// What's On, Outdoors. Hidden Gems is REMOVED from this mood-card row
// only -- its dedicated section (renderHiddenGemsHomepageHTML(), its own
// #hiddenGems anchor, heading, and cards) is untouched and still renders
// further down the homepage; nothing about the underlying Hidden Gems
// data/route/functionality changed. Wine is split back out of Food &
// Drink's filter into its own card (winery-only, reusing the same
// mood/drink.png photo already used as the Hidden Gems section's
// winery-type backdrop -- see HIDDEN_GEM_TYPE_IMAGE above).
//   Food & Drink -> existing .type-chip filter: restaurant/cafe/brewery/
//                   pub/cocktail (winery split back out to its own card)
//   Wine        -> existing .type-chip winery-only filter
//   Beaches     -> existing #exploreRegions anchor (no new "beach" venue
//                  type -- beaches are a destination trait, not a
//                  category in this taxonomy)
//   Golf        -> existing dynamic bestRegionForType category-page link,
//                  falling back to #directory (unchanged mechanism)
//   What's On   -> /events, the standalone events index page (2026-09-17
//                  -- previously an in-page anchor to the homepage's own
//                  Happening Soon strip, which has been removed entirely;
//                  event data/routes themselves are untouched)
//   Outdoors    -> Okanagan-wide /outdoors listing once outdoor venues
//                  exist (2026-09-20), else the #exploreRegions anchor
// Shared by renderMoodCardsHTML (Wine/Golf cards) and renderHomeFooterHTML
// (Wine/Golf footer links, 2026-09-17) -- both need "which region has the
// most venues of this type" to link straight to a real, populated category
// page instead of guessing a region. Extracted rather than duplicated so
// there's one query/definition of "best region for a type."
function bestRegionForCategoryType() {
  const rows = db.prepare(`
    SELECT type, region, COUNT(*) AS n
    FROM venues
    WHERE redirect_to IS NULL
    GROUP BY type, region
    ORDER BY n DESC
  `).all();
  const bestRegionForType = {};
  for (const row of rows) {
    if (!bestRegionForType[row.type]) bestRegionForType[row.type] = row.region;
  }
  return bestRegionForType;
}

function renderMoodCardsHTML() {
  const bestRegionForType = bestRegionForCategoryType();
  // Golf-wide fix (2026-09-19): unlike every other category, Golf venues
  // are deliberately spread across several regions (Kelowna, Vernon,
  // Osoyoos, Lumby, Enderby, Kaleden) rather than concentrated in one, so
  // the single-"best region" link every other mood card uses would only
  // ever surface one region's courses. Points at the Okanagan-wide /golf
  // listing instead (see the new bare-/:category route) whenever at least
  // one golf venue exists; falls back to /browse exactly as before when
  // there are none yet.
  const golfHref = bestRegionForType.golf && CATEGORY_SLUGS.golf ? `/${CATEGORY_SLUGS.golf}` : '/browse';
  const wineHref = '/wineries';
  // Beaches (2026-09-20): same pattern as Golf. Now that the Okanagan-wide
  // /beaches listing is live, the Beaches mood card points at it whenever
  // at least one beach venue exists; with no beach data it keeps its
  // previous in-page #exploreRegions target. Only the href changes -- the
  // card's markup, image, icon, title and position are untouched.
  const beachesHref = bestRegionForType.beach && CATEGORY_SLUGS.beach ? `/${CATEGORY_SLUGS.beach}` : '#exploreRegions';
  // Outdoors (2026-09-20): same pattern again. The card used to be a plain
  // in-page #exploreRegions anchor (a click just scrolled the homepage), so
  // once the Okanagan-wide /outdoors landing has inventory it links there;
  // with no outdoor venues it keeps the anchor. Only the href changes.
  const outdoorsHref = bestRegionForType.outdoor && CATEGORY_SLUGS.outdoor ? `/${CATEGORY_SLUGS.outdoor}` : '#exploreRegions';

  // Simple inline line icons, matching the approved reference's minimal
  // white-icon style. No icon library/dependency -- plain inline SVG,
  // same pattern already used for every other icon on this page (nav
  // socials, wizard filter icons, etc.).
  const ICONS = {
    'food-drink': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v7a2 2 0 0 0 4 0V3"/><path d="M9 10v11"/><path d="M17 3c-1.5 0-2 2-2 4s.5 4 2 4 2-2 2-4-.5-4-2-4z"/><path d="M17 11v10"/></svg>',
    wine: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 13v6"/><path d="M9 21h6"/></svg>',
    beaches: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0"/><path d="M2 21c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0"/><circle cx="16" cy="7" r="3"/></svg>',
    golf: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4l10 4-10 4"/></svg>',
    'whats-on': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>',
    outdoors: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 10 8l4 6 2-3 4 9z"/></svg>',
  };

  // Beaches has no real image file yet (see PLACEHOLDER_IMAGES.md for why
  // the only candidate found for it was rejected as a duplicate) --
  // deliberately left pointing at a not-yet-created path rather than
  // substituting another image; .mood-card's own background color (see
  // renderHomepageDiscoveryStyles()) keeps this card looking like a clean
  // branded placeholder rather than a broken/blank box in the meantime.
  // Localization fix (2026-09-17): Food & Drink and Beaches previously had
  // titleKey:null (no i18n at all, despite a since-corrected comment here
  // claiming otherwise) -- mood.foodDrink.title/mood.beaches.title now
  // give all six cards real TRANSLATIONS.en/.fr entries.
  const cards = [
    // Repointed 2026-09-24 to the dedicated /food-drink hub, the same way
    // Wine points at /wineries. data-mood-filter is left in place (as Wine's
    // is) purely so the attribute contract is unchanged: the mood grid only
    // renders on /, where app.js's handler returns early because there are no
    // .type-chip buttons, so the href is what navigates. /browse has the
    // chips but not this grid, and its markup is byte-identical.
    { key: 'food-drink', href: '/food-drink', filter: 'restaurant,cafe,brewery,pub,cocktail', img: '/images/mood/eat.webp', titleKey: 'mood.foodDrink.title', title: 'Food & Drink' },
    { key: 'wine', href: wineHref, filter: 'winery', img: '/images/mood/drink.webp', titleKey: 'mood.wine.title', title: 'Wine' },
    { key: 'beaches', href: beachesHref, filter: null, img: '/images/mood/beaches.webp', titleKey: 'mood.beaches.title', title: 'Beaches' },
    { key: 'golf', href: golfHref, filter: null, img: '/images/mood/golf.webp', titleKey: 'mood.golf.title', title: 'Golf' },
    { key: 'whats-on', href: '/whats-on', filter: null, img: '/images/mood/whats-on.webp', titleKey: 'mood.whatsOn.title', title: "What's On" },
    { key: 'outdoors', href: outdoorsHref, filter: null, img: '/images/mood/explore.webp', titleKey: 'mood.outdoors.title', title: 'Outdoors' },
  ];

  const cardsHtml = cards.map((c) => {
    const filterAttr = c.filter ? ` data-mood-filter="${c.filter}"` : '';
    const i18nAttr = c.titleKey ? ` data-i18n="${c.titleKey}"` : '';
    return `<a class="mood-card mood-card-${c.key}" href="${c.href}"${filterAttr}>
      <img class="mood-card-img" src="${c.img}" width="640" height="403" alt="" loading="lazy">
      <span class="mood-card-overlay">
        <span class="mood-card-icon" aria-hidden="true">${ICONS[c.key]}</span>
        <span class="mood-card-title"${i18nAttr}>${escapeHtml(c.title)}</span>
      </span>
    </a>`;
  }).join('\n');

  return `
<section class="discover-section mood-section" id="moodCards">
  <div class="wrap-wide">
    <div class="discover-heading discover-heading-split">
      <h2 data-i18n="mood.heading">What are you in the mood for?</h2>
      <a class="discover-heading-link" href="/categories" data-i18n="mood.exploreAll">Explore all categories &rarr;</a>
    </div>
    <div class="mood-card-grid">${cardsHtml}</div>
  </div>
</section>`;
}

// Authoritative region grouping for the footer's expanded Regions band
// (2026-09-17 revision) -- NOT a new taxonomy: reuses the exact same four
// groups/order/membership as the wizard's own Step 1 region chips
// (okanagan.html's #wizardStep1 filter-groups: Central/South/North/Ski
// resorts -- "Near"/"All regions" is a special chip there, not a real
// region, so it's excluded here), and REGION_LABELS for display text, the
// same map /:region routes are built from. All 20 real, routable regions
// -- none omitted.
// Order matches the approved FOOTER.png reference's explicit 2-subcolumn
// pairing: Central+South stack in the footer's left Regions subcolumn,
// North+Ski resorts stack in its right subcolumn (see renderHomeFooterHTML,
// which slices this array [0,2)/[2,4) rather than flowing it through a
// CSS multi-column auto-balance).
const FOOTER_REGION_GROUPS = [
  { labelKey: 'wizard.central', label: 'Central', regions: ['kelowna', 'west-kelowna', 'peachland', 'lake-country'] },
  { labelKey: 'wizard.south', label: 'South', regions: ['naramata', 'penticton', 'kaleden', 'okanagan-falls', 'summerland', 'oliver', 'osoyoos'] },
  { labelKey: 'wizard.north', label: 'North', regions: ['vernon', 'coldstream', 'lumby', 'armstrong', 'enderby'] },
  { labelKey: 'wizard.skiResorts', label: 'Ski resorts', regions: ['big-white', 'silverstar', 'apex', 'baldy'] },
];

// Homepage footer redesign (2026-09-17, revised again same day): replaces
// the static <footer> from okanagan.html on / ONLY -- /browse keeps
// serving that original static footer untouched (its own code path never
// calls this function), so this is fully scoped to the homepage per the
// approved design. Deliberately self-contained (home-footer-* classes,
// its own inline brand icon) rather than reusing the header's shared
// .logo/.logo-icon-badge/.logo-wordmark classes, so nothing here can ever
// affect the header. Every link reuses an existing, real route -- no new
// URLs invented:
//   Explore: the same 7 destinations the homepage's own mood cards already
//     link to (renderMoodCardsHTML) -- Food & Drinks/Beaches/Hidden Gems
//     have no dedicated page, so they reuse the mood cards' own targets
//     (a filtered /browse, the #exploreRegions anchor, the #hiddenGems
//     anchor) rather than inventing new ones. Wine/Golf reuse the exact
//     same "best-stocked region for this type" href the mood cards
//     compute (bestRegionForCategoryType, shared helper above). What's On
//     -> /events, same as the mood card and the nav.
//   About: App coming soon -> /browse#app (real anchor on /browse's
//     app-teaser section), List your venue -> /list-your-venue (the
//     submission page, 2026-09-25), List an Event -> /list-an-event (no
//     data-i18n key yet, so it stays English in FR), Contact -> the existing mailto link
//   Regions: ALL 20 real regions (FOOTER_REGION_GROUPS above), not a
//     curated subset -- grouped exactly like the wizard's own region
//     picker so a returning user recognizes the same four groups. This
//     revision folds it back INTO the 4-column row as its own column
//     (compact 2x2 sub-grid of the four groups) rather than a separate
//     full-width band, per explicit direction -- .home-footer-cols is
//     now an equal-width 4-column CSS grid specifically so Regions can't
//     visually dominate the row the way an auto-sized flex column would.
//   Social Media (renamed from "Follow"): Instagram/TikTok -> the
//     existing real profile URLs, Facebook stays the existing
//     non-clickable "coming soon" treatment.
// fromBrowse (2026-09-18, /browse redesign): this footer was written
// assuming it only ever renders on / , where #exploreRegions/#hiddenGems
// are real in-page anchors -- true for its original call site, but not
// for /browse, which has no such sections in its own DOM (a bare "#..."
// href there is simply a dead link, no scroll, no error). When rendered
// on /browse this flag redirects just those three links back to the
// homepage's own anchors (/#exploreRegions, /#hiddenGems) instead of
// leaving them dangling; every other link in this footer is already an
// absolute, context-independent URL and is unaffected either way.
function renderHomeFooterHTML(fromBrowse) {
  const bestRegionForType = bestRegionForCategoryType();
  // Golf-wide fix (2026-09-19): same reasoning as renderMoodCardsHTML()'s
  // identical golfHref -- Golf venues span multiple regions, so this links
  // to the Okanagan-wide /golf listing instead of one region's subset.
  const golfHref = bestRegionForType.golf && CATEGORY_SLUGS.golf ? `/${CATEGORY_SLUGS.golf}` : '/browse';
  const wineHref = '/wineries';
  const exploreRegionsHref = fromBrowse ? '/#exploreRegions' : '#exploreRegions';
  const hiddenGemsHref = fromBrowse ? '/#hiddenGems' : '#hiddenGems';
  // Outdoors (2026-09-20): the same gated destination as the homepage's
  // Outdoors mood card -- the Okanagan-wide /outdoors listing once outdoor
  // venues exist, otherwise the in-page anchor as before. Only this one
  // link's href changes; the footer's markup and every other link are untouched.
  const outdoorsHref = bestRegionForType.outdoor && CATEGORY_SLUGS.outdoor ? `/${CATEGORY_SLUGS.outdoor}` : exploreRegionsHref;

  // Two explicit subcolumns (FOOTER.png reference), not a CSS multi-column
  // auto-balance: subcol 1 = Central then South stacked; subcol 2 = North
  // then Ski resorts stacked. See the FOOTER_REGION_GROUPS comment above.
  const renderRegionGroup = (group) => {
    const links = group.regions
      .filter((region) => REGION_LABELS[region])
      .map((region) => `<li><a href="/${region}">${escapeHtml(REGION_LABELS[region])}</a></li>`)
      .join('\n');
    return `<div class="home-footer-region-group">
            <h5 data-i18n="${group.labelKey}">${escapeHtml(group.label)}</h5>
            <ul>${links}</ul>
          </div>`;
  };
  const regionSubcol1 = FOOTER_REGION_GROUPS.slice(0, 2).map(renderRegionGroup).join('\n');
  const regionSubcol2 = FOOTER_REGION_GROUPS.slice(2, 4).map(renderRegionGroup).join('\n');

  return `
<footer class="home-footer">
  <div class="wrap-wide home-footer-top">
    <div class="home-footer-brand">
      <a class="home-footer-logo" href="/" aria-label="Okanagan Roam home" data-i18n-aria="nav.homeAriaLabel">
        <span class="home-footer-icon" aria-hidden="true">
          <svg viewBox="0 0 60 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20 14 6l7 8 5-5 5 5"/><path d="M26 20 38 6l7 8 5-5 5 5"/></svg>
        </span>
        <span class="home-footer-wordmark">Okanagan<span class="home-footer-wordmark-accent"> Roam</span></span>
      </a>
      <p class="home-footer-tagline" data-i18n="homeFooter.taglineFull">Okanagan Valley, British Columbia</p>
    </div>
    <div class="home-footer-cols">
      <div class="home-footer-col">
        <h4 data-i18n="homeFooter.explore">Explore</h4>
        <ul>
          <li><a href="/food-drink" data-i18n="homeFooter.foodDrinks">Food &amp; Drinks</a></li>
          <li><a href="${wineHref}" data-i18n="mood.wine.title">Wine</a></li>
          <li><a href="/beaches" data-i18n="mood.beaches.title">Beaches</a></li>
          <li><a href="${golfHref}" data-i18n="mood.golf.title">Golf</a></li>
          <li><a href="/whats-on" data-i18n="mood.whatsOn.title">What&rsquo;s On</a></li>
          <li><a href="${outdoorsHref}" data-i18n="mood.outdoors.title">Outdoors</a></li>
          <li><a href="/hidden-gems" data-i18n="gems.heading">Hidden Gems</a></li>
        </ul>
      </div>
      <div class="home-footer-col">
        <h4 data-i18n="footer.about">About</h4>
        <ul>
          <li><a href="/browse#app" data-i18n="nav.appComingSoon">App coming soon</a></li>
          <li><a href="/list-your-venue" data-i18n="footer.listVenue">List your venue</a></li>
          <li><a href="/list-an-event">List an Event</a></li>
          <li><a href="mailto:okanaganroam@gmail.com" data-i18n="footer.contact">Contact</a></li>
        </ul>
      </div>
      <div class="home-footer-col home-footer-col-regions">
        <h4 data-i18n="footer.regions">Regions</h4>
        <div class="home-footer-region-groups">
          <div class="home-footer-region-subcol">${regionSubcol1}</div>
          <div class="home-footer-region-subcol">${regionSubcol2}</div>
        </div>
      </div>
      <div class="home-footer-col">
        <h4 data-i18n="homeFooter.socialMedia">Social Media</h4>
        <div class="home-footer-social-row">
          <a class="home-footer-social-icon icon-instagram" href="https://www.instagram.com/okanaganroam" target="_blank" rel="noopener" aria-label="Okanagan Roam on Instagram" data-i18n-aria="homeFooter.instagramAria">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
          </a>
          <span class="home-footer-social-icon icon-facebook" data-tooltip="Coming soon" title="Coming soon" aria-label="Facebook, coming soon" data-i18n-tooltip="homeFooter.comingSoon" data-i18n-title="homeFooter.comingSoon" data-i18n-aria="homeFooter.facebookAria">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 4h-2a4 4 0 0 0-4 4v3H6v4h3v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1h3z"/></svg>
          </span>
          <a class="home-footer-social-icon icon-tiktok" href="https://www.tiktok.com/@okanaganroam" target="_blank" rel="noopener" aria-label="Okanagan Roam on TikTok" data-i18n-aria="homeFooter.tiktokAria">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c0 2.5 2 4.5 4.5 4.5"/></svg>
          </a>
        </div>
      </div>
    </div>
  </div>
  <div class="wrap-wide home-footer-bottom">
    <p class="home-footer-copyright" data-i18n="homeFooter.copyright">&copy; 2026 Okanagan Roam. Built for the whole crew, dog included.</p>
  </div>
</footer>`;
}

// Canonical footer + floating Trip button styles (consolidated 2026-09-19):
// the SINGLE shared implementation of the approved home-footer-* markup's
// CSS and the body:not(.page-browse) trip-button restyle, used verbatim by
// the homepage (renderHomepageDiscoveryStyles), /trip (renderTripPlannerStyles),
// and every venue/region/category/guide/event page (SEO_PAGE_CSS/pageHead) --
// previously /trip carried only two stale, hand-copied patch rules and the
// SEO pages had no footer styling at all (siteFooter()'s plain one-liner).
// A future footer change now only needs to happen here.
function renderCanonicalFooterStyles() {
  return `
  /* Homepage footer redesign (2026-09-17, revised again same day): full-
     width navy band using the same --ref-navy/--ref-gold/--ref-cream
     system as the header/hero, replacing the old footer's --ink/--sand
     palette. Entirely new home-footer-* classes (see renderHomeFooterHTML()
     above) rather than the shared .logo/.foot-* classes the old footer
     used, and .wrap-wide (matching the rest of the redesigned homepage's
     content width) instead of the old footer's narrower .wrap. Scoped to
     / only -- /browse still renders the original static footer/CSS,
     untouched.
     The explicit padding:0 below is a deliberate fix, not a no-op: the
     OLD footer's own unscoped "footer" element-type selector rule
     (padding: 50px 0 36px, further down in this same stylesheet, written
     for the original static footer) still matches any footer element by
     tag, including this new one, since nothing here used to override it.
     A class selector already outranks a bare element-type selector
     regardless of source order, so this single declaration fully
     neutralizes that leak -- every bit of this footer's real spacing
     comes from its own child elements' padding instead
     (.home-footer-top/.home-footer-bottom). CAUTION FOR FUTURE EDITS: this
     whole CSS block is returned as a plain string by
     renderHomepageDiscoveryStyles() and spliced into the page's raw HTML,
     and the / route handler later locates the ORIGINAL static footer tag
     by a plain substring search on that same assembled HTML. Never spell
     that tag's opening or closing form, in angle brackets, anywhere in
     THIS comment block (or anywhere else inside this function's returned
     string) -- doing so once already produced a real, hard-to-spot bug:
     the search matched the mention inside this very comment instead of
     the real tag, and silently deleted every homepage section between
     that point and the real one when the footer was spliced in. */
  .home-footer {
    background: var(--ref-navy); color: var(--ref-cream); margin-top: 8px; padding: 0;
    /* Full-bleed fix (canonical footer consolidation, 2026-09-19): venue/
       region/category/guide/event pages set body{max-width:900px;
       margin:0 auto} (SEO_PAGE_CSS) so their own content reads as a
       comfortable single column -- but that same rule was also boxing in
       the footer, rendering it as a centered navy rectangle with visible
       page background on both sides instead of the homepage's true
       edge-to-edge band. This is the standard, well-known "break out of a
       max-width parent" technique: 100% of the *viewport*, recentered.
       calc(50% - 50vw) resolves to 0 (a no-op) whenever the containing
       block is already full viewport width -- true on / and /browse today
       -- so this is safe there regardless, not just on the narrower pages
       it's actually fixing. */
    width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw);
  }
  /* Compact pass (2026-09-19, approved footer refinement): the footer
     previously ran 72px/48px of top/bottom air around the columns plus a
     24-40px bottom band, reading as visually stretched. Tightened across
     desktop and both mobile breakpoints below -- gap/padding values only,
     no content removed, same column structure/links/order throughout. */
  .home-footer-top {
    display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;
    gap: 36px; padding: 40px 0 28px;
  }
  .home-footer-brand { display: flex; flex-direction: column; gap: 10px; max-width: 260px; flex-shrink: 0; }
  .home-footer-logo { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }
  .home-footer-icon { display: flex; align-items: center; justify-content: center; width: 34px; height: 14px; flex-shrink: 0; color: var(--ref-cream); }
  .home-footer-icon svg { width: 100%; height: 100%; }
  .home-footer-wordmark {
    font-family: 'Fraunces', serif; font-weight: 400; font-size: 1.3rem;
    letter-spacing: 0.02em; text-transform: uppercase; color: var(--ref-cream);
  }
  .home-footer-wordmark-accent { color: var(--ref-gold); }
  .home-footer-tagline { font-family: 'Nunito', sans-serif; font-size: 0.85rem; color: rgba(245,243,237,0.6); margin: 0; }
  /* Explicit request (2026-09-17 revision): Regions folded back INTO this
     row as its own 4th column rather than a separate full-width band
     below. Layout correction (same day, follow-up): a strict equal
     repeat(4,1fr) plus CSS Grid's default align-items:stretch forced
     every column to the height of the tallest one (Regions, 20 links) --
     found via direct measurement, all four .home-footer-col boxes were
     501px tall even though About's real content was only 155px and
     Social Media's only 34px, leaving large dead navy gaps under both.
     align-items:start fixes that -- each column now sizes to its own
     content; Regions being visibly the tallest column is expected and
     fine (it has by far the most real content) rather than a bug to hide.
     Column widths are now mildly (not dramatically) uneven rather than a
     strict 1fr each, giving Regions a little more room for its two-column
     region list and taking a little back from About/Social Media, which
     never needed a full equal share to begin with. */
  .home-footer-cols {
    display: grid; grid-template-columns: 1fr 0.9fr 2fr 1fr;
    align-items: start; gap: 28px; flex: 1; min-width: 0;
    /* Brand|Explore divider (FOOTER.png reference, 2026-09-19): matches the
       same rule as the 3 inter-column dividers below, just applied to the
       one seam that isn't between two .home-footer-col siblings (Brand is
       its own flex item, outside this grid). */
    border-left: 1px solid rgba(245,243,237,0.14);
    padding-left: 20px;
  }
  /* Clean vertical separators between the 4 major columns (approved
     footer refinement, 2026-09-19) -- a thin, low-opacity rule on every
     column after the first, inset with padding rather than margin so the
     line sits mid-gutter instead of hugging either column's text. */
  .home-footer-col + .home-footer-col {
    border-left: 1px solid rgba(245,243,237,0.14);
    padding-left: 20px;
  }
  .home-footer-col h4 {
    font-family: 'Nunito', sans-serif; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--ref-gold); margin: 0 0 12px; padding-bottom: 8px;
    display: inline-block; border-bottom: 2px solid var(--ref-gold);
  }
  .home-footer-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .home-footer-col a, .home-footer-region-group a {
    font-family: 'Nunito', sans-serif; font-size: 0.92rem; color: rgba(245,243,237,0.78);
    text-decoration: none; transition: color 0.15s;
  }
  .home-footer-col a:hover, .home-footer-region-group a:hover { color: var(--ref-gold); }

  /* Regions column (rebuilt 2026-09-19 to match the approved FOOTER.png
     reference exactly): TWO EXPLICIT subcolumns, each its own independent
     flex column -- subcol 1 stacks Central then South, subcol 2 stacks
     North then Ski resorts (see FOOTER_REGION_GROUPS/renderHomeFooterHTML).
     A same-row 2x2 CSS Grid was tried previously and rejected (Grid sizes
     a ROW to its tallest cell, so a short group got stretched to match a
     tall one beside it, leaving dead space) -- that failure mode doesn't
     apply here because these are two INDEPENDENT flex columns, not grid
     cells sharing a row: each one sizes purely to its own two groups'
     combined height, so North's longer list (5 items) simply makes
     subcolumn 2 start "Ski resorts" a little lower than subcolumn 1's
     "South" -- exactly the (intentional, not a bug) slight stagger visible
     in the reference image. */
  .home-footer-region-groups { display: flex; gap: 20px; }
  .home-footer-region-subcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  /* Region subsection headings (CENTRAL/NORTH/SOUTH/SKI RESORTS): gold,
     uppercase, bold, with the same small underline treatment as the main
     column headings (h4) so they read as clear subsection headings,
     distinct from the town links beneath them -- previously a muted,
     low-contrast cream at the same size as the links, which is exactly
     what made them hard to tell apart. Kept smaller than h4 (0.78rem)
     since these are one level down. */
  .home-footer-region-group h5 {
    font-family: 'Nunito', sans-serif; font-size: 0.7rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--ref-gold); margin: 0 0 8px; padding-bottom: 5px;
    display: inline-block; border-bottom: 1px solid var(--ref-gold);
  }
  .home-footer-region-group ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .home-footer-region-group a { font-size: 0.82rem; line-height: 1.3; }
  .home-footer-social-row { display: flex; gap: 10px; }
  .home-footer-social-icon {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(245,243,237,0.1); color: rgba(245,243,237,0.8);
    cursor: default; transition: background 0.15s, opacity 0.15s;
  }
  .home-footer-social-icon.icon-instagram {
    background: radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%);
    color: #fff; opacity: 1;
  }
  .home-footer-social-icon.icon-instagram:hover { opacity: 0.85; }
  .home-footer-social-icon.icon-facebook { background: #1877F2; color: #fff; opacity: 0.5; }
  .home-footer-social-icon.icon-tiktok { background: #010101; color: #25F4EE; opacity: 1; }
  .home-footer-social-icon.icon-tiktok:hover { opacity: 0.85; }
  .home-footer-social-icon::after {
    content: attr(data-tooltip);
    position: absolute; bottom: calc(100% + 8px); left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: var(--ref-navy-deep); color: var(--ref-cream);
    font-family: 'Nunito', sans-serif; font-size: 0.72rem; font-weight: 700;
    white-space: nowrap; padding: 5px 10px; border-radius: 8px;
    opacity: 0; pointer-events: none; z-index: 20;
    transition: opacity 0.12s, transform 0.12s;
  }
  .home-footer-social-icon:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }
  .home-footer-bottom { border-top: 1px solid rgba(245,243,237,0.14); padding: 16px 0 24px; }
  .home-footer-copyright { font-family: 'Nunito', sans-serif; font-size: 0.8rem; color: rgba(245,243,237,0.55); text-align: center; margin: 0; }

  /* Trip 0 button redesign, homepage-only (2026-09-17): #tripTray/
     #tripTrayToggle/#tripTrayCount are shared, site-wide rules defined in
     app.css (used as-is on /browse, untouched). This block itself is no
     longer homepage-exclusive (the /browse redesign, 2026-09-18, now
     injects it there too, to fix .hero-scenic/.hero-title/etc. having had
     zero CSS on /browse -- see the bug-fix comment on the /browse route
     handler), so these three selectors are explicitly scoped to
     body:not(.page-browse) (the marker only the /browse route sets) to
     keep the original "homepage-only" intent intact now that the block
     they live in is shared.

     2026-09-24 (UX polish pass): the body:not(.page-browse) scoping is GONE.
     It left /browse -- and only /browse -- on app.css's original plum/paper/
     amber toggle with the suitcase emoji, while every other page showed this
     navy/gold one, so the "floating Trip button" was effectively two different
     components depending on where you were. These rules are now unscoped and
     apply everywhere the tray renders. / is unaffected (it already matched the
     negation, and its computed styling is identical); only /browse changes, to
     match everything else. Direction: a small persistent "your trip"
     control, not a primary CTA -- smaller footprint, the homepage's own
     navy/cream/gold system instead of the old plum/paper/amber, a lighter
     shadow, and a smaller/quieter count badge, while leaving position
     (fixed, bottom corner, 20px from the edges -- already comfortable for
     tapping) and every bit of the click/expand/route/clear behavior
     untouched -- this only restyles the closed-state toggle and its
     count, never #tripTrayPanel (the expanded trip list keeps its
     existing look, on both pages). */
  #tripTrayToggle {
    background: var(--ref-navy); color: var(--ref-cream);
    border: 1px solid var(--ref-gold);
    border-radius: 999px; padding: 9px 16px; gap: 8px;
    font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 0.78rem;
    box-shadow: 0 4px 14px -6px rgba(16,27,36,0.45);
  }
  #tripTrayToggle:hover { background: var(--ref-navy-deep); }
  #tripTrayCount {
    background: var(--ref-gold); color: var(--ref-navy-deep);
    width: 16px; height: 16px; font-size: 0.62rem; font-weight: 800;
  }
  /* Suitcase-icon removal (approved refinement, 2026-09-19): the 🧳 emoji
     lives in the shared #tripTrayToggle markup in okanagan.html (reused
     as-is by /browse and /trip), wrapped in .trip-toggle-icon specifically
     so it can be hidden without touching that shared markup's actual
     content. Site-wide since the 2026-09-24 polish pass.
     .trip-toggle-arrow is an empty span in that same shared markup; on
     every other page it's simply an empty, invisible inline element, and
     only here does it get real content -- a small gold chevron, replacing
     the suitcase as a subtle "opens something" cue rather than an icon. */
  #tripTrayToggle .trip-toggle-icon { display: none; }
  #tripTrayToggle .trip-toggle-arrow::after {
    content: '\\2192'; margin-left: 1px; color: var(--ref-gold); font-weight: 800;
  }

  @media (max-width: 900px) {
    /* align-items:stretch override is required here: the base
       .home-footer-top rule sets align-items:flex-start for the desktop
       row layout, and that alone (even after flipping to
       flex-direction:column here) leaves .home-footer-cols sized to its
       own shrink-to-fit content width instead of the full row width --
       found via direct measurement (it was rendering at roughly half the
       viewport width instead of full width). */
    .home-footer-top { flex-direction: column; align-items: stretch; gap: 28px; padding: 32px 0 24px; }
    .home-footer-cols {
      grid-template-columns: repeat(2, 1fr); gap: 28px 24px;
      border-left: none; padding-left: 0;
    }
    /* The desktop vertical separators (both the Brand|Explore one above,
       via .home-footer-cols, and "every column after the first" below)
       only make sense in a single horizontal row. Once Brand stacks above
       a 2-per-row grid, a leftover border-left just reads as a stray
       vertical line down the block's edge; at 2-per-row, "every column
       after the first" would also draw a stray line on column 3 (first
       item of row 2), which sits below column 1, not beside column 2.
       Both removed here; the 560px single-column block below inherits
       this same removal. */
    .home-footer-col + .home-footer-col { border-left: none; padding-left: 0; }
  }

  @media (max-width: 560px) {
    /* Explicit stacking order requested (2026-09-17 revision): Explore,
       About, Regions, Social Media, one per row -- a single column at
       this width naturally stacks in the same DOM order the 4-column
       grid uses above, so no reordering is needed here. */
    .home-footer-cols { grid-template-columns: 1fr; gap: 28px; }

    /* Mobile-only tightening pass (2026-09-17, follow-up): the desktop
       spacing values (built for a 4-column row with lots of horizontal
       room) felt oversized once stacked into one long mobile column --
       measured at 1416px tall for the footer alone at 390px width before
       this pass. Nothing here changes desktop (all of it lives inside
       this max-width:560px block, and the desktop-facing base rules
       above are untouched) and no content/typography was removed or
       shrunk -- these are gap/margin/padding values only, still leaving
       comfortable breathing room between Explore/About/Regions/Social
       Media, just without the extra desktop-sized air baked into each
       one. */
    .home-footer-top { padding: 24px 0 20px; gap: 24px; }
    .home-footer-col h4 { margin-bottom: 10px; }
    .home-footer-col ul { gap: 8px; }
    .home-footer-region-groups { gap: 16px; }
    .home-footer-region-subcol { gap: 12px; }
    .home-footer-region-group h5 { margin-bottom: 6px; }
    .home-footer-region-group ul { gap: 5px; }

    /* Mobile centering pass (2026-09-17): the footer's desktop layout is a
       4-column row where every column is naturally left-aligned within
       its own cell -- fine side-by-side, but once everything stacks into
       one column on mobile it reads as hugging the left edge instead of
       feeling like a deliberate, centered composition. text-align:center
       cascades onto every heading/link/paragraph in the footer (brand
       wordmark+tagline, all four column headings, every Explore/About/
       Regions/Social Media link, the Regions sub-group headings too,
       since .home-footer-region-group lives inside a .home-footer-col).
       align-items:center on the flex/column lists shrinks each link/icon
       row to its own content width and centers that box too, rather than
       just centering text inside a still-full-width, left-edge-anchored
       link. None of this touches the desktop rules above -- same pattern
       as every other mobile-only override in this block. */
    .home-footer-top, .home-footer-col { text-align: center; }
    /* align-items:center alone isn't enough here: .home-footer-top keeps
       align-items:stretch (from the 900px block above, still in effect)
       because .home-footer-cols genuinely needs to stay full-width (see
       that fix's own comment). Stretch also applies to .home-footer-brand
       as a sibling flex item, which -- capped at max-width:260px -- ends
       up exactly 260px wide but still flush against the left edge
       (stretch sizes an item, it doesn't reposition it). margin:0 auto
       is what actually centers that fixed-width box within the full-
       width row; align-items:center then centers the logo+tagline inside
       the (now-centered) box itself. */
    .home-footer-brand { align-items: center; margin: 0 auto; }
    .home-footer-col ul, .home-footer-region-group ul { align-items: center; }
    .home-footer-social-row { justify-content: center; }

    /* Trip 0 button, mobile: slightly smaller still and pulled in a touch
       from the very edge, so it stays compact and never competes with
       page content on a narrow viewport, while remaining comfortably
       tappable (44px+ touch target maintained via padding, not shrunk
       text alone). */
    #tripTray { bottom: 16px; right: 16px; }
    #tripTrayToggle { padding: 7px 12px; font-size: 0.74rem; gap: 5px; }
    #tripTrayCount { width: 15px; height: 15px; font-size: 0.6rem; }

    /* #tripTray is a site-wide fixed element pinned bottom:20px/right:20px
       (~50px tall) -- at full scroll on narrow viewports it would
       otherwise float directly on top of this column's last row of
       links. Extra bottom padding keeps real clearance below the last
       row instead, so the fixed button always lands in empty space
       below the content, never over a link. Reduced from the earlier
       104px: re-measured after this tightening pass and confirmed (see
       session verification) that a smaller value still leaves the
       fixed button clear of every link/heading/icon/copyright at the
       real resting scroll position -- 104px had far more margin than
       was actually needed. */
    .home-footer-bottom { padding-bottom: 56px; }
  }`;
}

// Shared CSS for the four modules above — reuses the existing shared
// design tokens (/styles/tokens.css, already loaded by okanagan.html)
// rather than inventing a new palette. Injected once via a single <style>
// block alongside the HTML, not added to the SPA's own app.css file.
function renderHomepageDiscoveryStyles() {
  return `
<style>
  /* Reference redesign, forensic-comparison rebuild: section vertical
     rhythm tightened to the pixel-measured reference (each discovery
     section's heading+cards+gap fits in ~110-215px at the reference's
     1672px canvas width; the .wrap-wide content width here, 1312px, is
     within 2px of the reference's measured 1314px card-row width, so
     these pixel values translate almost directly rather than needing
     rescaling). */
  .discover-section { padding: 6px 0 16px; }
  .discover-heading-split { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .discover-heading-link {
    font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 0.85rem; color: var(--ref-navy);
    text-decoration: none; white-space: nowrap;
  }
  .discover-heading-link:hover { color: var(--ref-gold); }
  .discover-subtitle {
    font-family: 'Nunito', sans-serif; font-weight: 500; font-size: 0.85rem;
    color: rgba(42,32,25,0.6); margin-left: 10px; vertical-align: middle;
  }
  .discover-heading { margin-bottom: 10px; }
  .discover-heading .eyebrow {
    display:inline-flex; align-items:center; gap:8px; font-weight:700; font-size:0.82rem;
    letter-spacing:0.09em; text-transform:uppercase; color: var(--teal); margin-bottom:8px;
  }
  .discover-heading .eyebrow::before { content:""; width:20px; height:2px; background: var(--teal); display:inline-block; }
  .discover-heading h2 { font-family:'Fraunces',serif; font-size: clamp(1.2rem, 1.8vw, 1.45rem); margin:0; }

  .discover-strip, .discover-grid {
    display:flex; gap:16px; overflow-x:auto; padding-bottom:8px; list-style:none; margin:0;
  }
  .discover-card {
    flex: 0 0 240px; background: var(--paper); border-radius:14px; overflow:hidden;
    box-shadow: 0 10px 22px -16px var(--shadow, rgba(74,52,40,0.35));
    text-decoration:none; color: var(--ink); border: 1px solid rgba(74,52,40,0.08);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .discover-card:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -16px rgba(74,52,40,0.4); }
  .discover-card-media img { width:100%; height:120px; object-fit:cover; display:block; }
  .discover-card-body { padding:14px 16px; }
  .discover-card-date { font-size:0.78rem; font-weight:700; color: var(--teal-deep); margin-bottom:4px; }
  .discover-card-body h3 { font-family:'Fraunces',serif; font-size:1.02rem; margin:0 0 6px; line-height:1.25; }

  .discover-grid.card-grid { flex-wrap: nowrap; }

  /* Design Sprint 4: Hidden Gems homepage card. Replaces the previous
     reuse of venueCardHtml() here (that markup's h2/.venue-meta/.chips
     shape is still used correctly on category/guide pages elsewhere —
     only the *homepage* Hidden Gems presentation changes in this sprint).
     The compact band + gradient rules are generated once via
     compactBandCSSRules(), shared with SEO_PAGE_CSS's related/nearby
     cards rather than hardcoded twice. */
  /* Milestone 2 (Hidden Gems editorial redesign): moved from a
     horizontal-scroll strip of small cards to a static, larger-format
     grid, so the section reads as a curated feature rather than "more
     stuff to browse sideways." Rating is intentionally not shown at all
     (see hiddenGemHomepageCardHtml()) -- the region label is kept as a
     small, muted kicker line above the name, and the editorial blurb is
     given the most visual weight on the card. */
  /* Reference redesign, forensic-comparison rebuild: THREE cards in one
     wide-landscape row (measured ~3.26:1 aspect, ~427px x 131px at the
     reference's canvas width), replacing the earlier 6-card 3x2 portrait
     grid. No per-venue photography exists (every venue.image_url is empty
     for the approved gems), so each card's backdrop is its venue-type's
     real, already-approved mood-category image (see HIDDEN_GEM_TYPE_IMAGE
     above) -- never a fabricated photo of a specific business.
     compactVisualBandHtml()/compactBandCSSRules() remain defined and
     unchanged for their other caller (venue-page related/nearby cards). */
  .hidden-gem-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; flex-wrap: unset;
  }
  .hidden-gem-card {
    position: relative; display: block; text-decoration: none; color: #fff;
    border-radius: 12px; overflow: hidden; aspect-ratio: 3.26 / 1;
    box-shadow: 0 10px 22px -16px rgba(74,52,40,0.35);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .hidden-gem-card:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -16px rgba(74,52,40,0.4); }
  .hidden-gem-card:hover .hidden-gem-card-img { transform: scale(1.045); }
  .hidden-gem-card-img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    display: block; transition: transform .25s ease;
  }
  .hidden-gem-card-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(20,14,10,0.02) 40%, rgba(20,14,10,0.85) 100%);
  }
  .hidden-gem-card-body {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 1; padding: 14px 44px 14px 16px;
  }
  .hidden-gem-card-body h3 {
    display: flex; align-items: center; gap: 6px;
    font-family:'Fraunces',serif; font-size:1.05rem; margin:0 0 3px; line-height:1.2; color:#fff;
  }
  .hidden-gem-card-pin { flex-shrink: 0; }
  .hidden-gem-card-body p {
    font-size: 0.82rem; line-height: 1.4; margin: 0; color: rgba(255,255,255,0.85);
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  }
  .hidden-gem-card-arrow {
    position: absolute; bottom: 14px; right: 14px; z-index: 1;
    width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.92);
    color: var(--ref-navy); display: flex; align-items: center; justify-content: center;
  }

  .tile-label { display:block; }
  .tile-tagline {
    display:block; font-family:'Nunito',sans-serif; font-weight:500; font-size:0.76rem;
    color: rgba(42,32,25,0.62); margin-top:4px; line-height:1.35;
  }

  .category-tile-grid, .region-tile-grid {
    display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:12px;
  }
  .category-tile, .region-tile {
    display:flex; flex-direction: column; align-items:center; justify-content:center; text-align:center;
    background: var(--paper); border: 1.5px solid rgba(74,52,40,0.12); border-radius:12px;
    padding:18px 14px; font-weight:700; color: var(--ink); text-decoration:none;
    font-family:'Fraunces',serif; font-size:1.02rem;
    transition: border-color .15s ease, transform .15s ease;
  }
  .category-tile:hover, .region-tile:hover { border-color: var(--plum); transform: translateY(-2px); }

  /* Milestone 2 (Explore the Okanagan visual redesign): a fresh
     .region-card family, deliberately not reusing .region-tile/
     .category-tile, so Browse by Category's existing tiles are
     completely unaffected. Matches Milestone 1's mood-card visual
     language (full-bleed placeholder image, bottom gradient-scrim
     overlay, serif label) for a consistent premium feel across both
     sections. */
  /* Reference redesign (decision #2): landscape name+arrow cards (no
     tagline), replacing Milestone 2's portrait 4:5 tagline treatment.
     .region-card-tagline is kept defined (harmless, unused by this
     section's markup now) rather than removed, since nothing else
     references deleting it. */
  .region-card-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  .region-card {
    position: relative; display: block; border-radius: 10px; overflow: hidden;
    text-decoration: none; color: #fff;
    box-shadow: 0 10px 22px -16px rgba(74,52,40,0.4);
    aspect-ratio: 2.56 / 1;
  }
  .region-card-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s ease; }
  .region-card:hover .region-card-img { transform: scale(1.045); }
  .region-card-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(20,14,10,0) 45%, rgba(20,14,10,0.72) 100%);
  }
  .region-card-overlay {
    position: absolute; inset: 0; z-index: 1; display: flex; align-items: flex-end; justify-content: space-between;
    padding: 10px 12px; gap: 8px;
  }
  .region-card-label { font-family: 'Fraunces', serif; font-size: 0.95rem; font-weight: 700; display: block; }
  .region-card-tagline {
    display: block; font-family: 'Nunito', sans-serif; font-size: 0.82rem;
    margin-top: 4px; color: rgba(255,255,255,0.9); line-height: 1.4;
  }
  /* Reference redesign: the arrow is a plain white glyph with a soft drop
     shadow for legibility over the photo, not a solid circular badge
     (which is the Hidden Gems cards' own distinct treatment -- kept
     separate on purpose, see .hidden-gem-card-arrow). */
  .region-card-arrow {
    flex-shrink: 0; width: 18px; height: 18px; color: #fff;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
  }

  /* "Explore All Okanagan Regions" responsive placement (2026-09-17):
     two copies of the same link exist in the markup -- one in the
     section heading (.explore-all-link-heading), one inside the card
     grid between Naramata and Vernon (.explore-all-link-mobile). Below
     480px the grid is a single column, so the mobile copy is shown
     in-flow (landing between the two cards) and the heading copy is
     hidden. At 480px+ (tablet 3-col, desktop 6-col) it's the reverse:
     the mobile copy is set to display:none, which removes it from grid
     layout entirely -- no track is ever allocated to it -- so the 6
     cards stay one untouched, perfectly aligned row exactly as before. */
  .explore-all-link-mobile { display: block; }
  .explore-all-link-heading { display: none; }
  @media (min-width: 480px) {
    .explore-all-link-mobile { display: none; }
    .explore-all-link-heading { display: inline; }
  }


  /* Reference redesign, forensic-comparison rebuild: all 6 destination
     cards in ONE row at desktop (measured ~2.56:1 aspect each), replacing
     the earlier 1/2/3-column responsive grid that made each card much
     taller than the reference's short landscape strip. */
  @media (min-width: 480px) {
    .region-card-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (min-width: 900px) {
    .region-card-grid { grid-template-columns: repeat(6, 1fr); }
  }

  @media (max-width: 640px) {
    .discover-card { flex-basis: 200px; }
    .hidden-gem-grid { grid-template-columns: 1fr; gap: 12px; }
    .hidden-gem-card { aspect-ratio: 2.2 / 1; }
    .category-tile-grid, .region-tile-grid { grid-template-columns: repeat(2, 1fr); }
    .tile-tagline { font-size: 0.72rem; }
  }
  @media (min-width: 641px) and (max-width: 1099px) {
    .hidden-gem-grid { grid-template-columns: repeat(2, 1fr); }
    .hidden-gem-card { aspect-ratio: 2.4 / 1; }
  }

  /* Reference redesign, forensic-comparison rebuild: hero height/copy
     measured directly off webpage design.png (263px tall at 1672px width,
     one-line all-caps headline, one-line subhead, two-line search field)
     -- min-height and padding cut down accordingly instead of sizing
     around the old 4-line headline. */
  .hero-scenic {
    position: relative; overflow: hidden; color: #fff;
    min-height: 300px; display: flex; align-items: center;
  }
  .hero-media { position: absolute; inset: 0; z-index: 0; }
  .hero-media-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(20,14,10,0.10) 0%, rgba(20,14,10,0.55) 100%);
  }
  .hero-inner { position: relative; z-index: 1; padding: 28px 0; max-width: 760px; }
  .hero-title {
    font-family: 'Fraunces', serif; font-size: clamp(1.9rem, 3.6vw, 2.7rem);
    font-weight: 400; line-height: 1.1; margin: 0 0 10px; max-width: 22ch;
    text-transform: uppercase; letter-spacing: 0.01em;
    color: #fff; /* app.css's global h1,h2,h3,.display rule sets color:
                    var(--ink) directly on every h1, which otherwise wins
                    over the inherited white from .hero-scenic -- a
                    same-property declaration on the element itself beats
                    an ancestor's inherited value regardless of the
                    ancestor's specificity. */
  }
  /* Centered under the headline (2026-09-17): unlike the reference's
     short one-line subhead, this real copy is a full sentence -- left-
     aligned, it read as an unbalanced block hugging the hero column's
     left edge with empty space to its right. text-align:center handles
     the individual lines; margin:0 auto centers the whole block within
     .hero-inner (which is itself already horizontally centered on the
     page -- confirmed via direct measurement, not assumed), so the
     paragraph's center lines up with the headline's own column center,
     not just its left edge. max-width widened from 46ch to 54ch
     specifically for the centered layout -- the old, narrower 46ch
     produced a tall 4-line column that read as narrow/heavy once
     centered; 54ch reads as a shorter, wider, more balanced block while
     still stopping well short of the full hero-inner width (so it never
     stretches edge-to-edge). Font, size, line-height, and color
     untouched. */
  .hero-lead {
    font-family: 'Nunito', sans-serif; font-size: 1.05rem;
    line-height: 1.4; margin: 0 auto 16px; max-width: 54ch; color: rgba(255,255,255,0.92);
    text-align: center;
  }
  /* Mobile hero polish, pass 1 (2026-09-18): .hero-lead-mobile (the short,
     mobile-only supporting line) is hidden by default -- desktop/tablet
     show only .hero-lead-full, completely unchanged. The mobile media
     query below flips both, so exactly one of the two is ever visible at
     any width. */
  .hero-lead-mobile { display: none; }
  .hero-search-box {
    display: flex; align-items: center; max-width: 580px; background: rgba(255,255,255,0.97);
    border-radius: 999px; padding: 6px 6px 6px 20px; gap: 10px; box-shadow: 0 10px 26px -14px rgba(20,14,10,0.5);
  }
  .hero-search-icon { flex-shrink: 0; color: rgba(42,32,25,0.55); }
  .hero-search-field { position: relative; flex: 1; min-width: 0; }
  .hero-search-field input {
    width: 100%; border: none; background: transparent; padding: 9px 0;
    font-size: 0.95rem; color: var(--ink); outline: none; font-family: 'Nunito', sans-serif;
    position: relative; z-index: 1;
  }
  /* Faux two-line placeholder (bold prompt + smaller example line), CSS-
     only: hidden once the input has real content or focus, matching the
     reference's "What are you looking for? / Wineries, restaurants,
     hikes, beaches, hidden gems..." search field exactly. Both lines carry
     data-i18n like every other label on this page, so this has no i18n
     fallback risk. */
  .hero-search-faux {
    position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    z-index: 0; pointer-events: none; display: flex; flex-direction: column; justify-content: center;
    line-height: 1.25; width: 100%;
  }
  .hero-search-faux-main { font-weight: 700; font-size: 0.95rem; color: var(--ink); display: block; }
  .hero-search-faux-sub {
    font-weight: 400; font-size: 0.76rem; color: rgba(42,32,25,0.55); display: block;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .hero-search-field input:focus ~ .hero-search-faux,
  .hero-search-field input:not(:placeholder-shown) ~ .hero-search-faux { display: none; }
  .hero-search-box button {
    border: none; background: var(--ref-navy); color: #fff; border-radius: 999px;
    height: 42px; flex-shrink: 0; display: flex; align-items: center;
    padding: 0 24px; font-weight: 700; font-size: 0.9rem; font-family: 'Nunito', sans-serif;
    justify-content: center; cursor: pointer; transition: background-color .15s ease;
  }
  .hero-search-box button:hover { background: var(--ref-navy-deep); }

  /* /browse redesign (2026-09-18): the wizard's own #searchInput/#searchBtn
     box renders immediately below this hero on /browse (unlike /, which no
     longer has a wizard at all) and the hero box only ever proxies into it
     (see the heroSearchForm submit handler in app.js) -- so on /browse
     specifically, hide this visual duplicate rather than show two search
     boxes stacked on top of each other. body.page-browse is set only by
     the /browse route handler; / is unaffected. */
  body.page-browse .hero-search-box { display: none; }

  @media (max-width: 640px) {
    /* Mobile hero polish, pass 1 (2026-09-18): the mobile hero was reading
       as the desktop hero compressed into a phone -- taller than the
       desktop base (380px vs. desktop's own 300px min-height) despite
       showing less content, with generous desktop-scale padding on top.
       Brought back in line with (not beyond) the desktop min-height, and
       inner padding tightened, so the whole section reads as deliberately
       sized for mobile and the handoff into "What are you in the mood
       for?" happens sooner. */
    .hero-scenic { min-height: 300px; }
    .hero-inner { padding: 22px 0; max-width: 100%; }
    /* Headline (2026-09-18): the prior 14.625px pass (two successive -25%
       cuts from the original 26px) went smaller than legible hierarchy
       could support -- re-evaluated per direction against a 16-18px
       target rather than continuing to shrink it. 17px, the middle of
       that range, is the smallest bump off 14.625px that reads as a
       confident, intentional mobile headline size rather than a
       compressed desktop one; margin-bottom tightened from 12px to 8px
       to pull the lead paragraph closer underneath it (tighter vertical
       rhythm, same request as the hero-inner padding above). text-
       align:center here is homepage-hero-specific -- .hero-title has no
       text-align at wider widths (reads left-to-right in its own
       centered column instead, per the desktop hero layout, untouched). */
    .hero-title { max-width: 100%; font-size: 17px; text-align: center; margin: 0 0 8px; padding: 0 8px; }
    /* Mobile supporting copy (2026-09-18): swaps the long desktop
       paragraph (.hero-lead-full, completely unchanged, hidden here) for
       the short mobile-only one (.hero-lead-mobile, hidden everywhere
       else -- see the base .hero-lead-mobile rule above). Sized down from
       the desktop 1.05rem and given a tighter bottom margin, matching the
       same "tighten vertical spacing" direction as the headline above. */
    .hero-lead-full { display: none; }
    .hero-lead-mobile { display: block; font-size: 0.92rem; line-height: 1.4; margin: 0 auto 14px; max-width: 90%; }
    /* Search box (2026-09-18): slightly smaller footprint so it no longer
       dominates the now-shorter hero -- button height 42px->38px, box
       padding trimmed to match. 38px (plus the box's own vertical
       padding) keeps a real ~44px+ tappable row, so this stays a "keep it
       easy to tap" reduction, not a functional regression -- no markup,
       search behavior, or desktop sizing changed. */
    .hero-search-box { max-width: 100%; padding: 5px 5px 5px 16px; }
    .hero-search-field input { padding: 7px 0; }
    .hero-search-box button { height: 38px; padding: 0 20px; }
    .hero-search-faux-sub { display: none; }
  }

  /* Six equal-treatment landscape mood cards (~1.59:1, matching the
     reference's measured proportions) -- Food & Drink/Beaches/Golf/
     What's On/Outdoors/Hidden Gems, per the explicit visual-QA category
     list (see renderMoodCardsHTML()). Desktop: one row of six. Mobile:
     horizontal scroll-snap strip. */
  .mood-card-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  }
  .mood-card {
    position: relative; display: block; border-radius: 10px; overflow: hidden;
    text-decoration: none; color: #fff; aspect-ratio: 1.59 / 1;
    box-shadow: 0 10px 22px -16px rgba(74,52,40,0.4);
    /* Fallback for a missing image (Beaches, currently) -- a clean
       on-brand navy fill behind the icon/label rather than a blank or
       broken-looking box. */
    background: var(--ref-navy);
  }
  .mood-card-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s ease; }
  .mood-card:hover .mood-card-img { transform: scale(1.045); }
  .mood-card-overlay {
    position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end;
    padding: 12px; background: linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(20,14,10,0.78) 100%);
  }
  .mood-card-icon { color: #fff; opacity: 0.95; margin-bottom: 4px; }
  .mood-card-icon svg { display: block; width: 18px; height: 18px; }
  .mood-card-title { font-family: 'Fraunces', serif; font-size: 0.92rem; font-weight: 700; display: block; }

  @media (min-width: 720px) {
    .mood-card-grid { grid-template-columns: repeat(6, 1fr); }
  }

  @media (max-width: 640px) {
    .mood-card-grid {
      display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; padding-bottom: 4px;
    }
    .mood-card { flex: 0 0 46%; scroll-snap-align: start; aspect-ratio: 1.59 / 1; }
  }

  /* Reference redesign, forensic-comparison rebuild (supersedes the
     earlier 3-column split): ONE continuous full-bleed dark navy band --
     icon/heading/paragraph/single CTA on the left, a photo blending into
     a labeled schematic map (see renderBuildTripCTAHTML()) on the right --
     matching the reference's actual structure instead of three separate
     boxed cards on a light background. */
  /* Visual QA pass rebuild: ONE continuous composition instead of three
     boxed regions. .trip-cta-visual (photo) and .trip-cta-map both sit as
     absolutely-positioned layers filling the same box; .trip-cta-content
     is the only normal-flow child, so align-items:flex-end on the
     container alone puts it bottom-left without needing its own absolute
     positioning. The map's left edge is masked transparent-to-opaque so
     it visually dissolves out of the photo rather than butting against it
     as a hard rectangle. */
  .trip-cta-section { padding: 8px 0 36px; }
  .trip-cta-inner {
    position: relative; background: var(--ref-navy-deep); border-radius: 20px; overflow: hidden;
    display: flex; align-items: flex-end; min-height: 400px;
  }
  .trip-cta-visual { position: absolute; inset: 0; z-index: 0; }
  .trip-cta-img { width: 100%; height: 100%; object-fit: cover; object-position: center 38%; display: block; }
  .trip-cta-scrim {
    position: absolute; inset: 0;
    /* Dark on the left (where the copy sits) fading to fully clear by
       ~58% width, so the photo itself reads clean through the center. */
    background: linear-gradient(90deg, rgba(16,27,36,0.95) 0%, rgba(16,27,36,0.8) 26%, rgba(16,27,36,0.25) 48%, rgba(16,27,36,0) 60%);
  }
  .trip-cta-map {
    position: absolute; top: 0; right: 0; bottom: 0; width: 40%; z-index: 1;
    border: none; padding: 0; margin: 0; cursor: pointer; overflow: hidden; display: block;
  }
  .trip-cta-map-img {
    width: 100%; height: 100%; display: block; object-fit: cover;
    /* The soft dissolve: fully transparent at the map's own left edge,
       fully opaque by 42% across it, so the photo underneath shows
       through and the map gradually emerges rather than appearing as a
       hard-edged box. */
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 42%);
    mask-image: linear-gradient(90deg, transparent 0%, black 42%);
  }
  .trip-cta-content { position: relative; z-index: 2; max-width: 460px; padding: 40px 24px 40px 44px; color: #fff; }
  .trip-cta-icon { display: inline-flex; color: var(--ref-gold); margin-bottom: 14px; }
  .trip-cta-title {
    font-family: 'Fraunces', serif; font-size: clamp(1.4rem, 2.2vw, 1.8rem);
    line-height: 1.2; margin: 0 0 10px; color: #fff;
  }
  .trip-cta-lead {
    font-family: 'Nunito', sans-serif; font-size: 0.95rem; line-height: 1.5;
    margin: 0 0 14px; color: rgba(255,255,255,0.9); max-width: 38ch;
  }
  .trip-cta-example {
    font-family: 'Nunito', sans-serif; font-style: italic; font-size: 0.86rem; line-height: 1.5;
    margin: 0 0 22px; padding-left: 14px; border-left: 2px solid var(--ref-gold);
    color: rgba(255,255,255,0.72); max-width: 40ch;
  }
  .trip-cta-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
  .trip-cta-btn {
    border: none; background: var(--ref-white); color: var(--ref-navy-deep); font-weight: 700;
    font-family: 'Nunito', sans-serif; font-size: 0.9rem; padding: 13px 24px;
    border-radius: 999px; cursor: pointer; transition: background-color .15s ease;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .trip-cta-btn:hover { background: var(--ref-cream); }

  @media (max-width: 900px) {
    /* Mobile-only simplification (2026-09-17): the photo band (the
       sunglasses/table/compass travel photo, .trip-cta-visual) and the
       schematic map graphic layered over it (.trip-cta-map) are both
       hidden below 900px, leaving just the text/CTA content panel on a
       clean solid background -- desktop (>900px, untouched below this
       query) keeps the full side-by-side photo+map+content layout
       exactly as before. padding-top:0 removes the space that used to
       be reserved for that now-hidden photo band, so nothing empty is
       left behind -- the content panel simply starts at the top of the
       card. .trip-cta-inner's own base background (--ref-navy-deep,
       unconditional, not part of this media query) shows through
       cleanly now that the photo layer covering it is gone. */
    .trip-cta-inner { min-height: 0; border-radius: 16px; padding-top: 0; }
    .trip-cta-visual, .trip-cta-map { display: none; }
    .trip-cta-content { max-width: 100%; width: 100%; padding: 24px; background: rgba(16,27,36,0.94); }
  }

  /* Milestone 3: Browse/Search de-emphasis heading. Purely additive --
     the wizard's own markup/behavior right below this is unchanged. Same
     discover-heading language as every other section, so this reads as a
     natural next section rather than a distinct "command bar".
     /browse redesign harmonization pass (2026-09-18): this whole rule
     block was dead CSS until now -- it targets .browse-search-heading,
     which only ever appears on /browse, but this entire <style> block
     (renderHomepageDiscoveryStyles()) was only ever spliced into /'s own
     response (see the bug-fix comment on the /browse route handler
     above). Recolored from --teal to the --ref-* tokens here (not in
     app.css, where a duplicate rule would otherwise silently lose this
     cascade tie -- same specificity, and this inline block's source
     position, inside <body>, is always later than app.css's <link> in
     <head>) now that it actually reaches the page. */
  .browse-search-heading { margin-bottom: 16px; }
  .browse-search-heading .eyebrow {
    display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.82rem;
    letter-spacing: 0.09em; text-transform: uppercase; color: var(--ref-gold); margin-bottom: 8px;
  }
  .browse-search-heading .eyebrow::before { content: ""; width: 20px; height: 2px; background: var(--ref-gold); display: inline-block; }
  .browse-search-heading h2 {
    font-family: 'Fraunces', serif; font-size: clamp(1.4rem, 2.4vw, 1.8rem); margin: 6px 0 8px; color: var(--ref-navy);
  }
  .browse-search-lead {
    font-family: 'Nunito', sans-serif; font-size: 0.95rem; color: rgba(27,43,58,0.72); margin: 0;
  }
${renderCanonicalFooterStyles()}
</style>`;
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
// Phase 5 Sprint 1: recolored to reference the shared design tokens
// (loaded via the <link rel="stylesheet" href="/styles/tokens.css"> that
// pageHead() now emits) instead of this block's own, previously
// disconnected hardcoded palette. Layout/structure is unchanged — this is
// the "single source of truth for styling" step; the full Sprint 2 visual
// redesign of these templates is separate, later work.
const SEO_PAGE_CSS = `
  :root { color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 900px; margin: 0 auto; padding: 28px 20px 72px;
    color: var(--ink); background: var(--sand); line-height: 1.65;
  }
  a { color: var(--teal-deep); }
  a:hover { color: var(--teal); }

  header.top {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 16px; margin-bottom: 24px;
    border-bottom: 1px solid rgba(74,52,40,0.14);
  }
  header.top a.brand {
    font-family: 'Fraunces', serif; font-weight: 700; letter-spacing: -0.01em;
    text-decoration: none; color: var(--ink); font-size: 1.2rem;
  }
  header.top a:not(.brand) {
    font-size: 0.86rem; font-weight: 700; color: var(--teal-deep); text-decoration: none;
  }
  header.top a:not(.brand):hover { text-decoration: underline; }

  nav.breadcrumb {
    font-size: 0.8rem; color: var(--ink); opacity: 0.62;
    margin-bottom: 22px; letter-spacing: 0.01em;
  }
  nav.breadcrumb a { color: var(--teal-deep); text-decoration: none; opacity: 1; }
  nav.breadcrumb a:hover { text-decoration: underline; }

  h1 {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 2rem;
    line-height: 1.15; letter-spacing: -0.01em; margin: 0 0 6px;
  }
  .subtitle { color: var(--ink); opacity: 0.66; font-size: 1.02rem; margin: 0 0 26px; }

  .card-grid { padding: 0; margin: 0; }
  .venue-card, .category-card {
    list-style: none; background: var(--paper);
    border: 1px solid rgba(74,52,40,0.10); border-radius: 14px;
    padding: 18px 20px; margin-bottom: 14px;
    box-shadow: 0 8px 20px -16px rgba(74,52,40,0.35);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .venue-card h2, .category-card h2 {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.12rem; margin: 0 0 5px;
  }
  .venue-card h2 a, .category-card h2 a { color: var(--ink); text-decoration: none; }
  .venue-card h2 a:hover, .category-card h2 a:hover { color: var(--plum); text-decoration: underline; }
  .venue-meta { color: var(--ink); opacity: 0.62; font-size: 0.86rem; margin: 0 0 10px; }
  .venue-card p, .category-card p { margin: 0 0 10px; font-size: 0.95rem; color: var(--ink); opacity: 0.85; }
  /* Golf-only (2026-09-19): collapsed description + Read more toggle. The
     clamp class is added by the page script, so without JS the full text
     shows and the button stays hidden. Line-clamp is line-based, so the
     "about four lines" holds at every viewport width. */
  .golf-desc p { margin: 0 0 6px; }
  .golf-desc.is-clamped p {
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
    overflow: hidden; max-height: calc(4 * 1.55em);
  }
  .desc-toggle {
    background: none; border: 0; padding: 0; margin: 0 0 10px; cursor: pointer;
    font: inherit; font-size: 0.9rem; font-weight: 700; color: var(--plum);
  }
  .desc-toggle:hover { text-decoration: underline; }
  .desc-toggle:focus-visible { outline: 2px solid var(--plum); outline-offset: 3px; border-radius: 4px; }
  .desc-toggle[hidden] { display: none; }
  /* Golf-only: one action row (Website, Call, Favorite, Add to Trip)
     directly under the badge chips, divided from the description by a
     hairline so chips + actions read as the card's single "info & actions"
     block. Pill styling mirrors the homepage's .trip-btn/.fav-btn
     (public/styles/app.css) so the controls read as the same feature. */
  .venue-card[data-venue-category="golf"] .chips:empty { display: none; }
  .venue-card[data-venue-category="golf"] .chips:not(:empty) {
    margin: 10px 0 0; padding-top: 10px; border-top: 1px solid rgba(74,52,40,0.10);
  }
  .venue-card[data-venue-category="golf"] .card-actions {
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(74,52,40,0.10);
  }
  .venue-card[data-venue-category="golf"] .chips:not(:empty) + .card-actions {
    margin-top: 8px; padding-top: 0; border-top: 0;
  }
  .venue-card[data-venue-category="golf"] .card-action {
    display: inline-flex; align-items: center; gap: 5px; margin: 0;
    font-size: 0.82rem; font-weight: 700; font-family: 'Nunito', sans-serif; line-height: 1.4;
    color: var(--ink); background: var(--sand-deep); border: none; text-decoration: none;
    border-radius: 999px; padding: 5px 12px; cursor: pointer; width: fit-content;
    transition: background 0.15s;
  }
  .venue-card[data-venue-category="golf"] .card-action:hover { background: rgba(224,169,78,0.35); color: var(--ink); text-decoration: none; }
  .venue-card[data-venue-category="golf"] .card-action:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
  .venue-card[data-venue-category="golf"] .trip-btn.in-trip { background: var(--teal, #2A6B67); color: var(--paper); }
  .venue-card[data-venue-category="golf"] .fav-btn.is-fav { background: var(--plum); color: var(--paper); }
  .venue-card[data-venue-category="golf"] .trip-notice { margin: 8px 0 0; font-size: 0.85rem; color: var(--plum); }
  .venue-card[data-venue-category="golf"] .trip-notice:empty { display: none; }

  .chips { display: flex; flex-wrap: wrap; gap: 7px; }
  .chip {
    background: var(--sand-deep); color: var(--plum); font-weight: 700;
    font-size: 0.74rem; letter-spacing: 0.01em; padding: 4px 11px; border-radius: 999px;
  }
  /* Hidden Gem badge gets its own visual identity, distinct from ordinary
     amenity chips — same underlying .chip base (per Sprint 3), extended
     here with a warmer, gold-leaning treatment so it reads as editorial
     curation rather than a factual attribute. */
  .chip.hidden-gem-badge {
    background: var(--amber); color: var(--plum-dark);
    box-shadow: inset 0 0 0 1px rgba(74,52,40,0.12);
  }
  .chip.local-favourite-badge {
    background: var(--teal, #2A6B67); color: var(--paper);
    box-shadow: inset 0 0 0 1px rgba(74,52,40,0.12);
  }

  /* Region selector for Okanagan-wide category pages (e.g. /golf) --
     reuses the .chip pill visual language above so it reads as part of
     the same design system rather than a bolted-on control. Shared by
     any future category's wide page, not styled per-category. */
  .category-region-selector {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    margin: 0 0 26px;
  }
  .category-region-selector a,
  .category-region-selector-active {
    display: inline-block; padding: 6px 15px; border-radius: 999px;
    font-size: 0.84rem; font-weight: 700; letter-spacing: 0.01em;
    text-decoration: none;
  }
  .category-region-selector-active {
    background: var(--plum); color: var(--paper);
  }
  .category-region-selector a {
    background: var(--sand-deep); color: var(--plum);
  }
  .category-region-selector a:hover {
    background: var(--plum); color: var(--paper);
  }

  /* Back-link on a category's single-region page (e.g. /kelowna/golf)
     to its Okanagan-wide page (e.g. /golf) -- only categories in
     ALL_REGIONS_CATEGORIES render this, since it's the only case where
     an Okanagan-wide page actually exists to link back to. */
  .category-back-link {
    display: inline-block; margin: 0 0 14px; font-size: 0.86rem;
    font-weight: 700; color: var(--teal-deep); text-decoration: none;
  }
  .category-back-link:hover { text-decoration: underline; }

  /* Subsection heading used to split a single category's venues into
     groups (e.g. Golf Courses vs. Indoor Golf & Simulators) -- reuses
     the same treatment as .related-section h2 for visual consistency. */
  .category-subsection-heading {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.3rem;
    margin: 30px 0 14px;
  }
  .category-subsection-heading:first-of-type { margin-top: 6px; }

  .related-section { margin-top: 40px; }
  .related-section h2 {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.25rem; margin-bottom: 14px;
  }
  .related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .related-card {
    background: var(--paper); border: 1px solid rgba(74,52,40,0.10);
    border-radius: 12px; padding: 12px 14px;
    box-shadow: 0 6px 16px -14px rgba(74,52,40,0.35);
  }
  .related-card a { font-weight: 700; text-decoration: none; color: var(--ink); }
  .related-card a:hover { color: var(--plum); }
  .related-card .related-meta { font-size: 0.8rem; color: var(--ink); opacity: 0.62; }

  .detail-row {
    display: flex; gap: 10px; margin: 0; padding: 9px 0; font-size: 0.95rem;
    border-bottom: 1px solid rgba(74,52,40,0.08);
  }
  .detail-row:last-of-type { border-bottom: none; }
  .detail-row .label {
    color: var(--ink); opacity: 0.58; min-width: 100px; font-weight: 700;
    font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; padding-top: 2px;
  }

  .cta {
    display: inline-block; margin-top: 28px; margin-right: 10px;
    background: var(--plum); color: var(--paper); text-decoration: none;
    padding: 12px 24px; border-radius: 9px; font-weight: 700; font-size: 0.92rem;
    transition: background 0.15s ease;
  }
  .cta:hover { background: var(--plum-dark); color: var(--paper); }
  .cta.secondary {
    background: var(--paper); color: var(--plum); border: 1.5px solid var(--plum);
  }
  .cta.secondary:hover { background: var(--sand-deep); color: var(--plum); }

  .hours-list { list-style: none; padding: 0; margin: 6px 0 0; font-size: 0.92rem; }
  .hours-list li {
    display: flex; justify-content: space-between; max-width: 280px;
    padding: 4px 0; border-bottom: 1px dotted rgba(74,52,40,0.14);
  }
  .hours-list li:last-child { border-bottom: none; }

  footer.site-footer {
    margin-top: 48px; padding-top: 20px;
    border-top: 1px solid rgba(74,52,40,0.14);
    font-size: 0.85rem; color: var(--ink); opacity: 0.62;
  }
  footer.site-footer a { color: var(--teal-deep); }

  /* ---- Design Sprint 2: richer venue pages ---- */
  .venue-hero {
    border-radius: 16px; overflow: hidden; margin-bottom: 24px;
    box-shadow: 0 10px 24px -16px rgba(74,52,40,0.35);
  }
  .venue-hero-photo img { width: 100%; max-height: 420px; object-fit: cover; display: block; }
  .venue-hero-fallback {
    display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end;
    min-height: 220px; padding: 28px 30px; color: var(--paper);
  }
  .venue-hero-fallback .venue-hero-type {
    font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
    opacity: 0.85; margin-bottom: 6px;
  }
  .venue-hero-fallback .venue-hero-name {
    font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.9rem; line-height: 1.15;
  }
  /* Per-type gradient — the exact hue family already used for each type's
     badge/tag color elsewhere in this project (the SPA's .type-* rules),
     deepened into a two-stop gradient suitable for a large hero rather
     than a small tag. 'golf' has no prior SPA tag color to match (added
     after the SPA's original palette), so it uses a complementary green
     consistent with the existing 'pub' hue family rather than reusing it
     outright. */
  .venue-hero-restaurant { background: linear-gradient(135deg, #2A6B67, #1E4F4C); }
  .venue-hero-winery     { background: linear-gradient(135deg, #8C4A5E, #6B2C40); }
  .venue-hero-brewery    { background: linear-gradient(135deg, #E0A94E, #B8802E); }
  .venue-hero-distillery { background: linear-gradient(135deg, #B8802E, #8A631F); }
  .venue-hero-cafe       { background: linear-gradient(135deg, #C08A4E, #8A631F); }
  .venue-hero-pub        { background: linear-gradient(135deg, #6B8B5E, #4A6741); }
  .venue-hero-cocktail   { background: linear-gradient(135deg, #A25C93, #7A3B6E); }
  .venue-hero-golf       { background: linear-gradient(135deg, #4E7A5E, #345942); }
  .venue-hero-beach      { background: linear-gradient(135deg, #1B2B3A, #101B24); } /* tokens: --ref-navy -> --ref-navy-deep */
  .venue-hero-outdoor    { background: linear-gradient(135deg, #4A3428, #2F2118); } /* token: --ink, deepened */

  .venue-header { margin-bottom: 18px; }
  .venue-at-a-glance { color: var(--ink); opacity: 0.7; font-size: 0.98rem; margin: 6px 0 12px; }
  .venue-at-a-glance a { color: var(--teal-deep); text-decoration: none; }
  .venue-at-a-glance a:hover { text-decoration: underline; }

  .venue-description { font-size: 1.02rem; line-height: 1.7; margin: 0 0 22px; color: var(--ink); }

  .venue-cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
  .venue-cta-row .cta { margin: 0; }

  .venue-section { margin-top: 28px; padding-top: 22px; border-top: 1px solid rgba(74,52,40,0.12); }
  .venue-section h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.2rem; margin: 0 0 12px; }
  .venue-address { margin: 0 0 8px; font-size: 0.96rem; }
  .map-link { display: inline-block; font-weight: 700; font-size: 0.88rem; color: var(--teal-deep); text-decoration: none; }
  .map-link:hover { text-decoration: underline; }

  /* related-card type accent — reuses the same hue family as the hero
     gradients above, applied as a thin top border so related/nearby cards
     feel visually consistent with the page's new hero treatment even
     though (per Sprint 2 scope) they still have no photos of their own. */
  .related-card { border-top: 3px solid var(--sand-deep); }
  .related-card-restaurant { border-top-color: #2A6B67; }
  .related-card-winery { border-top-color: #6B2C40; }
  .related-card-brewery { border-top-color: #B8802E; }
  .related-card-distillery { border-top-color: #8A631F; }
  .related-card-cafe { border-top-color: #8A631F; }
  .related-card-pub { border-top-color: #4A6741; }
  .related-card-cocktail { border-top-color: #7A3B6E; }
  .related-card-golf { border-top-color: #345942; }
  .related-card-beach { border-top-color: #101B24; }
  .related-card-outdoor { border-top-color: #2F2118; }

  /* Design Sprint 4: compact visual band, shared with the homepage Hidden
     Gems cards via the same compactVisualBandHtml() helper and the same
     TYPE_ACCENT_GRADIENTS color source — generated here rather than
     hardcoded a second time. */
  .compact-band {
    height: 78px; border-radius: 10px 10px 0 0; margin: -1px -1px 10px -1px;
    display: flex; align-items: flex-end; padding: 8px 12px; box-sizing: border-box;
  }
  .compact-band-sm { height: 56px; }
  .compact-band-label {
    color: var(--paper); font-size: 0.68rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.92;
  }
  ${compactBandCSSRules('compact-band')}

  @media (max-width: 640px) {
    body { padding: 20px 16px 56px; }
    h1 { font-size: 1.6rem; }
    .subtitle { font-size: 0.95rem; margin-bottom: 20px; }
    .venue-card, .category-card { padding: 14px 16px; }
    .related-grid { grid-template-columns: 1fr; }
    .detail-row .label { min-width: 84px; }
    .cta { display: block; text-align: center; margin-right: 0; }
    .cta + .cta { margin-top: 10px; }
    .venue-hero-photo img { max-height: 220px; }
    .venue-hero-fallback { min-height: 160px; padding: 20px; }
    .venue-hero-fallback .venue-hero-name { font-size: 1.4rem; }
    .venue-at-a-glance { font-size: 0.9rem; }
    .venue-cta-row { flex-direction: column; }
    .venue-cta-row .cta { width: 100%; }
    .compact-band-sm { height: 48px; }
  }

  ${renderCanonicalFooterStyles()}
`;

// Phase 1 (Events): `opts.noindex` is a new, optional, backward-compatible
// parameter. Every pre-existing call site (region/category/venue/guide
// pages) passes exactly 4 arguments, so `opts` defaults to `{}` and
// `opts.noindex` is `undefined` (falsy) for all of them — their output is
// byte-for-byte unchanged. Only a caller that explicitly passes
// `{ noindex: true }` (expired events) gets the extra robots meta tag.
// ---------- Golf engagement analytics (2026-09-19, Golf only) ----------
//
// The site's only analytics system is GA4 (measurement ID below), wired
// on the homepage SPA (okanagan.html) through a small window.trackEvent()
// wrapper that never throws. Server-rendered pages had no analytics at
// all. This reuses that exact mechanism -- same property, same wrapper,
// same event-naming conventions (e.g. outbound_click + link_type) -- on
// Golf category and Golf venue pages only, so venue-level engagement
// (impressions, description expansions, website/phone/directions clicks)
// lands in the existing GA4 property rather than a second system.
const GA4_MEASUREMENT_ID = 'G-J312FGJPSC';

function renderAnalyticsHeadHtml() {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', '${GA4_MEASUREMENT_ID}');
  window.trackEvent = function(name, params){
    try {
      if (typeof gtag === 'function') gtag('event', name, params || {});
    } catch (e) { /* analytics must never break the site */ }
  };
</script>`;
}

function golfEngagementHeadHtml(type, themed = usesThemedCategoryLayout(type)) {
  return themed ? renderAnalyticsHeadHtml() : '';
}

// Shared Favorite / Add to Trip behaviour for Golf pages (2026-09-19).
// Operates on any element carrying data-venue-category="golf" (a listing
// card <li>, or the venue page's CTA row), so one module serves both
// surfaces. Same localStorage keys, item shape and name-keyed
// de-duplication as the homepage app (okanaganFavorites is an array of
// venue names; okanaganTrip is [{name, query, region}], capped at
// MAX_STOPS), so the existing Trip Planner and favourites filter see
// exactly what was chosen here. Emitted as plain JS text and wrapped by
// the two page scripts below, which each define ctx()/track() first.
function golfFavTripScriptBody(type = 'golf') {
  return `
  var MAX_STOPS = 10;
  var HOLDER = '${themedCardHolderSelector(type)}';
  function readList(key){
    try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function writeList(key, list){ try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {} }
  function syncFav(btn){
    var on = readList('okanaganFavorites').indexOf(btn.dataset.favName) !== -1;
    btn.classList.toggle('is-fav', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '\\u2665 Favorited' : '\\u2661 Favorite';
  }
  function syncTrip(btn){
    var on = readList('okanaganTrip').some(function(t){ return t && t.name === btn.dataset.tripName; });
    btn.classList.toggle('in-trip', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '\\u2713 In trip' : '\\uFF0B Add to Trip';
  }
  function syncAll(){
    document.querySelectorAll(HOLDER + ' .fav-btn').forEach(syncFav);
    document.querySelectorAll(HOLDER + ' .trip-btn').forEach(syncTrip);
  }
  function notice(holder, text){
    var row = holder.querySelector('.card-actions, .venue-cta-row') || holder;
    var el = holder.querySelector('.trip-notice');
    if (!el) {
      el = document.createElement('p');
      el.className = 'trip-notice';
      el.setAttribute('role', 'status');
      row.insertAdjacentElement('afterend', el);
    }
    el.textContent = text;
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.textContent = ''; }, 4000);
  }
  // When the homepage app (app.js) is on the page -- it is on every Golf
  // page, for the site-wide trip tray -- its own modules own the state,
  // labels and events of every .fav-btn/.trip-btn. This module then only
  // (a) mirrors the class-driven state into aria-pressed, which app.js does
  // not manage, and (b) reports venue-level favourite events with the
  // venue id/context; add_to_trip / remove_from_trip already come from
  // app.js itself, so they are not re-emitted here.
  if (window.__syncTripButtons || window.__syncFavButtons) {
    function mirrorPressed(btn){
      var on = btn.classList.contains('is-fav') || btn.classList.contains('in-trip');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    var pressedObserver = new MutationObserver(function(muts){ muts.forEach(function(m){ mirrorPressed(m.target); }); });
    document.querySelectorAll(HOLDER + ' .fav-btn, ' + HOLDER + ' .trip-btn').forEach(function(btn){
      mirrorPressed(btn);
      pressedObserver.observe(btn, { attributes: true, attributeFilter: ['class'] });
    });
    document.addEventListener('click', function(e){
      var fav = e.target.closest(HOLDER + ' .fav-btn');
      if (!fav) return;
      // app.js's delegated handler (registered earlier) has already toggled the class.
      track(fav.classList.contains('is-fav') ? 'venue_favorite' : 'venue_unfavorite', ctx(fav.closest(HOLDER)));
    });
    return;
  }
  syncAll();
  {
    document.addEventListener('click', function(e){
      var fav = e.target.closest(HOLDER + ' .fav-btn');
      if (fav) {
        var name = fav.dataset.favName, list = readList('okanaganFavorites'), i = list.indexOf(name);
        if (i === -1) list.push(name); else list.splice(i, 1);
        writeList('okanaganFavorites', list);
        syncAll();
        track(i === -1 ? 'venue_favorite' : 'venue_unfavorite', ctx(fav.closest(HOLDER)));
        return;
      }
      var tb = e.target.closest(HOLDER + ' .trip-btn');
      if (!tb) return;
      var holder = tb.closest(HOLDER), tname = tb.dataset.tripName, trip = readList('okanaganTrip');
      var params = ctx(holder);
      params.region = params.venue_region;
      if (trip.some(function(t){ return t && t.name === tname; })) {
        trip = trip.filter(function(t){ return !(t && t.name === tname); });
        writeList('okanaganTrip', trip);
        syncAll();
        params.trip_size = trip.length;
        track('remove_from_trip', params);
        return;
      }
      if (trip.length >= MAX_STOPS) {
        notice(holder, 'Trips are capped at ' + MAX_STOPS + ' stops so the route stays manageable. Remove a stop to add another.');
        return;
      }
      trip.push({ name: tname, query: tb.dataset.tripQuery, region: tb.dataset.tripRegion || null });
      writeList('okanaganTrip', trip);
      syncAll();
      params.trip_size = trip.length;
      track('add_to_trip', params);
    });
    window.addEventListener('storage', function(ev){
      if (ev.key === 'okanaganFavorites' || ev.key === 'okanaganTrip') syncAll();
    });
  }`;
}

// The Favorite / Add to Trip buttons themselves, shared by the listing
// card (surface "category_card") and the venue page CTA row ("venue_page").
function golfFavTripButtonsHtml(venue) {
  const tripQuery = `${venue.name}, ${REGION_LABELS[venue.region] || venue.region}, Okanagan Valley, BC`;
  return `<button type="button" class="card-action fav-btn" data-fav-name="${escapeHtml(venue.name)}" aria-pressed="false" aria-label="Favorite ${escapeHtml(venue.name)}">&#9825; Favorite</button>
          <button type="button" class="card-action trip-btn" data-trip-name="${escapeHtml(venue.name)}" data-trip-query="${escapeHtml(tripQuery)}" data-trip-region="${escapeHtml(venue.region)}" aria-pressed="false" aria-label="Add ${escapeHtml(venue.name)} to trip">&#65291; Add to Trip</button>`;
}

// ---------- Golf page theme (2026-09-19, Golf pages only) ----------
//
// Golf category and venue pages adopt the approved homepage's visual
// language instead of the generic SEO-page look. Nothing here is a new
// palette: the pages load the homepage's own stylesheet (public/styles/
// app.css, unchanged) for the header/nav/button system, reuse the same
// header markup okanagan.html ships (exactly as /trip already does), and
// the overrides below only use tokens.css values and measurements lifted
// from app.css / the homepage's discovery styles. Every rule is scoped to
// body.golf-page, so no other page is affected.
function renderGolfHeaderHtml() {
  if (!fs.existsSync(SITE_PATH)) {
    return siteHeader('https://okanaganroam.com/', 'Explore the full directory →');
  }
  const rawHtml = fs.readFileSync(SITE_PATH, 'utf8');
  let headerHtml = extractHtmlFragment(rawHtml, '<header id="top">', '</header>', true) || '';
  if (!headerHtml) {
    return siteHeader('https://okanaganroam.com/', 'Explore the full directory →');
  }
  return headerHtml
    .replace(/href="#moodCards"/g, 'href="/#moodCards"')
    .replace(/href="#hiddenGems"/g, 'href="/#hiddenGems"')
    .replace(/href="#exploreRegions"/g, 'href="/#exploreRegions"')
    .replace(/href="#directory"/g, 'href="/#directory"')
    .replace(/href="#mapPanel"/g, 'href="/#mapPanel"')
    .replace(/href="#top"/g, 'href="/"')
    .replace(/href="\/browse" data-i18n="mood\.golf\.title"/g, 'href="/golf" data-i18n="mood.golf.title"')
    // No i18n/search runtime on these pages: drop the two controls that
    // need app.js and turn the trip button into a real link to /trip.
    .replace(/<button class="nav-search-btn"[\s\S]*?<\/button>\s*/, '')
    .replace(/<button class="lang-toggle"[\s\S]*?<\/button>\s*/, '')
    .replace(/<button class="app-btn" id="navTripBtn" type="button">([\s\S]*?)<\/button>/, '<a class="app-btn" id="navTripBtn" href="/trip">$1</a>');
}

// Favorite / Add to Trip styling for ENGAGEMENT_ONLY_TYPES pages only
// (2026-09-23). Injected ONLY by the region/venue pages of those types, so
// the unscoped `.venue-cta-row .card-action` rules below cannot reach any
// other page. Mirrors the pill styling the themed pages already use, so the
// controls read as the same feature without pulling in the golf theme.
function renderEngagementControlStyles() {
  const cardSel = [...ENGAGEMENT_ONLY_TYPES]
    .map((t) => `.venue-card[data-venue-category="${t}"]`)
    .join(',\n  ');
  return `<style>
  ${cardSel} .card-actions {
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(74,52,40,0.10);
  }
  ${cardSel} .chips:not(:empty) + .card-actions { margin-top: 8px; padding-top: 0; border-top: 0; }
  ${cardSel} .card-action,
  .venue-cta-row .card-action {
    display: inline-flex; align-items: center; gap: 5px; margin: 0;
    font-size: 0.82rem; font-weight: 700; font-family: 'Nunito', sans-serif; line-height: 1.4;
    color: var(--ink); background: var(--sand-deep); border: none; text-decoration: none;
    border-radius: 999px; padding: 5px 12px; cursor: pointer; width: fit-content;
    transition: background 0.15s;
  }
  ${cardSel} .card-action:hover,
  .venue-cta-row .card-action:hover { background: rgba(224,169,78,0.35); color: var(--ink); text-decoration: none; }
  ${cardSel} .card-action:focus-visible,
  .venue-cta-row .card-action:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
  ${cardSel} .trip-btn.in-trip,
  .venue-cta-row .trip-btn.in-trip { background: var(--teal, #2A6B67); color: var(--paper); }
  ${cardSel} .fav-btn.is-fav,
  .venue-cta-row .fav-btn.is-fav { background: var(--plum); color: var(--paper); }
  .trip-notice { margin: 8px 0 0; font-size: 0.85rem; color: var(--plum); }
  .trip-notice:empty { display: none; }
</style>`;
}

// The site-wide floating "Trip" control: the same #tripTray fragment
// okanagan.html ships (and /trip already reuses), driven by the same
// trip-tray module in public/scripts/app.js. Golf pages load app.js just
// like /trip does, so the tray, its count, the header dropdowns/hamburger,
// and the .fav-btn/.trip-btn behaviour are the homepage's own code -- not
// a Golf copy. Returns '' if the fragment can't be read.
function renderGolfTripTrayHtml() {
  if (!fs.existsSync(SITE_PATH)) return '';
  const rawHtml = fs.readFileSync(SITE_PATH, 'utf8');
  return extractHtmlFragment(rawHtml, '<div id="tripTray">', '\n\n<!-- Header rebuilt', false) || '';
}

const GOLF_APP_SCRIPT_TAG = '<script src="/scripts/app.js"></script>';

// Body class for themed pages. Golf keeps exactly its deployed
// `class="golf-page"`; Beach pages carry the same theme class (the
// body.golf-page rules ARE the design system these pages share) plus a
// `beach-page` marker for beach-specific tests/styling. Non-themed pages
// get no class attribute at all, exactly as before.
function themedBodyClassAttr(type, themed = usesThemedCategoryLayout(type)) {
  if (type === 'golf') return ' class="golf-page"';
  if (themed) return ` class="golf-page ${type}-page"`;
  return '';
}

// Beach variants of every Golf card/CTA rule that is keyed on the
// data-venue-category="golf" attribute selector (in SEO_PAGE_CSS and the
// theme block). Derived mechanically from the Golf rules at request time
// rather than copied, so the two categories can never drift apart in
// styling, and the Golf CSS text itself is untouched. The selector
// regex matches a complete rule (selector list + declaration block)
// whose selector list mentions the golf attribute.
function deriveBeachRulesFromGolfCss(cssText, type = 'beach') {
  const ruleRe = /[^{}]*\[data-venue-category="golf"\][^{}]*\{[^{}]*\}/g;
  return (cssText.match(ruleRe) || [])
    .map((rule) => rule.replace(/\[data-venue-category="golf"\]/g, `[data-venue-category="${type}"]`).trim())
    .join('\n  ');
}
function renderBeachThemeStyles() {
  const themeCss = renderGolfThemeStyles().replace(/^<style>|<\/style>$/g, '');
  return `<style>
  /* Beach page theme (2026-09-19): the Golf rules above, re-keyed to the beach card attribute. */
  ${deriveBeachRulesFromGolfCss(SEO_PAGE_CSS)}
  ${deriveBeachRulesFromGolfCss(themeCss)}
</style>`;
}
// Outdoor (2026-09-20): the third themed category. Exactly the Beach
// mechanism -- the Golf rules re-keyed to the outdoor card attribute at
// request time -- so Outdoor pages can never drift from the shared design
// system either. Emitted only on outdoor pages (see pageHead's outdoorTheme),
// so Golf and Beach output is byte-identical to before this was added.
function renderOutdoorThemeStyles() {
  const themeCss = renderGolfThemeStyles().replace(/^<style>|<\/style>$/g, '');
  return `<style>
  /* Outdoor page theme (2026-09-20): the Golf rules above, re-keyed to the outdoor card attribute. */
  ${deriveBeachRulesFromGolfCss(SEO_PAGE_CSS, 'outdoor')}
  ${deriveBeachRulesFromGolfCss(themeCss, 'outdoor')}
  /* Outdoors discovery (Phase 2): intro line, activity chips (region-chip
     pills with a small count) and the featured grid. Outdoor pages only. */
  body.outdoor-page .outdoor-intro { font-size: 1.04rem; line-height: 1.65; max-width: 68ch; color: var(--ink); opacity: 0.85; margin: -8px 0 22px; }
  /* Activity cards (2026-09-20 presentation; 2026-09-22 explorer): the
     homepage mood-card treatment (bottom gradient, white icon + Fraunces
     title) under outdoor-scoped classes, so the homepage's own .mood-card
     rules are untouched. Cards are 16:9 to match the approved outdoor
     image format (1376x768 sources, cover-fit). Two across on phones,
     three across (a 3 x 3 grid of the nine activities) from 600px. A live
     card is a <button> filter toggle; "Coming soon" tiles are the same
     card, inert. */
  body.outdoor-page .outdoor-activity-showcase { margin: 0; }
  body.outdoor-page .outdoor-activity-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  body.outdoor-page .outdoor-activity-card {
    position: relative; display: block; width: 100%; border-radius: 10px; overflow: hidden; text-decoration: none; color: #fff;
    aspect-ratio: 16 / 9; background: var(--ref-navy); box-shadow: 0 10px 22px -16px rgba(74,52,40,0.4);
    border: 0; padding: 0; margin: 0; font: inherit; text-align: left;
  }
  body.outdoor-page .outdoor-activity-card-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s ease; }
  body.outdoor-page .outdoor-activity-toggle { cursor: pointer; transition: box-shadow .15s ease; }
  body.outdoor-page .outdoor-activity-toggle:hover .outdoor-activity-card-img { transform: scale(1.045); }
  body.outdoor-page .outdoor-activity-toggle:focus-visible { outline: 3px solid var(--ref-gold); outline-offset: 2px; }
  /* Selected card: teal ring, teal-tinted overlay and a "Selected" badge
     -- unmistakable at a glance, same palette as the region pills. */
  body.outdoor-page .outdoor-activity-toggle[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--paper), 0 0 0 6px var(--teal), 0 10px 22px -16px rgba(74,52,40,0.4); }
  body.outdoor-page .outdoor-activity-toggle[aria-pressed="true"] .outdoor-activity-card-overlay { background: linear-gradient(180deg, rgba(42,107,103,0.35) 0%, rgba(30,79,76,0.9) 100%); }
  body.outdoor-page .outdoor-activity-card-check {
    display: none; position: absolute; top: 8px; left: 8px; z-index: 1; padding: 4px 9px; border-radius: 999px;
    background: var(--teal); color: #fff; font-family: 'Nunito', sans-serif; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.02em;
  }
  body.outdoor-page .outdoor-activity-toggle[aria-pressed="true"] .outdoor-activity-card-check { display: inline-block; }
  /* The card's count reuses the region-chip count hook; undo the pill
     styling so it reads as the card's own caption. */
  body.outdoor-page .outdoor-activity-card .outdoor-activity-count { display: inline; margin: 0; font-size: inherit; opacity: 1; }
  /* Guide link beside the toggle: a small text link to the existing
     /outdoors/<activity> page, kept out of the button so the card stays a
     single control. */
  body.outdoor-page .outdoor-activity-card-wrap { display: flex; flex-direction: column; gap: 4px; }
  body.outdoor-page .outdoor-activity-card-link { align-self: flex-end; font-family: 'Nunito', sans-serif; font-size: 0.78rem; font-weight: 700; color: var(--ref-navy); text-decoration: none; padding: 2px 4px; border-radius: 4px; }
  body.outdoor-page .outdoor-activity-card-link:hover { color: var(--ref-gold); text-decoration: underline; }
  body.outdoor-page .outdoor-activity-card-link:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoor-activity-card-overlay {
    position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 12px;
    background: linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(20,14,10,0.78) 100%);
  }
  body.outdoor-page .outdoor-activity-card-icon { color: #fff; opacity: 0.95; margin-bottom: 4px; }
  body.outdoor-page .outdoor-activity-card-icon svg { display: block; width: 18px; height: 18px; }
  body.outdoor-page .outdoor-activity-card-title { font-family: 'Fraunces', serif; font-size: 0.98rem; font-weight: 700; display: block; line-height: 1.2; }
  body.outdoor-page .outdoor-activity-card-count, body.outdoor-page .outdoor-activity-card-soon { display: block; font-size: 0.74rem; font-weight: 700; opacity: 0.85; margin-top: 2px; letter-spacing: 0.01em; }
  body.outdoor-page .outdoor-activity-card-pending { cursor: default; }
  body.outdoor-page .outdoor-activity-card-pending .outdoor-activity-card-overlay { background: linear-gradient(180deg, rgba(27,43,58,0.15) 0%, rgba(20,14,10,0.82) 100%); }
  body.outdoor-page .outdoor-activity-card-soon { color: var(--ref-gold); }
  @media (min-width: 600px) { body.outdoor-page .outdoor-activity-card-grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
  @media (min-width: 900px) { body.outdoor-page .outdoor-activity-card-grid { gap: 16px; max-width: 1040px; } }
  /* Explorer steps (2026-09-22): Choose Region(s) -> Choose Activity(s)
     -> Results as three clearly separated blocks with the existing
     teal-marker heading; a small "N selected" status sits beside the
     heading of the two choice steps. */
  body.outdoor-page .outdoor-step { margin: 0 0 30px; }
  body.outdoor-page .outdoor-step-results { margin-bottom: 0; padding-top: 4px; }
  body.outdoor-page .outdoor-step-head { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin: 0 0 12px; }
  body.outdoor-page .outdoor-step-head .category-subsection-heading { margin-bottom: 0; }
  body.outdoor-page .outdoor-step-status { font-family: 'Nunito', sans-serif; font-size: 0.8rem; font-weight: 800; color: var(--teal); padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(42,107,103,0.35); background: rgba(42,107,103,0.08); margin-bottom: 4px; }
  body.outdoor-page .outdoor-step-status[hidden] { display: none; }
  body.outdoor-page .outdoor-activity-selector { margin-bottom: 8px; }
  /* Step 1 (Choose a Region): the primary choice, so its pills are a
     touch larger than the activity pills; same pill treatment otherwise. */
  body.outdoor-page .outdoor-region-choice { margin-bottom: 8px; }
  body.outdoor-page .outdoor-region-choice a { padding: 8px 17px; font-size: 0.9rem; }
  /* Multi-select filter chips (2026-09-20): the same pill as the region
     selector, as toggle buttons; pressed = the selector's active (navy)
     treatment with a check mark. */
  body.outdoor-page .outdoor-filter-group { margin: 0 0 14px; }
  body.outdoor-page .outdoor-filter-chip {
    display: inline-block; padding: 7px 16px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.18);
    background: var(--paper); color: var(--ink); font: inherit; font-size: 0.86rem; font-weight: 700; letter-spacing: 0.01em;
    cursor: pointer; line-height: 1.3; transition: background .12s ease, color .12s ease, border-color .12s ease;
  }
  body.outdoor-page .outdoor-filter-chip:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.outdoor-page .outdoor-filter-chip[aria-pressed="true"] { background: var(--ref-navy); color: var(--paper); border-color: var(--ref-navy); box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--teal); }
  body.outdoor-page .outdoor-filter-chip[aria-pressed="true"]::before { content: "\\2713"; margin-right: 6px; font-size: 0.78em; }
  body.outdoor-page .outdoor-filter-chip[aria-pressed="true"] .outdoor-activity-count { opacity: 0.8; }
  body.outdoor-page .outdoor-filter-chip:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoor-filter-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 6px 0 4px; }
  body.outdoor-page .outdoor-filter-actions .cta {
    margin: 0; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    background: var(--ref-navy); color: var(--ref-white); border: 1px solid var(--ref-navy);
    padding: 10px 20px; border-radius: 999px; font-weight: 700; font-size: 0.86rem; letter-spacing: 0.01em;
    font-family: 'Nunito', sans-serif; text-decoration: none; transition: background .15s ease;
  }
  body.outdoor-page .outdoor-filter-actions .cta:hover { background: var(--ref-navy-deep); color: var(--ref-white); }
  body.outdoor-page .outdoor-filter-actions .cta[hidden] { display: none; }
  body.outdoor-page .outdoor-clear-filters { background: transparent; border: 0; padding: 6px 8px; font: inherit; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 700; color: var(--ref-navy); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; align-self: center; }
  body.outdoor-page .outdoor-clear-filters:hover { color: var(--ref-gold); }
  body.outdoor-page .outdoor-clear-filters:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoor-clear-filters[hidden] { display: none; }
  body.outdoor-page .outdoor-results-summary { font-size: 0.95rem; color: var(--ink); opacity: 0.75; margin: -6px 0 10px; }
  /* Selected-filter tags beside the results (2026-09-20 discovery
     refinement): removable navy tags + "Clear all", hidden when empty. */
  body.outdoor-page .outdoor-selected { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin: 0 0 16px; }
  body.outdoor-page .outdoor-selected[hidden] { display: none; }
  body.outdoor-page .outdoor-selected-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  body.outdoor-page .outdoor-selected-label { font-size: 0.8rem; font-weight: 800; color: var(--ink); opacity: 0.6; min-width: 64px; text-transform: uppercase; letter-spacing: 0.04em; }
  body.outdoor-page .outdoor-selected-tag {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--ref-navy);
    background: var(--ref-navy); color: var(--paper); font: inherit; font-size: 0.84rem; font-weight: 700; cursor: pointer; line-height: 1.3;
  }
  body.outdoor-page .outdoor-selected-tag:hover { background: var(--ref-navy-deep); }
  body.outdoor-page .outdoor-selected-tag:focus-visible, body.outdoor-page .outdoor-selected-clear:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoor-selected-x { font-size: 1.05em; line-height: 1; opacity: 0.85; }
  body.outdoor-page .outdoor-selected-clear { background: transparent; border: 0; padding: 6px 4px; font: inherit; font-size: 0.86rem; font-weight: 700; color: var(--ref-navy); text-decoration: underline; cursor: pointer; }
  /* Phones: comfortable tap targets for every filter control (44px+),
     and the action buttons span the width so they are easy to hit. */
  @media (max-width: 899px) {
    body.outdoor-page .outdoor-filter-chip { min-height: 44px; padding: 10px 16px; font-size: 0.92rem; }
    body.outdoor-page .outdoor-region-group-chips { gap: 10px; }
    body.outdoor-page .outdoor-activity-card-link { min-height: 40px; display: inline-flex; align-items: center; }
    body.outdoor-page .outdoor-selected-tag { min-height: 40px; padding: 8px 14px; }
    body.outdoor-page .outdoor-selected-clear { min-height: 40px; }
    body.outdoor-page .outdoor-filter-actions .cta { flex: 1 1 100%; min-height: 48px; justify-content: center; }
  }
  body.outdoor-page .outdoor-no-results { background: var(--paper); border: 1px solid rgba(74,52,40,0.10); border-radius: 12px; padding: 16px 18px; margin: 0 0 26px; }
  body.outdoor-page #outdoorResults > .venue-card[hidden] { display: none; }
  /* Landing result cards are more compact: about three lines of
     description before the existing "Read more" (activity and region
     pages keep the four-line clamp). */
  body.outdoor-page #outdoorResults .golf-desc.is-clamped p { -webkit-line-clamp: 3; max-height: calc(3 * 1.45em); }
  /* Grouped region selector: headers are compact secondary controls; on
     desktop they are hidden and the four blocks flow as one chip row. */
  body.outdoor-page .outdoor-region-groups { display: block; }
  body.outdoor-page .outdoor-region-group-block { margin: 0 0 8px; }
  body.outdoor-page .outdoor-region-group-toggle {
    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; cursor: pointer;
    background: transparent; border: 0; border-bottom: 1px solid rgba(74,52,40,0.12); border-radius: 0;
    padding: 9px 2px; margin: 0 0 8px; font: inherit; color: var(--ink);
  }
  body.outdoor-page .outdoor-region-group-toggle:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoor-region-group-name { font-weight: 800; font-size: 0.95rem; letter-spacing: 0.01em; }
  body.outdoor-page .outdoor-region-group-meta, body.outdoor-page .outdoor-region-group-selected { font-size: 0.82rem; opacity: 0.65; }
  body.outdoor-page .outdoor-region-group-selected { opacity: 1; color: var(--ref-navy); font-weight: 700; }
  body.outdoor-page .outdoor-region-group-selected[hidden] { display: none; }
  body.outdoor-page .outdoor-region-group-chevron { margin-left: auto; width: 9px; height: 9px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); opacity: 0.55; transition: transform .15s ease; }
  body.outdoor-page .outdoor-region-group-toggle[aria-expanded="false"] .outdoor-region-group-chevron { transform: rotate(-45deg); }
  body.outdoor-page .outdoor-region-group-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 6px; }
  body.outdoor-page .outdoor-region-group-chips[hidden] { display: none; }
  /* No JavaScript: headers stay hidden and every chip is visible. */
  body.outdoor-page .outdoor-region-groups:not(.js) .outdoor-region-group-toggle { display: none; }
  body.outdoor-page .outdoor-region-groups:not(.js) .outdoor-region-group-chips[hidden] { display: flex; }
  /* Desktop: unchanged 20-chip presentation -- no headers, blocks flow as one row. */
  @media (min-width: 900px) {
    body.outdoor-page .outdoor-region-groups { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    body.outdoor-page .outdoor-region-group-block { display: contents; }
    body.outdoor-page .outdoor-region-group-toggle { display: none !important; }
    body.outdoor-page .outdoor-region-group-chips, body.outdoor-page .outdoor-region-group-chips[hidden] { display: contents; }
  }

  body.outdoor-page .outdoor-activity-count { display: inline-block; margin-left: 7px; font-size: 0.72rem; font-weight: 700; opacity: 0.6; }
  body.outdoor-page .outdoor-featured-grid { margin: 0 0 8px; }
  @media (min-width: 900px) { body.outdoor-page .outdoor-featured-grid { grid-template-columns: repeat(3, 1fr); } }
  body.outdoor-page .related-card .related-meta { font-size: 0.82rem; color: var(--ink); opacity: 0.7; margin-top: 4px; }
  /* Mobile: four featured cards, not six stacked (the last two are still
     in the markup for larger screens). */
  @media (max-width: 899px) { body.outdoor-page .outdoor-featured-grid .related-card:nth-child(n+5) { display: none; } }
  /* Region-grouped index on the landing page: compact name + activities
     cards under a community heading; no description, no actions. */
  body.outdoor-page .outdoor-region-group { margin: 0 0 22px; }
  body.outdoor-page .outdoor-region-heading {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.02rem; color: var(--ink); opacity: 0.8; margin: 0 0 10px;
  }
  body.outdoor-page .outdoor-region-count { display: inline-block; margin-left: 8px; font-family: inherit; font-size: 0.78rem; font-weight: 700; opacity: 0.55; vertical-align: 2px; }
  body.outdoor-page .outdoor-index-card { padding: 11px 14px 10px; }
  body.outdoor-page .outdoor-index-card a { font-weight: 700; color: var(--ink); text-decoration: none; }
  body.outdoor-page .outdoor-index-card a:hover { color: var(--ref-navy); text-decoration: underline; }
  @media (min-width: 900px) { body.outdoor-page .outdoor-index-grid { grid-template-columns: repeat(3, 1fr); } }
</style>`;
}

// The simplified /outdoors landing's own stylesheet (2026-09-24). Kept OUT of
// renderOutdoorThemeStyles() on purpose: that block ships on every outdoor
// surface -- including /whats-on, which is also a body.outdoor-page -- and
// none of these rules belong anywhere but the landing.
function renderOutdoorsSimplifiedStyles() {
  return `<style>
  /* ---- Simplified filter surface (2026-09-24) -----------------------------
     Compact search + one horizontal activity chip row + a compact activity
     guide row + the Regions popover, replacing the nine image tiles, the
     region accordion block and the three step headings that used to sit
     above the results.

     This stylesheet is emitted ONLY on the /outdoors landing page
     (renderCategoryAllRegionsPage, isOutdoorLanding). It is deliberately
     not part of renderOutdoorThemeStyles(), which does ship on /whats-on,
     /outdoors/<activity> and /<region>/outdoors -- none of these rules
     belong on those pages.

     Every selector below is new and Outdoors-specific (.outdoors-*, with
     an s), and the base .outdoor-filter-chip rules are deliberately NOT
     modified, because What's On's chips use them too. Colours, radii and
     the Nunito weights are the existing design system's. */
  body.outdoor-page .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  body.outdoor-page .outdoors-intro { margin-bottom: 14px; }

  body.outdoor-page .outdoors-search { position: relative; margin: 0 0 12px; max-width: 520px; }
  body.outdoor-page .outdoors-search-input { width: 100%; box-sizing: border-box; font: inherit; font-family: 'Nunito', sans-serif; font-size: 0.95rem; padding: 10px 36px 10px 14px; min-height: 42px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.18); background: var(--paper); color: var(--ink); }
  body.outdoor-page .outdoors-search-input::placeholder { color: rgba(42,32,25,0.55); }
  body.outdoor-page .outdoors-search-input:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  /* The page draws its own clear button, so suppress the browser's native one. */
  body.outdoor-page .outdoors-search-input::-webkit-search-cancel-button, body.outdoor-page .outdoors-search-input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
  body.outdoor-page .outdoors-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; cursor: pointer; font-size: 1.2rem; line-height: 1; color: var(--ink); opacity: 0.6; padding: 6px 8px; }
  body.outdoor-page .outdoors-search-clear[hidden] { display: none; }

  /* flex-wrap: nowrap is explicit -- the row also carries .category-region-selector,
     which sets flex-wrap: wrap, and without this the chips would stack into a tall
     block on a phone instead of scrolling sideways. */
  body.outdoor-page .outdoors-act-row { display: flex; flex-wrap: nowrap; gap: 8px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding: 2px 0 8px; margin: 0 0 10px; }
  body.outdoor-page .outdoors-act-row::-webkit-scrollbar { height: 6px; }
  body.outdoor-page .outdoors-act-row::-webkit-scrollbar-thumb { background: rgba(74,52,40,0.2); border-radius: 999px; }
  body.outdoor-page .outdoors-act-row .outdoor-filter-chip { flex: 0 0 auto; white-space: nowrap; }
  @media (min-width: 900px) { body.outdoor-page .outdoors-act-row { flex-wrap: wrap; overflow: visible; } }

  body.outdoor-page .outdoors-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  body.outdoor-page .outdoors-pop { position: relative; }
  body.outdoor-page .outdoors-pop-btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ink); background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 999px; padding: 8px 14px; min-height: 40px; cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; }
  body.outdoor-page .outdoors-pop-btn:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.outdoor-page .outdoors-pop-btn:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoors-pop-btn[aria-expanded="true"] { background: var(--ref-navy, #1B2B3A); color: var(--paper); border-color: var(--ref-navy, #1B2B3A); }
  body.outdoor-page .outdoors-pop-count[hidden] { display: none; }
  body.outdoor-page .outdoors-pop-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; min-width: 280px; max-width: min(92vw, 620px); max-height: 60vh; overflow-y: auto; background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 14px; box-shadow: 0 18px 40px -20px var(--shadow, rgba(42,32,25,0.5)); padding: 14px; }
  body.outdoor-page .outdoors-pop-panel[hidden] { display: none; }
  /* Without scripting the popover can never be opened, so the panel stays
     visible and the page degrades to the full region selector inline --
     the same no-JS guarantee .outdoor-region-groups:not(.js) already gives. */
  body.outdoor-page .outdoors-controls:not(.js) .outdoors-pop-panel, body.outdoor-page .outdoors-controls:not(.js) .outdoors-pop-panel[hidden] { position: static; display: block; max-width: none; max-height: none; box-shadow: none; border: 0; padding: 10px 0 0; }
  body.outdoor-page .outdoors-controls:not(.js) .outdoors-pop-btn { display: none; }
  /* On phones the panel becomes a full-width sheet under the controls row
     rather than a cramped popover. The row -- not .outdoors-pop -- is the
     positioning context, so the panel's top offset still resolves against
     the button's own row. */
  @media (max-width: 640px) {
    body.outdoor-page .outdoors-controls { position: relative; }
    body.outdoor-page .outdoors-pop { position: static; }
    body.outdoor-page .outdoors-pop-panel { left: 0; right: 0; width: auto; min-width: 0; max-width: none; }
  }
  body.outdoor-page .outdoors-pop-panel .outdoor-filter-group { margin: 0; }
  /* Desktop shows all 20 canonical chips flat (the group headers are hidden
     there), so give the panel room to lay them out a few per row. */
  @media (min-width: 900px) { body.outdoor-page .outdoors-pop-panel { min-width: 520px; } }

  /* "Show results" (2026-09-24): selecting the last filter in a popover used
     to leave the visitor having to click somewhere outside it to get back to
     the list. Filtering is already live, so this is an explicit dismiss +
     confirmation affordance -- the primary action in the panel, in the
     homepage's navy/gold system, with the live count as its label. */
  body.outdoor-page .outdoors-pop-actions { position: sticky; bottom: -14px; margin: 12px -14px -14px; padding: 10px 14px; background: var(--paper); border-top: 1px solid rgba(27,43,58,0.12); border-radius: 0 0 14px 14px; }
  body.outdoor-page .outdoors-pop-apply { display: block; width: 100%; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ref-cream); background: var(--ref-navy); border: 1px solid var(--ref-gold); border-radius: 999px; padding: 10px 16px; min-height: 44px; cursor: pointer; transition: background .12s ease; }
  body.outdoor-page .outdoors-pop-apply:hover { background: var(--ref-navy-deep); }
  body.outdoor-page .outdoors-pop-apply:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.outdoor-page .outdoors-resultbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 6px; }
  body.outdoor-page .outdoors-count { margin: 0; font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 800; color: var(--ink); }
  body.outdoor-page .outdoors-results-step { margin-top: 4px; }</style>`;
}

function renderGolfThemeStyles() {
  return `<style>
  /* Golf page theme: values come from tokens.css and app.css (homepage). */
  body.golf-page {
    max-width: none; margin: 0; padding: 0;
    background: var(--ref-cream); color: var(--ink);
    font-family: 'Nunito', sans-serif; font-size: 17px; line-height: 1.65;
  }
  body.golf-page .golf-main { max-width: 1360px; margin: 0 auto; padding: 26px 24px 72px; }
  /* app.js's initBlock11 appends a .card-links row (directions / menu /
     booking / phone links plus its own Trip/Favorite buttons) to every
     .venue-card it finds. Golf cards deliberately show only Favorite and
     Add to Trip (rendered server-side above), so that injected row is
     suppressed here; the homepage module still drives the server-rendered
     buttons because they share the .trip-btn/.fav-btn contract. */
  body.golf-page .venue-card .card-links { display: none; }
  body.golf-page a { color: var(--ref-navy); }
  body.golf-page a:hover { color: var(--ref-gold); }
  /* Footer links (2026-09-20 fix): the rule above outranks the footer's own
     .home-footer-col a colour, which painted its links navy-on-navy on
     every golf-themed page. Restates the footer's own values; no markup
     or layout change. */
  body.golf-page .home-footer-col a, body.golf-page .home-footer-region-group a { color: rgba(245,243,237,0.78); }
  body.golf-page .home-footer-col a:hover, body.golf-page .home-footer-region-group a:hover { color: var(--ref-gold); }
  body.golf-page a.app-btn, body.golf-page a.app-btn:hover { color: var(--ref-white); text-decoration: none; }
  body.golf-page nav.breadcrumb { font-size: 0.8rem; color: rgba(42,32,25,0.62); margin-bottom: 18px; }
  body.golf-page nav.breadcrumb a { color: var(--ref-navy); }
  body.golf-page .category-back-link, body.golf-page .venue-back-link {
    display: inline-block; font-weight: 700; font-size: 0.86rem; color: var(--ref-navy);
    text-decoration: none; margin-bottom: 14px;
  }
  body.golf-page .category-back-link:hover, body.golf-page .venue-back-link:hover { color: var(--ref-gold); }
  body.golf-page h1 {
    font-family: 'Fraunces', serif; font-weight: 600; line-height: 1.15;
    font-size: clamp(1.7rem, 3vw, 2.2rem); margin: 0 0 6px; color: var(--ink);
  }
  body.golf-page .subtitle { font-size: 0.95rem; color: rgba(42,32,25,0.65); margin: 0 0 22px; }

  /* Region selector: homepage redesign pills -- resting/hover from
     .lang-toggle, active from .region-chip[aria-pressed="true"] (app.css). */
  body.golf-page .category-region-selector { margin: 0 0 22px; }
  body.golf-page .category-region-selector a,
  body.golf-page .category-region-selector-active {
    background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.2);
    border-radius: 999px; padding: 5px 12px; font-weight: 700; font-size: 0.8rem; text-decoration: none;
    transition: all .15s ease;
  }
  body.golf-page .category-region-selector a:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.golf-page .category-region-selector-active { background: var(--ref-navy); color: var(--paper); border-color: var(--ref-navy); }

  /* Section headings: the homepage's .discover-heading h2 + eyebrow bar. */
  body.golf-page .category-subsection-heading {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(1.2rem, 1.8vw, 1.45rem);
    color: var(--ink); margin: 26px 0 12px; padding: 0; border: 0;
  }
  body.golf-page .category-subsection-heading::before {
    content: ""; display: block; width: 20px; height: 2px; background: var(--teal); margin-bottom: 8px;
  }
  body.golf-page .category-subsection-heading:first-of-type { margin-top: 6px; }

  /* Listing cards: the homepage card system (paper, 14px radius, soft
     shadow, hover lift), two-up on wide screens like the discovery rows. */
  body.golf-page .card-grid { display: grid; grid-template-columns: 1fr; gap: 16px; margin: 0 0 26px; }
  @media (min-width: 900px) { body.golf-page .card-grid { grid-template-columns: repeat(2, 1fr); } }
  body.golf-page .venue-card {
    margin: 0; background: var(--paper); border: 1px solid rgba(74,52,40,0.08); border-radius: 14px;
    padding: 18px 20px; box-shadow: 0 10px 22px -16px rgba(74,52,40,0.35);
    transition: transform .15s ease, box-shadow .15s ease; display: flex; flex-direction: column;
  }
  body.golf-page .venue-card:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -16px rgba(74,52,40,0.4); }
  body.golf-page .venue-card h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.12rem; margin: 0 0 5px; line-height: 1.25; }
  /* Venue name = the one link to the detail page. Rendered navy (the
     redesign's link colour, as the header nav / .discover-heading-link),
     underlined on hover/focus, with a small "View details" cue inside the
     same anchor styled like .discover-heading-link (navy, gold on hover).
     display:block + padding makes the whole name+cue a comfortable tap
     target on mobile; the focus ring is app.css's global teal rule. */
  body.golf-page .venue-card h2 a.venue-card-link {
    display: block; padding: 2px 0 4px; color: var(--ref-navy); text-decoration: none; border-radius: 4px;
  }
  body.golf-page .venue-card h2 a.venue-card-link .venue-card-name {
    display: inline; text-decoration: none; text-underline-offset: 3px; text-decoration-thickness: 2px;
  }
  body.golf-page .venue-card h2 a.venue-card-link:hover .venue-card-name,
  body.golf-page .venue-card h2 a.venue-card-link:focus-visible .venue-card-name { text-decoration: underline; }
  body.golf-page .venue-card h2 a.venue-card-link:hover { color: var(--ref-navy-deep); }
  body.golf-page .venue-card h2 a.venue-card-link .venue-card-cue {
    display: block; margin-top: 3px;
    font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 0.8rem; line-height: 1.3; letter-spacing: 0.01em;
    color: var(--ref-navy); white-space: nowrap;
  }
  body.golf-page .venue-card h2 a.venue-card-link:hover .venue-card-cue { color: var(--ref-gold); }
  body.golf-page .venue-card h2 a.venue-card-link:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
  body.golf-page .venue-card p { font-size: 0.92rem; color: rgba(42,32,25,0.75); line-height: 1.45; opacity: 1; }
  body.golf-page .venue-meta { font-size: 0.85rem; color: rgba(42,32,25,0.68); opacity: 1; }
  body.golf-page .golf-desc.is-clamped p { max-height: calc(4 * 1.45em); }
  body.golf-page .desc-toggle { color: var(--ref-navy); font-size: 0.86rem; align-self: flex-start; }
  body.golf-page .desc-toggle:hover { color: var(--ref-gold); text-decoration: none; }
  body.golf-page .venue-card[data-venue-category="golf"] .chips:not(:empty),
  body.golf-page .venue-card[data-venue-category="golf"] .card-actions { border-top-color: rgba(27,43,58,0.1); }
  body.golf-page .venue-card[data-venue-category="golf"] .card-actions { margin-top: auto; padding-top: 12px; }
  /* Favorite / Add to Trip pills use the homepage REDESIGN button rules
     (app.css), not the pre-redesign wizard .fav-btn/.trip-btn tan pill:
       resting  = .lang-toggle        (transparent, 1px rgba(27,43,58,0.2), --ref-navy text)
       hover    = .lang-toggle:hover  (rgba(27,43,58,0.06))
       favorited= .region-chip[aria-pressed="true"] (--ref-navy on --paper)
       in trip  = .trip-btn.in-trip   (--teal on --paper)
       focus    = global a/button:focus-visible (3px --teal)
     Specificity is deliberately higher than app.css's .fav-btn/.trip-btn
     and the golf rules in SEO_PAGE_CSS. */
  body.golf-page .venue-card[data-venue-category="golf"] .card-action,
  body.golf-page .venue-cta-row .card-action {
    background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.2);
  }
  body.golf-page .venue-card[data-venue-category="golf"] .card-action:hover,
  body.golf-page .venue-cta-row .card-action:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.golf-page .venue-card[data-venue-category="golf"] .fav-btn.is-fav,
  body.golf-page .venue-cta-row .fav-btn.is-fav { background: var(--ref-navy); color: var(--paper); border-color: var(--ref-navy); }
  body.golf-page .venue-card[data-venue-category="golf"] .fav-btn.is-fav:hover,
  body.golf-page .venue-cta-row .fav-btn.is-fav:hover { background: var(--ref-navy-deep); color: var(--paper); }
  body.golf-page .venue-card[data-venue-category="golf"] .trip-btn.in-trip,
  body.golf-page .venue-cta-row .trip-btn.in-trip { background: var(--teal); color: var(--paper); border-color: var(--teal); }
  body.golf-page .venue-card[data-venue-category="golf"] .trip-btn.in-trip:hover,
  body.golf-page .venue-cta-row .trip-btn.in-trip:hover { background: var(--teal-deep); color: var(--paper); }
  body.golf-page .venue-card[data-venue-category="golf"] .card-action:focus-visible,
  body.golf-page .venue-cta-row .card-action:focus-visible,
  body.golf-page .desc-toggle:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }

  /* Venue page: CTAs use the homepage button system (.app-btn navy pill,
     outline secondary), with Favorite / Add to Trip alongside. */
  body.golf-page .venue-hero { border-radius: 14px; }
  body.golf-page .venue-header { margin-bottom: 16px; }
  body.golf-page .venue-description { font-size: 1rem; line-height: 1.65; color: var(--ink); max-width: 80ch; }
  body.golf-page .venue-cta-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 4px 0 26px; }
  body.golf-page .venue-cta-row .cta {
    margin: 0; display: inline-flex; align-items: center; gap: 6px;
    background: var(--ref-navy); color: var(--ref-white); border: 1px solid var(--ref-navy);
    padding: 10px 20px; border-radius: 999px; font-weight: 700; font-size: 0.86rem; letter-spacing: 0.01em;
    font-family: 'Nunito', sans-serif; text-decoration: none; transition: background .15s ease;
  }
  body.golf-page .venue-cta-row .cta:hover { background: var(--ref-navy-deep); color: var(--ref-white); }
  body.golf-page .venue-cta-row .cta.secondary { background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.2); }
  body.golf-page .venue-cta-row .cta.secondary:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.golf-page .venue-cta-row .card-action {
    display: inline-flex; align-items: center; gap: 5px; margin: 0;
    font-size: 0.86rem; font-weight: 700; font-family: 'Nunito', sans-serif; line-height: 1.4;
    text-decoration: none; border-radius: 999px; padding: 10px 16px; cursor: pointer; transition: background 0.15s;
  }
  body.golf-page .trip-notice { margin: 8px 0 0; font-size: 0.85rem; color: var(--ref-navy); }
  body.golf-page .trip-notice:empty { display: none; }
  body.golf-page .venue-section, body.golf-page .related-card {
    background: var(--paper); border: 1px solid rgba(74,52,40,0.08); border-radius: 14px;
    box-shadow: 0 10px 22px -16px rgba(74,52,40,0.35);
  }
  body.golf-page .venue-section { padding: 18px 20px; margin-bottom: 18px; }
  body.golf-page .venue-section h2, body.golf-page .related-section h2 {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(1.1rem, 1.6vw, 1.3rem); margin: 0 0 10px; color: var(--ink);
  }
  body.golf-page .related-card a:hover { color: var(--ref-navy); }
  body.golf-page .golf-main > a.cta {
    display: inline-flex; align-items: center; margin: 10px 10px 0 0;
    background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.2);
    padding: 10px 20px; border-radius: 999px; font-weight: 700; font-size: 0.86rem; text-decoration: none;
  }
  body.golf-page .golf-main > a.cta:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  @media (max-width: 640px) {
    body.golf-page .golf-main { padding: 20px 16px 56px; }
    body.golf-page .venue-cta-row .cta, body.golf-page .venue-cta-row .card-action { width: 100%; justify-content: center; }
  }
</style>`;
}

// Themed venue page polish (golf 2026-09-20; beach the same day for
// consistency): the hero is the page's single title treatment (it carries
// the <h1>), the block under it opens with the category/region meta line,
// and, for golf, an "At a glance" card summarises the course. These styles
// are emitted only on golf and beach venue pages (see renderVenuePage);
// every other page is byte-identical to before. Each type keeps its own
// SEO_PAGE_CSS hero gradient (green for golf, navy for beach).
function renderGolfVenuePolishStyles() {
  return `<style>
  /* Hero: same per-type gradient, a touch taller and with a soft light
     sweep so the flat panel reads as intentional; the page heading lives
     here. */
  body.golf-page .venue-hero-fallback {
    position: relative; min-height: 280px; padding: 34px 36px; border-radius: 14px;
  }
  body.golf-page .venue-hero-fallback.venue-hero-golf { box-shadow: 0 18px 34px -22px rgba(52,89,66,0.7); }
  body.golf-page .venue-hero-fallback.venue-hero-beach { box-shadow: 0 18px 34px -22px rgba(16,27,36,0.75); }
  body.golf-page .venue-hero-fallback.venue-hero-outdoor { box-shadow: 0 18px 34px -22px rgba(47,33,24,0.75); }
  body.golf-page .venue-hero-fallback::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.14), rgba(255,255,255,0) 55%),
      linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(16,32,22,0.28) 100%);
  }
  body.golf-page .venue-hero-fallback::after {
    content: ""; position: absolute; inset: 10px; pointer-events: none;
    border: 1px solid rgba(255,255,255,0.14); border-radius: 8px;
  }
  body.golf-page .venue-hero-fallback .venue-hero-type,
  body.golf-page .venue-hero-fallback h1 { position: relative; z-index: 1; }
  body.golf-page .venue-hero-fallback .venue-hero-type {
    font-family: 'Nunito', sans-serif; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(255,255,255,0.82); margin-bottom: 10px;
  }
  body.golf-page .venue-hero-fallback h1 {
    font-family: 'Fraunces', serif; font-weight: 600; line-height: 1.1;
    font-size: clamp(1.9rem, 3.6vw, 2.75rem); margin: 0; color: var(--ref-white); max-width: 22ch;
    text-shadow: 0 1px 2px rgba(16,32,22,0.25);
  }
  /* Under the hero: category/region meta first (no repeated title), then
     any badges, then the description. */
  body.golf-page .venue-header { margin: 0 0 14px; }
  body.golf-page .venue-header .venue-at-a-glance {
    margin: 0 0 8px; font-size: 0.86rem; font-weight: 700; letter-spacing: 0.02em;
    color: rgba(42,32,25,0.62); opacity: 1;
  }
  body.golf-page .venue-header .venue-at-a-glance a { color: var(--ref-navy); }
  body.golf-page .venue-header .venue-at-a-glance a:hover { color: var(--ref-gold); text-decoration: none; }
  body.golf-page .venue-header .chips:empty { display: none; }
  body.golf-page .venue-description { font-size: 1.06rem; line-height: 1.7; max-width: 72ch; margin: 0 0 22px; }
  /* Good to Know: let an unbreakable website URL (e.g. a StoryMaps hash)
     wrap instead of forcing a sideways scroll on phones; ordinary links
     are unaffected because they never overflow. */
  body.golf-page .venue-key-info .detail-row a { overflow-wrap: anywhere; }
  /* At a glance: the paper card system, with a compact label/value grid. */
  body.golf-page .venue-section.golf-glance { padding: 20px 22px 8px; }
  body.golf-page .golf-glance h2 { margin-bottom: 14px; }
  body.golf-page .golf-glance dl {
    display: grid; grid-template-columns: 1fr; gap: 0 28px; margin: 0;
  }
  @media (min-width: 640px) { body.golf-page .golf-glance dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1000px) { body.golf-page .golf-glance dl { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  body.golf-page .golf-glance .golf-glance-item {
    padding: 10px 0 12px; border-top: 1px solid rgba(27,43,58,0.1);
  }
  body.golf-page .golf-glance dt {
    font-family: 'Nunito', sans-serif; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(42,32,25,0.55); margin: 0 0 3px;
  }
  body.golf-page .golf-glance dd { margin: 0; font-size: 0.95rem; line-height: 1.45; color: var(--ink); }
  @media (max-width: 640px) {
    body.golf-page .venue-hero-fallback { min-height: 200px; padding: 22px 20px; }
    body.golf-page .venue-hero-fallback::after { inset: 8px; }
    body.golf-page .venue-hero-fallback h1 { font-size: 1.6rem; }
    body.golf-page .venue-section.golf-glance { padding: 16px 16px 4px; }
  }
</style>`;
}

// "At a glance" facts for golf venues. Every value is restated from the
// venue's owner-approved description (the 2026-09-19 Golf content pass,
// which only stated practice facilities confirmed by official-tier
// sources); nothing here comes from any other source, and a venue with
// no entry simply renders no card. Keyed by region/slug (stable across
// environments, unlike ids). Confirmed absences (e.g. no driving range)
// are kept because they are useful to golfers.
const GOLF_AT_A_GLANCE_FACTS = {
  'kelowna/gallaghers-canyon-canyon-course': [
    ['Course', '18 holes · par 72'],
    ['Access', 'Semi-private'],
    ['Driving range', '300-plus-yard, double-ended grass range'],
    ['Putting', 'Two putting greens'],
    ['Short game', 'Two chipping greens with bunkers'],
    ['Lessons', 'GBC Golf Academy'],
  ],
  'kelowna/gallaghers-canyon-pinnacle-course': [
    ['Course', '9 holes · par 32'],
    ['Access', 'Semi-private'],
    ['Driving range', '300-plus-yard, double-ended grass range (shared)'],
    ['Putting', 'Two putting greens'],
    ['Short game', 'Two bunkered chipping greens'],
    ['Lessons', 'GBC Golf Academy'],
  ],
  'kelowna/kelowna-golf-country-club': [
    ['Course', '18 holes · par 72 · parkland'],
    ['Established', '1920 (A.V. Macan)'],
    ['Access', 'Private, members only'],
    ['Driving range', 'Practice range with TopTracer'],
    ['Short game', 'Dedicated short-game area'],
    ['Lessons', 'PGA professionals'],
  ],
  'kelowna/tower-ranch-golf-country-club': [
    ['Designer', 'Thomas McBroom'],
    ['Access', 'Public'],
    ['Driving range', 'None — nets on site; partner range at World Beat Family Golf'],
    ['Clubhouse', 'Carrington’s Restaurant & Patio; fitness; events'],
  ],
  'kelowna/michaelbrook-golf-course': [
    ['Course', '18 holes · flat and walkable'],
    ['Pace', 'About 3 h 10 min for 18'],
    ['Ownership', 'City of Kelowna (since 2025), run by Monaghan Golf'],
    ['Clubhouse', 'Brookside Grill, dog-friendly patio'],
  ],
  'kelowna/black-mountain-golf-club': [
    ['Course', 'Par 71 · 6,400 yards'],
    ['Tees', 'Four sets'],
    ['Access', 'Public'],
    ['Lessons', 'PGA of Canada professionals'],
    ['Clubhouse', 'The Grill, valley-view patio'],
  ],
  'kelowna/sunset-ranch-golf-country-club': [
    ['Course', '18 holes · par 72 · 6,500 yards'],
    ['Access', 'Semi-private'],
    ['Driving range', 'None — hitting nets only'],
    ['Putting', 'Putting green'],
    ['Short game', 'Chipping green'],
    ['Lessons', 'Golf Academy'],
  ],
  'kelowna/okanagan-golf-club-bear-course': [
    ['Course', '18 holes · par 72 · 6,852 yards'],
    ['Designer', 'Jack Nicklaus'],
    ['Access', 'Semi-private (GolfBC)'],
    ['Driving range', 'Double-ended grass range'],
    ['Short game', 'Dedicated chipping and putting areas'],
    ['Lessons', 'GBC Golf Academy'],
  ],
  'kelowna/okanagan-golf-club-quail-course': [
    ['Course', '18 holes · par 71 · 6,576 yards'],
    ['Designer', 'Les Furber (1994)'],
    ['Access', 'Semi-private (GolfBC)'],
    ['Driving range', 'Double-ended grass range (shared)'],
    ['Short game', 'Dedicated chipping and putting greens'],
    ['Lessons', 'GBC Golf Academy'],
  ],
  'kelowna/mission-creek-golf-club': [
    ['Course', '18 holes · par 61 · under 3,900 yards'],
    ['Pace', 'Rounds typically inside three hours'],
    ['Putting', 'Large putting green'],
    ['Lessons', 'Golf instructor available'],
    ['Clubhouse', 'On-site restaurant'],
  ],
  'kelowna/shadow-ridge-golf-club': [
    ['Course', 'Par 71 · flat and walkable'],
    ['Putting', 'Putting practice area'],
    ['Rentals', 'Clubs and carts'],
    ['Pro shop', 'Well-stocked golf shop'],
    ['Clubhouse', 'Full-service restaurant'],
  ],
  'kelowna/kelowna-springs-golf-club': [
    ['Course', '9 holes · play twice for 18'],
    ['Designer', 'Les Furber (opened 1990)'],
    ['Practice', 'Warm-up areas on site'],
  ],
  'lumby/coldstream-golf-course': [
    ['Course', '9 holes · par 36 · 2,715 yards'],
    ['Driving range', 'Yes, with rental buckets'],
    ['Pro shop', 'Honesty cash box rather than a full shop'],
    ['Extras', 'Dry RV camping on site'],
  ],
  'enderby/mabel-lake-golf-country-club': [
    ['Course', '9 holes · par 36 (18-hole round, par 72)'],
    ['Designer', 'Les Furber'],
    ['Driving range', 'Yes'],
    ['Putting', 'Putting green'],
    ['Clubhouse', 'Restaurant overlooking the 9th green'],
    ['Extras', 'Marina, sandy beach, RV lots, cabins, grass airstrip'],
  ],
  'vernon/predator-ridge-predator-course': [
    ['Course', '18 holes · par 71 · 7,034 yards'],
    ['Designer', 'Les Furber (1991)'],
    ['Access', 'Alternates daily: members / public and resort guests'],
    ['Driving range', 'Grass tees with TopTracer'],
    ['Short game', 'Target greens and short-game area'],
    ['Lessons', 'Golf academy'],
  ],
  'vernon/predator-ridge-ridge-course': [
    ['Course', '18 holes · par 72 · 7,128 yards'],
    ['Designer', 'Doug Carrick (2010)'],
    ['Access', 'Alternates daily: members / public and resort guests'],
    ['Driving range', 'TopTracer range'],
    ['Short game', 'Target greens and short-game area'],
    ['Lessons', 'Golf academy'],
  ],
  'osoyoos/osoyoos-golf-club-park-meadows': [
    ['Course', '18 holes · par 72 · walker-friendly'],
    ['Driving range', '14-stall, full-length (shared with Desert Gold)'],
    ['Putting', 'Large putting green'],
    ['Short game', '80-yard area with target greens and a bunker'],
    ['Lessons', 'Golf Academy, PGA of Canada professionals'],
    ['Clubhouse', 'Greenside Bar & Grill, lake-view patio'],
  ],
  'osoyoos/osoyoos-golf-club-desert-gold': [
    ['Course', 'Links-style desert layout'],
    ['Driving range', '14-stall range (shared with Park Meadows)'],
    ['Putting', 'Large putting green'],
    ['Short game', '80-yard area with two target greens and a bunker'],
    ['Lessons', 'Golf Academy, PGA of Canada professionals'],
    ['Clubhouse', 'Greenside Bar & Grill, lakeview patio'],
  ],
  'kaleden/twin-lakes-golf-course': [
    ['Course', '18 holes · regulation length'],
    ['Driving range', 'Yes'],
    ['Putting', 'Putting green'],
    ['Short game', 'Chipping green'],
    ['Lessons', 'Twin Lakes Academy'],
    ['Pro shop', 'Yes'],
  ],
  'kelowna/harvest-golf-club': [
    ['Course', '18 holes · par 72'],
    ['Access', 'Semi-private'],
    ['Driving range', 'Grass and synthetic tees, target greens; open to non-members'],
    ['Putting', 'Big putting green'],
    ['Short game', 'Two chipping greens with sand bunkers'],
    ['Lessons', 'Harvest Golf Academy, PGA of Canada professionals'],
  ],
  'kelowna/orchard-greens-golf-club': [
    ['Course', '9 holes · par 32 · mid-length'],
    ['Night golf', 'Stadium-lit on Wednesday, Friday and Saturday evenings'],
    ['Rentals', 'Available'],
    ['Clubhouse', 'Miss Pat’s Kitchen'],
  ],
  'west-kelowna/shannon-lake-golf-club': [
    ['Course', '18 holes · par 70 · 6,294 yards'],
    ['Access', 'Semi-private with public tee times'],
    ['Driving range', 'None — on-site hitting cage'],
    ['Putting', 'Practice putting green'],
    ['Clubhouse', 'Wraparound deck over the lake; happy hour'],
  ],
  'west-kelowna/two-eagles-golf-course-academy': [
    ['Course', 'Par 65 · just over 5,000 yards'],
    ['Designer', 'Les Furber'],
    ['Access', 'Public'],
    ['Driving range', 'Private grass tees; heated hitting bays (year-round)'],
    ['Putting', '15,000-square-foot putting green'],
    ['Lessons', 'Full golf academy with coaching programs'],
  ],
  'penticton/penticton-golf-country-club': [
    ['Course', 'Par 70 · just over 6,100 yards · est. 1922'],
    ['Access', 'Public, municipal (City of Penticton)'],
    ['Driving range', 'Full range'],
    ['Putting', 'Several putting greens'],
    ['Short game', 'Dedicated short-game practice'],
    ['Lessons', 'PGA of Canada pros; junior, adult, corporate programs'],
  ],
  'penticton/skaha-meadows-golf-course': [
    ['Course', '9 holes · par 35 · 2,435 yards'],
    ['Access', 'Public tee times; memberships available'],
    ['Putting', 'Practice putting green'],
    ['Clubhouse', 'Patio and grill'],
    ['Extras', 'Ladies’ Night Wednesdays, Men’s Night Thursdays'],
  ],
  'penticton/pine-hills-golf-club': [
    ['Course', '9 holes · par 27 executive · just over 1,000 yards'],
    ['Rentals', 'Clubs and carts'],
    ['Pricing', 'Pay per round or annual pass'],
  ],
  'penticton/wow-golf-club': [
    ['Course', '9 holes · par 34'],
    ['Driving range', 'Large mat range, covered and uncovered'],
    ['Short game', 'Combined chipping and putting area'],
  ],
  'summerland/summerland-golf-country-club': [
    ['Course', '18 holes · flats front nine, canyon back nine'],
    ['Access', 'Semi-private with public tee times'],
    ['Driving range', '300-plus-yard range'],
    ['Putting', 'Two putting greens'],
    ['Short game', 'Chipping green and practice bunkers'],
    ['Lessons', 'PGA of Canada'],
  ],
  'summerland/sumac-ridge-golf-country-club': [
    ['Course', '9 holes · par 28 executive'],
    ['Access', 'Public, no membership needed'],
    ['Rentals', 'Equipment rentals on site'],
  ],
  'kaleden/st-andrews-by-the-lake-golf-resort': [
    ['Course', '9 holes · par 32'],
    ['Pro shop', 'Golf shop'],
    ['Clubhouse', 'Painted Turtle Bistro, lakeside deck'],
  ],
  'oliver/fairview-mountain-golf-club': [
    ['Course', '18 holes · par 72 · past 7,000 yards'],
    ['Driving range', 'Full range'],
    ['Putting', 'Expansive putting green'],
    ['Short game', 'Chipping area and bunker practice'],
    ['Lessons', 'PGA of Canada instruction; indoor fitting bay'],
    ['Clubhouse', 'Restaurant patio over the first tee'],
  ],
  'oliver/nkmip-canyon-desert-golf-course': [
    ['Course', 'Desert terrain · long par 4s and target-golf holes'],
    ['Ownership', 'Osoyoos Indian Band'],
    ['Driving range', '15-stall range'],
    ['Putting', 'Large putting green'],
    ['Short game', 'Chipping green with bunker; three practice holes'],
    ['Lessons', 'River Club Golf & Learning Center'],
  ],
  'osoyoos/sonora-dunes-golf-course': [
    ['Course', '9 holes · par 35'],
    ['Driving range', 'Yes'],
    ['Short game', 'Putting and chipping green'],
    ['Clubhouse', 'Renovated patio'],
  ],
  'vernon/rise-golf-course': [
    ['Course', '18 holes · par 72 · roughly 6,600 yards'],
    ['Designer', 'Fred Couples Signature with Gene Bates (2008)'],
    ['Tees', 'Six sets'],
    ['Access', 'Public tee times'],
    ['Clubhouse', 'The Edge Restaurant, 360-degree views'],
  ],
  'vernon/vernon-golf-country-club': [
    ['Course', 'Par 72 · roughly 6,600 yards · parkland'],
    ['Established', '1913'],
    ['Access', 'Semi-private with public tee times'],
    ['Driving range', 'Full range'],
    ['Putting', 'Putting greens'],
    ['Short game', 'Dedicated short-game area'],
  ],
  'armstrong/overlander-golf-event-centre': [
    ['Course', '9 holes · par 29 executive'],
    ['Putting', '11-hole natural-grass putting course, walk-on'],
    ['Extras', 'Glow-in-the-dark golf nights; social leagues'],
    ['Clubhouse', 'Clubhouse kitchen; event lawn'],
  ],
  'vernon/spallumcheen-golf-country-club-championship-course': [
    ['Course', '18 holes · par 71 · 6,423 yards'],
    ['Access', 'Semi-private, public play welcome'],
    ['Driving range', 'Full-length, targets from 50 to 260 yards'],
    ['Putting', 'Putting green'],
    ['Short game', 'Two chipping greens'],
    ['Lessons', 'PGA of Canada'],
  ],
  'vernon/spallumcheen-golf-country-club-executive-course': [
    ['Course', '9 holes · three par 5s'],
    ['Driving range', 'Full-length, targets out to 260 yards (shared)'],
    ['Putting', 'Putting green'],
    ['Short game', 'Two chipping greens'],
    ['Pro shop', 'Fully stocked (shared)'],
    ['Clubhouse', 'Clubhouse dining (shared)'],
  ],
  'vernon/hillview-golf-course': [
    ['Course', '18 holes · par 56 executive · 3,300-plus yards'],
    ['Driving range', 'Vernon’s longest'],
    ['Lessons', 'PGA professional, every level'],
    ['Pro shop', 'Stocks the major brands'],
  ],
  'kelowna/golf-evolution': [
    ['Technology', 'GC Hawk simulators'],
    ['Lessons', 'Certified PGA professional; club fitting, maintenance'],
    ['Access', 'Credit-based Evo Packs, good for a year'],
    ['Hours', 'Daily into the evening; coaching and fitting mornings'],
    ['Lounge', 'Food and drinks'],
  ],
  'kelowna/simplex-sportszone': [
    ['Technology', 'Trackman 4 and Full Swing'],
    ['Virtual courses', 'More than 400'],
    ['Lessons', 'In-house PGA golf coaches'],
    ['Extras', 'Multi-sport simulators, racing zone, licensed bar'],
    ['Events', 'Groups of up to 40'],
  ],
  'kelowna/anytime-sim-golf': [
    ['Bays', 'Private bays with Foresight Sports launch monitors'],
    ['Hours', '24/7, 365 days a year'],
    ['Booking', 'Online; CloudKey door entry, no front desk'],
  ],
  'kelowna/okanagan-virtual-golf': [
    ['Bays', 'Four'],
    ['Technology', 'Uneekor EYE XO2 on GSPro'],
    ['Virtual courses', 'Roughly 2,000'],
    ['Lounge', 'Fully licensed bar, big-screen seating'],
    ['Extras', 'Organized leagues; summer outdoor mini-putt'],
  ],
  'kelowna/jsquared-golf': [
    ['Technology', 'GCQUAD launch monitor'],
    ['Lessons', 'PGA of Canada professionals, all levels'],
    ['Hours', 'Daily, 8 a.m. to 10 p.m.'],
    ['Location', 'Gallagher’s Canyon property; Canyon Bar & Grill steps away'],
  ],
  'kelowna/fringe-indoor-golf': [
    ['Bays', 'Four Trackman iO bays (three open, one private room)'],
    ['Virtual courses', 'More than 300'],
    ['Hours', '24/7, staffless; secure mobile access'],
    ['Pricing', 'Hourly, with membership discounts'],
  ],
  'west-kelowna/golfbox': [
    ['Bays', 'Three private bays'],
    ['Technology', 'Trackman iO'],
    ['Hours', 'Open 24/7'],
    ['Extras', 'Upstairs boardroom for meetings'],
  ],
  'vernon/predator-ridge-sim-lounge': [
    ['Technology', 'Foresight Sports GCHawk and GCQuad'],
    ['Virtual courses', 'More than 90'],
    ['Booking', 'By phone only; one-hour blocks for up to four'],
    ['Season', 'Reopens each fall, runs through winter'],
    ['Lessons', 'PGA of Canada professional'],
  ],
  'vernon/back-nine-indoor-golf': [
    ['Bays', 'Three private bays'],
    ['Technology', 'Full Swing'],
    ['Hours', '24-hour access for members'],
    ['Booking', 'No membership required'],
    ['Extras', 'Junior and adult camps and clinics; leagues'],
  ],
  'penticton/okanagan-virtual-golf': [
    ['Bays', 'Three, plus a four-camera training bay'],
    ['Virtual courses', 'More than 400'],
    ['Lessons', 'Instructors connected to Summerland Golf Club'],
    ['Hours', 'Into the evening most days'],
    ['Extras', 'Winter scramble leagues'],
  ],
};

function golfAtAGlanceHtml(venue) {
  if (venue.type !== 'golf' || venue.redirect_to) return '';
  const facts = GOLF_AT_A_GLANCE_FACTS[`${venue.region}/${venue.slug}`];
  if (!facts || !facts.length) return '';
  const items = facts
    .map(([lbl, val]) => `<div class="golf-glance-item"><dt>${escapeHtml(lbl)}</dt><dd>${escapeHtml(val)}</dd></div>`)
    .join('\n      ');
  return `<div class="venue-section golf-glance">
    <h2>At a glance</h2>
    <dl>
      ${items}
    </dl>
  </div>`;
}

// Category-page behaviour for Golf cards: the clamp class is applied only
// once JS runs (so no-JS readers always see the full text), the Read more
// control is revealed only when the text is actually truncated, the
// toggle is inline with aria-expanded/aria-controls, and impressions
// (>=50% visible, once per card per page view) plus expand/collapse are
// reported through window.trackEvent.
// Outdoor surfaces (2026-09-22) list every OUTDOOR_ACTIVITY_VENUE_TYPES
// record (a beach-type activity member renders as a beach card there), so
// on those pages the card selector covers each allowlisted type -- the
// clamp / Read more, impressions and favourite/trip mirroring then apply
// to every card on the page and the reported venue_category is the
// card's own. Golf and Beach pages' scripts are byte-identical to before.
function themedCardHolderSelector(type) {
  // 'fd' is the Food & Drink hub, whose one list mixes all five Food & Drink
  // types; without this its non-restaurant cards got no engagement wiring at
  // all, so their Favorite / Add to Trip buttons did nothing.
  if (type === 'fd') return `:is(${FOOD_DRINK_TYPES.map((t) => `[data-venue-category="${t}"]`).join(',')})`;
  // 'dog' is the Dog Friendly Finds hub, whose one list mixes the five Food &
  // Drink types, wineries and the curated dog beaches.
  if (type === 'dog') return `:is(${DOG_HUB_VENUE_TYPES.map((t) => `[data-venue-category="${t}"]`).join(',')})`;
  // 'lf' is the Local Favourites page, whose one list can hold any venue type.
  if (type === 'lf') return `:is(${Object.keys(CATEGORY_SLUGS).map((t) => `[data-venue-category="${t}"]`).join(',')})`;
  if (type !== 'outdoor') return `[data-venue-category="${type}"]`;
  return `:is(${OUTDOOR_ACTIVITY_VENUE_TYPES.map((t) => `[data-venue-category="${t}"]`).join(',')})`;
}
function golfCardEngagementScriptHtml(type, themed = usesThemedCategoryLayout(type)) {
  if (!themed) return '';
  return `<script>
(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('.venue-card${themedCardHolderSelector(type)}'));
  if (!cards.length) return;
  function ctx(card){
    return {
      venue_id: Number(card.dataset.venueId),
      venue_name: card.dataset.venueName,
      venue_region: card.dataset.venueRegion,
      venue_category: ${(type === 'outdoor' || type === 'fd') ? `card.dataset.venueCategory || '${type}'` : `'${type}'`},
      surface: card.dataset.surface || 'category_card',
      page_path: location.pathname
    };
  }
  function track(name, params){ if (window.trackEvent) window.trackEvent(name, params); }
  var MORE = 'Read more \\u2192', LESS = 'Read less \\u2191';
  function isTruncated(p){ return p.scrollHeight > p.clientHeight + 1; }
  function setup(card){
    var desc = card.querySelector('.golf-desc');
    var btn = card.querySelector('.desc-toggle');
    if (!desc || !btn) return;
    var p = desc.querySelector('p');
    if (!p) return;
    desc.classList.add('is-clamped');
    btn.hidden = !isTruncated(p);
    btn.addEventListener('click', function(){
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      desc.classList.toggle('is-clamped', expanded);
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      btn.textContent = expanded ? MORE : LESS;
      track(expanded ? 'description_collapse' : 'description_expand', ctx(card));
    });
    card._golfRecheck = function(){
      if (btn.getAttribute('aria-expanded') === 'true') return;
      btn.hidden = !isTruncated(p);
    };
  }
  cards.forEach(setup);
  var resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      cards.forEach(function(c){ if (c._golfRecheck) c._golfRecheck(); });
    }, 150);
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (!en.isIntersecting || en.intersectionRatio < 0.5) return;
        io.unobserve(en.target);
        track('venue_impression', ctx(en.target));
      });
    }, { threshold: 0.5 });
    cards.forEach(function(c){ io.observe(c); });
  }

  // ---- Favorite + Add to Trip: same localStorage keys, item shape and
  // name-keyed de-duplication as the homepage app (okanaganFavorites is an
  // array of venue names; okanaganTrip is [{name, query, region}], capped
  // at MAX_STOPS), so the existing Trip Planner and favourites filter see
  // exactly what was chosen here.
  // Additive hook (2026-09-24): a page that reveals more venue cards after
  // load -- the Food & Drink hub's "Show more" -- calls this so those cards
  // get exactly this wiring (description clamp / Read more, impression
  // tracking, Favorite / Add to Trip state) rather than a divergent copy.
  // Click handling already works for them without this, because the
  // Favorite/Trip listeners are delegated on document. Nothing here runs
  // unless a page calls it, so every other page is unaffected.
  //
  // This sits ABOVE golfFavTripScriptBody on purpose: that body returns out
  // of this IIFE when app.js is present, so anything after it is dead code.
  // syncAll is a hoisted function declaration in the same scope, so calling
  // it from here still works.
  window.__ogWireVenueCards = function(list){
    (list || []).forEach(function(card){
      if (!card || card.__ogWired) return;
      card.__ogWired = true;
      cards.push(card);
      setup(card);
      if (typeof io !== 'undefined' && io) io.observe(card);
    });
    if (typeof syncAll === 'function') syncAll();
  };
${golfFavTripScriptBody(type)}
})();
</script>`;
}

// Venue-page behaviour for a Golf venue: one delegated click listener on
// the existing Visit Website / Get Directions / Call links (and the
// matching Good-to-Know and map links), reporting the established
// outbound_click event with link_type plus venue identity, and one
// venue_view on load so page-level impressions carry venue_id too.
function golfVenueEngagementScriptHtml(venue) {
  if (!usesEngagementControls(venue.type)) return '';
  const pageCtx = JSON.stringify({
    venue_id: venue.id,
    venue_name: venue.name,
    venue_region: venue.region,
    venue_category: venue.type,
    surface: 'venue_page',
  }).replace(/</g, '\\u003c');
  return `<script>
(function(){
  var pageCtx = ${pageCtx};
  function ctx(){ var c = {}; for (var k in pageCtx) c[k] = pageCtx[k]; return c; }
  function track(name, params){ if (window.trackEvent) window.trackEvent(name, params); }
  track('venue_view', ctx());
  document.addEventListener('click', function(e){
    var link = e.target.closest('a[data-track]');
    if (!link) return;
    var params = ctx();
    params.link_type = link.getAttribute('data-track');
    track('outbound_click', params);
  });
${golfFavTripScriptBody(venue.type)}
})();
</script>`;
}

function pageHead(title, description, canonical, jsonLdBlocks, opts = {}) {
  // golfTheme (2026-09-19): Golf pages also load the homepage stylesheet
  // (before the inline SEO CSS, so existing SEO rules still win ties) and
  // the body.golf-page overrides. Every other page's head is unchanged.
  // beachTheme (2026-09-19): Beach pages reuse the Golf theme unchanged and
  // add only the beach-attribute variants of its card rules (derived from
  // the Golf rules, see renderBeachThemeStyles) plus, when the page
  // carries one, the advisory-notice styles. Golf pages' head is
  // byte-identical to before.
  const { noindex = false, golfTheme = false, beachTheme = false, outdoorTheme = false, advisoryStyles = false, golfDataStyles = false } = opts;
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="https://okanaganroam.com/og-image.png">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${jsonLdBlocks.map((block) => `<script type="application/ld+json">\n${JSON.stringify(block)}\n</script>`).join('\n')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/tokens.css">
${golfTheme ? '<link rel="stylesheet" href="/styles/app.css">\n' : ''}<style>${SEO_PAGE_CSS}</style>${golfTheme ? '\n' + renderGolfThemeStyles() : ''}${beachTheme ? '\n' + renderBeachThemeStyles() : ''}${outdoorTheme ? '\n' + renderOutdoorThemeStyles() : ''}${advisoryStyles ? '\n' + renderAdvisoryStyles() : ''}${golfDataStyles && golfData ? '\n' + golfData.GOLF_DATA_CSS : ''}`;
}

function siteHeader(rightLinkHref, rightLinkText) {
  return `<header class="top">
    <a class="brand" href="https://okanaganroam.com/">Okanagan Roam</a>
    <a href="${rightLinkHref}">${escapeHtml(rightLinkText)}</a>
  </header>`;
}

// No longer called anywhere (footer canonicalization, 2026-09-19): every
// page that used to render this minimal one-liner now renders the same
// renderHomeFooterHTML(true) as the homepage instead. Left defined,
// unused, rather than deleted, to keep this change strictly additive/
// substitutive -- the matching `footer.site-footer` CSS rule in
// SEO_PAGE_CSS is similarly harmless now that nothing emits that class.
function siteFooter() {
  return `<footer class="site-footer">Okanagan Roam &middot; <a href="https://okanaganroam.com/">okanaganroam.com</a></footer>`;
}

// ---------- Phase 5 Sprint 1 — shared presentation components ----------
// Small, reusable functions extending the pageHead/siteHeader/siteFooter
// pattern already established above. Each one replaces markup that was
// previously duplicated (in slightly different shapes) across two or more
// of the four render*Page functions below. Nothing here changes any URL,
// slug, canonical, JSON-LD, or metadata behavior — these only produce the
// human-visible HTML fragments that sit inside the unchanged page shells.

// Visible breadcrumb <nav>, as opposed to breadcrumbListSchema() above
// (which produces the separate, JSON-LD structured-data version of the
// same information). items: [{ name, href }], in order from Home to the
// current page. The current/last item is rendered as plain text, not a
// link, matching every existing call site's behavior.
function breadcrumbNavHtml(items) {
  const parts = items.map((item, i) => {
    const isLast = i === items.length - 1;
    return isLast || !item.href
      ? escapeHtml(item.name)
      : `<a href="${item.href}">${escapeHtml(item.name)}</a>`;
  });
  return `<nav class="breadcrumb">${parts.join(' &rsaquo; ')}</nav>`;
}

// The `<span class="chip">` badge row used on venue/category/guide pages —
// one chip per true boolean amenity flag on the venue. Identical output to
// what all three call sites built inline before this extraction.
function badgeChipsHtml(venue) {
  return BOOL_FIELDS.filter((f) => venue[f])
    .map((f) => `<span class="chip">${escapeHtml(BADGE_LABELS[f].title)}</span>`)
    .join(' ');
}

// The `<li class="venue-card">` list-item used on category and guide
// pages. The two previous call sites differed only in whether the venue
// type itself appears in the meta line (guide pages, which mix
// categories, show it; category pages, which are already scoped to one
// category, don't) and in how defensively the name needs to be linked
// (guide pages tolerate a venue with no slug/category mapping yet by
// falling back to plain text; category pages always have both). Both
// behaviors are preserved exactly via the options below.
function venueCardHtml(venue, opts = {}) {
  // advisoryNote (2026-09-19): the venue's current temporary-condition
  // note from the 'advisory' collection, or undefined/null for none. When
  // absent nothing extra is rendered, so cards without an advisory are
  // byte-identical to before.
  // dogFriendlyNote (2026-09-19): undefined/null = not a member; a string
  // (possibly '') = member of the 'dog_friendly' collection, note = official restriction.
  // showRegion (2026-09-20): on the Okanagan-wide category listing the card
  // leads its meta line with the venue's own community (REGION_LABELS of
  // venue.region -- the same canonical value the venue page, breadcrumb
  // and URL use), so identically named venues in different communities
  // are distinguishable without opening them. Off by default, so every
  // other surface's card markup is unchanged.
  // dogNoteInline (2026-09-24): the Dog Friendly Finds hub renders the
  // official restriction that comes with a dog-beach membership as a VISIBLE
  // line on the card instead of leaving it in the badge's title= tooltip --
  // "off-leash only inside the fence" or "not on the swimming beach" is the
  // single most important thing on that card and a tooltip does not exist on
  // a phone. Off by default, so /beaches, /outdoors, region, category and
  // venue pages keep byte-identical markup.
  // showTypeLabel (2026-09-24): the Local Favourites page mixes every venue
  // type in one list, so its cards name the category ("Restaurant",
  // "Outdoor Destination") in the meta line. Off by default, so every other
  // surface's card markup is unchanged.
  const { showType = false, showTypeLabel = false, isHiddenGem = false, isLocalFavourite = false, advisoryNote = null, dogFriendlyNote = null, dogNoteInline = false, showRegion = false, themed = usesThemedCategoryLayout(venue.type), actions = themed, golfFeeHtml = '' } = opts;
  const catSlug = CATEGORY_SLUGS[venue.type];
  const href = (venue.slug && catSlug) ? `/${venue.region}/${catSlug}/${venue.slug}` : null;
  // Golf-only: the name stays the single link to the venue page, but it
  // becomes a block-level tap target carrying a small "View details"
  // cue (aria-hidden, so the accessible link name is still just the venue
  // name). Styled by the golf theme; every other category's title markup
  // is unchanged.
  const nameHtml = href
    ? (themed
      ? `<a class="venue-card-link" href="${href}"><span class="venue-card-name">${escapeHtml(venue.name)}</span><span class="venue-card-cue" aria-hidden="true">View details &rarr;</span></a>`
      : `<a href="${href}">${escapeHtml(venue.name)}</a>`)
    : escapeHtml(venue.name);
  const meta = [
    showRegion && REGION_LABELS[venue.region] ? escapeHtml(REGION_LABELS[venue.region]) : null,
    showType && venue.type ? escapeHtml(venue.type) : null,
    showTypeLabel && CATEGORY_LABELS[venue.type] ? escapeHtml(CATEGORY_LABELS[venue.type].singular) : null,
    venue.cuisine ? escapeHtml(venue.cuisine) : null,
    venue.rating ? `${venue.rating}\u2605` : null,
  ].filter(Boolean).join(' &middot; ');
  // Golf-only (2026-09-19): the description is wrapped so the page script
  // can clamp it to ~4 lines and toggle it inline; the button ships hidden
  // and is revealed only when the text is actually truncated. Every other
  // category renders exactly what it did before.
  // `isGolf` now means "uses the themed (Golf-style) card": Golf and, since
  // 2026-09-19, Beaches (THEMED_CATEGORY_TYPES). Golf output is unchanged.
  const isGolf = themed;
  const descId = `golf-desc-${venue.id}`;
  const desc = !venue.description ? '' : isGolf
    ? `<div class="golf-desc" id="${descId}"><p>${escapeHtml(venue.description)}</p></div>
        <button type="button" class="desc-toggle" aria-expanded="false" aria-controls="${descId}" hidden>Read more &rarr;</button>`
    : `<p>${escapeHtml(venue.description)}</p>`;
  // Emitted for themed cards and for ENGAGEMENT_ONLY_TYPES cards alike: the
  // shared engagement script locates a card by data-venue-category, so an
  // unthemed card carrying the controls needs these attributes too. They are
  // data attributes only -- no themed CSS rule matches a non-golf category.
  const liAttrs = (isGolf || actions)
    ? ` data-venue-id="${venue.id}" data-venue-region="${escapeHtml(venue.region)}" data-venue-category="${escapeHtml(venue.type)}" data-venue-name="${escapeHtml(venue.name)}" data-surface="category_card"`
    : '';
  // Golf-only (2026-09-19): the listing card's only actions are Favorite
  // and Add to Trip (golfFavTripButtonsHtml). Website / phone / directions
  // live on the venue page instead -- the data is untouched, only where it
  // is shown. Rendered inline after the chips line, so non-Golf cards stay
  // byte-identical to their pre-feature markup (no stray blank line).
  const cardActions = actions
    ? `
        <div class="card-actions">
          ${golfFavTripButtonsHtml(venue)}
        </div>`
    : '';
  // Defensive: never show the badge for a retired/redirected venue, even
  // if a caller ever passed isHiddenGem=true for one by mistake — the
  // bulk/targeted lookups already exclude these, but this keeps the
  // guarantee local to the render function itself, not just its callers.
  const showBadge = isHiddenGem && !venue.redirect_to;
  const showLocalFavourite = isLocalFavourite && !venue.redirect_to;
  const showDogFriendly = dogFriendlyNote !== null && dogFriendlyNote !== undefined && !venue.redirect_to;
  const editorialChips = (showBadge ? hiddenGemBadgeHtml() + ' ' : '') + (showLocalFavourite ? localFavouriteBadgeHtml() + ' ' : '') + (showDogFriendly ? dogFriendlyBadgeHtml(dogFriendlyNote) + ' ' : '');
  const dogNoteHtml = (dogNoteInline && showDogFriendly && String(dogFriendlyNote || '').trim())
    ? `\n        <p class="dog-note"><span class="dog-note-label">Dogs:</span> ${escapeHtml(String(dogFriendlyNote).trim())}</p>`
    : '';
  const advisoryHtml = (advisoryNote !== null && advisoryNote !== undefined && !venue.redirect_to)
    ? `\n        ${advisoryNoticeHtml(advisoryNote)}`
    : '';
  return `
      <li class="venue-card"${liAttrs}>
        <h2>${nameHtml}</h2>
        <p class="venue-meta">${meta}</p>${golfFeeHtml ? '\n        ' + golfFeeHtml : ''}
        ${desc}${advisoryHtml}${dogNoteHtml}
        <p class="chips">${editorialChips}${badgeChipsHtml(venue)}</p>${cardActions}
      </li>`;
}

// GET /:region — region hub page
function renderRegionPage(region, categoryCounts, regionGuidePages) {
  const regionLabel = REGION_LABELS[region];
  const totalVenues = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const title = `${regionLabel} Restaurants, Wineries & More, BC | Okanagan Roam`;
  const description = `${totalVenues} verified venues in ${regionLabel}, BC — restaurants, wineries, breweries, golf courses, and more, all reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com/${region}`;

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: canonical },
  ]);

  const categories = destinationCategories(region, categoryCounts);
  const byKey = new Map(categories.map((c) => [c.key, c]));
  const categoryCard = (c) => (c.href
    ? `
      <li class="category-card">
        <h2><a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a></h2>
        <p class="venue-meta">${c.count} ${c.count === 1 ? c.nounOne : c.nounMany} in ${escapeHtml(regionLabel)}</p>
      </li>`
    : `
      <li class="category-card category-card-empty" aria-disabled="true">
        <h2>${escapeHtml(c.label)}</h2>
        <p class="venue-meta">None listed in ${escapeHtml(regionLabel)} yet</p>
      </li>`);
  const categorySections = DESTINATION_CATEGORY_GROUPS.map((g) => `<h2 class="category-subsection-heading">${escapeHtml(g.label)}</h2>
  <ul class="card-grid">
    ${g.keys.map((k) => categoryCard(byKey.get(k))).join('\n')}
  </ul>`).join('\n  ');

  // H1 Step 2 (2026-09-22): a short "Upcoming events in {Region}" block, built
  // from the same live predicate as the sitemap and the event-page block, so
  // links vanish by themselves as events expire. Direct canonical event URLs
  // only; the filtered What's On view is the secondary "see all" link. Reuses
  // the .related-section/.related-grid/.related-card styles this page already
  // loads, so no new CSS. Renders nothing for a region below the threshold.
  const upcomingEvents = listUpcomingEventsForRegion(region, { limit: 3 });
  const eventLinks = upcomingEvents.length
    ? `<div class="related-section">
        <h2>Upcoming events in ${escapeHtml(regionLabel)}</h2>
        <div class="related-grid">
${upcomingEvents.map((e) => {
      const when = upcomingEventDateLabel(e.nextDate, e.nextEndDate);
      const cat = e.primaryCategory && WHATSON_CATEGORY_BY_KEY[e.primaryCategory] ? WHATSON_CATEGORY_BY_KEY[e.primaryCategory].label : '';
      const meta = [when, cat].filter(Boolean).map(escapeHtml).join(' &middot; ');
      return `          <div class="related-card"><a href="/${e.region}/events/${e.slug}">${escapeHtml(e.name)}</a>${meta ? `<p class="related-meta">${meta}</p>` : ''}</div>`;
    }).join('\n')}
        </div>
        <p><a href="/whats-on?regions=${encodeURIComponent(region)}">See what&rsquo;s on in ${escapeHtml(regionLabel)} &rarr;</a></p>
      </div>`
    : '';

  const guideLinks = regionGuidePages.length
    ? `<div class="related-section">
        <h2>Browse ${escapeHtml(regionLabel)} by what matters to you</h2>
        <p>${regionGuidePages
          .map((c) => `<a href="/guide/${c.region}/${c.badge}">${escapeHtml(BADGE_LABELS[c.badge].title)} (${c.count})</a>`)
          .join(', ')}</p>
      </div>`
    : '';

  // Destination mini-directory (2026-09-25): the same themed shell as
  // /food-drink and /local-favorites (homepage header, Trip tray, footer),
  // with the destination's categories as pill tabs above the existing
  // category cards. Every tab and card is a category with at least one
  // active venue, linking to its /{region}/{category} page.
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb], { golfTheme: true })}
${renderOutdoorThemeStyles()}
${renderDestinationCategoryStyles()}
${golfEngagementHeadHtml('fd', true)}
</head>
<body class="golf-page outdoor-page region-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel },
  ])}
  <h1>${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${totalVenues} verified venues across ${Object.keys(categoryCounts).length} categories in ${escapeHtml(regionLabel)}.</p>
  ${regionCategoryTabsHtml(region, categoryCounts, null, categories)}
  ${categorySections}
  ${eventLinks ? `${eventLinks}\n  ` : ''}${guideLinks}
  <a class="cta" href="https://okanaganroam.com/">See all of ${escapeHtml(regionLabel)} on Okanagan Roam</a>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
</body>
</html>`;
}

// Destination categories (2026-09-25): every destination page lists the
// same 14 categories in one fixed order -- Food & Drink, then Experiences,
// then Discovery. A category with results links to the page that shows
// exactly them; a category with none stays visible but is not a link, so a
// visitor is never sent to a page we know is empty. Counts come only from
// existing data:
//   venue types      -> active venues of that primary type (the same count
//                       and the same /{region}/{category} page as before)
//   What's On        -> the destination page's own upcoming-events rule
//                       (listUpcomingEventsForRegion, incl. its minimum),
//                       linked to What's On over the next year so every
//                       counted event is on the page
//   Dog-Friendly     -> the /dog-friendly hub list for the region
//   Local Favourites -> the local_favorite collection for the region
//   Hidden Gems      -> the hidden_gem collection for the region
const DESTINATION_CATEGORY_GROUPS = [
  { label: 'Food & Drink', keys: ['restaurant', 'cafe', 'pub', 'winery', 'brewery', 'distillery', 'cocktail'] },
  { label: 'Experiences', keys: ['golf', 'beach', 'outdoor'] },
  { label: 'Discovery', keys: ['whats-on', 'dog-friendly', 'local-favourites', 'hidden-gems'] },
];
const DESTINATION_CATEGORY_ORDER = DESTINATION_CATEGORY_GROUPS.flatMap((g) => g.keys);
const DESTINATION_DISCOVERY_LABELS = {
  'whats-on': { plural: 'What\u2019s On', nounOne: 'upcoming event', nounMany: 'upcoming events' },
  'dog-friendly': { plural: 'Dog-Friendly Finds', nounOne: 'dog-friendly find', nounMany: 'dog-friendly finds' },
  'local-favourites': { plural: 'Local Favourites', nounOne: 'local favourite', nounMany: 'local favourites' },
  'hidden-gems': { plural: 'Hidden Gems', nounOne: 'hidden gem', nounMany: 'hidden gems' },
};
const DESTINATION_EVENTS_WINDOW_DAYS = 365; // within What's On's MAX_CUSTOM_WINDOW_DAYS
function destinationCategories(region, categoryCounts, now = new Date()) {
  const inRegion = (list) => list.filter((v) => v.region === region).length;
  const today = todayLocal(now);
  const discovery = {
    'whats-on': {
      count: listUpcomingEventsForRegion(region, { limit: Number.MAX_SAFE_INTEGER, now }).length,
      href: `/whats-on?regions=${encodeURIComponent(region)}&when=custom&from=${today}&to=${addLocalDays(today, DESTINATION_EVENTS_WINDOW_DAYS)}`,
    },
    'dog-friendly': { count: inRegion(getDogFriendlyHubVenues()), href: `/dog-friendly?regions=${encodeURIComponent(region)}` },
    'local-favourites': { count: inRegion(getLocalFavouriteVenues()), href: `/local-favorites?regions=${encodeURIComponent(region)}` },
    'hidden-gems': { count: inRegion(getHiddenGemCollectionVenues()), href: `/hidden-gems?regions=${encodeURIComponent(region)}` },
  };
  return DESTINATION_CATEGORY_ORDER.map((key) => {
    if (CATEGORY_SLUGS[key]) {
      const count = categoryCounts[key] || 0;
      const l = CATEGORY_LABELS[key];
      return { key, type: key, label: l.plural, nounOne: l.singular.toLowerCase(), nounMany: l.plural.toLowerCase(), count, href: count >= MIN_CATEGORY_VENUES ? `/${region}/${CATEGORY_SLUGS[key]}` : null };
    }
    const l = DESTINATION_DISCOVERY_LABELS[key];
    const d = discovery[key];
    return { key, type: null, label: l.plural, nounOne: l.nounOne, nounMany: l.nounMany, count: d.count, href: d.count > 0 ? d.href : null };
  });
}
// The destination's category tabs: the existing pill selector
// (.category-region-selector, the same control the Okanagan-wide category
// pages and Outdoors use) with every category's count, in the fixed order.
// On a destination category page the current category is the static active
// pill; an empty category is a non-link pill marked aria-disabled.
function regionCategoryTabsHtml(region, categoryCounts, currentType, categories = null) {
  const cats = categories || destinationCategories(region, categoryCounts);
  const pills = cats.map((c) => {
    const label = escapeHtml(c.label);
    const count = `<span class="outdoor-activity-count">${c.count}</span>`;
    if (c.type && c.type === currentType) return `<span class="category-region-selector-active" aria-current="page">${label}${count}</span>`;
    if (!c.href) return `<span class="category-region-selector-empty" aria-disabled="true" title="None listed in ${escapeHtml(REGION_LABELS[region])} yet">${label}${count}</span>`;
    return `<a href="${escapeHtml(c.href)}">${label}${count}</a>`;
  }).join('\n      ');
  return `<nav class="category-region-selector region-category-tabs" aria-label="${escapeHtml(REGION_LABELS[region])} categories">
      ${pills}
    </nav>`;
}
// ---------- /destinations (2026-09-25) ----------
// "Choose Your Okanagan Destination": every destination whose /{region}
// page renders, exactly once, grouped by the site's existing
// FOOTER_REGION_GROUPS (Central / South / North / Ski resorts, then any
// region not in a group). Each card links to the region's existing page.
// Same shell and card styles as the destination pages; no search, no
// filters, no venue listings.
function destinationRegionEntries() {
  const entries = [];
  const placed = new Set();
  const groups = FOOTER_REGION_GROUPS.map((g) => ({ label: g.label, regions: g.regions.filter((r) => REGION_LABELS[r]) }));
  groups.forEach((g) => g.regions.forEach((r) => placed.add(r)));
  const other = Object.keys(REGION_LABELS).filter((r) => !placed.has(r));
  if (other.length) groups.push({ label: 'Other', regions: other });
  for (const g of groups) {
    const regions = g.regions.map((r) => {
      const counts = getRegionCategoryCounts(r);
      return { region: r, label: REGION_LABELS[r], venues: Object.values(counts).reduce((a, b) => a + b, 0), categories: Object.keys(counts).length };
    }).filter((x) => x.categories > 0);
    if (regions.length) entries.push({ label: g.label, regions });
  }
  return entries;
}
function renderDestinationsPage(entries = destinationRegionEntries()) {
  const title = 'Okanagan Destinations | Okanagan Roam';
  const description = 'Choose an Okanagan destination, from Enderby to Osoyoos and the ski resorts, and see its restaurants, wineries, beaches, outdoor places, events and more on Okanagan Roam.';
  const canonical = 'https://okanaganroam.com/destinations';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Destinations', url: canonical },
  ]);
  const sections = entries.map((g) => `<h2 class="category-subsection-heading">${escapeHtml(g.label)}</h2>
  <ul class="card-grid">
    ${g.regions.map((r) => `
      <li class="category-card">
        <h2><a href="/${r.region}">${escapeHtml(r.label)}</a></h2>
        <p class="venue-meta">${r.venues} verified venue${r.venues === 1 ? '' : 's'} across ${r.categories} categor${r.categories === 1 ? 'y' : 'ies'}</p>
      </li>`).join('\n')}
  </ul>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb], { golfTheme: true })}
${renderOutdoorThemeStyles()}
${golfEngagementHeadHtml('fd', true)}
</head>
<body class="golf-page outdoor-page region-page destinations-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: 'Destinations' },
  ])}
  <h1>Choose Your Okanagan Destination</h1>
  <p class="subtitle">Every destination on Okanagan Roam, from Enderby to Osoyoos and the ski resorts. Pick one to see its restaurants, wineries, beaches, outdoor places, events and more.</p>
  ${sections}
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
</body>
</html>`;
}

// ---------- All Categories page (2026-09-26): /categories ----------
// The destination for the homepage's "Explore all categories" link: a plain
// directory of the site's visitor-facing categories, grouped the same way as
// DESTINATION_CATEGORY_GROUPS, each linking to that category's existing page
// (never /browse). Food & Drink types open the /food-drink hub pre-filtered
// with its own ?types= chips. A category whose page would 404 today (no
// venues yet) is left out, using the same getters and minimum as its route.
// Taglines reuse CATEGORY_TAGLINES and the Hidden Gems card blurbs where
// they exist.
function categoryDirectoryEntries() {
  const has = (list) => list.length >= MIN_CATEGORY_VENUES;
  const typeEntry = (type, href) => ({ label: CATEGORY_LABELS[type].plural, href, tagline: CATEGORY_TAGLINES[type] || null });
  const foodDrink = has(getFoodDrinkHubVenues()) ? [
    { label: 'All Food & Drink', href: '/food-drink', tagline: 'Every restaurant, cafe, pub, brewery, distillery and lounge in one place.' },
    ...FOOD_DRINK_TYPES.map((t) => typeEntry(t, `/food-drink?types=${t}`)),
  ] : [];
  if (has(getVenuesByCategory('winery'))) foodDrink.push(typeEntry('winery', `/${CATEGORY_SLUGS.winery}`));
  const cocktail = foodDrink.find((e) => e.href === '/food-drink?types=cocktail');
  if (cocktail) cocktail.tagline = 'Cocktail bars and lounges for an evening out.';

  const experiences = [];
  if (has(getVenuesByCategory('golf'))) experiences.push(typeEntry('golf', `/${CATEGORY_SLUGS.golf}`));
  if (has(getVenuesByCategory('beach'))) experiences.push(typeEntry('beach', `/${CATEGORY_SLUGS.beach}`));
  if (has(getOutdoorLandingVenues())) experiences.push({ label: 'Outdoors', href: `/${CATEGORY_SLUGS.outdoor}`, tagline: 'Parks, trails, viewpoints and ski hills across the valley.' });

  const discovery = [{ label: 'What’s On', href: '/whats-on', tagline: 'Festivals, markets, concerts and events around the Okanagan.' }];
  if (has(getDogFriendlyHubVenues())) discovery.push({ label: 'Dog-Friendly Finds', href: '/dog-friendly', tagline: 'Patios and trails where your dog belongs.' });
  if (has(getLocalFavouriteVenues())) discovery.push({ label: 'Local Favourites', href: '/local-favorites', tagline: 'The spots locals keep coming back to.' });
  if (has(getHiddenGemCollectionVenues())) discovery.push({ label: 'Hidden Gems', href: '/hidden-gems', tagline: 'Less crowds. More Okanagan.' });
  if (has(getSecretSpotVenues())) discovery.push({ label: 'Secret Spots', href: '/secret-spots', tagline: 'Quiet corners away from the crowds.' });

  return [
    { label: 'Food & Drink', categories: foodDrink },
    { label: 'Experiences', categories: experiences },
    { label: 'Discovery', categories: discovery },
  ].filter((g) => g.categories.length > 0);
}

function renderCategoriesPage(entries = categoryDirectoryEntries()) {
  const title = 'Explore All Categories | Okanagan Roam';
  const description = 'Browse every Okanagan Roam category, from restaurants, cafes and wineries to golf, beaches, the outdoors, events and hidden gems.';
  const canonical = 'https://okanaganroam.com/categories';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'All Categories', url: canonical },
  ]);
  const sections = entries.map((g) => `<h2 class="category-subsection-heading">${escapeHtml(g.label)}</h2>
  <ul class="card-grid">
    ${g.categories.map((c) => `
      <li class="category-card">
        <h2><a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a></h2>${c.tagline ? `
        <p class="venue-meta">${escapeHtml(c.tagline)}</p>` : ''}
      </li>`).join('\n')}
  </ul>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb], { golfTheme: true })}
${renderOutdoorThemeStyles()}
${golfEngagementHeadHtml('fd', true)}
</head>
<body class="golf-page outdoor-page region-page categories-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: 'All Categories' },
  ])}
  <h1>Explore All Categories</h1>
  <p class="subtitle">Everything Okanagan Roam covers, in one place. Pick a category to see the places, events and collections in it across the valley.</p>
  ${sections}
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
</body>
</html>`;
}

// The zero-results treatment for destination tabs and cards: the existing
// pill/card shapes and navy text, dimmed and not interactive. Loaded only by
// the destination hub and destination category pages.
function renderDestinationCategoryStyles() {
  return `<style>
  body.golf-page .category-region-selector .category-region-selector-empty {
    display: inline-block; background: transparent; color: var(--ref-navy); border: 1px dashed rgba(27,43,58,0.2);
    border-radius: 999px; padding: 5px 12px; font-weight: 700; font-size: 0.8rem; opacity: 0.45; cursor: default;
  }
  .category-card.category-card-empty { opacity: 0.55; }
  .category-card.category-card-empty h2 { color: inherit; }
  </style>`;
}

// Short label for the "← All <X>" back-link on a category's single-
// region page, distinct from CATEGORY_LABELS.plural (the full heading
// label, e.g. "Golf Courses") since the back-link reads better short.
// Falls back to CATEGORY_LABELS.plural for any category without an
// entry here, so it never breaks if a future category is added to
// ALL_REGIONS_CATEGORIES without also adding a short label.
const ALL_REGIONS_BACK_LABEL = { golf: 'Golf', beach: 'Beaches', outdoor: 'Outdoors', winery: 'Wineries' };

// Golf's inventory deliberately includes both outdoor courses and indoor
// golf-simulator venues under the same type='golf' (2026-09-19), so the
// Golf category page can show both while everything else on the site
// still treats them as one type. No new DB column was added: every
// simulator venue's free-text description states "simulator" or "indoor
// golf" (that's how each one was written at insertion time), and no
// outdoor course description does, so the existing data already supports
// the distinction without inventing a new schema field.
function isIndoorGolfVenue(venue) {
  return /simulator|indoor golf/i.test(venue.description || '');
}

// Renders a category's venues as either one flat grid (every category
// except golf) or two labeled subsections (golf only: Golf Courses, then
// Indoor Golf & Simulators). `headingPrefix` is the region name for a
// single-region page (e.g. "Kelowna") or '' for the Okanagan-wide page,
// so the same helper produces "Golf Courses" and "Kelowna Golf Courses"
// without a separate code path per page type. A subsection is omitted
// entirely when it would be empty, rather than rendering an empty grid.
function renderCategoryCardsHtml(type, venues, hiddenGemIds, headingPrefix, localFavouriteIds = new Set(), advisoryNotes = new Map(), dogFriendlyNotes = new Map(), cardOpts = {}, golfOpts = {}) {
  // golfOpts (golf only, 2026-09-26): { details, sort, basePath, today } from
  // golf-data.js -- adds verified green-fee lines, a price sort for the
  // courses subsection, and a "Driving Ranges & Practice" subsection.
  const golfDetails = golfOpts.details || new Map();
  const golfFee = (v) => {
    if (!golfData || type !== 'golf') return '';
    const d = golfDetails.get(`${v.region}/${v.slug}`);
    return [golfData.golfCardFeeHtml(d, golfOpts.today), golfData.golfCardValueHtml(d, golfOpts.today)].filter(Boolean).join('\n        ');
  };
  const cardHtml = (list) => list.map((v) => venueCardHtml(v, { ...cardOpts, isHiddenGem: hiddenGemIds.has(v.id), isLocalFavourite: localFavouriteIds.has(v.id), advisoryNote: advisoryNotes.has(v.id) ? advisoryNotes.get(v.id) : null, dogFriendlyNote: dogFriendlyNotes.has(v.id) ? dogFriendlyNotes.get(v.id) : null, golfFeeHtml: golfFee(v) })).join('\n');

  if (type !== 'golf') {
    return `<ul class="card-grid">
    ${cardHtml(venues)}
  </ul>`;
  }

  const isPractice = (v) => !!(golfData && golfData.isPracticeFacility(golfDetails.get(`${v.region}/${v.slug}`)));
  const listedCourses = venues.filter((v) => !isIndoorGolfVenue(v) && !isPractice(v));
  const practice = venues.filter((v) => !isIndoorGolfVenue(v) && isPractice(v));
  const indoor = venues.filter((v) => isIndoorGolfVenue(v));
  const sort = golfOpts.sort || 'recommended';
  const courses = golfData ? golfData.sortGolfCourses(listedCourses, golfDetails, sort, golfOpts.today) : listedCourses;
  const sortNav = (golfData && golfOpts.basePath && listedCourses.length > 1 && golfData.hasSortablePrices(listedCourses, golfDetails, golfOpts.today))
    ? '\n  ' + golfData.golfSortNavHtml(golfOpts.basePath, sort)
    : '';
  const prefix = headingPrefix ? `${escapeHtml(headingPrefix)} ` : '';
  let html = '';
  if (courses.length) {
    html += `<h2 class="category-subsection-heading">${prefix}Golf Courses</h2>${sortNav}
  <ul class="card-grid">
    ${cardHtml(courses)}
  </ul>`;
  }
  if (practice.length) {
    html += `<h2 class="category-subsection-heading">${prefix}Driving Ranges &amp; Practice</h2>
  <ul class="card-grid">
    ${cardHtml(practice)}
  </ul>`;
  }
  if (indoor.length) {
    html += `<h2 class="category-subsection-heading">${prefix}Indoor Golf &amp; Simulators</h2>
  <ul class="card-grid">
    ${cardHtml(indoor)}
  </ul>`;
  }
  return html;
}

// GET /:region/:category — category page within a region
function renderCategoryPage(region, type, venues, categoryGuidePages, opts = {}) {
  const regionLabel = REGION_LABELS[region];
  const catSlug = CATEGORY_SLUGS[type];
  const label = CATEGORY_LABELS[type];
  const title = `${label.plural} in ${regionLabel}, BC | Okanagan Roam`;
  const description = venues.length === 0
    ? `No ${label.plural.toLowerCase()} are currently listed in ${regionLabel}, BC. Browse everything else Okanagan Roam covers in ${regionLabel}.`
    : `${venues.length} verified ${label.plural.toLowerCase()} in ${regionLabel}, BC — real listings with hours, ratings, and attributes, reviewed and badge-checked by Okanagan Roam.`;
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

  const hiddenGemIds = getHiddenGemVenueIds();
  const advisoryNotes = getAdvisoryNotes();
  // Favorite / Add to Trip on this region page. True for the themed types
  // exactly as before, and now also for ENGAGEMENT_ONLY_TYPES, which get the
  // controls without any visual change (see usesEngagementControls).
  const engagement = usesEngagementControls(type);
  const engagementOnly = engagement && !usesThemedCategoryLayout(type);
  const golfDetails = type === 'golf' ? golfDetailsFor(venues) : new Map();
  const cardsHtml = renderCategoryCardsHtml(type, venues, hiddenGemIds, regionLabel, getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { actions: engagement },
    type === 'golf' ? { details: golfDetails, sort: opts.golfSort, basePath: `/${region}/${catSlug}`, today: opts.today } : {});

  // Back-link to the Okanagan-wide page, only for categories that
  // actually have one (ALL_REGIONS_CATEGORIES) -- every other category
  // has no wide page to link back to, so it renders nothing for them.
  const backLink = ALL_REGIONS_CATEGORIES.includes(type)
    ? `<a class="category-back-link" href="/${catSlug}">\u2190 All ${escapeHtml(ALL_REGIONS_BACK_LABEL[type] || label.plural)}</a>`
    : '';

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
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: usesThemedCategoryLayout(type), beachTheme: type === 'beach', outdoorTheme: type === 'outdoor', advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)), noindex: venues.length === 0, golfDataStyles: golfDetails.size > 0 })}${engagementOnly ? '\n' + renderEngagementControlStyles() : ''}
${golfEngagementHeadHtml(type)}
</head>
<body${themedBodyClassAttr(type)}>
  ${usesThemedCategoryLayout(type) ? renderGolfTripTrayHtml() + '\n<div id="floatingTooltip"></div>\n' + renderGolfHeaderHtml() + '\n  <main class="wrap-wide golf-main">' : siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${region}` },
    { name: label.plural },
  ])}
  ${backLink}
  <h1>${escapeHtml(label.plural)} in ${escapeHtml(regionLabel)}, BC</h1>
  ${venues.length === 0
    ? `<p class="subtitle">No ${escapeHtml(label.plural.toLowerCase())} are listed in ${escapeHtml(regionLabel)} right now.</p>`
    : `<p class="subtitle">${venues.length} verified ${escapeHtml(label.plural.toLowerCase())} in ${escapeHtml(regionLabel)}.</p>
  ${cardsHtml}`}
  ${guideLinks}
  <a class="cta" href="/${region}">Back to all of ${escapeHtml(regionLabel)}</a>
  ${usesThemedCategoryLayout(type) ? '</main>' : ''}
  ${renderHomeFooterHTML(true)}
  ${usesThemedCategoryLayout(type) ? GOLF_APP_SCRIPT_TAG : ''}
  ${golfCardEngagementScriptHtml(type, engagement)}
</body>
</html>`;
}

// Shared region-selector strip (2026-09-19): reusable across any future
// category's Okanagan-wide page, not just Golf. Built from the regions
// actually present in the already-fetched venues array -- never a
// hardcoded region list -- so a region with zero venues of this category
// never appears as a dead-end choice. "All Regions" is the current page
// itself (rendered inactive, not a link); every other entry links to the
// EXISTING single-region /:region/:category page for that region, so no
// new region-scoped rendering path is introduced by this selector at all.
function renderCategoryRegionSelector(catSlug, venues) {
  const regionsPresent = [...new Set(venues.map((v) => v.region))]
    .filter((r) => REGION_LABELS[r])
    .sort((a, b) => REGION_LABELS[a].localeCompare(REGION_LABELS[b]));
  const regionLinks = regionsPresent
    .map((r) => `<a href="/${r}/${catSlug}">${escapeHtml(REGION_LABELS[r])}</a>`)
    .join('\n      ');
  return `<nav class="category-region-selector" aria-label="Filter by region">
      <span class="category-region-selector-active">All Regions</span>
      ${regionLinks}
    </nav>`;
}

// Outdoors Phase 2: the activity selector, a compact chip row that reuses
// the region selector's pill styling (one design system, no new control).
// `currentSlug` is null on the landing page (no active chip, every live
// activity links out) and the activity's slug on its own page (that chip
// is the static "active" pill and an "All Outdoors" link leads back).
function renderOutdoorActivitySelector(currentSlug = null) {
  const live = sortOutdoorActivitiesForDisplay(listLiveOutdoorActivities());
  if (!live.length) return '';
  // Counts are shown only on the landing page (where they signal depth);
  // on an activity page the H1's own count line already says it.
  const showCounts = currentSlug === null;
  const chips = live.map((a) => (a.slug === currentSlug
    ? `<span class="category-region-selector-active">${escapeHtml(a.label)}</span>`
    : `<a href="/outdoors/${a.slug}">${escapeHtml(a.label)}${showCounts ? `<span class="outdoor-activity-count">${a.count}</span>` : ''}</a>`)).join('\n      ');
  const allLink = currentSlug ? `<a href="/outdoors">All Outdoors</a>\n      ` : '';
  return `<nav class="category-region-selector outdoor-activity-selector" aria-label="Choose an activity">
      ${allLink}${chips}
    </nav>`;
}

// Outdoors landing, step 1 -- "Choose a Region": the same region set,
// labels, alphabetical order and pill treatment as the shared region
// selector (renderCategoryRegionSelector), but rendered as a primary
// choice: every community is a link to its /{region}/outdoors page with
// its destination count, and there is no static "All Regions" pill
// because the visitor is already on the all-regions page.
function renderOutdoorRegionChoice(venues) {
  const counts = new Map();
  for (const v of venues) if (REGION_LABELS[v.region]) counts.set(v.region, (counts.get(v.region) || 0) + 1);
  const regions = [...counts.keys()].sort((a, b) => REGION_LABELS[a].localeCompare(REGION_LABELS[b]));
  if (!regions.length) return '';
  const links = regions.map((r) => `<a href="/${r}/${CATEGORY_SLUGS.outdoor}">${escapeHtml(REGION_LABELS[r])}<span class="outdoor-activity-count">${counts.get(r)}</span></a>`).join('\n      ');
  return `<nav class="category-region-selector outdoor-region-choice" aria-label="Choose a region">
      ${links}
    </nav>`;
}

// Outdoors landing filter (2026-09-20): /outdoors is a multi-select
// directory. Regions and activities are toggle chips; the same page
// filters its own results in the browser (progressive enhancement: with
// scripting off every destination is simply listed). Semantics, shared by
// the server-side predicate below and the inline client script:
//   selected regions combine with OR, selected activities with OR, and
//   the two groups combine with AND; an empty group imposes no constraint.
function outdoorFilterMatches(selectedRegions, selectedActivities, venueRegion, venueActivities) {
  const regionOk = !selectedRegions.length || selectedRegions.includes(venueRegion);
  const activityOk = !selectedActivities.length || selectedActivities.some((a) => venueActivities.includes(a));
  return regionOk && activityOk;
}
function filterOutdoorVenues(venues, selectedRegions, selectedActivities, activitySlugsByVenueId) {
  return venues.filter((v) => outdoorFilterMatches(selectedRegions, selectedActivities, v.region, activitySlugsByVenueId.get(v.id) || []));
}
// Filter state from the /outdoors query string (2026-09-20, discovery
// refinement): ?regions=a,b&activities=x,y -- the same convention the
// client script has always written. Unknown region slugs and activities
// that are not live are dropped, duplicates collapse, order is kept, so a
// hand-edited or stale link degrades to "fewer constraints", never an
// error page. Anything else in the query is ignored.
function parseOutdoorFilterQuery(query) {
  const split = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : '').split(',').map((s) => s.trim()).filter(Boolean);
  const liveSlugs = new Set(listLiveOutdoorActivities().map((a) => a.slug));
  const regions = [], activities = [];
  for (const r of split(query && query.regions)) if (REGION_LABELS[r] && !regions.includes(r)) regions.push(r);
  for (const a of split(query && query.activities)) if (liveSlugs.has(a) && !activities.includes(a)) activities.push(a);
  return { regions, activities };
}
// Contextual chip counts: a region chip shows how many of that region's
// destinations satisfy the CURRENT activity selection, an activity chip
// how many destinations with that activity satisfy the CURRENT region
// selection (its own group's selection is ignored, because chips within
// a group combine with OR). With nothing selected these are the plain
// totals the chips have always shown, so a count can never disagree
// with the results a tap would produce.
function outdoorChipCounts(venues, activitySlugsByVenueId, selectedRegions, selectedActivities) {
  const regions = {}, activities = {};
  for (const v of venues) {
    const acts = activitySlugsByVenueId.get(v.id) || [];
    if (outdoorFilterMatches([], selectedActivities, v.region, acts)) regions[v.region] = (regions[v.region] || 0) + 1;
    if (outdoorFilterMatches(selectedRegions, [], v.region, acts)) for (const a of acts) activities[a] = (activities[a] || 0) + 1;
  }
  return { regions, activities };
}
// The one-line results count, shared verbatim by the server render and
// the client script: "20 of 62 outdoor destinations" while a filter is
// active, "62 outdoor destinations" otherwise. (2026-09-22: the selected
// region/activity labels moved out of this line into the removable
// filter rows beneath it, renderOutdoorSelectedTagsHtml.)
function outdoorSummaryText(shown, total, regionLabels, activityLabels, searchActive) {
  // `searchActive` (2026-09-24) is the client-only search box: it narrows the
  // list without touching any chip, so it has to count as "filtered" or the
  // line would claim the full total. The server never renders a search state
  // (search adds no query parameter), so every existing 4-argument call --
  // and the wording it produces -- is unchanged.
  const filtered = regionLabels.length || activityLabels.length || !!searchActive;
  return filtered ? `${shown} of ${total} outdoor destinations` : `${total} outdoor destinations`;
}
// Selected-filter tags shown beside the results: one removable tag per
// chosen region and activity plus "Clear all", so what is filtering the
// list is visible right where the list is (the chip rows may be a screen
// or two above on a phone). Empty (hidden) when nothing is selected.
// (2026-09-22 explorer: one row per filter group -- "Regions Kelowna ×
// Penticton ×" / "Activities Hiking & Trails × Camping ×" -- so the
// active filters read as the two choices the visitor made.)
function renderOutdoorSelectedTagsHtml(selectedRegions, selectedActivities) {
  const tag = (kind, value, label) => `<button type="button" class="outdoor-selected-tag" data-remove-${kind}="${escapeHtml(value)}" aria-label="Remove ${escapeHtml(label)}">${escapeHtml(label)}<span class="outdoor-selected-x" aria-hidden="true">×</span></button>`;
  const row = (label, tags) => (tags.length ? `<div class="outdoor-selected-row"><span class="outdoor-selected-label">${label}</span> ${tags.join(' ')}</div>` : '');
  const regionTags = selectedRegions.map((r) => tag('region', r, REGION_LABELS[r] || r));
  const activityTags = selectedActivities.map((a) => tag('activity', a, (OUTDOOR_ACTIVITY_BY_SLUG[a] || { label: a }).label));
  const any = regionTags.length + activityTags.length > 0;
  return `<div class="outdoor-selected" id="outdoorSelected"${any ? '' : ' hidden'}>${row('Regions', regionTags)}${row('Activities', activityTags)}${any ? '<button type="button" class="outdoor-selected-clear" id="outdoorSelectedClear">Clear all</button>' : ''}</div>`;
}
// venue id -> [activity slugs] (live activities only, so the chips and the
// per-venue data can never disagree).
function getOutdoorActivitySlugsByVenue(venues) {
  const live = listLiveOutdoorActivities();
  const kindToSlug = Object.fromEntries(live.map((a) => [a.kind, a.slug]));
  const map = new Map();
  if (!venues.length || !live.length) return map;
  const placeholders = venues.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ci.content_id AS id, c.kind AS kind FROM collection_items ci
    JOIN collections c ON c.id = ci.collection_id
    WHERE ci.content_type = 'venue' AND ci.content_id IN (${placeholders})
  `).all(...venues.map((v) => v.id));
  for (const r of rows) {
    const slug = kindToSlug[r.kind];
    if (!slug) continue;
    if (!map.has(r.id)) map.set(r.id, []);
    if (!map.get(r.id).includes(slug)) map.get(r.id).push(slug);
  }
  return map;
}
// Region chips (2026-09-20 correction): the site's COMPLETE canonical
// region list -- the 20 routable regions of REGION_LABELS, in the
// established Okanagan order of FOOTER_REGION_GROUPS (Central, South,
// North, Ski resorts; the same order as the wizard's Step 1 chips and
// the footer's Regions band) -- never just the communities that happen
// to have outdoor destinations today. A region with none still gets a
// chip, showing 0, and selecting it simply contributes no results.
function canonicalOutdoorRegionOrder() {
  const ordered = FOOTER_REGION_GROUPS.flatMap((g) => g.regions).filter((r) => REGION_LABELS[r]);
  // Defensive: any routable region missing from the groups is appended so
  // the selector can never silently drop a canonical region.
  for (const r of Object.keys(REGION_LABELS)) if (!ordered.includes(r)) ordered.push(r);
  return ordered;
}
// Mobile grouping (2026-09-20): the 20 chips are wrapped in the same four
// FOOTER_REGION_GROUPS groups (Central / South / North / Ski resorts) so
// that below 900px each group is a collapsible block behind a compact
// header (a real <button> with aria-expanded / aria-controls), Central
// open and the rest closed by default. The headers are presentation only
// -- the chips inside stay the very same multi-select toggle buttons and
// keep their state whether the group is open or closed. Desktop hides
// the headers and shows every chip (the blocks are display:contents), so
// the 20-chip presentation there is unchanged. Without JavaScript the
// headers stay hidden and every chip is visible (see the :not(.js) CSS).
const OUTDOOR_REGION_GROUP_DEFAULT_OPEN = 'central';
function outdoorRegionGroupSlug(label) { return slugify(label); }
function renderOutdoorRegionFilterChips(venues, state = {}) {
  const counts = new Map();
  for (const v of venues) if (REGION_LABELS[v.region]) counts.set(v.region, (counts.get(v.region) || 0) + 1);
  // Optional filter state (server-applied URL selection): pressed chips
  // and contextual counts; without it the chips are the plain totals.
  const selected = new Set(state.selectedRegions || []);
  const count = (r) => (state.counts && state.counts.regions ? (state.counts.regions[r] || 0) : (counts.get(r) || 0));
  const chip = (r) => `<button type="button" class="outdoor-filter-chip" data-region="${escapeHtml(r)}" aria-pressed="${selected.has(r) ? 'true' : 'false'}">${escapeHtml(REGION_LABELS[r])}<span class="outdoor-activity-count">${count(r)}</span></button>`;
  const placed = new Set();
  const groups = FOOTER_REGION_GROUPS.map((g) => ({ label: g.label, slug: outdoorRegionGroupSlug(g.label), regions: g.regions.filter((r) => REGION_LABELS[r]) }));
  groups.forEach((g) => g.regions.forEach((r) => placed.add(r)));
  const leftover = canonicalOutdoorRegionOrder().filter((r) => !placed.has(r));
  if (leftover.length) groups.push({ label: 'Other', slug: 'other', regions: leftover });
  const blocks = groups.map((g) => {
    // A group holding a URL-selected region renders open with its
    // "· N selected" meta, matching what the client would do on load.
    const nSel = g.regions.filter((r) => selected.has(r)).length;
    const open = g.slug === OUTDOOR_REGION_GROUP_DEFAULT_OPEN || nSel > 0;
    const listId = `outdoorRegionGroup-${g.slug}`;
    return `<div class="outdoor-region-group-block${nSel ? ' has-selection' : ''}" data-region-group="${g.slug}">
      <button type="button" class="outdoor-region-group-toggle" id="${listId}-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${listId}"><span class="outdoor-region-group-name">${escapeHtml(g.label)}</span><span class="outdoor-region-group-meta">${g.regions.length} region${g.regions.length === 1 ? '' : 's'}</span><span class="outdoor-region-group-selected"${nSel ? '' : ' hidden'}>${nSel ? `· ${nSel} selected` : ''}</span><span class="outdoor-region-group-chevron" aria-hidden="true"></span></button>
      <div class="outdoor-region-group-chips" id="${listId}" role="group" aria-label="${escapeHtml(g.label)} regions"${open ? '' : ' hidden'}>
        ${g.regions.map(chip).join('\n        ')}
      </div>
    </div>`;
  }).join('\n      ');
  return `<div class="category-region-selector outdoor-filter-group outdoor-region-groups" role="group" aria-label="Choose regions" data-filter="region">
      ${blocks}
    </div>`;
}
// Client-side helpers for the grouped region selector, shipped inside the
// inline script and exported for the tests: a group is open on load if it
// is the default-open group or holds a selected region; the header meta
// is "N regions" plus "· N selected" only when something inside is chosen.
const OUTDOOR_REGION_GROUP_CLIENT_SRC = `function groupShouldOpen(isDefaultOpen, selectedCount){ return !!isDefaultOpen || selectedCount > 0; }
  function groupSelectedText(selectedCount){ return selectedCount > 0 ? ('\\u00b7 ' + selectedCount + ' selected') : ''; }`;
// Activity chips: the live activities (>= MIN_ACTIVITY_VENUES) with counts.
function renderOutdoorActivityFilterChips(state = {}) {
  const live = sortOutdoorActivitiesForDisplay(listLiveOutdoorActivities());
  if (!live.length) return '';
  const selected = new Set(state.selectedActivities || []);
  const count = (a) => (state.counts && state.counts.activities ? (state.counts.activities[a.slug] || 0) : a.count);
  const chips = live.map((a) => `<button type="button" class="outdoor-filter-chip" data-activity="${a.slug}" aria-pressed="${selected.has(a.slug) ? 'true' : 'false'}">${escapeHtml(a.label)}<span class="outdoor-activity-count">${count(a)}</span></button>`).join('\n      ');
  return `<div class="category-region-selector outdoor-filter-group" role="group" aria-label="Choose activities" data-filter="activity">
      ${chips}
    </div>`;
}
// The inline script: toggles chips, filters the already-rendered cards,
// updates the count/summary, keeps the selection in the URL query
// (?regions=a,b&activities=x) so a filtered view can be reloaded or
// shared, and offers Clear. No network, no framework, no new page. The
// `matches` function inside is the client twin of outdoorFilterMatches()
// above (exported as OUTDOOR_FILTER_CLIENT_PREDICATE_SRC for the tests).
// Client twin of outdoorSummaryText() (same wording, same separators).
const OUTDOOR_SUMMARY_CLIENT_SRC = `function summaryText(shown, total, regionLabels, activityLabels, searchActive){
    var filtered = regionLabels.length || activityLabels.length || !!searchActive;
    return filtered ? (shown + ' of ' + total + ' outdoor destinations') : (total + ' outdoor destinations');
  }`;
const OUTDOOR_FILTER_CLIENT_PREDICATE_SRC = `function matches(regions, activities, venueRegion, venueActivities){
    var regionOk = !regions.length || regions.indexOf(venueRegion) !== -1;
    var activityOk = !activities.length;
    for (var i = 0; i < activities.length && !activityOk; i++) { if (venueActivities.indexOf(activities[i]) !== -1) activityOk = true; }
    return regionOk && activityOk;
  }`;
function renderOutdoorFilterScriptHtml() {
  const labels = { regions: { ...REGION_LABELS }, activities: Object.fromEntries(OUTDOOR_ACTIVITIES.map((a) => [a.slug, a.label])) };
  return `<script>
(function(){
  var LABELS = ${JSON.stringify(labels).replace(/</g, '\\u003c')};
  var mapEl = document.getElementById('outdoorActivityMap');
  var activityMap = mapEl ? JSON.parse(mapEl.textContent || '{}') : {};
  // Region pills and the activity cards share one toggle contract
  // (data-region / data-activity + aria-pressed).
  var chips = Array.prototype.slice.call(document.querySelectorAll('.outdoor-filter-chip, .outdoor-activity-toggle')).filter(function(c){ return !c.hasAttribute('data-activity-all'); });
  var allChip = document.querySelector('[data-activity-all]');
  var searchInput = document.getElementById('outdoorsSearch');
  var searchClear = document.getElementById('outdoorsSearchClear');
  var regionsCount = document.getElementById('outdoorRegionsCount');
  var searchTerm = '';
  var cards = Array.prototype.slice.call(document.querySelectorAll('#outdoorResults > .venue-card'));
  var summary = document.getElementById('outdoorResultsSummary');
  var empty = document.getElementById('outdoorNoResults');
  var results = document.getElementById('outdoorResults');
  var selectedBox = document.getElementById('outdoorSelected');
  var regionStatus = document.getElementById('outdoorRegionStatus'), activityStatus = document.getElementById('outdoorActivityStatus');
  if (!chips.length || !cards.length) return;
  ${OUTDOOR_FILTER_CLIENT_PREDICATE_SRC}
  ${OUTDOOR_REGION_GROUP_CLIENT_SRC}
  ${OUTDOOR_SUMMARY_CLIENT_SRC}
  var groupsRoot = document.querySelector('.outdoor-region-groups');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.outdoor-region-group-block'));
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  function setGroupOpen(block, open){ var t = block.querySelector('.outdoor-region-group-toggle'), l = block.querySelector('.outdoor-region-group-chips'); if (!t || !l) return; t.setAttribute('aria-expanded', open ? 'true' : 'false'); l.hidden = !open; }
  function updateGroupHeaders(){
    groups.forEach(function(block){
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      var sel = block.querySelector('.outdoor-region-group-selected');
      if (sel) { sel.textContent = groupSelectedText(n); sel.hidden = n === 0; }
      block.classList.toggle('has-selection', n > 0);
    });
  }
  if (groupsRoot) groupsRoot.classList.add('js');
  groups.forEach(function(block){ var t = block.querySelector('.outdoor-region-group-toggle'); if (t) t.addEventListener('click', function(){ setGroupOpen(block, t.getAttribute('aria-expanded') !== 'true'); }); });
  function selected(kind){ return chips.filter(function(c){ return c.getAttribute('data-' + kind) && c.getAttribute('aria-pressed') === 'true'; }).map(function(c){ return c.getAttribute('data-' + kind); }); }
  function labelsOf(kind, list){ return list.map(function(v){ return LABELS[kind][v] || v; }); }
  function cardData(card){ var id = card.getAttribute('data-venue-id'); return { region: card.getAttribute('data-venue-region'), acts: activityMap[id] || [] }; }
  // Searchable text, built once per card from data already in the markup:
  // the destination name, its community label, the labels of the
  // activities it belongs to, and the meta/description lines. No new data.
  cards.forEach(function(card){
    var d = cardData(card);
    var meta = card.querySelector('.venue-meta'), desc = card.querySelector('.golf-desc');
    var parts = [card.getAttribute('data-venue-name') || '', LABELS.regions[d.region] || '',
                 d.acts.map(function(a){ return LABELS.activities[a] || a; }).join(' '),
                 meta ? meta.textContent : '', desc ? desc.textContent : ''];
    card.__od = parts.join(' ').toLowerCase();
  });
  function cardMatchesSearch(card){ return !searchTerm || (card.__od || '').indexOf(searchTerm) !== -1; }
  // Contextual chip counts (client twin of outdoorChipCounts): each chip
  // shows how many destinations it would contribute given the OTHER
  // group's current selection, so no count can promise results a tap
  // won't deliver.
  function updateChipCounts(regions, activities){
    var regionCounts = {}, activityCounts = {};
    cards.forEach(function(card){
      var d = cardData(card);
      if (matches([], activities, d.region, d.acts)) regionCounts[d.region] = (regionCounts[d.region] || 0) + 1;
      if (matches(regions, [], d.region, d.acts)) d.acts.forEach(function(a){ activityCounts[a] = (activityCounts[a] || 0) + 1; });
    });
    chips.forEach(function(c){
      var r = c.getAttribute('data-region'), a = c.getAttribute('data-activity'), n = c.querySelector('.outdoor-activity-count');
      if (!n) return;
      var count = r ? (regionCounts[r] || 0) : (activityCounts[a] || 0);
      n.textContent = String(count);
      var noun = c.querySelector('.outdoor-activity-count-noun');
      if (noun) noun.textContent = count === 1 ? 'destination' : 'destinations';
    });
  }
  // The region/activity "N selected" live regions (visually hidden on the
  // landing since 2026-09-24; the element ids and wording are unchanged).
  function updateStepStatus(el, n){ if (!el) return; el.textContent = n ? (n + ' selected') : ''; el.hidden = n === 0; }
  // Selected-filter tags beside the results (removable), mirroring
  // renderOutdoorSelectedTagsHtml on the server.
  function renderSelected(regions, activities){
    if (!selectedBox) return;
    var any = regions.length || activities.length;
    function tag(kind, v, label){ return '<button type="button" class="outdoor-selected-tag" data-remove-' + kind + '="' + v + '" aria-label="Remove ' + label + '">' + label + '<span class="outdoor-selected-x" aria-hidden="true">\\u00d7</span></button>'; }
    function row(label, tags){ return tags.length ? '<div class="outdoor-selected-row"><span class="outdoor-selected-label">' + label + '</span> ' + tags.join(' ') + '</div>' : ''; }
    var html = row('Regions', regions.map(function(r){ return tag('region', r, LABELS.regions[r] || r); }))
      + row('Activities', activities.map(function(a){ return tag('activity', a, LABELS.activities[a] || a); }));
    if (any) html += '<button type="button" class="outdoor-selected-clear" id="outdoorSelectedClear">Clear all</button>';
    selectedBox.innerHTML = html;
    selectedBox.hidden = !any;
  }
  function queryFor(regions, activities){
    var q = [];
    if (regions.length) q.push('regions=' + regions.join(','));
    if (activities.length) q.push('activities=' + activities.join(','));
    return q.length ? '?' + q.join('&') : '';
  }
  // apply(historyMode): 'push' after a visitor's own change (so Back
  // steps through their filter states), 'replace' on first load (URL
  // normalised, no extra entry), 'none' when restoring from popstate.
  function apply(historyMode){
    var regions = selected('region'), activities = selected('activity');
    var shown = 0;
    cards.forEach(function(card){
      var d = cardData(card);
      var ok = matches(regions, activities, d.region, d.acts) && cardMatchesSearch(card);
      card.hidden = !ok; if (ok) shown++;
    });
    var total = cards.length, filtered = regions.length || activities.length || !!searchTerm;
    // "All" is pressed exactly when no activity is chosen.
    if (allChip) allChip.setAttribute('aria-pressed', activities.length ? 'false' : 'true');
    if (regionsCount) { regionsCount.textContent = regions.length ? (' \u00b7 ' + regions.length) : ''; regionsCount.hidden = regions.length === 0; }
    if (searchClear) searchClear.hidden = !searchTerm;
    if (summary) summary.textContent = summaryText(shown, total, labelsOf('regions', regions), labelsOf('activities', activities), searchTerm);
    applyBtns.forEach(function(b){ b.textContent = 'Show ' + shown + ' result' + (shown === 1 ? '' : 's'); });
    updateGroupHeaders();
    updateChipCounts(regions, activities);
    updateStepStatus(regionStatus, regions.length);
    updateStepStatus(activityStatus, activities.length);
    renderSelected(regions, activities);
    if (empty) empty.hidden = shown !== 0;
    if (results) results.hidden = shown === 0;
    var next = window.location.pathname + queryFor(regions, activities) + window.location.hash;
    if (window.history && historyMode !== 'none') {
      if (historyMode === 'push' && window.history.pushState && next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState({ outdoor: true }, '', next);
      else if (window.history.replaceState) window.history.replaceState({ outdoor: true }, '', next);
    }
  }
  function setPressed(kind, value, on){ chips.forEach(function(c){ if (c.getAttribute('data-' + kind) === value) c.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  chips.forEach(function(chip){ chip.addEventListener('click', function(){ chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply('push'); }); });
  function clearAll(){ chips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); searchTerm = ''; if (searchInput) searchInput.value = ''; apply('push'); }
  if (allChip) allChip.addEventListener('click', function(){
    chips.forEach(function(c){ if (c.getAttribute('data-activity')) c.setAttribute('aria-pressed', 'false'); });
    apply('push');
  });
  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener('input', function(){
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function(){ searchTerm = searchInput.value.trim().toLowerCase(); apply('none'); }, 120);
    });
  }
  if (searchClear) searchClear.addEventListener('click', function(){ searchTerm = ''; if (searchInput) { searchInput.value = ''; searchInput.focus(); } apply('none'); });
  var popsRoot = document.querySelector('.outdoors-controls');
  var applyBtns = Array.prototype.slice.call(document.querySelectorAll('[data-outdoors-apply]'));
  var pops = Array.prototype.slice.call(document.querySelectorAll('.outdoors-pop'));
  if (popsRoot) popsRoot.classList.add('js');
  function closePops(except){
    pops.forEach(function(pop){
      if (pop === except) return;
      var b = pop.querySelector('.outdoors-pop-btn'), pnl = pop.querySelector('.outdoors-pop-panel');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (pnl) pnl.hidden = true;
    });
  }
  pops.forEach(function(pop){
    var b = pop.querySelector('.outdoors-pop-btn'), pnl = pop.querySelector('.outdoors-pop-panel');
    if (!b || !pnl) return;
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') === 'true';
      closePops(pop);
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      pnl.hidden = open;
    });
    pnl.addEventListener('click', function(e){ e.stopPropagation(); });
  });
  // "Show results": filtering is already live, so this closes the panel and
  // hands the visitor back to the list. Every other selection is preserved.
  applyBtns.forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); closePops(null); }); });
  if (pops.length) {
    document.addEventListener('click', function(){ closePops(null); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePops(null); });
  }
  var emptyClear = document.getElementById('outdoorNoResultsClear');
  if (emptyClear) emptyClear.addEventListener('click', function(e){ e.preventDefault(); clearAll(); });
  if (selectedBox) selectedBox.addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.id === 'outdoorSelectedClear') { clearAll(); return; }
    var r = t.getAttribute('data-remove-region'), a = t.getAttribute('data-remove-activity');
    if (r) { setPressed('region', r, false); apply('push'); }
    else if (a) { setPressed('activity', a, false); apply('push'); }
  });
  function readUrlIntoChips(){
    try {
      var params = new URLSearchParams(window.location.search);
      var pre = { region: (params.get('regions') || '').split(',').filter(Boolean), activity: (params.get('activities') || '').split(',').filter(Boolean) };
      chips.forEach(function(c){ ['region', 'activity'].forEach(function(k){ var v = c.getAttribute('data-' + k); if (v) c.setAttribute('aria-pressed', pre[k].indexOf(v) !== -1 ? 'true' : 'false'); }); });
    } catch (e) {}
  }
  function openGroupsForSelection(){
    groups.forEach(function(block){
      var isDefault = block.getAttribute('data-region-group') === '${OUTDOOR_REGION_GROUP_DEFAULT_OPEN}';
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      setGroupOpen(block, (mobileQuery && mobileQuery.matches) ? groupShouldOpen(isDefault, n) : true);
    });
  }
  // Back/Forward restore the filter state encoded in that history entry's URL.
  window.addEventListener('popstate', function(){ readUrlIntoChips(); openGroupsForSelection(); apply('none'); });
  readUrlIntoChips();
  // Initial group state: on small screens Central stays open and any group
  // holding a URL-selected region is opened so the selection is visible;
  // on desktop every group is open (the headers are hidden by CSS anyway).
  openGroupsForSelection();
  apply('replace');
})();
</script>`;
}

// Outdoor activity cards (2026-09-20 approved presentation; 2026-09-22
// explorer): the nine activities of the data model as image cards in a
// 3 x 3 grid under "Choose Activity(s)". Since 2026-09-22 a live card is
// a multi-select FILTER toggle (the same aria-pressed contract as the
// region chips, so one client script drives both groups and the URL
// state), with a small "Guide" link beside it to the EXISTING activity
// page (/outdoors/<slug>) -- the cards are no longer navigation only.
// The count on a card is the live activity count from the data (and the
// contextual count once the other group has a selection); nothing here
// is a second data system. An activity below MIN_ACTIVITY_VENUES renders
// as a non-interactive "Coming soon" tile rather than a dead control --
// it becomes a toggle automatically the day its data is live. `title`
// is the approved card wording; the activity's own label/slug/URL are
// unchanged.
const OUTDOOR_ACTIVITY_CARDS = [
  { key: 'hiking', title: 'Hiking & Trails', slug: 'hiking' },
  { key: 'cycling', title: 'Cycling & Bike Trails', slug: 'cycling' },
  { key: 'water', title: 'Water Activities', slug: 'water' },
  { key: 'adventure', title: 'Adventure', slug: 'adventure' },
  { key: 'fishing', title: 'Fishing', slug: 'fishing' },
  { key: 'winter', title: 'Winter', slug: 'winter' },
  { key: 'nature', title: 'Nature & Wildlife', slug: 'nature' },
  { key: 'viewpoints', title: 'Viewpoints & Lookouts', slug: 'viewpoints' },
  { key: 'camping', title: 'Camping', slug: 'camping' },
];
// Card images: /images/outdoors/<key>.webp under public/images (same
// static route and per-group subdirectory convention as mood/, regions/,
// hidden-gems/). Only emitted when the file exists on disk, so a card
// without art shows the on-brand navy fallback instead of a broken image.
const OUTDOOR_ACTIVITY_IMAGE_DIR = path.join(__dirname, 'public', 'images', 'outdoors');
function outdoorActivityImagePath(key) {
  const file = path.join(OUTDOOR_ACTIVITY_IMAGE_DIR, `${key}.webp`);
  return fs.existsSync(file) ? `/images/outdoors/${key}.webp` : null;
}
// Plain inline line icons, the same minimal white-stroke style as the
// homepage mood cards (no icon library).
const OUTDOOR_ACTIVITY_ICONS = {
  hiking: '<path d="M4 20 10 8l4 6 2-3 4 9z"/>',
  cycling: '<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17 10 8h4l2 5h2"/><path d="m10 8 5 9"/>',
  water: '<path d="M2 12c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0"/><path d="M2 17c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0"/><path d="M8 7h8"/><path d="M12 3v4"/>',
  adventure: '<path d="M12 3v5"/><circle cx="12" cy="11" r="3"/><path d="m9.5 13.5-4 7"/><path d="m14.5 13.5 4 7"/>',
  fishing: '<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z"/><path d="m17 12 4-3v6z"/><circle cx="8" cy="11.5" r=".6"/>',
  winter: '<path d="M12 3v18"/><path d="M4 8l16 8"/><path d="M4 16 20 8"/><path d="m9 5 3 2 3-2"/><path d="m9 19 3-2 3 2"/>',
  nature: '<path d="M4 20c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M4 20c4-4 7-7 10-10"/>',
  viewpoints: '<path d="M4 20 10 8l4 6 2-3 4 9z"/><circle cx="18" cy="6" r="2"/>',
  camping: '<path d="M4 20 12 5l8 15z"/><path d="M12 12v8"/><path d="M2 20h20"/>',
  boating: '<path d="M4 15h16l-2 4H6z"/><path d="M12 4v11"/><path d="M12 4c4 2 5 5 5 7H12z"/>',
  climbing: '<path d="M12 3v4"/><circle cx="12" cy="9" r="2"/><path d="m8 21 3-8 2 3 3-4 1 9"/><path d="M5 13c3-1 4-3 4-6"/>',
};
// One card. `state` (optional) is the server-applied URL selection:
// { selectedActivities, counts } -> pressed toggles and contextual counts
// on the first paint, exactly what the client script would produce.
// The count is split into number + noun so the script can update the
// number in place (the same .outdoor-activity-count hook the region chips
// use) and keep the noun's plural right.
function outdoorActivityCardHtml(card, liveBySlug, state = {}) {
  const live = card.slug ? liveBySlug[card.slug] : null;
  const img = outdoorActivityImagePath(card.key);
  const icon = `<span class="outdoor-activity-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${OUTDOOR_ACTIVITY_ICONS[card.key] || ''}</svg></span>`;
  const count = live ? (state.counts && state.counts.activities ? (state.counts.activities[card.slug] || 0) : live.count) : 0;
  const inner = `${img ? `<img class="outdoor-activity-card-img" src="${img}" width="1376" height="768" alt="" loading="lazy">` : ''}
      <span class="outdoor-activity-card-overlay">
        ${icon}
        <span class="outdoor-activity-card-title">${escapeHtml(card.title)}</span>
        ${live ? `<span class="outdoor-activity-card-count"><span class="outdoor-activity-count">${count}</span> <span class="outdoor-activity-count-noun">destination${count === 1 ? '' : 's'}</span></span>` : '<span class="outdoor-activity-card-soon">Coming soon</span>'}
      </span>`;
  const cls = `outdoor-activity-card outdoor-activity-card-${card.key}${live ? ' outdoor-activity-toggle' : ' outdoor-activity-card-pending'}`;
  if (!live) return `<div class="${cls}" aria-disabled="true">${inner}</div>`;
  const pressed = (state.selectedActivities || []).includes(card.slug);
  return `<div class="outdoor-activity-card-wrap">
      <button type="button" class="${cls}" data-activity="${card.slug}" aria-pressed="${pressed ? 'true' : 'false'}" aria-label="${escapeHtml(card.title)}"><span class="outdoor-activity-card-check" aria-hidden="true">&#10003; Selected</span>${inner}</button>
      <a class="outdoor-activity-card-link" href="/outdoors/${card.slug}" aria-label="${escapeHtml(card.title)} guide">Guide &rarr;</a>
    </div>`;
}
// The Choose Activity(s) block for the /outdoors landing: the nine cards
// in one grid (3 x 3 from 600px, 2 across on phones), every live one a
// filter toggle. `state` as for outdoorActivityCardHtml.
function renderOutdoorActivityShowcaseHtml(state = {}) {
  const liveBySlug = Object.fromEntries(listLiveOutdoorActivities().map((a) => [a.slug, a]));
  const cards = OUTDOOR_ACTIVITY_CARDS.map((c) => outdoorActivityCardHtml(c, liveBySlug, state)).join('\n    ');
  const nSel = (state.selectedActivities || []).length;
  return `<section class="outdoor-activity-showcase outdoor-step" aria-labelledby="outdoorActivitiesHeading">
  <div class="outdoor-step-head"><h2 class="category-subsection-heading" id="outdoorActivitiesHeading">Choose Activity(s)</h2><span class="outdoor-step-status" id="outdoorActivityStatus"${nSel ? '' : ' hidden'}>${nSel ? `${nSel} selected` : ''}</span></div>
  <div class="outdoor-activity-card-grid" role="group" aria-label="Choose activities" data-filter="activity">
    ${cards}
  </div>
</section>`;
}

// ---------- Outdoors simplified controls (2026-09-24) ----------
//
// The landing opened with ~28KB of filter markup before the first
// destination -- nine 1376x768 activity image tiles, a region accordion,
// three step headings and a "Show N results" CTA -- putting the first card
// 2.1 screens down on a phone. These builders replace that surface with a
// compact search field, an activity chip row and a single Regions popover,
// following the What's On pattern shipped in d8f5ea6.
//
// Nothing about the FILTER CONTRACT changes. Activity controls still carry
// data-activity + aria-pressed (Outdoors' established contract, which the
// ?activities= query, parseOutdoorFilterQuery and the removable tags all
// key off), region chips still carry data-region + aria-pressed, and
// OUTDOOR_FILTER_CLIENT_PREDICATE_SRC is untouched -- it is shared with
// What's On, so it must stay one implementation.
//
// Outdoors has NO date filter: destinations are not time-sensitive. There
// is deliberately no Date control, no preset, and no ?when= anywhere here.
//
// The landing carries no links to the /outdoors/<activity> pages (the
// "Activity guides" row was removed 2026-09-24 by owner decision). Those
// pages are unchanged and still reachable from each other through
// renderOutdoorActivitySelector() and from the sitemap.

// Compact search over the already-rendered cards. New on this page. It
// filters client-side only and adds no query parameter, so every existing
// URL still means exactly what it meant before.
function outdoorsSearchHtml() {
  return `<div class="outdoors-search">
    <label class="visually-hidden" for="outdoorsSearch">Search outdoor destinations</label>
    <input type="search" id="outdoorsSearch" class="outdoors-search-input" placeholder="Search destinations..." autocomplete="off" spellcheck="false">
    <button type="button" class="outdoors-search-clear" id="outdoorsSearchClear" aria-label="Clear search" hidden>&#215;</button>
  </div>`;
}

// The activity chip row, replacing the nine image tiles. The chips
// themselves come from the EXISTING renderOutdoorActivityFilterChips()
// (live activities only, in OUTDOOR_ACTIVITY_DISPLAY_ORDER, with the
// contextual counts) -- only the "All" reset control and the row wrapper
// are new. "All" is not a tenth activity: it is pressed exactly when no
// activity is chosen, which is already what "no constraint" means to
// outdoorFilterMatches().
function outdoorsActivityChipsHtml(state = {}) {
  const inner = renderOutdoorActivityFilterChips(state);
  if (!inner) return '';
  const selected = (state.selectedActivities || []).length;
  const allChip = `<button type="button" class="outdoor-filter-chip outdoors-act-chip outdoors-act-all" data-activity-all="1" aria-pressed="${selected ? 'false' : 'true'}">All</button>`;
  // Reuse the chip markup verbatim; only the wrapper and the All chip are
  // added, so the renderer stays the single source of chip truth.
  return inner
    .replace('<div class="category-region-selector outdoor-filter-group"', '<div class="category-region-selector outdoor-filter-group outdoors-act-row"')
    .replace('data-filter="activity">', `data-filter="activity">${allChip}`);
}

// The Regions control. One popover holding the EXISTING region accordion
// markup unchanged -- still the 20 canonical regions derived from
// FOOTER_REGION_GROUPS via renderOutdoorRegionFilterChips() -- so no
// region behaviour moves, only where it lives. There is no second
// popover: Outdoors has no date filter.
function outdoorsFilterBarHtml(venues, state = {}) {
  const nRegions = (state.selectedRegions || []).length;
  return `<div class="outdoors-controls">
    <div class="outdoors-pop">
      <button type="button" class="outdoors-pop-btn" id="outdoorRegionsBtn" aria-expanded="false" aria-controls="outdoorRegionsPanel"><span class="outdoors-pop-icon" aria-hidden="true">&#128205;</span> Regions<span class="outdoors-pop-count" id="outdoorRegionsCount"${nRegions ? '' : ' hidden'}>${nRegions ? ` · ${nRegions}` : ''}</span></button>
      <div class="outdoors-pop-panel" id="outdoorRegionsPanel" hidden>${renderOutdoorRegionFilterChips(venues, state)}
        <div class="outdoors-pop-actions"><button type="button" class="outdoors-pop-apply" data-outdoors-apply>Show results</button></div>
      </div>
    </div>
  </div>`;
}

// Compact result bar: the live count in the established wording
// (outdoorSummaryText, shared verbatim with the client twin), then the
// removable Regions / Activities tags and Clear all directly beneath.
// Replaces the "Show N results" CTA, the "Results" heading and the
// separate summary paragraph.
function outdoorsResultBarHtml(summaryText, selectedRegions, selectedActivities) {
  return `<div class="outdoors-resultbar">
    <p class="outdoors-count" id="outdoorResultsSummary" aria-live="polite">${escapeHtml(summaryText)}</p>
  </div>
  ${renderOutdoorSelectedTagsHtml(selectedRegions, selectedActivities)}`;
}

// Featured outdoor experiences: the editorial OUTDOOR_FEATURED_KEYS set,
// rendered as the existing compact related-card (band + name), with the
// band carrying the community and the caption listing the activities the
// destination belongs to. Renders nothing if no key resolves.
function renderOutdoorFeaturedHtml(venues) {
  const byKey = new Map(venues.map((v) => [`${v.region}/${v.slug}`, v]));
  const featured = OUTDOOR_FEATURED_KEYS.map((k) => byKey.get(k)).filter(Boolean);
  if (!featured.length) return '';
  const labels = getOutdoorActivityLabelsByVenue(featured.map((v) => v.id));
  const cards = featured.map((v) => `<div class="related-card related-card-outdoor">
      <div class="compact-band compact-band-outdoor compact-band-sm"><span class="compact-band-label">${escapeHtml(REGION_LABELS[v.region] || v.region)}</span></div>
      <a href="/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}">${escapeHtml(v.name)}</a>
      <div class="related-meta">${escapeHtml((labels.get(v.id) || []).join(' \u00b7 '))}</div>
    </div>`).join('');
  return `<h2 class="category-subsection-heading">Featured Outdoor Experiences</h2>
  <div class="related-grid outdoor-featured-grid">${cards}</div>`;
}

// The landing page's directory: every outdoor destination once, as a
// compact card (name + the activities it belongs to) grouped under its
// community, instead of 28 full listing cards. Descriptions live on the
// activity, regional and venue pages, where the visitor has already made
// a choice. Groups are ordered by community label, matching the region
// selector above it.
function renderOutdoorRegionIndexHtml(venues) {
  if (!venues.length) return '';
  const labels = getOutdoorActivityLabelsByVenue(venues.map((v) => v.id));
  const groups = new Map();
  for (const v of venues) { if (!groups.has(v.region)) groups.set(v.region, []); groups.get(v.region).push(v); }
  const regions = [...groups.keys()].filter((r) => REGION_LABELS[r]).sort((a, b) => REGION_LABELS[a].localeCompare(REGION_LABELS[b]));
  const sections = regions.map((r) => {
    const list = groups.get(r).slice().sort((a, b) => a.name.localeCompare(b.name));
    const cards = list.map((v) => `<div class="related-card related-card-outdoor outdoor-index-card">
        <a href="/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}">${escapeHtml(v.name)}</a>
        <div class="related-meta">${escapeHtml((labels.get(v.id) || []).join(' \u00b7 '))}</div>
      </div>`).join('');
    return `<section class="outdoor-region-group">
      <h3 class="outdoor-region-heading">${escapeHtml(REGION_LABELS[r])}<span class="outdoor-region-count">${list.length}</span></h3>
      <div class="related-grid outdoor-index-grid">${cards}</div>
    </section>`;
  }).join('\n    ');
  return `<div class="outdoor-region-index">
    ${sections}
  </div>`;
}

// GET /outdoors/:activity — one activity's outdoor destinations across
// the whole valley. Mirrors renderCategoryAllRegionsPage(): same themed
// shell, same cards (with the community line), its own H1/canonical/
// JSON-LD, plus the activity selector with this activity active.
function renderOutdoorActivityPage(activity, venues) {
  const label = CATEGORY_LABELS.outdoor;
  const title = `${activity.label} in the Okanagan | Okanagan Roam`;
  const description = `${venues.length} outdoor destinations for ${activity.label.toLowerCase()} across the Okanagan Valley \u2014 ${activity.blurb}`;
  const canonical = `https://okanaganroam.com/outdoors/${activity.slug}`;
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Outdoors', url: 'https://okanaganroam.com/outdoors' },
    { name: activity.label, url: canonical },
  ]);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    itemListElement: venues.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://okanaganroam.com/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}`,
      item: { '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness', name: v.name, description: v.description || undefined },
    })),
  };
  const hiddenGemIds = getHiddenGemVenueIds();
  const advisoryNotes = getAdvisoryNotes();
  const cardsHtml = renderCategoryCardsHtml('outdoor', venues, hiddenGemIds, '', getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { showRegion: true });
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: true, outdoorTheme: true, advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)) })}
${golfEngagementHeadHtml('outdoor')}
</head>
<body${themedBodyClassAttr('outdoor')}>
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: 'Outdoors', href: '/outdoors' },
    { name: activity.label },
  ])}
  <a class="category-back-link" href="/outdoors">\u2190 All Outdoors</a>
  <h1>${escapeHtml(activity.label)} in the Okanagan</h1>
  <p class="subtitle">${venues.length} ${escapeHtml(label.plural.toLowerCase())} for ${escapeHtml(activity.label.toLowerCase())} across the Okanagan Valley.</p>
  <p class="outdoor-intro">${escapeHtml(activity.blurb)}</p>
  ${renderOutdoorActivitySelector(activity.slug)}
  ${cardsHtml}
  <a class="cta" href="/outdoors">Back to Outdoors</a>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
  ${golfCardEngagementScriptHtml('outdoor')}
</body>
</html>`;
}

// Short visitor-facing intro under the H1 on the Wine, Beaches and Golf hubs
// (2026-09-26), matching the one Food & Drink, What's On and Outdoors carry.
// Same look as their .outdoor-intro: those three hubs don't load the outdoor
// theme (and must not carry its classes -- see the Outdoors Phase 2
// regression test), so .hub-intro repeats that one rule's declarations for
// them only. The count subtitle below it is unchanged.
const HUB_INTRO_TEXT = {
  winery: 'Discover the Okanagan\u2019s renowned wine country, from intimate family-run wineries to celebrated estates, cellar doors and vineyard experiences across the valley.',
  beach: 'Find your perfect place to swim, relax and soak up the Okanagan sun, with beaches and lakeside spots stretching from the North Okanagan to Osoyoos.',
  golf: 'Tee off among some of the Okanagan\u2019s most scenic courses, with championship layouts, relaxed local courses and golf experiences for every level.',
};
const HUB_INTRO_STYLE = '<style>body.golf-page .hub-intro { font-size: 1.04rem; line-height: 1.65; max-width: 68ch; color: var(--ink); opacity: 0.85; margin: -8px 0 22px; }</style>';

// GET /:category — Okanagan-wide category listing (2026-09-19; currently
// golf only, see ALL_REGIONS_CATEGORIES). Mirrors renderCategoryPage()
// above, minus everything that assumes a single region: no region
// breadcrumb level, no region-scoped title/H1/canonical, and each card/
// ItemList entry links using that venue's OWN region (venueCardHtml()
// already builds its href from venue.region/venue.type/venue.slug, so the
// shared card markup needed no changes at all to be mixed-region-safe).
// Already fully generic by `type` -- adding a future category here is
// just adding its slug to ALL_REGIONS_CATEGORIES, nothing in this
// function needs to change.
// `filter` (2026-09-20, discovery refinement): the parsed /outdoors query
// ({ regions, activities } from parseOutdoorFilterQuery) so a filtered
// link renders already filtered -- pressed chips, contextual counts,
// hidden non-matching cards, the summary and the selected-filter tags --
// before any script runs (and without scripting). Ignored for every
// other category. Omitted = nothing selected = today's landing markup.
function renderCategoryAllRegionsPage(type, venues, filter = null, opts = {}) {
  const catSlug = CATEGORY_SLUGS[type];
  const label = CATEGORY_LABELS[type];
  // Themed presentation for this hub only (see HUB_ONLY_THEMED_TYPES).
  // Threaded explicitly into every shared helper below so a hub-only type
  // never reaches renderCategoryPage() or renderVenuePage().
  const hubThemed = usesThemedHubLayout(type);
  // Outdoors Phase 2: /outdoors is a discovery landing page ("Outdoors in
  // the Okanagan": intro, activity selector, featured experiences, region
  // chips, then the full directory) rather than a bare listing. Every
  // other category keeps its heading, copy and section order untouched.
  const isOutdoorLanding = type === 'outdoor';
  // The landing's heading (2026-09-24, owner decision): "Outdoor Adventures"
  // rather than the "<Plural> in the Okanagan" pattern the other hubs use.
  // `heading` also builds `title`, so the <title>, og:title, twitter:title
  // and the ItemList schema name all follow it -- the rename is deliberately
  // consistent across all of them. The breadcrumb still reads "Outdoor
  // Destinations" (it comes from CATEGORY_LABELS, not from here).
  const heading = isOutdoorLanding ? 'Outdoor Adventures' : `${label.plural} in the Okanagan`;
  const title = `${heading} | Okanagan Roam`;
  const description = isOutdoorLanding
    ? `${venues.length} verified outdoor destinations across the Okanagan Valley — hiking, cycling, winter, nature, viewpoints and more, from Enderby to Osoyoos and the ski resorts.`
    : `${venues.length} verified ${label.plural.toLowerCase()} across the Okanagan Valley — real listings reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com/${catSlug}`;
  const regionSelector = renderCategoryRegionSelector(catSlug, venues);
  // Landing (2026-09-21 order): Choose Region(s) -> Explore by Activity
  // (six featured image cards + "View All Outdoor Activities" revealing
  // five more, each linking to its EXISTING /outdoors/<slug> page) -> Show
  // all results -> the filtered outdoor cards. The former Choose
  // Activity(s) chip row is gone: activities are picked through the cards,
  // the landing itself filters by region. Regions OR; nothing selected
  // lists every destination. Filtering happens in the browser over the
  // cards rendered below (renderOutdoorFilterScriptHtml); a URL
  // ?activities= selection is still honoured for the first paint.
  const outdoorActivityMap = isOutdoorLanding ? getOutdoorActivitySlugsByVenue(venues) : new Map();
  const selectedRegions = isOutdoorLanding && filter ? filter.regions.filter((r) => REGION_LABELS[r]) : [];
  const selectedActivities = isOutdoorLanding && filter ? filter.activities : [];
  const outdoorMatching = isOutdoorLanding ? filterOutdoorVenues(venues, selectedRegions, selectedActivities, outdoorActivityMap) : venues;
  const outdoorMatchIds = new Set(outdoorMatching.map((v) => v.id));
  const outdoorCounts = isOutdoorLanding ? outdoorChipCounts(venues, outdoorActivityMap, selectedRegions, selectedActivities) : null;
  const outdoorSummary = isOutdoorLanding
    ? outdoorSummaryText(outdoorMatching.length, venues.length, selectedRegions.map((r) => REGION_LABELS[r]), selectedActivities.map((a) => (OUTDOOR_ACTIVITY_BY_SLUG[a] || { label: a }).label))
    : '';
  // Explorer layout (2026-09-22): three clearly separated steps, each an
  // .outdoor-step with the existing teal-marker heading -- Choose
  // Region(s) -> Choose Activity(s) -> Results -- and a small "N selected"
  // status beside the first two headings. The Show results / Clear all
  // controls sit between the choices and the results.
  // Simplified surface (2026-09-24): search -> activity chips -> activity
  // guides -> the Regions popover -> the result bar -> the cards. The step
  // headings, the nine image tiles and the "Show N results" CTA are gone;
  // the two step-status live regions stay, now visually hidden, and keep
  // being updated by the same updateStepStatus() calls. No date control.
  const outdoorIntroHtml = isOutdoorLanding
    ? `<p class="outdoor-intro outdoors-intro">Lakeshore rail trails, canyon waterfalls, grassland viewpoints, desert boardwalks and alpine ski runs \u2014 the Okanagan\u2019s outdoors run the length of the valley.</p>
  ${outdoorsSearchHtml()}
  ${outdoorsActivityChipsHtml({ selectedActivities, counts: outdoorCounts })}
  ${outdoorsFilterBarHtml(venues, { selectedRegions, counts: outdoorCounts })}
  <span class="visually-hidden" id="outdoorRegionStatus"${selectedRegions.length ? '' : ' hidden'}>${selectedRegions.length ? `${selectedRegions.length} selected` : ''}</span>
  <span class="visually-hidden" id="outdoorActivityStatus"${selectedActivities.length ? '' : ' hidden'}>${selectedActivities.length ? `${selectedActivities.length} selected` : ''}</span>
  <section class="outdoor-step outdoor-step-results outdoors-results-step" aria-labelledby="outdoorResultsTop">
  <h2 class="visually-hidden" id="outdoorResultsTop">Results</h2>
  ${outdoorsResultBarHtml(outdoorSummary, selectedRegions, selectedActivities)}
  <p class="outdoor-no-results" id="outdoorNoResults"${outdoorMatching.length === 0 ? '' : ' hidden'}>No outdoor destinations match that combination yet. <a href="/outdoors" id="outdoorNoResultsClear">Clear the filters</a> to see everything.</p>
  <script type="application/json" id="outdoorActivityMap">${JSON.stringify(Object.fromEntries([...outdoorActivityMap].map(([id, slugs]) => [String(id), slugs]))).replace(/</g, '\\u003c')}</script>`
    : '';
  const outdoorDirectoryHeading = '';


  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
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
      url: `https://okanaganroam.com/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}`,
      item: {
        '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness',
        name: v.name,
        description: v.description || undefined,
      },
    })),
  };

  const hiddenGemIds = getHiddenGemVenueIds();
  const advisoryNotes = getAdvisoryNotes();
  // Okanagan-wide listing: cards carry their community so same-named
  // venues in different communities can be told apart. The Outdoors
  // landing instead renders the compact region-grouped index.
  // Landing (2026-09-22): the venue list is the activity universe
  // (getOutdoorLandingVenues), so a beach-type activity member renders as
  // a beach card here; the beach card rules are loaded in pageHead only
  // when one is present (beachTheme), so a landing without any is as before.
  // Landing: the results list is pre-filtered to the URL selection (cards
  // outside it carry `hidden`, the list itself is hidden when nothing
  // matches) so the first paint, a no-script visitor and the client script
  // all agree; every card is still in the markup for the script to toggle.
  const golfDetails = type === 'golf' ? golfDetailsFor(venues) : new Map();
  const cardsHtml = isOutdoorLanding
    ? renderCategoryCardsHtml(type, venues, hiddenGemIds, '', getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { showRegion: true, themed: hubThemed })
        .replace('<ul class="card-grid">', `<ul class="card-grid" id="outdoorResults"${outdoorMatching.length === 0 ? ' hidden' : ''}>`)
        .replace(/<li class="venue-card" data-venue-id="(\d+)"([^>]*)>/g, (m, id, rest) => (outdoorMatchIds.has(Number(id)) ? m : `<li class="venue-card" data-venue-id="${id}"${rest} hidden>`))
    : renderCategoryCardsHtml(type, venues, hiddenGemIds, '', getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { showRegion: true, themed: hubThemed },
      type === 'golf' ? { details: golfDetails, sort: opts.golfSort, basePath: `/${catSlug}`, today: opts.today } : {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: hubThemed, beachTheme: type === 'beach' || (isOutdoorLanding && venues.some((v) => v.type === 'beach')), outdoorTheme: type === 'outdoor', advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)), golfDataStyles: golfDetails.size > 0 })}${isOutdoorLanding ? '\n' + renderOutdoorsSimplifiedStyles() : ''}
${golfEngagementHeadHtml(type, hubThemed)}${HUB_INTRO_TEXT[type] ? '\n' + HUB_INTRO_STYLE : ''}
</head>
<body${themedBodyClassAttr(type, hubThemed)}>
  ${hubThemed ? renderGolfTripTrayHtml() + '\n<div id="floatingTooltip"></div>\n' + renderGolfHeaderHtml() + '\n  <main class="wrap-wide golf-main">' : siteHeader('https://okanaganroam.com/', 'Explore the full directory →')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: label.plural },
  ])}
  <h1>${escapeHtml(heading)}</h1>
  ${HUB_INTRO_TEXT[type] ? `<p class="hub-intro">${escapeHtml(HUB_INTRO_TEXT[type])}</p>\n  ` : ''}${isOutdoorLanding ? '' : `<p class="subtitle">${venues.length} verified ${escapeHtml(label.plural.toLowerCase())} across the Okanagan Valley.</p>\n  `}${outdoorIntroHtml}${isOutdoorLanding ? '' : regionSelector}
  ${outdoorDirectoryHeading}${cardsHtml}${isOutdoorLanding ? '\n  </section>' : ''}
  ${isOutdoorLanding ? '' : '<a class="cta" href="/browse">Back to the full directory</a>'}
  ${hubThemed ? '</main>' : ''}
  ${renderHomeFooterHTML(true)}
  ${hubThemed ? GOLF_APP_SCRIPT_TAG : ''}
  ${golfCardEngagementScriptHtml(type, hubThemed)}${isOutdoorLanding ? '\n  ' + renderOutdoorFilterScriptHtml() : ''}
</body>
</html>`;
}

// ---------- Food & Drink hub (2026-09-24): the directory at /food-drink ----------
//
// Until now the "Food & Drink directory" was /browse?types=restaurant,cafe,
// brewery,pub,cocktail -- i.e. okanagan.html (the frozen homepage file) with
// its client-side wizard. That page cannot be redesigned without editing the
// approved homepage, so this is a NEW, purely additive server-rendered hub in
// the same shape as /wineries and /outdoors: nothing in okanagan.html,
// app.js, /browse, Wine, Golf, Beaches, Outdoors or What's On changes.
//
// The visitor-facing model is three independent filter groups over one list:
//   venue type  (OR within the group)   -- what kind of place
//   features    (AND within the group)  -- what you are looking for
//   region      (OR within the group)   -- where
// and AND between the groups. Features are ANDed on purpose: "dog friendly
// AND patio" is what someone choosing a place actually means, whereas two
// venue types or two regions read as alternatives.
//
// Every feature below is an existing BOOL_FIELDS column with real coverage in
// production -- nothing here is inferred or invented. Requests for Breakfast /
// Takeout / Delivery are deliberately NOT offered: no column represents them,
// and guessing would put false claims on venue cards. "Cocktails" and "Craft
// Beer" are the Cocktail Lounges and Breweries venue types.
const FD_HUB_TYPES = [
  { type: 'restaurant', label: 'Restaurants' },
  { type: 'cafe', label: 'Cafés' },
  { type: 'pub', label: 'Pubs & Bars' },
  { type: 'cocktail', label: 'Cocktail Lounges' },
  { type: 'brewery', label: 'Breweries' },
  { type: 'distillery', label: 'Distilleries' },
];
// Wineries are deliberately absent: they are their own section with their own
// /wineries hub, and duplicating them here would split that directory.
const FD_HUB_FEATURES = [
  { key: 'patio', label: 'Patio', icon: '☀️' },
  { key: 'dog_friendly', label: 'Dog Friendly', icon: '🐕' },
  { key: 'kid_friendly', label: 'Kid Friendly', icon: '👶' },
  { key: 'vegetarian', label: 'Vegetarian Options', icon: '🥗' },
  { key: 'vegan', label: 'Vegan Options', icon: '🌱' },
  { key: 'gluten_free', label: 'Gluten-Free Options', icon: '🌾' },
  { key: 'live_music', label: 'Live Music', icon: '🎵' },
  { key: 'lake_view', label: 'Lake View', icon: '🌊' },
  { key: 'great_groups', label: 'Great for Groups', icon: '👥' },
  { key: 'happy_hour', label: 'Happy Hour', icon: '🍸' },
  { key: 'sports_tv', label: 'Sports on TV', icon: '📺' },
  { key: 'nonalcoholic', label: 'Non-Alcoholic Options', icon: '🥤' },
];
const FD_HUB_FEATURE_KEYS = new Set(FD_HUB_FEATURES.map((f) => f.key));
// How many cards are in the render tree at a time. 75 keeps the initial page
// well under the point where style+layout becomes noticeable while still
// filling more than a screen on every viewport; see the incremental-rendering
// note in renderFoodDrinkHubPage.
const FD_PAGE_SIZE = 75;
const FD_HUB_LABEL_BY_TYPE = Object.fromEntries(FD_HUB_TYPES.map((t) => [t.type, t.label]));
const FD_HUB_LABEL_BY_FEATURE = Object.fromEntries(FD_HUB_FEATURES.map((f) => [f.key, f.label]));

// The hub's universe: every active venue whose PRIMARY type is one of the
// five, plus every venue holding an fd_* secondary membership -- the same
// "effective categories" rule the API already uses, so a brewery that is also
// a restaurant appears once and answers to both chips.
function getFoodDrinkHubVenues() {
  const typePlaceholders = FOOD_DRINK_TYPES.map(() => '?').join(', ');
  const kindPlaceholders = FD_CATEGORY_COLLECTION_KINDS.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT v.* FROM venues v
    WHERE v.redirect_to IS NULL AND (
      v.type IN (${typePlaceholders})
      OR EXISTS (
        SELECT 1 FROM collection_items ci
        JOIN collections c ON c.id = ci.collection_id
        WHERE ci.content_type = 'venue' AND ci.content_id = v.id AND c.kind IN (${kindPlaceholders})
      )
    )
    ORDER BY v.name ASC
  `).all(...FOOD_DRINK_TYPES, ...FD_CATEGORY_COLLECTION_KINDS).map(rowToVenue);
  return attachFoodDrinkCategories(rows);
}
// venue id -> effective category list, for the client script's filtering.
function foodDrinkCategoriesByVenue(venues) {
  const map = new Map();
  for (const v of venues) map.set(v.id, (v.fd_categories && v.fd_categories.length) ? v.fd_categories : (FD_CATEGORY_KIND_BY_TYPE[v.type] ? [v.type] : []));
  return map;
}
// venue id -> the feature keys that venue actually has set.
function foodDrinkFeaturesByVenue(venues) {
  const map = new Map();
  for (const v of venues) map.set(v.id, FD_HUB_FEATURES.filter((f) => Number(v[f.key]) === 1).map((f) => f.key));
  return map;
}

// The filter predicate, shared verbatim by the server render and the inline
// client script (see FD_HUB_FILTER_CLIENT_PREDICATE_SRC). Types OR, regions
// OR, features AND, and AND between the three groups; an empty group imposes
// no constraint. This is Food & Drink's OWN predicate -- the Outdoors/What's
// On one is untouched, because their semantics differ (no feature group).
function foodDrinkFilterMatches(selTypes, selFeatures, selRegions, venueCats, venueFeatures, venueRegion) {
  const typeOk = !selTypes.length || selTypes.some((t) => venueCats.includes(t));
  const regionOk = !selRegions.length || selRegions.includes(venueRegion);
  const featureOk = selFeatures.every((f) => venueFeatures.includes(f));
  return typeOk && regionOk && featureOk;
}
const FD_HUB_FILTER_CLIENT_PREDICATE_SRC = `function fdMatches(types, features, regions, venueCats, venueFeatures, venueRegion){
    var typeOk = !types.length, regionOk = !regions.length || regions.indexOf(venueRegion) !== -1;
    for (var i = 0; i < types.length && !typeOk; i++) { if (venueCats.indexOf(types[i]) !== -1) typeOk = true; }
    var featureOk = true;
    for (var j = 0; j < features.length && featureOk; j++) { if (venueFeatures.indexOf(features[j]) === -1) featureOk = false; }
    return typeOk && regionOk && featureOk;
  }`;
function filterFoodDrinkVenues(venues, f, catsById, featsById) {
  return venues.filter((v) => foodDrinkFilterMatches(f.types, f.features, f.regions, catsById.get(v.id) || [], featsById.get(v.id) || [], v.region));
}
// ?types=a,b&features=x,y&regions=c,d -- unknown values are dropped and
// duplicates collapse, so a hand-edited link degrades to "fewer constraints",
// never an error page. Anything else in the query is ignored.
function parseFoodDrinkFilterQuery(query) {
  const split = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : '').split(',').map((x) => x.trim()).filter(Boolean);
  const types = [], features = [], regions = [];
  for (const t of split(query && query.types)) if (FD_CATEGORY_KIND_BY_TYPE[t] && !types.includes(t)) types.push(t);
  for (const f of split(query && query.features)) if (FD_HUB_FEATURE_KEYS.has(f) && !features.includes(f)) features.push(f);
  for (const r of split(query && query.regions)) if (REGION_LABELS[r] && !regions.includes(r)) regions.push(r);
  return { types, features, regions };
}
// Contextual counts: each chip shows how many venues it would contribute
// given the OTHER groups' current selection, so a count can never promise
// results a tap won't deliver. A feature chip ignores only its own group's
// other selections in the same way.
function foodDrinkChipCounts(venues, f, catsById, featsById) {
  const types = {}, features = {}, regions = {};
  for (const v of venues) {
    const cats = catsById.get(v.id) || [], feats = featsById.get(v.id) || [];
    if (foodDrinkFilterMatches([], f.features, f.regions, cats, feats, v.region)) for (const t of cats) types[t] = (types[t] || 0) + 1;
    if (foodDrinkFilterMatches(f.types, f.features, [], cats, feats, v.region)) regions[v.region] = (regions[v.region] || 0) + 1;
    if (foodDrinkFilterMatches(f.types, [], f.regions, cats, feats, v.region)) for (const k of feats) features[k] = (features[k] || 0) + 1;
  }
  return { types, features, regions };
}
// The one-line count, shared verbatim by the server and the client twin.
function foodDrinkSummaryText(shown, total, filtered) {
  const noun = total === 1 ? 'place' : 'places';
  return filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
}
const FD_HUB_SUMMARY_CLIENT_SRC = `function fdSummaryText(shown, total, filtered){
    var noun = total === 1 ? 'place' : 'places';
    return filtered ? (shown + ' of ' + total + ' ' + noun) : (total + ' ' + noun);
  }`;

function foodDrinkSearchHtml() {
  return `<div class="fd-search">
    <label class="visually-hidden" for="fdSearch">Search food and drink</label>
    <input type="search" id="fdSearch" class="fd-search-input" placeholder="Search by name, place or dish..." autocomplete="off" spellcheck="false">
    <button type="button" class="fd-search-clear" id="fdSearchClear" aria-label="Clear search" hidden>&#215;</button>
  </div>`;
}
// Venue-type chips: "All" plus the five categories. "All" is a reset control
// (data-fd-type-all), not a sixth type -- it is pressed exactly when no type
// is chosen, which is already what "no constraint" means to the predicate.
function foodDrinkTypeChipsHtml(state = {}) {
  const selected = new Set(state.types || []);
  const counts = state.counts && state.counts.types ? state.counts.types : null;
  const all = `<button type="button" class="outdoor-filter-chip fd-type-chip fd-type-all" data-fd-type-all="1" aria-pressed="${selected.size ? 'false' : 'true'}">All</button>`;
  const chips = FD_HUB_TYPES.map((t) => {
    const n = counts ? (counts[t.type] || 0) : null;
    return `<button type="button" class="outdoor-filter-chip fd-type-chip" data-fd-type="${t.type}" aria-pressed="${selected.has(t.type) ? 'true' : 'false'}">${escapeHtml(t.label)}${n === null ? '' : `<span class="outdoor-activity-count">${n}</span>`}</button>`;
  }).join('');
  return `<div class="fd-type-row" role="group" aria-label="Choose venue types" data-filter="fd-type">${all}${chips}</div>`;
}
// "What are you looking for?" -- the twelve verified feature columns, as
// toggles inside a popover so the page does not become a wall of controls.
function foodDrinkFeatureChipsHtml(state = {}, onlyKeys = null) {
  const selected = new Set(state.features || []);
  const counts = state.counts && state.counts.features ? state.counts.features : null;
  const chips = FD_HUB_FEATURES.filter((f) => !onlyKeys || onlyKeys.includes(f.key)).map((f) => {
    const n = counts ? (counts[f.key] || 0) : null;
    return `<button type="button" class="outdoor-filter-chip fd-feature-chip" data-fd-feature="${f.key}" aria-pressed="${selected.has(f.key) ? 'true' : 'false'}"><span class="fd-feature-icon" aria-hidden="true">${f.icon}</span> ${escapeHtml(f.label)}${n === null ? '' : `<span class="outdoor-activity-count">${n}</span>`}</button>`;
  }).join('');
  return `<div class="fd-feature-grid" role="group" aria-label="Choose what you are looking for" data-filter="fd-feature">${chips}</div>`;
}
// The two popovers. Regions reuses renderOutdoorRegionFilterChips() verbatim,
// so the canonical 20-region list and its FOOTER_REGION_GROUPS grouping are
// literally the same code the other directories use -- no second region
// system, and it cannot drift.
function foodDrinkFilterBarHtml(venues, state = {}, scopeFeatures = null) {
  const nF = (state.features || []).length, nR = (state.regions || []).length;
  // A destination category page (scopeFeatures set) offers only "What are you
  // looking for?", with just the features that page's venues actually have --
  // the region is fixed by the URL, so there is no Regions popover.
  if (scopeFeatures) {
    if (!scopeFeatures.length) return '';
    return `<div class="fd-controls">
    <div class="fd-pop">
      <button type="button" class="fd-pop-btn" id="fdFeaturesBtn" aria-expanded="false" aria-controls="fdFeaturesPanel"><span class="fd-pop-icon" aria-hidden="true">✨</span> What are you looking for?<span class="fd-pop-count" id="fdFeaturesCount"${nF ? '' : ' hidden'}>${nF ? ` · ${escapeHtml(String(nF))}` : ''}</span></button>
      <div class="fd-pop-panel" id="fdFeaturesPanel" hidden>${foodDrinkFeatureChipsHtml(state, scopeFeatures)}
        <div class="fd-pop-actions"><button type="button" class="fd-pop-apply" data-fd-apply>Show results</button></div>
      </div>
    </div>
  </div>`;
  }
  const pop = (id, label, icon, badge, panel) => `<div class="fd-pop">
      <button type="button" class="fd-pop-btn" id="${id}Btn" aria-expanded="false" aria-controls="${id}Panel"><span class="fd-pop-icon" aria-hidden="true">${icon}</span> ${label}<span class="fd-pop-count" id="${id}Count"${badge ? '' : ' hidden'}>${badge ? ` · ${escapeHtml(String(badge))}` : ''}</span></button>
      <div class="fd-pop-panel" id="${id}Panel" hidden>${panel}
        <div class="fd-pop-actions"><button type="button" class="fd-pop-apply" data-fd-apply>Show results</button></div>
      </div>
    </div>`;
  return `<div class="fd-controls">
    ${pop('fdFeatures', 'What are you looking for?', '✨', nF || '', foodDrinkFeatureChipsHtml(state))}
    ${pop('fdRegions', 'Regions', '📍', nR || '', renderOutdoorRegionFilterChips(venues, { selectedRegions: state.regions || [], counts: state.counts }))}
  </div>`;
}
// Removable active-filter tags, one row per group, plus Clear all.
function foodDrinkSelectedTagsHtml(state = {}) {
  const tag = (kind, v, label) => `<button type="button" class="outdoor-selected-tag" data-fd-remove-${kind}="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(label)}">${escapeHtml(label)}<span class="outdoor-selected-x" aria-hidden="true">×</span></button>`;
  const row = (label, tags) => (tags.length ? `<div class="outdoor-selected-row"><span class="outdoor-selected-label">${label}</span> ${tags.join(' ')}</div>` : '');
  const t = (state.types || []).map((x) => tag('type', x, FD_HUB_LABEL_BY_TYPE[x] || x));
  const f = (state.features || []).map((x) => tag('feature', x, FD_HUB_LABEL_BY_FEATURE[x] || x));
  const r = (state.regions || []).map((x) => tag('region', x, REGION_LABELS[x] || x));
  const any = t.length + f.length + r.length > 0;
  return `<div class="outdoor-selected" id="fdSelected"${any ? '' : ' hidden'}>${row('Types', t)}${row('Looking for', f)}${row('Regions', r)}${any ? '<button type="button" class="outdoor-selected-clear" id="fdSelectedClear">Clear all</button>' : ''}</div>`;
}
function foodDrinkResultBarHtml(summary, state) {
  return `<div class="fd-resultbar">
    <p class="fd-count" id="fdResultsSummary" aria-live="polite">${escapeHtml(summary)}</p>
  </div>
  ${foodDrinkSelectedTagsHtml(state)}`;
}

// Page-scoped stylesheet, emitted ONLY by this page (never by the shared
// theme blocks), so nothing here can reach the homepage, Wine, Outdoors,
// What's On, Golf or Beaches. The base .outdoor-filter-chip / .outdoor-
// selected-* rules are reused as-is and deliberately NOT modified, because
// the other directories depend on them.
function renderFoodDrinkHubStyles() {
  return `<style>
  body.fd-page .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  body.fd-page .fd-intro { margin: 0 0 14px; max-width: 70ch; }

  body.fd-page .fd-search { position: relative; margin: 0 0 12px; max-width: 520px; }
  body.fd-page .fd-search-input { width: 100%; box-sizing: border-box; font: inherit; font-family: 'Nunito', sans-serif; font-size: 0.95rem; padding: 10px 36px 10px 14px; min-height: 42px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.18); background: var(--paper); color: var(--ink); }
  body.fd-page .fd-search-input::placeholder { color: rgba(42,32,25,0.55); }
  body.fd-page .fd-search-input:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.fd-page .fd-search-input::-webkit-search-cancel-button, body.fd-page .fd-search-input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
  body.fd-page .fd-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; cursor: pointer; font-size: 1.2rem; line-height: 1; color: var(--ink); opacity: 0.6; padding: 6px 8px; }
  body.fd-page .fd-search-clear[hidden] { display: none; }

  /* flex-wrap: nowrap is explicit so the chips scroll sideways on a phone
     instead of stacking into a tall block; desktop wraps instead. */
  body.fd-page .fd-type-row { display: flex; flex-wrap: nowrap; gap: 8px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding: 2px 0 8px; margin: 0 0 10px; }
  body.fd-page .fd-type-row::-webkit-scrollbar { height: 6px; }
  body.fd-page .fd-type-row::-webkit-scrollbar-thumb { background: rgba(74,52,40,0.2); border-radius: 999px; }
  body.fd-page .fd-type-row .outdoor-filter-chip { flex: 0 0 auto; white-space: nowrap; }
  @media (min-width: 900px) { body.fd-page .fd-type-row { flex-wrap: wrap; overflow: visible; } }

  body.fd-page .fd-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  body.fd-page .fd-pop { position: relative; }
  body.fd-page .fd-pop-btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ink); background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 999px; padding: 8px 14px; min-height: 40px; cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; }
  body.fd-page .fd-pop-btn:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.fd-page .fd-pop-btn:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.fd-page .fd-pop-btn[aria-expanded="true"] { background: var(--ref-navy, #1B2B3A); color: var(--paper); border-color: var(--ref-navy, #1B2B3A); }
  body.fd-page .fd-pop-count[hidden] { display: none; }
  body.fd-page .fd-pop-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; min-width: 280px; max-width: min(92vw, 620px); max-height: 60vh; overflow-y: auto; background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 14px; box-shadow: 0 18px 40px -20px var(--shadow, rgba(42,32,25,0.5)); padding: 14px; }
  body.fd-page .fd-pop-panel[hidden] { display: none; }
  /* Without scripting a popover can never be opened, so the panels stay
     visible inline and the page degrades to the full control set. */
  body.fd-page .fd-controls:not(.js) .fd-pop-panel, body.fd-page .fd-controls:not(.js) .fd-pop-panel[hidden] { position: static; display: block; max-width: none; max-height: none; box-shadow: none; border: 0; padding: 10px 0 0; }
  body.fd-page .fd-controls:not(.js) .fd-pop-btn { display: none; }
  /* On phones a panel is a full-width sheet under the controls row; the ROW
     is the positioning context, so the offset resolves against the button. */
  @media (max-width: 640px) {
    body.fd-page .fd-controls { position: relative; }
    body.fd-page .fd-pop { position: static; }
    body.fd-page .fd-pop-panel { left: 0; right: 0; width: auto; min-width: 0; max-width: none; }
  }
  @media (min-width: 900px) { body.fd-page .fd-pop-panel { min-width: 520px; } }
  body.fd-page .fd-pop-panel .outdoor-filter-group { margin: 0; }
  body.fd-page .fd-feature-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  body.fd-page .fd-feature-icon { font-size: 0.95em; }

  /* "Show results" (2026-09-24): selecting the last filter in a popover used
     to leave the visitor having to click somewhere outside it to get back to
     the list. Filtering is already live, so this is an explicit dismiss +
     confirmation affordance -- the primary action in the panel, in the
     homepage's navy/gold system, with the live count as its label. */
  body.fd-page .fd-pop-actions { position: sticky; bottom: -14px; margin: 12px -14px -14px; padding: 10px 14px; background: var(--paper); border-top: 1px solid rgba(27,43,58,0.12); border-radius: 0 0 14px 14px; }
  body.fd-page .fd-pop-apply { display: block; width: 100%; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ref-cream); background: var(--ref-navy); border: 1px solid var(--ref-gold); border-radius: 999px; padding: 10px 16px; min-height: 44px; cursor: pointer; transition: background .12s ease; }
  body.fd-page .fd-pop-apply:hover { background: var(--ref-navy-deep); }
  body.fd-page .fd-pop-apply:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  /* "Show more" reveals the next batch. Centered, comfortable target, and the
     homepage's navy/gold button system -- same language as the popovers'
     "Show results". It removes itself once every match is on screen. */
  body.fd-page .fd-more-row { display: flex; justify-content: center; margin: 22px 0 8px; }
  body.fd-page .fd-show-more { font-family: 'Nunito', sans-serif; font-size: 0.9rem; font-weight: 800; color: var(--ref-cream); background: var(--ref-navy); border: 1px solid var(--ref-gold); border-radius: 999px; padding: 12px 26px; min-height: 48px; cursor: pointer; transition: background .12s ease; }
  body.fd-page .fd-show-more:hover { background: var(--ref-navy-deep); }
  body.fd-page .fd-show-more:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.fd-page .fd-show-more[hidden] { display: none; }

  body.fd-page .fd-resultbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 6px; }
  body.fd-page .fd-count { margin: 0; font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 800; color: var(--ink); }
  body.fd-page .fd-results-step { margin-top: 4px; }
  body.fd-page #fdResults > .venue-card[hidden] { display: none; }
  body.fd-page .fd-no-results { margin: 14px 0 0; font-family: 'Nunito', sans-serif; font-weight: 700; }
</style>`;
}

// The inline script: the same interaction contract as the Outdoors explorer
// (toggle chips, filter the already-rendered cards, keep the selection in the
// URL, pushState/popstate, Clear all) with this page's three groups and its
// own client-side search. No network, no framework.
function renderFoodDrinkHubScriptHtml() {
  const labels = {
    regions: { ...REGION_LABELS },
    types: { ...FD_HUB_LABEL_BY_TYPE },
    features: { ...FD_HUB_LABEL_BY_FEATURE },
  };
  return `<script>
(function(){
  var LABELS = ${JSON.stringify(labels).replace(/</g, '\\u003c')};
  var dataEl = document.getElementById('fdVenueData');
  var DATA = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
  var typeChips = Array.prototype.slice.call(document.querySelectorAll('[data-fd-type]'));
  var featureChips = Array.prototype.slice.call(document.querySelectorAll('[data-fd-feature]'));
  var regionChips = Array.prototype.slice.call(document.querySelectorAll('[data-region]'));
  var allChip = document.querySelector('[data-fd-type-all]');
  // The pool is every card on the page: the ones already in the list plus the
  // ones parsed into the inert <template>. Reading attributes and text off a
  // template's cards costs nothing -- they are never styled or laid out --
  // so search, filtering and the counts all still run over the FULL set.
  var tpl = document.getElementById('fdRest');
  var cards = Array.prototype.slice.call(document.querySelectorAll('#fdResults > .venue-card'))
    .concat(tpl ? Array.prototype.slice.call(tpl.content.querySelectorAll('.venue-card')) : [])
    .sort(function(a, b){ return Number(a.getAttribute('data-fd-i')) - Number(b.getAttribute('data-fd-i')); });
  if (!cards.length) return;
  var PAGE_SIZE = ${FD_PAGE_SIZE};
  var page = 1;
  var showMore = document.getElementById('fdShowMore');
  var searchInput = document.getElementById('fdSearch');
  var searchClear = document.getElementById('fdSearchClear');
  var summary = document.getElementById('fdResultsSummary');
  var selectedBox = document.getElementById('fdSelected');
  var empty = document.getElementById('fdNoResults');
  var results = document.getElementById('fdResults');
  var featuresCount = document.getElementById('fdFeaturesCount');
  var regionsCount = document.getElementById('fdRegionsCount');
  var searchTerm = '';
  var applyBtns = Array.prototype.slice.call(document.querySelectorAll('[data-fd-apply]'));
  ${FD_HUB_FILTER_CLIENT_PREDICATE_SRC}
  ${FD_HUB_SUMMARY_CLIENT_SRC}
  ${OUTDOOR_REGION_GROUP_CLIENT_SRC}
  // Searchable text per card, built once from data already in the markup:
  // name, community label, the labels of its categories and features, and
  // the meta/description lines. No new data is shipped for search.
  cards.forEach(function(card){
    var id = card.getAttribute('data-venue-id');
    var d = DATA[id] || { c: [], f: [], r: '' };
    var meta = card.querySelector('.venue-meta'), desc = card.querySelector('.golf-desc');
    var parts = [card.getAttribute('data-venue-name') || '', LABELS.regions[d.r] || '',
                 d.c.map(function(t){ return LABELS.types[t] || t; }).join(' '),
                 d.f.map(function(k){ return LABELS.features[k] || k; }).join(' '),
                 meta ? meta.textContent : '', desc ? desc.textContent : ''];
    card.__fd = parts.join(' ').toLowerCase();
  });
  function pressed(list, attr){ return list.filter(function(c){ return c.getAttribute('aria-pressed') === 'true'; }).map(function(c){ return c.getAttribute(attr); }); }
  function labelsOf(kind, list){ return list.map(function(v){ return LABELS[kind][v] || v; }); }
  var groupsRoot = document.querySelector('.outdoor-region-groups');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.outdoor-region-group-block'));
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  function setGroupOpen(block, open){ var t = block.querySelector('.outdoor-region-group-toggle'), l = block.querySelector('.outdoor-region-group-chips'); if (!t || !l) return; t.setAttribute('aria-expanded', open ? 'true' : 'false'); l.hidden = !open; }
  function updateGroupHeaders(){
    groups.forEach(function(block){
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      var sel = block.querySelector('.outdoor-region-group-selected');
      if (sel) { sel.textContent = groupSelectedText(n); sel.hidden = n === 0; }
      block.classList.toggle('has-selection', n > 0);
    });
  }
  if (groupsRoot) groupsRoot.classList.add('js');
  groups.forEach(function(block){ var t = block.querySelector('.outdoor-region-group-toggle'); if (t) t.addEventListener('click', function(){ setGroupOpen(block, t.getAttribute('aria-expanded') !== 'true'); }); });
  function updateCounts(types, features, regions){
    var tC = {}, fC = {}, rC = {};
    cards.forEach(function(card){
      var d = DATA[card.getAttribute('data-venue-id')] || { c: [], f: [], r: '' };
      if (fdMatches([], features, regions, d.c, d.f, d.r)) d.c.forEach(function(t){ tC[t] = (tC[t] || 0) + 1; });
      if (fdMatches(types, features, [], d.c, d.f, d.r)) rC[d.r] = (rC[d.r] || 0) + 1;
      if (fdMatches(types, [], regions, d.c, d.f, d.r)) d.f.forEach(function(k){ fC[k] = (fC[k] || 0) + 1; });
    });
    function paint(list, attr, counts){ list.forEach(function(c){ var n = c.querySelector('.outdoor-activity-count'); if (n) n.textContent = String(counts[c.getAttribute(attr)] || 0); }); }
    paint(typeChips, 'data-fd-type', tC); paint(featureChips, 'data-fd-feature', fC); paint(regionChips, 'data-region', rC);
  }
  function renderSelected(types, features, regions){
    if (!selectedBox) return;
    var any = types.length || features.length || regions.length;
    function tag(kind, v, label){ return '<button type="button" class="outdoor-selected-tag" data-fd-remove-' + kind + '="' + v + '" aria-label="Remove ' + label + '">' + label + '<span class="outdoor-selected-x" aria-hidden="true">\\u00d7</span></button>'; }
    function row(label, tags){ return tags.length ? '<div class="outdoor-selected-row"><span class="outdoor-selected-label">' + label + '</span> ' + tags.join(' ') + '</div>' : ''; }
    var html = row('Types', types.map(function(v){ return tag('type', v, LABELS.types[v] || v); }))
      + row('Looking for', features.map(function(v){ return tag('feature', v, LABELS.features[v] || v); }))
      + row('Regions', regions.map(function(v){ return tag('region', v, LABELS.regions[v] || v); }));
    if (any) html += '<button type="button" class="outdoor-selected-clear" id="fdSelectedClear">Clear all</button>';
    selectedBox.innerHTML = html;
    selectedBox.hidden = !any;
  }
  function queryFor(types, features, regions){
    var q = [];
    if (types.length) q.push('types=' + types.join(','));
    if (features.length) q.push('features=' + features.join(','));
    if (regions.length) q.push('regions=' + regions.join(','));
    return q.length ? '?' + q.join('&') : '';
  }
  function apply(historyMode){
    var types = pressed(typeChips, 'data-fd-type'), features = pressed(featureChips, 'data-fd-feature'), regions = pressed(regionChips, 'data-region');
    var matches = cards.filter(function(card){
      var d = DATA[card.getAttribute('data-venue-id')] || { c: [], f: [], r: '' };
      return fdMatches(types, features, regions, d.c, d.f, d.r) && (!searchTerm || (card.__fd || '').indexOf(searchTerm) !== -1);
    });
    var shown = matches.length;
    // Only the current page of MATCHING cards goes into the render tree; the
    // rest stay detached (or in the template) until "Show more" asks for them.
    var visible = matches.slice(0, page * PAGE_SIZE);
    if (results) {
      var fresh = visible.filter(function(c){ return c.parentNode !== results; });
      results.replaceChildren.apply(results, visible);
      if (fresh.length && window.__ogWireVenueCards) window.__ogWireVenueCards(fresh);
    }
    if (showMore) {
      showMore.hidden = visible.length >= shown;
      showMore.textContent = 'Show more (' + visible.length + ' of ' + shown + ')';
    }
    var total = cards.length, filtered = types.length || features.length || regions.length || !!searchTerm;
    if (allChip) allChip.setAttribute('aria-pressed', types.length ? 'false' : 'true');
    if (featuresCount) { featuresCount.textContent = features.length ? (' \\u00b7 ' + features.length) : ''; featuresCount.hidden = features.length === 0; }
    if (regionsCount) { regionsCount.textContent = regions.length ? (' \\u00b7 ' + regions.length) : ''; regionsCount.hidden = regions.length === 0; }
    if (searchClear) searchClear.hidden = !searchTerm;
    if (summary) summary.textContent = fdSummaryText(shown, total, filtered);
    applyBtns.forEach(function(b){ b.textContent = 'Show ' + shown + ' result' + (shown === 1 ? '' : 's'); });
    updateGroupHeaders(); updateCounts(types, features, regions); renderSelected(types, features, regions);
    if (empty) empty.hidden = shown !== 0;
    if (results) results.hidden = shown === 0;
    var next = window.location.pathname + queryFor(types, features, regions) + window.location.hash;
    if (window.history && historyMode !== 'none') {
      if (historyMode === 'push' && window.history.pushState && next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState({ fd: true }, '', next);
      else if (window.history.replaceState) window.history.replaceState({ fd: true }, '', next);
    }
  }
  function toggle(chip){ chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); page = 1; apply('push'); }
  if (showMore) showMore.addEventListener('click', function(){ page += 1; apply('none'); });
  [typeChips, featureChips, regionChips].forEach(function(list){ list.forEach(function(c){ c.addEventListener('click', function(){ toggle(c); }); }); });
  function clearAll(){
    [typeChips, featureChips, regionChips].forEach(function(list){ list.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); });
    searchTerm = ''; if (searchInput) searchInput.value = '';
    page = 1;
    apply('push');
  }
  if (allChip) allChip.addEventListener('click', function(){ typeChips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); page = 1; apply('push'); });
  if (searchInput) {
    var timer = null;
    searchInput.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(function(){ searchTerm = searchInput.value.trim().toLowerCase(); page = 1; apply('none'); }, 120); });
  }
  if (searchClear) searchClear.addEventListener('click', function(){ searchTerm = ''; if (searchInput) { searchInput.value = ''; searchInput.focus(); } page = 1; apply('none'); });
  if (selectedBox) selectedBox.addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.id === 'fdSelectedClear') { clearAll(); return; }
    var map = [['data-fd-remove-type', typeChips, 'data-fd-type'], ['data-fd-remove-feature', featureChips, 'data-fd-feature'], ['data-fd-remove-region', regionChips, 'data-region']];
    for (var i = 0; i < map.length; i++) {
      var v = t.getAttribute(map[i][0]);
      if (v) { map[i][1].forEach(function(c){ if (c.getAttribute(map[i][2]) === v) c.setAttribute('aria-pressed', 'false'); }.bind(null)); page = 1; apply('push'); return; }
    }
  });
  var emptyClear = document.getElementById('fdNoResultsClear');
  if (emptyClear) emptyClear.addEventListener('click', function(e){ e.preventDefault(); clearAll(); });
  var popsRoot = document.querySelector('.fd-controls');
  var pops = Array.prototype.slice.call(document.querySelectorAll('.fd-pop'));
  if (popsRoot) popsRoot.classList.add('js');
  function closePops(except){
    pops.forEach(function(pop){
      if (pop === except) return;
      var b = pop.querySelector('.fd-pop-btn'), pnl = pop.querySelector('.fd-pop-panel');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (pnl) pnl.hidden = true;
    });
  }
  pops.forEach(function(pop){
    var b = pop.querySelector('.fd-pop-btn'), pnl = pop.querySelector('.fd-pop-panel');
    if (!b || !pnl) return;
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') === 'true';
      closePops(pop);
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      pnl.hidden = open;
    });
    pnl.addEventListener('click', function(e){ e.stopPropagation(); });
  });
  // "Show results": filtering is already live, so this closes the panel and
  // hands the visitor back to the list. Every other selection is preserved.
  applyBtns.forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); closePops(null); }); });
  if (pops.length) {
    document.addEventListener('click', function(){ closePops(null); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePops(null); });
  }
  function readUrlIntoChips(){
    try {
      var params = new URLSearchParams(window.location.search);
      var pre = { t: (params.get('types') || '').split(',').filter(Boolean), f: (params.get('features') || '').split(',').filter(Boolean), r: (params.get('regions') || '').split(',').filter(Boolean) };
      typeChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.t.indexOf(c.getAttribute('data-fd-type')) !== -1 ? 'true' : 'false'); });
      featureChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.f.indexOf(c.getAttribute('data-fd-feature')) !== -1 ? 'true' : 'false'); });
      regionChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.r.indexOf(c.getAttribute('data-region')) !== -1 ? 'true' : 'false'); });
    } catch (e) {}
  }
  function openGroupsForSelection(){
    groups.forEach(function(block){
      var isDefault = block.getAttribute('data-region-group') === '${OUTDOOR_REGION_GROUP_DEFAULT_OPEN}';
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      setGroupOpen(block, (mobileQuery && mobileQuery.matches) ? groupShouldOpen(isDefault, n) : true);
    });
  }
  window.addEventListener('popstate', function(){ readUrlIntoChips(); openGroupsForSelection(); page = 1; apply('none'); });
  readUrlIntoChips();
  openGroupsForSelection();
  apply('replace');
})();
</script>`;
}

// The card list, split into the first FD_PAGE_SIZE matching cards and an
// inert <template> holding the rest (see the incremental-rendering note in
// renderFoodDrinkHubPage). Shared by /food-drink and the destination
// category pages so "Show more" works identically on both.
function foodDrinkBatchedCardsHtml(venues, matchIds, matchCount, advisoryNotes, showRegion) {
  const orderById = new Map(venues.map((v, i) => [v.id, i]));
  const allCardsHtml = renderCategoryCardsHtml('restaurant', venues, getHiddenGemVenueIds(), '', getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { showRegion, themed: true })
    .replace(/<li class="venue-card" data-venue-id="(\d+)"/g, (m, id) => `<li class="venue-card" data-fd-i="${orderById.get(Number(id))}" data-venue-id="${id}"`);
  const cardChunks = allCardsHtml.split('<li class="venue-card"').slice(1).map((x) => '<li class="venue-card"' + x.replace(/\s*<\/ul>\s*$/, ''));
  const firstBatch = [], deferred = [];
  for (const chunk of cardChunks) {
    const id = Number((chunk.match(/data-venue-id="(\d+)"/) || [])[1]);
    if (matchIds.has(id) && firstBatch.length < FD_PAGE_SIZE) firstBatch.push(chunk);
    else deferred.push(chunk);
  }
  return `<ul class="card-grid" id="fdResults"${firstBatch.length === 0 ? ' hidden' : ''}>
    ${firstBatch.join('\n')}
  </ul>
  <div class="fd-more-row"><button type="button" class="fd-show-more" id="fdShowMore"${matchCount > firstBatch.length ? '' : ' hidden'}>Show more</button></div>
  <template id="fdRest">${deferred.join('\n')}</template>`;
}

// ---------- Destination category pages (2026-09-25) ----------
//
// /{region}/{food & drink category} -- e.g. /kelowna/restaurants -- rendered
// with the /food-drink directory's own search, "What are you looking for?"
// popover, filter tags, Show more and client script, scoped to ONE
// destination and ONE category. Inclusion is by the venue's PRIMARY type
// (getVenuesByRegionCategory), never by a secondary fd_* membership, so a
// venue appears on exactly one sibling tab. The global Regions popover and
// type chips are not rendered (the URL fixes both); the destination's other
// categories are offered as sibling tabs instead. Title, description,
// canonical, H1, breadcrumb and ItemList are the ones renderCategoryPage
// produced for these URLs, so the pages' SEO identity is unchanged.
function renderFoodDrinkScopedPage(venues, filter, scope) {
  const { region, type, categoryCounts, categoryGuidePages = [] } = scope;
  const regionLabel = REGION_LABELS[region];
  const catSlug = CATEGORY_SLUGS[type];
  const label = CATEGORY_LABELS[type];
  const path = `/${region}/${catSlug}`;

  // Only primary type counts: every card answers to this page's category.
  const catsById = new Map(venues.map((v) => [v.id, [v.type]]));
  const featsById = foodDrinkFeaturesByVenue(venues);
  // Features offered = the ones at least one venue here actually has.
  const present = new Set();
  for (const feats of featsById.values()) for (const k of feats) present.add(k);
  const scopeFeatures = FD_HUB_FEATURES.map((x) => x.key).filter((k) => present.has(k));
  const q = filter || { features: [] };
  const f = { types: [], regions: [], features: (q.features || []).filter((k) => present.has(k)) };
  const matching = filterFoodDrinkVenues(venues, f, catsById, featsById);
  const matchIds = new Set(matching.map((v) => v.id));
  const counts = foodDrinkChipCounts(venues, f, catsById, featsById);
  const filtered = f.features.length > 0;
  const state = { types: [], features: f.features, regions: [], counts };

  const title = `${label.plural} in ${regionLabel}, BC | Okanagan Roam`;
  const description = venues.length === 0
    ? `No ${label.plural.toLowerCase()} are currently listed in ${regionLabel}, BC. Browse everything else Okanagan Roam covers in ${regionLabel}.`
    : `${venues.length} verified ${label.plural.toLowerCase()} in ${regionLabel}, BC — real listings with hours, ratings, and attributes, reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com${path}`;
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
  const payload = {};
  for (const v of venues) payload[String(v.id)] = { c: catsById.get(v.id) || [], f: featsById.get(v.id) || [], r: v.region };

  const advisoryNotes = getAdvisoryNotes();
  const cardsHtml = venues.length ? foodDrinkBatchedCardsHtml(venues, matchIds, matching.length, advisoryNotes, false) : '';
  const emptyHtml = venues.length === 0
    ? `<p class="fd-no-results" id="fdNoResults">No ${escapeHtml(label.plural.toLowerCase())} are listed in ${escapeHtml(regionLabel)} right now.</p>`
    : `<p class="fd-no-results" id="fdNoResults"${matching.length === 0 ? '' : ' hidden'}>No ${escapeHtml(label.plural.toLowerCase())} here match that combination yet. <a href="${path}" id="fdNoResultsClear">Clear the filters</a> to see all of them.</p>`;
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
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: true, advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)), noindex: venues.length === 0 })}
${renderOutdoorThemeStyles()}
${renderFoodDrinkHubStyles()}
${renderDestinationCategoryStyles()}
${golfEngagementHeadHtml('fd', true)}
</head>
<body class="golf-page outdoor-page fd-page fd-scoped-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${region}` },
    { name: label.plural },
  ])}
  <h1>${escapeHtml(label.plural)} in ${escapeHtml(regionLabel)}, BC</h1>
  ${regionCategoryTabsHtml(region, categoryCounts, type)}
  ${venues.length ? foodDrinkSearchHtml() : ''}
  ${venues.length ? foodDrinkFilterBarHtml(venues, state, scopeFeatures) : ''}
  <section class="outdoor-step outdoor-step-results fd-results-step" aria-labelledby="fdResultsTop">
  <h2 class="visually-hidden" id="fdResultsTop">Results</h2>
  ${foodDrinkResultBarHtml(foodDrinkSummaryText(matching.length, venues.length, filtered), state)}
  ${emptyHtml}
  ${cardsHtml}
  <script type="application/json" id="fdVenueData">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
  </section>
  ${guideLinks}
  <a class="cta" href="/${region}">Back to all of ${escapeHtml(regionLabel)}</a>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
  ${golfCardEngagementScriptHtml('fd', true)}
  ${renderFoodDrinkHubScriptHtml()}
</body>
</html>`;
}

// The page. Same themed shell as the /wineries hub (homepage header, Trip
// tray, app.css, name-as-link cards with the "View details" cue, Favorite /
// Add to Trip) so the engagement contract is identical -- list cards carry
// ONLY Favorite and Add to Trip; Website / Directions / Call stay on the
// venue detail pages, which are untouched.
function renderFoodDrinkHubPage(venues, filter = null, scope = null) {
  if (scope) return renderFoodDrinkScopedPage(venues, filter, scope);
  const f = filter || { types: [], features: [], regions: [] };
  const catsById = foodDrinkCategoriesByVenue(venues);
  const featsById = foodDrinkFeaturesByVenue(venues);
  const matching = filterFoodDrinkVenues(venues, f, catsById, featsById);
  const matchIds = new Set(matching.map((v) => v.id));
  const counts = foodDrinkChipCounts(venues, f, catsById, featsById);
  const filtered = f.types.length > 0 || f.features.length > 0 || f.regions.length > 0;
  const state = { types: f.types, features: f.features, regions: f.regions, counts };

  const heading = 'Food & Drink in the Okanagan';
  const title = `${heading} | Okanagan Roam`;
  const description = `${venues.length} restaurants, cafes, pubs, cocktail lounges and breweries across the Okanagan Valley — filter by what you are looking for, from patios and dog-friendly rooms to vegan, vegetarian and gluten-free options.`;
  const canonical = 'https://okanaganroam.com/food-drink';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Food & Drink', url: canonical },
  ]);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    itemListElement: venues.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://okanaganroam.com/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}`,
      item: { '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness', name: v.name, description: v.description || undefined },
    })),
  };
  // id -> { c: categories, f: features, r: region } for the client script.
  const payload = {};
  for (const v of venues) payload[String(v.id)] = { c: catsById.get(v.id) || [], f: featsById.get(v.id) || [], r: v.region };

  const advisoryNotes = getAdvisoryNotes();
  // Incremental rendering (2026-09-24). Putting all 850 cards in the render
  // tree cost ~2.0-3.2s of style+layout before the page was interactive
  // (measured: domInteractive 2054ms local / 3157ms live, 18,024-23,855 DOM
  // nodes) -- parsing and the scripts were never the bottleneck. So only the
  // first FD_PAGE_SIZE MATCHING cards go into the list; every other card is
  // parsed into an inert <template>, which the browser does not style, lay
  // out or paint. "Show more" moves the next batch across.
  //
  // The card HTML is byte-for-byte the SAME markup either way -- it is the
  // same renderCategoryCardsHtml() output, just split -- so there is no
  // second, client-side card renderer to drift out of sync.
  //
  // Search and filtering still run over the FULL set: the client reads the
  // data attributes and text of the template's cards without instantiating
  // them, so every venue stays searchable and filterable and the count is
  // always "N of 850". data-fd-i keeps the canonical order stable no matter
  // which subset happens to be live.
  const cardsHtml = foodDrinkBatchedCardsHtml(venues, matchIds, matching.length, advisoryNotes, true);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: true, advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)) })}
${renderOutdoorThemeStyles()}
${renderFoodDrinkHubStyles()}
${golfEngagementHeadHtml('fd', true)}
</head>
<body class="golf-page outdoor-page fd-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([{ name: 'Home', href: '/' }, { name: 'Food & Drink' }])}
  <h1>${escapeHtml(heading)}</h1>
  <p class="outdoor-intro fd-intro">Patio lunches on the lake, third-wave coffee, brewery taprooms and the valley&rsquo;s best dining rooms &mdash; every restaurant, caf&eacute;, pub, cocktail lounge and brewery Okanagan Roam has verified.</p>
  ${foodDrinkSearchHtml()}
  ${foodDrinkTypeChipsHtml(state)}
  ${foodDrinkFilterBarHtml(venues, state)}
  <section class="outdoor-step outdoor-step-results fd-results-step" aria-labelledby="fdResultsTop">
  <h2 class="visually-hidden" id="fdResultsTop">Results</h2>
  ${foodDrinkResultBarHtml(foodDrinkSummaryText(matching.length, venues.length, filtered), state)}
  <p class="fd-no-results" id="fdNoResults"${matching.length === 0 ? '' : ' hidden'}>No places match that combination yet. <a href="/food-drink" id="fdNoResultsClear">Clear the filters</a> to see everything.</p>
  ${cardsHtml}
  <script type="application/json" id="fdVenueData">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
  </section>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
  ${golfCardEngagementScriptHtml('fd', true)}
  ${renderFoodDrinkHubScriptHtml()}
</body>
</html>`;
}

// ---------- Dog Friendly Finds (2026-09-24): the directory at /dog-friendly ----------
//
// The homepage has carried a "Dog-Friendly Finds" card under Hidden Gems
// since 2026-09-17, but its href resolved to /browse -- the generic wizard,
// with no dog filter applied -- so the promise on the card ("patios and
// trails where your dog belongs") had no destination. This is that
// destination: a NEW, purely additive server-rendered hub in the same shape
// as /wineries, /outdoors and /food-drink. okanagan.html, app.js, /browse,
// Wine, Golf, Beaches, Outdoors, What's On and Food & Drink are unchanged;
// the only homepage change is that one card's href (see
// HIDDEN_GEM_EDITORIAL_CARDS).
//
// The hub unions the site's TWO dog datasets, which are disjoint in
// production (audited 2026-09-24: 254 + 27, zero overlap):
//
//   venues.dog_friendly = 1          -- 254 places that welcome your dog WITH
//                                       you: restaurants, cafes, pubs,
//                                       cocktail lounges, breweries,
//                                       wineries. Read-only here: the frozen
//                                       homepage embeds per-region counts of
//                                       this column in its hidden SEO block,
//                                       so flipping one would change '/'.
//   the 'dog_friendly' collection    -- 27 curated beaches where the dog
//                                       itself is officially allowed, each
//                                       carrying the exact restriction
//                                       (off-leash, designated area,
//                                       seasonal) in collection_items.note.
//
// Wineries ARE included even though /wineries exists: this directory answers
// "where can I take my dog", and a dog-friendly tasting patio is one of the
// best answers in the valley. /wineries remains the dedicated wine discovery
// directory and is untouched.
const DOG_BEACH_TYPE_KEY = 'dog-beach';
const DOG_HUB_TYPES = [
  { type: 'restaurant', label: 'Restaurants' },
  { type: 'cafe', label: 'Caf\u00e9s' },
  { type: 'pub', label: 'Pubs & Bars' },
  { type: 'cocktail', label: 'Cocktail Lounges' },
  { type: 'brewery', label: 'Breweries' },
  { type: 'distillery', label: 'Distilleries' },
  { type: 'winery', label: 'Wineries' },
  { type: DOG_BEACH_TYPE_KEY, label: 'Dog Beaches' },
];
const DOG_HUB_TYPE_KEYS = new Set(DOG_HUB_TYPES.map((t) => t.type));
// The venues.type values a card on this page can have, for the engagement
// script's holder selector. 'dog-beach' is a hub-only grouping key, not a
// venues.type -- those rows are type 'beach'.
const DOG_HUB_VENUE_TYPES = [...FOOD_DRINK_TYPES, 'winery', 'beach'];
// Only three features, and only ones with real coverage on these records.
// Deliberately NOT offered: off-leash, dog park, water access, parking and
// seasonal restrictions -- no column represents any of them, and the
// off-leash/seasonal detail that DOES exist lives as free text inside the
// beach notes, which is shown on the card rather than pretended into a
// filter. The dog beaches carry none of these three flags (verified), so
// selecting a feature legitimately narrows to the "bring your dog along"
// side; the contextual counts say so rather than promising otherwise.
const DOG_HUB_FEATURES = [
  { key: 'patio', label: 'Patio', icon: '\u2600\uFE0F' },
  { key: 'lake_view', label: 'Lake View', icon: '\uD83C\uDF0A' },
  { key: 'great_groups', label: 'Great for Groups', icon: '\uD83D\uDC65' },
];
const DOG_HUB_FEATURE_KEYS = new Set(DOG_HUB_FEATURES.map((f) => f.key));
const DOG_HUB_LABEL_BY_TYPE = Object.fromEntries(DOG_HUB_TYPES.map((t) => [t.type, t.label]));
const DOG_HUB_LABEL_BY_FEATURE = Object.fromEntries(DOG_HUB_FEATURES.map((f) => [f.key, f.label]));

// The hub's universe: every active venue that is either flagged dog_friendly
// or holds a dog_friendly collection membership. One query, one ORDER BY, so
// a venue that is somehow both appears exactly once.
function getDogFriendlyHubVenues() {
  const rows = db.prepare(`
    SELECT v.* FROM venues v
    WHERE v.redirect_to IS NULL AND (
      v.dog_friendly = 1
      OR EXISTS (
        SELECT 1 FROM collection_items ci
        JOIN collections c ON c.id = ci.collection_id
        WHERE ci.content_type = 'venue' AND ci.content_id = v.id AND c.kind = ?
      )
    )
    ORDER BY v.name ASC
  `).all(DOG_FRIENDLY_COLLECTION_KIND).map(rowToVenue);
  return attachFoodDrinkCategories(rows);
}
// venue id -> the hub type keys it answers to. A dog beach contributes
// 'dog-beach'; a dog_friendly venue contributes its effective Food & Drink
// categories (so a brewery that is also a restaurant answers to both) or its
// own type for wineries.
function dogHubCategoriesByVenue(venues, beachIds) {
  const map = new Map();
  for (const v of venues) {
    const cats = [];
    if (beachIds.has(v.id)) cats.push(DOG_BEACH_TYPE_KEY);
    if (Number(v.dog_friendly) === 1) {
      const fd = (v.fd_categories && v.fd_categories.length) ? v.fd_categories : [];
      for (const t of fd) if (DOG_HUB_TYPE_KEYS.has(t) && !cats.includes(t)) cats.push(t);
      if (DOG_HUB_TYPE_KEYS.has(v.type) && !cats.includes(v.type)) cats.push(v.type);
    }
    map.set(v.id, cats);
  }
  return map;
}
function dogHubFeaturesByVenue(venues) {
  const map = new Map();
  for (const v of venues) map.set(v.id, DOG_HUB_FEATURES.filter((f) => Number(v[f.key]) === 1).map((f) => f.key));
  return map;
}

// The filter predicate, shared verbatim by the server render and the inline
// client script (see DOG_HUB_FILTER_CLIENT_PREDICATE_SRC). Same three-group
// contract as Food & Drink -- types OR, regions OR, features AND, AND between
// the groups -- but this is the dog hub's OWN copy: /food-drink's predicate
// is untouched.
function dogFilterMatches(selTypes, selFeatures, selRegions, venueCats, venueFeatures, venueRegion) {
  const typeOk = !selTypes.length || selTypes.some((t) => venueCats.includes(t));
  const regionOk = !selRegions.length || selRegions.includes(venueRegion);
  const featureOk = selFeatures.every((f) => venueFeatures.includes(f));
  return typeOk && regionOk && featureOk;
}
const DOG_HUB_FILTER_CLIENT_PREDICATE_SRC = `function dogMatches(types, features, regions, venueCats, venueFeatures, venueRegion){
    var typeOk = !types.length, regionOk = !regions.length || regions.indexOf(venueRegion) !== -1;
    for (var i = 0; i < types.length && !typeOk; i++) { if (venueCats.indexOf(types[i]) !== -1) typeOk = true; }
    var featureOk = true;
    for (var j = 0; j < features.length && featureOk; j++) { if (venueFeatures.indexOf(features[j]) === -1) featureOk = false; }
    return typeOk && regionOk && featureOk;
  }`;
function filterDogVenues(venues, f, catsById, featsById) {
  return venues.filter((v) => dogFilterMatches(f.types, f.features, f.regions, catsById.get(v.id) || [], featsById.get(v.id) || [], v.region));
}
// ?types=a,b&features=x,y&regions=c,d -- unknown values are dropped and
// duplicates collapse, so a hand-edited link degrades to "fewer constraints",
// never an error page.
function parseDogFilterQuery(query) {
  const split = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : '').split(',').map((x) => x.trim()).filter(Boolean);
  const types = [], features = [], regions = [];
  for (const t of split(query && query.types)) if (DOG_HUB_TYPE_KEYS.has(t) && !types.includes(t)) types.push(t);
  for (const f of split(query && query.features)) if (DOG_HUB_FEATURE_KEYS.has(f) && !features.includes(f)) features.push(f);
  for (const r of split(query && query.regions)) if (REGION_LABELS[r] && !regions.includes(r)) regions.push(r);
  return { types, features, regions };
}
// Contextual counts: each chip shows how many venues it would contribute
// given the OTHER groups' current selection, so a count can never promise
// results a tap won't deliver.
function dogChipCounts(venues, f, catsById, featsById) {
  const types = {}, features = {}, regions = {};
  for (const v of venues) {
    const cats = catsById.get(v.id) || [], feats = featsById.get(v.id) || [];
    if (dogFilterMatches([], f.features, f.regions, cats, feats, v.region)) for (const t of cats) types[t] = (types[t] || 0) + 1;
    if (dogFilterMatches(f.types, f.features, [], cats, feats, v.region)) regions[v.region] = (regions[v.region] || 0) + 1;
    if (dogFilterMatches(f.types, [], f.regions, cats, feats, v.region)) for (const k of feats) features[k] = (features[k] || 0) + 1;
  }
  return { types, features, regions };
}
// The one-line count, shared verbatim by the server and the client twin.
function dogSummaryText(shown, total, filtered) {
  const noun = total === 1 ? 'place' : 'places';
  return filtered ? `${shown} of ${total} ${noun}` : `${total} dog-friendly ${noun}`;
}
const DOG_HUB_SUMMARY_CLIENT_SRC = `function dogSummaryText(shown, total, filtered){
    var noun = total === 1 ? 'place' : 'places';
    return filtered ? (shown + ' of ' + total + ' ' + noun) : (total + ' dog-friendly ' + noun);
  }`;

function dogSearchHtml() {
  return `<div class="fd-search">
    <label class="visually-hidden" for="dogSearch">Search dog friendly places</label>
    <input type="search" id="dogSearch" class="fd-search-input" placeholder="Search by name, place or beach..." autocomplete="off" spellcheck="false">
    <button type="button" class="fd-search-clear" id="dogSearchClear" aria-label="Clear search" hidden>&#215;</button>
  </div>`;
}
// Venue-type chips: "All" plus the seven. "All" is a reset control
// (data-dog-type-all), not an eighth type.
function dogTypeChipsHtml(state = {}) {
  const selected = new Set(state.types || []);
  const counts = state.counts && state.counts.types ? state.counts.types : null;
  const all = `<button type="button" class="outdoor-filter-chip fd-type-chip fd-type-all" data-dog-type-all="1" aria-pressed="${selected.size ? 'false' : 'true'}">All</button>`;
  const chips = DOG_HUB_TYPES.map((t) => {
    const n = counts ? (counts[t.type] || 0) : null;
    return `<button type="button" class="outdoor-filter-chip fd-type-chip" data-dog-type="${t.type}" aria-pressed="${selected.has(t.type) ? 'true' : 'false'}">${escapeHtml(t.label)}${n === null ? '' : `<span class="outdoor-activity-count">${n}</span>`}</button>`;
  }).join('');
  return `<div class="fd-type-row" role="group" aria-label="Choose venue types" data-filter="dog-type">${all}${chips}</div>`;
}
function dogFeatureChipsHtml(state = {}) {
  const selected = new Set(state.features || []);
  const counts = state.counts && state.counts.features ? state.counts.features : null;
  const chips = DOG_HUB_FEATURES.map((f) => {
    const n = counts ? (counts[f.key] || 0) : null;
    return `<button type="button" class="outdoor-filter-chip fd-feature-chip" data-dog-feature="${f.key}" aria-pressed="${selected.has(f.key) ? 'true' : 'false'}"><span class="fd-feature-icon" aria-hidden="true">${f.icon}</span> ${escapeHtml(f.label)}${n === null ? '' : `<span class="outdoor-activity-count">${n}</span>`}</button>`;
  }).join('');
  return `<div class="fd-feature-grid" role="group" aria-label="Choose what you are looking for" data-filter="dog-feature">${chips}</div>`;
}
// The two popovers. Regions reuses renderOutdoorRegionFilterChips() verbatim,
// so the canonical region list and its FOOTER_REGION_GROUPS grouping are
// literally the same code the other directories use -- no second region
// taxonomy, and it cannot drift.
function dogFilterBarHtml(venues, state = {}) {
  const nF = (state.features || []).length, nR = (state.regions || []).length;
  const pop = (id, label, icon, badge, panel) => `<div class="fd-pop">
      <button type="button" class="fd-pop-btn" id="${id}Btn" aria-expanded="false" aria-controls="${id}Panel"><span class="fd-pop-icon" aria-hidden="true">${icon}</span> ${label}<span class="fd-pop-count" id="${id}Count"${badge ? '' : ' hidden'}>${badge ? ` \u00b7 ${escapeHtml(String(badge))}` : ''}</span></button>
      <div class="fd-pop-panel" id="${id}Panel" hidden>${panel}
        <div class="fd-pop-actions"><button type="button" class="fd-pop-apply" data-dog-apply>Show results</button></div>
      </div>
    </div>`;
  return `<div class="fd-controls">
    ${pop('dogFeatures', 'What are you looking for?', '\u2728', nF || '', dogFeatureChipsHtml(state))}
    ${pop('dogRegions', 'Regions', '\uD83D\uDCCD', nR || '', renderOutdoorRegionFilterChips(venues, { selectedRegions: state.regions || [], counts: state.counts }))}
  </div>`;
}
function dogSelectedTagsHtml(state = {}) {
  const tag = (kind, v, label) => `<button type="button" class="outdoor-selected-tag" data-dog-remove-${kind}="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(label)}">${escapeHtml(label)}<span class="outdoor-selected-x" aria-hidden="true">\u00d7</span></button>`;
  const row = (label, tags) => (tags.length ? `<div class="outdoor-selected-row"><span class="outdoor-selected-label">${label}</span> ${tags.join(' ')}</div>` : '');
  const t = (state.types || []).map((x) => tag('type', x, DOG_HUB_LABEL_BY_TYPE[x] || x));
  const f = (state.features || []).map((x) => tag('feature', x, DOG_HUB_LABEL_BY_FEATURE[x] || x));
  const r = (state.regions || []).map((x) => tag('region', x, REGION_LABELS[x] || x));
  const any = t.length + f.length + r.length > 0;
  return `<div class="outdoor-selected" id="dogSelected"${any ? '' : ' hidden'}>${row('Types', t)}${row('Looking for', f)}${row('Regions', r)}${any ? '<button type="button" class="outdoor-selected-clear" id="dogSelectedClear">Clear all</button>' : ''}</div>`;
}
function dogResultBarHtml(summary, state) {
  return `<div class="fd-resultbar">
    <p class="fd-count" id="dogResultsSummary" aria-live="polite">${escapeHtml(summary)}</p>
  </div>
  ${dogSelectedTagsHtml(state)}`;
}
// The regional /guide/<region>/dog_friendly pages already exist, are indexed
// and are already in the sitemap. Linking them from the hub joins the two up
// instead of competing with them. Built from the same listGuideCombos()
// predicate the sitemap uses, so a link cannot outlive its page.
function dogRegionGuideLinksHtml() {
  const combos = listGuideCombos(MIN_GUIDE_VENUES)
    .filter((c) => c.badge === 'dog_friendly' && REGION_LABELS[c.region])
    .sort((a, b) => b.count - a.count);
  if (!combos.length) return '';
  return `<div class="related-section dog-guides">
        <h2>Dog-friendly guides by community</h2>
        <p>${combos.map((c) => `<a href="/guide/${c.region}/${c.badge}">${escapeHtml(REGION_LABELS[c.region])} (${c.count})</a>`).join(', ')}</p>
      </div>`;
}

// Page-scoped stylesheet. The Food & Drink hub's .fd-* control classes are
// reused verbatim (same controls, same behaviour, no reason for a second
// visual language) and are NOT modified here -- this block only scopes them
// to body.dog-page and adds the one thing this page has that no other
// directory does: the inline dog-beach restriction note.
function renderDogHubStyles() {
  return `<style>
  body.dog-page .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  body.dog-page .fd-intro { margin: 0 0 14px; max-width: 70ch; }

  body.dog-page .fd-search { position: relative; margin: 0 0 12px; max-width: 520px; }
  body.dog-page .fd-search-input { width: 100%; box-sizing: border-box; font: inherit; font-family: 'Nunito', sans-serif; font-size: 0.95rem; padding: 10px 36px 10px 14px; min-height: 42px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.18); background: var(--paper); color: var(--ink); }
  body.dog-page .fd-search-input::placeholder { color: rgba(42,32,25,0.55); }
  body.dog-page .fd-search-input:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.dog-page .fd-search-input::-webkit-search-cancel-button, body.dog-page .fd-search-input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
  body.dog-page .fd-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; cursor: pointer; font-size: 1.2rem; line-height: 1; color: var(--ink); opacity: 0.6; padding: 6px 8px; }
  body.dog-page .fd-search-clear[hidden] { display: none; }

  /* flex-wrap: nowrap is explicit so the chips scroll sideways on a phone
     instead of stacking into a tall block; desktop wraps instead. */
  body.dog-page .fd-type-row { display: flex; flex-wrap: nowrap; gap: 8px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding: 2px 0 8px; margin: 0 0 10px; }
  body.dog-page .fd-type-row::-webkit-scrollbar { height: 6px; }
  body.dog-page .fd-type-row::-webkit-scrollbar-thumb { background: rgba(74,52,40,0.2); border-radius: 999px; }
  body.dog-page .fd-type-row .outdoor-filter-chip { flex: 0 0 auto; white-space: nowrap; }
  @media (min-width: 900px) { body.dog-page .fd-type-row { flex-wrap: wrap; overflow: visible; } }

  body.dog-page .fd-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  body.dog-page .fd-pop { position: relative; }
  body.dog-page .fd-pop-btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ink); background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 999px; padding: 8px 14px; min-height: 40px; cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; }
  body.dog-page .fd-pop-btn:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.dog-page .fd-pop-btn:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.dog-page .fd-pop-btn[aria-expanded="true"] { background: var(--ref-navy, #1B2B3A); color: var(--paper); border-color: var(--ref-navy, #1B2B3A); }
  body.dog-page .fd-pop-count[hidden] { display: none; }
  body.dog-page .fd-pop-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; min-width: 280px; max-width: min(92vw, 620px); max-height: 60vh; overflow-y: auto; background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 14px; box-shadow: 0 18px 40px -20px var(--shadow, rgba(42,32,25,0.5)); padding: 14px; }
  body.dog-page .fd-pop-panel[hidden] { display: none; }
  /* Without scripting a popover can never be opened, so the panels stay
     visible inline and the page degrades to the full control set. */
  body.dog-page .fd-controls:not(.js) .fd-pop-panel, body.dog-page .fd-controls:not(.js) .fd-pop-panel[hidden] { position: static; display: block; max-width: none; max-height: none; box-shadow: none; border: 0; padding: 10px 0 0; }
  body.dog-page .fd-controls:not(.js) .fd-pop-btn { display: none; }
  /* On phones a panel is a full-width sheet under the controls row; the ROW
     is the positioning context, so the offset resolves against the button. */
  @media (max-width: 640px) {
    body.dog-page .fd-controls { position: relative; }
    body.dog-page .fd-pop { position: static; }
    body.dog-page .fd-pop-panel { left: 0; right: 0; width: auto; min-width: 0; max-width: none; }
  }
  @media (min-width: 900px) { body.dog-page .fd-pop-panel { min-width: 520px; } }
  body.dog-page .fd-pop-panel .outdoor-region-groups { margin: 0; }
  body.dog-page .fd-feature-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  body.dog-page .fd-feature-icon { font-size: 0.95em; }

  body.dog-page .fd-pop-actions { position: sticky; bottom: -14px; margin: 12px -14px -14px; padding: 10px 14px; background: var(--paper); border-top: 1px solid rgba(27,43,58,0.12); border-radius: 0 0 14px 14px; }
  body.dog-page .fd-pop-apply { display: block; width: 100%; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ref-cream); background: var(--ref-navy); border: 1px solid var(--ref-gold); border-radius: 999px; padding: 10px 16px; min-height: 44px; cursor: pointer; transition: background .12s ease; }
  body.dog-page .fd-pop-apply:hover { background: var(--ref-navy-deep); }
  body.dog-page .fd-pop-apply:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }

  body.dog-page .fd-resultbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 6px; }
  body.dog-page .fd-count { margin: 0; font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 800; color: var(--ink); }
  body.dog-page .fd-results-step { margin-top: 4px; }
  body.dog-page #dogResults > .venue-card[hidden] { display: none; }
  body.dog-page .fd-no-results { margin: 14px 0 0; font-family: 'Nunito', sans-serif; font-weight: 700; }

  /* The dog-beach restriction, on the card where it is actually read. Teal
     rather than the advisory's amber: this is standing official information,
     not a temporary warning, and the two must not look alike. */
  body.dog-page .dog-note { margin: 8px 0 0; font-family: 'Nunito', sans-serif; font-size: 0.86rem; line-height: 1.45; color: var(--ink); background: rgba(42,107,103,0.08); border-left: 3px solid var(--teal, #2A6B67); border-radius: 0 8px 8px 0; padding: 8px 10px; }
  body.dog-page .dog-note-label { font-weight: 800; color: var(--teal-deep, #1E4F4C); }
  body.dog-page .dog-guides { margin-top: 28px; }
</style>`;
}

// The inline script: the same interaction contract as the Food & Drink hub
// (toggle chips, filter the already-rendered cards, keep the selection in the
// URL, pushState/popstate, Clear all) over this page's three groups. No
// incremental rendering: every card is in the list from the first byte, so
// there is no <template>, no "Show more" and no re-parenting -- at this size
// that machinery would cost more than it saves. No network, no framework.
function renderDogHubScriptHtml() {
  const labels = {
    regions: { ...REGION_LABELS },
    types: { ...DOG_HUB_LABEL_BY_TYPE },
    features: { ...DOG_HUB_LABEL_BY_FEATURE },
  };
  return `<script>
(function(){
  var LABELS = ${JSON.stringify(labels).replace(/</g, '\\u003c')};
  var dataEl = document.getElementById('dogVenueData');
  var DATA = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
  var typeChips = Array.prototype.slice.call(document.querySelectorAll('[data-dog-type]'));
  var featureChips = Array.prototype.slice.call(document.querySelectorAll('[data-dog-feature]'));
  var regionChips = Array.prototype.slice.call(document.querySelectorAll('[data-region]'));
  var allChip = document.querySelector('[data-dog-type-all]');
  var cards = Array.prototype.slice.call(document.querySelectorAll('#dogResults > .venue-card'));
  if (!cards.length) return;
  var searchInput = document.getElementById('dogSearch');
  var searchClear = document.getElementById('dogSearchClear');
  var summary = document.getElementById('dogResultsSummary');
  var selectedBox = document.getElementById('dogSelected');
  var empty = document.getElementById('dogNoResults');
  var results = document.getElementById('dogResults');
  var featuresCount = document.getElementById('dogFeaturesCount');
  var regionsCount = document.getElementById('dogRegionsCount');
  var searchTerm = '';
  var applyBtns = Array.prototype.slice.call(document.querySelectorAll('[data-dog-apply]'));
  ${DOG_HUB_FILTER_CLIENT_PREDICATE_SRC}
  ${DOG_HUB_SUMMARY_CLIENT_SRC}
  ${OUTDOOR_REGION_GROUP_CLIENT_SRC}
  // Searchable text per card, built once from data already in the markup:
  // name, community label, the labels of its types and features, the
  // meta/description lines and the dog-beach restriction note. No new data is
  // shipped for search.
  cards.forEach(function(card){
    var id = card.getAttribute('data-venue-id');
    var d = DATA[id] || { c: [], f: [], r: '' };
    var meta = card.querySelector('.venue-meta'), desc = card.querySelector('.golf-desc'), note = card.querySelector('.dog-note');
    var parts = [card.getAttribute('data-venue-name') || '', LABELS.regions[d.r] || '',
                 d.c.map(function(t){ return LABELS.types[t] || t; }).join(' '),
                 d.f.map(function(k){ return LABELS.features[k] || k; }).join(' '),
                 meta ? meta.textContent : '', desc ? desc.textContent : '', note ? note.textContent : ''];
    card.__dog = parts.join(' ').toLowerCase();
  });
  function pressed(list, attr){ return list.filter(function(c){ return c.getAttribute('aria-pressed') === 'true'; }).map(function(c){ return c.getAttribute(attr); }); }
  var groupsRoot = document.querySelector('.outdoor-region-groups');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.outdoor-region-group-block'));
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  function setGroupOpen(block, open){ var t = block.querySelector('.outdoor-region-group-toggle'), l = block.querySelector('.outdoor-region-group-chips'); if (!t || !l) return; t.setAttribute('aria-expanded', open ? 'true' : 'false'); l.hidden = !open; }
  function updateGroupHeaders(){
    groups.forEach(function(block){
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      var sel = block.querySelector('.outdoor-region-group-selected');
      if (sel) { sel.textContent = groupSelectedText(n); sel.hidden = n === 0; }
      block.classList.toggle('has-selection', n > 0);
    });
  }
  if (groupsRoot) groupsRoot.classList.add('js');
  groups.forEach(function(block){ var t = block.querySelector('.outdoor-region-group-toggle'); if (t) t.addEventListener('click', function(){ setGroupOpen(block, t.getAttribute('aria-expanded') !== 'true'); }); });
  function updateCounts(types, features, regions){
    var tC = {}, fC = {}, rC = {};
    cards.forEach(function(card){
      var d = DATA[card.getAttribute('data-venue-id')] || { c: [], f: [], r: '' };
      if (dogMatches([], features, regions, d.c, d.f, d.r)) d.c.forEach(function(t){ tC[t] = (tC[t] || 0) + 1; });
      if (dogMatches(types, features, [], d.c, d.f, d.r)) rC[d.r] = (rC[d.r] || 0) + 1;
      if (dogMatches(types, [], regions, d.c, d.f, d.r)) d.f.forEach(function(k){ fC[k] = (fC[k] || 0) + 1; });
    });
    function paint(list, attr, counts){ list.forEach(function(c){ var n = c.querySelector('.outdoor-activity-count'); if (n) n.textContent = String(counts[c.getAttribute(attr)] || 0); }); }
    paint(typeChips, 'data-dog-type', tC); paint(featureChips, 'data-dog-feature', fC); paint(regionChips, 'data-region', rC);
  }
  function renderSelected(types, features, regions){
    if (!selectedBox) return;
    var any = types.length || features.length || regions.length;
    function tag(kind, v, label){ return '<button type="button" class="outdoor-selected-tag" data-dog-remove-' + kind + '="' + v + '" aria-label="Remove ' + label + '">' + label + '<span class="outdoor-selected-x" aria-hidden="true">\\u00d7</span></button>'; }
    function row(label, tags){ return tags.length ? '<div class="outdoor-selected-row"><span class="outdoor-selected-label">' + label + '</span> ' + tags.join(' ') + '</div>' : ''; }
    var html = row('Types', types.map(function(v){ return tag('type', v, LABELS.types[v] || v); }))
      + row('Looking for', features.map(function(v){ return tag('feature', v, LABELS.features[v] || v); }))
      + row('Regions', regions.map(function(v){ return tag('region', v, LABELS.regions[v] || v); }));
    if (any) html += '<button type="button" class="outdoor-selected-clear" id="dogSelectedClear">Clear all</button>';
    selectedBox.innerHTML = html;
    selectedBox.hidden = !any;
  }
  function queryFor(types, features, regions){
    var q = [];
    if (types.length) q.push('types=' + types.join(','));
    if (features.length) q.push('features=' + features.join(','));
    if (regions.length) q.push('regions=' + regions.join(','));
    return q.length ? '?' + q.join('&') : '';
  }
  function apply(historyMode){
    var types = pressed(typeChips, 'data-dog-type'), features = pressed(featureChips, 'data-dog-feature'), regions = pressed(regionChips, 'data-region');
    var shown = 0;
    cards.forEach(function(card){
      var d = DATA[card.getAttribute('data-venue-id')] || { c: [], f: [], r: '' };
      var ok = dogMatches(types, features, regions, d.c, d.f, d.r) && (!searchTerm || (card.__dog || '').indexOf(searchTerm) !== -1);
      card.hidden = !ok;
      if (ok) shown++;
    });
    var total = cards.length, filtered = types.length || features.length || regions.length || !!searchTerm;
    if (allChip) allChip.setAttribute('aria-pressed', types.length ? 'false' : 'true');
    if (featuresCount) { featuresCount.textContent = features.length ? (' \\u00b7 ' + features.length) : ''; featuresCount.hidden = features.length === 0; }
    if (regionsCount) { regionsCount.textContent = regions.length ? (' \\u00b7 ' + regions.length) : ''; regionsCount.hidden = regions.length === 0; }
    if (searchClear) searchClear.hidden = !searchTerm;
    if (summary) summary.textContent = dogSummaryText(shown, total, filtered);
    applyBtns.forEach(function(b){ b.textContent = 'Show ' + shown + ' result' + (shown === 1 ? '' : 's'); });
    updateGroupHeaders(); updateCounts(types, features, regions); renderSelected(types, features, regions);
    if (empty) empty.hidden = shown !== 0;
    if (results) results.hidden = shown === 0;
    var next = window.location.pathname + queryFor(types, features, regions) + window.location.hash;
    if (window.history && historyMode !== 'none') {
      if (historyMode === 'push' && window.history.pushState && next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState({ dog: true }, '', next);
      else if (window.history.replaceState) window.history.replaceState({ dog: true }, '', next);
    }
  }
  function toggle(chip){ chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply('push'); }
  [typeChips, featureChips, regionChips].forEach(function(list){ list.forEach(function(c){ c.addEventListener('click', function(){ toggle(c); }); }); });
  function clearAll(){
    [typeChips, featureChips, regionChips].forEach(function(list){ list.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); });
    searchTerm = ''; if (searchInput) searchInput.value = '';
    apply('push');
  }
  if (allChip) allChip.addEventListener('click', function(){ typeChips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); apply('push'); });
  if (searchInput) {
    var timer = null;
    searchInput.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(function(){ searchTerm = searchInput.value.trim().toLowerCase(); apply('none'); }, 120); });
  }
  if (searchClear) searchClear.addEventListener('click', function(){ searchTerm = ''; if (searchInput) { searchInput.value = ''; searchInput.focus(); } apply('none'); });
  if (selectedBox) selectedBox.addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.id === 'dogSelectedClear') { clearAll(); return; }
    var map = [['data-dog-remove-type', typeChips, 'data-dog-type'], ['data-dog-remove-feature', featureChips, 'data-dog-feature'], ['data-dog-remove-region', regionChips, 'data-region']];
    for (var i = 0; i < map.length; i++) {
      var v = t.getAttribute(map[i][0]);
      if (v) { map[i][1].forEach(function(c){ if (c.getAttribute(map[i][2]) === v) c.setAttribute('aria-pressed', 'false'); }.bind(null)); apply('push'); return; }
    }
  });
  var emptyClear = document.getElementById('dogNoResultsClear');
  if (emptyClear) emptyClear.addEventListener('click', function(e){ e.preventDefault(); clearAll(); });
  var popsRoot = document.querySelector('.fd-controls');
  var pops = Array.prototype.slice.call(document.querySelectorAll('.fd-pop'));
  if (popsRoot) popsRoot.classList.add('js');
  function closePops(except){
    pops.forEach(function(pop){
      if (pop === except) return;
      var b = pop.querySelector('.fd-pop-btn'), pnl = pop.querySelector('.fd-pop-panel');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (pnl) pnl.hidden = true;
    });
  }
  pops.forEach(function(pop){
    var b = pop.querySelector('.fd-pop-btn'), pnl = pop.querySelector('.fd-pop-panel');
    if (!b || !pnl) return;
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') === 'true';
      closePops(pop);
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      pnl.hidden = open;
    });
    pnl.addEventListener('click', function(e){ e.stopPropagation(); });
  });
  applyBtns.forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); closePops(null); }); });
  if (pops.length) {
    document.addEventListener('click', function(){ closePops(null); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePops(null); });
  }
  function readUrlIntoChips(){
    try {
      var params = new URLSearchParams(window.location.search);
      var pre = { t: (params.get('types') || '').split(',').filter(Boolean), f: (params.get('features') || '').split(',').filter(Boolean), r: (params.get('regions') || '').split(',').filter(Boolean) };
      typeChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.t.indexOf(c.getAttribute('data-dog-type')) !== -1 ? 'true' : 'false'); });
      featureChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.f.indexOf(c.getAttribute('data-dog-feature')) !== -1 ? 'true' : 'false'); });
      regionChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.r.indexOf(c.getAttribute('data-region')) !== -1 ? 'true' : 'false'); });
    } catch (e) {}
  }
  function openGroupsForSelection(){
    groups.forEach(function(block){
      var isDefault = block.getAttribute('data-region-group') === '${OUTDOOR_REGION_GROUP_DEFAULT_OPEN}';
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      setGroupOpen(block, (mobileQuery && mobileQuery.matches) ? groupShouldOpen(isDefault, n) : true);
    });
  }
  window.addEventListener('popstate', function(){ readUrlIntoChips(); openGroupsForSelection(); apply('none'); });
  readUrlIntoChips();
  openGroupsForSelection();
  apply('replace');
})();
</script>`;
}

// The page. Same themed shell as /food-drink and /wineries (homepage header,
// Trip tray, app.css, name-as-link cards with the "View details" cue,
// Favorite / Add to Trip) so the engagement contract is identical -- list
// cards carry ONLY Favorite and Add to Trip; Website / Directions / Call stay
// on the venue detail pages, which are untouched.
function renderDogHubPage(venues, filter = null) {
  const f = filter || { types: [], features: [], regions: [] };
  const beachIds = getCollectionVenueIds(DOG_FRIENDLY_COLLECTION_KIND);
  const dogNotes = getDogFriendlyNotes();
  const catsById = dogHubCategoriesByVenue(venues, beachIds);
  const featsById = dogHubFeaturesByVenue(venues);
  const matching = filterDogVenues(venues, f, catsById, featsById);
  const matchIds = new Set(matching.map((v) => v.id));
  const counts = dogChipCounts(venues, f, catsById, featsById);
  const filtered = f.types.length > 0 || f.features.length > 0 || f.regions.length > 0;
  const state = { types: f.types, features: f.features, regions: f.regions, counts };
  const beachCount = venues.filter((v) => beachIds.has(v.id)).length;

  const heading = 'Dog Friendly Finds';
  const title = `Dog Friendly Finds in the Okanagan | Okanagan Roam`;
  const description = `${venues.length} dog-friendly places across the Okanagan Valley — patios, cafes, taprooms and tasting rooms that welcome your dog, plus ${beachCount} designated dog beaches with their official on-leash and off-leash rules.`;
  const canonical = 'https://okanaganroam.com/dog-friendly';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Dog Friendly Finds', url: canonical },
  ]);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    itemListElement: venues.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://okanaganroam.com/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}`,
      item: { '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness', name: v.name, description: v.description || undefined },
    })),
  };
  // id -> { c: types, f: features, r: region } for the client script.
  const payload = {};
  for (const v of venues) payload[String(v.id)] = { c: catsById.get(v.id) || [], f: featsById.get(v.id) || [], r: v.region };

  const advisoryNotes = getAdvisoryNotes();
  // Every card is rendered into the list server-side and simply hidden when
  // it does not match -- the /food-drink <template> + "Show more" machinery
  // is deliberately NOT reused. That page had 850 cards costing 2-3s of
  // style+layout; this one is an order of magnitude smaller, closer to
  // /outdoors (196 cards, fast), so batching would add moving parts and cost
  // the page its "everything is in the HTML" simplicity for no measured win.
  const cardsHtml = renderCategoryCardsHtml('restaurant', venues, getHiddenGemVenueIds(), '', getCollectionVenueIds('local_favorite'), advisoryNotes, dogNotes, { showRegion: true, themed: true, dogNoteInline: true })
    .replace('<ul class="card-grid">', `<ul class="card-grid" id="dogResults"${matching.length === 0 ? ' hidden' : ''}>`)
    .replace(/<li class="venue-card" data-venue-id="(\d+)"/g, (m, id) => `<li class="venue-card"${matchIds.has(Number(id)) ? '' : ' hidden'} data-venue-id="${id}"`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: true, advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)) })}
${renderOutdoorThemeStyles()}
${renderDogHubStyles()}
${golfEngagementHeadHtml('dog', true)}
</head>
<body class="golf-page outdoor-page dog-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([{ name: 'Home', href: '/' }, { name: 'Dog Friendly Finds' }])}
  <h1>${escapeHtml(heading)}</h1>
  <p class="outdoor-intro fd-intro">Patios, caf&eacute;s, taprooms and tasting rooms across the Okanagan that welcome your dog &mdash; plus every designated dog beach in the valley, each with the official on-leash or off-leash rule that actually applies when you get there.</p>
  ${dogSearchHtml()}
  ${dogTypeChipsHtml(state)}
  ${dogFilterBarHtml(venues, state)}
  <section class="outdoor-step outdoor-step-results fd-results-step" aria-labelledby="dogResultsTop">
  <h2 class="visually-hidden" id="dogResultsTop">Results</h2>
  ${dogResultBarHtml(dogSummaryText(matching.length, venues.length, filtered), state)}
  <p class="fd-no-results" id="dogNoResults"${matching.length === 0 ? '' : ' hidden'}>No dog-friendly places match that combination yet. <a href="/dog-friendly" id="dogNoResultsClear">Clear the filters</a> to see everything.</p>
  ${cardsHtml}
  <script type="application/json" id="dogVenueData">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
  </section>
  ${dogRegionGuideLinksHtml()}
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
  ${golfCardEngagementScriptHtml('dog', true)}
  ${renderDogHubScriptHtml()}
</body>
</html>`;
}

// ---------- Local Favourites (2026-09-24): the page at /local-favorites ----------
//
// The destination for the homepage's Hidden Gems "Local Favourites" card,
// which until now resolved to /browse. Membership is read live from the
// 'local_favorite' collection -- nothing is hard-coded, so an audited
// membership change through POST /admin/collection-membership is reflected
// here immediately. The per-membership rationale in collection_items.note is
// internal editorial metadata and is deliberately NOT rendered.
//
// Same themed shell and controls as /dog-friendly (homepage header, Trip
// tray, name-as-link cards with the "View details" cue, Favorite / Add to
// Trip only, search, type chips, the canonical grouped region selector),
// reduced to the two filters this collection genuinely supports: category
// (OR) and region (OR), ANDed together. No feature filter: the members carry
// almost no badge flags, so one would offer choices that return nothing.
// The page's styles are derived from renderDogHubStyles() by re-scoping the
// selector, so the two directories share one visual language and
// /dog-friendly's own output is untouched.
function getLocalFavouriteVenues() {
  return db.prepare(`
    SELECT v.* FROM venues v
    WHERE v.redirect_to IS NULL AND EXISTS (
      SELECT 1 FROM collection_items ci
      JOIN collections c ON c.id = ci.collection_id
      WHERE ci.content_type = 'venue' AND ci.content_id = v.id AND c.kind = 'local_favorite'
    )
    ORDER BY v.name ASC
  `).all().map(rowToVenue);
}
// The category chips offered: the venue types actually present, in the
// site's canonical CATEGORY_SLUGS order, labelled with CATEGORY_LABELS.
function localFavouriteTypesPresent(venues) {
  const present = new Set(venues.map((v) => v.type));
  return Object.keys(CATEGORY_SLUGS).filter((t) => present.has(t) && CATEGORY_LABELS[t]);
}
function localFavouriteFilterMatches(selTypes, selRegions, venueType, venueRegion) {
  return (!selTypes.length || selTypes.includes(venueType)) && (!selRegions.length || selRegions.includes(venueRegion));
}
const LOCAL_FAVOURITES_FILTER_CLIENT_PREDICATE_SRC = `function lfMatches(types, regions, venueType, venueRegion){
    return (!types.length || types.indexOf(venueType) !== -1) && (!regions.length || regions.indexOf(venueRegion) !== -1);
  }`;
// ?types=a,b&regions=c,d -- unknown values are dropped and duplicates
// collapse, so a hand-edited link degrades to "fewer constraints".
function parseLocalFavouritesFilterQuery(query) {
  const split = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : '').split(',').map((x) => x.trim()).filter(Boolean);
  const types = [], regions = [];
  for (const t of split(query && query.types)) if (CATEGORY_SLUGS[t] && !types.includes(t)) types.push(t);
  for (const r of split(query && query.regions)) if (REGION_LABELS[r] && !regions.includes(r)) regions.push(r);
  return { types, regions };
}
// Contextual counts: each chip shows what it would contribute given the
// other group's current selection.
function localFavouriteChipCounts(venues, f) {
  const types = {}, regions = {};
  for (const v of venues) {
    if (localFavouriteFilterMatches([], f.regions, v.type, v.region)) types[v.type] = (types[v.type] || 0) + 1;
    if (localFavouriteFilterMatches(f.types, [], v.type, v.region)) regions[v.region] = (regions[v.region] || 0) + 1;
  }
  return { types, regions };
}
function localFavouritesSummaryText(shown, total, filtered, label = 'local favourite') {
  const noun = total === 1 ? 'place' : 'places';
  return filtered ? `${shown} of ${total} ${noun}` : `${total} ${label} ${noun}`;
}
const LOCAL_FAVOURITES_SUMMARY_CLIENT_SRC = `function lfSummaryText(shown, total, filtered){
    var noun = total === 1 ? 'place' : 'places';
    return filtered ? (shown + ' of ' + total + ' ' + noun) : (total + ' local favourite ' + noun);
  }`;
function localFavouritesTypeChipsHtml(types, state = {}) {
  const selected = new Set(state.types || []);
  const counts = state.counts && state.counts.types ? state.counts.types : {};
  const all = `<button type="button" class="outdoor-filter-chip fd-type-chip fd-type-all" data-lf-type-all="1" aria-pressed="${selected.size ? 'false' : 'true'}">All</button>`;
  const chips = types.map((t) => `<button type="button" class="outdoor-filter-chip fd-type-chip" data-lf-type="${t}" aria-pressed="${selected.has(t) ? 'true' : 'false'}">${escapeHtml(CATEGORY_LABELS[t].plural)}<span class="outdoor-activity-count">${counts[t] || 0}</span></button>`).join('');
  return `<div class="fd-type-row" role="group" aria-label="Choose categories" data-filter="lf-type">${all}${chips}</div>`;
}
function localFavouritesFilterBarHtml(venues, state = {}) {
  const nR = (state.regions || []).length;
  return `<div class="fd-controls">
    <div class="fd-pop">
      <button type="button" class="fd-pop-btn" id="lfRegionsBtn" aria-expanded="false" aria-controls="lfRegionsPanel"><span class="fd-pop-icon" aria-hidden="true">\uD83D\uDCCD</span> Regions<span class="fd-pop-count" id="lfRegionsCount"${nR ? '' : ' hidden'}>${nR ? ` \u00b7 ${nR}` : ''}</span></button>
      <div class="fd-pop-panel" id="lfRegionsPanel" hidden>${renderOutdoorRegionFilterChips(venues, { selectedRegions: state.regions || [], counts: state.counts })}
        <div class="fd-pop-actions"><button type="button" class="fd-pop-apply" data-lf-apply>Show results</button></div>
      </div>
    </div>
  </div>`;
}
function localFavouritesSelectedTagsHtml(state = {}) {
  const tag = (kind, v, label) => `<button type="button" class="outdoor-selected-tag" data-lf-remove-${kind}="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(label)}">${escapeHtml(label)}<span class="outdoor-selected-x" aria-hidden="true">\u00d7</span></button>`;
  const row = (label, tags) => (tags.length ? `<div class="outdoor-selected-row"><span class="outdoor-selected-label">${label}</span> ${tags.join(' ')}</div>` : '');
  const t = (state.types || []).map((x) => tag('type', x, CATEGORY_LABELS[x] ? CATEGORY_LABELS[x].plural : x));
  const r = (state.regions || []).map((x) => tag('region', x, REGION_LABELS[x] || x));
  const any = t.length + r.length > 0;
  return `<div class="outdoor-selected" id="lfSelected"${any ? '' : ' hidden'}>${row('Categories', t)}${row('Regions', r)}${any ? '<button type="button" class="outdoor-selected-clear" id="lfSelectedClear">Clear all</button>' : ''}</div>`;
}
function renderLocalFavouritesStyles() {
  return renderDogHubStyles()
    .split('\n')
    .filter((line) => !/dog-note|dog-guides|The dog-beach restriction|rather than the advisory|not a temporary warning/.test(line))
    .join('\n')
    .replace(/body\.dog-page/g, 'body.lf-page')
    .replace(/#dogResults/g, '#lfResults');
}
function renderLocalFavouritesScriptHtml(summaryLabel = 'local favourite') {
  const labels = {
    regions: { ...REGION_LABELS },
    types: Object.fromEntries(Object.keys(CATEGORY_LABELS).map((t) => [t, CATEGORY_LABELS[t].plural])),
  };
  return `<script>
(function(){
  var LABELS = ${JSON.stringify(labels).replace(/</g, '\\u003c')};
  var dataEl = document.getElementById('lfVenueData');
  var DATA = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
  var typeChips = Array.prototype.slice.call(document.querySelectorAll('[data-lf-type]'));
  var regionChips = Array.prototype.slice.call(document.querySelectorAll('[data-region]'));
  var allChip = document.querySelector('[data-lf-type-all]');
  var cards = Array.prototype.slice.call(document.querySelectorAll('#lfResults > .venue-card'));
  if (!cards.length) return;
  var searchInput = document.getElementById('lfSearch');
  var searchClear = document.getElementById('lfSearchClear');
  var summary = document.getElementById('lfResultsSummary');
  var selectedBox = document.getElementById('lfSelected');
  var empty = document.getElementById('lfNoResults');
  var results = document.getElementById('lfResults');
  var regionsCount = document.getElementById('lfRegionsCount');
  var applyBtns = Array.prototype.slice.call(document.querySelectorAll('[data-lf-apply]'));
  var searchTerm = '';
  ${LOCAL_FAVOURITES_FILTER_CLIENT_PREDICATE_SRC}
  ${LOCAL_FAVOURITES_SUMMARY_CLIENT_SRC.replace("' local favourite '", `' ${summaryLabel} '`)}
  ${OUTDOOR_REGION_GROUP_CLIENT_SRC}
  cards.forEach(function(card){
    var d = DATA[card.getAttribute('data-venue-id')] || { t: '', r: '' };
    var meta = card.querySelector('.venue-meta'), desc = card.querySelector('.golf-desc');
    card.__lf = [card.getAttribute('data-venue-name') || '', LABELS.regions[d.r] || '', LABELS.types[d.t] || '', meta ? meta.textContent : '', desc ? desc.textContent : ''].join(' ').toLowerCase();
  });
  function pressed(list, attr){ return list.filter(function(c){ return c.getAttribute('aria-pressed') === 'true'; }).map(function(c){ return c.getAttribute(attr); }); }
  var groupsRoot = document.querySelector('.outdoor-region-groups');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.outdoor-region-group-block'));
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  function setGroupOpen(block, open){ var t = block.querySelector('.outdoor-region-group-toggle'), l = block.querySelector('.outdoor-region-group-chips'); if (!t || !l) return; t.setAttribute('aria-expanded', open ? 'true' : 'false'); l.hidden = !open; }
  function updateGroupHeaders(){
    groups.forEach(function(block){
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      var sel = block.querySelector('.outdoor-region-group-selected');
      if (sel) { sel.textContent = groupSelectedText(n); sel.hidden = n === 0; }
      block.classList.toggle('has-selection', n > 0);
    });
  }
  if (groupsRoot) groupsRoot.classList.add('js');
  groups.forEach(function(block){ var t = block.querySelector('.outdoor-region-group-toggle'); if (t) t.addEventListener('click', function(){ setGroupOpen(block, t.getAttribute('aria-expanded') !== 'true'); }); });
  function updateCounts(types, regions){
    var tC = {}, rC = {};
    cards.forEach(function(card){
      var d = DATA[card.getAttribute('data-venue-id')] || { t: '', r: '' };
      if (lfMatches([], regions, d.t, d.r)) tC[d.t] = (tC[d.t] || 0) + 1;
      if (lfMatches(types, [], d.t, d.r)) rC[d.r] = (rC[d.r] || 0) + 1;
    });
    function paint(list, attr, counts){ list.forEach(function(c){ var n = c.querySelector('.outdoor-activity-count'); if (n) n.textContent = String(counts[c.getAttribute(attr)] || 0); }); }
    paint(typeChips, 'data-lf-type', tC); paint(regionChips, 'data-region', rC);
  }
  function renderSelected(types, regions){
    if (!selectedBox) return;
    var any = types.length || regions.length;
    function tag(kind, v, label){ return '<button type="button" class="outdoor-selected-tag" data-lf-remove-' + kind + '="' + v + '" aria-label="Remove ' + label + '">' + label + '<span class="outdoor-selected-x" aria-hidden="true">\\u00d7</span></button>'; }
    function row(label, tags){ return tags.length ? '<div class="outdoor-selected-row"><span class="outdoor-selected-label">' + label + '</span> ' + tags.join(' ') + '</div>' : ''; }
    var html = row('Categories', types.map(function(v){ return tag('type', v, LABELS.types[v] || v); }))
      + row('Regions', regions.map(function(v){ return tag('region', v, LABELS.regions[v] || v); }));
    if (any) html += '<button type="button" class="outdoor-selected-clear" id="lfSelectedClear">Clear all</button>';
    selectedBox.innerHTML = html;
    selectedBox.hidden = !any;
  }
  function queryFor(types, regions){
    var q = [];
    if (types.length) q.push('types=' + types.join(','));
    if (regions.length) q.push('regions=' + regions.join(','));
    return q.length ? '?' + q.join('&') : '';
  }
  function apply(historyMode){
    var types = pressed(typeChips, 'data-lf-type'), regions = pressed(regionChips, 'data-region');
    var shown = 0;
    cards.forEach(function(card){
      var d = DATA[card.getAttribute('data-venue-id')] || { t: '', r: '' };
      var ok = lfMatches(types, regions, d.t, d.r) && (!searchTerm || (card.__lf || '').indexOf(searchTerm) !== -1);
      card.hidden = !ok;
      if (ok) shown++;
    });
    var total = cards.length, filtered = types.length || regions.length || !!searchTerm;
    if (allChip) allChip.setAttribute('aria-pressed', types.length ? 'false' : 'true');
    if (regionsCount) { regionsCount.textContent = regions.length ? (' \\u00b7 ' + regions.length) : ''; regionsCount.hidden = regions.length === 0; }
    if (searchClear) searchClear.hidden = !searchTerm;
    if (summary) summary.textContent = lfSummaryText(shown, total, filtered);
    applyBtns.forEach(function(b){ b.textContent = 'Show ' + shown + ' result' + (shown === 1 ? '' : 's'); });
    updateGroupHeaders(); updateCounts(types, regions); renderSelected(types, regions);
    if (empty) empty.hidden = shown !== 0;
    if (results) results.hidden = shown === 0;
    var next = window.location.pathname + queryFor(types, regions) + window.location.hash;
    if (window.history && historyMode !== 'none') {
      if (historyMode === 'push' && window.history.pushState && next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState({ lf: true }, '', next);
      else if (window.history.replaceState) window.history.replaceState({ lf: true }, '', next);
    }
  }
  function toggle(chip){ chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply('push'); }
  [typeChips, regionChips].forEach(function(list){ list.forEach(function(c){ c.addEventListener('click', function(){ toggle(c); }); }); });
  function clearAll(){
    [typeChips, regionChips].forEach(function(list){ list.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); });
    searchTerm = ''; if (searchInput) searchInput.value = '';
    apply('push');
  }
  if (allChip) allChip.addEventListener('click', function(){ typeChips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); apply('push'); });
  if (searchInput) {
    var timer = null;
    searchInput.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(function(){ searchTerm = searchInput.value.trim().toLowerCase(); apply('none'); }, 120); });
  }
  if (searchClear) searchClear.addEventListener('click', function(){ searchTerm = ''; if (searchInput) { searchInput.value = ''; searchInput.focus(); } apply('none'); });
  if (selectedBox) selectedBox.addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.id === 'lfSelectedClear') { clearAll(); return; }
    var map = [['data-lf-remove-type', typeChips, 'data-lf-type'], ['data-lf-remove-region', regionChips, 'data-region']];
    for (var i = 0; i < map.length; i++) {
      var v = t.getAttribute(map[i][0]);
      if (v) { map[i][1].forEach(function(c){ if (c.getAttribute(map[i][2]) === v) c.setAttribute('aria-pressed', 'false'); }); apply('push'); return; }
    }
  });
  var emptyClear = document.getElementById('lfNoResultsClear');
  if (emptyClear) emptyClear.addEventListener('click', function(e){ e.preventDefault(); clearAll(); });
  var popsRoot = document.querySelector('.fd-controls');
  var pops = Array.prototype.slice.call(document.querySelectorAll('.fd-pop'));
  if (popsRoot) popsRoot.classList.add('js');
  function closePops(except){
    pops.forEach(function(pop){
      if (pop === except) return;
      var b = pop.querySelector('.fd-pop-btn'), pnl = pop.querySelector('.fd-pop-panel');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (pnl) pnl.hidden = true;
    });
  }
  pops.forEach(function(pop){
    var b = pop.querySelector('.fd-pop-btn'), pnl = pop.querySelector('.fd-pop-panel');
    if (!b || !pnl) return;
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') === 'true';
      closePops(pop);
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      pnl.hidden = open;
    });
    pnl.addEventListener('click', function(e){ e.stopPropagation(); });
  });
  applyBtns.forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); closePops(null); }); });
  if (pops.length) {
    document.addEventListener('click', function(){ closePops(null); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePops(null); });
  }
  function readUrlIntoChips(){
    try {
      var params = new URLSearchParams(window.location.search);
      var pre = { t: (params.get('types') || '').split(',').filter(Boolean), r: (params.get('regions') || '').split(',').filter(Boolean) };
      typeChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.t.indexOf(c.getAttribute('data-lf-type')) !== -1 ? 'true' : 'false'); });
      regionChips.forEach(function(c){ c.setAttribute('aria-pressed', pre.r.indexOf(c.getAttribute('data-region')) !== -1 ? 'true' : 'false'); });
    } catch (e) {}
  }
  function openGroupsForSelection(){
    groups.forEach(function(block){
      var isDefault = block.getAttribute('data-region-group') === '${OUTDOOR_REGION_GROUP_DEFAULT_OPEN}';
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      setGroupOpen(block, (mobileQuery && mobileQuery.matches) ? groupShouldOpen(isDefault, n) : true);
    });
  }
  window.addEventListener('popstate', function(){ readUrlIntoChips(); openGroupsForSelection(); apply('none'); });
  readUrlIntoChips();
  openGroupsForSelection();
  apply('replace');
})();
</script>`;
}
function renderLocalFavouritesPage(venues, filter = null) {
  return renderCuratedCollectionPage({
    path: '/local-favorites',
    heading: 'Local Favourites',
    title: 'Local Favourites in the Okanagan | Okanagan Roam',
    description: `${venues.length} places across the Okanagan Valley with genuine local roots and credible evidence that locals value, recommend or have worked to preserve them \u2014 from independent restaurants, caf\u00e9s and pubs to community-protected parks, trails and beaches. Not a ranking.`,
    introHtml: 'Places with genuine local roots &mdash; the caf&eacute;s, pubs, restaurants, parks, trails and beaches that people who live here value, recommend, support or have worked to protect. Each one is here because of specific evidence of that local connection, not because it is popular with visitors or highly rated. They are listed alphabetically, not ranked.',
    searchLabel: 'Search local favourites',
    pluralNoun: 'local favourites',
    summaryLabel: 'local favourite',
  }, venues, filter);
}
// The shared page body behind /local-favorites and /secret-spots: one curated
// list with search, category chips, the grouped region selector, the Trip
// tray and Favorite / Add to Trip. Only the words differ between the two
// pages (cfg); the element ids, styles and script are the Local Favourites
// ones, so both pages behave identically and cannot drift apart.
function renderCuratedCollectionPage(cfg, venues, filter = null) {
  const f = filter || { types: [], regions: [] };
  const types = localFavouriteTypesPresent(venues);
  const matching = venues.filter((v) => localFavouriteFilterMatches(f.types, f.regions, v.type, v.region));
  const matchIds = new Set(matching.map((v) => v.id));
  const counts = localFavouriteChipCounts(venues, f);
  const filtered = f.types.length > 0 || f.regions.length > 0;
  const state = { types: f.types, regions: f.regions, counts };

  const heading = cfg.heading;
  const title = cfg.title;
  const description = cfg.description;
  const canonical = `https://okanaganroam.com${cfg.path}`;
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: heading, url: canonical },
  ]);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    itemListElement: venues.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://okanaganroam.com/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}`,
      item: { '@type': SCHEMA_TYPE_MAP[v.type] || 'LocalBusiness', name: v.name, description: v.description || undefined },
    })),
  };
  const payload = {};
  for (const v of venues) payload[String(v.id)] = { t: v.type, r: v.region };

  const advisoryNotes = getAdvisoryNotes();
  const cardsHtml = renderCategoryCardsHtml('restaurant', venues, getHiddenGemVenueIds(), '', getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { showRegion: true, showTypeLabel: true, themed: true })
    .replace('<ul class="card-grid">', `<ul class="card-grid" id="lfResults"${matching.length === 0 ? ' hidden' : ''}>`)
    .replace(/<li class="venue-card" data-venue-id="(\d+)"/g, (m, id) => `<li class="venue-card"${matchIds.has(Number(id)) ? '' : ' hidden'} data-venue-id="${id}"`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: true, advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)) })}
${renderOutdoorThemeStyles()}
${renderLocalFavouritesStyles()}
${golfEngagementHeadHtml('lf', true)}
</head>
<body class="golf-page outdoor-page lf-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([{ name: 'Home', href: '/' }, { name: heading }])}
  <h1>${escapeHtml(heading)}</h1>
  <p class="outdoor-intro fd-intro">${cfg.introHtml}</p>
  <div class="fd-search">
    <label class="visually-hidden" for="lfSearch">${escapeHtml(cfg.searchLabel)}</label>
    <input type="search" id="lfSearch" class="fd-search-input" placeholder="Search by name, place or category..." autocomplete="off" spellcheck="false">
    <button type="button" class="fd-search-clear" id="lfSearchClear" aria-label="Clear search" hidden>&#215;</button>
  </div>
  ${localFavouritesTypeChipsHtml(types, state)}
  ${localFavouritesFilterBarHtml(venues, state)}
  <section class="outdoor-step outdoor-step-results fd-results-step" aria-labelledby="lfResultsTop">
  <h2 class="visually-hidden" id="lfResultsTop">Results</h2>
  <div class="fd-resultbar">
    <p class="fd-count" id="lfResultsSummary" aria-live="polite">${escapeHtml(localFavouritesSummaryText(matching.length, venues.length, filtered, cfg.summaryLabel))}</p>
  </div>
  ${localFavouritesSelectedTagsHtml(state)}
  <p class="fd-no-results" id="lfNoResults"${matching.length === 0 ? '' : ' hidden'}>No ${escapeHtml(cfg.pluralNoun)} match that combination yet. <a href="${cfg.path}" id="lfNoResultsClear">Clear the filters</a> to see everything.</p>
  ${cardsHtml}
  <script type="application/json" id="lfVenueData">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
  </section>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
  ${golfCardEngagementScriptHtml('lf', true)}
  ${renderLocalFavouritesScriptHtml(cfg.summaryLabel)}
</body>
</html>`;
}

// ---------- Secret Spots (2026-09-25): the page at /secret-spots ----------
//
// The destination for the homepage's Hidden Gems "Secret Spots" card, which
// until now resolved to /browse. A Secret Spot is a Hidden Gem that is a
// PLACE -- a park, garden, waterfall, trail or quieter beach -- so the page
// lists the live 'hidden_gem' collection narrowed to the outdoor and beach
// types. The Hidden Gem cafes, breweries, pubs, wineries and golf courses
// stay in the collection (and keep their badge everywhere else) but are not
// Secret Spots. Membership stays in collection_items, so an audited change
// through POST /admin/collection-membership shows up here immediately.
const SECRET_SPOT_TYPES = ['outdoor', 'beach'];
function getSecretSpotVenues() {
  return db.prepare(`
    SELECT v.* FROM venues v
    WHERE v.redirect_to IS NULL AND v.type IN (${SECRET_SPOT_TYPES.map(() => '?').join(', ')}) AND EXISTS (
      SELECT 1 FROM collection_items ci
      JOIN collections c ON c.id = ci.collection_id
      WHERE ci.content_type = 'venue' AND ci.content_id = v.id AND c.kind = 'hidden_gem'
    )
    ORDER BY v.name ASC
  `).all(...SECRET_SPOT_TYPES).map(rowToVenue);
}
// Hidden Gems (in the given regions, or anywhere) that /secret-spots does
// not list because their type is not a Secret Spot type.
function countHiddenGemsOutsideSecretSpots(regions = []) {
  const regionSql = regions.length ? ` AND v.region IN (${regions.map(() => '?').join(', ')})` : '';
  const row = db.prepare(`
    SELECT COUNT(DISTINCT v.id) AS n FROM venues v
    JOIN collection_items ci ON ci.content_type = 'venue' AND ci.content_id = v.id
    JOIN collections c ON c.id = ci.collection_id
    WHERE c.kind = 'hidden_gem' AND v.redirect_to IS NULL
      AND v.type NOT IN (${SECRET_SPOT_TYPES.map(() => '?').join(', ')})${regionSql}
  `).get(...SECRET_SPOT_TYPES, ...regions);
  return row ? row.n : 0;
}
function renderSecretSpotsPage(venues, filter = null) {
  return renderCuratedCollectionPage({
    path: '/secret-spots',
    heading: 'Secret Spots',
    title: 'Secret Spots in the Okanagan | Okanagan Roam',
    description: `${venues.length} tucked-away parks, gardens, waterfalls and quieter beaches across the Okanagan Valley that are easy to miss and worth seeking out — each one chosen on specific evidence, not popularity. Not a ranking.`,
    introHtml: 'Looking for the places that are a little easier to miss? Secret Spots brings together tucked-away parks, gardens, waterfalls and quieter beaches across the Okanagan &mdash; the finds worth seeking out once you have seen the famous ones. Each is here because a local tourism, parks or community source points to it as a quieter or lesser-known find, not because it is popular or highly rated. They are listed alphabetically, not ranked.',
    searchLabel: 'Search secret spots',
    pluralNoun: 'secret spots',
    summaryLabel: 'tucked-away',
  }, venues, filter);
}

// ---------- Hidden Gems page (2026-09-25): /hidden-gems ----------
//
// The whole live 'hidden_gem' collection -- every type, not only the outdoor
// and beach Secret Spots -- on the shared curated-collection page, with its
// category and region filters. /hidden-gems/<badge> (e.g. /hidden-gems/
// dog-friendly) narrows it to one badge; the badge sits in the path because
// the shared page script rewrites the query string to types/regions only.
// The venue list comes from selectDiscoveryVenues, the same selection
// /api/discover uses, so the page and the API cannot disagree. Served only
// by the destination pages whatever the flags; Discovery Search and Build My
// Trip link here only while DISCOVERY_SEARCH or TRIP_PLANNER_V2 is on.
const HIDDEN_GEM_FEATURE_BY_SLUG = Object.fromEntries(Object.keys(BADGE_LABELS).map((f) => [f.replace(/_/g, '-'), f]));
function isHiddenGemsPageEnabled() {
  return isDiscoverySearchEnabled() || isTripPlannerV2Enabled();
}
function hiddenGemsIntent({ types = [], regions = [], features = [] } = {}) {
  return { mode: 'find', regions, types, features, collections: ['hidden_gem'], activities: [], cuisines: [], textTerms: [] };
}
// Same rules as selectDiscoveryVenues for a Hidden Gems intent (active venue,
// known region and type, hidden_gem membership, and for a badge the badge
// column -- or, for dog_friendly, the dog-friendly collection), read
// directly so pages that list Hidden Gems do not need the discovery
// interpreter module. hiddenGemsPageDestination still compares this page's
// venue IDs with the API's before any Discovery Search link points here.
function getHiddenGemCollectionVenues(feature = null) {
  const memberOf = (kind) => getCollectionVenueIds(kind);
  const gems = memberOf('hidden_gem');
  const dogs = feature === 'dog_friendly' ? memberOf(DOG_FRIENDLY_COLLECTION_KIND) : null;
  return db.prepare('SELECT * FROM venues WHERE redirect_to IS NULL ORDER BY name ASC').all()
    .filter((v) => REGION_LABELS[v.region] && CATEGORY_SLUGS[v.type] && gems.has(v.id))
    .filter((v) => !feature || Number(v[feature]) === 1 || (dogs && dogs.has(v.id)))
    .map(rowToVenue);
}
// A Hidden Gems destination only when the page would show exactly what the
// request matches: the same venues, none lost and none added (e.g. a venue
// that matches a category only through a secondary Food & Drink category
// would be missing from the page's primary-type filter -> no destination).
function hiddenGemsPageDestination(intent) {
  const T = intent.types, R = intent.regions, F = intent.features;
  const none = (reason) => ({ url: null, kind: null, reason });
  const feature = F[0] || null;
  const wanted = selectDiscoveryVenues(hiddenGemsIntent({ types: T, regions: R, features: F }), Number.MAX_SAFE_INTEGER);
  if (!wanted.total) return none('no_matching_hidden_gems');
  const shown = getHiddenGemCollectionVenues(feature).filter((v) => localFavouriteFilterMatches(T, R, v.type, v.region));
  const a = new Set(wanted.items.map((x) => x.id));
  if (shown.length !== a.size || !shown.every((v) => a.has(v.id))) return none('collection_page_mismatch');
  const path = feature ? `/hidden-gems/${feature.replace(/_/g, '-')}` : '/hidden-gems';
  return { url: `${path}${discoveryQueryString({ types: T, regions: R })}`, kind: 'hidden-gems', reason: 'collection' };
}
function renderHiddenGemsPage(venues, filter = null, feature = null) {
  const badge = feature ? BADGE_LABELS[feature] : null;
  const heading = badge ? `${badge.title} Hidden Gems` : 'Hidden Gems';
  const which = !badge ? ''
    : feature === 'dog_friendly'
      ? ' This view shows only the ones with the Dog-Friendly badge or on the official dog-friendly beaches list.'
      : ` This view shows only the ones with the ${escapeHtml(badge.title)} badge.`;
  return renderCuratedCollectionPage({
    path: feature ? `/hidden-gems/${feature.replace(/_/g, '-')}` : '/hidden-gems',
    heading,
    title: `${heading} in the Okanagan | Okanagan Roam`,
    description: `${venues.length} ${badge ? `${badge.adj} ` : ''}places on Okanagan Roam's Hidden Gems list across the Okanagan Valley. Not a ranking.`,
    introHtml: `Every place on Okanagan Roam&rsquo;s Hidden Gems list &mdash; caf&eacute;s, wineries, breweries, pubs, golf courses, parks and quieter beaches that are easy to miss. They are listed alphabetically, not ranked.${which}`,
    searchLabel: 'Search hidden gems',
    pluralNoun: 'hidden gems',
    summaryLabel: 'hidden gem',
  }, venues, filter);
}

// ---------- What's On (2026-09-22): page shell at /whats-on ----------
//
// The What's On counterpart to the Outdoors explorer: Choose Region(s) ->
// Choose Category(s) -> Results, built from the SAME classes, scripts
// snippets and page chrome the /outdoors landing uses (golf-page +
// outdoor-page theme, region chips, image-card toggles, step headings,
// selected-filter rows, Trip tray, header, footer) so nothing in the
// Outdoors implementation is changed and the two pages cannot drift.
// Everything page-specific is scoped to body.whatson-page. This phase
// ships the SHELL only: the twelve category tiles, the region chips, the
// filter/URL behaviour and the result-card contract -- the event data
// source (getWhatsOnEvents) is intentionally empty and the page renders a
// clean empty state rather than any placeholder inventory. Date filtering
// ("When are you visiting?") is deliberately not rendered yet; see
// WHATSON_DATE_PRESETS / whatsOnDateStepHtml for where it slots in.
const WHATSON_CATEGORIES = [
  { key: 'events-festivals', label: 'Events & Festivals' },
  { key: 'live-music', label: 'Live Music' },
  { key: 'sports-recreation', label: 'Sports & Recreation' },
  { key: 'arts-culture', label: 'Arts & Culture' },
  { key: 'food-drink-events', label: 'Food & Drink Events' },
  { key: 'markets-fairs', label: 'Markets & Fairs' },
  { key: 'family-kids', label: 'Family & Kids' },
  { key: 'nightlife', label: 'Nightlife' },
  { key: 'wineries-wine-events', label: 'Wineries & Wine Events' },
  { key: 'holiday-seasonal', label: 'Holiday & Seasonal Events' },
  { key: 'workshops-classes', label: 'Workshops & Classes' },
  { key: 'community-events', label: 'Community Events' },
];
const WHATSON_CATEGORY_BY_KEY = Object.fromEntries(WHATSON_CATEGORIES.map((c) => [c.key, c]));
// Tile art: /images/whats-on/<key>.webp (1376x768 WebP, the same format
// and per-group subdirectory convention as /images/outdoors). Emitted only
// when the file exists, so a tile without art shows the on-brand navy
// fallback with its line icon -- never a stock or unrelated image.
const WHATSON_IMAGE_DIR = path.join(__dirname, 'public', 'images', 'whats-on');
function whatsOnCategoryImagePath(key) {
  const file = path.join(WHATSON_IMAGE_DIR, `${key}.webp`);
  return fs.existsSync(file) ? `/images/whats-on/${key}.webp` : null;
}
// Plain inline line icons in the same minimal white-stroke style as the
// outdoor activity cards and homepage mood cards.
const WHATSON_CATEGORY_ICONS = {
  'events-festivals': '<path d="M4 20 6 6l6 4 6-4 2 14z"/><path d="M12 10v10"/>',
  'live-music': '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  'sports-recreation': '<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M3 12h18"/>',
  'arts-culture': '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 1-2 1-3a9 9 0 0 0-7-9z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>',
  'food-drink-events': '<path d="M8 3v7a3 3 0 0 0 6 0V3"/><path d="M11 13v8"/><path d="M17 3v18"/><path d="M17 3c2 0 3 2 3 5s-1 4-3 4"/>',
  'markets-fairs': '<path d="M3 10 5 4h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/>',
  'family-kids': '<circle cx="9" cy="6" r="2.5"/><circle cx="17" cy="8" r="2"/><path d="M4 21v-5a5 5 0 0 1 10 0v5"/><path d="M14 21v-4a3 3 0 0 1 6 0v4"/>',
  'nightlife': '<path d="M14 3a8 8 0 1 0 7 11 7 7 0 0 1-7-11z"/><path d="M5 5v2M4 6h2"/><path d="M8 13v2M7 14h2"/>',
  'wineries-wine-events': '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 13v7"/><path d="M8 20h8"/>',
  'holiday-seasonal': '<path d="M12 3v18"/><path d="M4 8l16 8"/><path d="M4 16 20 8"/><path d="m9 5 3 2 3-2"/><path d="m9 19 3-2 3 2"/><path d="m5 10 3 1 1-3"/><path d="m19 14-3-1-1 3"/>',
  'workshops-classes': '<path d="M4 5h16v11H4z"/><path d="M8 21h8"/><path d="M12 16v5"/><path d="M8 9h8M8 12h5"/>',
  'community-events': '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2"/><circle cx="19" cy="10" r="2"/><path d="M2 20v-2a3 3 0 0 1 3-3h1"/><path d="M22 20v-2a3 3 0 0 0-3-3h-1"/><path d="M7 21v-3a5 5 0 0 1 10 0v3"/>',
};
// Future "When are you visiting?" step. Not rendered in this phase; the
// presets are declared so the third filter group has a home when the
// event inventory exists (the client script already treats filter groups
// generically: regions OR, categories OR, groups AND).
const WHATSON_DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'this-weekend', label: 'This Weekend' },
  { key: 'this-week', label: 'This Week' },
  { key: 'this-month', label: 'This Month' },
  { key: 'custom', label: 'Choose Dates' },
];
// Step 6 (2026-09-22): the "When are you visiting?" step, rendered in the
// slot the shell reserved. Presets are plain links (a date change is a
// server round-trip that re-selects the event window -- frozen design D2),
// styled with the same chip class as the region pills; the client script
// leaves them out of its toggle set and rewrites their hrefs so the
// current region/category selection travels with them. "Choose Dates" is
// a small GET form with real date inputs. The window shown is the one the
// server resolved (resolveWhatsOnWindow), so an invalid custom range is
// reported honestly as the default window with a note -- never corrected.
function whatsOnDateStepHtml(state = {}) {
  const win = state.window || null;
  if (!win) return '';
  const active = win.preset;
  const chip = (d) => {
    if (d.key === 'custom') return '';
    const pressed = active === d.key;
    return `<a class="outdoor-filter-chip whatson-date-chip" href="/whats-on?when=${d.key}" data-when="${d.key}" aria-pressed="${pressed ? 'true' : 'false'}">${escapeHtml(d.label)}</a>`;
  };
  const customPressed = active === 'custom';
  const upcoming = active === 'upcoming';
  const label = upcoming
    ? `Showing the next ${WHATSON_DEFAULT_WINDOW_DAYS} days: ${escapeHtml(formatLocalDateShort(win.from, { weekday: false }))} – ${escapeHtml(formatLocalDateShort(win.to, { weekday: false }))}`
    : `Showing ${escapeHtml(formatLocalDateShort(win.from))}${win.to !== win.from ? ` – ${escapeHtml(formatLocalDateShort(win.to))}` : ''}`;
  const note = win.fallback ? `<p class="whatson-date-note" role="status">Those dates weren’t a valid range (real dates, start before end, at most ${MAX_CUSTOM_WINDOW_DAYS} days), so the next ${WHATSON_DEFAULT_WINDOW_DAYS} days are shown instead.</p>` : '';
  // `compact` (2026-09-24) renders the same controls without the step
  // wrapper/heading, for the Date popover in the simplified filter bar. The
  // presets stay plain links -- a date change is a server round-trip that
  // re-selects the event window, which this does not alter.
  const compact = state.compact === true;
  const openTag = compact ? '<div class="whatson-date-step whatson-date-compact">' : `<section class="outdoor-step whatson-date-step" aria-labelledby="whatsOnDatesHeading">
  <div class="outdoor-step-head"><h2 class="category-subsection-heading" id="whatsOnDatesHeading">When are you visiting?</h2><span class="outdoor-step-status" id="whatsOnDateStatus"${upcoming ? ' hidden' : ''}>${upcoming ? '' : '1 selected'}</span></div>`;
  const closeTag = compact ? '</div>' : '</section>';
  return `${openTag}
  <div class="category-region-selector outdoor-filter-group whatson-date-group" role="group" aria-label="Choose dates" data-filter="date">
    ${WHATSON_DATE_PRESETS.map(chip).filter(Boolean).join('\n    ')}
    <button type="button" class="outdoor-filter-chip whatson-date-chip" id="whatsOnCustomToggle" data-when="custom" aria-pressed="${customPressed ? 'true' : 'false'}" aria-expanded="${customPressed ? 'true' : 'false'}" aria-controls="whatsOnCustomDates">Choose Dates</button>
  </div>
  <form class="whatson-custom-dates" id="whatsOnCustomDates" method="get" action="/whats-on"${customPressed ? '' : ' hidden'}>
    <input type="hidden" name="when" value="custom">
    <label>From <input type="date" name="from" id="whatsOnFrom" value="${customPressed ? escapeHtml(win.from) : ''}" required></label>
    <label>To <input type="date" name="to" id="whatsOnTo" value="${customPressed ? escapeHtml(win.to) : ''}" required></label>
    <button type="submit" class="cta whatson-custom-go">Show these dates</button>
  </form>
  <p class="whatson-date-showing" id="whatsOnDateShowing">${label}</p>
  ${note}
${closeTag}`;
}
// Data source (Step 6): the Step 3/4 public read path. `window` is a
// resolved { from, to } (see resolveWhatsOnWindow); with none given the
// rolling default applies. Rows are the public card shape -- exactly what
// whatsOnEventCardHtml consumes ({ id, name, slug, region, categories,
// dateLabel, time, description, image, valleyWide, ... }). Website/phone
// stay OFF the listing card by the site's card rule; they belong on the
// detail page.
function getWhatsOnEvents(window = null) {
  const win = window || resolveWhatsOnWindow({});
  return queryWhatsOnEvents({ from: win.from, to: win.to }).map(whatsOnPublicEvent);
}
// Whether any publishable inventory exists at all (a scheduled event with
// a scheduled occurrence that has not ended). This -- not the current
// window's result count -- drives noindex and the "We're gathering" state,
// so an empty Tuesday never makes the page claim there are no events.
function whatsOnInventoryExists(now = new Date()) {
  return !!db.prepare(`SELECT 1 FROM events e
    WHERE e.status = 'scheduled'
      AND EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled' AND o.end_date >= ?)
    LIMIT 1`).get(todayLocal(now));
}
// ?regions=a,b&categories=x,y -- the Outdoors URL convention with the
// group renamed. Unknown regions/categories are dropped, duplicates
// collapse, order is kept, so a stale link degrades to fewer constraints.
function parseWhatsOnFilterQuery(query) {
  const split = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(',') : '').split(',').map((x) => x.trim()).filter(Boolean);
  const regions = [], categories = [];
  for (const r of split(query && query.regions)) if (REGION_LABELS[r] && !regions.includes(r)) regions.push(r);
  for (const c of split(query && query.categories)) if (WHATSON_CATEGORY_BY_KEY[c] && !categories.includes(c)) categories.push(c);
  return { regions, categories };
}
function filterWhatsOnEvents(events, regions, categories) {
  // A valley-wide event matches whatever regions are selected (frozen G/N).
  return events.filter((e) => outdoorFilterMatches(e.valleyWide ? [] : regions, categories, e.region, e.categories || []));
}
// The page's full query state: regions/categories (as before) plus the
// date-window parameters the Step 4 API also reads.
function parseWhatsOnPageQuery(query) {
  return parseWhatsOnReadQuery(query);
}
// Region chips: the complete canonical region list in FOOTER_REGION_GROUPS
// order, same grouped/collapsible markup and classes as the Outdoors
// landing (so its CSS and the shared group-toggle snippet apply), but
// counts are shown only when there is an event inventory to count.
function whatsOnRegionChipsHtml(state = {}) {
  const selected = new Set(state.selectedRegions || []);
  const counts = state.counts || null;
  const chip = (r) => `<button type="button" class="outdoor-filter-chip" data-region="${escapeHtml(r)}" aria-pressed="${selected.has(r) ? 'true' : 'false'}">${escapeHtml(REGION_LABELS[r])}${counts ? `<span class="outdoor-activity-count">${counts[r] || 0}</span>` : ''}</button>`;
  const placed = new Set();
  const groups = FOOTER_REGION_GROUPS.map((g) => ({ label: g.label, slug: outdoorRegionGroupSlug(g.label), regions: g.regions.filter((r) => REGION_LABELS[r]) }));
  groups.forEach((g) => g.regions.forEach((r) => placed.add(r)));
  const leftover = canonicalOutdoorRegionOrder().filter((r) => !placed.has(r));
  if (leftover.length) groups.push({ label: 'Other', slug: 'other', regions: leftover });
  const blocks = groups.map((g) => {
    const nSel = g.regions.filter((r) => selected.has(r)).length;
    const open = g.slug === OUTDOOR_REGION_GROUP_DEFAULT_OPEN || nSel > 0;
    const listId = `whatsOnRegionGroup-${g.slug}`;
    return `<div class="outdoor-region-group-block${nSel ? ' has-selection' : ''}" data-region-group="${g.slug}">
      <button type="button" class="outdoor-region-group-toggle" id="${listId}-toggle" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${listId}"><span class="outdoor-region-group-name">${escapeHtml(g.label)}</span><span class="outdoor-region-group-meta">${g.regions.length} region${g.regions.length === 1 ? '' : 's'}</span><span class="outdoor-region-group-selected"${nSel ? '' : ' hidden'}>${nSel ? `· ${nSel} selected` : ''}</span><span class="outdoor-region-group-chevron" aria-hidden="true"></span></button>
      <div class="outdoor-region-group-chips" id="${listId}" role="group" aria-label="${escapeHtml(g.label)} regions"${open ? '' : ' hidden'}>
        ${g.regions.map(chip).join('\n        ')}
      </div>
    </div>`;
  }).join('\n      ');
  return `<div class="category-region-selector outdoor-filter-group outdoor-region-groups" role="group" aria-label="Choose regions" data-filter="region">
      ${blocks}
    </div>`;
}
// One category tile: the outdoor activity card treatment as a multi-select
// toggle (same classes, so the existing pressed/ring/badge CSS applies),
// with a data-category hook for the What's On script.
function whatsOnCategoryTileHtml(cat, state = {}) {
  const img = whatsOnCategoryImagePath(cat.key);
  const pressed = (state.selectedCategories || []).includes(cat.key);
  const count = state.counts ? (state.counts[cat.key] || 0) : null;
  const icon = `<span class="outdoor-activity-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${WHATSON_CATEGORY_ICONS[cat.key] || ''}</svg></span>`;
  return `<button type="button" class="outdoor-activity-card outdoor-activity-toggle whatson-category-card whatson-category-card-${cat.key}${img ? '' : ' whatson-category-card-noart'}" data-category="${cat.key}" aria-pressed="${pressed ? 'true' : 'false'}" aria-label="${escapeHtml(cat.label)}"><span class="outdoor-activity-card-check" aria-hidden="true">&#10003; Selected</span>${img ? `<img class="outdoor-activity-card-img" src="${img}" width="1376" height="768" alt="" loading="lazy">` : ''}
      <span class="outdoor-activity-card-overlay">
        ${icon}
        <span class="outdoor-activity-card-title">${escapeHtml(cat.label)}</span>
        ${count === null ? '' : `<span class="outdoor-activity-card-count"><span class="outdoor-activity-count">${count}</span> <span class="outdoor-activity-count-noun">event${count === 1 ? '' : 's'}</span></span>`}
      </span></button>`;
}
function whatsOnCategoryGridHtml(state = {}) {
  const nSel = (state.selectedCategories || []).length;
  return `<section class="outdoor-activity-showcase outdoor-step" aria-labelledby="whatsOnCategoriesHeading">
  <div class="outdoor-step-head"><h2 class="category-subsection-heading" id="whatsOnCategoriesHeading">Choose Category(s)</h2><span class="outdoor-step-status" id="whatsOnCategoryStatus"${nSel ? '' : ' hidden'}>${nSel ? `${nSel} selected` : ''}</span></div>
  <div class="outdoor-activity-card-grid whatson-category-grid" role="group" aria-label="Choose categories" data-filter="category">
    ${WHATSON_CATEGORIES.map((c) => whatsOnCategoryTileHtml(c, state)).join('\n    ')}
  </div>
</section>`;
}
// ---------- What's On simplified controls (2026-09-24) ----------
//
// The page previously opened with ~23KB of filter markup -- twelve 1376x768
// category image tiles, four region accordions and four step headings --
// before the first event. These builders replace that with a compact chip
// row and two popovers, so results are reachable almost immediately on a
// phone. The filter CONTRACT is unchanged: every control still exposes
// data-region / data-category + aria-pressed, so the existing client script
// and the shared OUTDOOR_FILTER_CLIENT_PREDICATE_SRC keep working untouched.

// Compact search over the already-rendered cards. New on this page: there
// was no search before. Filters client-side only; it never changes the
// server-selected date window.
function whatsOnSearchHtml() {
  return `<div class="whatson-search">
    <label class="visually-hidden" for="whatsOnSearch">Search events</label>
    <input type="search" id="whatsOnSearch" class="whatson-search-input" placeholder="Search events..." autocomplete="off" spellcheck="false">
    <button type="button" class="whatson-search-clear" id="whatsOnSearchClear" aria-label="Clear search" hidden>&#215;</button>
  </div>`;
}

// Horizontal category chips, replacing whatsOnCategoryGridHtml's image grid.
// "All" is a reset control (data-category-all), not a 13th category, so the
// existing multi-select semantics are untouched: no categories pressed means
// everything shows, which is exactly what "All" represents.
function whatsOnCategoryChipsHtml(state = {}) {
  const selected = new Set(state.selectedCategories || []);
  const counts = state.counts || null;
  const allChip = `<button type="button" class="outdoor-filter-chip whatson-cat-chip whatson-cat-all" data-category-all="1" aria-pressed="${selected.size === 0 ? 'true' : 'false'}">All</button>`;
  const chips = WHATSON_CATEGORIES.map((c) => {
    const n = counts ? (counts[c.key] || 0) : null;
    return `<button type="button" class="outdoor-filter-chip whatson-cat-chip" data-category="${escapeHtml(c.key)}" aria-pressed="${selected.has(c.key) ? 'true' : 'false'}">${escapeHtml(c.label)}${n === null ? '' : `<span class="outdoor-activity-count">${n}</span>`}</button>`;
  }).join('');
  return `<div class="whatson-cat-row" role="group" aria-label="Choose categories" data-filter="category">${allChip}${chips}</div>`;
}

// The Regions / Date control row. Each popover holds the EXISTING markup for
// that filter unchanged -- the region accordion groups (still derived from
// FOOTER_REGION_GROUPS, so the grouping is whatever the data says) and the
// date presets (still server-side links, per the page's frozen design) --
// so no filtering behaviour moves, only where it lives.
function whatsOnFilterBarHtml(state = {}) {
  const nRegions = (state.selectedRegions || []).length;
  const dateActive = state.window && state.window.preset !== 'upcoming';
  const pop = (id, label, icon, badge, panelHtml) => `<div class="whatson-pop">
      <button type="button" class="whatson-pop-btn" id="${id}Btn" aria-expanded="false" aria-controls="${id}Panel"><span class="whatson-pop-icon" aria-hidden="true">${icon}</span> ${label}<span class="whatson-pop-count" id="${id}Count"${badge ? '' : ' hidden'}>${badge ? ` · ${escapeHtml(String(badge))}` : ''}</span></button>
      <div class="whatson-pop-panel" id="${id}Panel" hidden>${panelHtml}
        <div class="whatson-pop-actions"><button type="button" class="whatson-pop-apply" data-whatson-apply>Show results</button></div>
      </div>
    </div>`;
  return `<div class="whatson-controls">
    ${pop('whatsOnRegions', 'Regions', '&#128205;', nRegions || '', whatsOnRegionChipsHtml(state))}
    ${state.hasInventory ? pop('whatsOnDate', 'Date', '&#128197;', dateActive ? '1' : '', whatsOnDateStepHtml({ window: state.window, compact: true })) : ''}
  </div>`;
}

// Compact result bar: the live count, then the removable filter chips and
// Clear all directly beneath. Replaces the old "Show N results" CTA + a
// separate Results heading + summary paragraph.
function whatsOnResultBarHtml(shown, total, filtered, selectedRegions, selectedCategories) {
  return `<div class="whatson-resultbar">
    <p class="whatson-count" id="whatsOnResultsSummary" aria-live="polite">${escapeHtml(whatsOnSummaryText(shown, total, filtered))}</p>
  </div>
  ${whatsOnSelectedTagsHtml(selectedRegions, selectedCategories)}`;
}

// The result card contract: the themed venue card (name as the single
// link with the "View details" cue, meta line, clamped description,
// category chips, Favorite + Add to Trip) for an event record. No website
// or phone on the listing card. The detail href follows the existing
// events route (/:region/events/:slug).
function whatsOnEventCardHtml(ev) {
  const href = `/${ev.region}/events/${ev.slug}`;
  const when = [ev.dateLabel, ev.time].filter(Boolean).join(' · ');
  const meta = [REGION_LABELS[ev.region] ? escapeHtml(REGION_LABELS[ev.region]) : null, when ? escapeHtml(when) : null].filter(Boolean).join(' &middot; ');
  const chips = (ev.categories || []).filter((k) => WHATSON_CATEGORY_BY_KEY[k]).map((k) => `<span class="badge-chip whatson-category-chip">${escapeHtml(WHATSON_CATEGORY_BY_KEY[k].label)}</span>`).join(' ');
  const descId = `golf-desc-event-${ev.id}`;
  const tripQuery = `${ev.name}, ${REGION_LABELS[ev.region] || ev.region}, Okanagan Valley, BC`;
  return `
      <li class="venue-card whatson-event-card" data-venue-id="event-${ev.id}" data-venue-region="${escapeHtml(ev.region)}" data-venue-category="whatson" data-venue-name="${escapeHtml(ev.name)}" data-event-region="${escapeHtml(ev.region)}" data-event-categories="${escapeHtml((ev.categories || []).join(','))}"${ev.valleyWide ? ' data-event-valley-wide="1"' : ''} data-surface="whatson_card">
        ${ev.image ? `<img class="whatson-event-img" src="${escapeHtml(ev.image)}" alt="" loading="lazy">` : ''}
        <h2><a class="venue-card-link" href="${href}"><span class="venue-card-name">${escapeHtml(ev.name)}</span><span class="venue-card-cue" aria-hidden="true">View details &rarr;</span></a></h2>
        <p class="venue-meta">${meta}</p>
        ${ev.description ? `<div class="golf-desc" id="${descId}"><p>${escapeHtml(ev.description)}</p></div>
        <button type="button" class="desc-toggle" aria-expanded="false" aria-controls="${descId}" hidden>Read more &rarr;</button>` : ''}
        <p class="chips">${chips}</p>
        <div class="card-actions">
          <button type="button" class="card-action fav-btn" data-fav-name="${escapeHtml(ev.name)}" aria-pressed="false" aria-label="Favorite ${escapeHtml(ev.name)}">&#9825; Favorite</button>
          <button type="button" class="card-action trip-btn" data-trip-name="${escapeHtml(ev.name)}" data-trip-query="${escapeHtml(tripQuery)}" data-trip-region="${escapeHtml(ev.region)}" aria-pressed="false" aria-label="Add ${escapeHtml(ev.name)} to trip">&#65291; Add to Trip</button>
        </div>
      </li>`;
}
function whatsOnSelectedTagsHtml(selectedRegions, selectedCategories) {
  const tag = (kind, value, label) => `<button type="button" class="outdoor-selected-tag" data-remove-${kind}="${escapeHtml(value)}" aria-label="Remove ${escapeHtml(label)}">${escapeHtml(label)}<span class="outdoor-selected-x" aria-hidden="true">×</span></button>`;
  const row = (label, tags) => (tags.length ? `<div class="outdoor-selected-row"><span class="outdoor-selected-label">${label}</span> ${tags.join(' ')}</div>` : '');
  const regionTags = selectedRegions.map((r) => tag('region', r, REGION_LABELS[r] || r));
  const categoryTags = selectedCategories.map((c) => tag('category', c, (WHATSON_CATEGORY_BY_KEY[c] || { label: c }).label));
  const any = regionTags.length + categoryTags.length > 0;
  return `<div class="outdoor-selected" id="whatsOnSelected"${any ? '' : ' hidden'}>${row('Regions', regionTags)}${row('Categories', categoryTags)}${any ? '<button type="button" class="outdoor-selected-clear" id="whatsOnSelectedClear">Clear all</button>' : ''}</div>`;
}
function whatsOnSummaryText(shown, total, filtered) {
  const noun = total === 1 ? 'event' : 'events';
  return filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
}
// Page-scoped styles only (body.whatson-page): the What's On card rules
// derived from the Golf card rules exactly as Beach/Outdoor derive theirs,
// a four-across desktop grid for the twelve tiles, and the event card's
// image/meta details. Nothing here touches other pages.
// The derived card rules are then narrowed to selectors that actually carry
// the What's On attribute: the Golf source groups some card rules with the
// venue-page CTA row (`body.golf-page .venue-cta-row …`), and this page has
// no CTA row, so those grouped selectors are dropped rather than re-emitted.
function whatsOnOnlySelectors(cssText) {
  const noComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  return noComments.replace(/([^{}]+)\{([^{}]*)\}/g, (m, selectors, body) => {
    const kept = selectors.split(',').map((x) => x.trim()).filter((x) => x.includes('[data-venue-category="whatson"]'));
    return kept.length ? `\n  ${kept.join(', ')} {${body}}` : '';
  }).replace(/\n\s*\n/g, '\n');
}
function renderWhatsOnStyles() {
  const themeCss = renderGolfThemeStyles().replace(/^<style>|<\/style>$/g, '');
  return `<style>
  /* What's On page (2026-09-22): the Golf card rules re-keyed to the What's On card attribute. */
  ${whatsOnOnlySelectors(deriveBeachRulesFromGolfCss(SEO_PAGE_CSS, 'whatson'))}
  ${whatsOnOnlySelectors(deriveBeachRulesFromGolfCss(themeCss, 'whatson'))}
  /* Twelve category tiles: 2 across on phones (inherited), 3 from 600px (inherited), 4 across from 900px. */
  @media (min-width: 900px) { body.whatson-page .whatson-category-grid { grid-template-columns: repeat(4, 1fr); max-width: none; } }
  body.whatson-page .whatson-category-card-noart .outdoor-activity-card-overlay { background: linear-gradient(180deg, rgba(27,43,58,0.15) 0%, rgba(20,14,10,0.82) 100%); }
  body.whatson-page .whatson-event-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; margin: 0 0 12px; display: block; }
  body.whatson-page .whatson-category-chip { background: rgba(42,107,103,0.1); color: var(--teal-deep, #1E4F4C); }
  body.whatson-page #whatsOnResults .golf-desc.is-clamped p { -webkit-line-clamp: 3; max-height: calc(3 * 1.45em); }
  body.whatson-page #whatsOnResults > .venue-card[hidden] { display: none; }
  body.whatson-page .whatson-empty { background: var(--paper); border: 1px solid rgba(74,52,40,0.10); border-radius: 12px; padding: 18px 20px; margin: 0 0 26px; max-width: 68ch; }
  body.whatson-page .whatson-empty h3 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.15rem; margin: 0 0 6px; color: var(--ink); }
  body.whatson-page .whatson-empty p { margin: 0; color: var(--ink); opacity: 0.8; line-height: 1.55; }
  body.whatson-page .whatson-empty a { color: var(--ref-navy); font-weight: 700; }
  /* Step 6: the "When are you visiting?" step -- preset chips reuse the region-chip rules; the custom-range form and the "Showing" line are page-scoped. */
  body.whatson-page a.whatson-date-chip { text-decoration: none; }
  body.whatson-page .whatson-custom-dates { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 12px 0 4px; }
  body.whatson-page .whatson-custom-dates[hidden] { display: none; }
  body.whatson-page .whatson-custom-dates label { display: flex; flex-direction: column; gap: 4px; font-family: 'Nunito', sans-serif; font-size: 0.85rem; font-weight: 800; color: var(--ink); }
  body.whatson-page .whatson-custom-dates input[type="date"] { font: inherit; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(27,43,58,0.18); background: var(--paper); color: var(--ink); min-height: 40px; }
  body.whatson-page .whatson-custom-dates .cta.whatson-custom-go { margin: 0; }
  body.whatson-page .whatson-date-showing { margin: 10px 0 0; font-family: 'Nunito', sans-serif; font-size: 0.9rem; color: var(--ink); opacity: 0.8; }
  body.whatson-page .whatson-date-note { margin: 6px 0 0; font-family: 'Nunito', sans-serif; font-size: 0.9rem; color: var(--plum, #6B2C40); font-weight: 700; }

  /* ---- Simplified filter surface (2026-09-24) -----------------------------
     Compact search + one horizontal category chip row + Regions/Date
     popovers, replacing the twelve image tiles and four accordions that used
     to sit above the results. All page-scoped to body.whatson-page; nothing
     here can reach the homepage or any other page. Colours, radii and the
     Nunito/weight conventions are the existing design system's. */
  body.whatson-page .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  body.whatson-page .whatson-intro { margin-bottom: 14px; }

  body.whatson-page .whatson-search { position: relative; margin: 0 0 12px; max-width: 520px; }
  body.whatson-page .whatson-search-input { width: 100%; box-sizing: border-box; font: inherit; font-family: 'Nunito', sans-serif; font-size: 0.95rem; padding: 10px 36px 10px 14px; min-height: 42px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.18); background: var(--paper); color: var(--ink); }
  body.whatson-page .whatson-search-input::placeholder { color: rgba(42,32,25,0.55); }
  /* The page draws its own clear button, so suppress the browser's native one. */
  body.whatson-page .whatson-search-input::-webkit-search-cancel-button, body.whatson-page .whatson-search-input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
  body.whatson-page .whatson-search-input:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.whatson-page .whatson-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; cursor: pointer; font-size: 1.2rem; line-height: 1; color: var(--ink); opacity: 0.6; padding: 6px 8px; }
  body.whatson-page .whatson-search-clear[hidden] { display: none; }

  body.whatson-page .whatson-cat-row { display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding: 2px 0 8px; margin: 0 0 10px; }
  body.whatson-page .whatson-cat-row::-webkit-scrollbar { height: 6px; }
  body.whatson-page .whatson-cat-row::-webkit-scrollbar-thumb { background: rgba(74,52,40,0.2); border-radius: 999px; }
  body.whatson-page .whatson-cat-chip { flex: 0 0 auto; white-space: nowrap; }
  @media (min-width: 900px) { body.whatson-page .whatson-cat-row { flex-wrap: wrap; overflow: visible; } }

  body.whatson-page .whatson-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  body.whatson-page .whatson-pop { position: relative; }
  body.whatson-page .whatson-pop-btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ink); background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 999px; padding: 8px 14px; min-height: 40px; cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; }
  body.whatson-page .whatson-pop-btn:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.whatson-page .whatson-pop-btn[aria-expanded="true"] { background: var(--ref-navy, #1B2B3A); color: var(--paper); border-color: var(--ref-navy, #1B2B3A); }
  body.whatson-page .whatson-pop-count[hidden] { display: none; }
  body.whatson-page .whatson-pop-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; min-width: 280px; max-width: min(92vw, 560px); max-height: 60vh; overflow-y: auto; background: var(--paper); border: 1px solid rgba(27,43,58,0.18); border-radius: 14px; box-shadow: 0 18px 40px -20px var(--shadow, rgba(42,32,25,0.5)); padding: 14px; }
  body.whatson-page .whatson-pop-panel[hidden] { display: none; }
  /* On phones the panel becomes a full-width sheet under the controls rather than a cramped popover. */
  @media (max-width: 640px) {
    body.whatson-page .whatson-controls { position: relative; }
    body.whatson-page .whatson-pop { position: static; }
    body.whatson-page .whatson-pop-panel { left: 0; right: 0; width: auto; min-width: 0; max-width: none; }
  }
  body.whatson-page .whatson-pop-panel .outdoor-step { margin: 0; }
  body.whatson-page .whatson-date-compact { margin: 0; }

  /* "Show results" (2026-09-24): selecting the last filter in a popover used
     to leave the visitor having to click somewhere outside it to get back to
     the list. Filtering is already live, so this is an explicit dismiss +
     confirmation affordance -- the primary action in the panel, in the
     homepage's navy/gold system, with the live count as its label. */
  body.whatson-page .whatson-pop-actions { position: sticky; bottom: -14px; margin: 12px -14px -14px; padding: 10px 14px; background: var(--paper); border-top: 1px solid rgba(27,43,58,0.12); border-radius: 0 0 14px 14px; }
  body.whatson-page .whatson-pop-apply { display: block; width: 100%; font-family: 'Nunito', sans-serif; font-size: 0.86rem; font-weight: 800; color: var(--ref-cream); background: var(--ref-navy); border: 1px solid var(--ref-gold); border-radius: 999px; padding: 10px 16px; min-height: 44px; cursor: pointer; transition: background .12s ease; }
  body.whatson-page .whatson-pop-apply:hover { background: var(--ref-navy-deep); }
  body.whatson-page .whatson-pop-apply:focus-visible { outline: 2px solid var(--ref-gold); outline-offset: 2px; }
  body.whatson-page .whatson-resultbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 6px; }
  body.whatson-page .whatson-count { margin: 0; font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 800; color: var(--ink); }
  body.whatson-page .whatson-results-step { margin-top: 4px; }
</style>`;
}
// The inline script: the Outdoors filter behaviour with the activity group
// renamed to categories and the URL keys ?regions=&categories=. Reuses the
// shared client snippets verbatim (region-group open/close, OR/AND
// predicate). Works with zero result cards so the chips, statuses, tags,
// URL state and Back/Forward all behave before any inventory exists.
function renderWhatsOnFilterScriptHtml(state = {}) {
  const labels = { regions: { ...REGION_LABELS }, categories: Object.fromEntries(WHATSON_CATEGORIES.map((c) => [c.key, c.label])) };
  // Step 6: INVENTORY = whether any publishable inventory exists (drives the
  // empty-inventory vs no-match states); DATE = the server-resolved date
  // parameters, carried on every pushState so a chip click never drops the
  // chosen window. Both default to the shell-phase values.
  const inventory = state.hasInventory === true;
  const dateState = state.dateState || { when: '', from: '', to: '' };
  return `<script>
(function(){
  var LABELS = ${JSON.stringify(labels).replace(/</g, '\\u003c')};
  var INVENTORY = ${inventory ? 'true' : 'false'};
  var DATE = ${JSON.stringify(dateState).replace(/</g, '\\u003c')};
  var chips = Array.prototype.slice.call(document.querySelectorAll('.outdoor-filter-chip, .outdoor-activity-toggle')).filter(function(c){ return !c.hasAttribute('data-when') && !c.hasAttribute('data-category-all'); });
  var allChip = document.querySelector('[data-category-all]');
  var searchInput = document.getElementById('whatsOnSearch');
  var searchClear = document.getElementById('whatsOnSearchClear');
  var regionsCount = document.getElementById('whatsOnRegionsCount');
  var searchTerm = '';
  var cards = Array.prototype.slice.call(document.querySelectorAll('#whatsOnResults > .venue-card'));
  var summary = document.getElementById('whatsOnResultsSummary');
  var showBtn = document.getElementById('whatsOnShowResults');
  var clearBtn = document.getElementById('whatsOnClearFilters');
  var empty = document.getElementById('whatsOnNoResults');
  var emptyInventory = document.getElementById('whatsOnEmptyInventory');
  var results = document.getElementById('whatsOnResults');
  var selectedBox = document.getElementById('whatsOnSelected');
  var regionStatus = document.getElementById('whatsOnRegionStatus');
  if (!chips.length) return;
  ${OUTDOOR_FILTER_CLIENT_PREDICATE_SRC}
  ${OUTDOOR_REGION_GROUP_CLIENT_SRC}
  function summaryText(shown, total, filtered){ var noun = total === 1 ? 'event' : 'events'; return filtered ? (shown + ' of ' + total + ' ' + noun) : (total + ' ' + noun); }
  var groupsRoot = document.querySelector('.outdoor-region-groups');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.outdoor-region-group-block'));
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  function setGroupOpen(block, open){ var t = block.querySelector('.outdoor-region-group-toggle'), l = block.querySelector('.outdoor-region-group-chips'); if (!t || !l) return; t.setAttribute('aria-expanded', open ? 'true' : 'false'); l.hidden = !open; }
  function updateGroupHeaders(){
    groups.forEach(function(block){
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      var sel = block.querySelector('.outdoor-region-group-selected');
      if (sel) { sel.textContent = groupSelectedText(n); sel.hidden = n === 0; }
      block.classList.toggle('has-selection', n > 0);
    });
  }
  if (groupsRoot) groupsRoot.classList.add('js');
  groups.forEach(function(block){ var t = block.querySelector('.outdoor-region-group-toggle'); if (t) t.addEventListener('click', function(){ setGroupOpen(block, t.getAttribute('aria-expanded') !== 'true'); }); });
  function selected(kind){ return chips.filter(function(c){ return c.getAttribute('data-' + kind) && c.getAttribute('aria-pressed') === 'true'; }).map(function(c){ return c.getAttribute('data-' + kind); }); }
  function cardData(card){ return { region: card.getAttribute('data-event-region'), cats: (card.getAttribute('data-event-categories') || '').split(',').filter(Boolean), valley: card.getAttribute('data-event-valley-wide') === '1' }; }
  // Searchable text, built once per card: event name, region label, category
  // labels and the meta/description already in the markup. No new data.
  cards.forEach(function(card){
    var d = cardData(card);
    var meta = card.querySelector('.venue-meta'), desc = card.querySelector('.golf-desc');
    var parts = [card.getAttribute('data-venue-name') || '', LABELS.regions[d.region] || '',
                 d.cats.map(function(k){ return LABELS.categories[k] || k; }).join(' '),
                 meta ? meta.textContent : '', desc ? desc.textContent : ''];
    card.__wo = parts.join(' ').toLowerCase();
  });
  function cardMatchesSearch(card){ return !searchTerm || (card.__wo || '').indexOf(searchTerm) !== -1; }
  function cardMatches(d, regions, categories){ return matches(d.valley ? [] : regions, categories, d.region, d.cats); }
  var allRegionKeys = Object.keys(LABELS.regions);
  function updateChipCounts(regions, categories){
    var regionCounts = {}, categoryCounts = {};
    cards.forEach(function(card){
      var d = cardData(card);
      if (cardMatches(d, [], categories)) { (d.valley ? allRegionKeys : [d.region]).forEach(function(r){ regionCounts[r] = (regionCounts[r] || 0) + 1; }); }
      if (cardMatches(d, regions, [])) d.cats.forEach(function(c){ categoryCounts[c] = (categoryCounts[c] || 0) + 1; });
    });
    chips.forEach(function(c){
      var r = c.getAttribute('data-region'), k = c.getAttribute('data-category'), n = c.querySelector('.outdoor-activity-count');
      if (!n) return;
      var count = r ? (regionCounts[r] || 0) : (categoryCounts[k] || 0);
      n.textContent = String(count);
      var noun = c.querySelector('.outdoor-activity-count-noun'); if (noun) noun.textContent = count === 1 ? 'event' : 'events';
    });
  }
  function updateStepStatus(el, n){ if (!el) return; el.textContent = n ? (n + ' selected') : ''; el.hidden = n === 0; }
  function renderSelected(regions, categories){
    if (!selectedBox) return;
    var any = regions.length || categories.length;
    function tag(kind, v, label){ return '<button type="button" class="outdoor-selected-tag" data-remove-' + kind + '="' + v + '" aria-label="Remove ' + label + '">' + label + '<span class="outdoor-selected-x" aria-hidden="true">\\u00d7</span></button>'; }
    function row(label, tags){ return tags.length ? '<div class="outdoor-selected-row"><span class="outdoor-selected-label">' + label + '</span> ' + tags.join(' ') + '</div>' : ''; }
    var html = row('Regions', regions.map(function(r){ return tag('region', r, LABELS.regions[r] || r); }))
      + row('Categories', categories.map(function(k){ return tag('category', k, LABELS.categories[k] || k); }));
    if (any) html += '<button type="button" class="outdoor-selected-clear" id="whatsOnSelectedClear">Clear all</button>';
    selectedBox.innerHTML = html; selectedBox.hidden = !any;
  }
  function queryFor(regions, categories, date){
    var d = date || DATE, q = [];
    if (d.when) q.push('when=' + encodeURIComponent(d.when));
    if (d.when === 'custom') { if (d.from) q.push('from=' + encodeURIComponent(d.from)); if (d.to) q.push('to=' + encodeURIComponent(d.to)); }
    if (regions.length) q.push('regions=' + regions.join(','));
    if (categories.length) q.push('categories=' + categories.join(','));
    return q.length ? '?' + q.join('&') : '';
  }
  function dateParamsOf(search){ var p = new URLSearchParams(search); return { when: p.get('when') || '', from: p.get('from') || '', to: p.get('to') || '' }; }
  function apply(historyMode){
    var regions = selected('region'), categories = selected('category');
    var shown = 0;
    cards.forEach(function(card){ var d = cardData(card); var ok = cardMatches(d, regions, categories) && cardMatchesSearch(card); card.hidden = !ok; if (ok) shown++; });
    var total = cards.length, filtered = regions.length || categories.length || !!searchTerm;
    // "All" is pressed exactly when no category is chosen.
    if (allChip) allChip.setAttribute('aria-pressed', categories.length ? 'false' : 'true');
    if (regionsCount) { regionsCount.textContent = regions.length ? (' \u00b7 ' + regions.length) : ''; regionsCount.hidden = regions.length === 0; }
    if (searchClear) searchClear.hidden = !searchTerm;
    if (summary) summary.textContent = summaryText(shown, total, filtered);
    applyBtns.forEach(function(b){ b.textContent = 'Show ' + shown + ' result' + (shown === 1 ? '' : 's'); });
    updateGroupHeaders(); updateChipCounts(regions, categories);
    updateStepStatus(regionStatus, regions.length);
    renderSelected(regions, categories);
    if (showBtn) { showBtn.textContent = filtered ? ('Show ' + shown + ' result' + (shown === 1 ? '' : 's')) : 'Show all results'; showBtn.hidden = !INVENTORY; }
    if (clearBtn) clearBtn.hidden = !filtered;
    if (emptyInventory) emptyInventory.hidden = INVENTORY;
    if (empty) empty.hidden = !(INVENTORY && shown === 0);
    // Date links carry the live region/category selection to the server.
    Array.prototype.forEach.call(document.querySelectorAll('a[data-when]'), function(a){ a.setAttribute('href', window.location.pathname + queryFor(regions, categories, { when: a.getAttribute('data-when') })); });
    if (results) results.hidden = shown === 0;
    var next = window.location.pathname + queryFor(regions, categories) + window.location.hash;
    if (window.history && historyMode !== 'none') {
      if (historyMode === 'push' && window.history.pushState && next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState({ whatson: true }, '', next);
      else if (window.history.replaceState) window.history.replaceState({ whatson: true }, '', next);
    }
  }
  function setPressed(kind, value, on){ chips.forEach(function(c){ if (c.getAttribute('data-' + kind) === value) c.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  chips.forEach(function(chip){ chip.addEventListener('click', function(){ chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply('push'); }); });
  function clearAll(){ chips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); searchTerm = ''; if (searchInput) searchInput.value = ''; apply('push'); }
  if (allChip) allChip.addEventListener('click', function(){
    chips.forEach(function(c){ if (c.getAttribute('data-category')) c.setAttribute('aria-pressed', 'false'); });
    apply('push');
  });
  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener('input', function(){
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function(){ searchTerm = searchInput.value.trim().toLowerCase(); apply('none'); }, 120);
    });
  }
  if (searchClear) searchClear.addEventListener('click', function(){ searchTerm = ''; if (searchInput) { searchInput.value = ''; searchInput.focus(); } apply('none'); });
  var applyBtns = Array.prototype.slice.call(document.querySelectorAll('[data-whatson-apply]'));
  var pops = Array.prototype.slice.call(document.querySelectorAll('.whatson-pop'));
  function closePops(except){
    pops.forEach(function(pop){
      if (pop === except) return;
      var b = pop.querySelector('.whatson-pop-btn'), pnl = pop.querySelector('.whatson-pop-panel');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (pnl) pnl.hidden = true;
      pop.classList.remove('is-open');
    });
  }
  pops.forEach(function(pop){
    var b = pop.querySelector('.whatson-pop-btn'), pnl = pop.querySelector('.whatson-pop-panel');
    if (!b || !pnl) return;
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') === 'true';
      closePops(pop);
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      pnl.hidden = open;
      pop.classList.toggle('is-open', !open);
    });
    pnl.addEventListener('click', function(e){ e.stopPropagation(); });
  });
  // "Show results": filtering is already live, so this closes the panel and
  // hands the visitor back to the list. Every other selection is preserved.
  applyBtns.forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); closePops(null); }); });
  if (pops.length) {
    document.addEventListener('click', function(){ closePops(null); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePops(null); });
  }
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  var emptyClear = document.getElementById('whatsOnNoResultsClear');
  if (emptyClear) emptyClear.addEventListener('click', function(e){ e.preventDefault(); clearAll(); });
  if (selectedBox) selectedBox.addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.id === 'whatsOnSelectedClear') { clearAll(); return; }
    var r = t.getAttribute('data-remove-region'), k = t.getAttribute('data-remove-category');
    if (r) { setPressed('region', r, false); apply('push'); }
    else if (k) { setPressed('category', k, false); apply('push'); }
  });
  if (showBtn) showBtn.addEventListener('click', function(){ var t = document.getElementById('whatsOnResultsTop'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  function readUrlIntoChips(){
    try {
      var params = new URLSearchParams(window.location.search);
      var pre = { region: (params.get('regions') || '').split(',').filter(Boolean), category: (params.get('categories') || '').split(',').filter(Boolean) };
      chips.forEach(function(c){ ['region', 'category'].forEach(function(k){ var v = c.getAttribute('data-' + k); if (v) c.setAttribute('aria-pressed', pre[k].indexOf(v) !== -1 ? 'true' : 'false'); }); });
    } catch (e) {}
  }
  function openGroupsForSelection(){
    groups.forEach(function(block){
      var isDefault = block.getAttribute('data-region-group') === '${OUTDOOR_REGION_GROUP_DEFAULT_OPEN}';
      var n = block.querySelectorAll('.outdoor-filter-chip[aria-pressed="true"]').length;
      setGroupOpen(block, (mobileQuery && mobileQuery.matches) ? groupShouldOpen(isDefault, n) : true);
    });
  }
  // Back/Forward: region/category state is re-read from the URL as before; a
  // change to the date parameters means a different server-selected window,
  // so the page reloads to render it.
  window.addEventListener('popstate', function(){
    var d = dateParamsOf(window.location.search);
    if (d.when !== DATE.when || d.from !== DATE.from || d.to !== DATE.to) { window.location.reload(); return; }
    readUrlIntoChips(); openGroupsForSelection(); apply('none');
  });
  var customToggle = document.getElementById('whatsOnCustomToggle'), customForm = document.getElementById('whatsOnCustomDates');
  if (customToggle && customForm) {
    customToggle.addEventListener('click', function(){ var open = customForm.hidden; customForm.hidden = !open; customToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) { var f = document.getElementById('whatsOnFrom'); if (f && f.focus) f.focus(); } });
    customForm.addEventListener('submit', function(e){
      e.preventDefault();
      var f = document.getElementById('whatsOnFrom'), t = document.getElementById('whatsOnTo');
      window.location.assign(window.location.pathname + queryFor(selected('region'), selected('category'), { when: 'custom', from: f ? f.value : '', to: t ? t.value : '' }));
    });
  }
  readUrlIntoChips(); openGroupsForSelection(); apply('replace');
  // Description clamp / Read more for event cards (same behaviour as the themed venue cards).
  var MORE = 'Read more \\u2192', LESS = 'Read less \\u2191';
  cards.forEach(function(card){
    var desc = card.querySelector('.golf-desc'), btn = card.querySelector('.desc-toggle'); if (!desc || !btn) return;
    var p = desc.querySelector('p'); if (!p) return;
    desc.classList.add('is-clamped'); btn.hidden = !(p.scrollHeight > p.clientHeight + 1);
    btn.addEventListener('click', function(){ var expanded = btn.getAttribute('aria-expanded') === 'true'; desc.classList.toggle('is-clamped', expanded); btn.setAttribute('aria-expanded', expanded ? 'false' : 'true'); btn.textContent = expanded ? MORE : LESS; });
  });
})();
</script>`;
}
// GET /whats-on -- the page. `filter` is parseWhatsOnFilterQuery(query).
function renderWhatsOnPage(filter = null) {
  const selectedRegions = filter ? filter.regions : [];
  const selectedCategories = filter ? filter.categories : [];
  // Step 6: the date window is resolved server-side from ?when= / ?from=&to=
  // (default: the rolling next 30 days) and selects the events rendered;
  // region/category chips then filter that set exactly as before.
  const window = resolveWhatsOnWindow(filter || {});
  const events = getWhatsOnEvents(window);
  const matching = filterWhatsOnEvents(events, selectedRegions, selectedCategories);
  const filtered = selectedRegions.length > 0 || selectedCategories.length > 0;
  const hasInventory = whatsOnInventoryExists();
  const counts = hasInventory ? {
    regions: Object.fromEntries(Object.keys(REGION_LABELS).map((r) => [r, filterWhatsOnEvents(events, [], selectedCategories).filter((e) => e.valleyWide || e.region === r).length])),
    categories: Object.fromEntries(WHATSON_CATEGORIES.map((c) => [c.key, filterWhatsOnEvents(events, selectedRegions, []).filter((e) => (e.categories || []).includes(c.key)).length])),
  } : null;
  const dateState = { when: window.preset === 'upcoming' ? '' : (window.preset === 'custom' ? 'custom' : window.preset), from: window.preset === 'custom' ? window.from : '', to: window.preset === 'custom' ? window.to : '' };
  const heading = "What's On in the Okanagan";
  const title = `${heading} | Okanagan Roam`;
  const description = 'Discover what is happening across the Okanagan Valley: festivals, live music, markets, wine events, family days and more, by community and by category.';
  const canonical = 'https://okanaganroam.com/whats-on';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: "What's On", url: canonical },
  ]);
  // Step 6: every event in the window is rendered (non-matching cards start
  // hidden) so a shared pre-filtered URL can still reveal the rest when a
  // chip is unselected -- the client script only shows/hides cards.
  const matchingIds = new Set(matching.map((e) => e.id));
  const cardsHtml = events.length
    ? `<ul class="card-grid" id="whatsOnResults"${matching.length ? '' : ' hidden'}>${events.map((e) => (matchingIds.has(e.id) ? whatsOnEventCardHtml(e) : whatsOnEventCardHtml(e).replace('<li class="venue-card whatson-event-card"', '<li class="venue-card whatson-event-card" hidden'))).join('')}
  </ul>`
    : `<ul class="card-grid" id="whatsOnResults" hidden></ul>`;
  // Body classes: `golf-page` is the site's themed category-page namespace
  // (Golf, Beaches and Outdoors all carry it -- see themedBodyClassAttr): it
  // scopes the homepage header/nav/button system, h1, breadcrumb, card grid,
  // venue card and teal-marker heading rules. `outdoor-page` scopes the
  // explorer interaction components this page mirrors (region chips, image
  // tile toggles, step headings, selected-filter rows). Neither class is
  // Golf- or Outdoors-specific styling copied for convenience; both are the
  // shared rule sets, reused unchanged. `whatson-page` is the primary
  // namespace for everything specific to this page (renderWhatsOnStyles).
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb], { golfTheme: true, outdoorTheme: true, noindex: !hasInventory })}
${renderWhatsOnStyles()}
${renderAnalyticsHeadHtml()}
</head>
<body class="golf-page outdoor-page whatson-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: "What's On" },
  ])}
  <h1>${escapeHtml(heading)}</h1>
  <p class="outdoor-intro whatson-intro">Festivals on the lakeshore, live music in the vineyards, farmers’ markets, hockey nights and holiday lights — there is always something happening somewhere in the valley.</p>
  ${whatsOnSearchHtml()}
  ${whatsOnCategoryChipsHtml({ selectedCategories, counts: counts ? counts.categories : null })}
  ${whatsOnFilterBarHtml({ selectedRegions, counts: counts ? counts.regions : null, window, hasInventory })}
  <span class="visually-hidden" id="whatsOnRegionStatus"${selectedRegions.length ? '' : ' hidden'}>${selectedRegions.length ? `${selectedRegions.length} selected` : ''}</span>
  <section class="outdoor-step outdoor-step-results whatson-results-step" aria-labelledby="whatsOnResultsTop">
  <h2 class="visually-hidden" id="whatsOnResultsTop">Results</h2>
  ${whatsOnResultBarHtml(matching.length, events.length, filtered, selectedRegions, selectedCategories)}
  <div class="whatson-empty" id="whatsOnEmptyInventory"${hasInventory ? ' hidden' : ''}>
    <h3>We’re gathering what’s on.</h3>
    <p>Okanagan Roam is building its What’s On listings community by community. Your region and category choices are saved in the address bar, so this page is ready the moment the first events arrive — in the meantime, <a href="/outdoors">explore the outdoors</a> or <a href="/trip">start planning a trip</a>.</p>
  </div>
  <p class="outdoor-no-results" id="whatsOnNoResults"${hasInventory && matching.length === 0 ? '' : ' hidden'}>No events match that combination yet. <a href="/whats-on" id="whatsOnNoResultsClear">Clear the filters</a> to see everything that is on.</p>
  ${cardsHtml}
  </section>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
  ${renderWhatsOnFilterScriptHtml({ hasInventory, dateState })}
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
    sameAs: normalizeWebsiteUrl(venue.website) || undefined,
    // Golf (2026-09-26): the legacy price level is not a green fee, so it is
    // never shown on golf pages; verified green fees are shown instead.
    priceRange: (venue.price && venue.type !== 'golf') ? '$'.repeat(venue.price) : undefined,
    servesCuisine: venue.type === 'restaurant' && venue.cuisine ? venue.cuisine : undefined,
    aggregateRating: (venue.rating && venue.reviews) ? {
      '@type': 'AggregateRating',
      ratingValue: venue.rating,
      reviewCount: venue.reviews,
    } : undefined,
    openingHoursSpecification: buildOpeningHoursSpecification(venue.hours),
  };

  const attributeChips = badgeChipsHtml(venue);
  const isHiddenGem = !venue.redirect_to && isVenueHiddenGem(venue.id);
  const isLocalFavourite = !venue.redirect_to && getCollectionVenueIds('local_favorite').has(venue.id);
  const dogFriendlyNote = venue.redirect_to ? undefined : getDogFriendlyNotes().get(venue.id);
  const hiddenGemChip = (isHiddenGem ? hiddenGemBadgeHtml() + ' ' : '') + (isLocalFavourite ? localFavouriteBadgeHtml() + ' ' : '') + (dogFriendlyNote !== undefined ? dogFriendlyBadgeHtml(dogFriendlyNote) + ' ' : '');

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

  // Golf-only (2026-09-19): outbound links carry a data-track kind so the
  // venue-page engagement script can report them; every other category's
  // markup is unchanged.
  const trackAttr = (kind) => (usesThemedCategoryLayout(venue.type) ? ` data-track="${kind}"` : '');

  // Golf pages label simulator venues "Indoor Golf" (hero eyebrow, meta
  // line and the Good to Know Type row), using the same isIndoorGolfVenue()
  // split the /golf directory already uses; the JSON-LD @type stays
  // GolfCourse and every other category keeps label.singular.
  const golfDetail = venue.type === 'golf' ? golfDetailsFor([venue]).get(`${venue.region}/${venue.slug}`) : undefined;
  const golfKindLabel = (venue.type === 'golf' && isIndoorGolfVenue(venue)) ? 'Indoor Golf'
    : (golfData && golfData.isPracticeFacility(golfDetail)) ? 'Driving Range & Practice' : label.singular;

  const detailRows = [
    ['Type', venue.type === 'golf' ? golfKindLabel : label.singular],
    ['Region', `<a href="/${venue.region}">${escapeHtml(regionLabel)}</a>`],
    venue.cuisine ? ['Cuisine', escapeHtml(venue.cuisine)] : null,
    venue.address ? ['Address', escapeHtml(venue.address)] : null,
    venue.phone ? ['Phone', `<a href="tel:${escapeHtml(venue.phone)}"${trackAttr('phone')}>${escapeHtml(venue.phone)}</a>`] : null,
    venue.website ? ['Website', `<a href="${escapeHtml(normalizeWebsiteUrl(venue.website))}" rel="nofollow noopener" target="_blank"${trackAttr('website')}>${escapeHtml(venue.website)}</a>`] : null,
    (venue.price && venue.type !== 'golf') ? ['Price', '$'.repeat(venue.price)] : null,
    (venue.rating && venue.reviews) ? ['Rating', `${venue.rating}\u2605 (${venue.reviews} reviews)`] : (venue.rating ? ['Rating', `${venue.rating}\u2605`] : null),
  ].filter(Boolean)
    .map(([lbl, val]) => `<div class="detail-row"><span class="label">${escapeHtml(lbl)}</span><span>${val}</span></div>`)
    .join('\n');

  // Themed venue pages (golf 2026-09-20, beach same day for consistency):
  // the hero is the page's one title treatment, so its name is the <h1>
  // and the header below no longer repeats it. No golf or beach venue has
  // an image_url today; if one ever does, the photo hero renders and the
  // <h1> falls back into the header.
  const themedHeroTitle = usesThemedCategoryLayout(venue.type) && !venue.image_url;
  const imageHtml = venue.image_url
    ? `<div class="venue-hero venue-hero-photo"><img src="${escapeHtml(venue.image_url)}" alt="${escapeHtml(venue.name)}" loading="lazy"></div>`
    : themedHeroTitle
      ? `<div class="venue-hero venue-hero-fallback venue-hero-${venue.type}">
        <span class="venue-hero-type">${escapeHtml(golfKindLabel)}</span>
        <h1>${escapeHtml(venue.name)}</h1>
      </div>`
      : `<div class="venue-hero venue-hero-fallback venue-hero-${venue.type}">
        <span class="venue-hero-type">${escapeHtml(label.singular)}</span>
        <span class="venue-hero-name">${escapeHtml(venue.name)}</span>
      </div>`;

  // At-a-glance summary strip — purely additive: every value shown here
  // already exists in `detailRows` below too. Nothing is removed from the
  // page by adding this; it's a second, higher-visibility presentation of
  // facts that were previously only available further down the page.
  const atAGlanceParts = [
    venue.type === 'golf' ? golfKindLabel : label.singular,
    `<a href="/${venue.region}">${escapeHtml(regionLabel)}</a>`,
    (venue.price && venue.type !== 'golf') ? '$'.repeat(venue.price) : null,
    venue.rating ? `${venue.rating}\u2605${venue.reviews ? ` (${venue.reviews})` : ''}` : null,
  ].filter(Boolean).join(' &middot; ');

  // Location section — static-map only, per Sprint 2 scope: a plain link
  // built from existing latitude/longitude (no map library, no new script,
  // no new dependency). Falls back to showing the existing address text
  // alone when coordinates are absent; renders nothing when neither exists.
  const mapsUrl = (venue.latitude && venue.longitude)
    ? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`
    : (venue.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}` : null);
  const locationHtml = (venue.address || mapsUrl)
    ? `<div class="venue-section venue-location">
        <h2>Location</h2>
        ${venue.address ? `<p class="venue-address">${escapeHtml(venue.address)}</p>` : ''}
        ${mapsUrl ? `<a class="map-link" href="${mapsUrl}" rel="nofollow noopener" target="_blank"${trackAttr('directions')}>View on map \u2197</a>` : ''}
      </div>`
    : '';

  // CTA buttons — only ever rendered when the underlying data already
  // exists; nothing here fabricates a website, phone number, or address.
  const ctaButtons = [
    venue.website ? `<a class="cta" href="${escapeHtml(normalizeWebsiteUrl(venue.website))}" rel="nofollow noopener" target="_blank"${trackAttr('website')}>Visit Website</a>` : null,
    mapsUrl ? `<a class="cta secondary" href="${mapsUrl}" rel="nofollow noopener" target="_blank"${trackAttr('directions')}>Get Directions</a>` : null,
    venue.phone ? `<a class="cta secondary" href="tel:${escapeHtml(venue.phone)}"${trackAttr('phone')}>Call</a>` : null,
    // Golf-only: Favorite + Add to Trip sit with the contact actions on
    // the venue page (they were moved off the listing card).
    usesEngagementControls(venue.type) ? golfFavTripButtonsHtml(venue) : null,
  ].filter(Boolean).join('\n  ');
  const ctaRowAttrs = usesEngagementControls(venue.type)
    ? ` data-venue-id="${venue.id}" data-venue-region="${escapeHtml(venue.region)}" data-venue-category="${escapeHtml(venue.type)}" data-venue-name="${escapeHtml(venue.name)}" data-surface="venue_page"`
    : '';
  // Temporary condition (advisory collection), rendered between the
  // description and the CTA row; '' for the overwhelming majority of
  // venues, which keeps their page markup byte-identical.
  const venueAdvisoryNote = venue.redirect_to ? undefined : getAdvisoryNotes().get(venue.id);
  const venueAdvisoryHtml = venueAdvisoryNote !== undefined ? `\n  ${advisoryNoticeHtml(venueAdvisoryNote)}` : '';
  // Golf-only "At a glance" card ('' for every other category, and for a
  // golf venue with no curated facts, so their markup is unchanged).
  const golfGlanceHtml = golfAtAGlanceHtml(venue);
  // Golf data (2026-09-26): link to the club's own course map/scorecard page
  // and the verified green fees ('' when there is no data for this course).
  const golfMapHtml = golfData && golfDetail ? golfData.golfCourseMapHtml(golfDetail) : '';
  const golfFeesHtml = golfData && golfDetail ? golfData.golfFeesSectionHtml(golfDetail) : '';
  const golfValueHtml = golfData && golfDetail ? golfData.golfValueSectionHtml(golfDetail) : '';

  // One bulk lookup for all related+nearby cards together (reusing the
  // existing getHiddenGemVenueIds(), not a new query) -- O(1) Set lookups
  // per card below, not a per-card query, so this stays N+1-safe no
  // matter how many related/nearby venues render.
  const relatedNearbyHiddenGemIds = (relatedVenues.length || nearbyVenues.length) ? getHiddenGemVenueIds() : new Set();
  const relatedNearbyLocalFavouriteIds = (relatedVenues.length || nearbyVenues.length) ? getCollectionVenueIds('local_favorite') : new Set();

  function relatedCard(v) {
    const meta = [v.cuisine, v.rating ? `${v.rating}\u2605` : null].filter(Boolean).join(' \u00b7 ');
    const badge = ((relatedNearbyHiddenGemIds.has(v.id) && !v.redirect_to) ? hiddenGemBadgeHtml() : '')
      + ((relatedNearbyLocalFavouriteIds.has(v.id) && !v.redirect_to) ? (relatedNearbyHiddenGemIds.has(v.id) ? ' ' : '') + localFavouriteBadgeHtml() : '');
    return `<div class="related-card related-card-${v.type}">
      ${compactVisualBandHtml(v.type, { size: 'small' })}
      <a href="/${v.region}/${CATEGORY_SLUGS[v.type]}/${v.slug}">${escapeHtml(v.name)}</a>
      <div class="related-meta">${meta ? escapeHtml(meta) + ' ' : ''}${badge}</div>
    </div>`;
  }

  // H1 Step 3 (2026-09-22): a short "Events at {Venue}" block, built from the
  // same live predicate as the sitemap and the event/region blocks, so links
  // vanish by themselves as events expire. Linked strictly through
  // events.venue_id -- never by venue name -- and rendered only for a venue
  // hosting at least MIN_VENUE_EVENTS upcoming events. Direct canonical event
  // URLs only. Reuses the .related-section/.related-grid/.related-card styles
  // this page already loads, so no new CSS. Sits before the broader "other
  // {category} in {region}" and "more to explore" discovery sections.
  const venueEvents = listUpcomingEventsAtVenue(venue.id, { limit: 3 });
  const venueEventsHtml = venueEvents.length
    ? `<div class="related-section">
        <h2>Events at ${escapeHtml(venue.name)}</h2>
        <div class="related-grid">${venueEvents.map((e) => {
      const when = upcomingEventDateLabel(e.nextDate, e.nextEndDate);
      const cat = e.primaryCategory && WHATSON_CATEGORY_BY_KEY[e.primaryCategory] ? WHATSON_CATEGORY_BY_KEY[e.primaryCategory].label : '';
      const meta = [when, cat].filter(Boolean).map(escapeHtml).join(' &middot; ');
      return `<div class="related-card"><a href="/${e.region}/events/${e.slug}">${escapeHtml(e.name)}</a>${meta ? `<p class="related-meta">${meta}</p>` : ''}</div>`;
    }).join('')}</div>
      </div>`
    : '';

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

  // Back-link to the venue's regional category page (2026-09-19), only
  // for categories in ALL_REGIONS_CATEGORIES (currently golf) -- those
  // are the only categories with a full Okanagan-wide -> regional ->
  // venue navigation hierarchy worth surfacing here. Every other
  // category's venue page is unaffected. Built from the venue's own
  // region field, never hardcoded to any one venue/region.
  const venueBackLink = ALL_REGIONS_CATEGORIES.includes(venue.type)
    ? `<a class="category-back-link" href="/${venue.region}/${catSlug}">\u2190 ${escapeHtml(regionLabel)} ${escapeHtml(ALL_REGIONS_BACK_LABEL[venue.type] || label.plural)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, localBusiness], { golfTheme: usesThemedCategoryLayout(venue.type), beachTheme: venue.type === 'beach', outdoorTheme: venue.type === 'outdoor', advisoryStyles: venueAdvisoryNote !== undefined, golfDataStyles: !!golfDetail })}${usesThemedCategoryLayout(venue.type) ? '\n' + renderGolfVenuePolishStyles() : ''}${usesEngagementControls(venue.type) && !usesThemedCategoryLayout(venue.type) ? '\n' + renderEngagementControlStyles() : ''}
${golfEngagementHeadHtml(venue.type)}
</head>
<body${themedBodyClassAttr(venue.type)}>
  ${usesThemedCategoryLayout(venue.type) ? renderGolfTripTrayHtml() + '\n<div id="floatingTooltip"></div>\n' + renderGolfHeaderHtml() + '\n  <main class="wrap-wide golf-main">' : siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${venue.region}` },
    { name: label.plural, href: `/${venue.region}/${catSlug}` },
    { name: venue.name },
  ])}
  ${venueBackLink}
  ${imageHtml}
  <div class="venue-header">
    ${themedHeroTitle ? '' : `<h1>${escapeHtml(venue.name)}</h1>\n    `}<p class="venue-at-a-glance">${atAGlanceParts}</p>
    <p class="chips">${hiddenGemChip}${attributeChips}</p>
  </div>
  <p class="venue-description">${escapeHtml(venue.description || '')}</p>${venueAdvisoryHtml}
  ${ctaButtons ? `<div class="venue-cta-row"${ctaRowAttrs}>\n  ${ctaButtons}\n</div>` : ''}${golfMapHtml ? '\n  ' + golfMapHtml : ''}${golfGlanceHtml ? '\n  ' + golfGlanceHtml : ''}${golfFeesHtml ? '\n  ' + golfFeesHtml : ''}${golfValueHtml ? '\n  ' + golfValueHtml : ''}
  <div class="venue-section venue-key-info">
    <h2>Good to Know</h2>
    ${detailRows}
  </div>
  ${locationHtml}
  ${hoursHtml ? `<div class="venue-section venue-hours">${hoursHtml}</div>` : ''}
  ${guideLinks}
  ${venueEventsHtml ? `${venueEventsHtml}\n  ` : ''}${relatedHtml}
  ${nearbyHtml}
  <a class="cta secondary" href="/${venue.region}/${catSlug}">Back to ${escapeHtml(label.plural)} in ${escapeHtml(regionLabel)}</a>
  <a class="cta secondary" href="/${venue.region}">Explore all of ${escapeHtml(regionLabel)}</a>
  ${usesThemedCategoryLayout(venue.type) ? '</main>' : ''}
  ${renderHomeFooterHTML(true)}
  ${usesThemedCategoryLayout(venue.type) ? GOLF_APP_SCRIPT_TAG : ''}
  ${golfVenueEngagementScriptHtml(venue)}
</body>
</html>`;
}

// GET /:region/events/:slug — Phase 1 (Events architecture gate).
// Built entirely on the Sprint 1 shared foundation (pageHead/siteHeader/
// siteFooter/breadcrumbNavHtml) — no new presentation infrastructure.
// `hostVenue` is the optional linked venues row (already fetched by the
// route handler via the existing getVenue()), or null for a standalone
// event with no venue_id.
// Phase 2 Sprint 2 (Event Types): small, closed application-level taxonomy
// mapping to real schema.org Event subtypes — same discipline as
// SCHEMA_TYPE_MAP for venues. Any event with type = NULL, or any value not
// in this map, falls back to plain 'Event' — the exact JSON-LD this project
// already emitted before this sprint, so existing/untyped events are
// completely unaffected.
const EVENT_SCHEMA_TYPE_MAP = {
  sporting: 'SportsEvent',
  festival: 'Festival',
  concert: 'MusicEvent',
};

// ---------- What's On, Step 5 (2026-09-22): event detail page -------------
// The frozen detail page (design §L / "FINAL DESIGN DECISIONS" §9): built
// on the same pageHead/siteHeader/breadcrumb/footer foundation as before,
// now rendering the event's materialised occurrences (Step 3) in
// chronological order, its categories, venue (row or text), image, an
// attribution line for calendar-sourced rows, and Favorite / Add to Trip
// controls that use the exact localStorage contract the homepage, Golf
// and What's On cards share (HOLDER = [data-venue-category="whatson"]).
// Times and dates are the stored America/Vancouver civil values -- never
// computed from the process clock, never invented. Legacy rows with no
// occurrence rows (only the Phase 1 fixtures) fall back to their stored
// span text and get NO Event JSON-LD.
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function formatLocalDateLong(dateStr, { year = true, weekday = true } = {}) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const core = `${MONTH_LONG[m - 1]} ${d}${year ? `, ${y}` : ''}`;
  return weekday ? `${WEEKDAY_LONG[localWeekday(dateStr)]}, ${core}` : core;
}
// One occurrence -> { dateText, timeText } from stored values only.
function describeEventOccurrence(o) {
  const sameYear = o.start_date.slice(0, 4) === o.end_date.slice(0, 4);
  const dateText = o.start_date === o.end_date
    ? formatLocalDateLong(o.start_date)
    : `${formatLocalDateLong(o.start_date, { year: !sameYear })} – ${formatLocalDateLong(o.end_date)}`;
  let timeText = '';
  if (o.all_day === 1) timeText = 'All day';
  else if (o.start_time && o.end_time) timeText = `${formatLocalTime(o.start_time)} – ${formatLocalTime(o.end_time)}${o.ends_next_day === 1 ? ' (next day)' : ''}`;
  else if (o.start_time) timeText = formatLocalTime(o.start_time);
  return { dateText, timeText };
}
// schema.org subtype: the stored `type` hint first, else the primary category.
const WHATSON_CATEGORY_SCHEMA_TYPE = { 'sports-recreation': 'SportsEvent', 'live-music': 'MusicEvent', 'events-festivals': 'Festival' };
function eventSchemaType(event, categories) {
  if (event.type && EVENT_SCHEMA_TYPE_MAP[event.type]) return EVENT_SCHEMA_TYPE_MAP[event.type];
  return WHATSON_CATEGORY_SCHEMA_TYPE[categories[0]] || 'Event';
}
function occurrenceIsoStart(o) { return o.all_day === 1 || !o.start_time ? o.start_date : toVancouverIso(o.start_date, o.start_time); }
function occurrenceIsoEnd(o) {
  const endDate = o.ends_next_day === 1 ? addLocalDays(o.end_date, 1) : o.end_date;
  return o.all_day === 1 || !o.end_time ? endDate : toVancouverIso(endDate, o.end_time);
}
// JSON-LD for a scheduled event with real occurrences: the next upcoming
// occurrence (or the first, when all are past) is the Event; further
// occurrences become subEvent entries (cap 10). Nothing is emitted for a
// cancelled/postponed row or a row with no occurrences.
function eventJsonLd(event, occurrences, categories, hostVenue, canonical, todayStr) {
  if (event.status !== 'scheduled' || !occurrences.length) return null;
  const upcoming = occurrences.filter((o) => o.end_date >= todayStr);
  const main = upcoming[0] || occurrences[0];
  const others = occurrences.filter((o) => o.id !== main.id && o.end_date >= todayStr).slice(0, 10);
  const schemaType = eventSchemaType(event, categories);
  const location = hostVenue
    ? { '@type': 'Place', name: hostVenue.name, address: hostVenue.address || undefined }
    : { '@type': 'Place', name: event.venue_name_text || (event.valley_wide === 1 ? 'Okanagan Valley, BC' : REGION_LABELS[event.region]) };
  const sub = (o) => ({
    '@type': schemaType,
    name: o.label ? `${event.name} – ${o.label}` : event.name,
    startDate: occurrenceIsoStart(o),
    endDate: occurrenceIsoEnd(o),
    location,
  });
  return {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: main.label ? `${event.name} – ${main.label}` : event.name,
    description: event.description || undefined,
    startDate: occurrenceIsoStart(main),
    endDate: occurrenceIsoEnd(main),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    url: canonical,
    image: event.image_url || undefined,
    location,
    subEvent: others.length ? others.map(sub) : undefined,
  };
}
function renderEventPage(event, hostVenue, opts = {}) {
  const now = opts.now || new Date();
  const todayStr = todayLocal(now);
  const full = getEventById(event.id) || event; // status/source/venue text when the caller passed a bare rowToEvent()
  const regionLabel = REGION_LABELS[full.region];
  const canonical = `https://okanaganroam.com/${full.region}/events/${full.slug}`;
  const title = `${full.name} — Event in ${regionLabel}, BC | Okanagan Roam`;
  const rawDesc = full.description || `${full.name} is an event in ${regionLabel}, BC, listed on Okanagan Roam.`;
  const description = rawDesc.length > 155 ? rawDesc.slice(0, 152).replace(/\s+\S*$/, '') + '...' : rawDesc;
  const expired = isEventExpired(full, now);
  const occurrences = listEventOccurrences(full.id, { includeCancelled: false });
  const categories = getEventCategoryKeys(full.id);
  const isSeries = occurrences.length > 1;
  const upcoming = occurrences.filter((o) => o.end_date >= todayStr);

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: `https://okanaganroam.com/${full.region}` },
    { name: full.name, url: canonical },
  ]);
  const eventSchema = eventJsonLd(full, occurrences, categories, hostVenue, canonical, todayStr);

  // When: single date / span, or the series list; legacy rows fall back to
  // the stored span text exactly as before.
  let whenHtml;
  if (!occurrences.length) {
    const dateRangeText = full.end_datetime && full.end_datetime !== full.start_datetime ? `${full.start_datetime} – ${full.end_datetime}` : full.start_datetime;
    whenHtml = escapeHtml(dateRangeText);
  } else if (!isSeries) {
    const d = describeEventOccurrence(occurrences[0]);
    whenHtml = `${escapeHtml(d.dateText)}${d.timeText ? ` &middot; ${escapeHtml(d.timeText)}` : ''}`;
  } else {
    const next = upcoming[0];
    whenHtml = `${occurrences.length} dates${next ? ` &middot; next: ${escapeHtml(describeEventOccurrence(next).dateText)}` : ' &middot; all dates have passed'}`;
  }
  const datesListHtml = isSeries ? `
  <section class="event-dates" aria-labelledby="eventDatesHeading">
    <h2 id="eventDatesHeading">All dates</h2>
    <ol class="event-date-list">
${occurrences.map((o) => {
    const d = describeEventOccurrence(o);
    const past = o.end_date < todayStr;
    return `      <li class="event-date${past ? ' event-date-past' : ''}"><span class="event-date-when">${escapeHtml(d.dateText)}${d.timeText ? ` &middot; ${escapeHtml(d.timeText)}` : ''}</span>${o.label ? ` <span class="event-date-label">${escapeHtml(o.label)}</span>` : ''}${past ? ' <span class="event-date-past-tag">(past)</span>' : ''}</li>`;
  }).join('\n')}
    </ol>
  </section>` : '';

  const venueHtml = hostVenue
    ? `<a href="/${hostVenue.region}/${CATEGORY_SLUGS[hostVenue.type]}/${hostVenue.slug}">${escapeHtml(hostVenue.name)}</a>${hostVenue.address ? ` &middot; ${escapeHtml(hostVenue.address)}` : ''}`
    : (full.venue_name_text ? escapeHtml(full.venue_name_text) : (full.valley_wide === 1 ? 'Across the Okanagan Valley' : null));
  const attribution = full.source_type && !EVENT_OFFICIAL_SOURCE_TYPES.includes(full.source_type) && full.source_name
    ? `<p class="event-attribution">Listed by ${escapeHtml(full.source_name)}</p>` : '';
  const chips = categories.filter((k) => WHATSON_CATEGORY_BY_KEY[k]).map((k) => `<span class="chip">${escapeHtml(WHATSON_CATEGORY_BY_KEY[k].label)}</span>`).join(' ');
  const detailRows = [
    ['When', whenHtml],
    full.recurrence_rule ? ['Recurs', escapeHtml(full.recurrence_rule)] : null,
    venueHtml ? ['Where', venueHtml] : null,
    ['Region', `<a href="/${full.region}">${escapeHtml(regionLabel)}</a>`],
    full.website ? ['Website', `<a href="${escapeHtml(full.website)}" rel="nofollow noopener" target="_blank">${escapeHtml(full.website)}</a>`] : null,
  ].filter(Boolean)
    .map(([lbl, val]) => `<div class="detail-row"><span class="label">${escapeHtml(lbl)}</span><span>${val}</span></div>`)
    .join('\n');
  const imageHtml = full.image_url
    ? `<img src="${escapeHtml(full.image_url)}" alt="${escapeHtml(full.name)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:10px;margin-bottom:20px;">`
    : '';
  const tripQuery = `${full.name}, ${regionLabel}, Okanagan Valley, BC`;
  const actionsHtml = `
  <div class="venue-cta-row event-actions" data-venue-category="whatson" data-venue-id="event-${full.id}" data-venue-region="${escapeHtml(full.region)}" data-venue-name="${escapeHtml(full.name)}" data-surface="event_page">
    <button type="button" class="card-action fav-btn" data-fav-name="${escapeHtml(full.name)}" aria-pressed="false" aria-label="Favorite ${escapeHtml(full.name)}">&#9825; Favorite</button>
    <button type="button" class="card-action trip-btn" data-trip-name="${escapeHtml(full.name)}" data-trip-query="${escapeHtml(tripQuery)}" data-trip-region="${escapeHtml(full.region)}" aria-pressed="false" aria-label="Add ${escapeHtml(full.name)} to trip">&#65291; Add to Trip</button>
  </div>`;
  const pageCtx = JSON.stringify({ event_id: full.id, event_name: full.name, event_region: full.region, surface: 'event_page' }).replace(/</g, '\\u003c');
  const actionsScript = `<script>
(function(){
  var pageCtx = ${pageCtx};
  function ctx(){ var c = {}; for (var k in pageCtx) c[k] = pageCtx[k]; return c; }
  function track(name, params){ if (window.trackEvent) window.trackEvent(name, params); }
${golfFavTripScriptBody('whatson')}
})();
</script>`;
  const statusNote = expired ? ' — this event has ended' : '';

  // H1 internal linking (2026-09-22): a short "More events in {Region}" list.
  // Compact links only (never a full listing), each pointing at the other
  // event's own canonical /{region}/events/{slug} URL; the "see all" link
  // keeps the filtered What's On view one click away. Nothing renders when
  // the region has no other publishable event, so sparse regions and pages
  // whose siblings have expired simply omit the section.
  const related = listRelatedEventsInRegion(full, { limit: 4, now });
  const relatedHtml = related.length ? `
  <section class="event-related" aria-labelledby="eventRelatedHeading">
    <h2 id="eventRelatedHeading">More events in ${escapeHtml(regionLabel)}</h2>
    <ul class="event-related-list">
${related.map((r) => {
    const when = upcomingEventDateLabel(r.nextDate, r.nextEndDate, now);
    const cat = r.primaryCategory && WHATSON_CATEGORY_BY_KEY[r.primaryCategory] ? WHATSON_CATEGORY_BY_KEY[r.primaryCategory].label : '';
    return `      <li><a href="/${r.region}/events/${r.slug}">${escapeHtml(r.name)}</a>${when ? ` <span class="event-related-meta">${escapeHtml(when)}${cat ? ` &middot; ${escapeHtml(cat)}` : ''}</span>` : ''}</li>`;
  }).join('\n')}
    </ul>
    <p class="event-related-all"><a href="/whats-on?regions=${encodeURIComponent(full.region)}">See what&rsquo;s on in ${escapeHtml(regionLabel)}</a></p>
  </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, eventSchema].filter(Boolean), { noindex: expired })}
<style>
  .event-actions { margin: 4px 0 18px; }
  .event-actions .card-action { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; border: 1px solid #cfd8dc; background: #fff; color: #1b2a33; font: inherit; font-size: 0.95rem; cursor: pointer; }
  .event-actions .card-action.is-fav, .event-actions .card-action.in-trip { background: var(--teal, #2A6B67); border-color: var(--teal, #2A6B67); color: var(--paper, #fff); }
  .event-attribution { color: #5f6b73; font-size: 0.9rem; margin: 4px 0 16px; }
  .event-dates h2 { font-size: 1.1rem; margin: 24px 0 8px; }
  .event-date-list { padding-left: 20px; margin: 0 0 20px; }
  .event-date { margin: 4px 0; }
  .event-date-label { color: #5f6b73; }
  .event-date-past { color: #8a959b; }
  .event-date-past-tag { font-size: 0.85rem; }
  .event-related h2 { font-size: 1.1rem; margin: 24px 0 8px; }
  .event-related-list { list-style: none; padding: 0; margin: 0 0 10px; }
  .event-related-list li { margin: 6px 0; }
  .event-related-meta { color: #5f6b73; font-size: 0.9rem; }
  .event-related-all { margin: 0 0 20px; font-size: 0.95rem; }
</style>
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory →')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${full.region}` },
    { name: full.name },
  ])}
  ${imageHtml}
  <h1>${escapeHtml(full.name)}</h1>
  <p class="subtitle">${isSeries ? 'Event series' : 'Event'} in ${escapeHtml(regionLabel)}, BC${statusNote}</p>
  ${chips ? `<p class="chips">${chips}</p>` : ''}
  ${actionsHtml}
  <p>${escapeHtml(full.description || '')}</p>
  ${detailRows}
  ${datesListHtml}
  ${attribution}
  ${relatedHtml}
  <a class="cta" href="/${full.region}">Explore all of ${escapeHtml(regionLabel)}</a>
  ${renderHomeFooterHTML(true)}
  ${actionsScript}
</body>
</html>`;
}

// Minimal event-list card for the /events index -- reuses the existing
// generic .venue-card/.venue-meta/.chips classes from SEO_PAGE_CSS
// (already used by venueCardHtml() on category pages) instead of
// inventing new CSS just for this one page.
function eventCardHtml(event) {
  const regionLabel = REGION_LABELS[event.region] || event.region;
  const href = `/${event.region}/events/${event.slug}`;
  const dateLabel = escapeHtml(event.start_datetime.slice(0, 10));
  const typeChip = event.type ? `<p class="chips"><span class="chip">${escapeHtml(event.type)}</span></p>` : '';
  const desc = event.description ? `<p>${escapeHtml(event.description)}</p>` : '';
  return `
      <li class="venue-card">
        <h2><a href="${href}">${escapeHtml(event.name)}</a></h2>
        <p class="venue-meta">${dateLabel} &middot; ${escapeHtml(regionLabel)}</p>
        ${desc}
        ${typeChip}
      </li>`;
}

// GET /events — the standalone events index (2026-09-17). Replaces the
// homepage's own "Happening Soon" strip, which was removed entirely; the
// events table, individual event pages (/:region/events/:slug), and
// every other event route/API are completely untouched. Same active-event
// query Happening Soon used to run (mirrors isEventExpired()'s exact
// semantics), just without the LIMIT 6 -- this page shows every upcoming
// event, not just a homepage teaser.
function renderEventsIndexPage(events) {
  const title = 'Upcoming Events in the Okanagan | Okanagan Roam';
  const description = events.length
    ? `${events.length} upcoming event${events.length === 1 ? '' : 's'} across the Okanagan Valley — markets, festivals, tastings, and more.`
    : 'Upcoming events across the Okanagan Valley — markets, festivals, tastings, and more.';
  const canonical = 'https://okanaganroam.com/events';

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Events', url: canonical },
  ]);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    itemListElement: events.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://okanaganroam.com/${e.region}/events/${e.slug}`,
      item: { '@type': 'Event', name: e.name, description: e.description || undefined },
    })),
  };

  const cards = events.map(eventCardHtml).join('\n');
  const emptyState = events.length === 0
    ? '<p class="subtitle">No upcoming events right now — check back soon.</p>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList])}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory →')}
  ${breadcrumbNavHtml([{ name: 'Home', href: '/' }, { name: 'Events' }])}
  <h1>Upcoming Events in the Okanagan</h1>
  <p class="subtitle">${events.length} upcoming event${events.length === 1 ? '' : 's'} across the valley.</p>
  ${emptyState}
  <ul class="card-grid">
    ${cards}
  </ul>
  ${renderHomeFooterHTML(true)}
</body>
</html>`;
}

// ---------- Build My Trip, Stage 2 (frontend) ----------
//
// This page reuses the SAME rich header + trip tray markup as / and
// /browse (both of which serve okanagan.html directly), not the plain
// siteHeader() used by venue/category/region/guide pages -- this page
// needs the already-working trip tray and the same nav
// (dropdowns, mobile hamburger, language toggle), which only exist in
// okanagan.html's markup, not in the SEO-page shared components. The
// header and trip tray fragments are extracted from the actual served
// okanagan.html at request time, rather than duplicated by hand into a
// second copy that could silently drift out of sync -- the same "read
// okanagan.html, patch it" approach the /browse route handler already
// uses, just scoped to two small, well-bounded fragments instead of the
// whole body. Homepage-only in-page anchors (#moodCards/#hiddenGems/
// #exploreRegions) don't exist on this page either, so the same three
// link rewrites /browse's handler already applies are applied here too.
//
// Deliberately does NOT use pageHead()/SEO_PAGE_CSS -- that stylesheet
// constrains <body> to a centered 900px column, which conflicts with the
// full-width header/nav this page shares with / and /browse (which get
// their layout from tokens.css + app.css instead, never SEO_PAGE_CSS).
// This page's own <head> mirrors okanagan.html's real one (same favicon,
// verification tags, OG defaults, fonts, tokens.css, app.css) with only
// title/description/canonical swapped for this page.
// includeEndMarker=true includes endMarker's own text in the result (e.g.
// slicing up through a real closing tag like "</header>"); false stops
// right before it (e.g. when endMarker is just a lookahead anchor -- the
// start of the NEXT, unrelated section -- whose text must NOT be included,
// since an unterminated fragment like a truncated HTML comment would
// otherwise swallow everything rendered after it into that open comment).
function extractHtmlFragment(html, startMarker, endMarker, includeEndMarker) {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;
  const endIdx = html.indexOf(endMarker, startIdx);
  if (endIdx === -1) return null;
  return html.slice(startIdx, includeEndMarker ? endIdx + endMarker.length : endIdx);
}

// Maps each real venue type to its ALREADY-EXISTING i18n key (the same
// ones the header's Food & Drink dropdown and the old wizard chips use) --
// no new type-label translations needed, so English/French stay correct
// for these chips automatically, for free.
const TRIP_INTEREST_I18N_KEY = {
  restaurant: 'wizard.restaurants',
  winery: 'wizard.wineries',
  cafe: 'wizard.cafes',
  brewery: 'wizard.breweries',
  pub: 'wizard.pubsAndBars',
  cocktail: 'wizard.cocktailLounges',
  golf: 'mood.golf.title',
};

function renderTripPlannerStyles() {
  return `<style>
  ${renderCanonicalFooterStyles()}
  /* Build My Trip, Stage 2 -- page-specific styles only. Uses the SAME
     design tokens (--sand/--plum/--teal/--amber/--ink/--paper) already
     used by venue cards and the old wizard chips elsewhere on the site,
     so this page's own content reads as part of the same family as the
     header/nav it shares with / and /browse (which style themselves via
     the separate --ref-* token set, unaffected by anything here). */
  .trip-planner-main { padding: 28px 20px 72px; max-width: 900px; margin: 0 auto; }
  .trip-planner-breadcrumb { font-size: 0.8rem; color: var(--ink); opacity: 0.62; margin-bottom: 18px; }
  .trip-planner-breadcrumb a { color: var(--teal-deep); text-decoration: none; }
  .trip-planner-breadcrumb a:hover { text-decoration: underline; }
  .trip-planner-intro h1, .trip-planner-intro h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 2rem; margin: 0 0 6px; color: var(--ink); }
  .trip-planner-intro .subtitle { color: var(--ink); opacity: 0.7; font-size: 1.02rem; margin: 0 0 28px; max-width: 640px; }

  /* Conversational hero (primary /trip experience) -- same design tokens
     as the wizard below it, so the two feel like one coherent page even
     though the wizard is now the secondary/fallback path. */
  .trip-conv-hero {
    background: var(--paper); border: 1px solid rgba(74,52,40,0.10); border-radius: 20px;
    padding: 32px 28px; margin-bottom: 28px; box-shadow: 0 10px 28px -18px rgba(74,52,40,0.4);
  }
  .trip-conv-hero h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 2.1rem; margin: 0 0 8px; color: var(--ink); }
  .trip-conv-subtitle { color: var(--ink); opacity: 0.72; font-size: 1.05rem; margin: 0 0 22px; max-width: 620px; }

  .trip-conv-input-wrap { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; align-items: flex-start; }
  .trip-conv-textarea {
    width: 100%; min-height: 100px; padding: 16px 18px; border-radius: 14px; box-sizing: border-box;
    border: 1.5px solid rgba(42,32,25,0.22); font-family: 'Nunito', sans-serif; font-size: 1.02rem;
    background: var(--sand); color: var(--ink); resize: vertical; line-height: 1.5;
  }
  .trip-conv-textarea:focus { outline: none; border-color: var(--teal); box-shadow: 0 0 0 3px rgba(31,92,92,0.15); }
  .trip-conv-submit-btn { font-size: 0.98rem; padding: 13px 28px; }

  .trip-conv-examples { margin-bottom: 18px; }
  .trip-conv-examples-label { display: block; font-size: 0.82rem; font-weight: 700; color: var(--ink); opacity: 0.6; margin-bottom: 8px; }
  .trip-conv-example-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .trip-conv-example-chip {
    font-family: 'Nunito', sans-serif; font-size: 0.85rem; font-weight: 600; padding: 8px 14px;
    border-radius: 999px; border: 1.5px solid rgba(42,32,25,0.18); background: var(--paper);
    color: var(--teal-deep); cursor: pointer; text-align: left;
  }
  .trip-conv-example-chip:hover { background: var(--sand); border-color: var(--teal); }

  .trip-conv-status { font-size: 0.92rem; color: var(--ink); opacity: 0.75; margin: 0 0 8px; min-height: 1.2em; }
  .trip-conv-status.is-error { color: #9C3B3B; opacity: 1; font-weight: 700; }
  .trip-conv-status.is-loading::before {
    content: ''; display: inline-block; width: 13px; height: 13px; margin-right: 8px;
    border: 2px solid rgba(42,32,25,0.25); border-top-color: var(--teal); border-radius: 50%;
    animation: tripSpin 0.7s linear infinite; vertical-align: -2px;
  }

  .trip-conv-understood { margin-top: 22px; padding-top: 22px; border-top: 1.5px dashed rgba(74,52,40,0.16); }
  .trip-conv-understood h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.25rem; color: var(--ink); margin: 0 0 16px; }

  .trip-conv-chips { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
  .trip-conv-field { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .trip-conv-field label, .trip-conv-field-label { font-size: 0.82rem; font-weight: 800; color: var(--teal-deep); min-width: 80px; }
  .trip-conv-field select, .trip-conv-field input[type="number"] {
    padding: 8px 12px; border-radius: 8px; border: 1.5px solid rgba(42,32,25,0.22);
    font-family: 'Nunito', sans-serif; font-size: 0.92rem; background: var(--sand); color: var(--ink);
  }
  .trip-conv-field input[type="number"] { width: 70px; }

  .trip-conv-pace-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
  .trip-conv-pace-btn {
    font-family: 'Nunito', sans-serif; font-size: 0.84rem; font-weight: 700; padding: 7px 14px;
    border-radius: 999px; border: 1.5px solid rgba(42,32,25,0.22); background: var(--sand);
    color: var(--ink); cursor: pointer;
  }
  .trip-conv-pace-btn.is-active { background: var(--amber); border-color: var(--amber); }

  .trip-conv-chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
  .trip-conv-chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 8px 7px 14px; border-radius: 999px;
    background: var(--teal); color: var(--paper); font-size: 0.86rem; font-weight: 700;
  }
  .trip-conv-chip-remove {
    display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px;
    border-radius: 50%; border: none; background: rgba(255,255,255,0.25); color: var(--paper);
    cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0;
  }
  .trip-conv-chip-remove:hover { background: rgba(255,255,255,0.4); }

  .trip-conv-clarify {
    background: #E8F3F1; border: 1px solid #B9D9D4; border-radius: 10px; padding: 12px 16px;
    margin-bottom: 14px; font-size: 0.92rem; color: var(--ink); font-weight: 600;
  }
  .trip-conv-unsupported {
    background: #FBF0DC; border: 1px solid #E3C88A; border-radius: 10px; padding: 12px 16px;
    margin-bottom: 16px; font-size: 0.86rem; color: var(--ink);
  }
  .trip-conv-unsupported ul { margin: 6px 0 0; padding-left: 20px; }

  .trip-conv-generate-btn { font-size: 0.95rem; padding: 13px 26px; }
  .trip-conv-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .trip-conv-wizard-toggle {
    display: block; margin-top: 20px; background: none; border: none; padding: 0;
    font-family: 'Nunito', sans-serif; font-size: 0.88rem; font-weight: 700; color: var(--teal-deep);
    cursor: pointer; text-decoration: underline; text-underline-offset: 3px;
  }
  .trip-conv-wizard-toggle:hover { color: var(--teal); }

  @media (max-width: 560px) {
    .trip-conv-hero { padding: 22px 18px; }
    .trip-conv-hero h1 { font-size: 1.7rem; }
    .trip-conv-field { flex-direction: column; align-items: flex-start; }
    .trip-conv-field label, .trip-conv-field-label { min-width: 0; }
  }

  .trip-planner-form {
    background: var(--paper); border: 1px solid rgba(74,52,40,0.10); border-radius: 16px;
    padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 20px -16px rgba(74,52,40,0.35);
  }
  .trip-planner-step { margin-bottom: 24px; }
  .trip-planner-step:last-of-type { margin-bottom: 20px; }
  .trip-planner-step h2 {
    font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 1rem; color: var(--ink);
    display: flex; align-items: center; gap: 10px; margin: 0 0 12px;
  }
  .trip-planner-step-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 50%; background: var(--teal); color: var(--paper);
    font-size: 0.8rem; font-weight: 800; flex-shrink: 0;
  }
  .trip-planner-hint { font-size: 0.86rem; color: var(--ink); opacity: 0.62; margin: -6px 0 12px; }

  #tripRegionSelect {
    width: 100%; max-width: 360px; padding: 11px 14px; border-radius: 10px;
    border: 1.5px solid rgba(42,32,25,0.25); font-family: 'Nunito', sans-serif; font-size: 0.98rem;
    background: var(--sand); color: var(--ink);
  }
  .trip-planner-days-row { display: flex; align-items: center; gap: 10px; }
  #tripDaysInput {
    width: 84px; padding: 11px 14px; border-radius: 10px; border: 1.5px solid rgba(42,32,25,0.25);
    font-family: 'Nunito', sans-serif; font-size: 0.98rem; background: var(--sand); color: var(--ink);
  }

  .trip-interest-chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .trip-interest-chip {
    display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 999px;
    border: 1.5px solid rgba(42,32,25,0.22); background: var(--sand); cursor: pointer;
    font-size: 0.9rem; font-weight: 700; color: var(--ink); user-select: none;
  }
  .trip-interest-chip input { accent-color: var(--teal); }
  .trip-interest-chip:has(input:checked) { background: var(--teal); border-color: var(--teal); color: var(--paper); }

  .trip-pace-options { display: flex; flex-wrap: wrap; gap: 10px; }
  .trip-pace-option {
    display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px; border-radius: 999px;
    border: 1.5px solid rgba(42,32,25,0.22); background: var(--sand); cursor: pointer;
    font-size: 0.9rem; font-weight: 700; color: var(--ink); user-select: none;
  }
  .trip-pace-option input { accent-color: var(--amber); }
  .trip-pace-option:has(input:checked) { background: var(--amber); border-color: var(--amber); color: var(--ink); }

  .trip-planner-generate-btn { margin-top: 6px; font-size: 0.95rem; padding: 13px 26px; }

  .trip-planner-status {
    font-size: 0.92rem; color: var(--ink); opacity: 0.75; margin: 0 0 18px; min-height: 1.2em;
  }
  .trip-planner-status.is-error { color: #9C3B3B; opacity: 1; font-weight: 700; }
  .trip-planner-status.is-loading::before {
    content: ''; display: inline-block; width: 13px; height: 13px; margin-right: 8px;
    border: 2px solid rgba(42,32,25,0.25); border-top-color: var(--teal); border-radius: 50%;
    animation: tripSpin 0.7s linear infinite; vertical-align: -2px;
  }
  @keyframes tripSpin { to { transform: rotate(360deg); } }

  .trip-planner-result-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .trip-planner-result-header h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.4rem; color: var(--ink); margin: 0; }
  .trip-planner-regen-btn { background: var(--teal); font-size: 0.82rem; padding: 9px 16px; }
  .trip-planner-regen-btn:hover { background: var(--teal-deep); }
  /* Regenerate loading state -- own visible indicator at the button
     itself, not just the (distant, easily-scrolled-out-of-view)
     #tripPlannerStatus spinner used by the initial Generate. Reuses the
     same tripSpin keyframe/ring construction as
     .trip-planner-status.is-loading::before, just recolored for a solid
     teal background instead of the paper one. Toggled only around the
     Regenerate call in generateTrip(), never during a plain Generate. */
  .trip-planner-regen-btn.is-loading { opacity: 0.85; cursor: not-allowed; }
  .trip-planner-regen-btn.is-loading::before {
    content: ''; display: inline-block; width: 12px; height: 12px; margin-right: 7px;
    border: 2px solid rgba(255,255,255,0.35); border-top-color: var(--paper);
    border-radius: 50%; animation: tripSpin 0.7s linear infinite; vertical-align: -1px;
  }

  .trip-planner-warnings {
    background: #FBF0DC; border: 1px solid #E3C88A; border-radius: 10px; padding: 12px 16px;
    margin-bottom: 18px; font-size: 0.88rem; color: var(--ink);
  }
  .trip-planner-warnings ul { margin: 6px 0 0; padding-left: 20px; }

  .trip-planner-map-wrap { margin-bottom: 22px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(74,52,40,0.14); }
  #tripPlannerMap { height: 320px; width: 100%; }

  .trip-day { margin-bottom: 28px; }
  .trip-day h3 {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.2rem; color: var(--ink);
    margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--amber);
  }
  .trip-day-slots { display: grid; gap: 12px; grid-template-columns: repeat(3, 1fr); }

  .trip-slot-card {
    background: var(--paper); border: 1px solid rgba(74,52,40,0.10); border-radius: 12px;
    padding: 14px 16px; box-shadow: 0 6px 16px -14px rgba(74,52,40,0.4);
    display: flex; flex-direction: column; gap: 6px;
  }
  .trip-slot-label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--teal-deep); }
  .trip-slot-card h4 { font-family: 'Fraunces', serif; font-size: 1.02rem; font-weight: 600; color: var(--ink); margin: 0; }
  .trip-slot-card h4 a { color: inherit; text-decoration: none; }
  .trip-slot-card h4 a:hover { text-decoration: underline; }
  .trip-slot-meta { font-size: 0.84rem; color: var(--ink); opacity: 0.75; }
  .trip-slot-address { font-size: 0.8rem; color: var(--ink); opacity: 0.62; }
  .trip-slot-empty { font-size: 0.86rem; color: var(--ink); opacity: 0.5; font-style: italic; }
  .trip-slot-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; flex-wrap: wrap; }
  .trip-slot-actions button, .trip-slot-actions a.trip-slot-view-link {
    font-size: 0.76rem; font-weight: 700; padding: 6px 12px; border-radius: 999px; cursor: pointer;
    border: 1px solid rgba(42,32,25,0.2); background: var(--sand); color: var(--ink); text-decoration: none;
  }
  .trip-slot-actions button:hover, .trip-slot-actions a.trip-slot-view-link:hover { background: rgba(42,32,25,0.08); }
  /* Remove is the one destructive action among View venue/Add to trip/Remove
     -- all three previously shared identical styling, making Remove no more
     visually distinct than a neutral action. Reuses --plum/--plum-dark, the
     same tokens the trip tray's own per-item remove control (.trip-remove)
     and favourite toggle (.fav-btn.is-fav) already use for this exact
     "remove/undo" meaning elsewhere in the app, so this stays inside the
     existing design language rather than introducing a new one. Size/
     padding/tap-target are untouched -- only color changes. */
  .trip-slot-actions .trip-slot-remove-btn { color: var(--plum-dark); border-color: rgba(107,44,64,0.35); }
  .trip-slot-actions .trip-slot-remove-btn:hover { background: var(--plum); border-color: var(--plum); color: var(--paper); }
  .trip-slot-card.is-removed { display: none; }

  @media (max-width: 720px) {
    .trip-day-slots { grid-template-columns: 1fr; }
    .trip-planner-result-header { flex-wrap: wrap; }
  }
  @media (max-width: 560px) {
    .trip-planner-main { padding: 20px 16px 60px; }
    .trip-planner-form { padding: 18px; }
    .trip-planner-intro h1 { font-size: 1.6rem; }
    #tripDaysInput { width: 70px; }

    /* Mobile trip-tray clearance, /trip-specific top-up (2026-09-19): now
       that renderCanonicalFooterStyles() is shared onto this page (see the
       top of this stylesheet), #tripTrayToggle/.home-footer-bottom already
       get the same real mobile sizing/clearance the homepage and /browse
       do (the shared block's own padding-bottom:56px on .home-footer-bottom
       at this breakpoint). This override simply keeps a slightly larger,
       previously-verified safety margin on /trip specifically, since this
       page's own longer, variable-height itinerary content sits directly
       above the footer -- harmless extra whitespace if 56px alone would
       have been enough, scoped via body.page-trip so /browse and / are
       unaffected either way. */
    body.page-trip .home-footer-bottom { padding-bottom: 80px; }

    /* Mobile trip-tray/wizard-link overlap fix (audit finding, 2026-09-18):
       on a fresh, unscrolled load, #tripTray (site-wide, position:fixed,
       bottom:20px/right:20px, ~113px wide -- unchanged, see the clearance
       fix above) can sit directly on top of .trip-conv-wizard-toggle, the
       hero card's own wizard-fallback link, since that button is
       display:block and spans nearly the full card width while the tray's
       screen position relative to in-flow content shifts with viewport
       height and how much content renders above it -- confirmed
       overlapping at both 375x812 and 390x844, by different amounts at
       each. Chasing a specific vertical offset would only hold at one
       measured height; reserving horizontal clearance instead keeps the
       two apart at any height or scroll position, since the tray never
       sits further than ~133px from the right edge (20px inset + ~113px
       width) -- capping this link's own width comfortably inside that
       margin stops their boxes from intersecting at all. The link simply
       wraps onto an extra line at these widths; nothing is hidden or
       removed. */
    .trip-conv-wizard-toggle { max-width: calc(100% - 130px); box-sizing: border-box; }
  }
  </style>`;
}

// ---------- Build My Trip planner view (Phase 3, TRIP_PLANNER_V2) ----------
//
// Replaces ONLY the conversational hero on /trip; the step-by-step wizard,
// header, Trip tray and footer are unchanged and still work as before. Uses
// the page's existing trip-conv-*/trip-day/trip-slot-* classes, so it reads
// as the same Okanagan Roam page, plus a few scoped additions below. The
// shared Favorite (.fav-btn[data-fav-name]) and Add to Trip
// (.trip-btn[data-trip-name/-query/-region]) handlers in app.js pick the new
// buttons up unchanged; app.js itself is not modified.
const TRIP_PLANNER_V2_EXAMPLES = [
  'Find me a great date night in Kelowna',
  'Plan 3 days in Penticton with kids',
  'Where can I get the best poutine in the Okanagan?',
  'Plan a golf weekend around Kelowna',
  'What can we do around Penticton if it rains?',
];
function renderTripPlannerV2HeroHtml() {
  const chips = TRIP_PLANNER_V2_EXAMPLES.map((e) => `<button type="button" class="trip-conv-example-chip" data-plan-example>${escapeHtml(e)}</button>`).join('\n        ');
  return `  <section class="trip-conv-hero trip-plan-hero" id="tripPlanHero">
    <h1>Build Your Perfect Okanagan Trip</h1>
    <p class="trip-conv-subtitle">Tell us what you&rsquo;re after &mdash; a date night, a family weekend, three days of wine &mdash; and we&rsquo;ll plan it from real Okanagan Roam places, with the reason each one fits.</p>

    <form class="trip-conv-input-wrap" id="tripPlanForm">
      <textarea id="tripPlanInput" class="trip-conv-textarea" rows="3" maxlength="500" aria-label="Describe the trip you want"
        placeholder="Plan a relaxed 3-day trip around Kelowna with wine and hidden gems..."></textarea>
      <button type="submit" class="app-btn trip-conv-submit-btn" id="tripPlanSubmitBtn">Plan My Trip</button>
    </form>

    <div class="trip-conv-examples">
      <span class="trip-conv-examples-label">Or try one of these:</span>
      <div class="trip-conv-example-chips">
        ${chips}
      </div>
    </div>

    <div id="tripPlanStatus" class="trip-conv-status" aria-live="polite"></div>

    <button type="button" class="trip-conv-wizard-toggle" id="tripPlanWizardToggle" aria-expanded="false" aria-controls="tripWizardSection">Prefer to choose everything yourself? Plan it step by step</button>
  </section>

  <section id="tripPlanResult" class="trip-plan-result" hidden></section>
`;
}
function renderTripPlannerV2Styles() {
  return `<style>
  /* Build My Trip planner view (Phase 3): additions only, on top of the
     page's existing trip-conv/trip-day/trip-slot styles and tokens. */
  .trip-plan-result { margin-top: 26px; }
  .trip-plan-summary {
    background: var(--paper); border: 1px solid rgba(74,52,40,0.10); border-radius: 14px;
    padding: 18px 20px; margin-bottom: 18px; box-shadow: 0 8px 20px -16px rgba(74,52,40,0.35);
  }
  .trip-plan-eyebrow { margin: 0 0 4px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--teal-deep); }
  .trip-plan-summary h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.35rem; color: var(--ink); margin: 0 0 10px; }
  .trip-plan-overview { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .trip-plan-overview li { background: var(--sand-deep); color: var(--plum); font-weight: 700; font-size: 0.76rem; padding: 4px 11px; border-radius: 999px; }
  .trip-plan-notes { margin: 12px 0 0; padding: 0; list-style: none; font-size: 0.8rem; color: var(--ink); opacity: 0.72; }
  .trip-plan-notes li + li { margin-top: 4px; }
  .trip-plan-section-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.15rem; color: var(--ink); margin: 22px 0 12px; }
  .trip-plan-days .trip-day-slots, .trip-plan-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .trip-slot-why { margin: 4px 0 0; padding-left: 18px; font-size: 0.8rem; color: var(--ink); opacity: 0.82; }
  .trip-slot-why li + li { margin-top: 2px; }
  .trip-slot-caveats { margin: 2px 0 0; padding-left: 18px; font-size: 0.76rem; color: var(--plum-dark, #6B2C40); opacity: 0.85; font-style: italic; }
  .trip-plan-see-all { display: inline-block; margin-top: 14px; font-weight: 800; font-size: 0.88rem; color: var(--teal-deep); text-decoration: none; }
  .trip-plan-see-all:hover { text-decoration: underline; }
  .trip-plan-empty { font-size: 0.92rem; color: var(--ink); }
  </style>`;
}
function renderTripPlannerV2Script() {
  return `<script>
(function(){
  var form = document.getElementById('tripPlanForm');
  if (!form) return;
  var input = document.getElementById('tripPlanInput');
  var submitBtn = document.getElementById('tripPlanSubmitBtn');
  var statusEl = document.getElementById('tripPlanStatus');
  var resultEl = document.getElementById('tripPlanResult');
  var wizardToggle = document.getElementById('tripPlanWizardToggle');
  var wizard = document.getElementById('tripWizardSection');
  var state = { text: '', seed: 0, exclude: [], last: null };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u){ return typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/' ? u : null; }
  function setStatus(text, mode){ statusEl.textContent = text || ''; statusEl.className = 'trip-conv-status' + (mode ? ' is-' + mode : ''); }

  function request(extra){
    var body = { text: state.text, seed: state.seed, excludeVenueIds: state.exclude.slice(-200) };
    for (var k in extra) body[k] = extra[k];
    setStatus('Planning your trip\\u2026', 'loading');
    submitBtn.disabled = true;
    return fetch('/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
      .then(function(res){
        submitBtn.disabled = false;
        if (!res.ok) { setStatus(res.j && res.j.error ? res.j.error : 'Something went wrong. Please try again.', 'error'); return; }
        setStatus('');
        state.last = res.j;
        render(res.j);
      })
      .catch(function(){ submitBtn.disabled = false; setStatus('Something went wrong. Please try again.', 'error'); });
  }

  function metaLine(v){
    var parts = [v.typeLabel];
    if (v.rating != null) parts.push('\\u2605 ' + v.rating + (v.reviews ? ' (' + Number(v.reviews).toLocaleString('en-CA') + ')' : ''));
    if (v.price) parts.push(new Array(v.price + 1).join('$'));
    parts.push(v.regionLabel);
    return parts.map(esc).join(' \\u00b7 ');
  }
  function card(stop, label, key){
    if (!stop || !stop.venue) {
      return '<div class="trip-slot-card"><div class="trip-slot-label">' + esc(label) + '</div><p class="trip-slot-empty">No suitable stop found for this part of the day.</p></div>';
    }
    var v = stop.venue, url = safeUrl(v.url);
    var name = url ? '<a href="' + esc(url) + '">' + esc(v.name) + '</a>' : esc(v.name);
    var why = (stop.why || []).map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('');
    var tripQuery = v.address ? (v.name + ', ' + v.address) : (v.name + ', ' + v.regionLabel + ', Okanagan Valley, BC');
    return '<div class="trip-slot-card" data-venue-id="' + esc(v.id) + '">'
      + (label ? '<div class="trip-slot-label">' + esc(label) + '</div>' : '')
      + '<h4>' + name + '</h4>'
      + '<div class="trip-slot-meta">' + metaLine(v) + '</div>'
      + (why ? '<ul class="trip-slot-why" aria-label="Why this fits">' + why + '</ul>' : '')
      + ((stop.caveats || []).length ? '<ul class="trip-slot-caveats" aria-label="Good to know">' + stop.caveats.map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '')
      + '<div class="trip-slot-actions">'
      + (url ? '<a class="trip-slot-view-link" href="' + esc(url) + '">View details</a>' : '')
      + '<button type="button" class="fav-btn" data-fav-name="' + esc(v.name) + '">Favorite</button>'
      + '<button type="button" class="trip-btn" data-trip-name="' + esc(v.name) + '" data-trip-query="' + esc(tripQuery) + '" data-trip-region="' + esc(v.region) + '">Add to trip</button>'
      + '<button type="button" class="trip-slot-remove-btn" data-replace-id="' + esc(v.id) + '"' + (key ? ' data-replace-key="' + esc(key) + '"' : '') + ' title="Remove this stop and suggest another">Replace</button>'
      + '</div></div>';
  }
  function overviewChips(p){
    var o = p.overview || {}, chips = [];
    if (o.where) chips.push(o.where);
    if (o.days) chips.push(o.days === 1 ? '1 day' : o.days + ' days');
    if (o.pace) chips.push(o.pace.charAt(0).toUpperCase() + o.pace.slice(1) + ' pace');
    (o.interests || []).forEach(function(i){ chips.push(i); });
    if (o.occasion) chips.push(o.occasion.label);
    return chips.length ? '<ul class="trip-plan-overview">' + chips.map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '';
  }
  function render(p){
    var html = '<div class="trip-plan-summary"><p class="trip-plan-eyebrow">Your Okanagan plan</p><h2>' + esc(p.summary) + '</h2>' + overviewChips(p);
    if (p.notes && p.notes.length) html += '<ul class="trip-plan-notes">' + p.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    html += '</div>';
    var issues = [];
    (p.unsupported || []).forEach(function(u){ issues.push('Not something Okanagan Roam can plan for yet: \\u201c' + u + '\\u201d.'); });
    (p.warnings || []).forEach(function(w){ issues.push(w); });
    if (issues.length) html += '<div class="trip-planner-warnings"><ul>' + issues.map(function(i){ return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>';
    var hasVenues = false;
    if (p.kind === 'multi_day' || p.kind === 'day_plan') {
      html += '<div class="trip-planner-result-header"><h2>Your itinerary</h2><button type="button" class="app-btn trip-planner-regen-btn" data-plan-regenerate>Regenerate</button></div><div class="trip-plan-days">';
      (p.days || []).forEach(function(d){
        html += '<div class="trip-day"><h3>Day ' + esc(d.day) + (d.regionLabel ? ' \\u00b7 ' + esc(d.regionLabel) : '') + '</h3><div class="trip-day-slots">'
          + d.stops.map(function(s){ return card(s, s.label, d.day + '-' + s.daypart); }).join('') + '</div></div>';
        hasVenues = true;
      });
      html += '</div>';
    } else if (p.kind === 'outing' && p.outing) {
      html += '<div class="trip-planner-result-header"><h2>Your outing</h2><button type="button" class="app-btn trip-planner-regen-btn" data-plan-regenerate>Regenerate</button></div>'
        + '<div class="trip-plan-grid">' + p.outing.stops.map(function(s){ return card(s, s.label, null); }).join('') + '</div>';
      if (p.outing.alternates && p.outing.alternates.length) html += '<h3 class="trip-plan-section-title">Other good options</h3><div class="trip-plan-grid">' + p.outing.alternates.map(function(s){ return card(s, '', null); }).join('') + '</div>';
      hasVenues = true;
    } else if (p.kind === 'recommendations' || p.kind === 'discover') {
      var recs = p.recommendations || [];
      if (recs.length) {
        html += '<div class="trip-planner-result-header"><h2>Recommendations</h2><button type="button" class="app-btn trip-planner-regen-btn" data-plan-regenerate>Show others</button></div>'
          + '<div class="trip-plan-grid">' + recs.map(function(s){ return card(s, '', null); }).join('') + '</div>';
        hasVenues = true;
      }
    } else if (p.kind === 'events') {
      var ev = p.events || [];
      html += '<h2 class="trip-plan-section-title">What\\u2019s on</h2>';
      html += ev.length ? '<div class="trip-plan-grid">' + ev.map(function(e){
          var u = safeUrl(e.url);
          return '<div class="trip-slot-card"><div class="trip-slot-label">' + esc(e.dateLabel) + (e.time ? ' \\u00b7 ' + esc(e.time) : '') + '</div><h4>' + (u ? '<a href="' + esc(u) + '">' + esc(e.name) + '</a>' : esc(e.name)) + '</h4>'
            + (u ? '<div class="trip-slot-actions"><a class="trip-slot-view-link" href="' + esc(u) + '">View event</a></div>' : '') + '</div>';
        }).join('') + '</div>' : '<p class="trip-plan-empty">Nothing is listed for that yet.</p>';
    } else if (p.kind === 'navigate' && p.venue && safeUrl(p.venue.url)) {
      html += '<p class="trip-plan-empty">That\\u2019s a place on Okanagan Roam: <a class="trip-plan-see-all" href="' + esc(p.venue.url) + '">open its page \\u2192</a></p>';
    } else {
      html += '<p class="trip-plan-empty">Try naming a place and what you\\u2019d like to do \\u2014 for example \\u201cthree days in Kelowna with wineries and beaches\\u201d.</p>';
    }
    if (p.seeAll && safeUrl(p.seeAll.url)) html += '<a class="trip-plan-see-all" href="' + esc(p.seeAll.url) + '">See everything that matches on Okanagan Roam \\u2192</a>';
    resultEl.innerHTML = html;
    resultEl.hidden = false;
    if (window.__syncFavButtons) window.__syncFavButtons();
    if (window.__syncTripButtons) window.__syncTripButtons();
    if (hasVenues || p.kind === 'events') resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function currentPins(exceptKey){
    var pins = {};
    ((state.last && state.last.days) || []).forEach(function(d){
      d.stops.forEach(function(s){ var k = d.day + '-' + s.daypart; if (s.venue && k !== exceptKey) pins[k] = s.venue.id; });
    });
    return pins;
  }
  function shownIds(){
    var ids = [], p = state.last || {};
    (p.days || []).forEach(function(d){ d.stops.forEach(function(s){ if (s.venue) ids.push(s.venue.id); }); });
    ((p.outing && p.outing.stops) || []).forEach(function(s){ if (s.venue) ids.push(s.venue.id); });
    (p.recommendations || []).forEach(function(s){ ids.push(s.venue.id); });
    return ids.slice(0, 200);
  }

  resultEl.addEventListener('click', function(e){
    var replace = e.target.closest ? e.target.closest('[data-replace-id]') : null;
    if (replace) {
      var id = Number(replace.getAttribute('data-replace-id'));
      if (state.exclude.indexOf(id) === -1) state.exclude.push(id);
      var key = replace.getAttribute('data-replace-key');
      request(key ? { pinned: currentPins(key) } : {});
      return;
    }
    if (e.target.closest && e.target.closest('[data-plan-regenerate]')) {
      state.seed += 1;
      request({ avoidVenueIds: shownIds() });
    }
  });
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var text = input.value.trim();
    if (!text) { setStatus('Tell us what you\\u2019d like to do and where.', 'error'); return; }
    state = { text: text, seed: 0, exclude: [], last: null };
    request({});
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-plan-example]'), function(chip){
    chip.addEventListener('click', function(){ input.value = chip.textContent; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); });
  });
  if (wizardToggle && wizard) wizardToggle.addEventListener('click', function(){
    var open = wizard.style.display !== 'none';
    wizard.style.display = open ? 'none' : '';
    wizardToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  });
})();
</script>`;
}

// The pre-Phase-3 conversational hero, verbatim (see renderTripPlannerPage):
// with TRIP_PLANNER_V2 off the page is byte-identical to before.
const TRIP_LEGACY_HERO_HTML = `  <section class="trip-conv-hero" id="tripConvHero">
    <h1 data-i18n="trip.title">Build Your Perfect Okanagan Trip</h1>
    <p class="trip-conv-subtitle" data-i18n="trip.conv.subtitle">Describe the trip you want in your own words, and we&rsquo;ll turn it into a real itinerary built from actual venues.</p>

    <div class="trip-conv-input-wrap">
      <textarea id="tripConvInput" class="trip-conv-textarea" rows="3"
        data-i18n-placeholder="trip.conv.placeholder"
        placeholder="Plan me a relaxed 3-day trip around Kelowna with wine, dog-friendly places and hidden gems..."></textarea>
      <button type="button" class="app-btn trip-conv-submit-btn" id="tripConvSubmitBtn" data-i18n="trip.conv.submit">Plan My Trip</button>
    </div>

    <div class="trip-conv-examples">
      <span class="trip-conv-examples-label" data-i18n="trip.conv.examplesLabel">Or try one of these:</span>
      <div class="trip-conv-example-chips">
        <button type="button" class="trip-conv-example-chip" data-i18n="trip.conv.example1">3 relaxed days in Kelowna with wine and hidden gems</button>
        <button type="button" class="trip-conv-example-chip" data-i18n="trip.conv.example2">A weekend in Penticton with food, golf and a slower pace</button>
        <button type="button" class="trip-conv-example-chip" data-i18n="trip.conv.example3">2 days around Vernon with wineries and dog-friendly places</button>
      </div>
    </div>

    <div id="tripConvStatus" class="trip-conv-status" aria-live="polite"></div>

    <div id="tripConvUnderstood" class="trip-conv-understood" style="display:none;">
      <h2 data-i18n="trip.conv.understoodHeading">Here&rsquo;s what I understood</h2>
      <div id="tripConvClarify" class="trip-conv-clarify" style="display:none;"></div>
      <div id="tripConvChips" class="trip-conv-chips"></div>
      <div id="tripConvUnsupported" class="trip-conv-unsupported" style="display:none;"></div>
      <button type="button" class="app-btn trip-conv-generate-btn" id="tripConvGenerateBtn" data-i18n="trip.conv.generate" disabled>Generate My Trip</button>
    </div>

    <button type="button" class="trip-conv-wizard-toggle" id="tripConvWizardToggle" aria-expanded="false" aria-controls="tripWizardSection" data-i18n="trip.conv.wizardToggle">Prefer to choose everything yourself? Plan it step by step &rarr;</button>
  </section>
`;

function renderTripPlannerPage(v2 = false) {
  const title = 'Build My Trip — Okanagan Roam';
  const description = 'Plan a real, day-by-day Okanagan trip from actual venues — choose your region, number of days, interests, and pace, and get an itinerary built entirely from real wineries, restaurants, cafes, and more. No invented places.';
  const canonical = 'https://okanaganroam.com/trip';

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'Build My Trip', url: canonical },
  ]);

  let tripTrayHtml = '';
  let headerHtml = '';
  if (fs.existsSync(SITE_PATH)) {
    const rawHtml = fs.readFileSync(SITE_PATH, 'utf8');
    tripTrayHtml = extractHtmlFragment(rawHtml, '<div id="tripTray">', '\n\n<!-- Header rebuilt', false) || '';
    headerHtml = extractHtmlFragment(rawHtml, '<header id="top">', '</header>', true) || '';
    headerHtml = headerHtml
      .replace(/href="#moodCards"/g, 'href="/#moodCards"')
      .replace(/href="#hiddenGems"/g, 'href="/#hiddenGems"')
      .replace(/href="#exploreRegions"/g, 'href="/#exploreRegions"')
      // Same dead-anchor fix as /browse: the logo goes home from here.
      .replace(/href="#top"/g, 'href="/"');
  }

  const regionOptions = VALID_REGIONS
    .map((slug) => `<option value="${slug}">${escapeHtml(REGION_LABELS[slug])}</option>`)
    .join('\n');

  const interestChips = TRIP_INTEREST_TYPES
    .map((type) => {
      const key = TRIP_INTEREST_I18N_KEY[type];
      const label = CATEGORY_LABELS[type].plural;
      return `<label class="trip-interest-chip">
          <input type="checkbox" name="tripInterest" value="${type}">
          <span data-i18n="${key}">${escapeHtml(label)}</span>
        </label>`;
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
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23F5EDDD'/%3E%3Ccircle cx='26' cy='11' r='3' fill='%23D9A441'/%3E%3Cpath d='M26 4v2M31 6.5l-1.4 1.4M33.5 11h-2M26 18v-2M20.5 6.5l1.4 1.4' stroke='%23D9A441' stroke-width='1.3' stroke-linecap='round'/%3E%3Cpath d='M6 27L15 13l6 9' stroke='%231F5C5C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.5'/%3E%3Cpath d='M10 27L20 11l10 16' stroke='%231F5C5C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M5 27.5h30' stroke='%231F5C5C' stroke-width='1.5' stroke-linecap='round' opacity='0.3'/%3E%3C/svg%3E">
<meta property="og:site_name" content="Okanagan Roam">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://okanaganroam.com/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">
${JSON.stringify(breadcrumb)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/app.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
${renderTripPlannerStyles()}${v2 ? '\n' + renderTripPlannerV2Styles() : ''}
</head>
<body class="page-trip">
${tripTrayHtml}
<div id="floatingTooltip"></div>
${headerHtml}

<main class="trip-planner-main wrap" id="tripPlannerMain">
  <nav class="trip-planner-breadcrumb"><a href="/">Home</a> &rsaquo; Build My Trip</nav>

${v2 ? renderTripPlannerV2HeroHtml() : TRIP_LEGACY_HERO_HTML}
  <div id="tripWizardSection" style="display:none;">
    <div class="trip-planner-intro">
      <h2 data-i18n="trip.planner.title">Build My Trip</h2>
      <p class="subtitle" data-i18n="trip.planner.subtitle">Answer a few questions and we&rsquo;ll put together a real, day-by-day Okanagan itinerary from actual venues &mdash; no invented places, no AI guesswork.</p>
    </div>

    <form id="tripPlannerForm" class="trip-planner-form">
      <div class="trip-planner-step">
        <h2><span class="trip-planner-step-num">1</span> <span data-i18n="trip.planner.step1.label">Where are you going?</span></h2>
        <select id="tripRegionSelect" name="region" required>
          <option value="" data-i18n="trip.planner.regionPlaceholder">Choose a region&hellip;</option>
          ${regionOptions}
        </select>
      </div>

      <div class="trip-planner-step">
        <h2><span class="trip-planner-step-num">2</span> <span data-i18n="trip.planner.step2.label">How long?</span></h2>
        <div class="trip-planner-days-row">
          <input type="number" id="tripDaysInput" name="days" min="1" max="7" value="3" required>
          <span data-i18n="trip.planner.daysSuffix">days</span>
        </div>
      </div>

      <div class="trip-planner-step">
        <h2><span class="trip-planner-step-num">3</span> <span data-i18n="trip.planner.step3.label">What do you love?</span></h2>
        <p class="trip-planner-hint" data-i18n="trip.planner.step3.hint">Pick as many as you like &mdash; leave them all unchecked to see a bit of everything.</p>
        <div class="trip-interest-chips">
          ${interestChips}
        </div>
      </div>

      <div class="trip-planner-step">
        <h2><span class="trip-planner-step-num">4</span> <span data-i18n="trip.planner.step4.label">What&rsquo;s your pace?</span></h2>
        <div class="trip-pace-options">
          <label class="trip-pace-option"><input type="radio" name="pace" value="relaxed"><span data-i18n="trip.planner.pace.relaxed">Relaxed</span></label>
          <label class="trip-pace-option"><input type="radio" name="pace" value="standard" checked><span data-i18n="trip.planner.pace.standard">Standard</span></label>
          <label class="trip-pace-option"><input type="radio" name="pace" value="packed"><span data-i18n="trip.planner.pace.packed">Packed</span></label>
        </div>
      </div>

      <button type="submit" class="app-btn trip-planner-generate-btn" id="tripGenerateBtn" data-i18n="trip.planner.generate">Generate My Trip</button>
    </form>
  </div>

  <div id="tripPlannerStatus" class="trip-planner-status" aria-live="polite"></div>

  <div id="tripPlannerResult" class="trip-planner-result" style="display:none;">
    <div class="trip-planner-result-header">
      <h2 data-i18n="trip.planner.yourItinerary">Your itinerary</h2>
      <button type="button" class="app-btn trip-planner-regen-btn" id="tripRegenerateBtn" data-i18n="trip.planner.regenerate">Regenerate</button>
    </div>
    <div id="tripPlannerWarnings" class="trip-planner-warnings" style="display:none;"></div>
    <div id="tripPlannerMapWrap" class="trip-planner-map-wrap" style="display:none;">
      <div id="tripPlannerMap"></div>
    </div>
    <div id="tripPlannerDays" class="trip-planner-days"></div>
  </div>
</main>

${renderHomeFooterHTML(true)}

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="/scripts/app.js"></script>${v2 ? '\n' + renderTripPlannerV2Script() : ''}
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

function renderOpenNowScript(opts) {
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
  //
  // showButton (2026-09-17, homepage-only removal): defaults to true
  // (unchanged behavior everywhere this was already used) -- /browse's
  // own call site below is untouched, still gets the real, functional
  // button, since /browse still has .venue-card results to filter. The
  // homepage never has any .venue-card results to filter at all (the
  // wizard/results grid lives only at /browse), so the button served no
  // purpose there beyond visual clutter; the homepage's call site passes
  // { showButton: false } to skip creating it, while every other piece of
  // this script (MutationObserver, apply(), the .filter-bar scroll
  // handling) is left completely intact and harmless either way -- this
  // only gates ensureButton(), nothing else, keeping the change to the
  // smallest safe surface.
  const showButton = !(opts && opts.showButton === false);
  return `
<script>
(function(){
  var D = document;
  var SHOW_OPEN_NOW_BUTTON = ${showButton};
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
    if (!SHOW_OPEN_NOW_BUTTON) return;
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
  // Hides an existing UI piece the site owner asked to remove: the
  // "Open the map view" toggle. (The "Live search the whole Okanagan
  // (beta)" panel this used to also hide here was removed entirely from
  // the codebase in the Google Places cleanup, so it no longer needs
  // hiding at runtime.) Also rounds the big "N places to explore" count down
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
    var toHide = D.querySelectorAll('.map-toggle-row');
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

// Lets the new homepage's links land on /browse already filtered, since
// the homepage no longer has its own copy of the wizard/results DOM to
// drive directly (see the architecture-change comment on the / route
// above). Reuses the wizard's own existing controls (.type-chip clicks +
// the wizard:showResults event, #searchInput/#searchBtn) exactly as
// app.js's own mood-card handler already does on the homepage -- no new
// filtering logic, just triggering the same real controls once on load.
// Every lookup is null-guarded, so this is a harmless no-op if a param is
// absent or a target element doesn't exist.
function renderBrowsePrefillScript(discoveryParams = false) {
  // Discovery search (Phase 2): with DISCOVERY_SEARCH on, /browse also
  // accepts ?regions= and ?features= and presses its OWN region chips and
  // feature ("stamp") chips -- the same controls a visitor would click.
  // With the flag off this function's output is byte-identical to before.
  const discoveryVars = discoveryParams
    ? `
  var regions = params.get('regions');
  var features = params.get('features');
  var FEATURE_CHIP = ${JSON.stringify(BROWSE_FEATURE_CHIP)};`
    : '';
  const discoveryRun = discoveryParams
    ? `
    if (regions) {
      var wantedRegions = regions.split(',');
      document.querySelectorAll('.region-chip').forEach(function(chip){
        if (chip.dataset.region !== 'all' && wantedRegions.indexOf(chip.dataset.region) !== -1 && chip.getAttribute('aria-pressed') !== 'true') chip.click();
      });
    }
    if (features) {
      var wantedChips = features.split(',').map(function(f){ return FEATURE_CHIP[f]; }).filter(Boolean);
      document.querySelectorAll('.stamp-btn').forEach(function(btn){
        if (wantedChips.indexOf(btn.dataset.filter) !== -1 && btn.getAttribute('aria-pressed') !== 'true') btn.click();
      });
    }
    if (regions || features) document.dispatchEvent(new Event('wizard:showResults'));`
    : '';
  return `
<script>
(function(){
  var params = new URLSearchParams(window.location.search);
  var types = params.get('types');
  var q = params.get('q');
  var openMap = params.get('openMap');${discoveryVars}
  function run(){
    if (types) {
      var wanted = types.split(',');
      document.querySelectorAll('.type-chip').forEach(function(chip){
        var shouldBePressed = wanted.indexOf(chip.dataset.type) !== -1;
        var isPressed = chip.getAttribute('aria-pressed') === 'true';
        if (shouldBePressed !== isPressed) chip.click();
      });
      document.dispatchEvent(new Event('wizard:showResults'));
    }${discoveryRun}
    if (q) {
      var input = document.getElementById('searchInput');
      var btn = document.getElementById('searchBtn');
      if (input && btn) { input.value = q; btn.click(); }
    }
    if (openMap) {
      var toggle = document.getElementById('mapToggleBtn');
      if (toggle && toggle.getAttribute('aria-pressed') !== 'true') toggle.click();
    }
  }
  // app.js wires up .type-chip/#searchBtn/#mapToggleBtn click handlers only
  // once its own venue fetch resolves (window.__applyFilters is set at the
  // end of that same init step) -- clicking these controls any earlier is a
  // no-op since no listener exists yet. Poll briefly for that readiness
  // signal instead of guessing a fixed delay.
  function whenReady(fn){
    var tries = 0;
    (function poll(){
      if (window.__applyFilters || tries++ > 100) fn();
      else setTimeout(poll, 50);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ whenReady(run); });
  else whenReady(run);
})();
</script>`;
}

// ---------- List Your Venue, Phase 1 (2026-09-25) ----------
//
// The public venue submission workflow:
//   GET  /list-your-venue      -- the form (existing site shell, app.css form styles)
//   POST /api/venue-submissions -- validate, spam checks, store as PENDING,
//                                 then notify okanaganroam@gmail.com
//   GET  /admin/venue-submissions            -- token-protected review list
//   POST /admin/venue-submissions/:id/approve -- creates the venue via createVenue()
//   POST /admin/venue-submissions/:id/reject  -- publishes nothing
//
// A submission is stored in venue_submissions (db.js) and never touches
// `venues` until an admin approves it. The notification reuses the site's
// existing FormSubmit relay (the one the old /browse form posts to), called
// from the server after the row is stored so a failed send is recorded
// instead of silently losing the submission. No API key or SMTP secret is
// involved.

const VENUE_SUBMISSION_NOTIFY_EMAIL = 'okanaganroam@gmail.com';
const VENUE_SUBMISSION_NOTIFY_URL = `https://formsubmit.co/ajax/${VENUE_SUBMISSION_NOTIFY_EMAIL}`;
const VENUE_SUBMISSION_MAX_BODY_BYTES = 16 * 1024;
const VENUE_SUBMISSION_MIN_FILL_MS = 3000;
const VENUE_SUBMISSION_MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;
const VENUE_SUBMISSION_RATE_LIMIT = 10; // POST attempts per IP ...
const VENUE_SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000; // ... per hour
const VENUE_SUBMISSION_DUPLICATE_WINDOW_DAYS = 7;
const VENUE_SUBMISSION_CONSENT_VERSION = '2026-09-25';
const VENUE_SUBMISSION_CONSENT_TEXT = 'I am authorized to represent this business, the details are accurate, and Okanagan Roam may review, edit and publish them. My contact details are only used to follow up about this listing and are not published.';
const VENUE_SUBMISSION_ORIGINS = new Set(['https://okanaganroam.com', 'https://www.okanaganroam.com']);
// Canonical site taxonomy only: the venue types are CATEGORY_LABELS' keys,
// the regions REGION_LABELS' keys, the features the existing badge columns.
const VENUE_SUBMISSION_TYPES = Object.keys(CATEGORY_LABELS);
const VENUE_SUBMISSION_REGIONS = Object.keys(REGION_LABELS)
  .sort((a, b) => REGION_LABELS[a].localeCompare(REGION_LABELS[b]));
const VENUE_SUBMISSION_AMENITIES = BOOL_FIELDS.filter((f) => BADGE_LABELS[f]);
const VENUE_SUBMISSION_TEXT_FIELDS = {
  name: { label: 'Business / venue name', required: true, min: 2, max: 120 },
  description: { label: 'Description', required: true, min: 20, max: 500 },
  contact_name: { label: 'Your name', required: true, min: 2, max: 100 },
  address: { label: 'Address', max: 200 },
  cuisine: { label: 'Cuisine', max: 80 },
};
const VENUE_SUBMISSION_KEYS = new Set([
  'name', 'type', 'region', 'description', 'contact_name', 'contact_email', 'consent',
  'address', 'website', 'phone', 'cuisine', 'amenities', 'company_website', 'started_at',
]);

// Swapped out by the test suite so tests never send real email.
let venueSubmissionTransport = sendVenueSubmissionViaFormSubmit;
function setVenueSubmissionTransport(fn) {
  venueSubmissionTransport = fn || sendVenueSubmissionViaFormSubmit;
}

const venueSubmissionAttempts = new Map(); // ip -> [timestamps]
function venueSubmissionRateLimited(ip, now = Date.now()) {
  const recent = (venueSubmissionAttempts.get(ip) || []).filter((t) => now - t < VENUE_SUBMISSION_RATE_WINDOW_MS);
  recent.push(now);
  venueSubmissionAttempts.set(ip, recent);
  if (venueSubmissionAttempts.size > 5000) {
    for (const [key, times] of venueSubmissionAttempts) {
      if (!times.some((t) => now - t < VENUE_SUBMISSION_RATE_WINDOW_MS)) venueSubmissionAttempts.delete(key);
    }
  }
  return recent.length > VENUE_SUBMISSION_RATE_LIMIT;
}

// The visitor's IP for the rate limit. Railway's edge sets X-Real-IP to the
// client's address and overwrites any client-supplied value, on both the
// Cloudflare path (where it resolves to the visitor, not Cloudflare) and the
// direct *.up.railway.app path -- verified in production 2026-09-25.
// X-Forwarded-For and CF-Connecting-IP are not used: Railway rewrites the
// former with proxy addresses, and the latter is forgeable on the direct
// path. Without X-Real-IP (local runs) the socket address is used.
function requestClientIp(req) {
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (require('net').isIP(realIp)) return realIp;
  return req.socket.remoteAddress || 'unknown';
}

// Same-origin guard for the public POST. Browsers always send Origin on a
// cross-site fetch POST; a request from our own page carries our origin
// (production or whatever host served the page, e.g. localhost in dev).
function isSameOriginSubmission(req) {
  const origin = req.headers.origin;
  if (origin) {
    return VENUE_SUBMISSION_ORIGINS.has(origin)
      || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
  }
  return req.headers['sec-fetch-site'] !== 'cross-site';
}

// readBody() with a hard byte cap: anything over the limit is refused with
// 413 rather than buffered.
function readLimitedJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const fail = (status, message) => {
      const err = new Error(message);
      err.status = status;
      reject(err);
    };
    if (Number(req.headers['content-length']) > maxBytes) {
      req.resume();
      return fail(413, 'too_large');
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        return fail(413, 'too_large');
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch (_) {
        fail(400, 'malformed');
      }
    });
    req.on('error', () => { if (!done) { done = true; fail(400, 'malformed'); } });
  });
}

// Plain text only: trims, collapses runs of spaces/tabs, strips control
// characters (keeping newlines in the description). Everything is escaped
// again wherever it is rendered.
function cleanSubmissionText(value, { multiline = false } = {}) {
  let s = String(value).normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ');
  s = s.replace(/[ \t]+/g, ' ');
  if (multiline) s = s.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

const SUBMISSION_EMAIL_PATTERN = /^[^\s@<>()[\],;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

function normalizeSubmissionWebsite(value) {
  const raw = value.trim();
  if (/\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try { parsed = new URL(withScheme); } catch (_) { return null; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(parsed.hostname)) return null;
  return parsed.href;
}

// Validates the public submission (or an admin's approval overrides when
// `partial` is set). Returns { data, errors } where errors maps each field
// to a message written for the business owner.
function validateVenueSubmission(body, { partial = false } = {}) {
  const errors = {};
  const data = {};
  const present = (k) => body[k] !== undefined && body[k] !== null && body[k] !== '';

  for (const [key, rule] of Object.entries(VENUE_SUBMISSION_TEXT_FIELDS)) {
    if (!present(key)) {
      if (rule.required && !partial) errors[key] = `Please enter ${key === 'contact_name' ? 'your name' : `the ${rule.label.toLowerCase()}`}.`;
      continue;
    }
    if (typeof body[key] !== 'string') { errors[key] = `${rule.label} must be text.`; continue; }
    const value = cleanSubmissionText(body[key], { multiline: key === 'description' });
    if (!value && rule.required) { errors[key] = `Please enter the ${rule.label.toLowerCase()}.`; continue; }
    if (rule.min && value.length < rule.min) { errors[key] = `${rule.label} needs at least ${rule.min} characters.`; continue; }
    if (value.length > rule.max) { errors[key] = `${rule.label} can be at most ${rule.max} characters.`; continue; }
    if (value) data[key] = value;
  }

  if (!present('type')) {
    if (!partial) errors.type = 'Please choose a venue type.';
  } else if (!VENUE_SUBMISSION_TYPES.includes(body.type)) {
    errors.type = 'Please choose one of the listed venue types.';
  } else data.type = body.type;

  if (!present('region')) {
    if (!partial) errors.region = 'Please choose a region.';
  } else if (!VENUE_SUBMISSION_REGIONS.includes(body.region)) {
    errors.region = 'Please choose one of the listed regions.';
  } else data.region = body.region;

  if (!present('contact_email')) {
    if (!partial) errors.contact_email = 'Please enter your email address.';
  } else if (typeof body.contact_email !== 'string' || body.contact_email.trim().length > 254
      || !SUBMISSION_EMAIL_PATTERN.test(body.contact_email.trim())) {
    errors.contact_email = 'Please enter a valid email address, like name@example.com.';
  } else data.contact_email = body.contact_email.trim();

  if (present('website')) {
    const website = typeof body.website === 'string' && body.website.length <= 300 ? normalizeSubmissionWebsite(body.website) : null;
    if (!website) errors.website = 'Please enter a valid website address, like https://example.com.';
    else data.website = website;
  }

  if (present('phone')) {
    const phone = typeof body.phone === 'string' ? cleanSubmissionText(body.phone) : '';
    const digits = phone.replace(/\D/g, '').length;
    if (!/^[0-9+().\-\s]{7,40}$/.test(phone) || digits < 7 || digits > 15) {
      errors.phone = 'Please enter a valid phone number, like 250-555-0123.';
    } else data.phone = phone;
  }

  if (body.amenities !== undefined) {
    if (!Array.isArray(body.amenities) || body.amenities.length > VENUE_SUBMISSION_AMENITIES.length
        || !body.amenities.every((a) => VENUE_SUBMISSION_AMENITIES.includes(a))) {
      errors.amenities = 'Please choose features from the list only.';
    } else data.amenities = VENUE_SUBMISSION_AMENITIES.filter((a) => body.amenities.includes(a));
  }

  if (!partial && body.consent !== true) {
    errors.consent = 'Please confirm the statement above so we can review your listing.';
  }
  return { data, errors };
}

function rowToVenueSubmission(row) {
  if (!row) return null;
  return { ...row, consent: !!row.consent, amenities: JSON.parse(row.amenities || '[]') };
}

function getVenueSubmission(id) {
  return rowToVenueSubmission(db.prepare('SELECT * FROM venue_submissions WHERE id = ?').get(id));
}

// Live venues in the same region whose name matches, so the reviewer sees
// a likely duplicate before approving. Name match only, case-insensitive.
function findExistingVenuesForSubmission(name, region) {
  return db.prepare(
    'SELECT id, name, type, region, slug FROM venues WHERE region = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND redirect_to IS NULL'
  ).all(region, name);
}

function formatSubmissionTimestamp(sqliteUtc) {
  const date = new Date(`${String(sqliteUtc).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return String(sqliteUtc);
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
  return `${local} (${sqliteUtc} UTC)`;
}

// The notification's fields, in reading order. FormSubmit renders each key
// as a table row in the email; optional fields appear only when provided.
function buildVenueSubmissionEmail(sub) {
  const payload = {
    _subject: `[PENDING REVIEW] Venue submission #${sub.id}: ${sub.name}`,
    _template: 'table',
    _captcha: 'false',
    _replyto: sub.contact_email,
    'Status': 'PENDING REVIEW. This venue has NOT been published. Nothing appears on Okanagan Roam until it is approved.',
    'Submission ID': String(sub.id),
    'Submitted': formatSubmissionTimestamp(sub.submitted_at),
    'Venue name': sub.name,
    'Venue type': CATEGORY_LABELS[sub.type].singular,
    'Region': REGION_LABELS[sub.region],
    'Description': sub.description,
    'Contact name': sub.contact_name,
    'Contact email': sub.contact_email,
  };
  if (sub.address) payload['Address'] = sub.address;
  if (sub.website) payload['Website'] = sub.website;
  if (sub.phone) payload['Phone'] = sub.phone;
  if (sub.cuisine) payload['Cuisine'] = sub.cuisine;
  if (sub.amenities.length) payload['Amenities / features (as claimed)'] = sub.amenities.map((a) => BADGE_LABELS[a].title).join(', ');
  const existing = findExistingVenuesForSubmission(sub.name, sub.region);
  if (existing.length) payload['Possible existing listing'] = existing.map((v) => `${v.name} (venue #${v.id}, ${v.type})`).join('; ');
  payload['How to review'] = `Approve or reject submission #${sub.id} with the admin token: GET /admin/venue-submissions, then POST /admin/venue-submissions/${sub.id}/approve or /reject.`;
  return payload;
}

async function sendVenueSubmissionViaFormSubmit(payload) {
  const res = await fetch(VENUE_SUBMISSION_NOTIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://okanaganroam.com',
      Referer: 'https://okanaganroam.com/list-your-venue',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  let result = null;
  try { result = await res.json(); } catch (_) { /* non-JSON reply is a failure below */ }
  if (!res.ok || !result || String(result.success) !== 'true') {
    throw new Error(`FormSubmit HTTP ${res.status}: ${String((result && result.message) || 'no JSON body').slice(0, 200)}`);
  }
}

// Stored first, notified second: a failed send leaves the submission
// pending with notify_status 'failed' (visible in the admin list) and is
// logged, never surfaced to the submitter.
async function notifyVenueSubmission(id) {
  const sub = getVenueSubmission(id);
  try {
    await venueSubmissionTransport(buildVenueSubmissionEmail(sub));
    db.prepare("UPDATE venue_submissions SET notify_status = 'sent', notify_error = NULL, notified_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return true;
  } catch (err) {
    const message = String((err && err.message) || err).slice(0, 300);
    db.prepare("UPDATE venue_submissions SET notify_status = 'failed', notify_error = ? WHERE id = ?").run(message, id);
    console.error(`[venue-submissions] notification for submission #${id} failed (submission kept as pending): ${message}`);
    return false;
  }
}

function sendSubmissionResponse(res, status, data, close = false) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...(close ? { Connection: 'close' } : {}),
  });
  res.end(JSON.stringify(data));
}

async function handleVenueSubmission(req, res) {
  const generic = 'Sorry, something went wrong. Please try again, or email us at okanaganroam@gmail.com.';
  if (!isSameOriginSubmission(req)) {
    return sendSubmissionResponse(res, 403, { ok: false, error: 'Submissions are only accepted from the Okanagan Roam website.' });
  }
  const ip = requestClientIp(req);
  if (venueSubmissionRateLimited(ip)) {
    return sendSubmissionResponse(res, 429, { ok: false, error: 'Too many submissions from your connection. Please try again in an hour, or email us at okanaganroam@gmail.com.' });
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return sendSubmissionResponse(res, 415, { ok: false, error: generic });
  }
  let body;
  try {
    body = await readLimitedJsonBody(req, VENUE_SUBMISSION_MAX_BODY_BYTES);
  } catch (err) {
    if (err.status === 413) {
      return sendSubmissionResponse(res, 413, { ok: false, error: 'Your submission is too large. Please shorten it and try again.' }, true);
    }
    return sendSubmissionResponse(res, 400, { ok: false, error: generic });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !VENUE_SUBMISSION_KEYS.has(k))) {
    return sendSubmissionResponse(res, 400, { ok: false, error: generic });
  }

  // Honeypot: a hidden field people never see. Anything in it is a bot;
  // answer exactly like a success and store nothing.
  if (body.company_website !== undefined && body.company_website !== '') {
    return sendSubmissionResponse(res, 201, { ok: true });
  }
  const startedAt = Number(body.started_at);
  const elapsed = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || elapsed > VENUE_SUBMISSION_MAX_FORM_AGE_MS || elapsed < -60000) {
    return sendSubmissionResponse(res, 400, { ok: false, error: 'This form has expired. Please reload the page and submit again.' });
  }
  if (elapsed < VENUE_SUBMISSION_MIN_FILL_MS) {
    return sendSubmissionResponse(res, 400, { ok: false, error: 'That was very quick. Please check your details and press Submit again.' });
  }

  const { data, errors } = validateVenueSubmission(body);
  if (Object.keys(errors).length) {
    return sendSubmissionResponse(res, 400, { ok: false, error: 'Please fix the highlighted fields.', errors });
  }

  const duplicate = db.prepare(
    `SELECT id FROM venue_submissions WHERE status = 'pending' AND region = ?
       AND LOWER(name) = LOWER(?) AND LOWER(contact_email) = LOWER(?)
       AND submitted_at >= datetime('now', ?)`
  ).get(data.region, data.name, data.contact_email, `-${VENUE_SUBMISSION_DUPLICATE_WINDOW_DAYS} days`);
  if (duplicate) {
    return sendSubmissionResponse(res, 409, { ok: false, error: 'We already have a pending submission for this venue from this email address. We will be in touch after we review it.' });
  }

  const info = db.prepare(
    `INSERT INTO venue_submissions
       (name, type, region, description, address, website, phone, cuisine, amenities,
        contact_name, contact_email, consent, consent_version, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(
    data.name, data.type, data.region, data.description,
    data.address || null, data.website || null, data.phone || null, data.cuisine || null,
    JSON.stringify(data.amenities || []), data.contact_name, data.contact_email,
    VENUE_SUBMISSION_CONSENT_VERSION,
    crypto.createHash('sha256').update(`okanagan-roam-venue-submission:${ip}`).digest('hex'),
    String(req.headers['user-agent'] || '').slice(0, 300) || null
  );
  const id = Number(info.lastInsertRowid);
  await notifyVenueSubmission(id);
  return sendSubmissionResponse(res, 201, {
    ok: true,
    id,
    message: 'Thanks! Your venue has been submitted for review. It will not appear on Okanagan Roam until we have reviewed it, and we may email you with questions.',
  });
}

function requireAdminToken(req, res) {
  if (!ENRICHMENT_ADMIN_TOKEN) {
    sendJSON(res, 503, { error: 'Admin endpoints are not configured.' });
    return false;
  }
  const match = /^Bearer (.+)$/.exec(req.headers['authorization'] || '');
  if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
    sendJSON(res, 401, { error: 'Unauthorized.' });
    return false;
  }
  return true;
}

function validateReviewer(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 80 ? value.trim() : null;
}

// Approve: still pending -> createVenue() -> record venue_id, reviewer and
// time, all in one transaction. The status guard in the UPDATE makes a
// second approval (or an approval racing a rejection) a no-op that rolls
// the venue insert back, so a submission can never create two venues.
function approveVenueSubmission(id, body) {
  const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
  const allowed = new Set(['reviewer', 'overrides', 'include_amenities', 'allow_duplicate']);
  const unexpected = Object.keys(body).filter((k) => !allowed.has(k));
  if (unexpected.length) return fail(400, `Unexpected field(s): ${unexpected.join(', ')}`);
  const reviewer = validateReviewer(body.reviewer);
  if (!reviewer) return fail(400, 'reviewer is required (1-80 characters).');
  if (body.include_amenities !== undefined && typeof body.include_amenities !== 'boolean') return fail(400, 'include_amenities must be a boolean.');
  if (body.allow_duplicate !== undefined && typeof body.allow_duplicate !== 'boolean') return fail(400, 'allow_duplicate must be a boolean.');

  const sub = getVenueSubmission(id);
  if (!sub) return fail(404, 'Submission not found.');
  if (sub.status !== 'pending') return fail(409, `Submission is already ${sub.status}.`, { venue_id: sub.venue_id });

  let overrides = {};
  if (body.overrides !== undefined) {
    const allowedOverrides = ['name', 'type', 'region', 'description', 'address', 'website', 'phone', 'cuisine', 'amenities'];
    if (!body.overrides || typeof body.overrides !== 'object' || Array.isArray(body.overrides)
        || Object.keys(body.overrides).some((k) => !allowedOverrides.includes(k))) {
      return fail(400, `overrides may only contain: ${allowedOverrides.join(', ')}`);
    }
    const { data, errors } = validateVenueSubmission(body.overrides, { partial: true });
    if (Object.keys(errors).length) return fail(400, 'Invalid overrides.', { errors });
    overrides = data;
  }

  const final = { ...sub, ...overrides };
  const existing = findExistingVenuesForSubmission(final.name, final.region);
  if (existing.length && body.allow_duplicate !== true) {
    return fail(409, 'A live venue with this name already exists in this region. Pass allow_duplicate: true to create it anyway.', { existing });
  }

  const venueData = {
    name: final.name, region: final.region, type: final.type, description: final.description,
    address: final.address || null, website: final.website || null,
    phone: final.phone || null, cuisine: final.cuisine || null,
  };
  // Amenity claims are the owner's own; they only become public badges
  // when the reviewer opts in (or passes a verified list in overrides).
  if (body.include_amenities === true || overrides.amenities) {
    for (const a of final.amenities) venueData[a] = true;
  }

  let venue;
  db.exec('BEGIN');
  try {
    venue = createVenue(venueData);
    const updated = db.prepare(
      `UPDATE venue_submissions SET status = 'approved', venue_id = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
         WHERE id = ? AND status = 'pending'`
    ).run(venue.id, reviewer, id);
    if (updated.changes !== 1) throw Object.assign(new Error('Submission is no longer pending.'), { status: 409 });
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* nothing to roll back */ }
    return fail(err.status || 500, err.status ? err.message : 'Approval failed; nothing was published.');
  }
  // Same slug path every other venue takes (normally run at startup), so
  // the new venue's page exists immediately.
  try { backfillSlugs(); } catch (err) { console.error('[venue-submissions] slug backfill after approval failed:', err); }
  return { status: 200, body: { submission: getVenueSubmission(id), venue: getVenue(venue.id) } };
}

function rejectVenueSubmission(id, body) {
  const fail = (status, error) => ({ status, body: { error } });
  const unexpected = Object.keys(body).filter((k) => !['reviewer', 'reason'].includes(k));
  if (unexpected.length) return fail(400, `Unexpected field(s): ${unexpected.join(', ')}`);
  const reviewer = validateReviewer(body.reviewer);
  if (!reviewer) return fail(400, 'reviewer is required (1-80 characters).');
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 500)) {
    return fail(400, 'reason must be text of at most 500 characters.');
  }
  const sub = getVenueSubmission(id);
  if (!sub) return fail(404, 'Submission not found.');
  const updated = db.prepare(
    `UPDATE venue_submissions SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE id = ? AND status = 'pending'`
  ).run(body.reason ? cleanSubmissionText(body.reason, { multiline: true }) : null, reviewer, id);
  if (updated.changes !== 1) return fail(409, `Submission is already ${sub.status}.`);
  return { status: 200, body: { submission: getVenueSubmission(id) } };
}

function listVenueSubmissions(status) {
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM venue_submissions ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM venue_submissions WHERE status = ? ORDER BY id DESC').all(status);
  return rows.map(rowToVenueSubmission).map((s) => ({
    ...s,
    possible_existing_venues: s.status === 'pending' ? findExistingVenuesForSubmission(s.name, s.region) : [],
  }));
}

function renderListYourVenuePage() {
  const title = 'List Your Venue | Okanagan Roam';
  const description = 'Own a restaurant, winery, cafe, brewery or other Okanagan venue? Send us your details and we will review them for a listing on Okanagan Roam.';
  const canonical = 'https://okanaganroam.com/list-your-venue';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'List Your Venue', url: canonical },
  ]);
  const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  const typeOptions = VENUE_SUBMISSION_TYPES.map((t) => option(t, CATEGORY_LABELS[t].singular)).join('');
  const regionOptions = VENUE_SUBMISSION_REGIONS.map((r) => option(r, REGION_LABELS[r])).join('');
  const amenityChecks = VENUE_SUBMISSION_AMENITIES.map((a) => `
            <label class="amenity-check"><input type="checkbox" name="amenities" value="${a}"> ${escapeHtml(BADGE_LABELS[a].title)}</label>`).join('');
  const field = (id, label, control, hint = '') => `<div class="form-field">
          <label for="${id}">${label}</label>
          ${control}${hint}
          <p class="lyv-error" id="${id}Error" hidden></p>
        </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb], { golfTheme: true })}
${golfEngagementHeadHtml('fd', true)}
<style>
  body.list-venue-page .list-venue { padding: 12px 0 40px; }
  body.list-venue-page .list-venue-head { margin-bottom: 28px; }
  body.list-venue-page .lyv-steps { max-width: 640px; margin: 0 auto 28px; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; counter-reset: lyv; }
  body.list-venue-page .lyv-steps li { background: var(--paper); border-radius: 14px; padding: 14px 16px; font-size: 0.88rem; color: rgba(42,32,25,0.75); counter-increment: lyv; }
  body.list-venue-page .lyv-steps li::before { content: counter(lyv); display: block; font-weight: 800; color: var(--ref-navy); margin-bottom: 4px; }
  body.list-venue-page .lyv-steps strong { color: var(--ink); }
  body.list-venue-page .form-field .lyv-hint { font-size: 0.78rem; color: rgba(42,32,25,0.62); margin-top: 6px; }
  body.list-venue-page .lyv-error { font-size: 0.8rem; font-weight: 700; color: #C0392B; margin-top: 6px; }
  body.list-venue-page .form-field [aria-invalid="true"] { border-color: #C0392B; }
  body.list-venue-page .lyv-section-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ref-navy); font-weight: 800; margin: 26px 0 12px; }
  body.list-venue-page .lyv-section-label:first-child { margin-top: 0; }
  body.list-venue-page .lyv-consent { display: flex; gap: 10px; align-items: flex-start; font-size: 0.88rem; font-weight: 600; line-height: 1.45; }
  body.list-venue-page .lyv-consent input { width: auto; margin-top: 3px; flex: none; }
  body.list-venue-page .lyv-hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
  body.list-venue-page .lyv-form-error { display: none; background: rgba(192,57,43,0.07); border: 1.5px solid #C0392B; border-radius: 14px; padding: 14px 16px; margin-top: 16px; font-size: 0.9rem; }
  body.list-venue-page .lyv-form-error.show { display: block; }
  body.list-venue-page .venue-form-submit:disabled { opacity: 0.6; cursor: wait; }
  @media (max-width: 640px) {
    body.list-venue-page .venue-form { padding: 24px 18px; }
    body.list-venue-page .form-row { grid-template-columns: 1fr; }
    body.list-venue-page .lyv-steps { grid-template-columns: 1fr; }
  }
</style>
</head>
<body class="golf-page list-venue-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: 'List Your Venue' },
  ])}
  <section class="list-venue" id="list-your-venue">
    <div class="list-venue-head">
      <span class="eyebrow">For business owners</span>
      <h1>List Your Venue on Okanagan Roam</h1>
      <p>Own a restaurant, winery, cafe, brewery or other place visitors should know about? Tell us about it below. Every submission is reviewed by a person before anything appears on Okanagan Roam.</p>
    </div>
    <ol class="lyv-steps">
      <li><strong>Send your details.</strong> It takes about five minutes.</li>
      <li><strong>We review them.</strong> We check the details and may email you with questions.</li>
      <li><strong>Your listing goes live</strong> once it is approved. Nothing is published before then.</li>
    </ol>
    <form class="venue-form" id="lyvForm" novalidate>
      <p class="lyv-section-label">About the venue</p>
      <div class="form-row full">
        ${field('lyvName', 'Business / venue name *', '<input type="text" id="lyvName" name="name" required minlength="2" maxlength="120" autocomplete="organization">')}
      </div>
      <div class="form-row">
        ${field('lyvType', 'Venue type *', `<select id="lyvType" name="type" required><option value="">Select one</option>${typeOptions}</select>`)}
        ${field('lyvRegion', 'Region *', `<select id="lyvRegion" name="region" required><option value="">Select one</option>${regionOptions}</select>`)}
      </div>
      <div class="form-row full">
        ${field('lyvDescription', 'Description *', '<textarea id="lyvDescription" name="description" required minlength="20" maxlength="500" placeholder="What makes it worth a visit? Food, drinks, views, atmosphere..."></textarea>', '<p class="lyv-hint" id="lyvDescriptionCount" aria-live="polite">500 characters left</p>')}
      </div>
      <div class="form-row">
        ${field('lyvAddress', 'Address', '<input type="text" id="lyvAddress" name="address" maxlength="200" autocomplete="street-address">')}
        ${field('lyvWebsite', 'Website', '<input type="url" id="lyvWebsite" name="website" maxlength="300" placeholder="https://" autocomplete="url">')}
      </div>
      <div class="form-row">
        ${field('lyvPhone', 'Phone', '<input type="tel" id="lyvPhone" name="phone" maxlength="40" autocomplete="tel">')}
        ${field('lyvCuisine', 'Cuisine (if applicable)', '<input type="text" id="lyvCuisine" name="cuisine" maxlength="80" placeholder="e.g. Italian, Thai, Farm-to-table">')}
      </div>
      <div class="form-row full">
        <div class="form-field">
          <label id="lyvAmenitiesLabel">Features that genuinely apply</label>
          <p class="lyv-hint">Only check what is true. We verify features before showing them.</p>
          <div class="amenity-check-grid" role="group" aria-labelledby="lyvAmenitiesLabel">${amenityChecks}
          </div>
        </div>
      </div>
      <p class="lyv-section-label">Your contact details</p>
      <div class="form-row">
        ${field('lyvContactName', 'Your name *', '<input type="text" id="lyvContactName" name="contact_name" required minlength="2" maxlength="100" autocomplete="name">')}
        ${field('lyvContactEmail', 'Your email *', '<input type="email" id="lyvContactEmail" name="contact_email" required maxlength="254" autocomplete="email">')}
      </div>
      <div class="lyv-hp" aria-hidden="true">
        <label for="lyvCompanyWebsite">Leave this field empty</label>
        <input type="text" id="lyvCompanyWebsite" name="company_website" tabindex="-1" autocomplete="off">
      </div>
      <div class="form-row full">
        <div class="form-field">
          <label class="lyv-consent"><input type="checkbox" id="lyvConsent" name="consent" required> <span>${escapeHtml(VENUE_SUBMISSION_CONSENT_TEXT)} *</span></label>
          <p class="lyv-error" id="lyvConsentError" hidden></p>
        </div>
      </div>
      <button type="submit" class="venue-form-submit">Submit for review</button>
      <p class="form-note">* Required. Submitting does not publish anything: we review every venue first and will contact you by email.</p>
      <div class="lyv-form-error" id="lyvFormError" role="alert"></div>
    </form>
    <div class="venue-form form-success" id="lyvSuccess" role="status" tabindex="-1"></div>
    <noscript><p class="form-note">This form needs JavaScript. You can also email your venue details to <a href="mailto:okanaganroam@gmail.com">okanaganroam@gmail.com</a>.</p></noscript>
  </section>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
<script>
(function(){
  var form = document.getElementById('lyvForm');
  if (!form || !window.fetch) return;
  var startedAt = Date.now();
  var fields = { name: 'lyvName', type: 'lyvType', region: 'lyvRegion', description: 'lyvDescription', address: 'lyvAddress', website: 'lyvWebsite', phone: 'lyvPhone', cuisine: 'lyvCuisine', contact_name: 'lyvContactName', contact_email: 'lyvContactEmail', consent: 'lyvConsent' };
  var desc = document.getElementById('lyvDescription');
  var count = document.getElementById('lyvDescriptionCount');
  var formError = document.getElementById('lyvFormError');
  var success = document.getElementById('lyvSuccess');
  var button = form.querySelector('button[type="submit"]');
  desc.addEventListener('input', function(){
    var left = 500 - desc.value.length;
    count.textContent = left + (left === 1 ? ' character left' : ' characters left');
  });
  function clearErrors(){
    Object.keys(fields).forEach(function(key){
      var input = document.getElementById(fields[key]);
      var msg = document.getElementById(fields[key] + 'Error');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      if (msg) { msg.hidden = true; msg.textContent = ''; }
    });
    formError.classList.remove('show');
    formError.textContent = '';
  }
  function showErrors(errors){
    var first = null;
    Object.keys(errors).forEach(function(key){
      if (!fields[key]) return;
      var input = document.getElementById(fields[key]);
      var msg = document.getElementById(fields[key] + 'Error');
      input.setAttribute('aria-invalid', 'true');
      if (msg) { msg.textContent = errors[key]; msg.hidden = false; input.setAttribute('aria-describedby', msg.id); }
      if (!first) first = input;
    });
    if (first) first.focus();
  }
  function showFormError(text){
    formError.textContent = text;
    formError.classList.add('show');
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    clearErrors();
    var payload = { started_at: startedAt, company_website: document.getElementById('lyvCompanyWebsite').value, consent: document.getElementById('lyvConsent').checked, amenities: [] };
    ['name', 'type', 'region', 'description', 'address', 'website', 'phone', 'cuisine', 'contact_name', 'contact_email'].forEach(function(key){
      var value = document.getElementById(fields[key]).value.trim();
      if (value) payload[key] = value;
    });
    Array.prototype.forEach.call(form.querySelectorAll('input[name="amenities"]:checked'), function(box){ payload.amenities.push(box.value); });
    button.disabled = true;
    button.textContent = 'Submitting...';
    fetch('/api/venue-submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(res){ return res.json().catch(function(){ return {}; }).then(function(body){ return { status: res.status, body: body }; }); })
      .then(function(r){
        if (r.status === 201 && r.body.ok) {
          success.textContent = r.body.message || 'Thanks! Your venue has been submitted for review. It will not appear on Okanagan Roam until we have reviewed it.';
          success.classList.add('show');
          form.hidden = true;
          success.focus();
          return;
        }
        if (r.body.errors) showErrors(r.body.errors);
        showFormError(r.body.error || 'Sorry, something went wrong. Please try again, or email us at okanaganroam@gmail.com.');
      })
      .catch(function(){ showFormError('Sorry, we could not reach Okanagan Roam. Please check your connection and try again, or email us at okanaganroam@gmail.com.'); })
      .then(function(){ button.disabled = false; button.textContent = 'Submit for review'; });
  });
})();
</script>
</body>
</html>`;
}

// ---------- List an Event, Phase 1 (2026-09-25) ----------
//
// The public event submission workflow, the event counterpart of List Your
// Venue above (and built from its helpers, which are reused unchanged):
//   GET  /list-an-event          -- the form
//   POST /api/event-submissions  -- validate, spam checks, store as PENDING in
//                                   event_submissions, then notify
//                                   okanaganroam@gmail.com (same FormSubmit
//                                   transport as venue submissions)
//   GET  /admin/event-submissions             -- token-protected review list
//   POST /admin/event-submissions/:id/approve -- creates the event via createEvent()
//   POST /admin/event-submissions/:id/reject  -- publishes nothing
//
// A submission never touches events / event_occurrences / event_categories
// until an admin approves it; approval goes through createEvent(), so every
// existing event rule (categories, occurrences, venue rule, duplicate gate,
// slug, audit log) applies unchanged. One date range per submission; no
// recurrence is generated and no image is accepted.

const EVENT_SUBMISSION_MAX_BODY_BYTES = 16 * 1024;
const EVENT_SUBMISSION_RATE_LIMIT = 10; // POST attempts per IP ...
const EVENT_SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000; // ... per hour (own counter, separate from venues)
const EVENT_SUBMISSION_DUPLICATE_WINDOW_DAYS = 7;
const EVENT_SUBMISSION_MAX_FUTURE_DAYS = 366; // latest allowed start date, from today
const EVENT_SUBMISSION_MAX_SPAN_DAYS = 31; // a date range covers at most 31 calendar days
const EVENT_SUBMISSION_CONSENT_VERSION = '2026-09-25';
const EVENT_SUBMISSION_CONSENT_TEXT = 'I am authorized to submit this event, the details are accurate, and Okanagan Roam may review, edit and publish them. My contact details are only used to follow up about this event and are not published.';
const EVENT_SUBMISSION_REGIONS = VENUE_SUBMISSION_REGIONS;
const EVENT_SUBMISSION_TEXT_FIELDS = {
  name: { label: 'Event name', required: true, min: 2, max: 120 },
  description: { label: 'Description', required: true, min: 20, max: 1000, multiline: true },
  venue_name: { label: 'Venue or location', required: true, min: 2, max: 120 },
  organizer_name: { label: 'Organizer', required: true, min: 2, max: 120 },
  contact_name: { label: 'Your name', required: true, min: 2, max: 100 },
  schedule_notes: { label: 'Other dates or schedule notes', max: 500, multiline: true },
};
const EVENT_SUBMISSION_KEYS = new Set([
  'name', 'description', 'categories', 'region', 'venue_name', 'start_date', 'end_date', 'start_time', 'end_time',
  'all_day', 'event_url', 'organizer_name', 'schedule_notes', 'contact_name', 'contact_email', 'consent',
  'company_website', 'started_at',
]);

const eventSubmissionAttempts = new Map(); // ip -> [timestamps]; independent of venueSubmissionAttempts
function eventSubmissionRateLimited(ip, now = Date.now()) {
  const recent = (eventSubmissionAttempts.get(ip) || []).filter((t) => now - t < EVENT_SUBMISSION_RATE_WINDOW_MS);
  recent.push(now);
  eventSubmissionAttempts.set(ip, recent);
  if (eventSubmissionAttempts.size > 5000) {
    for (const [key, times] of eventSubmissionAttempts) {
      if (!times.some((t) => now - t < EVENT_SUBMISSION_RATE_WINDOW_MS)) eventSubmissionAttempts.delete(key);
    }
  }
  return recent.length > EVENT_SUBMISSION_RATE_LIMIT;
}

// Validates a public event submission. Returns { data, errors }; errors map
// each field to a message written for the organizer. Dates/times arrive as
// the browser's native YYYY-MM-DD / HH:MM values and are kept as Okanagan
// civil values, never converted. The resulting occurrence is also run
// through the existing validateEventOccurrence() as a final gate.
function validateEventSubmission(body, now = new Date()) {
  const errors = {};
  const data = {};
  const present = (k) => body[k] !== undefined && body[k] !== null && body[k] !== '';

  for (const [key, rule] of Object.entries(EVENT_SUBMISSION_TEXT_FIELDS)) {
    if (!present(key)) {
      if (rule.required) errors[key] = key === 'contact_name' ? 'Please enter your name.' : `Please enter the ${rule.label.toLowerCase()}.`;
      continue;
    }
    if (typeof body[key] !== 'string') { errors[key] = `${rule.label} must be text.`; continue; }
    const value = cleanSubmissionText(body[key], { multiline: !!rule.multiline });
    if (!value && rule.required) { errors[key] = `Please enter the ${rule.label.toLowerCase()}.`; continue; }
    if (rule.min && value.length < rule.min) { errors[key] = `${rule.label} needs at least ${rule.min} characters.`; continue; }
    if (value.length > rule.max) { errors[key] = `${rule.label} can be at most ${rule.max} characters.`; continue; }
    if (value) data[key] = value;
  }

  if (!present('categories')) {
    errors.categories = 'Please choose at least one category.';
  } else if (!Array.isArray(body.categories) || validateEventCategories(body.categories)) {
    errors.categories = `Please choose 1 to ${EVENT_MAX_CATEGORIES} categories from the list.`;
  } else data.categories = body.categories.slice();

  if (!present('region')) errors.region = 'Please choose a region.';
  else if (!EVENT_SUBMISSION_REGIONS.includes(body.region)) errors.region = 'Please choose one of the listed regions.';
  else data.region = body.region;

  if (!present('event_url')) {
    errors.event_url = 'Please enter the event website or ticket link.';
  } else {
    const url = typeof body.event_url === 'string' && body.event_url.length <= 500 ? normalizeSubmissionWebsite(body.event_url) : null;
    if (!url) errors.event_url = 'Please enter a valid website or ticket link, like https://example.com/event.';
    else data.event_url = url;
  }

  if (!present('contact_email')) {
    errors.contact_email = 'Please enter your email address.';
  } else if (typeof body.contact_email !== 'string' || body.contact_email.trim().length > 254
      || !SUBMISSION_EMAIL_PATTERN.test(body.contact_email.trim())) {
    errors.contact_email = 'Please enter a valid email address, like name@example.com.';
  } else data.contact_email = body.contact_email.trim();

  if (body.consent !== true) errors.consent = 'Please confirm the statement above so we can review your event.';

  // --- dates and times ---
  if (body.all_day !== undefined && typeof body.all_day !== 'boolean') errors.all_day = 'All day must be yes or no.';
  const allDay = body.all_day === true;
  const today = todayLocal(now);
  const startDate = present('start_date') ? parseLocalDate(body.start_date) : null;
  if (!present('start_date')) errors.start_date = 'Please choose the event date.';
  else if (!startDate) errors.start_date = 'Please enter a real date.';
  else if (startDate < today) errors.start_date = 'The event date has already passed.';
  else if (localDaysBetween(today, startDate) > EVENT_SUBMISSION_MAX_FUTURE_DAYS) errors.start_date = `Events can be submitted up to ${EVENT_SUBMISSION_MAX_FUTURE_DAYS} days ahead.`;

  let endDate = startDate;
  if (present('end_date')) {
    endDate = parseLocalDate(body.end_date);
    if (!endDate) errors.end_date = 'Please enter a real end date.';
    else if (startDate && endDate < startDate) errors.end_date = 'The end date is before the start date.';
    else if (startDate && localDaysBetween(startDate, endDate) >= EVENT_SUBMISSION_MAX_SPAN_DAYS) errors.end_date = `An event can span at most ${EVENT_SUBMISSION_MAX_SPAN_DAYS} days. Please list longer runs in the schedule notes.`;
  }

  const timeOk = (v) => typeof v === 'string' && LOCAL_TIME_PATTERN.test(v);
  let startTime = null;
  let endTime = null;
  if (allDay) {
    if (present('start_time') || present('end_time')) errors.start_time = 'An all-day event has no start or end time.';
  } else {
    if (!present('start_time')) errors.start_time = 'Please enter the start time, or tick All day.';
    else if (!timeOk(body.start_time)) errors.start_time = 'Please enter a valid start time.';
    else startTime = body.start_time;
    if (present('end_time')) {
      if (!timeOk(body.end_time)) errors.end_time = 'Please enter a valid end time.';
      else endTime = body.end_time;
    }
    if (startTime && endTime && startTime === endTime && startDate && startDate === endDate) errors.end_time = 'The end time is the same as the start time.';
  }

  if (!Object.keys(errors).some((k) => ['start_date', 'end_date', 'start_time', 'end_time', 'all_day'].includes(k))) {
    // A single-day event whose end time is earlier than its start time runs
    // past midnight (e.g. 21:00-01:00) -- the existing ends_next_day flag.
    const endsNextDay = startTime && endTime && startDate === endDate && endTime < startTime ? 1 : 0;
    const occurrence = {
      start_date: startDate, end_date: endDate, start_time: startTime, end_time: endTime,
      all_day: allDay ? 1 : 0, ends_next_day: endsNextDay,
    };
    if (validateEventOccurrence(occurrence)) errors.start_date = 'Please check the event date and times.';
    else Object.assign(data, occurrence);
  }
  return { data, errors };
}

function rowToEventSubmission(row) {
  if (!row) return null;
  return { ...row, consent: !!row.consent, categories: JSON.parse(row.categories || '[]') };
}

function getEventSubmission(id) {
  return rowToEventSubmission(db.prepare('SELECT * FROM event_submissions WHERE id = ?').get(id));
}

// The occurrence createEvent() will receive for this submission.
function eventSubmissionOccurrence(sub) {
  return {
    start_date: sub.start_date, end_date: sub.end_date, start_time: sub.start_time, end_time: sub.end_time,
    all_day: sub.all_day, ends_next_day: sub.ends_next_day,
  };
}

// Published events the existing duplicate rules flag for this submission
// (read-only; shown to the reviewer, never blocks the organizer).
function findExistingEventsForSubmission(sub) {
  return findDuplicateEventCandidates({
    name: sub.name, region: sub.region, venue_name_text: sub.venue_name, source_url: sub.event_url,
    occurrences: [eventSubmissionOccurrence(sub)],
  });
}

function formatSubmissionLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function formatSubmissionLocalTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function describeEventSubmissionWhen(sub) {
  const dates = sub.end_date === sub.start_date
    ? formatSubmissionLocalDate(sub.start_date)
    : `${formatSubmissionLocalDate(sub.start_date)} to ${formatSubmissionLocalDate(sub.end_date)}`;
  if (sub.all_day) return `${dates}, all day`;
  const times = sub.end_time
    ? `${formatSubmissionLocalTime(sub.start_time)} to ${formatSubmissionLocalTime(sub.end_time)}${sub.ends_next_day ? ' (ends after midnight)' : ''}`
    : `starts ${formatSubmissionLocalTime(sub.start_time)}`;
  return `${dates}, ${times} (Okanagan time)`;
}

function buildEventSubmissionEmail(sub) {
  const payload = {
    _subject: `[PENDING REVIEW] Event submission #${sub.id}: ${sub.name}`,
    _template: 'table',
    _captcha: 'false',
    _replyto: sub.contact_email,
    'Status': 'PENDING REVIEW. This event has NOT been published. Nothing appears on Okanagan Roam until it is approved.',
    'Submission ID': String(sub.id),
    'Submitted': formatSubmissionTimestamp(sub.submitted_at),
    'Event name': sub.name,
    'When': describeEventSubmissionWhen(sub),
    'Region': REGION_LABELS[sub.region],
    'Venue / location': sub.venue_name,
    'Categories': sub.categories.map((k) => WHATSON_CATEGORY_BY_KEY[k].label).join(', '),
    'Description': sub.description,
    'Event website / tickets': sub.event_url,
    'Organizer': sub.organizer_name,
    'Contact name': sub.contact_name,
    'Contact email': sub.contact_email,
  };
  if (sub.schedule_notes) payload['Other dates / schedule notes (not published)'] = sub.schedule_notes;
  const existing = findExistingEventsForSubmission(sub);
  if (existing.length) payload['Possible existing event'] = existing.map((e) => `${e.name} (event #${e.event_id}, ${e.rule})`).join('; ');
  payload['How to review'] = `Approve or reject submission #${sub.id} with the admin token: GET /admin/event-submissions, then POST /admin/event-submissions/${sub.id}/approve or /reject.`;
  return payload;
}

// Stored first, notified second, through the same transport as venue
// submissions: a failed send leaves the submission pending with
// notify_status 'failed' and is logged, never surfaced to the submitter.
async function notifyEventSubmission(id) {
  const sub = getEventSubmission(id);
  try {
    await venueSubmissionTransport(buildEventSubmissionEmail(sub));
    db.prepare("UPDATE event_submissions SET notify_status = 'sent', notify_error = NULL, notified_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return true;
  } catch (err) {
    const message = String((err && err.message) || err).slice(0, 300);
    db.prepare("UPDATE event_submissions SET notify_status = 'failed', notify_error = ? WHERE id = ?").run(message, id);
    console.error(`[event-submissions] notification for submission #${id} failed (submission kept as pending): ${message}`);
    return false;
  }
}

async function handleEventSubmission(req, res) {
  const generic = 'Sorry, something went wrong. Please try again, or email us at okanaganroam@gmail.com.';
  if (!isSameOriginSubmission(req)) {
    return sendSubmissionResponse(res, 403, { ok: false, error: 'Submissions are only accepted from the Okanagan Roam website.' });
  }
  const ip = requestClientIp(req);
  if (eventSubmissionRateLimited(ip)) {
    return sendSubmissionResponse(res, 429, { ok: false, error: 'Too many submissions from your connection. Please try again in an hour, or email us at okanaganroam@gmail.com.' });
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return sendSubmissionResponse(res, 415, { ok: false, error: generic });
  }
  let body;
  try {
    body = await readLimitedJsonBody(req, EVENT_SUBMISSION_MAX_BODY_BYTES);
  } catch (err) {
    if (err.status === 413) {
      return sendSubmissionResponse(res, 413, { ok: false, error: 'Your submission is too large. Please shorten it and try again.' }, true);
    }
    return sendSubmissionResponse(res, 400, { ok: false, error: generic });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !EVENT_SUBMISSION_KEYS.has(k))) {
    return sendSubmissionResponse(res, 400, { ok: false, error: generic });
  }

  // Honeypot: answer like a success and store nothing.
  if (body.company_website !== undefined && body.company_website !== '') {
    return sendSubmissionResponse(res, 201, { ok: true });
  }
  const startedAt = Number(body.started_at);
  const elapsed = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || elapsed > VENUE_SUBMISSION_MAX_FORM_AGE_MS || elapsed < -60000) {
    return sendSubmissionResponse(res, 400, { ok: false, error: 'This form has expired. Please reload the page and submit again.' });
  }
  if (elapsed < VENUE_SUBMISSION_MIN_FILL_MS) {
    return sendSubmissionResponse(res, 400, { ok: false, error: 'That was very quick. Please check your details and press Submit again.' });
  }

  const { data, errors } = validateEventSubmission(body);
  if (Object.keys(errors).length) {
    return sendSubmissionResponse(res, 400, { ok: false, error: 'Please fix the highlighted fields.', errors });
  }

  const duplicate = db.prepare(
    `SELECT id FROM event_submissions WHERE status = 'pending' AND region = ? AND start_date = ?
       AND LOWER(name) = LOWER(?) AND LOWER(contact_email) = LOWER(?)
       AND submitted_at >= datetime('now', ?)`
  ).get(data.region, data.start_date, data.name, data.contact_email, `-${EVENT_SUBMISSION_DUPLICATE_WINDOW_DAYS} days`);
  if (duplicate) {
    return sendSubmissionResponse(res, 409, { ok: false, error: 'We already have a pending submission for this event from this email address. We will be in touch after we review it.' });
  }

  const info = db.prepare(
    `INSERT INTO event_submissions
       (name, region, categories, description, venue_name, start_date, end_date, start_time, end_time, all_day, ends_next_day,
        event_url, organizer_name, schedule_notes, contact_name, contact_email, consent, consent_version, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(
    data.name, data.region, JSON.stringify(data.categories), data.description, data.venue_name,
    data.start_date, data.end_date, data.start_time, data.end_time, data.all_day, data.ends_next_day,
    data.event_url, data.organizer_name, data.schedule_notes || null, data.contact_name, data.contact_email,
    EVENT_SUBMISSION_CONSENT_VERSION,
    crypto.createHash('sha256').update(`okanagan-roam-event-submission:${ip}`).digest('hex'),
    String(req.headers['user-agent'] || '').slice(0, 300) || null
  );
  const id = Number(info.lastInsertRowid);
  await notifyEventSubmission(id);
  return sendSubmissionResponse(res, 201, {
    ok: true,
    id,
    message: 'Thanks! Your event has been submitted for review. It will not appear on Okanagan Roam until we have reviewed it, and we may email you with questions.',
  });
}

// Approve: still pending -> createEvent() (the existing, fully validated
// event writer with its own transaction and duplicate gate) -> record the
// event id, reviewer and time. createEvent() and the status-guarded UPDATE
// run synchronously back to back with no await between them, so nothing
// can interleave. The event's website and provenance are always the
// organizer's submitted link; the reviewer cannot supply a source.
function approveEventSubmission(id, body, now = new Date()) {
  const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
  const allowed = new Set(['reviewer', 'overrides', 'venue_id', 'type', 'source_type', 'reviewed_duplicates']);
  const unexpected = Object.keys(body).filter((k) => !allowed.has(k));
  if (unexpected.length) return fail(400, `Unexpected field(s): ${unexpected.join(', ')}`);
  const reviewer = validateReviewer(body.reviewer);
  if (!reviewer) return fail(400, 'reviewer is required (1-80 characters).');
  if (body.venue_id !== undefined && !(Number.isInteger(body.venue_id) && body.venue_id > 0)) return fail(400, 'venue_id must be a positive integer.');
  if (body.type !== undefined && !EVENT_TYPES.includes(body.type)) return fail(400, `type must be one of ${EVENT_TYPES.join('|')}.`);
  if (body.source_type !== undefined && !['official_organizer', 'official_venue'].includes(body.source_type)) return fail(400, 'source_type must be official_organizer or official_venue.');
  if (body.reviewed_duplicates !== undefined && !(Array.isArray(body.reviewed_duplicates) && body.reviewed_duplicates.every((n) => Number.isInteger(n) && n > 0))) {
    return fail(400, 'reviewed_duplicates must be an array of event ids.');
  }

  const sub = getEventSubmission(id);
  if (!sub) return fail(404, 'Submission not found.');
  if (sub.status !== 'pending') return fail(409, `Submission is already ${sub.status}.`, { event_id: sub.event_id });
  if (sub.end_date < todayLocal(now)) return fail(409, 'This event has already ended; reject it instead.');

  let overrides = {};
  if (body.overrides !== undefined) {
    const allowedOverrides = ['name', 'description', 'categories'];
    if (!body.overrides || typeof body.overrides !== 'object' || Array.isArray(body.overrides)
        || Object.keys(body.overrides).some((k) => !allowedOverrides.includes(k))) {
      return fail(400, `overrides may only contain: ${allowedOverrides.join(', ')}`);
    }
    const o = body.overrides;
    const errors = {};
    for (const key of ['name', 'description']) {
      if (o[key] === undefined) continue;
      const rule = EVENT_SUBMISSION_TEXT_FIELDS[key];
      const value = typeof o[key] === 'string' ? cleanSubmissionText(o[key], { multiline: !!rule.multiline }) : null;
      if (!value || value.length < rule.min || value.length > rule.max) errors[key] = `${rule.label} must be ${rule.min}-${rule.max} characters.`;
      else overrides[key] = value;
    }
    if (o.categories !== undefined) {
      if (validateEventCategories(o.categories)) errors.categories = `1-${EVENT_MAX_CATEGORIES} known category keys.`;
      else overrides.categories = o.categories.slice();
    }
    if (Object.keys(errors).length) return fail(400, 'Invalid overrides.', { errors });
  }

  const final = { ...sub, ...overrides };
  const data = {
    name: final.name,
    region: sub.region,
    description: final.description,
    website: sub.event_url,
    categories: final.categories,
    occurrences: [eventSubmissionOccurrence(sub)],
    status: 'scheduled',
    event_confidence: 'medium',
    source_type: body.source_type || 'official_organizer',
    source_name: sub.organizer_name,
    source_url: sub.event_url,
  };
  if (body.venue_id !== undefined) data.venue_id = body.venue_id;
  else data.venue_name_text = sub.venue_name;
  if (body.type !== undefined) data.type = body.type;
  const meta = {
    reason: `Approved event submission #${id}`,
    batch_id: `event-submission-${id}`,
    reviewed_by: reviewer,
    reviewed_duplicates: body.reviewed_duplicates || [],
  };

  let result;
  try {
    result = createEvent(data, meta);
  } catch (err) {
    return fail(500, 'Approval failed and was rolled back; nothing was published.');
  }
  if (!result.ok) {
    return fail(EVENT_WRITE_STATUS_MAP[result.reason] || 400, result.reason, { detail: result.detail });
  }
  db.prepare(
    `UPDATE event_submissions SET status = 'approved', event_id = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE id = ? AND status = 'pending'`
  ).run(result.event.id, reviewer, id);
  return { status: 200, body: { submission: getEventSubmission(id), event: result.event, categories: result.categories, occurrences: result.occurrences, review: result.review } };
}

function rejectEventSubmission(id, body) {
  const fail = (status, error) => ({ status, body: { error } });
  const unexpected = Object.keys(body).filter((k) => !['reviewer', 'reason'].includes(k));
  if (unexpected.length) return fail(400, `Unexpected field(s): ${unexpected.join(', ')}`);
  const reviewer = validateReviewer(body.reviewer);
  if (!reviewer) return fail(400, 'reviewer is required (1-80 characters).');
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 500)) {
    return fail(400, 'reason must be text of at most 500 characters.');
  }
  const sub = getEventSubmission(id);
  if (!sub) return fail(404, 'Submission not found.');
  const updated = db.prepare(
    `UPDATE event_submissions SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE id = ? AND status = 'pending'`
  ).run(body.reason ? cleanSubmissionText(body.reason, { multiline: true }) : null, reviewer, id);
  if (updated.changes !== 1) return fail(409, `Submission is already ${sub.status}.`);
  return { status: 200, body: { submission: getEventSubmission(id) } };
}

function listEventSubmissions(status) {
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM event_submissions ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM event_submissions WHERE status = ? ORDER BY id DESC').all(status);
  return rows.map(rowToEventSubmission).map((s) => ({
    ...s,
    possible_existing_events: s.status === 'pending' ? findExistingEventsForSubmission(s) : [],
  }));
}

function renderListAnEventPage(now = new Date()) {
  const title = 'List an Event | Okanagan Roam';
  const description = 'Organizing a festival, concert, market, tasting or community event in the Okanagan? Send us the details and we will review them for What’s On.';
  const canonical = 'https://okanaganroam.com/list-an-event';
  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: 'List an Event', url: canonical },
  ]);
  const today = todayLocal(now);
  const maxDate = addLocalDays(today, EVENT_SUBMISSION_MAX_FUTURE_DAYS);
  const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  const regionOptions = EVENT_SUBMISSION_REGIONS.map((r) => option(r, REGION_LABELS[r])).join('');
  const categoryChecks = WHATSON_CATEGORIES.map((c) => `
            <label class="amenity-check"><input type="checkbox" name="categories" value="${c.key}"> ${escapeHtml(c.label)}</label>`).join('');
  const field = (id, label, control, hint = '') => `<div class="form-field">
          <label for="${id}">${label}</label>
          ${control}${hint}
          <p class="lyv-error" id="${id}Error" hidden></p>
        </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb], { golfTheme: true })}
${golfEngagementHeadHtml('fd', true)}
<style>
  body.list-event-page .list-venue { padding: 12px 0 40px; }
  body.list-event-page .list-venue-head { margin-bottom: 28px; }
  body.list-event-page .lyv-steps { max-width: 640px; margin: 0 auto 28px; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; counter-reset: lyv; }
  body.list-event-page .lyv-steps li { background: var(--paper); border-radius: 14px; padding: 14px 16px; font-size: 0.88rem; color: rgba(42,32,25,0.75); counter-increment: lyv; }
  body.list-event-page .lyv-steps li::before { content: counter(lyv); display: block; font-weight: 800; color: var(--ref-navy); margin-bottom: 4px; }
  body.list-event-page .lyv-steps strong { color: var(--ink); }
  body.list-event-page .form-field .lyv-hint { font-size: 0.78rem; color: rgba(42,32,25,0.62); margin-top: 6px; }
  body.list-event-page .lyv-error { font-size: 0.8rem; font-weight: 700; color: #C0392B; margin-top: 6px; }
  body.list-event-page .form-field [aria-invalid="true"] { border-color: #C0392B; }
  body.list-event-page .lyv-section-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ref-navy); font-weight: 800; margin: 26px 0 12px; }
  body.list-event-page .lyv-section-label:first-child { margin-top: 0; }
  body.list-event-page .lyv-consent { display: flex; gap: 10px; align-items: flex-start; font-size: 0.88rem; font-weight: 600; line-height: 1.45; }
  body.list-event-page .lyv-consent input { width: auto; margin-top: 3px; flex: none; }
  body.list-event-page .lyv-hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
  body.list-event-page .lyv-form-error { display: none; background: rgba(192,57,43,0.07); border: 1.5px solid #C0392B; border-radius: 14px; padding: 14px 16px; margin-top: 16px; font-size: 0.9rem; }
  body.list-event-page .lyv-form-error.show { display: block; }
  body.list-event-page .venue-form-submit:disabled { opacity: 0.6; cursor: wait; }
  body.list-event-page input:disabled { opacity: 0.5; }
  @media (max-width: 640px) {
    body.list-event-page .venue-form { padding: 24px 18px; }
    body.list-event-page .form-row { grid-template-columns: 1fr; }
    body.list-event-page .lyv-steps { grid-template-columns: 1fr; }
  }
</style>
</head>
<body class="golf-page list-event-page">
  ${renderGolfTripTrayHtml()}
<div id="floatingTooltip"></div>
${renderGolfHeaderHtml()}
  <main class="wrap-wide golf-main">
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: 'List an Event' },
  ])}
  <section class="list-venue" id="list-an-event">
    <div class="list-venue-head">
      <span class="eyebrow">For event organizers</span>
      <h1>List an Event on Okanagan Roam</h1>
      <p>Organizing a festival, concert, market, tasting or community event in the Okanagan? Tell us about it below. Every submission is reviewed by a person before anything appears on What&rsquo;s On.</p>
    </div>
    <ol class="lyv-steps">
      <li><strong>Send your event.</strong> It takes about five minutes.</li>
      <li><strong>We review it.</strong> We check the details and may email you with questions.</li>
      <li><strong>It goes live on What&rsquo;s On</strong> once it is approved. Nothing is published before then.</li>
    </ol>
    <form class="venue-form" id="laeForm" novalidate>
      <p class="lyv-section-label">About the event</p>
      <div class="form-row full">
        ${field('laeName', 'Event name *', '<input type="text" id="laeName" name="name" required minlength="2" maxlength="120">')}
      </div>
      <div class="form-row full">
        <div class="form-field">
          <label id="laeCategoriesLabel">Categories * <span class="lyv-hint">(choose 1 to 3)</span></label>
          <div class="amenity-check-grid" role="group" aria-labelledby="laeCategoriesLabel" id="laeCategories">${categoryChecks}
          </div>
          <p class="lyv-error" id="laeCategoriesError" hidden></p>
        </div>
      </div>
      <div class="form-row full">
        ${field('laeDescription', 'Description *', '<textarea id="laeDescription" name="description" required minlength="20" maxlength="1000" placeholder="What is happening, who is it for, and what should people know before they go?"></textarea>', '<p class="lyv-hint" id="laeDescriptionCount" aria-live="polite">1000 characters left</p>')}
      </div>
      <p class="lyv-section-label">Where</p>
      <div class="form-row">
        ${field('laeRegion', 'Region *', `<select id="laeRegion" name="region" required><option value="">Select one</option>${regionOptions}</select>`)}
        ${field('laeVenueName', 'Venue or location *', '<input type="text" id="laeVenueName" name="venue_name" required minlength="2" maxlength="120" placeholder="e.g. Kelowna Community Theatre">')}
      </div>
      <p class="lyv-section-label">When (Okanagan time)</p>
      <div class="form-row">
        ${field('laeStartDate', 'Date *', `<input type="date" id="laeStartDate" name="start_date" required min="${today}" max="${maxDate}">`)}
        ${field('laeEndDate', 'End date (multi-day events)', `<input type="date" id="laeEndDate" name="end_date" min="${today}" max="${addLocalDays(maxDate, EVENT_SUBMISSION_MAX_SPAN_DAYS - 1)}">`)}
      </div>
      <div class="form-row">
        ${field('laeStartTime', 'Start time *', '<input type="time" id="laeStartTime" name="start_time" required>')}
        ${field('laeEndTime', 'End time', '<input type="time" id="laeEndTime" name="end_time">', '<p class="lyv-hint">If it ends after midnight, just enter the end time.</p>')}
      </div>
      <div class="form-row full">
        <div class="form-field">
          <label class="lyv-consent"><input type="checkbox" id="laeAllDay" name="all_day"> <span>All-day event (no set times)</span></label>
        </div>
      </div>
      <div class="form-row full">
        ${field('laeScheduleNotes', 'Other dates or schedule notes', '<textarea id="laeScheduleNotes" name="schedule_notes" maxlength="500" placeholder="Repeats weekly? More dates? Tell us here and we will add them."></textarea>', '<p class="lyv-hint">For our review only. It is not published as written.</p>')}
      </div>
      <p class="lyv-section-label">Details</p>
      <div class="form-row">
        ${field('laeEventUrl', 'Event website or ticket link *', '<input type="url" id="laeEventUrl" name="event_url" required maxlength="500" placeholder="https://" autocomplete="url">')}
        ${field('laeOrganizerName', 'Organizer *', '<input type="text" id="laeOrganizerName" name="organizer_name" required minlength="2" maxlength="120" autocomplete="organization">')}
      </div>
      <p class="lyv-section-label">Your contact details</p>
      <div class="form-row">
        ${field('laeContactName', 'Your name *', '<input type="text" id="laeContactName" name="contact_name" required minlength="2" maxlength="100" autocomplete="name">')}
        ${field('laeContactEmail', 'Your email *', '<input type="email" id="laeContactEmail" name="contact_email" required maxlength="254" autocomplete="email">')}
      </div>
      <div class="lyv-hp" aria-hidden="true">
        <label for="laeCompanyWebsite">Leave this field empty</label>
        <input type="text" id="laeCompanyWebsite" name="company_website" tabindex="-1" autocomplete="off">
      </div>
      <div class="form-row full">
        <div class="form-field">
          <label class="lyv-consent"><input type="checkbox" id="laeConsent" name="consent" required> <span>${escapeHtml(EVENT_SUBMISSION_CONSENT_TEXT)} *</span></label>
          <p class="lyv-error" id="laeConsentError" hidden></p>
        </div>
      </div>
      <button type="submit" class="venue-form-submit">Submit for review</button>
      <p class="form-note">* Required. Submitting does not publish anything: we review every event first and will contact you by email.</p>
      <div class="lyv-form-error" id="laeFormError" role="alert"></div>
    </form>
    <div class="venue-form form-success" id="laeSuccess" role="status" tabindex="-1"></div>
    <noscript><p class="form-note">This form needs JavaScript. You can also email your event details to <a href="mailto:okanaganroam@gmail.com">okanaganroam@gmail.com</a>.</p></noscript>
  </section>
  </main>
  ${renderHomeFooterHTML(true)}
  ${GOLF_APP_SCRIPT_TAG}
<script>
(function(){
  var form = document.getElementById('laeForm');
  if (!form || !window.fetch) return;
  var startedAt = Date.now();
  var fields = { name: 'laeName', categories: 'laeCategories', description: 'laeDescription', region: 'laeRegion', venue_name: 'laeVenueName', start_date: 'laeStartDate', end_date: 'laeEndDate', start_time: 'laeStartTime', end_time: 'laeEndTime', schedule_notes: 'laeScheduleNotes', event_url: 'laeEventUrl', organizer_name: 'laeOrganizerName', contact_name: 'laeContactName', contact_email: 'laeContactEmail', consent: 'laeConsent' };
  var desc = document.getElementById('laeDescription');
  var count = document.getElementById('laeDescriptionCount');
  var allDay = document.getElementById('laeAllDay');
  var startTime = document.getElementById('laeStartTime');
  var endTime = document.getElementById('laeEndTime');
  var formError = document.getElementById('laeFormError');
  var success = document.getElementById('laeSuccess');
  var button = form.querySelector('button[type="submit"]');
  var boxes = form.querySelectorAll('input[name="categories"]');
  desc.addEventListener('input', function(){
    var left = 1000 - desc.value.length;
    count.textContent = left + (left === 1 ? ' character left' : ' characters left');
  });
  allDay.addEventListener('change', function(){
    startTime.disabled = endTime.disabled = allDay.checked;
    if (allDay.checked) { startTime.value = ''; endTime.value = ''; }
  });
  Array.prototype.forEach.call(boxes, function(box){
    box.addEventListener('change', function(){
      var checked = form.querySelectorAll('input[name="categories"]:checked').length;
      Array.prototype.forEach.call(boxes, function(b){ b.disabled = !b.checked && checked >= 3; });
    });
  });
  function clearErrors(){
    Object.keys(fields).forEach(function(key){
      var input = document.getElementById(fields[key]);
      var msg = document.getElementById(fields[key] + 'Error');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      if (msg) { msg.hidden = true; msg.textContent = ''; }
    });
    formError.classList.remove('show');
    formError.textContent = '';
  }
  function showErrors(errors){
    var first = null;
    Object.keys(errors).forEach(function(key){
      if (!fields[key]) return;
      var input = document.getElementById(fields[key]);
      var msg = document.getElementById(fields[key] + 'Error');
      input.setAttribute('aria-invalid', 'true');
      if (msg) { msg.textContent = errors[key]; msg.hidden = false; input.setAttribute('aria-describedby', msg.id); }
      if (!first) first = input.matches('input, select, textarea') ? input : input.querySelector('input');
    });
    if (first) first.focus();
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    clearErrors();
    var payload = { started_at: startedAt, company_website: document.getElementById('laeCompanyWebsite').value, consent: document.getElementById('laeConsent').checked, all_day: allDay.checked, categories: [] };
    ['name', 'description', 'region', 'venue_name', 'start_date', 'end_date', 'start_time', 'end_time', 'schedule_notes', 'event_url', 'organizer_name', 'contact_name', 'contact_email'].forEach(function(key){
      var value = document.getElementById(fields[key]).value.trim();
      if (value) payload[key] = value;
    });
    if (allDay.checked) { delete payload.start_time; delete payload.end_time; }
    Array.prototype.forEach.call(form.querySelectorAll('input[name="categories"]:checked'), function(box){ payload.categories.push(box.value); });
    button.disabled = true;
    button.textContent = 'Submitting...';
    fetch('/api/event-submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(res){ return res.json().catch(function(){ return {}; }).then(function(body){ return { status: res.status, body: body }; }); })
      .then(function(r){
        if (r.status === 201 && r.body.ok) {
          success.textContent = r.body.message || 'Thanks! Your event has been submitted for review. It will not appear on Okanagan Roam until we have reviewed it.';
          success.classList.add('show');
          form.hidden = true;
          success.focus();
          return;
        }
        if (r.body.errors) showErrors(r.body.errors);
        formError.textContent = r.body.error || 'Sorry, something went wrong. Please try again, or email us at okanaganroam@gmail.com.';
        formError.classList.add('show');
      })
      .catch(function(){ formError.textContent = 'Sorry, we could not reach Okanagan Roam. Please check your connection and try again, or email us at okanaganroam@gmail.com.'; formError.classList.add('show'); })
      .then(function(){ button.disabled = false; button.textContent = 'Submit for review'; });
  });
})();
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  // HEAD support (2026-09-19): per RFC 7231 sec. 4.3.2, a HEAD response must
  // have the same status/headers as the equivalent GET, just without a body.
  // Every route below is written as a `method === 'GET'` guard, so rather
  // than duplicating each of those 19 guards we normalize `method` to 'GET'
  // for route-matching purposes and strip the body at the one place all of
  // them funnel through (res.end). Status codes, headers (including
  // Content-Length where a route sets one), redirects, and 404s are
  // therefore identical to GET -- only the body bytes are withheld.
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  if (req.method === 'HEAD') {
    const realEnd = res.end.bind(res);
    res.end = () => realEnd();
  }

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
    //
    // Architecture change (2026-09-17): the homepage and the directory are
    // now two separate presentations of the SAME underlying data/routes --
    // no data was duplicated to make this split. `/` (and its /okanagan.html
    // alias) render ONLY the new curated homepage (hero, mood cards, Hidden
    // Gems, Explore the Okanagan, Happening Soon, Build My Trip) and end at
    // the shared footer. The old "Browse & Search" wizard + results grid +
    // interactive map + "List your venue" form + app teaser -- previously
    // spliced into this same page below the wizard -- are unchanged in
    // every respect (markup, IDs, app.js wiring, data source) but now live
    // at their own URL, /browse, so they're reached via navigation instead
    // of always rendering underneath the new homepage. See /browse below.
    if ((pathname === '/' || pathname === '/okanagan.html') && method === 'GET') {
      if (fs.existsSync(SITE_PATH)) {
        let html = fs.readFileSync(SITE_PATH, 'utf8');
        // Inject real, crawlable internal links to the guide pages so search
        // engines can discover them by following links from the homepage,
        // not just via the sitemap (which some crawlers deprioritize). The
        // markup/links themselves are untouched and identical to what
        // /browse still renders fully visible (see the /browse handler
        // below, which calls renderGuideFooterHTML() directly, unwrapped).
        // Visual-only fix (2026-09-17): this block used to render as a
        // visible "Browse Okanagan Roam by guide" section below the new
        // home-footer, which read as a leftover/second footer to visitors.
        // display:none removes it from layout/paint (zero visible space,
        // can't create overflow, can't sit under the fixed Trip 0 button)
        // while leaving it fully present in the HTML response for crawlers
        // -- still real markup, same links, nothing removed, nothing
        // cloaked (the content genuinely matches what a visitor would see
        // if this div's display were toggled, it's just not shown here by
        // design). Scoped to this one wrapper on the homepage's own
        // `footer` variable only -- renderGuideFooterHTML() itself is
        // untouched, so /browse's copy is completely unaffected.
        const footer = `<div style="display:none">${renderGuideFooterHTML()}</div>`;
        // Open Now removed from the homepage only (2026-09-17) -- see
        // renderOpenNowScript() for why: the homepage has no .venue-card
        // results to filter (those only exist at /browse), so the button
        // had nothing to do there beyond floating on top of the page.
        // /browse's own call site below this one is untouched.
        const openNowScript = renderOpenNowScript({ showButton: false });
        const hiddenElementsScript = renderHiddenElementsScript();

        // Design Sprint 3: homepage discovery modules. Same server-side
        // injection approach as the three pieces above — computed once per
        // request, spliced into a single anchor point right after the hero.
        //
        // Reference redesign (webpage design.png — final section order):
        // Hero -> Mood -> Hidden Gems -> Explore the Okanagan -> Build
        // Your Trip -> footer. Weather banner, Spotlight banner, Featured
        // Venues, and Browse by Category are no longer part of the
        // homepage at all (removed per the approved critical rule against
        // stacking legacy sections underneath the new design) — their
        // markup/functions are otherwise untouched and still independently
        // testable/reusable; they're simply no longer spliced into this
        // page. Happening Soon was removed the same way on 2026-09-17 --
        // events now live at their own destination, /events, linked to
        // from the What's On mood card.
        const discoveryStyles = renderHomepageDiscoveryStyles();
        const moodCards = renderMoodCardsHTML();
        const hiddenGemsSection = renderHiddenGemsHomepageHTML();
        const exploreRegions = renderExploreRegionsHTML();
        const buildTripSection = renderBuildTripCTAHTML();

        const heroToWizardAnchor = '</section>\n\n<section class="filter-bar" id="directory">';
        if (html.includes(heroToWizardAnchor)) {
          html = html.replace(
            heroToWizardAnchor,
            `</section>\n${discoveryStyles}\n${moodCards}\n${hiddenGemsSection}\n${exploreRegions}\n${buildTripSection}\n\n<section class="filter-bar" id="directory">`
          );
        }

        // Remove the old directory UI from the homepage response entirely
        // (not CSS-hidden) -- the wizard, results grid/map, "list your
        // venue" form, and app teaser, in that order, are contiguous in the
        // static template with nothing else between them and <footer>. The
        // exact same markup, IDs, and app.js behavior still render fine at
        // /browse below; only their presence on / is removed here. Slicing
        // out the substring between these two markers is robust to
        // whitespace/comment changes inside those sections (unlike anchoring
        // on their multi-line closing boundaries) and self-documents which
        // four sections are being dropped from this page.
        const oldDirectoryStart = html.indexOf('<section class="filter-bar" id="directory">');
        const footerStart = html.indexOf('<footer>');
        if (oldDirectoryStart !== -1 && footerStart !== -1 && footerStart > oldDirectoryStart) {
          html = html.slice(0, oldDirectoryStart) + html.slice(footerStart);
        }

        // Homepage footer redesign (2026-09-17): swap the static footer
        // (still the one /browse serves, untouched) for the new
        // home-footer-* markup, with its own real hrefs already baked in
        // (/browse, /browse#app, /browse#list-venue, /kelowna, etc.) --
        // see renderHomeFooterHTML() above for why each link is what it is.
        const oldFooterMatch = html.match(/<footer>[\s\S]*?<\/footer>/);
        if (oldFooterMatch) {
          html = html.replace(oldFooterMatch[0], renderHomeFooterHTML());
        }

        // Anything still pointing at the now-removed sections (the header's
        // "Browse & Search" dropdown link and every homepage module's own
        // #directory link) needs to point at /browse instead, since those
        // in-page anchors no longer exist on this page. Done as one final
        // pass over the fully-assembled HTML rather than in each render
        // function, so there's a single place that defines "where the
        // directory now lives." (The old footer's #directory/#app/
        // #list-venue placeholders no longer apply -- the new footer above
        // already has real hrefs.)
        html = html
          .replace(/href="#directory"/g, 'href="/browse"')
          .replace(/href="#app"/g, 'href="/browse#app"')
          .replace(/href="#list-venue"/g, 'href="/browse#list-venue"');

        html = html.includes('</body>')
          ? html.replace('</body>', `${footer}\n${openNowScript}\n${hiddenElementsScript}\n</body>`)
          : html + footer + openNowScript + hiddenElementsScript;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('okanagan.html not found on server');
    }

    // GET /browse — the existing "Browse & Search" wizard, results grid,
    // interactive map, "list your venue" form, and app teaser: the exact
    // same markup/IDs/app.js behavior that used to render directly on the
    // homepage, now reached via navigation instead. Zero data duplication:
    // this serves the SAME okanagan.html template and the SAME client-side
    // rendering (app.js reads from the SAME /api/venues data the homepage's
    // links point into), just without the new curated-homepage sections
    // spliced in above it. Optional query params let homepage links land
    // here pre-filtered: ?q=<text> runs a search, ?types=a,b,c presses the
    // matching wizard type chips, ?openMap=1 opens the interactive map —
    // see renderBrowsePrefillScript() below.
    if (pathname === '/browse' && method === 'GET') {
      // Discovery search (Phase 2): the homepage Hero Search already submits
      // to /browse?q=<text>. With DISCOVERY_SEARCH on, a request carrying ONLY
      // q is interpreted and sent to the existing page that shows exactly that
      // request; anything that cannot be routed safely falls through to the
      // unchanged /browse below. Requests with any other parameter (including
      // the pre-filtered /browse URLs this produces) are never intercepted.
      if (isDiscoverySearchEnabled()) {
        const keys = Object.keys(query);
        if (keys.length === 1 && keys[0] === 'q' && typeof query.q === 'string' && query.q.trim()
          && query.q.length <= discoveryIntentModule().DISCOVERY_MAX_TEXT_LENGTH) {
          const destination = resolveDiscoveryDestination(interpretDiscoveryText(query.q));
          // A single-word text search resolves to /browse?q=<word> -- exactly
          // this request when the visitor already typed just that word. Never
          // redirect a URL to itself; the unchanged /browse search handles it.
          const selfTarget = destination.url === `/browse${discoveryQueryString({ q: query.q })}`;
          if (destination.url && !selfTarget) {
            res.writeHead(302, { Location: destination.url, 'Cache-Control': 'no-store' });
            return res.end();
          }
        }
      }
      if (fs.existsSync(SITE_PATH)) {
        let html = fs.readFileSync(SITE_PATH, 'utf8');

        // /browse redesign harmonization pass (2026-09-18): marks this
        // response so page-scoped CSS can tell it apart from / (same
        // shared template/header/hero markup otherwise) -- currently used
        // to hide the hero's own search box here, since the wizard's
        // identical, fully-functional #searchInput/#searchBtn box already
        // renders immediately below it on this page (the hero box on
        // /browse has only ever been a thin proxy onto that same box --
        // see the heroSearchForm submit handler in app.js -- so hiding it
        // here removes a redundant, visually mismatched duplicate control
        // without touching any actual search behavior).
        html = html.replace('<body class="wizard-active">', '<body class="wizard-active page-browse">');

        // Same broken-anchor problem as the footer fix below, found in the
        // same audit: the shared header's "Discover"/"Things to Do" nav
        // dropdowns link to #moodCards/#hiddenGems/#exploreRegions, which
        // only exist in the DOM on / -- on /browse they're dead links
        // (no scroll, no error, just nothing). #directory/#app/#list-venue
        // are left untouched here because those anchors DO exist on this
        // page. (On /, the mirror-image rewrite already sends #directory/
        // #app/#list-venue to /browse, since those don't exist there.)
        html = html
          .replace(/href="#moodCards"/g, 'href="/#moodCards"')
          .replace(/href="#hiddenGems"/g, 'href="/#hiddenGems"')
          .replace(/href="#exploreRegions"/g, 'href="/#exploreRegions"')
          // The header logo's href="#top" is a real scroll target on / only;
          // here it was a dead anchor. Send it home, as every themed page's
          // renderGolfHeaderHtml() already does.
          .replace(/href="#top"/g, 'href="/"');

        // Footer harmonization: swap the old plain footer (still on the
        // pre-redesign --sand/--plum palette, a hardcoded 4-region list,
        // and the pre-redesign logo) for the same renderHomeFooterHTML()
        // the homepage already uses -- it's already fully i18n-wired and
        // lists all 20 real regions. fromBrowse=true redirects its
        // Beaches/Outdoors/Hidden Gems links to /#exploreRegions and
        // /#hiddenGems instead of the bare in-page anchors those sections
        // only have on / (see renderHomeFooterHTML's own comment).
        const oldFooterMatch = html.match(/<footer>[\s\S]*?<\/footer>/);
        if (oldFooterMatch) {
          html = html.replace(oldFooterMatch[0], renderHomeFooterHTML(true));
        }

        // Bug fix found during the /browse redesign audit: renderHomepage-
        // DiscoveryStyles() -- the <style> block defining .hero-scenic/
        // .hero-title/.hero-search-box (the hero this page shares with /,
        // both rendering from the same static okanagan.html) -- was only
        // ever spliced into /'s own response, never this one. /browse's
        // hero has been rendering completely unstyled (bare h1/p/form,
        // no background image, no layout) this whole time. The same
        // anchor point / already uses (right after the hero's closing
        // </section>, before the wizard) splices it in here too. This
        // style block also defines selectors for homepage-only elements
        // (.mood-card, .discover-section, etc.) that don't exist in this
        // page's DOM -- those rules simply never match anything here,
        // same as any other unused CSS rule, and are otherwise unchanged.
        const heroToWizardAnchor = '</section>\n\n<section class="filter-bar" id="directory">';
        if (html.includes(heroToWizardAnchor)) {
          html = html.replace(
            heroToWizardAnchor,
            `</section>\n${renderHomepageDiscoveryStyles()}\n\n<section class="filter-bar" id="directory">`
          );
        }

        const footer = renderGuideFooterHTML();
        const openNowScript = renderOpenNowScript();
        const hiddenElementsScript = renderHiddenElementsScript();
        const prefillScript = renderBrowsePrefillScript(isDiscoverySearchEnabled());
        html = html.includes('</body>')
          ? html.replace('</body>', `${footer}\n${openNowScript}\n${hiddenElementsScript}\n${prefillScript}\n</body>`)
          : html + footer + openNowScript + hiddenElementsScript + prefillScript;
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
      // lastmod (2026-09-19): individual/aggregate pages now report the real
      // underlying data's updated_at instead of "today" for every URL on
      // every request. toLastmod() takes a SQLite CURRENT_TIMESTAMP string
      // (or the MAX() of several) and reduces it to the YYYY-MM-DD sitemap
      // expects; the `today` fallback only applies if a row somehow has no
      // updated_at at all (every venues/events row has one via its column
      // DEFAULT, so this is a defensive fallback, not the normal path). The
      // homepage and /events index aggregate many records with no single
      // "the" modification date, so those two keep the rolling `today` value.
      const toLastmod = (ts) => (ts ? String(ts).slice(0, 10) : today);
      const combos = listGuideCombos(MIN_GUIDE_VENUES).map((combo) => ({
        ...combo,
        lastmod: toLastmod(
          db
            .prepare(`SELECT MAX(updated_at) AS m FROM venues WHERE region = ? AND ${combo.badge} = 1 AND redirect_to IS NULL`)
            .get(combo.region).m
        ),
      }));

      // Region pages: one per region that has at least one venue.
      const regionCounts = db
        .prepare('SELECT region, COUNT(*) AS n, MAX(updated_at) AS lastmod FROM venues WHERE redirect_to IS NULL GROUP BY region')
        .all()
        .filter((r) => REGION_LABELS[r.region] && r.n > 0);

      // Category pages: one per region+type combo that has at least one
      // venue — computed live, same pattern as the guide-page combos above.
      const categoryCombos = db
        .prepare('SELECT region, type, COUNT(*) AS n, MAX(updated_at) AS lastmod FROM venues WHERE redirect_to IS NULL GROUP BY region, type')
        .all()
        .filter((r) => REGION_LABELS[r.region] && CATEGORY_SLUGS[r.type] && r.n > 0);

      // Venue pages: every venue that has a real, non-null slug (should be
      // all of them after the startup backfill, but this guards against any
      // edge case rather than emitting a broken sitemap entry).
      const venueRows = db
        .prepare('SELECT region, type, slug, updated_at FROM venues WHERE slug IS NOT NULL AND redirect_to IS NULL')
        .all()
        .filter((v) => REGION_LABELS[v.region] && CATEGORY_SLUGS[v.type]);

      const urlEntries = [
        `  <url>\n    <loc>https://okanaganroam.com/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
        // Valley-wide landing hubs (2026-09-22). All four are already live,
        // self-canonical and indexable; /whats-on is the only internal parent
        // of every event detail URL below, so it belongs in the sitemap too.
        `  <url>\n    <loc>https://okanaganroam.com/whats-on</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/outdoors</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/golf</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/beaches</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/wineries</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/food-drink</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/dog-friendly</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        ...(getLocalFavouriteVenues().length >= MIN_CATEGORY_VENUES
          ? [`  <url>\n    <loc>https://okanaganroam.com/local-favorites</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`]
          : []),
        `  <url>\n    <loc>https://okanaganroam.com/destinations</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
        ...(getSecretSpotVenues().length >= MIN_CATEGORY_VENUES
          ? [`  <url>\n    <loc>https://okanaganroam.com/secret-spots</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`]
          : []),
        ...regionCounts.map(
          ({ region, lastmod }) =>
            `  <url>\n    <loc>https://okanaganroam.com/${region}</loc>\n    <lastmod>${toLastmod(lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
        ),
        ...categoryCombos.map(
          ({ region, type, lastmod }) =>
            `  <url>\n    <loc>https://okanaganroam.com/${region}/${CATEGORY_SLUGS[type]}</loc>\n    <lastmod>${toLastmod(lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
        ),
        ...combos.map(
          ({ region, badge, lastmod }) =>
            `  <url>\n    <loc>https://okanaganroam.com/guide/${region}/${badge}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
        ),
        // Outdoors Phase 2: activity pages, only those that actually render
        // (same MIN_ACTIVITY_VENUES gate as the route).
        ...listLiveOutdoorActivities().map(
          ({ slug }) =>
            `  <url>\n    <loc>https://okanaganroam.com/outdoors/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
        ),
        ...venueRows.map(
          ({ region, type, slug, updated_at }) =>
            `  <url>\n    <loc>https://okanaganroam.com/${region}/${CATEGORY_SLUGS[type]}/${slug}</loc>\n    <lastmod>${toLastmod(updated_at)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
        ),
        // Phase 1 (Events architecture gate): only non-expired events —
        // listEventsForSitemap() already applies the same "don't advertise
        // dead pages" filtering the venue rows above get via redirect_to.
        ...listEventsForSitemap()
          .filter((e) => REGION_LABELS[e.region])
          .map(
            ({ region, slug, updated_at }) =>
              `  <url>\n    <loc>https://okanaganroam.com/${region}/events/${slug}</loc>\n    <lastmod>${toLastmod(updated_at)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
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

    // Phase 5 Sprint 1 — shared static assets. These three files are the
    // extracted, single-source-of-truth CSS/JS that both the SPA
    // (okanagan.html, via <link>/<script src>) and the server-rendered SEO
    // pages (via pageHead()'s tokens.css <link>) now depend on. Served the
    // same simple way as og-image.png above: read from disk, no build step,
    // no bundler. Cached for an hour rather than a day (unlike og-image.png)
    // since these are actively being iterated on during Phase 5.
    const STATIC_ASSETS = {
      '/styles/tokens.css': { file: 'public/styles/tokens.css', type: 'text/css; charset=utf-8' },
      '/styles/app.css': { file: 'public/styles/app.css', type: 'text/css; charset=utf-8' },
      '/scripts/app.js': { file: 'public/scripts/app.js', type: 'application/javascript; charset=utf-8' },
    };
    if (STATIC_ASSETS[pathname] && method === 'GET') {
      const asset = STATIC_ASSETS[pathname];
      const assetPath = path.join(__dirname, asset.file);
      if (fs.existsSync(assetPath)) {
        const body = fs.readFileSync(assetPath, 'utf8');
        res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'public, max-age=3600' });
        return res.end(body);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end(`${pathname} not found on server`);
    }

    // Milestone 1 (approved homepage redesign) — GET /images/*. The first
    // static-serving route for homepage photography on this codebase (the
    // old hero carousel embedded its images as inline base64 data URIs in
    // okanagan.html instead). Deliberately narrow and safe rather than a
    // generic static-file server: resolves the requested path against a
    // fixed base directory and rejects anything that resolves outside it
    // (blocks ../ traversal and absolute-path tricks alike), and only
    // serves a small allowlisted set of image extensions — a request for
    // any other file under public/images/, or any file outside it, 404s.
    const IMAGE_EXTENSIONS = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    };
    if (pathname.startsWith('/images/') && method === 'GET') {
      const imagesRoot = path.join(__dirname, 'public/images');
      const requestedPath = path.join(imagesRoot, pathname.slice('/images/'.length));
      const ext = path.extname(requestedPath).toLowerCase();
      const contentType = IMAGE_EXTENSIONS[ext];
      const isWithinImagesRoot = requestedPath === imagesRoot
        || requestedPath.startsWith(imagesRoot + path.sep);
      if (contentType && isWithinImagesRoot && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
        const body = fs.readFileSync(requestedPath);
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' });
        return res.end(body);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end(`${pathname} not found on server`);
    }

    // GET /guide/:region/:badge — server-rendered SEO landing page.
    const guideMatch = pathname.match(/^\/guide\/([a-z-]+)\/([a-z_]+)\/?$/);
    if (guideMatch && method === 'GET') {
      const region = guideMatch[1];
      const badge = guideMatch[2];
      if (REGION_LABELS[region] && BOOL_FIELDS.includes(badge)) {
        const rows = db
          .prepare(`SELECT * FROM venues WHERE region = ? AND ${badge} = 1 AND redirect_to IS NULL ORDER BY reviews DESC`)
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

    // POST /admin/enrich-venue
    //
    // The ONLY invocation path for guardedEnrichUpdate(). Deliberately
    // narrow: one venue per call, exactly three allowed fields, no read
    // functionality beyond confirming what was actually written, no path
    // to updateVenue() or any other write function, no arbitrary SQL or
    // column names possible (the three field names are hardcoded below,
    // never taken from the request).
    if (pathname === '/admin/enrich-venue' && method === 'POST') {
      // Fail CLOSED if the secret isn't configured — never fall back to
      // an unauthenticated or default-permitted state.
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Enrichment endpoint is not configured.' });
      }

      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      // --- id validation ---
      const id = body.id;
      if (!Number.isInteger(id) || id <= 0) {
        return sendJSON(res, 400, { error: 'id must be a positive integer.' });
      }

      // --- allowlist validation: reject the WHOLE request if any
      // unexpected key is present, rather than silently ignoring it ---
      const ALLOWED_ENRICH_KEYS = ['id', 'address', 'latitude', 'longitude'];
      const unexpectedKeys = Object.keys(body).filter((k) => !ALLOWED_ENRICH_KEYS.includes(k));
      if (unexpectedKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedKeys.join(', ')}` });
      }

      const hasAddress = body.address !== undefined;
      const hasLat = body.latitude !== undefined;
      const hasLng = body.longitude !== undefined;
      if (!hasAddress && !hasLat && !hasLng) {
        return sendJSON(res, 400, { error: 'At least one of address, latitude, longitude is required.' });
      }

      // --- per-field validation, no silent coercion ---
      if (hasAddress && (typeof body.address !== 'string' || body.address.trim() === '')) {
        return sendJSON(res, 400, { error: 'address must be a non-empty string.' });
      }
      // Okanagan Valley sanity bounds, deliberately tighter than global
      // lat/long ranges — this app only ever covers this one region, so a
      // coordinate outside this box is almost certainly wrong data, not a
      // legitimate edge case.
      const OKANAGAN_LAT_RANGE = [48.5, 51.0];
      const OKANAGAN_LNG_RANGE = [-121.0, -118.0];
      if (hasLat) {
        if (typeof body.latitude !== 'number' || !Number.isFinite(body.latitude)) {
          return sendJSON(res, 400, { error: 'latitude must be a finite number.' });
        }
        if (body.latitude < OKANAGAN_LAT_RANGE[0] || body.latitude > OKANAGAN_LAT_RANGE[1]) {
          return sendJSON(res, 400, { error: 'latitude is outside the expected Okanagan range.' });
        }
      }
      if (hasLng) {
        if (typeof body.longitude !== 'number' || !Number.isFinite(body.longitude)) {
          return sendJSON(res, 400, { error: 'longitude must be a finite number.' });
        }
        if (body.longitude < OKANAGAN_LNG_RANGE[0] || body.longitude > OKANAGAN_LNG_RANGE[1]) {
          return sendJSON(res, 400, { error: 'longitude is outside the expected Okanagan range.' });
        }
      }

      // Build the payload for guardedEnrichUpdate() using ONLY the three
      // hardcoded field names below — the request body's keys are never
      // used as column names, so arbitrary-column injection is not
      // possible through this path regardless of what a caller sends.
      const enrichData = {};
      if (hasAddress) enrichData.address = body.address;
      if (hasLat) enrichData.latitude = body.latitude;
      if (hasLng) enrichData.longitude = body.longitude;

      const result = guardedEnrichUpdate(id, enrichData);
      if (!result.found) {
        return sendJSON(res, 404, { error: 'Venue not found.' });
      }
      return sendJSON(res, 200, { id, results: result.results });
    }

    // POST /admin/correct-venue
    //
    // A separate, narrowly-scoped path for correcting address/latitude/
    // longitude that were already populated (typically incorrectly) by a
    // prior enrichment. Does not alter /admin/enrich-venue in any way --
    // entirely separate function, entirely separate route. Reuses the
    // exact same bearer-token check as /admin/enrich-venue.
    if (pathname === '/admin/correct-venue' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Correction endpoint is not configured.' });
      }

      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      // --- allowlist validation: reject the WHOLE request if any
      // unexpected top-level key is present ---
      const ALLOWED_CORRECT_KEYS = ['id', 'expected_current', 'corrected', 'reason', 'batch_id'];
      const unexpectedKeys = Object.keys(body).filter((k) => !ALLOWED_CORRECT_KEYS.includes(k));
      if (unexpectedKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedKeys.join(', ')}` });
      }

      // --- required top-level fields ---
      const id = body.id;
      if (!Number.isInteger(id) || id <= 0) {
        return sendJSON(res, 400, { error: 'id must be a positive integer.' });
      }
      if (typeof body.reason !== 'string' || body.reason.trim() === '') {
        return sendJSON(res, 400, { error: 'reason is required and must be a non-empty string.' });
      }
      if (typeof body.batch_id !== 'string' || body.batch_id.trim() === '') {
        return sendJSON(res, 400, { error: 'batch_id is required and must be a non-empty string.' });
      }
      if (typeof body.expected_current !== 'object' || body.expected_current === null || Array.isArray(body.expected_current)) {
        return sendJSON(res, 400, { error: 'expected_current is required and must be an object.' });
      }
      if (typeof body.corrected !== 'object' || body.corrected === null || Array.isArray(body.corrected)) {
        return sendJSON(res, 400, { error: 'corrected is required and must be an object.' });
      }

      // --- expected_current and corrected must each contain exactly
      // address, latitude, longitude -- no more, no less ---
      const REQUIRED_SUBFIELDS = ['address', 'latitude', 'longitude'];
      for (const [label, obj] of [['expected_current', body.expected_current], ['corrected', body.corrected]]) {
        const keys = Object.keys(obj);
        const missing = REQUIRED_SUBFIELDS.filter((f) => !(f in obj));
        const extra = keys.filter((k) => !REQUIRED_SUBFIELDS.includes(k));
        if (missing.length > 0) {
          return sendJSON(res, 400, { error: `${label} is missing required field(s): ${missing.join(', ')}` });
        }
        if (extra.length > 0) {
          return sendJSON(res, 400, { error: `${label} has unexpected field(s): ${extra.join(', ')}` });
        }
      }

      // --- per-field validation on the CORRECTED values, reusing the
      // exact same rules and bounds as /admin/enrich-venue ---
      const { address, latitude, longitude } = body.corrected;
      if (typeof address !== 'string' || address.trim() === '') {
        return sendJSON(res, 400, { error: 'corrected.address must be a non-empty string.' });
      }
      const OKANAGAN_LAT_RANGE = [48.5, 51.0];
      const OKANAGAN_LNG_RANGE = [-121.0, -118.0];
      if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
        return sendJSON(res, 400, { error: 'corrected.latitude must be a finite number.' });
      }
      if (latitude < OKANAGAN_LAT_RANGE[0] || latitude > OKANAGAN_LAT_RANGE[1]) {
        return sendJSON(res, 400, { error: 'corrected.latitude is outside the expected Okanagan range.' });
      }
      if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
        return sendJSON(res, 400, { error: 'corrected.longitude must be a finite number.' });
      }
      if (longitude < OKANAGAN_LNG_RANGE[0] || longitude > OKANAGAN_LNG_RANGE[1]) {
        return sendJSON(res, 400, { error: 'corrected.longitude is outside the expected Okanagan range.' });
      }

      // --- basic shape validation on expected_current (values are
      // whatever the live row's current values are, so we only check
      // types here -- the atomic UPDATE's WHERE clause is what actually
      // verifies correctness against the live row) ---
      const ec = body.expected_current;
      if (ec.address !== null && typeof ec.address !== 'string') {
        return sendJSON(res, 400, { error: 'expected_current.address must be a string or null.' });
      }
      if (ec.latitude !== null && typeof ec.latitude !== 'number') {
        return sendJSON(res, 400, { error: 'expected_current.latitude must be a number or null.' });
      }
      if (ec.longitude !== null && typeof ec.longitude !== 'number') {
        return sendJSON(res, 400, { error: 'expected_current.longitude must be a number or null.' });
      }

      let result;
      try {
        result = guardedCorrectUpdate(
          id,
          { address: ec.address, latitude: ec.latitude, longitude: ec.longitude },
          { address, latitude, longitude },
          { reason: body.reason, batch_id: body.batch_id, reviewed_by: null }
        );
      } catch (err) {
        // Any failure inside the transaction (including a failed audit-
        // log insert) rolls back the venue update too -- report a clean
        // 500 rather than leaving ambiguity about what was persisted.
        return sendJSON(res, 500, { error: 'Correction failed and was rolled back.', detail: String(err.message || err) });
      }

      if (!result.found) {
        return sendJSON(res, 404, { error: 'Venue not found.' });
      }
      if (result.mismatch) {
        return sendJSON(res, 409, {
          error: 'expected_current did not match the live venue record; no changes were made.',
          live: { address: result.live.address, latitude: result.live.latitude, longitude: result.live.longitude },
        });
      }
      return sendJSON(res, 200, {
        id,
        changedFields: result.changedFields,
        venue: { address: result.venue.address, latitude: result.venue.latitude, longitude: result.venue.longitude },
      });
    }

    // POST /admin/retire-duplicate
    //
    // Sets redirect_to on a duplicate venue. Reuses the exact same
    // bearer-token check as /admin/enrich-venue and /admin/correct-venue.
    // Scoped for the 2.8D canary: accepts exactly {duplicate_id,
    // canonical_id} and nothing else.
    if (pathname === '/admin/retire-duplicate' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Retire-duplicate endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      const ALLOWED_KEYS = ['duplicate_id', 'canonical_id'];
      const unexpected = Object.keys(body).filter((k) => !ALLOWED_KEYS.includes(k));
      if (unexpected.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpected.join(', ')}` });
      }
      const duplicateId = body.duplicate_id;
      const canonicalId = body.canonical_id;
      if (!Number.isInteger(duplicateId) || duplicateId <= 0) {
        return sendJSON(res, 400, { error: 'duplicate_id must be a positive integer.' });
      }
      if (!Number.isInteger(canonicalId) || canonicalId <= 0) {
        return sendJSON(res, 400, { error: 'canonical_id must be a positive integer.' });
      }

      let result;
      try {
        result = guardedRetireUpdate(duplicateId, canonicalId);
      } catch (err) {
        return sendJSON(res, 500, { error: 'Retire operation failed and was rolled back.', detail: String(err.message || err) });
      }

      if (!result.ok) {
        const statusMap = {
          self_redirect: 400,
          duplicate_not_found: 404,
          canonical_not_found: 404,
          duplicate_already_redirected: 409,
          canonical_is_itself_a_duplicate: 409,
          duplicate_is_a_canonical_for_others: 409,
          precondition_changed_mid_write: 409,
        };
        return sendJSON(res, statusMap[result.reason] || 400, { error: result.reason, detail: result });
      }
      return sendJSON(res, 200, { duplicate_id: duplicateId, canonical_id: canonicalId, venue: result.venue });
    }

    // POST /admin/correct-region
    //
    // A dedicated, standalone endpoint for the single-field region
    // correction case. Deliberately NOT part of /admin/correct-venue --
    // see guardedRegionCorrectUpdate()'s comment for why. Accepts exactly
    // {id, expected_current_region, corrected_region} and nothing else.
    if (pathname === '/admin/correct-region' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Correct-region endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      const ALLOWED_KEYS = ['id', 'expected_current_region', 'corrected_region'];
      const unexpected = Object.keys(body).filter((k) => !ALLOWED_KEYS.includes(k));
      if (unexpected.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpected.join(', ')}` });
      }
      const id = body.id;
      const expectedCurrentRegion = body.expected_current_region;
      const correctedRegion = body.corrected_region;
      if (!Number.isInteger(id) || id <= 0) {
        return sendJSON(res, 400, { error: 'id must be a positive integer.' });
      }
      if (typeof expectedCurrentRegion !== 'string' || expectedCurrentRegion.length === 0) {
        return sendJSON(res, 400, { error: 'expected_current_region must be a non-empty string.' });
      }
      if (typeof correctedRegion !== 'string' || correctedRegion.length === 0) {
        return sendJSON(res, 400, { error: 'corrected_region must be a non-empty string.' });
      }

      let result;
      try {
        result = guardedRegionCorrectUpdate(id, expectedCurrentRegion, correctedRegion);
      } catch (err) {
        return sendJSON(res, 500, { error: 'Region correction failed.', detail: String(err.message || err) });
      }

      if (!result.ok) {
        const statusMap = {
          invalid_region_value: 400,
          venue_not_found: 404,
          precondition_failed_region_mismatch: 409,
          unexpected_multi_row_match: 500,
        };
        return sendJSON(res, statusMap[result.reason] || 400, { error: result.reason, detail: result });
      }
      return sendJSON(res, 200, { id, noop: result.noop, venue: result.venue });
    }

    // POST /admin/correct-phone
    //
    // A separate, narrowly-scoped path for correcting an already-populated
    // (typically incorrect) phone number -- e.g. a value copied from the
    // wrong branch/location of a chain during scraping. Does not alter
    // /admin/enrich-venue, /admin/correct-venue, /admin/correct-region,
    // /admin/retire-duplicate, or /admin/merge-and-retire-duplicate in any
    // way. Reuses the exact same bearer-token check as every other admin
    // endpoint.
    // POST /admin/collection-membership
    //
    // Adds or removes one venue from one editorial collection (Hidden Gem,
    // Local Favourite, ...) with an audit row -- the only write path for
    // badge membership, so badges never need a code edit again. Same
    // bearer-token check and strict key allowlist as every admin route.
    if (pathname === '/admin/collection-membership' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Collection-membership endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      const ALLOWED_MEMBERSHIP_KEYS = ['kind', 'venue_id', 'action', 'note', 'reason', 'batch_id'];
      const unexpectedMembershipKeys = Object.keys(body).filter((k) => !ALLOWED_MEMBERSHIP_KEYS.includes(k));
      if (unexpectedMembershipKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedMembershipKeys.join(', ')}` });
      }
      if (typeof body.kind !== 'string' || !/^[a-z_]+$/.test(body.kind)) {
        return sendJSON(res, 400, { error: 'kind is required and must be a lowercase collection kind (e.g. hidden_gem, local_favorite).' });
      }
      if (!Number.isInteger(body.venue_id) || body.venue_id <= 0) {
        return sendJSON(res, 400, { error: 'venue_id must be a positive integer.' });
      }
      if (body.action !== 'add' && body.action !== 'remove') {
        return sendJSON(res, 400, { error: "action must be 'add' or 'remove'." });
      }
      if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
        return sendJSON(res, 400, { error: 'note must be a string when provided.' });
      }
      if (typeof body.reason !== 'string' || body.reason.trim() === '') {
        return sendJSON(res, 400, { error: 'reason is required and must be a non-empty string.' });
      }
      if (typeof body.batch_id !== 'string' || body.batch_id.trim() === '') {
        return sendJSON(res, 400, { error: 'batch_id is required and must be a non-empty string.' });
      }

      let result;
      try {
        result = guardedCollectionMembershipUpdate(
          body.kind,
          body.venue_id,
          body.action,
          typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : null,
          { reason: body.reason.trim(), batch_id: body.batch_id.trim(), reviewed_by: null }
        );
      } catch (err) {
        return sendJSON(res, 500, { error: 'Membership change failed and was rolled back.', detail: String(err.message || err) });
      }
      if (!result.ok) {
        const statusMap = { unknown_kind: 400, venue_not_found: 404, venue_redirected: 409, already_member: 409, not_member: 409 };
        return sendJSON(res, statusMap[result.reason] || 400, { error: result.reason });
      }
      return sendJSON(res, 200, result);
    }

    if (pathname === '/admin/correct-phone' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Correct-phone endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      // --- allowlist validation: reject the WHOLE request if any
      // unexpected top-level key is present ---
      const ALLOWED_CORRECT_PHONE_KEYS = ['id', 'expected_current_phone', 'corrected_phone', 'reason', 'batch_id'];
      const unexpectedPhoneKeys = Object.keys(body).filter((k) => !ALLOWED_CORRECT_PHONE_KEYS.includes(k));
      if (unexpectedPhoneKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedPhoneKeys.join(', ')}` });
      }

      const id = body.id;
      if (!Number.isInteger(id) || id <= 0) {
        return sendJSON(res, 400, { error: 'id must be a positive integer.' });
      }
      if (typeof body.reason !== 'string' || body.reason.trim() === '') {
        return sendJSON(res, 400, { error: 'reason is required and must be a non-empty string.' });
      }
      if (typeof body.batch_id !== 'string' || body.batch_id.trim() === '') {
        return sendJSON(res, 400, { error: 'batch_id is required and must be a non-empty string.' });
      }
      if (!('expected_current_phone' in body)) {
        return sendJSON(res, 400, { error: 'expected_current_phone is required.' });
      }
      const expectedCurrentPhone = body.expected_current_phone;
      if (expectedCurrentPhone !== null && typeof expectedCurrentPhone !== 'string') {
        return sendJSON(res, 400, { error: 'expected_current_phone must be a string or null.' });
      }
      if (typeof body.corrected_phone !== 'string' || body.corrected_phone.trim() === '') {
        return sendJSON(res, 400, { error: 'corrected_phone must be a non-empty string.' });
      }
      // Trim once here -- the TRIMMED value is both what gets validated for
      // emptiness above (via .trim() === '') and what actually gets stored,
      // so a caller can't accidentally persist leading/trailing whitespace.
      const correctedPhone = body.corrected_phone.trim();

      let result;
      try {
        result = guardedPhoneCorrectUpdate(id, expectedCurrentPhone, correctedPhone, {
          reason: body.reason,
          batch_id: body.batch_id,
          reviewed_by: null,
        });
      } catch (err) {
        return sendJSON(res, 500, { error: 'Phone correction failed and was rolled back.', detail: String(err.message || err) });
      }

      if (!result.found) {
        return sendJSON(res, 404, { error: 'Venue not found.' });
      }
      if (result.mismatch) {
        return sendJSON(res, 409, {
          error: 'expected_current_phone did not match the live venue record; no changes were made.',
          live: { phone: result.live.phone },
        });
      }
      return sendJSON(res, 200, {
        id,
        changed: result.changed,
        venue: { phone: result.venue.phone },
      });
    }

    // POST /admin/correct-amenities
    //
    // Scoped to the Phase 2.9 need: carrying verified-true amenity flags
    // (vegan/vegetarian/patio/gluten_free) from a duplicate onto a
    // canonical venue, independent of a merge-and-retire call, since these
    // four fields are outside MERGEABLE_FIELDS and cannot be written by
    // /admin/merge-and-retire-duplicate (see guardedAmenityCorrectUpdate()'s
    // comment for why). Reuses the exact same bearer-token check as every
    // other admin endpoint. Does not alter /admin/merge-and-retire-duplicate,
    // MERGEABLE_FIELDS, or any other guarded route in any way.
    if (pathname === '/admin/correct-amenities' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Correct-amenities endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      // --- allowlist validation: reject the WHOLE request if any
      // unexpected top-level key is present ---
      const ALLOWED_AMENITY_KEYS = ['id', 'fields', 'reason', 'batch_id'];
      const unexpectedTopKeys = Object.keys(body).filter((k) => !ALLOWED_AMENITY_KEYS.includes(k));
      if (unexpectedTopKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedTopKeys.join(', ')}` });
      }

      const id = body.id;
      if (!Number.isInteger(id) || id <= 0) {
        return sendJSON(res, 400, { error: 'id must be a positive integer.' });
      }
      if (typeof body.reason !== 'string' || body.reason.trim() === '') {
        return sendJSON(res, 400, { error: 'reason is required and must be a non-empty string.' });
      }
      if (typeof body.batch_id !== 'string' || body.batch_id.trim() === '') {
        return sendJSON(res, 400, { error: 'batch_id is required and must be a non-empty string.' });
      }

      const fields = body.fields;
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        return sendJSON(res, 400, { error: 'fields must be an object.' });
      }
      const providedFieldKeys = Object.keys(fields);
      if (providedFieldKeys.length === 0) {
        return sendJSON(res, 400, { error: 'fields must contain at least one amenity field.' });
      }
      // Field NAMES are never taken from the request body beyond this
      // allowlist check -- guardedAmenityCorrectUpdate() itself only ever
      // iterates AMENITY_GUARDED_FIELDS, never Object.keys(fieldValues), so
      // arbitrary-column writes are structurally impossible even if this
      // check were somehow bypassed.
      const unexpectedFieldKeys = providedFieldKeys.filter((k) => !AMENITY_GUARDED_FIELDS.includes(k));
      if (unexpectedFieldKeys.length > 0) {
        return sendJSON(res, 400, {
          error: `Unexpected amenity field(s): ${unexpectedFieldKeys.join(', ')}`,
          allowed: AMENITY_GUARDED_FIELDS,
        });
      }
      const fieldValues = {};
      for (const key of providedFieldKeys) {
        const entry = fields[key];
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          return sendJSON(res, 400, { error: `fields.${key} must be an object with expected_current and corrected.` });
        }
        if (typeof entry.expected_current !== 'boolean') {
          return sendJSON(res, 400, { error: `fields.${key}.expected_current must be a boolean.` });
        }
        if (typeof entry.corrected !== 'boolean') {
          return sendJSON(res, 400, { error: `fields.${key}.corrected must be a boolean.` });
        }
        fieldValues[key] = { expectedCurrent: entry.expected_current, corrected: entry.corrected };
      }

      let result;
      try {
        result = guardedAmenityCorrectUpdate(id, fieldValues, {
          reason: body.reason,
          batch_id: body.batch_id,
          reviewed_by: null,
        });
      } catch (err) {
        return sendJSON(res, 500, { error: 'Amenity correction failed and was rolled back.', detail: String(err.message || err) });
      }

      if (!result.found) {
        return sendJSON(res, 404, { error: 'Venue not found.' });
      }

      return sendJSON(res, 200, {
        id,
        results: result.results,
        venue: {
          vegan: result.venue.vegan,
          vegetarian: result.venue.vegetarian,
          patio: result.venue.patio,
          gluten_free: result.venue.gluten_free,
        },
      });
    }

    // POST /admin/merge-and-retire-duplicate
    //
    // Scoped for the 944->210 case: transfers an explicit, hardcoded set
    // of null-vs-value fields (MERGEABLE_FIELDS) onto the canonical in
    // the SAME transaction as setting redirect_to on the duplicate.
    // Reuses the exact same bearer-token check as every other admin
    // endpoint. Does not alter /admin/enrich-venue, /admin/correct-venue,
    // or /admin/retire-duplicate in any way.
    if (pathname === '/admin/merge-and-retire-duplicate' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Merge-and-retire endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      const ALLOWED_KEYS = ['duplicate_id', 'canonical_id', 'fields'];
      const unexpected = Object.keys(body).filter((k) => !ALLOWED_KEYS.includes(k));
      if (unexpected.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpected.join(', ')}` });
      }
      const duplicateId = body.duplicate_id;
      const canonicalId = body.canonical_id;
      const fields = body.fields;
      if (!Number.isInteger(duplicateId) || duplicateId <= 0) {
        return sendJSON(res, 400, { error: 'duplicate_id must be a positive integer.' });
      }
      if (!Number.isInteger(canonicalId) || canonicalId <= 0) {
        return sendJSON(res, 400, { error: 'canonical_id must be a positive integer.' });
      }
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        return sendJSON(res, 400, { error: 'fields must be an object.' });
      }

      let result;
      try {
        result = guardedMergeAndRetireUpdate(duplicateId, canonicalId, fields);
      } catch (err) {
        return sendJSON(res, 500, { error: 'Merge-and-retire failed and was rolled back.', detail: String(err.message || err) });
      }

      if (!result.ok) {
        const statusMap = {
          self_redirect: 400,
          no_merge_fields_provided: 400,
          unexpected_merge_fields: 400,
          missing_merge_fields: 400,
          duplicate_not_found: 404,
          canonical_not_found: 404,
          duplicate_already_redirected: 409,
          canonical_is_itself_a_duplicate: 409,
          duplicate_is_a_canonical_for_others: 409,
          canonical_field_not_null: 409,
          canonical_precondition_changed_mid_write: 409,
          duplicate_precondition_changed_mid_write: 409,
        };
        return sendJSON(res, statusMap[result.reason] || 400, { error: result.reason, detail: result });
      }
      return sendJSON(res, 200, { duplicate_id: duplicateId, canonical_id: canonicalId, merged_fields: result.mergedFields, canonical: result.canonical, duplicate: result.duplicate });
    }

    // ---------- What's On, Step 4 (2026-09-22): event read/write API ----------
    //
    // Writes: the same bearer guard every other write route uses
    // (ENRICHMENT_ADMIN_TOKEN, 503 fail-closed when unset, timing-safe 401),
    // strict key allow-lists, then the Step 3 guarded writers -- the route
    // layer never validates business rules itself, never touches tables and
    // never logs a header. Reads: public, no auth, exactly the What's On
    // card fields (see whatsOnPublicEvent) plus the resolved window.
    if (pathname === '/api/events' || /^\/api\/events\/\d+(\/(categories|occurrences(\/\d+)?))?$/.test(pathname)) {
      const eventRouteMatch = pathname.match(/^\/api\/events(?:\/(\d+)(?:\/(categories|occurrences)(?:\/(\d+))?)?)?$/);
      const eventId = eventRouteMatch && eventRouteMatch[1] ? parseInt(eventRouteMatch[1], 10) : null;
      const subResource = eventRouteMatch ? eventRouteMatch[2] || null : null;
      const occurrenceId = eventRouteMatch && eventRouteMatch[3] ? parseInt(eventRouteMatch[3], 10) : null;
      const isWrite = method !== 'GET' && method !== 'HEAD';

      if (isWrite) {
        if (!ENRICHMENT_ADMIN_TOKEN) {
          return sendJSON(res, 503, { error: 'Event write endpoints are not configured.' });
        }
        const authHeader = req.headers['authorization'] || '';
        const match = /^Bearer (.+)$/.exec(authHeader);
        if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
          return sendJSON(res, 401, { error: 'Unauthorized.' });
        }
        let body;
        try {
          body = await readBody(req);
        } catch (err) {
          return sendJSON(res, 400, { error: 'Malformed JSON body.' });
        }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          return sendJSON(res, 400, { error: 'Body must be a JSON object.' });
        }
        const unexpectedKeys = (allowed) => Object.keys(body).filter((k) => !allowed.includes(k));
        const rejectUnexpected = (allowed) => {
          const unexpected = unexpectedKeys(allowed);
          if (!unexpected.length) return false;
          sendJSON(res, 400, { error: `Unexpected field(s): ${unexpected.join(', ')}` });
          return true;
        };
        const metaFromBody = () => ({
          reason: body.reason, batch_id: body.batch_id, reviewed_by: body.reviewed_by,
          reviewed_duplicates: body.reviewed_duplicates, event_status: body.event_status,
        });
        const respond = (result, successStatus = 200) => {
          if (result.ok) return sendJSON(res, successStatus, result);
          return sendJSON(res, EVENT_WRITE_STATUS_MAP[result.reason] || 400, { error: result.reason, detail: result.detail });
        };
        try {
          if (pathname === '/api/events' && method === 'POST') {
            if (rejectUnexpected([...EVENT_CREATE_FIELDS, ...EVENT_META_KEYS])) return;
            const data = {};
            for (const k of EVENT_CREATE_FIELDS) if (Object.prototype.hasOwnProperty.call(body, k)) data[k] = body[k];
            return respond(createEvent(data, metaFromBody()), 201);
          }
          if (eventId !== null && subResource === null && method === 'PUT') {
            if (rejectUnexpected([...EVENT_UPDATE_FIELDS, ...EVENT_META_KEYS])) return;
            const data = {};
            for (const k of EVENT_UPDATE_FIELDS) if (Object.prototype.hasOwnProperty.call(body, k)) data[k] = body[k];
            return respond(updateEvent(eventId, data, metaFromBody()));
          }
          if (eventId !== null && subResource === 'categories' && occurrenceId === null && method === 'PUT') {
            if (rejectUnexpected(['categories', ...EVENT_META_KEYS])) return;
            return respond(replaceEventCategories(eventId, body.categories, metaFromBody()));
          }
          if (eventId !== null && subResource === 'occurrences' && occurrenceId === null && method === 'POST') {
            if (rejectUnexpected(['occurrences', ...EVENT_META_KEYS])) return;
            return respond(upsertEventOccurrences(eventId, body.occurrences, metaFromBody()));
          }
          if (eventId !== null && subResource === 'occurrences' && occurrenceId !== null && method === 'PATCH') {
            if (rejectUnexpected(['status', ...EVENT_META_KEYS])) return;
            return respond(setEventOccurrenceStatus(eventId, occurrenceId, body.status, metaFromBody()));
          }
        } catch (err) {
          // Writers roll back before rethrowing; surface a plain message,
          // never the request (which would carry the Authorization header).
          return sendJSON(res, 500, { error: 'Event write failed and was rolled back.', detail: String(err.message || err) });
        }
        return sendJSON(res, 405, { error: 'Method not allowed.' });
      }

      // ---- public reads (no auth) ----
      if (pathname === '/api/events' && method === 'GET') {
        return sendJSON(res, 200, listWhatsOnEventsPublic(query));
      }
      if (eventId !== null && subResource === null && method === 'GET') {
        const event = getEventById(eventId);
        if (!event) return sendJSON(res, 404, { error: 'Event not found' });
        // A valid bearer token unlocks the full stored record (source
        // fields, confidence, every occurrence incl. cancelled) so the
        // executor can verify its own writes field by field; a token that
        // is absent or wrong is simply ignored and the public shape is
        // returned -- it never produces an error that could probe the guard.
        const authHeader = req.headers['authorization'] || '';
        const bearer = /^Bearer (.+)$/.exec(authHeader);
        const verified = !!(ENRICHMENT_ADMIN_TOKEN && bearer && safeTokenEquals(bearer[1], ENRICHMENT_ADMIN_TOKEN));
        if (verified) {
          return sendJSON(res, 200, { event, categories: getEventCategoryKeys(eventId), occurrences: listEventOccurrences(eventId) });
        }
        return sendJSON(res, 200, whatsOnPublicEventDetail(event));
      }
      if (eventId !== null && subResource === 'occurrences' && occurrenceId === null && method === 'GET') {
        const event = getEventById(eventId);
        if (!event) return sendJSON(res, 404, { error: 'Event not found' });
        return sendJSON(res, 200, { id: eventId, occurrences: listEventOccurrences(eventId, { includeCancelled: false }).map(whatsOnPublicOccurrence) });
      }
      return sendJSON(res, 405, { error: 'Method not allowed.' });
    }

    // GET /api/venues
    if (pathname === '/api/venues' && method === 'GET') {
      return sendJSON(res, 200, listVenues(query));
    }

    // GET /api/discover?q=<text>&limit=<n> -- Discovery search, Phase 2
    // (2026-09-25). Read-only: interprets the text into a validated intent
    // and returns the existing page that shows it plus the real matching
    // venue or event records. Behind DISCOVERY_SEARCH: with the flag off the
    // route does not exist and the request falls through exactly as before.
    if (pathname === '/api/discover' && method === 'GET' && isDiscoverySearchEnabled()) {
      const q = typeof query.q === 'string' ? query.q : '';
      if (!q.trim()) return sendJSON(res, 400, { error: 'q is required.' });
      if (q.length > discoveryIntentModule().DISCOVERY_MAX_TEXT_LENGTH) {
        return sendJSON(res, 400, { error: `q must be at most ${discoveryIntentModule().DISCOVERY_MAX_TEXT_LENGTH} characters.` });
      }
      let limit = DISCOVERY_DEFAULT_LIMIT;
      if (query.limit !== undefined) {
        const n = Number(query.limit);
        if (!Number.isInteger(n) || n < 1 || n > DISCOVERY_MAX_LIMIT) {
          return sendJSON(res, 400, { error: `limit must be an integer between 1 and ${DISCOVERY_MAX_LIMIT}.` });
        }
        limit = n;
      }
      return sendJSON(res, 200, runDiscovery(q, { limit }));
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

      // Security fix (2026-09-19): PUT/DELETE on a real venue were
      // previously reachable by anyone, with no authentication at all --
      // unlike every /admin/* write route, which has required the bearer
      // token since day one. Same guard, same fail-closed-if-unconfigured
      // behavior, same timing-safe comparison -- reusing the existing
      // mechanism rather than inventing a second one. Read (GET) above is
      // intentionally left untouched: this endpoint's public read behavior
      // is unchanged.
      if (method === 'PUT') {
        if (!ENRICHMENT_ADMIN_TOKEN) {
          return sendJSON(res, 503, { error: 'Venue update endpoint is not configured.' });
        }
        const authHeader = req.headers['authorization'] || '';
        const match = /^Bearer (.+)$/.exec(authHeader);
        if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
          return sendJSON(res, 401, { error: 'Unauthorized.' });
        }
        const body = await readBody(req);
        const updated = updateVenue(id, body);
        if (!updated) return sendJSON(res, 404, { error: 'Venue not found' });
        return sendJSON(res, 200, updated);
      }

      if (method === 'DELETE') {
        if (!ENRICHMENT_ADMIN_TOKEN) {
          return sendJSON(res, 503, { error: 'Venue deletion endpoint is not configured.' });
        }
        const authHeader = req.headers['authorization'] || '';
        const match = /^Bearer (.+)$/.exec(authHeader);
        if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
          return sendJSON(res, 401, { error: 'Unauthorized.' });
        }
        const deleted = deleteVenue(id);
        if (!deleted) return sendJSON(res, 404, { error: 'Venue not found' });
        return sendJSON(res, 200, { success: true });
      }
    }

    // POST /api/venues
    // Security fix (2026-09-19): see the PUT/DELETE comment above -- same
    // reasoning, same reused guard. Reads (GET /api/venues, GET /api/venues/:id)
    // remain fully public and unchanged.
    if (pathname === '/api/venues' && method === 'POST') {
      if (!ENRICHMENT_ADMIN_TOKEN) {
        return sendJSON(res, 503, { error: 'Venue creation endpoint is not configured.' });
      }
      const authHeader = req.headers['authorization'] || '';
      const match = /^Bearer (.+)$/.exec(authHeader);
      if (!match || !safeTokenEquals(match[1], ENRICHMENT_ADMIN_TOKEN)) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }
      const body = await readBody(req);
      const created = createVenue(body);
      return sendJSON(res, 201, created);
    }

    // POST /api/trip/generate — Build My Trip, Stage 1.
    //
    // Unauthenticated, like every other read-oriented endpoint in this file
    // (it only reads venues and computes a plan; it writes nothing) — POST
    // is used because the request has a body, not because this needs the
    // ENRICHMENT_ADMIN_TOKEN guard the /admin/* write endpoints use.
    if (pathname === '/api/trip/generate' && method === 'POST') {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      const ALLOWED_TRIP_KEYS = ['region', 'days', 'interests', 'pace', 'amenities', 'budget', 'discovery', 'excludeVenueIds'];
      const unexpectedTripKeys = Object.keys(body).filter((k) => !ALLOWED_TRIP_KEYS.includes(k));
      if (unexpectedTripKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedTripKeys.join(', ')}` });
      }

      const { region, days, interests, pace, amenities, budget, discovery, excludeVenueIds } = body;

      if (!isValidTripRegion(region)) {
        return sendJSON(res, 400, { error: 'region must be one of the known region slugs.', allowed: VALID_REGIONS });
      }
      if (!isValidTripDays(days)) {
        return sendJSON(res, 400, { error: 'days must be an integer between 1 and 7.' });
      }

      let interestsList = [];
      if (interests !== undefined) {
        if (!Array.isArray(interests) || interests.some((i) => typeof i !== 'string')) {
          return sendJSON(res, 400, { error: 'interests must be an array of strings.' });
        }
        const unknownInterests = interests.filter((i) => !isValidTripInterest(i));
        if (unknownInterests.length > 0) {
          return sendJSON(res, 400, {
            error: `Unknown interest(s): ${unknownInterests.join(', ')}`,
            allowed: TRIP_INTEREST_TYPES,
          });
        }
        interestsList = interests;
      }

      let paceValue = 'standard';
      if (pace !== undefined) {
        if (!isValidTripPace(pace)) {
          return sendJSON(res, 400, { error: `pace must be one of: ${TRIP_VALID_PACES.join(', ')}` });
        }
        paceValue = pace;
      }

      let amenitiesList = [];
      if (amenities !== undefined) {
        if (!Array.isArray(amenities) || amenities.some((a) => typeof a !== 'string')) {
          return sendJSON(res, 400, { error: 'amenities must be an array of strings.' });
        }
        const unknownAmenities = amenities.filter((a) => !isValidTripAmenity(a));
        if (unknownAmenities.length > 0) {
          return sendJSON(res, 400, {
            error: `Unknown amenity/amenities: ${unknownAmenities.join(', ')}`,
            allowed: BOOL_FIELDS,
          });
        }
        amenitiesList = amenities;
      }

      let budgetValue = null;
      if (budget !== undefined && budget !== null) {
        if (!isValidTripBudget(budget)) {
          return sendJSON(res, 400, { error: `budget must be one of: ${TRIP_VALID_BUDGETS.join(', ')}` });
        }
        budgetValue = budget;
      }

      const knownDiscoveryKinds = getKnownDiscoveryKinds();
      let discoveryList = [];
      if (discovery !== undefined) {
        if (!Array.isArray(discovery) || discovery.some((d) => typeof d !== 'string')) {
          return sendJSON(res, 400, { error: 'discovery must be an array of strings.' });
        }
        const unknownDiscovery = discovery.filter((d) => !isValidTripDiscoveryKind(d, knownDiscoveryKinds));
        if (unknownDiscovery.length > 0) {
          return sendJSON(res, 400, {
            error: `Unknown discovery kind(s): ${unknownDiscovery.join(', ')}`,
            allowed: knownDiscoveryKinds,
          });
        }
        discoveryList = discovery;
      }

      const discoveryVenueIds = new Set();
      discoveryList.forEach((kind) => {
        getCollectionVenueIds(kind).forEach((id) => discoveryVenueIds.add(id));
      });

      let excludeVenueIdsList = [];
      if (excludeVenueIds !== undefined) {
        if (!isValidTripExcludeIds(excludeVenueIds)) {
          return sendJSON(res, 400, { error: 'excludeVenueIds must be an array of integer venue ids.' });
        }
        excludeVenueIdsList = excludeVenueIds;
      }

      // Only planner-eligible types form the candidate pool (Beaches are
      // browsable venues but not a planner interest yet, see
      // TRIP_PLANNER_EXCLUDED_TYPES), so an itinerary can never pick a
      // type the interests validation above would have rejected.
      const regionVenues = db
        .prepare('SELECT * FROM venues WHERE region = ? AND redirect_to IS NULL')
        .all(region)
        .map(rowToVenue)
        .filter((v) => isTripPlannerType(v.type));

      const plan = buildTripItinerary(regionVenues, {
        region,
        days,
        interests: interestsList,
        pace: paceValue,
        amenities: amenitiesList,
        budget: budgetValue,
        discovery: discoveryList,
        discoveryVenueIds,
        excludeVenueIds: excludeVenueIdsList,
      });
      return sendJSON(res, 200, plan);
    }

    // POST /api/trip/parse — Build My Trip, Stage 3: natural-language trip
    // request parsing. Turns a free-text request into the same structured
    // shape /api/trip/generate accepts, using an LLM ONLY to interpret
    // customer language into our own closed field set -- it never selects
    // venues, invents events/prices/amenities, or produces any itinerary
    // content itself (buildTripItinerary, unchanged, still does all of
    // that deterministically). Every value the model returns is re-checked
    // against the exact same isValidTrip*() predicates /api/trip/generate
    // uses before it is trusted; anything that fails validation is moved to
    // `unsupported` rather than silently dropped or silently honored.
    if (pathname === '/api/trip/parse' && method === 'POST') {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }

      const ALLOWED_PARSE_KEYS = ['text'];
      const unexpectedParseKeys = Object.keys(body).filter((k) => !ALLOWED_PARSE_KEYS.includes(k));
      if (unexpectedParseKeys.length > 0) {
        return sendJSON(res, 400, { error: `Unexpected field(s): ${unexpectedParseKeys.join(', ')}` });
      }
      if (typeof body.text !== 'string' || !body.text.trim()) {
        return sendJSON(res, 400, { error: 'text is required and must be a non-empty string.' });
      }

      let parsed;
      try {
        parsed = await parseTripRequest(body.text);
      } catch (err) {
        return sendJSON(res, 502, { error: 'Could not process that request right now.' });
      }

      if (!parsed.ok) {
        return sendJSON(res, 502, { error: 'Could not process that request right now.', reason: parsed.reason });
      }

      return sendJSON(res, 200, parsed.value);
    }

    // POST /api/trip/plan -- Build My Trip planner (Phase 3). Read-only:
    // interprets the request and returns recommendations, an outing or a
    // day-by-day plan built only from verified venue data (or What's On
    // events for an event request). Behind TRIP_PLANNER_V2: with the flag off
    // the route does not exist and the request falls through as before.
    if (pathname === '/api/trip/plan' && method === 'POST' && isTripPlannerV2Enabled()) {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJSON(res, 400, { error: 'Malformed JSON body.' });
      }
      const parsed = parseTripPlanBody(body);
      if (parsed.error) return sendJSON(res, 400, { error: parsed.error });
      return sendJSON(res, 200, runTripPlan(parsed.value));
    }

    // GET /trip — Build My Trip, Stage 2. A fixed, exact path, registered
    // before the generic /:region catch-all below for the same reason
    // /events is (otherwise "trip" would be treated as an unrecognized
    // region and 404). Static markup only — the actual itinerary is
    // generated client-side via a POST to /api/trip/generate (Stage 1).
    if (pathname === '/trip' && method === 'GET') {
      const html = renderTripPlannerPage(isTripPlannerV2Enabled());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // GET /events — the standalone events index (2026-09-17). A fixed,
    // exact path, so it's registered before the generic /:region catch-all
    // below (which would otherwise treat "events" as an unrecognized
    // region and 404 it). Same active-event criteria the old homepage
    // Happening Soon strip used, with no LIMIT — see renderEventsIndexPage().
    // GET /whats-on -- What's On page shell (2026-09-22). Filter state
    // comes from ?regions=&categories= (see parseWhatsOnFilterQuery).
    if ((pathname === '/whats-on' || pathname === '/whats-on/') && method === 'GET') {
      const html = renderWhatsOnPage(parseWhatsOnPageQuery(query));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // GET /events -- the pre-What's-On index (renderEventsIndexPage) is no
    // longer the public destination (2026-09-22): permanent redirect to
    // /whats-on so old bookmarks and links keep working. Individual
    // /:region/events/:slug pages are untouched (route below).
    if ((pathname === '/events' || pathname === '/events/') && method === 'GET') {
      res.writeHead(301, { Location: '/whats-on' });
      return res.end();
    }

    // GET /:region/events/:slug — Phase 1 (Events architecture gate).
    // Registered BEFORE the generic /:region/:category/:slug venue-page
    // pattern below, since that broader regex would otherwise also match
    // an events URL and shadow this route entirely (both have the same
    // /segment/segment/segment shape). Expired events still render (200),
    // just with noindex applied inside renderEventPage/pageHead — they are
    // never 404'd purely for having ended.
    const eventPageMatch = pathname.match(/^\/([a-z-]+)\/events\/([a-z0-9-]+)\/?$/);
    if (eventPageMatch && method === 'GET') {
      const [, region, slug] = eventPageMatch;
      if (REGION_LABELS[region]) {
        const event = findEventBySlug(region, slug);
        // Step 5: only publishable (status = scheduled) events have a page;
        // cancelled/postponed rows 404 like a missing slug. Expired but
        // scheduled events still render 200 + noindex (unchanged).
        if (event && (getEventById(event.id) || {}).status === 'scheduled') {
          const hostVenue = event.venue_id ? getVenue(event.venue_id) : null;
          const html = renderEventPage(event, hostVenue);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /food-drink -- the Food & Drink directory (2026-09-24). A fixed
    // route, registered with the other named pages and before the broad
    // region/category patterns below, so "food-drink" can never be read as a
    // region slug. /browse is untouched and still serves okanagan.html.
    if (pathname === '/food-drink' && method === 'GET') {
      const fdVenues = getFoodDrinkHubVenues();
      if (fdVenues.length >= MIN_CATEGORY_VENUES) {
        const html = renderFoodDrinkHubPage(fdVenues, parseFoodDrinkFilterQuery(query));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /dog-friendly -- Dog Friendly Finds (2026-09-24), the destination
    // for the homepage's Hidden Gems card. A fixed route registered with the
    // other named pages and before the broad region/category patterns below,
    // so "dog-friendly" can never be read as a region slug.
    if (pathname === '/dog-friendly' && method === 'GET') {
      const dogVenues = getDogFriendlyHubVenues();
      if (dogVenues.length >= MIN_CATEGORY_VENUES) {
        const html = renderDogHubPage(dogVenues, parseDogFilterQuery(query));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /local-favorites -- Local Favourites (2026-09-24), the destination
    // for the homepage's Hidden Gems "Local Favourites" card. Registered with
    // the other fixed pages, before the broad region/category patterns.
    if (pathname === '/local-favorites' && method === 'GET') {
      const lfVenues = getLocalFavouriteVenues();
      if (lfVenues.length >= MIN_CATEGORY_VENUES) {
        const html = renderLocalFavouritesPage(lfVenues, parseLocalFavouritesFilterQuery(query));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // List Your Venue, Phase 1 (2026-09-25) -- see renderListYourVenuePage
    // and handleVenueSubmission above.
    if ((pathname === '/list-your-venue' || pathname === '/list-your-venue/') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderListYourVenuePage());
    }
    if (pathname === '/api/venue-submissions' && method === 'POST') {
      return await handleVenueSubmission(req, res);
    }
    if (pathname === '/admin/venue-submissions' && method === 'GET') {
      if (!requireAdminToken(req, res)) return;
      const status = query.status || 'pending';
      if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
        return sendJSON(res, 400, { error: 'status must be pending, approved, rejected or all.' });
      }
      return sendJSON(res, 200, { status, submissions: listVenueSubmissions(status) });
    }
    const submissionReviewMatch = pathname.match(/^\/admin\/venue-submissions\/(\d+)\/(approve|reject)$/);
    if (submissionReviewMatch && method === 'POST') {
      if (!requireAdminToken(req, res)) return;
      let body;
      try {
        body = await readLimitedJsonBody(req, VENUE_SUBMISSION_MAX_BODY_BYTES);
      } catch (err) {
        return sendJSON(res, err.status === 413 ? 413 : 400, { error: err.status === 413 ? 'Body too large.' : 'Malformed JSON body.' });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJSON(res, 400, { error: 'Body must be a JSON object.' });
      const id = Number(submissionReviewMatch[1]);
      const result = submissionReviewMatch[2] === 'approve' ? approveVenueSubmission(id, body) : rejectVenueSubmission(id, body);
      return sendJSON(res, result.status, result.body);
    }

    // List an Event, Phase 1 (2026-09-25) -- see renderListAnEventPage
    // and handleEventSubmission above.
    if ((pathname === '/list-an-event' || pathname === '/list-an-event/') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderListAnEventPage());
    }
    if (pathname === '/api/event-submissions' && method === 'POST') {
      return await handleEventSubmission(req, res);
    }
    if (pathname === '/admin/event-submissions' && method === 'GET') {
      if (!requireAdminToken(req, res)) return;
      const status = query.status || 'pending';
      if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
        return sendJSON(res, 400, { error: 'status must be pending, approved, rejected or all.' });
      }
      return sendJSON(res, 200, { status, submissions: listEventSubmissions(status) });
    }
    const eventSubmissionReviewMatch = pathname.match(/^\/admin\/event-submissions\/(\d+)\/(approve|reject)$/);
    if (eventSubmissionReviewMatch && method === 'POST') {
      if (!requireAdminToken(req, res)) return;
      let body;
      try {
        body = await readLimitedJsonBody(req, EVENT_SUBMISSION_MAX_BODY_BYTES);
      } catch (err) {
        return sendJSON(res, err.status === 413 ? 413 : 400, { error: err.status === 413 ? 'Body too large.' : 'Malformed JSON body.' });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJSON(res, 400, { error: 'Body must be a JSON object.' });
      const id = Number(eventSubmissionReviewMatch[1]);
      const result = eventSubmissionReviewMatch[2] === 'approve' ? approveEventSubmission(id, body) : rejectEventSubmission(id, body);
      return sendJSON(res, result.status, result.body);
    }

    // GET /destinations -- "Choose Your Okanagan Destination" (2026-09-25),
    // the target of the homepage's "Explore All Okanagan Regions" links.
    if ((pathname === '/destinations' || pathname === '/destinations/') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderDestinationsPage());
    }

    // GET /categories -- All Categories (2026-09-26), the destination for the
    // homepage's "Explore all categories" link. A fixed route before the
    // broad region pattern below, like /destinations.
    if ((pathname === '/categories' || pathname === '/categories/') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderCategoriesPage());
    }

    // GET /hidden-gems[/<badge>] -- the full Hidden Gems collection (see
    // renderHiddenGemsPage). Always served (2026-09-25): the destination
    // pages' Hidden Gems category links here whatever the feature flags.
    // Discovery Search and Build My Trip still only LINK here while their
    // own flag is on (isHiddenGemsPageEnabled in the resolver).
    const hiddenGemsMatch = pathname.match(/^\/hidden-gems(?:\/([a-z-]+))?\/?$/);
    if (hiddenGemsMatch && method === 'GET') {
      const slug = hiddenGemsMatch[1] || null;
      const feature = slug ? HIDDEN_GEM_FEATURE_BY_SLUG[slug] || null : null;
      const hgVenues = !slug || feature ? getHiddenGemCollectionVenues(feature) : [];
      if (hgVenues.length >= MIN_CATEGORY_VENUES) {
        const html = renderHiddenGemsPage(hgVenues, parseLocalFavouritesFilterQuery(query), feature);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /secret-spots -- Secret Spots (2026-09-25), the destination for the
    // homepage's Hidden Gems "Secret Spots" card. Same shape as /local-favorites.
    if (pathname === '/secret-spots' && method === 'GET') {
      const ssVenues = getSecretSpotVenues();
      if (ssVenues.length >= MIN_CATEGORY_VENUES) {
        const html = renderSecretSpotsPage(ssVenues, parseLocalFavouritesFilterQuery(query));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // ---------- SEO architecture: region / category / venue pages ----------
    // Registered last, after every fixed route and every /api/* route above,
    // so these broad patterns can never shadow anything that already exists.
    // Each one validates strictly against known regions/categories/slugs —
    // anything that doesn't match a real region, category, or venue falls
    // through to the plain 404 at the bottom of this function.

    // GET /outdoors/:activity — Outdoors Phase 2 activity page. Matched
    // before the generic /:region/:category routes below (which would
    // otherwise try "outdoors" as a region and 404). Only an activity
    // with at least MIN_ACTIVITY_VENUES canonical outdoor destinations
    // renders; anything else is the plain 404.
    const outdoorActivityMatch = pathname.match(/^\/outdoors\/([a-z-]+)\/?$/);
    if (outdoorActivityMatch && method === 'GET') {
      const activity = OUTDOOR_ACTIVITY_BY_SLUG[outdoorActivityMatch[1]];
      if (activity) {
        const venues = getOutdoorActivityVenues(activity);
        if (venues.length >= MIN_ACTIVITY_VENUES) {
          const html = renderOutdoorActivityPage(activity, venues);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /:region/:category/:slug — individual venue page
    const venuePageMatch = pathname.match(/^\/([a-z-]+)\/([a-z-]+)\/([a-z0-9-]+)\/?$/);
    if (venuePageMatch && method === 'GET') {
      const [, region, categorySlug, slug] = venuePageMatch;
      const type = SLUG_TO_TYPE[categorySlug];
      if (REGION_LABELS[region] && type) {
        const venue = findVenueBySlug(region, type, slug);
        if (venue) {
          // Phase 2.8D: duplicate-retirement redirect check. Resolve at
          // most ONE hop -- if the canonical target is missing, or is
          // itself redirected (a chain), fail OPEN by rendering this
          // venue's own page normally rather than producing a broken or
          // chained redirect. A dangling/chained redirect_to is a data
          // problem to be fixed at the source, never resolved at request
          // time by following multiple hops.
          if (venue.redirect_to) {
            const canonical = getVenue(venue.redirect_to);
            if (canonical && !canonical.redirect_to && CATEGORY_SLUGS[canonical.type] && canonical.slug) {
              const target = `/${canonical.region}/${CATEGORY_SLUGS[canonical.type]}/${canonical.slug}${parsed.search || ''}`;
              res.writeHead(301, { Location: target });
              return res.end();
            }
            console.error(`[redirect] venue ${venue.id} has redirect_to=${venue.redirect_to} but the target is missing/chained/invalid -- rendering venue ${venue.id} normally instead of redirecting.`);
          }
          const relatedVenues = getRelatedVenues(venue);
          const nearbyVenues = getNearbyVenues(venue);
          const venueGuidePages = listGuideCombos(MIN_GUIDE_VENUES).filter((c) => c.region === region && venue[c.badge]);
          const html = renderVenuePage(venue, relatedVenues, nearbyVenues, venueGuidePages);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
        // No venue in this region/category/slug. Before 404ing, check whether
        // this exact region+slug exists under a DIFFERENT category -- i.e. the
        // venue's `type` was corrected after this URL was published/indexed --
        // and 301 to its current canonical URL. Only reached on a path that
        // would otherwise 404, so no existing 200 response can change.
        const moved = findActiveVenueBySlugAcrossTypes(region, slug);
        const movedSlug = moved && CATEGORY_SLUGS[moved.type];
        if (moved && movedSlug && movedSlug !== categorySlug) {
          const target = `/${region}/${movedSlug}/${slug}`;
          // Loop guard: never redirect a path to itself.
          if (target !== pathname.replace(/\/+$/, '')) {
            res.writeHead(301, { Location: `${target}${parsed.search || ''}` });
            return res.end();
          }
        }
        // Same check for a corrected `region`: this exact category+slug now
        // lives in a different region.
        const relocated = findActiveVenueBySlugAcrossRegions(type, slug);
        if (relocated && relocated.region !== region) {
          res.writeHead(301, { Location: `/${relocated.region}/${categorySlug}/${slug}${parsed.search || ''}` });
          return res.end();
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
        if (venues.length >= MIN_CATEGORY_VENUES || RETAINED_EMPTY_CATEGORY_PAGES.has(`${region}/${type}`)) {
          const categoryGuidePages = listGuideCombos(MIN_GUIDE_VENUES).filter(
            (c) => c.region === region && venues.some((v) => v[c.badge])
          );
          // Food & drink categories (2026-09-25) are destination mini-
          // directories built on the /food-drink filters; wineries, golf,
          // beaches and outdoors keep their existing page unchanged.
          const html = FD_CATEGORY_KIND_BY_TYPE[type]
            ? renderFoodDrinkHubPage(venues, parseFoodDrinkFilterQuery(query), { region, type, categoryCounts: getRegionCategoryCounts(region), categoryGuidePages })
            : renderCategoryPage(region, type, venues, categoryGuidePages, { golfSort: type === 'golf' && golfData ? golfData.parseGolfSort(query) : 'recommended' });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(render404Page(pathname));
    }

    // GET /:category — Okanagan-wide category listing (2026-09-19; Golf is
    // the first, see ALL_REGIONS_CATEGORIES). For categories whose venues
    // are deliberately spread across several regions rather than
    // concentrated in one, the region-scoped /:region/:category page below
    // only ever shows one region's subset -- this is what the homepage's
    // mood card and footer links point at instead, for any category
    // enabled here. Generic by design (works for any category slug in
    // ALL_REGIONS_CATEGORIES, not hardcoded to golf), but gated by that
    // explicit allowlist rather than every known category slug, so
    // enabling a future one is a one-line addition there, not an
    // unannounced new public URL for every existing category the moment
    // this route was generalized. A path that isn't exactly "/<an enabled
    // category's slug>" falls through unchanged to the region-hub-page
    // check immediately below.
    const allRegionsCategorySlug = pathname.slice(1);
    if (
      ALL_REGIONS_CATEGORIES.includes(SLUG_TO_TYPE[allRegionsCategorySlug]) &&
      pathname === `/${allRegionsCategorySlug}` &&
      method === 'GET'
    ) {
      const type = SLUG_TO_TYPE[allRegionsCategorySlug];
      // The Outdoors landing lists the activity universe (outdoor-type
      // venues plus allowlisted-type activity members); every other
      // category lists its own type.
      const venues = type === 'outdoor' ? getOutdoorLandingVenues() : getVenuesByCategory(type);
      if (venues.length >= MIN_CATEGORY_VENUES) {
        // /outdoors?regions=..&activities=.. renders pre-filtered (see
        // parseOutdoorFilterQuery); other categories ignore the query.
        const html = renderCategoryAllRegionsPage(type, venues, type === 'outdoor' ? parseOutdoorFilterQuery(query) : null, { golfSort: type === 'golf' && golfData ? golfData.parseGolfSort(query) : 'recommended' });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
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

function startServer() {
  server.listen(PORT, () => {
    console.log(`Okanagan Roam API listening on http://localhost:${PORT}`);

    // Slug backfill runs AFTER the server is already listening and serving
    // every existing route (homepage, /api/*, /guide/*, etc.) — deliberately
    // not at module-load time. This way, if this step ever fails for an
    // unexpected reason, the site stays up and continues serving everything
    // it already could; only the not-yet-slugged venues' new pages would be
    // affected, never the whole site. The migration/schema setup in db.js
    // (adding columns, fixing the index) still runs at module-load — that
    // part is purely additive/idempotent and has been safe in every test.
    try {
      const { count, errors } = backfillSlugs();
      if (count > 0) {
        console.log(`[seo] backfilled slugs for ${count} venue(s)`);
      }
      if (errors.length > 0) {
        console.error(`[seo] WARNING: ${errors.length} venue(s) could NOT be given a unique slug:`);
        for (const e of errors) {
          console.error(`[seo]   id=${e.id} name="${e.name}" region=${e.region} type=${e.type} — ${e.reason}`);
        }
      }
    } catch (err) {
      console.error('[seo] slug backfill failed unexpectedly (site remains up):', err);
    }
  });
}

// Phase 5 Sprint 1 — testability guard. `require.main === module` is true
// only when this file is the one actually launched (`node server.js`,
// exactly how Railway/`npm start` run it today via package.json's
// "start" script) — so production behavior is byte-for-byte unchanged.
// When a test file instead does `require('../server.js')`, require.main
// is the test runner, not this file, so the guard is false and the real
// HTTP listener never starts — letting tests exercise the exported pure
// functions below in-process without binding a port or affecting a
// running instance.
if (require.main === module) {
  startServer();
}

// Exported for the Phase 5 Sprint 1 test foundation (tests/*.test.js).
// Every exported item is a pure function or a function whose only
// side effect is reading the already-open `db` connection — nothing here
// starts the server or opens a second database connection. Kept
// deliberately narrow: only what the test foundation in Section 14 of the
// Sprint 1 brief actually calls for (routes, slugs, JSON-LD, sitemap,
// database reads), not a blanket re-export of the whole module.
module.exports = {
  startServer,
  // List an Event, Phase 1
  renderListAnEventPage,
  validateEventSubmission,
  buildEventSubmissionEmail,
  getEventSubmission,
  approveEventSubmission,
  EVENT_SUBMISSION_MAX_FUTURE_DAYS,
  EVENT_SUBMISSION_MAX_SPAN_DAYS,
  // List Your Venue, Phase 1
  renderListYourVenuePage,
  validateVenueSubmission,
  buildVenueSubmissionEmail,
  setVenueSubmissionTransport,
  getVenueSubmission,
  VENUE_SUBMISSION_TYPES,
  VENUE_SUBMISSION_REGIONS,
  VENUE_SUBMISSION_AMENITIES,
  server,
  slugify,
  escapeHtml,
  normalizeWebsiteUrl,
  breadcrumbListSchema,
  buildOpeningHoursSpecification,
  badgeChipsHtml,
  breadcrumbNavHtml,
  venueCardHtml,
  listVenues,
  getVenue,
  getVenuesByRegionCategory,
  findVenueBySlug,
  findActiveVenueBySlugAcrossTypes,
  findActiveVenueBySlugAcrossRegions,
  RETAINED_EMPTY_CATEGORY_PAGES,
  FD_CATEGORY_KIND_BY_TYPE,
  FD_CATEGORY_COLLECTION_KINDS,
  getFoodDrinkCategoriesForVenueIds,
  effectiveFoodDrinkCategories,
  getRelatedVenues,
  getNearbyVenues,
  getRegionCategoryCounts,
  // Build My Trip, Stage 1 (backend itinerary generation)
  haversineKm,
  pickBestTripVenue,
  buildTripItinerary,
  TRIP_VALID_PACES,
  TRIP_PACE_MAX_HOP_KM,
  TRIP_TYPE_DAYPART_AFFINITY,
  TRIP_DAYPARTS,
  listGuideCombos,
  getStats,
  renderVenuePage,
  renderCategoryPage,
  renderCategoryAllRegionsPage,
  renderRegionPage,
  renderGuidePage,
  render404Page,
  CATEGORY_SLUGS,
  REGION_LABELS,
  MIN_GUIDE_VENUES,
  MIN_CATEGORY_VENUES,
  // Phase 1 (Events architecture gate)
  rowToEvent,
  findEventBySlug,
  isEventExpired,
  listEventsForSitemap,
  // What's On Step 2: local-date helpers (America/Vancouver civil dates)
  OKANAGAN_TIME_ZONE,
  todayLocal,
  parseLocalDate,
  addLocalDays,
  localDaysBetween,
  localWeekday,
  dateWindowForPreset,
  customDateWindow,
  localRangesOverlap,
  vancouverOffsetFor,
  toVancouverIso,
  eventLocalEndDate,
  ACTIVE_EVENT_DATE_SQL,
  // What's On Step 3: event data layer + guarded writers (internal; no route yet)
  EVENT_STATUSES,
  EVENT_OCCURRENCE_STATUSES,
  EVENT_CONFIDENCES,
  EVENT_SOURCE_TYPES,
  EVENT_OFFICIAL_SOURCE_TYPES,
  EVENT_MAX_CATEGORIES,
  EVENT_CREATE_FIELDS,
  EVENT_UPDATE_FIELDS,
  validateEventCategories,
  validateEventOccurrence,
  validateEventOccurrenceSet,
  validateEventVenue,
  validateEventScalars,
  findDuplicateEventCandidates,
  recomputeEventSpan,
  getEventById,
  getEventCategoryKeys,
  listEventOccurrences,
  countScheduledOccurrences,
  listRelatedEventsInRegion,
  listUpcomingEventsForRegion,
  listUpcomingEventsAtVenue,
  upcomingEventDateLabel,
  createEvent,
  updateEvent,
  replaceEventCategories,
  upsertEventOccurrences,
  setEventOccurrenceStatus,
  WHATSON_DEFAULT_WINDOW_DAYS,
  resolveWhatsOnWindow,
  formatLocalDateShort,
  formatLocalTime,
  whatsOnDateLabel,
  whatsOnTimeLabel,
  queryWhatsOnEvents,
  whatsOnCountsFor,
  // What's On Step 5: detail page helpers
  formatLocalDateLong,
  describeEventOccurrence,
  eventSchemaType,
  eventJsonLd,
  // What's On Step 4: API plumbing
  EVENT_WRITE_STATUS_MAP,
  EVENT_META_KEYS,
  whatsOnPublicEvent,
  whatsOnPublicEventDetail,
  parseWhatsOnReadQuery,
  listWhatsOnEventsPublic,
  renderEventPage,
  pageHead,
  // Events index (2026-09-17)
  eventCardHtml,
  renderEventsIndexPage,
  // Build My Trip, Stage 2 (frontend)
  renderTripPlannerPage,
  renderCanonicalFooterStyles,
  renderGolfHeaderHtml,
  renderGolfTripTrayHtml,
  extractHtmlFragment,
  TRIP_INTEREST_I18N_KEY,
  // Phase 2 Sprint 2 (Event Types)
  EVENT_SCHEMA_TYPE_MAP,
  // Phase 2 Sprint 3 (Hidden Gems)
  getHiddenGemVenueIds,
  isVenueHiddenGem,
  hiddenGemBadgeHtml,
  localFavouriteBadgeHtml,
  guardedCollectionMembershipUpdate,
  // Beaches Phase 2 (2026-09-19)
  getVenuesByCategory,
  SLUG_TO_TYPE,
  CATEGORY_LABELS,
  TYPE_ACCENT_GRADIENTS,
  HIDDEN_GEM_TYPE_IMAGE,
  SCHEMA_TYPE_MAP,
  ALL_REGIONS_CATEGORIES,
  renderGolfThemeStyles,
  THEMED_CATEGORY_TYPES,
  ENGAGEMENT_ONLY_TYPES,
  usesThemedCategoryLayout,
  themedBodyClassAttr,
  TRIP_PLANNER_EXCLUDED_TYPES,
  TRIP_INTEREST_TYPES,
  isTripPlannerType,
  ADVISORY_COLLECTION_KIND,
  NON_DISCOVERY_COLLECTION_KINDS,
  getAdvisoryNotes,
  DOG_FRIENDLY_COLLECTION_KIND,
  getCollectionNotes,
  getDogFriendlyNotes,
  DOG_HUB_TYPES,
  DOG_HUB_FEATURES,
  DOG_BEACH_TYPE_KEY,
  getDogFriendlyHubVenues,
  dogHubCategoriesByVenue,
  dogHubFeaturesByVenue,
  dogFilterMatches,
  filterDogVenues,
  parseDogFilterQuery,
  dogChipCounts,
  dogSummaryText,
  renderDogHubPage,
  getLocalFavouriteVenues,
  localFavouriteTypesPresent,
  localFavouriteFilterMatches,
  parseLocalFavouritesFilterQuery,
  renderLocalFavouritesPage,
  getSecretSpotVenues,
  renderSecretSpotsPage,
  renderFoodDrinkScopedPage,
  regionCategoryTabsHtml,
  SECRET_SPOT_TYPES,
  renderLocalFavouritesStyles,
  renderLocalFavouritesScriptHtml,
  renderDogHubStyles,
  renderDogHubScriptHtml,
  dogFriendlyBadgeHtml,
  advisoryNoticeHtml,
  parseAdvisoryNote,
  renderAdvisoryStyles,
  renderBeachThemeStyles,
  deriveBeachRulesFromGolfCss,
  renderOutdoorThemeStyles,
  ACTIVITY_COLLECTION_KINDS,
  OUTDOOR_ACTIVITIES,
  OUTDOOR_ACTIVITY_BY_SLUG,
  OUTDOOR_ACTIVITY_DISPLAY_ORDER,
  sortOutdoorActivitiesForDisplay,
  MIN_ACTIVITY_VENUES,
  OUTDOOR_FEATURED_KEYS,
  OUTDOOR_ACTIVITY_VENUE_TYPES,
  getOutdoorLandingVenues,
  getOutdoorActivityVenues,
  getOutdoorActivityCounts,
  listLiveOutdoorActivities,
  renderOutdoorActivitySelector,
  renderOutdoorFeaturedHtml,
  OUTDOOR_ACTIVITY_CARDS,
  outdoorActivityImagePath,
  renderOutdoorActivityShowcaseHtml,
  outdoorsSearchHtml,
  outdoorsActivityChipsHtml,
  outdoorsFilterBarHtml,
  outdoorsResultBarHtml,
  renderOutdoorRegionChoice,
  renderOutdoorRegionIndexHtml,
  outdoorFilterMatches,
  filterOutdoorVenues,
  getOutdoorActivitySlugsByVenue,
  parseOutdoorFilterQuery,
  outdoorChipCounts,
  outdoorSummaryText,
  renderOutdoorSelectedTagsHtml,
  OUTDOOR_SUMMARY_CLIENT_SRC,
  renderOutdoorRegionFilterChips,
  FD_HUB_TYPES,
  FD_PAGE_SIZE,
  golfCardEngagementScriptHtml,
  FD_HUB_FEATURES,
  getFoodDrinkHubVenues,
  parseFoodDrinkFilterQuery,
  foodDrinkFilterMatches,
  filterFoodDrinkVenues,
  foodDrinkChipCounts,
  foodDrinkSummaryText,
  foodDrinkTypeChipsHtml,
  foodDrinkFeatureChipsHtml,
  foodDrinkFilterBarHtml,
  renderFoodDrinkHubPage,
  renderFoodDrinkHubScriptHtml,
  FD_HUB_FILTER_CLIENT_PREDICATE_SRC,
  canonicalOutdoorRegionOrder,
  OUTDOOR_REGION_GROUP_DEFAULT_OPEN,
  OUTDOOR_REGION_GROUP_CLIENT_SRC,
  outdoorRegionGroupSlug,
  renderOutdoorActivityFilterChips,
  renderOutdoorFilterScriptHtml,
  // What's On (2026-09-22)
  WHATSON_CATEGORIES,
  WHATSON_CATEGORY_BY_KEY,
  WHATSON_DATE_PRESETS,
  whatsOnCategoryImagePath,
  getWhatsOnEvents,
  whatsOnInventoryExists,
  parseWhatsOnFilterQuery,
  parseWhatsOnPageQuery,
  filterWhatsOnEvents,
  whatsOnRegionChipsHtml,
  whatsOnCategoryTileHtml,
  whatsOnCategoryGridHtml,
  whatsOnEventCardHtml,
  whatsOnSelectedTagsHtml,
  whatsOnSummaryText,
  renderWhatsOnStyles,
  renderWhatsOnFilterScriptHtml,
  renderWhatsOnPage,
  OUTDOOR_FILTER_CLIENT_PREDICATE_SRC,
  renderOutdoorActivityPage,
  // Golf venue page polish (2026-09-20)
  renderGolfVenuePolishStyles,
  GOLF_AT_A_GLANCE_FACTS,
  golfAtAGlanceHtml,
  // Build My Trip, Stage 3 (price/amenity/discovery scoring + NL parser)
  TRIP_VALID_BUDGETS,
  budgetMatchesPrice,
  getCollectionVenueIds,
  getKnownDiscoveryKinds,
  buildDiscoveryTaxonomy,
  isTripPlannerV2Enabled,
  buildTripPlannerFacts,
  tripPlannerLabels,
  parseTripPlanBody,
  runTripPlan,
  tripStartWeekday,
  okanaganClock,
  venueHoursStatusAt,
  countHiddenGemsOutsideSecretSpots,
  getHiddenGemCollectionVenues,
  hiddenGemsPageDestination,
  renderHiddenGemsPage,
  destinationCategories,
  DESTINATION_CATEGORY_ORDER,
  destinationRegionEntries,
  renderDestinationsPage,
  renderCategoriesPage,
  categoryDirectoryEntries,
  isDiscoverySearchEnabled,
  interpretDiscoveryText,
  resolveDiscoveryDestination,
  selectDiscoveryVenues,
  selectDiscoveryEvents,
  runDiscovery,
  renderBrowsePrefillScript,
  BROWSE_FEATURE_CHIP,
  isValidTripRegion,
  isValidTripDays,
  isValidTripInterest,
  isValidTripAmenity,
  isValidTripPace,
  isValidTripBudget,
  isValidTripDiscoveryKind,
  parseTripRequest,
  callTripParserProvider,
  classifyTripParserFetchError,
  deterministicTripParserProvider,
  normalizeTripParserText,
  // Design Sprint 3 (Homepage Discovery)
  renderHiddenGemsHomepageHTML,
  renderExploreByCategoryHTML,
  renderExploreRegionsHTML,
  renderBuildTripCTAHTML,
  renderMoodCardsHTML,
  // Design Sprint 4 (Visual & Editorial Polish)
  CATEGORY_TAGLINES,
  REGION_TAGLINES,
  HIDDEN_GEM_HOMEPAGE_BLURBS,
  compactVisualBandHtml,
  hiddenGemHomepageCardHtml,
  // Hidden Gems content-model change (2026-09-17)
  HIDDEN_GEM_EDITORIAL_CARDS,
  hiddenGemEditorialCardHtml,
  // Homepage footer redesign (2026-09-17)
  renderHomeFooterHTML,
  FOOTER_REGION_GROUPS,
  BOOL_FIELDS,
};
