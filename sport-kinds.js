'use strict';
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Sports & recreation and golf (2026-11-20, the sport easy setup; Dayton: "sports next. same way, test fix until 8.5").
// The indoor engine runs the setup for type 'sport' and type 'golf' (server.js SPORT_SETUP_ON); this file is the sport
// kinds' table in the indoor table's shape (indoor-kinds.js merges it in, so every indoor helper reads these kinds too:
// indoorPriceShow, indoorKindText, indoorTyperWords, indoorPrefillPrice, indoorSlotMinutes…). The keys never repeat an
// indoor kind's key. The indoor lists (INDOOR_KIND_TEXT_KINDS, INDOOR_TYPE_WORDS, indoorKindsNamedIn) never hold them:
// "golf" in a request never means "indoor places only".
//
// THE PRICE RULE for these kinds is indoor-kinds.js's (see its top). EXACT kinds here: a rink's adult public skate and an
// outdoor pool's adult swim (one admission). Every other kind is a RANGE kind: "Green fees from $45.", "Lessons from $89.",
// "Bays from $40 an hour.", and the card "From $45 · Green fees". A free skate park, disc golf course, court or pump
// track taps Free (most of the public ones are free: "Free entry." / « Entrée gratuite. »).
//
// Per kind (the indoor fields, plus):
//   season   'summer' | 'winter' | ''   the usual season, for the Hours step's hint and Help ("Closed in winter? Tap We're
//            closed part of the year"); never written anywhere by itself (owner-only answers are never filled in)
//   planner  the Build My Trip type the kind plans as when a sport listing's owner picked it (server.js
//            tripSportPlannerType): 'indoor', 'outdoor', 'tour' (ski lessons), 'golf' (golf listings stay golf), or
//            null (courts and Something else: a local facility, not a visitor's stop)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const K = {};
const PRICES_PAGE = ['Prices & rates', 'Tarifs'];
const kind = (o) => o;

K.golf = kind({ bookBtn: ['Book a tee time', 'Réserver un départ'], day: true, gtk: 'golf', ex: 'golf', season: 'summer', planner: 'golf',
  en: { price: { page: 'Green fees from {x}.', basis: 'Green fees', label: 'Your lowest adult green fee (9 or 18 holes), in dollars', ph: '', lead: 'Your lowest regular adult green fee, 9 or 18 holes. It shows on your card.' },
    prices: { noun: 'rates page', page: 'Green fees & rates', lead: 'Green fees for 9 and 18 holes, twilight rates, carts, club rentals and passes, with their prices. A photo of your rate sheet or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Tee times recommended; walk-ons when there’s room', ages: 'All ages; juniors under 12 with an adult', gift: 'Gift cards and passes in the pro shop', prices: '18 holes $89, twilight $55, cart $25' },
    groups: { chips: ['Tournaments and corporate golf', 'Group lessons and clinics', 'Weddings and private events'], lead: 'Tap a size, then add tournaments, group lessons or private events in your own words.', ex: 'Tournaments for 16 to 144 golfers. Corporate golf days' },
    search: ['golf', 'golf course', 'golf courses', 'golfing', 'play golf', 'round of golf', 'tee time', 'tee times', 'green fees', 'green fee', '18 holes', '9 holes', 'nine holes'] },
  fr: { price: { page: 'Droits de jeu à partir de {x}.', basis: 'Droits de jeu', label: 'Votre droit de jeu adulte le moins cher (9 ou 18 trous), en dollars', ph: '', lead: 'Votre droit de jeu adulte régulier le moins cher, 9 ou 18 trous. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: 'Droits de jeu et tarifs', lead: 'Les droits de jeu pour 9 et 18 trous, les tarifs du crépuscule, les voiturettes, la location de bâtons et les abonnements, avec leurs prix. Une photo de votre grille tarifaire ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Heures de départ conseillées; sans réservation s’il y a de la place', ages: 'Tous les âges; juniors de moins de 12 ans avec un adulte', gift: 'Cartes-cadeaux et abonnements à la boutique du pro', prices: '18 trous 89 $, crépuscule 55 $, voiturette 25 $' },
    groups: { chips: ['Tournois et golf d’entreprise', 'Cours et cliniques de groupe', 'Mariages et événements privés'], lead: 'Touchez une taille, puis ajoutez les tournois, les cours de groupe ou les événements privés dans vos mots.', ex: 'Tournois de 16 à 144 golfeurs. Journées de golf d’entreprise' },
    search: ['golf', 'terrain de golf', 'terrains de golf', 'parcours de golf', 'jouer au golf', 'heure de départ', 'droits de jeu', '18 trous', '9 trous'] } });

K.simgolf = kind({ bookBtn: ['Book a bay', 'Réserver une baie'], gtk: 'simgolf', ex: 'simgolf', season: '', planner: 'indoor',
  en: { price: { page: 'Bays from {x} an hour.', basis: 'Per bay, per hour', label: 'Your lowest price for one bay for an hour, in dollars', ph: '', lead: 'Your lowest price for one bay for one hour. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Bay rates by the hour, peak and off-peak, lessons, leagues and memberships, with their prices. A link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Book a bay ahead; walk-ins when one is free', ages: 'All ages; 19+ after 9 PM', gift: 'Gift cards online or at the front desk', prices: 'Off-peak $40 an hour, peak $60 an hour' },
    groups: { chips: ['Corporate events and parties', 'Leagues and tournaments', 'Private bay bookings'], lead: 'Tap a size, then add corporate events, leagues or private bookings in your own words.', ex: 'Up to 6 players a bay. Corporate parties for up to 40' },
    search: ['golf simulator', 'golf simulators', 'indoor golf', 'sim golf', 'simulator golf', 'trackman', 'virtual golf', 'golf lounge'] },
  fr: { price: { page: 'Baies à partir de {x} l’heure.', basis: 'Par baie, à l’heure', label: 'Votre prix le plus bas pour une baie pendant une heure, en dollars', ph: '', lead: 'Votre prix le plus bas pour une baie pendant une heure. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'Les tarifs des baies à l’heure, en période de pointe ou non, les cours, les ligues et les abonnements, avec leurs prix. Un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez une baie à l’avance; sans réservation si une baie est libre', ages: 'Tous les âges; 19+ après 21 h', gift: 'Cartes-cadeaux en ligne ou à l’accueil', prices: 'Hors pointe 40 $ l’heure, en pointe 60 $ l’heure' },
    groups: { chips: ['Événements d’entreprise et fêtes', 'Ligues et tournois', 'Réservation privée de baies'], lead: 'Touchez une taille, puis ajoutez les événements d’entreprise, les ligues ou les réservations privées dans vos mots.', ex: 'Jusqu’à 6 joueurs par baie. Fêtes d’entreprise jusqu’à 40 personnes' },
    search: ['simulateur de golf', 'simulateurs de golf', 'golf intérieur', 'golf virtuel'] } });

K.range = kind({ day: true, gtk: 'range', ex: 'range', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'Buckets and rounds', label: 'Your lowest price (a small bucket or one round), in dollars', ph: '', lead: 'Your lowest price: a small bucket of balls or one round of mini golf. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Buckets, mini golf rounds, lessons and passes, with their prices. A photo of your price board or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; lessons by booking', ages: 'All ages; kids under 10 with an adult', gift: 'Gift cards and range cards at the counter', prices: 'Large bucket $18, mini golf kids $9' },
    groups: { chips: ['Birthday parties', 'Group lessons and clinics', 'Corporate and team outings'], lead: 'Tap a size, then add birthday parties, group lessons or team outings in your own words.', ex: 'Birthday parties with mini golf for up to 20. Group lessons on weekends' },
    search: ['driving range', 'driving ranges', 'golf range', 'practice range', 'bucket of balls', 'mini golf', 'mini putt', 'minigolf', 'mini-golf', 'putting course', 'crazy golf'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Seaux et parties', label: 'Votre prix le plus bas (un petit seau ou une partie), en dollars', ph: '', lead: 'Votre prix le plus bas : un petit seau de balles ou une partie de mini-golf. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Les seaux, les parties de mini-golf, les cours et les cartes, avec leurs prix. Une photo de votre tableau des prix ou un lien vers celui-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; cours sur réservation', ages: 'Tous les âges; moins de 10 ans avec un adulte', gift: 'Cartes-cadeaux et cartes de practice au comptoir', prices: 'Grand seau 18 $, mini-golf enfants 9 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Cours et cliniques de groupe', 'Sorties d’entreprise et d’équipe'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les cours de groupe ou les sorties d’équipe dans vos mots.', ex: 'Fêtes d’anniversaire avec mini-golf jusqu’à 20 personnes. Cours de groupe la fin de semaine' },
    search: ['champ de pratique', 'practice de golf', 'seau de balles', 'mini-golf', 'minigolf'] } });

