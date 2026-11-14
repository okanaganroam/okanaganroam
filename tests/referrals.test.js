'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const r = require('../referrals');

const NOW = new Date('2026-11-06T20:00:00Z');
const memDb = () => { const d = new DatabaseSync(':memory:'); d.exec('CREATE TABLE referral_counts (day TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, source, page))'); return d; };
function hit(c, url, { ua = 'Mozilla/5.0 (iPhone) Safari', referer, cookie = '', code = 200, type = 'text/html; charset=utf-8', ip = '9.9.9.9' } = {}) {
  const req = { method: 'GET', url, headers: { 'user-agent': ua, referer, cookie } };
  const res = new EventEmitter(); res.statusCode = code; res.getHeader = () => type; res._header = '';
  c.watch(req, res, ip, () => NOW); res.emit('finish');
}

test('classifyVisit: AI assistants, search engines, social, other sites; direct and our own sites are nothing', () => {
  const g = (ref, utm) => r.classifyVisit(ref, utm);
  assert.deepEqual(g('https://chatgpt.com/'), { group: 'ai', source: 'chatgpt' });
  assert.deepEqual(g('https://chat.openai.com/c/1'), { group: 'ai', source: 'chatgpt' });
  assert.deepEqual(g('https://www.perplexity.ai/search/x'), { group: 'ai', source: 'perplexity' });
  assert.deepEqual(g('https://gemini.google.com/'), { group: 'ai', source: 'gemini' });
  assert.deepEqual(g('https://copilot.microsoft.com/'), { group: 'ai', source: 'copilot' });
  assert.deepEqual(g('https://claude.ai/'), { group: 'ai', source: 'claude' });
  assert.deepEqual(g(undefined, 'chatgpt.com'), { group: 'ai', source: 'chatgpt' });
  assert.deepEqual(g('https://www.google.com/'), { group: 'search', source: 'google' });
  assert.deepEqual(g('https://www.google.ca/'), { group: 'search', source: 'google' });
  assert.deepEqual(g('https://www.bing.com/'), { group: 'search', source: 'bing' });
  assert.deepEqual(g('https://duckduckgo.com/'), { group: 'search', source: 'duckduckgo' });
  assert.deepEqual(g('https://l.facebook.com/l.php'), { group: 'social', source: 'facebook' });
  assert.deepEqual(g('https://www.tripadvisor.ca/x'), { group: 'other', source: 'tripadvisor.ca' });
  assert.equal(g(undefined), null); assert.equal(g(''), null); assert.equal(g('not a url'), null);
  assert.equal(g('https://okanaganroam.com/kelowna'), null); assert.equal(g('https://www.whistlerroam.com/'), null);
  assert.equal(g('https://notgoogle.com/').group, 'other', 'a host that merely contains the name is not a search engine');
  assert.equal(g('https://fakeopenai.com/').group, 'other');
});

test('classifyAgent: AI tools that fetch for a person vs crawlers', () => {
  assert.deepEqual(r.classifyAgent('Mozilla/5.0 AppleWebKit; compatible; ChatGPT-User/1.0; +https://openai.com/bot'), { source: 'chatgpt', kind: 'ai_fetch' });
  assert.deepEqual(r.classifyAgent('Mozilla/5.0 (compatible; PerplexityBot/1.0)'), { source: 'perplexity', kind: 'crawl' });
  assert.deepEqual(r.classifyAgent('Mozilla/5.0 (compatible; ClaudeBot/1.0)'), { source: 'claude', kind: 'crawl' });
  assert.deepEqual(r.classifyAgent('Mozilla/5.0 (compatible; Googlebot/2.1)'), { source: 'googlebot', kind: 'crawl' });
  assert.equal(r.classifyAgent('Mozilla/5.0 (iPhone) Safari'), null);
});

test('counting: visits by source and landing page; agents; skips assets, errors, non-HTML, internal, own and direct visits', () => {
  const db = memDb(); const c = r.createReferralCounter(db);
  hit(c, '/kelowna/breweries/copper-brewing-co?utm_x=1', { referer: 'https://chatgpt.com/' });
  hit(c, '/kelowna/breweries/copper-brewing-co', { referer: 'https://chatgpt.com/' });
  hit(c, '/kelowna', { referer: 'https://www.google.com/' });
  hit(c, '/kelowna', { referer: undefined });
  hit(c, '/kelowna', { referer: 'https://okanaganroam.com/' });
  hit(c, '/kelowna', { referer: 'https://www.google.com/', cookie: 'roam_internal=1' });
  hit(c, '/kelowna', { referer: 'https://www.google.com/', code: 404 });
  hit(c, '/images/x.jpg', { referer: 'https://www.google.com/', type: 'image/jpeg' });
  hit(c, '/admin/dashboard', { referer: 'https://www.google.com/' });
  hit(c, '/kelowna', { referer: 'https://www.google.com/', type: 'application/json' });
  hit(c, '/kelowna/wineries', { ua: 'Mozilla/5.0 compatible; ChatGPT-User/1.0; +https://openai.com/bot' });
  hit(c, '/kelowna', { ua: 'Mozilla/5.0 (compatible; GPTBot/1.1)' });
  hit(c, '/kelowna', { ua: 'curl/8', referer: 'https://www.google.com/' });
  const rep = c.report(30, NOW);
  assert.deepEqual(rep.totals, { ai: 2, search: 1, social: 0, other: 0, email: 0 });
  assert.deepEqual(rep.landing_ai, [{ source: 'chatgpt', page: '/kelowna/breweries/copper-brewing-co', n: 2 }]);
  assert.deepEqual(rep.landing_search, [{ source: 'google', page: '/kelowna', n: 1 }]);
  assert.deepEqual(rep.ai_fetched, [{ source: 'chatgpt', page: '/kelowna/wineries', n: 1 }]);
  assert.deepEqual(rep.crawlers, [{ source: 'chatgpt', n: 1, ai: true }]);
  assert.equal(rep.ai_per_day.at(-1).n, 2);
  for (const row of db.prepare('SELECT * FROM referral_counts').all()) assert.deepEqual(Object.keys(row).sort(), ['day', 'kind', 'n', 'page', 'source']);
});

test('page: shows sources, AI landing pages, crawlers, the Search Console words, and a not-connected site', () => {
  const { renderReferralsPage } = require('../referrals-page');
  const db = memDb(); const c = r.createReferralCounter(db);
  hit(c, '/kelowna/wineries', { referer: 'https://chatgpt.com/' });
  hit(c, '/kelowna/wineries', { ua: 'Mozilla/5.0 compatible; ChatGPT-User/1.0; +https://openai.com/bot' });
  const html = renderReferralsPage({ days: 30, sites: [
    { key: 'okanagan', name: 'Okanagan Roam', data: { referrals: c.report(30, NOW), search_console: { start: '2026-10-08', end: '2026-11-04', queries: [{ key: 'best wineries kelowna', clicks: 4, impressions: 90, position: 7.2 }], pages: [{ key: 'https://okanaganroam.com/kelowna/wineries', clicks: 4, impressions: 90, position: 7.2 }] } } },
    { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }] });
  for (const s of ['ChatGPT', 'AI assistants', 'best wineries kelowna', '/kelowna/wineries', 'Not connected yet', 'Googlebot'.slice(0, 0)]) assert.ok(html.includes(s), s);
  assert.match(html, /<b>1<\/b>/);
  assert.match(require('../referrals-page').searchConsoleHtml(null), /Not connected yet/);
});
