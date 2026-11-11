'use strict';
// Owner dashboard: business portal activity (clicks on Business login, sign-ins, what is done inside the portal).
const { layout, askFor } = require('./dashboard-layout');
const { esc, num, bars, stat, table } = require('./dashboard-page');

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data;
  const by = Object.fromEntries(d.steps.map((s) => [s.key, s]));
  const clicks = ['portal_login_click_menu', 'portal_login_click_venue_page', 'portal_login_click_footer', 'portal_login_click_other'].reduce((a, k) => a + (by[k] ? by[k].n : 0), 0);
  const groups = [...new Set(d.steps.map((s) => s.group))];
  const sections = groups.map((grp) => `<h4>${esc(grp)}</h4>${table(['Step', 'Times', 'Asked to fix something'], d.steps.filter((s) => s.group === grp).map((s) => [esc(s.text), s.n ? `<b>${num(s.n)}</b>` : '0', s.failed ? num(s.failed) : '']))}`).join('');
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(clicks, 'clicked Business login')}${stat(by.login_page_view ? by.login_page_view.n : 0, 'opened the login page')}${stat(by.login_success ? by.login_success.n : 0, 'signed in')}${stat(by.login_failed ? by.login_failed.n : 0, 'sign-in failed')}${stat(by.edit_save ? by.edit_save.n : 0, 'saved a listing')}</div>
    ${bars(d.login_clicks_per_day, 'Clicks on Business login per day')}${bars(d.logins_per_day, 'Sign-ins per day')}
    ${sections}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Totals only: no email, no business and nothing typed is kept, and your own visits (internal cookie) are left out. “Asked to fix something” counts tries the form sent back, nearly always a box left empty or too short, which the owner then fixed. A real fault shows in the server logs, not here.</p></div></section>`;
}

function renderPortalPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/portal?days=${n}">${n}d</a>`).join('');
  return layout({ active: 'portal', title: 'Business portal', ask: askFor('portal'), tells: 'How often people try to log in, whether they get in, and what owners do once inside. Totals only.', use: 'If many people click login but few get in, the sign-in step needs fixing.', range, body: sites.map((g) => siteCard(g, days)).join('') });
}

module.exports = { renderPortalPage };