// Ski lessons plan as a tour stop (Build My Trip's ski lessons are a tour kind: 'ski_lessons').
K.skischool = kind({ bookBtn: ['Book a lesson', 'Réserver un cours'], day: true, gtk: 'snow', ex: 'skischool', season: 'winter', planner: 'tour',
  en: { price: { page: 'Lessons from {x}.', basis: 'Lessons', label: 'Your lowest lesson price (like a group lesson), in dollars', ph: '', lead: 'Your lowest lesson price, like one group lesson. It shows on your card.' },
    prices: { noun: 'lessons page', page: 'Lessons & rates', lead: 'Group and private lessons, kids’ programs, rentals and lift tickets, with their prices. A link to your lessons page is perfect. It’s optional.' },
    help: { walkin: 'Book lessons ahead, especially at Christmas and spring break', ages: 'Kids’ programs from age 3; adults welcome', gift: 'Gift cards for lessons online', prices: 'Private lesson $219, kids’ day camp $179' },
    groups: { chips: ['School and club groups', 'Private group lessons', 'Corporate ski days'], lead: 'Tap a size, then add school groups, private group lessons or corporate days in your own words.', ex: 'School groups midweek. Private lessons for families of up to 5' },
    search: ['ski lesson', 'ski lessons', 'snowboard lesson', 'snowboard lessons', 'ski school', 'snow school', 'learn to ski', 'learn to snowboard', 'night skiing', 'ski night', 'kids ski lessons'] },
  fr: { price: { page: 'Cours à partir de {x}.', basis: 'Cours', label: 'Votre cours le moins cher (comme un cours de groupe), en dollars', ph: '', lead: 'Votre cours le moins cher, comme un cours de groupe. Il paraît sur votre fiche.' },
    prices: { noun: 'page des cours', page: 'Cours et tarifs', lead: 'Les cours de groupe et privés, les programmes pour enfants, la location et les billets de remontée, avec leurs prix. Un lien vers votre page des cours, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez les cours à l’avance, surtout à Noël et à la relâche', ages: 'Programmes pour enfants dès 3 ans; adultes bienvenus', gift: 'Cartes-cadeaux pour les cours en ligne', prices: 'Cours privé 219 $, camp de jour pour enfants 179 $' },
    groups: { chips: ['Groupes scolaires et de clubs', 'Cours privés de groupe', 'Journées de ski d’entreprise'], lead: 'Touchez une taille, puis ajoutez les groupes scolaires, les cours privés de groupe ou les journées d’entreprise dans vos mots.', ex: 'Groupes scolaires en semaine. Cours privés pour les familles jusqu’à 5 personnes' },
    search: ['cours de ski', 'cours de planche à neige', 'école de ski', 'apprendre à skier', 'ski de soirée', 'ski en soirée'] } });

