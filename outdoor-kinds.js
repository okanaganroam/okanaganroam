'use strict';
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Outdoor businesses (2026-11-23, the outdoor easy setup; Dayton: "Outdoor businesses" next, reuse the indoor engine,
// ski hills in with no claim messages, campgrounds per night only). The indoor engine runs the setup for type 'outdoor'
// (server.js OUTDOOR_SETUP_ON), the way it does for sport and golf; this file is the outdoor kinds' table in the sport
// table's shape. sport-kinds.js merges it into every one of its tables (so every indoor and sport helper reads these kinds
// too); OUTDOOR_KIND_ORDER is the list an outdoor listing picks from. The keys never repeat an indoor or sport kind's key.
//
// Only the outdoor BUSINESSES use it (campgrounds, rentals, water parks, adventure parks, air sports, stables, farms,
// nature centres, markets, ski hills). Public parks, trails, crags and huts have no owner: their pages never change.
//
// THE PRICE RULE (indoor-kinds.js top) for these kinds: EXACT kinds name what the main price buys ("Adult admission");
// RANGE kinds say "From $X" with their unit: a campsite a night, a rental an hour, a lift ticket a day.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const K = {};
const PRICES_PAGE = ['Prices & rates', 'Tarifs'];
const kind = (o) => o;
const gen = (o) => o;

K.camp = kind({ bookBtn: ['Book a site', 'Réserver un emplacement'], gtk: 'camp', ex: 'camp', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Sites from {x} a night.', basis: 'Per site, per night', label: 'Your lowest price for one site for one night, in dollars', ph: '', lead: 'Your lowest nightly price for one campsite or RV site, in season. Cabins, weekly and seasonal rates go in your price list. It shows on your card.' },
    prices: { noun: 'rates page', page: 'Site rates', lead: 'Tent sites, RV sites with hookups, cabins, weekly and seasonal rates, with their prices. A photo of your rate sheet or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Book ahead for summer weekends; walk-ins when a site is free', ages: 'All ages; quiet hours 10 PM to 7 AM', gift: 'Gift certificates at the office', prices: 'RV site with full hookups $65 a night' },
    groups: { chips: ['Group sites', 'Family reunions', 'Weddings and retreats'], lead: 'Tap a size, then add group sites, reunions or events in your own words.', ex: 'Two group sites for up to 30 people' },
    search: ['campground', 'campgrounds', 'camping', 'campsite', 'campsites', 'rv park', 'rv parks', 'rv site', 'tent site', 'camp', 'lake lodge', 'glamping'] },
  fr: { price: { page: 'Emplacements à partir de {x} la nuit.', basis: 'Par emplacement, par nuit', label: 'Votre prix le plus bas pour un emplacement pour une nuit, en dollars', ph: '', lead: 'Votre prix le plus bas pour une nuit sur un emplacement de tente ou de VR, en saison. Les chalets et les tarifs à la semaine ou à la saison vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: 'Tarifs des emplacements', lead: 'Emplacements de tente, emplacements de VR avec services, chalets, tarifs à la semaine et à la saison, avec leurs prix. Une photo de votre grille ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez pour les fins de semaine d’été; sans réservation si un emplacement est libre', ages: 'Tous les âges; heures de silence de 22 h à 7 h', gift: 'Certificats-cadeaux au bureau', prices: 'Emplacement de VR tout équipé 65 $ la nuit' },
    groups: { chips: ['Emplacements de groupe', 'Réunions de famille', 'Mariages et retraites'], lead: 'Touchez une taille, puis ajoutez les emplacements de groupe, les réunions ou les événements dans vos mots.', ex: 'Deux emplacements de groupe jusqu’à 30 personnes' },
    search: ['camping', 'terrain de camping', 'emplacement de camping', 'parc de vr', 'emplacement de vr', 'prêt-à-camper'] } });

K.waterrent = kind({ bookBtn: ['Rent now', 'Louer maintenant'], day: true, gtk: 'waterrent', ex: 'waterrent', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Rentals from {x} an hour.', basis: 'Per hour', label: 'Your lowest price for one hour, in dollars', ph: '', lead: 'Your lowest hourly price: one paddleboard, kayak or boat for an hour. Day rates and other boats go in your price list. It shows on your card.' },
    prices: { noun: 'rates page', page: 'Rental rates', lead: 'Each boat, board or toy by the hour and the day, deposits and fuel, with their prices. A photo of your rate board or a link to your rates page is perfect. It’s optional.' },
    help: { walkin: 'Walk-ups when boards are free; book boats ahead', ages: 'All ages with an adult; drivers 16+ with a boating card', gift: 'Gift cards at the shop or online', prices: 'Paddleboard $30 an hour, $90 a day' },
    groups: { chips: ['Group paddles', 'Bachelor and bachelorette parties', 'Corporate days on the lake'], lead: 'Tap a size, then add group paddles, parties or company days in your own words.', ex: 'Group paddles for up to 12' },
    search: ['boat rental', 'boat rentals', 'rent a boat', 'paddleboard rental', 'sup rental', 'kayak rental', 'canoe rental', 'jet ski rental', 'sea-doo rental', 'pontoon rental', 'water sports', 'wakeboard', 'wakesurf', 'parasail', 'parasailing', 'water toys'] },
  fr: { price: { page: 'Location à partir de {x} l’heure.', basis: 'À l’heure', label: 'Votre prix le plus bas pour une heure, en dollars', ph: '', lead: 'Votre prix le plus bas à l’heure : une planche, un kayak ou un bateau pour une heure. Les tarifs à la journée et les autres bateaux vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: 'Tarifs de location', lead: 'Chaque bateau, planche ou jouet à l’heure et à la journée, les dépôts et l’essence, avec leurs prix. Une photo de votre tableau ou un lien vers votre page des tarifs, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation si une planche est libre; réservez les bateaux', ages: 'Tous les âges avec un adulte; conducteurs de 16 ans et plus avec une carte de conducteur d’embarcation', gift: 'Cartes-cadeaux à la boutique ou en ligne', prices: 'Planche à pagaie 30 $ l’heure, 90 $ la journée' },
    groups: { chips: ['Sorties de groupe en planche', 'Enterrements de vie de garçon ou de fille', 'Journées d’entreprise sur le lac'], lead: 'Touchez une taille, puis ajoutez les sorties de groupe, les fêtes ou les journées d’entreprise dans vos mots.', ex: 'Sorties de groupe jusqu’à 12 personnes' },
    search: ['location de bateau', 'location de planche à pagaie', 'location de kayak', 'location de canot', 'location de motomarine', 'sports nautiques', 'parachute ascensionnel'] } });

K.waterpark = kind({ bookBtn: ['Buy passes', 'Acheter des laissez-passer'], day: true, gtk: 'waterpark', ex: 'waterpark', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Passes from {x}.', basis: 'One pass', label: 'Your lowest pass for one person, in dollars', ph: '', lead: 'Your lowest pass for one person: one hour or one session. Day passes, kids and family passes go in your price list. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Hourly and day passes, kids, family and season passes, with their prices. A photo of your price board or a link to it is perfect. It’s optional.' },
    help: { walkin: 'Book a time online on busy days; walk-ups when there’s room', ages: 'Ages 6+; kids under 12 with an adult; life jackets for everyone', gift: 'Gift cards online', prices: 'One-hour pass $25, day pass $55' },
    groups: { chips: ['Birthday parties', 'Camp and school groups', 'Private park bookings'], lead: 'Tap a size, then add birthday parties, camps or private bookings in your own words.', ex: 'Birthday parties for up to 15' },
    search: ['water park', 'waterpark', 'floating water park', 'inflatable park', 'waterslides', 'water slides', 'splash park'] },
  fr: { price: { page: 'Laissez-passer à partir de {x}.', basis: 'Un laissez-passer', label: 'Votre laissez-passer le moins cher pour une personne, en dollars', ph: '', lead: 'Votre laissez-passer le moins cher pour une personne : une heure ou une séance. Les laissez-passer à la journée, pour enfants et familiaux vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Les laissez-passer à l’heure, à la journée, pour enfants, familiaux et de saison, avec leurs prix. Une photo de votre tableau des prix ou un lien vers celui-ci, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez une heure en ligne les jours achalandés; sans réservation s’il y a de la place', ages: '6 ans et plus; moins de 12 ans avec un adulte; gilet de sauvetage pour tous', gift: 'Cartes-cadeaux en ligne', prices: 'Une heure 25 $, journée 55 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes de camp et scolaires', 'Réservation privée du parc'], lead: 'Touchez une taille, puis ajoutez les fêtes, les camps ou les réservations privées dans vos mots.', ex: 'Fêtes d’anniversaire jusqu’à 15 personnes' },
    search: ['parc aquatique', 'parc aquatique flottant', 'glissades d’eau', 'jeux d’eau'] } });

