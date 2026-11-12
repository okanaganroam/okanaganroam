// Owner portal polish (2026-11-08), restaurants: a shorter checklist panel (quick ones + 3, the rest behind "Show all",
// "See what's done" folded), price range inside the average-spend section (not asked twice), photo wording without
// "Slide it" on the edit link, a small Help button on phones, more cuisine labels, help text that matches the panel, a
// signed-in intro without a time total, and the non-alcoholic OPTIONS badge no longer exempting happy hour.
// Other types' edit pages are unchanged. Runs on a throwaway database; run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-portal-polish-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const pc = require('../portal-completeness.js');
const app = require('../server.js');
const frenchText = require('../french-text.js');

const TODAY = '2026-11-08';
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Polish ${type} ${++n}`, slug: `polish-${type}-${n}`, region: 'kelowna', type, latitude: 49.885 + n / 1000, longitude: -119.49,
  rating: 4.4, address: '10 Test St', phone: '250-555-0101', description: 'A fixture used only by the portal polish tests.', image_url: '/images/venues/15-park-bistro-2610.jpg', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());

test('panel: quick ones + the next 3, the rest behind "Show all (N more)"; "See what\'s done" is folded; EN and FR', () => {
  const r = pc.scoreCompleteness({ address: '1 Main St', latitude: 1, longitude: 1, phone: '250-555-0100' }, { today: TODAY });
  assert.ok(r.later.length > pc.LATER_SHOWN);
  const en = pc.renderCompleteness(r, {});
  const lists = en.slice(en.indexOf('When you have a few minutes'));
  const shown = lists.slice(0, lists.indexOf('<details class="op-cb-all">'));
  assert.equal((shown.match(/class="op-cb-row"/g) || []).length, pc.LATER_SHOWN, 'three longer items before Show all');
  assert.match(en, new RegExp(`<details class="op-cb-all"><summary>Show all \\(${r.later.length - pc.LATER_SHOWN} more\\)</summary>`));
  for (const it of r.later) assert.ok(en.includes(`data-cb-item="${it.key}"`), `${it.key} still in the page`);
  assert.match(en, /<details class="op-cb-done"><summary>See what’s done<\/summary><div class="op-cb-groups">/);
  assert.doesNotMatch(en, /<details class="op-cb-done" open/);
  const fr = pc.renderCompleteness(r, { fr: true });
  assert.match(fr, /<summary>Tout afficher \(\d+ de plus\)<\/summary>/);
  assert.match(fr, /<summary>Voir ce qui est fait<\/summary>/);
  // Three or fewer longer items: no Show all.
  const few = pc.renderCompleteness({ ...r, later: r.later.slice(0, 3) }, {});
  assert.doesNotMatch(few, /op-cb-all/);
});

test('happy hour: the non-alcoholic OPTIONS badge (mocktails) no longer exempts a restaurant', () => {
  const r = pc.scoreCompleteness({ nonalcoholic: true, hasHappyHour: false }, { today: TODAY });
  assert.ok(r.missing.some((i) => i.key === 'happy_hour'));
  assert.equal(pc.scoreCompleteness({ nonalcoholic: true, hasHappyHour: false, declaredNone: ['happy_hour'] }, { today: TODAY }).missing.some((i) => i.key === 'happy_hour'), false, '"We don\'t have one" answers it');
});

test('price range sits inside Average spend for a restaurant (asked once); other types keep their own Price range section', async () => {
  const v = mk('restaurant', { price: 2 });
  const html = await get(`/owner/${tokenFor(v.id)}`);
  assert.doesNotMatch(html, /<details class="op-fold op-sec" id="price"/, 'no separate Price range section');
  assert.ok(html.indexOf('class="op-price-sub" id="price"') > html.indexOf('id="avgspend"'), 'price inside the spend section');
  assert.match(html, /<span id="opPriceLabel">Price level on your page<\/span> <span class="op-fold-hint">\$\$: \$15–30 per person<\/span>/);
  assert.match(html, /<select id="opPrice"/);
  assert.match(html, /<option value="2" selected>/);
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  assert.match(fr, /Niveau de prix sur votre fiche/);
  const pub = mk('brewery', { price: 2 });
  const pubHtml = await get(`/owner/${tokenFor(pub.id)}`);
  assert.match(pubHtml, /<details class="op-fold op-sec" id="price" data-task="more">/, 'pubs keep the section');
  assert.doesNotMatch(pubHtml, /op-price-sub/);
});

test('photo section on the edit link: no "Slide it", the previews are explained; the upload success turns green', async () => {
  const v = mk('restaurant');
  const html = await get(`/owner/${tokenFor(v.id)}`);
  const pos = html.slice(html.indexOf('id="opPos"'), html.indexOf('id="opPos"') + 3000);
  if (html.includes('id="opPos"')) {
    assert.doesNotMatch(pos, /Slide it so the best part shows/);
    assert.match(pos, /The two previews below show how it looks on a computer and on a phone\./);
  }
  assert.match(html, /progress\.classList\.toggle\('op-ok', !!sent\);/);
  assert.match(html, /#ofProgress\.op-ok \{ color: #1E6B3A;/);
  const cafe = await get(`/owner/${tokenFor(mk('distillery').id)}`); // cafés have the setup and checklist since 2026-11-10
  assert.doesNotMatch(cafe, /op-ok/);
});

test('Help button on phones is a small "?" at the top right that scrolls with the page (restaurants only); its name stays "Help"', async () => {
  const html = await get(`/owner/${tokenFor(mk('restaurant').id)}`);
  // Café test 1 (2026-11-11): 83px, centred on the "Owner edit page" line, clear of the page title.
  assert.match(html, /@media \(max-width: 699px\) \{[\s\S]*body\.owner-page \.ohb-btn, body\.owner-page:has\(\.op-unsent:not\(\[hidden\]\)\) \.ohb-btn \{ position: absolute; top: 83px; bottom: auto;/);
  assert.match(html, /<button type="button" class="ohb-btn" id="ohbBtn"[^>]*><span class="ohb-q" aria-hidden="true">\?<\/span>Help<\/button>/);
  const winery = await get(`/owner/${tokenFor(mk('distillery').id)}`);
  assert.doesNotMatch(winery, /position: absolute; top: 83px/);
});

// 2026-11-09: the list became 45 food labels (Asian and Fast Food moved out: too general / a kind of place) with up
// to 3 picks; tests/cuisine-model.test.js covers it. Comfort food stays, with its French name.
test('cuisine: Comfort food is pickable, with its French name', async () => {
  assert.ok(app.OWNER_CUISINES.includes('Comfort food'));
  assert.equal(frenchText.FR_CUISINE['Comfort food'], 'Cuisine réconfortante');
  const html = await get(`/owner/${tokenFor(mk('restaurant').id)}`);
  assert.match(html, /data-cu="Comfort food" data-cu-label="Comfort food" aria-pressed="false"[^>]*>Comfort food</);
});

test('help answer matches the panel (no "We\'re adding these"); signed-in restaurant intro has no time total', async () => {
  const t = app.OWNER_HELP_TOPICS.find((x) => x.id === 'page-complete');
  assert.doesNotMatch(t.a, /We’re adding these/); assert.doesNotMatch(t.aFr, /Nous ajoutons ceci/);
  assert.match(t.a, /Quick ones/); assert.match(t.a, /Show all/); assert.match(t.a, /are the last steps for most places/); assert.doesNotMatch(t.a + t.aFr + t.q + t.qFr, /%/);
  assert.match(t.aFr, /Tout afficher/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = src.indexOf('${instantOn && completeOn');
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf(': instantOn', i));
  assert.doesNotMatch(block, /5 minutes/);
  assert.match(block, /Start with the quick ones in the bar above/);
  assert.match(block, /Commencez par les éléments rapides/);
});
