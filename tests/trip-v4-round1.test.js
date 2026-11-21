// Build My Trip V4, fresh-eyes round 1 (2026-11-21): five testers (wine couple, rainy-day toddlers, French couple, Big White
// ski weekend, "things to do this weekend"). V4 only (/trip with TRIP_V4, POST /api/trip/plan?v=4): the current page's
// plans are unchanged. Planner tests are PURE (fixtures); the page tests read the page's HTML and script.
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const tp = require('../trip-planner.js');
const fx = require('./fixtures/trip-v4-kelowna.js');
const page = require('../trip-planner-v3-page.js');
const v4page = require('../trip-planner-v4-page.js');

// An arcade / laser tag place and a bowling centre in Kelowna, open every day: what a couple's wine trip got.
const ARCADE = fx.add({ name: 'Planet Lazer Kelowna', region: 'kelowna', type: 'indoor', rating: 4.9, price: 2, cuisine: 'Arcade, VR & laser tag', desc: 'Laser tag, VR and an arcade.', hours: fx.open('10:00', '22:00') });
const BOWL = fx.add({ name: 'Kelowna Bowling Centre', region: 'kelowna', type: 'indoor', rating: 4.9, price: 2, cuisine: 'Bowling', desc: 'Ten-pin bowling lanes.', hours: fx.open('10:00', '22:00') });
const ids = (p) => new Set((p.days || []).flatMap((d) => d.stops).filter((s) => s.venue).map((s) => s.venue.id));
const venueStops = (day) => day.stops.filter((s) => s.venue && !s.event);

test('V4 off-theme: a wine trip (a focus) never picks an arcade, laser tag or bowling; without V4 the planner is unchanged', () => {
  const q = '3 days in Kelowna with my partner, wineries and great food';
  const v4 = fx.plan(q, { extra: { v4: true } });
  assert.ok(!ids(v4).has(ARCADE.id) && !ids(v4).has(BOWL.id), [...ids(v4)].join(','));
  assert.equal(typeof tp.v4OffTheme, 'function');
  const ctx = { v4: true, kids: false, types: new Set(['winery']), activities: new Set(), foodTerms: [], queryText: 'wineries' };
  assert.equal(tp.v4OffTheme(ARCADE, ctx), true, 'the indoor kind "Arcade, VR & laser tag" is read, not only the name');
  assert.equal(tp.v4OffTheme(ARCADE, { ...ctx, kids: true }), false, 'a family trip keeps it');
  assert.equal(tp.v4OffTheme(ARCADE, { ...ctx, types: new Set(), queryText: 'things to do' }), false, 'no focus: kept');
  assert.equal(tp.v4OffTheme(ARCADE, { ...ctx, queryText: 'wineries and laser tag' }), false, 'named: kept');
  assert.equal(tp.v4OffTheme(ARCADE, { ...ctx, v4: false }), false, 'the current page: unchanged');
});

test('V4 relaxed pace: no day has more than four stops, and the free time stays free', () => {
  const p = fx.plan('3 days in Kelowna with my partner, wineries, a hike and great food, relaxed pace', { extra: { v4: true } });
  for (const day of p.days) assert.ok(venueStops(day).length <= 4, `day ${day.day}: ${day.stops.map((s) => s.daypart + ':' + (s.venue ? s.venue.name : '-')).join(', ')}`);
});

test('V4 server: "nothing too rushed" is a relaxed pace, and "things to do this weekend" is a 2-day plan, not a list', () => {
  const src = require('node:fs').readFileSync(require.resolve('../server.js'), 'utf8');
  const m = /const V4_NOT_RUSHED_RE = (\/.*\/i);/.exec(src);
  assert.ok(m, 'V4_NOT_RUSHED_RE');
  const re = eval(m[1]); // eslint-disable-line no-eval
  for (const t of ['3 days, nothing too rushed', 'no rush please', 'we want to take our time', 'deux jours sans se presser', 'pas trop pressés']) assert.ok(re.test(t), t);
  for (const t of ['a rush of adrenaline', '3 days in Kelowna', 'gold rush history']) assert.ok(!re.test(t), t);
  assert.ok(/const V4_WHEN_DAYS = \{ 'this-weekend': 2, 'next-weekend': 2, weekend: 2, today: 1, tomorrow: 1 \};/.test(src));
  assert.ok(/plan\.kind === 'discover' && !focus && V4_WHEN_DAYS\[preset\]/.test(src), 'only a list with no town or kind of place');
  assert.ok(/function runTripPlan\(args, now = new Date\(\)\) \{\n  if \(!args \|\| !args\.v4\) return runTripPlanBase\(args, now\);/.test(src), 'the current page goes straight to the planner as before');
});

const pageHtml = (extra) => page.renderTripPlannerV3Page({ esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), title: 'Okanagan Trip Planner', description: 'd', canonical: 'https://okanaganroam.com/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [{ slug: 'kelowna', label: 'Kelowna' }], regionImages: {}, preview: false, stays: 'on', ...extra });

test('V4 page: EN / FR opens the twin with the same plan; the address bar keeps dates, guests and Confirm', () => {
  const v4 = pageHtml({ v4: 'on' });
  const v3 = pageHtml({});
  assert.ok(v4.includes("setAttribute('data-twin-path', (location.pathname + '/').indexOf('/fr/') === 0 ? '/trip' : '/fr/trip')"));
  assert.ok(v4.includes('+ v4UrlExtra(t3StateToQuery(s))'), 'syncUrl adds the trip inputs');
  assert.ok(v4.includes('v4RestoreInputs(location.search);'), 'a reload or Back restores them before the plan is asked for');
  assert.ok(!/v4UrlExtra|v4RestoreInputs|data-twin-path/.test(v3), 'the current page is unchanged');
  for (const k of ["'arrive='", "'leave='", "'adults='", "'kids='", "'dog=1'", "'ok=1'"]) assert.ok(v4page.V4_CLIENT_SRC.includes(k), k);
});

test('V4 page: Share lists every stop with its time (no "+2 more"), Save asks before mixing trips, the sheet calls, no "Activities Free"', () => {
  const src = v4page.V4_CLIENT_SRC;
  assert.ok(!/names\.slice\(0, 3\)/.test(src), 'no cut list');
  assert.ok(/querySelectorAll\('\.v4-stop:not\(\.v4-gone\):not\(\.v4-free\)'\)/.test(src) && /\.v4-time/.test(src), 'each kept stop with its time');
  assert.ok(src.includes("document.execCommand('copy')"), 'copy fallback before showing the link');
  assert.ok(/data-v4-replace="replace"/.test(src) && /data-v4-replace="add"/.test(src), 'Replace or add');
  assert.ok(/'tel:\+1'/.test(src) && /call: 'Call'/.test(src) && /call: 'Appeler'/.test(src), 'Call link, EN + FR');
  assert.ok(/x\.low === 0 && x\.high === 0/.test(src) && /notPriced: 'Not priced yet: \{names\}'/.test(src) && /notPriced: 'Prix pas encore indiqué : \{names\}'/.test(src));
  assert.ok(/\.t3-v4 \.v4-head \{ position: relative; z-index: 0; \}/.test(v4page.V4_STYLES), 'the plan header never covers the site menu');
  // The page script still parses with all of this in it.
  const html = pageHtml({ v4: 'on' });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.includes('v4Render'));
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0])); // eslint-disable-line no-new-func
});
