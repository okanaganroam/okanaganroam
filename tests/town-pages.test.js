const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TOWNS, has, styles, renderBody } = require('../town-pages');
const root = path.join(__dirname, '..', 'public');
const french = {};
for (const f of fs.readdirSync(path.join(__dirname, '..', 'data', 'french'))) {
  try { Object.assign(french, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', f), 'utf8'))); } catch (e) { /* skip */ }
}
const EYEBROW = { city: 'Your Okanagan city guide', wine: 'Your Okanagan wine country guide', lake: 'Your Okanagan lakeside guide', country: 'Your Okanagan country guide' };

test('all fifteen remaining towns have a config; ski hills and Kelowna are not here', () => {
  assert.equal(Object.keys(TOWNS).length, 15);
  for (const r of ['kelowna', 'big-white', 'silverstar', 'apex', 'baldy']) assert.equal(has(r), false);
});

for (const [town, c] of Object.entries(TOWNS)) {
  test(`${town}: six tiles, scoped search, picks only for live venues, images exist, French covers every string`, () => {
    const html = renderBody(town, { count: 9, activeSlugs: c.picks.map(p => p.slug) });
    assert.match(html, new RegExp(`name="regions" value="${town}"`));
    assert.equal((html.match(/class="bw-tile"/g) || []).length, 6);
    assert.equal((html.match(/class="bw-pick"/g) || []).length, c.picks.length);
    assert.equal((html.match(/<details>/g) || []).length, 3);
    assert.doesNotMatch(html, /undefined|Big White|<details open/);
    assert.equal((renderBody(town, { count: 1, activeSlugs: [c.picks[0].slug] }).match(/class="bw-pick"/g) || []).length, 1);
    assert.match(styles(town), /body\.town-page/);
    assert.doesNotMatch(styles(town), /big-white/);
    for (const m of html.matchAll(/src="(\/images\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, m[1])), `missing image ${m[1]}`);
    assert.ok(fs.existsSync(path.join(root, c.hero)), `missing hero ${c.hero}`);
    const n = c.name;
    const keys = [c.sub, c.placeholder, `${n}, your way.`, `Search ${n}`, `Build my ${n} trip ↗`, `What’s your ${n} mood?`, EYEBROW[c.category],
      ...c.tiles.flatMap(t => [t.title, t.sub]), ...c.picks.flatMap(p => [p.tag, p.copy]), ...c.plan.flatMap(p => [p.title, p.copy, p.label])];
    for (const k of keys) assert.ok(french[k], `no French for: ${k}`);
  });
}
