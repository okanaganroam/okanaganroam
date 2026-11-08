'use strict';
// Display the existing visit record; missing facts are omitted, never filled in.
function nicheTastingsHtml(info, esc) {
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
  const cards = options.map(([name, text]) => {
    const price = text.match(/\$\d+(?:\.\d{1,2})?/);
    const time = text.match(/\b\d+\s*min\b/i);
    const rawDescription = text.replace(/,?\s*\$\d+(?:\.\d{1,2})?/, '').replace(/,?\s*\b\d+\s*min\b/i, '').replace(/[,.\s]+$/, '');
    const description = rawDescription ? rawDescription[0].toUpperCase() + rawDescription.slice(1) : '';
    return '<article class="fd-tasting-option"><div><h3>' + esc(name) + '</h3>' + (description ? '<p>' + esc(description) + '</p>' : '') + '</div><div class="fd-tasting-facts">' + (price ? '<strong>' + esc(price[0]) + '</strong>' : '') + (time ? '<span>🕒 ' + esc(time[0]) + '</span>' : '') + '</div></article>';
  }).join('');
  const checked = /^\d{4}-\d{2}-\d{2}$/.test(info.checked_at || '') ? new Date(info.checked_at + 'T12:00:00Z').toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' }) : '';
  return '<section class="fd-card fd-tastings" id="fdTastings"><div class="fd-eyebrow">A little wine-country time</div><h2>Tastings &amp; vineyard visits 🍇</h2>' + (cards || '<p>' + esc(tasting.text) + '</p>') + '<p class="fd-note">Listed tasting prices' + (checked ? ' · checked ' + esc(checked) : '') + '. Confirm current options when booking.</p></section>';
}
module.exports = { nicheTastingsHtml };
