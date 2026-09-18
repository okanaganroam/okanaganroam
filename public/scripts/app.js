/* Okanagan Roam — SPA application script (Phase 5 Sprint 1)
 * Extracted verbatim from okanagan.html's original inline <script> blocks
 * (the main app logic block, plus the small wizard-scroll helper that
 * followed it). No logic changed, added, or removed during extraction. */

/* ---------- API-driven venue loading ----------
   Venues now live in a real database behind a REST API (see /okanagan-backend).
   This fetches them and renders the .venue-card markup that the rest of the
   page's scripts already expect, then runs all the page behaviors that
   depend on cards being in the DOM. Change API_BASE if you deploy the API
   somewhere other than localhost. */
var API_BASE = window.location.origin;

/* ---------- i18n: English / French language switching ----------
   Static UI strings live in TRANSLATIONS below, keyed by a dot-path (e.g.
   'nav.directory'). Elements opt in via data-i18n="key" (sets textContent)
   or data-i18n-placeholder="key" (sets the placeholder attribute). Venue
   descriptions use the separate description_fr field on each venue record,
   falling back to English when no translation exists yet for that venue —
   this UI/engine work covers the whole site, but populating description_fr
   for all 810 venues is a separate, much larger translation pass. */
var TRANSLATIONS = {
  en: {
    'nav.directory': 'Directory',
    'nav.listVenue': 'List Your Venue',
    'nav.appComingSoon': 'App coming soon',
    'hero.headline': 'Explore the Okanagan',
    'hero.lead': 'Okanagan Roam is your guide to the Okanagan Valley from Enderby to Osoyoos — including ski resorts, wineries, food, golf, beaches, events, adventures, and hidden gems, all in one place.',
    // Mobile hero polish, pass 1 (2026-09-18): shorter supporting copy shown
    // only at the mobile breakpoint -- hero.lead above is unchanged and
    // still the only copy desktop ever shows.
    'hero.leadMobile': 'Explore wineries, food, beaches, golf, adventures and hidden gems across the Okanagan.',
    'mood.heading': 'What are you in the mood for?',
    'mood.lead': 'Start with what sounds good. We\u2019ll help you find somewhere worth going.',
    'mood.golf.title': 'Golf',
    'mood.golf.desc': 'Tee off somewhere beautiful.',
    'mood.whatsOn.title': 'What\u2019s On',
    'mood.whatsOn.desc': 'See what\u2019s happening around the valley.',
    'mood.outdoors.title': 'Outdoors',
    'mood.wine.title': 'Wine',
    'mood.foodDrink.title': 'Food & Drink',
    'mood.beaches.title': 'Beaches',
    'mood.exploreAll': 'Explore all categories \u2192',
    'gems.heading': 'Hidden Gems',
    'gems.subtitle': 'Less crowds. More Okanagan.',
    'gems.viewAll': 'View all hidden gems \u2192',
    'gems.dogFriendly.title': 'Dog-Friendly Finds',
    'gems.dogFriendly.blurb': 'Patios and trails where your dog belongs.',
    'gems.localFavourites.title': 'Local Favourites',
    'gems.localFavourites.blurb': 'The spots locals keep coming back to.',
    'gems.secretSpots.title': 'Secret Spots',
    'gems.secretSpots.blurb': 'Quiet corners away from the crowds.',

    // Homepage header/nav (2026-09-17 localization pass): the reference-
    // redesign header (okanagan.html's <nav>) was built with plain
    // hardcoded English and no data-i18n wiring at all -- these keys wire
    // it up. "Hidden Gems"/"Explore the Okanagan" in the nav reuse
    // gems.heading/explore.heading below rather than a separate key,
    // since the text is identical to the section headings.
    'nav.discover': 'Discover',
    'nav.thingsToDo': 'Things to Do',
    'nav.browseSearch': 'Browse & Search',
    'nav.map': 'Map',
    'nav.homeAriaLabel': 'Okanagan Roam home',
    'nav.switchLanguage': 'Switch language',
    'nav.openMenu': 'Open menu',

    // Explore by Destination (2026-09-17 localization pass)
    'explore.heading': 'Explore by Destination',
    'explore.allRegions': 'Explore All Okanagan Regions \u2192',

    // Build Your Perfect Okanagan Trip (2026-09-17 localization pass)
    'trip.title': 'Build Your Perfect Okanagan Trip',
    'trip.lead': 'Tell us what you\u2019re looking for. We\u2019ll help build your adventure.',
    'trip.example': '\u201cI\u2019m in Kelowna for 3 days. I want golf, wineries, great food and patios, a beach, what\u2019s happening, and a few hidden gems.\u201d',
    'trip.buildMyTrip': 'Build My Trip',
    'trip.openMap': 'Open the interactive map',

    // Homepage footer (2026-09-17 localization pass) -- footer.about/
    // footer.regions/footer.listVenue/footer.contact/nav.appComingSoon/
    // homeFooter.explore/homeFooter.socialMedia already existed and are
    // reused as-is; these are the remaining pieces the audit found
    // untranslated. homeFooter.foodDrinks is deliberately separate from
    // mood.foodDrink.title -- the footer link's visible English text is
    // "Food & Drinks" (plural), the mood card's is "Food & Drink"
    // (singular); both are preserved exactly as they already render,
    // just each given its own real translation.
    'homeFooter.taglineFull': 'Okanagan Valley, British Columbia',
    'homeFooter.foodDrinks': 'Food & Drinks',
    'homeFooter.instagramAria': 'Okanagan Roam on Instagram',
    'homeFooter.tiktokAria': 'Okanagan Roam on TikTok',
    'homeFooter.comingSoon': 'Coming soon',
    'homeFooter.facebookAria': 'Facebook, coming soon',
    'homeFooter.copyright': '\u00a9 2026 Okanagan Roam. Built for the whole crew, dog included.',

    'search.placeholder': "Search a place, cuisine, or what you're craving",
    'search.mainLine': 'What are you looking for?',
    'search.subLine': 'Wineries, restaurants, hikes, beaches, hidden gems\u2026',
    'search.button': 'Search',

    // /browse redesign (2026-09-18): the "Browse & Search the Okanagan"
    // heading had no i18n coverage at all before this pass.
    'browse.eyebrow': 'Browse & search',
    'browse.heading': 'Browse & Search the Okanagan',
    'browse.lead': 'Every venue in the valley, filterable by region, category, and what matters to you.',

    'status.open': 'Open now',
    'status.closingSoon': 'Closing soon',
    'status.closed': 'Closed now',

    'wizard.step1Title': 'Where to?',
    'wizard.step2Title': 'What kind?',
    'wizard.step3Title': 'What matters?',
    'wizard.hint1': 'Pick as many regions as you like, then continue \u2014 or tap "Use my location" below to find the closest ones for you.',
    'wizard.hint2': 'Pick as many types as you like, then continue.',
    'wizard.hint3': 'Pick as many as you like, or skip straight to your results.',
    'wizard.showMe': 'Show me',
    'wizard.iNeed': 'I need',
    'wizard.wineries': 'Wineries',
    'wizard.breweries': 'Breweries',
    'wizard.restaurants': 'Restaurants',
    'wizard.cocktailLounges': 'Cocktail Lounges',
    'wizard.cafes': 'Cafes',
    'wizard.pubsAndBars': 'Pubs & Bars',
    'wizard.continue': 'Continue \u2192',
    'wizard.continueLabel': 'Continue',
    'wizard.seeResultsLabel': 'See results',
    'wizard.selected': 'selected',
    'wizard.back': '\u2190 Back',
    'wizard.seeResults': 'See results \u2192',
    'wizard.editChoices': '\u270e Edit my choices',
    'wizard.clearAll': 'Clear all',
    'wizard.cuisinePrice': '\u270e Cuisine / price',
    'wizard.search': '\ud83d\udd0d Search',
    'wizard.useMyLocation': '\ud83d\udccd Use my location',
    'wizard.allRegions': 'All regions',
    'wizard.near': 'Near',
    'wizard.central': 'Central',
    'wizard.south': 'South',
    'wizard.north': 'North',
    'wizard.skiResorts': 'Ski resorts',

    'stamp.dogFriendly': 'Dog-friendly',
    'stamp.veganMenu': 'Vegan menu',
    'stamp.vegetarianOptions': 'Vegetarian options',
    'stamp.patioAvailable': 'Patio available',
    'stamp.kidFriendly': 'Kid-friendly',
    'stamp.glutenFreeOptions': 'Gluten-free options',
    'stamp.lakeView': 'Lake/vineyard view',
    'stamp.sportsOnTv': 'Sports on TV',
    'stamp.liveMusic': 'Live music',
    'stamp.nonAlcoholicOptions': 'Non-alcoholic options',
    'stamp.greatForGroups': 'Great for groups',
    'stamp.happyHour': 'Has happy hour',
    'stamp.myFavorites': 'My favorites',

    'badge.dogFriendly': 'Dog-friendly',
    'badge.vegan': 'Vegan-friendly',
    'badge.vegetarian': 'Vegetarian options',
    'badge.glutenFree': 'Gluten-free options',
    'badge.patio': 'Patio',
    'badge.kidFriendly': 'Kid-friendly',
    'badge.lakeView': 'Lake/vineyard view',
    'badge.nonalcoholic': 'Non-alcoholic options',
    'badge.sportsTv': 'Sports on TV',
    'badge.liveMusic': 'Live music',
    'badge.greatGroups': 'Great for groups',
    'badge.happyHour': 'Happy hour',

    'type.restaurant': 'Restaurant',
    'type.winery': 'Winery',
    'type.brewery': 'Brewery',
    'type.pub': 'Pub/Bar',
    'type.cocktail': 'Cocktail Lounge',
    'type.cafe': 'Cafe',
    'type.golf': 'Golf',

    'filter.cuisine': 'Cuisine',
    'filter.price': 'Price',
    'filter.anyCuisine': 'Any cuisine',
    'filter.anyPrice': 'Any price',
    'filter.cheap': '$ Cheap',
    'filter.moderate': '$$ Moderate',
    'filter.expensive': '$$$ Expensive',

    'cuisine.bbq': 'BBQ',
    'cuisine.bubbleTea': 'Bubble Tea',
    'cuisine.caribbean': 'Caribbean',
    'cuisine.chinese': 'Chinese',
    'cuisine.dessert': 'Dessert & Ice Cream',
    'cuisine.ethiopian': 'Ethiopian',
    'cuisine.farmToTable': 'Farm-to-Table',
    'cuisine.filipino': 'Filipino',
    'cuisine.french': 'French',
    'cuisine.german': 'German',
    'cuisine.greek': 'Greek',
    'cuisine.indian': 'Indian',
    'cuisine.italian': 'Italian',
    'cuisine.japanese': 'Japanese',
    'cuisine.korean': 'Korean',
    'cuisine.latinAmerican': 'Latin American',
    'cuisine.lebanese': 'Lebanese',
    'cuisine.mediterranean': 'Mediterranean',
    'cuisine.mexican': 'Mexican',
    'cuisine.polish': 'Polish',
    'cuisine.portuguese': 'Portuguese',
    'cuisine.seafood': 'Seafood',
    'cuisine.spanish': 'Spanish',
    'cuisine.steakhouse': 'Steakhouse',
    'cuisine.thai': 'Thai',
    'cuisine.turkish': 'Turkish',
    'cuisine.ukrainian': 'Ukrainian',
    'cuisine.vietnamese': 'Vietnamese',

    'trip.label': 'Trip',
    'trip.yourTrip': 'Your trip',
    'trip.getRoute': 'Get route in Google Maps',
    'trip.clearTrip': 'Clear trip',
    'trip.emptyState': 'No venues added yet. Click "Add to trip" on any venue card.',
    'trip.addToTrip': '\ud83e\uddf3 Add to trip',
    'trip.inTrip': '\u2713 In trip',
    'trip.sameArea': 'Same area',
    'trip.kmToNextStop': 'km to next stop',

    'trip.planner.title': 'Build My Trip',
    'trip.planner.subtitle': 'Answer a few questions and we\u2019ll put together a real, day-by-day Okanagan itinerary from actual venues \u2014 no invented places, no AI guesswork.',
    'trip.planner.step1.label': 'Where are you going?',
    'trip.planner.regionPlaceholder': 'Choose a region\u2026',
    'trip.planner.step2.label': 'How long?',
    'trip.planner.daysSuffix': 'days',
    'trip.planner.step3.label': 'What do you love?',
    'trip.planner.step3.hint': 'Pick as many as you like \u2014 leave them all unchecked to see a bit of everything.',
    'trip.planner.step4.label': 'What\u2019s your pace?',
    'trip.planner.pace.relaxed': 'Relaxed',
    'trip.planner.pace.standard': 'Standard',
    'trip.planner.pace.packed': 'Packed',
    'trip.planner.generate': 'Generate My Trip',
    'trip.planner.generating': 'Building your itinerary\u2026',
    'trip.planner.regenerate': 'Regenerate',
    'trip.planner.yourItinerary': 'Your itinerary',
    'trip.planner.warningsHeading': 'A few notes about this trip:',
    'trip.planner.day': 'Day',
    'trip.planner.morning': 'Morning',
    'trip.planner.afternoon': 'Afternoon',
    'trip.planner.evening': 'Evening',
    'trip.planner.noVenue': 'No venue available for this slot.',
    'trip.planner.viewVenue': 'View venue',
    'trip.planner.removeStop': 'Remove',
    'trip.planner.errorNoRegion': 'Please choose a region first.',
    'trip.planner.errorDays': 'Number of days must be between 1 and 7.',
    'trip.planner.errorGeneric': 'Something went wrong building your trip. Please try again.',
    'trip.planner.errorNetwork': 'Couldn\u2019t reach Okanagan Roam \u2014 check your connection and try again.',

    'trip.conv.subtitle': 'Describe the trip you want in your own words, and we\u2019ll turn it into a real itinerary built from actual venues.',
    'trip.conv.placeholder': 'Plan me a relaxed 3-day trip around Kelowna with wine, dog-friendly places and hidden gems...',
    'trip.conv.submit': 'Plan My Trip',
    'trip.conv.examplesLabel': 'Or try one of these:',
    'trip.conv.example1': '3 relaxed days in Kelowna with wine and hidden gems',
    'trip.conv.example2': 'A weekend in Penticton with food, golf and a slower pace',
    'trip.conv.example3': '2 days around Vernon with wineries and dog-friendly places',
    'trip.conv.parsing': 'Reading your trip\u2026',
    'trip.conv.understoodHeading': 'Here\u2019s what I understood',
    'trip.conv.fieldRegion': 'Region',
    'trip.conv.fieldDays': 'Days',
    'trip.conv.fieldPace': 'Pace',
    'trip.conv.fieldInterests': 'Interests',
    'trip.conv.fieldAmenities': 'Amenities',
    'trip.conv.fieldDiscovery': 'Discovery',
    'trip.conv.fieldBudget': 'Budget',
    'trip.conv.budget.budget': 'Budget-friendly',
    'trip.conv.budget.moderate': 'Moderate',
    'trip.conv.budget.upscale': 'Upscale',
    'trip.conv.clarifyRegion': 'I can build that trip \u2014 which Okanagan region would you like to explore?',
    'trip.conv.clarifyDays': 'Got it \u2014 how many days would you like to spend (1\u20137)?',
    'trip.conv.clarifyBoth': 'I can build that trip \u2014 I just need a region and a number of days first.',
    'trip.conv.unsupportedIntro': 'A few things I can\u2019t help with yet:',
    'trip.conv.unsupportedBeaches': 'Beaches aren\u2019t currently available as a trip-planning preference yet.',
    'trip.conv.unsupportedGeneric': '\u201c{term}\u201d isn\u2019t a supported trip-planning filter yet.',
    'trip.conv.generate': 'Generate My Trip',
    'trip.conv.wizardToggle': 'Prefer to choose everything yourself? Plan it step by step \u2192',
    'trip.conv.removeChip': 'Remove',
    'trip.conv.errorEmpty': 'Tell us a bit about the trip you\u2019d like first.',
    'trip.conv.errorGeneric': 'Something went wrong understanding your trip. Please try again.',

    'card.getDirections': '\ud83d\udccd Get directions',
    'card.findMenu': '\ud83d\udccb Find menu',
    'card.checkBooking': '\ud83d\udcc5 Check for online booking',
    'card.favorite': 'Favorite',
    'card.favorited': 'Favorited',

    'map.openView': '\ud83d\uddfa\ufe0f Open the map view',
    'map.closeView': '\ud83d\uddfa\ufe0f Close the map view',
    'map.note': 'Pins mark each town/area center, not individual addresses, click a pin to see what\'s currently filtered there, then use "Get directions" on any venue for its exact location.',

    'results.heading': "Places you'll love",
    'results.placesToExplore': 'places to explore',
    'results.placeToExplore': 'place to explore',
    'results.sortFeatured': 'Sort: Featured order',
    'results.sortRating': 'Sort: Highest rated',
    'results.sortAz': 'Sort: A\u2013Z',
    'results.disclaimer': 'Every place below is a real Okanagan venue, pulled from live Google Places data and cross-checked against reviews for dog, patio, vegan, kid, gluten-free, and happy hour signals (only flagged when a review explicitly said so, not guessed). Covers the Central, South, and North Okanagan plus Big White, SilverStar, Apex, and Mount Baldy \u2014 1,000+ venues so far, including 195 of the region\u2019s 200+ wineries. It\u2019s still not every venue in the valley. Amenities change seasonally, happy hour is confirmed for a growing subset of venues (so that filter currently returns a limited set), and price level ($/$$/$$$) is confirmed for roughly a third of venues, with more being added regularly. Double check before you go.',
    'results.noResults': "Nothing matches that combo just yet, try clearing a filter and let's find you somewhere good.",

    'footer.directory': 'Directory',
    'footer.regions': 'Regions',
    'footer.about': 'About',
    'footer.followAlong': 'Follow Along',
    'footer.listVenue': 'List your venue',
    'footer.contact': 'Contact',

    // New homepage-only footer (2026-09-17): footer.directory/
    // footer.followAlong above are left untouched -- /browse still serves
    // the original static footer with those exact keys/values, and this
    // redesign must not change /browse. These two new keys are used only
    // by the new homepage footer's renamed headings ("Explore"/"Follow"),
    // so /browse is unaffected either way.
    'homeFooter.explore': 'Explore',
    'homeFooter.socialMedia': 'Social Media'
  },
  fr: {
    'nav.directory': 'R\u00e9pertoire',
    'nav.listVenue': '\u00c9crivez votre \u00e9tablissement',
    'nav.appComingSoon': 'Application bient\u00f4t disponible',
    'hero.headline': 'Explorez l\u2019Okanagan',
    // Corrected 2026-09-17: this used to be a leftover translation of an
    // older, shorter hero subtitle ("Find the places worth discovering")
    // that no longer matches the current English hero.lead at all. Now a
    // real Canadian French translation of the CURRENT English paragraph.
    'hero.lead': 'Okanagan Roam est votre guide de la vall\u00e9e de l\u2019Okanagan, d\u2019Enderby \u00e0 Osoyoos \u2014 stations de ski, vignobles, gastronomie, golf, plages, \u00e9v\u00e9nements, aventures et tr\u00e9sors cach\u00e9s, le tout au m\u00eame endroit.',
    'hero.leadMobile': 'D\u00e9couvrez vignobles, gastronomie, plages, golf, aventures et tr\u00e9sors cach\u00e9s partout dans l\u2019Okanagan.',
    'mood.heading': "Qu'est-ce qui vous tente aujourd'hui\u00a0?",
    'mood.lead': 'Commencez par ce qui vous fait envie. On vous aide \u00e0 trouver un endroit qui en vaut la peine.',
    'mood.golf.title': 'Golf',
    'mood.golf.desc': 'Jouez dans un cadre magnifique.',
    // Corrected 2026-09-17: "Quoi de neuf" reads as a casual "what's new
    // with you" greeting, not an events listing. "\u00c0 l'affiche" is the
    // standard Canadian French way to say "what's on/showing now."
    'mood.whatsOn.title': "\u00c0 l'affiche",
    'mood.whatsOn.desc': 'D\u00e9couvrez ce qui se passe dans la vall\u00e9e.',
    'mood.outdoors.title': 'Plein air',
    'mood.wine.title': 'Vin',
    'mood.foodDrink.title': 'Manger et boire',
    'mood.beaches.title': 'Plages',
    'mood.exploreAll': 'Voir toutes les cat\u00e9gories \u2192',
    'gems.heading': 'Tr\u00e9sors cach\u00e9s',
    'gems.subtitle': 'Moins de foule. Plus d\u2019Okanagan.',
    'gems.viewAll': 'Voir tous les tr\u00e9sors cach\u00e9s \u2192',
    'gems.dogFriendly.title': 'Chiens bienvenus',
    'gems.dogFriendly.blurb': 'Terrasses et sentiers o\u00f9 votre chien est le bienvenu.',
    'gems.localFavourites.title': 'Coups de c\u0153ur locaux',
    'gems.localFavourites.blurb': 'Les adresses o\u00f9 les gens du coin reviennent toujours.',
    'gems.secretSpots.title': 'Coins secrets',
    'gems.secretSpots.blurb': 'Des coins tranquilles, loin de la foule.',

    'nav.discover': 'D\u00e9couvrir',
    'nav.thingsToDo': '\u00c0 faire',
    'nav.browseSearch': 'Parcourir et rechercher',
    'nav.map': 'Carte',
    'nav.homeAriaLabel': 'Accueil Okanagan Roam',
    'nav.switchLanguage': 'Changer de langue',
    'nav.openMenu': 'Ouvrir le menu',

    'explore.heading': 'Explorez par destination',
    'explore.allRegions': 'Explorez toutes les r\u00e9gions de l\u2019Okanagan \u2192',

    'trip.title': 'Planifiez votre voyage parfait dans l\u2019Okanagan',
    'trip.lead': 'Dites-nous ce que vous recherchez. On vous aide \u00e0 planifier votre aventure.',
    'trip.example': '\u00ab\u00a0Je suis \u00e0 Kelowna pour 3 jours. Je veux du golf, des vignobles, de bons repas et des terrasses, une plage, des \u00e9v\u00e9nements, et quelques tr\u00e9sors cach\u00e9s.\u00a0\u00bb',
    'trip.buildMyTrip': 'Planifiez mon voyage',
    'trip.openMap': 'Ouvrir la carte interactive',

    'homeFooter.taglineFull': 'Vall\u00e9e de l\u2019Okanagan, Colombie-Britannique',
    'homeFooter.foodDrinks': 'Restauration',
    'homeFooter.instagramAria': 'Okanagan Roam sur Instagram',
    'homeFooter.tiktokAria': 'Okanagan Roam sur TikTok',
    'homeFooter.comingSoon': 'Bient\u00f4t disponible',
    'homeFooter.facebookAria': 'Facebook, bient\u00f4t disponible',
    'homeFooter.copyright': '\u00a9 2026 Okanagan Roam. Con\u00e7u pour toute la bande, chien inclus.',
    'search.placeholder': 'Recherchez un lieu, une cuisine ou une envie',
    'search.mainLine': 'Que recherchez-vous\u00a0?',
    'search.subLine': 'Vignobles, restaurants, randonn\u00e9es, plages, tr\u00e9sors cach\u00e9s\u2026',
    'search.button': 'Rechercher',

    'browse.eyebrow': 'Parcourir et rechercher',
    'browse.heading': 'Parcourez et recherchez dans l\u2019Okanagan',
    'browse.lead': 'Chaque \u00e9tablissement de la vall\u00e9e, filtrable par r\u00e9gion, cat\u00e9gorie et ce qui compte pour vous.',

    'status.open': 'Ouvert',
    'status.closingSoon': 'Ferme bient\u00f4t',
    'status.closed': 'Ferm\u00e9',

    'wizard.step1Title': 'O\u00f9 aller\u00a0?',
    'wizard.step2Title': 'Quel genre\u00a0?',
    'wizard.step3Title': 'Qu\u2019est-ce qui compte\u00a0?',
    'wizard.hint1': 'Choisissez autant de r\u00e9gions que vous le souhaitez, puis continuez \u2014 ou touchez \u00ab\u00a0Utiliser ma position\u00a0\u00bb ci-dessous pour trouver les plus proches.',
    'wizard.hint2': 'Choisissez autant de types que vous le souhaitez, puis continuez.',
    'wizard.hint3': 'Choisissez-en autant que vous voulez, ou passez directement \u00e0 vos r\u00e9sultats.',
    'wizard.showMe': 'Montrez-moi',
    'wizard.iNeed': 'J\u2019ai besoin de',
    'wizard.wineries': 'Vignobles',
    'wizard.breweries': 'Brasseries',
    'wizard.restaurants': 'Restaurants',
    'wizard.cocktailLounges': 'Bars \u00e0 cocktails',
    'wizard.cafes': 'Caf\u00e9s',
    'wizard.pubsAndBars': 'Pubs et bars',
    'wizard.continue': 'Continuer \u2192',
    'wizard.continueLabel': 'Continuer',
    'wizard.seeResultsLabel': 'Voir les r\u00e9sultats',
    'wizard.selected': 'choisi(s)',
    'wizard.back': '\u2190 Retour',
    'wizard.seeResults': 'Voir les r\u00e9sultats \u2192',
    'wizard.editChoices': '\u270e Modifier mes choix',
    'wizard.clearAll': 'Tout effacer',
    'wizard.cuisinePrice': '\u270e Cuisine / prix',
    'wizard.search': '\ud83d\udd0d Rechercher',
    'wizard.useMyLocation': '\ud83d\udccd Utiliser ma position',
    'wizard.allRegions': 'Toutes les r\u00e9gions',
    'wizard.near': 'Pr\u00e8s d\u2019ici',
    'wizard.central': 'Centre',
    'wizard.south': 'Sud',
    'wizard.north': 'Nord',
    'wizard.skiResorts': 'Stations de ski',

    'stamp.dogFriendly': 'Accepte les chiens',
    'stamp.veganMenu': 'Menu v\u00e9gane',
    'stamp.vegetarianOptions': 'Options v\u00e9g\u00e9tariennes',
    'stamp.patioAvailable': 'Terrasse disponible',
    'stamp.kidFriendly': 'Adapt\u00e9 aux enfants',
    'stamp.glutenFreeOptions': 'Options sans gluten',
    'stamp.lakeView': 'Vue sur le lac ou le vignoble',
    'stamp.sportsOnTv': 'Sports \u00e0 la t\u00e9l\u00e9',
    'stamp.liveMusic': 'Musique en direct',
    'stamp.nonAlcoholicOptions': 'Options sans alcool',
    'stamp.greatForGroups': 'Id\u00e9al pour les groupes',
    'stamp.happyHour': 'Offre l\u2019happy hour',
    'stamp.myFavorites': 'Mes favoris',

    'badge.dogFriendly': 'Accepte les chiens',
    'badge.vegan': 'V\u00e9gane',
    'badge.vegetarian': 'Options v\u00e9g\u00e9tariennes',
    'badge.glutenFree': 'Options sans gluten',
    'badge.patio': 'Terrasse',
    'badge.kidFriendly': 'Adapt\u00e9 aux enfants',
    'badge.lakeView': 'Vue sur le lac ou le vignoble',
    'badge.nonalcoholic': 'Options sans alcool',
    'badge.sportsTv': 'Sports \u00e0 la t\u00e9l\u00e9',
    'badge.liveMusic': 'Musique en direct',
    'badge.greatGroups': 'Id\u00e9al pour les groupes',
    'badge.happyHour': 'Happy hour',

    'type.restaurant': 'Restaurant',
    'type.winery': 'Vignoble',
    'type.brewery': 'Brasserie',
    'type.pub': 'Pub/Bar',
    'type.cocktail': 'Bar \u00e0 cocktails',
    'type.cafe': 'Caf\u00e9',
    'type.golf': 'Golf',

    'filter.cuisine': 'Cuisine',
    'filter.price': 'Prix',
    'filter.anyCuisine': 'Toute cuisine',
    'filter.anyPrice': 'Tout prix',
    'filter.cheap': '$ \u00c9conomique',
    'filter.moderate': '$$ Mod\u00e9r\u00e9',
    'filter.expensive': '$$$ \u00c9lev\u00e9',

    'cuisine.bbq': 'BBQ',
    'cuisine.bubbleTea': 'Th\u00e9 aux perles',
    'cuisine.caribbean': 'Cara\u00efbes',
    'cuisine.chinese': 'Chinoise',
    'cuisine.dessert': 'Desserts et crème glac\u00e9e',
    'cuisine.ethiopian': '\u00c9thiopienne',
    'cuisine.farmToTable': 'De la ferme \u00e0 la table',
    'cuisine.filipino': 'Philippine',
    'cuisine.french': 'Fran\u00e7aise',
    'cuisine.german': 'Allemande',
    'cuisine.greek': 'Grecque',
    'cuisine.indian': 'Indienne',
    'cuisine.italian': 'Italienne',
    'cuisine.japanese': 'Japonaise',
    'cuisine.korean': 'Cor\u00e9enne',
    'cuisine.latinAmerican': 'Latino-am\u00e9ricaine',
    'cuisine.lebanese': 'Libanaise',
    'cuisine.mediterranean': 'M\u00e9diterran\u00e9enne',
    'cuisine.mexican': 'Mexicaine',
    'cuisine.polish': 'Polonaise',
    'cuisine.portuguese': 'Portugaise',
    'cuisine.seafood': 'Fruits de mer',
    'cuisine.spanish': 'Espagnole',
    'cuisine.steakhouse': 'Grilladerie',
    'cuisine.thai': 'Tha\u00eflandaise',
    'cuisine.turkish': 'Turque',
    'cuisine.ukrainian': 'Ukrainienne',
    'cuisine.vietnamese': 'Vietnamienne',

    'trip.label': 'Voyage',
    'trip.yourTrip': 'Votre voyage',
    'trip.getRoute': 'Obtenir l\u2019itin\u00e9raire dans Google Maps',
    'trip.clearTrip': 'Effacer le voyage',
    'trip.emptyState': 'Aucun \u00e9tablissement ajout\u00e9 pour l\u2019instant. Cliquez sur \u00ab\u00a0Ajouter au voyage\u00a0\u00bb sur n\u2019importe quelle fiche.',
    'trip.addToTrip': '\ud83e\uddf3 Ajouter au voyage',
    'trip.inTrip': '\u2713 Dans le voyage',
    'trip.sameArea': 'M\u00eame secteur',
    'trip.kmToNextStop': 'km jusqu\u2019au prochain arr\u00eat',

    'trip.planner.title': 'Planifiez mon voyage',
    'trip.planner.subtitle': 'R\u00e9pondez \u00e0 quelques questions et nous cr\u00e9erons un itin\u00e9raire r\u00e9el, jour par jour, dans l\u2019Okanagan \u00e0 partir de vrais \u00e9tablissements \u2014 aucun lieu invent\u00e9, aucune supposition par IA.',
    'trip.planner.step1.label': 'O\u00f9 allez-vous?',
    'trip.planner.regionPlaceholder': 'Choisissez une r\u00e9gion\u2026',
    'trip.planner.step2.label': 'Pendant combien de temps?',
    'trip.planner.daysSuffix': 'jours',
    'trip.planner.step3.label': 'Qu\u2019aimez-vous?',
    'trip.planner.step3.hint': 'Choisissez-en autant que vous voulez \u2014 laissez tout d\u00e9coch\u00e9 pour voir un peu de tout.',
    'trip.planner.step4.label': 'Quel est votre rythme?',
    'trip.planner.pace.relaxed': 'D\u00e9tendu',
    'trip.planner.pace.standard': 'Standard',
    'trip.planner.pace.packed': 'Charg\u00e9',
    'trip.planner.generate': 'Planifier mon voyage',
    'trip.planner.generating': 'Cr\u00e9ation de votre itin\u00e9raire\u2026',
    'trip.planner.regenerate': 'Recommencer',
    'trip.planner.yourItinerary': 'Votre itin\u00e9raire',
    'trip.planner.warningsHeading': 'Quelques notes sur ce voyage\u00a0:',
    'trip.planner.day': 'Jour',
    'trip.planner.morning': 'Matin',
    'trip.planner.afternoon': 'Apr\u00e8s-midi',
    'trip.planner.evening': 'Soir',
    'trip.planner.noVenue': 'Aucun \u00e9tablissement disponible pour ce cr\u00e9neau.',
    'trip.planner.viewVenue': 'Voir l\u2019\u00e9tablissement',
    'trip.planner.removeStop': 'Retirer',
    'trip.planner.errorNoRegion': 'Veuillez d\u2019abord choisir une r\u00e9gion.',
    'trip.planner.errorDays': 'Le nombre de jours doit \u00eatre entre 1 et 7.',
    'trip.planner.errorGeneric': 'Une erreur est survenue lors de la cr\u00e9ation de votre voyage. Veuillez r\u00e9essayer.',
    'trip.planner.errorNetwork': 'Impossible de joindre Okanagan Roam \u2014 v\u00e9rifiez votre connexion et r\u00e9essayez.',

    'trip.conv.subtitle': 'D\u00e9crivez le voyage que vous souhaitez dans vos propres mots, et nous en ferons un itin\u00e9raire r\u00e9el \u00e0 partir de vrais \u00e9tablissements.',
    'trip.conv.placeholder': 'Planifiez-moi un voyage d\u00e9tendu de 3 jours autour de Kelowna avec du vin, des endroits qui acceptent les chiens et des tr\u00e9sors cach\u00e9s...',
    'trip.conv.submit': 'Planifier mon voyage',
    'trip.conv.examplesLabel': 'Ou essayez l\u2019un de ceux-ci\u00a0:',
    'trip.conv.example1': '3 jours d\u00e9tendus \u00e0 Kelowna avec du vin et des tr\u00e9sors cach\u00e9s',
    'trip.conv.example2': 'Une fin de semaine \u00e0 Penticton avec repas, golf et un rythme plus lent',
    'trip.conv.example3': '2 jours autour de Vernon avec des vignobles et des endroits qui acceptent les chiens',
    'trip.conv.parsing': 'Lecture de votre demande\u2026',
    'trip.conv.understoodHeading': 'Voici ce que j\u2019ai compris',
    'trip.conv.fieldRegion': 'R\u00e9gion',
    'trip.conv.fieldDays': 'Jours',
    'trip.conv.fieldPace': 'Rythme',
    'trip.conv.fieldInterests': 'Int\u00e9r\u00eats',
    'trip.conv.fieldAmenities': 'Commodit\u00e9s',
    'trip.conv.fieldDiscovery': 'D\u00e9couverte',
    'trip.conv.fieldBudget': 'Budget',
    'trip.conv.budget.budget': '\u00c9conomique',
    'trip.conv.budget.moderate': 'Mod\u00e9r\u00e9',
    'trip.conv.budget.upscale': 'Haut de gamme',
    'trip.conv.clarifyRegion': 'Je peux organiser ce voyage \u2014 quelle r\u00e9gion de l\u2019Okanagan aimeriez-vous explorer\u00a0?',
    'trip.conv.clarifyDays': 'Compris \u2014 combien de jours aimeriez-vous y passer (1 \u00e0 7)\u00a0?',
    'trip.conv.clarifyBoth': 'Je peux organiser ce voyage \u2014 j\u2019ai seulement besoin d\u2019une r\u00e9gion et d\u2019un nombre de jours.',
    'trip.conv.unsupportedIntro': 'Quelques \u00e9l\u00e9ments que je ne peux pas encore prendre en charge\u00a0:',
    'trip.conv.unsupportedBeaches': 'Les plages ne sont pas encore offertes comme pr\u00e9f\u00e9rence de planification de voyage.',
    'trip.conv.unsupportedGeneric': '\u00ab\u00a0{term}\u00a0\u00bb n\u2019est pas encore un filtre de planification de voyage pris en charge.',
    'trip.conv.generate': 'G\u00e9n\u00e9rer mon voyage',
    'trip.conv.wizardToggle': 'Vous pr\u00e9f\u00e9rez tout choisir vous-m\u00eame\u00a0? Planifiez \u00e9tape par \u00e9tape \u2192',
    'trip.conv.removeChip': 'Retirer',
    'trip.conv.errorEmpty': 'Dites-nous d\u2019abord un peu \u00e0 propos du voyage que vous souhaitez.',
    'trip.conv.errorGeneric': 'Une erreur est survenue lors de la compr\u00e9hension de votre voyage. Veuillez r\u00e9essayer.',

    'card.getDirections': '\ud83d\udccd Obtenir l\u2019itin\u00e9raire',
    'card.findMenu': '\ud83d\udccb Voir le menu',
    'card.checkBooking': '\ud83d\udcc5 V\u00e9rifier la r\u00e9servation en ligne',
    'card.favorite': 'Favori',
    'card.favorited': 'Ajout\u00e9 aux favoris',

    'map.openView': '\ud83d\uddfa\ufe0f Ouvrir la carte',
    'map.closeView': '\ud83d\uddfa\ufe0f Fermer la carte',
    'map.note': 'Les \u00e9pingles indiquent le centre de chaque ville ou secteur, pas les adresses exactes. Cliquez sur une \u00e9pingle pour voir ce qui y est actuellement filtr\u00e9, puis utilisez \u00ab\u00a0Obtenir l\u2019itin\u00e9raire\u00a0\u00bb sur n\u2019importe quel \u00e9tablissement pour son emplacement exact.',

    'results.heading': 'Des endroits \u00e0 aimer',
    'results.placesToExplore': '\u00e9tablissements \u00e0 explorer',
    'results.placeToExplore': '\u00e9tablissement \u00e0 explorer',
    'results.sortFeatured': 'Trier\u00a0: ordre vedette',
    'results.sortRating': 'Trier\u00a0: mieux not\u00e9s',
    'results.sortAz': 'Trier\u00a0: A\u2013Z',
    'results.disclaimer': 'Chaque endroit ci-dessous est un vrai \u00e9tablissement de l\u2019Okanagan, extrait des donn\u00e9es Google Places en direct et v\u00e9rifi\u00e9 dans les avis pour les indices chien, terrasse, vegan, enfant, sans gluten et happy hour (signal\u00e9 uniquement lorsqu\u2019un avis le mentionnait explicitement, jamais devin\u00e9). Couvre le Centre, le Sud et le Nord de l\u2019Okanagan ainsi que Big White, SilverStar, Apex et Mount Baldy \u2014 1 069 \u00e9tablissements \u00e0 ce jour, dont 195 des plus de 200 vignobles de la r\u00e9gion. Ce n\u2019est pas encore tous les \u00e9tablissements de la vall\u00e9e. Les commodit\u00e9s changent selon la saison, le happy hour est confirm\u00e9 pour un nombre croissant d\u2019\u00e9tablissements (ce filtre ne renverra donc qu\u2019un ensemble limit\u00e9 de r\u00e9sultats pour l\u2019instant), et le niveau de prix ($/$$/$$$) est confirm\u00e9 pour environ un tiers des \u00e9tablissements, avec plus \u00e0 venir r\u00e9guli\u00e8rement. V\u00e9rifiez avant de vous d\u00e9placer.',
    'results.noResults': 'Rien ne correspond \u00e0 cette combinaison pour l\u2019instant, essayez de retirer un filtre et trouvons-vous un bon endroit.',

    'footer.directory': 'R\u00e9pertoire',
    'footer.regions': 'R\u00e9gions',
    'footer.about': '\u00c0 propos',
    'footer.followAlong': 'Suivez-nous',
    'footer.listVenue': 'Inscrire votre \u00e9tablissement',
    'footer.contact': 'Contact',

    'homeFooter.explore': 'Explorer',
    'homeFooter.socialMedia': 'Réseaux sociaux'
  }
};

