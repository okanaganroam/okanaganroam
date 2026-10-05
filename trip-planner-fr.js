'use strict';

// ---------- Build My Trip: French requests (2026-10-04) ----------
//
// The planner's interpreter (discovery-intent.js) reads English. A French
// request ("3 jours à Kelowna avec des vignobles") is rewritten here, word for
// word and phrase for phrase, into the English the interpreter already
// understands ("3 days in kelowna with some vineyards"); everything after that
// is the same deterministic planner, so a French request can only reach the
// places, rules and facts an English one can.
//
// Only POST /api/trip/plan uses this (runTripPlan() in server.js); site search
// and /browse are unchanged. A request that is not recognised as French is
// returned exactly as given -- the same string -- so every English request
// plans byte-for-byte as before. A venue's own name inside a French request
// ("souper au Le Vieux Pin") is never translated.

const di = require('./discovery-intent.js');

// Unmistakably French words: one is enough. (Words English visitors also
// type -- pour, propose, organise, distilleries, belvedere -- are left out.)
const STRONG = new Set(('avec jours journee journees enfants enfant chien chiens chienne vignoble vignobles vin vins souper soupers '
  + 'randonnee randonnees rando plage plages pluie pleut pluvieux pluvieuse semaine nous je quoi faire voudrais voudrions '
  + 'aimerais aimerions cherche cherchons sejour itineraire activites demain aujourdhui lundi mardi mercredi jeudi '
  + 'vendredi samedi dimanche janvier fevrier avril juin juillet aout septembre octobre novembre decembre hiver printemps '
  + 'automne biere bieres microbrasserie microbrasseries degustation terrasse terrasses lac velo raquette raquettes baignade '
  + 'sentier sentiers famille amoureux romantique tranquille relaxe meilleurs meilleures meilleur endroits '
  + 'resto restos bouffe manger dejeuner deux trois quatre cinq huit dix planifie planifiez planifier organisez '
  + 'suggere suggerez recommande recommandez proposez vignes cave caves vinerie vineries distillerie '
  + 'nager peche plein exterieur interieur matin soir midi nuits beaucoup quelques sans pas une vue parcs joyaux favoris locaux '
  + 'chers cheres filles gars amis anniversaire musique planche pagaie').split(' '));
// Common French function words: two different ones are needed.
const WEAK = new Set(('le la les l des du de d un une et ou au aux en dans sur chez pour mon ma mes nos notre votre vos est sont '
  + 'que qui ce cette ces il y').split(' '));
// Of the STRONG words, the ones that are also English words some visitors type.
const STRONG_ENGLISH_TOO = new Set(['cave', 'caves', 'plein', 'peche']);

