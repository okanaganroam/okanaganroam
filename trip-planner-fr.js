'use strict';

// ---------- Build My Trip: French requests (2026-10-04) ----------
//
// The planner's interpreter (discovery-intent.js) reads English. A French
// request ("3 jours à Whistler avec des microbrasseries") is rewritten here, word for
// word and phrase for phrase, into the English the interpreter already
// understands ("3 days in whistler with some breweries"); everything after that
// is the same deterministic planner, so a French request can only reach the
// places, rules and facts an English one can.
//
// Only POST /api/trip/plan uses this (runTripPlan() in server.js); site search
// and /browse are unchanged. A request that is not recognised as French is
// returned exactly as given -- the same string -- so every English request
// plans byte-for-byte as before. A venue's own name inside a French request
// ("souper au Le Petit Bistro") is never translated.

const SITE_FRENCH = require('./trip-site.js').frenchRequests;
const SITE_FRENCH_PLACES = SITE_FRENCH.places;
const SITE_FRENCH_LAKES = SITE_FRENCH.lakes;
const di = require('./discovery-intent.js');

// Unmistakably French words: one is enough. (Words English visitors also
// type -- pour, propose, organise, distilleries, belvedere -- are left out.)
const STRONG = new Set(('helicoptere helicopteres motoneige motoneiges pres chutes grimpeurs grimpeuses ours aigles saumons tyrolienne tyroliennes nocturne arrets musee musees evasion guidee guidees visites atelier ateliers obligatoire obligatoirement seulement vegetarien vegetariens vegetarienne vegetariennes avec jours journee journees enfants enfant chien chiens chienne vignoble vignobles vin vins souper soupers '
  + 'nouvel reveillon valentin paques magasinage magasiner boutiques librairie equitation promenade skateparc planchodrome randonnee randonnees rando plage plages pluie pleut pluvieux pluvieuse semaine nous je quoi faire voudrais voudrions '
  + 'aimerais aimerions cherche cherchons sejour itineraire activites demain aujourdhui lundi mardi mercredi jeudi '
  + 'vendredi samedi dimanche janvier fevrier avril juin juillet aout septembre octobre novembre decembre hiver printemps '
  + 'automne biere bieres cidre cidres microbrasserie microbrasseries degustation terrasse terrasses lac velo raquette raquettes baignade '
  + 'sentier sentiers famille amoureux romantique tranquille relaxe meilleurs meilleures meilleur endroits '
  + 'resto restos bouffe manger dejeuner deux trois quatre cinq huit dix planifie planifiez planifier organisez '
  + 'suggere suggerez recommande recommandez proposez vignes cave caves vinerie vineries distillerie spiritueux '
  + 'nager peche plein exterieur interieur matin soir midi nuits beaucoup quelques sans pas une vue parcs joyaux favoris locaux '
  + 'chers cheres filles gars amis anniversaire musique planche pagaie voiture voitures auto pied conduite '
  // 2026-10-18: "un week-end vinicole", "où les chiens sont acceptés" (ouu is the tokenizer's où).
  + 'vinicole vinicoles viticole viticoles oenologique acceptes admis bienvenus ouu '
  // Search gaps (2026-10-18): "végétalien whistler" and "abordable squamish" were read as unknown words.
  + 'vegetalien vegetalienne vegetaliens vegetaliennes vegane veganes abordable abordables').split(' '));
// Common French function words: two different ones are needed.
const WEAK = new Set(('le la les l des du de d un une et ou au aux en dans sur chez pour mon ma mes nos notre votre vos est sont '
  + 'que qui ce cette ces il y').split(' '));
// Of the STRONG words, the ones that are also English words some visitors type.
const STRONG_ENGLISH_TOO = new Set(['cave', 'caves', 'plein', 'peche']);
// French search words (2026-10-18): on a French page, a request with one of these is French too. They are left out
// of STRONG because an English visitor may type "brasserie" (a restaurant) or "distilleries" in the planner.
const STRONG_ON_FRENCH_PAGE = new Set(['brasserie', 'brasseries', 'cidrerie', 'cidreries', 'distillerie', 'distilleries']);

