'use strict';
// Pages and Roam Now detail (2026-11-06). Counted on our own server when a page is opened: how often each guide, category,
// town and list page is opened, how many people went from it to a business or event page (read from the link they
// followed on our own site), and which business pages were opened or got directions from Roam Now.
// Daily totals only: a day, a page address, a fixed name, a number. No IP, no visitor id, no location, nothing typed.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { rateLimited } = require('./site-events');
const { pageOf } = require('./referrals');

const NEW_ROWS_PER_DAY = 3000; // a runaway guard on how many different pages one day can add
const SKIP = /^\/(?:api|admin|owner|claim|images|styles|scripts|healthz|share|fonts|assets)(?:\/|$)|^\/map\/|\.[a-z0-9]{2,5}$/i;
const TOOLS = new Set(['/map', '/trip', '/search', '/my-trip', '/favorites', '/favourites', '/links']);
const LISTS = new Set(['/browse', '/whats-on', '/events', '/guides', '/destinations', '/categories', '/hidden-gems', '/secret-spots', '/food-drink', '/dog-friendly', '/local-favorites']);
const NOT_COUNTED = new Set(['/list-your-venue', '/list-an-event']);
const OWN = /(?:^|\.)(?:okanaganroam\.com|whistlerroam\.com|localhost)$|\.up\.railway\.app$/;

// English and French versions of a page count together.
const fold = (p) => (p === '/fr' ? '/' : p.startsWith('/fr/') ? p.slice(3) : p);

// What kind of page an address is: home, tool, list, guide, category, town, business, event, or null (not counted).
function pageType(path) {
  if (!path) return null;
  const p = fold(path);
  if (p === '/') return 'home';
  if (SKIP.test(p) || NOT_COUNTED.has(p)) return null;
  if (TOOLS.has(p)) return 'tool';
  if (LISTS.has(p) || /^\/whats-on\/[a-z-]+$/.test(p) || /^\/[a-z-]+\/events(?:\/this-weekend)?$/.test(p)) return 'list';
  if (/^\/(?:guide\/[a-z-]+\/[a-z_-]+|guides\/[a-z0-9-]+|hidden-gems\/[a-z-]+|outdoors\/[a-z-]+)$/.test(p)) return 'guide';
  if (/^\/[a-z-]+\/events\/[a-z0-9-]+$/.test(p)) return 'event';
  if (/^\/[a-z-]+\/[a-z-]+\/[a-z0-9-]+$/.test(p)) return 'business';
  if (/^\/[a-z-]+\/[a-z-]+$/.test(p)) return 'category';
  if (/^\/[a-z-]+$/.test(p)) return 'town';
  return null;
}
const isContent = (t) => !!t && t !== 'business' && t !== 'event';

// The page on our own site a link was followed from, or null.
function ownReferer(referer) {
  try {
    const u = new URL(String(referer || ''));
    if (!OWN.test(u.hostname.toLowerCase().replace(/^www\./, ''))) return null;
    return pageOf(u.pathname);
  } catch (e) { return null; }
}