// French -> English, longest phrase first at every position. Values are the
// interpreter's own English phrases (discovery-intent.js), so nothing here
// can introduce a meaning the planner does not already have. '' drops a word.
const PHRASES = [
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
  ['aujourdhui', 'today'], ['aujourd hui', 'today'], ['ce matin', 'this morning'], ['cet apres midi', 'this afternoon'],
  ['ce soir', 'tonight'], ['demain', 'tomorrow'], ['maintenant', 'right now'], ['en ce moment', 'right now'],
  ['tout de suite', 'right now'], ['ce mois ci', 'this month'], ['ce mois', 'this month'],
  ['le matin', 'in the morning'], ['en matinee', 'in the morning'], ['matin', 'morning'],
  ['l apres midi', 'in the afternoon'], ['le apres midi', 'in the afternoon'], ['en apres midi', 'in the afternoon'], ['apres midi', 'afternoon'],
  ['le soir', 'in the evening'], ['en soiree', 'in the evening'], ['soir', 'evening'], ['soiree', 'evening'], ['la nuit', 'at night'],
  ['pendant la journee', 'during the day'], ['de jour', 'by day'],
  ['lundi', 'monday'], ['mardi', 'tuesday'], ['mercredi', 'wednesday'], ['jeudi', 'thursday'], ['vendredi', 'friday'],
  ['samedi', 'saturday'], ['dimanche', 'sunday'],
  ['en mai', 'in may'], ['mai', 'in may'], ['janvier', 'january'], ['fevrier', 'february'], ['mars', 'march'], ['avril', 'april'],
  ['juin', 'june'], ['juillet', 'july'], ['aout', 'august'], ['septembre', 'september'], ['octobre', 'october'],
  ['novembre', 'november'], ['decembre', 'december'],
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
  ['petit dejeuner', 'breakfast'], ['petits dejeuners', 'breakfasts'], ['dejeuner', 'breakfast'], ['dejeuners', 'breakfasts'],
  ['diner', 'lunch'], ['diners', 'lunches'], ['souper', 'dinner'], ['soupers', 'dinners'],
  ['bonne bouffe', 'great food'], ['bonne nourriture', 'great food'], ['bonne cuisine', 'great food'], ['bonne table', 'great food'],
  ['bien manger', 'great food'], ['gastronomie', 'great food'], ['bouffe', 'food'], ['nourriture', 'food'], ['cuisine', 'food'],
  ['manger', 'eat'], ['repas', 'food'], ['resto', 'restaurant'], ['restos', 'restaurants'],
  ['prendre un cafe', 'coffee'], ['un cafe', 'coffee'], ['cafe', 'cafe'], ['cafes', 'cafes'],
  ['boulangerie', 'bakery'], ['boulangeries', 'bakery'], ['patisserie', 'bakery'], ['patisseries', 'bakery'],
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
  ['microbrasserie', 'brewery'], ['microbrasseries', 'breweries'], ['brasserie', 'brewery'], ['brasseries', 'breweries'],
  ['biere', 'beer'], ['bieres', 'beers'], ['distillerie', 'distillery'], ['distilleries', 'distilleries'],
  ['bar a cocktails', 'cocktail bar'], ['bar a cocktail', 'cocktail bar'], ['bars a cocktails', 'cocktail bars'],
  ['cinq a sept', 'happy hour'], ['5 a 7', 'happy hour'], ['apero', 'happy hour'], ['aperitif', 'happy hour'],
  ['sans alcool', 'non alcoholic'], ['bar sportif', 'sports bar'], ['bars sportifs', 'sports bars'],
  ['regarder le match', 'watch the game'], ['regarder le hockey', 'watch the hockey'], ['sports a la tele', 'sports tv'],
  // outdoors
  ['plage pour chiens', 'dog beach'], ['plage pour chien', 'dog beach'], ['plages pour chiens', 'dog beaches'],
  ['plage canine', 'dog beach'], ['plages canines', 'dog beaches'], ['plage', 'beach'], ['plages', 'beaches'],
  ['se baigner', 'swimming'], ['baignade', 'swimming'], ['nager', 'swim'], ['natation', 'swimming'],
  ['parc provincial', 'provincial park'], ['parc regional', 'regional park'], ['parc', 'park'], ['parcs', 'parks'],
  ['en plein air', 'outdoors'], ['plein air', 'outdoors'], ['exterieur', 'outside'], ['dehors', 'outside'],
  ['faire de la randonnee', 'hiking'], ['randonnee pedestre', 'hiking'], ['randonnee', 'hike'], ['randonnees', 'hikes'],
  ['rando', 'hike'], ['randos', 'hikes'], ['randonner', 'hiking'], ['sentier pedestre', 'walking trail'],
  ['sentiers pedestres', 'walking trails'], ['marche en nature', 'nature walk'], ['marches en nature', 'nature walks'],
  ['hors des sentiers battus', 'off the beaten path'], ['sentier', 'trail'], ['sentiers', 'trails'],
  ['faire du velo', 'biking'], ['velo de montagne', 'mountain biking'], ['vtt', 'mountain biking'],
  ['piste cyclable', 'bike trail'], ['pistes cyclables', 'bike trails'], ['balade a velo', 'bike ride'], ['velo', 'bike'],
  ['ski de fond', 'cross country skiing'], ['skier', 'skiing'], ['raquette a neige', 'snowshoeing'], ['raquettes', 'snowshoeing'],
  ['raquette', 'snowshoeing'], ['patinage', 'skating'], ['patiner', 'skating'], ['patin', 'skating'], ['glissade sur tube', 'tubing'],
  ['activites d hiver', 'winter activities'], ['terrain de camping', 'campground'], ['terrains de camping', 'campgrounds'],
  ['camper', 'camping'], ['observation des oiseaux', 'birdwatching'], ['ornithologie', 'birdwatching'], ['faune', 'wildlife'],
  ['milieux humides', 'wetlands'], ['planche a pagaie', 'paddleboarding'], ['surf a pagaie', 'paddleboarding'],
  ['pagaie', 'paddling'], ['canot', 'canoe'], ['location de bateau', 'boat rental'], ['bateau', 'boating'],
  ['points de vue', 'viewpoints'], ['point de vue', 'viewpoint'], ['belvedere', 'lookout'], ['belvederes', 'lookouts'],
  ['vue panoramique', 'scenic view'], ['vues panoramiques', 'scenic views'], ['tyrolienne', 'zipline'], ['tyroliennes', 'zipline'],
  ['aventure', 'adventure'], ['aventures', 'adventures'], ['aventureux', 'adventurous'], ['sensations fortes', 'thrills'],
  ['aller a la peche', 'fishing'], ['peche', 'fishing'], ['pecher', 'fishing'],
  ['jouer au golf', 'golf'], ['terrain de golf', 'golf course'], ['terrains de golf', 'golf courses'],
  ['parcours de golf', 'golf course'], ['golfer', 'golf'],
  ['vue sur le lac', 'lake view'], ['vue sur lac', 'lake view'], ['vue sur la lac', 'lake view'],
  ['au bord du lac', 'by the lake'], ['bord du lac', 'by the lake'], ['pres du lac', 'by the lake'], ['sur le lac', 'on the lake'],
  ['au bord de l eau', 'waterfront'], ['bord de l eau', 'waterfront'], ['lac okanagan', 'okanagan lake'], ['lac', 'lake'], ['lacs', 'lakes'],
  ['terrasse', 'patio'], ['terrasses', 'patios'],
  // events
  ['musique live', 'live music'], ['musique en direct', 'live music'], ['musique sur scene', 'live music'],
  ['spectacle', 'live show'], ['spectacles', 'live shows'], ['evenement', 'event'], ['evenements', 'events'],
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
  ['adultes seulement', 'adults only'], ['entre adultes', 'adults only'], ['sans enfants', 'no kids'], ['sans les enfants', 'no kids'],
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
  // dietary
  ['sans gluten', 'gluten free'], ['coeliaque', 'celiac'], ['vegetalien', 'vegan'], ['vegetalienne', 'vegan'],
  ['vegetaliens', 'vegan'], ['vegane', 'vegan'], ['vegetarien', 'vegetarian'], ['vegetarienne', 'vegetarian'],
  ['vegetariens', 'vegetarian'], ['vegetariennes', 'vegetarian'],
  // places worth finding
  ['joyau cache', 'hidden gem'], ['joyaux caches', 'hidden gems'], ['perle rare', 'hidden gem'], ['perles rares', 'hidden gems'],
  ['tresor cache', 'hidden gem'], ['tresors caches', 'hidden gems'], ['endroit secret', 'secret spot'],
  ['endroits secrets', 'secret spots'], ['meconnu', 'underrated'], ['meconnus', 'underrated'], ['meconnues', 'underrated'],
  ['coins secrets', 'secret spots'], ['coin secret', 'secret spot'], ['coups de coeur', 'local favourites'], ['coup de coeur', 'local favourite'],
  ['favoris locaux', 'local favourites'], ['favori local', 'local favourite'], ['coups de coeur locaux', 'local favourites'],
  ['ou vont les gens du coin', 'where locals go'], ['ou vont les locaux', 'where locals go'], ['gens du coin', 'locals'],
  // budget
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
];
const PHRASE_MAP = new Map();
for (const [fr, en] of PHRASES) if (!PHRASE_MAP.has(fr)) PHRASE_MAP.set(fr, en);
const MAX_PHRASE_WORDS = Math.max(...PHRASES.map(([fr]) => fr.split(' ').length));
const REGION_FRENCH = { 'kelowna ouest': 'west kelowna', 'ouest de kelowna': 'west kelowna', 'chutes okanagan': 'okanagan falls' };

