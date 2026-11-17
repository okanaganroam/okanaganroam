'use strict';
// Places to stay scans (2026-11-11): how often guests open a hotel's or rental's "Things to do near you" page from the
// QR code on its printed card (/q/<slug>) or from the link in our email (/guests/<slug>). Both short links answer on our
// own server with no caching, so every open is counted here, without Google Analytics. Counts only, kept in
// site_event_counts as "stay_qr:<slug>" and "stay_email:<slug>": a day, the place, a number. Nothing about the person.
// Bots, our own visits (internal cookie) and email security scanners (no Accept-Language, which every phone browser
// sends) are left out, and one device counts at most RATE_PER_HOUR times an hour (site-events.js).
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { rateLimited } = require('./site-events');

const KINDS = { q: 'stay_qr', guests: 'stay_email' };

function createStayScanCounter(db) {
  const up = db.prepare('INSERT INTO site_event_counts (day, name, n) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET n = n + 1');
  // kind: 'q' (the QR code) or 'guests' (the email link). Returns true when it was counted.
  function record(req, kind, slug, ip, now = new Date()) {
    try {
      const prefix = KINDS[kind];
      if (!prefix || !/^[a-z0-9-]{1,80}$/.test(String(slug || ''))) return false;
      if (!demandEnabled() || isBot(req) || isInternal(req)) return false;
      if (!String(req.headers['accept-language'] || '').trim()) return false;
      if (rateLimited(ip)) return false;
      up.run(dayOf(now), `${prefix}:${slug}`);
      return true;
    } catch (e) { return false; } // counting must never break the redirect
  }

  // places: [{ slug, name, region, kind }] from data/hotels.json, so places with no scans yet are listed too.
  function report(days = 30, places = [], now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const list = []; for (let i = days - 1; i >= 0; i -= 1) list.push(dayOf(new Date(now.getTime() - i * 86400000)));
    const rows = db.prepare("SELECT day, name, n FROM site_event_counts WHERE day >= ? AND (name LIKE 'stay\\_qr:%' ESCAPE '\\' OR name LIKE 'stay\\_email:%' ESCAPE '\\')").all(list[0]);
    const first = db.prepare("SELECT MIN(day) AS d FROM site_event_counts WHERE name LIKE 'stay\\_qr:%' ESCAPE '\\' OR name LIKE 'stay\\_email:%' ESCAPE '\\'").get().d;
    const lastQr = new Map(db.prepare("SELECT substr(name, 9) AS slug, MAX(day) AS d FROM site_event_counts WHERE name LIKE 'stay\\_qr:%' ESCAPE '\\' GROUP BY name").all().map((r) => [r.slug, r.d]));
    const by = new Map(); const qrPerDay = new Map();
    const get = (slug) => { if (!by.has(slug)) by.set(slug, { qr: 0, email: 0 }); return by.get(slug); };
    for (const r of rows) {
      const qr = r.name.startsWith('stay_qr:');
      const slug = r.name.slice(qr ? 8 : 11);
      get(slug)[qr ? 'qr' : 'email'] += r.n;
      if (qr) qrPerDay.set(r.day, (qrPerDay.get(r.day) || 0) + r.n);
    }
    const known = new Map((places || []).map((p) => [p.slug, p]));
    for (const p of known.values()) get(p.slug);
    const out = [...by.entries()].map(([slug, c]) => {
      const p = known.get(slug) || {};
      return { slug, name: p.name || slug, region: p.region || '', kind: p.kind || 'hotel', qr: c.qr, email: c.email, last_qr: lastQr.get(slug) || null };
    }).sort((a, b) => b.qr - a.qr || b.email - a.email || a.name.localeCompare(b.name));
    return {
      days, since: list[0], counting_since: first || null,
      places: out,
      total_qr: out.reduce((a, p) => a + p.qr, 0),
      total_email: out.reduce((a, p) => a + p.email, 0),
      places_scanned: out.filter((p) => p.qr > 0).length,
      qr_per_day: list.map((day) => ({ day, n: qrPerDay.get(day) || 0 })),
    };
  }
  return { record, report };
}

module.exports = { createStayScanCounter, KINDS };
