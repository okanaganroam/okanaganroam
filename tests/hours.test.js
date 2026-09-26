// Canonical opening hours (hours.js, Open Now Phase 1). Pure: fixed clocks
// ({ weekday, minutes } -- the shape okanaganClock() returns), no database,
// no server. Pacific Time / daylight-saving tests that go through the real
// okanaganClock() live in server.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../hours.js');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const J = (obj) => JSON.stringify(obj);
const every = (ranges) => Object.fromEntries(DAYS.map((d) => [d, ranges]));
const at = (weekday, hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return { weekday, minutes: hh * 60 + mm };
};
const status = (hours, weekday, hhmm) => h.statusAt(h.parseHours(typeof hours === 'string' ? hours : J(hours)), at(weekday, hhmm));
const state = (hours, weekday, hhmm) => status(hours, weekday, hhmm).state;

// ---- parsing ----------------------------------------------------------------

test('hours: same-day periods parse to minutes; "9:00" and "09:00" are the same', () => {
  const p = h.parseHours(J({ mon: [['09:00', '17:00']], tue: [['9:00', '17:00']] }));
  assert.equal(p.known, true);
  assert.deepEqual(p.days.mon, { status: 'open', ranges: [[540, 1020]] });
  assert.deepEqual(p.days.tue, p.days.mon);
});

test('hours: null and [] are closed; an absent day is unknown, never closed', () => {
  const p = h.parseHours(J({ mon: null, tue: [], wed: [['09:00', '17:00']] }));
  assert.deepEqual(p.days.mon, { status: 'closed' });
  assert.deepEqual(p.days.tue, { status: 'closed' });
  for (const d of ['thu', 'fri', 'sat', 'sun']) assert.deepEqual(p.days[d], { status: 'unknown' }, d);
});

test('hours: no usable hours at all is unknown on every day (known === false)', () => {
  for (const raw of [null, undefined, '', '   ', 'not json', '[1,2]', '"text"', '42', 'null', 42, [], 'Mon-Fri 9-5']) {
    const p = h.parseHours(raw);
    assert.equal(p.known, false, String(raw));
    for (const d of DAYS) assert.equal(p.days[d].status, 'unknown', `${raw} ${d}`);
  }
});

test('hours: a malformed day is unknown; the other days are unaffected', () => {
  const p = h.parseHours(J({
    mon: '9-5', tue: [['9am', '5pm']], wed: [['09:00']], thu: [['25:00', '26:00']],
    fri: [['09:00', '12:00'], ['bad', '17:00']], sat: [['09:00', '17:00']], sun: [['10:00', '10:61']],
  }));
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sun']) assert.equal(p.days[d].status, 'unknown', d);
  assert.equal(p.days.sat.status, 'open');
  assert.equal(p.known, true);
});

test('hours: an already-parsed object is accepted like its JSON text', () => {
  const obj = { mon: [['11:00', '14:00'], ['17:00', '22:00']], tue: null };
  assert.deepEqual(h.parseHours(obj), h.parseHours(J(obj)));
});

test('hours: multiple periods per day are kept, in order', () => {
  const p = h.parseHours(J({ mon: [['17:00', '22:00'], ['11:00', '14:00']] }));
  assert.deepEqual(p.days.mon.ranges, [[660, 840], [1020, 1320]]);
});

test('hours: overnight closes run into the next morning in every stored notation', () => {
  const p = h.parseHours(J({
    mon: [['18:00', '02:00']], tue: [['23:00', '01:00']], wed: [['16:00', '25:00']],
    thu: [['11:00', '00:00']], fri: [['12:00', '26:30']], sat: [['11:00', '24:00']],
  }));
  assert.deepEqual(p.days.mon.ranges, [[1080, 1560]]);
  assert.deepEqual(p.days.tue.ranges, [[1380, 1500]]);
  assert.deepEqual(p.days.wed.ranges, [[960, 1500]], '"25:00" is 01:00 the next morning');
  assert.deepEqual(p.days.thu.ranges, [[660, 1440]], '"00:00" closes at midnight');
  assert.deepEqual(p.days.fri.ranges, [[720, 1590]]);
  assert.deepEqual(p.days.sat.ranges, [[660, 1440]], '"24:00" closes at midnight');
  assert.deepEqual(h.parseHours(J({ mon: [['16:00', '25:00']] })), h.parseHours(J({ mon: [['16:00', '01:00']] })));
});

