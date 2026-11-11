'use strict';
// Owner stats (pub test 9, 2026-11-10): a business's own simple numbers on its private edit page and at the end of the
// easy setup. Read only from the per-business count table the site already keeps (venue_event_counts, db.js, written by
// venue-activity.js from the page beacons): page views and clicks on Website / Call / Directions / Book / Menu over the
// last 30 days, and the 30 days before that for comparison. No new tracking, no third-party calls, never public.
//
// A click on one of those links is counted twice by the page: once as the older outbound_click:<link type> and once as
// the click sheet's click:<key>. Each number here is the larger of the two, so a click is never counted twice.
const { dayOf } = require('./trip-demand');

// [key, click-sheet keys, outbound_click link types]
const ITEMS = [
  ['website', ['website'], ['website']],
  ['call', ['call_button', 'phone_number'], ['phone']],
  ['directions', ['directions'], ['directions']],
  ['book', ['booking'], ['booking']],
  ['menu', ['full_menu'], ['menu']],
];
const WORDS = {
  en: {
    title: 'Your page in the last 30 days', views: 'Page views', website: 'Website clicks', call: 'Calls (taps on your number)', directions: 'Directions', book: 'Book clicks', menu: 'Menu views',
    before: '{n} the 30 days before', none: 'No visits counted in the last 30 days yet.', small: 'Early days: these numbers are small, and they grow as more people find your page.',
    since: 'We started counting on {date}, so there’s no earlier month to compare yet.', note: 'Counts from Okanagan Roam only. Visits from search robots and from our own team aren’t counted. Only you can see these numbers.',
    clicksLine: '{n} clicks to your website, phone, directions, booking and menu',
  },
  fr: {
    title: 'Votre page ces 30 derniers jours', views: 'Vues de la page', website: 'Clics vers le site Web', call: 'Appels (touches sur votre numéro)', directions: 'Itinéraires', book: 'Clics sur Réserver', menu: 'Vues du menu',
    before: '{n} les 30 jours précédents', none: 'Aucune visite comptée ces 30 derniers jours pour l’instant.', small: 'C’est un début : ces chiffres sont petits, et ils grandissent à mesure que plus de gens trouvent votre page.',
    since: 'Nous comptons depuis le {date}; il n’y a donc pas encore de mois précédent à comparer.', note: 'Chiffres d’Okanagan Roam seulement. Les visites des robots de recherche et de notre équipe ne sont pas comptées. Vous seul voyez ces chiffres.',
    clicksLine: '{n} clics vers votre site Web, votre téléphone, l’itinéraire, la réservation et le menu',
  },
};
const MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] };
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateText = (d, lang) => { const m = Number(d.slice(5, 7)) - 1, day = Number(d.slice(8, 10)), y = d.slice(0, 4); return lang === 'fr' ? `${day === 1 ? '1er' : day} ${MONTHS.fr[m]} ${y}` : `${MONTHS.en[m]} ${day}, ${y}`; };

