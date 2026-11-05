const test=require('node:test');const assert=require('node:assert/strict');
const {roamOpenByDefault,renderRoamFilterGroups}=require('../roam-now-layout');
test('fresh Roam Now entry starts open, while saved searches and events keep intent',()=>{
 for(const hash of ['', '#near-me'])assert.equal(roamOpenByDefault('',hash),true);
 for(const search of ['?f=','?f=coffee','?q=tomorrow','?directions=%2Fkelowna%2Fcafes%2Fa','?show=happy-hour'])assert.equal(roamOpenByDefault(search,'#near-me'),false);
 assert.equal(roamOpenByDefault('','#events'),false);
});
test('filter groups are expandable and expose selected-count slots',()=>{
 const html=renderRoamFilterGroups({must:[{key:'dogs',label:'Dogs OK'},{key:'patio',label:'Patio'}],diet:[{key:'gf',label:'Gluten-free'}]});
 assert.equal((html.match(/<details class="rn-filter-group"/g)||[]).length,5);
 assert.ok(html.includes('<summary>Dietary'));assert.ok(html.includes('data-rn-count'));
 assert.ok(html.includes('data-pm-feat="dogs"'));assert.ok(html.includes('data-pm-open'));
});

const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require.resolve('../server'),'utf8');
test('map selection distinguishes route starting points from browsing areas',()=>{
 const fn=source.match(/  function setPinMode\(on\)\{[^\n]+/)[0];
 const c={stage:{classList:{toggle(){}}},pinBtn:{setAttribute(){}},pinMarker:null,pendingRoute:{name:'Cafe'},FR:false,T:{tapToPin:'Choose an area'},setStatus(t){c.status=t}};
 vm.createContext(c);vm.runInContext(fn+';setPinMode(true)',c);assert.match(c.status,/starting point.*preview/);c.pendingRoute=null;vm.runInContext('setPinMode(true)',c);assert.equal(c.status,'Choose an area');
});
test('switching from route preview to live location retains the destination and unlocks guidance on tap',()=>{
 const handler=source.match(/  routeEl.addEventListener\('click',function\(e\)\{if\(e.target.closest\('#rnRouteUseLocation'\)[^\n]+/)[0];
 const c={route:{x:{name:'Cafe'}},routeEl:{addEventListener(t,fn){c.click=fn}},nearBtn:{click(){c.requested=true}},startCompass(){c.compass=true},unlockVoice(){c.voice=true}};
 vm.createContext(c);vm.runInContext(handler,c);c.click({target:{closest:()=>true}});assert.equal(c.pendingRoute,c.route.x);assert.ok(c.requested&&c.compass&&c.voice);
});

test('route location help gives one cause and one next-step instruction',()=>{
 const {roamRouteLocationMessage}=require('../roam-now-layout');
 const en=roamRouteLocationMessage('blocked','Cafe','en');
 assert.match(en,/To Cafe/);assert.equal((en.match(/browser/g)||[]).length,1);assert.equal((en.match(/live guidance/g)||[]).length,1);assert.match(en,/route preview/);
 assert.ok(!en.includes('Enable location in your browser settings, or choose on the map instead'));
 assert.match(roamRouteLocationMessage('failed','Cafe','en'),/Couldn’t find your location/);
 assert.match(roamRouteLocationMessage('blocked','Café','fr'),/guidage en direct/);
});
test('apply button labels do not imply the selected-filter count is a result count',()=>{
 const line=source.split('\n').find(l=>l.includes("$('rnApplyFilters').textContent="));assert.ok(line);assert.ok(!line.includes("+(n?"));
});
