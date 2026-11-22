// Contact page guesses (2026-11-21): /contact-us and friends send visitors to /contact instead of a 404.
'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('/contact-us style addresses redirect (301) to /contact, French ones to /fr/contact', () => {
  const at = src.indexOf('Common guesses at the contact page');
  assert.ok(at > 0, 'redirect block is in server.js');
  const block = src.slice(at, at + 700);
  const reSrc = /\.exec\(pathname\)/.test(block) && block.match(/\/\^\(\\\/fr\)\?.*?\$\/i/);
  assert.ok(reSrc, 'redirect pattern found');
  const re = new RegExp(reSrc[0].slice(1, -2), 'i');
  for (const [p, lang] of [['/contact-us', ''], ['/contact-us/', ''], ['/contactus', ''], ['/Contact-Us', ''], ['/contact_us', ''], ['/contact-us.html', ''], ['/fr/contact-us', '/fr']]) {
    const m = re.exec(p);
    assert.ok(m, `${p} matches`);
    assert.equal(m[1] || '', lang, `${p} keeps its language`);
  }
  for (const p of ['/contact', '/fr/contact', '/contact-usage', '/kelowna/contact-us', '/contact-us/extra']) assert.equal(re.exec(p), null, `${p} is left alone`);
  assert.ok(block.includes('res.writeHead(301') && block.includes('`${cu[1] || \'\'}/contact${parsed.search || \'\'}`'), 'permanent redirect to /contact, query kept');
  assert.ok(src.indexOf('Common guesses at the contact page') < src.indexOf("const infoPage = { '/about'"), 'runs before the info pages');
});
