'use strict';
// Owner dashboard: shared drawing helpers, the Home page frame and the full "All the numbers" view. Private (noindex,
// signed-in only). The frame and styles are in dashboard-layout.js.

const { layout, askFor, esc, STYLE } = require('./dashboard-layout');
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

const SHOW = 10;
function table(headers, rows) {
  if (!rows.length) return '<p class="empty">Nothing here yet.</p>';
  const draw = (list) => `<div class="tw"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${list.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  // Long lists show the top ten; the rest open on request, so a page never turns into a wall.
  if (rows.length <= SHOW) return draw(rows);
  return `${draw(rows.slice(0, SHOW))}<details class="more"><summary>Show all ${num(rows.length)}</summary>${draw(rows.slice(SHOW))}</details>`;
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
      <div class="stats" style="margin-top:10px">${stat(e.roam_now.filters, 'filter changes')}${stat(e.roam_now.pins, 'start pins dropped')}${stat(e.roam_now.voice, 'voice searches')}${stat(e.roam_now.shares, 'shares')}</div></div>
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

// Home (the default) or, with view 'all', every number for each site.
function renderDashboardPage({ sites, days = 30, site = 'both', clarityId = '', generatedAt = new Date(), view = 'all', home = null }) {
  const updated = `Updated ${esc(generatedAt.toISOString().replace('T', ' ').slice(0, 16))} UTC.`;
  if (view === 'home' && home) return layout({ active: 'home', title: 'This week at a glance', ask: askFor('home'), top: home.top, body: home.body, clarityId, foot: updated });
  const shown = site === 'both' ? sites : sites.filter((s) => s.key === site);
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard?view=all&site=${esc(site)}&days=${n}">${n}d</a>`).join('');
  return layout({ active: 'all', title: 'All the numbers', ask: 'Everything in one long list, for when you want the detail.', tells: 'Every number for each site, including Google Analytics traffic and what is waiting on you.', use: 'You don’t need this page day to day. Home and the menu pages are simpler.', range, body: shown.map((s) => siteColumn(s, days)).join(''), clarityId, foot: `${updated} A “visitor-day” counts a person once per day.` });
}

module.exports = { renderDashboardPage, esc, num, bars, stat, table, STYLE };
