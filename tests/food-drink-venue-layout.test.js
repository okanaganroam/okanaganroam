// Food & Drink venue pages (2026-11-07): every English Food & Drink page uses Copper's approved layout, built from the
// venue's own record. Sections, tabs and buttons appear only when there is something behind them, Copper's own wording
// reaches no other venue, and French pages keep their existing layout.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const app = require('../server.js');
const db = require('../db.js');
const layout = require('../food-drink-venue-layout.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [[from, to]]])));
const NOW = new Date('2026-11-07T20:00:00Z');
let n = 0;
const mk = (o) => app.createVenue({ region: 'kelowna', type: 'restaurant', slug: `fd-layout-fixture-${++n}`, latitude: 49.88 + n / 1000, longitude: -119.49, ...o });
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now: NOW, lang });
const menu = (v, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-01')").run(v.id, JSON.stringify({ sections }));
const links = (v, l) => db.prepare('INSERT OR REPLACE INTO venue_links (venue_id, menu_url, booking_url) VALUES (?, ?, ?)').run(v.id, l.menu || null, l.booking || null);
const collection = (v, kind, note) => {
  const c = db.prepare('SELECT id FROM collections WHERE kind = ?').get(kind);
  db.prepare("INSERT INTO collection_items (collection_id, content_type, content_id, note) VALUES (?, 'venue', ?, ?)").run(c.id, v.id, note || null);
};
const meta = { reason: 'layout fixture', batch_id: 'test-fd-layout' };
const tabs = (html) => [...((/<nav class="fd-section-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html) || [])[1] || '').matchAll(/<a href="#([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);
// The venue's own layout (not the site header, footer or page scripts).
const layoutOf = (html) => { const i = html.indexOf('<div class="fd-layout">'); return i < 0 ? '' : html.slice(i, html.indexOf('<footer', i) < 0 ? undefined : html.indexOf('<footer', i)); };

const rich = mk({ name: 'Orchard Row Test Kitchen', type: 'restaurant', price: 3, rating: 4.4, reviews: 51, hours: open('11:00', '22:00'), phone: '+12505550102', website: 'https://example.com/orchard',
  address: '1 Test Street, Kelowna, BC', image_url: '/images/food-drink/restaurants-1200.jpg', dog_friendly: 1, kid_friendly: 1, gluten_free: 1, patio: 1, happy_hour: 1,
  description: 'First sentence of the sample. Second sentence of the sample. ' + 'A longer sentence that keeps the description going past the short opening. '.repeat(4) });
menu(rich, [{ name: 'Starters', items: [{ name: 'Beet Salad', price: '16', description: 'Sample.' }] }, { name: 'Mains', items: [{ name: 'Short Rib', price: '38', description: 'Sample. Vegan option available.' }] }]);
links(rich, { menu: 'https://example.com/orchard/menu', booking: 'https://example.com/orchard/book' });
collection(rich, 'dog_friendly', 'Dogs welcome on the patio only.');
app.guardedHappyHourUpdate(rich.id, null, { times: { tue: [['16:00', '18:00']] }, source_url: 'https://example.com/hh', checked_at: '2026-11-06' }, meta, NOW);
app.guardedHappyHourDealsUpdate(rich.id, null, { deals: [{ text: 'Sample wine', price: '$7' }], source_url: 'https://example.com/hh', checked_at: '2026-11-06' }, meta, NOW);
app.guardedWeeklyNightsUpdate(rich.id, app.currentWeeklyNightsJson(rich.id), { nights: [{ days: ['thu'], kind: 'live_music', title: 'Thursday Music', start: '19:00', end: '21:00' }], source_url: 'https://example.com/m', checked_at: '2026-11-06' }, meta, NOW);

const basic = mk({ name: 'Basic Test Cafe', type: 'cafe', price: 1, hours: open('08:00', '15:00'), description: 'A small sample cafe.', address: '2 Test Street, Kelowna, BC' });
const noHours = mk({ name: 'No Hours Test Pub', type: 'pub', price: 2, description: 'A sample pub with no recorded hours.', website: 'https://example.com/pub', address: '3 Test Street, Kelowna, BC' });
const bare = mk({ name: 'Bare Test Bistro', type: 'restaurant', latitude: null, longitude: null });
const ownMenuOnly = mk({ name: 'Own Menu Test Brewery', type: 'brewery', hours: open('12:00', '20:00'), description: 'A sample brewery.', address: '4 Test Street, Kelowna, BC' });
links(ownMenuOnly, { menu: 'https://example.com/brewery/menu' });
const nightsOnly = mk({ name: 'Nights Only Test Distillery', type: 'distillery', description: 'A sample distillery.', address: '5 Test Street, Kelowna, BC' });
app.guardedWeeklyNightsUpdate(nightsOnly.id, app.currentWeeklyNightsJson(nightsOnly.id), { nights: [{ days: ['thu'], kind: 'trivia', title: 'Thursday Trivia', start: '19:00', end: '21:00' }], source_url: 'https://example.com/t', checked_at: '2026-11-06' }, meta, NOW);
const crossListed = mk({ name: 'Cross Listed Test Winery', type: 'winery', hours: open('11:00', '17:00'), description: 'A sample winery.', address: '6 Test Street, Kelowna, BC' });
collection(crossListed, 'fd_restaurants');
const plainWinery = mk({ name: 'Plain Test Winery', type: 'winery', hours: open('11:00', '17:00'), description: 'A sample winery.', address: '7 Test Street, Kelowna, BC' });
const copper = mk({ name: 'Copper Brewing Co.', type: 'brewery', slug: 'copper-brewing-co', price: 2, hours: open('11:00', '22:00'), description: 'A sample brewery.', address: '8 Test Street, Kelowna, BC', dog_friendly: 1, kid_friendly: 1, gluten_free: 1 });
const copperLike = mk({ name: 'Other Test Brewery', type: 'brewery', hours: open('11:00', '22:00'), description: 'A sample brewery.', address: '9 Test Street, Kelowna, BC', dog_friendly: 1, kid_friendly: 1, gluten_free: 1 });

test('a Food & Drink page uses the shared layout and says what is recorded', () => {
  const html = page(rich);
  assert.match(html, /<body[^>]*class="[^"]*fd-venue-page/);
  assert.match(html, /food-drink-venue\.css\?v=/);
  assert.match(html, /food-drink-venue\.js\?v=/);
  assert.doesNotMatch(html, /copper-venue|copper-page|class="cp-/);
  assert.match(html, /<h1 class="venue-desktop-title">Orchard Row Test Kitchen<\/h1>/);
  assert.match(html, /<h1 class="venue-mobile-title">Orchard Row Test Kitchen<\/h1>/);
  assert.match(html, /\$\$\$ \(expensive\)/, 'the price level is explained');
  assert.match(html, /Menu examples \$16–38/);
  assert.deepEqual(tabs(html).map((t) => t[1]), ['Overview', 'Menu', 'Deals & nights', 'Hours']);
  for (const [id] of tabs(html)) assert.match(html, new RegExp(`id="${id}"`), `tab target ${id} exists`);
  assert.match(html, /href="#fdMenu">\S* Menu &amp; prices/);
  assert.match(html, /href="#venueHours">\S* Hours/);
  assert.match(html, /data-track="directions"/);
  assert.match(html, /See the full menu \(2 dishes\)/);
  assert.match(html, /See Orchard Row Test Kitchen’s own menu/);
  assert.match(html, /class="cta secondary" href="https:\/\/example\.com\/orchard\/book"[^>]*>Book</);
});

test('the save controls are explained for every venue, in the words asked for', () => {
  for (const v of [rich, basic, bare, nightsOnly]) {
    const html = page(v);
    assert.match(html, /<strong>Favorite<\/strong> saves this place for later\./);
    assert.match(html, /<strong>Add to trip<\/strong> puts this place on your trip list\./);
    assert.match(html, /aria-describedby="fdFavoriteHelp"|id="fdFavoriteHelp"/);
  }
});

test('dog wording stays what is recorded: a patio-only note is never "dogs allowed"', () => {
  const html = page(rich);
  assert.match(html, /<span>🐾 Dogs welcome on the patio only<\/span>/);
  assert.match(html, /<strong>Dogs:<\/strong> Dogs welcome on the patio only\./);
  assert.match(html, /Gluten-free options/);
  assert.doesNotMatch(html, /gluten-free (?:safe|guarantee)|celiac/i);
  const plain = layout.highlightsFor({ dog_friendly: 1 }, undefined, {});
  assert.deepEqual(plain, [['🐾', 'Dog-friendly']]);
  assert.deepEqual(layout.highlightsFor({ dog_friendly: 1 }, 'x'.repeat(60), {}), [['🐾', 'Dog policy: see details']]);
});

test('a short record gets a complete page with no empty cards, no tabs and no invented sections', () => {
  const html = page(basic);
  assert.match(html, /fd-venue-page/);
  assert.deepEqual(tabs(html), [], 'one section: no section navigation');
  assert.doesNotMatch(html, /id="fdMenu"|id="fdDeals"/);
  assert.doesNotMatch(html, /Menu &amp; prices<\/a>/);
  assert.match(html, /A small sample cafe\./);
  assert.match(html, /\$ \(inexpensive\)/);
  assert.match(html, /<div class="venue-section venue-hours" id="venueHours">/);
  assert.doesNotMatch(html, /fd-highlights/);
  assert.doesNotMatch(layoutOf(html), /unavailable|not available|Check with|coming soon/i);
  assert.doesNotMatch(html, /Menu examples/);
});

test('no recorded hours: no Hours button or box, and the page never says Closed', () => {
  const html = page(noHours);
  const body = html.slice(html.indexOf('<div class="fd-layout">'), html.indexOf('</aside>'));
  assert.doesNotMatch(body, /id="venueHours"|#venueHours/);
  assert.doesNotMatch(body, /Closed|venue-open-status/);
  assert.match(body, /data-track="directions"/);
  assert.match(body, /Visit their website/);
});

test('nothing recorded: the page still stands, with no buttons, no photo block and no filler', () => {
  const html = page(bare);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'one name heading');
  assert.match(html, /<h1 class="venue-desktop-title">Bare Test Bistro<\/h1>/);
  assert.match(html, /<body[^>]*fd-no-photo/, 'shown at every width');
  assert.doesNotMatch(html, /<div class="(?:venue-hero|vg-mosaic)/, 'no empty photo slot, no stock photo');
  assert.doesNotMatch(html, /<div class="venue-cta-row"/);
  assert.deepEqual(tabs(html), []);
  assert.doesNotMatch(html, /class="fd-card"><\/section>|<section class="fd-card" id="fdMenu"/);
});

test('a menu link alone is a real menu section; a deals section is labelled by what it holds', () => {
  const own = page(ownMenuOnly);
  assert.match(own, /<section class="fd-card" id="fdMenu"><h2>Menu &amp; prices/);
  assert.match(own, /href="https:\/\/example\.com\/brewery\/menu" target="_blank" rel="nofollow noopener">See the menu/);
  assert.deepEqual(tabs(own).map((t) => t[1]), ['Overview', 'Menu', 'Hours']);
  const nights = page(nightsOnly);
  assert.deepEqual(tabs(nights), [], 'a single section needs no tabs');
  assert.match(nights, /id="fdDeals"/);
  assert.deepEqual([layout.dealsWording(true, true, ['trivia']).tab, layout.dealsWording(true, false, []).tab, layout.dealsWording(false, true, ['trivia']).tab, layout.dealsWording(false, true, ['live_music']).tab, layout.dealsWording(true, true, ['live_music']).tab],
    ['Deals & trivia', 'Deals', 'Trivia', 'Weekly nights', 'Deals & nights']);
});

test('Copper wording and booking reach Copper only', () => {
  const c = page(copper);
  assert.match(c, /Locally brewed beer, comfort food and a dog-friendly patio/);
  assert.match(c, /Dogs on the patio/);
  assert.match(c, /saves Copper for later/);
  for (const v of [rich, basic, noHours, bare, ownMenuOnly, nightsOnly, crossListed, copperLike]) {
    const html = page(v);
    const body = html.slice(html.indexOf('<div class="fd-layout">'), html.lastIndexOf('</aside>') + 8);
    assert.doesNotMatch(body, /Copper|Landmark District|Call to book trivia|a bite with your beer/i, v.name);
  }
  const like = page(copperLike);
  assert.match(like, /Dog-friendly/);
  assert.doesNotMatch(like, /Dogs on the patio|Kids welcome/);
  assert.doesNotMatch(like, /A bite with your beer/i);
});

test('wineries: only those also listed in Food & Drink get the layout', () => {
  assert.match(page(crossListed), /fd-venue-page/);
  assert.doesNotMatch(page(plainWinery), /<body[^>]*fd-venue-page|<div class="fd-layout">/);
});

test('French pages and redirects keep their existing layout', () => {
  const fr = app.renderVenuePage(app.getVenue(rich.id), [], [], [], { now: NOW, lang: 'fr' });
  assert.doesNotMatch(fr, /<body[^>]*fd-venue-page|<div class="fd-layout">/);
  assert.match(fr, /class="venue-layout"/);
});

test('the intro is whole sentences; the rest of a long description is kept in an expandable section', () => {
  const { intro, rest } = layout.introFrom('One short sentence. Another one. ' + 'And a very long sentence goes on and on. '.repeat(10));
  assert.equal(intro, 'One short sentence. Another one. And a very long sentence goes on and on. And a very long sentence goes on and on. And a very long sentence goes on and on. And a very long sentence goes on and on. And a very long sentence goes on and on.'.slice(0, intro.length));
  assert.ok(intro.length <= 300 && rest);
  assert.deepEqual(layout.introFrom('Just one sentence.'), { intro: 'Just one sentence.', rest: false });
  assert.deepEqual(layout.introFrom(''), { intro: '', rest: false });
  const html = page(rich);
  assert.match(html, /<details class="fd-details fd-card"><summary>More about Orchard Row Test Kitchen &amp; all venue features<\/summary><p class="venue-description">First sentence of the sample\. Second sentence[^<]*A longer sentence/);
  const short = page(basic);
  assert.equal((short.match(/<p class="venue-description">/g) || []).length, 1, 'a short description is shown once, not repeated in the fold');
});

test('Hidden Gem and Local Favourite recognition, and the reason given for it, stay near the top of the page', () => {
  const gem = mk({ name: 'Gem Test Cafe', type: 'cafe', hours: open('08:00', '15:00'), description: 'A sample cafe.', address: '10 Test Street, Kelowna, BC' });
  collection(gem, 'hidden_gem', 'A sample reason this place is a hidden gem.');
  const html = page(gem);
  const body = layoutOf(html);
  const summary = body.slice(0, body.indexOf('</section>'));
  assert.match(summary, /class="chips fd-recognition"/);
  assert.match(summary, /Why it\u2019s a Hidden Gem/);
  assert.match(summary, /A sample reason this place is a hidden gem\./);
  assert.doesNotMatch(layoutOf(page(basic)), /fd-recognition|Why it\u2019s a Hidden Gem/, 'other venues are not marked');
});

test('menu examples and price helpers', () => {
  const sections = [{ name: 'A', items: [{ name: 'a1', price: '10' }, { name: 'a2', price: '11' }] }, { name: 'B', items: [{ name: 'b1', price: '20' }] }, { name: 'C', items: [{ name: 'c1', price: 'MP' }] }];
  assert.deepEqual(layout.pickMenuExamples(sections).map((i) => i.name), ['a1', 'b1', 'c1']);
  assert.deepEqual(layout.pickMenuExamples(sections, ['b1', 'nope']).map((i) => i.name), ['b1']);
  assert.equal(layout.menuPriceHint([{ price: '10' }, { price: '20' }], (p) => `$${p}`), 'Menu examples $10–20');
  assert.equal(layout.menuPriceHint([{ price: 'MP' }], (p) => p), '');
  assert.equal(layout.priceLegend(1), '$ (inexpensive)');
  assert.equal(layout.priceLegend(4), '$$$$ (very expensive)');
  assert.equal(layout.priceLegend(null), '');
});

test.after(() => {
  try { db.close && db.close(); } catch (e) { /* already closed */ }
});
