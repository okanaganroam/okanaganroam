// Sport test 11 (2026-11-21): every question Geneviève typed into Help (the one suggestion tap left out), labelled on the
// merits. Geneviève is the director of golf operations of the Vernon Golf & Country Club (semi-private, 18 holes, a driving
// range and a Trackman simulator that runs January to March, outside her Apr 3 – Oct 31 golf season, tee times booked
// ahead); French first, she typed 22 of them in French (drafts/fresh-eyes-sport11-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm]. ok: the topics that answer it well; UNSURE in ok: "I'm not sure,
// Ask us" is a fine outcome. harm: answers that point her the wrong way.
// HELD: 30 French owner questions written for this round across every golf screen, held out from any tuning (not used to
// change Help): they are counted, never fixed one by one. Run by tests/sport-test11-fixes.test.js (and her log by
// tests/help-heldout.test.js).
'use strict';
const SRC = {
  sport11: { type: 'golf', kinds: ['golf', 'range', 'simgolf'], book: 'ahead', price: 75, season: '04-03:10-31', length: 'half' },
};
const Q = [
  ["sport11","edit","fr","Bonjour! Je suis la directrice des opérations golf au club. Le terrain est fermé pour l'hiver mais notre simulateur Trackman intérieur ouvre en janvier, du lundi au samedi de 9 h à 21 h. Est-ce que je peux mettre ça sur notre page sans mélanger les golfeurs?",["sport-offseason-other","sport-part-season"],["sport-season-says"]],
  ["sport11","edit","fr","C'est vraiment gratuit? On reçoit souvent des appels de compagnies qui veulent nous vendre de la publicité.",["indoor-cost","cost","scam"],[]],
  ["sport11","setup","fr","Le numéro principal est bon. Mais l'hiver, pour réserver le simulateur, c'est un autre numéro : 250-542-9126. Où est-ce que je mets ce deuxième numéro?",["phone"],[]],
  ["sport11","setup","fr","En saison, la boutique du pro ouvre de 7 h à 19 h tous les jours, et en juillet-août c'est de 6 h 30 à 20 h 30. Le champ de pratique ouvre 30 minutes avant le premier départ. Quelles heures je dois mettre ici?",["indoor-summer-daily","seasonal-hours","sport-first-tee","hours-third-stretch"],[]],
  ["sport11","setup","fr","Le parcours ouvre vers le 3 avril et ferme le 31 octobre. Mais de janvier à mars, notre simulateur intérieur est ouvert du lundi au samedi, de 9 h à 21 h. Je choisis « fermé une partie de l'année » ou « heures différentes l'hiver »?",["sport-offseason-other"],["sport-sister-listing"]],
  ["sport11","setup","fr","Le simulateur Trackman, c'est seulement de janvier à mars. Si je coche « Golf intérieur ou simulateurs », est-ce que les gens vont penser qu'on l'offre en plein été?",["sport-offseason-other","sport-sister-listing"],[]],
  ["sport11","setup","fr","Nos tarifs 2027 ne sont pas encore approuvés par le conseil. En 2026 c'était 139 $ le 18 trous le matin, 99 $ l'après-midi, 75 $ au crépuscule, et 75 $ pour le 9 trous après 16 h. Lequel j'écris ici?",["sport-rates-next-year","indoor-price","sport-card-price"],["seasonal-hours","hours-third-stretch"]],
  ["sport11","setup","fr","Nous sommes semi-privés : les membres ont la priorité, et les visiteurs réservent en ligne sur notre feuille de départs publique jusqu'à 3 jours d'avance. Je choisis quoi ici?",["sport-book-ahead-hours","sport-tee-times","sport-members","indoor-booking"],[]],
  ["sport11","setup","fr","Le club appartient à ses membres depuis les années 60, ce n'est pas une compagnie. Est-ce que ça compte comme « Propriété locale »?",["indoor-local-owned"],[]],
  ["sport11","setup","fr","Nos belles photos ont été prises par un photographe engagé par le club. On a les droits. Est-ce que je peux mettre son nom en crédit sous la photo?",["photo-credit","UNSURE"],[]],
  ["sport11","menu","fr","J'ai tapé tous nos tarifs en français. Les golfeurs anglophones vont les voir en anglais, ou en français comme je les ai écrits?",["indoor-french"],["french"]],
  ["sport11","setup","fr","La ligne « Pour quoi êtes-vous connus » dit « Private-club », mais on est semi-privé, ouvert au public. Si je la réécris en français, est-ce que la page anglaise va rester vide?",["indoor-french"],["french"]],
  ["sport11","setup","fr","Je veux que les gens sachent qu'il faut réserver le simulateur par téléphone l'hiver, et qu'on a un code vestimentaire. Je mets tout ça ici, ou ailleurs?",["sport-dress-code","indoor-good-to-know","sport-offseason-other"],[]],
  ["sport11","setup","en","Our clubhouse books Christmas parties and weddings all winter, even when the course is closed. If the page says closed for the season, will people think they can't book an event?",["sport-offseason-events","UNSURE"],["sport-season-says"]],
  ["sport11","setup","fr","Le club de golf comme tel n'a pas de 5 à 7. Par contre, le restaurant 1913 fait des soupers spéciaux le vendredi soir en saison. Qu'est-ce que je réponds ici?",["sport-hh-none-specials"],["hh-deals","hh-times","indoor-bar","sport-social-hour","setup-happy-split","hh-some-months"]],
  ["sport11","setup","fr","Notre championnat de club ferme le terrain au public deux jours, le samedi 14 et le dimanche 15 août 2027. Comment je l'ajoute?",["sport-one-off-closure","closures","setup-short-closure"],["sport-season","indoor-closed-months","season","indoor-seasonal"]],
  ["sport11","edit","fr","J'ai appuyé sur « Créer mon compte » et j'ai eu une page blanche qui dit Not found. Est-ce que mon compte a marché?",["login-not-found","UNSURE"],["menu-website"]],
  ["sport11","edit","fr","Notre pro principal voudrait publier lui-même les dates de ses cliniques. Est-ce qu'il peut avoir son propre accès, sans mon mot de passe?",["staff","login-create","access"],[]],
  ["sport11","edit","fr","Comment je fais pour voir notre page comme un golfeur la voit?",["see-page"],[]],
  ["sport11","edit","fr","J'ai commencé sur mon cellulaire. Demain au bureau, je peux continuer sur l'ordinateur?",["resume-device"],[]],
  ["sport11","edit","fr","Est-ce que ça nous coûte quelque chose si des golfeurs réservent un départ après nous avoir trouvés chez vous?",["indoor-cost","cost"],[]],
  ["sport11","edit","fr","Nos tarifs 2027 sortent en mars. Comment je les change à ce moment-là?",["sport-rate-change","sport-rates-next-year"],[]],
  ["sport11","edit","fr","L'hiver, quand le terrain est fermé, est-ce que notre page apparaît encore quand quelqu'un cherche du golf à Vernon?",["sport-season-says"],[]],
  ["sport11","edit","fr","Will the lines I wrote in French show up on the English page, or do I have to write them twice?",["indoor-french"],["french"]],
];
const HELD = [
  ["sport11","setup","fr","Notre adresse sur votre site dit seulement Kalamalka Lake Road, sans le numéro civique. Comment je la corrige?",["name-address"],[]],
  ["sport11","setup","fr","Le nom officiel c'est Vernon Golf & Country Club, mais tout le monde dit « le Vernon G&CC ». Je mets lequel?",["name-address","UNSURE"],[]],
  ["sport11","setup","fr","On a un poste pour la boutique du pro, le 2. Je l'écris où?",["phone"],[]],
  ["sport11","setup","fr","Le premier départ est à 6 h 30 l'été mais la boutique ouvre à 7 h. Quelle heure j'inscris comme ouverture?",["sport-first-tee","sport-dawn-dusk","hours"],["closures","sport-one-off-closure"]],
  ["sport11","setup","fr","Le dernier départ pour 18 trous est à 15 h, mais on reste ouvert jusqu'à 19 h. Est-ce que je mets 15 h ou 19 h?",["sport-last-booking","sport-first-tee","sport-dawn-dusk","hours"],[]],
  ["sport11","setup","fr","Notre date d'ouverture dépend de la neige. Parfois c'est fin mars, parfois mi-avril. Qu'est-ce que je mets?",["sport-opening-day","sport-season","season","sport-weather"],[]],
  ["sport11","setup","fr","On ferme le jour de Noël et le 1er janvier pour le restaurant, mais le terrain est déjà fermé. Je dois les ajouter?",["sport-season-says","shows-closed","sport-holiday-short","UNSURE"],["sport-one-off-closure"]],
  ["sport11","setup","fr","Chaque mois de mai on fait l'aération des verts pendant deux jours. Le terrain reste ouvert mais à prix réduit. Je l'indique où?",["sport-aeration"],["closures","sport-one-off-closure","setup-short-closure"]],
  ["sport11","setup","fr","Le tournoi des membres du mois de juin ferme le parcours un samedi. La date change chaque année. Comment je fais?",["sport-one-off-closure","closures","sport-closures-yearly","setup-short-closure"],["sport-season","season","indoor-closed-months"]],
  ["sport11","setup","fr","Est-ce que je devrais aussi cocher « Champ de pratique »? Il est seulement pour ceux qui jouent ce jour-là.",["sport-no-range","sport-kinds-other","sport-members","indoor-kinds-many","UNSURE"],[]],
  ["sport11","setup","fr","On a un mini-putt pour les enfants à côté du club-house. Je peux l'ajouter comme troisième genre?",["indoor-kinds-many","sport-kinds-other","sport-second-kind","UNSURE"],[]],
  ["sport11","setup","fr","Le prix change selon l'heure : 139 $ le matin et 75 $ au crépuscule. Lequel va dans la case du prix?",["indoor-price","sport-card-price","sport-twilight-times","indoor-price-varies"],["seasonal-hours","hours-third-stretch"]],
  ["sport11","setup","fr","Est-ce que les taxes sont incluses dans le prix que j'inscris, ou je dois mettre le prix avant taxes?",["sport-tax"],[]],
  ["sport11","setup","fr","Les membres ne paient pas de droit de jeu. Je dois mettre un prix quand même?",["sport-member-rates","indoor-price","sport-public"],[]],
  ["sport11","setup","fr","Notre feuille de départs en ligne, c'est sur chronogolf. Je colle le lien ici?",["sport-booking-link","booking-link","sport-tee-times"],[]],
  ["sport11","setup","fr","Les visiteurs peuvent réserver 3 jours à l'avance, les membres 7 jours. Je l'écris où?",["sport-book-ahead-hours","sport-members","indoor-booking","sport-tee-times"],[]],
  ["sport11","setup","fr","Les chiens ne sont pas permis sur le parcours, sauf les chiens d'assistance. Est-ce que je coche quelque chose?",["sport-dogs"],[]],
  ["sport11","setup","fr","Il y a des bornes de recharge pour voitures électriques dans notre stationnement. Ça va où?",["indoor-good-to-know","features","parking-free","UNSURE"],[]],
  ["sport11","setup","fr","Combien de photos je peux mettre au maximum?",["photo-add","photo-order","photo-main"],[]],
  ["sport11","setup","fr","Ma photo du 18e trou est coupée sur ma fiche, on ne voit pas le lac. Comment je la replace?",["photo-position","photo-main"],[]],
  ["sport11","setup","fr","Est-ce que je peux mettre des photos des membres qui jouent? Je n'ai pas demandé la permission à tout le monde.",["sport-photo-consent","photo-rights"],[]],
  ["sport11","setup","fr","Notre histoire actuelle parle d'un club privé. On est semi-privé depuis 2019. Je réécris tout ou j'ajoute une phrase?",["description","sport-public","indoor-old-line","UNSURE"],[]],
  ["sport11","setup","fr","Je veux dire qu'on a un pro de la PGA qui donne des cours. Je mets ça dans l'histoire ou ailleurs?",["sport-lessons","indoor-good-to-know","description"],[]],
  ["sport11","setup","fr","On loue des voiturettes et des bâtons. Est-ce que je les mets dans Bon à savoir ou dans les tarifs?",["sport-rentals","indoor-extras","sport-rate-lines"],[]],
  ["sport11","setup","fr","On peut accueillir des tournois de compagnie jusqu'à 144 golfeurs. Je l'écris où?",["sport-tournaments","indoor-groups","indoor-book-party"],[]],
  ["sport11","menu","fr","Je veux ajouter le tarif junior, 45 $, mais seulement pour les moins de 18 ans. Comment j'écris l'âge sur la ligne?",["sport-line-ages","indoor-line-age","sport-rate-lines"],[]],
  ["sport11","menu","fr","La voiturette, c'est 27 $ par personne. Je mets « par personne » dans le nom ou dans les détails?",["sport-per-person","sport-rate-lines","menu-add"],[]],
  ["sport11","edit","fr","Comment j'enlève un ancien tarif qui n'existe plus sur notre liste?",["menu-change","sport-golf-details","indoor-old-line","sport-rate-lines"],[]],
  ["sport11","edit","fr","J'ai oublié mon mot de passe. Je fais quoi?",["forgot","signin"],[]],
  ["sport11","edit","fr","Combien de temps avant que mes changements paraissent sur la page?",["live-speed","setup-live-when","changes-review"],[]],
];
module.exports = { SRC, Q, HELD };
