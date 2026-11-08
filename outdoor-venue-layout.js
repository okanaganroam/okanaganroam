// Outdoors and Sports & Recreation pages (2026-11-08): every English page of those two categories uses the layout first
// built for the Kalamalka Lake park page: a photo, the name, a few quick facts, big buttons, section tabs, a "Before you go"
// card and a "Getting there" box. Each section is built from what the place's own listing records and appears only when
// it has something to show. Nothing is written for a place that has no data.
//
// The Kalamalka page keeps its own page-specific content (the mapped route, the two parking entrances), rendered by
// kalamalka-venue-layout.js; this file hands it that one page and builds every other one itself.
'use strict';

const CATEGORY_ICON = { outdoor: '🌿', sport: '🏅' };
const CATEGORY_EYEBROW = { outdoor: 'Outdoors', sport: 'Sports & Recreation' };

function renderOutdoorLayout(p) {
  if (p.park) return require('./kalamalka-venue-layout').renderKalamalkaLayout(p);
  const e = p.escapeHtml, v = p.venue, facts = p.facts || {};
  const rows = p.factRows || []; // [[label, html]], from the researched facts (Outdoors only)
  const row = (label) => (rows.find((r) => r[0] === label) || [])[1] || '';
  const external = (url, label, cls = '') => `<a class="${cls}" href="${e(url)}" target="_blank" rel="noopener">${label} ↗</a>`;
  const detail = (label, html) => html ? `<div class="kl-fact-row"><strong>${e(label)}</strong><p>${html}</p></div>` : '';

  // Quick facts: only short, recorded values fit a tile; longer ones are rows in the cards below.
  const tile = (icon, value, label) => value && String(value).length <= 26 ? `<div><span aria-hidden="true">${icon}</span><strong>${e(value)}</strong><small>${e(label)}</small></div>` : '';
  const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  const cost = facts.cost || (v.free_entry ? 'Free' : '');
  const tiles = [
    tile('🎟️', /^free( to visit)?\.?$/i.test(plain(cost)) ? 'Free' : plain(cost), 'To visit'),
    tile('🕒', facts.time_needed, 'Time to allow'),
    tile('🗓️', facts.season, 'Season'),
    tile('🐾', facts.dogs, 'Dogs'),
  ].filter(Boolean).slice(0, 4);

  const heads = rows.find((r) => r[0] === 'Heads up');
  const save = p.actions.filter((a) => /fav-btn|trip-btn/.test(a));
  const main = p.actions.filter((a) => !/fav-btn|trip-btn/.test(a));

  // Before you go: the researched facts except the ones shown elsewhere (the notice, the parking box, the source line).
  const shown = (label) => tiles.some((t) => t.includes(`<small>${label}</small>`));
  const beforeRows = rows.filter(([label]) => !['Heads up', 'Parking', 'Checked', 'Cost'].includes(label)
    && !(label === 'Season' && shown('Season')) && !(label === 'Time needed' && shown('Time to allow')) && !(label === 'Dogs' && shown('Dogs')));
  const costRow = rows.find((r) => r[0] === 'Cost' && !/^free( to visit)?\.?$/i.test(plain(r[1])));
  if (costRow) beforeRows.unshift(costRow);
  let host = '';
  try { host = new URL(facts.source_url).hostname.replace(/^www\./, ''); } catch (err) { /* no source */ }
  const source = facts.source_url && facts.checked_at
    ? `<p class="kl-source">Information from ${external(facts.source_url, e(host || 'the source'))}, checked ${e(facts.checked_at)}</p>` : '';
  const before = beforeRows.length
    ? `<section class="kl-card" id="klBefore"><h2>Before you go 🌞</h2>${beforeRows.map(([label, html]) => detail(label, html)).join('')}${source}</section>` : '';

  const parking = row('Parking');
  const hasWhere = !!(parking || p.locationHtml || p.detailRows);
  const where = hasWhere
    ? `<aside class="kl-card kl-parking" id="klParking"><p class="kl-eyebrow">Start on the right foot</p><h2>Getting there 📍</h2>${parking ? `<p>${parking}</p>` : ''}${p.detailRows ? `<div class="venue-key-info">${p.detailRows}</div>` : ''}${p.locationHtml || ''}</aside>` : '';

  const about = `<section class="kl-card" id="klAbout"><h2>About this place</h2>${p.descriptionHtml || ''}${p.guideLinks || ''}</section>`;
  const hours = p.hoursHtml ? `<section class="kl-card kl-hours" id="venueHours">${p.hoursHtml}</section>` : '';

  const nav = [['klOverview', 'Overview'], ['klAbout', 'About'], before && ['klBefore', 'Before you go'], where && ['klParking', 'Getting there'], hours && ['venueHours', 'Hours']]
    .filter(Boolean).map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');

  const category = CATEGORY_EYEBROW[v.type] || 'Outdoors';
  return `<div id="klLayout" class="kl-generic">
    <section class="kl-overview" id="klOverview">${p.advisoryHtml || ''}
      <p class="kl-eyebrow">${CATEGORY_ICON[v.type] || '🌿'} ${e(category)} · <a href="/${e(v.region)}">${e(p.regionLabel)}</a></p>
      ${v.image_url ? `<h1 class="kl-desktop-title">${e(v.name)}</h1>` : ''}
      ${p.glanceHtml || ''}${p.openStatusHtml || ''}
      ${p.chipsHtml ? `<p class="chips">${p.chipsHtml}</p>` : ''}
      ${tiles.length >= 2 ? `<div class="kl-quick kl-quick-${tiles.length}" aria-label="Quick facts">${tiles.join('')}</div>` : ''}
      ${heads ? `<aside class="kl-notice"><strong>🌲 Heads up</strong><p>${heads[1]}</p></aside>` : ''}
      ${main.length ? `<div class="kl-primary">${main.join('')}</div>` : ''}
      ${save.length ? `<div class="kl-save"${p.ctaRowAttrs}>${save.join('')}</div><p class="kl-save-help">♡ Favorite saves this place for later. Add to trip puts it on your trip list.</p>` : ''}
    </section>
    <nav class="kl-nav" aria-label="Page sections">${nav}</nav>
    <div class="kl-grid">
      <div class="kl-main">${about}${before}${hours}${p.visitHtml || ''}${p.gallery || ''}</div>
      ${where}
    </div>
    ${p.visitorHtml || ''}${p.eventsHtml || ''}
    ${p.nearbyCards.length ? `<section class="kl-nearby"><div class="kl-nearby-head"><div><p class="kl-eyebrow">Make a day of it</p><h2>Nearby adventures ✨</h2></div><a href="/${e(v.region)}/${e(p.categorySlug)}">See more ${e(category.toLowerCase())} →</a></div><ul class="nearby-list">${p.nearbyCards.slice(0, 3).join('')}</ul></section>` : ''}
    ${p.ownerCtaHtml || ''}
    <p class="kl-update">Spotted something that needs updating? <a href="/contact" data-contact-open>Suggest an update →</a></p>
  </div>`;
}
module.exports = { renderOutdoorLayout };
