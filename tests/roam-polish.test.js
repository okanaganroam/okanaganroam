'use strict';
// Roam design system (2026-11-11): the shared stylesheet reaches list and town pages only, once, and changes no markup.
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
