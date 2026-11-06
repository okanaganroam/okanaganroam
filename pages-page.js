'use strict';
// Owner dashboard: guide and page performance, and Roam Now detail, both sites side by side.
const { layout, askFor } = require('./dashboard-layout');
const { esc, num, bars, stat, table } = require('./dashboard-page');

const TYPES = { home: 'Home', tool: 'Tool', list: 'List', guide: 'Guide', category: 'Category', town: 'Town or topic' };
const FILTERS = {
  open: 'Open now', top: 'Top picks', drinks: 'Drinks', food: 'Food', coffee: 'Coffee', wine: 'Wineries', beach: 'Beaches', outdoor: 'Outdoors', golf: 'Golf', do: 'Things to do', indoor: 'Indoors',
  patio: 'Patio', dogs: 'Dogs OK', happy: 'Happy hour now', specials: 'Specials today', nights: 'Weekly nights', music: 'Live music', lake: 'Lake view', kids: 'Kid friendly',
  veg: 'Vegetarian', vegan: 'Vegan', gf: 'Gluten free', late: 'Open late', early: 'Open early', groups: 'Good for groups', sports: 'Sports on TV', nonalc: 'Alcohol-free drinks', free: 'Free to visit',
};
const pct = (n) => (n === null || n === undefined ? '–' : `${n}%`);
const link = (p) => `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;
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
  return layout({ active: 'pages', title: 'Guides and pages', ask: askFor('pages'), tells: 'Which guides, categories and town pages get opened, and which ones send people on to a business.', use: 'Pages opened a lot that send nobody on need better links or a clearer next step. Copy what the best pages do.', range: range('/admin/dashboard/pages', days), body: sites.map((g) => pagesCol(g, days)).join('') });
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
  return layout({ active: 'roam-now', title: 'Roam Now', ask: askFor('roam-now'), tells: 'What people do on the map: which filters they use, what they type, and which businesses they open or get directions to.', use: 'Searches that found nothing show what to add. Popular filters show what people care about most.', range: range('/admin/dashboard/roam-now', days), body: sites.map((g) => roamCol(g, days)).join('') });
}

function eventsCol(g, days) {
  if (!g.data) return errorCol(g);
  const d = g.data; const t = d.totals;
  const when = (e) => `${esc(e.start)}${e.upcoming ? '' : ' <small>over</small>'}`;
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(t.views, 'event page views')}${stat(t.tickets, 'tickets and info clicks')}${stat(t.calendar, 'added to a calendar')}${stat(t.directions, 'directions')}</div>
    <div class="stats" style="margin-top:10px">${stat(d.with_views, `events opened, of ${num(d.listed)} listed`)}${stat(d.upcoming, 'still to come')}${stat(t.trip, 'added to a trip')}${stat(t.favorite, 'favourited')}</div>
    <h4>People acted on these <small>tickets, calendar, directions, trip, favourite</small></h4>
    ${table(['Event', 'Date', 'Views', 'Actions'], d.most_action.map((e) => [link(e.path).replace(`>${esc(e.path)}<`, `>${esc(e.name)}<`), when(e), num(e.views), `<b>${num(e.actions)}</b>`]))}
    <h4>Coming in the next 30 days, nobody has opened <small>${num(d.unseen_soon_count)} in all, soonest first</small></h4>
    ${table(['Event', 'Date'], d.unseen_soon.map((e) => [link(e.path).replace(`>${esc(e.path)}<`, `>${esc(e.name)}<`), when(e)]))}
    <h4>All events opened</h4>
    ${table(['Event', 'Date', 'Views', 'Tickets', 'Calendar', 'Directions', 'Trip'], d.events.map((e) => [link(e.path).replace(`>${esc(e.path)}<`, `>${esc(e.name)}<`), when(e), `<b>${num(e.views)}</b>`, num(e.tickets), num(e.calendar), num(e.directions), num(e.trip)]))}
    <p class="empty">Counting started ${d.counting_since ? esc(d.counting_since) : 'today'}, so earlier days show zero. Repeating events show their first date. Plain daily totals.</p>
  </div></section>`;
}

function renderEventsPage({ days = 30, sites = [] }) {
  return layout({ active: 'events', title: 'Events', ask: askFor('events'), tells: 'Which What’s On events get opened, what people do on them, and which coming events nobody has found.', use: 'Events coming up that nobody has opened are good ones to share on social this week.', range: range('/admin/dashboard/events', days), body: sites.map((g) => eventsCol(g, days)).join('') });
}