function getCurrentLang(){
  try { return window.localStorage.getItem('okanaganLang') || 'en'; } catch (e) { return 'en'; }
}

function t(key){
  var lang = getCurrentLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

function applyTranslations(){
  var lang = getCurrentLang();
  document.documentElement.setAttribute('lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  // data-i18n-aria/-title/-tooltip (2026-09-17 localization pass): the
  // i18n system previously had no way to translate aria-label/title/
  // data-tooltip attributes at all, only textContent and placeholder --
  // several real, user-facing accessibility strings (nav/logo/social
  // icon aria-labels, the Facebook "coming soon" tooltip) needed this.
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el){
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(function(el){
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  document.querySelectorAll('[data-i18n-tooltip]').forEach(function(el){
    el.setAttribute('data-tooltip', t(el.getAttribute('data-i18n-tooltip')));
  });
  var toggle = document.getElementById('langToggle');
  if (toggle) toggle.textContent = lang === 'fr' ? 'FR / EN' : 'EN / FR';

  // The three wizard "Continue"/"See results" buttons show a live selected
  // count and are managed entirely by updateCount() (scoped inside a later
  // IIFE, not reachable from here), so re-derive their text directly here
  // rather than only via data-i18n, otherwise they'd stay in the old
  // language until the visitor next clicks through a step.
  [
    { id: 'wizardTo2', selector: '.region-chip', panelId: 'wizardStep1', key: 'wizard.continueLabel', excludeAll: true },
    { id: 'wizardTo3', selector: '.type-chip', panelId: 'wizardStep2', key: 'wizard.continueLabel', excludeAll: false },
    { id: 'wizardToResults', selector: '.stamp-btn', panelId: 'wizardStep3', key: 'wizard.seeResultsLabel', excludeAll: false }
  ].forEach(function(cfg){
    var btn = document.getElementById(cfg.id);
    var panel = document.getElementById(cfg.panelId);
    if (!btn || !panel) return;
    var count = 0;
    panel.querySelectorAll(cfg.selector).forEach(function(el){
      if (cfg.excludeAll && el.dataset.region === 'all') return;
      if (el.getAttribute('aria-pressed') === 'true') count++;
    });
    var base = t(cfg.key);
    btn.textContent = count > 0 ? base + ' (' + count + ' ' + t('wizard.selected') + ') \u2192' : base + ' \u2192';
  });

  // Same idea for the map toggle button — its label depends on whether the
  // map panel is currently open, a piece of state that lives on the DOM
  // (a CSS class) rather than in a reachable JS closure.
  var mapToggleBtn = document.getElementById('mapToggleBtn');
  var mapPanel = document.getElementById('mapPanel');
  if (mapToggleBtn && mapPanel) {
    var mapIsOpen = mapPanel.classList.contains('open');
    mapToggleBtn.textContent = mapIsOpen ? t('map.closeView') : t('map.openView');
  }
}

function setLanguage(lang){
  try { window.localStorage.setItem('okanaganLang', lang); } catch (e) {}
  if (window.trackEvent) window.trackEvent('language_change', { language: lang });
  applyTranslations();
  // Update existing venue cards in place rather than rebuilding them.
  // renderVenueCards() would destroy and recreate every .venue-card, but
  // the directions/menu/booking/phone/trip/favorite elements on each card
  // are added afterward by initBlock11 (and other initBlocks attach click
  // listeners to persistent filter chips that must only ever be bound
  // once) — a full re-render would lose those without a much larger
  // refactor, and re-running the initBlocks would double-bind those
  // listeners. Swapping just the description and status text avoids both
  // problems.
  if (window.__allVenues) {
    var venuesByName = {};
    window.__allVenues.forEach(function(v){ venuesByName[v.name] = v; });
    document.querySelectorAll('.venue-card').forEach(function(card){
      var v = venuesByName[card.dataset.name];
      if (!v) return;
      var descEl = card.querySelector('.venue-desc');
      if (descEl) {
        descEl.textContent = (lang === 'fr' && v.description_fr) ? v.description_fr : (v.description || '');
      }
      var meta = card.querySelector('.venue-region');
      if (meta) appendOpenStatusToMeta(meta, v.hours);
      var typeEl = card.querySelector('.venue-type');
      if (typeEl) typeEl.textContent = t(CARD_TYPE_LABEL[v.type]) || v.type;
      var badgeRow = card.querySelector('.badge-row');
      if (badgeRow) {
        badgeRow.innerHTML = CARD_BADGES.filter(function(b){ return v[b.field]; }).map(function(b){
          var content = b.text ? '<span class="badge-text-icon">' + b.text + '</span>' : b.icon;
          var label = escapeAttr(t(b.label));
          return '<span class="badge" aria-label="' + label + '" data-tooltip="' + label + '">' + content + '</span>';
        }).join('');
      }
    });
    // The 10 "Featured this month" cards are static HTML, not built by
    // venueCardHtml(), and use a differently-named type-badge class — same
    // refresh, just a different selector.
    document.querySelectorAll('.featured-card').forEach(function(card){
      var v = venuesByName[card.dataset.name];
      if (!v) return;
      var typeEl = card.querySelector('.featured-type');
      if (typeEl) typeEl.textContent = t(CARD_TYPE_LABEL[v.type]) || v.type;
      var badgeRow = card.querySelector('.badge-row');
      if (badgeRow) {
        badgeRow.innerHTML = CARD_BADGES.filter(function(b){ return v[b.field]; }).map(function(b){
          var content = b.text ? '<span class="badge-text-icon">' + b.text + '</span>' : b.icon;
          var label = escapeAttr(t(b.label));
          return '<span class="badge" aria-label="' + label + '" data-tooltip="' + label + '">' + content + '</span>';
        }).join('');
      }
    });
    applyOpenStatusToHeroAndFeatured(window.__allVenues);
  }
  if (window.__syncTripButtons) window.__syncTripButtons();
  if (window.__renderTripTray) window.__renderTripTray();
  if (window.__syncFavButtons) window.__syncFavButtons();
  if (window.__applyFilters) window.__applyFilters();
  if (window.__renderTripConvUnderstood) window.__renderTripConvUnderstood();
}

(function(){
  applyTranslations();
  var toggle = document.getElementById('langToggle');
  if (!toggle) return;
  toggle.addEventListener('click', function(){
    setLanguage(getCurrentLang() === 'fr' ? 'en' : 'fr');
  });
})();

// Computes whether a venue is open right now, based on its stored weekly
// hours. Always evaluated in Pacific time (where the venues actually are),
// not the visitor's own browser timezone — someone browsing from London
// should see Okanagan's real current status, not their own local time.
//
// Also checks the PREVIOUS day's hours for overnight windows that started
// yesterday and are still running (e.g. a bar open Thu 6pm-1am is still
// "Thursday's window" at 12:30am Friday — checking only today's key alone
// would miss this and wrongly report closed).
//
// Returns 'open', 'closing-soon' (within 60 min of close), 'closed', or
// null if no hours data exists for this venue.
var DAY_ORDER = ['sun','mon','tue','wed','thu','fri','sat'];
var CLOSING_SOON_THRESHOLD_MINUTES = 60;

function checkHoursWindow(open, close, currentMinutes, isYesterday){
  var openMin = parseInt(open.split(':')[0]) * 60 + parseInt(open.split(':')[1]);
  var closeMin = parseInt(close.split(':')[0]) * 60 + parseInt(close.split(':')[1]);
  var isOvernight = closeMin < openMin;

  if (isYesterday) {
    // Only an overnight window from yesterday can still be active now.
    if (!isOvernight || currentMinutes >= closeMin) return null;
    var minsLeftY = closeMin - currentMinutes;
    return minsLeftY <= CLOSING_SOON_THRESHOLD_MINUTES ? 'closing-soon' : 'open';
  }

  if (isOvernight) {
    if (currentMinutes < openMin) return null;
    var minsLeft = (closeMin + 24 * 60) - currentMinutes;
    return minsLeft <= CLOSING_SOON_THRESHOLD_MINUTES ? 'closing-soon' : 'open';
  }

  if (currentMinutes >= openMin && currentMinutes < closeMin) {
    var minsLeft2 = closeMin - currentMinutes;
    return minsLeft2 <= CLOSING_SOON_THRESHOLD_MINUTES ? 'closing-soon' : 'open';
  }
  return null;
}

function computeOpenStatus(hoursJson, testDate){
  if (!hoursJson) return null;
  var hours;
  try { hours = JSON.parse(hoursJson); } catch (e) { return null; }

  var now = testDate || new Date();
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);

  var map = {};
  parts.forEach(function(p){ map[p.type] = p.value; });

  var dayMap = { 'Mon':'mon','Tue':'tue','Wed':'wed','Thu':'thu','Fri':'fri','Sat':'sat','Sun':'sun' };
  var dayKey = dayMap[map.weekday];
  var yesterdayKey = DAY_ORDER[(DAY_ORDER.indexOf(dayKey) + 6) % 7];
  var hourNum = parseInt(map.hour) === 24 ? 0 : parseInt(map.hour);
  var currentMinutes = hourNum * 60 + parseInt(map.minute);

  var yesterdayWindows = hours[yesterdayKey];
  if (yesterdayWindows) {
    for (var j = 0; j < yesterdayWindows.length; j++) {
      var resultY = checkHoursWindow(yesterdayWindows[j][0], yesterdayWindows[j][1], currentMinutes, true);
      if (resultY) return resultY;
    }
  }

  var todayWindows = hours[dayKey];
  if (todayWindows) {
    for (var i = 0; i < todayWindows.length; i++) {
      var result = checkHoursWindow(todayWindows[i][0], todayWindows[i][1], currentMinutes, false);
      if (result) return result;
    }
  }
  return 'closed';
}

var CARD_REGION_LABEL = {
  "kelowna": "Kelowna", "west-kelowna": "West Kelowna", "peachland": "Peachland",
  "naramata": "Naramata Bench", "penticton": "Penticton", "okanagan-falls": "Okanagan Falls",
  "summerland": "Summerland", "oliver": "Oliver", "osoyoos": "Osoyoos", "vernon": "Vernon",
  "big-white": "Big White", "silverstar": "SilverStar", "apex": "Apex", "baldy": "Mount Baldy",
  "lake-country": "Lake Country", "coldstream": "Coldstream", "lumby": "Lumby",
  "armstrong": "Armstrong", "enderby": "Enderby", "kaleden": "Kaleden"
};

var CARD_TYPE_LABEL = {
  "restaurant": "type.restaurant", "winery": "type.winery", "brewery": "type.brewery",
  "pub": "type.pub", "cocktail": "type.cocktail", "cafe": "type.cafe"
};

var CARD_BADGES = [
  { field: 'dog_friendly', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="8" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="17" cy="8" r="1.6"/><circle cx="19" cy="12.5" r="1.6"/><path d="M8 17c-1.5-3 1-6 4-6s5.5 3 4 6c-.8 1.6-2.5 1.5-4 .7-1.5.8-3.2.9-4-.7z"/></svg>', label: 'badge.dogFriendly' },
  { field: 'vegan', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6c0 8-6 14-14 14C4 12 10 6 18 6z"/><path d="M6 20c2-4 5-8 10-11"/></svg>', label: 'badge.vegan' },
  { field: 'vegetarian', text: 'VG', label: 'badge.vegetarian' },
  { field: 'gluten_free', text: 'GF', label: 'badge.glutenFree' },
  { field: 'patio', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M4 12a8 8 0 0 1 16 0z"/><path d="M12 12v9"/><path d="M9 21h6"/></svg>', label: 'badge.patio' },
  { field: 'kid_friendly', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="14" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><path d="M8 21c-1-4 0-9 4-9s5 5 4 9"/></svg>', label: 'badge.kidFriendly' },
  { field: 'lake_view', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="6" r="2"/><path d="M3 18l6-9 4 5 2-3 6 7z"/><path d="M3 20.5h18"/></svg>', label: 'badge.lakeView' },
  { field: 'nonalcoholic', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14l-7 9z"/><path d="M12 13v6"/><path d="M8 20h8"/></svg>', label: 'badge.nonalcoholic' },
  { field: 'sports_tv', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M8 21h8"/></svg>', label: 'badge.sportsTv' },
  { field: 'live_music', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>', label: 'badge.liveMusic' },
  { field: 'great_groups', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 5 18.5V20"/><circle cx="9.5" cy="7.5" r="3.2"/><path d="M20 20v-1.5a3.2 3.2 0 0 0-2.2-3"/><path d="M15 4.3a3.2 3.2 0 0 1 0 6.1"/></svg>', label: 'badge.greatGroups' },
  { field: 'happy_hour', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', label: 'badge.happyHour' }
];

function formatTime12h(t){
  var parts = t.split(':');
  var h = parseInt(parts[0]);
  var m = parts[1];
  var period = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12; if (h12 === 0) h12 = 12;
  return h12 + (m === '00' ? '' : ':' + m) + ' ' + period;
}

function formatWeeklyHoursTooltip(hoursJson){
  if (!hoursJson) return '';
  var hours;
  try { hours = JSON.parse(hoursJson); } catch (e) { return ''; }
  var dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
  var dayOrder = ['mon','tue','wed','thu','fri','sat','sun'];
  var lines = dayOrder.map(function(day){
    var windows = hours[day];
    var label = dayLabels[day];
    if (!windows) return label + ': Closed';
    var windowStrs = windows.map(function(w){ return formatTime12h(w[0]) + '\u2013' + formatTime12h(w[1]); });
    return label + ': ' + windowStrs.join(', ');
  });
  return lines.join('\n');
}

function escapeAttr(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function venueCardHtml(v){
  var regionLabel = CARD_REGION_LABEL[v.region] || v.region;
  var typeLabel = t(CARD_TYPE_LABEL[v.type]) || v.type;
  var ratingHtml = v.rating != null
    ? ' &middot; <span class="mono" style="color:var(--amber); font-weight:700;">&#9733; ' + v.rating + '</span>'
    : '';
  var cuisineHtml = v.cuisine
    ? ' &middot; <span class="mono" style="color:var(--plum); font-weight:700;">' + escapeAttr(v.cuisine) + '</span>'
    : '';

  var openStatus = computeOpenStatus(v.hours);
  var openStatusHtml = '';
  if (openStatus) {
    var hoursTooltip = escapeAttr(formatWeeklyHoursTooltip(v.hours));
    if (openStatus === 'open') {
      openStatusHtml = ' &middot; <span class="open-status open-status-open" data-tooltip="' + hoursTooltip + '">' + t('status.open') + '</span>';
    } else if (openStatus === 'closing-soon') {
      openStatusHtml = ' &middot; <span class="open-status open-status-closing-soon" data-tooltip="' + hoursTooltip + '">' + t('status.closingSoon') + '</span>';
    } else if (openStatus === 'closed') {
      openStatusHtml = ' &middot; <span class="open-status open-status-closed" data-tooltip="' + hoursTooltip + '">' + t('status.closed') + '</span>';
    }
  }

  var badgesHtml = CARD_BADGES.filter(function(b){ return v[b.field]; }).map(function(b){
    var content = b.text ? '<span class="badge-text-icon">' + b.text + '</span>' : b.icon;
    var label = escapeAttr(t(b.label));
    return '<span class="badge" aria-label="' + label + '" data-tooltip="' + label + '">' + content + '</span>';
  }).join('');

  return '' +
    '<article class="venue-card" data-name="' + escapeAttr(v.name) + '" data-region="' + escapeAttr(v.region) + '" data-type="' + escapeAttr(v.type) + '"' +
    ' data-dog="' + (v.dog_friendly ? 1 : 0) + '" data-vegan="' + (v.vegan ? 1 : 0) + '" data-vegetarian="' + (v.vegetarian ? 1 : 0) + '"' +
    ' data-patio="' + (v.patio ? 1 : 0) + '" data-kids="' + (v.kid_friendly ? 1 : 0) + '" data-gluten="' + (v.gluten_free ? 1 : 0) + '"' +
    ' data-view="' + (v.lake_view ? 1 : 0) + '" data-nonalc="' + (v.nonalcoholic ? 1 : 0) + '"' +
    ' data-price="' + (v.price != null ? v.price : '') + '" data-reviews="' + (v.reviews != null ? v.reviews : '') + '"' +
    ' data-phone="' + escapeAttr(v.phone || '') + '" data-cuisine="' + escapeAttr(v.cuisine || '') + '"' +
    ' data-sports="' + (v.sports_tv ? 1 : 0) + '" data-music="' + (v.live_music ? 1 : 0) + '"' +
    ' data-groups="' + (v.great_groups ? 1 : 0) + '" data-happy_hour="' + (v.happy_hour ? 1 : 0) + '">' +
    '<div class="venue-top"><div><span class="venue-type type-' + v.type + '">' + typeLabel + '</span><h3>' + escapeAttr(v.name) + '</h3>' +
    '<div class="venue-region">' + regionLabel + ratingHtml + cuisineHtml + openStatusHtml + '</div></div></div>' +
    '<p class="venue-desc">' + escapeAttr((getCurrentLang() === 'fr' && v.description_fr) ? v.description_fr : (v.description || '')) + '</p>' +
    '<div class="badge-row">' + badgesHtml + '</div>' +
    '</article>';
}

// Hero scenes and Featured-this-month cards are static HTML (not built from
// venueCardHtml), so they don't get an open-status badge for free. This
// looks each one up by name against the venues just fetched from the API,
// and appends the same real-time badge + hours tooltip used on the main
// grid cards. Skips silently if a venue isn't found or has no hours data.
function appendOpenStatusToMeta(metaEl, hoursJson){
  var status = computeOpenStatus(hoursJson);
  // Remove any status span (and its preceding separator dot) from a prior
  // call, so re-running this on a language switch updates in place instead
  // of appending a second badge.
  var existing = metaEl.querySelector('.open-status');
  if (existing) {
    var prev = existing.previousSibling;
    if (prev && prev.nodeType === 3) metaEl.removeChild(prev);
    metaEl.removeChild(existing);
  }
  if (!status) return;
  var cls = status === 'open' ? 'open-status-open' : (status === 'closing-soon' ? 'open-status-closing-soon' : 'open-status-closed');
  var label = status === 'open' ? t('status.open') : (status === 'closing-soon' ? t('status.closingSoon') : t('status.closed'));
  var span = document.createElement('span');
  span.className = 'open-status ' + cls;
  span.setAttribute('data-tooltip', formatWeeklyHoursTooltip(hoursJson));
  span.textContent = label;
  metaEl.appendChild(document.createTextNode(' \u00b7 '));
  metaEl.appendChild(span);
}

function applyOpenStatusToHeroAndFeatured(venues){
  var venuesByName = {};
  venues.forEach(function(v){ venuesByName[v.name] = v; });

  document.querySelectorAll('.hero-scene[data-venue-name]').forEach(function(scene){
    var venue = venuesByName[scene.getAttribute('data-venue-name')];
    if (!venue) return;
    var meta = scene.querySelector('.hero-caption-meta');
    if (meta) appendOpenStatusToMeta(meta, venue.hours);
  });

  document.querySelectorAll('.featured-card[data-name]').forEach(function(card){
    var venue = venuesByName[card.getAttribute('data-name')];
    if (!venue) return;
    var meta = card.querySelector('.featured-meta');
    if (meta) appendOpenStatusToMeta(meta, venue.hours);
  });
}

function renderVenueCards(venues){
  var grid = document.getElementById('venueGrid');
  if (!grid) return;
  grid.innerHTML = venues.map(venueCardHtml).join('');
}

async function loadVenuesAndInit(){
  var grid = document.getElementById('venueGrid');
  try {
    var res = await fetch(API_BASE + '/api/venues?limit=5000');
    if (!res.ok) throw new Error('API responded with ' + res.status);
    var data = await res.json();
    window.__allVenues = data.venues;
    renderVenueCards(data.venues);
    applyOpenStatusToHeroAndFeatured(data.venues);
  } catch (err) {
    console.error('Could not load venues from the API:', err);
    if (grid) {
      grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:rgba(42,32,25,0.7);">' +
        'Couldn\u2019t load venues. Make sure the Okanagan Roam API is running at ' + API_BASE + ' (see /okanagan-backend/README.md).' +
        '</p>';
    }
  }

  // These run regardless of whether the venue fetch succeeded, so the
  // wizard, search box, and filter controls stay usable even if the API
  // is briefly unreachable — they just won't have cards to filter yet.
  initBlock1();
  initBlock2();
  initBlock3();
  initBlock4();
  initBlock5();
  initBlock6();
  initBlock7();
  initBlock8();
  initBlock9();
  initBlock10();
  initBlock11();
  initBlock12();
}

function initBlock1(){
  // The wizard/results grid only render on /browse now (see the
  // architecture-change comment on the / route in server.js) -- on the
  // homepage there's nothing here to wire up. Returning early (rather than
  // leaving the unguarded cuisineFilter/clearBtn listeners below to throw)
  // matters beyond this function alone: initBlock1-12 run as a plain
  // synchronous sequence in loadVenuesAndInit(), so an uncaught throw here
  // would also silently skip every block after it, including initBlock3's
  // mobile nav toggle, which must keep working on every page.
  if (!document.getElementById('searchInput')) return;
  var activeTypes = new Set();
  var activeFilters = new Set();
  var activeRegions = new Set();
  var activeCuisine = 'all';
  var activePrice = 'all';
  var searchTerm = '';
  var favoritesOnly = false;

  var typeBtns = document.querySelectorAll('.type-chip');
  var stampBtns = document.querySelectorAll('.stamp-btn');
  var regionBtns = document.querySelectorAll('.region-chip');
  var priceBtns = document.querySelectorAll('.price-chip');
  var cuisineFilter = document.getElementById('cuisineFilter');
  var favoritesOnlyBtn = document.getElementById('favoritesOnlyBtn');
  var cards = document.querySelectorAll('.venue-card');
  var resultsCount = document.getElementById('resultsCount');
  var noResults = document.getElementById('noResults');
  var searchInput = document.getElementById('searchInput');
  var searchBtn = document.getElementById('searchBtn');
  var clearBtn = document.getElementById('clearFilters');

  typeBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var t = btn.dataset.type;
      var pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!pressed));
      if(pressed){ activeTypes.delete(t); } else { activeTypes.add(t); if (window.trackEvent) window.trackEvent('select_venue_type', { venue_type: t }); }
      applyFilters();
    });
  });

  stampBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var f = btn.dataset.filter;
      var pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!pressed));
      if(pressed){ activeFilters.delete(f); } else { activeFilters.add(f); if (window.trackEvent) window.trackEvent('select_filter', { filter_name: f }); }
      applyFilters();
    });
  });

  regionBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      if (btn.dataset.region === 'all') {
        activeRegions.clear();
        regionBtns.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.region === 'all' ? 'true' : 'false'); });
        applyFilters();
        return;
      }
      var pressed = btn.getAttribute('aria-pressed') === 'true';
      if (pressed) {
        activeRegions.delete(btn.dataset.region);
        btn.setAttribute('aria-pressed', 'false');
      } else {
        activeRegions.add(btn.dataset.region);
        btn.setAttribute('aria-pressed', 'true');
        if (window.trackEvent) window.trackEvent('select_region', { region: btn.dataset.region });
      }
      var allBtn = document.querySelector('.region-chip[data-region="all"]');
      if (allBtn) allBtn.setAttribute('aria-pressed', activeRegions.size === 0 ? 'true' : 'false');
      applyFilters();
    });
  });

  priceBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      priceBtns.forEach(function(b){ b.setAttribute('aria-pressed','false'); });
      btn.setAttribute('aria-pressed','true');
      activePrice = btn.dataset.price;
      applyFilters();
    });
  });

  cuisineFilter.addEventListener('change', function(){
    activeCuisine = cuisineFilter.value;
    applyFilters();
  });

  if (favoritesOnlyBtn) {
    favoritesOnlyBtn.addEventListener('click', function(){
      favoritesOnly = !favoritesOnly;
      favoritesOnlyBtn.setAttribute('aria-pressed', String(favoritesOnly));
      applyFilters();
    });
  }

  clearBtn.addEventListener('click', function(){
    activeTypes.clear();
    activeFilters.clear();
    typeBtns.forEach(function(b){ b.setAttribute('aria-pressed','false'); });
    stampBtns.forEach(function(b){ b.setAttribute('aria-pressed','false'); });
    regionBtns.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.region === 'all' ? 'true':'false'); });
    priceBtns.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.price === 'all' ? 'true':'false'); });
    favoritesOnly = false;
    if (favoritesOnlyBtn) favoritesOnlyBtn.setAttribute('aria-pressed','false');
    activeRegions.clear();
    activeCuisine = 'all';
    activePrice = 'all';
    cuisineFilter.value = 'all';
    searchTerm = '';
    searchInput.value = '';
    applyFilters();
    document.dispatchEvent(new Event('wizard:reset'));
  });

  function runSearch(){
    searchTerm = searchInput.value.trim().toLowerCase();
    applyFilters();
    if (searchTerm) {
      if (window.trackEvent) window.trackEvent('search', { search_term: searchTerm });
      document.dispatchEvent(new Event('wizard:showResults'));
      if (window.__hideFilterBarNow) window.__hideFilterBarNow();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ runSearch(); } });

  function applyFilters(){
    var visibleCount = 0;
    cards.forEach(function(card){
      var matchesType = activeTypes.size === 0 || activeTypes.has(card.dataset.type);

      var matchesFilters = true;
      activeFilters.forEach(function(f){
        if(card.dataset[f] !== '1'){ matchesFilters = false; }
      });

      var matchesRegion = activeRegions.size === 0 || activeRegions.has(card.dataset.region);
      var matchesCuisine = activeCuisine === 'all' || card.dataset.cuisine === activeCuisine;
      var matchesPrice = activePrice === 'all' || card.dataset.price === activePrice;
      var matchesSearch = !searchTerm ||
        card.dataset.name.toLowerCase().includes(searchTerm) ||
        card.dataset.region.toLowerCase().includes(searchTerm) ||
        (card.dataset.cuisine || '').toLowerCase().includes(searchTerm) ||
        (card.querySelector('.venue-desc').textContent || '').toLowerCase().includes(searchTerm);
      var matchesFavorite = !favoritesOnly || card.dataset.favorite === '1';

      var show = matchesType && matchesFilters && matchesRegion && matchesCuisine && matchesPrice && matchesSearch && matchesFavorite;
      card.style.display = show ? '' : 'none';
      if(show){ visibleCount++; }
    });
    resultsCount.textContent = visibleCount + ' ' + (visibleCount === 1 ? t('results.placeToExplore') : t('results.placesToExplore'));
    noResults.classList.toggle('show', visibleCount === 0);
  }

  applyFilters();
  window.__applyFilters = applyFilters;
}

