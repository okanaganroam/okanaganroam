// Build My Trip planner, fresh-eyes test of okanaganroam.com/trip (2026-11-22, scored 4.5/10): wine kept when the
// visitor won't drive after tastings, the named town stays the base, day labels follow the stops, B.C.'s fixed UTC-7
// daylight, no trail running past sunset, a sunset dinner at sunset, ice cream found in the chat's one-slot add, and an
// outfitter that only rents gear in winter left out. PURE tests on fixtures and source (no server, no network).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tr = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const SRC = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const WINE_Q = 'anniversary weekend in Kelowna, we love wine and good food, no driving after wineries';
const types = (p) => (p.days || []).map((d) => d.stops.filter((s) => s.venue).map((s) => s.venue.type));

// ---- 1 + 2. "no driving after wineries" ----
test('1. "no driving after wineries" keeps the wineries and is never a car-free trip', () => {
  const t = tr.tripRequestSynonyms(WINE_Q);
  assert.ok(/\bwineries\b/.test(t) && !/\bno driving\b/.test(t), t);
  const req = tr.extractTripRequirements({ text: t, taxonomy: fx.TAXONOMY });
  assert.ok(!req.items.some((i) => i.kind === 'transport'), 'no 1.5 km walking rule');
  assert.ok(req.items.some((i) => i.kind === 'type' && i.value === 'winery'), 'wineries asked for');
  const p = fx.plan(t, { extra: { v4: true } });
  assert.equal(p.kind, 'multi_day');
  for (const day of types(p)) {
    const n = day.filter((x) => x === 'winery').length;
    assert.ok(n >= 1 && n <= 2, `1-2 wineries a day: ${day}`);
    assert.ok(day.includes('restaurant'), 'and good food');
  }
  assert.ok(!(p.warnings || []).some((w) => /car-free|No winery could be fitted/i.test(w)), JSON.stringify(p.warnings));
  // Before the fix the same words planned no winery at all (the old car-free reading), as the live test saw.
  const before = fx.plan(WINE_Q, { extra: { v4: true } });
  assert.ok(!types(before).flat().includes('winery'));
});

test('1. the other ways of saying it: tastings, breweries, drinks; a real car-free trip still is one', () => {
  const cases = {
    "we don't want to drive after the wine tastings": /\bwineries\b/,
    'no driving between breweries': /\bbreweries\b/,
    'dinner and drinks, no driving after drinks': /^dinner and drinks\s*$/,
    'no drinking and driving please': /^\s*please$/,
  };
  for (const [q, re] of Object.entries(cases)) assert.ok(re.test(tr.tripRequestSynonyms(q).trim()), `${q} -> ${tr.tripRequestSynonyms(q)}`);
  const carFree = tr.extractTripRequirements({ text: tr.tripRequestSynonyms('wineries in Kelowna, we have no car'), taxonomy: fx.TAXONOMY });
  assert.ok(carFree.items.some((i) => i.kind === 'transport'), 'no car is still car-free');
  const evening = tr.extractTripRequirements({ text: tr.tripRequestSynonyms('wineries then dinner, no driving after 6 pm'), taxonomy: fx.TAXONOMY });
  assert.ok(evening.items.some((i) => i.kind === 'evening_walk'), '"no driving after 6 pm" keeps its evening rule');
});

test('2. the chat\'s one-slot winery add finds an open winery once the request has no walking rule', () => {
  const t = tr.tripRequestSynonyms('anniversary weekend in Kelowna, good food, no driving after wineries');
  const first = fx.plan(t.replace(/,\s*wineries$/, ''), { extra: { v4: true } });
  const day1 = first.days[0];
  const pinned = {};
  for (const d of first.days) for (const s of d.stops) if (s.venue) pinned[`${d.day}-${s.daypart}`] = s.venue.id;
  const slot = ['afternoon', 'late', 'morning'].map((p) => `1-${p}`).find((k) => !pinned[k]) || '1-afternoon';
  delete pinned[slot];
  const p = fx.plan(t, { extra: { v4: true, pinned, swap: { key: slot, type: 'winery' } } });
  const got = p.days[0].stops.find((s) => `1-${s.daypart}` === slot);
  assert.ok(got && got.venue && got.venue.type === 'winery', `a winery in ${slot}: ${JSON.stringify(got && got.venue && got.venue.name)} (day 1 had ${day1.stops.map((s) => s.venue && s.venue.name)})`);
  assert.ok(!p.swapMissed);
});

// ---- 3. The named town is the base ----
test('3. a day plan with the town\'s own pool stays in the town named (no Summerland and Naramata days)', () => {
  const body = /function tripIndoorKindNearTowns\(first, args, now\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  assert.ok(/\['multi_day', 'day_plan'\]\.includes\(first\.kind\) && firstKind\.some\(\(x\) => x\.venue\.region === town\)\) return first;/.test(body));
});

