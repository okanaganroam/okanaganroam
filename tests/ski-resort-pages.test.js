const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RESORTS, has, styles, renderBody } = require('../ski-resort-pages');
const season = { official: 'https://example.com/', links: { snow: 'https://example.com/snow', webcams: 'https://example.com/cams', tickets: 'https://example.com/tix' } };
const french = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'ski-resort-layout-2026-11-04.json'), 'utf8'));
const bigWhiteFrench = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'big-white-layout-2026-11-04.json'), 'utf8'));

test('only SilverStar, Apex and Baldy use the ski-resort layout', () => {
  assert.deepEqual(Object.keys(RESORTS).sort(), ['apex', 'baldy', 'silverstar']);
  assert.equal(has('big-white'), false);
  assert.equal(has('kelowna'), false);
});

for (const region of Object.keys(RESORTS)) {
  test(`${region}: scoped search, six tiles, picks only for live venues, collapsed planning`, () => {
    const all = RESORTS[region].picks.map(p => p[0]);
    const html = renderBody(region, { count: 12, status: 'Opens soon', activeSlugs: all, season });
    assert.match(html, new RegExp(`name="regions" value="${region}"`));
    assert.match(html, /12 places to explore/);
    assert.equal((html.match(/class="bw-tile"/g) || []).length, 6);
    assert.equal((html.match(/class="bw-pick"/g) || []).length, 4);
    assert.equal((html.match(/<details>/g) || []).length, 3);
    assert.doesNotMatch(html, /undefined|<details open/);
    const one = renderBody(region, { count: 1, status: null, activeSlugs: [all[0]], season });
    assert.equal((one.match(/class="bw-pick"/g) || []).length, 1);
    assert.match(one, /1 place to explore/);
    assert.match(one, /Check resort status/);
    assert.match(styles(region), /body\.ski-resort-page/);
    assert.doesNotMatch(styles(region), /big-white-page|big-white-2610/);
  });
  test(`${region}: every visible string has French and every image file exists`, () => {
    const html = renderBody(region, { count: 5, status: null, activeSlugs: RESORTS[region].picks.map(p => p[0]), season });
    const r = RESORTS[region];
    const keys = [`${r.name}, your way.`, `Search ${r.name}`, r.placeholder, `Build my ${r.name} trip ↗`, r.guideLabel,
      ...r.picks.flatMap(p => [p[3], p[5]]), ...r.plan.flatMap(p => [p[1], p[3]])];
    for (const k of keys) assert.ok(french[k] || bigWhiteFrench[k], `missing French: ${k}`);
    const root = path.join(__dirname, '..', 'public');
    for (const m of html.matchAll(/src="(\/images\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, m[1])), `missing image ${m[1]}`);
    assert.ok(fs.existsSync(path.join(root, r.hero)));
  });
}
