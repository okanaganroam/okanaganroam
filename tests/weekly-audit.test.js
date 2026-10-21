'use strict';
// The weekly enrichment audit (weekly-audit.js, scripts/weekly-audit.js): a small database where every planted
// problem has a known right answer, so each list can be checked exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { buildAudit, renderAuditMarkdown } = require('../weekly-audit.js');

const TODAY = '2026-10-21';
const add = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const H = '{"mon":{"open":"09:00","close":"17:00"}}';

function schema(db) {
  db.exec(`
    CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, reviews INTEGER, website TEXT, phone TEXT, address TEXT,
      latitude REAL, longitude REAL, hours TEXT, hours_source TEXT, hours_checked_at TEXT, redirect_to INTEGER);
    CREATE TABLE venue_seasons (venue_id INTEGER, status TEXT, until_date TEXT, reopens_date TEXT, source_url TEXT, checked_at TEXT);
    CREATE TABLE venue_hours_extra (venue_id INTEGER, seasons TEXT, closures TEXT);
    CREATE TABLE venue_links (venue_id INTEGER, open_months TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, region TEXT, status TEXT, source_type TEXT, source_name TEXT, source_url TEXT, source_checked_at TEXT, event_confidence TEXT);
    CREATE TABLE event_occurrences (event_id INTEGER, start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE event_submissions (status TEXT, submitted_at TEXT);
    CREATE TABLE owner_event_changes (status TEXT, submitted_at TEXT);
    CREATE TABLE venue_submissions (status TEXT, submitted_at TEXT);
    CREATE TABLE owner_change_requests (status TEXT, submitted_at TEXT);
    CREATE TABLE owner_photos (status TEXT, submitted_at TEXT);
    CREATE TABLE visitor_contributions (status TEXT, submitted_at TEXT);
  `);
}

function planted() {
  const db = new DatabaseSync(':memory:');
  schema(db);
  const venue = db.prepare('INSERT INTO venues (id, name, region, type, reviews, website, phone, address, latitude, longitude, hours, hours_source, hours_checked_at, redirect_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const v = (id, name, region, type, reviews, hours, source, checked, redirect = null) => venue.run(id, name, region, type, reviews, 'https://x.example', '250-555-0100', '1 Main St', 49.9, -119.4, hours, source, checked, redirect);
  v(1, 'No Hours Bistro', 'kelowna', 'restaurant', 400, null, null, null);
  v(2, 'Blank Hours Cafe', 'kelowna', 'cafe', 10, '{}', null, null);
  v(3, 'Unverified Winery', 'penticton', 'winery', 300, H, null, null);
  v(4, 'Stale Hours Pub', 'vernon', 'pub', 250, H, 'official_website', add(TODAY, -300));
  v(5, 'Fresh Hours Brewery', 'oliver', 'brewery', 200, H, 'official_website', add(TODAY, -10));
  v(6, 'Never Checked Bar', 'oliver', 'pub', 5, H, 'venue_phone', null);
  v(7, 'Reopens Soon Winery', 'oliver', 'winery', 90, H, 'official_website', add(TODAY, -5));
  v(8, 'Past Reopening Cafe', 'vernon', 'cafe', 80, H, 'official_website', add(TODAY, -5));
  v(9, 'Open Until Passed Golf', 'vernon', 'restaurant', 70, H, 'official_website', add(TODAY, -5));
  v(10, 'Closed No Date Winery', 'penticton', 'winery', 60, H, 'official_website', add(TODAY, -5));
  v(11, 'Recheck Brewery', 'penticton', 'brewery', 50, H, 'official_website', add(TODAY, -5));
  v(12, 'Clearable Pub', 'penticton', 'pub', 40, H, 'official_website', add(TODAY, -5));
  v(13, 'Healthy Open Until Winery', 'penticton', 'winery', 30, H, 'official_website', add(TODAY, -5));
  v(14, 'Closure Soon Bistro', 'kelowna', 'restaurant', 20, H, 'official_website', add(TODAY, -5));
  v(15, 'Old Closure Bistro', 'kelowna', 'restaurant', 20, H, 'official_website', add(TODAY, -5));
  v(16, 'Seasonal Hours Winery', 'kelowna', 'winery', 20, H, 'official_website', add(TODAY, -5));
  v(17, 'Lake Boat Rentals', 'kelowna', 'cafe', 90, H, 'official_website', add(TODAY, -5));
  v(18, 'Owner Season Golf Club', 'kelowna', 'restaurant', 90, H, 'official_website', add(TODAY, -5));
  v(19, 'Plain Bistro', 'kelowna', 'restaurant', 500, H, 'official_website', add(TODAY, -5));
  v(20, 'Redirected Old Bistro', 'kelowna', 'restaurant', 999, null, null, null, 19); // retired: counted nowhere
  const season = db.prepare('INSERT INTO venue_seasons VALUES (?,?,?,?,?,?)');
  season.run(7, 'closed', null, add(TODAY, 10), 'https://s.example/7', add(TODAY, -3));
  season.run(8, 'closed', null, add(TODAY, -5), 'https://s.example/8', add(TODAY, -20));
  season.run(9, 'open_until', add(TODAY, -3), null, 'https://s.example/9', add(TODAY, -40));
  season.run(10, 'closed', null, null, 'https://s.example/10', add(TODAY, -15));
  season.run(11, 'closed', null, add(TODAY, 120), 'https://s.example/11', add(TODAY, -60));
  season.run(12, 'closed', null, add(TODAY, -90), 'https://s.example/12', add(TODAY, -150));
  season.run(13, 'open_until', add(TODAY, 20), null, 'https://s.example/13', add(TODAY, -5));
  season.run(20, 'closed', null, add(TODAY, 5), 'https://s.example/20', add(TODAY, -1)); // retired venue: ignored
  const extra = db.prepare('INSERT INTO venue_hours_extra VALUES (?,?,?)');
  extra.run(14, '[]', JSON.stringify([{ from: add(TODAY, 3), to: add(TODAY, 5), note: 'Private event' }]));
  extra.run(15, '[]', JSON.stringify([{ from: add(TODAY, -70), to: add(TODAY, -60) }]));
  extra.run(16, JSON.stringify([{ from: '11-01', to: '04-30', hours: {} }]), '[]');
  db.prepare('INSERT INTO venue_links VALUES (?,?)').run(18, '5-10');
  const event = db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)');
  const occ = db.prepare('INSERT INTO event_occurrences VALUES (?,?,?,?)');
  const ev = (id, name, region, status, url, checked, dates) => { event.run(id, name, region, status, 'tourism_org', 'Src', url, checked, 'medium'); for (const d of dates) occ.run(id, d, d, d.startsWith('x') ? 'cancelled' : 'scheduled'); };
  ev(1, 'Old Source Fest', 'kelowna', 'scheduled', 'https://e.example/1', add(TODAY, -30), [add(TODAY, 5)]);
  ev(2, 'Fresh Source Night', 'penticton', 'scheduled', 'https://e.example/2', add(TODAY, -2), [add(TODAY, 10)]);
  ev(3, 'No Source Market', 'vernon', 'scheduled', null, null, [add(TODAY, 8)]);
  ev(4, 'Postponed Concert', 'kelowna', 'postponed', 'https://e.example/4', add(TODAY, -3), [add(TODAY, 14)]);
  ev(5, 'Annual Pumpkin Patch', 'lake-country', 'scheduled', 'https://e.example/5', add(TODAY, -300), [add(TODAY, -365 + 20)]);
  ev(6, 'Cancelled Thing', 'kelowna', 'cancelled', null, null, [add(TODAY, 4)]);
  ev(7, 'Far Future Fair', 'oliver', 'scheduled', 'https://e.example/7', add(TODAY, -1), [add(TODAY, 90)]);
  ev(8, 'Long Ago Gala', 'oliver', 'scheduled', 'https://e.example/8', add(TODAY, -500), [add(TODAY, -600)]);
  db.prepare('INSERT INTO event_submissions VALUES (?,?)').run('pending', `${add(TODAY, -9)} 10:00:00`);
  db.prepare('INSERT INTO event_submissions VALUES (?,?)').run('approved', `${add(TODAY, -30)} 10:00:00`);
  db.prepare('INSERT INTO owner_photos VALUES (?,?)').run('pending', `${add(TODAY, -2)} 09:00:00`);
  return db;
}