const dayList = (days, now) => { const out = []; for (let i = days - 1; i >= 0; i -= 1) out.push(dayOf(new Date(now.getTime() - i * 86400000))); return out; };
const tableExists = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function createPageStats(db) {
  const up = db.prepare('INSERT INTO page_counts (day, page, name, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, page, name) DO UPDATE SET n = n + 1');
  const seen = db.prepare('SELECT 1 FROM page_counts WHERE day = ? AND page = ? AND name = ?');
  const distinct = db.prepare('SELECT COUNT(*) AS c FROM page_counts WHERE day = ?');
  function bump(day, page, name) {
    if (!seen.get(day, page, name) && distinct.get(day).c >= NEW_ROWS_PER_DAY) return;
    up.run(day, page, name);
  }

  // Called for each page request; counts once the answer is known to be a normal page (200, HTML).
  function watch(req, res, ip, now = () => new Date()) {
    if (req.method !== 'GET') return;
    const path = pageOf(req.url);
    const type = pageType(path);
    if (!type) return;
    res.on('finish', () => {
      try {
        if (res.statusCode !== 200 || !/content-type:\s*text\/html/i.test(`content-type: ${res.getHeader('Content-Type') || ''}\n${res._header || ''}`) || !demandEnabled() || isBot(req) || isInternal(req) || rateLimited(ip)) return;
        const day = dayOf(now());
        const page = fold(path);
        if (isContent(type)) bump(day, page, 'view');
        const from = ownReferer(req.headers.referer || req.headers.referrer);
        const fromType = pageType(from);
        if (!isContent(fromType) || !(type === 'business' || type === 'event')) return;
        const source = fold(from);
        bump(day, source, type === 'business' ? 'to_business' : 'to_event');
        if (source === '/map' && type === 'business') bump(day, page, 'map_open');
      } catch (e) { /* counting must never break the site */ }
    });
  }

  // Directions asked for on Roam Now, sent by the map page with the business's address.
  function recordMapDirections(req, path, ip, now = new Date()) {
    try {
      const p = pageOf(path);
      if (pageType(p) !== 'business' || !demandEnabled() || isBot(req) || isInternal(req) || rateLimited(ip)) return false;
      bump(dayOf(now), fold(p), 'map_directions');
      return true;
    } catch (e) { return false; }
  }

  const since = (days, now) => dayList(days, now)[0];
  const okDays = (days) => ([7, 30, 90].includes(Number(days)) ? Number(days) : 30);

  // Each page: views, where its outside visits came from, and how many people it sent on.
  function pages(days = 30, limit = 200, now = new Date()) {
    days = okDays(days);
    const start = since(days, now);
    const map = new Map();
    const get = (page) => { if (!map.has(page)) map.set(page, { page, type: pageType(page), views: 0, to_business: 0, to_event: 0, from: { search: 0, ai: 0, social: 0, email: 0, other: 0 } }); return map.get(page); };
    for (const r of db.prepare("SELECT page, name, SUM(n) AS n FROM page_counts WHERE day >= ? AND name IN ('view', 'to_business', 'to_event') GROUP BY page, name").all(start)) {
      const e = get(r.page);
      if (r.name === 'view') e.views = r.n; else e[r.name] = r.n;
    }
    if (tableExists(db, 'referral_counts')) {
      for (const r of db.prepare("SELECT page, source, SUM(n) AS n FROM referral_counts WHERE kind = 'visit' AND day >= ? GROUP BY page, source").all(start)) {
        const page = fold(r.page);
        if (!isContent(pageType(page)) || !map.has(page)) continue;
        const g = r.source.split(':')[0];
        const e = map.get(page);
        e.from[g in e.from ? g : 'other'] += r.n;
      }
    }
    const all = [...map.values()].filter((e) => isContent(e.type)).map((e) => {
      const sent = e.to_business + e.to_event;
      return { ...e, sent, rate: e.views ? Math.round((sent / e.views) * 100) : null };
    });
    const byName = (a, b) => a.page.localeCompare(b.page);
    const types = {};
    for (const e of all) { const t = types[e.type] || (types[e.type] = { type: e.type, pages: 0, views: 0, sent: 0 }); t.pages += 1; t.views += e.views; t.sent += e.sent; }
    const enough = all.filter((e) => e.views >= 10 && e.type !== 'tool' && e.type !== 'home');
    const first = db.prepare('SELECT MIN(day) AS d FROM page_counts').get().d;
    return {
      days, since: start, counting_since: first || null,
      totals: { pages: all.length, views: all.reduce((s, e) => s + e.views, 0), sent: all.reduce((s, e) => s + e.sent, 0) },
      types: Object.values(types).sort((a, b) => b.views - a.views),
      top: [...all].sort((a, b) => b.views - a.views || byName(a, b)).slice(0, limit),
      best: [...enough].filter((e) => e.sent > 0).sort((a, b) => b.rate - a.rate || b.sent - a.sent || byName(a, b)).slice(0, 20),
      none_sent: [...enough].filter((e) => e.sent === 0).sort((a, b) => b.views - a.views || byName(a, b)).slice(0, 20),
    };
  }

  // Roam Now detail: which filters, which words, which towns and businesses.
  function roamNow(days = 30, now = new Date()) {
    days = okDays(days);
    const start = since(days, now);
    const ev = new Map(db.prepare('SELECT name, SUM(n) AS n FROM site_event_counts WHERE day >= ? GROUP BY name').all(start).map((r) => [r.name, r.n]));
    const g = (k) => ev.get(k) || 0;
    const filters = [...ev.entries()].filter(([k]) => k.startsWith('map_filter:')).map(([k, n]) => ({ key: k.slice(11), n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
    const lookup = db.prepare('SELECT name, region FROM venues WHERE slug = ? AND redirect_to IS NULL');
    const biz = new Map();
    for (const r of db.prepare("SELECT page, name, SUM(n) AS n FROM page_counts WHERE day >= ? AND name IN ('map_open', 'map_directions') GROUP BY page, name").all(start)) {
      const e = biz.get(r.page) || { page: r.page, opens: 0, directions: 0 };
      if (r.name === 'map_open') e.opens = r.n; else e.directions = r.n;
      biz.set(r.page, e);
    }
    const businesses = []; const towns = new Map();
    for (const e of biz.values()) {
      const [, town, , slug] = e.page.split('/');
      const rows = lookup.all(slug);
      const v = rows.find((x) => x.region === town) || rows[0];
      if (!v) continue; // an address that is not one of our businesses is left out
      businesses.push({ ...e, name: v.name, region: v.region });
      const t = towns.get(town) || { town: titleCase(town), opens: 0, directions: 0 };
      t.opens += e.opens; t.directions += e.directions;
      towns.set(town, t);
    }
    const opens = businesses.reduce((s, b) => s + b.opens, 0);
    const directions = businesses.reduce((s, b) => s + b.directions, 0);
    const score = (x) => x.opens + x.directions;
    let words = []; let none = [];
    if (tableExists(db, 'search_term_counts')) {
      const rows = db.prepare("SELECT term, SUM(n) AS n, SUM(CASE WHEN found = 0 THEN n ELSE 0 END) AS none FROM search_term_counts WHERE source = 'map' AND day >= ? GROUP BY term").all(start);
      words = [...rows].sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, 40);
      none = rows.filter((r) => r.none > 0).sort((a, b) => b.none - a.none || a.term.localeCompare(b.term)).slice(0, 30);
    }
    const pv = g('page_view:map');
    const share = (n) => (pv ? Math.round((n / pv) * 100) : null);
    const step = (text, n) => ({ text, n, of_opens: share(n) });
    const first = db.prepare("SELECT MIN(day) AS d FROM page_counts WHERE name IN ('map_open', 'map_directions')").get().d;
    return {
      days, since: start, counting_since: first || null,
      steps: [step('Opened Roam Now', pv), step('Used Near me', g('map_near_me')), step('Searched', g('map_search')), step('Turned on a filter', filters.reduce((s, f) => s + f.n, 0)), step('Opened a business page from the map', opens), step('Asked for directions to a business', directions), step('Arrived (on-site directions)', g('map_arrived'))],
      extra: [{ text: 'Searches that found nothing', n: g('map_search_empty') }, { text: 'Voice searches', n: g('map_voice_search') }, { text: 'Start pins dropped', n: g('map_pin') }, { text: 'Shares', n: g('map_share') }, { text: 'Near me used outside the region', n: g('map_outside') }],
      filters, words, none,
      towns: [...towns.values()].sort((a, b) => score(b) - score(a) || a.town.localeCompare(b.town)),
      businesses: businesses.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 40),
    };
  }
  return { watch, recordMapDirections, pages, roamNow };
}

module.exports = { pageType, fold, ownReferer, createPageStats };
