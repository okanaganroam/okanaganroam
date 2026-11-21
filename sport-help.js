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
    _: ['Christmas Eve: closes at 2 PM', 'Veille de Noël : ferme à 14 h'], rink: ['Dec 24: public skate until 4 PM', '24 déc. : patinage libre jusqu’à 16 h'], skischool: ['Christmas Eve: the desk closes at 2 PM', 'Veille de Noël : le comptoir ferme à 14 h'],
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
  // Sport test 6 (2026-11-20; Priya, City recreation staff at an arena): extra sessions on set dates, a photo with no
  // faces, and "we don't have rentals" in the kind's words.
  extra: {
    _: ['Holiday drop-in sessions, December 27, 1–3 PM', 'Séances libres des fêtes, 27 décembre, de 13 h à 15 h', 'daily to January 3', 'tous les jours jusqu’au 3 janvier'],
    rink: ['Holiday public skates, December 26, 1–3 PM', 'Patinage libre des fêtes, 26 décembre, de 13 h à 15 h', 'daily to January 3', 'tous les jours jusqu’au 3 janvier'],
    skischool: ['Holiday lessons, December 26, 9:30 AM', 'Cours des fêtes, 26 décembre, 9 h 30', 'daily to January 3', 'tous les jours jusqu’au 3 janvier'],
    swim: ['Extra public swims, July 1, 1–4 PM', 'Bains libres en plus, 1er juillet, de 13 h à 16 h', 'daily to July 5', 'tous les jours jusqu’au 5 juillet'],
    golf: ['Holiday twilight golf, July 1, from 4 PM', 'Golf au crépuscule, 1er juillet, dès 16 h', 'daily to July 5', 'tous les jours jusqu’au 5 juillet'],
    range: ['Glow mini golf nights, July 1, 7–10 PM', 'Mini-golf fluo, 1er juillet, de 19 h à 22 h', 'daily to July 5', 'tous les jours jusqu’au 5 juillet'],
    simgolf: ['Holiday open bays, December 27, 10 AM–2 PM', 'Baies libres des fêtes, 27 décembre, de 10 h à 14 h', 'daily to January 3', 'tous les jours jusqu’au 3 janvier'],
  },
  emptyPhoto: {
    _: ['your place with nobody in it', 'votre endroit sans personne'], rink: ['the empty ice, or the front doors', 'la glace vide ou l’entrée'],
    swim: ['the empty pool', 'la piscine vide'], golf: ['the course', 'le parcours'], range: ['the range', 'le champ de pratique'], simgolf: ['an empty bay', 'une baie vide'],
    skischool: ['the slopes or your school sign', 'les pentes ou votre affiche'], skatepark: ['the empty park', 'le parc vide'], courts: ['the empty courts', 'les terrains vides'],
    sportsctr: ['the empty gym', 'le gymnase vide'], bike: ['the track', 'la piste'], discgolf: ['a basket on the course', 'un panier du parcours'],
  },
  bookWhat: {
    _: ['a time or a spot', 'une période ou une place'], rink: ['ice rentals or birthday parties', 'la glace ou les fêtes d’anniversaire'], golf: ['tee times', 'les départs'],
    simgolf: ['bays', 'les baies'], range: ['lessons', 'les cours'], skischool: ['lessons', 'les cours'], swim: ['lessons or pool rentals', 'les cours ou la location de la piscine'],
    courts: ['courts', 'les terrains'], sportsctr: ['a gym, a court or a room', 'un gymnase, un terrain ou une salle'], skatepark: ['lessons or camps', 'les cours ou les camps'],
    bike: ['race or practice nights', 'les soirées de course ou d’entraînement'], discgolf: ['leagues or tournaments', 'les ligues ou les tournois'],
  },
  noRent: {
    _: ['No rentals here: bring your own gear', 'Pas de location sur place : apportez votre équipement'],
    rink: ['No skate rentals or sharpening here: bring your own skates', 'Pas de location ni d’aiguisage de patins ici : apportez vos patins'],
    golf: ['No club rentals: bring your own clubs', 'Pas de location de bâtons : apportez vos bâtons'], range: ['No club rentals: bring your own clubs', 'Pas de location de bâtons : apportez vos bâtons'],
    skischool: ['No rentals at the school: rent at the resort’s shop', 'Pas de location à l’école : louez à la boutique de la station'],
    swim: ['No towel or swimsuit rentals: bring your own', 'Pas de location de serviettes ni de maillots : apportez les vôtres'],
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
    // Sport test 6 (Priya: "does the page need to be in french too? i dont speak french"): the page's French, not staff.
    notIf: ['i dont speak french', 'i do not speak french', 'need to be in french', 'be in french too', 'je ne parle pas francais', 'doit etre en francais'],
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
    aFr: '<p>Mettez les heures où la plupart des gens peuvent l’utiliser, comme <em>de 7 h à 22 h</em>, pour que votre page puisse dire ouvert ou fermé. Dites-le ensuite en une ligne dans <strong>Bon à savoir</strong>, comme <em>Ouvert du lever au coucher du soleil</em>{LIT_FR}.</p>' },  // ── Sport test 6 (2026-11-20; Priya, recreation programmer for the City at an arena: 11 good answers of 34; any question
  // that said "the city" got one answer, and "add the holiday skates dec 26 to jan 3" got Special closures). ──
  { id: 'sport-extra-sessions', pages: ['setup', 'edit'], over: ['closures', 'setup-closures', 'setup-closure-fix', 'event-add', 'event-repeat', 'indoor-camps', 'sport-holiday-short', 'indoor-holiday-open', 'hours-open-holidays', 'hours', 'seasonal-hours', 'sport-peak-dates', 'sport-one-off-closure', 'indoor-theme-nights', 'indoor-swim-times', 'setup-third-time', 'hours-third-stretch', 'indoor-busy-times', 'sport-public'],
    q: 'Extra times on set dates (like holiday sessions)', qFr: 'Des périodes en plus à des dates précises (comme pendant les fêtes)',
    allOf: [['add', 'extra', 'special', 'more', 'bonus', 'additional', 'ajout', 'supplement', 'speciau', 'special'], ['skate', 'skating', 'session', 'swim', 'shinny', 'patin', 'seance', 'bain', 'periode', 'bays', 'baies']],
    allOf2: [['holiday', 'christmas', 'xmas', 'spring', 'fetes', 'noel', 'relache'], ['skates', 'sessions', 'swims', 'patinages', 'seances', 'bains']],
    keys: ['holiday skates', 'extra skates', 'extra public skates', 'special skates', 'add skates', 'add the skates', 'holiday public skates', 'extra public skating', 'extra sessions', 'holiday sessions', 'extra lessons on', 'extra times', 'so people see them', 'run extra'],
    keysFr: ['patinages des fetes', 'patinage des fetes', 'patinages supplementaires', 'patinages en plus', 'seances supplementaires', 'seances en plus', 'bains supplementaires', 'ajouter des patinages', 'periodes en plus'],
    a: '<p>Those are extra open times, not closures: leave those days unticked in <strong>Closures and holidays</strong> (ticked, your page would say you’re closed). On your page, tap <strong>Add an event</strong>, give it the first date and time, like <em>{EXTRA_EX}</em>, and write <em>{EXTRA_REPEAT}</em> under <strong>Repeats or other dates?</strong> It shows on your page and on What’s On, and we add the other dates for you, usually within a day.</p><p>Closed on Christmas Day? Tick it in Closures and holidays. Closing early one day? Say it in one line in <strong>Good to know</strong>, like <em>{HOLIDAY_EX}</em>.</p>',
    aFr: '<p>Ce sont des périodes d’ouverture en plus, pas des fermetures : laissez ces jours non cochés dans <strong>Fermetures et jours fériés</strong> (cochés, votre page dirait que vous êtes fermé). Sur votre page, touchez <strong>Ajouter un événement</strong>, donnez la première date et l’heure, comme <em>{EXTRA_EX}</em>, et écrivez <em>{EXTRA_REPEAT}</em> sous <strong>Récurrent ou autres dates?</strong> L’événement paraît sur votre page et dans À l’affiche, et nous ajoutons les autres dates pour vous, en général d’ici un jour.</p><p>Fermé le jour de Noël? Cochez-le dans Fermetures et jours fériés. Vous fermez plus tôt un jour? Dites-le en une ligne dans <strong>Bon à savoir</strong>, comme <em>{HOLIDAY_EX}</em>.</p>' },
  { id: 'sport-city-say', pages: ['setup', 'edit'], over: ['sport-public', 'not-owner', 'staff', 'description', 'story', 'indoor-local-owned', 'sport-shared-social', 'logo', 'photo-add'],
    q: 'Can we say it’s a City facility? (We don’t endorse the site)', qFr: 'Pouvons-nous dire que c’est une installation de la ville? (Sans appuyer le site)',
    allOf: [['say', 'mention', 'write', 'call', 'dire', 'mentionn', 'indiqu', 'ecrire', 'preciser'], ['city', 'citys', 'ville', 'municip', 'district', 'town']],
    keys: ['endorse', 'endorsing', 'endorsement', 'endorsed', 'endorses', 'city logo', 'our logo', 'official city', 'look like the city', 'say its a city', 'say it is a city', 'say we are a city', 'say its run by the city', 'not an endorsement'],
    keysFr: ['appuyer', 'appui', 'approuve votre site', 'endosser', 'logo de la ville', 'arena de la ville', 'installation de la ville'],
    a: '<p>Yes. Say it in your story, like <em>Run by the City’s recreation department</em>. Okanagan Roam is an independent visitor guide: your page is a free listing, never paid for, and it doesn’t say or suggest the City endorses the site. No logo is needed.</p>',
    aFr: '<p>Oui. Dites-le dans votre histoire, comme <em>Géré par le service des loisirs de la ville</em>. Okanagan Roam est un guide indépendant pour les visiteurs : votre page est une fiche gratuite, jamais payée, et elle ne dit pas et ne laisse pas entendre que la ville appuie le site. Aucun logo n’est nécessaire.</p>' },
  { id: 'sport-approval-first', pages: ['setup', 'edit'], over: ['access', 'staff', 'setup-change-later', 'setup-live-when', 'setup-who-sees', 'login-create', 'easy-setup', 'indoor-fill-all', 'sport-public', 'settings', 'live-speed', 'description', 'story'],
    q: 'Someone has to approve what we write before it goes public', qFr: 'Quelqu’un doit approuver ce que nous écrivons avant que ce soit public',
    allOf: [['approv', 'comms', 'communications', 'supervisor', 'manager', 'boss', 'council', 'sign off', 'review', 'approb', 'superviseur', 'gestionnaire', 'patron', 'conseil'], ['first', 'before', 'public', 'live', 'goes', 'come back', 'save', 'avant', 'public', 'enregistr', 'revenir', 'see']],
    keys: ['approved by', 'has to be approved', 'needs approval', 'need approval', 'approval first', 'approved first', 'comms team', 'communications team', 'our comms', 'before it goes public', 'before it goes live', 'save it and come back', 'come back later', 'sign off on', 'needs to see anything'],
    keysFr: ['approuve par', 'doit etre approuve', 'approbation', 'equipe des communications', 'les communications', 'avant que ce soit public', 'enregistrer et revenir', 'revenir plus tard'],
    a: '<p>That’s fine. Your answers save as you go: skip any screen, leave it empty and come back with the same link. Most answers (hours, prices, who can come) show on your page as soon as they’re saved, so leave one empty until it’s approved. Your story and photos are checked by Dayton first and show within a day. Your comms team can open this same link, or each make their own login (tap <strong>Create a login</strong> on the finish screen).</p>',
    aFr: '<p>Aucun problème. Vos réponses s’enregistrent au fur et à mesure : passez un écran, laissez-le vide et revenez avec le même lien. La plupart des réponses (heures, prix, qui peut venir) paraissent sur votre page dès qu’elles sont enregistrées : laissez-en une vide jusqu’à son approbation. Votre histoire et vos photos sont d’abord vérifiées par Dayton et paraissent d’ici un jour. Votre équipe des communications peut ouvrir ce même lien, ou chacun peut créer sa connexion (touchez <strong>Créer une connexion</strong> sur l’écran de fin).</p>' },
  { id: 'sport-photo-consent', pages: ['setup', 'edit'], over: ['photo-add', 'photo-rights', 'photo-credit', 'sport-public', 'indoor-age', 'privacy', 'photos-when'],
    q: 'Our photos have kids in them (photo consent)', qFr: 'Nos photos montrent des enfants (consentement)',
    allOf: [['photo', 'picture', 'pics', 'image'], ['kid', 'child', 'consent', 'face', 'minor', 'enfant', 'consentement', 'visage', 'mineur', 'parents']],
    keys: ['consent', 'photo consent', 'consent policy', 'consent form', 'release form', 'model release', 'kids in them', 'kids in the photos', 'children in the photos', 'faces in them', 'photo policy'],
    keysFr: ['consentement', 'enfants sur les photos', 'des enfants sur', 'visages', 'politique de photos', 'formulaire de consentement'],
    a: '<p>Only send photos you’re allowed to share: ones with no faces, or with the signed consent your policy asks for. A photo of {EMPTY_PHOTO} works well. Need one taken down later? Tap <strong>Message us</strong> and Dayton removes it, usually within a day.</p>',
    aFr: '<p>N’envoyez que des photos que vous pouvez partager : sans visages, ou avec le consentement signé que votre politique demande. Une photo de {EMPTY_PHOTO_FR} fonctionne bien. Il faut en retirer une plus tard? Touchez <strong>Écrivez-nous</strong> et Dayton la retire, en général d’ici un jour.</p>' },
  { id: 'sport-terms', pages: ['setup', 'edit'], over: ['cost', 'sport-public', 'not-owner', 'staff', 'privacy', 'claim', 'indoor-fill-all'],
    q: 'Do I have to sign anything? (Terms, cost)', qFr: 'Dois-je signer quelque chose? (Conditions, coût)',
    allOf: [['sign', 'signer', 'agree', 'accept', 'paperwork', 'contract', 'contrat', 'legal'], ['anything', 'terms', 'condition', 'employee', 'something', 'quelque', 'contract', 'agreement', 'form', 'formulaire', 'employe']],
    keys: ['sign anything', 'agree to terms', 'terms and conditions', 'terms of use', 'the terms', 'a contract', 'an agreement', 'paperwork', 'as a city employee', 'as an employee', 'legal'],
    keysFr: ['signer quelque chose', 'conditions d utilisation', 'les conditions', 'un contrat', 'une entente', 'paperasse', 'comme employe'],
    a: '<p>Nothing to sign, and no cost: the listing is free. Using the portal means the site’s <a href="/terms" target="_blank" rel="noopener">terms</a> apply. Need something for your files? Tap <strong>Message us</strong> and Dayton sends you a short note.</p>',
    aFr: '<p>Rien à signer, et c’est gratuit : la fiche ne coûte rien. Utiliser le portail veut dire que les <a href="/terms" target="_blank" rel="noopener">conditions</a> du site s’appliquent. Il vous faut quelque chose pour vos dossiers? Touchez <strong>Écrivez-nous</strong> et Dayton vous envoie une courte note.</p>' },
  { id: 'sport-no-rentals', pages: ['setup', 'edit'], over: ['sport-rentals', 'indoor-extras', 'indoor-good-to-know', 'menu-add', 'dont-have', 'indoor-price', 'features'],
    q: 'We don’t have rentals: where do I say that?', qFr: 'Nous n’avons pas de location : où le dire?',
    keys: ['no skate rentals', 'dont have skate rentals', 'dont have rentals', 'dont do rentals', 'no rentals', 'no rental', 'dont rent', 'no sharpening', 'dont have sharpening', 'dont offer rentals', 'no club rentals', 'dont have club rentals', 'bring your own'],
    keysFr: ['pas de location', 'pas de location de patins', 'aucune location', 'pas d aiguisage', 'on ne loue pas', 'nous ne louons pas'],
    a: '<p>Say it in one line in <strong>Good to know</strong>, like <em>{NO_RENT}</em>, and leave {RENT_CHIP_EN} unticked. Your page and search then don’t say you rent.</p>',
    aFr: '<p>Dites-le en une ligne dans <strong>Bon à savoir</strong>, comme <em>{NO_RENT_FR}</em>, et laissez {RENT_CHIP_FR} non coché. Votre page et la recherche ne diront pas que vous louez.</p>' },
  { id: 'sport-booking-link', pages: ['setup', 'edit'], over: ['indoor-booking', 'indoor-book-party', 'indoor-groups', 'booking-link', 'links', 'newlink', 'tour-booking-only', 'sport-tee-times', 'website-broken'],
    q: 'Our booking link is for rentals or parties: does it go here?', qFr: 'Notre lien de réservation sert aux locations ou aux fêtes : va-t-il ici?',
    allOf: [['link', 'lien', 'url'], ['book', 'reserv', 'rental', 'rent', 'location']],
    keys: ['do i put that link here', 'put that link here', 'is that the booking link', 'which link do i put', 'booking link here', 'that link here', 'booked through the city', 'booked through the city website'],
    keysFr: ['ce lien ici', 'je mets ce lien', 'quel lien mettre', 'reserve sur le site de la ville'],
    a: '<p>Yes, if it’s where people book {BOOK_WHAT}. Paste it in the booking link box: your page’s button says <strong>{BOOK_BTN}</strong> (<strong>Book a party</strong> when the link is your party page). Walk-ins welcome? It’s a smaller button after Website, and your page still says there’s no need to book.</p>',
    aFr: '<p>Oui, si c’est là que les gens réservent {BOOK_WHAT_FR}. Collez-le dans la case du lien de réservation : le bouton de votre page indique <strong>{BOOK_BTN_FR}</strong> (<strong>Réserver une fête</strong> si le lien est votre page de fêtes). Sans réservation? C’est un bouton plus petit après Site Web, et votre page indique toujours qu’il n’est pas nécessaire de réserver.</p>' },
  { id: 'sport-drop-in-hockey', kinds: ['rink'], pages: ['setup', 'edit', 'menu'], over: ['indoor-also-offer', 'sport-rate-lines', 'indoor-price-varies', 'indoor-extras', 'indoor-theme-nights', 'menu-add', 'indoor-price', 'sport-lessons', 'indoor-good-to-know', 'sport-what-to-bring', 'indoor-groups', 'sport-kinds-other', 'sport-second-kind'],
    q: 'Shinny, stick and puck or drop-in hockey', qFr: 'Hockey libre, bâton et rondelle',
    keys: ['shinny', 'stick and puck', 'stick n puck', 'stick puck', 'drop in hockey', 'pickup hockey', 'pick up hockey', 'adult hockey', 'hockey drop in', 'cage only', 'helmets with cage', 'full cage'],
    keysFr: ['hockey libre', 'baton et rondelle', 'batons et rondelles', 'grille complete', 'casque avec grille'],
    a: '<p>Each one is a line in <strong>Your prices</strong>, like <em>Shinny $9</em> and <em>Stick and puck $8</em>, with its times in the line’s details if they’re set. Gear rules go in one line in <strong>Good to know</strong>, like <em>Helmets with full cages for shinny and stick and puck</em>. Your adult public skate stays your main price, and search finds you for shinny and drop-in hockey.</p>',
    aFr: '<p>Chacun est une ligne dans <strong>Vos tarifs</strong>, comme <em>Hockey libre 9 $</em> et <em>Bâton et rondelle 8 $</em>, avec ses heures dans les détails de la ligne si elles sont fixes. Les règles d’équipement vont en une ligne dans <strong>Bon à savoir</strong>, comme <em>Casque avec grille complète pour le hockey libre et bâton et rondelle</em>. Votre patinage libre adulte reste votre prix principal, et la recherche vous trouve pour le hockey libre.</p>' },
  // Sport test 7 (2026-11-20; Kayla, Predator Ridge: the resort questions Help missed). Each answer explains what to do
  // with what is already here: no new fields (Dayton: "Copy my answers to our other course" is not a feature).
  { id: 'sport-two-courses', kinds: ['golf'], pages: ['setup', 'edit'], over: ['sport-one-listing', 'sport-second-kind', 'indoor-kinds-many', 'more-businesses', 'setup-status', 'sport-rate-change', 'indoor-booking'],
    q: 'We have two courses: do I do this twice?', qFr: 'Nous avons deux terrains : je fais tout deux fois?',
    keys: ['two courses', 'two 18s', 'two 18', 'both courses', 'second course', 'other course', 'our other course', 'sister course', 'two golf courses', 'do this twice', 'whole thing twice', 'do it twice', 'do this for both', 'two rinks', 'two arenas', 'two pools', 'two parks', 'other rink', 'other pool', 'other location', 'second location', 'two locations', 'each course'],
    keysFr: ['deux terrains', 'deux parcours', 'deux 18 trous', 'autre terrain', 'autre parcours', 'deuxieme terrain', 'deux fois', 'tout refaire', 'les deux terrains', 'deux patinoires', 'deux piscines', 'autre emplacement'],
    allOf: [['two', 'both', 'second', 'other', 'sister', 'twice', 'deux', 'autre', 'deuxieme', 'jumeau'], ['course', 'courses', '18s', 'nines', 'rinks', 'arenas', 'pools', 'parks', 'locations', 'terrain', 'parcours', 'patinoires', 'piscines', 'emplacement']],
    a: '<p>Yes, one at a time: each course has its own page here, with its own private link and its own setup, so its hours, season, prices and photos are right for that course. Do this one now. The other course’s answers are mostly the same, so the second goes quicker. No link for the other one? Tap <strong>Message us</strong> and Dayton will send it.</p>',
    aFr: '<p>Oui, un à la fois : chaque terrain a sa propre page ici, avec son propre lien privé et sa propre configuration, pour que ses heures, sa saison, ses tarifs et ses photos soient les bons. Faites celui-ci maintenant. Les réponses de l’autre terrain sont surtout les mêmes : le deuxième va plus vite. Pas de lien pour l’autre? Touchez <strong>Écrivez-nous</strong> et Dayton vous l’enverra.</p>' },
  { id: 'sport-sister-listing', kinds: ['golf'], pages: ['setup', 'edit'], over: ['sport-second-kind', 'indoor-kinds-many', 'sport-kinds-other', 'photo-rights', 'sport-one-listing', 'sport-season-says', 'sport-season'],
    q: 'Part of our place already has its own page', qFr: 'Une partie de notre endroit a déjà sa propre page',
    keys: ['already has its own page', 'has its own page', 'its own page', 'own page on your site', 'its own listing', 'own listing', 'already has a page', 'already listed', 'separate page', 'sim lounge', 'simulator lounge', 'sim lounge is open', 'tick indoor golf'],
    keysFr: ['sa propre page', 'sa propre fiche', 'deja une page', 'deja une fiche', 'salon de simulateurs', 'cocher golf interieur'],
    // Sport test 11 (2026-11-21; Geneviève's simulator has no page of its own, and this said « il a sa propre page »): the
    // answer follows the data: another listing at her address or under her name (ctx.sister), or none.
    a: '{SISTER_SAYS_EN}', aFr: '{SISTER_SAYS_FR}' },
  { id: 'sport-social-hour', pages: ['setup', 'edit'], over: ['no-website-social', 'sport-shared-social', 'sport-restaurant', 'social-post', 'hh-times', 'hh-deals'],
    q: 'Our "social hour" (happy hour) at the clubhouse or its restaurant', qFr: 'Notre « heure sociale » (5 à 7) au club-house ou à son restaurant',
    keys: ['social hour', 'social hours', 'apres golf', 'après golf', 'apres ski', 'drink specials', 'happy hour at', 'happy hour on both'],
    keysFr: ['heure sociale', 'apres golf', '5 a 7 au', 'cinq a sept'],
    allOf: [['social', 'sociale'], ['hour', 'heure', '3 5', 'pints', 'flatbreads', 'specials', 'deals', 'daily']],
    a: '<p>That’s your happy hour: tap <strong>Happy hour</strong> in More about your place, pick the days and times, and add the deals, like <em>$7 pints, $9 wine</em>. Your page says “Happy hour on now” at those times. The restaurant has its own page too? That’s fine: put it on both.</p>',
    aFr: '<p>C’est votre 5 à 7 : touchez <strong>5 à 7</strong> dans Plus sur votre endroit, choisissez les jours et les heures, et ajoutez les spéciaux, comme <em>Pintes à 7 $, vin à 9 $</em>. Votre page indique « 5 à 7 en cours » à ces heures. Le restaurant a aussi sa page? C’est correct : mettez-le sur les deux.</p>' },
  { id: 'sport-two-accounts', pages: ['setup', 'edit'], over: ['no-website-social', 'sport-shared-social', 'links', 'social-post'],
    q: 'We have two Instagram (or Facebook) accounts: which one?', qFr: 'Nous avons deux comptes Instagram (ou Facebook) : lequel?',
    keys: ['two instagram', 'two instagrams', 'second instagram', 'another instagram', 'golf only instagram', 'golf instagram', 'which instagram', 'which account', 'which one should go here', 'two accounts', 'two facebook', 'which facebook', 'resort instagram', 'also run a'],
    keysFr: ['deux instagram', 'deux comptes', 'quel compte', 'quel instagram', 'autre compte', 'deux facebook'],
    allOf: [['two', 'second', 'another', 'which', 'deux', 'autre', 'quel'], ['instagram', 'insta', 'facebook', 'account', 'compte', 'handle']],
    a: '<p>Put the one visitors to this place should follow: usually the account just for it (your golf one), else the resort’s. There’s one box for each, Instagram and Facebook, so pick one of each.</p>',
    aFr: '<p>Mettez celui que les visiteurs de cet endroit devraient suivre : d’habitude le compte qui lui est propre (celui du golf), sinon celui du centre. Il y a une case pour chacun, Instagram et Facebook : choisissez-en un de chaque.</p>' },
  { id: 'sport-shuttle', kinds: ['golf'], pages: ['setup', 'edit'], over: ['sport-free-clubs', 'indoor-good-to-know', 'description', 'parking-paid', 'indoor-free', 'getting-there'],
    q: 'A shuttle or getting around (resort shuttle, parking shuttle)', qFr: 'Une navette ou les déplacements sur place',
    keys: ['shuttle', 'shuttles', 'free shuttle', 'resort shuttle', 'shuttle bus', 'shuttle from', 'getting around the resort', 'golf cart to the', 'transport from the lodge', 'pick up from the lodge'],
    keysFr: ['navette', 'navettes', 'navette gratuite', 'navette du centre', 'transport sur place'],
    a: '<p>Worth a line: say it in <strong>Good to know</strong>, like <em>Free shuttle from the Lodge and cottages to the clubhouse</em>, or in your story. It shows under “Your visit” on your page, and Build My Trip reads it.</p>',
    aFr: '<p>Ça vaut une ligne : dites-le dans <strong>Bon à savoir</strong>, comme <em>Navette gratuite du Lodge et des chalets au club-house</em>, ou dans votre histoire. Ça paraît sous « Votre visite » sur votre page, et Planifier mon voyage le lit.</p>' },
  { id: 'sport-twilight-times', kinds: ['golf'], pages: ['setup', 'edit', 'menu'], over: ['sport-rate-lines', 'indoor-summer-late', 'seasonal-hours', 'hours', 'indoor-busy-times', 'setup-season'],
    q: 'Twilight starts at different times through the season', qFr: 'Le tarif crépuscule commence à des heures différentes selon la saison',
    keys: ['twilight starts', 'twilight start', 'twilight time', 'twilight times', 'twilight begins', 'twilight after', 'twilight rate starts', 'twilight is after', 'when twilight starts'],
    keysFr: ['crepuscule commence', 'tarif crepuscule', 'crepuscule a partir', 'crepuscule des'],
    allOf: [['twilight', 'crepuscule', 'sunset'], ['start', 'begin', 'after', 'earlier', 'later', 'time', 'fall', 'summer', 'commence', 'partir', 'heure', 'automne', 'ete']],
    a: '<p>That’s a price, not your hours: one line per twilight rate in <strong>Your prices</strong>, with its start time in the details, like <em>Twilight 18 holes $180 – after 3 PM June to August, after 1 PM in the fall</em>. Your hours stay first tee to last tee.</p>',
    aFr: '<p>C’est un tarif, pas vos heures : une ligne par tarif crépuscule dans <strong>Vos tarifs</strong>, avec l’heure de début dans les détails, comme <em>Crépuscule 18 trous 180 $ – après 15 h de juin à août, après 13 h à l’automne</em>. Vos heures restent du premier au dernier départ.</p>' },
  // Sport test 8 (2026-11-21; Marg, a 9-hole walk-on course: "we dont do tee times at all. you just show up" was told to
  // tap "Tee times recommended"): no tee times is the walk-on answer on the Booking screen, and its Good to know chip.
  { id: 'sport-walk-ons', kinds: ['golf'], pages: ['setup', 'edit'], over: ['indoor-good-to-know', 'sport-tee-times', 'indoor-booking', 'sport-same-day', 'booking-link', 'sport-booking-link', 'links'],
    q: 'We don’t do tee times: people just show up', qFr: 'Nous n’avons pas d’heures de départ : les gens arrivent, tout simplement',
    keys: ['no tee times', 'no tee time', 'dont do tee times', 'don t do tee times', 'dont take tee times', 'we dont do tee times', 'no tee times at all', 'first come first served', 'first come first serve', 'just show up', 'just show up and play', 'just show up and go', 'walk on only', 'walk ons only', 'walk-ons only', 'walkons only', 'no bookings', 'no booking needed', 'no reservations'],
    keysFr: ['pas d heures de depart', 'pas de reservation', 'premier arrive premier servi', 'sans reservation seulement', 'les gens arrivent'],
    a: '<p>On <strong>Booking</strong>, tap <strong>Yes, walk-ons welcome</strong>. Your page says “Walk-ons welcome: no tee time needed”, and no Book button is added. Want to say it again under Your visit? In <strong>Good to know</strong>, tap <strong>Walk-ons only: no tee times</strong>.</p>',
    aFr: '<p>Dans <strong>Réservation</strong>, touchez <strong>Oui, sans réservation</strong>. Votre page indique « Départs sans réservation : pas besoin de réserver », sans bouton Réserver. Vous voulez le redire sous Votre visite? Dans <strong>Bon à savoir</strong>, touchez <strong>Sans réservation seulement : pas d’heures de départ</strong>.</p>' },
  // Sport test 10 (2026-11-21; Lorraine, the office manager of an 18-hole club, started on the office laptop and finished on
  // her phone): "Will I lose what I've done?" got the log-out answer, and "How do I get back in tonight on my phone?" the
  // not-the-owner one. Picked by the fit check (FIT below), and by its own keys.
  { id: 'resume-device', pages: ['setup', 'edit'], over: ['logout', 'setup-change-later', 'login-create', 'not-owner', 'newlink', 'signin', 'setup-status'],
    q: 'Finish later, or on another device (like your phone)', qFr: 'Finir plus tard, ou sur un autre appareil (comme votre téléphone)',
    keys: ['finish it on my phone', 'finish on my phone', 'finish later', 'finish it later', 'on my phone tonight', 'lose what i ve done', 'lose what ive done', 'lose my work', 'lose my answers', 'have to start again', 'start over', 'pick up where i left off', 'carry on later', 'on my phone at home', 'from my phone later'],
    keysFr: ['finir sur mon telephone', 'finir plus tard', 'continuer plus tard', 'perdre mes reponses', 'recommencer', 'revenir plus tard', 'sur mon cellulaire'],
    a: '<p>Nothing is lost: your answers save as you go. To carry on on your phone (or any other device), open this same link there (it’s in your email), or tap <strong>Create a login</strong> on your edit page now and sign in at Business login on your phone: you go straight back to your answers.</p>',
    aFr: '<p>Rien n’est perdu : vos réponses s’enregistrent au fur et à mesure. Pour continuer sur votre téléphone (ou un autre appareil), ouvrez-y ce même lien (il est dans votre courriel), ou touchez <strong>Créer un compte</strong> sur votre page de modification maintenant et connectez-vous à l’Espace entreprise sur votre téléphone : vous retrouvez vos réponses tout de suite.</p>' },
  // Sport test 10: "The golf club itself doesn't have a happy hour. Masa's Grill runs its own Friday specials." got how to
  // fill in the deals (test 9's Gord asked the same).
  { id: 'sport-hh-none-specials', pages: ['setup', 'edit'], over: ['hh-deals', 'hh-times', 'indoor-bar', 'sport-social-hour', 'dont-have', 'sport-restaurant', 'sport-sister-listing', 'specials', 'sport-no-bar'],
    q: 'No happy hour, but our restaurant has its own specials', qFr: 'Pas de 5 à 7, mais notre restaurant a ses propres spéciaux',
    keys: ['no happy hour but', 'doesnt have a happy hour', 'does not have a happy hour', 'dont have a happy hour', 'no real happy hour', 'runs its own specials', 'its own specials', 'grill specials', 'restaurant specials'],
    keysFr: ['pas de 5 a 7 mais', 'ses propres speciaux', 'speciaux du restaurant'],
    a: '<p>On <strong>Do you have a happy hour?</strong>, tap <strong>No</strong>: that’s right for your place, and nothing more is asked. The restaurant’s own specials? Put them in one line in <strong>Known for</strong> or <strong>Good to know</strong>, like <em>Grill: dinner specials Friday nights</em>. The restaurant has its own page here? Its specials can go there too.</p>',
    aFr: '<p>À <strong>Avez-vous un 5 à 7?</strong>, touchez <strong>Non</strong> : c’est le bon choix pour votre endroit, et rien d’autre n’est demandé. Les spéciaux du restaurant? Mettez-les en une ligne dans <strong>Connu pour</strong> ou <strong>Bon à savoir</strong>, comme <em>Grill : spéciaux le vendredi soir</em>. Le restaurant a sa propre page ici? Ses spéciaux peuvent aussi y aller.</p>' },
  // Sport test 11 (2026-11-21; Geneviève's Trackman simulator runs January to March, outside her Apr 3 – Oct 31 golf season):
  // something open in the off-season for another kind. No new field (Dayton hasn't approved "open off-season for a second
  // kind"): the season stays the golf season, the other kind's months go in Good to know, its own listing via Message us.
  { id: 'sport-offseason-other', kinds: ['golf'], pages: ['setup', 'edit'], over: ['sport-season-says', 'sport-season', 'season', 'indoor-seasonal', 'seasonal-hours', 'hours-third-stretch', 'indoor-closed-months', 'year-round'],
    q: 'Something else is open in the off-season (like indoor golf)', qFr: 'Autre chose est ouvert hors saison (comme du golf intérieur)',
    keys: ['simulator in winter', 'simulator is open in winter', 'indoor simulator opens', 'simulator only in winter', 'simulator january to march', 'winter simulator', 'open in the off season', 'open in winter for'],
    keysFr: ['simulateur l hiver', 'simulateur en hiver', 'simulateur interieur ouvre', 'simulateur de janvier a mars', 'simulateur seulement de janvier', 'ouvert hors saison', 'ouvert l hiver pour'],
    a: '<p>Your golf season goes in your hours: tap <strong>We’re closed part of the year</strong> and pick your first and last day of golf. Outside it, your page and card say “Closed for the season”.</p><p>Indoor golf (or anything else) runs in the off-season? Keep its kind ticked, so people find it, and say when it runs in one line in <strong>Good to know</strong>, like <em>Indoor golf January to March, Mon–Sat 9 AM – 9 PM; book by phone</em>. Don’t add those months as a second stretch of hours: outside your season they don’t show anywhere. Has it got its own name, entrance and hours? Tap <strong>Message us</strong> and Dayton will see about a listing of its own.</p>',
    aFr: '<p>Votre saison de golf va dans vos heures : touchez <strong>Nous fermons une partie de l’année</strong> et choisissez votre premier et votre dernier jour de golf. En dehors, votre page et votre fiche indiquent « Fermé pour la saison ».</p><p>Du golf intérieur (ou autre chose) est ouvert hors saison? Gardez son genre coché, pour qu’on le trouve, et dites quand il est ouvert en une ligne dans <strong>Bon à savoir</strong>, comme <em>Golf intérieur de janvier à mars, du lundi au samedi de 9 h à 21 h; réservation par téléphone</em>. N’ajoutez pas ces mois comme une deuxième période d’heures : hors saison, elles ne paraissent nulle part. Il a son propre nom, son entrée et ses heures? Touchez <strong>Écrivez-nous</strong> et Dayton verra à une fiche à part.</p>' },
  // Sport test 11: "Our clubhouse books Christmas parties and weddings all winter… will people think they can't book an
  // event?" got "Nothing to add".
  { id: 'sport-offseason-events', kinds: ['golf'], pages: ['setup', 'edit'], over: ['sport-season-says', 'sport-season', 'season', 'indoor-seasonal', 'indoor-groups', 'indoor-closed-months', 'sport-part-season', 'events', 'event-add', 'sport-tournaments'],
    q: 'We host events all year, even when we’re closed for the season', qFr: 'Nous recevons des événements toute l’année, même fermés pour la saison',
    allOf: [['event', 'events', 'party', 'parties', 'wedding', 'weddings', 'banquet', 'banquets', 'catering', 'christmas', 'evenement', 'evenements', 'fete', 'fetes', 'party', 'mariage', 'mariages', 'noces', 'traiteur', 'reception', 'receptions', 'noel'], ['winter', 'all year', 'year round', 'closed', 'off season', 'hiver', 'toute l annee', 'ferme', 'hors saison']],
    keys: ['christmas parties all winter', 'weddings all winter', 'events all winter', 'events all year', 'book an event', 'cant book an event', 'can t book an event', 'parties in winter'],
    keysFr: ['fetes de noel', 'mariages toute l annee', 'evenements toute l annee', 'reserver un evenement', 'party de noel', 'receptions l hiver'],
    a: '<p>Your page says closed for golf outside your season, which is right for golfers. Events still book all year? Say it in one line in <strong>Groups</strong> (or Good to know), like <em>Clubhouse open all year for weddings, Christmas parties and events</em>. People planning an event read it there, in every month.</p>',
    aFr: '<p>Votre page dit fermé pour le golf hors saison, ce qui est juste pour les golfeurs. Les événements se réservent toute l’année? Dites-le en une ligne dans <strong>Groupes</strong> (ou Bon à savoir), comme <em>Club-house ouvert toute l’année pour les mariages, les partys de Noël et les événements</em>. Les gens qui planifient un événement le lisent là, peu importe le mois.</p>' },
  // Sport tests 9 and 10: "How do I see what the public sees?" / "Can I see what our page looks like to a golfer?" was
  // "I'm not sure" (or the approval answer); the edit page has the link at the top.
  { id: 'see-page', pages: ['setup', 'edit'], over: ['privacy', 'sport-approval-first', 'setup-live-when', 'live-speed'],
    q: 'See your page as visitors see it', qFr: 'Voir votre page comme les visiteurs la voient',
    keys: ['what our page looks like', 'what my page looks like', 'what the page looks like', 'what the public sees', 'what visitors see', 'see our page', 'see my page', 'preview my page', 'preview our page', 'see it like a visitor'],
    keysFr: ['voir notre page', 'voir ma page', 'a quoi ressemble notre page', 'a quoi ressemble ma page', 'ce que les visiteurs voient', 'apercu de ma page'],
    a: '<p>Tap <strong>your page</strong> (or See your page) at the top of your edit page: it opens your public page, just as visitors see it. Your quick answers show there as soon as they’re saved; a new story, photos and links show after a quick check, usually within a day.</p>',
    aFr: '<p>Touchez <strong>votre page</strong> (ou Voir votre fiche) en haut de votre page de modification : elle ouvre votre page publique, comme les visiteurs la voient. Vos réponses rapides y paraissent dès qu’elles sont enregistrées; une nouvelle histoire, des photos et des liens paraissent après une courte vérification, en général d’ici un jour.</p>' },
  // Sport test 12 (2026-11-21; Rob at 95%: "it says I need who can come to get 100% but it already says saved. what's
  // missing?" got the general checklist answer): what is still missing, by name, with what to tap (server.js fills
  // {MISSING_EN} / {MISSING_FR} from his own checklist when the page is drawn).
  { id: 'setup-missing', pages: ['setup', 'edit'], over: ['page-complete', 'setup-status', 'changes-review', 'nothing-changed', 'indoor-fill-all', 'easy-setup', 'indoor-age'],
    q: 'What’s still missing to reach 100%?', qFr: 'Qu’est-ce qui manque pour atteindre 100 %?',
    allOf: [['missing', 'manque', 'left', 'reste', 'stuck', 'bloque'], ['100', '95', '96', '97', '98', '99', 'percent', 'pour cent', 'complete', 'saved', 'enregistre', 'done', 'fait']],
    keys: ['whats missing', 'what s missing', 'what is missing', 'still missing', 'what is left', 'whats left', 'get to 100', 'reach 100', 'to get 100', 'stuck at 95', 'stuck at 96', 'stuck at 97', 'stuck at 98', 'stuck at 99', 'it already says saved', 'already says saved', 'says saved', 'why not 100', 'not 100', 'still 95', 'need who can come'],
    keysFr: ['qu est ce qui manque', 'ce qui manque', 'il manque quoi', 'atteindre 100', 'pour avoir 100', 'bloque a 95', 'toujours 95', 'pourquoi pas 100', 'deja enregistre', 'dit enregistre'],
    a: '<p>{MISSING_EN}</p>', aFr: '<p>{MISSING_FR}</p>' },
  // Sport test 12 (Rob: "page says kid friendly now… junior rates 18 and under but its a championship course, not a family
  // fun spot. should that be on" got the junior-rates answer): Kid-Friendly comes from Who can come.
  { id: 'sport-kid-badge', pages: ['setup', 'edit'], over: ['indoor-age', 'features', 'sport-rate-lines', 'sport-no-rate', 'indoor-price', 'sport-kids-free', 'sport-line-ages', 'sport-lessons'],
    q: 'Kid-Friendly is on my page: should it be?', qFr: 'Enfants bienvenus est sur ma page : est-ce que ça devrait?',
    allOf: [['kid', 'kids', 'family'], ['friendly', 'badge']],
    keys: ['kid friendly', 'kid-friendly', 'kids friendly', 'family friendly', 'family fun', 'not a family', 'not a family fun spot', 'kid friendly badge', 'remove kid friendly', 'take off kid friendly', 'why does it say kid friendly'],
    keysFr: ['badge enfants bienvenus', 'enlever enfants bienvenus', 'retirer enfants bienvenus', 'pas un endroit familial'],
    a: '<p><strong>Kid-Friendly comes from Who can come.</strong> All ages (or 5+) turns it on; 12+ and older takes it off. Juniors can play, but you’re not a family spot? Keep All ages if anyone can book, or tap <strong>12+</strong> (or older) and Kid-Friendly comes off. Tap <strong>Change an answer</strong>, then <strong>Who can come</strong>. Junior rates go in <strong>Your prices</strong> either way.</p>',
    aFr: '<p><strong>Enfants bienvenus vient de Qui peut venir.</strong> Tous les âges (ou 5+) l’active; 12+ et plus l’enlève. Les juniors peuvent venir, mais vous n’êtes pas un endroit familial? Gardez Tous les âges si tout le monde peut réserver, ou touchez <strong>12+</strong> (ou plus) et Enfants bienvenus disparaît. Touchez <strong>Modifier une réponse</strong>, puis <strong>Qui peut venir</strong>. Les tarifs juniors vont dans <strong>Vos tarifs</strong> dans les deux cas.</p>' },
  // Sport test 12 (Rob: groups of 16 or more, and no 16+ chip): no new chip; his own words say it.
  { id: 'sport-group-size', pages: ['setup', 'edit'], over: ['indoor-groups', 'sport-tournaments'],
    q: 'Our group size isn’t one of the chips (like 16 or more)', qFr: 'La taille de nos groupes n’est pas dans les choix (comme 16 et plus)',
    keys: ['16+', '16 or more', 'groups of 16', 'no 16', 'there s no 16', 'theres no 16', 'group size isn t there', 'group size not there', 'size chips', 'not one of the chips', 'our group size'],
    keysFr: ['16 et plus', 'groupes de 16', 'pas de 16', 'taille de groupe', 'taille des groupes'],
    a: '<p>Type it in your own words in <strong>Groups</strong>, like <em>Group packages for 16 or more: call us</em>, and skip the size chips (one would say a second number). Your page shows your line as you wrote it.</p>',
    aFr: '<p>Écrivez-le dans vos mots dans <strong>Groupes</strong>, comme <em>Forfaits de groupe pour 16 personnes et plus : appelez-nous</em>, et ne touchez pas les choix de taille (ils diraient un deuxième nombre). Votre page affiche votre ligne telle quelle.</p>' },
  // Sport test 12 (Rob's Good to know was nearly full, 281 of 320): no bigger box; where the rest goes.
  { id: 'sport-gtk-full', pages: ['setup', 'edit'], over: ['indoor-good-to-know', 'plan-visit', 'description'],
    q: 'Good to know is full: where does the rest go?', qFr: 'Bon à savoir est plein : où va le reste?',
    keys: ['good to know is full', 'box is full', 'no more room', 'not enough room', 'character limit', 'out of room', 'it won t fit', 'wont fit', 'doesnt fit', 'over the limit'],
    keysFr: ['bon a savoir est plein', 'plus de place', 'pas assez de place', 'limite de caracteres', 'ca ne rentre pas'],
    a: '<p>Good to know holds about 320 letters, to keep your page easy to read. Keep each line short (<em>Cash or card</em>) and move what has a home of its own: group packages to <strong>Groups</strong>, what you’re known for to <strong>Known for</strong>, a weekly night like a men’s night to What’s On (<strong>Add an event</strong>, repeating every week), your prices to <strong>Your prices</strong>.</p>',
    aFr: '<p>Bon à savoir contient environ 320 caractères, pour que votre page reste facile à lire. Gardez chaque ligne courte (<em>Comptant ou carte</em>) et déplacez ce qui a sa propre place : les forfaits de groupe dans <strong>Groupes</strong>, ce qui vous distingue dans <strong>Connu pour</strong>, une soirée chaque semaine comme une soirée des hommes dans À l’affiche (<strong>Ajouter un événement</strong>, qui se répète chaque semaine), vos prix dans <strong>Vos tarifs</strong>.</p>' },
  // Sport test 14 (2026-11-21; Marisol kept the booking link we had found, which was her website, and her page showed only
  // Website): the Book button shows once the link is saved. That bug (a kept link that matched the website was hidden) is
  // fixed.
  { id: 'sport-book-button', pages: ['setup', 'edit'], over: ['sport-booking-link', 'sport-tee-times', 'booking-link', 'links', 'website-broken', 'indoor-booking', 'sport-bay-link', 'changes-review'],
    q: 'My Book button isn’t showing (only Website)', qFr: 'Mon bouton Réserver ne paraît pas (seulement Site Web)',
    keys: ['book button', 'booking button', 'no book button', 'dont see a book', 'don t see a book', 'button is gone', 'button disappeared', 'button isnt showing', 'button not showing', 'just website', 'only website', 'only says website'],
    keysFr: ['bouton reserver', 'bouton de reservation', 'pas de bouton', 'bouton a disparu', 'seulement site web'],
    a: '<p>You didn’t do anything wrong. Your Book button shows once your booking link is saved (on <strong>Booking</strong>, or Name, address &amp; links on your edit page). We found a bug: a booking link that was the same as your website was hidden, so only Website showed. That’s fixed: your saved link shows as <strong>{BOOK_BTN}</strong>. Still only Website after a day? Tap <strong>Message us</strong>.</p>',
    aFr: '<p>Vous n’avez rien fait de travers. Votre bouton Réserver paraît dès que votre lien de réservation est enregistré (dans <strong>Réservation</strong>, ou Nom, adresse et liens sur votre page de modification). Nous avons trouvé un bogue : un lien de réservation identique à votre site Web était caché, et seul Site Web paraissait. C’est corrigé : votre lien enregistré paraît comme <strong>{BOOK_BTN_FR}</strong>. Toujours seulement Site Web après un jour? Touchez <strong>Écrivez-nous</strong>.</p>' },
  // Sport test 14 (Marisol: "the value index says nothing included in the green fee but range balls are included" got the
  // price answer): the course facts and the Value index are our golf data, fixed by Dayton.
  { id: 'sport-golf-facts', kinds: ['golf'], pages: ['setup', 'edit'], over: ['sport-golf-details', 'sport-included', 'indoor-old-line', 'sport-no-range', 'features'],
    q: 'Our course facts or Value index are wrong', qFr: 'Les faits de notre parcours ou l’indice de valeur sont faux',
    keys: ['value index', 'value thing', 'value score', 'course facts', 'not documented', 'undocumented', 'at a glance', 'facts are wrong', 'facts wrong'],
    keysFr: ['indice de valeur', 'faits du parcours', 'non documente', 'en un coup d oeil'],
    a: '<p>The course facts and the Value index come from our checked golf data, not from your answers. Something wrong or missing, like range balls included with every round? Tap <strong>Message us</strong> and say what to fix: Dayton fixes it, usually within a day. Once your own prices are in, the Value index and our green fee table come off your page.</p>',
    aFr: '<p>Les faits du parcours et l’indice de valeur viennent de nos données de golf vérifiées, pas de vos réponses. Une erreur ou un oubli, comme les balles de pratique comprises avec chaque partie? Touchez <strong>Écrivez-nous</strong> et dites quoi corriger : Dayton le corrige, en général d’ici un jour. Dès que vos propres tarifs sont entrés, l’indice de valeur et notre tableau des droits de jeu disparaissent de votre page.</p>' },
];
// What owners of every kind typed for the shared answers ([en keys, fr keys, topics they now beat]).
const MORE_KEYS = {
  'indoor-age': [['youngest', 'youngest is', 'how young', 'potty trained', 'toilet trained', 'minimum age', 'little ones', 'toddlers', 'from age 3', 'adults any age', 'kids under', 'age limit', 'too young', 'need an adult', 'with an adult', 'under 12 need an adult'], ['le plus jeune', 'les plus jeunes', 'des 3 ans', 'age minimum', 'tout petits', 'propre'], ['sport-kids-free', 'indoor-busy-times']],
  'sport-per-person': [['per hour for up to', 'for up to 3', 'up to 3 people', 'up to 4 people', '1 to 3 people', 'same price for 1 to 3', 'private is per hour', 'per hour up to', 'price for the group', 'for the whole group', 'private lesson per hour', 'private per hour', 'how do i show that'], ['l heure pour 3', 'jusqu a 3 personnes', 'prive est a l heure', 'cours prive a l heure', 'pour 1 a 3 personnes'], ['login-privacy', 'privacy', 'indoor-min-players', 'sport-rate-lines', 'menu-add', 'sport-lessons', 'indoor-price-two']],
  'indoor-gift': [['gift cards', 'gift card', 'gift certificates', 'vouchers'], ['cartes cadeaux', 'carte cadeau', 'certificat cadeau'], []],
  'sport-lessons': [['private vs group', 'private and group', 'group and private', 'private or group', 'show private', 'private lessons and group', 'race programs', 'freestyle programs', 'race and freestyle', 'programs for teens', 'race team', 'freestyle'], ['prives et de groupe', 'cours prives', 'prive et de groupe', 'cliniques d initiation', 'clinique d initiation', 'initiation', 'cours pour debutants'], ['indoor-price-varies', 'indoor-seasonal', 'seasonal-hours', 'season']],
  'indoor-camps': [['christmas camp', 'holiday camp', 'spring break camp', 'should that be an event', 'is that an event', 'camp is dec', 'camp dates'], ['camp de noel', 'camp des fetes', 'camp de la relache', 'est ce un evenement'], ['closures', 'setup-closures', 'setup-closure-fix', 'sport-one-off-closure', 'setup-short-closure', 'indoor-yearly-break']],
  'indoor-holiday-open': [['open christmas day', 'open on christmas', 'we are open christmas', 'open boxing day', 'open new years day', 'open on holidays', 'open on stat holidays'], ['ouvert a noel', 'ouverts a noel', 'ouvert le jour de noel', 'on est ouvert a noel'], ['closures', 'setup-closures']],
  'indoor-swim-times': [['lessons go out at', 'lesson times', 'lessons start at', 'desk opens', 'lessons at 9',
    // Sport test 6 (Priya): public skate times that change every week with hockey bookings, and the City's schedule page.
    'change every week', 'changes every week', 'change weekly', 'changes weekly', 'times change every', 'schedule changes', 'schedule is posted', 'posted on the city website', 'link to that', 'link to the schedule', 'link the schedule', 'link our schedule', 'what do i put for hours', 'show the wrong time', 'wrong time', 'doors are open', 'building is open'],
    ['heures des cours', 'les cours partent', 'le comptoir ouvre', 'heures de patinage libre changent', 'changent chaque semaine', 'change chaque semaine', 'horaire change', 'horaire du patinage libre', 'quoi mettre comme heures', 'lien vers l horaire', 'horaire de la ville'], ['hours', 'setup-split-hours', 'sport-last-booking', 'setup-third-time', 'indoor-extras', 'sport-opening-day', 'event-repeat', 'sport-public', 'links', 'website-broken', 'indoor-price', 'sport-season', 'season', 'indoor-seasonal', 'seasonal-hours']],
  'indoor-french': [['write this in french', 'in french too', 'do i have to write it in french', 'guests are from quebec', 'french page', 'french version', 'need to be in french', 'page need to be in french', 'dont speak french', 'do not speak french', 'i cant write french', 'be in french'], ['en francais aussi', 'ecrire en francais', 'version francaise', 'je ne parle pas francais'], ['sport-staff-language']],
  'sport-rentals': [['rentals are separate', 'rentals extra', 'rentals cost extra'], ['location en plus', 'location a part'], []],
  'sport-weather': [['lifts close', 'the lifts close', 'cancelled for wind', 'canceled for wind', 'wind hold', 'lift closures', 'too cold', 'cold days', 'any weather', 'run in any weather', 'rain or shine', 'too warm', 'even in snow', 'deep snow', 'all weather'], ['remontees ferment', 'grand vent', 'par tous les temps', 'beau temps mauvais temps', 'mouille', 'quand c est mouille'], ['sport-opening-day']],
  'indoor-good-to-know': [['washrooms', 'washroom', 'washrooms nearby', 'bathrooms', 'toilets', 'change rooms', 'helmets are required', 'helmets required for', 'is there a chip', 'helmets required', 'helmets are mandatory'], ['toilettes', 'vestiaires', 'trottinettes', 'velos permis', 'trottinettes et velos', 'carte du parcours'], ['indoor-price', 'indoor-age']],
  'indoor-theme-nights': [['family skate', 'family skates', 'adult only skate', 'adults only skate', 'parent and tot', 'parent and tot skate', 'seniors skate', 'know the difference', 'noon hour skate'], ['mini golf fluo', 'soiree jam', 'soirees jam', 'chaque vendredi', 'basketball libre', 'le vendredi soir', 'patinage familial', 'bain familial'], ['sport-tournaments']],
  'indoor-price': [['adult skate is', 'adult swim is'], [], ['indoor-theme-nights']],
  'indoor-price-varies': [['small and large', 'small and large buckets', 'off peak', 'peak and off peak', 'peak after'], ['petit seau', 'grand seau', 'hors pointe'], []],
  'sport-season': [['to labour day', 'until labour day', 'to thanksgiving', 'victoria day to', 'end of october', 'early april', 'for the season'], ['a la fete du travail'], []],
  'indoor-groups': [['ice rentals by the hour', 'ice rental by the hour'], [], ['indoor-extras']],
  // Sport test 6 (Priya: "ice rentals and birthday parties are booked through the city website. do i put that link here?").
  'indoor-booking': [['do i put that link here', 'put that link here', 'booked through the city', 'booked through the city website', 'booking page', 'ice rentals are booked', 'parties are booked'], ['reserve sur le site de la ville', 'ce lien ici'], ['indoor-groups', 'indoor-book-party']],
  'sport-season-says': [['no ice', 'when there is no ice', 'ice is out', 'ice comes out', 'ice out', 'think we are closed', 'think were closed', 'what happens in summer', 'dry floor'], ['la glace est enlevee', 'glace enlevee', 'pas de glace', 'sans glace', 'que dit la page', 'en ete'], ['sport-opening-day', 'indoor-closed-months', 'sport-season', 'indoor-seasonal']],
  'indoor-access': [['wheelchair', 'wheelchair accessible', 'accessible', 'elevator', 'ramp', 'stairs', 'accessible washroom'], ['fauteuil roulant', 'accessible', 'ascenseur', 'rampe'], []],
  'sport-free-clubs': [[], [], ['sport-included']],
  'sport-tax': [['plus gst', 'plus tax', 'plus taxes', 'gst extra', 'tax extra', 'plus gst and pst'], ['plus taxes', 'taxes en sus', 'plus tps'], ['indoor-extras', 'sport-included']],
  'sport-dogs': [[], [], ['sport-what-to-bring']],
  'sport-bay-link': [[], [], ['sport-booking-link']],
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
  const rentChip = chipOf(/rental|to rent/i);
  const bring = (ctx.gtk.en || []).map((c, i) => [c, (ctx.gtk.fr || [])[i] || c]).filter(([c]) => /\bbring\b|\bdress\b|helmet|swimsuit|shoes|clubs to borrow|racquet|discs/i.test(c)).slice(0, 2);
  const label = SK.SPORT_KIND_LABELS_OWNER[kind] || ['your kind', 'votre genre'];
  const busy = SK.BUSY_THEME[kind] || SK.BUSY_THEME.sportother;
  const typer = SK.TYPER[kind] || SK.TYPER.sportother, ex = SK.EX_PRICE[kind] || 15, p = typeof ctx.amount === 'number' && ctx.amount > 0 ? ctx.amount : ex;
  const peakWhen = WINTER(kind) ? ['Christmas and spring break', 'Noël et relâche'] : SUMMER(kind) ? ['July and August', 'juillet et août'] : ['weekends', 'fin de semaine'];
  const peak = Math.round(p * 1.15);
  const seasonSays = ctx.season
    // Sport test 11: "does my page still show up in winter searches?" is answered first (yes, marked closed).
    ? [`<p>Yes: your page stays up all year and still shows in searches. Your season is ${e(ctx.season.en)}: outside it your page and your card say “Closed for the season”, with the day you reopen (${e(ctx.season.reopenEn)}), and Build My Trip doesn’t plan you then. Nothing to add: don’t mark those months closed again.</p>`,
      `<p>Oui : votre page reste en ligne toute l’année et paraît toujours dans les recherches. Votre saison va ${e(ctx.season.fr)} : en dehors, votre page et votre fiche indiquent « Fermé pour la saison », avec le jour de réouverture (${e(ctx.season.reopenFr)}), et Planifier mon voyage ne vous propose pas. Rien à ajouter : ne marquez pas ces mois comme fermés une deuxième fois.</p>`]
    : ['<p>Yes, once your season is in. In your hours, after the days, tap <strong>We’re closed part of the year</strong> and pick your first and last day. Outside them your page and your card say “Closed for the season”, with the day you reopen, and Build My Trip doesn’t plan you.</p>',
      '<p>Oui, une fois votre saison entrée. Dans vos heures, après les jours, touchez <strong>Nous fermons une partie de l’année</strong> et choisissez votre premier et votre dernier jour. En dehors, votre page et votre fiche indiquent « Fermé pour la saison », avec le jour de réouverture, et Planifier mon voyage ne vous propose pas.</p>'];
  // Sport test 11: "it has its own page" only when it does.
  const sisterSays = ctx.sister
    // Sport test 14 (Marisol: "the restaurant already has its own page. should I talk about it in our story?"): it keeps its
    // own page; a line here is fine; linking the two is Dayton's.
    ? [`<p>${e(ctx.sister.name)} has its own page here, with its own hours and setup, so keep this page about your place and don’t tick it as a kind here. A line about it is fine in your story or <strong>Good to know</strong>, like <em>${e(ctx.sister.name)} is open to everyone</em>. Outside your season your page says closed and when you reopen; the other page shows its own hours. Want the two pages linked, or both on your login? Tap <strong>Message us</strong>.</p>`,
      `<p>${e(ctx.sister.name)} a sa propre page ici, avec ses heures et sa configuration : gardez cette page pour votre endroit et ne le cochez pas comme genre ici. Une ligne à son sujet est correcte dans votre histoire ou dans <strong>Bon à savoir</strong>, comme <em>${e(ctx.sister.name)} est ouvert à tous</em>. Hors saison, votre page dit fermé et quand vous rouvrez; l’autre page montre ses propres heures. Vous voulez relier les deux pages, ou les avoir dans votre compte? Touchez <strong>Écrivez-nous</strong>.</p>`]
    : ['<p>It doesn’t have a page of its own here, so keep it on this one: leave it ticked if people can use it (it helps them find it), and say when it runs in one line in <strong>Good to know</strong>, like <em>Indoor golf January to March, Mon–Sat 9 AM – 9 PM</em>. People see your season’s dates on your page, so nobody expects it in July. Want it to have its own page (its own name, entrance and hours)? Tap <strong>Message us</strong>.</p>',
      '<p>Il n’a pas de page à lui ici, alors gardez-le sur celle-ci : laissez-le coché si les gens peuvent l’utiliser (ça aide à le trouver), et dites quand il est ouvert en une ligne dans <strong>Bon à savoir</strong>, comme <em>Golf intérieur de janvier à mars, du lundi au samedi de 9 h à 21 h</em>. Les gens voient les dates de votre saison sur votre page : personne ne s’y attend en juillet. Vous voulez qu’il ait sa propre page (son nom, son entrée et ses heures)? Touchez <strong>Écrivez-nous</strong>.</p>'];
  const bw = ctx.booking || {};
  const two = (list) => (list || []).filter((x) => !(list || []).some((o) => o !== x && (o === `${x}s` || x.startsWith(`${o} `)))).slice(0, 2);
  const search = two(K.en.search), searchFr = two(K.fr.search);
  return {
    en: { MEET_EX: w('meet', 0), MEET_CHIP_EN: meet ? ` Or tap <strong>${e(meet[0])}</strong> and add where.` : '', LANG_EX: w('lang', 0), ADAPT_PRICE: w('adaptPrice', 0), ADAPT_EX: w('adapt', 0), REFUND_EX: w('refund', 0), REFUND_WX: w('refundWx', 0),
      BRING_EX: w('bring', 0), BRING_CHIPS_EN: bring.length ? ` (like ${bring.map(([c]) => `<strong>${e(c)}</strong>`).join(' or ')})` : '', BUSY_EX: e(busy[0]), PEAK_EX: e(`${typer[0]} $${p} (${peakWhen[0]}: $${peak})`),
      INCL_EX: w('include', 0), NOT_INCL: w('notIncluded', 0), PKG_EX: w('pkg', 0), CARD_EN: ctx.price ? `your main price (“${e(ctx.price.en)}”)` : 'your main price', LABEL_EN: e(label[0]), BOTH_EN: w('both', 0),
      SEASON_SAYS_EN: seasonSays[0], SISTER_SAYS_EN: sisterSays[0], AHEAD_CHIP_EN: e((bw.ahead || ['No, please book ahead'])[0]), AHEAD_EX: w('ahead', 0), BUSY_CHIP_EN: e((bw.busy || ['Yes, but book ahead for weekends and busy times'])[0]),
      BUSY_LINE_EN: bw.line ? `: your page says “${e(String(bw.line[0]).replace(/\.$/, ''))}”` : '', SAME_EX: w('same', 0), HOLIDAY_EX: w('holiday', 0), SEARCH_EX: e(search.join(', ') || label[0].toLowerCase()), NEAR_EN: ctx.near ? ` ${ctx.near.en}` : '', NOT_INCL_CHIP_EN: notIn ? (notIn[0] === word('notIncluded', kind)[0] ? ': it’s one tap there' : ` (or tap <strong>${e(notIn[0])}</strong>)`) : '', NOT_SOLD_EN: kind === 'skischool' ? 'lift tickets the ticket office sells' : 'another business’s tickets', LIT_EN: lit ? `, or tap <strong>${e(lit[0])}</strong> if it’s lit` : '', AGES_LINE: w('lineAges', 0),
      EXTRA_EX: w('extra', 0), EXTRA_REPEAT: w('extra', 2), EMPTY_PHOTO: w('emptyPhoto', 0), NO_RENT: w('noRent', 0), RENT_CHIP_EN: rentChip ? `the <strong>${e(rentChip[0])}</strong> chip` : 'any rentals chip', BOOK_WHAT: w('bookWhat', 0), BOOK_BTN: e((K.bookBtn || ['Book online'])[0]) },
    fr: { MEET_EX: w('meet', 1), MEET_CHIP_FR: meet ? ` Ou touchez <strong>${e(meet[1])}</strong> et ajoutez l’endroit.` : '', LANG_EX: w('lang', 1), ADAPT_PRICE: w('adaptPrice', 1), ADAPT_EX: w('adapt', 1), REFUND_EX: w('refund', 1), REFUND_WX: w('refundWx', 1),
      BRING_EX: w('bring', 1), BRING_CHIPS_FR: bring.length ? ` (comme ${bring.map(([, c]) => `<strong>${e(c)}</strong>`).join(' ou ')})` : '', BUSY_EX: e(busy[3]), PEAK_EX: e(`${typer[2]} ${p} $ (${peakWhen[1]} : ${peak} $)`),
      INCL_EX: w('include', 1), NOT_INCL: w('notIncluded', 1), PKG_EX: w('pkg', 1), CARD_FR: ctx.price ? `votre prix principal (« ${e(ctx.price.fr)} »)` : 'votre prix principal', LABEL_FR: e(label[1]), BOTH_FR: w('both', 1),
      SEASON_SAYS_FR: seasonSays[1], SISTER_SAYS_FR: sisterSays[1], AHEAD_CHIP_FR: e((bw.ahead || ['', 'Non, réservez à l’avance'])[1]), AHEAD_EX: w('ahead', 1), BUSY_CHIP_FR: e((bw.busy || ['', 'Oui, mais réservez pour les fins de semaine et les périodes achalandées'])[1]),
      BUSY_LINE_FR: bw.line ? ` : votre page indique « ${e(String(bw.line[1]).replace(/\.$/, ''))} »` : '', SAME_EX: w('same', 1), HOLIDAY_EX: w('holiday', 1), SEARCH_EX_FR: e(searchFr.join(', ') || label[1].toLowerCase()), NEAR_FR: ctx.near ? ` ${ctx.near.fr}` : '', NOT_INCL_CHIP_FR: notIn ? (notIn[0] === word('notIncluded', kind)[0] ? ' : c’est un choix à toucher' : ` (ou touchez <strong>${e(notIn[1])}</strong>)`) : '', NOT_SOLD_FR: kind === 'skischool' ? 'les billets de remontée vendus à la billetterie' : 'les billets d’une autre entreprise', LIT_FR: lit ? `, ou touchez <strong>${e(lit[1])}</strong> s’il y a de l’éclairage` : '', AGES_LINE: w('lineAges', 1),
      EXTRA_EX: w('extra', 1), EXTRA_REPEAT: w('extra', 3), EMPTY_PHOTO_FR: w('emptyPhoto', 1), NO_RENT_FR: w('noRent', 1), RENT_CHIP_FR: rentChip ? `le choix <strong>${e(rentChip[1])}</strong>` : 'tout choix de location', BOOK_WHAT_FR: w('bookWhat', 1), BOOK_BTN_FR: e((K.bookBtn || [null, 'Réserver en ligne'])[1]) },
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
    // Sport test 9: the weekly no-public-tee-times line is a golf course's.
    case 'sport-members': return golf ? t : both(t, [[/<p>No public tee times at a set time each week[\s\S]*?<\/p>/, '']], [[/<p>Pas de départs pour le public à une heure fixe chaque semaine[\s\S]*?<\/p>/, '']]);
    // Sport test 8 (Marg typed "20 dollars for 9 holes"): the answer says her own price line, not an example.
    case 'sport-golf-details':
      return ctx.price ? both(t, [['“Green fees from $55”', `“${e(ctx.price.en)}”`]], [['« Droits de jeu à partir de 55 $ »', `« ${e(ctx.price.fr)} »`]]) : t;
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
      // Sport test 6 (Priya: public skate times change every week; the building is open 6 AM to 11 PM): what her page says.
      const tw = { rink: [['Building open', 'public skate times change'], ['Aréna ouvert', 'horaire du patinage libre variable']], swim: [['Pool open', 'public swim times change'], ['Piscine ouverte', 'horaire des bains libres variable']], sportsctr: [['Building open', 'drop-in times change'], ['Centre ouvert', 'horaire des activités libres variable']] }[kind];
      if (tw) t = { ...t, a: `${t.a}<p>Times change week to week? While you’re open, your page says <em>${e(tw[0][0])} · ${e(tw[0][1])}: see schedule ↗</em>, linked to your <strong>Website</strong> (put your schedule page there, or a link to it on your site), and Build My Trip tells people to check the schedule before they go.</p>`,
        aFr: `${t.aFr}<p>Les heures changent d’une semaine à l’autre? Pendant vos heures d’ouverture, votre page indique <em>${e(tw[1][0])} · ${e(tw[1][1])} : voir l’horaire ↗</em>, avec un lien vers votre <strong>Site Web</strong> (mettez-y votre page d’horaire, ou un lien vers celle-ci), et Planifier mon voyage dit de vérifier l’horaire avant d’y aller.</p>` };
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
// Sport test 7 (2026-11-20; 180 blind questions from six owner types, written without this file: 64% landed well): ideas
// in any words, not phrases. Each topic's concept groups (server.js allOfAny): a set of word-start groups that is a strong
// match when the question has a word from every group of it, anywhere. Kept narrow: two ideas that only meet in that topic.
const PLACE_NOUNS = ['course', 'courses', 'cours', 'page', 'pages', 'listing', 'rink', 'arena', 'pool', 'park', 'facilit', 'location', 'site', 'terrain', 'parcours', 'patinoire', 'piscine', 'fiche', '18s', 'nines', 'club', 'school', 'ecole', 'centre', 'center', 'lounge', 'shop', 'boutique'];
const KIND_NOUNS = ['golf', 'range', 'spa', 'pool', 'rink', 'arena', 'simulat', 'sims', 'bike', 'bikes', 'rent', 'rental', 'repair', 'shop', 'store', 'restaurant', 'cafe', 'bar', 'mini', 'court', 'tennis', 'pickle', 'ski', 'snowboard', 'skate', 'disc', 'piscine', 'patinoire', 'velo', 'boutique', 'location', 'reparation', 'lessons', 'cours', 'gym'];
const CLOSED = ['closed', 'close', 'closing', 'shut', 'ferme', 'fermer', 'fermons', 'fermeture'];
const PHOTO = ['photo', 'pic ', 'pics', 'pix', 'picture', 'image', 'foto', 'shots'];
const CONCEPTS = {
  'sport-rates-next-year': [[['rate', 'price', 'fee', 'tarif', 'prix'], ['not set', 'arent set', 'aren t set', 'not on our website', 'arent on our website', 'not final', 'not decided', 'pas encore sur', 'pas fixes', 'pas encore fixes', 'pas decides']]],
  'sport-sister-listing': [[['sim', 'simulat', 'lounge', 'spa', 'salon'], ['own page', 'own listing', 'already', 'separate', 'propre page', 'propre fiche', 'deja']]],
  'sport-one-listing': [[['two', 'second', 'another', 'both', 'each', 'twice', 'deux', 'autre', 'chaque', 'sister', 'jumeau'], PLACE_NOUNS.filter((w) => !['page', 'pages', 'shop', 'boutique', 'cours'].includes(w)).concat(['both on', 'same page', 'one page', 'meme page'])]],
  'indoor-kinds-many': [[['tick', 'pick', 'choose', 'select', 'check', 'coch', 'choisi', 'both', 'all of', 'tous'], KIND_NOUNS, ['and', 'et', 'plus', 'also', 'aussi', 'both', 'a range', 'a spa', 'a pool']]],
  'description': [[['long', 'short', 'words', 'mots', 'length', 'longueur', 'characters', 'caracteres', 'write', 'ecrire', 'paragraph'], ['description', 'story', 'histoire', 'texte', 'text', 'blurb', 'about us', 'bio']]],
  'menu-import': [[['upload', 'pdf', 'scan', 'file', 'fichier', 'import', 'televers', 'attach', 'joindre', 'instead of typing', 'au lieu de taper'], ['rate', 'price', 'menu', 'list', 'sheet', 'tarif', 'prix', 'grille', 'fees', 'liste']]],
  'sport-members': [[['membres', 'members', 'member'], ['public', 'alternent', 'alternate', 'swap', 'every other', 'un jour sur deux', 'seulement', 'only']], [['public', 'visitors', 'guests', 'non member', 'nonmember', 'grand public', 'visiteurs'], ['cant', 'cannot', 'can t', 'not allowed', 'till', 'until', 'reserved', 'only', 'jusqu', 'reserve', 'interdit', 'peut pas', 'peuvent pas']]],
  'sport-approval-first': [[['council', 'approv', 'board', 'manager', 'boss', 'conseil', 'approuv', 'sign off', 'city hall', 'mairie', 'ville'], ['yet', 'later', 'wait', 'before', 'encore', 'attendre', 'plus tard', 'pending', 'not final', 'confirmed']]],
  'sport-one-off-closure': [[['tournament', 'tournoi', 'member guest', 'championship', 'championnat', 'block', 'bloquer', 'event'], ['specificdate', 'dates', 'days', 'jours', 'cant book', 'can t book', 'public', 'closed', 'ferme', 'block it', 'those days']], [CLOSED, ['ndays', 'weeks', 'week', 'semaine', 'broke', 'broken', 'repair', 'maintenance', 'renovat', 'tournament', 'tournoi', 'reparation', 'bris', 'brise', 'panne', 'swap', 'replace', 'resurfac', 'event']], [['broke', 'broken', 'breakdown', 'panne', 'brise', 'flood', 'leak', 'power outage'], ['tell', 'say', 'show', 'let', 'dire', 'indiquer', 'aviser', 'closed', 'ferme']]],
  'closures': [[CLOSED, ['dec 24', 'dec 25', 'dec 26', 'christmas', 'noel', 'holiday', 'jan 1', 'stat', 'specificdate', 'boxing', 'new year']]],
  'photo-rights': [[PHOTO, ['use', 'using', 'allowed', 'okay', 'rights', 'permission', 'copyright', 'took', 'taken', 'marketing', 'company', 'utilis', 'droit', 'permis', 'correct', 'legal', 'credit', 'facebook', 'instagram', 'website', 'photographer', 'photographe', 'customers', 'clients', 'kids faces']]],
  'sport-photo-consent': [[PHOTO, ['customers', 'clients', 'kids', 'children', 'students', 'skaters', 'swimmers', 'riders', 'golfers', 'people in', 'faces', 'enfants', 'eleves', 'visages', 'gens']]],
  'sport-dawn-dusk': [[['dawn', 'dusk', 'sunrise', 'daylight', 'always open', 'anytime', 'any time', '24', 'tout le temps', 'toujours', 'aube', 'unstaffed', 'no staff', 'pas de personnel', 'personne sur place', 'jour et nuit', 'night and day'], ['open', 'hours', 'ouvert', 'heure', 'times', 'horaire', 'what time', 'quand']]],
  'sport-season': [[CLOSED, ['all winter', 'for winter', 'for the winter', 'winters', 'off season', 'offseason', 'hiver', 'l hiver', 'season', 'saison', 'until spring', 'jusqu au printemps', 'snow melts', 'fonte']]],
  'indoor-swim-times': [[['public skate', 'public swim', 'drop in', 'skate times', 'swim times', 'ice times', 'patinage libre', 'bain libre', 'bains libres', 'lane swim', 'sessions', 'seances'], ['change', 'changent', 'vary', 'varie', 'every week', 'weekly', 'chaque semaine', 'different each', 'differ']]],
  'indoor-price': [[['price', 'prix', 'tarif', 'rate', 'cost', 'combien', 'how much', 'dollarsign', 'fee'], ['what do i put', 'what do i enter', 'which one', 'which price', 'quoi mettre', 'je mets quoi', 'lequel', 'quel prix', 'what number', 'enter for', 'put for', 'a mettre']]],
  'indoor-min-players': [[['minimum', 'at least', 'au moins'], ['players', 'people', 'hour', 'hours', 'joueurs', 'personnes', 'heure', 'hr', 'hrs', 'groupsize']]],
  'indoor-age': [[['age', 'ages', 'year old', 'yr old', 'yrs', 'ans', 'agenum', 'and up', 'et plus'], ['kids', 'children', 'adults', 'teens', 'enfants', 'adultes', 'ados', 'tick', 'what age', 'minimum age', 'too']]],
  'indoor-good-to-know': [[['where', 'what box', 'which box', 'quelle case', 'je mets ou', 'ca va ou'], ['bathroom', 'washroom', 'toilet', 'restroom', 'toilettes', 'tees', 'baskets', 'paniers', 'water', 'eau', 'shade', 'benches', 'parking only', 'info', 'details', 'rules', 'regles', 'dress', 'tenue']]],
  'booking-link': [[['book', 'booking', 'reserv', 'software', 'system', 'app', 'logiciel', 'systeme'], ['link', 'lien', 'click', 'cliquer', 'button', 'bouton', 'from my listing', 'from the page', 'url', 'website']]],
  'sport-booking-link': [[['book', 'booking', 'reserv', 'software', 'system', 'app', 'logiciel', 'systeme'], ['link', 'lien', 'click', 'cliquer', 'button', 'bouton', 'from my listing', 'from the page', 'url']]],
  'sport-dogs': [[['dog', 'dogs', 'chien', 'pets', 'animaux'], ['service', 'guide', 'permis', 'interdit', 'leash', 'laisse', 'bienvenus', 'on leash', 'off leash']]],
  'indoor-access': [[['wheelchair', 'fauteuil', 'accessib', 'ramp', 'rampe', 'elevator', 'ascenseur', 'mobility', 'stairs', 'escalier', 'service dog', 'chiens guides', 'chien guide'], ['tick', 'say', 'show', 'put', 'dire', 'mettre', 'how', 'comment', 'where', 'tile', 'case', 'okay']]],
  'photos-when': [[PHOTO, ['not showing', 'not appear', 'dont see', 'don t see', 'cant see', 'missing', 'yet', 'when will', 'apparue', 'apparait', 'pas encore', 'vois pas', 'quand', 'still', 'after i']]],
  'photo-small': [[PHOTO, ['how many', 'combien', 'big', 'large', 'size', 'gros', 'grand', 'taille', 'format', 'mb', 'resolution', 'too big', 'trop']]],
  'indoor-french': [[['translat', 'tradui', 'traduction', 'french', 'francais', 'en francais'], ['who', 'someone', 'do i have to', 'have to', 'qui', 'quelqu', 'dois je', 'je dois', 'need to', 'faut il', 'vous']]],
  'sport-lessons': [[['lesson', 'lecon', 'clinic', 'academy', 'academie', 'camp', 'instruction', 'coaching'], ['price', 'prix', 'tarif', 'rate', 'cost', 'combien', 'how much', 'dollarsign', 'fee']]],
};
// Sport test 7: what a topic's answer is NOT for (server.js notIf): "social hour" is never social media; a tournament's
// dates are a closure, not members' times; twilight is a price, not summer hours.
const NOT_IF = {
  'no-website-social': ['social hour', 'heure sociale'], 'sport-shared-social': ['social hour', 'heure sociale', 'two instagram', 'golf only instagram', 'which one should go here'],
  'sport-restaurant': ['social hour', 'heure sociale'], 'sport-members': ['tournament', 'tournoi', 'block it', 'member guest'],
  'indoor-summer-late': ['twilight', 'crepuscule'], 'seasonal-hours': ['twilight', 'crepuscule'], 'menu-import': ['arent on our website yet', 'not on our website yet', 'arent set', 'next year'],
  'photo-rights': ['own page', 'propre page', 'tick indoor'], 'sport-free-clubs': ['shuttle', 'navette'],
  'sport-peak-dates': ['off peak'], 'sport-food-menu': ['beer', 'alcohol', 'licensed', 'biere'],
  'sport-golf-details': ['why does it say', 'cart price', 'pourquoi ca dit'],
  'sport-sister-listing': ['social hour', 'heure sociale', 'happy hour', 'restaurant'], 'sport-two-courses': ['members', 'member', 'membres', 'alternate', 'alternent', 'alternating', 'swap'],
  // Sport tests 8 and 9 (2026-11-21): one shared word is not an intent. The weekly-nights answer took any question with
  // "men's", "members" or "Wednesday" (a Labour Day closure, a semi-private club, "no real happy hour"); the staff
  // languages answer took "none of us speak French"; "volunteers" took a fundraiser question; "lessons" took a log-in.
  'indoor-theme-nights': ['every year', 'each year', 'chaque annee', 'tous les ans', 'close to the public', 'closed to the public', 'ferme au public', 'amateur', 'championship', 'championnat', 'tournament', 'tournaments', 'tournoi', 'tournois', 'no real happy hour', 'no happy hour', 'pas de 5 a 7', 'semi private', 'members get', 'member times', 'members only', 'own page'],
  'sport-staff-language': ['none of us speak', 'nobody speaks french', 'no one speaks french', 'we dont speak french', 'dont really speak french', 'write everything in french', 'everything in french', 'french version', 'write the french', 'french part', 'aucun de nous ne parle', 'personne ne parle francais'],
  'sport-public': ['tournament', 'tournaments', 'tournoi', 'tournois', 'fundraiser', 'fundraisers'],
  'sport-lessons': ['an event', 'log in', 'login', 'sign in', 'own login', 'se connecter'],
  'indoor-booking': ['extension', 'press 1', 'ext', 'poste'], 'sport-tee-times': ['extension', 'press 1', 'ext', 'poste', 'no tee times', 'no tee time', 'dont do tee times', 'first come first served'],
  'sport-second-kind': ['academy', 'lessons button', 'teaching pros', 'academie'], 'indoor-kinds-many': ['academy', 'lessons button', 'teaching pros', 'academie'],
  'sport-holiday-short': ['every month', 'each month', 'chaque mois', 'shorter in the fall', 'earlier in june'],
  'indoor-bar': ['no beer', 'no alcohol', 'no licence', 'no license', 'not licensed', 'no liquor', 'pas de biere', 'pas d alcool', 'no real happy hour', 'only has pop'],
  'hh-deals': ['no beer', 'no alcohol', 'no licence', 'not licensed', 'pas de biere', 'pas d alcool', 'no real happy hour'], 'hh-times': ['no beer', 'no alcohol', 'no licence', 'not licensed', 'pas de biere', 'pas d alcool', 'no real happy hour'],
  'sport-social-hour': ['no beer', 'no alcohol', 'no licence', 'not licensed', 'pas de biere', 'pas d alcool', 'no real happy hour'],
  'signin': ['also log in', 'log in too', 'also sign in', 'head pro'],
  'privacy': ['public sees', 'what visitors see', 'see what the public', 'see our page', 'see my page', 'what my page looks like'],
  'no-website-social': ['social hour', 'heure sociale', 'normale', 'longueur du parcours', 'verges', 'par 72'],
};
// Sport test 10 (2026-11-21; Lorraine: 8 of her 26 questions got a confident answer to a different question, and only one
// "Ask us"). Does the answer fit the question? Each rule is an intent read from the question (every pattern in `all`
// found in its normalized words, none of `not`), with the topics that answer it (`fit`), or that never do (`bad`). When
// the answer Help picked is not one that fits (or is a bad one), Help takes the rule's `go` topic when this place has it,
// else says "I'm not sure" with Ask us. Dayton: an honest "Ask us" beats a wrong answer. Patterns run on the matcher's
// normalized text: lower case, no accents, $ as "dollarsign", apostrophes dropped (don't -> dont), a date as "specificdate".
const PRICE_TOPICS = ['indoor-price', 'sport-card-price', 'sport-golf-details', 'sport-rate-lines', 'indoor-price-varies', 'sport-tax', 'sport-member-rates', 'sport-no-rate', 'sport-kids-free', 'sport-package', 'sport-per-person', 'indoor-price-two', 'sport-rate-change', 'sport-rates-next-year', 'indoor-free', 'menu-add', 'indoor-typer-first', 'sport-included', 'sport-twilight-times', 'sport-peak-dates', 'indoor-min-players', 'sport-said-twice', 'menu-import', 'sport-lessons', 'indoor-extras', 'sport-rentals', 'sport-line-ages', 'sport-adaptive', 'indoor-gift', 'indoor-cost'];
const HOURS_TOPICS = ['hours', 'seasonal-hours', 'hours-third-stretch', 'indoor-summer-late', 'indoor-summer-daily', 'setup-split-hours', 'setup-third-time', 'sport-first-tee', 'sport-dawn-dusk', 'indoor-holiday-open', 'hours-open-holidays', 'sport-holiday-short', 'season', 'indoor-seasonal', 'sport-season', 'sport-opening-day', 'indoor-closed-months', 'year-round', 'indoor-yearly-break', 'setup-short-closure'];
const ACCESS_TOPICS = ['staff', 'login-create', 'access', 'not-owner', 'login-privacy', 'settings', 'signin', 'resume-device'];
// Sport test 12 (2026-11-21): the answers that close the place (closures, closed months, a yearly break) and its season.
const CLOSE_TOPICS = ['closures', 'setup-short-closure', 'sport-one-off-closure', 'indoor-closed-months', 'indoor-yearly-break', 'sport-closures-yearly', 'setup-closure-fix', 'closures-count'];
const SEASON_TOPICS = ['sport-season', 'season', 'indoor-seasonal', 'sport-opening-day', 'year-round', 'edit-season', 'setup-season'];
// Sport test 13 (2026-11-21; Gord and Linda, Twin Lakes Golf Course & RV Park: "Also the RV park opens April 28 to mid
// September, does that go here too?" got Closures, which would have closed the course for weeks). A part of the place with
// its own dates or hours (the RV park, the range, the patio, the pro shop, the bistro or restaurant, the campground) is one
// line in Good to know: never the place's closures, season or hours.
const PART_WORDS = 'rv park|rv parks|rv sites?|rv resort|rv|campground|campgrounds|campsites?|camping|patio|patios|terrasse|terrasses|bistro|restaurant|restaurants|resto|grill|lounge|kitchen|cafe|snack bar|dining room|salle a manger|clubhouse restaurant|clubhouse bar|mini golf|minigolf|mini putt|putt putt|hot tub|day spa|spa|meeting rooms?|banquet rooms?|banquet hall|event room|party room|salle de reunion|salle de reception';
// Sport test 14 (2026-11-21; Marisol: "the fitting bay is open all winter by appointment. should I say open all year then?"
// was told to set the season to Open all year): any named area or service of a course (a bay, a studio, the academy, the
// fitting bay, lessons, a meeting room) asked with open or season words is a part, never the course's season.
const GOLF_PART_WORDS = 'driving range|practice range|range|champ de pratique|simulators?|simulateurs?|sims?|trackman|gc ?quad|indoor golf|golf interieur|fitting bays?|fitting studio|fitting centre|fitting center|club fitting|club fittings|fittings?|fitting|bays?|baies?|studios?|academy|golf academy|academie|lessons?|clinics?|golf school|short game area|practice area|putting green|meeting rooms?|banquet rooms?|banquet hall|event room|board room|boardroom';
const PART_TIME = '\\b(by appointment|appointment only|appointments?|sur rendez vous|all winter|all year|year round|toute l annee|tout l hiver|open|opens|opening|opened|close|closes|closing|closed|own season|different season|separate season|its season|their season|seasonal|sa propre saison|une autre saison|hours|hour|heures|horaire|horaires|until|till|ouvre|ouvrent|ouvert|ouverte|ouverts|ferme|ferment|fermee|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|specificdate)\\b';
// Sport test 14 (Marisol: "we close the course 2 days in october for aeration but the range and restaurant stay open. do i put it
// as a closure?" got "don't mark the place closed"): when the course itself closes for a few days, the parts that stay open
// don't make it a part question. It is the course's closure.
const PLACE_SHORT_CLOSE = '\\b(close|closes|closing|closed|shut|shuts)( down)? (the )?(course|golf course|whole course|club|whole place)\\b.*\\b(ndays|days|a day|the day|week|weekend|aeration|maintenance|tournament|specificdate)\\b|\\b(course|golf course|we|club)( is| are| re| will be)? (closed|closes|close|closing|shut)\\b.*\\b(ndays|days|a day|the day|week|weekend|aeration|maintenance|tournament|specificdate)\\b|\\b(ndays|aeration|maintenance)\\b.*\\b(close|closes|closed|shut) (the )?course\\b';
// A part word and a time word within a few words of each other ("the RV park opens April 28", « le champ de pratique ouvre »).
const near = (a, b, n = 6) => `\\b(${a})\\b(?: [a-z0-9]+){0,${n}} ${b}|${b}(?: [a-z0-9]+){0,${n}} \\b(${a})\\b`;
// The pro shop is the course's own door in season; only its off-season days are a part of its own ("Linda opens the pro
// shop Tuesdays and Thursdays in December").
const SHOP_WORDS = 'pro shop|golf shop|shop|boutique du pro|boutique|store|magasin';
const OFFSEASON_WORDS = '\\b(december|decembre|january|janvier|february|fevrier|november|novembre|winter|winters|hiver|off season|offseason|hors saison|christmas|noel|holidays|course is closed|course closed|terrain est ferme|parcours est ferme)\\b';
// The place's own opening time in the same question ("the pro shop opens at 7", « la boutique du pro ouvre de 7 h »): its
// hours are asked about too.
const PLACE_OPENS_AT = '\\b(boutique du pro|boutique|pro shop|golf shop|shop|course|terrain|parcours|we|nous|on) (usually |normally |generalement )?(ouvre|ouvrons|opens|open|is open|est ouverte?|is|from) (de |from |at |a |des |around |vers )?[0-9]';
const PART_FIT = ['sport-part-season', 'sport-restaurant', 'indoor-good-to-know', 'sport-offseason-other', 'sport-sister-listing', 'sport-last-booking', 'sport-first-tee', 'sport-dawn-dusk', 'hh-some-months', 'hh-times', 'setup-happy-split', 'sport-social-hour', 'sport-hh-none-specials', 'sport-food-menu', 'sport-dogs', 'phone', 'sport-chip-season', 'sport-gtk-full', 'sport-one-listing', 'sport-second-kind', 'sport-offseason-events', 'sport-season-says', 'sport-bay-link', 'indoor-also-offer', 'indoor-busy-times', 'sport-members', 'sport-lessons', 'sport-tee-times', 'sport-dress-code', 'sport-weather', 'sport-refunds', 'sport-what-to-bring', 'sport-free-clubs', 'sport-rentals', 'sport-no-rentals', 'indoor-access', 'sport-no-range', 'photo-add', 'sport-season-says', 'shows-closed'];
// Every answer that sets the place's own hours (place-wide), as against a part's.
const PLACE_HOURS = ['hours', 'seasonal-hours', 'hours-third-stretch', 'indoor-summer-late', 'indoor-summer-daily', 'setup-split-hours', 'setup-third-time', 'year-round', 'hours-right'];
// "We still open to the public that weekend. Do I put it in closures?"
const STILL_OPEN = '\\b(still open|still be open|open to the public|open as usual|open like normal|open like usual|business as usual|toujours ouverts?|toujours ouvertes?|restons ouverts?|reste ouvert|ouverts? au public|ouvert comme d habitude)\\b';
const FIT13 = [
  // A part of the place, named with dates, months or hours (golf courses: also the range, the simulator, the academy).
  { id: 'part-own-time', all: [near(PART_WORDS, PART_TIME)],
    not: ['\\b(we|nous|on|course|club|arena|rink|park is|centre|center|facility|terrain|parcours|whole place|everything|tout) (is |are |re |est |sont )?(all )?(closed|close|closes|shut|ferme|fermee|fermons) (on|for|le|pour|the) (specificdate|christmas|noel|thanksgiving|good friday|easter|paques|a day|the day|that day|ce jour)\\b', '\\b(gift|gifts|cadeau|cadeaux|certificates?|certificat|cards?|cartes?)\\b(?!.*\\b(december|decembre|hours|heures|open|opens|ouvre|ouvert)\\b)', '\\b(happy hour|5 a 7|social hour)\\b', '\\b(email|courriel|instagram|facebook|website|site web) (shop|boutique)\\b', '\\bshop (name|account|page|instagram|insta)\\b', PLACE_OPENS_AT, PLACE_SHORT_CLOSE],
    fit: PART_FIT, bad: CLOSE_TOPICS.concat(SEASON_TOPICS, PLACE_HOURS), go: ['sport-part-season', 'sport-restaurant'] },
  { id: 'golf-part-own-time', golfCourse: true, all: [near(GOLF_PART_WORDS, PART_TIME)],
    not: ['\\b(no|dont have|don t have|do not have|without|pas de) (a |any )?(driving |practice )?range\\b', '\\b(price|age|date|time) range\\b', '\\brange balls?\\b', '\\b(happy hour|5 a 7)\\b', PLACE_OPENS_AT, PLACE_SHORT_CLOSE],
    fit: PART_FIT, bad: CLOSE_TOPICS.concat(SEASON_TOPICS, PLACE_HOURS), go: ['sport-part-season', 'sport-offseason-other'] },
  { id: 'shop-offseason', golfCourse: true, all: [`\\b(${SHOP_WORDS})\\b`, OFFSEASON_WORDS, PART_TIME], not: ['\\b(email|courriel|instagram|insta|facebook|website|site web) (shop|boutique)\\b', '\\bshop (name|account|page|instagram|insta)\\b'],
    fit: PART_FIT, bad: CLOSE_TOPICS.concat(SEASON_TOPICS, PLACE_HOURS), go: ['sport-part-season'] },
  // "We're still open to the public that weekend. Do I put it in closures?": open is never a closure. A draw, a
  // tournament or an event that day is an event.
  { id: 'still-open-event', all: [STILL_OPEN, '\\b(closures?|close|closed|closing|fermetures?|ferme|fermer|fermee)\\b', '\\b(draw|draws|tournament|tournaments|tourney|scramble|event|events|prize|prizes|party|fundraiser|tournoi|tournois|evenement|evenements|tirage|fete)\\b'],
    fit: ['sport-tournaments', 'event-add', 'event-repeat', 'indoor-theme-nights', 'weekly-nights', 'sport-offseason-events', 'indoor-groups'], bad: CLOSE_TOPICS.concat(SEASON_TOPICS), go: ['sport-tournaments', 'event-add'] },
  { id: 'still-open', all: [STILL_OPEN, '\\b(closures?|close|closed|closing|fermetures?|ferme|fermer|fermee)\\b'], bad: CLOSE_TOPICS.concat(SEASON_TOPICS) },
  // "All these prices are plus tax. Do I have to write plus tax on every line": the tax answer.
  { id: 'tax', all: ['\\b(tax|taxes|gst|pst|hst|tps|tvq|tvh|tvp|taxe)\\b'], not: ['\\b(tax receipt|tax receipts|recu d impot|charitable)\\b'],
    fit: ['sport-tax', 'cost', 'indoor-cost', 'sport-included'], go: ['sport-tax'] },
  // A drink named as served (draft beer, wine) is never "we don't serve alcohol".
  { id: 'drinks-served', all: ['\\b(draft|draught|beer|beers|wine|wines|cocktails?|pints?|biere|bieres|vin|vins|licensed|liquor licence|caesars?)\\b'],
    not: ['\\b(no|dont|don t|not|without|never|pas de|sans|aucun|aucune|n a pas|ne sert pas|ne servons pas) (?:(?:serve|sell|have|a|any|de|d) ){0,2}(alcohol|beer|beers|liquor|licen[cs]e|wine|biere|bieres|vin|alcool|bar)\\b', '\\bnot licensed\\b', '\\bpas de permis\\b'],
    bad: ['sport-no-bar'] },
  // "We dont have a real happy hour. Next year we're starting Thirsty Thursdays, 18 holes with a cart, a draft beer and a
  // hotdog": a weekly special, never a happy hour, never "no alcohol".
  { id: 'no-hh-weekly', all: ['\\b(no|dont have|doesnt have|do not have|does not have|without|not have|pas de|n a pas|aucun) (?:(?:a|an|any|real|actual|vrai) ){0,2}(happy hour|5 a 7|social hour)\\b', '\\b(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays|weekly|every week|each week|package|packages|forfaits?|beer|draft|biere|hot ?dogs?|cart|18 holes|9 holes|chaque semaine|les jeudis|les vendredis)\\b'],
    fit: ['sport-hh-none-specials', 'sport-package', 'dont-have', 'sport-restaurant', 'indoor-theme-nights', 'specials'], go: ['sport-hh-none-specials'] },
  // "Is this a happy hour?" (a twilight discount, half-price bar food, beers after league): happy hour's own answers, the
  // price lines, or Ask us. Never an unrelated answer.
  { id: 'hh-asked', all: ['\\b(happy hour|happy hours|5 a 7|cinq a sept|social hour|heure sociale)\\b'],
    fit: ['hh-some-months', 'hh-times', 'hh-deals', 'setup-happy-split', 'sport-social-hour', 'indoor-bar', 'sport-no-bar', 'sport-hh-none-specials', 'dont-have', 'sport-package', 'sport-rate-lines', 'sport-twilight-times', 'specials', 'weekly-nights', 'indoor-theme-nights', 'sport-restaurant', 'sport-sister-listing', 'sport-food-menu', 'setup-happy', 'happy-hour', 'hh-add', 'sport-part-season'] },
  // "My wife Linda and I share this one phone. Does she need her own login or can we both use this?"
  { id: 'share-device', all: ['\\b(share|sharing|shared|same|one) (this |the |a |our |my |one )*(phone|device|cell|cellphone|tablet|ipad|computer|login|account|email)\\b|\\bboth use\\b|\\buse it together\\b|\\bmeme (telephone|cellulaire|compte|appareil|ordinateur)\\b|\\bpartage(ons|r|z)? (le|ce|un|notre) (telephone|cellulaire|compte|appareil)\\b'],
    fit: ['staff', 'login-create', 'resume-device', 'login-privacy', 'settings', 'access', 'own-login'], bad: ['not-owner'], go: ['staff'] },
  // "Your value thing on our page says driving range not documented but we have a driving range. Can you fix that?": the
  // course facts come from our checked golf data (Message us), never "Nothing to untick".
  { id: 'golf-facts-wrong', golfCourse: true, all: ['\\b(driving range|range|holes|par|yardage|yards|slope|putting green|course map|value|index|facts|scorecard|designer|champ de pratique|trous|normale)\\b', '\\b(not documented|undocumented|says|said|shows|showing|wrong|incorrect|missing|fix|correct|corrige|corriger|faux|fausse|erreur|isnt right|not right|out of date|dit|indique)\\b', '\\b(page|listing|site|value|index|glance|top|fiche|your)\\b'],
    not: ['\\b(no|dont have|don t have|do not have|without|pas de) (a |any )?(driving |practice )?range\\b'],
    fit: ['sport-golf-facts', 'sport-golf-details', 'indoor-old-line', 'google', 'sport-card-price'], bad: ['sport-no-range'], go: ['sport-golf-facts', 'sport-golf-details'] },
  // "The green fee table up top says 2026 rates from your research. Will it change to the prices Linda typed in?": yes,
  // research's table comes off once their own prices are in.
  { id: 'research-table', golfCourse: true, all: ['\\b(table|chart|research|tableau|recherche|recherches|up top|at the top|old rates|last year s|last years)\\b', '\\b(change|changes|replace|replaced|update|updated|switch|go away|come off|comes off|remplac[a-z]*|disparai[a-z]*|still show|still there|stay|reste)\\b', '\\b(price|prices|rates?|fees?|green fees?|tarifs?|prix|droits? de jeu)\\b'],
    fit: ['sport-golf-details', 'sport-card-price', 'indoor-old-line', 'live-speed', 'changes-review'], go: ['sport-golf-details'] },
  // A pro shop or a shop named for its hours, phone or account is not a gift shop.
  { id: 'shop-not-gift', all: ['\\b(pro shop|golf shop|shop|boutique|store|magasin)\\b'], not: ['\\b(gift|gifts|cadeau|cadeaux|certificates?|certificats?|gift cards?|cartes? cadeaux?|souvenirs?|merch|merchandise|memberships?|abonnements?|sell|sells|vend|vendons|retail)\\b'],
    bad: ['indoor-gift'] },
  // "the bistro and RV park are extensions 102 and 103": the phone answer.
  { id: 'phone-extension', all: ['\\b(extension|extensions|ext|poste [0-9]+|un poste|le poste|postes [0-9]+)\\b'], fit: ['phone', 'name-address', 'google'], go: ['phone'] },
  // An address question is the address answer (or where people meet).
  { id: 'address', all: ['\\b(address|addresses|adresse|adresses|civic number|numero civique|street number|no street)\\b'], not: ['\\b(email|e mail|courriel|web|website|web site|site|url|internet) (address|adresse)\\b|\\badresse (courriel|e mail|electronique|web|du site|de notre site|internet)\\b', '\\bip address\\b'],
    fit: ['name-address', 'sport-meeting-place', 'google', 'phone', 'not-found', 'settings', 'indoor-old-line', 'website-broken', 'map-pin'], go: ['name-address'] },
  // "How long before my changes show on the page?": how fast changes go live, never how long a visit takes.
  { id: 'changes-when', all: ['\\b(how long|combien de temps|when will|how soon|how fast|how quickly|des que|avant que|quand est ce que)\\b', '\\b(changes?|changements?|modifications?|updates?|edits?|photos?|show|shows|show up|appear|appears|live|online|en ligne|paraiss[a-z]*|parait|apparai[a-z]*|visible|mise a jour)\\b'],
    not: ['\\b(visit|visits|round|rounds|game|games|lesson|lessons|class|classes|session|sessions|tour|tours|to play|takes to play|partie|parties|cours|visite|ronde|lift|chairlift|wait)\\b', '\\b(closure|closures|closed|close|closing|ferme|fermee|fermeture|smoke|fumee|weather)\\b'],
    fit: ['live-speed', 'setup-live-when', 'changes-review', 'photos-when', 'photo-pending', 'see-page', 'nothing-changed', 'menu-change', 'event-add'], go: ['live-speed'] },
  // "Can I add the mini-putt as a third kind?": the kinds answers.
  { id: 'kinds-add', all: ['\\b(kind|kinds|genre|genres|category|categories|categorie|categories)\\b', '\\b(second|third|another|other|deuxieme|troisieme|autre|add|ajouter|pick|choose|tick|cocher|select|both)\\b'],
    fit: ['indoor-kinds-many', 'sport-kinds-other', 'sport-second-kind', 'sport-one-listing', 'sport-sister-listing', 'sport-part-season', 'indoor-also-offer', 'sport-offseason-other', 'cuisine-pick', 'sport-find-me'], go: ['sport-second-kind', 'indoor-kinds-many'] },
  // A tournament or a competition: the tournaments answer, its closure, its event, or a group or league answer.
  { id: 'tournament', all: ['\\b(tournament|tournaments|tourney|tournoi|tournois|pdga|competition|competitions|championship|championnat|scramble|member guest|amateur)\\b'], not: ['\\b(championship|championnat) (course|layout|golf course|parcours)\\b'],
    fit: ['sport-tournaments', 'sport-one-off-closure', 'closures', 'setup-short-closure', 'sport-closures-yearly', 'setup-closure-fix', 'closures-count', 'sport-book-ahead-hours', 'sport-peak-dates', 'indoor-groups', 'event-add', 'event-repeat', 'event-change', 'sport-members', 'sport-lessons', 'sport-package', 'sport-group-size', 'sport-offseason-events', 'sport-photo-consent', 'photo-add', 'sport-two-courses', 'sport-refunds', 'sport-weather', 'sport-what-to-bring', 'sport-included', 'sport-dress-code', 'indoor-good-to-know', 'sport-peak-dates'], go: ['sport-tournaments'] },
  // "Lane swim is booked online but leisure swim is just show up", "we book by phone only, no website": how people book
  // (walk-ins or booking), never the session times or "no website, only Facebook".
  { id: 'book-or-walkin', all: ['\\b(reserv[a-z]*|book|books|booking|bookings|booked|book ahead)\\b', '\\b(show up|shows up|drop in|drop ins|walk in|walk ins|walkins|walk on|walk ons|just come|just call|by phone|par telephone|au telephone|sans reservation|pas de site web|no website|dont have a website)\\b'],
    not: ['\\b(instagram|insta|facebook|fb)\\b'],
    fit: ['indoor-booking', 'sport-same-day', 'sport-book-ahead-hours', 'sport-walk-ons', 'sport-tee-times', 'booking-link', 'sport-booking-link', 'indoor-groups', 'indoor-book-party', 'sport-bay-link', 'links', 'phone', 'sport-members', 'indoor-busy-times', 'sport-lessons', 'sport-peak-dates', 'sport-dress-code', 'indoor-good-to-know', 'sport-offseason-other', 'sport-part-season', 'sport-what-to-bring', 'sport-refunds', 'indoor-min-players', 'indoor-per-room'], go: ['indoor-booking'] },
  // "How do I set different hours?": an hours answer.
  { id: 'hours-how', all: ['\\b(how do (i|we)|how can (i|we)|how to|where do (i|we)|comment (je|on)|ou est ce que (je|on)) (set|show|put|enter|change|add|do|mettre|mets|indiquer|indique|entrer|changer)\\b', '\\b(hours|heures|horaires?|opening times|open times)\\b'],
    not: ['\\b(happy hour|5 a 7|social hour)\\b'],
    fit: ['hours', 'seasonal-hours', 'hours-third-stretch', 'indoor-summer-late', 'indoor-summer-daily', 'setup-split-hours', 'setup-third-time', 'sport-first-tee', 'sport-dawn-dusk', 'indoor-holiday-open', 'hours-open-holidays', 'sport-holiday-short', 'season', 'indoor-seasonal', 'sport-season', 'sport-opening-day', 'indoor-closed-months', 'year-round', 'indoor-yearly-break', 'sport-last-booking', 'indoor-no-hours', 'indoor-swim-times', 'sport-extra-sessions', 'hours-right', 'google', 'sport-part-season', 'sport-offseason-other', 'sport-restaurant', 'indoor-busy-times', 'sport-members', 'sport-chip-season', 'shows-closed'],
    go: ['seasonal-hours', 'hours'] },
  // "Bike park open May long weekend to Thanksgiving": the season.
  { id: 'season-range', all: ['\\b(open|opens|opening|ouvert|ouverts|ouverte|ouvre|ouvrons|season|saison|runs?|run)\\b(?: [a-z0-9]+){0,3} (from |de |du )?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|may long weekend|victoria day|easter|paques|specificdate)\\b(?: [a-z0-9]+){0,3} (to|until|till|through|thru|a|au|jusqu)\\b'],
    not: ['\\b(happy hour|5 a 7|social hour)\\b'],
    fit: SEASON_TOPICS.concat(['sport-weather', 'sport-season-says', 'indoor-closed-months', 'seasonal-hours', 'sport-part-season', 'sport-offseason-other', 'indoor-summer-daily', 'sport-chip-season', 'sport-first-tee', 'hours', 'sport-closures-yearly', 'sport-one-off-closure', 'closures', 'sport-peak-dates', 'indoor-yearly-break', 'sport-restaurant', 'sport-offseason-events', 'sport-season-says', 'indoor-summer-late', 'hours-third-stretch', 'sport-aeration', 'sport-rate-change', 'sport-rates-next-year', 'sport-twilight-times', 'indoor-camps', 'sport-lessons', 'sport-extra-sessions', 'sport-second-kind', 'indoor-kinds-many', 'sport-sister-listing', 'sport-dawn-dusk', 'sport-last-booking'], PLACE_HOURS), go: ['sport-season', 'indoor-seasonal', 'season'] },
  // "Lequel va dans la case du prix?": the Price box answers only (never extras or rentals).
  { id: 'price-box', all: ['\\b(price box|price field|the price box|case du prix|case prix|champ du prix|on price|in price|for price|goes in price|which one|lequel|laquelle|which number|which rate|which price|quel prix|quel tarif)\\b', '\\b(dollarsign|price|prices|rate|rates|fee|fees|tarif|tarifs|prix|dollars?|bucks)\\b'],
    fit: ['indoor-price', 'sport-card-price', 'sport-golf-details', 'indoor-price-varies', 'sport-twilight-times', 'sport-rate-lines', 'sport-member-rates', 'sport-no-rate', 'sport-kids-free', 'indoor-free', 'sport-package', 'sport-per-person', 'indoor-price-two', 'sport-rates-next-year', 'sport-tax', 'indoor-min-players', 'sport-lessons', 'sport-peak-dates', 'sport-rate-change', 'indoor-per-room', 'indoor-typer-first', 'menu-add', 'sport-public', 'indoor-no-set-price', 'hh-deals', 'sport-said-twice', 'sport-bay-link', 'setup-missing'], go: ['indoor-price'] },
  // "Our story says private club; we're semi-private now. Rewrite or add a sentence?": the story answers.
  { id: 'story-edit', all: ['\\b(story|histoire|description|our text|notre texte|blurb|about us)\\b', '\\b(rewrite|re write|reecri[a-z]*|change|changer|edit|update|corrige[a-z]*|ajoute[a-z]*|add|sentence|phrase|line|ligne|outdated|old|ancienne?|wrong|says|dit|parle|talks? about|mentions?)\\b'],
    fit: ['description', 'indoor-old-line', 'indoor-french', 'fr-desc-old', 'french-lines', 'sport-sports-words', 'sport-find-me', 'sport-public', 'easy-setup', 'setup-change-later', 'sport-approval-first', 'sport-package', 'indoor-also-offer', 'live-speed', 'changes-review', 'plan-visit', 'indoor-good-to-know', 'sport-gtk-full', 'sport-sister-listing', 'sport-one-listing'], go: ['description'] },
  // "Should we tick Free? We have an honesty box": Free entry and the price answers.
  { id: 'free-tick', all: ['\\b(free|gratuit|gratuite|honesty box|by donation|donation|dons)\\b', '\\b(tick|click|check|cocher|coche)\\b'], not: ['\\b(is|are|if|when) (a |the |one )?(bay|bays|lane|lanes|court|courts|table|tee|tees|spot|spots|room|rink|sheet) (is |are )?free\\b'],
    fit: ['indoor-free', 'sport-kids-free', 'indoor-price', 'sport-golf-details', 'indoor-cost', 'cost', 'sport-public', 'sport-kid-badge', 'indoor-age', 'sport-free-clubs', 'sport-card-price', 'features', 'sport-terms', 'scam'] },
  // "Snow covers it Dec to March, can I say it's closed for winter?", "Arena is closed April to August, where do I say
  // that?": how to set the season, never "Will my page say we're closed?".
  { id: 'season-where', all: ['\\b(closed|close|ferme|fermee|fermes|shut)\\b', '\\b(winter|for the season|for winter|months?|mois|hiver|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\\b', '\\b(where do (i|we) (say|put|show|add|enter)|how do (i|we) (say|put|show|add|set|enter)|can (i|we) (say|put|show|mark)|where (would|should) (i|we)|ou est ce que (je|on)|ou je (le )?(dis|mets|indique)|comment (je|on) (le )?(dis|mets|indique)|where does that go|where do i say)\\b'],
    bad: ['sport-season-says', 'shows-closed'], go: ['sport-season', 'indoor-seasonal', 'season'] },
];
const FIT = [
  // Sport test 14 (2026-11-21; Marisol at Fairview Mountain: 9 confident answers to a different question). Each was taken on a
  // strong key that names the answer's situation ("open all year", "tick indoor golf", "own page") while the question was
  // about something else, and no rule knew the question's own intent. These are those intents, in general words:
  // "Is my website address ok for the tee-time link?" is the booking link, never the street address.
  { id: 'tee-link', all: ['\\b(tee times?|tee sheet|chronogolf|golfnow|golf now|teeon|tee on|lightspeed|booking|bookings|book online|online booking|reservations?|reservation en ligne|reserver en ligne|departs?)\\b', '\\b(website|web site|site|link|links|url|address|popup|pop up|widget|lien|site web|adresse)\\b'],
    not: ['\\b(instagram|insta|facebook|fb)\\b', '\\b(charge|charges|charged|cost|costs|fee|fees|commission|pay|paid|payer|bill|invoice|frais|cout|coute)\\b', '\\b(dont see|don t see|do not see|cant see|can t see|not showing|isnt showing|doesnt show|not there|disappeared|missing|anymore|no longer|ne vois pas|vois plus|disparu)\\b'],
    fit: ['sport-tee-times', 'booking-link', 'sport-booking-link', 'indoor-booking', 'links', 'sport-bay-link', 'sport-walk-ons', 'indoor-book-party', 'sport-same-day', 'sport-book-ahead-hours', 'website-broken', 'indoor-groups', 'sport-members', 'sport-peak-dates', 'phone'],
    go: ['sport-tee-times', 'booking-link'] },
  // "I saved our tee time link but I don't see a Book a tee time button": the Book button answer.
  { id: 'book-button-missing', all: ['\\b(dont see|don t see|do not see|cant see|can t see|not seeing|not showing|isnt showing|doesnt show|not there|isnt there|gone|disappeared|missing|no longer|anymore|went away|vanished|ne vois pas|vois plus|n apparait pas|ne parait pas|disparu)\\b', '\\b(book|booking|button|bouton|reserver|reservation)\\b'],
    not: ['\\b(photo|photos|pic|pics|picture|pictures|menu|event|events|evenement)\\b'],
    fit: ['sport-book-button', 'changes-review', 'live-speed', 'photo-pending', 'nothing-changed', 'see-page'], go: ['sport-book-button'] },
  // "The restaurant at our club has its own listing here. Can I update that one too from this login?": another listing on
  // the same login.
  { id: 'other-listing-login', all: ['\\b(own|other|another|second|separate|sister|that|both) (listing|listings|page|pages|fiche|fiches|business|businesses|location)\\b|\\b(that one|the other one|both of them)\\b', '\\b(login|log in|logged in|account|sign in|signed in|this link|same link|compte|connexion)\\b'],
    fit: ['more-businesses', 'sport-two-courses', 'staff', 'login-create', 'signin', 'access', 'sport-sister-listing', 'resume-device'], go: ['more-businesses', 'sport-sister-listing'] },
  // "The restaurant already has its own page on your site. Should I talk about it in our story?": the other page's answer.
  { id: 'own-listing', all: ['\\b(has|have|got|already|is|are|its|it s|deja|a|ont)( already| deja)? (its own|their own|a separate|a seperate|separate|sa propre|leur propre|une autre) (page|listing|listings|fiche|profile)\\b|\\b(already|deja) (has a page|has a listing|listed|une page|une fiche)\\b'],
    not: ['\\b(login|log in|account|sign in|compte|connexion)\\b', '\\b(happy hour|5 a 7|specials?|speciaux|deals?)\\b'],
    fit: ['sport-sister-listing', 'sport-restaurant', 'more-businesses', 'sport-two-courses', 'sport-one-listing', 'sport-hh-none-specials', 'sport-social-hour', 'sport-food-menu', 'sport-offseason-other', 'sport-part-season'], go: ['sport-sister-listing'] },
  // A fitting bay or lesson studio (by appointment, not to play) is never Indoor golf, and never another listing.
  { id: 'fitting', golfCourse: true, all: ['\\b(fitting|fittings|fitter|club fit|clubfitting)\\b'], not: ['\\b(all winter|all year|year round|season|seasonal|winter|off season|offseason|hiver|saison|toute l annee)\\b'],
    fit: ['sport-bay-link', 'sport-lessons', 'indoor-good-to-know', 'description', 'sport-part-season', 'indoor-also-offer', 'sport-second-kind'], bad: ['sport-sister-listing', 'year-round'], go: ['sport-bay-link'] },
  // "Should I add driving range here?": adding a kind, never "we don't have a driving range".
  { id: 'add-kind', all: ['\\b(add|tick|pick|choose|select|include|ajouter|cocher|choisir)\\b(?: [a-z]+){0,3} (driving range|range|practice range|simulators?|indoor golf|mini golf|minigolf|mini putt|champ de pratique|golf interieur|simulateurs?)\\b'],
    not: ['\\b(no|dont have|don t have|do not have|without|pas de|theres no|there s no|there is no) (a |an |any )?(driving |practice )?(range|simulators?|mini golf|champ de pratique)\\b'],
    fit: ['sport-second-kind', 'indoor-kinds-many', 'sport-kinds-other', 'sport-part-season', 'sport-bay-link', 'indoor-also-offer', 'sport-lessons', 'sport-offseason-other', 'sport-one-listing', 'sport-sister-listing'], bad: ['sport-no-range'], go: ['sport-second-kind', 'indoor-kinds-many'] },
  // The same shape for the hours and booking answers: an hours answer needs a time, open or close word; a booking-link
  // answer a booking word ("the baskets get moved for winter" is no hours question; "a scorecard app, can I link it" is no
  // booking link).
  { id: 'hours-needs-time', all: ['.'], not: ['\\b(hours?|hrs|open|opens|opened|opening|close|closes|closed|closing|time|times|schedule|am|pm|noon|midnight|dawn|dusk|dark|daylight|sunset|sunrise|late|early|earlier|later|until|till|heures?|horaires?|ouvert|ouverte|ouverts|ouvre|ouvrons|ferme|fermee|fermons|midi|soir|matin|[0-9]{1,2}(?: ?[0-9]{2})?)\\b'],
    bad: ['hours', 'seasonal-hours', 'hours-third-stretch', 'indoor-summer-late', 'indoor-summer-daily', 'setup-split-hours', 'setup-third-time', 'hours-right'] },
  { id: 'booking-needs-book', all: ['.'], not: ['\\b(book|books|booked|booking|bookings|reserv[a-z]*|rental|rentals|rent|party|parties|tee times?|tee sheet|chronogolf|golfnow|walk ins?|walk ons?|tickets?|billets?|location|fete|fetes|departs?|appointments?|rendez vous|schedule|sign up|signups?|register|registration|inscri[a-z]*)\\b'],
    bad: ['sport-booking-link', 'booking-link', 'indoor-booking', 'sport-tee-times', 'sport-bay-link', 'indoor-book-party'] },
  // "We only have a Facebook group, not a page": no answer here fits it (Ask us).
  { id: 'social-group', all: ['\\b(facebook|fb|insta|instagram)\\b', '\\b(group|groupe)\\b'], not: ['\\b(group (rates?|bookings?|lessons?|packages?|sizes?|events?)|groups? of)\\b'], fit: ['sport-shared-social', 'sport-two-accounts'] },
  // "There's no street address, it's in the back of the park": where people find it, never "change your address".
  { id: 'no-street-address', all: ['\\b(no|dont have|don t have|without|not a|isnt a|pas d|pas de) (a |any |real |civic |street )*(street )?(address|adresse|civic number|numero civique)\\b'],
    fit: ['sport-meeting-place', 'map-pin', 'indoor-good-to-know'], go: ['sport-meeting-place'] },
  // An answer about the restaurant or its food needs a restaurant, patio, bar or food word in the question.
  { id: 'restaurant-needs-food', all: ['.'], not: ['\\b(restaurant|restaurants|resto|patio|patios|terrasse|bistro|cafe|grill|kitchen|food|foods|lunch|lunches|dinner|dinners|breakfast|brunch|menu|menus|clubhouse|dining|bar|bars|lounge|snack|snacks|meal|meals|eat|eats|eating|nourriture|repas|souper|soupers|diner|dejeuner|cuisine|winemaker|chef|wine|beer|drinks?|biere|vin)\\b'],
    bad: ['sport-restaurant', 'sport-food-menu'] },
  // Sport test 12 (2026-11-21; Rob: "carringtons closes oct 17, a couple weeks before the course. does the happy hour need
  // different dates" got Closures, which would have closed his course Oct 18–31). The safety rule: the answers that close
  // the place (closures, closed months, its season), make it free, or set its main price need a strong intent: a close
  // word (closed, close, shut…) about the place itself, a free word, a price word. A question about a part of the place
  // (its restaurant, patio, happy hour, pro shop, simulator) closing is never answered by them: it gets the topic its
  // subject points to (happy hour months here), else "I'm not sure" with Ask us.
  { id: 'hh-dates', not: ['\\b(no|dont have|doesnt have|do not have|does not have|without|not have|pas de|n a pas|aucun) (a |an |any |real )?(happy hour|5 a 7|social hour)\\b'], all: ['\\b(happy hour|happy hours|5 a 7|cinq a sept|social hour|heure sociale)\\b', '\\b(dates?|months?|mois|ends?|ending|until|jusqu|closes?|closing|closed|ferme|fermes|fermee|season|saison|october|oct|september|sept|april|november|march|may|june|july|august|mars|avril|mai|octobre|septembre|specificdate|mid|early|late|before the course|only when|seulement quand)\\b'],
    fit: ['hh-some-months', 'hh-times', 'setup-happy-split', 'sport-social-hour', 'indoor-bar', 'hh-deals'], bad: CLOSE_TOPICS.concat(SEASON_TOPICS), go: ['hh-some-months', 'hh-times'] },
  { id: 'close-needs-close', all: ['.'], not: ['\\b(close|closed|closes|closing|closure|closures|shut|shuts|shutting|off|vacation|holiday|holidays|break|not open|no public|ferme|fermee|fermes|fermons|fermer|fermeture|fermetures|conge|conges|feries?|vacances|pause|reopen|reopens|rouvre|tournament|tournoi|championship|championnat|private event|evenement prive|season|saison|winter|hiver|summer|ete|months?|mois|year|annee|snow|neige|specificdate|dates?)\\b'],
    bad: CLOSE_TOPICS },
  { id: 'part-closes', all: ['\\b(restaurant|restaurants|resto|patio|terrasse|bar|lounge|grill|bistro|kitchen|cafe|pro shop|happy hour|5 a 7|carringtons|dining room|salle a manger)(?: [a-z0-9]+){0,3} (closes|closing|closed|ferme|fermee|ends|until)\\b'],
    not: ['\\b(we|nous|on|course|club|arena|rink|park|centre|center|facility|terrain|parcours|place|whole)(?: [a-z0-9]+){0,3} (close|closes|closing|closed|shut|shuts|ferme|fermons|fermee)\\b'],
    fit: ['sport-part-season', 'sport-restaurant', 'indoor-good-to-know', 'hh-some-months', 'hh-times', 'sport-offseason-other', 'sport-hh-none-specials', 'sport-food-menu', 'sport-season-says', 'sport-sister-listing', 'sport-bay-link', 'phone'], bad: CLOSE_TOPICS.concat(SEASON_TOPICS), go: ['sport-part-season', 'sport-restaurant'] },
  { id: 'free-needs-free', all: ['.'], not: ['\\b(free|gratuit|gratuite|gratuits|gratuites|donation|dons?|no charge|no cost|pay what|costs? nothing|sans frais|honesty box|boite|admission|entry|entree|charge|charges|payer|pay|paid|fee|fees|frais|cost|costs|cout|price|prix|dollarsign)\\b'], bad: ['indoor-free'] },
  { id: 'price-needs-money', all: ['.'], not: ['\\b(dollarsign|price|prices|pricing|priced|rate|rates|fee|fees|cost|costs|charge|charges|tarif|tarifs|prix|cout|coute|coutent|dollars?|bucks|green fees?|droits? de jeu|how much|combien|cheap|cheaper|cheapest|expensive|discount|discounts|rabais|pay|payer|paid|adult|adults|adulte|adultes|senior|seniors|aines?|junior|juniors|kids|enfants?|child|children|family|familial|ticket|tickets|billet|billets|admission|entry|entree|bucket|buckets|seau|pass|passes|[0-9]{1,4})\\b'], bad: ['indoor-price'] },
  // "2027 rates: 229 peak, 179 april/oct, 9 holes after 4 is 89. cart included. which one goes here": several prices and
  // "which one" is the Price rule, never what's included.
  { id: 'which-of-several', not: ['\\b(without|not included|isnt included|excluded|extra|plus tax|en sus)\\b'], all: ['\\b(which (one|number|price|rate|fee|amount)|which goes|goes here|what goes here|which do (i|we)|lequel|laquelle|quel (prix|tarif|montant))\\b', '\\b[0-9]{2,4}\\b.*\\b[0-9]{2,4}\\b'],
    fit: ['indoor-price', 'sport-card-price', 'sport-golf-details', 'sport-package', 'sport-lessons'], bad: ['sport-included', 'sport-rate-lines', 'menu-add', 'sport-peak-dates', 'sport-twilight-times'], go: ['indoor-price'] },
  // "it says I need who can come to get 100% but it already says saved. what's missing?"
  { id: 'missing-item', all: ['\\b(missing|manque|manquant|left to do|still need|stuck|bloque|why not|pourquoi pas)\\b', '\\b(100|9[0-9]|percent|pour cent|complete|saved|enregistre|who can come|qui peut venir)\\b'],
    fit: ['setup-missing', 'page-complete'], go: ['setup-missing'] },
  // "there's no 16+ chip, our group packages are 16 or more": no new chip; his own words (sport-group-size).
  { id: 'group-size', all: ['\\b(16|18|20|24|30|32|40)( or more| plus| and up| and over| et plus)?\\b', '\\b(group|groups|groupe|groupes|package|packages|forfaits?)\\b', '\\b(chip|chips|choice|choices|option|options|size|sizes|taille|there s no|theres no|there is no|not there|isnt there|missing|pas de)\\b'],
    fit: ['sport-group-size', 'indoor-groups'], go: ['sport-group-size'] },
  // "page says kid friendly now… should that be on"
  { id: 'kid-badge', all: ['\\b(kid friendly|kids friendly|family friendly|family fun spot|not a family|badge enfants bienvenus|pas un endroit familial)\\b'],
    fit: ['sport-kid-badge', 'indoor-age', 'features'], go: ['sport-kid-badge'] },
  // "thursdays after noon theres no public tee times because of mens night. how do i tell people": a Good to know line (and
  // a weekly event), never a Known for line.
  { id: 'no-public-times', all: ['\\b(no public (tee times?|times?|play|golf|bookings?|access)|public (cant|can t|cannot) (play|book|golf|come)|members only|member only|pas de departs? (pour le|au) public|reserve aux membres|membres seulement)\\b'],
    fit: ['sport-members', 'indoor-busy-times'], bad: ['indoor-theme-nights', 'description', 'plan-visit'], go: ['sport-members', 'indoor-busy-times'] },
  // "Will I lose what I've done if I finish on my phone?", "How do I get back in tonight on my phone?"
  { id: 'resume', all: ['\\b(phone|cell|mobile|laptop|computer|tablet|ipad|tonight|tomorrow|at home|another device|other device|telephone|cellulaire|ordinateur|tablette|ce soir|demain|a la maison)\\b',
    '\\b(lose|lost|start again|start over|get back in|get back into|come back to|back in|finish|pick up where|carry on|continue|resume|perdre|perdu|perdrai|recommencer|revenir|continuer|finir|terminer)\\b'],
    not: ['\\b(lost|lose) (my|the|our) (edit )?link\\b', '\\bpassword\\b', '\\b(photo|photos|pics|pictures)\\b'],
    fit: ['resume-device', 'setup-change-later', 'login-create', 'newlink', 'signin', 'setup-status', 'indoor-fill-all', 'sport-approval-first', 'setup-live-when', 'easy-setup', 'settings', 'forgot', 'staff'], go: ['resume-device'] },
  // "lost the email" / "lost my link": a new link, never how to carry on.
  { id: 'lost-link', all: ['\\b(lost|lose|cant find|can t find|deleted|deleted) (the|my|our) (email|e mail|link|edit link|private link)\\b'],
    fit: ['newlink', 'noemail', 'login-create', 'signin', 'forgot'], go: ['newlink'] },
  { id: 'lost-link-fr', all: ['\\b(perdu|efface|supprime|trouve plus|retrouve plus|retrouve pas|trouve pas) (le|mon|notre|ce) (courriel|lien|lien de modification|lien prive)\\b|\\b(le|mon|notre) (courriel|lien) (est )?(perdu|efface|supprime)\\b'],
    fit: ['newlink', 'noemail', 'login-create', 'signin', 'forgot'], go: ['newlink'] },
  // "We also have a toll free line… Can I list both numbers?"
  { id: 'phone2', all: ['\\b(toll free|tollfree|1 8[0-9]{2} [0-9]{3}|second (phone|number|line)|two (phone )?numbers|both (phone )?numbers|another (phone )?number|other (phone )?number|deux numeros|autre numero|deuxieme numero|second numero|numero sans frais|sans frais|deux telephones)\\b'],
    fit: ['phone', 'name-address', 'google'], bad: ['sport-offseason-other', 'sport-sister-listing', 'sport-season-says', 'sport-offseason-events', 'sport-bay-link'], go: ['phone'] },
  // "The course is closed but the golf shop is open weekdays for gift cards. Does that count as being open?"
  { id: 'offseason-shop', all: ['\\b(winter|off season|offseason|hiver|hors saison|course is (closed|shut)|course (closed|shut)|closed for (the )?(season|year|winter)|terrain est ferme|parcours est ferme|ferme pour l hiver|ferme pour la saison)\\b', '\\b(shop|store|office|boutique)\\b', '\\b(open|ouvert|ouverte)\\b'],
    fit: ['sport-part-season', 'sport-season-says', 'sport-season', 'indoor-seasonal', 'season', 'sport-first-tee', 'sport-sister-listing', 'seasonal-hours', 'sport-last-booking'], go: ['sport-part-season'] },
  // "The golf club itself doesn't have a happy hour. The grill runs its own specials."
  { id: 'no-hh-specials', all: ['\\b(no|dont have|doesnt have|do not have|does not have|without|not have|pas de|n a pas|aucun) (a |an |any |real )?(happy hour|5 a 7|social hour)\\b', '\\b(special|specials|grill|restaurant|deal|deals|own page|its own|speciaux|menu)\\b'],
    // Sport test 11 (« Le club n'a pas de 5 à 7. Par contre, le restaurant 1913 fait des soupers spéciaux »): the "no bar"
    // answer doesn't say where the restaurant's specials go, so it no longer counts as fitting.
    fit: ['sport-hh-none-specials', 'sport-sister-listing', 'dont-have', 'sport-restaurant'], go: ['sport-hh-none-specials'] },
  // "A charity tournament closes the course to the public for a day; the date changes every year."
  { id: 'event-closure', all: ['\\b(tournament|tournaments|tournoi|tournois|championship|championnat|member guest|scramble|amateur|charity|fundraiser|tourney)\\b', '\\b(close|closed|closes|closing|shut|shuts|ferme|fermer|block|bloquer|cant book|can t book|closed to the public|to the public|no public)\\b'],
    not: ['\\b(sign ups?|signups?|registration|registrations|entries|entry|inscriptions?) (close|closes|closed)\\b'],
    fit: ['sport-book-ahead-hours', 'sport-one-off-closure', 'closures', 'setup-short-closure', 'sport-closures-yearly', 'sport-tournaments', 'setup-closures', 'setup-closure-fix', 'closures-count', 'sport-peak-dates'], go: ['sport-one-off-closure', 'closures'] },
  // "Can our head pro get his own access without using my login?"
  { id: 'own-access', all: ['\\b((his|her|their|my|our) own (access|login|log in|account|password|sign in)|own access|own login|own account|separate login|without (using )?my (login|password|account)|shouldnt use my login|share my (login|password)|give (him|her|them) access|propre acces|son propre (acces|compte)|sa propre connexion)\\b'],
    fit: ACCESS_TOPICS, go: ['staff'] },
  { id: 'can-they-log-in', all: ['\\b(can|could|may) (he|she|they|our [a-z]+( [a-z]+)?|my [a-z]+( [a-z]+)?) (also )?(log in|login|sign in|have access|get access|access)\\b|\\b(peut il|peut elle|peuvent ils|peuvent elles|est ce qu il peut|est ce qu elle peut|est ce qu ils peuvent) (aussi )?(avoir (son|sa|leur) (propre )?(acces|compte)|se connecter|acceder)\\b'],
    fit: ACCESS_TOPICS, go: ['staff'] },
  // "Is there any charge to us if golfers book after finding us?"
  { id: 'cost-to-us', all: ['\\b(any charge|charge (to )?us|charge us|charge me|do you charge|will you charge|cost us|costs us|cost (me|anything)|fee to us|fees to us|commission|take a cut|bill us|invoice us|do we (have to )?pay|will we (have to )?pay|have to pay (you|anything|for this)|pay you|pay anything|payer quelque chose|ca coute quelque chose|coute quelque chose|est ce payant|des frais pour nous|ca nous coute|nous coute|nous couter|vous prenez une commission|une commission|faut il payer|devons nous payer|on doit payer|nous facturer|vous facturez)\\b'],
    not: ['\\bhow much do (you|u) charge\\b', '\\bwhat do (you|u) charge (for|visitors|golfers|people)\\b'],
    fit: ['cost', 'indoor-cost', 'sport-terms', 'scam', 'about', 'sport-public'], go: ['indoor-cost', 'cost'] },
  // "Which number do you want here?" (an 18-hole rate in high season and in the shoulder season, a locals' rate)
  { id: 'which-price', all: ['\\b(dollarsign|price|prices|rate|rates|fee|fees|tarif|tarifs|prix|dollars|bucks)\\b', '\\b(which (number|price|rate|one|fee|amount)|what (number|price|rate|amount)|what do (i|we) (put|enter|use|type)|which do (i|we)|lequel|quel (prix|tarif|montant|chiffre)|which should (i|we)|what should (i|we) (put|enter))\\b'],
    fit: PRICE_TOPICS, go: ['indoor-price'] },
  // A question with a price in it ($) is never answered by an hours or season answer.
  { id: 'money-not-hours', all: ['\\bdollarsign\\b'], not: ['\\b(happy hour|5 a 7|twilight|crepuscule|after [0-9]|apres [0-9])\\b'], bad: HOURS_TOPICS },
  // A subject the answer needs: a happy-hour answer needs a drink or happy-hour word in the question, a photo answer a
  // photo word, a log-in answer a log-in word ("kids lessons from age 4" is not a price answer either).
  { id: 'hh-needs-hh', all: ['.'], not: ['\\b(happy|5 a 7|cinq a sept|social|sociale|drink|drinks|deal|deals|pint|pints|beer|beers|wine|cocktail|cocktails|special|specials|apps|appies|bar|biere|bieres|vin|speciaux|alcohol|alcool|licence|license|licensed|liquor|pub|lounge|patio)\\b'],
    bad: ['hh-deals', 'hh-times', 'hh-some-months', 'setup-happy-split', 'sport-social-hour', 'indoor-bar'] },
  { id: 'photo-needs-photo', all: ['.'], not: ['\\b(photo|photos|pic|pics|pix|picture|pictures|image|images|foto|fotos|shot|shots|drone|photographer|photographe|camera|logo|banner|instagram|facebook|upload|uploaded|televers)'],
    bad: ['photo-add', 'photo-small', 'photo-pending', 'photo-main', 'photo-position', 'photo-rights', 'sport-photo-consent', 'photo-order', 'photo-blurry', 'photos-when'] },
  { id: 'consent-needs-people', all: ['\\b(photo|photos|pic|pics|picture|pictures|image|images)'], not: ['\\b(kid|kids|child|children|people|faces|face|students|customers|clients|skaters|swimmers|riders|golfers|players|guests|minors|enfants|gens|visages|eleves|consent|consentement)\\b'],
    bad: ['sport-photo-consent'], go: ['photo-rights'] },
  { id: 'photo-count', all: ['\\bhow many (photos|pics|pictures|images)\\b|\\bcombien de (photos|images)\\b'], fit: ['photo-add', 'photo-order', 'photo-main'], go: ['photo-add'] },
  { id: 'age-not-price', all: ['\\b(age|ages|aged|year old|years old|yr old|yrs old|ans)\\b'], not: ['\\b(dollarsign|price|prices|rate|rates|fee|fees|cost|costs|free|tarif|tarifs|prix|gratuit|dollars|bucks|charge)\\b'],
    bad: ['indoor-price', 'sport-card-price', 'indoor-price-varies', 'sport-golf-details'], go: ['indoor-age'] },
  { id: 'winter-not-weather', all: ['\\b(all winter|for (the )?winter|until spring|snow melts|for the season|tout l hiver|pour l hiver|jusqu au printemps)\\b'], bad: ['sport-weather'], go: ['sport-season'] },
  // Sport test 11 (2026-11-21; Geneviève, 22 questions in French: the fit check never fired): French wording for every
  // intent above, and these.
  // « Créer mon compte… une page blanche qui dit Not found » got the menu-link answer: an error page is never answered
  // by an unrelated topic (Ask us), and an error after making a login is the login answer.
  { id: 'error-login', all: ['\\b(not found|page blanche|blank page|erreur|error|404|n a pas marche|n a pas fonctionne|didn t work|didnt work|doesn t work|doesnt work|ne marche pas|ne fonctionne pas|broken|bug|plante|crash)\\b',
    '\\b(compte|login|log in|account|connexion|connecte|connectee|sign in|signed in|mot de passe|password|creer mon compte|create a login)\\b'],
    fit: ['login-not-found', 'login-create', 'signin', 'forgot', 'login-privacy'], go: ['login-not-found'] },
  { id: 'error-any', all: ['\\b(not found|page blanche|blank page|erreur|error|404|n a pas marche|n a pas fonctionne|didn t work|didnt work|doesn t work|doesnt work|ne marche pas|ne fonctionne pas|broken|bug|plante|crash)\\b'],
    fit: ['login-not-found', 'login-create', 'signin', 'forgot', 'newlink', 'noemail', 'photo-add', 'photo-small', 'photo-pending', 'photo-blurry', 'menu-import', 'menu-website', 'see-page', 'live-speed', 'changes-review'] },
  // « Les golfeurs anglophones vont les voir en anglais? » / « la page anglaise va rester vide? » got the portal's language:
  // a question about her page's words in the other language is the translation answer.
  { id: 'content-language', all: ['\\b(anglais|anglaise|anglaises|anglophones?|english|francais|francaise|french|francophones?|traduire|traduction|traduit|traduisez|translate|translated|translation)\\b',
    '\\b(tarifs?|prix|lignes?|rates?|prices?|lines?|histoire|description|story|page|pages|fiche|golfeurs?|visiteurs?|visitors?|golfers?|gens|people|ecrit|ecrites?|tape|tapes|typed|wrote|written|vide|empty|blank|show up|paraissent|voir)\\b'],
    not: ['\\b(portal|portail|espace entreprises|business portal|interface|ecrans|screens|setup in french|configuration en francais|login page|page de connexion)\\b', '\\b(staff|personnel|moniteurs|instructors|instructeurs|guides|parlent|speak|speaks|bilingue|bilingual|cours en|lessons in|tours in|sorties en)\\b'],
    fit: ['indoor-french', 'fr-desc-old', 'french-lines'], go: ['indoor-french'] },
  // "Our clubhouse books Christmas parties and weddings all winter" got "Nothing to add".
  { id: 'offseason-events', all: ['\\b(events?|part(y|ies)|weddings?|banquets?|catering|christmas|evenements?|fetes?|mariages?|noces|traiteur|receptions?|noel)\\b',
    '\\b(winter|all year|year round|closed|off season|offseason|hiver|toute l annee|ferme|fermee|hors saison)\\b', '\\b(book|books|booking|booked|host|hosts|hosting|rent|rents|available|reserv[a-z]*|accueill[a-z]*|organis[a-z]*|recev[a-z]*|recoit|loue|louer|offr[a-z]*|planning|plan)\\b'],
    not: ['\\b(closed|close|ferme|fermes|fermons) (on |le |for |pour )?(christmas|noel)\\b', '\\b(christmas day|boxing day|jour de noel|holiday|holidays|conge|feries?)\\b'],
    golfCourse: true, fit: ['sport-offseason-events', 'indoor-groups', 'sport-part-season'], go: ['sport-offseason-events'] },
  // « Je veux que les gens sachent… simulateur par téléphone l'hiver, et qu'on a un code vestimentaire »: the dress code
  // answer (both lines go in Good to know).
  { id: 'dress-code', all: ['\\b(dress code|code vestimentaire|tenue vestimentaire|tenue de golf|chemise a col|collared)\\b'],
    fit: ['sport-dress-code', 'indoor-good-to-know', 'sport-what-to-bring'], bad: ['sport-bay-link'], go: ['sport-dress-code'] },
  // Her Trackman simulator, January to March, outside her golf season (« sans mélanger les golfeurs? », « fermé une partie
  // de l'année ou heures différentes l'hiver? », « les gens vont penser qu'on l'offre en plein été? »). Golf courses only:
  // for a simulator business the simulator IS the season.
  { id: 'offseason-other', all: ['\\b(simulat[a-z]*|trackman|indoor|interieur|interieure|dome|virtual|virtuel)\\b', '\\b(winter|hiver|off season|offseason|hors saison|january|janvier|february|fevrier|march|mars|november|novembre|december|decembre|closed|ferme|plein ete)\\b'],
    golfCourse: true, fit: ['sport-offseason-other', 'sport-sister-listing', 'sport-part-season', 'sport-dress-code', 'phone', 'sport-bay-link', 'sport-second-kind', 'indoor-kinds-many', 'indoor-also-offer', 'sport-kinds-other', 'sport-lessons'], go: ['sport-offseason-other'] },
  // "Can I see what our page looks like to a golfer?"
  { id: 'see-page', all: ['\\b(see|view|look at|preview|voir) (what )?(our|my|the) (page|listing|fiche)|what (our|my|the) (page|listing) looks like|what (the public|visitors|golfers|people|customers) see|ce que (le public|les visiteurs) voi|a quoi ressemble (notre|ma) (page|fiche)|voir (notre|ma) (page|fiche) comme|comme (un|une) (golfeur|golfeuse|visiteur|visiteuse|client|cliente) (la )?voit\\b'],
    fit: ['see-page', 'setup-live-when', 'live-speed', 'photos-when', 'photo-pending', 'changes-review', 'indoor-french', 'french', 'sport-season-says', 'shows-closed'], go: ['see-page'] },
  // Sport test 13: the rules above, narrow (they only ever take answers away, never let one through).
  ...FIT13.map((r) => ({ ...r, narrow: true })),
];
// Sport test 13: the answers that change the place's own closures, season, Free entry, per-room or main price; Help gives
// them only on a strong match (server.js best()).
const DANGER = CLOSE_TOPICS.concat(SEASON_TOPICS, ['indoor-free', 'indoor-per-room', 'indoor-price']);
module.exports = { WORDS, word, TOPICS, MORE_KEYS, tokens, kindHelp, fill, CONCEPTS, NOT_IF, FIT, DANGER };
