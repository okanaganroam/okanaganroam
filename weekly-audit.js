'use strict';
// Weekly enrichment audit (2026-10-21): a read-only scan of the data that goes stale -- opening hours, seasonal
// closures, special closures, events and the review queues -- ranked so the most visited places and the soonest dates
// come first. buildAudit(db, { today }) returns plain JSON; renderAuditMarkdown() turns it into the weekly report.
// Nothing here writes: GET /admin/audit (server.js) serves it behind its own read-only token, and scripts/
// weekly-audit.js saves the report. What the audit cannot know (is the winery really closed for the season?) is
// left as a worklist for the research step in docs/weekly-audit.md.

const DAY = 86400000;
const DEFAULTS = {
  listLimit: 25,
  hoursMaxAgeDays: 180, // verified hours older than this are due a re-check
  seasonCheckMaxAgeDays: 45, // a season note still in effect is re-checked after this
  seasonRowGraceDays: 30, // a season row this long past its last date can be cleared
  reopeningWindowDays: 21, // "reopens within" (or already past)
  closureHeadsUpDays: 14, // special closures starting within this many days
  eventSoonDays: 21, // events starting within this are checked against their source
  eventSourceMaxAgeDays: 14, // ... and flagged when the source was checked longer ago
  annualWindowDays: 75, // annual events whose anniversary falls within this many days
};

// What tends to open or close at this time of year, for the research step. Hints, not facts about any one place.
const MONTH_HINTS = {
  1: 'Deep winter: ski resorts at full hours; many wineries on winter or by-appointment hours; patios, boat and bike rentals, farm stands and most golf courses closed.',
  2: 'Winter: same as January. Spring-opening dates start to be announced.',
  3: 'Late winter: golf courses and some wineries announce opening dates; ski resorts start closing (Apex, Baldy, SilverStar in April).',
  4: 'Spring: golf courses and wineries reopen or move to summer hours; ski resorts close; check farm stands and cideries.',
  5: 'Spring: patios, boat and bike rentals, tours, campgrounds and beach facilities open; long-weekend hours.',
  6: 'Early summer: all seasonal places open; summer hours; check festival and market dates.',
  7: 'Peak summer: longest hours; events at their densest; check for wildfire or smoke closures.',
  8: 'Late summer: harvest begins; U-pick, farm stands and fruit stands at peak; some summer-only places announce last days.',
  9: 'Harvest: wineries on harvest hours; some summer places reduce days; Labour Day and Thanksgiving hours; fall events begin.',
  10: 'Fall shoulder season: golf courses, patios, boat and bike rentals, tours, farm stands and some wineries are closing or cutting hours; Thanksgiving weekend; Halloween events; ski resorts announce opening dates.',
  11: 'Late fall: most summer places closed for the season; ski resorts open (late Nov); Christmas markets and holiday events announced.',
  12: 'Holiday season: holiday and Christmas hours; ski resorts open; closures over Christmas and New Year.',
};

