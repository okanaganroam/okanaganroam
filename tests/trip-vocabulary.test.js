// Build My Trip vocabulary (2026-10-28): every request in data/vocabulary/tests-shared.json (what any Roam site must
// understand) and in data/vocabulary/local.json "tests" (this site's own towns and areas) is read as expected. Add a
// request here whenever a visitor's wording is taught to the planner, so it never breaks again.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const d = require('../discovery-intent.js');

const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vocabulary', 'local.json'), 'utf8'));
const shared = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vocabulary', 'tests-shared.json'), 'utf8'));
// Every town the local file names (its regions and areas), so the test needs no database.
const regions = [...new Set([...Object.keys(local.regions || {}), ...Object.values(local.areas || {}).flat()])];
const TAXONOMY = {
  regions, regionLabels: Object.fromEntries(regions.map((r) => [r, r.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')])),
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'distillery', 'golf', 'beach', 'outdoor', 'indoor', 'tour', 'sport', 'shop'],
  features: ['dog_friendly', 'vegan', 'vegetarian', 'patio', 'kid_friendly', 'gluten_free', 'lake_view', 'nonalcoholic', 'sports_tv', 'live_music', 'great_groups', 'happy_hour', 'open_early', 'open_late'],
  collections: ['hidden_gem', 'local_favorite', 'dog_friendly'],
  activities: ['hiking', 'cycling', 'winter', 'camping', 'nature', 'water', 'viewpoints', 'adventure', 'fishing'],
  cuisines: ['italian', 'japanese', 'indian', 'mexican', 'bbq', 'dessert', 'seafood', 'steakhouse'],
  budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'], datePresets: ['today', 'this-weekend'], eventCategories: [], venues: [],
};

// Every way a request misses, so one run lists them all.
function misses({ q, expect }) {
  const got = d.interpretDiscoveryQuery(q, TAXONOMY, { tripPlanner: true });
  const out = [];
  for (const [key, want] of Object.entries(expect)) {
    if (key === 'noTextTerms') { for (const w of want) if (got.textTerms.includes(w)) out.push(`${q}: "${w}" should be understood, not searched for`); continue; }
    if (Array.isArray(want)) { for (const w of want) if (!(got[key] || []).includes(w)) out.push(`${q}: ${key} should include ${w} (got ${JSON.stringify(got[key])})`); }
    else if (got[key] !== want) out.push(`${q}: ${key} should be ${want} (got ${JSON.stringify(got[key])})`);
  }
  return out;
}

test('vocabulary: requests any Roam site must understand (tests-shared.json)', () => {
  assert.ok(shared.tests.length >= 40);
  assert.deepEqual(shared.tests.flatMap(misses), []);
});

test("vocabulary: this site's towns and areas (local.json tests)", () => {
  assert.ok((local.tests || []).length >= 5);
  assert.deepEqual(local.tests.flatMap(misses), []);
});

test('vocabulary files: well formed, and the planner code names no town', () => {
  const sh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vocabulary', 'shared.json'), 'utf8'));
  for (const key of ['types', 'features', 'activities', 'occasions', 'descriptionSynonyms', 'termLabels']) assert.equal(typeof sh[key], 'object', key);
  const src = fs.readFileSync(path.join(__dirname, '..', 'discovery-intent.js'), 'utf8');
  for (const nick of ['golden mile', 'westbank', 'naramata bench', 'ok falls']) assert.ok(!src.includes(`'${nick}'`), `${nick} belongs in local.json`);
});
