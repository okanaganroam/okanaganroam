'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const d=require('../discovery-intent'),r=require('../trip-requirements'),tp=require('../trip-planner');
const taxonomy={regions:['kelowna','vernon','penticton'],regionLabels:{kelowna:'Kelowna',vernon:'Vernon',penticton:'Penticton'},types:['cafe','restaurant','pub','winery','indoor','outdoor'],features:[],activities:['hiking','viewpoints'],collections:[],venues:[],eventCategories:['arts-culture','sports-recreation'],datePresets:['this-weekend']};
const labels={regions:taxonomy.regionLabels,types:Object.fromEntries(taxonomy.types.map(t=>[t,{singular:t,plural:t}]))};
const facts=[
 {id:1,name:'Coffee',type:'cafe',description:'Specialty coffee.',price:1},
 {id:2,name:'Easy Waterfront Walk',type:'outdoor',description:'An easy flat paved walking path along the waterfront.'},
 {id:3,name:'Walk-in Coffee',type:'cafe',description:'Walk in any time. Happy hour.'},
 {id:4,name:'Museum',type:'indoor',description:'A museum with local history.'},
 {id:5,name:'Budget Dinner',type:'restaurant',description:'Casual dinner and vegetarian meals.',price:2},
 {id:6,name:'Luxury Dinner',type:'restaurant',description:'Romantic intimate fine dining.',price:4},
 {id:7,name:'Family Winery',type:'winery',description:'Wine tasting.'},
 {id:8,name:'Sunset Park',type:'outdoor',description:'An easy sunset viewpoint.'},
 {id:9,name:'Pub',type:'pub',description:'Two people walk here for happy hour.',price:2},
].map(v=>({...v,region:'kelowna',url:'/kelowna/'+v.id,textName:d.normalizeDiscoveryText(v.name),textDesc:d.normalizeDiscoveryText(v.description),plannerDescription:v.description,features:{kid_friendly:true,vegetarian:true,dog_friendly:true},activities:r.inferPlannerActivities(v),plannerKinds:r.inferPlannerKinds(v),collections:[],fdTypes:[],rating:4,hours:null}));
function interpret(text){const intent=d.interpretDiscoveryQuery(text,taxonomy),trip=d.interpretTripComponents(text,taxonomy,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy});return {intent,trip,requirements};}
function plan(text){const x=interpret(text);return tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts,labels,tripDate:'2026-10-17',tripEvents:x.trip.components.map(c=>c.kind==='event'?[{id:20,name:'Film Festival',region:'kelowna',categories:['arts-culture'],startDate:'2026-10-17',endDate:'2026-10-17',time:'4 pm'}]:null)});}
const stops=p=>r.selectedStops(p).filter(s=>s.venue).map(s=>s.venue);

// Paired English/French customer requests pin the same explicit intent across
// the two language paths. Keep assertions on interpreted intent and avoid
// assuming that sparse fixture inventory can satisfy every activity.
const customerBenchmarkCases=[
 {name:'two-day Kelowna cafe, museum and one dinner',region:'kelowna',days:2,must:['days:2','type:cafe','venue_kind:museum','type:restaurant'],en:'Plan 2 days in Kelowna with coffee, a museum and one dinner.',fr:'Planifie 2 jours à Kelowna avec un café, un musée et un souper.'},
 {name:'rainy Vernon afternoon with museum and cafe',region:'vernon',must:['rainy:true','venue_kind:museum','type:cafe'],en:'Plan a rainy afternoon in Vernon with a museum and cafe.',fr:'Planifie un après-midi pluvieux à Vernon avec un musée et un café.'},
 {name:'dog-friendly Vernon weekend with winery and easy walks',region:'vernon',must:['venue_kind:easy_walk','type:winery','feature:dog_friendly'],en:'Plan a dog-friendly weekend in Vernon with a winery and easy walks.',fr:'Planifie un week-end à Vernon avec un vignoble, des promenades faciles et mon chien.'},
 {name:'Kelowna date night hockey and dinner',region:'kelowna',must:['type:restaurant','event:sports-recreation:hockey'],en:'Plan a date night in Kelowna with an ice hockey game and dinner.',fr:'Planifie une soirée à Kelowna avec un match de hockey et un souper.'},
 {name:'Penticton family parks and beaches without wineries',region:'penticton',days:2,must:['days:2','venue_kind:park','type:beach','excluded_type:winery'],en:'Plan 2 days in Penticton with kids, parks and beaches; no wineries.',fr:'Planifie 2 jours à Penticton avec les enfants, des parcs et des plages, sans vignobles.'},
 {name:'two-hour Kelowna coffee and easy walk',region:'kelowna',must:['duration:120','type:cafe','venue_kind:easy_walk'],en:'Plan a 2-hour afternoon in Kelowna with coffee and an easy walk.',fr:'Planifie 2 heures cet après-midi à Kelowna avec un café et une promenade facile.'},
 {name:'Penticton weekend festival and restaurant',region:'penticton',must:['event:events-festivals:festival','type:restaurant'],en:'Plan a weekend in Penticton with a festival and a restaurant.',fr:'Planifie un week-end à Penticton avec un festival et un restaurant.'},
 {name:'rainy Kelowna day with museum and coffee',region:'kelowna',must:['rainy:true','venue_kind:museum','type:cafe'],en:'Plan a rainy day in Kelowna with a museum and coffee.',fr:'Planifie une journée pluvieuse à Kelowna avec un musée et un café.'},
 {name:'Vernon family bowling and lunch',region:'vernon',must:['venue_kind:bowling','type:restaurant'],en:'Plan a family day in Vernon with bowling and lunch.',fr:'Planifie une journée en famille à Vernon avec des quilles et un dîner.'},
 {name:'Kelowna hike and winery',region:'kelowna',must:['activity:hiking','type:winery'],en:'Plan a hike and a winery in Kelowna.',fr:'Planifie une randonnée et un vignoble à Kelowna.'},
 {name:'three-day Penticton wine, lake and dinner',region:'penticton',days:3,must:['days:3','type:winery','type:restaurant'],en:'Plan a 3-day trip in Penticton with wine tasting, a lake day and dinner.',fr:'Planifie un séjour de 3 jours à Penticton avec dégustation de vin, une journée au lac et un souper.'},
 {name:'Kelowna cafe and art gallery this afternoon',region:'kelowna',must:['type:cafe','venue_kind:gallery'],en:'Find a cafe and art gallery in Kelowna this afternoon.',fr:'Trouve un café et une galerie d’art à Kelowna cet après-midi.'},
 {name:'Vernon guided tour and dinner',region:'vernon',must:['type:tour','type:restaurant'],en:'Plan a day in Vernon with a guided tour and dinner.',fr:'Planifie une journée à Vernon avec une visite guidée et un souper.'},
 {name:'quiet Penticton evening dinner without pubs',region:'penticton',must:['type:restaurant','excluded_type:pub'],en:'Plan a quiet evening in Penticton with dinner, no pubs.',fr:'Planifie une soirée tranquille à Penticton avec un souper, sans pubs.'},
 {name:'Kelowna weekend with children and a dog',region:'kelowna',must:[],en:'Plan a weekend in Kelowna with kids and a dog.',fr:'Planifie un week-end à Kelowna avec les enfants et un chien.'},
 {name:'Kelowna morning coffee and easy walk',region:'kelowna',must:['type:cafe','venue_kind:easy_walk'],en:'Plan a morning in Kelowna with coffee and an easy walk.',fr:'Planifie une matinée à Kelowna avec un café et une promenade facile.'},
 {name:'Penticton rainy option with museum',region:'penticton',must:['rainy:true','venue_kind:museum'],en:'Find a rainy-day option in Penticton with a museum.',fr:'Trouve une option pour les jours de pluie à Penticton avec un musée.'},
 {name:'Vernon wine tasting and dinner',region:'vernon',must:['type:winery','type:restaurant'],en:'Plan a wine tasting and dinner in Vernon.',fr:'Planifie une dégustation de vin et un souper à Vernon.'},
 {name:'dated Kelowna hockey event',region:'kelowna',must:['event:sports-recreation:hockey'],en:'Plan a day in Kelowna with a hockey event on October 18, 2026.',fr:'Planifie une journée à Kelowna avec un match de hockey le 18 octobre 2026.'},
 {name:'Vernon weekend cafe and easy walk without wineries',region:'vernon',must:['type:cafe','venue_kind:easy_walk','excluded_type:winery'],en:'Plan a weekend in Vernon with a cafe and easy walk, no wineries.',fr:'Planifie un week-end à Vernon avec un café, une promenade facile et sans vignobles.'},
];
function benchmarkInterpret(text,language){
 const planText=language==='fr'?require('../trip-planner-fr').tripPlannerText(text,taxonomy):text;
 return {planText,...interpret(planText)};
}
function benchmarkKeys(result){return result.requirements.items.map(i=>`${i.kind}:${i.value}${i.eventKind?`:${i.eventKind}`:''}`);}
for(const item of customerBenchmarkCases){
 for(const [language,text] of [['en',item.en],['fr',item.fr]])test(`Benchmark ${language.toUpperCase()}: ${item.name}`,()=>{
  const result=benchmarkInterpret(text,language);
  assert.ok(result.intent.regions.includes(item.region),`expected ${item.region}; interpreted ${result.intent.regions.join(', ')||'(none)'} from ${result.planText}`);
  const keys=benchmarkKeys(result);
  for(const required of item.must)assert.ok(keys.includes(required),`expected ${required}; interpreted ${keys.join(', ')||'(none)'} from ${result.planText}`);
  const planned=plan(result.planText);
  assert.ok(['itinerary','day_plan','multi_day','recommendations','events','discover'].includes(planned.kind),`expected a customer-facing plan shape, got ${planned.kind}`);
  if(item.days)assert.equal(planned.days.length,item.days,`expected ${item.days} plan days`);
 });
}

test('French single-supper wording preserves the one-meal constraint',()=>{
 const text=require('../trip-planner-fr').tripPlannerText('Planifie un week-end romantique à Kelowna avec des vignobles et un seul souper',taxonomy);
 const result=interpret(text);
 assert.match(text,/one dinner/);
 assert.equal(result.requirements.explicitMealCount,1);
 assert.doesNotMatch(text,/\bseul\b/);
});