/* ---------- Map view ---------- */
function initBlock2(){
  var REGION_LABEL = {
    "kelowna": "Kelowna", "west-kelowna": "West Kelowna", "peachland": "Peachland",
    "naramata": "Naramata Bench", "penticton": "Penticton", "okanagan-falls": "Okanagan Falls",
    "summerland": "Summerland", "oliver": "Oliver", "osoyoos": "Osoyoos", "vernon": "Vernon",
    "big-white": "Big White", "silverstar": "SilverStar", "apex": "Apex", "baldy": "Mount Baldy",
    "lake-country": "Lake Country", "coldstream": "Coldstream", "lumby": "Lumby",
    "armstrong": "Armstrong", "enderby": "Enderby", "kaleden": "Kaleden"
  };
  // Real town-center coordinates, these mark the area, not individual addresses.
  var REGION_COORDS = {
    "kelowna": [49.8880, -119.4960],
    "west-kelowna": [49.8622, -119.6516],
    "peachland": [49.7719, -119.7386],
    "naramata": [49.5978, -119.5850],
    "penticton": [49.4991, -119.5937],
    "okanagan-falls": [49.3512, -119.5568],
    "summerland": [49.6011, -119.6773],
    "oliver": [49.1822, -119.5502],
    "osoyoos": [49.0328, -119.4692],
    "vernon": [50.2670, -119.2720],
    "big-white": [49.7218, -118.9288],
    "silverstar": [50.3599, -119.0588],
    "apex": [49.3910, -119.9040],
    "baldy": [49.1528, -119.2364],
    "lake-country": [50.0680, -119.4090],
    "coldstream": [50.2260, -119.2010],
    "lumby": [50.2483, -118.9722],
    "armstrong": [50.4489, -119.1997],
    "enderby": [50.5487, -119.1400],
    "kaleden": [49.3940, -119.6010]
  };

  var toggleBtn = document.getElementById('mapToggleBtn');
  var panel = document.getElementById('mapPanel');
  // The interactive map only renders on /browse now -- see initBlock1's
  // comment above on why an unguarded throw here matters beyond this
  // function alone.
  if (!toggleBtn || !panel) return;
  var map = null;
  var markers = {};

  function initMap(){
    if (map) return;
    map = L.map('okMap').setView([49.75, -119.55], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 15
    }).addTo(map);

    Object.keys(REGION_COORDS).forEach(function(slug){
      var marker = L.marker(REGION_COORDS[slug]).addTo(map);
      markers[slug] = marker;
    });

    refreshMapMarkers();
    setTimeout(function(){ map.invalidateSize(); }, 100);
  }

  function refreshMapMarkers(){
    if (!map) return;
    var byRegion = {};
    Object.keys(REGION_COORDS).forEach(function(slug){ byRegion[slug] = []; });

    document.querySelectorAll('.venue-card').forEach(function(card){
      if (card.style.display === 'none') return;
      var slug = card.dataset.region;
      if (byRegion[slug]) {
        byRegion[slug].push({
          name: card.dataset.name,
          type: card.querySelector('.venue-type') ? card.querySelector('.venue-type').textContent : '',
          href: card.querySelector('.directions-link') ? card.querySelector('.directions-link').href : '#'
        });
      }
    });

    Object.keys(markers).forEach(function(slug){
      var venues = byRegion[slug];
      var label = REGION_LABEL[slug];
      var html = '<h4>' + label + ' &middot; ' + venues.length + (venues.length === 1 ? ' place' : ' places') + '</h4>';
      if (venues.length === 0){
        html += '<p style="font-size:0.85rem; color:rgba(42,32,25,0.68);">Nothing matches your current filters here.</p>';
      } else {
        html += '<ul class="map-popup-list">';
        venues.slice(0, 12).forEach(function(v){
          html += '<li><a href="' + v.href + '" target="_blank" rel="noopener">' + v.name + '</a>, ' + v.type + '</li>';
        });
        html += '</ul>';
        if (venues.length > 12){
          html += '<div class="map-popup-more">+ ' + (venues.length - 12) + ' more, narrow your filters to see them all here.</div>';
        }
      }
      markers[slug].setPopupContent(html);
      markers[slug].bindPopup(html);
      // Scale marker opacity slightly by whether anything matches, as a quick visual cue.
      markers[slug].setOpacity(venues.length > 0 ? 1 : 0.4);
    });
  }

  toggleBtn.addEventListener('click', function(){
    var isOpen = panel.classList.toggle('open');
    toggleBtn.setAttribute('aria-pressed', String(isOpen));
    toggleBtn.textContent = isOpen ? t('map.closeView') : t('map.openView');
    if (isOpen){
      if (window.trackEvent) window.trackEvent('open_map');
      initMap(); refreshMapMarkers(); if(map){ setTimeout(function(){ map.invalidateSize(); }, 50); }
    }
  });

  // Refresh map markers whenever filters change, piggyback on clicks to any filter control.
  document.querySelectorAll('.type-chip, .stamp-btn, .region-chip, #clearFilters, #searchBtn').forEach(function(el){
    el.addEventListener('click', function(){ if (map) setTimeout(refreshMapMarkers, 10); });
  });
  var cuisineEl = document.getElementById('cuisineFilter');
  if (cuisineEl) cuisineEl.addEventListener('change', function(){ if (map) setTimeout(refreshMapMarkers, 10); });
  var searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.addEventListener('keydown', function(e){ if (e.key === 'Enter' && map) setTimeout(refreshMapMarkers, 10); });
}

