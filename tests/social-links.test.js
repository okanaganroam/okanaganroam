// okanaganroam.com/links (2026-10-19): the Instagram bio link page. Pure tests of the post list, plus source checks.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { linksForDay } = require('../social-links.js');

const POSTS = [
  { date: '2026-10-20', title: 'Halloween guide', path: '/guides/halloween-okanagan' },
  { date: '2026-10-22', title: 'Waterfalls', path: '/guides/okanagan-waterfall-walks' },
  { date: '2026-10-21', title: 'Red Rooster', path: '/naramata/wineries/red-rooster-winery' },
  { date: '2026-10-23', title: 'Bad path', path: 'https://example.com/' },
  { date: 'soon', title: 'Bad date', path: '/trip' },
];

test('links: posts up to today, newest first, today flagged; nothing from the future or with a bad path', () => {
  const out = linksForDay(POSTS, '2026-10-22');
  assert.deepEqual(out.map((p) => p.date), ['2026-10-22', '2026-10-21', '2026-10-20']);
  assert.equal(out[0].isToday, true);
  assert.equal(out[1].isToday, false);
  assert.deepEqual(linksForDay(POSTS, '2026-10-19'), []);
  assert.ok(!linksForDay(POSTS, '2026-12-01').some((p) => /example\.com/.test(p.path)));
  assert.equal(linksForDay(POSTS, '2026-12-01', 2).length, 2);
});

test('links: the data file is valid and every post has a date, title and site path', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'social-links.json'), 'utf8'));
  assert.ok(data.posts.length >= 14);
  for (const p of data.posts) {
    assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(p.path, /^\/[a-z0-9\-/]*$/, p.path);
    assert.ok(p.title && p.title.trim());
  }
  assert.equal(linksForDay(data.posts, '2026-11-02', 50).length, data.posts.length);
});

test('links: /links is noindex, briefly cached, uses plain internal links and counts clicks', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes("(pathname === '/links' || pathname === '/links/') && method === 'GET'"));
  assert.ok(src.includes("'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=300' });\n      return res.end(renderSocialLinksPage());"));
  assert.ok(src.includes("window.trackEvent('bio_link_click'"));
  // The page's list styles stay inside the page body (a bare ul rule opened the header menu on phones).
  assert.ok(!/body\.links-page ul \{/.test(src));
});
