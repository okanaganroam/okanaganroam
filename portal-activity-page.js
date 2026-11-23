'use strict';
// Owner dashboard: business portal activity (clicks on Business login, sign-ins, what is done inside the portal).
const { layout, askFor } = require('./dashboard-layout');
const { esc, num, bars, stat, table } = require('./dashboard-page');

const WHY_WORDS = { form_problem: 'a form field needed fixing', wrong_email_or_password: 'wrong email or password', not_from_our_site: 'sent from outside our site', link_not_valid: 'link not valid any more', already_sent: 'already sent', too_long: 'too long', wrong_type: 'wrong kind of request', too_many_tries: 'too many tries', server_error: 'our server had a problem' };
function whyText(why) {
  const [base, fields] = String(why).split(':');
  const words = WHY_WORDS[base] || base.replace(/_/g, ' ');
  return fields ? `${words} (${fields.split('+').map((f) => f.replace(/_/g, ' ')).join(', ')})` : words;
}
const whyList = (s) => (s.why && s.why.length ? `<small>${s.why.map((w) => `${esc(whyText(w.why))} ×${num(w.n)}`).join('; ')}</small>` : '');

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data;
  const by = Object.fromEntries(d.steps.map((s) => [s.key, s]));
  const clicks = ['portal_login_click_menu', 'portal_login_click_venue_page', 'portal_login_click_footer', 'portal_login_click_other'].reduce((a, k) => a + (by[k] ? by[k].n : 0), 0);
  const groups = [...new Set(d.steps.map((s) => s.group))];
  const sections = groups.map((grp) => `<h4>${esc(grp)}</h4>${table(['Step', 'Times', 'Asked to fix something'], d.steps.filter((s) => s.group === grp).map((s) => [esc(s.text), s.n ? `<b>${num(s.n)}</b>` : '0', [s.failed ? num(s.failed) : '', whyList(s)].filter(Boolean).join('<br>')]))}`).join('');
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(clicks, 'clicked Business login')}${stat(by.login_page_view ? by.login_page_view.n : 0, 'opened the login page')}${stat(by.login_success ? by.login_success.n : 0, 'signed in')}${stat(by.login_failed ? by.login_failed.n : 0, 'sign-in failed')}${stat(by.edit_save ? by.edit_save.n : 0, 'saved a listing')}</div>
    ${bars(d.login_clicks_per_day, 'Clicks on Business login per day')}${bars(d.logins_per_day, 'Sign-ins per day')}
    ${sections}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Totals only: no email, no business and nothing typed is kept, and your own visits (internal cookie) are left out. “Asked to fix something” counts tries the form sent back, nearly always a box left empty or too short, which the owner then fixed. A real fault shows in the server logs, not here.</p></div></section>`;
}

// Complete & Verified (2026-11-23): how many listings have the badge, and the ones a few items away with what's missing,
// so a friendly nudge can name exactly what to add. `base` is the site's address, for the listing links.
const SITE_BASE = { okanagan: 'https://okanaganroam.com', whistler: 'https://whistlerroam.com' };
function completenessCard(g) {
  const c = g.data && g.data.completeness;
  if (!c) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'This site doesn’t send the Complete & Verified numbers yet.')}</p></section>`;
  const base = SITE_BASE[g.key] || '';
  const link = (x) => `<a href="${esc(base + x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`;
  const reach = (x) => [x.has_login ? 'has a login' : '', x.has_email ? 'email on file' : ''].filter(Boolean).join(', ') || 'Instagram / DM only';
  const rows = c.near.map((x) => [link(x), `${num(x.pct)}%`, `<b>${num(x.left)}</b>`, `<small>${x.missing.map(esc).join('<br>')}</small>`, `<small>${esc(reach(x))}</small>`]);
  return `<section class="col"><h2>${esc(g.name)} <small>Complete &amp; Verified</small></h2><div class="card">
    <div class="stats">${stat(c.verified, 'Complete & Verified')}${stat(c.near.length, `${c.near_max} or fewer things left`)}${stat(c.managed, 'listings a business manages')}${c.paused ? stat(c.paused, 'paused (hours need a check)') : ''}</div>
    ${c.verified_list.length ? `<p><b>Verified:</b> ${c.verified_list.map(link).join(', ')}</p>` : ''}
    <h4>Almost there: send a friendly nudge</h4>
    ${rows.length ? table(['Business', 'Done', 'Left', 'What’s missing', 'How to reach them'], rows) : '<p class="empty">No managed listing is within a few items of 100% right now.</p>'}
    <p class="empty">The same checklist the business sees in its portal, from live data only (anything waiting for our review doesn’t count yet). Only listings a business manages can earn the badge, so only those are listed. Fewest items left first.</p></div></section>`;
}

function renderPortalPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/portal?days=${n}">${n}d</a>`).join('');
  return layout({ active: 'portal', title: 'Business portal', ask: askFor('portal'), tells: 'How often people try to log in, whether they get in, and what owners do once inside. Totals only.', use: 'If many people click login but few get in, the sign-in step needs fixing.', range, body: sites.map(completenessCard).join('') + sites.map((g) => siteCard(g, days)).join('') });
}

module.exports = { renderPortalPage };