test('hours: 24-hour days: 00:00-00:00, 00:00-24:00 and 00:00-23:59 are all the whole day', () => {
  for (const close of ['00:00', '24:00', '23:59']) {
    assert.deepEqual(h.parseHours(J({ mon: [['00:00', close]] })).days.mon.ranges, [[0, 1440]], close);
  }
});

test('hours: an opening time must be a real clock time and a period at most 24 hours', () => {
  assert.equal(h.parseHours(J({ mon: [['24:00', '26:00']] })).days.mon.status, 'unknown');
  assert.equal(h.parseHours(J({ mon: [['10:00', '35:00']] })).days.mon.status, 'unknown');
  assert.equal(h.parseHours(J({ mon: [['10:00', '48:00']] })).days.mon.status, 'unknown');
  assert.equal(h.hoursTimeToMinutes('47:59'), 47 * 60 + 59);
  assert.equal(h.hoursTimeToMinutes('48:00'), null);
  assert.equal(h.hoursTimeToMinutes(' 7:05 '), 425);
  assert.equal(h.hoursTimeToMinutes(700), null);
});

test('hours: parsing never modifies its input', () => {
  const obj = { mon: [['18:00', '02:00']], tue: null };
  const copy = JSON.parse(J(obj));
  h.parseHours(obj);
  assert.deepEqual(obj, copy);
});

// ---- status at a moment -------------------------------------------------------

