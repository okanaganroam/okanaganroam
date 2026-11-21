'use strict';
// Commissions (2026-11-21): programs, on/off from env, taps we sent (our own counts), the page script that counts a tap,
// the earnings typed in by hand, the page, the Home card line and the Monday email line.
require('../test-network-guard').install(); // no real network or email from tests
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const C = require('../commissions');
const P = require('../commissions-page');
const siteEvents = require('../site-events');
const { NAV } = require('../dashboard-layout');
const { LESSONS } = require('../dashboard-learn');
const whatsChanged = require('../whats-changed');
const wcPage = require('../whats-changed-page');

const NOW = new Date('2026-11-21T20:00:00Z'); // Pacific day 2026-11-21
const memDb = () => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE site_event_counts (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name));
  CREATE TABLE commission_earnings (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, program TEXT NOT NULL, site TEXT NOT NULL, bookings INTEGER,
    amount_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'CAD', status TEXT NOT NULL DEFAULT 'pending', note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (month, program, site));`);
  return d;
};
const put = (d, day, name, n) => d.prepare('INSERT INTO site_event_counts (day, name, n) VALUES (?, ?, ?)').run(day, name, n);

test('programs: five, each with terms; dashboard links are https or blank; Fever only Okanagan, Whistler.com only Whistler', () => {
  assert.deepEqual(C.PROGRAM_KEYS, ['stay', 'viator', 'discovercars', 'fever', 'whistlercom']);
  for (const p of C.PROGRAMS) { assert.ok(p.terms && p.name && p.what, p.key); assert.ok(p.dashboard === '' || /^https:\/\//.test(p.dashboard), p.key); }
  assert.deepEqual(C.byKey('fever').sites, ['okanagan']);
  assert.deepEqual(C.byKey('whistlercom').sites, ['whistler']);
  assert.equal(C.byKey('whistlercom').dashboard, '');
});

test('status: live from the env, waiting for applied programs, not on the other site', () => {
  const off = C.status('okanagan', {});
  assert.equal(off.stay.state, 'off'); assert.equal(off.viator.state, 'off'); assert.equal(off.discovercars.state, 'off');
  assert.equal(off.fever.state, 'waiting'); assert.match(off.fever.note, /FEVER_AFFILIATE_TEMPLATE/);
  assert.equal(off.whistlercom.state, 'na');
  const env = { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'abc', VIATOR_PARTNER_ID: 'P00333119', VIATOR_API_KEY: 'k', DISCOVERCARS_AID: 'okanaganroam', FEVER_AFFILIATE_TEMPLATE: 'https://feverup.pxf.io/c/1/2/3?u={url}' };
  const on = C.status('okanagan', env);
  for (const k of ['stay', 'viator', 'discovercars', 'fever']) assert.equal(on[k].state, 'live', k);
  const w = C.status('whistler', env);
  assert.equal(w.fever.state, 'na'); assert.equal(w.whistlercom.state, 'waiting');
  assert.match(C.status('okanagan', { STAY_AFFILIATE_PROVIDER: 'booking', STAY_AFFILIATE_ID: '1' }).stay.note, /booking/);
});

test('site events accept every commission name and keep them out of the auto-counted list', () => {
  assert.equal(C.NAMES.length, C.PROGRAM_KEYS.length * C.SURFACE_KEYS.length);
  for (const n of C.NAMES) { assert.ok(siteEvents.EVENTS.has(n), n); assert.ok(siteEvents.SELF_COUNTED.includes(n), n); }
  assert.ok(!siteEvents.EVENTS.has('commission:evil:stays'));
});

test('clicks: 7 days, the week before, 30 days, where they came from, and Build My Trip taps', () => {
  const d = memDb();
  put(d, '2026-11-21', 'commission:viator:guide', 3);
  put(d, '2026-11-18', 'commission:viator:town', 2);
  put(d, '2026-11-12', 'commission:viator:guide', 4); // week before
  put(d, '2026-10-25', 'commission:viator:guide', 9); // in 30 days, not 14
  put(d, '2026-10-01', 'commission:viator:guide', 50); // too old
  put(d, '2026-11-20', 'commission:stay:stays', 5);
  put(d, '2026-11-20', 'bmt:v4:book:stay', 2); put(d, '2026-11-20', 'bmt:v3:book:stay', 1);
  put(d, '2026-11-20', 'trip_plan_start', 7);
  const c = C.clicks(d, NOW);
  assert.deepEqual(c.range.d7, ['2026-11-15', '2026-11-21']);
  const v = c.programs.viator;
  assert.equal(v.d7, 5); assert.equal(v.p7, 4); assert.equal(v.d30, 18);
  assert.deepEqual(v.surfaces, { guide: 16, town: 2 });
  assert.equal(c.programs.stay.d7, 5); assert.equal(c.programs.stay.bmt7, 3); assert.equal(c.programs.stay.bmt30, 3);
  assert.equal(c.since, '2026-10-01');
  assert.equal(C.totalBetween(d, '2026-11-15', '2026-11-21'), 10);
  const empty = C.clicks(new DatabaseSync(':memory:'), NOW);
  assert.equal(empty.programs.stay.d7, 0); assert.equal(empty.since, null);
});

// Runs the page script against a pretend page and returns the names it counted for a tap on `link`.
function tap(link, { pathname = '/kelowna', pageType = 'region', trusted = true } = {}) {
  const sent = []; let handler = null;
  const el = { getAttribute: (k) => (k in link ? link[k] : null), hasAttribute: (k) => k in link, href: link.href || '' };
  el.closest = (sel) => (sel === 'a[href]' && el.href ? el : null);
  const ctx = { URL, location: { pathname, href: `https://okanaganroam.com${pathname}` }, roamCount: (n) => sent.push(n), document: { addEventListener: (t, f) => { if (t === 'click') handler = f; } } };
  vm.runInNewContext(C.clientJs(pageType), ctx);
  handler({ isTrusted: trusted, target: el });
  return sent;
}

