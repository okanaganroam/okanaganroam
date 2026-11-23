'use strict';
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Outdoor Help (2026-11-23; outdoor test 1: a campground owner typed 31 questions and Help answered 7 well, the rest in
// golf, sport, indoor or food words: "a room, game or show length", "Members only before 10 AM", the food-menu import,
// "Lessons and camps: book 48 hours ahead", and a closures answer that would have closed the whole park for its beach
// sites). Outdoor businesses (campgrounds, rentals, ski hills, farms, markets…) run on the sport setup engine, so their
// Help was the sport set. This file is their own Help, in sport-help.js's shape:
//   X[kind]    each outdoor kind's own words and examples (its office, its unit, its lines), '_' for the rest;
//   WORDS      the sport answers' example words (sport-help.js WORDS) in each outdoor kind's words, merged there, so the
//              shared answers (booking, refunds, what to bring, packages…) never say lessons, camps or a café;
//   TOPICS     the answers outdoor owners need and no answer covered (office vs park hours, part of the place closed, the
//              office closed on a holiday, check-in, quiet hours, fires, long-stay and cabin rates, off-season deals,
//              guests-only events, a PDF price list, a second phone number, a map, site types, dogs, limits, weather,
//              waivers, deposits, a boat licence, u-pick, market vendors…);
//   FIRST      the question's intent, read first (server.js cfg.first, the matcher's best()): the first rule that
//              matches answers, before any word scoring, so a golf, sport, indoor or food answer never gets in;
//   DROP       the golf, sport, indoor and food topics an outdoor listing never sees;
//   apply()    the whole outdoor topic set for one listing (server.js ownerHelpWidgetHtml).
// The questions: tests/outdoor-help-questions.js, run by tests/outdoor-help-matrix.test.js.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OK = require('./outdoor-kinds.js');
const LESSON_KINDS_ = ['skihill', 'waterrent', 'horse', 'airsport'];
const KINDS = Object.keys(OK.K);
const NOT = (ks) => KINDS.filter((k) => !ks.includes(k));
const isOutdoorKind = (k) => KINDS.includes(k);

// X[kind][field] = [en, fr]; X._ for any kind without its own.
const X = {
  _: {
    place: ['place', 'endroit'], office: ['front desk', 'accueil'], guests: ['visitors', 'visiteurs'], unit: ['visit', 'visite'],
    hoursLine: ['Front desk 9 AM to 5 PM', 'Accueil de 9 h à 17 h'],
    part: ['The picnic area closes October 15 to May 1', 'L’aire de pique-nique est fermée du 15 octobre au 1er mai'],
    partWhat: ['one area', 'une aire'],
    holiday: ['Front desk closed Christmas Day', 'Accueil fermé le jour de Noël'],
    checkin: ['Check in at the front desk 15 minutes early', 'Présentez-vous à l’accueil 15 minutes à l’avance'],
    quiet: ['Quiet please after 8 PM', 'Silence s’il vous plaît après 20 h'],
    fires: ['No fires or smoking on the property', 'Aucun feu et interdit de fumer sur la propriété'],
    long1: ['Season pass $199', 'Laissez-passer de saison 199 $'], long2: ['Family pass, 2 adults and 2 kids $60', 'Laissez-passer familial, 2 adultes et 2 enfants 60 $'],
    card: ['your lowest price for one person', 'votre prix le plus bas pour une personne'],
    deal: ['Weekday special: 20% off before noon', 'Spécial de semaine : 20 % de rabais avant midi'],
    guestsOnly: ['a pass holders’ evening', 'une soirée pour les détenteurs de laissez-passer'],
    map: ['Site map at the front desk and on our website', 'Plan du site à l’accueil et sur notre site Web'],
    what: ['Picnic tables, washrooms and free parking', 'Tables de pique-nique, toilettes et stationnement gratuit'],
    dogs: ['Leashed dogs welcome; not in the buildings', 'Chiens en laisse bienvenus; pas dans les bâtiments'],
    limits: ['Kids under 12 with an adult', 'Moins de 12 ans avec un adulte'],
    weather: ['Closed in lightning and wildfire smoke: check our website', 'Fermé pendant les orages et la fumée de feux de forêt : voyez notre site Web'],
    waiver: ['Everyone signs a waiver online before they come', 'Tout le monde signe une décharge en ligne avant de venir'],
    deposit: ['Cancel 48 hours ahead for a full refund', 'Annulez 48 heures à l’avance pour un remboursement complet'],
    licence: ['No licence needed', 'Aucun permis requis'],
    phone2: ['After-hours: 250-555-0123', 'Après les heures : 250-555-0123'],
    bookSplit: ['Book ahead for summer weekends; walk-ins welcome the rest of the year', 'Réservez pour les fins de semaine d’été; sans réservation le reste de l’année'],
    groups: ['Groups of 10 or more: please call ahead', 'Groupes de 10 ou plus : appelez d’avance'],
    visit: ['about 2 hours', 'environ 2 heures'],
    many: ['your main thing first', 'votre activité principale d’abord'],
    seasonOf: ['crop or produce', 'récolte'],
    weekly: ['Family days on Sundays', 'Journées familiales le dimanche'], weeklyDay: ['every Sunday', 'chaque dimanche'],
    lesson: ['Beginner lesson, 1 hour $49', 'Cours pour débutants, 1 heure 49 $'],
  },
  camp: {
    weekly: ['Movie nights Saturdays in July and August', 'Soirées cinéma le samedi en juillet et août'], weeklyDay: ['every Saturday', 'chaque samedi'],
    place: ['campground', 'camping'], office: ['office', 'bureau'], guests: ['campers', 'campeurs'], unit: ['site', 'emplacement'],
    hoursLine: ['Office 8 AM to 8 PM in summer, 9 AM to 5 PM in winter', 'Bureau de 8 h à 20 h l’été, de 9 h à 17 h l’hiver'],
    part: ['Beach sites closed October 16 to April 14', 'Emplacements de plage fermés du 16 octobre au 14 avril'],
    partWhat: ['the beach sites, the pool or a loop', 'les emplacements de plage, la piscine ou une boucle'],
    holiday: ['Office closed Christmas Day; the campground stays open', 'Bureau fermé le jour de Noël; le camping reste ouvert'],
    checkin: ['Check-in 1 PM, check-out 11 AM', 'Arrivée à 13 h, départ à 11 h'],
    quiet: ['Quiet hours 10:30 PM to 8 AM', 'Heures de silence de 22 h 30 à 8 h'],
    fires: ['No wood fires: propane fire pits only', 'Aucun feu de bois : foyers au propane seulement'],
    long1: ['Monthly site, October to April $575 + hydro', 'Emplacement au mois, d’octobre à avril 575 $ + électricité'],
    long2: ['Lakefront cabin, one night $325 (5-night minimum in July and August)', 'Chalet au bord du lac, une nuit 325 $ (minimum 5 nuits en juillet et août)'],
    card: ['your lowest price for one site for one night', 'votre prix le plus bas pour un emplacement pour une nuit'],
    deal: ['Off season: 7th night free', 'Hors saison : 7e nuit gratuite'],
    guestsOnly: ['a Friday potluck for your campers', 'un souper-partage du vendredi pour vos campeurs'],
    map: ['Site map at the office and on our website', 'Plan du camping au bureau et sur notre site Web'],
    what: ['Full hookups 30/50 amp, water and sewer', 'Services complets 30/50 A, eau et égout'],
    dogs: ['Leashed dogs welcome, 2 per site; no dogs on the beach', 'Chiens en laisse bienvenus, 2 par emplacement; pas de chiens à la plage'],
    limits: ['Kids under 12 with an adult at the pool', 'Moins de 12 ans avec un adulte à la piscine'],
    weather: ['Open in any weather; fire bans follow BC Wildfire', 'Ouvert par tous les temps; les interdictions de feu suivent BC Wildfire'],
    waiver: ['Park rules signed at check-in', 'Règlements signés à l’arrivée'],
    deposit: ['First night’s deposit; 30 days’ notice to cancel for a refund', 'Dépôt de la première nuit; 30 jours d’avis pour annuler et être remboursé'],
    phone2: ['After-hours security: 250-555-0123', 'Sécurité après les heures : 250-555-0123'],
    bookSplit: ['Book ahead for July and August; walk-ins welcome October to April', 'Réservez pour juillet et août; sans réservation d’octobre à avril'],
    groups: ['Families often book sites side by side; up to 6 people per site', 'Les familles réservent souvent des emplacements côte à côte; jusqu’à 6 personnes par emplacement'],
    many: ['Campground covers RV sites, tent sites and cabins', 'Camping couvre les emplacements de VR, de tente et les chalets'],
  },
  waterrent: {
    weekly: ['Sunset paddle Wednesdays at 7 PM', 'Pagaie au coucher du soleil le mercredi à 19 h'], weeklyDay: ['every Wednesday', 'chaque mercredi'],
    lesson: ['Paddleboard lesson, 1 hour $59', 'Cours de planche à pagaie, 1 heure 59 $'],
    place: ['rental shop', 'boutique de location'], office: ['rental shop', 'boutique de location'], guests: ['renters', 'clients'], unit: ['rental', 'location'],
    hoursLine: ['Shop 9 AM to 7 PM; boats back by 7', 'Boutique de 9 h à 19 h; bateaux de retour avant 19 h'],
    part: ['Jet skis June 15 to Labour Day only', 'Motomarines du 15 juin à la fête du Travail seulement'],
    partWhat: ['the jet skis, the pontoons or one dock', 'les motomarines, les pontons ou un quai'],
    holiday: ['Dock closed Canada Day morning for the parade', 'Quai fermé le matin de la fête du Canada pour le défilé'],
    checkin: ['Check in at the dock 15 minutes before your rental', 'Présentez-vous au quai 15 minutes avant votre location'],
    quiet: ['No wake within 30 m of the beach', 'Pas de vagues à moins de 30 m de la plage'],
    fires: ['No smoking on the boats', 'Interdit de fumer sur les bateaux'],
    long1: ['Pontoon boat, full day $450', 'Ponton, journée complète 450 $'], long2: ['Paddleboard, one week $250', 'Planche à pagaie, une semaine 250 $'],
    card: ['your lowest price for one hour', 'votre prix le plus bas pour une heure'],
    deal: ['Early bird: 20% off rentals before 10 AM', 'Lève-tôt : 20 % de rabais avant 10 h'],
    guestsOnly: ['a staff paddle night', 'une soirée de pagaie pour le personnel'],
    map: ['Lake map with safe zones at the dock', 'Carte du lac avec les zones sûres au quai'],
    what: ['Paddleboards, kayaks, pontoons and jet skis', 'Planches à pagaie, kayaks, pontons et motomarines'],
    dogs: ['Dogs welcome on pontoons; not on paddleboards', 'Chiens bienvenus sur les pontons; pas sur les planches'],
    limits: ['Drivers 16+ with a boating card; kids in life jackets', 'Conducteurs de 16 ans et plus avec une carte de conducteur; enfants en gilet de sauvetage'],
    weather: ['Boats come in when the wind picks up; rain checks for the time lost', 'Les bateaux rentrent quand le vent se lève; bons de pluie pour le temps perdu'],
    waiver: ['Renters sign a waiver at the dock', 'Les clients signent une décharge au quai'],
    deposit: ['$500 damage deposit on boats; life jackets included', 'Dépôt de 500 $ sur les bateaux; gilets de sauvetage compris'],
    licence: ['Drivers need a boating card (PCOC); we sell a rental boat checklist', 'Les conducteurs ont besoin d’une carte de conducteur d’embarcation; liste de vérification à la location'],
    phone2: ['Dock: 250-555-0123', 'Quai : 250-555-0123'],
    bookSplit: ['Book boats ahead in July and August; walk-ups for boards', 'Réservez les bateaux en juillet et août; sans réservation pour les planches'],
    groups: ['Group paddles for up to 12', 'Sorties de groupe jusqu’à 12 personnes'],
    visit: ['2 to 4 hours', '2 à 4 heures'],
  },
  waterpark: {
    place: ['water park', 'parc aquatique'], office: ['front gate', 'entrée'], guests: ['guests', 'visiteurs'], unit: ['pass', 'laissez-passer'],
    part: ['The big slide opens July 1', 'La grande glissade ouvre le 1er juillet'], partWhat: ['one slide or the kids’ area', 'une glissade ou l’aire des enfants'],
    checkin: ['Check in at the front gate 15 minutes before your session', 'Présentez-vous à l’entrée 15 minutes avant votre séance'],
    long1: ['Season pass $199', 'Laissez-passer de saison 199 $'], long2: ['Day pass $55', 'Laissez-passer d’un jour 55 $'], card: ['your lowest pass for one person', 'votre laissez-passer le moins cher pour une personne'],
    limits: ['Ages 6+; swim test for kids under 12; life jackets for everyone', '6 ans et plus; test de nage avant 12 ans; gilet de sauvetage pour tous'],
    weather: ['Closed in lightning; sessions lost to weather get a rain check', 'Fermé pendant les orages; bons de pluie pour les séances perdues'],
    map: ['Park map at the front gate', 'Plan du parc à l’entrée'], what: ['Slides, a kids’ splash zone and shaded seating', 'Glissades, jeux d’eau pour enfants et places à l’ombre'],
    dogs: ['No dogs in the park; service dogs welcome', 'Pas de chiens dans le parc; chiens d’assistance bienvenus'], visit: ['2 to 3 hours', '2 à 3 heures'],
  },
  adventurepark: {
    place: ['adventure park', 'parc d’aventure'], office: ['check-in desk', 'comptoir d’accueil'], guests: ['climbers', 'grimpeurs'], unit: ['course', 'parcours'],
    part: ['The night course runs July and August only', 'Le parcours de nuit seulement en juillet et août'], partWhat: ['one course, the zipline or the kids’ course', 'un parcours, la tyrolienne ou le parcours enfants'],
    checkin: ['Check in 20 minutes before your time for the safety briefing', 'Présentez-vous 20 minutes avant pour la séance de sécurité'],
    long1: ['Season pass $199', 'Laissez-passer de saison 199 $'], long2: ['Zip and climb combo $89', 'Forfait tyrolienne et parcours 89 $'], card: ['your lowest price for one person', 'votre prix le plus bas pour une personne'],
    limits: ['Ages 7+; kids’ course from 4; minimum height 1.4 m on the full course; max 275 lb', '7 ans et plus; parcours enfants dès 4 ans; taille minimale 1,4 m sur le parcours complet; max 125 kg'],
    weather: ['Closed in lightning and high wind; rebook for free', 'Fermé pendant les orages et les grands vents; nouvelle réservation gratuite'],
    waiver: ['Everyone signs a waiver online before they come (a parent for kids)', 'Tout le monde signe une décharge en ligne avant de venir (un parent pour les enfants)'],
    deposit: ['Rebook up to 24 hours ahead; no refunds after that', 'Changez votre réservation jusqu’à 24 heures avant; aucun remboursement après'],
    map: ['Course map at the check-in desk', 'Plan des parcours au comptoir d’accueil'], what: ['5 courses, 2 ziplines and a kids’ course', '5 parcours, 2 tyroliennes et un parcours pour enfants'],
    dogs: ['No dogs on the courses', 'Pas de chiens sur les parcours'], visit: ['2 to 3 hours', '2 à 3 heures'],
    deal: ['Twilight climb: 25% off after 5 PM', 'Parcours au crépuscule : 25 % de rabais après 17 h'],
  },
  airsport: {
    lesson: ['Learn to skydive course $3,200', 'Formation d’initiation au parachutisme 3 200 $'],
    place: ['jump centre', 'centre de saut'], office: ['check-in', 'accueil'], guests: ['jumpers', 'sauteurs'], unit: ['flight', 'vol'],
    checkin: ['Check in at the hangar 30 minutes early', 'Présentez-vous au hangar 30 minutes à l’avance'],
    long1: ['Tandem jump with video $468', 'Saut en tandem avec vidéo 468 $'], long2: ['Learn to skydive course $3,200', 'Formation d’initiation au parachutisme 3 200 $'],
    limits: ['Ages 16+ (parent signs under 19); max 230 lb', '16 ans et plus (un parent signe avant 19 ans); max 105 kg'],
    weather: ['Flights depend on the weather: we call the day before if we reschedule', 'Les vols dépendent de la météo : nous appelons la veille s’il faut reporter'],
    waiver: ['Everyone signs a waiver on the day', 'Tout le monde signe une décharge le jour même'],
    deposit: ['$100 deposit; weather days rebooked for free', 'Dépôt de 100 $; les jours de mauvais temps sont reportés gratuitement'],
    licence: ['Licensed jumpers bring their logbook', 'Les sauteurs brevetés apportent leur carnet'],
    what: ['Tandem jumps, a learn-to-skydive course and a viewing area', 'Sauts en tandem, formation d’initiation et aire d’observation'], visit: ['about half a day', 'environ une demi-journée'],
  },
  horse: {
    lesson: ['Riding lesson, 1 hour $75', 'Cours d’équitation, 1 heure 75 $'],
    place: ['stable', 'écurie'], office: ['barn', 'écurie'], guests: ['riders', 'cavaliers'], unit: ['ride', 'randonnée'],
    checkin: ['Check in at the barn 15 minutes before your ride', 'Présentez-vous à l’écurie 15 minutes avant votre randonnée'],
    part: ['The mountain trail ride runs June to September', 'La randonnée en montagne de juin à septembre'], partWhat: ['one trail or the pony rides', 'un sentier ou les promenades à poney'],
    long1: ['2-hour trail ride $129', 'Randonnée de 2 heures 129 $'], long2: ['Pony ride, 15 minutes $25', 'Promenade à poney, 15 minutes 25 $'], card: ['your lowest price for one rider', 'votre prix le plus bas pour un cavalier'],
    limits: ['Ages 8+ on trail rides; max 240 lb; long pants and closed shoes', '8 ans et plus pour les randonnées; max 110 kg; pantalon long et souliers fermés'],
    weather: ['Rides cancelled in lightning or extreme heat; we call you', 'Randonnées annulées pendant les orages ou les grandes chaleurs; nous vous appelons'],
    waiver: ['Riders sign a waiver at the barn', 'Les cavaliers signent une décharge à l’écurie'],
    dogs: ['Please leave dogs at home: they spook the horses', 'Laissez vos chiens à la maison : ils effraient les chevaux'],
    what: ['Trail rides, pony rides and a riding arena', 'Randonnées, promenades à poney et un manège'], visit: ['1 to 2 hours', '1 à 2 heures'],
  },
  farm: {
    weekly: ['Hayrides on weekends in October', 'Balades en charrette les fins de semaine d’octobre'], weeklyDay: ['every Saturday and Sunday', 'chaque samedi et dimanche'],
    place: ['farm', 'ferme'], office: ['farm stand', 'kiosque de la ferme'], guests: ['visitors', 'visiteurs'], unit: ['visit', 'visite'],
    hoursLine: ['Farm stand 9 AM to 5 PM; u-pick fields close at 4', 'Kiosque de 9 h à 17 h; champs d’autocueillette fermés à 16 h'],
    part: ['Corn maze open September and October only', 'Labyrinthe de maïs ouvert en septembre et octobre seulement'], partWhat: ['the corn maze, the u-pick fields or the petting farm', 'le labyrinthe de maïs, les champs d’autocueillette ou la mini-ferme'],
    holiday: ['Farm stand closed Thanksgiving Monday', 'Kiosque fermé le lundi de l’Action de grâce'],
    checkin: ['Pay and get your baskets at the farm stand', 'Payez et prenez vos paniers au kiosque de la ferme'],
    long1: ['U-pick cherries $4 a pound', 'Cerises en autocueillette 4 $ la livre'], long2: ['Family pass for the corn maze $40', 'Laissez-passer familial pour le labyrinthe 40 $'], card: ['your adult admission', 'votre prix d’entrée adulte'],
    deal: ['Last week of the season: u-pick half price', 'Dernière semaine de la saison : autocueillette à moitié prix'],
    map: ['Field map at the farm stand: which crop is in which field', 'Plan des champs au kiosque : quelle récolte dans quel champ'],
    what: ['U-pick, a farm market, a petting farm and picnic tables', 'Autocueillette, marché de la ferme, mini-ferme et tables de pique-nique'],
    dogs: ['No dogs in the u-pick fields (food safety)', 'Pas de chiens dans les champs d’autocueillette (salubrité)'],
    weather: ['U-pick closed when it rains: check our Facebook before you come', 'Autocueillette fermée quand il pleut : voyez notre Facebook avant de venir'],
    upick: ['Strawberries mid-June to early July; cherries July; apples September to October', 'Fraises de la mi-juin au début juillet; cerises en juillet; pommes de septembre à octobre'],
    visit: ['1 to 2 hours', '1 à 2 heures'],
  },
  nature: {
    place: ['nature centre', 'centre de la nature'], office: ['front desk', 'accueil'], guests: ['visitors', 'visiteurs'],
    part: ['The boardwalk trail closes November to March', 'Le trottoir de bois est fermé de novembre à mars'], partWhat: ['one trail, the boardwalk or the gardens', 'un sentier, le trottoir de bois ou les jardins'],
    map: ['Trail map at the front desk and on our website', 'Carte des sentiers à l’accueil et sur notre site Web'],
    what: ['3 km of trails, a viewing tower and an interpretive centre', '3 km de sentiers, une tour d’observation et un centre d’interprétation'],
    dogs: ['No dogs on the trails (wildlife area)', 'Pas de chiens sur les sentiers (aire faunique)'], visit: ['1 to 2 hours', '1 à 2 heures'],
    long1: ['Family membership $60 a year', 'Abonnement familial 60 $ par année'], long2: ['Guided walk $12', 'Promenade guidée 12 $'], card: ['your regular adult admission', 'votre prix d’entrée adulte'],
  },
  market: {
    weekly: ['Live music every Saturday', 'Musique en direct chaque samedi'], weeklyDay: ['every Saturday', 'chaque samedi'],
    place: ['market', 'marché'], office: ['info booth', 'kiosque d’information'], guests: ['shoppers', 'visiteurs'], unit: ['market day', 'jour de marché'],
    hoursLine: ['Info booth open market days 8 AM to 1 PM', 'Kiosque d’information ouvert les jours de marché de 8 h à 13 h'],
    part: ['Indoor winter market, November to April', 'Marché d’hiver à l’intérieur, de novembre à avril'], partWhat: ['the food trucks or the craft row', 'les camions-restaurants ou l’allée des artisans'],
    holiday: ['No market on the Saturday of the long weekend', 'Pas de marché le samedi de la longue fin de semaine'],
    long1: ['Market gift tokens $5', 'Jetons-cadeaux du marché 5 $'], long2: ['Free entry', 'Entrée gratuite'], card: ['Free entry', 'Entrée gratuite'],
    map: ['Vendor map at the info booth and on our website', 'Plan des marchands au kiosque d’information et sur notre site Web'],
    what: ['About 80 vendors: farm produce, baking and crafts', 'Environ 80 marchands : produits de la ferme, pâtisseries et artisanat'],
    dogs: ['Leashed dogs welcome', 'Chiens en laisse bienvenus'],
    weather: ['Rain or shine', 'Beau temps, mauvais temps'],
    guestsOnly: ['a vendors’ potluck', 'un souper-partage des marchands'],
    vendors: ['About 80 vendors every Saturday; full list on our website', 'Environ 80 marchands chaque samedi; liste complète sur notre site Web'],
    visit: ['about an hour', 'environ une heure'],
  },
  skihill: {
    weekly: ['Night skiing Tuesdays and Fridays, 4 to 9 PM', 'Ski de soirée le mardi et le vendredi, de 16 h à 21 h'], weeklyDay: ['every Tuesday and Friday', 'chaque mardi et vendredi'],
    lesson: ['Group ski lesson, 2 hours $99', 'Cours de ski en groupe, 2 heures 99 $'],
    place: ['ski hill', 'station de ski'], office: ['ticket office', 'billetterie'], guests: ['skiers', 'skieurs'], unit: ['lift ticket', 'billet de remontée'],
    hoursLine: ['Ticket office opens at 8 AM; lifts 9 AM to 4 PM', 'Billetterie ouverte dès 8 h; remontées de 9 h à 16 h'],
    part: ['The Summit chair opens when there’s enough snow', 'Le télésiège du sommet ouvre quand il y a assez de neige'], partWhat: ['one lift, the night skiing or the tube park', 'une remontée, le ski de soirée ou le parc de glissades'],
    holiday: ['Rental shop closes at 3 PM on Christmas Eve', 'La boutique de location ferme à 15 h la veille de Noël'],
    checkin: ['Pick up your tickets at the ticket office or a kiosk', 'Prenez vos billets à la billetterie ou à une borne'],
    guestsOnly: ['a season pass holders’ party', 'une fête pour les détenteurs de passes de saison'],
    bookSplit: ['Buy tickets ahead for Christmas week; walk up midweek', 'Achetez vos billets d’avance pour la semaine de Noël; au guichet en semaine'],
    long1: ['Season pass $699', 'Passe de saison 699 $'], long2: ['Half-day ticket after 12:30 $59', 'Billet demi-journée après 12 h 30 59 $'], card: ['your lowest adult day lift ticket', 'votre billet de remontée adulte d’un jour le moins cher'],
    deal: ['Spring skiing: 25% off tickets after March 15', 'Ski de printemps : 25 % de rabais après le 15 mars'],
    map: ['Trail map at the ticket office and on our website', 'Carte des pistes à la billetterie et sur notre site Web'],
    what: ['4 lifts, 60 runs and a tube park', '4 remontées, 60 pistes et un parc de glissades'],
    dogs: ['No dogs on the slopes', 'Pas de chiens sur les pentes'],
    weather: ['Lifts close in high wind: check our snow report', 'Les remontées ferment par grands vents : voyez notre bulletin de neige'],
    limits: ['Kids 5 and under ski free with an adult', 'Les 5 ans et moins skient gratuitement avec un adulte'],
    waiver: ['Your lift ticket is your waiver: read the back', 'Votre billet de remontée est votre décharge : lisez le verso'],
    visit: ['a full day', 'une journée complète'],
  },
  outdoorother: {},
};
const x = (kind, f) => ((X[kind] || {})[f]) || X._[f] || ['', ''];

// The sport answers' example words (sport-help.js WORDS) for the outdoor kinds; '_outdoor' is every outdoor kind
// without its own. Merged into sport-help.js WORDS, read by its word().
const WORDS = {
  meet: { _outdoor: ['Check in at the front desk 15 minutes early', 'Présentez-vous à l’accueil 15 minutes à l’avance'], camp: ['Check in at the office; check-in after 1 PM', 'Présentez-vous au bureau; arrivée après 13 h'],
    waterrent: ['Meet at the dock 15 minutes before your rental', 'Rendez-vous au quai 15 minutes avant votre location'], skihill: ['Tickets at the ticket office by the main lodge', 'Billets à la billetterie près du chalet principal'],
    farm: ['Park by the farm stand and pay there', 'Stationnez près du kiosque de la ferme et payez-y'], market: ['The info booth is at the main entrance', 'Le kiosque d’information est à l’entrée principale'],
    horse: ['Meet at the barn 15 minutes before your ride', 'Rendez-vous à l’écurie 15 minutes avant votre randonnée'], airsport: ['Check in at the hangar 30 minutes early', 'Présentez-vous au hangar 30 minutes à l’avance'] },
  lang: { _outdoor: ['Staff speak English and French', 'Personnel bilingue (anglais et français)'] },
  refund: { _outdoor: [X._.deposit[0], X._.deposit[1]], camp: X.camp.deposit, waterrent: X.waterrent.deposit, adventurepark: X.adventurepark.deposit, airsport: X.airsport.deposit,
    skihill: ['Lift tickets are non-refundable; snow-day credits when lifts don’t open', 'Billets non remboursables; crédit si les remontées n’ouvrent pas'] },
  refundWx: { _outdoor: ['rain checks if we close for weather', 'bons de pluie si nous fermons à cause de la météo'], camp: ['no refunds for weather', 'pas de remboursement pour la météo'],
    skihill: ['credit if the lifts don’t open', 'crédit si les remontées n’ouvrent pas'], market: ['the market runs rain or shine', 'le marché a lieu beau temps, mauvais temps'] },
  bring: { _outdoor: ['Sun hat, water and closed-toe shoes', 'Chapeau, eau et souliers fermés'], camp: ['Bring your own firewood? No: buy it here (no outside wood)', 'Votre bois? Non : achetez-le ici (pas de bois de l’extérieur)'],
    waterrent: ['Bring a towel and sunscreen; life jackets included', 'Apportez une serviette et de la crème solaire; gilets de sauvetage compris'], skihill: ['Dress in layers; helmets recommended', 'Habillez-vous en couches; casque recommandé'],
    farm: ['Bring your own containers for u-pick, or buy ours', 'Apportez vos contenants pour l’autocueillette, ou achetez les nôtres'], market: ['Bring your own bags; most vendors take cards', 'Apportez vos sacs; la plupart des marchands acceptent les cartes'],
    horse: ['Long pants and closed shoes; helmets provided', 'Pantalon long et souliers fermés; casques fournis'], adventurepark: ['Closed-toe shoes; tie back long hair', 'Souliers fermés; attachez les cheveux longs'] },
  include: { _outdoor: ['Admission: parking included', 'Entrée : stationnement compris'], camp: ['Site: showers and Wi-Fi included', 'Emplacement : douches et Wi-Fi compris'],
    waterrent: ['Rental: life jackets and paddles included', 'Location : gilets et pagaies compris'], skihill: ['Day ticket: all lifts and the tube park', 'Billet d’un jour : toutes les remontées et le parc de glissades'],
    adventurepark: ['Full course: harness, helmet and briefing included', 'Parcours complet : harnais, casque et séance de sécurité compris'] },
  notIncluded: { _outdoor: ['Parking not included', 'Stationnement non compris'], camp: ['Firewood and hydro not included', 'Bois et électricité non compris'], waterrent: ['Fuel not included', 'Essence non comprise'], skihill: ['Rentals not included', 'Location non comprise'] },
  pkg: { _outdoor: ['Family pack: 2 adults and 2 kids $60', 'Forfait famille : 2 adultes et 2 enfants 60 $'], camp: ['Stay 7 nights, pay for 6', 'Restez 7 nuits, payez-en 6'],
    waterrent: ['Sunset pontoon package: 2 hours $199', 'Forfait ponton au coucher du soleil : 2 heures 199 $'], skihill: ['Ski and stay: ticket and a night’s lodging $189', 'Ski et hébergement : billet et une nuit 189 $'],
    adventurepark: ['Zip and climb combo $89', 'Forfait tyrolienne et parcours 89 $'] },
  both: { _outdoor: ['everything you offer', 'tout ce que vous offrez'], camp: ['the sites and the cabins', 'les emplacements et les chalets'], waterrent: ['the boats and the boards', 'les bateaux et les planches'],
    skihill: ['the lifts and the tube park', 'les remontées et le parc de glissades'], farm: ['the u-pick and the farm market', 'l’autocueillette et le marché de la ferme'] },
  ahead: { _outdoor: ['Book a day ahead on summer weekends', 'Réservez la veille les fins de semaine d’été'], camp: ['Summer sites: book months ahead', 'Emplacements d’été : réservez des mois à l’avance'],
    waterrent: ['Boats: book a day ahead in July and August', 'Bateaux : réservez la veille en juillet et août'], airsport: ['Book a week ahead', 'Réservez une semaine à l’avance'], horse: ['Book rides a day ahead', 'Réservez vos randonnées la veille'] },
  same: { _outdoor: ['Walk-ins welcome when there’s room', 'Sans réservation s’il y a de la place'], camp: ['Walk-ins welcome when a site is free', 'Sans réservation si un emplacement est libre'],
    waterrent: ['Walk-ups when boards are free', 'Sans réservation si une planche est libre'] },
  holiday: { _outdoor: X._.holiday, camp: X.camp.holiday, farm: X.farm.holiday, market: X.market.holiday, skihill: X.skihill.holiday },
  lineAges: { _outdoor: ['Kids (ages 6 to 12) $10', 'Enfants (6 à 12 ans) 10 $'], skihill: ['Kids’ day ticket (ages 6 to 12) $59', 'Billet enfant d’un jour (6 à 12 ans) 59 $'], adventurepark: ['Kids’ course (ages 4 to 7) $29', 'Parcours enfants (4 à 7 ans) 29 $'], horse: ['Pony ride (ages 3 to 7) $25', 'Promenade à poney (3 à 7 ans) 25 $'] },
  lesson: { _outdoor: ['Guided tour $15', 'Visite guidée 15 $'] },
  camp: { _outdoor: ['Summer day camps for ages 6 to 12', 'Camps de jour d’été pour les 6 à 12 ans'] },
  two: { _outdoor: ['Adult 15, Kids 10', 'Adulte 15, Enfants 10'], camp: ['Tent site 35, RV site 55', 'Emplacement de tente 35, Emplacement de VR 55'], waterrent: ['Kayak 25, Paddleboard 30', 'Kayak 25, Planche à pagaie 30'],
    skihill: ['Adult 89, Kids 59', 'Adulte 89, Enfants 59'], farm: ['Adult 12, Kids 8', 'Adulte 12, Enfants 8'] },
  twoSection: { _outdoor: ['Prices', 'Tarifs'], camp: ['Sites', 'Emplacements'], waterrent: ['Boards and kayaks', 'Planches et kayaks'], skihill: ['Lift tickets', 'Billets de remontée'], farm: ['U-pick', 'Autocueillette'] },
  twoFrom: { _outdoor: ['Kids from $10', 'Enfants à partir de 10 $'], camp: ['Tent sites from $35', 'Emplacements de tente à partir de 35 $'], waterrent: ['Kayaks from $25', 'Kayaks à partir de 25 $'], skihill: ['Kids from $59', 'Enfants à partir de 59 $'] },
  rentQ: { _outdoor: ['Rentals and gear', 'Location et équipement'], camp: ['Firewood, bikes and kayaks to rent', 'Bois, vélos et kayaks à louer'], waterrent: ['Boats, boards and gear', 'Bateaux, planches et équipement'], skihill: ['Ski and snowboard rentals', 'Location de skis et de planches'] },
  bookQ: { _outdoor: ['Online booking: where do people book?', 'Réservation en ligne : où réserve-t-on?'], camp: ['Site bookings: where do people book?', 'Emplacements : où réserve-t-on?'],
    waterrent: ['Rentals: where do people book?', 'Location : où réserve-t-on?'], skihill: ['Lift tickets: where do people buy them?', 'Billets de remontée : où les acheter?'] },
  ratesQ: { _outdoor: ['Kids’, family and season prices', 'Prix enfants, familles et saison'], camp: ['Weekly, monthly, seasonal and cabin rates', 'Tarifs à la semaine, au mois, à la saison et des chalets'],
    waterrent: ['Day, week and boat rates', 'Tarifs à la journée, à la semaine et des bateaux'], skihill: ['Kids’, half-day tickets and season passes', 'Billets enfants, demi-journée et passes de saison'] },
  moves: { _outdoor: ['with the weather', 'de la météo'], skihill: ['with the snow', 'de la neige'], farm: ['with the crops', 'des récoltes'], waterrent: ['with the lake and the weather', 'du lac et de la météo'], camp: ['with the snow melt and the weather', 'de la fonte des neiges et de la météo'] },
  wxQ: { _outdoor: ['Weather: closing or cancelling (rain, wind, smoke)', 'La météo : fermer ou annuler (pluie, vent, fumée)'] },
  wx1: { _outdoor: X._.weather, camp: X.camp.weather, waterrent: X.waterrent.weather, waterpark: X.waterpark.weather, adventurepark: X.adventurepark.weather, airsport: X.airsport.weather, horse: X.horse.weather, farm: X.farm.weather, market: X.market.weather, skihill: X.skihill.weather },
  wx2: { _outdoor: ['Closed for wildfire smoke', 'Fermé en cas de fumée de feux de forêt'] },
  themeQ: { _outdoor: ['family days', 'journées familiales'], camp: ['movie nights', 'soirées cinéma'], skihill: ['night skiing', 'ski de soirée'], farm: ['harvest weekends', 'fins de semaine des récoltes'], market: ['music on market day', 'musique les jours de marché'] },
  swimQ: { _outdoor: ['Our times change by day', 'Nos heures changent selon le jour'] },
  required: { _outdoor: ['Life jacket (required) included', 'Gilet de sauvetage (obligatoire) compris'], skihill: ['Helmet rental $10', 'Location de casque 10 $'], farm: ['U-pick basket $2', 'Panier d’autocueillette 2 $'] },
  pro: { _outdoor: ['Guides on request: ask at the front desk', 'Guides sur demande : demandez à l’accueil'] },
  extra: { _outdoor: ['Long-weekend extended hours, July 1, 8 AM–9 PM', 'Heures prolongées de la longue fin de semaine, 1er juillet, de 8 h à 21 h', 'daily to July 3', 'tous les jours jusqu’au 3 juillet'] },
  emptyPhoto: { _outdoor: ['your place with nobody in it', 'votre endroit sans personne'], camp: ['an empty site by the lake', 'un emplacement vide au bord du lac'], waterrent: ['your boats at the dock', 'vos bateaux au quai'], skihill: ['the empty slopes', 'les pentes vides'], farm: ['the fields or the farm stand', 'les champs ou le kiosque'] },
  bookWhat: { _outdoor: ['a time or a spot', 'une période ou une place'], camp: ['a site or a cabin', 'un emplacement ou un chalet'], waterrent: ['a boat or a board', 'un bateau ou une planche'], skihill: ['lift tickets', 'les billets de remontée'], horse: ['a ride', 'une randonnée'] },
  noRent: { _outdoor: ['No rentals here: bring your own gear', 'Pas de location sur place : apportez votre équipement'] },
  adapt: { _outdoor: ['Accessible sites and washrooms', 'Emplacements et toilettes accessibles'] },
  adaptPrice: { _outdoor: ['Accessible site $40', 'Emplacement accessible 40 $'] },
};

// The golf, sport, indoor and food topics an outdoor listing never sees (each has an outdoor answer here, or no place
// on an outdoor listing).
const DROP = new Set(['sport-members', 'sport-tee-times', 'sport-golf-details', 'sport-dress-code', 'sport-no-range', 'sport-lessons', 'sport-adaptive', 'sport-food-menu',
  'sport-restaurant', 'sport-tournaments', 'sport-member-rates', 'sport-last-booking', 'sport-second-kind', 'sport-sports-words', 'sport-app-booking', 'sport-chip-season',
  'sport-shoulder-hours', 'sport-twilight-times', 'sport-free-clubs', 'sport-minigolf-rates', 'sport-drop-in-hockey', 'sport-green-fees-word', 'sport-bay-link', 'sport-two-courses',
  'sport-aeration', 'sport-first-tee', 'sport-social-hour', 'sport-hh-none-specials', 'sport-offseason-other', 'sport-offseason-events', 'sport-sister-listing', 'sport-part-season',
  'sport-dogs', 'sport-weather', 'sport-meeting-place', 'sport-line-ages', 'sport-extra-sessions', 'sport-rentals', 'sport-no-rentals', 'sport-group-size',
  'indoor-min-players', 'indoor-bar', 'indoor-book-party', 'indoor-no-hours', 'indoor-swim-times', 'indoor-visit-length', 'indoor-camps', 'indoor-family-day', 'indoor-kinds-many',
  'indoor-price-two', 'indoor-per-room', 'indoor-exhibits', 'indoor-artists', 'indoor-openings', 'indoor-kinds-other', 'indoor-ticket-prices', 'indoor-season-list', 'indoor-theme-nights',
  'indoor-busy-times', 'indoor-summer-late', 'indoor-required-buy', 'indoor-also-offer',
  'menu-import', 'menu-blurry', 'menu-website', 'menu-change', 'specials', 'weekly-nights', 'cuisine-pick', 'happy-hour', 'hh-add', 'hh-times', 'hh-deals', 'hh-some-months', 'hh-closed-season',
  'setup-happy', 'setup-happy-split', 'social-post', 'plan-visit', 'setup-specials', 'setup-delivery', 'event-partners', 'event-picture']);

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const em = (p) => [`<em>${esc(p[0])}</em>`, `<em>${esc(p[1])}</em>`];
const GTK = ['<strong>Good to know</strong>', '<strong>Bon à savoir</strong>'];
const YP = ['<strong>Your prices</strong>', '<strong>Vos tarifs</strong>'];
const gtkLine = (p) => [`Say it in one line in ${GTK[0]}, like ${em(p)[0]}. It shows under “Plan your visit” on your page, and Build My Trip reads it.`,
  `Dites-le en une ligne dans ${GTK[1]}, comme ${em(p)[1]}. Elle paraît sous « Planifiez votre visite » sur votre page, et Planifier mon voyage la lit.`];
const P = (en, fr) => [`<p>${en}</p>`, `<p>${fr}</p>`];
const cat = (...ps) => [ps.map((p) => p[0]).join(''), ps.map((p) => p[1]).join('')];

// Outdoor topics: id, kinds (null: every outdoor kind), title [en, fr] (a function of the kind), answer (a function of the
// kind and the listing: [en, fr]), keys (the matcher's words; the intent rules in FIRST do most of the routing).
const TOPICS = [
  { id: 'outdoor-office-hours', q: (k) => (k === 'camp' ? ['Office hours, or the park’s? (we’re open 24 hours)', 'Les heures du bureau, ou celles du camping? (ouvert 24 heures)'] : [`Our ${x(k, 'office')[0]} has its own hours`, `Notre ${x(k, 'office')[1]} a ses propres heures`]),
    a: (k) => (k === 'camp'
      ? cat(P(`Your hours are when campers can be here, so tap <strong>Open 24 hours</strong> on Hours: your page says the campground is open.`, `Vos heures sont celles où les campeurs peuvent être là : touchez <strong>Ouvert 24 heures</strong> à Heures. Votre page indique que le camping est ouvert.`),
        P(`The office hours go in ${GTK[0]}, in one line, like ${em(x(k, 'hoursLine'))[0]}.`, `Les heures du bureau vont dans ${GTK[1]}, en une ligne, comme ${em(x(k, 'hoursLine'))[1]}.`))
      : cat(P(`Put the hours people can come in your hours. The ${esc(x(k, 'office')[0])}’s own hours go in ${GTK[0]}, in one line, like ${em(x(k, 'hoursLine'))[0]}.`, `Mettez dans vos heures celles où l’on peut venir. Les heures de votre ${esc(x(k, 'office')[1])} vont dans ${GTK[1]}, en une ligne, comme ${em(x(k, 'hoursLine'))[1]}.`))),
    keys: ['office hours', 'office is open', 'front desk hours', 'open 24 hours', '24 hours', '24 7', 'office hours different', 'reception hours'], keysFr: ['heures du bureau', 'ouvert 24 heures', 'bureau ouvert', 'heures de l accueil'] },
  { id: 'outdoor-part-closed', q: (k) => [`Part of the ${x(k, 'place')[0]} closes (like ${x(k, 'partWhat')[0]})`, `Une partie du ${x(k, 'place')[1]} ferme (comme ${x(k, 'partWhat')[1]})`],
    a: (k) => cat(P(`Don’t use Closures or your season for it: those close the whole ${esc(x(k, 'place')[0])} on your page.`, `N’utilisez pas les fermetures ni votre saison : elles ferment tout le ${esc(x(k, 'place')[1])} sur votre page.`),
      P(gtkLine(x(k, 'part'))[0], gtkLine(x(k, 'part'))[1])),
    keys: ['part of the park', 'part of the place', 'rest of the park is open', 'one section closes', 'only part closes'], keysFr: ['une partie ferme', 'le reste est ouvert'] },
  { id: 'outdoor-office-holiday', q: (k) => [`The ${x(k, 'office')[0]} closes on a holiday, but we stay open`, `Le ${x(k, 'office')[1]} ferme un jour férié, mais nous restons ouverts`],
    a: (k) => cat(P(`Don’t tick that day in Closures and holidays: ticked, your page would say the whole ${esc(x(k, 'place')[0])} is closed that day.`, `Ne cochez pas ce jour dans Fermetures et jours fériés : coché, votre page dirait que tout le ${esc(x(k, 'place')[1])} est fermé ce jour-là.`),
      P(gtkLine(x(k, 'holiday'))[0], gtkLine(x(k, 'holiday'))[1])),
    keys: ['office closed christmas', 'office is closed on holidays', 'office closed on stat holidays'], keysFr: ['bureau ferme a noel'] },
  { id: 'outdoor-checkin', kinds: NOT(['market', 'nature']), q: (k) => (k === 'camp' ? ['Check-in and check-out times', 'Les heures d’arrivée et de départ'] : ['Where and when people check in', 'Où et quand se présenter']),
    a: (k) => cat(P(`There’s no box for it: ${gtkLine(x(k, 'checkin'))[0].charAt(0).toLowerCase()}${gtkLine(x(k, 'checkin'))[0].slice(1)}`, `Il n’y a pas de case pour ça : ${gtkLine(x(k, 'checkin'))[1].charAt(0).toLowerCase()}${gtkLine(x(k, 'checkin'))[1].slice(1)}`)),
    keys: ['check in', 'check out', 'checkin', 'checkout', 'check in time', 'check out time', 'late arrival'], keysFr: ['heure d arrivee', 'heure de depart', 'arrivee et depart'] },
  { id: 'outdoor-quiet-hours', kinds: ['camp'], q: () => ['Quiet hours (ours aren’t the chip’s)', 'Les heures de silence (pas celles du choix proposé)'],
    a: (k) => cat(P(`Don’t tap the chip if its times aren’t yours: type your own line in ${GTK[0]}, like ${em(x(k, 'quiet'))[0]}. Chip already ticked? Tap it again to take it off.`, `Ne touchez pas le choix proposé si ses heures ne sont pas les vôtres : écrivez votre ligne dans ${GTK[1]}, comme ${em(x(k, 'quiet'))[1]}. Déjà coché? Touchez-le de nouveau pour l’enlever.`)),
    keys: ['quiet hours', 'quiet time', 'noise rules', 'generator hours'], keysFr: ['heures de silence', 'couvre feu', 'bruit'] },
  { id: 'outdoor-fires', kinds: ['camp', 'nature', 'farm', 'horse', 'outdoorother'], q: (k) => (k === 'camp' ? ['Fires and firewood rules', 'Les feux et le bois de chauffage'] : ['Fires and smoking rules', 'Les feux et la cigarette']),
    a: (k) => cat(P(gtkLine(x(k, 'fires'))[0], gtkLine(x(k, 'fires'))[1]), k === 'camp' ? P('Don’t sell firewood? Leave the <strong>Firewood for sale</strong> chip off. A provincial fire ban is on BC Wildfire’s site; no need to change your page for it.', 'Vous ne vendez pas de bois? Laissez le choix <strong>Bois de chauffage en vente</strong> décoché. Une interdiction de feu provinciale est sur le site de BC Wildfire; pas besoin de changer votre page.') : ['', '']),
    keys: ['wood fires', 'campfires', 'fire pits', 'firewood', 'fire ban', 'no fires'], keysFr: ['feux de bois', 'feux de camp', 'bois de chauffage', 'interdiction de feu'] },
  { id: 'outdoor-long-rates', q: (k) => x(k, 'card') && WORDS.ratesQ[k] ? WORDS.ratesQ[k] : WORDS.ratesQ._outdoor,
    a: (k) => cat(P(`Your card shows ${esc(x(k, 'card')[0])} only. Every other rate is one line in ${YP[0]}, with its details, like ${em(x(k, 'long1'))[0]} or ${em(x(k, 'long2'))[0]}.`, `Votre fiche montre seulement ${esc(x(k, 'card')[1])}. Chaque autre tarif est une ligne dans ${YP[1]}, avec ses détails, comme ${em(x(k, 'long1'))[1]} ou ${em(x(k, 'long2'))[1]}.`)),
    keys: ['monthly rate', 'weekly rate', 'seasonal rate', 'cabin rate', 'season pass', 'monthly sites', 'by the month', 'day rate'], keysFr: ['tarif au mois', 'tarif a la semaine', 'prix au mois', 'tarif saisonnier', 'prix du chalet'] },
  { id: 'outdoor-deal', q: (k) => (k === 'camp' ? ['An off-season deal (like a free night or a discount)', 'Une offre hors saison (comme une nuit gratuite ou un rabais)'] : ['A deal or a discount (like early bird or end of season)', 'Une offre ou un rabais (comme lève-tôt ou fin de saison)']),
    a: (k) => cat(P(`It’s a price, not a closure: add one line in ${YP[0]}, like ${em(x(k, 'deal'))[0]}, or say it in ${GTK[0]}. Your card keeps your usual price, and your hours and season stay as they are.`, `C’est un prix, pas une fermeture : ajoutez une ligne dans ${YP[1]}, comme ${em(x(k, 'deal'))[1]}, ou dites-le dans ${GTK[1]}. Votre fiche garde votre prix habituel, et vos heures et votre saison restent telles quelles.`)),
    keys: ['night free', 'free night', 'off season deal', 'discount', 'stay and save', 'early bird'], keysFr: ['nuit gratuite', 'rabais', 'offre hors saison'] },
  { id: 'outdoor-guests-only', q: (k) => [`Events just for our ${x(k, 'guests')[0]} (not the public)`, `Des activités seulement pour nos ${x(k, 'guests')[1]} (pas le public)`],
    a: (k) => cat(P(`Not an event: What’s On is for things anyone can come to. Something only your ${esc(x(k, 'guests')[0])} join, like ${esc(x(k, 'guestsOnly')[0])}, can go in your story or ${GTK[0]} if you like, as something you offer.`, `Pas un événement : À l’affiche est pour ce qui est ouvert à tous. Ce qui est réservé à vos ${esc(x(k, 'guests')[1])}, comme ${esc(x(k, 'guestsOnly')[1])}, peut aller dans votre histoire ou dans ${GTK[1]} si vous voulez, comme quelque chose que vous offrez.`)),
    keys: ['only for guests', 'guests only', 'just for our guests', 'not open to the public'], keysFr: ['seulement pour nos clients', 'reserve aux clients'] },
  { id: 'outdoor-price-upload', q: () => ['Upload our rate sheet (a PDF or a photo)', 'Téléverser notre grille de tarifs (un PDF ou une photo)'],
    a: () => cat(P(`Yes. Open ${YP[0]} (from your edit page or the setup), then upload the PDF or a photo of your rate sheet, or paste the link to your rates page. We type it up and it shows on your page within a day.`, `Oui. Ouvrez ${YP[1]} (depuis votre page de modification ou la configuration), puis téléversez le PDF ou une photo de votre grille, ou collez le lien de votre page des tarifs. Nous la tapons et elle paraît sur votre page d’ici un jour.`)),
    keys: ['upload our rates', 'rates pdf', 'price list pdf', 'rate sheet', 'photo of our rates', 'upload the pdf'], keysFr: ['televerser nos tarifs', 'grille de tarifs', 'pdf des tarifs'] },
  { id: 'outdoor-second-phone', q: () => ['A second phone number (after hours, the dock, security)', 'Un deuxième numéro (après les heures, le quai, la sécurité)'],
    a: (k) => cat(P(`One number fits the phone box: put the main one there. ${gtkLine(x(k, 'phone2'))[0]}`, `Un seul numéro entre dans la case du téléphone : mettez-y le principal. ${gtkLine(x(k, 'phone2'))[1]}`)),
    keys: ['second phone number', 'another number', 'two phone numbers', 'after hours number', 'security number', 'emergency number'], keysFr: ['deuxieme numero', 'autre numero', 'numero d urgence'] },
  { id: 'outdoor-map', q: (k) => (k === 'camp' ? ['Our park or site map', 'Le plan de notre camping'] : ['Our map (trails, sites or fields)', 'Notre carte (sentiers, emplacements ou champs)']),
    a: (k) => cat(P(`Add it as a photo (in Photos): it shows with your other photos once we check it. Or put the link in one line in ${GTK[0]}, like ${em(x(k, 'map'))[0]}.`, `Ajoutez-la comme photo (dans Photos) : elle paraît avec vos autres photos une fois vérifiée. Ou mettez le lien en une ligne dans ${GTK[1]}, comme ${em(x(k, 'map'))[1]}.`)),
    keys: ['park map', 'site map', 'trail map', 'our map', 'field map'], keysFr: ['plan du camping', 'carte des sentiers', 'plan du site'] },
  // Outdoor fresh test (2026-11-23; Codex: "How do I enter RV hookup rates per night?" led with amps, water and sewer in Good
  // to know): a site's nightly rate goes in Your prices, one line each; the card shows the lowest.
  { id: 'outdoor-site-rates', kinds: ['camp'], q: () => ['Nightly rates for each kind of site (RV, tent, hookups)', 'Les tarifs à la nuit par type d’emplacement (VR, tente, services)'],
    a: () => cat(P(`In ${YP[0]}, add one line for each kind of site with its nightly rate, like <em>RV site, full hookups (30/50 amp) $65 a night</em> and <em>Tent site $35 a night</em>. Your card shows your lowest one (the price you gave on <strong>Price</strong>). Want the hookups said on your page too? One line in ${GTK[0]}, like <em>Full hookups 30/50 amp, water and sewer</em>.`,
      `Dans ${YP[1]}, ajoutez une ligne par type d’emplacement avec son tarif à la nuit, comme <em>Emplacement de VR, services complets (30/50 A) 65 $ la nuit</em> et <em>Emplacement de tente 35 $ la nuit</em>. Votre fiche montre le plus bas (le prix donné à <strong>Prix</strong>). Vous voulez aussi dire les services sur votre page? Une ligne dans ${GTK[1]}, comme <em>Services complets 30/50 A, eau et égout</em>.`)),
    keys: ['hookup rates', 'rv rates', 'site rates', 'nightly rate', 'per night'], keysFr: ['tarif a la nuit', 'tarifs des emplacements', 'prix par nuit'] },
  // Outdoor fresh test (2026-11-23; Codex): choosing the main photo while setting up is not managing photos already live.
  { id: 'outdoor-photo-main', q: () => ['Pick my main photo, or change one that’s already live', 'Choisir ma photo principale, ou changer une photo déjà en ligne'],
    a: () => cat(P('<strong>Setting up now:</strong> on <strong>Photos</strong>, after you choose them, tap <strong>Make main photo</strong> on the one you want big at the top of your page (✕ removes one, the ◀ ▶ arrows change the order). Then send them.', '<strong>Pendant la configuration :</strong> à <strong>Photos</strong>, après les avoir choisies, touchez <strong>Photo principale</strong> sur celle que vous voulez en grand en haut de votre page (✕ en retire une, les flèches ◀ ▶ changent l’ordre). Puis envoyez-les.'),
      P('<strong>Already on your page:</strong> <strong>Make main photo</strong>, <strong>Remove</strong> and the order arrows are on each live photo for signed-in owners. Tap <strong>Create a login</strong> near the top of this page, then open your listing from <strong>My listings</strong>.', '<strong>Déjà sur votre page :</strong> <strong>Photo principale</strong>, <strong>Retirer</strong> et les flèches d’ordre sont sur chaque photo en ligne pour les propriétaires connectés. Touchez <strong>Créer un compte</strong> en haut de cette page, puis ouvrez votre fiche dans <strong>Mes fiches</strong>.')),
    keys: ['main photo', 'cover photo', 'make main', 'delete photo', 'remove photo', 'change photo'], keysFr: ['photo principale', 'supprimer une photo', 'retirer une photo', 'changer la photo'] },
  { id: 'outdoor-what-we-have', q: (k) => (k === 'camp' ? ['Site types, hookups and what’s on site', 'Les emplacements, les services et ce qu’il y a sur place'] : ['What we have (where do I list it?)', 'Ce que nous avons (où le dire?)']),
    a: (k) => cat(P(`${gtkLine(x(k, 'what'))[0]} Their prices go in ${YP[0]}, one line each.`, `${gtkLine(x(k, 'what'))[1]} Leurs prix vont dans ${YP[1]}, une ligne chacun.`)),
    keys: ['full hookups', 'hookups', 'site types', 'tent sites', 'rv sites', 'pull through'], keysFr: ['services complets', 'types d emplacements', 'branchements'] },
  // Outdoor fresh test (2026-11-23; Codex: "Where do I say dogs must be on a leash?" was told to leave Dogs welcome off, though
  // Who can come has its own "Where are dogs allowed?" chips): the answer walks the control.
  { id: 'outdoor-dogs', q: () => ['Dogs: on a leash, or only some places', 'Les chiens : en laisse, ou seulement à certains endroits'],
    a: (k) => cat(P(`On <strong>Who can come</strong>, tick <strong>Dogs welcome</strong>. Then, under <strong>Where are dogs allowed?</strong>, tap <strong>On a leash</strong> (or another chip), or type your rule, like ${em(x(k, 'dogs'))[0]}. It shows under “Plan your visit” on your page, and Build My Trip finds you for trips with a dog.`,
      `À <strong>Qui peut venir</strong>, cochez <strong>Chiens bienvenus</strong>. Puis, sous <strong>Où les chiens sont-ils permis?</strong>, touchez <strong>En laisse</strong> (ou un autre choix), ou écrivez votre règle, comme ${em(x(k, 'dogs'))[1]}. Elle paraît sous « Planifiez votre visite » sur votre page, et Planifier mon voyage vous trouve pour les voyages avec un chien.`)),
    keys: ['dogs', 'dog friendly', 'pets', 'dogs on leash', 'no dogs'], keysFr: ['chiens', 'chiens en laisse', 'animaux de compagnie'] },
  { id: 'outdoor-limits', kinds: NOT(['market', 'camp']), q: () => ['Age, height or weight limits', 'Les limites d’âge, de taille ou de poids'],
    a: (k) => cat(P(`On Who can come, pick the youngest age anyone can come for anything you offer. The rest goes in one line in ${GTK[0]}, like ${em(x(k, 'limits'))[0]}.`, `À Qui peut venir, choisissez l’âge le plus jeune pour tout ce que vous offrez. Le reste va en une ligne dans ${GTK[1]}, comme ${em(x(k, 'limits'))[1]}.`)),
    keys: ['height limit', 'weight limit', 'minimum age', 'age limit', 'how old', 'minimum height'], keysFr: ['taille minimale', 'poids maximum', 'age minimum', 'limite d age'] },
  { id: 'outdoor-weather', q: () => WORDS.wxQ._outdoor,
    a: (k) => cat(P(`No need to change your hours for the weather. ${gtkLine(x(k, 'weather'))[0]} Closed a whole day you know about ahead? Add it under Closures and holidays.`, `Pas besoin de changer vos heures pour la météo. ${gtkLine(x(k, 'weather'))[1]} Fermé toute une journée que vous connaissez d’avance? Ajoutez-la dans Fermetures et jours fériés.`)),
    keys: ['bad weather', 'weather', 'rain', 'wind', 'wildfire smoke', 'lightning', 'cancel for weather'], keysFr: ['mauvais temps', 'meteo', 'pluie', 'vent', 'fumee'] },
  { id: 'outdoor-waiver', kinds: ['adventurepark', 'airsport', 'horse', 'waterrent', 'waterpark', 'skihill', 'outdoorother'], q: () => ['Waivers', 'Les décharges'],
    a: (k) => cat(P(`${gtkLine(x(k, 'waiver'))[0]} A link to your online waiver can go at the end of that line.`, `${gtkLine(x(k, 'waiver'))[1]} Le lien vers votre décharge en ligne peut aller au bout de cette ligne.`)),
    keys: ['waiver', 'waivers', 'release form', 'sign a waiver'], keysFr: ['decharge', 'renonciation', 'formulaire de decharge'] },
  { id: 'outdoor-deposit', kinds: NOT(['market', 'nature']), q: () => ['Deposits and cancellations', 'Les dépôts et les annulations'],
    a: (k) => cat(P(gtkLine(x(k, 'deposit'))[0], gtkLine(x(k, 'deposit'))[1])),
    keys: ['deposit', 'cancellation policy', 'cancel', 'refund', 'damage deposit', 'no show'], keysFr: ['depot', 'politique d annulation', 'annulation', 'remboursement'] },
  { id: 'outdoor-licence', kinds: ['waterrent', 'airsport', 'outdoorother'], q: () => ['A licence or boating card people need', 'Un permis ou une carte de conducteur'],
    a: (k) => cat(P(gtkLine(k === 'waterrent' ? X.waterrent.licence : x(k, 'licence'))[0], gtkLine(k === 'waterrent' ? X.waterrent.licence : x(k, 'licence'))[1])),
    keys: ['boating licence', 'boat license', 'pcoc', 'boating card', 'operator card', 'licence'], keysFr: ['permis de bateau', 'carte de conducteur d embarcation', 'permis'] },
  { id: 'outdoor-upick', kinds: ['farm', 'outdoorother'], q: () => ['U-pick: what’s ready when', 'L’autocueillette : quoi et quand'],
    a: () => cat(P(`Keep your hours and season for the whole farm. What’s ready when goes in one line in ${GTK[0]}, like ${em(X.farm.upick)[0]}; u-pick prices go in ${YP[0]}. A harvest weekend people can come to? Add it with <strong>Add an event</strong> on your page.`, `Gardez vos heures et votre saison pour toute la ferme. Ce qui est prêt et quand va en une ligne dans ${GTK[1]}, comme ${em(X.farm.upick)[1]}; les prix d’autocueillette vont dans ${YP[1]}. Une fin de semaine des récoltes ouverte à tous? Ajoutez-la avec <strong>Ajouter un événement</strong> sur votre page.`)),
    keys: ['u pick', 'upick', 'you pick', 'pick your own', 'what s ready', 'cherries', 'strawberries', 'apples'], keysFr: ['autocueillette', 'cueillette', 'cerises', 'fraises', 'pommes'] },
  { id: 'outdoor-market', kinds: ['market'], q: () => ['Our vendors and market days', 'Nos marchands et nos jours de marché'],
    a: () => cat(P(`Your market days and times are your hours (tap <strong>Mark closed</strong> on the other days). The vendors go in one line in ${GTK[0]}, like ${em(X.market.vendors)[0]}, and “Rain or shine” too.`, `Vos jours et heures de marché sont vos heures (touchez <strong>Fermé</strong> les autres jours). Les marchands vont en une ligne dans ${GTK[1]}, comme ${em(X.market.vendors)[1]}, et « Beau temps, mauvais temps » aussi.`)),
    keys: ['vendors', 'vendor list', 'market days', 'stalls', 'rain or shine', 'which days'], keysFr: ['marchands', 'exposants', 'jours de marche', 'beau temps mauvais temps'] },
  { id: 'outdoor-visit-length', q: (k) => (k === 'camp' ? ['How long people stay (a night, a week, all winter)', 'La durée du séjour (une nuit, une semaine, tout l’hiver)'] : ['How long a visit takes', 'La durée d’une visite']),
    a: (k) => (k === 'camp'
      ? cat(P(`There’s no visit length for a campground: your page says “a night”, and Build My Trip plans an overnight stay. Weekly, monthly and all-winter stays are rates: one line each in ${YP[0]}, like ${em(X.camp.long1)[0]}.`, `Il n’y a pas de durée de visite pour un camping : votre page dit « la nuit », et Planifier mon voyage prévoit une nuit sur place. Les séjours à la semaine, au mois et tout l’hiver sont des tarifs : une ligne chacun dans ${YP[1]}, comme ${em(X.camp.long1)[1]}.`))
      : cat(P(`On What kind of place, pick how long most people stay, like ${esc(x(k, 'visit')[0])}. It shows as “Time needed” on your page and helps Build My Trip leave enough time. It varies? Pick the usual visit.`, `À Quel genre d’endroit, choisissez la durée de la plupart des visites, comme ${esc(x(k, 'visit')[1])}. Elle paraît comme « Temps à prévoir » sur votre page et aide Planifier mon voyage. Ça varie? Choisissez la visite habituelle.`))),
    keys: ['how long', 'visit length', 'time needed', 'length of stay', 'how long do visits last'], keysFr: ['combien de temps', 'duree de la visite', 'duree du sejour'] },
  { id: 'outdoor-kinds-many', q: () => ['We have several things: do I pick more than one kind?', 'Nous avons plusieurs choses : je choisis plus d’un genre?'],
    a: (k) => (k === 'camp'
      ? cat(P(`No, one is enough: ${esc(X.camp.many[0])}. Put each kind of site and the cabin in ${YP[0]}, one line each, and say it all in your story.`, `Non, un seul suffit : ${esc(X.camp.many[1])}. Mettez chaque type d’emplacement et le chalet dans ${YP[1]}, une ligne chacun, et dites tout dans votre histoire.`))
      : cat(P(`Pick up to 3 on What kind of place, your main thing first: they show on your card in that order. Anything else you have goes in your story.`, `Choisissez jusqu’à 3 genres à Quel genre d’endroit, votre activité principale d’abord : ils paraissent sur votre fiche dans cet ordre. Le reste va dans votre histoire.`))),
    keys: ['more than one', 'pick more than one', 'several kinds', 'which kind'], keysFr: ['plus d un', 'plusieurs genres'] },
  { id: 'outdoor-which-price', q: (k) => ['Which price goes on Price?', 'Quel prix va dans Prix?'],
    a: (k) => cat(P(`On Price, put ${esc(x(k, 'card')[0])}: it’s the one on your card. Every other rate goes in ${YP[0]}, one line each. Prices before tax are fine: add “+GST” in a line’s details if you like.`, `Dans Prix, mettez ${esc(x(k, 'card')[1])} : c’est celui de votre fiche. Chaque autre tarif va dans ${YP[1]}, une ligne chacun. Les prix avant taxes sont corrects : ajoutez « + TPS » dans les détails d’une ligne si vous voulez.`)),
    keys: ['which price', 'which one do i put', 'what price do i put'], keysFr: ['quel prix', 'lequel je mets'] },
  { id: 'outdoor-book-season', kinds: NOT(['market', 'nature']), q: (k) => (k === 'camp' ? ['Booked solid in summer, walk-ins the rest of the year', 'Complet l’été, sans réservation le reste de l’année'] : ['Book ahead in the busy season, walk-ins the rest', 'Réserver en haute saison, sans réservation le reste']),
    a: (k) => cat(P(`On Walk-ins or booking, tap the middle choice (some of it needs booking). Then say when in one line in ${GTK[0]}, like ${em(x(k, 'bookSplit'))[0]}.`, `À Sans réservation ou réservation, touchez le choix du milieu (une partie se réserve). Dites ensuite quand en une ligne dans ${GTK[1]}, comme ${em(x(k, 'bookSplit'))[1]}.`)),
    keys: ['booked solid', 'walk ins in winter', 'book ahead in summer'], keysFr: ['complet l ete', 'sans reservation l hiver'] },
  { id: 'outdoor-book-here', q: () => ['Can people book on Okanagan Roam?', 'Peut-on réserver sur Okanagan Roam?'],
    a: (k) => cat(P(`Not on Okanagan Roam: people book with you, and we never take a cut. Your page’s Book button opens your own booking page: paste its link on <strong>Booking</strong>.`, `Pas sur Okanagan Roam : on réserve directement chez vous, et nous ne prenons jamais de commission. Le bouton Réserver de votre page ouvre votre propre page de réservation : collez son lien à <strong>Réservation</strong>.`)),
    keys: ['book on your website', 'book through you', 'book on okanagan roam'], keysFr: ['reserver sur votre site'] },
  { id: 'outdoor-groups', q: (k) => (k === 'camp' ? ['Groups and family reunions', 'Les groupes et les réunions de famille'] : ['Our groups don’t fit the size chips', 'Nos groupes ne correspondent pas aux tailles proposées']),
    a: (k) => cat(P(`No size chip fits? Skip them and say it in your own words in <strong>Groups</strong>, like ${em(x(k, 'groups'))[0]}.`, `Aucune taille ne convient? Passez-les et dites-le dans vos mots dans <strong>Groupes</strong>, comme ${em(x(k, 'groups'))[1]}.`)),
    keys: ['family reunions', 'reunions', 'group sites', 'side by side', 'groups'], keysFr: ['reunions de famille', 'groupes', 'emplacements de groupe'] },
  { id: 'outdoor-weekly', q: (k) => [`Something every week (like ${x(k, 'weekly')[0].charAt(0).toLowerCase()}${x(k, 'weekly')[0].slice(1)})`, `Une activité chaque semaine (comme ${x(k, 'weekly')[1].charAt(0).toLowerCase()}${x(k, 'weekly')[1].slice(1)})`],
    a: (k) => cat(P(`${gtkLine(x(k, 'weekly'))[0]} Open to everyone? Put it on What’s On too: on your page, tap <strong>Add an event</strong>, give the first date and time, and write “${esc(x(k, 'weeklyDay')[0])}” in <strong>Repeats or other dates?</strong>. Keep your hours as they are.`,
      `${gtkLine(x(k, 'weekly'))[1]} Ouvert à tous? Ajoutez-le aussi à À l’affiche : sur votre page, touchez <strong>Ajouter un événement</strong>, donnez la première date et l’heure, et écrivez « ${esc(x(k, 'weeklyDay')[1])} » dans <strong>Se répète ou autres dates?</strong>. Gardez vos heures telles quelles.`)),
    keys: ['every saturday', 'weekends', 'every week', 'weekly'], keysFr: ['chaque samedi', 'fins de semaine', 'chaque semaine'] },
  { id: 'outdoor-lessons', kinds: LESSON_KINDS_, q: () => ['Lessons: where do they go?', 'Les cours : où les mettre?'],
    a: (k) => cat(P(`Each lesson is one line in ${YP[0]}, with who and how long in its details, like ${em(x(k, 'lesson'))[0]}. On dates people can join, like a weekend clinic? Add it with <strong>Add an event</strong> on your page.`,
      `Chaque cours est une ligne dans ${YP[1]}, avec pour qui et combien de temps dans ses détails, comme ${em(x(k, 'lesson'))[1]}. À des dates ouvertes à tous, comme une clinique de fin de semaine? Ajoutez-le avec <strong>Ajouter un événement</strong> sur votre page.`)),
    keys: ['lessons', 'lesson', 'ski school', 'clinic'], keysFr: ['cours', 'lecons', 'ecole de ski'] },
  { id: 'outdoor-photo-ok', q: () => ['Photos from our Facebook or our guests: OK to use?', 'Des photos de notre Facebook ou de nos clients : on peut?'],
    a: () => cat(P(`Yes, if you took them or the person who did says it’s OK. Your own Facebook photos are fine. A guest’s photo? Ask them first, and put their name in the credit. Not sure? Use the ones you took.`, `Oui, si vous les avez prises ou si la personne qui les a prises est d’accord. Vos propres photos Facebook sont correctes. La photo d’un client? Demandez-lui d’abord, et mettez son nom dans le crédit. Pas certain? Utilisez celles que vous avez prises.`)),
    keys: ['guests took them', 'photos from facebook', 'ok to use photos', 'customer photos'], keysFr: ['photos de nos clients', 'photos facebook'] },
];

// The kind's own season word for the opening day ("moves with the snow"): sport-help kindHelp reads WORDS.moves.

// FIRST: [rule id, topic id, all (regexes, every one must match), not (none may match), kinds (null: every outdoor kind)].
// Regexes run on the matcher's normalized question: lowercase, no accents, words split by one space, ' ' at each end,
// '$' as "dollarsign", a date as "specificdate", "3 days" as "ndays days".
const OFFICE = '\\b(office|offices|front desk|reception|registration|check in desk|ticket office|ticket window|booth|info booth|farm stand|store|shop|rental shop|desk|bureau|accueil|reception|billetterie|kiosque|boutique|comptoir)\\b';
const CLOSEW = '\\b(close|closes|closed|closing|shut|shuts|not open|ferme|fermee|fermes|fermees|ferment|fermeture)\\b';
const HOLI = '\\b(christmas|xmas|boxing|new year|new years|holiday|holidays|stat|stats|thanksgiving|easter|good friday|canada day|labour day|victoria day|family day|remembrance|specificdate|noel|jour de l an|ferie|feries|paques|action de grace|fete du canada)\\b';
const PART = '\\b(beach|beaches|pool|pools|hot tub|lift|lifts|chair|chairlift|chairs|gondola|tube park|tubing|terrain park|night skiing|run|runs|loop|loops|section|sections|area|areas|cabin|cabins|trail|trails|boardwalk|zipline|ziplines|zip line|slide|slides|maze|corn maze|field|fields|playground|splash pad|kids area|petting|lodge|waterfront sites?|beach sites?|lakefront sites?|tent area|jet skis?|pontoons?|dock|docks|night course|kids course|one course|some courses|food trucks?|craft row|bike park|summer bike park|petting farm|mini ferme|plage|piscine|remontee|remontees|telesiege|sentier|sentiers|chalets?|aire de jeux|labyrinthe|glissade|glissades|quai)\\b';
const REST = '\\b(rest of|rest is|everything else|still open|stays open|stay open|rest stays|the park is open|park is open|campground is open|the rest|other sites|le reste|reste ouvert|restent ouverts?|toujours ouvert)\\b';
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|summer|winter|spring|fall|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|ete|hiver';
const WXW = '\\b(weather|rain|rains|raining|rainy|wind|winds|windy|vente|venteux|storm|storms|lightning|thunder|smoke|smoky|wildfire|wildfires|no snow|too hot|heat|waves|meteo|pluie|pleut|vent|vents|orage|orages|fumee|feux de foret|tempete|chaleur|chaud)\\b';
const PRICEW = '\\b(dollarsign|price|prices|rate|rates|cost|costs|charge|fee|fees|tarif|tarifs|prix|cout)\\b';
const R = (id, to, all, not, kinds) => ({ id, to, all, not: not || [], kinds: kinds || null });
const FIRST = [
  R('story-fix', 'story-words', ['\\b(description|story|blurb|histoire|texte)\\b', '\\b(fix|change|wrong|edit|correct|incorrect|says|said|mistake|corriger|changer|modifier|faux|fausse|erreur|dit)\\b']),
  R('guests-only', 'outdoor-guests-only', ['\\b(only for|just for|guests only|guest only|registered guests|staying with us|our guests|our campers|campers only|residents only|our snowbirds|not open to the public|not public|pour nos clients|seulement pour|reserve aux|reserves aux|nos campeurs)\\b', '\\b(event|events|potluck|party|parties|bbq|barbecue|night|nights|dinner|bingo|social|gathering|happy hour|activity|activities|evenement|evenements|souper|activite|activites|soiree|soirees|fete)\\b']),
  R('office-holiday', 'outdoor-office-holiday', [OFFICE, CLOSEW, HOLI]),
  R('staff-login', 'staff', ['\\b(staff|employee|employees|girls|guys|front desk|team|manager|managers|my partner|my wife|my husband|coworkers?|co workers?|personnel|employes|employees|equipe|gerant|gerante|ma femme|mon mari|mon associe)\\b', '\\b(log in|login|logins|sign in|access|update|edit|own login|their own|acces|connecter|se connecter|modifier|mettre a jour)\\b']),
  R('book-season', 'outdoor-book-season', ['\\b(booked|book|books|booking|reserve|reserved|full|complet)\\b', '\\b(summer|july|august|winter|weekends|season|ete|hiver|juillet|aout)\\b', '\\b(walk in|walk ins|walkins|walk up|walk ups|roll in|rolls in|drop in|show up|first come|sans reservation|arrivent|just come)\\b']),
  R('part-closed-rest', 'outdoor-part-closed', [CLOSEW, REST], ['\\b(office|bureau|accueil)\\b']),
  R('part-closed', 'outdoor-part-closed', [PART, `${CLOSEW}|\\b(own season|own months|only in|opens? (in|on|when|specificdate)|until|till|seulement|jusqu)\\b|\\b(only|just) (runs?|open|opens|from|in|on|during|comes?)\\b|\\b(own hours|its own hours|different hours|own times|ses propres heures|son propre horaire)\\b|\\bonly (${MONTHS})\\b`], ['\\b(whole|entire|all of|tout le|toute la)\\b', '\\b(dogs?|chiens?|fires?|feux)\\b', WXW]),
  R('office-hours', 'outdoor-office-hours', [OFFICE, '\\b(hours|hour|open|opens|from|until|till|am|pm|24|heures|ouvert|ouvre|\\d{1,2}(h|am|pm)?)\\b'], ['\\b(dollarsign|price|prices|rate|rates|tarif|prix)\\b']),
  R('open-24', 'outdoor-office-hours', ['\\b(24 7|24 hours|24h|24 hrs|all night|around the clock|day and night|jour et nuit|24 heures)\\b'], ['\\b(ahead|before|notice|advance|cancel|cancels|deposit|refund|rebook|avant|avance|annul\\w*|rembours\\w*)\\b']),
  R('checkin', 'outdoor-checkin', ['\\b(check in|checkin|check ins|check out|checkout|check outs|late arrival|late arrivals|arrival time|arrival times|heure d arrivee|heures d arrivee|heure de depart|arrivee|arrivees|depart|departs|arrivez|presentez vous)\\b'], ['\\b(dollarsign|price|tarif|prix)\\b']),
  R('quiet', 'outdoor-quiet-hours', ['\\b(quiet hours|quiet hour|quiet time|quiet times|noise|noisy|generator|generators|heures de silence|heure de silence|silence|bruit|couvre feu)\\b']),
  R('fires', 'outdoor-fires', ['\\b(fire|fires|campfire|campfires|firewood|fire pit|fire pits|firepit|firepits|fire ban|burn|burning|feu|feux|bois de chauffage|foyer|foyers|smoking|smoke free|cigarette|fumer)\\b'], ['\\b(wildfire|wildfires|smoke|smoky|fumee|feux de foret|feu de foret|forest fire|forest fires)\\b']),
  R('map', 'outdoor-map', ['\\b(map|maps|site plan|park plan|carte (du|des|de la) (camping|site|sites|sentiers?|parc|ferme|pistes?|emplacements|marche|lac)|plan (du|des|de la) (camping|site|parc|ferme|emplacements|marche|champs|sentiers|pistes|parcours))\\b'], ['\\b(address|pin|wrong spot|wrong place|wrong location|directions|google maps|adresse|epingle|mauvais endroit)\\b']),
  R('photo-ok', 'outdoor-photo-ok', ['\\b(photo|photos|pic|pics|pictures?|images?)\\b', '\\b(guest|guests|customers?|campers|visitors|clients?|facebook|instagram|someone else|took them|took these|allowed|permission|ok to use|okay to use|is that ok|can we use|can i use|peut on|est ce correct|permis)\\b'], ['\\b(map|maps|carte|menu|rates?|prices?|price list|pdf)\\b']),
  R('upload', 'outdoor-price-upload', ['\\b(pdf|pdfs|upload|uploading|scan|photo of|picture of|rate sheet|rates sheet|price sheet|brochure|televerser|telecharger|televerse)\\b', `${PRICEW}|\\b(list|sheet|pdf|grille|liste)\\b`]),
  R('upload-pdf', 'outdoor-price-upload', ['\\b(pdf|pdfs)\\b']),
  R('second-phone', 'outdoor-second-phone', ['\\b(phone|phones|number|numbers|numero|numeros|telephone|cell|line|lines)\\b', '\\b(second|another|other|two|2|too|also|as well|after hours|security|emergency|toll free|both|different|separate|extra|dock|deuxieme|autre|urgence|aussi|sans frais|different)\\b'], ['\\b(dollarsign|price|rate|rates|people|persons|max|sites per|guests per|nights?|tarifs?|prix|personnes)\\b']),
  R('visit-length', 'outdoor-visit-length', ['\\b(how long|visit length|length of (a )?visit|time needed|length of stay|stay length|duree|combien de temps|temps a prevoir)\\b'], [PRICEW]),
  R('kinds-many', 'outdoor-kinds-many', ['\\b(pick|choose|tap|select|choisir|cocher|choisis|coche)\\b', '\\b(more than one|more then one|more that one|several|multiple|both|two kinds|2 kinds|plus d un|plusieurs|les deux)\\b']),
  R('deal', 'outdoor-deal', ['\\b((\\d+(st|nd|rd|th)|third|fourth|fifth|sixth|seventh|last) (night|nights|day|days)|night free|nights free|free night|free nights|nuit gratuite|nuits gratuites|e nuit|stay and save|early bird|last minute|discount|discounts|deal|deals|special|specials|promo|promotion|promotions|rabais|offre|offres|half price|moitie prix|percent off|\\d+ off|\\d+ percent|\\d+ pour cent|off season rate|off season rates)\\b'], ['\\b(kids?|children|under \\d+|seniors?|enfants?|aines|gift)\\b']),
  R('pass', 'outdoor-long-rates', ['\\b(season pass|season passes|passe de saison|passes de saison|laissez passer de saison|punch card|carte de saison)\\b']),
  R('long-rates', 'outdoor-long-rates', ['\\b(weekly|monthly|month|months|by the month|per month|a month|seasonal|full season|whole season|season site|season sites|season pass|season passes|snowbird|snowbirds|all winter|cabin|cabins|chalet|chalets|cottage|cottages|yurt|yurts|by the week|per week|a week|week|day rate|full day|half day|multi day|punch card|mensuel|mensuels|au mois|par mois|a la semaine|par semaine|saisonnier|saisonniers|saison complete|passe de saison|laissez passer de saison|journee complete|demi journee|a la journee|par jour)\\b', `${PRICEW}|\\b(\\d{2,4}|where|go|goes|put|mettre|ou)\\b`]),
  R('which-price', 'outdoor-which-price', [`${PRICEW}|\\b(\\d{2,3})\\b`, '\\b(which|what do i put|which one|what one|lequel|laquelle|quel|quelle)\\b']),
  R('groups', 'outdoor-groups', ['\\b(reunion|reunions|side by side|group sites?|families book|several sites|plusieurs emplacements|reunion de famille|reunions de famille|cote a cote)\\b']),
  R('photo-main', 'outdoor-photo-main', ['\\b(photo|photos|picture|pictures|pic|pics|image|images)\\b', '\\b(main|cover|top|first|banner|big|delete|remove|change|replace|swap|principale|couverture|supprimer|retirer|enlever|changer|remplacer)\\b'], ['\\b(facebook|instagram|guests?|clients?|ok to use|allowed to use|permission|droits?)\\b']),
  R('site-rates', 'outdoor-site-rates', ['\\b(hookup|hookups|hook ups|hook up|rv|rvs|tent|tents|site|sites|emplacement|emplacements|vr|full service|serviced)\\b', `${PRICEW}|\\b(per night|a night|nightly|la nuit|par nuit|\\$)`], [], ['camp']),
  R('what-we-have', 'outdoor-what-we-have', ['\\b(hookup|hookups|hook ups|hook up|full service|amp|amps|30 50|sewer|water and power|water and sewer|serviced|unserviced|pull through|pull thru|pull throughs|back in|tent sites?|rv sites?|site types|services complets|branchements|egout|electricite)\\b'], [PRICEW]),
  R('book-here', 'outdoor-book-here', ['\\b(book|reserve|reservation|booking)\\b', '\\b(your website|your site|on your|through you|through your|right here|on okanagan roam|on roam|directly on|sur votre site|via votre site|sur okanagan roam)\\b']),
  R('cost', 'cost', ['\\b(take a cut|cut of|a cut|commission|commissions|charge us|charge me|cost us|cost me|cost anything|pay you|do i pay|do we pay|is this free|is it free|any fees|hidden fees|booking fee|est ce gratuit|c est gratuit|payer quelque chose|vous payer|frais)\\b'], ['\\b(entry|admission|entree|kids?|parking)\\b']),
  R('licence', 'outdoor-licence', ['\\b(experience|experienced|licence|license|licenses|licences|licensed|licenced|boating card|boat card|pcoc|operator card|operator s card|permis|carte de conducteur|carte d embarcation)\\b'], null, ['waterrent', 'airsport', 'outdoorother']),
  R('waiver', 'outdoor-waiver', ['\\b(waiver|waivers|release form|release forms|liability|decharge|decharges|renonciation)\\b']),
  R('deposit', 'outdoor-deposit', ['\\b(deposit|deposits|cancel|cancels|cancelled|canceled|cancellation|cancelation|refund|refunds|no show|no shows|caution|depot|depots|annul|annule|annuler|annulation|rembourse|remboursement)\\b'], [WXW]),
  R('weather', 'outdoor-weather', [WXW], ['\\b(rain or shine|beau temps mauvais temps)\\b']),
  R('market', 'outdoor-market', ['\\b(vendor|vendors|stall|stalls|booth|booths|exposant|exposants|kiosques|marchand|marchands|vendeur|vendeurs|rain or shine|beau temps mauvais temps|market days?|jours? de marche)\\b'], null, ['market']),
  R('upick', 'outdoor-upick', ['\\b(u pick|upick|you pick|pick your own|picking|autocueillette|cueillette|cueillir)\\b'], null, ['farm', 'outdoorother']),
  R('crops', 'outdoor-upick', ['\\b(strawberries|cherries|apples|peaches|blueberries|raspberries|pumpkins?|corn|fraises|cerises|pommes|peches|bleuets|framboises|citrouilles)\\b', `\\b(${MONTHS}|season|when|ready|ripe|saison|quand|pret|prets|mur|murs)\\b`], [PRICEW], ['farm', 'outdoorother']),
  R('limits', 'outdoor-limits', ['\\b(height|tall|weight|weigh|lbs|pounds|kg|min age|minimum age|age limit|age limits|years old|how old|taille|poids|age minimum|ans et plus|limite d age)\\b'], ['\\b(free|gratuit|dollarsign|price|prices|tarif|prix)\\b']),
  R('limits-under', 'outdoor-limits', ['\\b(under|over|moins de|plus de) \\d+\\b', '\\b(must|need|needs|have to|has to|with an adult|accompanied|swim test|doivent|doit|accompagnes?|avec un adulte)\\b'], ['\\b(free|gratuit|dollarsign|price|prices|tarif|prix)\\b']),
  R('dogs', 'outdoor-dogs', ['\\b(dog|dogs|pet|pets|puppy|puppies|chien|chiens|animaux de compagnie)\\b'], ['\\b(service dogs?|chiens? d assistance)\\b']),
  R('bring', 'sport-what-to-bring', ['\\b(life jackets?|pfds?|helmets?|closed toe|shoes|sunscreen|bring|wear|sun hat|bug spray|gilets?( de sauvetage)?|casques?|souliers|apporter|apportez|porter)\\b'], ['\\b(dogs?|chiens?|firewood|bois)\\b']),
  R('free', 'indoor-free', ['\\b(by donation|donation|donations|par don|don volontaire|free to (come|visit|enter|get in)|free entry|free admission|no charge to (come|visit|get in)|its free|it s free|entree gratuite|entree libre|gratuit pour (tous|les visiteurs))\\b'], ['\\b(kids?|children|under \\d+|seniors?|enfants?|night|nights|nuit|nuits)\\b']),
  R('weekly', 'outdoor-weekly', ['\\b(every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|night|evening)|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays|weekends|on weekends|fins de semaine|chaque (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|fin de semaine)|les (lundis|mardis|mercredis|jeudis|vendredis|samedis|dimanches))\\b'], ['\\b(open|opens|close|closes|closed|hours|am|pm|\\d{1,2}h|ouvert|ouverte|ferme|fermee|heures|book|booked|booking|reserve|walk ins?)\\b', PRICEW]),
  R('lessons', 'outdoor-lessons', ['\\b(lesson|lessons|ski school|snow school|clinic|clinics|instructor|instructors|teach|cours|lecon|lecons|ecole de ski|moniteurs?)\\b'], null, LESSON_KINDS_),
  R('cheaper-online', 'outdoor-which-price', ['\\b(cheaper|cheapest|lower|less|discount|moins cher|rabais)\\b', '\\b(online|on line|en ligne|at the window|at the gate|au guichet)\\b']),
  R('extras', 'indoor-extras', ['\\b(fuel|gas|extra|extras|add on|add ons|not included|on top|en sus|en plus|non compris|non comprise|essence|supplement|supplements)\\b'], ['\\b(staff|login|number|phone|numero)\\b']),
  R('capacity', 'outdoor-limits', ['\\b(max|maximum|up to|no more than|jusqu a) \\d+ (people|persons|riders|adults|per boat|on board|personnes|adultes)\\b']),
  R('season-closed', 'sport-season', [CLOSEW, '\\b(whole park|whole campground|whole place|whole farm|whole hill|entire|for the season|for winter|for the winter|over winter|off season|all winter|every winter|tout le camping|toute la saison|pour la saison|pour l hiver)\\b'], [OFFICE]),
  R('season-open', 'sport-season', ['\\b(open|opens|ouvert|ouverts|ouverte|ouvre|ouvrons)\\b', `\\b(${MONTHS}|specificdate)\\b.*\\b(to|until|till|through|thru|a|au|jusqu)\\b.*\\b(${MONTHS}|specificdate)\\b`], [OFFICE, '\\b(am|pm|\\d{1,2}h|hours|heures)\\b']),
  R('public-event', 'event-add', ['\\b(open to (everyone|the public|all|anyone)|everyone welcome|everyone is welcome|all welcome|public welcome|ouvert a tous|ouverte a tous|ouvert au public)\\b', '\\b(event|events|show|concert|fireworks|festival|party|night|day|market|race|evenement|evenements|spectacle|feux d artifice|fete)\\b'], ['\\b(not open|pas ouvert|pas ouverte)\\b']),
  R('gift', 'indoor-gift', ['\\b(gift cards?|gift certificates?|gift vouchers?|cartes? cadeaux?|certificats? cadeaux?)\\b']),
  R('on-site', 'outdoor-what-we-have', ['\\b(wifi|wi fi|showers?|laundry|playground|store|general store|groceries|ice|propane|dump station|sani dump|boat launch|launch|beach|heated pool|pool|hot tub|lakefront|lake front|on the lake|waterfront|picnic tables?|washrooms?|toilets|outhouses?|douches?|buanderie|aire de jeux|depanneur|epicerie|rampe de mise a l eau|plage|piscine|bord du lac|toilettes|we sell|sell|farm market|bakery|pies|jam|produce|animals|goats|petting|nous vendons|animaux|chevres|newest boats|our boats|our fleet|flotte)\\b'], [PRICEW]),
  R('a-price', 'indoor-price-varies', ['\\b(is|are|costs?|for|cout|coute|est)( dollarsign)? \\d{2,4}\\b'], ['\\b(kids|people|persons|guests|groups?|minutes|min|hours|hrs|am|pm|lbs|kg|ans|enfants|personnes|years|max|minimum)\\b']),
  R('opening-day', 'sport-opening-day', ['\\b(opening day|open day|first day|opening date|ouverture|jour d ouverture)\\b', '\\b(snow|depends|depending|weather|water|lake|crops?|change|changes|moves|neige|depend|meteo|recoltes?|change)\\b']),
];

// The whole outdoor topic set for one listing: the outdoor topics first (in the kind's words), then the shared ones the
// outdoor setup keeps, without the golf, sport, indoor and food ones.
function topicsFor(kind) {
  return TOPICS.filter((t) => !t.kinds || t.kinds.includes(kind)).map((t) => {
    const q = t.q(kind), a = t.a(kind);
    return { id: t.id, q: q[0], qFr: q[1], a: a[0], aFr: a[1], keys: t.keys || [], keysFr: t.keysFr || [], pages: ['setup', 'edit', 'menu'], over: [], noRelated: [] };
  });
}
function firstFor(kind, have) {
  return FIRST.filter((r) => (!r.kinds || r.kinds.includes(kind)) && have.has(r.to)).map((r) => ({ id: r.id, to: r.to, all: r.all, not: r.not }));
}
// Words a shared answer or title must never say on an outdoor listing (each with the kind it would belong to), and the
// swaps the shared answers get: "café or snack bar", "PD-day camps", "lessons" and golf words.
const FOREIGN = [/\bgolf/i, /\btee times?\b/i, /\bgreen fees?\b/i, /\blessons?\b/i, /\bclinics?\b/i, /\bPD[- ]day\b/i, /\bcaf[ée]\b/i, /\bsnack bar\b/i, /\bclubhouse\b/i, /\bpro shop\b/i,
  /\bmembers only\b/i, /\bpedicures?\b/i, /\bbowling\b/i, /\bsimulators?\b/i, /\bleague/i, /\btournaments?\b/i, /\broom, game or show\b/i, /\bwine lists?\b/i, /\bfood menus?\b/i, /\bdishes\b/i,
  /\bhappy hour\b/i, /\btrivia\b/i, /\bkaraoke\b/i, /\bmen’s night\b/i, /\bgrip socks\b/i, /\binstructors?\b/i, /\brink\b/i, /\bskate\b/i, /\bbays?\b/i, /\bcourts\b/,
  /\bcours\b/, /\bgolf\b/i, /(?<!(Book|Réserver)\s+(and|et)\s+|☰\s*|dans le )\bmenus?\b(?!\s*☰)/i, /\bcasse-croûte\b/i, /\bjournées? pédagogiques?\b/i, /\bmenus? de nourriture\b/i, /\bligues?\b/i, /\btournois?\b/i, /\bplats\b/];
const SWAPS = [
  // Outdoor fresh test (2026-11-23; Codex): no class or party examples in an outdoor place's booking answers.
  [/Booking always required \(classes fill up\)\?/g, 'Booking always required?'], [/La réservation est toujours obligatoire \(les cours sont pleins\)\?/g, 'La réservation est toujours obligatoire?'],
  [/ \(<strong>Book a party<\/strong> when the link is your party page\)/g, ''], [/ \(<strong>Réserver une fête<\/strong> si le lien est votre page de fêtes\)/g, ''],
  [/Our restaurant, café or patio \(open to everyone\?\)/g, 'A restaurant or store on site (open to everyone?)'], [/A café or snack bar/g, 'A store or food on site'], [/café or snack bar/g, 'store or food on site'],
  [/\(a PD-day or spring break camp\)/g, '(a spring break or summer camp)'], [/\(journée pédagogique ou relâche\)/g, '(relâche ou été)'], [/A broken booking, menu or social link/g, 'A broken booking, rates or social link'],
  [/price range, photos and menu go/g, 'price range, photos and prices go'], [/Add a booking, menu or social link/g, 'Add a booking, rates or social link'], [/your menu and what you offer/g, 'your prices and what you offer'],
  [/How do I add my menu or prices\?/g, 'How do I add my prices?'],
  [/votre menu, votre page de réservation/g, 'vos tarifs, votre page de réservation'], [/ses photos, son menu et sa description/g, 'ses photos, ses tarifs et sa description'], [/Ma photo ou mon menu ne s’affiche pas encore/g, 'Ma photo ou ma liste de prix ne s’affiche pas encore'],
  [/de réservation, de menu ou/g, 'de réservation, de tarifs ou'], [/vos photos, votre menu et vos événements/g, 'vos photos, vos tarifs et vos événements'], [/événements, menus, connexion/g, 'événements, tarifs, connexion'],
  [/Comment ajouter mon menu ou mes prix/g, 'Comment ajouter mes prix'], [/the menu screen/g, 'the prices screen'], [/l’écran du menu/g, 'l’écran des tarifs'], [/\ba (<strong>)?menu link/g, 'a $1rates link'], [/photos et menu sont/g, 'photos et tarifs sont'],
  [/\byour menu\b/g, 'your prices'], [/\bYour menu\b/g, 'Your prices'], [/\bvotre menu\b/g, 'vos tarifs'], [/\bVotre menu\b/g, 'Vos tarifs'],
  [/Summer, spring break or PD-day camps/g, 'Summer day camps'], [/,? ?(or )?PD-day camps?/g, ''], [/ or a PD day/g, ''],
  [/Lessons, rentals and a snack bar/g, 'Rentals, guided tours and a store'], [/Lessons and camps: book 48 hours ahead/g, 'Book a day ahead on summer weekends'],
  [/Rentals, lessons, memberships, food and kids’ or senior prices/g, 'Rentals, long stays, passes and kids’ or senior prices'], [/Rentals, lessons and memberships/g, 'Rentals, passes and memberships'],
  [/\(leagues, school groups, member hours\)/g, '(groups, busy weekends)'], [/a weekly night like a men’s night/g, 'a weekly night'], [/like a men’s night/g, 'like a movie night'],
  [/golf, simulators, a range or mini golf, an arena or rink, a skate park, disc golf, a BMX track or bike park, an outdoor pool o[^<]*?(?=[.<])/g, 'a campground, rentals, a water park, an adventure park, air sports, a stable, a farm, a nature centre, a market or a ski hill'],
  [/your golf one/g, 'the one just for this place'], [/not just players/g, 'not just guests'], [/Tournaments/g, 'Competitions'], [/tournaments/g, 'competitions'], [/a tournament/g, 'an event'],
  [/\blessons\b/g, 'guided tours'], [/\bLessons\b/g, 'Guided tours'], [/\blesson\b/g, 'guided tour'], [/\bclinics?\b/g, 'programs'], [/\binstructors\b/g, 'guides'], [/\bleagues\b/g, 'groups'], [/\bleague\b/g, 'group'],
  [/sports and golf places/g, 'outdoor businesses'], [/sports or golf/g, 'outdoor'], [/\bclubhouse\b/g, 'lodge'], [/\bsnack bar\b/g, 'store'],
  [/photos, menu and events/g, 'photos, prices and events'], [/photos, menu and description/g, 'photos, prices and description'], [/website, menu, booking page/g, 'website, rates, booking page'],
  [/a menu link/g, 'a rates link'], [/the menu screen/g, 'the prices screen'], [/events, menus, logins/g, 'events, prices, logins'], [/sections, dishes and prices/g, 'sections, items and prices'],
  [/your dishes or drinks,? ?/g, ''], [/My photo or menu isn’t showing yet/g, 'My photo or price list isn’t showing yet'],
  // French
  [/\(celui du golf\)/g, '(celui de cet endroit)'], [/,? vos plats ou vos boissons/g, ''], [/sections, plats et prix/g, 'sections, articles et prix'], [/\bplats\b/g, 'articles'],
  [/Camps de l’été, de la relâche ou des journées pédagogiques/g, 'Camps de jour d’été'], [/,? (ou )?(d’une |des )?journées? pédagogiques?/g, ''], [/casse-croûte/g, 'magasin'],
  [/Cours et camps : réservez 48 heures à l’avance/g, 'Réservez la veille les fins de semaine d’été'], [/\bles cours\b/g, 'les visites guidées'], [/\bdes cours\b/g, 'des visites guidées'], [/\bLes cours\b/g, 'Les visites guidées'],
  [/\bun cours\b/g, 'une visite guidée'], [/\bcours\b/g, 'visites guidées'], [/\bligues\b/g, 'groupes'], [/\bligue\b/g, 'groupe'], [/\btournois\b/g, 'compétitions'], [/\btournoi\b/g, 'compétition'], [/\bmoniteurs\b/g, 'guides'],
];
// The outdoor kinds that really give lessons (a ski hill's ski school, paddleboard lessons, riding lessons, a skydiving
// course): their answers keep the word.
const LESSON_KINDS = LESSON_KINDS_;
const LESSON_RE = /lesson|clinic|instructor|cours|moniteur|guidée|guided tour/i;
const swap = (s, kind) => (typeof s === 'string' ? SWAPS.filter(([a]) => !(LESSON_KINDS.includes(kind) && LESSON_RE.test(a.source))).reduce((acc, [a, b]) => acc.replace(a, b), s) : s);
function foreignIn(text, kind) { const m = FOREIGN.filter((re) => !(LESSON_KINDS.includes(kind) && LESSON_RE.test(re.source))).find((re) => re.test(text)); return m ? (text.match(m) || [''])[0] : ''; }
// apply(cfg, kind): cfg is the Help widget's config (server.js ownerHelpWidgetHtml): its topics are swapped for the outdoor
// set, and cfg.first carries the intent rules (read first by the matcher). The sport intent rules (FIT, SCREENS) are
// golf and sport intents: an outdoor listing's are its own.
function apply(cfg, kind, frSpacing) {
  const own = topicsFor(kind).map((t) => (frSpacing ? { ...t, aFr: frSpacing.html(t.aFr), qFr: frSpacing.text(t.qFr) } : t));
  const ownIds = new Set(own.map((t) => t.id));
  const kept = (cfg.topics || []).filter((t) => !DROP.has(t.id) && !ownIds.has(t.id) && !/^(hh-|happy)/.test(t.id)).map((t) => ({ ...t, q: swap(t.q, kind), qFr: swap(t.qFr, kind), a: swap(t.a, kind), aFr: swap(t.aFr, kind),
    over: (t.over || []).filter((x2) => !DROP.has(x2)), noRelated: (t.noRelated || []).filter((x2) => !DROP.has(x2)) }));
  // "My kind isn't on the list": the outdoor kinds, never the sport ones.
  const KO = ['a campground or RV park, rentals (boats, boards), a water park, an adventure park or zipline, air sports, a stable, a farm, a nature centre, a market or a ski hill', 'un camping ou un parc de VR, de la location (bateaux, planches), un parc aquatique, un parc d’aventure ou une tyrolienne, des sports aériens, une écurie, une ferme, un centre de la nature, un marché ou une station de ski'];
  const kindsOther = [`<p>Pick the closest on <strong>What kind of place</strong>, your main one first (up to 3): ${KO[0]}. Nothing fits? Tap <strong>Something else</strong> and say what you do in your story.</p>`,
    `<p>Choisissez le plus proche à <strong>Quel genre d’endroit</strong>, le principal d’abord (jusqu’à 3) : ${KO[1]}. Rien ne convient? Touchez <strong>Autre chose</strong> et dites ce que vous faites dans votre histoire.</p>`];
  // The price list's own "how do I add my prices" is the outdoor upload answer (never "dishes" or "My menu is on my website").
  const up = own.find((t) => t.id === 'outdoor-price-upload');
  cfg.topics = own.concat(kept.map((t) => (t.id === 'menu-add' && up ? { ...t, q: 'How do I add all my prices?', qFr: frSpacing ? frSpacing.text('Comment ajouter tous mes prix?') : 'Comment ajouter tous mes prix?', a: up.a, aFr: up.aFr } : t.id === 'sport-kinds-other' ? { ...t, a: kindsOther[0], aFr: frSpacing ? frSpacing.html(kindsOther[1]) : kindsOther[1] } : t)));
  const have = new Set(cfg.topics.map((t) => t.id));
  cfg.first = firstFor(kind, have);
  cfg.fit = [];
  cfg.screens = {};
  cfg.start = (cfg.start || []).filter((id) => have.has(id));
  return cfg;
}

module.exports = { LESSON_KINDS, KINDS, isOutdoorKind, X, WORDS, TOPICS, FIRST, DROP, FOREIGN, SWAPS, swap, foreignIn, topicsFor, firstFor, apply };
