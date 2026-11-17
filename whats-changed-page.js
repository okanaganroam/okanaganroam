'use strict';
// The dashboard's Home page, and the Monday email (HTML + plain text).
const { esc, num } = require('./dashboard-page');
const { NAV } = require('./dashboard-layout');
const { todayLesson, milestonesHtml } = require('./dashboard-learn');

const arrow = (m) => (m.cur === m.prev ? '–' : m.cur > m.prev ? '▲' : '▼');
const label = (r) => `${r.start} to ${r.end}`;
const ABS = 'https://okanaganroam.com';

// One site's block as a list of { h: heading, rows: [[text, value]] } sections, shared by the card and the emails.
function sections(d) {
  const L = d.lists || {}; const out = [];
  out.push({ h: 'Numbers, this week and the week before', rows: d.metrics.filter((m) => m.cur || m.prev).map((m) => [m.label, `${num(m.cur)} ${arrow(m)} was ${num(m.prev)}`]) });
  if (L.top_businesses && L.top_businesses.length) out.push({ h: 'Most viewed businesses', rows: L.top_businesses.map((b) => [`${b.name} (${b.region})`, `${num(b.views)} views, was ${num(b.prev)}`]) });
  if (L.rising_businesses && L.rising_businesses.length) out.push({ h: 'Rising fastest', rows: L.rising_businesses.map((b) => [`${b.name} (${b.region})`, `+${num(b.views - b.prev)} views`]) });
  if (L.top_outbound && L.top_outbound.length) out.push({ h: 'Most clicks out to the business', rows: L.top_outbound.map((b) => [`${b.name} (${b.region})`, `${num(b.clicks)} clicks`]) });
  if (L.top_sources && L.top_sources.length) out.push({ h: 'Where visits came from', rows: L.top_sources.map((s) => [s.source, `${num(s.n)}`]) });
  if (L.top_searches && L.top_searches.length) out.push({ h: 'Most searched on the site', rows: L.top_searches.map((s) => [s.term, num(s.n)]) });
  if (L.new_searches && L.new_searches.length) out.push({ h: 'New search words this week', rows: L.new_searches.map((s) => [s.term, num(s.n)]) });
  if (L.no_results && L.no_results.length) out.push({ h: 'Searches that found nothing', rows: L.no_results.map((s) => [s.term, num(s.n)]) });
  if (L.broken_pages && L.broken_pages.length) out.push({ h: 'Missing pages visitors hit', rows: L.broken_pages.map((p) => [p.path + (p.is_new ? ' (new)' : ''), num(p.n)]) });
  const g = d.google;
  if (g) {
    const rows = [['Google clicks', `${num(g.current.clicks)} was ${num(g.previous.clicks)}`], ['Times shown in Google', `${num(g.current.impressions)} was ${num(g.previous.impressions)}`]];
    for (const r of g.rising) rows.push([`Rising: ${r.key}`, `+${num(r.d_impressions)} shown`]);
    for (const r of g.falling) rows.push([`Falling: ${r.key}`, `${num(r.d_impressions)} shown`]);
    out.push({ h: `Google (${label(g.current)})`, rows });
  }
  return out.filter((s) => s.rows.length);
}

// Tracking health lines for one site: the problems, or a short all-clear. Counters that are still learning say so.
function healthLines(d) {
  const h = d.health; if (!h) return [];
  const lines = [...h.problems];
  const sc = d.connections && d.connections.google_search;
  if (sc && sc !== 'ok' && sc !== 'not connected') lines.push(`Search Console: ${sc}`);
  if (!lines.length) lines.push(h.counters.some((c) => c.status === 'learning') ? 'Tracking looks fine so far; some counters are still collecting enough history to judge.' : 'Tracking looks healthy: every counter is reporting normally.');
  return lines;
}
const healthBad = (d) => !!(d.health && d.health.problems.length) || !!(d.connections && d.connections.google_search && !['ok', 'not connected'].includes(d.connections.google_search));