test('page script: sponsored links only, the partner from the link, the kind of page from the address; fake taps are not counted', () => {
  const S = 'sponsored nofollow noopener';
  assert.deepEqual(tap({ href: 'https://www.viator.com/tours/x?pid=P00333119', rel: S, 'data-link': 'viator' }, { pathname: '/guides/wine-tours', pageType: 'guide' }), ['commission:viator:guide']);
  assert.deepEqual(tap({ href: 'https://www.discovercars.com/canada/kelowna/ylw?a_aid=okanaganroam', rel: 'sponsored noopener', 'data-link': 'discovercars' }), ['commission:discovercars:town']);
  assert.deepEqual(tap({ href: 'https://www.stay22.com/allez/booking?aid=x', rel: S, 'data-track': 'stay_click', 'data-stay-id': '4', 'data-affiliate': '1' }, { pathname: '/kelowna/places-to-stay', pageType: 'category' }), ['commission:stay:stays']);
  assert.deepEqual(tap({ href: 'https://www.booking.com/hotel/ca/x.html', rel: S, 'data-track': 'stay_click', 'data-stay-id': '4', 'data-link': 'booking_com' }, { pathname: '/trip', pageType: 'trip' }), ['commission:stay:trip']);
  assert.deepEqual(tap({ href: 'https://feverup.pxf.io/c/1/2/3?u=x', rel: 'sponsored noopener', 'data-link': 'fever' }, { pathname: '/fr/whats-on', pageType: 'hub' }), ['commission:fever:event']);
  assert.deepEqual(tap({ href: 'https://www.viator.com/x', rel: S, 'data-link': 'viator' }, { pathname: '/near/hotel-eldorado', pageType: 'hotel' }), ['commission:viator:hotel']);
  assert.deepEqual(tap({ href: 'https://www.viator.com/x', rel: S, 'data-track': 'booking', 'data-link': 'viator' }, { pathname: '/kelowna/wineries/x', pageType: 'venue' }), ['commission:viator:listing']);
  assert.deepEqual(tap({ href: 'https://www.viator.com/x', rel: S, 'data-link': 'viator' }, { pathname: '/x', pageType: 'not_found' }), ['commission:viator:other']);
  assert.deepEqual(tap({ href: 'https://hotel.example/', rel: 'nofollow noopener', 'data-track': 'stay_click', 'data-stay-id': '4' }, { pageType: 'venue' }), [], 'own hotel site is not a commission link');
  assert.deepEqual(tap({ href: 'https://winery.example/', rel: 'nofollow noopener', 'data-link': 'direct', 'data-track': 'booking' }), []);
  assert.deepEqual(tap({ href: 'https://www.viator.com/x', rel: S, 'data-link': 'viator' }, { trusted: false }), []);
  // A sponsored link with some other data-link is sent, but the server keeps only the names on the list.
  const odd = tap({ href: 'https://x.example/', rel: S, 'data-link': 'mystery' });
  assert.deepEqual(odd, ['commission:mystery:town']); assert.ok(!siteEvents.EVENTS.has(odd[0]));
  for (const n of ['commission:viator:other', 'commission:stay:trip', 'commission:whistlercom:hotel']) assert.ok(siteEvents.EVENTS.has(n), n);
  // The script names no partner (a partner that is off must not appear in any page).
  assert.ok(!/viator|discovercars|stay22|fever|whistler/i.test(C.clientJs('guide')));
});

