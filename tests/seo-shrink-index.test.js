// SEO (2026-10-20): after Google impressions fell 96% on Oct 11 (most likely the September 2026 spam update), the site
// Google sees is shrunk: French pages and thin templated pages stay live for visitors but are noindex and out of the
// sitemap. Source checks, the same way the other SEO tests read server.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('French pages are noindex, have no hreflang pairs and are not in the sitemap while FRENCH_INDEXABLE is false', () => {
  assert.match(src, /\nconst FRENCH_INDEXABLE = false;\n/);
  assert.ok(src.includes("function addTwinHead(html, enPath, search = '') {\n  if (!FRENCH_INDEXABLE) return html;"), 'no hreflang pair on twin pages');
  assert.ok(src.includes('if ((enOnlyEvent || !FRENCH_INDEXABLE) && !/<meta name="robots"/'), 'French twin pages get noindex');
  assert.ok(src.includes('{ noindex: (fr && !FRENCH_INDEXABLE) || venuePageIsThin(venue), alternates: hasFrench && FRENCH_INDEXABLE ? venueAlternates(venue) : null'), 'French place pages');
  assert.ok(src.includes('noindex: !menuIndexable(menu, venue) || (fr && !FRENCH_INDEXABLE), alternates: hasFrench && FRENCH_INDEXABLE ? ['), 'French menu pages');
  assert.ok(src.includes('function withFrenchTwinEntries(entries) {\n  if (!FRENCH_INDEXABLE) return entries;'), 'no French twins in the sitemap');
  assert.equal((src.match(/const alts = FRENCH_INDEXABLE && venueHasFrench\(v\)/g) || []).length, 2, 'no xhtml:link alternates for places or menus');
});

test('thin town x category, badge and combination pages are noindex and left out of the sitemap', () => {
  assert.match(src, /\nconst MIN_INDEXABLE_GUIDE_VENUES = 10;\n/);
  assert.match(src, /\nconst MIN_INDEXABLE_CATEGORY_VENUES = 3;\n/);
  assert.ok(src.includes('noindex: venues.length + sportsAlso.length < MIN_INDEXABLE_CATEGORY_VENUES'), 'town category page');
  assert.ok(src.includes('noindex: venues.length === 0 || (!valleyWide && venues.length < MIN_INDEXABLE_CATEGORY_VENUES)'), 'town food & drink page');
  assert.equal((src.match(/    noindex: venues\.length < MIN_INDEXABLE_GUIDE_VENUES,\n/g) || []).length, 2, 'badge and combination guides');
  assert.ok(src.includes('...categoryCombos.filter((r) => r.n >= MIN_INDEXABLE_CATEGORY_VENUES).map('));
  assert.ok(src.includes('...combos.filter((c) => c.count >= MIN_INDEXABLE_GUIDE_VENUES).map('));
  assert.ok(src.includes('...listComboGuides(MIN_INDEXABLE_GUIDE_VENUES).map('));
  // No object literal may set noindex twice (a later key silently wins, which hid the first version of this change).
  for (const line of src.split('\n')) if ((line.match(/[{,] noindex:/g) || []).length > 1 && !/indoorGolf|toursAlso/.test(line)) assert.fail(`two noindex keys: ${line.slice(0, 120)}`);
});

test('weekend pages are never indexed and are not in the sitemap', () => {
  assert.ok(src.includes('const scopeThin = scope ? (scope.weekend ? true : !live.some((x) => x.path === basePath)) : false;'));
  assert.ok(src.includes('return live.map((x) => x.path); })()'), 'weekend paths dropped from the sitemap');
});
