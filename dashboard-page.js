'use strict';
// Owner dashboard page (Phase 1). Server-rendered, no client script, private (noindex, signed-in only).
// renderDashboardPage({ sites: [{ key, name, data, error }], days, site, clarityId })

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('en-CA'));

function bars(points, label) {
  if (!points || !points.length) return '';
  const max = Math.max(1, ...points.map((p) => p.n));
  const w = 6, gap = 2, h = 44;
  const rects = points.map((p, i) => {
    const bh = Math.max(p.n ? 2 : 0, Math.round((p.n / max) * h));
    return `<rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" rx="1"><title>${esc(p.day)}: ${p.n}</title></rect>`;
  }).join('');
  const total = points.reduce((a, p) => a + p.n, 0);
  return `<figure class="spark"><svg viewBox="0 0 ${points.length * (w + gap)} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}: ${total} over ${points.length} days">${rects}</svg><figcaption>${esc(label)} <b>${num(total)}</b></figcaption></figure>`;
}

function stat(value, label, note) {
  return `<div class="stat"><div class="v">${num(value)}</div><div class="l">${esc(label)}</div>${note ? `<div class="n">${esc(note)}</div>` : ''}</div>`;
}

function table(headers, rows) {
  if (!rows.length) return '<p class="empty">Nothing yet.</p>';
  return `<div class="tw"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function siteColumn(s, days) {
  if (s.error || !s.data) {
    return `<section class="col"><h2>${esc(s.name)}</h2><p class="warn">${esc(s.error || 'No data.')}</p></section>`;
  }
  const d = s.data;
  const parts = [`<section class="col"><h2>${esc(s.name)} <small>last ${days} days</small></h2>`];


  if (d.traffic) {
    const g = d.traffic;
    if (g.error) parts.push(`<div class="card"><h3>Traffic (Google Analytics)</h3><p class="warn">${esc(g.error)}</p></div>`);
    else {
      const mins = Math.floor(g.avg_session_seconds / 60), secs = g.avg_session_seconds % 60;
      parts.push(`<div class="card"><h3>Traffic (Google Analytics)</h3>
      <div class="stats">${stat(g.users, 'visitors')}${stat(g.sessions, 'visits')}${stat(g.views, 'page views')}${stat(g.new_users, 'new visitors')}${stat(g.engagement_rate, 'engaged visits %')}<div class="stat"><div class="v">${mins}:${String(secs).padStart(2, '0')}</div><div class="l">average visit</div><div class="n">minutes:seconds</div></div></div>
      ${bars(g.users_per_day, 'Visitors per day')}
      <h4>Where visits come from</h4>${table(['Channel', 'Visits'], g.channels.map((c) => [esc(c.name), num(c.sessions)]))}
      <h4>Devices</h4>${table(['Device', 'Visits'], g.devices.map((c) => [esc(c.name), num(c.sessions)]))}
      <h4>Top pages</h4>${table(['Page', 'Views'], g.top_pages.map((c) => [esc(c.path), num(c.views)]))}</div>`);
    }
  } else {
    parts.push('<div class="card"><h3>Traffic (Google Analytics)</h3><p class="empty">Not connected yet on this site.</p></div>');
  }

  if (d.demand) {
    const m = d.demand;
    parts.push(`<div class="card"><h3>Build My Trip demand</h3>
      <div class="stats">${stat(m.visitor_days, 'visitor-days', 'different visitors per day, added up')}${stat(m.shown, 'businesses shown')}${stat(m.added, 'added to a trip')}${stat(m.ready_to_contact, 'ready to contact', `added by ${m.threshold}+ visitors`)}</div>
      ${bars(m.visitors_per_day, 'Visitors per day')}${bars(m.adds_per_day, 'Adds per day')}
      <h4>Most wanted businesses</h4>
      ${table(['Business', 'Town', 'Shown', 'Added', 'Removed'], m.top_venues.map((v) => [esc(v.name), esc(v.region), num(v.shown), `<b>${num(v.added)}</b>`, num(v.removed)]))}</div>`);
  } else {
    parts.push('<div class="card"><h3>Build My Trip demand</h3><p class="empty">The demand log isn’t on this site yet.</p></div>');
  }

  if (d.events) {
    const e = d.events;
    parts.push(`<div class="card"><h3>Roam Now (the map)</h3>
      <div class="stats">${stat(e.roam_now.opens, 'opens')}${stat(e.roam_now.near_me, 'Near me taps')}${stat(e.roam_now.searches, 'searches', `${num(e.roam_now.empty_searches)} found nothing`)}${stat(e.roam_now.directions, 'directions')}</div>
      ${bars(e.roam_now_per_day, 'Opens per day')}
      <div class="stats" style="margin-top:10px">${stat(e.roam_now.filters, 'filter changes')}${stat(e.roam_now.pins, 'pins tapped')}${stat(e.roam_now.voice, 'voice searches')}${stat(e.roam_now.shares, 'shares')}</div></div>
      <div class="card"><h3>Build My Trip activity</h3>
      <div class="stats">${stat(e.trip.page_views, 'page views')}${stat(e.trip.plans_started, 'plans started')}${stat(e.trip.plans_completed, 'plans finished')}${stat(e.trip.shared, 'shared')}</div>
      ${bars(e.trip_per_day, 'Page views per day')}
      <div class="stats" style="margin-top:10px">${stat(e.trip.adds, 'adds to My Trip')}${stat(e.trip.removes, 'removes')}${stat(e.trip.tray_opens, 'My Trip opens')}${stat(e.trip.build_my_trip_clicks, 'Build My Trip clicks')}</div></div>
      <div class="card"><h3>Key pages</h3>
      <div class="stats">${stat(e.pages.home, 'home')}${stat(e.pages.browse, 'browse')}${stat(e.pages.whats_on, 'What’s On')}${stat(e.pages.hidden_gems, 'Hidden Gems')}</div>
      <p class="empty">Counted on our own server from the first day this was switched on; full traffic comes from Google Analytics.</p></div>`);
  }

  if (d.plans) {
    const p = d.plans;
    parts.push(`<div class="card"><h3>Trip planner requests</h3>
      <div class="stats">${stat(p.total, 'requests')}${stat(p.no_stops, 'with no stops found', 'requests the planner couldn’t fill')}</div>
      ${bars(p.per_day, 'Requests per day')}
      <h4>Latest requests</h4>
      ${table(['When (UTC)', 'Request', 'Stops'], p.recent.map((r) => [esc(String(r.created_at).slice(5, 16)), esc(r.text), num(r.stops)]))}</div>`);
  }

  if (d.inbox) {
    const i = d.inbox;
    parts.push(`<div class="card"><h3>Waiting on you</h3>
      <div class="stats">${stat(i.venue_submissions_pending, 'venue submissions')}${stat(i.event_submissions_pending, 'event submissions')}${stat(i.claims_pending, 'claims')}${stat(i.visitor_contributions_pending, 'visitor tips/photos')}</div>
      <h4>Owners and activity</h4>
      <div class="stats">${stat(i.claims_approved, 'claims approved')}${stat(i.owner_accounts, 'owner accounts')}${stat(i.owners_active_in_window, 'owners active')}${stat(i.menu_reads_in_window, 'menu scans')}</div></div>`);
  }

  if (d.listings) parts.push(`<div class="card"><h3>Listings</h3><div class="stats">${stat(d.listings.venues, 'businesses')}${stat(d.listings.events, 'events')}</div></div>`);
  parts.push('</section>');
  return parts.join('');
}

const STYLE = `<style>
:root{--bg:#f6f4ee;--card:#fff;--ink:#1f2a24;--mute:#66706a;--line:#e3dfd3;--accent:#1f5f4a;--bar:#2f7d63;--warn:#9a3b12}
@media (prefers-color-scheme:dark){:root{--bg:#151a17;--card:#1e2521;--ink:#e8ede9;--mute:#9aa59d;--line:#2d3731;--accent:#6fc2a0;--bar:#5db38f;--warn:#f0a070}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:18px 16px 6px;max-width:1280px;margin:0 auto}h1{margin:0 0 4px;font-size:1.35rem}.sub{color:var(--mute);margin:0 0 10px}
.bar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:8px 0}.tabs{display:flex;gap:6px}
.tab{padding:5px 12px;border:1px solid var(--line);border-radius:99px;color:var(--ink);text-decoration:none;background:var(--card)}.tab.on{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.links{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px 18px}.links a{color:var(--accent)}
main{max-width:1280px;margin:0 auto;padding:0 16px 40px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))}
.col h2{font-size:1.15rem;margin:12px 0 8px}.col h2 small{font-weight:400;color:var(--mute);font-size:.8rem;margin-left:6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}.card h3{margin:0 0 8px;font-size:1rem}.card h4{margin:14px 0 6px;font-size:.85rem;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}.stat .v{font-size:1.6rem;font-weight:700;color:var(--accent)}.stat .l{font-size:.8rem}.stat .n{font-size:.72rem;color:var(--mute)}
.spark{margin:10px 0 0}.spark svg{width:100%;height:44px;fill:var(--bar)}.spark figcaption{font-size:.78rem;color:var(--mute)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line)}th{color:var(--mute);font-weight:600}
.empty{color:var(--mute);margin:4px 0}.warn{color:var(--warn)}footer{max-width:1280px;margin:0 auto;padding:0 16px 24px;color:var(--mute);font-size:.8rem}
</style>`;

function renderDashboardPage({ sites, days = 30, site = 'both', clarityId = '', generatedAt = new Date() }) {
  const shown = site === 'both' ? sites : sites.filter((s) => s.key === site);
  const tab = (key, label) => `<a class="tab${site === key ? ' on' : ''}" href="/admin/dashboard?site=${key}&days=${days}">${esc(label)}</a>`;
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard?site=${esc(site)}&days=${n}">${n}d</a>`).join('');
  const links = [
    clarityId ? `<a href="https://clarity.microsoft.com/projects/view/${esc(clarityId)}/dashboard" target="_blank" rel="noopener">Screen recordings and heatmaps (Clarity)</a>` : '',
    '<a href="https://analytics.google.com/" target="_blank" rel="noopener">Traffic and events (Google Analytics)</a>',
    '<a href="/admin/dashboard/business"><b>Search a business</b> (views and clicks)</a>',
    '<a href="/admin/dashboard/portal"><b>Business portal</b> (logins and what owners do)</a>',
    '<a href="/admin/dashboard/searches"><b>What people search for</b> (words typed into our search and Build My Trip)</a>',
    '<a href="/admin/dashboard/funnels"><b>Funnels</b> (Build My Trip drop-off, claim emails to logins)</a>',
    '<a href="/admin/dashboard/errors"><b>Broken pages</b> (missing addresses and the links to them)</a>',
    '<a href="/admin/dashboard/outbound"><b>Outbound clicks</b> (website, book, call, directions per business)</a>',
    '<a href="/admin/dashboard/search"><b>How people find us</b> (AI assistants, search engines, Google words)</a>',
    '<a href="/admin/review">Review inbox</a>',
  ].filter(Boolean).map((l) => `<li>${l}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Dashboard – Okanagan Roam and Whistler Roam</title>
${STYLE}</head><body>
<header><h1>Dashboard</h1><p class="sub">Both sites in one place. Numbers from each site’s own records; traffic and recordings open in their own tools.</p>
<div class="bar"><div class="tabs">${tab('both', 'Both')}${tab('okanagan', 'Okanagan Roam')}${tab('whistler', 'Whistler Roam')}</div><div class="tabs">${range}</div></div>
<ul class="links">${links}</ul></header>
<main>${shown.map((s) => siteColumn(s, days)).join('')}</main>
<footer>Updated ${esc(generatedAt.toISOString().replace('T', ' ').slice(0, 16))} UTC. Visitor numbers are anonymous and change daily, so “visitor-days” counts a person once per day.</footer>
</body></html>`;
}

module.exports = { renderDashboardPage, esc, num, bars, stat, table, STYLE };