function goalsLines(g) {
  if (!g) return [];
  return [`Goals for ${g.deadline} (${g.days_left} days left)`, ...g.goals.map((x) => `  ${x.label}: ${x.current === null ? 'not measured' : `${x.current} of ${x.target} ${x.unit} (started at ${x.baseline}), ${x.status}`}`), ''];
}

// Lines for the top of Home. Written by hand so the message is ours; one shows per day.
const QUOTES = [
  'Every listing you add is someone’s best day out. Keep building.',
  'The best directory in the world gets built one true, useful page at a time.',
  'Great places deserve to be found. You’re the one making sure they are.',
  'Small businesses can’t buy what you’re giving them: being found. Keep going.',
  'Nobody hands you the best directory ever. You build it, one good day after another.',
  'Slow is fine. Stopping is the only thing that loses.',
  'Today’s small fix is tomorrow’s reason someone trusts you.',
  'Behind every number on this page is a real person who found somewhere great.',
  'The big guides stopped caring about the little places. You didn’t. That’s your edge.',
  'Keep showing up. Most people quit right before it starts to work.',
  'Be the guide you wish you’d had the first time you came here.',
  'Do the work nobody will see. It’s what they’ll feel when they use it.',
  'One more listing. One more fix. One more reason to trust you.',
  'You’re building something this valley and these mountains have never had.',
];
const dayNumber = (now) => Math.floor(now.getTime() / 86400000);
const quoteFor = (now) => QUOTES[dayNumber(now) % QUOTES.length];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (s) => `${MONTHS[Number(String(s).slice(5, 7)) - 1]} ${Number(String(s).slice(8, 10))}`;
const shortRange = (r) => `${shortDay(r.start)} to ${shortDay(r.end)}`;
const metric = (d, key) => (d.metrics || []).find((m) => m.key === key) || null;
const metricSum = (d, keys) => { const list = keys.map((k) => metric(d, k)).filter(Boolean); return list.length ? { cur: list.reduce((a, m) => a + m.cur, 0), prev: list.reduce((a, m) => a + m.prev, 0), recent: list.reduce((a, m) => a + (m.recent || 0), 0) } : null; };
// With no earlier week to compare, the fairest number is the last 7 days so far, so a new counter never shows a false zero.
const shownValue = (m) => (m.prev ? m.cur : Math.max(m.cur, m.recent || 0));

// The change against last week as a small label. With nothing last week there is nothing fair to compare.
function chip(m) {
  if (!m.prev) return '<span class="chip">Last 7 days so far</span>';
  if (m.cur === m.prev) return '<span class="chip">Same as last week</span>';
  const up = m.cur > m.prev; const pct = Math.round((Math.abs(m.cur - m.prev) / m.prev) * 100);
  return `<span class="chip ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${pct}% vs last week</span>`;
}
const TILES = [
  { t: 'Business pages viewed', keys: ['views'], why: 'Times people opened a listing.', href: '/admin/dashboard/business' },
  { t: 'Clicks to businesses', keys: ['outbound'], why: 'People calling, booking or heading to a business. Your real value.', href: '/admin/dashboard/outbound' },
  { t: 'Trips planned', keys: ['trip_plan_complete'], why: 'Finished plans in Build My Trip.', href: '/admin/dashboard/funnels' },
  { t: 'From Google and AI', keys: ['visits_search', 'visits_ai'], why: 'Visits from search engines and AI assistants.', href: '/admin/dashboard/search' },
];
const tileHtml = (d) => `<div class="tiles">${TILES.map((x) => { const m = metricSum(d, x.keys) || { cur: 0, prev: 0, recent: 0 }; return `<a class="tile" href="${x.href}"><p class="t">${esc(x.t)}</p><p class="big">${num(shownValue(m))}</p>${chip(m)}<p class="why">${esc(x.why)}</p></a>`; }).join('')}</div>`;

