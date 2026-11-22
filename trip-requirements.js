'use strict';
const SITE=require('./trip-site.js');
// Pure planner-only interpretation and verification. No writes, network or AI.
const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const DINING = new Set(['restaurant','cafe','pub','cocktail','brewery']);
const SPORT_KINDS = {bmx:/\bbmx\b/,skatepark:/\bskate ?parks?\b/,disc_golf:/\bdisc golf\b/,tennis:/\btennis\b/,pickleball:/\bpickleball\b/};
const KINDS = {
  challenging_hike: /\b(?:challenging|strenuous|steep|difficult)(?: \w+){0,2} (?:hikes?|hiking|trails?)\b/,
  easy_walk: /\b(?:easy|gentle|flat|short) (?:walk|walks|walking trail|walking path|hikes?|hiking trail)\b/,
  walk: /\b(?:walk|walks|walking trails?|walking paths?|promenade|walkway|stroll|boardwalk|seawall)\b/,
  // Indoor test 9 (2026-11-19): a science or discovery centre is a museum.
  // Indoor test 10: an art museum is a gallery.
  // Indoor test 11 (2026-11-19; "hands-on science for kids Vernon" found a class place): hands-on science is a museum too.
  museum: /\b(?:(?<!art )museums?|science (?:centres?|centers?)|discovery (?:centres?|centers?)|hands on science|science (?:for kids|exhibits?|museums?)|planetariums?)\b/,
  gallery: /\b(?:galler(?:y|ies)|art warehouse|arts? centre|arts? center|art museums?)\b/,
  escape: /\b(?:escape (?:rooms?|games?)|puzzle rooms?)\b/,
  // Round 2 fresh eyes (2026-11-22; "a cheap evening in Vernon tonight, with dinner and something to do" was a pizza and
  // nothing else): "something to do" with dinner or an evening is one evening activity: a place to bowl, play, climb or
  // watch a film (these are a listing's own words; the request's words are REQUEST_KINDS.evening_fun, read only with a
  // dinner or an evening).
  evening_fun: /\b(?:bowling|bowling alley|lanes|ten ?pin|5 pin|five pin|escape (?:rooms?|games?)|arcades?|laser tag|virtual reality|vr|climbing gyms?|climbing (?:centres?|centers?)|bouldering|trampoline parks?|cinemas?|cineplex|movie theat(?:re|er)s?|axe throwing|billiards|pool hall|mini ?golf|go ?karts?|karaoke|pinball)\b/,
  // Indoor test 4 (2026-11-19): the bowling words of indoor-kinds.js too (tenpin, 5-pin, « quilles »).
  bowling: /\b(?:bowling|bowling alley|lanes|ten ?pin|5 pin|five pin|10 pin|quilles)\b/,
  climbing: /\b(?:climbing gyms?|climbing walls?|bouldering|indoor (?:rock )?climbing|trampoline parks?|trampolines?|ninja (?:gyms?|parks?|courses?)|parkour|escalade de bloc|centre d escalade|salle d escalade)\b/,
  arcade: /\b(?:arcades?|laser tag|virtual reality|vr (?:games?|arcades?|centres?|centers?)|realite virtuelle)\b/,
  // Indoor test 9 (2026-11-19): a cinema is its own kind ("movie theatre" is a cinema, never live theatre).
  theatre: /\b(?:(?<!movie )(?<!picture )theatres?|(?<!movie )(?<!picture )theaters?|performing arts|playhouses?)\b/,
  cinema: /\b(?:cinemas?|cineplex|movie theat(?:re|er)s?|movies?|picture house|salle de cinema)\b/,
  // Indoor test 9 (2026-11-19; Melissa's play centre: "indoor playground Kelowna" read only "indoor"): every indoor kind
  // is a planner kind, read from the request and from a listing's own words. An outdoor playground is a park.
  playground: /\b(?:indoor (?:playgrounds?|play(?: centres?| centers?| areas?| places?| spaces?)?)|play (?:centres?|centers?|places?|cafes?)|playplaces?|soft play|toddler play|kids? play (?:centres?|centers?|areas?|zones?)|bouncy castles?|aires? de jeux interieures?|centres? de jeux)\b/,
  pool: /\b(?:indoor pools?|swimming pools?|leisure pools?|wave pools?|public pools?|lane swim(?:ming)?|public swim(?:ming)?|aquatic (?:centres?|centers?)|aquatics? centres?|rec(?:reation)? (?:centres?|centers?)|piscines?(?: interieures?)?|bain libre|centre aquatique|centre recreatif|aqua ?fit|water aerobics|swim(?:ming)? lessons?)\b/,
  // Indoor test 10 (2026-11-19; Sandra's pool has a hot tub, sauna and steam room: "hot tub Vernon" planned Kelowna spas):
  // a hot tub or sauna is its own kind, any indoor place whose own words say one (a spa, a pool's hot tub). A request for
  // it alone is not a spa request (extractTripRequirements).
  sauna: /\b(?:hot ?tubs?|saunas?|steam rooms?|whirlpools?|bains? a remous|bains? tourbillons?)\b/,
  curling: /\b(?:curling(?: clubs?| rinks?)?|learn to curl)\b/,
  yoga: /\b(?:yoga|hot yoga|pilates|barre (?:class(?:es)?|studios?)|spin class(?:es)?|fitness class(?:es)?|yoga chaud)\b/,
  casino: /\b(?:casinos?|slot machines?|slots|poker|table games|machines a sous)\b/,
  library: /\b(?:librar(?:y|ies)|story ?time|bibliotheques?|heure du conte)\b/,
  spa: /\b(?:spas?|thermal spa|sauna experience|saunas?|floating sauna|massages?|wellness|facials?|hydrotherapy|hydrotherapie|soins? du visage|steam rooms?|nordic spa|spa nordique)\b/, // 2026-10-25: saunas and wellness studios; indoor test 4: facials and hydrotherapy
  wine_tour: /\b(?:wine tours?|winery tours?|vineyard tours?)\b/,
  // Tour test 5 (Whistler, 2026-11-17): jet boats and boat charters are boat tours too ("boat charter", "yacht charter"; a
  // bare "charter" in a request is REQUEST_KINDS.boat_tour).
  // Tour test 14 broader pass: sailing trips, sailing lessons and sunset sails (Canadian Coastal Sailing, InFlow, Squamish
  // Watersports) are boat tours too.
  boat_tour: /\b(?:sailing(?: (?:trips?|tours?|cruises?|lessons?|courses?|excursions?|days?|charters?))?|sailboats?(?: (?:tours?|trips?|rides?))?|(?:sunset |shared |private )?sails|yacht (?:tours?|trips?|cruises?)|boat tours?|boat rides?|boat trips?|boat cruises?|boating|lake cruises?|cruises?|jet ?boat(?:ing|s)?(?: tours?| rides?| trips?)?|jetboat\w*|(?:boat|yacht|sailing) charters?)\b/,
  // Tour test 5: "fishing charter", "fishing trip", "salmon fishing" ask for a fishing operator (they planned lakes and
  // trails). A listing is one when it is a tour whose operator picked Fishing or whose own words say fishing
  // (inferPlannerKinds). A bare "fishing" stays the fishing activity (lakes, rivers and the operators).
  fishing_tour: /\b(?:fishing (?:charters?|trips?|tours?|guides?|guiding|excursions?|adventures?|boats?)|guided fishing|salmon fishing|sturgeon fishing|sport ?fishing|charter fishing|fly fishing (?:trips?|tours?|guides?))\b/,
  // Every tour kind (2026-11-17): heli-skiing and cat-skiing are tours (they read as the skiing activity and found nothing).
  // From Whistler Roam #188 (2026-11-17): a snowcat tour (sightseeing in a snowcat) is not cat-skiing; it found only heli-ski companies.
  heli_ski: /\b(?:heli ?ski(?:ing|s)?|heliski\w*|heli ?board\w*|cat ?ski(?:ing|s)?|catski\w*|snowcat skiing)\b/,
  // Every tour kind (2026-11-17): guided bike and paddle tours ("guided bike tour", "guided kayak tour" listed every tour in town).
  // Tour test 14 broader pass: bike lessons, skills coaching and bike camps (Dialed In Cycling, Ride BC, Arbutus Routes).
  bike_tour: /\b(?:(?:mountain |mtb |kids? )?bike (?:lessons?|coaching|camps?|clinics?|schools?|skills (?:lessons?|clinics?|coaching|camps?))|mtb (?:lessons?|coaching|camps?|clinics?|skills)|(?:bike |riding )?skills coaching|(?:guided |mountain |road |gravel )?(?:e-?)?bike tours?|cycling tours?|guided (?:e-?)?(?:bike|biking|cycling) (?:rides?|trips?)|bike guid\w*|e-?bike tours?)\b/,
  // Tour test 15: "sunset paddle", "evening paddle", "paddleboarding tour" (SUP) and "canoe/kayak/SUP tour" too.
  paddle_tour: /\b(?:(?:guided )?(?:kayak(?:ing)?|canoe(?:ing)?|sup|paddle ?board(?:ing)?|paddleboarding|paddling|paddle) (?:tours?|trips?|excursions?|lessons?|outings?)|guided (?:kayak|canoe|paddl)\w*|(?:sunset|sunrise|evening|moonlight|full moon|twilight) (?:kayak\w*|canoe\w*|paddl\w*|sup)|(?:sup|kayak|canoe)(?:\s*(?:\/|or|and|&)\s*(?:sup|kayak|canoe))+ (?:tours?|trips?))\b/,
  // Every tour kind: a rental shop listed as a tour ("Rentals"); "equipment rentals" planned a museum. Only plain rental
  // words: "bike rental", "boat rental" keep what they found before.
  // Tour test 6 (Whistler, 2026-11-17): "E-bike rental", "kayak rental", "ski rental" (and « location de vélos électriques »,
  // which reads "e-bike rental") are rentals too: the rental outfitters first, shops that rent after (it planned ski shops).
  rentals: /\b(?:(?:equipment|gear|outdoor gear|adventure gear|(?:e-?)?bikes?|bicycles?|kayaks?|canoes?|sups?|paddle ?boards?|skis?|snowboards?|snowshoes?|boats?) (?:rentals?|hire)|rentals)\b/,
  // Tour test 7 (Whistler, 2026-11-17; Erik, a mountain guide in Pemberton): ski touring, avalanche courses, multi-day
  // trips and mountain guiding are kinds of tour. "Ski touring in Pemberton" planned Whistler heli-skiing (it read as the
  // skiing activity plus the word "touring"); "avalanche course" (one course) found nothing; hut trips planned a day out.
  ski_touring: /\b(?:ski touring|ski tours?|backcountry ski(?:ing|s|er|ers)?|backcountry (?:snowboard\w*|splitboard\w*|touring)|splitboard\w*|ski mountaineering|skimo|alpine touring|touring skis?|ski de randonnee)\b/,
  avalanche_course: /\b(?:avalanche (?:courses?|training|safety (?:courses?|training)|skills(?: training)?(?: courses?)?|awareness(?: courses?)?|class(?:es)?|certification)|ast ?(?:1|2|one|two)|ast courses?)\b/,
  // Only a trip that says hut, trek, expedition, traverse or overnight hike: "a 3 day trip to Kelowna" stays a 3-day plan.
  multi_day_tour: /\b(?:hut (?:trips?|to hut|tours?|hikes?|hiking|stays?|traverses?|treks?|trekking)|multi ?day (?:hikes?|hiking|treks?|trekking|tours?|expeditions?|traverses?|adventures?|ski tours?|backpacking|guided trips?|hut trips?|mountaineering)|(?:\d{1,2}|two|three|four|five|six|seven) ?days? (?:hut|guided|backcountry|ski touring|hiking|trekking|mountaineering|alpine) (?:trips?|tours?|treks?|traverses?|expeditions?)|(?:\d{1,2}|two|three|four|five|six|seven) ?days? (?:treks?|traverses?|expeditions?|backpacking trips?)|overnight (?:hikes?|hiking trips?|treks?|backcountry trips?|ski tours?|hut trips?|mountaineering)|backpacking trips?|guided expeditions?|overnight (?:horse(?:back)? )?(?:pack trips?|horse(?:back)? trips?|rides?|riding trips?|trail rides?)|(?:horse(?:back)? )?pack trips?)\b/,
  // Tour test 14 broader pass: rock climbing lessons, courses, guides, schools and camps (Squamish Rock Guides, Squamish
  // Climbing Academy, Mountain Skills Academy); a climbing gym stays KINDS.climbing.
  mountain_guide: /\b(?:rock climbing (?:lessons?|courses?|guides?|guiding|schools?|camps?|trips?|tours?|instruction|instructors?)|(?:outdoor )?climbing (?:schools?|courses?|lessons?|camps?|guides?|instruction|instructors?)|learn to (?:rock )?climb|guided (?:rock )?climbing|mountain guid\w*|mountaineering|alpinism|alpine climb\w*|glacier (?:mountaineering|travel|climb\w*|skills)|guided (?:climbs?|ascents?|summits?)|ice climb\w*|acmg|ifmga)\b/,
  guided_hike: /\b(?:guided hikes?|guided hiking|hiking tours?)\b/,
  cooking: /\bcooking class(?:es)?\b/,
  pottery: /\b(?:pottery|ceramics?) (?:classes?|workshops?|studio)?\b/,
  park: /\b(?<!adventure )(?<!aerial )parks?\b/, // tour test 6: an adventure park is not a park
  // Tour test 10 (Whistler, 2026-11-18; Gord): "pony ride" (one), "horse pack trip" and "overnight horse trip" are riding too
  // (the pony ride found nothing; the pack trip planned a Squamish day).
  horseback: /\b(?:horseback riding|horseback rides?|horseback|horse riding|horse rides?|trail rides?|horse riding tours?|pony rides?|ponies|pony|(?:horse(?:back)? )?pack(?:ing)? trips?|horse(?:back)? (?:trips?|treks?|camping)|trail riding)\b/, // 2026-10-25: "a horseback ride"
  sunset: /\b(?:sunset|sunsets)\b/,
  // Every tour kind (2026-11-17): the request's "dog sledding" reaches here as "dog sled" (REQUEST_SYNONYMS); it listed every tour.
  // Tour test 8 (Whistler, 2026-11-17): "husky sled ride", "sled dog tour", "mushing" and "mush your own team" are dog
  // sledding too ("husky sled ride" found nothing; "sled dog tour" read as a dog in the party).
  snow_tour: /\b(?:dog ?sled(?:s|ding)?(?: tours?| rides?| trips?)?|sled ?dogs?(?: tours?| rides?| trips?)?|husk(?:y|ies)(?: sled)?(?: tours?| rides?| trips?)?|sled rides?|(?:dog )?mush(?:ing|ers?)?)\b/,
  // Tour test 10 (Whistler, 2026-11-18; Gord, a ranch with horse-drawn sleigh rides): a sleigh ride is its own kind (the
  // operator's Sleigh rides kind, or a listing whose own words say sleigh); it was dog sledding's, so "dog sledding" could
  // plan a sleigh ride and a sleigh ride a dog-sled kennel. "Sled ride" stays dog sledding's.
  sleigh_ride: /\b(?:(?:horse[- ]drawn )?sleigh(?: rides?| tours?| trips?)?|sleighs|horse[- ]drawn (?:sleds?|wagon|carriage)(?: rides?)?|sleigh ?rid\w*)\b/,
  // Tour test 8: a kennel visit or a puppy visit is the summer product of a dog-sledding operator (it planned dog walks
  // and pubs). Asked as "kennel tour", "puppy visit", "meet the huskies"; a listing is one when it is a tour whose own
  // words say kennel or puppies (inferPlannerKinds).
  kennel_visit: /\b(?:kennels? (?:tours?|visits?)|(?:visit(?:ing)?|tour(?:ing)?) (?:the |a |our )?kennels?|pupp(?:y|ies) (?:visits?|tours?|cuddles?|cuddling|play\w*)|meet (?:the )?(?:huskies|pupp(?:y|ies)|sled dogs))\b/,
  // Every tour kind (2026-11-17): a guided snowshoe tour is its own kind of tour (it read as the snowshoeing activity).
  snowshoe_tour: /\b(?:snowshoe tours?|guided snowshoe\w*|snowshoe (?:trips?|outings?|excursions?))\b/,
  // Sea to Sky adventures (2026-10-25): matched in the request and in each tour's own name and description.
  zipline: /\b(?:zip ?lines?|zip ?lining|ziplining|zip trek|ziptrek)\b/,
  // Tour test 6 (Whistler, 2026-11-17): "adventure park" / « parc d'aventure » planned one hard hike. An adventure park is
  // a tour whose operator picked the adventure kind (ATV, bungee, climbing, ropes courses…) or any listing whose own name
  // or category says adventure park, treetop or ropes course.
  adventure_park: /\b(?:adventure parks?|aerial (?:adventure )?(?:parks?|courses?)|tree ?top (?:courses?|adventures?|parks?|trekking)|ropes? courses?|high ropes)\b/,
  bungee: /\b(?:bungee|bungy)(?: jumps?| jumping)?\b/,
  rafting: /\b(?:rafting|white ?water rafting|river rafts?|raft trips?|raft tours?)\b/,
  // Tour test 13 (Whistler, 2026-11-18; Matthias, tandem paragliding in Pemberton): paragliding, skydiving, hang gliding and
  // speed flying are their own kind ("paragliding" was only the generic Adventure activity, "paraglide" matched nothing).
  // The request's French « parapente », « parachutisme » and « deltaplane » arrive as English (trip-planner-fr.js). A
  // listing is one when it is a tour whose operator picked the Paragliding kind, or whose own words (name, category, Known
  // for, typed tours) say so (inferPlannerKinds).
  // Tour test 14 (Whistler, 2026-11-18; Lucía, private ski and snowboard lessons): ski and snowboard lessons, ski schools,
  // instructors, kids' ski camps and adaptive skiing are their own kind ("ski lessons" collapsed into a resort ski day,
  // "adaptive ski lessons" found nothing). The request's French « cours de ski », « leçons de ski », « moniteur » and
  // « école de ski » arrive as English (trip-planner-fr.js). A listing is one when it is a tour whose operator picked the
  // Ski and snowboard lessons kind, or whose own words (name, category, Known for, typed tours) say so (inferPlannerKinds).
  // Gboard's "snow board" counts as snowboard. A bare "instructor" or "private lesson" is REQUEST_KINDS.ski_lessons.
  // Sport test 5 (2026-11-20): first-timers and beginners who ski or ride ask for lessons ("first time skiing", "never skied").
  ski_lessons: /\b(?:(?:private |group |semi private |kids? |children s |childrens |child |adult |adults |adaptive |beginner |first time |nordic |cross country |skate |classic )?(?:ski|skiing|snow ?board|snow ?boarding|ski (?:and|&|or) snow ?board|ski snow ?board|nordic ski|cross country ski) (?:lessons?|schools?|instructors?|instruction|coaching|coach|clinics?|camps?|classes|class|courses?|programs?|teachers?)|learn(?:ing)? to (?:ski|snow ?board)|(?:private|kids?|adaptive) (?:ski |snow ?board )?lessons?|adaptive (?:ski\w*|snow ?board\w*|sports? programs?)|sit ?skis?|sit ?skiing|(?:first time|first timers?|beginners?|never been) (?:skiing|skiers?|snow ?boarding|snow ?boarders?|on skis|on a snow ?board)|(?:never|haven t|have not) (?:skied|snow ?boarded)|learn(?:ing)? how to (?:ski|snow ?board))\b/,
  // Tour test 14 broader pass (Whistler's real tours, 2026-11-18): kiteboarding and wing foil lessons (Squamish Watersports,
  // InFlow Adventure Co.) and target shooting (Whistler Shooting Adventures, the Whistler Olympic Park biathlon range).
  kite_lessons: /\b(?:kite ?board\w*|kite ?surf\w*|kite|kiting|wing ?foil\w*|wing ?surf\w*|wind ?surf\w*|wake ?board\w*|foil(?:ing)?) (?:lessons?|schools?|clinics?|coaching|courses?|camps?|classes|instruction)\b/,
  shooting: /\b(?:target shooting|shooting (?:ranges?|lessons?|sessions?|experiences?|adventures?)|guided shooting|clay (?:shooting|pigeons?)|trap shooting|skeet|biathlon\w*|rifle (?:range|shooting))\b/,
  paragliding: /\b(?:(?:tandem )?para ?glid\w*|para ?glides?|parapent\w*|sky ?div\w*|sky ?dives?|parachut\w*|hang ?glid\w*|hang ?glides?|speed ?fly\w*|speed ?flight|speed ?riding|paramotor\w*|deltaplane\w*)\b/,
  // Tour test 3 (Whistler, 2026-11-17): a tour's own words "Scenic or helicopter flights" / "Helicopter & scenic flights".
  scenic_flight: /\b(?:float ?planes?|seaplanes?|scenic flights?|scenic (?:or|and) helicopter flights?|helicopter (?:tours?|flights?|sightseeing)|heli (?:tours?|sightseeing)|flightseeing|glacier landings?)\b/,
  // Tour test 3 (Whistler, 2026-11-17): heli-hiking is its own kind of tour (it read as Hiking & Trails plus the word
  // "heli"): a tour whose own words say heli-hiking. The request's "heli-hiking", "heli hike" and « héli-randonnée »
  // become the one word "helihiking" (REQUEST_SYNONYMS) so no hike is planned beside it.
  heli_hike: /\b(?:heli ?hik(?:ing|es?)|helihiking)\b/,
  // Tour test 1 (Whistler, 2026-11-16): quads, jeeps and off-road tours too (French « quad » and « VTT » read as ATV).
  atv: /\b(?:atvs?|rzr|off ?road(?:ing)? (?:tours?|trips?|adventures?)|side by sides?|quad (?:tours?|rides?|trips?)|quads|jeep tours?|jeeps?)\b/,
  snowmobile_tour: /\b(?:snowmobil\w*)\b/,
  // Tour test 2 (Whistler, 2026-11-16): "bear viewing", "bear tour" and "wildlife tour" are the wildlife tours (a tour whose
  // own words say so: "Wildlife and bear viewing"). "Wildlife viewing" alone stays the Nature & Wildlife activity.
  wildlife_tour: /\b(?:bears?|grizzly|grizzlies) (?:viewing|watching|spotting)\b|\b(?:bears?|grizzly|wildlife) (?:viewing |watching )?(?:tours?|safaris?)\b|\bwildlife(?:,)? (?:whale )?and bear viewing\b|\bwhale (?:watching|tours?|viewing|spotting)\b|\bwhale and wildlife (?:tours?|cruises?)\b/,
  // Tour test 4 (Whistler, 2026-11-17): food tours and walking tours are their own kinds of tour: a tour whose operator
  // picked that kind (v.tourKinds: 'food', 'walking') or whose own words say so ("Food tour", "Walking & history tours").
  // "Food tour" used to plan restaurants even with a food-tour company in town, and a "lights walk" Hiking & Trails.
  food_tour: /\b(?:food(?:ie)? (?:tasting )?tours?|(?<!wine |beer |cider |spirits |whisky |whiskey |gin )tasting tours?|culinary tours?)\b/,
  walking_tour: /\b(?:walking (?:food |history |ghost |and history |and food )?tours?|history tours?|ghost (?:walks?|tours?)|histor(?:y|ic|ical) walks?|heritage (?:walks?|tours?))\b/,
  // Tour test 9 (Whistler, 2026-11-18; Tanis, an Indigenous-owned cultural tour business): Indigenous and cultural tours are
  // a kind of tour ("Indigenous cultural tour near Pemberton", "cultural tour", "a school trip to learn about Indigenous
  // culture"). A listing is one when it is a tour whose operator picked that kind or whose own words say so, or an indoor
  // place (a cultural centre) whose own words say Indigenous or First Nations (inferPlannerKinds).
  cultural_tour: /\b(?:(?:indigenous|first nations?|aboriginal) (?:cultur\w*|tours?|experiences?|walks?|storytelling|heritage|guides?|programs?|history|art)|cultural (?:tours?|walks?|experiences?|programs?|visits?|activit\w*)|storytelling (?:walks?|tours?)|indigenous|first nations?)\b/,
  // Tour test 11 (Whistler, 2026-11-18; Min-jun, private sightseeing vans): a sightseeing tour or a guided day trip
  // (never a heli-sightseeing flight: that is a scenic flight). Plain "day trip" or "scenic drive" stays a day out; the
  // places a sightseeing tour goes are matched after planning (server.js tripDestinationTourPlan).
  sightseeing_tour: /\b(?:(?<!heli )(?<!heli-)(?<!heli)sightseeing(?: tours?| trips?| vans?| drives?| excursions?)?|(?<!heli )(?<!heli-)(?<!heli)sightsee(?:ing|s)?|(?:guided|sightseeing|van|bus) day trips?|day trip tours?|day tours?|van tours?|bus tours?|scenic drive tours?|waterfalls? tours?|tours? (?:of|to) (?:the )?waterfalls?|private (?:van|driver|driving) tours?)\b/,
  via_ferrata: /\bvia ferrata\b/,
  shopping: /\b(?:shopping|boutiques?|souvenirs?|gift shops?)\b/,
  farm: /\b(?:farms|farm stands?|farm gate|u ?pick|pick your own|farm visits?|farm tours?)\b/,
  // Audit 2026-10-27: "ice skating and hot chocolate" planned Brandywine Falls (a winter-tagged trail); skating is the
  // rinks and arenas themselves, indoors or out. Skate parks are SPORT_KINDS.skatepark.
  skating: /\b(?:ice skating|skating rinks?|ice rinks?|ice arenas?|public skating|skating)\b/,
  // Sport test 3 (2026-11-20; Gord's driving range and mini golf: "mini golf with kids" planned 8 golf courses, "driving
  // range then dinner" a round at a course): mini golf and a driving range are their own kinds, never a golf course.
  // (French « mini-golf », « minigolf » and « champ de pratique » arrive in English: trip-planner-fr.js.)
  mini_golf: /\b(?:mini ?golf(?:ing)?|mini ?putt(?:ing)?|minigolf|putt ?putt|crazy golf|glow golf|adventure golf|putting course)\b/,
  driving_range: /\b(?:driving ranges?|golf ranges?|practice ranges?|buckets? of (?:golf )?balls|hit (?:some |a few )?(?:golf )?balls|range balls|toptracer)\b/,
};
// The golf words that are mini golf, disc golf or a driving range, never a golf course (blanked before "golf" is read).
const NOT_GOLF_COURSE_RE = /\b(?:mini ?golf(?:ing)?|minigolf|mini ?putt\w*|disc golf|frisbee golf|crazy golf|glow golf|adventure golf|(?:golf )?driving ranges?|golf ranges?|golf balls?)\b/g;
// Tour test 3 (Whistler, 2026-11-17): what a visitor types for a kind can be wider than what a listing must say. "Helicopter",
// "scenic helicopter flight", "helicopter ride" and "heli flight" ask for a scenic flight ("helicopter" was "not something
// we can plan around yet"); a listing still needs flight or tour words of its own (a heli-ski company named "… Helicopters"
// is not a scenic flight). Used only when reading the request.
const REQUEST_KINDS = {
  // Tour test 5 (Whistler, 2026-11-17): a bare "charter" in a request asks for a boat charter (a listing still needs boat words).
  boat_tour: /(?<!fishing )\bcharters?\b/,
  // Tour test 4 (Whistler, 2026-11-17): a "lights walk", "night walk" or "guided walk" asks for a walking tour (a listing
  // still needs walking-tour words of its own, or the operator's Walking tours kind).
  walking_tour: /\b(?:(?:winter |christmas |holiday )?(?:lights?|lantern|night|evening|guided|village|town|downtown|city) walks?)\b/,
  // Tour test 14: a bare "instructor", "private lesson" or "kids camp" asks for ski lessons (only when the clause names no
  // other sport to learn: extractTripRequirements).
  ski_lessons: /\b(?:instructors?|private lessons?|semi private lessons?|kids? camps?|day camps?|lessons? for (?:my|our) (?:kids?|son|daughter|children))\b/,
  // Indoor test 6 (2026-11-19; Priya's paint-your-own pottery studio): "something creative", hands-on, make-your-own and
  // art-class words, and kids' camps ask for a class or workshop place (a listing still needs pottery/class words of its
  // own, or the owner's Classes & workshops kind). "summer camp" was read as Camping.
  pottery: /\b(?:ceramics? class(?:es)?|something creative|get creative|creative|crafty|arts and crafts|hands on(?! science)|make something|make (?:our|your|my) own|diy|paint your own(?: pottery)?|pottery painting|paint and sip|paint nights?|painting class(?:es)?|art class(?:es)?|art camps?|summer camps?|day camps?|kids? camps?|spring break camps?|pd day camps?|poterie|ateliers? creatifs?|quelque chose de creatif|bricolage|camps? de jour|camps? d ete)\b/,
  // Indoor test 9 (2026-11-19): "see a play" and "a musical" ask for live theatre; "see a movie" and "films" for a cinema
  // (a listing still needs theatre or cinema words of its own, or the owner's kind).
  // ("catch a show" and "a live show" stay What's On and dinner-and-a-show requests.)
  theatre: /\b(?:(?:see|watch|catch) a (?:play|musical)|a play(?! (?:centres?|centers?|places?|areas?|ground|cafes?|structures?|zones?|dates?|groups?))|stage plays?|musicals?)\b/,
  cinema: /\b(?:(?:see|watch|catch) a (?:movie|film|flick)|films?|voir un film)\b/,
  // Indoor test 10 (2026-11-19; "pool in Vernon" read « Lieux qui mentionnent « pool » »): a bare pool in a request is a
  // swimming pool (a listing still needs pool words of its own, or the owner's Pool kind); never a pool table or hall.
  // Indoor test 17 (2026-11-19; Megan's bouldering gym: "climbing Kelowna Saturday" and "my 7 year old wants to climb" read as
  // words and ranked trails first; « escalade » read as rock climbing): a plain "climb" / "climbing" asks for a climbing
  // place; rock, ice or alpine climbing and a climb up a mountain, hill or trail stay outdoors. Plain "bowl" (not a poke or
  // salad bowl), "skate" and "paint" ask for bowling, skating and a painting class (a listing still needs words of its own,
  // or the owner's kind).
  climbing: /(?<!\b(?:rock|ice|alpine|mountain|sport|trad|outdoor|steep|long|big|hard|short|gentle|uphill|hill|stair|a|the|tough|easy) )\bclimb(?:s|ing)?\b(?! (?:up|to the top|the (?:mountain|hill|stairs?|summit|peak|trail)|mount\w*|mt|hill|knox|giants|guides?|schools?|routes?|areas?|destination)\b)/,
  bowling: /(?<!\b(?:poke|acai|buddha|rice|grain|smoothie|salad|noodle|soup|burrito|super|ramen|power|protein|sushi|fruit|a|the|one|cereal|chili|chilli|bread|sugar|punch|mixing) )\bbowl\b(?! (?:of|food|restaurant|bistro|bar|cafe|place|places|spot|spots|shop)\b)/,
  skating: /\b(?:skate|go skating|patiner|patinage)\b(?! ?(?:parks?|boards?|boarding|shops?)\b)/,
  evening_fun: /\b(?:something (?:fun |else |more )?to do|somewhere (?:fun )?to go|an? (?:fun |evening |indoor )?activity|some(?:thing)? fun|evening activity|une activite|things to do|activities)\b/,
  pool: /\b(?<!(?:car|outdoor|infinity|hotel|tide|rock|plunge) )pools?\b(?! (?:tables?|halls?|cues?|league|sharks?|party|parties))/,
  scenic_flight: /\b(?:float ?planes?|seaplanes?|scenic (?:(?:helicopter|heli|plane|air) (?:flights?|tours?)|flights?)|scenic (?:or|and) helicopter flights?|helicopter (?:tours?|flights?|rides?|sightseeing|trips?)|heli (?:tours?|flights?|rides?)|helicopters?|flightseeing|glacier landings?)\b/,
};
// Indoor test 17: a plain "paint" asks for a painting class too.
REQUEST_KINDS.pottery = new RegExp(`${REQUEST_KINDS.pottery.source}|(?<!\\b(?:face|body|paintball|spray|car|house|wall) )\\b(?:paint|painting|peindre|peinture)\\b(?! ?(?:ball|balls|ballers?|shops?|stores?|supplies|store)\\b)`);
const HELI_SKI_LISTING_RE=/\b(?:heli ?ski(?:ing|s)?|heliski\w*|heli ?board\w*|cat ?ski(?:ing|s)?|catski\w*|snowcat skiing)\b/;
// Every tour kind (2026-11-17): the setup's tour kinds (venue_tour_info.kinds) -> the planner kinds they are.
const TOUR_KIND_PLANNER = { fishing: ['fishing_tour'], boat: ['boat_tour'], jetboat: ['boat_tour'], raft: ['rafting'], wildlife: ['wildlife_tour'], zipline: ['zipline'],
  flight: ['scenic_flight'], walking: ['walking_tour'], food: ['food_tour'], wine: ['wine_tour'], farm: ['farm'], snowmobile: ['snowmobile_tour'], dogsled: ['snow_tour'], sleigh: ['sleigh_ride'],
  snowshoe: ['snowshoe_tour'], heli: ['heli_ski'], adventure: ['atv', 'adventure_park'], guide: ['mountain_guide'], horseback: ['horseback'], rentals: ['rentals'], bike: ['bike_tour'], paddle: ['paddle_tour'], cultural: ['cultural_tour'],
  // Tour test 11 (Whistler, 2026-11-18; Min-jun, private sightseeing vans): the Sightseeing and day trips kind.
  sightseeing: ['sightseeing_tour'],
  // Tour test 13 (Matthias): the Paragliding, skydiving or hang gliding kind.
  paraglide: ['paragliding'],
  // Tour test 14 (Lucía): the Ski and snowboard lessons kind.
  lessons: ['ski_lessons'] };