// Names and types that usually mean a seasonal business, used only to find places worth a look.
const SEASONAL_HINT = /\b(golf|disc golf|mini[- ]?golf|boat|boats|kayak|kayaks|paddle ?board|canoe|cruise|cruises|charter|charters|tours?|rentals?|zip ?line|rafting|river float|tubing|farm ?stand|fruit stand|u-?pick|pumpkin|corn maze|ski|skiing|sleigh|sled|skating|water ?park|campground|go-?kart|ferry)\b/i;

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
const parseList = (text) => { try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const hasHours = (h) => { const t = String(h || '').trim(); return t !== '' && t !== '{}' && t !== 'null' && t !== '[]'; };
const rows = (db, sql, ...args) => { try { return db.prepare(sql).all(...args); } catch (e) { return []; } };

function buildAudit(db, { today, config } = {}) {
  if (!isoDate(today)) throw new Error('buildAudit needs today as YYYY-MM-DD');
  const cfg = { ...DEFAULTS, ...(config || {}) };
  const venues = rows(db, `SELECT id, name, region, type, reviews, website, phone, address, latitude, longitude, hours, hours_source, hours_checked_at
    FROM venues WHERE redirect_to IS NULL`);
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const brief = (v, extra) => ({ id: v.id, name: v.name, region: v.region, type: v.type, reviews: v.reviews || 0, ...extra });
  const byReviews = (a, b) => (b.reviews || 0) - (a.reviews || 0) || a.id - b.id;
  const list = (items, sort = byReviews) => ({ total: items.length, items: items.slice().sort(sort).slice(0, cfg.listLimit) });
  const byDate = (key) => (a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) || a.id - b.id;

  // ---- hours
  const noHours = venues.filter((v) => !hasHours(v.hours));
  const unverified = venues.filter((v) => hasHours(v.hours) && !v.hours_source);
  const stale = venues.filter((v) => {
    if (!hasHours(v.hours) || !v.hours_source) return false;
    const c = isoDate(v.hours_checked_at);
    return !c || daysBetween(c, today) > cfg.hoursMaxAgeDays;
  }).map((v) => brief(v, { source: v.hours_source, checked_at: isoDate(v.hours_checked_at), age_days: isoDate(v.hours_checked_at) ? daysBetween(isoDate(v.hours_checked_at), today) : null }));

  // ---- seasonal hours and special closures (venue_hours_extra)
  const extras = rows(db, 'SELECT venue_id, seasons, closures FROM venue_hours_extra');
  const closuresNow = [], expiredClosures = [];
  let seasonalHoursVenues = 0;
  const hasSeasonalHours = new Set();
  for (const x of extras) {
    const v = venueById.get(x.venue_id);
    if (!v) continue;
    if (parseList(x.seasons).length) { seasonalHoursVenues++; hasSeasonalHours.add(v.id); }
    for (const c of parseList(x.closures)) {
      const from = isoDate(c && c.from), to = isoDate(c && (c.to || c.from));
      if (!from || !to) continue;
      if (to >= today && from <= addDays(today, cfg.closureHeadsUpDays)) closuresNow.push(brief(v, { from, to, note: c.note || null, active_now: from <= today }));
      else if (to < addDays(today, -cfg.seasonRowGraceDays)) expiredClosures.push(brief(v, { from, to, note: c.note || null }));
    }
  }

  // ---- seasonal closures (venue_seasons), plus the owner's yearly months
  const seasonRows = rows(db, 'SELECT venue_id, status, until_date, reopens_date, source_url, checked_at FROM venue_seasons')
    .filter((r) => venueById.has(r.venue_id))
    .map((r) => brief(venueById.get(r.venue_id), { status: r.status, until_date: isoDate(r.until_date), reopens_date: isoDate(r.reopens_date), source_url: r.source_url, checked_at: isoDate(r.checked_at), age_days: isoDate(r.checked_at) ? daysBetween(isoDate(r.checked_at), today) : null }));
  const ownerMonths = new Set(rows(db, 'SELECT venue_id FROM venue_links WHERE open_months IS NOT NULL').map((r) => r.venue_id));
  const inEffect = (r) => (r.status === 'closed' ? !r.reopens_date || r.reopens_date >= today : !r.until_date || r.until_date >= today);
  const reopenDue = seasonRows.filter((r) => r.status === 'closed' && r.reopens_date && daysBetween(today, r.reopens_date) <= cfg.reopeningWindowDays && daysBetween(today, r.reopens_date) >= -cfg.seasonRowGraceDays)
    .map((r) => ({ ...r, days_until_reopen: daysBetween(today, r.reopens_date) }));
  const openUntilPassed = seasonRows.filter((r) => r.status === 'open_until' && r.until_date && r.until_date < today && daysBetween(r.until_date, today) <= cfg.seasonRowGraceDays);
  const closedNoReopen = seasonRows.filter((r) => r.status === 'closed' && !r.reopens_date);
  const seasonRecheck = seasonRows.filter((r) => inEffect(r) && (r.age_days === null || r.age_days > cfg.seasonCheckMaxAgeDays));
  const seasonClearable = seasonRows.filter((r) => (r.status === 'closed' && r.reopens_date && daysBetween(r.reopens_date, today) > cfg.seasonRowGraceDays) || (r.status === 'open_until' && r.until_date && daysBetween(r.until_date, today) > cfg.seasonRowGraceDays));
  const withSeasonInfo = new Set([...seasonRows.map((r) => r.id), ...ownerMonths, ...hasSeasonalHours]);
  const seasonalCandidates = venues.filter((v) => !withSeasonInfo.has(v.id) && SEASONAL_HINT.test(`${v.name} ${v.type}`)).map((v) => brief(v));

  // ---- events
  const events = rows(db, 'SELECT id, name, region, status, source_type, source_name, source_url, source_checked_at, event_confidence FROM events');
  const occByEvent = new Map();
  for (const o of rows(db, 'SELECT event_id, start_date, end_date, status FROM event_occurrences')) {
    if (!occByEvent.has(o.event_id)) occByEvent.set(o.event_id, []);
    occByEvent.get(o.event_id).push(o);
  }
  const ebrief = (e, extra) => ({ id: e.id, name: e.name, region: e.region, ...extra });
  const upcoming = [], soonUnverified = [], annual = [], flagged = [], noSource = [];
  const regionCount = new Map();
  for (const e of events) {
    const occ = (occByEvent.get(e.id) || []).filter((o) => o.status !== 'cancelled');
    const future = occ.filter((o) => o.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (e.status === 'cancelled') continue;
    if (future.length) {
      const next = future[0];
      if (next.start_date <= addDays(today, 30)) {
        upcoming.push(e.id);
        regionCount.set(e.region, (regionCount.get(e.region) || 0) + 1);
      }
      const checked = isoDate(e.source_checked_at);
      if (next.start_date <= addDays(today, cfg.eventSoonDays) && (!checked || daysBetween(checked, today) > cfg.eventSourceMaxAgeDays)) {
        soonUnverified.push(ebrief(e, { next_start: next.start_date, source_url: e.source_url, source_checked_at: checked, age_days: checked ? daysBetween(checked, today) : null }));
      }
      if (!e.source_url) noSource.push(ebrief(e, { next_start: next.start_date }));
      if (e.status === 'postponed') flagged.push(ebrief(e, { next_start: next.start_date, why: 'postponed: confirm the new date' }));
    } else if (e.status === 'postponed') {
      flagged.push(ebrief(e, { next_start: null, why: 'postponed with no upcoming date' }));
    } else if (occ.length) {
      const last = occ.map((o) => o.start_date).sort().pop();
      const anniversary = addDays(last, 365);
      if (anniversary >= addDays(today, -30) && anniversary <= addDays(today, cfg.annualWindowDays)) {
        annual.push(ebrief(e, { last_date: last, expected_around: anniversary, source_url: e.source_url }));
      }
    }
  }
  const venueRegions = [...new Set(venues.map((v) => v.region))].sort();
  const regionsWithoutEvents = venueRegions.filter((r) => !regionCount.get(r));
  const queue = (label, sql) => {
    const r = rows(db, sql)[0];
    const oldest = isoDate(r && r.oldest);
    return { queue: label, pending: (r && r.n) || 0, oldest_days: oldest ? daysBetween(oldest, today) : null };
  };
  const queues = [
    queue('Event submissions', "SELECT COUNT(*) n, MIN(submitted_at) oldest FROM event_submissions WHERE status = 'pending'"),
    queue('Owner event changes', "SELECT COUNT(*) n, MIN(submitted_at) oldest FROM owner_event_changes WHERE status = 'pending'"),
    queue('Venue submissions', "SELECT COUNT(*) n, MIN(submitted_at) oldest FROM venue_submissions WHERE status = 'pending'"),
    queue('Owner changes', "SELECT COUNT(*) n, MIN(submitted_at) oldest FROM owner_change_requests WHERE status = 'pending'"),
    queue('Owner photos', "SELECT COUNT(*) n, MIN(submitted_at) oldest FROM owner_photos WHERE status = 'pending'"),
    queue('Visitor contributions', "SELECT COUNT(*) n, MIN(submitted_at) oldest FROM visitor_contributions WHERE status = 'pending'"),
  ];

  // ---- listing gaps
  const missing = (f) => venues.filter((v) => v[f] === null || v[f] === undefined || String(v[f]).trim() === '').length;
  const gaps = { venues: venues.length, no_website: missing('website'), no_phone: missing('phone'), no_address: missing('address'), no_coordinates: venues.filter((v) => v.latitude === null || v.longitude === null).length };

  const month = Number(today.slice(5, 7));
  const audit = {
    generated_for: today,
    config: cfg,
    calendar_hint: MONTH_HINTS[month],
    hours: {
      no_hours: list(noHours.map((v) => brief(v))),
      unverified: list(unverified.map((v) => brief(v))),
      stale: list(stale, (a, b) => (b.age_days === null) - (a.age_days === null) || byReviews(a, b)),
    },
    seasonal_hours_and_closures: {
      venues_with_seasonal_hours: seasonalHoursVenues,
      closures_now_or_soon: list(closuresNow, byDate('from')),
      expired_closures_to_clear: list(expiredClosures, byDate('to')),
    },
    seasons: {
      rows_total: seasonRows.length,
      owner_yearly_seasons: ownerMonths.size,
      reopening_due: list(reopenDue, byDate('reopens_date')),
      open_until_passed: list(openUntilPassed, byDate('until_date')),
      closed_without_reopening_date: list(closedNoReopen, byDate('checked_at')),
      recheck_source: list(seasonRecheck, (a, b) => (b.age_days || 9999) - (a.age_days || 9999) || a.id - b.id),
      clearable: list(seasonClearable, byDate('checked_at')),
      seasonal_candidates_without_season: list(seasonalCandidates),
    },
    events: {
      upcoming_next_30_days: upcoming.length,
      starting_soon_source_not_recently_checked: list(soonUnverified, byDate('next_start')),
      upcoming_without_source: list(noSource, byDate('next_start')),
      postponed_to_confirm: list(flagged, byDate('next_start')),
      annual_events_due_new_dates: list(annual, byDate('expected_around')),
      regions_without_events_next_30_days: regionsWithoutEvents,
    },
    queues,
    listing_gaps: gaps,
  };
  audit.summary = summarize(audit);
  return audit;
}

function summarize(a) {
  const n = (x) => x.total;
  const lines = [];
  const add = (count, text) => { if (count) lines.push(`${count} ${text}`); };
  add(n(a.seasons.reopening_due), 'closed-for-the-season places due to reopen (or past their reopening date): confirm and clear');
  add(n(a.seasons.open_until_passed), 'places whose "open until" date has passed: mark closed for the season or clear');
  add(n(a.seasons.recheck_source), 'seasonal notes not re-checked recently');
  add(n(a.seasons.closed_without_reopening_date), 'closed-for-the-season places with no reopening date');
  add(n(a.seasons.seasonal_candidates_without_season), 'places that look seasonal but have no season or seasonal hours recorded (research)');
  add(n(a.seasonal_hours_and_closures.closures_now_or_soon), 'special closures active now or starting within two weeks');
  add(n(a.seasonal_hours_and_closures.expired_closures_to_clear), 'old special closures to clear');
  add(n(a.hours.stale), 'places whose verified hours are older than the re-check age');
  add(n(a.hours.unverified), 'places with hours but no recorded source');
  add(n(a.hours.no_hours), 'places with no hours');
  add(n(a.events.starting_soon_source_not_recently_checked), 'events starting soon whose source has not been checked recently');
  add(n(a.events.postponed_to_confirm), 'postponed events to confirm');
  add(n(a.events.annual_events_due_new_dates), 'annual events due new dates');
  add(a.events.regions_without_events_next_30_days.length, 'towns with no events in the next 30 days');
  for (const q of a.queues) add(q.pending, `${q.queue.toLowerCase()} waiting for review${q.oldest_days !== null ? ` (oldest ${q.oldest_days} days)` : ''}`);
  return { items: lines.length, lines };
}

const cell = (v) => String(v === null || v === undefined || v === '' ? '' : v).replace(/\|/g, '/').replace(/\s+/g, ' ');
function table(items, cols) {
  if (!items.length) return '_None._\n';
  return `| ${cols.map((c) => c[0]).join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n${items.map((i) => `| ${cols.map((c) => cell(typeof c[1] === 'function' ? c[1](i) : i[c[1]])).join(' | ')} |`).join('\n')}\n`;
}
function section(title, l, cols, note) {
  return `### ${title} (${l.total}${l.total > l.items.length ? `, top ${l.items.length} shown` : ''})\n${note ? `${note}\n\n` : ''}${table(l.items, cols)}\n`;
}

function renderAuditMarkdown(a) {
  const V = [['#', 'id'], ['Place', 'name'], ['Town', 'region'], ['Type', 'type'], ['Reviews', 'reviews']];
  const E = [['#', 'id'], ['Event', 'name'], ['Town', 'region']];
  let md = `# Weekly enrichment audit: ${a.generated_for}\n\n`;
  md += `**This time of year:** ${a.calendar_hint}\n\n## Needs attention\n\n`;
  md += a.summary.items ? a.summary.lines.map((l) => `- ${l}`).join('\n') + '\n\n' : 'Nothing flagged.\n\n';
  md += '## Seasonal closures\n\n';
  md += section('Due to reopen', a.seasons.reopening_due, [...V, ['Reopens', 'reopens_date'], ['Days', 'days_until_reopen'], ['Source', 'source_url']]);
  md += section('"Open until" date has passed', a.seasons.open_until_passed, [...V, ['Until', 'until_date'], ['Source', 'source_url']]);
  md += section('Closed, no reopening date', a.seasons.closed_without_reopening_date, [...V, ['Checked', 'checked_at'], ['Source', 'source_url']]);
  md += section('Season notes to re-check', a.seasons.recheck_source, [...V, ['Status', 'status'], ['Checked', 'checked_at'], ['Age (days)', 'age_days']]);
  md += section('Places that look seasonal, with no season recorded', a.seasons.seasonal_candidates_without_season, V, 'Research: is each one closed or on different hours now? Names and types only; this is a lead list, not a finding.');
  md += section('Old season rows that can be cleared', a.seasons.clearable, [...V, ['Status', 'status'], ['Reopens', 'reopens_date'], ['Until', 'until_date']]);
  md += `## Hours\n\n`;
  md += section('Special closures active now or soon', a.seasonal_hours_and_closures.closures_now_or_soon, [...V, ['From', 'from'], ['To', 'to'], ['Note', 'note']]);
  md += section('Old special closures to clear', a.seasonal_hours_and_closures.expired_closures_to_clear, [...V, ['From', 'from'], ['To', 'to']]);
  md += section('Verified hours past the re-check age', a.hours.stale, [...V, ['Source', 'source'], ['Checked', 'checked_at'], ['Age (days)', 'age_days']]);
  md += section('Hours with no recorded source', a.hours.unverified, V);
  md += section('No hours', a.hours.no_hours, V);
  md += `Venues with seasonal hours: ${a.seasonal_hours_and_closures.venues_with_seasonal_hours}. Owner yearly seasons: ${a.seasons.owner_yearly_seasons}. Season rows: ${a.seasons.rows_total}.\n\n`;
  md += `## Events\n\nEvents starting in the next 30 days: **${a.events.upcoming_next_30_days}**.\n\n`;
  md += section('Starting soon, source not recently checked', a.events.starting_soon_source_not_recently_checked, [...E, ['Starts', 'next_start'], ['Source checked', 'source_checked_at'], ['Source', 'source_url']]);
  md += section('Postponed: confirm', a.events.postponed_to_confirm, [...E, ['Next', 'next_start'], ['Why', 'why']]);
  md += section('Annual events due new dates', a.events.annual_events_due_new_dates, [...E, ['Last held', 'last_date'], ['Expect around', 'expected_around'], ['Source', 'source_url']]);
  md += section('Upcoming without a source', a.events.upcoming_without_source, [...E, ['Starts', 'next_start']]);
  md += `Towns with no events in the next 30 days: ${a.events.regions_without_events_next_30_days.join(', ') || 'none'}.\n\n`;
  md += `## Waiting for review\n\n${table(a.queues, [['Queue', 'queue'], ['Pending', 'pending'], ['Oldest (days)', 'oldest_days']])}\n`;
  const g = a.listing_gaps;
  md += `## Listing gaps\n\nOf ${g.venues} active places: ${g.no_website} have no website, ${g.no_phone} no phone, ${g.no_address} no address, ${g.no_coordinates} no map position.\n`;
  return md;
}

module.exports = { buildAudit, renderAuditMarkdown, DEFAULTS, MONTH_HINTS };
