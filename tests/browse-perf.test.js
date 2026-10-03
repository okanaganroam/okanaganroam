// /browse interaction performance (2026-10-03): behaviour-identical changes to
// public/scripts/app.js, each checked against the code it replaced.
//
// PURE tests: the real functions are sliced out of app.js and run in a vm
// context next to a verbatim copy of the previous implementation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
const slice = (start, end) => {
  const a = APP_JS.indexOf(start), b = APP_JS.indexOf(end, a);
  assert.ok(a !== -1 && b !== -1, `app.js still contains ${start} ... ${end}`);
  return APP_JS.slice(a, b);
};

// ---- F4a: one Intl.DateTimeFormat for computeOpenStatus ----------------------
// computeOpenStatus() ran once per card and built a new formatter each time
// (about a quarter of the /browse initial render). The formatter's options
// never change, so it is now created once; every result must be unchanged.

const OPEN_STATUS_JS = slice('var DAY_ORDER = ', 'var CARD_REGION_LABEL = ');

// The previous computeOpenStatus, verbatim (it shares DAY_ORDER and
// checkHoursWindow with the new one).
const PREVIOUS_COMPUTE_OPEN_STATUS = `function previousComputeOpenStatus(hoursJson, testDate){
  if (!hoursJson) return null;
  var hours;
  try { hours = JSON.parse(hoursJson); } catch (e) { return null; }

  var now = testDate || new Date();
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);

  var map = {};
  parts.forEach(function(p){ map[p.type] = p.value; });

  var dayMap = { 'Mon':'mon','Tue':'tue','Wed':'wed','Thu':'thu','Fri':'fri','Sat':'sat','Sun':'sun' };
  var dayKey = dayMap[map.weekday];
  var yesterdayKey = DAY_ORDER[(DAY_ORDER.indexOf(dayKey) + 6) % 7];
  var hourNum = parseInt(map.hour) === 24 ? 0 : parseInt(map.hour);
  var currentMinutes = hourNum * 60 + parseInt(map.minute);

  var yesterdayWindows = hours[yesterdayKey];
  if (yesterdayWindows) {
    for (var j = 0; j < yesterdayWindows.length; j++) {
      var resultY = checkHoursWindow(yesterdayWindows[j][0], yesterdayWindows[j][1], currentMinutes, true);
      if (resultY) return resultY;
    }
  }

  var todayWindows = hours[dayKey];
  if (todayWindows) {
    for (var i = 0; i < todayWindows.length; i++) {
      var result = checkHoursWindow(todayWindows[i][0], todayWindows[i][1], currentMinutes, false);
      if (result) return result;
    }
  }
  return 'closed';
}`;

function openStatusContext() {
  const counter = { constructed: 0 };
  // Intl with a counting DateTimeFormat; everything else is the real Intl.
  const CountingDTF = function (...args) { counter.constructed++; return new Intl.DateTimeFormat(...args); };
  const ctx = vm.createContext({ Intl: Object.assign(Object.create(Intl), { DateTimeFormat: CountingDTF }), Date, JSON, parseInt });
  vm.runInContext(`${OPEN_STATUS_JS}\n${PREVIOUS_COMPUTE_OPEN_STATUS}`, ctx);
  return { ctx, counter };
}

const week = (spec) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, spec(d)])));
const HOURS = [
  week(() => [['08:00', '21:00']]),
  week(() => [['9:00', '17:00']]),
  week((d) => (d === 'mon' ? [] : [['11:30', '14:00'], ['17:00', '22:00']])),
  week(() => [['18:00', '02:00']]),
  week((d) => (d === 'fri' || d === 'sat' ? [['20:00', '00:00']] : [['11:00', '23:00']])),
  week(() => [['00:00', '24:00']]),
  week((d) => (d === 'sun' ? [['10:00', '01:30']] : [['06:00', '10:00'], ['16:00', '03:00']])),
  JSON.stringify({ tue: [['12:00', '13:00']] }),
  JSON.stringify({}),
  week(() => []),
];
// Every 7 minutes over three windows: both 2026 daylight-saving changes in
// Vancouver (Mar 8 and Nov 1) and an ordinary week.
const DATES = [];
for (const [from, days] of [['2026-03-06T00:00:00Z', 4], ['2026-10-30T00:00:00Z', 4], ['2026-06-15T00:00:00Z', 7]]) {
  for (let t = Date.parse(from), end = t + days * 864e5; t < end; t += 7 * 6e4) DATES.push(new Date(t));
}

test('F4a: computeOpenStatus gives exactly the previous result for every hours shape and time (incl. both 2026 DST changes)', () => {
  const { ctx } = openStatusContext();
  let compared = 0;
  const seen = new Set();
  for (const hours of HOURS) {
    for (const date of DATES) {
      const now = ctx.computeOpenStatus(hours, date);
      const before = ctx.previousComputeOpenStatus(hours, date);
      assert.equal(now, before, `${hours} @ ${date.toISOString()}`);
      seen.add(now);
      compared++;
    }
  }
  assert.ok(compared > 30000, `compared ${compared}`);
  assert.deepEqual([...seen].sort(), ['closed', 'closing-soon', 'open'], 'every status is exercised');
});

test('F4a: no hours, invalid hours and "now" behave as before', () => {
  const { ctx } = openStatusContext();
  for (const bad of [null, undefined, '', 'not json', '{"mon":']) {
    assert.equal(ctx.computeOpenStatus(bad), ctx.previousComputeOpenStatus(bad), String(bad));
  }
  // Without a test date both read the clock; same minute, same answer.
  for (const hours of HOURS) assert.equal(ctx.computeOpenStatus(hours), ctx.previousComputeOpenStatus(hours));
});

test('F4a: the formatter is created once, on first use, and reused for every card', () => {
  const { ctx, counter } = openStatusContext();
  assert.equal(counter.constructed, 0, 'nothing is created when app.js loads');
  assert.equal(ctx.computeOpenStatus(null), null);
  assert.equal(counter.constructed, 0, 'no formatter for a card without hours');
  for (let i = 0; i < 1411; i++) ctx.computeOpenStatus(HOURS[i % HOURS.length], DATES[i]);
  assert.equal(counter.constructed, 1, 'one formatter for 1,411 cards');
  ctx.previousComputeOpenStatus(HOURS[0], DATES[0]);
  assert.equal(counter.constructed, 2, '(the previous code built one per call)');
});