test('earnings: checked, saved, replaced on the same month/program/site, deleted', () => {
  const d = memDb(); const e = P.createEarnings(d);
  const ok = { month: '2026-11', program: 'stay', site: 'okanagan', bookings: '2', amount: '$12.50', currency: 'cad', status: 'pending', note: 'two stays' };
  assert.equal(e.save(ok).ok, true);
  assert.equal(e.list()[0].amount_cents, 1250); assert.equal(e.list()[0].currency, 'CAD');
  assert.equal(e.save({ ...ok, amount: '20', status: 'paid' }).ok, true);
  assert.equal(e.list().length, 1); assert.equal(e.list()[0].amount_cents, 2000); assert.equal(e.list()[0].status, 'paid');
  for (const [k, v, err] of [['month', '2026-13', 'month'], ['program', 'amazon', 'program'], ['site', 'banff', 'site'], ['amount', 'ten', 'amount'], ['amount', '-5', 'amount'], ['currency', 'EUR', 'currency'], ['status', 'maybe', 'status'], ['bookings', '1.5', 'bookings']]) {
    assert.deepEqual(e.save({ ...ok, [k]: v }), { ok: false, error: err }, `${k}=${v}`);
  }
  assert.deepEqual(e.save({ ...ok, program: 'fever', site: 'whistler' }), { ok: false, error: 'program_site' });
  assert.equal(e.save({ ...ok, program: 'whistlercom', site: 'whistler', bookings: '', note: 'x'.repeat(500) }).ok, true);
  assert.equal(e.list().find((r) => r.program === 'whistlercom').note.length, 200);
  assert.equal(e.list().find((r) => r.program === 'whistlercom').bookings, null);
  const id = e.list()[0].id;
  assert.equal(e.remove(id), true); assert.equal(e.remove(id), false); assert.equal(e.remove('x'), false);
  for (const k of Object.keys(P.ERRORS)) assert.ok(P.ERRORS[k]);
});

test('totals: this month, last month, all time, waiting vs paid, by program; currencies kept apart; payout minimum progress', () => {
  const rows = [
    { month: '2026-11', program: 'discovercars', site: 'okanagan', bookings: 2, amount_cents: 4000, currency: 'USD', status: 'pending' },
    { month: '2026-11', program: 'discovercars', site: 'whistler', bookings: 1, amount_cents: 2000, currency: 'USD', status: 'approved' },
    { month: '2026-10', program: 'stay', site: 'okanagan', bookings: 1, amount_cents: 700, currency: 'CAD', status: 'paid' },
    { month: '2026-09', program: 'viator', site: 'whistler', bookings: 1, amount_cents: 900, currency: 'USD', status: 'paid' },
  ];
  const t = P.totals(rows, NOW);
  assert.equal(t.month, '2026-11'); assert.equal(t.last_month, '2026-10');
  assert.deepEqual(t.all.month, { USD: 6000 }); assert.deepEqual(t.all.last, { CAD: 700 }); assert.deepEqual(t.all.all, { USD: 6900, CAD: 700 });
  assert.deepEqual(t.waiting, { USD: 6000 }); assert.deepEqual(t.all.paid, { CAD: 700, USD: 900 });
  assert.equal(t.programs.discovercars.bookings, 3);
  assert.deepEqual(t.progress.discovercars, { have: 6000, need: 20000, currency: 'USD', pct: 30 });
  assert.equal(t.progress.fever, undefined, 'no known minimum');
  assert.equal(P.moneyAll(t.all.all), 'CA$7.00 + US$69.00');
  assert.equal(P.moneyAll({}), '$0');
  assert.equal(P.totals([], new Date('2027-01-05T20:00:00Z')).last_month, '2026-12');
});

