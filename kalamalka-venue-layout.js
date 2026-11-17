// A page-specific layout, composed from the park's existing listing and facts.
function renderKalamalkaLayout(p) {
  const access = require('./data/kalamalka-trail-access.json');
  const parkingHref = key => '/map?directions=' + encodeURIComponent(access.venuePath) + '&entrance=' + encodeURIComponent(key) + '#near-me';
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
  const photos = p.gallery || '';
  const source = `<p class="kl-source">Park information: ${external(facts.source_url || p.venue.website, 'BC Parks')}${facts.checked_at ? ' · listing checked ' + e(facts.checked_at) : ''}</p>`;
  return `<div id="klLayout">
    <section class="kl-overview" id="klOverview">${p.advisoryHtml || ''}
      <p class="kl-eyebrow">🌿 A little lake-view adventure · <a href="/coldstream">Coldstream</a></p>
      <h1 class="kl-desktop-title">Kalamalka Lake Trails &amp; Rattlesnake Point</h1>
      <p class="kl-park-name">Kalamalka Lake Provincial Park</p>
      <div class="kl-quick" aria-label="Hiking essentials">${fact('🥾', 'About 2.5 km return', 'Rattlesnake Point route')}${fact('🕒', '50–75 min', 'Estimated walking time')}${fact('🎟️', 'Free', 'To visit')}${fact('🐾', 'Dogs on leash', 'Pet beach rules apply')}</div>
      ${before ? `<aside class="kl-notice"><strong>🌲 Check trail access before you go</strong><p>${e(before.text.replace(/ Rattlesnakes and bears live here\.?/, ''))}</p><small>Listed notice${p.visitInfo.checked_at ? ' · checked ' + e(checked) : ''}. ${external(p.venue.website, 'Check current BC Parks advisories')}</small></aside>` : ''}
      <div class="kl-primary"><a class="cta" href="#klParking">📍 Parking &amp; directions</a>${mapUrl ? external(mapUrl, '🗺️ Official trail map', 'cta secondary') : ''}</div>
      <div class="kl-save"${p.ctaRowAttrs}>${saved}</div>
      <p class="kl-save-help">♡ Favorite saves this place for later. Add to trip puts it on your trip list.</p>
    </section>
    <nav class="kl-nav" aria-label="Park page sections"><a href="#klOverview">Overview</a><a href="#klParking">Parking</a><a href="#klBefore">Before you go</a></nav>
    <div class="kl-grid">
      <div class="kl-main">
        <section class="kl-card"><p class="kl-eyebrow">Your next little escape</p><h2>Lake views, at your own pace 💚</h2><p>Follow grassland and forest trails above the lake to the viewpoint at Rattlesnake Point.</p>
          <div class="kl-fact-row"><strong>🥾 Rattlesnake Point · easy route</strong><p>About 1.2 km one way from Twin Bays / Yellow Gate parking, or <strong>about 2.5 km return</strong> when you retrace the same route.</p><p>Allow <strong>50–75 minutes walking</strong>, plus time for views and breaks.</p><small>Walking time is our estimate at roughly 2–3 km/h; allow longer with children or in difficult conditions. ${external(access.sources.tourismMap, 'View the mapped route')}</small></div>
          ${detail('Route choice', 'The mapped route follows the ridge towards Rattlesnake Point. The separate Juniper Trail descends to the bays on pavement, then continues on gravel.')}
          <details class="kl-fold"><summary>Route distances &amp; sources</summary><p>The old 1.5 km figure is BC Parks’ Juniper Trail listing, not the return distance for the route above. Tourism Vernon’s mapped Rattlesnake Point route is 1.24 km from Yellow Gate to the viewpoint; doubling it gives about 2.5 km out and back. A Juniper/Crest loop is a different route.</p><p>${external(access.sources.tourismMap, 'Tourism Vernon route')} · ${external(access.sources.brochure, 'Official park brochure')}</p><small>Route and parking checked Nov 8, 2026.</small></details>
          <details class="kl-fold"><summary>More about the park &amp; best season</summary><p>${e(p.venue.description)}</p>${season ? detail('Best season', season.text) : ''}${p.guideLinks}</details>
        </section>
        <section class="kl-card" id="klBefore"><h2>Before you go 🌞</h2><p>A few handy details for a happy day outside.</p><p class="kl-family">🧸 Listed as kid-friendly. Choose a route that suits your group.</p>
          <details class="kl-fold"><summary>🐾 Dogs &amp; pet beaches</summary><p>${e(facts.dogs || '')}</p><p>The park brochure directs dogs along Crest Trail to the pet beach. Follow the signed dog route and avoid the main beach areas.</p></details>
          <details class="kl-fold"><summary>🌿 Wildlife &amp; swimming safety</summary>${(facts.extras || []).map(r => detail(r.label === 'Rattlesnakes' ? 'Wildlife' : r.label, r.text)).join('')}</details>
          ${source}
        </section>${photos}
      </div>
      <aside class="kl-card kl-parking" id="klParking"><p class="kl-eyebrow">Start on the right foot</p><h2>Parking &amp; directions 📍</h2><p>Choose your trail first—this park has more than one entrance.</p>
        ${Object.entries(access.entrances).map(([key, point]) => `<div class="kl-parking-choice"><strong>${e(point.name)}</strong><small>${e(point.road)}</small><p>${e(point.description)}</p><a class="cta kl-parking-directions" data-track="directions" data-entrance="${e(key)}" href="${e(parkingHref(key))}">📍 ${e(point.button)}</a></div>`).join('')}
        ${mapUrl ? external(mapUrl, 'Compare entrances on the official map', 'kl-map-link') : ''}
        <p class="kl-source">Parking locations from ${external(access.sources.tourismMap, 'Tourism Vernon')}, checked Nov 8, 2026; entrances cross-checked against the BC Parks map. These buttons open the selected parking location in Roam Now.</p>
        ${external(p.venue.website, 'Visit the BC Parks website')}
      </aside>
    </div>
    ${p.visitorHtml}
    ${p.nearbyCards.length ? `<section class="kl-nearby"><div class="kl-nearby-head"><div><p class="kl-eyebrow">Make a day of it</p><h2>Nearby adventures ✨</h2></div><a href="/coldstream/outdoors">See more outdoors →</a></div><ul class="nearby-list">${p.nearbyCards.slice(0,3).join('')}</ul></section>` : ''}
    <p class="kl-update">Spotted something that needs updating? <a href="/contact" data-contact-open>Suggest an update →</a></p>
  </div>`;
}
module.exports = { renderKalamalkaLayout };
