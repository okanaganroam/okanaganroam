// A page-specific preview, composed from the park's existing listing and facts.
function renderKalamalkaLayout(p) {
  const e = p.escapeHtml, facts = p.facts || {}, rows = (p.visitInfo || {}).rows || [];
  const row = label => rows.find(r => r.label === label);
  const map = row('Trail map');
  const mapUrl = map && map.url;
  const before = row('Before you go');
  const season = row('Best season');
  const checked = p.visitInfo?.checked_at ? new Date(p.visitInfo.checked_at + 'T12:00:00Z').toLocaleDateString('en-CA', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : ''; 
  const external = (url, label, cls = '') => `<a class="${cls}" href="${e(url)}" target="_blank" rel="noopener">${label} ↗</a>`;
  const fact = (icon, value, label) => `<div><span aria-hidden="true">${icon}</span><strong>${value}</strong><small>${label}</small></div>`;
  const detail = (label, text) => text ? `<div class="kl-fact-row"><strong>${e(label)}</strong><p>${e(text)}</p></div>` : '';
  const saved = p.actions.filter(a => /fav-btn|trip-btn/.test(a)).join('');
  const directions = p.actions.find(a => /data-track="directions"/.test(a));
  const parkMap = directions ? directions.replace(/>Get Directions<\/a>/, '>Open park in Roam Now →</a>') : '';
  const photos = p.gallery || '';
  const source = `<p class="kl-source">Park information: ${external(facts.source_url || p.venue.website, 'BC Parks')}${facts.checked_at ? ' · listing checked ' + e(facts.checked_at) : ''}</p>`;
  return `<div id="klLayout">
    <section class="kl-overview" id="klOverview">${p.advisoryHtml || ''}
      <p class="kl-eyebrow">🌿 A little lake-view adventure · <a href="/coldstream">Coldstream</a></p>
      <h1 class="kl-desktop-title">Kalamalka Lake Trails &amp; Rattlesnake Point</h1>
      <p class="kl-park-name">Kalamalka Lake Provincial Park</p>
      <div class="kl-quick" aria-label="Hiking essentials">${fact('🥾', '1.5 km', 'Juniper Trail¹')}${fact('🌿', 'Easy–moderate', 'Juniper Trail')}${fact('🎟️', 'Free', 'To visit')}${fact('🐾', 'Dogs on leash', 'Pet beach rules apply')}</div>
      ${before ? `<aside class="kl-notice"><strong>🌲 Check trail access before you go</strong><p>${e(before.text.replace(/ Rattlesnakes and bears live here\.?/, ''))}</p><small>Listed notice${p.visitInfo.checked_at ? ' · checked ' + e(checked) : ''}. ${external(p.venue.website, 'Check current BC Parks advisories')}</small></aside>` : ''}
      <div class="kl-primary"><a class="cta" href="#klParking">📍 Parking &amp; directions</a>${mapUrl ? external(mapUrl, '🗺️ Official trail map', 'cta secondary') : ''}</div>
      <div class="kl-save"${p.ctaRowAttrs}>${saved}</div>
      <p class="kl-save-help">♡ Favorite saves this place for later. Add to trip puts it on your trip list.</p>
    </section>
    <nav class="kl-nav" aria-label="Park page sections"><a href="#klOverview">Overview</a><a href="#klParking">Parking</a><a href="#klBefore">Before you go</a></nav>
    <div class="kl-grid">
      <div class="kl-main">
        <section class="kl-card"><p class="kl-eyebrow">Your next little escape</p><h2>Lake views, at your own pace 💚</h2><p>Follow grassland and forest trails above the lake to the viewpoint at Rattlesnake Point.</p>
          <div class="kl-fact-row"><strong>🥾 Juniper Trail</strong><p>${e(row('The hike')?.text || '')}</p><small>¹ BC Parks lists 1.5 km but does not specify whether this is one way or return. Check the official map when planning your route.</small></div>
          ${detail('Trail surface', facts.accessibility)}
          <details class="kl-fold"><summary>More about the park &amp; best season</summary><p>${e(p.venue.description)}</p>${season ? detail('Best season', season.text) : ''}${p.guideLinks}</details>
        </section>
        <section class="kl-card" id="klBefore"><h2>Before you go 🌞</h2><p>A few handy details for a happy day outside.</p><p class="kl-family">🧸 Listed as kid-friendly. Choose a route that suits your group.</p>
          <details class="kl-fold"><summary>🐾 Dogs &amp; pet beaches</summary><p>${e(facts.dogs || '')}</p></details>
          <details class="kl-fold"><summary>🌿 Wildlife &amp; swimming safety</summary>${(facts.extras || []).map(r => detail(r.label === 'Rattlesnakes' ? 'Wildlife' : r.label, r.text)).join('')}</details>
          ${source}
        </section>${photos}
      </div>
      <aside class="kl-card kl-parking" id="klParking"><p class="kl-eyebrow">Start on the right foot</p><h2>Parking &amp; directions 📍</h2><p>Choose your trail first—this park has more than one entrance.</p>
        <div class="kl-parking-choice"><strong>Jade &amp; Juniper Bay parking</strong><p>Crest Trail starts here and leads towards Rattlesnake Point. Juniper Trail descends to the twin bays and continues towards the viewpoint.</p></div>
        <div class="kl-parking-choice"><strong>Cosens Bay Gate</strong><p>${e(facts.parking || '')}. Use the official map to plan a Cosens Bay outing.</p></div>
        ${mapUrl ? external(mapUrl, 'Choose your trailhead on the official map', 'kl-map-link') : ''}
        <div class="kl-map-note"><strong>About the Roam Now pin</strong><p>The existing pin marks the park’s listed location, not a verified parking entrance. Check your chosen trailhead before starting directions.</p>${parkMap}</div>
        <p class="kl-address">${e(p.venue.address)}</p>
        ${external(p.venue.website, 'Visit the BC Parks website')}
      </aside>
    </div>
    ${p.visitorHtml}
    ${p.nearbyCards.length ? `<section class="kl-nearby"><div class="kl-nearby-head"><div><p class="kl-eyebrow">Make a day of it</p><h2>Nearby adventures ✨</h2></div><a href="/coldstream/outdoors">See more outdoors →</a></div><ul class="nearby-list">${p.nearbyCards.slice(0,3).join('')}</ul></section>` : ''}
    <p class="kl-update">Spotted something that needs updating? <a href="/contact" data-contact-open>Suggest an update →</a></p>
  </div>`;
}
module.exports = { renderKalamalkaLayout };
