'use strict';
// Broken pages (2026-11-06): which addresses visitors and crawlers asked for that do not exist (404), how many times,
// and which page linked to them, so bad links and removed pages can be fixed. Daily totals only: a day, who asked
// (visitor / crawler / probe), the address, where the link was (our own page or an outside site's name), a number.
// No IP, no visitor id, no query words, nothing typed. Scanner probes (wp-login.php, .env ...) are only counted, not listed.
const { isBot, isInternal, dayOf, enabled: demandEnabled } = require('./trip-demand');
const { rateLimited } = require('./site-events');
const { classifyAgent } = require('./referrals');

const OWN = /(?:^|\.)(?:okanaganroam\.com|whistlerroam\.com|localhost)$|\.up\.railway\.app$/;
const PROBE = /\.(?:php\d?|asp|aspx|jsp|env|git|svn|sql|bak|ini|cgi|yml|yaml|log|zip|tar|gz|rar|swp)(?:$|\/)|wp-|wordpress|phpmyadmin|xmlrpc|cgi-bin|\/\.|actuator|server-status|\/vendor\/|\/node_modules\/|\/etc\/|\/proc\/|\/shell|\/admin\.|\/solr\/|\/config/i;
// More scanner probes (2026-11-14), from the dashboard's own Broken pages list: bots hunting for secret files, cloud
// keys, debug tools and source maps. None of these is a page on either site, so they are scanners, not visitors.
const PROBE_MORE = new RegExp([
  String.raw`\.(?:map|properties|toml|tfstate|tfvars|tfstate\.backup|sqlite|axd|action|pem|plist|py|csv|old)$`,
  String.raw`^\/(?:[\w-]+\/)?_*env(?:\.[\w.]+)?$`, String.raw`%2e`, String.raw`environments?[\w.\/-]*\.json$`,
  String.raw`(?:^|\/)(?:app)?settings[\w.-]*\.json$`, String.raw`(?:^|\/)secrets?(?:\.[a-z]+|\/|$)`, String.raw`credentials`, String.raw`^\/auth\.json$`,
  String.raw`(?:^|\/)(?:client_secrets?|service-account|firebase[\w.-]*|gcp[\w.-]*|google[\w-]*credentials|google-services|application_default_credentials|aws[\w.-]*|s3|key|api-keys|keys\/[\w.-]+)\.(?:json|js|txt)$`,
  String.raw`(?:^|\/)(?:id_rsa|id_ed25519|kubeconfig|jenkinsfile|error_log|composer\.json|ormconfig\.json|netlify\.toml|vercel\.json|webpack\.json|asset-manifest\.json|stats\.json|readme\.html|web\.config|[\w-]*task-definition\.json)$`,
  String.raw`(?:^|\/)(?:app|index|main|bundle|vendor|runtime|commons|env-config|runtime-config|app\.config|aws\.config)\.(?:js|json)$`,
  String.raw`telescope\/|_profiler|phpinfo|_debugbar|_ignition|\/debug\/default|elmah|trace\.axd|server-info|\/manager\/html|^\/webmail|___proxy_subdomain|\/v2\/_catalog|\/api\/v1\/namespaces|^\/metrics$|^\/-\/ping|@vite|_nuxt\/|^\/ecp\/|^\/curl\/|^\/(?:getcmd|aaa9|aab9|aaabbbccc|v2|fwc|fzh)$|__bf_catchall|^\/api\/session\/|^\/api\/(?:settings|v1\/version)$|^\/actions\/users\/|^\/language\/[\w-]+\/[\w.-]+\.xml$|^\/media\/system\/|^\/scripts\/app\.js`,
].join('|'), 'i');
const isProbe = (path) => !path || PROBE.test(path) || PROBE_MORE.test(path);
const NEW_ROWS_PER_DAY = 2000;

