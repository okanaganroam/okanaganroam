'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const nf = require('../not-found');
const gsc = require('../gsc-report');

const NOW = new Date('2026-11-06T20:00:00Z');
const memDb = () => { const d = new DatabaseSync(':memory:'); d.exec('CREATE TABLE not_found_counts (day TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, ref TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, path, ref))'); return d; };
function hit(c, url, { ua = 'Mozilla/5.0 (iPhone) Safari', referer, cookie = '', code = 404, method = 'GET', ip = '9.9.9.9' } = {}) {
  const req = { method, url, headers: { 'user-agent': ua, referer, cookie } };
  const res = new EventEmitter(); res.statusCode = code;
  c.watch(req, res, ip, () => NOW); res.emit('finish');
}

test('cleanPath and refOf: only plain addresses; own pages keep their path, outside sites keep only their name', () => {
  assert.equal(nf.cleanPath('/a/b/?x=1'), '/a/b');
  assert.equal(nf.cleanPath('/<script>'), null);
  assert.equal(nf.refOf('https://www.okanaganroam.com/kelowna/x?y=1'), 'own:/kelowna/x');
  assert.equal(nf.refOf('https://l.facebook.com/l.php?u=secret'), 'l.facebook.com');
  assert.equal(nf.refOf('junk'), '');
});

test('404s are counted by who asked; scanners are only a total; other answers, POSTs and internal visits are ignored', () => {
  const db = memDb(); const c = nf.createNotFoundCounter(db);
  hit(c, '/kelowna/old-winery', { referer: 'https://okanaganroam.com/kelowna/wineries' });
  hit(c, '/kelowna/old-winery', { referer: 'https://okanaganroam.com/kelowna/wineries' });
  hit(c, '/kelowna/old-winery?utm=1', { referer: 'https://www.google.com/' });
  hit(c, '/kelowna/old-winery', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
  hit(c, '/wp-login.php'); hit(c, '/.env'); hit(c, '/x/phpmyadmin/');
  hit(c, '/ok-page', { code: 200 }); hit(c, '/post', { method: 'POST' });
  hit(c, '/mine', { cookie: 'roam_internal=1' });
  hit(c, '/<bad>');
  const r = c.report(30, 100, NOW);
  assert.deepEqual(r.totals, { visitor: 3, crawler: 1, probe: 4 });
  assert.equal(r.missing.length, 1);
  assert.deepEqual([r.missing[0].path, r.missing[0].visitors, r.missing[0].crawlers], ['/kelowna/old-winery', 3, 1]);
  assert.deepEqual(r.missing[0].top_ref, [{ ref: 'own:/kelowna/wineries', n: 2 }, { ref: 'google.com', n: 1 }]);
  assert.deepEqual(r.broken_links, [{ from: '/kelowna/wineries', to: '/kelowna/old-winery', n: 2 }]);
  assert.ok(!JSON.stringify(r).includes('wp-login') && !JSON.stringify(r).includes('utm'));
  assert.equal(r.per_day[29].n, 3);
});

test('Search Console trends: period totals, rising, falling, new and gone', () => {
  const row = (k, c, i, p) => ({ keys: [k], clicks: c, impressions: i, position: p });
  const t = gsc.buildTrends({
    daily: [row('2026-10-01', 1, 10, 5), row('2026-10-10', 3, 30, 4), row('2026-10-20', 5, 50, 3)],
    curQueries: [row('a', 5, 50, 3), row('b', 0, 2, 9), row('d', 2, 20, 6)], prevQueries: [row('a', 1, 10, 5), row('c', 2, 20, 4)],
    curPages: [row('https://x.com/p', 4, 40, 2)], prevPages: [row('https://x.com/p', 1, 20, 3)],
  }, '2026-10-10', '2026-10-30', '2026-09-19', '2026-10-09');
  assert.deepEqual([t.current.clicks, t.current.impressions, t.current.ctr, t.current.position], [8, 80, 10, 3.4]);
  assert.deepEqual([t.previous.clicks, t.previous.impressions], [1, 10]);
  assert.deepEqual(t.queries.rising.map((r) => [r.key, r.status]), [['a', 'both'], ['d', 'new']]);
  assert.deepEqual(t.queries.falling.map((r) => [r.key, r.status]), [['c', 'gone']]);
  assert.deepEqual(t.pages.rising.map((r) => r.key), ['https://x.com/p']);
  assert.equal(t.daily.length, 2);
});

test('pages render: broken pages (escaped) and the Google trends block', () => {
  const { renderErrorsPage } = require('../errors-page');
  const { searchConsoleHtml } = require('../referrals-page');
  const db = memDb(); const c = nf.createNotFoundCounter(db);
  hit(c, '/old-<x>'.replace('<x>', 'page'), { referer: 'https://okanaganroam.com/kelowna' });
  const html = renderErrorsPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.report(30, 100, NOW) }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }] });
  assert.match(html, /\/old-page/); assert.match(html, /Links on our own pages that lead nowhere/); assert.match(html, /Not connected yet/);
  const row = (k, c2, i, p) => ({ keys: [k], clicks: c2, impressions: i, position: p });
  const trends = gsc.buildTrends({ daily: [row('2026-10-20', 5, 50, 3)], curQueries: [row('best <b>patio</b>', 5, 50, 3)], prevQueries: [], curPages: [], prevPages: [] }, '2026-10-10', '2026-10-30', '2026-09-19', '2026-10-09');
  const sc = searchConsoleHtml({ start: '2026-10-10', end: '2026-10-30', queries: [], pages: [], trends });
  assert.match(sc, /Compared with the/); assert.match(sc, /Search words going up/); assert.doesNotMatch(sc, /<b>patio/);
});
