const fs = require('node:fs');
const path = require('node:path');
const INTRO = 'Live music, markets and little adventures. Find your next good day out.';
const ICONS = { 'live-music':'🎵', 'family-kids':'🧸', 'markets-fairs':'🧺', 'food-drink-events':'🍴', 'arts-culture':'🎭', 'sports-recreation':'🏒', 'events-festivals':'🎉', nightlife:'🌙', 'wineries-wine-events':'🍷', 'holiday-seasonal':'✨', 'workshops-classes':'🎨', 'community-events':'💚' };
const SHORT_LABELS = { 'family-kids':'Family', 'markets-fairs':'Markets' };
const styles = '<style>' + fs.readFileSync(path.join(__dirname, 'public/whats-on-layout.css'), 'utf8') + '</style>';
const script = '<script>' + fs.readFileSync(path.join(__dirname, 'public/whats-on-layout.js'), 'utf8') + '</script>';
function renderDiscovery({ allChip, free, categories, filters, basePath }) {
  const popular = categories.filter(c => ['live-music','family-kids','markets-fairs'].includes(c.key));
  const more = categories.filter(c => !popular.includes(c));
  return `<div class="wo-discovery"><div class="wo-when"><div class="wo-when-heading"><span class="wo-step">1 · When?</span><a class="whatson-date-chip wo-any-day" data-when="" href="${basePath}">Any day</a></div><nav class="wo-quick" aria-label="Quick dates and price"><a class="outdoor-filter-chip whatson-date-chip" data-when="today" href="${basePath}?when=today">☀️ Today</a><a class="outdoor-filter-chip whatson-date-chip" data-when="this-weekend" href="${basePath}?when=this-weekend">🎉 This weekend</a>${free}</nav></div><span class="wo-step wo-types-label">3 · What sounds fun?</span><div class="whatson-cat-row wo-types" role="group" aria-label="Choose event types" data-filter="category">${allChip}${popular.map(c=>c.html).join('')}<details class="wo-more-types"><summary>More event types <span aria-hidden="true">＋</span></summary><div class="wo-more-chips">${more.map(c=>c.html).join('')}</div><p class="wo-count-help">Numbers show matching events. You can choose more than one type.</p></details></div>${filters}</div>`;
}
module.exports = { INTRO, ICONS, SHORT_LABELS, styles, script, renderDiscovery };