const cleanPath = (url) => {
  const p = String(url || '').split(/[?#]/)[0];
  return /^\/[A-Za-z0-9._~\/%+@:,'()&=-]{0,160}$/.test(p) ? p.replace(/(.)\/+$/, '$1') : null;
};
// Where the link was: our own page ("own:/kelowna/breweries") or the outside site's name, or '' when unknown.
function refOf(referer) {
  try {
    const u = new URL(String(referer || ''));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return '';
    if (OWN.test(host)) { const p = cleanPath(u.pathname); return p ? `own:${p.slice(0, 100)}` : 'own:/'; }
    return /^[a-z0-9][a-z0-9.-]{2,60}$/.test(host) ? host : '';
  } catch (e) { return ''; }
}

function createNotFoundCounter(db) {
  const up = db.prepare('INSERT INTO not_found_counts (day, kind, path, ref, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(day, kind, path, ref) DO UPDATE SET n = n + 1');
  const seen = db.prepare('SELECT 1 FROM not_found_counts WHERE day = ? AND kind = ? AND path = ? AND ref = ?');
  const distinct = db.prepare('SELECT COUNT(*) AS c FROM not_found_counts WHERE day = ?');
  function bump(day, kind, path, ref) {
    if (path && !seen.get(day, kind, path, ref) && distinct.get(day).c >= NEW_ROWS_PER_DAY) path = '(other)';
    up.run(day, kind, path, ref);
  }

  // Called for every request; counts when the answer turns out to be a 404 for a GET.
  function watch(req, res, ip, now = () => new Date()) {
    if (req.method !== 'GET') return;
    const path = cleanPath(req.url);
    res.on('finish', () => {
      try {
        if (res.statusCode !== 404 || !demandEnabled() || isInternal(req)) return;
        const day = dayOf(now());
        if (isProbe(path)) return bump(day, 'probe', '', '');
        const ua = String(req.headers['user-agent'] || '');
        if (classifyAgent(ua) || isBot(req)) return bump(day, 'crawler', path, '');
        if (rateLimited(ip)) return;
        bump(day, 'visitor', path, refOf(req.headers.referer || req.headers.referrer));
      } catch (e) { /* counting must never break the site */ }
    });
  }

  function report(days = 30, limit = 100, now = new Date()) {
    days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
    const list = []; for (let i = days - 1; i >= 0; i -= 1) list.push(dayOf(new Date(now.getTime() - i * 86400000)));
    const rows = db.prepare('SELECT day, kind, path, ref, n FROM not_found_counts WHERE day >= ?').all(list[0]);
    const totals = { visitor: 0, crawler: 0, probe: 0 };
    const pages = new Map(); const links = new Map(); const perDay = new Map();
    for (const r of rows) {
      // Rows counted before a probe pattern was added are counted as probes now, and not listed.
      const kind = r.kind !== 'probe' && isProbe(r.path) ? 'probe' : r.kind;
      totals[kind] = (totals[kind] || 0) + r.n;
      if (kind === 'probe') continue;
      const e = pages.get(r.path) || { path: r.path, visitors: 0, crawlers: 0, last_day: '', refs: new Map() };
      if (r.kind === 'visitor') {
        e.visitors += r.n; perDay.set(r.day, (perDay.get(r.day) || 0) + r.n);
        if (r.ref) e.refs.set(r.ref, (e.refs.get(r.ref) || 0) + r.n);
        if (r.ref.startsWith('own:')) { const k = `${r.ref.slice(4)}|${r.path}`; links.set(k, (links.get(k) || 0) + r.n); }
      } else e.crawlers += r.n;
      if (r.day > e.last_day) e.last_day = r.day;
      pages.set(r.path, e);
    }
    const missing = [...pages.values()].map((e) => ({
      path: e.path, visitors: e.visitors, crawlers: e.crawlers, last_day: e.last_day,
      top_ref: [...e.refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ref, n]) => ({ ref, n })),
    })).sort((a, b) => b.visitors - a.visitors || b.crawlers - a.crawlers || a.path.localeCompare(b.path)).slice(0, limit);
    const broken_links = [...links.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, n]) => { const i = k.indexOf('|'); return { from: k.slice(0, i), to: k.slice(i + 1), n }; });
    const first = db.prepare('SELECT MIN(day) AS d FROM not_found_counts').get().d;
    return { days, since: list[0], counting_since: first || null, totals, missing, broken_links, per_day: list.map((day) => ({ day, n: perDay.get(day) || 0 })) };
  }
  return { watch, report, bump };
}

module.exports = { cleanPath, refOf, isProbe, createNotFoundCounter };
