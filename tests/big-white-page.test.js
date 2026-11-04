const test = require('node:test');
const assert = require('node:assert/strict');
const { renderBody, styles } = require('../big-white-page');
const slugs = ['snowshoe-sam-s', 'big-white-tube-park', 'the-woods-restaurant', 'happy-valley-ice-skating-rink'];
test('Big White: real scoped search, dynamic counts and six categories', () => {
  const html = renderBody({ count: 42, status: 'Opens November 26', activeSlugs: slugs });
  assert.match(html, /action="\/browse" method="get"/);
  assert.match(html, /name="q"/);
  assert.match(html, /name="regions" value="big-white"/);
  assert.match(html, /42 places to explore/);
  assert.equal((html.match(/class="bw-tile"/g) || []).length, 6);
  assert.equal((html.match(/class="bw-pick"/g) || []).length, 4);
  assert.doesNotMatch(html, /onsubmit=|Preview search|37 places/);
});
test('Big White: collapsed planning and no stale status or missing cards', () => {
  const html = renderBody({ count: 1, status: null, activeSlugs: ['snowshoe-sam-s'] });
  assert.equal((html.match(/<details>/g) || []).length, 3);
  assert.doesNotMatch(html, /<details open|Opening planned|Opens November|undefined/);
  assert.equal((html.match(/class="bw-pick"/g) || []).length, 1);
  assert.match(html, /1 place to explore/);
  assert.match(styles, /grid-template-columns:repeat\(2,1fr\)/);
  assert.match(styles, /scroll-snap-type:x mandatory/);
  assert.match(styles, /body\.big-white-page/);
});
