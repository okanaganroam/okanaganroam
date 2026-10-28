'use strict';
// Build My Trip and site search vocabulary (2026-10-28, Dayton: "understand all questions, free, and transferable").
// The words people use live in two data files instead of the code:
//   data/vocabulary/shared.json  phrases that mean the same thing on any Roam site (cozy, spa, apres, with the kids,
//                                typo-proof plurals, description synonyms). Copy it as is to a new site.
//   data/vocabulary/local.json   this site's own words: town nicknames, areas that cover several towns, the words for
//                                "the whole region", and places it does not cover. Each site writes its own.
// The code tables in discovery-intent.js / discovery-search.js stay as the base; these files add to them.
const fs = require('fs');
const path = require('path');

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'vocabulary', name), 'utf8')); } catch (e) { return {}; }
}
const shared = readJson('shared.json');
const local = readJson('local.json');

// base { key: [phrases] } + extra { key: [phrases] } -> a new table; keys only in `extra` are added too.
function mergeAliases(base, extra) {
  const out = {};
  for (const [k, v] of Object.entries(base || {})) out[k] = Array.isArray(v) ? v.slice() : v;
  for (const [k, v] of Object.entries(extra || {})) {
    if (k.startsWith('_') || !Array.isArray(v)) continue;
    out[k] = Array.from(new Set([...(out[k] || []), ...v]));
  }
  return out;
}
function list(v) { return Array.isArray(v) ? v : []; }
function table(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

module.exports = {
  shared, local, mergeAliases,
  sharedTable: (key) => table(shared[key]),
  localTable: (key) => table(local[key]),
  localList: (key) => list(local[key]),
};