const ids = (l) => l.items.map((i) => i.id).sort((a, b) => a - b);

test('Weekly audit: every planted problem is found, and nothing else', () => {
  const a = buildAudit(planted(), { today: TODAY });
  assert.equal(a.generated_for, TODAY);
  // Hours: a retired (redirected) venue counts nowhere.
  assert.deepEqual(ids(a.hours.no_hours), [1, 2]);
  assert.deepEqual(ids(a.hours.unverified), [3]);
  assert.deepEqual(ids(a.hours.stale), [4, 6]);
  assert.equal(a.hours.stale.items.find((i) => i.id === 4).age_days, 300);
  assert.equal(a.hours.stale.items[0].id, 6, 'never-checked hours come first');
  // Seasonal closures.
  assert.deepEqual(ids(a.seasons.reopening_due), [7, 8]);
  assert.equal(a.seasons.reopening_due.items.find((i) => i.id === 7).days_until_reopen, 10);
  assert.equal(a.seasons.reopening_due.items.find((i) => i.id === 8).days_until_reopen, -5);
  assert.deepEqual(ids(a.seasons.open_until_passed), [9]);
  assert.deepEqual(ids(a.seasons.closed_without_reopening_date), [10]);
  assert.deepEqual(ids(a.seasons.recheck_source), [11], 'a note in effect, last checked 60 days ago');
  assert.deepEqual(ids(a.seasons.clearable), [12]);
  assert.equal(a.seasons.rows_total, 7, 'the retired venue\'s season row is not counted');
  assert.equal(a.seasons.owner_yearly_seasons, 1);
  // Places that look seasonal but have nothing recorded: not the ones that already have a season, owner months or seasonal hours.
  assert.deepEqual(ids(a.seasons.seasonal_candidates_without_season), [17], 'Lake Boat Rentals only (Golf has a season row, Owner Season Golf has owner months)');
  // Seasonal hours and special closures.
  assert.equal(a.seasonal_hours_and_closures.venues_with_seasonal_hours, 1);
  assert.deepEqual(ids(a.seasonal_hours_and_closures.closures_now_or_soon), [14]);
  assert.deepEqual(ids(a.seasonal_hours_and_closures.expired_closures_to_clear), [15]);
  // Events.
  assert.equal(a.events.upcoming_next_30_days, 4, 'events 1, 2, 3 and 4; not cancelled, far-off or past');
  assert.deepEqual(ids(a.events.starting_soon_source_not_recently_checked), [1, 3]);
  assert.deepEqual(ids(a.events.upcoming_without_source), [3]);
  assert.deepEqual(ids(a.events.postponed_to_confirm), [4]);
  assert.deepEqual(ids(a.events.annual_events_due_new_dates), [5]);
  assert.equal(a.events.annual_events_due_new_dates.items[0].expected_around, add(TODAY, 20));
  assert.deepEqual(a.events.regions_without_events_next_30_days, ['oliver'], 'only Oliver has places but no event in the next 30 days');
  // Review queues.
  assert.deepEqual(a.queues.find((q) => q.queue === 'Event submissions'), { queue: 'Event submissions', pending: 1, oldest_days: 9 });
  assert.equal(a.queues.find((q) => q.queue === 'Owner photos').pending, 1);
  assert.equal(a.queues.find((q) => q.queue === 'Venue submissions').pending, 0);
  // The summary lists what needs attention, and the month's hint is for October.
  assert.ok(a.summary.items > 8 && a.summary.lines.length === a.summary.items);
  assert.match(a.calendar_hint, /golf courses/);
});

