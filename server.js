const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

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
  golf: 'golf',
  beach: 'beaches',
  // Outdoors (2026-09-20, Phase 1 seed): parks, trails, viewpoints,
  // nature centres, ski resorts and Nordic centres. Same reusable
  // category architecture as Golf/Beaches; see THEMED_CATEGORY_TYPES and
  // ALL_REGIONS_CATEGORIES below.
  outdoor: 'outdoors',
};
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

// Categories that exist as venue pages but are deliberately NOT offered
// by the Build My Trip planner yet (interest chips on /trip, the
// `interests` field of POST /api/trip/generate, the LLM/deterministic
// parser vocabulary, and the itinerary candidate pool). Beaches launch as
// browse/favourite/add-to-trip-tray venues only; making them a planner
// interest is a separate, later decision. Favorite and Add to Trip on a
// beach page still work -- those are name-keyed localStorage features of
// the homepage module and never consult this list.
const TRIP_PLANNER_EXCLUDED_TYPES = new Set(['beach', 'outdoor']);
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
const ALL_REGIONS_CATEGORIES = ['golf', 'beach', 'outdoor'];

// Human-readable label per category, singular and plural, for titles/H1s
const CATEGORY_LABELS = {
  restaurant: { singular: 'Restaurant', plural: 'Restaurants' },
  winery: { singular: 'Winery', plural: 'Wineries' },
  cafe: { singular: 'Cafe', plural: 'Cafes' },
  brewery: { singular: 'Brewery', plural: 'Breweries' },
  pub: { singular: 'Pub', plural: 'Pubs' },
  cocktail: { singular: 'Cocktail Lounge', plural: 'Cocktail Lounges' },
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
  // { restaurant: 12, winery: 4, ... } for a region, only categories with >=1 venue
  return db
    .prepare('SELECT type, COUNT(*) AS n FROM venues WHERE region = ? GROUP BY type')
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

// An event is "expired" once its published end (or, if it has none, its
// start) is in the past. A recurring series' end_datetime is expected to
// represent its next/current upcoming occurrence (per the Phase 1
// architecture decision — this phase does not expand occurrences), so this
// same check correctly keeps an active recurring series "not expired" for
// as long as its stored end_datetime is kept current.
function isEventExpired(event, now = new Date()) {
  const reference = event.end_datetime || event.start_datetime;
  const referenceDate = new Date(reference.replace(' ', 'T') + 'Z');
  if (Number.isNaN(referenceDate.getTime())) return false; // malformed date — do not guess; treat as not expired rather than silently hiding it
  return referenceDate.getTime() < now.getTime();
}

// Only non-expired events belong in the sitemap — the same reasoning the
// existing sitemap already applies to retired venues via `redirect_to IS
// NULL`: a sitemap should not advertise pages with no ongoing value.
function listEventsForSitemap() {
  const rows = db.prepare('SELECT * FROM events').all().map(rowToEvent);
  return rows.filter((e) => !isEventExpired(e));
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
const ACTIVITY_COLLECTION_KINDS = ['activity_hiking', 'activity_cycling', 'activity_viewpoints', 'activity_nature', 'activity_winter', 'activity_camping', 'activity_water', 'activity_adventure'];
const NON_DISCOVERY_COLLECTION_KINDS = new Set([ADVISORY_COLLECTION_KIND, DOG_FRIENDLY_COLLECTION_KIND, ...ACTIVITY_COLLECTION_KINDS]);


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
  },
  {
    titleKey: 'gems.localFavourites.title',
    title: 'Local Favourites',
    blurbKey: 'gems.localFavourites.blurb',
    blurb: 'The spots locals keep coming back to.',
    img: '/images/hidden-gems/local-favourites.webp',
  },
  {
    titleKey: 'gems.secretSpots.title',
    title: 'Secret Spots',
    blurbKey: 'gems.secretSpots.blurb',
    blurb: 'Quiet corners away from the crowds.',
    img: '/images/hidden-gems/secret-spots.webp',
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
  return `<a class="hidden-gem-card" href="#directory">
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
      <a class="discover-heading-link" href="#directory" data-i18n="gems.viewAll">View all hidden gems &rarr;</a>
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
  const exploreAllHeadingLink = '<a class="discover-heading-link explore-all-link explore-all-link-heading" href="/browse" data-i18n="explore.allRegions">Explore All Okanagan Regions &rarr;</a>';
  const exploreAllMobileLink = '<a class="discover-heading-link explore-all-link explore-all-link-mobile" href="/browse" data-i18n="explore.allRegions">Explore All Okanagan Regions &rarr;</a>';
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
//   Outdoors    -> existing #exploreRegions anchor
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
  const wineRegion = bestRegionForType.winery;
  const wineHref = wineRegion && CATEGORY_SLUGS.winery ? `/${wineRegion}/${CATEGORY_SLUGS.winery}` : '/browse';
  // Beaches (2026-09-20): same pattern as Golf. Now that the Okanagan-wide
  // /beaches listing is live, the Beaches mood card points at it whenever
  // at least one beach venue exists; with no beach data it keeps its
  // previous in-page #exploreRegions target. Only the href changes -- the
  // card's markup, image, icon, title and position are untouched.
  const beachesHref = bestRegionForType.beach && CATEGORY_SLUGS.beach ? `/${CATEGORY_SLUGS.beach}` : '#exploreRegions';

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
    { key: 'food-drink', href: '/browse?types=restaurant,cafe,brewery,pub,cocktail', filter: 'restaurant,cafe,brewery,pub,cocktail', img: '/images/mood/eat.webp', titleKey: 'mood.foodDrink.title', title: 'Food & Drink' },
    { key: 'wine', href: wineHref, filter: 'winery', img: '/images/mood/drink.webp', titleKey: 'mood.wine.title', title: 'Wine' },
    { key: 'beaches', href: beachesHref, filter: null, img: '/images/mood/beaches.webp', titleKey: 'mood.beaches.title', title: 'Beaches' },
    { key: 'golf', href: golfHref, filter: null, img: '/images/mood/golf.webp', titleKey: 'mood.golf.title', title: 'Golf' },
    { key: 'whats-on', href: '/events', filter: null, img: '/images/mood/whats-on.webp', titleKey: 'mood.whatsOn.title', title: "What's On" },
    { key: 'outdoors', href: '#exploreRegions', filter: null, img: '/images/mood/explore.webp', titleKey: 'mood.outdoors.title', title: 'Outdoors' },
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
      <a class="discover-heading-link" href="#directory" data-i18n="mood.exploreAll">Explore all categories &rarr;</a>
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
//   About: App coming soon/List your venue -> /browse#app / /browse#list-venue
//     (real anchors confirmed present on /browse's app-teaser/list-venue
//     sections), Contact -> the existing mailto link
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
  const wineRegion = bestRegionForType.winery;
  const wineHref = wineRegion && CATEGORY_SLUGS.winery ? `/${wineRegion}/${CATEGORY_SLUGS.winery}` : '/browse';
  const exploreRegionsHref = fromBrowse ? '/#exploreRegions' : '#exploreRegions';
  const hiddenGemsHref = fromBrowse ? '/#hiddenGems' : '#hiddenGems';

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
          <li><a href="/browse?types=restaurant,cafe,brewery,pub,cocktail" data-i18n="homeFooter.foodDrinks">Food &amp; Drinks</a></li>
          <li><a href="${wineHref}" data-i18n="mood.wine.title">Wine</a></li>
          <li><a href="${exploreRegionsHref}" data-i18n="mood.beaches.title">Beaches</a></li>
          <li><a href="${golfHref}" data-i18n="mood.golf.title">Golf</a></li>
          <li><a href="/events" data-i18n="mood.whatsOn.title">What&rsquo;s On</a></li>
          <li><a href="${exploreRegionsHref}" data-i18n="mood.outdoors.title">Outdoors</a></li>
          <li><a href="${hiddenGemsHref}" data-i18n="gems.heading">Hidden Gems</a></li>
        </ul>
      </div>
      <div class="home-footer-col">
        <h4 data-i18n="footer.about">About</h4>
        <ul>
          <li><a href="/browse#app" data-i18n="nav.appComingSoon">App coming soon</a></li>
          <li><a href="/browse#list-venue" data-i18n="footer.listVenue">List your venue</a></li>
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
     they live in is shared. Direction: a small persistent "your trip"
     control, not a primary CTA -- smaller footprint, the homepage's own
     navy/cream/gold system instead of the old plum/paper/amber, a lighter
     shadow, and a smaller/quieter count badge, while leaving position
     (fixed, bottom corner, 20px from the edges -- already comfortable for
     tapping) and every bit of the click/expand/route/clear behavior
     untouched -- this only restyles the closed-state toggle and its
     count, never #tripTrayPanel (the expanded trip list keeps its
     existing look, on both pages). */
  body:not(.page-browse) #tripTrayToggle {
    background: var(--ref-navy); color: var(--ref-cream);
    border: 1px solid var(--ref-gold);
    border-radius: 999px; padding: 9px 16px; gap: 8px;
    font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 0.78rem;
    box-shadow: 0 4px 14px -6px rgba(16,27,36,0.45);
  }
  body:not(.page-browse) #tripTrayToggle:hover { background: var(--ref-navy-deep); }
  body:not(.page-browse) #tripTrayCount {
    background: var(--ref-gold); color: var(--ref-navy-deep);
    width: 16px; height: 16px; font-size: 0.62rem; font-weight: 800;
  }
  /* Suitcase-icon removal (approved refinement, 2026-09-19): the 🧳 emoji
     lives in the shared #tripTrayToggle markup in okanagan.html (reused
     as-is by /browse and /trip), wrapped in .trip-toggle-icon specifically
     so it can be hidden here, homepage-only, without touching that shared
     markup's actual content -- /browse's own (unscoped) styling is
     completely unaffected and keeps showing the icon exactly as before.
     .trip-toggle-arrow is an empty span in that same shared markup; on
     every other page it's simply an empty, invisible inline element, and
     only here does it get real content -- a small gold chevron, replacing
     the suitcase as a subtle "opens something" cue rather than an icon. */
  body:not(.page-browse) #tripTrayToggle .trip-toggle-icon { display: none; }
  body:not(.page-browse) #tripTrayToggle .trip-toggle-arrow::after {
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
  .venue-card[data-venue-category="golf"] .trip-btn.in-trip { background: var(--teal, #2F6F73); color: var(--paper); }
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

function golfEngagementHeadHtml(type) {
  return usesThemedCategoryLayout(type) ? renderAnalyticsHeadHtml() : '';
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
  var HOLDER = '[data-venue-category="${type}"]';
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
function themedBodyClassAttr(type) {
  if (type === 'golf') return ' class="golf-page"';
  if (usesThemedCategoryLayout(type)) return ` class="golf-page ${type}-page"`;
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
</style>`;
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
function golfCardEngagementScriptHtml(type) {
  if (!usesThemedCategoryLayout(type)) return '';
  return `<script>
(function(){
  var cards = document.querySelectorAll('.venue-card[data-venue-category="${type}"]');
  if (!cards.length) return;
  function ctx(card){
    return {
      venue_id: Number(card.dataset.venueId),
      venue_name: card.dataset.venueName,
      venue_region: card.dataset.venueRegion,
      venue_category: '${type}',
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
  if (!usesThemedCategoryLayout(venue.type)) return '';
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
  const { noindex = false, golfTheme = false, beachTheme = false, outdoorTheme = false, advisoryStyles = false } = opts;
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
${golfTheme ? '<link rel="stylesheet" href="/styles/app.css">\n' : ''}<style>${SEO_PAGE_CSS}</style>${golfTheme ? '\n' + renderGolfThemeStyles() : ''}${beachTheme ? '\n' + renderBeachThemeStyles() : ''}${outdoorTheme ? '\n' + renderOutdoorThemeStyles() : ''}${advisoryStyles ? '\n' + renderAdvisoryStyles() : ''}`;
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
  const { showType = false, isHiddenGem = false, isLocalFavourite = false, advisoryNote = null, dogFriendlyNote = null, showRegion = false } = opts;
  const catSlug = CATEGORY_SLUGS[venue.type];
  const href = (venue.slug && catSlug) ? `/${venue.region}/${catSlug}/${venue.slug}` : null;
  // Golf-only: the name stays the single link to the venue page, but it
  // becomes a block-level tap target carrying a small "View details"
  // cue (aria-hidden, so the accessible link name is still just the venue
  // name). Styled by the golf theme; every other category's title markup
  // is unchanged.
  const nameHtml = href
    ? (usesThemedCategoryLayout(venue.type)
      ? `<a class="venue-card-link" href="${href}"><span class="venue-card-name">${escapeHtml(venue.name)}</span><span class="venue-card-cue" aria-hidden="true">View details &rarr;</span></a>`
      : `<a href="${href}">${escapeHtml(venue.name)}</a>`)
    : escapeHtml(venue.name);
  const meta = [
    showRegion && REGION_LABELS[venue.region] ? escapeHtml(REGION_LABELS[venue.region]) : null,
    showType && venue.type ? escapeHtml(venue.type) : null,
    venue.cuisine ? escapeHtml(venue.cuisine) : null,
    venue.rating ? `${venue.rating}\u2605` : null,
  ].filter(Boolean).join(' &middot; ');
  // Golf-only (2026-09-19): the description is wrapped so the page script
  // can clamp it to ~4 lines and toggle it inline; the button ships hidden
  // and is revealed only when the text is actually truncated. Every other
  // category renders exactly what it did before.
  // `isGolf` now means "uses the themed (Golf-style) card": Golf and, since
  // 2026-09-19, Beaches (THEMED_CATEGORY_TYPES). Golf output is unchanged.
  const isGolf = usesThemedCategoryLayout(venue.type);
  const descId = `golf-desc-${venue.id}`;
  const desc = !venue.description ? '' : isGolf
    ? `<div class="golf-desc" id="${descId}"><p>${escapeHtml(venue.description)}</p></div>
        <button type="button" class="desc-toggle" aria-expanded="false" aria-controls="${descId}" hidden>Read more &rarr;</button>`
    : `<p>${escapeHtml(venue.description)}</p>`;
  const liAttrs = isGolf
    ? ` data-venue-id="${venue.id}" data-venue-region="${escapeHtml(venue.region)}" data-venue-category="${escapeHtml(venue.type)}" data-venue-name="${escapeHtml(venue.name)}" data-surface="category_card"`
    : '';
  // Golf-only (2026-09-19): the listing card's only actions are Favorite
  // and Add to Trip (golfFavTripButtonsHtml). Website / phone / directions
  // live on the venue page instead -- the data is untouched, only where it
  // is shown. Rendered inline after the chips line, so non-Golf cards stay
  // byte-identical to their pre-feature markup (no stray blank line).
  const cardActions = isGolf
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
  const advisoryHtml = (advisoryNote !== null && advisoryNote !== undefined && !venue.redirect_to)
    ? `\n        ${advisoryNoticeHtml(advisoryNote)}`
    : '';
  return `
      <li class="venue-card"${liAttrs}>
        <h2>${nameHtml}</h2>
        <p class="venue-meta">${meta}</p>
        ${desc}${advisoryHtml}
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
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel },
  ])}
  <h1>${escapeHtml(regionLabel)}, BC</h1>
  <p class="subtitle">${totalVenues} verified venues across ${categoryCards ? Object.keys(categoryCounts).length : 0} categories in ${escapeHtml(regionLabel)}.</p>
  <ul class="card-grid">
    ${categoryCards}
  </ul>
  ${guideLinks}
  <a class="cta" href="https://okanaganroam.com/">See all of ${escapeHtml(regionLabel)} on Okanagan Roam</a>
  ${renderHomeFooterHTML(true)}
</body>
</html>`;
}

// Short label for the "← All <X>" back-link on a category's single-
// region page, distinct from CATEGORY_LABELS.plural (the full heading
// label, e.g. "Golf Courses") since the back-link reads better short.
// Falls back to CATEGORY_LABELS.plural for any category without an
// entry here, so it never breaks if a future category is added to
// ALL_REGIONS_CATEGORIES without also adding a short label.
const ALL_REGIONS_BACK_LABEL = { golf: 'Golf', beach: 'Beaches', outdoor: 'Outdoors' };

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
function renderCategoryCardsHtml(type, venues, hiddenGemIds, headingPrefix, localFavouriteIds = new Set(), advisoryNotes = new Map(), dogFriendlyNotes = new Map(), cardOpts = {}) {
  const cardHtml = (list) => list.map((v) => venueCardHtml(v, { ...cardOpts, isHiddenGem: hiddenGemIds.has(v.id), isLocalFavourite: localFavouriteIds.has(v.id), advisoryNote: advisoryNotes.has(v.id) ? advisoryNotes.get(v.id) : null, dogFriendlyNote: dogFriendlyNotes.has(v.id) ? dogFriendlyNotes.get(v.id) : null })).join('\n');

  if (type !== 'golf') {
    return `<ul class="card-grid">
    ${cardHtml(venues)}
  </ul>`;
  }

  const courses = venues.filter((v) => !isIndoorGolfVenue(v));
  const indoor = venues.filter((v) => isIndoorGolfVenue(v));
  const prefix = headingPrefix ? `${escapeHtml(headingPrefix)} ` : '';
  let html = '';
  if (courses.length) {
    html += `<h2 class="category-subsection-heading">${prefix}Golf Courses</h2>
  <ul class="card-grid">
    ${cardHtml(courses)}
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

  const hiddenGemIds = getHiddenGemVenueIds();
  const advisoryNotes = getAdvisoryNotes();
  const cardsHtml = renderCategoryCardsHtml(type, venues, hiddenGemIds, regionLabel, getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes());

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
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: usesThemedCategoryLayout(type), beachTheme: type === 'beach', outdoorTheme: type === 'outdoor', advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)) })}
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
  <p class="subtitle">${venues.length} verified ${escapeHtml(label.plural.toLowerCase())} in ${escapeHtml(regionLabel)}.</p>
  ${cardsHtml}
  ${guideLinks}
  <a class="cta" href="/${region}">Back to all of ${escapeHtml(regionLabel)}</a>
  ${usesThemedCategoryLayout(type) ? '</main>' : ''}
  ${renderHomeFooterHTML(true)}
  ${usesThemedCategoryLayout(type) ? GOLF_APP_SCRIPT_TAG : ''}
  ${golfCardEngagementScriptHtml(type)}
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
function renderCategoryAllRegionsPage(type, venues) {
  const catSlug = CATEGORY_SLUGS[type];
  const label = CATEGORY_LABELS[type];
  const title = `${label.plural} in the Okanagan | Okanagan Roam`;
  const description = `${venues.length} verified ${label.plural.toLowerCase()} across the Okanagan Valley — real listings reviewed and badge-checked by Okanagan Roam.`;
  const canonical = `https://okanaganroam.com/${catSlug}`;
  const regionSelector = renderCategoryRegionSelector(catSlug, venues);

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
  // venues in different communities can be told apart.
  const cardsHtml = renderCategoryCardsHtml(type, venues, hiddenGemIds, '', getCollectionVenueIds('local_favorite'), advisoryNotes, getDogFriendlyNotes(), { showRegion: true });

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, itemList], { golfTheme: usesThemedCategoryLayout(type), beachTheme: type === 'beach', outdoorTheme: type === 'outdoor', advisoryStyles: venues.some((v) => advisoryNotes.has(v.id)) })}
${golfEngagementHeadHtml(type)}
</head>
<body${themedBodyClassAttr(type)}>
  ${usesThemedCategoryLayout(type) ? renderGolfTripTrayHtml() + '\n<div id="floatingTooltip"></div>\n' + renderGolfHeaderHtml() + '\n  <main class="wrap-wide golf-main">' : siteHeader('https://okanaganroam.com/', 'Explore the full directory →')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: label.plural },
  ])}
  <h1>${escapeHtml(label.plural)} in the Okanagan</h1>
  <p class="subtitle">${venues.length} verified ${escapeHtml(label.plural.toLowerCase())} across the Okanagan Valley.</p>
  ${regionSelector}
  ${cardsHtml}
  <a class="cta" href="/browse">Back to the full directory</a>
  ${usesThemedCategoryLayout(type) ? '</main>' : ''}
  ${renderHomeFooterHTML(true)}
  ${usesThemedCategoryLayout(type) ? GOLF_APP_SCRIPT_TAG : ''}
  ${golfCardEngagementScriptHtml(type)}
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
    priceRange: venue.price ? '$'.repeat(venue.price) : undefined,
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
  const golfKindLabel = (venue.type === 'golf' && isIndoorGolfVenue(venue)) ? 'Indoor Golf' : label.singular;

  const detailRows = [
    ['Type', venue.type === 'golf' ? golfKindLabel : label.singular],
    ['Region', `<a href="/${venue.region}">${escapeHtml(regionLabel)}</a>`],
    venue.cuisine ? ['Cuisine', escapeHtml(venue.cuisine)] : null,
    venue.address ? ['Address', escapeHtml(venue.address)] : null,
    venue.phone ? ['Phone', `<a href="tel:${escapeHtml(venue.phone)}"${trackAttr('phone')}>${escapeHtml(venue.phone)}</a>`] : null,
    venue.website ? ['Website', `<a href="${escapeHtml(normalizeWebsiteUrl(venue.website))}" rel="nofollow noopener" target="_blank"${trackAttr('website')}>${escapeHtml(venue.website)}</a>`] : null,
    venue.price ? ['Price', '$'.repeat(venue.price)] : null,
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
    venue.price ? '$'.repeat(venue.price) : null,
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
    usesThemedCategoryLayout(venue.type) ? golfFavTripButtonsHtml(venue) : null,
  ].filter(Boolean).join('\n  ');
  const ctaRowAttrs = usesThemedCategoryLayout(venue.type)
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
${pageHead(title, description, canonical, [breadcrumb, localBusiness], { golfTheme: usesThemedCategoryLayout(venue.type), beachTheme: venue.type === 'beach', outdoorTheme: venue.type === 'outdoor', advisoryStyles: venueAdvisoryNote !== undefined })}${usesThemedCategoryLayout(venue.type) ? '\n' + renderGolfVenuePolishStyles() : ''}
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
  ${ctaButtons ? `<div class="venue-cta-row"${ctaRowAttrs}>\n  ${ctaButtons}\n</div>` : ''}${golfGlanceHtml ? '\n  ' + golfGlanceHtml : ''}
  <div class="venue-section venue-key-info">
    <h2>Good to Know</h2>
    ${detailRows}
  </div>
  ${locationHtml}
  ${hoursHtml ? `<div class="venue-section venue-hours">${hoursHtml}</div>` : ''}
  ${guideLinks}
  ${relatedHtml}
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

