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
  golf: { singular: 'Golf Course', plural: 'Golf Courses' },
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
  winery: '/images/mood/drink.png',
  restaurant: '/images/mood/eat.png',
  cafe: '/images/mood/eat.png',
  brewery: '/images/mood/eat.png',
  pub: '/images/mood/eat.png',
  cocktail: '/images/mood/eat.png',
  golf: '/images/mood/golf.png',
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

// Small, shared badge fragment — reuses the existing `.chip` styling
// convention already used by badgeChipsHtml, so no new CSS class or
// design-system addition is needed for this sprint's minimal scope.
function hiddenGemBadgeHtml() {
  return '<span class="chip hidden-gem-badge">\u{1F48E} Hidden Gem</span>';
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
  const cards = venues.map((v) => venueCardHtml(v, { showType: true, isHiddenGem: hiddenGemIds.has(v.id) })).join('\n');

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
  ${siteFooter()}
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
    img: '/images/hidden-gems/dog-friendly.png',
  },
  {
    titleKey: 'gems.localFavourites.title',
    title: 'Local Favourites',
    blurbKey: 'gems.localFavourites.blurb',
    blurb: 'The spots locals keep coming back to.',
    img: '/images/hidden-gems/local-favourites.png',
  },
  {
    titleKey: 'gems.secretSpots.title',
    title: 'Secret Spots',
    blurbKey: 'gems.secretSpots.blurb',
    blurb: 'Quiet corners away from the crowds.',
    img: '/images/hidden-gems/secret-spots.png',
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
      <img class="region-card-img" src="/images/regions/${region}.png" width="640" height="250" alt="" loading="lazy">
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
// travel photo (public/images/trip-cta.png, the map/sunglasses/water-
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
      <img class="trip-cta-img" src="/images/trip-cta.png" width="1600" height="656" alt="" loading="lazy">
      <div class="trip-cta-scrim"></div>
    </div>
    <button type="button" class="trip-cta-map" id="tripCtaOpenMap" aria-label="Open the interactive map" data-i18n-aria="trip.openMap">
      <img class="trip-cta-map-img" src="/images/trip-cta-map.png" width="1376" height="768" alt="" loading="lazy">
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
  const golfRegion = bestRegionForType.golf;
  const golfHref = golfRegion && CATEGORY_SLUGS.golf ? `/${golfRegion}/${CATEGORY_SLUGS.golf}` : '/browse';
  const wineRegion = bestRegionForType.winery;
  const wineHref = wineRegion && CATEGORY_SLUGS.winery ? `/${wineRegion}/${CATEGORY_SLUGS.winery}` : '/browse';

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
    { key: 'food-drink', href: '/browse?types=restaurant,cafe,brewery,pub,cocktail', filter: 'restaurant,cafe,brewery,pub,cocktail', img: '/images/mood/eat.png', titleKey: 'mood.foodDrink.title', title: 'Food & Drink' },
    { key: 'wine', href: wineHref, filter: 'winery', img: '/images/mood/drink.png', titleKey: 'mood.wine.title', title: 'Wine' },
    { key: 'beaches', href: '#exploreRegions', filter: null, img: '/images/mood/beaches.png', titleKey: 'mood.beaches.title', title: 'Beaches' },
    { key: 'golf', href: golfHref, filter: null, img: '/images/mood/golf.png', titleKey: 'mood.golf.title', title: 'Golf' },
    { key: 'whats-on', href: '/events', filter: null, img: '/images/mood/whats-on.png', titleKey: 'mood.whatsOn.title', title: "What's On" },
    { key: 'outdoors', href: '#exploreRegions', filter: null, img: '/images/mood/explore.png', titleKey: 'mood.outdoors.title', title: 'Outdoors' },
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
function renderHomeFooterHTML() {
  const bestRegionForType = bestRegionForCategoryType();
  const golfRegion = bestRegionForType.golf;
  const golfHref = golfRegion && CATEGORY_SLUGS.golf ? `/${golfRegion}/${CATEGORY_SLUGS.golf}` : '/browse';
  const wineRegion = bestRegionForType.winery;
  const wineHref = wineRegion && CATEGORY_SLUGS.winery ? `/${wineRegion}/${CATEGORY_SLUGS.winery}` : '/browse';

  const regionGroupsHtml = FOOTER_REGION_GROUPS.map((group) => {
    const links = group.regions
      .filter((region) => REGION_LABELS[region])
      .map((region) => `<li><a href="/${region}">${escapeHtml(REGION_LABELS[region])}</a></li>`)
      .join('\n');
    return `<div class="home-footer-region-group">
            <h5 data-i18n="${group.labelKey}">${escapeHtml(group.label)}</h5>
            <ul>${links}</ul>
          </div>`;
  }).join('\n');

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
          <li><a href="#exploreRegions" data-i18n="mood.beaches.title">Beaches</a></li>
          <li><a href="${golfHref}" data-i18n="mood.golf.title">Golf</a></li>
          <li><a href="/events" data-i18n="mood.whatsOn.title">What&rsquo;s On</a></li>
          <li><a href="#exploreRegions" data-i18n="mood.outdoors.title">Outdoors</a></li>
          <li><a href="#hiddenGems" data-i18n="gems.heading">Hidden Gems</a></li>
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
        <div class="home-footer-region-groups">${regionGroupsHtml}</div>
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
     natural next section rather than a distinct "command bar". */
  .browse-search-heading { margin-bottom: 16px; }
  .browse-search-heading .eyebrow {
    display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.82rem;
    letter-spacing: 0.09em; text-transform: uppercase; color: var(--teal); margin-bottom: 8px;
  }
  .browse-search-heading .eyebrow::before { content: ""; width: 20px; height: 2px; background: var(--teal); display: inline-block; }
  .browse-search-heading h2 {
    font-family: 'Fraunces', serif; font-size: clamp(1.4rem, 2.4vw, 1.8rem); margin: 6px 0 8px;
  }
  .browse-search-lead {
    font-family: 'Nunito', sans-serif; font-size: 0.95rem; color: rgba(42,32,25,0.72); margin: 0;
  }

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
  .home-footer { background: var(--ref-navy); color: var(--ref-cream); margin-top: 8px; padding: 0; }
  .home-footer-top {
    display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;
    gap: 48px; padding: 72px 0 48px;
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
    display: grid; grid-template-columns: 1fr 0.8fr 1.2fr 0.8fr;
    align-items: start; gap: 32px; flex: 1; min-width: 0;
  }
  .home-footer-col h4 {
    font-family: 'Nunito', sans-serif; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--ref-gold); margin: 0 0 14px;
  }
  .home-footer-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .home-footer-col a, .home-footer-region-group a {
    font-family: 'Nunito', sans-serif; font-size: 0.92rem; color: rgba(245,243,237,0.78);
    text-decoration: none; transition: color 0.15s;
  }
  .home-footer-col a:hover, .home-footer-region-group a:hover { color: var(--ref-gold); }

  /* Regions column (2026-09-17 revision, corrected same day): 20 real
     links inside one column, kept compact via the four wizard groups
     (Central/South/North/Ski resorts -- FOOTER_REGION_GROUPS above) with
     smaller type/tighter gaps than the other three columns, rather than
     shrinking to illegibility or overflowing the column.
     A rigid 2x2 CSS Grid (pairing Central with South, North with Ski
     resorts by POSITION) was tried first and measured to be the actual
     cause of the "messy" look reported: CSS Grid sizes a row to its
     tallest cell, so Central (4 links) was stretched to match South's
     height (7 links) in the same row, leaving a ~100px dead gap between
     Central's last link and the North heading below. Replaced with a
     CSS multi-column FLOW instead of a position-paired grid: the browser
     distributes the four group blocks across 2 columns by actual height
     (column-fill:balance, the default), so a short group is simply
     followed immediately by the next group in the same column rather
     than being stretched to match whatever tall group happened to land
     in the same row. break-inside:avoid keeps each group's heading+list
     together as one unit (never splits a group's links across the two
     columns). Still reads as a compact two-column list, per the brief --
     just without the artificial row-pairing dead space. */
  .home-footer-region-groups { column-count: 2; column-gap: 20px; }
  .home-footer-region-group {
    break-inside: avoid; -webkit-column-break-inside: avoid;
    margin-bottom: 18px;
  }
  .home-footer-region-group:last-child { margin-bottom: 0; }
  .home-footer-region-group h5 {
    font-family: 'Nunito', sans-serif; font-size: 0.72rem; font-weight: 700;
    color: rgba(245,243,237,0.55); margin: 0 0 8px;
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
  .home-footer-bottom { border-top: 1px solid rgba(245,243,237,0.14); padding: 24px 0 40px; }
  .home-footer-copyright { font-family: 'Nunito', sans-serif; font-size: 0.8rem; color: rgba(245,243,237,0.55); text-align: center; margin: 0; }

  /* Trip 0 button redesign, homepage-only (2026-09-17): #tripTray/
     #tripTrayToggle/#tripTrayCount are shared, site-wide rules defined in
     app.css (still used as-is on /browse, untouched) -- these overrides
     live only in this homepage-exclusive <style> block (never injected on
     /browse), so they win on specificity/source-order there and nowhere
     else. Direction: a small persistent "your trip" control, not a
     primary CTA -- smaller footprint, the homepage's own navy/cream/gold
     system instead of the old plum/paper/amber, a lighter shadow, and a
     smaller/quieter count badge, while leaving position (fixed, bottom
     corner, 20px from the edges -- already comfortable for tapping) and
     every bit of the click/expand/route/clear behavior untouched -- this
     only restyles the closed-state toggle and its count, never
     #tripTrayPanel (the expanded trip list keeps its existing look). */
  #tripTrayToggle {
    background: var(--ref-navy); color: var(--ref-cream);
    border: 1px solid rgba(245,243,237,0.16);
    border-radius: 999px; padding: 8px 14px; gap: 6px;
    font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 0.78rem;
    box-shadow: 0 4px 14px -6px rgba(16,27,36,0.45);
  }
  #tripTrayToggle:hover { background: var(--ref-navy-deep); }
  #tripTrayCount {
    background: var(--ref-gold); color: var(--ref-navy-deep);
    width: 16px; height: 16px; font-size: 0.62rem; font-weight: 800;
  }

  @media (max-width: 900px) {
    /* align-items:stretch override is required here: the base
       .home-footer-top rule sets align-items:flex-start for the desktop
       row layout, and that alone (even after flipping to
       flex-direction:column here) leaves .home-footer-cols sized to its
       own shrink-to-fit content width instead of the full row width --
       found via direct measurement (it was rendering at roughly half the
       viewport width instead of full width). */
    .home-footer-top { flex-direction: column; align-items: stretch; gap: 40px; padding: 56px 0 40px; }
    .home-footer-cols { grid-template-columns: repeat(2, 1fr); gap: 36px 32px; }
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
    .home-footer-top { padding: 36px 0 28px; gap: 28px; }
    .home-footer-col h4 { margin-bottom: 10px; }
    .home-footer-col ul { gap: 8px; }
    .home-footer-region-groups { column-gap: 16px; }
    .home-footer-region-group { margin-bottom: 14px; }
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
  }
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
`;

// Phase 1 (Events): `opts.noindex` is a new, optional, backward-compatible
// parameter. Every pre-existing call site (region/category/venue/guide
// pages) passes exactly 4 arguments, so `opts` defaults to `{}` and
// `opts.noindex` is `undefined` (falsy) for all of them — their output is
// byte-for-byte unchanged. Only a caller that explicitly passes
// `{ noindex: true }` (expired events) gets the extra robots meta tag.
function pageHead(title, description, canonical, jsonLdBlocks, opts = {}) {
  const { noindex = false } = opts;
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
  const { showType = false, isHiddenGem = false } = opts;
  const catSlug = CATEGORY_SLUGS[venue.type];
  const href = (venue.slug && catSlug) ? `/${venue.region}/${catSlug}/${venue.slug}` : null;
  const nameHtml = href
    ? `<a href="${href}">${escapeHtml(venue.name)}</a>`
    : escapeHtml(venue.name);
  const meta = [
    showType && venue.type ? escapeHtml(venue.type) : null,
    venue.cuisine ? escapeHtml(venue.cuisine) : null,
    venue.rating ? `${venue.rating}\u2605` : null,
  ].filter(Boolean).join(' &middot; ');
  const desc = venue.description ? `<p>${escapeHtml(venue.description)}</p>` : '';
  // Defensive: never show the badge for a retired/redirected venue, even
  // if a caller ever passed isHiddenGem=true for one by mistake — the
  // bulk/targeted lookups already exclude these, but this keeps the
  // guarantee local to the render function itself, not just its callers.
  const showBadge = isHiddenGem && !venue.redirect_to;
  return `
      <li class="venue-card">
        <h2>${nameHtml}</h2>
        <p class="venue-meta">${meta}</p>
        ${desc}
        <p class="chips">${showBadge ? hiddenGemBadgeHtml() + ' ' : ''}${badgeChipsHtml(venue)}</p>
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

  const hiddenGemIds = getHiddenGemVenueIds();
  const cards = venues.map((v) => venueCardHtml(v, { isHiddenGem: hiddenGemIds.has(v.id) })).join('\n');

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
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${region}` },
    { name: label.plural },
  ])}
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
    openingHoursSpecification: buildOpeningHoursSpecification(venue.hours),
  };

  const attributeChips = badgeChipsHtml(venue);
  const isHiddenGem = !venue.redirect_to && isVenueHiddenGem(venue.id);
  const hiddenGemChip = isHiddenGem ? hiddenGemBadgeHtml() + ' ' : '';

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
    ? `<div class="venue-hero venue-hero-photo"><img src="${escapeHtml(venue.image_url)}" alt="${escapeHtml(venue.name)}" loading="lazy"></div>`
    : `<div class="venue-hero venue-hero-fallback venue-hero-${venue.type}">
        <span class="venue-hero-type">${escapeHtml(label.singular)}</span>
        <span class="venue-hero-name">${escapeHtml(venue.name)}</span>
      </div>`;

  // At-a-glance summary strip — purely additive: every value shown here
  // already exists in `detailRows` below too. Nothing is removed from the
  // page by adding this; it's a second, higher-visibility presentation of
  // facts that were previously only available further down the page.
  const atAGlanceParts = [
    label.singular,
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
        ${mapsUrl ? `<a class="map-link" href="${mapsUrl}" rel="nofollow noopener" target="_blank">View on map \u2197</a>` : ''}
      </div>`
    : '';

  // CTA buttons — only ever rendered when the underlying data already
  // exists; nothing here fabricates a website, phone number, or address.
  const ctaButtons = [
    venue.website ? `<a class="cta" href="${escapeHtml(venue.website)}" rel="nofollow noopener" target="_blank">Visit Website</a>` : null,
    mapsUrl ? `<a class="cta secondary" href="${mapsUrl}" rel="nofollow noopener" target="_blank">Get Directions</a>` : null,
    venue.phone ? `<a class="cta secondary" href="tel:${escapeHtml(venue.phone)}">Call</a>` : null,
  ].filter(Boolean).join('\n  ');

  // One bulk lookup for all related+nearby cards together (reusing the
  // existing getHiddenGemVenueIds(), not a new query) -- O(1) Set lookups
  // per card below, not a per-card query, so this stays N+1-safe no
  // matter how many related/nearby venues render.
  const relatedNearbyHiddenGemIds = (relatedVenues.length || nearbyVenues.length) ? getHiddenGemVenueIds() : new Set();

  function relatedCard(v) {
    const meta = [v.cuisine, v.rating ? `${v.rating}\u2605` : null].filter(Boolean).join(' \u00b7 ');
    const badge = (relatedNearbyHiddenGemIds.has(v.id) && !v.redirect_to) ? hiddenGemBadgeHtml() : '';
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
${pageHead(title, description, canonical, [breadcrumb, localBusiness])}
</head>
<body>
  ${siteHeader('https://okanaganroam.com/', 'Explore the full directory \u2192')}
  ${breadcrumbNavHtml([
    { name: 'Home', href: '/' },
    { name: regionLabel, href: `/${venue.region}` },
    { name: label.plural, href: `/${venue.region}/${catSlug}` },
    { name: venue.name },
  ])}
  ${imageHtml}
  <div class="venue-header">
    <h1>${escapeHtml(venue.name)}</h1>
    <p class="venue-at-a-glance">${atAGlanceParts}</p>
    <p class="chips">${hiddenGemChip}${attributeChips}</p>
  </div>
  <p class="venue-description">${escapeHtml(venue.description || '')}</p>
  ${ctaButtons ? `<div class="venue-cta-row">\n  ${ctaButtons}\n</div>` : ''}
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
  ${siteFooter()}
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
  ${siteFooter()}
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
      const combos = listGuideCombos(MIN_GUIDE_VENUES);

      // Region pages: one per region that has at least one venue.
      const regionCounts = db
        .prepare('SELECT region, COUNT(*) AS n FROM venues WHERE redirect_to IS NULL GROUP BY region')
        .all()
        .filter((r) => REGION_LABELS[r.region] && r.n > 0);

      // Category pages: one per region+type combo that has at least one
      // venue — computed live, same pattern as the guide-page combos above.
      const categoryCombos = db
        .prepare('SELECT region, type, COUNT(*) AS n FROM venues WHERE redirect_to IS NULL GROUP BY region, type')
        .all()
        .filter((r) => REGION_LABELS[r.region] && CATEGORY_SLUGS[r.type] && r.n > 0);

      // Venue pages: every venue that has a real, non-null slug (should be
      // all of them after the startup backfill, but this guards against any
      // edge case rather than emitting a broken sitemap entry).
      const venueRows = db
        .prepare('SELECT region, type, slug FROM venues WHERE slug IS NOT NULL AND redirect_to IS NULL')
        .all()
        .filter((v) => REGION_LABELS[v.region] && CATEGORY_SLUGS[v.type]);

      const urlEntries = [
        `  <url>\n    <loc>https://okanaganroam.com/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
        `  <url>\n    <loc>https://okanaganroam.com/events</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`,
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
        // Phase 1 (Events architecture gate): only non-expired events —
        // listEventsForSitemap() already applies the same "don't advertise
        // dead pages" filtering the venue rows above get via redirect_to.
        ...listEventsForSitemap()
          .filter((e) => REGION_LABELS[e.region])
          .map(
            ({ region, slug }) =>
              `  <url>\n    <loc>https://okanaganroam.com/${region}/events/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
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
  listGuideCombos,
  getStats,
  renderVenuePage,
  renderCategoryPage,
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
  // Phase 2 Sprint 2 (Event Types)
  EVENT_SCHEMA_TYPE_MAP,
  // Phase 2 Sprint 3 (Hidden Gems)
  getHiddenGemVenueIds,
  isVenueHiddenGem,
  hiddenGemBadgeHtml,
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
