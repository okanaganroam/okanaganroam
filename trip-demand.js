'use strict';
// Build My Trip demand log -- Stage 1 (2026-11-05).
// Records, anonymously, which businesses Build My Trip shows and which ones
// visitors add to / remove from their trip. Nothing here identifies a person:
// the visitor key is a hash of IP + user agent + the date, so it changes
// every day and cannot be tied back to anyone. Used only to count how many
// different visitors wanted each business (see /api/admin/trip-demand).
const crypto = require('crypto');

const KINDS = new Set(['shown', 'add', 'remove']);
const DAILY_CAP = 300; // rows per visitor per day, a runaway-bot guard
const BOT_RE = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|curl|wget|python|axios|node-fetch|go-http|lighthouse|facebookexternalhit|audit|domain-watch|^node$|^mozilla\/5\.0$/i;

function enabled(env = process.env) {
  return String(env.TRIP_DEMAND_LOG || 'on').toLowerCase() !== 'off';
}

function dayOf(now = new Date()) {
  return new Date(now.getTime() - 8 * 3600000).toISOString().slice(0, 10); // Pacific-ish day
}

function visitorKey(ip, ua, day, secret = process.env.TRIP_DEMAND_SALT || 'okanagan-roam-trip-demand') {
  return crypto.createHash('sha256').update(`${secret}|${day}|${ip}|${ua}`).digest('hex').slice(0, 20);
}

function isBot(req) {
  const ua = String(req.headers['user-agent'] || '');
  return !ua || BOT_RE.test(ua);
}

// Our own visits: the roam_internal cookie, or an address in INTERNAL_IPS (comma separated), so testing never counts as visitors.
function isInternal(req, env = process.env) {
  if (/(?:^|;\s*)roam_internal=1(?:;|$)/.test(String(req.headers.cookie || ''))) return true;
  const ip = String(req.headers['x-real-ip'] || '').trim();
  return !!ip && String(env.INTERNAL_IPS || '').split(',').map((x) => x.trim()).includes(ip);
}

// Walk a plan result and collect the ids of venues it recommends.
function collectVenueIds(node, out = new Set(), depth = 0) {
  if (!node || depth > 8 || out.size > 200) return out;
  if (Array.isArray(node)) { for (const n of node) collectVenueIds(n, out, depth + 1); return out; }
  if (typeof node !== 'object') return out;
  if (node.venue && typeof node.venue === 'object' && Number.isInteger(node.venue.id)) out.add(node.venue.id);
  if (Number.isInteger(node.venue_id)) out.add(node.venue_id);
  if (Number.isInteger(node.venueId)) out.add(node.venueId);
  if (typeof node.ref === 'string') { const m = /^venue:([1-9][0-9]*)$/.exec(node.ref); if (m) out.add(Number(m[1])); }
  for (const k of Object.keys(node)) {
    if (k === 'venue') continue;
    const v = node[k];
    if (v && typeof v === 'object') collectVenueIds(v, out, depth + 1);
  }
  return out;
}

function createLogger(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO trip_demand_events (day, visitor, venue_id, kind) VALUES (?, ?, ?, ?)');
  const exists = db.prepare('SELECT 1 FROM venues WHERE id = ?');
  const countToday = db.prepare('SELECT COUNT(*) AS n FROM trip_demand_events WHERE day = ? AND visitor = ?');
  function record(req, kind, venueIds, now = new Date()) {
    if (!enabled() || !KINDS.has(kind) || isBot(req) || isInternal(req)) return 0;
    const day = dayOf(now);
    const visitor = visitorKey(req.__ip, String(req.headers['user-agent'] || ''), day);
    let room = DAILY_CAP - countToday.get(day, visitor).n;
    let wrote = 0;
    for (const id of venueIds) {
      if (room <= 0) break;
      if (!Number.isInteger(id) || id < 1 || !exists.get(id)) continue;
      wrote += insert.run(day, visitor, id, kind).changes;
      room -= 1;
    }
    return wrote;
  }
  // Venues ranked by distinct visitor-days, over the last `days` days.
  function report(days = 30, threshold = 10, now = new Date()) {
    const since = dayOf(new Date(now.getTime() - days * 86400000));
    const rows = db.prepare(`
      SELECT v.id, v.name, v.region, v.type,
        SUM(e.kind = 'shown') AS shown, SUM(e.kind = 'add') AS added, SUM(e.kind = 'remove') AS removed
      FROM trip_demand_events e JOIN venues v ON v.id = e.venue_id
      WHERE e.day >= ? GROUP BY v.id ORDER BY added DESC, shown DESC`).all(since);
    return rows.map((r) => ({ ...r, ready_to_contact: (r.added || 0) >= threshold }));
  }
  return { record, report };
}

module.exports = { enabled, dayOf, visitorKey, isBot, isInternal, collectVenueIds, createLogger, DAILY_CAP, KINDS };
