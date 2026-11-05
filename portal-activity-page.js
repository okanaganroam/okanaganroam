'use strict';
// Owner dashboard: business portal activity (clicks on Business login, sign-ins, what is done inside the portal).
const { esc, num, bars, stat, table, STYLE } = require('./dashboard-page');

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data;
  const by = Object.fromEntries(d.steps.map((s) => [s.key, s]));
  const clicks = ['portal_login_click_menu', 'portal_login_click_venue_page', 'portal_login_click_footer', 'portal_login_click_other'].reduce((a, k) => a + (by[k] ? by[k].n : 0), 0);
  const groups = [...new Set(d.steps.map((s) => s.group))];
  const sections = groups.map((grp) => `<h4>${esc(grp)}</h4>${table(['Step', 'Times', 'Failed'], d.steps.filter((s) => s.group === grp).map((s) => [esc(s.text), s.n ? `<b>${num(s.n)}</b>` : '0', s.failed ? `<span class="warn">${num(s.failed)}</span>` : '']))}`).join('');
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(clicks, 'clicked Business login')}${stat(by.login_page_view ? by.login_page_view.n : 0, 'opened the login page')}${stat(by.login_success ? by.login_success.n : 0, 'signed in')}${stat(by.login_failed ? by.login_failed.n : 0, 'sign-in failed')}${stat(by.edit_save ? by.edit_save.n : 0, 'saved a listing')}</div>
    ${bars(d.login_clicks_per_day, 'Clicks on Business login per day')}${bars(d.logins_per_day, 'Sign-ins per day')}
    ${sections}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Totals only: no email, no business and nothing typed is kept, and your own visits (internal cookie) are left out. “Failed” counts steps the portal answered with an error.</p></div></section>`;
}

function renderPortalPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/portal?days=${n}">${n}d</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Business portal activity – Okanagan Roam and Whistler Roam</title>
${STYLE}
</head><body>
<header><h1>Business portal</h1><p class="sub">How often people click Business login, whether they get in, and what they do once they are inside. Totals only; nothing about individual people or businesses.</p>
<div class="bar"><div class="tabs">${range}</div><a class="tab" href="/admin/dashboard">Back to dashboard</a></div></header>
<main>${sites.map((g) => siteCard(g, days)).join('')}</main>
</body></html>`;
}

module.exports = { renderPortalPage };
