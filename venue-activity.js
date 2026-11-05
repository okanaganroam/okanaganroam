'use strict';
// Business activity (2026-11-05): per business, per day, how many times its page was viewed and which links on it were
// clicked (website, phone, booking, directions). Counts only: a day, a business, an event name from a fixed pattern, a
// number. No visitor id, no IP. Shown on the owner dashboard's business search together with the Build My Trip demand
// log (shown in plans / added / removed), which already holds per-business counts.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');

const NAME_RE = /^(venue_view|outbound_click:[a-z_]{1,24})$/;
const RATE_PER_HOUR = 300;
const hits = new Map();
function rateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, times] of hits) if (!times.some((t) => now - t < 3600000)) hits.delete(k);
  return recent.length > RATE_PER_HOUR;
}

const dayList = (days, now) => { const out = []; for (let i = days - 1; i >= 0; i -= 1) out.push(dayOf(new Date(now.getTime() - i * 86400000))); return out; };
const tableExists = (db, n) => { try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n); } catch (e) { return false; } };

function createCounter(db) {
  const up = db.prepare('INSERT INTO venue_event_counts (day, venue_id, name, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, venue_id, name) DO UPDATE SET n = n + 1');
  const exists = db.prepare('SELECT 1 FROM venues WHERE id = ? AND redirect_to IS NULL');

  function record(req, venueId, name, ip, now = new Date()) {
    const id = Number(venueId);
    if (!demandEnabled() || !Number.isInteger(id) || id <= 0 || typeof name !== 'string' || !NAME_RE.test(name)) return false;
    if (isBot(req) || isInternal(req) || rateLimited(ip) || !exists.get(id)) return false;
    up.run(dayOf(now), id, name);
    return true;
  }

  function search(q) {
    const s = String(q || '').trim().slice(0, 80);
    if (s.length < 2) return [];
    const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return db.prepare(`SELECT id, name, region, type FROM venues WHERE redirect_to IS NULL AND name LIKE ? ESCAPE '\\'
      ORDER BY (name LIKE ? ESCAPE '\\') DESC, length(name), name LIMIT 12`).all(like, `${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  function detail(venueId, days = 30, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const venue = db.prepare('SELECT id, name, region, type FROM venues WHERE id = ? AND redirect_to IS NULL').get(Number(venueId));
    if (!venue) return null;
    const list = dayList(days, now);
    const since = list[0];
    const rows = db.prepare('SELECT day, name, n FROM venue_event_counts WHERE venue_id = ? AND day >= ?').all(venue.id, since);
    const clicks = {}; const viewsByDay = new Map(); const clicksByDay = new Map();
    let views = 0; let clickTotal = 0;
    for (const r of rows) {
      if (r.name === 'venue_view') { views += r.n; viewsByDay.set(r.day, r.n); } else {
        const k = r.name.slice('outbound_click:'.length);
        clicks[k] = (clicks[k] || 0) + r.n; clickTotal += r.n; clicksByDay.set(r.day, (clicksByDay.get(r.day) || 0) + r.n);
      }
    }
    let demand = null;
    if (tableExists(db, 'trip_demand_events')) {
      const d = db.prepare(`SELECT SUM(kind='shown') AS shown, SUM(kind='add') AS added, SUM(kind='remove') AS removed,
        COUNT(DISTINCT CASE WHEN kind='add' THEN day || visitor END) AS adders FROM trip_demand_events WHERE venue_id = ? AND day >= ?`).get(venue.id, since);
      demand = { shown: d.shown || 0, added: d.added || 0, removed: d.removed || 0, adders: d.adders || 0 };
    }
    const first = db.prepare('SELECT MIN(day) AS d FROM venue_event_counts').get().d;
    return {
      venue, days, since, counting_since: first || null, views, clicks_total: clickTotal,
      clicks: Object.entries(clicks).map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n),
      views_per_day: list.map((day) => ({ day, n: viewsByDay.get(day) || 0 })),
      clicks_per_day: list.map((day) => ({ day, n: clicksByDay.get(day) || 0 })),
      demand,
    };
  }
  return { record, search, detail };
}

module.exports = { NAME_RE, RATE_PER_HOUR, createCounter, rateLimited };
