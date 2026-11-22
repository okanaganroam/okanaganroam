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
  const bikePark = { name: 'Whistler Mountain Bike Park', type: 'sport', cuisine: 'Lift-access bike park', activities: ['cycling'] };
  assert.equal(tp.v4OffTheme(bikePark, { ...ctx, types: new Set(), activities: new Set(['cycling']), queryText: 'mountain biking in whistler' }), false, 'round 3: the bike park on a biking trip');
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
  assert.ok(/\['discover', 'recommendations'\]\.includes\(plan\.kind\) && \(want \|\| vague\) && !\(focus && listAsked\)/.test(src), 'a list only when a list is asked for');
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

// ---- Round 2 (2026-11-21): dog owners, older parents, date night, budget backpacker, Whistler après ----
test('V4 round 2 server: plain words, one stop per part of the day, the typed length wins, the phone menu reaches EN / FR', () => {
  const src = require('node:fs').readFileSync(require.resolve('../server.js'), 'utf8');
  const body = /function v4PlainText\(text\) \{[\s\S]*?\n\}/.exec(src)[0];
  const v4PlainText = new Function(`${body}; return v4PlainText;`)(); // eslint-disable-line no-new-func
  assert.equal(v4PlainText('a day in Vernon, easy flat walks and a nice lunch'), 'a day in Vernon, easy walks and a nice lunch');
  assert.equal(v4PlainText('a gentle day in Vernon'), 'a relaxed day in Vernon');
  assert.equal(v4PlainText('cocktails, a great dinner, then dessert'), 'cocktails, a great dinner, then a dessert cafe');
  assert.equal(v4PlainText('then a dessert spot'), 'then a dessert spot', 'already a place');
  assert.equal(v4PlainText('3 days in Kelowna, wineries'), '3 days in Kelowna, wineries');
  assert.equal(v4PlainText('sunset drinks with a lake view, romantic dinner'), 'cocktails with a lake view, romantic dinner');
  assert.equal(v4PlainText('wineries and drinks'), 'wineries and drinks', 'wine named: left as typed');
  const tidyBody = /function v4TidyDays\(plan\) \{[\s\S]*?\n\}/.exec(src)[0];
  const v4TidyDays = new Function(`${tidyBody}; return v4TidyDays;`)(); // eslint-disable-line no-new-func
  const st = (id, part, type) => ({ daypart: part, venue: { id, type } });
  const plan = { kind: 'multi_day', days: [{ day: 1, stops: [st(1, 'morning', 'restaurant'), st(2, 'midday', 'restaurant'), st(3, 'afternoon', 'restaurant'), st(4, 'midday', 'outdoor'), st(5, 'late', 'outdoor'), st(6, 'evening', 'restaurant')] }], schedule: [1, 2, 3, 4, 5, 6].map((id) => ({ day: 1, venueId: id })) };
  v4TidyDays(plan);
  assert.deepEqual(plan.days[0].stops.map((s) => s.venue.id), [1, 2, 5, 6], 'no repeated part of the day, no third sit-down meal in the afternoon');
  assert.deepEqual(plan.schedule.map((r) => r.venueId), [1, 2, 5, 6]);
  assert.ok(/const typedDays = !!\(args\.v4 && plan && plan\.intent && Number\.isInteger\(plan\.intent\.days\)/.test(src), '"3 days" with 3 nights of dates stays 3 days');
  assert.ok(src.includes("(links.contains(t) || (burger && burger.contains(t)) || t.id === 'langToggle')"), 'the phone menu no longer swallows its own EN / FR press');
});

test('V4 round 2 page: Remove on an evening out, dinner in Book, dog walks say dogs allowed, no Book promise with nothing to book', () => {
  const src = v4page.V4_CLIENT_SRC;
  assert.ok(/data-v4-remove-id="/.test(src) && /data-v4-undo-id="/.test(src), 'Remove and Undo with no day slot');
  assert.ok(/\(p\.outing && p\.outing\.stops\) \|\| \(p\.itinerary && p\.itinerary\.stops\)/.test(src) && /s\.venue\.type !== 'restaurant'/.test(src), 'an evening out\'s restaurant is in the sheet');
  assert.ok(/dogsOk: 'Dogs allowed'/.test(src) && /dogsOk: 'Chiens admis'/.test(src));
  assert.ok(/tipNoBook: 'Plan confirmed\. Share it with your group or save it\.'/.test(src) && /tipNoBook: 'Plan confirmé\./.test(src));
  assert.ok(/skiLeg/.test(src) && /near < 2\.5/.test(src), 'no drive line inside a ski day or a village');
  assert.ok(/addState\(\)\.state === 'added'/.test(src), 'Saved stays Saved after a reload');
});

// ---- Round 3 (2026-11-21): multi-town, Whistler biking, wine weekend for 4, French family, anniversary evening ----
test('V4 round 3: the plan on screen survives a reload, Back and EN / FR; no outdoor stop after dark; a weekend keeps Sunday', () => {
  const src = v4page.V4_CLIENT_SRC;
  assert.ok(/sessionStorage\.setItem\('t3v4plan'/.test(src) && /function v4FromCache\(\)/.test(src));
  assert.ok(/!\/\^\(\?:ok\|v\)=\/\.test\(x\)/.test(src), 'Confirm and the preview flag are not part of the key');
  const html = pageHtml({ v4: 'on' });
  assert.ok(html.includes('if (!v4FromCache()) request(replay,'), 'a cached plan is shown instead of asking again');
  assert.ok(html.includes('v4CacheSave();'), 'every change is cached');
  assert.ok(html.includes('&& l > o.arrive) o.leave = l;'), 'Arrive = Leave is one day, not an error');
  assert.ok(!pageHtml({}).includes('v4FromCache'), 'the current page is unchanged');
  const ssrc = require('node:fs').readFileSync(require.resolve('../server.js'), 'utf8');
  const body = /function v4DropAfterDark\(plan\) \{[\s\S]*?\n\}/.exec(ssrc)[0];
  const drop = new Function(`${body}; return v4DropAfterDark;`)(); // eslint-disable-line no-new-func
  const p = { kind: 'itinerary', itinerary: { stops: [{ venue: { id: 1, name: 'HUMO' } }, { venue: { id: 2, name: 'Mission Ridge Park Loop' } }, { venue: { id: 3, name: 'Crepe Cafe' } }] },
    schedule: [{ venueId: 1, startMinutes: 1080 }, { venueId: 2, startMinutes: 1185, daylight: { status: 'conflict', sunsetMinutes: 963 } }, { venueId: 3, startMinutes: 1260 }], warnings: ['Mission Ridge Park Loop: Estimated daylight ...'], scheduleWarnings: [] };
  drop(p);
  assert.deepEqual(p.itinerary.stops.map((s) => s.venue.id), [1, 3]);
  assert.deepEqual(p.warnings, []);
  assert.ok(/\(\?:days\?\|jours\?\|journ\[ée\]es\?\)/.test(ssrc), '"3 days" wins over the dates; "a weekend" does not');
});

// ---- Round 4 (2026-11-21): wine couple, rainy toddlers, Big White group, "this weekend", dog owner ----
test('V4 round 4: a day is a plan, the guessed town is said, no timing boilerplate, an edit starts unconfirmed', () => {
  const ssrc = require('node:fs').readFileSync(require.resolve('../server.js'), 'utf8');
  assert.ok(/const dayAsked = \/\\b\(\?:rainy\|rain\|wet\)/.test(ssrc), '"a rainy day" is a day');
  const src = v4page.V4_CLIENT_SRC;
  assert.ok(/picked: 'We picked \{town\}\. Name a town in your request to change it\.'/.test(src) && /picked: 'Nous avons choisi \{town\}/.test(src));
  assert.ok(/x\.kind !== 'timing' && x\.kind !== 'event_timing'/.test(src), 'Before you go keeps only what is particular');
  assert.ok(/v4\.confirmed = false; v4\.ask = false; v4\.gone = \{\}; v4\.saved = false;/.test(src));
  assert.ok(/\.v4-confirmed \.v4-gone \{ display: none; \}/.test(v4page.V4_STYLES) || /\.t3-v4 \.v4-confirmed \.v4-gone/.test(v4page.V4_STYLES));
  assert.ok(!/about ' \+ Math\.round\(s\.freeTime\.minutes/.test(src), 'no free-time hours that go stale');
  const html = pageHtml({ v4: 'on' });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((x) => x.includes('v4Render'));
  assert.doesNotThrow(() => new Function(scripts[0])); // eslint-disable-line no-new-func
});
