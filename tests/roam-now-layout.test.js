const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require.resolve('../server.js'),'utf8');
function matches(overrides={},place={}) {
  const fn=src.slice(src.indexOf('  function matchesPlace(p){'),src.indexOf('  // Open first, then closed',src.indexOf('  function matchesPlace(p){')));
  const ctx={nameHit:()=>true,onTags:()=>[],dealHit:()=>false,anyOn:o=>Object.values(o).some(Boolean),kinds:{},CONF:{k:{},f:{gf:1,music:2}},topOnly:false,town:'',price:'',atMin:null,atDay:'',notTypes:{},notTags:{},notKinds:{},notFeats:{},feats:{gf:true},hhKnown:true,hhAnyNow:false,openOnly:false,term:'',TAGIX:{},nightHit:()=>false,...overrides};
  ctx.place={type:'cafe',region:'kelowna',f:0,tg:[],hhs:null,st:null,...place};vm.createContext(ctx);vm.runInContext(fn+';result=matchesPlace(place)',ctx);return ctx.result;
}
test('an exact venue name cannot bypass gluten-free or other selected requirements',()=>assert.equal(matches(),false));
test('Open now excludes unknown hours even for a named venue',()=>assert.equal(matches({feats:{},openOnly:true}),false));
test('Happy hour now excludes a venue with no current happy hour',()=>assert.equal(matches({feats:{happy:true},CONF:{k:{},f:{happy:4}}}),false));
test('layout groups all needs and provides explicit List and Map controls',()=>{
  const layout=require('../roam-now-layout.js');
  const html=layout.renderRoamFilterGroups({must:[{key:'dogs',label:'Dogs OK'},{key:'music',label:'Live music'},{key:'patio',label:'Patio'},{key:'happy',label:'Happy hour now'},{key:'kids',label:'Kids welcome'},{key:'groups',label:'Good for groups'}],diet:[{key:'gf',label:'Gluten-free'}]});
  for(const label of ['Dietary','Patios, music, views & sports','Dogs, kids & groups','Right now'])assert.ok(html.includes(label));
  for(const key of ['gf','dogs','music','patio','happy','kids','groups'])assert.ok(html.includes('data-pm-feat="'+key+'"'));
  assert.ok(layout.ROAM_LAYOUT_STYLE.includes('pm-list-view'));
});

test('combined needs require every real feature bit',()=>{
 const settings={feats:{gf:true,music:true}};
 assert.equal(matches(settings,{f:3}),true);
 assert.equal(matches(settings,{f:1}),false);
 assert.equal(matches(settings,{f:2}),false);
});
test('open and happy-hour now require their actual current status',()=>{
 assert.equal(matches({feats:{},openOnly:true},{st:{state:'open'}}),true);
 assert.equal(matches({feats:{happy:true}},{hhs:{now:true}}),true);
 assert.equal(matches({feats:{happy:true}},{hhs:{now:false}}),false);
});

test('map payload ships own venue photos separately without changing compact venue rows',()=>{
 const app=require('../server');const db=require('../db');
 const insert=db.prepare('INSERT INTO venues(name,region,type,slug,latitude,longitude,image_url) VALUES (?,?,?,?,?,?,?)');
 const ids=[];
 try{
  ids.push(Number(insert.run('Roam photo fixture','kelowna','cafe','roam-photo-fixture',49.88,-119.49,'/images/venues/roam-photo-fixture.jpg').lastInsertRowid));
  ids.push(Number(insert.run('Roam unsafe photo','kelowna','cafe','roam-unsafe-photo',49.88,-119.49,'javascript:alert(1)').lastInsertRowid));
  const data=JSON.parse(app.mapLiveData().json);
  assert.equal(data.i['/kelowna/cafes/roam-photo-fixture'],'/images/venues/roam-photo-fixture.jpg');
  assert.equal(data.i['/kelowna/cafes/roam-unsafe-photo'],undefined);
  const row=data.p.find(p=>p[2]==='Roam photo fixture');assert.ok(row);assert.equal(row.length,16);
 }finally{const del=db.prepare('DELETE FROM venues WHERE id=?');for(const id of ids)del.run(id)}
});

test('explicit town remains visible when GPS is also available',()=>{
 const fn=src.match(/function roamLocationLabel\(\)\{[^\n]+/)[0];
 const ctx={town:'vernon',CONF:{r:{vernon:'Vernon'}},me:{pin:false},radiusKm:5,FR:false};
 vm.createContext(ctx);vm.runInContext(fn+';result=roamLocationLabel()',ctx);assert.equal(ctx.result,'Vernon');
 ctx.town='';vm.runInContext('result=roamLocationLabel()',ctx);assert.equal(ctx.result,'Near your location · 5 km');
});

test('map cards receive recorded gluten-free details with qualifications intact', () => {
  const app = require('../server');
  const db = require('../db');
  const id = Number(db.prepare(
    'INSERT INTO venues(name,region,type,slug,latitude,longitude,gluten_free) VALUES (?,?,?,?,?,?,?)'
  ).run('Roam dietary fixture', 'kelowna', 'cafe', 'roam-dietary-fixture', 49.88, -119.49, 1).lastInsertRowid);
  const path = '/kelowna/cafes/roam-dietary-fixture';
  try {
    assert.equal(JSON.parse(app.mapLiveData().json).gf[path], undefined);
    const detail = 'Gluten-free buns are available. The fryer is shared.';
    db.prepare('INSERT INTO venue_visit_info(venue_id,info) VALUES (?,?)').run(id, JSON.stringify({
      rows: [{ label: 'Menu', text: 'Sandwiches and coffee.' }, { label: 'Dietary', text: detail }],
    }));
    assert.equal(JSON.parse(app.mapLiveData().json).gf[path][0], detail);
  } finally {
    db.prepare('DELETE FROM venue_visit_info WHERE venue_id=?').run(id);
    db.prepare('DELETE FROM venues WHERE id=?').run(id);
  }
});
