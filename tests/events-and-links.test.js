'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const va = require('../venue-activity');
const { checkText, checkPaths } = require('../scripts/utm-links');

const NOW = new Date('2026-11-06T20:00:00Z');
const TAGS = 'utm_source=a&utm_medium=email&utm_campaign=b';

test('the link check finds untagged and half-tagged links on both sites and leaves the rest alone', () => {
  const text = [
    `Good https://okanaganroam.com/kelowna?${TAGS}.`,
    'Plain https://okanaganroam.com/kelowna, and https://whistlerroam.com',
    'Half https://www.whistlerroam.com/map?utm_source=a',
    'Private https://okanaganroam.com/owner/abc123 and a file https://okanaganroam.com/badges/a.png',
    'Elsewhere https://example.com/okanaganroam.com',
    '<a href="https://okanaganroam.com/kelowna">badge</a>',
  ].join('\n');
  const r = checkText(text);
  assert.deepEqual(r.problems, [
    { line: 2, url: 'https://okanaganroam.com/kelowna', problem: 'no tags' },
    { line: 2, url: 'https://whistlerroam.com', problem: 'no tags' },
    { line: 3, url: 'https://www.whistlerroam.com/map?utm_source=a', problem: 'missing utm_medium, utm_campaign' },
  ]);
  assert.equal(r.inAttribute, 1);
});

test('the link check reads JSON text and whole folders, and fails only when a link needs fixing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utm-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'ok.txt'), `https://okanaganroam.com/?${TAGS}\n`);
  fs.writeFileSync(path.join(dir, 'skip.png'), 'https://okanaganroam.com/kelowna');
  assert.equal(checkPaths([dir]).ok, true);
  fs.writeFileSync(path.join(dir, 'sub', 'mail.json'), JSON.stringify({ body: 'Hi\nhttps://okanaganroam.com/kelowna\nBye' }));
  const r = checkPaths([dir]);
  assert.equal(r.ok, false);
  assert.match(r.report, /mail\.json:1 {2}no tags {2}https:\/\/okanaganroam\.com\/kelowna\n/);
  assert.match(r.report, /2 file\(s\) checked: 1 link\(s\) to fix/);
  fs.rmSync(dir, { recursive: true });
});

const memDb = () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venue_event_counts (day TEXT, venue_id INTEGER, name TEXT, n INTEGER, PRIMARY KEY (day, venue_id, name));
    CREATE TABLE event_click_counts (day TEXT, event_id INTEGER, name TEXT, n INTEGER, PRIMARY KEY (day, event_id, name));
    CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, slug TEXT, redirect_to TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, region TEXT, start_datetime TEXT, end_datetime TEXT, recurrence_rule TEXT);`);
  const ev = d.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)');
  ev.run(1, 'Big Show', 'big-show', 'kelowna', '2026-11-20T19:00', null, null);
  ev.run(2, 'Old Fair', 'old-fair', 'kelowna', '2026-10-01T10:00', '2026-10-02T10:00', null);
  ev.run(3, 'Quiet Night', 'quiet-night', 'vernon', '2026-11-10T19:00', null, null);
  ev.run(4, 'Far Away', 'far-away', 'vernon', '2027-03-01T19:00', null, null);
  ev.run(5, 'Weekly Market', 'weekly-market', 'vernon', '2026-01-01T09:00', null, 'FREQ=WEEKLY');
  ev.run(6, 'Long Show', 'long-show', 'vernon', '2026-10-20T09:00', '2026-12-20T09:00', null);
  const c = d.prepare('INSERT INTO event_click_counts VALUES (?, ?, ?, ?)');
  c.run('2026-11-05', 1, 'event_view', 8); c.run('2026-11-05', 1, 'click:tickets_info', 3); c.run('2026-11-05', 1, 'click:add_to_google_calendar', 1); c.run('2026-11-05', 1, 'click:add_to_calendar', 1);
  c.run('2026-11-05', 1, 'click:breadcrumb', 9); // not an action on the event
  c.run('2026-11-05', 2, 'event_view', 20);
  c.run('2026-08-01', 3, 'event_view', 50); // outside the window
  return d;
};

test('event performance: views, actions, past events marked, coming events nobody opened', () => {
  const r = va.createCounter(memDb()).eventStats(30, 100, NOW);
  assert.deepEqual(r.events.map((e) => e.name), ['Old Fair', 'Big Show']);
  const big = r.events[1];
  assert.equal(big.path, '/kelowna/events/big-show');
  assert.deepEqual([big.tickets, big.calendar, big.actions, big.upcoming], [3, 2, 5, true]);
  assert.equal(r.events[0].upcoming, false);
  assert.deepEqual(r.most_action.map((e) => e.name), ['Big Show']);
  assert.deepEqual(r.totals, { views: 28, tickets: 3, calendar: 2, directions: 0, trip: 0, favorite: 0 });
  assert.deepEqual(r.unseen_soon.map((e) => e.name), ['Long Show', 'Weekly Market', 'Quiet Night']); // running now first, far-off left out
  assert.equal(r.unseen_soon_count, 3);
  assert.deepEqual([r.listed, r.upcoming, r.with_views], [6, 5, 2]);
});

test('the event page draws, with a site that is not connected', () => {
  const { renderEventsPage } = require('../pages-page');
  const data = va.createCounter(memDb()).eventStats(30, 100, NOW);
  const html = renderEventsPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data }, { key: 'whistler', name: 'Whistler Roam', error: 'Not connected yet.' }] });
  assert.match(html, /Which What’s On events get opened/); assert.match(html, />Big Show</); assert.match(html, /Not connected yet/);
});