test('Customer event search: hockey recognizes league wording while retaining category checks',()=>{
 const game={name:'Kelowna Rockets Home Games 2026–27',description:'Kelowna Rockets WHL regular-season home games.',categories:['sports-recreation']};
 assert.equal(r.eventSearchTermMatches(game,'hockey','sports-recreation'),true);
 assert.equal(r.eventSearchTermMatches({...game,categories:['community-events']},'hockey','sports-recreation'),false);
 assert.equal(r.eventSearchTermMatches({name:'Kelowna Rockets Show',description:'A family event.',categories:['sports-recreation']},'hockey','sports-recreation'),false);
});
test('Customer event matching: festival and market intents retain their event kind and reject unrelated listings',()=>{
 for(const [text,kind,category,otherCategory] of [
  ['Plan a festival in Kelowna on October 18, 2026.','festival','events-festivals','markets-fairs'],
  ['Plan a market in Kelowna on October 18, 2026.','market','markets-fairs','events-festivals'],
 ]){
  const requirement=interpret(text).requirements.items.find(i=>i.kind==='event');
  assert.equal(requirement?.eventKind,kind,text);
  assert.equal(requirement?.value,category,text);
  const plan={requirementResults:[{...requirement,status:'unmet'}]};
  const events=[
   {id:1,name:`Kelowna ${kind}`,region:'kelowna',categories:[category],startDate:'2026-10-20',url:`/events/${kind}`},
   {id:2,name:'Unrelated event',region:'kelowna',categories:[otherCategory],startDate:'2026-10-20',url:'/events/unrelated'},
  ];
  const result=r.nearbyEventAlternatives({plan,events,from:'2026-10-17',to:'2026-10-18',today:'2026-10-13',regions:['kelowna'],suitsKind:tp.eventSuitsKind});
  assert.deepEqual(result.map(e=>e.id),[1],text);
  assert.equal(tp.eventSuitsKind(events[0],kind),true,text);
  assert.equal(tp.eventSuitsKind({name:'Community Dinner',categories:[otherCategory]},kind),false,text);
 }
});
test('Customer: two-hour afternoon stays an afternoon coffee and real easy walk',()=>{const p=plan('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type).sort(),['cafe','outdoor']);assert.ok(stops(p).some(v=>v.id===2));assert.ok(p.itinerary.stops.every(s=>s.daypart==='afternoon'||s.daypart==='midday'));assert.ok(p.requirementResults.some(i=>i.kind==='duration'&&i.status==='unverified'));});
test('Customer: duration and easy-walk grammar cannot become generic food keywords',()=>{const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk.');const c=r.consumedTerms(x.requirements);for(const w of ['hour','easy','walk'])assert.ok(c.has(w),w);});
test('Customer: accessibility wording is retained as unverified and removed from keyword ranking',()=>{const x=interpret('Plan a day in Kelowna for someone using a wheelchair, with a museum and dinner.');const c=r.consumedTerms(x.requirements);for(const w of ['someone','using','wheelchair'])assert.ok(c.has(w),w);assert.ok(x.requirements.items.some(i=>i.value==='accessibility'));});
test('Customer: ages and party count are not venue content keywords',()=>{const x=interpret('Plan a rainy day in Kelowna with two kids aged 4 and 7.');const c=r.consumedTerms(x.requirements);for(const w of ['two','aged','4','7'])assert.ok(c.has(w),w);});
test('Customer: missing spa leaves one requested dinner, no substitute cafe or lunch',()=>{const p=plan('Plan a day in Kelowna with a spa and dinner.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type),['restaurant']);assert.ok(p.requirementResults.some(i=>i.value==='spa'&&i.status==='unmet'));});
test('Customer: limited total budget avoids upscale dining and remains unverified',()=>{const p=plan('Plan a day in Kelowna with a winery and dinner for under $100 total for two people.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type).sort(),['restaurant','winery']);assert.ok(stops(p).every(v=>v.price==null||v.price<=2));assert.ok(p.requirementResults.some(i=>i.value==='exact budget'&&i.status==='unverified'));});
test('Customer: no restaurants does not cause an unrequested pub filler',()=>{const p=plan('Plan a day in Kelowna with coffee and a museum. No restaurants.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type).sort(),['cafe','indoor']);});
test('Customer: a winery-and-dinner trip does not add an unrequested brewery as a filler',()=>{
 const x=interpret('A dog-friendly weekend in Kelowna with wineries and a relaxed dinner.');
 const brewery={...facts[0],id:43,name:'Cambium Cider Co',type:'brewery',region:'kelowna',url:'/kelowna/breweries/cambium-cider-co'};
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:[...facts,brewery],labels,tripDate:'2026-10-17'});
 assert.ok(stops(p).some(v=>v.type==='winery'));
 assert.ok(stops(p).some(v=>v.type==='restaurant'));
 assert.ok(!stops(p).some(v=>v.id===43));
});
test('Customer: a multi-day wine-and-food itinerary does not pad mornings with unrequested coffee stops',()=>{
 const p=plan('Plan 3 days in Kelowna with wineries and great food, including one relaxed day by the lake.');
 assert.equal(p.days.length,3);
 assert.ok(p.days.flatMap(d=>d.stops).every(s=>s.venue?.type!=='cafe'),JSON.stringify(p.days.map(d=>d.stops.map(s=>s.venue?.name))));
});
test('Customer activity: pottery-class wording selects a real listed studio and reports the request as met',()=>{
 const pottery={...facts[0],id:50,name:'Work of Art Pottery Studio',type:'indoor',description:'Paint-your-own-pottery studio offering bookable classes and workshops.',plannerDescription:'Paint-your-own-pottery studio offering bookable classes and workshops.',textName:'work of art pottery studio',textDesc:'paint your own pottery studio offering bookable classes and workshops',url:'/kelowna/indoor/work-of-art-pottery-studio'};
 pottery.plannerKinds=r.inferPlannerKinds(pottery);
 const x=interpret('Plan a rainy day in Kelowna with a pottery class and dinner.');
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:[...facts,pottery],labels,tripDate:'2026-10-17'});
 assert.ok(x.requirements.items.some(i=>i.kind==='venue_kind'&&i.value==='pottery'));
 assert.ok(stops(p).some(v=>v.id===50));
 assert.ok(p.requirementResults.some(i=>i.kind==='venue_kind'&&i.value==='pottery'&&i.status==='satisfied'));
});
test('Customer activity: French pottery-workshop wording reaches the same real studio requirement',()=>{
 const fr=require('../trip-planner-fr');
 const text=fr.tripPlannerText('Planifie une journée pluvieuse à Kelowna avec un cours de poterie et un souper.',taxonomy);
 const x=interpret(text);
 assert.ok(text.includes('pottery class'));
 assert.ok(x.requirements.items.some(i=>i.kind==='venue_kind'&&i.value==='pottery'));
});
test('Customer: rainy-day option and sunset remain separate requirements and stops',()=>{const p=plan('We want an event this weekend, a winery, a rainy day option and sunset, all in Kelowna.');assert.ok(stops(p).some(v=>v.type==='indoor'));assert.ok(stops(p).some(v=>v.id===8));assert.ok(stops(p).some(v=>v.type==='winery'));assert.ok(p.events.length);assert.ok(!p.requirementResults.some(i=>['rainy','venue_kind'].includes(i.kind)&&i.status==='unmet'));});
test('Customer: easy walks need stored ease evidence, not just an outdoor hiking mention',()=>{assert.ok(r.inferPlannerKinds({type:'outdoor',name:'Flat Walk',description:'An easy flat walking path.'}).includes('easy_walk'));assert.ok(!r.inferPlannerKinds({type:'outdoor',name:'Mountain Trail',description:'A steep challenging hiking trail.'}).includes('easy_walk'));assert.ok(!r.inferPlannerKinds({type:'cafe',name:'Walk In Cafe',description:'An easy walk from downtown.'}).includes('easy_walk'));});

test('Customer: easy food favours lower-price meals rather than luxury dining',()=>{const p=plan('Plan 2 days in Kelowna with kids, museums and easy food. No beaches or golf.');assert.ok(stops(p).filter(v=>v.type==='restaurant').every(v=>v.price==null||v.price<=2));});

test('Customer: a driving-distance limit is not a dollar budget',()=>{assert.ok(!interpret('Plan a day in Kelowna with stops under 30 km apart').requirements.items.some(i=>i.kind==='price_limit'));});

test('Customer: an evening winery must not be selected when stored hours end before evening',()=>{
 const x=interpret('Plan a romantic evening in Kelowna with one winery and dinner, no morning activities.');
 const closed=facts.map(v=>v.type==='winery'?{...v,_hours:undefined,hours:JSON.stringify({mon:[['11:00','17:00']],tue:[['11:00','17:00']],wed:[['11:00','17:00']],thu:[['11:00','17:00']],fri:[['11:00','17:00']],sat:[['11:00','17:00']],sun:[['11:00','17:00']]})}:v);
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:closed,labels,tripDate:'2026-10-17'});
 assert.equal(p.kind,'itinerary');assert.ok(!stops(p).some(v=>v.type==='winery'));assert.ok(stops(p).some(v=>v.type==='restaurant'));assert.ok(p.requirementResults.some(i=>i.value==='winery'&&i.status==='unmet'));
});
test('Customer: a rainy family day includes an actual indoor activity, not only meals',()=>{const p=plan('Plan a rainy day in Kelowna with two kids aged 4 and 7. No wine or breweries.');assert.ok(stops(p).some(v=>v.type==='indoor'));});
test('Customer: a rainy-day restaurant is not presented as confirmed indoor',()=>{const p=plan('Plan a rainy day in Kelowna with two kids aged 4 and 7. No wine or breweries.');const dinner=p.days.flatMap(d=>d.stops).find(s=>s.venue?.type==='restaurant');assert.ok(dinner);assert.ok(!dinner.reasons.some(x=>/restaurant suits a rainy day/i.test(x.text)));});

test('Customer: a single-day museum, dinner and hockey request retains its event component',()=>{const x=interpret('Plan a day in Kelowna with a museum, dinner and hockey.');const trip=r.expandTripComponents({...x.trip,regions:x.intent.regions},x.requirements);assert.ok(trip.components.some(c=>c.kind==='event'&&c.event.kind==='hockey'));});
test('Customer: a short hiking outing keeps hiking rather than any outdoor place',()=>{const p=plan('Plan a 2-hour afternoon in Kelowna with hiking and coffee.');assert.ok(!stops(p).some(v=>v.id===8));assert.ok(p.requirementResults.some(i=>i.value==='hiking'&&i.status==='unmet'));});
test('Customer: a single-day rainy option does not exclude sunset',()=>{const p=plan('Plan a day in Kelowna with a rainy day option, sunset and a winery.');assert.ok(stops(p).some(v=>v.id===8));assert.ok(stops(p).some(v=>v.type==='indoor'));assert.ok(stops(p).some(v=>v.type==='winery'));});

test('Customer: changing a short outing to multiple days restores a day plan',()=>{const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk.');const initialTrip=r.expandTripComponents({...x.trip,regions:x.intent.regions},x.requirements);x.requirements.items.push({id:'override-days',kind:'days',value:2,strength:'must'});const p=tp.planTrip({...x,trip:initialTrip,facts,labels,tripDate:'2026-10-17'});assert.equal(p.days.length,2);});
test('Customer: a short coffee-only request has one requested stop',()=>{const p=plan('Plan a 2-hour afternoon in Kelowna with coffee.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type),['cafe']);});

test('Customer: French short-outing vocabulary reaches the same duration and walk checks',()=>{
 const fr=require('../trip-planner-fr');const text=fr.tripPlannerText('Planifie 2 heures cet après-midi à Kelowna avec un café et une promenade facile.',taxonomy);
 const p=plan(text);assert.equal(p.kind,'itinerary');assert.ok(stops(p).some(v=>v.id===2));assert.equal(p.requirementResults.find(i=>i.kind==='duration').value,120);
});

test('Customer: unavailable activities leave free time instead of a food-only filler morning',()=>{const p=plan('Plan 2 days in Kelowna with kids, museums and easy food. No beaches or golf.');assert.equal(p.days[1].stops.find(s=>s.daypart==='morning').venue,null);assert.ok(p.warnings.some(w=>/activity.*day 2/.test(w)));});

test('Customer: an easy walk does not erase a walk requested on a different day',()=>{const x=interpret('Plan 2 days in Kelowna. Day 1 an easy walk. Day 2 a walk.');assert.ok(x.requirements.items.some(i=>i.kind==='venue_kind'&&i.value==='walk'&&i.dayIndex===2));});
test('Customer: hiking and sunset remain independent outdoor stops',()=>{const x=interpret('Plan a day in Kelowna with hiking, sunset and coffee.');const trip=r.expandTripComponents({...x.trip,regions:x.intent.regions},x.requirements);assert.ok(trip.components.some(c=>c.activities.includes('hiking')&&!(c.plannerKinds||[]).includes('sunset')));assert.ok(trip.components.some(c=>(c.plannerKinds||[]).includes('sunset')));});
test('Customer: a named cafe is retained even when a generic cafe ranks higher',()=>{
 const t={...taxonomy,venues:[{id:1,name:'Coffee',type:'cafe',region:'kelowna'}]};const text='Plan a day in Kelowna with coffee at Coffee and a museum.';const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 const p=tp.planTrip({intent,trip:trip.multi?trip:null,requirements,facts:facts.map(v=>v.id===1?{...v,rating:1}:v),labels,tripDate:'2026-10-17'});assert.ok(stops(p).some(v=>v.id===1));assert.ok(!p.requirementResults.some(i=>i.kind==='venue'&&i.status==='unmet'));
});

test('Customer: a locked stop outside an edited base returns a conflict',()=>{const x=interpret('Plan 2 days in Kelowna with museums and dinner.');x.intent.regions=['vernon'];assert.throws(()=>tp.planTrip({...x,trip:null,facts,labels,tripDate:'2026-10-17',pinned:{'1-morning':4}}),e=>e.code==='TRIP_CONFLICT');});

test('Customer: separate hiking and sunset listings both survive actual selection',()=>{
 const x=interpret('Plan a day in Kelowna with hiking, sunset and coffee.');const hike={...facts[1],id:10,name:'Hiking Trail',description:'A hiking trail.',plannerKinds:['walk'],activities:['hiking'],textName:'hiking trail',textDesc:'a hiking trail'};
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:[...facts,hike],labels,tripDate:'2026-10-17'});assert.ok(stops(p).some(v=>v.id===10));assert.ok(stops(p).some(v=>v.id===8));assert.ok(!p.requirementResults.some(i=>i.value==='hiking'&&i.status==='unmet'));
});

test('Customer quality: nearby walk beats a distant higher-rated walk for a short outing',()=>{
 const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk.');
 const local=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:49.88,lng:-119.49}));
 const far={...local[1],id:30,name:'Distant Easy Walk',rating:5,lat:50.1,lng:-119.49};
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:[...local,far],labels,tripDate:'2026-10-17'});
 assert.ok(stops(p).some(v=>v.id===2));assert.ok(!stops(p).some(v=>v.id===30));
});
test('Customer quality: a second requested museum can fill the afternoon instead of extra lunch',()=>{
 const x=interpret('Plan 2 days in Kelowna with kids, museums and easy food. No beaches or golf.');
 const second={...facts[3],id:31,name:'Second Museum'};
 const p=tp.planTrip({...x,trip:null,facts:[...facts,second,{...second,id:32,name:"Third Museum"}],labels,tripDate:'2026-10-17'});
 assert.ok(p.days[0].stops.find(s=>s.daypart==='afternoon').venue?.type==='indoor');
});
test('Customer quality: event followed by sunset explicitly warns that timing is unverified',()=>{
 const p=plan('We want an event this weekend, a winery, a rainy day option and sunset, all in Kelowna.');
 assert.ok(p.warnings.some(w=>/sunset.*timing|timing.*sunset/i.test(w)));
});

test('Customer return: an afternoon coffee and walk stays two afternoon stops without a brewery',()=>{
 const p=plan('Plan a relaxed afternoon in Kelowna with my dog, coffee and an easy walk. No restaurants.');
 assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type).sort(),['cafe','outdoor']);assert.ok(p.itinerary.stops.every(s=>s.daypart==='afternoon'));
});
test('Customer return: nearby trails and paved RV lanes do not prove an easy walk experience',()=>{
 assert.ok(!r.inferPlannerKinds({type:'outdoor',name:'Oxbow RV Resort',description:'Full hookup sites on paved lanes, a few minutes from the river walking path.'}).includes('easy_walk'));
 assert.ok(!r.inferPlannerKinds({type:'outdoor',name:'Bike Park',description:'A paved pump track and a steep bike trail. The park also has walking paths.'}).includes('easy_walk'));
 assert.ok(r.inferPlannerKinds({type:'outdoor',name:'Wetland',description:'An easy flat boardwalk walking path through the wetland.'}).includes('easy_walk'));
});
test('Customer return: generic rainy option for adults chooses a gallery over a young-child playground',()=>{
 const x=interpret('Plan a day in Kelowna with a rainy day option, sunset and a winery.');
 const gallery={...facts[3],id:40,name:'Gallery',description:'An art gallery.',plannerDescription:'An art gallery.',textDesc:'an art gallery',rating:3};
 const play={...facts[3],id:41,name:'Play Area',description:'Indoor playground for young kids with a ball pit and toys.',plannerDescription:'Indoor playground for young kids with a ball pit and toys.',textDesc:'indoor playground for young kids with a ball pit and toys',rating:5};
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:[...facts.filter(v=>v.type!=='indoor'),gallery,play],labels,tripDate:'2026-10-17'});
 assert.ok(stops(p).some(v=>v.id===40));assert.ok(!stops(p).some(v=>v.id===41));
});
test('Customer return: multi-day walk cannot be fulfilled by a nearby RV resort',()=>{
 const x=interpret('Plan 2 days in Kelowna. Day 1 a museum and dinner. Day 2 coffee and an easy walk.');
 const resort={...facts[1],id:42,name:'RV Resort',description:'Paved campsites a few minutes from a walking path.',plannerKinds:r.inferPlannerKinds({type:'outdoor',name:'RV Resort',description:'Paved campsites a few minutes from a walking path.'}),rating:5};
 const p=tp.planTrip({...x,trip:null,facts:[...facts,resort],labels,tripDate:'2026-10-17'});
 assert.ok(!stops(p).some(v=>v.id===42));assert.ok(p.days[1].stops.some(s=>s.venue?.id===2));
});

test('Customer return: plural pump tracks do not turn a bike trail into an easy walk',()=>{
 assert.ok(!r.inferPlannerKinds({type:'outdoor',name:'Bike Skills Park',description:'Three pump tracks including a paved track, a climbing trail and a flow trail for riders. The park also has walking paths.'}).includes('easy_walk'));
});
test('Customer return: day-specific requests do not add unrequested meals on the walking day',()=>{
 const p=plan('Plan 2 days in Kelowna. Day 1 a museum and dinner. Day 2 coffee and an easy walk.');
 assert.ok(!p.days[1].stops.some(s=>s.venue&&['restaurant','pub','brewery'].includes(s.venue.type)));
 assert.ok(!p.days[0].stops.some(s=>s.venue?.type==='restaurant'&&s.daypart!=='evening'));
});
test('Customer return: a coffee-and-walk day does not display a spurious missing dinner slot',()=>{
 const p=plan('Plan 2 days in Kelowna. Day 1 a museum and dinner. Day 2 coffee and an easy walk.');
 assert.ok(!p.days[1].stops.some(s=>s.daypart==='evening'));assert.ok(!p.warnings.some(w=>/evening.*day 2/.test(w)));
});
test('Customer return: a kept dinner cannot override day-two coffee-and-walk instructions',()=>{
 const x=interpret('Plan 2 days in Kelowna. Day 1 a museum and dinner. Day 2 coffee and an easy walk.');
 assert.throws(()=>tp.planTrip({...x,trip:null,facts,labels,tripDate:'2026-10-17',pinned:{'2-evening':5}}),e=>e.code==='TRIP_CONFLICT');
});
test('Customer return: a global winery remains eligible alongside day-specific activities',()=>{
 const p=plan('Plan 2 days in Kelowna. Include a winery. Day 1 a museum and dinner. Day 2 coffee and an easy walk.');
 assert.ok(stops(p).some(v=>v.type==='winery'));
});
test('Customer return: a day-two evening hockey game survives coffee-and-walk slot filtering',()=>{
 const x=interpret('Plan 2 days in Kelowna. Day 1 a museum and dinner. Day 2 coffee, an easy walk and hockey.');
 const events=[{id:50,name:'Kelowna Rockets Hockey',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-18',endDate:'2026-10-18',time:'7 pm'}];
 const p=tp.planTrip({...x,trip:null,facts,labels,tripDate:'2026-10-17',events});
 assert.ok(p.days[1].stops.some(s=>s.kind==='event'&&s.event?.id===50));
});
test('Customer return: easy-walk copy describes the requested walk rather than an incidental viewpoint',()=>{
 const x=interpret('Plan an afternoon in Kelowna with coffee and an easy walk.');
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:facts.map(v=>v.id===2?{...v,activities:['viewpoints']}:v),labels,tripDate:'2026-10-17'});
 assert.match(p.summary,/easy walk/i);assert.ok(JSON.stringify(p.experience).includes('easy walk'));assert.ok(!JSON.stringify(p.experience).includes('lookout'));
});

test('Customer time scope: afternoon coffee only never fills a full day',()=>{
 const p=plan('Plan a relaxed afternoon in Kelowna with coffee only. No dinner.');
 assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type),['cafe']);assert.ok(p.itinerary.stops.every(s=>s.daypart==='afternoon'));
});
test('Customer time scope: morning coffee and walk stay before noon without dinner',()=>{
 const p=plan('Plan a morning in Kelowna with coffee and an easy walk, back by noon.');
 assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type).sort(),['cafe','outdoor']);assert.ok(p.itinerary.stops.every(s=>s.daypart==='morning'));
 assert.ok(p.requirementResults.some(i=>i.kind==='deadline'&&i.value===720&&i.status==='unverified'));
 assert.ok(!JSON.stringify(p).includes('Nothing matching “noon”'));
});
test('Customer time scope: deadline words do not rank venues',()=>{
 const x=interpret('Coffee and an easy walk in Kelowna, back by noon.');
 const c=r.consumedTerms(x.requirements);for(const term of ['back','by','noon'])assert.ok(c.has(term),term);
 const p=plan('Coffee and an easy walk in Kelowna, back by noon.');assert.equal(p.kind,'itinerary');assert.ok(p.itinerary.stops.every(s=>s.daypart==='morning'));
});
test('Customer time scope: coffee only without a daypart is still one stop',()=>{
 const p=plan('Plan a day in Kelowna with coffee only.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type),['cafe']);
});
test('Customer time scope: morning coffee only is one morning stop',()=>{
 const p=plan('Plan a morning in Kelowna with only coffee.');assert.equal(p.kind,'itinerary');assert.deepEqual(stops(p).map(v=>v.type),['cafe']);assert.equal(p.itinerary.stops[0].daypart,'morning');
});

test('Customer time scope: multi-component morning keeps every requested stop in the morning',()=>{
 const p=plan('Coffee, a museum and an easy walk in Kelowna this morning, back by noon.');assert.equal(p.kind,'itinerary');assert.ok(p.itinerary.stops.filter(s=>s.venue).every(s=>s.daypart==='morning'));
});
test('Customer time scope: dinner and a noon deadline are a clear conflict',()=>{
 assert.throws(()=>plan('Plan coffee and dinner in Kelowna, back by noon.'),e=>e.code==='TRIP_CONFLICT');
});
test('Customer time scope: an explicit afternoon return time is retained accurately',()=>{
 const x=interpret('Coffee and a museum in Kelowna, finish by 3:30 pm.');assert.equal(x.requirements.items.find(i=>i.kind==='deadline').value,930);
});
test('Customer time scope: a cafe opening after the return deadline is not scheduled',()=>{
 const x=interpret('Plan coffee only in Kelowna, finish by 3:30 pm.');
 const late=facts.filter(v=>v.type==='cafe').map(v=>({...v,_hours:undefined,hours:JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['16:00','20:00']]])))}));
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:late,labels,tripDate:'2026-10-17'});assert.equal(stops(p).length,0);
});
test('Customer time scope: an event starting after the return deadline is not scheduled',()=>{
 const p=plan('Plan coffee and an event in Kelowna, finish by 3:30 pm.');assert.equal(p.events.length,0);assert.ok(p.requirementResults.some(i=>i.kind==='event'&&i.status==='unmet'));
});

