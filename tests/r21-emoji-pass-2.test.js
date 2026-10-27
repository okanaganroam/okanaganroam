// Emoji pass 2 (2026-10-26): the emoji left over as UI icons after the polish pass (r20) are thin uiIcon line icons.
// - Hidden Gem / Local Favourite / Dog Friendly badges: gem, heart and paw icons (1.15em), the words unchanged; the
//   chip-width table reserves the icon too, and the French twins still read "Trésor caché" / "Coup de cœur local".
// - Roam Now: the food types found by a search (a few generic icons), the active-filter chips (pin, gem, dollar, clock,
//   no-entry), "Closed for the season" and the voice button.
// - Food & Drink and the other hub filter bars: the Filters / Regions / Open now buttons and every feature chip.
// - /browse's Use my location, My favourites and Roam Now buttons; What's On's Regions / Date buttons.
// - The hidden header trip toggle in okanagan.html (kept for app.js) draws the suitcase icon.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r21-emoji-admin-token';
process.env.OKR_TODAY_OVERRIDE = '2026-07-15';
const app = require('../server.js');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{2665}\u{2661}]/u;
const decode = (s) => String(s).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
const markupOnly = (html) => decode(html).replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
// Every button, chip and badge in a page's markup.
const controls = (html) => markupOnly(html).match(/<button\b[\s\S]*?<\/button>|<span class="chip[^"]*"[^>]*>[\s\S]*?<\/span>|<a class="fd-pop-btn[^>]*>[\s\S]*?<\/a>/g) || [];
const textOf = (html) => html.replace(/<[^>]+>/g, '');

const fixtures = [
  { slug: 'r21-gem-cafe', name: 'R21 Gem Cafe', region: 'kelowna', type: 'cafe', patio: 1, vegetarian: 1 },
  { slug: 'r21-dog-pub', name: 'R21 Dog Pub', region: 'kelowna', type: 'pub', patio: 1, dog_friendly: 1, live_music: 1, lake_view: 1 },
  { slug: 'r21-late-bar', name: 'R21 Late Bar', region: 'penticton', type: 'restaurant', open_late: 1, happy_hour: 1, kid_friendly: 1 },
].map((f, i) => app.createVenue({ ...f, latitude: 49.88 + i / 100, longitude: -119.49, rating: 4.6, description: 'A fixture place for the emoji pass tests, with pizza and craft beer.' }));
const meta = { reason: 'r21 test', batch_id: 'r21-emoji' };
app.guardedCollectionMembershipUpdate('hidden_gem', fixtures[0].id, 'add', null, meta);
app.guardedCollectionMembershipUpdate('local_favorite', fixtures[0].id, 'add', null, meta);
app.guardedCollectionMembershipUpdate('dog_friendly', fixtures[1].id, 'add', 'On leash on the patio', meta);

async function withServer(fn) {
  const srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
}

test('uiIcon: the new icons share the thin-stroke style; a size can be given in em', () => {
  for (const name of ['gem', 'heart', 'pin', 'dollar', 'clock', 'ban', 'sparkle', 'cake', 'mountain', 'palette', 'volume', 'mute']) {
    assert.ok(app.UI_ICON_PATHS[name], name);
    assert.match(app.uiIcon(name), /^<svg class="ui-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1\.8"[^>]*aria-hidden="true" focusable="false"/, name);
  }
  assert.match(app.uiIcon('gem', '1.15em'), /width="1\.15em" height="1\.15em"/);
  // app.css draws svg as a block: an icon in a run of text (a badge chip) is marked inline-block.
  assert.match(app.uiIcon('gem', '1.15em', true), /style="display:inline-block;vertical-align:-0\.15em"/);
  assert.match(app.uiIcon('gem'), /style="vertical-align:-0\.15em"/, 'the default markup is unchanged (app.js draws the same)');
});

test('Badges: Hidden Gem, Local Favourite and Dog Friendly are a line icon + the same words, no emoji', () => {
  assert.equal(app.hiddenGemBadgeHtml(), `<span class="chip hidden-gem-badge">${app.uiIcon('gem', '1.15em', true)} Hidden Gem</span>`);
  assert.equal(app.localFavouriteBadgeHtml(), `<span class="chip local-favourite-badge">${app.uiIcon('heart', '1.15em', true)} Local Favourite</span>`);
  assert.equal(app.dogFriendlyBadgeHtml('On leash'), `<span class="chip dog-friendly-badge" title="On leash">${app.uiIcon('paw', '1.15em', true)} Dog Friendly</span>`);
  for (const b of [app.hiddenGemBadgeHtml(), app.localFavouriteBadgeHtml(), app.dogFriendlyBadgeHtml('')]) {
    assert.doesNotMatch(b, EMOJI);
    assert.match(b, /<svg class="ui-icon"[^>]*aria-hidden="true"/, 'the icon is hidden from screen readers');
  }
  assert.deepEqual([app.hiddenGemBadgeHtml(), app.localFavouriteBadgeHtml(), app.dogFriendlyBadgeHtml('')].map((b) => textOf(b).trim()), ['Hidden Gem', 'Local Favourite', 'Dog Friendly']);
});

