'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const pa = require('../portal-activity');
const siteEvents = require('../site-events');
const { renderPortalPage } = require('../portal-activity-page');

const NOW = new Date('2026-11-05T20:00:00Z');
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '', lang = 'en-CA') => ({ headers: { 'user-agent': ua, cookie, ...(lang ? { 'accept-language': lang } : {}) } });
const memDb = () => { const d = new DatabaseSync(':memory:'); d.exec('CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name))'); return d; };
function answer(c, r, method, path, code, ip = '5.5.5.5') {
  const res = new EventEmitter(); res.statusCode = code;
  c.watch(r, res, method, path, ip); res.emit('finish');
}

test('classify: every portal page and action maps to one step, anything else to none', () => {
  const cases = [
    ['GET', '/owner/login', 'login_page_view'], ['POST', '/owner/login', 'login'], ['GET', '/fr/owner/login', 'login_page_view'],
    ['GET', '/owner/forgot', 'forgot_page_view'], ['POST', '/owner/forgot', 'forgot_submit'],
    ['GET', '/owner/reset/abc123', 'reset_page_view'], ['POST', '/owner/reset/abc123', 'reset_submit'],
    ['GET', '/owner/link', 'new_link_page_view'], ['POST', '/owner/link', 'new_link_submit'],
    ['GET', '/owner/account', 'account_view'], ['GET', '/owner/account/settings', 'settings_view'],
    ['GET', '/owner/account/venue/12', 'edit_page_view'], ['POST', '/owner/account/venue/12/changes', 'edit_save'],
    ['POST', '/owner/account/venue/12/photos', 'photo_upload'], ['POST', '/owner/account/venue/12/photos/3/main', 'photo_edit'],
    ['POST', '/owner/account/venue/12/photo-position', 'photo_edit'], ['POST', '/owner/account/venue/12/video/start', 'video'],
    ['POST', '/owner/account/venue/12/events', 'event_submit'], ['POST', '/owner/account/venue/12/events/4/cancel', 'event_cancel'],
    ['GET', '/owner/account/venue/12/menu', 'menu_page_view'], ['POST', '/owner/account/venue/12/menu/save', 'menu_edit'],
    ['POST', '/owner/account/password', 'settings_change'], ['POST', '/owner/account/venue/12/logins/3/remove', 'access_change'],
    ['POST', '/owner/logout', 'logout'], ['POST', '/owner/help', 'help_message'],
    ['GET', '/owner/Tok-en_1', 'edit_link_view'], ['POST', '/owner/Tok-en_1/changes', 'edit_link_send'], ['POST', '/owner/Tok-en_1/account', 'create_login'],
    ['GET', '/claim/kelowna/breweries/copper-brewing-co', 'claim_page_view'], ['POST', '/api/claims', 'claim_submit'],
    ['GET', '/owner/logout', null], ['GET', '/kelowna', null], ['DELETE', '/owner/login', null],
  ];
  for (const [m, p, want] of cases) assert.equal(pa.classify(m, p), want, `${m} ${p}`);
  for (const [m, p] of cases) { const k = pa.classify(m, p); if (k && k !== 'login') assert.ok(pa.STEP_KEYS.has(k), k); }
});

test('server steps are counted when answered: success, failure, sign-in outcomes; bots, internal and errors on views are not', () => {
  const db = memDb(); const c = pa.createPortalCounter(db);
  answer(c, req(), 'GET', '/owner/login', 200);
  answer(c, req(), 'POST', '/owner/login', 200);
  answer(c, req(), 'POST', '/owner/login', 401);
  answer(c, req(), 'POST', '/owner/login', 401);
  answer(c, req(), 'POST', '/owner/login', 429);
  answer(c, req(), 'POST', '/owner/account/venue/9/changes', 200);
  answer(c, req(), 'POST', '/owner/account/venue/9/changes', 400);
  answer(c, req(), 'GET', '/owner/account', 302);
  answer(c, req('Googlebot/2.1'), 'GET', '/owner/login', 200);
  answer(c, req(undefined, 'roam_internal=1'), 'GET', '/owner/login', 200);
  const r = c.report(30, new Date()); const by = Object.fromEntries(r.steps.map((s) => [s.key, s])); // the server counts on today's date
  assert.equal(by.login_page_view.n, 1); assert.equal(by.login_success.n, 1); assert.equal(by.login_failed.n, 2); assert.equal(by.login_locked.n, 1);
  assert.equal(by.edit_save.n, 1); assert.equal(by.edit_save.failed, 1); assert.equal(by.account_view.n, 0);
  assert.equal(r.logins_per_day.at(-1).n, 1);
});

