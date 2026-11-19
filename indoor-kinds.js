'use strict';
// Indoor test 4 (2026-11-19; Lauren, a Kelowna day spa: her $65 hydrotherapy circuit was "Adults / Adult admission /
// Admission" on every surface, the setup offered her birthday and school-group chips, a theatre's box office hint and a
// museum's gift-shop example). One table of words for every indoor kind, in English and French, so each kind reads in its
// own words everywhere: the page's Prices line, the card's small line under the price, the setup's Price screen, Your
// prices, the Help examples, the Groups chips, which hours hint shows, and the words search and Build My Trip read.
// Dayton's rule: no new fields or chips. Each kind swaps the same number of Groups chips; everything else is wording.
//
// Per kind:
//   boxOffice  the "box office hours go in Good to know" hint under "We don't have set hours" (theatres and classes only)
//   arts       a gift shop is one of its Good to know chips (Help names it)
//   quiet      a quiet daytime kind: no "Open after midnight?" row or second time on its day cards (indoor test 1)
//   day        a daytime kind (indoor test 5: play centres, climbing and trampolines, pools, spas; every quiet kind too): no
//              "Open after midnight?" row (theatres, bowling, arcades, casinos and cinemas keep it)
//   gtk        which Good to know chips and example it gets (owner-setup-text.js good_to_know_kinds: arts, active, kids, spa, shows,
//              pool, classes, general; indoor test 6: no lockers for a cinema, messy clothes and firing time for a studio)
//   ex         which story and Known for example it gets (storyExKinds / knownExKinds: theatre, museum, escape, spa,
//              climbing, classes, general), so a bowling alley never sees an escape room's example or a pool a climbing gym's
//   typeSub    (indoor test 6) the setup's "Type them in myself" line, in the kind's words ("Each class and its price")
//   en / fr:
//     price    page   the page's Prices line ({x} is the price: "From $65.", "Tickets from $25.")
//              basis  the card's small line under "From $65" ("Treatments and passes")
//              label  the Price screen's box label; ph its placeholder; lead the line under the question
//     prices   noun   what the place calls its list of prices ("spa menu", "tickets page", "class schedule")
//              page   the label of the prices link on the page ("Prices & rates", "Spa menu")
//              lead   Your prices' first line
//     help     walkin, ages, gift, prices: the examples Help gives this kind
//     groups   chips  the Groups screen's three quick answers; lead and ex: its lead and example
//     search   the words visitors use for it (search and Build My Trip read them)
const K = {};
const PRICES_PAGE = ['Prices & rates', 'Tarifs'];

