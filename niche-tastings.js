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
module.exports = { nicheTastingsHtml, nicheVisitInfoWithPrices };