// Lowercase, accents removed, French elisions split ("l'eau" -> "l eau",
// "s'il" -> "si il"), commas and semicolons kept (they separate trip parts).
function tokenize(text) {
  return String(text)
    .slice(0, di.DISCOVERY_MAX_TEXT_LENGTH)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae') // "cœur" -> "coeur"
    .replace(/[‘’`]/g, "'")
    .replace(/\bs'(ils?)\b/g, 'si $1')
    .replace(/\b(l|d|j|qu|n|m|t|c|s|jusqu|lorsqu|puisqu)'/g, '$1 ')
    .replace(/'s\b/g, 's')
    .replace(/[-–—_/]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s*[,;]\s*/g, ' , ')
    .replace(/[^a-z0-9\s,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
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
  const names = venues
    .map((v) => di.normalizeDiscoveryText(v && v.name).split(' ').filter(Boolean))
    .filter((w) => w.length >= 2);
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

// A standalone "à" ("3 jours à Kelowna") is French; English borrows it only
// in "à la carte" and "à la mode".
const A_GRAVE = /(?:^|[\s,;:(\[«"'])\u00e0(?=$|[\s,;:.!?)\]»"'])(?!\s+la\s+(?:carte|mode)\b)/i;
function isFrenchTokens(tokens, keep, text) {
  if (A_GRAVE.test(String(text).normalize('NFC'))) return true;
  let strong = 0;
  const weak = new Set();
  tokens.forEach((w, i) => {
    if (keep.has(i)) return;
    if (STRONG.has(w) && !STRONG_ENGLISH_TOO.has(w)) strong += 1;
    else if (WEAK.has(w)) weak.add(w);
  });
  return strong >= 1 || weak.size >= 2;
}
function isFrenchTripRequest(text, taxonomy) {
  if (typeof text !== 'string') return false;
  const tokens = tokenize(text);
  return isFrenchTokens(tokens, protectedPositions(tokens, placesFor(taxonomy).names), text);
}

// The request the planner reads: the English rewrite of a French request, or
// the original string, unchanged, for anything else.
function tripPlannerText(text, taxonomy) {
  if (typeof text !== 'string') return text;
  const tokens = tokenize(text);
  const places = placesFor(taxonomy);
  const keep = protectedPositions(tokens, places.names);
  if (!isFrenchTokens(tokens, keep, text)) return text;
  const out = [];
  let fromOpen = false;
  for (let i = 0; i < tokens.length;) {
    const w = tokens[i];
    if (keep.has(i) || w === ',') { out.push(w); i += 1; continue; }
    // Routes and places: "de Kelowna à Penticton" -> "from kelowna to
    // penticton"; "à / en / au Kelowna" -> "in kelowna".
    const fr = Object.keys(REGION_FRENCH).find((p) => tokens.slice(i, i + p.split(' ').length).join(' ') === p);
    if (fr) { out.push(REGION_FRENCH[fr]); i += fr.split(' ').length; continue; }
    const nextRegion = regionAt(tokens, i + 1, places.regions);
    if ((w === 'de' || w === 'depuis') && nextRegion && tokens.slice(i + 1 + nextRegion, i + 4 + nextRegion).some((x) => x === 'a' || x === 'vers' || x === 'jusqu')) {
      out.push('from'); fromOpen = true; i += 1; continue;
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
      for (let k = 0; k < len; k++) if (keep.has(i + k) || tokens[i + k] === ',') clash = true;
      if (clash) continue;
      const p = tokens.slice(i, i + len).join(' ');
      if (PHRASE_MAP.has(p)) { const en = PHRASE_MAP.get(p); if (en) out.push(en); matched = len; break; }
    }
    if (matched) { i += matched; continue; }
    out.push(w);
    i += 1;
  }
  return out.join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
}

module.exports = { tripPlannerText, isFrenchTripRequest };