test('Weekly audit: lists are capped but totals are not; a bare database and a bad date are handled', () => {
  const capped = buildAudit(planted(), { today: TODAY, config: { listLimit: 1 } });
  assert.equal(capped.hours.no_hours.total, 2);
  assert.equal(capped.hours.no_hours.items.length, 1);
  assert.equal(capped.hours.no_hours.items[0].id, 1, 'the most reviewed first');
  const bare = new DatabaseSync(':memory:');
  bare.exec('CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, reviews INTEGER, website TEXT, phone TEXT, address TEXT, latitude REAL, longitude REAL, hours TEXT, hours_source TEXT, hours_checked_at TEXT, redirect_to INTEGER)');
  const empty = buildAudit(bare, { today: TODAY });
  assert.equal(empty.summary.items, 0);
  assert.equal(empty.events.upcoming_next_30_days, 0);
  assert.throws(() => buildAudit(bare, { today: 'tomorrow' }), /YYYY-MM-DD/);
  assert.throws(() => buildAudit(bare, {}), /YYYY-MM-DD/);
});

test('Weekly audit: the report names the planted places and is clean text', () => {
  const db = planted();
  db.prepare("UPDATE venues SET name = 'Pipe | Winery' WHERE id = 7").run();
  const md = renderAuditMarkdown(buildAudit(db, { today: TODAY }));
  for (const needle of ['# Weekly enrichment audit: 2026-10-21', '## Needs attention', 'Pipe / Winery', 'Past Reopening Cafe', 'Open Until Passed Golf', 'Old Source Fest', 'Postponed Concert', 'Annual Pumpkin Patch', 'Lake Boat Rentals', 'Event submissions']) assert.ok(md.includes(needle), needle);
  assert.ok(!md.includes('Redirected Old Bistro'), 'a retired place is not in the report');
  assert.doesNotMatch(md, /undefined|null|NaN/);
});

test('Weekly audit script: --db writes the report files, and with no token or database it stops with a clear message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okr-audit-'));
  try {
    const file = path.join(dir, 'audit.db');
    const db = new DatabaseSync(file);
    schema(db);
    db.prepare("INSERT INTO venues (id, name, region, type, reviews, hours) VALUES (1, 'Script Bistro', 'kelowna', 'restaurant', 5, NULL)").run();
    db.close();
    const script = path.join(__dirname, '..', 'scripts', 'weekly-audit.js');
    const env = { ...process.env }; delete env.AUDIT_READ_TOKEN; delete env.ENRICHMENT_ADMIN_TOKEN;
    const ok = spawnSync(process.execPath, ['--no-warnings', script, '--db', file, '--date', TODAY, '--out', path.join(dir, 'out')], { env, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Weekly audit for 2026-10-21: \d+ things need attention/);
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'out', '2026-10-21.json'), 'utf8'));
    assert.equal(json.hours.no_hours.items[0].name, 'Script Bistro');
    assert.match(fs.readFileSync(path.join(dir, 'out', '2026-10-21.md'), 'utf8'), /Script Bistro/);
    const none = spawnSync(process.execPath, ['--no-warnings', script, '--out', path.join(dir, 'out2')], { env, encoding: 'utf8' });
    assert.equal(none.status, 2);
    assert.match(none.stderr, /AUDIT_READ_TOKEN/);
    assert.ok(!fs.existsSync(path.join(dir, 'out2')), 'nothing is written when the audit cannot run');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
