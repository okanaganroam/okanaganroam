require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderBody, styles } = require('../kelowna-page');
test('Kelowna compact page scopes discovery, counts and active featured listings', () => {
 const html=renderBody({count:535,activeSlugs:['myra-canyon-myra-bellevue-provincial-park','craft-beer-market-kelowna','kasugai-garden','analog-coffee-one-water']});
 assert.match(html,/action="\/browse" method="get"/); assert.match(html,/name="regions" value="kelowna"/);
 assert.match(html,/535 places to explore/); assert.equal((html.match(/class="bw-tile"/g)||[]).length,6);
 assert.equal((html.match(/class="bw-pick"/g)||[]).length,4);assert.equal((html.match(/<details>/g)||[]).length,3);
 assert.doesNotMatch(html,/Big White|big-white|<details open|snow report/i);
 assert.match(styles,/body\.kelowna-page/);assert.doesNotMatch(styles,/body\.big-white-page/);
});
test('Kelowna omits inactive featured listings and handles singular count',()=>{
 const html=renderBody({count:1,activeSlugs:['kasugai-garden']});
 assert.match(html,/1 place to explore/);assert.equal((html.match(/class="bw-pick"/g)||[]).length,1);assert.doesNotMatch(html,/href="\/kelowna\/breweries\/craft/);
});