K.adventurepark = kind({ bookBtn: ['Book now', 'Réserver'], day: true, gtk: 'adventurepark', ex: 'adventurepark', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'One person', label: 'Your lowest price for one person, in dollars', ph: '', lead: 'Your lowest price for one person: one zipline, one course or a kids’ pass. Combos and family rates go in your price list. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Each course, zipline, combo, kids’ and family price. A photo of your price board or a link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Book a time online; walk-ins when there’s room', ages: 'Ages 7+; minimum height on some courses', gift: 'Gift cards online', prices: 'Kids’ course $29, full course $59' },
    groups: { chips: ['Birthday parties', 'School and camp groups', 'Team building'], lead: 'Tap a size, then add birthday parties, school groups or team days in your own words.', ex: 'Team building for up to 40' },
    search: ['zipline', 'ziplines', 'zip line', 'ziplining', 'adventure park', 'ropes course', 'treetop', 'aerial park', 'obstacle course', 'bungee'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Une personne', label: 'Votre prix le plus bas pour une personne, en dollars', ph: '', lead: 'Votre prix le plus bas pour une personne : une tyrolienne, un parcours ou un laissez-passer enfant. Les forfaits et les tarifs familiaux vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque parcours, tyrolienne, forfait, prix pour enfants et familial. Une photo de votre tableau des prix ou un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez une heure en ligne; sans réservation s’il y a de la place', ages: '7 ans et plus; taille minimale sur certains parcours', gift: 'Cartes-cadeaux en ligne', prices: 'Parcours enfants 29 $, parcours complet 59 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes scolaires et de camp', 'Consolidation d’équipe'], lead: 'Touchez une taille, puis ajoutez les fêtes, les groupes scolaires ou les journées d’équipe dans vos mots.', ex: 'Consolidation d’équipe jusqu’à 40 personnes' },
    search: ['tyrolienne', 'tyroliennes', 'parc d’aventure', 'hébertisme', 'parcours aérien', 'parcours d’obstacles'] } });

K.airsport = kind({ bookBtn: ['Book a flight', 'Réserver un vol'], day: true, gtk: 'airsport', ex: 'airsport', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'One person', label: 'Your lowest price for one person, in dollars', ph: '', lead: 'Your lowest price for one person: one tandem jump or flight. Photos, video and courses go in your price list. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Each jump, flight or course, plus photo and video packages, with their prices. A link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Book ahead; flights depend on the weather', ages: 'Ages 16+; weight limits apply', gift: 'Gift certificates online', prices: 'Tandem jump $339, video $129' },
    groups: { chips: ['Group bookings', 'Bachelor and bachelorette parties', 'Gift flights for two'], lead: 'Tap a size, then add group days or gift flights in your own words.', ex: 'Up to 4 people on one flight' },
    search: ['skydiving', 'skydive', 'tandem jump', 'paragliding', 'paraglide', 'hang gliding', 'hot air balloon', 'hot-air balloon', 'ballooning', 'scenic flight'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Une personne', label: 'Votre prix le plus bas pour une personne, en dollars', ph: '', lead: 'Votre prix le plus bas pour une personne : un saut en tandem ou un vol. Les photos, la vidéo et les cours vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque saut, vol ou cours, et les forfaits photo et vidéo, avec leurs prix. Un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez à l’avance; les vols dépendent de la météo', ages: '16 ans et plus; limites de poids', gift: 'Certificats-cadeaux en ligne', prices: 'Saut en tandem 339 $, vidéo 129 $' },
    groups: { chips: ['Réservations de groupe', 'Enterrements de vie de garçon ou de fille', 'Vols-cadeaux pour deux'], lead: 'Touchez une taille, puis ajoutez les journées de groupe ou les vols-cadeaux dans vos mots.', ex: 'Jusqu’à 4 personnes par vol' },
    search: ['parachutisme', 'saut en tandem', 'parapente', 'deltaplane', 'montgolfière', 'vol panoramique'] } });