test('Badge chip widths: the table reserves the icon + words, in English and French', () => {
  const w = (html) => (/min-width:([\d.]+)em/.exec(app.withChipWidths(html)) || [])[1];
  assert.equal(w(app.hiddenGemBadgeHtml()), String(app.CHIP_TEXT_EM['[icon] Hidden Gem']));
  assert.equal(w(app.localFavouriteBadgeHtml()), String(app.CHIP_TEXT_EM['[icon] Local Favourite']));
  assert.equal(w(app.dogFriendlyBadgeHtml('x')), String(app.CHIP_TEXT_EM['[icon] Dog Friendly']));
  for (const fr of ['Trésor caché', 'Coup de cœur local', 'Chiens bienvenus', 'Accepte les chiens']) {
    assert.ok(app.CHIP_TEXT_EM[`[icon] ${fr}`] > 7, fr);
    assert.ok(w(`<span class="chip">${app.uiIcon('gem', '1.15em')} ${fr}</span>`), fr);
  }
  // Wider than the words alone: the icon's 1.15em is reserved too.
  assert.ok(app.CHIP_TEXT_EM['[icon] Hidden Gem'] > 7.3);
  for (const k of Object.keys(app.CHIP_TEXT_EM)) assert.doesNotMatch(k, EMOJI, k);
  // Plain chips are unchanged.
  assert.equal(app.withChipWidths('<span class="chip">Patio</span>'), `<span class="chip" style="box-sizing:content-box;min-width:${app.CHIP_TEXT_EM.Patio}em;text-align:center">Patio</span>`);
});

