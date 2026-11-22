// Build My Trip planner, second fresh-eyes round (2026-11-22, dated plans on the live site): sane meal times and a light
// last day, no brewery event on a no-alcohol plan, "dinner and something to do", nights read as days, what could not be
// included said up front (plan.notIncluded), a Swap that asks for a kind judged on that kind, "no car" kept in the base
// town, and each child's age as typed. PURE tests on fixtures and source (no server, no network).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tr = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const frText = require('../trip-planner-fr.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const SRC = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const rowOf = (p, day, s) => (p.schedule || []).find((r) => r.day === day.day && ((s.venue && r.venueId === s.venue.id) || (s.event && r.eventId === s.event.id)));
const isMeal = (s, part) => s.venue && ['restaurant', 'pub'].includes(s.venue.type) && s.daypart === part;
function assertSane(p) {
  for (const day of p.days) for (const s of day.stops) {
    if (!(s.venue || s.event)) continue;
    const r = rowOf(p, day, s);
    assert.ok(r && Number.isFinite(r.startMinutes), `day ${day.day} ${(s.venue || s.event).name} has a time`);
    if (isMeal(s, 'midday')) assert.ok(r.startMinutes >= 690 && r.startMinutes <= 810, `lunch on day ${day.day} starts ${r.startMinutes}`);
    if (isMeal(s, 'evening')) assert.ok(r.startMinutes >= 1020 && r.startMinutes <= 1200, `dinner on day ${day.day} starts ${r.startMinutes}`);
  }
}
const ev = (o) => ({ id: o.id, name: o.name, description: '', region: 'kelowna', venueName: o.venueName || '', url: '/kelowna/events/x', valleyWide: false, categories: ['family-kids'], dateLabel: '', time: o.time, startDate: o.date, endDate: o.date, startTime: o.startTime || null, endTime: o.endTime || null, endsNextDay: 0, location: null });

// ---- 1. Dated plans: meal times, every stop timed, the day they leave ----
test('1. a one-night trip: lunch and dinner at meal times, every stop timed, the last day a light morning', () => {
  const p = fx.plan('anniversary weekend in Kelowna, wineries and good food on November 28', { extra: { v4: true, departureDate: '2026-11-29' } });
  assert.equal(p.days.length, 2);
  assertSane(p);
  const last = p.days[1];
  assert.ok(last.stops.filter((s) => s.venue || s.event).length >= 1, 'the last day still has a morning');
  assert.ok(last.stops.every((s) => ['early', 'morning', 'midday'].includes(s.daypart)), `no afternoon or dinner on the day they leave: ${last.stops.map((s) => s.daypart)}`);
  assert.ok(p.days[0].stops.some((s) => isMeal(s, 'evening')), 'day 1 keeps its dinner');
  // Without the leaving day the same request is two full days (the current page is unchanged).
  const full = fx.plan('anniversary weekend in Kelowna, wineries and good food on November 28', { extra: { v4: true } });
  assert.ok(full.days[1].stops.some((s) => s.daypart === 'evening'));
});