K.horse = kind({ bookBtn: ['Book a ride', 'Réserver une randonnée'], day: true, gtk: 'horse', ex: 'horse', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Rides from {x}.', basis: 'One rider', label: 'Your lowest price for one rider, in dollars', ph: '', lead: 'Your lowest price for one rider: your shortest trail ride or a pony ride. Lessons and longer rides go in your price list. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Each trail ride, lesson, pony ride and camp, with their prices. A photo of your price list or a link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Please book rides ahead', ages: 'Ages 8+ on trail rides; pony rides for little ones', gift: 'Gift certificates by phone', prices: '1-hour trail ride $79' },
    groups: { chips: ['Group trail rides', 'Birthday parties', 'Summer camps'], lead: 'Tap a size, then add group rides, parties or camps in your own words.', ex: 'Group rides for up to 8' },
    search: ['horseback riding', 'horseback ride', 'trail ride', 'trail rides', 'riding stable', 'stables', 'pony rides', 'riding lessons', 'horse riding'] },
  fr: { price: { page: 'Randonnées à partir de {x}.', basis: 'Un cavalier', label: 'Votre prix le plus bas pour un cavalier, en dollars', ph: '', lead: 'Votre prix le plus bas pour un cavalier : votre randonnée la plus courte ou une promenade à poney. Les cours et les longues randonnées vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque randonnée, cours, promenade à poney et camp, avec leurs prix. Une photo de votre liste de prix ou un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Réservez vos randonnées à l’avance', ages: '8 ans et plus pour les randonnées; promenades à poney pour les petits', gift: 'Certificats-cadeaux par téléphone', prices: 'Randonnée d’une heure 79 $' },
    groups: { chips: ['Randonnées de groupe', 'Fêtes d’anniversaire', 'Camps d’été'], lead: 'Touchez une taille, puis ajoutez les randonnées de groupe, les fêtes ou les camps dans vos mots.', ex: 'Randonnées de groupe jusqu’à 8 personnes' },
    search: ['équitation', 'randonnée à cheval', 'écurie', 'promenade à poney', 'cours d’équitation'] } });

K.farm = kind({ bookBtn: ['Plan your visit', 'Planifier votre visite'], day: true, gtk: 'farm', ex: 'farm', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Admission from {x}.', basis: 'Admission', label: 'Your adult admission, in dollars', ph: '', lead: 'Your adult admission or farm-tour price. U-pick by the pound, kids and family prices go in your price list. Free to visit? Tap Free entry. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Admission, u-pick prices by crop, tours, wagon rides and kids’ activities, with their prices. A photo of your price board is perfect. It’s optional.' },
    help: { walkin: 'Drop in; groups please call ahead', ages: 'All ages; kids love the animals', gift: 'Gift cards at the farm market', prices: 'U-pick cherries $4 a pound' },
    groups: { chips: ['School field trips', 'Birthday parties', 'Bus tours'], lead: 'Tap a size, then add field trips, parties or bus tours in your own words.', ex: 'School field trips May to October' },
    search: ['farm', 'u-pick', 'u pick', 'you pick', 'orchard', 'petting zoo', 'petting farm', 'farm tour', 'fruit picking', 'pumpkin patch', 'corn maze', 'lavender farm'] },
  fr: { price: { page: 'Entrée à partir de {x}.', basis: 'Entrée', label: 'Votre entrée adulte, en dollars', ph: '', lead: 'Votre entrée adulte ou le prix de la visite de la ferme. L’autocueillette à la livre et les prix pour enfants et familles vont dans votre liste de prix. L’entrée est gratuite? Touchez Entrée gratuite. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'L’entrée, les prix d’autocueillette par récolte, les visites, les tours de charrette et les activités pour enfants, avec leurs prix. Une photo de votre tableau des prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; groupes, appelez d’avance', ages: 'Tous les âges; les enfants adorent les animaux', gift: 'Cartes-cadeaux au marché de la ferme', prices: 'Cerises en autocueillette 4 $ la livre' },
    groups: { chips: ['Sorties scolaires', 'Fêtes d’anniversaire', 'Visites en autocar'], lead: 'Touchez une taille, puis ajoutez les sorties scolaires, les fêtes ou les visites en autocar dans vos mots.', ex: 'Sorties scolaires de mai à octobre' },
    search: ['ferme', 'autocueillette', 'verger', 'ferme d’animaux', 'mini-ferme', 'visite de ferme', 'champ de citrouilles', 'labyrinthe de maïs'] } });

K.nature = kind({ bookBtn: ['Buy tickets', 'Acheter des billets'], gtk: 'nature', ex: 'nature', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Adults {x}.', basis: 'Adult admission', label: 'Your regular adult admission, in dollars', ph: '', lead: 'Your regular adult admission. Kids, seniors, family and guided-tour prices go in your price list. Free or by donation? Tap it. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Admission for adults, kids, seniors and families, guided tours and memberships, with their prices. A link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Drop in; guided tours at set times', ages: 'All ages', gift: 'Memberships and gift cards at the front desk', prices: 'Kids 6 to 17: $8' },
    groups: { chips: ['School programs', 'Guided group tours', 'Private events'], lead: 'Tap a size, then add school programs, group tours or events in your own words.', ex: 'Guided tours for groups of 10 or more' },
    search: ['nature centre', 'interpretive centre', 'gardens', 'botanical garden', 'heritage site', 'cultural centre', 'desert centre', 'wildlife centre', 'canyon', 'suspension bridge'] },
  fr: { price: { page: 'Adultes {x}.', basis: 'Entrée adulte', label: 'Votre entrée adulte régulière, en dollars', ph: '', lead: 'Votre entrée adulte régulière. Les prix pour enfants, aînés, familles et visites guidées vont dans votre liste de prix. C’est gratuit ou à contribution volontaire? Touchez-le. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'L’entrée pour adultes, enfants, aînés et familles, les visites guidées et les abonnements, avec leurs prix. Un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; visites guidées à heures fixes', ages: 'Tous les âges', gift: 'Abonnements et cartes-cadeaux à l’accueil', prices: 'Enfants de 6 à 17 ans : 8 $' },
    groups: { chips: ['Programmes scolaires', 'Visites guidées de groupe', 'Événements privés'], lead: 'Touchez une taille, puis ajoutez les programmes scolaires, les visites de groupe ou les événements dans vos mots.', ex: 'Visites guidées pour les groupes de 10 personnes et plus' },
    search: ['centre d’interprétation', 'centre de la nature', 'jardins', 'jardin botanique', 'site patrimonial', 'centre culturel', 'canyon', 'pont suspendu'] } });

