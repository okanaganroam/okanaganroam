const test = require('node:test');
const assert = require('node:assert/strict');
const { roamHappyOfferHtml } = require('../roam-now-layout');
test('current happy-hour offer gives verified price and countdown priority', () => {
 const html = roamHappyOfferHtml({hhs:{now:true,left:'45 min'},dl:'$6 pints · $9 snacks'}, false);
 assert.match(html,/Happy hour on now/); assert.match(html,/Ends in 45 min/);
 assert.match(html,/\$6 pints · \$9 snacks/);
});
test('unlisted prices and unknown ending never invent offers or countdown', () => {
 const html = roamHappyOfferHtml({hhs:{now:true}},false);
 assert.match(html,/See venue for current specials/); assert.doesNotMatch(html,/Ends in|\$/);
 assert.equal(roamHappyOfferHtml({hhs:{now:false},dl:'$6'},false),'');
});
test('verified deal text is escaped and French fallback stays labelled', () => {
 const html=roamHappyOfferHtml({hhs:{now:true,left:'1 h'},dl:'<script>&',dlEn:true},true);
 assert.match(html,/lang="en"/); assert.match(html,/&lt;script&gt;&amp;/);assert.match(html,/Se termine dans 1 h/);
});

test('happy-hour cards keep secondary specials only when explicitly requested', () => {
 const fs=require('node:fs'),vm=require('node:vm');const src=fs.readFileSync(require.resolve('../server'),'utf8');
 const fn=src.slice(src.indexOf('  function featHtml(p, omitHappy){'),src.indexOf('  function anyOn(o)',src.indexOf('  function featHtml(p, omitHappy){')));
 const ctx={FEAT_ORDER:[],fHas:()=>false,CONF:{f:{}},feats:{},FR:false,esc:String,T:{spToday:'Today:',wnTonight:'Tonight:'},wnHtml:()=> 'DJ night'};
 vm.createContext(ctx);vm.runInContext(fn.replace(/\$\{uiIcon\([^}]+\)\}/g,''),ctx);ctx.p={spOn:true,sp:'Weekly deal',wnOn:true};
 assert.equal(vm.runInContext('featHtml(p,true)',ctx),'');
 ctx.feats.specials=true;assert.match(vm.runInContext('featHtml(p,true)',ctx),/Weekly deal/);
 ctx.feats.nights=true;assert.match(vm.runInContext('featHtml(p,true)',ctx),/DJ night/);
 assert.match(vm.runInContext('featHtml(p,false)',ctx),/Weekly deal/);
});

test('upcoming happy hours remain clearly upcoming, without an invented countdown',()=>{
 const later=roamHappyOfferHtml({hhs:{now:false,text:'Happy hour today from 9 PM'},dl:'$6 pints'},false,'later');
 assert.match(later,/Happy hour today from 9 PM/);assert.doesNotMatch(later,/Happy hour on now|Ends in/);
 const tomorrow=roamHappyOfferHtml({hht:900,dl:'$6 pints'},false,'tomorrow','3 PM');
 assert.match(tomorrow,/Tomorrow from 3 PM/);assert.doesNotMatch(tomorrow,/Happy hour on now|Ends in|\$6/);
});
