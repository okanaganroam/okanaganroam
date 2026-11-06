'use strict';
// Owner dashboard: what people search for on our own site and in Build My Trip.
const { esc, num, bars, stat, table, STYLE } = require('./dashboard-page');

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data; const t = d.totals;
  const searchLink = (term) => `<a href="/search?q=${encodeURIComponent(term)}" target="_blank" rel="noopener">${esc(term)}</a>`;
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(t.site, 'site searches')}${stat(t.trip, 'Build My Trip requests')}${stat(t.none, 'found nothing')}</div>
    ${bars(d.per_day, 'Searches per day')}
    <h4>Most searched on the site</h4>
    ${table(['Words', 'Searches', 'Found nothing'], d.top.map((r) => [searchLink(r.term), `<b>${num(r.n)}</b>`, r.none ? `<b>${num(r.none)}</b>` : '0']))}
    <h4>Searches that found nothing <small>places or topics to add</small></h4>
    ${table(['Words', 'Where', 'Found nothing'], d.missing.map((r) => [esc(r.term), r.source === 'trip' ? 'Build My Trip' : 'Site search', `<b>${num(r.none)}</b>`]))}
    <h4>What people asked Build My Trip</h4>
    ${table(['Words', 'Requests'], d.trip.map((r) => [esc(r.term), `<b>${num(r.n)}</b>`]))}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Only the cleaned words are kept, with a number: nothing about who typed them. Anything that looks like an email, web address, phone number or a long sentence is dropped. Build My Trip requests are counted once they are read, so “found nothing” there stays 0; check the site-search list for gaps. Your own visits (internal cookie) are left out.</p></div></section>`;
}

function renderSearchTermsPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/searches?days=${n}">${n}d</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>What people search for – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>What people search for</h1><p class="sub">The words typed into the site search and Build My Trip, how often, and which searches found nothing.</p>
<div class="bar"><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${sites.map((g) => siteCard(g, days)).join('')}</main>
</body></html>`;
}

module.exports = { renderSearchTermsPage };