test('the page: menu item, both sites, partner links, the tip, the form; names escaped; a missing Whistler says so', () => {
  assert.ok(NAV.some((g) => g.items.some((i) => i.key === 'commissions' && i.href === '/admin/dashboard/commissions')));
  assert.ok(LESSONS.some((l) => l.id === 'commission'));
  const d = memDb(); put(d, '2026-11-21', 'commission:discovercars:town', 4);
  const ok = C.siteReport(d, 'okanagan', { env: { DISCOVERCARS_AID: 'okanaganroam' }, now: NOW });
  const rows = [{ id: 1, month: '2026-11', program: 'discovercars', site: 'okanagan', bookings: 1, amount_cents: 2000, currency: 'USD', status: 'pending', note: '<script>x</script>' }];
  const html = P.renderCommissionsPage({ sites: [{ key: 'okanagan', name: 'Okanagan Roam', data: ok }, { key: 'whistler', name: 'Whistler Roam', error: 'Whistler Roam doesn’t have the Commissions update yet.' }], rows, notice: 'saved', now: NOW });
  assert.match(html, /noindex/);
  assert.match(html, /<h1>Commissions<\/h1>/);
  for (const p of C.PROGRAMS) assert.ok(html.includes(`<h3>${p.name}</h3>`), p.name);
  assert.match(html, /discover-car-hire\.postaffiliatepro\.com/); assert.match(html, /hub\.stay22\.com/); assert.match(html, /app\.impact\.com/);
  assert.match(html, /Whistler Roam doesn’t have the Commissions update yet/);
  assert.match(html, /Town pages \(Getting here box\)/);
  assert.match(html, /Clicks are not bookings/);
  assert.match(html, /action="\/admin\/dashboard\/commissions\/save"/);
  assert.match(html, /US\$20\.00 of US\$200\.00 waiting to be paid/);
  assert.match(html, /Saved\./);
  assert.ok(!html.includes('<script>x</script>')); assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  const bad = P.renderCommissionsPage({ sites: [], rows: [], notice: 'error_amount', now: NOW });
  assert.match(bad, /Not saved: Type the amount as a number/);
  assert.ok(!P.renderCommissionsPage({ sites: [], rows: [], notice: 'error_<x>', now: NOW }).includes('<x>'));
});

test('weekly summary, Home card and Monday email: taps this week vs last and this month’s earnings', () => {
  const d = memDb();
  put(d, '2026-11-18', 'commission:stay:stays', 6); put(d, '2026-11-10', 'commission:viator:guide', 2);
  const s = whatsChanged.summarize(d, NOW);
  const m = s.metrics.find((x) => x.key === 'commission_clicks');
  assert.equal(m.cur, 6); assert.equal(m.prev, 2);
  const weekly = [{ key: 'okanagan', name: 'Okanagan Roam', data: s }, { key: 'whistler', name: 'Whistler Roam', error: 'x' }];
  const money = P.monthLine([{ month: '2026-11', program: 'stay', site: 'okanagan', amount_cents: 1250, currency: 'CAD', status: 'pending' }], NOW);
  assert.deepEqual(money, { month: 'November 2026', earned: 'CA$12.50', waiting: 'CA$12.50' });
  const home = wcPage.homeHtml(weekly, { now: NOW, commissions: money });
  assert.match(home.body, /href="\/admin\/dashboard\/commissions"><b>6<\/b> taps on commission links this week/);
  assert.match(home.body, /earned in November 2026: <b>CA\$12\.50<\/b>/);
  assert.match(wcPage.homeHtml(weekly, { now: NOW }).body, /no earnings entered yet/);
  const text = wcPage.emailText(weekly, { commissions: money });
  assert.match(text, /Commissions: 6 taps on commission links this week \(2 the week before\)\. Earnings entered for November 2026: CA\$12\.50\./);
  assert.match(wcPage.emailHtml(weekly, {}), /<b>Commissions:<\/b> 6 taps on commission links this week/);
  assert.match(wcPage.commissionText([{ data: { metrics: [] } }], null), /not counted yet/);
});

test('privacy page says we count taps on booking partner links, in English and French', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /how often a link to one of our booking partners \(places to stay, tours, rental cars or tickets\) is tapped and on what kind of page/);
  assert.match(server, /\$\{commissions\.clientJs\(pageType\)\}/);
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'french', 'tools-info.json'), 'utf8'));
  const key = Object.keys(fr).find((k) => k.startsWith('Your favourites, your trip'));
  assert.match(key, /booking partners/);
  assert.match(fr[key], /partenaires de réservation \(hébergement, activités, location de voitures ou billets\)/);
});