test('browser steps come in through /api/site-event names and show in the report; nothing identifying is stored', () => {
  const db = memDb(); const sc = siteEvents.createCounter(db); const c = pa.createPortalCounter(db);
  assert.equal(sc.record(req(), 'portal_login_click_menu', '6.6.6.6', NOW), true);
  assert.equal(sc.record(req(), 'portal_login_click_venue_page', '6.6.6.6', NOW), true);
  assert.equal(sc.record(req(), 'portal_claim_click', '6.6.6.6', NOW), true);
  assert.equal(sc.record(req(), 'portal_login_click_somewhere', '6.6.6.6', NOW), false);
  const r = c.report(7, NOW); const by = Object.fromEntries(r.steps.map((s) => [s.key, s.n]));
  assert.equal(by.portal_login_click_menu, 1); assert.equal(by.portal_claim_click, 1);
  assert.equal(r.login_clicks_per_day.at(-1).n, 2);
  for (const row of db.prepare('SELECT * FROM site_event_counts').all()) assert.deepEqual(Object.keys(row).sort(), ['day', 'n', 'name']);
});

test('page: renders both sites, groups, failures, and a site that is not connected', () => {
  const db = memDb(); const c = pa.createPortalCounter(db);
  answer(c, req(), 'POST', '/owner/login', 401);
  const html = renderPortalPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: c.report(30, NOW) }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }] });
  for (const s of ['Business portal', 'Signing in', 'Inside the portal', 'Sign-in failed', 'Not connected yet', 'Okanagan Roam']) assert.ok(html.includes(s), s);
});

test('link scanners are not counted as owners opening claim pages or edit links', () => {
  pa._resetScanMemory();
  const db = memDb(); const c = pa.createPortalCounter(db);
  const count = () => (db.prepare("SELECT n FROM site_event_counts WHERE name = 'portal:claim_page_view'").get() || { n: 0 }).n;
  // No Accept-Language: not a person's browser.
  answer(c, req('Mozilla/5.0 (Windows NT 10.0) Chrome/140', '', ''), 'GET', '/claim/kelowna/cafes/a', 200, '9.9.9.1');
  assert.equal(count(), 0);
  // One browser, one claim page: counted, even if reloaded.
  answer(c, req(), 'GET', '/claim/kelowna/cafes/b', 200, '9.9.9.2');
  answer(c, req(), 'GET', '/claim/kelowna/cafes/b', 200, '9.9.9.2');
  assert.equal(count(), 2);
  // The same browser walking through a third different venue is a scanner: not counted.
  answer(c, req(), 'GET', '/claim/kelowna/cafes/c', 200, '9.9.9.2');
  assert.equal(count(), 3, 'a second different page is still fine');
  answer(c, req(), 'GET', '/claim/vernon/cafes/d', 200, '9.9.9.2');
  assert.equal(count(), 3, 'the third different page is not counted');
  // Other steps (login page) are never filtered this way.
  answer(c, req('Mozilla/5.0 (Windows NT 10.0) Chrome/140', '', ''), 'GET', '/owner/login', 200, '9.9.9.3');
  assert.equal((db.prepare("SELECT n FROM site_event_counts WHERE name = 'portal:login_page_view'").get() || { n: 0 }).n, 1);
});
