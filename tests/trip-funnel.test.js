'use strict';
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const tf = require('../trip-funnel');
const se = require('../site-events');
const { createFunnels } = require('../funnels');
const { renderFunnelsPage } = require('../funnels-page');
const whatsChanged = require('../whats-changed');

const NOW = new Date('2026-11-21T20:00:00Z');
function memDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE venues (id INTEGER PRIMARY KEY, name TEXT, region TEXT, type TEXT, redirect_to INTEGER);
  CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));`);
  return d;
}
const req = (ua = 'Mozilla/5.0 (iPhone) Safari', cookie = '') => ({ headers: { 'user-agent': ua, cookie } });

test('booking kinds: a business link is a tasting, a table or other from its type; other names pass through', () => {
  const types = { 1: 'winery', 2: 'restaurant', 3: 'outdoor', 4: 'distillery', 5: 'cafe' };
  const typeOf = (id) => types[id] || null;
  assert.equal(tf.resolveName('bmt:v4:book:venue', 1, typeOf), 'bmt:v4:book:tasting');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 4, typeOf), 'bmt:v4:book:tasting');
  assert.equal(tf.resolveName('bmt:v3:book:venue', 2, typeOf), 'bmt:v3:book:reservation');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 5, typeOf), 'bmt:v4:book:reservation');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 3, typeOf), 'bmt:v4:book:other');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 'x', typeOf), 'bmt:v4:book:other');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 9, () => { throw new Error('db'); }), 'bmt:v4:book:other');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 1, typeOf, 'viator'), 'bmt:v4:book:viator', 'a partner link wins over the type');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 0, typeOf, 'viator'), 'bmt:v4:book:viator');
  assert.equal(tf.resolveName('bmt:v4:book:venue', 2, typeOf, 'booking'), 'bmt:v4:book:reservation');
  assert.equal(tf.resolveName('bmt:v4:plan', 1, typeOf), 'bmt:v4:plan');
  assert.equal(tf.resolveName('trip_share', undefined, typeOf), 'trip_share');
  // The unresolved name is never stored.
  assert.ok(!se.EVENTS.has('bmt:v4:book:venue'));
});

test('the funnel names are on the fixed list, counted once each; bots, our check scripts and internal visits are not', () => {
  const db = memDb(); const c = se.createCounter(db);
  for (const n of ['bmt:v4:plan', 'bmt:v4:confirm', 'bmt:v4:book_open', 'bmt:v4:book:stay', 'bmt:v4:book:viator', 'bmt:v4:share:native', 'bmt:v3:plan', 'bmt:v3:share:copy']) assert.equal(c.record(req(), n, '1.1.1.1', NOW), true, n);
  assert.equal(c.record(req(), 'bmt:v3:confirm', '1.1.1.1', NOW), false, 'the old page has no Confirm step');
  assert.equal(c.record(req(), 'bmt:v9:plan', '1.1.1.1', NOW), false);
  assert.equal(c.record(req('okanaganroam-check/1.0'), 'bmt:v4:plan', '1.1.1.2', NOW), false);
  assert.equal(c.record(req('whistlerroam-check/1.0'), 'bmt:v4:plan', '1.1.1.2', NOW), false);
  assert.equal(c.record(req('Googlebot/2.1'), 'bmt:v4:plan', '1.1.1.2', NOW), false);
  assert.equal(c.record(req(undefined, 'roam_internal=1'), 'bmt:v4:plan', '1.1.1.2', NOW), false);
  assert.equal(c.summary(30, NOW).totals['bmt:v4:plan'], 1);
  // Only the planner page sends them: they stay out of the site-wide list every page carries.
  for (const n of tf.NAMES) assert.ok(se.SELF_COUNTED.includes(n), n);
});

function seed(db) {
  const ins = db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)');
  const today = '2026-11-21';
  for (const [n, v] of [['bmt:v4:plan', 100], ['bmt:v4:swap', 30], ['bmt:v4:remove', 20], ['bmt:v4:confirm', 50], ['bmt:v4:book_open', 25], ['bmt:v4:book_click', 10],
    ['bmt:v4:book:stay', 6], ['bmt:v4:book:viator', 3], ['bmt:v4:book:tasting', 4], ['bmt:v4:book:reservation', 2], ['bmt:v4:share', 8], ['bmt:v4:share:native', 6], ['bmt:v4:share:copy', 3], ['bmt:v4:save', 12],
    ['trip_plan_start', 500]]) ins.run(today, n, v);
  ins.run('2026-11-16', 'bmt:v4:plan', 40); // the Monday before, same week
  ins.run('2026-11-14', 'bmt:v4:plan', 7); // the week before
  ins.run('2026-11-14', 'bmt:v4:book:stay', 2);
  ins.run('2026-09-01', 'bmt:v4:plan', 999); // outside the window
}

test('report: steps, conversion between main steps, booking kinds, share methods, days and weeks', () => {
  const db = memDb(); seed(db);
  const f = tf.report(db, 30, NOW);
  const v4 = f.versions.v4;
  assert.deepEqual(v4.steps.map((s) => [s.key, s.n]), [['plan', 147], ['swap', 30], ['remove', 20], ['confirm', 50], ['book_open', 25], ['book_click', 10], ['share', 8], ['save', 12], ['chat', 0]]);
  assert.deepEqual(v4.chat.map((c) => [c.key, c.n]), [['ai', 0], ['ai_fixed', 0], ['rules_over_ai', 0], ['ai_slow', 0], ['rules', 0], ['chip', 0], ['cant', 0], ['none', 0]], 'travel agent chat messages, by how they were read');
  assert.deepEqual(f.versions.v3.chat, []);
  const by = Object.fromEntries(v4.steps.map((s) => [s.key, s]));
  assert.equal(by.plan.of_previous, null);
  assert.equal(by.confirm.of_previous, 34); // 50 of 147
  assert.equal(by.book_open.of_previous, 50);
  assert.equal(by.book_click.of_previous, 40);
  assert.equal(by.swap.of_previous, null, 'side steps are not part of the chain');
  assert.equal(by.save.of_plans, 8.2);
  assert.deepEqual(v4.book.map((b) => [b.key, b.n]), [['stay', 8], ['viator', 3], ['fever', 0], ['discovercars', 0], ['tasting', 4], ['reservation', 2], ['other', 0]]);
  assert.equal(v4.commission_taps, 11);
  assert.equal(v4.book_taps, 17);
  assert.deepEqual(v4.share.map((m) => m.n), [6, 3]);
  assert.equal(f.show_v3, false);
  assert.equal(f.versions.v3.steps.find((s) => s.key === 'confirm').n, null);
  assert.equal(f.plans_per_day.length, 30);
  assert.equal(f.plans_per_day[29].n, 100);
  assert.equal(f.weeks[0].start, '2026-11-16');
  assert.equal(f.weeks[0].plan, 140);
  assert.equal(f.weeks[0].commission_taps, 9);
  assert.equal(f.weeks[1].start, '2026-11-09');
  assert.equal(f.weeks[1].plan, 7);
  assert.equal(f.weeks[1].book_taps, 2);
});

test('report: the old page shows only while it has visits, and its chain skips the steps it does not have', () => {
  const db = memDb(); seed(db);
  const ins = db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)');
  ins.run('2026-11-21', 'bmt:v3:plan', 20); ins.run('2026-11-21', 'bmt:v3:book_click', 5); ins.run('2026-11-21', 'bmt:v3:book:stay', 5);
  const f = tf.report(db, 7, NOW);
  assert.equal(f.show_v3, true);
  const bc = f.versions.v3.steps.find((s) => s.key === 'book_click');
  assert.equal(bc.of_previous, 25);
  assert.equal(f.weeks[0].plan, 160);
});

test('dashboard: the funnels page shows the funnel; the old page only with traffic; the Monday numbers include it', () => {
  const db = memDb(); seed(db);
  db.exec(`CREATE TABLE referral_counts (day TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, source, page));`);
  const data = createFunnels(db).report(30, NOW);
  assert.equal(data.trip.funnel.versions.v4.steps[0].n, 147);
  const html = renderFunnelsPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data }, { key: 'whistler', name: 'Whistler Roam', data: { ...data, trip: { ...data.trip, funnel: undefined } } }] });
  assert.match(html, /Build My Trip funnel/);
  assert.match(html, /Opened “Book my trip”/);
  assert.match(html, /Viator tour or activity/);
  assert.match(html, /Week by week/);
  assert.doesNotMatch(html, /Old page \(\/trip\?v=3\)/);
  db.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)').run('2026-11-21', 'bmt:v3:plan', 3);
  assert.match(renderFunnelsPage({ days: 30, sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: createFunnels(db).report(30, NOW) }] }), /Old page \(\/trip\?v=3\)/);

  // The Monday email's numbers: the last complete week (to Nov 20) against the one before.
  const db2 = memDb(); const ins = db2.prepare('INSERT INTO site_event_counts VALUES (?, ?, ?)');
  ins.run('2026-11-18', 'bmt:v4:plan', 9); ins.run('2026-11-18', 'bmt:v3:plan', 1); ins.run('2026-11-19', 'bmt:v4:book:stay', 4); ins.run('2026-11-19', 'bmt:v4:book:viator', 1); ins.run('2026-11-12', 'bmt:v4:plan', 2);
  const m = Object.fromEntries(whatsChanged.summarize(db2, NOW).metrics.map((x) => [x.key, x]));
  assert.equal(m.bmt_plan.cur, 10); assert.equal(m.bmt_plan.prev, 2);
  assert.equal(m.bmt_commission.cur, 5);
});

// ---- the page script, run against a tiny stand-in for the page ----
function el(tag, attrs = {}, parent = null, classes = []) {
  const e = { tagName: tag.toUpperCase(), attrs, parent, classes, classList: { contains: (c) => classes.includes(c) } };
  e.getAttribute = (k) => (k in attrs ? String(attrs[k]) : null);
  e.matches = (sel) => sel.split(',').map((x) => x.trim()).some((one) => {
    const m = /^([a-z]*)((?:\[[^\]]+\]|\.[\w-]+)*)$/.exec(one); if (!m) return false;
    if (m[1] && m[1].toUpperCase() !== e.tagName) return false;
    return (m[2].match(/\[[^\]]+\]|\.[\w-]+/g) || []).every((p) => {
      if (p[0] === '.') return classes.includes(p.slice(1));
      const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(p); return a && a[1] in attrs && (a[2] === undefined || String(attrs[a[1]]) === a[2]);
    });
  });
  e.closest = (sel) => { for (let n = e; n; n = n.parent) if (n.matches(sel)) return n; return null; };
  e.contains = (o) => { for (let n = o; n; n = n.parent) if (n === e) return true; return false; };
  return e;
}
function page({ v4 = true, cookie = '' } = {}) {
  const sent = []; const listeners = []; const ga = [];
  const main = el('main', { id: 'tripV3' }, null, v4 ? ['t3', 't3-v4'] : ['t3']);
  const result = el('div', { id: 't3Result' }, main);
  const byId = { tripV3: main, t3Result: result };
  const window = { trackEvent: (n, p) => { ga.push([n, p]); } };
  const ctx = {
    window, JSON, Number, Blob: class { constructor(parts) { this.text = parts.join(''); } },
    navigator: { sendBeacon: (url, blob) => { sent.push([url, JSON.parse(blob.text)]); return true; } },
    document: { cookie, getElementById: (id) => byId[id] || null, addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) },
  };
  vm.runInNewContext(tf.clientScript().replace(/^<script>|<\/script>$/g, ''), ctx);
  const click = (target, trusted = true) => listeners.filter((l) => l.type === 'click').forEach((l) => l.fn({ isTrusted: trusted, target }));
  return { sent, ga, main, result, window, click, listeners, names: () => sent.map((s) => s[1].name) };
}

test('page script: each step is sent once per visit by beacon, the page’s own analytics still run, nothing blocks', () => {
  const p = page();
  assert.ok(p.listeners.every((l) => l.capture === true), 'reads clicks in the capture phase, never in the way');
  p.window.trackEvent('trip_plan_complete', { request_type: 'initial' });
  p.window.trackEvent('trip_plan_complete', { request_type: 'replace' });
  assert.equal(p.ga.length, 2, 'the original analytics call still runs');
  const row = el('li', {}, p.result);
  p.click(el('button', { 'data-t3-swap': '1-morning' }, row));
  p.click(el('button', { 'data-t3-swap-id': '7' }, row));
  p.click(el('button', { 'data-t3-remove': '1-lunch' }, row));
  p.click(el('button', { 'data-v4-confirm': '' }, p.main));
  p.click(el('button', { 'data-v4-book': '' }, p.main));
  p.click(el('button', { 'data-v4-save': '', 'aria-pressed': 'false' }, p.main));
  p.click(el('button', { 'data-v4-save': '', 'aria-pressed': 'true' }, p.main));
  p.click(el('button', { 'data-v4-confirm': '' }, p.main), false); // not a real tap
  assert.deepEqual(p.names(), ['bmt:v4:plan', 'bmt:v4:swap', 'bmt:v4:remove', 'bmt:v4:confirm', 'bmt:v4:book_open', 'bmt:v4:save']);
  assert.ok(p.sent.every((s) => s[0] === '/api/site-event'));
});

test('page script: booking taps by kind (stay, Viator, a business), share by method; the old page says v3', () => {
  const p = page();
  const box = el('section', {}, p.result, ['t3-stay']);
  p.click(el('a', { href: 'https://www.stay22.com/x', 'data-track': 'stay_click', 'data-stay-id': '5', 'data-link': 'stay22' }, box));
  p.click(el('a', { href: 'https://viator.com/x', 'data-track': 'booking', 'data-link': 'viator', 'data-venue-id': '9' }, box));
  const span = el('span', {}, el('a', { href: 'https://winery.example/book', 'data-track': 'booking', 'data-venue-id': '12' }, box));
  p.click(span);
  p.click(el('a', { href: '/kelowna/wineries/x' }, p.result)); // a place page, not a booking
  p.window.trackEvent('trip_share', { method: 'native', source: 'plan_v4' });
  p.window.trackEvent('trip_plan_share', { share_method: 'native' }); // the same share, said twice by the page
  p.window.trackEvent('trip_share', { method: 'manual' });
  assert.deepEqual(p.sent.map((s) => s[1]), [
    { name: 'bmt:v4:book:stay' }, { name: 'bmt:v4:book_click' }, { name: 'bmt:v4:book:venue', link: 'viator', venue_id: 9 }, { name: 'bmt:v4:book:venue', link: '', venue_id: 12 },
    { name: 'bmt:v4:share:native' }, { name: 'bmt:v4:share' }, { name: 'bmt:v4:share:copy' },
  ]);

  const old = page({ v4: false });
  old.window.trackEvent('trip_plan_complete', {});
  old.window.trackEvent('trip_plan_share', { share_method: 'clipboard' });
  old.window.trackEvent('add_whole_trip', { added_count: 3 });
  assert.deepEqual(old.names(), ['bmt:v3:plan', 'bmt:v3:share:copy', 'bmt:v3:share', 'bmt:v3:save']);
});

test('page script: our own visits (roam_internal) send nothing; the script only goes on the planner page', () => {
  const p = page({ cookie: 'roam_internal=1' });
  p.window.trackEvent('trip_plan_complete', {});
  assert.equal(p.sent.length, 0);
  assert.equal(p.ga.length, 1);
  const html = '<html><body><main class="t3 t3-v4" id="tripV3"></main><script>x</script></body></html>';
  const out = tf.withTripFunnelScript(html);
  assert.ok(out.indexOf('bmt:') > out.indexOf('id="tripV3"') && out.endsWith('<script>x</script></body></html>'), 'the page script stays last');
  assert.doesNotMatch(tf.clientScript(), /window\.trackEvent = function\(name, params\)/, 'the site has one analytics wrapper; this only listens');
  assert.equal(tf.withTripFunnelScript('<html><body>home</body></html>'), '<html><body>home</body></html>');
  assert.ok(tf.clientScript().length < 4000, 'small: the page stays fast');
  assert.doesNotMatch(tf.clientScript(), /viator/i, 'names no booking partner (a switched-off partner leaves no trace on /trip)');
});

// ---- the real endpoint and page (uses this checkout's database; rows it adds are taken out again) ----
test('POST /api/site-event: a business booking tap is stored as its kind, never with the id; /trip carries the script', async () => {
  const http = require('node:http');
  const app = require('../server');
  const db = require('../db');
  const v = db.prepare("SELECT id FROM venues WHERE type = 'winery' AND redirect_to IS NULL LIMIT 1").get();
  const prevV3 = process.env.TRIP_PLANNER_V3;
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const day = require('../trip-demand').dayOf();
  const before = db.prepare("SELECT name, n FROM site_event_counts WHERE day = ? AND name LIKE 'bmt:%'").all(day);
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
  const post = (body, agent = ua) => fetch(`${base}/api/site-event`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': agent, Origin: base, 'X-Real-IP': '203.0.113.77' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ name: 'bmt:v4:book:venue', venue_id: v.id })).status, 204);
    assert.equal((await post({ name: 'bmt:v4:plan' })).status, 204);
    assert.equal((await post({ name: 'bmt:v4:book:venue', link: 'viator', venue_id: v.id })).status, 204);
    assert.equal((await post({ name: 'bmt:v4:plan' }, 'okanaganroam-check/1.0')).status, 204);
    const rows = Object.fromEntries(db.prepare("SELECT name, n FROM site_event_counts WHERE day = ? AND name LIKE 'bmt:%'").all(day).map((r) => [r.name, r.n]));
    const was = Object.fromEntries(before.map((r) => [r.name, r.n]));
    assert.equal((rows['bmt:v4:book:tasting'] || 0) - (was['bmt:v4:book:tasting'] || 0), 1);
    assert.equal((rows['bmt:v4:plan'] || 0) - (was['bmt:v4:plan'] || 0), 1, 'the check script is not counted');
    assert.equal((rows['bmt:v4:book:viator'] || 0) - (was['bmt:v4:book:viator'] || 0), 1);
    assert.ok(!('bmt:v4:book:venue' in rows));
    process.env.TRIP_PLANNER_V3 = 'on';
    const html = await (await fetch(`${base}/trip?v=4`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text();
    assert.match(html, /window\.__roamTripFunnel/);
    const old = await (await fetch(`${base}/trip?v=3`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } })).text();
    assert.match(old, /id="tripV3"/); assert.match(old, /window\.__roamTripFunnel/);
    assert.doesNotMatch(old, /class="t3 t3-v4"/);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.doesNotMatch(head, /bmt:v4/, 'the funnel names are not in the site-wide list every page carries');
  } finally {
    srv.close();
    if (prevV3 === undefined) delete process.env.TRIP_PLANNER_V3; else process.env.TRIP_PLANNER_V3 = prevV3;
    db.prepare("DELETE FROM site_event_counts WHERE day = ? AND name LIKE 'bmt:%'").run(day);
    const ins = db.prepare('INSERT INTO site_event_counts (day, name, n) VALUES (?, ?, ?)');
    for (const r of before) ins.run(day, r.name, r.n);
  }
});