/* ---------- Mobile nav toggle ---------- */
function initBlock3(){
  var hamburger = document.getElementById('navHamburger');
  var navLinks = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', function(){
    var isOpen = navLinks.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click', function(){
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- Sort ---------- */
function initBlock4(){
  var sortSelect = document.getElementById('sortSelect');
  var grid = document.getElementById('venueGrid');
  if (!sortSelect || !grid) return;

  // Preserve the original DOM order so "Featured order" can restore it exactly.
  var originalOrder = Array.prototype.slice.call(grid.children);

  function getRating(card){
    var spans = card.querySelectorAll('.venue-region .mono');
    for (var i = 0; i < spans.length; i++){
      var text = spans[i].textContent || '';
      if (text.indexOf('★') !== -1){
        var match = text.match(/([\d.]+)/);
        if (match) return parseFloat(match[1]);
      }
    }
    return -1; // unrated cards sort last
  }

  function applySort(){
    var value = sortSelect.value;
    var cards = Array.prototype.slice.call(grid.children);

    if (value === 'default'){
      originalOrder.forEach(function(card){ grid.appendChild(card); });
      return;
    }

    if (value === 'rating-desc'){
      cards.sort(function(a, b){ return getRating(b) - getRating(a); });
    } else if (value === 'name-asc'){
      cards.sort(function(a, b){
        return (a.dataset.name || '').localeCompare(b.dataset.name || '');
      });
    }

    cards.forEach(function(card){ grid.appendChild(card); });
  }

  sortSelect.addEventListener('change', applySort);
}

/* ---------- List Your Venue form ---------- */
function initBlock5(){
  var form = document.getElementById('venueForm');
  if (!form) return;
  var success = document.getElementById('vfSuccess');
  var descField = document.getElementById('vfDesc');
  var descCount = document.getElementById('vfDescCount');

  if (descField && descCount) {
    descField.addEventListener('input', function(){
      var left = 500 - descField.value.length;
      descCount.textContent = left + ' character' + (left === 1 ? '' : 's') + ' left';
    });
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();

    var name = document.getElementById('vfName').value.trim();
    var type = document.getElementById('vfType').value;
    var region = document.getElementById('vfRegion').value;
    var cuisine = document.getElementById('vfCuisine').value.trim();
    var email = document.getElementById('vfEmail').value.trim();
    var phone = document.getElementById('vfPhone').value.trim();
    var desc = document.getElementById('vfDesc').value.trim();

    var amenities = [];
    if (document.getElementById('vfDog').checked) amenities.push('Dog-friendly');
    if (document.getElementById('vfVegan').checked) amenities.push('Vegan options');
    if (document.getElementById('vfPatio').checked) amenities.push('Patio');
    if (document.getElementById('vfKids').checked) amenities.push('Kid-friendly');
    if (document.getElementById('vfGluten').checked) amenities.push('Gluten-free options');
    if (document.getElementById('vfView').checked) amenities.push('Lake/vineyard view');
    if (document.getElementById('vfNonalc').checked) amenities.push('Non-alcoholic options');
    if (document.getElementById('vfSports').checked) amenities.push('Sports on TV');
    if (document.getElementById('vfMusic').checked) amenities.push('Live music');

    var payload = {
      _subject: 'Venue submission: ' + name,
      'Venue name': name,
      'Type': type,
      'Region': region,
      'Cuisine': cuisine || 'n/a',
      'Contact email': email,
      'Phone': phone || 'n/a',
      'Description': desc,
      'Amenities they say genuinely apply': (amenities.length ? amenities.join(', ') : 'none selected')
    };

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

    fetch('https://formsubmit.co/ajax/okanaganroam@gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(res){ return res.json(); }).then(function(){
      success.classList.add('show');
      form.reset();
      if (descCount) { descCount.textContent = '500 characters left'; }
    }).catch(function(){
      alert('Something went wrong submitting your venue. Please try again or email us directly at okanaganroam@gmail.com.');
    }).finally(function(){
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit your venue'; }
    });
  });
}

/* ---------- Review count display (shows (n) right after the star rating) ---------- */
function initBlock6(){
  document.querySelectorAll('.venue-card').forEach(function(card){
    var count = card.dataset.reviews;
    if (!count) return;
    var starSpan = card.querySelector('.venue-region .mono');
    if (!starSpan) return;
    var tag = document.createElement('span');
    tag.className = 'review-count';
    tag.textContent = ' (' + count + ')';
    tag.title = count + ' Google reviews';
    tag.dataset.tooltip = count + ' Google reviews';
    starSpan.insertAdjacentElement('afterend', tag);
  });
}

/* ---------- Star rating hover: link out to the venue's recent reviews on Google ----------
   We don't reproduce review text here (that's the individual reviewers' own writing),
   so hovering shows a tooltip pointing to where the actual recent reviews live. */
function initBlock7(){
  document.querySelectorAll('.venue-card').forEach(function(card){
    var starSpan = card.querySelector('.venue-region .mono');
    if (!starSpan || !starSpan.textContent.includes('\u2605')) return;
    var name = card.dataset.name || '';
    var regionSlug = card.dataset.region || '';
    var regionLabel = regionSlug.replace(/-/g, ' ');
    var query = name + ' ' + regionLabel + ' reviews';
    var url = 'https://www.google.com/search?q=' + encodeURIComponent(query);

    starSpan.classList.add('rating-hover-link');
    starSpan.dataset.tooltip = 'See recent reviews on Google';
    starSpan.addEventListener('click', function(e){
      e.stopPropagation();
      window.open(url, '_blank', 'noopener');
    });
  });
}

