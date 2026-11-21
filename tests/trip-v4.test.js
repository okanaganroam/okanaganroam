// Build My Trip V4 (2026-11-20, Dayton): the simple plan page and the planner's V4 rules, tested on a Kelowna fixture shaped
// like the live listings for "3 days in Kelowna with my partner, wineries, a nice dinner and a hike". PURE planner tests
// (no server, no database), plus the page's HTML and script. The V4 rules apply only with input.v4 (POST /api/trip/plan?v=4).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const tp = require('../trip-planner.js');
const fx = require('./fixtures/trip-v4-kelowna.js');
const page = require('../trip-planner-v3-page.js');

const Q = '3 days in Kelowna with my partner, wineries, a nice dinner and a hike';
const plan = (text, v4) => fx.plan(text, { extra: v4 ? { v4: true } : {} });
const venueStops = (day) => day.stops.filter((s) => s.venue && !s.event);
const fact = (s) => fx.BY_ID.get(s.venue.id);
const rowOf = (p, day, s) => (p.schedule || []).find((r) => r.day === day.day && r.venueId === s.venue.id);

test('V4 lunch: every full day of the plan has a lunch stop at a restaurant or café, timed at lunch', () => {
  const p = plan(Q, true);
  assert.equal(p.days.length, 3);
  for (const day of p.days) {
    const lunch = venueStops(day).find((s) => s.daypart === 'midday' && ['restaurant', 'cafe', 'pub'].includes(s.venue.type));
    assert.ok(lunch, `day ${day.day}: ${day.stops.map((s) => s.daypart + ':' + (s.venue ? s.venue.name : '-')).join(', ')}`);
    const r = rowOf(p, day, lunch);
    assert.ok(r && r.startMinutes >= 690 && r.startMinutes <= 810, `day ${day.day} lunch at ${r && r.startMinutes}`);
  }
});

test('V4 nice dinner: "a nice dinner" on a 3-day trip is a sit-down restaurant every evening, never a pub or sports bar', () => {
  const p = plan(Q, true);
  for (const day of p.days) {
    const dinner = venueStops(day).find((s) => ['evening', 'night'].includes(s.daypart));
    assert.ok(dinner, `day ${day.day} has dinner`);
    assert.equal(dinner.venue.type, 'restaurant');
    assert.notEqual(dinner.venue.id, fx.SPORTS_BAR.id, 'never Hey Hey Bar & Grill');
    assert.notEqual(dinner.venue.id, fx.PUB.id);
    assert.equal(tp.v4CasualDinner(fact(dinner)), false, dinner.venue.name);
  }
  assert.ok(!(p.warnings || []).some((w) => /You asked for one dinner/.test(w)));
});

test('V4 nice dinner filter: pubs, sports bars, bar & grills and casual places are not nice dinners', () => {
  assert.equal(tp.v4CasualDinner(fx.SPORTS_BAR), true);
  assert.equal(tp.v4CasualDinner(fx.PUB), true);
  for (const v of fx.FINE.concat(fx.SITDOWN)) assert.equal(tp.v4CasualDinner(v), false, v.name);
  assert.equal(tp.v4CasualDinner({ type: 'restaurant', name: 'The Office Bar and Grill', textName: 'the office bar and grill', textCuisine: '', features: {} }), true);
  assert.equal(tp.v4CasualDinner({ type: 'restaurant', name: 'Bistro', textName: 'bistro', textCuisine: '', features: { sports_tv: true } }), true);
  assert.equal(tp.v4NiceDinnerAsked('3 days in kelowna with my partner wineries a nice dinner and a hike'), true);
  assert.equal(tp.v4NiceDinnerAsked('a romantic dinner'), true);
  assert.equal(tp.v4NiceDinnerAsked('a nice dinner at a pub'), false);
});

test('V4 wineries: at most two a day and a lighter wine day every second day, so the days are not all the same', () => {
  const p = plan(Q, true);
  const counts = p.days.map((day) => venueStops(day).filter((s) => s.venue.type === 'winery' && !s.wineryLunch).length);
  counts.forEach((n, i) => assert.ok(n <= tp.v4WineDayMax(i + 1, p.days.length), `day ${i + 1}: ${n} wineries`));
  assert.ok(counts.reduce((a, b) => a + b, 0) <= 5, counts.join(','));
  assert.ok(counts.some((n) => n >= 1), 'still a wine trip');
  assert.equal(tp.v4WineDayMax(2, 3), 1);
  assert.equal(tp.v4WineDayMax(1, 3), 2);
  assert.equal(tp.v4WineDayMax(2, 2), 2);
});

test('V4 wineries: a number of wineries asked for is kept', () => {
  const p = plan('2 days in Kelowna, 3 wineries a day and dinner', true);
  const counts = p.days.map((day) => venueStops(day).filter((s) => s.venue.type === 'winery').length);
  assert.ok(counts.some((n) => n >= 3), counts.join(','));
});

test('V4 times: every timed visit starts and ends on the quarter hour', () => {
  const p = plan(Q, true);
  const rows = (p.schedule || []).filter((r) => r.venueId && Number.isFinite(r.startMinutes));
  assert.ok(rows.length >= 9);
  for (const r of rows) {
    assert.equal(r.startMinutes % 15, 0, `start ${r.startMinutes}`);
    if (Number.isFinite(r.endMinutes)) assert.equal(r.endMinutes % 15, 0, `end ${r.endMinutes}`);
  }
});