test('Customer walking: no car does not negate an explicitly requested easy walk',()=>{
 const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk. We have no car and want to walk between stops.');
 assert.ok(!x.requirements.items.some(i=>i.kind==='excluded_kind'&&['walk','easy_walk'].includes(i.value)));
 assert.ok(x.requirements.items.some(i=>i.kind==='transport'&&i.value==='walking'));
});
test('Customer walking: walking between stops is transport rather than an extra activity',()=>{
 const x=interpret('Plan a walkable afternoon in Kelowna with coffee and a museum. We want to walk between stops.');
 assert.ok(!x.requirements.items.some(i=>i.kind==='venue_kind'&&i.value==='walk'));
});
test('Customer walking: chooses a nearby compatible pair instead of an isolated top cafe',()=>{
 const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk. We have no car and want to walk between stops.');
 const local=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:49.88,lng:-119.49,rating:3}));
 const isolated={...local[0],id:70,name:'Isolated Top Cafe',rating:5,lat:50.0};
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:[...local,isolated],labels,tripDate:'2026-10-17'});
 assert.deepEqual(stops(p).map(v=>v.id).sort((a,b)=>a-b),[1,2]);
 assert.equal(p.requirementResults.find(i=>i.kind==='transport').status,'unverified');
});
test('Customer walking: distant and unknown-location stops cannot be presented as nearby',()=>{
 const x=interpret('Plan a morning in Kelowna with coffee and an easy walk. No car.');
 const distant=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:v.id===1?49.88:50.1,lng:-119.49}));
 for(const fs of [distant,distant.map(v=>v.id===2?{...v,lat:null,lng:null}:v)]){
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});
 assert.ok(!stops(p).some(v=>v.id===2));assert.ok(p.warnings.some(w=>/nearby|walking|car.free/i.test(w)));
 }
});


test('Customer walking: supported no-car request is not also reported as unsupported',()=>{
 const x=interpret('Coffee and an easy walk in Kelowna. No car.');
 const fs=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:49.88,lng:-119.49}));
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});
 assert.ok(!p.unsupported.includes('no car'));assert.ok(!p.understood?.notUsed?.includes('no car'));
});
test('Customer walking: common car-free wording keeps explicitly requested activities',()=>{
 for(const phrase of ['without a car','car-free','on foot','walkable','walking between stops']){
  const x=interpret('Coffee and an easy walk in Kelowna, '+phrase+'.');
  assert.ok(x.requirements.items.some(i=>i.kind==='transport'),phrase);
  assert.ok(!x.requirements.items.some(i=>i.kind==='excluded_kind'),phrase);
 }
});

test('Customer walking: multi-day plans leave distant activities unfilled',()=>{
 const x=interpret('Plan 2 days in Kelowna with coffee and an easy walk. No car.');
 const fs=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:v.id===1?49.88:50.1,lng:-119.49}));
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});
 assert.equal(p.days.length,2);
 for(const day of p.days)assert.ok(day.stops.filter(s=>s.venue).length<=1);
 assert.equal(p.requirementResults.find(i=>i.kind==='transport').status,'unverified');
});

test('Customer walking: chronological ordering cannot create a distant dinner transfer',()=>{
 const x=interpret('Dinner, coffee and a museum in Kelowna. No car.');
 const fs=facts.filter(v=>[1,4,5].includes(v.id)).map(v=>({...v,lat:49.88+({1:1,4:2,5:0}[v.id])*0.01,lng:-119.49}));
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});
 const selected=stops(p).map(v=>fs.find(f=>f.id===v.id));
 for(let k=1;k<selected.length;k++)assert.ok(Math.abs(selected[k].lat-selected[k-1].lat)<0.014);
 assert.ok(p.warnings.some(w=>/nearby/.test(w)));assert.ok(!stops(p).some(v=>v.id===5));
});
test('Customer walking: alternatives fit the actual selected next stop',()=>{
 const x=interpret('Coffee and an easy walk in Kelowna. No car.');
 const fs=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:49.88,lng:-119.49}));
 fs.push(...fs.map(v=>({...v,id:v.id+70,lat:49.91,rating:3})));
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});
 assert.ok(!p.itinerary.stops[0].alternates.some(a=>a.venue.id>=70));
});
test('Customer walking: a nearby earlier stop preserves a feasible locked museum',()=>{
 const x=interpret('Plan 2 days in Kelowna with coffee and a museum. No car.');
 const fs=facts.filter(v=>[1,4].includes(v.id)).map(v=>({...v,lat:49.88,lng:-119.49,rating:3}));
 fs.push({...fs[0],id:70,lat:50.0,rating:5});
 for(const pace of ['balanced','packed']) {
  const p=tp.planTrip({...x,intent:{...x.intent,pace},trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17',pinned:{'1-afternoon':4}});
  assert.equal(p.days[0].stops.find(s=>s.daypart==='morning').venue.id,1,pace);
  assert.equal(p.days[0].stops.find(s=>s.daypart==='afternoon').venue.id,4,pace);
 }
});

test('Customer dates: named inclusive date range sets start and duration',()=>{
 const x=interpret('Plan a family weekend in Kelowna on October 17 and 18, 2026, with museums and easy food.');
 assert.equal(x.requirements.startDate,'2026-10-17');assert.equal(x.requirements.items.find(i=>i.kind==='days').value,2);
});
test('Customer dates: ordinal and day-first date ranges are understood',()=>{
 for(const date of ['October 17th–18th, 2026','17 to 18 October 2026','October 17 to October 18, 2026']){
  const x=interpret('Plan a trip in Kelowna on '+date+' with museums.');
  assert.equal(x.requirements.startDate,'2026-10-17',date);assert.equal(x.requirements.items.find(i=>i.kind==='days').value,2,date);
 }
});
test('Customer dates: invalid named calendar dates fail rather than silently choosing another day',()=>{
 const x=interpret('Plan a day in Kelowna on February 30, 2026 with coffee.');
 assert.ok(x.requirements.conflicts.some(c=>/calendar date/i.test(c)));
 assert.throws(()=>tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts,labels}),e=>e.code==='TRIP_CONFLICT');
});
test('Customer dates: conflicting trip length and inclusive range fails clearly',()=>{
 const x=interpret('Plan 3 days in Kelowna from October 17 to 18, 2026 with museums.');
 assert.throws(()=>tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts,labels}),e=>e.code==='TRIP_CONFLICT');
});
test('Customer dates: single-day hours use requested date rather than current weekday',()=>{
 const x=interpret('Plan an afternoon in Kelowna on 2026-10-18 with coffee and a museum.');
 const fs=facts.filter(v=>[1,4].includes(v.id)).map(v=>({...v,_hours:undefined,hours:JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,v.id===4&&day==='sun'?null:[['09:00','17:00']]])))}));
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,startWeekday:'mon',tripDate:'2026-10-12'});
 assert.ok(!stops(p).some(v=>v.id===4));assert.ok(p.requirementResults.some(i=>i.value==='museum'&&i.status==='unmet'));
});

test('Customer dates: omitted year chooses the next occurrence using the supplied local date',()=>{
 const a=r.tripCalendar('October 17–18','2026-10-12');assert.equal(a.startDate,'2026-10-17');assert.equal(a.days,2);
 const b=r.tripCalendar('October 1','2026-10-12');assert.equal(b.startDate,'2027-10-01');
});
test('Customer dates: valid cross-month and leap-day dates stay exact',()=>{
 assert.equal(r.tripCalendar('October 31 to November 1, 2026').days,2);
 assert.equal(r.tripCalendar('February 29, 2028').startDate,'2028-02-29');
 assert.ok(r.tripCalendar('February 29, 2026').conflict);
});
test('Customer dates: reversed and overlong ranges cannot be silently planned',()=>{
 for(const text of ['October 18–17, 2026','October 1–20, 2026'])assert.ok(r.tripCalendar(text).conflict,text);
});

test('Customer dates: French du/au range preserves both endpoints through translation',()=>{
 const text=require('../trip-planner-fr').tripPlannerText('Planifie un week-end à Kelowna du 17 au 18 octobre 2026 avec un musée et un café.',taxonomy);
 const x=interpret(text);assert.equal(x.requirements.startDate,'2026-10-17');assert.equal(x.requirements.items.find(i=>i.kind==='days').value,2);
});

test('Customer dates: a weekday contradicting its named calendar date is explained',()=>{
 const x=interpret('Plan an afternoon in Kelowna on Saturday October 18, 2026 with coffee.');
 assert.ok(x.requirements.conflicts.some(c=>/calendar date.*weekday/.test(c)));
 assert.throws(()=>tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts,labels}),e=>e.code==='TRIP_CONFLICT');
});

test('Customer dates: fully specified endpoints preserve both years and enforce limits',()=>{
 for(const text of ['October 17, 2026 to October 18, 2026','17 October 2026 to 18 October 2026']) {
  const c=r.tripCalendar(text);assert.equal(c.startDate,'2026-10-17');assert.equal(c.endDate,'2026-10-18');assert.equal(c.days,2);
 }
 assert.equal(r.tripCalendar('December 31, 2026 to January 1, 2027').days,2);
 assert.ok(r.tripCalendar('October 1, 2026 to October 20, 2026').conflict);
});

test('Customer coffee: explicit coffee excludes higher-rated dessert and tea-only cafes',()=>{
 const x=interpret('Coffee and an easy walk in Kelowna, no car, no dinner.');
 const fs=[...facts,{...facts[0],id:50,name:'Ice Cream Lab',textName:'ice cream lab',description:'Ice cream and desserts.',textDesc:'ice cream and desserts',plannerDescription:'Ice cream and desserts.',rating:5},{...facts[0],id:51,name:'Tea House',textName:'tea house',description:'Loose leaf tea.',textDesc:'loose leaf tea',plannerDescription:'Loose leaf tea.',rating:5}];
 for(let seed=0;seed<5;seed++){
  const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,seed,tripDate:'2026-10-17'});
  assert.ok(stops(p).filter(v=>v.type==='cafe').every(v=>[1,3].includes(v.id)));
 }
});
test('Customer coffee: no evidence yields an unmet request rather than a dessert substitute',()=>{
 const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee only.');
 const fs=[{...facts[0],id:50,name:'Ice Cream Lab',textName:'ice cream lab',description:'Ice cream and desserts.',textDesc:'ice cream and desserts',plannerDescription:'Ice cream and desserts.'}];
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});
 assert.equal(stops(p).length,0);assert.ok(p.requirementResults.some(i=>i.status==='unmet'));
});
test('Customer coffee: a general cafe request still accepts a dessert cafe',()=>{
 const x=interpret('Plan a 2-hour afternoon in Kelowna with a cafe only.');
 const fs=[{...facts[0],id:50,name:'Dessert Cafe',textName:'dessert cafe',description:'Desserts.',textDesc:'desserts',plannerDescription:'Desserts.'}];
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:fs,labels,tripDate:'2026-10-17'});assert.equal(stops(p)[0]?.id,50);
});

