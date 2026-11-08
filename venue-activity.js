'use strict';
// Business activity (2026-11-05): per business, per day, how many times its page was viewed and which links on it were
// clicked (website, phone, booking, directions). Counts only: a day, a business, an event name from a fixed pattern, a
// number. No visitor id, no IP. Shown on the owner dashboard's business search together with the Build My Trip demand
// log (shown in plans / added / removed), which already holds per-business counts.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { labelsFor, isKey } = require('./click-labels');

const NAME_RE = /^(venue_view|outbound_click:[a-z_]{1,24}|click:[a-z_]{1,32})$/;
const nameOk = (n) => typeof n === 'string' && NAME_RE.test(n) && (!n.startsWith('click:') || isKey(n.slice(6)));
const EVENT_NAME_RE = /^(event_view|click:[a-z_]{1,32})$/;
const eventNameOk = (n) => typeof n === 'string' && EVENT_NAME_RE.test(n) && (!n.startsWith('click:') || isKey(n.slice(6)));
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

// The rows of a click sheet. With the page's own inventory (what is really clickable on it) the sheet lists exactly those
// items, with how many of each the page has and the clicks so far; an item clicked earlier that is no longer on the page
// is kept and marked. Without an inventory (the page could not be read) it falls back to the full list for that kind.
function sheetRows(kind, counts, inventory) {
  if (!Array.isArray(inventory)) return labelsFor(kind).map((l) => ({ key: l.key, text: l.text, group: l.group, n: counts[l.key] || 0, on_page: null, examples: [] }));
  const rows = inventory.map((i) => ({ key: i.key, text: i.text, group: i.group, n: counts[i.key] || 0, on_page: i.on_page, examples: i.examples || [] }));
  const have = new Set(rows.map((r) => r.key));
  for (const l of labelsFor(kind)) if (!have.has(l.key) && counts[l.key]) rows.push({ key: l.key, text: l.text, group: l.group, n: counts[l.key], on_page: 0, examples: [] });
  return rows;
}
// Re-cut a detail's sheet against the page's inventory.
function applyInventory(detail, kind, inventory) {
  if (!detail) return detail;
  const counts = {};
  for (const r of detail.sheet || []) if (r.n) counts[r.key] = r.n;
  return { ...detail, sheet: sheetRows(kind, counts, inventory), sheet_from_page: Array.isArray(inventory) };
}

