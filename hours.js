'use strict';

// ---------- Canonical opening hours (2026-09-26, Open Now Phase 1) ----------
//
// One place that reads venues.hours and answers "is it open at this moment?".
// Used by the Food & Drink Open Now status and, since Stage 2 (2026-09-29),
// by the venue page hours list, the OpeningHoursSpecification builder in
// server.js and Build My Trip (trip-planner.js parseVenueHours). The /browse
// cards (public/scripts/app.js, a frozen surface) still keep their own logic.
//
// Stored shape (venues.hours, JSON text):
//   {"mon": [["11:00","14:00"],["17:00","22:00"]], "tue": null, "wed": [], ...}
//
// Day status -- the three answers are never collapsed into one another:
//   open     -- one or more valid [open, close] periods
//   closed   -- the day is listed as null or [] (the venue page's "Closed")
//   unknown  -- the day key is absent, its value is not a list, or any of its
//               periods is malformed. Unknown is NEVER treated as closed.
// A venue with no hours at all (NULL/empty column, bad JSON, not an object)
// is unknown on every day, with known === false.
//
// Times are "H:MM" or "HH:MM". An opening time must be a real clock time
// (00:00-23:59). A closing time is read as follows, all in minutes from the
// start of the listed day (a close after midnight is > 1440):
//   "00:00" or "24:00"    -> midnight at the end of the day (1440)
//   "23:59"               -> also the end of the day (1440), so a venue listed
//                            00:00-23:59 is not reported closed for a minute
//   earlier than the open -> the next morning (18:00-02:00 -> 1080-1560)
//   "25:00", "26:30" ...  -> the next morning as written (21 venues store it)
// A period longer than 24 hours is malformed. "00:00"-"00:00" and
// "00:00"-"24:00" are both a full 24-hour day.
//
// Time: statusAt() takes the Okanagan wall clock from server.js's existing
// okanaganClock() -- { weekday: 'thu', minutes: 1266 } in America/Vancouver
// -- and never reads a clock or a timezone itself, so daylight saving is
// handled once, there. At that moment it checks the PREVIOUS day's periods
// that run past midnight and then the current day's periods; there is no
// "before 05:00 belongs to last night" cut-off, so a 03:30 opening is seen.
// Opening minutes are inclusive and closing minutes exclusive: 09:00-17:00 is
// open at 09:00 and closed at 17:00.

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_MINUTES = 24 * 60;

function hoursTimeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 47 || mi > 59) return null;
  return h * 60 + mi;
}

function parseHoursPeriod(period) {
  if (!Array.isArray(period) || period.length !== 2) return null;
  const open = hoursTimeToMinutes(period[0]);
  let close = hoursTimeToMinutes(period[1]);
  if (open === null || close === null || open >= DAY_MINUTES) return null;
  if (close === 0 || close === DAY_MINUTES - 1) close = DAY_MINUTES;
  else if (close <= open) close += DAY_MINUTES;
  if (close - open > DAY_MINUTES) return null;
  return [open, close];
}

function unknownHours() {
  const days = {};
  for (const d of WEEKDAYS) days[d] = { status: 'unknown' };
  return { known: false, days };
}

// raw: the stored JSON text (or an already-parsed object).
// -> { known, days: { mon: { status: 'open', ranges: [[from, to], ...] }
//                          | { status: 'closed' } | { status: 'unknown' }, ... } }
function parseHours(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return unknownHours();
    try { obj = JSON.parse(raw); } catch (e) { return unknownHours(); }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return unknownHours();
  const days = {};
  let known = false;
  for (const d of WEEKDAYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, d)) { days[d] = { status: 'unknown' }; continue; }
    const value = obj[d];
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      days[d] = { status: 'closed' };
      known = true;
      continue;
    }
    if (!Array.isArray(value)) { days[d] = { status: 'unknown' }; continue; }
    const ranges = [];
    for (const period of value) {
      const range = parseHoursPeriod(period);
      if (!range) { ranges.length = 0; break; }
      ranges.push(range);
    }
    if (ranges.length) {
      ranges.sort((a, b) => a[0] - b[0]);
      days[d] = { status: 'open', ranges };
      known = true;
    } else {
      days[d] = { status: 'unknown' };
    }
  }
  const out = { known, days };
  // Seasonal hours and special closures (2026-10-18): an owner can add a second week of hours for a date range
  // ("_seasons", month-day from/to, every year, may run over New Year) and dated closures ("_closures"). They ride
  // along in the same JSON (server.js hoursWithExtras); a plain week parses exactly as before. statusAt() applies
  // them when the clock carries a date.
  if (Array.isArray(obj._seasons)) {
    const seasons = obj._seasons.filter((x) => x && /^\d{2}-\d{2}$/.test(x.from) && /^\d{2}-\d{2}$/.test(x.to) && x.hours && typeof x.hours === 'object')
      .map((x) => ({ from: x.from, to: x.to, label: typeof x.label === 'string' ? x.label : '', days: parseHours(x.hours).days }));
    if (seasons.length) out.seasons = seasons;
  }
  if (Array.isArray(obj._closures)) {
    const closures = obj._closures.filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.from) && /^\d{4}-\d{2}-\d{2}$/.test(x.to || x.from))
      .map((x) => ({ from: x.from, to: x.to || x.from, note: typeof x.note === 'string' ? x.note : '' }));
    if (closures.length) out.closures = closures;
  }
  return out;
}

