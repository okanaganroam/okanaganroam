'use strict';
// Roam design system (2026-11-11): the shared stylesheet reaches list and town pages only, once, and changes no markup.
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const polish = require('../roam-polish');

const page = (cls) => `<!DOCTYPE html><html lang="en"><head><title>x</title></head><body class="${cls}"><main><h1>Hi</h1></main></body></html>`;

test('tokens and utilities: type pair, three shadows, hover zoom, live dot, reduced motion', () => {
  for (const s of ['--rp-serif', '--rp-sans', '--rp-shadow-1', '--rp-shadow-2', '--rp-shadow-3', '.rp-zoom:hover img', '.rp-live-dot::after', '@keyframes rpPulse', 'prefers-reduced-motion', '.rp-pill', '.rp-grid']) assert.ok(polish.css.includes(s), s);
  assert.ok(polish.css.length > 2000, 'long enough to be served as a shared stylesheet');
});

test('the block is added to list and town pages, before </head>, exactly once', () => {
  for (const cls of ['golf-page outdoor-page fd-page', 'golf-page outdoor-page town-page', 'golf-page outdoor-page kelowna-page']) {
    const out = polish.apply(page(cls));
    assert.equal(out.split(polish.block).length - 1, 1, cls);
    assert.ok(out.indexOf(polish.block) < out.indexOf('</head>'));
    assert.equal(polish.apply(out), out, 'applying twice adds nothing');
    assert.equal(out.replace(polish.block + '\n', ''), page(cls), 'nothing else on the page changes');
  }
});

test('other pages are left alone', () => {
  for (const cls of ['golf-page', 'golf-page outdoor-page whatson-page', 'golf-page not-fd-page-x']) assert.equal(polish.apply(page(cls)), page(cls), cls);
  assert.equal(polish.apply('{"json":true}'), '{"json":true}');
  assert.equal(polish.apply(null), null);
});

test('the sticky filter bar sits under the site header, and phones keep only the pill row', () => {
  assert.match(polish.css, /\.fd-toolbar\{position:sticky;top:calc\(var\(--rp-header-h\) \+ 10px\)/);
  assert.match(polish.css, /@media\(max-width:560px\)\{:root\{--rp-header-h:53px\}\}/);
  assert.match(polish.css, /\.fd-open-status\[data-fd-open="open"\]::after\{[^}]*animation:rpPulse/);
});

test('venue template: emoji become line icons in the highlights, the facts and the Hours button; words are kept', () => {
  const html = '<div class="fd-highlights"><span>🐾 Dog-friendly</span><span>🌿 Patio</span><span>✨ Something new</span></div>'
    + '<div class="venue-section venue-key-info"><h2>Your visit, made easy</h2><div class="detail-row"><span class="label">Address</span><span>1 Main St</span></div>\n<div class="detail-row"><span class="label">Téléphone</span><span>250</span></div>\n</div>'
    + '<a class="cta secondary" href="#venueHours">🕒 Hours</a>';
  const out = polish.venueIcons(html);
  assert.doesNotMatch(out, /🐾|🌿|🕒/);
  assert.match(out, /<span><svg class="rp-icon"[\s\S]*?<\/svg>Dog-friendly<\/span>/);
  assert.match(out, /<span>✨ Something new<\/span>/, 'an emoji without a line icon is left as it is');
  assert.match(out, /<span class="label"><svg class="rp-icon"[\s\S]*?<\/svg>Address<\/span><span>1 Main St<\/span>/);
  assert.match(out, /<svg class="rp-icon"[\s\S]*?<\/svg>Téléphone<\/span>/);
  assert.match(out, /href="#venueHours"><svg class="rp-icon"[\s\S]*?<\/svg>Hours<\/a>/);
  assert.equal(out.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/[🐾🌿🕒] ?/gu, ''), html.replace(/[🐾🌿🕒] ?/gu, ''), 'only icons change');
  const page = '<!DOCTYPE html><html><head></head><body class="golf-page restaurant-page fd-venue-page">' + html + '</body></html>';
  assert.match(polish.apply(page), /class="rp-icon"/);
});

test('venue map card: the pin comes from the coordinates; no card without them or outside the picture', () => {
  const map = { src: '/images/regions/maps/kelowna-d.webp', w: 646, h: 240, z: 12, view: [49.8888, -119.5035] };
  const base = { map, href: 'https://www.google.com/maps/search/?api=1&query=49.8888,-119.5035', label: 'Open in Google Maps', credit: '© OpenStreetMap · Geoapify', esc: (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;') };
  const centre = polish.mapCard({ ...base, lat: 49.8888, lng: -119.5035 });
  assert.match(centre, /--rp-pin-x:323px;--rp-pin-y:120px/, 'the map centre is the middle of the picture');
  assert.match(centre, /class="rp-map" href="https:\/\/www\.google\.com\/maps[^"]*" rel="nofollow noopener" target="_blank" data-track="directions"/);
  assert.match(centre, /OpenStreetMap/);
  const east = polish.mapCard({ ...base, lat: 49.8888, lng: -119.49 });
  assert.ok(Number(/--rp-pin-x:([\d.]+)px/.exec(east)[1]) > 323, 'further east is further right');
  assert.equal(polish.mapCard({ ...base, lat: 49.8888, lng: -119.3 }), '', 'outside the picture: no card');
  assert.equal(polish.mapCard({ ...base, lat: NaN, lng: -119.5 }), '');
  assert.equal(polish.mapCard({ ...base, lat: 49.8888, lng: -119.5035, map: null }), '');
});

test('older filter layout: the search box and the filter pills are wrapped in one sticky bar, nothing else changes', () => {
  const search = '<div class="fd-search"><label class="visually-hidden" for="fdSearch">Search</label><input type="search" id="fdSearch" class="fd-search-input"></div>';
  const controls = '<div class="fd-controls js"><div class="fd-pop"><button class="fd-pop-btn" id="fdFeaturesBtn">Filters</button><div class="fd-pop-panel" id="fdFeaturesPanel" hidden><div>Patio</div></div></div><button class="fd-pop-btn" id="fdOpenNow">Open now</button></div>';
  const wrap = (inner) => `<!DOCTYPE html><html><head></head><body class="golf-page outdoor-page fd-page fd-scoped-page"><main>${inner}<section><ul class="card-grid"></ul></section></main></body></html>`;
  const together = polish.apply(wrap(search + '\n' + controls));
  assert.ok(together.includes('<div class="rp-filterbar rp-filterbar-search">' + search + '\n' + controls + '</div><section>'), 'both in one bar');
  assert.equal(together.replace('<div class="rp-filterbar rp-filterbar-search">', '').replace(controls + '</div><section>', controls + '<section>').replace(polish.block + '\n', ''), wrap(search + '\n' + controls), 'only the wrapper is added');
  const apart = polish.apply(wrap(search + '<nav class="fd-type-tabs">All</nav>' + controls));
  assert.ok(apart.includes('<nav class="fd-type-tabs">All</nav><div class="rp-filterbar">' + controls + '</div><section>'), 'something between them: only the pills are wrapped');
  assert.equal(polish.apply(together), together, 'applying twice adds nothing');
  const newer = wrap('<div class="fd-toolbar">' + search + controls + '</div>');
  assert.doesNotMatch(polish.apply(newer), /<div class="rp-filterbar/, 'a page that already has the toolbar is left alone');
  assert.doesNotMatch(polish.apply(wrap('<p>No filters here</p>')), /<div class="rp-filterbar/);
  assert.match(polish.css, /\.rp-filterbar\{position:sticky;top:calc\(var\(--rp-header-h\) \+ 10px\)/);
});
