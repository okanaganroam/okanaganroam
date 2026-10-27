// Site polish pass (2026-10-26):
// - Emoji used as UI icons (Add to trip, Happy hour now, Roam Now's filter chips, season tags, venue hours lines) are
//   thin inline SVG line icons (uiIcon), aria-hidden, so the accessible names are the same words.
// - A single venue photo's "Photo: …" credit is a small chip on the photo's corner (white on a dark scrim).
// - Weekly specials: a deal that only repeats its title ("Taco Tuesday" + "Tacos") is not shown.
// - Visitor photos & tips with nothing approved yet is one slim "Been here? Share a photo or tip →" row (EN + FR).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r20-polish-admin-token';
const app = require('../server.js');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;

test('specialDealRepeatsTitle: a deal that only repeats words of its title is redundant', () => {
  const r = app.specialDealRepeatsTitle;
  // Plurals, case and punctuation aside.
  assert.equal(r('Taco Tuesday', 'Tacos'), true);
  assert.equal(r('Wing Wednesday', 'Wings'), true);
  assert.equal(r('Margarita Monday', 'Margaritas'), true);
  assert.equal(r('Margarita Monday', 'margaritas!'), true);
  assert.equal(r('Wing Wednesday', 'The wings'), true, '"the" adds nothing');
  assert.equal(r('Burger & Beer Night', 'Burgers and beers'), true);
  assert.equal(r('Fries Friday', 'Fry'), true, '-ies plurals');
  assert.equal(r('Glass Tuesday', 'Glasses'), true, '-es plurals');
  assert.equal(r('Mardi tacos', 'Tacos'), true, 'French');
  assert.equal(r('Soirée côte', 'Côtes'), true, 'accents');
  assert.equal(r('Taco Tuesday', ''), true, 'an empty deal adds nothing');
  // Anything new keeps the deal.
  assert.equal(r('Taco Tuesday', '$3 tacos'), false, 'a price');
  assert.equal(r('Wing Wednesday', '60¢ wings, dine-in only'), false);
  assert.equal(r('Mac Monday', 'Mac and cheese plus a beer or wine'), false);
  assert.equal(r('Prime rib night', '10 oz prime rib dinner'), false);
  assert.equal(r('Wine Tuesday', 'Half-price bottles'), false);
  assert.equal(r('Taco Tuesday', 'Tacos and margaritas'), false);
});

test('specialLine: "Title · deal", or just the title when the deal repeats it (EN + FR)', () => {
  assert.deepEqual(app.specialLine({ title: 'Taco Tuesday', deal: '$3 tacos' }, false), { text: 'Taco Tuesday · $3 tacos', english: false });
  assert.deepEqual(app.specialLine({ title: 'Taco Tuesday', deal: 'Tacos' }, false), { text: 'Taco Tuesday', english: false });
  assert.deepEqual(app.specialLine({ title: 'Taco Tuesday', deal: 'Tacos' }, true), { text: 'Taco Tuesday', english: true });
  assert.deepEqual(app.specialLine({ title: 'Taco Tuesday', deal: 'Tacos', title_fr: 'Mardi tacos', deal_fr: 'Tacos' }, true), { text: 'Mardi tacos', english: false });
  assert.deepEqual(app.specialLine({ title: 'Wing Wednesday', deal: 'Wings', title_fr: 'Mercredi ailes', deal_fr: 'Ailes à 60 ¢' }, true), { text: 'Mercredi ailes · Ailes à 60 ¢', english: false });
  assert.equal(app.specialsCompact([{ title: 'Wing Wednesday', deal: 'Wings' }, { title: 'Taco Tuesday', deal: '$3 tacos' }], false).text, 'Wing Wednesday; Taco Tuesday · $3 tacos');
});

