'use strict';
// Owner dashboard: business search + activity page. Server-rendered, private (noindex, signed-in only).
const { esc, num, bars, stat, table, STYLE } = require('./dashboard-page');

const LABELS = { website: 'Website', phone: 'Phone', booking: 'Book online', directions: 'Directions', other: 'Other link' };

// The click sheet: what this page has that can be clicked, with how many there are and how many clicks each got.
function sheetHtml(v) {
  const rows = v.sheet || [];
  if (!rows.length) return '';
  const total = v.sheet_total || 0;
  const sorted = rows.slice().sort((a, b) => b.n - a.n || rows.indexOf(a) - rows.indexOf(b));
  const hint = (r) => {
    if (r.on_page === 0) return ' <small class="warn">(no longer on this page)</small>';
    const named = ['cta_other', 'booking', 'social_link', 'featured_guide', 'more_like_this', 'claim_listing', 'expand_section', 'other_link', 'other_button', 'tickets_info', 'event_website', 'full_menu', 'see_deals', 'more_details'].includes(r.key);
    return named && r.examples && r.examples.length ? ` <small>${esc(r.examples.join(' · '))}</small>` : '';
  };
  return `<h4>Everything clickable on this page <small>${num(total)} clicks in all</small></h4>
    ${v.sheet_from_page ? '' : '<p class="warn">Couldn’t read the live page just now, so this is the general list for this kind of page.</p>'}
    ${table(['What', 'Where', 'On the page', 'Clicks', 'Share'], sorted.map((r) => [esc(r.text) + hint(r), esc(r.group), r.on_page == null ? '' : num(r.on_page), r.n ? `<b>${num(r.n)}</b>` : '0', total && r.n ? `${Math.round((r.n / total) * 100)}%` : '']))}`;
}

function detailCard(d, days) {
  if (d.error || !d.data) return `<div class="card"><p class="warn">${esc(d.error || 'No data.')}</p></div>`;
  const v = d.data;
  const dm = v.demand;
  return `<div class="card"><h3>${esc(v.venue.name)} <small>${esc(d.name)} · ${esc(v.venue.region)} · ${esc(v.venue.type)} · last ${days} days</small></h3>
    <div class="stats">${stat(v.views, 'page views')}${stat(v.clicks_total, 'link clicks')}${dm ? stat(dm.shown, 'shown in trip plans') : ''}${dm ? stat(dm.added, 'added to a trip', `${dm.adders} visitor-days`) : ''}${dm ? stat(dm.removed, 'removed from a trip') : ''}</div>
    ${bars(v.views_per_day, 'Page views per day')}${bars(v.clicks_per_day, 'Link clicks per day')}
    ${sheetHtml(v)}
    ${v.clicks && v.clicks.length ? `<h4>Link clicks counted before the full sheet</h4>${table(['Link', 'Clicks'], v.clicks.map((c) => [esc(LABELS[c.type] || c.type), `<b>${num(c.n)}</b>`]))}` : ''}
    <p class="empty">Counting started ${v.counting_since ? esc(v.counting_since) : 'today'}, so earlier days show zero. The list comes from the live page, so it only shows what this page has. Only clicks on this page are counted (not cards in lists).</p></div>`;
}

// The landing view: the most viewed businesses (and events) on each site, as one long ranked list.
function topCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const t = g.data;
  const link = (m, kind) => `<a href="/admin/dashboard/business?q=${encodeURIComponent(m.name)}&site=${esc(g.key)}&id=${m.id}&days=${days}${kind === 'event' ? '&kind=event' : ''}">${esc(m.name)}</a>`;
  const rows = (list, kind) => list.map((m, i) => [String(i + 1), link(m, kind), esc(m.region), esc(m.type), `<b>${num(m.views)}</b>`, num(m.clicks)]);
  return `<section class="col"><h2>${esc(g.name)} <small>most viewed, last ${days} days</small></h2><div class="card">
    <h4>Businesses <small>${num(t.businesses.length)} with views</small></h4>
    ${table(['#', 'Business', 'Town', 'Type', 'Page views', 'Clicks'], rows(t.businesses, 'venue'))}
    ${t.events && t.events.length ? `<h4>Events</h4>${table(['#', 'Event', 'Town', 'Type', 'Page views', 'Clicks'], rows(t.events, 'event'))}` : ''}
    <p class="empty">Counting started ${t.counting_since ? esc(t.counting_since) : 'today'}, so earlier days show zero. Click a name to see everything clicked on that page.</p></div></section>`;
}

function renderBusinessPage({ q = '', days = 30, results = [], detail = null, searched = false, tops = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/business?q=${encodeURIComponent(q)}&days=${n}${detail ? `&site=${esc(detail.key)}&id=${esc(detail.data && detail.data.venue ? detail.data.venue.id : '')}${detail.data && detail.data.venue && detail.data.venue.type === 'event' ? '&kind=event' : ''}` : ''}">${n}d</a>`).join('');
  const groups = results.map((g) => `<section class="col"><h2>${esc(g.name)}</h2>${g.error ? `<p class="warn">${esc(g.error)}</p>` : g.matches.length ? `<div class="card">${table(['Business', 'Town', 'Type'], g.matches.map((m) => [`<a href="/admin/dashboard/business?q=${encodeURIComponent(q)}&site=${esc(g.key)}&id=${m.id}&days=${days}${m.type === 'event' ? '&kind=event' : ''}">${esc(m.name)}</a>`, esc(m.region), esc(m.type)]))}</div>` : '<p class="empty">No match.</p>'}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Business activity – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>Business activity</h1><p class="sub">Below are the most viewed businesses. Search a business or an event to see how many times its page was viewed, everything people clicked on it, and how often it was picked for trips. Counts only; nothing about individual visitors.</p>
<form class="bar" method="get" action="/admin/dashboard/business"><input name="q" value="${esc(q)}" placeholder="Business name" aria-label="Business name" autofocus style="padding:8px 12px;border:1px solid var(--line);border-radius:99px;min-width:240px;background:var(--card);color:var(--ink)"><input type="hidden" name="days" value="${days}"><button class="tab on" type="submit">Search</button><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></form></header>
<main>${detail ? `<section class="col" style="grid-column:1/-1">${detailCard(detail, days)}<p><a href="/admin/dashboard/business?q=${encodeURIComponent(q)}&days=${days}">← Back to results</a></p></section>` : groups || (searched ? '<p class="empty" style="padding:0 16px">Type at least two letters.</p>' : tops.map((g) => topCard(g, days)).join(''))}</main>
</body></html>`;
}

module.exports = { renderBusinessPage };