// Indoor places (2026-11-19, the indoor easy setup): the owner's kinds (venue_indoor_info.kinds) -> the planner kinds they are.
// A place is that kind whatever its name says (a gallery called "Caetani Cultural Centre" is a gallery). Since indoor
// test 9 every indoor kind has a planner kind of its own (a cinema is no longer a theatre).
const INDOOR_KIND_PLANNER = { gallery: ['gallery'], museum: ['museum'], theatre: ['theatre'], cinema: ['cinema'], spa: ['spa'], climbing: ['climbing'], games: ['arcade'], escape: ['escape'],
  bowling: ['bowling'], classes: ['pottery'], kids: ['playground'], pool: ['pool'], curling: ['curling'], yoga: ['yoga'], casino: ['casino'], library: ['library'] };
// Sport setup (2026-11-20): a sports listing's owner kinds -> the planner kinds they are (golf courses plan as type golf).
const SPORT_KIND_PLANNER = { skatepark: ['skatepark'], discgolf: ['disc_golf'], bike: ['bmx'], courts: ['tennis', 'pickleball'], rink: ['skating'], skischool: ['ski_lessons'] };
// Indoor test 9: each indoor planner kind's request words (indoor-kinds.js search words, English and French, plus the
// words of its own request phrases), read as the kind and not as words a listing must hold.
const INDOOR_KIND_REQUEST_WORDS = (() => {
  const IK = require('./indoor-kinds'); const out = {};
  const extra = { cinema: 'see watch catch a movie movies film films flick theatre theater picture house voir un', theatre: 'see watch catch a play plays show shows musical musicals stage live playhouse', playground: 'indoor play playground playgrounds centre centres center centers place places soft toddler kids kid bouncy castle castles area zone', pool: 'indoor pool pools swim swimming lane public leisure wave rec recreation centre centres center aquatic aquatics', library: 'public story time storytime', casino: 'slot slots machines machine poker table games', yoga: 'class classes hot studio', curling: 'learn to curl club rink', museum: 'science discovery centre center', escape: 'escape room rooms game games puzzle', arcade: 'virtual reality vr laser tag games', climbing: 'climbing gym bouldering trampoline trampolines park parks ninja parkour climb climbs climber climbers indoor interieure wants want' };
  for (const [k, pks] of Object.entries(INDOOR_KIND_PLANNER)) for (const pk of pks) out[pk] = `${out[pk] || ''} ${IK.INDOOR_KIND_TEXT[k].en.search.concat(IK.INDOOR_KIND_TEXT[k].fr.search).join(' ')} ${extra[pk] || ''}`;
  // Indoor test 17: the plain activity words (REQUEST_KINDS) are the kind too.
  out.bowling += ' bowl'; out.pottery += ' paint painting peindre peinture';
  out.sauna = 'hot tub tubs hottub hottubs sauna saunas steam room rooms whirlpool whirlpools bain bains remous tourbillon';
  return out;
})();
// Indoor test 9: the kinds only an indoor listing can be (a hotel's "indoor pool" or a winery's "library wines" is not one).
const INDOOR_ONLY_PLANNER_KINDS = new Set(['evening_fun','playground', 'pool', 'curling', 'yoga', 'casino', 'library', 'cinema', 'sauna']);
// Every planner kind that is a tour listing (one list: the request reader, the plan's types and the excluded kinds all
// use it, so a new tour kind is added once).
const TOUR_PLANNER_KINDS = ['wine_tour','boat_tour','guided_hike','cooking','snow_tour','sleigh_ride','atv','adventure_park','snowmobile_tour','wildlife_tour','scenic_flight','heli_hike','food_tour','walking_tour','fishing_tour','heli_ski','rentals','snowshoe_tour','bike_tour','paddle_tour','ski_touring','avalanche_course','multi_day_tour','mountain_guide','kennel_visit','cultural_tour','sightseeing_tour','paragliding','ski_lessons','kite_lessons','shooting'];
const LABELS = {evening_fun:'something to do',mini_golf:'mini golf',driving_range:'driving range',ski_lessons:'ski or snowboard lesson',kite_lessons:'kiteboarding or wing foil lesson',shooting:'target shooting',sightseeing_tour:'sightseeing tour',sleigh_ride:'sleigh ride',cultural_tour:'cultural tour',kennel_visit:'kennel visit',ski_touring:'ski touring',avalanche_course:'avalanche course',multi_day_tour:'multi-day trip',mountain_guide:'mountain guide',adventure_park:'adventure park',skating:'skating',farm:'farm',shopping:'shopping',zipline:'ziplining',bungee:'bungee jumping',paragliding:'paragliding',rafting:'rafting',scenic_flight:'scenic flight',heli_hike:'heli-hiking',fishing_tour:'fishing trip',snowshoe_tour:'snowshoe tour',heli_ski:'heli-skiing',rentals:'rentals',bike_tour:'bike tour',paddle_tour:'paddle tour',food_tour:'food tour',walking_tour:'walking tour',atv:'ATV tour',snowmobile_tour:'snowmobile tour',wildlife_tour:'wildlife tour',via_ferrata:'via ferrata',bmx:'BMX',skatepark:'skate park',disc_golf:'disc golf',tennis:'tennis',pickleball:'pickleball',challenging_hike:'challenging hike',walk:'walk',easy_walk:'easy walk',park:'park',horseback:'horseback riding',sunset:'sunset viewpoint',museum:'museum',gallery:'gallery',escape:'escape room',bowling:'bowling',climbing:'climbing gym',arcade:'arcade',theatre:'theatre',spa:'spa',sauna:'hot tub or sauna',cinema:'cinema',playground:'indoor playground',pool:'pool',curling:'curling',yoga:'yoga class',casino:'casino',library:'library',wine_tour:'wine tour',boat_tour:'boat tour',guided_hike:'guided hike',cooking:'cooking class',pottery:'pottery class',snow_tour:'snow experience',hiking:'hiking'};
const WALKING_TRANSPORT = /\b(?:no car|(?:we |i )?(?:do not|don t|dont) drive|(?:rely|relying) on (?:public )?(?:transit|buses|the bus)|public transit|no vehicle|without (?:a |our |my )?car|do not have (?:a |our |my )?car|don t have (?:a |our |my )?car|no driving|car free|(?:coming|arriving|travell?ing|getting there|going) by (?:bus|coach|shuttle|train)|on foot|walkable|(?:walk|walking) between (?:the )?(?:stops|places|venues))\b/g;
// "No driving after 6pm", "no driving at night" (2026-10-18): only the evening is on foot, so it is an evening rule,
// not a car-free trip (it used to plan one winery a day inside a 1.5 km walking radius).
const EVENING_NO_DRIVE = /\b(?:no|not|don t|do not|won t|will not|avoid|without)\s+(?:want to\s+)?(?:driving|drive|car)\s+(?:after|past|once it s|at|in the)\s+(?:(2[0-3]|1\d|0?[1-9])(?:\s*h)?(?:\s*([0-5]\d))?\s*(am|pm|h)?|dark|night|nightfall|sunset|dinner|evening|the evening)\b/;
const WINERY_LUNCH = /\b(?:lunch(?:es)?|eat|meal) (?:at|in) (?:a |an |one |the )?(?:winery|wineries|vineyard|vineyards|estate)\b/;
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const WORD_DAYS = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7};
const PER_DAY_MAX = 4; // the most tastings (wineries, breweries) one day can hold (2026-10-18)
// Taxonomies are rebuilt for every edit; reuse only name normalization,
// keyed by the actual stored name so listing edits cannot leave stale matches.
const venueNames = new Map();
function venueName(name) {
  if (!venueNames.has(name)) { if (venueNames.size >= 4096) venueNames.clear(); venueNames.set(name, norm(name)); }
  return venueNames.get(name);
}
// Front-of-name aliases, only when exactly one listing has them (and no listing's full name equals one).
const ALIAS_TRAILING = new Set(['restaurant','restaurants','winery','wines','wine','estate','estates','family','vineyard','vineyards','cellars','cellar','brewing','brewery','co','company','kitchen','bar','grill','bistro','cafe','pub','lounge','taphouse','distillery','distilling','and','the','at']);
const aliasCache = new WeakMap();
function venueAliases(venues) {
  if (aliasCache.has(venues)) return aliasCache.get(venues);
  const count = new Map(), owner = new Map(), full = new Set();
  for (const v of venues) { if (v.redirect_to || !v.name) continue; full.add(venueName(v.name)); }
  for (const v of venues) {
    if (v.redirect_to || !v.name) continue;
    const words = venueName(v.name).split(' ').filter(Boolean);
    let alias = null;
    const at = words.indexOf('at');
    if (at >= 2) alias = words.slice(0, at).join(' ');
    else {
      let end = words.length;
      while (end > 2 && ALIAS_TRAILING.has(words[end - 1])) end--;
      if (end < words.length && end >= 2) alias = words.slice(0, end).join(' ');
    }
    if (!alias || alias.length < 8 || full.has(alias) || /^happy hours?$/.test(alias)) continue;
    count.set(alias, (count.get(alias) || 0) + 1); owner.set(alias, v);
  }
  const out = new Map([...owner].filter(([a]) => count.get(a) === 1));
  aliasCache.set(venues, out);
  return out;
}
// Interpret a uniquely named sports destination as its sport, not words within its name.
// Keep the original request for named-venue requirements and quoted customer text.
function sportsVenueInterpretationText(text,taxonomy){
 const names=new Map();
 for(const v of taxonomy.venues||[]){
  if(v.redirect_to||!v.name)continue;
  const name=venueName(v.name);if(name.length<4)continue;
  if(!names.has(name))names.set(name,[]);names.get(name).push(v);
 }
 let clean=' '+norm(text)+' ',changed=false;
 for(const [name,vs]of [...names].sort((a,b)=>b[0].length-a[0].length)){
  if(vs.length!==1||vs[0].type!=='sport'||!clean.includes(' '+name+' '))continue;
  const kind=Object.entries(SPORT_KINDS).find(([,re])=>re.test(name))?.[0];
  const phrase=kind?kind.replace(/_/g,' '):'sports venues';
  clean=clean.split(' '+name+' ').join(' '+phrase+' ');changed=true;
 }
 // 2026-11-05: a place named by the front of its name ("Waterfront Wines") is that place, not the words "wines" and "waterfront".
 for(const [alias]of venueAliases(taxonomy.venues||[])){
  if(!clean.includes(' '+alias+' '))continue;
  clean=clean.split(' '+alias+' ').join('  ');changed=true;
 }
 return changed?clean.replace(/\s+/g,' ').trim():text;
}
// "Pizza one night", "sushi once": a food asked for one time; onceEvening are the ones asked for at night.
function onceFoods(normalizedText){
  const onceTerms=[...String(normalizedText||'').matchAll(/\b([a-z]{3,})\s+(?:one|1)\s+(?:night|evening|day|dinner|lunch|meal|time)\b|\b([a-z]{3,})\s+once\b/g)].map(m=>m[1]||m[2]).filter(w=>!/^(?:just|only|for|and|with|the|out|day|night|trip)$/.test(w));
  const onceEvening=[...String(normalizedText||'').matchAll(/\b([a-z]{3,})\s+(?:one|1)\s+(?:night|evening|dinner)\b/g)].map(m=>m[1]).filter(w=>onceTerms.includes(w));
  return {onceTerms,onceEvening};
}
// A walk "by the lake" (2026-10-21): "a nice lake walk", "a walk along the lake", "lakeside stroll", "waterfront walk".
const LAKE_WALK_WORDS=/\b(?:lake|lakes|lakeside|lakeshore|lakefront|waterfront|beach|beachfront|shoreline|seawall|promenade|by the water)\b/;
const LAKESIDE_PLACE=new RegExp(`\\b(?:lake|lakeside|lakeshore|lakefront|waterfront|beach|beachfront|shoreline|seawall|promenade|channel|marina|${SITE.lakesideWords.join('|')})\\b`);
function lakesidePlace(v){
  if(v.type==='beach')return true;
  const text=norm([v.name,v.description||v.plannerDescription,v.textName,v.textDesc].filter(Boolean).join(' '));
  // "Views of the lake" from a mountain trail is not a walk by the lake.
  return LAKESIDE_PLACE.test(norm(v.name))||/\b(?:along|beside|by|on|follows?|hugs?|around)\s+(?:the\s+)?(?:\w+\s+){0,2}(?:lake|lakeshore|waterfront|beach|shoreline|channel)\b/.test(text)||/\b(?:lakeshore|lakefront|waterfront|lakeside|beachfront)\s+(?:walk|walkway|path|promenade|trail|park|stroll)/.test(text);
}
// A walk by the lake: a lakeside walking place, or a long beach with a path along it (a town beach with a promenade).
// Never a rental counter, an RV park or a fenced dog beach.
function lakeWalk(v){
  const name=norm(v.name);
  if(/\b(?:rentals?|water sports|rv|resort|campground|dog beach|off leash)\b/.test(name))return false;
  if(!lakesidePlace(v))return false;
  if((v.plannerKinds||inferPlannerKinds(v)).some(k=>k==='walk'||k==='easy_walk'))return true;
  const text=norm([v.description||v.plannerDescription,v.textDesc].filter(Boolean).join(' '));
  return v.type==='beach'&&/\b(?:runs|stretch|stretches|along|promenade|walkway|path|boardwalk|seawall)\b/.test(text);
}
// A place whose point is a hike or a trail network (not a flat lakeside walk, garden or beach).
function hikingPlace(v){
  if(!['outdoor','tour'].includes(v.type))return false;
  const text=norm([v.name,v.description||v.plannerDescription,v.textName,v.textDesc].filter(Boolean).join(' '));
  if(!/\b(?:hike|hikes|hiking|trail network|trailhead|mountain bik\w*|single ?track|summit|switchbacks?|elevation gain|climb)\b/.test(text)&&!/\btrails?\b/.test(norm(v.name)))return false;
  if(/\b(?:garden|gardens|promenade|seawall|beach|boardwalk|lakeshore walk|waterfront walk)\b/.test(norm(v.name)))return false;
  return true;
}
// Sport test 3 (2026-11-20): a listing is mini golf or a driving range by its owner's kind (Driving range or mini golf,
// the main kind or not; a range's own words say which of the two it has, both when they name neither), else by its own
// words: a golf listing named a range or mini golf, or whose story names one and no golf course; an indoor or outdoor
// place (a family fun centre, an amusement park) whose words say mini golf. A golf course with a practice range is not
// a driving range for a visitor.
const MINI_GOLF_WORDS=/\b(?:mini ?golf|mini ?putt\w*|minigolf|putt ?putt|crazy golf|glow golf|adventure golf|putting course)\b/;
const RANGE_WORDS=/\b(?:driving ranges?|golf ranges?|practice ranges?|buckets? of balls|toptracer|range)\b/;
const GOLF_COURSE_WORDS=/\bgolf (?:club|course|resort|and country|country club)\b|\bcountry club\b|\b(?:9|18|nine|eighteen|27) holes?\b|\bpar \d/;
function golfPartKind(v,kind,text,name){
  const own=norm([v.name,v.textName,v.knownFor,v.description||v.textDesc].filter(Boolean).join(' '));
  const says=kind==='mini_golf'?MINI_GOLF_WORDS:RANGE_WORDS;
  if(['golf','sport'].includes(v.type)&&Array.isArray(v.sportKinds)&&v.sportKinds.length){
    if(!v.sportKinds.includes('range'))return false;
    const mini=MINI_GOLF_WORDS.test(own),range=RANGE_WORDS.test(own.replace(MINI_GOLF_WORDS,' '));
    return (!mini&&!range)||(kind==='mini_golf'?mini:range);
  }
  if(v.type==='golf'){
    if(says.test(name))return true;
    const story=own.replace(kind==='mini_golf'?/$^/:MINI_GOLF_WORDS,' ');
    if(!says.test(story))return false;
    return !GOLF_COURSE_WORDS.test(own.replace(/\b(?:\d+ hole )?(?:championship )?(?:mini ?golf|minigolf|mini ?putt)(?: course)?\b/g,' '));
  }
  if(kind==='mini_golf'&&['indoor','outdoor','sport'].includes(v.type))return MINI_GOLF_WORDS.test(norm([v.name,v.textName,v.cuisine,v.knownFor,v.description||v.textDesc].filter(Boolean).join(' ')));
  return false;
}
function inferPlannerKinds(v) {
  // Tour test 1 (Whistler, 2026-11-16): a tour's own kind words too ("Snowmobile & ATV tours", kept when the operator's kinds
  // are saved), so an ATV request finds it.
  const text = norm([v.name,v.description,v.textName,v.textDesc,v.type==='tour'?v.cuisine:''].filter(Boolean).join(' '));
  const name = norm(v.name);
  const golfKinds = v.type==='golf'&&Array.isArray(v.sportKinds)&&v.sportKinds.length>1;
  return Object.entries(v.type==='sport'||golfKinds?{...KINDS,...SPORT_KINDS}:KINDS).filter(([kind,re]) => {
    // Sport test 8: a golf listing is a sports kind (disc golf) only when its owner picked it.
    if (golfKinds&&SPORT_KINDS[kind]&&!KINDS[kind]) return v.sportKinds.some(k=>(SPORT_KIND_PLANNER[k]||[]).includes(kind));
    if (INDOOR_ONLY_PLANNER_KINDS.has(kind)&&v.type&&v.type!=='indoor') return false;
    if (kind==='challenging_hike') {
      if(v.type!=='outdoor')return false;
      return String(v.description||v.textDesc||'').split(/[.;!]/).map(norm).some(c=>re.test(c)&&! /\b(?:near|nearby|no|not|without)\b/.test(c));
    }
    // Tour test 4: a food tour or a walking tour is a tour (never a restaurant whose description mentions one): the
    // operator's own kind, or its own words.
    if (kind==='food_tour'||kind==='walking_tour') return v.type==='tour'&&((Array.isArray(v.tourKinds)&&v.tourKinds.includes(kind==='food_tour'?'food':'walking'))||re.test(text));
    // Every tour kind (2026-11-17): a tour is that kind when its operator picked the matching kind in the setup (Fishing,
    // Boat tours, Rafting…), whatever its name says; fishing trips, heli-skiing and rentals are tours only.
    // Tour test 6 (Whistler, 2026-11-17): the adventure kind is an ATV tour only when its own words don't name something
    // else instead (a zipline and treetop park picked it for its ropes course: "We have no ATVs").
    if (kind==='atv'&&v.type==='tour'&&Array.isArray(v.tourKinds)&&v.tourKinds.includes('adventure')&&!re.test(text)&&/\b(?:tree ?top|ropes?|adventure parks?|bungee|bungy|climb\w*|canyon\w*|via ferrata|paraglid\w*|skydiv\w*|zip ?lines?)\b/.test(text)) return false;
    if (v.type==='tour'&&Array.isArray(v.tourKinds)&&v.tourKinds.some(k=>(TOUR_KIND_PLANNER[k]||[]).includes(kind))) return true;
    if (v.type==='indoor'&&Array.isArray(v.indoorKinds)&&v.indoorKinds.some(k=>(INDOOR_KIND_PLANNER[k]||[]).includes(kind))) return true;
    // Sport setup (2026-11-20): a sports listing is the kind its owner picked (an arena is skating, a skate park a skatepark).
    // Sport test 8 (2026-11-21; Marg's golf course with disc golf as her second kind): every owner kind, whatever the type.
    if ((v.type==='sport'||v.type==='golf')&&Array.isArray(v.sportKinds)&&v.sportKinds.some(k=>(SPORT_KIND_PLANNER[k]||[]).includes(kind))) return true;
    // Tour test 17 (Whistler, 2026-11-18): a tour's own "Wildlife viewing" (the chip's page words) or "eagle viewing" is a
    // wildlife tour; a viewing area or a boardwalk (not a tour) isn't.
    if (kind==='wildlife_tour'&&v.type==='tour'&&/\bwildlife viewing\b|\beagle (?:viewing|watching)\b/.test(text)) return true;
    if (kind==='fishing_tour') return v.type==='tour'&&(re.test(text)||/\b(?:fishing|angling)\b/.test(text));
    // From Whistler Roam #188 (2026-11-17, real-data check): heli-skiing is read from the listing's own name and category words (its
    // description when it has no category), and a snowcat sightseeing tour is not cat-skiing. "Heli-skiing in Whistler"
    // listed Canadian Wilderness Adventures ("… snowshoe & snowcat tours") and Coast Range Alpine Yurt (its description
    // names "Coast Range Heli-Skiing's yurt") ahead of the three heli-ski companies.
    // Tour test 7: a tour whose own words say ski touring or backcountry skiing (a heli-ski company only when its own
    // words say ski touring too); avalanche courses (AST); multi-day trips (the operator's "Several days", a list of
    // whole-day trips, or its own hut-trip / multi-day words); mountain guides (its words, or the Mountain guiding kind).
    // A heli-ski company is a ski-touring one only when its own name or category says ski touring or backcountry too
    // (Coast Range Heli-Skiing's description mentions touring; it came first for "ski touring in Whistler").
    if (kind==='ski_touring') { if (v.type!=='tour') return false; const own=norm([v.name,v.cuisine].filter(Boolean).join(' ')); if (HELI_SKI_LISTING_RE.test(own)&&!re.test(own)&&!/\bbackcountry\b/.test(own)) return false; return re.test(text)||/\bbackcountry (?:ski\w*|lodge|touring|guid\w*)\b/.test(text); }
    if (kind==='avalanche_course') return v.type==='tour'&&(re.test(text)||/\bavalanche\b.{0,40}\b(?:courses?|training|skills)\b|\bast\b/.test(text));
    // Tour test 10 (Whistler, 2026-11-18; Gord): a ranch's own "overnite pack trip" / "pack trips" is a multi-day trip too.
    if (kind==='multi_day_tour') return v.type==='tour'&&(v.tourLength==='multi'||v.tourMultiDay===true||re.test(text)||/\b(?:hut trips?|multi ?day|overnight (?:trips?|tours?|hikes?)|overnite (?:trips?|tours?|pack trips?)|pack trips?|expeditions?|traverses?|\d+ ?day (?:trips?|tours?|treks?))\b/.test(text)||(Array.isArray(v.tourItems)&&v.tourItems.some(it=>/\b(?:pack trips?|overni(?:ght|te)|multi ?day|\d+ ?days?)\b/i.test(String(it.name||'')))));
    // ("founded by ski mountaineer …" in a jet-boat company's story is not mountaineering.)
    if (kind==='mountain_guide') return v.type==='tour'&&(re.test(text)||/\bmountain guid\w*\b/.test(text));
    if (kind==='kennel_visit') return v.type==='tour'&&(re.test(text)||/\b(?:kennels?|pupp(?:y|ies))\b/.test(text));
    if (kind==='cultural_tour') return (v.type==='tour'&&(re.test(text)||/\b(?:indigenous|first nations?|cultural|storytell\w*)\b/.test(text)))||(v.type==='indoor'&&/\b(?:indigenous|first nations?)\b/.test(text));
    if (kind==='heli_ski') { if (v.type!=='tour') return false; const own=norm([v.name,v.cuisine].filter(Boolean).join(' ')); return HELI_SKI_LISTING_RE.test(own)||(!String(v.cuisine||'').trim()&&HELI_SKI_LISTING_RE.test(text)); }
    // Whistler #190 (2026-11-17): "side-by-side ziplines" is not a side-by-side ATV.
    if (kind==='atv'&&/\bside by side zip ?lines?\b/.test(text)&&!re.test(text.replace(/\bside by side zip ?lines?\b/g,' '))) return false;
    if (kind==='adventure_park') return re.test(norm([v.name,v.cuisine,v.textName].filter(Boolean).join(' ')));
    // Tour test 13: the operator's own words only (name, category, Known for, typed tours), never a story that mentions
    // paragliders seen from a gondola.
    // Tour test 13: a paragliding or hang-gliding operator is also a scenic flight (ranked after the planes and helicopters:
    // trip-planner.js scoreVenue), never a skydiving one.
    if (kind==='scenic_flight'&&v.type==='tour'&&!(Array.isArray(v.tourKinds)&&v.tourKinds.includes('flight'))&&/\b(?:para ?glid\w*|parapent\w*|hang ?glid\w*|deltaplane\w*)\b/.test(norm([v.name,v.cuisine,v.textName,v.knownFor,...(Array.isArray(v.tourItems)?v.tourItems.map(it=>it&&it.name):[])].filter(Boolean).join(' ')))) return true;
    // Tour test 14: the lesson kinds read the operator's own words only (name, category, Known for, typed tours), with
    // "snow board" as one word; never a story that mentions a ski school next door.
    if (kind==='ski_lessons'||kind==='kite_lessons'||kind==='shooting') { if (v.type!=='tour') return false; const own=norm([v.name,v.cuisine,v.textName,v.knownFor,...(Array.isArray(v.tourItems)?v.tourItems.map(it=>it&&it.name):[])].filter(Boolean).join(' ')).replace(/\bsnow board/g,'snowboard'); return re.test(own)||(kind==='ski_lessons'&&/\b(?:ski|snowboard|nordic)\b.{0,30}\b(?:lessons?|schools?|clinics?|instructors?)\b/.test(own)); }
    if (kind==='paragliding') return v.type==='tour'&&re.test(norm([v.name,v.cuisine,v.textName,v.knownFor,...(Array.isArray(v.tourItems)?v.tourItems.map(it=>it&&it.name):[])].filter(Boolean).join(' ')));
    if (kind==='snowshoe_tour') return v.type==='tour'&&(re.test(text)||/\bsnowshoe\w*/.test(text));
    // Tour test 6: a shop that rents is a rental place too (after the tours that rent: trip-planner.js scoreVenue).
    // A place listed outdoors whose own name or category says rentals ("Lakeside Boat Rentals") too.
    if (kind==='rentals') return (v.type==='tour'&&/\brentals?\b/.test(text))||((v.type==='shop'||v.isShop)&&/\brentals?\b/.test(norm(`${text} ${v.cuisine||''}`)))||(['outdoor','beach','sport'].includes(v.type)&&/\brentals?\b/.test(norm(`${v.name||''} ${v.textName||''} ${v.cuisine||''}`)));
    if (kind==='bike_tour') return v.type==='tour'&&(re.test(text)||/\b(?:e-?bikes?|bikes?|biking|bicycles?|cycling)\b/.test(text));
    if (kind==='paddle_tour') return v.type==='tour'&&(re.test(text)||/\b(?:kayak\w*|canoe\w*|sup|paddle ?board\w*|paddling)\b/.test(text));
    if (['walk','easy_walk'].includes(kind)) {
      if (!['outdoor','beach'].includes(v.type) || !/\b(?:walks?|walking|promenade|paths?|trails?|hikes?|hiking|walkway|stroll|boardwalk|seawall|loop|dykes?)\b/.test(text)) return false;
      if (/\b(?:no|not|without) (?:easy |flat |walking )?(?:walk|walks|path|trail)\b/.test(text)) return false;
      // Accommodation access and nearby trails are not walking experiences.
      if (/\b(?:rv|resort|campground|glamping)\b/.test(name)) return false;
      const clauses = String(v.description || v.textDesc || v.name || '').split(/[.;!]/).map(norm);
      return clauses.some(clause => {
        const walk = /\b(?:walks?|walking|promenade|paths?|trails?|boardwalk|hikes?|hiking|walkway|stroll|seawall|loop|dykes?)\b/.exec(clause);
        if (!walk || /\b(?:near|nearby|beside|from|close to|minutes from)\b.{0,65}$/.test(clause.slice(0,walk.index))) return false;
        if (kind === 'walk') return true;
        return /\b(?:easy|flat|paved|level|gentle)\b/.test(clause) && !/\b(?:steep|challenging|strenuous|pump tracks?|bike|cycling|riders|dirt jump)\b/.test(clause);
      });
    }
    // 2026-10-25: "sunset spots in Penticton" found nothing -- no Penticton listing says "sunset". A lookout with the
    // Lake View badge is a sunset spot too.
    if (kind === 'sunset' && v.type === 'outdoor' && (v.activities || []).includes('viewpoints') && (Number(v.lake_view) === 1 || !!(v.features && v.features.lake_view))) return true;
    // Indoor test 10: a hot tub or sauna in its own words or its Known for line (a pool's hot tub counts).
    if (kind === 'sauna') return v.type === 'indoor' && re.test(norm(`${text} ${v.knownFor || ''}`));
    if (kind==='mini_golf'||kind==='driving_range') return golfPartKind(v,kind,text,name);
    if (!re.test(text)) return false;
    if (SPORT_KINDS[kind]) return v.type==='sport' && re.test(name);
    if (kind === 'park') {
      if (!['outdoor','beach'].includes(v.type) || /\b(?:arena|ice rink|skating rink|rv|resort|camp|campground|water park)\b/.test(name)) return false;
      return /\bparks?\b/.test(name) || /\b(?:regional|provincial|community|city|public|adventure) park\b/.test(text);
    }
    if (kind === 'spa' && /\b(?:ymca|aquatic|community centre|community center|recreation centre|recreation center|rec centre|pool|arena|gym|fitness)\b/.test(name)) return false; // a pool's sauna is not a spa day
    if (kind === 'sunset') return v.type === 'outdoor';
    // Indoor test 17: a rink listed under Sports & Recreation or outdoors is a skating place ("skate in Kelowna" found none).
    if (kind === 'skating' && ['sport','outdoor'].includes(v.type)) return !/\bskate ?parks?\b/.test(text) || /\b(?:ice|rinks?|arenas?|public skat\w*)\b/.test(text);
    return ['indoor','tour'].includes(v.type) || kind.includes('tour') || ['cooking','guided_hike','snow_tour','sleigh_ride','horseback'].includes(kind);
  }).map(([kind])=>kind);
}
function inferPlannerActivities(v) {
  if (!['outdoor','tour','beach'].includes(v.type)) return [];
  const patterns = {skiing:/\b(?:skiing|ski resort|mountain resort|cross country ski)\b/g,snowshoeing:/\bsnowshoe(?:ing)?\b/g,hiking:/\b(?:hiking|hikes?|walking trails?|lookout trail)\b/g,winter:/\b(?:skiing|ski resort|mountain resort|snowshoe(?:ing)?|nordic trails?|cross country ski)\b/g,viewpoints:/\b(?:viewpoints?|lookouts?|sunset stop)\b/g};
  const clauses=String(v.description||v.textDesc||'').split(/[.;!]|\b(?:but|however|yet)\b/i).map(norm);
  const name=norm(v.name||v.textName);
  return Object.entries(patterns).filter(([,re])=>{
    const family=term=>/ski/.test(term)?'skiing':/snowshoe/.test(term)?'snowshoeing':term;
    const mentions=clauses.flatMap(c=>[...c.matchAll(re)].map(m=>({clause:c,match:m})));
    const denied=new Set(mentions.filter(({clause,match})=>/\b(?:no|not|without|cannot|does not offer)\b[^,]*$/.test(clause.slice(0,match.index))).map(({match})=>family(match[0])));
    return [...name.matchAll(re)].some(m=>!denied.has(family(m[0]))) || mentions.some(({clause,match})=>!denied.has(family(match[0])) && ! /\b(?:near|nearby|beside|opposite|overlooks?|views? of|towards?|across from|close to)\b.{0,60}$/.test(clause.slice(0,match.index)) && !/^(?: trails?)? (?:is|are|located|situated|can be found) (?:nearby|near|beside|across from|close to)\b/.test(clause.slice(match.index+match[0].length)));
  }).map(([key])=>key);
}
function scope(clause) {
  const day = /\bday\s+([1-7]|one|two|three|four|five|six|seven)\b/.exec(clause);
  const weekday = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(clause);
  return {dayIndex:day ? Number(day[1]) || WORD_DAYS[day[1]] : null,weekday:weekday ? weekday[1].slice(0,3) : null};
}

