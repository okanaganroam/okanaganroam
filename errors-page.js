'use strict';
// Owner dashboard: broken pages (404s) and the links that lead to them.
const { esc, num, bars, stat, table, STYLE } = require('./dashboard-page');

const refLabel = (r) => (r.startsWith('own:') ? `our page <a href="${esc(r.slice(4))}" target="_blank" rel="noopener">${esc(r.slice(4))}</a>` : esc(r));

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data; const t = d.totals;
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(t.visitor, 'visitor hits on missing pages')}${stat(t.crawler, 'crawler hits')}${stat(t.probe, 'scanner probes (ignored)')}</div>
    ${bars(d.per_day, 'Visitors hitting a missing page, per day')}
    <h4>Links on our own pages that lead nowhere <small>fix these first</small></h4>
    ${table(['Page with the link', 'Goes to (missing)', 'Times'], d.broken_links.map((r) => [`<a href="${esc(r.from)}" target="_blank" rel="noopener">${esc(r.from)}</a>`, esc(r.to), `<b>${num(r.n)}</b>`]))}
    <h4>Missing pages people asked for <small>top ${d.missing.length}</small></h4>
    ${table(['Address', 'Visitors', 'Crawlers', 'Last seen', 'Where the link was'], d.missing.map((r) => [esc(r.path), r.visitors ? `<b>${num(r.visitors)}</b>` : '0', num(r.crawlers), esc(r.last_day), r.top_ref.length ? r.top_ref.map((x) => `${refLabel(x.ref)} (${num(x.n)})`).join('<br>') : '<span class="empty">no referrer</span>']))}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}. A 404 is an address the site does not have. “Crawlers” are search engines and other bots; “scanner probes” are hacking attempts like wp-login.php and are only counted, not listed. Fix a missing page by restoring it or adding a redirect; fix a broken link by editing the page that holds it. Pages people leave straight away are not shown, because the site keeps no visitor identity to follow. Your own visits are left out.</p></div></section>`;
}

function renderErrorsPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/errors?days=${n}">${n}d</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Broken pages – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>Broken pages</h1><p class="sub">Addresses that visitors and crawlers asked for that do not exist, and which of our pages link to them.</p>
<div class="bar"><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${sites.map((g) => siteCard(g, days)).join('')}</main>
</body></html>`;
}

module.exports = { renderErrorsPage };
