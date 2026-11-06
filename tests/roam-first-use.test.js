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
 assert.match(source, /id="rnApplyFilters"[^\n]+Show results/);
});
test('route preview measures the resized map before fitting its bounds',()=>{
 const from=source.indexOf('  function fitRoutePreview(r){');assert.ok(from>=0);
 const to=source.indexOf('\n  function ',from+3);const calls=[];
 const c={map:{stop(){calls.push('stop')},invalidateSize(o){assert.equal(o.pan,false);calls.push('measure')}},fitTo(bounds,zoom){assert.equal(bounds,'route-bounds');assert.equal(zoom,17);calls.push('fit')}};
 vm.createContext(c);vm.runInContext(source.slice(from,to)+';fitRoutePreview({line:{getBounds:()=>"route-bounds"}})',c);assert.deepEqual(calls,['stop','measure','fit']);
});
test('town-based browsing dismisses location help without dismissing route-origin help',()=>{
 const from=source.indexOf('  function dismissTownLocationHelp(){');assert.ok(from>=0);const to=source.indexOf('\n  function ',from+3);const fn=source.slice(from,to);
 const help={hidden:false};const c={town:'kelowna',pendingRoute:null,$:()=>help,cancelPendingLocation(){c.cancelled=true},floatGap(){c.resized=true}};vm.createContext(c);vm.runInContext(fn+';result=dismissTownLocationHelp()',c);
 assert.equal(help.hidden,true);assert.equal(c.result,true);assert.ok(c.cancelled&&c.resized);
 help.hidden=false;c.pendingRoute={name:'Cafe'};c.cancelled=false;vm.runInContext('result=dismissTownLocationHelp()',c);assert.equal(help.hidden,false);assert.equal(c.result,false);assert.equal(c.cancelled,false);
 c.pendingRoute=null;c.town='';vm.runInContext('result=dismissTownLocationHelp()',c);assert.equal(help.hidden,false);assert.equal(c.result,false);
});
test('a delayed location error cannot reopen help once browsing has a town',()=>{
 const from=source.indexOf('  function showLocationHelp(text){');const to=source.indexOf('\n  function ',from+3);
 const c={dismissTownLocationHelp:()=>true,$(){throw new Error('Should not reopen town help')}};vm.createContext(c);vm.runInContext(source.slice(from,to)+';showLocationHelp("blocked")',c);
});

test('a calculated GPS route stays in preview until Start is pressed', () => {
  const begin = source.indexOf('  function drawNav(){');
  const end = source.indexOf("  navbar.addEventListener('click'", begin);
  const startHandler = source.match(/  routeEl.addEventListener\('click', function\(e\)\{\n    if \(!e.target.closest\('#rnStartRoute'\)[\s\S]+?\n  \}\);/)[0];
  const route = { data: {} };
  let click, starts = 0;
  const context = {
    route, me: { pin: false }, navbar: {}, stage: { classList: { toggle() {} } },
    routeEl: { addEventListener(type, handler) { click = handler; } },
    startCompass() {}, unlockVoice() {}, drawRoute() {}, startNav() { starts++; },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(begin, end).replaceAll(/\$\{uiIcon\([^}]*\)\}/g, "<svg/>") + startHandler + '\n drawNav();', context);
  assert.equal(context.navbar.hidden, true);
  assert.equal(starts, 0);
  context.me.pin = true;
  click({ target: { closest: () => true } });
  assert.equal(starts, 0);
  context.me.pin = false;
  click({ target: { closest: () => true } });
  assert.equal(route.started, true);
  assert.equal(starts, 1);
});