test('1. a longer trip: nothing after dinner on the day they leave; "N nights" typed means the last day is the leaving day', () => {
  const p = fx.plan('3 days in Kelowna, wineries and a nice dinner on December 4', { extra: { v4: true, departureDate: '2026-12-06' } });
  assert.equal(p.days.length, 3);
  assertSane(p);
  const last = p.days[2];
  assert.ok(!last.stops.some((s) => s.daypart === 'night'), 'no night stop');
  const dinnerAt = last.stops.findIndex((s) => isMeal(s, 'evening'));
  if (dinnerAt >= 0) assert.equal(dinnerAt, last.stops.length - 1, 'dinner is the last stop');
  // "one night" -> "2 days" with the last day the leaving day, dated or not.
  const body = /const V4_NIGHT_WORDS = [\s\S]*?\nfunction v4NightsText\(text\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  const nights = new Function(`${body}; return v4NightsText;`)(); // eslint-disable-line no-new-func
  assert.equal(nights('one night in Osoyoos next Friday, two friends').text, '2 days in Osoyoos next Friday, two friends');
  assert.equal(nights('two nights in Vernon').text, '3 days in Vernon');
  assert.equal(nights('une nuit à Vernon').text, '2 days à Vernon');
  assert.equal(nights('a night out in Kelowna'), null);
  assert.equal(nights('3 days and 2 nights in Kelowna'), null, 'the days typed win');
  const undated = fx.plan('2 days in Kelowna, wineries and good food', { extra: { v4: true, departureLast: true } });
  assert.ok(undated.days[1].stops.every((s) => ['early', 'morning', 'midday'].includes(s.daypart)));
  assert.ok(/if \(n\) a = \{ \.\.\.a, text: n\.text, departureLast: true \};/.test(SRC) && /base\.departureDate = stay\.leave;/.test(SRC));
});

test('1. a stop the tidy leaves out does not leave its time behind (lunch stays at lunchtime)', () => {
  const src = fs.readFileSync(require.resolve('../trip-planner.js'), 'utf8');
  assert.ok(/v4Polish\(result, input\); v4SaneDays\(result, input\); v4DayTownLabels\(result, input\);/.test(src), 'V4 only, after the polish');
  const plain = fx.plan('anniversary weekend in Kelowna, wineries and good food on November 28', { extra: { departureDate: '2026-11-29' } });
  assert.ok(plain.days[1].stops.length >= 3, 'without V4 nothing changes');
});

// ---- 2. Events on dated plans ----
test('2. an event at a brewery is never added to a no-alcohol plan; an open-house event is a drop-in after lunch', () => {
  assert.equal(tp.eventAtDrinkPlace({ name: 'Photos with Santa at Abandoned Rail Brewing', venueName: 'Abandoned Rail Brewing Co.' }, []), true);
  assert.equal(tp.eventAtDrinkPlace({ name: 'Photos with Santa', venueName: 'Cedar Estate Winery 2' }, []), true);
  assert.equal(tp.eventAtDrinkPlace({ name: 'Photos with Santa', venueName: "Kelly O'Bryan's" }, fx.FACTS), true, 'a listed pub by name');
  assert.equal(tp.eventAtDrinkPlace({ name: 'Santa Claus Parade', venueName: 'Main Street and Gyro Park' }, fx.FACTS), false);
  const santaBrew = ev({ id: 901, name: 'Photos with Santa at Rail Brewing', venueName: 'Rail Brewing Co.', date: '2026-11-29', time: '1 pm', startTime: '13:00', endTime: '16:00' });
  const santaPark = ev({ id: 902, name: 'Photos with Santa in the Park', venueName: 'City Park', date: '2026-11-29', time: '1 pm', startTime: '13:00', endTime: '16:00' });
  const q = "3 days in Kelowna with kids 6 and 9, we don't drink, on November 28";
  const dry = fx.plan(q, { extra: { v4: true, events: [santaBrew], familyEvents: true } });
  assert.ok(!dry.days.some((d) => d.stops.some((s) => s.event)), 'no brewery event');
  assertSane(dry);
  const park = fx.plan(q, { extra: { v4: true, events: [santaPark], familyEvents: true } });
  const day2 = park.days.find((d) => d.stops.some((s) => s.event));
  assert.ok(day2, 'the park event is planned');
  assertSane(park);
  const e = day2.stops.find((s) => s.event), lunch = day2.stops.find((s) => isMeal(s, 'midday'));
  assert.ok(e.dropIn, 'a drop-in visit');
  if (lunch) assert.ok(day2.stops.indexOf(lunch) < day2.stops.indexOf(e), 'lunch first, then the event');
  // With alcohol fine, the brewery event may still be planned (a family event), as before.
  const wet = fx.plan('3 days in Kelowna with kids 6 and 9 on November 28', { extra: { v4: true, events: [santaBrew], familyEvents: true } });
  assertSane(wet);
});

// ---- 3. First-request asks ----
test('3. "dinner and something to do" in an evening is dinner and one evening activity, in English and French', () => {
  const en = 'A cheap evening in Kelowna tonight, with dinner and something to do';
  const kinds = (t) => tr.extractTripRequirements({ text: t, taxonomy: fx.TAXONOMY }).items.filter((i) => i.kind === 'venue_kind').map((i) => i.value);
  assert.deepEqual(kinds(en), ['evening_fun']);
  const fr = frText.tripPlannerText('Une soirée pas chère à Kelowna ce soir, avec un souper et quelque chose à faire', fx.TAXONOMY);
  assert.match(fr, /something to do/);
  assert.deepEqual(kinds(fr), ['evening_fun']);
  assert.deepEqual(kinds('an activity after dinner'), ['evening_fun']);
  assert.deepEqual(kinds('things to do in Kelowna this weekend and a nice dinner'), [], 'a weekend of things to do is not one evening activity');
  assert.deepEqual(kinds('dinner then bowling tonight'), ['bowling'], 'a named kind stays itself');
  assert.deepEqual(kinds('something to do with the kids on a rainy day'), []);
  assert.equal(tr.LABELS.evening_fun, 'something to do');
  const lanes = { name: 'Lincoln Lanes', type: 'indoor', description: 'Ten-pin bowling lanes with glow bowling on weekends.' };
  assert.ok(tr.inferPlannerKinds(lanes).includes('evening_fun'));
  assert.ok(!tr.inferPlannerKinds({ name: 'Kelowna Museum', type: 'indoor', description: 'Local history exhibits.' }).includes('evening_fun'));
  assert.ok(!tr.inferPlannerKinds({ name: 'Bowl Me Over Poke', type: 'restaurant', description: 'Bowling-themed poke.' }).includes('evening_fun'), 'only an indoor place');
});

test('3. "coming from Vancouver" is where they come from, never Vancouver Pizza Kitchen', () => {
  const body = /function tripFullVenueNames\(text, taxonomy\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  assert.ok(body.includes("if (m && !m[1] && /\\b(?:from|depuis|de)\\s+(?:the\\s+)?$/i.test(out.slice(0, m.index))) continue;"));
  assert.ok(/\b(?:from|depuis|de)\s+(?:the\s+)?$/i.test('two friends, coming from ') && !/\b(?:from|depuis|de)\s+(?:the\s+)?$/i.test('lunch at '));
});

test('3. what was asked for and could not be included is one top-level list (plan.notIncluded)', () => {
  const body = /const V4_TYPE_WORDS = [\s\S]*?\nfunction v4NotIncluded\(plan\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  const fn = new Function('require', 'REGION_LABELS', `${body}; return v4NotIncluded;`)((m) => (m === './trip-requirements' ? tr : require(m)), { kelowna: 'Kelowna', osoyoos: 'Osoyoos' }); // eslint-disable-line no-new-func
  const plan = {
    overview: { regions: [{ slug: 'osoyoos', label: 'Osoyoos' }] },
    warnings: ['Nothing matching spa was available in Osoyoos.', 'No spa could be fitted into this plan.'],
    requirementResults: [
      { id: 'r1', kind: 'venue_kind', value: 'spa', strength: 'must', status: 'unmet', optionalAlternatives: [{ id: 7, name: 'Thermal Spa', region: 'kelowna', url: '/kelowna/indoor/thermal-spa', reasonCode: 'different_region' }] },
      { id: 'r2', kind: 'type', value: 'restaurant', strength: 'must', status: 'satisfied' },
      { id: 'r3', kind: 'venue_kind', value: 'bowling', strength: 'prefer', status: 'unmet' },
    ],
  };
  fn(plan);
  assert.equal(plan.notIncluded.length, 1);
  const n = plan.notIncluded[0];
  assert.deepEqual({ kind: n.kind, label: n.label, reason: n.reason, town: n.town }, { kind: 'spa', label: 'spa', reason: 'none_listed', town: 'Osoyoos' });
  assert.equal(n.nearest.name, 'Thermal Spa');
  assert.equal(n.text, 'There’s no spa listed in Osoyoos, so this plan has none. The nearest is Thermal Spa in Kelowna.');
  const fitted = { overview: { regions: [{ label: 'Kelowna' }] }, warnings: [], requirementResults: [{ kind: 'type', value: 'winery', strength: 'must', status: 'unmet' }] };
  fn(fitted);
  assert.equal(fitted.notIncluded[0].text, 'I couldn’t fit a winery into this plan.');
  const fine = { requirementResults: [{ kind: 'type', value: 'winery', strength: 'must', status: 'satisfied' }] };
  fn(fine);
  assert.equal(fine.notIncluded, undefined);
  assert.ok(SRC.includes('v4NotIncluded(plan);'));
});

// ---- 4. One-slot wants ----
test('4. a Swap that asks for a kind is judged on that kind, not on the kinds the first request named', () => {
  const pool = fx.add({ name: 'Kelowna Aquatic Centre', region: 'kelowna', type: 'indoor', rating: 4.6, desc: 'An indoor swimming pool with a lazy river.', hours: fx.open('06:00', '21:00'), features: { kid_friendly: true } });
  const arcade = fx.add({ name: 'Planet Fun Arcade', region: 'kelowna', type: 'indoor', rating: 4.5, desc: 'An arcade with laser tag and virtual reality.', hours: fx.open('11:00', '22:00'), features: { kid_friendly: true }, dLat: 0.004 });
  const theatre = fx.add({ name: 'Old Town Theatre', region: 'kelowna', type: 'indoor', rating: 4.9, desc: 'A live theatre.', dLat: 0.001 });
  try {
    const q = '2 days in Kelowna with kids 6 and 9, need a place with a pool on November 28';
    const first = fx.plan(q, { extra: { v4: true } });
    assert.ok(first.days.some((d) => d.stops.some((s) => s.venue && s.venue.id === pool.id)), 'the pool is planned');
    const pins = (p, except) => { const o = {}; for (const d of p.days) for (const s of d.stops) if (s.venue && `${d.day}-${s.daypart}` !== except) o[`${d.day}-${s.daypart}`] = s.venue.id; return o; };
    const day = first.days.find((d) => !d.stops.some((s) => s.venue && s.venue.id === pool.id)) || first.days[0];
    const slot = ['afternoon', 'late', 'morning'].map((x) => `${day.day}-${x}`).find((k) => { const s = day.stops.find((x) => `${day.day}-${x.daypart}` === k); return !s || !s.venue || !['restaurant', 'pub'].includes(s.venue.type); });
    const p = fx.plan(q, { extra: { v4: true, pinned: pins(first, slot), swap: { key: slot, type: 'indoor', want: 'indoor' } } });
    assert.ok(!p.swapMissed, 'something indoors is found');
    const got = p.days.find((d) => d.day === day.day).stops.find((s) => `${day.day}-${s.daypart}` === slot);
    assert.ok(got && got.venue && got.venue.type === 'indoor' && got.venue.id !== pool.id, got && got.venue && got.venue.name);
    // After dinner: a thing to do must be open then by its listed hours, and a place to play comes first.
    const night = fx.plan(q, { extra: { v4: true, pinned: pins(first, '1-night'), swap: { key: '1-night', type: 'indoor', want: 'activity' } } });
    const after = night.days[0].stops.find((s) => s.daypart === 'night');
    assert.ok(after && after.venue, 'an activity after dinner');
    assert.equal(after.venue.id, arcade.id, 'the arcade (open until 10 PM), never the theatre with no listed hours');
  } finally { for (const x of [pool, arcade, theatre]) fx.FACTS.splice(fx.FACTS.indexOf(x), 1); }
});

// ---- 5. No car ----
test('5. "no car" on a trip of days keeps to the base town with short hops, not a 1.5 km walking tour', () => {
  const q = '3 days in Kelowna, wineries and good food, no car';
  const req = tr.extractTripRequirements({ text: q, taxonomy: fx.TAXONOMY });
  assert.ok(req.items.some((i) => i.kind === 'transport'));
  const input = tp.v4NoCarInput({ v4: true, text: q, intent: { days: 3 }, requirements: req });
  assert.ok(input.noCar && !input.requirements.items.some((i) => i.kind === 'transport'));
  assert.deepEqual(input.requirements.items.filter((i) => i.noCar).map((i) => [i.kind, i.value]), [['distance', tp.V4_NO_CAR_KM]]);
  const keep = (text, days, v4 = true) => { const r = tr.extractTripRequirements({ text, taxonomy: fx.TAXONOMY }); return tp.v4NoCarInput({ v4, text, intent: { days }, requirements: r }).requirements.items.some((i) => i.kind === 'transport'); };
  assert.ok(keep('3 days in Kelowna on foot, wineries', 3), 'asked to walk: the walking plan stays');
  assert.ok(keep('dinner and drinks in Kelowna tonight, no car', 1), 'one evening: as before');
  assert.ok(keep(q, 3, false), 'not V4: as before');
  const p = fx.plan(q, { extra: { v4: true } });
  assert.deepEqual(p.noCar, { maxKm: tp.V4_NO_CAR_KM });
  assert.match(p.notes[0], /^No car: every stop is in or right by your base town/);
  assert.ok(!(p.warnings || []).some((w) => /walking itinerary|car-free/i.test(w)), JSON.stringify(p.warnings));
  assert.ok(p.days.every((d) => d.stops.every((s) => !s.venue || s.venue.region === 'kelowna')));
  assert.ok(p.days.every((d) => d.stops.filter((s) => s.venue).length >= 3), 'full days');
});

// ---- 6. Children's ages ----
test('6. each child\'s age as typed goes to the stay (one per child, twins twice)', () => {
  const cases = [
    ['3 days in penticton with kids 6 and 9, we don t drink', [6, 9]],
    ['two kids, 6 and 9', [6, 9]],
    ['our kids are 6 and 9', [6, 9]],
    ['kids ages 6, 9 and 12', [6, 9, 12]],
    ['kids aged 6 and 9', [6, 9]],
    ['kids 7 and 7', [7, 7]],
    ['twins aged 7', [7, 7]],
    ['with a 10 year old and a 6 year old', [6, 10]],
    ['nos enfants de 8 et 11 ans', [8, 11]],
    ['2 kids 3 days', []],
    ['dinner with the kids at 6 pm', []],
    ['3 kids and 2 adults', []],
  ];
  for (const [q, want] of cases) assert.deepEqual(tp.requestKidAgeList(q), want, q);
  assert.deepEqual(tp.requestKidAges('kids 7 and 7'), [7], 'the planner\'s own list stays unique');
  assert.ok(/requestKidAgeList\(words\.replace\(\/-\/g, ' '\)\);\n\s+if \(ages\.length && \(stayIn\.kids === undefined \|\| stayIn\.kids === ages\.length\)\)/.test(SRC), 'also when the party control already says how many kids');
});

test('3. the day a trip starts is not a day of its own: "next Friday, a hike and a nice dinner" is asked of the trip', () => {
  const q = '2 days in Kelowna next Friday, two friends, a hike and a nice dinner';
  const d = require('../discovery-intent.js');
  const intent = d.interpretDiscoveryQuery(q, fx.TAXONOMY);
  const req = tr.extractTripRequirements({ text: q, intent, taxonomy: fx.TAXONOMY, referenceDate: '2026-11-22' });
  req.startDate = '2026-11-27'; // a Friday
  assert.ok(req.items.some((i) => i.weekday === 'fri'), 'the request scopes its asks to Friday');
  const out = tp.v4MealDaypartInput({ v4: true, text: q, intent: { ...intent, days: 2, when: { weekday: 'friday', daypart: 'evening' } }, requirements: req });
  assert.ok(!out.requirements.items.some((i) => i.weekday), 'no Friday-only asks');
  assert.deepEqual(out.intent.when, { weekday: 'friday' }, 'and Friday is not an evening-only day');
  // A day inside the trip ("dinner on Saturday" on a Friday start) keeps its day; a typed evening keeps the evening.
  const sat = tp.v4MealDaypartInput({ v4: true, text: q, intent: { days: 2 }, requirements: { ...req, items: req.items.map((i) => ({ ...i, weekday: i.weekday ? 'sat' : null })) } });
  assert.ok(sat.requirements.items.some((i) => i.weekday === 'sat'));
  const eve = tp.v4MealDaypartInput({ v4: true, text: '2 days in Kelowna from Friday evening', intent: { days: 2, when: { weekday: 'friday', daypart: 'evening' } }, requirements: { items: [] } });
  assert.equal(eve.intent.when.daypart, 'evening');
  assert.equal(tp.v4MealDaypartInput({ text: q, intent: { days: 2, when: { daypart: 'evening' } }, requirements: req }).requirements, req, 'not V4: unchanged');
  assert.ok(/const none = \(\(plan && plan\.notIncluded\) \|\| \[\]\)\.filter\(\(n\) => n\.reason === 'none_listed'\);/.test(SRC), 'a kind the town does not list is planned around');
});