// French -> English, longest phrase first at every position. Values are the
// interpreter's own English phrases (discovery-intent.js), so nothing here
// can introduce a meaning the planner does not already have. '' drops a word.
const PHRASES = [
  ['salle d evasion', 'escape room'], ['salles d evasion', 'escape rooms'],
  ['jeu d evasion', 'escape room'], ['jeux d evasion', 'escape rooms'],
  // Tour test 4 (Whistler, 2026-11-17): « visite gourmande » was searched for as the word « gourmande ». A food tour, and
  // the walking tours (« visite à pied », « marche des lumières », « marche historique », « visite fantôme »).
  ['visite gourmande', 'food tour'], ['visites gourmandes', 'food tours'], ['tournee gourmande', 'food tour'], ['tournees gourmandes', 'food tours'],
  ['visite culinaire', 'food tour'], ['visites culinaires', 'food tours'], ['tournee culinaire', 'food tour'], ['circuit gourmand', 'food tour'], ['circuits gourmands', 'food tours'],
  ['tour gourmand', 'food tour'], ['tours gourmands', 'food tours'], ['visite gastronomique', 'food tour'], ['visites gastronomiques', 'food tours'],
  ['visite guidee a pied', 'walking tour'], ['visites guidees a pied', 'walking tours'], ['visite a pied', 'walking tour'], ['visites a pied', 'walking tours'],
  ['tour a pied', 'walking tour'], ['tours a pied', 'walking tours'], ['marche des lumieres', 'lights walk'], ['marche aux lumieres', 'lights walk'], ['marche de nuit', 'night walk'], ['marche nocturne', 'night walk'],
  ['marche historique', 'history walk'], ['marches historiques', 'history walks'], ['visite historique', 'history tour'], ['visites historiques', 'history tours'],
  ['visite fantome', 'ghost tour'], ['visite des fantomes', 'ghost tour'], ['marche des fantomes', 'ghost walk'], ['marche fantome', 'ghost walk'],
  ['visite guidee', 'guided tour'], ['visites guidees', 'guided tours'],
  ['cours de cuisine', 'cooking class'], ['cours de cuisines', 'cooking classes'],
  ['atelier de poterie', 'pottery class'], ['cours de poterie', 'pottery class'],
  ['atelier de ceramique', 'pottery class'], ['cours de ceramique', 'pottery class'],
  ['galerie d art', 'art gallery'], ['galeries d art', 'art galleries'],
  ['musee', 'museum'], ['musees', 'museums'], ['galerie', 'gallery'], ['galeries', 'galleries'],
  ['salle d escalade', 'climbing gym'], ['quilles', 'bowling'], ['cinema', 'cinema'],
  ['obligatoirement', 'must'], ['obligatoire', 'must'], ['seulement', 'only'], ['idealement', 'ideally'],
  ['repas vegetariens', 'vegetarian meals'], ['repas vegetariens seulement', 'only vegetarian meals'],
  ['jour 1', 'day 1'], ['jour 2', 'day 2'], ['jour 3', 'day 3'], ['jour 4', 'day 4'],

  // 2026-10-18: wine, dogs, "par jour" and "où" from the site review's French requests.
  ['week end vinicole', 'wine weekend'], ['weekend vinicole', 'wine weekend'], ['fin de semaine vinicole', 'wine weekend'],
  ['sejour vinicole', 'wine trip'], ['voyage vinicole', 'wine trip'], ['escapade vinicole', 'wine getaway'], ['circuit vinicole', 'wine tour'],
  ['region vinicole', 'wine country'], ['vinicole', 'wine'], ['vinicoles', 'wine'], ['viticole', 'wine'], ['viticoles', 'wine'], ['oenologique', 'wine'],
  ['week end de ski', 'ski weekend'], ['fin de semaine de ski', 'ski weekend'], ['sejour de ski', 'ski trip'], ['voyage de ski', 'ski trip'],
  ['pendant', 'for'], ['durant', 'for'], ['par jour', 'a day'], ['chaque jour', 'each day'], ['par journee', 'a day'],
  ['les chiens sont acceptes', 'dogs allowed'], ['chiens sont acceptes', 'dogs allowed'], ['les chiens sont admis', 'dogs allowed'], ['chiens sont admis', 'dogs allowed'],
  ['les chiens sont les bienvenus', 'dogs welcome'], ['chiens sont les bienvenus', 'dogs welcome'], ['les chiens sont bienvenus', 'dogs welcome'], ['chiens sont bienvenus', 'dogs welcome'],
  ['chiens acceptes', 'dogs allowed'], ['chiens admis', 'dogs allowed'], ['chiens bienvenus', 'dogs welcome'], ['chiens permis', 'dogs allowed'],
  ['acceptes', 'allowed'], ['admis', 'allowed'], ['bienvenus', 'welcome'], ['bienvenue', 'welcome'],
  ['ouu manger', 'places to eat'], ['ouu aller', 'places to go'], ['ouu vont les gens du coin', 'where locals go'], ['ouu vont les locaux', 'where locals go'], ['ouu', ''],
  ['jours de pluie', 'rainy days'], ['un jour de pluie', 'a rainy day'],

  // length
  ['longue fin de semaine', 'long weekend'], ['fin de semaine prolongee', 'long weekend'], ['long week end', 'long weekend'],
  ['cette fin de semaine', 'this weekend'], ['ce week end', 'this weekend'], ['ce weekend', 'this weekend'],
  ['la fin de semaine prochaine', 'next weekend'], ['le week end prochain', 'next weekend'], ['la semaine prochaine', 'next week'],
  ['fin de semaine', 'weekend'], ['week end', 'weekend'], ['fins de semaine', 'weekends'],
  ['excursion d une journee', 'day trip'], ['sortie d une journee', 'day trip'], ['excursion de la journee', 'day trip'],
  ['une semaine complete', 'a week'], ['toute la semaine', 'a week'], ['une semaine', 'a week'], ['cette semaine', 'this week'],
  ['jour', 'day'], ['jours', 'days'], ['journee', 'day'], ['journees', 'days'], ['nuit', 'night'], ['nuits', 'nights'],
  ['un', 'a'], ['une', 'a'], ['deux', 'two'], ['trois', 'three'], ['quatre', 'four'], ['cinq', 'five'], ['sept', 'seven'],
  ['huit', 'eight'], ['neuf', 'nine'], ['dix', 'ten'],
  // Round 14 (2026-10-20): « une journée vins à Pemberton » is a wine day (it read "a day wines in Pemberton" and planned one
  // winery between a bakery and a Thai lunch).
  ['journee vins', 'wine day'], ['journee vin', 'wine day'], ['journee de vins', 'wine day'], ['journee des vins', 'wine day'], ['journee du vin', 'wine day'],
  ['journee vignobles', 'wineries day'], ['journee des vignobles', 'wineries day'], ['journee dans les vignobles', 'wineries day'],
  ['week end vins', 'wine weekend'], ['week end vin', 'wine weekend'], ['week end des vins', 'wine weekend'], ['fin de semaine vins', 'wine weekend'],
  // pace (a French adjective follows its noun: "une journée relaxe")
  ['journee relaxe', 'relaxed day'], ['journee tranquille', 'relaxed day'], ['journee detente', 'relaxed day'],
  ['journee de detente', 'relaxed day'], ['jour de detente', 'relaxed day'], ['journee relax', 'relaxed day'],
  ['journee chargee', 'packed day'], ['journee bien remplie', 'packed day'],
  ['jours relaxes', 'relaxed days'], ['jours tranquilles', 'relaxed days'], ['jours charges', 'packed days'],
  ['sans se presser', 'relaxed'], ['au ralenti', 'relaxed'], ['en douceur', 'relaxed'], ['a fond', 'packed'],
  ['relaxe', 'relaxed'], ['relaxes', 'relaxed'], ['relax', 'relaxed'], ['tranquille', 'relaxed'], ['tranquilles', 'relaxed'],
  ['decontracte', 'relaxed'], ['decontractee', 'relaxed'], ['calme', 'relaxed'], ['lentement', 'slow'],
  ['charge', 'packed'], ['chargee', 'packed'], ['charges', 'packed'], ['bien rempli', 'packed'], ['bien remplie', 'packed'],
  ['intense', 'packed'], ['equilibre', 'balanced'], ['equilibree', 'balanced'],
  // weather
  ['si il pleut', 'if it rains'], ['quand il pleut', 'when it rains'], ['sous la pluie', 'in the rain'], ['il pleut', 'it rains'],
  ['jour de pluie', 'rainy day'], ['journee de pluie', 'rainy day'], ['journee pluvieuse', 'rainy day'], ['jour pluvieux', 'rainy day'],
  ['jours de pluie', 'rainy days'], ['mauvais temps', 'wet weather'], ['a l interieur', 'indoors'], ['a le interieur', 'indoors'],
  ['pluie', 'rain'], ['pluvieux', 'rainy'], ['pluvieuse', 'rainy'], ['interieur', 'indoor'], ['interieurs', 'indoor'],
  // time
  ['a partir du', 'from'],
  ['heures', 'hours'], ['heure', 'hour'],
  ['aujourdhui', 'today'], ['aujourd hui', 'today'], ['ce matin', 'this morning'], ['cet apres midi', 'this afternoon'],
  ['ce soir', 'tonight'], ['demain', 'tomorrow'], ['maintenant', 'right now'], ['en ce moment', 'right now'],
  ['tout de suite', 'right now'], ['ce mois ci', 'this month'], ['ce mois', 'this month'],
  ['une matinee', 'a morning'], ['la matinee', 'the morning'], ['matinee', 'morning'], ['le matin', 'in the morning'], ['en matinee', 'in the morning'], ['matin', 'morning'],
  ['l apres midi', 'in the afternoon'], ['le apres midi', 'in the afternoon'], ['en apres midi', 'in the afternoon'], ['apres midi', 'afternoon'],
  // 2026-10-19: "les soirs" (every evening of the trip), as distinct from "le soir".
  ['les soirs', 'in the evenings'], ['en soirees', 'in the evenings'], ['soirs', 'evenings'], ['soirees', 'evenings'],
  ['le soir', 'in the evening'], ['en soiree', 'in the evening'], ['soir', 'evening'], ['soiree', 'evening'], ['la nuit', 'at night'],
  ['pendant la journee', 'during the day'], ['de jour', 'by day'],
  ['lundi', 'monday'], ['mardi', 'tuesday'], ['mercredi', 'wednesday'], ['jeudi', 'thursday'], ['vendredi', 'friday'],
  ['samedi', 'saturday'], ['dimanche', 'sunday'],
  ['en mai', 'in may'], ['mai', 'in may'], ['janvier', 'january'], ['fevrier', 'february'], ['mars', 'march'], ['avril', 'april'],
  ['juin', 'june'], ['juillet', 'july'], ['aout', 'august'], ['septembre', 'september'], ['octobre', 'october'],
  ['novembre', 'november'], ['decembre', 'december'],
  // Round 12 (2026-10-20): « le 1er novembre » is the 1st (« 1er » was read as an interest), and « à travers
  // la région Sea to Sky » is "through" (« travers » was an interest: a road trip of meals only).
  // Whistler fork: « la région Sea to Sky » / « le corridor Sea to Sky » mean the whole corridor (no region filter).
  ...SITE_FRENCH_PLACES,
  ['1er', '1'], ['1re', '1'], ['a travers', 'through'], ['au travers de', 'through'], ['au travers du', 'through the'], ['travers', 'through'],
  ['cet hiver', 'this winter'], ['en hiver', 'in winter'], ['hiver', 'winter'], ['ce printemps', 'this spring'],
  ['au printemps', 'in spring'], ['printemps', 'spring'], ['cet ete', 'this summer'], ['en ete', 'in summer'], ['l ete', 'summer'],
  ['ete', 'summer'], ['cet automne', 'this autumn'], ['en automne', 'in autumn'], ['l automne', 'autumn'], ['automne', 'autumn'],
  ['hors saison', 'off season'], ['basse saison', 'off season'], ['semaine de relache', 'spring break'], ['relache', 'spring break'],
  // what kind of request
  ['planifie moi', 'plan me'], ['planifiez moi', 'plan me'], ['planifie nous', 'plan us'], ['planifiez nous', 'plan us'],
  ['planifie', 'plan'], ['planifiez', 'plan'], ['planifier', 'plan'], ['organise', 'plan'], ['organisez', 'plan'],
  ['organiser', 'plan'], ['prepare', 'plan'], ['preparez', 'plan'], ['itineraire', 'itinerary'], ['programme', 'itinerary'],
  ['voyage', 'trip'], ['sejour', 'trip'], ['escapade', 'getaway'], ['vacances', 'vacation'], ['road trip', 'road trip'],
  ['trouve moi', 'find me'], ['trouvez moi', 'find me'], ['recommande', 'recommend'], ['recommandez', 'recommend'],
  ['recommander', 'recommend'], ['suggere', 'suggest'], ['suggerez', 'suggest'], ['propose', 'suggest'], ['proposez', 'suggest'],
  ['conseille', 'recommend'], ['conseillez', 'recommend'], ['suggestions', 'suggestions'], ['idees', 'ideas'], ['idee', 'idea'],
  ['ou manger', 'places to eat'], ['ou aller', 'places to go'],
  ['que faire', 'what to do'], ['quoi faire', 'what to do'], ['choses a faire', 'things to do'], ['choses a voir', 'things to see'],
  ['a voir', 'to see'], ['activites de plein air', 'outdoor activities'], ['activites exterieures', 'outdoor activities'],
  ['activites', 'activities'], ['activite', 'activity'], ['attraits', 'attractions'], ['attractions', 'attractions'],
  ['incontournables', 'must see'], ['incontournable', 'must see'], ['a ne pas manquer', 'do not miss'],
  ['meilleurs', 'best'], ['meilleures', 'best'], ['meilleur', 'best'], ['meilleure', 'best'],
  // food and drink
  // 2026-10-18: "un bon souper chaque soir" is a dinner every night ("chaque" was left as a search word).
  ['chaque soir', 'each night'], ['chaque soiree', 'each evening'], ['tous les soirs', 'every night'], ['chaque jour', 'each day'], ['tous les jours', 'every day'], ['chaque', 'each'],
  ['un seul souper', 'one dinner'], ['un seul repas du soir', 'one dinner'],
  ['petit dejeuner', 'breakfast'], ['petits dejeuners', 'breakfasts'], ['dejeuner', 'breakfast'], ['dejeuners', 'breakfasts'],
  ['diner', 'lunch'], ['diners', 'lunches'], ['souper', 'dinner'], ['soupers', 'dinners'],
  ['bonne bouffe', 'great food'], ['bonne nourriture', 'great food'], ['bonne cuisine', 'great food'], ['bonne table', 'great food'],
  ['bien manger', 'great food'], ['gastronomie', 'great food'], ['bouffe', 'food'], ['nourriture', 'food'], ['cuisine', 'food'],
  ['manger', 'eat'], ['repas', 'food'], ['resto', 'restaurant'], ['restos', 'restaurants'],
  ['prendre un cafe', 'coffee'], ['un cafe', 'coffee'], ['cafe', 'cafe'], ['cafes', 'cafes'],
  ['boulangerie', 'bakery'], ['boulangeries', 'bakery'], ['patisserie', 'bakery'], ['patisseries', 'bakery'],
  ['glace', 'ice cream'], ['glaces', 'ice cream'], ['personnes', 'people'], ['personne', 'person'],
  ['quelle journee parfaite', 'a day'], ['quelle', ''], ['quel', ''], ['quels', ''], ['quelles', ''], ['parfaite', ''], ['parfait', ''],
  ['de la france', 'from france'], ['de france', 'from france'], ['du quebec', 'from quebec'], ['de montreal', 'from montreal'], ['de paris', 'from paris'], ['de belgique', 'from belgium'], ['de suisse', 'from switzerland'], ['d allemagne', 'from germany'], ['de l allemagne', 'from germany'],
  ['creme glacee', 'ice cream'], ['cremes glacees', 'ice cream'], ['fruits de mer', 'seafood'],
  ['italien', 'italian'], ['italienne', 'italian'], ['japonais', 'japanese'], ['japonaise', 'japanese'], ['mexicain', 'mexican'],
  ['mexicaine', 'mexican'], ['chinois', 'chinese'], ['chinoise', 'chinese'], ['indien', 'indian'], ['indienne', 'indian'],
  ['grec', 'greek'], ['grecque', 'greek'], ['francais', 'french'], ['francaise', 'french'], ['thailandais', 'thai'],
  ['degustation de vin', 'wine tasting'], ['degustation de vins', 'wine tasting'], ['degustations de vin', 'wine tastings'],
  ['degustations de vins', 'wine tastings'], ['degustation', 'wine tasting'], ['degustations', 'wine tastings'],
  ['route des vins', 'wine tour'], ['tournee des vignobles', 'wine tour'], ['pays du vin', 'wine country'],
  ['domaine viticole', 'winery'], ['domaines viticoles', 'wineries'], ['cave a vin', 'winery'], ['caves a vin', 'wineries'],
  ['vinerie', 'winery'], ['vineries', 'wineries'], ['etablissement vinicole', 'winery'], ['etablissements vinicoles', 'wineries'],
  ['vignoble', 'vineyard'], ['vignobles', 'vineyards'], ['vignes', 'vineyards'], ['vin', 'wine'], ['vins', 'wines'],
  ['biere artisanale', 'craft beer'], ['bieres artisanales', 'craft beer'], ['brasserie artisanale', 'brewery'],
  // Round 11 (2026-10-20): a brewery crawl, however it is said (« tournée des brasseries », « crawl de brasseries »,
  // « route des bières »); they were a flat list or a single brewery.
  ['tournee des microbrasseries', 'brewery crawl'], ['tournee des brasseries', 'brewery crawl'], ['tournee de brasseries', 'brewery crawl'],
  ['tournee des bieres', 'brewery crawl'], ['crawl de brasseries', 'brewery crawl'], ['crawl des brasseries', 'brewery crawl'],
  ['crawl de microbrasseries', 'brewery crawl'], ['crawl de bieres', 'brewery crawl'], ['route des bieres', 'brewery crawl'],
  ['route de la biere', 'brewery crawl'], ['circuit des brasseries', 'brewery crawl'], ['circuit des microbrasseries', 'brewery crawl'],
  // Planner (2026-10-27): « tournée des bars / des pubs » is a bar or pub crawl (a timed happy hour outing, server.js).
  ['tournee des bars', 'bar crawl'], ['tournee des pubs', 'pub crawl'], ['tournee de bars', 'bar crawl'], ['tournee de pubs', 'pub crawl'],
  // 2026-11-14: « une tournée des 5 à 7 » (the French trip page's own sample) and « … des happy hours » are a happy hour
  // crawl. Without these « tournée » was left over and searched for (« Lieux qui mentionnent « tournee » »).
  ['tournee des 5 a 7', 'happy hour crawl'], ['tournee de 5 a 7', 'happy hour crawl'], ['tournee des cinq a sept', 'happy hour crawl'],
  ['tournee de cinq a sept', 'happy hour crawl'], ['tournee des happy hours', 'happy hour crawl'], ['tournee des happy hour', 'happy hour crawl'],
  ['tournee de happy hours', 'happy hour crawl'], ['tournee des aperos', 'happy hour crawl'], ['tournee des apero', 'happy hour crawl'],
  ['crawl de 5 a 7', 'happy hour crawl'], ['crawl des 5 a 7', 'happy hour crawl'], ['crawl de happy hours', 'happy hour crawl'],
  ['tournee des bars a cocktails', 'bar crawl'], ['tournee des bars a cocktail', 'bar crawl'],
  ['tournee de vignobles', 'wine tour'], ['tournee des vineries', 'wine tour'], ['tournee des wineries', 'wine tour'], ['tournee des caves', 'wine tour'],
  ['tournee des caves a vin', 'wine tour'], ['tournee des domaines', 'wine tour'], ['tournee des domaines viticoles', 'wine tour'], ['tournee des vins', 'wine tour'],
  ['equitation', 'horseback riding'], ['balade a cheval', 'horseback riding'], ['randonnee a cheval', 'horseback riding'], ['planche a roulettes', 'skate park'], ['skateparc', 'skate park'], ['planchodrome', 'skate park'], ['promenade', 'walk'], ['promenades', 'walks'], ['journee spa', 'spa day'], ['journee de repos', 'rest day'], ['journee sans ski', 'rest day'], ['jours de ski', 'ski days'], ['journees de ski', 'ski days'], ['location de velos', 'bike rentals'], ['location de skis', 'ski rentals'],
  ['avec une journee de ski', 'with one ski day'], ['une journee de ski', 'one ski day'], ['journee de ski', 'ski day'], ['avec du ski', 'with skiing'],
  ['magasinage', 'shopping'], ['magasiner', 'shopping'], ['faire du magasinage', 'shopping'], ['faire les boutiques', 'shopping'], ['lèche-vitrine', 'shopping'], ['leche vitrine', 'shopping'], ['boutiques', 'shops'], ['souvenirs', 'souvenirs'], ['librairie', 'bookshop'], ['librairies', 'bookshops'],
  ['microbrasserie', 'brewery'], ['microbrasseries', 'breweries'], ['brasserie', 'brewery'], ['brasseries', 'breweries'],
  ['biere', 'beer'], ['bieres', 'beers'], ['distillerie', 'distillery'], ['distilleries', 'distilleries'],
  // Distilleries (2026-11-13): « spiritueux » and the spirits by name are a distillery (a « dégustation de gin » isn't wine).
  ['degustation de spiritueux', 'spirits tasting'], ['degustations de spiritueux', 'spirits tasting'], ['degustation de gin', 'gin tasting'], ['degustation de whisky', 'whisky tasting'],
  ['spiritueux artisanaux', 'craft spirits'], ['spiritueux', 'spirits'], ['rhum', 'rum'], ['eau de vie', 'spirits'], ['eaux de vie', 'spirits'],
  ['cidrerie', 'cidery'], ['cidreries', 'cideries'],
  // Brewery test 3 (2026-11-13): « cidre à Summerland » asks for cider (the cideries), not a word in the descriptions.
  ['cidre', 'cider'], ['cidres', 'ciders'],
  ['bar a cocktails', 'cocktail bar'], ['bar a cocktail', 'cocktail bar'], ['bars a cocktails', 'cocktail bars'],
  ['cinq a sept', 'happy hour'], ['5 a 7', 'happy hour'], ['apero', 'happy hour'], ['aperitif', 'happy hour'],
  ['sans alcool', 'non alcoholic'], ['bar sportif', 'sports bar'], ['bars sportifs', 'sports bars'],
  ['regarder le match', 'watch the game'], ['regarder le hockey', 'watch the hockey'], ['sports a la tele', 'sports tv'],
  // outdoors
  ['promenades faciles', 'easy walks'], ['balades faciles', 'easy walks'], ['marches faciles', 'easy walks'],
  ['promenade facile', 'easy walk'], ['balade facile', 'easy walk'], ['marche facile', 'easy walk'],
  ['plage pour chiens', 'dog beach'], ['plage pour chien', 'dog beach'], ['plages pour chiens', 'dog beaches'],
  ['plage canine', 'dog beach'], ['plages canines', 'dog beaches'], ['plage', 'beach'], ['plages', 'beaches'],
  ['se baigner', 'swimming'], ['baignade', 'swimming'], ['nager', 'swim'], ['natation', 'swimming'],
  ['parc provincial', 'provincial park'], ['parc regional', 'regional park'], ['parc', 'park'], ['parcs', 'parks'],
  ['en plein air', 'outdoors'], ['plein air', 'outdoors'], ['exterieur', 'outside'], ['dehors', 'outside'],
  ['faire de la randonnee', 'hiking'], ['randonnee pedestre', 'hiking'],
  ['randonnees faciles', 'easy hikes'], ['randonnee facile', 'easy hike'], ['randos faciles', 'easy hikes'], ['rando facile', 'easy hike'],
  ['randonnee', 'hike'], ['randonnees', 'hikes'], ['rando', 'hike'], ['randos', 'hikes'], ['randonner', 'hiking'], ['sentier pedestre', 'walking trail'],
  ['sentiers pedestres', 'walking trails'], ['marche en nature', 'nature walk'], ['marches en nature', 'nature walks'],
  ['hors des sentiers battus', 'off the beaten path'], ['sentier', 'trail'], ['sentiers', 'trails'],
  ['faire du velo', 'biking'], ['velo de montagne', 'mountain biking'], ['vtt', 'mountain biking'],
  ['piste cyclable', 'bike trail'], ['pistes cyclables', 'bike trails'], ['balade a velo', 'bike ride'], ['velo', 'bike'],
  ['ski de fond', 'cross country skiing'], ['skier', 'skiing'], ['raquette a neige', 'snowshoeing'], ['raquettes', 'snowshoeing'],
  ['raquette', 'snowshoeing'], ['patinage', 'skating'], ['patiner', 'skating'], ['patin', 'skating'], ['glissade sur tube', 'tubing'],
  ['activites d hiver', 'winter activities'], ['terrain de camping', 'campground'], ['terrains de camping', 'campgrounds'],
  // Whistler Roam (2026-10-25): the words the English planner learned this round.
  ['de vancouver a', 'from vancouver to'], ['depuis vancouver jusqu a', 'from vancouver to'], ['depuis vancouver', 'from vancouver'], ['de vancouver', 'from vancouver'], ['en partant de vancouver', 'from vancouver'],
  ['vie nocturne', 'nightlife'], ['sortie nocturne', 'night out'], ['boite de nuit', 'nightclub'], ['boites de nuit', 'nightclubs'],
  ['observer les ours', 'bear viewing'], ['ours', 'bears'], ['aigles', 'eagles'], ['aigle', 'eagle'], ['saumons', 'salmon'], ['saumon', 'salmon'],
  ['cascades', 'waterfalls'], ['cascade', 'waterfall'], ['chutes', 'falls'],
  ['grimpeurs', 'rock climbing'], ['grimpeur', 'rock climbing'], ['grimpeuses', 'rock climbing'], ['escalade', 'rock climbing'],
  ['coucher de soleil', 'sunset spots'], ['couchers de soleil', 'sunset spots'], ['belles vues', 'views'], ['vue sur les montagnes', 'mountain views'],
  ['avec des arrets', 'with stops along the way'], ['arrets en route', 'stops along the way'], ['arrets', 'stops'],
  ['tyrolienne', 'zipline'], ['tyroliennes', 'ziplines'], ['saut a l elastique', 'bungee'], ['rafting', 'rafting'], ['velo de montagne', 'mountain biking'],
  // Tour test 1 (Whistler, 2026-11-16): « motoneige » found nothing and « randonnée en motoneige » read as a hike; « quad »
  // and « VTT » (véhicule tout-terrain) are ATV tours.
  ['randonnee en motoneige', 'snowmobile tour'], ['randonnees en motoneige', 'snowmobile tours'], ['balade en motoneige', 'snowmobile tour'], ['excursion en motoneige', 'snowmobile tour'],
  ['tour de motoneige', 'snowmobile tour'], ['sortie en motoneige', 'snowmobile tour'], ['motoneige', 'snowmobile'], ['motoneiges', 'snowmobiles'],
  ['randonnee en quad', 'ATV tour'], ['balade en quad', 'ATV tour'], ['sortie en quad', 'ATV tour'], ['sortie en vtt', 'ATV tour'], ['randonnee en vtt', 'ATV tour'], ['balade en vtt', 'ATV tour'], ['quad', 'ATV'], ['quads', 'ATVs'], ['vtt', 'ATV'],
  // Tour test 2 (Whistler, 2026-11-16): « observation des ours » and « observation de la faune » are wildlife tours (they
  // read as a search for "observation"); « sortie », « excursion » and « descente de rivière » are tour words, never
  // search words (« Lieux qui mentionnent "sortie" »); « une sortie en famille » is a family-friendly tour.
  ['observation des ours', 'bear viewing tour'], ['observation d ours', 'bear viewing tour'], ['observation de l ours', 'bear viewing tour'], ['observer les ours', 'bear viewing tour'], ['observer des ours', 'bear viewing tour'],
  ['voir des ours', 'bear viewing tour'], ['voir les ours', 'bear viewing tour'], ['excursion d observation des ours', 'bear viewing tour'], ['sortie d observation des ours', 'bear viewing tour'],
  ['observation de la faune', 'wildlife viewing tour'], ['observation de la faune et des ours', 'wildlife and bear viewing tour'], ['observation faunique', 'wildlife viewing tour'], ['observer la faune', 'wildlife viewing tour'],
  ['excursion d observation de la faune', 'wildlife viewing tour'], ['sortie d observation de la faune', 'wildlife viewing tour'],
  ['sortie en famille', 'family friendly tour'], ['sorties en famille', 'family friendly tours'], ['excursion en famille', 'family friendly tour'], ['excursions en famille', 'family friendly tours'],
  ['sortie familiale', 'family friendly tour'], ['sorties familiales', 'family friendly tours'], ['excursion familiale', 'family friendly tour'],
  ['descente de riviere', 'rafting'], ['descentes de riviere', 'rafting'], ['descente de rivieres', 'rafting'], ['descente de la riviere', 'rafting'], ['descente en rafting', 'rafting'], ['descente en eau vive', 'whitewater rafting'],
  ['descentes en eau vive', 'whitewater rafting'], ['rafting en eau vive', 'whitewater rafting'], ['eau vive', 'whitewater'], ['ski de descente', 'downhill skiing'], ['velo de descente', 'downhill mountain biking'],
  // Tour test 3 (Whistler, 2026-11-17): « tour d'hélicoptère » read as the word « helicoptere »; « héli-randonnée » as a hike.
  ['tour d helicoptere', 'helicopter tour'], ['tours d helicoptere', 'helicopter tours'], ['tour en helicoptere', 'helicopter tour'], ['tours en helicoptere', 'helicopter tours'],
  ['vol en helicoptere', 'helicopter flight'], ['vols en helicoptere', 'helicopter flights'], ['vol d helicoptere', 'helicopter flight'], ['balade en helicoptere', 'helicopter tour'],
  ['survol en helicoptere', 'helicopter flight'], ['excursion en helicoptere', 'helicopter tour'], ['sortie en helicoptere', 'helicopter tour'], ['helicoptere', 'helicopter'], ['helicopteres', 'helicopters'],
  ['vol panoramique', 'scenic flight'], ['vols panoramiques', 'scenic flights'], ['atterrissage sur un glacier', 'glacier landing'], ['atterrissage sur glacier', 'glacier landing'],
  ['heli randonnee', 'heli hiking'], ['heli randonnees', 'heli hiking'], ['helirandonnee', 'heli hiking'], ['randonnee en helicoptere', 'heli hiking'], ['randonnee heliportee', 'heli hiking'],
  ['sortie guidee', 'guided tour'], ['sorties guidees', 'guided tours'], ['excursion guidee', 'guided tour'], ['excursions guidees', 'guided tours'],
  ['sortie', 'tour'], ['sorties', 'tours'], ['excursion', 'tour'], ['excursions', 'tours'],
  ['camper', 'camping'], ['observation des oiseaux', 'birdwatching'], ['ornithologie', 'birdwatching'], ['faune', 'wildlife'],
  ['milieux humides', 'wetlands'], ['planche a pagaie', 'paddleboarding'], ['surf a pagaie', 'paddleboarding'],
  ['pagaie', 'paddling'], ['canot', 'canoe'], ['location de bateau', 'boat rental'], ['bateau', 'boating'],
  ['points de vue', 'viewpoints'], ['point de vue', 'viewpoint'], ['belvedere', 'lookout'], ['belvederes', 'lookouts'],
  ['vue panoramique', 'scenic view'], ['vues panoramiques', 'scenic views'], ['tyrolienne', 'zipline'], ['tyroliennes', 'zipline'],
  ['aventure', 'adventure'], ['aventures', 'adventures'], ['aventureux', 'adventurous'], ['sensations fortes', 'thrills'],
  // Tour test 5 (Whistler, 2026-11-17): « pêche », « excursion de pêche » and « bateau nolisé » ask for a fishing or boat
  // operator (« pêche » planned lakes); « aller à la pêche » and « pêcher » stay the fishing activity.
  ['aller a la peche', 'fishing'], ['pecher', 'fishing'], ['peche sur glace', 'ice fishing'], ['peche blanche', 'ice fishing'],
  ['excursion de peche', 'fishing trip'], ['excursions de peche', 'fishing trips'], ['sortie de peche', 'fishing trip'], ['sorties de peche', 'fishing trips'], ['voyage de peche', 'fishing trip'],
  ['peche au saumon', 'salmon fishing'], ['peche guidee', 'guided fishing'], ['guide de peche', 'fishing guide'], ['charte de peche', 'fishing charter'], ['bateau de peche', 'fishing charter'],
  ['peche', 'fishing trip'], ['bateau nolise', 'boat charter'], ['bateaux nolises', 'boat charters'], ['nolisement', 'charter'], ['croisiere', 'cruise'], ['croisieres', 'cruises'],
  // Every tour kind (2026-11-17): dog sledding, snowshoe tours, jet boats, bike tours, farm visits, heli-skiing, rentals.
  ['traineau a chiens', 'dog sledding'], ['traineaux a chiens', 'dog sledding'], ['tour de traineau a chiens', 'dog sledding'], ['balade en traineau a chiens', 'dog sledding'],
  // Tour test 8 (Whistler, 2026-11-17): « chiens de traîneau » read as a dog in the party; « huskys », « chenil » and
  // « visite des chiots » found nothing.
  ['chiens de traineau', 'dog sledding'], ['chien de traineau', 'dog sledding'], ['sortie en chiens de traineau', 'dog sledding'], ['balade en traineau', 'sled ride'], ['tour de traineau', 'sled ride'],
  // Tour test 10 (Whistler, 2026-11-18; Gord): « promenade en traîneau » (a horse-drawn sleigh) found nothing; the dog-sled
  // phrases above (« traîneau à chiens », « balade en traîneau ») keep going to dog sledding.
  ['promenade en traineau', 'sleigh ride'], ['promenades en traineau', 'sleigh rides'], ['tour en traineau', 'sleigh ride'], ['traineau tire par des chevaux', 'horse-drawn sleigh ride'],
  ['traineau tire par un cheval', 'horse-drawn sleigh ride'], ['traineaux tires par des chevaux', 'horse-drawn sleigh rides'], ['promenade en traineau tire par des chevaux', 'horse-drawn sleigh ride'], ['traineau', 'sleigh ride'], ['traineaux', 'sleigh rides'],
  ['huskys', 'huskies'], ['huskies', 'huskies'], ['husky', 'husky'], ['conduire son attelage', 'mushing'], ['conduire un attelage', 'mushing'], ['meneur de chiens', 'mushing'],
  ['visite du chenil', 'kennel visit'], ['visite de chenil', 'kennel visit'], ['visite au chenil', 'kennel visit'], ['visiter le chenil', 'kennel visit'], ['visites du chenil', 'kennel visits'], ['chenil', 'kennel'], ['chenils', 'kennels'],
  ['visite des chiots', 'puppy visit'], ['visite aux chiots', 'puppy visit'], ['rencontrer les chiots', 'puppy visit'], ['rencontrer les huskys', 'meet the huskies'],
  ['avec notre chiot', 'with my dog'], ['avec mon chiot', 'with my dog'],
  // Tour test 9 (Whistler, 2026-11-18): « visite culturelle autochtone » read as two place words and found nothing.
  ['visite culturelle autochtone', 'indigenous cultural tour'], ['visites culturelles autochtones', 'indigenous cultural tours'], ['visite autochtone', 'indigenous tour'], ['visites autochtones', 'indigenous tours'],
  ['visite culturelle', 'cultural tour'], ['visites culturelles', 'cultural tours'], ['sortie culturelle', 'cultural tour'], ['culture autochtone', 'indigenous culture'], ['cultures autochtones', 'indigenous culture'],
  ['premieres nations', 'first nations'], ['premiere nation', 'first nations'], ['autochtones', 'indigenous'], ['autochtone', 'indigenous'], ['sortie scolaire', 'school field trip'],
  ['sortie en raquettes', 'snowshoe tour'], ['sorties en raquettes', 'snowshoe tours'], ['excursion en raquettes', 'snowshoe tour'], ['sortie de raquette', 'snowshoe tour'], ['raquette guidee', 'guided snowshoeing'],
  // From Whistler Roam #188 (2026-11-17, real-data check): « randonnée guidée en raquettes » read as a hike plus the word « guidée »
  // and found nothing. Guided is the tour; a plain « randonnée en raquettes » stays snowshoeing (the trails).
  ['randonnee guidee en raquettes', 'guided snowshoe tour'], ['randonnees guidees en raquettes', 'guided snowshoe tours'], ['randonnee guidee en raquette', 'guided snowshoe tour'],
  ['sortie guidee en raquettes', 'guided snowshoe tour'], ['excursion guidee en raquettes', 'guided snowshoe tour'], ['balade guidee en raquettes', 'guided snowshoe tour'],
  ['raquettes guidees', 'guided snowshoeing'], ['randonnee en raquettes', 'snowshoeing'], ['randonnees en raquettes', 'snowshoeing'],
  ['excursion en kayak', 'kayak tour'], ['sortie en kayak', 'kayak tour'], ['excursion en canot', 'canoe tour'], ['sortie en canot', 'canoe tour'], ['sortie en planche a pagaie', 'paddleboard tour'], ['kayak guide', 'guided kayak tour'],
  ['sortie en jet boat', 'jet boat tour'], ['bateau a propulsion', 'jet boat'], ['bateau a reaction', 'jet boat'],
  ['visite guidee a velo', 'guided bike tour'], ['visites guidees a velo', 'guided bike tours'], ['visite a velo', 'bike tour'], ['tour de velo', 'bike tour'], ['sortie a velo', 'bike tour'], ['sortie en velo', 'bike tour'],
  ['visite de ferme', 'farm tour'], ['visites de ferme', 'farm tours'], ['visite a la ferme', 'farm tour'], ['autocueillette', 'u-pick'],
  ['heliski', 'heli-skiing'], ['ski heliporte', 'heli-skiing'], ['ski en chenillette', 'cat skiing'],
  // Tour test 7 (Whistler, 2026-11-17): ski touring, backcountry skiing, mountaineering, avalanche courses and hut trips.
  // « randonnée alpine » (an alpine trip) asks for a mountain guide; « ski de randonnée alpine » is ski touring.
  ['ski de randonnee', 'ski touring'], ['ski de randonnee alpine', 'ski touring'], ['ski hors piste', 'backcountry skiing'], ['ski de haute route', 'ski touring'], ['planche a neige hors piste', 'backcountry snowboarding'],
  ['randonnee alpine', 'mountaineering'], ['randonnees alpines', 'mountaineering'], ['randonnee alpine guidee', 'guided mountaineering'], ['alpinisme', 'mountaineering'],
  ['guide de montagne', 'mountain guide'], ['guides de montagne', 'mountain guides'], ['escalade alpine', 'alpine climbing'],
  ['cours d avalanche', 'avalanche course'], ['cours sur les avalanches', 'avalanche course'], ['cours de securite en avalanche', 'avalanche course'], ['formation avalanche', 'avalanche training'], ['formation en avalanche', 'avalanche training'], ['formation sur les avalanches', 'avalanche training'],
  ['randonnee de plusieurs jours', 'multi-day hike'], ['randonnees de plusieurs jours', 'multi-day hikes'], ['sortie de plusieurs jours', 'multi-day tour'], ['sorties de plusieurs jours', 'multi-day tours'],
  ['nuit en refuge', 'hut trip'], ['sejour en refuge', 'hut trip'], ['sortie en refuge', 'hut trip'], ['randonnee en refuge', 'hut trip'], ['refuge', 'hut trip'], ['refuges', 'hut trips'],
  ['location d equipement', 'equipment rentals'], ['location de materiel', 'equipment rentals'],
  ['jouer au golf', 'golf'], ['terrain de golf', 'golf course'], ['terrains de golf', 'golf courses'],
  ['parcours de golf', 'golf course'], ['golfer', 'golf'],
  ['vue sur le lac', 'lake view'], ['vue sur lac', 'lake view'], ['vue sur la lac', 'lake view'],
  ['au bord du lac', 'by the lake'], ['bord du lac', 'by the lake'], ['pres du lac', 'by the lake'], ['sur le lac', 'on the lake'],
  ['au bord de l eau', 'waterfront'], ['bord de l eau', 'waterfront'], ...SITE_FRENCH_LAKES, ['lac', 'lake'], ['lacs', 'lakes'],
  ['terrasse', 'patio'], ['terrasses', 'patios'],
  // events
  ['musique live', 'live music'], ['musique en direct', 'live music'], ['musique sur scene', 'live music'],
  // Round 8 (2026-10-19): « spectacle » is any show (theatre, comedy, a concert), not only a concert.
  ['spectacle musical', 'concert'], ['spectacle de musique', 'concert'], ['le spectacle', 'the show'], ['du spectacle', 'the show'], ['des spectacles', 'shows'],
  ['spectacle', 'a show'], ['spectacles', 'shows'], ['evenement', 'event'], ['evenements', 'events'],
  // Round 10: Christmas markets, and « de la musique » with shows is live music.
  ['marches de noel', 'christmas markets'], ['marche de noel', 'christmas market'], ['marches du temps des fetes', 'christmas markets'], ['marche des fetes', 'christmas market'],
  ['reveillon du nouvel an', "new year's eve"], ['veille du jour de l an', "new year's eve"], ['jour de l an', "new year's day"], ['nouvel an', "new year's"], ['saint valentin', "valentine's"], ['st valentin', "valentine's"], ['action de grace', 'thanksgiving'], ['jour du souvenir', 'remembrance day'], ['paques', 'easter'], ['fete des meres', "mother's day"], ['fete des peres', "father's day"],
  ['noel', 'christmas'], ['temps des fetes', 'holidays'],
  ['de la musique', 'live music'], ['musique', 'live music'],
  ['marches', 'markets'],
  ['marche fermier', 'farmers market'], ['marche des fermiers', 'farmers market'], ['marche public', 'farmers market'],
  ['marches publics', 'farmers markets'], ['marche de producteurs', 'farmers market'], ['marches fermiers', 'farmers markets'],
  ['partie de hockey', 'hockey game'], ['match de hockey', 'hockey game'], ['galerie', 'gallery'], ['galeries', 'galleries'],
  ['quoi de neuf', 'whats on'], ['ce qui se passe', 'whats on'],
  // who is coming
  ['avec mon chien', 'with my dog'], ['avec ma chienne', 'with my dog'], ['avec le chien', 'with the dog'],
  ['avec notre chien', 'with my dog'], ['avec nos chiens', 'with my dog'], ['avec mes chiens', 'with my dog'],
  ['chiens acceptes', 'dogs allowed'], ['chiens admis', 'dogs allowed'], ['chiens bienvenus', 'dogs welcome'],
  ['accepte les chiens', 'dogs allowed'], ['acceptant les chiens', 'dogs allowed'], ['animaux de compagnie', 'pets'],
  ['animaux acceptes', 'pet friendly'], ['chien', 'dog'], ['chiens', 'dogs'], ['chienne', 'dog'], ['chiot', 'puppy'], ['animaux', 'pets'],
  ['avec les enfants', 'with the kids'], ['avec mes enfants', 'with my kids'], ['avec nos enfants', 'with my kids'],
  ['avec des enfants', 'with kids'], ['avec enfants', 'with kids'], ['avec les petits', 'with the kids'],
  ['adapte aux enfants', 'kid friendly'], ['adaptes aux enfants', 'kid friendly'], ['pour les enfants', 'kid friendly'],
  ['jeunes enfants', 'toddlers'], ['tout petits', 'toddlers'], ['bambins', 'toddlers'], ['enfants', 'kids'], ['enfant', 'kid'],
  ['en famille', 'with the family'], ['pour toute la famille', 'family friendly'], ['familial', 'family friendly'],
  ['familiale', 'family friendly'], ['famille', 'family'], ['familles', 'families'],
  ['adultes seulement', 'adults only'], ['entre adultes', 'adults only'],
  // Distillery test 2 (2026-11-13): « deux adultes » is a head count (it read "for two adultes": a romantic outing and a
  // search for « adultes »), and « pique-nique » one word (it was searched as « pique » and « nique »).
  ['adultes', 'adults'], ['adulte', 'adult'], ['pique nique', 'picnic'], ['pique niques', 'picnics'], ['pique niquer', 'picnic'], ['casse croute', 'snack'], ['casse croutes', 'snacks'], ['sans enfants', 'no kids'], ['sans les enfants', 'no kids'],
  ['en amoureux', 'romantic'], ['soiree en amoureux', 'date night'], ['sortie en amoureux', 'date night'], ['tete a tete', 'date night'],
  ['rendez vous galant', 'date night'], ['romantique', 'romantic'], ['romantiques', 'romantic'], ['amoureux', 'couples'],
  ['anniversaire de mariage', 'anniversary'], ['lune de miel', 'honeymoon'], ['anniversaire', 'birthday'],
  ['fete', 'celebration'], ['feter', 'celebrate'], ['celebrer', 'celebrate'], ['celebration', 'celebration'],
  ['entre filles', 'girls trip'], ['entre gars', 'guys trip'], ['enterrement de vie de jeune fille', 'bachelorette'],
  ['enterrement de vie de garcon', 'bachelor party'], ['entre amis', 'with friends'], ['avec des amis', 'with friends'],
  ['avec mes amis', 'with friends'], ['avec nos amis', 'with friends'], ['groupe d amis', 'group of friends'],
  ['en couple', 'couple'], ['a deux', 'for two'], ['pour deux', 'for two'], ['tous les deux', 'just the two of us'],
  ['decompresser', 'unwind'], ['se detendre', 'unwind'], ['detente', 'relaxing'], ['relaxant', 'relaxing'], ['relaxante', 'relaxing'],
  ['grand groupe', 'large group'], ['grands groupes', 'large groups'], ['en groupe', 'groups'], ['groupe', 'groups'], ['groupes', 'groups'],
  // Transport phrases map to the existing English walking constraints.
  ['nous n avons pas de voiture', 'we do not have a car'], ['je n ai pas de voiture', 'i do not have a car'],
  // Round 11 (2026-10-20): « de Squamish à Pemberton (en voiture) » is a road trip; « en voiture » is how, not a word to match.
  ['en voiture', 'by car'], ['en auto', 'by car'],
  ['pas de voiture', 'no car'], ['sans voiture', 'without a car'], ['sans auto', 'without a car'],
  ['a pied', 'on foot'], ['pas de conduite', 'no driving'], ['sans conduire', 'no driving'],
  ['marcher entre les arrets', 'walk between stops'], ['marcher entre les lieux', 'walk between places'],
  ['marcher entre les endroits', 'walk between places'],
  // dietary
  ['sans gluten', 'gluten free'], ['coeliaque', 'celiac'], ['vegetalien', 'vegan'], ['vegetalienne', 'vegan'],
  ['vegetaliens', 'vegan'], ['vegetaliennes', 'vegan'], ['vegane', 'vegan'], ['veganes', 'vegan'], ['vegetarien', 'vegetarian'], ['vegetarienne', 'vegetarian'],
  ['vegetariens', 'vegetarian'], ['vegetariennes', 'vegetarian'],
  // places worth finding
  ['joyau cache', 'hidden gem'], ['joyaux caches', 'hidden gems'], ['perle rare', 'hidden gem'], ['perles rares', 'hidden gems'],
  ['tresor cache', 'hidden gem'], ['tresors caches', 'hidden gems'], ['endroit secret', 'secret spot'],
  ['endroits secrets', 'secret spots'], ['meconnu', 'underrated'], ['meconnus', 'underrated'], ['meconnues', 'underrated'],
  ['coins secrets', 'secret spots'], ['coin secret', 'secret spot'], ['coups de coeur', 'local favourites'], ['coup de coeur', 'local favourite'],
  ['favoris locaux', 'local favourites'], ['favori local', 'local favourite'], ['coups de coeur locaux', 'local favourites'],
  ['ou vont les gens du coin', 'where locals go'], ['ou vont les locaux', 'where locals go'], ['gens du coin', 'locals'],
  // budget
  // 2026-10-19: free things and students are a budget trip ("choses gratuites", "deux étudiants").
  ['choses gratuites', 'free things'], ['activites gratuites', 'free activities'], ['sorties gratuites', 'free things'], ['gratuitement', 'for free'],
  ['gratuit', 'free things'], ['gratuits', 'free things'], ['gratuite', 'free things'], ['gratuites', 'free things'],
  ['etudiant', 'student'], ['etudiants', 'students'], ['etudiante', 'student'], ['etudiantes', 'students'],
  ['surtout', 'mostly'], ['choses', 'things'], ['chose', 'thing'],
  ['spectacle d humour', 'comedy show'], ['spectacles d humour', 'comedy shows'], ['soiree d humour', 'comedy night'], ['humour', 'comedy'], ['humoriste', 'comedian'], ['humoristes', 'comedians'],
  ['un spectacle', 'a show'],
  ['pas cher', 'cheap'], ['pas chere', 'cheap'], ['pas chers', 'cheap'], ['pas cheres', 'cheap'], ['bon marche', 'inexpensive'],
  ['abordable', 'affordable'], ['abordables', 'affordable'], ['petit budget', 'on a budget'], ['a petit prix', 'cheap'],
  ['economique', 'budget friendly'], ['economiques', 'budget friendly'], ['prix raisonnable', 'reasonably priced'],
  ['prix raisonnables', 'reasonably priced'], ['raisonnable', 'reasonable'], ['haut de gamme', 'upscale'],
  ['grande table', 'fine dining'], ['gastronomique', 'fine dining'], ['luxe', 'luxury'], ['luxueux', 'luxurious'],
  ['chic', 'fancy'], ['cher', 'expensive'], ['chere', 'expensive'],
  // negation
  ['pas de', 'no'], ['pas d', 'no'], ['sans', 'without'], ['aucun', 'no'], ['aucune', 'no'], ['sauf', 'except'], ['a part', 'except'],
  ['excepte', 'except'], ['pas', 'not'], ['ni', 'or'], ['ne', ''],
  // joining words
  ['et', 'and'], ['ou', 'or'], ['puis', 'then'], ['ensuite', 'then'], ['apres ca', 'then'], ['apres', 'after'], ['avant', 'before'],
  ['aussi', 'also'], ['mais', 'but'], ['avec', 'with'], ['pour', 'for'], ['sur', 'on'], ['dans', 'in'], ['pres de', 'near'],
  ['proche de', 'near'], ['autour de', 'around'], ['chez', 'at'], ['entre', 'between'],
  // everything else: English filler words or nothing
  ['je', 'i'], ['j', 'i'], ['nous', 'we'], ['on', 'we'], ['voudrais', 'want'], ['voudrions', 'want'], ['veux', 'want'],
  ['voulons', 'want'], ['aimerais', 'want'], ['aimerions', 'want'], ['souhaite', 'want'], ['souhaitons', 'want'],
  ['cherche', 'looking'], ['cherchons', 'looking'], ['recherche', 'looking'], ['aime', 'love'], ['aimons', 'love'],
  ['adore', 'love'], ['adorons', 'love'], ['aimer', 'like'], ['faire', 'do'], ['voir', 'see'], ['aller', 'go'], ['allons', 'go'],
  ['visiter', 'visit'], ['visite', 'visit'], ['passer', 'spend'], ['profiter', 'spend'], ['decouvrir', 'explore'],
  ['explorer', 'explore'], ['amener', 'bringing'], ['emmener', 'bringing'], ['amenons', 'bringing'], ['emmenons', 'bringing'],
  ['rester', 'staying'], ['restons', 'staying'], ['venir', 'coming'], ['venons', 'coming'], ['peut', 'can'], ['pouvons', 'can'],
  ['peux', 'can'], ['quelque chose', 'something'], ['quelques', 'a few'], ['plusieurs', 'a few'], ['beaucoup', 'lots'],
  ['super', 'great'], ['genial', 'great'], ['geniale', 'great'], ['excellent', 'great'], ['excellente', 'great'],
  ['excellents', 'great'], ['excellentes', 'great'], ['bon', 'good'], ['bonne', 'good'], ['bons', 'good'], ['bonnes', 'good'],
  ['beau', 'nice'], ['belle', 'nice'], ['beaux', 'nice'], ['belles', 'nice'], ['joli', 'nice'], ['jolie', 'nice'],
  ['endroit', 'place'], ['endroits', 'places'], ['lieu', 'place'], ['lieux', 'places'], ['coin', 'area'],
  ['de la', 'some'], ['de l', 'some'], ['simple', 'easy'], ['simples', 'easy'],
  ['le', 'the'], ['la', 'the'], ['les', 'the'], ['l', 'the'], ['du', 'some'], ['des', 'some'], ['de', 'of'], ['d', 'of'],
  ['au', 'at the'], ['aux', 'at the'], ['en', 'in'], ['mon', 'my'], ['ma', 'my'], ['mes', 'my'], ['notre', 'our'], ['nos', 'our'],
  ['votre', 'your'], ['vos', 'your'], ['si il vous plait', 'please'], ['svp', 'please'], ['merci', 'thanks'], ['bonjour', 'hi'],
  ['salut', 'hi'], ['il y a', ''], ['qu est ce que', ''], ['est ce que', ''], ['il', ''], ['ils', ''], ['elle', ''], ['elles', ''],
  ['y', ''], ['ce', ''], ['cet', ''], ['cette', ''], ['ces', ''], ['ca', ''], ['cela', ''], ['qui', ''], ['que', ''], ['quoi', ''],
  ['est', ''], ['sont', ''], ['ai', 'have'], ['avons', 'have'], ['avez', 'have'], ['suis', 'am'], ['sommes', 'are'], ['etre', ''],
  ['se', ''], ['me', ''], ['moi', 'me'], ['nous', 'us'], ['vous', 'you'], ['tout', 'all'], ['toute', 'all'], ['tous', 'all'],
  ['toutes', 'all'], ['tres', 'very'], ['bien', ''], ['peu', ''], ['un peu', ''], ['petit', ''], ['petite', ''], ['petits', ''],
  // 2026-10-25 (last, after every longer phrase): « un brunch puis une promenade à Kelowna » kept « promenade ».
  ['promenade', 'walk'], ['promenades', 'walks'], ['balade', 'walk'], ['balades', 'walks'], ['se promener', 'walk'],
  // Tour test 6 (Whistler, 2026-11-17): rentals by what is rented (« location de vélos électriques » read « electriques »
  // as a search word), adventure parks and treetop courses, children's birthday parties.
  ['location de velos electriques', 'e-bike rentals'], ['location de velo electrique', 'e-bike rental'], ['location de velo', 'bike rental'],
  ['location de vtt electriques', 'e-bike rentals'], ['location de kayaks', 'kayak rentals'], ['location de kayak', 'kayak rental'], ['location de canots', 'canoe rentals'],
  ['location de planches a pagaie', 'paddleboard rentals'], ['location de planche a pagaie', 'paddleboard rental'], ['location de ski', 'ski rental'], ['location de raquettes', 'snowshoe rentals'],
  ['velos electriques', 'e-bikes'], ['velo electrique', 'e-bike'],
  ['parc d aventure', 'adventure park'], ['parcs d aventure', 'adventure parks'], ['parc d aventures', 'adventure park'], ['parcours dans les arbres', 'treetop course'],
  ['parcours d arbre en arbre', 'treetop course'], ['parcours aerien', 'treetop course'], ['hebertisme', 'treetop course'],
  ['fete d anniversaire', 'birthday party'], ['fetes d anniversaire', 'birthday parties'], ['fete d enfants', 'kids birthday party'],
];
const PHRASE_MAP = new Map();
for (const [fr, en] of PHRASES) if (!PHRASE_MAP.has(fr)) PHRASE_MAP.set(fr, en);
const MAX_PHRASE_WORDS = Math.max(...PHRASES.map(([fr]) => fr.split(' ').length));
// French spellings of Sea to Sky place names -> the English the interpreter knows.
const REGION_FRENCH = SITE_FRENCH.regions;