test('Customer coffee: espresso evidence qualifies while an explicit no-coffee statement does not',()=>{
 const req=interpret('Coffee in Kelowna.').requirements.items.find(i=>i.servesCoffee);
 assert.ok(req);
 assert.ok(r.matches({...facts[0],name:'Dessert Counter',textName:'dessert counter',description:'Espresso and pastries.',plannerDescription:'Espresso and pastries.',textDesc:'espresso and pastries'},req));
 assert.equal(r.matches({...facts[0],description:'Does not serve coffee.',plannerDescription:'Does not serve coffee.',textDesc:'does not serve coffee'},req),false);
});
test('Customer coffee: French coffee requests carry the same evidence constraint',()=>{
 const text=require('../trip-planner-fr').tripPlannerText('Un café et une promenade facile à Kelowna.',taxonomy);
 assert.ok(interpret(text).requirements.items.some(i=>i.servesCoffee));
});

test('Customer compatibility: three walking stops choose a complete chain despite rating and regeneration',()=>{
 const x=interpret('Coffee, a museum and an easy walk in Kelowna. No car.');
 x.requirements={...x.requirements,items:x.requirements.items.filter(i=>i.kind==='transport'),daypart:null,outingScope:null,onlyRequested:false};
 x.trip={multi:true,regions:['kelowna'],party:{},components:[{kind:'venue',types:['cafe'],phrase:'coffee',daypart:'morning'},{kind:'venue',types:['indoor'],plannerKinds:['museum'],phrase:'museum',daypart:'afternoon'},{kind:'venue',types:['outdoor'],plannerKinds:['easy_walk'],phrase:'easy walk',daypart:'evening'}]};
 const fs=[{...facts[0],id:80,lat:49.87,lng:-119.49,rating:5},{...facts[0],id:81,lat:49.89,lng:-119.49,rating:3},{...facts[3],id:82,lat:49.871,lng:-119.49,rating:5},{...facts[3],id:83,lat:49.899,lng:-119.49,rating:3},{...facts[1],id:84,lat:49.911,lng:-119.49}];
 for(let seed=0;seed<4;seed++){
 const p=tp.planTrip({...x,trip:x.trip,facts:fs,labels,seed,avoidIds:[81,83,84],tripDate:'2026-10-17'});
 assert.deepEqual(stops(p).map(v=>v.id).sort((a,b)=>a-b),[81,83,84]);
 }
});

test('Customer French transport: common car-free phrases preserve coffee and easy walk requests',()=>{
 const fr=require('../trip-planner-fr');
 for(const phrase of ['sans voiture','sans auto','à pied','nous n’avons pas de voiture','nous voulons marcher entre les arrêts','pas de conduite']){
  const text=fr.tripPlannerText('Planifie un après-midi à Kelowna avec un café et une promenade facile. '+phrase+'.',taxonomy);
  const x=interpret(text);assert.ok(x.requirements.items.some(i=>i.kind==='transport'&&i.value==='walking'),phrase);
  assert.ok(x.requirements.items.some(i=>i.kind==='venue_kind'&&i.value==='easy_walk'),phrase);
  assert.ok(!x.requirements.items.some(i=>i.kind==='excluded_kind'&&i.value==='easy_walk'),phrase);
 }
});
test('Customer French transport: nearby pair beats distant coffee and preserves transport on regeneration',()=>{
 const fr=require('../trip-planner-fr');const text=fr.tripPlannerText('Planifie un après-midi à Kelowna avec un café et une promenade facile. Sans voiture.',taxonomy);const x=interpret(text);
 const fs=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:49.88,lng:-119.49,rating:3}));fs.push({...fs[0],id:91,lat:50.1,rating:5});
 for(let seed=0;seed<4;seed++){
 const p=tp.planTrip({...x,trip:x.trip,facts:fs,labels,seed,avoidIds:[1,2],tripDate:'2026-10-18'});
 assert.deepEqual(stops(p).map(v=>v.id).sort((a,b)=>a-b),[1,2]);
 assert.equal(p.requirementResults.find(i=>i.kind==='transport')?.status,'unverified');
 }
});

test('Customer distribution: reserve the Sunday-open museum instead of using both on Saturday',()=>{
 const x=interpret('Plan 2 days in Kelowna starting 2026-10-17 with museums and easy food.');
 const hours=days=>JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d=>[d,days.includes(d)?[['10:00','17:00']]:null])));
 const fs=[{...facts[3],id:101,name:'Weekend Museum',hours:hours(['sat','sun']),_hours:undefined,rating:5},{...facts[3],id:102,name:'Saturday Museum',hours:hours(['sat']),_hours:undefined,rating:3},...facts.filter(v=>[5,6].includes(v.id))];
 for(let seed=0;seed<3;seed++){
 const p=tp.planTrip({...x,trip:null,facts:fs,labels,seed,tripDate:'2026-10-17'});
 assert.ok(p.days[0].stops.some(s=>s.venue?.id===102));assert.ok(p.days[1].stops.some(s=>s.venue?.id===101));
 }
});

test('Customer timing: nearby walking outing includes visits and transfer assumptions',()=>{
 const fs=facts.filter(v=>[1,2].includes(v.id)).map(v=>({...v,lat:v.id===1?49.88:49.89,lng:-119.49}));
 const x=interpret('Plan a 2-hour afternoon in Kelowna with coffee and an easy walk. No car.');
 const p=tp.planTrip({...x,trip:x.trip,facts:fs,labels,tripDate:'2026-10-18'});
 const timing=r.estimateTripTiming({plan:p,facts:fs,requirements:x.requirements});
 assert.equal(timing.length,1);assert.ok(timing[0].minMinutes>=60);assert.ok(timing[0].maxMinutes>timing[0].minMinutes);assert.equal(timing[0].complete,true);
 assert.match(p.requirementResults.find(i=>i.kind==='duration').reason,/estimate|estimated/i);
 assert.equal(p.requirementResults.find(i=>i.kind==='duration').status,'unverified');
});
test('Customer timing: an impossibly short museum outing is flagged without dropping the museum',()=>{
 const p=plan('Plan a 15-minute afternoon in Kelowna with a museum only.');
 assert.ok(stops(p).some(v=>v.id===4));assert.equal(p.requirementResults.find(i=>i.kind==='duration').status,'unmet');
});
test('Customer timing: unknown coordinates and event durations are not silently treated as zero',()=>{
 const p={kind:'itinerary',itinerary:{stops:[{venue:{id:1}},{venue:{id:2}},{kind:'event',event:{id:20}}]}};
 const a=r.estimateTripTiming({plan:p,facts,requirements:{items:[]}});assert.equal(a[0].complete,false);assert.ok(a[0].unknown.includes('transfer'));assert.ok(a[0].unknown.includes('event duration'));
});

test('Customer timing: recommendation options are not summed as a scheduled itinerary',()=>{
 assert.deepEqual(r.estimateTripTiming({plan:{kind:'recommendations',recommendations:facts.map(venue=>({venue}))},facts,requirements:{items:[]}}),[]);
});

