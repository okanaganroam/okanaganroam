'use strict';
// Owner dashboard: the Build My Trip funnel and the business claim / portal funnel, both sites side by side.
const { esc, num, bars, stat, table, STYLE } = require('./dashboard-page');

const pct = (n) => (n === null || n === undefined ? '' : `${n}%`);
const stepRows = (steps) => steps.map((s) => [esc(s.text), `<b>${num(s.n)}</b>`, pct(s.of_previous)]);
const rec = (n) => (n === null || n === undefined ? '–' : num(n));

function tripCard(d) {
  const t = d.trip; const p = t.people;
  return `<h3>Build My Trip</h3>
    <h4>Planner path <small>each step as a share of the one before</small></h4>
    ${table(['Step', 'Times', 'Of the step before'], stepRows(t.planner))}
    ${bars(t.starts_per_day, 'Plans started per day')}
    <h4>My Trip path <small>places can be added from any page</small></h4>
    ${table(['Step', 'Times', 'Of the step before'], stepRows(t.my_trip))}
    ${p ? `<h4>People, from the anonymous plan log <small>one count per person per day</small></h4>
    <div class="stats">${stat(p.shown, 'were shown a plan')}${stat(p.shown_then_added, 'of them added a place')}${stat(p.added, 'added a place')}${stat(p.removed, 'removed one')}</div>` : ''}
    <h4>Also</h4>
    ${table(['What', 'Times'], t.extra.map((e) => [esc(e.text), num(e.n)]))}`;
}

function claimsCard(d) {
  const c = d.claims; const r = c.records;
  const camp = c.campaigns.length
    ? table(['Email campaign', 'Visits from its links'], c.campaigns.map((x) => [esc(x.name), `<b>${num(x.n)}</b>`])) + table(['Campaign', 'Page they opened', 'Visits'], c.email_pages.map((x) => [esc(x.campaign), esc(x.page), num(x.n)]))
    : '<p class="empty">No visits from tagged email links yet. A link counts when it carries utm_medium=email and a utm_campaign name (the claim emails already do), so this fills as people click.</p>';
  return `<h3>Business claims and the portal</h3>
    <div class="stats">${stat(rec(r.claims_submitted), 'claims sent')}${stat(rec(r.claims_approved), 'claims approved')}${stat(rec(r.accounts_created), 'logins created')}${stat(rec(r.owners_signed_in), 'owners signed in')}${stat(rec(r.changes_sent), 'change requests sent')}</div>
    <p class="empty">Those five come straight from the records, so they are exact. ${r.claims_waiting ? `${num(r.claims_waiting)} claim(s) are waiting for review.` : ''}</p>
    ${bars(c.email_per_day, 'Visits from our emails per day')}
    ${c.claims_per_day ? bars(c.claims_per_day, 'Claims sent per day') : ''}
    <h4>Visits from our emails, by campaign</h4>${camp}
    <h4>What happens next <small>${num(c.login_clicks)} clicks on Business login or Claim this listing around the site</small></h4>
    ${table(['Step', 'Where', 'Times'], c.steps.map((s) => [esc(s.text), esc(s.group), `<b>${num(s.n)}</b>`]))}`;
}

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data;
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">${tripCard(d)}${claimsCard(d)}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Steps are counts of actions, not people, because the site keeps no visitor identity; a person can repeat a step. Your own visits are left out.</p></div></section>`;
}

function renderFunnelsPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/funnels?days=${n}">${n}d</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Funnels – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>Funnels</h1><p class="sub">Where people drop off in Build My Trip, and how business owners move from our emails to claiming and editing their listing.</p>
<div class="bar"><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${sites.map((g) => siteCard(g, days)).join('')}</main>
</body></html>`;
}

module.exports = { renderFunnelsPage };