// Parse calendar facts separately from activity/length grammar. UTC noon is
// only a stable representation of the visitor's local calendar date.
function tripCalendar(text, referenceDate=null) {
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month='('+months.map(m=>m+'|'+m.slice(0,3)).join('|')+')';
  const day='(\\d{1,2})(?:st|nd|rd|th)?';
  // 2026-11-05: "from July 3rd until the 9th", "the 3rd to the 9th of July" (the "the" and "of" were not read).
  const join='\\s*(?:and|to|through|thru|until|till|[-–—])\\s*(?:the\\s+)?';
  const patterns=[
    new RegExp('\\b'+month+'\\.?\\s+'+day+'(?:'+join+'(?:'+month+'\\.?\\s+)?'+day+')?(?:\\s*,?\\s*(20\\d{2}))?\\b','i'),
    new RegExp('\\b(?:the\\s+)?'+day+'(?:'+join+day+')?\\s+(?:of\\s+)?'+month+'\\.?(?:\\s*,?\\s*(20\\d{2}))?\\b','i'),
  ];
  let startDate=null,endDate=null,source=null,conflict=null;
  const iso=[...String(text).matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)];
  const real=(y,m,d)=>{const v=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const n=new Date(v+'T12:00:00Z');return Number.isFinite(n.getTime())&&n.toISOString().slice(0,10)===v?v:null;};
  if(iso.length){
    const read=v=>real(...v.split('-').map(Number));
    startDate=read(iso[0][1]);
    if(iso.length>1 && /^\s*(?:to|through|until|and|[-–—])\s*$/.test(String(text).slice(iso[0].index+iso[0][0].length,iso[1].index))){endDate=read(iso[1][1]);source=String(text).slice(iso[0].index,iso[1].index+iso[1][0].length);if(!endDate)conflict='The calendar date is invalid; choose a real date.';}
    else source=iso[0][0];
    if(!startDate)conflict='The calendar date is invalid; choose a real date.';
  }else{
    const fullMonth=new RegExp('\\b'+month+'\\.?\\s+'+day+'\\s*,?\\s*(20\\d{2})'+join+month+'\\.?\\s+'+day+'\\s*,?\\s*(20\\d{2})\\b','i').exec(text);
    const fullDay=!fullMonth&&new RegExp('\\b'+day+'\\s+'+month+'\\.?\\s*(20\\d{2})'+join+day+'\\s+'+month+'\\.?\\s*(20\\d{2})\\b','i').exec(text);
    const full=fullMonth||fullDay;
    if(full){
      const monthNo=v=>months.findIndex(x=>x.startsWith(v.toLowerCase()))+1;
      startDate=real(Number(full[3]),monthNo(full[fullMonth?1:2]),Number(full[fullMonth?2:1]));
      endDate=real(Number(full[6]),monthNo(full[fullMonth?4:5]),Number(full[fullMonth?5:4]));
      source=full[0];if(!startDate||!endDate)conflict='The calendar date is invalid; choose a real date.';
    }
    const a=!full&&patterns[0].exec(text),b=!full&&!a&&patterns[1].exec(text);
    const m=a||b;
    if(m){
      const monthNo=v=>months.findIndex(x=>x.startsWith(v.toLowerCase()))+1;
      let year=Number(m[a?5:4]) || Number(String(referenceDate || '').slice(0,4));
      const firstMonth=monthNo(m[a?1:3]),firstDay=Number(m[a?2:1]);
      if(!year) {conflict='The calendar date needs a year; include the travel year.';}
      startDate=year ? real(year,firstMonth,firstDay) : null;
      if(!m[a?5:4] && startDate && referenceDate && startDate<referenceDate) {year++;startDate=real(year,firstMonth,firstDay);}
      const lastDay=m[a?4:2];
      if(lastDay){
        const endMonth=a&&m[3]?monthNo(m[3]):firstMonth;
        endDate=real(year,endMonth,Number(lastDay));
        // "December 20 to January 2": the end is in the next year.
        if(startDate&&endDate&&endDate<startDate&&a&&m[3]&&!m[5])endDate=real(year+1,endMonth,Number(lastDay));
      }
      source=m[0];
      // 2026-11-05: "arriving December 20, leaving December 27": two dates joined by a leaving word are the range.
      if(a&&!lastDay&&startDate){
        const rest=String(text).slice(m.index+m[0].length);
        const second=new RegExp('^[^.;]*?\\b(?:leav\\w*|depart\\w*|return\\w*|flying (?:out|home)|going home|check\\w* out|back home|until|till|through|thru)\\b[^.;\\d]*?'+month+'\\.?\\s+'+day+'\\b','i').exec(rest);
        if(second){
          const em=monthNo(second[1]);let end=real(year,em,Number(second[2]));
          if(end&&end<startDate)end=real(year+1,em,Number(second[2]));
          if(end){endDate=end;source=String(text).slice(m.index,m.index+m[0].length+second[0].length);}
        }
      }
      if(!conflict&&(!startDate||lastDay&&!endDate))conflict='The calendar date is invalid; choose a real date.';
    }
  }
  // 2026-10-14: "next weekend" is the Saturday after the coming one (the one after today's, on a weekend).
  if(!startDate&&!conflict&&referenceDate&&/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)){
    const next=/\bnext weekend\b/i.exec(text);
    if(next){const ref=new Date(referenceDate+'T12:00:00Z'),wd=ref.getUTCDay();startDate=new Date(ref.getTime()+(wd===0?6:(6-wd)+7)*86400000).toISOString().slice(0,10);source=next[0];}
    // 2026-10-25 (tools audit): "next week" starts on the coming Monday (tomorrow, when asked on a Sunday).
    const nextWeek=!next&&/\bnext week\b/i.exec(text);
    if(nextWeek){const ref=new Date(referenceDate+'T12:00:00Z'),wd=ref.getUTCDay();startDate=new Date(ref.getTime()+(wd===0?1:8-wd)*86400000).toISOString().slice(0,10);source=nextWeek[0];}
  }
  if(startDate && source) {
    const before=String(text).slice(0,String(text).indexOf(source));
    const weekday=/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*,?\s*$/i.exec(before);
    if(weekday && weekday[1].slice(0,3).toLowerCase()!==DAYS[new Date(startDate+'T12:00:00Z').getUTCDay()]) conflict='The calendar date conflicts with the named weekday; confirm the travel date.';
  }
  let days=null,trimmed=null;
  if(startDate&&endDate){days=Math.round((new Date(endDate+'T12:00:00Z')-new Date(startDate+'T12:00:00Z'))/86400000)+1;if(days<1)conflict='The calendar date range ends before it starts; confirm the travel dates.';else if(days>7&&days<=62){trimmed=days;endDate=new Date(new Date(startDate+'T12:00:00Z').getTime()+6*86400000).toISOString().slice(0,10);days=7;}else if(days>62)conflict='The calendar date range exceeds seven days; the planner supports up to seven days.';}
  return {startDate,endDate,days,trimmed,source,conflict,cleanText:source?String(text).replace(source,' '):String(text)};
}
// 2026-10-14: "something indoors if it rains", "in case it rains", "a rainy-day backup" is a fallback, not the
// trip's weather. Like "a rainy day option", it adds one indoor option and leaves the rest of the plan as asked
// (a family who wants the beach "if it's nice" kept getting an all-indoor trip with "no beaches in Squamish").
// Only a fallback when the rest of the request is about something else; "what can we do if it rains?" is a rainy-day
// request outright.
const RAIN_BACKUP_CONTEXT=/\b(?:beach|beaches|hike|hikes|hiking|walk|walks|park|parks|lake|outdoors?|outside|golf|swim|swimming|sunny|nice weather|if it s nice|weekend|nights?|[2-7] days?|two days|three days|four days|five days)\b/;
const CONDITIONAL_RAIN=/\b(?:if|in case|incase|should|when) (?:it|the weather) (?:rains?|is (?:raining|rainy|bad|wet|crappy|lousy)|turns(?: bad| wet)?|gets (?:bad|wet|rainy))\b|\bin case of (?:rain|bad weather)\b|\b(?:back ?up|plan b|fallback|rain option)\b/;
// Build My Trip fixes (2026-11-18): "Morning coffee and a ski day", "morning coffee, a walk, lunch and dinner": the word
// "morning" describes the first stop, not a morning-only plan, when later parts of the day are asked for too.
function morningOfOneStop(t){
  const x=String(t||'');
  if(!/\bmorning (?:coffee|coffees|breakfast|latte|espresso|cafe|walk|stroll|hike|run|swim|paddle|yoga|ski|skiing|tasting)\b/.test(x))return false;
  if(/\bmorning\b(?! (?:coffee|coffees|breakfast|latte|espresso|cafe|walk|stroll|hike|run|swim|paddle|yoga|ski|skiing|tasting)\b)/.test(x))return false;
  return /\b(?:lunch|dinner|supper|apres|après|afternoon|evening|tonight|night|day|days|weekend|ski day|drinks|happy hour|winer(?:y|ies)|tasting)\b/.test(x.replace(/\bmorning [a-z]+\b/g,' '));
}
function extractTripRequirements({text,intent={},trip={},taxonomy={},referenceDate=null}) {
  const items=[],conflicts=[];let explicitMealCount=null;
  // "at noon" / "starting at midday" is a 12 pm start, like "at 2 pm" (not after a meal such as "lunch at noon", which the bare-start rule skips).
  const original=String(text||'').replace(/\b(at|from|around|starting|start|begin|leave|depart)(\s+(?:at\s+)?)(?:noon|midday)\b/gi,'$1$2 12 pm'), normalizedText=norm(original);
  const duration=/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(hours?|hrs?|minutes?|mins?)\b/i.exec(original);
  const durationMinutes=duration ? Number(duration[1])*(/^h/i.test(duration[2])?60:1) : null;
  if (durationMinutes>0 && durationMinutes<=1440) items.push({id:'duration',kind:'duration',value:durationMinutes,strength:'must',sourceText:duration[0],dayIndex:null,weekday:null});
  const deadline=/\b(?:back|return|finish|finished|done|home)?\s*(?:by|before|no later than)\s+(noon|midday|(?:1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:am|pm))\b/.exec(original.toLowerCase());
  // Audit fix (2026-10-27): a bare "at 4 pm" / "from 4pm" / "around 4 pm" after the date or the town ("drinks then dinner in
  // Penticton on October 30 at 4 pm") is the start too; it was ignored and the plan began at 11 AM. Not when it is a
  // meal's or an event's own time ("dinner at 7 pm", "a show at 8 pm") or part of "no driving after 7 pm".
  const bareStart=(()=>{
    // Indoor test 16 (2026-11-19; "Saturday 7pm then dinner" planned the escape room at 4 PM): a clock right after the
    // day ("Saturday 7pm", "tonight 8 pm") is the start too.
    const re=/\b(?:at|from|around|(?:mon|tues|wednes|thurs|fri|satur|sun)day|today|tonight|tomorrow)\s+(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\b/gi;let m;
    while((m=re.exec(original))){
      const before=original.slice(Math.max(0,m.index-40),m.index).toLowerCase();
      if(/\b(?:dinners?|lunch(?:es)?|breakfasts?|brunch(?:es)?|suppers?|shows?|concerts?|games?|events?|performances?|movies?|films?|tickets?|reservations?|table|booking|tee times?|sunset|happy hours?|trivia|karaoke|bingo|tour)\s*$/.test(before))continue;
      if(/\b(?:no|not|don'?t|avoid|without)\b[^.,;]*\b(?:driv\w*|car)\b[^.,;]*$/.test(before)||/\b(?:by|before|until|till|after|no later than)\s*$/.test(before))continue;
      // A day's clock after a later part ("dinner then escape room Saturday 7pm") is that part's time, not the start.
      if(!/^(?:at|from|around)\b/i.test(m[0])&&/\b(?:then|after|afterwards?|followed by)\b/i.test(original.slice(0,m.index)))continue;
      return m;
    }
    return null;
  })();
  const startClock=/\b(?:starting|start|begin|leave|depart)(?:ing)?\s+(?:at\s+)?(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(original)||bareStart;
  let startMinutes=startClock?(Number(startClock[1])%12)*60+Number(startClock[2]||0)+(startClock[3].toLowerCase()==='pm'?720:0):null;
  // Build My Trip fixes (2026-11-18): the request's own morning start. "Start with coffee at 10" / "breakfast at 9am" (a
  // morning hour after coffee, breakfast or a start word, with or without "am") is the start time; a request that opens
  // with coffee or breakfast, or asks for "morning coffee" / "start with breakfast", starts in the morning (morningStart,
  // 9 AM; brunch 10 AM), each stop still inside its listed hours. It had started around noon or 1 PM to lead up to dinner.
  let morningStart=null;
  // Indoor test 10 (2026-11-19): "early morning", "first thing", "when it opens": the day starts at the first place's opening
  // time when that is before 9 AM (trip-planner.js).
  const earlyMorning=/\b(?:early (?:in the )?mornings?|early morning|first thing(?: in the morning)?|(?:right )?when (?:it|they) opens?|(?:right )?at opening(?: time)?|before work|tot matin|t[oô]t le matin)\b/.test(normalizedText);
  if(startMinutes==null){
    const tail='(?::([0-5]\\d))?\\s*(?:a\\.?m\\.?|o.?clock)?(?![\\d:]|\\s*(?:p\\.?m\\b|tonight|at night|in the (?:evening|afternoon)))';
    const early=new RegExp(`\\b(?:coffee|coffees|breakfast|brunch|cafe|caf\u00e9|latte|espresso)\\b[^.;!?]{0,40}?\\b(?:at|around|from|by)\\s+(1[01]|[6-9])${tail}`,'i').exec(original)
      ||new RegExp(`\\b(?:start|starting|begin|beginning|kick off)\\b[^.;!?]{0,40}?\\b(?:at|around|from)\\s+(1[01]|[89])${tail}`,'i').exec(original);
    if(early)startMinutes=Number(early[1])*60+Number(early[2]||0);
    else if(/\bmorning (?:coffee|coffees|breakfast|latte|espresso|cafe)\b|\b(?:start|starting|begin|beginning|kick off|kicking off)(?: the day| our day| my day| things)? (?:with|at)(?: an?| some| our| my)? (?:coffee|coffees|breakfast|brunch|cafe|latte)\b|^\W*(?:(?:an?|some|early|morning|quick|good|great)\s+)*(?:coffee|coffees|breakfast|latte|lattes|espresso|cafe|cafes|brunch)\b/i.test(original.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))
      morningStart=/^\W*(?:(?:an?|some|early|morning|quick|good|great)\s+)*brunch\b/i.test(original)?600:540;
  }
  // Pub test 3 (Whistler, 2026-11-14): "Dinner at 7 PM at <place>" put dinner at 6 PM (the meal's own time was skipped as a
  // start time and read nowhere else). A meal's own time is that meal's time: dinner or supper from 4 to 10 PM, lunch
  // from 11 AM to 2 PM. -> mealMinutes { dinner, lunch } (absent when not said).
  const mealMinutes={};
  {const re=/\b(dinner|supper|lunch)\s+(?:at|around|for)\s+(1[0-2]|[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi;let mm;
    while((mm=re.exec(original))){
      const meal=/^lunch$/i.test(mm[1])?'lunch':'dinner',min=(Number(mm[2])%12)*60+Number(mm[3]||0)+(/^p/i.test(mm[4])?720:0);
      if(mealMinutes[meal]==null&&(meal==='dinner'?min>=960&&min<=1320:min>=660&&min<=840))mealMinutes[meal]=min;
    }}
  // Restaurant test 1 (Whistler, 2026-11-14): "Dinner for two… Saturday February 13 at 7pm, we love cheese fondue" planned
  // drinks at 7 and dinner at 8:05. When dinner is the only thing asked for (no lunch, drinks, show or other stop), the one
  // evening time after the date ("at 7pm") is dinner's time, not a start time for something before it.
  let dinnerClock=false;
  if(mealMinutes.dinner==null&&bareStart&&/\b(?:dinner|supper)\b/i.test(original)&&!/\b(?:lunch|brunch|breakfast|drinks?|cocktails?|bars?|pubs?|brewer(?:y|ies)|winer(?:y|ies)|wine tasting|tastings?|happy hours?|apr[eè]s|shows?|concerts?|games?|movies?|then|before|after|afterwards?|followed by)\b/i.test(original)){
    const min=(Number(bareStart[1])%12)*60+Number(bareStart[2]||0)+(bareStart[3].toLowerCase()==='pm'?720:0);
    if(min>=960&&min<=1320){mealMinutes.dinner=min;dinnerClock=true;if(startClock===bareStart)startMinutes=null;}
  }
  let deadlineMinutes=null;
  if(deadline){
    const clock=/^(\d+)(?::(\d+))?\s*(am|pm)$/.exec(deadline[1]);
    deadlineMinutes=clock?(Number(clock[1])%12)*60+Number(clock[2]||0)+(clock[3]==='pm'?720:0):720;
    items.push({id:'deadline',kind:'deadline',value:deadlineMinutes,strength:'must',sourceText:deadline[0].trim(),dayIndex:null,weekday:null});
  }
  const calendar=tripCalendar(original,referenceDate),startDate=calendar.startDate;
  if(calendar.conflict)conflicts.push(calendar.conflict);
  // 2026-11-05: dates covering more than a week plan the first seven days and say so (it was an error with no plan).
  if(calendar.trimmed)conflicts.push(`Your dates cover ${calendar.trimmed} days; the planner covers up to seven at a time, so this plan is for the first seven (${calendar.startDate} to ${calendar.endDate}).`);
  const add=(kind,value,clause,extra={})=>{
    const sc=scope(clause),strength=/\b(?:prefer|preferably|ideally|if possible)\b/.test(clause)?'prefer':'must';
    // Distillery test 2 (Whistler, 2026-11-16): a family meal says so, so a kitchen that welcomes kids until a set time counts.
    const kidsMeal=kind==='type'&&value==='restaurant'&&/\b(?:kids?|children|child|family|families|toddlers?)\b/.test(normalizedText)?{kids:true}:{};
    if (!items.some(i=>i.kind===kind&&i.value===value&&i.dayIndex===sc.dayIndex&&i.weekday===sc.weekday)) items.push({id:`r${items.length+1}`,kind,value,strength,sourceText:clause,...sc,...kidsMeal,...extra});
  };
  // Keep sentence/semicolon boundaries and carry explicit day headers across
  // comma-separated clauses. Negation applies within its clause, never across a sentence.
  let dayHeader='';
  // Brewery test 3 (Whistler, 2026-11-16): a "." inside a listed name ("High Mountain Brewing Co. (The Brewhouse)",
  // "Bartier Bros. Vineyard & Winery") is not the end of a sentence: the request is not split there.
  let clauseSource=String(text||'');
  for(const v of (taxonomy&&Array.isArray(taxonomy.venues)?taxonomy.venues:[])){
    const n=v&&typeof v.name==='string'?v.name:'';
    if(!n.includes('.')||n.length<4)continue;
    let at=clauseSource.toLowerCase().indexOf(n.toLowerCase());
    while(at>=0){clauseSource=clauseSource.slice(0,at)+n.replace(/\./g,' ')+clauseSource.slice(at+n.length);at=clauseSource.toLowerCase().indexOf(n.toLowerCase(),at+n.length);}
  }
  const clauses=clauseSource.split(/[.;\n]/).flatMap(sentence=>{
    dayHeader='';return sentence.split(/[,]/).map(part=>{const c=norm(part);if(/\bday\s+[1-7]\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/.test(c))dayHeader=c;return {c,scopeText:dayHeader&&dayHeader!==c?`${dayHeader} ${c}`:c};});
  });
  for(const {c:clauseText,scopeText} of clauses){
    let rawClause=clauseText;
    const eveningDrive=EVENING_NO_DRIVE.exec(rawClause);
    if(eveningDrive){
      // 2026-10-19: 24-hour times too ("pas de conduite après 18 h" arrives as "no driving after 18 h").
      const hr=Number(eveningDrive[1]);
      const h=!eveningDrive[1]?18:hr>=13?hr:hr%12+(eveningDrive[3]==='am'?0:12);
      add('evening_walk',h*60+Number(eveningDrive[2]||0),scopeText,{limitKm:1.5,phrase:eveningDrive[0]});
      rawClause=rawClause.replace(eveningDrive[0],' ');
    }
    const transport=rawClause.match(WALKING_TRANSPORT);
    if(transport)add('transport','walking',scopeText,{limitKm:1.5});
    const c=sportsVenueInterpretationText(rawClause,taxonomy).replace(WALKING_TRANSPORT,' ').replace(/\s+/g,' ').trim();
    for(const [kind,re] of Object.entries(taxonomy?.types?.includes('sport')?{...KINDS,...SPORT_KINDS}:KINDS)) {
      let matchText=c;
      if(kind==='park'&&taxonomy?.types?.includes('sport')) {
        for(const v of taxonomy.venues||[])if(v.type==='sport')matchText=matchText.split(venueName(v.name)).join(' '.repeat(venueName(v.name).length));
        matchText=matchText.replace(/\bskate ?parks?\b/g,x=>' '.repeat(x.length));
      }
      // Indoor test 5 (2026-11-19; "trampoline park Vernon on Christmas Day" planned a bike park): a trampoline, bike, water
      // or skate park is one phrase, never a park.
      if(kind==='park')matchText=matchText.replace(/\b(?:trampoline|bike|water|skate) ?parks?\b/g,x=>' '.repeat(x.length));
      let m=kind==='evening_fun'?null:re.exec(matchText);
      // Tour test 4: the "walk" in "ghost walk" / "lights walk" / "history walk" is the walking tour, not a trail.
      if(m&&['walk','easy_walk'].includes(kind)){const wt=KINDS.walking_tour.exec(matchText)||REQUEST_KINDS.walking_tour.exec(matchText);if(wt&&m.index>=wt.index&&m.index+m[0].length<=wt.index+wt[0].length)m=null;}
      if(!m&&REQUEST_KINDS[kind]){
        m=REQUEST_KINDS[kind].exec(matchText);
        // Only with a dinner or an evening, and when no other kind of place to go was asked for in the request.
        if(m&&kind==='evening_fun'&&(!(/\b(?:evening|tonight|night out|soiree|after (?:dinner|supper))\b/.test(normalizedText)||(/\b(?:dinner|supper)\b/.test(normalizedText)&&/^(?:something|somewhere|an? |une )/.test(m[0])))||(intent.days||0)>1||/\b(?:weekend|getaway|\d+ days?|\d+ nights?|week)\b/.test(normalizedText)||items.some(i=>i.kind==='venue_kind'&&i.value!=='evening_fun')))m=null;
        // Tour test 14: a bare "instructor", "private lesson" or "kids camp" is a ski lesson only on a ski request whose clause
        // names no other sport to learn ("a private kite lesson", "climbing camp").
        if(m&&kind==='ski_lessons'&&(!/\b(?:ski|skis|skiing|snow ?board\w*)\b/.test(normalizedText)||/\b(?:kite\w*|kiting|wing ?foil\w*|surf\w*|sail\w*|paddl\w*|kayak\w*|climb\w*|bike|biking|golf|tennis|pickleball|yoga|cooking|pottery|art|dance|swim\w*|shooting|horse\w*|riding)\b/.test(matchText)))m=null;
        // A bare "helicopters" that is part of a named listing's name ("a flight with Blackcomb Peak Helicopters") is the name.
        if(m&&/^helicopters?$/.test(m[0])&&(taxonomy?.venues||[]).some(v=>{if(!v||!v.name)return false;const n=venueName(v.name),k=` ${n} `.indexOf(` ${m[0]} `);if(k<0)return false;const head=n.slice(0,k+m[0].length);return head.split(' ').length>=2&&` ${matchText} `.includes(` ${head} `);}))m=null;
      }
      if(!m)continue;
      const before=c.slice(0,m.index), neg=/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(before);
      add(neg?'excluded_kind':'venue_kind',kind,scopeText,!neg&&['walk','easy_walk'].includes(kind)&&LAKE_WALK_WORDS.test(c)?{lakeside:true}:kind==='walking_tour'&&/\bwalks?$/.test(m[0])?{walkPhrase:true}:{});
    }
    // Sport test 5 (2026-11-20; "Christmas week skiing with kids" left the ski school out): kids on a ski or snowboard
    // request favour lessons, unless the clause says no lessons or names another lesson kind.
    if(!items.some(i=>i.kind==='venue_kind'&&i.value==='ski_lessons'&&i.sourceText===scopeText)&&/\b(?:skiing|ski|skis|snow ?board\w*)\b/.test(c)&&/\b(?:kids?|children|child|toddlers?|son|daughter|[1-9]|1[0-2]) ?(?:year olds?|yr olds?|years? old)?\b/.test(c)&&/\b(?:kids?|children|child|toddlers?|son|daughter|year olds?|yr olds?|years? old)\b/.test(c)&&!/\b(?:no|without|skip)\b[^.]*\blessons?\b|\bski (?:hill|resort) only\b|\b(?:cross country|nordic|heli|cat|backcountry|touring)\b|\bski (?:shop|rentals?|swap)\b/.test(c)&&!/\b(?:no|not|without|avoid|skip)\b(?:(?!\b(?:but|include|with)\b).)*\b(?:skiing|ski)\b/.test(c))add('venue_kind','ski_lessons',scopeText,{kidsSki:true});
    // Indoor test 10 (2026-11-19): "hot tub and sauna Vernon" asks for a hot tub or sauna (a pool's counts), not a spa day:
    // the spa kind its sauna word also read is dropped unless the clause says spa, massage or the like too.
    if(KINDS.sauna.test(c)&&!/\b(?:spas?|massages?|facials?|hydrotherap\w*|wellness|nordic|thermal|treatments?|soins?)\b/.test(c)){
      for(let k=items.length-1;k>=0;k--)if(items[k].kind==='venue_kind'&&items[k].value==='spa'&&items[k].sourceText===scopeText)items.splice(k,1);
    }
    for(const [value,re] of Object.entries({restaurant:/\b(?:dinner|lunch|restaurants?|meals?)\b/,cafe:/\b(?:cafes?|coffee)\b/,breakfast:/\b(?:breakfast|brunch)\b/,winery:/\b(?:wineries|winery|vineyards?|wine tasting)\b/,golf:/\bgolf\b/,beach:SITE.beachWordRe,outdoor:/\b(?:hiking|skiing|ski|snowshoeing|outdoor)\b/,tour:/\b(?:tours?|cruise|guided)\b/,brewery:/\b(?:brewery|breweries|brewpubs?|taprooms?|craft beer)\b/,distillery:/\b(?:distillery|distilleries|craft spirits|spirits|gin|whisk(?:e)?y|vodka|rum|liqueurs?)\b/,cocktail:/\b(?:cocktails?|cocktail (?:bars?|lounges?))\b/})) {
      const m=re.exec(value==='golf'?c.replace(NOT_GOLF_COURSE_RE,x=>' '.repeat(x.length)):c);if(m&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,m.index)))add('type',value,scopeText,value==='cafe'&&/\bcoffee\b/.test(c)?{servesCoffee:true}:value==='restaurant'&&WINERY_LUNCH.test(c)?{wineryLunch:true}:{});
    }
    // "3 wineries a day" / "two breweries per day" is a count for every day (2026-10-18), capped at
    // PER_DAY_MAX (more tastings than that do not fit a day); "3 wineries" alone is a count for the trip.
    for (const count of c.matchAll(/\b([1-9]|one|two|three|four|five|six|seven|eight|nine)\s+(wineries|winery|vineyards?|cafes?|restaurants?|breweries|brewery|distilleries|distillery)\b/g)) {
      if (/\b(?:no|not|without|avoid|skip|exclude)\b.*$/.test(c.slice(0,count.index))) continue;
      const type=/win|vineyard/.test(count[2])?'winery':/cafe/.test(count[2])?'cafe':/restaurant/.test(count[2])?'restaurant':/brewer/.test(count[2])?'brewery':'distillery';
      const n=Number(count[1])||WORD_DAYS[count[1]]||{eight:8,nine:9}[count[1]];
      const perDay=/^\s*(?:a|per|each|every)\s+(?:day|days)\b|^\s*daily\b/.test(c.slice(count.index+count[0].length));
      if(perDay)add('type_count',type,scopeText,{count:Math.min(n,PER_DAY_MAX),perDay:true,...(n>PER_DAY_MAX?{requestedCount:n}:{})});
      else if(n<=7)add('type_count',type,scopeText,{count:n});
    }
    const singleDinner=/\b(?:a|an|one)\s+(?:(?:relaxed|casual|romantic|special|easygoing|quiet|nice|great)\s+){0,2}(?:dinner|supper)\b/.exec(c);
    // "A nice dinner each night" is a dinner every night, not one dinner (2026-10-18).
    // Round 9 (2026-10-19): "a romantic weekend ... and a great dinner" wants a good dinner, not one dinner in two days
    // (Day 2 had none). On a romantic trip of more than one day only "one dinner" counts the meals.
    const multiDay=(intent.days||0)>1||/\b(?:weekend|getaway|[2-7] days?|two days|three days|four days|five days|[2-7] nights|two nights|three nights)\b/.test(normalizedText);
    const romanticTrip=intent.occasion==='romantic'||intent.occasion==='date_night'||/\b(?:romantic|romance|honeymoon|anniversary)\b/.test(normalizedText);
    const looseDinner=!!singleDinner&&/^(?:a|an)\s/.test(singleDinner[0])&&multiDay&&romanticTrip&&!/\b(?:only|just)\s+(?:a|an)\s/.test(c);
    if(singleDinner&&!looseDinner&&!/\b(?:lunch|breakfast|meals?|dinners?|suppers?)\b/.test(c.replace(singleDinner[0],''))&&!/\b(?:each|every|per) (?:night|evening|day)\b|\bnightly\b|\bnights? in a row\b/.test(c))explicitMealCount=1;
    // 2026-10-14: only a large group is worth a note (seating and bookings); "our two kids" was reported as an
    // unverifiable party size on every family trip.
    if (/\b(?:[89]|[1-9]\d+|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(?:people|adults|guests|of us|friends|guys|girls|ladies)\b/.test(c)) add('unsupported','party size',scopeText);
    for (const event of c.matchAll(/\b(?:concerts?|live music|hockey|events?|festivals?|markets?)\b/g)) {
      if(!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,event.index))){
        const word=event[0].toLowerCase();
        const eventKind=/hockey/.test(word)?'hockey':/concert|music/.test(word)?'live-music':/festivals?/.test(word)?'festival':/markets?/.test(word)?'market':null;
        const value=eventKind==='hockey'?'sports-recreation':eventKind==='live-music'?'live-music':eventKind==='festival'?'events-festivals':eventKind==='market'?'markets-fairs':'any';
        // Round 10 (2026-10-19): "Christmas markets" are the holiday markets, not any market.
        add('event',value,scopeText,eventKind==='market'&&/\b(?:christmas|xmas|holiday|festive)\s+(?:craft\s+)?markets?\b/.test(c)?{eventKind,holiday:true}:{eventKind});
      }
    }
    // "A comedy show", "dinner and a show" (2026-10-19): comedy is an event whose listing says comedy; a show is any
    // listed performance.
    const comedy=/\b(?:comedy|comedians?|improv|stand ?up)\b/.exec(c), show=/\b(?:a|the|some|any) (?:\w+ )?shows?\b|\bshows\b/.exec(c);
    // Round 10: "shows and live music" asks for both (the show was dropped once live music was read).
    if((comedy||show)&&!items.some(i=>i.kind==='event'&&i.sourceText===scopeText&&!['live-music','hockey','festival','market'].includes(i.eventKind))&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,(comedy||show).index))&&!/\b(?:show (?:me|us)|shows? (?:me|us))\b/.test(c))add('event','any',scopeText,comedy?{eventKind:'comedy',textTerms:['comedy']}:{eventKind:'show'});
    // 2026-10-21: "no hiking" rules out trail networks and hikes (a trail network opened a "no hiking" Squamish plan); a
    // flat lakeside walk, promenade, garden or beach is still fine.
    {const h=/\b(?:hike|hikes|hiking|trails?|mountain biking)\b/.exec(c);
      if(h&&/\b(?:no|not|without|avoid|skip|exclude|hate|don t like|dont like)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,h.index)))add('excluded_activity','hiking',scopeText);}
    for (const [activity,re] of Object.entries({skiing:/\b(?:ski|skiing)\b/,snowshoeing:/\b(?:snowshoeing|snowshoe)\b/,winter:/\b(?:ski|skiing|snowshoeing|snowshoe|winter activities?)\b/,hiking:/\b(?:hike|hiking|hikes)\b/,viewpoints:/\b(?:viewpoints?|lookouts?|sunset)\b/})) {
      const m=re.exec(c);if(m&&!/\b(?:no|not|without|avoid|skip|exclude|don t|do not|dont|won t|never)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,m.index))&&!(activity==='skiing'||activity==='winter')||m&&(activity==='skiing'||activity==='winter')&&!/\b(?:no|not|without|avoid|skip|exclude|don t|do not|dont|won t|never)\s+(?:\w+\s+){0,2}$/.test(c.slice(0,m.index))&&!/\bnon ?skiers?\b/.test(c))add('activity',activity,scopeText);
    }
    if(/\b(?:rainy|rains?|indoors|indoor|wet weather)\b|\b(?:cold|chilly|freezing|frigid|snowy|stormy) (?:day|days|afternoon|morning|evening|weekend)\b/.test(c)&&!/\b(?:no|avoid|without)\s+(?:rain|rainy|indoor)/.test(c)) add('rainy',true,scopeText,{activityOnly:/\brainy day (?:option|activity|activities)\b/.test(c)||!!trip.multi&&/^(?:a |an )?rainy day$/.test(c)||CONDITIONAL_RAIN.test(c)&&RAIN_BACKUP_CONTEXT.test(normalizedText),conditional:CONDITIONAL_RAIN.test(c)&&RAIN_BACKUP_CONTEXT.test(normalizedText)});
    for(const [feature,re] of Object.entries({vegetarian:/\bvegetarian\b/,vegan:/\bvegan\b/,gluten_free:/\bgluten free\b/})) {
      if(re.test(c)&&!/\b(?:not|no)\s+(?:vegetarian|vegan|gluten free)/.test(c))add('feature',feature,scopeText);
    }
    const dogRequest=/\b(?:dog friendly|with (?:my |our |a )?dog|bring (?:my |our |a )?dog|(?:my|our) dog)\b(?! ?(?:sled|sleds|sledding|team|teams|mushing|tours?|rides?))/.exec(c);
    if(dogRequest&&!/\b(?:no|not|without|avoid|skip|exclude)\s*$/.test(c.slice(0,dogRequest.index)))add('feature','dog_friendly',scopeText);
    if(/\b(?:only|must|verified)\b.*\b(?:kid friendly|family friendly)\b/.test(c))add('feature','kid_friendly',scopeText);
    if(/\b(?:limited driving|keep driving limited|minimi[sz]e driving|nearby stops|short drives)\b/.test(c))add('distance',30,scopeText);
    const km=/\b(?:under|within|maximum|max|less than)\s+(\d+)\s*(?:km|kilomet(?:er|re)s?)\b/.exec(c);
    if(km)add('distance',Number(km[1]),scopeText);
    if(/\$\s*\d+/.test(String(text))&&/\b(?:budget|under|spend|cost|dollars|trip)\b/.test(c))add('unsupported','exact budget',scopeText);
    if(/\b(?:wheelchair|accessible|accessibility)\b/.test(c))add('unsupported','accessibility',scopeText);
    if(/\b(?:ages?|aged)\s*\d+\b|\b\d+\s*year olds?\b/.test(c))add('unsupported','age suitability',scopeText);
    // 2026-10-14: "one day trip to Squamish" inside a longer stay is a day trip, not a second trip length.
    const longerStay=/\b(?:[2-7]|two|three|four|five|six|seven)\s+days?\b|\bweekend\b|\bnights?\b|\bweek\b/.test(normalizedText);
    for(const length of c.matchAll(/\b([1-7]|one|two|three|four|five|six|seven)\s+days?\b/g)) {
      if(longerStay&&/^(?:1|one)$/.test(length[1])&&/^\s*trips?\b/.test(c.slice(length.index+length[0].length)))continue;
      // Round 8 (2026-10-19): "2 days: Squamish breweries one day, Whistler breweries the next" -- "one day" is which day, not a length.
      if(longerStay&&/^(?:1|one)$/.test(length[1])&&/\b(?:the next|the other|the second|next day|another day|day two|the day after|the following day)\b/.test(normalizedText))continue;
      add('days',Number(length[1])||WORD_DAYS[length[1]],scopeText,{dayIndex:null,weekday:null});
    }
    const dayTrip=/\bday trips? (?:to|into|over to|down to|up to|out to) (.+)/.exec(c);
    if(dayTrip&&longerStay){const region=(taxonomy.regions||[]).find(r=>dayTrip[1].startsWith(norm((taxonomy.regionLabels||{})[r]||r)));if(region)add('day_trip',region,scopeText);}
    const base=/\b(?:based|staying|stay)\s+(?:in|at)\s+(.+)/.exec(c);
    if(base){const region=(taxonomy.regions||[]).find(r=>base[1].startsWith(norm((taxonomy.regionLabels||{})[r]||r)));if(region)add('base',region,scopeText);}
    for(const type of ['beach','golf','winery','brewery','tour','outdoor','restaurant','pub']) {
      const re=new RegExp(`\\b(?:no|not|without|avoid|skip|exclude)\\b(?:(?!\\b(?:but|include|with)\\b).)*\\b${type==='winery'?'(?:wine|wineries|winery|vineyards?)':type==='beach'?'beaches?':type+'s?'}\\b`);
      if(re.test(c))add('excluded_type',type,scopeText);
    }
  }
  // Only full stored names mentioned as destinations are accepted. Ambiguous
  // names are explained; don't guess using substring "cores".
  const normalized=norm(text),names=new Map();
  for(const v of taxonomy.venues||[]) {
    if(v.redirect_to||!v.name)continue;
    const name=venueName(v.name);if(name.length<4)continue;
    // A listing named like a region ("Whistler Blackcomb") is the region when the request says it (2026-10-25).
    if(Object.values(taxonomy.regionLabels||{}).some(l=>venueName(String(l))===name))continue;
    const mention=clauses.find(({c})=>` ${c} `.includes(` ${name} `)&&!/\b(?:no|not|without|avoid|skip|exclude)\b.*$/.test(c.slice(0,c.indexOf(name))));
    if(!mention)continue;
    if(!names.has(name))names.set(name,[]);names.get(name).push({...v,scopeText:mention.scopeText});
  }
  // A name inside a longer name found too ("Sea to Sky Gondola" in "Sea to Sky Gondola Tube Park") is that longer place (2026-10-25).
  for(const name of [...names.keys()])if([...names.keys()].some(o=>o!==name&&o.length>name.length&&` ${o} `.includes(` ${name} `)))names.delete(name);
  // 2026-11-05: a place named by the front of its name -- "Waterfront Wines" for Waterfront Wines Restaurant, "Home Block" for
  // Home Block at CedarCreek Estate Winery -- is that place when no other listing shares those words (never a guess between two).
  const matchedIds=new Set([...names.values()].flatMap(vs=>vs.map(v=>v.id)));
  // Distillery test 2 (Whistler, 2026-11-16): "Howe Sound Spirits" is not Howe Sound Brewing's "Howe Sound": an alias whose
  // words run on, in the request, into the next word of another listing's name names that other listing, not this one.
  const longer=(alias,v,c)=>(taxonomy.venues||[]).some(o=>{if(o.id===v.id||o.redirect_to||!o.name)return false;const on=venueName(o.name);if(!on.startsWith(alias+' '))return false;const nx=on.slice(alias.length+1).split(' ')[0];return !!nx&&` ${c} `.includes(` ${alias} ${nx} `);});
  for(const [alias,v] of venueAliases(taxonomy.venues||[])) {
    if(matchedIds.has(v.id)||names.has(alias))continue;
    const mention=clauses.find(({c})=>` ${c} `.includes(` ${alias} `)&&!/\b(?:no|not|without|avoid|skip|exclude)\b.*$/.test(c.slice(0,c.indexOf(alias)))&&!longer(alias,v,c));
    if(!mention)continue;
    names.set(alias,[{...v,scopeText:mention.scopeText}]);
  }
  for(const [name,vs] of names){if(vs.length===1)add('venue',vs[0].id,vs[0].scopeText,{venueType:vs[0].type,venueName:vs[0].name});else conflicts.push(`More than one listing is named “${vs[0].name}”; choose a specific venue.`);}
  // Budget bands guide suggestions; they never verify a total dollar cost.
  if (/\b(?:under|budget of|maximum|max)\s*\$\s*(?:100|[1-9]\d?)\b/i.test(original) || /\b(?:easy|simple|casual) (?:food|meals|dining)\b/.test(normalizedText)) add('price_limit',2,'Prefer lower price bands; total cost remains unverified.');
  if (items.some(i=>i.value==='easy_walk')) {for(let n=items.length-1;n>=0;n--)if(items[n].kind==='venue_kind'&&items[n].value==='walk'&&items.some(i=>i.kind==='venue_kind'&&i.value==='easy_walk'&&i.dayIndex===items[n].dayIndex&&i.weekday===items[n].weekday&&i.strength===items[n].strength))items.splice(n,1);}
  // From Whistler Roam #188 (2026-11-17, real-data check): a snowshoe tour asked for is that tour, not also the
  // snowshoeing and winter activities. The server builds the day's stops from these items before the planner runs, so
  // "snowshoe tour in Whistler on January 20" had a "Snowshoeing" stop and planned Lost Lake Snowshoe Trails first, the
  // operator second. Plain "snowshoeing" keeps the trails.
  // Tour test 15 (Whistler, 2026-11-18; Dave, a sunset guided paddle): a "sunset paddle tour" / "sunset cruise" is that tour
  // at sunset, not also a sunset viewpoint (the plan needed a tour, a viewpoint and a sunset spot, and planned nothing).
  if(items.some(i=>i.kind==='venue_kind'&&TOUR_PLANNER_KINDS.includes(i.value)&&i.strength==='must')&&/\bsunset (?:guided )?(?:paddl\w*|kayak\w*|canoe\w*|sup|paddleboard\w*|cruise\w*|boat\w*|sail\w*|tours?|snowshoe\w*|rides?|trips?|horseback\w*|trail rides?)\b/.test(normalizedText)){for(let n=items.length-1;n>=0;n--)if(items[n].kind==='venue_kind'&&items[n].value==='sunset'||items[n].kind==='activity'&&items[n].value==='viewpoints'&&!/\b(?:viewpoints?|lookouts?|views?)\b/.test(normalizedText))items.splice(n,1);}
  if(items.some(i=>i.kind==='venue_kind'&&i.value==='snowshoe_tour'&&i.strength==='must')){for(let n=items.length-1;n>=0;n--)if(items[n].kind==='activity'&&['snowshoeing','winter'].includes(items[n].value))items.splice(n,1);}
  // The same for heli-skiing and cat-skiing: not also the skiing and winter activities and the outdoor places they bring
  // ("heli-skiing in Whistler" with no date, in November, left out every Whistler heli-ski company for not being a ski
  // area, and listed one in Brackendale). An outdoor place asked for in its own words (a hike, a trail) stays.
  if(items.some(i=>i.kind==='venue_kind'&&i.value==='heli_ski'&&i.strength==='must')){for(let n=items.length-1;n>=0;n--)if(items[n].kind==='activity'&&['skiing','winter'].includes(items[n].value)||items[n].kind==='type'&&items[n].value==='outdoor'&&!/\b(?:hikes?|hiking|trails?|walks?|walking|parks?|beach\w*|lakes?|outdoors?|viewpoints?|waterfalls?|nordic|cross country|snowshoe\w*)\b/.test(items[n].sourceText||''))items.splice(n,1);}
  // Tour test 7: ski touring, avalanche courses, multi-day trips and mountain guides asked for are those tours, not also the
  // skiing, winter or hiking activities and the outdoor places they bring ("ski touring in Pemberton" planned the ski
  // hill and Whistler heli-skiing). An outdoor place asked for in its own words stays.
  if(items.some(i=>i.kind==='venue_kind'&&['ski_touring','avalanche_course','multi_day_tour','mountain_guide'].includes(i.value)&&i.strength==='must')){for(let n=items.length-1;n>=0;n--)if(items[n].kind==='activity'&&['skiing','winter','hiking','snowshoeing'].includes(items[n].value)&&!/\b(?:ski (?:hill|resort|day)|lift tickets?|resort skiing|snowshoe\w*|hiking trails?)\b/.test(items[n].sourceText||'')||items[n].kind==='type'&&items[n].value==='outdoor'&&!/\b(?:trails?|walks?|walking|parks?|beach\w*|lakes?|outdoors?|viewpoints?|waterfalls?|nordic|cross country)\b/.test(items[n].sourceText||'')||items[n].kind==='type'&&items[n].value==='tour'&&items[n].strength==='must')items.splice(n,1);}
  if(deadlineMinutes!=null && deadlineMinutes<=18*60 && items.some(i=>i.kind==='type'&&i.value==='restaurant'&&/\b(?:dinner|supper)\b/.test(i.sourceText))) conflicts.push('Dinner conflicts with the requested return deadline; choose an earlier meal or a later deadline.');
  if(calendar.days>0&&calendar.days<=7)add('days',calendar.days,calendar.source,{dayIndex:null,weekday:null});
  const lengths=new Set(items.filter(i=>i.kind==='days').map(i=>i.value));
  if(lengths.size>1)conflicts.push(calendar.days?'The calendar date range conflicts with the requested trip length; confirm the dates or number of days.':'Different trip lengths were requested; confirm the number of days.');
  for(const i of items.filter(i=>i.kind==='venue_kind'))if(items.some(j=>j.kind==='excluded_kind'&&j.value===i.value&&j.dayIndex===i.dayIndex))conflicts.push(`Both requested and excluded: ${LABELS[i.value]}.`);
  for (const item of items) if (item.kind === 'event') {
    const named = (trip.components || []).filter(c => c.kind === 'event' && c.event.nameTerms?.length
      && c.event.nameTerms.every(term => norm(item.sourceText).split(' ').includes(term)));
    if (named.length === 1) item.nameTerms = named[0].event.nameTerms.slice();
  }
  // 2026-10-14: "pizza one night", "sushi once" -- that food is wanted on one meal, not every day (a 3-day family trip
  // planned pizza for all three dinners). The word just before the frequency phrase is kept; the planner uses it once.
  const {onceTerms,onceEvening}=onceFoods(normalizedText);
  return bareTimeWindow({onceTerms,onceEvening,occasion:intent.occasion||null,items:items.filter(i=>i.kind!=='event'||i.value!=='any'||['show','comedy'].includes(i.eventKind)||!items.some(j=>j.kind==='event'&&j.value!=='any'&&j.sourceText===i.sourceText)),conflicts,startMinutes,...(morningStart!=null?{morningStart}:{}),...(earlyMorning?{earlyMorning:true}:{}),...(Object.keys(mealMinutes).length?{mealMinutes}:{}),...(dinnerClock?{dinnerAtClock:true}:{}),startDate,endDate:calendar.endDate,dateSource:calendar.source,text:normalizedText,planDays:intent.days||null,explicitMealCount,outingScope:durationMinutes>0&&durationMinutes<=1440?'short':null,onlyRequested:/\b(?:only|just)\s+(?:a |an |one )?(?:coffee|cafes?|museums?|galler(?:y|ies)|dinner|lunch|winery|wineries|walk)\b|\b(?:coffee|cafes?|museums?|dinner|lunch|winery|wineries|walk)\s+only\b/.test(normalizedText),daypart:deadlineMinutes!=null?(deadlineMinutes<=720?'morning':deadlineMinutes<=1020?'afternoon':'evening'):/\b(?<!no )(?<!without )(?<!skip )morning\b/.test(normalizedText)&&!morningOfOneStop(normalizedText)?'morning':/\b(?<!no )(?<!without )(?<!skip )afternoon\b/.test(normalizedText)?'afternoon':/\b(?:evening|date night|night out|a night|tonight)\b/.test(normalizedText)?'evening':null},intent,trip,referenceDate);
}
// Time windows (2026-10-20, round 11): a request that names only a town and a time -- "this weekend in Squamish",
// "Saturday evening in Squamish", "an afternoon in Whistler", "morning in Pemberton" -- is a plan for that time, not
// an Ideas list. "This weekend" is the coming Saturday and Sunday (only Sunday on a Sunday); a morning, afternoon or
// evening is a one-day plan for that window (timeWindow, read by explicitOutingComponents), on the named day.
const WINDOW_START={morning:540,afternoon:780,evening:1020};
function isoAdd(iso,n){return new Date(new Date(`${iso}T12:00:00Z`).getTime()+n*86400000).toISOString().slice(0,10);}
// Indoor test 11 (2026-11-19; "Vernon on a Monday in July" planned Monday November 23): a weekday in a named month is the
// next such day in that month (server.js tripMonthWeekdayDate does the same for a list of places).
function monthWeekday(ref,weekday,month){
  if(!ref||weekday<0||!Number.isInteger(month)||month<1||month>12)return null;
  let d=ref;
  for(let n=0;n<400;n++,d=isoAdd(d,1)){if(Number(d.slice(5,7))===month&&new Date(`${d}T12:00:00Z`).getUTCDay()===weekday)return d;}
  return null;
}
function bareTimeWindow(out,intent={},trip={},referenceDate=null){
  const i=intent||{},when=i.when||null;
  const empty=k=>!(i[k]||[]).length;
  if(i.mode!=='find'||(i.regions||[]).length!==1||trip?.route||trip?.multi||out.items.length||out.conflicts.length||out.startDate||out.onlyRequested||out.outingScope)return out;
  // Round 12 (2026-10-20): "this weekend in Whistler with kids / with the family" keeps the window (kid-friendly picks).
  const familyOnly=(i.features||[]).every(f=>f==='kid_friendly')&&(!i.occasion||i.occasion==='family');
  if(!['types','collections','activities','cuisines','foodTerms','textTerms','eventCategories'].every(empty)||!familyOnly||i.budget||i.lake)return out;
  if((i.excluded?.types||[]).length||(i.excluded?.concepts||[]).length)return out;
  const ref=/^\d{4}-\d{2}-\d{2}$/.test(referenceDate||'')?referenceDate:null;
  const wd=ref?new Date(`${ref}T12:00:00Z`).getUTCDay():null;
  const weekday=when?.weekday?DAYS.indexOf(String(when.weekday).slice(0,3)):-1;
  // Only the words morning, afternoon or evening ("tonight" at 7 PM keeps the Ideas list, timed by the clock).
  // Round 12 (2026-10-20): "tonight in Whistler" and "Friday night / Saturday night in Whistler" (« ce soir », « vendredi
  // soir ») are an evening too; "tonight at 7 pm" keeps the Ideas list, timed by the clock.
  // "What can we do in Whistler tonight" asks for ideas, and keeps the Ideas list.
  const night=out.startMinutes==null&&(!out.daypart||out.daypart==='evening')&&/\b(?:tonight|(?:mon|tues|wednes|thurs|fri|satur|sun)day night)\b/.test(out.text||'')&&!/\b(?:what|where|things?|ideas?|suggest\w*|recommend\w*|anything|something)\b/.test(out.text||'');
  if(night)out.daypart='evening';
  const window=out.daypart&&(night||new RegExp(`\\b${out.daypart}\\b`).test(out.text||''))&&WINDOW_START[out.daypart]!=null&&!out.items.some(x=>x.kind==='deadline')?out.daypart:null;
  if(!window&&when?.preset==='this-weekend'&&weekday<0){
    if(ref){out.startDate=wd===0||wd===6?ref:isoAdd(ref,6-wd);out.dateSource='this weekend';}
    const n=wd===0?1:2;
    out.items.push({id:'weekend',kind:'days',value:n,strength:'must',sourceText:'this weekend',dayIndex:null,weekday:null});
    out.endDate=ref&&n>1?isoAdd(out.startDate,1):null;out.planDays=n;
    return out;
  }
  // Round 13 (2026-10-21): "Saturday in Pemberton" (a town and a weekday, nothing else) is a one-day plan on that day,
  // not an Ideas list. "What can we do Saturday in Pemberton" still asks for ideas.
  if(!window&&weekday>=0&&ref&&!out.daypart&&!when?.preset&&!/\b(?:what|where|things?|ideas?|suggest\w*|recommend\w*|anything|something)\b/.test(out.text||'')){
    out.startDate=monthWeekday(ref,weekday,i.month)||isoAdd(ref,(weekday-wd+7)%7);out.dateSource=out.dateSource||'the day you named';
    out.items.push({id:'weekday-day',kind:'days',value:1,strength:'must',sourceText:String(when.weekday),dayIndex:null,weekday:null});
    out.planDays=1;
    return out;
  }
  if(!window)return out;
  out.timeWindow=window;
  out.startMinutes=WINDOW_START[window];
  if(ref){
    if(weekday>=0)out.startDate=monthWeekday(ref,weekday,i.month)||isoAdd(ref,(weekday-wd+7)%7);
    else if(when?.relative==='tomorrow')out.startDate=isoAdd(ref,1);
    else if(/\btonight\b/.test(out.text||'')||when?.preset==='today'){out.startDate=ref;out.windowToday=true;}
    else if(when?.preset==='this-weekend')out.startDate=wd===0||wd===6?ref:isoAdd(ref,6-wd);
    if(out.startDate)out.dateSource=out.dateSource||'the day you named';
  }
  return out;
}
// Round 12 (2026-10-20): an undated window that has already passed today ("an afternoon in Whistler" asked at 6:45 PM
// Pacific) is planned for tomorrow, not for hours that are over. clock is whistlerClock(now): {date, minutes}.
// Round 13 (2026-10-21): the same for "tonight" / « ce soir » (dated today). A window that has started but still has
// at least 90 minutes left starts at the next quarter hour, with fewer stops (the first ones are dropped: at 8:20 PM
// "tonight" is dinner at 8:30 and a nightcap, not drinks at 5 PM). requirements.windowClock records what was done, so
// the plan can say so. Returns true when the plan moved to tomorrow.
const WINDOW_END={morning:840,afternoon:1140,evening:1440};
const WINDOW_STOP_MINUTES=75;
function rollPastTimeWindow(requirements,clock){
  const w=requirements?.timeWindow;
  if(!w||!clock||!/^\d{4}-\d{2}-\d{2}$/.test(clock.date||'')||!Number.isFinite(clock.minutes))return false;
  if(requirements.startDate&&requirements.startDate!==clock.date)return false;
  const canRoll=!requirements.startDate||!!requirements.windowToday;
  if(clock.minutes<=WINDOW_START[w])return false;
  const start=Math.ceil(clock.minutes/15)*15,left=WINDOW_END[w]-start;
  if(left<90){
    if(!canRoll)return false;
    requirements.startDate=isoAdd(clock.date,1);requirements.dateSource='tomorrow';requirements.startMinutes=WINDOW_START[w];
    requirements.windowClock={rolled:true,window:w,now:clock.minutes};
    return true;
  }
  requirements.startMinutes=start;
  requirements.windowStops=Math.max(1,Math.min(3,Math.floor(left/WINDOW_STOP_MINUTES)));
  requirements.windowClock={rolled:false,window:w,now:clock.minutes,start};
  return false;
}
// The stops of a time-window plan (round 11): what a morning, an afternoon or an evening in a town is made of.
function timeWindowComponents(trip,requirements){
  const w=requirements.timeWindow;
  const make=(types,phrase,extra={})=>({kind:'venue',types,phrase,activities:[],features:[],collections:[],cuisines:[],dog:!!trip?.party?.dog,kids:!!trip?.party?.kids,meal:null,daypart:w,generic:false,windowStop:true,...extra});
  const parts=w==='morning'?[make(['cafe'],'coffee'),make(['outdoor','indoor'],'a walk or a sight'),make(['restaurant'],'lunch',{meal:'lunch',daypart:'midday'})]
    :w==='afternoon'?[make(['outdoor','indoor'],'a walk or a sight'),make(['winery','brewery'],'a tasting'),make(['cafe'],'coffee or a treat')]
    :[make(['winery','brewery','cocktail'],'drinks'),make(['restaurant'],'dinner',{meal:'dinner'}),make(['cocktail','pub','brewery'],'a nightcap')];
  // Round 13: a window that has already started keeps only the stops that still fit (the last ones).
  const n=Number.isInteger(requirements.windowStops)?requirements.windowStops:parts.length;
  return {...trip,multi:true,components:parts.slice(Math.max(0,parts.length-n)),leftoverTerms:[],explicitStops:true,timeWindow:w,regions:trip?.regions||[],party:trip?.party||{dog:false,kids:false},when:trip?.when||null,route:trip?.route||null,unknownPlaces:trip?.unknownPlaces||[]};
}
// Words covered by verified requirement grammar must not also become
// unmatched cuisine searches. Unknown terms still reach the old interpreter.
function consumedTerms(requirements) {
  const terms = new Set();
  const add = text => norm(text).split(' ').forEach(w => terms.add(w));
  if (requirements?.daypart) add('morning afternoon evening');
  if (requirements?.onlyRequested) add('only just');
  if (requirements?.startDate) add(`starting start begins beginning ${requirements.dateSource || ''}`);
  if (requirements?.startMinutes != null) add('starting start begin leave depart at am pm');
  for (const i of requirements?.items || []) {
    // Audit fix (2026-10-27): "Masa's" is also read as one word ("masas"), so both spellings are the name, never a food word.
    if (i.kind === 'venue') { add(i.venueName || ''); add(String(i.venueName || '').replace(/['’]/g, '')); }
    if (i.kind === 'transport') add('no car without a our my do not have don t driving free on foot walkable walk walking between the stops places venues we want to');
    if (i.kind === 'evening_walk') add(`no not don t do won will avoid without want to driving drive car after past once it s at in the dark night nightfall sunset dinner evening am pm ${i.phrase || ''}`);
    if (i.kind === 'deadline') add(`${i.sourceText} back return finish finished done home by before no later than noon midday am pm`);
    if (i.kind === 'duration') add('hour hours hr hrs minute minutes min mins afternoon morning evening');
    if (i.kind === 'unsupported') {
      if(i.value==='party size') add('one two three four five six seven eight nine ten people adults children kids guests');
      if(i.value==='age suitability') add('one two three four five six seven eight nine ten ages age aged year years old olds');
      if(i.value==='accessibility') add('someone using wheelchair accessible accessibility');
      if(i.value==='exact budget') add('total people budget under maximum max cost spend dollars');
      add(i.sourceText.split(' ').filter(w=>/^\d+$/.test(w)).join(' '));
    }
    if (i.kind === 'distance') add('keep driving limited minimize minimise nearby stops short drives under within maximum max less than km kilometers kilometres');
    if (i.kind === 'event') {
      if (i.eventKind === 'hockey') add('ice hockey game games match matches junior');
      if (i.nameTerms?.length) add(i.nameTerms.join(' '));
    }
    if (i.kind === 'feature') add(`${i.value.replace(/_/g, ' ')} meals meal only must verified`);
    if (i.kind === 'activity') add(i.value==='viewpoints'?'sunset viewpoints viewpoint watch place to':i.value);
    // From Whistler Roam #188 (2026-11-17): the new tour kinds' own words too ("cat skiing in Whistler" kept "cat" as a word to find).
    // Indoor test 9: an indoor kind's own words are the kind ("story time" is the library, never a word its listing must hold).
    if (i.kind === 'venue_kind' && INDOOR_KIND_REQUEST_WORDS[i.value]) add(INDOOR_KIND_REQUEST_WORDS[i.value]);
    if (i.kind === 'venue_kind' && i.value === 'skating') add('skate skates skating ice rink rinks arena arenas patiner patinage'); // indoor test 17
    if (i.kind === 'venue_kind') add(`${LABELS[i.value]} ${i.value==='sunset'?'watch place to':i.value==='cooking'?'classes':i.value==='horseback'?'horse riding':i.value==='scenic_flight'?'helicopter helicopters heli flights flightseeing glacier landing landings float plane planes floatplane seaplane ride rides':i.value==='heli_hike'?'helihiking heli hike hikes':i.value==='food_tour'?'food foodie culinary tasting tours':i.value==='walking_tour'?'walking walk walks tours lights light lantern night evening ghost history historic historical heritage guided winter christmas holiday':i.value==='heli_ski'?'heli ski skis skiing heliski heliskiing heliboarding board boarding cat catski catskiing snowcat snowcats':i.value==='snowshoe_tour'?'snowshoe snowshoes snowshoeing guided tours trips outings excursions':i.value==='fishing_tour'?'fishing charter charters trip trips tours guide guides guided guiding salmon sturgeon sport':i.value==='rentals'?'equipment gear outdoor adventure rental rentals':i.value==='adventure_park'?'adventure park parks aerial treetop tree top ropes course courses high trekking':i.value==='bike_tour'?'guided bike bikes biking e ebike cycling mountain road gravel tours rides trips':i.value==='paddle_tour'?'guided kayak kayaking canoe canoeing sup paddle paddleboard paddling tours trips excursions lessons outings':i.value==='ski_touring'?'ski skis skiing touring tour tours backcountry splitboard splitboarding mountaineering skimo alpine guided guide guides lesson lessons':i.value==='avalanche_course'?'avalanche course courses training safety skills awareness class classes certification ast 1 2 one two':i.value==='multi_day_tour'?'hut huts trip trips multi day days multiday overnight hike hikes hiking trek treks trekking traverse traverses expedition expeditions backpacking guided tour tours stay stays 1 2 3 4 5 6 7 two three four five six seven':i.value==='paragliding'?'paragliding paraglide paraglides paraglider paragliders para gliding glide glider gliders tandem flight flights skydiving skydive skydives sky dive diving parachute parachuting hang speed flying fly riding paramotor paramotoring':i.value==='mountain_guide'?'mountain guide guides guided guiding mountaineering alpinism alpine climb climbs climbing glacier ascent ascents summit summits ice acmg ifmga':i.value==='ski_lessons'?'ski skis skiing snowboard snowboarding snow board boarding lesson lessons school schools instructor instructors instruction coaching coach clinic clinics camp camps class classes course courses program private group kids kid children child adult adults adaptive sit beginner beginners first time timer learn learning to nordic cross country teacher teachers':i.value==='kite_lessons'?'kite kiteboard kiteboarding kitesurf kitesurfing kiting wing foil foiling windsurf windsurfing wakeboard wakeboarding lesson lessons school clinic clinics coaching course courses camp camps class classes instruction':i.value==='shooting'?'target shooting range ranges guided lesson lessons session sessions experience clay trap skeet biathlon rifle':''}`);
  }
  return terms;
}
// Keep standalone activities as their own stops in a mixed itinerary.
// A rainy-day option is not an instruction to keep every other stop indoors.

// A constrained single-day outing schedules requested components, rather than
// filling unrelated breakfast/lunch/dinner slots. Multi-day plans stay intact.
// Skating asked for (audit 2026-10-27): the plan's generic outdoor ("winter") part is the rink, indoors or out
// ("ice skating and hot chocolate in Whistler" planned the Train Wreck trail).
// Sport test 3: mini golf is played at a range (golf), a family fun centre (indoor), an amusement park (outdoor) or a
// sports listing; a driving range is a golf or sports listing.
const GOLF_PART_TYPES={mini_golf:['golf','indoor','outdoor','sport'],driving_range:['golf','sport']};
// Sport test 3: an unscoped mini golf or driving range request ("mini golf in Kelowna") is that kind's stop, as skating is,
// never a golf course.
function golfPartComponents(trip,requirements){
  const asked=(requirements.items||[]).filter(i=>i.kind==='venue_kind'&&i.strength==='must'&&GOLF_PART_TYPES[i.value]).map(i=>i.value);
  if(!asked.length||!Array.isArray(trip?.components))return trip;
  let comps=trip.components.slice();
  for(const k of asked){
    if(comps.some(c=>(c.plannerKinds||[]).includes(k)))continue;
    const part={kind:'venue',types:GOLF_PART_TYPES[k],phrase:LABELS[k],plannerKinds:[k],activities:[],features:[],collections:[],cuisines:[],dog:!!trip?.party?.dog,kids:!!trip?.party?.kids,meal:null,daypart:requirements.daypart,generic:false};
    const at=comps.findIndex(c=>c.kind==='venue'&&(c.types||[]).length===1&&['golf','outdoor','indoor'].includes(c.types[0])&&!(c.plannerKinds||[]).length&&!c.meal);
    comps=at>=0?comps.map((c,n)=>n===at?{...part,daypart:c.daypart||part.daypart}:c):[...comps,part];
  }
  return {...trip,components:comps};
}
function skatingComponents(trip,requirements){
  if(!(requirements.items||[]).some(i=>i.kind==='venue_kind'&&i.strength==='must'&&i.value==='skating')||!Array.isArray(trip?.components))return trip;
  if(trip.components.some(c=>(c.plannerKinds||[]).includes('skating')))return trip;
  const rink={kind:'venue',types:['indoor','sport','outdoor'],phrase:LABELS.skating,plannerKinds:['skating'],activities:[],features:[],collections:[],cuisines:[],dog:!!trip?.party?.dog,kids:!!trip?.party?.kids,meal:null,daypart:requirements.daypart,generic:false};
  const at=trip.components.findIndex(c=>c.kind==='venue'&&(c.types||[]).length===1&&c.types[0]==='outdoor'&&!(c.plannerKinds||[]).length);
  return {...trip,components:at>=0?trip.components.map((c,n)=>n===at?{...rink,daypart:c.daypart||rink.daypart}:c):[...trip.components,rink]};
}
// 2026-11-05: places named in a short outing ("lunch at Frankie We Salute You, then Kasugai Garden") are those stops, in the
// order they were named; they were looked for and then replaced by other places.
function bindNamedVenues(trip,requirements) {
  const named=(requirements.items||[]).filter(i=>i.kind==='venue'&&i.strength==='must'&&Number.isInteger(i.value)&&i.venueType&&i.venueName);
  if(!named.length||!trip?.multi||!(trip.components||[]).length)return trip;
  const text=' '+norm(requirements.text||'')+' ',comps=trip.components.map(c=>({...c}));
  const where=(s)=>{const n=text.indexOf(' '+norm(s||'')+' ');return n<0?-1:n;};
  let changed=false;
  for(const item of named) {
    if(comps.some(c=>c.venueId===item.value))continue;
    const at=where(item.venueName);
    const idx=comps.findIndex(c=>c.kind==='venue'&&!c.venueId&&(c.types||[]).includes(item.venueType));
    if(idx>=0){comps[idx].venueId=item.value;comps[idx].phrase=item.venueName;changed=true;continue;}
    const part={kind:'venue',types:[item.venueType],phrase:item.venueName,activities:[],features:[],collections:[],cuisines:[],dog:!!trip.party?.dog,kids:!!trip.party?.kids,meal:null,daypart:requirements.daypart||null,generic:false,venueId:item.value};
    let insertAt=comps.length;
    if(at>=0)for(let n=0;n<comps.length;n++){const w=where(comps[n].phrase);if(w>at){insertAt=n;break;}}
    comps.splice(insertAt,0,part);changed=true;
  }
  return changed?{...trip,components:comps,explicitStops:true}:trip;
}
function explicitOutingComponents(trip,requirements) {
  const items=requirements.items||[],days=items.find(i=>i.kind==='days')?.value||requirements.planDays;
  if(days>1 || items.some(i=>i.dayIndex>1))return trip;
  const kinds=items.filter(i=>i.kind==='venue_kind'&&i.strength==='must');
  // Indoor test 13 (2026-11-19; "dinner and a movie" was a generic indoor stop): every indoor kind asked with a meal too.
  // 2026-10-25: "spa day and dinner in Penticton" found nothing (the spa and the dinner were one request); an activity
  // asked for with a meal is two stops, as a game and dinner already were.
  const scoped=kinds.some(i=>SPORT_KINDS[i.value]||GOLF_PART_TYPES[i.value]||['evening_fun','spa','museum','gallery','escape','bowling','climbing','arcade','theatre','pottery','cooking','horseback','sunset','cinema','playground','pool','curling','yoga','casino','library'].includes(i.value))&&items.some(i=>i.kind==='type'&&i.value==='restaurant'&&/\b(?:dinner|supper|lunch)\b/.test(i.sourceText))||!!(kinds.length&&requirements.startDate)||items.some(i=>i.kind==='transport')||requirements.onlyRequested||requirements.outingScope==='short'||days===1&&(kinds.length||items.some(i=>i.kind==='activity'||i.kind==='rainy'&&i.activityOnly))||items.some(i=>i.kind==='price_limit')||requirements.daypart&&(kinds.length||items.some(i=>i.kind==='activity')||items.filter(i=>i.kind==='type'&&i.strength==='must').length>=1);
  if(!scoped)trip=golfPartComponents(skatingComponents(trip,requirements),requirements);
  if(!scoped)return bindNamedVenues(requirements.timeWindow&&!trip?.multi?timeWindowComponents(trip,requirements):trip,requirements);
  const text=requirements.text||'',parts=[];
  const typeFor=k=>SPORT_KINDS[k]?'sport':['walk','easy_walk','challenging_hike','park','sunset','horseback'].includes(k)?'outdoor':TOUR_PLANNER_KINDS.includes(k)?'tour':'indoor';
  const make=(types,phrase,extra={})=>({kind:'venue',types,phrase,activities:[],features:[],collections:[],cuisines:[],dog:!!trip?.party?.dog,kids:!!trip?.party?.kids,meal:null,daypart:requirements.daypart,generic:false,...extra});
  for(const i of kinds)parts.push(make(i.value==='skating'?['indoor','sport','outdoor']:GOLF_PART_TYPES[i.value]||[typeFor(i.value)],LABELS[i.value],{plannerKinds:[i.value]}));
  for(const i of items.filter(i=>i.kind==='activity'&&i.strength==='must')) {
    if(i.value==='winter'&&(items.some(j=>j.kind==='activity'&&['skiing','snowshoeing'].includes(j.value))||kinds.some(k=>k.value==='skating')))continue;
    const existing=parts.find(c=>i.value==='viewpoints'&&(c.plannerKinds||[]).includes('sunset')||i.value==='hiking'&&(c.plannerKinds||[]).some(k=>['guided_hike','challenging_hike','easy_walk'].includes(k)));
    if(existing)existing.activities.push(i.value);
    // Water and adventure (2026-10-25: "kayak and SUP in Squamish"): lakes are listed as beaches and the paddling and zipline
    // outfitters as tours, so the part looks at those too.
    else parts.push(make(i.value==='water'?['outdoor','beach','tour']:i.value==='adventure'||i.value==='nature'?['outdoor','tour']:['outdoor'],i.value,{activities:[i.value]}));
  }
  for(const i of items.filter(i=>i.kind==='event'&&i.strength==='must')) {
    const kind=i.eventKind||(/\bfestivals?\b/.test(i.sourceText)?'festival':/\bmarkets?\b/.test(i.sourceText)?'market':'event');
    parts.push({kind:'event',types:[],activities:[],features:[],collections:[],cuisines:[],phrase:kind,daypart:requirements.daypart,event:{kind,category:i.value==='any'?null:i.value,terms:[...(kind==='hockey'?['hockey']:[]),...(i.nameTerms||[])],...(i.nameTerms?.length?{nameTerms:i.nameTerms.slice()}:{}),noun:kind==='hockey'?'hockey game':kind,venueFeature:null}});
  }
  const represented=new Set(parts.flatMap(c=>c.types));
  for(const i of items.filter(i=>i.kind==='type'&&i.strength==='must')) {
    if(represented.has(i.value))continue;
    const dinner=i.value==='restaurant'&&/\b(?:dinner|supper)\b/.test(text);
    parts.push(make(i.value==='breakfast'?['cafe','restaurant']:[i.value],i.value==='cafe'?'coffee':dinner?'dinner':i.value,{meal:dinner?'dinner':null,daypart:dinner?'evening':requirements.daypart}));represented.add(i.value);
  }
  if(kinds.some(i=>SPORT_KINDS[i.value])&&/\blunch\b/.test(text)&&/\b(?:dinner|supper)\b/.test(text)&&!/\b(?:no|without|skip|avoid) lunch\b/.test(text))parts.push(make(['restaurant'],'lunch',{meal:'lunch',daypart:'afternoon'}));
  for(const i of items.filter(i=>i.kind==='venue'&&i.strength==='must')) {
    const existing=parts.find(c=>c.kind==='venue'&&c.types.includes(i.venueType)&&!c.venueId);
    if(existing){existing.venueId=i.value;existing.phrase=i.venueName;}
    else if(i.venueType)parts.push(make([i.venueType],i.venueName,{venueId:i.value}));
  }
  // Round 14 (2026-10-20): a part of the request with no requirement of its own ("drinks" in "drinks and dinner tonight
  // in Squamish") is kept; the plan was dinner alone.
  if(trip?.multi&&parts.length)for(const c of trip.components||[]){
    if(c.kind!=='venue'||c.meal||c.venueId||!(c.types||[]).length||c.types.some(t=>represented.has(t)))continue;
    parts.push({...c,daypart:c.daypart||requirements.daypart});for(const t of c.types)represented.add(t);
  }
  if(parts.length<2&&!((requirements.outingScope==='short'||requirements.daypart||requirements.onlyRequested||items.some(i=>i.kind==='transport'))&&parts.length===1))return trip;
  const pos=c=>{const needle=c.phrase==='BMX'?'bmx':c.phrase==='walk'?'walk':c.phrase;const n=text.indexOf(needle);return n<0?10000:n;};
  parts.sort((a,b)=>pos(a)-pos(b));
  return {...trip,multi:true,components:parts,leftoverTerms:[],explicitStops:true,outingOccasion:trip?.outingOccasion,regions:trip?.regions||[],party:trip?.party||{dog:false,kids:false},when:trip?.when||null,route:trip?.route||null,unknownPlaces:trip?.unknownPlaces||[]};
}

// A place named in a short outing is its stop (bindNamedVenues), whichever way the components were built.
function expandTripComponents(trip,requirements) { return bindNamedVenues(expandTripComponentsInner(trip,requirements),requirements); }
function expandTripComponentsInner(trip,requirements) {
  // Round 15b (2026-10-20): a crawl keeps its three stops ("brewery hopping this afternoon" became one brewery:
  // the afternoon's explicit-outing rebuild merged the crawl's copies into its one item).
  if (!(trip?.multi && trip.crawl) && (!trip?.multi || requirements.daypart || requirements.onlyRequested || requirements.items.some(i=>i.kind==='transport'))) trip=explicitOutingComponents(trip,requirements);
  if (!trip?.multi) return trip;
  trip=golfPartComponents(skatingComponents(trip,requirements),requirements);
  const singleDay=!(requirements.planDays>1||(requirements.items||[]).some(i=>i.kind==='days'&&i.value>1||i.dayIndex>1));
  const components=trip.components.map(c=>singleDay&&requirements.daypart&&!c.meal?{...c,daypart:requirements.daypart}:c);
  for(const item of requirements.items.filter(i=>i.kind==='venue_kind'&&i.strength==='must'&&['easy_walk','challenging_hike'].includes(i.value))){
    for(let n=0;n<components.length;n++)if(components[n].kind==='venue'&&(components[n].activities||[]).includes('hiking'))components[n]={...components[n],plannerKinds:[...new Set([...(components[n].plannerKinds||[]),item.value])]};
  }
  // Indoor test 13 (2026-11-19; "dinner and a movie" planned the cinema as "Indoor & rainy day spots"): the indoor part of a
  // two-part request is the indoor kind asked for (its label, its kind's places and its kind's visit length).
  const INDOOR_PKS=new Set(Object.values(INDOOR_KIND_PLANNER).flat());
  for(const item of requirements.items.filter(i=>i.kind==='venue_kind'&&i.strength==='must'&&INDOOR_PKS.has(i.value))){
    if(components.some(c=>(c.plannerKinds||[]).includes(item.value)))continue;
    const n=components.findIndex(c=>c.kind==='venue'&&(c.types||[]).length===1&&c.types[0]==='indoor'&&!(c.plannerKinds||[]).length&&!c.rainyOption&&!c.venueId);
    if(n>=0)components[n]={...components[n],plannerKinds:[item.value],phrase:LABELS[item.value]||components[n].phrase,generic:false};
  }
  for (const item of (requirements.items||[]).filter(i=>i.kind==='venue_kind'&&i.strength==='must'&&['sunset','horseback'].includes(i.value))) {
    const existing=components.findIndex(c=>c.kind==='venue'&&((c.plannerKinds||[]).includes(item.value)||item.value==='sunset'&&(c.activities||[]).includes('viewpoints')));
    if (existing>=0) {
      components[existing]={...components[existing],plannerKinds:[...new Set([...(components[existing].plannerKinds||[]),item.value])],daypart:item.value==='sunset'?'evening':components[existing].daypart};
      continue;
    }
    components.push({kind:'venue',types:['outdoor'],plannerKinds:[item.value],activities:item.value==='sunset'?['viewpoints']:[],features:[],collections:[],cuisines:[],dog:!!trip.party?.dog,kids:!!trip.party?.kids,meal:null,daypart:item.value==='sunset'?'evening':null,generic:false,phrase:item.sourceText});
  }
  if (requirements.items.some(i=>i.kind==='rainy'&&i.activityOnly) && !components.some(c=>c.rainyOption||c.kind==='venue'&&c.types.includes('indoor'))) components.push({kind:'venue',types:['indoor'],plannerKinds:[],activities:[],features:[],collections:[],cuisines:[],dog:!!trip.party?.dog,kids:!!trip.party?.kids,meal:null,daypart:'morning',generic:true,rainyOption:true,phrase:'rainy-day activity'});
  const consumed=consumedTerms(requirements);
  return {...trip,components,...(singleDay&&['date_night','romantic'].includes(requirements.occasion)&&components.some(c=>c.kind==='venue'&&['dinner','supper'].includes(c.meal))?{outingOccasion:requirements.occasion}:{}),leftoverTerms:(trip.leftoverTerms||[]).filter(w=>!consumed.has(w))};
}
function requirementDay(item,date) {
  if(item.dayIndex)return item.dayIndex;
  if(item.weekday&&/^\d{4}-\d{2}-\d{2}$/.test(date||'')) {const d=new Date(`${date}T12:00:00Z`);return (DAYS.indexOf(item.weekday)-d.getUTCDay()+7)%7+1;}
  return null;
}
function applicable(item,day,date){const wanted=requirementDay(item,date);return wanted==null||wanted===day;}
function coffeeEvidence(v){
  // Café test 1 (Whistler, 2026-11-15): a café listed as "Coffee" or "Coffee shop" (its cuisine) serves coffee too.
  const text=norm([v.name,v.plannerDescription||v.description,v.textName,v.textDesc,v.textCuisine,v.cuisine].filter(Boolean).join(' '));
  if(/\b(?:no coffee|without coffee|does not serve coffee|do not serve coffee|coffee free)\b/.test(text))return false;
  return /\b(?:coffee|espresso|cappuccino|latte|americano|flat white|cortado)\b/.test(text);
}
// Distillery test 2: its own kitchen, minors welcome with an adult until a set time, and no time asked at or after it.
function kidsKitchenOk(v,text){
  const u=/^(\d{2}):(\d{2})$/.exec(String(v&&v.kidsUntil||''));if(!u||!v.ownKitchen)return false;
  const m=/\b(?:at|around|by|for)\s+(\d{1,2})(?:[: ](\d{2}))?\s*(am|pm|a m|p m)\b/i.exec(String(text||''));
  if(!m)return true;
  return ((Number(m[1])%12)+(/^p/i.test(m[3])?12:0))*60+Number(m[2]||0)<Number(u[1])*60+Number(u[2]);
}
function matches(v,i){
  // "Lunch at a winery restaurant" (2026-10-19): a winery that serves lunch is that restaurant.
  if(i.wineryLunch&&i.kind==='type'&&v.type==='winery')return true;
  if(i.kind==='day_trip')return v.region===i.value;
  if(i.servesCoffee&&!coffeeEvidence(v))return false;
  if(i.lakeside&&i.kind==='venue_kind')return lakeWalk(v);
  if(i.kind==='venue_kind'||i.kind==='excluded_kind')return (v.plannerKinds||inferPlannerKinds(v)).includes(i.value);
  if(i.kind==='venue')return v.id===i.value;
  // Distillery test 2 (Whistler, 2026-11-16): a place with its own kitchen that lists a brunch (« Brunch jazz » on Sundays) is a brunch spot too.
  if(i.kind==='type'&&i.value==='restaurant'&&i.kids&&kidsKitchenOk(v,i.sourceText))return true;
  if(i.kind==='type'&&i.value==='breakfast'&&v.ownKitchen&&(v.nights||[]).some(n=>/\b(?:brunch|breakfast)\b/i.test(`${n.title||''} ${n.titleFr||''}`)))return true;
  if(i.kind==='type'||i.kind==='type_count'||i.kind==='excluded_type')return i.value==='breakfast'?['cafe','restaurant'].includes(v.type):v.type===i.value||(v.fdTypes||[]).includes(i.value)||i.value==='tour'&&(v.plannerKinds||inferPlannerKinds(v)).some(k=>['boat_tour','wine_tour','guided_hike','snow_tour','sleigh_ride','cooking'].includes(k));
  if(i.kind==='activity')return (v.activities||[]).includes(i.value);
  if(i.kind==='excluded_activity')return i.value==='hiking'&&hikingPlace(v);
  if(i.kind==='feature')return !!(v.features||{})[i.value]||(i.value==='dog_friendly'&&(v.collections||[]).includes('dog_friendly'));
  if(i.kind==='rainy')return v.indoorEvidence==='explicit'||v.type==='indoor'||v.indoorGolf===true;
  return false;
}
// Round 11 (2026-10-20): a place with no stored hours whose listing says it runs on one day of the week ("every Saturday
// morning from mid-April to the end of October", a weekly farmers' market) is only planned on that day and in those
// months. null when the listing says nothing that clear.
const WEEKDAY_WORDS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTH_WORDS=['january','february','march','april','may','june','july','august','september','october','november','december'];
function listedWeekdays(v){
  // Not food and drink: "live music every Friday" at a restaurant is a night of the week, not its only open day.
  if(!v||DINING.has(v.type)||['winery','brewery','distillery','pub','cocktail'].includes(v.type)||(v.hours&&v.hours!=='[]'&&v.hours!=='{}'&&v.hours!=='null'))return null;
  const text=String(v.plannerDescription||v.description||'').toLowerCase();
  if(!text)return null;
  const days=new Set();
  const day='(sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
  for(const m of text.matchAll(new RegExp(`\\b(?:every|each) ${day}\\b|\\b${day}s only\\b|\\bon ${day} (?:mornings|afternoons|evenings)\\b|\\b(?:only|just) on ${day}s?\\b`,'g')))days.add(WEEKDAY_WORDS.indexOf(m[1]||m[2]||m[3]||m[4]));
  if(!days.size||days.size>2)return null;
  const range=new RegExp(`\\bfrom (?:(?:early|mid|late)[- ])?(${MONTH_WORDS.join('|')})(?: \\d{1,2}(?:st|nd|rd|th)?)? (?:to|until|through) (?:the (?:end|middle) of |(?:early|mid|late)[- ])?(${MONTH_WORDS.join('|')})\\b`).exec(text);
  return {days,months:range?[MONTH_WORDS.indexOf(range[1])+1,MONTH_WORDS.indexOf(range[2])+1]:null};
}
function listedDayConflict(v,day,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const listed=listedWeekdays(v);
  if(!listed)return false;
  const on=new Date(new Date(`${date}T12:00:00Z`).getTime()+((day||1)-1)*86400000);
  if(!listed.days.has(on.getUTCDay()))return true;
  if(listed.months){const m=on.getUTCMonth()+1,[a,b]=listed.months;if(a<=b?(m<a||m>b):(m<a&&m>b))return true;}
  return false;
}
function venueAllowed(v,requirements,day,date){
  if(listedAccessConflict(v,requirements,day,date))return false;
  if(listedDayConflict(v,day,date))return false;
  for(const i of requirements?.items||[]){
    if(i.strength==='prefer'||!applicable(i,day,date))continue;
    if(i.servesCoffee&&(v.type==='cafe'||(v.fdTypes||[]).includes('cafe'))&&!coffeeEvidence(v))return false;
    if((i.kind==='excluded_kind'||i.kind==='excluded_type'||i.kind==='excluded_activity')&&matches(v,i))return false;
    // A dog trip's meals may be at a place that isn't dog-friendly (labelled on the stop); places to go must be (2026-10-25).
    if(i.kind==='feature'&&((i.value==='dog_friendly'&&(SITE.dogMealsMustBeListed||!DINING.has(v.type)))||i.value==='kid_friendly'||(DINING.has(v.type)&&i.value!=='dog_friendly'))&&!matches(v,i))return false;
    if(i.kind==='price_limit'&&DINING.has(v.type)&&v.price!=null&&v.price>i.value)return false;
    // Audit 2026-10-27: "a rainy day ... a short walk" kept every outdoor place out, the walk too; a place that answers
    // something the visitor asked for by name (a walk, a hike, a beach) stays allowed on a rainy day.
    if(i.kind==='rainy'&&!i.activityOnly&&(v.type==='beach'||v.type==='outdoor'||v.type==='golf'&&!v.indoorGolf)&&!(rainWeather(i)&&requestedOutdoor(v,requirements)))return false;
  }return true;
}
// Rain is the weather, not an instruction: "only indoors" / "indoors only" still keeps every outdoor place out.
function rainWeather(i){return /\b(?:rain|rains|rainy|raining|wet weather)\b/.test(i.sourceText||'')&&!/\b(?:only indoors?|indoors? only|stay (?:inside|indoors))\b/.test(i.sourceText||'');}
// An outdoor place that meets a must-have outdoor part of the request (venue kind, outdoor/beach/golf type, activity).
function requestedOutdoor(v,requirements){
  return (requirements?.items||[]).some(j=>j.strength==='must'&&(j.kind==='venue_kind'||j.kind==='activity'||j.kind==='type'&&['outdoor','beach','golf'].includes(j.value))&&matches(v,j));
}
function requirementScore(v,requirements,day,date,covered=new Set()){
  let score=0;
  for(const i of requirements?.items||[]){if(!applicable(i,day,date)||covered.has(i.id))continue;
    if(['venue_kind','venue','type','activity'].includes(i.kind)&&matches(v,i))score+=i.strength==='must'?100:25;
    if(i.kind==='rainy'&&matches(v,i))score+=DINING.has(v.type)?35:140;
  }return score;
}
// Resolve distinctive phrases against supplied, date/region-filtered listings only.
// Two meaningful words and one unique title are required; never infer from one word.
const NAMED_EVENT_GENERIC = new Set(['tour', 'tours', 'one', 'two', 'day', 'days', 'weekend', 'weekends', 'night', 'nights', 'trip', 'food', 'bc', ...SITE.areaWords]);
function namedEventInterpretationText(text, events = [], details = false) {
  const normalized = norm(text), tokens = normalized.split(' ');
  if (/\b(?:concerts?|events?|live music|festivals?|hockey|markets?)\b/.test(normalized) || tokens.length > 100) return details ? {text, ambiguity:null} : text;
  const filler = new Set('the a an and of return experience tribute show night day live music dinner lunch date plan with in at to'.split(' '));
  const matches = [];
  for (const event of events) {
    const title = norm(event.name).split(' ').filter(w => !filler.has(w));
    if (title.length < 2) continue;
    for (let start = 0; start < tokens.length; start++) {
      if (filler.has(tokens[start])) continue;
      for (let end = start + 2; end <= Math.min(tokens.length, start + 10); end++) {
        if (filler.has(tokens[end - 1])) continue;
        const words = tokens.slice(start, end).filter(w => !['the','a','an','and','of'].includes(w));
        const eventRegion = norm(event.region || '').replace(/-/g, ' ');
        if (words.length < 2 || words.join(' ') === eventRegion || !(` ${title.join(' ')} `).includes(` ${words.join(' ')} `)) continue;
        // Round 7 (2026-10-19): a town and a generic word are not an event's name ("food tour Whistler" is not "Whistler
        // Comedy Food Tour (Whistler)").
        const regionWords = new Set(eventRegion.split(' '));
        if (words.filter(w => !regionWords.has(w) && !NAMED_EVENT_GENERIC.has(w)).length < 2) continue;
        if (/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include)\b).)*$/.test(tokens.slice(0,start).join(' '))) continue;
        matches.push({start,end,phrase:words.join(' '),title:norm(event.name),music:(event.categories || []).includes('live-music')});
      }
    }
  }
  const titles = [...new Set(matches.map(m => m.title))];
  if (titles.length > 1) {
    const candidateNames = events.filter(e => titles.includes(norm(e.name))).map(e => e.name);
    const uniqueNames = [...new Set(candidateNames)];
    const candidateIds = uniqueNames.map(name => events.find(e => norm(e.name) === norm(name))?.id).filter(Number.isSafeInteger);
    const result = {text, ambiguity:{phrase:matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0].phrase, candidates:uniqueNames, candidateIds}};
    return details ? result : text;
  }
  if (!titles.length) return details ? {text, ambiguity:null} : text;
  const match = matches.sort((a,b) => (b.end-b.start)-(a.end-a.start))[0];
  tokens.splice(match.end, 0, match.music ? 'concert' : 'event');
  const result = {text:tokens.join(' '), ambiguity:null};
  return details ? result : result.text;
}

