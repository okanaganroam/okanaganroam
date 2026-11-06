'use strict';
// What changed (2026-11-06): one short summary of the last complete 7 days against the 7 days before, built only from
// counts the site already keeps. Used by the dashboard's top card and the Monday email. Pure reads; no visitor data.
const { dayOf } = require('./trip-demand');

const OUTBOUND = ['website', 'booking', 'call_button', 'phone_number', 'directions', 'full_menu', 'social_link'].map((k) => `click:${k}`);
const AI = { chatgpt: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', copilot: 'Copilot', claude: 'Claude', google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', facebook: 'Facebook', instagram: 'Instagram' };

const tableExists = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const dayList = (endDay, n) => { const end = new Date(`${endDay}T12:00:00Z`); const out = []; for (let i = n - 1; i >= 0; i -= 1) out.push(new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10)); return out; };

// Windows of complete days: the 7 days ending yesterday, and the 7 before those.
function windows(now = new Date()) {
  const yesterday = dayOf(new Date(now.getTime() - 86400000));
  const cur = dayList(yesterday, 7);
  const prev = dayList(new Date(new Date(`${cur[0]}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10), 7);
  return { cur: { start: cur[0], end: cur[6] }, prev: { start: prev[0], end: prev[6] } };
}

// Sentences for the metrics that moved. Small numbers are not reported as news.
function headlines(metrics) {
  const out = [];
  for (const m of metrics) {
    const big = Math.max(m.cur, m.prev);
    if (big < 5) continue;
    const change = m.prev ? (m.cur - m.prev) / m.prev : 1;
    if (Math.abs(change) < 0.25) continue;
    out.push({ delta: Math.abs(m.cur - m.prev), text: m.prev === 0 ? `${m.label}: ${m.cur} (none the week before)` : `${m.label}: ${m.cur}, ${m.cur > m.prev ? 'up' : 'down'} from ${m.prev}` });
  }
  return out.sort((a, b) => b.delta - a.delta).slice(0, 6).map((x) => x.text);
}

function summarize(db, now = new Date()) {
  const w = windows(now);
  const q = (sql, ...params) => db.prepare(sql).all(...params);
  const one = (sql, ...params) => { const r = db.prepare(sql).get(...params); return r ? Object.values(r)[0] || 0 : 0; };
  const both = (fn) => ({ cur: fn(w.cur.start, w.cur.end), prev: fn(w.prev.start, w.prev.end) });
  const has = (t) => tableExists(db, t);

  const metrics = [];
  const add = (key, label, fn) => { const v = both(fn); metrics.push({ key, label, cur: v.cur, prev: v.prev }); };

  if (has('venue_event_counts')) {
    add('views', 'Business page views', (a, b) => one("SELECT SUM(n) FROM venue_event_counts WHERE name = 'venue_view' AND day BETWEEN ? AND ?", a, b));
    add('outbound', 'Clicks out to businesses (website, book, call, directions, menu, social)', (a, b) => one(`SELECT SUM(n) FROM venue_event_counts WHERE name IN (${OUTBOUND.map(() => '?').join(',')}) AND day BETWEEN ? AND ?`, ...OUTBOUND, a, b));
  }
  if (has('referral_counts')) {
    for (const [g, label] of [['ai', 'Visits from AI assistants'], ['search', 'Visits from search engines'], ['social', 'Visits from social'], ['email', 'Visits from our emails']]) {
      add(`visits_${g}`, label, (a, b) => one("SELECT SUM(n) FROM referral_counts WHERE kind = 'visit' AND source LIKE ? AND day BETWEEN ? AND ?", `${g}:%`, a, b));
    }
  }
  if (has('search_term_counts')) {
    add('searches', 'Site searches', (a, b) => one("SELECT SUM(n) FROM search_term_counts WHERE source = 'site' AND day BETWEEN ? AND ?", a, b));
    add('searches_none', 'Site searches that found nothing', (a, b) => one("SELECT SUM(n) FROM search_term_counts WHERE source = 'site' AND found = 0 AND day BETWEEN ? AND ?", a, b));
  }
  if (has('site_event_counts')) {
    for (const [k, label] of [['trip_plan_start', 'Build My Trip plans started'], ['trip_plan_complete', 'Build My Trip plans completed'], ['trip_share', 'Trips shared']]) {
      add(k, label, (a, b) => one('SELECT SUM(n) FROM site_event_counts WHERE name = ? AND day BETWEEN ? AND ?', k, a, b));
    }
  }
  if (has('venue_claims')) {
    add('claims', 'Claims sent', (a, b) => one("SELECT COUNT(*) FROM venue_claims WHERE substr(submitted_at,1,10) BETWEEN ? AND ?", a, b));
    add('claims_approved', 'Claims approved', (a, b) => one("SELECT COUNT(*) FROM venue_claims WHERE status = 'approved' AND substr(reviewed_at,1,10) BETWEEN ? AND ?", a, b));
  }
  if (has('owner_accounts')) add('logins_created', 'Owner logins created', (a, b) => one('SELECT COUNT(*) FROM owner_accounts WHERE substr(created_at,1,10) BETWEEN ? AND ?', a, b));
  if (has('owner_change_requests')) add('changes_sent', 'Change requests from owners', (a, b) => one('SELECT COUNT(*) FROM owner_change_requests WHERE substr(submitted_at,1,10) BETWEEN ? AND ?', a, b));
  if (has('not_found_counts')) add('broken', 'Visitors who hit a missing page', (a, b) => one("SELECT SUM(n) FROM not_found_counts WHERE kind = 'visitor' AND day BETWEEN ? AND ?", a, b));

  const lists = {};
  if (has('venue_event_counts')) {
    const views = (a, b) => new Map(q(`SELECT venue_id AS id, SUM(n) AS n FROM venue_event_counts WHERE name = 'venue_view' AND day BETWEEN ? AND ? GROUP BY venue_id`, a, b).map((r) => [r.id, r.n]));
    const cur = views(w.cur.start, w.cur.end); const prev = views(w.prev.start, w.prev.end);
    const info = db.prepare('SELECT id, name, region FROM venues WHERE id = ? AND redirect_to IS NULL');
    const rows = [...cur.entries()].map(([id, n]) => { const v = info.get(id); return v ? { id, name: v.name, region: v.region, views: n, prev: prev.get(id) || 0 } : null; }).filter(Boolean);
    lists.top_businesses = [...rows].sort((a, b) => b.views - a.views || a.name.localeCompare(b.name)).slice(0, 5);
    lists.rising_businesses = rows.filter((r) => r.views - r.prev >= 3).sort((a, b) => (b.views - b.prev) - (a.views - a.prev) || a.name.localeCompare(b.name)).slice(0, 5);
    const outs = q(`SELECT venue_id AS id, SUM(n) AS n FROM venue_event_counts WHERE name IN (${OUTBOUND.map(() => '?').join(',')}) AND day BETWEEN ? AND ? GROUP BY venue_id ORDER BY n DESC LIMIT 5`, ...OUTBOUND, w.cur.start, w.cur.end);
    lists.top_outbound = outs.map((r) => { const v = info.get(r.id); return v ? { id: r.id, name: v.name, region: v.region, clicks: r.n } : null; }).filter(Boolean);
  }
  if (has('referral_counts')) {
    lists.top_sources = q(`SELECT source, SUM(n) AS n FROM referral_counts WHERE kind = 'visit' AND day BETWEEN ? AND ? GROUP BY source ORDER BY n DESC LIMIT 6`, w.cur.start, w.cur.end)
      .map((r) => { const [group, s] = r.source.split(':'); return { group, source: AI[s] || s, n: r.n }; });
  }
  if (has('search_term_counts')) {
    const terms = (a, b) => new Map(q("SELECT term, SUM(n) AS n, SUM(CASE WHEN found = 0 THEN n ELSE 0 END) AS none FROM search_term_counts WHERE source = 'site' AND day BETWEEN ? AND ? GROUP BY term", a, b).map((r) => [r.term, r]));
    const cur = terms(w.cur.start, w.cur.end); const prev = terms(w.prev.start, w.prev.end);
    const rows = [...cur.values()];
    lists.top_searches = [...rows].sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, 5).map((r) => ({ term: r.term, n: r.n }));
    lists.new_searches = rows.filter((r) => !prev.has(r.term) && r.n >= 2).sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, 5).map((r) => ({ term: r.term, n: r.n }));
    lists.no_results = rows.filter((r) => r.none > 0).sort((a, b) => b.none - a.none || a.term.localeCompare(b.term)).slice(0, 5).map((r) => ({ term: r.term, n: r.none }));
  }
  if (has('not_found_counts')) {
    const pages = (a, b) => new Map(q("SELECT path, SUM(n) AS n FROM not_found_counts WHERE kind = 'visitor' AND day BETWEEN ? AND ? GROUP BY path", a, b).map((r) => [r.path, r.n]));
    const cur = pages(w.cur.start, w.cur.end); const prev = pages(w.prev.start, w.prev.end);
    lists.broken_pages = [...cur.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([path, n]) => ({ path, n, is_new: !prev.has(path) }));
  }
  return { range: w, metrics, headlines: headlines(metrics), lists };
}

// Search Console numbers (from gsc-report.js trends) folded in as a small section, or null when not connected.
function googleSection(sc) {
  if (!sc || sc.error || !sc.trends) return null;
  const t = sc.trends;
  const pick = (rows) => rows.slice(0, 3).map((r) => ({ key: r.key, clicks: r.clicks, d_clicks: r.d_clicks, d_impressions: r.d_impressions }));
  return { current: t.current, previous: t.previous, rising: pick(t.queries.rising), falling: pick(t.queries.falling) };
}

module.exports = { windows, headlines, summarize, googleSection };