function renderEventPage(event, hostVenue) {
  const regionLabel = REGION_LABELS[event.region];
  const canonical = `https://okanaganroam.com/${event.region}/events/${event.slug}`;
  const title = `${event.name} \u2014 Event in ${regionLabel}, BC | Okanagan Roam`;
  const rawDesc = event.description || `${event.name} is an event in ${regionLabel}, BC, listed on Okanagan Roam.`;
  const description = rawDesc.length > 155 ? rawDesc.slice(0, 152).replace(/\s+\S*$/, '') + '...' : rawDesc;
  const expired = isEventExpired(event);

  const breadcrumb = breadcrumbListSchema([
    { name: 'Home', url: 'https://okanaganroam.com/' },
    { name: regionLabel, url: `https://okanaganroam.com/${event.region}` },
    { name: event.name, url: canonical },
  ]);

  // schema.org Event — a distinct, correct type from the LocalBusiness
  // subtypes used for venues; only conditionally-real fields are included,
  // matching the existing venue JSON-LD's "never fabricate" convention.
  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': EVENT_SCHEMA_TYPE_MAP[event.type] || 'Event',
    name: event.name,
    description: event.description || undefined,
    startDate: event.start_datetime ? event.start_datetime.replace(' ', 'T') : undefined,
    endDate: event.end_datetime ? event.end_datetime.replace(' ', 'T') : undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    url: canonical,
    location: hostVenue
      ? { '@type': 'Place', name: hostVenue.name, address: hostVenue.address || undefined }
      : { '@type': 'Place', name: regionLabel },
  };

  const dateRangeText = event.end_datetime && event.end_datetime !== event.start_datetime
    ? `${event.start_datetime} \u2013 ${event.end_datetime}`
    : event.start_datetime;

  const detailRows = [
    ['When', escapeHtml(dateRangeText)],
    event.recurrence_rule ? ['Recurs', escapeHtml(event.recurrence_rule)] : null,
    ['Region', `<a href="/${event.region}">${escapeHtml(regionLabel)}</a>`],
    hostVenue ? ['Venue', `<a href="/${hostVenue.region}/${CATEGORY_SLUGS[hostVenue.type]}/${hostVenue.slug}">${escapeHtml(hostVenue.name)}</a>`] : null,
    event.website ? ['Website', `<a href="${escapeHtml(event.website)}" rel="nofollow noopener" target="_blank">${escapeHtml(event.website)}</a>`] : null,
  ].filter(Boolean)
    .map(([lbl, val]) => `<div class="detail-row"><span class="label">${escapeHtml(lbl)}</span><span>${val}</span></div>`)
    .join('\n');

  const imageHtml = event.image_url
    ? `<img src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.name)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:10px;margin-bottom:20px;">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, eventSchema], { noindex: expired })}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${event.region}` },
    { name: event.name },
  ])}
  ${imageHtml}
  <h1>${escapeHtml(event.name)}</h1>
  <p class="subtitle">Event in ${escapeHtml(regionLabel)}, BC${expired ? ' \u2014 this event has ended' : ''}</p>
  <p>${escapeHtml(event.description || '')}</p>
  ${detailRows}
  <a class="cta" href="/${event.region}">Explore all of ${escapeHtml(regionLabel)}</a>
  ${renderHomeFooterHTML(true)}
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