K.market = kind({ bookBtn: ['Visit the market', 'Visiter le marché'], gtk: 'market', ex: 'market', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'Free entry.', basis: 'Free entry', label: 'Admission, in dollars', ph: '', lead: 'Most markets are free to visit: tap Free entry. It shows on your card.' },
    prices: { noun: 'vendor list', page: 'Vendors', lead: 'Your vendors, or a link to your vendor list. It’s optional.' },
    help: { walkin: 'Free to visit; come early for the best picks', ages: 'All ages; dogs on a leash', gift: 'Market gift tokens at the info booth', prices: 'Free entry' },
    groups: { chips: ['Vendor applications', 'Community groups and buskers', 'Special market days'], lead: 'Tap one, then add vendor or busker details in your own words.', ex: 'Vendor applications open in February' },
    search: ['farmers market', 'farmers’ market', 'farmer’s market', 'market', 'crafters market', 'night market', 'public market'] },
  fr: { price: { page: 'Entrée gratuite.', basis: 'Entrée gratuite', label: 'Entrée, en dollars', ph: '', lead: 'La plupart des marchés sont gratuits : touchez Entrée gratuite. Il paraît sur votre fiche.' },
    prices: { noun: 'liste des marchands', page: 'Marchands', lead: 'Vos marchands, ou un lien vers votre liste de marchands. C’est facultatif.' },
    help: { walkin: 'Gratuit; venez tôt pour les meilleurs choix', ages: 'Tous les âges; chiens en laisse', gift: 'Jetons-cadeaux du marché au kiosque d’information', prices: 'Entrée gratuite' },
    groups: { chips: ['Demandes des marchands', 'Groupes communautaires et musiciens de rue', 'Journées spéciales du marché'], lead: 'Touchez-en une, puis ajoutez les détails dans vos mots.', ex: 'Demandes des marchands ouvertes en février' },
    search: ['marché fermier', 'marché public', 'marché des artisans', 'marché de nuit'] } });

K.skihill = kind({ bookBtn: ['Buy lift tickets', 'Acheter des billets de remontée'], day: true, gtk: 'skihill', ex: 'skihill', season: 'winter', planner: 'outdoor',
  en: { price: { page: 'Lift tickets from {x}.', basis: 'Adult day ticket', label: 'Your lowest adult day lift ticket, in dollars', ph: '', lead: 'Your lowest adult day lift ticket bought online. Kids, half-day, rentals and passes go in your price list. It shows on your card.' },
    prices: { noun: 'rates page', page: 'Lift tickets & rates', lead: 'Lift tickets, half days, kids and seniors, rentals, lessons and season passes. A link to your tickets page is perfect. It’s optional.' },
    help: { walkin: 'Buy lift tickets online to save', ages: 'All ages; kids 5 and under ski free', gift: 'Gift cards online', prices: 'Kids’ day ticket $59' },
    groups: { chips: ['Group and school ski days', 'Ski clubs and races', 'Corporate days'], lead: 'Tap a size, then add group days or clubs in your own words.', ex: 'Group rates for 20 or more' },
    search: ['ski hill', 'ski resort', 'skiing', 'snowboarding', 'lift tickets', 'nordic centre', 'cross-country skiing', 'gondola', 'tube park', 'tubing', 'snowshoeing'] },
  fr: { price: { page: 'Billets de remontée à partir de {x}.', basis: 'Billet adulte d’un jour', label: 'Votre billet de remontée adulte d’un jour le moins cher, en dollars', ph: '', lead: 'Votre billet de remontée adulte d’un jour le moins cher acheté en ligne. Les prix pour enfants, les demi-journées, la location et les abonnements vont dans votre liste de prix. Il paraît sur votre fiche.' },
    prices: { noun: 'page des tarifs', page: 'Billets et tarifs', lead: 'Les billets de remontée, les demi-journées, les enfants et les aînés, la location, les cours et les abonnements de saison. Un lien vers votre page des billets, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Achetez vos billets en ligne pour économiser', ages: 'Tous les âges; les 5 ans et moins skient gratuitement', gift: 'Cartes-cadeaux en ligne', prices: 'Billet enfant d’un jour 59 $' },
    groups: { chips: ['Journées de ski de groupe et scolaires', 'Clubs de ski et courses', 'Journées d’entreprise'], lead: 'Touchez une taille, puis ajoutez les journées de groupe ou les clubs dans vos mots.', ex: 'Tarifs de groupe pour 20 personnes et plus' },
    search: ['station de ski', 'centre de ski', 'ski alpin', 'planche à neige', 'billets de remontée', 'ski de fond', 'télécabine', 'glissade sur tube', 'raquette'] } });

K.outdoorother = kind({ bookBtn: ['Book online', 'Réserver en ligne'], day: true, gtk: 'outdoorgen', ex: 'outdoorgen', season: 'summer', planner: 'outdoor',
  en: { price: { page: 'From {x}.', basis: 'Per person', label: 'Your lowest price for one person, in dollars', ph: '', lead: 'Your lowest price for one person. Free? Tap Free entry. It shows on your card.' },
    prices: { noun: 'price list', page: PRICES_PAGE[0], lead: 'Every pass, rental, ticket or program and what it costs. A photo of your price list or a link to your prices page is perfect. It’s optional.' },
    help: { walkin: 'Walk-ins welcome; book ahead on summer weekends', ages: 'All ages; kids under 12 with an adult', gift: 'Gift cards online', prices: 'Kids under 12: $10' },
    groups: { chips: ['Birthday parties', 'School and camp groups', 'Private bookings on request'], lead: 'Tap a size, then add birthday parties, school groups or private bookings in your own words.', ex: 'Birthday parties for up to 20' },
    search: ['outdoor activities', 'things to do outside', 'outdoor fun'] },
  fr: { price: { page: 'À partir de {x}.', basis: 'Par personne', label: 'Votre prix le plus bas pour une personne, en dollars', ph: '', lead: 'Votre prix le plus bas pour une personne. C’est gratuit? Touchez Entrée gratuite. Il paraît sur votre fiche.' },
    prices: { noun: 'liste de prix', page: PRICES_PAGE[1], lead: 'Chaque laissez-passer, location, billet ou programme et son prix. Une photo de votre liste de prix ou un lien vers votre page de prix, c’est parfait. C’est facultatif.' },
    help: { walkin: 'Sans réservation; réservez les fins de semaine d’été', ages: 'Tous les âges; moins de 12 ans avec un adulte', gift: 'Cartes-cadeaux en ligne', prices: 'Enfants de moins de 12 ans : 10 $' },
    groups: { chips: ['Fêtes d’anniversaire', 'Groupes scolaires et de camp', 'Réservations privées sur demande'], lead: 'Touchez une taille, puis ajoutez les fêtes, les groupes scolaires ou les réservations privées dans vos mots.', ex: 'Fêtes d’anniversaire jusqu’à 20 personnes' },
    search: ['activités de plein air', 'plein air'] } });