// Moves worth a mention, sorted into good news and things to look at. For these two a rise is bad news.
const RISE_IS_BAD = new Set(['broken', 'searches_none']);
function moves(d) {
  const good = []; const watch = [];
  for (const m of d.metrics || []) {
    if (!m.prev || Math.max(m.cur, m.prev) < 5 || Math.abs(m.cur - m.prev) / m.prev < 0.25) continue;
    const up = m.cur > m.prev; const line = `${m.label}: ${up ? 'up' : 'down'} from ${num(m.prev)} to ${num(m.cur)}`;
    (up !== RISE_IS_BAD.has(m.key) ? good : watch).push(line);
  }
  const L = d.lists || {};
  if (L.no_results && L.no_results[0]) watch.push(`People searched “${L.no_results[0].term}” and found nothing (${num(L.no_results[0].n)} times)`);
  if (L.broken_pages && L.broken_pages[0]) watch.push(`Visitors hit a missing page: ${L.broken_pages[0].path} (${num(L.broken_pages[0].n)} times)`);
  if (L.rising_businesses && L.rising_businesses[0]) good.push(`${L.rising_businesses[0].name} is getting more attention: +${num(L.rising_businesses[0].views - L.rising_businesses[0].prev)} views`);
  return { good: good.slice(0, 5), watch: watch.slice(0, 5) };
}
const listHtml = (rows, none) => (rows.length ? `<ul class="list">${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : `<p class="empty">${esc(none)}</p>`);

function todoHtml(inbox) {
  if (!inbox) return '';
  const rows = [['New businesses to review', inbox.venue_submissions_pending], ['Events to review', inbox.event_submissions_pending], ['Listing claims to approve', inbox.claims_pending], ['Storefront spots to check', inbox.arrival_pending], ['Visitor photos and tips', inbox.visitor_contributions_pending]].filter((r) => r[1]);
  return `<div class="card"><h3>Waiting on you</h3>${rows.length ? `<ul class="list">${rows.map((r) => `<li><a class="todo" href="/admin/review"><span>${esc(r[0])}</span><b>${num(r[1])}</b></a></li>`).join('')}</ul>` : '<p class="empty">All clear. Nothing needs you right now.</p>'}</div>`;
}

// One clear job for the week, taken from this site's real numbers.
function mission(d, inbox) {
  const L = d.lists || {}; const waiting = inbox ? (inbox.venue_submissions_pending || 0) + (inbox.event_submissions_pending || 0) + (inbox.claims_pending || 0) + (inbox.arrival_pending || 0) + (inbox.visitor_contributions_pending || 0) : 0;
  if (L.broken_pages && L.broken_pages[0]) return { d: `Fix a dead end: ${L.broken_pages[0].path}`, href: '/admin/dashboard/errors', go: 'See broken pages' };
  if (L.no_results && L.no_results[0]) return { d: `People want “${L.no_results[0].term}”. Can you add it?`, href: '/admin/dashboard/searches', go: 'See searches' };
  if (waiting) return { d: `${num(waiting)} ${waiting === 1 ? 'item needs' : 'items need'} your approval`, href: '/admin/review', go: 'Open review inbox' };
  return { d: 'Find a guide that gets opened but sends nobody on, and add a link to a business', href: '/admin/dashboard/pages', go: 'See guides' };
}
const missionHtml = (x) => `<div class="mission"><div><p class="m-t">Your mission this week</p><p class="m-d">${esc(x.d)}</p></div><a href="${x.href}">${esc(x.go)} →</a></div>`;

function siteHome(s, inbox) {
  if (s.error || !s.data) return `<section class="col"><h2>${esc(s.name)}</h2><div class="card"><p class="warn">${esc(s.error || 'No data yet.')}</p></div></section>`;
  const d = s.data; const bad = healthBad(d); const m = moves(d);
  return `<section class="col"><h2>${esc(s.name)} <small>${esc(shortRange(d.range.cur))}</small></h2>
    <p class="status${bad ? ' bad' : ''}"><span class="dot"></span>${esc(bad ? healthLines(d)[0] : 'Tracking is working normally')}</p>
    ${tileHtml(d)}
    ${missionHtml(mission(d, inbox))}
    <div class="two"><div class="card"><h3>Good news</h3>${listHtml(m.good, 'Nothing big moved up yet. That’s normal while we collect the first few weeks.')}</div>
    <div class="card"><h3>Worth a look</h3>${listHtml(m.watch, 'Nothing needs your attention.')}</div></div>
    ${todoHtml(inbox)}
    <details class="fold card"><summary>See everything that changed this week</summary>${sections(d).map((x) => `<h4>${esc(x.h)}</h4><div class="tw"><table>${x.rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table></div>`).join('')}</details>
  </section>`;
}

// Goal names in everyday words. Anything not listed keeps its own label.
const GOAL_WORDS = {
  nonbrand_impressions: ['Found on Google without searching our name', 'Times a day we show up for people who didn’t search “Okanagan Roam”.'],
  chatgpt_sessions: ['Visits from ChatGPT', 'People who clicked through to us from ChatGPT.'],
  linking_sites: ['Other websites linking to us', 'Each one tells Google we can be trusted.'],
  venues_linking: ['Local businesses linking to us', 'Listings that link back from their own website.'],
  ai_citations: ['Mentioned in AI answers', 'Out of 30 test questions asked to AI assistants.'],
};
const GOAL_CHIP = { 'on track': 'up', reached: 'up', behind: 'down', 'below the starting point': 'down' };
function goalsCard(g) {
  if (!g) return '';
  const row = (x) => {
    const w = GOAL_WORDS[x.key] || [x.label, ''];
    const low = x.status === 'behind' || x.status === 'below the starting point';
    return `<div class="goal"><div class="goal-top"><span class="goal-t">${esc(w[0])}</span><span class="goal-n">${x.current === null ? 'Not measured yet' : `<b>${num(x.current)}</b> of ${num(x.target)}`}</span></div>
      ${x.current === null ? '' : `<div class="track"><div class="fill${low ? ' behind' : ''}" style="width:${Math.max(0, Math.min(100, x.progress || 0))}%"></div><div class="mark" style="left:${Math.max(0, Math.min(100, x.expected || 0))}%" title="Where we should be by now"></div></div>`}
      <span class="chip ${GOAL_CHIP[x.status] || ''}">${esc(x.status)}</span> <span class="empty">${esc(w[1])}</span></div>`;
  };
  return `<h2 class="sec">Your goals <small>${num(g.days_left)} days left, to ${esc(shortDay(g.deadline))}. The black line shows where we should be by now.</small></h2><div class="card">${g.goals.map(row).join('')}</div>`;
}

function goHtml() {
  const items = NAV.flatMap((n) => n.items).filter((i) => i.key !== 'home');
  return `<h2 class="sec">Where do you want to go?</h2><div class="go">${items.map((i) => `<a href="${i.href}"><b>${esc(i.ask)}</b><span>${esc(i.label)}</span></a>`).join('')}</div>`;
}

// Home: { top, body }. weekly = this week's summary per site; inboxes = { siteKey: inbox counts }.
function homeHtml(weekly, { notice = '', goals = null, inboxes = {}, now = new Date() } = {}) {
  const clicks = weekly.reduce((a, s) => { const m = s.data && metric(s.data, 'outbound'); return a + (m ? shownValue(m) : 0); }, 0);
  const sum = (keys) => weekly.reduce((a, s) => { const m = s.data && metricSum(s.data, keys); return a + (m ? shownValue(m) : 0); }, 0);
  const numbers = { clicks, views: sum(['views']), ai: sum(['visits_ai']), trips: sum(['trip_plan_complete']) };
  const top = `<section class="hero"><svg class="peaks" viewBox="0 0 1200 96" preserveAspectRatio="none" aria-hidden="true"><path fill="rgba(255,255,255,.08)" d="M0 96V62l130-38 120 34 150-52 170 56 130-36 150 40 140-46 210 54v22z"/><path fill="rgba(8,24,32,.32)" d="M0 96V78l170-30 140 30 190-34 150 36 170-26 170 28 210-24v38z"/></svg><p class="hi" id="hi">Welcome back, Dayton</p><p class="quote">${esc(quoteFor(now))}</p>${clicks ? `<p class="impact">In the last 7 days, visitors clicked through to local businesses ${num(clicks)} times because of what you built.</p>` : ''}</section>${notice ? `<p class="status"><span class="dot"></span>${esc(notice)}</p>` : ''}`;
  const body = `${weekly.map((s) => siteHome(s, inboxes[s.key])).join('')}${todayLesson(now, numbers)}${milestonesHtml(numbers)}${goalsCard(goals)}${goHtml()}
    <form method="post" action="/admin/dashboard/digest-send" class="foot"><button type="submit">Email me this summary now</button> It also arrives by itself every Monday morning.</form>`;
  return { top, body };
}

function emailText(sites, { goals = null } = {}) {
  const lines = ['Okanagan Roam and Whistler Roam: what changed this week', ''];
  for (const s of sites) {
    lines.push(s.name.toUpperCase());
    if (s.error || !s.data) { lines.push(`  (${s.error || 'no data'})`, ''); continue; }
    const d = s.data;
    lines.push(`  ${label(d.range.cur)}, against ${label(d.range.prev)}`, '');
    for (const h of healthLines(d)) lines.push(`  ${healthBad(d) ? '!! ' : ''}${h}`);
    lines.push('');
    lines.push(...(d.headlines.length ? d.headlines.map((h) => `  * ${h}`) : ['  A quiet week: nothing moved much.']), '');
    for (const x of sections(d)) { lines.push(`  ${x.h}`); for (const r of x.rows) lines.push(`    ${r[0]}: ${r[1]}`); lines.push(''); }
  }
  lines.push(...goalsLines(goals));
  lines.push(`Full dashboard: ${ABS}/admin/dashboard`);
  return lines.join('\n');
}

function emailHtml(sites, { goals = null } = {}) {
  const body = sites.map((s) => {
    if (s.error || !s.data) return `<h2 style="margin:24px 0 4px">${esc(s.name)}</h2><p style="color:#b42318">${esc(s.error || 'No data.')}</p>`;
    const d = s.data;
    return `<h2 style="margin:24px 0 2px">${esc(s.name)}</h2><p style="margin:0 0 8px;color:#667">${esc(label(d.range.cur))}, against ${esc(label(d.range.prev))}</p>
      <p style="color:${healthBad(d) ? '#b42318' : '#667'}">${healthLines(d).map(esc).join('<br>')}</p>
      ${d.headlines.length ? `<ul style="padding-left:18px">${d.headlines.map((h) => `<li style="margin:3px 0"><b>${esc(h)}</b></li>`).join('')}</ul>` : '<p>A quiet week: nothing moved much.</p>'}
      ${sections(d).map((x) => `<h3 style="margin:14px 0 4px;font-size:14px">${esc(x.h)}</h3><table style="border-collapse:collapse;width:100%">${x.rows.map((r) => `<tr><td style="padding:2px 8px 2px 0;border-bottom:1px solid #eee">${esc(r[0])}</td><td style="padding:2px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${esc(r[1])}</td></tr>`).join('')}</table>`).join('')}`;
  }).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1c1c1c;font-size:14px;line-height:1.45"><h1 style="font-size:20px">What changed this week</h1>${body}${goals ? `<h2 style="margin:24px 0 4px">Goals for ${esc(goals.deadline)}</h2><table style="border-collapse:collapse;width:100%">${goals.goals.map((x) => `<tr><td style="padding:3px 8px 3px 0;border-bottom:1px solid #eee">${esc(x.label)}</td><td style="padding:3px 0;border-bottom:1px solid #eee;text-align:right">${x.current === null ? 'not measured' : `${esc(String(x.current))} of ${esc(String(x.target))} (${esc(x.status)})`}</td></tr>`).join('')}</table>` : ''}<p style="margin-top:24px"><a href="${ABS}/admin/dashboard">Open the full dashboard</a></p></div>`;
}

module.exports = { sections, healthLines, homeHtml, quoteFor, QUOTES, moves, emailText, emailHtml };
