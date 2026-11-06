'use strict';
// "What changed" card for the top of the owner dashboard, and the Monday email (HTML + plain text).
const { esc, num } = require('./dashboard-page');

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

function goalsHtml(g) {
  if (!g) return '';
  const bar = (x) => `<div style="background:#e5e7eb;border-radius:4px;height:10px;position:relative;margin:4px 0"><div style="background:${x.status === 'behind' || x.status === 'below the starting point' ? '#b42318' : '#1a7f37'};width:${x.progress || 0}%;height:10px;border-radius:4px"></div>${x.expected ? `<div title="where we should be by now" style="position:absolute;left:${x.expected}%;top:-2px;height:14px;border-left:2px solid #667"></div>` : ''}</div>`;
  return `<h2 style="margin:18px 16px 0">Goals for ${esc(g.deadline)} <small class="empty">${num(g.days_left)} days left. Marker: where we should be by now.</small></h2>
    <main><section class="col"><div class="card"><table>${g.goals.map((x) => `<tr><td style="vertical-align:top"><b>${esc(x.label)}</b><br><small class="empty">${x.measured ? `Measured: ${esc(x.measured)}. ` : ''}${esc(x.extra || '')} ${esc(x.note || '')}</small></td>
      <td style="min-width:200px">${x.current === null ? '<span class="empty">not measured</span>' : `<b>${num(x.current)}</b> of ${num(x.target)} ${esc(x.unit)} <small class="empty">(started at ${num(x.baseline)})</small>${bar(x)}<small>${esc(x.status)}</small>`}</td></tr>`).join('')}</table></div></section></main>`;
}
function goalsLines(g) {
  if (!g) return [];
  return [`Goals for ${g.deadline} (${g.days_left} days left)`, ...g.goals.map((x) => `  ${x.label}: ${x.current === null ? 'not measured' : `${x.current} of ${x.target} ${x.unit} (started at ${x.baseline}), ${x.status}`}`), ''];
}

function cardHtml(sites, { notice = '', goals = null } = {}) {
  const col = (s) => {
    if (s.error || !s.data) return `<section class="col"><h2>${esc(s.name)}</h2><p class="warn">${esc(s.error || 'No data.')}</p></section>`;
    const d = s.data;
    return `<section class="col"><h2>${esc(s.name)} <small>${esc(label(d.range.cur))}, against ${esc(label(d.range.prev))}</small></h2><div class="card">
      <p class="${healthBad(d) ? 'warn' : 'empty'}">${healthLines(d).map(esc).join('<br>')}</p>
      ${d.headlines.length ? `<ul>${d.headlines.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '<p class="empty">A quiet week: nothing moved much.</p>'}
      <details><summary>Everything that changed</summary>${sections(d).map((x) => `<h4>${esc(x.h)}</h4><table>${x.rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`).join('')}</details></div></section>`;
  };
  return `<h2 style="margin:18px 16px 0">What changed this week</h2>${notice ? `<p class="empty" style="margin:4px 16px">${esc(notice)}</p>` : ''}<main>${sites.map(col).join('')}</main>
    ${goalsHtml(goals)}
    <form method="post" action="/admin/dashboard/digest-send" style="margin:0 16px 12px"><button type="submit">Email me this now</button> <small class="empty">It also arrives by itself every Monday morning.</small></form>`;
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

module.exports = { sections, healthLines, goalsHtml, cardHtml, emailText, emailHtml };
