'use strict';
// Owner dashboard: outbound clicks per business (website, book, call, directions, menu, social), busiest first.
const { esc, num, stat, table, STYLE } = require('./dashboard-page');

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data; const t = d.totals;
  const site = g.key;
  const rows = d.businesses.map((b) => [
    `<a href="/admin/dashboard/business?site=${site}&id=${b.id}&days=${days}">${esc(b.name)}</a> <small>${esc(b.region || '')}</small>`,
    num(b.views), `<b>${num(b.total)}</b>`, b.rate === null ? '' : `${b.rate}%`,
    num(b.website), num(b.booking), num(b.phone), num(b.directions), num(b.menu), num(b.social),
  ]);
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(t.total, 'outbound clicks')}${stat(t.website, 'website')}${stat(t.booking, 'book / tickets')}${stat(t.phone, 'calls')}${stat(t.directions, 'directions')}</div>
    <h4>Businesses visitors went on to contact <small>${num(d.with_clicks)} had at least one click; top ${d.businesses.length} shown</small></h4>
    ${table(['Business', 'Views', 'Clicks out', 'Clicks per view', 'Website', 'Book', 'Call', 'Directions', 'Menu', 'Social'], rows)}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}. A click is a visitor pressing the button on the business page; it shows interest, not that they went in or bought. “Clicks per view” is clicks out divided by page views. Click a name for its full click sheet. Your own visits are left out.</p></div></section>`;
}

function renderOutboundPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/outbound?days=${n}">${n}d</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Outbound clicks – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>Outbound clicks</h1><p class="sub">What each business gets from visitors: website, booking, call, directions, menu and social clicks. Use the 30-day view as the monthly summary to share with a business.</p>
<div class="bar"><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${sites.map((g) => siteCard(g, days)).join('')}</main>
</body></html>`;
}

module.exports = { renderOutboundPage };
