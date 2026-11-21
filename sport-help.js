'use strict';
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Sport test 5 (2026-11-20; Jen, guest services at the Big White Ski & Board School: Help answered 11 of her 42 questions
// well, and the lessons, weather and suggestion titles spoke golf). Every test before patched one owner's log; this file
// is Help for EVERY sport kind at once: each kind's own example words for every answer (WORDS), the answers owners of every
// kind needed and no answer covered (TOPICS: where people meet, staff languages, adaptive programs, refunds, what to bring,
// peak dates, what's included, packages, one listing for two things, "will my page say closed", how far ahead to book,
// same-day, a shared resort account, a short holiday, how people find you, ages on a price line), and the kind words for
// the shared answers and their titles (kindHelp: the titles are also the suggestion buttons under an answer).
// The questions: tests/sport-help-questions.js (about 40 a kind, a third in French), run by tests/sport-help-matrix.test.js.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SK = require('./sport-kinds.js');

// WORDS[field][kind] = [en, fr]; '_' is every other kind.
const WORDS = {
  meet: {
    _: ['Check in at the front desk 10 minutes early', 'Présentez-vous à l’accueil 10 minutes à l’avance'],
    golf: ['Check in at the pro shop 15 minutes before your tee time', 'Présentez-vous à la boutique du pro 15 minutes avant votre départ'],
    simgolf: ['Check in at the front desk; your bay is ready at your time', 'Présentez-vous à l’accueil; votre baie est prête à l’heure prévue'],
    range: ['Pay at the counter by the entrance', 'Payez au comptoir à l’entrée'],
    skischool: ['Meet at the Snow School desk 15 minutes before your lesson', 'Rendez-vous au comptoir de l’école de ski 15 minutes avant votre cours'],
    rink: ['Enter by the main doors; skate rentals in the lobby', 'Entrez par les portes principales; location de patins dans le hall'],
    swim: ['Enter by the main gate; change rooms on the left', 'Entrez par la grille principale; vestiaires à gauche'],
    skatepark: ['The park is behind the rec centre, by the parking lot', 'Le parc est derrière le centre récréatif, près du stationnement'],
    bike: ['Riders sign in at the start hut', 'Les cyclistes s’inscrivent à la cabane de départ'],
    courts: ['The courts are behind the community centre', 'Les terrains sont derrière le centre communautaire'],
    discgolf: ['The first basket is by the parking lot', 'Le premier panier est près du stationnement'],
    sportsctr: ['Sign in at the front desk', 'Inscrivez-vous à l’accueil'],
  },
  lang: {
    _: ['Staff speak English and French', 'Personnel bilingue (anglais et français)'],
    golf: ['Lessons in English or French with our pro', 'Cours en anglais ou en français avec notre pro'], simgolf: ['Lessons in English or French', 'Cours en anglais ou en français'],
    range: ['Lessons in English or French', 'Cours en anglais ou en français'], skischool: ['French-speaking instructors on request', 'Moniteurs francophones sur demande'],
    rink: ['Skating lessons in English and French', 'Cours de patin en anglais et en français'], swim: ['Swim lessons in English and French', 'Cours de natation en anglais et en français'],
    courts: ['Lessons in English or French', 'Cours en anglais ou en français'],
  },
  adaptPrice: {
    _: ['Adaptive session $15', 'Séance adaptée 15 $'], golf: ['Adaptive golf lesson $60', 'Cours de golf adapté 60 $'], simgolf: ['Adaptive lesson, 1 hour $60', 'Cours adapté, 1 heure 60 $'],
    skischool: ['Adaptive lesson, 2 hours $129', 'Cours adapté, 2 heures 129 $'], swim: ['Adaptive swim lessons $60', 'Cours de natation adaptés 60 $'],
    rink: ['Sledge hockey drop-in $5', 'Hockey sur luge libre 5 $'], bike: ['Adaptive bike session $20', 'Séance de vélo adapté 20 $'], courts: ['Wheelchair tennis drop-in $5', 'Tennis en fauteuil libre 5 $'],
  },
  adapt: {
    _: ['Adaptive programs on request', 'Programmes adaptés sur demande'], skischool: ['Adaptive lessons: book 72 hours ahead', 'Cours adaptés : réservez 72 heures à l’avance'],
    rink: ['Sit skates and sledges on request', 'Patins adaptés et luges sur demande'], golf: ['Adaptive golf carts on request', 'Voiturettes adaptées sur demande'],
    swim: ['Pool lift and adaptive swim lessons', 'Lève-personne et cours de natation adaptés'], bike: ['Adaptive bikes on request', 'Vélos adaptés sur demande'],
  },
  refund: {
    _: ['Cancel 24 hours ahead for a full refund', 'Annulez 24 heures à l’avance pour un remboursement complet'],
    skischool: ['Cancel 48 hours ahead for full credit', 'Annulez 48 heures à l’avance pour un crédit complet'], golf: ['Cancel tee times 24 hours ahead', 'Annulez votre départ 24 heures à l’avance'],
    skatepark: ['Camps: full refund up to a week before', 'Camps : remboursement complet jusqu’à une semaine avant'], discgolf: ['Tournaments: refunds up to a week before', 'Tournois : remboursement jusqu’à une semaine avant'],
  },
  refundWx: {
    _: ['rain checks if we close for weather', 'bons de pluie si nous fermons à cause de la météo'],
    skischool: ['lessons run in any weather; credit if the lifts close', 'les cours ont lieu beau temps, mauvais temps; crédit si les remontées ferment'],
    golf: ['rain checks if you play 9 holes or less', 'bons de pluie si vous jouez 9 trous ou moins'],
    simgolf: ['bookings we cancel are refunded', 'les réservations que nous annulons sont remboursées'], rink: ['programs we cancel are refunded', 'les programmes que nous annulons sont remboursés'],
    sportsctr: ['programs we cancel are refunded', 'les programmes que nous annulons sont remboursés'],
  },
  bring: {
    _: ['Comfortable clothes and closed-toe shoes', 'Vêtements confortables et souliers fermés'],
    skischool: ['Dress for the weather: helmet, goggles and mitts', 'Habillez-vous selon la météo : casque, lunettes et mitaines'],
    golf: ['Soft spikes only; bring your own clubs or rent ours', 'Crampons souples seulement; apportez vos bâtons ou louez les nôtres'],
    simgolf: ['Bring your own clubs or borrow ours', 'Apportez vos bâtons ou empruntez les nôtres'], range: ['Clubs to borrow; bring your own if you like', 'Bâtons prêtés; apportez les vôtres si vous voulez'],
    rink: ['Helmets for kids; skates to rent', 'Casque pour les enfants; patins à louer'], swim: ['Bring a swimsuit, a towel and a lock', 'Apportez un maillot, une serviette et un cadenas'],
    skatepark: ['Helmets strongly recommended', 'Casque fortement conseillé'], bike: ['Helmets and gloves required', 'Casque et gants obligatoires'],
    courts: ['Bring your own racquet and balls', 'Apportez votre raquette et vos balles'], discgolf: ['Bring your own discs and water', 'Apportez vos disques et de l’eau'],
    sportsctr: ['Clean indoor shoes, please', 'Souliers d’intérieur propres, s’il vous plaît'],
  },
  include: {
    _: ['Admission: equipment included', 'Entrée : équipement compris'], golf: ['18 holes with a power cart $89', '18 trous avec voiturette 89 $'],
    skischool: ['Discover package: lesson, rentals and a beginner lift ticket', 'Forfait Découverte : cours, location et billet de remontée débutant'],
    simgolf: ['One bay, one hour: clubs and balls included', 'Une baie, une heure : bâtons et balles compris'], range: ['Large bucket: clubs to borrow', 'Grand seau : bâtons prêtés'],
    rink: ['Public skate: skate rental $5 extra', 'Patinage libre : location de patins 5 $ en plus'], swim: ['Adult swim: change rooms and lockers included', 'Baignade adulte : vestiaires et casiers compris'],
    skatepark: ['Camp week: helmet and board included', 'Semaine de camp : casque et planche compris'], bike: ['Practice night: coaching included', 'Soirée d’entraînement : entraînement compris'],
    courts: ['Court time: balls included', 'Temps de terrain : balles comprises'], discgolf: ['Disc rental: 3 discs', 'Location de disques : 3 disques'],
    sportsctr: ['Drop-in: equipment included', 'À la séance : équipement compris'],
  },
  notIncluded: {
    _: ['Rentals not included', 'Location non comprise'], skischool: ['Lift ticket not included', 'Billet de remontée non compris'], golf: ['Power carts not included', 'Voiturettes non comprises'], rink: ['Skate rental not included', 'Location de patins non comprise'],
    swim: ['Towels not included', 'Serviettes non comprises'], courts: ['Racquets not included', 'Raquettes non comprises'], discgolf: ['Discs not included', 'Disques non compris'],
    simgolf: ['Food and drinks not included', 'Nourriture et boissons non comprises'],
  },
  pkg: {
    _: ['Intro package: lesson and rentals $40', 'Forfait initiation : cours et location 40 $'],
    skischool: ['Discover package: lesson, rentals and a beginner lift ticket $219', 'Forfait Découverte : cours, location et billet de remontée débutant 219 $'],
    golf: ['Stay and play: 18 holes and lunch $99', 'Golf et repas : 18 trous et dîner 99 $'], simgolf: ['Birthday package: 2 hours and pizza $250', 'Forfait anniversaire : 2 heures et pizza 250 $'],
    range: ['Family pack: 2 buckets and 2 rounds of mini golf $40', 'Forfait famille : 2 seaux et 2 parties de mini-golf 40 $'],
    rink: ['Party package: ice time and a room $200', 'Forfait fête : temps de glace et une salle 200 $'], swim: ['Family swim: 2 adults and 2 kids $15', 'Bain familial : 2 adultes et 2 enfants 15 $'],
    skatepark: ['Camp week: 5 mornings $150', 'Semaine de camp : 5 matins 150 $'], bike: ['Intro package: clinic and bike rental $45', 'Forfait initiation : clinique et location de vélo 45 $'],
    courts: ['Intro package: 3 lessons $90', 'Forfait initiation : 3 cours 90 $'], discgolf: ['Starter set: 3 discs $40', 'Ensemble de départ : 3 disques 40 $'],
    sportsctr: ['Birthday package: gym and a room $180', 'Forfait anniversaire : gymnase et une salle 180 $'],
  },
  both: {
    _: ['everything you offer', 'tout ce que vous offrez'], skischool: ['ski and snowboard lessons', 'les cours de ski et de planche'], courts: ['tennis and pickleball', 'le tennis et le pickleball'],
    range: ['the range and the mini golf', 'le champ de pratique et le mini-golf'], bike: ['the BMX track and the bike park', 'la piste de BMX et le parc de vélo'],
    rink: ['public skating and hockey', 'le patinage libre et le hockey'], swim: ['the pool and the spray park', 'la piscine et les jeux d’eau'],
    golf: ['the course and the practice area', 'le parcours et l’aire de pratique'], simgolf: ['the bays and the lounge', 'les baies et le salon'],
    skatepark: ['skateboards, scooters and bikes', 'la planche, la trottinette et le vélo'], discgolf: ['both courses', 'les deux parcours'], sportsctr: ['the gym and the rooms', 'le gymnase et les salles'],
  },
  ahead: {
    _: ['Lessons and camps: book 48 hours ahead', 'Cours et camps : réservez 48 heures à l’avance'],
    skischool: ['Kids’ programs: book 48 hours ahead', 'Programmes pour enfants : réservez 48 heures à l’avance'], golf: ['Tee times open 7 days ahead', 'Les départs s’ouvrent 7 jours à l’avance'],
    simgolf: ['Book bays 24 hours ahead for weekends', 'Réservez les baies 24 heures à l’avance la fin de semaine'], courts: ['Courts can be booked 3 days ahead', 'Les terrains se réservent 3 jours à l’avance'],
    rink: ['Ice rentals: book a week ahead', 'Location de glace : réservez une semaine à l’avance'], swim: ['Swim lessons: register a week ahead', 'Cours de natation : inscrivez-vous une semaine à l’avance'],
  },
  same: {
    _: ['Drop in when there’s room; book ahead for weekends', 'Sans réservation s’il y a de la place; réservez la fin de semaine'],
    skischool: ['Same-day lessons at the Snow School desk when there’s room', 'Cours le jour même au comptoir de l’école quand il reste de la place'],
    golf: ['Walk-ons welcome when there’s room', 'Départs sans réservation s’il y a de la place'], simgolf: ['Walk-ins welcome when a bay is free', 'Sans réservation si une baie est libre'],
    courts: ['First come, first served when a court is free', 'Premier arrivé, premier servi si un terrain est libre'],
  },
  holiday: {
    _: ['Christmas Eve: closes at 2 PM', 'Veille de Noël : ferme à 14 h'], skischool: ['Christmas Eve: the desk closes at 2 PM', 'Veille de Noël : le comptoir ferme à 14 h'],
    golf: ['Canada Day: last tee time 4 PM', 'Fête du Canada : dernier départ à 16 h'], range: ['Canada Day: open 10 AM to 4 PM', 'Fête du Canada : ouvert de 10 h à 16 h'],
    swim: ['Canada Day: open 10 AM to 4 PM', 'Fête du Canada : ouvert de 10 h à 16 h'], skatepark: ['Canada Day: lights off at 9 PM', 'Fête du Canada : éclairage éteint à 21 h'],
    bike: ['Canada Day: open 10 AM to 4 PM', 'Fête du Canada : ouvert de 10 h à 16 h'], discgolf: ['Canada Day: open 10 AM to 4 PM', 'Fête du Canada : ouvert de 10 h à 16 h'],
    courts: ['Canada Day: open 8 AM to 4 PM', 'Fête du Canada : ouvert de 8 h à 16 h'],
  },
  lineAges: {
    _: ['Kids’ camp (ages 6 to 12) $150', 'Camp pour enfants (6 à 12 ans) 150 $'], skischool: ['Kids Club (ages 5 to 12) $259', 'Club des jeunes (5 à 12 ans) 259 $'],
    rink: ['Learn to skate (ages 4 to 6) $90', 'Apprendre à patiner (4 à 6 ans) 90 $'], swim: ['Swim lessons (ages 3 to 5) $60', 'Cours de natation (3 à 5 ans) 60 $'],
    golf: ['Junior camp (ages 8 to 14) $295', 'Camp junior (8 à 14 ans) 295 $'], courts: ['Junior tennis (ages 6 to 10) $80', 'Tennis junior (6 à 10 ans) 80 $'],
    bike: ['Strider class (ages 2 to 5) $10', 'Cours de draisienne (2 à 5 ans) 10 $'], range: ['Junior lesson (ages 7 to 12) $30', 'Cours junior (7 à 12 ans) 30 $'],
  },
  lesson: {
    _: ['Beginner lesson $30', 'Cours pour débutants 30 $'], simgolf: ['Lesson with our pro, 1 hour $80', 'Cours avec notre pro, 1 heure 80 $'], range: ['Group lesson, 1 hour $40', 'Cours de groupe, 1 heure 40 $'],
    rink: ['Learn to skate, 8 weeks $120', 'Apprendre à patiner, 8 semaines 120 $'], swim: ['Swim lessons, 8 weeks $65', 'Cours de natation, 8 semaines 65 $'],
    skatepark: ['Beginner lesson $25', 'Cours pour débutants 25 $'], bike: ['Learn-to-ride clinic $20', 'Clinique d’initiation 20 $'], courts: ['Beginner clinic, 4 weeks $60', 'Clinique pour débutants, 4 semaines 60 $'],
    discgolf: ['Learn-to-play clinic $15', 'Clinique d’initiation 15 $'], sportsctr: ['Youth basketball camp $150', 'Camp de basketball pour les jeunes 150 $'],
  },
  camp: {
    _: ['Summer camps for ages 6 to 12', 'Camps d’été pour les 6 à 12 ans'], skischool: ['Christmas camp for ages 5 to 12, Dec 21 to 26', 'Camp de Noël pour les 5 à 12 ans, du 21 au 26 déc.'],
    golf: ['Junior golf camps for ages 8 to 14 in July', 'Camps de golf juniors pour les 8 à 14 ans en juillet'], rink: ['Spring break hockey camp for ages 6 to 12', 'Camp de hockey à la relâche pour les 6 à 12 ans'],
    swim: ['Summer swim camps for ages 6 to 12', 'Camps de natation d’été pour les 6 à 12 ans'], skatepark: ['Summer skate camps for ages 7 to 14', 'Camps de planche d’été pour les 7 à 14 ans'],
    bike: ['Summer BMX camps for ages 6 to 12', 'Camps de BMX d’été pour les 6 à 12 ans'], courts: ['Summer tennis camps for ages 8 to 14', 'Camps de tennis d’été pour les 8 à 14 ans'],
    sportsctr: ['Summer sports camps for ages 6 to 12', 'Camps sportifs d’été pour les 6 à 12 ans'], range: ['Junior golf camps for ages 7 to 12', 'Camps de golf juniors pour les 7 à 12 ans'],
  },
  two: {
    _: ['Adult 15, Kids 10', 'Adulte 15, Enfants 10'], skischool: ['Group lesson 129, Private lesson 189', 'Cours de groupe 129, Cours privé 189'], golf: ['9 holes 45, 18 holes 79', '9 trous 45, 18 trous 79'],
    simgolf: ['Off-peak 40, Peak 60', 'Hors pointe 40, Pointe 60'], range: ['Small bucket 8, Large bucket 15', 'Petit seau 8, Grand seau 15'], rink: ['Adult 5, Kids 3', 'Adulte 5, Enfants 3'],
    swim: ['Adult 5, Kids 3', 'Adulte 5, Enfants 3'], skatepark: ['Beginner lesson 25, Camp week 150', 'Cours pour débutants 25, Semaine de camp 150'], bike: ['Practice night 10, Race night 15', 'Soirée d’entraînement 10, Soirée de course 15'],
    courts: ['Drop-in 5, Lesson 30', 'Jeu libre 5, Cours 30'], discgolf: ['Disc rental 5, League night 10', 'Location de disques 5, Soirée de ligue 10'], sportsctr: ['Adult drop-in 6, Youth 3', 'Adulte à la séance 6, Jeunes 3'],
  },
  twoSection: {
    _: ['Prices', 'Tarifs'], skischool: ['Private lessons', 'Cours privés'], golf: ['Green fees', 'Droits de jeu'], simgolf: ['Bays', 'Baies'], range: ['Range', 'Champ de pratique'], rink: ['Public skating', 'Patinage libre'],
    swim: ['Swims', 'Baignades'], skatepark: ['Lessons', 'Cours'], bike: ['Riding', 'Vélo'], courts: ['Court time', 'Terrains'], discgolf: ['Discs', 'Disques'], sportsctr: ['Drop-in', 'À la séance'],
  },
  twoFrom: {
    _: ['Kids from $10', 'Enfants à partir de 10 $'], skischool: ['Private lessons from $189', 'Cours privés à partir de 189 $'], golf: ['Green fees from $45', 'Droits de jeu à partir de 45 $'],
    simgolf: ['Bays from $40', 'Baies à partir de 40 $'], range: ['Buckets from $8', 'Seaux à partir de 8 $'], rink: ['Kids from $3', 'Enfants à partir de 3 $'], swim: ['Kids from $3', 'Enfants à partir de 3 $'],
    courts: ['Court time from $5', 'Terrain à partir de 5 $'], sportsctr: ['Youth from $3', 'Jeunes à partir de 3 $'],
  },
  rentQ: {
    _: ['Equipment rentals', 'Location d’équipement'], golf: ['Club, cart and pull-cart rentals', 'Location de bâtons, de voiturettes et de chariots'], simgolf: ['Club rentals', 'Location de bâtons'],
    range: ['Club rentals', 'Location de bâtons'], skischool: ['Ski and snowboard rentals', 'Location de skis et de planches'], rink: ['Skate rentals', 'Location de patins'],
    swim: ['Lockers and rentals', 'Casiers et location'], skatepark: ['Board and helmet rentals', 'Location de planches et de casques'], bike: ['Bike rentals', 'Location de vélos'],
    courts: ['Racquet and paddle rentals', 'Location de raquettes'], discgolf: ['Disc rentals', 'Location de disques'],
  },
  bookQ: {
    _: ['Online booking: where do people book?', 'Réservation en ligne : où réserve-t-on?'], golf: ['Tee times: where do people book?', 'Départs : où réserve-t-on?'],
    simgolf: ['Bay bookings: where do people book?', 'Baies : où réserve-t-on?'], courts: ['Court bookings: where do people book?', 'Terrains : où réserve-t-on?'],
    skischool: ['Lessons: where do people book?', 'Cours : où réserve-t-on?'], range: ['Lessons and bays: where do people book?', 'Cours et baies : où réserve-t-on?'],
    rink: ['Ice time and lessons: where do people book?', 'Temps de glace et cours : où réserve-t-on?'],
  },
  ratesQ: {
    _: ['Kids’, junior and senior prices, passes and memberships', 'Prix enfants, juniors et aînés, cartes et abonnements'],
    golf: ['Twilight, junior and senior rates, memberships and passes', 'Tarifs crépuscule, juniors et aînés, abonnements et cartes'],
    simgolf: ['Peak and junior rates, memberships and passes', 'Tarifs de pointe et juniors, abonnements et cartes'],
    range: ['Junior and senior rates, range cards and passes', 'Tarifs juniors et aînés, cartes de practice et abonnements'],
    skischool: ['Kids’ programs, private lessons and season passes', 'Programmes pour enfants, cours privés et passes de saison'],
  },
  moves: {
    _: ['with the weather', 'de la météo'], golf: ['with the greens', 'de l’état des verts'], skischool: ['with the snow', 'de la neige'], rink: ['when the ice goes in', 'de la glace'],
    swim: ['with the weather', 'de la météo'], discgolf: ['with the snow', 'de la neige'],
  },
  wxQ: {
    _: ['We close for bad weather (rain, lightning, smoke)', 'Nous fermons par mauvais temps (pluie, orages, fumée)'],
    golf: ['We close for bad weather (rain, frost, lightning)', 'Nous fermons par mauvais temps (pluie, gel, orages)'],
    skischool: ['Lessons in bad weather, wind or when the lifts close', 'Les cours par mauvais temps, grand vent ou quand les remontées ferment'],
    simgolf: ['Bad weather or snow days', 'Mauvais temps ou jours de tempête'], rink: ['Bad weather or snow days', 'Mauvais temps ou jours de tempête'],
    sportsctr: ['Bad weather or snow days', 'Mauvais temps ou jours de tempête'], sportother: ['We close for bad weather', 'Nous fermons par mauvais temps'],
  },
  wx1: {
    _: ['Closed when it rains', 'Fermé quand il pleut'], golf: ['Frost delays in spring and fall: check our website', 'Retards dus au gel au printemps et à l’automne : voyez notre site'],
    skischool: ['Lessons run in any weather; credit if the lifts close', 'Les cours ont lieu beau temps, mauvais temps; crédit si les remontées ferment'],
    range: ['Closed in lightning; open in light rain', 'Fermé pendant les orages; ouvert sous une pluie légère'], swim: ['The pool closes for thunder and lightning', 'La piscine ferme pendant les orages'],
    skatepark: ['Closed when it’s wet', 'Fermé quand c’est mouillé'], bike: ['Track closed when it’s wet', 'Piste fermée quand elle est mouillée'],
    courts: ['Courts close when they’re wet', 'Les terrains ferment quand ils sont mouillés'], discgolf: ['Open in any weather; closed in deep snow', 'Ouvert par tous les temps; fermé quand il y a beaucoup de neige'],
    simgolf: ['Open rain or shine', 'Ouvert beau temps, mauvais temps'], rink: ['Outdoor ice closes when it’s too warm', 'La glace extérieure ferme quand il fait trop doux'],
    sportsctr: ['Programs cancelled on snow days: check our website', 'Programmes annulés les jours de tempête : voyez notre site Web'],
  },
  wx2: {
    _: ['Closed for wildfire smoke', 'Fermé en cas de fumée de feux de forêt'], golf: ['Closed when it rains', 'Fermé quand il pleut'], skischool: ['Dress for the weather', 'Habillez-vous selon la météo'],
    simgolf: ['Closed on snow days: check our website', 'Fermé les jours de tempête : voyez notre site Web'], rink: ['Closed on snow days: check our website', 'Fermé les jours de tempête : voyez notre site Web'],
    sportsctr: ['Closed on snow days: check our website', 'Fermé les jours de tempête : voyez notre site Web'],
  },
  themeQ: {
    _: ['family days', 'journées familiales'], golf: ['men’s and ladies’ nights', 'soirées des hommes et des dames'], simgolf: ['league nights', 'soirées de ligue'], range: ['glow mini golf', 'mini-golf fluo'],
    skischool: ['night skiing', 'ski de soirée'], rink: ['family skates', 'patinages familiaux'], swim: ['family swims', 'bains familiaux'], skatepark: ['jam nights', 'soirées jam'],
    bike: ['race nights', 'soirées de course'], courts: ['drop-in nights', 'soirées de jeu libre'], discgolf: ['league nights', 'soirées de ligue'], sportsctr: ['drop-in basketball', 'basketball libre'],
  },
  swimQ: {
    _: ['Our session times change by day', 'Nos heures de séance changent selon le jour'], rink: ['Our public skate times change by day', 'Nos heures de patinage libre changent selon le jour'],
    swim: ['Our public swim times change by day', 'Nos heures de bain libre changent selon le jour'], sportsctr: ['Our drop-in times change by day', 'Nos heures de jeu libre changent selon le jour'],
    skischool: ['Lesson times and desk hours', 'Heures des cours et du comptoir'],
  },
  required: {
    _: ['Helmet rental (required) $5', 'Location de casque (obligatoire) 5 $'], skischool: ['Helmet rental (required for kids) $10', 'Location de casque (obligatoire pour les enfants) 10 $'],
    rink: ['Helmet rental (required under 12) $3', 'Location de casque (obligatoire avant 12 ans) 3 $'], swim: ['Swim diaper (required under 3) $2', 'Couche de baignade (obligatoire avant 3 ans) 2 $'],
    golf: ['Soft spikes (required) $20', 'Crampons souples (obligatoires) 20 $'], simgolf: ['Golf glove $15', 'Gant de golf 15 $'], range: ['Golf glove $15', 'Gant de golf 15 $'],
    courts: ['Court shoes (required indoors) $40', 'Souliers de court (obligatoires à l’intérieur) 40 $'], sportsctr: ['Lock for a locker $5', 'Cadenas pour un casier 5 $'], discgolf: ['Disc rental $5', 'Location de disques 5 $'],
  },
  pro: {
    _: ['Private coaching on request: ask at the desk', 'Entraînement privé sur demande : demandez à l’accueil'],
  },
};
const word = (field, kind) => { const f = WORDS[field] || {}; return f[kind] || f._ || ['', '']; };
const WINTER = (kind) => (SK.K[kind] || {}).season === 'winter';
const SUMMER = (kind) => (SK.K[kind] || {}).season === 'summer';

// The answers no answer covered (sport test 5), every one in the kind's own words ({TOKENS}: tokens()).
const TOPICS = [
  { id: 'sport-meeting-place', pages: ['setup', 'edit'], over: ['indoor-groups', 'indoor-good-to-know', 'sport-lessons', 'name-address', 'sport-kinds-other', 'signin', 'cost', 'sport-payment', 'sport-adaptive', 'hours', 'sport-tournaments', 'indoor-camps', 'sport-members', 'parking-free', 'parking-paid', 'setup-split-hours', 'sport-one-listing', 'sport-tee-times', 'event-add'],
    q: 'Where people meet or check in (there’s no box for it)', qFr: 'Où les gens se retrouvent ou s’enregistrent (pas de case pour ça)',
    allOf: [['meet', 'meeting', 'check in', 'arriv', 'rendez', 'rencontr', 'retrouv', 'rassembl'], ['where', 'place', 'point', 'spot', 'desk', 'sign', 'box', 'lieu', 'endroit', 'comptoir', 'early', 'before']],
    keys: ['where do people meet', 'where people meet', 'where to meet', 'meeting place', 'meeting point', 'meeting spot', 'meet for lessons', 'where we meet', 'where do we meet', 'where do people check in', 'where to check in', 'check in at', 'where do they go when they arrive', 'where do people go when they get here', 'when they arrive', 'meet at the', 'meet 15 minutes early', 'arrive 15 minutes early', 'where is the desk', 'theres no box for it', 'no box for where', 'where do kids get dropped off', 'drop off spot', 'which gate', 'which door', 'where do people come in', 'where do people sign in', 'where do riders sign in', 'riders sign in', 'where do people start', 'first basket', 'first tee is by', 'where are the courts', 'where is the park', 'where is it', 'its behind', 'behind the', 'when they get here', 'where do people pay', 'where do people go'],
    keysFr: ['point de rencontre', 'lieu de rencontre', 'ou se rencontrer', 'ou les gens se rencontrent', 'ou se retrouver', 'ou se rendre', 'rendez vous au', 'ou on se rejoint', 'pas de case pour le lieu', 'se presentent', 'les gens se presentent', 'en arrivant', 'par quelle porte', 'quelle porte', 'ou commencent', 'premier panier', 'ou s inscrire', 's inscrivent', 'ou sont les terrains', 'ou est le parc', 'derriere le', 'ou les gens paient'],
    a: '<p>There’s no box for it: say it in <strong>Good to know</strong>, in one line, like <em>{MEET_EX}</em>. It shows under “Your visit” on your page, and Build My Trip reads it.{MEET_CHIP_EN} The map sends people to your address: is that the wrong spot? Tap <strong>Message us</strong>.</p>',
    aFr: '<p>Il n’y a pas de case pour ça : dites-le dans <strong>Bon à savoir</strong>, en une ligne, comme <em>{MEET_EX}</em>. Ça paraît sous « Planifiez votre visite » sur votre page, et Planifier mon voyage le lit.{MEET_CHIP_FR} La carte envoie les gens à votre adresse : ce n’est pas le bon endroit? Touchez <strong>Écrivez-nous</strong>.</p>' },
  { id: 'sport-staff-language', pages: ['setup', 'edit'], over: ['french', 'indoor-french', 'staff', 'not-owner', 'indoor-good-to-know', 'description', 'sport-lessons', 'photo-add', 'indoor-access'],
    q: 'Our staff or instructors speak French (or other languages)', qFr: 'Notre personnel ou nos moniteurs parlent français (ou d’autres langues)',
    allOf: [['speak', 'speaks', 'speaking', 'bilingual', 'language', 'langu', 'parlent', 'parle', 'francophone', 'anglophone', 'bilingue'], ['instructor', 'staff', 'coach', 'pro', 'pros', 'moniteur', 'personnel', 'entraineur', 'guide', 'we', 'nous', 'lesson', 'cours', 'francais', 'french', 'english', 'anglais', 'spanish', 'german', 'teacher', 'lifeguard', 'team', 'equipe']],
    allOf2: [['lessons', 'lesson', 'cours', 'instruction'], ['in english', 'in french', 'en anglais', 'en francais', 'english only', 'french only']],
    keys: ['french speaking', 'french-speaking', 'french speaking instructors', 'speak french', 'speaks french', 'instructors speak', 'staff speak', 'our pros speak', 'bilingual', 'bilingual staff', 'languages', 'other languages', 'spanish speaking', 'german speaking', 'lessons are in english', 'lessons in french', 'lessons in english', 'instructors who speak', 'chip for french speaking'],
    keysFr: ['parlent francais', 'parle francais', 'moniteurs francophones', 'nos moniteurs parlent', 'personnel bilingue', 'bilingue', 'langues parlees', 'cours en francais', 'cours en anglais'],
    a: '<p>Say it in <strong>Good to know</strong>, in one line, like <em>{LANG_EX}</em>, or in a sentence of your story. It shows on your page, in English and in French. There’s no tile for it: type it in your own words.</p>',
    aFr: '<p>Dites-le dans <strong>Bon à savoir</strong>, en une ligne, comme <em>{LANG_EX}</em>, ou dans une phrase de votre histoire. Ça paraît sur votre page, en anglais et en français. Il n’y a pas de case pour ça : écrivez-le dans vos mots.</p>' },
  { id: 'sport-adaptive', pages: ['setup', 'edit', 'menu'], over: ['indoor-access', 'sport-lessons', 'indoor-age', 'features', 'menu-add', 'sport-rate-lines', 'indoor-good-to-know', 'indoor-price-varies', 'indoor-extras', 'sport-book-ahead-hours'],
    q: 'Adaptive programs or lessons (for people with disabilities)', qFr: 'Programmes ou cours adaptés (pour les personnes handicapées)',
    keys: ['adaptive', 'adaptive lessons', 'adaptive lesson', 'adaptive program', 'adaptive programs', 'adaptive skiing', 'adaptive swim', 'adaptive golf', 'people with disabilities', 'disabilities', 'disability', 'disabled', 'sit ski', 'sit skis', 'sledge hockey', 'sledge', 'special needs', 'inclusive programs', 'inclusive lessons', 'accessible lessons', 'autism', 'visually impaired', 'blind skiers'],
    keysFr: ['adapte', 'adaptes', 'adaptee', 'adaptees', 'cours adaptes', 'cours adapte', 'programmes adaptes', 'handicap', 'handicapees', 'personnes handicapees', 'besoins particuliers', 'ski adapte', 'luge'],
    a: '<p>Add it as a line in <strong>Your prices</strong>, like <em>{ADAPT_PRICE}</em>, and say it in one line in <strong>Good to know</strong> or your story, like <em>{ADAPT_EX}</em>. Search and Build My Trip read “adaptive”, so people who ask for it find you. Step-free access to your building? Tick <strong>Wheelchair accessible</strong> in Who can come.</p>',
    aFr: '<p>Ajoutez-le en une ligne dans <strong>Vos tarifs</strong>, comme <em>{ADAPT_PRICE}</em>, et dites-le en une ligne dans <strong>Bon à savoir</strong> ou dans votre histoire, comme <em>{ADAPT_EX}</em>. La recherche et Planifier mon voyage lisent « adapté » : les gens qui le demandent vous trouvent. On entre chez vous sans marches? Cochez <strong>Accessible en fauteuil roulant</strong> dans Qui peut venir.</p>' },
  { id: 'sport-refunds', pages: ['setup', 'edit', 'menu'], over: ['sport-weather', 'indoor-gift', 'indoor-good-to-know', 'event-change', 'sport-golf-details', 'sport-lessons', 'sport-tournaments', 'indoor-camps', 'sport-book-ahead-hours', 'indoor-booking', 'cost', 'indoor-cost', 'remove', 'sport-tee-times', 'menu-add', 'sport-payment'],
    q: 'Our cancellation or refund policy', qFr: 'Notre politique d’annulation ou de remboursement',
    allOf: [['refund', 'rembours', 'raincheck']], allOf2: [['cancel', 'annul'], ['policy', 'hour', 'hours', 'hr', 'hrs', 'ahead', 'full', 'notice', 'politique', 'heure', 'avance', 'complet', 'credit']],
    keys: ['refund', 'refunds', 'refund policy', 'our refund policy', 'cancellation', 'cancellation policy', 'cancel policy', 'full credit', 'cancel for full credit', 'rain check', 'rain checks', 'raincheck', 'no refunds', '48 hr cancel', '24 hour cancellation', '48 hour cancellation', 'money back', 'if people cancel', 'when people cancel', 'no shows', 'no show'],
    keysFr: ['remboursement', 'remboursements', 'rembourse', 'politique d annulation', 'annulation', 'credit complet', 'bon de pluie', 'si on annule', 'si les gens annulent'],
    a: '<p>Say it in one line in <strong>Good to know</strong>, like <em>{REFUND_EX}</em>. It shows under “Your visit” on your page. Weather is part of it? Add it to the same line, like <em>{REFUND_WX}</em>.</p>',
    aFr: '<p>Dites-le en une ligne dans <strong>Bon à savoir</strong>, comme <em>{REFUND_EX}</em>. Ça paraît sous « Planifiez votre visite » sur votre page. La météo en fait partie? Ajoutez-la à la même ligne, comme <em>{REFUND_WX}</em>.</p>' },
  { id: 'sport-what-to-bring', pages: ['setup', 'edit'], over: ['indoor-good-to-know', 'features', 'sport-rentals', 'indoor-age', 'sport-weather'],
    q: 'What people should wear or bring', qFr: 'Ce que les gens doivent porter ou apporter',
    allOf: [['wear', 'bring', 'clothes', 'clothing', 'porter', 'apport', 'habill', 'vetement'], ['what', 'should', 'need', 'que', 'quoi', 'doivent', 'own', 'your', 'votre', 'vos', 'water', 'sunscreen', 'snacks', 'towel', 'lock']],
    keys: ['what should people wear', 'what to wear', 'what do people wear', 'what to bring', 'what should people bring', 'what do people need to bring', 'what do they need', 'dress for the weather', 'helmet', 'helmets', 'goggles', 'sunscreen', 'towel', 'swimsuit', 'water bottle', 'bring your own', 'gear to bring', 'mitts', 'warm clothes'],
    keysFr: ['que porter', 'quoi porter', 'quoi apporter', 'que doivent apporter', 'que doivent porter', 'quoi mettre', 'casque', 'serviette', 'maillot', 'apportez votre', 'vetements chauds'],
    a: '<p>Tap the ones that fit in <strong>Good to know</strong>{BRING_CHIPS_EN}, or type one line in your own words, like <em>{BRING_EX}</em>. It shows under “Your visit” on your page.</p>',
    aFr: '<p>Touchez ceux qui conviennent dans <strong>Bon à savoir</strong>{BRING_CHIPS_FR}, ou écrivez une ligne dans vos mots, comme <em>{BRING_EX}</em>. Ça paraît sous « Planifiez votre visite » sur votre page.</p>' },
  { id: 'sport-peak-dates', pages: ['setup', 'edit', 'menu'], over: ['closures', 'setup-closures', 'setup-closure-fix', 'indoor-busy-times', 'indoor-closed-months', 'indoor-summer-late', 'indoor-theme-nights', 'sport-rate-change', 'indoor-price-varies', 'sport-one-off-closure', 'indoor-yearly-break', 'setup-short-closure', 'indoor-holiday-open', 'hours-open-holidays', 'seasonal-hours', 'menu-add', 'sport-season', 'indoor-summer-daily'],
    q: 'Our busiest or peak dates (and peak rates)', qFr: 'Nos dates les plus achalandées (et les tarifs de pointe)',
    allOf: [['peak', 'busiest', 'busy', 'pointe', 'achaland'], ['dec', 'jan', 'christmas', 'holiday', 'holidays', 'spring', 'break', 'summer', 'winter', 'july', 'august', 'weekend', 'weekends', 'week', 'season', 'dates', 'evening', 'mornings', 'afternoon', 'sunny', 'after school', 'noel', 'fetes', 'relache', 'ete', 'hiver', 'saison', 'juillet', 'aout', 'fins de semaine', 'fin', 'apres', 'where', 'say', 'our']],
    keys: ['peak season', 'peak dates', 'peak rates', 'peak prices', 'holiday peak', 'our busiest', 'busiest', 'busiest time', 'busiest weeks', 'busy season', 'high season', 'christmas week', 'spring break week', 'holiday rates', 'sells out', 'sell out', 'book up fast', 'books up'],
    keysFr: ['periode des fetes', 'la plus achalandee', 'les plus achalandees', 'achalandee', 'haute saison', 'semaine de noel', 'periode de pointe', 'tarifs de pointe', 'nos dates les plus occupees'],
    a: '<p>Busy dates aren’t closures, so leave Closures and holidays as it is. Say it in one line in <strong>Good to know</strong>, like <em>{BUSY_EX}</em>: it shows on your page, and Build My Trip shows it to people planning those dates. Higher prices then? Put them in the line’s details in <strong>Your prices</strong>, like <em>{PEAK_EX}</em>.</p>',
    aFr: '<p>Les dates achalandées ne sont pas des fermetures : laissez Fermetures et jours fériés tel quel. Dites-le en une ligne dans <strong>Bon à savoir</strong>, comme <em>{BUSY_EX}</em> : ça paraît sur votre page, et Planifier mon voyage le montre aux gens qui prévoient ces dates. Des prix plus élevés à ce moment-là? Mettez-les dans les détails de la ligne dans <strong>Vos tarifs</strong>, comme <em>{PEAK_EX}</em>.</p>' },
  { id: 'sport-included', pages: ['setup', 'edit', 'menu'], over: ['menu-add', 'indoor-extras', 'indoor-price', 'sport-card-price', 'indoor-good-to-know', 'sport-rate-lines', 'sport-tax', 'indoor-typer-first', 'cost', 'dont-have', 'indoor-cost', 'sport-said-twice', 'indoor-price-varies'],
    q: 'What’s included (and what isn’t)', qFr: 'Ce qui est compris (et ce qui ne l’est pas)',
    allOf: [['includ', 'inclus', 'compris', 'comprend'], ['lift', 'ticket', 'cart', 'balls', 'clubs', 'helmet', 'towel', 'gear', 'equip', 'price', 'lesson', 'billet', 'remontee', 'prix', 'cours', 'what', 'whats', 'quoi', 'serviette', 'disc', 'voiturette']],
    allOf2: [['lift', 'remontee'], ['ticket', 'tickets', 'billet', 'billets', 'pass']],
    keys: ['is it included', 'is the lift ticket included', 'lift ticket included', 'whats included', 'what is included', 'what s included', 'not included', 'included in the price', 'lift ticket', 'lift tickets', 'lift ticket prices', 'lift pass', 'we dont sell them', 'we don t sell them', 'ticket office', 'balls included', 'clubs included', 'cart included', 'helmet included'],
    keysFr: ['est il inclus', 'est inclus', 'inclus', 'compris', 'non compris', 'billet de remontee', 'billets de remontee', 'ce qui est compris', 'pas compris', 'nous ne les vendons pas'],
    a: '<p>Say what a price includes in the line’s details in <strong>Your prices</strong>, like <em>{INCL_EX}</em>. Something people often ask about that isn’t included? One line in <strong>Good to know</strong>, like <em>{NOT_INCL}</em>{NOT_INCL_CHIP_EN}. Something you don’t sell yourself, like {NOT_SOLD_EN}, stays off your list: that line says it.</p>',
    aFr: '<p>Dites ce que comprend un prix dans les détails de la ligne dans <strong>Vos tarifs</strong>, comme <em>{INCL_EX}</em>. Une chose que les gens demandent souvent et qui n’est pas comprise? Une ligne dans <strong>Bon à savoir</strong>, comme <em>{NOT_INCL}</em>{NOT_INCL_CHIP_FR}. Ce que vous ne vendez pas vous-même, comme {NOT_SOLD_FR}, reste hors de votre liste : cette ligne le dit.</p>' },
  { id: 'sport-package', pages: ['setup', 'edit', 'menu'], over: ['sport-rate-lines', 'menu-add', 'indoor-price-two', 'indoor-price', 'indoor-extras', 'sport-card-price', 'hours', 'indoor-price-varies', 'indoor-typer-first', 'sport-included', 'sport-rentals', 'indoor-also-offer', 'description', 'indoor-groups'],
    q: 'A package or bundle (like a first-timer package)', qFr: 'Un forfait (comme un forfait pour débutants)',
    allOf: [['package', 'bundle', 'combo', 'forfait', 'timer', 'starter', 'discover'], ['includ', 'with', 'lift', 'rental', 'rentals', 'lesson', 'where', 'how', 'go', 'put', 'avec', 'location', 'cours', 'billet', 'inclus', 'comprend', 'ou']],
    keys: ['package', 'packages', 'first timer package', 'first time package', 'first timer', 'first-timer', 'beginner package', 'discover package', 'learn to package', 'bundle', 'bundles', 'combo', 'combo deal', 'stay and play', 'party package', 'birthday package', 'family pack', 'family package', 'intro package', 'starter package', 'with lift and rentals', 'lift rental and lesson', 'lesson and rentals', 'starter set', 'starter pack', 'set of 3', 'family swim', 'family pass', '2 adults 2 kids', '2 adults and 2 kids'],
    keysFr: ['forfait', 'forfaits', 'forfait debutant', 'forfait decouverte', 'forfait pour debutants', 'forfait anniversaire', 'forfait famille', 'combo', 'avec location et billet'],
    a: '<p>Add it as one line in <strong>Your prices</strong>, with what’s in it in its details, like <em>{PKG_EX}</em>. Want people to see it first? Say it in <strong>Known for</strong> too (in Your story and Known for): search and Build My Trip read both. A package never becomes your card’s price: your card keeps {CARD_EN}.</p>',
    aFr: '<p>Ajoutez-le en une ligne dans <strong>Vos tarifs</strong>, avec ce qu’il comprend dans ses détails, comme <em>{PKG_EX}</em>. Vous voulez qu’on le voie d’abord? Dites-le aussi dans <strong>Connu pour</strong> (dans Votre histoire et ce pour quoi vous êtes connus) : la recherche et Planifier mon voyage lisent les deux. Un forfait ne devient jamais le prix de votre fiche : elle garde {CARD_FR}.</p>' },
  { id: 'sport-one-listing', pages: ['setup', 'edit'], over: ['sport-second-kind', 'indoor-kinds-many', 'sport-kinds-other', 'more-businesses', 'claim', 'not-found', 'sport-restaurant', 'cuisine', 'sport-lessons'],
    q: 'We do two things in one place: one listing or two?', qFr: 'Nous faisons deux choses au même endroit : une fiche ou deux?',
    allOf: [['separate', 'two', 'second', 'another', 'same', 'deux', 'separe', 'meme', 'seule', 'autre', 'both'], ['school', 'listing', 'listings', 'fiches', 'ecole', 'club']], allOf2: [['one', 'une'], ['listing', 'fiche']],
    keys: ['is it separate', 'is the snowboard school separate', 'same school', 'same school ski and board', 'one listing', 'two listings', 'a second listing', 'another listing', 'separate listing for', 'do i need two', 'both ski and board', 'ski and board', 'same club', 'same place', 'one page for both', 'two pages'],
    keysFr: ['meme ecole', 'une seule fiche', 'deux fiches', 'une autre fiche', 'fiche a part pour', 'meme club', 'ski et planche'],
    a: '<p>One listing is right when it’s the same place, desk and booking. Your kind says <strong>{LABEL_EN}</strong>, and search finds you for {BOTH_EN}: say both in your story. Something with its own name, address and hours? Tap <strong>Message us</strong> and Dayton will look at a second listing.</p>',
    aFr: '<p>Une seule fiche convient quand c’est le même endroit, le même comptoir et les mêmes réservations. Votre genre indique <strong>{LABEL_FR}</strong>, et la recherche vous trouve pour {BOTH_FR} : dites les deux dans votre histoire. Une partie a son propre nom, son adresse et ses heures? Touchez <strong>Écrivez-nous</strong> et Dayton verra à une deuxième fiche.</p>' },
  { id: 'sport-season-says', pages: ['setup', 'edit'], over: ['indoor-closed-months', 'sport-season', 'closures', 'setup-closures', 'indoor-seasonal', 'season', 'hours', 'sport-opening-day', 'indoor-summer-daily', 'seasonal-hours', 'setup-season', 'year-round', 'indoor-yearly-break', 'setup-short-closure', 'sport-one-off-closure', 'shows-closed'],
    q: 'Will my page say we’re closed outside our season?', qFr: 'Ma page dira-t-elle que nous sommes fermés hors saison?',
    allOf: [['page', 'card', 'say', 'says', 'show', 'shows', 'know', 'obvious', 'obviously', 'tell', 'dit', 'dira', 'affich', 'indiqu', 'voient', 'sait', 'sauront', 'evident'], ['closed', 'close', 'ferme', 'fermes', 'fermee'],
      ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'summer', 'winter', 'off season', 'season', 'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre', 'ete', 'hiver', 'saison']],
    keys: ['will the page say', 'will my page say', 'does the page say', 'will it say closed', 'will it say we are closed', 'will people know we are closed', 'closed obviously', 'obviously closed', 'say we are closed in', 'show we are closed in', 'does it show closed', 'off season on my page'],
    keysFr: ['est ce que la page le dit', 'la page le dit', 'ma page dira', 'va t elle dire', 'les gens sauront', 'ferme en ete evidemment', 'ferme en juillet'],
    a: '{SEASON_SAYS_EN}', aFr: '{SEASON_SAYS_FR}' },
  { id: 'sport-book-ahead-hours', pages: ['setup', 'edit'], over: ['indoor-booking', 'sport-tee-times', 'indoor-age', 'indoor-good-to-know', 'booking-link', 'links', 'sport-one-off-closure', 'sport-lessons', 'indoor-extras', 'hours', 'sport-tournaments', 'indoor-book-party', 'sport-members', 'indoor-groups', 'sport-same-day'],
    q: 'People must book a set time ahead (like 48 hours)', qFr: 'Il faut réserver un certain temps à l’avance (comme 48 heures)',
    allOf2: [['notice', 'advance', 'avance'], ['hours', 'hrs', 'days', 'week', 'heures', 'jours', 'semaine']],
    allOf: [['book', 'booked', 'booking', 'reserv', 'sign', 'signup', 'register', 'registration', 'inscri'], ['hrs', 'hours', 'hr', 'days', 'week', 'weeks', 'heures', 'jours', 'semaine'], ['ahead', 'advance', 'before', 'prior', 'avance', 'avant', 'notice', 'have to', 'must', 'need', 'faut', 'doivent']],
    keys: ['48 hrs ahead', '48 hours ahead', '72 hours ahead', '24 hours ahead', 'hours ahead', 'days ahead', 'a week ahead', 'have to be booked', 'must be booked', 'has to be booked', 'need to be booked', 'booked ahead', 'book in advance', 'advance booking', 'advance notice'],
    keysFr: ['48 heures a l avance', '72 heures a l avance', 'heures a l avance', 'jours a l avance', 'doivent etre reserves', 'doit etre reserve', 'reserver a l avance'],
    a: '<p>On <strong>Walk-ins or booking</strong>, tap <strong>{AHEAD_CHIP_EN}</strong> if everything is booked ahead (or the middle choice if some of it isn’t). Then say how far ahead in one line in <strong>Good to know</strong>, like <em>{AHEAD_EX}</em>.</p>',
    aFr: '<p>Dans <strong>Sans réservation ou réserver</strong>, touchez <strong>{AHEAD_CHIP_FR}</strong> si tout se réserve à l’avance (ou le choix du milieu si une partie ne se réserve pas). Dites ensuite combien de temps à l’avance en une ligne dans <strong>Bon à savoir</strong>, comme <em>{AHEAD_EX}</em>.</p>' },
  { id: 'sport-same-day', pages: ['setup', 'edit'], over: ['indoor-booking', 'links', 'booking-link', 'sport-tee-times', 'live-speed', 'setup-live-when', 'photos-when', 'indoor-book-party'],
    q: 'Can people come or book the same day?', qFr: 'Les gens peuvent-ils venir ou réserver le jour même?',
    allOf: [['same day', 'same-day', 'day of', 'last minute', 'jour meme', 'meme jour', 'derniere minute', 'on the day', 'walk up', 'walk-up'], ['book', 'sign', 'come', 'people', 'can', 'register', 'reserv', 'venir', 'peuvent', 'desk', 'drop', 'join', 'lesson', 'cours', 'lessons']],
    keys: ['same day', 'book same day', 'can people book same day', 'sign up same day', 'same day at the desk', 'same day bookings', 'last minute bookings', 'last minute', 'walk up', 'day of booking', 'on the day'],
    keysFr: ['le jour meme', 'meme jour', 'reserver le jour meme', 'a la derniere minute', 'derniere minute'],
    a: '<p>Yes, when there’s room. On <strong>Walk-ins or booking</strong>, tap <strong>{BUSY_CHIP_EN}</strong>{BUSY_LINE_EN}. Then say how it works in one line in <strong>Good to know</strong> if you like, like <em>{SAME_EX}</em>.</p>',
    aFr: '<p>Oui, quand il y a de la place. Dans <strong>Sans réservation ou réserver</strong>, touchez <strong>{BUSY_CHIP_FR}</strong>{BUSY_LINE_FR}. Dites ensuite comment ça marche en une ligne dans <strong>Bon à savoir</strong> si vous voulez, comme <em>{SAME_EX}</em>.</p>' },
  { id: 'sport-shared-social', pages: ['setup', 'edit'], over: ['social-post', 'no-website-social', 'links', 'sport-public', 'not-owner', 'website-broken', 'staff'],
    q: 'We use our resort’s, club’s or city’s Instagram (not our own)', qFr: 'Nous utilisons l’Instagram de la station, du club ou de la ville (pas le nôtre)',
    allOf: [['instagram', 'facebook', 'insta', 'social', 'account', 'compte', 'tiktok'], ['resort', 'resorts', 'club', 'clubs', 'city', 'citys', 'parent', 'shared', 'share', 'main', 'own', 'dont have', 'station', 'ville', 'partage', 'notre propre', 'pas de']],
    keys: ['the resorts account', 'resorts instagram', 'resort instagram', 'the resort s account', 'its the resorts account', 'dont have our own instagram', 'don t have our own instagram', 'no instagram of our own', 'club account', 'city account', 'city s instagram', 'shared account', 'parent company account', 'our own instagram'],
    keysFr: ['compte de la station', 'instagram de la station', 'pas notre propre instagram', 'compte de la ville', 'compte du club', 'compte partage'],
    a: '<p>Yes, that’s fine: put that account in <strong>Instagram</strong> or <strong>Facebook</strong> (in the extra details). Your page links to it, so people see your news there. No account at all? Leave them empty.</p>',
    aFr: '<p>Oui, c’est très bien : mettez ce compte dans <strong>Instagram</strong> ou <strong>Facebook</strong> (dans les détails facultatifs). Votre page y mène, et les gens y voient vos nouvelles. Aucun compte? Laissez-les vides.</p>' },
  { id: 'sport-holiday-short', pages: ['setup', 'edit'], over: ['indoor-holiday-open', 'hours-open-holidays', 'closures', 'setup-closures', 'hours', 'setup-split-hours', 'indoor-summer-late', 'seasonal-hours', 'sport-last-booking', 'setup-short-closure', 'sport-one-off-closure'],
    q: 'Open on a holiday, but shorter hours (like Christmas Eve)', qFr: 'Ouvert un jour férié, mais moins longtemps (comme la veille de Noël)',
    allOf: [['eve', 'christmas', 'holiday', 'canada', 'boxing', 'veille', 'ferie', 'thanksgiving', 'easter', 'noel'], ['closes', 'closing', 'early', 'shorter', 'short', 'until', 'til', 'till', 'last', 'lights', 'ends', 'tot', 'jusqu', 'moins', 'reduit']],
    allOf2: [['canada', 'christmas', 'boxing', 'thanksgiving', 'easter', 'noel', 'veille'], ['open', 'ouvert', 'close', 'ferme'], ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'noon', 'midi']],
    keys: ['christmas eve', 'closes at 2', 'close early on', 'closing early on', 'shorter hours on', 'short day', 'new years eve', 'open shorter', 'only open until', 'half day on', 'early close'],
    keysFr: ['veille de noel', 'ferme a 14 h', 'ferme plus tot', 'moins longtemps', 'heures reduites', 'veille du jour de l an'],
    a: '<p>Leave that day unticked in <strong>Closures and holidays</strong> (ticked, your page would say you’re closed all day). Tap <strong>Message us</strong> with the date and your hours and Dayton sets them, or say it in one line in <strong>Good to know</strong>, like <em>{HOLIDAY_EX}</em>.</p>',
    aFr: '<p>Laissez ce jour non coché dans <strong>Fermetures et jours fériés</strong> (coché, votre page dirait que vous êtes fermé toute la journée). Touchez <strong>Écrivez-nous</strong> avec la date et vos heures, et Dayton les règle; ou dites-le en une ligne dans <strong>Bon à savoir</strong>, comme <em>{HOLIDAY_EX}</em>.</p>' },
  { id: 'sport-find-me', pages: ['setup', 'edit'], over: ['sport-lessons', 'description', 'not-found', 'features', 'stats', 'sport-kinds-other', 'indoor-kinds-many', 'sport-sports-words', 'sport-rate-lines', 'menu-add'],
    q: 'How do people find us when they search?', qFr: 'Comment les gens nous trouvent-ils quand ils cherchent?',
    allOf: [['search', 'google', 'cherch', 'recherche'], ['people', 'us', 'they', 'when', 'how', 'gens', 'nous', 'comment', 'quand', 'for', 'pour']],
    keys: ['how do people find us', 'find us when they search', 'when they search', 'people search for', 'show up in search', 'come up in search', 'search for ski lessons', 'how do we show up', 'search results'],
    keysFr: ['comment les gens nous trouvent', 'quand ils cherchent', 'dans la recherche', 'nous trouver'],
    a: '<p>Search and Build My Trip read your kind (<strong>{LABEL_EN}</strong>), your story, Known for and Good to know. Use the words people type, like <em>{SEARCH_EX}</em>, in your story.{NEAR_EN}</p>',
    aFr: '<p>La recherche et Planifier mon voyage lisent votre genre (<strong>{LABEL_FR}</strong>), votre histoire, Connu pour et Bon à savoir. Employez les mots que les gens tapent, comme <em>{SEARCH_EX_FR}</em>, dans votre histoire.{NEAR_FR}</p>' },
  { id: 'sport-line-ages', pages: ['setup', 'edit', 'menu'], over: ['indoor-age', 'indoor-line-age', 'sport-rate-lines', 'indoor-camps', 'menu-add', 'indoor-price-varies', 'sport-lessons', 'sport-kids-free', 'indoor-groups', 'indoor-price'],
    q: 'Programs with their own ages (like ages 5 to 12)', qFr: 'Des programmes avec leurs propres âges (comme 5 à 12 ans)',
    allOf: [['ages', 'age', 'ans'], ['put', 'where', 'show', 'each', 'line', 'camp', 'camps', 'mettre', 'ligne']], allOf2: [['ages'], ['junior', 'lesson', 'skate', 'kid', 'clinic', 'class', 'camp', 'tennis', 'swim', 'program', 'club', 'strider', 'learn'], ['1', '2', '3', '4', '5', '6', '7', '8', '9']],
    keys: ['where do the ages go', 'ages go', 'ages on each', 'ages for each', 'each program has its own age', 'ages 3 to 4', 'ages 5 to 12', '3 to 4 and', '5 to 12', 'age groups', 'age group', 'different ages'],
    keysFr: ['3 4 ans et 5 12 ans', '5 12 ans', 'groupes d age', 'les ages de chaque', 'ou vont les ages'],
    a: '<p>Put the ages in each line’s name in <strong>Your prices</strong>, like <em>{AGES_LINE}</em>. Your page shows them, and Build My Trip shows the line that fits a child’s age. In <strong>Who can come</strong>, pick the youngest age anyone can come (All ages if little ones can).</p>',
    aFr: '<p>Mettez les âges dans le nom de chaque ligne dans <strong>Vos tarifs</strong>, comme <em>{AGES_LINE}</em>. Votre page les montre, et Planifier mon voyage montre la ligne qui convient à l’âge d’un enfant. Dans <strong>Qui peut venir</strong>, choisissez l’âge minimum pour venir (Tous les âges si les tout-petits peuvent).</p>' },
  { id: 'sport-dawn-dusk', pages: ['setup', 'edit'], over: ['hours', 'indoor-no-hours', 'indoor-swim-times', 'indoor-price', 'sport-season', 'indoor-seasonal'],
    q: 'We’re open dawn to dusk (no gate, no set hours)', qFr: 'Nous sommes ouverts du lever au coucher du soleil (pas d’heures fixes)',
    keys: ['dawn to dusk', 'dawn till dusk', 'dawn til dusk', 'sunrise to sunset', 'daylight hours', 'always open', 'open 24 hours', 'no set hours', 'no gate', 'its a park', 'do we need hours', 'it never closes'],
    keysFr: ['de l aube au crepuscule', 'du lever au coucher du soleil', 'toujours ouvert', 'pas d heures fixes', 'c est un parc'],
    a: '<p>Put the hours most people can use it, like <em>7 AM to 10 PM</em>, so your page can say open or closed. Then say it in one line in <strong>Good to know</strong>, like <em>Open dawn to dusk</em>{LIT_EN}.</p>',
    aFr: '<p>Mettez les heures où la plupart des gens peuvent l’utiliser, comme <em>de 7 h à 22 h</em>, pour que votre page puisse dire ouvert ou fermé. Dites-le ensuite en une ligne dans <strong>Bon à savoir</strong>, comme <em>Ouvert du lever au coucher du soleil</em>{LIT_FR}.</p>' },
];
// What owners of every kind typed for the shared answers ([en keys, fr keys, topics they now beat]).
const MORE_KEYS = {
  'indoor-age': [['youngest', 'youngest is', 'how young', 'potty trained', 'toilet trained', 'minimum age', 'little ones', 'toddlers', 'from age 3', 'adults any age', 'kids under', 'age limit', 'too young', 'need an adult', 'with an adult', 'under 12 need an adult'], ['le plus jeune', 'les plus jeunes', 'des 3 ans', 'age minimum', 'tout petits', 'propre'], ['sport-kids-free', 'indoor-busy-times']],
  'sport-per-person': [['per hour for up to', 'for up to 3', 'up to 3 people', 'up to 4 people', '1 to 3 people', 'same price for 1 to 3', 'private is per hour', 'per hour up to', 'price for the group', 'for the whole group', 'private lesson per hour', 'private per hour', 'how do i show that'], ['l heure pour 3', 'jusqu a 3 personnes', 'prive est a l heure', 'cours prive a l heure', 'pour 1 a 3 personnes'], ['login-privacy', 'privacy', 'indoor-min-players', 'sport-rate-lines', 'menu-add', 'sport-lessons', 'indoor-price-two']],
  'indoor-gift': [['gift cards', 'gift card', 'gift certificates', 'vouchers'], ['cartes cadeaux', 'carte cadeau', 'certificat cadeau'], []],
  'sport-lessons': [['private vs group', 'private and group', 'group and private', 'private or group', 'show private', 'private lessons and group', 'race programs', 'freestyle programs', 'race and freestyle', 'programs for teens', 'race team', 'freestyle'], ['prives et de groupe', 'cours prives', 'prive et de groupe', 'cliniques d initiation', 'clinique d initiation', 'initiation', 'cours pour debutants'], ['indoor-price-varies', 'indoor-seasonal', 'seasonal-hours', 'season']],
  'indoor-camps': [['christmas camp', 'holiday camp', 'spring break camp', 'should that be an event', 'is that an event', 'camp is dec', 'camp dates'], ['camp de noel', 'camp des fetes', 'camp de la relache', 'est ce un evenement'], ['closures', 'setup-closures', 'setup-closure-fix', 'sport-one-off-closure', 'setup-short-closure', 'indoor-yearly-break']],
  'indoor-holiday-open': [['open christmas day', 'open on christmas', 'we are open christmas', 'open boxing day', 'open new years day', 'open on holidays', 'open on stat holidays'], ['ouvert a noel', 'ouverts a noel', 'ouvert le jour de noel', 'on est ouvert a noel'], ['closures', 'setup-closures']],
  'indoor-access': [['wheelchair', 'wheelchair accessible', 'accessible', 'elevator', 'ramp', 'stairs', 'accessible washroom'], ['fauteuil roulant', 'accessible', 'ascenseur', 'rampe'], []],
  'indoor-swim-times': [['lessons go out at', 'lesson times', 'lessons start at', 'desk opens', 'lessons at 9'], ['heures des cours', 'les cours partent', 'le comptoir ouvre', 'heures de patinage libre changent', 'changent chaque semaine'], ['hours', 'setup-split-hours', 'sport-last-booking', 'setup-third-time', 'indoor-extras']],
  'indoor-french': [['write this in french', 'in french too', 'do i have to write it in french', 'guests are from quebec', 'french page', 'french version'], ['en francais aussi', 'ecrire en francais', 'version francaise'], []],
  'sport-rentals': [['rentals are separate', 'rentals extra', 'rentals cost extra'], ['location en plus', 'location a part'], []],
  'sport-weather': [['lifts close', 'the lifts close', 'cancelled for wind', 'canceled for wind', 'wind hold', 'lift closures', 'too cold', 'cold days', 'any weather', 'run in any weather', 'rain or shine', 'too warm', 'even in snow', 'deep snow', 'all weather'], ['remontees ferment', 'grand vent', 'par tous les temps', 'beau temps mauvais temps', 'mouille', 'quand c est mouille'], ['sport-opening-day']],
  'indoor-good-to-know': [['washrooms', 'washroom', 'washrooms nearby', 'bathrooms', 'toilets', 'change rooms', 'helmets are required', 'helmets required for', 'is there a chip'], ['toilettes', 'vestiaires', 'trottinettes', 'velos permis', 'trottinettes et velos', 'carte du parcours'], ['indoor-price', 'indoor-age']],
  'indoor-theme-nights': [[], ['mini golf fluo', 'soiree jam', 'soirees jam', 'chaque vendredi', 'basketball libre', 'le vendredi soir', 'patinage familial', 'bain familial'], ['sport-tournaments']],
  'indoor-price': [['adult skate is', 'adult swim is'], [], ['indoor-theme-nights']],
  'indoor-price-varies': [['small and large', 'small and large buckets', 'off peak', 'peak and off peak', 'peak after'], ['petit seau', 'grand seau', 'hors pointe'], []],
  'sport-season': [['to labour day', 'until labour day', 'to thanksgiving', 'victoria day to', 'end of october', 'early april', 'for the season'], ['a la fete du travail'], []],
  'indoor-groups': [['ice rentals by the hour', 'ice rental by the hour'], [], ['indoor-extras']],
  'sport-free-clubs': [[], [], ['sport-included']],
  'sport-dogs': [[], [], ['sport-what-to-bring']],
  'sport-dress-code': [[], [], ['sport-what-to-bring']],
  'sport-restaurant': [[], [], ['sport-one-listing']],
  'photo-add': [['photo of our instructors', 'photo of our staff', 'photos of our team', 'picture of our coaches', 'photo of our pros'], ['photo de nos moniteurs', 'photo de notre equipe'], ['sport-staff-language']],
};

