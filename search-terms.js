'use strict';
// What people search for on our own site (2026-11-06). Counts the words typed into the site search (/search) and into
// Build My Trip, with whether anything was found, so the dashboard can show what visitors want and what we are missing.
// Daily totals only: a day, where it was typed, the cleaned words, found or not, a number. No IP, no visitor id.
// Anything that could identify someone (an email, a web address, a phone-like number, a long sentence) is dropped, not stored.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { rateLimited } = require('./site-events');

const SOURCES = new Set(['site', 'trip']);
const MAX_LEN = 80;
const MAX_WORDS = 10;
const NEW_TERMS_PER_DAY = 600; // a runaway guard on how many different words one day can add

// Cleaned words, or '' when the text should not be kept.
function clean(text) {
  let t = String(text || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > MAX_LEN) return '';
  if (/@|https?:|www\.|\.(?:com|ca|net|org)\b/.test(t)) return '';
  if (/\d[\d\s().+-]{4,}\d/.test(t) || /\d{5,}/.test(t)) return ''; // phone numbers, long ids
  t = t.replace(/[^\p{L}\p{N} '’&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.split(' ').length > MAX_WORDS) return '';
  return t.replace(/’/g, "'");
}

function createSearchTermCounter(db) {
  const up = db.prepare('INSERT INTO search_term_counts (day, source, term, found, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(day, source, term, found) DO UPDATE SET n = n + 1');
  const seen = db.prepare('SELECT 1 FROM search_term_counts WHERE day = ? AND source = ? AND term = ? AND found = ?');
  const distinct = db.prepare('SELECT COUNT(*) AS c FROM search_term_counts WHERE day = ?');

  function record(req, source, text, found, ip, now = new Date()) {
    try {
      if (!SOURCES.has(source) || !demandEnabled() || isBot(req) || isInternal(req)) return false;
      const term = clean(text);
      if (!term || rateLimited(ip)) return false;
      const day = dayOf(now); const f = found ? 1 : 0;
      if (!seen.get(day, source, term, f) && distinct.get(day).c >= NEW_TERMS_PER_DAY) return false;
      up.run(day, source, term, f);
      return true;
    } catch (e) { return false; } // counting must never break search
  }

  function report(days = 30, limit = 100, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
    const list = []; for (let i = days - 1; i >= 0; i -= 1) list.push(dayOf(new Date(now.getTime() - i * 86400000)));
    const rows = db.prepare('SELECT day, source, term, found, n FROM search_term_counts WHERE day >= ?').all(list[0]);
    const terms = new Map(); const perDay = new Map(); const totals = { site: 0, trip: 0, found: 0, none: 0 };
    for (const r of rows) {
      const k = `${r.source}|${r.term}`;
      const e = terms.get(k) || { term: r.term, source: r.source, found: 0, none: 0 };
      if (r.found) { e.found += r.n; totals.found += r.n; } else { e.none += r.n; totals.none += r.n; }
      terms.set(k, e);
      totals[r.source] += r.n;
      perDay.set(r.day, (perDay.get(r.day) || 0) + r.n);
    }
    const all = [...terms.values()].map((e) => ({ ...e, n: e.found + e.none }));
    const first = db.prepare('SELECT MIN(day) AS d FROM search_term_counts').get().d;
    return {
      days, since: list[0], counting_since: first || null, totals,
      top: all.filter((e) => e.source === 'site').sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, limit),
      trip: all.filter((e) => e.source === 'trip').sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, limit),
      missing: all.filter((e) => e.none > 0).sort((a, b) => b.none - a.none || a.term.localeCompare(b.term)).slice(0, limit),
      per_day: list.map((day) => ({ day, n: perDay.get(day) || 0 })),
    };
  }
  return { record, report };
}

module.exports = { clean, createSearchTermCounter };
