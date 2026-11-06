'use strict';
// Owner dashboard: guide and page performance, and Roam Now detail, both sites side by side.
const { esc, num, stat, table, STYLE } = require('./dashboard-page');

const TYPES = { home: 'Home', tool: 'Tool', list: 'List', guide: 'Guide', category: 'Category', town: 'Town or topic' };
const FILTERS = {
  open: 'Open now', top: 'Top picks', drinks: 'Drinks', food: 'Food', coffee: 'Coffee', wine: 'Wineries', beach: 'Beaches', outdoor: 'Outdoors', golf: 'Golf', do: 'Things to do',
  patio: 'Patio', dogs: 'Dogs OK', happy: 'Happy hour now', specials: 'Specials today', nights: 'Weekly nights', music: 'Live music', lake: 'Lake view', kids: 'Kid friendly',
  veg: 'Vegetarian', vegan: 'Vegan', gf: 'Gluten free', late: 'Open late', early: 'Open early', groups: 'Good for groups', sports: 'Sports on TV', nonalc: 'Alcohol-free drinks', free: 'Free to visit',
};
const pct = (n) => (n === null || n === undefined ? '–' : `${n}%`);
const link = (p) => `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;
const shell = (title, sub, nav, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>
<div class="bar"><div class="tabs">${nav}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${body}</main>
</body></html>`;
const range = (path, days) => [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="${path}?days=${n}">${n}d</a>`).join('');
const errorCol = (g) => `<section class="col"><h2>${esc(g.name)}</h2><div class="card"><p class="empty">${esc(g.error || 'No data yet.')}</p></div></section>`;

function pagesCol(g, days) {
  if (!g.data) return errorCol(g);
  const d = g.data;
  const rows = (list) => table(['Page', 'Type', 'Opened', 'From Google etc.', 'From AI', 'From social', 'Sent to a business or event', 'Share sent on'],
    list.map((r) => [link(r.page), esc(TYPES[r.type] || r.type), `<b>${num(r.views)}</b>`, num(r.from.search), num(r.from.ai), num(r.from.social), `<b>${num(r.sent)}</b>`, pct(r.rate)]));
  const short = (list) => table(['Page', 'Opened', 'Sent on', 'Share'], list.map((r) => [link(r.page), num(r.views), num(r.sent), pct(r.rate)]));
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(d.totals.pages, 'pages opened')}${stat(d.totals.views, 'times opened')}${stat(d.totals.sent, 'sent to a business or event')}</div>
    <h4>By kind of page</h4>
    ${table(['Kind', 'Pages', 'Opened', 'Sent on'], d.types.map((t) => [esc(TYPES[t.type] || t.type), num(t.pages), `<b>${num(t.views)}</b>`, num(t.sent)]))}
    <h4>Best at sending people to businesses <small>opened at least 10 times</small></h4>${short(d.best)}
    <h4>Opened but sent nobody on <small>opened at least 10 times</small></h4>${short(d.none_sent)}
    <h4>All pages</h4>${rows(d.top)}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. "Sent on" counts people who followed a link from that page to a business or event page on our site. Clicks straight to a business’s own website are on the Outbound clicks page. Plain daily totals; English and French pages count together.</p>
  </div></section>`;
}

function renderPagesPage({ days = 30, sites = [] }) {
  return shell('Guides and pages', 'Which guides, categories, towns and lists get opened, where those visits came from, and which pages send people on to businesses.', range('/admin/dashboard/pages', days), sites.map((g) => pagesCol(g, days)).join(''));
}

function roamCol(g, days) {
  if (!g.data) return errorCol(g);
  const d = g.data;
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <h4>What people did <small>each compared with times opened; these are actions, not people</small></h4>
    ${table(['Step', 'Times', 'Compared with opens'], d.steps.map((s) => [esc(s.text), `<b>${num(s.n)}</b>`, pct(s.of_opens)]))}
    <h4>Filters turned on</h4>
    ${table(['Filter', 'Times'], d.filters.map((f) => [esc(FILTERS[f.key] || f.key), `<b>${num(f.n)}</b>`]))}
    <h4>Words typed into Roam Now</h4>
    ${table(['Words', 'Searches', 'Found nothing'], d.words.map((r) => [esc(r.term), `<b>${num(r.n)}</b>`, r.none ? `<b>${num(r.none)}</b>` : '0']))}
    <h4>Roam Now searches that found nothing <small>places or topics to add</small></h4>
    ${table(['Words', 'Found nothing'], d.none.map((r) => [esc(r.term), `<b>${num(r.none)}</b>`]))}
    <h4>Towns <small>by the businesses people opened or got directions to</small></h4>
    ${table(['Town', 'Business pages opened', 'Directions'], d.towns.map((t) => [esc(t.town), `<b>${num(t.opens)}</b>`, num(t.directions)]))}
    <h4>Businesses</h4>
    ${table(['Business', 'Pages opened', 'Directions'], d.businesses.map((b) => [link(b.page).replace(`>${esc(b.page)}<`, `>${esc(b.name)}<`), `<b>${num(b.opens)}</b>`, num(b.directions)]))}
    <h4>Also</h4>
    ${table(['What', 'Times'], d.extra.map((e) => [esc(e.text), num(e.n)]))}
    <p class="empty">Filter, word, town and business detail started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero there. No locations are stored: towns come from the business that was opened, never from where the visitor is. Voice searches are counted but their words are not kept.</p>
  </div></section>`;
}

function renderRoamNowPage({ days = 30, sites = [] }) {
  return shell('Roam Now detail', 'What people do on the map: filters, words, towns and the businesses they open or get directions to.', range('/admin/dashboard/roam-now', days), sites.map((g) => roamCol(g, days)).join(''));
}

module.exports = { renderPagesPage, renderRoamNowPage };
