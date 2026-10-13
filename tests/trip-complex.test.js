'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent');
const tp = require('../trip-planner');
const types = ['restaurant','winery','cafe','brewery','pub','cocktail','distillery','golf','beach','outdoor','indoor','tour'];
const taxonomy = { regions:['kelowna'],regionLabels:{kelowna:'Kelowna'},types,features:['kid_friendly','dog_friendly','vegetarian','vegan','gluten_free'],activities:['winter','hiking','nature','water'],collections:[],venues:[],budgets:['budget','moderate','upscale'],paces:['relaxed','standard','packed'],datePresets:['today','this-weekend'],eventCategories:['live-music'] };
const labels = {regions:{kelowna:'Kelowna'},types:Object.fromEntries(types.map(t=>[t,{singular:t,plural:t}])),activities:{winter:'Winter',hiking:'Hiking'}};
const rows = [
 ['History Museum','indoor',['museum']], ['Puzzle Escape Room','indoor',['escape']], ['Art Gallery','indoor',['gallery']],
 ['Wine Tour Operator','tour',['wine_tour']], ['Vegetarian Bistro','restaurant',[]], ['Morning Coffee','cafe',[]],
 ['Family Winery','winery',[]], ['Lake Beach','beach',[]], ['Mountain Golf','golf',[]], ['Winter Nordic Centre','outdoor',[]],
];
const facts = rows.map(([name,type,plannerKinds],i)=>({id:i+1,name,type,region:'kelowna',url:`/kelowna/${type}/${i+1}`,textName:d.normalizeDiscoveryText(name),textDesc:'',textCuisine:'',cuisine:null,features:{kid_friendly:true,vegetarian:true},collections:[],activities:type==='outdoor'?['winter']:[],fdTypes:[],plannerKinds,indoorEvidence:type==='indoor'?'explicit':'unknown',lat:49.89+i*.001,lng:-119.49,rating:4.5,reviews:20,price:2,hours:null}));
taxonomy.venues=facts.map(v=>({id:v.id,name:v.name,type:v.type,region:v.region}));
function plan(text,extra={}) { const intent=d.interpretDiscoveryQuery(text,taxonomy),trip=d.interpretTripComponents(text,taxonomy,intent);return tp.planTrip({intent,trip:trip.multi?trip:null,facts,labels,tripEvents:trip.components.map(()=>[]),tripDate:'2026-10-17',...extra}); }
function stops(p){return [...(p.days||[]).flatMap(d=>d.stops),...(p.itinerary?.stops||[]),...(p.outing?.stops||[]),...(p.recommendations||[])].filter(s=>s.venue);}
test('Complex categories: a museum request selects a museum rather than other indoor venues',()=>{assert.ok(stops(plan('Plan a day in Kelowna with a museum and dinner')).some(s=>s.venue.id===1));});
test('Complex categories: guided wine tour is a tour operator, not a winery substitute',()=>{assert.ok(stops(plan('Plan a day in Kelowna with a wine tour and dinner')).some(s=>s.venue.id===4));});
test('Complex categories: winter activity is selected from stored activity membership',()=>{assert.ok(stops(plan('Plan a day in Kelowna with skiing and dinner')).some(s=>s.venue.id===10));});
module.exports={taxonomy,labels,facts,plan,stops};
const req=require('../trip-requirements');
function complex(text,extra={}) {const intent=d.interpretDiscoveryQuery(text,taxonomy),trip=d.interpretTripComponents(text,taxonomy,intent);const requirements=req.extractTripRequirements({text,intent,trip,taxonomy});return plan(text,{requirements,...extra});}
test('Complex itinerary: museum, escape room, winery and vegetarian meals all appear over three days',()=>{
 const p=complex('Plan 3 days in Kelowna. Include a museum, an escape room, one winery and only vegetarian meals. No beaches or golf. Keep driving limited.');
 const ids=stops(p).map(s=>s.venue.id);assert.ok(ids.includes(1));assert.ok(ids.includes(2));assert.ok(ids.includes(7));assert.ok(!ids.includes(8)&&!ids.includes(9));
 assert.equal(p.days.length,3);assert.ok(p.requirementResults.every(r=>r.status==='satisfied'||r.kind==='base'),JSON.stringify(p.requirementResults));
});
test('Complex itinerary: day-scoped museum occurs on day 2 and survives regeneration',()=>{
 const text='Plan 3 days in Kelowna. Day 2: museum and dinner.';const p=complex(text);assert.ok(p.days[1].stops.some(s=>s.venue?.id===1));
 const pins=Object.fromEntries(p.days.flatMap(day=>day.stops.filter(s=>s.venue&&day.day!==2).map(s=>[`${day.day}-${s.daypart}`,s.venue.id])));
 const next=complex(text,{seed:9,pinned:pins});assert.ok(next.days[1].stops.some(s=>s.venue?.id===1));
});
test('Complex itinerary: dietary requirements do not force museum badges and reject unbadged meals',()=>{
 const f=facts.map(v=>({...v,features:v.type==='cafe'?{}:v.features}));const p=complex('Plan a day in Kelowna. Museum and only vegetarian meals.',{facts:f});
 assert.ok(stops(p).some(s=>s.venue.id===1));assert.ok(!stops(p).some(s=>s.venue.id===6));
});
test('Complex itinerary: pinned venue known closed in its slot is not retained',()=>{
 const hours=JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[]])));
 assert.throws(()=>complex('Plan a day in Kelowna with a museum',{facts:facts.map(v=>v.id===1?{...v,hours,_hours:undefined}:v),pinned:{'1-afternoon':1},startWeekday:'sat'}),/locked/i);
});
test('Complex itinerary: impossible museum request remains explicitly unmet',()=>{const p=complex('Plan a day in Kelowna with a museum',{facts:facts.filter(v=>v.id!==1)});assert.equal(p.requirementResults.find(i=>i.value==='museum').status,'unmet');});
test('Missing museum offers a related gallery as optional without satisfying or inserting it',()=>{
 const p=complex('Plan a day in Kelowna with a museum',{facts:facts.filter(v=>v.id!==1)});
 const missing=p.requirementResults.find(i=>i.value==='museum');
 assert.equal(missing.status,'unmet');
 assert.ok(!stops(p).some(s=>s.venue.id===3));
 assert.deepEqual(missing.optionalAlternatives.map(a=>[a.id,a.reasonCode]),[[3,'similar_activity']]);
});
test('Complex itinerary: exact requested venue outranks other cafes',()=>{const p=complex('Plan a day in Kelowna. Visit Morning Coffee and a museum.');assert.ok(stops(p).some(s=>s.venue.id===6));});
test('Complex itinerary: known seasonal closure is assessed on each trip day',()=>{
 const f=facts.map(v=>v.id===1?{...v,seasonClosed:{from:'2026-10-16',to:'2026-10-18'},seasonClosedToday:false}:v);
 const p=complex('Plan 3 days in Kelowna with a museum',{facts:f,tripDate:'2026-10-16'});
 assert.ok(!stops(p).some(s=>s.venue.id===1));assert.equal(p.requirementResults.find(i=>i.value==='museum').status,'unmet');
});
test('Complex itinerary: a real event anchors its actual date and known evening time',()=>{
 const p=complex('Plan 3 days in Kelowna. Include a museum and a concert.',{events:[{id:50,name:'Autumn Concert',region:'kelowna',url:'/events/autumn-concert',categories:['live-music'],startDate:'2026-10-18',endDate:'2026-10-18',time:'7:00 PM',dateLabel:'October 18'}]});
 const e=p.days.flatMap(d=>d.stops.map(s=>({day:d.day,...s}))).find(s=>s.kind==='event');assert.equal(e?.day,2);assert.equal(e?.event.id,50);assert.equal(e?.daypart,'evening');
});
test('Complex itinerary: an explicit distance limit never joins far-apart known stops',()=>{
 const f=facts.map(v=>v.id===1?{...v,lat:52,lng:-120}:v);
 const p=complex('Plan a day in Kelowna with a museum. Keep stops within 10 km.',{facts:f});const used=stops(p).map(s=>f.find(v=>v.id===s.venue.id));
 for(let i=1;i<used.length;i++)assert.ok(Math.abs(used[i].lat-used[i-1].lat)<.1);
});
test('Complex itinerary: every registered category can supply an explicitly requested stop',()=>{
 const cases={restaurant:'restaurant',winery:'winery',cafe:'coffee',brewery:'brewery',pub:'pub',cocktail:'cocktail lounge',distillery:'distillery',golf:'golf',beach:'beach',outdoor:'hiking',indoor:'museum',tour:'wine tour'};
 for(const [type,word] of Object.entries(cases)) {
  const candidate={...facts[0],id:100,name:type==='indoor'?'History Museum':type==='tour'?'Wine Tour':`Test ${type}`,type,activities:type==='outdoor'?['hiking']:[],plannerKinds:type==='indoor'?['museum']:type==='tour'?['wine_tour']:[],_hours:undefined};
  const p=plan(`Plan a day in Kelowna with ${word}`,{facts:[candidate]});assert.ok(stops(p).some(s=>s.venue.id===100),type);
 }
});
test('Review: scoped vegetarian meals do not remove day-one unbadged meals',()=>{const f=facts.map(v=>({...v,features:{},_hours:undefined}));const p=complex('Plan 2 days in Kelowna. Day 2 only vegetarian meals.',{facts:f});assert.ok(p.days[0].stops.some(s=>['cafe','restaurant'].includes(s.venue?.type)));assert.ok(!p.days[1].stops.some(s=>['cafe','restaurant'].includes(s.venue?.type)));});
test('Review: museums requested on two days can use distinct museums on each day',()=>{const f=[...facts,{...facts[0],id:99,name:'Second Museum'}];const p=complex('Plan 2 days in Kelowna. Day 1 museum. Day 2 museum.',{facts:f});assert.ok(p.days.every(d=>d.stops.some(s=>s.venue?.type==='indoor')));});
test('Review: excluding an escape room does not exclude a requested museum',()=>{const p=complex('Plan a day in Kelowna with a museum without an escape room');assert.ok(stops(p).some(s=>s.venue.id===1));assert.ok(!stops(p).some(s=>s.venue.id===2));});
test('Review: an event conflicting with a locked slot fails the edit',()=>{assert.throws(()=>complex('Plan 3 days in Kelowna. Include a museum and a concert.',{pinned:{'2-afternoon':1},events:[{id:50,name:'Concert',region:'kelowna',categories:['live-music'],startDate:'2026-10-18',endDate:'2026-10-18',time:'1:00 PM'}]}),/locked/i);});
test('Review: a known long event does not overlap an evening meal',()=>{const p=complex('Plan 3 days in Kelowna. Include a museum and a concert.',{facts:[...facts,...Array.from({length:6},(_,i)=>({...facts[4],id:100+i,name:`Meal ${i}`}))],events:[{id:50,name:'Concert',region:'kelowna',categories:['live-music'],startDate:'2026-10-18',endDate:'2026-10-18',time:'1:00 PM – 9:00 PM',startTime:'13:00',endTime:'21:00'}]});assert.ok(!p.days[1].stops.some(s=>s.daypart==='evening'&&s.venue));});
test('Complex recommendations and outings enforce dietary requirements',()=>{
 const f=facts.map(v=>({...v,features:{},_hours:undefined}));
 for(const text of ['Recommend only vegetarian restaurants in Kelowna','A romantic dinner in Kelowna with only vegetarian meals']) {
  const p=complex(text,{facts:f});assert.equal(stops(p).filter(s=>s.venue.type==='restaurant').length,0,text);
 }
});
test('Complex dates: exact date and day-two instructions preserve the requested three-day length',()=>{
 const p=complex('Plan 3 days in Kelowna starting 2026-10-16. Day 2 must include a museum and an escape room if it rains. Include one winery and only vegetarian meals. No beaches or golf. Keep driving limited.');
 assert.equal(p.days.length,3);assert.ok(p.days[1].stops.some(s=>s.venue?.id===1));assert.ok(p.days[1].stops.some(s=>s.venue?.id===2));assert.ok(p.requirementResults.some(r=>r.kind==='rainy'&&r.dayIndex===2));
});
test('Complex events: two categories on different dates are both scheduled',()=>{
 const p=complex('Plan 3 days in Kelowna. Include a concert and hockey.',{events:[{id:51,name:'Concert',region:'kelowna',categories:['live-music'],startDate:'2026-10-17',endDate:'2026-10-17',time:'7:00 PM'},{id:52,name:'Hockey',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-18',endDate:'2026-10-18',time:'7:00 PM'}]});
 assert.equal(p.days.flatMap(d=>d.stops).filter(s=>s.event).length,2);assert.ok(p.requirementResults.filter(i=>i.kind==='event').every(i=>i.status==='satisfied'));
});
test('Complex events: competing events are not double-booked and the unmet request is reported',()=>{
 const p=complex('Plan 2 days in Kelowna. Include a concert and hockey.',{events:[{id:51,name:'Concert',region:'kelowna',categories:['live-music'],startDate:'2026-10-17',endDate:'2026-10-17',time:'7:00 PM'},{id:52,name:'Hockey',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-17',endDate:'2026-10-17',time:'7:00 PM'}]});
 assert.equal(p.days.flatMap(d=>d.stops).filter(s=>s.event).length,1);assert.ok(p.requirementResults.some(i=>i.kind==='event'&&i.status==='unmet'));
});
test('Complex quantity: one winery means one winery across the trip, not one every day',()=>{const p=complex('Plan 3 days in Kelowna with a museum and one winery. No beaches or golf.',{facts:[...facts,{...facts[6],id:98,name:'Second Winery'}]});assert.equal(stops(p).filter(s=>s.venue.type==='winery').length,1);});
test('Complex event accuracy: a rugby event cannot satisfy a hockey request',()=>{
 const p=complex('Plan 2 days in Kelowna with a museum and hockey.',{events:[{id:53,name:'University Rugby',region:'kelowna',categories:['sports-recreation'],startDate:'2026-10-17',endDate:'2026-10-17',time:'7:00 PM'}]});
 assert.ok(!p.days.flatMap(d=>d.stops).some(s=>s.event));assert.equal(p.requirementResults.find(i=>i.kind==='event').status,'unmet');
});
test('Complex winter accuracy: an untagged water park cannot replace skiing',()=>{
 const f=facts.filter(v=>v.id!==10).concat({...facts[9],id:95,name:'Summer Water Park',activities:['water'],_hours:undefined});
 const p=complex('Plan 2 days in Kelowna from 2026-12-05 with skiing and a museum.',{facts:f});assert.ok(!stops(p).some(s=>s.venue.id===95));assert.equal(p.requirementResults.find(i=>i.kind==='activity'&&i.value==='winter').status,'unmet');
});