// -> { views, clicks: { website, call, directions, book, menu }, clicks_total, prev: same | null, since, counting_since,
//      small, none } or null (no table).
function ownerStats(db, venueId, now = new Date()) {
  try { if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='venue_event_counts'").get()) return null; } catch (e) { return null; }
  const today = dayOf(now);
  const back = (n) => dayOf(new Date(now.getTime() - n * 86400000));
  const curFrom = back(29), prevFrom = back(59), prevTo = back(30);
  const rows = db.prepare('SELECT day, name, n FROM venue_event_counts WHERE venue_id = ? AND day >= ? AND day <= ?').all(Number(venueId), prevFrom, today);
  const sum = (from, to) => {
    const by = {};
    for (const r of rows) if (r.day >= from && r.day <= to) by[r.name] = (by[r.name] || 0) + r.n;
    const clicks = {};
    for (const [k, sheet, out] of ITEMS) {
      const a = sheet.reduce((t, x) => t + (by[`click:${x}`] || 0), 0);
      const b = out.reduce((t, x) => t + (by[`outbound_click:${x}`] || 0), 0);
      clicks[k] = Math.max(a, b);
    }
    const total = Object.values(clicks).reduce((t, x) => t + x, 0);
    return { views: by.venue_view || 0, clicks, clicks_total: total };
  };
  let first = null;
  try { first = db.prepare('SELECT MIN(day) AS d FROM venue_event_counts').get().d || null; } catch (e) { first = null; }
  const cur = sum(curFrom, today);
  // The 30 days before only when we were already counting for all of them (otherwise the comparison would mislead).
  const prev = first && first <= prevFrom ? sum(prevFrom, prevTo) : null;
  return { ...cur, prev, since: curFrom, counting_since: first, none: cur.views === 0 && cur.clicks_total === 0, small: cur.views > 0 && cur.views < 20 };
}

// The panel on the edit page (and, short, at the end of the setup). Plain words; honest when the numbers are small.
function ownerStatsHtml(st, lang = 'en', opts = {}) {
  if (!st) return '';
  const W = WORDS[lang === 'fr' ? 'fr' : 'en'];
  const num = (n) => (lang === 'fr' ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const row = (label, n, p) => `<li><span class="os-n">${num(n)}</span><span class="os-l">${esc(label)}${p != null ? `<small>${esc(fill(W.before, { n: num(p) }))}</small>` : ''}</span></li>`;
  const prev = st.prev;
  const items = [row(W.views, st.views, prev ? prev.views : null)]
    .concat(ITEMS.map(([k]) => row(W[k], st.clicks[k], prev ? prev.clicks[k] : null)));
  const sinceLate = !prev && st.counting_since && st.counting_since > st.since;
  const lines = [st.none ? W.none : st.small ? W.small : '', !prev && st.counting_since ? fill(W.since, { date: dateText(st.counting_since, lang) }) : ''].filter(Boolean);
  if (opts.short) {
    return `<div class="os-short" id="${esc(opts.id || 'ownerStatsShort')}"><strong>${esc(W.title)}</strong><p>${esc(st.none ? W.none : `${num(st.views)} ${W.views.toLowerCase()} · ${fill(W.clicksLine, { n: num(st.clicks_total) })}`)}</p>${st.small ? `<p>${esc(W.small)}</p>` : ''}</div>`;
  }
  // Folded on the phone-first edit page: the headline is the summary ("42 page views · 7 clicks"), the rest one tap away.
  const head = st.none ? W.none : `${num(st.views)} ${W.views.toLowerCase()} · ${fill(W.clicksLine, { n: num(st.clicks_total) })}`;
  return `<details class="os-panel" id="${esc(opts.id || 'opStats')}" data-since-late="${sinceLate ? '1' : '0'}"${opts.open ? ' open' : ''}>
      <summary><span class="os-title">${esc(W.title)}</span><span class="os-head">${esc(head)}</span></summary>
      <ul class="os-list">${items.join('')}</ul>
      ${lines.map((l) => `<p class="os-msg">${esc(l)}</p>`).join('')}
      <p class="os-note">${esc(W.note)}</p>
    </details>`;
}

const OWNER_STATS_CSS = `
  .os-panel { margin: 14px 0 18px; padding: 14px 16px; border-radius: 14px; background: #FFFDF8; border: 1px solid #E5DED2; }
  .os-panel summary { cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-height: 44px; justify-content: center; }
  .os-panel .os-title { font-weight: 800; font-size: 1.05rem; }
  .os-panel .os-head { font-weight: 600; color: #3E3A34; }
  .os-panel[open] .os-list { margin-top: 12px; }
  .os-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 14px; }
  .os-list li { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .os-n { font-size: 1.5rem; font-weight: 800; color: #1E4F4C; min-width: 2.2ch; text-align: right; }
  .os-l { display: flex; flex-direction: column; font-weight: 700; overflow-wrap: anywhere; }
  .os-l small { font-weight: 600; color: #5F5A52; }
  .os-msg { margin: 10px 0 0; font-weight: 700; }
  .os-note { margin: 8px 0 0; color: #5F5A52; font-size: .92rem; }
  .os-short { margin: 16px 0; padding: 12px 14px; border-radius: 12px; background: #EEF5F3; }
  .os-short p { margin: 4px 0 0; }
`;

module.exports = { ownerStats, ownerStatsHtml, OWNER_STATS_CSS, OWNER_STATS_ITEMS: ITEMS };
