'use strict';
// Owner dashboard: Places to stay (2026-11-11). How often guests scan the QR code on each hotel's or rental's card,
// and how often the link in our email to them is opened. Both sites side by side; numbers from stay-scans.js.
const { layout, askFor } = require('./dashboard-layout');
const { esc, num, bars, stat, table } = require('./dashboard-page');

const fmtDay = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };

function siteCard(g, days) {
  if (g.error || !g.data) return `<section class="col"><h2>${esc(g.name)}</h2><p class="warn">${esc(g.error || 'No data.')}</p></section>`;
  const d = g.data;
  const scanned = d.places.filter((p) => p.qr > 0 || p.email > 0);
  const waiting = d.places.filter((p) => p.qr === 0 && p.email === 0);
  const rows = scanned.map((p) => [`${esc(p.name)}${p.kind === 'rental' ? ' <small>(rentals)</small>' : ''}${p.region ? ` <small>${esc(p.region)}</small>` : ''}`,
    p.qr ? `<b>${num(p.qr)}</b>` : '0', p.email ? num(p.email) : '0', p.last_qr ? esc(fmtDay(p.last_qr)) : '']);
  return `<section class="col"><h2>${esc(g.name)} <small>last ${days} days</small></h2><div class="card">
    <div class="stats">${stat(d.total_qr, 'QR code scans')}${stat(d.places_scanned, 'places with a scan')}${stat(d.total_email, 'email link opens')}</div>
    ${bars(d.qr_per_day, 'QR scans per day')}
    <h4>By place</h4>
    ${rows.length ? table(['Place', 'QR scans', 'Email link opens', 'Last scan'], rows) : '<p class="empty">No scans or link opens yet in this period.</p>'}
    ${waiting.length ? `<p class="empty">${num(waiting.length)} other place${waiting.length === 1 ? '' : 's'} with a card: no scans or opens yet.</p>` : ''}
    <p class="empty">Counting started ${d.counting_since ? esc(fmtDay(d.counting_since)) : 'today'}, so earlier days show zero. A scan is someone opening the card’s QR code; an email link open is someone at the hotel clicking the link in our email. Totals only: nothing about the person is kept, and bots, email scanners and your own visits are left out.</p></div></section>`;
}

function renderStaysPage({ days = 30, sites = [] }) {
  const range = [7, 30, 90].map((n) => `<a class="tab${days === n ? ' on' : ''}" href="/admin/dashboard/stays?days=${n}">${n}d</a>`).join('');
  return layout({ active: 'stays', title: 'Places to stay', ask: askFor('stays'),
    tells: 'How often guests scan the QR code on the cards we made for hotels, B&Bs and rental companies, place by place.',
    use: 'The number to send a hotel in its monthly scan count. A place with cards out and no scans may need its cards moved somewhere guests see them.',
    range, body: sites.map((g) => siteCard(g, days)).join('') });
}

module.exports = { renderStaysPage };
