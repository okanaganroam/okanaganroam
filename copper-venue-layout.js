// Copper's approved layout, composed from the same live fragments as other venues.
function renderCopperVenueLayout(parts) {
  const escapeHtml = parts.escapeHtml;
  const fold = (label, html, extra = '') => html
    ? '<details class="cp-details ' + extra + '"><summary>' + label + '</summary>' + html + '</details>' : '';
  const menuExamples = parts.menuPicks.map((item) => {
    const options = [];
    if (/gluten[- ]free.*option/i.test(item.description || '')) options.push('Gluten-free option');
    if (/vegan.*option/i.test(item.description || '')) options.push('Vegan option');
    if (!options.length) options.push(...item.dietary);
    return '<div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(parts.formatPrice(item.price)) + '</span>'
      + (options.length ? '<small>' + escapeHtml(options.join(' · ')) + '</small>' : '') + '</div>';
  }).join('');
  const happyLink = parts.happyHourHtml
    .replace('<p class="venue-hh-status"', '<a href="#copperDeals" class="venue-hh-status cp-deal-link"')
    .replace('</p>', ' →</a>');
  const menu = parts.menuHtml
    ? '<section class="cp-card" id="copperMenu"><div class="cp-section-title"><div><div class="cp-eyebrow">A bite with your beer</div><h2>On the menu 🍽️</h2></div><span class="cp-note">A few menu examples</span></div>'
      + '<div class="cp-menu-picks">' + menuExamples + '</div><a class="cp-full-menu" href="' + escapeHtml(parts.menuLink) + '">See the full menu (' + parts.menuCount + ' dishes) →</a>'
      + fold('More menu details &amp; dietary options', parts.menuHtml) + '</section>'
    : '<section class="cp-card" id="copperMenu"><h2>Menu &amp; prices 🍽️</h2><p>Check Copper’s website for the latest menu.</p></section>';
  const deals = parts.happyDealsHtml || parts.weeklySpecialsHtml || parts.weeklyNightsHtml
    ? '<section class="cp-card" id="copperDeals"><div class="cp-eyebrow">Make a little time for happy hour</div><h2>Deals &amp; good times 🍻</h2><div id="venueDeals">'
      + parts.happyDealsHtml + '</div>' + fold('Weekly food &amp; drink specials', parts.weeklySpecialsHtml) + parts.weeklyNightsHtml + '</section>' : '';
  const nearbyList = (cards) => cards.length ? '<ul class="nearby-list">' + cards.join('') + '</ul>' : '';
  const nearby = parts.nearbyCards.length || parts.relatedHtml || parts.nearbyHtml
    ? '<section class="cp-nearby" data-from-venue="' + Number(parts.venue.id) + '"><div class="cp-section-title"><div><div class="cp-eyebrow">While you’re in the neighbourhood</div><h2>A little more to explore 🌿</h2></div><a href="/kelowna">Explore Kelowna →</a></div>'
      + nearbyList(parts.nearbyCards.slice(0, 3))
      + fold('More nearby places &amp; breweries', nearbyList(parts.nearbyCards.slice(3)) + parts.relatedHtml + parts.nearbyHtml) + '</section>' : '';
  return [
    '<div class="cp-layout"><div class="cp-content"><section class="cp-summary" id="copperOverview">',
    '<div class="venue-header"><h1 class="venue-desktop-title">' + escapeHtml(parts.venue.name) + '</h1><p class="venue-at-a-glance">' + parts.atAGlance + '</p>' + parts.openStatusHtml + '</div>',
    parts.venueAdvisoryHtml || '',
    '<p class="cp-intro">Locally brewed beer, comfort food and a dog-friendly patio in Kelowna’s Landmark District. Bring the kids, try a flight and settle in for a game.</p>',
    '<div class="venue-cta-row"' + parts.ctaRowAttrs + '><a class="cta cp-menu-button" href="#copperMenu">🍽️ Menu &amp; prices</a>',
    parts.directionsHtml.replace('class="cta"', 'class="cta secondary"'),
    '<a class="cta secondary" href="#venueHours">🕒 Hours</a></div><div class="cp-highlights">',
    parts.venue.dog_friendly ? '<span>🐾 Dogs on the patio</span>' : '',
    parts.venue.kid_friendly ? '<span>🧸 Kids welcome</span>' : '',
    parts.venue.gluten_free ? '<span>🌾 Gluten-free options</span>' : '',
    '</div>', happyLink, parts.verifiedHtml.replace(/<span class="venue-verified-date">[\s\S]*?<\/span>/, ''), '</section>',
    '<nav class="cp-section-nav" aria-label="Copper Brewing sections"><a href="#copperOverview">Overview</a><a href="#copperMenu">Menu</a><a href="#copperDeals">Deals</a><a href="#venueHours">Hours</a></nav>',
    menu, deals,
    fold('More about Copper &amp; all venue features', parts.descriptionHtml + parts.badgesHtml + parts.visitHtml + parts.verifiedHtml + parts.guideLinks + parts.ownerCtaHtml, 'cp-card'),
    fold('Upcoming events at Copper', parts.eventsHtml, 'cp-card'), parts.visitorHtml,
    '</div><aside class="cp-aside">',
    parts.detailRows ? '<div class="venue-section venue-key-info"><h2>Your visit, made easy</h2>' + parts.detailRows + '</div>' : '',
    parts.locationHtml, '<div class="venue-section venue-hours" id="venueHours">' + (parts.hoursHtml || '<h2>Hours</h2><p>Check with Copper for current hours.</p>') + '</div>',
    '<section class="cp-card"><h2>Keep this one handy 💛</h2><p>Visit their website, give them a call, or save Copper for your next outing.</p><div class="cp-extra-actions"' + parts.ctaRowAttrs + '>' + parts.extraActionsHtml + '</div></section>',
    '</aside></div>', nearby
  ].join('\n');
}
module.exports = { renderCopperVenueLayout };
