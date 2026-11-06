const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../server'),'utf8');
function syncContext(tab='places'){
 const node=()=>({hidden:false,textContent:'',innerHTML:'',value:'',scrollLeft:0,clientWidth:600,setAttribute(){},querySelectorAll(){return []}});const nodes={};const $=id=>nodes[id]||(nodes[id]=node());
 const chip=(key,label,attr)=>({textContent:label,setAttribute(){},getAttribute(n){return n===attr?key:null}});
 const ctx={$ ,kindChips:[chip('coffee','Coffee','data-pm-kind')],featChips:[chip('dogs','Dogs OK','data-pm-feat'),chip('gf','Gluten-free','data-pm-feat')],openBtns:[chip('','Open now','')],topBtns:[],kinds:{coffee:true},feats:{dogs:true,gf:true},onTags:()=>[],extras:()=>[],esc:String,T:{clear:'Clear'},on:o=>Object.keys(o).filter(k=>o[k]),notTypes:{},notTags:{},notKinds:{},notFeats:{},openOnly:false,topOnly:false,price:'',town:'kelowna',atMin:null,atDay:'',atUntil:false,tagOr:false,term:'',radiusKm:5,radiusFixed:false,searchEl:{value:''},tagHolder:node(),activeEl:node(),badge:node(),quickClear:node(),roamLocationLabel:()=>'',FR:false,tab,navigator:{},location:{pathname:'/map'},history:{replaceState(a,b,url){ctx.saved=url}}};
 const fn=source.slice(source.indexOf('  function syncChips(){'),source.indexOf('  // With location on,',source.indexOf('  function syncChips(){')));vm.createContext(ctx);vm.runInContext(fn+';syncChips()',ctx);return ctx;
}
test('filter changes save all choices to a URL that survives venue Back',()=>{const c=syncContext();assert.match(c.saved||'',/f=coffee,dogs,gf,in.kelowna/)});
test('event tab is preserved in the return URL',()=>assert.match(syncContext('events').saved||'',/#events$/));
test('event town filtering includes only the chosen town, even with GPS available',()=>{
 const from=source.indexOf('      items = events.filter(function(e)');const to=source.indexOf('\n        .sort',from);const expr=source.slice(from,to).trim();
 const c={events:[{g:'later',region:'kelowna',d:99},{g:'later',region:'vernon',d:0.1}],town:'kelowna',evTerm:'',evKinds:[],me:{},radiusKm:5,nearTown:()=>true};vm.createContext(c);vm.runInContext(expr,c);assert.deepEqual(Array.from(c.items,e=>e.region),['kelowna']);
});
test('detail directions link to the built-in map and retain French routing',()=>{
 const {roamDirectionsHref}=require('../roam-now-layout');
 assert.equal(roamDirectionsHref('/kelowna/cafes/bohemian-cafe'),'/map?directions=%2Fkelowna%2Fcafes%2Fbohemian-cafe#near-me');
 assert.match(roamDirectionsHref('/fr/kelowna/events/jazz-jam','fr'),/^\/fr\/map\?directions=/);
 assert.equal(roamDirectionsHref('https://evil.example/test'),null);
});
test('initial Events and Near me links survive URL synchronization',()=>{
 const block=source.slice(source.indexOf('    var initialHash = location.hash;'),source.indexOf('    if (returnContext && !CONF.dest)',source.indexOf('    var initialHash = location.hash;')));
 for(const hash of ['#events','#near-me']){
  const c={location:{hash},tab:'places',syncChips(){c.location.hash=''},returnContext:null,render(){},setTab(t){c.tab=t},CONF:{},nearBtn:{click(){c.near=true}},navigator:{}};
  vm.createContext(c);vm.runInContext(block,c);if(hash==='#events')assert.equal(c.tab,'events');else assert.equal(c.near,true);
 }
});
test('changing distance updates the saved results URL immediately',()=>{
 const c=syncContext();c.radiusSel={value:'10',addEventListener(type,fn){c.distanceChange=fn}};c.render=()=>{};
 const handler=source.match(/  radiusSel\.addEventListener\('change', function\(\)\{[^\n]+/)[0];vm.runInContext(handler,c);c.distanceChange();assert.match(c.saved,/r=10/);
});
test('town-scoped event counts do not claim a GPS radius',()=>{
 const a=source.indexOf('      countEl.textContent = aheadOn && aheadState');const b=source.indexOf('\n    }',a);const block=source.slice(a,b);
 const c={aheadOn:false,items:[{}],me:{},radiusKm:5,town:'vernon',FR:false,CONF:{r:{vernon:'Vernon'}},countEl:{},T:{eventsNear:(n,r)=>n+' events within '+r+' km',eventsCount:n=>n+' events'}};vm.createContext(c);vm.runInContext(block,c);assert.equal(c.countEl.textContent,'1 events · In Vernon');
});
test('return URLs keep the original search text alongside selected needs',()=>{const c=syncContext();c.searchEl.value='  Bohemian Café  ';vm.runInContext('syncChips()',c);assert.match(c.saved,/q=Bohemian%20Caf%C3%A9/);assert.match(c.saved,/dogs,gf/)});
test('restoring an event search reapplies its event words and kinds',()=>{
 const a=source.indexOf("      if (qs.get('q')) { readSearch");const b=source.indexOf("      // 2026-10-26:",a);const c={qs:new URLSearchParams('q=jazz+events'),searchEl:{},readSearch(){c.wantEvents=true;c.term='jazz';c.evFilt=['live_music'];c.evSaid=[]},events:[{}],eventGroup:()=>true,evHit:()=>true,okToday:()=>'',okanaganClock:()=>({minutes:0}),nyeAsk:false,xmasMarket:false,loadAhead(){}};vm.createContext(c);vm.runInContext(source.slice(a,b),c);assert.equal(c.evTerm,'jazz');assert.deepEqual(Array.from(c.evKinds||[]),['live_music']);assert.equal(c.tab,'events');
});
test('built-in destinations resolve real venues and event hosts, rejecting arbitrary URLs',()=>{
 const app=require('../server'),db=require('../db');let venue,event;
 try{
  venue=Number(db.prepare('INSERT INTO venues(name,region,type,slug,latitude,longitude) VALUES (?,?,?,?,?,?)').run('Journey routing fixture','kelowna','cafe','journey-routing-fixture',49.88,-119.49).lastInsertRowid);
  event=Number(db.prepare('INSERT INTO events(name,slug,region,start_datetime,venue_id,status) VALUES (?,?,?,?,?,?)').run('Journey event fixture','journey-routing-fixture','kelowna','2026-11-07T18:00:00',venue,'scheduled').lastInsertRowid);
  db.prepare('INSERT INTO event_occurrences(event_id,start_date,end_date,start_time,end_time) VALUES (?,?,?,?,?)').run(event,'2026-11-07','2026-11-07','18:00','20:00');
  const now=new Date('2026-11-06T20:00:00Z');
  const eventPrice = () => app.mapEventsData(now).find(row => row[1] === '/kelowna/events/journey-routing-fixture')[13];
  assert.equal(eventPrice(), 0);
  const setPrice = db.prepare('UPDATE events SET price_kind=?, price_text=? WHERE id=?');
  setPrice.run('free', null, event);
  assert.equal(eventPrice(), 'Free');
  setPrice.run('paid', '$20–$35', event);
  assert.equal(eventPrice(), '$20–$35');
  assert.equal(app.mapDestination('/kelowna/cafes/journey-routing-fixture',now).lat,49.88);
  assert.equal(app.mapDestination('/fr/kelowna/events/journey-routing-fixture',now).name,'Journey event fixture');
  assert.equal(app.mapDestination('https://evil.example/kelowna/cafes/a',now),null);
  assert.equal(app.mapDestination('/kelowna/cafes/missing-journey-fixture',now),null);
 }finally{if(event){db.prepare('DELETE FROM event_occurrences WHERE event_id=?').run(event);db.prepare('DELETE FROM events WHERE id=?').run(event)}if(venue)db.prepare('DELETE FROM venues WHERE id=?').run(venue)}
});

test('clearing every filter retains an explicit empty selection for Back and reload',()=>{const c=syncContext();c.kinds={};c.feats={};c.town='';vm.runInContext('syncChips()',c);assert.equal(c.saved,'/map?f=')});
test('an explicit distance also preserves Open now being off',()=>{const c=syncContext();c.kinds={};c.feats={};c.town='';c.radiusFixed=true;c.radiusKm=10;vm.runInContext('syncChips()',c);assert.equal(c.saved,'/map?f=&r=10')});
