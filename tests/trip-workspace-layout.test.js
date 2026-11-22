const test=require('node:test'),assert=require('node:assert/strict');
const {tripWorkspaceDay,tripWorkspaceBooking}=require('../trip-workspace-layout');
test('day selection survives edits but safely falls back when a day disappears',()=>{
 assert.equal(tripWorkspaceDay([1,2,3],2),2);assert.equal(tripWorkspaceDay([1],3),1);assert.equal(tripWorkspaceDay([],2),null);
});
test('booking links belong to this venue and prefer its own booking link',()=>{
 const steps=[{id:9,kind:'venue',url:'https://other.example'},{id:1,kind:'venue',url:'https://partner.example',affiliate:true},{id:1,kind:'venue',url:'https://business.example/book'}];
 assert.equal(tripWorkspaceBooking(1,steps).url,'https://business.example/book');
 assert.equal(tripWorkspaceBooking(2,steps),null);
 assert.equal(tripWorkspaceBooking(1,[{id:1,kind:'venue',url:'javascript:alert(1)'}]),null);
});
test('chat targets the requested day before selecting the first matching stop',()=>{
 const tc=require('../trip-chat');
 const stops=[1,2].flatMap(day=>[1,2].map(n=>({key:day+'-'+(n===1?'morning':'afternoon'),ref:'s'+(day*2+n),id:day*2+n,name:'Winery '+day+n,type:'winery',day,start:600+n*100,badges:[]})));
 const r=tc.rulesRead('Remove the first winery on day 2',stops,{days:2});
 assert.deepEqual(r.ops.find(o=>o.o==='remove').stops.map(s=>s.key),['2-morning']);
});
// Layout fixes (2026-11-22, fresh-eyes phone test): the stay, the agent's first line and "When are you coming?" are in
// the plan (not inside a closed section); an event is a card like a venue (Remove, then "Removed … Undo", and the stop
// count follows); one "Book my trip" button opens the checklist sheet.
const vm=require('node:vm');
const ws=require('../trip-workspace-layout'),v4=require('../trip-planner-v4-page'),chatPage=require('../trip-chat-page');
const slice=(src,from,to)=>{const a=src.indexOf(from),b=src.indexOf(to,a);assert.ok(a!==-1&&b>a,from);return src.slice(a,b);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('the stay card stays in the plan; only getting here folds away; the agent line is at the top of the plan on a phone',()=>{
 const src=ws.WORKSPACE_CLIENT_SRC;
 assert.ok(!/querySelectorAll\('\.v4-stay-card,\.v4-gh'\)/.test(src),'the stay card is not moved into the closed section');
 assert.ok(!src.includes('options.prepend(agent)'),'the agent line (and the date question in it) is not in the closed section');
 assert.match(src,/else if\(head\)head\.after\(agent\)/);
 assert.match(src,/stayAt\.before\(stayCard\)/);
 assert.match(src,/Getting here & tours/);assert.match(src,/Pour venir et excursions/);
 assert.ok(!src.includes('Dates & travel options'));
 // The chat's wine tour reply names the section where the card is, and the section opens when the chat points at it.
 const tc=require('../trip-chat');
 assert.match(require('node:fs').readFileSync(require.resolve('../trip-chat'),'utf8'),/It’s under “Getting here & tours”, with its Book button\./);
 assert.ok(tc);assert.match(src,/keys\.indexOf\('gh'\)!==-1\)\{var opt=resultEl\.querySelector\('\.tw-options'\);if\(opt\)\{opt\.open=true/);
});
test('an event is a card like a venue: View details and Remove; removed, it is a "Removed … Undo" row with no saved-trip button',()=>{
 const fn=slice(ws.WORKSPACE_CLIENT_SRC,'function tripWorkspaceEventHtml','  // "Book my trip"');
 const ctx={chat:{goneEvents:{}},esc,lang:()=>'en',twText:(en)=>en,placeUrl:(e)=>'/events/'+e.slug,hrefAttr:(u)=>'href="'+u+'"',vt:(k,v)=>({removed:'Removed',undo:'Undo',event:'Event',remove:'Remove '+(v&&v.name)}[k]),
  v4Thumb:(v)=>v?'<img class="v4-thumb" src="'+v.photo+'">':'<span class="v4-thumb v4-thumb--none"></span>',v4Start:()=>'3 PM',t3EventPlaceHtml:()=>'<p>Hall</p>'};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 const s={kind:'event',event:{id:7,name:'Night Market',slug:'night-market',photo:'/images/events/x.jpg',region:'kelowna',regionLabel:'Kelowna'},why:['A family event that day']};
 let html=ctx.tripWorkspaceEventHtml(s,'1-afternoon');
 assert.match(html,/class="tw-card-info"/);assert.match(html,/>View details<\/a>/);assert.match(html,/data-v4-event-x="7"[^>]*>× Remove</);
 assert.match(html,/data-trip-ref="event:7"/);assert.match(html,/data-plan-day="1"/);
 assert.ok(!html.includes('v4-event-x"'),'no ✕ laid over the photo');
 ctx.chat.goneEvents[7]=1;html=ctx.tripWorkspaceEventHtml(s,'1-afternoon');
 assert.match(html,/v4-gone/);assert.match(html,/Removed/);assert.match(html,/data-v4-event-undo="7">Undo</);
 assert.ok(!html.includes('data-plan-stop'),'a removed event is not saved or shared');
 // The page: Remove says so in the chat line (like a venue) and Undo brings the event back.
 const page=chatPage.chatClientSrc({v4:'on',chat:'on',stays:'on'});
 assert.match(page,/data-v4-event-undo/);assert.match(page,/announce\(tx\('tripv3\.wasRemoved', \{ name: xname \}\)\)/);
 assert.match(v4.V4_CLIENT_SRC,/if \(typeof tripWorkspaceEventHtml === 'function'\) return tripWorkspaceEventHtml\(s, key\);/);
});
test('the stop count leaves out a removed event and a removed stop',()=>{
 const fn=slice(v4.V4_CLIENT_SRC,'function v4Count(p){','  // ---- booking');
 const ctx={state:{removed:{}},v4:{gone:{}},chat:{goneEvents:{}}};vm.createContext(ctx);vm.runInContext(fn,ctx);
 const p={days:[{day:1,stops:[{daypart:'morning',venue:{id:1}},{daypart:'afternoon',kind:'event',event:{id:7}},{daypart:'evening',venue:{id:2}},{daypart:'late',freeTime:{minutes:60}}]}]};
 assert.equal(ctx.v4Count(p),3);
 ctx.chat.goneEvents[7]=1;assert.equal(ctx.v4Count(p),2);
 ctx.state.removed['1-evening']=2;assert.equal(ctx.v4Count(p),1);
 const noChat={state:{removed:{}},v4:{gone:{}}};vm.createContext(noChat);vm.runInContext(fn,noChat);
 assert.equal(noChat.v4Count(p),3,'without the chat page the count is as before');
});
test('"Book my trip" is one button under the plan that opens the checklist sheet, only with dates or a place to stay',()=>{
 const src=ws.WORKSPACE_CLIENT_SRC;
 assert.equal((src.match(/data-v4-book/g)||[]).length,1);
 assert.match(src,/function twCanBook\(\)\{/);assert.match(src,/return v4CanBook\(\)&&!!\(stay\|\|st\.arrive\|\|chatHasDates\(\)\)/);
 assert.match(v4.V4_CLIENT_SRC,/if \(\(b = t\.closest\('\[data-v4-book\]'\)\)\) \{ v4OpenSheet\(\); return; \}/);
 const page=require('../trip-planner-v3-page');
 const data={esc,title:'Trip',description:'Trip',canonical:'https://example.com/trip',breadcrumbJson:'{}',headerHtml:'',tripTrayHtml:'',footerHtml:'',footerStyles:'',analyticsHead:'',regions:[],regionImages:{},v4:'on',chat:'on',stays:'preview'};
 const html=page.renderTripPlannerV3Page(data);
 assert.match(html,/function tripWorkspaceEventHtml/);assert.match(html,/function twCanBook/);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[0].includes('application/ld+json'))continue;new vm.Script(m[1]);}
});