function eventMatches(event,item) {
  if (item.eventKind === 'comedy' && !/\b(?:comedy|comedian|comedians|comedic|improv|stand ?up|laughs?)\b/.test(norm(`${event.name || ''} ${event.description || ''}`))) return false;
  // Round 10: a nightlife listing alone (a coffee social, a boutique night) is not a show.
  if (item.eventKind === 'show' && !(event.categories || []).some(c => ['arts-culture','live-music'].includes(c)) && !/\b(?:show|shows|comedy|concert|theatre|theater|performance|musical|play|dance|ballet|opera|symphony)\b/.test(norm(event.name || ''))) return false;
  if (item.holiday && !(event.categories || []).includes('holiday-seasonal') && !/\b(?:christmas|xmas|holiday|festive|santa|noel|christkindl\w*|yule\w*)\b/.test(norm(event.name || ''))) return false;
  if (item.nameTerms?.length && !item.nameTerms.every(term => norm(event.name || '').split(' ').includes(term))) return false;
  if(item.value !== 'any' && !(event.categories || []).includes(item.value)) return false;
  // A comedian listed under Live Music is not live music (2026-10-19).
  if((item.value === 'live-music' || ['live-music','concert'].includes(item.eventKind)) && /\b(?:comedian|comedians|stand up comedy|standup comedy|comedy tour|comedy show|comedy night)\b/.test(norm(`${event.name || ''} ${event.description || ''}`))) return false;
  if(item.eventKind === 'hockey') return /\b(?:hockey|nhl|whl|bchl)\b/.test(norm(`${event.name || ''} ${event.description || ''}`));
  return true;
}
function eventSearchTermMatches(event,term,category){
  const categories=event.categories||[];
  if(category&&category!=='any'&&!categories.includes(category))return false;
  const text=norm(`${event.name||''} ${event.description||''}`);
  if(norm(term)==='hockey')return /\b(?:hockey|nhl|whl|bchl)\b/.test(text);
  return norm(term).split(' ').filter(Boolean).every(word=>text.split(' ').includes(word));
}
function selectedStops(plan){
  if(plan.days?.length)return plan.days.flatMap(d=>d.stops.map(s=>({...s,day:d.day})));
  return [...(plan.itinerary?.stops||[]),...(plan.outing?.stops||[]),...(plan.recommendations||[])].map(s=>({...s,day:1}));
}
function km(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lng-a.lng);return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2)));}
// Road travel (2026-10-18): straight-line km x 1.3 for the road, at 50 km/h for a short hop rising to 70 km/h on a
// longer highway leg, never under 5 minutes. (It used to be x1.6 at 30 km/h plus 15 minutes: "43 min" for 8.5 km
// inside one town.) Walking stays 3-4 km/h.
const ROAD_FACTOR=1.3,MIN_DRIVE_MINUTES=5;
function driveMinutes(distance){
  const road=distance*ROAD_FACTOR;
  const speed=road<=10?50:road>=40?70:50+(road-10)*20/30;
  return Math.max(MIN_DRIVE_MINUTES,Math.ceil(road/speed*60));
}
function transferRange(distance,walking=false){
  if(walking)return {minMinutes:Math.ceil(distance/4*60),maxMinutes:Math.ceil(distance*1.3/3*60)+5};
  const max=driveMinutes(distance);
  return {minMinutes:Math.max(MIN_DRIVE_MINUTES,Math.floor(max*0.85)),maxMinutes:max};
}
// Water detours: lakeDetour(a,b) -> { km, side, highway, via } when the road between two places has to go around a
// body of water (shore roads in side, the rest in highway), else null. The parent site's lake-crossing geometry was
// removed for the Sea to Sky fork: the corridor follows one highway along Howe Sound and the valleys, so the straight
// line (x1.3) stands for every pair. Kept as a hook so estimateTransfer's around-the-water branch still works if a crossing is
// added later.
// A lake with no crossing between its two ends (SITE.lakeCrossing, null where there is none): a straight line across it is not the drive.
const LAKE_CROSSING=SITE.lakeCrossing;
function lakeShore(p){
  if(!LAKE_CROSSING)return null;
  const LAKE_CENTRE=LAKE_CROSSING.centre;
  if(!p||!(p.lat>LAKE_CENTRE[0][0]&&p.lat<LAKE_CENTRE[LAKE_CENTRE.length-1][0]))return null;
  const i=LAKE_CENTRE.findIndex(([lat])=>lat>=p.lat),[la,lo]=LAKE_CENTRE[i-1],[lb,lob]=LAKE_CENTRE[i];
  const centre=lo+(lob-lo)*(p.lat-la)/(lb-la),off=p.lng-centre;
  if(Math.abs(off)>0.12)return null;
  return off<0?'west':p.lat<LAKE_CROSSING.eastSplit?'east-south':'east-north';
}
function lakeDetour(a,b){
  if(!LAKE_CROSSING)return null;
  const {southEnd,bridge,viaSouth,viaBridge}=LAKE_CROSSING;
  const sa=lakeShore(a),sb=lakeShore(b);
  if(!sa||!sb||sa===sb)return null;
  const pair=[sa,sb].sort().join('/');
  let d;
  if(pair==='east-south/west')d={side:km(a,southEnd)+km(southEnd,b),highway:0,via:viaSouth};
  else if(pair==='east-north/west')d={side:km(a,bridge)+km(bridge,b),highway:0,via:viaBridge};
  else{const [s,n]=sa==='east-south'?[a,b]:[b,a];d={side:km(s,southEnd)+km(bridge,n),highway:km(southEnd,bridge)*1.1,via:viaSouth};}
  d.km=d.side+d.highway;
  return d.km>=km(a,b)*1.3?d:null;
}
// Kilometres to travel between two places: the straight line, or the way around the lake.
function travelKm(a,b){const d=lakeDetour(a,b);return d?d.km:km(a,b);}
function estimateTransfer(a,b,walking=false){
  if(!a||!b||![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)||Math.abs(a.lat)>90||Math.abs(b.lat)>90||Math.abs(a.lng)>180||Math.abs(b.lng)>180)return null;
  const detour=lakeDetour(a,b);
  if(!detour)return {...transferRange(km(a,b),walking),mode:walking?'walking':'driving assumed'};
  // Around the water: winding shore roads (x1.5 rather than x1.3) plus 8 minutes for the crossing.
  if(walking)return {...transferRange(detour.km,true),mode:'walking',aroundLake:detour.via};
  const max=driveMinutes((detour.side*1.5+detour.highway*ROAD_FACTOR)/ROAD_FACTOR)+8;
  return {minMinutes:Math.max(MIN_DRIVE_MINUTES,Math.floor(max*0.85)),maxMinutes:max,mode:'driving assumed',aroundLake:detour.via};
}
// Approximate NOAA general solar equations; no terrain or weather model.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
function estimateDaylight(date,location){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||![location?.lat,location?.lng].every(Number.isFinite)||Math.abs(location.lat)>60||Math.abs(location.lng)>180)return null;
 const noon=new Date(date+'T12:00:00Z');if(!Number.isFinite(noon.getTime())||noon.toISOString().slice(0,10)!==date)return null;
 const year=noon.getUTCFullYear(),days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000,n=(noon-Date.UTC(year,0,1))/86400000;
 const g=2*Math.PI/days*Math.floor(n),rad=x=>x*Math.PI/180;
 const eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
 const dec=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
 const cosine=Math.cos(rad(90.833))/(Math.cos(rad(location.lat))*Math.cos(dec))-Math.tan(rad(location.lat))*Math.tan(dec);
 if(Math.abs(cosine)>1)return null;
 const angle=Math.acos(cosine)*180/Math.PI;
 // Fresh eyes (2026-11-22): B.C. is on fixed UTC-7 from November 1, 2026 (no fall back; server.js BC_PERMANENT_UTC7_FROM).
 // Runtimes whose bundled tzdata predates the change (Node's 2026a) still fell back to UTC-8 here, so the same plan showed
 // sunset an hour apart on two machines. From that date the offset is UTC-7 whatever the tzdata says.
 let offset;
 if(noon.getTime()>=Date.UTC(2026,10,1,9,0))offset=-420;
 else{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Vancouver',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(noon);
  const value=t=>Number(parts.find(p=>p.type===t).value);offset=value('hour')*60+value('minute')-720;}
 return {sunriseMinutes:Math.ceil(720-4*(location.lng+angle)-eq+offset),sunsetMinutes:Math.floor(720-4*(location.lng-angle)-eq+offset)};
}
// Conservative timing from an outdoor listing, not independently verified.
// Access-road hours and walks to nearby places are not park/trail timing.
function listedOutdoorTiming(v) {
  if (v?.type !== 'outdoor') return {};
  const text = String(v.plannerDescription || v.description || '').replace(/a\.m\./gi, 'am').replace(/p\.m\./gi, 'pm');
  const durations = [];
  let ambiguousDuration = false;
  for (const clause of text.split(/[.;!?]/)) {
    if (!/\b(?:trail|hike|hiking|route)\b/i.test(clause) || /\b(?:drive|driving|closed)\b/i.test(clause)) continue;
    const range = /\b(\d{1,3})\s*(?:–|-|to)\s*(\d{1,3})\s*minutes?\b/i.exec(clause);
    const mixed = /\b(\d{1,3})\s*minutes?\s*to\s*(?:an?|one)\s*hour\s*and\s*a\s*half\b/i.exec(clause);
    if ([...clause.matchAll(/\b\d{1,3}\s*(?:–|-|to)\s*\d{1,3}\s*minutes?\b/gi)].length + [...clause.matchAll(/\b\d{1,3}\s*minutes?\s*to\s*(?:an?|one)\s*hour\s*and\s*a\s*half\b/gi)].length > 1) ambiguousDuration = true;
    if (range || mixed) {
      const match = range || mixed;
      if (/^\s*(?:walk|drive)\s+(?:from|to)\b/i.test(clause.slice(match.index + match[0].length))) continue;
      const min = Number((range || mixed)[1]), max = range ? Number(range[2]) : 90;
      if (min >= 15 && max >= min && max <= 720) durations.push([min, max]);
    }
  }
  // Multiple route ranges are ambiguous; retain the generic allowance.
  const durationRange = !ambiguousDuration && durations.length === 1 ? durations[0] : null;
  const hours = /\b(?:the )?park is open (?:daily )?(1[0-2]|[1-9])\s*(am|pm)\s+to\s+(1[0-2]|[1-9])\s*(am|pm)\b([^.;!?]*)/i.exec(text);
  let hoursRange = null;
  const hoursClause = hours && text.split(/[.;!?]/).find(c => c.includes(hours[0]));
  if (hours && (text.match(/\bpark is open\b/gi) || []).length === 1 && !/\b(?:summer|winter|season|seasonal|weekdays?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|only|holidays?|vehicle|road|gate)\b/i.test(hoursClause || hours[5])) {
    const clock = (h, ap) => Number(h) % 12 * 60 + (ap.toLowerCase() === 'pm' ? 720 : 0);
    const from = clock(hours[1], hours[2]), to = clock(hours[3], hours[4]);
    if (to > from) hoursRange = [from, to];
  }
  return { durationRange, hoursRange };
}
// Conservative sport visit allowances; never claimed as operator-supplied durations.
function sportVisitAllowance(v,kinds){
 if(v.type!=='sport')return null;
 if(kinds.includes('disc_golf'))return /\b(?:nine|9)[ -]hole\b/i.test(v.plannerDescription||'')?[30,60]:[60,120];
 if(kinds.some(k=>['bmx','skatepark','tennis','pickleball'].includes(k)))return [45,90];
 return null;
}
function isOutdoorSport(v){
 if(v.type!=='sport')return false;
 const text=(v.name||'')+' '+(v.plannerDescription||'');
 if(/\b(?:indoor|covered|enclosed)\b/i.test(text))return false;
 return /\b(?:outdoor|open-air|disc golf course|skate ?park|bmx (?:race )?track|dawn to dusk)\b/i.test(text);
}
// Indoor test 13: an indoor place's planned visit in minutes: the owner's Time needed answer (indoorLength), else the
// usual length of its own kind (its owner's kinds, else the indoor kind its planner kinds are), else null.
const PLANNER_INDOOR_KIND=Object.fromEntries(Object.entries(INDOOR_KIND_PLANNER).flatMap(([k,pks])=>pks.map(pk=>[pk,k])));
function indoorSlotOf(v,kinds){
  const IK=require('./indoor-kinds');
  const own=Array.isArray(v.indoorKinds)&&v.indoorKinds.length?v.indoorKinds:null;
  const k=own||(kinds||[]).map(x=>PLANNER_INDOOR_KIND[x]).filter(Boolean);
  return IK.indoorSlotMinutes(k,v.indoorLength);
}
// Planning allowances, not venue-supplied durations or verified routes.
function estimateTripTiming({plan,facts,requirements,tripDate=null}){
  if(['recommendations','discover'].includes(plan.kind))return [];
  const byId=new Map(facts.map(v=>[v.id,v])),groups=new Map();
  for(const stop of selectedStops(plan)){
    if(!stop.venue&&!stop.event)continue;
    const day=stop.day||1;
    if(!groups.has(day))groups.set(day,{day,minMinutes:0,maxMinutes:0,complete:true,unknown:[],visits:[],transfers:[]});
    const g=groups.get(day),v=stop.venue&&byId.get(stop.venue.id);
    const walking=(requirements?.items||[]).some(i=>i.kind==='transport'&&applicable(i,day,requirements.startDate||tripDate));
    if(g.previous){
      const a=g.previous;
      if(v&&[a.lat,a.lng,v.lat,v.lng].every(Number.isFinite)){
        const {minMinutes:min,maxMinutes:max}=transferRange(km(a,v),walking);
        g.minMinutes+=min;g.maxMinutes+=max;g.transfers.push({from:a.id,to:v.id,minMinutes:min,maxMinutes:max,mode:walking?'walking':'driving assumed'});
      }else{g.complete=false;g.unknown.push('transfer');}
    }
    let range=null;
    if(v){
      const kinds=v.plannerKinds||inferPlannerKinds(v);
      const hike=(v.activities||inferPlannerActivities(v)).includes('hiking');
      const selectedShortWalk=(requirements?.shortWalkVenueIds||[]).includes(v.id);
      const requestedWalk=selectedShortWalk || /\b(?:short|easy|gentle|flat) (?:walk|walking|hike)\b/.test(requirements?.text||'');
      const requestedChallenge=(requirements?.items||[]).some(i=>i.value==='challenging_hike'&&i.strength!=='exclude');
      const listed = hike && !requestedWalk && !requestedChallenge ? listedOutdoorTiming(v).durationRange : null;
      const sportAllowance=sportVisitAllowance(v,kinds);
      // Indoor test 13 (2026-11-19; Dan's cinema got a 1-hour slot): an indoor place's visit is its owner's Time needed
      // answer, else its kind's usual length (indoor-kinds.js slot: a film 2.5 hours, an escape room an hour).
      const indoorSlot=v.type==='indoor'?indoorSlotOf(v,kinds):null;
      range=selectedShortWalk?[30,60]:listed || sportAllowance || (indoorSlot?[Math.max(30,indoorSlot-30),indoorSlot]:null) || (hike&&!requestedWalk?(requestedChallenge?[180,300]:[90,180]):v.type==='cafe'?[20,40]:v.type==='restaurant'?[60,90]:v.type==='winery'?[45,75]:kinds.includes('museum')?[60,90]:kinds.includes('gallery')?[30,60]:kinds.some(k=>['easy_walk','walk'].includes(k))?[30,60]:kinds.includes('escape')?[60,90]:null);
      if(range){g.minMinutes+=range[0];g.maxMinutes+=range[1]+(stop.waitMinutes||0);g.visits.push({venueId:v.id,minMinutes:range[0],maxMinutes:range[1],...(listed||indoorSlot&&v.indoorLength?{durationSource:'listing'}:sportAllowance||indoorSlot?{durationSource:'planning allowance'}:{})});}
      else{g.complete=false;g.unknown.push('visit duration');}
    }else{g.complete=false;g.unknown.push(stop.event?'event duration':'visit duration');}
    g.previous=v||{};
  }
  return [...groups.values()].map(({previous,...g})=>({...g,unknown:[...new Set(g.unknown)]}));
}
function evaluateTripRequirements({requirements,plan,facts,tripDate}){
  const timing=estimateTripTiming({plan,facts,requirements,tripDate});
  const byId=new Map(facts.map(v=>[v.id,v]));const selected=selectedStops(plan).filter(s=>s.venue&&byId.has(s.venue.id)).map(s=>{const v=byId.get(s.venue.id);
    // Brewery test 4 (2026-11-13): a meal at a brewery's own kitchen counts as the restaurant asked for.
    return {day:s.day,v:s.kitchenMeal?{...v,fdTypes:[...new Set([...(v.fdTypes||[]),'restaurant'])]}:v};});
  return (requirements?.items||[]).map(i=>{
    const pool=selected.filter(s=>applicable(i,s.day,tripDate));let status='unmet',reason='';
    if(i.kind==='event'){const events=[...selectedStops(plan),...(plan.kind==='events'?(plan.events||[]).map(event=>({kind:'event',event,day:1})):[])].filter(s=>s.kind==='event'&&s.event&&applicable(i,s.day,tripDate));status=events.some(s=>eventMatches(s.event,i))?'satisfied':'unmet';reason=status==='satisfied'?'Matched a dated event occurrence.':'No matching event was scheduled for the requested dates.';
      // Brewery test 3 (Whistler, 2026-11-16): a stop planned for the place's own listed live music that night meets it.
      if(status==='unmet'&&i.value==='live-music'&&selectedStops(plan).some(s=>((s.listedNight&&s.listedNight.kind==='live_music')||(s.reasons||[]).some(r=>r&&r.code==='night'&&/^Live music on /.test(r.text||'')))&&applicable(i,s.day,tripDate))){status='satisfied';reason='A place in the plan lists live music that night.';}}
    else if(i.kind==='type_count'&&i.perDay){
      // A count per day is checked day by day; some but fewer than asked is "needs confirmation", never "missing" (2026-10-18).
      const dayNumbers=(plan.days||[]).map(d=>d.day).filter(d=>applicable(i,d,tripDate));
      const perDay=dayNumbers.map(d=>({day:d,found:pool.filter(s=>s.day===d&&matches(s.v,i)).length}));
      const short=perDay.filter(x=>x.found<i.count);
      status=!perDay.length||perDay.every(x=>x.found===0)?'unmet':short.length?'unverified':'satisfied';
      reason=`Requested ${i.count} ${i.value} stop${i.count===1?'':'s'} a day; scheduled ${perDay.map(x=>x.found).join(', ')} (day by day).`+(i.requestedCount?` ${i.requestedCount} a day is more than one day holds, so the plan uses ${i.count}.`:'');
    }
    else if(i.kind==='type_count'){const found=pool.filter(s=>matches(s.v,i)).length;status=found===i.count?'satisfied':found>0?'unverified':'unmet';reason=`Requested ${i.count} ${i.value} stop${i.count===1?'':'s'}; scheduled ${found}.`;}
    else if(i.kind==='transport'){
      const tooFar=pool.some((s,k)=>k>0&&s.day===pool[k-1].day&&[s.v.lat,s.v.lng,pool[k-1].v.lat,pool[k-1].v.lng].every(Number.isFinite)&&km(pool[k-1].v,s.v)>i.limitKm);
      status=tooFar?'unmet':'unverified';reason=tooFar?`The final sequence exceeds the ${i.limitKm} km straight-line limit; a practical walking itinerary could not be verified.`:`Car-free suggestions use a maximum ${i.limitKm} km straight-line gap between stops. Actual walking routes, crossings, accessibility and travel times are not verified.`;
    }
    else if(i.kind==='evening_walk'){
      // The drive to dinner is the day's last; anything after dinner should be a short walk from it.
      const after=(plan.days||[]).flatMap(d=>{const st=d.stops||[];const k=st.findIndex(x=>x.daypart==='evening'&&x.venue);return k<0?[]:st.slice(k+1).filter(x=>x.venue||x.event).map(x=>({from:st[k].venue,to:x.venue||x.event.location}));});
      const far=after.some(x=>x.to&&[x.from.latitude,x.from.longitude,x.to.lat??x.to.latitude,x.to.lng??x.to.longitude].every(Number.isFinite)&&km({lat:x.from.latitude,lng:x.from.longitude},{lat:x.to.lat??x.to.latitude,lng:x.to.lng??x.to.longitude})>i.limitKm);
      status=far?'unverified':'satisfied';
      reason=far?`Something after dinner is more than ${i.limitKm} km from it; plan a ride, or skip it to keep the evening on foot.`:'Dinner is the last drive of each day, so nothing after it needs a car.';
    }
    else if(i.kind==='deadline'){status='unverified';reason=`You requested finishing ${i.sourceText}; visit durations and travel time are not verified, so the deadline cannot be guaranteed.`;}
    else if(i.kind==='duration'){
      const estimates=timing.filter(t=>applicable(i,t.day,tripDate));
      status=estimates.some(t=>t.minMinutes>i.value)?'unmet':'unverified';
      reason=estimates.length?estimates.map(t=>`Day ${t.day}: ${t.complete?'estimated':'known-stop subtotal'} ${t.minMinutes}–${t.maxMinutes} minutes for visits and transfers${t.complete?'':'; unknown '+t.unknown.join(', ')}.`).join(' '):'No timed stops were selected.';
      reason+=` You requested ${i.value} minutes. Assumed visits: coffee 20–40, museum 60–90, easy walk 30–60, winery 45–75, meal 60–90 minutes. Transfer estimates use stored straight-line coordinates, assumed walking at 3–4 km/h or driving at 50–70 km/h (at least 5 minutes a transfer), and a road allowance of 1.3 times the straight line; actual routes, queues, breaks and opening-hour sequencing are not verified.`;
      if(status==='unmet')reason+=' Even the minimum allowance exceeds your time limit; remove a stop or allow more time.';
      else if(estimates.some(t=>t.maxMinutes>i.value))reason+=' Allow extra time; the upper estimate exceeds your time limit.';
    }
    else if(i.kind==='price_limit'){status='unverified';reason='Higher known dining price bands are excluded; total cost and unknown prices still need confirmation.';}
    else if(i.kind==='unsupported'){status='unverified';reason=`${SITE.brand} cannot verify ${i.value} from its listing data.`;}
    else if(i.weekday&&!tripDate){status='unverified';reason='A trip start date is needed to apply the weekday instruction.';}
    else if(i.kind==='days'){status=(plan.days?.length===i.value || i.value===1&&plan.kind==='itinerary')?'satisfied':'unmet';reason=status==='satisfied'?`${i.value} days planned.`:'The requested trip length was not met.';}
    else if(i.kind==='base'){status='unverified';reason='The named base guides geography; accommodation and return journeys are not scheduled.';}
    else if(i.kind==='distance'){
      let unknown=pool.length<2,bad=false;
      for(let k=1;k<pool.length;k++){const a=pool[k-1],b=pool[k];if(a.day!==b.day)continue;if(![a.v.lat,a.v.lng,b.v.lat,b.v.lng].every(Number.isFinite)){unknown=true;continue;}if(km(a.v,b.v)>i.value)bad=true;}
      status=bad?'unmet':unknown?'unverified':'satisfied';reason=`Checked consecutive stops against ${i.value} km straight-line distance. Road distance and driving time are not verified.`;
    } else if(i.kind.startsWith('excluded_')){status=pool.some(s=>matches(s.v,i))?'unmet':'satisfied';reason=status==='satisfied'?'No selected stop matches this exclusion.':'A selected stop conflicts with this exclusion.';}
    else if(i.kind==='feature'){
      const relevant=i.value==='dog_friendly'?(SITE.dogMealsMustBeListed?pool:pool.filter(s=>!DINING.has(s.v.type))):i.value==='kid_friendly'?pool:pool.filter(s=>DINING.has(s.v.type));
      status=relevant.length&&relevant.every(s=>matches(s.v,i))?'satisfied':'unmet';reason=status==='satisfied'?'Confirmed from stored badges or curated memberships.':'No complete set of verified matching stops was found.';
    } else if(i.kind==='rainy'){
      const keep=s=>!(rainWeather(i)&&requestedOutdoor(s.v,requirements));const activities=pool.filter(s=>!DINING.has(s.v.type)&&keep(s));const target=activities.length?activities:pool.filter(keep);
      status=(i.activityOnly?pool.some(s=>matches(s.v,i)):target.length&&target.every(s=>matches(s.v,i)))?'satisfied':'unverified';reason=status==='satisfied'?'Activity stops are listed as indoor experiences.':'Indoor suitability is not verified for every stop; check before visiting.';
    } else {status=pool.some(s=>matches(s.v,i))?'satisfied':'unmet';reason=status==='satisfied'?'Matched an actual listing.':`No selected stop meets ${LABELS[i.value]||i.sourceText}.`;}
    return {...i,status,reason};
  });
}
// Alternatives are informational only: never satisfy a missing request or edit stops.
function nearbyEventAlternatives({plan,events,from,to,today,regions=[],suitsKind=()=>true}) {
 const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')?Date.parse(x+'T12:00:00Z'):NaN;
 const a=date(from),b=date(to);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return [];
 const missing=(plan.requirementResults||[]).filter(i=>i.kind==='event'&&i.status==='unmet');
 const seen=new Set(),out=[];
 for(const e of events||[]){
  const start=date(e.startDate),end=date(e.endDate||e.startDate);
  const distance=start>b?(start-b)/86400000:end<a?(a-end)/86400000:0;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end<date(today)||distance<=0||distance>14)continue;
  if(regions.length&&!regions.includes(e.region))continue;
  if(typeof e.url!=='string'||!/^\/(?!\/)/.test(e.url)||seen.has(e.id+':'+e.startDate))continue;
  const matches=missing.filter(i=>eventMatches(e,i)&&suitsKind(e,i.eventKind));if(!matches.length)continue;
  seen.add(e.id+':'+e.startDate);
  out.push({id:e.id,name:e.name,url:e.url,region:e.region,startDate:e.startDate,endDate:e.endDate||e.startDate,suggestedDate:e.startDate<today?today:e.startDate,time:e.time||'',distanceDays:distance,requirementIds:matches.map(i=>i.id)});
 }
 return out.sort((x,y)=>x.distanceDays-y.distanceDays||x.startDate.localeCompare(y.startDate)||x.id-y.id).slice(0,3);
}
// Surface operator statements, never infer admission or a bookable time from prose.
function listedAccessConflict(v,requirements,day,date) {
 if(!['sport','tour'].includes(v.type)||requirements?.daypart!=='morning'||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null;
 d.setUTCDate(d.getUTCDate()+(day||1)-1);if([0,6].includes(d.getUTCDay()))return null;
 const sentences=String(v.plannerDescription||'').split(/(?<=[.!?])\s+(?=[A-Z])|[\r\n]+/);
 const matches=sentences.map(source=>({source:source.trim(),match:source.match(/\b(?:play|access|entry) (?:is |allowed |available |permitted )?(?:only )?after (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?) on school days\b/i)})).filter(x=>x.match);
 if(matches.length!==1)return null;
 const {source,match}=matches[0],hour=Number(match[1]),minute=Number(match[2]||0);
 if(hour<1||hour>12||minute>59)return null;
 const afterMinutes=(hour%12)*60+minute+(/^p/i.test(match[3])?720:0);
 return afterMinutes>=720?{source,afterMinutes,conditional:true}:null;
}
function listedAccessNotes(v) {
 if(typeof v.plannerDescription!=='string')return [];
 // 2026-10-25: an outdoor place that needs a permit says so (Mount Nkwala: a free paper permit from the Penticton
 // Indian Band) -- only its permit sentences, nothing else from an outdoor listing.
 if(v.type==='outdoor'){
  const permit=/\b(?:permits? (?:is |are )?(?:required|mandatory|needed)|(?:requires?|need|needs|obtain|get) a (?:free )?(?:paper )?permit|(?:paper )?permits? (?:are |is )?mandatory|permission (?:is )?required)\b/i;
  return [...new Set(v.plannerDescription.split(/(?<=[.!?])\s+(?=[A-Z])|[\r\n]+/).map(x=>x.trim()).filter(x=>permit.test(x)&&!/\b(?:no|not|without) (?:a )?(?:permits?|permission)\b|\bnot (?:required|needed|necessary)\b/i.test(x)))].slice(0,1).map(s=>'Access / schedule from the listing: “'+s+'” Confirm access and scheduling with the operator before visiting.');
 }
 if(!['sport','tour'].includes(v.type))return [];
 const sentences=v.plannerDescription.split(/(?<=[.!?])\s+(?=[A-Z])|[\r\n]+/).map(x=>x.trim()).filter(Boolean);
 const relevant=/\b(?:practice (?:and race )?nights?|race nights?|open houses?|riding season|school days?|dawn to dusk|members?(?:ship)? (?:only|required)|permit(?:s)? (?:required|needed)|(?:advance )?bookings? (?:is |are )?(?:required|essential)|reservations? (?:is |are )?(?:required|essential)|(?:book|reserve) (?:in advance|ahead)|(?:tours?|trips?|cruises?) (?:depart|run|operate)|(?:seasonal|seasonally|season dependent)|closed (?:for|during|until)|by appointment)\b/i;
 return [...new Set(sentences.filter(s=>relevant.test(s)))].slice(0,3).map(s=>'Access / schedule from the listing: “'+s+'” Confirm access and scheduling with the operator before visiting.');
}
// Offer shortening only for trailing activity gaps without discarding dated priorities.
function sparseDayRecovery(plan,requirements){
 const days=plan.days||[];
 const activityDays=days.filter(d=>(d.stops||[]).some(s=>s.event||s.venue&&!['restaurant','cafe','pub','cocktail','brewery','distillery'].includes(s.venue.type)));
 const last=activityDays.at(-1)?.day||0;
 const gaps=days.filter(d=>d.activityGap||last>0&&d.day>last&&!(d.stops||[]).some(s=>s.event||s.venue));if(!gaps.length)return null;
 const retained=new Set(days.filter(d=>d.day<=last).flatMap(d=>(d.stops||[]).map(s=>s.venue?.id)));
 const safe=last>0&&last<days.length&&!requirements?.endDate&&!(requirements?.items||[]).some(i=>i.kind==='event'||requirementDay(i,requirements.startDate)>last||i.kind==='venue'&&i.strength==='must'&&!retained.has(i.value));
 return {days:gaps.map(d=>d.day),shorterDays:safe?last:null,region:gaps.every(d=>d.region===gaps[0].region)?gaps[0].region:null};
}

// Holidays as dates (Whistler Roam, 2026-10-25): "3 days at Christmas" was planned from December 4 (the month's first
// weekend) and "New Year's Eve" was a search for the words. A holiday named with no date of its own gets one, the next
// time it comes round: Christmas Eve/Day, "at/over Christmas" (Dec 23), Boxing Day, New Year's Eve/Day, Valentine's,
// Easter (Good Friday), Victoria Day, Canada Day, BC Day, Labour Day, Thanksgiving and Family Day (a long weekend starts
// on the Saturday). The visitor's words stay; " from <Month D>" is added for the date reader.
const MONTHS_LONG=['January','February','March','April','May','June','July','August','September','October','November','December'];
function nthWeekday(y,m,wd,n){const d=new Date(Date.UTC(y,m-1,1));let c=0;while(true){if(d.getUTCDay()===wd&&++c===n)return d;d.setUTCDate(d.getUTCDate()+1);}}
function mondayBefore(y,m,day){const d=new Date(Date.UTC(y,m-1,day));d.setUTCDate(d.getUTCDate()-1);while(d.getUTCDay()!==1)d.setUTCDate(d.getUTCDate()-1);return d;}
function easterSunday(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(Date.UTC(y,mo-1,da));}
const HOLIDAYS=[
 [/\bchristmas eve\b/,(y)=>new Date(Date.UTC(y,11,24))],
 [/\bchristmas day\b/,(y)=>new Date(Date.UTC(y,11,25))],
 [/\bboxing day\b/,(y)=>new Date(Date.UTC(y,11,26))],
 [/\b(?:at|over|for|during|on|around) (?:the )?(?:christmas|xmas)\b|\b(?:christmas|xmas) (?:week|break|holidays?|vacation|trip|getaway)\b|^(?:a |an |our |my )?(?:family |kids |white )?(?:christmas|xmas) (?:in|with|at|for)\b/,(y)=>new Date(Date.UTC(y,11,23))],
 [/\bnew year s eve\b|\bnew years eve\b|\bnye\b/,(y)=>new Date(Date.UTC(y,11,31))],
 [/\bnew year s day\b|\bnew years day\b/,(y)=>new Date(Date.UTC(y,0,1))],
 [/\b(?:at|over|for|around) new year s?\b|\bnew year s? (?:weekend|break|trip|getaway|holiday|in|with)\b|^new years?\b/,(y)=>new Date(Date.UTC(y,11,30))],
 [/\bvalentine s(?: day)?\b|\bvalentines(?: day)?\b/,(y)=>new Date(Date.UTC(y,1,14))],
 [/\beaster\b/,(y)=>{const e=easterSunday(y);e.setUTCDate(e.getUTCDate()-2);return e;}],
 [/\bvictoria day\b|\bmay long(?: weekend)?\b/,(y)=>mondayBefore(y,5,25)],
 [/\bcanada day\b/,(y)=>new Date(Date.UTC(y,6,1))],
 [/\bremembrance day\b/,(y)=>new Date(Date.UTC(y,10,11))],
 [/\b(?:national day for )?truth and reconciliation day\b/,(y)=>new Date(Date.UTC(y,8,30))],
 [/\bbc day\b|\bb c day\b/,(y)=>nthWeekday(y,8,1,1)],
 [/\blabou?r day\b/,(y)=>nthWeekday(y,9,1,1)],
 [/\bthanksgiving\b/,(y)=>nthWeekday(y,10,1,2)],
 [/\bmother s day\b|\bmothers day\b/,(y)=>nthWeekday(y,5,0,2)],
 [/\bfather s day\b|\bfathers day\b/,(y)=>nthWeekday(y,6,0,3)],
 [/\bfamily day (?:long )?weekend\b|\bbc family day\b|\bfamily day (?:holiday|monday)\b/,(y)=>nthWeekday(y,2,1,3)],
];
function holidayDateText(text,today){
 const t=norm(text);
 if(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)|\b\d{4} \d{1,2} \d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/.test(t))return text;
 if(/\b(?:christmas|xmas|holiday) (?:craft )?(?:markets?|fairs?|lights?|events?|concerts?)\b/.test(t)&&!/\b(?:christmas|xmas) (?:eve|day|week|break|holidays?)\b|\b(?:at|over|for|during) christmas\b/.test(t))return text;
 const hit=HOLIDAYS.find(([re])=>re.test(t));
 if(!hit||!/^\d{4}-\d{2}-\d{2}$/.test(today||''))return text;
 const y0=Number(today.slice(0,4));
 let d=hit[1](y0);
 // A month named that is not the holiday's ("a family day in July") wins.
 const named=MONTHS_LONG.findIndex((m)=>new RegExp(`\\b${m.toLowerCase()}\\b`).test(t));
 if(named>=0&&named!==d.getUTCMonth())return text;
 const iso=(x)=>x.toISOString().slice(0,10);
 if(iso(d)<today)d=hit[1](y0+1);
 // A Monday holiday's long weekend starts on the Saturday before it.
 if(d.getUTCDay()===1&&/\b(?:weekend|long weekend)\b/.test(t)){d=new Date(d.getTime()-2*86400000);}
 // What the evening holidays mean: New Year's Eve is dinner and a night out; Valentine's is a romantic evening.
 let out=text;
 if(/\bnew year s eve\b|\bnew years eve\b|\bnye\b/.test(t)&&!/\b(?:dinner|drinks?|bars?|party|parties|night out|club|clubs|fireworks?|events?|show)\b/.test(t))out=`${out} with dinner and a night out`;
 out=out.replace(/\b(?:mother|father)[’']?s day\b|\bremembrance day\b|\b(?:national day for )?truth and reconciliation day\b/ig,'');
 if(/\bvalentine/.test(t))out=out.replace(/valentine[’']?s?(?: day)?/ig,/\bromantic\b/.test(t)?'':'romantic');
 return `${out} from ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`;
}


// Visitor shorthand (2026-10-25): words people use for an activity, said the way the planner reads it.
// Texting shorthand and common misspellings (2026-10-25: "whistler wknd w kids", "whislter in febuary").
const SHORTHAND=[[/\b(?:wknd|wkend|wkd|weeknd)\b/gi,'weekend'],[/\bw\/\s*|\bw (?=(?:kids|my|the|our|a|friends|family|dog|dogs|toddler|baby|teens)\b)/gi,'with '],[/(?<=\w) n (?=\w)/gi,' and '],[/\bnite\b/gi,'night'],[/\bnites\b/gi,'nights'],[/\b(?:things|stuff) 2 do\b/gi,'things to do'],[/\b(?:brekkie|brekky|brekfast|breakfeast)\b/gi,'breakfast'],[/\b(?:bday|b-day|bdays)\b/gi,'birthday'],[/\bfebuary\b/gi,'February'],[/\b(?:januray|janurary)\b/gi,'January'],[/\b(?:decmber|decemeber)\b/gi,'December'],[/\b(?:octobre)\b/gi,'October'],[/\b(?:me and my|my) (?:gf|bf|girlfriend|boyfriend|wife|husband|partner|hubby|fiance|fiancee|fiancé|fiancée)\b|\b(?:gf|bf) and (?:i|me)\b/gi,'my partner and I'],[/\b(?:somewhere|places?|spots?) (?:warm|cozy|cosy)(?: (?:to go|to be))?\b|\bwarm up\b|\bget out of the cold\b/gi,'indoor activities'],[/\b(?:a )?birthday (weekend|trip|getaway|night)\b/gi,'$1 with a special dinner'],[/\bbirthday dinner\b/gi,'special dinner']];
// Restaurant test 2 (Whistler, 2026-11-14): "après sushi" is a sushi happy hour (it was read as pubs and sushi).
// Tour test 15 (Whistler, 2026-11-18; Dave's fondue snowshoe evening): "fondue snowshoe dinner", "dinner snowshoe tour" and
// "snowshoe with fondue" are a snowshoe tour (the meal is part of the tour: trip-planner.js tourMealNote reads the typed
// tours' "Dinner included"), never a fondue restaurant.
// Sport test 6 (2026-11-20; "drop in hockey in Kelowna Friday night" read a hockey game and planned 0 places): drop-in hockey,
// shinny and stick and puck are played at an arena, never a game to watch.
const REQUEST_SYNONYMS=[...SHORTHAND,[/\b(?:drop[- ]?in|pick[- ]?up|adult rec) hockey\b|\bshinny\b|\bstick (?:and|n|&) puck\b/gi,'ice rink'],[/\bh[eé]li[- ]?(?:hik(?:ing|es?)|randonn[eé]es?)(?: (?:tours?|trips?))?\b/gi,'helihiking tour'],[/\bscenic (?:helicopter|heli|chopper) (flights?|tours?|rides?)\b/gi,'helicopter $1'],[/\b(?:apres|après)[- ]+(?=(?:sushi|tapas|pizzas?|burgers?|wings|tacos|nachos|oysters|poke|ramen|beers?|wines?|cocktails?|sake|bites|appies|oyster)\b)/gi,'happy hour '],[/\bclimbers?\b/gi,'rock climbing'],[/\bmtb\b/gi,'mountain biking'],[/\b(?:mountain )?bike parks?\b/gi,'mountain biking'],[/\bx\s?c (?:ski|skiing)\b/gi,'cross-country skiing'],[/\bnordic (?:ski|skiing)\b/gi,'cross-country skiing'],[/\b(?:a )?(?:sunny|sunshine|nice weather|good weather|warm|beautiful) day\b/gi,'a day outdoors'],[/\b(?:grandparents|grandma and grandpa|elderly parents|older parents|seniors|retirees)\b/gi,'relaxed easy walks'],[/\b(?:(?:a |the )?(?:fondue|dinner|supper)(?: (?:and|&))? snow ?shoe(?:ing|s)?(?: (?:tours?|evenings?|nights?|trips?))?(?: (?:dinner|supper|night|evening))?|snow ?shoe(?:ing|s)?(?: (?:tours?|trips?))?(?: (?:with|and|&|then))? (?:a )?(?:fondue|dinner|supper)(?: (?:dinner|night|evening|tours?))?)\b/gi,'snowshoe tour'],[/\bfondue\b/gi,'fondue restaurant'],[/\b(?:sups?|stand[- ]?up[- ]?paddle(?:[- ]?boards?)?|paddle[- ]?boards?)( rentals?| hire)\b/gi,'paddleboard$1'],[/\bstand[- ]?up[- ]?paddl\w*(?:[- ]?boards?(?:ing)?)?\b/gi,'paddleboarding'],[/\bpaddle[- ]boards?\b/gi,'paddleboarding'],[/\bsup\b/gi,'paddleboarding'],[/\bpaddle ?boarding\b/gi,'paddleboarding'],[/\bsnowboarders?\b/gi,'snowboarding'],[/\b(?:sunset spots?|sunset views?|watch the sunset|see the sunset|sunset photos?)\b/gi,'viewpoints'],[/\b(?:in |at )?(?:late|early|mid|middle of|end of|beginning of|start of|the end of|the start of)[\s-]+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,'in $1'],[/\b(?:in )?(?:our|their|my) (?:50s|60s|70s|80s|fifties|sixties|seventies|eighties)\b/gi,''],[/\b(?:before|after) (?:the )?(?:lifts|ski season|ski hill) (?:open|opens|close|closes)\b/gi,''],[/\b(?:non[- ]?skiers?|people who don.?t ski)\b/gi,'winter activities off the slopes'],[/\bsnow(?:y)?(?: fun| stuff| activities)?,? (?:but )?(?:no|without|not) (?:skiing|ski|snowboarding)\b/gi,'winter activities off the slopes'],[/\b(?:solo (?:traveller|traveler|trip|travel)|travelling solo|traveling solo|on my own|by myself)\b/gi,''],[/\bgroup of \d+ (?:friends|people|guys|girls|of us)\b/gi,'group of friends'],[/\b(?:can.?t|cannot|can not) walk (?:far|much|long distances|very far)|limited mobility|mobility issues|not much walking|minimal walking|bad knees\b/gi,'relaxed easy walks'],[/\bpartying\b/gi,'nightlife'],[/\b(?:foodies?|food lovers?|gourmet|culinary)\b/gi,'great restaurants'],[/\b(?:last minute|spur of the moment|spontaneous)\b/gi,''],[/\b(?:active|outdoorsy|sporty|energetic)\b(?! (?:pass|passes|wear|kids))/gi,'outdoor activities'],[/\b(?:hot chocolate|hot cocoa)\b/gi,'cafe'],[/\b(?:things to do|what to do|stuff to do) at night\b|\bnight activities\b/gi,'night out'],[/\b(?:and|love|like|likes|enjoy|for) art\b(?! galler| museum)/gi,(m)=>m.replace(/art$/i,'art galleries')],[/\bbetween (whistler|squamish|pemberton) and vancouver\b/gi,'from vancouver to $1 with stops'],[/\bbetween vancouver and (whistler|squamish|pemberton)\b/gi,'from vancouver to $1 with stops'],[/\bdog ?sledding\b/gi,'dog sled'],[/\b(?:sledding|sledging|tobogganing|sled hill|sledding hill)\b/gi,'toboggan'],[/\bbakeries\b/gi,'bakery'],[/\bplaygrounds\b/gi,'playground'],[/\bcanyons\b/gi,'canyon'],[/\bsleigh rides?\b/gi,'sleigh'],[/\bindigenous (?:culture|history|art|experiences?|tours?)\b/gi,'indigenous'],[/\bfirst nations? (?:culture|history|art)\b/gi,'indigenous'],[/\b(?:horseback riding|horse riding|trail rides?|horseback rides?)\b/gi,'horseback riding'],[/\b(?:pony rides?|horse rides?|rides? (?:a |on a )?pony|ponies)\b/gi,'horseback riding'],[/\b(?:horse(?:back)? )?pack(?:ing)? trips?\b/gi,'horseback riding trip'],[/\bbrowse (?:the |some |around )?(?=shops|boutiques|stores|galleries)/gi,''],[/\bwindow shopping\b/gi,'shopping'],[/\b(?:arts? (?:and|&) culture|culture and (?:the )?arts?|cultural (?:things|spots|places|sights|day|trip))\b/gi,'museums and art galleries'],[/\b(?:we |i )?(?:have|has|with) (?:a )?(?:bad|sore|injured|dodgy|weak) (?:knees?|back|hips?|ankles?)\b|\b(?:bad|sore) (?:knees?|back|hips?)\b/gi,'relaxed'],[/\b(?:nothing|not too|not) touristy\b|\bnon[- ]?touristy\b|\boff the beaten (?:path|track)\b|\b(?:like a local|where (?:the )?locals go|local spots)\b/gi,'hidden gems away from crowds'],[/\b(?:we |i )?(?:hate|dislike|don.?t like|can.?t stand) (?:the )?crowds\b/gi,'away from crowds'],[/\b(?:avoid|skip|away from|outside|not in) the village\b/gi,'away from crowds'],[/\b(?:no|without) early (?:mornings?|starts?)\b|\b(?:we )?(?:like to |want to )?sleep in\b|\blazy mornings?\b|\blate starts?\b/gi,'starting at 10:30am'],[/\b(?:vegan only|only vegan|100% vegan|fully vegan|all vegan)\b/gi,'vegan'],[/\b(?:skip|no|not|without|avoid)(?: the| a| any)? (?:spas?|saunas?|massages?)\b/gi,'nospa'],[/\b(?:where|somewhere|places?) to cool off\b|\bcool(?:ing)? off\b|\bbeat the heat\b|\b(?:a )?(?:hot|scorching|heat ?wave) day,?\b|\bheat ?wave\b/gi,'swimming and lakes'],[/\b(?:day trip|day) to (whistler|squamish|pemberton|brackendale|britannia beach|mount currie) from (?:whistler|squamish|pemberton|brackendale|britannia beach|mount currie)\b/gi,'day trip to $1'],[/^(?:day|one day|full day) in\b/i,'a day in'],[/\bquick lunch\b/gi,'lunch'],[/\b(?:apres|après)(?:[- ]ski)? with live music\b|\blive music (?:apres|après)(?:[- ]ski)?\b/gi,'après ski and nightlife'],[/\bsnow board(s|ing|ers?)?\b/gi,'snowboard$1'],[/\b(ski|snowboard)( and snowboard)? camps?\b/gi,'$1$2 school'],[/\b(?:a )?powder day\b/gi,'skiing'],[/\b(?:good|great|nice|tasty) lunch(?:es)?\b|\blunches\b/gi,'lunch'],[/\b(?:a )?(?:rainy[- ]day|rain|wet[- ]weather|bad[- ]weather) (?:backup|back[- ]up|plan b|option|alternative)s?\b|\b(?:a )?backup plan for rain\b/gi,'something indoors if it rains'],[/\bretired(?: couple| parents| folks)?\b/gi,'relaxed easy walks'],[/\bscenic drives?\b|\b(?:a )?drive with views\b/gi,'viewpoints'],[/\b(?:quiet|peaceful|calm|tranquil) (?:places|spots|corners)\b/gi,'away from crowds'],[/\bfrom (vancouver|yvr) to (whistler|squamish|pemberton) and back\b/gi,'from vancouver to $2 with stops along the way'],[/\b(?:first time|first trip|first visit)(?: visiting| in| to)? (?:bc|british columbia|canada|the sea to sky)\b,?/gi,''],[/\b(?:a )?(?:vegetarian|vegan) couple\b/gi,(m)=>/vegan/i.test(m)?'vegan':'vegetarian'],[/\b(lunch|dinner|coffee|drinks|a drink|a beer|breakfast)(?: up)? (?:at|on) the (?:top|summit)\b/gi,'then $1'],[/\bcar camping\b|\bcamping trip\b|\btent camping\b/gi,'camping'],[/\bfamily reunion\b/gi,'family trip'],[/\b(?:for|at|during) (?:a |the |my |our )?(?:conference|convention|work trip|business trip|work conference|company retreat|offsite)\b,?/gi,''],[/\b(?:free )?evenings only\b|\bonly (?:in )?the evenings?\b|\bfree evenings?\b/gi,'in the evening'],[/\bwellness (?:retreat )?(?:weekend|getaway|trip|day)\b|\bretreat weekend\b/gi,(m)=>/day/i.test(m)?'spa day':'spa weekend'],[/\b(?:a )?wellness retreat\b/gi,'spa weekend'],[/\b(?:a )?soak\b(?! in)/gi,'spa'],[/\b(?:with )?(?:no|nothing) (?:restaurants? |places? |meals? |food |dinners? )?(?:over|above|more than|pricier than) \$\$\$?(?!\$)|\b(?:under|below) \$\$\$(?!\$)/gi,'reasonably priced'],[/\b(?:(?:good )?for (?:a |an )?)?(?:beginners?|novices?|first[- ]timers?|newbies)\b/gi,'easy'],[/\bsunrise (hikes?|walks?|spots?|views?)\b/gi,'viewpoint $1'],[/\b(?:places|spots) to (?:take|get) (?:photos|pictures|pics)\b|\bphoto (?:spots?|ops?|opportunities)\b|\b(?:instagram|instagrammable|insta)(?: spots?| worthy| places)?\b|\bphotography spots?\b/gi,'viewpoints'],[/\bskate ?parks?\b/gi,'skatepark'],[/\boff[- ]?leash(?: (?:dog )?(?:parks?|areas?|beach(?:es)?|trails?))?\b/gi,'dog parks'],[/\b(?:(?:the )?(?:drive|way|trip|road) )?from (whistler|pemberton|squamish|brackendale|mount currie) (?:back |home )?to (?:vancouver|yvr|the city)\b/gi,'road trip from $1 to britannia beach'],[/\b(?:back |home )?to (?:vancouver|yvr) from (whistler|pemberton|squamish)\b/gi,'road trip from $1 to britannia beach'],[/\b(?:somewhere |a place |where )?to (?:watch|catch|see) (?:the |a )?(?:hockey|canucks|oilers|leafs|nhl|nfl|football|soccer|game|games|match|fight|ufc|super bowl|playoffs?)(?: game| games| match)?\b/gi,'sports bars'],[/\bwhat(?: is|'s|’s| s)? open\b/gi,'things to do'],[/\b(?:with |and )?(?:a |an |my |our |two |2 |three |3 )?(\d{1,2})[- ]?(?:year|yr)[- ]?olds?\b/gi,(m,a)=>(m.match(/^(?:with |and )/i)||[''])[0]+(Number(a)<13?'kids':'teenagers')],[/\b(\d+) days ending in (whistler|pemberton|squamish)\b/gi,'$1 days from vancouver to $2 with stops along the way'],[/\b(?:we |i )?(?:land|arrive|fly in|get in|get to)(?: in| at| into)? (?:vancouver|yvr)(?: on)? (monday|tuesday|wednesday|thursday|friday|saturday|sunday) (?:night|evening)(?: and)?(?: (?:want|would like|have|need))?/gi,(m,d)=>{const W=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];return `on ${W[(W.indexOf(d.toLowerCase())+1)%7]}, from vancouver,`;}],[/\b(a |our |my )?wedding anniversary\b/gi,(m,a)=>a&&/^a /i.test(a)?'an anniversary':`${a||''}anniversary`],[/\b(?:a )?(?:quiet|peaceful|intimate) (?=(?:romantic )?(?:dinner|lunch|evening|night|weekend|getaway|meal))/gi,''],[/\b(?:with |and )?(?:one|1|a single|just one) (?:ski|snowboard) day\b(?=.*\b(?:\d+|two|three|four|five|six|seven) days\b|.*\bweekend\b)|(?<=\b(?:\d+|two|three|four|five|six|seven) days\b.*)\b(?:with |and )?(?:one|1|a single|just one) (?:ski|snowboard) day\b|(?<=\bweekend\b.*)\b(?:with |and )?(?:one|1|a single|just one) (?:ski|snowboard) day\b/gi,'and skiing on 1 of the days'],[/\b(\d+|two|three|four|five|six|seven) (?:ski|snowboard|skiing) days\b|\b(\d+|two|three|four|five|six|seven) days (?:of )?(?:skiing|snowboarding|on the slopes|on the hill)\b/gi,(m,a,b)=>`skiing on ${({two:2,three:3,four:4,five:5,six:6,seven:7})[(a||b).toLowerCase()]||a||b} of the days`],[/\b(?:a |one |1 )?(?:ski|snowboard|powder|bluebird ski) days?\b(?! (?:passes?|tickets?))/gi,'skiing'],[/\b(?:ski|snowboard)s? (?:and (?:snowboard|ski|bike) )?(?:rentals?|rental shops?|shops?|stores?|tuning)\b/gi,'gear rental shops'],[/\ba few hours\b/gi,'3 hours'],[/\ba couple (?:of )?hours\b/gi,'2 hours'],[/\b(?:half a day|a half day|half day)\b/gi,'4 hours'],
  // Indoor test 7 (2026-11-19; Robert's gallery): "art walk", "first Friday", sculpture and paintings, and a bare "art"
  // mean galleries ("art walk downtown Kelowna" planned hiking parks; "art in Kelowna on Friday" a trail and laser tag).
  [/\bart (?:walks?|crawls?|tours?)\b/gi,'art galleries'],[/\bfirst fridays?(?: art\b| art walks?\b| openings?\b)?/gi,'art galleries'],[/\b(?:sculptures?|sculptors?|paintings|painters)\b/gi,'art galleries'],
  [/(?<!\b(?:martial|street|body|nail|latte|pop|digital|kids?|children'?s?) )\bart\b(?! (?:galler|museum|class|classes|camps?|studios?|workshops?|lessons?|centre|center|deco|supplies|supply|party|parties))/gi,'art galleries'],
  // Indoor test 16 (2026-11-19; "rainy day for a group of 6" searched for the word "group" and left out Tyler's escape room,
  // Great for Groups with a Groups line): a group, a group of N, N people (4 or more), a big group or a team is the
  // Great for Groups badge ("big group"), never a word to find. "Group of friends", "team building" and "team trip" keep
  // their own meaning (the group occasion), as before.
  // With food or drink asked for ("craft beer tour for 6 people", "brewery for a group of 8"), the head count is not a filter
  // on the places (a brewery without the badge still takes 6): it is left out instead.
  [/\b(?:a |our |my )?(?:big |large )?group of (?:\d{1,3}|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)(?: (?:people|adults|guests|players|of us|coworkers|colleagues|teens|teenagers|kids|students))?\b/gi,(m,...a)=>(GROUP_FOOD_RE.test(a[a.length-1])?'':'a big group')],
  [/\bfor (?:a )?(?:party of |team of )?(\d{1,3}|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)(?: (?:people|adults|guests|players|of us|persons))\b/gi,(m,n,off,str)=>{const k={four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,fifteen:15,twenty:20}[String(n).toLowerCase()]||Number(n);return k>=4?(GROUP_FOOD_RE.test(str)?'':'for a big group'):m;}],
  [/(?<!\b(?:big|large|good for|great for|for big|for large) )\b(?:groups?|teams?)\b(?! (?:of friends|getaway|building|dinner|dinners|trip|trips|of \d))/gi,(m,off,str)=>(GROUP_FOOD_RE.test(str)?m:'big group')]];
const GROUP_FOOD_RE=/\b(?:dinners?|lunch(?:es)?|brunch|breakfast|suppers?|meals?|eat|food|restaurants?|cafes?|cafés?|coffee|beers?|brewer(?:y|ies)|breweries|wines?|winer(?:y|ies)|tastings?|pubs?|bars?|drinks?|cocktails?|distiller(?:y|ies)|cider(?:y|ies)?)\b/i;
// 2026-10-25 (tools audit): "retired couple, no hiking" became "relaxed easy walks, no hiking", a walks part that "no
// hiking" emptied (three mornings left free). With hiking or walking ruled out, those words mean "relaxed" only.
const WALKS_NEGATED_RE=/\b(?:no|without|skip|avoid|not into|no more|don.?t (?:want|like|do|need)(?: to)?|do not (?:want|like|do|need)(?: to)?)\s+(?:\w+\s+)?(?:hik\w*|walks?|walking|trails?)\b/i;
// Sport setup (2026-11-20): « disque-golf » (French) asks for disc golf.
REQUEST_SYNONYMS.push([/\bdisques?[- ]golf\b/gi, 'disc golf']);
// Sport test 8 (2026-11-21; "9 holes after work on Tuesday… around 5:30" planned Marg's course, which closes at 4 PM on
// Tuesdays, and read "work" as something to look for): a bare evening clock ("around 5:30", "at 6") is PM, and "after work"
// is about 5:30 PM (unless a time is given); neither is a word to find. The same for "balls" in "hit some balls".
REQUEST_SYNONYMS.push([/\b(at|around|about|by|from)\s+([1-9])(?::([0-5]\d))?(?![\d:])(?!\s*(?:a\.?m\b|p\.?m\b|o.?clock\s*(?:in the morning)?|h\b|hours?\b|hrs?\b|minutes?\b|mins?\b|days?\b|people\b|kids\b|of us\b|holes?\b|trous\b|km\b|years?\b|yr\b|\$|dollars?\b|%))/gi,(m,w,h,mm,off,str)=>(Number(h)>=4&&Number(h)<=7&&!/\b(?:coffee|breakfast|brunch|caf[eé]|latte|espresso|morning|mornings|sunrise|early|start\w*|begin\w*|leav\w*|depart\w*|opens?|first tee|tee times?|wake|up)\b[^.;!?]{0,30}$/i.test(str.slice(Math.max(0,off-40),off))&&!/^\s*(?:in the morning|du matin)/i.test(str.slice(off+m.length))?`${w} ${h}:${mm||'00'} pm`:m)]);
REQUEST_SYNONYMS.push([/,?\s*\b(?:right |straight |just )?after (?:work|my shift|the office|school)\b/gi,(m,off,str)=>(/\b(?:at|around|about|from)\s+(?:1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:am|pm)\b/i.test(str)?' ':' at 5:30 pm ')]);
REQUEST_SYNONYMS.push([/\bhit (?:some|a few|a bucket of) balls\b/gi,'driving range']);
// Fresh eyes (2026-11-22; "we love wine and good food, no driving after wineries" planned no winery at all): not driving
// after the tastings is how they get around (a ride or a wine tour), never a car-free trip and never "no wineries". The
// wineries stay asked for; the drinks words go (the travel agent chat offers the wine tour).
const NO_DRIVE_AFTER_DRINKS_RE=/,?\s*\b(?:but\s+|and\s+)?(?:no|not|never|avoid|without|(?:we |i )?(?:don'?t|do not|won'?t|will not|can'?t|cannot)(?: want to| wanna| plan to)?(?: be)?)\s+(?:any\s+)?(?:driving|drive|car)\s+(?:after|between|to and from|from|home from|back from)\s+(?:the\s+|our\s+|any\s+)?(wineries|winery|vineyards?|wine tastings?|tastings?|wine|breweries|brewery|brewpubs?|taprooms?|distilleries|distillery|cideries|cidery|drinks|drinking|cocktails|bars?|pubs?)\b|,?\s*\b(?:no|not)\s+(?:drinking and driving|drink(?:ing)? (?:and|&) driv\w+)\b/gi;
REQUEST_SYNONYMS.push([NO_DRIVE_AFTER_DRINKS_RE,(m,what)=>{const w=String(what||'').toLowerCase();return /win|vineyard|tasting/.test(w)?', wineries':/brew|taproom/.test(w)?', breweries':/distill/.test(w)?', distilleries':/cider/.test(w)?', cideries':' ';}]);
function tripRequestSynonyms(text){let out=String(text||'');const walksNegated=WALKS_NEGATED_RE.test(out);for(const [re,w] of REQUEST_SYNONYMS)out=out.replace(re,walksNegated&&w==='relaxed easy walks'?'relaxed':w);
 // "Best brunch then a walk" (2026-10-25): "best" ranks a list; in a request with several parts it emptied the plan.
 if(/\b(?:then|followed by|after that|afterwards)\b/i.test(out))out=out.replace(/\b(?:the )?(?:best|top|top rated|highest rated)\s+(?=\w)/gi,'');
 // A ski day already runs hill first, then après, a spa and dinner: "ski in the morning and spa in the afternoon" is that day.
 if(/\b(?:ski|skiing|snowboard\w*)\b/i.test(out)&&!/\b(?:cross.country|nordic)\b/i.test(out)&&!/\b(?:don.?t|do not|won.?t|not|no|never|without)\s+(?:\w+\s+){0,2}(?:ski|skiing|snowboard\w*)\b/i.test(out))out=out.replace(/\b(?:a )?night out\b|\bgoing out(?: at night)?\b/gi,'nightlife').replace(/\s*\b(?:in the morning|in the afternoon|in the evening)\b/gi,'').replace(/\b(?:morning|afternoon|evening)\s+(?=(?:ski|skiing|snowboard\w*|spa|apres|après|dinner|lunch|drinks)\b)/gi,'').replace(/\s{2,}/g,' ');
 return out;}

module.exports={golfPartKind,SPORT_KIND_PLANNER,indoorSlotOf,morningOfOneStop,KINDS,REQUEST_KINDS,TOUR_PLANNER_KINDS,TOUR_KIND_PLANNER,INDOOR_KIND_PLANNER,tripRequestSynonyms,holidayDateText,lakesidePlace,hikingPlace,lakeWalk,rollPastTimeWindow,listedWeekdays,listedDayConflict,travelKm,lakeDetour,onceFoods,namedEventInterpretationText,sparseDayRecovery,sportsVenueInterpretationText,isOutdoorSport,listedAccessConflict,listedAccessNotes,isSportKind:k=>!!SPORT_KINDS[k],nearbyEventAlternatives,listedOutdoorTiming,estimateDaylight,estimateTransfer,estimateTripTiming,tripCalendar,expandTripComponents,inferPlannerKinds,inferPlannerActivities,consumedTerms,eventMatches,eventSearchTermMatches,extractTripRequirements,evaluateTripRequirements,requirementDay,venueAllowed,requirementScore,matches,LABELS,selectedStops};
