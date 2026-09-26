// Golf course data (2026-09-26): verified green fees, course profiles and
// links to official course maps/scorecards, for golf-course pages only.
//
// Source of truth is data/golf-course-data.json (reviewed; every fee copied
// from the course's official website with its source URL and date). At
// startup db.js calls initGolfData(), which validates that file and, only if
// it changed, rebuilds the golf_* tables in one transaction. Rows are keyed
// by "region/slug" and are only ever attached to venues whose type is
// 'golf', so a clubhouse-restaurant record that shares a golf club's slug
// never picks them up. Nothing here touches the venues table, so the
// /api/venues output is unchanged.
//
// Loaded with a guarded require (db.js and server.js), so a copy of the app
// without this file keeps working exactly as before.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data', 'golf-course-data.json');

const FEE_STATUSES = ['published', 'dynamic', 'not_published', 'private', 'unverified', 'not_applicable'];
const RATE_CATEGORIES = ['standard', 'twilight', 'super_twilight', 'senior', 'junior', 'replay', 'resident', 'other'];
const COURSE_FORMATS = ['regulation', 'mid_length', 'executive', 'par3', 'practice_facility', 'indoor'];
const MEDIA_KINDS = ['course_map', 'hole_by_hole', 'scorecard', 'course_tour'];
const TAX_VALUES = ['plus_tax', 'plus_gst', 'included', 'unstated'];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS golf_course_profiles (
  venue_key TEXT PRIMARY KEY,
  holes INTEGER,
  par INTEGER,
  yardage INTEGER,
  course_format TEXT,
  access TEXT,
  source_url TEXT,
  source_note TEXT
);
CREATE TABLE IF NOT EXISTS golf_fee_sets (
  venue_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  season_year INTEGER,
  season_year_stated INTEGER,
  tax TEXT,
  source_url TEXT,
  verification TEXT,
  verified_at TEXT,
  note TEXT
);
CREATE TABLE IF NOT EXISTS golf_green_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  category TEXT NOT NULL,
  holes INTEGER,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'CAD',
  price_basis TEXT NOT NULL DEFAULT 'fixed',
  includes_cart INTEGER,
  includes_range INTEGER,
  walking INTEGER,
  season_label TEXT,
  valid_from TEXT,
  valid_to TEXT,
  time_window TEXT,
  conditions TEXT,
  is_comparison INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_golf_green_fees_venue ON golf_green_fees(venue_key);
CREATE TABLE IF NOT EXISTS golf_course_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  owner TEXT,
  rights_status TEXT NOT NULL DEFAULT 'link_only',
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS golf_course_facilities (
  venue_key TEXT PRIMARY KEY,
  driving_range INTEGER,
  putting_green INTEGER,
  short_game INTEGER,
  source TEXT
);
CREATE TABLE IF NOT EXISTS golf_data_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHttps = (v) => typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v);

// Returns a list of problems; an empty list means the file may be loaded.
function validateGolfData(data) {
  const problems = [];
  if (!data || typeof data !== 'object' || !data.courses || typeof data.courses !== 'object') {
    return ['data file has no "courses" object'];
  }
  if (data.value_index != null) {
    const vx = data.value_index;
    if (!Number.isInteger(vx.season_year)) problems.push('value_index.season_year must be a year');
    for (const g of VALUE_GROUPS.map((x) => x[0])) {
      const fee = vx.reference_fees && vx.reference_fees[g];
      if (!(typeof fee === 'number' && fee > 0)) problems.push(`value_index.reference_fees.${g} must be a positive amount`);
    }
  }
  for (const [key, c] of Object.entries(data.courses)) {
    const at = (m) => problems.push(`${key}: ${m}`);
    if (!/^[a-z-]+\/[a-z0-9-]+$/.test(key)) at('key must be region/slug');
    const p = c.profile || {};
    if (p.course_format != null && !COURSE_FORMATS.includes(p.course_format)) at(`unknown course_format ${p.course_format}`);
    if (p.holes != null && ![9, 18, 27, 36].includes(p.holes)) at(`unexpected holes ${p.holes}`);
    const f = c.fees;
    if (!f || !FEE_STATUSES.includes(f.status)) { at('missing or unknown fees.status'); continue; }
    if (f.tax != null && !TAX_VALUES.includes(f.tax)) at(`unknown tax ${f.tax}`);
    if (f.source_url != null && !isHttps(f.source_url)) at('fees.source_url must be a URL');
    if (!isDate(f.verified_at)) at('fees.verified_at must be YYYY-MM-DD');
    const rates = f.rates || [];
    if (f.status === 'published') {
      if (!f.source_url) at('published fees need a source_url');
      if (!Number.isInteger(f.season_year)) at('published fees need a season_year');
      if (rates.filter((r) => r.comparison).length !== 1) at('published fees need exactly one comparison rate');
    } else if (rates.some((r) => r.comparison)) {
      at('only published fee sets may have a comparison rate');
    }
    rates.forEach((r, i) => {
      if (!RATE_CATEGORIES.includes(r.category)) at(`rate ${i}: unknown category ${r.category}`);
      if (!(typeof r.amount === 'number' && r.amount > 0 && r.amount < 1000)) at(`rate ${i}: bad amount`);
      if (r.holes != null && ![9, 18, 27, 36].includes(r.holes)) at(`rate ${i}: bad holes`);
      if (!['fixed', 'from'].includes(r.price_basis || 'fixed')) at(`rate ${i}: bad price_basis`);
      for (const d of ['valid_from', 'valid_to']) if (r[d] != null && !isDate(r[d])) at(`rate ${i}: bad ${d}`);
      if (r.comparison && (r.category !== 'standard' || r.holes == null)) at(`rate ${i}: the comparison rate must be a standard rate with holes`);
    });
    if (c.facilities != null) {
      const fac = c.facilities;
      for (const k of Object.keys(fac)) if (!['driving_range', 'putting_green', 'short_game', 'source'].includes(k)) at(`facilities: unknown key ${k}`);
      for (const k of ['driving_range', 'putting_green', 'short_game']) if (k in fac && typeof fac[k] !== 'boolean') at(`facilities.${k} must be true or false (omit it when not documented)`);
      if (!fac.source) at('facilities need a source');
    }
    (c.media || []).forEach((m, i) => {
      if (!MEDIA_KINDS.includes(m.kind)) at(`media ${i}: unknown kind ${m.kind}`);
      if (!isHttps(m.url)) at(`media ${i}: url must be a web page URL`);
      if (/\.(png|jpe?g|gif|webp|svg|pdf)(\?|$)/i.test(m.url || '')) at(`media ${i}: link to the club's page, not directly to a file`);
      if (m.rights_status !== 'link_only') at(`media ${i}: only link_only media is allowed without recorded permission`);
    });
  }
  return problems;
}