test('status: Monday 09:00-17:00 -- open at the opening minute, closed at the closing minute', () => {
  const H = { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']] };
  assert.deepEqual(status(H, 'mon', '08:59'), { state: 'closed', closesAt: null, opensAt: { weekday: 'mon', minutes: 540 }, closedToday: false, allDay: false });
  assert.deepEqual(status(H, 'mon', '09:00'), { state: 'open', closesAt: { weekday: 'mon', minutes: 1020 }, opensAt: null, closedToday: false, allDay: false });
  assert.equal(state(H, 'mon', '16:59'), 'open');
  assert.deepEqual(status(H, 'mon', '17:00'), { state: 'closed', closesAt: null, opensAt: { weekday: 'tue', minutes: 540 }, closedToday: false, allDay: false });
});

test('status: closed Monday is "closed today" with the next listed opening', () => {
  const s = status({ mon: null, tue: [['11:00', '21:00']] }, 'mon', '12:00');
  assert.deepEqual(s, { state: 'closed', closesAt: null, opensAt: { weekday: 'tue', minutes: 660 }, closedToday: true, allDay: false });
  assert.equal(status({ mon: [], tue: [['11:00', '21:00']] }, 'mon', '12:00').closedToday, true);
});

test('status: missing Monday hours are unknown -- never closed, never open', () => {
  const H = { tue: [['09:00', '17:00']] };
  for (const t of ['00:00', '09:00', '12:00', '23:59']) {
    assert.deepEqual(status(H, 'mon', t), { state: 'unknown', closesAt: null, opensAt: null, closedToday: false, allDay: false }, t);
  }
});

test('status: no hours at all is unknown at every moment', () => {
  for (const raw of [null, '', 'garbage']) {
    for (const d of DAYS) assert.equal(h.statusAt(h.parseHours(raw), at(d, '12:00')).state, 'unknown', `${raw} ${d}`);
  }
});

test('status: 11:00-14:00 + 17:00-22:00 split day', () => {
  const H = { mon: [['11:00', '14:00'], ['17:00', '22:00']], tue: [['11:00', '14:00'], ['17:00', '22:00']] };
  assert.deepEqual(status(H, 'mon', '10:59').opensAt, { weekday: 'mon', minutes: 660 });
  assert.equal(state(H, 'mon', '11:00'), 'open');
  assert.deepEqual(status(H, 'mon', '13:59').closesAt, { weekday: 'mon', minutes: 840 });
  assert.deepEqual(status(H, 'mon', '14:00'), { state: 'closed', closesAt: null, opensAt: { weekday: 'mon', minutes: 1020 }, closedToday: false, allDay: false });
  assert.equal(state(H, 'mon', '16:59'), 'closed');
  assert.equal(state(H, 'mon', '17:00'), 'open');
  assert.deepEqual(status(H, 'mon', '21:59').closesAt, { weekday: 'mon', minutes: 1320 });
  assert.deepEqual(status(H, 'mon', '22:00').opensAt, { weekday: 'tue', minutes: 660 });
});

test('status: 18:00-02:00 overnight -- boundaries on both sides of midnight', () => {
  const H = { sat: [['18:00', '02:00']], sun: null, mon: [['18:00', '02:00']] };
  assert.equal(state(H, 'sat', '17:59'), 'closed');
  assert.deepEqual(status(H, 'sat', '18:00').closesAt, { weekday: 'sun', minutes: 120 });
  assert.equal(state(H, 'sat', '23:59'), 'open');
  assert.equal(state(H, 'sun', '00:00'), 'open', 'still Saturday night at midnight');
  const lateSat = status(H, 'sun', '01:59');
  assert.equal(lateSat.state, 'open');
  assert.deepEqual(lateSat.closesAt, { weekday: 'sun', minutes: 120 });
  assert.equal(lateSat.closedToday, false);
  assert.deepEqual(status(H, 'sun', '02:00'), { state: 'closed', closesAt: null, opensAt: { weekday: 'mon', minutes: 1080 }, closedToday: true, allDay: false });
});

test('status: 23:00-01:00 overnight, including the Sunday-to-Monday week wrap', () => {
  const H = { sun: [['23:00', '01:00']], mon: null };
  assert.equal(state(H, 'sun', '22:59'), 'closed');
  assert.equal(state(H, 'sun', '23:00'), 'open');
  assert.deepEqual(status(H, 'mon', '00:30').closesAt, { weekday: 'mon', minutes: 60 });
  assert.equal(state(H, 'mon', '00:59'), 'open');
  assert.equal(state(H, 'mon', '01:00'), 'closed');
});

test('status: past-midnight notation ("25:00", "26:00") behaves exactly like its clock time', () => {
  const written = { fri: [['16:00', '25:00']], sat: [['12:00', '26:00']], sun: null };
  const clock = { fri: [['16:00', '01:00']], sat: [['12:00', '02:00']], sun: null };
  for (const [d, t] of [['fri', '15:59'], ['fri', '16:00'], ['sat', '00:30'], ['sat', '00:59'], ['sat', '01:00'], ['sat', '11:59'], ['sun', '01:59'], ['sun', '02:00']]) {
    assert.deepEqual(status(written, d, t), status(clock, d, t), `${d} ${t}`);
  }
  assert.equal(state(written, 'sat', '00:30'), 'open', '16:00-25:00 is open at 00:30 (the /browse card bug)');
});

test('status: a 03:30 opening is seen at 04:00 (no "before 05:00 is last night" cut-off)', () => {
  const H = every([['03:30', '23:00']]);
  assert.equal(state(H, 'mon', '03:29'), 'closed');
  assert.equal(state(H, 'mon', '03:30'), 'open');
  assert.deepEqual(status(H, 'mon', '04:00'), { state: 'open', closesAt: { weekday: 'mon', minutes: 1380 }, opensAt: null, closedToday: false, allDay: false });
  assert.deepEqual(status(H, 'mon', '23:30').opensAt, { weekday: 'tue', minutes: 210 });
});

test('status: 24-hour days are open at every minute; the close is when the 24-hour run ends', () => {
  const allWeek = every([['00:00', '24:00']]);
  for (const t of ['00:00', '12:00', '23:59']) {
    assert.deepEqual(status(allWeek, 'wed', t), { state: 'open', closesAt: null, opensAt: null, closedToday: false, allDay: true }, t);
  }
  const weekend = { fri: [['00:00', '00:00']], sat: [['00:00', '23:59']], sun: [['00:00', '18:00']], mon: null };
  assert.deepEqual(status(weekend, 'fri', '09:00'), { state: 'open', closesAt: { weekday: 'sun', minutes: 1080 }, opensAt: null, closedToday: false, allDay: true });
  assert.equal(status(weekend, 'sun', '09:00').allDay, false);
  assert.equal(state(weekend, 'sun', '18:00'), 'closed');
  // A late close that runs into a next-day period starting at 00:00 is one stretch.
  assert.deepEqual(status({ mon: [['18:00', '00:00']], tue: [['00:00', '03:00']] }, 'mon', '20:00').closesAt, { weekday: 'tue', minutes: 180 });
  // ...but a midnight close followed by a closed day closes at midnight.
  assert.deepEqual(status({ mon: [['18:00', '00:00']], tue: null }, 'mon', '20:00').closesAt, { weekday: 'tue', minutes: 0 });
});

test('status: last night\'s overnight period still counts when today is closed or unknown', () => {
  assert.equal(state({ fri: [['20:00', '02:00']], sat: null }, 'sat', '01:00'), 'open');
  assert.equal(state({ fri: [['20:00', '02:00']] }, 'sat', '01:00'), 'open', 'Saturday itself unknown');
  assert.equal(state({ fri: [['20:00', '02:00']] }, 'sat', '02:00'), 'unknown', 'after it ends, Saturday is unknown');
});

test('status: the next opening is never claimed past an unknown day', () => {
  assert.deepEqual(status({ mon: [['09:00', '17:00']], tue: null, thu: [['09:00', '17:00']] }, 'mon', '18:00').opensAt, null, 'Wednesday is unknown');
  assert.deepEqual(status({ mon: [['09:00', '17:00']], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, 'mon', '18:00').opensAt, { weekday: 'mon', minutes: 540 }, 'next week');
  assert.equal(status({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, 'mon', '12:00').opensAt, null, 'closed every day');
});

test('status: an invalid clock or input is unknown, never open', () => {
  const p = h.parseHours(J(every([['00:00', '24:00']])));
  for (const clock of [null, {}, { weekday: 'monday', minutes: 600 }, { weekday: 'mon', minutes: 1440 }, { weekday: 'mon', minutes: -1 }, { weekday: 'mon', minutes: 1.5 }]) {
    assert.equal(h.statusAt(p, clock).state, 'unknown', JSON.stringify(clock));
  }
  assert.equal(h.statusAt(null, at('mon', '12:00')).state, 'unknown');
});

test('status: every stored production shape seen in the audit is read without throwing', () => {
  const samples = [
    { mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '21:00']], sat: [['10:00', '21:00']], sun: [['10:00', '20:00']] },
    { mon: null, tue: [['15:00', '21:00']], wed: [['15:00', '21:00']], thu: [['15:00', '22:00']], fri: [['12:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] },
    { mon: [['12:00', '26:00']], tue: [['12:00', '26:00']], wed: [['12:00', '26:00']], thu: [['12:00', '26:00']], fri: [['12:00', '26:00']], sat: [['12:00', '26:00']], sun: [['12:00', '26:00']] },
    { mon: [['7:00', '15:00']], tue: [], wed: [['7:00', '15:00']], thu: [['7:00', '15:00']], fri: [['7:00', '15:00']], sat: [['8:00', '15:00']], sun: [['8:00', '15:00']] },
  ];
  for (const s of samples) {
    const p = h.parseHours(J(s));
    assert.equal(p.known, true);
    for (const d of DAYS) for (let m = 0; m < 1440; m += 30) {
      const r = h.statusAt(p, { weekday: d, minutes: m });
      assert.ok(['open', 'closed', 'unknown'].includes(r.state));
      assert.notEqual(r.state, 'unknown', 'fully listed weeks are never unknown');
    }
  }
});

// ---- wording + browser copy (Open Now on /food-drink) ------------------------

const label = (hours, weekday, hhmm) => {
  const c = at(weekday, hhmm);
  return h.hoursStatusLabel(h.statusAt(h.parseHours(typeof hours === 'string' ? hours : J(hours)), c), c);
};

test('wording: 12-hour clock times', () => {
  assert.equal(h.formatClockMinutes(0), '12 AM');
  assert.equal(h.formatClockMinutes(210), '3:30 AM');
  assert.equal(h.formatClockMinutes(720), '12 PM');
  assert.equal(h.formatClockMinutes(1260), '9 PM');
  assert.equal(h.formatClockMinutes(1290), '9:30 PM');
  assert.equal(h.formatClockMinutes(1439), '11:59 PM');
});

test('wording: open, closed, overnight, early opening, 24 hours and unknown', () => {
  const H = { mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: null, thu: [['11:00', '21:00']] };
  assert.deepEqual(label(H, 'mon', '12:00'), { state: 'open', text: 'Open now · Closes 9 PM' });
  assert.deepEqual(label(H, 'mon', '09:00'), { state: 'closed', text: 'Closed · Opens 11 AM' });
  assert.deepEqual(label(H, 'mon', '21:00'), { state: 'closed', text: 'Closed · Opens tomorrow 11 AM' });
  assert.deepEqual(label(H, 'wed', '12:00'), { state: 'closed', text: 'Closed today · Opens tomorrow 11 AM' });
  assert.deepEqual(label(H, 'tue', '22:00'), { state: 'closed', text: 'Closed · Opens Thu 11 AM' });
  // Overnight and past-midnight notation: the close after midnight is a plain time.
  const late = { sat: [['18:00', '02:00']], sun: null, fri: [['16:00', '25:00']] };
  assert.deepEqual(label(late, 'sat', '23:00'), { state: 'open', text: 'Open now · Closes 2 AM' });
  assert.deepEqual(label(late, 'sun', '01:30'), { state: 'open', text: 'Open now · Closes 2 AM' });
  assert.deepEqual(label(late, 'fri', '23:59'), { state: 'open', text: 'Open now · Closes 1 AM' });
  assert.deepEqual(label(late, 'sat', '00:59').state, 'open');
  // Early opening.
  assert.deepEqual(label({ mon: [['03:30', '23:00']] }, 'mon', '04:00'), { state: 'open', text: 'Open now · Closes 11 PM' });
  assert.deepEqual(label({ mon: [['03:30', '23:00']] }, 'mon', '03:00'), { state: 'closed', text: 'Closed · Opens 3:30 AM' });
  // 24 hours all week; a 24-hour run that ends names its day.
  assert.deepEqual(label(every([['00:00', '24:00']]), 'wed', '12:00'), { state: 'open', text: 'Open 24 hours' });
  assert.deepEqual(label({ fri: [['00:00', '24:00']], sat: [['00:00', '24:00']], sun: [['00:00', '18:00']] }, 'fri', '09:00'), { state: 'open', text: 'Open now · Closes Sun 6 PM' });
  // Unknown is never worded as closed.
  assert.deepEqual(label({ tue: [['09:00', '17:00']] }, 'mon', '12:00'), { state: 'unknown', text: 'Hours not listed for today' });
  assert.deepEqual(label(null, 'mon', '12:00'), { state: 'unknown', text: 'Hours not listed for today' });
  assert.deepEqual(h.hoursStatusLabel(null, at('mon', '12:00')).state, 'unknown');
});

test('browser copy (HOURS_CLIENT_SRC) reads every minute of the week exactly like the module', () => {
  const vm = require('node:vm');
  const ctx = {};
  vm.runInNewContext(h.HOURS_CLIENT_SRC, ctx);
  const samples = [
    { mon: [['11:00', '14:00'], ['17:00', '22:00']], tue: null, wed: [], thu: [['18:00', '02:00']], fri: [['16:00', '25:00']], sat: [['03:30', '23:00']], sun: [['00:00', '24:00']] },
    every([['00:00', '24:00']]),
    { mon: [['9:00', '17:00']] },
  ];
  for (const s of samples) {
    const a = h.parseHours(J(s));
    const b = ctx.parseHours(J(s));
    assert.deepEqual(JSON.parse(JSON.stringify(b)), a);
    for (const d of DAYS) for (let m = 0; m < 1440; m += 7) {
      const c = { weekday: d, minutes: m };
      assert.deepEqual(JSON.parse(JSON.stringify(ctx.hoursStatusLabel(ctx.statusAt(b, c), c))), h.hoursStatusLabel(h.statusAt(a, c), c), `${d} ${m}`);
    }
  }
});
