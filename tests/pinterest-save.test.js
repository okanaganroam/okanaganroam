// Save to Pinterest on guide pages (2026-10-19): a plain link added by app.js on /guides/<slug> only.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const start = src.indexOf('Save to Pinterest on guide pages');
const block = src.slice(start);

test('pinterest save: only on guide detail pages, built from canonical URL, og:image and title', () => {
  assert.ok(start > 0);
  const re = new RegExp(block.match(/if \(!(\/\^.*?\/)\.test/)[1].slice(1, -1));
  assert.ok(re.test('/guides/cheap-eats-kelowna'));
  assert.ok(!re.test('/guides'));
  assert.ok(!re.test('/guides/'));
  assert.ok(!re.test('/fr/guides/cheap-eats-kelowna'));
  assert.ok(block.includes("'https://www.pinterest.com/pin/create/button/?url=' + encodeURIComponent(url)"));
  assert.ok(block.includes("encodeURIComponent(og.content)"));
  assert.ok(block.includes("link[rel=\"canonical\"]"));
});

test('pinterest save: no Pinterest script, opens safely in a new tab, counts clicks', () => {
  assert.ok(!/pinit\.js|assets\.pinterest\.com/.test(src));
  assert.ok(block.includes("a.rel = 'noopener'"));
  assert.ok(block.includes("a.target = '_blank'"));
  assert.ok(block.includes("window.trackEvent('share_click', { method: 'pinterest'"));
  assert.ok(block.includes('min-height:44px'));
});
