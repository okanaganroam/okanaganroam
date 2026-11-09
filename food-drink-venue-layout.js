'use strict';
// The Food & Drink venue page (English), generalised from Copper Brewing's approved layout. Copper stays the visual
// reference only: everything below is built from the venue's own record, and a section, tab or button appears only
// when there is something real behind it. Copper's own wording lives in data/copper-layout-profile.json (a "profile"),
// which no other venue receives.

// Google-style price levels, the scale the stored 1-4 comes from.
const PRICE_WORDS = { 1: 'inexpensive', 2: 'moderate', 3: 'expensive', 4: 'very expensive' };
function priceLegend(level) {
  const n = Number(level);
  return PRICE_WORDS[n] ? '$'.repeat(n) + ' (' + PRICE_WORDS[n] + ')' : '';
}

// A short opening for the page, from the venue's own description: whole sentences up to about 240 characters.
// `rest` is true when the page holds more than the opening, so the full text goes in an expandable section.
function introFrom(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (!text) return { intro: '', rest: false };
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/);
  let intro = sentences[0];
  for (let i = 1; i < sentences.length && (intro + ' ' + sentences[i]).length <= 240; i++) intro += ' ' + sentences[i];
  if (intro.length > 300) intro = intro.slice(0, 280).replace(/[\s,;:]+\S*$/, '') + '…';
  return { intro, rest: intro !== text };
}

// Up to three menu examples with a price, spread across the menu's sections first, then in menu order.
function pickMenuExamples(sections, wantedNames) {
  const items = (sections || []).flatMap((s) => s.items || []);
  if (Array.isArray(wantedNames) && wantedNames.length) {
    const chosen = wantedNames.map((n) => items.find((it) => String(it.name).toLowerCase() === String(n).toLowerCase())).filter(Boolean);
    if (chosen.length) return chosen;
  }
  const picks = [];
  for (const s of sections || []) {
    const first = (s.items || []).find((it) => String(it.price || '').trim());
    if (first && picks.length < 3) picks.push(first);
  }
  for (const it of items) if (picks.length < 3 && !picks.includes(it)) picks.push(it);
  return picks;
}

// "Menu examples $12-19" from the examples' plain prices, or '' when they have none.
function menuPriceHint(picks, label) {
  const nums = picks.map((it) => (/^\$?\d+(?:\.\d{1,2})?$/.test(String(it.price)) ? Number(String(it.price).replace('$', '')) : NaN)).filter(Number.isFinite);
  if (!nums.length) return '';
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return 'Menu examples ' + label(String(lo)) + (hi !== lo ? '–' + label(String(hi)).replace('$', '') : '');
}

// Amenity highlights wording: only what is recorded. A dog note is shown as the note says it (a patio-only note
// never becomes "dogs allowed"); a gluten-free flag stays "options".
const HIGHLIGHTS = [
  ['dog', '🐾'], ['kid', '🧸'], ['patio', '🌿'], ['lake', '🌅'], ['gluten', '🌾'],
  ['vegan', '🌱'], ['vegetarian', '🥗'], ['music', '🎶'], ['groups', '👥'], ['tv', '📺'], ['nonalc', '🥤'],
];
function highlightsFor(venue, dogNote, profile = {}) {
  const note = dogNote === undefined || dogNote === null ? null : String(dogNote).trim();
  const dogOn = !!venue.dog_friendly || note !== null;
  const short = note ? note.replace(/[.\s]+$/, '') : '';
  const dogText = !dogOn ? '' : note
    ? (short.length <= 48 ? (/^dogs?\b/i.test(short) ? short : 'Dogs: ' + short) : 'Dog policy: see details')
    : 'Dog-friendly';
  const text = {
    dog: dogText, kid: venue.kid_friendly ? 'Kid-friendly' : '', patio: venue.patio ? 'Patio' : '', lake: venue.lake_view ? 'Lake view' : '',
    gluten: venue.gluten_free ? 'Gluten-free options' : '', vegan: venue.vegan ? 'Vegan-friendly' : '', vegetarian: venue.vegetarian ? 'Vegetarian-friendly' : '',
    music: venue.live_music ? 'Live music' : '', groups: venue.great_groups ? 'Great for groups' : '', tv: venue.sports_tv ? 'Sports TV' : '',
    nonalc: venue.nonalcoholic ? 'Non-alcoholic options' : '',
  };
  const keys = Array.isArray(profile.highlightKeys) ? profile.highlightKeys : HIGHLIGHTS.map(([k]) => k);
  const out = [];
  for (const [key, icon] of HIGHLIGHTS) {
    if (!keys.includes(key)) continue;
    let label = text[key];
    if (label && profile.highlightLabels && profile.highlightLabels[key]) label = profile.highlightLabels[key];
    if (label) out.push([icon, label]);
  }
  return out.slice(0, profile.highlightMax || 4);
}

