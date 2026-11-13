'use strict';
// Owner portal: "Your page is X% complete" (2026-11-08), restaurants first.
// Pure module: the score, the missing list and the HTML. server.js gathers the inputs from the database.
// Spec: drafts/portal-completeness-2026-11-08/SPEC-restaurants.md (100 points).
// Rules (Dayton's defaults until he says otherwise):
//   - owners see it in their portal only; nothing public, and it never feeds ranking, sorting or indexing;
//   - hours count as fresh for 30 days (Dayton, Nov 9 2026; was 90) after they were last checked or saved;
//   - "we don't have one" answers (declaredNone) count as done, once a screen to give them exists;
//   - an item the owner has no way to fix yet (fix: false) counts when we already have it, and when we don't it
//     is left out of the total and shown under "We're adding these", so 100% is reachable today.

const { frSpacing } = require('./owner-setup-text.js');
const HOURS_FRESH_DAYS = 30;
const DESCRIPTION_MIN = 120;
const PHOTOS_MIN = 3;

// key, group, weight, can the owner fix it in the portal today, where the button goes, fields that can be waiting for review.
// target: { task, id } scrolls inside the edit page; { href: 'menu' } opens the menu page.
const ITEMS = [
  { key: 'address_pin', group: 'basics', w: 4, fix: true, target: { task: 'contact', id: 'opAddress' }, fields: ['address'],
    en: 'Street address and map pin', fr: 'Adresse et position sur la carte', whyEn: 'So people can find you and the map pin lands on your door.', whyFr: 'Pour que les gens vous trouvent et que l’épingle soit devant votre porte.', btnEn: 'Add address', btnFr: 'Ajouter l’adresse', icon: '📍' },
  { key: 'phone', group: 'basics', w: 4, fix: true, target: { task: 'contact', id: 'opPhone' }, fields: ['phone'],
    en: 'Phone number', fr: 'Numéro de téléphone', whyEn: 'The number guests call to book or ask a question.', whyFr: 'Le numéro que les clients appellent pour réserver ou poser une question.', btnEn: 'Add phone', btnFr: 'Ajouter', icon: '📞' },
  { key: 'website', noneEn: 'We don’t have a website', noneFr: 'Nous n’avons pas de site Web', group: 'basics', w: 4, fix: true, target: { task: 'contact', id: 'opWebsite' }, fields: ['website'],
    en: 'Website', fr: 'Site Web', whyEn: 'Paste your website address.', whyFr: 'Collez l’adresse de votre site Web.', btnEn: 'Add website', btnFr: 'Ajouter', icon: '🌐' },
  { key: 'cuisine', group: 'basics', w: 4, fix: true, target: { task: 'more', id: 'cuisine' }, fields: ['cuisine', 'cuisines'],
    en: 'What you serve (cuisine)', fr: 'Ce que vous servez (cuisine)', whyEn: 'Italian, Japanese, pub fare and so on. Pick up to 3.', whyFr: 'Italienne, japonaise, cuisine de pub, etc. Choisissez-en jusqu’à 3.', btnEn: 'Pick cuisine', btnFr: 'Choisir', icon: '🍽️' },
  { key: 'hours', group: 'hours', w: 8, fix: true, target: { task: 'hours', id: 'hours' }, fields: ['hours'],
    en: 'Weekly opening hours', fr: 'Heures d’ouverture', whyEn: 'The times you’re open each day.', whyFr: 'Vos heures d’ouverture chaque jour.', btnEn: 'Add your hours', btnFr: 'Ajouter vos heures', icon: '🕑' },
  { key: 'hours_fresh', group: 'hours', w: 4, fix: true, target: { task: 'hours', id: 'opHoursOk' }, fields: ['hours', 'hours_checked'],
    en: 'Are your hours still right?', fr: 'Vos heures sont-elles toujours exactes?', whyEn: 'If nothing has changed, one tap is enough.', whyFr: 'Si rien n’a changé, un seul toucher suffit.', btnEn: 'Check them', btnFr: 'Vérifier', icon: '🔄' },
  { key: 'photo_main', group: 'photos', w: 8, fix: true, target: { task: 'photos', id: 'photos' }, fields: [],
    en: 'A real photo of your place', fr: 'Une vraie photo de votre établissement', whyEn: 'Real photos only, taken by you. Never a stand-in.', whyFr: 'De vraies photos seulement, prises par vous.', btnEn: 'Add photos', btnFr: 'Ajouter des photos', icon: '📷' },
  { key: 'photo_extra', group: 'photos', w: 6, fix: true, target: { task: 'photos', id: 'photos' }, fields: [],
    en: 'At least 3 photos', fr: 'Au moins 3 photos', whyEn: 'Food, your room, your patio.', whyFr: 'Plats, salle, terrasse.', btnEn: 'Add photos', btnFr: 'Ajouter des photos', icon: '📷' },
  { key: 'avg_spend', group: 'menu', w: 4, fix: true, target: { task: 'more', id: 'opAvg' }, fields: ['avg_spend'],
    en: 'Average spend per person', fr: 'Dépense moyenne par personne', whyEn: 'One main and a soft drink, before tax and tip, in dollars.', whyFr: 'Un plat principal et une boisson sans alcool, avant taxes et pourboire, en dollars.', btnEn: 'Enter amount', btnFr: 'Indiquer', icon: '💵' },
  { key: 'menu', group: 'menu', w: 8, fix: true, target: { href: 'menu' }, fields: ['menu_url'],
    en: 'Link to your menu, or snap a photo of it', fr: 'Lien vers votre menu, ou une photo de celui-ci', whyEn: 'Guests want to see the dishes and prices. A “Menu” line in Plan your visit doesn’t count as the menu.', whyFr: 'Les clients veulent voir les plats et les prix. Une ligne « Menu » dans Planifier la visite ne compte pas comme le menu.', btnEn: 'Add menu', btnFr: 'Ajouter le menu', icon: '📖' },
  { key: 'dietary', noneEn: 'No vegan, veggie or gluten-free options', noneFr: 'Pas d’options végé ou sans gluten', group: 'menu', w: 6, fix: true, target: { task: 'more', id: 'badges' }, fields: ['badge:vegan', 'badge:vegetarian', 'badge:gluten_free'],
    en: 'Dietary options', fr: 'Options alimentaires', whyEn: 'Tick vegan, vegetarian or gluten-free if you offer them. A dietary note in Plan your visit counts too.', whyFr: 'Cochez végétalien, végétarien ou sans gluten si vous en offrez. Une note alimentaire dans Planifier la visite compte aussi.', btnEn: 'Tick options', btnFr: 'Cocher', icon: '🥗' },
  { key: 'happy_hour', noneEn: 'We don’t have a happy hour', noneFr: 'Nous n’avons pas de happy hour', group: 'offers', w: 4, fix: true, target: { task: 'happy', id: 'happy' }, fields: ['happy_hour', 'happy_hour_deals'],
    en: 'Happy hour times and deals', fr: 'Heures et spéciaux du 5 à 7', whyEn: 'When it runs and what’s on special.', whyFr: 'Quand il a lieu et ce qui est en spécial.', btnEn: 'Add happy hour', btnFr: 'Ajouter', icon: '🍹' },
  { key: 'specials', noneEn: 'We don’t run specials', noneFr: 'Nous n’avons pas de spéciaux', group: 'offers', w: 3, fix: true, target: { task: 'more', id: 'specials' }, fields: ['specials'],
    en: 'Weekly specials', fr: 'Spéciaux de la semaine', whyEn: 'Nightly deals or a weekly feature.', whyFr: 'Spéciaux du soir ou de la semaine.', btnEn: 'Add specials', btnFr: 'Ajouter', icon: '⭐' },
  { key: 'entertainment', noneEn: 'We don’t host music or events', noneFr: 'Ni musique ni événements chez nous', group: 'offers', w: 3, fix: true, target: { task: 'more', id: 'weekly-nights' }, fields: ['weekly_nights', 'badge:live_music', 'badge:sports_tv'],
    en: 'Live music or events', fr: 'Musique en direct ou événements', whyEn: 'Trivia night, live music, sports on the TV.', whyFr: 'Soirée-questionnaire, musique en direct, sports à la télé.', btnEn: 'Add a night', btnFr: 'Ajouter', icon: '🎶' },
  // "Plan your visit" lines (2026-11-08): the owner writes them in the "Plan your visit" section of the edit page.
  { key: 'pyv_known', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitKnown' }, fields: ['visit_rows'],
    en: 'Known for', fr: 'Connu pour', whyEn: 'One line on what people come back for.', whyFr: 'Une ligne sur ce pour quoi les gens reviennent.', btnEn: 'Write it', btnFr: 'Écrire', icon: '👍' },
  { key: 'pyv_reservations', noneEn: 'We don’t take reservations', noneFr: 'Nous ne prenons pas de réservations', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitReservations' }, fields: ['visit_rows', 'booking_url'],
    en: 'Reservations', fr: 'Réservations', whyEn: 'How to book, or walk-ins only.', whyFr: 'Comment réserver, ou sans réservation seulement.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '📅' },
  { key: 'pyv_takeout', noneEn: 'No takeout or delivery', noneFr: 'Ni plats à emporter ni livraison', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitTakeout' }, fields: ['visit_rows'],
    en: 'Takeout and delivery', fr: 'À emporter et livraison', whyEn: 'Order to go? Which delivery apps?', whyFr: 'Pour emporter? Quelles applis de livraison?', btnEn: 'Add it', btnFr: 'Ajouter', icon: '🥡' },
  // The "Dietary" line of Plan your visit is no longer its own item (live check 2026-11-08: owners were asked about
  // dietary twice). It still counts toward "Dietary options" above, and its box stays optional in Plan your visit.
  { key: 'pyv_groups', noneEn: 'We can’t take big groups', noneFr: 'Nous n’accueillons pas de grands groupes', group: 'visit', w: 3, fix: true, target: { task: 'more', id: 'opVisitGroups' }, fields: ['visit_rows'],
    en: 'Groups and good to know', fr: 'Groupes et bon à savoir', whyEn: 'Large parties, parking, kids, anything that helps.', whyFr: 'Grands groupes, stationnement, enfants, tout ce qui aide.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '👥' },
  { key: 'description', group: 'about', w: 6, fix: true, target: { task: 'contact', id: 'opDescription' }, fields: ['description'],
    en: 'A description (120+ characters)', fr: 'Une description (120 caractères ou plus)', whyEn: 'A few sentences about your place, in your words.', whyFr: 'Quelques phrases sur votre établissement, dans vos mots.', btnEn: 'Write it', btnFr: 'Écrire', icon: '✍️' },
  { key: 'instagram', noneEn: 'We’re not on Instagram', noneFr: 'Nous ne sommes pas sur Instagram', group: 'social', w: 3, fix: true, target: { task: 'contact', id: 'opInstagram' }, fields: ['instagram_url'],
    en: 'Instagram link', fr: 'Lien Instagram', whyEn: 'Paste your @name or the link to your profile.', whyFr: 'Collez votre @nom ou le lien de votre profil.', btnEn: 'Add Instagram', btnFr: 'Ajouter', icon: '📸' },
  { key: 'facebook', noneEn: 'We’re not on Facebook', noneFr: 'Nous ne sommes pas sur Facebook', group: 'social', w: 3, fix: true, target: { task: 'contact', id: 'opFacebook' }, fields: ['facebook_url'],
    en: 'Facebook link', fr: 'Lien Facebook', whyEn: 'Your Facebook page, if you have one.', whyFr: 'Votre page Facebook, si vous en avez une.', btnEn: 'Add Facebook', btnFr: 'Ajouter', icon: '👍' },
  { key: 'arrival', group: 'finding', w: 3, fix: true, target: { task: 'arrival', id: '' }, fields: [],
    en: 'Storefront photo and exact spot', fr: 'Photo de la devanture et emplacement exact', whyEn: 'Stand at your front door and take one photo. It helps people find you.', whyFr: 'Placez-vous devant la porte et prenez une photo. Cela aide les gens à vous trouver.', btnEn: 'At the door', btnFr: 'À la porte', icon: '📍' },
  { key: 'owner_confirmed', group: 'confirmed', w: 3, fix: false,
    en: 'Confirmed by you', fr: 'Confirmée par vous', whyEn: 'Saving a change to your page adds the Verified mark. A one-tap “my page is right” button is coming.', whyFr: 'Enregistrer une modification ajoute la mention Vérifiée. Un bouton « ma fiche est exacte » s’en vient.', icon: '✅' },
];
if (ITEMS.reduce((a, i) => a + i.w, 0) !== 100) throw new Error('portal-completeness: weights must sum to 100');

// Pubs (Dayton, Nov 10 2026; drafts/pub-portal-2026-11-10/SPEC-pubs.md): the same engine with their own 100 points.
// Restaurant items are reused by key with pub weights and groups; four items are new and owner-only (never researched):
// kitchen hours, sports detail, games and who's welcome. Booking and takeout aren't scored for pubs.
const R = (key, over) => ({ ...ITEMS.find((i) => i.key === key), ...over });
const PUB_ITEMS = [
  R('address_pin', { w: 4 }),
  R('phone', { w: 4 }),
  R('website', { w: 3 }),
  R('cuisine', { w: 3, noneEn: 'We don’t serve food', noneFr: 'Nous ne servons pas de nourriture', target: { setup: 'cuisine' },
    en: 'Your food', fr: 'Votre nourriture', whyEn: 'Pub fare, burgers, wings and so on. Pick up to 3.', whyFr: 'Cuisine de pub, burgers, ailes, etc. Choisissez-en jusqu’à 3.' }),
  R('hours', { w: 7 }),
  R('hours_fresh', { w: 4 }),
  { key: 'kitchen', group: 'hours', w: 3, fix: true, target: { setup: 'hours:kitchen' }, fields: ['pub_info'],
    en: 'Kitchen hours', fr: 'Heures de la cuisine', whyEn: 'Does the kitchen close before the bar? Guests check before they come to eat.', whyFr: 'La cuisine ferme-t-elle avant le bar? Les clients vérifient avant de venir manger.', btnEn: 'Answer', btnFr: 'Répondre', icon: '🍳' },
  R('photo_main', { w: 8, whyEn: 'Real photos only, taken by you. Your room, the bar, the patio.', whyFr: 'De vraies photos seulement, prises par vous. La salle, le bar, la terrasse.' }),
  R('photo_extra', { w: 6, whyEn: 'Your room, the bar, the patio, the food.', whyFr: 'La salle, le bar, la terrasse, les plats.' }),
  R('menu', { group: 'food', w: 7 }),
  R('happy_hour', { group: 'food', w: 6 }),
  R('avg_spend', { group: 'food', w: 2 }),
  R('dietary', { group: 'food', w: 2, noneEn: 'None of these', noneFr: 'Aucune de ces options' }),
  R('entertainment', { group: 'whatson', w: 5, fields: ['weekly_nights', 'badge:live_music'], noneEn: 'We don’t host events', noneFr: 'Nous n’organisons pas d’événements',
    en: 'Weekly events', fr: 'Événements de la semaine', whyEn: 'Trivia, live music, karaoke: what’s on each week.', whyFr: 'Questionnaire, musique en direct, karaoké : ce qui se passe chaque semaine.' }),
  { key: 'sports', group: 'whatson', w: 4, fix: true, target: { setup: 'offer:sports' }, fields: ['pub_info', 'badge:sports_tv'], noneEn: 'We don’t show sports', noneFr: 'Nous ne diffusons pas de sports',
    en: 'Sports on TV', fr: 'Sports à la télé', whyEn: 'Which sports you show, and how many TVs.', whyFr: 'Quels sports vous diffusez, et combien de téléviseurs.', btnEn: 'Pick sports', btnFr: 'Choisir', icon: '📺' },
  R('specials', { group: 'whatson', w: 3 }),
  { key: 'games', group: 'whatson', w: 2, fix: true, target: { setup: 'offer' }, fields: ['owner_features'], noneEn: 'No games', noneFr: 'Pas de jeux',
    en: 'Games', fr: 'Jeux', whyEn: 'Pool, darts, shuffleboard, arcade or board games.', whyFr: 'Billard, fléchettes, jeu de palets, jeux d’arcade ou de société.', btnEn: 'Tick games', btnFr: 'Cocher', icon: '🎯' },
  { key: 'minors', group: 'yourvisit', w: 4, fix: true, target: { setup: 'offer:minors' }, fields: ['pub_info'],
    en: 'Who’s welcome?', fr: 'Qui est le bienvenu?', whyEn: 'Adults only, minors with an adult until a set time, or all ages. Families check this before they come.', whyFr: 'Adultes seulement, mineurs accompagnés jusqu’à une heure donnée, ou tous les âges. Les familles vérifient avant de venir.', btnEn: 'Answer', btnFr: 'Répondre', icon: '👪' },
  R('pyv_groups', { group: 'yourvisit', w: 3, en: 'Groups', fr: 'Groupes', whyEn: 'Can you take groups of 10 or more? Birthdays, work parties, team nights.', whyFr: 'Pouvez-vous accueillir des groupes de 10 ou plus? Anniversaires, fêtes de bureau, soirées d’équipe.' }),
  R('pyv_known', { group: 'yourvisit', w: 3 }),
  R('description', { w: 5 }),
  R('instagram', { w: 3 }),
  R('facebook', { w: 3 }),
  R('arrival', { w: 3 }),
  R('owner_confirmed', { w: 3 }),
];
if (PUB_ITEMS.reduce((a, i) => a + i.w, 0) !== 100) throw new Error('portal-completeness: pub weights must sum to 100');
// Cafés (Dayton, Nov 10 2026; drafts/cafe-portal-2026-11-10/SPEC-cafes.md, "Decided"): the same engine with their own
// 100 points. Seven items are new: what kind of café, all year or seasonal, what you serve, staying a while (seats and
// laptops), Wi-Fi, dogs and kids, and ordering. Wi-Fi, laptops and ordering are owner-only (never researched). Happy
// hour, events and specials are optional and unscored, so a café that has none can still reach 100%.
// 13 screens (Dayton, 2026-11-11): staying a while, ordering and "Known for" are no longer asked of cafés, so they no
// longer count (their 13 points went to the description, menu, what you serve, dietary, Wi-Fi, dogs and kids and photos).
// What a café answered before stays stored and on its page; "Order at the counter only" stays a valid answer.
const CAFE_KINDS = ['Coffee shop', 'Bakery', 'Bakery café', 'Roastery', 'Tea house', 'Bubble tea', 'Ice cream & gelato', 'Dessert & sweets', 'Brunch café', 'Juice & smoothie bar', 'Deli & sandwiches'];
// Café test 2 (2026-11-11): sorbet, milkshakes, cones & cups, affogato and a general "Made here" (beside "Baked fresh
// here", kept for bakeries). Additive: stored lists read as before.
const CAFE_SERVES = ['espresso', 'drip', 'tea', 'baked_here', 'made_here', 'pastries', 'breakfast', 'lunch', 'ice_cream', 'sorbet', 'milkshakes', 'cones', 'affogato', 'desserts', 'bubble_tea', 'smoothies', 'beer_wine'];
const CAFE_LAPTOPS = ['all_day', 'not_busy', 'none'];
const CAFE_SEATS = ['takeout', 'few', 'lots'];
const CAFE_ORDER_FEATURES = ['drive_thru', 'walk_up'];
const CAFE_ITEMS = [
  R('address_pin', { w: 4 }),
  R('phone', { w: 4, whyEn: 'The number guests call with a question or a cake order.', whyFr: 'Le numéro que les clients appellent pour une question ou une commande de gâteau.' }),
  R('website', { w: 3 }),
  { key: 'cafe_kind', group: 'basics', w: 3, fix: true, target: { setup: 'cuisine' }, fields: ['place_type'],
    en: 'What kind of café', fr: 'Quel genre de café', whyEn: 'Coffee shop, bakery, gelato, bubble tea and so on. Pick one.', whyFr: 'Café, boulangerie, gelato, thé aux perles, etc. Choisissez-en un.', btnEn: 'Pick one', btnFr: 'Choisir', icon: '☕' },
  R('hours', { w: 8 }),
  R('hours_fresh', { w: 4 }),
  { key: 'season', group: 'hours', w: 3, fix: true, target: { setup: 'hours:year' }, fields: ['open_months', 'hours_seasons', 'cafe_info'],
    en: 'Open all year, or seasonal?', fr: 'Ouvert toute l’année, ou en saison?', whyEn: 'Ice cream and patio cafés often close for winter. Say so, so nobody drives out to a closed door.', whyFr: 'Les bars laitiers et les cafés-terrasses ferment souvent l’hiver. Dites-le, pour que personne ne trouve porte close.', btnEn: 'Answer', btnFr: 'Répondre', icon: '📆' },
  R('photo_main', { w: 9, whyEn: 'Real photos only, taken by you. Your counter, your coffee, your baking.', whyFr: 'De vraies photos seulement, prises par vous. Votre comptoir, votre café, vos pâtisseries.' }),
  R('photo_extra', { w: 8, whyEn: 'Your counter, your coffee, your baking, your seats.', whyFr: 'Votre comptoir, votre café, vos pâtisseries, vos places assises.' }),
  { key: 'serves', group: 'serve', w: 8, fix: true, target: { setup: 'cuisine:serve' }, fields: ['cafe_info'],
    en: 'What you serve', fr: 'Ce que vous servez', whyEn: 'Espresso, pastries baked here, lunch, gelato, bubble tea: tick all that apply.', whyFr: 'Espresso, pâtisseries maison, dîner, gelato, thé aux perles : cochez tout ce qui s’applique.', btnEn: 'Tick them', btnFr: 'Cocher', icon: '🥐' },
  R('menu', { group: 'serve', w: 8 }),
  R('avg_spend', { group: 'serve', w: 4, en: 'Price per person', fr: 'Prix par personne', whyEn: 'About how much is a coffee and a pastry? Cents are fine, like $5.50.', whyFr: 'Combien coûtent environ un café et une pâtisserie? Les cents sont acceptés, par exemple 5,50 $.' }),
  R('dietary', { group: 'serve', w: 6, noneEn: 'None of these', noneFr: 'Aucune de ces options', whyEn: 'Vegan, vegetarian, gluten-free or dairy-free milks. Tick what you offer.', whyFr: 'Options véganes, végétariennes, sans gluten ou laits végétaux. Cochez ce que vous offrez.' }),
  { key: 'wifi', group: 'yourvisit', w: 4, fix: true, target: { setup: 'offer' }, fields: ['owner_features'], noneEn: 'We don’t have Wi-Fi', noneFr: 'Nous n’avons pas de Wi-Fi',
    en: 'Wi-Fi', fr: 'Wi-Fi', whyEn: 'Visitors look for it on the map.', whyFr: 'Les visiteurs le cherchent sur la carte.', btnEn: 'Answer', btnFr: 'Répondre', icon: '📶' },
  { key: 'dogs_kids', group: 'yourvisit', w: 6, fix: true, target: { setup: 'offer' }, fields: ['badges', 'owner_features'],
    en: 'Dogs and kids', fr: 'Chiens et enfants', whyEn: 'Dogs welcome, dog treats, kids welcome, stroller space, or no dogs allowed.', whyFr: 'Chiens bienvenus, gâteries pour chiens, enfants bienvenus, place pour poussettes, ou chiens non admis.', btnEn: 'Tick them', btnFr: 'Cocher', icon: '🐕' },
  R('description', { w: 8 }),
  R('instagram', { w: 3 }),
  R('facebook', { w: 3 }),
  R('arrival', { w: 2 }),
  R('owner_confirmed', { w: 2 }),
];
if (CAFE_ITEMS.reduce((a, i) => a + i.w, 0) !== 100) throw new Error('portal-completeness: café weights must sum to 100');
// Wineries (Dayton, Nov 12 2026; drafts/winery-portal-2026-11-12/SPEC-wineries.md, "Decided"): the same engine with
// their own 100 points. New items: the kind of winery, the off-season answer, the tasting price (or Free), how people
// visit, a booking link (or walk-ins only), groups, food here and wheelchair / parking. Happy hour, specials and events are
// not asked of wineries, so every winery can reach 100%. Experiences and the wine list are optional and unscored.
const WINERY_KINDS = ['Estate winery', 'Boutique winery', 'Tasting room in town', 'Fruit or honey wines', 'Winery and cidery'];
const WINERY_FOOD = ['none', 'snacks', 'picnic', 'restaurant'];
const WINERY_VISIT = ['walk_in', 'recommended', 'needed', 'appointment'];
const WINERY_YEAR = ['all', 'seasonal', 'appointment'];
const WINERY_ITEMS = [
  R('address_pin', { w: 4 }),
  R('phone', { w: 4, whyEn: 'The number visitors call to book a tasting or ask a question.', whyFr: 'Le numéro que les visiteurs appellent pour réserver une dégustation ou poser une question.' }),
  R('website', { w: 3 }),
  { key: 'winery_kind', group: 'basics', w: 3, fix: true, target: { setup: 'winery' }, fields: ['place_type'],
    en: 'What kind of winery', fr: 'Quel genre de vignoble', whyEn: 'Estate, small family winery, tasting room in town and so on. Pick one.', whyFr: 'Domaine, petit vignoble familial, salle de dégustation en ville, etc. Choisissez-en un.', btnEn: 'Pick one', btnFr: 'Choisir', icon: '🍇' },
  R('hours', { w: 8 }),
  R('hours_fresh', { w: 4 }),
  { key: 'season', group: 'hours', w: 5, fix: true, target: { setup: 'hours:year' }, fields: ['open_months', 'hours_seasons', 'winery_info'],
    en: 'The off-season', fr: 'La basse saison', whyEn: 'Open all year, closed part of the year, or by appointment in the off-season? Say so, so nobody drives out to a closed door.', whyFr: 'Ouvert toute l’année, fermé une partie de l’année, ou sur rendez-vous en basse saison? Dites-le, pour que personne ne trouve porte close.', btnEn: 'Answer', btnFr: 'Répondre', icon: '📆' },
  R('photo_main', { w: 9, whyEn: 'Real photos only, taken by you. Your tasting room, your view, the vines.', whyFr: 'De vraies photos seulement, prises par vous. Votre salle de dégustation, votre vue, les vignes.' }),
  R('photo_extra', { w: 7, whyEn: 'Your tasting room, your view, the vines, the patio.', whyFr: 'Votre salle de dégustation, votre vue, les vignes, la terrasse.' }),
  { key: 'tasting_price', group: 'tastings', w: 8, fix: true, target: { setup: 'tastings' }, fields: ['tasting_fee'],
    en: 'Tasting price', fr: 'Prix de la dégustation', whyEn: 'What a tasting costs a person, or Free. It shows on your card.', whyFr: 'Le prix d’une dégustation par personne, ou Gratuite. Il paraît sur votre fiche.', btnEn: 'Answer', btnFr: 'Répondre', icon: '🍷' },
  { key: 'visit_how', group: 'tastings', w: 8, fix: true, target: { setup: 'visit' }, fields: ['winery_info'],
    en: 'How people visit', fr: 'Comment on vous visite', whyEn: 'Walk-ins welcome, booking recommended, booking needed, or by appointment only.', whyFr: 'Sans réservation, réservation conseillée, réservation obligatoire, ou sur rendez-vous seulement.', btnEn: 'Answer', btnFr: 'Répondre', icon: '🚪' },
  { key: 'booking_link', noneEn: 'We don’t take bookings online', noneFr: 'Nous ne prenons pas de réservations en ligne', group: 'tastings', w: 4, fix: true, target: { setup: 'visit' }, fields: ['booking_url'],
    en: 'Booking link', fr: 'Lien de réservation', whyEn: 'The page where people book a tasting. Not needed for walk-ins only.', whyFr: 'La page où l’on réserve une dégustation. Inutile si c’est sans réservation seulement.', btnEn: 'Add it', btnFr: 'Ajouter', icon: '📅' },
  { key: 'winery_groups', group: 'tastings', w: 4, fix: true, target: { setup: 'visit' }, fields: ['winery_info'],
    en: 'Groups', fr: 'Groupes', whyEn: 'From what size should groups book ahead? Tour buses and limos?', whyFr: 'À partir de quelle taille les groupes doivent-ils réserver? Autobus et limousines?', btnEn: 'Answer', btnFr: 'Répondre', icon: '👥' },
  { key: 'food_here', group: 'yourvisit', w: 4, fix: true, target: { setup: 'winery' }, fields: ['winery_info'],
    en: 'Food here', fr: 'Nourriture sur place', whyEn: 'None, snacks or a cheese plate, a picnic area, or a restaurant.', whyFr: 'Rien, des collations ou un plateau de fromages, une aire de pique-nique, ou un restaurant.', btnEn: 'Answer', btnFr: 'Répondre', icon: '🧀' },
  { key: 'dogs_kids', group: 'yourvisit', w: 4, fix: true, target: { setup: 'offer' }, fields: ['badges', 'owner_features'],
    en: 'Dogs and kids', fr: 'Chiens et enfants', whyEn: 'Dogs welcome, kids welcome, or no dogs allowed.', whyFr: 'Chiens bienvenus, enfants bienvenus, ou chiens non admis.', btnEn: 'Tick them', btnFr: 'Cocher', icon: '🐕' },
  { key: 'access', group: 'yourvisit', w: 3, fix: true, target: { setup: 'offer' }, fields: ['owner_features'],
    en: 'Wheelchair access and parking', fr: 'Accès en fauteuil roulant et stationnement', whyEn: 'Tick Wheelchair accessible, Free parking or Room for RVs on “What you offer”.', whyFr: 'Cochez Accessible en fauteuil roulant, Stationnement gratuit ou Place pour VR dans « Ce que vous offrez ».', btnEn: 'Tick them', btnFr: 'Cocher', icon: '♿' },
  R('description', { w: 5 }),
  R('pyv_known', { group: 'about', w: 3, target: { setup: 'story' }, whyEn: 'One line on your wines, e.g. Pinot Noir and Chardonnay from estate vines.', whyFr: 'Une ligne sur vos vins, p. ex. pinot noir et chardonnay de nos vignes.' }),
  R('instagram', { w: 3 }),
  R('facebook', { w: 3 }),
  R('arrival', { w: 2, en: 'Tasting room photo and exact spot', fr: 'Photo de la salle de dégustation et emplacement exact', whyEn: 'Stand at the tasting room door and take one photo. On a big estate it helps people find you.', whyFr: 'Placez-vous à la porte de la salle de dégustation et prenez une photo. Sur un grand domaine, cela aide à vous trouver.' }),
  R('owner_confirmed', { w: 2 }),
];
if (WINERY_ITEMS.reduce((a, i) => a + i.w, 0) !== 100) throw new Error('portal-completeness: winery weights must sum to 100');
// Breweries (Dayton, Nov 12 2026; drafts/brewery-portal-2026-11-12/SPEC-breweries.md, "Decided"): the same engine with
// their own 100 points. New items: the kind of place, the flight price (or "We don't do flights") and the to-go chips.
// Food here, the off-season, happy hour, weekly events, groups, dogs and kids and access reuse the pub, café and winery
// items. The menu counts as done for a brewery without its own kitchen ("You said: no kitchen"), so a food-truck
// taproom can reach 100%. The booking link is unscored. Every "We don't have one" answer counts as done.
const BREWERY_KINDS = ['Brewery', 'Cidery', 'Taphouse or beer hall', 'Distillery'];
const BREWERY_FOOD = ['kitchen', 'trucks', 'snacks', 'none'];
const BREWERY_TO_GO = ['cans', 'bottles', 'growler', 'crowler', 'none'];
const BREWERY_YEAR = ['all', 'seasonal'];
const BREWERY_MINORS = ['adults', 'minors_until', 'all_ages'];
const BREWERY_ITEMS = [
  R('address_pin', { w: 4 }),
  R('phone', { w: 4, whyEn: 'The number visitors call to ask what’s on tap or book a group.', whyFr: 'Le numéro que les visiteurs appellent pour savoir ce qui est en fût ou réserver pour un groupe.' }),
  R('website', { w: 3 }),
  { key: 'brewery_kind', group: 'basics', w: 3, fix: true, target: { setup: 'taproom' }, fields: ['place_type'],
    en: 'What kind of place', fr: 'Quel genre d’endroit', whyEn: 'Brewery, cidery, taphouse or distillery. Pick one.', whyFr: 'Microbrasserie, cidrerie, bar à bières ou distillerie. Choisissez-en un.', btnEn: 'Pick one', btnFr: 'Choisir', icon: '🍺' },
  R('hours', { w: 8 }),
  R('hours_fresh', { w: 4 }),
  { key: 'season', group: 'hours', w: 4, fix: true, target: { setup: 'hours:year' }, fields: ['open_months', 'hours_seasons', 'brewery_info'],
    en: 'Open all year, or seasonal?', fr: 'Ouvert toute l’année, ou en saison?', whyEn: 'Some taprooms close or cut their hours in winter. Say so, so nobody drives out to a closed door.', whyFr: 'Certaines salles ferment ou réduisent leurs heures l’hiver. Dites-le, pour que personne ne trouve porte close.', btnEn: 'Answer', btnFr: 'Répondre', icon: '📆',
    whyEnCidery: 'Orchard cideries often close for winter. Say so, so nobody drives out to a closed door.', whyFrCidery: 'Les cidreries de verger ferment souvent l’hiver. Dites-le, pour que personne ne trouve porte close.' },
  // Brewery test 3 (2026-11-13): a cidery reads cider words (`cidery`), a distillery or a place with no kind picked yet
  // neutral ones (`neutral`); a brewery or taphouse keeps the beer words (scoreCompleteness, kindCopy).
  R('photo_main', { w: 9, whyEn: 'Real photos only, taken by you. Your taproom, your taps, your patio.', whyFr: 'De vraies photos seulement, prises par vous. Votre salle de dégustation, vos fûts, votre terrasse.',
    cidery: { whyEn: 'Real photos only, taken by you. Your orchard, your tasting room, your patio.', whyFr: 'De vraies photos seulement, prises par vous. Votre verger, votre salle de dégustation, votre terrasse.' },
    neutral: { whyEn: 'Real photos only, taken by you. Your tasting room, your bar, your patio.', whyFr: 'De vraies photos seulement, prises par vous. Votre salle de dégustation, votre bar, votre terrasse.' } }),
  R('photo_extra', { w: 7, whyEn: 'Your taproom, your taps, your patio.', whyFr: 'Votre salle de dégustation, vos fûts, votre terrasse.',
    cidery: { whyEn: 'Your orchard, your tasting room, your patio.', whyFr: 'Votre verger, votre salle de dégustation, votre terrasse.' },
    neutral: { whyEn: 'Your tasting room, your bar, your patio.', whyFr: 'Votre salle de dégustation, votre bar, votre terrasse.' } }),
  { key: 'food_here', group: 'taproom', w: 5, fix: true, target: { setup: 'taproom' }, fields: ['brewery_info'],
    en: 'Food here', fr: 'Nourriture sur place', whyEn: 'Your own kitchen, food trucks, snacks only, or no food. Can people bring their own?', whyFr: 'Votre cuisine, des camions de bouffe de rue, des collations seulement, ou rien. Peut-on apporter sa nourriture?', btnEn: 'Answer', btnFr: 'Répondre', icon: '🍔' },
  { key: 'flight_price', group: 'taproom', w: 5, fix: true, target: { setup: 'flights' }, fields: ['flight_fee', 'brewery_info'],
    en: 'Flight price', fr: 'Prix de la planche de dégustation', whyEn: 'What a flight costs, or “We don’t do flights”. It shows on your card.', whyFr: 'Le prix d’une planche de dégustation, ou « Nous n’en offrons pas ». Il paraît sur votre fiche.', btnEn: 'Answer', btnFr: 'Répondre', icon: '🍻' },
  { key: 'to_go', group: 'taproom', w: 3, fix: true, target: { setup: 'flights' }, fields: ['brewery_info'],
    en: 'What people can take home', fr: 'Ce qu’on peut rapporter', whyEn: 'Cans, bottles, growler or crowler fills, or nothing to go.', whyFr: 'Canettes, bouteilles, remplissage de growlers ou de crowlers, ou rien à emporter.', btnEn: 'Tick them', btnFr: 'Cocher', icon: '🥫' },
  R('happy_hour', { group: 'taproom', w: 4 }),
  R('menu', { group: 'taproom', w: 4, en: 'Menu or tap list', fr: 'Menu ou liste des bières', whyEn: 'Your menu or tap list. A photo of the chalkboard is fine. Not needed without your own kitchen.', whyFr: 'Votre menu ou votre liste des bières. Une photo du tableau suffit. Inutile sans cuisine sur place.',
    cidery: { en: 'Menu or cider list', fr: 'Menu ou liste des cidres', whyEn: 'Your menu or cider list. A photo of the chalkboard is fine. Not needed without your own kitchen.', whyFr: 'Votre menu ou votre liste des cidres. Une photo du tableau suffit. Inutile sans cuisine sur place.' },
    neutral: { en: 'Menu or drinks list', fr: 'Menu ou liste des boissons', whyEn: 'Your menu or drinks list. A photo of the chalkboard is fine. Not needed without your own kitchen.', whyFr: 'Votre menu ou votre liste des boissons. Une photo du tableau suffit. Inutile sans cuisine sur place.' } }),
  { key: 'dogs_kids', group: 'yourvisit', w: 6, fix: true, target: { setup: 'offer:minors' }, fields: ['brewery_info', 'badges', 'owner_features'],
    en: 'Who’s welcome, and dogs', fr: 'Qui est le bienvenu, et les chiens', whyEn: 'Adults only, minors with an adult until a set time, or all ages. And are dogs welcome?', whyFr: 'Adultes seulement, mineurs accompagnés jusqu’à une heure donnée, ou tous les âges. Et les chiens sont-ils bienvenus?', btnEn: 'Answer', btnFr: 'Répondre', icon: '👪' },
  R('entertainment', { group: 'yourvisit', w: 3, fields: ['weekly_nights', 'badge:live_music'], noneEn: 'We don’t host events', noneFr: 'Nous n’organisons pas d’événements',
    en: 'Weekly events', fr: 'Événements de la semaine', whyEn: 'Trivia, live music, bingo, run club: what’s on each week.', whyFr: 'Quiz, musique en direct, bingo, club de course : ce qui se passe chaque semaine.' }),
  R('pyv_groups', { group: 'yourvisit', w: 3, en: 'Groups', fr: 'Groupes', whyEn: 'From what size should groups book ahead?', whyFr: 'À partir de quelle taille les groupes doivent-ils réserver?', target: { setup: 'groups' } }),
  { key: 'access', group: 'yourvisit', w: 3, fix: true, target: { setup: 'offer' }, fields: ['owner_features'],
    en: 'Wheelchair access and parking', fr: 'Accès en fauteuil roulant et stationnement', whyEn: 'Tick Wheelchair accessible, Free parking or Room for RVs on “What you offer”.', whyFr: 'Cochez Accessible en fauteuil roulant, Stationnement gratuit ou Place pour VR dans « Ce que vous offrez ».', btnEn: 'Tick them', btnFr: 'Cocher', icon: '♿' },
  R('description', { w: 5 }),
  R('pyv_known', { group: 'about', w: 3, target: { setup: 'story' }, whyEn: 'One line on what you pour, e.g. Hazy IPAs and a blackberry sour.', whyFr: 'Une ligne sur ce que vous servez, p. ex. des IPA troubles et une sure aux mûres.',
    cidery: { whyEn: 'One line on what you pour, e.g. Dry ciders from heritage apples.', whyFr: 'Une ligne sur ce que vous servez, p. ex. des cidres secs de pommes anciennes.' },
    neutral: { whyEn: 'One line on what you pour, e.g. Small batches made right here.', whyFr: 'Une ligne sur ce que vous servez, p. ex. de petites cuvées faites sur place.' } }),
  R('instagram', { w: 3 }),
  R('facebook', { w: 3 }),
  // Brewery test 2 (2026-11-13): the orchard lines (here and the season item) only for a cidery, as the setup's door lead.
  R('arrival', { w: 2, en: 'Taproom door photo and exact spot', fr: 'Photo de la porte de la salle de dégustation et emplacement exact', whyEn: 'Stand at the taproom door and take one photo. If your door is around the side or upstairs, it helps people find it.', whyFr: 'Placez-vous à la porte de la salle de dégustation et prenez une photo. Si votre porte est sur le côté ou à l’étage, cela aide à la trouver.',
    whyEnCidery: 'Stand at the taproom door and take one photo. At an orchard or a big lot it helps people find you.', whyFrCidery: 'Placez-vous à la porte de la salle de dégustation et prenez une photo. Dans un verger ou un grand terrain, cela aide à vous trouver.' }),
  R('owner_confirmed', { w: 2 }),
];
if (BREWERY_ITEMS.reduce((a, i) => a + i.w, 0) !== 100) throw new Error('portal-completeness: brewery weights must sum to 100');
const ITEMS_BY_TYPE = { restaurant: ITEMS, pub: PUB_ITEMS, cafe: CAFE_ITEMS, winery: WINERY_ITEMS, brewery: BREWERY_ITEMS };
const itemsFor = (type) => ITEMS_BY_TYPE[type] || ITEMS;
// "We don't have one" (2026-11-08): the items a restaurant may genuinely not offer. Never the core of a page (address,
// phone, hours, photos, menu, average spend, description, storefront spot): those are always worth adding.
// NONE_KEYS stays the restaurant list; noneKeysFor(type) is what a type may answer, ALL_NONE_KEYS every type's together.
// Answers with no checklist item of their own (pub test 4, 2026-11-10): "No dogs allowed" on "What you offer". Stored
// with the others (an explicit answer, kept apart from "not ticked") but never scored and never in the checklist.
const EXTRA_NONE_KEYS = ['dogs'];
// Optional questions a type is asked but doesn't score (café test 1, 2026-11-11: "No" on a café's Weekly events, Groups
// or Weekly specials came back "could not be read", because only scored items were allowed). Their "No" is stored like
// any other (remembered, research doesn't add them back), never scored and never in that type's checklist. Pubs are
// asked about booking and takeout in the setup without scoring them.
// Café test 2 (2026-11-11): "No washroom" is an explicit answer too (never shown on the page).
const OPTIONAL_NONE_KEYS = { cafe: ['happy_hour', 'specials', 'entertainment', 'pyv_groups', 'washroom', 'ordering'], pub: ['pyv_reservations', 'pyv_takeout'] };
const noneKeysFor = (type) => [...new Set(itemsFor(type).filter((i) => i.noneEn).map((i) => i.key).concat(OPTIONAL_NONE_KEYS[type] || [], EXTRA_NONE_KEYS))];
const NONE_KEYS = itemsFor('restaurant').filter((i) => i.noneEn).map((i) => i.key);
// Café test 2 (2026-11-11): with every type's optional answers too ("No washroom" is a café's only one of its own).
const ALL_NONE_KEYS = [...new Set([...ITEMS, ...PUB_ITEMS, ...CAFE_ITEMS, ...WINERY_ITEMS, ...BREWERY_ITEMS].filter((i) => i.noneEn).map((i) => i.key).concat(EXTRA_NONE_KEYS, ...Object.values(OPTIONAL_NONE_KEYS)))];
// In-place confirmation (final fresh-eyes 2026-11-09): the "We don't have…" button turns into "Got it: … ✓ · Undo"
// where it was tapped, so the owner sees it worked without scrolling to "You told us you don't have these".
const GOT_TEXT = {
  website: { en: 'Got it: no website', fr: 'C’est noté : pas de site Web' },
  dietary: { en: 'Got it: no vegan, veggie or gluten-free options', fr: 'C’est noté : pas d’options végé ou sans gluten' },
  happy_hour: { en: 'Got it: no happy hour', fr: 'C’est noté : pas de happy hour' },
  specials: { en: 'Got it: no weekly specials', fr: 'C’est noté : pas de spéciaux' },
  entertainment: { en: 'Got it: no music or events', fr: 'C’est noté : ni musique ni événements' },
  pyv_reservations: { en: 'Got it: no reservations', fr: 'C’est noté : pas de réservations' },
  pyv_takeout: { en: 'Got it: no takeout or delivery', fr: 'C’est noté : ni emporter ni livraison' },
  pyv_groups: { en: 'Got it: no big groups', fr: 'C’est noté : pas de grands groupes' },
  instagram: { en: 'Got it: not on Instagram', fr: 'C’est noté : pas sur Instagram' },
  facebook: { en: 'Got it: not on Facebook', fr: 'C’est noté : pas sur Facebook' },
  cuisine: { en: 'Got it: no food', fr: 'C’est noté : pas de nourriture' },
  sports: { en: 'Got it: no sports on TV', fr: 'C’est noté : pas de sports à la télé' },
  games: { en: 'Got it: no games', fr: 'C’est noté : pas de jeux' },
  dogs: { en: 'Got it: no dogs allowed', fr: 'C’est noté : chiens non admis' },
  wifi: { en: 'Got it: no Wi-Fi', fr: 'C’est noté : pas de Wi-Fi' },
  ordering: { en: 'Got it: order at the counter only', fr: 'C’est noté : commande au comptoir seulement' },
  washroom: { en: 'Got it: no customer washroom', fr: 'C’est noté : pas de toilettes pour les clients' },
  booking_link: { en: 'Got it: no online bookings', fr: 'C’est noté : pas de réservations en ligne' },
};
if (ALL_NONE_KEYS.some((k) => !GOT_TEXT[k])) throw new Error('portal-completeness: every "we don\u2019t have one" item needs its Got it text');
const NONE_MAX = NONE_KEYS.length;
// Happy Hour badge on the page but no times or deals (live check 2026-11-08, 21 restaurants): the item asks for the
// times, and "We don't have a happy hour" is not offered (it would contradict the badge). Still missing, just worded right.
const HAPPY_HOUR_BADGE_COPY = {
  en: 'Add your happy hour times', fr: 'Ajoutez les heures de votre happy hour',
  whyEn: 'Your page shows a Happy Hour badge. Add when it runs and what’s on special.', whyFr: 'Votre fiche affiche un badge Happy hour. Indiquez quand il a lieu et ce qui est en spécial.',
  btnEn: 'Add the times', btnFr: 'Ajouter les heures',
};
// The last steps to 100% for almost every restaurant (live check: 546 of 552 have one photo, and the storefront spot is
// new), named plainly in the panel so owners know where the ceiling comes from.
const CEILING_KEYS = ['photo_main', 'photo_extra', 'arrival'];

// "About X minutes left" (2026-11-08): rough seconds an owner needs on a phone to do each item. Estimates, not measured.
// Free text and photos take longest; one-tap confirms take seconds.
const SECONDS = {
  address_pin: 60, phone: 20, website: 20, cuisine: 15, hours: 180, hours_fresh: 10, photo_main: 120, photo_extra: 180,
  avg_spend: 10, menu: 120, dietary: 20, happy_hour: 150, specials: 90, entertainment: 60,
  pyv_known: 45, pyv_reservations: 45, pyv_takeout: 30, pyv_groups: 45,
  description: 180, instagram: 30, facebook: 30, arrival: 90, owner_confirmed: 0,
  kitchen: 20, sports: 30, games: 15, minors: 20,
  cafe_kind: 10, season: 15, serves: 20, stay: 20, wifi: 5, dogs_kids: 15, ordering: 40,
  winery_kind: 10, tasting_price: 15, visit_how: 15, booking_link: 30, winery_groups: 15, food_here: 15, access: 10,
  brewery_kind: 10, flight_price: 15, to_go: 10,
};
if ([...ITEMS, ...PUB_ITEMS, ...CAFE_ITEMS, ...WINERY_ITEMS, ...BREWERY_ITEMS].some((i) => !(i.key in SECONDS))) throw new Error('portal-completeness: every item needs a time estimate');
// Whole minutes for the items an owner can still do (not the ones waiting for review). Saving hours also makes them
// fresh, so "hours checked" adds nothing when the hours themselves are missing. Never less than 1 while anything is left.
// Quick ones (2026-11-08, Dayton: "people are busy"): items that take half a minute or less lead the bar and the panel,
// so an owner can raise the score in under a minute; the longer jobs are offered for "when you have a few minutes".
const QUICK_SECONDS = 30;
const QUICK_CAP_SECONDS = 60;
const isQuick = (it) => !it.waiting && (SECONDS[it.key] || 0) <= QUICK_SECONDS;
// What each quick item saves (fresh-eyes 3, 2026-11-09): "Quick answers go live right away", so an item is only a quick
// one when that field goes live for this owner (opts.liveFields). Phone, website and dietary ticks wait for our check
// from an edit link, so there they sit under "When you have a few minutes".
const QUICK_FIELD = { phone: 'phone', website: 'website', cuisine: 'cuisine', hours_fresh: 'hours_checked', avg_spend: 'avg_spend', dietary: 'badges',
  instagram: 'instagram_url', facebook: 'facebook_url', pyv_known: 'visit_rows', pyv_reservations: 'visit_rows', pyv_takeout: 'visit_rows', pyv_groups: 'visit_rows',
  kitchen: 'pub_info', sports: 'pub_info', minors: 'pub_info', games: 'owner_features',
  cafe_kind: 'place_type', season: 'cafe_info', serves: 'cafe_info', stay: 'cafe_info', wifi: 'owner_features', dogs_kids: 'badges',
  winery_kind: 'place_type', tasting_price: 'tasting_fee', visit_how: 'winery_info', booking_link: 'booking_url', winery_groups: 'winery_info', food_here: 'winery_info', access: 'owner_features' };
// Breweries (2026-11-12): the same item keys save other fields for them (food here and the season are brewery answers).
const QUICK_FIELD_BY_TYPE = { brewery: { brewery_kind: 'place_type', flight_price: 'flight_fee', to_go: 'brewery_info', food_here: 'brewery_info', season: 'brewery_info', dogs_kids: 'brewery_info' } };
const quickFieldFor = (type, key) => ((QUICK_FIELD_BY_TYPE[type] || {})[key]) || QUICK_FIELD[key];
function minutesLeft(missing) {
  const keys = new Set(missing.filter((it) => !it.waiting).map((it) => it.key));
  if (!keys.size) return 0;
  let s = 0;
  for (const k of keys) if (!(k === 'hours_fresh' && keys.has('hours'))) s += SECONDS[k] || 0;
  return Math.max(1, Math.round(s / 60));
}

const GROUPS = [
  { key: 'basics', en: 'Basics', fr: 'Essentiel' },
  { key: 'hours', en: 'Hours', fr: 'Heures' },
  { key: 'photos', en: 'Photos', fr: 'Photos' },
  { key: 'menu', en: 'Menu', fr: 'Menu' },
  { key: 'offers', en: 'Offers', fr: 'Offres' },
  { key: 'visit', en: 'Plan your visit', fr: 'Planifier la visite' },
  { key: 'about', en: 'About', fr: 'À propos' },
  { key: 'social', en: 'Social links', fr: 'Réseaux sociaux' },
  { key: 'finding', en: 'Finding you', fr: 'Vous trouver' },
  { key: 'confirmed', en: 'Confirmed by you', fr: 'Confirmée par vous' },
  // Pub groups (2026-11-10). A group with no items for a type has max 0 and is left out, so restaurants are unchanged.
  { key: 'food', en: 'Food & drink', fr: 'Nourriture et boissons' },
  { key: 'whatson', en: 'What’s on', fr: 'À l’affiche' },
  { key: 'yourvisit', en: 'Your visit', fr: 'Votre visite' },
  // Cafés (2026-11-10).
  { key: 'serve', en: 'What you serve', fr: 'Ce que vous servez' },
  // Wineries (2026-11-12).
  { key: 'tastings', en: 'Tastings and booking', fr: 'Dégustations et réservations' },
  // Breweries (2026-11-12).
  { key: 'taproom', en: 'Taproom', fr: 'Salle de dégustation' },
];

const nonBlank = (s) => typeof s === 'string' && s.trim() !== '';
// A menu link that is just the website (Dayton 2026-11-09): it doesn't count as a menu. Compared without the scheme,
// "www.", trailing slashes and case, so "https://www.Place.ca/" and "place.ca" are the same address.
function sameAddress(a, b) {
  const norm = (u) => String(u || '').trim().toLowerCase().split('#')[0].replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  return nonBlank(a) && nonBlank(b) && norm(a) === norm(b);
}
const MENU_SAME_SITE_COPY = {
  whyEn: 'Your menu link is the same as your website. Add the page your menu is on.',
  whyFr: 'Votre lien de menu est le même que votre site Web. Ajoutez la page où se trouve votre menu.',
};
const dayNumber = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; };

// input: plain values gathered by server.js (see gatherCompletenessInput there).
function doneMap(input, today) {
  const i = input || {};
  const labels = new Set((i.visitLabels || []).map((l) => String(l).trim().toLowerCase()));
  const pub = i.pubInfo && typeof i.pubInfo === 'object' ? i.pubInfo : {};
  const feats = new Set(Array.isArray(i.ownerFeatures) ? i.ownerFeatures : []);
  const a = dayNumber(i.hoursCheckedAt), b = dayNumber(today);
  const ownPhoto = /^(?:https:\/\/|\/images\/)[^'"()\s<>]+$/.test(String(i.imageUrl || '').trim());
  return {
    address_pin: nonBlank(i.address) && i.latitude != null && i.longitude != null,
    phone: nonBlank(i.phone),
    website: nonBlank(i.website),
    cuisine: nonBlank(i.cuisine),
    hours: !!i.hasHours,
    hours_fresh: !!i.hasHours && a != null && b != null && b - a <= HOURS_FRESH_DAYS,
    photo_main: ownPhoto,
    photo_extra: Number(i.photoCount) >= PHOTOS_MIN,
    // A research estimate counts once the owner confirms it ("Yes, that's right"), so confirming earns the points.
    avg_spend: Number.isInteger(i.avgSpend) && i.avgSpendSource !== 'research',
    menu: (nonBlank(i.menuUrl) && !sameAddress(i.menuUrl, i.website)) || !!i.hasPublishedMenu,
    dietary: !!(i.vegan || i.vegetarian || i.glutenFree) || labels.has('dietary'),
    happy_hour: !!i.hasHappyHour,
    specials: Number(i.specialsCount) > 0,
    entertainment: !!(i.liveMusic || i.sportsTv) || Number(i.nightsCount) > 0,
    pyv_known: labels.has('known for'),
    pyv_reservations: labels.has('reservations') || nonBlank(i.bookingUrl),
    pyv_takeout: labels.has('takeout') || labels.has('to go'),
    pyv_groups: labels.has('groups') || labels.has('good to know'),
    description: String(i.description || '').trim().length >= DESCRIPTION_MIN,
    instagram: nonBlank(i.instagramUrl),
    facebook: nonBlank(i.facebookUrl),
    arrival: !!i.hasArrival,
    owner_confirmed: !!i.claimed,
    // Pubs (2026-11-10): owner-only answers in venue_pub_info and the owner features.
    kitchen: PUB_KITCHEN_MODES.includes(pub.kitchen && pub.kitchen.mode),
    sports: Array.isArray(pub.sports && pub.sports.list) && pub.sports.list.length > 0,
    games: PUB_GAME_KEYS.some((k) => feats.has(k)),
    minors: PUB_MINORS_POLICIES.includes(pub.minors && pub.minors.policy),
    // Cafés (2026-11-10): the kind of café, venue_cafe_info and the owner features (Wi-Fi, drive-thru, walk-up, dogs and kids).
    ...(i.type === 'cafe' ? (() => {
      const c = i.cafeInfo && typeof i.cafeInfo === 'object' ? i.cafeInfo : {};
      const stay = c.stay || {}, order = c.order || {};
      return {
        cafe_kind: CAFE_KINDS.includes(i.placeType),
        season: nonBlank(i.openMonths) || !!i.hasSeasons || c.year === 'all' || c.year === 'seasonal',
        serves: Array.isArray(c.serves) && c.serves.length > 0,
        // Café test 2 (2026-11-11): "Our menu changes daily (see Instagram / Facebook / the board)" answers the menu.
        menu: (nonBlank(i.menuUrl) && !sameAddress(i.menuUrl, i.website)) || !!i.hasPublishedMenu || ['instagram', 'facebook', 'board'].includes(c.menu_daily),
        // Dairy-free milks count as a dietary option for a café (the tile, or the milks named in Dietary details).
        dietary: !!(i.vegan || i.vegetarian || i.glutenFree) || labels.has('dietary') || feats.has('dairy_free_milk') || (Array.isArray((c.diet || {}).milks) && c.diet.milks.length > 0),
        stay: CAFE_LAPTOPS.includes(stay.laptops) || CAFE_SEATS.includes(stay.seats),
        wifi: feats.has('wifi'),
        dogs_kids: !!(i.dogFriendly || i.kidFriendly) || feats.has('stroller') || feats.has('dog_treats') || (i.declaredNone || []).includes('dogs'),
        ordering: !!order.preorder || CAFE_ORDER_FEATURES.some((k) => feats.has(k)) || nonBlank((c.links || {}).order_url),
      };
    })() : {}),
    // Wineries (2026-11-12): the kind of winery, venue_winery_info (owner-only, never researched), the owner's tasting price
    // and the owner features. Wheelchair / parking also counts once "What you offer" was saved in the setup (a winery with
    // neither can still answer it).
    ...(i.type === 'winery' ? (() => {
      const w = i.wineryInfo && typeof i.wineryInfo === 'object' ? i.wineryInfo : {};
      // Winery test 4 (2026-11-12): by appointment only (no set hours) answers the hours, their check and the season:
      // there is no weekly schedule to add or confirm ("Are your hours still right?" never asks).
      const apptOnly = w.visit === 'appointment';
      return {
        ...(apptOnly ? { hours: true, hours_fresh: true } : {}),
        winery_kind: WINERY_KINDS.includes(i.placeType),
        season: nonBlank(i.openMonths) || !!i.hasSeasons || WINERY_YEAR.includes(w.year) || apptOnly,
        tasting_price: typeof i.tastingFee === 'number' && Number.isFinite(i.tastingFee) && i.tastingFee >= 0,
        visit_how: WINERY_VISIT.includes(w.visit),
        booking_link: nonBlank(i.bookingUrl) || w.visit === 'walk_in',
        winery_groups: Number.isInteger(w.groups) || ['welcome', 'book', 'no'].includes(w.buses),
        food_here: WINERY_FOOD.includes(w.food),
        // Winery test 1 (2026-11-12): "What you offer" saved answers it too (no dog or kid tile ticked is an answer), as for access.
        dogs_kids: !!(i.dogFriendly || i.kidFriendly) || (i.declaredNone || []).includes('dogs') || !!i.offerAnswered,
        access: ['wheelchair_accessible', 'free_parking', 'rv_parking'].some((k) => feats.has(k)) || !!i.offerAnswered,
      };
    })() : {}),
    // Breweries (2026-11-12): the kind of place, venue_brewery_info (owner-only, never researched), the owner's flight
    // price (or "We don't do flights") and the owner features. The menu is done without a kitchen of their own.
    ...(i.type === 'brewery' ? (() => {
      const b = i.breweryInfo && typeof i.breweryInfo === 'object' ? i.breweryInfo : {};
      const foodSaid = BREWERY_FOOD.includes(b.food);
      return {
        brewery_kind: BREWERY_KINDS.includes(i.placeType),
        season: nonBlank(i.openMonths) || !!i.hasSeasons || BREWERY_YEAR.includes(b.year),
        food_here: foodSaid,
        flight_price: (typeof i.flightFee === 'number' && Number.isFinite(i.flightFee) && i.flightFee >= 0) || b.no_flights === true,
        to_go: Array.isArray(b.to_go) && b.to_go.length > 0,
        menu: (nonBlank(i.menuUrl) && !sameAddress(i.menuUrl, i.website)) || !!i.hasPublishedMenu || (foodSaid && b.food !== 'kitchen'),
        // Who's welcome (the one answer that decides the Kids badge), and the dogs answer ("What you offer" saved).
        dogs_kids: BREWERY_MINORS.includes(b.minors && b.minors.policy) && (!!i.dogFriendly || (i.declaredNone || []).includes('dogs') || !!i.offerAnswered),
        entertainment: !!i.liveMusic || Number(i.nightsCount) > 0,
        access: ['wheelchair_accessible', 'free_parking', 'rv_parking'].some((k) => feats.has(k)) || !!i.offerAnswered,
      };
    })() : {}),
    ...(i.type === 'pub' ? {
      // "We don't serve food" in the kitchen question also answers the food type.
      cuisine: nonBlank(i.cuisine) || !!(pub.kitchen && pub.kitchen.mode === 'none'),
      // Sports on TV has its own item for pubs, so it no longer counts as an event.
      entertainment: !!i.liveMusic || Number(i.nightsCount) > 0,
    } : {}),
  };
}
const PUB_KITCHEN_MODES = ['same', 'earlier', 'none'];
const PUB_MINORS_POLICIES = ['adults', 'minors_until', 'all_ages'];
const PUB_GAME_KEYS = ['pool', 'darts', 'shuffleboard', 'arcade', 'board_games'];

// -> { pct, got, max, complete, groups: [{ key, got, max, full }], missing: [item + {waiting}], coming: [item],
//      declined: [item] (told us "we don't have one" and we hold nothing for it), declared: [keys as stored] }
// opts: { today: 'YYYY-MM-DD', pending: Set of fields waiting for review }
// "Complete & Verified" badge (Dayton, Nov 9 2026). One rule, used by the public page, cards, the map and the portal:
//   earned  the score is 100% from live items only (anything waiting for our check is still "missing"), the business
//           manages the listing (claimed), and the hours were checked within HOURS_FRESH_DAYS (that is an item);
//   paused  everything is done except the hours check;
//   none    otherwise. Display only: never read by ranking, sorting or indexing.
function badgeState(result, claimed) {
  if (!result || !claimed) return 'none';
  if (result.complete) return 'earned';
  const left = (result.missing || []).filter((it) => !it.waiting);
  if (left.length === 1 && left[0].key === 'hours_fresh' && left.length === (result.missing || []).length) return 'paused';
  return 'none';
}
const BADGE_LABEL = { en: 'Complete & Verified', fr: 'Complète et vérifiée' };
// The chip (public pages, cards, portal): navy with a gold tick and a gold inner ring. `button` makes it the toggle for
// the short explanation on a venue page.
function badgeChipHtml(fr, opts) {
  const o = opts || {};
  const label = fr ? BADGE_LABEL.fr : BADGE_LABEL.en;
  const inner = `<span class="cv-tick" aria-hidden="true">&#10003;</span>${esc(label)}`;
  return o.button
    ? `<button type="button" class="chip complete-verified-badge" aria-expanded="false" aria-controls="${o.controls || 'cvExplain'}">${inner}</button>`
    : `<span class="chip complete-verified-badge">${inner}</span>`;
}
const BADGE_CSS = `
  .chip.complete-verified-badge { display: inline-flex; align-items: center; gap: 6px; background: #1B2B3A; color: #FFFDF8; box-shadow: inset 0 0 0 1.5px #C9A34A; border: 0; font: inherit; font-weight: 800; cursor: default; }
  button.chip.complete-verified-badge { cursor: pointer; min-height: 32px; }
  button.chip.complete-verified-badge:focus-visible { outline: 3px solid #C9A34A; outline-offset: 2px; }
  .chip.complete-verified-badge .cv-tick { display: inline-grid; place-items: center; width: 1.15em; height: 1.15em; border-radius: 50%; background: #C9A34A; color: #1B2B3A; font-size: 0.75em; line-height: 1; }
  .cv-explain { flex-basis: 100%; margin: 6px 0 2px; padding: 10px 12px; border-radius: 12px; background: rgba(27,43,58,0.06); border: 1px solid rgba(27,43,58,0.14); font-size: 0.9rem; line-height: 1.45; }
  .cv-explain strong { display: block; }`;

function scoreCompleteness(input, opts) {
  const o = opts || {};
  const done = doneMap(input, o.today);
  const list = itemsFor(input && input.type);
  const noneKeys = noneKeysFor(input && input.type);
  const declaredAll = ((input && input.declaredNone) || []).filter((k) => noneKeys.includes(k));
  const none = new Set(declaredAll);
  // "Not sure / someone else runs it" (pub test 6, 2026-11-10): Instagram and Facebook count as answered (no nagging),
  // but are not a "we don't have one" (never in `declared`).
  const unsure = new Set(((input && input.unsureKeys) || []).filter((k) => k === 'instagram' || k === 'facebook'));
  const pending = o.pending || new Set();
  const photosWaiting = Math.max(0, Number(input && input.pendingPhotos) || 0);
  const na = {};
  // (Polish 2026-11-08) The "nonalcoholic" badge means "has non-alcoholic options" (mocktails, NA beer), not "serves no
  // alcohol", so it no longer exempts a place from happy hour. A place with no happy hour says so with "We don't have one".
  // A Happy Hour badge with no times: a stored "we don't have one" would contradict the badge, so it doesn't count.
  const hhBadgeOnly = !!(input && input.happyHourBadge) && !done.happy_hour && !na.happy_hour;
  if (hhBadgeOnly) none.delete('happy_hour');
  let got = 0, max = 0;
  // Groups in the order their items come (the same as GROUPS for restaurants).
  const per = new Map([...new Set(list.map((it) => it.group))].map((k) => [k, { key: k, got: 0, max: 0 }]));
  // Winery test 1 (2026-11-12): the setup screen that answers each group (its first item's), so a finished group in
  // "See what's done" opens that screen to change an answer.
  const GROUP_STEP = { address_pin: 'basics', phone: 'basics', website: 'basics', hours: 'hours', hours_fresh: 'hours', photo_main: 'photos', photo_extra: 'photos', menu: 'menu', description: 'story', arrival: 'door' };
  for (const it of list) { const g = per.get(it.group); const st = GROUP_STEP[it.key] || (it.target && it.target.setup); if (g && !g.setup && st) g.setup = st; }
  const missing = [], coming = [], afterReopen = [];
  for (const base of list) {
    if (na[base.key]) continue;
    let it = base.key === 'happy_hour' && hhBadgeOnly ? { ...base, ...HAPPY_HOUR_BADGE_COPY, noneEn: undefined, noneFr: undefined } : base;
    if (base.key === 'menu' && !done.menu && input && sameAddress(input.menuUrl, input.website)) it = { ...base, ...MENU_SAME_SITE_COPY };
    // Brewery test 3 (2026-11-13): cider words for a cidery, neutral ones for a distillery or no kind yet. The kind picked,
    // else the one the name suggests (wordsKind, server.js breweryWordsKind).
    const wk = input ? input.placeType || input.wordsKind || '' : '';
    if (base.whyEnCidery && wk === 'Cidery') it = { ...it, whyEn: base.whyEnCidery, whyFr: base.whyFrCidery };
    const kc = base.cidery || base.neutral ? (wk === 'Cidery' ? base.cidery : ['Brewery', 'Taphouse or beer hall'].includes(wk) ? null : base.neutral) : null;
    if (kc) it = { ...it, ...kc };
    const ok = done[it.key] || none.has(it.key) || unsure.has(it.key);
    // No hours at all (live check 2026-11-08, 42 restaurants): "Are your hours still right?" has nothing to confirm.
    // It is part of "Add your hours" until there are hours (saving hours from the portal marks them checked too).
    if (it.key === 'hours_fresh' && !ok && !done.hours) {
      max += it.w; per.get(it.group).max += it.w;
      continue;
    }
    if (!ok && !it.fix) { coming.push({ ...it }); continue; }
    // Café test 2 (2026-11-11): the storefront photo is taken standing at the open door. A seasonal place closed for the
    // season can't, so the item waits under "When you reopen" and doesn't count until then (it can still reach 100%).
    if (!ok && it.key === 'arrival' && input && input.closedForSeason && !input.pendingArrival) { afterReopen.push({ ...it }); continue; }
    max += it.w; per.get(it.group).max += it.w;
    if (ok) { got += it.w; per.get(it.group).got += it.w; } else {
      // Waiting = something the owner already sent for this item is in our review queue (field-precise: a badge only
      // flags the item that badge belongs to). Photos count by uploads waiting (fresh-eyes 2026-11-08).
      let waiting = (it.fields || []).some((f) => pending.has(f));
      let sent = 0;
      if (it.key === 'photo_main' && photosWaiting > 0) { waiting = true; sent = photosWaiting; }
      // Winery test 3 (2026-11-12): the photos there will be once ours are checked (photoCountAfter: a research main
      // photo her "main" photo replaces no longer counts), not simply the photos now plus the ones sent.
      const photosAfter = input && Number.isFinite(input.photoCountAfter) ? input.photoCountAfter : Number(input && input.photoCount || 0) + photosWaiting;
      let after = 0;
      if (it.key === 'photo_extra' && photosWaiting > 0 && photosAfter >= PHOTOS_MIN) { waiting = true; sent = photosWaiting; after = photosAfter; }
      // A story waiting for our check counts only when it is long enough for the item.
      if (it.key === 'description' && waiting && typeof (input && input.descriptionAfter) === 'string' && input.descriptionAfter.trim().length < DESCRIPTION_MIN) waiting = false;
      // A storefront spot the owner sent is waiting for our check (fresh-eyes 3, 2026-11-09), not "left".
      if (it.key === 'arrival' && input && input.pendingArrival) waiting = true;
      // Sent for us to type up or find (the easy setup's menu pages, happy hour or specials sheet, a Facebook or
      // Instagram name): waiting, not "left" (2026-11-09).
      const ph = (input && input.pendingHelp) || {};
      if (ph[it.key === 'menu' ? 'menu' : it.key] && ['menu', 'happy_hour', 'specials', 'facebook', 'instagram'].includes(it.key)) waiting = true;
      missing.push({ ...it, waiting, sent, ...(after ? { after } : {}) });
    }
  }
  // Winery test 3 (2026-11-12): done now but not once what was sent is checked: a story under 120 letters that replaces
  // a longer research description. The projected score (pctWithWaiting) leaves it out, and it is listed in `lost`.
  const lost = [];
  if (done.description && typeof (input && input.descriptionAfter) === 'string' && input.descriptionAfter.trim().length < DESCRIPTION_MIN) {
    const it = list.find((x) => x.key === 'description');
    if (it && !na.description) lost.push({ ...it });
  }
  const complete = missing.length === 0;
  const pct = complete ? 100 : Math.min(99, Math.floor((got / max) * 100));
  const groups = [...per.values()].filter((g) => g.max > 0).map((g) => ({ ...g, full: g.got === g.max }));
  // Biggest first, then the order of the spec.
  missing.sort((x, y) => (x.waiting - y.waiting) || (y.w - x.w));
  const declined = list.filter((it) => none.has(it.key) && !done[it.key] && !na[it.key]).map((it) => ({ ...it }));
  // Capped at a minute (Dayton): the quickest ones that fit in 60 seconds; the rest wait in the second list.
  const quick = [];
  let quickSeconds = 0;
  const liveFields = o.liveFields instanceof Set ? o.liveFields : null;
  const quickHere = (it) => isQuick(it) && (!liveFields || (quickFieldFor(input && input.type, it.key) && liveFields.has(quickFieldFor(input && input.type, it.key))));
  for (const it of missing.filter(quickHere).sort((x, y) => (SECONDS[x.key] - SECONDS[y.key]) || (y.w - x.w))) {
    if (quickSeconds + SECONDS[it.key] > QUICK_CAP_SECONDS) break;
    quick.push(it); quickSeconds += SECONDS[it.key];
  }
  const waitingList = missing.filter((it) => it.waiting);
  const later = missing.filter((it) => !it.waiting && !quick.includes(it));
  // The lighter part of the ring: what will count once we approve what was sent.
  // Hours sent while the page had none: once checked they're fresh too, so the provisional score counts both.
  const hoursFreshW = waitingList.some((it) => it.key === 'hours') && !done.hours ? (list.find((i) => i.key === 'hours_fresh') || { w: 0 }).w : 0;
  const waitingW = waitingList.reduce((a, it) => a + it.w, 0) + hoursFreshW;
  const lostW = lost.reduce((a, it) => a + it.w, 0);
  const pctWithWaiting = waitingW || lostW ? Math.min(100, Math.floor(((got + waitingW - lostW) / max) * 100)) : pct;
  return { pct, pctWithWaiting, got, max, complete, groups, missing, coming, afterReopen, declined, declared: [...declaredAll], minutes: minutesLeft(missing), quick, later, waiting: waitingList, quickSeconds, lost };
}

// The weekly hours as one short line for "Are your hours still right?" (fresh-eyes 2026-11-08):
// "Mon closed · Tue–Thu 11:30 AM–9 PM · Fri 11:30 AM–10 PM". Days with the same times are grouped.
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_EN = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_FR = { mon: 'lun.', tue: 'mar.', wed: 'mer.', thu: 'jeu.', fri: 'ven.', sat: 'sam.', sun: 'dim.' };
function clockText(t, fr) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return String(t || '');
  const h = Number(m[1]), mi = m[2];
  if (fr) return mi === '00' ? `${h} h` : `${h} h ${mi}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mi === '00' ? '' : `:${mi}`} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}
function hoursLine(week, fr) {
  if (!week || typeof week !== 'object') return '';
  const key = (d) => JSON.stringify(Array.isArray(week[d]) ? week[d] : []);
  const parts = [];
  let i = 0;
  while (i < WEEK.length) {
    let j = i;
    while (j + 1 < WEEK.length && key(WEEK[j + 1]) === key(WEEK[i])) j++;
    const names = fr ? DAY_FR : DAY_EN;
    const days = i === j ? names[WEEK[i]] : `${names[WEEK[i]]}–${names[WEEK[j]]}`;
    const ranges = Array.isArray(week[WEEK[i]]) ? week[WEEK[i]] : [];
    const times = ranges.length ? ranges.map((r) => `${clockText(r[0], fr)}–${clockText(r[1], fr)}`).join(fr ? ' et ' : ' and ') : (fr ? 'fermé' : 'closed');
    parts.push(`${days} ${times}`);
    i = j + 1;
  }
  return parts.join(' · ');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The bar and its panel. `menuHref`: where "Add menu" goes. Nothing here is public: it is only ever put in the owner page.
// Shorter panel (polish 2026-11-08): the quick ones, then the next few longer ones; the rest behind "Show all".
const LATER_SHOWN = 3;
function renderCompleteness(result, opts) {
  const o = opts || {};
  const fr = !!o.fr;
  // Brewery test 3 (2026-11-13): French typography (« Changer quelque chose ? », a no-break space before « : »), as in the setup.
  const L = (en, f) => (fr ? frSpacing(f) : en);
  const r = result;
  // Winery test 1 (2026-11-12): a winery has a tasting room door, not a storefront.
  const spotEn = o.winery ? 'your tasting room door' : o.brewery ? 'your taproom door' : 'your storefront spot';
  const spotFr = o.winery ? 'la porte de votre salle de dégustation' : o.brewery ? 'la porte de votre salle de dégustation' : 'l’emplacement de votre devanture';
  const gotText = (k) => (GOT_TEXT[k] ? `${fr ? GOT_TEXT[k].fr : GOT_TEXT[k].en} \u2713` : '');
  const waitingList = r.waiting || r.missing.filter((it) => it.waiting);
  // Ticked badges waiting for our check (final fresh-eyes 2026-11-09): most badges (patio, kid-friendly…) belong to no
  // checklist item, so they get their own row in the Waiting list and count in "N waiting".
  const badgeNames = Array.isArray(o.pendingBadges) ? o.pendingBadges.filter((x) => typeof x === 'string' && x) : [];
  const left = r.missing.length - waitingList.length;
  const nw = waitingList.length + (badgeNames.length ? 1 : 0);
  const gName = new Map(GROUPS.map((g) => [g.key, fr ? g.fr : g.en]));
  // One number everywhere (pub test 3, 2026-11-10: the owner saw 61%, 75%, then 63% here): the score shown counts what
  // the owner sent and we haven't added yet, the same number the easy setup shows. The live-only score (r.pct) still
  // decides the badge (badgeState) and the ring's dark part.
  const shownPct = !r.complete && r.pctWithWaiting != null && r.pctWithWaiting > r.pct ? r.pctWithWaiting : r.pct;
  const counting = shownPct > r.pct;
  // Café test 4 (2026-11-11): on the owner's edit page (o.noScore) the card is the checklist, without the percent or the
  // badge talk ("Complete & Verified", "21% counts what you sent" was noise for a first-time owner). The score itself,
  // the badge rules and the setup's own numbers are unchanged; data-cb-pct still carries the number for the page script.
  const noScore = !!o.noScore;
  const headline = r.complete ? L('Your page is complete', 'Votre fiche est complète') : noScore ? L('Your page checklist', 'La liste de votre fiche') : counting ? L(`Your page is about ${shownPct}% complete`, `Votre fiche est complète à environ ${shownPct} %`) : L(`Your page is ${r.pct}% complete`, `Votre fiche est complète à ${r.pct} %`);
  // Never a big total up front: lead with what takes under a minute or two (2026-11-08).
  const quick = r.quick || [], later = r.later || r.missing;
  const nq = quick.length;
  const qMin = Math.ceil((r.quickSeconds || 0) / 60);
  const qTime = qMin <= 1 ? L('under a minute', 'moins d’une minute') : L(`about ${qMin} minutes`, `environ ${qMin} min`);
  // Things already sent and waiting for our check are never "left" (fresh-eyes 2026-11-08): they get their own count.
  const waitTxt = nw && !o.plainWaiting ? L(` · ${nw} waiting for our check${left ? '' : ' (usually within a day)'}`, ` · ${nw} en attente de notre vérification${left ? '' : ' (habituellement en moins d’une journée)'}`) : '';
  // After the easy setup (o.plainWaiting): one plain sentence instead of a count ("Photos and menu sent. We'll add them
  // within a day."), fresh-eyes 2026-11-09.
  const sentNames = [];
  // Fields still waiting in the owner's change request that no checklist item names (a new phone number on a page that
  // already had one): named too, so the line says exactly what is pending (pub test 3, 2026-11-10).
  const fieldNames = { phone: ['phone', 'téléphone'], address: ['address', 'adresse'], website: ['website', 'site Web'], name: ['name', 'nom'], description: ['your story', 'votre histoire'] };
  const extraFields = (Array.isArray(o.pendingFields) ? o.pendingFields : []).filter((k) => fieldNames[k]);
  const photosSent = Math.max(0, Number(o.pendingPhotos) || 0);
  if (o.plainWaiting && (nw || extraFields.length || photosSent)) {
    const short = { photo_main: ['photos', 'photos'], photo_extra: ['photos', 'photos'], menu: ['menu', 'menu'], description: ['your story', 'votre histoire'], address_pin: ['address', 'adresse'], phone: ['phone', 'téléphone'],
      website: ['website', 'site Web'], arrival: o.winery ? ['tasting room door photo', 'photo de la porte de la salle de dégustation'] : o.brewery ? ['taproom door photo', 'photo de la porte de la salle'] : ['front door photo', 'photo de la devanture'], happy_hour: ['happy hour', 'happy hour'], specials: ['specials', 'spéciaux'], facebook: ['Facebook', 'Facebook'], instagram: ['Instagram', 'Instagram'] };
    for (const it of waitingList) { const n = (short[it.key] || [it.en, it.fr])[fr ? 1 : 0]; if (!sentNames.includes(n)) sentNames.push(n); }
    for (const k of extraFields) { const n = fieldNames[k][fr ? 1 : 0]; if (!sentNames.includes(n)) sentNames.push(n); }
    // Every pending item is named, photos included (pub test 6: "Menu, website and address sent" left out the photo).
    if (photosSent && !sentNames.includes('photos')) sentNames.unshift('photos');
    if (badgeNames.length) sentNames.push(L('features', 'caractéristiques'));
  }
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const sentList = sentNames.length > 1 ? sentNames.slice(0, -1).join(', ') + L(' and ', ' et ') + sentNames[sentNames.length - 1] : sentNames[0] || '';
  const sentSentence = sentNames.length ? L(` ${cap(sentList)} sent. We’ll add ${sentNames.length === 1 && !/s$/.test(sentNames[0]) ? 'it' : 'them'} within a day.`, ` ${cap(sentList)} : envoyé. Nous l’ajouterons d’ici un jour.`) : '';
  const sub0 = r.complete
    ? L('Nothing left to add. Thank you!', 'Il n’y a plus rien à ajouter. Merci!')
    : nq
      ? L(`${nq} quick ${nq === 1 ? 'one' : 'ones'}, ${qTime}${waitTxt}. Tap to start.`, `${nq} ${nq === 1 ? 'élément rapide' : 'éléments rapides'}, ${qTime}${waitTxt}. Touchez pour commencer.`)
      : left && r.missing.filter((it) => !it.waiting).every((it) => CEILING_KEYS.includes(it.key))
        ? L(`Last steps: ${r.missing.some((it) => !it.waiting && it.key === 'arrival') ? (r.missing.some((it) => !it.waiting && it.key !== 'arrival') ? `photos and ${spotEn}` : spotEn) : 'photos'}${waitTxt}. Tap to see.`,
          `Dernières étapes : ${r.missing.some((it) => !it.waiting && it.key === 'arrival') ? (r.missing.some((it) => !it.waiting && it.key !== 'arrival') ? `les photos et ${spotFr}` : spotFr) : 'les photos'}${waitTxt}. Touchez pour voir.`)
      : left
        ? L(`${left} ${left === 1 ? 'thing' : 'things'} left for when you have a few minutes${waitTxt}. Tap to see.`, `Il reste ${left} ${left === 1 ? 'élément' : 'éléments'} pour quand vous aurez quelques minutes${waitTxt}. Touchez pour voir.`)
        : L(`Nothing left for you to do${waitTxt}.`, `Rien d’autre à faire pour vous${waitTxt}.`);
  // While the card is open the "Tap to start." part would be wrong (final fresh-eyes 2026-11-09): the page script swaps in
  // this version without it.
  // The "sent" sentence comes before "Tap to start." so the line still ends on what to do next.
  // The "sent" sentence sits on its own line under the bar's line (fresh-eyes 2026-11-10: "2 quick ones, under a
  // minute. Menu and photos sent. … Tap to start." ran three thoughts together).
  const subOpen = sub0.replace(/ (Tap to start|Tap to see)\.$/, '').replace(/ Touchez pour (commencer|voir)\.$/, '');
  // o.quietCta: the setup card above is the way in, so this line doesn't ask to be tapped as well.
  // Pub fresh-eyes (2026-11-10): "4 quick ones" under the setup card read as a second to-do list, so until the setup is
  // finished (or "I'm done for now") the line only says the setup above fills this in.
  const quietSub = L(`Your page so far${waitTxt}. The setup above fills this in.`, `Votre fiche jusqu’ici${waitTxt}. La configuration ci-dessus la remplit.`);
  const sub = o.quietCta ? (r.complete ? sub0 : quietSub) : sub0;
  const sentLineHtml = sentSentence ? `<span class="op-cb-sentline">${esc(sentSentence.trim())}</span>` : '';
  const btn = (it) => {
    const label = esc(fr ? it.btnFr : it.btnEn);
    if (it.waiting) return `<span class="op-cb-wait">${L('Waiting for review', 'En attente de vérification')}</span>`;
    // Easy setup (2026-11-09): photos and the menu open the one-question-at-a-time setup at that step.
    const setupStep = o.setupHref ? ({ photo_main: 'photos', photo_extra: 'photos', menu: 'menu' }[it.key] || (it.target && it.target.setup)) : null;
    if (setupStep) return `<a class="op-cb-btn" href="${esc(o.setupHref)}#${setupStep}">${label}</a>`;
    if (it.target && it.target.setup) return '';
    if (it.target && it.target.href) return `<a class="op-cb-btn" href="${esc(o.menuHref || '#')}">${label}</a>`;
    if (it.target) return `<button type="button" class="op-cb-btn" data-cb-task="${esc(it.target.task)}" data-cb-id="${esc(it.target.id || '')}">${label}</button>`;
    return '';
  };
  // "We don't have one" (2026-11-08): a second, quieter button on the items a place may not offer. Only when the
  // owner can say so (o.canDecline) and nothing is waiting for review on that item.
  const noneBtn = (it) => (o.canDecline && it.noneEn && !it.waiting
    ? `<button type="button" class="op-cb-none" data-cb-none="${esc(it.key)}" data-cb-got="${esc(gotText(it.key))}">${esc(fr ? it.noneFr : it.noneEn)}</button>` : '');
  // One tap right in the row (fresh-eyes 2026-11-08): the hours as text with "Yes, these are right", and the
  // average-spend estimate with "Yes, that's right". "Change them/it" jumps to the editor. Saved in place, no reload.
  const oneTap = (it) => {
    if (it.waiting) return null;
    if (it.key === 'hours_fresh' && o.hoursText) {
      return { val: o.hoursText, save: { hours_checked: true }, yes: L('Yes, these are right', 'Oui, elles sont exactes'),
        done: L('Thanks! Your hours are marked as checked today.', 'Merci! Vos heures sont marquées comme vérifiées aujourd’hui.'),
        change: L('Change them', 'Les modifier'), task: 'hours', id: 'hours' };
    }
    if (it.key === 'avg_spend' && Number.isInteger(o.avgEstimate)) {
      const money = fr ? `${o.avgEstimate} $` : `$${o.avgEstimate}`;
      return { val: L(`Our estimate from your menu: about ${money}`, `Notre estimation selon votre menu : environ ${money}`), save: { avg_spend: String(o.avgEstimate) },
        yes: L('Yes, that’s right', 'Oui, c’est exact'),
        // Only say it's on the page when it is (fresh-eyes 3, 2026-11-09): average spend is hidden publicly while
        // AVG_SPEND_PUBLIC is off.
        done: o.avgPublic ? L(`Thanks! Your page shows about ${money}.`, `Merci! Votre fiche indique environ ${money}.`)
          : L(`Thanks! Saved. It’ll show on your page soon.`, `Merci! C’est enregistré. Cela s’affichera bientôt sur votre fiche.`),
        change: L('Change it', 'La modifier'), task: 'more', id: 'opAvg' };
    }
    return null;
  };
  const row = (it) => {
    const t = oneTap(it);
    // The hours read one day group per line.
    const why = t ? `<span>${esc(fr ? it.whyFr : it.whyEn)}</span><span class="op-cb-val">${esc(t.val).split(' · ').join('<br>')}</span>` : `<span>${esc(fr ? it.whyFr : it.whyEn)}</span>`;
    const act = t
      ? `<button type="button" class="op-cb-btn" data-cb-save="${esc(JSON.stringify(t.save))}" data-cb-done="${esc(t.done)}">${esc(t.yes)}</button><button type="button" class="op-cb-link" data-cb-task="${esc(t.task)}" data-cb-id="${esc(t.id)}">${esc(t.change)}</button>`
      : btn(it);
    return `<li class="op-cb-row" data-cb-item="${esc(it.key)}"><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><div class="op-cb-txt"><strong>${esc(fr ? it.fr : it.en)}</strong>${why}</div><div class="op-cb-act">${act}</div>${noneBtn(it) ? `<div class="op-cb-alt">${noneBtn(it)}</div>` : ''}</li>`;
  };
  const quickHtml = nq ? `<h3>${L('Quick ones', 'Rapides')}</h3><p class="op-cb-note op-cb-lead">${qMin <= 1 ? L('Under a minute for all of them.', 'Moins d’une minute en tout.') : L(`About ${qMin} minutes for all of them.`, `Environ ${qMin} min en tout.`)}</p><ul class="op-cb-list">${quick.map(row).join('')}</ul>` : '';
  const laterHtml = later.length ? `<h3${nq ? ' class="op-cb-h3"' : ''}>${L('When you have a few minutes', 'Quand vous aurez quelques minutes')}</h3><p class="op-cb-note op-cb-lead">${L('Do them one at a time, whenever suits you. Photos and a description make the biggest difference.', 'Faites-les un à la fois, quand ça vous convient. Les photos et une description font la plus grande différence.')}</p><ul class="op-cb-list">${later.slice(0, LATER_SHOWN).map(row).join('')}</ul>${later.length > LATER_SHOWN ? `<details class="op-cb-all"><summary>${L(`Show all (${later.length - LATER_SHOWN} more)`, `Tout afficher (${later.length - LATER_SHOWN} de plus)`)}</summary><ul class="op-cb-list">${later.slice(LATER_SHOWN).map(row).join('')}</ul></details>` : ''}` : '';
  const badgeRow = badgeNames.length ? `<li><span class="op-cb-ico" aria-hidden="true">🏷️</span><span class="op-cb-dtxt"><strong>${L('Badges you ticked', 'Caractéristiques cochées')}</strong><span class="op-cb-sent">${esc(badgeNames.join(', '))} &middot; ${L('waiting for our check', 'en attente de vérification')}</span></span></li>` : '';
  const waitingHtml = nw ? `<h3 class="op-cb-h3">${L('Waiting for our check', 'En attente de notre vérification')}</h3><p class="op-cb-note op-cb-lead">${L('You sent these. We usually check within a day, and then they count.', 'Vous avez envoyé ceci. Nous vérifions habituellement en moins d’une journée, puis cela compte.')}</p><ul class="op-cb-declined op-cb-waiting">${waitingList.map((it) => `<li><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><span class="op-cb-dtxt"><strong>${esc(fr ? it.fr : it.en)}</strong><span class="op-cb-sent">${it.sent ? L(`${it.sent} photo${it.sent === 1 ? '' : 's'} sent`, `${it.sent} photo${it.sent === 1 ? '' : 's'} envoyée${it.sent === 1 ? '' : 's'}`) + (it.after > it.sent ? L(` (${it.after} in all with the one${it.after - it.sent === 1 ? '' : 's'} you have)`, ` (${it.after} en tout avec ${it.after - it.sent === 1 ? 'celle' : 'celles'} que vous avez)`) : '') : L('Sent', 'Envoyé')} &middot; ${L('waiting for our check', 'en attente de vérification')}</span></span></li>`).join('')}${badgeRow}</ul>` : '';
  // The last steps (live check 2026-11-08): photos and the storefront spot, said plainly once they are among what's left.
  const leftKeys = r.missing.filter((it) => !it.waiting).map((it) => it.key);
  const ceilPhotos = leftKeys.includes('photo_main') || leftKeys.includes('photo_extra');
  const ceilDoor = leftKeys.includes('arrival');
  const onlyCeiling = leftKeys.length > 0 && leftKeys.every((k) => CEILING_KEYS.includes(k));
  const ceilingText = ceilPhotos && ceilDoor ? L(`Photos and ${spotEn} are the last steps to 100%.`, `Les photos et ${spotFr} sont les dernières étapes vers 100 %.`)
    : ceilPhotos ? L('Photos are the last step to 100%.', 'Les photos sont la dernière étape vers 100 %.')
      : ceilDoor ? L(`${spotEn.charAt(0).toUpperCase()}${spotEn.slice(1)} is the last step to 100%.`, `${spotFr.charAt(0).toUpperCase()}${spotFr.slice(1)} est la dernière étape vers 100 %.`) : '';
  const ceilingHtml = ceilingText ? `<p class="op-cb-note op-cb-ceiling">${noScore ? ceilingText.replace(' to 100%', '').replace(' vers 100 %', '') : ceilingText}${onlyCeiling ? '' : ceilPhotos && ceilDoor
    ? L(' Do them when you’re at your place with a few minutes.', ' Faites-les quand vous êtes sur place avec quelques minutes.')
    : L(' Do it when you’re at your place with a few minutes.', ' Faites-le quand vous êtes sur place avec quelques minutes.')}</p>` : '';
  const still = quickHtml + laterHtml + ceilingHtml + waitingHtml;
  // Items the owner can't fill in yet but CAN already say they don't offer (Reservations, Takeout) get their own short
  // list, so "You can't fill these in yet" never sits next to a button that does something (2026-11-08).
  const comingAsk = r.coming.filter((it) => noneBtn(it));
  const comingPlain = r.coming.filter((it) => !noneBtn(it));
  const askHtml = comingAsk.length ? `<h3 class="op-cb-h3">${L('Don’t offer these?', 'Vous n’offrez pas ceci?')}</h3><p class="op-cb-note">${L('If you don’t, tap to tell us. It counts as done.', 'Si c’est le cas, touchez pour nous le dire. Cela compte comme fait.')}</p><ul class="op-cb-soon">${comingAsk.map((it) => `<li><strong>${esc(fr ? it.fr : it.en)}</strong><div>${noneBtn(it)}</div></li>`).join('')}</ul>` : '';
  // Café test 2 (2026-11-11): the storefront photo of a place closed for the season waits until it reopens.
  const reopenHtml = (r.afterReopen || []).length ? `<h3 class="op-cb-h3">${L('When you reopen', 'À votre réouverture')}</h3><p class="op-cb-note">${L('You’re closed for the season, so this waits. It doesn’t count against you until you reopen.', 'Vous êtes fermé pour la saison, alors ceci attend. Cela ne compte pas contre vous avant la réouverture.')}</p><ul class="op-cb-soon">${r.afterReopen.map((it) => `<li><strong>${esc(fr ? it.fr : it.en)}</strong> <span>${L('Stand at your front door and take one photo when you’re open again.', 'Placez-vous devant votre porte et prenez une photo quand vous serez rouvert.')}</span></li>`).join('')}</ul>` : '';
  const comingHtml = reopenHtml + askHtml + (comingPlain.length ? `<h3 class="op-cb-h3">${L('We’re adding these', 'Nous ajoutons ceci')}</h3><p class="op-cb-note">${L('You can’t fill these in yet. They’ll count once you can.', 'Vous ne pouvez pas encore les remplir. Ils compteront dès que ce sera possible.')}</p><ul class="op-cb-soon">${comingPlain.map((it) => `<li><strong>${esc(fr ? it.fr : it.en)}</strong> <span>${esc(fr ? it.whyFr : it.whyEn)}</span></li>`).join('')}</ul>` : '');
  const groups = r.groups.map((g) => {
    const link = !!(o.setupHref && g.setup);
    return `<${link ? `a href="${esc(o.setupHref)}#${esc(g.setup)}"` : 'div'} class="op-cb-g${g.full ? ' full' : ''}${link ? ' op-cb-g-link' : ''}"><b>${esc(gName.get(g.key))}${g.full ? ' ✓' : ''}${link ? ' <span class="op-cb-g-chev" aria-hidden="true">›</span>' : ''}</b><em>${L(`${g.got} of ${g.max}`, `${g.got} sur ${g.max}`)}</em><div class="op-cb-bar"><i style="width:${Math.round((g.got / g.max) * 100)}%"></i></div></${link ? 'a' : 'div'}>`;
  }).join('');
  const declined = r.declined || [];
  const declinedHtml = o.canDecline && declined.length ? `<h3 class="op-cb-h3">${L('You told us you don’t have these', 'Vous nous avez dit ne pas avoir ceci')}</h3><ul class="op-cb-declined">${declined.map((it) => `<li><span class="op-cb-ico" aria-hidden="true">${it.icon}</span><span class="op-cb-dtxt"><strong>${esc(fr ? it.fr : it.en)}</strong><span>${L('Not offered', 'Non offert')} ✓</span></span><button type="button" class="op-cb-undo" data-cb-undo="${esc(it.key)}">${L('Undo', 'Annuler')}</button></li>`).join('')}</ul><p class="op-cb-note">${declined.some((it) => it.key === 'wifi')
    // Café test 1 (2026-11-11): a café's "No Wi-Fi" shows as a friendly line on its page ("No Wi-Fi: a place to talk").
    ? (declined.length > 1 ? L('These count as done. Your page says “No Wi-Fi: a place to talk”; nothing about the others shows on your public page.', 'Ils comptent comme faits. Votre fiche indique « Pas de Wi-Fi : un endroit pour discuter »; rien des autres ne paraît sur votre fiche publique.')
      : L('This counts as done. Your page says “No Wi-Fi: a place to talk”.', 'Cela compte comme fait. Votre fiche indique « Pas de Wi-Fi : un endroit pour discuter ».'))
    : L('These count as done. Only you see them: nothing about them shows on your public page.', 'Ils comptent comme faits. Vous seul les voyez : rien n’en paraît sur votre fiche publique.')}</p>` : '';
  // Next to the edit-page fields: the same button, placed by the page script under each field it fills.
  const inline = o.canDecline ? r.missing.filter((it) => it.noneEn && !it.waiting && it.target && it.target.id).map((it) => ({ key: it.key, id: it.target.id, label: fr ? it.noneFr : it.noneEn, got: gotText(it.key) })) : [];
  const dataAttrs = o.canDecline ? ` data-cb-declared="${esc(JSON.stringify(r.declared || []))}" data-cb-inline="${esc(JSON.stringify(inline))}" data-cb-wrong="${esc(L('Sorry, that could not be saved. Please reload the page and try again.', 'Désolé, cela n’a pas pu être enregistré. Rechargez la page et réessayez.'))}" data-cb-undo-text="${esc(L('Undo', 'Annuler'))}"` : '';
  // A quick one that appears after the owner answers another is said so (final fresh-eyes 2026-11-09), so the count
  // doesn't look like it started over.
  const moreAttrs = r.complete ? '' : ` data-cb-quick="${esc(quick.map((it) => it.key).join(' '))}" data-cb-more1="${esc(L('1 more quick one just came up.', '1 autre élément rapide vient de s’ajouter.'))}" data-cb-moren="${esc(L('{n} more quick ones just came up.', '{n} autres éléments rapides viennent de s’ajouter.'))}"`;
  // Score while waiting (fresh-eyes 3, 2026-11-09): what the owner sent doesn't count until we check it, so the bar says
  // where they'll land: "61% now · about 95% once we check your 8 changes", with a legend for the ring's two colours.
  // The real score (r.pct) never counts waiting items.
  // One number (pub test 3, 2026-11-10): the headline already counts what was sent; this line only says so.
  const prov = !noScore && !r.complete && nw > 0 && counting ? shownPct : null;
  const provHtml = prov != null ? `<p class="op-cb-prov" id="opCbProv">${L(`<strong>${prov}%</strong> counts what you sent. ${o.plainWaiting ? 'We add it' : `We check your ${nw} ${nw === 1 ? 'change' : 'changes'}`}, usually within a day.`, `<strong>${prov} %</strong> compte ce que vous avez envoyé. ${o.plainWaiting ? 'Nous l’ajoutons' : `Nous vérifions vos ${nw} ${nw === 1 ? 'modification' : 'modifications'}`}, habituellement d’ici un jour.`)}<span class="op-cb-legend"><i class="op-cb-key op-cb-key-done"></i>${L('Done', 'Fait')} <i class="op-cb-key op-cb-key-wait"></i>${L('Sent, we’re checking', 'Envoyé, en cours de vérification')}</span></p>` : '';
  const yay = ` data-cb-pct="${shownPct}" data-cb-yay="${esc(noScore ? L('Nice! That’s done.', 'Bravo! C’est fait.') : L('Nice! You’re now at {p}%.', 'Bravo! Vous êtes maintenant à {p} %.'))}"`;
  // Complete & Verified (2026-11-09): what the business sees about the badge, under the ring.
  const bState = o.claimed === undefined ? null : badgeState(r, !!o.claimed);
  const chip = badgeChipHtml(fr);
  const badgeBlock = bState === 'earned'
    ? `<div class="op-cb-badge op-cb-badge-earned" id="opCbBadge"><p><span aria-hidden="true">🎉</span> ${L('You earned the', 'Vous avez obtenu le badge')} ${chip}${L(' badge.', '.')}</p><p class="op-cb-badge-note">${L('It shows on your page, in search and on the Roam Now map. Keep it by checking your hours at least every 30 days. We’ll send a reminder.', 'Il s’affiche sur votre fiche, dans la recherche et sur la carte Roam Now. Gardez-le en vérifiant vos heures au moins tous les 30 jours. Nous vous enverrons un rappel.')}</p></div>`
    : bState === 'paused'
    ? `<div class="op-cb-badge op-cb-badge-paused" id="opCbBadge"><p><span aria-hidden="true">⏰</span> ${L('Your', 'Votre badge')} ${chip} ${L('badge is paused. Are your hours still right?', 'est en pause. Vos heures sont-elles toujours exactes?')}</p><button type="button" class="op-cb-btn" data-cb-save="${esc(JSON.stringify({ hours_checked: true }))}" data-cb-done="${esc(L('Thanks! Your badge is back.', 'Merci! Votre badge est de retour.'))}">${L('Yes, these are right', 'Oui, elles sont exactes')}</button></div>`
    : bState === 'none' && !noScore
    ? `<div class="op-cb-badge" id="opCbBadge"><p>${chip}</p><p class="op-cb-badge-note">${L('Reach 100% to earn the Complete &amp; Verified badge for your page.', 'Atteignez 100 % pour obtenir le badge Complète et vérifiée pour votre fiche.')}</p></div>`
    : '';
  const seePage = o.pageHref ? `<p class="op-cb-see"><a href="${esc(o.pageHref)}" target="_blank" rel="noopener">${L('See your page', 'Voir votre fiche')} &#8599;</a></p>` : '';
  return `<section class="op-cb" id="opComplete" data-task="home all" aria-labelledby="opCbHead"${dataAttrs}${yay}${moreAttrs}>
      <button type="button" class="op-cb-head" id="opCbToggle" aria-expanded="false" aria-controls="opCbPanel">${noScore ? `<span class="op-cb-ico op-cb-list-ico" aria-hidden="true">${r.complete ? '✅' : '📋'}</span>` : `<span class="op-cb-ring${r.pct >= 100 ? ' op-cb-ring-100' : ''}" style="--p:${r.pct};--w:${r.pctWithWaiting != null ? r.pctWithWaiting : r.pct}" aria-hidden="true"><b>${shownPct}%</b></span>`}<span class="op-cb-title"><strong id="opCbHead">${esc(headline)}</strong><span id="opCbSub" data-closed="${esc(sub)}" data-opened="${esc(o.quietCta && !r.complete ? quietSub : subOpen)}">${esc(sub)}</span>${sentLineHtml}</span><span class="op-cb-chev" aria-hidden="true"></span></button>
      ${badgeBlock}${provHtml}<p class="op-cb-yay" id="opCbYay" role="status" hidden></p>${seePage}
      <div class="op-cb-panel" id="opCbPanel" hidden>${o.canDecline ? `
        <p class="op-cb-err" id="opCbErr" role="alert" hidden></p>` : ''}
        ${still}
        <details class="op-cb-done"><summary>${L('See what’s done', 'Voir ce qui est fait')}</summary><div class="op-cb-groups">${groups}</div></details>
        ${declinedHtml}
        ${comingHtml}
        ${noScore ? '' : `<p class="op-cb-note">${L('Only you see this score. It never changes where you show up in search.', 'Vous seul voyez ce pointage. Il ne change jamais votre position dans les recherches.')}</p>`}
      </div>
    </section>`;
}

const COMPLETENESS_CSS = `${BADGE_CSS}
    body.owner-page .op-cb-badge { margin: 0 16px 12px; padding: 10px 12px; border-radius: 12px; background: rgba(27,43,58,0.05); border: 1px solid rgba(27,43,58,0.12); }
    body.owner-page .op-cb-badge p { margin: 0 0 6px; font-weight: 700; }
    body.owner-page .op-cb-badge p:last-child { margin-bottom: 0; }
    body.owner-page .op-cb-badge-note { color: #5E544C; font-weight: 600 !important; font-size: .92rem; }
    body.owner-page .op-cb-badge-earned { background: #E3F1E8; border-color: rgba(30,107,58,0.25); }
    body.owner-page .op-cb-badge-paused { background: #FFF4DE; border-color: rgba(160,122,27,0.35); }
    body.owner-page .op-cb { margin: 14px 0 6px; background: #fff; border-radius: 16px; box-shadow: 0 1px 2px rgba(42,32,25,.06), 0 6px 18px rgba(42,32,25,.06); }
    body.owner-page .op-cb-head { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 44px; padding: 14px 16px; background: none; border: 0; border-radius: 16px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    body.owner-page .op-cb-ring { --p: 0; position: relative; flex: 0 0 60px; width: 60px; height: 60px; border-radius: 50%; --w: 0; background: conic-gradient(#2A6B67 calc(var(--p) * 1%), #E2A23B 0 calc(var(--w) * 1%), #EAE6D9 0); }
    body.owner-page .op-cb-back { display: block; margin: 12px 0 4px; }
    body.owner-page .op-cb-list-ico { flex: 0 0 auto; font-size: 30px; line-height: 1; }
    body.owner-page .op-desc-goal { margin-top: 2px; font-weight: 700; color: #67470C; }
    body.owner-page .op-desc-goal.op-desc-ok { color: #1E6B3A; }
    body.owner-page .op-copy-row { display: block; flex-basis: 100%; font-size: 0.84rem; color: rgba(42,32,25,0.8); margin-top: 6px; }
    body.owner-page .op-copy-row button { background: var(--sand-deep, #EFE6D6); border: 0; border-radius: 999px; padding: 5px 14px; min-height: 40px; margin: 2px 4px 2px 0; font: inherit; font-weight: 700; cursor: pointer; }
    body.owner-page #opHappy.op-hh-stable .op-day.is-off .op-times, body.owner-page #opHappy.op-hh-stable .op-day.is-off .op-copy-row { display: flex; visibility: hidden; }
    body.owner-page .op-file-previews { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    body.owner-page .op-file-previews img { width: 76px; height: 76px; object-fit: cover; border-radius: 10px; border: 1px solid rgba(42,32,25,.15); }
    body.owner-page .op-tips { margin: 0 0 10px; }
    body.owner-page .op-tips summary { cursor: pointer; font-weight: 700; color: #1E4F4C; min-height: 32px; }
    body.owner-page .op-toast { position: fixed; top: 10px; left: 12px; right: 12px; z-index: 60; max-width: 560px; margin: 0 auto; padding: 12px 14px; border-radius: 12px; background: #1E6B3A; color: #fff; font-weight: 700; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
    body.owner-page .op-toast[hidden] { display: none; }
    body.owner-page .op-save-sent { color: #67470C; background: #FFF6E3; }
    body.owner-page .op-cb-prov { margin: 0 16px 12px; padding: 10px 12px; border-radius: 10px; background: #FFF6E3; color: #4A3B32; font-size: .92rem; line-height: 1.4; }
    body.owner-page .op-cb-prov strong { color: #1B2B3A; }
    body.owner-page .op-cb-legend { display: block; margin-top: 4px; font-size: .82rem; color: #6B5D54; font-weight: 700; }
    body.owner-page .op-cb-key { display: inline-block; width: 10px; height: 10px; margin: 0 4px 0 0; border-radius: 50%; vertical-align: -1px; }
    body.owner-page .op-cb-key-done { background: #2A6B67; }
    body.owner-page .op-cb-key-wait { background: #E2A23B; margin-left: 10px; }
    body.owner-page .op-cb-ring::before { content: ""; position: absolute; inset: 7px; background: #fff; border-radius: 50%; }
    body.owner-page .op-cb-ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 1rem; font-weight: 800; color: #1E4F4C; }
    body.owner-page .op-cb-ring-100 b { font-size: .8rem; }
    body.owner-page .op-cb-title { display: block; min-width: 0; }
    body.owner-page .op-cb-title strong { display: block; font-size: 1.15rem; line-height: 1.2; color: #1B2B3A; }
    body.owner-page .op-cb-title span { display: block; margin-top: 2px; font-size: .92rem; color: #6B5D54; font-weight: 600; }
    body.owner-page .op-cb-chev { margin-left: auto; flex: none; width: 12px; height: 12px; border-right: 3px solid #1E4F4C; border-bottom: 3px solid #1E4F4C; transform: rotate(45deg); transition: transform .2s; }
    body.owner-page .op-cb-head[aria-expanded="true"] .op-cb-chev { transform: rotate(-135deg); }
    body.owner-page .op-cb-panel { padding: 4px 16px 16px; }
    body.owner-page .op-cb-panel h3 { margin: 14px 0 6px; font-size: 1.05rem; color: #1B2B3A; }
    body.owner-page .op-cb-list, body.owner-page .op-cb-soon { list-style: none; margin: 0; padding: 0; }
    body.owner-page .op-cb-row { display: grid; grid-template-columns: 36px 1fr; gap: 6px 12px; padding: 12px 0; border-top: 1px solid rgba(42,32,25,.1); }
    body.owner-page .op-cb-row:first-child { border-top: 0; }
    body.owner-page .op-cb-ico { width: 36px; height: 36px; border-radius: 10px; background: #F8EBCB; display: grid; place-items: center; font-size: 1.1rem; }
    body.owner-page .op-cb-txt strong { display: block; font-weight: 800; }
    body.owner-page .op-cb-txt span { display: block; color: #6B5D54; font-size: .9rem; font-weight: 600; }
    body.owner-page .op-cb-act { grid-column: 2; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    body.owner-page .op-cb-pts { padding: 3px 10px; border-radius: 999px; background: #F8EBCB; color: #67470C; font-size: .8rem; font-weight: 800; box-shadow: inset 0 0 0 1px #E6CF93; }
    body.owner-page .op-cb-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: #1E4F4C; color: #fff; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
    body.owner-page .op-cb-wait { color: #67470C; font-weight: 800; font-size: .88rem; }
    body.owner-page .op-cb-groups { display: grid; gap: 10px; }
    body.owner-page .op-cb-g { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; }
    body.owner-page .op-cb-g b { font-weight: 800; font-size: .95rem; }
    body.owner-page .op-cb-g.full b { color: #1E6B3A; }
    body.owner-page a.op-cb-g-link { color: inherit; text-decoration: none; min-height: 44px; padding: 4px 0; }
    body.owner-page a.op-cb-g-link .op-cb-g-chev { color: #1E4F4C; font-weight: 800; }
    body.owner-page .op-cb-g em { font-style: normal; color: #6B5D54; font-weight: 800; font-size: .85rem; }
    body.owner-page .op-cb-bar { grid-column: 1 / -1; height: 7px; background: #EAE6D9; border-radius: 99px; overflow: hidden; }
    body.owner-page .op-cb-bar i { display: block; height: 100%; background: #2A6B67; border-radius: 99px; }
    body.owner-page .op-cb-g.full .op-cb-bar i { background: #1E6B3A; }
    body.owner-page .op-cb-note { margin: 10px 0 0; color: #6B5D54; font-size: .85rem; font-weight: 600; }
    body.owner-page .op-cb-soon li { padding: 6px 0; font-size: .9rem; }
    body.owner-page .op-cb-soon li span { display: block; color: #6B5D54; font-weight: 600; }
    body.owner-page .op-cb-alt { grid-column: 2 / -1; }
    body.owner-page .op-cb-none, body.owner-page .op-cb-undo { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 1px solid rgba(42,32,25,.25); border-radius: 999px; background: #fff; color: #4A3B32; font: inherit; font-size: .9rem; font-weight: 700; text-align: left; cursor: pointer; }
    body.owner-page .op-cb-none:disabled, body.owner-page .op-cb-undo:disabled { opacity: .6; cursor: progress; }
    body.owner-page .op-cb-soon .op-cb-none { margin-top: 6px; }
    body.owner-page .op-cb-inline { margin: 8px 0 4px; }
    body.owner-page .op-cb-declined { list-style: none; margin: 0; padding: 0; }
    body.owner-page .op-cb-declined li { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid rgba(42,32,25,.1); }
    body.owner-page .op-cb-declined li:first-child { border-top: 0; }
    body.owner-page .op-cb-dtxt strong { display: block; font-weight: 800; }
    body.owner-page .op-cb-dtxt span { display: block; color: #1E6B3A; font-size: .88rem; font-weight: 800; }
    body.owner-page .op-cb-lead { margin: 0 0 6px; }
    body.owner-page .op-cb-txt .op-cb-val { margin-top: 4px; color: #1B2B3A; font-weight: 800; }
    body.owner-page .op-cb-act { flex-wrap: wrap; justify-content: flex-start; }
    body.owner-page .op-cb-link { min-height: 44px; padding: 0 12px; border: 0; background: none; color: #1E4F4C; font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer; }
    body.owner-page .op-cb-btn:disabled { opacity: .6; cursor: progress; }
    body.owner-page .op-cb-waiting .op-cb-sent { color: #67470C; }
    body.owner-page .op-cb-hl { outline: 3px solid #E9B949; outline-offset: 4px; border-radius: 8px; }
    body.owner-page .op-cb-yay { margin: 0 16px 14px; padding: 10px 12px; border-radius: 10px; background: #E7F3EC; color: #1E6B3A; font-weight: 800; }
    body.owner-page .op-cb-all, body.owner-page .op-cb-done { margin: 10px 0 0; }
    body.owner-page .op-cb-all > summary, body.owner-page .op-cb-done > summary { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; font-weight: 800; color: #1E4F4C; cursor: pointer; }
    body.owner-page .op-cb-done[open] > summary { margin-bottom: 6px; }
    body.owner-page .op-cb-see { margin: -6px 16px 12px; font-size: .9rem; font-weight: 700; }
    body.owner-page .op-cb-see a { color: #1E4F4C; }
    body.owner-page .op-cb-got { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-height: 44px; color: #1E6B3A; font-weight: 800; font-size: .92rem; }
    body.owner-page .op-cb-got .op-cb-undo { min-height: 36px; padding: 0 12px; }
    body.owner-page .op-cb-gotrow .op-cb-ico { background: none; }
    body.owner-page .op-cb-err { margin: 8px 0 0; padding: 10px 12px; border-radius: 10px; background: #FBE9E7; color: #8A2A1B; font-weight: 700; }
    @media (min-width: 900px) { body.owner-page .op-cb-row { grid-template-columns: 36px 1fr auto; align-items: center; } body.owner-page .op-cb-act { grid-column: 3; } }`;

// Runs inside the owner page script (setTask and TASK_OF are in scope there).
// Fresh-eyes fixes (2026-11-08):
//   - every answer saved from the bar ("We don't have one", Undo, "Yes, these are right", "Yes, that's right") saves in
//     place and redraws the bar from /completeness: no reload, so nothing the owner typed elsewhere is ever lost and the
//     browser never asks "Leave site?";
//   - jump buttons open the section, scroll the named field just under the header (no smooth-scroll drift), focus it
//     and highlight it for a moment;
//   - window.opCbRefresh() lets the page's other live saves (cuisine, Plan your visit, average spend) redraw the bar.
// No backslashes or regexes in here: this text is pasted into a template literal.
const COMPLETENESS_SCRIPT = `
  (function(){
    var sec = document.getElementById('opComplete'), tg = document.getElementById('opCbToggle'), pn = document.getElementById('opCbPanel');
    if (!sec || !tg || !pn) return;
    var canDecline = sec.hasAttribute('data-cb-declared');
    var declared = [];
    function readDeclared(){ try { declared = JSON.parse(sec.getAttribute('data-cb-declared') || '[]') || []; } catch (e) { declared = []; } }
    readDeclared();
    function setOpen(open){
      tg.setAttribute('aria-expanded', open ? 'true' : 'false'); pn.hidden = !open;
      var sb = document.getElementById('opCbSub');
      if (sb && sb.hasAttribute('data-opened')) sb.textContent = sb.getAttribute(open ? 'data-opened' : 'data-closed');
    }
    function storeKey(){ var lp = location.pathname; return 'opCbPct:' + (lp.indexOf('/fr/') === 0 ? lp.slice(3) : lp); }
    // Progress: when the score went up since this owner last saw it, say so once (with what was just saved, if any).
    // Only right after a save (final fresh-eyes 2026-11-09): on page load the score is just remembered.
    function progress(lead, quiet){
      var y = document.getElementById('opCbYay'); if (!y) return;
      var now = Number(sec.getAttribute('data-cb-pct')), msg = lead || '';
      try {
        var was = Number(sessionStorage.getItem(storeKey()) || localStorage.getItem(storeKey()));
        if (!quiet && was && now > was) msg = (msg ? msg + ' ' : '') + sec.getAttribute('data-cb-yay').split('{p}').join(String(now));
        sessionStorage.setItem(storeKey(), String(now)); localStorage.setItem(storeKey(), String(now));
      } catch (e) { /* storage off: only the lead */ }
      if (msg) { y.textContent = msg; y.hidden = false; }
    }
    progress('', true);
    try { if (sessionStorage.getItem('opCbOpen') === '1') { sessionStorage.removeItem('opCbOpen'); setOpen(true); } } catch (e) { /* storage off */ }
    // "We don't have one" next to the edit-page fields, placed under each field it answers.
    function placeInline(){
      Array.prototype.forEach.call(document.querySelectorAll('.op-cb-inline'), function(x){
        var gk = x.getAttribute('data-cb-gotkey');
        if (gk && declared.indexOf(gk) >= 0) return;
        x.parentNode.removeChild(x);
      });
      if (!canDecline) return;
      var inline = []; try { inline = JSON.parse(sec.getAttribute('data-cb-inline') || '[]') || []; } catch (e) { inline = []; }
      inline.forEach(function(x){
        var el = document.getElementById(x.id); if (!el || !el.parentNode) return;
        var p = document.createElement('p'); p.className = 'op-cb-inline';
        var b = document.createElement('button'); b.type = 'button'; b.className = 'op-cb-none'; b.setAttribute('data-cb-none', x.key); b.setAttribute('data-cb-got', x.got || ''); b.textContent = x.label;
        // A section (happy hour, specials, nights, badges) gets it inside, so it shows and hides with that section.
        p.appendChild(b); if (el.tagName === 'DETAILS') el.appendChild(p); else el.parentNode.insertBefore(p, el.nextSibling);
        // A box with something typed in it answers the question, so its "We're not on…" button steps aside.
        if (el.tagName === 'INPUT') { var sync = function(){ p.hidden = !!el.value.trim(); }; sync(); el.addEventListener('input', sync); }
      });
    }
    placeInline();
    // Jumps land on the field: open every enclosing section, put it just under the header, focus, highlight.
    function headerOffset(){
      var h = document.querySelector('header'); var off = 16;
      if (h) { var cs = getComputedStyle(h); if (cs.position === 'fixed' || cs.position === 'sticky') off += Math.max(0, h.getBoundingClientRect().bottom); }
      return off;
    }
    function jumpTo(id){
      var el = id ? document.getElementById(id) : null; if (!el) return;
      if (el.tagName === 'DETAILS') el.open = true;
      var d = el.parentElement ? el.parentElement.closest('details') : null;
      while (d) { d.open = true; d = d.parentElement ? d.parentElement.closest('details') : null; }
      var root = document.documentElement;
      // A text box lines up with its label, so the owner sees what it is for.
      var box = (el.matches('input,select,textarea') && el.closest('.form-field,.op-visit-field')) || el;
      var lb = el.getAttribute('aria-labelledby'); var lab = lb ? document.getElementById(lb) : null;
      function go(){
        var prev = root.style.scrollBehavior; root.style.scrollBehavior = 'auto';
        var top = box.getBoundingClientRect().top;
        if (lab && lab.getBoundingClientRect().height) top = Math.min(top, lab.getBoundingClientRect().top);
        window.scrollTo(0, Math.max(0, top + window.pageYOffset - headerOffset()));
        root.style.scrollBehavior = prev;
      }
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        go();
        var f = el.matches('input,select,textarea') ? el : null;
        if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
        el.classList.add('op-cb-hl'); setTimeout(function(){ el.classList.remove('op-cb-hl'); }, 1800);
        setTimeout(go, 300);
      }); });
    }
    window.opCbJump = jumpTo;
    // Photos (fresh-eyes 3, 2026-11-09): small previews of what was picked, before Upload (it only said "3 files").
    (function(){
      var f = document.getElementById('ofFiles'), box = document.getElementById('ofPreviews'); if (!f || !box || !window.URL) return;
      f.addEventListener('change', function(){
        while (box.firstChild) box.removeChild(box.firstChild);
        Array.prototype.slice.call(f.files || [], 0, 5).forEach(function(file){
          if (String(file.type).indexOf('image/') !== 0) return;
          var im = document.createElement('img'); im.alt = ''; im.src = URL.createObjectURL(file); im.onload = function(){ URL.revokeObjectURL(im.src); };
          box.appendChild(im);
        });
      });
      var form = document.getElementById('ofForm');
      if (form) form.addEventListener('reset', function(){ while (box.firstChild) box.removeChild(box.firstChild); });
    })();
    // Happy hour (fresh-eyes 3, 2026-11-09): any day copies to Mon–Fri or every day (Monday is usually "None", which
    // hid the old Monday-only copy), and a row keeps its height when "None" is unticked, so the next tap lands right.
    Array.prototype.forEach.call(document.querySelectorAll('#opHappy [data-copy-from]'), function(b){
      b.addEventListener('click', function(){
        var src = b.closest('.op-day'), list = Array.prototype.slice.call(document.querySelectorAll('#opHappy .op-day'));
        var st = src.querySelectorAll('.op-t'), two = !src.querySelector('.op-second').hidden && (st[2].value || st[3].value);
        list.slice(0, b.getAttribute('data-copy-from') === 'all' ? 7 : 5).forEach(function(row){
          if (row === src) return;
          row.querySelector('.op-off').checked = src.querySelector('.op-off').checked;
          var t = row.querySelectorAll('.op-t');
          for (var i = 0; i < 4; i++) t[i].value = (i < 2 || two) ? st[i].value : '';
          row.querySelector('.op-second').hidden = !two; row.querySelector('.op-add').hidden = !!two;
          if (typeof syncRow === 'function') syncRow(row);
        });
        if (typeof setListingDirty === 'function') setListingDirty(true);
        var note = b.parentNode.querySelector('.op-copy-done') || b.parentNode.appendChild(document.createElement('span'));
        note.className = 'op-copy-done'; note.textContent = (typeof T !== 'undefined' && T.copied) || 'Copied.';
      });
    });
    // Description (fresh-eyes 3, 2026-11-09): the cursor starts at the end of what's there, never in front of it, and a
    // line shows the progress toward the 120 characters the score asks for ("222/120 ✓").
    (function(){
      var d = document.getElementById('opDescription'), g = document.getElementById('opDescGoal'); if (!d) return;
      var first = true;
      d.addEventListener('focus', function(){ if (!first) return; first = false; var n = d.value.length; setTimeout(function(){ try { d.setSelectionRange(n, n); } catch (e) { /* not a text box */ } }, 0); });
      function goal(){ if (!g) return; var min = Number(g.getAttribute('data-min')) || 120, n = d.value.trim().length;
        g.textContent = (n >= min ? g.getAttribute('data-ok') : g.getAttribute('data-low')).split('{n}').join(String(n)).split('{min}').join(String(min)).split('{left}').join(String(Math.max(0, min - n)));
        g.classList.toggle('op-desc-ok', n >= min); }
      d.addEventListener('input', goal); goal();
    })();
    // "Got it: not on Facebook ✓ · Undo", built where the owner tapped.
    function gotEl(tag, key, text){
      var g = document.createElement(tag); g.className = (tag === 'li' ? 'op-cb-row ' : 'op-cb-inline ') + 'op-cb-gotrow';
      g.setAttribute('data-cb-gotkey', key);
      var sp = document.createElement('span'); sp.className = 'op-cb-got'; sp.setAttribute('role', 'status');
      var t = document.createElement('span'); t.textContent = text;
      var u = document.createElement('button'); u.type = 'button'; u.className = 'op-cb-undo'; u.setAttribute('data-cb-undo', key); u.textContent = sec.getAttribute('data-cb-undo-text') || 'Undo';
      sp.appendChild(t); sp.appendChild(u); g.appendChild(sp);
      if (tag === 'li') { var ic = document.createElement('span'); ic.className = 'op-cb-ico'; ic.setAttribute('aria-hidden', 'true'); g.insertBefore(ic, sp); }
      return g;
    }
    function quickKeys(){ return (sec.getAttribute('data-cb-quick') || '').split(' ').filter(function(k){ return k; }); }
    function val(id){ var e = document.getElementById(id); return e ? e.value : ''; }
    function post(changes){
      var body = { changes: changes, note: '', contact_name: val('opName'), contact_email: typeof emailVal === 'function' ? emailVal('opEmail') : val('opEmail'),
        company_website: val('opHp'), started_at: typeof startedAt !== 'undefined' ? startedAt : Date.now() };
      return fetch(location.pathname + '/changes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r){ return r.json(); });
    }
    function showErr(m){
      var err = document.getElementById('opCbErr');
      if (err) { err.textContent = m || sec.getAttribute('data-cb-wrong') || ''; err.hidden = false; setOpen(true); err.scrollIntoView({ block: 'center' }); }
    }
    // Redraw the bar from what is stored now. Keeps it open or shut, and the page view it was in.
    function refresh(lead, got){
      var oldQuick = quickKeys();
      return fetch(location.pathname + '/completeness', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
        .then(function(r){ return r.json(); })
        .then(function(j){
          if (!j || !j.ok || !j.html) return;
          var wasOpen = tg.getAttribute('aria-expanded') === 'true';
          var tmp = document.createElement('div'); tmp.innerHTML = j.html;
          var n = tmp.querySelector('#opComplete'); if (!n) return;
          n.className = sec.className;
          sec.parentNode.replaceChild(n, sec);
          sec = n; tg = document.getElementById('opCbToggle'); pn = document.getElementById('opCbPanel');
          readDeclared(); setOpen(wasOpen); placeInline();
          // The Got-it line goes back where the row was: before the row that came after it, or at the end of its list.
          if (got && got.text && declared.indexOf(got.key) >= 0) {
            var nb = got.next ? n.querySelector('[data-cb-item="' + got.next + '"]') : null;
            var g = gotEl('li', got.key, got.text);
            if (nb && nb.parentNode) nb.parentNode.insertBefore(g, nb);
            else { var lst = n.querySelector('.op-cb-list'); if (lst) lst.insertBefore(g, lst.firstChild); }
          }
          var added = quickKeys().filter(function(k){ return oldQuick.indexOf(k) < 0; }).length;
          var more = !oldQuick.length || !added ? '' : added === 1 ? sec.getAttribute('data-cb-more1') : (sec.getAttribute('data-cb-moren') || '').split('{n}').join(String(added));
          progress([lead || '', more || ''].filter(function(x){ return x; }).join(' '));
        })
        .catch(function(){ /* the bar just stays as it was */ });
    }
    window.opCbRefresh = refresh;
    function saveNone(list, btn){
      var err = document.getElementById('opCbErr'); if (err) err.hidden = true;
      btn.disabled = true;
      var key = btn.getAttribute('data-cb-none'), text = btn.getAttribute('data-cb-got') || '';
      var inlineP = btn.closest('.op-cb-inline'), row = btn.closest('[data-cb-item]');
      var next = row && row.nextElementSibling ? row.nextElementSibling.getAttribute('data-cb-item') : '';
      post({ not_offered: list }).then(function(j){
        if (j && j.ok) {
          declared = list;
          if (key && text && inlineP && inlineP.parentNode) inlineP.parentNode.replaceChild(gotEl('p', key, text), inlineP);
          return refresh('', key && text && row ? { key: key, text: text, next: next } : null);
        }
        btn.disabled = false;
        showErr((j && j.errors && (j.errors.not_offered || j.errors.form)) || (j && j.error));
      }).catch(function(){ btn.disabled = false; showErr(''); });
    }
    function saveOne(btn){
      var changes; try { changes = JSON.parse(btn.getAttribute('data-cb-save')); } catch (e) { return; }
      var err = document.getElementById('opCbErr'); if (err) err.hidden = true;
      btn.disabled = true;
      post(changes).then(function(j){
        if (j && j.ok) {
          // Keep the matching boxes further down the page in step.
          if (changes.hours_checked) {
            var hb = document.getElementById('opHoursOkBtn'), hn = document.getElementById('opHoursOkNote'), hd = document.getElementById('opHoursOkDone'), hx = document.getElementById('opHoursOk');
            if (hb) hb.hidden = true; if (hn) hn.hidden = true; if (hd && hx) { hd.textContent = hx.getAttribute('data-done'); hd.hidden = false; }
          }
          if (changes.avg_spend && typeof avgSaved === 'function') avgSaved(Number(changes.avg_spend));
          return refresh(btn.getAttribute('data-cb-done') || '');
        }
        btn.disabled = false;
        var e2 = (j && j.errors) || {};
        showErr(e2.hours_checked || e2.avg_spend || e2.form || (j && j.error));
      }).catch(function(){ btn.disabled = false; showErr(''); });
    }
    document.addEventListener('click', function(e){
      if (!e.target.closest) return;
      // "Back to the list" (final fresh-eyes 2026-11-09): the card is redrawn, so anything sent meanwhile shows as waiting.
      var pk = e.target.closest('[data-pick]');
      // "Done, back to my list" (fresh-eyes 3, 2026-11-09): back to the card, open, with the updated score in view.
      // Instant, not smooth (the page scrolls smoothly, and two smooth scrolls at once stop half way).
      var toCard = function(){ setOpen(true); var root = document.documentElement, prev = root.style.scrollBehavior; root.style.scrollBehavior = 'auto';
        window.scrollTo({ top: Math.max(0, sec.getBoundingClientRect().top + window.pageYOffset - headerOffset()), behavior: 'instant' }); root.style.scrollBehavior = prev; };
      if (pk && pk.hasAttribute('data-cb-back')) { setTimeout(toCard, 60); refresh('').then(toCard); }
      else if (pk && !pk.getAttribute('data-pick')) refresh('');
      if (e.target.closest('#opCbToggle')) { setOpen(tg.getAttribute('aria-expanded') !== 'true'); return; }
      var j = e.target.closest('#opComplete [data-cb-task]');
      if (j) { setTask(j.getAttribute('data-cb-task')); jumpTo(j.getAttribute('data-cb-id')); return; }
      var sv = e.target.closest('#opComplete [data-cb-save]');
      if (sv) { saveOne(sv); return; }
      var b = e.target.closest('[data-cb-none],[data-cb-undo]'); if (!b || !canDecline) return;
      var k = b.getAttribute('data-cb-none');
      if (k) { if (declared.indexOf(k) < 0) saveNone(declared.concat([k]), b); return; }
      k = b.getAttribute('data-cb-undo');
      saveNone(declared.filter(function(x){ return x !== k; }), b);
    });
  })();`;

// Brewery test 3 (2026-11-13): every French line of the checklist with French typography (a no-break space before « : »,
// a narrow one before « ? » and « ! »), the same helper as the setup and the help (owner-setup-text.js frSpacing).
(function frCopy(list) {
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if (typeof o[k] === 'string' && (k === 'fr' || /Fr(?:[A-Z]\w*)?$/.test(k))) o[k] = frSpacing(o[k]); else if (o[k] && typeof o[k] === 'object') walk(o[k]); } };
  list.forEach(walk);
})([ITEMS, PUB_ITEMS, CAFE_ITEMS, WINERY_ITEMS, BREWERY_ITEMS, GROUPS, GOT_TEXT, HAPPY_HOUR_BADGE_COPY, MENU_SAME_SITE_COPY]);
module.exports = { BREWERY_ITEMS, BREWERY_KINDS, BREWERY_FOOD, BREWERY_TO_GO, BREWERY_YEAR, QUICK_FIELD_BY_TYPE, quickFieldFor, WINERY_ITEMS, WINERY_KINDS, WINERY_FOOD, WINERY_VISIT, WINERY_YEAR, OPTIONAL_NONE_KEYS, CAFE_ITEMS, CAFE_KINDS, CAFE_SERVES, CAFE_LAPTOPS, CAFE_SEATS, ALL_NONE_KEYS, PUB_ITEMS, itemsFor, noneKeysFor, PUB_KITCHEN_MODES, PUB_MINORS_POLICIES, PUB_GAME_KEYS, badgeState, badgeChipHtml, BADGE_LABEL, BADGE_CSS, QUICK_FIELD, GOT_TEXT, sameAddress, MENU_SAME_SITE_COPY, LATER_SHOWN, HAPPY_HOUR_BADGE_COPY, CEILING_KEYS, ITEMS, GROUPS, NONE_KEYS, NONE_MAX, SECONDS, minutesLeft, hoursLine, QUICK_SECONDS, QUICK_CAP_SECONDS, isQuick, doneMap, HOURS_FRESH_DAYS, DESCRIPTION_MIN, PHOTOS_MIN, scoreCompleteness, renderCompleteness, COMPLETENESS_CSS, COMPLETENESS_SCRIPT };