function emailCol(g, days) {
  if (!g.data) return errorCol(g);
  const d = g.data; const t = d.totals;
  const clicks = `<h4>Visits from our tagged email links <small>counted on our own site, by campaign</small></h4>
    ${table(['Campaign', 'Visits'], (d.campaigns || []).map((c) => [esc(c.campaign), `<b>${num(c.visits)}</b>`]))}`;
  if (!d.connected) return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card"><p class="empty">${esc(d.error || 'Not connected.')}</p>${clicks}</div></section>`;
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    ${(d.warnings || []).map((w) => `<p><b>${esc(w)}</b></p>`).join('')}
    <div class="stats">${stat(t.sent, 'sent')}${stat(t.delivered, `delivered (${pct(t.delivered_rate)})`)}${stat(t.hard_bounces + t.soft_bounces, `bounced (${pct(t.bounce_rate)})`)}${stat(t.complaints, `spam complaints (${pct(t.complaint_rate)})`)}</div>
    ${bars(d.per_day, 'Emails sent per day')}
    <h4>The detail</h4>
    ${table(['What', 'Emails', 'Share'], [
    ['Opened, at least once <small>rough guide only</small>', num(t.openers), pct(t.open_rate)],
    ['Clicked a link', num(t.clickers), pct(t.click_rate)],
    ['Hard bounce <small>address does not work</small>', num(t.hard_bounces), ''],
    ['Soft bounce <small>temporary, such as a full mailbox</small>', num(t.soft_bounces), ''],
    ['Blocked by Brevo', num(t.blocked), ''],
    ['Invalid address', num(t.invalid), ''],
    ['Unsubscribed through Brevo', num(t.unsubscribed), ''],
  ])}
    ${clicks}
    <p class="empty">Covers everything sent through this Brevo account: site emails and mail sent from Gmail as info@. "Delivered" means the receiving server accepted it, which can still mean the spam folder. Open counts are unreliable: Apple Mail can load the image without anyone reading, and some apps block it. Nobody can see inbox or spam placement, deleted mail or ignored mail. Replies stay in Gmail and are not counted here.</p>
  </div></section>`;
}

function renderEmailPage({ days = 30, sites = [] }) {
  return layout({ active: 'email', title: 'Email results', ask: askFor('email'), tells: 'Whether the email we sent was accepted, bounced or complained about, and the visits our email links brought.', use: 'Watch the warnings at the top. Clicks and replies matter more than opens, which are only a rough guide.', range: range('/admin/dashboard/email', days), body: sites.map((g) => emailCol(g, days)).join('') });
}

const WORDS = [
  ['Visit', 'One person coming to the site once. The same person coming back tomorrow is a second visit.'],
  ['Page view', 'A page being opened. One visit can have many page views.'],
  ['Click to a business', 'Someone tapping call, website, book, directions or menu on a listing. This is the value we give businesses.'],
  ['Shown in Google (impression)', 'Our site appeared in someone’s Google results. They may not have clicked.'],
  ['Clicks from Google', 'Someone saw us in Google and came to the site.'],
  ['Position', 'Where we sit in Google’s results. 1 is the top; lower numbers are better.'],
  ['Not searching our name (non-brand)', 'People who found us by searching things like “best patios Kelowna”, not “Okanagan Roam”. These are brand new people.'],
  ['Funnel', 'A set of steps, like start a plan then finish a plan. It shows where people give up.'],
  ['Sent on', 'People who went from a guide or page to a business or event page.'],
  ['Campaign', 'A name for one batch of emails or posts, so we can tell which one brought people.'],
  ['Crawler', 'A computer program reading the site, such as Google’s. Not a person.'],
  ['Missing page (404)', 'Someone tried to open an address that doesn’t exist.'],
  ['Delivered', 'The other side accepted our email. It could still land in spam; nobody can see that.'],
  ['Bounce', 'An email came back. A hard bounce is a dead address. A soft bounce is temporary, like a full mailbox.'],
  ['Spam complaint', 'Someone pressed “this is spam”. Keep this very low.'],
  ['Opened', 'A rough guess that an email was read. Mail apps can get this wrong both ways.'],
  ['Claim', 'A business owner asking to take over their listing.'],
];
function renderHelpPage() {
  return layout({ active: 'help', title: 'What the words mean', ask: 'Short answers, and how to use this dashboard.', tells: 'What each word on the dashboard means in everyday language.', use: 'Come back here whenever a word doesn’t make sense.',
    body: `<div class="card"><h3>How to use this in five minutes a week</h3><ul class="list"><li><b>1. Open Home.</b> Are the four big numbers going up?</li><li><b>2. Read “Worth a look”.</b> Fix one thing from it.</li><li><b>3. Clear “Waiting on you”.</b> Approve what’s in the review inbox.</li><li><b>4. Check your goals.</b> Green means on track.</li></ul></div>
    <div class="card"><h3>The words</h3><dl class="glossary">${WORDS.map((w) => `<dt>${esc(w[0])}</dt><dd>${esc(w[1])}</dd>`).join('')}</dl></div>` });
}

module.exports = { renderPagesPage, renderRoamNowPage, renderEventsPage, renderEmailPage, renderHelpPage };
