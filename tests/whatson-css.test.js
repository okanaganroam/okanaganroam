'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server.js');

// The What's On stylesheet is derived from the Golf card rules. A comma split that cut `:is(a, b)` in half left an
// unclosed paren, so browsers dropped everything after it and the search box and Regions/Date buttons lost their styles.
test("What's On styles: every derived rule is balanced, so nothing after it is dropped", () => {
  const css = app.renderWhatsOnStyles ? app.renderWhatsOnStyles() : null;
  assert.ok(css, 'renderWhatsOnStyles is exported');
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of noComments.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1];
    assert.equal((sel.match(/\(/g) || []).length, (sel.match(/\)/g) || []).length, `unbalanced parens in: ${sel.trim().slice(0, 120)}`);
  }
  assert.match(css, /body\.whatson-page \.visually-hidden/);
  assert.match(css, /whatson-pop-btn/);
});