/* ---------- Wizard step flow (Region → Type → Amenities → Results) ---------- */
function initBlock8(){
  var steps = {
    1: document.getElementById('wizardStep1'),
    2: document.getElementById('wizardStep2'),
    3: document.getElementById('wizardStep3')
  };
  var refine = document.getElementById('wizardResultsRefine');
  var progress = document.getElementById('wizardProgress');
  var dots = progress ? progress.querySelectorAll('.wizard-step-dot') : [];

  if (!steps[1] || !steps[2] || !steps[3]) return;

  function showStep(n, skipScroll){
    // n can be 1, 2, 3, or 'results'
    document.body.classList.toggle('wizard-active', n !== 'results');
    steps[1].style.display = n === 1 ? '' : 'none';
    steps[2].style.display = n === 2 ? '' : 'none';
    steps[3].style.display = n === 3 ? '' : 'none';
    if (refine) refine.style.display = n === 'results' ? 'flex' : 'none';
    if (progress) progress.style.display = n === 'results' ? 'none' : 'flex';

    dots.forEach(function(dot){
      var dotStep = parseInt(dot.dataset.step, 10);
      dot.classList.remove('wizard-step-active', 'wizard-step-done');
      if (n !== 'results' && dotStep === n) dot.classList.add('wizard-step-active');
      else if (n === 'results' || dotStep < n) dot.classList.add('wizard-step-done');
    });

    // Callers that already know they're about to scroll to one specific
    // card (the weekly spotlight, say) pass skipScroll=true here, since
    // this function's own "jump to results" scroll would otherwise start
    // a competing smooth-scroll animation a beat before the more precise
    // one — two simultaneous smooth scrolls race each other and the page
    // can end up settling on neither destination.
    if (skipScroll) return;

    if (n !== 'results') {
      var target = document.getElementById('directory');
      if (target) {
        if (window.__keepFilterBarVisible) window.__keepFilterBarVisible();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      var grid = document.getElementById('venueGrid');
      if (grid) {
        if (window.__keepFilterBarVisible) window.__keepFilterBarVisible(1200);
        var headerEl = document.querySelector('header');
        var filterBarEl = document.querySelector('.filter-bar');
        var offset = (headerEl ? headerEl.offsetHeight : 0) + (filterBarEl ? filterBarEl.offsetHeight : 0) + 16;
        var gridTop = grid.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: gridTop - offset, behavior: 'smooth' });
      }
    }
  }

  // Exposed so callers that will follow up with their own precise scroll
  // (e.g. window.__scrollToVenueCard) can reveal the results view without
  // triggering showStep's own competing scroll animation.
  window.__showResultsNoScroll = function(){ showStep('results', true); };

  var to2 = document.getElementById('wizardTo2');
  var to3 = document.getElementById('wizardTo3');
  var toResults = document.getElementById('wizardToResults');
  var to1Back = document.getElementById('wizardTo1Back');
  var to2Back = document.getElementById('wizardTo2Back');
  var editBtn = document.getElementById('wizardEditFilters');

  if (to2) to2.addEventListener('click', function(){ showStep(2); });
  if (to3) to3.addEventListener('click', function(){ showStep(3); });
  if (toResults) toResults.addEventListener('click', function(){
    if (window.trackEvent) {
      // activeRegions/activeTypes/activeFilters live in a different IIFE
      // (the filter-button click handlers), not reachable from here — read
      // the same information straight off the DOM instead, matching the
      // pattern updateCount() already uses for the same reason.
      var regionCount = document.querySelectorAll('.region-chip[aria-pressed="true"]:not([data-region="all"])').length;
      var typeCount = document.querySelectorAll('.type-chip[aria-pressed="true"]').length;
      var filterCount = document.querySelectorAll('.stamp-btn[aria-pressed="true"]').length;
      window.trackEvent('wizard_complete', {
        region_count: regionCount,
        type_count: typeCount,
        filter_count: filterCount
      });
    }
    showStep('results');
  });
  if (to1Back) to1Back.addEventListener('click', function(){ showStep(1); });
  if (to2Back) to2Back.addEventListener('click', function(){ showStep(2); });
  if (editBtn) editBtn.addEventListener('click', function(){ showStep(1); });
  document.addEventListener('wizard:reset', function(){ showStep(1); });
  document.addEventListener('wizard:showResults', function(){ showStep('results'); });
  window.__showResultsStep = function(){ showStep('results'); };

  // Live "X selected" count on each Continue button, so it's clear what
  // moving forward will carry with it.
  function updateCount(step, selector, btnKey, btn, excludeAll){
    var count = 0;
    step.querySelectorAll(selector).forEach(function(el){
      if (excludeAll && el.dataset.region === 'all') return;
      if (el.getAttribute('aria-pressed') === 'true') count++;
    });
    var base = t(btnKey);
    btn.textContent = count > 0 ? base + ' (' + count + ' ' + t('wizard.selected') + ') \u2192' : base + ' \u2192';
  }
  steps[1].addEventListener('click', function(){
    if (to2) updateCount(steps[1], '.region-chip', 'wizard.continueLabel', to2, true);
  });
  steps[2].addEventListener('click', function(){
    if (to3) updateCount(steps[2], '.type-chip', 'wizard.continueLabel', to3, false);
  });
  steps[3].addEventListener('click', function(){
    if (toResults) updateCount(steps[3], '.stamp-btn', 'wizard.seeResultsLabel', toResults, false);
  });

  // Milestone 1 (approved homepage redesign): showStep(1) used to be a
  // harmless no-op scroll on page load, back when the wizard was the very
  // first section on the page. Now that the hero + mood cards sit above
  // it, an unconditional scrollIntoView here would yank every visitor
  // straight past both of them on first load. skipScroll (already
  // supported by showStep for exactly this kind of case, see
  // __showResultsNoScroll above) keeps the wizard's own step-1 state
  // correct without moving the viewport -- explicit wizard navigation
  // (Back/Edit/reset, handled above) still scrolls as before.
  showStep(1, true);
}

/* ---------- Collapse Cuisine/Price once the user hits Search, to free up
   room for the hero and venue results. A small "Edit" pill reopens it. ---------- */
function initBlock9(){
  var group = document.getElementById('cuisinePriceGroup');
  var summaryBtn = document.getElementById('refineSummaryBtn');
  var searchBtn = document.getElementById('refineSearchBtn');
  if (!group || !summaryBtn) return;

  function collapse(){
    group.style.display = 'none';
    summaryBtn.style.display = '';
  }
  function expand(){
    group.style.display = 'flex';
    summaryBtn.style.display = 'none';
  }

  if (searchBtn) searchBtn.addEventListener('click', collapse);
  summaryBtn.addEventListener('click', expand);
  document.addEventListener('wizard:reset', expand);
}

/* ---------- Price tag display (always shows 3 $ signs; filled = active tier, outlined = not) ---------- */
function initBlock10(){
  var LABELS = { '1': 'Budget-friendly', '2': 'Moderate pricing', '3': 'Higher-end pricing', '4': 'Premium pricing' };
  document.querySelectorAll('.venue-card').forEach(function(card){
    var price = card.dataset.price;
    if (!price || !LABELS[price]) return;
    var filledCount = Math.min(parseInt(price, 10), 3);
    var regionDiv = card.querySelector('.venue-region');
    if (!regionDiv) return;

    var tag = document.createElement('span');
    tag.className = 'price-tag price-active';
    tag.title = LABELS[price];
    tag.dataset.tooltip = LABELS[price];
    tag.appendChild(document.createTextNode(' \u00b7 '));
    for (var i = 1; i <= 3; i++) {
      var dollar = document.createElement('span');
      dollar.className = i <= filledCount ? 'price-dot-filled' : 'price-dot-empty';
      dollar.textContent = '$';
      tag.appendChild(dollar);
    }
    regionDiv.appendChild(tag);
  });
}

/* ---------- Get Directions links (generated from name + region) ---------- */
function initBlock11(){
  var REGION_LABEL = {
    "kelowna": "Kelowna", "west-kelowna": "West Kelowna", "peachland": "Peachland",
    "naramata": "Naramata Bench", "penticton": "Penticton", "okanagan-falls": "Okanagan Falls",
    "summerland": "Summerland", "oliver": "Oliver", "osoyoos": "Osoyoos", "vernon": "Vernon",
    "big-white": "Big White", "silverstar": "SilverStar", "apex": "Apex", "baldy": "Mount Baldy",
    "lake-country": "Lake Country", "coldstream": "Coldstream", "lumby": "Lumby",
    "armstrong": "Armstrong", "enderby": "Enderby", "kaleden": "Kaleden"
  };

  document.querySelectorAll('.venue-card, .featured-card').forEach(function(card){
    var name = card.dataset.name || '';
    var regionSlug = card.dataset.region || '';
    var regionLabel = REGION_LABEL[regionSlug] || regionSlug;
    var query = name + ', ' + regionLabel + ', Okanagan Valley, BC';
    var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);

    var directionsLink = document.createElement('a');
    directionsLink.className = 'directions-link';
    directionsLink.href = mapsUrl;
    directionsLink.target = '_blank';
    directionsLink.rel = 'noopener';
    directionsLink.textContent = t('card.getDirections');

    // Menu link searches for the venue's menu rather than linking a specific
    // page — we don't have a verified menu URL for every venue, and a search
    // is honest about that while still being useful.
    var menuQuery = name + ' ' + regionLabel + ' menu';
    var menuUrl = 'https://www.google.com/search?q=' + encodeURIComponent(menuQuery);

    var menuLink = document.createElement('a');
    menuLink.className = 'menu-link';
    menuLink.href = menuUrl;
    menuLink.target = '_blank';
    menuLink.rel = 'noopener';
    menuLink.textContent = t('card.findMenu');

    // Same honest approach as the menu link: we don't have a verified booking
    // system for every venue, so this searches rather than claiming one exists.
    var bookingQuery = name + ' ' + regionLabel + ' reservations OpenTable';
    var bookingUrl = 'https://www.google.com/search?q=' + encodeURIComponent(bookingQuery);

    var bookingLink = document.createElement('a');
    bookingLink.className = 'booking-link';
    bookingLink.href = bookingUrl;
    bookingLink.target = '_blank';
    bookingLink.rel = 'noopener';
    bookingLink.textContent = t('card.checkBooking');

    var linkRow = document.createElement('div');
    linkRow.className = 'card-links';
    linkRow.appendChild(directionsLink);
    linkRow.appendChild(menuLink);
    linkRow.appendChild(bookingLink);

    // Real phone number, when we have one on file — a direct tel: link,
    // not a search, since this one we can actually verify. Always create
    // this row (even with no number) so every card reserves the same
    // vertical space here — otherwise cards without a phone number end up
    // shorter, throwing off alignment of everything below across the grid.
    var phone = card.dataset.phone;
    var phoneLink = document.createElement('a');
    phoneLink.className = 'phone-link';
    if (phone) {
      phoneLink.href = 'tel:' + phone.replace(/[^\d+]/g, '');
      phoneLink.textContent = '📞 ' + phone;
    } else {
      phoneLink.style.visibility = 'hidden';
      phoneLink.setAttribute('aria-hidden', 'true');
      phoneLink.textContent = '📞 placeholder';
    }
    linkRow.appendChild(phoneLink);

    var tripFavRow = document.createElement('div');
    tripFavRow.className = 'trip-fav-row';

    var tripBtn = document.createElement('button');
    tripBtn.type = 'button';
    tripBtn.className = 'trip-btn';
    tripBtn.dataset.tripQuery = query;
    tripBtn.dataset.tripName = name;
    tripBtn.dataset.tripRegion = regionSlug;
    tripBtn.textContent = t('trip.addToTrip');
    tripFavRow.appendChild(tripBtn);

    var favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'fav-btn';
    favBtn.dataset.favName = name;
    favBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg> ' + t('card.favorite');
    tripFavRow.appendChild(favBtn);

    linkRow.appendChild(tripFavRow);

    var badgeRow = card.querySelector('.badge-row');
    if (badgeRow) {
      badgeRow.insertAdjacentElement('afterend', linkRow);
    } else {
      card.appendChild(linkRow);
    }
  });

  if (window.__syncTripButtons) window.__syncTripButtons();
  if (window.__syncFavButtons) window.__syncFavButtons();
}

/* ---------- Live Google Places search (beta) ---------- */
function initBlock12(){
  var toggle = document.getElementById('liveSearchToggle');
  var body = document.getElementById('liveSearchBody');
  var apiKeyInput = document.getElementById('apiKeyInput');
  var queryInput = document.getElementById('liveQueryInput');
  var searchBtn = document.getElementById('liveSearchBtn');
  var status = document.getElementById('liveSearchStatus');
  var resultsGrid = document.getElementById('liveResultsGrid');
  // Pre-existing, unrelated to this change: this panel's markup was
  // already removed from okanagan.html during an earlier Google Places
  // cleanup, but this function was never guarded, so it has been throwing
  // on every page load since then. Fixed here since it was found while
  // verifying the homepage/directory split didn't introduce new breakage.
  if (!toggle || !body) return;

  // Remember the API key in this browser only (never sent anywhere but Google).
  try {
    var savedKey = localStorage.getItem('okanaganRoamPlacesKey');
    if (savedKey) apiKeyInput.value = savedKey;
  } catch (e) { /* localStorage unavailable, ignore */ }

  toggle.addEventListener('click', function(){
    toggle.classList.toggle('open');
    body.classList.toggle('open');
  });

  async function runLiveSearch(){
    var key = apiKeyInput.value.trim();
    var query = queryInput.value.trim();
    resultsGrid.innerHTML = '';

    if (!key){
      status.textContent = 'Paste a Google Places API key first (see note above).';
      return;
    }
    if (!query){
      status.textContent = 'Type something to search for, e.g. "wineries in Kelowna".';
      return;
    }

    try { localStorage.setItem('okanaganRoamPlacesKey', key); } catch (e) {}

    searchBtn.disabled = true;
    status.textContent = 'Searching Google Places…';

    try {
      var res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types'
        },
        body: JSON.stringify({
          textQuery: query + ' Okanagan Valley British Columbia',
          maxResultCount: 12
        })
      });

      if (!res.ok){
        var errBody = await res.text();
        status.textContent = 'Google returned an error (' + res.status + '). Check that your API key is valid, billing is enabled, and the "Places API (New)" is turned on for your project.';
        console.error('Places API error:', errBody);
        searchBtn.disabled = false;
        return;
      }

      var data = await res.json();
      var places = data.places || [];

      if (places.length === 0){
        status.textContent = 'No results found for that search.';
        searchBtn.disabled = false;
        return;
      }

      status.textContent = 'Found ' + places.length + ' result' + (places.length === 1 ? '' : 's') + ', amenities not verified, double check before adding to your trip.';

      places.forEach(function(place){
        var name = (place.displayName && place.displayName.text) || 'Unnamed place';
        var addr = place.formattedAddress || '';
        var rating = place.rating ? ('★ ' + place.rating + (place.userRatingCount ? ' (' + place.userRatingCount + ')' : '')) : 'No rating yet';

        var card = document.createElement('div');
        card.className = 'live-result-card';
        card.innerHTML =
          '<h4></h4>' +
          '<div class="lr-meta"></div>' +
          '<div class="lr-addr"></div>' +
          '<div class="lr-warn">Not yet verified, amenities unknown</div>';
        card.querySelector('h4').textContent = name;
        card.querySelector('.lr-meta').textContent = rating;
        card.querySelector('.lr-addr').textContent = addr;
        resultsGrid.appendChild(card);
      });

    } catch (err){
      status.textContent = 'Something went wrong reaching Google Places. Check your internet connection and API key.';
      console.error(err);
    }

    searchBtn.disabled = false;
  }

  searchBtn.addEventListener('click', runLiveSearch);
  queryInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') runLiveSearch(); });
}

/* ---------- Featured venues: slow auto-scroll, pauses when the user takes control ---------- */
(function(){
  var strip = document.querySelector('.featured-strip');
  var section = document.querySelector('.featured-venues');
  if (!strip) return;

  var autoSpeed = 0.4; // px per frame, slow drift
  var paused = false;
  var resumeTimer = null;
  var rafId = null;
  var loopRunning = false;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setPaused(val){
    paused = val;
    strip.classList.toggle('featured-strip-manual', val);
    if (!val) ensureLoopRunning();
  }

  function step(){
    if (paused) { loopRunning = false; return; }
    var maxScroll = strip.scrollWidth - strip.clientWidth;
    if (maxScroll > 0) {
      if (strip.scrollLeft >= maxScroll - 1) {
        strip.scrollLeft = 0;
      } else {
        strip.scrollLeft += autoSpeed;
      }
    }
    rafId = window.requestAnimationFrame(step);
  }

  function ensureLoopRunning(){
    if (loopRunning || reduceMotion) return;
    loopRunning = true;
    rafId = window.requestAnimationFrame(step);
  }

  function pauseForAWhile(){
    setPaused(true);
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function(){ setPaused(false); }, 3500);
  }

  function startWithDelay(){
    if (resumeTimer) clearTimeout(resumeTimer);
    setPaused(true);
    resumeTimer = setTimeout(function(){ setPaused(false); }, 2000);
  }

  ['wheel', 'touchstart', 'mousedown', 'pointerdown'].forEach(function(evt){
    strip.addEventListener(evt, pauseForAWhile, { passive: true });
  });
  strip.addEventListener('mouseenter', function(){ setPaused(true); });
  strip.addEventListener('mouseleave', function(){
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function(){ setPaused(false); }, 2000);
  });

  if (!reduceMotion) {
    startWithDelay();

    if (section && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (entry.isIntersecting) {
            strip.scrollLeft = 0;
            startWithDelay();
          } else {
            if (resumeTimer) clearTimeout(resumeTimer);
            setPaused(true);
          }
        });
      }, { threshold: 0.3 });
      observer.observe(section);
    }
  }
})();

/* ---------- Hide filter bar on scroll down, reveal only at the very top ---------- */
(function(){
  var bar = document.querySelector('.filter-bar');
  if (!bar) return;
  var hideThreshold = 15;
  var topThreshold = 10;
  var ticking = false;
  var suspendedUntil = 0;

  function onScroll(){
    var currentY = window.scrollY;

    if (Date.now() < suspendedUntil) {
      bar.classList.remove('filter-bar-hidden');
      ticking = false;
      return;
    }

    var s1 = document.getElementById('wizardStep1');
    var s2 = document.getElementById('wizardStep2');
    var s3 = document.getElementById('wizardStep3');
    var wizardActive = (s1 && s1.style.display !== 'none') || (s2 && s2.style.display !== 'none') || (s3 && s3.style.display !== 'none');
    if (wizardActive) {
      bar.classList.remove('filter-bar-hidden');
      ticking = false;
      return;
    }

    if (currentY <= topThreshold) {
      bar.classList.remove('filter-bar-hidden');
    } else if (currentY > hideThreshold) {
      bar.classList.add('filter-bar-hidden');
    }

    ticking = false;
  }

  window.addEventListener('scroll', function(){
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });

  // Lets other parts of the page (like the wizard's own step navigation)
  // keep the bar visible while they're scrolling it into view on purpose.
  window.__keepFilterBarVisible = function(ms){
    bar.classList.remove('filter-bar-hidden');
    suspendedUntil = Date.now() + (ms || 900);
  };

  // The opposite: force the bar to collapse immediately (used after a plain
  // search, where the person wants to jump straight to full-width results
  // rather than have the search bar stay pinned above them).
  window.__hideFilterBarNow = function(){
    suspendedUntil = 0;
    bar.classList.add('filter-bar-hidden');
  };
})();

/* ---------- Shared: scroll to a venue's card by name and briefly highlight it ---------- */
window.__scrollToVenueCard = function(name){
  if (!name) return false;
  var grid = document.getElementById('venueGrid');
  if (!grid) return false;

  var card = null;
  var cards = grid.querySelectorAll('.venue-card');
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].dataset.name === name) { card = cards[i]; break; }
  }
  if (!card) return false;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('venue-card-highlight');
  void card.offsetWidth;
  card.classList.add('venue-card-highlight');
  setTimeout(function(){ card.classList.remove('venue-card-highlight'); }, 1800);
  return true;
};