test('V4 keeps the planner honest: every stop is a listed place that is open at its time', () => {
  const p = plan(Q, true);
  for (const day of p.days) for (const s of venueStops(day)) {
    const v = fact(s);
    assert.ok(v, `${s.venue.name} is a listing`);
    const r = rowOf(p, day, s);
    if (!r || !Number.isFinite(r.startMinutes) || !v.hours) continue;
    const h = JSON.parse(v.hours), wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${r.date || '2026-11-21'}T12:00:00Z`).getUTCDay()];
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    assert.ok((h[wd] || []).some(([a, b]) => toMin(a) <= r.startMinutes && r.endMinutes <= toMin(b)), `${v.name} ${r.startMinutes}-${r.endMinutes} on ${wd}`);
  }
});

test('Without the V4 flag the planner is exactly as before', () => {
  const a = plan(Q, false), b = fx.plan(Q, {});
  assert.deepEqual(JSON.parse(JSON.stringify(a.days)), JSON.parse(JSON.stringify(b.days)));
  assert.ok(!a.v4Polished);
  // The live plan still has the old shape for this request (no lunch on some day), which V4 fixes.
  assert.ok(a.days.some((day) => !venueStops(day).some((s) => s.daypart === 'midday')));
});

const pageHtml = (extra) => page.renderTripPlannerV3Page({ esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), title: 'Okanagan Trip Planner', description: 'd', canonical: 'https://okanaganroam.com/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [{ slug: 'kelowna', label: 'Kelowna' }], regionImages: {}, preview: false, stays: 'preview', ...extra });

test('V4 page: the simple view only with d.v4; title, canonical and the SEO text are unchanged and stay in the HTML', () => {
  const v3 = pageHtml({}), v4 = pageHtml({ v4: 'preview' });
  assert.ok(!/class="t3 t3-v4"/.test(v3) && !/v4BookCardHtml/.test(v3), 'V3 page has no V4 code');
  assert.ok(/<main class="t3 t3-v4" id="tripV3">/.test(v4));
  for (const tag of ['<title>Okanagan Trip Planner</title>', '<link rel="canonical" href="https://okanaganroam.com/trip">']) { assert.ok(v3.includes(tag)); assert.ok(v4.includes(tag)); }
  const about = (h) => (h.match(/<section class="t3-wrap t3-about"[\s\S]*?<\/section>/) || [''])[0];
  assert.equal(about(v4), about(v3), 'the indexable intro, examples and FAQ are the same HTML');
  assert.ok(about(v4).length > 200);
  assert.ok(/\.t3-v4\.has-plan \.t3-hero, \.t3-v4\.has-plan #t3How, \.t3-v4\.has-plan \.t3-about, \.t3-v4\.has-plan \.t3-guide \{ display: none; \}/.test(v4), 'hidden only while a plan is shown');
  assert.ok(v4.includes("fetch('/api/trip/plan?stays=1&v=4'"), 'the page asks the planner for the V4 rules');
  assert.ok(v4.includes("+ (t3StateToQuery(s) ? '&' : '?') + 'v=4'"), 'a shared plan link keeps the preview');
});

test('V4 page: one verb per action, in English and French, and the commission line is kept', () => {
  const v4 = pageHtml({ v4: 'preview', viator: true });
  for (const w of ['Confirm plan', 'Book my trip', 'Share', 'Save', 'Confirmer le plan', 'Réserver mon voyage', 'Partager', 'Enregistrer', 'Add to bookings', 'Ajouter aux réservations']) assert.ok(v4.includes(w), w);
  const src = require('../trip-planner-v4-page.js').V4_CLIENT_SRC;
  assert.ok(!/Add whole trip|Add day to My Trip|Regenerate|data-t3-add-day|data-t3-regen|data-t3-add-all|Map this day/.test(src), 'no per-day or whole-trip add / regenerate buttons in the V4 view');
  assert.ok(v4.includes('T3_STAY_DISCLOSURE.fr : T3_STAY_DISCLOSURE.en'));
  assert.ok(v4.includes('navigator.share({ title: text.split'), 'phone share sheet');
});

test('V4 page: the page script parses', () => {
  for (const extra of [{ v4: 'preview' }, { v4: 'on', viator: true }]) {
    const html = pageHtml(extra);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length);
    for (const js of scripts) assert.doesNotThrow(() => new Function(js));
  }
});

test('V4 flag: /trip?v=4 previews it, TRIP_V4=on turns it on (v=3 keeps the current page), the API uses V4 rules only with ?v=4', () => {
  const srv = require('../server.js');
  const before = process.env.TRIP_V4;
  try {
    delete process.env.TRIP_V4;
    assert.equal(srv.isTripV4Enabled(), false);
    assert.equal(srv.tripV4EnabledFor({}), false);
    assert.equal(srv.tripV4EnabledFor({ v: '4' }), true);
    process.env.TRIP_V4 = 'on';
    assert.equal(srv.tripV4EnabledFor({}), true);
    assert.equal(srv.tripV4EnabledFor({ v: '3' }), false);
  } finally { if (before === undefined) delete process.env.TRIP_V4; else process.env.TRIP_V4 = before; }
  assert.equal(srv.parseTripPlanBody({ text: Q }).value.v4, undefined);
  assert.equal(srv.parseTripPlanBody({ text: Q }, { v4: true }).value.v4, true);
  assert.ok(srv.parseTripPlanBody({ text: Q, v4: true }).error, 'never from the request body');
});