// ---- Dates (2026-10-18): which hours apply on a calendar day ----
// 'YYYY-MM-DD' -> 'mon'..'sun', and the date `offset` days later. UTC arithmetic on the calendar date only, so no
// timezone is involved (the date itself comes from okanaganClock()).
function dateWeekday(date) {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return WEEKDAYS[(new Date(t).getUTCDay() + 6) % 7];
}
function shiftDate(date, offset) {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + offset * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
// A closure of three days or more (round 8, 2026-10-19): a temporary closure rather than a holiday.
function isTemporaryClosure(c) {
  if (!c || !c.from || !c.to || c.to <= c.from) return false;
  // Written for the browser copy too (HOURS_CLIENT_SRC).
  var from = Date.UTC(Number(c.from.slice(0, 4)), Number(c.from.slice(5, 7)) - 1, Number(c.from.slice(8, 10)));
  var to = Date.UTC(Number(c.to.slice(0, 4)), Number(c.to.slice(5, 7)) - 1, Number(c.to.slice(8, 10)));
  return (to - from) / 86400000 >= 2;
}
function closureOn(parsed, date) {
  return (parsed && parsed.closures || []).find((c) => date >= c.from && date <= c.to) || null;
}
// The seasonal set covering a date: Nov 1 - Apr 30 runs over New Year.
function seasonOn(parsed, date) {
  const md = date.slice(5);
  return (parsed && parsed.seasons || []).find((s) => (s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to)) || null;
}
// One calendar day: a closure wins, then a seasonal set, then the usual week.
function dayOnDate(parsed, date) {
  if (!parsed || !parsed.days) return { status: 'unknown' };
  const wd = dateWeekday(date);
  const c = closureOn(parsed, date);
  if (c) return { status: 'closed', closure: c };
  const s = seasonOn(parsed, date);
  return s ? s.days[wd] : parsed.days[wd];
}
// The week as it really runs from `clock.date`: today and the next five days by date, and yesterday (for a night
// that runs past midnight) in the seventh weekday slot. Without a date, or with nothing extra, it is `parsed`.
function hoursForClock(parsed, clock) {
  if (!parsed || !(parsed.seasons || parsed.closures) || !clock || !/^\d{4}-\d{2}-\d{2}$/.test(clock.date || '')) return parsed;
  const days = {};
  for (let off = -1; off <= 5; off++) {
    const d = shiftDate(clock.date, off);
    days[dateWeekday(d)] = dayOnDate(parsed, d);
  }
  return { known: parsed.known, days };
}

function isOpenAllDay(day) {
  return !!day && day.status === 'open' && day.ranges.some(([a, b]) => a === 0 && b >= DAY_MINUTES);
}

function shiftWeekday(weekday, offset) {
  return WEEKDAYS[(WEEKDAYS.indexOf(weekday) + offset + 7 * 8) % 7];
}

function validClock(clock) {
  return !!clock && WEEKDAYS.includes(clock.weekday) &&
    Number.isInteger(clock.minutes) && clock.minutes >= 0 && clock.minutes < DAY_MINUTES;
}

// When an open stretch that ends at `end` minutes after the start of
// `weekday` really ends: a period closing exactly at midnight that runs into
// a 24-hour day (or a next-day period starting at 00:00) keeps going.
// Returns { weekday, minutes } on the day it closes, or null when the venue is
// listed open around the clock all week.
function resolveClose(parsed, weekday, end) {
  let day = weekday;
  let close = end;
  for (let hop = 0; hop < 8; hop++) {
    if (close < DAY_MINUTES) return { weekday: day, minutes: close };
    day = shiftWeekday(day, 1);
    close -= DAY_MINUTES;
    if (close > 0) continue;
    const next = parsed.days[day];
    const cont = next && next.status === 'open' ? next.ranges.find(([a]) => a === 0) : null;
    if (!cont) return { weekday: day, minutes: 0 };
    close = cont[1];
  }
  return null;
}

// The next listed opening after `now` on `weekday`, looking up to a week ahead
// (a venue open only on this weekday opens again in seven days).
// Stops (null) at the first unknown day: no claim is made past missing data.
function nextOpening(parsed, weekday, now) {
  for (let offset = 0; offset <= 7; offset++) {
    const d = shiftWeekday(weekday, offset);
    const day = parsed.days[d];
    if (day.status === 'unknown') return null;
    if (day.status !== 'open') continue;
    const start = day.ranges.map(([a]) => a).find((a) => offset > 0 || a > now);
    if (start !== undefined) return { weekday: d, minutes: start };
  }
  return null;
}

// parsed: parseHours() output; clock: okanaganClock() output.
// -> {
//      state: 'open' | 'closed' | 'unknown',
//      closesAt: { weekday, minutes } | null   -- open only; null = open around the clock all week
//      opensAt:  { weekday, minutes } | null   -- closed only; null = no listed opening before unknown/none
//      closedToday: boolean                     -- today's listing is null/[] (and nothing from last night is still running)
//      allDay: boolean                          -- today is listed as a 24-hour day
//    }
// closesAt/opensAt minutes are clock minutes (0-1439) on that weekday.
function statusAt(parsed, clock) {
  const base = { state: 'unknown', closesAt: null, opensAt: null, closedToday: false, allDay: false };
  if (!parsed || !parsed.days || !validClock(clock)) return base;
  parsed = hoursForClock(parsed, clock);
  const today = clock.weekday;
  const now = clock.minutes;
  const yesterdayKey = shiftWeekday(today, -1);
  const yesterday = parsed.days[yesterdayKey];
  const current = parsed.days[today];
  const close = (weekday, end) => resolveClose(parsed, weekday, end);

  if (current && current.status === 'open') {
    for (const [a, b] of current.ranges) {
      if (now >= a && now < b) return { ...base, state: 'open', closesAt: close(today, b), allDay: isOpenAllDay(current) };
    }
  }
  if (yesterday && yesterday.status === 'open') {
    for (const [a, b] of yesterday.ranges) {
      if (b > DAY_MINUTES && now + DAY_MINUTES >= a && now + DAY_MINUTES < b) {
        return { ...base, state: 'open', closesAt: close(yesterdayKey, b), allDay: isOpenAllDay(current) };
      }
    }
  }
  if (!current || current.status === 'unknown') return base;
  const out = {
    ...base,
    state: 'closed',
    opensAt: nextOpening(parsed, today, now),
    closedToday: current.status === 'closed',
  };
  // A special closure today names itself: "Closed today (Thanksgiving)", or "(holiday)" without a note.
  // Round 8 (2026-10-19): a closure of three days or more without a note is "(temporary closure)", not a holiday
  // (Christmas and Boxing Day stay a holiday).
  if (current.closure) out.closedNote = current.closure.note || (isTemporaryClosure(current.closure) ? 'temporary closure' : 'holiday');
  return out;
}

// ---- Wording (Open Now, 2026-09-26) ----
// Clock minutes (0-1439) as a 12-hour time: 540 -> "9 AM", 1290 -> "9:30 PM",
// 0 -> "12 AM", 720 -> "12 PM".
function formatClockMinutes(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + (h < 12 ? ' AM' : ' PM');
}

// The one visitor-facing line for a statusAt() result at `clock`:
//   { state: 'open' | 'closed' | 'unknown', text }
// Only states the listing actually proves: an unknown day says so, it is
// never worded as closed.
function hoursStatusLabel(status, clock) {
  const DAY_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const when = (at) => {
    if (at.weekday === clock.weekday) return formatClockMinutes(at.minutes);
    if (at.weekday === shiftWeekday(clock.weekday, 1)) return 'tomorrow ' + formatClockMinutes(at.minutes);
    return DAY_NAMES[at.weekday] + ' ' + formatClockMinutes(at.minutes);
  };
  if (!status || status.state === 'unknown') return { state: 'unknown', text: 'Hours not listed for today' };
  if (status.state === 'open') {
    if (!status.closesAt) return { state: 'open', text: 'Open 24 hours' };
    // A close in the small hours of the next day reads as a plain time ("Closes 2 AM").
    const next = shiftWeekday(clock.weekday, 1);
    const closes = (status.closesAt.weekday === clock.weekday || (status.closesAt.weekday === next && status.closesAt.minutes < 6 * 60))
      ? formatClockMinutes(status.closesAt.minutes)
      : when(status.closesAt);
    return { state: 'open', text: 'Open now · Closes ' + closes };
  }
  const today = status.closedNote ? 'Closed today (' + status.closedNote + ')' : 'Closed today';
  const lead = status.closedToday ? today : 'Closed';
  return { state: 'closed', text: status.opensAt ? lead + ' · Opens ' + when(status.opensAt) : (status.closedToday ? today : 'Closed now') };
}

// ---- Happy hour (2026-10-23) ----
// The one "is happy hour on?" answer, shared by the Roam Now map (serialized into its page script, which already
// carries the functions above) and the venue page (server-side). `hh` is the stored happy-hour week, read like
// opening hours (windows past midnight included); `placeClosedNow` is true when the place's own hours say it is
// closed at this moment (then a window that is "on" is not claimed).
// -> null | { state: 'now', until: { weekday, minutes } | null }
//         | { state: 'later', from, to }               -- a window still to come today
//         | { state: 'next', from, to, nextWeek }      -- the next window on another day, up to a week ahead
// `to` is when that window ends ({ weekday, minutes }, or null when it can't be read).
function happyHourState(hh, clock, placeClosedNow) {
  const parsed = parseHours(hh);
  const s = statusAt(parsed, clock);
  if (s.state === 'open') return placeClosedNow ? null : { state: 'now', until: s.closesAt };
  if (s.state !== 'closed' || !s.opensAt) return null;
  const from = s.opensAt;
  const probe = statusAt(parsed, { weekday: from.weekday, minutes: from.minutes });
  const to = probe.state === 'open' ? probe.closesAt : null;
  // nextOpening() only returns today's weekday for a start still ahead today, or for the same day next week.
  if (from.weekday === clock.weekday && from.minutes > clock.minutes) return { state: 'later', from, to };
  return { state: 'next', from, to, nextWeek: from.weekday === clock.weekday };
}

// ---- Listing and structured data (Stage 2, 2026-09-29) ----
// The venue page's weekly list and schema.org OpeningHoursSpecification both
// read parseHours() output, so every surface agrees on what a day is.

// Minutes after the start of the listed day as a 24-hour clock time: a close
// after midnight is shown as the next morning's time (1560 -> "02:00") and a
// close at midnight as "00:00", the same way most venues already store it.
function formatClock24(minutes) {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// One period as the listing states it. A day open around the clock is shown
// as 00:00–23:59 (its stored notation and its structured-data value), never
// reworded as "Open 24 hours": the list restates stored data, it does not
// strengthen it. ("Open 24 hours" stays in hoursStatusLabel, the Open Now
// status, which is only shown for verified venues.)
function formatRange(range) {
  const [a, b] = range;
  return (a === 0 && b >= DAY_MINUTES) ? '00:00–23:59' : formatClock24(a) + '–' + formatClock24(b);
}

// One day of the weekly list: its open periods, "Closed" (listed as closed)
// or "Hours not listed" (unknown -- never shown as closed).
function dayHoursText(day) {
  if (!day || day.status === 'unknown') return 'Hours not listed';
  if (day.status === 'closed') return 'Closed';
  return day.ranges.map(formatRange).join(', ');
}

// schema.org periods for the days listed as open: { day, opens, closes }.
// Closed and unknown days produce nothing. A close after midnight becomes the
// next morning's clock time (closes earlier than opens), and a 24-hour day
// is 00:00-23:59.
function openingPeriods(parsed) {
  const out = [];
  if (!parsed || !parsed.days) return out;
  for (const d of WEEKDAYS) {
    const day = parsed.days[d];
    if (!day || day.status !== 'open') continue;
    for (const [a, b] of day.ranges) {
      const allDay = a === 0 && b >= DAY_MINUTES;
      out.push({ day: d, opens: formatClock24(a), closes: allDay ? '23:59' : formatClock24(b) });
    }
  }
  return out;
}

// The same functions as browser source, for pages that recompute the status
// live (the Food & Drink hub). Built from the functions themselves, so the
// server and the browser can never read hours differently.
const HOURS_CLIENT_SRC = [
  `var WEEKDAYS = ${JSON.stringify(WEEKDAYS)}; var DAY_MINUTES = ${DAY_MINUTES};`,
  ...[hoursTimeToMinutes, parseHoursPeriod, unknownHours, parseHours, dateWeekday, shiftDate, closureOn, isTemporaryClosure, seasonOn, dayOnDate, hoursForClock, isOpenAllDay, shiftWeekday,
    validClock, resolveClose, nextOpening, statusAt, formatClockMinutes, hoursStatusLabel].map((fn) => fn.toString()),
].join('\n');

module.exports = {
  HOURS_WEEKDAYS: WEEKDAYS,
  HOURS_CLIENT_SRC,
  hoursTimeToMinutes,
  parseHours,
  dateWeekday,
  shiftDate,
  dayOnDate,
  isTemporaryClosure,
  hoursForClock,
  statusAt,
  formatClockMinutes,
  hoursStatusLabel,
  happyHourState,
  formatClock24,
  formatRange,
  dayHoursText,
  openingPeriods,
};
