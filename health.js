'use strict';
// Tracking health (2026-11-06): has any of our own counters gone quiet? A broken script after a deploy would otherwise
// run unnoticed for days. For each counter, yesterday (a complete day) is compared with its recent normal. Pure reads
// of the counts we already keep.
const { dayOf } = require('./trip-demand');

// [key, label, SQL returning (day, n) rows for days >= ?]
const COUNTERS = [
  ['venue_view', 'Business page views', "SELECT day, SUM(n) AS n FROM venue_event_counts WHERE name = 'venue_view' AND day >= ? GROUP BY day"],
  ['site_events', 'Page and feature events', 'SELECT day, SUM(n) AS n FROM site_event_counts WHERE day >= ? GROUP BY day'],
  ['crawls', 'Crawler and referral counter', "SELECT day, SUM(n) AS n FROM referral_counts WHERE day >= ? GROUP BY day"],
];
const WINDOW = 14; const MIN_HISTORY = 5; const MIN_NORMAL = 8;

const tableExists = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const dayList = (endDay, n) => { const end = new Date(`${endDay}T12:00:00Z`); const out = []; for (let i = n - 1; i >= 0; i -= 1) out.push(new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10)); return out; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function check(db, now = new Date()) {
  const yesterday = dayOf(new Date(now.getTime() - 86400000));
  const counters = [];
  for (const [key, label, sql] of COUNTERS) {
    const table = /FROM (\w+)/.exec(sql)[1];
    if (!tableExists(db, table)) continue;
    const days = dayList(yesterday, WINDOW + 1);
    const rows = new Map(db.prepare(sql).all(days[0]).map((r) => [r.day, r.n]));
    const first = db.prepare(sql.replace(/SELECT day, SUM\(n\) AS n/, 'SELECT MIN(day) AS d').replace(/ AND day >= \?.*$/, '').replace(/ WHERE day >= \?.*$/, '')).get().d;
    const history = days.slice(0, -1).filter((d) => first && d >= first);
    const y = rows.get(yesterday) || 0;
    let status = 'ok'; let normal = null;
    if (history.length < MIN_HISTORY) status = 'learning';
    else {
      normal = median(history.map((d) => rows.get(d) || 0));
      if (normal >= MIN_NORMAL) status = y === 0 ? 'silent' : y < normal * 0.2 ? 'low' : 'ok';
    }
    counters.push({ key, label, yesterday: y, normal, history_days: history.length, status });
  }
  const problems = counters.filter((c) => c.status === 'silent' || c.status === 'low').map((c) => (c.status === 'silent'
    ? `${c.label} recorded nothing yesterday (a normal day is about ${Math.round(c.normal)}).`
    : `${c.label} dropped to ${c.yesterday} yesterday (a normal day is about ${Math.round(c.normal)}).`));
  return { day: yesterday, counters, problems, silent: counters.filter((c) => c.status === 'silent').map((c) => c.key) };
}

module.exports = { COUNTERS, check, median };
