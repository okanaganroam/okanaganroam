'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {t3TimelineRows,t3EventPlaceHtml}=require('../trip-planner-v3-page');
test('Event card: exposes the listing venue in English and French without trusting markup',()=>{
 const e={venueName:'Prospera Place <Arena>'};
 assert.equal(t3EventPlaceHtml(e,'en',x=>String(x).replace(/</g,'&lt;').replace(/>/g,'&gt;')),'<p class="t3-event-place">Venue: Prospera Place &lt;Arena&gt;</p>');
 assert.equal(t3EventPlaceHtml(e,'fr',x=>String(x).replace(/</g,'&lt;').replace(/>/g,'&gt;')),'<p class="t3-event-place">Lieu : Prospera Place &lt;Arena&gt;</p>');
 assert.equal(t3EventPlaceHtml({},'en',String),'');
});
test('Timeline: separate known visit, travel and free time without changing the plan',()=>{
 const p={itinerary:{stops:[{venue:{id:1,name:'Coffee'}},{event:{id:2,name:'Show'}}]},schedule:[{day:1,venueId:1,status:'estimated',startMinutes:600,endMinutes:640},{day:1,eventId:2,status:'estimated',startMinutes:720,endMinutes:780,transferMinutes:20}]};
 const before=JSON.stringify(p),rows=t3TimelineRows(p);assert.equal(rows[1].gapMinutes,60);assert.equal(rows[1].transferMinutes,20);assert.equal(rows[1].name,'Show');assert.equal(JSON.stringify(p),before);
});
test('Timeline: unknown predecessors never create invented free time',()=>{
 const p={itinerary:{stops:[{event:{id:2,name:'Show'}},{venue:{id:3,name:'Dinner'}}]},schedule:[{day:1,eventId:2,status:'unverified',startMinutes:720},{day:1,venueId:3,status:'unverified'}]};
 const rows=t3TimelineRows(p);assert.equal(rows[1].gapMinutes,null);assert.equal(rows[1].startMinutes,undefined);
});
test('Timeline: removing a stop hides it and invalidates the remaining sequence timing',()=>{
 const p={days:[{day:1,stops:[{daypart:'morning',venue:{id:1,name:'Coffee'}},{daypart:'evening',venue:{id:2,name:'Dinner'}}]}],schedule:[{day:1,venueId:1,startMinutes:600,endMinutes:640,status:'estimated'},{day:1,venueId:2,startMinutes:1080,endMinutes:1170,status:'estimated',transferMinutes:15}]};
 const rows=t3TimelineRows(p,{'1-morning':true});assert.equal(rows.length,1);assert.equal(rows[0].gapMinutes,null);assert.equal(rows[0].status,'unverified');assert.equal(rows[0].startMinutes,undefined);
});
test('Timeline: arrival allowance is excluded from free time',()=>{
 const p={itinerary:{stops:[]},schedule:[{day:1,venueId:1,endMinutes:1110},{day:1,eventId:2,startMinutes:1170,transferMinutes:17,arrivalAllowanceMinutes:30}]};
 assert.equal(t3TimelineRows(p)[1].gapMinutes,13);
});