test('Customer budget: offers a complete shorter option without silently dropping the original requests',()=>{
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49}));const x=interpret('Plan a 1-hour afternoon in Kelowna with coffee, a museum and dinner.');
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 assert.equal(stops(p).length,3);assert.ok(p.timeBudget.shorter);assert.ok(p.timeBudget.shorter.estimate.maxMinutes<=60);assert.ok(p.timeBudget.shorter.omitted.length>=2);
 const short=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17',budgetMode:'shorter'});
 assert.equal(stops(short).length,1);assert.ok(short.requirementResults.some(i=>i.status==='unmet'));assert.ok(short.warnings.some(w=>/left out/i.test(w)));
});
test('Customer budget: protects a named must-have and cannot pretend a 15-minute museum fits',()=>{
 const p=plan('Plan a 15-minute afternoon in Kelowna with a museum only.');assert.equal(p.timeBudget.shorter,null);assert.ok(p.timeBudget.extensionMinutes>=90);
});
test('Customer budget: unknown durations cannot become a supposedly fitting alternative',()=>{
 const x=interpret('Plan a 1-hour afternoon in Kelowna with coffee and an easy walk.');const p=tp.planTrip({...x,facts,labels,tripDate:'2026-10-17'});
 if(p.timeBudget?.shorter)assert.equal(p.timeBudget.shorter.estimate.complete,true);
});
test('Customer budget: named listing and locked stop survive shortening',()=>{
 const x=interpret('Plan a 90-minute afternoon in Kelowna with coffee, a museum and dinner.');
 x.requirements.items.push({id:'named',kind:'venue',value:4,strength:'must',sourceText:'Museum'});
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17',budgetMode:'shorter'});
 assert.deepEqual(stops(p).map(v=>v.id),[4]);assert.equal(p.timeBudget.shorter.estimate.maxMinutes,90);
 assert.throws(()=>tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17',pinned:{'1-afternoon':4},budgetMode:'shorter'}),/locked stop cannot be kept/);
});
test('Customer budget: French duration produces the same conservative option',()=>{
 const fr=require('../trip-planner-fr');const x=interpret(fr.tripPlannerText('Planifie 1 heure à Kelowna avec un café, un musée et un souper.',taxonomy));
 const p=tp.planTrip({...x,facts:facts.map(v=>({...v,lat:49.88,lng:-119.49})),labels,tripDate:'2026-10-17'});
 assert.equal(p.timeBudget.minutes,60);assert.ok(p.timeBudget.shorter.estimate.maxMinutes<=60);
});

test('Customer scheduling: actual start time includes waiting and rejects a visit past closing',()=>{
 const hours=JSON.stringify({sat:[['10:00','12:00']]});
 const fs=[{...facts[0],hours,_hours:undefined,lat:49.88,lng:-119.49},{...facts[3],hours:JSON.stringify({sat:[['10:00','11:00']]}),_hours:undefined,lat:49.88,lng:-119.49}];
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');
 assert.equal(x.requirements.startMinutes,540);
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 assert.ok(p.schedule.some(s=>s.venueId===1&&s.startMinutes===600&&s.waitMinutes===60));
 assert.ok(p.schedule.some(s=>s.venueId===4&&s.status==='unmet'));
});
test('Customer scheduling: compatible alternative fits later in the sequence',()=>{
 const h=end=>JSON.stringify({sat:[['09:00',end]]});
 const fs=[{...facts[0],hours:h('17:00'),_hours:undefined,lat:49.88,lng:-119.49},{...facts[3],hours:h('10:00'),_hours:undefined,lat:49.88,lng:-119.49,rating:5},{...facts[3],id:44,name:'Later Museum',hours:h('17:00'),_hours:undefined,lat:49.88,lng:-119.49,rating:3}];
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 assert.ok(stops(p).some(v=>v.id===44));assert.ok(!stops(p).some(v=>v.id===4));assert.ok(p.schedule.every(s=>s.status==='estimated'));
});
test('Customer scheduling: unknown hours stop a verified chronology claim',()=>{
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');
 const p=tp.planTrip({...x,facts,labels,tripDate:'2026-10-17'});
 assert.ok(p.schedule.every(s=>s.status!=='estimated'));assert.equal(p.schedule[0].status,'provisional');assert.equal(p.schedule[1].status,'unverified');
});
test('Customer scheduling: split hours wait until a complete visit can fit',()=>{
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');
 const fs=[{...facts[0],_hours:undefined,hours:JSON.stringify({sat:[['09:00','17:00']]}),lat:49.88,lng:-119.49},{...facts[3],_hours:undefined,hours:JSON.stringify({sat:[['09:00','10:30'],['12:00','17:00']]}),lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 assert.equal(p.schedule[1].startMinutes,720);assert.equal(p.schedule[1].endMinutes,810);assert.ok(p.schedule[1].waitMinutes>0);
});
test('Customer scheduling: no date cannot produce a falsely dated timeline',()=>{
 const x=interpret('Coffee, a museum in Kelowna starting at 9 am.');const p=tp.planTrip({...x,facts,labels});assert.equal(p.schedule,undefined);
});
test('Customer scheduling: shorter options recalculate their own opening wait',()=>{
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');
 const fs=[{...facts[0],_hours:undefined,hours:JSON.stringify({sat:[['09:00','17:00']]}),lat:49.88,lng:-119.49},{...facts[3],_hours:undefined,hours:JSON.stringify({sat:[['11:00','17:00']]}),lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17',budgetMode:'shorter'});
 assert.ok(p.timeBudget?.shorter);assert.deepEqual(stops(p).map(v=>v.id),[1]);assert.ok(p.timeBudget.shorter.estimate.maxMinutes<=180);
});
test('Customer pacing: flexible outings choose a later assumed start to reduce idle time',()=>{
 const x=interpret('Plan a day in Kelowna on October 17, 2026 with coffee, a museum and dinner.');
 const h=(a,b)=>JSON.stringify({sat:[[a,b]]});
 const fs=[{...facts[0],_hours:undefined,hours:h('09:00','17:00'),lat:49.88,lng:-119.49},{...facts[3],_hours:undefined,hours:h('10:00','17:00'),lat:49.88,lng:-119.49},{...facts[4],_hours:undefined,hours:h('17:00','22:00'),lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 assert.ok(p.schedule.every(s=>s.status==='estimated'));assert.ok(p.schedule.reduce((n,s)=>n+s.waitMinutes,0)<=60);assert.ok(p.schedule[0].startMinutes>540);assert.ok(p.notes.some(n=>/later assumed start/i.test(n)));
});
test('Customer pacing: explicit 9 am starts are preserved even when dinner creates a gap',()=>{
 const x=interpret('Plan a day in Kelowna on October 17, 2026 with coffee, a museum and dinner, starting at 9 am.');
 const h=(a,b)=>JSON.stringify({sat:[[a,b]]});const fs=[{...facts[0],_hours:undefined,hours:h('09:00','17:00'),lat:49.88,lng:-119.49},{...facts[3],_hours:undefined,hours:h('10:00','17:00'),lat:49.88,lng:-119.49},{...facts[4],_hours:undefined,hours:h('17:00','22:00'),lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});assert.equal(p.schedule[0].startMinutes,540);assert.ok(p.schedule.some(s=>s.waitMinutes>60));
});
test('Customer incomplete plans: a compatible venue with known hours restores the timeline',()=>{
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');
 const h=JSON.stringify({sat:[['09:00','17:00']]});
 const fs=[{...facts[0],_hours:undefined,hours:null,lat:49.88,lng:-119.49,rating:5},{...facts[0],id:51,name:'Known Hours Coffee',_hours:undefined,hours:h,lat:49.88,lng:-119.49,rating:1},{...facts[3],_hours:undefined,hours:h,lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});assert.ok(stops(p).some(v=>v.id===51));assert.ok(p.schedule.every(s=>s.status==='estimated'));
});
test('Customer incomplete plans: a named venue with unknown hours stays provisional',()=>{
 const x=interpret('Plan a 3-hour morning in Kelowna on October 17, 2026 with coffee and a museum, starting at 9 am.');x.requirements.items.push({id:'named-coffee',kind:'venue',value:1,strength:'must',sourceText:'Coffee'});
 const h=JSON.stringify({sat:[['09:00','17:00']]});const fs=[{...facts[0],_hours:undefined,hours:null,lat:49.88,lng:-119.49,rating:5},{...facts[0],id:51,_hours:undefined,hours:h,lat:49.88,lng:-119.49,rating:1},{...facts[3],_hours:undefined,hours:h,lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});assert.ok(stops(p).some(v=>v.id===1));assert.equal(p.schedule[0].status,'provisional');
});

function eventSchedule(time='7 pm',endTime,explicitStart=false,location,mealHours={}){
 const x=interpret('Plan a date night in Kelowna on October 18, 2026 with dinner and hockey.'+(explicitStart?' Starting at 6 pm.':''));
 const event={id:90,name:'Kelowna Rockets Hockey',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-18',endDate:'2026-10-18',time,endTime,location};
 const known=facts.map(v=>({...v,_hours:undefined,latitude:49.88,longitude:-119.49,lat:49.88,lng:-119.49,hours:JSON.stringify({sun:mealHours[v.id]||[['16:00','23:00']]})}));
 return tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts:known,labels,tripDate:'2026-10-18',events:[event],tripEvents:x.trip.components.map(c=>c.kind==='event'?[event]:null)});
}
test('Customer event timing: a listed game start stays fixed with unknown end explicit',()=>{
 const p=eventSchedule(),item=p.schedule.find(s=>s.eventId===90);
 assert.ok(item);assert.equal(item.startMinutes,1140);assert.equal(item.endMinutes,undefined);
 assert.match(r.selectedStops(p).find(s=>s.event)?.scheduleNote,/duration.*not listed/i);
});
test('Customer event timing: dinner ending after kickoff is flagged instead of claiming a fit',()=>{
 const p=eventSchedule('7 pm',undefined,true);assert.equal(p.schedule.find(s=>s.eventId===90)?.status,'unmet');
 assert.match(p.scheduleWarnings.join(' '),/preceding visit.*listed start/i);
});
test('Customer event timing: missing start stays unknown rather than becoming an estimated evening',()=>{
 const p=eventSchedule('');assert.equal(p.schedule.find(s=>s.eventId===90)?.status,'unverified');
 assert.equal(p.schedule.find(s=>s.eventId===90)?.startMinutes,undefined);
});
test('Customer event requirement: an unmatched hockey request is summarized without date and meal wording',()=>{
 const p=plan('Plan a date night in Kelowna on October 18, 2026 with dinner and hockey.');
 assert.ok(p.requirementResults.some(i=>i.kind==='event'&&i.status==='unmet'));
 assert.ok(p.warnings.some(w=>/Not met: hockey game — No matching event/.test(w)),p.warnings.join('\n'));
 assert.ok(!p.warnings.some(w=>/Not met: 2026 with dinner and hockey/.test(w)),p.warnings.join('\n'));
 assert.equal(p.warnings.filter(w=>/hockey game/i.test(w)).length,1,p.warnings.join('\n'));
});
test('Customer event timing: listed end is retained without inventing travel time',()=>{
 const p=eventSchedule('7 pm','21:30'),item=p.schedule.find(s=>s.eventId===90);
 assert.equal(item?.endMinutes,1290);assert.match(r.selectedStops(p).find(s=>s.event)?.scheduleNote,/travel time.*unverified/i);
});

test('Customer event timing: flexible dinner moves earlier to leave an arrival allowance',()=>{
 const p=eventSchedule(),meal=p.schedule.find(s=>s.venueId);
 assert.ok(meal.endMinutes<=1110);assert.equal(meal.startMinutes,1020);
 assert.match(r.selectedStops(p).find(s=>s.venue)?.scheduleNote,/30-minute arrival allowance/);
});

test('Customer event dinner: an earlier-opening alternative is selected when it fits before kickoff',()=>{
 const p=eventSchedule('6 pm',undefined,false,{lat:49.88,lng:-119.49},{5:[['15:00','23:00']]});
 const meal=p.schedule.find(s=>s.venueId);
 assert.equal(meal.venueId,5);assert.equal(meal.status,'estimated');
 assert.ok(meal.endMinutes+meal.transferMinutes+30<=p.schedule.find(s=>s.eventId===90).startMinutes);
 assert.match(r.selectedStops(p).find(s=>s.venue)?.scheduleNote,/arrival allowance/);
});

test('Customer event dinner: no feasible restaurant is marked unscheduled instead of recommended',()=>{
 const p=eventSchedule('6 pm',undefined,false,{lat:49.88,lng:-119.49}),mealStop=p.itinerary.stops.find(s=>/dinner/i.test(s.label));
 assert.ok(mealStop?.unscheduledMeal);assert.equal(mealStop.venue,undefined);
 assert.deepEqual(mealStop.alternates,[]);
 assert.ok(p.schedule.some(s=>s.notScheduledMeal&&s.status==='unmet'));
 assert.ok(p.requirementResults.some(r=>r.kind==='type'&&r.value==='restaurant'&&r.status==='unmet'));
 assert.match(p.experience.text,/Dinner is not scheduled/i);
});

test('Customer event conflict: summary does not recommend dinner before an impossible kickoff',()=>{
 const p=eventSchedule('6 pm',undefined,false,{lat:49.88,lng:-119.49});
 assert.match(p.experience.text,/not scheduled/i);
 assert.match(p.experience.text,/end time is not listed/i);
 assert.doesNotMatch(p.experience.text,/Start with a relaxed dinner/i);
});

test('Customer event travel: linked venue coordinates produce a transfer estimate',()=>{
 const p=eventSchedule('7 pm','21:30',false,{lat:49.88,lng:-119.49,venueId:77});
 const e=p.schedule.find(s=>s.eventId===90);assert.equal(e.status,'estimated');assert.equal(e.transferMinutes,5);
 assert.match(r.selectedStops(p).find(s=>s.event).scheduleNote,/estimated.*travel/i);
});
test('Customer event travel: invalid coordinates never become a verified journey',()=>{
 const p=eventSchedule('7 pm','21:30',false,{lat:999,lng:-119.49,venueId:77});
 assert.equal(p.schedule.find(s=>s.eventId===90).status,'unverified');
});
test('Customer event travel: travel allowance reduces the available time before kickoff',()=>{
 // Road model (2026-10-18): a 22 km drive moves dinner earlier than a game next door, and still arrives in time.
 const near=eventSchedule('7 pm','21:30',false,{lat:49.88,lng:-119.49,venueId:77}).schedule.find(s=>s.venueId);
 const p=eventSchedule('7 pm','21:30',false,{lat:50.08,lng:-119.49,venueId:77});
 const meal=p.schedule.find(s=>s.venueId),game=p.schedule.find(s=>s.eventId===90);
 assert.ok(meal.startMinutes<near.startMinutes,`${meal.startMinutes} vs ${near.startMinutes}`);
 assert.ok(meal.endMinutes+game.transferMinutes+30<=game.startMinutes);
});
test('Customer event travel: dinner after a timed event uses its end plus travel',()=>{
 const p=eventSchedule('5 pm','20:00',false,{lat:49.88,lng:-119.49,venueId:77});
 const dinner=p.schedule.find(s=>s.venueId);assert.equal(dinner.status,'estimated');assert.equal(dinner.startMinutes,1205);assert.equal(dinner.transferMinutes,5);
});
test('Customer event travel: missing end time prevents an invented after-event dinner time',()=>{
 const p=eventSchedule('5 pm',undefined,false,{lat:49.88,lng:-119.49,venueId:77});
 assert.equal(p.schedule.find(s=>s.venueId).status,'unverified');
});
test('Customer event travel: walking and coordinate bounds remain explicit',()=>{
 assert.equal(r.estimateTransfer({lat:49.88,lng:-119.49},{lat:49.88,lng:-119.49},true).mode,'walking');
 assert.equal(r.estimateTransfer({lat:null,lng:0},{lat:0,lng:0}),null);
 assert.equal(r.estimateTransfer({lat:0,lng:181},{lat:0,lng:0}),null);
});
test('Customer evening events: night-out wording is an evening request',()=>{
 for(const q of ['Plan a night in Penticton with dinner and live music.','Plan a night out in Kelowna with dinner and a concert.'])assert.equal(interpret(q).requirements.daypart,'evening');
});
test('Customer evening events: midnight does not replace an available evening show',()=>{
 const x=interpret('Plan a night in Penticton on October 14, 2026 with dinner and live music.');
 const ev=[{id:91,name:'Live Music at Midnight',region:'penticton',categories:['live-music'],startDate:'2026-10-14',endDate:'2026-10-14',time:'12 am'},{id:92,name:'Live Music Evening Show',region:'penticton',categories:['live-music'],startDate:'2026-10-14',endDate:'2026-10-14',time:'8 pm'}];
 const p=tp.planTrip({...x,trip:x.trip,facts:facts.map(v=>({...v,region:'penticton'})),labels,tripDate:'2026-10-14',tripEvents:x.trip.components.map(c=>c.kind==='event'?ev:null)});
 assert.equal(r.selectedStops(p).find(s=>s.event)?.event.id,92);
});
test('Customer evening events: midnight-only listing leaves the requested event missing',()=>{
 const x=interpret('Plan an evening in Kelowna on October 18, 2026 with dinner and live music.');
 const ev=[{id:91,name:'Live Music at Midnight',region:'kelowna',categories:['live-music'],startDate:'2026-10-18',endDate:'2026-10-18',time:'12 am'}];
 const p=tp.planTrip({...x,trip:x.trip,facts,labels,tripDate:'2026-10-18',tripEvents:x.trip.components.map(c=>c.kind==='event'?ev:null)});
 assert.ok(!r.selectedStops(p).some(s=>s.event));
});
test('Customer event periods: morning and afternoon starts are separate with unknown times disclosed',()=>{
 const ev=[{id:1,name:'Live Music',categories:['live-music'],time:'10 am'},{id:2,name:'Live Music',categories:['live-music'],time:'2 pm'},{id:3,name:'Live Music',categories:['live-music'],time:''}];
 assert.equal(tp.chooseTripEvent(ev,'live-music','afternoon',true).event.id,2);
 assert.equal(tp.chooseTripEvent(ev,'live-music','morning',true).event.id,1);
 assert.equal(tp.chooseTripEvent(ev,'live-music','evening',true).event.id,3);
});
test('Customer event periods: the legacy selector keeps its historical midnight behavior',()=>{
 const ev=[{id:1,name:'Live Music',categories:['live-music'],time:'12 am'}];
 assert.equal(tp.chooseTripEvent(ev,'live-music','evening').event.id,1);
});
function nearbyEventDinner(extra='',closedNearby=false){
 const text='Plan a night in Kelowna on October 18, 2026 with dinner and a concert. '+extra,t={...taxonomy,venues:[{id:6,name:'Luxury Dinner',type:'restaurant',region:'kelowna'}]};
 const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t}),x={intent,trip,requirements};
 const venueFacts=facts.filter(v=>v.type==='restaurant').map(v=>({...v,lat:v.id===5?49.88:50.02,lng:-119.49,_hours:undefined,hours:JSON.stringify({sun:closedNearby&&v.id===5?[]:[['16:00','23:00']]}),rating:v.id===5?4:5}));
 const event={id:93,name:'Live Music Concert',region:'kelowna',categories:['live-music'],startDate:'2026-10-18',endDate:'2026-10-18',time:'8 pm',endTime:'22:00',location:{venueId:77,lat:49.88,lng:-119.49}};
 return tp.planTrip({...x,trip:x.trip,facts:venueFacts,labels,tripDate:'2026-10-18',tripEvents:x.trip.components.map(c=>c.kind==='event'?[event]:null)});
}
test('Customer event dinner: nearby matching restaurant outranks distant higher-rated dining',()=>{
 const p=nearbyEventDinner();assert.equal(stops(p)[0].id,5);assert.match(JSON.stringify(r.selectedStops(p)[0].reasons),/travel.*event/i);
});
test('Customer event dinner: proximity cannot override a named restaurant',()=>{
 assert.equal(stops(nearbyEventDinner('Must include Luxury Dinner.'))[0].id,6);
});

test('Customer event dinner: a nearby closed restaurant cannot displace an open option',()=>{
 const p=nearbyEventDinner('',true);assert.ok(!stops(p).some(v=>v.id===5));
});
test('Customer occasion: date-night dinner and concert uses the occasion instead of reporting it unsupported',()=>{
 const x=interpret('Plan a date night in Kelowna on October 18, 2026 with dinner and a concert.');
 const event={id:95,name:'Live Music Concert',region:'kelowna',categories:['live-music'],startDate:'2026-10-18',endDate:'2026-10-18',time:'8 pm'};
 const p=tp.planTrip({...x,trip:x.trip,facts,labels,tripDate:'2026-10-18',tripEvents:x.trip.components.map(c=>c.kind==='event'?[event]:null)});
 assert.ok(!p.unsupported.some(s=>/date/i.test(s)));assert.ok(!p.understood?.unsupported?.some(s=>/date/i.test(s)));
 assert.ok(r.selectedStops(p).filter(s=>s.venue).some(s=>s.reasons.some(r=>/intimate|romantic|cozy/i.test(r.text))));
});
test('Customer occasion: expanded dinner components retain date night in the understood summary',()=>{
 const text='Plan a date night in Vernon on October 16, 2026 with dinner and a concert.';
 const calendar=r.tripCalendar(text,'2026-10-12'),intent=d.interpretDiscoveryQuery(calendar.cleanText,taxonomy),trip=d.interpretTripComponents(calendar.cleanText,taxonomy,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy,referenceDate:'2026-10-12'});
 const expanded=r.expandTripComponents(trip,requirements),understood=tp.buildUnderstood(intent,expanded,labels,{kind:'itinerary'});
 assert.equal(expanded.outingOccasion,'date_night');assert.equal(understood.occasion,'date night');assert.ok(!understood.notUsed.some(s=>/date/i.test(s)));
});
test('Customer occasion: no dinner or a multi-day trip does not claim an applied date-night dinner',()=>{
 for(const text of ['Plan a date night in Kelowna with a concert only.','Plan 3 days in Kelowna with dinner and a concert.']){
  const x=interpret(text),expanded=r.expandTripComponents(x.trip,x.requirements);
  assert.ok(!expanded.outingOccasion);
 }
});

test('Customer schedule: unknown museum hours keep later visits provisional rather than losing the timeline',()=>{
 const x=interpret('Coffee, a museum and dinner in Kelowna on October 17, 2026, starting at 9 am.');
 const fs=[facts[0],facts[3],facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:v.id===4?null:JSON.stringify({sat:[['08:00','23:00']]})}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 const museum=p.schedule.find(s=>s.venueId===4),dinner=p.schedule.find(s=>s.venueId===5);
 assert.ok(Number.isFinite(museum.startMinutes));assert.equal(museum.status,'provisional');assert.equal(dinner.status,'provisional');assert.ok(dinner.startMinutes>=museum.endMinutes);
 assert.match(r.selectedStops(p).find(s=>s.venue?.id===4).scheduleNote,/opening hours.*not verified/i);
});
test('Customer schedule: hiking without a listed duration uses a labelled three-hour allowance',()=>{
 const x=interpret('Coffee, a hike and dinner in Kelowna on October 17, 2026 starting at 9 am.');
 const h=JSON.stringify({sat:[['08:00','23:00']]});const fs=[facts[0],{...facts[1],plannerKinds:[],activities:['hiking']},facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:h}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'}),hike=p.schedule.find(s=>s.venueId===2);
 assert.equal(hike.status,'provisional');assert.equal(hike.endMinutes-hike.startMinutes,180);assert.match(r.selectedStops(p).find(s=>s.venue?.id===2).scheduleNote,/planning allowances/);
});
test('Customer pacing: an explicit early start offers a checked later departure without changing the plan',()=>{
 const x=interpret('Coffee, a museum and dinner in Kelowna on October 17, 2026 starting at 9 am.');
 const fs=[facts[0],facts[3],facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:JSON.stringify({sat:[[v.id===5?'18:00':'08:00','23:00']]})}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 assert.equal(p.schedule[0].startMinutes,540);assert.ok(p.laterDeparture?.startMinutes>540);assert.ok(p.laterDeparture.savedMinutes>=60);
 const later=tp.planTrip({...x,requirements:{...x.requirements,startMinutes:p.laterDeparture.startMinutes},facts:fs,labels,tripDate:'2026-10-17'});
 assert.deepEqual(later.schedule.map(s=>s.venueId),p.schedule.map(s=>s.venueId));assert.ok(later.schedule.every(s=>s.status==='estimated'));
 assert.ok(later.schedule.reduce((n,s)=>n+(s.waitMinutes||0),0)<p.schedule.reduce((n,s)=>n+(s.waitMinutes||0),0));
});
test('Customer hiking: a hike is not timed as a short walk at a mixed park',()=>{
 const v={...facts[1],activities:['hiking']};
 const timing=text=>{const x=interpret(text);return r.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:v.id}}]}},facts:[v],requirements:x.requirements})[0];};
 assert.equal(timing('A hike in Kelowna').maxMinutes,180);
 assert.equal(timing('A short easy walk in Kelowna').maxMinutes,60);
});
test('Customer hiking: challenging hike matching requires trail evidence rather than any park',()=>{
 assert.ok(r.inferPlannerKinds({type:'outdoor',name:'Ridge Trail',description:'A steep strenuous hiking trail.'}).includes('challenging_hike'));
 assert.ok(!r.inferPlannerKinds({type:'outdoor',name:'Lake Path',description:'A flat paved walking path near a challenging hike.'}).includes('challenging_hike'));
 const x=interpret('A challenging hike in Kelowna');assert.ok(x.requirements.items.some(i=>i.value==='challenging_hike'));
});
test('Customer walking: a dated short walk and coffee works without a relative date preset',()=>{
 const x=interpret('A short easy walk and coffee in Kelowna on October 16, 2026 starting at 9 am.');
 const trip=r.expandTripComponents(x.trip,x.requirements);
 const p=tp.planTrip({...x,trip,facts,labels,tripDate:'2026-10-12'});assert.ok(stops(p).length>0);
});
test('Customer daylight: date and coordinates produce seasonal local daylight, invalid inputs stay unknown',()=>{
 const winter=r.estimateDaylight('2026-12-15',{lat:49.88,lng:-119.49}),summer=r.estimateDaylight('2026-06-15',{lat:49.88,lng:-119.49});
 assert.ok(winter.sunriseMinutes>420&&winter.sunriseMinutes<540);assert.ok(winter.sunsetMinutes>930&&winter.sunsetMinutes<1080);assert.ok(summer.sunsetMinutes-summer.sunriseMinutes>winter.sunsetMinutes-winter.sunriseMinutes+300);
 assert.equal(r.estimateDaylight('2026-02-30',{lat:49.88,lng:-119.49}),null);assert.equal(r.estimateDaylight('2026-10-16',{}),null);
});
test('Customer daylight: a late hike is flagged without moving an explicit start',()=>{
 const x=interpret('A hike and dinner in Kelowna on December 15, 2026 starting at 3 pm.');
 const fs=[{...facts[1],activities:['hiking']},facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-12-15'}),hike=p.schedule.find(s=>s.venueId===2);
 assert.equal(hike.startMinutes,900);assert.equal(hike.daylight.status,'conflict');assert.match(p.warnings.join(' '),/daylight/i);assert.equal(p.laterDeparture,undefined);
});
test('Customer daylight: later-departure suggestions never move a hike beyond daylight',()=>{
 const x=interpret('Coffee, a hike and dinner in Kelowna on December 15, 2026 starting at 9 am.');
 const fs=[facts[0],{...facts[1],activities:['hiking']},facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-12-15'});
 assert.ok(p.laterDeparture);{const later=tp.planTrip({...x,requirements:{...x.requirements,startMinutes:p.laterDeparture.startMinutes},facts:fs,labels,tripDate:'2026-12-15'});assert.equal(later.schedule.find(s=>s.venueId===2).daylight.status,'estimated');assert.ok(p.laterDeparture.startMinutes<900);}
});
test('Customer daylight repair: a checked earlier departure fixes a late hike without changing stops',()=>{
 const x=interpret('A hike and dinner in Kelowna on October 16, 2026 starting at 4 pm.');
 const fs=[{...facts[1],activities:['hiking']},facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});
 assert.equal(p.schedule[0].startMinutes,960);assert.ok(p.earlierDeparture?.startMinutes<960);
 const repaired=tp.planTrip({...x,requirements:{...x.requirements,startMinutes:p.earlierDeparture.startMinutes},facts:fs,labels,tripDate:'2026-10-16'});
 assert.deepEqual(repaired.schedule.map(s=>s.venueId),p.schedule.map(s=>s.venueId));assert.equal(repaired.schedule[0].daylight.status,'estimated');assert.equal(repaired.earlierDeparture,undefined);
});
test('Customer daylight repair: no earlier option is offered when listed opening hours prevent it',()=>{
 const x=interpret('A hike and dinner in Kelowna on October 16, 2026 starting at 4 pm.');
 const fs=[{...facts[1],activities:['hiking'],hours:JSON.stringify({fri:[['16:00','22:00']]})},facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});
 assert.equal(p.schedule.find(s=>s.venueId===2).daylight.status,'conflict');assert.equal(p.earlierDeparture,undefined);
});
test('Customer multi-day repair: fixing one late hiking day leaves the other day schedule unchanged',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null,activities:v.id===2?['hiking']:v.activities}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});const repair=p.dayDepartureRepairs?.[0];assert.ok(repair);
 const fixed=tp.planTrip({...x,requirements:{...x.requirements,dayStartMinutes:{[repair.day]:repair.startMinutes}},facts:fs,labels,tripDate:'2026-10-16'});
 assert.deepEqual(fixed.schedule.filter(s=>s.day!==repair.day),p.schedule.filter(s=>s.day!==repair.day));
 assert.ok(fixed.schedule.filter(s=>s.day===repair.day&&s.daylight).every(s=>s.daylight.status==='estimated'));
 assert.deepEqual(r.selectedStops(fixed).map(s=>s.venue?.id),r.selectedStops(p).map(s=>s.venue?.id));
});
test('Customer meals: a late-start multi-day hike and dinner does not add a second full meal',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null,activities:v.id===2?['hiking']:v.activities}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});
 assert.ok(p.days.every(day=>day.stops.filter(s=>s.venue?.type==='restaurant').length===1));assert.ok(p.notes.some(n=>/optional afternoon meal/i.test(n)));
});
test('Customer meals: one relaxed dinner in a weekend is not repeated on every day',()=>{
 const x=interpret('A relaxed weekend in Kelowna with wineries and a relaxed dinner.');
 assert.equal(x.requirements.explicitMealCount,1);
 const p=tp.planTrip({...x,trip:x.trip.multi?x.trip:null,facts,labels,tripDate:'2026-10-17'});
 assert.equal(p.days.flatMap(day=>day.stops).filter(s=>s.venue?.type==='restaurant').length,1);
});
test('Customer meals: explicitly requested lunch and dinner remain in a late-start multi-day plan',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with lunch and dinner starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});assert.ok(p.days.some(day=>day.stops.filter(s=>s.venue?.type==='restaurant').length>=2));
});
test('Customer meals: a locked afternoon restaurant is preserved on a late-start day',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null,activities:v.id===2?['hiking']:v.activities}));
 const p=tp.planTrip({...x,pinned:{'1-afternoon':5,'1-evening':6},facts:fs,labels,tripDate:'2026-10-16'});
 assert.equal(p.days[0].stops.find(s=>s.daypart==='afternoon').venue.id,5);assert.equal(p.days[0].stops.find(s=>s.daypart==='evening').venue.id,6);
});

