'use strict';
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE PRICE RULE (indoor test 18, 2026-11-19; Natalie's day spa read "Adult price $95" once she typed a $70 pedicure). One
// rule for every surface that shows an indoor place's own price: the page's Prices row, the card, Build My Trip's card,
// the setup's Price screen preview, the finish preview, the Help examples and the price typer's first line. It replaces
// the per-case rules of tests 4, 10, 11, 12, 16 and 17 ("from" here, an "exact" label there). indoorPriceShow() below is
// the only place it is written; server.js indoorPriceView() and owner-setup-client.js indoorShowLine() only feed it.
//
// Inputs: the kind (its basis below), the main price, its unit (per person, or per room / lane / game / group), Free or
// By donation, the owner's own typed prices (the lowest one that is a real visit price: not an add-on, rental, gift card,
// percentage, one-weekday deal like "Cheap Tuesdays", intro offer or membership) and the minimum players.
//   (a) Free / By donation        "Free entry" / "By donation (suggested $5)". Nothing else.
//   (b) An EXACT kind: its main price is one single admission and the kind's label truly names what it buys
//       (gallery and museum adult admission, cinema adult ticket, pool adult drop-in, yoga drop-in class, bowling one
//       game, play centre child admission: EXACT below):
//         no lower typed price    "Adult admission $12."            card "$12 · Adult admission"
//         a lower typed price     "From $8 (adult admission $12)."  card "From $8 · Adult admission $12"
//   (c) A RANGE kind: the main price is the lowest of several services (spa, theatre, classes, climbing passes, arcade,
//       escape room, curling, casino, library, other): "From $<lowest of the main and typed prices>" in the kind's words
//       ("From $70.", "Tickets from $25.", "From $30 per player."), card "From $70 · Treatments and passes". A range kind
//       never says "Adult price", "Adult admission" or any one-service label.
//   (d) Per room / lane / game / group: "From $120 per room (2–6 players)." as before (server.js indoorPerLine); a
//       minimum per person adds "(2-player minimum)".
// The card always shows the lowest real price a visitor can pay. Build My Trip and the setup previews say the page's
// words (without the full stop). The price typer's first line is the main price under a neutral name for a range kind
// ("Shortest treatment", "One class", "One player"); a specific word ("Massage") only when the place's own words name
// exactly one service.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
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
  en: { price: { page: 'Adult admission {x}.', basis: 'Adult admission', label: 'Adult admission, in dollars', ph: 'Your regular adult admission', lead: 'Your regular adult admission. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Admission for adults, seniors, students and kids, memberships and tours, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; guided tours by appointment', ages: 'Kids under 12 with an adult', gift: 'Gift shop by the entrance; memberships at the front desk', prices: 'Seniors $8, kids under 12 free' },
    groups: { chips: ['School groups welcome', 'Guided group tours on request', 'Private events and rentals'], lead: 'Tap a size, then add school groups, guided tours or private events in your own words.', ex: 'School groups and guided tours by appointment' },
    search: ['art gallery', 'art galleries', 'gallery', 'galleries', 'exhibition', 'exhibitions'] },
  fr: { price: { page: 'Entrée adulte {x}.', basis: 'Entrée adulte', label: 'Entrée adulte, en dollars', ph: 'Votre entrée adulte régulière', lead: 'Votre entrée adulte régulière. Elle paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'L’entrée pour les adultes, les aînés, les étudiants et les enfants, les abonnements et les visites, avec leurs prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; visites guidées sur rendez-vous', ages: 'Moins de 12 ans avec un adulte', gift: 'Boutique à l’entrée; abonnements à l’accueil', prices: 'Aînés 8 $, gratuit pour les moins de 12 ans' },
    groups: { chips: ['Groupes scolaires bienvenus', 'Visites guidées de groupe sur demande', 'Événements privés et location'], lead: 'Touchez une taille, puis ajoutez les groupes scolaires, les visites guidées ou les événements privés dans vos mots.', ex: 'Groupes scolaires et visites guidées sur rendez-vous' },
    search: ['galerie d’art', 'galeries d’art', 'galerie', 'galeries', 'exposition', 'expositions'] } };

K.museum = { quiet: true, gtk: 'arts', ex: 'museum', arts: true,
  en: { price: { page: 'Adult admission {x}.', basis: 'Adult admission', label: 'Adult admission, in dollars', ph: 'Your regular adult admission', lead: 'Your regular adult admission. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Admission for adults, seniors, students and kids, family passes and memberships, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; school groups by appointment', ages: 'All ages; kids under 12 with an adult', gift: 'Gift shop by the entrance; memberships at the front desk', prices: 'Seniors $10, kids 6–12 $5, family pass $40' },
    groups: { chips: ['School groups welcome', 'Guided group tours on request', 'Private events and rentals'], lead: 'Tap a size, then add school groups, guided tours or private events in your own words.', ex: 'School groups and guided tours by appointment' },
    search: ['museum', 'museums', 'history', 'heritage', 'heritage site', 'science centre', 'science center', 'hands on science', 'science for kids', 'planetarium'] },
  fr: { price: { page: 'Entrée adulte {x}.', basis: 'Entrée adulte', label: 'Entrée adulte, en dollars', ph: 'Votre entrée adulte régulière', lead: 'Votre entrée adulte régulière. Elle paraît sur votre fiche.' },
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

// Indoor test 13 (2026-11-19; Dan's cinema: the price screen previewed "Tickets from $14" for his regular adult ticket): a
// cinema's price is its regular adult ticket (single), "Adult ticket $14" everywhere, never "from". Its own Good to know
// chips (a concession stand, not a café).
K.cinema = { gtk: 'cinema', ex: 'cinema', single: true,
  en: { price: { page: 'Adult ticket {x}.', basis: 'Adult ticket', label: 'Regular adult ticket, in dollars', ph: 'Your regular adult ticket', lead: 'Your regular adult ticket. It shows on your card.' },
    prices: { noun: 'tickets page', page: PRICES_PAGE[0], lead: 'Your ticket prices for adults, kids and seniors, and cheap nights. A link to your tickets page is perfect. It’s optional.' },
    help: { walkin: 'Tickets at the door or online', ages: 'All ages; check each film’s rating', gift: 'Gift cards at the box office', prices: 'Kids and seniors $10, Tuesdays $8' },
    groups: { chips: ['Private screenings', 'Group tickets for 10 or more', 'Birthday parties with a movie'], lead: 'Tap a size, then add private screenings, group tickets or parties in your own words.', ex: 'Private screenings for up to 120. Birthday party packages' },
    search: ['cinema', 'cinemas', 'movie', 'movies', 'movie theatre', 'movie theater', 'film', 'films'] },
  fr: { price: { page: 'Billet adulte {x}.', basis: 'Billet adulte', label: 'Billet adulte régulier, en dollars', ph: 'Votre billet adulte régulier', lead: 'Votre billet adulte régulier. Il paraît sur votre fiche.' },
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

// Indoor test 12: a pool's price is one adult drop-in too (single): "Adult drop-in $7.50", never "Drop-in from $7.50".
K.pool = { day: true, gtk: 'pool', ex: 'pool', single: true,
  en: { price: { page: 'Adult drop-in {x}.', basis: 'Adult drop-in', label: 'Adult drop-in, in dollars', ph: 'Your adult drop-in price', lead: 'Your adult drop-in price. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Drop-in, passes and lessons for adults, kids and families, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Drop in during public swims; lessons need booking', ages: 'All ages; under 8 with an adult in the water', gift: 'Gift cards and passes at the front desk', prices: 'Kids $4, 10-visit pass $60' },
    groups: { chips: ['Birthday parties with a party room', 'School groups welcome', 'Pool or room rentals on request'], lead: 'Tap a size, then add birthday parties, school groups or rentals in your own words.', ex: 'Birthday parties with a party room. Pool rentals on request' },
    search: ['pool', 'pools', 'swim', 'swimming', 'lane swim', 'public swim', 'rec centre', 'recreation centre', 'aquatic centre', 'waterslide',
      // Indoor test 10 (2026-11-19): the words visitors use for a city pool (the vocabulary audit).
      'swimming pool', 'swimming pools', 'indoor pool', 'indoor pools', 'aquatic center', 'rec center', 'recreation center', 'leisure pool', 'wave pool', 'aquafit', 'aqua fit', 'water aerobics'] },
  fr: { price: { page: 'Entrée adulte à la séance {x}.', basis: 'Entrée adulte à la séance', label: 'Prix adulte à la séance, en dollars', ph: 'Votre prix adulte à la séance', lead: 'Votre prix adulte à la séance. Il paraît sur votre fiche.' },
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
  en: { price: { page: 'One game {x}.', basis: 'One game', label: 'Price for one game, one person, in dollars', ph: 'Priced per lane? Tap Per room or group below', lead: 'The price for one game for one person. Priced per lane? Tap Per room or group. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Games, lanes by the hour, shoe rental and party packages, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; book lanes for weekends', ages: 'All ages; bumpers for kids', gift: 'Gift cards at the front counter', prices: 'Shoes $3, lane $45 an hour' },
    groups: { chips: ['Birthday parties', 'Corporate events and team building', 'Leagues and private bookings'], lead: 'Tap a size, then add birthday parties, team building or leagues in your own words.', ex: 'Birthday party packages for up to 20. Corporate bowling nights' },
    search: ['bowling', 'bowling alley', 'tenpin', 'ten pin', '10 pin', '5 pin', '5-pin', 'five pin'] },
  fr: { price: { page: 'Une partie {x}.', basis: 'Une partie', label: 'Prix d’une partie pour une personne, en dollars', ph: 'Un prix par allée? Touchez Par salle ou groupe ci-dessous', lead: 'Le prix d’une partie pour une personne. Un prix par allée? Touchez Par salle ou groupe. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Les parties, les allées à l’heure, la location de souliers et les forfaits de fête, avec leurs prix. Une photo de votre liste de prix ou un lien vers celle-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; réservez une allée la fin de semaine', ages: 'Tous les âges; bandes pour les enfants', gift: 'Cartes-cadeaux au comptoir', prices: 'Souliers 3 $, allée 45 $ l’heure' },
    groups: { chips: ['Fêtes d’anniversaire', 'Événements d’entreprise et consolidation d’équipe', 'Ligues et réservations privées'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, la consolidation d’équipe ou les ligues dans vos mots.', ex: 'Forfaits pour fêtes d’anniversaire jusqu’à 20 personnes. Soirées de quilles pour les entreprises' },
    search: ['quilles', 'salle de quilles', 'petites quilles', 'grosses quilles'] } };

K.kids = { day: true, gtk: 'kids', ex: 'kids',
  en: { price: { page: 'Child admission {x}.', basis: 'Child admission', label: 'Price for one child, in dollars', ph: 'Your regular price for one child', lead: 'The price for one child. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Kids’ and toddlers’ prices, passes and party packages, with their prices. A photo of your price list or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; parties booked ahead', ages: 'Kids 0 to 12 with an adult', gift: 'Gift cards and 10-visit passes at the front desk', prices: 'Toddlers $9, adults free' },
    groups: { chips: ['Birthday parties with a party room', 'School and daycare groups', 'Private bookings on request'], lead: 'Tap what you offer, like birthday parties, or say it in your own words.', ex: 'Birthday parties with a party room for up to 20 kids. Daycare groups welcome' },
    search: ['indoor playground', 'indoor play', 'play centre', 'play center', 'toddler play', 'soft play', 'kids play', 'play area', 'summer camp', 'summer camps', 'day camp', 'day camps', 'kids camp', 'kids camps', 'kid camp'] },
  fr: { price: { page: 'Entrée enfant {x}.', basis: 'Entrée enfant', label: 'Prix pour un enfant, en dollars', ph: 'Votre prix régulier pour un enfant', lead: 'Le prix pour un enfant. Il paraît sur votre fiche.' },
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

// Indoor test 12 (2026-11-19; Jess's yoga studio: "Drop-in classes from $22" for one drop-in price): single, the price is
// one drop-in class, said without "from" on the page, the card and in Build My Trip ("Drop-in class $22", « Cours à la carte 22 $ »).
K.yoga = { gtk: 'yoga', ex: 'yoga', single: true,
  en: { price: { page: 'Drop-in class {x}.', basis: 'Drop-in class', label: 'Drop-in class price, in dollars', ph: 'Your drop-in class price', lead: 'Your drop-in class price. It shows on your card.' },
    prices: { noun: 'class schedule', page: PRICES_PAGE[0], lead: 'Drop-in, class passes, memberships and workshops, with their prices. A photo of your price list or a link to your class schedule is perfect. It’s optional.' },
    help: { walkin: 'Drop in, or book a spot online', ages: '16+; family yoga on Sundays', gift: 'Gift cards and class passes online or at the studio', prices: '10-class pass $180, first week $30' },
    groups: { chips: ['Private group classes', 'Corporate wellness classes', 'Retreats and workshops'], lead: 'Tap a size, then add private classes, corporate wellness or retreats in your own words.', ex: 'Private group classes for up to 15. Corporate wellness classes' },
    search: ['yoga', 'hot yoga', 'pilates', 'fitness class', 'fitness classes', 'barre', 'spin class'] },
  fr: { price: { page: 'Cours à la carte {x}.', basis: 'Cours à la carte', label: 'Prix d’un cours à la carte, en dollars', ph: 'Votre prix pour un cours à la carte', lead: 'Votre prix pour un cours à la carte. Il paraît sur votre fiche.' },
    prices: { noun: 'horaire des cours', page: PRICES_PAGE[1], lead: 'Les cours à la carte, les cartes de cours, les abonnements et les ateliers, avec leurs prix. Une photo de votre liste de prix ou un lien vers votre horaire des cours, c’est parfait. C’est facultatif.' },
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

// Indoor test 18 (2026-11-19; Natalie typed "Facials from $95" as the old hint invited and was told "Just the number"): the
// Price box's placeholder says the number it wants and what it is, by kind ([en, fr]). Words around the number are read
// now too (owner-setup-client.js indoorLeadWords).
const PRICE_PH = {
  gallery: ['Your regular adult admission, like 10', 'Votre entrée adulte régulière, par exemple 10'],
  museum: ['Your regular adult admission, like 12', 'Votre entrée adulte régulière, par exemple 12'],
  theatre: ['Your lowest regular ticket, like 25', 'Votre billet régulier le moins cher, par exemple 25'],
  cinema: ['Your regular adult ticket, like 14', 'Votre billet adulte régulier, par exemple 14'],
  spa: ['Your lowest price, like 65 (your shortest treatment)', 'Votre prix le plus bas, par exemple 65 (votre soin le plus court)'],
  pool: ['Your adult drop-in price, like 7.50', 'Votre prix adulte à la séance, par exemple 7,50'],
  climbing: ['Your lowest adult pass, like 22 (a day pass or a timed jump)', 'Votre laissez-passer adulte le moins cher, par exemple 22 (journée ou durée)'],
  games: ['Your lowest price for one person, like 15 (one game)', 'Votre prix le plus bas pour une personne, par exemple 15 (une partie)'],
  escape: ['One player, like 30. Priced per room? Tap Per room or group below', 'Un joueur, par exemple 30. Un prix par salle? Touchez Par salle ou groupe ci-dessous'],
  bowling: ['One game for one person, like 6.50. Priced per lane? Tap Per room or group below', 'Une partie pour une personne, par exemple 6,50. Un prix par allée? Touchez Par salle ou groupe ci-dessous'],
  kids: ['Your price for one child, like 14', 'Votre prix pour un enfant, par exemple 14'],
  classes: ['Your lowest price, like 40 (one class or your shortest workshop)', 'Votre prix le plus bas, par exemple 40 (un cours ou votre atelier le plus court)'],
  curling: ['One person, like 30 (learn to curl)', 'Une personne, par exemple 30 (initiation au curling)'],
  yoga: ['Your drop-in class price, like 20', 'Votre prix pour un cours à la carte, par exemple 20'],
  casino: ['Your entry price, like 40. Free to get in? Tap Free entry', 'Votre prix d’entrée, par exemple 40. L’entrée est gratuite? Touchez Entrée gratuite'],
  library: ['Your lowest price, like 10. Free to visit? Tap Free entry', 'Votre prix le plus bas, par exemple 10. La visite est gratuite? Touchez Entrée gratuite'],
  other: ['Your lowest price for one person, like 15', 'Votre prix le plus bas pour une personne, par exemple 15'],
};
for (const [k, x] of Object.entries(PRICE_PH)) if (K[k]) { K[k].en.price.ph = x[0]; K[k].fr.price.ph = x[1]; }
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
  yoga: ['Drop-in class', 'Classes', 'Cours à la carte', 'Cours'],
  casino: ['Show ticket', 'Shows', 'Billet de spectacle', 'Spectacles'],
  library: ['Workshop', 'Programs', 'Atelier', 'Programmes'],
  other: ['Adult admission', 'Prices', 'Entrée adulte', 'Tarifs'],
};
// Indoor test 16 (2026-11-19; Tyler's escape room, $35 per player: the typer's first line came pre-filled "Private room for 2
// to 6 — $35"): the first line's name for a main price per person, by kind ([en, fr]); a kind whose example is per person
// already keeps it. A room or group name is only ever paired with a price per room or group (server.js indoorFirstItemName).
const TYPER_PERSON = { escape: ['One player', 'Un joueur'] };
// Indoor test 17 (2026-11-19; Megan's bouldering gym: the typer's first line came pre-filled "60-min jump pass — $22"; the
// test-16 fix covered escape rooms only): every kind's first line is a true name for its main price's own unit ([en, fr]):
// "Day pass" for climbing, "Adult admission" for a museum, "One game" for bowling. A kind-specific example word (a jump
// pass, a massage, a wheel class, a toddler pass) is used only when the place's own words say it: [words, en, fr], first
// match wins. TYPER keeps the examples (the "like …" hints) for a place whose words say nothing more.
const TYPER_TRUE = {
  gallery: { name: ['Adult admission', 'Entrée adulte'] }, museum: { name: ['Adult admission', 'Entrée adulte'] },
  theatre: { name: ['Adult ticket', 'Billet adulte'] }, cinema: { name: ['Adult ticket', 'Billet adulte'] },
  // Indoor test 18: a spa's services; a specific name only when its own words name exactly one of them (null: counted, never
  // used as the name).
  spa: { name: ['Shortest treatment', 'Soin le plus court'], own: [[/\b(?:day pass|circuit|hydrotherap\w*|thermal|nordic|bath ?house)\b/i, 'Day pass', 'Forfait d’un jour'], [/\bmassages?\b|\bmassoth[ée]rap\w*/i, 'Massage', 'Massage'], [/\bfacials?\b|\bsoins? du visage\b/i, 'Facial', 'Soin du visage'],
    [/\bsaunas?\b/i, 'Sauna session', 'Séance de sauna'], [/\bfloat(?:s|ing|ation)?\b(?! sauna)/i, 'Float', 'Flottaison'], [/\b(?:pedicures?|manicures?|nails?|p[ée]dicures?|manucures?|ongles)\b/i, null, null],
    [/\b(?:wax\w*|lash\w*|brows?|body (?:wraps?|scrubs?)|reflexolog\w*|epilation|[ée]pilation|cils|sourcils)\b/i, null, null]] },
  pool: { name: ['Adult drop-in', 'Entrée adulte à la séance'] },
  climbing: { name: ['Day pass', 'Laissez-passer d’un jour'], own: [[/\b(?:climb\w*|boulder\w*|escalade|belay\w*)\b/i, 'Day pass', 'Laissez-passer d’un jour'], [/\btrampolin\w*|\bjump(?:s|ing)?\b/i, '60-min jump pass', 'Saut de 60 min']] },
  games: { name: ['One game', 'Une partie'], own: [[/\blaser ?tag\b/i, 'Laser tag game', 'Partie de laser tag'], [/\b(?:vr|virtual reality)\b/i, 'VR game, 30 min', 'Partie de réalité virtuelle, 30 min']] },
  escape: { name: ['One player', 'Un joueur'] },
  bowling: { name: ['One game', 'Une partie'] },
  kids: { name: ['Child admission', 'Entrée enfant'], own: [[/\btoddlers?\b/i, 'Toddler play pass', 'Laissez-passer tout-petits']] },
  classes: { name: ['One class', 'Un cours'], own: [[/\bwheel\b/i, 'Wheel class, 2 hours', 'Cours de tour, 2 heures'], [/\bpaint your own\b/i, 'Studio fee, one person', 'Frais d’atelier, une personne']] },
  curling: { name: ['One person', 'Une personne'], own: [[/\blearn to curl\b/i, 'Learn to curl, 2 hours', 'Initiation au curling, 2 heures']] },
  yoga: { name: ['Drop-in class', 'Cours à la carte'] },
  casino: { name: ['Entry', 'Entrée'] }, library: { name: ['One program', 'Un programme'] },
  other: { name: ['One person', 'Une personne'] },
};
// The first line's name, and the "like …" example, for a place: kinds, language, the price's unit (per: room, lane, game,
// group; none: per person) and its own words. -> { first, item, section }
function indoorTyperWords(kinds, lang, { per = null, own = '' } = {}) {
  const k = indoorKindKey(kinds), fr = lang === 'fr' ? 1 : 0, tt = TYPER_TRUE[k] || TYPER_TRUE.other, t = TYPER[k] || TYPER.other;
  // Indoor test 18 (Natalie's spa: "Massage $95" pre-filled when $95 was her facial): a specific name only when the place's
  // own words name exactly one service; several (massages, facials and pedicures): the kind's neutral name.
  const hits = (tt.own || []).filter((x) => x[0].test(String(own || '')));
  const hit = hits.length === 1 && hits[0][1] ? hits[0] : null;
  const name = hit ? [hit[1], hit[2]] : tt.name;
  const unit = per && TYPER_PER[per] ? TYPER_PER[per][fr] : null;
  return { first: unit || name[fr], item: unit || name[fr], section: t[fr ? 3 : 1] };
}
// The first line's name for a main price per room, lane, game or group ([en, fr]).
// Indoor test 16 (2026-11-19; Tyler: everyone books his escape rooms ahead, so "Groups: from what size should they book
// ahead?" read oddly): for a place whose owner said Please book ahead, the Groups size question asks when a big group
// should call or book more than one of its own unit ([en, fr]); a kind with none asks when to call ahead.
const BOOK_AHEAD_UNIT = { escape: ['room', 'salle'], bowling: ['lane', 'allée'], curling: ['sheet', 'piste'], games: ['session', 'séance'], climbing: ['session', 'séance'],
  classes: ['class', 'cours'], yoga: ['class', 'cours'], spa: ['appointment', 'rendez-vous'], kids: ['session', 'séance'], pool: ['session', 'séance'] };
const TYPER_PER = { room: ['One room', 'Une salle'], lane: ['One lane', 'Une allée'], game: ['One game', 'Une partie'], group: ['One group', 'Un groupe'] };
for (const [k, t] of Object.entries(TYPER)) if (K[k]) {
  const pp = TYPER_PERSON[k] || (TYPER_TRUE[k] || TYPER_TRUE.other).name;
  K[k].en.prices.typer = { item: t[0], section: t[1], person: pp[0] }; K[k].fr.prices.typer = { item: t[2], section: t[3], person: pp[1] };
}
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
// THE PRICE RULE's EXACT kinds (indoor test 18; see the top of this file): the label that truly names what the main price
// buys ([en, fr]). Every other kind is a RANGE kind and has no exact label (a spa is never "Adult price").
const EXACT = { gallery: ['Adult admission', 'Entrée adulte'], museum: ['Adult admission', 'Entrée adulte'], cinema: ['Adult ticket', 'Billet adulte'],
  pool: ['Adult drop-in', 'Entrée adulte à la séance'], yoga: ['Drop-in class', 'Cours à la carte'], bowling: ['One game', 'Une partie'], kids: ['Child admission', 'Entrée enfant'] };
for (const [k, x] of Object.entries(EXACT)) if (K[k]) {
  K[k].single = true; K[k].en.price.exact = x[0]; K[k].fr.price.exact = x[1];
  K[k].en.price.page = `${x[0]} {x}.`; K[k].fr.price.page = `${x[1]} {x}.`; K[k].en.price.basis = x[0]; K[k].fr.price.basis = x[1];
}
const FROM_WORDS = ['From {x}', 'À partir de {x}'];
const lc1 = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1);
// THE PRICE RULE (b) and (c), for a price per person (server.js indoorPriceView handles free, donation and per-unit first).
//   price  the owner's main price (> 0)
//   low    the lowest of the owner's own typed prices that is a real visit price, or null
//   money  (n, fr) -> "$12" / "12 $"
// -> { kind, exact, lowered, amount, line, page, card: { from, basis } }:
//   amount  the price the card, Build My Trip and the estimate use: always the lowest real price
//   line    the words with {x} for amount ("From {x}", "Adult admission {x}", "From {x} (adult admission $12)")
//   page    the page's Prices row ("From $70.")
//   card    from: the card says "From $70" (else "$12"); basis: the card's small line, in English (french-text.js)
function indoorPriceShow(kinds, lang, price, { low = null, money } = {}) {
  const k = indoorKindKey(kinds), fr = lang === 'fr', w = K[k][fr ? 'fr' : 'en'], m = money || ((n, f) => (f ? `${String(n).replace('.', ',')} $` : `$${n}`));
  const lo = typeof low === 'number' && Number.isFinite(low) && low > 0 && low < price ? low : null;
  const ex = EXACT[k];
  if (ex && lo == null) return { kind: k, exact: true, lowered: false, amount: price, line: `${ex[fr ? 1 : 0]} {x}`, page: `${ex[fr ? 1 : 0]} ${m(price, fr)}.`, card: { from: false, basis: ex[0] } };
  if (ex) {
    const line = `${FROM_WORDS[fr ? 1 : 0]} (${lc1(ex[fr ? 1 : 0])} ${m(price, fr)})`;
    return { kind: k, exact: true, lowered: true, amount: lo, line, page: `${line.replace('{x}', m(lo, fr))}.`, card: { from: true, basis: `${ex[0]} ${m(price, false)}` } };
  }
  const amount = lo != null ? lo : price, line = String(w.price.page).replace(/\.$/, '');
  return { kind: k, exact: false, lowered: lo != null, amount, line, page: `${line.replace('{x}', m(amount, fr))}.`, card: { from: true, basis: K[k].en.price.basis } };
}
// The exact labels [en, fr], for the card's small line with a lower price ("Adult admission $12") in French (french-text.js).
const INDOOR_EXACT_FR = Object.values(EXACT).map((x) => x.slice());
// Indoor test 12 (2026-11-19; Jess's price box was pre-filled with $80, research's "1 month unlimited intro pass $80"): the
// words a research price line must name for its amount to pre-fill the kind's Price box (the kind's own basis: a drop-in,
// a single class, an adult admission, a day pass…), and the words that make a line something else (an intro offer, a pass
// or card of several visits, a membership, a package, a discount day). No such line: the box starts empty.
const PREFILL = {
  gallery: /\b(?:adults?|admission|general admission|entry|entrance)\b|\bentr[ée]e\b/i,
  museum: /\b(?:adults?|admission|general admission|entry|entrance)\b|\bentr[ée]e\b/i,
  theatre: /\b(?:adults?|tickets?|general admission|admission)\b|\bbillets?\b/i,
  cinema: /\b(?:adults?|tickets?|general admission|admission)\b|\bbillets?\b/i,
  spa: /\b(?:treatments?|massages?|facials?|day pass|circuit|pass|sessions?|hydrotherapy|sauna)\b|\bsoins?\b/i,
  pool: /\b(?:drop[- ]?ins?|admission|public swim|swim|adults?)\b|\b[àa] la s[ée]ance\b/i,
  climbing: /\b(?:day pass|drop[- ]?ins?|pass|jump|jumps|sessions?|admission|climb(?:ing)?|adults?)\b/i,
  games: /\b(?:games?|rounds?|per (?:person|player)|sessions?|laser tag|vr|mini golf)\b|\bpartie\b/i,
  escape: /\b(?:per (?:person|player)|players?|persons?)\b|\bjoueurs?\b/i,
  bowling: /\b(?:per game|one game|games?|per person)\b|\bpartie\b/i,
  kids: /\b(?:per child|child(?:ren)?|kids?|play|drop[- ]?ins?|admission|day pass)\b|\benfants?\b/i,
  classes: /\b(?:class(?:es)?|workshops?|sessions?|drop[- ]?ins?)\b|\b(?:cours|atelier)\b/i,
  curling: /\b(?:learn to curl|sessions?|drop[- ]?ins?|per person|adults?)\b/i,
  yoga: /\b(?:drop[- ]?ins?(?: class(?:es)?)?|single class|one class|casual class|class drop[- ]?in)\b|\b(?:[àa] la (?:carte|s[ée]ance))\b/i,
  casino: /\b(?:entry|admission|cover)\b|\bentr[ée]e\b/i,
  library: /\b(?:programs?|workshops?|admission)\b|\bateliers?\b/i,
  other: /\b(?:admission|per person|entry|tickets?|drop[- ]?ins?|day pass|adults?)\b/i,
};
const PREFILL_NOT_RE = /\b(?:intro(?:ductory)?|new (?:students?|clients?|members?|customers?)|first (?:week|class|visit|month|time|timers?)|trial|unlimited|memberships?|members?|packages?|bundles?|punch|cards?|carte de \d+|\d+[- ]?(?:class|visit|session|pack|jump)s?|\d+ (?:weeks?|months?|days?)|weekly|monthly|annual|yearly|season|discount|deal|specials?|promo\w*|tuesdays?|cheap|groups?|private|part(?:y|ies)|per hour|an hour|hourly|lanes?|rentals?|rent|abonnements?|forfaits?|rabais)\b/i;
const PREFILL_PASS_RE = /\b(?:pass(?:es)?|laissez[- ]passer)\b/i;
// The pre-fill price in one research price line (or a card price's basis line) for a kind, or null.
function indoorPrefillPrice(kinds, text, amount = null) {
  const k = indoorKindKey(kinds), basis = PREFILL[k] || PREFILL.other;
  const passOk = /pass/.test(basis.source);
  const pieces = String(text || '').split(/[;\n•|]|\.(?=\s|$)|,\s+|\s+(?:or|ou)\s+/);
  for (const piece of pieces) {
    if (!basis.test(piece) || PREFILL_NOT_RE.test(piece) || (!passOk && PREFILL_PASS_RE.test(piece))) continue;
    if (amount != null) return amount;
    const m = /\$\s?(\d{1,3}(?:[.,]\d{2})?)(?!\d)|(\d{1,3}(?:[.,]\d{2})?)\s?\$/.exec(piece);
    const n = m ? Number(String(m[1] || m[2]).replace(',', '.')) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
// Indoor test 13 (2026-11-19; Dan's cinema got a 1-hour slot in "dinner and a movie"): how long Build My Trip plans a visit
// of each kind when the owner hasn't said (his Time needed answer always wins), in minutes. Null: the general indoor
// allowance.
const SLOT = { gallery: 60, museum: 90, theatre: 150, cinema: 150, spa: 150, pool: 90, climbing: 120, games: 90, escape: 60, bowling: 90, kids: 120, classes: 120, curling: 120, yoga: 75, casino: 120, library: 60, other: null };
for (const [k, x] of Object.entries(SLOT)) if (K[k]) K[k].slot = x;
// The owner's Time needed answer (server.js INDOOR_LENGTHS) in minutes.
const INDOOR_LENGTH_MINUTES = { '1h': 60, '1-2h': 90, '2-3h': 150, half: 240 };
// Indoor test 13: the kinds people buy tickets for a showtime at (their link is "Showtimes & tickets"), and the class kinds
// (their link is the class schedule). Every other kind with a booking page: "Book a visit" / "Book".
const TICKETED_KINDS = ['cinema', 'theatre'];
const CLASS_KINDS = ['yoga', 'classes'];
for (const k of TICKETED_KINDS) K[k].ticketed = true;
for (const k of CLASS_KINDS) K[k].classKind = true;
// The slot length in minutes for a place: its Time needed answer, else its main kind's default, else null.
function indoorSlotMinutes(kinds, length) {
  if (INDOOR_LENGTH_MINUTES[length]) return INDOOR_LENGTH_MINUTES[length];
  const k = Array.isArray(kinds) ? kinds.find((x) => K[x]) : K[kinds] ? kinds : null;
  return k && K[k].slot ? K[k].slot : null;
}
// What a place's link is, for a place with no set hours: 'shows' (showtimes), 'classes' (class times) or 'web' (times on
// their website): "Showtimes: see the schedule", "Class times: see the schedule", "Times: see their website".
function indoorTimesKind(kinds) { const k = indoorKindKey(kinds); return K[k].ticketed ? 'shows' : K[k].classKind ? 'classes' : 'web'; }
const INDOOR_TIMES_LINES = { shows: ['Showtimes: see the schedule', 'Séances : voir l’horaire'], classes: ['Class times: see the schedule', 'Horaires des cours : voir l’horaire'], web: ['Times: see their website', 'Horaires : voir leur site Web'] };
// The page's link button by kind and booking answer: [en, fr].
// Indoor test 17: a waiver link (Smartwaiver, WaiverSign…) is "Sign the waiver" whatever the booking answer.
const INDOOR_BOOK_BUTTONS = { waiver: ['Sign the waiver', 'Signer la décharge'], shows: ['Showtimes & tickets', 'Horaires et billets'], classes: ['Class schedule', 'Horaire des cours'], visit: ['Book a visit', 'Réserver une visite'], book: ['Book', 'Réserver'], party: ['Book a party', 'Réserver une fête'] };
// Indoor test 14 (2026-11-19; Helen's museum: the edit page's Add an event said "Live music, tastings, markets, classes or
// specials"): the kind's own events, for the Add an event heading line and its intro: [en, fr].
const EVENTS = {
  gallery: ['Exhibitions, openings, artist talks, workshops', 'Expositions, vernissages, rencontres avec les artistes, ateliers'],
  museum: ['Exhibitions, talks, family days', 'Expositions, conférences, journées familiales'],
  theatre: ['Shows, concerts, comedy nights', 'Spectacles, concerts, soirées d’humour'],
  cinema: ['Special screenings, film festivals, premieres', 'Projections spéciales, festivals de films, premières'],
  spa: ['Wellness nights, workshops, open houses', 'Soirées bien-être, ateliers, portes ouvertes'],
  pool: ['Family swims, swim lessons, special sessions', 'Bains familiaux, cours de natation, séances spéciales'],
  climbing: ['Competitions, clinics, theme nights', 'Compétitions, ateliers d’initiation, soirées à thème'],
  games: ['Tournaments, theme nights, retro nights', 'Tournois, soirées à thème, soirées rétro'],
  escape: ['Theme nights, new room launches, special events', 'Soirées à thème, nouvelles salles, événements spéciaux'],
  bowling: ['Cosmic bowling, tournaments, theme nights', 'Quilles cosmiques, tournois, soirées à thème'],
  kids: ['Toddler times, theme days, camps', 'Temps des tout-petits, journées à thème, camps'],
  classes: ['Workshops, paint nights, open studios', 'Ateliers, soirées peinture, ateliers ouverts'],
  curling: ['Bonspiels, learn-to-curl nights, open houses', 'Bonspiels, soirées d’initiation, portes ouvertes'],
  yoga: ['Workshops, special classes, retreats', 'Ateliers, cours spéciaux, retraites'],
  casino: ['Live music, tournaments, special events', 'Musique live, tournois, événements spéciaux'],
  library: ['Story times, author talks, workshops', 'Heures du conte, rencontres d’auteurs, ateliers'],
  other: ['Special events, theme nights, workshops', 'Événements spéciaux, soirées à thème, ateliers'],
};
for (const [k, x] of Object.entries(EVENTS)) if (K[k]) { K[k].en.events = x[0]; K[k].fr.events = x[1]; }
// Indoor test 17 (2026-11-19; Megan's bouldering-only gym read "Climbing & trampoline" on her card, page and every plan,
// and the trampoline word cost her a place in "climbing gym" plans): a kind label that names several things shows only
// the parts the place's own words (its name, story and Known for) say: "Climbing gym" (« Salle d’escalade ») unless they
// mention trampolines. Each part: [words, en, fr]; both: the label when several parts are said; none: the label when no
// part is said (the first part's, or the full label when nothing can be told).
const LABEL_PARTS = {
  climbing: { parts: [[/\b(?:climb\w*|boulder\w*|escalade|grimp\w*|belay\w*|top ?rope|auto ?belays?)\b/i, 'Climbing gym', 'Salle d’escalade'], [/\btrampolin\w*\b/i, 'Trampoline park', 'Parc de trampolines']],
    both: ['Climbing & trampoline', 'Escalade et trampoline'], none: ['Climbing gym', 'Salle d’escalade'] },
  spa: { parts: [[/\b(?:spas?|massages?|facials?|treatments?|hydrotherap\w*|soins?|wellness|bien-être)\b/i, 'Spa', 'Spa'], [/\b(?:saunas?|steam|bains? de vapeur)\b/i, 'Sauna', 'Sauna']],
    both: ['Spa & sauna', 'Spa et sauna'], none: ['Spa', 'Spa'] },
  pool: { parts: [[/\b(?:pools?|swim\w*|aquatic\w*|waterslides?|piscines?|natation|baignade)\b/i, 'Swimming pool', 'Piscine'], [/\b(?:rec(?:reation)? (?:centres?|centers?)|gym|fitness|arenas?|centre récréatif)\b/i, 'Rec centre', 'Centre récréatif']],
    both: ['Pool & rec centre', 'Piscine et centre récréatif'], none: ['Pool & rec centre', 'Piscine et centre récréatif'] },
};
// [en, fr] for a kind and the place's own words, or null (the kind's usual words). own null: nothing is known (the usual words).
function indoorKindLabel(kind, own) {
  const L = LABEL_PARTS[kind];
  if (!L || own == null) return null;
  const said = L.parts.filter((p) => p[0].test(String(own)));
  return said.length > 1 ? L.both.slice() : said.length === 1 ? [said[0][1], said[0][2]] : L.none.slice();
}
// Every label a kind may show ([en, fr] pairs), its usual words first.
function indoorKindLabels(kind, usual) { const L = LABEL_PARTS[kind]; return [usual].concat(L ? [L.both, L.none, ...L.parts.map((p) => [p[1], p[2]])] : []).filter(Boolean); }
// Indoor test 17 (2026-11-19; Megan's bouldering gym was offered "Waiver to sign before you play"): the waiver chip's verb
// follows the kind ([en, fr]): climb for a climbing gym (jump when its own words say trampolines and not climbing), play
// for a play centre or an arcade.
const WAIVER_VERB = { climbing: ['climb', 'grimper'], kids: ['play', 'jouer'], games: ['play', 'jouer'] };
function indoorWaiverVerb(kinds, own = '') {
  const k = indoorKindKey(kinds);
  if (k === 'climbing' && /\btrampolin\w*|\bjump/i.test(own) && !/\b(?:climb\w*|boulder\w*|escalade)\b/i.test(own)) return ['jump', 'sauter'];
  return WAIVER_VERB[k] || ['play', 'jouer'];
}
const INDOOR_KIND_TEXT = K;
const INDOOR_KIND_TEXT_KINDS = Object.keys(K);
// The kind a place reads in: its main kind (the first the owner picked), else 'other'.
function indoorKindKey(kinds) { const k = Array.isArray(kinds) ? kinds[0] : kinds; return k && K[k] ? k : 'other'; }
// One kind's words in one language ({ price, prices, help, groups, search, boxOffice, arts }).
function indoorKindText(kinds, lang) {
  const k = indoorKindKey(kinds), e = K[k], w = e[lang === 'fr' ? 'fr' : 'en'];
  // The prices link's words on the page: "See prices & rates" / « Voir les tarifs », a spa's "See the spa menu".
  const see = w.prices.page === PRICES_PAGE[lang === 'fr' ? 1 : 0] ? (lang === 'fr' ? 'Voir les tarifs' : 'See prices & rates') : lang === 'fr' ? `Voir la ${w.prices.page.toLowerCase()}` : `See the ${w.prices.page.toLowerCase()}`;
  return { kind: k, exPrice: e.exPrice || 15, single: !!e.single, slot: e.slot || null, ticketed: !!e.ticketed, classKind: !!e.classKind, boxOffice: !!e.boxOffice, arts: !!e.arts, quiet: !!e.quiet, day: !!(e.day || e.quiet), gtk: e.gtk || 'general', ex: e.ex || 'general', ...w, prices: { ...w.prices, see } };
}
// "Tickets from $25." with the price written in.
function indoorPriceLine(kinds, money, lang) { return indoorKindText(kinds, lang).price.page.replace('{x}', money); }
// The card's small lines in both languages (English -> French), for french-text.js.
const INDOOR_BASIS_FR = Object.fromEntries(Object.values(K).map((e) => [e.en.price.basis, e.fr.price.basis]).concat(Object.values(K).map((e) => [e.en.prices.page, e.fr.prices.page]))
  .concat(Object.values(K).filter((e) => e.en.price.exact).map((e) => [e.en.price.exact, e.fr.price.exact])));
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

module.exports = { indoorPriceShow, INDOOR_EXACT_FR, EXACT_PRICE_LABELS: EXACT, indoorWaiverVerb, indoorTyperWords, TYPER_TRUE, indoorKindLabel, indoorKindLabels, BOOK_AHEAD_UNIT, TYPER_PER, indoorSlotMinutes, indoorTimesKind, INDOOR_TIMES_LINES, INDOOR_BOOK_BUTTONS, INDOOR_LENGTH_MINUTES, TICKETED_KINDS, CLASS_KINDS, indoorPrefillPrice, INDOOR_TYPE_WORDS, INDOOR_KIND_TEXT, INDOOR_KIND_TEXT_KINDS, indoorKindKey, indoorKindText, indoorPriceLine, INDOOR_BASIS_FR, indoorKindsNamedIn };