function createCounter(db) {
  const up = db.prepare('INSERT INTO venue_event_counts (day, venue_id, name, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, venue_id, name) DO UPDATE SET n = n + 1');
  const exists = db.prepare('SELECT 1 FROM venues WHERE id = ? AND redirect_to IS NULL');

  function record(req, venueId, name, ip, now = new Date()) {
    const id = Number(venueId);
    if (!demandEnabled() || !Number.isInteger(id) || id <= 0 || !nameOk(name)) return false;
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
    let views = 0; let clickTotal = 0; const sheet = {}; let sheetTotal = 0;
    for (const r of rows) {
      if (r.name.startsWith('click:')) { sheet[r.name.slice(6)] = (sheet[r.name.slice(6)] || 0) + r.n; sheetTotal += r.n; } else if (r.name === 'venue_view') { views += r.n; viewsByDay.set(r.day, r.n); } else {
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
      sheet: sheetRows('venue', sheet), sheet_total: sheetTotal,
    };
  }

  // Events (2026-11-05): the same sheet for an event page.
  const upEv = db.prepare('INSERT INTO event_click_counts (day, event_id, name, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, event_id, name) DO UPDATE SET n = n + 1');
  const evExists = db.prepare('SELECT 1 FROM events WHERE id = ?');
  function recordEvent(req, eventId, name, ip, now = new Date()) {
    const id = Number(eventId);
    if (!demandEnabled() || !Number.isInteger(id) || id <= 0 || !eventNameOk(name)) return false;
    if (isBot(req) || isInternal(req) || rateLimited(ip) || !evExists.get(id)) return false;
    upEv.run(dayOf(now), id, name);
    return true;
  }
  function searchEvents(q) {
    const s = String(q || '').trim().slice(0, 80);
    if (s.length < 2) return [];
    const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return db.prepare(`SELECT id, name, region, 'event' AS type FROM events WHERE name LIKE ? ESCAPE '\\' ORDER BY start_datetime DESC LIMIT 8`).all(like);
  }
  function detailEvent(eventId, days = 30, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const venue = db.prepare("SELECT id, name, region, 'event' AS type FROM events WHERE id = ?").get(Number(eventId));
    if (!venue) return null;
    const list = dayList(days, now);
    const since = list[0];
    const rows = db.prepare('SELECT day, name, n FROM event_click_counts WHERE event_id = ? AND day >= ?').all(venue.id, since);
    const sheet = {}; const viewsByDay = new Map(); const clicksByDay = new Map(); let views = 0; let total = 0;
    for (const r of rows) {
      if (r.name === 'event_view') { views += r.n; viewsByDay.set(r.day, r.n); } else {
        const k = r.name.slice(6); sheet[k] = (sheet[k] || 0) + r.n; total += r.n; clicksByDay.set(r.day, (clicksByDay.get(r.day) || 0) + r.n);
      }
    }
    const first = db.prepare('SELECT MIN(day) AS d FROM event_click_counts').get().d;
    return {
      venue, days, since, counting_since: first || null, views, clicks_total: total, clicks: [],
      views_per_day: list.map((day) => ({ day, n: viewsByDay.get(day) || 0 })),
      clicks_per_day: list.map((day) => ({ day, n: clicksByDay.get(day) || 0 })),
      demand: null, sheet: sheetRows('event', sheet), sheet_total: total,
    };
  }
  // Most viewed (2026-11-05): businesses and events ranked by page views over the last N days, with their clicks.
  function top(days = 30, limit = 100, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const since = dayList(days, now)[0];
    limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const businesses = db.prepare(`SELECT v.id, v.name, v.region, v.type,
        SUM(CASE WHEN c.name = 'venue_view' THEN c.n ELSE 0 END) AS views,
        SUM(CASE WHEN c.name LIKE 'click:%' THEN c.n ELSE 0 END) AS clicks
      FROM venue_event_counts c JOIN venues v ON v.id = c.venue_id
      WHERE c.day >= ? AND v.redirect_to IS NULL GROUP BY v.id HAVING views > 0
      ORDER BY views DESC, clicks DESC, v.name LIMIT ?`).all(since, limit);
    const events = db.prepare(`SELECT e.id, e.name, e.region, 'event' AS type,
        SUM(CASE WHEN c.name = 'event_view' THEN c.n ELSE 0 END) AS views,
        SUM(CASE WHEN c.name LIKE 'click:%' THEN c.n ELSE 0 END) AS clicks
      FROM event_click_counts c JOIN events e ON e.id = c.event_id
      WHERE c.day >= ? GROUP BY e.id HAVING views > 0
      ORDER BY views DESC, clicks DESC, e.name LIMIT ?`).all(since, Math.min(limit, 50));
    const first = db.prepare('SELECT MIN(day) AS d FROM venue_event_counts').get().d;
    return { days, since, counting_since: first || null, businesses, events };
  }
  // Outbound clicks (2026-11-06): what each business got from visitors leaving for it -- website, booking, phone,
  // directions, menu, social -- over the last 7/30/90 days, busiest first. Counts only.
  const OUT = { website: ['website'], booking: ['booking'], phone: ['call_button', 'phone_number'], directions: ['directions'], menu: ['full_menu'], social: ['social_link'] };
  function outbound(days = 30, limit = 100, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const since = dayList(days, now)[0];
    limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const keyToOut = {}; for (const [o, keys] of Object.entries(OUT)) for (const k of keys) keyToOut[`click:${k}`] = o;
    const rows = db.prepare(`SELECT c.venue_id AS id, c.name, SUM(c.n) AS n FROM venue_event_counts c
      WHERE c.day >= ? AND (c.name = 'venue_view' OR c.name IN (${Object.keys(keyToOut).map(() => '?').join(',')})) GROUP BY c.venue_id, c.name`).all(since, ...Object.keys(keyToOut));
    const by = new Map();
    for (const r of rows) {
      const e = by.get(r.id) || { id: r.id, views: 0, website: 0, booking: 0, phone: 0, directions: 0, menu: 0, social: 0 };
      if (r.name === 'venue_view') e.views += r.n; else e[keyToOut[r.name]] += r.n;
      by.set(r.id, e);
    }
    const info = db.prepare('SELECT id, name, region, type FROM venues WHERE id = ? AND redirect_to IS NULL');
    const list = [];
    for (const e of by.values()) {
      e.total = e.website + e.booking + e.phone + e.directions + e.menu + e.social;
      if (!e.total) continue;
      const v = info.get(e.id); if (!v) continue;
      list.push({ ...e, name: v.name, region: v.region, type: v.type, rate: e.views ? Math.round((e.total / e.views) * 1000) / 10 : null });
    }
    list.sort((a, b) => b.total - a.total || b.views - a.views || a.name.localeCompare(b.name));
    const totals = { views: 0, website: 0, booking: 0, phone: 0, directions: 0, menu: 0, social: 0, total: 0 };
    for (const e of list) for (const k of Object.keys(totals)) totals[k] += e[k] || 0;
    const first = db.prepare('SELECT MIN(day) AS d FROM venue_event_counts').get().d;
    return { days, since, counting_since: first || null, totals, businesses: list.slice(0, limit), with_clicks: list.length };
  }
  // Event performance (2026-11-06): each event's views and what people did on its page, and coming events nobody has opened.
  const EV_OUT = { tickets: ['tickets_info'], calendar: ['add_to_calendar', 'add_to_google_calendar'], directions: ['directions'], trip: ['add_to_trip'], favorite: ['favorite'] };
  function eventStats(days = 30, limit = 100, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
    const since = dayList(days, now)[0];
    const today = dayOf(now);
    const soon = dayOf(new Date(now.getTime() + 30 * 86400000));
    const keyTo = {}; for (const [o, keys] of Object.entries(EV_OUT)) for (const k of keys) keyTo[`click:${k}`] = o;
    const by = new Map();
    const blank = () => ({ views: 0, tickets: 0, calendar: 0, directions: 0, trip: 0, favorite: 0 });
    for (const r of db.prepare('SELECT event_id AS id, name, SUM(n) AS n FROM event_click_counts WHERE day >= ? GROUP BY event_id, name').all(since)) {
      const e = by.get(r.id) || blank();
      if (r.name === 'event_view') e.views += r.n; else if (keyTo[r.name]) e[keyTo[r.name]] += r.n;
      by.set(r.id, e);
    }
    // A repeating event keeps the date of its first showing in the events table, so its start can be weeks old while the next
    // showing is still ahead. The occurrences table has the real dates: use the next one that has not finished (2026-11-08).
    const nextShowing = new Map(), hasShowings = new Set();
    try {
      for (const r of db.prepare('SELECT DISTINCT event_id FROM event_occurrences').all()) hasShowings.add(r.event_id);
      for (const r of db.prepare("SELECT event_id, MIN(MAX(start_date, ?)) AS next FROM event_occurrences WHERE status = 'scheduled' AND end_date >= ? GROUP BY event_id").all(today, today)) nextShowing.set(r.event_id, r.next);
    } catch (e) { /* no occurrences table (older databases): fall back to the event's own dates */ }
    const all = db.prepare('SELECT id, name, slug, region, start_datetime, end_datetime, recurrence_rule FROM events').all().map((v) => {
      const last = String(v.end_datetime || v.start_datetime).slice(0, 10);
      let start = String(v.start_datetime).slice(0, 10);
      let upcoming = last >= today || !!v.recurrence_rule;
      if (hasShowings.has(v.id)) { upcoming = nextShowing.has(v.id); if (upcoming) start = nextShowing.get(v.id); }
      const c = by.get(v.id) || blank();
      return { id: v.id, name: v.name, region: v.region, path: `/${v.region}/events/${v.slug}`, start, upcoming, ...c, actions: c.tickets + c.calendar + c.directions + c.trip + c.favorite };
    });
    const seen = all.filter((e) => e.views || e.actions);
    const totals = { views: 0, tickets: 0, calendar: 0, directions: 0, trip: 0, favorite: 0 };
    for (const e of seen) for (const k of Object.keys(totals)) totals[k] += e[k];
    const nameSort = (a, b) => a.name.localeCompare(b.name);
    const unseen = all.filter((e) => e.upcoming && !e.views && e.start <= soon && !e.actions).sort((a, b) => (a.start < today ? today : a.start).localeCompare(b.start < today ? today : b.start) || nameSort(a, b));
    const first = db.prepare('SELECT MIN(day) AS d FROM event_click_counts').get().d;
    return {
      days, since, counting_since: first || null, totals,
      listed: all.length, upcoming: all.filter((e) => e.upcoming).length, with_views: seen.length,
      events: [...seen].sort((a, b) => b.views - a.views || b.actions - a.actions || nameSort(a, b)).slice(0, limit),
      most_action: seen.filter((e) => e.actions > 0).sort((a, b) => b.actions - a.actions || b.views - a.views || nameSort(a, b)).slice(0, 15),
      unseen_soon: unseen.slice(0, 40), unseen_soon_count: unseen.length,
    };
  }
  return { record, search, detail, recordEvent, searchEvents, detailEvent, top, outbound, eventStats };
}

module.exports = { applyInventory, NAME_RE, nameOk, eventNameOk, RATE_PER_HOUR, createCounter, rateLimited };