test('Cards and the venue page: badges with icons, in English and French', () => withServer(async (base) => {
  const card = app.venueCardHtml(app.getVenue(fixtures[0].id), { isHiddenGem: true, isLocalFavourite: true });
  assert.ok(card.includes(`${app.hiddenGemBadgeHtml()} ${app.localFavouriteBadgeHtml()}`));
  const v = app.getVenue(fixtures[0].id);
  const en = await (await fetch(base + app.venuePagePath(v))).text();
  assert.match(en, /<span class="chip hidden-gem-badge" style="box-sizing:content-box;min-width:7\.35em;text-align:center"><svg class="ui-icon"[^>]*>.*?<\/svg> Hidden Gem<\/span>/);
  assert.match(en, /<span class="chip local-favourite-badge" style="[^"]*"><svg class="ui-icon"[^>]*>.*?<\/svg> Local Favourite<\/span>/);
  const fr = app.renderVenuePage(v, [], [], [], { lang: 'fr' });
  assert.match(fr, /hidden-gem-badge"><svg class="ui-icon"[^>]*>.*?<\/svg> Trésor caché<\/span>/);
  assert.match(fr, /local-favourite-badge"><svg class="ui-icon"[^>]*>.*?<\/svg> Coup de cœur local<\/span>/);
  const dogPage = app.renderVenuePage(app.getVenue(fixtures[1].id), [], [], [], { lang: 'fr' });
  assert.match(dogPage, /dog-friendly-badge" title="[^"]*"><svg class="ui-icon"[^>]*>.*?<\/svg> Chiens bienvenus<\/span>/);
  // The French twin of a list page translates the words beside the icon.
  const frList = await (await fetch(base + '/fr/kelowna/cafes')).text();
  assert.match(frList, /hidden-gem-badge"[^>]*><svg class="ui-icon"[^>]*>.*?<\/svg> Trésor caché<\/span>/);
  assert.doesNotMatch(frList, /<\/svg> Hidden Gem<\/span>/);
}));

test('Food & Drink filters: Filters, Regions, Open now and every feature chip use line icons (EN + FR)', () => withServer(async (base) => {
  for (const f of app.FD_HUB_FEATURES) assert.match(f.icon, /^<svg class="ui-icon"[^>]*style="display:inline-block;/, f.key);
  for (const f of app.DOG_HUB_FEATURES) assert.match(f.icon, /^<svg class="ui-icon"/, f.key);
  for (const p of ['/food-drink', '/fr/food-drink', '/restaurants', '/fr/restaurants', '/dog-friendly', '/hidden-gems', '/browse', '/fr/browse', '/whats-on']) {
    const html = await (await fetch(base + p)).text();
    const cs = controls(html);
    assert.ok(cs.length > 3, p);
    for (const c of cs) assert.doesNotMatch(c, EMOJI, `${p}: ${c.slice(0, 160)}`);
  }
  const fd = await (await fetch(base + '/food-drink')).text();
  assert.ok(fd.includes(`<span class="fd-pop-icon" aria-hidden="true">${app.uiIcon('sparkle')}</span> <span class="fd-pop-long">What are you looking for?</span>`));
  assert.ok(fd.includes(`<span class="fd-pop-icon" aria-hidden="true">${app.uiIcon('clock')}</span> Open now`));
  assert.ok(fd.includes(`<span class="fd-pop-icon" aria-hidden="true">${app.uiIcon('pin')}</span> Regions`));
  assert.ok(fd.includes(`<span class="fd-feature-icon" aria-hidden="true">${app.uiIcon('sun', 15, true)}</span> Patio`));
  const frFd = await (await fetch(base + '/fr/food-drink')).text();
  assert.match(frFd, /<span class="fd-feature-icon" aria-hidden="true"><svg class="ui-icon"[^>]*>.*?<\/svg><\/span> Terrasse/);
  assert.match(frFd, /<\/svg><\/span> Ouvert maintenant/);
  const browse = await (await fetch(base + '/browse')).text();
  assert.ok(browse.includes(`id="bhNearMe">${app.uiIcon('pin', 15, true)} Use my location</button>`));
  assert.ok(browse.includes(`nearBtn.innerHTML = '${app.uiIcon('pin', 15, true)} Use my location';`));
  assert.ok(browse.includes(`aria-hidden="true">${app.uiIcon('heart')}</span> My favourites`));
  const frBrowse = await (await fetch(base + '/fr/browse')).text();
  assert.match(frBrowse, /id="bhNearMe"><svg class="ui-icon"[^>]*>.*?<\/svg> Utiliser ma position<\/button>/);
  assert.ok(frBrowse.includes("</svg> Utiliser ma position';"), 'the script\'s label after a location lookup, in French');
}));

test('Roam Now: food types, active-filter chips, "Closed for the season" and the voice button use line icons', () => {
  const html = app.renderPlacesMapPage();
  // Food types carry an icon name; the page sends each icon's SVG once.
  const conf = JSON.parse(/var CONF = (.*);\n/.exec(html)[1]);
  assert.ok(conf.tg.length >= 35);
  for (const t of conf.tg) assert.ok(conf.ic[t.i], `${t.k}: ${t.i}`);
  assert.ok(Object.keys(conf.ic).length <= 12, 'a few generic icons, not one per food');
  for (const svg of Object.values(conf.ic)) assert.match(svg, /^<svg class="ui-icon"/);
  for (const t of app.MAP_TAGS) assert.ok(app.UI_ICON_PATHS[t.icon], t.key);
  assert.ok(html.includes("icon: CONF.ic[CONF.tg[TAGIX[k]].i] || ''"));
  // Active-filter chips: town, price, time and "no ...".
  for (const name of ['pin', 'gem', 'dollar', 'clock', 'ban']) assert.ok(html.includes(`'${app.uiIcon(name)}'`), name);
  // Closed for the season: the words, with the leaf drawn beside them.
  assert.match(html, /seasonClosed: 'Closed for the season'/);
  assert.match(html, /seasonClosed: 'Fermé pour la saison'/);
  assert.ok(html.includes(`(st.season ? '${app.uiIcon('leaf', 15, true)} ' : '') + esc(st.text)`));
  assert.ok(html.includes(`(voiceOn ? '${app.uiIcon('volume', 20, true)}' : '${app.uiIcon('mute', 20, true)}')`));
  // A kind's label is its whole text now (it used to drop the leading emoji word).
  assert.ok(html.includes("return c ? c.textContent.replace(/^\\s+|\\s+$/g, '') : k; }"));
  const script = html.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  for (const e of ['🍂', '📍', '💎', '💲', '🕘', '🚫', '🍕', '🌮', '🍣', '🔊', '🔇']) assert.ok(!script.includes(e), e);
  for (const c of controls(html)) assert.doesNotMatch(c.replace(/✕/g, ''), EMOJI, c.slice(0, 160));
});

test('Header: the hidden trip toggle draws the suitcase icon, so no emoji is left in the page markup', () => withServer(async (base) => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'okanagan.html'), 'utf8');
  assert.ok(src.includes(`<span class="trip-toggle-icon" aria-hidden="true">${app.uiIcon('trip')}</span> <span data-i18n="trip.label">Trip</span> <span id="tripTrayCount">0</span>`));
  for (const p of ['/', '/fr', '/map', '/whats-on', '/restaurants']) {
    const html = await (await fetch(base + p)).text();
    const toggle = /<button id="tripTrayToggle">[\s\S]*?<\/button>/.exec(html)[0];
    assert.doesNotMatch(toggle, EMOJI, p);
    assert.match(toggle, /<svg class="ui-icon"/, p);
  }
}));