const PRICE_PH = {
  camp: ['Like 45 (one site, one night)', 'Par exemple 45 (un emplacement, une nuit)'], waterrent: ['Like 30 (one hour)', 'Par exemple 30 (une heure)'],
  waterpark: ['Like 25 (one pass)', 'Par exemple 25 (un laissez-passer)'], adventurepark: ['Like 39', 'Par exemple 39'], airsport: ['Like 299', 'Par exemple 299'],
  horse: ['Like 79 (your shortest ride)', 'Par exemple 79 (votre randonnée la plus courte)'], farm: ['Like 12, or tap Free entry', 'Par exemple 12, ou touchez Entrée gratuite'],
  nature: ['Like 15, or tap Free entry', 'Par exemple 15, ou touchez Entrée gratuite'], market: ['Tap Free entry', 'Touchez Entrée gratuite'],
  skihill: ['Like 89', 'Par exemple 89'], outdoorother: ['Like 25', 'Par exemple 25'],
};
const TYPER = {
  camp: ['Tent site, one night', 'Sites', 'Emplacement de tente, une nuit', 'Emplacements'], waterrent: ['Paddleboard, one hour', 'Rentals', 'Planche à pagaie, une heure', 'Location'],
  waterpark: ['One-hour pass', 'Passes', 'Laissez-passer d’une heure', 'Laissez-passer'], adventurepark: ['Full course, adult', 'Courses', 'Parcours complet, adulte', 'Parcours'],
  airsport: ['Tandem jump', 'Jumps and flights', 'Saut en tandem', 'Sauts et vols'], horse: ['1-hour trail ride', 'Rides', 'Randonnée d’une heure', 'Randonnées'],
  farm: ['Adult admission', 'Admission', 'Entrée adulte', 'Entrée'], nature: ['Adult admission', 'Admission', 'Entrée adulte', 'Entrée'],
  market: ['Free entry', 'Market', 'Entrée gratuite', 'Marché'], skihill: ['Adult day ticket', 'Lift tickets', 'Billet adulte d’un jour', 'Billets de remontée'],
  outdoorother: ['One person', 'Prices', 'Une personne', 'Tarifs'],
};
const TYPER_TRUE = {
  camp: { name: ['Campsite, one night', 'Emplacement, une nuit'], own: [[/\brv\b|full hook/i, 'RV site, one night', 'Emplacement de VR, une nuit'], [/\btent\b/i, 'Tent site, one night', 'Emplacement de tente, une nuit']] },
  waterrent: { name: ['One hour', 'Une heure'] }, waterpark: { name: ['One pass', 'Un laissez-passer'] }, adventurepark: { name: ['One person', 'Une personne'] },
  airsport: { name: ['One person', 'Une personne'], own: [[/\btandem\b/i, 'Tandem jump', 'Saut en tandem']] }, horse: { name: ['One rider', 'Un cavalier'] },
  farm: { name: ['Adult admission', 'Entrée adulte'] }, nature: { name: ['Adult admission', 'Entrée adulte'] }, market: { name: ['Free entry', 'Entrée gratuite'] },
  skihill: { name: ['Adult day ticket', 'Billet adulte d’un jour'] }, outdoorother: { name: ['One person', 'Une personne'] },
};
const TYPE_SUB = {
  camp: ['Each site type or rate', 'Chaque type d’emplacement ou tarif'], waterrent: ['Each boat, board or rate', 'Chaque bateau, planche ou tarif'], waterpark: ['Each pass', 'Chaque laissez-passer'],
  adventurepark: ['Each course or combo', 'Chaque parcours ou forfait'], airsport: ['Each jump, flight or package', 'Chaque saut, vol ou forfait'], horse: ['Each ride or lesson', 'Chaque randonnée ou cours'],
  farm: ['Each admission, tour or u-pick price', 'Chaque entrée, visite ou prix d’autocueillette'], nature: ['Each admission or tour', 'Chaque entrée ou visite'], market: ['Each vendor', 'Chaque marchand'],
  skihill: ['Each ticket or pass', 'Chaque billet ou abonnement'], outdoorother: ['Each pass or program', 'Chaque laissez-passer ou programme'],
};
const BUSY_THEME = {
  camp: ['Summer weekends book up in January', 'Live music by the lake Saturdays in July', 'every Saturday in July', 'Les fins de semaine d’été se réservent dès janvier', 'Musique au bord du lac le samedi en juillet', 'chaque samedi de juillet'],
  waterrent: ['Afternoons and long weekends are busiest', 'Sunset paddles Thursdays at 7', 'every Thursday', 'Les après-midi et les longues fins de semaine sont les plus achalandés', 'Sorties au coucher du soleil le jeudi à 19 h', 'chaque jeudi'],
  waterpark: ['Weekend afternoons sell out: book online', 'Adults-only evenings Fridays', 'every Friday', 'Les après-midi de fin de semaine affichent complet : réservez en ligne', 'Soirées pour adultes le vendredi', 'chaque vendredi'],
  adventurepark: ['Summer weekends book up: book online', 'Glow-in-the-dark nights Fridays in August', 'every Friday in August', 'Les fins de semaine d’été sont complètes : réservez en ligne', 'Soirées phosphorescentes le vendredi en août', 'chaque vendredi d’août'],
  airsport: ['Mornings have the calmest winds', 'Sunrise flights on weekends', 'every weekend', 'Les matins ont les vents les plus calmes', 'Vols au lever du soleil la fin de semaine', 'chaque fin de semaine'],
  horse: ['Book summer rides a week ahead', 'Sunset rides Fridays', 'every Friday', 'Réservez les randonnées d’été une semaine d’avance', 'Randonnées au coucher du soleil le vendredi', 'chaque vendredi'],
  farm: ['Cherry season weekends are busiest', 'Pumpkin patch weekends in October', 'every October weekend', 'Les fins de semaine de la saison des cerises sont les plus achalandées', 'Le champ de citrouilles les fins de semaine d’octobre', 'chaque fin de semaine d’octobre'],
  nature: ['Busiest on summer afternoons', 'Guided walks Saturdays at 10', 'every Saturday', 'Plus achalandé les après-midi d’été', 'Promenades guidées le samedi à 10 h', 'chaque samedi'],
  market: ['Come early: the best picks go by 10', 'Live music most Saturdays', 'every Saturday', 'Venez tôt : les meilleurs produits partent avant 10 h', 'Musique la plupart des samedis', 'chaque samedi'],
  skihill: ['Holidays and powder days are busiest', 'Night skiing Fridays and Saturdays', 'every Friday and Saturday', 'Les congés et les jours de poudreuse sont les plus achalandés', 'Ski de soirée le vendredi et le samedi', 'chaque vendredi et samedi'],
  outdoorother: ['Busiest on summer weekends', 'Family day Sundays 10–2', 'every Sunday', 'Plus achalandé les fins de semaine d’été', 'Journée familiale le dimanche de 10 h à 14 h', 'chaque dimanche'],
};
const EX_PRICE = { camp: 45, waterrent: 30, waterpark: 25, adventurepark: 39, airsport: 299, horse: 79, farm: 12, nature: 15, market: 0, skihill: 89, outdoorother: 25 };
const EXACT = { nature: ['Adult admission', 'Entrée adulte'], farm: ['Adult admission', 'Entrée adulte'] };
const PREFILL = {
  camp: /\b(?:per night|a night|nightly|\/ ?night|sites?|campsites?|tent|rv)\b|\bla nuit\b/i,
  waterrent: /\b(?:per hour|an hour|hourly|\/ ?h(?:ou)?r|rentals?|paddleboards?|sup|kayaks?)\b|\bl.heure\b/i,
  waterpark: /\b(?:passes?|admission|sessions?|one hour|1 hour)\b/i,
  adventurepark: /\b(?:courses?|zip ?lines?|admission|adults?|per person)\b/i,
  airsport: /\b(?:tandem|jumps?|flights?|per person)\b/i,
  horse: /\b(?:trail rides?|rides?|per rider|lessons?)\b/i,
  farm: /\b(?:admission|adults?|entry|per person)\b/i,
  nature: /\b(?:admission|adults?|entry)\b/i,
  market: /\b(?:admission|entry)\b/i,
  skihill: /\b(?:lift tickets?|day tickets?|adult day|lift)\b/i,
  outdoorother: /\b(?:admission|per person|entry|tickets?|day pass|adults?)\b/i,
};
const SLOT = { camp: null, waterrent: 120, waterpark: 120, adventurepark: 150, airsport: 180, horse: 120, farm: 90, nature: 90, market: 75, skihill: 360, outdoorother: null };
const EVENTS = {
  camp: ['Lakeside music, movie nights, holiday weekends', 'Musique au bord du lac, soirées cinéma, longues fins de semaine'],
  waterrent: ['Sunset paddles, races, demo days', 'Sorties au coucher du soleil, courses, journées d’essai'],
  waterpark: ['Theme nights, adults-only evenings', 'Soirées à thème, soirées pour adultes'],
  adventurepark: ['Night courses, kids’ days, special events', 'Parcours de nuit, journées pour enfants, événements spéciaux'],
  airsport: ['Fly-ins, festivals, open days', 'Rassemblements, festivals, portes ouvertes'],
  horse: ['Sunset rides, camps, open houses', 'Randonnées au coucher du soleil, camps, portes ouvertes'],
  farm: ['Harvest days, pumpkin patch, festivals', 'Journées de récolte, champ de citrouilles, festivals'],
  nature: ['Guided walks, talks, family days', 'Promenades guidées, conférences, journées familiales'],
  market: ['Special market days, holiday markets', 'Journées spéciales, marchés des Fêtes'],
  skihill: ['Races, theme days, night skiing, festivals', 'Courses, journées thématiques, ski de soirée, festivals'],
  outdoorother: ['Special events, open houses', 'Événements spéciaux, portes ouvertes'],
};
const BOOK_AHEAD_UNIT = { camp: ['site', 'emplacement'], horse: ['ride', 'randonnée'], airsport: ['flight', 'vol'] };
// The order the setup shows them (2026-11-23 count of the ~95 Okanagan and ~25 Whistler outdoor businesses: 28
// campgrounds and lake lodges, 14 water rentals, 10 ski hills, 8 nature centres, 6 adventure parks, 5 water parks, 4 air
// sports, 4 stables, 4 farms, 3 markets).
const OUTDOOR_KIND_ORDER = ['camp', 'waterrent', 'skihill', 'nature', 'adventurepark', 'waterpark', 'airsport', 'horse', 'farm', 'market', 'outdoorother'];
const OUTDOOR_KIND_LABELS_OWNER = {
  camp: ['Campground, RV park or lake lodge', 'Camping, parc de VR ou pavillon au lac'], waterrent: ['Boat, paddle or water-toy rentals', 'Location de bateaux, de planches ou de jouets nautiques'],
  skihill: ['Ski hill, gondola or Nordic centre', 'Station de ski, télécabine ou centre de ski de fond'], nature: ['Nature centre, gardens or heritage site', 'Centre de la nature, jardins ou site patrimonial'],
  adventurepark: ['Zipline or adventure park', 'Tyrolienne ou parc d’aventure'], waterpark: ['Water park', 'Parc aquatique'],
  airsport: ['Skydiving, paragliding or ballooning', 'Parachutisme, parapente ou montgolfière'], horse: ['Horseback riding', 'Équitation'],
  farm: ['Farm, u-pick or petting farm', 'Ferme, autocueillette ou mini-ferme'], market: ['Farmers’ market', 'Marché fermier'], outdoorother: ['Something else', 'Autre chose'],
};
const OUTDOOR_KIND_WORDS = {
  camp: ['Campground', 'Camping'], waterrent: ['Water rentals', 'Location nautique'], skihill: ['Ski hill', 'Station de ski'], nature: ['Nature centre & gardens', 'Centre de la nature et jardins'],
  adventurepark: ['Zipline & adventure park', 'Tyrolienne et parc d’aventure'], waterpark: ['Water park', 'Parc aquatique'], airsport: ['Air adventures', 'Aventures aériennes'],
  horse: ['Horseback riding', 'Équitation'], farm: ['Farm & u-pick', 'Ferme et autocueillette'], market: ['Farmers’ market', 'Marché fermier'],
};
const LABEL_PARTS = {
  camp: { parts: [[/\b(?:campground|camping|campsites?|camp)\b/i, 'Campground', 'Camping'], [/\brv\b/i, 'RV park', 'Parc de VR'], [/\blodge|resort\b/i, 'Lake lodge', 'Pavillon au lac']],
    both: ['Campground & RV park', 'Camping et parc de VR'], none: ['Campground', 'Camping'] },
  airsport: { parts: [[/\bsky ?div\w*|tandem\b/i, 'Skydiving', 'Parachutisme'], [/\bparagli\w*|hang gli\w*/i, 'Paragliding', 'Parapente'], [/\bballoon\w*/i, 'Hot-air ballooning', 'Montgolfière']],
    both: ['Air adventures', 'Aventures aériennes'], none: ['Air adventures', 'Aventures aériennes'] },
};
// The setup's four answers only (portal-completeness.js INDOOR_LENGTHS): a campground or a ski hill is half a day or more.
const OUTDOOR_KIND_LENGTH = { camp: 'half', waterrent: '1-2h', waterpark: '1-2h', adventurepark: '2-3h', airsport: 'half', horse: '1-2h', farm: '1-2h', nature: '1-2h', market: '1h', skihill: 'half' };
const OUTDOOR_KIND_BOOK = { camp: 'busy', waterrent: 'busy', waterpark: 'busy', adventurepark: 'busy', airsport: 'ahead', horse: 'ahead', farm: 'no', nature: 'no', market: 'no', skihill: 'no' };
const OUTDOOR_ALL_AGES_KINDS = ['camp', 'farm', 'nature', 'market', 'skihill'];
const OUTDOOR_UNTAPPED_AGE_OK_KINDS = ['camp', 'farm', 'nature', 'market'];
const OUTDOOR_KIND_HINTS = [['market', /farmers[’']? market|farmer[’']?s market|crafters[’']? market|public market|night market/], ['camp', /campground|camping|\bcamp\b|rv park|rv resort|\brv\b|lodge|glamping/], ['waterpark', /water ?park|wibit|splash ?(?:bc|down)|waterslide/],
  ['waterrent', /boat rental|paddle|\bsup\b|kayak|canoe|sea-?doo|jet ?ski|wake|parasail|marina|surf|water sports|rentals?/], ['adventurepark', /zip ?line|zipzone|adventure park|ropes|treetop|obstacle|warriors/],
  ['airsport', /sky ?dive|skydiv|paraglid|flight park|flight school|balloon/], ['horse', /stables?|riding|horse|ranch/], ['farm', /\bfarms?\b|orchards?|u-?pick|kangaroo|petting/],
  ['nature', /nature cent|interpretive|gardens?|desert cent|cultural cent|heritage|mission|wildlife|canyon/],
  ['skihill', /ski resort|mountain resort|ski hill|nordic|blackcomb|silverstar|big white|apex|baldy|gondola|olympic park|callaghan/]];
const own = (en, fr) => [`${en} (the owner’s own answer).`, `${fr} (réponse de l’établissement).`];
const BOOK_WORDS = {
  camp: { chips: { no: ['Yes, first come, first served', 'Oui, premier arrivé, premier servi'], busy: ['Walk-ins when a site is free; book summer weekends', 'Sans réservation si un emplacement est libre; réservez les fins de semaine d’été'], ahead: ['No, please book a site', 'Non, réservez un emplacement'] },
    lines: { no: ['First come, first served: no need to book.', 'Premier arrivé, premier servi : pas besoin de réserver.'], busy: ['Walk-ins when a site is free. Book ahead for summer weekends and long weekends.', 'Sans réservation si un emplacement est libre. Réservez pour les fins de semaine d’été et les longues fins de semaine.'], ahead: ['Please book a site ahead.', 'Réservez un emplacement à l’avance.'] },
    notes: { busy: own('Walk-ins when a site is free; book summer weekends ahead', 'Sans réservation si un emplacement est libre; réservez les fins de semaine d’été'), ahead: own('Book a site ahead', 'Réservez un emplacement à l’avance') } },
  waterrent: { chips: { no: ['Yes, walk-ups welcome', 'Oui, sans réservation'], busy: ['Walk-ups when there’s gear; book boats and busy days', 'Sans réservation s’il reste de l’équipement; réservez les bateaux et les jours achalandés'], ahead: ['No, please book ahead', 'Non, réservez à l’avance'] },
    lines: { no: ['Walk-ups welcome: no need to book.', 'Sans réservation : pas besoin de réserver.'], busy: ['Walk-ups when there’s gear. Book boats and busy summer days ahead.', 'Sans réservation s’il reste de l’équipement. Réservez les bateaux et les jours achalandés d’été.'], ahead: ['Please book your rental ahead.', 'Réservez votre location à l’avance.'] },
    notes: { busy: own('Walk-ups when there’s gear; book boats and busy days ahead', 'Sans réservation s’il reste de l’équipement; réservez les bateaux et les jours achalandés'), ahead: own('Book your rental ahead', 'Réservez votre location à l’avance') } },
  skihill: { chips: { no: ['Yes, buy tickets on the day', 'Oui, billets le jour même'] }, lines: { no: ['Lift tickets on the day, or online to save.', 'Billets de remontée le jour même, ou en ligne pour économiser.'] } },
  market: { chips: { no: ['Yes, free to visit', 'Oui, entrée libre'] }, lines: { no: ['Free to visit: no need to book.', 'Entrée libre : pas besoin de réserver.'] } },
  farm: { lines: { no: ['Drop in: no need to book. Groups please call ahead.', 'Sans réservation. Les groupes, appelez d’avance.'] } },
  nature: { lines: { no: ['Drop in during opening hours: no need to book.', 'Sans réservation pendant les heures d’ouverture.'] } },
};
const SHUT = (en, fr) => [`Closed a week or two each year, like for ${en}? Add it under Closures and holidays.`, `Fermé une semaine ou deux chaque année, comme pour ${fr}? Ajoutez-le dans Fermetures et jours fériés.`];
const MORE = (en, fr) => [`Your other prices (${en}) go in “Your prices”, the first of the extra details.`, `Vos autres prix (${fr}) vont dans « Vos tarifs », le premier des détails facultatifs.`];
const PHOTOS = (en, fr) => [`${en} Three photos is perfect.`, `${fr} Trois photos, c’est parfait.`];
const LINK = (unitEn, unitFr) => ({ bookLinkLabel: ['Booking link', 'Lien de réservation'], bookLinkEx: [`your ${unitEn || ''}booking page`.replace('  ', ' '), `votre page de réservation${unitFr ? ` ${unitFr}` : ''}`], tbookQ: ['Your booking link (optional)', 'Votre lien de réservation (facultatif)'] });
const KIND_SETUP_WORDS = {
  camp: { tpriceMore: MORE('RV sites with hookups, cabins, weekly and seasonal rates', 'emplacements de VR avec services, chalets, tarifs à la semaine et à la saison'), photosLead: PHOTOS('Your sites, the lake or the view, and people camping.', 'Vos emplacements, le lac ou la vue, et des gens qui campent.'),
    allYearShutHint: SHUT('spring opening work', 'les travaux d’ouverture au printemps'), ...LINK('site ', 'des emplacements') },
  waterrent: { tpriceMore: MORE('day rates, boats, deposits and fuel', 'tarifs à la journée, bateaux, dépôts et essence'), photosLead: PHOTOS('Your boats and boards, and people out on the water.', 'Vos bateaux et vos planches, et des gens sur l’eau.'), allYearShutHint: SHUT('a long weekend', 'une longue fin de semaine'), ...LINK('rental ', 'de location') },
  waterpark: { tpriceMore: MORE('day passes, kids, family and season passes', 'laissez-passer à la journée, enfants, familles et saison'), photosLead: PHOTOS('Your park on the water, and people playing.', 'Votre parc sur l’eau, et des gens qui jouent.'), allYearShutHint: SHUT('setup in spring', 'l’installation au printemps'), ...LINK('pass ', 'des laissez-passer') },
  adventurepark: { tpriceMore: MORE('kids’ courses, combos, family rates', 'parcours pour enfants, forfaits, tarifs familiaux'), photosLead: PHOTOS('Your courses and ziplines, and people climbing.', 'Vos parcours et vos tyroliennes, et des gens qui grimpent.'), allYearShutHint: SHUT('safety inspections', 'des inspections de sécurité'), ...LINK('', '') },
  airsport: { tpriceMore: MORE('video and photos, courses, gift flights', 'vidéo et photos, cours, vols-cadeaux'), photosLead: PHOTOS('Your flights, and the view from up there.', 'Vos vols, et la vue d’en haut.'), allYearShutHint: SHUT('aircraft maintenance', 'l’entretien des appareils'), ...LINK('flight ', 'des vols') },
  horse: { tpriceMore: MORE('longer rides, lessons, pony rides, camps', 'randonnées plus longues, cours, promenades à poney, camps'), photosLead: PHOTOS('Your horses and trails, and people riding.', 'Vos chevaux et vos sentiers, et des gens à cheval.'), allYearShutHint: SHUT('a rest week for the horses', 'une semaine de repos pour les chevaux'), ...LINK('ride ', 'des randonnées') },
  farm: { tpriceMore: MORE('u-pick by crop, kids, tours, wagon rides', 'autocueillette par récolte, enfants, visites, tours de charrette'), photosLead: PHOTOS('Your fields or orchard, the animals, and people picking.', 'Vos champs ou votre verger, les animaux, et des gens qui cueillent.'), allYearShutHint: SHUT('between harvests', 'entre les récoltes'), ...LINK('', '') },
  nature: { tpriceMore: MORE('kids, seniors, families, guided tours', 'enfants, aînés, familles, visites guidées'), photosLead: PHOTOS('Your trails, gardens or exhibits, and people visiting.', 'Vos sentiers, vos jardins ou vos expositions, et des gens qui visitent.'), allYearShutHint: SHUT('maintenance', 'l’entretien'), ...LINK('ticket ', 'des billets') },
  market: { tpriceMore: MORE('vendor fees', 'frais des marchands'), photosLead: PHOTOS('Your stalls and vendors, and people shopping.', 'Vos kiosques et vos marchands, et des gens qui magasinent.'), allYearShutHint: SHUT('a holiday', 'un congé'), ...LINK('', '') },
  skihill: { tpriceMore: MORE('kids, half days, rentals, lessons, season passes', 'enfants, demi-journées, location, cours, abonnements de saison'), photosLead: PHOTOS('Your runs and lifts, and people skiing.', 'Vos pistes et vos remontées, et des gens qui skient.'), allYearShutHint: SHUT('a mid-season break', 'une pause en milieu de saison'), ...LINK('ticket ', 'des billets') },
  outdoorother: { tpriceMore: MORE('kids, passes, rentals, programs', 'enfants, laissez-passer, location, programmes'), photosLead: PHOTOS('Your place, and people having fun.', 'Votre endroit, et des gens qui s’amusent.'), allYearShutHint: SHUT('maintenance', 'l’entretien'), ...LINK('', '') },
};
// Outdoor kinds are all played outdoors: the dog tile says "Dogs welcome", never "inside".
const OUTDOOR_TYPE_KINDS = OUTDOOR_KIND_ORDER.slice();

module.exports = { K, PRICE_PH, TYPER, TYPER_TRUE, TYPE_SUB, BUSY_THEME, EX_PRICE, EXACT, PREFILL, SLOT, EVENTS, BOOK_AHEAD_UNIT, LABEL_PARTS, BOOK_WORDS, KIND_SETUP_WORDS,
  OUTDOOR_KIND_ORDER, OUTDOOR_TYPE_KINDS, OUTDOOR_KIND_LABELS_OWNER, OUTDOOR_KIND_WORDS, OUTDOOR_KIND_LENGTH, OUTDOOR_KIND_BOOK, OUTDOOR_ALL_AGES_KINDS, OUTDOOR_UNTAPPED_AGE_OK_KINDS, OUTDOOR_KIND_HINTS };
void gen;
