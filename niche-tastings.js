'use strict';
// Display the existing visit record; missing facts are omitted, never filled in.
function verifiedPrice(name, amount, prices) {
  const fact = prices && prices.experiences && prices.experiences[name];
  // A newer owner edit must not be overwritten by an older verification snapshot.
  return fact && Array.isArray(fact.recordedPrices) && fact.recordedPrices.includes(Number(amount)) ? fact : null;
}
function nicheVisitInfoWithPrices(info, prices) {
  if (!info || !Array.isArray(info.rows)) return info;
  const replace = (text, name, pattern) => text.replace(pattern, (whole, lead, amount) => {
    const fact = verifiedPrice(name, amount, prices);
    return fact ? lead + fact.price + (fact.basis === 'person' ? ' per person' : '') : whole;
  });
  return { ...info, rows: info.rows.map(row => {
    let text = String(row.text || '');
    if (row.label === 'Tastings') {
      text = replace(text, 'Splash & Dash', /(Splash & Dash:[\s\S]*?\$)(\d+(?:\.\d{1,2})?)(?:\s+per person)?/i);
      text = replace(text, 'Tarot tasting', /(Tarot tasting\s+\$)(\d+(?:\.\d{1,2})?)(?:\s+per person)?/i);
    } else if (row.label === 'Vineyard walk') text = replace(text, 'Vineyard walk', /([\s\S]*?\$)(\d+(?:\.\d{1,2})?)(?:\s+per person)?/i);
    return { ...row, text };
  }) };
}
function nicheTastingsHtml(info, esc, prices = null) {
  const rows = info && Array.isArray(info.rows) ? info.rows : [];
  const tasting = rows.find(r => r.label === 'Tastings');
  if (!tasting) return '';
  const options = [];
  const splash = String(tasting.text).match(/Splash & Dash:\s*([\s\S]*?)(?=\.\s*(?:Tarot tasting|Book online)|$)/i);
  const tarot = String(tasting.text).match(/Tarot tasting\s+(\$\d+(?:\.\d{1,2})?)/i);
  if (splash) options.push(['Splash & Dash', splash[1]]);
  if (tarot) options.push(['Tarot tasting', tarot[1]]);
  const walk = rows.find(r => r.label === 'Vineyard walk');
  if (walk) options.push([walk.label, walk.text]);
  let hasVerifiedPrice = false;
  const cards = options.map(([name, text]) => {
    const price = text.match(/\$\d+(?:\.\d{1,2})?/);
    const fact = price ? verifiedPrice(name, price[0].slice(1), prices) : null;
    if (fact) hasVerifiedPrice = true;
    const priceText = fact ? '$' + fact.price : price ? price[0] : '';
    const basis = fact && fact.basis === 'person' ? '<span class="fd-tasting-basis">per person</span>' : '';
    const time = text.match(/\b\d+\s*min\b/i);
    const rawDescription = text.replace(/,?\s*\$\d+(?:\.\d{1,2})?/, '').replace(/,?\s*\b\d+\s*min\b/i, '').replace(/[,.\s]+$/, '');
    const description = rawDescription ? rawDescription[0].toUpperCase() + rawDescription.slice(1) : '';
    return '<article class="fd-tasting-option"><div><h3>' + esc(name) + '</h3>' + (description ? '<p>' + esc(description) + '</p>' : '') + '</div><div class="fd-tasting-facts">' + (priceText ? '<strong>' + esc(priceText) + '</strong>' + basis : '') + (time ? '<span>🕒 ' + esc(time[0]) + '</span>' : '') + '</div></article>';
  }).join('');
  const checkedAt = hasVerifiedPrice ? prices.checkedAt : info.checked_at;
  const checked = /^\d{4}-\d{2}-\d{2}$/.test(checkedAt || '') ? new Date(checkedAt + 'T12:00:00Z').toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' }) : '';
  return '<section class="fd-card fd-tastings" id="fdTastings"><div class="fd-eyebrow">A little wine-country time</div><h2>Tastings &amp; vineyard visits 🍇</h2>' + (cards || '<p>' + esc(tasting.text) + '</p>') + '<p class="fd-note">Listed tasting prices' + (checked ? ' · checked ' + esc(checked) : '') + '. Confirm current options when booking.</p></section>';
}
// Every winery page (2026-11-08): the same Tastings card, from the winery's own Plan your visit box. Niche's priced
// options keep their cards; any other winery shows the rows it has recorded (Tastings, and Flights / Vineyard walk /
// Tours when present) exactly as written, with where they came from. Nothing is parsed into prices it does not state,
// and a winery with no Tastings row gets no card.
const TASTING_ROW_LABELS = ['Tastings', 'Flights', 'Vineyard walk', 'Tours'];
function wineryTastingsHtml(info, esc, prices = null) {
  const rows = info && Array.isArray(info.rows) ? info.rows : [];
  if (!rows.some((r) => r.label === 'Tastings')) return '';
  // Priced option cards only where verified prices were supplied (Niche); every other winery shows its recorded rows as written.
  const priced = prices ? nicheTastingsHtml(info, esc, prices) : '';
  if (priced.includes('fd-tasting-option')) return priced;
  const shown = TASTING_ROW_LABELS.map((label) => rows.find((r) => r.label === label)).filter(Boolean);
  const url = (u) => (typeof u === 'string' && /^https?:\/\/[^\s<>"]+$/i.test(u.trim()) ? u.trim() : '');
  // A lone Tastings row is not labelled again under a heading that already says "Tastings".
  const items = shown.map((r) => '<li>' + (shown.length === 1 && r.label === 'Tastings' ? '' : '<strong>' + esc(r.label) + '</strong>') + '<span>' + esc(r.text)
    + (url(r.url) ? ' <a href="' + esc(url(r.url)) + '" rel="nofollow noopener" target="_blank">More \u2197</a>' : '') + '</span></li>').join('');
  let host = '';
  try { host = new URL(info.source_url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
  const checked = /^\d{4}-\d{2}-\d{2}$/.test(info.checked_at || '') ? new Date(info.checked_at + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
  // Winery test 1 (2026-11-12): a line the owner gave us in setup (owner_labels) is the winery's own word, not the
  // website's: credited "From the winery" with no checked date. Research rows beside it keep their source.
  const owned = new Set(Array.isArray(info.owner_labels) ? info.owner_labels : []);
  const ownCount = shown.filter((r) => owned.has(r.label)).length;
  const credit = ownCount === shown.length ? 'From the winery'
    : (ownCount ? 'From the winery and ' + (host ? esc(host) : 'our research') : host ? 'From ' + esc(host) : 'From the winery') + (checked ? ' \u00b7 checked ' + esc(checked) : '');
  const heading = shown.length > 1 ? 'Tastings &amp; visits' : 'Tastings';
  return '<section class="fd-card fd-tastings" id="fdTastings"><div class="fd-eyebrow">A little wine-country time</div><h2>' + heading + ' \ud83c\udf47</h2>'
    + '<ul class="fd-tasting-list">' + items + '</ul>'
    + '<p class="fd-note">' + credit + '. Confirm current options when booking.</p></section>';
}
// The Plan your visit box under the Tastings card (2026-11-08): leave out the rows the card already shows, so a winery
// page never lists the same tasting twice. The card's own rows: the priced Niche card shows Tastings and Vineyard walk;
// every other card shows TASTING_ROW_LABELS. No card (no Tastings row) means nothing is left out.
function withoutTastingCardRows(info, esc, prices = null) {
  const rows = info && Array.isArray(info.rows) ? info.rows : [];
  if (!rows.some((r) => r.label === 'Tastings')) return info;
  const priced = prices ? nicheTastingsHtml(info, esc, prices) : '';
  const inCard = new Set(priced.includes('fd-tasting-option') ? ['Tastings', 'Vineyard walk'] : TASTING_ROW_LABELS);
  return { ...info, rows: rows.filter((r) => !inCard.has(r.label)) };
}
module.exports = { nicheTastingsHtml, nicheVisitInfoWithPrices, wineryTastingsHtml, withoutTastingCardRows, TASTING_ROW_LABELS };