/* ---------- Milestone 1 (approved homepage redesign): scenic hero search.
   Delegates entirely to the existing #searchInput/#searchBtn search
   implementation in initBlock1() -- copies the typed value across and
   clicks the real search button, so the existing runSearch()/applyFilters()
   logic, wizard:showResults dispatch, and scroll behavior all run exactly
   as they already do for the directory's own search box. No new filtering
   logic. ---------- */
(function(){
  var form = document.getElementById('heroSearchForm');
  var heroInput = document.getElementById('heroSearchInput');
  if (!form || !heroInput) return;
  var mainInput = document.getElementById('searchInput');
  var mainBtn = document.getElementById('searchBtn');

  form.addEventListener('submit', function(e){
    e.preventDefault();
    if (mainInput && mainBtn) {
      // On /browse itself, the wizard's own search box is right there --
      // reuse it directly rather than navigating.
      mainInput.value = heroInput.value;
      mainBtn.click();
    } else {
      // On the homepage, the wizard/results this used to drive don't
      // render on this page anymore (see the architecture-change comment
      // on the / route in server.js) -- hand the query to /browse instead.
      var q = heroInput.value.trim();
      window.location.href = q ? ('/browse?q=' + encodeURIComponent(q)) : '/browse';
    }
  });
})();

/* ---------- Milestone 1 (approved homepage redesign): "What are you in
   the mood for?" cards. Eat/Drink press the existing .type-chip buttons
   (the exact same multi-select filter initBlock1() already implements)
   and dispatch the existing wizard:showResults event to reveal the
   results grid -- no new filtering system. Hidden Gems/Golf/What's
   On/Explore are plain links (to #hiddenGems, a real category page,
   /events, and #exploreRegions respectively) and are left to navigate
   normally. ---------- */
(function(){
  var grid = document.querySelector('.mood-card-grid');
  if (!grid) return;

  function setTypeFilter(types){
    document.querySelectorAll('.type-chip').forEach(function(chip){
      var shouldBePressed = types.indexOf(chip.dataset.type) !== -1;
      var isPressed = chip.getAttribute('aria-pressed') === 'true';
      if (shouldBePressed !== isPressed) chip.click();
    });
    document.dispatchEvent(new Event('wizard:showResults'));
  }

  grid.addEventListener('click', function(e){
    var card = e.target.closest('[data-mood-filter]');
    if (!card) return;
    // The wizard's .type-chip buttons only exist on /browse now (see the
    // architecture-change comment on the / route in server.js) -- on the
    // homepage itself there's nothing to press, so let the card's own
    // href (a real /browse?types=... link) navigate normally instead of
    // intercepting the click.
    if (!document.querySelector('.type-chip')) return;
    e.preventDefault();
    setTypeFilter(card.dataset.moodFilter.split(','));
  });
})();

/* ---------- "Build Your Perfect Okanagan Trip" CTA. ----------
   Build My Trip Stage 2 (2026-09-18): #tripCtaOpenTrip now navigates to
   the real /trip planner page instead of just opening the (still fully
   intact, unchanged) trip tray -- this is a behavior-only change, the
   button's markup/styling on the homepage is completely untouched (the
   homepage itself is frozen). #tripCtaOpenMap below is unrelated and
   unchanged: it still opens the existing /browse map. Reference redesign,
   forensic-comparison rebuild note (unchanged): #tripCtaOpenMap is a
   <button> wrapping the whole map graphic (matching the reference's
   single-CTA layout, which has no second visible "view map" link) rather
   than a separate <a> -- this handler works identically on either element
   type, no change needed here. ---------- */
