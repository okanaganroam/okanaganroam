'use strict';
// Roam Now's Happy hour filter in the browser (2026-11-14).
// 1. happyHourState is copied into the map page on its own. Since café test 2 (#835) it calls parseOpenSeason, which the
//    page did not have, so every happy hour threw in the browser, the error was swallowed, and /map?show=happy-hour
//    (the homepage line) showed "Happy Hour Now · 0" all day. This runs the page's real hours code in a sandbox.
// 2. Opened from the homepage line with none on yet, the list shows the places that start later today (or tomorrow,
//    late at night), the way the homepage line words it. The chip tapped on the map itself still means on now only.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const app = require('../server.js');
const hours = require('../hours.js');

// The page's inline script, from its first line up to its config: the helpers the map script runs on.
function pageHelpers(page) {
  const start = page.indexOf('(function(){\n  var okanaganClockFormatter');
  assert.ok(start > 0, 'the map script starts with the clock');
  const end = page.indexOf('  var CONF = ', start);
  assert.ok(end > start);
  const ctx = vm.createContext({ Intl, Date, JSON, Math, Number, String, Array, Object, RegExp, isNaN, parseInt });
  vm.runInContext(page.slice(start + '(function(){'.length, end) + '\nthis.happyHourState = happyHourState; this.expandFoodDrinkHours = expandFoodDrinkHours;', ctx);
  return ctx;
}

test('the map page carries everything happyHourState needs (parseOpenSeason)', () => {
  assert.match(hours.HOURS_CLIENT_SRC, /function parseOpenSeason\(/);
  assert.match(hours.HOURS_CLIENT_SRC, /var OPEN_SEASON_LAST = \[31,29,31,30,31,30,31,31,30,31,30,31\];/);
  for (const lang of ['en', 'fr']) {
    const page = app.renderPlacesMapPage(null, new Date(), lang === 'fr' ? { lang: 'fr' } : {});
    const w = pageHelpers(page);
    const hh = w.expandFoodDrinkHours('15:00-18:00');
    const place = { placeHours: w.expandFoodDrinkHours('11:00-23:00') };
    const fri = (m) => ({ weekday: 'fri', minutes: m, date: '2026-11-13' });
    assert.equal(w.happyHourState(hh, fri(16 * 60 + 30), false, null, place).state, 'now', `${lang}: on now at 4:30 PM`);
    assert.equal(w.happyHourState(hh, fri(11 * 60), false, null, place).state, 'later', `${lang}: later at 11 AM`);
    const late = w.happyHourState(hh, fri(23 * 60 + 30), false, null, place);
    assert.equal(late.state, 'next');
    assert.equal(late.from.weekday, 'sat');
    // An exact-days season (the parseOpenSeason path): open Apr 25 – Oct 12, so none in November.
    assert.equal(w.happyHourState(hh, fri(16 * 60 + 30), false, null, { ...place, openMonths: '04-25:10-12' }), null, `${lang}: out of season`);
    assert.equal(w.happyHourState(hh, { weekday: 'fri', minutes: 16 * 60 + 30, date: '2026-07-10' }, false, null, { ...place, openMonths: '04-25:10-12' }).state, 'now');
  }
});

test('opened from the homepage line, Happy hour widens to later today, then tomorrow; the chip alone stays on now', () => {
  const page = app.renderPlacesMapPage();
  assert.ok(page.includes("var happyEntry = new URLSearchParams(location.search).get('show') === 'happy-hour';"));
  assert.ok(page.includes("hhEntryMode = hhAnyNow ? 'now' : places.some(function(p){ return p.hhs; }) ? 'later' : places.some(function(p){ return p.hht != null; }) ? 'tomorrow' : 'now';"));
  assert.ok(page.includes("function hhEntryWide(){ return happyEntry && feats.happy ? hhEntryMode : 'now'; }"));
  assert.ok(page.includes("k === 'happy' ? !(p.hhs && p.hhs.now) && !p.hhe :"), 'on now, or widened for the homepage entry');
  assert.ok(page.includes("places.forEach(function(p){ p.hhe = !!(happyEntry && (hhEntryMode === 'later' ? p.hhs : hhEntryMode === 'tomorrow' && p.hht != null)); });"));
  // Tomorrow's start is kept only for a next opening tomorrow (not next week).
  assert.ok(page.includes("if (h && h.state === 'next' && !h.nextWeek && h.from && h.from.weekday === wds[(wds.indexOf(clock.weekday) + 1) % 7] && (h.daysAhead == null || h.daysAhead === 1)) p.hht = h.from.minutes;"));
  assert.ok(page.includes("'Happy Hour Later Today'") && page.includes("'Happy Hour Tomorrow'"));
  assert.ok(page.includes("No more happy hours today. These places have one tomorrow."));
  const fr = app.renderPlacesMapPage(null, new Date(), { lang: 'fr' });
  assert.ok(fr.includes("'5 à 7 plus tard aujourd’hui'") && fr.includes("'5 à 7 demain'"));
  assert.ok(fr.includes('Plus de 5 à 7 aujourd’hui. Ces endroits en ont un demain.'));
  assert.equal(app.HAPPY_HOUR_MAP_HREF, '/map?show=happy-hour', 'the URL is unchanged');
});