function renderTripPlannerPage() {
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
      .replace(/href="#exploreRegions"/g, 'href="/#exploreRegions"');
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
${renderTripPlannerStyles()}
</head>
<body class="page-trip">
${tripTrayHtml}
<div id="floatingTooltip"></div>
${headerHtml}

<main class="trip-planner-main wrap" id="tripPlannerMain">
  <nav class="trip-planner-breadcrumb"><a href="/">Home</a> &rsaquo; Build My Trip</nav>

  <section class="trip-conv-hero" id="tripConvHero">
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
<script src="/scripts/app.js"></script>
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
function renderBrowsePrefillScript() {
  return `
<script>
(function(){
  var params = new URLSearchParams(window.location.search);
  var types = params.get('types');
  var q = params.get('q');
  var openMap = params.get('openMap');
  function run(){
    if (types) {
      var wanted = types.split(',');
      document.querySelectorAll('.type-chip').forEach(function(chip){
        var shouldBePressed = wanted.indexOf(chip.dataset.type) !== -1;
        var isPressed = chip.getAttribute('aria-pressed') === 'true';
        if (shouldBePressed !== isPressed) chip.click();
      });
      document.dispatchEvent(new Event('wizard:showResults'));
    }
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
          .replace(/href="#exploreRegions"/g, 'href="/#exploreRegions"');

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
        const prefillScript = renderBrowsePrefillScript();
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
        `  <url>\n    <loc>https://okanaganroam.com/events</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`,
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

    // GET /trip — Build My Trip, Stage 2. A fixed, exact path, registered
    // before the generic /:region catch-all below for the same reason
    // /events is (otherwise "trip" would be treated as an unrecognized
    // region and 404). Static markup only — the actual itinerary is
    // generated client-side via a POST to /api/trip/generate (Stage 1).
    if (pathname === '/trip' && method === 'GET') {
      const html = renderTripPlannerPage();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // GET /events — the standalone events index (2026-09-17). A fixed,
    // exact path, so it's registered before the generic /:region catch-all
    // below (which would otherwise treat "events" as an unrecognized
    // region and 404 it). Same active-event criteria the old homepage
    // Happening Soon strip used, with no LIMIT — see renderEventsIndexPage().
    if (pathname === '/events' && method === 'GET') {
      const events = db.prepare(`
        SELECT * FROM events
        WHERE (end_datetime IS NOT NULL AND end_datetime >= datetime('now'))
           OR (end_datetime IS NULL AND start_datetime >= datetime('now'))
        ORDER BY start_datetime ASC
      `).all().map(rowToEvent);
      const html = renderEventsIndexPage(events);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
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
        if (event) {
          const hostVenue = event.venue_id ? getVenue(event.venue_id) : null;
          const html = renderEventPage(event, hostVenue);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }
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
      const venues = getVenuesByCategory(type);
      if (venues.length >= MIN_CATEGORY_VENUES) {
        const html = renderCategoryAllRegionsPage(type, venues);
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
  renderEventPage,
  pageHead,
  // Events index (2026-09-17)
  eventCardHtml,
  renderEventsIndexPage,
  // Build My Trip, Stage 2 (frontend)
  renderTripPlannerPage,
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
  dogFriendlyBadgeHtml,
  advisoryNoticeHtml,
  parseAdvisoryNote,
  renderAdvisoryStyles,
  renderBeachThemeStyles,
  deriveBeachRulesFromGolfCss,
  renderOutdoorThemeStyles,
  ACTIVITY_COLLECTION_KINDS,
  // Golf venue page polish (2026-09-20)
  renderGolfVenuePolishStyles,
  GOLF_AT_A_GLANCE_FACTS,
  golfAtAGlanceHtml,
  // Build My Trip, Stage 3 (price/amenity/discovery scoring + NL parser)
  TRIP_VALID_BUDGETS,
  budgetMatchesPrice,
  getCollectionVenueIds,
  getKnownDiscoveryKinds,
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
};
