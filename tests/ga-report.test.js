'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ga = require('../ga-report');
const { renderDashboardPage } = require('../dashboard-page');

const mv = (...v) => v.map((value) => ({ value: String(value) }));
const sample = { reports: [
  { rows: [{ metricValues: mv(377, 300, 535, 1200, 0.61, 95.4) }] },
  { rows: [{ dimensionValues: mv('20261104'), metricValues: mv(40) }, { dimensionValues: mv('20261105'), metricValues: mv(55) }] },
  { rows: [{ dimensionValues: mv('/map'), metricValues: mv(210) }] },
  { rows: [{ dimensionValues: mv('Organic Search'), metricValues: mv(300) }] },
  { rows: [{ dimensionValues: mv('mobile'), metricValues: mv(400) }] },
] };

test('shape turns the Google response into plain numbers', () => {
  const s = ga.shape(sample, 30);
  assert.equal(s.users, 377); assert.equal(s.sessions, 535); assert.equal(s.engagement_rate, 61); assert.equal(s.avg_session_seconds, 95);
  assert.deepEqual(s.users_per_day[1], { day: '2026-11-05', n: 55 });
  assert.equal(s.top_pages[0].path, '/map'); assert.equal(s.channels[0].name, 'Organic Search'); assert.equal(s.devices[0].name, 'mobile');
});

test('without the settings it is simply not connected', async () => {
  const keep = [process.env.GA_SERVICE_ACCOUNT_JSON, process.env.GA_PROPERTY_ID];
  delete process.env.GA_SERVICE_ACCOUNT_JSON; delete process.env.GA_PROPERTY_ID;
  assert.equal(await ga.report(30), null);
  [process.env.GA_SERVICE_ACCOUNT_JSON, process.env.GA_PROPERTY_ID] = keep.map((v) => v || '');
  if (!keep[0]) delete process.env.GA_SERVICE_ACCOUNT_JSON; if (!keep[1]) delete process.env.GA_PROPERTY_ID;
});

test('bad JSON in the key setting is treated as not connected, never thrown', () => {
  process.env.GA_SERVICE_ACCOUNT_JSON = '{not json'; process.env.GA_PROPERTY_ID = '123';
  assert.equal(ga.creds(), null);
  delete process.env.GA_SERVICE_ACCOUNT_JSON; delete process.env.GA_PROPERTY_ID;
});

test('page: shows traffic, escapes page paths, and shows errors without breaking', () => {
  const s = ga.shape(sample, 30); s.top_pages[0].path = '/x<script>alert(1)</script>';
  const html = renderDashboardPage({ sites: [
    { key: 'okanagan', name: 'Okanagan Roam', data: { traffic: s }, error: null },
    { key: 'whistler', name: 'Whistler Roam', data: { traffic: { error: 'Google refused access' } }, error: null },
  ], days: 30, site: 'both' });
  assert.match(html, /Traffic \(Google Analytics\)/); assert.match(html, /535/); assert.match(html, /1:35/);
  assert.ok(!html.includes('<script>alert(1)'));
  assert.match(html, /Google refused access/);
});
