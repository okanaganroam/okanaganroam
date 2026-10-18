const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '..', 'session-replay.js');
const render = (id) => fs.existsSync(modulePath) ? require(modulePath).renderSessionReplayHead(id) : '';

function visit({id='project123', host='okanaganroam.com', pathname='/outdoors', search='', hash='', cookie='', choice=null, storageError=false, referrer=''}={}) {
  const scripts=[], elements=[], events={};
  const store = new Map(choice ? [['roam_replay_v1',choice]] : []);
  const location = {hostname:host,pathname,search,hash,protocol:'https:',href:`https://${host}${pathname}${search}${hash}`,reload(){this.reloaded=true;},assign(value){this.assigned=value;}};
  function element(tag) {
    return {tagName:tag,style:{},children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(child){this.children.push(child);elements.push(child);if(child.tagName==='script')scripts.push(child);},addEventListener(type,fn){this[type]=fn;},remove(){this.removed=true;}};
  }
  const document={cookie,readyState:'complete',referrer,body:element('body'),head:element('head'),createElement:element,addEventListener(type,fn){events[type]=fn;}};
  const window={location,document,localStorage:{getItem(k){if(storageError)throw Error('blocked');return store.get(k)||null;},setItem(k,v){if(storageError)throw Error('blocked');store.set(k,v);}},addEventListener(type,fn){events[type]=fn;},history:{pushState(){},replaceState(){}},navigator:{},URL};
  window.window=window;
  const html=render(id);
  const js=html.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
  if(js)vm.runInNewContext(js,{window,document,location,URL});
  const button = (name)=>elements.find(e=>e.tagName==='button' && e.textContent===name);
  return {scripts,elements,window,store,location,events,button,html};
}

test('no vendor request before an affirmative choice',()=>{const v=visit();assert.ok(v.button('Allow recordings'));assert.equal(v.scripts.length,0);});
test('declining persists choice without loading vendor',()=>{const v=visit();v.button('Decline').click();assert.equal(v.store.get('roam_replay_v1'),'denied');assert.equal(v.scripts.length,0);});
test('accepting loads once with analytics-only consent',()=>{const v=visit();v.button('Allow recordings').click();assert.equal(v.scripts[0].src,'https://www.clarity.ms/tag/project123');assert.deepEqual(JSON.parse(JSON.stringify(v.window.clarity.q[0])),['consentv2',{ad_Storage:'denied',analytics_Storage:'granted'}]);v.button('Allow recordings').click();assert.equal(v.scripts.length,1);});
test('previously granted consent starts recording with body masked',()=>{const v=visit({choice:'granted'});assert.equal(v.scripts.length,1);assert.equal(v.window.document.body.attrs['data-clarity-mask'],'true');});
test('revocation persists denial and reloads to unload vendor',()=>{const v=visit({choice:'granted'});v.button('Recording preferences').click();v.button('Decline').click();assert.equal(v.store.get('roam_replay_v1'),'denied');assert.equal(v.location.reloaded,true);assert.equal(visit({choice:'denied'}).scripts.length,0);});
test('disabled or invalid config emits no code',()=>{for(const id of ['',undefined,'</script>'])assert.equal(render(id),'');});
test('internal, preview, private and parameterized pages never load or prompt',()=>{for(const options of [{host:'localhost'},{cookie:'roam_internal=1'},{pathname:'/admin'},{pathname:'/trip'},{pathname:'/contact'},{pathname:'/list-your-venue'},{search:'?q=private'},{hash:'#private'}]){const v=visit({...options,choice:'granted'});assert.equal(v.scripts.length,0,JSON.stringify(options));assert.equal(v.elements.length,0);}});
test('storage failure fails closed',()=>{const v=visit({storageError:true});assert.equal(v.scripts.length,0);assert.equal(v.elements.length,0);});
test('unsafe history change navigates without exposing query to running recorder',()=>{const v=visit({choice:'granted'});v.window.history.pushState({},'', '/outdoors?q=private');assert.equal(v.location.assigned,'https://okanaganroam.com/outdoors?q=private');assert.equal(v.location.search,'');});
test('denied visits retain normal SPA navigation',()=>{const v=visit({choice:'denied'});v.window.history.pushState({},'', '/outdoors?types=hiking');assert.equal(v.location.assigned,undefined);});
test('private referrer query prevents vendor requests',()=>{const v=visit({choice:'granted',referrer:'https://okanaganroam.com/search?q=private'});assert.equal(v.scripts.length,0);assert.equal(v.elements.length,0);});
test('private link navigation unloads before click capture',()=>{const v=visit({choice:'granted'});let prevented=false,stopped=false;v.events.click({target:{closest:()=>({href:'https://okanaganroam.com/trip?token=private'})},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(v.location.assigned,'https://okanaganroam.com/trip?token=private');});
test('external business links retain their native navigation behavior',()=>{const v=visit({choice:'granted'});let prevented=false;v.events.click({target:{closest:()=>({href:'https://example.com/menu'})},preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);assert.equal(v.location.assigned,undefined);});
test('consent after a private SPA transition does not start a recorder',()=>{const v=visit();v.location.search='?q=private';v.button('Allow recordings').click();assert.equal(v.scripts.length,0);});

test('fragment-only destinations force document reload rather than leaving recorder active',()=>{const v=visit({choice:'granted'});v.window.history.pushState({},'', '/outdoors#private');assert.equal(v.location.reloaded,true);assert.equal(v.location.assigned,'https://okanaganroam.com/outdoors#private');});
test('private links keep new-tab, modified-click and download behavior',()=>{
  for (const extra of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{link:{target:'_blank'}},{link:{hasAttribute:k=>k==='download'}}]) {
    const v=visit({choice:'granted'});let prevented=false;
    v.events.click({...extra,target:{closest:()=>({href:'https://okanaganroam.com/trip',...extra.link})},preventDefault(){prevented=true;},stopImmediatePropagation(){}});
    assert.equal(prevented,false);assert.equal(v.location.assigned,undefined);
  }
});
