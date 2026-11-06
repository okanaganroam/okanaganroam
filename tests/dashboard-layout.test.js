'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { layout, NAV } = require('../dashboard-layout');
const { table, renderDashboardPage } = require('../dashboard-page');
const home = require('../whats-changed-page');
const { renderHelpPage } = require('../pages-page');

const NOW = new Date('2026-11-06T20:00:00Z');
const m = (key, label, cur, prev) => ({ key, label, cur, prev });
const data = (metrics, lists = {}) => ({ range: { cur: { start: '2026-10-30', end: '2026-11-05' }, prev: { start: '2026-10-23', end: '2026-10-29' } }, metrics, lists, health: { problems: [], counters: [] } });

test('every page gets the menu, the plain explanation and marks where you are', () => {
  const html = layout({ active: 'email', title: 'Email results', tells: 'A <b>', use: 'B', range: '<a class="tab">7d</a>', body: '<p>x</p>' });
  for (const g of NAV) for (const i of g.items) assert.ok(html.includes(`href="${i.href}"`), i.href);
  assert.match(html, /nav-a on" href="\/admin\/dashboard\/email" aria-current="page"/);
  assert.match(html, /What this tells you/); assert.match(html, /What to do with it/);
  assert.match(html, /Last 7 days/); assert.match(html, /A &lt;b&gt;/);
  assert.match(html, /noindex,nofollow/);
});

test('long lists show ten rows and fold the rest', () => {
  const rows = Array.from({ length: 13 }, (_, i) => [`r${i}`]);
  const html = table(['A'], rows);
  assert.match(html, /Show all 13/);
  assert.ok(html.indexOf('r9<') < html.indexOf('<details'));
  assert.ok(html.indexOf('r10<') > html.indexOf('<details'));
  assert.doesNotMatch(table(['A'], rows.slice(0, 10)), /details/);
  assert.match(table(['A'], []), /Nothing here yet/);
});

test('Home: big numbers with a fair comparison, good news kept apart from problems', () => {
  const d = data([m('views', 'Business page views', 200, 100), m('outbound', 'Clicks', 40, 0), m('broken', 'Visitors who hit a missing page', 30, 10), m('searches_none', 'Searches that found nothing', 5, 20), m('visits_ai', 'AI visits', 6, 20), m('trip_share', 'Trips shared', 3, 4)]);
  const mv = home.moves(d);
  assert.deepEqual(mv.good, ['Business page views: up from 100 to 200', 'Searches that found nothing: down from 20 to 5']);
  assert.deepEqual(mv.watch, ['Visitors who hit a missing page: up from 10 to 30', 'AI visits: down from 20 to 6']);
  const inboxes = { okanagan: { claims_pending: 3 } };
  const { top, body } = home.homeHtml([{ key: 'okanagan', name: 'Okanagan Roam', data: d }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet' }], { inboxes, now: NOW });
  assert.match(top, /Dayton/); assert.match(top, /40 times because of what you built/);
  assert.match(body, /▲ 100% vs last week/); assert.match(body, /Last 7 days, just started counting/);
  assert.match(body, /Listing claims to approve/); assert.match(body, /Oct 30 to Nov 5/); assert.match(body, /Not connected yet/);
  assert.match(body, /Where do you want to go/);
  assert.ok(home.QUOTES.includes(home.quoteFor(NOW)));
  assert.notEqual(home.quoteFor(NOW), home.quoteFor(new Date(NOW.getTime() + 86400000)));
  const page = renderDashboardPage({ sites: [], view: 'home', home: { top, body } });
  assert.match(page, /This week at a glance/);
});

test('a counter with no earlier week shows the last 7 days so far, never a false zero', () => {
  const d = data([{ ...m('views', 'Business page views', 0, 0), recent: 88 }, { ...m('outbound', 'Clicks', 0, 0), recent: 12 }, { ...m('visits_search', 'Search', 200, 100), recent: 999 }]);
  const { top, body } = home.homeHtml([{ key: 'okanagan', name: 'Okanagan Roam', data: d }], { now: NOW });
  assert.match(body, /class="big">88</); assert.match(top, /12 times because of what you built/);
  assert.match(body, /class="big">200</); // a real comparison keeps the complete week
});

test('with no clicks yet the top line stays quiet, and the help page explains the words', () => {
  assert.doesNotMatch(home.homeHtml([{ key: 'okanagan', name: 'Okanagan Roam', data: data([]) }], { now: NOW }).top, /because of what you built/);
  const help = renderHelpPage();
  assert.match(help, /five minutes a week/); assert.match(help, /Hard bounce|hard bounce/); assert.match(help, /Funnel/);
});