test('Customer geography: multi-day hikes consider the journey to dinner before choosing a remote first stop',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const hiking=(id,name,lat,rating)=>({...facts[1],id,name,lat,lng:-119.49,rating,activities:['hiking'],plannerKinds:['walk'],description:'A hiking trail.',textName:d.normalizeDiscoveryText(name),textDesc:'a hiking trail'});
 const fs=[hiking(20,'Remote Ridge Trail',50.25,5),hiking(21,'Town Ridge Trail',49.89,4),hiking(22,'Neighbourhood Trail',49.90,4),...facts.filter(v=>v.type==='restaurant').map(v=>({...v,lat:49.88,lng:-119.49}))];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});
 assert.ok(!stops(p).some(v=>v.id===20));assert.ok(p.days.every(day=>day.stops.filter(s=>s.venue?.type==='restaurant').length===1));
 assert.ok(p.schedule.filter(s=>s.transferMinutes).every(s=>s.transferMinutes<30));
});

test('Customer geography: a locked remote hike stays locked when closer trails exist',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:v.id===2?50.25:49.88,lng:-119.49,activities:v.id===2?['hiking']:v.activities}));
 const p=tp.planTrip({...x,pinned:{'1-morning':2},facts:fs,labels,tripDate:'2026-10-16'});
 assert.equal(p.days[0].stops.find(s=>s.daypart==='morning').venue.id,2);
 assert.ok(p.schedule.some(s=>s.transferMinutes>30));
});
test('Customer geography: closed restaurants cannot make a remote trail appear convenient',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const hiking=(id,lat,rating)=>({...facts[1],id,lat,lng:-119.49,rating,activities:['hiking'],plannerKinds:['walk']});
 const closed={...facts[4],id:30,name:'Closed Ridge Dinner',_hours:undefined,lat:50.25,lng:-119.49,rating:5,hours:JSON.stringify({fri:[['08:00','12:00']],sat:[['08:00','12:00']]})};
 const fs=[hiking(20,50.25,5),hiking(21,49.89,4),hiking(22,49.90,4),closed,...facts.filter(v=>v.type==='restaurant').map(v=>({...v,lat:49.88,lng:-119.49}))];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'});
 assert.ok(!stops(p).some(v=>v.id===20||v.id===30));
});

test('Customer listing timing: an explicit trail range replaces the generic hiking allowance',()=>{
 const v={...facts[1],activities:['hiking'],plannerDescription:undefined,description:'The Apex Trail is a moderate route, 45 minutes to an hour and a half.'};
 const x=interpret('A hike in Kelowna');
 const timing=r.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:v.id}}]}},facts:[v],requirements:x.requirements})[0];
 assert.equal(timing.minMinutes,45);assert.equal(timing.maxMinutes,90);
});
test('Customer listing timing: explicit park hours constrain a provisional hike, structured closed hours win',()=>{
 const x=interpret('A hike and dinner in Kelowna on October 16, 2026 starting at 4 pm.');
 const hike={...facts[1],activities:['hiking'],lat:49.88,lng:-119.49,_hours:undefined,hours:null,plannerDescription:undefined,description:'The park is open 6 a.m. to 10 p.m. The Apex Trail is a moderate route, 45 minutes to an hour and a half.'};
 const fs=[hike,{...facts[4],lat:49.88,lng:-119.49}];
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'}),item=p.schedule.find(s=>s.venueId===2);
 assert.equal(item.endMinutes-item.startMinutes,90);assert.equal(item.status,'provisional');assert.equal(item.daylight.status,'estimated');
 assert.match(r.selectedStops(p).find(s=>s.venue?.id===2).scheduleNote,/listing text/i);
 const closed=tp.planTrip({...x,facts:[{...hike,_hours:undefined,hours:JSON.stringify({fri:[]})},fs[1]],labels,tripDate:'2026-10-16'});
 assert.ok(!stops(closed).some(v=>v.id===2));
});
test('Customer listing timing: a nearby walk and seasonal vehicle hours do not become trail duration or park hours',()=>{
 const v={...facts[1],activities:['hiking'],plannerDescription:undefined,description:'The trail is a five-minute walk from the cafes. Vehicles may enter the park from noon to 8 p.m. in summer.'};
 const x=interpret('A hike in Kelowna');
 const t=r.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:v.id}}]}},facts:[v],requirements:x.requirements})[0];
 assert.equal(t.maxMinutes,180);
});

test('Customer listing timing: ambiguous route ranges and conditional park hours stay unknown',()=>{
 for(const description of ['In summer the park is open 6 am to 10 pm.','The park is open 6 am to 10 pm in June.','The park is open 6 am to 10 pm. The park is open 7 am to 8 pm.'])assert.equal(r.listedOutdoorTiming({...facts[1],plannerDescription:description}).hoursRange,null,description);
 const timing=r.listedOutdoorTiming({...facts[1],plannerDescription:'The Ridge Trail takes 45–90 minutes. The Summit Trail takes 120–180 minutes.'});assert.equal(timing.durationRange,null);
 assert.equal(r.listedOutdoorTiming({...facts[1],plannerDescription:'The Ridge Trail takes 45–90 minutes and the Summit Trail takes 120–180 minutes.'}).durationRange,null);
});

