'use strict';
// Click sheet (2026-11-05): a fixed list of every kind of thing a visitor can click on a business page or an event page.
// The page script classifies each click into one of these keys (first matching selector wins) and tells the server the
// key only. The same list drives the owner dashboard's click sheet, so items nobody clicked show as zero.
// Nothing here identifies a visitor, and no free text is ever stored: the server accepts only keys from this list.

// [key, label shown on the dashboard, group, selector, pages it applies to]
const V = ['venue']; const E = ['event']; const B = ['venue', 'event'];
const RULES = [
  ['my_trip_button', 'My Trip button (top bar)', 'Top bar', '.nav-mytrip-btn', B],
  ['trip_tray', 'My Trip tray (open, route, clear, full trip)', 'Top bar', '#tripTray a, #tripTray button', B],
  ['language_switch', 'English / French switch', 'Top bar', '.venue-lang-switch a, .lang-toggle, .nav-lang-opt', B],
  ['menu_nav', 'Top menu (any menu link or button)', 'Top bar', 'header a, header button, nav:not(.breadcrumb) a, nav:not(.breadcrumb) button, .skip-link', B],
  ['footer_link', 'Footer (any link or button)', 'Footer', 'footer a, footer button', B],
  ['breadcrumb', 'Breadcrumb (Home / town / category)', 'Top of page', '.breadcrumb a', B],
  ['back_to_category', 'Back to the category list (top)', 'Top of page', '.venue-top-links a', V],
  ['photo_gallery', 'Photos (open, next, previous, close)', 'Photos', '[data-vg-open], .vg-dialog button', V],
  ['town_link', 'Town name under the title', 'Top of page', '.venue-at-a-glance a', V],
  ['see_hours', 'See hours', 'Top buttons', 'a[href="#venueHours"]', V],
  ['directions', 'Get directions', 'Top buttons', 'a[data-roam-directions]', B],
  ['website', 'Website', 'Top buttons', 'a[data-track~="website"]', V],
  ['booking', 'Book online / buy tickets', 'Top buttons', 'a[data-track~="booking"]', V],
  ['call_button', 'Call button', 'Top buttons', '.venue-cta-row a[data-track~="phone"]', V],
  ['phone_number', 'Phone number (in the details)', 'Details', 'a[data-track~="phone"]', V],
  ['cta_other', 'Another top button (see its name)', 'Top buttons', '.venue-cta-row a.cta', V],
  ['tickets_info', 'Tickets & info', 'Top buttons', '.event-cta-primary', E],
  ['add_to_calendar', 'Add to calendar', 'Top buttons', 'a[href$=".ics"]', E],
  ['add_to_google_calendar', 'Add to Google Calendar', 'Top buttons', 'a[data-gcal]', E],
  ['nearby_add_to_trip', 'Add to trip on a nearby place', 'Nearby places', '.nearby-card .trip-btn', V],
  ['favorite', 'Favorite', 'Top buttons', '.fav-btn', B],
  ['add_to_trip', 'Add to trip', 'Top buttons', '.trip-btn', B],
  ['social_link', 'Social link (Facebook, Instagram)', 'Details', '.venue-key-info a[href^="http"]', V],
  ['see_deals', 'See the deals and specials', 'Details', 'a[href="#venueDeals"]', V],
  ['more_details', 'More: games, to go, groups (open)', 'Details', 'details.visit-more summary', V],
  ['full_menu', 'See the full menu', 'Menu', 'a.vm-btn', V],
  ['share_photo_or_tip', 'Been here? Share a photo or tip', 'Visitor tips', '.vc-open', V],
  ['send_tip', 'Send a photo or tip', 'Visitor tips', '.vc-submit', V],
  ['featured_guide', 'Guide that features this place', 'Related', '.guide-featured-in a', V],
  ['more_like_this', 'More in town (Dog-Friendly, Patio, …)', 'Related', '.venue-more-in a', V],
  ['claim_listing', 'Claim this listing / owner sign-in', 'Owner', '#venueOwnerCta a, .venue-claim-btn', V],
  ['upcoming_event_here', 'Event at this place', 'Related', '#venue-events a, .venue-events-all a', V],
  ['nearby_place', 'Nearby place', 'Nearby places', '.nearby-card a', V],
  ['similar_place', 'Similar place (More breweries, etc.)', 'Related', '.related-card a', V],
  ['venue_or_town_link', 'Venue or town link (in the details)', 'Details', '.event-details a[href^="/"]', E],
  ['event_website', 'Event website (in the details)', 'Details', '.event-details a[href^="http"]', E],
  ['related_event', 'Another event in town', 'Related', '.event-related-list a', E],
  ['all_events_in_town', 'See what’s on in town', 'Related', '.event-related-all a', E],
  ['bottom_links', 'Bottom buttons (back to list, explore the town)', 'Bottom', 'a.cta', B],
  ['expand_section', 'Open a fold-out section', 'Other', 'summary', B],
  ['other_link', 'Any other link', 'Other', 'a', B],
  ['other_button', 'Any other button', 'Other', 'button', B],
];

const LABELS = RULES.map(([key, text, group, sel, pages]) => ({ key, text, group, sel, pages }));
const KEYS = new Set(LABELS.map((l) => l.key));
const labelsFor = (kind) => LABELS.filter((l) => l.pages.includes(kind));
const isKey = (k) => typeof k === 'string' && KEYS.has(k);

// Browser code, shared by business and event pages. report(key) is supplied by the page.
function clientClassifierJs() {
  const list = JSON.stringify(LABELS.map((l) => [l.key, l.sel, l.pages]));
  return `var ROAM_CLICKS = ${list};
  function roamClickKey(el, kind){
    for (var i = 0; i < ROAM_CLICKS.length; i++) {
      var r = ROAM_CLICKS[i];
      if (r[2].indexOf(kind) === -1) continue;
      try { if (el.matches(r[1])) return r[0]; } catch (e) {}
    }
    return null;
  }`;
}

module.exports = { LABELS, KEYS, labelsFor, isKey, clientClassifierJs };