(function(){
  var openTripBtn = document.getElementById('tripCtaOpenTrip');
  if (openTripBtn) {
    openTripBtn.addEventListener('click', function(e){
      e.stopPropagation();
      window.location.href = '/trip';
    });
  }

  var openMapLink = document.getElementById('tripCtaOpenMap');
  if (openMapLink) {
    openMapLink.addEventListener('click', function(e){
      e.preventDefault();
      var toggle = document.getElementById('mapToggleBtn');
      var panel = document.getElementById('mapPanel');
      if (!toggle || !panel) {
        // The real interactive map lives inside the results section, which
        // only renders on /browse now (see the architecture-change comment
        // on the / route in server.js) -- send the click there instead.
        window.location.href = '/browse?openMap=1';
        return;
      }
      if (toggle.getAttribute('aria-pressed') !== 'true') toggle.click();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
})();

/* ---------- Reference-redesign header: Discover/Things to Do/Food & Drink
   dropdowns, search icon, "Build My Trip" CTA, and "Map" nav link. All of
   these drive existing behavior (trip tray, map panel, hero search) rather
   than introducing anything new. ---------- */
(function(){
  var dropdowns = document.querySelectorAll('.nav-dropdown');
  if (dropdowns.length) {
    dropdowns.forEach(function(dd){
      var trigger = dd.querySelector('.nav-link-label');
      if (!trigger) return;
      trigger.addEventListener('click', function(e){
        e.stopPropagation();
        var wasOpen = dd.classList.contains('open');
        dropdowns.forEach(function(other){
          other.classList.remove('open');
          var otherTrigger = other.querySelector('.nav-link-label');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
        });
        if (!wasOpen) {
          dd.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
      trigger.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger.click();
        }
      });
    });
    document.addEventListener('click', function(){
      dropdowns.forEach(function(dd){
        dd.classList.remove('open');
        var trigger = dd.querySelector('.nav-link-label');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var searchBtn = document.getElementById('navSearchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', function(){
      var hero = document.getElementById('heroScenic');
      if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var input = document.getElementById('heroSearchInput');
      if (input) window.setTimeout(function(){ input.focus(); }, 350);
    });
  }

  // Build My Trip Stage 2 (2026-09-18): navigates to the real /trip
  // planner instead of just opening the trip tray -- same header markup
  // is shared by /, /browse, and /trip itself, so this no-ops if already
  // on /trip rather than reloading it.
  var tripBtn = document.getElementById('navTripBtn');
  if (tripBtn) {
    tripBtn.addEventListener('click', function(e){
      e.stopPropagation();
      if (window.location.pathname === '/trip') return;
      window.location.href = '/trip';
    });
  }

  var mapLink = document.getElementById('navMapLink');
  if (mapLink) {
    mapLink.addEventListener('click', function(e){
      e.preventDefault();
      var toggle = document.getElementById('mapToggleBtn');
      var panel = document.getElementById('mapPanel');
      if (!toggle || !panel) {
        // Same reasoning as the trip-cta map handler above: the map only
        // renders on /browse now.
        window.location.href = '/browse?openMap=1';
        return;
      }
      if (toggle.getAttribute('aria-pressed') !== 'true') toggle.click();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
})();

/* ---------- Floating tooltip for badges: measured live, so it can never be clipped by a card's rounded-corner overflow, and never runs off the edge of the screen ---------- */
(function(){
  var tooltip = document.getElementById('floatingTooltip');
  if (!tooltip) return;

  function showTooltip(badge){
    var text = badge.getAttribute('data-tooltip');
    if (!text) return;
    tooltip.textContent = text;
    tooltip.classList.add('show');

    var badgeRect = badge.getBoundingClientRect();
    var tooltipRect = tooltip.getBoundingClientRect();
    var margin = 8;

    var left = badgeRect.left + (badgeRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

    var top = badgeRect.top - tooltipRect.height - margin;
    if (top < margin) {
      top = badgeRect.bottom + margin;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip(){
    tooltip.classList.remove('show');
  }

  document.addEventListener('mouseover', function(e){
    var badge = e.target.closest('.badge, .hero-badge, .open-status');
    if (badge) showTooltip(badge);
  });

  document.addEventListener('mouseout', function(e){
    var badge = e.target.closest('.badge, .hero-badge, .open-status');
    if (badge) hideTooltip();
  });

  window.addEventListener('scroll', hideTooltip, { passive: true });
})();

/* ---------- Trip planner: build a multi-stop route across saved venues ---------- */
(function(){
  var MAX_STOPS = 10;
  var toggleBtn = document.getElementById('tripTrayToggle');
  var panel = document.getElementById('tripTrayPanel');
  var listEl = document.getElementById('tripTrayList');
  var countEl = document.getElementById('tripTrayCount');
  var routeBtn = document.getElementById('tripRouteBtn');
  var clearBtn = document.getElementById('tripClearBtn');
  if (!toggleBtn || !panel) return;

  var trip = [];
  try {
    var saved = window.localStorage.getItem('okanaganTrip');
    if (saved) trip = JSON.parse(saved);
  } catch (e) { trip = []; }

  function save(){
    try { window.localStorage.setItem('okanaganTrip', JSON.stringify(trip)); } catch (e) {}
  }

  function syncButtons(){
    document.querySelectorAll('.trip-btn').forEach(function(btn){
      var inTrip = trip.some(function(t){ return t.name === btn.dataset.tripName; });
      btn.classList.toggle('in-trip', inTrip);
      btn.textContent = inTrip ? t('trip.inTrip') : t('trip.addToTrip');
    });
  }

  function distanceLineHtml(fromRegion, toRegion){
    if (!window.__distanceBetweenRegions) return '';
    var km = window.__distanceBetweenRegions(fromRegion, toRegion);
    if (km === null) return '';
    var text = km === 0 ? t('trip.sameArea') : '~' + Math.round(km) + ' ' + t('trip.kmToNextStop');
    return '<div class="trip-distance">' + text + '</div>';
  }

  function render(){
    countEl.textContent = trip.length;
    routeBtn.disabled = trip.length === 0;

    if (trip.length === 0) {
      listEl.innerHTML = '<p class="trip-empty">' + t('trip.emptyState') + '</p>';
      return;
    }

    listEl.innerHTML = trip.map(function(t, i){
      var item = '<div class="trip-item"><span>' + (i + 1) + '. ' + t.name.replace(/</g, '&lt;') + '</span>' +
        '<button class="trip-remove" data-remove-index="' + i + '" aria-label="Remove ' + t.name.replace(/"/g, '&quot;') + '">✕</button></div>';
      var nextStop = trip[i + 1];
      var distanceLine = nextStop ? distanceLineHtml(t.region, nextStop.region) : '';
      return item + distanceLine;
    }).join('');
  }

  function showMessage(text){
    var msgEl = document.getElementById('tripTrayMessage');
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    panel.classList.add('open');
    clearTimeout(msgEl._hideTimer);
    msgEl._hideTimer = setTimeout(function(){ msgEl.style.display = 'none'; }, 4000);
  }

  function addToTrip(name, query, region){
    if (trip.some(function(t){ return t.name === name; })) return;
    if (trip.length >= MAX_STOPS) {
      showMessage('Trips are capped at ' + MAX_STOPS + ' stops so the route stays manageable. Remove a stop to add another.');
      return;
    }
    trip.push({ name: name, query: query, region: region || null });
    if (window.trackEvent) window.trackEvent('add_to_trip', { venue_name: name, region: region || null, trip_size: trip.length });
    save();
    syncButtons();
    render();
  }

  function removeFromTrip(name){
    trip = trip.filter(function(t){ return t.name !== name; });
    if (window.trackEvent) window.trackEvent('remove_from_trip', { venue_name: name });
    save();
    syncButtons();
    render();
  }

  document.addEventListener('click', function(e){
    var tripBtn = e.target.closest('.trip-btn');
    if (tripBtn) {
      var name = tripBtn.dataset.tripName;
      var isIn = trip.some(function(t){ return t.name === name; });
      if (isIn) {
        removeFromTrip(name);
      } else {
        addToTrip(name, tripBtn.dataset.tripQuery, tripBtn.dataset.tripRegion);
      }
      return;
    }

    var removeBtn = e.target.closest('.trip-remove');
    if (removeBtn) {
      var idx = parseInt(removeBtn.dataset.removeIndex);
      var t = trip[idx];
      if (t) removeFromTrip(t.name);
      return;
    }

    if (e.target === toggleBtn || toggleBtn.contains(e.target)) {
      panel.classList.toggle('open');
      return;
    }

    if (!panel.contains(e.target) && panel.classList.contains('open')) {
      panel.classList.remove('open');
    }
  });

  routeBtn.addEventListener('click', function(){
    if (trip.length === 0) return;
    var queries = trip.map(function(t){ return t.query; });

    if (queries.length === 1) {
      window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(queries[0]), '_blank', 'noopener');
      return;
    }

    var origin = queries[0];
    var destination = queries[queries.length - 1];
    var waypoints = queries.slice(1, -1);
    var url = 'https://www.google.com/maps/dir/?api=1' +
      '&origin=' + encodeURIComponent(origin) +
      '&destination=' + encodeURIComponent(destination);
    if (waypoints.length) {
      url += '&waypoints=' + encodeURIComponent(waypoints.join('|'));
    }
    window.open(url, '_blank', 'noopener');
  });

  var clearConfirmTimer = null;
  clearBtn.addEventListener('click', function(){
    if (trip.length === 0) return;

    if (!clearBtn.classList.contains('confirming')) {
      clearBtn.classList.add('confirming');
      clearBtn.textContent = 'Click again to confirm';
      clearConfirmTimer = setTimeout(function(){
        clearBtn.classList.remove('confirming');
        clearBtn.textContent = 'Clear trip';
      }, 3000);
      return;
    }

    clearTimeout(clearConfirmTimer);
    clearBtn.classList.remove('confirming');
    clearBtn.textContent = 'Clear trip';
    trip = [];
    save();
    syncButtons();
    render();
  });

  syncButtons();
  render();

  // Exposed so initBlock11 can re-sync once it actually builds the trip-btn
  // elements for the freshly-rendered cards — DOMContentLoaded/load don't
  // reliably fire after that async work finishes, so we call this directly.
  // Also exposed so a language switch can refresh the trip tray's own text
  // (empty-state message, distance labels) without needing a page reload.
  window.__syncTripButtons = syncButtons;
  window.__renderTripTray = render;
})();

/* ---------- Build My Trip, Stage 2: /trip planner page ----------
   Only present on /trip (bails out immediately everywhere else, same
   pattern every other module in this file uses). Calls the Stage 1
   backend (POST /api/trip/generate) for ALL itinerary selection logic --
   this module only collects form input, renders the response, and lets
   the user remove a rendered stop or add one to the EXISTING trip tray
   via the same .trip-btn mechanism the venue-card enhancement code
   already uses (initBlock11, above) -- no new trip data model, no new
   localStorage key. Every dynamic piece of text (venue name, address,
   warnings) is set via .textContent, never innerHTML, so nothing from
   the API response is ever parsed as markup. ---------- */
(function(){
  var form = document.getElementById('tripPlannerForm');
  if (!form) return;

  var TYPE_TO_CATEGORY_SLUG = {
    restaurant: 'restaurants', winery: 'wineries', cafe: 'cafes',
    brewery: 'breweries', pub: 'pubs', cocktail: 'cocktail-lounges', golf: 'golf'
  };
  var DAYPARTS = ['morning', 'afternoon', 'evening'];

  var statusEl = document.getElementById('tripPlannerStatus');
  var resultEl = document.getElementById('tripPlannerResult');
  var warningsEl = document.getElementById('tripPlannerWarnings');
  var daysEl = document.getElementById('tripPlannerDays');
  var mapWrapEl = document.getElementById('tripPlannerMapWrap');
  var generateBtn = document.getElementById('tripGenerateBtn');
  var regenerateBtn = document.getElementById('tripRegenerateBtn');

  var map = null;
  var mapMarkers = [];
  var mapLine = null;

  // The exact params object that produced the CURRENTLY DISPLAYED
  // itinerary, whichever flow generated it (wizard form or the
  // conversational panel) -- set only on a successful generate (see
  // generateTrip() below), never touched by removing a stop or by
  // anything else, so it can't drift out of sync with what's on screen.
  // Regenerate reuses this directly instead of re-reading the wizard
  // form, which is what let it wrongly demand a region even when the
  // itinerary on screen came from the conversational flow instead.
  var lastGeneratedParams = null;

  // Venue ids the user has explicitly removed from the CURRENTLY DISPLAYED
  // itinerary, accumulated across any number of "Remove" clicks. Sent back
  // on every subsequent Regenerate (see generateTrip() below) so the same
  // venue is never re-selected, but reset on any genuinely new generation
  // (fresh wizard submit or a fresh conversational parse) so it never
  // leaks into an unrelated trip. Never touched by removing a stop's
  // effect on lastGeneratedParams, and never persisted beyond this page
  // load -- an in-memory list only, same posture as lastGeneratedParams.
  var excludedVenueIds = [];

  // Pre-fill the region from ?region=<slug> when present (e.g. a future
  // "plan a trip here" link from a venue/region page) -- a small, safe
  // nicety, not a new required flow; the step still works with no query
  // string at all.
  try {
    var presetRegion = new URLSearchParams(window.location.search).get('region');
    if (presetRegion) {
      var regionSelect = document.getElementById('tripRegionSelect');
      if (regionSelect && regionSelect.querySelector('option[value="' + presetRegion + '"]')) {
        regionSelect.value = presetRegion;
      }
    }
  } catch (e) { /* ignore -- purely cosmetic */ }

  function setStatus(text, mode) {
    statusEl.textContent = text || '';
    statusEl.className = 'trip-planner-status' + (mode ? ' is-' + mode : '');
  }

  function venueUrl(venue) {
    var catSlug = TYPE_TO_CATEGORY_SLUG[venue.type];
    if (!catSlug || !venue.slug) return null;
    return '/' + venue.region + '/' + catSlug + '/' + venue.slug;
  }

  function buildSlotCard(daypart, venue) {
    var card = document.createElement('div');
    card.className = 'trip-slot-card';

    var label = document.createElement('div');
    label.className = 'trip-slot-label';
    label.textContent = t('trip.planner.' + daypart);
    card.appendChild(label);

    if (!venue) {
      var empty = document.createElement('p');
      empty.className = 'trip-slot-empty';
      empty.textContent = t('trip.planner.noVenue');
      card.appendChild(empty);
      return card;
    }

    var regionLabel = (window.CARD_REGION_LABEL && window.CARD_REGION_LABEL[venue.region]) || venue.region;
    card.dataset.id = venue.id;
    card.dataset.name = venue.name;
    if (venue.latitude != null && venue.longitude != null) {
      card.dataset.lat = venue.latitude;
      card.dataset.lng = venue.longitude;
    }

    var h4 = document.createElement('h4');
    var url = venueUrl(venue);
    if (url) {
      var link = document.createElement('a');
      link.href = url;
      link.textContent = venue.name;
      h4.appendChild(link);
    } else {
      h4.textContent = venue.name;
    }
    card.appendChild(h4);

    var metaParts = [];
    var typeLabel = t('type.' + venue.type);
    if (typeLabel && typeLabel.indexOf('type.') !== 0) metaParts.push(typeLabel);
    if (venue.rating) metaParts.push('★ ' + venue.rating);
    if (venue.price) metaParts.push(new Array(venue.price + 1).join('$'));
    metaParts.push(regionLabel);
    var meta = document.createElement('div');
    meta.className = 'trip-slot-meta';
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);

    if (venue.address) {
      var addr = document.createElement('div');
      addr.className = 'trip-slot-address';
      addr.textContent = venue.address;
      card.appendChild(addr);
    }

    var actions = document.createElement('div');
    actions.className = 'trip-slot-actions';

    if (url) {
      var viewLink = document.createElement('a');
      // Deliberately NOT class "trip-btn" -- the existing trip tray's
      // syncButtons() (above) selects EVERY .trip-btn element on the page
      // and force-overwrites its textContent to "Add to trip"/"In trip"
      // based on dataset.tripName, with no other eligibility check. Reusing
      // that class here for styling only stomped this link's real "View
      // venue" text the moment __syncTripButtons() ran. .trip-slot-view-link
      // gets the identical visual treatment via CSS instead (see
      // renderTripPlannerStyles() in server.js).
      viewLink.className = 'trip-slot-view-link';
      viewLink.href = url;
      viewLink.textContent = t('trip.planner.viewVenue');
      actions.appendChild(viewLink);
    }

    // Real "add to this saved trip" control -- identical dataset shape
    // (tripName/tripQuery/tripRegion) to the ones venue cards already
    // render, so the EXISTING trip-tray IIFE's own document-level click
    // handler picks it up with no new logic. Uses the venue's real address
    // when we have it (more accurate than the older name+region search
    // string venue cards fall back to) for the tray's "Get route" links.
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'trip-btn';
    addBtn.dataset.tripQuery = venue.address ? (venue.name + ', ' + venue.address) : (venue.name + ', ' + regionLabel + ', Okanagan Valley, BC');
    addBtn.dataset.tripName = venue.name;
    addBtn.dataset.tripRegion = venue.region;
    addBtn.textContent = t('trip.addToTrip');
    actions.appendChild(addBtn);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = t('trip.planner.removeStop');
    removeBtn.addEventListener('click', function(){
      card.classList.add('is-removed');
      var removedId = parseInt(card.dataset.id, 10);
      if (!isNaN(removedId) && excludedVenueIds.indexOf(removedId) === -1) {
        excludedVenueIds.push(removedId);
      }
      refreshMap();
    });
    actions.appendChild(removeBtn);

    card.appendChild(actions);
    return card;
  }

  // Deliberately takes no action if the map container is still hidden --
  // see refreshMap() below for why creating a Leaflet map inside a
  // display:none container is itself part of the root cause this fixes,
  // not just fitBounds() timing.
  function initMapIfNeeded() {
    if (map || typeof L === 'undefined') return;
    var container = document.getElementById('tripPlannerMap');
    if (!container) return;
    map = L.map('tripPlannerMap').setView([49.75, -119.55], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 15
    }).addTo(map);
  }

  // Rebuilds the map's markers/route line from whatever .trip-slot-card
  // elements are currently NOT removed -- called after every render and
  // after every "remove stop" click, so the map always matches what's
  // actually still shown in the day list.
  //
  // Markers/route line invisible bug (found via live production QA):
  // this used to unhide mapWrapEl and immediately call fitBounds() in the
  // same tick, with the FIRST-EVER Leaflet map also having been created
  // earlier (in renderItinerary(), before mapWrapEl was ever shown) --
  // i.e. inside a still-hidden, zero-size container. Leaflet's internal
  // size cache from that hidden-container creation isn't just "stale",
  // it stays wrong in a way a later invalidateSize() alone can't fully
  // recover from (confirmed by isolated reproduction: reordering
  // invalidateSize()-before-fitBounds() alone tightened the marker
  // cluster but left it still consistently offset outside the visible
  // container; only creating the map AFTER the container is visible
  // resolved it completely). Fixed by computing the points first, then
  // -- only once we know there's something to show -- unhiding the wrap
  // and creating the map (if this is the first time) AFTER that, so
  // Leaflet's initial size is correct from the start. The existing
  // requestAnimationFrame + invalidateSize()-before-fitBounds() ordering
  // is kept too, as defence in depth for the remaining case where the
  // map already existed from an earlier generate this session. Existing
  // Leaflet APIs only; no new library, no arbitrary pixel values.
  function refreshMap() {
    var points = [];
    var order = 0;
    daysEl.querySelectorAll('.trip-slot-card').forEach(function(card){
      if (card.classList.contains('is-removed')) return;
      var lat = card.dataset.lat, lng = card.dataset.lng;
      if (!lat || !lng) return;
      order++;
      points.push({ lat: parseFloat(lat), lng: parseFloat(lng), order: order, name: card.dataset.name || '' });
    });

    if (!points.length) {
      mapWrapEl.style.display = 'none';
      return;
    }

    mapWrapEl.style.display = '';
    initMapIfNeeded();
    if (!map) return; // Leaflet didn't load; nothing more to do

    mapMarkers.forEach(function(m){ map.removeLayer(m); });
    mapMarkers = [];
    if (mapLine) { map.removeLayer(mapLine); mapLine = null; }

    var latLngs = [];
    points.forEach(function(p){
      var marker = L.marker([p.lat, p.lng]).addTo(map);
      var popupEl = document.createElement('div');
      popupEl.textContent = p.order + '. ' + p.name;
      marker.bindPopup(popupEl);
      mapMarkers.push(marker);
      latLngs.push([p.lat, p.lng]);
    });
    mapLine = L.polyline(latLngs, { color: '#2A6B67', weight: 3, opacity: 0.7 }).addTo(map);

    requestAnimationFrame(function(){
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] });
    });
  }

  function renderItinerary(plan) {
    daysEl.textContent = '';
    (plan.itinerary || []).forEach(function(dayPlan){
      var dayEl = document.createElement('div');
      dayEl.className = 'trip-day';

      var h3 = document.createElement('h3');
      h3.textContent = t('trip.planner.day') + ' ' + dayPlan.day;
      dayEl.appendChild(h3);

      var slotsEl = document.createElement('div');
      slotsEl.className = 'trip-day-slots';
      DAYPARTS.forEach(function(daypart){
        slotsEl.appendChild(buildSlotCard(daypart, dayPlan[daypart]));
      });
      dayEl.appendChild(slotsEl);
      daysEl.appendChild(dayEl);
    });

    if (plan.warnings && plan.warnings.length) {
      warningsEl.textContent = '';
      var heading = document.createElement('strong');
      heading.textContent = t('trip.planner.warningsHeading');
      warningsEl.appendChild(heading);
      var ul = document.createElement('ul');
      plan.warnings.forEach(function(w){
        var li = document.createElement('li');
        li.textContent = w;
        ul.appendChild(li);
      });
      warningsEl.appendChild(ul);
      warningsEl.style.display = '';
    } else {
      warningsEl.style.display = 'none';
    }

    resultEl.style.display = '';
    // refreshMap() itself now handles map creation (see its own comment
    // above for why this must NOT happen earlier, while the map wrap is
    // still hidden).
    refreshMap();

    if (window.__syncTripButtons) window.__syncTripButtons();
    if (window.trackEvent) window.trackEvent('generate_trip', { region: plan.region, days: plan.days, pace: plan.pace });
  }

  function collectParams() {
    var region = document.getElementById('tripRegionSelect').value;
    var days = parseInt(document.getElementById('tripDaysInput').value, 10);
    var interests = Array.prototype.slice.call(form.querySelectorAll('input[name="tripInterest"]:checked')).map(function(el){ return el.value; });
    var paceEl = form.querySelector('input[name="pace"]:checked');
    var pace = paceEl ? paceEl.value : 'standard';
    return { region: region, days: days, interests: interests, pace: pace };
  }

  // ALL itinerary selection/ordering logic lives server-side (Stage 1) --
  // this function only validates the two required fields well enough to
  // avoid an obviously-wasted request, sends them, and renders whatever
  // comes back. It never re-implements or second-guesses the backend's
  // picks.
  //
  // paramsOverride (conversational /trip experience, added later): when
  // provided, used instead of reading the wizard form fields -- lets the
  // conversational flow reuse this exact same fetch/render/error-handling
  // pipeline (and therefore the same single call to /api/trip/generate)
  // rather than duplicating it. The wizard's own form submit/regenerate
  // handlers below still call generateTrip() with no arguments, so their
  // behavior is completely unchanged.
  //
  // isRegenerate (Regenerate-exclusion fix): true ONLY for the Regenerate
  // button's own call site below -- every other caller (wizard submit,
  // conversational parse-and-generate) is a genuinely NEW itinerary, so
  // excludedVenueIds is reset right here rather than left to accumulate
  // across unrelated trips.
  function generateTrip(paramsOverride, isRegenerate) {
    var params = paramsOverride || collectParams();
    if (!params.region) {
      setStatus(t('trip.planner.errorNoRegion'), 'error');
      return;
    }
    if (!params.days || params.days < 1 || params.days > 7) {
      setStatus(t('trip.planner.errorDays'), 'error');
      return;
    }

    if (!isRegenerate) {
      excludedVenueIds = [];
    }

    generateBtn.disabled = true;
    if (regenerateBtn) regenerateBtn.disabled = true;
    // Regenerate's own visible loading indicator -- the button it's
    // triggered from is typically scrolled well past #tripPlannerStatus
    // (the setStatus() spinner below is still set too, for the plain
    // Generate case and as a fallback, but a user looking at Regenerate
    // itself needs feedback right there). Never applied for a plain
    // Generate call, so that button's own behavior is unchanged.
    if (isRegenerate && regenerateBtn) regenerateBtn.classList.add('is-loading');
    setStatus(t('trip.planner.generating'), 'loading');

    var requestBody = Object.assign({}, params, { excludeVenueIds: excludedVenueIds });

    fetch('/api/trip/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }).then(function(res){
      return res.json().then(function(body){ return { ok: res.ok, body: body }; });
    }).then(function(result){
      generateBtn.disabled = false;
      if (regenerateBtn) { regenerateBtn.disabled = false; regenerateBtn.classList.remove('is-loading'); }
      if (!result.ok) {
        setStatus((result.body && result.body.error) || t('trip.planner.errorGeneric'), 'error');
        return;
      }
      setStatus('', null);
      lastGeneratedParams = params;
      renderItinerary(result.body);
      if (window.trackEvent) window.trackEvent('open_trip_planner_result');
    }).catch(function(){
      generateBtn.disabled = false;
      if (regenerateBtn) { regenerateBtn.disabled = false; regenerateBtn.classList.remove('is-loading'); }
      setStatus(t('trip.planner.errorNetwork'), 'error');
    });
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    generateTrip();
  });

  if (regenerateBtn) {
    // Reuse whichever params last actually produced a result, regardless
    // of which flow generated it -- NOT a fresh collectParams() read of
    // the wizard form, which is empty whenever the itinerary on screen
    // came from the conversational flow instead. Falls back to undefined
    // (-> collectParams()) when nothing has been successfully generated
    // yet, which preserves the original "please choose a region first"
    // validation for that case.
    regenerateBtn.addEventListener('click', function(){ generateTrip(lastGeneratedParams || undefined, true); });
  }

  // Exposed so the conversational /trip module (below) can generate an
  // itinerary from its own parsed/edited params without re-implementing
  // any of the fetch/render/error-handling logic above.
  window.__tripGenerateFromParams = generateTrip;
})();

/* ---------- Build My Trip, Stage 4: conversational /trip experience ----------
   The primary /trip experience: a free-text box that calls the existing,
   free, deterministic local parser at POST /api/trip/parse, shows what was
   understood as editable region/days/pace fields and removable interest/
   amenity/discovery chips, surfaces anything unsupported or needing
   clarification, and -- once region+days are known -- hands the resulting
   structured params to the EXISTING wizard's generateTrip() (exposed just
   above as window.__tripGenerateFromParams) to actually build the
   itinerary. This module never selects venues, never re-implements
   itinerary logic, and never calls anything other than the two existing
   endpoints (/api/trip/parse, /api/trip/generate via the shared function).
   The step-by-step wizard above remains fully intact as the fallback path,
   toggled via #tripConvWizardToggle. ---------- */
(function(){
  var heroEl = document.getElementById('tripConvHero');
  if (!heroEl) return; // not on /trip, or markup not present

  var inputEl = document.getElementById('tripConvInput');
  var submitBtn = document.getElementById('tripConvSubmitBtn');
  var statusEl = document.getElementById('tripConvStatus');
  var understoodEl = document.getElementById('tripConvUnderstood');
  var chipsEl = document.getElementById('tripConvChips');
  var clarifyEl = document.getElementById('tripConvClarify');
  var unsupportedEl = document.getElementById('tripConvUnsupported');
  var generateBtn = document.getElementById('tripConvGenerateBtn');
  var wizardToggle = document.getElementById('tripConvWizardToggle');
  var wizardSection = document.getElementById('tripWizardSection');
  var exampleChips = document.querySelectorAll('.trip-conv-example-chip');
  var wizardRegionSelect = document.getElementById('tripRegionSelect');

  // field -> i18n key maps, reusing the SAME keys the rest of the site
  // already uses for these exact concepts (badge chips, venue types, the
  // Hidden Gems section) -- no new/competing translation source of truth.
  var AMENITY_I18N_KEY = {
    dog_friendly: 'badge.dogFriendly', vegan: 'badge.vegan', vegetarian: 'badge.vegetarian',
    gluten_free: 'badge.glutenFree', patio: 'badge.patio', kid_friendly: 'badge.kidFriendly',
    lake_view: 'badge.lakeView', nonalcoholic: 'badge.nonalcoholic', sports_tv: 'badge.sportsTv',
    live_music: 'badge.liveMusic', great_groups: 'badge.greatGroups', happy_hour: 'badge.happyHour'
  };
  var BUDGET_I18N_KEY = { budget: 'trip.conv.budget.budget', moderate: 'trip.conv.budget.moderate', upscale: 'trip.conv.budget.upscale' };
  var DISCOVERY_I18N_KEY = { hidden_gem: 'gems.heading' };

  // The current editable parsed state (the exact shape POST /api/trip/parse
  // returns): { region, days, interests[], amenities[], pace, budget,
  // discovery[], unsupported[], needs_clarification[] }. Null until a
  // parse succeeds.
  var current = null;

  function setStatus(text, mode) {
    statusEl.textContent = text || '';
    statusEl.className = 'trip-conv-status' + (mode ? ' is-' + mode : '');
  }

  function buildChip(labelText, onRemove) {
    var chip = document.createElement('span');
    chip.className = 'trip-conv-chip';
    var text = document.createElement('span');
    text.textContent = labelText;
    chip.appendChild(text);
    if (onRemove) {
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'trip-conv-chip-remove';
      rm.setAttribute('aria-label', t('trip.conv.removeChip'));
      rm.textContent = '×';
      rm.addEventListener('click', onRemove);
      chip.appendChild(rm);
    }
    return chip;
  }

  function buildSelectField(labelText, id, currentValue, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'trip-conv-field';
    var label = document.createElement('label');
    label.textContent = labelText;
    label.setAttribute('for', id);
    wrap.appendChild(label);
    var select = document.createElement('select');
    select.id = id;
    // Trusted: copied verbatim from the server-rendered wizard region
    // <select> already in this same page (never from API/user input), so
    // this is not a new innerHTML-with-untrusted-data pattern.
    select.innerHTML = wizardRegionSelect ? wizardRegionSelect.innerHTML : '';
    select.value = currentValue || '';
    select.addEventListener('change', function(){ onChange(select.value || null); });
    wrap.appendChild(select);
    return wrap;
  }

  function buildDaysField(currentValue, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'trip-conv-field';
    var label = document.createElement('label');
    label.textContent = t('trip.conv.fieldDays');
    label.setAttribute('for', 'tripConvDaysInput');
    wrap.appendChild(label);
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '7';
    input.id = 'tripConvDaysInput';
    if (currentValue) input.value = String(currentValue);
    input.addEventListener('change', function(){
      var n = parseInt(input.value, 10);
      onChange((n >= 1 && n <= 7) ? n : null);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function buildPaceField(currentValue, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'trip-conv-field trip-conv-pace-field';
    var label = document.createElement('span');
    label.className = 'trip-conv-field-label';
    label.textContent = t('trip.conv.fieldPace');
    wrap.appendChild(label);
    var group = document.createElement('div');
    group.className = 'trip-conv-pace-buttons';
    ['relaxed', 'standard', 'packed'].forEach(function(p){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trip-conv-pace-btn' + (p === currentValue ? ' is-active' : '');
      btn.textContent = t('trip.planner.pace.' + p);
      btn.addEventListener('click', function(){ onChange(p); });
      group.appendChild(btn);
    });
    wrap.appendChild(group);
    return wrap;
  }

  function buildChipGroup(labelText, values, labelFn, onRemove) {
    var wrap = document.createElement('div');
    wrap.className = 'trip-conv-field';
    var label = document.createElement('span');
    label.className = 'trip-conv-field-label';
    label.textContent = labelText;
    wrap.appendChild(label);
    var group = document.createElement('div');
    group.className = 'trip-conv-chip-group';
    values.forEach(function(v){
      group.appendChild(buildChip(labelFn(v), function(){ onRemove(v); }));
    });
    wrap.appendChild(group);
    return wrap;
  }

  function removeFromList(key, value) {
    current[key] = current[key].filter(function(v){ return v !== value; });
    renderUnderstood();
  }

  function renderUnderstood() {
    if (!current) { understoodEl.style.display = 'none'; return; }
    chipsEl.textContent = '';

    chipsEl.appendChild(buildSelectField(t('trip.conv.fieldRegion'), 'tripConvRegionSelect', current.region, function(v){ current.region = v; renderUnderstood(); }));
    chipsEl.appendChild(buildDaysField(current.days, function(v){ current.days = v; renderUnderstood(); }));
    chipsEl.appendChild(buildPaceField(current.pace || 'standard', function(v){ current.pace = v; renderUnderstood(); }));

    if (current.interests && current.interests.length) {
      chipsEl.appendChild(buildChipGroup(t('trip.conv.fieldInterests'), current.interests, function(v){ return t('type.' + v); }, function(v){ removeFromList('interests', v); }));
    }
    if (current.amenities && current.amenities.length) {
      chipsEl.appendChild(buildChipGroup(t('trip.conv.fieldAmenities'), current.amenities, function(v){ return t(AMENITY_I18N_KEY[v] || v); }, function(v){ removeFromList('amenities', v); }));
    }
    if (current.discovery && current.discovery.length) {
      chipsEl.appendChild(buildChipGroup(t('trip.conv.fieldDiscovery'), current.discovery, function(v){ return t(DISCOVERY_I18N_KEY[v] || v); }, function(v){ removeFromList('discovery', v); }));
    }
    if (current.budget) {
      chipsEl.appendChild(buildChipGroup(t('trip.conv.fieldBudget'), [current.budget], function(v){ return t(BUDGET_I18N_KEY[v] || v); }, function(){ current.budget = null; renderUnderstood(); }));
    }

    var missingRegion = !current.region;
    var missingDays = !current.days;
    if (missingRegion || missingDays) {
      clarifyEl.textContent = missingRegion && missingDays
        ? t('trip.conv.clarifyBoth')
        : (missingRegion ? t('trip.conv.clarifyRegion') : t('trip.conv.clarifyDays'));
      clarifyEl.style.display = '';
    } else {
      clarifyEl.style.display = 'none';
    }

    if (current.unsupported && current.unsupported.length) {
      unsupportedEl.textContent = '';
      var intro = document.createElement('strong');
      intro.textContent = t('trip.conv.unsupportedIntro');
      unsupportedEl.appendChild(intro);
      var ul = document.createElement('ul');
      current.unsupported.forEach(function(term){
        var li = document.createElement('li');
        li.textContent = /beach/i.test(term) ? t('trip.conv.unsupportedBeaches') : t('trip.conv.unsupportedGeneric').replace('{term}', term);
        ul.appendChild(li);
      });
      unsupportedEl.appendChild(ul);
      unsupportedEl.style.display = '';
    } else {
      unsupportedEl.style.display = 'none';
    }

    generateBtn.disabled = missingRegion || missingDays;
  }

  function submitConversational(text) {
    var value = (typeof text === 'string' ? text : inputEl.value || '').trim();
    if (!value) {
      setStatus(t('trip.conv.errorEmpty'), 'error');
      return;
    }
    inputEl.value = value;
    submitBtn.disabled = true;
    understoodEl.style.display = 'none';
    setStatus(t('trip.conv.parsing'), 'loading');

    fetch('/api/trip/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value })
    }).then(function(res){
      return res.json().then(function(body){ return { ok: res.ok, body: body }; });
    }).then(function(result){
      submitBtn.disabled = false;
      if (!result.ok) {
        setStatus((result.body && result.body.error) || t('trip.conv.errorGeneric'), 'error');
        return;
      }
      setStatus('', null);
      current = result.body;
      understoodEl.style.display = '';
      renderUnderstood();
      if (window.trackEvent) {
        window.trackEvent('trip_conversational_parse', {
          hasRegion: !!current.region, hasDays: !!current.days,
          unsupportedCount: (current.unsupported || []).length
        });
      }
    }).catch(function(){
      submitBtn.disabled = false;
      setStatus(t('trip.planner.errorNetwork'), 'error');
    });
  }

  submitBtn.addEventListener('click', function(){ submitConversational(); });

  exampleChips.forEach(function(chip){
    chip.addEventListener('click', function(){
      submitConversational(chip.textContent);
    });
  });

  generateBtn.addEventListener('click', function(){
    if (!current || !current.region || !current.days) return;
    window.__tripGenerateFromParams({
      region: current.region,
      days: current.days,
      interests: current.interests || [],
      pace: current.pace || 'standard',
      amenities: current.amenities || [],
      budget: current.budget || null,
      discovery: current.discovery || []
    });
    var resultEl = document.getElementById('tripPlannerResult');
    if (resultEl) {
      setTimeout(function(){ resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    }
    if (window.trackEvent) window.trackEvent('trip_conversational_generate_click');
  });

  if (wizardToggle && wizardSection) {
    wizardToggle.addEventListener('click', function(){
      var willShow = wizardSection.style.display === 'none';
      wizardSection.style.display = willShow ? '' : 'none';
      wizardToggle.setAttribute('aria-expanded', String(willShow));
      if (willShow) wizardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Exposed so a language switch (applyTranslations(), above) can re-render
  // the already-parsed understood panel in the newly active language --
  // same pattern as window.__syncTripButtons/__renderTripTray. A no-op
  // when nothing has been parsed yet (renderUnderstood() itself no-ops
  // when `current` is null).
  window.__renderTripConvUnderstood = renderUnderstood;
})();

/* ---------- Near me: geolocation-based distance to each region ---------- */
(function(){
  var btn = document.getElementById('nearMeBtn');
  var status = document.getElementById('nearMeStatus');
  if (!btn || !status) return;

  // Approximate town-centre coordinates for each region. Good enough for
  // relative "which region is closest" ordering — not survey-grade, but
  // there's no per-venue location data to work from (see trip planner).
  var REGION_COORDS = {
    "kelowna": [49.8880, -119.4960],
    "west-kelowna": [49.8600, -119.6053],
    "peachland": [49.7729, -119.7370],
    "lake-country": [50.0730, -119.4048],
    "naramata": [49.5990, -119.5860],
    "penticton": [49.5008, -119.5939],
    "kaleden": [49.4028, -119.6122],
    "okanagan-falls": [49.3438, -119.5620],
    "summerland": [49.5988, -119.6772],
    "oliver": [49.1822, -119.5506],
    "osoyoos": [49.0325, -119.4683],
    "vernon": [50.2683, -119.2676],
    "coldstream": [50.2213, -119.2138],
    "lumby": [50.2504, -118.9668],
    "armstrong": [50.4498, -119.1968],
    "enderby": [50.5504, -119.1414],
    "big-white": [49.7314, -118.9339],
    "silverstar": [50.3597, -119.0567],
    "apex": [49.3775, -119.9033],
    "baldy": [49.1167, -119.3167]
  };

  function haversineKm(lat1, lon1, lat2, lon2){
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Exposed so other features (like the weather banner) can find the nearest
  // region from a lat/lon without duplicating this module's coordinate set.
  window.__findNearestRegion = function(userLat, userLon){
    var closestSlug = null;
    var closestKm = Infinity;
    Object.keys(REGION_COORDS).forEach(function(slug){
      var coords = REGION_COORDS[slug];
      var km = haversineKm(userLat, userLon, coords[0], coords[1]);
      if (km < closestKm) {
        closestKm = km;
        closestSlug = slug;
      }
    });
    if (!closestSlug) return null;
    return {
      slug: closestSlug,
      label: (window.CARD_REGION_LABEL && window.CARD_REGION_LABEL[closestSlug]) || closestSlug,
      coords: REGION_COORDS[closestSlug],
      km: closestKm
    };
  };

  // Approximate distance between two regions' hub coordinates — not exact
  // venue-to-venue distance (no per-venue coordinates exist), but a fair
  // stand-in for "roughly how far is the next stop."
  window.__distanceBetweenRegions = function(slugA, slugB){
    if (!slugA || !slugB || !REGION_COORDS[slugA] || !REGION_COORDS[slugB]) return null;
    if (slugA === slugB) return 0;
    var a = REGION_COORDS[slugA];
    var b = REGION_COORDS[slugB];
    return haversineKm(a[0], a[1], b[0], b[1]);
  };

  function showStatus(text){
    status.textContent = text;
    status.style.display = 'inline';
  }

  btn.addEventListener('click', function(){
    if (!navigator.geolocation) {
      showStatus('Location isn\u2019t supported in this browser.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Finding you\u2026';

    navigator.geolocation.getCurrentPosition(function(pos){
      var userLat = pos.coords.latitude;
      var userLon = pos.coords.longitude;

      var distances = {};
      var closestSlug = null;
      var closestKm = Infinity;

      Object.keys(REGION_COORDS).forEach(function(slug){
        var coords = REGION_COORDS[slug];
        var km = haversineKm(userLat, userLon, coords[0], coords[1]);
        distances[slug] = km;
        if (km < closestKm) {
          closestKm = km;
          closestSlug = slug;
        }
      });

      document.querySelectorAll('.region-chip').forEach(function(chip){
        var slug = chip.dataset.region;
        if (slug === 'all' || !(slug in distances)) return;
        var baseText = chip.textContent.replace(/\s*\u00b7.*$/, '');
        chip.innerHTML = baseText + ' <span class="region-distance">\u00b7 ' + Math.round(distances[slug]) + ' km</span>';
      });

      btn.disabled = false;
      btn.textContent = '📍 Use my location';
      var closestLabel = (closestSlug && window.CARD_REGION_LABEL && window.CARD_REGION_LABEL[closestSlug]) || closestSlug || '';
      showStatus('Closest: ' + closestLabel + ' \u2014 selected below.');

      if (closestSlug) {
        var targetChip = document.querySelector('.region-chip[data-region="' + closestSlug + '"]');
        if (targetChip) targetChip.click();
      }
    }, function(err){
      btn.disabled = false;
      btn.textContent = '📍 Use my location';
      if (err.code === err.PERMISSION_DENIED) {
        showStatus('Location access was denied \u2014 you can still pick a region manually.');
      } else {
        showStatus('Couldn\u2019t determine your location right now.');
      }
    }, { timeout: 10000 });
  });
})();

/* ---------- Favorites: heart a venue, filter to just your favorites ---------- */
(function(){
  var countEl = document.getElementById('favoritesCount');

  var favorites = new Set();
  try {
    var saved = window.localStorage.getItem('okanaganFavorites');
    if (saved) favorites = new Set(JSON.parse(saved));
  } catch (e) { favorites = new Set(); }

  function save(){
    try { window.localStorage.setItem('okanaganFavorites', JSON.stringify(Array.from(favorites))); } catch (e) {}
  }

  var HEART_OUTLINE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var HEART_FILLED = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

  function syncButtons(){
    document.querySelectorAll('.fav-btn').forEach(function(btn){
      var isFav = favorites.has(btn.dataset.favName);
      btn.classList.toggle('is-fav', isFav);
      btn.innerHTML = (isFav ? HEART_FILLED : HEART_OUTLINE) + ' ' + (isFav ? t('card.favorited') : t('card.favorite'));

      var card = btn.closest('.venue-card, .featured-card');
      if (card) card.dataset.favorite = isFav ? '1' : '0';
    });
    if (countEl) countEl.textContent = favorites.size;
  }

  function toggleFavorite(name){
    if (favorites.has(name)) {
      favorites.delete(name);
      if (window.trackEvent) window.trackEvent('remove_from_favorites', { venue_name: name });
    } else {
      favorites.add(name);
      if (window.trackEvent) window.trackEvent('add_to_favorites', { venue_name: name });
    }
    save();
    syncButtons();
    if (window.__applyFilters) window.__applyFilters();
  }

  document.addEventListener('click', function(e){
    var favBtn = e.target.closest('.fav-btn');
    if (!favBtn) return;
    toggleFavorite(favBtn.dataset.favName);
  });

  syncButtons();

  // Exposed so initBlock11 can re-sync once it actually builds the fav-btn
  // elements for the freshly-rendered cards (same timing issue as trip-btn).
  window.__syncFavButtons = syncButtons;
})();

/* ---------- Weather-aware suggestions: real current conditions for Kelowna, mapped to a relevant filter suggestion ---------- */
(function(){
  var banner = document.getElementById('weatherBanner');
  var iconEl = document.getElementById('weatherIcon');
  var conditionEl = document.getElementById('weatherCondition');
  var suggestionEl = document.getElementById('weatherSuggestion');
  var btn = document.getElementById('weatherBannerBtn');
  if (!banner) return;

  var KELOWNA_LAT = 49.888, KELOWNA_LON = -119.496;
  var suggestedFilters = [];

  function weatherCodeInfo(code){
    if (code === 0) return { icon: '☀️', text: 'Clear skies' };
    if (code === 1 || code === 2) return { icon: '🌤️', text: 'Mostly sunny' };
    if (code === 3) return { icon: '☁️', text: 'Overcast' };
    if (code === 45 || code === 48) return { icon: '🌫️', text: 'Foggy' };
    if (code >= 51 && code <= 55) return { icon: '🌦️', text: 'Light drizzle' };
    if (code >= 61 && code <= 65) return { icon: '🌧️', text: 'Rainy' };
    if (code >= 80 && code <= 82) return { icon: '🌧️', text: 'Rain showers' };
    if (code >= 71 && code <= 75) return { icon: '❄️', text: 'Snowy' };
    if (code >= 95) return { icon: '⛈️', text: 'Thunderstorms' };
    return { icon: '🌡️', text: 'Mixed conditions' };
  }

  function buildSuggestion(tempC, code){
    var isRainy = (code >= 51 && code <= 65) || (code >= 80 && code <= 82) || code >= 95;
    var isSnowy = code >= 71 && code <= 75;

    if (isSnowy || tempC < 8) {
      suggestedFilters = [];
      return 'Bundle up — a great day for cozy indoor wine tasting.';
    }
    if (isRainy) {
      suggestedFilters = ['groups'];
      return 'Rainy day calls for good company somewhere warm and dry.';
    }
    if (tempC >= 28) {
      suggestedFilters = ['patio', 'nonalc'];
      return 'Hot one today — patios with a cold non-alcoholic option to cool off.';
    }
    if (tempC >= 20) {
      suggestedFilters = ['patio', 'view'];
      return 'Perfect patio weather — here\u2019s where to catch some sun with a view.';
    }
    suggestedFilters = [];
    return 'Good day to explore the valley — here\u2019s what\u2019s nearby.';
  }

  var matchedRegionSlug = null;

  function renderWeather(lat, lon, label){
    return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code&temperature_unit=celsius')
      .then(function(res){ return res.json(); })
      .then(function(data){
        var tempC = Math.round(data.current.temperature_2m);
        var code = data.current.weather_code;
        var info = weatherCodeInfo(code);

        iconEl.textContent = info.icon;
        conditionEl.textContent = 'It\u2019s ' + tempC + '\u00b0C and ' + info.text.toLowerCase() + ' in ' + label + ' right now';
        suggestionEl.textContent = buildSuggestion(tempC, code);
        banner.style.display = '';
      });
  }

  btn.addEventListener('click', function(){
    suggestedFilters.forEach(function(f){
      var chip = document.querySelector('.stamp-btn[data-filter="' + f + '"]');
      if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
    });
    if (matchedRegionSlug) {
      var regionChip = document.querySelector('.region-chip[data-region="' + matchedRegionSlug + '"]');
      if (regionChip && regionChip.getAttribute('aria-pressed') !== 'true') regionChip.click();
    }
    // showStep('results') (triggered by this event) already scrolls to the
    // grid with the correct sticky-header offset — an additional manual
    // grid.scrollIntoView() here used to fire a second, competing smooth
    // scroll with no offset, and the two would race and settle somewhere
    // between their targets.
    document.dispatchEvent(new Event('wizard:showResults'));
    if (window.__hideFilterBarNow) window.__hideFilterBarNow();
  });

  function useKelownaFallback(){
    renderWeather(KELOWNA_LAT, KELOWNA_LON, 'Kelowna').catch(function(){
      // Weather unavailable — banner just stays hidden rather than showing broken/stale info.
    });
  }

  // Only use location if the visitor has ALREADY granted it elsewhere (e.g. via
  // "Use my location" in the wizard) — never prompt fresh from here, since a
  // surprise permission popup on page load is bad UX. Falls back to Kelowna
  // (the region's hub) for everyone else, same as before.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(function(result){
      if (result.state !== 'granted' || !window.__findNearestRegion) {
        useKelownaFallback();
        return;
      }
      navigator.geolocation.getCurrentPosition(function(pos){
        var nearest = window.__findNearestRegion(pos.coords.latitude, pos.coords.longitude);
        if (!nearest) { useKelownaFallback(); return; }
        matchedRegionSlug = nearest.slug;
        renderWeather(nearest.coords[0], nearest.coords[1], nearest.label).catch(useKelownaFallback);
      }, useKelownaFallback, { timeout: 5000 });
    }).catch(useKelownaFallback);
  } else {
    useKelownaFallback();
  }
})();

/* ---------- Weekly spotlight: an automatically-rotating highlight from the full venue list, not manually curated ---------- */
(function(){
  var banner = document.getElementById('spotlightBanner');
  var nameEl = document.getElementById('spotlightName');
  var metaEl = document.getElementById('spotlightMeta');
  var descEl = document.getElementById('spotlightDesc');
  var badgesEl = document.getElementById('spotlightBadges');
  var btn = document.getElementById('spotlightBtn');
  if (!banner) return;

  var spotlightVenue = null;

  btn.addEventListener('click', function(){
    if (!spotlightVenue) return;
    if (window.trackEvent) window.trackEvent('spotlight_click', { venue_name: spotlightVenue.name });
    if (window.__showResultsNoScroll) { window.__showResultsNoScroll(); }
    else { document.dispatchEvent(new Event('wizard:showResults')); }
    if (window.__hideFilterBarNow) window.__hideFilterBarNow();
    setTimeout(function(){
      window.__scrollToVenueCard(spotlightVenue.name);
    }, 50);
  });

  fetch(API_BASE + '/api/venues?limit=5000')
    .then(function(res){ return res.json(); })
    .then(function(data){
      var venues = data.venues || [];
      // Quality bar: only genuinely well-regarded venues are spotlight-worthy.
      var pool = venues.filter(function(v){
        return v.rating && v.rating >= 4.5 && v.reviews && v.reviews >= 100 && v.description;
      });
      if (pool.length === 0) return;

      // Deterministic weekly rotation: same pick all week, automatically
      // different next week — no manual curation needed.
      var weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
      var index = weekNumber % pool.length;
      var v = pool[index];
      spotlightVenue = v;

      var regionLabel = (window.CARD_REGION_LABEL && window.CARD_REGION_LABEL[v.region]) || v.region;
      var typeLabel = t((window.CARD_TYPE_LABEL && window.CARD_TYPE_LABEL[v.type]) || '') || (v.type.charAt(0).toUpperCase() + v.type.slice(1));

      nameEl.innerHTML = '<a href="#directory">' + v.name.replace(/</g, '&lt;') + '</a>';
      metaEl.textContent = regionLabel + ' \u00b7 ' + typeLabel + ' \u00b7 \u2605 ' + v.rating + ' (' + v.reviews + ' reviews)';
      descEl.textContent = v.description;

      if (window.CARD_BADGES) {
        badgesEl.innerHTML = window.CARD_BADGES.filter(function(b){ return v[b.field]; }).slice(0, 4).map(function(b){
          var content = b.text ? '<span class="badge-text-icon">' + b.text + '</span>' : b.icon;
          var label = escapeAttr(t(b.label));
          return '<span class="badge" aria-label="' + label + '" data-tooltip="' + label + '">' + content + '</span>';
        }).join('');
      }

      banner.style.display = '';
    })
    .catch(function(){
      // Spotlight data unavailable — banner just stays hidden.
    });
})();

/* ---------- Internal hash-anchor navigation: wait for the venue grid to
   finish loading before scrolling ----------
   The page has scroll-behavior:smooth set globally, and the ~810 venue
   cards load asynchronously and get inserted above several anchor targets
   (#list-venue, #app). If a link like "List Your Venue" is clicked before
   or during that async load, the page's height keeps growing mid-scroll
   animation and the browser ends up wherever the target USED to be —
   landing partway through the venue grid instead of the intended section.
   This intercepts internal hash links and only scrolls once the venue
   content has actually loaded and the page height has settled. */
document.addEventListener('click', function(e){
  var link = e.target.closest('a[href^="#"]');
  if (!link) return;
  var id = link.getAttribute('href').slice(1);
  if (!id) return;
  var target = document.getElementById(id);
  if (!target) return;

  e.preventDefault();

  function doScroll(){
    var headerEl = document.querySelector('header');
    var offset = (headerEl ? headerEl.offsetHeight : 0) + 12;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: top, behavior: 'smooth' });
    try { history.pushState(null, '', '#' + id); } catch (err) {}
  }

  if (window.__allVenues) {
    doScroll();
  } else {
    // Venues haven't loaded yet — wait briefly rather than scrolling to a
    // position that's about to shift underneath the animation. Gives up
    // after 4s and scrolls anyway so a slow/failed fetch never leaves the
    // link feeling unresponsive.
    var tries = 0;
    var poll = setInterval(function(){
      tries++;
      if (window.__allVenues || tries > 40) {
        clearInterval(poll);
        doScroll();
      }
    }, 100);
  }
});

/* ---------- Outbound link tracking ----------
   directions/menu/booking links are generated per-card by initBlock11 for
   all 810 venues — attaching an individual listener to each would be
   wasteful and would need to be redone every time cards re-render, so a
   single delegated listener on document covers every card, present and
   future, with one line of setup. */
document.addEventListener('click', function(e){
  var link = e.target.closest('.directions-link, .menu-link, .booking-link');
  if (!link) return;
  var card = link.closest('.venue-card, .featured-card');
  var venueName = card ? card.dataset.name : null;
  var linkType = link.classList.contains('directions-link') ? 'directions'
    : link.classList.contains('menu-link') ? 'menu' : 'booking';
  if (window.trackEvent) window.trackEvent('outbound_click', { link_type: linkType, venue_name: venueName });
});

loadVenuesAndInit();

(function(){
  document.addEventListener('click', function(e){
    var chip = e.target.closest && e.target.closest('.region-chip');
    if (!chip) return;
    setTimeout(function(){
      var continueBtn = document.getElementById('wizardTo2');
      if (continueBtn && continueBtn.offsetParent !== null) {
        continueBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  });
})();