test('Customer listing timing: a hike that overruns text-derived park closing time is not timed as feasible',()=>{
 const x=interpret('A hike and dinner in Kelowna on October 16, 2026 starting at 4 pm.');
 const hike={...facts[1],activities:['hiking'],lat:49.88,lng:-119.49,_hours:undefined,hours:null,plannerDescription:'The park is open 6 am to 5 pm. The Ridge Trail takes 60–90 minutes.'};
 const p=tp.planTrip({...x,facts:[hike,{...facts[4],lat:49.88,lng:-119.49}],labels,tripDate:'2026-10-16'});
 assert.equal(p.schedule.find(s=>s.venueId===2).status,'unmet');assert.match(p.warnings.join(' '),/closing time/);
});

test('Customer daylight choice: an evidenced short walk can preserve the late start and the other day',()=>{
 const x=interpret('Plan 2 days in Kelowna from October 16, 2026 with a hike and dinner starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null,activities:v.id===2||v.id===8?['hiking']:v.activities}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-16'}),repair=p.shortWalkRepairs?.[0];assert.ok(repair);
 assert.equal(p.schedule.find(s=>s.venueId===repair.venueId).startMinutes,960);
 const fixed=tp.planTrip({...x,requirements:{...x.requirements,shortWalkVenueIds:[repair.venueId]},facts:fs,labels,tripDate:'2026-10-16'});
 const target=fixed.schedule.find(s=>s.venueId===repair.venueId);assert.equal(target.shortWalkSelected,true);assert.equal(target.startMinutes,960);assert.equal(target.endMinutes-target.startMinutes,60);assert.equal(target.daylight.status,'estimated');
 assert.deepEqual(fixed.schedule.filter(s=>s.day!==repair.day),p.schedule.filter(s=>s.day!==repair.day));assert.equal(fixed.shortWalkRepairs?.some(s=>s.venueId===repair.venueId)||false,false);
});
test('Customer daylight choice: challenging hikes cannot be silently shortened to easy walks',()=>{
 const x=interpret('Plan 2 days in Kelowna with a challenging hike and dinner from October 16, 2026 starting at 4 pm.');
 const fs=facts.map(v=>({...v,lat:49.88,lng:-119.49}));
 assert.throws(()=>tp.planTrip({...x,requirements:{...x.requirements,shortWalkVenueIds:[2]},facts:fs,labels,tripDate:'2026-10-16'}),e=>e.code==='TRIP_CONFLICT');
});

test('missing dated events offer only real same-region nearby occurrences without changing the plan',()=>{
 const plan={requirementResults:[{id:'h',kind:'event',value:'sports-recreation',eventKind:'hockey',status:'unmet'}],days:[]};
 const events=[
  {id:1,name:'Kelowna hockey',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-20',endDate:'2026-10-20',url:'/events/hockey'},
  {id:2,name:'Vernon hockey',region:'vernon',categories:['sports-recreation'],startDate:'2026-10-19',url:'/events/vernon'},
  {id:3,name:'Ice cream',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-19',url:'/events/ice'},
  {id:4,name:'Hockey during trip',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-17',url:'/events/inside'},
  {id:5,name:'Hockey far away',region:'kelowna',categories:['sports-recreation'],startDate:'2026-11-20',url:'/events/far'},
 ];
 const before=JSON.stringify(plan);
 const result=r.nearbyEventAlternatives({plan,events,from:'2026-10-16',to:'2026-10-18',today:'2026-10-12',regions:['kelowna'],suitsKind:tp.eventSuitsKind});
 assert.deepEqual(result.map(x=>x.id),[1]);assert.equal(result[0].startDate,'2026-10-20');assert.equal(JSON.stringify(plan),before);
});
test('nearby ongoing multi-day event suggests today rather than its past start date',()=>{
 const plan={requirementResults:[{id:'h',kind:'event',value:'any',status:'unmet'}]};
 const result=r.nearbyEventAlternatives({plan,events:[{id:1,name:'Month-long Festival',region:'kelowna',startDate:'2026-10-01',endDate:'2026-10-31',url:'/events/festival'}],from:'2026-11-01',to:'2026-11-01',today:'2026-10-13'});
 assert.equal(result[0].startDate,'2026-10-01');assert.equal(result[0].suggestedDate,'2026-10-13');
});
test('nearby event alternatives reject stale, undated and unsafe links, deduplicate and cap at three',()=>{
 const plan={requirementResults:[{id:'a',kind:'event',value:'any',status:'unmet'}]};
 const events=Array.from({length:6},(_,i)=>({id:i+1,name:'Event '+i,region:'kelowna',startDate:'2026-10-'+(19+i),url:'/events/'+i}));
 events.push(events[0],{id:9,name:'No date',url:'/events/9'},{id:10,name:'Unsafe',startDate:'2026-10-19',url:'//evil.example'},{id:11,name:'Expired',startDate:'2026-10-11',endDate:'2026-10-11',url:'/events/11'});
 assert.deepEqual(r.nearbyEventAlternatives({plan,events,from:'2026-10-16',to:'2026-10-18',today:'2026-10-12',regions:['kelowna']}).map(x=>x.id),[1,2,3]);
 assert.deepEqual(r.nearbyEventAlternatives({plan:{requirementResults:[]},events,from:'2026-10-16',to:'2026-10-18',today:'2026-10-12'}),[]);
});

test('Sports category: named skate park and disc golf use actual sports listings',()=>{
 const sportsFacts=[{id:801,name:'Armstrong Skate Park',region:'armstrong',type:'sport',description:'A public skate park with ramps.'},{id:802,name:'Chip Trail Disc Golf',region:'armstrong',type:'sport',description:'A disc golf course.'},{id:803,name:'Dinner',region:'armstrong',type:'restaurant',description:'Dinner.'}].map(v=>({...v,url:'/armstrong/'+v.id,textName:d.normalizeDiscoveryText(v.name),textDesc:d.normalizeDiscoveryText(v.description),plannerDescription:v.description,features:{},plannerKinds:r.inferPlannerKinds(v),activities:[],collections:[],fdTypes:[],rating:4,hours:null}));
 const t={...taxonomy,regions:['armstrong'],regionLabels:{armstrong:'Armstrong'},types:[...taxonomy.types,'sport'],venues:sportsFacts};
 for(const text of ['Plan a day in Armstrong with Armstrong Skate Park and dinner.','Plan a day in Armstrong with disc golf and dinner.']){
  const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
  const p=tp.planTrip({intent,trip,requirements,facts:sportsFacts,labels:{...labels,regions:t.regionLabels,types:{...labels.types,sport:{singular:'Sports venue',plural:'Sports venues'}}},seed:0,tripDate:'2026-10-17',clock:{weekday:'sat',minutes:600}});
  const id=text.includes('Skate')?801:802;
  assert.ok(r.selectedStops(p).some(s=>s.venue?.id===id),JSON.stringify(p.requirementResults));
  assert.ok(!p.requirementResults.some(i=>i.kind==='venue_kind'&&i.value==='park'||i.kind==='type'&&i.value==='golf'));
 }
});

test('Sports phrases do not hide a separate park or regular golf request',()=>{
 const t={...taxonomy,types:[...taxonomy.types,'sport']};
 const requirements=r.extractTripRequirements({text:'Plan a day with a skate park, a park, disc golf and regular golf.',taxonomy:t});
 for(const value of ['skatepark','park','disc_golf','golf'])assert.ok(requirements.items.some(i=>i.value===value));
});

test('Casual sports outings: BMX and dinner produce one requested activity and one meal',()=>{
 const f=[{id:901,name:'Kelowna BMX Track',type:'sport',description:'A BMX race track. Practice and race nights run through the riding season.'},{id:902,name:'Skate Park',type:'sport',description:'A skate park.'},{id:903,name:'Dinner One',type:'restaurant',description:'Dinner.'},{id:904,name:'Dinner Two',type:'restaurant',description:'Dinner.'}].map(v=>({...v,region:'kelowna',url:'/kelowna/'+v.id,textName:d.normalizeDiscoveryText(v.name),textDesc:d.normalizeDiscoveryText(v.description),plannerDescription:v.description,plannerKinds:r.inferPlannerKinds(v),features:{},activities:[],collections:[],fdTypes:[],rating:4,hours:JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[['09:00','23:00']]])))}));
 const t={...taxonomy,types:[...taxonomy.types,'sport'],venues:f};
 for(const text of ['Plan a day in Kelowna with BMX and dinner.','BMX and dinner in Kelowna.']){
  const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
  const p=tp.planTrip({intent,trip:trip.multi?trip:null,requirements,facts:f,labels,tripDate:'2026-10-17'});
  const selected=r.selectedStops(p).filter(s=>s.venue);
  assert.deepEqual(selected.map(s=>s.venue.type),['sport','restaurant']);assert.equal(selected[0].venue.id,901);
  assert.ok(selected[0].caveats.some(n=>n.includes('Practice and race nights run through the riding season.')));
 } const text='Plan a day in Kelowna with BMX, lunch and dinner.';
 const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 const p=tp.planTrip({intent,trip:trip.multi?trip:null,requirements,facts:f,labels,tripDate:'2026-10-17'});
 assert.deepEqual(r.selectedStops(p).filter(s=>s.venue).map(s=>s.venue.type),['sport','restaurant','restaurant'],JSON.stringify(p));
});

test('Listing access notes preserve stated restrictions without inventing availability',()=>{
 const description='A BMX track in the park. The club runs practice and race nights through the riding season. New riders can try the track at the club’s open houses. Nearby cafés serve dinner.';
 const notes=r.listedAccessNotes({type:'sport',plannerDescription:description});
 assert.equal(notes.length,2);assert.ok(notes[0].includes('The club runs practice and race nights through the riding season.'));assert.ok(notes[1].includes('open houses.'));
 assert.ok(notes.every(n=>n.endsWith('Confirm access and scheduling with the operator before visiting.')));
 assert.deepEqual(r.listedAccessNotes({type:'restaurant',plannerDescription:'Reservations required.'}),[]);
 assert.deepEqual(r.listedAccessNotes({type:'sport',plannerDescription:'A public skate park with ramps and a lake view.'}),[]);
});
test('Listing access notes expose tour bookings and school-day restrictions as source text',()=>{
 for(const [type,text]of [['tour','Advance booking is required. Tours depart at 9 a.m. on Saturdays.'],['sport','Play is after 4 p.m. on school days and dawn to dusk otherwise.']]){
  const notes=r.listedAccessNotes({type,plannerDescription:text});assert.ok(notes.length);assert.ok(notes.join(' ').includes(type==='tour'?'Advance booking is required.':text));
 }
});

test('Conditional school-day access conflicts are flagged conservatively for weekday mornings',()=>{
 const v={type:'sport',plannerDescription:'Play is after 4 p.m. on school days and dawn to dusk otherwise.'};
 assert.equal(r.listedAccessConflict(v,{daypart:'morning'},1,'2026-10-14').afterMinutes,960);
 assert.equal(r.listedAccessConflict(v,{daypart:'morning'},1,'2026-10-17'),null);
 assert.equal(r.listedAccessConflict(v,{daypart:'evening'},1,'2026-10-14'),null);
 assert.equal(r.listedAccessConflict(v,{daypart:'morning'},1,null),null);
 assert.equal(r.listedAccessConflict({...v,plannerDescription:'The school is nearby. A public course.'},{daypart:'morning'},1,'2026-10-14'),null);
});
test('Restricted named sports venue is left unfilled and alternatives never silently replace it',()=>{
 const f=[{id:951,name:'Restricted Disc Golf',type:'sport',description:'Play is after 4 p.m. on school days and dawn to dusk otherwise.'},{id:952,name:'Public Disc Golf',type:'sport',description:'A public disc golf course.'}].map(v=>({...v,region:'armstrong',url:'/armstrong/sports/'+v.id,plannerDescription:v.description,plannerKinds:r.inferPlannerKinds(v),textName:d.normalizeDiscoveryText(v.name),textDesc:d.normalizeDiscoveryText(v.description),features:{},activities:[],collections:[],fdTypes:[],hours:null}));
 const t={...taxonomy,types:[...taxonomy.types,'sport'],regions:['armstrong'],regionLabels:{armstrong:'Armstrong'},venues:f};
 const text='Plan a morning in Armstrong on October 14, 2026 with Restricted Disc Golf only.';
 const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 const p=tp.planTrip({intent,trip:trip.multi?trip:null,requirements,facts:f,labels,tripDate:'2026-10-14'});
 assert.ok(!r.selectedStops(p).some(s=>s.venue?.id===951));assert.ok(p.requirementResults.some(i=>i.kind==='venue'&&i.status==='unmet'));
 assert.equal(p.accessConflicts[0].name,'Restricted Disc Golf');assert.ok(p.accessConflicts[0].alternatives.some(v=>v.id===952));
 assert.ok(!r.selectedStops(p).some(s=>s.venue?.id===952),'a named request is not silently substituted');
});

 test('Sports timing uses labelled allowances and guards outdoor daylight eligibility',()=>{
 const v={id:991,name:'Chip Trail Disc Golf',type:'sport',plannerDescription:'A free nine-hole disc golf course. A round takes under an hour.',plannerKinds:['disc_golf']};
 const timing=r.estimateTripTiming({plan:{kind:'itinerary',itinerary:{stops:[{venue:{id:991}}]}},facts:[v],requirements:{items:[]}})[0];
 assert.equal(timing.complete,true);assert.equal(timing.visits[0].maxMinutes,60);assert.equal(timing.visits[0].durationSource,'planning allowance');
 assert.equal(r.isOutdoorSport(v),true);
 assert.equal(r.isOutdoorSport({...v,plannerDescription:'An indoor disc golf course.'}),false);
 assert.equal(r.isOutdoorSport({type:'sport',name:'Tennis',plannerKinds:['tennis'],plannerDescription:'Indoor tennis courts.'}),false);
 assert.equal(r.isOutdoorSport({type:'sport',name:'Tennis',plannerKinds:['tennis'],plannerDescription:'Outdoor tennis courts.'}),true);
 });

test('Sports schedule warns after sunset without silently moving an explicit start',()=>{
 const v={id:992,name:'Chip Trail Disc Golf',type:'sport',region:'armstrong',url:'/armstrong/sports/chip-trail',plannerDescription:'A nine-hole disc golf course. Play is dawn to dusk.',plannerKinds:['disc_golf'],textName:'chip trail disc golf',textDesc:'disc golf course',lat:50.43782,lng:-119.21,features:{},activities:[],collections:[],fdTypes:[],hours:null};
 const t={...taxonomy,types:[...taxonomy.types,'sport'],regions:['armstrong'],regionLabels:{armstrong:'Armstrong'},venues:[v]};
 const text='Plan an evening in Armstrong on October 17, 2026 with Chip Trail Disc Golf only. Start at 6 pm.';
 const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 const p=tp.planTrip({intent,trip:trip.multi?trip:null,requirements,facts:[v],labels,tripDate:'2026-10-17'});
 const row=p.schedule.find(s=>s.venueId===992);assert.equal(row.startMinutes,1080);assert.equal(row.endMinutes,1140);assert.equal(row.status,'provisional');assert.equal(row.daylight.status,'conflict');
 assert.equal(row.daylight.marginMinutes,30);
 assert.ok(p.earlierDeparture);
 const repaired=tp.planTrip({intent,trip:trip.multi?trip:null,requirements:{...requirements,startMinutes:p.earlierDeparture.startMinutes},facts:[v],labels,tripDate:'2026-10-17'});
 assert.equal(repaired.schedule[0].daylight.status,'estimated');
 assert.ok(repaired.schedule[0].endMinutes<=repaired.schedule[0].daylight.sunsetMinutes-30);
 assert.match(r.selectedStops(p)[0].scheduleNote,/planning allowance, not a verified session/);
 assert.ok(!r.selectedStops(p)[0].scheduleNote.includes('Trail duration'));
});