// The label of the deals tab and card, from what the venue really has.
function dealsWording(hasDeals, hasNights, nightKinds) {
  const trivia = nightKinds.includes('trivia');
  const onlyTrivia = hasNights && nightKinds.length > 0 && nightKinds.every((k) => k === 'trivia');
  if (hasDeals) return { tab: trivia ? 'Deals & trivia' : hasNights ? 'Deals & nights' : 'Deals', heading: hasNights ? 'Deals & good times 🍻' : 'Deals 🍻' };
  if (hasNights) return { tab: onlyTrivia ? 'Trivia' : 'Weekly nights', heading: '' };
  return { tab: '', heading: '' };
}

function renderFoodDrinkVenueLayout(parts) {
  const esc = parts.escapeHtml;
  const profile = parts.profile || {};
  const venue = parts.venue;
  const name = esc(venue.name);
  const short = profile.shortName ? esc(profile.shortName) : '';
  const fold = (label, html, extra = '') => html
    ? '<details class="fd-details ' + extra + '"><summary>' + label + '</summary>' + html + '</details>' : '';

  // Menu
  const menuExamples = parts.menuPicks.map((item) => {
    const options = [];
    if (/gluten[- ]free.*option/i.test(item.description || '')) options.push('Gluten-free option');
    if (/vegan.*option/i.test(item.description || '')) options.push('Vegan option');
    if (!options.length) options.push(...(item.dietary || []));
    const price = String(item.price || '').trim() ? '<span>' + esc(parts.formatPrice(item.price)) + '</span>' : '';
    return '<div><strong>' + esc(item.name) + '</strong>' + price
      + (options.length ? '<small>' + esc(options.join(' · ')) + '</small>' : '') + '</div>';
  }).join('');
  const ownMenuLink = parts.menuOwnUrl
    ? '<a class="fd-own-menu" href="' + esc(parts.menuOwnUrl) + '" target="_blank" rel="nofollow noopener">' + (parts.menuHtml ? 'See ' + (short || name) + '’s own menu' : 'See the menu') + ' ↗</a>' : '';
  let menu = '';
  if (parts.menuHtml) {
    menu = '<section class="fd-card" id="fdMenu"><div class="fd-section-title"><div>'
      + '<div class="fd-eyebrow">' + esc(profile.menuEyebrow || 'A look at the menu') + '</div><h2>On the menu 🍽️</h2></div>'
      + (menuExamples ? '<span class="fd-note">A few menu examples</span>' : '') + '</div>'
      + (menuExamples ? '<div class="fd-menu-picks">' + menuExamples + '</div>' : '')
      + '<a class="fd-full-menu" href="' + esc(parts.menuLink) + '">See the full menu (' + esc(parts.menuCountText) + ') →</a>' + ownMenuLink
      + fold('More menu details &amp; dietary options', parts.menuHtml) + '</section>';
  } else if (parts.menuOwnUrl) {
    menu = '<section class="fd-card" id="fdMenu"><h2>Menu &amp; prices 🍽️</h2><p>The latest menu and prices are on ' + (short || name) + '’s own website.</p>'
      + '<a class="fd-full-menu" href="' + esc(parts.menuOwnUrl) + '" target="_blank" rel="nofollow noopener">See the menu ↗</a></section>';
  }

  // Deals, specials and weekly nights
  // Every venue but Copper shows the page's own deals card (happy hour deals, weekly specials) as it is; Copper keeps its
  // approved arrangement of the same blocks.
  const useCard = typeof parts.dealsCardHtml === 'string';
  const hasDeals = useCard ? !!parts.dealsCardHtml : !!(parts.happyDealsHtml || parts.weeklySpecialsHtml);
  const hasNights = !!parts.weeklyNightsHtml;
  const dealsText = dealsWording(hasDeals, hasNights, parts.nightKinds || []);
  const dealsLabel = profile.dealsLabel || dealsText.tab;
  let deals = '';
  if ((hasDeals || hasNights) && useCard) {
    deals = '<section class="fd-card fd-deals" id="fdDeals">' + parts.dealsCardHtml + parts.weeklyNightsHtml + '</section>';
  } else if (hasDeals || hasNights) {
    deals = '<section class="fd-card" id="fdDeals">'
      + (dealsText.heading ? '<div class="fd-eyebrow">' + esc(profile.dealsEyebrow || (parts.happyDealsHtml ? 'Make a little time for happy hour' : 'This week')) + '</div><h2>' + esc(profile.dealsHeading || dealsText.heading) + '</h2>' : '')
      + (parts.happyDealsHtml ? '<div id="venueDeals">' + parts.happyDealsHtml + '</div>' : '')
      + fold('Weekly food &amp; drink specials', parts.weeklySpecialsHtml) + parts.weeklyNightsHtml + (parts.extraDealsHtml || '') + '</section>';
  }

  const hours = parts.hoursHtml ? '<div class="venue-section venue-hours" id="venueHours">' + parts.hoursHtml + '</div>' : '';

  // The tabs: only for sections this page really has, and only when there are at least two to move between.
  const tabs = [];
  if (parts.experienceHtml) tabs.push(['fdTastings', 'Tastings']);
  if (menu) tabs.push(['fdMenu', 'Menu']);
  if (deals) tabs.push(['fdDeals', dealsLabel]);
  if (hours) tabs.push(['venueHours', 'Hours']);
  const nav = tabs.length >= 2
    ? '<nav class="fd-section-nav" aria-label="' + name + ' sections"><a href="#fdOverview" aria-current="location">Overview</a>'
      + tabs.map(([id, label]) => '<a href="#' + id + '">' + esc(label) + '</a>').join('') + '</nav>' : '';

  // Main buttons
  const buttons = [];
  if (parts.primaryActionHtml) buttons.push(parts.primaryActionHtml.replace('class="cta secondary"', 'class="cta fd-menu-button"'));
  if (menu) buttons.push('<a class="cta fd-menu-button" href="#fdMenu">🍽️ Menu &amp; prices</a>');
  // Directions is the main button unless there is a menu button, which leads.
  if (parts.directionsHtml) buttons.push(menu || parts.primaryActionHtml ? parts.directionsHtml.replace('class="cta"', 'class="cta secondary"') : parts.directionsHtml);
  if (hours) buttons.push('<a class="cta secondary" href="#venueHours">🕒 Hours</a>');
  const ctaRow = buttons.length ? '<div class="venue-cta-row"' + parts.ctaRowAttrs + '>' + buttons.join('') + '</div>' : '';

  const highlights = parts.highlights.length
    ? '<div class="fd-highlights">' + parts.highlights.map(([icon, label]) => '<span>' + icon + ' ' + esc(label) + '</span>').join('') + '</div>' : '';
  // Copper turns its happy hour line into a jump to its deals; every other venue keeps the line as it is, under the open status.
  const happyLink = parts.happyHourHtml && deals && profile.happyHourLink
    ? parts.happyHourHtml.replace('<p class="venue-hh-status"', '<a href="#fdDeals" class="venue-hh-status fd-deal-link"').replace('</p>', ' →</a>')
    : parts.happyHourHtml;

  // Nearby
  const nearbyList = (cards) => cards.length ? '<ul class="nearby-list">' + cards.join('') + '</ul>' : '';
  const nearby = parts.nearbyCards.length || parts.relatedHtml || parts.nearbyHtml
    ? '<section class="fd-nearby" data-from-venue="' + Number(venue.id) + '"><div class="fd-section-title"><div><div class="fd-eyebrow">While you’re in the neighbourhood</div><h2>A little more to explore 🌿</h2></div>'
      + '<a href="/' + esc(venue.region) + '">Explore ' + esc(parts.regionLabel) + ' →</a></div>'
      + nearbyList(parts.nearbyCards.slice(0, 3))
      + fold('More nearby places', nearbyList(parts.nearbyCards.slice(3)) + parts.relatedHtml + parts.nearbyHtml) + '</section>' : '';

  // Plan your visit (2026-11-08): its own open card after the menu and deals, not inside "More about" where most
  // visitors never saw it. Same box, same rows: its own "More: ..." line still folds the extra rows in place.
  const visit = parts.visitHtml ? '<div class="fd-card fd-visit">' + parts.visitHtml + '</div>' : '';

  // More about the venue: the full description and everything that is not shown above
  const more = fold('More about ' + (short || name) + ' &amp; all venue features',
    parts.descriptionHtml + parts.badgesHtml + parts.dogNoteHtml + (profile.stripVerifiedDate ? parts.verifiedHtml : '') + parts.guideLinks + parts.ownerCtaHtml, 'fd-card');

  // Save and contact
  const contactRow = parts.contactActions.length ? '<div class="fd-actions fd-contact-actions"' + parts.ctaRowAttrs + '>' + parts.contactActions.join('') + '</div>' : '';
  const who = short || 'this place';
  const saveClauses = [parts.hasWebsite ? 'visit their website' : '', parts.hasPhone ? 'give them a call' : ''].filter(Boolean);
  const saveText = saveClauses.length
    ? saveClauses[0].charAt(0).toUpperCase() + saveClauses[0].slice(1) + (saveClauses[1] ? ', ' + saveClauses[1] : '') + ', or save ' + who + ' for your next outing.'
    : 'Save ' + who + ' for your next outing.';
  const saveCard = '<section class="fd-card fd-save-card"><h2>Keep this one handy 💛</h2><p>' + saveText + '</p>'
    + contactRow + (parts.saveActions ? '<div class="fd-actions fd-save-actions"' + parts.ctaRowAttrs + '>' + parts.saveActions + '</div>' : '')
    + (parts.saveActions ? '<p class="fd-save-help"><span id="fdFavoriteHelp"><strong>Favorite</strong> saves ' + who + ' for later.</span><span id="fdTripHelp"><strong>Add to trip</strong> puts ' + who + ' on your trip list.</span></p>' : '')
    + '</section>';

  const keyInfo = parts.detailRows ? '<div class="venue-section venue-key-info"><h2>Your visit, made easy</h2>' + parts.detailRows + '\n</div>' : '';
  const intro = profile.intro || parts.intro;
  const editorial = parts.editorialHtml ? '<div class="fd-card fd-editorial">' + parts.editorialHtml + '</div>' : '';
  const recognition = parts.recognitionHtml ? '<p class="chips fd-recognition">' + parts.recognitionHtml + '</p>' : '';
  const verifiedInSummary = profile.stripVerifiedDate ? parts.verifiedHtml.replace(/<span class="venue-verified-date">[\s\S]*?<\/span>/, '') : parts.verifiedHtml;
  return [
    '<div class="fd-layout"><div class="fd-content"><section class="fd-summary" id="fdOverview">',
    '<div class="venue-header"><h1 class="venue-desktop-title">' + name + '</h1><p class="venue-at-a-glance">' + parts.atAGlance + '</p>' + parts.openStatusHtml + (profile.happyHourLink ? '' : parts.happyHourHtml) + '</div>',
    recognition, parts.venueAdvisoryHtml || '',
    intro ? '<p class="venue-description">' + esc(intro) + '</p>' : '', parts.whyHtml || '',
    ctaRow, highlights, profile.happyHourLink ? happyLink : '', verifiedInSummary, '</section>',
    nav, parts.experienceHtml || '', menu, deals, ...(visit ? [visit] : []), editorial, more,
    fold('Upcoming events at ' + (short || name), parts.eventsHtml, 'fd-card'), profile.visitorFirst ? parts.visitorHtml : '',
    // The facts (map, phone, hours, save buttons) come before the visitor photos and tips in the page itself, for keyboard
    // and screen reader order (round 9 accessibility rule); Copper keeps its approved order.
    '</div><aside class="fd-aside">', keyInfo, parts.locationHtml, hours, saveCard, '</aside>',
    !profile.visitorFirst && parts.visitorHtml ? '<div class="fd-after">' + parts.visitorHtml + '</div>' : '', '</div>', nearby,
  ].join('\n');
}

module.exports = { renderFoodDrinkVenueLayout, introFrom, pickMenuExamples, menuPriceHint, priceLegend, highlightsFor, dealsWording };
