'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const start=require('../trip-start-page');
test('starting-page examples use real assets and explicit EN/FR requests',()=>{
 for(const card of start.EXAMPLES){assert.ok(fs.existsSync('public'+card.photo));assert.ok(card.request.en.length>20);assert.ok(card.request.fr.length>20);}
 const html=start.renderStart('<main id="tripV3" class="t3 t3-v4"><section class="t3-hero"><form id="t3Form"><label class="t3-sr" for="t3Input" data-i18n="tripv3.inputLabel">Describe the trip you want</label><textarea id="t3Input"></textarea><div class="t3-composer-foot"><button id="t3Submit">Plan my trip</button></div></form><div class="t3-editbar" id="t3EditBar" hidden></div><p class="t3-status" id="t3Status"></p></section><details id="t3How"></details><section id="t3Result"></section><section class="t3-wrap t3-about" id="t3About">Help</section></main>',{esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
 for(const id of ['t3Form','t3Input','t3Submit','t3Result','t3Status'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.equal((html.match(/data-t3-request=/g)||[]).length,3);
 assert.ok(html.includes('Your kind of Okanagan getaway.'));assert.ok(html.includes('<details class="ts-extra"'));
});
test('full chat page keeps unique mounts, booking/chat scripts and valid JavaScript',()=>{
 const page=require('../trip-planner-v3-page'),vm=require('node:vm');
 const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const data={esc,title:'Trip',description:'Trip',canonical:'https://okanaganroam.com/trip',breadcrumbJson:'{}',headerHtml:'',tripTrayHtml:'',footerHtml:'',footerStyles:'',analyticsHead:'',regions:[],regionImages:{},v4:'on',chat:'on',stays:'preview'};
 const html=page.renderTripPlannerV3Page(data);
 for(const id of ['t3Form','t3Input','t3Submit','t3Result'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/id="trip-start-layout"/);assert.match(html,/function chatSend/);assert.match(html,/function tripWorkspaceStopHtml/);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[0].includes('application/ld+json'))continue;new vm.Script(m[1]);}
 assert.ok(!page.renderTripPlannerV3Page({...data,chat:null}).includes('id="trip-start-layout"'));
});