test('Named sports venues do not introduce activities or leftover name words',()=>{
 const t={...taxonomy,types:[...taxonomy.types,'sport'],venues:[{id:993,name:'Chip Trail Disc Golf',type:'sport'}]};
 const text='Plan a morning in Kelowna with Chip Trail Disc Golf only.';
 const clean=r.sportsVenueInterpretationText(text,t),intent=d.interpretDiscoveryQuery(clean,t),trip=d.interpretTripComponents(clean,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 assert.ok(!intent.activities.includes('hiking'));assert.ok(!requirements.items.some(i=>i.value==='walk'||i.value==='hiking'));assert.ok(requirements.items.some(i=>i.kind==='venue'&&i.value===993));assert.ok(requirements.items.some(i=>i.value==='disc_golf'));
 assert.ok(r.consumedTerms(requirements).has('chip'));
 const explicit=r.sportsVenueInterpretationText(text+' Include a hike.',t);assert.ok(d.interpretDiscoveryQuery(explicit,t).activities.includes('hiking'));
 assert.equal(r.sportsVenueInterpretationText('Coffee and a hike in Kelowna',t),'Coffee and a hike in Kelowna');
 assert.equal(r.sportsVenueInterpretationText('Chip Trail Disc Golf',{...t,venues:[...t.venues,{id:994,name:'Chip Trail Disc Golf',type:'sport'}]}),'Chip Trail Disc Golf');
});

test('French partial-day named sports outings match English without extra meals',()=>{
 const fr=require('../trip-planner-fr');
 const v={id:995,name:'Chip Trail Disc Golf',type:'sport',region:'armstrong',url:'/armstrong/sports/chip-trail',plannerDescription:'A nine-hole disc golf course.',plannerKinds:['disc_golf'],textName:'chip trail disc golf',textDesc:'disc golf course',lat:50.43,lng:-119.21,features:{},activities:[],collections:[],fdTypes:[],hours:null};
 const t={...taxonomy,types:[...taxonomy.types,'sport'],regions:['armstrong'],regionLabels:{armstrong:'Armstrong'},venues:[v]};
 for(const [part,expected]of [['matinée','morning'],['après-midi','afternoon']]){
 const text=fr.tripPlannerText(`Planifie une ${part} à Armstrong le 17 octobre 2026 avec Chip Trail Disc Golf seulement.`,t);
 const clean=r.sportsVenueInterpretationText(text,t),intent=d.interpretDiscoveryQuery(clean,t),trip=d.interpretTripComponents(clean,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 assert.equal(requirements.daypart,expected);assert.ok(!intent.textTerms.includes('matinee'));
 const p=tp.planTrip({intent,trip:r.expandTripComponents(trip.multi?trip:{...trip,regions:intent.regions},requirements),requirements,facts:[v],labels,tripDate:'2026-10-17'});
 assert.deepEqual(r.selectedStops(p).filter(s=>s.venue).map(s=>s.venue.id),[995]);
 }
});

test('Sparse multi-day activity plans do not pad an empty activity day with optional lunch',()=>{
 const f=[{id:996,name:'Only Disc Golf',type:'sport',plannerKinds:['disc_golf']},...Array.from({length:5},(_,i)=>({id:1000+i,name:'Restaurant '+i,type:'restaurant',plannerKinds:[]}))].map(v=>({...v,region:'kelowna',url:'/kelowna/'+v.id,textName:d.normalizeDiscoveryText(v.name),textDesc:'',plannerDescription:'',features:{},activities:[],collections:[],fdTypes:[],hours:null}));
 const t={...taxonomy,types:[...taxonomy.types,'sport'],venues:f};
 const text='Plan 2 days in Kelowna with disc golf and dinner.';
 const intent=d.interpretDiscoveryQuery(text,t),trip=d.interpretTripComponents(text,t,intent),requirements=r.extractTripRequirements({text,intent,trip,taxonomy:t});
 const p=tp.planTrip({intent,trip:trip.multi?trip:null,requirements,facts:f,labels,tripDate:'2026-10-17'});
 const empty=p.days.find(day=>!day.stops.some(s=>s.venue?.type==='sport'));
 assert.ok(empty);assert.ok(!empty.stops.some(s=>s.daypart==='afternoon'&&s.venue?.type==='restaurant'));assert.ok(empty.stops.some(s=>s.daypart==='evening'&&s.venue?.type==='restaurant'));assert.match(p.warnings.join(' '),/shorter trip/);
 const explicit='Plan 2 days in Kelowna with disc golf, lunch and dinner.';
 const ei=d.interpretDiscoveryQuery(explicit,t),et=d.interpretTripComponents(explicit,t,ei),er=r.extractTripRequirements({text:explicit,intent:ei,trip:et,taxonomy:t});
 const ep=tp.planTrip({intent:ei,trip:et.multi?et:null,requirements:er,facts:f,labels,tripDate:'2026-10-17'});
 assert.ok(ep.days.every(day=>day.stops.some(s=>['midday','afternoon'].includes(s.daypart)&&s.venue?.type==='restaurant')),'explicit lunches are retained (2026-10-14: as a midday stop)');
});

test('Sparse recovery offers shortening only without discarding dated or named priorities',()=>{
 const p={days:[{day:1,region:'armstrong',stops:[{venue:{id:1,type:'sport'}}]},{day:2,region:'armstrong',activityGap:true,stops:[{venue:{id:2,type:'restaurant'}}]}]};
 assert.equal(r.sparseDayRecovery(p,{items:[]}).shorterDays,1);
 assert.equal(r.sparseDayRecovery(p,{endDate:'2026-10-18',items:[]}).shorterDays,null);
 assert.equal(r.sparseDayRecovery(p,{items:[{kind:'venue',value:2,strength:'must'}]}).shorterDays,null);
 assert.equal(r.sparseDayRecovery(p,{items:[{kind:'activity',dayIndex:2}]}).shorterDays,null);
});

test('Sparse recovery offers a shorter trip when a trailing day has no usable stops',()=>{
 const p={days:[{day:1,region:'vernon',stops:[{venue:{id:31,type:'winery'}}]},{day:2,region:'vernon',stops:[{venue:null},{venue:null},{venue:null}]}]};
 const recovery=r.sparseDayRecovery(p,{items:[{kind:'type',value:'winery',strength:'must'}]});
 assert.deepEqual(recovery,{days:[2],shorterDays:1,region:'vernon'});
 assert.equal(r.sparseDayRecovery(p,{endDate:'2026-10-18',items:[]}).shorterDays,null);
 assert.equal(r.sparseDayRecovery(p,{items:[{kind:'venue',value:32,strength:'must',dayIndex:2}]}).shorterDays,null);
});

test('Customer timing copy: only hiking stops ask about trail duration',()=>{
 const x=interpret('Coffee, a hike and dinner in Kelowna on October 17, 2026 starting at 9 am.');
 const fs=[facts[0],{...facts[1],plannerKinds:[],activities:['hiking']},facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:null}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 const selected=r.selectedStops(p);
 assert.match(selected.find(s=>s.venue?.id===2).scheduleNote,/Confirm trail duration/);
 for(const id of [1,5]){
  const s=selected.find(s=>s.venue?.id===id);assert.ok(s);
  assert.doesNotMatch(s.scheduleNote,/trail/i);
  assert.match(s.scheduleNote,/Confirm visit duration, opening hours and travel/);
  assert.ok(p.schedule.find(row=>row.venueId===id).status==='provisional');
 }
});

test('Customer timing uncertainty distinguishes missing own hours from preceding uncertainty',()=>{
 const x=interpret('Coffee and dinner in Kelowna on October 17, 2026 starting at 9 am.');
 const fs=[facts[0],facts[4]].map(v=>({...v,lat:49.88,lng:-119.49,_hours:undefined,hours:v.id===5?JSON.stringify({sat:[['17:00','22:00']]}):null}));
 const p=tp.planTrip({...x,facts:fs,labels,tripDate:'2026-10-17'});
 const coffee=r.selectedStops(p).find(s=>s.venue?.id===1),dinner=r.selectedStops(p).find(s=>s.venue?.id===5);
 assert.match(coffee.scheduleNote,/This stop’s opening hours are not verified/);
 assert.doesNotMatch(coffee.scheduleNote,/preceding stop/);
 assert.match(dinner.scheduleNote,/This visit fits the listed opening hours/);
 assert.match(dinner.scheduleNote,/Timing remains provisional because a preceding stop is provisional/);
 assert.doesNotMatch(dinner.scheduleNote,/This stop’s opening hours are not verified|Trail duration/);
 assert.equal(p.schedule.find(s=>s.venueId===5).status,'provisional');
 assert.equal(p.schedule.find(s=>s.venueId===5).startMinutes,1080);
 assert.deepEqual(p.schedule.find(s=>s.venueId===5).confirmationReasons,['prior_timing','visit_duration','travel']);
 assert.deepEqual(p.schedule.find(s=>s.venueId===1).confirmationReasons,['hours','visit_duration','travel']);
});

test('After-event dinner offers a conditional hours window without inventing transfer or visit times',()=>{
 const p=eventSchedule('5 pm','20:00'),meal=p.schedule.find(s=>s.venueId);
 assert.equal(meal.status,'unverified');assert.equal(meal.startMinutes,undefined);assert.equal(meal.transferMinutes,undefined);
 assert.deepEqual(meal.mealWindow,{earliestStartMinutes:1200,latestStartMinutes:1290,visitMinutes:90});
 assert.match(r.selectedStops(p).find(s=>s.venue).scheduleNote,/if travel permits/);
 assert.equal(eventSchedule('5 pm').schedule.find(s=>s.venueId).mealWindow,undefined);
 assert.equal(eventSchedule('5 pm','22:00').schedule.find(s=>s.venueId).mealWindow,undefined);
 assert.equal(eventSchedule('5 pm','20:00',false,{lat:49.88,lng:-119.49}).schedule.find(s=>s.venueId).mealWindow,undefined);
});

test('Concert eligibility trusts live-music tags with additional categories while retaining exclusions',()=>{
 const dbx={name:'DBX: The Doobie Brothers Experience',categories:['live-music','arts-culture']};
 for(const kind of ['concert','live-music']){
  assert.equal(tp.eventSuitsKind(dbx,kind),true);
  assert.equal(tp.eventSuitsKind({...dbx,categories:['arts-culture']},kind),false);
  for(const name of ['Comedy Night','Film Screening','Architecture Lecture','Hockey Game','Junie B. Jones The Musical'])assert.equal(tp.eventSuitsKind({...dbx,name},kind),false,name);
  assert.equal(tp.eventSuitsKind({...dbx,categories:['live-music','arts-culture','family-kids']},kind),false);
 }
 assert.equal(tp.chooseTripEvent([{...dbx,id:99,time:'7:30 pm'}],'concert','evening',true).event.id,99);
 assert.equal(tp.chooseTripEvent([{...dbx,id:99,time:'1 pm'}],'concert','evening',true).event,null);
});
test('Named concert requests constrain event selection and do not substitute unrelated artists',()=>{
 for(const wording of ['Simon Garfunkel concert','Simon and Garfunkel concert','concert by Simon and Garfunkel']){
  const x=interpret(`Plan a night in Kelowna with dinner and a ${wording}.`);
  const c=x.trip.components.find(c=>c.kind==='event');
  assert.deepEqual(c.event.terms,['simon','garfunkel']);
  const expanded=r.expandTripComponents(x.trip,x.requirements);
  assert.deepEqual(expanded.components.find(c=>c.kind==='event').event.nameTerms,['simon','garfunkel']);
  const requirement=x.requirements.items.find(i=>i.kind==='event');
  assert.equal(r.eventMatches({name:'Live Music with James Hay',categories:['live-music']},requirement),false);
  assert.equal(r.eventMatches({name:'The Return of Simon & Garfunkel',categories:['live-music']},requirement),true);
  const events=[{id:1,name:'Live Music with James Hay',categories:['live-music'],time:'5 pm'},{id:2,name:'The Return of Simon & Garfunkel',categories:['live-music'],time:'7 pm'}];
  assert.equal(tp.chooseTripEvent(events,'concert','evening',true,c.event.terms).event.id,2);
  assert.equal(tp.chooseTripEvent(events.slice(0,1),'concert','evening',true,c.event.terms).event,null);
 }
 assert.deepEqual(interpret('Plan a night in Kelowna with dinner and a concert.').trip.components.find(c=>c.kind==='event').event.terms,[]);
});
test('Named listed events are recognized without requiring an event noun and expose stable IDs for ambiguous choices',()=>{
 const events=[{id:51,name:'The Return of Simon & Garfunkel',categories:['live-music']}];
 const q='Plan a date night in Kelowna with Simon and Garfunkel and dinner';
 assert.equal(r.namedEventInterpretationText(q,events),'plan a date night in kelowna with simon and garfunkel concert and dinner');
 for(const text of ['Plan dinner in Kelowna','Plan dinner without Simon and Garfunkel','Plan dinner and live music'])assert.equal(r.namedEventInterpretationText(text,events),text);
 const ambiguous=r.namedEventInterpretationText(q,[...events,{id:52,name:'Simon & Garfunkel Tribute',categories:['live-music']}],true);
 assert.equal(ambiguous.text,q);assert.equal(ambiguous.ambiguity.phrase,'simon garfunkel');assert.deepEqual(ambiguous.ambiguity.candidates,['The Return of Simon & Garfunkel','Simon & Garfunkel Tribute']);assert.deepEqual(ambiguous.ambiguity.candidateIds,[51,52]);
 assert.equal(r.namedEventInterpretationText(q,[...events,events[0]]),'plan a date night in kelowna with simon and garfunkel concert and dinner');
 assert.equal(r.namedEventInterpretationText('Visit Fields of Screams and dinner',[{name:'Fields of Screams',categories:['arts-culture']}]),'visit fields of screams event and dinner');
 assert.equal(r.namedEventInterpretationText('Plan a night in West Kelowna and dinner',[{name:'West Kelowna Light Up',region:'west-kelowna'},{name:'West Kelowna Warriors Home Games',region:'west-kelowna'}]),'Plan a night in West Kelowna and dinner');
});
test('A selected event consumes its title words instead of leaving misleading search chips',()=>{
 const terms=r.consumedTerms({items:[{kind:'event',nameTerms:['kelowna','rockets','home','games','2026','27']}]});
 for(const word of ['rockets','home','games','2026'])assert.ok(terms.has(word),word);
});
