#!/usr/bin/env node
// Writes data/guide-dates.json: when each file guide (data/guides/<slug>.json) was first published and last changed,
// from git history. Run after editing guides; the guide page shows these as its byline and Article dates.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const out = {};
for (const name of fs.readdirSync(path.join(root, 'data', 'guides')).filter((n) => n.endsWith('.json')).sort()) {
  const file = `data/guides/${name}`;
  const dates = git('log', '--follow', '--format=%cs', '--', file).split('\n').filter(Boolean);
  if (dates.length) out[name.replace(/\.json$/, '')] = { published: dates[dates.length - 1], modified: dates[0] };
}
fs.writeFileSync(path.join(root, 'data', 'guide-dates.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${Object.keys(out).length} guides`);