test('venueSpecialsHtml: no deal line under a title it only repeats; kept when it adds something', () => {
  const sp = { rows: [
    { s: { title: 'Taco Tuesday', deal: 'Tacos', price: '$3 each' }, days: 'Tue', today: true, time: '' },
    { s: { title: 'Mac Monday', deal: 'Mac and cheese plus a beer or wine', price: '$18' }, days: 'Mon', today: false, time: '4–9 PM' },
  ], checked: 'Checked Oct 26, 2026' };
  const html = app.venueSpecialsHtml(sp, false);
  assert.ok(html.includes('<span class="venue-sp-title">Taco Tuesday</span> <span class="venue-sp-price">$3 each</span> <span class="venue-sp-today">Today</span></span></span>'), 'Taco Tuesday: no deal line');
  assert.doesNotMatch(html, /venue-sp-deal">Tacos</);
  assert.ok(html.includes('<span class="venue-sp-deal">Mac and cheese plus a beer or wine</span><span class="venue-sp-time">4–9 PM</span>'));
  const fr = app.venueSpecialsHtml(sp, true);
  assert.doesNotMatch(fr, /venue-sp-deal" lang="en">Tacos</);
  assert.match(fr, /venue-sp-deal" lang="en">Mac and cheese plus a beer or wine</);
});

test('Visitor photos & tips: an empty venue gets one slim invite row that opens the same form (EN + FR)', () => {
  const v = app.createVenue({ slug: 'r20-visitor-empty', name: 'R20 Empty Cafe', region: 'kelowna', type: 'cafe', latitude: 49.88, longitude: -119.49, description: 'A fixture cafe for the polish tests.' });
  const en = app.visitorSectionHtml(app.getVenue(v.id), 'en');
  assert.match(en, /^<section class="venue-section vc-section vc-compact" id="visitor-tips" aria-labelledby="vcHead">/);
  assert.match(en, /<h2 id="vcHead" class="vc-visually-hidden">Visitor photos &amp; tips<\/h2>/, 'the heading stays for screen readers');
  assert.match(en, /<button type="button" class="vc-open vc-invite" id="vcOpen" aria-expanded="false" aria-controls="vcForm">Been here\? Share a photo or tip<span class="vc-invite-arrow" aria-hidden="true">&rarr;<\/span><\/button>/);
  assert.match(en, /<form class="vc-form" id="vcForm" novalidate hidden>/, 'the same form');
  assert.doesNotMatch(en, /vc-empty|for other visitors/);
  assert.match(en, /\.vc-section \.vc-open\.vc-invite \{[^}]*min-height: 44px;/, '44px tap target');
  const fr = app.visitorSectionHtml(app.getVenue(v.id), 'fr');
  assert.match(fr, /<h2 id="vcHead" class="vc-visually-hidden">Photos et conseils des visiteurs<\/h2>/);
  assert.match(fr, />Vous y êtes allé\? Partagez une photo ou un conseil<span class="vc-invite-arrow" aria-hidden="true">&rarr;<\/span><\/button>/);
  const page = app.renderVenuePage(app.getVenue(v.id), [], [], [], {});
  assert.ok(page.includes('class="venue-section vc-section vc-compact"'));
});

test('Venue page: a single photo\'s credit is a chip on the photo; the happy hour line and Add to trip use line icons', () => {
  const credits = require('../data/venue-photo-credits.json');
  const [img, credit] = Object.entries(credits).find(([k, c]) => c === 'Google Maps' && fs.existsSync(path.join(__dirname, '..', 'public', k)));
  const v = app.createVenue({ slug: 'r20-photo-pub', name: 'R20 Photo Pub', region: 'kelowna', type: 'pub', latitude: 49.881, longitude: -119.49, image_url: img, description: 'A fixture pub for the polish tests.' });
  const html = app.renderVenuePage(app.getVenue(v.id), [], [], [], {});
  const hero = /<div class="venue-hero venue-hero-photo"><img [^>]+>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(hero, 'the hero');
  assert.match(hero[1], /^<p class="venue-photo-credit" style="position:absolute;right:8px;bottom:8px;[^"]*background:rgba\(20,20,20,0\.62\);color:#fff;font-size:0\.72rem;[^"]*">Photo: Google Maps<\/p>$/, `credit inside the hero (${credit})`);
  assert.equal((html.match(/class="venue-photo-credit"/g) || []).length, 1, 'one credit, not a second line under the photo');
  assert.match(html, /\.venue-hero-photo \{ position: relative; \}/);
  const fr = app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang: 'fr' });
  assert.match(fr, /class="venue-photo-credit" style="position:absolute[^"]*">Photo : Google Maps<\/p>/);
  // Add to trip: line icon + the same words; the accessible name is unchanged.
  assert.ok(html.includes(`aria-label="Add R20 Photo Pub to trip">${app.APP_TRIP_LABEL_HTML}</button>`));
  assert.equal(app.APP_TRIP_LABEL_HTML.replace(/<[^>]+>/g, ''), ' Add to trip');
  assert.doesNotMatch(app.APP_TRIP_LABEL_HTML, EMOJI);
  assert.equal(app.appTripLabelHtml('\u{1F9F3} Ajouter au voyage'), `${app.uiIcon('trip')} Ajouter au voyage`);
  assert.equal(app.appTripLabelHtml('✓ Dans le voyage'), `${app.uiIcon('check')} Dans le voyage`);
  assert.equal(app.appTripLabelHtml('Add to trip'), 'Add to trip');
});

test('uiIcon: thin currentColor line icons, aria-hidden, the same markup app.js draws for the trip buttons', () => {
  for (const name of Object.keys(app.UI_ICON_PATHS)) {
    const svg = app.uiIcon(name);
    assert.match(svg, /^<svg class="ui-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1\.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"/, name);
    assert.doesNotMatch(svg, /\/>/, `${name}: elements close explicitly, so innerHTML reads back the same`);
  }
  assert.equal(app.uiIcon('nope'), '');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  for (const name of ['trip', 'check']) assert.ok(appJs.includes(`${name}: '${app.UI_ICON_PATHS[name]}'`), `app.js draws the same ${name} icon`);
});

test('Roam Now: the filter chips and the happy hour card line carry line icons, not emoji', () => {
  const html = app.renderPlacesMapPage();
  const chips = html.match(/<button type="button" class="pm-chip"[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.ok(chips.length > 20, 'the quick row and the panel');
  for (const c of chips) assert.doesNotMatch(c, EMOJI, c.slice(0, 120));
  assert.ok(html.includes(`data-pm-feat="happy" aria-pressed="false"><span aria-hidden="true">${app.uiIcon('cocktail')}</span> Happy hour now</button>`));
  assert.ok(html.includes(`'<span class="pm-hh' + (p.hhs.now ? ' is-now' : '') + '">${app.uiIcon('cocktail')} ' + esc(p.hhs.text)`), 'the card\'s happy hour line');
  assert.doesNotMatch(html, /'">🍸 ' \+ esc\(p\.hhs\.text\)/);
});

test('Homepage: the seasonal guide link is a pill like "See all categories", in English and French', () => {
  const html = app.renderMoodCardsHTML({ now: new Date('2026-10-15T12:00:00-07:00') });
  const heading = /<div class="discover-heading discover-heading-split">([\s\S]*?)<\/div>/.exec(html)[1];
  const links = heading.match(/<a class="[^"]*"/g);
  assert.deepEqual(links, ['<a class="discover-heading-link home-see-all mood-season-link"', '<a class="discover-heading-link home-see-all"']);
  assert.doesNotMatch(heading, /&rarr;/);
  assert.match(heading, /<span class="home-fr" lang="fr">L’automne dans l’Okanagan : nos guides saisonniers<\/span>/);
});
