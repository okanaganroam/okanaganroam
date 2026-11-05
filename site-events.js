'use strict';
// Site event counts (2026-11-05): how often features are used, counted on our own server so the owner dashboard can show
// Roam Now (the map), Build My Trip and the rest without Google. Counts only: a day, an event name from the fixed list
// below, and a number. No visitor id, no IP, no search words, no venue, no location, nothing a person typed.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');

// Event names the pages already send to Google Analytics, plus page_view:<key> for a few key pages.
const EVENTS = new Set([
  'open_map', 'map_near_me', 'map_filter', 'map_search', 'map_search_empty', 'map_voice_search', 'map_pin', 'map_directions',
  'map_share', 'map_arrived', 'map_outside', 'nearby_click',
  'build_my_trip_click', 'trip_plan_start', 'trip_plan_complete', 'trip_plan_regenerate', 'trip_share', 'add_whole_trip',
  'open_my_trip', 'add_to_trip', 'remove_from_trip', 'shared_trip_view', 'shared_trip_save', 'shared_trip_cta_click',
  'hotel_page_click', 'bio_link_click', 'listing_submit', 'outbound_click', 'search',
  'portal_login_click_menu', 'portal_login_click_venue_page', 'portal_login_click_footer', 'portal_login_click_other', 'portal_claim_click',
  'page_view:home', 'page_view:map', 'page_view:trip', 'page_view:whats_on', 'page_view:browse', 'page_view:hidden_gems',
]);

const RATE_PER_HOUR = 400;
const hits = new Map();
function rateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, times] of hits) if (!times.some((t) => now - t < 3600000)) hits.delete(k);
  return recent.length > RATE_PER_HOUR;
}

function createCounter(db) {
  const up = db.prepare('INSERT INTO site_event_counts (day, name, n) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET n = n + 1');
  function record(req, name, ip, now = new Date()) {
    if (!demandEnabled() || !EVENTS.has(name) || isBot(req) || isInternal(req) || rateLimited(ip)) return false;
    up.run(dayOf(now), name);
    return true;
  }
  function summary(days = 30, now = new Date()) {
    const since = dayOf(new Date(now.getTime() - (days - 1) * 86400000));
    const rows = db.prepare('SELECT day, name, n FROM site_event_counts WHERE day >= ?').all(since);
    const totals = {};
    const perDay = {};
    for (const r of rows) { totals[r.name] = (totals[r.name] || 0) + r.n; (perDay[r.name] = perDay[r.name] || new Map()).set(r.day, r.n); }
    return { totals, perDay };
  }
  return { record, summary };
}

module.exports = { EVENTS, createCounter, rateLimited, RATE_PER_HOUR };