// Rebuilds the golf tables from `data` when its content hash changed.
// Returns { loaded, reason }. Never throws for bad data: invalid data leaves
// the existing tables untouched.
function loadGolfData(db, data, { force = false } = {}) {
  db.exec(SCHEMA_SQL);
  const problems = validateGolfData(data);
  if (problems.length) return { loaded: false, reason: 'invalid', problems };
  const sha = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const current = db.prepare("SELECT value FROM golf_data_meta WHERE key = 'content_sha'").get();
  if (!force && current && current.value === sha) return { loaded: false, reason: 'unchanged' };
  const insProfile = db.prepare(`INSERT INTO golf_course_profiles (venue_key, holes, par, yardage, course_format, access, source_url, source_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insSet = db.prepare(`INSERT INTO golf_fee_sets (venue_key, status, season_year, season_year_stated, tax, source_url, verification, verified_at, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insFee = db.prepare(`INSERT INTO golf_green_fees (venue_key, position, category, holes, amount_cents, currency, price_basis,
    includes_cart, includes_range, walking, season_label, valid_from, valid_to, time_window, conditions, is_comparison)
    VALUES (?, ?, ?, ?, ?, 'CAD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insFacilities = db.prepare(`INSERT INTO golf_course_facilities (venue_key, driving_range, putting_green, short_game, source)
    VALUES (?, ?, ?, ?, ?)`);
  const insMedia = db.prepare(`INSERT INTO golf_course_media (venue_key, position, kind, url, label, owner, rights_status, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const nul = (v) => (v === undefined ? null : v);
  const bool = (v) => (v === true ? 1 : v === false ? 0 : null);
  db.exec('BEGIN');
  try {
    for (const t of ['golf_course_profiles', 'golf_fee_sets', 'golf_green_fees', 'golf_course_media', 'golf_course_facilities']) db.exec(`DELETE FROM ${t}`);
    for (const [key, c] of Object.entries(data.courses)) {
      const p = c.profile || {};
      insProfile.run(key, nul(p.holes), nul(p.par), nul(p.yardage), nul(p.course_format), nul(p.access), nul(p.source_url), nul(p.source_note));
      const f = c.fees;
      insSet.run(key, f.status, nul(f.season_year), f.season_year_stated == null ? null : (f.season_year_stated ? 1 : 0),
        nul(f.tax), nul(f.source_url), nul(f.verification), nul(f.verified_at), nul(f.note));
      (f.rates || []).forEach((r, i) => insFee.run(key, i, r.category, nul(r.holes), Math.round(r.amount * 100),
        r.price_basis || 'fixed', bool(r.includes_cart), bool(r.includes_range), bool(r.walking), nul(r.season_label),
        nul(r.valid_from), nul(r.valid_to), nul(r.time_window), nul(r.conditions), r.comparison ? 1 : 0));
      if (c.facilities) {
        const fac = c.facilities;
        insFacilities.run(key, bool(fac.driving_range), bool(fac.putting_green), bool(fac.short_game), fac.source);
      }
      (c.media || []).forEach((m, i) => insMedia.run(key, i, m.kind, m.url, nul(m.label), nul(m.owner), m.rights_status, nul(m.verified_at)));
    }
    db.prepare("INSERT OR REPLACE INTO golf_data_meta (key, value) VALUES ('value_index', ?)").run(JSON.stringify(data.value_index || null));
    db.prepare("INSERT OR REPLACE INTO golf_data_meta (key, value) VALUES ('content_sha', ?)").run(sha);
    db.prepare("INSERT OR REPLACE INTO golf_data_meta (key, value) VALUES ('loaded_at', ?)").run(new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { loaded: true, reason: force ? 'forced' : 'changed' };
}

// Startup hook used by db.js.
function initGolfData(db, file = DATA_FILE) {
  db.exec(SCHEMA_SQL);
  if (!fs.existsSync(file)) return { loaded: false, reason: 'no data file' };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[golf-data] ${file} is not valid JSON; golf data left unchanged`);
    return { loaded: false, reason: 'unreadable' };
  }
  const res = loadGolfData(db, data);
  if (res.reason === 'invalid') console.error(`[golf-data] data file rejected; golf data left unchanged:\n  ${res.problems.join('\n  ')}`);
  return res;
}

// ---------- reads -------------------------------------------------------------

const venueKey = (v) => `${v.region}/${v.slug}`;

// One query per table for a whole page. Only golf venues are looked up.
function getGolfDetails(db, venues) {
  const keys = [...new Set(venues.filter((v) => v && v.type === 'golf' && v.slug).map(venueKey))];
  const out = new Map();
  if (!keys.length) return out;
  const marks = keys.map(() => '?').join(',');
  const rows = (sql) => {
    try { return db.prepare(sql.replace('%K', marks)).all(...keys); } catch (e) { return []; }
  };
  for (const k of keys) out.set(k, { profile: null, feeSet: null, rates: [], media: [], facilities: null });
  for (const r of rows('SELECT * FROM golf_course_profiles WHERE venue_key IN (%K)')) out.get(r.venue_key).profile = r;
  for (const r of rows('SELECT * FROM golf_fee_sets WHERE venue_key IN (%K)')) out.get(r.venue_key).feeSet = r;
  for (const r of rows('SELECT * FROM golf_green_fees WHERE venue_key IN (%K) ORDER BY position')) out.get(r.venue_key).rates.push(r);
  for (const r of rows('SELECT * FROM golf_course_media WHERE venue_key IN (%K) ORDER BY position')) out.get(r.venue_key).media.push(r);
  for (const r of rows('SELECT * FROM golf_course_facilities WHERE venue_key IN (%K)')) out.get(r.venue_key).facilities = r;
  let valueRef = null;
  try {
    const m = db.prepare("SELECT value FROM golf_data_meta WHERE key = 'value_index'").get();
    valueRef = m ? JSON.parse(m.value) : null;
  } catch (e) { valueRef = null; }
  for (const d of out.values()) d.valueReference = valueRef;
  for (const [k, d] of out) if (!d.profile && !d.feeSet && !d.media.length) out.delete(k);
  return out;
}

const isPracticeFacility = (detail) => !!(detail && detail.profile && detail.profile.course_format === 'practice_facility');

// ---------- freshness & comparison ---------------------------------------------

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// current          – rates for this calendar year
// previous_season  – last year's rates: shown, clearly labelled as last published
// stale            – older, or verified more than 400 days ago: not shown, not sorted
function feeFreshness(feeSet, today = todayIso()) {
  if (!feeSet || !['published', 'dynamic'].includes(feeSet.status)) return 'none';
  const year = Number(today.slice(0, 4));
  const ageDays = (Date.parse(today) - Date.parse(feeSet.verified_at || '1970-01-01')) / 86400000;
  if (!(ageDays <= 400)) return 'stale';
  if (feeSet.season_year === year) return 'current';
  if (feeSet.season_year === year - 1) return 'previous_season';
  return 'stale';
}

function comparisonRate(detail, today = todayIso()) {
  if (!detail || !detail.feeSet || detail.feeSet.status !== 'published') return null;
  const fresh = feeFreshness(detail.feeSet, today);
  if (fresh !== 'current' && fresh !== 'previous_season') return null;
  return detail.rates.find((r) => r.is_comparison === 1) || null;
}

// Sort value in cents, or null when the course cannot be price-sorted.
function comparisonCents(detail, today = todayIso()) {
  const r = comparisonRate(detail, today);
  return r ? r.amount_cents : null;
}

// ---------- formatting -----------------------------------------------------------

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function formatCad(cents) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}`;
}

const CATEGORY_LABELS = {
  standard: 'Standard', twilight: 'Twilight', super_twilight: 'Late twilight', senior: 'Senior',
  junior: 'Junior', replay: 'Replay', resident: 'Resident', other: 'Other',
};
const TAX_TEXT = { plus_tax: 'plus tax', plus_gst: 'plus GST', included: 'tax included', unstated: 'tax not stated' };

function priceText(r) {
  return `${r.price_basis === 'from' ? 'from ' : ''}${formatCad(r.amount_cents)}`;
}
function holesText(h) {
  return h ? `${h} holes` : '';
}
function whenText(r, year) {
  const dates = r.valid_from && r.valid_to ? `${shortDate(r.valid_from)}–${shortDate(r.valid_to)}, ${r.valid_to.slice(0, 4)}`
    : r.valid_from ? `from ${shortDate(r.valid_from)}, ${r.valid_from.slice(0, 4)}`
      : r.valid_to ? `until ${shortDate(r.valid_to)}, ${r.valid_to.slice(0, 4)}` : '';
  return [r.season_label, dates && !(r.season_label || '').includes(dates) ? dates : '', r.time_window].filter(Boolean).join(' · ');
}
function includesText(r) {
  return [r.includes_cart === 1 ? 'incl. cart' : null, r.includes_range === 1 ? 'incl. range' : null,
    r.walking === 1 ? 'walking' : null].filter(Boolean).join(' · ');
}

function seasonNote(feeSet, today) {
  const fresh = feeFreshness(feeSet, today);
  if (fresh === 'previous_season') return `${feeSet.season_year} rates, last published — not yet checked for ${Number(today.slice(0, 4))}`;
  if (feeSet.season_year_stated) return `${feeSet.season_year} rates`;
  return `Rates as published, checked ${MONTHS[Number(feeSet.verified_at.slice(5, 7)) - 1]} ${feeSet.verified_at.slice(0, 4)}`;
}

const STATUS_TEXT = {
  not_published: 'Green fees not published online',
  private: 'Private club — members and guests only',
  unverified: 'Green fees not yet verified',
  dynamic: 'Dynamic pricing — regular rates not published',
};

// The price line on a listing card ('' when there is no golf fee data).
function golfCardFeeHtml(detail, today = todayIso()) {
  if (!detail || !detail.feeSet || detail.feeSet.status === 'not_applicable') return '';
  const r = comparisonRate(detail, today);
  if (r) {
    const bits = [holesText(r.holes), includesText(r), TAX_TEXT[detail.feeSet.tax] && detail.feeSet.tax !== 'unstated' ? TAX_TEXT[detail.feeSet.tax] : null].filter(Boolean);
    const when = [r.season_label, r.time_window].filter(Boolean).join(', ');
    return `<p class="golf-fee"><span class="golf-fee-price">${esc(priceText(r))}</span> <span class="golf-fee-detail">· ${esc(bits.join(' · '))}</span></p>
        <p class="golf-fee-note">Standard adult rate${when ? ` · ${esc(when)}` : ''} · ${esc(seasonNote(detail.feeSet, today))}</p>`;
  }
  const fresh = feeFreshness(detail.feeSet, today);
  const text = fresh === 'stale' ? 'Green fees not currently verified' : STATUS_TEXT[detail.feeSet.status];
  return text ? `<p class="golf-fee golf-fee-none">${esc(text)}</p>` : '';
}

// ---------- sorting ------------------------------------------------------------------

const GOLF_SORTS = ['recommended', 'price-asc', 'price-desc', 'name'];
function parseGolfSort(query) {
  const v = query && (typeof query.sort === 'string' ? query.sort : Array.isArray(query.sort) ? query.sort[0] : null);
  return GOLF_SORTS.includes(v) ? v : 'recommended';
}

// Priced courses by their comparison rate (ties by name); courses without a
// sortable rate follow, by name. 'recommended' keeps the existing order.
function sortGolfCourses(courses, details, sort, today = todayIso()) {
  if (sort === 'recommended') return courses.slice();
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (sort === 'name') return courses.slice().sort(byName);
  const cents = (v) => comparisonCents(details.get(venueKey(v)), today);
  const priced = courses.filter((v) => cents(v) != null);
  const unpriced = courses.filter((v) => cents(v) == null).sort(byName);
  const dir = sort === 'price-desc' ? -1 : 1;
  priced.sort((a, b) => (cents(a) - cents(b)) * dir || byName(a, b));
  return priced.concat(unpriced);
}

function hasSortablePrices(courses, details, today = todayIso()) {
  return courses.some((v) => comparisonCents(details.get(venueKey(v)), today) != null);
}

function golfSortNavHtml(basePath, sort) {
  const opts = [['recommended', 'Recommended'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name: A–Z']];
  const items = opts.map(([key, label]) => (key === sort
    ? `<span class="category-region-selector-active" aria-current="true">${label}</span>`
    : `<a href="${esc(basePath)}${key === 'recommended' ? '' : `?sort=${key}`}" rel="nofollow">${label}</a>`)).join('\n      ');
  const note = sort === 'price-asc' || sort === 'price-desc'
    ? `\n    <p class="golf-sort-note">Sorted by each course’s standard adult green fee for its standard round (9 or 18 holes), at prime time in peak season, as published by the course. 9-hole and 18-hole rounds are labelled, never converted, and some rates include a cart. Courses without a published rate are listed last.</p>`
    : '';
  return `<nav class="category-region-selector golf-sort" aria-label="Sort golf courses">
      <span class="golf-sort-label">Sort:</span>
      ${items}
    </nav>${note}`;
}

// ---------- venue page sections --------------------------------------------------------

function golfFeesSectionHtml(detail, today = todayIso()) {
  if (!detail || !detail.feeSet || detail.feeSet.status === 'not_applicable') return '';
  const f = detail.feeSet;
  const fresh = feeFreshness(f, today);
  const source = f.source_url
    ? `<a href="${esc(f.source_url)}" rel="nofollow noopener" target="_blank">the course’s official website ↗</a>`
    : 'the course';
  if (!['published', 'dynamic'].includes(f.status) || fresh === 'stale') {
    const text = fresh === 'stale' ? 'Green fees not currently verified' : STATUS_TEXT[f.status];
    return `<div class="venue-section golf-fees" id="green-fees">
    <h2>Green fees</h2>
    <p class="golf-fees-none">${esc(text)}.${f.status === 'private' ? '' : ` Check current rates on ${source}.`}</p>
  </div>`;
  }
  const cmp = comparisonRate(detail, today);
  const headline = cmp
    ? `<p class="golf-fees-headline"><span class="golf-fee-price">${esc(priceText(cmp))}</span> <span class="golf-fee-detail">· ${esc([holesText(cmp.holes), includesText(cmp)].filter(Boolean).join(' · '))}</span>
      <span class="golf-fees-headline-note">Standard adult rate${whenText(cmp) ? ` · ${esc(whenText(cmp))}` : ''}</span></p>`
    : '';
  const rows = detail.rates.map((r) => `<tr${r.is_comparison ? ' class="is-comparison"' : ''}>
          <th scope="row">${esc(CATEGORY_LABELS[r.category] || r.category)}${r.conditions ? `<span class="golf-fee-cond">${esc(r.conditions)}</span>` : ''}</th>
          <td>${esc(holesText(r.holes) || '—')}</td>
          <td>${esc(whenText(r) || 'All season')}${includesText(r) ? `<span class="golf-fee-cond">${esc(includesText(r))}</span>` : ''}</td>
          <td class="golf-fee-amount">${esc(priceText(r))}</td>
        </tr>`).join('');
  const meta = [seasonNote(f, today), TAX_TEXT[f.tax] || null].filter(Boolean).join(' · ');
  return `<div class="venue-section golf-fees" id="green-fees">
    <h2>Green fees</h2>
    ${f.status === 'dynamic' ? `<p class="golf-fees-none">${esc(STATUS_TEXT.dynamic)}; published fixed rates are listed below.</p>` : headline}
    <div class="golf-fees-table-wrap"><table class="golf-fees-table">
      <thead><tr><th scope="col">Rate</th><th scope="col">Holes</th><th scope="col">When</th><th scope="col">Price (CAD)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="golf-fees-meta">${esc(meta)}.${f.note ? ` ${esc(f.note)}` : ''}</p>
    <p class="golf-fees-source">Source: ${source}, checked ${esc(longDate(f.verified_at))}. Rates change — confirm with the course before you go.</p>
  </div>`;
}

const MEDIA_BUTTON = { course_map: 'View course map', hole_by_hole: 'View hole-by-hole', scorecard: 'View scorecard', course_tour: 'View course tour' };
const MEDIA_HEADING = { course_map: 'Course map', hole_by_hole: 'Course map', scorecard: 'Scorecard', course_tour: 'Course tour' };

function golfCourseMapHtml(detail) {
  if (!detail || !detail.media || !detail.media.length) return '';
  const media = detail.media.filter((m) => m.rights_status === 'link_only' && /^https?:\/\//.test(m.url));
  if (!media.length) return '';
  const first = media[0];
  const heading = MEDIA_HEADING[first.kind] || 'Course map';
  const buttons = media.map((m, i) => `<a class="cta${i ? ' secondary' : ''} golf-map-cta" href="${esc(m.url)}" rel="nofollow noopener" target="_blank">${esc(MEDIA_BUTTON[m.kind] || 'View')} ↗</a>`).join('\n      ');
  const owner = first.owner ? `the official website of ${esc(first.owner)}` : 'the club’s official website';
  return `<div class="venue-section golf-map-callout">
    <div class="golf-map-text">
      <h2>${esc(heading)}</h2>
      <p>${esc(first.label || heading)} — see the layout before you play, on the club’s official website.</p>
    </div>
    <div class="golf-map-links">
      ${buttons}
    </div>
    <p class="golf-map-credit">Opens ${owner} in a new tab. Course maps and scorecards belong to the club; Okanagan Roam links to them and does not copy them.</p>
  </div>`;
}

// ---------- Okanagan Roam Value Index (approved 2026-09-26) -------------------------------
// Editorial, deterministic, out of 100:
//   70  price for the golf you get, compared like with like: each course is
//       compared only with its own group (18-hole championship, 18-hole
//       executive/mid-length, 9-hole) against that group's fixed reference
//       green fee for the season (data file: value_index.reference_fees).
//       Price points = 49 x (reference fee / course's standard green fee),
//       rounded to a whole point and capped at 70. Smooth: at the reference
//       fee 49, 1.5x about 33, 2x about 25, 3x about 16; never zero; 70% of
//       the reference or less earns the full 70;
//   15  included in that green fee: power cart 10, range balls/range use 5;
//   15  documented practice facilities: driving range 7, putting green 4,
//       short-game area 4. "Not documented" earns nothing but is never "No",
//       and never makes a course ineligible.
// Calculated only from a published, current-season standard rate for the
// course's own round, on a course with a verified hole count and par, when a
// reference fee exists for that season. Never estimated; never a user rating.
const VALUE_PRICE_MAX = 70;
const VALUE_AT_REFERENCE = 49;
const VALUE_GROUPS = [
  ['championship_18', '18-hole championship courses'],
  ['short_18', '18-hole executive and mid-length courses'],
  ['nine_hole', '9-hole courses'],
];
const VALUE_INCLUDED = { cart: 10, range: 5 };
const VALUE_FACILITIES = [['driving_range', 'Driving range', 7], ['putting_green', 'Putting green', 4], ['short_game', 'Short-game area', 4]];
const VALUE_BANDS = [[75, 'Excellent value'], [60, 'Great value'], [45, 'Good value'], [30, 'Fair value'], [0, 'Premium-priced']];

function valueGroup(profile) {
  if (!profile) return null;
  if (profile.holes === 9) return 'nine_hole';
  if (profile.holes === 18 && profile.course_format === 'regulation') return 'championship_18';
  if (profile.holes === 18 && ['mid_length', 'executive'].includes(profile.course_format)) return 'short_18';
  return null;
}

function valueLabel(score) {
  return VALUE_BANDS.find(([min]) => score >= min)[1];
}

// null  -> not a rateable course here (no golf data, practice facility, simulator)
// { available: false } -> "Value index unavailable"
// { available: true, score, label, price, included, facilities, basis }
function computeValueIndex(detail, today = todayIso()) {
  if (!detail || !detail.feeSet || detail.feeSet.status === 'not_applicable' || isPracticeFacility(detail)) return null;
  const unavailable = { available: false };
  const f = detail.feeSet;
  if (f.status !== 'published' || feeFreshness(f, today) !== 'current') return unavailable;
  const cmp = detail.rates.find((r) => r.is_comparison === 1);
  const p = detail.profile || {};
  if (!cmp || !p.par || !p.holes || cmp.holes !== p.holes) return unavailable;
  const group = valueGroup(p);
  const ref = detail.valueReference;
  const refFee = group && ref && ref.season_year === f.season_year && ref.reference_fees ? ref.reference_fees[group] : null;
  if (!(typeof refFee === 'number' && refFee > 0)) return unavailable;
  const dollars = cmp.amount_cents / 100;
  const pricePoints = Math.min(VALUE_PRICE_MAX, Math.round(VALUE_AT_REFERENCE * refFee / dollars));
  const included = [];
  if (cmp.includes_cart === 1) included.push({ name: 'Power cart', points: VALUE_INCLUDED.cart });
  if (cmp.includes_range === 1) included.push({ name: 'Range balls / range use', points: VALUE_INCLUDED.range });
  const fac = detail.facilities || {};
  const facilities = VALUE_FACILITIES.map(([key, name, pts]) => {
    const v = fac[key];
    const status = v === 1 ? 'yes' : v === 0 ? 'no' : 'not_documented';
    return { key, name, status, points: status === 'yes' ? pts : 0, max: pts };
  });
  const includedPoints = included.reduce((a, x) => a + x.points, 0);
  const facilityPoints = facilities.reduce((a, x) => a + x.points, 0);
  const score = pricePoints + includedPoints + facilityPoints;
  return {
    available: true,
    score,
    label: valueLabel(score),
    price: { points: pricePoints, max: VALUE_PRICE_MAX, dollars, from: cmp.price_basis === 'from', holes: cmp.holes, group, groupLabel: VALUE_GROUPS.find((x) => x[0] === group)[1], referenceFee: refFee, referenceYear: ref.season_year },
    included: { points: includedPoints, max: 15, items: included },
    facilities: { points: facilityPoints, max: 15, items: facilities },
    basis: `Based on ${f.season_year} rates · Checked ${MONTHS[Number(f.verified_at.slice(5, 7)) - 1]} ${Number(f.verified_at.slice(8, 10))}, ${f.verified_at.slice(0, 4)}`,
  };
}

function valueHeadline(vi) {
  return `Okanagan Roam Value Index: ${vi.score}/100 · ${vi.label}`;
}

function golfCardValueHtml(detail, today = todayIso()) {
  const vi = computeValueIndex(detail, today);
  if (!vi) return '';
  return vi.available
    ? `<p class="golf-value">${esc(valueHeadline(vi))}</p>`
    : '<p class="golf-value golf-value-none">Value index unavailable</p>';
}

function golfValueSectionHtml(detail, today = todayIso()) {
  const vi = computeValueIndex(detail, today);
  if (!vi) return '';
  if (!vi.available) {
    return `<div class="venue-section golf-value-section" id="value-index">
    <h2>Value for money</h2>
    <p class="golf-value-none">Value index unavailable</p>
  </div>`;
  }
  const pr = vi.price;
  const bar = (pts, max) => `<span class="golf-value-bar" aria-hidden="true"><span style="width:${Math.round((pts / max) * 100)}%"></span></span>`;
  const priceWhy = `${pr.from ? 'from ' : ''}${formatCad(Math.round(pr.dollars * 100))} for ${pr.holes} holes \u00b7 Compared with other ${pr.groupLabel} (${pr.referenceYear} reference fee: ${formatCad(Math.round(pr.referenceFee * 100))})`;
  const inclWhy = vi.included.items.length ? vi.included.items.map((x) => `${x.name} (+${x.points})`).join(', ') : 'Nothing extra included in the standard rate';
  const facWhy = vi.facilities.items.map((x) => `${x.name}: ${x.status === 'yes' ? `yes (+${x.points})` : x.status === 'no' ? 'no' : 'not documented'}`).join(' · ');
  const row = (name, part, why) => `<div class="golf-value-row">
        <div class="golf-value-row-head"><span class="golf-value-name">${esc(name)}</span><span class="golf-value-pts">${part.points} / ${part.max}</span></div>
        ${bar(part.points, part.max)}
        <p class="golf-value-why">${esc(why)}</p>
      </div>`;
  return `<div class="venue-section golf-value-section" id="value-index">
    <h2>Value for money</h2>
    <p class="golf-value-headline">${esc(valueHeadline(vi))}</p>
    <div class="golf-value-rows">
      ${row('Price for the golf you get', vi.price, priceWhy)}
      ${row('Included in the green fee', vi.included, inclWhy)}
      ${row('Practice facilities', vi.facilities, facWhy)}
    </div>
    <p class="golf-value-basis">${esc(vi.basis)}</p>
    <p class="golf-value-about">An Okanagan Roam editorial calculation based on the course’s published standard green fee, what that fee includes, and documented practice facilities — not a user review. Each course is compared only with courses of the same kind. Price points are 49 \u00d7 the group\u2019s reference fee \u00f7 the course\u2019s standard green fee, up to 70: 49 at the reference fee, fewer when the fee is higher (about 25 at twice the reference, never zero), more when it is lower. A cart included in the fee adds 10 and range use 5; a documented driving range adds 7, putting green 4 and short-game area 4. Facilities that are not documented earn no points.</p>
  </div>`;
}

// Golf-only styles (emitted only on golf pages). Colours are the homepage
// tokens; no [data-venue-category="golf"] selectors, so the Beach/Outdoor
// themes (derived from those rules) are unaffected.
const GOLF_DATA_CSS = `<style>
  /* Golf data (2026-09-26): green fees, price sort, course-map link. */
  body.golf-page .golf-fee { margin: 2px 0 0; font-size: 0.92rem; color: var(--ink); }
  body.golf-page .golf-fee .golf-fee-price { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.05rem; color: var(--ref-navy); }
  body.golf-page .golf-fee .golf-fee-detail { color: rgba(42,32,25,0.72); }
  body.golf-page .golf-fee-none { color: rgba(42,32,25,0.62); font-style: italic; }
  body.golf-page .golf-fee-note { margin: 0 0 6px; font-size: 0.78rem; color: rgba(42,32,25,0.6); }
  body.golf-page .golf-sort { margin: 0 0 12px; align-items: center; }
  body.golf-page .golf-sort .golf-sort-label { font-size: 0.85rem; font-weight: 700; color: var(--ref-navy); margin-right: 2px; }
  body.golf-page .golf-sort-note { font-size: 0.84rem; color: rgba(42,32,25,0.68); margin: 0 0 18px; max-width: 80ch; }
  body.golf-page .venue-section.golf-map-callout { display: grid; grid-template-columns: 1fr; gap: 12px; border-left: 4px solid var(--ref-gold); }
  @media (min-width: 760px) { body.golf-page .venue-section.golf-map-callout { grid-template-columns: 1fr auto; align-items: center; } }
  body.golf-page .golf-map-callout h2 { margin: 0 0 4px; }
  body.golf-page .golf-map-callout p { margin: 0; }
  body.golf-page .golf-map-links { display: flex; flex-wrap: wrap; gap: 10px; }
  body.golf-page .golf-map-callout .golf-map-cta {
    display: inline-flex; align-items: center; min-height: 44px; padding: 10px 18px; border-radius: 999px;
    background: var(--ref-navy); color: var(--ref-white); font-weight: 700; text-decoration: none;
  }
  body.golf-page .golf-map-callout .golf-map-cta:hover { background: var(--ref-navy-deep); color: var(--ref-white); }
  body.golf-page .golf-map-callout .golf-map-cta.secondary { background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.25); }
  body.golf-page .golf-map-callout .golf-map-cta.secondary:hover { background: rgba(27,43,58,0.06); color: var(--ref-navy); }
  body.golf-page .golf-map-callout .golf-map-cta:focus-visible { outline: 3px solid var(--teal); outline-offset: 3px; }
  body.golf-page .golf-map-credit { grid-column: 1 / -1; font-size: 0.8rem; color: rgba(42,32,25,0.6); }
  body.golf-page .golf-fees-headline { margin: 0 0 12px; }
  body.golf-page .golf-fees-headline .golf-fee-price { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.6rem; color: var(--ref-navy); }
  body.golf-page .golf-fees-headline .golf-fee-detail { color: rgba(42,32,25,0.75); }
  body.golf-page .golf-fees-headline-note { display: block; font-size: 0.85rem; color: rgba(42,32,25,0.65); }
  body.golf-page .golf-fees-table-wrap { overflow-x: auto; }
  body.golf-page .golf-fees-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  body.golf-page .golf-fees-table th, body.golf-page .golf-fees-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(27,43,58,0.1); vertical-align: top; }
  body.golf-page .golf-fees-table thead th { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(42,32,25,0.6); }
  body.golf-page .golf-fees-table tr.is-comparison { background: rgba(201,162,39,0.10); }
  body.golf-page .golf-fees-table .golf-fee-amount { font-weight: 700; color: var(--ref-navy); white-space: nowrap; }
  body.golf-page .golf-fee-cond { display: block; font-size: 0.78rem; font-weight: 400; color: rgba(42,32,25,0.6); }
  body.golf-page .golf-fees-meta, body.golf-page .golf-fees-source, body.golf-page .golf-fees-none { font-size: 0.85rem; color: rgba(42,32,25,0.7); margin: 10px 0 0; }
  body.golf-page .golf-value { margin: 0 0 6px; font-size: 0.84rem; font-weight: 700; color: var(--ref-navy); }
  body.golf-page .golf-value.golf-value-none { font-weight: 400; font-style: italic; color: rgba(42,32,25,0.6); }
  body.golf-page .golf-value-headline { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.2rem; color: var(--ref-navy); margin: 0 0 14px; }
  body.golf-page .golf-value-rows { display: grid; gap: 14px; }
  body.golf-page .golf-value-row-head { display: flex; justify-content: space-between; gap: 12px; font-size: 0.92rem; }
  body.golf-page .golf-value-name { font-weight: 700; color: var(--ink); }
  body.golf-page .golf-value-pts { font-weight: 700; color: var(--ref-navy); white-space: nowrap; }
  body.golf-page .golf-value-bar { display: block; height: 8px; margin: 6px 0; border-radius: 999px; background: rgba(27,43,58,0.1); overflow: hidden; }
  body.golf-page .golf-value-bar span { display: block; height: 100%; background: var(--ref-gold); border-radius: 999px; }
  body.golf-page .golf-value-why { margin: 0; font-size: 0.84rem; color: rgba(42,32,25,0.7); }
  body.golf-page .golf-value-basis { margin: 14px 0 0; font-size: 0.85rem; font-weight: 700; color: rgba(42,32,25,0.75); }
  body.golf-page .golf-value-about { margin: 6px 0 0; font-size: 0.8rem; color: rgba(42,32,25,0.62); max-width: 80ch; }
</style>`;

module.exports = {
  DATA_FILE, SCHEMA_SQL, FEE_STATUSES, RATE_CATEGORIES, COURSE_FORMATS, MEDIA_KINDS,
  validateGolfData, loadGolfData, initGolfData, getGolfDetails, venueKey, isPracticeFacility,
  todayIso, feeFreshness, comparisonRate, comparisonCents, formatCad,
  golfCardFeeHtml, parseGolfSort, sortGolfCourses, hasSortablePrices, golfSortNavHtml,
  golfFeesSectionHtml, golfCourseMapHtml, GOLF_DATA_CSS, GOLF_SORTS,
  computeValueIndex, valueLabel, valueGroup, golfCardValueHtml, golfValueSectionHtml, VALUE_GROUPS,
};