K.rink = kind({ gtk: 'rink', ex: 'rink', season: 'winter', planner: 'indoor',
  en: { price: { page: 'Adult public skate {x}.', basis: 'Adult public skate', label: 'Adult public skate, in dollars', ph: '', lead: 'Your adult public skating price. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Public skating, drop-in hockey, skate rental and ice rental, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Drop in during public skating; ice rentals by booking', ages: 'All ages; helmets for kids under 12', gift: 'Passes at the front desk', prices: 'Kids $3, skate rental $5, 10-skate pass $40' },
    groups: { chips: ['Birthday parties on the ice', 'School groups welcome', 'Private ice rentals'], lead: 'Tap a size, then add birthday parties, school groups or ice rentals in your own words.', ex: 'Birthday parties with a room after the skate. Ice rentals by the hour' },
    search: ['skating', 'ice skating', 'public skating', 'public skate', 'skating rink', 'ice rink', 'arena', 'arenas', 'hockey', 'drop in hockey', 'shinny', 'stick and puck'] },
  fr: { price: { page: 'Patinage libre adulte {x}.', basis: 'Patinage libre adulte', label: 'Patinage libre adulte, en dollars', ph: '', lead: 'Votre prix de patinage libre pour un adulte. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'Le patinage libre, le hockey libre, la location de patins et la location de glace, avec leurs prix. Une photo de vos tarifs ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation pendant le patinage libre; location de glace sur réservation', ages: 'Tous les âges; casque pour les moins de 12 ans', gift: 'Cartes à l’accueil', prices: 'Enfants 3 $, location de patins 5 $, carte de 10 entrées 40 $' },
    groups: { chips: ['Fêtes d’anniversaire sur la glace', 'Groupes scolaires bienvenus', 'Location de glace privée'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes scolaires ou la location de glace dans vos mots.', ex: 'Fêtes d’anniversaire avec une salle après le patin. Location de glace à l’heure' },
    search: ['patinage', 'patin', 'patinage libre', 'patinoire', 'aréna', 'arénas', 'hockey', 'hockey libre'] } });

K.swim = kind({ day: true, gtk: 'swim', ex: 'swim', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Adult swim {x}.', basis: 'Adult swim', label: 'Adult swim, in dollars', ph: '', lead: 'Your adult swim price. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Swims for adults, kids and families, passes and lessons, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Drop in during public swims; lessons need booking', ages: 'All ages; under 8 with an adult in the water', gift: 'Passes at the front desk', prices: 'Kids $3, family swim $12, 10-swim pass $45' },
    groups: { chips: ['Birthday parties', 'Camp and school groups', 'Pool rentals on request'], lead: 'Tap a size, then add birthday parties, camp groups or pool rentals in your own words.', ex: 'Birthday parties on weekends. Camp groups welcome on weekday mornings' },
    search: ['outdoor pool', 'outdoor pools', 'outdoor swimming pool', 'outdoor swim', 'spray park', 'splash pad', 'splash park', 'public swim', 'swimming', 'swim'] },
  fr: { price: { page: 'Baignade adulte {x}.', basis: 'Baignade adulte', label: 'Baignade adulte, en dollars', ph: '', lead: 'Votre prix de baignade pour un adulte. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'Les baignades pour adultes, enfants et familles, les cartes et les cours, avec leurs prix. Une photo de vos tarifs ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation pendant les bains libres; les cours se réservent', ages: 'Tous les âges; moins de 8 ans avec un adulte dans l’eau', gift: 'Cartes à l’accueil', prices: 'Enfants 3 $, bain familial 12 $, carte de 10 baignades 45 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes de camp et scolaires', 'Location de la piscine sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes de camp ou la location de la piscine dans vos mots.', ex: 'Fêtes d’anniversaire la fin de semaine. Groupes de camp bienvenus en semaine le matin' },
    search: ['piscine extérieure', 'piscines extérieures', 'jeux d’eau', 'parc aquatique', 'bain libre', 'baignade'] } });

K.skatepark = kind({ day: true, gtk: 'skate', ex: 'skatepark', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'Per person', label: 'Your price for one person, if you charge one, in dollars', ph: '', lead: 'The price for one person, if there is one. Free to use? Tap Free entry.' },
    prices: { noun: 'programs page', page: PRICES_PAGE[0], lead: 'Lessons, camps and programs, with their prices. A link to your programs page is perfect. It’s optional.' },
    help: { walkin: 'Open to everyone; no need to book', ages: 'All ages; helmets strongly recommended', gift: 'Lessons can be booked through the rec centre', prices: 'Beginner lessons $25' },
    groups: { chips: ['Lessons and camps', 'Competitions and jams', 'School and youth groups'], lead: 'Tap what you offer, like lessons or jams, or say it in your own words.', ex: 'Summer skate camps for ages 7 to 14. Youth jam nights' },
    search: ['skate park', 'skate parks', 'skatepark', 'skateparks', 'skateboarding', 'skateboard', 'scooter park', 'skate bowl'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Par personne', label: 'Votre prix pour une personne, s’il y en a un, en dollars', ph: '', lead: 'Le prix pour une personne, s’il y en a un. C’est gratuit? Touchez Entrée gratuite.' },
    prices: { noun: 'page des programmes', page: PRICES_PAGE[1], lead: 'Les cours, les camps et les programmes, avec leurs prix. Un lien vers votre page des programmes, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Ouvert à tous; pas besoin de réserver', ages: 'Tous les âges; casque fortement conseillé', gift: 'Les cours se réservent au centre récréatif', prices: 'Cours pour débutants 25 $' },
    groups: { chips: ['Cours et camps', 'Compétitions et jams', 'Groupes scolaires et de jeunes'], lead: 'Touchez ce que vous offrez, comme des cours ou des jams, ou écrivez-le dans vos mots.', ex: 'Camps de planche l’été pour les 7 à 14 ans. Soirées jam pour les jeunes' },
    search: ['planchodrome', 'planchodromes', 'parc de planche', 'skatepark', 'planche à roulettes'] } });

K.bike = kind({ day: true, gtk: 'bike', ex: 'bike', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'Per rider', label: 'Your price for one rider (like a practice night), if you charge one, in dollars', ph: '', lead: 'The price for one rider, like a practice night, if there is one. Free to ride? Tap Free entry.' },
    prices: { noun: 'programs page', page: PRICES_PAGE[0], lead: 'Practice nights, race nights, memberships and bike rentals, with their prices. A link to your club or programs page is perfect. It’s optional.' },
    help: { walkin: 'Open to riders when there’s no race or practice on', ages: 'All ages; helmets required', gift: 'Club memberships online', prices: 'Practice night $10, season membership $90' },
    groups: { chips: ['Learn-to-ride clinics', 'Race nights', 'School and camp groups'], lead: 'Tap what you offer, like clinics or race nights, or say it in your own words.', ex: 'Learn-to-ride clinics on Saturdays. Race nights Thursdays in summer' },
    search: ['bmx', 'bmx track', 'bmx tracks', 'pump track', 'pump tracks', 'bike park', 'bike parks', 'dirt jumps', 'bike skills park', 'mountain bike trails', 'mountain biking', 'mtb'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Par cycliste', label: 'Votre prix pour un cycliste (comme une soirée d’entraînement), s’il y en a un, en dollars', ph: '', lead: 'Le prix pour un cycliste, comme une soirée d’entraînement, s’il y en a un. C’est gratuit? Touchez Entrée gratuite.' },
    prices: { noun: 'page des programmes', page: PRICES_PAGE[1], lead: 'Les soirées d’entraînement, les courses, les abonnements et la location de vélos, avec leurs prix. Un lien vers la page de votre club ou de vos programmes, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Ouvert aux cyclistes s’il n’y a ni course ni entraînement', ages: 'Tous les âges; casque obligatoire', gift: 'Abonnements au club en ligne', prices: 'Soirée d’entraînement 10 $, abonnement de saison 90 $' },
    groups: { chips: ['Cliniques d’initiation', 'Soirées de course', 'Groupes scolaires et de camp'], lead: 'Touchez ce que vous offrez, comme des cliniques ou des soirées de course, ou écrivez-le dans vos mots.', ex: 'Cliniques d’initiation le samedi. Soirées de course le jeudi l’été' },
    search: ['piste de bmx', 'bmx', 'pump track', 'parc de vélo', 'sentiers de vélo de montagne', 'vélo de montagne'] } });

K.courts = kind({ bookBtn: ['Book a court', 'Réserver un terrain'], day: true, gtk: 'courts', ex: 'courts', season: '', planner: null,
  en: { price: { page: 'Court time from {x}.', basis: 'Court time', label: 'Your lowest price for court time (like a drop-in), if you charge one, in dollars', ph: '', lead: 'Your lowest price for court time, like a drop-in, if there is one. Free to play? Tap Free entry.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Drop-in, court bookings, lessons and memberships, with their prices. A link to your rates or booking page is perfect. It’s optional.' },
    help: { walkin: 'First come, first served; book a court for evenings', ages: 'All ages', gift: 'Memberships through the club', prices: 'Drop-in $5, lessons $30' },
    groups: { chips: ['Drop-in play nights', 'Lessons and clinics', 'Leagues and tournaments'], lead: 'Tap what you offer, like drop-in nights or leagues, or say it in your own words.', ex: 'Drop-in pickleball weekday mornings. Beginner clinics on Saturdays' },
    search: ['tennis', 'tennis court', 'tennis courts', 'pickleball', 'pickleball court', 'pickleball courts', 'basketball court', 'basketball courts', 'courts'] },
  fr: { price: { page: 'Terrain à partir de {x}.', basis: 'Temps de terrain', label: 'Votre prix le plus bas pour un terrain (comme le jeu libre), s’il y en a un, en dollars', ph: '', lead: 'Votre prix le plus bas pour un terrain, comme le jeu libre, s’il y en a un. C’est gratuit? Touchez Entrée gratuite.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'Le jeu libre, la réservation de terrains, les cours et les abonnements, avec leurs prix. Un lien vers votre page des tarifs ou de réservation, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Premier arrivé, premier servi; réservez un terrain le soir', ages: 'Tous les âges', gift: 'Abonnements auprès du club', prices: 'Jeu libre 5 $, cours 30 $' },
    groups: { chips: ['Soirées de jeu libre', 'Cours et cliniques', 'Ligues et tournois'], lead: 'Touchez ce que vous offrez, comme le jeu libre ou des ligues, ou écrivez-le dans vos mots.', ex: 'Pickleball libre en semaine le matin. Cliniques pour débutants le samedi' },
    search: ['tennis', 'court de tennis', 'courts de tennis', 'pickleball', 'terrain de pickleball', 'terrain de basketball'] } });

K.discgolf = kind({ day: true, gtk: 'discgolf', ex: 'discgolf', season: '', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'Per round', label: 'Your price for one round, if you charge one, in dollars', ph: '', lead: 'The price for one round, if there is one. Free to play? Tap Free entry.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Rounds, disc rentals and leagues, with their prices. A link to your page is perfect. It’s optional.' },
    help: { walkin: 'Free to play any time in daylight', ages: 'All ages', gift: 'Discs at the local shop', prices: 'Disc rental $5' },
    groups: { chips: ['Weekly league nights', 'Tournaments', 'Learn-to-play clinics'], lead: 'Tap what you offer, like leagues or tournaments, or say it in your own words.', ex: 'League nights Wednesdays at 6. Two tournaments a year' },
    search: ['disc golf', 'disc golf course', 'disc golf courses', 'frisbee golf', 'frolf'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Par partie', label: 'Votre prix pour une partie, s’il y en a un, en dollars', ph: '', lead: 'Le prix pour une partie, s’il y en a un. C’est gratuit? Touchez Entrée gratuite.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Les parties, la location de disques et les ligues, avec leurs prix. Un lien vers votre page, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Gratuit à toute heure de la journée', ages: 'Tous les âges', gift: 'Disques à la boutique du coin', prices: 'Location de disques 5 $' },
    groups: { chips: ['Soirées de ligue', 'Tournois', 'Cliniques d’initiation'], lead: 'Touchez ce que vous offrez, comme des ligues ou des tournois, ou écrivez-le dans vos mots.', ex: 'Soirées de ligue le mercredi à 18 h. Deux tournois par année' },
    search: ['disque-golf', 'disque golf', 'parcours de disque-golf', 'golf frisbee'] } });

K.sportsctr = kind({ gtk: 'sportsctr', ex: 'sportsctr', season: '', planner: 'indoor',
  en: { price: { page: 'Drop-in from {x}.', basis: 'Drop-in', label: 'Your lowest adult drop-in price, in dollars', ph: '', lead: 'Your lowest adult drop-in price. It shows on your card.' },
    prices: { noun: 'rates page', page: PRICES_PAGE[0], lead: 'Drop-in, passes, programs and rentals, with their prices. A photo of your rates or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Drop in during public times; programs by registration', ages: 'All ages; under 12 with an adult', gift: 'Passes at the front desk', prices: 'Youth $3, 10-visit pass $45' },
    groups: { chips: ['Birthday parties', 'School and camp groups', 'Gym and room rentals'], lead: 'Tap a size, then add birthday parties, school groups or rentals in your own words.', ex: 'Birthday parties with a room. Gym rentals by the hour' },
    search: ['sports centre', 'sports center', 'sports complex', 'recreation complex', 'drop in sports', 'drop-in sports', 'gymnasium'] },
  fr: { price: { page: 'À la séance à partir de {x}.', basis: 'À la séance', label: 'Votre prix adulte à la séance le plus bas, en dollars', ph: '', lead: 'Votre prix adulte à la séance le plus bas. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: PRICES_PAGE[1], lead: 'L’entrée à la séance, les cartes, les programmes et les locations, avec leurs prix. Une photo de vos tarifs ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation pendant les périodes publiques; programmes sur inscription', ages: 'Tous les âges; moins de 12 ans avec un adulte', gift: 'Cartes à l’accueil', prices: 'Jeunes 3 $, carte de 10 entrées 45 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes scolaires et de camp', 'Location du gymnase ou de salles'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes scolaires ou les locations dans vos mots.', ex: 'Fêtes d’anniversaire avec une salle. Location du gymnase à l’heure' },
    search: ['centre sportif', 'complexe sportif', 'complexe récréatif', 'sports libres', 'gymnase'] } });

K.sportother = kind({ day: true, gtk: 'sportgen', ex: 'sportgen', season: '', planner: null,
  en: { price: { page: 'From {x}.', basis: 'Per person', label: 'Your lowest price for one person, in dollars', ph: '', lead: 'Your lowest price for one person. Free? Tap Free entry. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Every pass, lesson, rental or program and what it costs. A photo of your price list or a link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; book ahead on weekends', ages: 'All ages; kids under 12 with an adult', gift: 'Gift cards at the front desk or online', prices: 'Kids under 12: $10' },
    groups: { chips: ['Birthday parties', 'School and camp groups', 'Private bookings on request'], lead: 'Tap a size, then add birthday parties, school groups or private bookings in your own words.', ex: 'Birthday parties for up to 20. School groups welcome' },
    search: ['sports', 'recreation', 'sports and recreation', 'things to do outside'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Par personne', label: 'Votre prix le plus bas pour une personne, en dollars', ph: '', lead: 'Votre prix le plus bas pour une personne. C’est gratuit? Touchez Entrée gratuite. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque laissez-passer, cours, location ou programme et son prix. Une photo de votre liste de prix ou un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; réservez la fin de semaine', ages: 'Tous les âges; moins de 12 ans avec un adulte', gift: 'Cartes-cadeaux à l’accueil ou en ligne', prices: 'Enfants de moins de 12 ans : 10 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes scolaires et de camp', 'Réservations privées sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes d’anniversaire, les groupes scolaires ou les réservations privées dans vos mots.', ex: 'Fêtes d’anniversaire jusqu’à 20 personnes. Groupes scolaires bienvenus' },
    search: ['sports', 'loisirs', 'sports et loisirs'] } });

// The Price box's placeholder ([en, fr]): the number it wants and what it is.
const PRICE_PH = {
  // Short, so they fit a 390px phone box (the label above says what the number is).
  golf: ['Like 55', 'Par exemple 55'], simgolf: ['Like 45 (one bay, one hour)', 'Par exemple 45 (une baie, une heure)'], range: ['Like 12 (a small bucket)', 'Par exemple 12 (un petit seau)'],
  skischool: ['Like 89', 'Par exemple 89'], rink: ['Like 5', 'Par exemple 5'], swim: ['Like 5', 'Par exemple 5'],
  skatepark: ['Like 10, or tap Free entry', 'Par exemple 10, ou touchez Entrée gratuite'], bike: ['Like 10, or tap Free entry', 'Par exemple 10, ou touchez Entrée gratuite'],
  courts: ['Like 5, or tap Free entry', 'Par exemple 5, ou touchez Entrée gratuite'], discgolf: ['Like 5, or tap Free entry', 'Par exemple 5, ou touchez Entrée gratuite'],
  sportsctr: ['Like 6', 'Par exemple 6'], sportother: ['Like 15', 'Par exemple 15'],
};
// The price typer's example line and section: [en item, en section, fr item, fr section].
const TYPER = {
  golf: ['18 holes, adult', 'Green fees', '18 trous, adulte', 'Droits de jeu'],
  simgolf: ['One bay, one hour', 'Bays', 'Une baie, une heure', 'Baies'],
  range: ['Small bucket', 'Range', 'Petit seau', 'Champ de pratique'],
  skischool: ['Group lesson, 2 hours', 'Lessons', 'Cours de groupe, 2 heures', 'Cours'],
  rink: ['Adult public skate', 'Public skating', 'Patinage libre adulte', 'Patinage libre'],
  swim: ['Adult swim', 'Swims', 'Baignade adulte', 'Baignades'],
  skatepark: ['Beginner lesson', 'Lessons', 'Cours pour débutants', 'Cours'],
  bike: ['Practice night', 'Riding', 'Soirée d’entraînement', 'Vélo'],
  courts: ['Drop-in', 'Court time', 'Jeu libre', 'Terrains'],
  discgolf: ['Disc rental', 'Discs', 'Location de disques', 'Disques'],
  sportsctr: ['Drop-in', 'Drop-in', 'À la séance', 'À la séance'],
  sportother: ['Adult admission', 'Prices', 'Entrée adulte', 'Tarifs'],
};
// The first typed line's true name for the main price ([en, fr]); own: a specific word only when the place's own words
// say it ([words, en, fr]).
const TYPER_TRUE = {
  golf: { name: ['Green fee', 'Droit de jeu'], own: [[/\b18[- ]?holes?\b|\b18 trous\b/i, '18 holes', '18 trous'], [/\b9[- ]?holes?\b|\bnine holes\b|\b9 trous\b/i, '9 holes', '9 trous']] },
  simgolf: { name: ['One bay, one hour', 'Une baie, une heure'] },
  range: { name: ['Small bucket', 'Petit seau'], own: [[/\bmini[- ]?(?:golf|putt)\b/i, 'Mini golf, one round', 'Mini-golf, une partie'], [/\b(?:driving range|range|buckets?)\b/i, 'Small bucket', 'Petit seau']] },
  skischool: { name: ['Group lesson', 'Cours de groupe'], own: [[/\bnight skiing\b|\bski de soir[ée]e\b/i, 'Night lift ticket', 'Billet de soirée']] },
  rink: { name: ['Adult public skate', 'Patinage libre adulte'] },
  swim: { name: ['Adult swim', 'Baignade adulte'] },
  skatepark: { name: ['One person', 'Une personne'] },
  bike: { name: ['One rider', 'Un cycliste'] },
  courts: { name: ['Court time', 'Temps de terrain'] },
  discgolf: { name: ['One round', 'Une partie'] },
  sportsctr: { name: ['Drop-in', 'À la séance'] },
  sportother: { name: ['One person', 'Une personne'] },
};
// The "Type them in myself" line: [en, fr], each followed by ", one line at a time".
const TYPE_SUB = {
  golf: ['Each green fee or rate', 'Chaque droit de jeu ou tarif'], simgolf: ['Each bay rate or package', 'Chaque tarif de baie ou forfait'], range: ['Each bucket or round', 'Chaque seau ou partie'],
  skischool: ['Each lesson or program', 'Chaque cours ou programme'], rink: ['Each skate, pass or rental', 'Chaque séance, carte ou location'], swim: ['Each swim, pass or lesson', 'Chaque baignade, carte ou cours'],
  skatepark: ['Each lesson or camp', 'Chaque cours ou camp'], bike: ['Each night, membership or rental', 'Chaque soirée, abonnement ou location'], courts: ['Each drop-in or booking', 'Chaque séance ou réservation'],
  discgolf: ['Each round or rental', 'Chaque partie ou location'], sportsctr: ['Each drop-in, pass or program', 'Chaque séance, carte ou programme'], sportother: ['Each pass or program', 'Chaque laissez-passer ou programme'],
};
// Help's busy-times, theme-night and repeat examples: [en busy, en theme, en repeat, fr busy, fr theme, fr repeat].
const BUSY_THEME = {
  // Sport test 1: a golf course's weekly event is a men's or ladies' night (its twilight rate is a price line).
  golf: ['Weekend mornings book up a week ahead', 'Men’s night Wednesdays from 5 PM', 'every Wednesday', 'Les matins de fin de semaine se réservent une semaine d’avance', 'Soirée des hommes le mercredi dès 17 h', 'chaque mercredi'],
  simgolf: ['Evenings book up; daytime bays are easier', 'League night Tuesdays at 6 PM', 'every Tuesday', 'Les soirées sont pleines; plus facile le jour', 'Soirée de ligue le mardi à 18 h', 'chaque mardi'],
  range: ['Busiest on sunny weekend afternoons', 'Glow mini golf Fridays after dark', 'every Friday', 'Plus achalandé les après-midi ensoleillés de fin de semaine', 'Mini-golf fluo le vendredi à la noirceur', 'chaque vendredi'],
  skischool: ['Christmas week and spring break book up first', 'Night skiing Tue–Sat 3:30–8 PM', 'every Tuesday to Saturday', 'La semaine de Noël et la relâche se réservent en premier', 'Ski de soirée du mar. au sam. de 15 h 30 à 20 h', 'du mardi au samedi'],
  rink: ['Public skate times change with hockey games: check the schedule', 'Family skate Sundays 1–3 PM', 'every Sunday', 'Les heures de patinage libre changent selon les matchs : vérifiez l’horaire', 'Patinage familial le dimanche de 13 h à 15 h', 'chaque dimanche'],
  swim: ['Busiest on hot afternoons; quiet mornings', 'Family swim Saturdays 1–3 PM', 'every Saturday', 'Plus achalandé les après-midi chauds; calme le matin', 'Bain familial le samedi de 13 h à 15 h', 'chaque samedi'],
  skatepark: ['Busiest after school and on weekends', 'Youth jam nights Fridays 5–8 PM', 'every Friday', 'Plus achalandé après l’école et la fin de semaine', 'Soirées jam pour les jeunes le vendredi de 17 h à 20 h', 'chaque vendredi'],
  bike: ['Track closed to the public during race nights', 'Race night Thursdays at 6:30 PM', 'every Thursday', 'Piste fermée au public pendant les courses', 'Soirée de course le jeudi à 18 h 30', 'chaque jeudi'],
  courts: ['Busiest weekday mornings and evenings', 'Drop-in pickleball Mon, Wed, Fri 9–11 AM', 'every Monday, Wednesday and Friday', 'Plus achalandé en semaine le matin et le soir', 'Pickleball libre lun., mer., ven. de 9 h à 11 h', 'chaque lundi, mercredi et vendredi'],
  discgolf: ['Busiest on summer evenings', 'League night Wednesdays at 6 PM', 'every Wednesday', 'Plus achalandé les soirs d’été', 'Soirée de ligue le mercredi à 18 h', 'chaque mercredi'],
  sportsctr: ['Programs use the gym weeknights; drop-in on weekends', 'Drop-in basketball Fridays 7–9 PM', 'every Friday', 'Les programmes occupent le gymnase en semaine; jeu libre la fin de semaine', 'Basketball libre le vendredi de 19 h à 21 h', 'chaque vendredi'],
  sportother: ['Busiest on weekends and school holidays', 'Family day Sundays 10–2', 'every Sunday', 'Plus achalandé la fin de semaine et pendant les congés scolaires', 'Journée familiale le dimanche de 10 h à 14 h', 'chaque dimanche'],
};
// Help's example price for each kind before the owner has typed one.
const EX_PRICE = { golf: 55, simgolf: 45, range: 12, skischool: 89, rink: 5, swim: 5, skatepark: 10, bike: 10, courts: 5, discgolf: 5, sportsctr: 6, sportother: 15 };
// THE PRICE RULE's EXACT kinds: the label that truly names what the main price buys ([en, fr]).
const EXACT = { rink: ['Adult public skate', 'Patinage libre adulte'], swim: ['Adult swim', 'Baignade adulte'] };
// The words a research price line must name for its amount to pre-fill the kind's Price box (see indoor-kinds.js PREFILL).
const PREFILL = {
  golf: /\b(?:green fees?|18 holes?|9 holes?|nine holes?|adults?|rounds?|public rate)\b|\bdroits? de jeu\b/i,
  simgolf: /\b(?:per hour|an hour|hourly|\/ ?h(?:ou)?r|bays?|simulators?)\b|\bl.heure\b/i,
  range: /\b(?:buckets?|balls|rounds?|mini ?golf|mini ?putt|adults?)\b|\bseaux?\b/i,
  skischool: /\b(?:lessons?|group lesson|clinic|lift tickets?|night ski\w*)\b|\bcours\b/i,
  rink: /\b(?:public skat\w*|skat\w*|admission|adults?|drop[- ]?ins?)\b|\bpatin\w*\b/i,
  swim: /\b(?:swims?|swimming|admission|adults?|drop[- ]?ins?|public swim)\b|\bbaignades?\b/i,
  skatepark: /\b(?:lessons?|admission|per person|entry)\b/i,
  bike: /\b(?:practice|ride|riders?|race nights?|admission|per person|day pass)\b/i,
  courts: /\b(?:drop[- ]?ins?|court time|court|per hour|per person)\b|\bterrains?\b/i,
  discgolf: /\b(?:rounds?|per person|entry|admission)\b/i,
  sportsctr: /\b(?:drop[- ]?ins?|admission|adults?|public times?)\b|\b[àa] la s[ée]ance\b/i,
  sportother: /\b(?:admission|per person|entry|tickets?|drop[- ]?ins?|day pass|adults?)\b/i,
};
// How long Build My Trip plans a visit when the owner hasn't said (minutes).
const SLOT = { golf: 270, simgolf: 120, range: 60, skischool: 180, rink: 90, swim: 120, skatepark: 60, bike: 90, courts: 75, discgolf: 90, sportsctr: 90, sportother: null };
// The Add an event line's own events: [en, fr].
const EVENTS = {
  golf: ['Tournaments, clinics, open houses', 'Tournois, cliniques, portes ouvertes'],
  simgolf: ['Leagues, tournaments, theme nights', 'Ligues, tournois, soirées à thème'],
  range: ['Clinics, glow nights, tournaments', 'Cliniques, soirées fluo, tournois'],
  skischool: ['Clinics, camps, special nights', 'Cliniques, camps, soirées spéciales'],
  rink: ['Family skates, hockey games, special skates', 'Patinages familiaux, matchs de hockey, patinages spéciaux'],
  swim: ['Family swims, swim lessons, special swims', 'Bains familiaux, cours de natation, baignades spéciales'],
  skatepark: ['Jams, competitions, clinics', 'Jams, compétitions, cliniques'],
  bike: ['Race nights, clinics, open houses', 'Soirées de course, cliniques, portes ouvertes'],
  courts: ['Tournaments, clinics, drop-in nights', 'Tournois, cliniques, soirées de jeu libre'],
  discgolf: ['Tournaments, league nights, clinics', 'Tournois, soirées de ligue, cliniques'],
  sportsctr: ['Tournaments, camps, special programs', 'Tournois, camps, programmes spéciaux'],
  sportother: ['Special events, clinics, open houses', 'Événements spéciaux, cliniques, portes ouvertes'],
};
// When everyone books ahead, Groups asks when a big group should book more than one of these ([en, fr]).
const BOOK_AHEAD_UNIT = { golf: ['tee time', 'heure de départ'], simgolf: ['bay', 'baie'], courts: ['court', 'terrain'], skischool: ['lesson', 'cours'] };

// The kinds in the order the setup shows them (most common first; 2026-11-20 count of the 53 live golf listings: 40
// courses, 11 simulators, 2 ranges or mini golf; of the 36 sports listings: 9 arenas, 9 skate parks, 5 disc golf, 4 BMX
// tracks and bike trails, 3 outdoor pools, 3 courts, 2 ski lessons and night skiing, 1 sports centre).
const SPORT_KIND_ORDER = ['golf', 'simgolf', 'range', 'rink', 'skatepark', 'discgolf', 'bike', 'swim', 'courts', 'skischool', 'sportsctr', 'sportother'];
// The owner's chips (English, French).
const SPORT_KIND_LABELS_OWNER = {
  golf: ['Golf course', 'Terrain de golf'], simgolf: ['Indoor golf or simulators', 'Golf intérieur ou simulateurs'], range: ['Driving range or mini golf', 'Champ de pratique ou mini-golf'],
  rink: ['Arena or skating rink', 'Aréna ou patinoire'], skatepark: ['Skate park', 'Planchodrome (skatepark)'], discgolf: ['Disc golf', 'Disque-golf'],
  bike: ['BMX track, bike park or pump track', 'Piste de BMX, parc de vélo ou pump track'], swim: ['Outdoor pool or spray park', 'Piscine extérieure ou jeux d’eau'],
  courts: ['Tennis or pickleball courts', 'Terrains de tennis ou de pickleball'], skischool: ['Ski or snowboard lessons', 'Cours de ski ou de planche à neige'],
  sportsctr: ['Sports centre or rec complex', 'Centre sportif ou complexe récréatif'], sportother: ['Something else', 'Autre chose'],
};
// The page words of each kind (venues.cuisine, the card's category line).
const SPORT_KIND_WORDS = {
  golf: ['Golf course', 'Terrain de golf'],
  // "Golf simulator", never "Indoor golf": as a category word, "indoor golf" in a request read as a cuisine and lost the place.
  simgolf: ['Golf simulator', 'Simulateur de golf'], range: ['Driving range & mini golf', 'Champ de pratique et mini-golf'],
  rink: ['Arena & skating', 'Aréna et patinage'], skatepark: ['Skate park', 'Planchodrome'], discgolf: ['Disc golf', 'Disque-golf'],
  bike: ['BMX track & bike park', 'Piste de BMX et parc de vélo'], swim: ['Outdoor pool', 'Piscine extérieure'], courts: ['Tennis & pickleball', 'Tennis et pickleball'],
  skischool: ['Ski & snowboard lessons', 'Cours de ski et de planche'], sportsctr: ['Sports centre', 'Centre sportif'],
};
// A label naming several things shows only the parts the place's own words say (indoor-kinds.js indoorKindLabel).
const LABEL_PARTS = {
  range: { parts: [[/\b(?:driving range|range|buckets?|practice)\b/i, 'Driving range', 'Champ de pratique'], [/\bmini[- ]?(?:golf|putt)\b/i, 'Mini golf', 'Mini-golf']],
    both: ['Driving range & mini golf', 'Champ de pratique et mini-golf'], none: ['Driving range & mini golf', 'Champ de pratique et mini-golf'] },
  courts: { parts: [[/\btennis\b/i, 'Tennis courts', 'Terrains de tennis'], [/\bpickleball\b/i, 'Pickleball courts', 'Terrains de pickleball']],
    both: ['Tennis & pickleball', 'Tennis et pickleball'], none: ['Courts', 'Terrains'] },
  bike: { parts: [[/\bbmx\b/i, 'BMX track', 'Piste de BMX'], [/\b(?:bike park|pump track|dirt jumps?|skills park|mountain bik\w*|trails?)\b/i, 'Bike park', 'Parc de vélo']],
    both: ['BMX track & bike park', 'Piste de BMX et parc de vélo'], none: ['BMX track & bike park', 'Piste de BMX et parc de vélo'] },
  skischool: { parts: [[/\b(?:lessons?|school|learn|cours|école)\b/i, 'Ski & snowboard lessons', 'Cours de ski et de planche'], [/\bnight ski\w*|\bski de soir[ée]e\b/i, 'Night skiing', 'Ski de soirée']],
    both: ['Ski lessons & night skiing', 'Cours de ski et ski de soirée'], none: ['Ski & snowboard lessons', 'Cours de ski et de planche'] },
};
// Starting answers a kind suggests (pre-picked "We picked the usual for your kind of place", saved only with the screen).
const SPORT_KIND_LENGTH = { golf: 'half', simgolf: '1-2h', range: '1h', rink: '1-2h', skatepark: '1-2h', discgolf: '1-2h', bike: '1-2h', swim: '1-2h', courts: '1-2h', skischool: 'half', sportsctr: '1-2h' };
// Sport test 1 (2026-11-20): a golf course starts on "walk-ons when there's room; book tee times for busy times" (its own
// Good to know words: "Tee times recommended; walk-ons when there's room").
const SPORT_KIND_BOOK = { golf: 'busy', simgolf: 'ahead', range: 'no', rink: 'no', skatepark: 'no', discgolf: 'no', bike: 'no', swim: 'no', courts: 'no', skischool: 'ahead', sportsctr: 'no' };
// Public, open-to-all kinds start on All ages (a suggestion, saved only with the screen).
const SPORT_ALL_AGES_KINDS = ['golf', 'range', 'rink', 'skatepark', 'discgolf', 'bike', 'swim', 'courts', 'sportsctr'];
// The kinds research's words name (the name first, then the story), up to 3, as the starting picks.
const SPORT_KIND_HINTS = [['simgolf', /simulator|indoor golf|sim golf|golf lounge|sim lounge|virtual golf|golfbox|trackman|sportszone/], ['range', /driving range|mini ?golf|mini ?putt|\brange\b/],
  ['discgolf', /disc golf|frisbee golf/], ['golf', /(?<!disc |frisbee |mini[- ]|mini)\bgolf\b|country club|\blinks\b/], ['rink', /arena|rink|skating|curling|hockey|sun bowl|ice cent/], ['skatepark', /skate ?park|skateboard|youth park/],
  ['bike', /bmx|bike park|pump track|mountain bike|dirt jump|bike trails/], ['swim', /\bpool\b|spray park|splash|aquatic/], ['courts', /tennis|pickleball|\bcourts?\b/],
  ['skischool', /ski (?:&|and) board school|ski school|snow school|lessons|night skiing/], ['sportsctr', /sports cent|sports complex|recreation complex|rec cent/]];

// Sport test 1 (2026-11-20; Debbie's golf course: she picked "book ahead for busy times" and her page said "Walk-ins
// welcome", « Sans réservation »): each kind's booking words where the indoor ones don't fit, for the setup's three choices
// (chips), the page's Booking line (lines) and Build My Trip's note (notes; 'no' needs none). [en, fr] each.
const own = (en, fr) => [`${en} (the owner’s own answer).`, `${fr} (réponse de l’établissement).`];
const BOOK_WORDS = {
  golf: { chips: { no: ['Yes, walk-ons welcome', 'Oui, départs sans réservation'], busy: ['Walk-ons when there’s room; book tee times for busy times', 'Départs sans réservation s’il y a de la place; réservez pour les périodes achalandées'], ahead: ['No, please book a tee time', 'Non, réservez un départ'] },
    lines: { no: ['Walk-ons welcome: no tee time needed.', 'Départs sans réservation : pas besoin de réserver.'], busy: ['Walk-ons when there’s room. Book tee times for weekends and busy times.', 'Départs sans réservation s’il y a de la place. Réservez vos départs pour les fins de semaine et les périodes achalandées.'], ahead: ['Please book a tee time ahead.', 'Réservez votre départ à l’avance.'] },
    notes: { busy: own('Walk-ons when there’s room; book tee times for weekends and busy times', 'Départs sans réservation s’il y a de la place; réservez vos départs pour les fins de semaine et les périodes achalandées'), ahead: own('Book a tee time ahead', 'Réservez votre départ à l’avance') } },
  simgolf: { chips: { busy: ['Yes, but book a bay for busy times', 'Oui, mais réservez une baie pour les périodes achalandées'], ahead: ['No, please book a bay', 'Non, réservez une baie'] },
    lines: { no: ['Walk-ins welcome when a bay is free.', 'Sans réservation si une baie est libre.'], busy: ['Walk-ins when a bay is free. Book a bay for evenings, weekends and busy times.', 'Sans réservation si une baie est libre. Réservez une baie pour les soirées, les fins de semaine et les périodes achalandées.'], ahead: ['Please book a bay ahead.', 'Réservez une baie à l’avance.'] },
    notes: { busy: own('Walk-ins when a bay is free; book a bay for evenings, weekends and busy times', 'Sans réservation si une baie est libre; réservez une baie pour les soirées, les fins de semaine et les périodes achalandées'), ahead: own('Book a bay ahead', 'Réservez une baie à l’avance') } },
  courts: { chips: { no: ['Yes, first come, first served', 'Oui, premier arrivé, premier servi'], busy: ['Yes, but book a court for busy times', 'Oui, mais réservez un terrain pour les périodes achalandées'], ahead: ['No, please book a court', 'Non, réservez un terrain'] },
    lines: { no: ['First come, first served: no need to book.', 'Premier arrivé, premier servi : pas besoin de réserver.'], busy: ['First come, first served. Book a court for evenings, weekends and busy times.', 'Premier arrivé, premier servi. Réservez un terrain pour les soirées, les fins de semaine et les périodes achalandées.'], ahead: ['Please book a court ahead.', 'Réservez un terrain à l’avance.'] },
    notes: { busy: own('First come, first served; book a court for evenings, weekends and busy times', 'Premier arrivé, premier servi; réservez un terrain pour les soirées, les fins de semaine et les périodes achalandées'), ahead: own('Book a court ahead', 'Réservez un terrain à l’avance') } },
  skischool: { chips: { no: ['Yes, drop-in lessons', 'Oui, cours sans réservation'], busy: ['Yes, but book ahead for weekends and holidays', 'Oui, mais réservez pour les fins de semaine et les congés'], ahead: ['No, please book lessons ahead', 'Non, réservez les cours à l’avance'] },
    lines: { no: ['Drop-in lessons: no need to book.', 'Cours sans réservation : pas besoin de réserver.'], busy: ['Drop-in lessons when there’s room. Book ahead for weekends and holidays.', 'Cours sans réservation s’il y a de la place. Réservez pour les fins de semaine et les congés.'], ahead: ['Please book lessons ahead.', 'Réservez vos cours à l’avance.'] },
    notes: { busy: own('Drop-in lessons when there’s room; book ahead for weekends and holidays', 'Cours sans réservation s’il y a de la place; réservez pour les fins de semaine et les congés'), ahead: own('Book lessons ahead', 'Réservez vos cours à l’avance') } },
  // Open-to-all outdoor places: nobody "walks in" to a skate park, a disc golf course or a pump track.
  skatepark: { chips: { no: ['Yes, open to everyone', 'Oui, ouvert à tous'] }, lines: { no: ['Open to everyone: no need to book.', 'Ouvert à tous : pas besoin de réserver.'] } },
  discgolf: { chips: { no: ['Yes, open to everyone', 'Oui, ouvert à tous'] }, lines: { no: ['Open to everyone: no need to book.', 'Ouvert à tous : pas besoin de réserver.'] } },
  bike: { chips: { no: ['Yes, open to everyone', 'Oui, ouvert à tous'] }, lines: { no: ['Open to riders: no need to book.', 'Ouvert aux cyclistes : pas besoin de réserver.'] } },
  rink: { lines: { no: ['Drop in during public skating: no need to book.', 'Sans réservation pendant le patinage libre.'] } },
  swim: { lines: { no: ['Drop in during public swims: no need to book.', 'Sans réservation pendant les bains libres.'] } },
  sportsctr: { lines: { no: ['Drop in during public times: no need to book.', 'Sans réservation pendant les périodes publiques.'] } },
};
// Kinds played outdoors: the dog tile says "Dogs welcome", never "inside" (sport test 1).
const OUTDOOR_KINDS = ['golf', 'range', 'skatepark', 'discgolf', 'bike', 'swim', 'courts', 'skischool', 'sportother'];

const SPORT_KINDS = SPORT_KIND_ORDER.slice();
module.exports = { K, PRICE_PH, BOOK_WORDS, OUTDOOR_KINDS, TYPER, TYPER_TRUE, TYPE_SUB, BUSY_THEME, EX_PRICE, EXACT, PREFILL, SLOT, EVENTS, BOOK_AHEAD_UNIT, LABEL_PARTS,
  SPORT_KINDS, SPORT_KIND_ORDER, SPORT_KIND_LABELS_OWNER, SPORT_KIND_WORDS, SPORT_KIND_LENGTH, SPORT_KIND_BOOK, SPORT_ALL_AGES_KINDS, SPORT_KIND_HINTS };