// Indoor test 7 (2026-11-19; Robert): a gallery's own Good to know chips and story / Known for examples (museums keep theirs).
K.gallery = { quiet: true, gtk: 'gallery', ex: 'gallery', arts: true,
  en: { price: { page: 'Admission from {x}.', basis: 'Adult admission', label: 'Adult admission, in dollars', ph: 'Your regular adult admission', lead: 'Your regular adult admission. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Admission for adults, seniors, students and kids, memberships and tours, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; guided tours by appointment', ages: 'Kids under 12 with an adult', gift: 'Gift shop by the entrance; memberships at the front desk', prices: 'Seniors $8, kids under 12 free' },
    groups: { chips: ['School groups welcome', 'Guided group tours on request', 'Private events and rentals'], lead: 'Tap a size, then add school groups, guided tours or private events in your own words.', ex: 'School groups and guided tours by appointment' },
    search: ['art gallery', 'art galleries', 'gallery', 'galleries', 'exhibition', 'exhibitions'] },
  fr: { price: { page: 'Entrée à partir de {x}.', basis: 'Entrée adulte', label: 'Entrée adulte, en dollars', ph: 'Votre entrée adulte régulière', lead: 'Votre entrée adulte régulière. Elle paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'L’entrée pour les adultes, les aînés, les étudiants et les enfants, les abonnements et les visites, avec leurs prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; visites guidées sur rendez-vous', ages: 'Moins de 12 ans avec un adulte', gift: 'Boutique à l’entrée; abonnements à l’accueil', prices: 'Aînés 8 $, gratuit pour les moins de 12 ans' },
    groups: { chips: ['Groupes scolaires bienvenus', 'Visites guidées de groupe sur demande', 'Événements privés et location'], lead: 'Touchez une taille, puis ajoutez les groupes scolaires, les visites guidées ou les événements privés dans vos mots.', ex: 'Groupes scolaires et visites guidées sur rendez-vous' },
    search: ['galerie d’art', 'galeries d’art', 'galerie', 'galeries', 'exposition', 'expositions'] } };

K.museum = { quiet: true, gtk: 'arts', ex: 'museum', arts: true,
  en: { price: { page: 'Admission from {x}.', basis: 'Adult admission', label: 'Adult admission, in dollars', ph: 'Your regular adult admission', lead: 'Your regular adult admission. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Admission for adults, seniors, students and kids, family passes and memberships, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; school groups by appointment', ages: 'All ages; kids under 12 with an adult', gift: 'Gift shop by the entrance; memberships at the front desk', prices: 'Seniors $10, kids 6–12 $5, family pass $40' },
    groups: { chips: ['School groups welcome', 'Guided group tours on request', 'Private events and rentals'], lead: 'Tap a size, then add school groups, guided tours or private events in your own words.', ex: 'School groups and guided tours by appointment' },
    search: ['museum', 'museums', 'history', 'heritage', 'heritage site', 'science centre', 'science center'] },
  fr: { price: { page: 'Entrée à partir de {x}.', basis: 'Entrée adulte', label: 'Entrée adulte, en dollars', ph: 'Votre entrée adulte régulière', lead: 'Votre entrée adulte régulière. Elle paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'L’entrée pour les adultes, les aînés, les étudiants et les enfants, les laissez-passer familiaux et les abonnements, avec leurs prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; groupes scolaires sur rendez-vous', ages: 'Tous les âges; moins de 12 ans avec un adulte', gift: 'Boutique à l’entrée; abonnements à l’accueil', prices: 'Aînés 10 $, enfants de 6 à 12 ans 5 $, laissez-passer familial 40 $' },
    groups: { chips: ['Groupes scolaires bienvenus', 'Visites guidées de groupe sur demande', 'Événements privés et location'], lead: 'Touchez une taille, puis ajoutez les groupes scolaires, les visites guidées ou les événements privés dans vos mots.', ex: 'Groupes scolaires et visites guidées sur rendez-vous' },
    search: ['musée', 'musées', 'histoire', 'patrimoine', 'site patrimonial', 'centre des sciences'] } };

K.theatre = { gtk: 'shows', ex: 'theatre', boxOffice: true,
  en: { price: { page: 'Tickets from {x}.', basis: 'Tickets', label: 'Lowest regular adult ticket, in dollars', ph: 'Varies by show? Your lowest regular ticket.', lead: 'Your lowest regular adult ticket. It shows on your card.' },
    prices: { noun: 'tickets page', page: PRICES_PAGE[0], lead: 'Your ticket prices, season passes and group rates. A link to your tickets page is perfect. It’s optional.' },
    help: { walkin: 'Tickets at the door; buy ahead for busy shows', ages: 'All ages; some comedy nights 19+', gift: 'Gift certificates at the box office', prices: 'Season pass $180, groups of 10 or more save 10%' },
    groups: { chips: ['Group ticket rates for 10 or more', 'Venue rental for private events', 'School matinees on request'], lead: 'Tap a size, then add group ticket rates, venue rental or school shows in your own words.', ex: 'Group rates for 10 or more. The hall can be rented for private events' },
    search: ['theatre', 'theater', 'live theatre', 'a play', 'live show', 'concert', 'concerts', 'comedy', 'musical', 'musicals'] },
  fr: { price: { page: 'Billets à partir de {x}.', basis: 'Billets', label: 'Billet adulte régulier le moins cher, en dollars', ph: 'Ça varie selon le spectacle? Votre billet régulier le moins cher.', lead: 'Votre billet adulte régulier le moins cher. Il paraît sur votre fiche.' },
    prices: { noun: 'page de billets', page: PRICES_PAGE[1], lead: 'Le prix de vos billets, vos abonnements de saison et vos tarifs de groupe. Un lien vers votre page de billets, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Billets à la porte; achetez d’avance pour les spectacles populaires', ages: 'Tous les âges; certaines soirées d’humour 19+', gift: 'Certificats-cadeaux à la billetterie', prices: 'Abonnement de saison 180 $, 10 % de rabais pour les groupes de 10 ou plus' },
    groups: { chips: ['Tarifs de groupe pour 10 personnes ou plus', 'Location de la salle pour événements privés', 'Matinées scolaires sur demande'], lead: 'Touchez une taille, puis ajoutez les tarifs de groupe, la location de la salle ou les spectacles scolaires dans vos mots.', ex: 'Tarifs de groupe pour 10 personnes ou plus. La salle se loue pour des événements privés' },
    search: ['théâtre', 'pièce de théâtre', 'pièces', 'spectacle', 'spectacles', 'concert', 'concerts', 'humour', 'comédie musicale'] } };

K.cinema = { gtk: 'shows', ex: 'cinema',
  en: { price: { page: 'Tickets from {x}.', basis: 'Tickets', label: 'Regular adult ticket, in dollars', ph: 'Your regular adult ticket', lead: 'Your regular adult ticket. It shows on your card.' },
    prices: { noun: 'tickets page', page: PRICES_PAGE[0], lead: 'Your ticket prices for adults, kids and seniors, and cheap nights. A link to your tickets page is perfect. It’s optional.' },
    help: { walkin: 'Tickets at the door or online', ages: 'All ages; check each film’s rating', gift: 'Gift cards at the box office', prices: 'Kids and seniors $10, Tuesdays $8' },
    groups: { chips: ['Private screenings', 'Group tickets for 10 or more', 'Birthday parties with a movie'], lead: 'Tap a size, then add private screenings, group tickets or parties in your own words.', ex: 'Private screenings for up to 120. Birthday party packages' },
    search: ['cinema', 'cinemas', 'movie', 'movies', 'movie theatre', 'movie theater', 'film', 'films'] },
  fr: { price: { page: 'Billets à partir de {x}.', basis: 'Billets', label: 'Billet adulte régulier, en dollars', ph: 'Votre billet adulte régulier', lead: 'Votre billet adulte régulier. Il paraît sur votre fiche.' },
    prices: { noun: 'page de billets', page: PRICES_PAGE[1], lead: 'Le prix de vos billets pour adultes, enfants et aînés, et vos soirées à prix réduit. Un lien vers votre page de billets, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Billets à la porte ou en ligne', ages: 'Tous les âges; vérifiez le classement de chaque film', gift: 'Cartes-cadeaux à la billetterie', prices: 'Enfants et aînés 10 $, le mardi 8 $' },
    groups: { chips: ['Projections privées', 'Billets de groupe pour 10 personnes ou plus', 'Fêtes d’anniversaire avec un film'], lead: 'Touchez une taille, puis ajoutez les projections privées, les billets de groupe ou les fêtes dans vos mots.', ex: 'Projections privées jusqu’à 120 personnes. Forfaits pour fêtes d’anniversaire' },
    search: ['cinéma', 'cinémas', 'film', 'films', 'salle de cinéma'] } };

K.spa = { day: true, gtk: 'spa', ex: 'spa',
  en: { price: { page: 'From {x}.', basis: 'Treatments and passes', label: 'Your lowest price (a pass or your shortest treatment)', ph: 'Like a day pass or a 30-minute treatment', lead: 'Your lowest price: a pass or your shortest treatment. It shows on your card.' },
    prices: { noun: 'spa menu', page: 'Spa menu', lead: 'Every treatment, pass and package and what it costs, like a 60-minute massage. A photo of your spa menu or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Hydrotherapy circuit: walk-ins welcome. Treatments by appointment', ages: '16+ for treatments, 19+ for the circuit', gift: 'Gift cards for treatments and spa days, at the front desk or online', prices: 'Massage: 60 min $130, 90 min $175' },
    groups: { chips: ['Couples’ packages', 'Bridal and private parties', 'Private spa bookings on request'], lead: 'Tap a size, then add couples’ packages, bridal parties or private bookings in your own words.', ex: 'Couples’ packages. Bridal parties for up to 8' },
    search: ['spa', 'spas', 'day spa', 'massage', 'massages', 'couples massage', 'facial', 'facials', 'hydrotherapy', 'sauna', 'saunas', 'nordic spa', 'steam room', 'wellness', 'hot tub', 'hot tubs', 'whirlpool'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Soins et forfaits', label: 'Votre prix le plus bas (un forfait ou votre soin le plus court)', ph: 'Comme un forfait d’un jour ou un soin de 30 minutes', lead: 'Votre prix le plus bas : un forfait ou votre soin le plus court. Il paraît sur votre fiche.' },
    prices: { noun: 'carte des soins', page: 'Carte des soins', lead: 'Chaque soin, forfait et laissez-passer et son prix, comme un massage de 60 minutes. Une photo de votre carte des soins ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Circuit d’hydrothérapie : sans réservation. Soins sur rendez-vous', ages: '16+ pour les soins, 19+ pour le circuit', gift: 'Cartes-cadeaux pour les soins et les journées au spa, à l’accueil ou en ligne', prices: 'Massage : 60 min 130 $, 90 min 175 $' },
    groups: { chips: ['Forfaits pour couples', 'Fêtes de mariage et fêtes privées', 'Réservation privée du spa sur demande'], lead: 'Touchez une taille, puis ajoutez les forfaits pour couples, les fêtes de mariage ou les réservations privées dans vos mots.', ex: 'Forfaits pour couples. Fêtes de mariage jusqu’à 8 personnes' },
    search: ['spa', 'spas', 'spa de jour', 'massage', 'massages', 'massage en couple', 'soin du visage', 'soins du visage', 'hydrothérapie', 'sauna', 'spa nordique', 'bien-être', 'bain à remous', 'bain tourbillon'] } };

K.pool = { day: true, gtk: 'pool', ex: 'pool',
  en: { price: { page: 'Drop-in from {x}.', basis: 'Drop-in', label: 'Adult drop-in, in dollars', ph: 'Your adult drop-in price', lead: 'Your adult drop-in price. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Drop-in, passes and lessons for adults, kids and families, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Drop in during public swims; lessons need booking', ages: 'All ages; under 8 with an adult in the water', gift: 'Gift cards and passes at the front desk', prices: 'Kids $4, 10-visit pass $60' },
    groups: { chips: ['Birthday parties with a party room', 'School groups welcome', 'Pool or room rentals on request'], lead: 'Tap a size, then add birthday parties, school groups or rentals in your own words.', ex: 'Birthday parties with a party room. Pool rentals on request' },
    search: ['pool', 'pools', 'swim', 'swimming', 'lane swim', 'public swim', 'rec centre', 'recreation centre', 'aquatic centre', 'waterslide',
      // Indoor test 10 (2026-11-19): the words visitors use for a city pool (the vocabulary audit).
      'swimming pool', 'swimming pools', 'indoor pool', 'indoor pools', 'aquatic center', 'rec center', 'recreation center', 'leisure pool', 'wave pool', 'aquafit', 'aqua fit', 'water aerobics'] },
  fr: { price: { page: 'Entrée à la séance à partir de {x}.', basis: 'Entrée à la séance', label: 'Prix adulte à la séance, en dollars', ph: 'Votre prix adulte à la séance', lead: 'Votre prix adulte à la séance. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'L’entrée à la séance, les laissez-passer et les cours pour adultes, enfants et familles, avec leurs prix. Une photo de vos tarifs ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation pendant les bains libres; les cours se réservent', ages: 'Tous les âges; moins de 8 ans avec un adulte dans l’eau', gift: 'Cartes-cadeaux et laissez-passer à l’accueil', prices: 'Enfants 4 $, carte de 10 entrées 60 $' },
    groups: { chips: ['Fêtes d’anniversaire avec salle de fête', 'Groupes scolaires bienvenus', 'Location de la piscine ou d’une salle sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes scolaires ou les locations dans vos mots.', ex: 'Fêtes d’anniversaire avec salle de fête. Location de la piscine sur demande' },
    search: ['piscine', 'piscines', 'baignade', 'bain libre', 'nage en couloir', 'centre récréatif', 'centre aquatique', 'glissade d’eau', 'piscine intérieure', 'piscine publique', 'aquaforme', 'natation'] } };

K.climbing = { day: true, gtk: 'active', ex: 'climbing',
  en: { price: { page: 'Passes from {x}.', basis: 'Passes', label: 'Your lowest adult pass (day or timed)', ph: 'Like a day pass or a 60-minute jump', lead: 'Your lowest adult pass: a day pass or a timed jump. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Day passes, punch cards, memberships, lessons and gear rental, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; intro lessons by booking', ages: 'All ages; under 14 with an adult', gift: 'Gift cards and punch cards at the front desk', prices: 'Gear rental $8, 10-visit punch card $180' },
    groups: { chips: ['Birthday parties', 'School and camp groups', 'Team building and private bookings'], lead: 'Tap a size, then add birthday parties, school groups or team building in your own words.', ex: 'Birthday parties for up to 12 climbers. School and camp groups welcome' },
    search: ['climbing', 'climbing gym', 'bouldering', 'rock climbing', 'indoor climbing', 'trampoline', 'trampoline park', 'parkour', 'ninja', 'climbing wall', 'climbing walls'] },
  fr: { price: { page: 'Laissez-passer à partir de {x}.', basis: 'Laissez-passer', label: 'Votre laissez-passer adulte le moins cher (journée ou durée)', ph: 'Comme un laissez-passer d’un jour ou 60 minutes de saut', lead: 'Votre laissez-passer adulte le moins cher : à la journée ou à durée. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'Laissez-passer d’un jour, cartes, abonnements, cours et location d’équipement, avec leurs prix. Une photo de vos tarifs ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; cours d’initiation sur réservation', ages: 'Tous les âges; moins de 14 ans avec un adulte', gift: 'Cartes-cadeaux et cartes de 10 entrées à l’accueil', prices: 'Location d’équipement 8 $, carte de 10 entrées 180 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes scolaires et camps', 'Consolidation d’équipe et réservations privées'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes scolaires ou la consolidation d’équipe dans vos mots.', ex: 'Fêtes d’anniversaire jusqu’à 12 grimpeurs. Groupes scolaires et camps bienvenus' },
    search: ['escalade', 'centre d’escalade', 'escalade de bloc', 'trampoline', 'parc de trampolines', 'parkour'] } };

K.games = { gtk: 'general', ex: 'games',
  en: { price: { page: 'From {x}.', basis: 'Games and passes', label: 'Your lowest price for one person (a game or a pass), in dollars', ph: 'Like one VR game or a laser tag round', lead: 'Your lowest price for one person: a game or a pass. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Each game, pass and party package and what it costs. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Arcade: walk-ins welcome. VR and laser tag best booked', ages: 'All ages; 19+ after 8 PM', gift: 'Gift cards and game cards at the counter', prices: 'Laser tag $15 a round, VR $25 for 30 min' },
    groups: { chips: ['Birthday parties', 'Corporate events and team building', 'Private bookings on request'], lead: 'Tap a size, then add birthday parties, team building or private bookings in your own words.', ex: 'Birthday parties with a private room for up to 20. Corporate team building for up to 40' },
    search: ['arcade', 'arcades', 'vr', 'virtual reality', 'laser tag', 'go karts', 'go-karts', 'karting', 'axe throwing', 'mini golf', 'mini putt'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Jeux et forfaits', label: 'Votre prix le plus bas pour une personne (une partie ou un forfait), en dollars', ph: 'Comme une partie de réalité virtuelle ou de laser tag', lead: 'Votre prix le plus bas pour une personne : une partie ou un forfait. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque jeu, forfait et forfait de fête et son prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Arcade : sans réservation. Réalité virtuelle et laser tag : mieux vaut réserver', ages: 'Tous les âges; 19+ après 20 h', gift: 'Cartes-cadeaux et cartes de jeu au comptoir', prices: 'Laser tag 15 $ la partie, réalité virtuelle 25 $ pour 30 min' },
    groups: { chips: ['Fêtes d’anniversaire', 'Événements d’entreprise et consolidation d’équipe', 'Réservations privées sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, la consolidation d’équipe ou les réservations privées dans vos mots.', ex: 'Fêtes d’anniversaire avec salle privée jusqu’à 20 personnes. Consolidation d’équipe jusqu’à 40 personnes' },
    search: ['arcade', 'arcades', 'réalité virtuelle', 'laser tag', 'karting', 'lancer de hache', 'mini-golf'] } };

K.escape = { gtk: 'general', ex: 'escape',
  en: { price: { page: 'From {x} per player.', basis: 'Per player', label: 'Price for one player, in dollars', ph: 'Priced per room? Tap Per room or group below', lead: 'The price for one player. Priced per room? Tap Per room or group. It shows on your card.' },
    prices: { noun: 'booking page', page: PRICES_PAGE[0], lead: 'Each room and party package and what it costs. A link to your booking page is perfect. It’s optional.' },
    help: { walkin: 'Please book ahead; walk-ins when a room is free', ages: '10+ with an adult, 16+ on their own', gift: 'Gift cards online or at the front desk', prices: 'Private room for 2 to 6: $120' },
    groups: { chips: ['Birthday parties', 'Corporate events and team building', 'Private bookings on request'], lead: 'Tap a size, then add birthday parties, team building or private bookings in your own words.', ex: 'Birthday parties with a private room for up to 20. Corporate team building for up to 40' },
    search: ['escape room', 'escape rooms', 'escape game', 'escape games', 'puzzle room'] },
  fr: { price: { page: 'À partir de {x} par joueur.', basis: 'Par joueur', label: 'Prix pour un joueur, en dollars', ph: 'Un prix par salle? Touchez Par salle ou groupe ci-dessous', lead: 'Le prix pour un joueur. Un prix par salle? Touchez Par salle ou groupe. Il paraît sur votre fiche.' },
    prices: { noun: 'page de réservation', page: PRICES_PAGE[1], lead: 'Chaque salle et forfait de fête et son prix. Un lien vers votre page de réservation, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez à l’avance; sans réservation si une salle est libre', ages: '10+ avec un adulte, 16+ seuls', gift: 'Cartes-cadeaux en ligne ou à l’accueil', prices: 'Salle privée pour 2 à 6 : 120 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Événements d’entreprise et consolidation d’équipe', 'Réservations privées sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, la consolidation d’équipe ou les réservations privées dans vos mots.', ex: 'Fêtes d’anniversaire avec salle privée jusqu’à 20 personnes. Consolidation d’équipe jusqu’à 40 personnes' },
    search: ['jeu d’évasion', 'jeux d’évasion', 'salle d’évasion', 'escape game'] } };

K.bowling = { gtk: 'bowling', ex: 'bowling',
  en: { price: { page: 'From {x} per game.', basis: 'Per game', label: 'Price for one game, one person, in dollars', ph: 'Priced per lane? Tap Per room or group below', lead: 'The price for one game for one person. Priced per lane? Tap Per room or group. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Games, lanes by the hour, shoe rental and party packages, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; book lanes for weekends', ages: 'All ages; bumpers for kids', gift: 'Gift cards at the front counter', prices: 'Shoes $3, lane $45 an hour' },
    groups: { chips: ['Birthday parties', 'Corporate events and team building', 'Leagues and private bookings'], lead: 'Tap a size, then add birthday parties, team building or leagues in your own words.', ex: 'Birthday party packages for up to 20. Corporate bowling nights' },
    search: ['bowling', 'bowling alley', 'tenpin', 'ten pin', '10 pin', '5 pin', '5-pin', 'five pin'] },
  fr: { price: { page: 'À partir de {x} par partie.', basis: 'Par partie', label: 'Prix d’une partie pour une personne, en dollars', ph: 'Un prix par allée? Touchez Par salle ou groupe ci-dessous', lead: 'Le prix d’une partie pour une personne. Un prix par allée? Touchez Par salle ou groupe. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Les parties, les allées à l’heure, la location de souliers et les forfaits de fête, avec leurs prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; réservez une allée la fin de semaine', ages: 'Tous les âges; bandes pour les enfants', gift: 'Cartes-cadeaux au comptoir', prices: 'Souliers 3 $, allée 45 $ l’heure' },
    groups: { chips: ['Fêtes d’anniversaire', 'Événements d’entreprise et consolidation d’équipe', 'Ligues et réservations privées'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, la consolidation d’équipe ou les ligues dans vos mots.', ex: 'Forfaits pour fêtes d’anniversaire jusqu’à 20 personnes. Soirées de quilles pour les entreprises' },
    search: ['quilles', 'salle de quilles', 'petites quilles', 'grosses quilles'] } };

K.kids = { day: true, gtk: 'kids', ex: 'kids',
  en: { price: { page: 'Kids from {x}.', basis: 'Per child', label: 'Price for one child, in dollars', ph: 'Your regular price for one child', lead: 'The price for one child. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Kids’ and toddlers’ prices, passes and party packages, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; parties booked ahead', ages: 'Kids 0 to 12 with an adult', gift: 'Gift cards and 10-visit passes at the front desk', prices: 'Toddlers $9, adults free' },
    groups: { chips: ['Birthday parties with a party room', 'School and daycare groups', 'Private bookings on request'], lead: 'Tap what you offer, like birthday parties, or say it in your own words.', ex: 'Birthday parties with a party room for up to 20 kids. Daycare groups welcome' },
    search: ['indoor playground', 'indoor play', 'play centre', 'play center', 'toddler play', 'soft play', 'kids play', 'play area', 'summer camp', 'summer camps', 'day camp', 'day camps', 'kids camp', 'kids camps', 'kid camp'] },
  fr: { price: { page: 'Enfants à partir de {x}.', basis: 'Par enfant', label: 'Prix pour un enfant, en dollars', ph: 'Votre prix régulier pour un enfant', lead: 'Le prix pour un enfant. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Les prix pour enfants et tout-petits, les laissez-passer et les forfaits de fête, avec leurs prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; les fêtes se réservent', ages: 'Enfants de 0 à 12 ans avec un adulte', gift: 'Cartes-cadeaux et cartes de 10 entrées à l’accueil', prices: 'Tout-petits 9 $, adultes gratuit' },
    groups: { chips: ['Fêtes d’anniversaire avec salle de fête', 'Groupes scolaires et de garderie', 'Réservations privées sur demande'], lead: 'Touchez ce que vous offrez, comme les fêtes d’anniversaire, ou écrivez-le dans vos mots.', ex: 'Fêtes d’anniversaire avec salle de fête jusqu’à 20 enfants. Groupes de garderie bienvenus' },
    search: ['aire de jeux intérieure', 'jeux intérieurs', 'centre de jeux', 'jeux pour tout-petits', 'aire de jeux', 'camp de jour', 'camps de jour', 'camp pour enfants'] } };

K.classes = { quiet: true, gtk: 'classes', ex: 'classes', boxOffice: true,
  en: { price: { page: 'Classes from {x}.', basis: 'Classes', label: 'Your lowest class or workshop price, in dollars', ph: 'Like a drop-in class or your shortest workshop', lead: 'Your lowest price for one class or workshop. It shows on your card.' },
    prices: { noun: 'class schedule', page: PRICES_PAGE[0], lead: 'Each class and workshop and what it costs. A photo of your class schedule or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Please book ahead; drop-in on open studio nights', ages: 'Adults; kids’ classes for ages 6 and up on Saturdays', gift: 'Gift cards for any class, online or at the studio', prices: 'Wheel class $65, kids’ class $35' },
    groups: { chips: ['Private parties and workshops', 'Team building workshops', 'Kids’ birthday classes'], lead: 'Tap a size, then add private parties, team building or kids’ birthday classes in your own words.', ex: 'Private workshops for up to 12. Team building classes' },
    // Indoor test 6 (2026-11-19; Priya's paint-your-own pottery studio: "something creative to do" listed a winery and a
    // chicken place, "summer camp" read as Camping): creative, hands-on and make-your-own words, and kids' camps.
    search: ['workshop', 'workshops', 'pottery', 'pottery class', 'pottery classes', 'painting class', 'painting classes', 'paint night', 'cooking class', 'art class', 'art classes', 'ceramics',
      'creative', 'something creative', 'get creative', 'crafty', 'arts and crafts', 'hands on', 'make something', 'make our own', 'make your own', 'diy', 'paint your own', 'paint your own pottery', 'pottery painting', 'paint and sip',
      'summer camp', 'summer camps', 'day camp', 'day camps', 'kids camp', 'kids camps', 'kid camp', 'art camp', 'art camps', 'spring break camp', 'pd day camp'] },
  fr: { price: { page: 'Cours à partir de {x}.', basis: 'Cours', label: 'Votre prix le plus bas pour un cours ou un atelier, en dollars', ph: 'Comme un cours à la séance ou votre atelier le plus court', lead: 'Votre prix le plus bas pour un cours ou un atelier. Il paraît sur votre fiche.' },
    prices: { noun: 'horaire des cours', page: PRICES_PAGE[1], lead: 'Chaque cours et atelier et son prix. Une photo de votre horaire des cours ou un lien vers celui-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez à l’avance; sans réservation les soirs d’atelier libre', ages: 'Adultes; cours pour enfants de 6 ans et plus le samedi', gift: 'Cartes-cadeaux pour tous les cours, en ligne ou à l’atelier', prices: 'Cours de tour 65 $, cours pour enfants 35 $' },
    groups: { chips: ['Fêtes et ateliers privés', 'Ateliers de consolidation d’équipe', 'Cours d’anniversaire pour enfants'], lead: 'Touchez une taille, puis ajoutez les fêtes privées, la consolidation d’équipe ou les cours d’anniversaire dans vos mots.', ex: 'Ateliers privés jusqu’à 12 personnes. Cours de consolidation d’équipe' },
    search: ['atelier', 'ateliers', 'poterie', 'cours de poterie', 'cours de peinture', 'cours de cuisine', 'céramique', 'créatif', 'créative', 'quelque chose de créatif', 'bricolage', 'peinture sur poterie', 'camp de jour', 'camps de jour', 'camp d’été', 'camps d’été', 'camp pour enfants'] } };

K.curling = { gtk: 'general', ex: 'curling',
  en: { price: { page: 'From {x} per person.', basis: 'Per person', label: 'Price for one person (like learn to curl), in dollars', ph: 'Like a learn-to-curl session', lead: 'The price for one person, like a learn-to-curl session. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Learn to curl, drop-in, leagues and ice rental, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Learn to curl by booking; spectators welcome', ages: 'Ages 8 and up; juniors with a coach', gift: 'Gift certificates at the club', prices: 'Ice rental $150 a sheet for 2 hours' },
    groups: { chips: ['Corporate curling events', 'Learn-to-curl group sessions', 'Private ice rentals'], lead: 'Tap a size, then add corporate events, group lessons or ice rentals in your own words.', ex: 'Corporate curling events for up to 32. Private ice rentals' },
    search: ['curling', 'learn to curl', 'curling club', 'curling rink'] },
  fr: { price: { page: 'À partir de {x} par personne.', basis: 'Par personne', label: 'Prix pour une personne (comme une initiation), en dollars', ph: 'Comme une séance d’initiation au curling', lead: 'Le prix pour une personne, comme une séance d’initiation. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'L’initiation, le jeu libre, les ligues et la location de glace, avec leurs prix. Une photo de vos tarifs ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Initiation au curling sur réservation; spectateurs bienvenus', ages: '8 ans et plus; juniors avec un entraîneur', gift: 'Certificats-cadeaux au club', prices: 'Location de glace 150 $ la piste pour 2 heures' },
    groups: { chips: ['Événements de curling d’entreprise', 'Séances d’initiation en groupe', 'Location de glace privée'], lead: 'Touchez une taille, puis ajoutez les événements d’entreprise, les initiations en groupe ou la location de glace dans vos mots.', ex: 'Événements de curling d’entreprise jusqu’à 32 personnes. Location de glace privée' },
    search: ['curling', 'initiation au curling', 'club de curling'] } };

K.yoga = { gtk: 'general', ex: 'yoga',
  en: { price: { page: 'Drop-in classes from {x}.', basis: 'Drop-in class', label: 'Drop-in class price, in dollars', ph: 'Your drop-in class price', lead: 'Your drop-in class price. It shows on your card.' },
    prices: { noun: 'class schedule', page: PRICES_PAGE[0], lead: 'Drop-in, class passes, memberships and workshops, with their prices. A photo of your price list or a link to your class schedule is perfect. It’s optional.' },
    help: { walkin: 'Drop in, or book a spot online', ages: '16+; family yoga on Sundays', gift: 'Gift cards and class passes online or at the studio', prices: '10-class pass $180, first week $30' },
    groups: { chips: ['Private group classes', 'Corporate wellness classes', 'Retreats and workshops'], lead: 'Tap a size, then add private classes, corporate wellness or retreats in your own words.', ex: 'Private group classes for up to 15. Corporate wellness classes' },
    search: ['yoga', 'hot yoga', 'pilates', 'fitness class', 'fitness classes', 'barre', 'spin class'] },
  fr: { price: { page: 'Cours à la séance à partir de {x}.', basis: 'Cours à la séance', label: 'Prix d’un cours à la séance, en dollars', ph: 'Votre prix pour un cours à la séance', lead: 'Votre prix pour un cours à la séance. Il paraît sur votre fiche.' },
    prices: { noun: 'horaire des cours', page: PRICES_PAGE[1], lead: 'Les cours à la séance, les cartes de cours, les abonnements et les ateliers, avec leurs prix. Une photo de votre liste de prix ou un lien vers votre horaire des cours, c’est parfait. C’est facultatif.' },
    help: { walkin: 'À la séance, ou réservez une place en ligne', ages: '16+; yoga en famille le dimanche', gift: 'Cartes-cadeaux et cartes de cours en ligne ou au studio', prices: 'Carte de 10 cours 180 $, première semaine 30 $' },
    groups: { chips: ['Cours privés de groupe', 'Cours de mieux-être pour entreprises', 'Retraites et ateliers'], lead: 'Touchez une taille, puis ajoutez les cours privés, le mieux-être en entreprise ou les retraites dans vos mots.', ex: 'Cours privés de groupe jusqu’à 15 personnes. Cours de mieux-être pour entreprises' },
    search: ['yoga', 'yoga chaud', 'pilates', 'cours de mise en forme', 'barre'] } };

K.casino = { gtk: 'general', ex: 'casino',
  en: { price: { page: 'Entry from {x}.', basis: 'Entry', label: 'Entry price, if you charge one, in dollars', ph: 'Free to get in? Tap Free entry', lead: 'The price to get in, if there is one. It shows on your card.' },
    prices: { noun: 'promotions page', page: PRICES_PAGE[0], lead: 'Show tickets, dining and promotions, with their prices. A link to your promotions page is perfect. It’s optional.' },
    help: { walkin: 'Walk in any time; 19+ with ID', ages: '19+ with valid ID', gift: 'Gift cards at the cashier', prices: 'Show tickets from $45' },
    groups: { chips: ['Group packages with dining', 'Private events and parties', 'Bus tours welcome'], lead: 'Tap a size, then add group packages, private events or bus tours in your own words.', ex: 'Group packages with dinner and a show. Bus tours welcome' },
    search: ['casino', 'casinos', 'slots', 'slot machines', 'poker', 'table games', 'bingo'] },
  fr: { price: { page: 'Entrée à partir de {x}.', basis: 'Entrée', label: 'Prix d’entrée, s’il y en a un, en dollars', ph: 'L’entrée est gratuite? Touchez Entrée gratuite', lead: 'Le prix pour entrer, s’il y en a un. Il paraît sur votre fiche.' },
    prices: { noun: 'page des promotions', page: PRICES_PAGE[1], lead: 'Les billets de spectacle, les repas et les promotions, avec leurs prix. Un lien vers votre page des promotions, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Entrez quand vous voulez; 19+ avec une pièce d’identité', ages: '19+ avec une pièce d’identité valide', gift: 'Cartes-cadeaux à la caisse', prices: 'Billets de spectacle à partir de 45 $' },
    groups: { chips: ['Forfaits de groupe avec repas', 'Événements privés et fêtes', 'Voyages en autocar bienvenus'], lead: 'Touchez une taille, puis ajoutez les forfaits de groupe, les événements privés ou les voyages en autocar dans vos mots.', ex: 'Forfaits de groupe avec souper et spectacle. Voyages en autocar bienvenus' },
    search: ['casino', 'casinos', 'machines à sous', 'poker', 'tables de jeu', 'bingo'] } };

K.library = { quiet: true, gtk: 'general', ex: 'library',
  en: { price: { page: 'From {x}.', basis: 'Programs', label: 'Price, if you charge one, in dollars', ph: 'Free to visit? Tap Free entry', lead: 'The price of a visit or a program, if there is one. It shows on your card.' },
    prices: { noun: 'programs page', page: PRICES_PAGE[0], lead: 'Programs, workshops and room bookings, with their prices. A link to your programs page is perfect. It’s optional.' },
    help: { walkin: 'Walk in any time; programs by sign-up', ages: 'All ages; story time for kids on Saturdays', gift: 'Library cards are free for residents', prices: 'Most programs free; some workshops $5' },
    groups: { chips: ['School and class visits', 'Group tours on request', 'Meeting rooms to book'], lead: 'Tap a size, then add class visits, group tours or meeting rooms in your own words.', ex: 'Class visits and group tours on request. Meeting rooms to book' },
    search: ['library', 'libraries', 'story time', 'storytime'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Programmes', label: 'Prix, s’il y en a un, en dollars', ph: 'La visite est gratuite? Touchez Entrée gratuite', lead: 'Le prix d’une visite ou d’un programme, s’il y en a un. Il paraît sur votre fiche.' },
    prices: { noun: 'page des programmes', page: PRICES_PAGE[1], lead: 'Les programmes, les ateliers et la réservation de salles, avec leurs prix. Un lien vers votre page des programmes, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Entrez quand vous voulez; programmes sur inscription', ages: 'Tous les âges; heure du conte pour les enfants le samedi', gift: 'La carte de bibliothèque est gratuite pour les résidents', prices: 'La plupart des programmes gratuits; certains ateliers 5 $' },
    groups: { chips: ['Visites scolaires et de classes', 'Visites de groupe sur demande', 'Salles de réunion à réserver'], lead: 'Touchez une taille, puis ajoutez les visites de classes, les visites de groupe ou les salles de réunion dans vos mots.', ex: 'Visites de classes et de groupes sur demande. Salles de réunion à réserver' },
    search: ['bibliothèque', 'bibliothèques', 'heure du conte'] } };

K.other = { gtk: 'general', ex: 'general',
  en: { price: { page: 'From {x}.', basis: 'Per person', label: 'Your lowest price for one person, in dollars', ph: 'Your regular price for one person', lead: 'Your lowest price for one person. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Every ticket, pass, class or party package and what it costs. A photo of your price list or a link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; book ahead on weekends', ages: 'All ages; kids under 12 with an adult', gift: 'Gift cards at the front desk or online', prices: 'Kids under 12: $12' },
    groups: { chips: ['Birthday parties with a private room', 'School groups welcome', 'Private bookings on request'], lead: 'Tap a size, then add birthday parties, school groups or private bookings in your own words.', ex: 'Birthday parties with a private room for up to 20. School groups welcome' },
    search: ['indoor activity', 'indoor activities', 'rainy day', 'things to do when it rains'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Par personne', label: 'Votre prix le plus bas pour une personne, en dollars', ph: 'Votre prix régulier pour une personne', lead: 'Votre prix le plus bas pour une personne. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque billet, laissez-passer, cours ou forfait de fête et son prix. Une photo de votre liste de prix ou un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; réservez la fin de semaine', ages: 'Tous les âges; moins de 12 ans avec un adulte', gift: 'Cartes-cadeaux à l’accueil ou en ligne', prices: 'Enfants de moins de 12 ans : 12 $' },
    groups: { chips: ['Fêtes d’anniversaire avec salle privée', 'Groupes scolaires bienvenus', 'Réservations privées sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes scolaires ou les réservations privées dans vos mots.', ex: 'Fêtes d’anniversaire avec salle privée jusqu’à 20 personnes. Groupes scolaires bienvenus' },
    search: ['activité intérieure', 'activités intérieures', 'jour de pluie'] } };

// Indoor test 5 (2026-11-19; Chris): the price typer's example line and section, per kind: [en item, en section, fr item, fr section].
const TYPER = {
  gallery: ['Adult admission', 'Admission', 'Entrée adulte', 'Entrée'],
  museum: ['Adult admission', 'Admission', 'Entrée adulte', 'Entrée'],
  theatre: ['Adult ticket, evening show', 'Tickets', 'Billet adulte, spectacle du soir', 'Billets'],
  cinema: ['Adult ticket', 'Tickets', 'Billet adulte', 'Billets'],
  spa: ['60-min massage', 'Treatments', 'Massage de 60 min', 'Soins'],
  pool: ['Adult drop-in', 'Drop-in', 'Entrée adulte à la séance', 'À la séance'],
  climbing: ['60-min jump pass', 'Passes', 'Saut de 60 min', 'Laissez-passer'],
  games: ['VR game, 30 min', 'Games', 'Partie de réalité virtuelle, 30 min', 'Jeux'],
  escape: ['Private room for 2 to 6', 'Rooms', 'Salle privée pour 2 à 6', 'Salles'],
  bowling: ['One game, one person', 'Games', 'Une partie, une personne', 'Parties'],
  kids: ['Toddler play pass', 'Play passes', 'Laissez-passer tout-petits', 'Laissez-passer'],
  classes: ['Wheel class, 2 hours', 'Classes', 'Cours de tour, 2 heures', 'Cours'],
  curling: ['Learn to curl, 2 hours', 'Curling', 'Initiation au curling, 2 heures', 'Curling'],
  yoga: ['Drop-in class', 'Classes', 'Cours à la séance', 'Cours'],
  casino: ['Show ticket', 'Shows', 'Billet de spectacle', 'Spectacles'],
  library: ['Workshop', 'Programs', 'Atelier', 'Programmes'],
  other: ['Adult admission', 'Prices', 'Entrée adulte', 'Tarifs'],
};
for (const [k, t] of Object.entries(TYPER)) if (K[k]) { K[k].en.prices.typer = { item: t[0], section: t[1] }; K[k].fr.prices.typer = { item: t[2], section: t[3] }; }
// Indoor test 6 (2026-11-19; Priya's pottery studio was offered "Each ticket or pass and its price"): the "Type them in
// myself" line by kind: [en, fr], each followed by ", one line at a time".
const TYPE_SUB = {
  gallery: ['Each admission or tour', 'Chaque entrée ou visite'], museum: ['Each admission or pass', 'Chaque entrée ou laissez-passer'],
  theatre: ['Each ticket', 'Chaque billet'], cinema: ['Each ticket', 'Chaque billet'], spa: ['Each treatment or pass', 'Chaque soin ou forfait'],
  pool: ['Each drop-in, pass or lesson', 'Chaque entrée, laissez-passer ou cours'], climbing: ['Each pass', 'Chaque laissez-passer'],
  games: ['Each game or pass', 'Chaque partie ou forfait'], escape: ['Each room', 'Chaque salle'], bowling: ['Each game or lane', 'Chaque partie ou allée'],
  kids: ['Each play pass or party', 'Chaque laissez-passer ou fête'], classes: ['Each class', 'Chaque cours'], curling: ['Each session or rental', 'Chaque séance ou location'],
  yoga: ['Each class or pass', 'Chaque cours ou carte'], casino: ['Each show or entry', 'Chaque spectacle ou entrée'], library: ['Each program', 'Chaque programme'],
  other: ['Each ticket or pass', 'Chaque billet ou laissez-passer'],
};
for (const [k, t] of Object.entries(TYPE_SUB)) if (K[k]) { K[k].en.prices.typeSub = `${t[0]} and its price, one line at a time`; K[k].fr.prices.typeSub = `${t[1]} et son prix, une ligne à la fois`; }
// Indoor test 8 (2026-11-19; Gary's bowling centre: "leagues use most lanes weeknights" and "cosmic bowling friday and
// saturday nights" got "I'm not sure"): the Help examples for busy or limited times (a Good to know line) and for a theme
// night or repeating event (a Known for line, plus the pattern for "Repeats or other dates?"), by kind:
// [en busy, en theme, en repeat, fr busy, fr theme, fr repeat].
const BUSY_THEME = {
  gallery: ['Busiest on First Fridays; quiet weekday mornings', 'First Friday openings 6–8 PM', 'first Friday of each month', 'Plus achalandé les premiers vendredis; calme en semaine le matin', 'Vernissages le premier vendredi de 18 h à 20 h', 'le premier vendredi de chaque mois'],
  museum: ['School groups most weekday mornings; quieter after 1 PM', 'Family Sundays with crafts, 1–3 PM', 'every Sunday', 'Groupes scolaires la plupart des matins de semaine; plus calme après 13 h', 'Dimanches en famille avec bricolage, de 13 h à 15 h', 'chaque dimanche'],
  theatre: ['Box office busiest an hour before shows; buy ahead for Saturdays', 'Improv night every Thursday at 8 PM', 'every Thursday', 'Billetterie plus achalandée une heure avant les spectacles; achetez d’avance pour le samedi', 'Soirée d’impro chaque jeudi à 20 h', 'chaque jeudi'],
  cinema: ['Opening weekends sell out; buy ahead', 'Cheap Tuesdays: every ticket $8', 'every Tuesday', 'Les fins de semaine de première affichent complet; achetez d’avance', 'Mardis à prix réduit : tous les billets à 8 $', 'chaque mardi'],
  spa: ['Weekends book up 2 weeks ahead', 'Ladies’ night Thursdays 5–9 PM', 'every Thursday', 'Les fins de semaine se réservent 2 semaines d’avance', 'Soirée des dames le jeudi de 17 h à 21 h', 'chaque jeudi'],
  pool: ['Lane swim only 6–8 AM; lessons after school on weekdays', 'Family swim with the inflatable Saturdays 1–3 PM', 'every Saturday', 'Nage en couloir seulement de 6 h à 8 h; cours après l’école en semaine', 'Bain familial avec la structure gonflable le samedi de 13 h à 15 h', 'chaque samedi'],
  climbing: ['Busiest weeknights 5–8 PM; quiet mornings', 'Ladies’ climb night Wednesdays 6–9 PM', 'every Wednesday', 'Plus achalandé en semaine de 17 h à 20 h; calme le matin', 'Soirée d’escalade pour femmes le mercredi de 18 h à 21 h', 'chaque mercredi'],
  games: ['Busy Friday and Saturday nights; book VR ahead', 'Retro arcade night Thursdays 6–10 PM', 'every Thursday', 'Achalandé les vendredis et samedis soir; réservez la réalité virtuelle', 'Soirée arcade rétro le jeudi de 18 h à 22 h', 'chaque jeudi'],
  escape: ['Weekends book up a week ahead', 'Late-night rooms Fridays at 10 PM', 'every Friday', 'Les fins de semaine se réservent une semaine d’avance', 'Salles de fin de soirée le vendredi à 22 h', 'chaque vendredi'],
  bowling: ['Leagues use most lanes Mon–Thu after 6, call ahead', 'Cosmic bowling Fri & Sat 9 PM–midnight', 'every Friday and Saturday', 'Les ligues occupent la plupart des allées du lun. au jeu. après 18 h, appelez avant', 'Quilles cosmiques ven. et sam. de 21 h à minuit', 'chaque vendredi et samedi'],
  kids: ['Busiest on rainy weekends; quiet weekday afternoons', 'Toddler time Tue & Thu 9–11 AM', 'every Tuesday and Thursday', 'Plus achalandé les fins de semaine pluvieuses; calme en semaine l’après-midi', 'Temps des tout-petits mar. et jeu. de 9 h à 11 h', 'chaque mardi et jeudi'],
  classes: ['Saturday classes fill a week ahead', 'Paint night every Friday at 7 PM', 'every Friday', 'Les cours du samedi sont pleins une semaine d’avance', 'Soirée peinture chaque vendredi à 19 h', 'chaque vendredi'],
  curling: ['Leagues use the ice weeknights; drop-in Sunday afternoons', 'Learn-to-curl night Fridays at 7 PM', 'every Friday', 'Les ligues occupent la glace en semaine; jeu libre le dimanche après-midi', 'Soirée d’initiation au curling le vendredi à 19 h', 'chaque vendredi'],
  yoga: ['Evening classes fill up; book a spot online', 'Candlelight yoga Fridays at 7 PM', 'every Friday', 'Les cours du soir sont pleins; réservez une place en ligne', 'Yoga aux chandelles le vendredi à 19 h', 'chaque vendredi'],
  casino: ['Busiest Friday and Saturday nights', 'Live music in the lounge Saturdays 8 PM', 'every Saturday', 'Plus achalandé les vendredis et samedis soir', 'Musique live au salon le samedi à 20 h', 'chaque samedi'],
  library: ['Quiet study hours weekday mornings', 'Story time Saturdays at 10:30 AM', 'every Saturday', 'Heures d’étude calmes en semaine le matin', 'L’heure du conte le samedi à 10 h 30', 'chaque samedi'],
  other: ['Busiest on weekends and school holidays', 'Family night Fridays 5–8 PM', 'every Friday', 'Plus achalandé les fins de semaine et pendant les congés scolaires', 'Soirée familiale le vendredi de 17 h à 20 h', 'chaque vendredi'],
};
for (const [k, t] of Object.entries(BUSY_THEME)) if (K[k]) { Object.assign(K[k].en.help, { busy: t[0], theme: t[1], repeat: t[2] }); Object.assign(K[k].fr.help, { busy: t[3], theme: t[4], repeat: t[5] }); }
// Indoor test 10 (2026-11-19; Sandra's pool was told her card says "Drop-in from $25"): the example price Help uses for
// each kind before the owner has typed one (a pool's drop-in is never $25).
const EX_PRICE = { gallery: 10, museum: 12, theatre: 25, cinema: 14, spa: 65, pool: 7.5, climbing: 22, games: 15, escape: 30, bowling: 6.5, kids: 14, classes: 40, curling: 30, yoga: 20, casino: 40, library: 10, other: 15 };
for (const [k, x] of Object.entries(EX_PRICE)) if (K[k]) K[k].exPrice = x;
// Indoor test 10 (2026-11-19; Sandra's pool: "Drop-in from $7.50" while kids pay $3.50): when the owner's typed prices list a
// lower price than her main one, the main one says what it is instead of "from": [en, fr] ("Adult drop-in $7.50.").
const EXACT = { gallery: ['Adult admission', 'Entrée adulte'], museum: ['Adult admission', 'Entrée adulte'], theatre: ['Adult ticket', 'Billet adulte'], cinema: ['Adult ticket', 'Billet adulte'],
  spa: ['Adult price', 'Prix adulte'], pool: ['Adult drop-in', 'Entrée adulte à la séance'], climbing: ['Adult pass', 'Laissez-passer adulte'], games: ['Per person', 'Par personne'],
  escape: ['Per person', 'Par personne'], bowling: ['One game', 'Une partie'], kids: ['Kids', 'Enfants'], classes: ['Per class', 'Par cours'], curling: ['Adults', 'Adultes'],
  yoga: ['Drop-in class', 'Cours à la séance'], casino: ['Adults', 'Adultes'], library: ['Adults', 'Adultes'], other: ['Adult admission', 'Entrée adulte'] };
for (const [k, x] of Object.entries(EXACT)) if (K[k]) { K[k].en.price.exact = x[0]; K[k].fr.price.exact = x[1]; }
const INDOOR_KIND_TEXT = K;
const INDOOR_KIND_TEXT_KINDS = Object.keys(K);
// The kind a place reads in: its main kind (the first the owner picked), else 'other'.
function indoorKindKey(kinds) { const k = Array.isArray(kinds) ? kinds[0] : kinds; return k && K[k] ? k : 'other'; }
// One kind's words in one language ({ price, prices, help, groups, search, boxOffice, arts }).
function indoorKindText(kinds, lang) {
  const k = indoorKindKey(kinds), e = K[k], w = e[lang === 'fr' ? 'fr' : 'en'];
  // The prices link's words on the page: "See prices & rates" / « Voir les tarifs », a spa's "See the spa menu".
  const see = w.prices.page === PRICES_PAGE[lang === 'fr' ? 1 : 0] ? (lang === 'fr' ? 'Voir les tarifs' : 'See prices & rates') : lang === 'fr' ? `Voir la ${w.prices.page.toLowerCase()}` : `See the ${w.prices.page.toLowerCase()}`;
  return { kind: k, exPrice: e.exPrice || 15, boxOffice: !!e.boxOffice, arts: !!e.arts, quiet: !!e.quiet, day: !!(e.day || e.quiet), gtk: e.gtk || 'general', ex: e.ex || 'general', ...w, prices: { ...w.prices, see } };
}
// "Tickets from $25." with the price written in.
function indoorPriceLine(kinds, money, lang) { return indoorKindText(kinds, lang).price.page.replace('{x}', money); }
// The card's small lines in both languages (English -> French), for french-text.js.
const INDOOR_BASIS_FR = Object.fromEntries(Object.values(K).map((e) => [e.en.price.basis, e.fr.price.basis]).concat(Object.values(K).map((e) => [e.en.prices.page, e.fr.prices.page]))
  .concat(Object.values(K).map((e) => [e.en.price.exact, e.fr.price.exact])));
// The kinds whose words name what the request asks ("massage" -> spa), from the search words.
// Indoor test 10 (2026-11-19, the vocabulary audit): phrases that hold a kind's word but name something else: lawn bowling
// and bowling greens (Sports & Recreation), an outdoor pool, a pool table or pool hall.
const NOT_INDOOR_KIND_RE = / (?:lawn bowl(?:ing|s)?|bowling greens?|outdoor (?:swimming )?pools?|pool (?:tables?|halls?|cues?)|billiards?) /g;
function indoorKindsNamedIn(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[’']/g, '’').replace(/[^a-z0-9À-ɏ’]+/g, ' ')} `.replace(NOT_INDOOR_KIND_RE, ' ').replace(NOT_INDOOR_KIND_RE, ' ');
  const out = [];
  for (const k of INDOOR_KIND_TEXT_KINDS) {
    if (k === 'other') continue;
    for (const w of K[k].en.search.concat(K[k].fr.search)) {
      const ww = String(w).toLowerCase().replace(/[’']/g, '’').replace(/[^a-z0-9À-ɏ’]+/g, ' ').trim();
      if (ww && t.includes(` ${ww} `)) { if (!out.includes(k)) out.push(k); break; }
    }
  }
  return out;
}

// Search words that must not, alone, make a request "indoor places only": they mean something else too (a history walk, a
// concert on What's On, a beach swim, a mini golf course outside), or they are too broad. They still count when a request
// is already about indoor places (indoorKindsNamedIn).
const INDOOR_TYPE_WORD_SKIP = new Set(['history', 'heritage', 'heritage site', 'exhibition', 'exhibitions', 'exposition', 'expositions', 'concert', 'concerts', 'comedy', 'musical', 'musicals',
  'live show', 'a play', 'live theatre', 'pièce de théâtre', 'comédie musicale', 'pool', 'pools', 'swim', 'swimming', 'piscine', 'piscines', 'baignade', 'waterslide', 'glissade d’eau', 'mini golf', 'mini-golf', 'go karts', 'go-karts', 'karting',
  'workshop', 'workshops', 'atelier', 'ateliers', 'wellness', 'bien-être', 'rainy day', 'indoor activity', 'indoor activities', 'things to do when it rains', 'activité intérieure',
  'activités intérieures', 'jour de pluie', 'film', 'films', 'spectacle', 'spectacles', 'humour', 'art', 'theatre', 'theater', 'théâtre',
  'cours', 'barre', 'bingo', 'poker', 'gym', 'histoire', 'patrimoine', 'site patrimonial', 'pièces', 'climbing', 'rock climbing', 'escalade', 'pottery', 'poterie', 'céramique', 'ceramics', 'axe throwing', 'lancer de hache', 'trampoline', 'parkour', 'ninja', 'vr', 'bowl', 'mini putt', 'natation', 'play area', 'aire de jeux', 'kids play']);
// The words that mean "an indoor place" in search and Build My Trip ("facial", "bouldering", "lane swim", "tenpin",
// "learn to curl", "slots", « soin du visage »).
const INDOOR_TYPE_WORDS = [...new Set(Object.values(K).flatMap((e) => e.en.search.concat(e.fr.search)).filter((w) => !INDOOR_TYPE_WORD_SKIP.has(w)))];

module.exports = { INDOOR_TYPE_WORDS, INDOOR_KIND_TEXT, INDOOR_KIND_TEXT_KINDS, indoorKindKey, indoorKindText, indoorPriceLine, INDOOR_BASIS_FR, indoorKindsNamedIn };