// Lowercase, accents removed, French elisions split ("l'eau" -> "l eau",
// "s'il" -> "si il"), clause boundaries and ISO dates kept for day instructions.
function tokenize(text) {
  return String(text)
    .slice(0, di.DISCOVERY_MAX_TEXT_LENGTH)
    // 2026-10-18: "où" (where) is not "ou" (or): "terrasse où les chiens sont acceptés" lost its meaning.
    .normalize('NFC').replace(/(^|[^a-zà-ÿ])où(?![a-zà-ÿ])/gi, '$1 ouu ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae') // "cœur" -> "coeur"
    .replace(/[‘’`]/g, "'")
    .replace(/\bs'(ils?)\b/g, 'si $1')
    .replace(/\b(l|d|j|qu|n|m|t|c|s|jusqu|lorsqu|puisqu)'/g, '$1 ')
    .replace(/'s\b/g, 's')
    .replace(/20\d{2}-\d{2}-\d{2}|[-–—_/]/g, m => /^20\d/.test(m) ? m : ' ')
    .replace(/&/g, ' and ')
    .replace(/\n/g, ' ; ')
    .match(/20\d{2}-\d{2}-\d{2}|[a-z0-9]+|[,.;]/g) || [];
}

// Venue names and region names, as word lists, for a taxonomy. The server
// builds a fresh taxonomy object per request, so the cache is keyed by the
// venue and region lists' contents.
const PLACES_CACHE = new Map();
const PLACES_CACHE_SIZE = 4;
function placesFor(taxonomy) {
  if (!taxonomy || typeof taxonomy !== 'object') return { names: [], regions: new Set() };
  const venues = Array.isArray(taxonomy.venues) ? taxonomy.venues : [];
  const key = JSON.stringify([taxonomy.regions, taxonomy.regionLabels, venues.map((v) => v && v.name)]);
  if (PLACES_CACHE.has(key)) return PLACES_CACHE.get(key);
  // Brewery test 3 (Whistler, 2026-11-16): each name without its bracket part too ("Microbrasserie du Lac Vert" for
  // "Microbrasserie du Lac Vert (test)": « lac » was translated to "lake" inside the name).
  const seenNames = new Set();
  const names = venues
    .flatMap((v) => { const n = String((v && v.name) || ''), bare = n.replace(/\s*\([^)]*\)/g, ' '); return bare !== n ? [n, bare] : [n]; })
    .map((n) => di.normalizeDiscoveryText(n).split(' ').filter(Boolean))
    .filter((w) => w.length >= 2 && !seenNames.has(w.join(' ')) && seenNames.add(w.join(' ')));
  const regions = new Set();
  for (const slug of Array.isArray(taxonomy.regions) ? taxonomy.regions : []) regions.add(String(slug).replace(/-/g, ' '));
  for (const label of Object.values(taxonomy.regionLabels || {})) regions.add(di.normalizeDiscoveryText(String(label)));
  for (const p of Object.keys(REGION_FRENCH)) regions.add(p);
  const out = { names, regions };
  if (PLACES_CACHE.size >= PLACES_CACHE_SIZE) PLACES_CACHE.delete(PLACES_CACHE.keys().next().value);
  PLACES_CACHE.set(key, out);
  return out;
}
// Token positions inside a venue's full name, which are left as typed.
function protectedPositions(tokens, names) {
  const keep = new Set();
  for (const name of names) {
    for (let i = 0; i + name.length <= tokens.length; i++) {
      let hit = true;
      for (let k = 0; k < name.length; k++) if (tokens[i + k] !== name[k]) { hit = false; break; }
      if (hit) for (let k = 0; k < name.length; k++) keep.add(i + k);
    }
  }
  return keep;
}
function regionAt(tokens, at, regions) {
  for (let n = 3; n >= 1; n--) if (at + n <= tokens.length && regions.has(tokens.slice(at, at + n).join(' '))) return n;
  return 0;
}

// A standalone "à" ("3 jours à Whistler") is French; English borrows it only
// in "à la carte" and "à la mode".
const A_GRAVE = /(?:^|[\s,;:(\[«"'])\u00e0(?=$|[\s,;:.!?)\]»"'])(?!\s+la\s+(?:carte|mode)\b)/i;
function isFrenchTokens(tokens, keep, text, frenchPage = false) {
  if (A_GRAVE.test(String(text).normalize('NFC'))) return true;
  let strong = 0;
  const weak = new Set();
  tokens.forEach((w, i) => {
    if (keep.has(i)) return;
    if ((STRONG.has(w) && !STRONG_ENGLISH_TOO.has(w)) || (frenchPage && STRONG_ON_FRENCH_PAGE.has(w))) strong += 1;
    else if (WEAK.has(w)) weak.add(w);
  });
  return strong >= 1 || weak.size >= 2;
}
// Venue names can only take French markers away (a name's words are not
// counted), never add them. So a request with no marker anywhere is not
// French whatever the venue list holds, and the list is never prepared for
// it -- the ordinary English request takes this path.
const NO_PROTECTION = new Set();
function mayBeFrench(tokens, text, frenchPage = false) {
  return isFrenchTokens(tokens, NO_PROTECTION, text, frenchPage);
}
function isFrenchTripRequest(text, taxonomy) {
  if (typeof text !== 'string') return false;
  const tokens = tokenize(text);
  if (!mayBeFrench(tokens, text)) return false;
  return isFrenchTokens(tokens, protectedPositions(tokens, placesFor(taxonomy).names), text);
}

// The request the planner reads: the English rewrite of a French request, or
// the original string, unchanged, for anything else. { frenchPage: true } (a
// search from a French page) also counts the French-only drink words.
function tripPlannerText(text, taxonomy, opts = {}) {
  const r = translateTrip(text, taxonomy, opts);
  return r ? r.text : text;
}
// The same tokens with their accents (round 10): « novembre », « marchés », for showing the visitor's own words back.
function displayTokens(text) {
  return String(text)
    .slice(0, di.DISCOVERY_MAX_TEXT_LENGTH)
    .normalize('NFC').replace(/(^|[^a-zà-ÿ])où(?![a-zà-ÿ])/gi, '$1 où ')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[‘’`]/g, "'")
    .replace(/\bs'(ils?)\b/g, 'si $1')
    .replace(/\b(l|d|j|qu|n|m|t|c|s|jusqu|lorsqu|puisqu)'/g, '$1 ')
    .replace(/'s\b/g, 's')
    .replace(/20\d{2}-\d{2}-\d{2}|[-–—_/]/g, m => /^20\d/.test(m) ? m : ' ')
    .replace(/&/g, ' and ')
    .replace(/\n/g, ' ; ')
    .match(/20\d{2}-\d{2}-\d{2}|[a-z0-9à-ÿ]+|[,.;]/g) || [];
}
// Round 10 (2026-10-19): the visitor's own French words for English words the planner could not use ("november" ->
// "novembre", "marches" -> "marchés"), so /fr/trip never quotes the English rewrite back. Words not found are left out
// of the map.
function frenchWordsFor(text, taxonomy, words) {
  const out = new Map();
  const r = translateTrip(text, taxonomy, {});
  if (!r || !Array.isArray(words)) return out;
  const shown = displayTokens(text);
  if (shown.length !== r.tokens.length) return out;
  for (const w of words) {
    const want = di.normalizeDiscoveryText(String(w || '')).split(' ').filter(Boolean);
    if (!want.length) continue;
    const piece = r.pieces.find((p) => { const en = di.normalizeDiscoveryText(p.en).split(' '); return want.every((x) => en.includes(x)); })
      || (want.length > 1 ? null : r.pieces.find((p) => p.to - p.from === 1 && r.tokens[p.from] === want[0]));
    if (piece) out.set(String(w), shown.slice(piece.from, piece.to).join(' '));
  }
  return out;
}
// The foods and drinks « après » can stand before as a happy hour (« après sushi », « après tapas »).
const APRES_FOOD = new Set('sushi sushis tapas pizza pizzas burger burgers ailes wings tacos nachos huitres oysters poke ramen biere bieres vin vins cocktail cocktails sake bouchees saumon fruits'.split(' '));
const FR_DATE_MONTHS = { janvier: 'january', fevrier: 'february', mars: 'march', avril: 'april', mai: 'may', juin: 'june', juillet: 'july', aout: 'august', septembre: 'september', octobre: 'october', novembre: 'november', decembre: 'december' };
function translateTrip(text, taxonomy, { frenchPage = false } = {}) {
  if (typeof text !== 'string') return null;
  const tokens = tokenize(text);
  if (!mayBeFrench(tokens, text, frenchPage)) return null;
  const places = placesFor(taxonomy);
  const keep = protectedPositions(tokens, places.names);
  if (!isFrenchTokens(tokens, keep, text, frenchPage)) return null;
  const pieces = [];
  const out = [];
  // The hyphenated pairs as typed ("pique-nique" -> "pique nique"), the same folding as tokenize().
  const hyphened = new Set((String(text).match(/[A-Za-zÀ-ÿœæ]+-[A-Za-zÀ-ÿœæ]+/g) || []).map((x) => tokenize(x).join(' ')));
  const realPush = out.push.bind(out);
  // Each English piece remembers the French tokens it came from.
  let pieceFrom = 0;
  out.push = (...xs) => { for (const x of xs) pieces.push({ en: String(x), from: pieceFrom, to: pieceFrom + 1 }); return realPush(...xs); };
  let fromOpen = false;
  for (let i = 0, mark = 0; i < tokens.length;) {
    // The pieces pushed in the last step span the tokens it consumed.
    for (let k = mark; k < pieces.length; k++) pieces[k].to = Math.max(pieces[k].to, i);
    mark = pieces.length; pieceFrom = i;
    const w = tokens[i];
    if (keep.has(i) || /^[,.;]$/.test(w)) { out.push(w); i += 1; continue; }
    // French departure clocks use 24-hour h notation. Rewrite only an
    // explicit start phrase, preserving durations and protected venue names.
    const departure = /^(?:depart|en partant|en commencant|commencer|a partir de)\s+(?:a\s+)?([01]?\d|2[0-3])\s*h(?:\s*([0-5]\d))?(?=$|[\s,.;])/.exec(tokens.slice(i, i + 8).join(' '));
    if (departure) {
      const consumed = departure[0].trim().split(/\s+/).length;
      if (!tokens.slice(i, i + consumed).some((_, n) => keep.has(i + n))) {
        const hour = Number(departure[1]);
        out.push(`starting at ${hour % 12 || 12}:${departure[2] || '00'} ${hour >= 12 ? 'pm' : 'am'}`);
        i += consumed; continue;
      }
    }
    // Brewery test 2 (Whistler, 2026-11-16): a French date (« le lundi 3 mai », « le 1er juin ») is that date in the English
    // the planner reads ("monday may 3"): it was read as the month alone, and its time was lost. Not inside a « du 3 au
    // 5 mai » range (handled below).
    const dm = /^(\d{1,2})(?:er)?$/.exec(w), monthEn = dm ? FR_DATE_MONTHS[tokens[i + 1]] : null;
    if (dm && monthEn && Number(dm[1]) >= 1 && Number(dm[1]) <= 31 && !keep.has(i + 1) && !(tokens[i - 1] === 'au' && /^\d{1,2}$/.test(tokens[i - 2] || '')) && tokens[i - 1] !== 'du') {
      if (out[out.length - 1] === 'the') { out.pop(); pieces.pop(); }
      out.push(`${monthEn} ${Number(dm[1])}`); i += 2; continue;
    }
    // Tour test 2 (Whistler, 2026-11-16): an age (« un enfant de 6 ans », « mon fils de 10 ans ») is "6 year old" in the
    // English the planner reads; « ans » was read as a search word (« Lieux qui mentionnent "ans" »).
    if (/^\d{1,2}$/.test(w) && (tokens[i + 1] === 'ans' || tokens[i + 1] === 'an') && !keep.has(i + 1)) {
      if (out[out.length - 1] === 'of') { out.pop(); pieces.pop(); }
      out.push(`${Number(w)} year old`); i += 2; continue;
    }
    // « à midi », « vers midi », « midi » alone: noon (« après-midi » is its own phrase and never reaches here).
    if (w === 'midi' || ((w === 'a' || w === 'vers') && tokens[i + 1] === 'midi' && !keep.has(i + 1))) {
      out.push(w === 'vers' ? 'around noon' : 'at noon'); i += w === 'midi' ? 1 : 2; continue;
    }
    // Restaurant test 2 (Whistler, 2026-11-14): a meal's French clock (« souper … à 20 h », « vers 19 h », « 20 h 30 »,
    // « à 20h30 ») is that time in the English the planner reads ("at 8:00 pm", "around 7:00 pm"). Only after « à »,
    // « vers », « pour » or « dès », or right after a meal word, so a duration (« 2 h de route ») is never a clock.
    const clock = /^(?:(a|vers|pour|des|autour de|aux alentours de)\s+)?([01]?\d|2[0-3])(?:\s*h(?:\s*([0-5]\d))?|h([0-5]\d)?)(?=$|[\s,.;])/.exec(tokens.slice(i, i + 6).join(' '));
    const afterMeal = /^(?:dinner|lunch|breakfast|brunch|dinners|lunches)$/.test(String(out[out.length - 1] || ''));
    if (clock && (clock[1] || afterMeal) && !(clock[0].split(/\s+/).length === 1 && !/h/.test(clock[0]))) {
      const consumed = clock[0].trim().split(/\s+/).length;
      if (!tokens.slice(i, i + consumed).some((_, n) => keep.has(i + n))) {
        const hour = Number(clock[2]), min = clock[3] || clock[4] || '00';
        out.push(`${/^(?:vers|autour de|aux alentours de)$/.test(clock[1] || '') ? 'around' : 'at'} ${hour % 12 || 12}:${min} ${hour >= 12 ? 'pm' : 'am'}`);
        i += consumed; continue;
      }
    }
    // Restaurant test 2: « après-ski » and « après » before a food or drink (« après sushi ») are the happy hour (5 à 7),
    // not "after" (or pubs).
    if (w === 'apres' && (tokens[i + 1] === 'ski' || APRES_FOOD.has(tokens[i + 1] || '')) && !keep.has(i + 1)) {
      out.push('happy hour'); i += tokens[i + 1] === 'ski' ? 2 : 1; continue;
    }
    // Calendar ranges must preserve both days before ordinary du/au grammar.
    if (w === 'du' && /^\d{1,2}$/.test(tokens[i+1] || '')) {out.push('from');i++;continue;}
    if (w === 'au' && /^\d{1,2}$/.test(tokens[i-1] || '') && /^\d{1,2}$/.test(tokens[i+1] || '')) {out.push('to');i++;continue;}
    // Routes and places: "de Squamish à Pemberton" -> "from squamish to
    // pemberton"; "à / en / au Whistler" -> "in whistler".
    const fr = Object.keys(REGION_FRENCH).find((p) => tokens.slice(i, i + p.split(' ').length).join(' ') === p);
    if (fr) { out.push(REGION_FRENCH[fr]); i += fr.split(' ').length; continue; }
    const nextRegion = regionAt(tokens, i + 1, places.regions);
    // Round 10 (2026-10-19): « de Pemberton à Squamish » is a route, and so is « Pemberton à Squamish » with no
    // « de » at all (the elided « d' » form is handled too): both were read "of pemberton in squamish", a trip that ran the wrong way.
    if ((w === 'de' || w === 'd' || w === 'depuis') && nextRegion && tokens.slice(i + 1 + nextRegion, i + 4 + nextRegion).some((x) => x === 'a' || x === 'vers' || x === 'jusqu')) {
      out.push('from'); fromOpen = true; i += 1; continue;
    }
    const hereRegion = fromOpen ? 0 : regionAt(tokens, i, places.regions);
    if (hereRegion && !['de', 'd', 'depuis', 'from', 'a', 'vers', 'en', 'au'].includes(tokens[i - 1] || '') && ['a', 'vers'].includes(tokens[i + hereRegion]) && regionAt(tokens, i + hereRegion + 1, places.regions)) {
      out.push('from', tokens.slice(i, i + hereRegion).join(' ')); fromOpen = true; i += hereRegion; continue;
    }
    if (w === 'jusqu' && tokens[i + 1] === 'a') { out.push(fromOpen ? 'to' : 'in'); fromOpen = false; i += 2; continue; }
    if ((w === 'a' || w === 'vers') && nextRegion) { out.push(fromOpen ? 'to' : 'in'); fromOpen = false; i += 1; continue; }
    if (w === 'a') {
      // "à la plage" -> "at the beach"; "à" alone is dropped otherwise.
      let n = 0;
      for (let len = Math.min(MAX_PHRASE_WORDS, tokens.length - i); len >= 2; len--) if (PHRASE_MAP.has(tokens.slice(i, i + len).join(' '))) { n = len; break; }
      if (!n) { out.push('at'); i += 1; continue; }
    }
    let matched = 0;
    for (let len = Math.min(MAX_PHRASE_WORDS, tokens.length - i); len >= 1; len--) {
      let clash = false;
      for (let k = 0; k < len; k++) if (keep.has(i + k) || /^[,.;]$/.test(tokens[i + k])) clash = true;
      if (clash) continue;
      const p = tokens.slice(i, i + len).join(' ');
      if (PHRASE_MAP.has(p)) { const en = PHRASE_MAP.get(p); if (en) out.push(en); matched = len; break; }
    }
    if (matched) { i += matched; continue; }
    // Distillery test 2: a hyphenated French word we don't know (« porte-monnaie ») stays one term, never two searches.
    if (hyphened.has(w + ' ' + (tokens[i + 1] || '')) && !keep.has(i + 1) && !PHRASE_MAP.has(tokens[i + 1])) { out.push(w + tokens[i + 1]); i += 2; continue; }
    out.push(w);
    i += 1;
  }
  return { text: out.join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim(), pieces, tokens };
}

module.exports = { tripPlannerText, isFrenchTripRequest, frenchWordsFor };
