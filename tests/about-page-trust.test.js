// About page (2026-10-20, after the Oct 11 Google drop): who runs the site, live counts, how listings are checked, and
// AboutPage / Organization structured data. French for the new lines is in data/french/about-2026-10-20.json.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('About page names Dayton (first name only), shows live counts, the listing rules and AboutPage data', () => {
  const start = src.indexOf('function aboutPageStats()');
  const end = src.indexOf('function renderContactPage()');
  const about = src.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(about.includes('<p>Hi, I&rsquo;m Dayton.</p>'));
  assert.ok(about.includes('born and raised in Kelowna'), 'the existing story stays');
  assert.ok(about.includes("founder: { '@type': 'Person', name: 'Dayton' }"));
  assert.ok(about.includes("'@type': 'AboutPage'"));
  for (const s of ['Star ratings come from Google reviews.', 'Nothing here is paid for.', 'Photos come with credit.', 'Owners keep their listing up to date.', 'Spotted a mistake?', 'data-contact-topic="correction"'])
    assert.ok(about.includes(s), s);
  assert.ok(about.includes('${n(stats.places)}') && about.includes('${n(stats.events)}') && about.includes('${n(stats.guides)}'), 'counts are live, not typed in');
  assert.ok(!/PO Box/i.test(about));
  assert.ok(src.includes("function renderInfoPage({ path, name, title, description, heading, lead, bodyHtml, banner = null, jsonLd = [] })"));
});

test('every new About sentence has its French, keyed the way the French page looks it up', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'about-2026-10-20.json'), 'utf8'));
  for (const k of ['Hi, I’m Dayton.', 'What’s on the site', 'Places to go.', 'Build My Trip.', 'Spotted a mistake?', 'Report a mistake',
    '{a0} {0} upcoming events, updated every week.', 'Run by Dayton in {T}, British Columbia. Page updated in October {0}.'])
    assert.ok(fr[k], k);
  for (const [k, v] of Object.entries(fr)) {
    for (const ph of (k.match(/\{a?\d+\}|\{T\}/g) || [])) assert.ok(v.includes(ph), `${k} keeps ${ph}`);
    assert.ok(!/week-end/.test(v), 'Canadian French: fin de semaine');
  }
});