// The word groups (allOf, allOf2) the shared answers now also take (sport test 5's questions).
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'janvier', 'fevrier', 'mars', 'avril', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MORE_ALLOF = {
  'sport-weather': (t) => ({ allOf: (t.allOf || []).map((g, i) => (i === 1 ? g.concat(['warm', 'soft', 'melt', 'mouill', 'lift']) : g)), allOf2: [['all', 'any', 'every', 'even', 'tous'], ['year', 'weather', 'season', 'temps'], ['snow', 'rain', 'neige', 'pluie']] }),
  'sport-season': () => ({ allOf: [['close', 'closed', 'closes', 'closing', 'ferm', 'reopen'], MONTHS] }),
  'sport-rate-lines': () => ({ allOf: [['kid', 'child', 'junior', 'youth', 'student', 'enfant', 'jeune'], ['senior', 'aine']] }),
  'sport-minigolf-rates': (t) => ({ allOf: (t.allOf || []).map((g, i) => (i === 1 ? g.concat(['adult', 'adulte']) : g)) }),
  'sport-kids-free': (t) => ({ over: (t.over || []).concat(['sport-minigolf-rates']) }),
  'indoor-groups': (t) => (Array.isArray(t.allOf2) && t.allOf2.length > 1 ? { allOf2: t.allOf2.map((g, i) => (i === 1 ? g.concat(['ice', 'glace', 'gym', 'gymnase', 'court', 'field']) : g)) } : {}),
  'indoor-yearly-break': (t) => (t.allOf ? {} : { allOf: [['week', 'semaine'], ['close', 'closed', 'closes', 'ferm'], ['christmas', 'holiday', 'winter', 'noel', 'fetes']], over: (t.over || []).concat(['sport-holiday-short']) }),
  'sport-line-ages': () => ({}),
};
function fill(x, m) { return typeof x === 'string' ? x.replace(/\{([A-Z_]+)\}/g, (all, k) => (k in m ? m[k] : all)) : x; }
// ctx: { esc, kind, price ({ en, fr } the card's price line, or null), season ({ en, fr, reopenEn, reopenFr } or null),
//   gtk ({ en: [...], fr: [...] } the kind's Good to know chips), booking ({ ahead: [en, fr], busy: [en, fr], line: [en, fr] | null }),
//   near ({ en, fr } or null) }
function tokens(kind, ctx) {
  const e = ctx.esc, K = SK.K[kind] || SK.K.sportother, w = (f, i) => e(word(f, kind)[i]);
  const chipOf = (re) => { const i = (ctx.gtk.en || []).findIndex((c) => re.test(c)); return i >= 0 ? [ctx.gtk.en[i], (ctx.gtk.fr || [])[i] || ctx.gtk.en[i]] : null; };
  const meet = chipOf(/\bmeet\b|check in|arrive/i), lit = chipOf(/^lit\b/i), notIn = chipOf(/not included/i);
  const bring = (ctx.gtk.en || []).map((c, i) => [c, (ctx.gtk.fr || [])[i] || c]).filter(([c]) => /\bbring\b|\bdress\b|helmet|swimsuit|shoes|clubs to borrow|racquet|discs/i.test(c)).slice(0, 2);
  const label = SK.SPORT_KIND_LABELS_OWNER[kind] || ['your kind', 'votre genre'];
  const busy = SK.BUSY_THEME[kind] || SK.BUSY_THEME.sportother;
  const typer = SK.TYPER[kind] || SK.TYPER.sportother, ex = SK.EX_PRICE[kind] || 15, p = typeof ctx.amount === 'number' && ctx.amount > 0 ? ctx.amount : ex;
  const peakWhen = WINTER(kind) ? ['Christmas and spring break', 'Noël et relâche'] : SUMMER(kind) ? ['July and August', 'juillet et août'] : ['weekends', 'fin de semaine'];
  const peak = Math.round(p * 1.15);
  const seasonSays = ctx.season
    ? [`<p>Yes, already. Your season is ${e(ctx.season.en)}: outside it your page and your card say “Closed for the season”, with the day you reopen (${e(ctx.season.reopenEn)}), and Build My Trip doesn’t plan you then. Nothing to add: don’t mark those months closed again.</p>`,
      `<p>Oui, déjà. Votre saison va ${e(ctx.season.fr)} : en dehors, votre page et votre fiche indiquent « Fermé pour la saison », avec le jour de réouverture (${e(ctx.season.reopenFr)}), et Planifier mon voyage ne vous propose pas. Rien à ajouter : ne marquez pas ces mois comme fermés une deuxième fois.</p>`]
    : ['<p>Yes, once your season is in. In your hours, after the days, tap <strong>We’re closed part of the year</strong> and pick your first and last day. Outside them your page and your card say “Closed for the season”, with the day you reopen, and Build My Trip doesn’t plan you.</p>',
      '<p>Oui, une fois votre saison entrée. Dans vos heures, après les jours, touchez <strong>Nous fermons une partie de l’année</strong> et choisissez votre premier et votre dernier jour. En dehors, votre page et votre fiche indiquent « Fermé pour la saison », avec le jour de réouverture, et Planifier mon voyage ne vous propose pas.</p>'];
  const bw = ctx.booking || {};
  const two = (list) => (list || []).filter((x) => !(list || []).some((o) => o !== x && (o === `${x}s` || x.startsWith(`${o} `)))).slice(0, 2);
  const search = two(K.en.search), searchFr = two(K.fr.search);
  return {
    en: { MEET_EX: w('meet', 0), MEET_CHIP_EN: meet ? ` Or tap <strong>${e(meet[0])}</strong> and add where.` : '', LANG_EX: w('lang', 0), ADAPT_PRICE: w('adaptPrice', 0), ADAPT_EX: w('adapt', 0), REFUND_EX: w('refund', 0), REFUND_WX: w('refundWx', 0),
      BRING_EX: w('bring', 0), BRING_CHIPS_EN: bring.length ? ` (like ${bring.map(([c]) => `<strong>${e(c)}</strong>`).join(' or ')})` : '', BUSY_EX: e(busy[0]), PEAK_EX: e(`${typer[0]} $${p} (${peakWhen[0]}: $${peak})`),
      INCL_EX: w('include', 0), NOT_INCL: w('notIncluded', 0), PKG_EX: w('pkg', 0), CARD_EN: ctx.price ? `your main price (“${e(ctx.price.en)}”)` : 'your main price', LABEL_EN: e(label[0]), BOTH_EN: w('both', 0),
      SEASON_SAYS_EN: seasonSays[0], AHEAD_CHIP_EN: e((bw.ahead || ['No, please book ahead'])[0]), AHEAD_EX: w('ahead', 0), BUSY_CHIP_EN: e((bw.busy || ['Yes, but book ahead for weekends and busy times'])[0]),
      BUSY_LINE_EN: bw.line ? `: your page says “${e(String(bw.line[0]).replace(/\.$/, ''))}”` : '', SAME_EX: w('same', 0), HOLIDAY_EX: w('holiday', 0), SEARCH_EX: e(search.join(', ') || label[0].toLowerCase()), NEAR_EN: ctx.near ? ` ${ctx.near.en}` : '', NOT_INCL_CHIP_EN: notIn ? (notIn[0] === word('notIncluded', kind)[0] ? ': it’s one tap there' : ` (or tap <strong>${e(notIn[0])}</strong>)`) : '', NOT_SOLD_EN: kind === 'skischool' ? 'lift tickets the ticket office sells' : 'another business’s tickets', LIT_EN: lit ? `, or tap <strong>${e(lit[0])}</strong> if it’s lit` : '', AGES_LINE: w('lineAges', 0) },
    fr: { MEET_EX: w('meet', 1), MEET_CHIP_FR: meet ? ` Ou touchez <strong>${e(meet[1])}</strong> et ajoutez l’endroit.` : '', LANG_EX: w('lang', 1), ADAPT_PRICE: w('adaptPrice', 1), ADAPT_EX: w('adapt', 1), REFUND_EX: w('refund', 1), REFUND_WX: w('refundWx', 1),
      BRING_EX: w('bring', 1), BRING_CHIPS_FR: bring.length ? ` (comme ${bring.map(([, c]) => `<strong>${e(c)}</strong>`).join(' ou ')})` : '', BUSY_EX: e(busy[3]), PEAK_EX: e(`${typer[2]} ${p} $ (${peakWhen[1]} : ${peak} $)`),
      INCL_EX: w('include', 1), NOT_INCL: w('notIncluded', 1), PKG_EX: w('pkg', 1), CARD_FR: ctx.price ? `votre prix principal (« ${e(ctx.price.fr)} »)` : 'votre prix principal', LABEL_FR: e(label[1]), BOTH_FR: w('both', 1),
      SEASON_SAYS_FR: seasonSays[1], AHEAD_CHIP_FR: e((bw.ahead || ['', 'Non, réservez à l’avance'])[1]), AHEAD_EX: w('ahead', 1), BUSY_CHIP_FR: e((bw.busy || ['', 'Oui, mais réservez pour les fins de semaine et les périodes achalandées'])[1]),
      BUSY_LINE_FR: bw.line ? ` : votre page indique « ${e(String(bw.line[1]).replace(/\.$/, ''))} »` : '', SAME_EX: w('same', 1), HOLIDAY_EX: w('holiday', 1), SEARCH_EX_FR: e(searchFr.join(', ') || label[1].toLowerCase()), NEAR_FR: ctx.near ? ` ${ctx.near.fr}` : '', NOT_INCL_CHIP_FR: notIn ? (notIn[0] === word('notIncluded', kind)[0] ? ' : c’est un choix à toucher' : ` (ou touchez <strong>${e(notIn[1])}</strong>)`) : '', NOT_SOLD_FR: kind === 'skischool' ? 'les billets de remontée vendus à la billetterie' : 'les billets d’une autre entreprise', LIT_FR: lit ? `, ou touchez <strong>${e(lit[1])}</strong> s’il y a de l’éclairage` : '', AGES_LINE: w('lineAges', 1) },
  };
}
// The shared answers (and their titles, which are also the suggestion buttons) in the kind's own words.
function kindHelp(t, kind, ctx) {
  if (!t || typeof t !== 'object') return t;
  const e = ctx.esc, w = (f) => word(f, kind);
  const golf = kind === 'golf', golfish = ['golf', 'simgolf', 'range'].includes(kind);
  const rep = (x, pairs) => (typeof x === 'string' ? pairs.reduce((acc, [a, b]) => (a instanceof RegExp ? acc.replace(a, b) : acc.split(a).join(b)), x) : x);
  const both = (t2, en, fr) => ({ ...t2, a: rep(t2.a, en), aFr: rep(t2.aFr, fr) });
  const more = MORE_KEYS[t.id];
  if (more) t = { ...t, keys: (t.keys || []).concat(more[0]), keysFr: (t.keysFr || []).concat(more[1]), over: (t.over || []).concat(more[2]) };
  if (MORE_ALLOF[t.id]) t = { ...t, ...MORE_ALLOF[t.id](t) };
  const title = (en, fr) => { t = { ...t, q: en, qFr: fr }; };
  switch (t.id) {
    case 'sport-rate-lines': {
      title(...w('ratesQ'));
      // A package is its own answer (sport-package).
      t = { ...t, keys: (t.keys || []).filter((k) => !/^packages?$/.test(k)), keysFr: (t.keysFr || []).filter((k) => !/^forfaits?$/.test(k)) };
      if (kind === 'skischool') t = both(t, [[/Your card shows your lowest regular adult price\. [^<]*? never/, 'Your card shows your lowest group lesson. Rentals, lift tickets, packages and kids’ programs never']], [[/Votre fiche montre votre prix adulte régulier le plus bas\. [^<]*? ne deviennent jamais/, 'Votre fiche montre votre cours de groupe le moins cher. La location, les billets de remontée, les forfaits et les programmes pour enfants ne deviennent jamais']]);
      return t;
    }
    case 'sport-tee-times': title(...w('bookQ')); return t;
    // Sport test 5 (#14, #33): for a ski school a lesson IS the card's price; its extras are rentals, lift tickets and packages.
    case 'sport-card-price':
      if (kind !== 'skischool') return t;
      return both(t, [['Rentals, lessons, memberships, food and kids’ or senior prices', 'Rentals, lift tickets, packages, food and kids’ programs']], [['La location, les cours, les abonnements, la nourriture et les prix pour enfants ou aînés', 'La location, les billets de remontée, les forfaits, la nourriture et les programmes pour enfants']]);
    case 'sport-rentals': title(...w('rentQ')); return t;
    case 'sport-opening-day': { const m = w('moves'); title(`Our opening day changes every year (${m[0]})`, `Notre jour d’ouverture change chaque année (selon ${m[1].replace(/^de /, '').replace(/^de l’/, 'l’')})`); return t; }
    case 'sport-season': {
      const m = w('moves');
      t = both(t, [['Opening day moves with the snow, the ice or the greens?', `Opening day moves ${m[0]}?`]], [['Le jour d’ouverture dépend de la neige, de la glace ou des verts?', `Le jour d’ouverture dépend ${m[1]}?`]]);
      if (ctx.season) t = { ...t, a: `<p>Your season is already in: ${e(ctx.season.en)}, every year. To change it, open your hours (<strong>Hours</strong>, then <strong>Change them</strong>) and change the first or last day.</p>${t.a}`, aFr: `<p>Votre saison est déjà entrée : ${e(ctx.season.fr)}, chaque année. Pour la changer, ouvrez vos heures (<strong>Heures</strong>, puis <strong>Les modifier</strong>) et changez le premier ou le dernier jour.</p>${t.aFr}` };
      return t;
    }
    case 'indoor-closed-months':
      if (ctx.season) return { ...t, a: `<p>Your season already covers it: outside ${e(ctx.season.en)} your page says “Closed for the season” (reopens ${e(ctx.season.reopenEn)}), so there’s nothing to add. Closed a whole month inside your season? Change your first or last day instead (<strong>Hours</strong>, then <strong>Change them</strong>).</p>`,
        aFr: `<p>Votre saison le couvre déjà : en dehors de la période ${e(ctx.season.fr)}, votre page indique « Fermé pour la saison » (réouverture : ${e(ctx.season.reopenFr)}), donc rien à ajouter. Fermé un mois entier pendant votre saison? Changez plutôt votre premier ou votre dernier jour (<strong>Heures</strong>, puis <strong>Les modifier</strong>).</p>` };
      return t;
    case 'sport-weather': {
      title(...w('wxQ'));
      const x1 = w('wx1'), x2 = w('wx2'), ev = ctx.event || ['an event', 'un événement'];
      return both(t, [['<em>Frost delays in spring and fall: check our website</em> or <em>Closed when it rains</em>', `<em>${e(x1[0])}</em> or <em>${e(x2[0])}</em>`], ['like a tournament?', `like ${e(ev[0])}?`]],
        [['<em>Retards dus au gel au printemps et à l’automne : voyez notre site</em> ou <em>Fermé quand il pleut</em>', `<em>${e(x1[1])}</em> ou <em>${e(x2[1])}</em>`], ['comme un tournoi?', `comme ${e(ev[1])}?`]]);
    }
    case 'sport-lessons': {
      if (golf) return t;
      const price = ctx.price || { en: '', fr: '' };
      if (kind === 'skischool') {
        return { ...t, q: 'Lessons and programs: where each one goes', qFr: 'Les cours et les programmes : où va chacun',
          a: `<p>Lessons are your main thing: your lowest group lesson is your <strong>Price</strong>${price.en ? ` (“${e(price.en)}”)` : ''}. Each lesson or program goes in <strong>Your prices</strong>, one line each, with who and how long in its details, like <em>Private lesson, 1 hour $189 (1 to 3 people)</em> or <em>Kids Club (ages 5 to 12) $259</em>. A camp on set dates, like a Christmas camp? Add it with <strong>Add an event</strong> on your page: it shows on What’s On.</p>`,
          aFr: `<p>Les cours sont votre activité principale : votre cours de groupe le moins cher est votre <strong>Prix</strong>${price.fr ? ` (« ${e(price.fr)} »)` : ''}. Chaque cours ou programme va dans <strong>Vos tarifs</strong>, une ligne chacun, avec pour qui et combien de temps dans ses détails, comme <em>Cours privé, 1 heure 189 $ (1 à 3 personnes)</em> ou <em>Club des jeunes (5 à 12 ans) 259 $</em>. Un camp à des dates fixes, comme un camp de Noël? Ajoutez-le avec <strong>Ajouter un événement</strong> sur votre page : il paraît dans À l’affiche.</p>` };
      }
      const ex = w('lesson');
      const chip = ((SK.K[kind] || {}).en || { groups: { chips: [] } }).groups.chips.find((c) => /lesson|clinic|camp/i.test(c)), chipFr = chip ? ((SK.K[kind].fr.groups.chips || [])[SK.K[kind].en.groups.chips.indexOf(chip)] || chip) : null;
      const pro = golfish ? null : w('pro');
      t = both(t, [['<em>Junior clinic, 4 weeks $120</em>', `<em>${e(ex[0])}</em>`], ['tap the chip that fits (like <strong>Group lessons and clinics</strong>) or say it in your words', chip ? `tap the chip that fits (like <strong>${e(chip)}</strong>) or say it in your words` : 'say it in your own words']],
        [['<em>Clinique junior, 4 semaines 120 $</em>', `<em>${e(ex[1])}</em>`], ['touchez le choix qui convient (comme <strong>Cours et cliniques de groupe</strong>) ou écrivez-le dans vos mots', chipFr ? `touchez le choix qui convient (comme <strong>${e(chipFr)}</strong>) ou écrivez-le dans vos mots` : 'écrivez-le dans vos mots']]);
      if (pro) t = both(t, [[/Lessons with outside pros who set their own prices\?[\s\S]*?<\/em>\./, `Lessons with independent coaches who set their own prices? Leave them out of Your prices and say it in one line in <strong>Good to know</strong>, like <em>${e(pro[0])}</em>.`]],
        [[/Des cours avec des pros de l’extérieur qui fixent leurs propres prix\?[\s\S]*?<\/em>\./, `Des cours avec des entraîneurs indépendants qui fixent leurs propres prix? Laissez-les hors de Vos tarifs et dites-le en une ligne dans <strong>Bon à savoir</strong>, comme <em>${e(pro[1])}</em>.`]]);
      return t;
    }
    case 'indoor-swim-times': {
      title(...w('swimQ'));
      if (kind === 'skischool') return both(t, [[/The exact lesson times/, 'The lesson start times'], [/“Drop-in times daily 1–3 PM”|“Lesson[^”]*”/, '“Lessons at 9:15 AM and 1:15 PM”'], [/<em>Times change by season, see our website<\/em>/, '<em>Lesson times change with the season: see our website</em>']],
        [[/Les heures précises des séances/, 'Les heures de début des cours'], [/« Périodes libres tous les jours de 13 h à 15 h »/, '« Cours à 9 h 15 et 13 h 15 »'], [/<em>Les heures changent selon la saison, voyez notre site Web<\/em>/, '<em>Les heures des cours changent selon la saison : voyez notre site Web</em>']]);
      return t;
    }
    case 'indoor-age': {
      const ages = (SK.K[kind] || SK.K.sportother);
      return { ...t, a: `<p>Little ones can come, like a kids’ program from age 3? Pick <strong>All ages</strong>, and say the ages in one line in Good to know, like <em>${e(ages.en.help.ages)}</em>.</p>${t.a}`, aFr: `<p>Les tout-petits peuvent venir, comme un programme pour enfants dès 3 ans? Choisissez <strong>Tous les âges</strong>, et dites les âges en une ligne dans Bon à savoir, comme <em>${e(ages.fr.help.ages)}</em>.</p>${t.aFr}` };
    }
    case 'indoor-good-to-know': {
      title('Rules and tips for visitors: where do I say that?', 'Règles et conseils aux visiteurs : où le dire?');
      const th = SK.BUSY_THEME[kind] || SK.BUSY_THEME.sportother, rf = w('refund');
      return both(t, [['A weekly hour, like a sensory-friendly hour?', 'A weekly time?'], ['<em>Sensory-friendly hour Tuesdays 9–10 AM</em>', `<em>${e(th[1])}</em>`], ['write “every Tuesday”', `write “${e(th[2])}”`], ['<em>24-hour cancellation policy; missed appointments are charged</em>', `<em>${e(rf[0])}</em>`]],
        [['Une heure chaque semaine, comme une heure adaptée aux besoins sensoriels?', 'Un moment chaque semaine?'], ['<em>Heure adaptée aux besoins sensoriels le mardi de 9 h à 10 h</em>', `<em>${e(th[4])}</em>`], ['écrivez « chaque mardi »', `écrivez « ${e(th[5])} »`], ['<em>Annulation 24 heures à l’avance; les rendez-vous manqués sont facturés</em>', `<em>${e(rf[1])}</em>`]]);
    }
    case 'indoor-theme-nights': { const q = w('themeQ'); title(`Weekly nights and events (like ${q[0]})`, `Soirées et activités de chaque semaine (comme ${q[1]})`); return t; }
    case 'indoor-camps': {
      const c = w('camp');
      if (WINTER(kind)) title('Christmas, spring break or PD-day camps', 'Camps de Noël, de la relâche ou des journées pédagogiques');
      return both(t, [['(summer, spring break or a PD day)', WINTER(kind) ? '(Christmas, spring break or a PD day)' : '(summer, spring break or a PD day)'], [/<em>Summer art camps for ages 6–12<\/em>/, `<em>${e(c[0])}</em>`], ['like July 5 to August 27', WINTER(kind) ? 'like December 21 to 26' : 'like July 5 to August 27']],
        // A winter kind's camp dates are in winter.
        [['(l’été, la relâche ou une journée pédagogique)', WINTER(kind) ? '(Noël, la relâche ou une journée pédagogique)' : '(l’été, la relâche ou une journée pédagogique)'], [/<em>Camps d’art d’été pour les 6 à 12 ans<\/em>/, `<em>${e(c[1])}</em>`], ['comme du 5 juillet au 27 août', WINTER(kind) ? 'comme du 21 au 26 décembre' : 'comme du 5 juillet au 27 août']]);
    }
    case 'indoor-price-varies': {
      const two = w('two'), sec = w('twoSection'), fr = w('twoFrom');
      const ems = (x) => x.split(', ').map((p) => { const m = /^(.*) (\d+)$/.exec(p); return m ? `<em>${e(m[1])}</em> <em>${m[2]}</em>` : `<em>${e(p)}</em>`; }).join(', ');
      return both(t, [[/<em>Classic pedicure<\/em> <em>55<\/em>, <em>Spa pedicure<\/em> <em>70<\/em>|<em>Classic pedicure 55, Spa pedicure 70<\/em>/, ems(two[0])], ['<em>Pedicures</em>', `<em>${e(sec[0])}</em>`], ['<em>Pedicures from $55</em>', `<em>${e(fr[0])}</em>`]],
        [[/<em>Pédicure classique<\/em> <em>55<\/em>, <em>Pédicure spa<\/em> <em>70<\/em>|<em>Pédicure classique 55, Pédicure spa 70<\/em>/, ems(two[1])], ['<em>Pédicures</em>', `<em>${e(sec[1])}</em>`], ['<em>Pédicures à partir de 55 $</em>', `<em>${e(fr[1])}</em>`]]);
    }
    case 'indoor-access':
      return both(t, [['(an elevator to the second floor, stroller parking, sensory-friendly hours)', '(an elevator, stroller parking, an accessible washroom)']], [['(un ascenseur vers l’étage, un espace pour les poussettes, des heures adaptées sensoriellement)', '(un ascenseur, un espace pour les poussettes, des toilettes accessibles)']]);
    case 'indoor-required-buy': {
      const r = w('required');
      title('Something people must buy or rent (like a helmet)', 'Quelque chose à acheter ou à louer obligatoirement (comme un casque)');
      return both(t, [['<em>Grip socks (required) $3</em>', `<em>${e(r[0])}</em>`], ['(tap <strong>Grip socks required</strong> or type a line)', '(type a line)']],
        [['<em>Chaussettes antidérapantes (obligatoires) 3 $</em>', `<em>${e(r[1])}</em>`], ['(touchez <strong>Chaussettes antidérapantes obligatoires</strong> ou écrivez une ligne)', '(écrivez une ligne)']]);
    }
    case 'sport-part-season':
      if (kind !== 'range') title('Only part of my place is seasonal (like the patio)', 'Seule une partie de mon endroit est saisonnière (comme la terrasse)');
      return t;
    case 'indoor-price-two': {
      const typer = SK.TYPER[kind] || SK.TYPER.sportother, p = (typeof ctx.amount === 'number' && ctx.amount > 0 ? ctx.amount : SK.EX_PRICE[kind] || 15) * 2;
      return both(t, [[/<em>Date night for two<\/em> and <em>95<\/em>|<em>Date night for two and 95<\/em>/, `<em>${e(typer[0])} for two</em> and <em>${p}</em>`], [/A package \(a couples’ massage, a spa day\) is the same: one line with its name and price, like <em>Couples’ massage package<\/em> and <em>260<\/em>\./, 'A package is the same: one line with its name and price.'], [/A package \(a couples’ massage, a spa day\) is the same: one line with its name and price, like <em>Couples’ massage package and 260<\/em>\./, 'A package is the same: one line with its name and price.'], [/, like <em>Couples’ packages<\/em>/, '']],
        [[/<em>Soirée en amoureux pour deux<\/em> et <em>95<\/em>|<em>Soirée en amoureux pour deux et 95<\/em>/, `<em>${e(typer[2])} pour deux</em> et <em>${p}</em>`], [/Un forfait \(un massage en couple, une journée au spa\) c’est pareil : une ligne avec son nom et son prix, comme <em>Forfait massage en couple[^<]*<\/em>(?: et <em>260<\/em>)?\./, 'Un forfait, c’est pareil : une ligne avec son nom et son prix.'], [/, comme <em>Forfaits pour couples<\/em>/, '']]);
    }
    case 'sport-per-person': {
      const ex = { skischool: ['Private lesson, 1 hour $189 (1 to 3 people, same price)', 'Cours privé, 1 heure 189 $ (1 à 3 personnes, même prix)'] }[kind];
      t = both(t, [['<p>No. Show your prices the way you charge, like', '<p>Show each price the way you charge it, with who it’s for in its details, like']], [['<p>Non. Montrez vos prix comme vous les facturez, comme', '<p>Montrez chaque prix comme vous le facturez, avec pour qui dans ses détails, comme']]);
      return ex ? both(t, [[/<em>[^<]*<\/em>/, `<em>${e(ex[0])}</em>`]], [[/<em>[^<]*<\/em>/, `<em>${e(ex[1])}</em>`]]) : t;
    }
    case 'indoor-extras': title('Extras: rentals and add-ons', 'Extras : location et suppléments'); return { ...t, over: (t.over || []).filter((x) => x !== 'indoor-groups') };
    case 'indoor-also-offer': title('Where do I put the other things we offer?', 'Où mettre les autres choses que nous offrons?'); return t;
    case 'indoor-family-day': return both(t, [['Free family day with crafts on the ', 'Free family day on the ']], [['Journée familiale gratuite avec bricolage le ', 'Journée familiale gratuite le ']]);
    default: return t;
  }
}
module.exports = { WORDS, word, TOPICS, MORE_KEYS, tokens, kindHelp, fill };