test('3. a day is called by the towns its stops are in (V4)', () => {
  const v = (region) => ({ venue: { id: Math.random(), region } });
  const plan = { kind: 'multi_day', days: [
    { day: 1, region: 'penticton', regionLabel: 'Penticton', stops: [v('summerland'), v('summerland'), v('summerland'), v('summerland'), v('summerland')] },
    { day: 2, region: 'penticton', regionLabel: 'Penticton', stops: [v('penticton'), v('penticton'), v('naramata'), v('penticton')] },
    { day: 3, region: 'naramata', regions: ['naramata', 'penticton'], regionLabel: 'Naramata and Penticton', stops: [v('naramata'), v('naramata'), v('penticton'), v('penticton')] },
    { day: 4, region: 'penticton', regionLabel: 'Penticton', stops: [{ daypart: 'morning', venue: null }] },
  ] };
  tp.v4DayTownLabels(plan, { labels: { regions: { penticton: 'Penticton', summerland: 'Summerland', naramata: 'Naramata' } } });
  assert.equal(plan.days[0].region, 'summerland');
  assert.equal(plan.days[0].regionLabel, 'Summerland');
  assert.equal(plan.days[1].regionLabel, 'Penticton', 'one stop next door does not rename the day');
  assert.equal(plan.days[2].regionLabel, 'Naramata and Penticton', 'already right');
  assert.equal(plan.days[3].regionLabel, 'Penticton', 'no stops: kept');
  assert.ok(/if \(input && input\.v4\) \{ v4Polish\(result, input\); (?:v4SaneDays\(result, input\); )?v4DayTownLabels\(result, input\);/.test(fs.readFileSync(require.resolve('../trip-planner.js'), 'utf8')), 'V4 only');
});

// ---- 4. Daylight ----
test('4. daylight on B.C.\'s fixed UTC-7 from Nov 1, 2026, whatever the runtime\'s tzdata says', () => {
  const penticton = { lat: 49.4991, lng: -119.5937 };
  const nov = tr.estimateDaylight('2026-11-22', penticton);
  // NOAA for Penticton on Nov 22: sunrise 15:21 UTC, sunset 00:09 UTC -> 8:21 AM and 5:09 PM at UTC-7.
  assert.ok(Math.abs(nov.sunriseMinutes - (8 * 60 + 21)) <= 3, `sunrise ${nov.sunriseMinutes}`);
  assert.ok(Math.abs(nov.sunsetMinutes - (17 * 60 + 9)) <= 3, `sunset ${nov.sunsetMinutes}`);
  const jan = tr.estimateDaylight('2027-01-15', penticton);
  assert.ok(jan.sunsetMinutes > 16 * 60 + 50 && jan.sunsetMinutes < 17 * 60 + 30, `January stays on UTC-7 too: ${jan.sunsetMinutes}`);
  const jul = tr.estimateDaylight('2026-07-01', penticton);
  assert.ok(jul.sunsetMinutes > 20 * 60 + 50 && jul.sunsetMinutes < 21 * 60 + 15, `summer (PDT) unchanged: ${jul.sunsetMinutes}`);
});

function darkFn() {
  const body = /function v4DropAfterDark\(plan\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  return new Function(`${body}; return v4DropAfterDark;`)(); // eslint-disable-line no-new-func
}
test('4. a trail that would run past sunset is shortened to end in daylight, or left out when too little is left', () => {
  const drop = darkFn();
  const light = (status) => ({ sunriseMinutes: 501, sunsetMinutes: 1029, marginMinutes: 30, status });
  const p = {
    kind: 'multi_day',
    days: [{ day: 1, stops: [{ venue: { id: 1, name: 'Campbell Mountain' } }, { venue: { id: 2, name: 'KVR Trail' } }, { venue: { id: 3, name: 'Lachi' } }] }],
    schedule: [
      { day: 1, venueId: 1, startMinutes: 840, endMinutes: 1020, daylight: light('conflict') }, // 2:00-5:00 PM
      { day: 1, venueId: 2, startMinutes: 975, endMinutes: 1035, daylight: light('conflict') }, // 4:15-5:15 PM
      { day: 1, venueId: 3, startMinutes: 1080, endMinutes: 1170 },
    ],
    warnings: ['Campbell Mountain: Estimated daylight 08:21–17:09; 30-minute margin before sunset. This outdoor visit falls outside the estimated daylight window.', 'KVR Trail: Estimated daylight 08:21–17:09; 30-minute margin before sunset. This outdoor visit falls outside the estimated daylight window.'],
    scheduleWarnings: [],
  };
  drop(p);
  const row1 = p.schedule.find((r) => r.venueId === 1);
  assert.equal(row1.endMinutes, 990, 'ends at 4:30 PM, before sunset less its margin (4:39)');
  assert.equal(row1.daylight.status, 'estimated');
  assert.deepEqual(p.days[0].stops.map((s) => s.venue.id), [1, 3], 'a 4:15 PM start has under 45 minutes of light: left out');
  assert.deepEqual(p.warnings, [], 'no "outside the daylight window" note left');
});

// ---- 5. Sunset dinner ----
function sunsetFn(today = '2026-11-22') {
  const body = /const V4_SUNSET_DINNER_RE = [\s\S]*?\nfunction v4SunsetDinner\(a, now = new Date\(\)\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  const db = { prepare: () => ({ get: (...a) => (a[0] === 'kelowna' ? { lat: 49.888, lng: -119.496 } : { lat: 49.49, lng: -119.59 }) }) };
  const REGION_LABELS = { kelowna: 'Kelowna', penticton: 'Penticton', 'west-kelowna': 'West Kelowna' };
  const TRIP_SITE = require('../trip-site.js');
  return new Function('require', 'db', 'REGION_LABELS', 'todayLocal', 'TRIP_SITE', `${body}; return v4SunsetDinner;`)((m) => (m === './trip-requirements' ? tr : require(m)), db, REGION_LABELS, () => today, TRIP_SITE); // eslint-disable-line no-new-func
}
test('5. a sunset dinner starts about half an hour before the real sunset, and the plan says when the sun sets', () => {
  const sd = (text, overrides) => sunsetFn()({ text, overrides }, new Date('2026-11-22T18:00:00Z'));
  const nov = sd('a day in Penticton with a walk and a sunset dinner', { startDate: '2026-11-28' });
  assert.equal(nov.text, 'a day in Penticton with a walk and dinner at 4:30 pm with a lake view');
  assert.match(nov.note, /^Sunset is about 5:0\d PM that day, so the sunset dinner starts at 4:30 PM\.$/);
  assert.equal(tr.extractTripRequirements({ text: nov.text, taxonomy: fx.TAXONOMY }).mealMinutes.dinner, 990, 'the planner reads it as the dinner time');
  const lake = sd('anniversary weekend in Kelowna, wineries and a sunset dinner with a lake view', { startDate: '2026-11-28' });
  assert.equal(lake.text, 'anniversary weekend in Kelowna, wineries and dinner at 4:30 pm with a lake view', 'one lake view');
  const july = sd('sunset dinner in Kelowna', { startDate: '2027-07-10' });
  assert.ok(/dinner at (?:8:(?:15|30)) pm/.test(july.text), july.text);
  assert.equal(sd('sunset dinner at 7 pm in Kelowna', { startDate: '2026-11-28' }), null, 'a time the visitor gave wins');
  assert.equal(sd('dinner in Kelowna', {}), null);
  assert.ok(/sunsetDinner = v4SunsetDinner\(a, now\)/.test(SRC), 'V4 runTripPlan uses it');
});

// (Live, the chat's "add a sunset dinner with a lake view" asked for an extra restaurant in the afternoon, which the V4 tidy
// takes out as a third meal: that is the chat's add, which should swap the day's dinner. The planner's own evening Swap works.)
test('5. the planner\'s one-slot Swap finds a lake-view dinner for the evening slot', () => {
  const view = fx.add({ name: 'Waterfront Grill', region: 'kelowna', type: 'restaurant', rating: 4.0, price: 3, cuisine: 'Seafood', desc: 'Dinner on the lake.', hours: fx.open('16:00', '22:00'), features: { lake_view: true }, dLat: 0.002 });
  try {
    const q = '2 days in Kelowna, good food';
    const first = fx.plan(q, { extra: { v4: true } });
    const pinned = {};
    let oldDinner = null;
    for (const d of first.days) for (const s of d.stops) if (s.venue) { const k = `${d.day}-${s.daypart}`; if (k === '1-evening') oldDinner = s.venue.id; else pinned[k] = s.venue.id; }
    assert.ok(oldDinner && oldDinner !== view.id && !Object.values(pinned).includes(view.id), 'the lake-view place is not in the plan yet');
    const p = fx.plan(q, { extra: { v4: true, pinned, swap: { key: '1-evening', type: 'restaurant', want: 'lake_view', id: oldDinner } } });
    assert.equal(p.days[0].stops.find((s) => s.daypart === 'evening').venue.name, 'Waterfront Grill');
    assert.ok(!p.swapMissed);
  } finally { fx.FACTS.splice(fx.FACTS.indexOf(view), 1); }
});

// ---- 6. Ice cream in the one-slot add ----
test('6. ice cream: a café whose own first sentence says ice cream counts, and asking for it beats the cold-month guess', () => {
  const v = { type: 'cafe', name: "Tickleberry's Downtown", cuisine: 'Dessert', description: "Tickleberry's Downtown is a Penticton ice cream and coffee shop with a huge flavour selection. Gluten-free pastries too." };
  assert.equal(tp.swapWantOk(v, { want: 'ice_cream' }), true);
  assert.equal(tp.swapWantOk({ ...v, description: 'A bakery and coffee shop. Ice cream in summer.' }, { want: 'ice_cream' }), false, 'a passing mention is not it');
  assert.equal(tp.swapWantOk({ type: 'restaurant', name: 'Burger Barn', description: 'Burgers, fries and ice cream.' }, { want: 'ice_cream' }), false, 'a restaurant is not an ice cream stop');
  const src = fs.readFileSync(require.resolve('../trip-planner.js'), 'utf8');
  assert.ok(/swap\.want === 'ice_cream' \? \{ queryText: /.test(src), 'the Swap reads ice cream as asked for');
});

// ---- 7. Seasonal outfitters ----
test('7. Hoodoo Adventure Company (rentals and shuttles in fall, snowshoe rentals in winter) is not planned November to March', () => {
  const facts = JSON.parse(fs.readFileSync(require.resolve('../data/outdoor-facts.json'), 'utf8'));
  const f = facts['1444'];
  const winter = (f.extras || []).find((x) => x.label === 'Winter');
  const hoodoo = { id: 1444, type: 'outdoor', name: 'Hoodoo Adventure Company', textName: 'hoodoo adventure company', activities: ['adventure'], outdoorSeason: { season: f.season, winter: winter.text } };
  const ctx = (text) => ({ queryText: text, requirements: { text } });
  assert.equal(tp.outdoorFactsSeasonOff(hoodoo, ctx("3 days in penticton with kids 6 and 9 we don't drink"), 11), true);
  assert.equal(tp.outdoorFactsSeasonOff(hoodoo, ctx('3 days in penticton with kids'), 1), true);
  assert.equal(tp.outdoorFactsSeasonOff(hoodoo, ctx('snowshoe rentals in penticton'), 1), false, 'asked for rentals');
  assert.equal(tp.outdoorFactsSeasonOff(hoodoo, ctx('hoodoo adventure company tomorrow'), 11), false, 'named');
  assert.equal(tp.outdoorFactsSeasonOff(hoodoo, ctx('3 days in penticton'), 6), false, 'summer: as before');
  // Other researched seasons.
  const of = (season, extra = {}) => tp.outdoorFactsSeasonOff({ type: 'outdoor', textName: 'x place', activities: [], outdoorSeason: { season, winter: '' }, ...extra }, ctx('a day out'), 12);
  assert.equal(of('Closed for winter; reopens May 7, 2027'), true);
  assert.equal(of('Open daily May 15 to Sept 7, 2026'), true);
  assert.equal(of('Shop open mid-April through September'), true);
  assert.equal(of('Open year-round'), false);
  assert.equal(of('Open year-round; services mid-April to Nov 15'), false, 'services, not the place');
  assert.equal(of('Oct 15 to Dec 31: open 6 am to 6 pm; hours shift by season'), false, 'winter hours, not a summer season');
  assert.equal(of('Closed for the season now; daily 9 am to 9 pm when open', { textName: 'outdoor skating rink' }), false, 'a rink waiting for winter');
  assert.equal(of('Closed now; opening winter 2026/2027', { textName: 'big white tube park' }), false, 'a tube park waiting for winter');
  assert.equal(of('Climbing closures usually March 15 to July 31 for nesting falcons'), false, 'a closure, not a season');
  assert.equal(of('Pass needed Fri to Mon and holidays, Jun 12 to Oct 12, 2026'), false, 'a pass period, not a season');
  assert.equal(of('Grounds open daily in daylight; building interiors 8am-4pm, Mar 15 to Oct 15'), false, 'the buildings, not the grounds');
  assert.equal(of('Alpine trails typically open July to October, snow and weather permitting'), true);
  // The server hands the facts to the planner.
  assert.ok(/\.\.\.\(v\.type === 'outdoor' \? tripOutdoorSeasonFact\(v\.id\) : \{\}\),/.test(SRC));
});

test('7. a channel float or water-sports rental is a summer-only stop', () => {
  const ctx = { tripDate: '2026-11-24', activities: new Set(), types: new Set(), queryText: '3 days in penticton with kids', requirements: { text: '3 days in penticton with kids' } };
  const v = (name) => ({ type: 'outdoor', name, textName: name.toLowerCase(), textDesc: '', activities: [] });
  assert.equal(tp.offSeasonSkip(v('Coyote Cruises Penticton Channel Float'), ctx), true);
  assert.equal(tp.offSeasonSkip(v('Pier Water Sports'), ctx), true);
  assert.equal(tp.offSeasonSkip(v('Penticton Channel Walk'), ctx), false);
});
