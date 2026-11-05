'use strict';
// Owner dashboard, Phase 1 (2026-11-05): numbers a site already holds in its own database. The same file runs on
// Okanagan Roam and Whistler Roam; each site serves its own numbers at GET /api/admin/dashboard-data (admin token)
// and the Okanagan dashboard page puts both side by side. Nothing here is personal: counts, venue names, and the
// planner request words the site already stores without contact details.
// Phase 2 (not here): Google Analytics traffic/events. Recordings stay in Microsoft Clarity (linked, not copied).

const THRESHOLD = 10; // same "ready to contact" bar as /api/admin/trip-demand

function pacificDay(d) {
  return new Date(d.getTime() - 8 * 3600000).toISOString().slice(0, 10);
}

function dayList(days, now) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(pacificDay(new Date(now.getTime() - i * 86400000)));
  return out;
}

function tableExists(db, name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch (e) { return false; }
}

function safe(fn, fallback = null) {
  try { return fn(); } catch (e) { return fallback; }
}

function series(rows, list, key = 'n') {
  const map = new Map(rows.map((r) => [r.day, r[key]]));
  return list.map((d) => ({ day: d, n: map.get(d) || 0 }));
}

function collect(db, { site = 'site', days = 30, now = new Date() } = {}) {
  days = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
  const list = dayList(days, now);
  const since = list[0];
  const sinceTs = `${since} 00:00:00`;
  const out = { site, days, since, generated_at: now.toISOString() };

  // Build My Trip demand (the Stage 1 log).
  out.demand = safe(() => {
    if (!tableExists(db, 'trip_demand_events')) return null;
    const totals = db.prepare(`SELECT
        SUM(kind='shown') AS shown, SUM(kind='add') AS added, SUM(kind='remove') AS removed,
        COUNT(DISTINCT day || visitor) AS visitor_days
      FROM trip_demand_events WHERE day >= ?`).get(since);
    const perDay = db.prepare(`SELECT day, COUNT(DISTINCT visitor) AS n FROM trip_demand_events WHERE day >= ? GROUP BY day`).all(since);
    const addsPerDay = db.prepare(`SELECT day, COUNT(*) AS n FROM trip_demand_events WHERE day >= ? AND kind='add' GROUP BY day`).all(since);
    const top = db.prepare(`SELECT v.id, v.name, v.region, v.type,
        SUM(e.kind='shown') AS shown, SUM(e.kind='add') AS added, SUM(e.kind='remove') AS removed
      FROM trip_demand_events e JOIN venues v ON v.id = e.venue_id
      WHERE e.day >= ? GROUP BY v.id ORDER BY added DESC, shown DESC LIMIT 10`).all(since);
    const ready = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT venue_id FROM trip_demand_events WHERE day >= ? AND kind='add' GROUP BY venue_id HAVING COUNT(*) >= ?)`).get(since, THRESHOLD);
    return {
      shown: totals.shown || 0, added: totals.added || 0, removed: totals.removed || 0, visitor_days: totals.visitor_days || 0,
      ready_to_contact: ready.n || 0, threshold: THRESHOLD,
      visitors_per_day: series(perDay, list), adds_per_day: series(addsPerDay, list), top_venues: top,
    };
  });

  // Planner requests (only where the site keeps them: Whistler today).
  out.plans = safe(() => {
    if (!tableExists(db, 'trip_plan_requests')) return null;
    const total = db.prepare('SELECT COUNT(*) AS n FROM trip_plan_requests WHERE created_at >= ?').get(sinceTs).n;
    const perDay = db.prepare('SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM trip_plan_requests WHERE created_at >= ? GROUP BY day').all(sinceTs);
    const byKind = db.prepare('SELECT COALESCE(kind, \'unknown\') AS kind, COUNT(*) AS n FROM trip_plan_requests WHERE created_at >= ? GROUP BY kind ORDER BY n DESC').all(sinceTs);
    const byLang = db.prepare('SELECT COALESCE(lang, \'en\') AS lang, COUNT(*) AS n FROM trip_plan_requests WHERE created_at >= ? GROUP BY lang').all(sinceTs);
    const empty = db.prepare('SELECT COUNT(*) AS n FROM trip_plan_requests WHERE created_at >= ? AND COALESCE(stops,0) = 0').get(sinceTs).n;
    const recent = db.prepare('SELECT created_at, text, kind, stops FROM trip_plan_requests ORDER BY id DESC LIMIT 10').all();
    return { total, no_stops: empty, per_day: series(perDay, list), by_kind: byKind, by_lang: byLang, recent };
  });

  // The review inbox: things waiting on Dayton, and sign-ups.
  out.inbox = safe(() => {
    const count = (table, where, params = []) => (tableExists(db, table) ? db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params).n : null);
    return {
      venue_submissions_pending: count('venue_submissions', "status='pending'"),
      event_submissions_pending: count('event_submissions', "status='pending'"),
      claims_pending: count('venue_claims', "status='pending'"),
      claims_approved: count('venue_claims', "status='approved'"),
      visitor_contributions_pending: count('visitor_contributions', "status='pending'"),
      new_submissions_in_window: (count('venue_submissions', 'submitted_at >= ?', [sinceTs]) || 0) + (count('event_submissions', 'submitted_at >= ?', [sinceTs]) || 0),
      new_claims_in_window: count('venue_claims', 'submitted_at >= ?', [sinceTs]),
      owner_accounts: count('owner_accounts', '1=1'),
      owners_active_in_window: count('owner_accounts', 'last_login_at >= ?', [sinceTs]),
      menu_reads_in_window: count('menu_reads', 'created_at >= ?', [sinceTs]),
    };
  });

  // Feature use: per-day counts from site_event_counts (site-events.js), so Roam Now and Build My Trip show without Google.
  out.events = safe(() => {
    if (!tableExists(db, 'site_event_counts')) return null;
    const rows = db.prepare('SELECT day, name, n FROM site_event_counts WHERE day >= ?').all(since);
    const t = {};
    const per = {};
    for (const r of rows) { t[r.name] = (t[r.name] || 0) + r.n; (per[r.name] = per[r.name] || []).push({ day: r.day, n: r.n }); }
    const g = (n) => t[n] || 0;
    return {
      pages: { home: g('page_view:home'), roam_now: g('page_view:map'), build_my_trip: g('page_view:trip'), whats_on: g('page_view:whats_on'), browse: g('page_view:browse'), hidden_gems: g('page_view:hidden_gems') },
      roam_now: { opens: g('page_view:map'), near_me: g('map_near_me'), searches: g('map_search'), empty_searches: g('map_search_empty'), voice: g('map_voice_search'), filters: g('map_filter'), pins: g('map_pin'), directions: g('map_directions'), shares: g('map_share') },
      trip: { page_views: g('page_view:trip'), plans_started: g('trip_plan_start'), plans_completed: g('trip_plan_complete'), shared: g('trip_share'), adds: g('add_to_trip'), removes: g('remove_from_trip'), tray_opens: g('open_my_trip'), build_my_trip_clicks: g('build_my_trip_click') },
      roam_now_per_day: series(per['page_view:map'] || [], list),
      trip_per_day: series(per['page_view:trip'] || [], list),
      totals: t,
    };
  });

  out.listings = safe(() => ({
    venues: db.prepare('SELECT COUNT(*) AS n FROM venues WHERE redirect_to IS NULL').get().n,
    events: tableExists(db, 'events') ? db.prepare('SELECT COUNT(*) AS n FROM events').get().n : null,
  }));
  return out;
}

module.exports = { collect, dayList, THRESHOLD };
