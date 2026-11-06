'use strict';
// Build My Trip: everything that differs between the Roam sites. The planner files (trip-planner.js, discovery-intent.js,
// trip-requirements.js, trip-french-copy.js, trip-planner-fr.js, trip-planner-v3-page.js, trip-story.js,
// trip-event-location.js) are the same on every site; a new value belongs here, not in them.
const AREA = 'the Okanagan';
module.exports = {
  // Names and wording.
  brand: 'Okanagan Roam',
  brandWithArticle: 'An Okanagan Roam',
  brandFrOf: 'd’Okanagan Roam',
  area: AREA, // "ideas in the Okanagan"
  areaShort: 'Okanagan',
  areaPossessive: 'the Okanagan’s',
  coverage: 'the Okanagan Valley',
  stretchName: 'the valley', // "one stretch of the valley each day"
  timeName: 'Okanagan', // "(Okanagan time)"
  exampleTowns: 'Kelowna, Penticton or Vernon',
  bikeParkReason: 'A lift-access bike park',
  areaWords: ['okanagan'], // words of the area's own name: never part of an event's name
  occasionNotes: {
    celebration: 'Restaurants, lounges, wineries and group-friendly places come first for a celebration.',
    group_getaway: 'Wineries, breweries, lounges and group-friendly places come first for a group trip.',
    relaxing: 'A slower pace, with wineries, cafes, beaches and scenic outdoor stops first.',
    adults: 'An adults-only trip, so wineries, breweries and lounges are welcome.',
  },
  heuristicNotes: {
    celebration: 'Heuristic: favours restaurants, lounges, wineries and group-friendly places for a celebration -- not a verified venue attribute.',
    group_getaway: 'Heuristic: favours wineries, breweries, lounges and group-friendly places for a group trip -- not a verified venue attribute.',
    relaxing: 'Heuristic: favours a slower pace with wineries, cafes, beaches and scenic outdoor stops -- not a verified venue attribute.',
    adults: 'Heuristic: an adults-only trip; wineries, breweries and lounges are welcome -- not a verified venue attribute.',
  },
  // "a sunset dinner": a lake-view dinner here (the valley has plenty of lake-view listings).
  sunsetDinner: { re: /\bsunset dinners?\b|\bdinner (?:at|with|during|around|watching) (?:the |a )?sunset(?: view)?\b|\bdinner with a (?:sunset )?view\b/g, reading: ' dinner with a lake view ' },
  wineryNameStopWords: ['okanagan', 'lake'],
  lakeViewMeansLake: true, // the Lake View badge is a lake here (another site's also covers the sea and rivers)

  // Rules the two sites settled differently (see the parity report): the owner can make them the same by changing a value.
  dogMealsMustBeListed: true, // a dog trip's restaurants must carry the dog-friendly badge (false: others come last, with a note)
  winterBeachWalks: true, // a beach asked for in winter stays as a lakeside walk (false: no beach stops outside the season)

  // Places and routes.
  routeCorridor: ['enderby', 'armstrong', 'vernon', 'lake-country', 'kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton', 'kaleden', 'okanagan-falls', 'oliver', 'osoyoos'],
  routeOffCorridor: { coldstream: 'vernon', lumby: 'vernon', silverstar: 'vernon', 'big-white': 'kelowna', naramata: 'penticton', apex: 'penticton', baldy: 'oliver' },
  openRoadTrip: ['vernon', 'osoyoos'], // "road trip through the Okanagan" with no town runs the valley north to south
  regionDriveLegs: [], // measured drives between towns; none listed, so distances come from the listings' positions
  townCentres: {},
  wellKnownSights: [],
  notDayBaseRegions: [], // regions visited from a town, never a day's base
  village: null, // a town centre visitors call "the village"
  gatewayRegion: null,
  southGateway: null, // a start south of the area ("from Vancouver to ...")
  mountainForTown: {}, // on-mountain listings planned as part of the town below
  dayOnlyMountainRegions: [], // on-mountain restaurants that close with the lifts
  summerLiftSightRe: null,
  backcountryAskedRe: null,
  beachTownRe: null, // a town whose name says "beach"
  beachWordRe: /\bbeach(?:es)?\b/,
  lakesideWords: ['okanagan lake', 'skaha', 'kalamalka', 'wood lake', 'osoyoos lake'],
  // Okanagan Lake has one crossing (the bridge at Kelowna): a straight line over the water is not the drive.
  lakeCrossing: {
    centre: [[49.49,-119.6],[49.55,-119.625],[49.6,-119.615],[49.65,-119.64],[49.7,-119.66],[49.75,-119.665],[49.8,-119.6],[49.85,-119.53],[49.88,-119.505],[49.95,-119.505],[50.05,-119.47],[50.1,-119.43]],
    southEnd: { lat: 49.497, lng: -119.593 }, bridge: { lat: 49.876, lng: -119.505 }, eastSplit: 49.72, viaSouth: 'Penticton', viaBridge: 'the bridge',
  },
  curatedEventLocations: [
    {name:'prospera place',region:'kelowna',venueId:null,lat:49.89258,lng:-119.4954,
     address:'1223 Water St, Kelowna, BC V1Y 9V1',
     sources:['https://prosperaplace.com/contact-us/','https://mapcarta.com/W1225579073']},
    {name:'penticton trade and convention centre',region:'penticton',venueId:null,lat:49.4964026,lng:-119.6058051,
     address:'273 Power St, Penticton, BC V2A 7K9',
     sources:['https://www.openstreetmap.org/way/1026269633']},
    {name:'west bench elementary',region:'penticton',venueId:null,lat:49.5010705,lng:-119.631027,
     address:'1604 West Bench Dr, Penticton, BC',
     sources:['https://www.openstreetmap.org/way/1068313494']},
  ],

  // Skiing.
  skiHillRegions: ['big-white', 'silverstar', 'apex', 'baldy'],
  defaultSkiRegion: 'big-white',
  skiRegionForTown: { kelowna: 'big-white', 'west-kelowna': 'big-white', 'lake-country': 'big-white', peachland: 'big-white', vernon: 'silverstar', coldstream: 'silverstar', armstrong: 'silverstar', lumby: 'silverstar', enderby: 'silverstar', 'spallumcheen': 'silverstar', penticton: 'apex', summerland: 'apex', naramata: 'apex', kaleden: 'apex', keremeos: 'apex', 'okanagan-falls': 'apex', oliver: 'baldy', osoyoos: 'baldy' },
  skiVillageForHill: {},
  skiSeasonMonths: [12, 1, 2, 3],
  skiOffMonths: [5, 6, 7, 8, 9, 10],
  skiHillNameRe: /\b(?:big white|silver ?star|apex|baldy)\b/,
  skiTownLabels: null,
  // A plan in ski season with no ski day suggests one when it is in a town next to a hill.
  skiSuggestion: { months: [12, 1, 2, 3], hillNameRe: null, hillForTown: { 'big-white': 'big-white', silverstar: 'silverstar', apex: 'apex', baldy: 'baldy' } },

  // Plain strings only: this is embedded in the Build My Trip page for its French text.
  french: {
    elidedTowns: 'Osoyoos|Oliver|Okanagan|Armstrong|Enderby|Apex',
    brand: 'Okanagan Roam', brandWithArticle: 'An Okanagan Roam', ofBrand: 'd’Okanagan Roam',
    area: AREA, coverageFr: 'la vallée de l’Okanagan', coverage: 'the Okanagan Valley', stretch: 'the valley', timeName: 'Okanagan', exampleTowns: 'Kelowna, Penticton or Vernon', exampleTownsFr: 'Kelowna, Penticton ou Vernon',
    inArea: 'dans l’Okanagan', ofArea: 'de l’Okanagan', theArea: 'l’Okanagan', ofStretch: 'de la vallée',
    skiLead: 'The Okanagan’s ski hills usually run from December to early April', skiLeadFr: 'Les stations de ski de l’Okanagan sont en général ouvertes de décembre au début avril',
    snowRange: 'December to early April', snowRangeFr: 'de décembre au début avril',
    bikeNote: '', bikeNoteFr: '',
  },

  // Server-side tables for the planner's runner.
  defaultRegion: 'kelowna',
  nearTowns: {
  vernon: ['coldstream', 'silverstar', 'armstrong'], kelowna: ['west-kelowna', 'lake-country'], 'west-kelowna': ['kelowna', 'peachland'],
  'lake-country': ['kelowna', 'vernon'], peachland: ['summerland', 'west-kelowna'], summerland: ['penticton', 'peachland'],
  penticton: ['naramata', 'summerland', 'kaleden'], naramata: ['penticton'], kaleden: ['penticton', 'okanagan-falls'],
  'okanagan-falls': ['kaleden', 'oliver'], oliver: ['osoyoos', 'okanagan-falls'], osoyoos: ['oliver'], coldstream: ['vernon', 'lumby'],
  lumby: ['coldstream', 'vernon'], armstrong: ['enderby', 'vernon'], enderby: ['armstrong'], 'big-white': ['kelowna'], silverstar: ['vernon'],
  apex: ['penticton'], baldy: ['oliver'],
},
  skiHillBase: { apex: { town: 'penticton', minutes: 40 }, baldy: { town: 'oliver', minutes: 40 }, 'big-white': { town: 'kelowna', minutes: 50 }, silverstar: { town: 'vernon', minutes: 30 } },
  nameGenericWords: ['okanagan', 'kelowna', 'penticton', 'vernon', 'osoyoos', 'oliver'],
  commonNameWords: ['okanagan', 'kelowna', 'penticton', 'vernon', 'oliver', 'osoyoos', 'naramata', 'summerland', 'peachland', 'armstrong', 'enderby', 'lumby', 'kaleden', 'coldstream'],
  venueNicknames: [], // [[regex, listing name]]: local names for a place, from the request's own words

  // Published prices per person, checked November 6, 2026: [cents, label, French label, source]. A meal is one named
  // example, and a winery price is for the named tasting, without purchase discounts.
  stopPrices: {
    byUrl: {
      '/kelowna/restaurants/home-block-at-cedarcreek-estate-winery': [5000, 'Two-course lunch, food only', 'Dîner deux services, sans vin', 'https://www.cedarcreek.bc.ca/home-block-restaurant/lunch-menu/'],
      '/kelowna/wineries/the-view-winery-vineyard': [1000, 'Wine or cider flight', 'Dégustation de vin ou de cidre', 'https://theviewwinery.com/events-2/'],
      '/kelowna/wineries/spearhead-winery': [1500, 'Guided wine tasting', 'Dégustation guidée', 'https://www.spearheadwinery.com/visit-us/'],
      '/kelowna/restaurants/wildling': [6900, 'Sample dinner: turnips, tagliolini and crudo', 'Exemple de souper : navets, tagliolini et crudo', 'https://www.wildling.ca/'],
      '/kelowna/restaurants/soul-de-cuba-cafe': [2050, 'Classic Cuban sandwich', 'Sandwich cubain classique', 'https://souldecubacafe.ca/kelowna/index.php/menu/lunch'],
      '/kelowna/wineries/sandhill-wines': [1800, 'Signature tasting', 'Dégustation Signature', 'https://www.sandhillwines.ca/visit/tasting-room/'],
      '/kelowna/wineries/waldhof-family-estate-winery': [1000, 'Waldhof flight', 'Dégustation Waldhof', 'https://waldhofwine.ca/'],
      '/kelowna/restaurants/kasai-teppanyaki-steak-sushi-house': [4800, 'Teppan chicken dinner', 'Souper de poulet teppan', 'https://kasaiteppanyaki.ca/menu'],
      '/kelowna/restaurants/frankie-we-salute-you': [2275, 'Frankie cheeseburger', 'Cheeseburger Frankie', 'https://www.frankiewesaluteyou.com/menu'],
      '/kelowna/wineries/meadow-vista-honey-wines': [1000, 'Mead tasting', 'Dégustation d’hydromel', 'https://meadowvista.ca/pages/visit-us'],
      '/kelowna/wineries/summerhill-pyramid-winery': [1500, 'Earth Steward White tasting', 'Dégustation Earth Steward White', 'https://summerhill.bc.ca/tastings-experiences/'],
      '/kelowna/restaurants/derrick-s-steakhouse': [4000, 'Flat iron steak, sides extra', 'Steak flat iron, accompagnements en sus', 'https://www.derrickssteakhouse.ca/menus'],
    },
    byId: {},
  },

  // French requests: place words the interpreter turns into English.
  frenchRequests: { regions: { 'kelowna ouest': 'west kelowna', 'ouest de kelowna': 'west kelowna', 'chutes okanagan': 'okanagan falls' }, places: [], lakes: [['lac okanagan', 'okanagan lake']] },

  // The Build My Trip page.
  page: {
    regionSlugs: ['kelowna','west-kelowna','peachland','lake-country','naramata','penticton','kaleden','okanagan-falls','summerland','oliver','osoyoos','vernon','coldstream','lumby','armstrong','enderby','big-white','silverstar','apex','baldy'],
    mapBounds: { lat: [48.5, 51.5], lng: [-121.5, -117.5] },
    mapCentre: [49.75, -119.55],
    mapZoom: 9,
    addressSuffix: 'Okanagan Valley, BC',
    fallbackRegionLabel: 'Okanagan',
    timeLabel: 'Okanagan', timeLabelFr: 'de l’Okanagan',
    i18nAreaKey: 'tripv3.theOkanagan',
    storagePrefix: 'okanagan',
    siteUrl: 'https://okanaganroam.com',
    mapCredit: { en: 'Powered by Geoapify', fr: 'Fourni par Geoapify', url: 'https://www.geoapify.com/' },
    title: 'Build your Okanagan trip', titleFr: 'Planifiez votre voyage dans l’Okanagan',
    examples: ['3 days in Kelowna: wineries, easy walks and great food', '2 days in Penticton with the kids', 'A romantic weekend in Naramata', 'What can we do around Penticton if it rains?'],
    placeholder: 'Plan 3 days in Kelowna this autumn with some vineyards, some easy walks and some great food.',
    townExamples: {
      en: ['3 days in {n}: wineries, easy walks and great food', '2 days in {n} with the kids', 'A romantic weekend in {n}', 'What can we do around {n} if it rains?'],
      fr: ['3 jours \u00e0 {n}\u00a0: vignobles, promenades faciles et bonne bouffe', '2 jours \u00e0 {n} avec les enfants', 'Une fin de semaine romantique \u00e0 {n}', 'Que peut-on faire autour de {n} s\u2019il pleut?'],
      placeholderEn: 'Plan 3 days in {n} this autumn with some vineyards, some easy walks and some great food.',
      placeholderFr: 'Planifiez 3 jours \u00e0 {n} cet automne avec des vignobles, des promenades faciles et de la bonne bouffe.',
    },
    sampleTown: 'penticton',
    sampleText: 'ask for &ldquo;a happy hour crawl in Penticton&rdquo; and you get stops like Yellow Dog Brewing and BNA Brewing, each one timed inside its happy hour, with the deals.',
    sampleTitle: 'A happy hour crawl in Penticton',
    sampleStopLabel: { en: 'Happy hour', fr: 'Happy hour' },
  },
};
